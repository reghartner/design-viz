import C from './core.cjs';
import {digest} from './drift.mjs';
const own=(v,k)=>Object.prototype.hasOwnProperty.call(v,k);
const numeric=v=>v!==null && v!=='' && v!==undefined && Number.isFinite(Number(v)) ? Number(v) : null;
const truth=v=>v===true || v==='true' || v===1;
const list=v=>Array.isArray(v)?v:[];
const select=(v,...keys)=>keys.map(k=>v[k]).find(x=>x!==undefined && x!==null);

// Only allowlisted operational metadata is retained. Bodies, headers, payloads,
// user identifiers and arbitrary span attributes never enter a portable spec.
const attributes=['service.namespace','service.version','deployment.environment.name','deployment.environment',
  'http.response.status_code','http.status_code','db.system','db.system.name','messaging.queue.depth','queue.depth',
  'messaging.message.age_ms','flow.backpressure','flow.delivery_failed','retry.attempt','flow.step.id'];
export function normalizeTrace(raw){
  const rows=Array.isArray(raw)?raw:raw?.spans || raw?.events;
  if(!Array.isArray(rows) || !rows.length || rows.length>10000)throw new Error('Expected 1–10,000 Honeycomb events or normalized spans.');
  const ids=new Set(),traceIds=new Set(),warnings=[];
  const spans=rows.filter(row=>!['span_event','link','log'].includes(row?.data?.['meta.annotation_type'] || row?.['meta.annotation_type'])).map((row,index)=>{
    const d=row?.data || row;
    if(!d || typeof d!=='object')throw new Error('Invalid span at '+index);
    const a={...(d.attributes || {}),...d},id=String(select(a,'spanId','span_id','trace.span_id','id') || '');
    const traceId=String(select(a,'traceId','trace_id','trace.trace_id') || raw.traceId || '');
    if(!id || ids.has(id))throw new Error('Every span requires a unique span ID.');
    if(!traceId)throw new Error('Every span requires a trace ID.');
    ids.add(id);traceIds.add(traceId);
    const serviceName=String(select(a,'serviceName','service.name') || ''),operation=String(select(a,'operation','name') || '');
    if(!serviceName || !operation)throw new Error('Every span requires service.name and name (or serviceName and operation).');
    let startMs=numeric(a.startMs),durationMs=numeric(select(a,'durationMs','duration_ms'));
    const timestamp=select(a,'timestamp','time') ?? row.time;
    if(startMs===null && typeof timestamp==='string')startMs=Number.isFinite(Date.parse(timestamp))?Date.parse(timestamp):null;
    if(durationMs!==null && durationMs<0)throw new Error('Negative span duration.');
    const kept={};for(const key of attributes)if(own(a,key) && ['string','number','boolean'].includes(typeof a[key]))kept[key]=a[key];
    const statusCode=numeric(select(a,'http.response.status_code','http.status_code','statusCode'));
    const error=truth(a.error) || a.status==='ERROR' || a.status?.code===2 || a.status?.code==='ERROR' || (statusCode!==null && statusCode>=400);
    const links=list(a.links).map(l=>typeof l==='string'?{spanId:l,traceId}:l).filter(l=>l && String(l.traceId || l.trace_id || traceId)===traceId).map(l=>String(l.spanId || l.span_id || '')).filter(Boolean);
    return {id,traceId,parentId:String(select(a,'parentId','parent_id','trace.parent_id') || ''),serviceName,operation,startMs,durationMs,error,statusCode,attributes:kept,links};
  });
  if(!spans.length || traceIds.size!==1)throw new Error('Import exactly one trace at a time.');
  for(const s of spans)if(s.parentId && !ids.has(s.parentId))warnings.push('Parent of '+s.id+' is not present; trace may be partial.');
  const envs=[...new Set(spans.map(s=>s.attributes['deployment.environment.name'] || s.attributes['deployment.environment']).filter(Boolean))];
  const versions={};for(const s of spans)if(s.attributes['service.version']){
    const key=(s.attributes['service.namespace'] || '')+'/'+s.serviceName;
    if(versions[key] && versions[key]!==s.attributes['service.version'])warnings.push('Mixed versions for '+key+'.');
    versions[key]=s.attributes['service.version'];
  }
  return {version:1,traceId:[...traceIds][0],sourceUrl:C.http(raw.sourceUrl),context:{environment:envs.length===1?envs[0]:null,versions},spans,warnings};
}
const baseSteps=d=>C.traceMatch.baseSteps(d);
export function mapTrace(d,trace,pathId){return C.traceMatch.mapTrace(d,trace,pathId);}
export function referencePreview(spec,raw,section=0){
  const d=C.sections(spec)[section]?.diagram;if(!d)throw new Error('Diagram section not found.');
  const steps=baseSteps(d);if(!steps.length || steps.some(s=>!s || typeof s.id!=='string' || !s.id) || new Set(steps.map(s=>s.id)).size!==steps.length)throw new Error('Give every baseline step a stable unique ID before attaching trace evidence.');
  const trace=normalizeTrace(raw),mapping=mapTrace(d,trace),measured=mapping.steps.filter(s=>s.status!=='unmapped');
  const errors=C.validateSpec(spec).errors || [];if(errors.length)throw new Error(errors.join('\n'));
  const eligible=measured.length>0 && measured.every(s=>s.status==='matched' && !s.conditions.length);
  return {trace,mapping,eligible,reason:eligible?'Review the mapping, then approve this reference.':'Every instrumented step must map uniquely and satisfy authored budgets before reference approval.'};
}
export function approveReference(spec,raw,{section=0,reason,actor='local reviewer',at=new Date().toISOString()}={}){
  if(!reason?.trim())throw new Error('Reference approval requires a reason.');
  const preview=referencePreview(spec,raw,section);if(!preview.eligible)throw new Error(preview.reason);
  const out=C.clone(spec),d=C.sections(out)[section].diagram;
  d.referenceTrace={version:1,trace:preview.trace,mapping:preview.mapping.steps.filter(s=>s.status!=='unmapped').map(s=>({stepId:s.stepId,spanIds:s.spans.map(p=>p.id)})),
    contract:digest(baseSteps(d).map(s=>({id:s.id,traceMatch:s.traceMatch || null}))),approval:{actor,reason:reason.trim(),at}};
  return out;
}
export function compareTrace(spec,raw,{section=0,label='Incident trace'}={}){
  const original=C.sections(spec)[section]?.diagram;if(!original?.referenceTrace?.approval)throw new Error('Approve a reference trace first.');
  const base=baseSteps(original),reference=original.referenceTrace;
  if(reference.contract!==digest(base.map(s=>({id:s.id,traceMatch:s.traceMatch || null}))))throw new Error('Trace mappings changed; approve the reference again.');
  const trace=normalizeTrace(raw),mapping=mapTrace(original,trace),warnings=[...mapping.warnings];
  const env=reference.trace.context.environment;
  if(env && trace.context.environment && env!==trace.context.environment)throw new Error('Environment differs from the reference; select a comparable trace.');
  if(!env || !trace.context.environment)warnings.push('Environment is not fully recorded; comparability is unverified.');
  for(const [key,version] of Object.entries(reference.trace.context.versions))if(trace.context.versions[key] && trace.context.versions[key]!==version)warnings.push('Service version changed: '+key+' '+version+' → '+trace.context.versions[key]);
  const first=mapping.steps.findIndex(s=>s.conditions.length),out=C.clone(spec),d=C.sections(out)[section].diagram;
  const result={trace,mapping,warnings,firstDivergence:first<0?null:base[first].id,spec:out,pathId:null};
  if(mapping.unmatched.length)warnings.push(mapping.unmatched.length+' unmatched span(s); inspect them before drawing conclusions.');
  if(first<0)return result;
  const suffix=digest([trace,reference.contract]).slice(0,10),pathId='incident-'+suffix;
  if((d.paths || []).some(p=>p.id===pathId))throw new Error('This incident is already present. Compare against the canonical spec.');
  if(!d.paths?.length)d.paths=[{id:'happy',label:'Happy path',color:'#38bdf8',steps:base.map(s=>s.id)}];
  const ids=base.slice(0,first).map(s=>s.id),existing=new Set(d.steps.map(s=>s.id));
  for(let i=first;i<base.length;i++){
    const originalStep=base[i],evidence=mapping.steps[i],id=originalStep.id+'-'+suffix;
    if(existing.has(id))throw new Error('Incident step ID collision.');
    // No copied success patches beyond the fork: a server span cannot prove a
    // notification appeared, a door opened, or a physical device started recording.
    const step={id,text:(evidence.status==='unmapped'?'Uninstrumented step · outcome unknown':evidence.conditions.length?evidence.conditions.map(c=>c.label).join('; '):'Observed '+originalStep.traceMatch.serviceName+' · '+originalStep.traceMatch.operation),
      conditions:C.clone(evidence.conditions),nodes:evidence.nodeId?[evidence.nodeId]:[],
      codeRefs:C.clone(originalStep.codeRefs || []),evidence:{traceId:trace.traceId,spanIds:evidence.spans.map(s=>s.id),canonicalStepId:originalStep.id,status:evidence.status}};
    if(trace.sourceUrl)step.link=trace.sourceUrl;
    if(evidence.status==='unmapped')step.conditions=[{kind:'unknown',label:'Uninstrumented · outcome unknown',spanIds:[]}];
    // A received 500 is an observed call; only explicit failed delivery draws a broken edge.
    if(evidence.status==='matched' && originalStep.edge){
      if(evidence.conditions.some(c=>c.kind==='delivery-failed'))step.failures={[originalStep.edge]:'dropped'};
      else step.edge=originalStep.edge;
    }
    const queue=evidence.conditions.find(c=>c.kind==='queue-buildup'),panelId=originalStep.traceMatch?.panelId;
    if(queue && panelId && d.panels?.some(p=>p.id===panelId && p.type==='queue'))step.panels={[panelId]:{state:'held',reason:'Last measured · '+queue.label+(evidence.conditions.some(c=>c.kind==='backpressure')?' · backpressure':'')}};
    if(evidence.nodeId)step.tone={[evidence.nodeId]:evidence.conditions.some(c=>['service-error','delivery-failed'].includes(c.kind))?'alert':evidence.conditions.length?'warn':'ok'};
    d.steps.push(step);ids.push(id);
  }
  d.paths.push({id:pathId,label:String(label).slice(0,100),color:'#f97316',steps:ids});d.autoplay=false;
  // A portable evidence record accompanies the overlay, leaving the approved baseline intact.
  d.incidents=(d.incidents || []).concat({pathId,traceId:trace.traceId,referenceTraceId:reference.trace.traceId,sourceUrl:trace.sourceUrl,warnings,unmatched:mapping.unmatched,firstDivergence:base[first].id,
    note:'Shared prefix follows the authored baseline. Uninstrumented actions are not independently verified. After the fork, only observed calls are animated; physical/user outcomes require review.'});
  result.pathId=pathId;return result;
}
