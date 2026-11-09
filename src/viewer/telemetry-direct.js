/* One user-requested detail at a time. Independent of query polling, carrier
   maps, numeric proof and history. Native hosts supply the two read-only hooks. */
var telemetryDirectReports=0;
/* The profile environment id that matches a board Environment id: exact id, then
   case-insensitive id or label, then a common alias. More than one candidate at a level, or none, is ''. */
var TRACE_ENVIRONMENT_ALIASES=[['prd','prod','production'],['stg','stage','staging'],['dev','development'],['qa']];
function matchTraceEnvironment(board,environments){
  if(typeof board!=='string' || !board || !environments)return '';
  var ids=Object.keys(environments),low=function(v){return typeof v==='string'?v.trim().toLowerCase():'';};
  var group=function(v){v=low(v);for(var i=0;i<TRACE_ENVIRONMENT_ALIASES.length;i++)if(TRACE_ENVIRONMENT_ALIASES[i].indexOf(v)>=0)return i;return -1;};
  var b=low(board),g=group(board),levels=[
    function(id){return id===board;},
    function(id){return low(id)===b || low((environments[id] || {}).label)===b;},
    function(id){return g>=0 && (group(id)===g || group((environments[id] || {}).label)===g);}
  ];
  for(var i=0;i<levels.length;i++){var hits=ids.filter(levels[i]);if(hits.length)return hits.length===1?hits[0]:'';}
  return '';
}
function createTelemetryDirect(page,transport,hooks){
  hooks=hooks || {};var dead=false,accountRetired=!!(transport && typeof transport.accountRetired==='function' && transport.accountRetired()),offAccount=null,serial=0,abort=null,timeout=null,busy=false,exemplar=null,report=null,form={connection:'',environment:'',section:'',input:'',start:'',end:''},environmentChosen=false,lastIdentity=null,lastContext=null,lastDay='';
  function profiles(){return FlowTraceConnections.resolve(page,TELEMETRY_COMPANY_TRACE_CONNECTIONS);}
  function sections(){return typeof hooks.sections==='function'?hooks.sections():[];}
  function boardEnvironment(){return typeof hooks.environment==='function'?hooks.environment():null;}
  function contextIdentity(){return JSON.stringify(typeof hooks.identity==='function'?hooks.identity():null);}
  // #1142: the selected Over time day, or null in Live. On today the window end moves, so the day key
  // and today flag identify it. A day change ends a pending request only (#1145): the controller moves
  // the view to a loaded trace's day and clears the trace when the reader moves elsewhere.
  function day(){var d=typeof hooks.day==='function'?hooks.day():null;return d && d.window && typeof d.window.from==='string'?d:null;}
  function dayKey(){var d=day();return d?JSON.stringify([d.key,!!d.today]):'';}
  // A new mapping diagram (a drill-down) keeps a loaded trace; losing its own diagram clears it (sync).
  function identity(){return JSON.stringify([profiles(),contextIdentity()]);}
  function requestKey(){return JSON.stringify([identity(),dayKey()]);}
  // The shortest relative lookback that reaches `from`.
  function reach(from,now){var hours=Math.max(1,Math.ceil((now-from)/3600000));return {start:'-'+(hours>9999?Math.ceil(hours/24)+'d':hours+'h'),end:''};}
  /* With no Trace start or end typed, a day is searched whole: an absolute connection sends its bounds,
     a relative-only one the shortest lookback that reaches its start. A link's own time wins (load, bounds). */
  function dayTime(p,request,now){
    var d=day();if(!p || !d || request.start || request.end)return null;
    return p.time.encoding!=='relative'?{start:d.window.from,end:d.window.to}:reach(Date.parse(d.window.from),now);
  }
  // #1145 (D9): a log line's trace is searched at the line's time ± 1 h, ending no later than now.
  function lineTime(p,request,line,now){
    var at=line && line.at?Date.parse(line.at):NaN;if(!p || !isFinite(at) || request.start || request.end)return null;
    var from=at-3600000;return p.time.encoding!=='relative'?{start:new Date(from).toISOString(),end:new Date(Math.max(from,Math.min(at+3600000,now))).toISOString()}:reach(from,now);
  }
  function changed(){if(!dead && hooks.changed)hooks.changed();}
  function cancel(){serial++;if(timeout)clearTimeout(timeout);timeout=null;if(abort)abort.abort();abort=null;busy=false;exemplar=null;report=null;}
  function clearInput(){form.input='';form.start='';form.end='';}
  // An account boundary retires this session permanently. Form edits/cancel
  // only retire a request and must never signal a shared account change.
  function retireAccount(){if(dead || accountRetired)return;accountRetired=true;cancel();report={stage:'account',code:'user_changed',error:'Host account changed. Reopen this view to start a new telemetry session.',requestAccepted:false,idMatched:false};changed();}
  function sync(){var key=identity(),context=contextIdentity(),today=dayKey();if(lastIdentity!==key){if(lastIdentity!==null && lastContext!==context)clearInput();cancel();lastIdentity=key;lastContext=context;}if(lastDay!==today){if(busy)cancel();lastDay=today;}var ps=profiles(),ids=Object.keys(ps);if(!ps[form.connection]){form.connection=ids.length===1?ids[0]:'';form.environment='';}var p=ps[form.connection],envs=p?Object.keys(p.environments):[];if(envs.indexOf(form.environment)<0)environmentChosen=false;if(!environmentChosen)form.environment=(p && matchTraceEnvironment(boardEnvironment(),p.environments)) || (envs.length===1?envs[0]:'');var ss=sections();if(!ss.some(function(s){return s.id===form.section;})){if(form.section)cancel();form.section=ss.length===1?ss[0].id:'';}return ps;}
  function available(){return !dead && !accountRetired && !!transport && typeof transport.describe==='function' && typeof transport.call==='function' && !(hooks.disabled && hooks.disabled());}
  // The time window a load would send now, so the form can say which one applies.
  // Link time is detected from the parsed link alone; linkUsable says whether
  // this connection can send it once the controls the link supplies are blank.
  function bounds(ps){
    var p=ps[form.connection],parsed;if(!p || !form.input.trim())return null;
    try{parsed=FlowTraceConnections.parseInput(p,form.input);}catch(e){return null;}
    function at(request){try{return FlowTraceConnections.timeWindow(p,parsed,request,Date.now());}catch(e){return null;}}
    var start=Object.prototype.hasOwnProperty.call(parsed,'start'),end=Object.prototype.hasOwnProperty.call(parsed,'end');
    if(start || end)return {lookback:null,linkTime:true,linkUsable:!!at({start:start?'':form.start,end:end?'':form.end})};
    var w=at(Object.assign({},form,dayTime(p,form,Date.now())));return w?{lookback:w.relative?w.start.slice(1):null,linkTime:false,linkUsable:false}:null;
  }
  // What a blank Trace start / end searches on the selected day, for the form note.
  function dayNote(ps){var d=day(),p=ps[form.connection];if(!d)return null;return {label:d.label || d.key || '',range:d.window.label || '',lookback:p && p.time.encoding==='relative'?dayTime(p,{},Date.now()).start.slice(1):null};}
  function snapshot(){var ps=sync();return {available:available(),busy:busy,form:Object.assign({},form),bounds:bounds(ps),profiles:Object.keys(ps).map(function(id){return {id:id,label:ps[id].label,lookback:ps[id].time.defaultLookback,environments:Object.keys(ps[id].environments).map(function(e){return {id:e,label:ps[id].environments[e].label || e};})};}),sections:sections().map(function(s){return {id:s.id,label:s.label};}),report:report?JSON.parse(JSON.stringify(report)):null,exemplar:exemplar,section:form.section,day:dayNote(ps)};}
  function set(field,value){if(dead || !Object.prototype.hasOwnProperty.call(form,field) || typeof value!=='string' || value.length>4096)return;sync();if(value===form[field])return;cancel();form[field]=value;if(field==='connection' || field==='environment')clearInput();if(field==='connection'){form.environment='';environmentChosen=false;}if(field==='environment')environmentChosen=true;sync();changed();}
  function errorText(e){var known={not_granted:'Connector permission was not granted.',needs_reauth:'Reconnect this connector in the host.',user_changed:'Host account changed; start a new trace request.',server_not_connected:'The configured connector is not connected.',server_not_found:'The configured connector was not found.',capability_removed:'The configured tool capability was removed.',capability_disabled:'The configured tool capability is disabled.'};return known[e && e.code] || telemetryTraceErrorText(e) || 'The host could not complete the read-only detail request.';}
  function lookbackText(r){return r.linkTime?'Trace not found in the time range of the pasted link. Paste the trace ID alone, then set Lookback.':r.lookback?'Trace not found in the last '+r.lookback+'. Try a longer lookback under Lookback.':'Trace not found between '+r.range.from.replace(/\.0+Z$/,'Z')+' and '+r.range.to.replace(/\.0+Z$/,'Z')+'. Try a wider range under Lookback.';}
  /* #1124: a trace chosen from a log line may never have been kept (sampling).
     The lookback hint stays only when the line is outside the window. */
  function lineOutside(r,line){var at=line.at?Date.parse(line.at):NaN,ms=function(v){return Date.parse(v.replace(/(\.\d{3})\d*Z$/,'$1Z'));};return isFinite(at) && (at<ms(r.range.from) || at>ms(r.range.to));}
  function notFoundText(r,line){
    if(!line)return lookbackText(r);
    var text='Trace not found. The provider may not have kept this trace (sampling).'+(line.next?' Try the next log line.':'');
    if(!lineOutside(r,line))return text;
    return text+' '+(r.lookback?'The log line is older than the last '+r.lookback+'; try a longer lookback under Lookback.':'The log line is outside '+r.range.from.replace(/\.0+Z$/,'Z')+' – '+r.range.to.replace(/\.0+Z$/,'Z')+'; try a wider range under Lookback.');
  }
  // line: {at, next} when the trace ID came from a log line (#1124).
  async function load(verify,line){
    line=line && typeof line==='object'?{at:typeof line.at==='string'?line.at:null,next:!!line.next}:null;
    sync();cancel();var mine=serial,key=requestKey(),ps=profiles(),p=ps[form.connection],request=Object.assign({},form),stage='configuration',resolved=null;abort=new AbortController();var signal=abort.signal;
    function active(){return !dead && mine===serial && !signal.aborted && key===requestKey() && available();}
    function check(){if(!active())FlowTraceConnections.fail('cancelled','Trace request expired.');}
    function update(next){if(!active())return;report=Object.assign(report || {},next);changed();}
    try{
      if(!available())FlowTraceConnections.fail('host','Direct trace retrieval is unavailable in this host.');
      if(!p)FlowTraceConnections.fail('configuration','Choose a configured trace connection.');
      if(sections().length>1 && !request.section)FlowTraceConnections.fail('input','Choose a diagram context for authored mappings.');
      stage='input';var now=Date.now(),time=lineTime(p,request,line,now) || dayTime(p,request,now),parsed=null;
      if(time){try{parsed=FlowTraceConnections.parseInput(p,request.input);}catch(e){}}
      resolved=FlowTraceConnections.input(p,parsed && !Object.prototype.hasOwnProperty.call(parsed,'start') && !Object.prototype.hasOwnProperty.call(parsed,'end')?Object.assign({},request,time):request,now);
      var safeArgs={};Object.keys(resolved.args).forEach(function(k){safeArgs[k]=[p.arguments.traceId,p.arguments.start,p.arguments.end,p.arguments.environment].indexOf(k)>=0?resolved.args[k]:'[configured]';});
      busy=true;update({mode:verify?'verify':'load',stage:'schema',connection:p.label,server:p.server,tool:p.tool,environment:resolved.environment,arguments:safeArgs,requestAccepted:false,idMatched:false});
      var deadline=Date.now()+30000;timeout=setTimeout(function(){if(mine!==serial || dead)return;serial++;abort.abort();timeout=null;busy=false;report=Object.assign(report || {},{stage:stage,error:'Trace '+stage+' request timed out. Retry with a bounded window.',code:'timeout'});changed();},30000);
      stage='schema';var descriptor={connection:request.connection,profile:p,environment:resolved.environment};
      var tool=await transport.describe(descriptor,signal);check();FlowTraceConnections.tool(p,tool,resolved.args);
      stage='detail';update({stage:stage});var result=await transport.call(descriptor,resolved.args,signal);check();
      if(result && result.isError)FlowTraceConnections.fail('detail',telemetryTraceErrorText(result) || 'The detail tool returned an error; no trace was accepted.');
      update({requestAccepted:true,stage:'response'});stage='response';
      var trace=p.adapter==='honeycomb-table-v1'?telemetryHoneycombTrace(result,resolved.traceId,p.allowedAttributes):telemetryTempoTrace(result,resolved.traceId,p.allowedAttributes);check();
      // #1197: one run_query on the same server reads the allowed attributes Honeycomb get_trace omits.
      if(p.provider==='honeycomb' && (p.allowedAttributes || []).length && trace.spans.length && !p.dataset)trace.warnings.push('Span attributes not loaded ('+p.allowedAttributes.join(', ')+'): the Honeycomb profile names no dataset.');
      else if(p.provider==='honeycomb' && (p.allowedAttributes || []).length && trace.spans.length){
        // The trace is already accepted: the query has its own deadline (the time left of
        // this request's 30 seconds) and a timeout drops only the attributes.
        if(timeout){clearTimeout(timeout);timeout=null;}
        stage='attributes';update({stage:stage});var query={connection:request.connection,profile:Object.assign({},p,{tool:'run_query'}),environment:resolved.environment},env=p.environments[resolved.environment];
        var limit=telemetryTraceDeadline(signal,deadline-Date.now());
        var passed=Object.assign({},resolved.args);[p.arguments.traceId,p.arguments.start,p.arguments.end].forEach(function(k){if(k)delete passed[k];});
        try{
          trace.warnings=trace.warnings.concat(await telemetryTraceAttributes(trace.spans,p.allowedAttributes,{traceId:resolved.traceId,environment:env && env.value,dataset:p.dataset,args:passed,
            from:'-'+(resolved.lookback || Math.max(1,Math.ceil((Date.now()-Date.parse(resolved.range.from))/3600000))+'h'),
            describe:function(){return limit.bounded(transport.describe(query,limit.signal));},call:function(input){return limit.bounded(transport.call(query,input,limit.signal));},
            stop:function(error){return !active() || !!(error && error.code==='user_changed');}}));
        }finally{limit.done();}
        check();
      }
      var e=telemetryTraceEnvelope({version:1,provider:p.provider,traceId:resolved.traceId,signal:'direct',selectionToken:'direct-'+mine,selectionReason:'Explicit trace ID loaded with '+p.label,observedAt:new Date().toISOString(),range:resolved.range,candidates:[{traceId:resolved.traceId,status:'unknown'}],spans:trace.spans,completeness:trace.completeness,warnings:trace.warnings.map(telemetryTraceErrorText).filter(Boolean),url:trace.url},p.allowedAttributes);
      exemplar=e;busy=false;update({stage:'complete',idMatched:true,spanCount:e.spans.length,completeness:e.completeness,warnings:e.warnings});return e;
    }catch(e){
      if(!dead && e && e.code==='user_changed'){if(transport && typeof transport.accountChanged==='function')transport.accountChanged();if(typeof hooks.accountChanged==='function')hooks.accountChanged();retireAccount();return null;}
      if(!dead)sync();if(dead || mine!==serial || signal.aborted || key!==requestKey())return null;
      busy=false;report=Object.assign(report || {mode:verify?'verify':'load',requestAccepted:false,idMatched:false},{stage:e.stage || stage,error:e && e.code==='trace_not_found' && resolved?notFoundText(resolved,line):errorText(e),serial:++telemetryDirectReports,logLine:!!line});if(line && e && e.code==='trace_not_found' && resolved)report.lookbackHint=lineOutside(resolved,line);if(e.code && /^[A-Za-z0-9_.-]{1,64}$/.test(e.code))report.code=e.code;changed();return null;
    }finally{if(mine===serial && timeout){clearTimeout(timeout);timeout=null;}}
  }
  /* #1078: a board Edit-mode change re-renders the page. The loaded trace moves to
     the next controller; its diagram context is kept by position, since section
     ids name this render's objects. A picked environment stays picked (#1081). */
  function carry(){if(dead || !exemplar)return null;var ss=sections();return {form:Object.assign({},form),environmentChosen:environmentChosen,exemplar:exemplar,report:report?JSON.parse(JSON.stringify(report)):null,section:ss.findIndex(function(s){return s.id===form.section;})};}
  function restore(state){
    if(dead || accountRetired || !state || !state.exemplar)return false;sync();
    Object.keys(form).forEach(function(key){if(typeof state.form[key]==='string')form[key]=state.form[key];});
    environmentChosen=state.environmentChosen===true;
    var section=sections()[state.section];form.section=section?section.id:'';sync();
    exemplar=state.exemplar;report=state.report;return true;
  }
  if(transport && typeof transport.onAccountChanged==='function')offAccount=transport.onAccountChanged(retireAccount);
  return {snapshot:snapshot,set:set,load:load,carry:carry,restore:restore,clear:function(){cancel();changed();},destroy:function(){cancel();dead=true;if(offAccount)offAccount();}};
}
