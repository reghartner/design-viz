/* Runtime-only provider exemplars. Pinned native contracts and transport limits:
   docs/provider-traces.md. No authored fields, query inference or numeric proof.
   Only the first explicit trace signal in authored order is selected per carrier. */
var TELEMETRY_TRACE_SESSION=0;
function telemetryTraceIntent(s){return proofVerdicts.isTraceSignal(s);}
function telemetryTraceJobs(bindings){return (bindings || []).map(function(b){var name=Object.keys(b.signals || {}).find(function(n){return telemetryTraceIntent(b.signals[n]);});return name?{id:b.id,name:name,signal:b.signals[name],binding:b}:null;}).filter(Boolean);}
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
    if(!telemetryTraceString(config.honeycomb.environment))telemetryTraceFail('Set an explicit Honeycomb environment.');
    input={environment_slug:config.honeycomb.environment};
    if(id){input.trace_id=id;input.from='-'+telemetryWindowDuration(config.window);var view=contract.detail.inputSchema && contract.detail.inputSchema.properties && contract.detail.inputSchema.properties.view_mode;if(view && view.type==='string' && (!view.enum || view.enum.indexOf('full')>=0))input.view_mode='full';}
    else{
      if(!telemetryObject(q) || Object.keys(q).some(function(k){return ['query_spec','raw_row_columns','results_limit'].indexOf(k)<0;}) || !telemetryObject(q.query_spec) || !Array.isArray(q.raw_row_columns) || q.raw_row_columns.length>30 || q.raw_row_columns.indexOf('trace.trace_id')<0 || q.raw_row_columns.some(function(k){return !telemetryTraceString(k);}) || !Number.isInteger(q.results_limit) || q.results_limit<1 || q.results_limit>TELEMETRY_TRACE_CANDIDATES)telemetryTraceFail('Use an explicit native Honeycomb raw-row wrapper with trace.trace_id and results_limit 1–20.');
      var spec=telemetryHoneycombJson(q.query_spec);['from','to','start','end','start_time','end_time','time_range'].forEach(function(k){delete spec[k];});spec.from='-'+telemetryWindowDuration(config.window);
      var prop=contract.search.inputSchema && contract.search.inputSchema.properties && contract.search.inputSchema.properties.query_spec;
      if(!prop || !telemetrySchemaType(prop,'object') && !telemetrySchemaType(prop,'string'))telemetryTraceFail('Unsupported query_spec type.');
      if(telemetryTraceString(config.honeycomb.dataset))input.dataset_slug=config.honeycomb.dataset;input.query_spec=telemetrySchemaType(prop,'string')?JSON.stringify(spec):spec;input.raw_row_columns=q.raw_row_columns.filter(function(k){return k!=='timestamp';});input.results_limit=q.results_limit;
    }
  }
  return telemetryTraceInput(id?contract.detail:contract.search,input);
}
function createTelemetryTraces(page,win,now,bound){
  if(!trackingTelemetry(page || {}).enabled || !win || !win.claude || typeof win.claude.use!=='function' || !(bound?bound():telemetryTraceJobs(telemetryHoneycombBindings(page)).length))return null;
  var session=++TELEMETRY_TRACE_SESSION,ctl=null,current=page,clock=now || Date.now,epoch=0,serial=0,retired=false,namespace=null,contracts={},entries=new Map(),abort=new AbortController(),off=null,contractKey=null;
  function invalidate(){epoch++;abort.abort();abort=new AbortController();entries.clear();}
  function active(e){return !retired && e===epoch && ctl && ctl.telemetry.enabled() && !abort.signal.aborted;}
  async function discover(signal){
    var e=epoch;if(!namespace)namespace=Promise.resolve(win.claude.use('mcp'));var mcp=await namespace;if(e!==epoch || retired || !ctl)telemetryTraceFail('Trace session cancelled.');var list=await mcp.listTools();if(e!==epoch || retired || !ctl)telemetryTraceFail('Trace session cancelled.');
    var next={},jobs=telemetryTraceJobs(ctl.telemetry.bindings()),config=telemetryProviderConfig(current,ctl),to=clock(),range={from:new Date(to-telemetryGrafanaWindowMs(config.window)).toISOString(),to:new Date(to).toISOString()};
    for(var job of jobs){var c=telemetryTraceContract(list,job.signal.source);if(!c || telemetryConnectorRefused(win.claude,c.server))continue;
      if(!c.search.inputSchema || !c.detail.inputSchema){
        if(!signal){
          // Eligibility rediscovery must not downgrade an already described pair
          // and invalidate a simultaneous refresh for the new environment.
          var existing=contracts[job.signal.source];next[job.signal.source]=existing && existing.server===c.server && existing.search.name===c.search.name && existing.detail.name===c.detail.name?existing:c;continue;
        }
        var described;try{described=await telemetryDescribeTools(win.claude,mcp,c.server,[c.search,c.detail],function(){return e===epoch && !retired && !!ctl && !signal.aborted && ctl.telemetry.enabled();});}catch(error){if(error && error.code==='not_granted')continue;throw error;}
        c={server:c.server,search:described[0],detail:described[1]};
      }
      try{telemetryTraceInputs(job,config,c,range);telemetryTraceInputs(job,config,c,range,'00000000000000000000000000000000');next[job.signal.source]=c;}catch(error){}
    }
    var key=JSON.stringify(next);if(contractKey!==null && key!==contractKey)invalidate();contractKey=key;contracts=next;ctl.telemetry.setAvailable(Object.keys(next).length>0);return mcp;
  }
  function fail(error){
    if(error && error.code==='user_changed'){retired=true;invalidate();if(ctl && ctl.telemetry.accountChanged)ctl.telemetry.accountChanged();}
    else if(error && ['capability_removed','server_not_connected','server_not_found','not_granted','capability_disabled','needs_reauth'].indexOf(error.code)>=0){invalidate();contracts={};if(ctl)ctl.telemetry.setAvailable(false);}
    // Provider text may contain signed transport URLs. Never report it verbatim.
    return telemetryProviderStepError(error,'Trace evidence');
  }
  async function detail(entry,candidate,reason){
    if(!active(entry.epoch))telemetryTraceFail('Trace session cancelled.');
    if(entry.details.has(candidate.traceId))return entry.details.get(candidate.traceId);
    var request=(async function(){
      var result=await entry.mcp.callTool(entry.contract.server,entry.contract.detail.name,telemetryTraceInputs(entry.job,entry.config,entry.contract,entry.range,candidate.traceId),{signal:abort.signal});
      if(!active(entry.epoch))telemetryTraceFail('Trace session cancelled.');
      var trace=entry.job.signal.source==='tempo'?telemetryTempoTrace(result,candidate.traceId):telemetryHoneycombTrace(result,candidate.traceId);
      return telemetryTraceEnvelope({version:1,provider:entry.job.signal.source,traceId:candidate.traceId,signal:entry.job.name,selectionReason:reason+'; first explicit trace signal in authored order',selectionToken:entry.token,observedAt:new Date(clock()).toISOString(),range:entry.range,candidates:entry.candidates,spans:trace.spans,completeness:trace.completeness,warnings:entry.warnings.concat(trace.warnings),url:trace.url || candidate.url || null});
    })().catch(function(error){throw telemetryProviderStepError(error,entry.contract.detail.name+' trace detail');});entry.details.set(candidate.traceId,request);return request;
  }
  async function load(job,mcp,config){
    var key=JSON.stringify([job.binding,config]),entry=entries.get(job.id);if(entry && entry.key===key)return entry.promise;
    var to=clock();entry={key:key,epoch:epoch,job:job,config:config,contract:contracts[job.signal.source],mcp:mcp,range:{from:new Date(to-telemetryGrafanaWindowMs(config.window)).toISOString(),to:new Date(to).toISOString()},token:'trace-'+session+'-'+epoch+'-'+(++serial),details:new Map(),candidates:[],warnings:[],selected:null};entries.set(job.id,entry);
    entry.promise=(async function(){
      if(!entry.contract)telemetryTraceFail('Required trace tools unavailable.');
      var result;try{result=await mcp.callTool(entry.contract.server,entry.contract.search.name,telemetryTraceInputs(job,config,entry.contract,entry.range),{signal:abort.signal});if(result && result.isError)throw {code:'tool_error',message:telemetryProviderErrorText(result)};}catch(error){throw telemetryProviderStepError(error,entry.contract.search.name+' trace search');}if(!active(entry.epoch))telemetryTraceFail('Trace session cancelled.');
      var found;try{found=job.signal.source==='tempo'?telemetryTempoCandidates(result):telemetryHoneycombCandidates(result);}catch(error){throw telemetryProviderStepError(error,entry.contract.search.name+' trace search result');}entry.candidates=found.candidates;entry.warnings=found.warnings;if(found.range)entry.range=found.range;
      var chosen=telemetryTraceSelect(entry.candidates);if(!chosen.candidate)return null;
      entry.selected=await detail(entry,chosen.candidate,chosen.reason);return entry.selected;
    })();return entry.promise;
  }
  async function provider(bindings,signal,report){
    var map=Object.create(null),notes=[];if(signal.aborted || retired)return map;
    var mcp;try{mcp=await discover(signal);}catch(e){if(signal.aborted)throw new Error('Trace session cancelled.');throw fail(e);}if(signal.aborted)return map;var e=epoch,config=telemetryProviderConfig(current,ctl);
    for(var job of telemetryTraceJobs(bindings)){
      if(signal.aborted || !active(e))break;
      try{var envelope=await load(job,mcp,config);if(signal.aborted || !active(e))break;var saved=entries.get(job.id);if(envelope)map[job.id]={signals:{},exemplars:[saved.selected || envelope]};}
      catch(error){notes.push(fail(error).message);}
    }
    if(report && report.note)report.note(notes.length?notes[0]:'');return map;
  }
  async function choose(id,token,traceId){
    var entry=entries.get(id);if(!entry || entry.token!==token || !active(entry.epoch) || entry.key!==JSON.stringify([ctl.telemetry.bindings().find(function(b){return b.id===id;}),telemetryProviderConfig(current,ctl)]))telemetryTraceFail('Trace selection expired.');
    var candidate=entry.candidates.find(function(c){return c.traceId===traceId;});if(!candidate)telemetryTraceFail('Choose an actual returned trace candidate.');
    // Revalidate metadata on explicit actions, including cached alternatives.
    try{await discover(abort.signal);if(!active(entry.epoch))telemetryTraceFail('Trace selection expired.');var attempt=entry.attempt=(entry.attempt || 0)+1,value=await detail(entry,candidate,'explicit user selection');if(!active(entry.epoch) || attempt!==entry.attempt)telemetryTraceFail('Trace selection replaced.');entry.selected=Object.assign({},value,{selectionReason:'explicit user selection; first explicit trace signal in authored order'});return entry.selected;}catch(e){throw fail(e);}
  }
  function canChoose(id,token,traceId){
    var entry=entries.get(id);return !!(entry && entry.token===token && active(entry.epoch) && contracts[entry.job.signal.source] && entry.key===JSON.stringify([ctl.telemetry.bindings().find(function(b){return b.id===id;}),telemetryProviderConfig(current,ctl)]) && entry.candidates.some(function(c){return c.traceId===traceId;}));
  }
  return {options:{environmentChanged:function(){invalidate();var e=epoch,mine=ctl;discover().catch(function(error){if(ctl===mine && e===epoch){fail(error);if(ctl===mine)ctl.telemetry.setAvailable(false);}});},provider:provider,chooseExemplar:choose,canChooseExemplar:canChoose,available:false,source:'Traces'},attach:function(next,nextPage){
    ctl=next;current=nextPage || current;invalidate();var mine=ctl,attachedEpoch=epoch;discover().catch(function(e){if(ctl===mine && attachedEpoch===epoch){fail(e);if(ctl===mine)ctl.telemetry.setAvailable(false);}});
    off=ctl.telemetry.onChange(function(s){if(!s.enabled && entries.size)invalidate();});
    return {destroy:function(){if(ctl!==mine)return;invalidate();if(off)off();off=null;ctl=null;namespace=null;}};
  }};
}
