/* Pure exact FlowCanon matching. Node and browser share this implementation.
   An omitted path keeps the historical first-path API; a supplied path is exact. */
var FlowTraceMatch = (function(){
  const numeric=v=>v!==null && v!=='' && v!==undefined && Number.isFinite(Number(v)) ? Number(v) : null;
  const truth=v=>v===true || v==='true' || v===1;
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
  const steps=pathId===undefined?baseSteps(d):(d.paths || []).find(p=>p.id===pathId)?.steps.map(id=>d.steps.find(s=>s.id===id)) || [],results=new Map(),byId=new Map(trace.spans.map(s=>[s.id,s])),visiting=new Set(),offPath=new Set();
  function match(step){
    if(results.has(step.id))return results.get(step.id);
    if(visiting.has(step.id))throw new Error('Cyclic traceMatch.parentStepId.');
    visiting.add(step.id);
    const m=step.traceMatch;
    if(!m || Array.isArray(m) && !m.length){visiting.delete(step.id);return {stepId:step.id,status:'unmapped',spans:[],conditions:[]};}
    // Alternatives are tried in order; the first match wins. Without a match the
    // first ambiguous result is kept (it needs a selector fix), else the last
    // applicable one. An alternative whose parent step is not on this path ranks last.
    let result=null;
    const rank=r=>r.status==='ambiguous'?2:offPath.has(r)?0:1;
    if(Array.isArray(m))m.some((alternative,i)=>{const r=attempt(step,alternative || {},true);r.alternative=i;if(r.status==='matched' || !result || rank(r)>rank(result) || rank(r)===rank(result) && rank(r)<2)result=r;return r.status==='matched';});
    else result=attempt(step,m);
    visiting.delete(step.id);results.set(step.id,result);return result;
  }
  function attempt(step,m,alternative){
    let candidates=trace.spans.filter(s=>s.serviceName===m.serviceName && s.operation===m.operation &&
      (!m.namespace || s.attributes['service.namespace']===m.namespace) &&
      Object.entries(m.attributes || {}).every(([k,v])=>s.attributes[k]===v));
    let detail='',off=false;
    if(m.parentStepId){
      const parent=steps.find(s=>s.id===m.parentStepId);if(!parent && !alternative)throw new Error('Unknown parent step '+m.parentStepId);
      const mapped=parent && match(parent);
      if(!parent){off=true;candidates=[];detail='Parent step '+m.parentStepId+' is not on this path.';}
      else if(mapped.status!=='matched'){candidates=[];detail='Parent mapping is unavailable.';}
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
      const condition=(kind,label,extra={})=>result.conditions.push({kind,nodeId:m.nodeId,label,spanIds:candidates.map(s=>s.id),...extra});
      const errors=candidates.filter(s=>s.error);
      if(errors.length)condition('service-error','Service error'+(errors[0].statusCode?' · HTTP '+errors[0].statusCode:''));
      if(candidates.some(s=>truth(s.attributes['flow.delivery_failed'])))condition('delivery-failed','Delivery failed (explicit telemetry)');
      const times=candidates.map(s=>s.durationMs).filter(n=>n!==null),durationMs=times.length?Math.max(...times):null;
      if(m.maxDurationMs!=null && durationMs!==null && durationMs>m.maxDurationMs){
        const database=m.role==='database' || candidates.some(s=>s.attributes['db.system'] || s.attributes['db.system.name']);
        condition(database?'database-slow':'slow',(database?'Database slow':'Slow operation')+' · '+durationMs+' ms / '+m.maxDurationMs+' ms budget',{durationMs,budgetMs:m.maxDurationMs});
      }
      if(m.maxDurationMs!=null && times.length!==candidates.length)condition('unknown','Duration not recorded; timing budget cannot be checked.');
      const depths=candidates.map(s=>numeric(s.attributes['messaging.queue.depth'] ?? s.attributes['queue.depth'])).filter(n=>n!==null && n>=0);
      if(m.maxQueueDepth!=null && !depths.length)condition('unknown','Queue depth not recorded; queue budget cannot be checked.');
      if(m.maxQueueDepth!=null && depths.length && Math.max(...depths)>m.maxQueueDepth){
        const ages=candidates.map(s=>numeric(s.attributes['messaging.message.age_ms'])).filter(n=>n!==null && n>=0);
        condition('queue-buildup','Queue buildup · '+Math.max(...depths)+' messages'+(ages.length?' · oldest '+Math.max(...ages)+' ms':''),{queueDepth:Math.max(...depths),oldestAgeMs:ages.length?Math.max(...ages):null});
      }
      if(candidates.some(s=>truth(s.attributes['flow.backpressure'])))condition('backpressure','Backpressure reported by service');
      if(retries)condition('retry',candidates.length+' recorded attempts',{attempts:candidates.length});
    }else result.conditions.push({kind:status==='missing'?'unknown':'ambiguous',nodeId:m.nodeId,label:status==='missing'?'Not observed · outcome unknown':'Ambiguous span mapping',spanIds:candidates.map(s=>s.id)});
    if(off)offPath.add(result);
    return result;
  }
  const mapped=steps.map(match),owners=new Map();
  for(const item of mapped.filter(r=>r.status==='matched'))for(const span of item.spans){if(!owners.has(span.id))owners.set(span.id,[]);owners.get(span.id).push(item);}
  for(const items of owners.values())if(items.length>1)for(const item of items){item.status='ambiguous';item.conditions=[{kind:'ambiguous',nodeId:item.nodeId,label:'One span matches multiple authored steps; refine the selectors.',spanIds:item.spans.map(s=>s.id)}];}
  const used=new Set(mapped.filter(r=>r.status==='matched').flatMap(r=>r.spans.map(s=>s.id)));
  return {steps:mapped,unmatched:trace.spans.filter(s=>!used.has(s.id)).map(s=>({id:s.id,serviceName:s.serviceName,operation:s.operation})),warnings:trace.warnings};
}
/* The authored selector behind one mapTrace step result: the alternative that
   produced it when traceMatch is an array. */
function selector(step,result){
  const m=step && step.traceMatch;
  return Array.isArray(m)?m[result && result.alternative || 0] || null:m || null;
}
return {baseSteps:baseSteps,mapTrace:mapTrace,selector:selector};
})();
