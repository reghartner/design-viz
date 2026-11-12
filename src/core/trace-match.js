/* #1413: a trace `attributes` value is a scalar (exact, ===) or an object with exactly one operator:
   {"startsWith"|"endsWith"|"contains": "<non-empty text>"} or {"in": ["<text>", …]} (a non-empty list of
   text). Operators compare text attribute values only. Anything else is malformed: the validator warns and
   the attribute never matches (fail closed, never match-all). Shared by the matcher, the validator and the
   Workbench forms. */
var TRACE_ATTRIBUTE_OPERATORS=['startsWith','endsWith','contains','in'];
function traceAttributeOperator(expected){
  if(!expected || typeof expected!=='object' || Array.isArray(expected))return null;
  var keys=Object.keys(expected);return keys.length===1 && TRACE_ATTRIBUTE_OPERATORS.indexOf(keys[0])>=0?keys[0]:null;
}
// Why an attribute value cannot match, or null when it is a scalar or a well-formed operator.
function traceAttributeProblem(expected){
  if(['string','number','boolean'].indexOf(typeof expected)>=0)return null;
  var op=traceAttributeOperator(expected),operand=op && expected[op];
  if(op==='in' && Array.isArray(operand) && operand.length && operand.every(function(x){return typeof x==='string' && x!=='';}))return null;
  if(op && op!=='in' && typeof operand==='string' && operand!=='')return null;
  return 'use a text, number or true/false value, or one operator: {"startsWith"|"endsWith"|"contains": "<text>"} or {"in": ["<text>", …]}; this attribute matches no span';
}
function traceAttributeMatches(actual,expected){
  if(['string','number','boolean'].indexOf(typeof expected)>=0)return actual===expected;
  if(traceAttributeProblem(expected) || typeof actual!=='string')return false;
  var op=traceAttributeOperator(expected),operand=expected[op];
  if(op==='startsWith')return actual.indexOf(operand)===0;
  if(op==='endsWith')return actual.length>=operand.length && actual.lastIndexOf(operand)===actual.length-operand.length;
  if(op==='contains')return actual.indexOf(operand)>=0;
  return operand.indexOf(actual)>=0;
}
// Every key of `expected` matches the span attributes `actual` (an object or undefined).
function traceAttributesMatch(actual,expected){
  var have=actual && typeof actual==='object'?actual:{};
  return Object.keys(expected || {}).every(function(k){return Object.prototype.hasOwnProperty.call(have,k) && traceAttributeMatches(have[k],expected[k]);});
}
/* Pure exact FlowCanon matching. Node and browser share this implementation.
   An omitted path keeps the historical first-path API; a supplied path is exact. */
