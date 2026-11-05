/* Runtime-only provider exemplars. Pinned native contracts and transport limits:
   docs/provider-traces.md. No authored fields, query inference or numeric proof.
   Only the first explicit trace signal in authored order is selected per carrier. */
var TELEMETRY_TRACE_SESSION=0;
function telemetryTraceIntent(s){return s && (s.source==='tempo' || s.source==='honeycomb' && telemetryObject(s.query) && telemetryOwn(s.query,'query_spec'));}
function telemetryTraceJobs(bindings){return (bindings || []).map(function(b){var name=Object.keys(b.signals || {}).find(function(n){return telemetryTraceIntent(b.signals[n]);});return name?{id:b.id,name:name,signal:b.signals[name],binding:b}:null;}).filter(Boolean);}
function telemetryTraceText(result){
  if(result && result.isError)telemetryTraceFail('Trace tool returned an error.');
  var text=typeof (result && result.payload)==='string'?result.payload:(result && Array.isArray(result.content)?result.content:[]).filter(function(c){return c && c.type==='text' && typeof c.text==='string';}).map(function(c){return c.text;}).join('\n');
  if(text.length>TELEMETRY_HONEYCOMB_BYTES || new TextEncoder().encode(text).byteLength>TELEMETRY_HONEYCOMB_BYTES)telemetryTraceFail('Trace response exceeds the byte limit.');return text;
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
function telemetryHoneycombTrace(result,id){
  var text=telemetryTraceText(result),meta=telemetryTraceMeta(text);
  if(meta.trace_id!==id)telemetryTraceFail('Returned trace ID differs from requested candidate.');
  var rows=telemetryTraceTable(text,['span_id','parent_id','start_unix_ns','duration_ns','kind','status_code','error','http_status','service','route','name']);
  var spans=rows.filter(function(r){return !r.annotation_type && !r.link_span_id && !r.link_trace_id;});
  var warnings=[],complete='unknown',total=Number(meta.total_spans),visible=Number(meta.visible_spans),collapsed=Number(meta.collapsed_nodes);
  if(collapsed>0 || total>visible || rows.some(function(r){return r.is_collapsed==='true';}) || ['focused','compact'].indexOf(meta.view_mode)>=0){complete='partial';warnings.push('Provider returned a partial or collapsed trace.');}
  else if([total,visible,collapsed].every(function(n){return Number.isSafeInteger(n) && n>=0;}) && visible===spans.length && total===visible && collapsed===0 && meta.view_mode==='full')complete='complete';
  if(complete==='unknown')warnings.push('Trace completeness unknown.');
  if(rows.length!==spans.length)warnings.push('Annotation/log/link rows excluded from the span timeline.');
  if(!spans.length)telemetryTraceFail('No timed spans returned.');
  var starts=spans.map(function(r){if(!/^\d{1,22}$/.test(r.start_unix_ns) || !/^\d{1,22}$/.test(r.duration_ns))telemetryTraceFail('Invalid exact nanosecond timing.');return BigInt(r.start_unix_ns);}),base=starts.reduce(function(a,b){return a<b?a:b;});
  var normalized=spans.map(function(r,i){var offset=starts[i]-base,duration=BigInt(r.duration_ns);if(offset>86400000000000n || duration>86400000000000n)telemetryTraceFail('Trace timing exceeds bounds.');
    return {id:r.span_id,parentId:r.parent_id || null,service:r.service,name:r.name,startMs:Number(offset)/1e6,ms:Number(duration)/1e6,time:telemetryTime(Number(starts[i]/1000000n)),error:r.error==='true' || r.status_code==='ERROR' || /^5\d\d$/.test(r.http_status),attributes:telemetryTraceAttrs({'service.name':r.service,'http.route':r.route,'span.kind':r.kind,'status.code':r.status_code,error:r.error==='true','http.status_code':r.http_status}),events:[],links:[]};
  });
  telemetryTraceCheckSpans(normalized);
  if(normalized.length>TELEMETRY_TRACE_SPANS){normalized=[];complete='partial';warnings.push('More than 200 spans; trace timeline unavailable.');}
  return {spans:normalized,completeness:complete,warnings:warnings,url:telemetryTraceUrl(meta.trace_link,'honeycomb')};
}
function telemetryTempoTrace(result,id){
  var raw=telemetryTraceJson(result),text=telemetryTraceText(result),secondary=null;try{secondary=JSON.parse(text);}catch(e){}
  if(raw.traceId!==id || secondary && secondary.traceId && secondary.traceId!==id)telemetryTraceFail('Returned trace ID differs from requested candidate.');
  var flat=[];if(Array.isArray(raw.services))raw.services.forEach(function(s){if(!s || !Array.isArray(s.spans))telemetryTraceFail('Invalid Tempo service.');s.spans.forEach(function(p){flat.push({span:p,service:s.serviceName,structured:false});});});
  else if(Array.isArray(raw.spans))raw.spans.forEach(function(p){flat.push({span:p,service:p.serviceName,structured:true});});
  else telemetryTraceFail('Unsupported Tempo trace shape.');
  if(!flat.length || flat.length>10000)telemetryTraceFail('Tempo trace span count unavailable.');
  var base=Infinity;flat.forEach(function(x){if(!telemetryNumber(x.span.startTimeMs) || !telemetryNumber(x.span.durationMs))telemetryTraceFail('Invalid Tempo timing.');base=Math.min(base,x.span.startTimeMs);});
  var native=Object.create(null);if(secondary && Array.isArray(secondary.services))secondary.services.forEach(function(s){(s.spans || []).forEach(function(p){native[p.spanId]=p;});});
  var spans=flat.map(function(x){var p=x.span,extra=native[p.id] || {};return {id:x.structured?p.id:p.spanId,parentId:(x.structured?p.parentId:p.parentSpanId) || null,service:x.service,name:p.name,startMs:p.startTimeMs-base,ms:p.durationMs,time:telemetryTime(p.startTimeMs),error:p.status==='error' || (p.events || []).some(function(e){return e.name==='exception';}),attributes:telemetryTraceAttrs(p.attributes),events:p.events || [],links:p.links || extra.links || []};});
  telemetryTraceCheckSpans(spans);
  var partial=raw.partial===true || secondary && secondary.partial===true,warnings=[];
  // No completeness guarantee is inferred from the presence of structuredContent.
  var completeness=partial?'partial':'unknown';warnings.push(partial?'Provider returned a partial trace.':'Trace completeness unknown.');
  var message=raw.message || secondary && secondary.message;if(typeof message==='string' && message.length<=400)warnings.push(message.replace(/https?:\/\/\S+/g,'[link omitted]'));
  if(spans.length>TELEMETRY_TRACE_SPANS){spans=[];completeness='partial';warnings.push('More than 200 spans; trace timeline unavailable.');}
  return {spans:spans,completeness:completeness,warnings:warnings,url:telemetryTraceUrl(raw.grafanaUrl,'tempo')};
}
function telemetryTraceInput(tool,input){
  var schema=tool && tool.inputSchema,p=schema && schema.properties;
  if(!schema || schema.type!=='object' || !p || Object.keys(input).some(function(k){return !p[k] || !p[k].type;}) || !telemetryHoneycombSchema(input,schema))telemetryTraceFail('Unsupported native trace tool input schema.');return input;
}
function telemetryTraceContract(list,source){
  var names=source==='tempo'?['search_tempo_traces','get_tempo_trace']:['run_query','get_trace'],preferred=source==='tempo'?'Grafana':'Honeycomb';
  var found=telemetryGrafanaListed(list).map(function(s){var server=s && (s.server || s.name),tools=s && s.tools || [],a=tools.find(function(t){return t.name===names[0];}),b=tools.find(function(t){return t.name===names[1];});return typeof server==='string' && a && b?{server:server,search:a,detail:b}:null;}).filter(Boolean);
  return found.find(function(c){return c.server===preferred;}) || found[0] || null;
}
function telemetryTraceInputs(job,config,contract,range,id){
  var q=job.signal.query,input;
  if(job.signal.source==='tempo'){
    input={datasourceUid:config.grafana.tempo,start:range.from,end:range.to};
    if(!telemetryTraceString(input.datasourceUid) || typeof q!=='string')telemetryTraceFail('Set an explicit Tempo datasource and TraceQL query.');
    if(id)input.trace_id=id;else {input.query=q;input.limit=TELEMETRY_TRACE_CANDIDATES;input.spss=3;}
  }else{
    if(!telemetryTraceString(config.honeycomb.environment) || !telemetryTraceString(config.honeycomb.dataset))telemetryTraceFail('Set an explicit Honeycomb environment and dataset.');
    input={environment_slug:config.honeycomb.environment};
    if(id){input.trace_id=id;input.from=config.window;var view=contract.detail.inputSchema && contract.detail.inputSchema.properties && contract.detail.inputSchema.properties.view_mode;if(view && view.type==='string' && (!view.enum || view.enum.indexOf('full')>=0))input.view_mode='full';}
    else{
      if(!telemetryObject(q) || Object.keys(q).some(function(k){return ['query_spec','raw_row_columns','results_limit'].indexOf(k)<0;}) || !telemetryObject(q.query_spec) || !Array.isArray(q.raw_row_columns) || q.raw_row_columns.length>30 || q.raw_row_columns.indexOf('trace.trace_id')<0 || q.raw_row_columns.some(function(k){return !telemetryTraceString(k);}) || !Number.isInteger(q.results_limit) || q.results_limit<1 || q.results_limit>TELEMETRY_TRACE_CANDIDATES)telemetryTraceFail('Use an explicit native Honeycomb raw-row wrapper with trace.trace_id and results_limit 1–20.');
      var spec=telemetryHoneycombJson(q.query_spec);['from','to','start','end','start_time','end_time','time_range'].forEach(function(k){delete spec[k];});spec.from=config.window;
      var prop=contract.search.inputSchema && contract.search.inputSchema.properties && contract.search.inputSchema.properties.query_spec;
      if(!prop || ['object','string'].indexOf(prop.type)<0)telemetryTraceFail('Unsupported query_spec type.');
      input.dataset_slug=config.honeycomb.dataset;input.query_spec=prop.type==='string'?JSON.stringify(spec):spec;input.raw_row_columns=q.raw_row_columns.slice();input.results_limit=q.results_limit;
    }
  }
  return telemetryTraceInput(id?contract.detail:contract.search,input);
}
function createTelemetryTraces(page,win,now,bound){
  if(!trackingTelemetry(page || {}).enabled || !win || !win.claude || typeof win.claude.use!=='function' || !(bound?bound():telemetryTraceJobs(telemetryHoneycombBindings(page)).length))return null;
  var session=++TELEMETRY_TRACE_SESSION,ctl=null,current=page,clock=now || Date.now,epoch=0,serial=0,retired=false,namespace=null,contracts={},entries=new Map(),abort=new AbortController(),off=null,contractKey=null;
  function invalidate(){epoch++;abort.abort();abort=new AbortController();entries.clear();}
  function active(e){return !retired && e===epoch && ctl && ctl.telemetry.enabled() && !abort.signal.aborted;}
  async function discover(){
    var e=epoch;if(!namespace)namespace=Promise.resolve(win.claude.use('mcp'));var mcp=await namespace;if(e!==epoch || retired || !ctl)telemetryTraceFail('Trace session cancelled.');var list=await mcp.listTools();if(e!==epoch || retired || !ctl)telemetryTraceFail('Trace session cancelled.');
    var next={},jobs=telemetryTraceJobs(ctl.telemetry.bindings()),config=trackingTelemetry(current),to=clock(),range={from:new Date(to-telemetryGrafanaWindowMs(config.window)).toISOString(),to:new Date(to).toISOString()};
    jobs.forEach(function(job){var c=telemetryTraceContract(list,job.signal.source);if(c)try{telemetryTraceInputs(job,config,c,range);telemetryTraceInputs(job,config,c,range,'00000000000000000000000000000000');next[job.signal.source]=c;}catch(e){}});
    var key=JSON.stringify(next);if(contractKey!==null && key!==contractKey)invalidate();contractKey=key;contracts=next;ctl.telemetry.setAvailable(Object.keys(next).length>0);return mcp;
  }
  function fail(error){
    if(error && error.code==='user_changed'){retired=true;invalidate();if(ctl && ctl.telemetry.accountChanged)ctl.telemetry.accountChanged();}
    else if(error && ['capability_removed','server_not_connected','server_not_found','not_granted','capability_disabled','needs_reauth'].indexOf(error.code)>=0){invalidate();contracts={};if(ctl)ctl.telemetry.setAvailable(false);}
    // Provider text may contain signed transport URLs. Never report it verbatim.
    return new Error(error && error.code==='trace_unobserved'?error.message:'Trace evidence unavailable; check the explicit query, returned shape and connector permissions.');
  }
  async function detail(entry,candidate,reason){
    if(!active(entry.epoch))telemetryTraceFail('Trace session cancelled.');
    if(entry.details.has(candidate.traceId))return entry.details.get(candidate.traceId);
    var request=(async function(){
      var result=await entry.mcp.callTool(entry.contract.server,entry.contract.detail.name,telemetryTraceInputs(entry.job,entry.config,entry.contract,entry.range,candidate.traceId),{signal:abort.signal});
      if(!active(entry.epoch))telemetryTraceFail('Trace session cancelled.');
      var trace=entry.job.signal.source==='tempo'?telemetryTempoTrace(result,candidate.traceId):telemetryHoneycombTrace(result,candidate.traceId);
      return telemetryTraceEnvelope({version:1,provider:entry.job.signal.source,traceId:candidate.traceId,signal:entry.job.name,selectionReason:reason+'; first explicit trace signal in authored order',selectionToken:entry.token,observedAt:new Date(clock()).toISOString(),range:entry.range,candidates:entry.candidates,spans:trace.spans,completeness:trace.completeness,warnings:entry.warnings.concat(trace.warnings),url:trace.url || candidate.url || null});
    })();entry.details.set(candidate.traceId,request);return request;
  }
  async function load(job,mcp,config){
    var key=JSON.stringify([job.binding,config]),entry=entries.get(job.id);if(entry && entry.key===key)return entry.promise;
    var to=clock();entry={key:key,epoch:epoch,job:job,config:config,contract:contracts[job.signal.source],mcp:mcp,range:{from:new Date(to-telemetryGrafanaWindowMs(config.window)).toISOString(),to:new Date(to).toISOString()},token:'trace-'+session+'-'+epoch+'-'+(++serial),details:new Map(),candidates:[],warnings:[],selected:null};entries.set(job.id,entry);
    entry.promise=(async function(){
      if(!entry.contract)telemetryTraceFail('Required trace tools unavailable.');
      var result=await mcp.callTool(entry.contract.server,entry.contract.search.name,telemetryTraceInputs(job,config,entry.contract,entry.range),{signal:abort.signal});if(!active(entry.epoch))telemetryTraceFail('Trace session cancelled.');
      var found=job.signal.source==='tempo'?telemetryTempoCandidates(result):telemetryHoneycombCandidates(result);entry.candidates=found.candidates;entry.warnings=found.warnings;if(found.range)entry.range=found.range;
      var chosen=telemetryTraceSelect(entry.candidates);if(!chosen.candidate)return null;
      entry.selected=await detail(entry,chosen.candidate,chosen.reason);return entry.selected;
    })();return entry.promise;
  }
  async function provider(bindings,signal,report){
    var map=Object.create(null),notes=[];if(signal.aborted || retired)return map;
    var mcp;try{mcp=await discover();}catch(e){throw fail(e);}var e=epoch,config=trackingTelemetry(current);
    for(var job of telemetryTraceJobs(bindings)){
      if(signal.aborted || !active(e))break;
      try{var envelope=await load(job,mcp,config);if(signal.aborted || !active(e))break;var saved=entries.get(job.id);if(envelope)map[job.id]={signals:{},exemplars:[saved.selected || envelope]};}
      catch(error){notes.push(fail(error).message);}
    }
    if(report && report.note)report.note(notes.length?notes[0]:'');return map;
  }
  async function choose(id,token,traceId){
    var entry=entries.get(id);if(!entry || entry.token!==token || !active(entry.epoch) || entry.key!==JSON.stringify([ctl.telemetry.bindings().find(function(b){return b.id===id;}),trackingTelemetry(current)]))telemetryTraceFail('Trace selection expired.');
    var candidate=entry.candidates.find(function(c){return c.traceId===traceId;});if(!candidate)telemetryTraceFail('Choose an actual returned trace candidate.');
    // Revalidate metadata on explicit actions, including cached alternatives.
    try{await discover();if(!active(entry.epoch))telemetryTraceFail('Trace selection expired.');var attempt=entry.attempt=(entry.attempt || 0)+1,value=await detail(entry,candidate,'explicit user selection');if(!active(entry.epoch) || attempt!==entry.attempt)telemetryTraceFail('Trace selection replaced.');entry.selected=Object.assign({},value,{selectionReason:'explicit user selection; first explicit trace signal in authored order'});return entry.selected;}catch(e){throw fail(e);}
  }
  return {options:{provider:provider,chooseExemplar:choose,available:false,source:'Traces'},attach:function(next,nextPage){
    ctl=next;current=nextPage || current;invalidate();var mine=ctl;discover().catch(function(e){if(ctl===mine){fail(e);if(ctl===mine)ctl.telemetry.setAvailable(false);}});
    off=ctl.telemetry.onChange(function(s){if(!s.enabled && entries.size)invalidate();});
    return {destroy:function(){if(ctl!==mine)return;invalidate();if(off)off();off=null;ctl=null;namespace=null;}};
  }};
}
