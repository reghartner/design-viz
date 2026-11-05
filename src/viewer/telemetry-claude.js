/* claude.ai Grafana telemetry adapter (#943). Standalone only, like the Jira
   adapter (live-status-claude.js): the artifact MCP namespace owns networking
   and consent; ctl.telemetry (viewer/telemetry.js) owns the refresh loop, the
   Metrics button and the map. This module is that loop's provider. Nothing is
   written back to the spec.

   createTelemetryGrafana(page, win, now) → null | {options, attach(ctl, page)}
     null unless win.claude.use exists and a carrier of the page (local or
     imported) binds a grafana, loki, sql or cloudwatch signal. options is the renderPage
     telemetry option {provider, source: 'Grafana', available: false}. attach(ctl, page) hands the
     adapter each render's controller (the Allow action, map retraction) and
     page (datasource UIDs and window from tracking.telemetry); it returns
     {destroy}. Attachment discovers metadata only; qualifying tools publish
     availability without calling a data tool. A disabled page never discovers.
     now() is the clock of the hourly query_sql cap.

   Connector: the first listed connector offering the bound query tools, preferring one named "Grafana". Argument names
   follow grafana/mcp-grafana's source as mirrored by the mock Worker
   (deploy/cloudflare/mock-grafana-mcp); they are not verified against a live
   Grafana server.

   One refresh (ctl.telemetry calls the provider when Metrics turns on, then at
   most once a minute while the document is visible), every call with the
   refresh's AbortSignal:
     get_annotations {type: 'annotation', limit: 100}     optional, once, first and alone
     query_prometheus range call                          one per grafana signal
     query_loki_logs metric range call                    one per loki signal
     query_cloudwatch full-window Sum                    one per cloudwatch signal
     query_sql {datasourceUid, query}                     per sql signal, at most hourly
     generate_deeplink explore link                       optional, once per carrier per page load,
                                                          unless the carrier authors links.query
   Times are relative to the server clock: now-<window> to now. tempo signals
   (exemplar traces) and honeycomb signals are not run here.

   Map: per carrier, each signal's series is the result's points added by time
   ([epoch ms, number], ascending), value its last point, 0 with no points
   when the query matched nothing; sql signals carry a value only. observedAt
   is the newest point of the refresh (the server clock); markers are that
   window's annotations; links are the authored ones plus the Explore link.

   Failures: a tool_error (or bad input) on one query leaves the other
   carriers fresh, keeps that signal's previous sample and reports the failed
   query through the provider's report.note(). Any other failure rejects the
   refresh, so ctl.telemetry keeps the previous map and shows the note.
   Approval and authorization answers also retract the map and stop calls
   until Metrics is turned on again; approval offers one "Allow Grafana"
   call through ctl.liveStatus.action. user_changed retires the adapter. */
var TELEMETRY_GRAFANA_TOOLS=['query_prometheus','query_loki_logs','search_tempo_traces','get_annotations','generate_deeplink'];
var TELEMETRY_GRAFANA_RUN=['grafana','loki','sql','cloudwatch'];
var TELEMETRY_GRAFANA_DATASOURCE={grafana:['prometheus','Prometheus'],loki:['loki','Loki'],sql:['sql','SQL'],cloudwatch:['cloudwatch','CloudWatch']};
var TELEMETRY_GRAFANA_SQL_MS=3600000,TELEMETRY_GRAFANA_POINTS=240,TELEMETRY_GRAFANA_PARALLEL=4;
var TELEMETRY_GRAFANA_ADD='Add a Grafana connector in claude.ai Settings → Connectors to see live metrics.';
var TELEMETRY_GRAFANA_ALLOW='Allow Grafana';
var TELEMETRY_GRAFANA_UNITS={s:1000,m:60000,h:3600000,d:86400000,w:604800000};
function telemetryGrafanaNumber(value){
  var n=typeof value==='number'?value:typeof value==='string' && value.trim()!==''?Number(value):NaN;
  return isFinite(n)?n:null;
}
function telemetryGrafanaOffered(candidate){
  return candidate && Array.isArray(candidate.tools)?candidate.tools.map(function(tool){return typeof tool==='string'?tool:tool && tool.name;}):[];
}
function telemetryGrafanaListed(list){return Array.isArray(list)?list:list && Array.isArray(list.servers)?list.servers:[];}
/* The connector name to call, or null: chosen by what it offers, never by its
   display name alone ("Grafana" only breaks a tie). */
