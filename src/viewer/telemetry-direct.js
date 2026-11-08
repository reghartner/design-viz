/* One user-requested detail at a time. Independent of query polling, carrier
   maps, numeric proof and history. Native hosts supply the two read-only hooks. */
function createTelemetryDirect(page,transport,hooks){
  hooks=hooks || {};var dead=false,accountRetired=!!(transport && typeof transport.accountRetired==='function' && transport.accountRetired()),offAccount=null,serial=0,abort=null,timeout=null,busy=false,exemplar=null,report=null,form={connection:'',environment:'',section:'',input:'',start:'',end:''},lastIdentity=null,lastContext=null;
  function profiles(){return FlowTraceConnections.resolve(page,TELEMETRY_COMPANY_TRACE_CONNECTIONS);}
  function sections(){return typeof hooks.sections==='function'?hooks.sections():[];}
  function contextIdentity(){return JSON.stringify(typeof hooks.identity==='function'?hooks.identity():null);}
  function identity(){return JSON.stringify([profiles(),contextIdentity(),sections().map(function(s){return s.id;})]);}
  function changed(){if(!dead && hooks.changed)hooks.changed();}
  function cancel(){serial++;if(timeout)clearTimeout(timeout);timeout=null;if(abort)abort.abort();abort=null;busy=false;exemplar=null;report=null;}
  function clearInput(){form.input='';form.start='';form.end='';}
  // An account boundary retires this session permanently. Form edits/cancel
  // only retire a request and must never signal a shared account change.
  function retireAccount(){if(dead || accountRetired)return;accountRetired=true;cancel();report={stage:'account',code:'user_changed',error:'Host account changed. Reopen this view to start a new telemetry session.',requestAccepted:false,idMatched:false};changed();}
  function sync(){var key=identity(),context=contextIdentity();if(lastIdentity!==key){if(lastIdentity!==null && lastContext!==context)clearInput();cancel();lastIdentity=key;lastContext=context;}var ps=profiles(),ids=Object.keys(ps);if(!ps[form.connection]){form.connection=ids.length===1?ids[0]:'';form.environment='';}var p=ps[form.connection],envs=p?Object.keys(p.environments):[];if(envs.indexOf(form.environment)<0)form.environment=envs.length===1?envs[0]:'';var ss=sections();if(!ss.some(function(s){return s.id===form.section;}))form.section=ss.length===1?ss[0].id:'';return ps;}
  function available(){return !dead && !accountRetired && !!transport && typeof transport.describe==='function' && typeof transport.call==='function' && !(hooks.disabled && hooks.disabled());}
  function snapshot(){var ps=sync();return {available:available(),busy:busy,form:Object.assign({},form),profiles:Object.keys(ps).map(function(id){return {id:id,label:ps[id].label,lookback:ps[id].time.defaultLookback,environments:Object.keys(ps[id].environments).map(function(e){return {id:e,label:ps[id].environments[e].label || e};})};}),sections:sections().map(function(s){return {id:s.id,label:s.label};}),report:report?JSON.parse(JSON.stringify(report)):null,exemplar:exemplar,section:form.section};}
  function set(field,value){if(dead || !Object.prototype.hasOwnProperty.call(form,field) || typeof value!=='string' || value.length>4096)return;sync();if(value===form[field])return;cancel();form[field]=value;if(field==='connection' || field==='environment')clearInput();if(field==='connection')form.environment='';sync();changed();}
  function errorText(e){var known={not_granted:'Connector permission was not granted.',needs_reauth:'Reconnect this connector in the host.',user_changed:'Host account changed; start a new trace request.',server_not_connected:'The configured connector is not connected.',server_not_found:'The configured connector was not found.',capability_removed:'The configured tool capability was removed.',capability_disabled:'The configured tool capability is disabled.'};return known[e && e.code] || telemetryTraceErrorText(e) || 'The host could not complete the read-only detail request.';}
  function notFoundText(r){return r.lookback?'Trace not found in the last '+r.lookback+'. Try a longer lookback under Lookback.':'Trace not found between '+r.range.from.replace(/\.0+Z$/,'Z')+' and '+r.range.to.replace(/\.0+Z$/,'Z')+'. Try a wider range under Lookback.';}
  async function load(verify){
    sync();cancel();var mine=serial,key=lastIdentity,ps=profiles(),p=ps[form.connection],request=Object.assign({},form),stage='configuration',resolved=null;abort=new AbortController();var signal=abort.signal;
    function active(){return !dead && mine===serial && !signal.aborted && key===identity() && available();}
    function check(){if(!active())FlowTraceConnections.fail('cancelled','Trace request expired.');}
    function update(next){if(!active())return;report=Object.assign(report || {},next);changed();}
    try{
      if(!available())FlowTraceConnections.fail('host','Direct trace retrieval is unavailable in this host.');
      if(!p)FlowTraceConnections.fail('configuration','Choose a configured trace connection.');
      if(sections().length>1 && !request.section)FlowTraceConnections.fail('input','Choose a diagram context for authored mappings.');
      stage='input';resolved=FlowTraceConnections.input(p,request,Date.now());
      var safeArgs={};Object.keys(resolved.args).forEach(function(k){safeArgs[k]=[p.arguments.traceId,p.arguments.start,p.arguments.end,p.arguments.environment].indexOf(k)>=0?resolved.args[k]:'[configured]';});
      busy=true;update({mode:verify?'verify':'load',stage:'schema',connection:p.label,server:p.server,tool:p.tool,environment:resolved.environment,arguments:safeArgs,requestAccepted:false,idMatched:false});
      timeout=setTimeout(function(){if(mine!==serial || dead)return;serial++;abort.abort();timeout=null;busy=false;report=Object.assign(report || {},{stage:stage,error:'Trace '+stage+' request timed out. Retry with a bounded window.',code:'timeout'});changed();},30000);
      stage='schema';var descriptor={connection:request.connection,profile:p,environment:resolved.environment};
      var tool=await transport.describe(descriptor,signal);check();FlowTraceConnections.tool(p,tool,resolved.args);
      stage='detail';update({stage:stage});var result=await transport.call(descriptor,resolved.args,signal);check();
      if(result && result.isError)FlowTraceConnections.fail('detail',telemetryTraceErrorText(result) || 'The detail tool returned an error; no trace was accepted.');
      update({requestAccepted:true,stage:'response'});stage='response';
      var trace=p.adapter==='honeycomb-table-v1'?telemetryHoneycombTrace(result,resolved.traceId):telemetryTempoTrace(result,resolved.traceId);check();
      var e=telemetryTraceEnvelope({version:1,provider:p.provider,traceId:resolved.traceId,signal:'direct',selectionToken:'direct-'+mine,selectionReason:'Explicit trace ID loaded with '+p.label,observedAt:new Date().toISOString(),range:resolved.range,candidates:[{traceId:resolved.traceId,status:'unknown'}],spans:trace.spans,completeness:trace.completeness,warnings:trace.warnings.map(telemetryTraceErrorText).filter(Boolean),url:trace.url});
      exemplar=e;busy=false;update({stage:'complete',idMatched:true,spanCount:e.spans.length,completeness:e.completeness,warnings:e.warnings});return e;
    }catch(e){
      if(!dead && e && e.code==='user_changed'){if(transport && typeof transport.accountChanged==='function')transport.accountChanged();if(typeof hooks.accountChanged==='function')hooks.accountChanged();retireAccount();return null;}
      if(dead || mine!==serial || signal.aborted || key!==identity())return null;
      busy=false;report=Object.assign(report || {mode:verify?'verify':'load',requestAccepted:false,idMatched:false},{stage:e.stage || stage,error:e && e.code==='trace_not_found' && resolved?notFoundText(resolved):errorText(e)});if(e.code && /^[A-Za-z0-9_.-]{1,64}$/.test(e.code))report.code=e.code;changed();return null;
    }finally{if(mine===serial && timeout){clearTimeout(timeout);timeout=null;}}
  }
  if(transport && typeof transport.onAccountChanged==='function')offAccount=transport.onAccountChanged(retireAccount);
  return {snapshot:snapshot,set:set,load:load,clear:function(){cancel();changed();},destroy:function(){cancel();dead=true;if(offAccount)offAccount();}};
}