var FlowTraceMatch = (function(){
  const numeric=v=>v!==null && v!=='' && v!==undefined && Number.isFinite(Number(v)) ? Number(v) : null;
  const truth=v=>v===true || v==='true' || v===1;
const object=v=>!!v && typeof v==='object' && !Array.isArray(v),own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
/* The carriers a step lights directly: its delivered edges (edge/edges less dropped or blocked
   failures, as stepDeliveredKeys in src/core/paths.js) and its nodes. Endpoints are not lit. */
function litCarriers(step){
  const keys=[],failures=object(step.failures)?step.failures:{};
  if(typeof step.edge==='string')keys.push(step.edge);
  if(Array.isArray(step.edges))step.edges.forEach(k=>{if(typeof k==='string' && !keys.includes(k))keys.push(k);});
  return {edges:keys.filter(k=>!(own(failures,k) && (failures[k]==='dropped' || failures[k]==='blocked'))),nodes:Array.isArray(step.nodes)?step.nodes.filter(n=>typeof n==='string'):[]};
}
// Wall-clock time several intervals cover, overlaps counted once.
function unionMs(intervals){
  const list=intervals.filter(i=>Number.isFinite(i.startMs) && Number.isFinite(i.durationMs)).sort((a,b)=>a.startMs-b.startMs);
  if(!list.length)return null;
  let total=0,start=list[0].startMs,end=start+list[0].durationMs;
  list.slice(1).forEach(i=>{if(i.startMs>end){total+=end-start;start=i.startMs;}end=Math.max(end,i.startMs+i.durationMs);});
  return total+end-start;
}
function baseSteps(d){
  if(!d.paths?.length)return d.steps || [];
  return d.paths[0].steps.map(id=>d.steps.find(s=>s.id===id));
}
function related(span,parentIds,byId){
  const seen=new Set(),queue=[span.parentId,...span.links];
  while(queue.length){const id=queue.shift();if(!id || seen.has(id))continue;if(parentIds.includes(id))return true;seen.add(id);const p=byId.get(id);if(p)queue.push(p.parentId,...p.links);}
  return false;
}
function mapTrace(d,trace,pathId){
  const steps=pathId===undefined?baseSteps(d):(d.paths || []).find(p=>p.id===pathId)?.steps.map(id=>d.steps.find(s=>s.id===id)) || [],results=new Map(),byId=new Map(trace.spans.map(s=>[s.id,s])),visiting=new Set(),offPath=new Set(),unattributed=new Set();
  // Spans matching the selector (service, operation, namespace, attributes), before parent and occurrence rules.
  const named=m=>trace.spans.filter(s=>s.serviceName===m.serviceName && s.operation===m.operation &&
    (!m.namespace || s.attributes['service.namespace']===m.namespace) &&
    traceAttributesMatch(s.attributes,m.attributes));
  // #1290 whole-branch review: results and sharing are keyed by the step itself, never by its id,
  // so id-less steps and steps sharing an id each get their own result. Messages name an id-less step
  // by its index in the diagram's steps, as the validator does.
  const stepName=st=>st && typeof st.id==='string' && st.id?st.id:String((d.steps || []).indexOf(st));
  // The step's index rides along unseen (not enumerable), so mapping output and its JSON stay as they were.
  const placed=(r,st)=>{if(r && typeof r==='object' && !Object.prototype.hasOwnProperty.call(r,'stepIndex'))Object.defineProperty(r,'stepIndex',{value:(d.steps || []).indexOf(st),enumerable:false,writable:true});};
  function match(step){
    if(results.has(step))return results.get(step);
    if(visiting.has(step.id))throw new Error('Cyclic traceMatch.parentStepId.');
    visiting.add(step.id);
    const m=step.traceMatch;
    if(!m || Array.isArray(m) && !m.length){const inherited=inherit(step);visiting.delete(step.id);placed(inherited,step);results.set(step,inherited);return inherited;}
    // Alternatives are tried in order; the first match wins. Without a match the
    // first ambiguous result is kept (it needs a selector fix), else the last
    // applicable one. An alternative whose parent step is not on this path ranks last.
    let result=null;const tried=[];
    const rank=r=>r.status==='ambiguous'?2:offPath.has(r)?0:1;
    if(Array.isArray(m))m.some((alternative,i)=>{const r=attempt(step,alternative || {},true);r.alternative=i;tried.push(r);if(r.status==='matched' || !result || rank(r)>rank(result) || rank(r)===rank(result) && rank(r)<2)result=r;return r.status==='matched';});
    else tried.push(result=attempt(step,m));
    // #1175: an optional step (optional:true on its selector, or on every alternative) may be
    // absent from a trace; missing, it is not unknown. It stays unknown when a span matching an
    // alternative's selector is present but its parent step's mapping is missing or ambiguous,
    // since nothing tells whose span it is. Matched or ambiguous is unchanged.
    if(result.status==='missing' && [].concat(m).every(a=>a && a.optional===true) && !tried.some(r=>unattributed.has(r)))Object.assign(result,{detail:'Optional, not in this trace.'+(result.detail?' '+result.detail:''),conditions:[],optional:true});
    visiting.delete(step.id);placed(result,step);results.set(step,result);return result;
  }
  // The conditions of a matched step: errors, delivery, budget on durationMs, queue, backpressure, retries.
  function conditions(result,candidates,m,durationMs,retries,database){
    const condition=(kind,label,extra={})=>result.conditions.push({kind,nodeId:m.nodeId,label,spanIds:candidates.map(s=>s.id),...extra});
    const errors=candidates.filter(s=>s.error);
    if(errors.length)condition('service-error','Service error'+(errors[0].statusCode?' · HTTP '+errors[0].statusCode:''));
    if(candidates.some(s=>truth(s.attributes['flow.delivery_failed'])))condition('delivery-failed','Delivery failed (explicit telemetry)');
    const times=candidates.map(s=>s.durationMs).filter(n=>n!==null);
    if(m.maxDurationMs!=null && durationMs!==null && durationMs>m.maxDurationMs)
      condition(database?'database-slow':'slow',(database?'Database slow':'Slow operation')+' · '+durationMs+' ms / '+m.maxDurationMs+' ms budget',{durationMs,budgetMs:m.maxDurationMs});
    if(m.maxDurationMs!=null && times.length!==candidates.length)condition('unknown','Duration not recorded; timing budget cannot be checked.');
    const depths=candidates.map(s=>numeric(s.attributes['messaging.queue.depth'] ?? s.attributes['queue.depth'])).filter(n=>n!==null && n>=0);
    if(m.maxQueueDepth!=null && !depths.length)condition('unknown','Queue depth not recorded; queue budget cannot be checked.');
    if(m.maxQueueDepth!=null && depths.length && Math.max(...depths)>m.maxQueueDepth){
      const ages=candidates.map(s=>numeric(s.attributes['messaging.message.age_ms'])).filter(n=>n!==null && n>=0);
      condition('queue-buildup','Queue buildup · '+Math.max(...depths)+' messages'+(ages.length?' · oldest '+Math.max(...ages)+' ms':''),{queueDepth:Math.max(...depths),oldestAgeMs:ages.length?Math.max(...ages):null});
    }
    if(candidates.some(s=>truth(s.attributes['flow.backpressure'])))condition('backpressure','Backpressure reported by service');
    if(retries)condition('retry',candidates.length+' recorded attempts',{attempts:candidates.length});
  }
  /* #1290: a step without traceMatch inherits the spans declared on the carriers it lights:
     its nodes' declarations and its delivered edges' own declarations (never an endpoint's).
     Without traceScope it inherits only from carriers no other step on this path lights; a
     shared carrier needs a scope, so the step stays unmapped with a hint. traceScope narrows:
     skip (span names or role:<role> per carrier), attributes, root, parentStepId (spans whose
     ancestry is not in the trace are kept, rule 7), optional and budgets. */
  let declared=null;
  const litBy=new Map();
  steps.forEach(st=>{if(!st)return;const lit=litCarriers(st);lit.nodes.map(id=>'node:'+id).concat(lit.edges.map(k=>'edge:'+k)).forEach(key=>{if(!litBy.has(key))litBy.set(key,[]);if(!litBy.get(key).includes(st))litBy.get(key).push(st);});});
  const spanName=x=>x.serviceName+' '+x.operation;
  function unknownAncestry(span){
    const seen=new Set(),queue=[span.parentId,...(span.links || [])];
    while(queue.length){const id=queue.shift();if(!id || seen.has(id))continue;seen.add(id);const p=byId.get(id);if(!p)return true;queue.push(p.parentId,...(p.links || []));}
    return false;
  }
  function inherit(step){
    const scope=object(step.traceScope)?step.traceScope:null,c=declared || (declared=carrierSpans(d,trace)),lit=litCarriers(step);
    const base={stepId:step.id,nodeId:lit.nodes.length===1 && !lit.edges.length?lit.nodes[0]:null,spans:[],conditions:[],detail:'',inherited:true};
    let used=lit.nodes.filter(id=>c.nodes[id]).map(id=>({kind:'node',id,list:c.nodes[id]})).concat(lit.edges.filter(k=>c.edges[k]).map(k=>({kind:'edge',id:k,list:c.edges[k]})));
    // An unmapped step annotates nothing, as before.
    if(!used.length)return Object.assign(base,{status:'unmapped',inherited:false,nodeId:null});
    const others=x=>(litBy.get(x.kind+':'+x.id) || []).filter(st=>st!==step).map(stepName),notes=[];
    if(!scope){
      const shared=used.filter(x=>others(x).length);used=used.filter(x=>!others(x).length);
      if(!used.length){const o=others(shared[0]);return Object.assign(base,{status:'unmapped',nodeId:null,shared:{kind:shared[0].kind,id:shared[0].id,steps:o},hint:shared[0].id+' is also lit by '+(o.length>1?'steps ':'step ')+o.join(', ')+'; add a trace scope to this step to choose its spans.'});}
      if(shared.length)notes.push(shared.map(x=>x.id).join(', ')+(shared.length>1?' are':' is')+' also lit by other steps; add a trace scope to inherit '+(shared.length>1?'their':'its')+' spans.');
    }
    const skip=scope && object(scope.skip)?scope.skip:{},roles=[];let spans=[];
    // An edge step owns only its edge's send spans; a declared receive, like the receiving
    // node's process spans, only times the hand-off (so it never collides with that node's step).
    used.forEach(x=>{const list=Array.isArray(skip[x.id])?skip[x.id]:[];x.list.forEach(dc=>{if(x.kind==='edge' && dc.role!=='send' || list.includes(dc.key) || list.includes('role:'+dc.role))return;roles.push(dc.role);dc.spans.forEach(sp=>{if(!spans.includes(sp))spans.push(sp);});});});
    if(scope && object(scope.attributes))spans=spans.filter(sp=>traceAttributesMatch(sp.attributes,scope.attributes));
    if(scope && object(scope.root)){
      const roots=trace.spans.filter(sp=>!sp.parentId && !(sp.links || []).some(id=>byId.has(id))).sort((a,b)=>a.startMs-b.startMs);
      if(!roots.length)notes.push('The trace\'s root span is not in this trace, so the root was not checked.');
      else if(!roots.some(r=>r.serviceName===scope.root.serviceName && r.operation===scope.root.operation))
        return Object.assign(base,{status:'missing',notThisFlow:true,detail:'Not this flow: this trace starts at '+spanName(roots[0])+', not '+scope.root.serviceName+' '+scope.root.operation+'.'});
    }
    let unclear=false;
    if(scope && scope.parentStepId){
      const parent=steps.find(x=>x && x.id===scope.parentStepId);
      if(!parent){spans=[];notes.push('Parent step '+scope.parentStepId+' is not on this path.');}
      else{
        const mapped=match(parent);
        if(mapped.status!=='matched'){unclear=spans.length>0;spans=[];notes.push('Parent mapping is unavailable.');}
        else{
          const parents=mapped.spans.map(p=>p.id),lost=[];
          spans=spans.filter(sp=>{if(related(sp,parents,byId))return true;if(unknownAncestry(sp)){lost.push(sp);return true;}return false;});
          if(lost.length)notes.push(lost.length+(lost.length===1?' span\'s ancestry is':' spans\' ancestry is')+' not in this trace ('+lost.map(spanName).join(', ')+'); '+(lost.length===1?'it was':'they were')+' kept.');
        }
      }
    }
    const result=Object.assign(base,{status:unclear?'ambiguous':spans.length?'matched':'missing',spans,detail:notes.join(' ')});
    if(result.status==='matched'){
      // An edge step's time is its hand-off; a node step's the union of its spans.
      let durationMs=null;
      if(!lit.nodes.some(id=>c.nodes[id]) && used.every(x=>x.kind==='edge')){
        const intervals=[];
        used.forEach(x=>{
          const edge=(d.edges || []).find(e=>e && e.from+'->'+e.to===x.id),own=x.list.filter(dc=>dc.role==='receive');
          const sends=[].concat(...x.list.filter(dc=>dc.role==='send').map(dc=>dc.spans)).filter(sp=>spans.includes(sp));
          const receivers=own.length?[].concat(...own.map(dc=>dc.spans)):edge?[].concat(...(c.nodes[edge.to] || []).filter(dc=>dc.role==='process').map(dc=>dc.spans)):[];
          handoffs(trace,sends,receivers).forEach(p=>{if(p.receive)intervals.push({startMs:p.send.startMs,durationMs:Math.max(0,p.receive.startMs-p.send.startMs)});});
        });
        durationMs=intervals.length?unionMs(intervals):unionMs(spans);
        // #1290: no receiver paired, so the time (and any budget) is the send span's own, not a hand-off.
        if(!intervals.length)result.detail=(result.detail?result.detail+' ':'')+'No receiving span pairs with the send span, so its own time is shown, not a hand-off.';
      }else durationMs=unionMs(spans);
      result.durationMs=durationMs;
      conditions(result,spans,{maxDurationMs:scope?scope.maxDurationMs:undefined,maxQueueDepth:scope?scope.maxQueueDepth:undefined,nodeId:result.nodeId},durationMs,false,roles.length>0 && roles.every(r=>r==='database'));
    }else if(result.status==='missing' && scope && scope.optional===true)Object.assign(result,{optional:true,detail:'Optional, not in this trace.'+(result.detail?' '+result.detail:'')});
    else result.conditions.push({kind:result.status==='missing'?'unknown':'ambiguous',nodeId:result.nodeId,label:result.status==='missing'?'Not observed · outcome unknown':'Ambiguous span mapping',spanIds:[]});
    return result;
  }
  function attempt(step,m,alternative){
    let candidates=named(m);
    let detail='',off=false,unclear=false;
    if(m.parentStepId){
      const parent=steps.find(s=>s.id===m.parentStepId);if(!parent && !alternative)throw new Error('Unknown parent step '+m.parentStepId);
      const mapped=parent && match(parent);
      if(!parent){off=true;candidates=[];detail='Parent step '+m.parentStepId+' is not on this path.';}
      else if(mapped.status!=='matched'){unclear=candidates.length>0;candidates=[];detail='Parent mapping is unavailable.';}
      else candidates=candidates.filter(s=>related(s,mapped.spans.map(p=>p.id),byId));
    }
    if(m.occurrence && candidates.length){
      candidates.sort((a,b)=>a.startMs-b.startMs);
      // Ordinal matching is safe only for serial, fully timed calls. Concurrent
      // siblings require attributes or a parent/link selector, not array order.
      const serial=candidates.every((s,i)=>s.startMs!==null && s.durationMs!==null && (!i || s.startMs>=candidates[i-1].startMs+candidates[i-1].durationMs && s.startMs>candidates[i-1].startMs));
      if(serial)candidates=candidates[m.occurrence-1]?[candidates[m.occurrence-1]]:[];
      else detail='Concurrent or untimed calls cannot be selected by occurrence.';
    }
    const attempts=candidates.map(s=>numeric(s.attributes['retry.attempt']));
    const retries=m.repeat==='attempts' && candidates.length>1 && attempts.every(n=>n!==null && Number.isInteger(n) && n>=0) && new Set(attempts).size===attempts.length && new Set(candidates.map(s=>s.parentId)).size===1;
    const status=detail && candidates.length || candidates.length>1 && !retries ? 'ambiguous' : candidates.length?'matched':'missing';
    const result={stepId:step.id,nodeId:m.nodeId || null,status,detail,spans:candidates,conditions:[]};
    if(status==='matched'){
      const times=candidates.map(s=>s.durationMs).filter(n=>n!==null);
      conditions(result,candidates,m,times.length?Math.max(...times):null,retries,m.role==='database' || candidates.some(s=>s.attributes['db.system'] || s.attributes['db.system.name']));
    }else result.conditions.push({kind:status==='missing'?'unknown':'ambiguous',nodeId:m.nodeId,label:status==='missing'?'Not observed · outcome unknown':'Ambiguous span mapping',spanIds:candidates.map(s=>s.id)});
    if(off)offPath.add(result);if(unclear)unattributed.add(result);
    return result;
  }
  const mapped=steps.map(match),owners=new Map();
  for(const item of mapped.filter(r=>r.status==='matched'))for(const span of item.spans){if(!owners.has(span.id))owners.set(span.id,[]);owners.get(span.id).push(item);}
  // One span in two steps' sets makes both ambiguous; nothing goes to the earlier step. With an
  // inheriting step involved, the condition names the span and the other step (#1290).
  const shared=new Set();for(const items of owners.values())if(items.length>1)items.forEach(item=>shared.add(item));
  for(const item of shared){
    const span=item.spans.find(sp=>owners.get(sp.id).length>1),with_=owners.get(span.id).filter(x=>x!==item);
    const label=item.inherited || with_.some(x=>x.inherited)?spanName(span)+' is also matched by '+(with_.length>1?'steps ':'step ')+with_.map(x=>x.stepId || String(x.stepIndex)).join(', ')+'; add a trace scope (root, parent step or attributes) to separate them.':'One span matches multiple authored steps; refine the selectors.';
    item.status='ambiguous';item.conditions=[{kind:'ambiguous',nodeId:item.nodeId,label,spanIds:item.spans.map(s=>s.id)}];
  }
  const used=new Set(mapped.filter(r=>r.status==='matched').flatMap(r=>r.spans.map(s=>s.id)));
  return {steps:mapped,unmatched:trace.spans.filter(s=>!used.has(s.id)).map(s=>({id:s.id,serviceName:s.serviceName,operation:s.operation})),warnings:trace.warnings};
}
/* The authored selector behind one mapTrace step result: the alternative that
   produced it when traceMatch is an array. */
function selector(step,result){
  const m=step && step.traceMatch;
  return Array.isArray(m)?m[result && result.alternative || 0] || null:m || null;
}
/* #1290: spans declared on nodes and edges (trace.spans). A declaration matches spans of its
   serviceName by exact operation, by operationPrefix, or, with neither, by its attributes;
   namespace and attributes narrow every mode. Declarations describe carriers, so one span may
   match several. notRecorded names declared attributes that no span of that service
   (and operation) records at all, so the reader can tell "not recorded" from "not here". */
function carrierSpans(d,trace){
  const out={nodes:{},edges:{}},own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
  const object=v=>!!v && typeof v==='object' && !Array.isArray(v);
  function declarations(value){
    const spans=object(value) && object(value.trace) && object(value.trace.spans)?value.trace.spans:{};
    return Object.keys(spans).filter(key=>object(spans[key])).map(key=>{
      const m=spans[key],attrs=object(m.attributes)?m.attributes:{};
      const named=trace.spans.filter(s=>s.serviceName===m.serviceName &&
        (own(m,'operation')?s.operation===m.operation:own(m,'operationPrefix')?typeof s.operation==='string' && s.operation.startsWith(m.operationPrefix):true) &&
        (!m.namespace || (s.attributes || {})['service.namespace']===m.namespace));
      const matched=named.filter(s=>traceAttributesMatch(s.attributes,attrs));
      return {key,role:m.role,spans:matched,notRecorded:named.length?Object.keys(attrs).filter(k=>named.every(s=>(s.attributes || {})[k]===undefined)):[]};
    });
  }
  Object.keys(object(d.nodes)?d.nodes:{}).forEach(id=>{const list=declarations(d.nodes[id]);if(list.length)out.nodes[id]=list;});
  (Array.isArray(d.edges)?d.edges:[]).forEach(e=>{if(!object(e))return;const list=declarations(e);if(list.length)out.edges[e.from+'->'+e.to]=list;});
  return out;
}
/* #1290: pair a connection's send spans with its receiving spans, sends in start order and
   each receiver used once. A send's receiver is the earliest candidate that descends from it
   (parent chain or links, any depth). Failing that, a single candidate with no known ancestry
   (its parent not in the trace, and no link to a span in it) that starts at or after the send
   pairs as `orphan`. A candidate whose known ancestry leads elsewhere never pairs. */
function handoffs(trace,sends,receivers){
  const byId=new Map(trace.spans.map(s=>[s.id,s])),used=new Set();
  const descends=(span,ancestor)=>{
    const seen=new Set(),queue=[span.parentId,...(span.links || [])];
    while(queue.length){const id=queue.shift();if(!id || seen.has(id))continue;if(id===ancestor.id)return true;seen.add(id);const p=byId.get(id);if(p)queue.push(p.parentId,...(p.links || []));}
    return false;
  };
  const unknown=s=>!(s.parentId && byId.has(s.parentId)) && !(s.links || []).some(id=>byId.has(id));
  const order=(a,b)=>a.startMs-b.startMs;
  return sends.slice().sort(order).map(send=>{
    const open=receivers.filter(r=>!used.has(r.id) && r.id!==send.id).sort(order);
    let receive=open.find(r=>descends(r,send)) || null,orphan=false;
    if(!receive){const loose=open.filter(r=>unknown(r) && r.startMs>=send.startMs);if(loose.length===1){receive=loose[0];orphan=true;}}
    if(receive)used.add(receive.id);
    return {send,receive,orphan};
  });
}
/* #1290: what a reference approval digests for one step (D20). A step with traceMatch digests it
   as before; a step that inherits digests its traceScope and the declarations of every declared
   carrier it lights (shared or not), plus, for a connection, the receiving node's process
   declarations that time its hand-off. A step with neither digests {id, traceMatch:null}, as before. */
function effectiveSelector(d,step,steps){
  if(step.traceMatch)return {id:step.id,traceMatch:step.traceMatch};
  const lit=litCarriers(step),carriers=[],declared=v=>object(v) && object(v.trace) && object(v.trace.spans)?v.trace.spans:null;
  lit.nodes.forEach(id=>{const spans=declared((d.nodes || {})[id]);if(spans)carriers.push({node:id,spans});});
  lit.edges.forEach(key=>{
    const edge=(d.edges || []).find(e=>e && e.from+'->'+e.to===key);if(!edge)return;
    const spans=declared(edge),to=declared((d.nodes || {})[edge.to]) || {},receiver={};
    // The receiving node's process spans time the hand-off only when the edge declares no receive of its own.
    const ownReceive=spans && Object.keys(spans).some(k=>object(spans[k]) && spans[k].role==='receive');
    if(!ownReceive)Object.keys(to).forEach(k=>{if(object(to[k]) && to[k].role==='process')receiver[k]=to[k];});
    if(spans || Object.keys(receiver).length)carriers.push({edge:key,spans:spans || {},receiver});
  });
  const out={id:step.id,traceMatch:null};
  if(object(step.traceScope))out.traceScope=step.traceScope;
  if(carriers.length){
    out.carriers=carriers;
    // The outcome of the shared-carrier rule (D9): which carriers it inherits from. Another step that
    // starts lighting one of them changes it, even when that step's own selector does not change.
    const others=(steps || []).filter(s=>s && s!==step).map(litCarriers);
    const sharedWith=(kind,id)=>others.some(l=>(kind==='node'?l.nodes:l.edges).includes(id));
    out.inherits=carriers.filter(c=>object(step.traceScope) || !sharedWith(c.node?'node':'edge',c.node || c.edge)).map(c=>c.node || c.edge);
  }
  return out;
}
return {baseSteps:baseSteps,mapTrace:mapTrace,selector:selector,carrierSpans:carrierSpans,handoffs:handoffs,effectiveSelector:effectiveSelector};
})();