function telemetryGrafanaServer(list,required){
  required=required || TELEMETRY_GRAFANA_TOOLS;
  var qualified=[];
  telemetryGrafanaListed(list).forEach(function(candidate){
    var name=candidate && (candidate.server || candidate.name),offered=telemetryGrafanaOffered(candidate);
    if(typeof name==='string' && name && required.every(function(tool){return offered.indexOf(tool)>=0;}) && qualified.indexOf(name)<0)qualified.push(name);
  });
  return qualified.indexOf('Grafana')>=0?'Grafana':qualified[0] || null;
}
/* Points of several series added by time, ascending. */
function telemetryGrafanaSum(series){
  var totals=Object.create(null),times=[];
  series.forEach(function(points){points.forEach(function(point){
    var key=String(point[0]);if(!(key in totals)){totals[key]=0;times.push(point[0]);}totals[key]+=point[1];
  });});
  return times.sort(function(a,b){return a-b;}).map(function(t){return [t,totals[String(t)]];});
}
function telemetryGrafanaPoint(seconds,value){
  var t=telemetryGrafanaNumber(seconds),v=telemetryGrafanaNumber(value);
  return t===null || v===null?null:[Math.round(t*1000),v];
}
/* query_prometheus: {data: matrix | vector} (or the bare array, or a
   Prometheus API {data: {result}}); NaN and Inf samples are dropped. */
function telemetryGrafanaPrometheus(payload){
  var data=Array.isArray(payload)?payload:payload && typeof payload==='object'?(Array.isArray(payload.data)?payload.data:payload.data && Array.isArray(payload.data.result)?payload.data.result:null):null;
  if(!data)return [];
  return telemetryGrafanaSum(data.map(function(entry){
    if(!entry || typeof entry!=='object')return [];
    var raw=Array.isArray(entry.values)?entry.values:Array.isArray(entry.value)?[entry.value]:[];
    return raw.map(function(point){return Array.isArray(point)?telemetryGrafanaPoint(point[0],point[1]):null;}).filter(Boolean);
  }));
}
/* query_loki_logs metric results: {data: [{values: [{timestamp: 'seconds.mmm', value}], labels}]}
   (range), [{timestamp, value, labels}] (instant) or Loki's [[seconds, 'value']] pairs.
   Log lines carry no value and are not a metric. */
function telemetryGrafanaLoki(payload){
  var data=Array.isArray(payload)?payload:payload && typeof payload==='object' && Array.isArray(payload.data)?payload.data:null;
  if(!data)return [];
  return telemetryGrafanaSum(data.map(function(entry){
    if(!entry || typeof entry!=='object')return [];
    if(Array.isArray(entry.values))return entry.values.map(function(point){
      return Array.isArray(point)?telemetryGrafanaPoint(point[0],point[1]):point && typeof point==='object'?telemetryGrafanaPoint(point.timestamp,point.value):null;
    }).filter(Boolean);
    var single=Object.prototype.hasOwnProperty.call(entry,'value')?telemetryGrafanaPoint(entry.timestamp,entry.value):null;
    return single?[single]:[];
  }));
}
/* query_cloudwatch returns a full-window Sum. Empty values/timestamps are
   unobserved even when statistics.sum is 0 or the response contains hints. */
function telemetryGrafanaCloudwatch(payload){
  if(!payload || !Array.isArray(payload.values) || !Array.isArray(payload.timestamps) || !payload.values.length || payload.values.length!==payload.timestamps.length)return null;
  var values=payload.values.map(telemetryGrafanaNumber),times=payload.timestamps.map(telemetryGrafanaNumber);
  if(values.some(function(v){return v===null;}) || times.some(function(t){return t===null || !isFinite(new Date(t).getTime());}))return null;
  var sum=telemetryGrafanaNumber(payload.statistics && payload.statistics.sum);
  if(sum===null){if(values.length!==1)return null;sum=values[0];}
  return {value:sum,observedAt:new Date(Math.max.apply(null,times)).toISOString()};
}
/* get_annotations: {Payload: [{time, text, tags}]} or a bare array. Kept when
   from <= time <= to, ascending; kind is deploy, else incident, else the first tag. */
function telemetryGrafanaMarkers(payload,from,to){
  var list=Array.isArray(payload)?payload:payload && typeof payload==='object'?(Array.isArray(payload.Payload)?payload.Payload:Array.isArray(payload.annotations)?payload.annotations:[]):[],out=[];
  list.forEach(function(item){
    if(!item || typeof item!=='object')return;
    var at=telemetryGrafanaNumber(item.time);if(at===null || at<from || at>to)return;
    var tags=Array.isArray(item.tags)?item.tags.filter(function(tag){return typeof tag==='string' && tag;}):[];
    var marker={at:new Date(at).toISOString(),kind:(tags.indexOf('deploy')>=0 || tags.indexOf('deployment')>=0)?'deploy':tags.indexOf('incident')>=0?'incident':tags[0] || 'annotation'};
    if(typeof item.text==='string' && item.text.trim())marker.label=item.text.trim();
    out.push(marker);
  });
  return out.sort(function(a,b){return a.at<b.at?-1:a.at>b.at?1:0;});
}
/* query_sql (shape unverified): the first numeric column of the first row of
   [row], {rows: [row]} or {data: [row]}, a row being an array or an object. */
