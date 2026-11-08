/* Registered, versioned response decoders shared by native and portable hosts.
   Provenance and limitations: docs/provider-traces.md. No provider transport. */
function telemetryTraceErrorText(error){
  var value=typeof error==='string'?error:error && typeof error.message==='string'?error.message:error && typeof error.payload==='string'?error.payload:error && Array.isArray(error.content)?error.content.slice(0,8).filter(function(c){return c && c.type==='text' && typeof c.text==='string';}).map(function(c){return c.text.slice(0,2048);}).join(' '):'';
  return value.slice(0,16384).replace(/(?:https?:\/\/|honeycomb:\/\/)\S+/gi,'[link omitted]')
    .replace(/\b(Bearer|Basic)\s+\S+/gi,'$1 [redacted]')
    .replace(/((?:x-honeycomb-team|api[_-]?key|access[_-]?token|refresh[_-]?token|token|password|secret|authorization|cookie|credential)["']?\s*[=:]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,'$1[redacted]')
    .replace(/\b[A-Za-z0-9_+\/-]{40,}(?:\.[A-Za-z0-9_+\/-]+)*={0,2}/g,'[opaque value omitted]')
    .replace(/[\x00-\x1f\x7f]/g,' ').slice(0,400).trim();
}
function telemetryTraceText(result){
  if(result && result.isError)telemetryTraceFail(telemetryTraceErrorText(result) || 'Trace tool returned an error.');
  var text=typeof (result && result.payload)==='string'?result.payload:(result && Array.isArray(result.content)?result.content:[]).filter(function(c){return c && c.type==='text' && typeof c.text==='string';}).map(function(c){return c.text;}).join('\n');
  if(text.length>TELEMETRY_EVIDENCE_BYTES || new TextEncoder().encode(text).byteLength>TELEMETRY_EVIDENCE_BYTES)telemetryTraceFail('Trace response exceeds the byte limit.');return text;
}
function telemetryTraceJson(result){
  var text=telemetryTraceText(result),raw=result && (result.structuredContent || (telemetryObject(result.payload)?result.payload:null));
  if(!raw){try{raw=JSON.parse(text);}catch(e){telemetryTraceFail('Unsupported trace JSON.');}}
  return telemetryEvidenceJson(raw);
}
/* Exact Markdown cells only. Escaped pipes are rejected, never shifted into a
   different column; annotations are rows, not spans. Signed links never escape. */
function telemetryTraceTable(text,required,section){
  var lines=text.split('\n'),begin=section?lines.findIndex(function(l){return l.replace(/^ResultTool response/,'').trim()===section;}):0;
  if(begin<0)telemetryTraceFail('Missing trace table section.');
  var header=-1,keys;
  for(var i=begin;i<lines.length;i++){var l=lines[i].replace(/^ResultTool response/,'').trim();if(l[0]!=='|')continue;var fields=l.slice(1,-1).split('|').map(function(s){return s.trim();});if(required.every(function(k){return fields.indexOf(k)>=0;})){header=i;keys=fields;break;}}
  if(header<0 || new Set(keys).size!==keys.length || !/^\s*\|(?:\s*:?-+:?\s*\|)+\s*$/.test(lines[header+1] || ''))telemetryTraceFail('Unsupported trace table header.');
  var rows=[];for(i=header+2;i<lines.length && /^\s*\|/.test(lines[i]);i++){
    if(rows.length>=10000 || /\\\|/.test(lines[i]))telemetryTraceFail('Trace table exceeds bounds or has ambiguous cells.');
    var cells=lines[i].trim().slice(1,-1).split('|').map(function(s){return s.trim();});if(cells.length!==keys.length)telemetryTraceFail('Malformed trace table row.');
    var row=Object.create(null);keys.forEach(function(k,j){row[k]=cells[j];});rows.push(row);
  }return rows;
}
function telemetryTraceMeta(text){
  var out={},names=['trace_id','trace_link','total_spans','visible_spans','collapsed_nodes','view_mode','from','to','next_cursor'];
  names.forEach(function(k){var re=new RegExp('^  '+k+': (.+)$','gm'),m,values=[];while((m=re.exec(text)))values.push(m[1]);if(values.length>1)telemetryTraceFail('Ambiguous trace metadata.');if(values.length){var v=values[0];out[k]=v[0]==='"'?JSON.parse(v):v;}});return out;
}
function telemetryHoneycombCandidates(result){
  var text=telemetryTraceText(result),meta=telemetryTraceMeta(text),rows=telemetryTraceTable(text,['trace.trace_id'],'# Raw Rows');
  var candidates=telemetryTraceCandidates(rows.map(function(r){
    // Rounded sample durations are not exact timeline evidence. Selection uses
    // timestamps; keep status only when actually supplied by the provider.
    var c=telemetryTraceCandidate(r['trace.trace_id'],r.timestamp,undefined,r.error==='true'?'failing':r.error==='false'?'passing':'unknown');
    var re=new RegExp('^- `'+c.traceId+'`: (https://[^\\s]+)$','m'),m=re.exec(text),url=m && telemetryTraceUrl(m[1],'honeycomb');if(url)c.url=url;return c;
  }));return {candidates:candidates,range:telemetryTraceTime(meta.from) && telemetryTraceTime(meta.to) && Date.parse(meta.from)<=Date.parse(meta.to)?{from:meta.from,to:meta.to}:null,warnings:meta.next_cursor?['More query matches exist; only returned candidates are available.']:['Candidate completeness unknown.']};
}
function telemetryTempoCandidates(result){
  var raw=telemetryTraceJson(result);if(!Array.isArray(raw.traces))telemetryTraceFail('Tempo returned no supported trace search results.');
  return {candidates:telemetryTraceCandidates(raw.traces.map(function(r){
    if(!telemetryObject(r) || !telemetryNumber(r.startTimeMs))telemetryTraceFail('Invalid Tempo search row.');
    return telemetryTraceCandidate(r.traceID,telemetryTime(r.startTimeMs),r.durationMs,'unknown');
  })),warnings:['Selection is limited to returned matches; search completeness unknown.']};
}
function telemetryTraceSelect(candidates){
  var timed=candidates.every(function(c){return c.durationMs!==undefined;}),dated=candidates.every(function(c){return !!c.time;});
  var sorted=candidates.slice().sort(function(a,b){return (timed?b.durationMs-a.durationMs:dated?(telemetryTraceInstantNs(b.time)>telemetryTraceInstantNs(a.time)?1:telemetryTraceInstantNs(b.time)<telemetryTraceInstantNs(a.time)?-1:0):0) || candidates.indexOf(a)-candidates.indexOf(b);});
  return {candidate:sorted[0],reason:timed?'slowest among returned matches':dated?'latest among returned matches':'first returned match'};
}
/* Validate the entire bounded source before applying the 200-span display cap. */
function telemetryTraceCheckSpans(spans){
  var ids=Object.create(null),done=new Set();spans.forEach(function(s){
    if(!telemetryTraceId(s.id) || ids[s.id] || s.parentId!==null && !telemetryTraceId(s.parentId) || !telemetryTraceString(s.name) || !telemetryTraceString(s.service) || !telemetryNumber(s.startMs) || s.startMs<0 || !telemetryNumber(s.ms) || s.ms<0 || s.startMs+s.ms>86400000 || !telemetryTraceTime(s.time))telemetryTraceFail('Duplicate ID or invalid source span/time.');ids[s.id]=s;
  });
  spans.forEach(function(s){var path=[],seen=new Set(),p=s;while(p && !done.has(p.id)){if(seen.has(p.id))telemetryTraceFail('Trace contains a parent cycle.');seen.add(p.id);path.push(p.id);p=ids[p.parentId];}path.forEach(function(id){done.add(id);});});
}
/* Fixed table columns, plus same-named columns for profile-allowed attributes.
   Table cells are text, so allowed attribute values are strings. */
function telemetryHoneycombAttrs(r,allowed){
  var v={'service.name':r.service,'http.route':r.route,'span.kind':r.kind,'status.code':r.status_code,error:r.error==='true','http.status_code':r.http_status};
  (Array.isArray(allowed)?allowed:[]).forEach(function(k){if(!telemetryOwn(v,k) && telemetryOwn(r,k))v[k]=r[k];});
  return telemetryTraceAttrs(v,allowed);
}
function telemetryHoneycombTrace(result,id,allowed){
  var text=telemetryTraceText(result),meta=telemetryTraceMeta(text);
  if(meta.trace_id!==id)telemetryTraceFail('Returned trace ID differs from requested candidate.');
  var rows=telemetryTraceTable(text,['span_id','parent_id','start_unix_ns','duration_ns','kind','status_code','error','http_status','service','route','name']);
  // Honeycomb adds a synthetic start-0 row when the root span was not stored; it is not a span.
  // total_spans counts it; visible_spans may or may not.
  var dropped=rows.filter(function(r){return r.span_id==='missing-root' || r.start_unix_ns==='0' && !telemetryTraceId(r.span_id) && !r.annotation_type && !r.link_span_id && !r.link_trace_id;}),placeholders=new Set(dropped.map(function(r){return r.span_id;}));
  rows=rows.filter(function(r){return dropped.indexOf(r)<0;});
  var spans=rows.filter(function(r){return !r.annotation_type && !r.link_span_id && !r.link_trace_id;});
  var warnings=[],complete='unknown',total=Number(meta.total_spans),visible=Number(meta.visible_spans),collapsed=Number(meta.collapsed_nodes);
  if(dropped.length){complete='partial';warnings.push('Root span not stored; timeline starts at the earliest stored span.');}
  if(collapsed>0 || total-dropped.length>visible || rows.some(function(r){return r.is_collapsed==='true';}) || ['focused','compact'].indexOf(meta.view_mode)>=0){complete='partial';warnings.push('Provider returned a partial or collapsed trace.');}
  else if(!dropped.length && [total,visible,collapsed].every(function(n){return Number.isSafeInteger(n) && n>=0;}) && visible===spans.length && total===visible && collapsed===0 && meta.view_mode==='full')complete='complete';
  if(complete==='unknown')warnings.push('Trace completeness unknown.');
  if(rows.length!==spans.length)warnings.push('Annotation/log/link rows excluded from the span timeline.');
  if(rows.some(function(r){return r.annotation_type==='link' || r.link_span_id || r.link_trace_id;}))warnings.push('Honeycomb link-row ownership is unverified; relationship mapping unavailable.');
  if(!spans.length)telemetryTraceFail('No timed spans returned.');
  var starts=spans.map(function(r){if(!/^\d{1,22}$/.test(r.start_unix_ns) || !/^\d{1,22}$/.test(r.duration_ns))telemetryTraceFail('Invalid exact nanosecond timing.');return BigInt(r.start_unix_ns);}),base=starts.reduce(function(a,b){return a<b?a:b;});
  var normalized=spans.map(function(r,i){var offset=starts[i]-base,duration=BigInt(r.duration_ns);if(offset>86400000000000n || duration>86400000000000n)telemetryTraceFail('Trace timing exceeds bounds.');
    return {id:r.span_id,parentId:r.parent_id && !placeholders.has(r.parent_id)?r.parent_id:null,service:r.service,name:r.name,startMs:Number(offset)/1e6,ms:Number(duration)/1e6,time:telemetryTime(Number(starts[i]/1000000n)),error:r.error==='true' || r.status_code==='ERROR' || /^5\d\d$/.test(r.http_status),attributes:telemetryHoneycombAttrs(r,allowed),events:[],links:[]};
  });
  telemetryTraceCheckSpans(normalized);
  if(normalized.length>TELEMETRY_TRACE_SPANS){normalized=[];complete='partial';warnings.push('More than 200 spans; trace timeline unavailable.');}
  return {spans:normalized,completeness:complete,warnings:warnings,url:telemetryTraceUrl(meta.trace_link,'honeycomb')};
}
/* Pinned Tempo text exposes service resource; structured spans prefix those keys
   with resource. Map only canonical context keys, with explicit span precedence. */
function telemetryTempoAttrs(attributes,resource,structured,allowed){
  var attrs=telemetryTraceAttrs(attributes,allowed),context=['service.namespace','service.version','deployment.environment.name','deployment.environment'];
  context.forEach(function(k){var v=structured?attributes && attributes['resource.'+k]:resource && resource[k];if(!telemetryOwn(attrs,k) && (typeof v==='boolean' || telemetryNumber(v) || telemetryTraceString(v)))attrs[k]=v;});return attrs;
}
function telemetryTempoTrace(result,id,allowed){
  var raw=telemetryTraceJson(result),text=telemetryTraceText(result),secondary=null;try{secondary=JSON.parse(text);}catch(e){}
  if(raw.traceId!==id || secondary && secondary.traceId && secondary.traceId!==id)telemetryTraceFail('Returned trace ID differs from requested candidate.');
  var flat=[];if(Array.isArray(raw.services))raw.services.forEach(function(s){if(!s || !Array.isArray(s.spans))telemetryTraceFail('Invalid Tempo service.');s.spans.forEach(function(p){flat.push({span:p,service:s.serviceName,resource:s.resource,structured:false});});});
  else if(Array.isArray(raw.spans))raw.spans.forEach(function(p){flat.push({span:p,service:p.serviceName,structured:true});});
  else telemetryTraceFail('Unsupported Tempo trace shape.');
  if(!flat.length || flat.length>10000)telemetryTraceFail('Tempo trace span count unavailable.');
  var base=Infinity;flat.forEach(function(x){if(!telemetryNumber(x.span.startTimeMs) || !telemetryNumber(x.span.durationMs))telemetryTraceFail('Invalid Tempo timing.');base=Math.min(base,x.span.startTimeMs);});
  var native=Object.create(null);if(secondary && Array.isArray(secondary.services))secondary.services.forEach(function(s){(s.spans || []).forEach(function(p){native[p.spanId]=p;});});
  var spans=flat.map(function(x){var p=x.span,extra=native[p.id] || {};return {id:x.structured?p.id:p.spanId,parentId:(x.structured?p.parentId:p.parentSpanId) || null,service:x.service,name:p.name,startMs:p.startTimeMs-base,ms:p.durationMs,time:telemetryTime(p.startTimeMs),error:p.status==='error' || (p.events || []).some(function(e){return e.name==='exception';}),attributes:telemetryTempoAttrs(p.attributes,x.resource,x.structured,allowed),events:p.events || [],links:p.links || extra.links || []};});
  telemetryTraceCheckSpans(spans);
  var partial=raw.partial===true || secondary && secondary.partial===true,warnings=[];
  // No completeness guarantee is inferred from the presence of structuredContent.
  var completeness=partial?'partial':'unknown';warnings.push(partial?'Provider returned a partial trace.':'Trace completeness unknown.');
  var message=raw.message || secondary && secondary.message;if(typeof message==='string' && message.length<=400)warnings.push(message.replace(/https?:\/\/\S+/g,'[link omitted]'));
  if(spans.length>TELEMETRY_TRACE_SPANS){spans=[];completeness='partial';warnings.push('More than 200 spans; trace timeline unavailable.');}
  return {spans:spans,completeness:completeness,warnings:warnings,url:telemetryTraceUrl(raw.grafanaUrl,'tempo')};
}
