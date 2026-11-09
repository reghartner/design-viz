/* Find a trace from a Loki log line in Load trace (#1099). Reader-requested
   only: one query_loki_logs log query per Find, through the Grafana connector
   that offers that tool (the one loki signals use). A lookup comes from
   tracking.telemetry.lookups and fills its $value slot; the reader may instead
   type a LogQL log query. Both expand $env, ${variables} and $account like
   signals, cover the Load trace lookback and return at most 10 lines, newest
   first. Choosing a line hands its trace id and span id to the direct trace
   loader (viewer/live-status.js). Nothing is written to the board.

   The transport supplies logsConnector() → server name | null (tool metadata
   only, no data call) and queryLogs(args, signal) → the decoded tool payload
   (viewer/telemetry-direct-mcp.js). Without them lookups are unavailable. */
var TELEMETRY_LOG_LIMIT=10,TELEMETRY_LOG_TYPED=':logql';
var TELEMETRY_LOG_ABSENT='Log lookups need a Grafana connector with query_loki_logs. Add it in claude.ai Settings → Connectors.';
var TELEMETRY_LOG_NOTES={absent:TELEMETRY_LOG_ABSENT,unsupported:'Log lookups need a Grafana connector, which this host does not provide.',checking:'Checking for the Grafana connector…',
  disabled:'Log lookups are unavailable in this view.',account:'Host account changed. Reopen this view to start a new telemetry session.'};
// Why hooks.disabled() turned lookups off (#1125); true keeps the general note.
var TELEMETRY_LOG_DISABLED={history:'Log lookups need a dated Over time day; this day has none.',board:'Log lookups need telemetry, which this board turns off.',
  host:'Log lookups need telemetry, which this host turns off.',closed:'This view was closed. Reopen it to look up log lines.'};
/* grafana/mcp-grafana tools/loki.go LogEntry (format full): {timestamp: '<unix ns>',
   line, labels, structuredMetadata?, parsed?}. Without Loki label types every
   label arrives in labels, so a field is looked up in all three. */
function telemetryLogField(entry,name){
  var groups=['structuredMetadata','parsed','labels'];
  for(var i=0;i<groups.length;i++){var group=entry[groups[i]];if(telemetryObject(group) && telemetryOwn(group,name) && typeof group[name]==='string' && group[name])return group[name];}
  return null;
}
function telemetryLogTime(value){
  if(typeof value!=='string' || !/^\d{1,19}$/.test(value))return null;
  var d=new Date(Number(BigInt(value)/1000000n));return isFinite(d.getTime())?d.toISOString():null;
}
function telemetryLogLines(payload,fields){
  if(!telemetryObject(payload) || !Array.isArray(payload.data)){var error=new Error('Loki returned no log lines in a known shape.');error.code='format';throw error;}
  var lines=payload.data.filter(function(e){return telemetryObject(e) && typeof e.line==='string';});
  return {metric:!lines.length && payload.data.some(function(e){return telemetryObject(e) && (Array.isArray(e.values) || telemetryOwn(e,'value'));}),
    rows:lines.slice(0,TELEMETRY_LOG_LIMIT).map(function(e){
      var trace=telemetryLogField(e,fields.traceId),span=telemetryLogField(e,fields.spanId),valid=!!trace && /^[0-9a-f]{16,32}$/i.test(trace);
      return {time:telemetryLogTime(e.timestamp),line:e.line.replace(/[\x00-\x1f\x7f]+/g,' ').trim().slice(0,240),traceId:valid?trace.toLowerCase():null,spanId:valid && span && /^[0-9a-f]{16}$/i.test(span)?span.toLowerCase():null,
        missing:valid?'':trace?'This log line\'s '+fields.traceId+' is not a trace ID':'This log line has no '+fields.traceId};
    })};
}
/* The Load trace lookback: its start control, else the connection's default.
   Relative windows stay relative so Grafana's clock decides "now". */