function telemetryGrafanaSql(payload){
  var rows=Array.isArray(payload)?payload:payload && typeof payload==='object'?(Array.isArray(payload.rows)?payload.rows:Array.isArray(payload.data)?payload.data:null):null;
  var row=rows && rows[0],values=Array.isArray(row)?row:row && typeof row==='object'?Object.keys(row).map(function(key){return row[key];}):[];
  for(var i=0;i<values.length;i++){var n=telemetryGrafanaNumber(values[i]);if(n!==null)return n;}
  return null;
}
function telemetryGrafanaWindowMs(text){
  var match=/^([1-9][0-9]*)([smhdw])$/.exec(typeof text==='string'?text:'');
  return match?Number(match[1])*TELEMETRY_GRAFANA_UNITS[match[2]]:86400000;
}
/* Carriers with at least one signal this adapter runs, signals in authored order. */
function telemetryGrafanaJobs(bindings){
  var jobs=[];
  (Array.isArray(bindings)?bindings:[]).forEach(function(binding){
    if(!binding || typeof binding.id!=='string' || !binding.id || !binding.signals || typeof binding.signals!=='object')return;
    var signals=[];
    Object.keys(binding.signals).forEach(function(name){
      var signal=binding.signals[name];
      if(signal && TELEMETRY_GRAFANA_RUN.indexOf(signal.source)>=0 && (signal.source==='cloudwatch'?telemetryCloudwatchQuery(signal.query):typeof signal.query==='string'))
        signals.push({name:name,source:signal.source,query:signal.query,unit:typeof signal.unit==='string' && signal.unit?signal.unit:null});
    });
    if(signals.length)jobs.push({id:binding.id,signals:signals,binding:binding,links:binding.links && typeof binding.links==='object'?binding.links:{}});
  });
  return jobs;
}
/* generate_deeplink input for one carrier: an Explore pane on the datasource of
   its first grafana or loki signal, with every signal of that source. */
function telemetryGrafanaExplore(binding,config,range){
  var family=null,queries=[];
  Object.keys(binding.signals || {}).forEach(function(name){
    var signal=binding.signals[name];
    if(!signal || (signal.source!=='grafana' && signal.source!=='loki') || typeof signal.query!=='string')return;
    if(!family)family=signal.source;
    if(signal.source===family)queries.push({refId:queries.length<26?String.fromCharCode(65+queries.length):'Q'+queries.length,expr:signal.query});
  });
  var uid=family && config.grafana[TELEMETRY_GRAFANA_DATASOURCE[family][0]];
  return uid && queries.length?{resourceType:'explore',datasourceUid:uid,queries:queries,timeRange:{from:range.from,to:range.to}}:null;
}
/* Accept only navigable web URLs; never infer a Grafana hostname. */
function telemetryGrafanaUrl(value){try{var url=new URL(value);return typeof value==='string' && (url.protocol==='https:' || url.protocol==='http:') && !url.username && !url.password?value.trim():null;}catch(e){return null;}}
function telemetryGrafanaExploreUrl(binding,config,range,base){
  var input=telemetryGrafanaExplore(binding,config,range),url=telemetryGrafanaUrl(base);if(!input || !url)return null;
  var family=Object.keys(binding.signals || {}).map(function(k){return binding.signals[k].source;}).find(function(s){return s==='loki' || s==='grafana';});
  var uid=input.datasourceUid,panes={a:{datasource:uid,queries:input.queries.map(function(q){return {datasource:{uid:uid,type:family==='loki'?'loki':'prometheus'},expr:q.expr,range:true,refId:q.refId};}),range:input.timeRange}};
  return new URL(url).origin+'/explore?panes='+encodeURIComponent(JSON.stringify(panes))+'&schemaVersion=1';
}
/* Every bound carrier of a page, its resolved imported topology included,
   through the same walk ctl.telemetry uses. */
