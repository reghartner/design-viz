/* Honeycomb metrics (#946). The hosted run_query completes the query. Its
   raw results are preferred. A bounded first Results row is a visibly rounded
   fallback only when the raw download transport is unavailable. See docs/live-status.md for
   pinned official provenance. Trace retrieval lives in telemetry-traces.js;
   selected numeric history evaluates each window directly.
   No query is inferred from a carrier name; no signed URL escapes this module. */
var TELEMETRY_HONEYCOMB_BYTES=1048576,TELEMETRY_HONEYCOMB_TIMEOUT=15000;
function telemetryHoneycombError(message,code){var e=new Error(message);e.code=code || 'query_unobserved';return e;}
/* Only bounded, redacted text reaches status UI; never echo transport links or credentials. */
function telemetryProviderErrorText(error){
  var text=typeof error==='string'?error:error && typeof error.message==='string'?error.message:error && typeof error.payload==='string'?error.payload:error && Array.isArray(error.content)?error.content.filter(function(c){return c && c.type==='text' && typeof c.text==='string';}).map(function(c){return c.text;}).join(' '):'';
  return text.replace(/(?:https?:\/\/|honeycomb:\/\/)\S+/gi,'[link omitted]').replace(/\b(Bearer|Basic)\s+\S+/gi,'$1 [redacted]').replace(/((?:x-honeycomb-team|api[_-]?key|token|password|secret|authorization)["']?\s*[=:]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,'$1[redacted]').replace(/[\x00-\x1f\x7f]/g,' ').slice(0,400).trim();
}
function telemetryProviderStepError(error,step){
  var wrapped=new Error(step+': '+(telemetryProviderErrorText(error) || 'No supported evidence returned.'));
  wrapped.code=error && error.code || 'query_unobserved';return wrapped;
}
function telemetryHoneycombJobs(bindings){
  var jobs=[];(bindings || []).forEach(function(binding){Object.keys(binding.signals || {}).forEach(function(name){
    var s=binding.signals[name];if(s.source==='honeycomb' && !(telemetryObject(s.query) && telemetryOwn(s.query,'query_spec')))jobs.push({id:binding.id,name:name,query:s.query,unit:s.unit,links:s.links || {},dashboard:binding.links && binding.links.dashboard});
  });});return jobs;
}
function telemetryHoneycombBindings(page){return telemetryBindings(function(fn){sectionRecords(page).forEach(function(record){var d=record.section.diagram || {};
  Object.keys(d.nodes || {}).forEach(function(id){fn(d.nodes[id],id,page);});
  (d.edges || []).forEach(function(edge){fn(edge,edge.from+'->'+edge.to,page);});
});});}
/* Hosted listTools is metadata-only. Schema discovery follows explicit consent;
   legacy hosts that already publish schemas retain their existing contract. */
/* Connector refusals belong to this host/page lifetime, not an adapter or
   deployment environment. Weak keys survive rerenders without retaining hosts. */
var telemetryConnectorRefusals=new WeakMap();
function telemetryConnectorRefused(claude,server){var scopes=telemetryConnectorRefusals.get(claude);return !!(scopes && scopes.has(server));}
function telemetryConnectorRefuse(claude,server){var scopes=telemetryConnectorRefusals.get(claude);if(!scopes){scopes=new Set();telemetryConnectorRefusals.set(claude,scopes);}scopes.add(server);}
function telemetrySchemaType(schema,type){var t=schema && schema.type;return t===type || Array.isArray(t) && t.indexOf(type)>=0 && t.every(function(v){return v===type || v==='null';});}
function telemetryHoneycombCandidate(list){var found=telemetryGrafanaListed(list).filter(function(c){return c && typeof (c.server || c.name)==='string' && telemetryGrafanaOffered(c).indexOf('run_query')>=0;});return found.find(function(c){return (c.server || c.name)==='Honeycomb';}) || found[0] || null;}
async function telemetryDescribeTools(claude,mcp,server,tools,active){
  if(telemetryConnectorRefused(claude,server))throw {code:'not_granted'};
  var missing=tools.filter(function(t){return !t.inputSchema;});if(!missing.length)return tools;
  function check(){if(!active())throw {code:'capability_removed'};}
  check();var permissions=await claude.use('permissions');check();
  if(!permissions || typeof permissions.request!=='function'){telemetryConnectorRefuse(claude,server);throw {code:'not_granted'};}
  var key='mcp:'+server,states=await permissions.request([key]);
  // Remember a human refusal even when its waiting refresh was cancelled.
  if(states && (states[key]==='denied' || states[key]==='unavailable'))telemetryConnectorRefuse(claude,server);
  check();
  if(!states || states[key]!=='granted')throw {code:'not_granted'};
  if(typeof mcp.describeTool!=='function')throw {code:'capability_removed'};
  var described=[];for(var tool of tools){check();var description=tool.inputSchema?tool:await mcp.describeTool(server,tool.name);check();described.push(Object.assign({},tool,description));}return described;
}
function telemetryHoneycombServer(list){
  var found=[];telemetryGrafanaListed(list).forEach(function(candidate){
    var name=candidate && (candidate.server || candidate.name);
    (candidate && Array.isArray(candidate.tools)?candidate.tools:[]).forEach(function(tool){
      var schema=tool && tool.inputSchema,p=schema && schema.properties,q=p && p.query_spec;
      if(typeof name==='string' && name && tool.name==='run_query' && schema && schema.type==='object' && p && telemetrySchemaType(p.environment_slug,'string') && (!p.dataset_slug || telemetrySchemaType(p.dataset_slug,'string')) && q && (telemetrySchemaType(q,'object') || telemetrySchemaType(q,'string')) &&
        (!schema.required || schema.required.every(function(k){return ['environment_slug','dataset_slug','query_spec'].indexOf(k)>=0;})))found.push({server:name,schema:schema,type:telemetrySchemaType(q,'object')?'object':'string'});
    });
  });return found.find(function(item){return item.server==='Honeycomb';}) || found[0] || null;
}
/* Validate the subset of JSON Schema we can honor, refusing unimplemented
   constraints rather than quietly changing a provider's declared contract. */
function telemetryHoneycombSchema(value,schema){
  if(schema===true)return true;if(!schema || schema===false || typeof schema!=='object')return false;
  var allowed=['type','properties','required','additionalProperties','items','enum','description','title','default','$schema','examples'];
  if(Object.keys(schema).some(function(k){return allowed.indexOf(k)<0;}))return false;
  if(Array.isArray(schema.type)){if(!schema.type.length || !schema.type.every(function(t){return typeof t==='string';}))return false;return schema.type.some(function(t){return telemetryHoneycombSchema(value,Object.assign({},schema,{type:t}));});}
  if(schema.type==='null')return value===null && (!schema.enum || schema.enum.indexOf(null)>=0);
  if(schema.type && (schema.type==='object'?!telemetryObject(value):schema.type==='array'?!Array.isArray(value):schema.type==='integer'?!Number.isInteger(value):schema.type==='number'?!telemetryNumber(value):typeof value!==schema.type))return false;
  if(schema.enum && !schema.enum.some(function(v){return JSON.stringify(v)===JSON.stringify(value);}))return false;
  if(telemetryObject(value)){
    if(schema.required && !schema.required.every(function(k){return telemetryOwn(value,k);}))return false;
    return Object.keys(value).every(function(k){var p=schema.properties || {};return telemetryOwn(p,k)?telemetryHoneycombSchema(value[k],p[k]):schema.additionalProperties===false?false:telemetryObject(schema.additionalProperties)?telemetryHoneycombSchema(value[k],schema.additionalProperties):true;});
  }
  return !Array.isArray(value) || !schema.items || value.every(function(v){return telemetryHoneycombSchema(v,schema.items);});
}
function telemetryHoneycombQuery(query,config,contract,windowRange){
  if(!telemetryObject(query) || !Array.isArray(query.calculations) || query.calculations.length!==1 || query.breakdowns && (!Array.isArray(query.breakdowns) || query.breakdowns.length) || query.formulas && (!Array.isArray(query.formulas) || query.formulas.length))throw telemetryHoneycombError('Use one scalar calculation without breakdowns or formulas per Honeycomb signal.');
  var fields=['calculations','filters','filter_combination','granularity','orders','limit','havings','time_range','start_time','end_time','calculated_fields','formulas','breakdowns','from','to','start','end'];
  if(Object.keys(query).some(function(key){return fields.indexOf(key)<0;}))throw telemetryHoneycombError('Unsupported Honeycomb query field; use native calculations and filters.');
  var calc=query.calculations[0],ops=['COUNT','SUM','AVG','MIN','MAX','COUNT_DISTINCT','CONCURRENCY','P001','P01','P05','P10','P25','P50','P75','P90','P95','P99','P999'];
  if(!telemetryObject(calc) || ops.indexOf(calc.op)<0 || ['COUNT','CONCURRENCY'].indexOf(calc.op)<0 && !telemetryText(calc.column))throw telemetryHoneycombError('Unsupported Honeycomb scalar calculation.');
  if(calc.name!==undefined && !telemetryText(calc.name) || ['COUNT','CONCURRENCY'].indexOf(calc.op)>=0 && calc.column!==undefined && calc.column!==null)throw telemetryHoneycombError('Unsupported Honeycomb calculation name or column.');
  if(!telemetryText(config.honeycomb.environment))throw telemetryHoneycombError('Set tracking.telemetry.honeycomb.environment.');
  var spec=JSON.parse(JSON.stringify(query));
  // Hosted MCP public CI uses relative query_spec.from, not REST time_range.
  // The page owns the window; authored calculations and filters remain exact.
  ['from','to','start','end','start_time','end_time','time_range'].forEach(function(k){delete spec[k];});
  if(windowRange){spec.from=windowRange.from;spec.to=windowRange.to;}else spec.from='-'+telemetryWindowDuration(config.window);
  var input={environment_slug:config.honeycomb.environment,query_spec:contract.type==='string'?JSON.stringify(spec):spec};
  if(telemetryText(config.honeycomb.dataset))input.dataset_slug=config.honeycomb.dataset;
  if(!telemetryHoneycombSchema(input,contract.schema))throw telemetryHoneycombError('The Honeycomb run_query input schema does not support this query/window.');
  return {input:input,calculation:calc,key:calc.name || calc.op+(calc.column?'('+calc.column+')':'')};
}
function telemetryHoneycombUrl(value,raw){
  if(typeof value!=='string' || value.length>8192)return null;
  try{var u=new URL(value);if(u.protocol!=='https:' || u.username || u.password || u.port || u.hash)return null;
    if(raw)return u.hostname==='mcp.honeycomb.io' && /^\/query_results\/[A-Za-z0-9._~-]+$/.test(u.pathname) && !u.search?u.href:null;
    return u.hostname==='ui.honeycomb.io' && !/^\/(?:img|query_results)(?:\/|$)/.test(u.pathname)?u.href:null;
  }catch(e){return null;}
}
function telemetryHoneycombPublicLink(value){var link=deltaLinkUrl(value);if(!link)return null;try{var u=new URL(link);return /(?:^|\.)honeycomb\.io$/.test(u.hostname) && /(?:query_results|trace_results)\//.test(u.pathname)?null:link;}catch(e){return null;}}
function telemetryHoneycombMetadata(result){
  if(result && result.content!==undefined && !Array.isArray(result.content))throw telemetryHoneycombError('Honeycomb result metadata is invalid.');
  var text=typeof (result && result.payload)==='string'?result.payload:(result && result.content || []).filter(function(c){return c && c.type==='text' && typeof c.text==='string';}).map(function(c){return c.text;}).join('\n');
  if(text.length>TELEMETRY_HONEYCOMB_BYTES)throw telemetryHoneycombError('Honeycomb result metadata is too large.');
  var out={text:text};['query_result_json','query_url'].forEach(function(key){
    var re=new RegExp('^  '+key+': "([^"\\r\\n]+)"\\s*$','gm'),matches=[],m;while((m=re.exec(text)))matches.push(m[1]);
    if(matches.length===1)out[key]=matches[0];
  });return out;
}
/* Strict provider-returned URL, bounded stream, no credentials/referrer, no
   redirects. Transport failures permit the separately labeled scalar fallback. */
async function telemetryHoneycombRaw(win,url,signal){
  if(signal && signal.aborted)throw telemetryHoneycombError('Honeycomb refresh cancelled.');
  var safe=telemetryHoneycombUrl(url,true);if(!safe)throw telemetryHoneycombError('Honeycomb returned no supported raw-result URL.','transport_unavailable');
  if(!win || typeof win.fetch!=='function')throw telemetryHoneycombError('Honeycomb exact-result transport is unavailable in this view.','transport_unavailable');
  var abort=new AbortController(),reader=null,timer,stop;
  var cancelled=new Promise(function(resolve,reject){stop=function(){abort.abort();reject(telemetryHoneycombError(signal && signal.aborted?'Honeycomb refresh cancelled.':'Honeycomb raw download timed out.',signal && signal.aborted?'query_unobserved':'transport_unavailable'));};});
  if(signal){if(signal.aborted)stop();else signal.addEventListener('abort',stop,{once:true});}
  timer=setTimeout(stop,TELEMETRY_HONEYCOMB_TIMEOUT);
  try{return await Promise.race([cancelled,(async function(){
    var response;try{response=await win.fetch(safe,{signal:abort.signal,credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',cache:'no-store'});}catch(e){throw telemetryHoneycombError('Honeycomb raw download blocked or unavailable.','transport_unavailable');}
    if(abort.signal.aborted || !response.ok || response.redirected || response.url && response.url!==safe || !response.body || !response.body.getReader)throw telemetryHoneycombError('Honeycomb exact-result transport is unavailable (CSP, CORS or response).','transport_unavailable');
    var size=Number(response.headers.get('content-length'));if(size>TELEMETRY_HONEYCOMB_BYTES)throw telemetryHoneycombError('Honeycomb raw result exceeds the size limit.');
    reader=response.body.getReader();var decoder=new TextDecoder(),text='',length=0;
    while(true){var chunk;try{chunk=await reader.read();}catch(e){throw telemetryHoneycombError('Honeycomb raw download interrupted.','transport_unavailable');}if(abort.signal.aborted)throw telemetryHoneycombError('Honeycomb result cancelled.');if(chunk.done)break;length+=chunk.value.byteLength;if(length>TELEMETRY_HONEYCOMB_BYTES)throw telemetryHoneycombError('Honeycomb raw result exceeds the size limit.');text+=decoder.decode(chunk.value,{stream:true});}
    text+=decoder.decode();return JSON.parse(text);
  })()]);}catch(e){if(signal && signal.aborted)throw telemetryHoneycombError('Honeycomb refresh cancelled.');if(e && e.code)throw e;throw telemetryHoneycombError('Honeycomb downloaded raw JSON is invalid.');}
  finally{clearTimeout(timer);if(signal)signal.removeEventListener('abort',stop);abort.abort();if(reader)try{Promise.resolve(reader.cancel()).catch(function(){});}catch(e){}}
}
/* Both transport paths must be bounded JSON, not arbitrary JS objects. Walk
   before serializing (depth/node/string bounds; no accessors, cycles or unsafe
   keys), then enforce the UTF-8 wire limit. Clone to detach provider objects. */
function telemetryHoneycombJson(raw){
  try{return telemetryEvidenceJson(raw);}catch(e){throw telemetryHoneycombError('Honeycomb exact raw JSON is invalid or exceeds its bounds.');}
}
/* The local mock publishes exact raw JSON in structuredContent; a namespace
   may expose that JSON as payload. This is not evidence that hosted Honeycomb
   returns structured raw data. Conflicting/invalid candidates never fall back
   to rounded content or to another response field. */
async function telemetryHoneycombResult(win,result,meta,signal){
  if(signal && signal.aborted)throw telemetryHoneycombError('Honeycomb refresh cancelled.');
  var candidates=[];
  if(result && telemetryOwn(result,'structuredContent'))candidates.push(result.structuredContent);
  if(result && telemetryOwn(result,'payload') && typeof result.payload!=='string')candidates.push(result.payload);
  if(!candidates.length)return telemetryHoneycombJson(await telemetryHoneycombRaw(win,meta.query_result_json,signal));
  var raw=candidates.map(telemetryHoneycombJson);
  if(raw.length>1 && JSON.stringify(raw[0])!==JSON.stringify(raw[1]))throw telemetryHoneycombError('Honeycomb exact raw payload is ambiguous.');
  return raw[0];
}
/* Hosted scalar fallback: exactly one matching column in the Results section.
   Never parse charts, later sections, groups, localized numbers or missing cells. */
function telemetryHoneycombFormatted(meta,query,unit){
  var text=meta.text || '';
  if(text.length>TELEMETRY_HONEYCOMB_BYTES || new TextEncoder().encode(text).byteLength>TELEMETRY_HONEYCOMB_BYTES)throw telemetryHoneycombError('Honeycomb formatted Results exceeds bounds.');
  var lines=text.replace(/^ResultTool response/,'').split(/\r?\n/),sections=[];
  lines.forEach(function(line,i){if(line.trim()==='# Results')sections.push(i);});
  if(sections.length!==1)throw telemetryHoneycombError('Honeycomb formatted Results section is missing or ambiguous.');
  var i=sections[0]+1;while(i<lines.length && !lines[i].trim())i++;
  var header=/^\s*\|\s*([^|\\]+?)\s*\|\s*$/.exec(lines[i] || '');
  if(!header || header[1].trim()!==query.key || !/^\s*\|\s*:?-{3,}:?\s*\|\s*$/.test(lines[i+1] || ''))throw telemetryHoneycombError('Honeycomb formatted Results header does not match the scalar calculation.');
  var row=/^\s*\|\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?)\s*\|\s*$/.exec(lines[i+2] || ''),value=row?Number(row[1]):NaN;
  if(!isFinite(value) || Math.abs(value)>Number.MAX_SAFE_INTEGER)throw telemetryHoneycombError('Honeycomb formatted Results first row has no finite scalar.');
  var sample={value:value,series:[],observedAt:null,provenance:'formatted-text'};if(unit)sample.unit=unit;return sample;
}
async function telemetryHoneycombMeasurement(win,result,meta,signal,query,unit,allowEmpty){
  try{return telemetryHoneycombSample(await telemetryHoneycombResult(win,result,meta,signal),query,unit,allowEmpty);}
  catch(error){
    if(signal && signal.aborted || !error || error.code!=='transport_unavailable')throw error;
    return telemetryHoneycombFormatted(meta,query,unit);
  }
}
function telemetryHoneycombSample(raw,query,unit,allowEmpty){
  // #1404: with tracking.endToEndMetrics, a successful answer with no result rows and no series is "no data".
  if(allowEmpty && telemetryObject(raw) && Array.isArray(raw.results) && !raw.results.length && !(Array.isArray(raw.series) && raw.series.length)){var none={empty:true,series:[],observedAt:null};if(unit)none.unit=unit;return none;}
  if(!telemetryObject(raw) || !Array.isArray(raw.results) || raw.results.length!==1 || !telemetryObject(raw.results[0]) || !telemetryObject(raw.results[0].data))throw telemetryHoneycombError('Honeycomb result is missing or ambiguous; expected one aggregate row.');
  var key=query.key,header=Array.isArray(raw.header)?raw.header:[];
  if(header.some(function(h){return !telemetryObject(h) || !telemetryText(h.alias) || !telemetryText(h.key_name);}))throw telemetryHoneycombError('Honeycomb raw result has an invalid header.');
  var aliases=header.filter(function(h){return h && h.alias===key && typeof h.key_name==='string';});
  if(aliases.length>1)throw telemetryHoneycombError('Honeycomb result alias is ambiguous.');
  if(aliases.length===1)key=aliases[0].key_name;
  var value=raw.results[0].data[key];if(!telemetryNumber(value) || Math.abs(value)>Number.MAX_SAFE_INTEGER)throw telemetryHoneycombError('Honeycomb returned no exact finite aggregate.');
  if(raw.header!==undefined && !Array.isArray(raw.header) || raw.series!==undefined && !Array.isArray(raw.series))throw telemetryHoneycombError('Honeycomb raw result has invalid header or series.');
  var points=[],seen=Object.create(null);
  (raw.series || []).forEach(function(row){var data=row && row.data,at=data && typeof data.time==='string'?Date.parse(data.time):NaN;
    if(!telemetryObject(data) || !isFinite(at) || !telemetryNumber(data[key]) || Math.abs(data[key])>Number.MAX_SAFE_INTEGER)throw telemetryHoneycombError('Honeycomb raw series contains an invalid point.');
    if(seen[at])throw telemetryHoneycombError('Honeycomb series is ambiguous; multiple rows share a bucket.');seen[at]=true;points.push([at,data[key]]);
  });points.sort(function(a,b){return a[0]-b[0];});
  // Raw series timestamps are bucket starts. With verified bucket width, the
  // latest returned bucket's end is the measurement as-of (not proof of a full
  // query window). Without width use its actual start; without points unknown.
  var width=raw.info && raw.info.granularity_seconds,last=points.length?points[points.length-1][0]:null;
  var end=last===null?null:last+(Number.isSafeInteger(width) && width>0 && Number.isSafeInteger(width*1000)?width*1000:0);
  if(end!==null && !isFinite(new Date(end).getTime()))end=last;
  var sample={value:value,series:points,observedAt:end===null?null:telemetryTime(end)};if(unit)sample.unit=unit;
  return sample;
}
function createTelemetryHoneycomb(page,win,now,bound){
  var claude,use;try{claude=win && win.claude;use=claude && claude.use;}catch(e){return null;}
  if(!trackingTelemetry(page || {}).enabled || typeof use!=='function' || !(bound?bound():telemetryHoneycombJobs(telemetryHoneycombBindings(page)).length))return null;
  var current=page,ctl=null,namespace=null,contract=null,generation=0,retired=false,blocked=null,approval=null,shown=false,allowEpoch=0;
  var clock=now || Date.now;
  function syncAction(){var live=ctl && ctl.liveStatus;if(!live || !live.action)return;var label=live.snapshot?live.snapshot().actionLabel:'';
    if(approval && !label){shown=true;live.action('Allow Honeycomb',allow);}else if(!approval && shown){shown=false;if(label==='Allow Honeycomb')live.action('',null);}
  }
  function available(value){if(ctl && ctl.telemetry)ctl.telemetry.setAvailable(value);}
  async function connect(signal){var epoch=generation;
    function active(){return !retired && epoch===generation && !(signal && signal.aborted);}
    if(!namespace)namespace=Promise.resolve().then(function(){return use.call(claude,'mcp');});
    var mcp=await namespace;if(!active() || !mcp)throw {code:'capability_removed'};
    var list=await mcp.listTools();if(!active())throw {code:'capability_removed'};
    contract=telemetryHoneycombServer(list);if(contract){if(telemetryConnectorRefused(claude,contract.server))throw {code:'not_granted'};return mcp;}
    var candidate=telemetryHoneycombCandidate(list);if(!candidate)throw {code:'server_not_connected'};
    if(telemetryConnectorRefused(claude,candidate.server || candidate.name))throw {code:'not_granted'};
    var tool=candidate.tools.find(function(t){return t.name==='run_query';});
    if(!signal)return mcp; // Initial paint only establishes eligibility; never prompts.
    var server=candidate.server || candidate.name,described=await telemetryDescribeTools(claude,mcp,server,[tool],active);
    if(!active())throw {code:'capability_removed'};
    contract=telemetryHoneycombServer([{server:server,tools:described}]);if(!contract)throw telemetryHoneycombError('Unsupported Honeycomb run_query input schema.');return mcp;
  }
  function failure(error,signal,input){
    var code=error && error.code;
    if(code==='user_changed'){retired=true;approval=null;if(ctl && ctl.telemetry.accountChanged)ctl.telemetry.accountChanged();else {if(ctl)ctl.telemetry.clear(signal);available(false);}syncAction();}
    if(code==='approval_required' || code==='consent_required'){approval=input;syncAction();}
    if(['server_not_connected','server_not_found','not_granted','capability_disabled','capability_removed'].indexOf(code)>=0)available(false);
    if(code!=='query_unobserved'){blocked=signal;if(ctl && ctl.telemetry.clear)ctl.telemetry.clear(signal);}
    var e=telemetryHoneycombError(code==='user_changed'?'Honeycomb stopped: the signed-in account changed':approval?'Honeycomb access needs your approval':code==='needs_reauth'?'Reconnect Honeycomb in claude.ai Settings → Connectors':code==='query_unobserved'?error.message:telemetryProviderStepError(error,'Honeycomb connector').message);
    if(approval)e.state='approval';return e;
  }
  function allow(){if(!approval || retired)return;var input=approval,epoch=generation,attempt=++allowEpoch;approval=null;syncAction();
    connect().then(function(mcp){if(epoch!==generation || attempt!==allowEpoch || retired)return;return mcp.callTool(contract.server,'run_query',input);}).then(function(){if(epoch!==generation || attempt!==allowEpoch || retired)return;blocked=null;if(ctl.telemetry.enabled()){ctl.telemetry.setEnabled(false);ctl.telemetry.setEnabled(true);}},function(error){if(epoch===generation && attempt===allowEpoch && !retired)failure(error,null,input);});
  }
  async function provider(bindings,signal,report,windowRange){
    if(!windowRange || !telemetryTime(windowRange.from) || !telemetryTime(windowRange.to))windowRange=null;
    if(retired || signal.aborted)throw telemetryHoneycombError('Honeycomb refresh cancelled.');
    if(blocked===signal){var refused=telemetryHoneycombError(approval?'Honeycomb access needs your approval':'Honeycomb unavailable for this Metrics session.');if(approval)refused.state='approval';throw refused;}
    var config=telemetryProviderConfig(current,ctl),epoch=generation,map=Object.create(null),notes=[],jobs=telemetryHoneycombJobs(bindings),mcp;
    if(!jobs.length)return map;
    try{mcp=await connect(signal);}catch(e){if(signal.aborted)throw telemetryHoneycombError('Honeycomb refresh cancelled.');throw failure(e,signal,null);}
    // Valid queued bindings already belong to this request. Invalid siblings
    // never load, and one slow hosted query must not disguise queued work.
    jobs.forEach(function(job){try{job.prepared=telemetryHoneycombQuery(job.query,config,contract,windowRange);if(report && report.pending)report.pending(job.id,job.name);}catch(error){job.inputError=error;}});
    for(var i=0;i<jobs.length;i++){
      if(signal.aborted || retired || epoch!==generation)throw telemetryHoneycombError('Honeycomb refresh cancelled.');
      var job=jobs[i],query,stage='Honeycomb run_query input';
      try{
        if(job.inputError)throw job.inputError;query=job.prepared;
        stage='Honeycomb run_query';var work=function(){return mcp.callTool(contract.server,'run_query',query.input,{signal:signal});};var result=await (windowRange?liveStatusHistoryCall(work,signal):work());
        if(signal.aborted || retired || epoch!==generation)throw telemetryHoneycombError('Honeycomb refresh cancelled.');
        if(result && result.isError)throw {code:'tool_error',message:telemetryProviderErrorText(result)};
        stage='Honeycomb run_query result';var meta=telemetryHoneycombMetadata(result),sample=await telemetryHoneycombMeasurement(win,result,meta,signal,query,job.unit,trackingEndToEndMetrics(current));
        if(signal.aborted || retired || epoch!==generation)throw telemetryHoneycombError('Honeycomb refresh cancelled.');
        sample.retrievedAt=new Date(clock()).toISOString();
        var out=map[job.id] || (map[job.id]={signals:{},observedAt:null,links:{},markers:[]});out.signals[job.name]=sample;
        if(sample.observedAt && (!out.observedAt || Date.parse(sample.observedAt)>Date.parse(out.observedAt)))out.observedAt=sample.observedAt;
        var link=telemetryHoneycombPublicLink(job.links.query) || telemetryHoneycombUrl(meta.query_url,false);if(link)sample.links={query:link};
        var dashboard=telemetryHoneycombPublicLink(job.dashboard);if(dashboard)out.links.dashboard=dashboard;
        if(report && report.settled)report.settled(job.id,job.name,sample);
        // COUNT semantics are presented on the corresponding carrier evidence.
      }catch(e){
        if(signal.aborted || retired || epoch!==generation)throw telemetryHoneycombError('Honeycomb refresh cancelled.');
        if(['tool_error','bad_request','transform_error'].indexOf(e && e.code)>=0)e=telemetryHoneycombError(telemetryProviderErrorText(e) || 'Tool failed; no measurement returned.');
        if(e && e.code==='query_unobserved')e=telemetryProviderStepError(e,stage);
        if(report && report.settled)report.settled(job.id,job.name,null);
        var error=failure(e,signal,query && query.input);notes.push(job.id+' '+job.name+': '+error.message);
        if(e.code!=='query_unobserved')throw error;
      }
    }
    if(report && report.note)report.note(telemetryNotes(notes));return map;
  }
  return {options:{environmentChanged:function(){allowEpoch++;approval=null;blocked=null;syncAction();},provider:provider,history:function(bindings,range,signal,report){if(!range || !range.window){if(report && report.note)report.note('Honeycomb history requires a selected observation window.');return Promise.resolve({});}return provider(bindings,signal,report,range.window);},source:'Honeycomb',available:false},attach:function(next,nextPage){
    ctl=next;current=nextPage || current;var epoch=++generation,mine=ctl,offs=[];available(false);
    if(!retired)connect().then(function(){if(epoch===generation && !retired)available(true);},function(e){if(epoch===generation && !retired){if(e && e.code==='user_changed')failure(e,null,null);else available(false);}});
    if(ctl.liveStatus && ctl.liveStatus.onChange)offs.push(ctl.liveStatus.onChange(syncAction));
    if(ctl.telemetry.onChange)offs.push(ctl.telemetry.onChange(function(s){if(!s.enabled){allowEpoch++;approval=null;blocked=null;syncAction();}}));
    var handle={destroy:function(){offs.splice(0).forEach(function(off){off();});if(ctl===mine){generation++;approval=null;blocked=null;syncAction();ctl=null;namespace=null;contract=null;}}};
    if(ctl.liveStatus && ctl.liveStatus.onDestroy)offs.push(ctl.liveStatus.onDestroy(handle.destroy));return handle;
  }};
}