function telemetryLogRange(start,end,lookback){
  function fail(message){throw {code:'input',message:message};}
  start=start || (lookback?'-'+lookback:'');
  if(!start)fail('Choose a trace connection; its lookback bounds the log query.');
  var relative=/^-([1-9][0-9]{0,3}[smhdw])$/.exec(start),iso=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/;
  function ms(v){return Date.parse(v.replace(/(\.\d{3})\d+Z$/,'$1Z'));}
  if(relative){if(end)fail('A relative lookback cannot be combined with an end time.');return {startRfc3339:'now-'+relative[1],endRfc3339:'now',lookback:relative[1]};}
  if(!iso.test(start) || !iso.test(end || '') || !isFinite(ms(start)) || !isFinite(ms(end)) || ms(start)>ms(end))fail('Use a lookback such as -2h, or absolute UTC start and end times.');
  return {startRfc3339:start,endRfc3339:end,lookback:null};
}
function createTelemetryLogLookup(page,transport,hooks){
  hooks=hooks || {};
  var dead=false,retired=!!(transport && typeof transport.accountRetired==='function' && transport.accountRetired()),off=null,serial=0,abort=null,timer=null,busy=false,connector=null,lastIdentity=null,result=null;
  // traced: "Only lines with a trace ID" (#1158), reader state like the rest of the form.
  var form={lookup:'',value:'',logql:'',traced:true};
  function lookups(){return trackingTelemetry(page).lookups || null;}
  function supported(){return !!transport && typeof transport.logsConnector==='function' && typeof transport.queryLogs==='function';}
  // '' when enabled, else the cause: a TELEMETRY_LOG_DISABLED key, or true for an unnamed one.
  function disabled(){var cause=typeof hooks.disabled==='function'?hooks.disabled():'';return cause || '';}
  function note(s){return s==='disabled'?TELEMETRY_LOG_DISABLED[disabled()] || TELEMETRY_LOG_NOTES.disabled:TELEMETRY_LOG_NOTES[s] || '';}
  function changed(){if(!dead && typeof hooks.changed==='function')hooks.changed();}
  function cancel(){serial++;if(timer)clearTimeout(timer);timer=null;if(abort)abort.abort();abort=null;busy=false;}
  function sync(){
    var key=JSON.stringify(typeof hooks.identity==='function'?hooks.identity():null),ls=lookups() || {},ids=Object.keys(ls);
    if(key!==lastIdentity){if(lastIdentity!==null){cancel();result=null;}lastIdentity=key;}
    if(form.lookup!==TELEMETRY_LOG_TYPED && !telemetryOwn(ls,form.lookup)){form.lookup=ids.length?ids[0]:TELEMETRY_LOG_TYPED;form.value='';}
    return ls;
  }
  // A closed view and host telemetry off name themselves; without a logs connector the
  // other causes would send the reader to a fix that cannot work here (#1125).
  function state(){var cause=disabled();return retired?'account':cause==='closed' || cause==='host'?'disabled':!supported()?'unsupported':cause?'disabled':connector?connector.state:'checking';}
  // Tool metadata only, once per controller; Find checks the connector again.
  function discover(){
    if(connector || dead || retired || !supported() || disabled())return connector && connector.pending;
    var mine=connector={state:'checking'};
    mine.pending=Promise.resolve().then(function(){return transport.logsConnector();}).then(function(server){return server?'ready':'absent';},function(){return 'absent';}).then(function(next){if(dead || connector!==mine)return;connector={state:next};changed();});
    return mine.pending;
  }
  function retire(){if(dead || retired)return;retired=true;cancel();result=null;changed();}
  /* #1141: the selected Over time day {key, today, from, to, label, short} or null in Live. A Trace
     start or end typed under Lookback wins over the day; otherwise Find searches the whole day. */
  function day(){var d=typeof hooks.day==='function'?hooks.day():null;return d && typeof d.from==='string' && typeof d.to==='string'?d:null;}
  function daySearch(back){var d=day();return d && !(back && (back.start || back.end))?d:null;}
  function snapshot(){
    var ls=lookups();if(!ls)return null;sync();
    if(typeof hooks.wanted!=='function' || hooks.wanted())discover();
    var s=state();
    var searched=s==='ready' && daySearch(typeof hooks.lookback==='function'?hooks.lookback():null);
    return {available:s==='ready',state:s,note:note(s),busy:busy,form:Object.assign({},form),typed:TELEMETRY_LOG_TYPED,search:searched?'Loki · '+searched.label:'',
      lookups:Object.keys(ls).map(function(id){var l=ls[id];return {id:id,label:l.label,slot:telemetryLookupSlot(l.query),values:(l.values || []).slice()};}),
      result:result?Object.assign(JSON.parse(JSON.stringify(result)),{next:next()}):null};
  }
  function set(field,value){
    if(dead || !telemetryOwn(form,field) || typeof value!==typeof form[field] || typeof value==='string' && value.length>2000)return;
    sync();if(form[field]===value)return;cancel();form[field]=value;if(field==='lookup')form.value='';result=null;sync();changed();
  }
  function errorText(e){
    var approval='Grafana access needs your approval in claude.ai; allow it, then find again.',known={approval_required:approval,consent_required:approval,not_granted:'Grafana connector permission was not granted.',
      needs_reauth:'Reconnect Grafana in claude.ai Settings → Connectors.',server_not_connected:TELEMETRY_LOG_ABSENT,server_not_found:TELEMETRY_LOG_ABSENT,
      capability_removed:'The Grafana connector is no longer available in this view.',capability_disabled:'The Grafana connector is no longer available in this view.',not_in_manifest:'This page is not allowed to read Grafana for your account.',blocked_by_policy:'This page is not allowed to read Grafana for your account.'};
    if(e && known[e.code])return known[e.code];
    var text=e && typeof e.message==='string'?e.message.replace(/[\x00-\x1f\x7f]+/g,' ').trim():'';
    return text?(text.length>200?text.slice(0,199)+'…':text):'Grafana did not answer the log query.';
  }
  async function find(){
    if(dead || !lookups())return null;
    var ls=sync();cancel();var mine=serial,controller=new AbortController(),signal=controller.signal;abort=controller;
    var request=Object.assign({},form),typed=request.lookup===TELEMETRY_LOG_TYPED,lookup=typed?null:ls[request.lookup];
    function fail(message){throw {code:'input',message:message};}
    try{
      if(state()==='checking'){await discover();if(dead || mine!==serial || signal.aborted)return null;}
      if(state()!=='ready')fail(note(state()) || 'Log lookups are unavailable.');
      var config=typeof hooks.config==='function'?hooks.config():telemetryEnvironmentConfig(page),query=typed?request.logql.trim():lookup.query,slot=!typed && telemetryLookupSlot(query),value=request.value.trim();
      if(!query)fail('Type a LogQL log query.');
      if(slot && !value)fail('Enter a value for '+lookup.label+'.');
      if(slot && !telemetryLookupValuePattern.test(value))fail('A value cannot contain quotes, backticks, backslashes or control characters.');
      // The same environment pass as signals; $value is filled last so a value is never expanded.
      var values=Object.assign(Object.create(null),config.variables || {}),missing=null;delete values.value;
      if(config.environment)values.env=config.environment;
      if(config.grafana && config.grafana.accountId)values.account=config.grafana.accountId;
      // In an authored slot query ${value} is the slot; anywhere else it is an unset variable.
      function expand(text,slotted){return telemetrySubstitute(text,values,function(name){if((!slotted || name!=='value') && !missing)missing=name;},true);}
      var logql=expand(query,slot),uid=lookup && lookup.datasource?expand(lookup.datasource,false):config.grafana && config.grafana.loki;
      if(missing)fail('Set telemetry variable ${'+missing+'} in the active environment.');
      if(slot)logql=logql.replace(/\$\{value\}|\$value(?![A-Za-z0-9_])/g,function(){return value;});
      // #1158: ask Loki only for lines whose trace ID field passes telemetryLogLines' hex rule. A metric
      // query (no leading stream selector) or a field that is not a label name keeps the query as typed.
      var fields=lookup?lookup.fields:{traceId:'trace_id',spanId:'span_id'};
      if(request.traced && /^\s*\{/.test(logql) && telemetryLogFieldPattern.test(fields.traceId))logql+=' | '+fields.traceId+' =~ "[0-9a-fA-F]{16,32}"';
      if(!uid)fail('Set tracking.telemetry.grafana.loki to the Loki datasource UID.');
      var back=typeof hooks.lookback==='function'?hooks.lookback() || {}:{},searched=daySearch(back),range=searched?{startRfc3339:searched.from,endRfc3339:searched.to,lookback:null}:telemetryLogRange(back.start,back.end,back.lookback);
      var args={datasourceUid:uid,logql:logql,startRfc3339:range.startRfc3339,endRfc3339:range.endRfc3339,limit:TELEMETRY_LOG_LIMIT,direction:'backward',queryType:'range'};
      busy=true;result={lookup:request.lookup,query:logql,lookback:range.lookback,rows:[]};changed();
      // As the direct trace load: a call that never answers is retired after 30 s.
      timer=setTimeout(function(){if(dead || mine!==serial)return;timer=null;serial++;controller.abort();abort=null;busy=false;result.error='The log query timed out after 30 seconds. Retry, or use a shorter lookback.';changed();},30000);
      var payload=await transport.queryLogs(args,signal);
      if(dead || mine!==serial || signal.aborted)return null;
      var parsed=telemetryLogLines(payload,fields);if(request.traced)parsed.rows=parsed.rows.filter(function(row){return !!row.traceId;});
      parsed.rows.forEach(function(row){row.value=slot?value:row.line;});
      busy=false;abort=null;result.rows=parsed.rows;
      var where=searched?'on '+(searched.short || searched.key):range.lookback?'in the last '+range.lookback:'in the selected range';
      if(!parsed.rows.length)result.note=parsed.metric?'That is a metric query; type a log query that returns lines.':request.traced?'No log lines with a trace ID '+where+'. Clear "Only lines with a trace ID" to see every line.':'No matching log lines '+where+'.';
      changed();return JSON.parse(JSON.stringify(result));
    }catch(e){
      if(dead || mine!==serial || signal.aborted)return null;
      busy=false;abort=null;
      if(e && e.code==='user_changed'){if(transport && typeof transport.accountChanged==='function')transport.accountChanged();if(typeof hooks.accountChanged==='function')hooks.accountChanged();retire();return null;}
      result={lookup:request.lookup,rows:[],error:errorText(e)};changed();return null;
    }finally{if(mine===serial && timer){clearTimeout(timer);timer=null;}}
  }
  // The row a reader chose, and what happened when its trace loaded.
  function row(index){var r=result && result.rows[index];return r?JSON.parse(JSON.stringify(r)):null;}
  function chosen(index,note){if(!result || !result.rows[index])return;result.chosen=index;result.chosenNote=note || '';changed();}
  // The next row with a trace id after `from` (default: the chosen row), or -1 (#1124).
  function next(from){if(!result)return -1;if(from===undefined)from=result.chosen;if(typeof from!=='number')return -1;for(var i=from+1;i<result.rows.length;i++)if(result.rows[i].traceId)return i;return -1;}
  if(transport && typeof transport.onAccountChanged==='function')off=transport.onAccountChanged(retire);
  return {snapshot:snapshot,set:set,find:find,row:row,chosen:chosen,next:next,clear:function(){cancel();result=null;changed();},destroy:function(){cancel();dead=true;if(off)off();}};
}