function telemetryGrafanaBound(page){
  if(typeof telemetryBindings!=='function' || typeof sectionRecords!=='function')return false;
  return telemetryGrafanaJobs(telemetryBindings(function(fn){sectionRecords(page).forEach(function(record){
    var d=record.section.diagram || {};
    Object.keys(d.nodes || {}).forEach(function(id){fn(d.nodes[id],id,page);});
    (Array.isArray(d.edges)?d.edges:[]).forEach(function(edge){fn(edge,edge && typeof edge==='object'?edge.from+'->'+edge.to:null,page);});
  });})).length>0;
}
function telemetryGrafanaError(message,state){var error=new Error(message);if(state)error.state=state;return error;}
function telemetryGrafanaRun(tasks,limit,halted){
  return new Promise(function(resolve){
    var next=0,active=0;
    function pump(){
      while(active<limit && next<tasks.length && !halted()){active++;Promise.resolve().then(tasks[next++]).then(done,done);}
      if(!active)resolve();
    }
    function done(){active--;pump();}
    pump();
  });
}
function createTelemetryGrafana(page,win,now,bound){
  if(!trackingTelemetry(page || {}).enabled)return null;
  var claude,use;
  try{claude=win && win.claude;use=claude && claude.use;}catch(ex){return null;}
  if(typeof use!=='function' || !(bound?bound():telemetryGrafanaBound(page)))return null;
  var clock=typeof now==='function'?now:function(){return Date.now();};
  var current=page,ctl=null,namespace=null,server=null,offered=[],retired=false,shown=false,generation=0;
  // blocked: {signal, error} — the Metrics session (one AbortSignal) a refusal stopped.
  // approval: {tool, input} — the call "Allow Grafana" repeats once.
  var blocked=null,approval=null;
  var last=Object.create(null),lastMarkers=[],links=Object.create(null),sql=Object.create(null);
  function code(error){return error && typeof error.code==='string'?error.code:'upstream_error';}
  function detail(error){var text=error && typeof error.message==='string'?error.message.trim():'';return text.length>160?text.slice(0,159)+'…':text || code(error);}
  function needed(){
    var bindings=ctl && ctl.telemetry && typeof ctl.telemetry.bindings==='function'?ctl.telemetry.bindings():null;
    if(!bindings || !bindings.length)bindings=telemetryBindings(function(fn){sectionRecords(current).forEach(function(record){var d=record.section.diagram || {};Object.keys(d.nodes || {}).forEach(function(id){fn(d.nodes[id],id,current);});(d.edges || []).forEach(function(e){fn(e,e.from+'->'+e.to,current);});});});
    var tools=[];telemetryGrafanaJobs(bindings).forEach(function(job){job.signals.forEach(function(s){var name={grafana:'query_prometheus',loki:'query_loki_logs',sql:'query_sql',cloudwatch:'query_cloudwatch'}[s.source];if(tools.indexOf(name)<0)tools.push(name);});});return tools;
  }
  function connect(refresh){
    var epoch=generation;
    if(!namespace){
      var pending;
      try{pending=use.call(claude,'mcp');}catch(ex){pending=null;}
      namespace=Promise.resolve(pending).then(function(mcp){if(!mcp)throw {code:'capability_disabled'};return mcp;});
    }
    return namespace.then(function(mcp){
      if(epoch!==generation || retired || !trackingTelemetry(current || {}).enabled)throw {code:'capability_removed'};
      if(server && !refresh)return mcp;
      return Promise.resolve(mcp.listTools()).then(function(list){
        if(epoch!==generation || retired || !trackingTelemetry(current || {}).enabled)throw {code:'capability_removed'};
        server=telemetryGrafanaServer(list,needed());
        if(!server){var required=needed(),missing=required;
          telemetryGrafanaListed(list).forEach(function(candidate){var offered=telemetryGrafanaOffered(candidate),absent=required.filter(function(tool){return offered.indexOf(tool)<0;});if(absent.length<missing.length)missing=absent;});
          throw {code:'missing_tools',message:'Grafana needs connector tools: '+missing.join(', ')};
        }
        telemetryGrafanaListed(list).forEach(function(candidate){if(candidate && (candidate.server || candidate.name)===server)offered=telemetryGrafanaOffered(candidate);});
        return mcp;
      });
    });
  }
  function forget(){last=Object.create(null);lastMarkers=[];links=Object.create(null);sql=Object.create(null);}
  function retract(signal){forget();if(ctl && ctl.telemetry && typeof ctl.telemetry.clear==='function')ctl.telemetry.clear(signal);}
  function syncAction(value){
    var live=ctl && ctl.liveStatus;
    if(!live || typeof live.action!=='function' || (!approval && !shown))return;
    var label=typeof live.snapshot==='function'?(live.snapshot() || {}).actionLabel || '':value && typeof value.actionLabel==='string'?value.actionLabel:'';
    // Another connector's action keeps the slot; ours comes back once it is free.
    if(approval){if(!label){shown=true;live.action(TELEMETRY_GRAFANA_ALLOW,allow);}}
    else{shown=false;if(label===TELEMETRY_GRAFANA_ALLOW)live.action('',null);}
  }
  function restart(){
    var telemetry=ctl && ctl.telemetry;
    if(telemetry && typeof telemetry.enabled==='function' && telemetry.enabled()){telemetry.setEnabled(false);telemetry.setEnabled(true);}
  }
  // The viewer's click: the call that needed approval, once, then a fresh Metrics session.
  function allow(){
    if(!approval || retired)return;
    var repeat=approval,epoch=generation;approval=null;syncAction();
    connect().then(function(mcp){if(epoch!==generation || retired)return;return mcp.callTool(server,repeat.tool,repeat.input);}).then(function(){if(epoch!==generation || retired)return;blocked=null;restart();},function(error){
      if(epoch!==generation || retired)return;
      if(['approval_required','consent_required'].indexOf(code(error))>=0){approval=repeat;syncAction();return;}
      blocked=null;restart();
    });
  }
  // A refused refresh: the note, whether the map is retracted, whether this Metrics session stops.
  function refuse(error,signal,repeat){
    var kind=code(error),note=null;
    if(signal && signal.aborted)return Promise.reject(telemetryGrafanaError('Grafana refresh cancelled'));
    if(kind==='user_changed'){
      retired=true;approval=null;blocked=null;retract(signal);syncAction();
      if(ctl && ctl.telemetry && typeof ctl.telemetry.accountChanged==='function')ctl.telemetry.accountChanged();
      if(ctl && ctl.telemetry && typeof ctl.telemetry.setAvailable==='function')ctl.telemetry.setAvailable(false);
      return Promise.reject(telemetryGrafanaError('Grafana stopped: the signed-in account changed'));
    }
    if(kind==='approval_required' || kind==='consent_required'){
      approval=repeat || {tool:'get_annotations',input:{type:'annotation',limit:100}};
      blocked={signal:signal,error:telemetryGrafanaError('Grafana access needs your approval','approval')};
      retract(signal);syncAction();return Promise.reject(blocked.error);
    }
    if(kind==='missing_tools')note=error.message;
    else if(kind==='needs_reauth')note='Reconnect Grafana in claude.ai Settings → Connectors';
    else if(['server_not_connected','selection_required','server_not_found'].indexOf(kind)>=0){note=TELEMETRY_GRAFANA_ADD;server=null;}
    else if(['not_in_manifest','blocked_by_policy','self_only'].indexOf(kind)>=0)note=repeat && repeat.tool==='query_cloudwatch'?'This page cannot call CloudWatch (query_cloudwatch) for your account.':'This page is not allowed to read Grafana for your account.';
    else if(['not_granted','capability_disabled','capability_removed'].indexOf(kind)>=0){note='Grafana is not available in this view.';namespace=null;server=null;}
    if(note){if(['server_not_connected','server_not_found','not_granted','capability_disabled','capability_removed'].indexOf(kind)>=0 && ctl && ctl.telemetry && typeof ctl.telemetry.setAvailable==='function')ctl.telemetry.setAvailable(false);blocked={signal:signal,error:telemetryGrafanaError(note)};retract(signal);return Promise.reject(blocked.error);}
    return Promise.reject(telemetryGrafanaError('Grafana did not answer'));
  }
  function provider(bindings,signal,report){
    var jobs=telemetryGrafanaJobs(bindings);
    if(!jobs.length)return Promise.resolve({});
    if(retired)return Promise.reject(telemetryGrafanaError('Grafana stopped: the signed-in account changed'));
    if(blocked && blocked.signal===signal)return Promise.reject(blocked.error);
    blocked=null;
    var config=telemetryProviderConfig(current || {},ctl),windowMs=telemetryGrafanaWindowMs(config.window);
    var range={from:'now-'+config.window,to:'now'},step=Math.max(60,Math.ceil(windowMs/1000/TELEMETRY_GRAFANA_POINTS));
    var options=signal?{signal:signal}:undefined,failures=[],fatal=null,annotations=null,order=0;
    function failed(rank,label,message){failures.push({rank:rank,text:label+': '+message});}
    // A query's failure: its own (tool_error, bad input) or the refresh's (everything else).
    function caught(rank,label,repeat,entry){return function(error){
      if(signal && signal.aborted)return;
      if(['tool_error','bad_request','transform_error'].indexOf(code(error))>=0){if(entry)entry.failed=true;if(label)failed(rank,label,detail(error));return;}
      if(!fatal)fatal={error:error,repeat:repeat};
    };}
    return connect(true).catch(function(error){
      if(!(signal && signal.aborted) && ctl && ctl.telemetry && typeof ctl.telemetry.setAvailable==='function')ctl.telemetry.setAvailable(false);
      throw error;
    }).then(function(mcp){
      if(signal && signal.aborted)throw {code:'capability_removed'};
      function call(tool,input){return Promise.resolve().then(function(){if(signal && signal.aborted)throw {code:'capability_removed'};return mcp.callTool(server,tool,input,options);});}
      var probe={tool:'get_annotations',input:{type:'annotation',limit:100}};
      return (offered.indexOf(probe.tool)>=0?call(probe.tool,probe.input):Promise.resolve(null)).then(function(result){annotations=result && result.payload;},caught(-1,'annotations',probe,null)).then(function(){
        if(fatal)return;
        var tasks=[];
        jobs.forEach(function(job){job.signals.forEach(function(entry){
          var rank=order++,label=job.id+' '+entry.name,names=TELEMETRY_GRAFANA_DATASOURCE[entry.source],uid=config.grafana[names[0]];
          if(!uid){entry.failed=true;failed(rank,label,'no '+names[1]+' datasource UID in tracking.telemetry.grafana.'+names[0]);return;}
          if(entry.source==='cloudwatch'){
            var query=telemetrySubstitute(entry.query,{account:config.grafana.accountId || '$account'});
            if(/\$(?:account\b|\{account\})/.test(query.accountId)){failed(rank,label,'set tracking.telemetry.grafana.accountId for $account');return;}
            var input={datasourceUid:uid,namespace:query.namespace,metricName:query.metric,region:query.region,accountId:query.accountId,
              dimensions:query.dimensions,statistic:query.statistic,period:Math.ceil(windowMs/1000),start:range.from,end:range.to};
            tasks.push(function(){return call('query_cloudwatch',input).then(function(result){
              var sample=telemetryGrafanaCloudwatch(result && result.payload);
              if(!sample){failed(rank,label,'query_cloudwatch returned no observation; check account, region and dimensions');return;}
              entry.value=sample.value;entry.observedAt=sample.observedAt;
            },caught(rank,label,{tool:'query_cloudwatch',input:input},entry));});
            return;
          }
          if(entry.source==='sql'){
            if(offered.indexOf('query_sql')<0){entry.failed=true;failed(rank,label,'the Grafana connector does not offer query_sql');return;}
            var key=(config.environment || '')+'\n'+uid+'\n'+entry.query,cached=sql[key];
            if(cached && clock()-cached.at<TELEMETRY_GRAFANA_SQL_MS){if(cached.value!==null)entry.value=cached.value;else entry.failed=true;return;}
            var input={datasourceUid:uid,query:entry.query},attempt={at:clock(),value:cached?cached.value:null};
            tasks.push(function(){sql[key]=attempt;return call('query_sql',input).then(function(result){
              var value=telemetryGrafanaSql(result && result.payload);
              if(value===null){entry.failed=true;failed(rank,label,'query_sql returned no number');return;}
              attempt.value=entry.value=value;
            },caught(rank,label,{tool:'query_sql',input:input},entry));});
            return;
          }
          var loki=entry.source==='loki',tool=loki?'query_loki_logs':'query_prometheus';
          var query=loki?{datasourceUid:uid,logql:entry.query,startRfc3339:range.from,endRfc3339:range.to,queryType:'range',stepSeconds:step}:
            {datasourceUid:uid,expr:entry.query,startTime:range.from,endTime:range.to,stepSeconds:step,queryType:'range'};
          tasks.push(function(){return call(tool,query).then(function(result){
            entry.points=(loki?telemetryGrafanaLoki:telemetryGrafanaPrometheus)(result && result.payload);
            var url=telemetryGrafanaUrl(result && result.payload && result.payload.exploreUrl);if(url)entry.exploreUrl=url;
          },caught(rank,label,{tool:tool,input:query},entry));});
        });});
        // Explore links: once per carrier and page load, unless the author linked a query.
        jobs.forEach(function(job){
          if(job.links.query || offered.indexOf('generate_deeplink')<0)return;
          var input=telemetryGrafanaExplore(job.binding,config,range);if(!input)return;
          var key=JSON.stringify([config.environment,input]);job.explore=key;
          if(Object.prototype.hasOwnProperty.call(links,key))return;
          tasks.push(function(){return call('generate_deeplink',input).then(function(result){
            if(signal && signal.aborted)return;var url=result && result.payload;links[key]=typeof url==='string' && /^https?:\/\//i.test(url.trim())?url.trim():null;
          },function(error){
            if(signal && signal.aborted)return;
            if(['tool_error','bad_request','transform_error'].indexOf(code(error))>=0){links[key]=null;return;}
            if(!fatal)fatal={error:error,repeat:{tool:'generate_deeplink',input:input}};
          });});
        });
        return telemetryGrafanaRun(tasks,TELEMETRY_GRAFANA_PARALLEL,function(){return !!fatal || !!(signal && signal.aborted);});
      });
    }).then(function(){
      if(signal && signal.aborted)return Promise.reject(telemetryGrafanaError('Grafana refresh cancelled'));
      if(fatal)return refuse(fatal.error,signal,fatal.repeat);
      var end=null,map={};
      jobs.forEach(function(job){job.signals.forEach(function(entry){
        if(entry.observedAt){var at=Date.parse(entry.observedAt);if(end===null || at>end)end=at;}
        (entry.points || []).forEach(function(point){if(end===null || point[0]>end)end=point[0];});
      });});
      if(end===null)end=clock();
      var markers=annotations!==null?telemetryGrafanaMarkers(annotations,end-windowMs,end):lastMarkers;
      jobs.forEach(function(job){
        var out={signals:{},observedAt:new Date(end).toISOString(),markers:JSON.parse(JSON.stringify(markers)),links:{}};
        job.signals.forEach(function(entry){
          var sample=null,previous=last[job.id] && last[job.id].signals[entry.name];
          if(entry.points)sample={value:entry.points.length?entry.points[entry.points.length-1][1]:0,series:entry.points};
          else if(typeof entry.value==='number'){sample={value:entry.value};if(entry.observedAt)sample.observedAt=entry.observedAt;}
          else if(entry.failed && previous)sample=JSON.parse(JSON.stringify(previous));
          if(!sample)return;
          if(entry.unit)sample.unit=entry.unit;else delete sample.unit;
          out.signals[entry.name]=sample;
        });
        if(!Object.keys(out.signals).length)return;
        if(typeof job.links.dashboard==='string')out.links.dashboard=job.links.dashboard;
        var returned=job.signals.map(function(entry){return entry.exploreUrl;}).filter(Boolean)[0];
        var query=typeof job.links.query==='string'?job.links.query:returned || job.explore && links[job.explore];
        if(!query){
          var sameRefresh=jobs.reduce(function(all,j){return all.concat(j.signals.map(function(e){return e.exploreUrl;}));},[]).filter(Boolean)[0];
          var base=sameRefresh || telemetryGrafanaUrl(job.links.dashboard) || telemetryGrafanaUrl(job.links.query) || telemetryGrafanaUrl(config.grafana.baseUrl);
          query=telemetryGrafanaExploreUrl(job.binding,config,range,base);
        }
        if(query)out.links.query=query;
        map[job.id]=out;
      });
      failures.sort(function(a,b){return a.rank-b.rank;});
      var note=!failures.length?'':failures.length===1?'1 Grafana query failed: '+failures[0].text:failures.length+' Grafana queries failed; first '+failures[0].text;
      if(report && typeof report.note==='function')report.note(note);
      last=map;lastMarkers=markers;
      return JSON.parse(JSON.stringify(map));
    },function(error){if(signal && signal.aborted)throw telemetryGrafanaError('Grafana refresh cancelled');return refuse(error,signal,null);});
  }
  /* History is one absolute daily range per explicitly bound Prometheus/LogQL
     metric. No annotations, links, SQL, query rewriting or live fallback. */
  function history(bindings,range,signal,report){
    var config=telemetryProviderConfig(current || {},ctl),epoch=generation,jobs=telemetryGrafanaJobs(bindings),map=Object.create(null),failures=[],fatal=null;
    function halted(){return retired || epoch!==generation || signal && signal.aborted || !!fatal;}
    if(halted())return Promise.reject(telemetryGrafanaError('Grafana history cancelled'));
    if(blocked && blocked.signal===signal)return Promise.reject(blocked.error);
    var runs=[];
    if(Array.isArray(range.endpoints))telemetryHistoryEndpoints(range).forEach(function(day){
      var last=runs[runs.length-1];
      if(last && Date.parse(day.at)-Date.parse(last.to)===86400000){last.to=day.at;last.endpoints.push(day);}
      else runs.push({from:day.at,to:day.at,endpoints:[day]});
    });else runs=[range];
    return connect(true).then(function(mcp){
      var tasks=[];
      jobs.forEach(function(job){job.signals.forEach(function(entry){
        if(entry.source!=='grafana' && entry.source!=='loki'){if(entry.source==='cloudwatch')failures.push(job.id+' '+entry.name+': CloudWatch history unsupported; sample is unobserved');return;}
        var loki=entry.source==='loki',tool=loki?'query_loki_logs':'query_prometheus',names=TELEMETRY_GRAFANA_DATASOURCE[entry.source],uid=config.grafana[names[0]],label=job.id+' '+entry.name;
        if(!uid || offered.indexOf(tool)<0){failures.push(label+': historical datasource/tool unavailable');return;}
        // DST preserves local-day endpoints: only a discontinuity starts a new
        // 86400-second run. Ordinary same-offset days remain one query/signal.
        runs.forEach(function(run){
          var input=loki?{datasourceUid:uid,logql:entry.query,startRfc3339:run.from,endRfc3339:run.to,queryType:'range',stepSeconds:86400}:
            {datasourceUid:uid,expr:entry.query,startTime:run.from,endTime:run.to,queryType:'range',stepSeconds:86400};
          tasks.push(function(){return liveStatusHistoryCall(function(){
            if(halted())return;
            return mcp.callTool(server,tool,input,{signal:signal,cache:{staleTime:config.environment?0:LIVE_STATUS_HISTORY_CACHE_MS,gcTime:config.environment?0:LIVE_STATUS_HISTORY_CACHE_MS}}).then(function(result){
              if(halted())return;
              var points=(loki?telemetryGrafanaLoki:telemetryGrafanaPrometheus)(result && result.payload);
              // Empty/malformed/retention responses remain gaps, distinct from an explicit 0.
              var out=map[job.id] || (map[job.id]={signals:{},links:job.links});
              if(run.endpoints)points=points.filter(function(point){return run.endpoints.some(function(day){return telemetryTime(point[0])===day.at;});});
              var saved=out.signals[entry.name] || (out.signals[entry.name]={series:[]});saved.series=saved.series.concat(points).sort(function(a,b){return Date.parse(telemetryTime(a[0]))-Date.parse(telemetryTime(b[0]));});if(entry.unit)saved.unit=entry.unit;
            },function(error){
              if(signal && signal.aborted)return;
              if(['tool_error','bad_request','transform_error'].indexOf(code(error))>=0)failures.push(label+': '+detail(error));
              else if(!fatal)fatal={error:error,repeat:{tool:tool,input:input}};
            });
          },signal);});
        });
      });});
      return telemetryGrafanaRun(tasks,LIVE_STATUS_HISTORY_CALLS,halted);
    }).then(function(){
      if(signal && signal.aborted || retired || epoch!==generation)throw telemetryGrafanaError('Grafana history cancelled');
      if(fatal)return refuse(fatal.error,signal,fatal.repeat);
      if(report && typeof report.note==='function')report.note(failures.length?failures.length+' historical queries unavailable: '+failures.join('; '):'');
      return map;
    },function(error){if(signal && signal.aborted)throw telemetryGrafanaError('Grafana refresh cancelled');return refuse(error,signal,null);});
  }
  return {
    options:{environmentChanged:function(){forget();approval=null;blocked=null;syncAction();},provider:provider,history:history,historyKey:function(){var config=telemetryProviderConfig(current || {},ctl);return [server,config.environment,config.grafana];},source:'Grafana',available:false},
    attach:function(next,page){
      if(page)current=page;
      ctl=next || null;shown=false;
      var offs=[],mine=ctl,epoch=++generation;
      function availability(value,note){if(epoch===generation && ctl===mine && mine && mine.telemetry && typeof mine.telemetry.setAvailable==='function')mine.telemetry.setAvailable(value,note);}
      availability(false);
      if(trackingTelemetry(current || {}).enabled && (bound?bound():telemetryGrafanaBound(current)) && !retired)connect(true).then(function(){availability(true);},function(error){availability(false,error && error.code==='missing_tools'?error.message:'');if(epoch===generation && error && error.code==='user_changed' && mine && mine.telemetry && mine.telemetry.accountChanged)mine.telemetry.accountChanged();});
      if(mine && mine.liveStatus && typeof mine.liveStatus.onChange==='function')offs.push(mine.liveStatus.onChange(syncAction));
      // Metrics turned off: the pending approval goes with it; turning it on asks again.
      if(mine && mine.telemetry && typeof mine.telemetry.onChange==='function')offs.push(mine.telemetry.onChange(function(snapshot){
        if(snapshot && !snapshot.available)forget();
        if(snapshot && !snapshot.enabled && approval){approval=null;blocked=null;syncAction();}
      }));
      syncAction();
      var handle={destroy:function(){offs.splice(0).forEach(function(off){if(typeof off==='function')off();});if(ctl===mine){generation++;approval=null;blocked=null;forget();syncAction();ctl=null;namespace=null;server=null;}}};
      if(mine && mine.liveStatus && typeof mine.liveStatus.onDestroy==='function')offs.push(mine.liveStatus.onDestroy(handle.destroy));
      return handle;
    }
  };
}
