/* Shared, pure runtime evidence validation for standalone and native hosts.
   No connector discovery, networking, persistence or numeric proof behavior. */
var TELEMETRY_EVIDENCE_BYTES=1048576;
function telemetryEvidenceJson(raw){
  var nodes=0,chars=0,active=new Set();
  function invalid(){throw new Error('Runtime evidence JSON is invalid or exceeds its bounds.');}
  function walk(value,depth){
    if(++nodes>50000 || depth>24)invalid();
    if(value===null || typeof value==='boolean')return value;
    if(typeof value==='number'){if(!isFinite(value))invalid();return value;}
    if(typeof value==='string'){chars+=value.length;if(chars>TELEMETRY_EVIDENCE_BYTES)invalid();return value;}
    if(!value || typeof value!=='object' || active.has(value) || Object.getOwnPropertySymbols(value).length)invalid();
    var array=Array.isArray(value),proto=Object.getPrototypeOf(value);
    if(!array && proto!==null && Object.getPrototypeOf(proto)!==null)invalid();
    var keys=Object.keys(value);if(keys.length>50000-nodes)invalid();
    if(array && keys.length!==value.length)invalid();
    active.add(value);var out=array?[]:Object.create(null);
    keys.forEach(function(key,index){
      if(array && key!==String(index))invalid();
      if(['__proto__','prototype','constructor'].indexOf(key)>=0)invalid();
      chars+=key.length;if(chars>TELEMETRY_EVIDENCE_BYTES)invalid();
      var descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor || !telemetryOwn(descriptor,'value'))invalid();
      out[key]=walk(descriptor.value,depth+1);
    });active.delete(value);return out;
  }
  var copy=walk(raw,0),text=JSON.stringify(copy);
  if(text.length>TELEMETRY_EVIDENCE_BYTES || new TextEncoder().encode(text).byteLength>TELEMETRY_EVIDENCE_BYTES)invalid();
  return copy;
}
var TELEMETRY_TRACE_CANDIDATES=20,TELEMETRY_TRACE_SPANS=200;
// Includes the exact operational keys used by tools/canon/traces.mjs; no wildcard attributes.
var TELEMETRY_TRACE_ATTRS=['service.name','resource.service.name','service.namespace','service.version','deployment.environment.name','deployment.environment','db.system.name','messaging.queue.depth','queue.depth','messaging.message.age_ms','flow.backpressure','flow.delivery_failed','retry.attempt','flow.step.id','http.route','http.request.method','http.method','http.response.status_code','http.status_code','rpc.service','rpc.method','rpc.system','db.system','db.operation','db.operation.name','messaging.system','messaging.destination.name','messaging.operation','messaging.operation.type','span.kind','status.code','error','exception.type','meta.signal_type','meta.annotation_type'];
function telemetryTraceFail(message){var e=new Error(message);e.code='trace_unobserved';throw e;}
function telemetryTraceString(v){return typeof v==='string' && v.length>0 && v.length<=512 && !/https?:\/\/mcp\.honeycomb\.io\/query_results\//.test(v);}
function telemetryTraceId(v){return typeof v==='string' && /^[0-9a-f]{16,32}$/i.test(v);}
function telemetryTraceTime(v){return typeof v==='string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?(?:Z|[+-]\d\d:\d\d)$/.test(v) && isFinite(Date.parse(v))?v:null;}
function telemetryTraceInstantNs(v){var m=/^(.*T\d\d:\d\d:\d\d)(?:\.(\d{1,9}))?(Z|[+-]\d\d:\d\d)$/.exec(v);return BigInt(Date.parse(m[1]+m[3]))*1000000n+BigInt((m[2] || '').padEnd(9,'0'));}
function telemetryTraceAttrs(v){var out={};if(!telemetryObject(v))return out;TELEMETRY_TRACE_ATTRS.forEach(function(k){var x=v[k];if(typeof x==='boolean' || telemetryNumber(x) || telemetryTraceString(x))out[k]=x;});return out;}
function telemetryTraceUrl(v,provider){
  if(typeof v!=='string' || v.length>8192)return null;
  try{var u=new URL(v);if(provider==='honeycomb' && (u.hostname!=='ui.honeycomb.io' || u.port || u.hash || /^\/(?:img|query_results)(?:\/|$)/.test(u.pathname)))return null;return u.protocol==='https:' && !u.username && !u.password && !/(?:query_results|trace_results)\//.test(u.pathname)?u.href:null;}catch(e){return null;}
}
function telemetryTraceCandidate(id,time,duration,status){
  if(!telemetryTraceId(id))telemetryTraceFail('Invalid returned trace ID.');
  var out={traceId:id,status:['passing','failing'].indexOf(status)>=0?status:'unknown'};
  if(time!==undefined && time!==null && time!==''){if(!telemetryTraceTime(time))telemetryTraceFail('Invalid candidate timestamp.');out.time=time;}
  if(duration!==undefined){if(!telemetryNumber(duration) || duration<0)telemetryTraceFail('Invalid candidate duration.');out.durationMs=duration;}
  return out;
}
function telemetryTraceCandidates(rows){
  if(rows.length>TELEMETRY_TRACE_CANDIDATES)telemetryTraceFail('Too many trace candidates; selection unavailable.');
  var seen=Object.create(null),out=[];rows.forEach(function(c){if(seen[c.traceId]){if(JSON.stringify(seen[c.traceId])!==JSON.stringify(c))telemetryTraceFail('Conflicting duplicate trace candidates.');return;}seen[c.traceId]=c;out.push(c);});return out;
}
/* Canonical envelope validation is shared by provider output and telemetrySample.
   Never silently truncate spans/candidates and claim a complete trace. */
function telemetryTraceEnvelope(value){
  var v=telemetryEvidenceJson(value);
  if(!telemetryObject(v) || v.version!==1 || ['honeycomb','tempo'].indexOf(v.provider)<0 || !telemetryTraceId(v.traceId) || !telemetryTraceString(v.signal) || !telemetryTraceString(v.selectionReason) || !telemetryTraceString(v.selectionToken) || !telemetryTraceTime(v.observedAt) || !v.range || !telemetryTraceTime(v.range.from) || !telemetryTraceTime(v.range.to) || Date.parse(v.range.from)>Date.parse(v.range.to) || ['complete','partial','unknown'].indexOf(v.completeness)<0 || !Array.isArray(v.spans) || v.spans.length>TELEMETRY_TRACE_SPANS || !Array.isArray(v.candidates) || !Array.isArray(v.warnings) || v.warnings.length>30 || v.warnings.some(function(w){return !telemetryTraceString(w);}))telemetryTraceFail('Invalid exemplar envelope.');
  var out={version:1,provider:v.provider,traceId:v.traceId,signal:v.signal,selectionReason:v.selectionReason,selectionToken:v.selectionToken,observedAt:v.observedAt,range:{from:v.range.from,to:v.range.to},completeness:v.completeness,warnings:v.warnings.slice(),spans:[],candidates:telemetryTraceCandidates(v.candidates.map(function(c){var x=telemetryTraceCandidate(c.traceId,c.time,c.durationMs,c.status),url=telemetryTraceUrl(c.url,v.provider);if(url)x.url=url;return x;}))};
  if(!out.candidates.some(function(c){return c.traceId===v.traceId;}))telemetryTraceFail('Selected trace is not a returned candidate.');
  var url=telemetryTraceUrl(v.url,v.provider);if(url)out.url=url;
  var ids=Object.create(null);v.spans.forEach(function(s){
    if(!telemetryObject(s) || !telemetryTraceId(s.id) || ids[s.id] || s.parentId!==null && !telemetryTraceId(s.parentId) || !telemetryTraceString(s.name) || !telemetryTraceString(s.service) || !telemetryNumber(s.startMs) || s.startMs<0 || !telemetryNumber(s.ms) || s.ms<0 || s.startMs+s.ms>86400000 || typeof s.error!=='boolean' || !telemetryTraceTime(s.time))telemetryTraceFail('Duplicate ID or invalid trace span/time.');
    var span={id:s.id,parentId:s.parentId,name:s.name,service:s.service,startMs:s.startMs,ms:s.ms,error:s.error,time:s.time,attributes:telemetryTraceAttrs(s.attributes),events:[],links:[]};
    if(s.events!==undefined && (!Array.isArray(s.events) || s.events.length>32) || s.links!==undefined && (!Array.isArray(s.links) || s.links.length>32))telemetryTraceFail('Span events/links exceed bounds.');
    (s.events || []).forEach(function(e){if(!telemetryTraceString(e.name) || !telemetryNumber(e.timeMs))telemetryTraceFail('Invalid span event.');span.events.push({name:e.name,timeMs:e.timeMs,attributes:telemetryTraceAttrs(e.attributes)});});
    (s.links || []).forEach(function(l){if(!telemetryTraceId(l.traceId) || !telemetryTraceId(l.spanId))telemetryTraceFail('Invalid span link.');span.links.push({traceId:l.traceId,spanId:l.spanId,attributes:telemetryTraceAttrs(l.attributes)});});
    ids[s.id]=span;out.spans.push(span);
  });
  out.spans.forEach(function(s){var visited=new Set(),p=s;while(p){if(visited.has(p.id))telemetryTraceFail('Trace contains a parent cycle.');visited.add(p.id);if(p.parentId && !ids[p.parentId]){out.completeness='partial';if(out.warnings.indexOf('Missing parent spans.')<0)out.warnings.push('Missing parent spans.');}p=ids[p.parentId];}});
  if(!out.spans.length){out.completeness='partial';if(out.warnings.indexOf('Trace timeline unavailable.')<0)out.warnings.push('Trace timeline unavailable.');}
  return out;
}
