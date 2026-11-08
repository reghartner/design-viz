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
     query_loki_logs metric range call                    one per loki signal; a query with
                                                          $__range is one instant call instead
     query_cloudwatch full-window Sum                    one per cloudwatch signal
     query_sql {datasourceUid, query}                     per sql signal, at most hourly
     generate_deeplink explore link                       optional, once per signal per page load,
                                                          unless the signal authors links.query
   Times are relative to the server clock: now-<window> to now. tempo signals
   (exemplar traces) and honeycomb signals are not run here.

   Map: per carrier, each signal's series is the result's points added by time
   ([epoch ms, number], ascending), value its last point, 0 with no points
   when the query matched nothing (unobserved when the signal sets
   missingMeansZero: false); sql signals carry a value only. observedAt
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
var TELEMETRY_GRAFANA_RUN=['grafana','loki','sql','cloudwatch','cloudwatchLogs'];
var TELEMETRY_GRAFANA_DATASOURCE={grafana:['prometheus','Prometheus'],loki:['loki','Loki'],sql:['sql','SQL'],cloudwatch:['cloudwatch','CloudWatch'],cloudwatchLogs:['cloudwatch','CloudWatch Logs']};
var TELEMETRY_GRAFANA_SQL_MS=3600000,TELEMETRY_GRAFANA_POINTS=240,TELEMETRY_GRAFANA_PARALLEL=4;
var TELEMETRY_GRAFANA_ADD='Add a Grafana connector in claude.ai Settings → Connectors to see live metrics.';
var TELEMETRY_GRAFANA_ALLOW='Allow Grafana';
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
  return t===null || v===null || !isFinite(new Date(t*1000).getTime())?null:[Math.round(t*1000),v];
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
   (range), [{timestamp, value, labels}] (instant) or Loki's [[seconds, 'value']] pairs
   and vector {value: [seconds, 'value']}.
   Log lines carry no value and are not a metric. */
function telemetryGrafanaLoki(payload){
  var data=Array.isArray(payload)?payload:payload && typeof payload==='object' && Array.isArray(payload.data)?payload.data:null;
  if(!data)return [];
  return telemetryGrafanaSum(data.map(function(entry){
    if(!entry || typeof entry!=='object')return [];
    if(Array.isArray(entry.values))return entry.values.map(function(point){
      return Array.isArray(point)?telemetryGrafanaPoint(point[0],point[1]):point && typeof point==='object'?telemetryGrafanaPoint(point.timestamp,point.value):null;
    }).filter(Boolean);
    var single=Array.isArray(entry.value)?telemetryGrafanaPoint(entry.value[0],entry.value[1]):Object.prototype.hasOwnProperty.call(entry,'value')?telemetryGrafanaPoint(entry.timestamp,entry.value):null;
    return single?[single]:[];
  }));
}
/* Conservative LogQL metric grammar for empty LIVE results. Strings cannot
   smuggle function names; unsupported expressions remain unobserved. */
function telemetryLokiCountingQuery(query){
  if(typeof query!=='string')return false;
  var text=query.replace(/"(?:\\.|[^"\\])*"|`[^`]*`/g,'Q').trim();
  if(/["`]/.test(text))return false;
  function unwrap(value){
    value=value.trim();
    if(value[0]!=='(')return null;
    var depth=0;
    for(var i=0;i<value.length;i++){if(value[i]==='(')depth++;if(value[i]===')' && --depth===0)return i===value.length-1?value.slice(1,-1):null;}
    return null;
  }
  function metric(value,depth){
    if(depth>8)return false;value=value.trim();
    var inner=unwrap(value);if(inner!==null)return metric(inner,depth+1);
    var sum=/^sum\s*(?:(?:by|without)\s*\([A-Za-z_][A-Za-z0-9_,\s]*\)\s*)?(\(.*?\))(?:\s*(?:by|without)\s*\([A-Za-z_][A-Za-z0-9_,\s]*\))?$/.exec(value);
    if(sum){inner=unwrap(sum[1]);return inner!==null && metric(inner,depth+1);}
    var range=/^(count_over_time|rate)\s*\((.*)\)$/.exec(value);
    return !!range && /^\{\s*[A-Za-z_][A-Za-z0-9_]*\s*(?:=|!=|=~|!~)\s*Q(?:\s*,\s*[A-Za-z_][A-Za-z0-9_]*\s*(?:=|!=|=~|!~)\s*Q)*\s*\}(?:\s*(?:\|=|\|~|!=|!~)\s*Q)*\s*\[\s*(?:\$__range|(?:\d+(?:ms|s|m|h|d|w|y))+)\s*\]$/.test(range[2].trim());
  }
  return metric(text,0);
}
/* A LogQL query with $__range asks for the whole-window total: $__range
   becomes the window in seconds and the query runs once, as an instant query
   at the window end. $__range_s and $__range_ms are other names. */
var TELEMETRY_LOKI_RANGE=/\$__range\b/g;
function telemetryLokiWindowTotal(query){return typeof query==='string' && query.search(TELEMETRY_LOKI_RANGE)>=0;}
function telemetryLokiWindowQuery(query,windowMs){return query.replace(TELEMETRY_LOKI_RANGE,Math.round(windowMs/1000)+'s');}
function telemetryLokiEmpty(payload){
  return !!payload && !payload.error && payload.status==='success' && payload.data &&
    ['matrix','vector'].indexOf(payload.data.resultType)>=0 && Array.isArray(payload.data.result) && !payload.data.result.length ||
    !!payload && !payload.error && (!payload.status || payload.status==='success') && Array.isArray(payload.data) && !payload.data.length;
}
/* CloudWatch values are per-period statistics, never tool summary averages.
   Average needs the underlying SampleCount at each identical timestamp. */
function telemetryGrafanaCloudwatchEmpty(payload){return !!payload && !payload.error && (!payload.status || payload.status==='success') && Array.isArray(payload.values) && Array.isArray(payload.timestamps) && !payload.values.length && !payload.timestamps.length;}
function telemetryCloudwatchPoints(payload){
  if(!payload || payload.error || payload.status && payload.status!=='success' || !Array.isArray(payload.values) || !Array.isArray(payload.timestamps) || !payload.values.length || payload.values.length!==payload.timestamps.length || payload.values.length>1440)return null;
  var seen=Object.create(null),points=[];
  for(var i=0;i<payload.values.length;i++){
    var v=telemetryGrafanaNumber(payload.values[i]),t=telemetryGrafanaNumber(payload.timestamps[i]);
    if(v===null || t===null || !isFinite(new Date(t).getTime()) || seen[t])return null;
    seen[t]=true;points.push([t,v]);
  }
  return points.sort(function(a,b){return a[0]-b[0];});
}
// Only buckets at or after range.to: nothing inside the window was observed.
function telemetryCloudwatchAfterWindow(payload,range){var points=telemetryCloudwatchPoints(payload),end=Date.parse(range.to);return !!points && points.every(function(p){return p[0]>=end;});}
function telemetryGrafanaCloudwatch(payload,statistic,weights,range,period){
  var points=telemetryCloudwatchPoints(payload);if(!points)return null;
  // A bucket that starts at or after range.to is outside the window: query_cloudwatch
  // returns one stamped exactly at end for dense metrics. Points before the rounded start fail.
  var end=range?Date.parse(range.to):Infinity,inWindow=function(p){return p[0]<end;};
  if(range && points.some(function(p){return p[0]<Math.floor(Date.parse(range.from)/(period*1000))*period*1000;}))return null;
  points=points.filter(inWindow);if(!points.length)return null;
  var values=points.map(function(p){return p[1];}),value;
  if(statistic==='Average'){
    var counts=telemetryCloudwatchPoints(weights);if(counts)counts=counts.filter(inWindow);if(!counts || counts.length!==points.length)return null;
    var sum=0,count=0;
    for(var i=0;i<points.length;i++){if(counts[i][0]!==points[i][0] || counts[i][1]<=0)return null;sum+=points[i][1]*counts[i][1];count+=counts[i][1];}
    value=sum/count;
  }else if(statistic==='Maximum')value=Math.max.apply(null,values);
  else if(statistic==='Minimum')value=Math.min.apply(null,values);
  else if(!statistic || statistic==='Sum' || statistic==='SampleCount')value=values.reduce(function(a,b){return a+b;},0);
  else return null;
  return isFinite(value)?{value:value,series:points,observedAt:new Date(points[points.length-1][0]).toISOString()}:null;
}
function telemetryCloudwatchPeriod(query,range,now){
  var duration=(Date.parse(range.to)-Date.parse(range.from))/1000,age=(now-Date.parse(range.from))/86400000;
  if(!(duration>0) || age>455)throw {code:'bad_request',message:'CloudWatch window is outside its 455-day retention'};
  var minimum=age>=63?3600:age>=15?300:60,period=query.period;
  if(period!==undefined){
    if(!Number.isInteger(period) || period<minimum || period%minimum || Math.ceil(duration/period)>1440)throw {code:'bad_request',message:'CloudWatch period must be a multiple of '+minimum+' seconds and return at most 1440 points'};
    return period;
  }
  // Compact useful trends: 6h has 72 five-minute points; 24h has 24 hourly points.
  var desired=duration<=21600?300:duration<=172800?3600:Math.ceil(duration/72/3600)*3600;
  return Math.max(minimum,Math.ceil(Math.max(desired,duration/1440)/minimum)*minimum);
}
/* Grafana's hosted namespace exposes payload; raw MCP can wrap the same JSON
   in structuredContent or text. Refuse errors before unwrapping any sample. */
function telemetryGrafanaPayload(result){
  var value=result;
  for(var depth=0;depth<4;depth++){
    if(value && value.isError)throw {code:'tool_error',message:telemetryProviderErrorText(value) || 'Grafana tool returned an error'};
    if(value && telemetryOwn(value,'payload')){value=value.payload;continue;}
    if(value && telemetryOwn(value,'structuredContent')){value=value.structuredContent;continue;}
    if(value && Array.isArray(value.content)){var text=value.content.filter(function(c){return c && c.type==='text';}).map(function(c){return c.text;}).join('\n');try{value=JSON.parse(text);continue;}catch(e){return null;}}
    if(typeof value==='string'){try{value=JSON.parse(value);continue;}catch(e){return null;}}
    return value;
  }
  return null;
}
/* grafana/mcp-grafana tools/cloudwatch_logs.go: logs are rows of string cells;
   totalFound=max(rows,recordsMatched) is NOT an aggregate value. */
function telemetryGrafanaCloudwatchLogs(payload,query){
  if(!payload || payload.status!=='Complete')throw {code:'tool_error',message:'query_cloudwatch_logs '+(payload && typeof payload.status==='string'?payload.status:'returned a malformed status')+'; retry after the query completes'};
  if(!Array.isArray(payload.logs))throw {code:'tool_error',message:'query_cloudwatch_logs returned malformed rows'};
  if(!payload.logs.length){
    if(payload.totalFound===0)return 0;
    throw {code:'tool_error',message:'query_cloudwatch_logs returned no aggregate row'};
  }
  var row=payload.logs[0],field=query.valueField;
  if(!telemetryObject(row))throw {code:'tool_error',message:'query_cloudwatch_logs returned a malformed first row'};
  if(!field)field=Object.keys(row)[0];
  var value=field && telemetryOwn(row,field)?telemetryGrafanaNumber(row[field]):null;
  if(value===null)throw {code:'tool_error',message:'query_cloudwatch_logs first row needs numeric field '+(field || '(first column)')};
  return value;
}
/* Only a terminal plain count after filter/parse stages can be rewritten.
   Strings and regexes are opaque: a pipe inside one is never a pipeline. */
function telemetryLogTrend(query,windowMs){
  if(query.trend===false)return null;if(query.trend)return query.trend;
  var text=query.query,parts=[],start=0,quote=null,escaped=false;
  for(var i=0;i<text.length;i++){
    var c=text[i];if(escaped){escaped=false;continue;}if(c==='\\'){escaped=true;continue;}
    if(quote){if(c===quote)quote=null;continue;}if(c==='"' || c==="'" || c==='`' || c==='/'){quote=c;continue;}
    if(c==='|'){parts.push(text.slice(start,i).trim());start=i+1;}
  }
  if(quote || escaped)return null;parts.push(text.slice(start).trim());
  var match=/^stats\s+count\(\s*\)\s+as\s+([A-Za-z_][A-Za-z0-9_]*)$/i.exec(parts.pop());
  if(!match || parts.some(function(p){return !/^(?:filter|parse)\s+\S/i.test(p);}))return null;
  var minutes=Math.max(1,Math.ceil(windowMs/60000/120)),hours=Math.ceil(minutes/60),days=Math.ceil(hours/24);
  var bin=minutes<=60?minutes+'m':hours<=24?hours+'h':days+'d',seconds=minutes<=60?minutes*60:hours<=24?hours*3600:days*86400;
  return {query:parts.concat(['stats count() as '+match[1]+' by bin('+bin+') as flowview_time']).join(' | '),timeField:'flowview_time',valueField:match[1],binSeconds:seconds};
}
function telemetryGrafanaLogTrend(payload,query,range){
  if(!payload || payload.status!=='Complete' || !Array.isArray(payload.logs))throw {code:'tool_error',message:'Log trend did not return Complete rows'};
  if(payload.logs.length>1000)throw {code:'tool_error',message:'Log trend exceeded the 1000-row limit'};
  var seen=Object.create(null),points=payload.logs.map(function(row){
    var raw=telemetryObject(row)?row[query.timeField]:null,value=telemetryObject(row)?telemetryGrafanaNumber(row[query.valueField]):null;
    // Logs Insights renders UTC timestamps without an offset in some versions.
    var time=typeof raw==='string' && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(raw)?Date.parse(raw.replace(' ','T')+'Z'):Date.parse(telemetryTime(raw));
    if(!isFinite(time) || value===null || value<0 || seen[time] || time<(query.binSeconds?Math.floor(Date.parse(range.from)/(query.binSeconds*1000))*query.binSeconds*1000:Date.parse(range.from)) || time>=Date.parse(range.to))throw {code:'tool_error',message:'Log trend needs unique in-window timestamps and nonnegative numeric counts'};
    seen[time]=true;return [time,value];
  }).sort(function(a,b){return a[0]-b[0];});
  return {series:points,truncated:payload.logs.length===1000};
}
function telemetryGrafanaLogDetails(payload,config,range){
  if(!payload || payload.status!=='Complete' || !Array.isArray(payload.logs))throw {code:'tool_error',message:'Log details query did not return Complete rows'};
  var limit=config.limit || 20,rows=payload.logs.slice(0,limit).map(function(row,index){
    var label=telemetryObject(row) && telemetryOwn(row,config.labelField)?row[config.labelField]:null;
    var value=telemetryObject(row) && telemetryOwn(row,config.valueField)?telemetryGrafanaNumber(row[config.valueField]):null;
    if(!telemetryText(label) || value===null || value<0)throw {code:'tool_error',message:'Log details row '+(index+1)+' needs '+config.labelField+' and nonnegative numeric '+config.valueField};
    var cells=(config.columns || []).map(function(column){
      if(!telemetryOwn(row,column.field) || row[column.field]===null)return '(missing)';
      if(typeof row[column.field]!=='string')throw {code:'tool_error',message:'Log details field '+column.field+' must be text'};
      return row[column.field];
    });
    return {label:label,value:value,cells:cells};
  });
  return telemetryLogDetails({status:'complete',rows:rows,returnedRows:payload.logs.length,limit:limit,range:range});
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
/* This eligibility guard recognizes code macros, not SQL semantics. Strip
   dialect strings/comments; reject unterminated or ambiguous quoted syntax. */
function telemetrySqlHistoryQuery(text){
  var code='',i=0;
  while(i<text.length){
    var c=text[i],next=text[i+1];
    if(c==='#' || c==='-' && next==='-'){
      while(i<text.length && text[i]!=='\n' && text[i]!=='\r')i++;
      code+=' ';continue;
    }
    if(c==='/' && next==='*'){
      var depth=1;i+=2;
      while(i<text.length && depth){
        if(text[i]==='/' && text[i+1]==='*'){depth++;i+=2;}
        else if(text[i]==='*' && text[i+1]==='/'){depth--;i+=2;}else i++;
      }
      if(depth)return false;code+=' ';continue;
    }
    if(c==='$'){
      var dollar=/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(text.slice(i));
      if(dollar){var end=text.indexOf(dollar[0],i+dollar[0].length);if(end<0)return false;i=end+dollar[0].length;code+=' ';continue;}
    }
    if(c==="'" || c==='"' || c==='`' || c==='['){
      var close=c==='['?']':c,closed=false;i++;
      while(i<text.length){
        // Backslash quoting differs by dialect/session. Do not guess which
        // following characters are executable in a historical query.
        if(text[i]==='\\')return false;
        if(text[i]===close){if(text[i+1]===close){i+=2;continue;}i++;closed=true;break;}
        i++;
      }
      if(!closed)return false;code+=' ';continue;
    }
    code+=c;i++;
  }
  return /\$__timeFilter\s*\(/.test(code) || /\$__from\b/.test(code) && /\$__to\b/.test(code);
}
function telemetryGrafanaWindowMs(text){
  return telemetryWindowMs(text);
}
/* Carriers with at least one signal this adapter runs, signals in authored order. */
function telemetryGrafanaJobs(bindings){
  var jobs=[];
  (Array.isArray(bindings)?bindings:[]).forEach(function(binding){
    if(!binding || typeof binding.id!=='string' || !binding.id || !binding.signals || typeof binding.signals!=='object')return;
    var signals=[];
    Object.keys(binding.signals).forEach(function(name){
      var signal=binding.signals[name];
      if(signal && TELEMETRY_GRAFANA_RUN.indexOf(signal.source)>=0 && (signal.source==='cloudwatch'?telemetryCloudwatchQuery(signal.query):signal.source==='cloudwatchLogs'?telemetryCloudwatchLogsQuery(signal.query):typeof signal.query==='string'))
        signals.push({name:name,source:signal.source,query:signal.query,links:signal.links || {},error:signal.error,breakdownError:signal.breakdownError,trendError:signal.trendError,unit:typeof signal.unit==='string' && signal.unit?signal.unit:null,missingMeansZero:signal.missingMeansZero});
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
  function detail(error){var text=error && typeof error.message==='string'?error.message.replace(/[\x00-\x1f\x7f]/g,' ').trim():'';return text.length>160?text.slice(0,159)+'…':text || code(error);}
  function needed(){
    var bindings=ctl && ctl.telemetry && typeof ctl.telemetry.bindings==='function'?ctl.telemetry.bindings():null;
    if(!bindings || !bindings.length)bindings=telemetryBindings(function(fn){sectionRecords(current).forEach(function(record){var d=record.section.diagram || {};Object.keys(d.nodes || {}).forEach(function(id){fn(d.nodes[id],id,current);});(d.edges || []).forEach(function(e){fn(e,e.from+'->'+e.to,current);});});});
    var tools=[];telemetryGrafanaJobs(bindings).forEach(function(job){job.signals.forEach(function(s){var name={grafana:'query_prometheus',loki:'query_loki_logs',sql:'query_sql',cloudwatch:'query_cloudwatch',cloudwatchLogs:'query_cloudwatch_logs'}[s.source];if(tools.indexOf(name)<0)tools.push(name);});});return tools;
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
        if(!server){var candidates=telemetryGrafanaListed(list).map(function(c){return {name:c.server || c.name,count:needed().filter(function(t){return telemetryGrafanaOffered(c).indexOf(t)>=0;}).length};}).filter(function(c){return c.count && typeof c.name==='string';}).sort(function(a,b){return b.count-a.count || (a.name==='Grafana'?-1:1);});server=candidates.length?candidates[0].name:null;}
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
  function provider(bindings,signal,report,windowRange){
    if(!windowRange || !telemetryTime(windowRange.from) || !telemetryTime(windowRange.to))windowRange=null;
    var jobs=telemetryGrafanaJobs(bindings);
    if(!jobs.length)return Promise.resolve({});
    if(retired)return Promise.reject(telemetryGrafanaError('Grafana stopped: the signed-in account changed'));
    if(blocked && blocked.signal===signal)return Promise.reject(blocked.error);
    blocked=null;
    var config=telemetryProviderConfig(current || {},ctl),windowMs=telemetryGrafanaWindowMs(config.window);
    var anchoredEnd=windowRange?Date.parse(windowRange.to):clock(),anchoredRange=windowRange || {from:new Date(anchoredEnd-windowMs).toISOString(),to:new Date(anchoredEnd).toISOString()};
    windowMs=Date.parse(anchoredRange.to)-Date.parse(anchoredRange.from);
    var range=windowRange || {from:'now-'+config.window,to:'now'},step=Math.max(60,Math.ceil(windowMs/1000/TELEMETRY_GRAFANA_POINTS));
    var options=signal?{signal:signal}:undefined,notices=[],failures=[],fatal=null,annotations=null,order=0,reportedNote=null;
    function started(job,entry){if(report && report.pending)report.pending(job.id,entry.name);}
    function settled(job,entry){
      if(!report || !report.settled)return;var sample=null;
      if(typeof entry.value==='number')sample={value:entry.value,observedAt:entry.observedAt || null};
      else if(entry.points && entry.points.length)sample={value:entry.points[entry.points.length-1][1],series:entry.points,observedAt:new Date(entry.points[entry.points.length-1][0]).toISOString()};
      if(sample && entry.points)sample.series=entry.points;
      else if(!sample && entry.points)sample={value:0,series:[],observedAt:new Date(clock()).toISOString()};
      if(sample){if(['cloudwatch','cloudwatchLogs'].indexOf(entry.source)>=0 || windowRange)sample.window=anchoredRange;var queryUrl=telemetryQueryUrl(entry.links.query) || telemetryGrafanaUrl(entry.exploreUrl);if(queryUrl)sample.links={query:queryUrl};if(entry.unit)sample.unit=entry.unit;if(entry.breakdown)sample.breakdown=entry.breakdown;if(entry.intervalMs)sample.intervalMs=entry.intervalMs;}
      report.settled(job.id,entry.name,sample);
    }
    function progressNote(){failures.sort(function(a,b){return a.rank-b.rank;});var note=!failures.length?'':failures.length===1?'1 Grafana query failed: '+failures[0].text:failures.length+' Grafana queries failed; first '+failures[0].text;var text=[note].concat(notices).filter(Boolean).join('; ');if(report && report.note && text!==reportedNote){reportedNote=text;report.note(text);}}
    function failed(rank,label,message){failures.push({rank:rank,text:label+': '+message});if(report && report.pending)progressNote();}
    // A query's failure: its own (tool_error, bad input) or the refresh's (everything else).
    function caught(rank,label,repeat,entry){return function(error){
      if(signal && signal.aborted)return;
      if(entry && (entry.source==='cloudwatch' || entry.source==='cloudwatchLogs' || entry.source==='loki') && ['approval_required','consent_required','user_changed','needs_reauth'].indexOf(code(error))<0){entry.failed=true;failed(rank,label,(code(error)==='not_in_manifest' && entry.source!=='loki'?'This page cannot call CloudWatch ('+repeat.tool+') for your account. Re-export with this signal enabled.':detail(error)));return;}
      if(['tool_error','bad_request','transform_error'].indexOf(code(error))>=0){if(entry)entry.failed=true;if(label)failed(rank,label,detail(error));return;}
      if(!fatal)fatal={error:error,repeat:repeat};
    };}
    return connect(true).catch(function(error){
      if(!(signal && signal.aborted) && ctl && ctl.telemetry && typeof ctl.telemetry.setAvailable==='function')ctl.telemetry.setAvailable(false);
      throw error;
    }).then(function(mcp){
      if(signal && signal.aborted)throw {code:'capability_removed'};
      function call(tool,input){function work(){if(signal && signal.aborted)throw {code:'capability_removed'};return mcp.callTool(server,tool,input,options);}return windowRange?liveStatusHistoryCall(work,signal):Promise.resolve().then(work);}
      var probe={tool:'get_annotations',input:{type:'annotation',limit:100}};
      return (!windowRange && offered.indexOf(probe.tool)>=0?call(probe.tool,probe.input):Promise.resolve(null)).then(function(result){annotations=result && result.payload;},caught(-1,'annotations',probe,null)).then(function(){
        if(fatal)return;
        var tasks=[];
        jobs.forEach(function(job){job.signals.forEach(function(entry){
          var rank=order++,label=job.id+' '+entry.name,names=TELEMETRY_GRAFANA_DATASOURCE[entry.source],uid=config.grafana[names[0]];
          if(entry.error){entry.failed=true;failed(rank,label,entry.error);return;}
          var requiredTool={grafana:'query_prometheus',loki:'query_loki_logs',sql:'query_sql',cloudwatch:'query_cloudwatch',cloudwatchLogs:'query_cloudwatch_logs'}[entry.source];
          if(offered.indexOf(requiredTool)<0){entry.failed=true;failed(rank,label,'Enable '+requiredTool+' in the Grafana connector and re-export this page.');return;}
          if(!uid){entry.failed=true;failed(rank,label,'no '+names[1]+' datasource UID in tracking.telemetry.grafana.'+names[0]);return;}
          if(entry.source==='cloudwatch'){
            var query=entry.query;
            if(/\$(?:account\b|\{account\})/.test(query.accountId)){failed(rank,label,'set tracking.telemetry.grafana.accountId for $account');return;}
            var input={datasourceUid:uid,namespace:query.namespace,metricName:query.metric,region:query.region,accountId:query.accountId,
              dimensions:query.dimensions,statistic:query.statistic,start:anchoredRange.from,end:anchoredRange.to};
            try{input.period=telemetryCloudwatchPeriod(query,anchoredRange,clock());}catch(error){failed(rank,label,error.message);return;}
            started(job,entry);tasks.push(function(){return call('query_cloudwatch',input).then(function(result){
              var payload=telemetryGrafanaPayload(result);
              if(telemetryGrafanaCloudwatchEmpty(payload) || telemetryCloudwatchAfterWindow(payload,anchoredRange)){
                if(query.missingMeansZero===true){entry.value=0;entry.observedAt=anchoredRange.to;}
                else{notices.push(label+': no data points yet');if(report && report.pending)progressNote();}
                return;
              }
              // A failed weight query leaves no series-only sample that could be
              // misread as the last bucket's Average for the whole window.
              return (query.statistic==='Average'?call('query_cloudwatch',Object.assign({},input,{statistic:'SampleCount'})).then(telemetryGrafanaPayload):Promise.resolve(null)).then(function(weights){
                var sample=telemetryGrafanaCloudwatch(payload,query.statistic,weights,anchoredRange,input.period);
                if(!sample){entry.failed=true;failed(rank,label,'query_cloudwatch returned malformed observations or missing Average sample weights');return;}
                entry.value=sample.value;entry.points=sample.series;entry.observedAt=sample.observedAt;entry.intervalMs=input.period*1000;
              });
            }).catch(caught(rank,label,{tool:'query_cloudwatch',input:input},entry)).finally(function(){settled(job,entry);});});
            return;
          }
          if(entry.source==='cloudwatchLogs'){
            var q=entry.query,logRange=anchoredRange,input={datasourceUid:uid,region:q.region,logGroups:q.logGroups,queryString:q.query,start:logRange.from,end:logRange.to,limit:100};
            started(job,entry);tasks.push(function(){return call('query_cloudwatch_logs',input).then(function(result){
              entry.value=telemetryGrafanaCloudwatchLogs(telemetryGrafanaPayload(result),q);entry.observedAt=null;
              // Publish the authoritative total before optional trend/details.
              settled(job,entry);
              var extras=[],trend=telemetryLogTrend(q,windowMs);
              if(trend && !(signal && signal.aborted)){
                if(entry.trendError)failed(rank,label+' trend',entry.trendError);
                else {var trendInput=Object.assign({},input,{queryString:trend.query,limit:1000});extras.push(call('query_cloudwatch_logs',trendInput).then(function(answer){
                  var result=telemetryGrafanaLogTrend(telemetryGrafanaPayload(answer),trend,logRange);entry.points=result.series;entry.intervalMs=trend.binSeconds?trend.binSeconds*1000:null;
                  if(result.truncated){notices.push(label+': trend reached 1000 rows and may be truncated; total is independent');progressNote();}
                }).catch(function(error){if(!(signal && signal.aborted)){if(code(error)==='user_changed'){if(!fatal)fatal={error:error,repeat:{tool:'query_cloudwatch_logs',input:trendInput}};}else failed(rank,label+' trend',detail(error));}}));}
              }
              if(q.breakdown && !(signal && signal.aborted)){
                if(entry.breakdownError){entry.breakdown=telemetryLogDetails({status:'error',error:entry.breakdownError});failed(rank,label+' log details',entry.breakdown.error);}
                else {var detailsInput=Object.assign({},input,{queryString:q.breakdown.query,limit:q.breakdown.limit || 20});extras.push(call('query_cloudwatch_logs',detailsInput).then(function(details){entry.breakdown=telemetryGrafanaLogDetails(telemetryGrafanaPayload(details),q.breakdown,logRange);}).catch(function(error){
                  if(signal && signal.aborted)return;
                  if(code(error)==='user_changed'){if(!fatal)fatal={error:error,repeat:{tool:'query_cloudwatch_logs',input:detailsInput}};return;}
                  entry.breakdown=telemetryLogDetails({status:'error',error:detail(error)});failed(rank,label+' log details',entry.breakdown.error);
                }));}
              }
              return Promise.all(extras);
            }).catch(caught(rank,label,{tool:'query_cloudwatch_logs',input:input},entry)).finally(function(){settled(job,entry);});});
            return;
          }
          if(entry.source==='sql'){
            if(offered.indexOf('query_sql')<0){entry.failed=true;failed(rank,label,'the Grafana connector does not offer query_sql');return;}
            if(windowRange && !telemetrySqlHistoryQuery(entry.query)){failed(rank,label,'Historical SQL requires an authored $__timeFilter or both $__from and $__to time constraints');return;}
            var key=(config.environment || '')+'\n'+uid+'\n'+entry.query+(windowRange?JSON.stringify(range):''),cached=windowRange?null:sql[key];
            if(cached && clock()-cached.at<TELEMETRY_GRAFANA_SQL_MS){if(cached.value!==null)entry.value=cached.value;else entry.failed=true;return;}
            var input=Object.assign({datasourceUid:uid,query:entry.query},windowRange?{start:range.from,end:range.to}:{}),attempt={at:clock(),value:cached?cached.value:null};
            started(job,entry);tasks.push(function(){if(!windowRange)sql[key]=attempt;return call('query_sql',input).then(function(result){
              var value=telemetryGrafanaSql(result && result.payload);
              if(value===null){entry.failed=true;failed(rank,label,'query_sql returned no number');return;}
              attempt.value=entry.value=value;
            },caught(rank,label,{tool:'query_sql',input:input},entry)).finally(function(){settled(job,entry);});});
            return;
          }
          var loki=entry.source==='loki',tool=loki?'query_loki_logs':'query_prometheus',total=loki && telemetryLokiWindowTotal(entry.query);
          var query=total?{datasourceUid:uid,logql:telemetryLokiWindowQuery(entry.query,windowMs),endRfc3339:range.to,queryType:'instant'}:
            loki?{datasourceUid:uid,logql:entry.query,startRfc3339:range.from,endRfc3339:range.to,queryType:'range',stepSeconds:step}:
            {datasourceUid:uid,expr:entry.query,startTime:range.from,endTime:range.to,stepSeconds:step,queryType:'range'};
          started(job,entry);tasks.push(function(){return call(tool,query).then(function(result){
            var payload=telemetryGrafanaPayload(result);
            if(loki){
              if(payload && payload.status && payload.status!=='success' || payload && payload.error)throw {code:'tool_error',message:'Loki query failed'};
              var data=payload && payload.data && Array.isArray(payload.data.result)?{data:payload.data.result}:payload;
              var points=payload && payload.data && payload.data.resultType==='streams'?[]:telemetryGrafanaLoki(data);
              if(points.length && total){entry.value=points[points.length-1][1];entry.observedAt=new Date(points[points.length-1][0]).toISOString();}
              else if(points.length)entry.points=points;
              else if(telemetryLokiEmpty(payload) && entry.missingMeansZero!==false && telemetryLokiCountingQuery(entry.query))entry.value=0;
              else notices.push(label+': no numeric observation');
            }else {if(payload && payload.status && payload.status!=='success' || payload && payload.error)throw {code:'tool_error',message:'Prometheus query failed'};var promPoints=telemetryGrafanaPrometheus(payload);if(promPoints.length || !windowRange && entry.missingMeansZero!==false)entry.points=promPoints;else notices.push(label+': no numeric observation'+(windowRange?' in this window':''));}
            var url=telemetryGrafanaUrl(result && result.payload && result.payload.exploreUrl);if(url)entry.exploreUrl=url;
          }).catch(caught(rank,label,{tool:tool,input:query},entry)).finally(function(){settled(job,entry);});});
        });});
        // Each numeric query owns its Explore link. Link failures are optional
        // navigation failures and never invalidate successful measurements.
        jobs.forEach(function(job){job.signals.forEach(function(entry){
          if(entry.links.query || offered.indexOf('generate_deeplink')<0)return;
          var one={signals:{}};one.signals[entry.name]=entry;
          var input=telemetryGrafanaExplore(one,config,range);if(!input)return;
          var key=JSON.stringify([config.environment,input]);entry.explore=key;
          if(Object.prototype.hasOwnProperty.call(links,key))return;
          tasks.push(function(){return call('generate_deeplink',input).then(function(result){
            if(signal && signal.aborted)return;links[key]=telemetryGrafanaUrl(result && result.payload);
          },function(){if(!signal || !signal.aborted)links[key]=null;});});
        });});
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
      var markers=windowRange?[]:annotations!==null?telemetryGrafanaMarkers(annotations,end-windowMs,end):lastMarkers;
      jobs.forEach(function(job){
        var out={signals:{},observedAt:new Date(end).toISOString(),markers:JSON.parse(JSON.stringify(markers)),links:{}};
        job.signals.forEach(function(entry){
          var sample=null,previous=last[job.id] && last[job.id].signals[entry.name];
          if(typeof entry.value==='number'){sample={value:entry.value,observedAt:entry.observedAt || null};if(entry.points)sample.series=entry.points;}
          else if(entry.points)sample={value:entry.points.length?entry.points[entry.points.length-1][1]:0,series:entry.points};
          else if(!windowRange && entry.failed && previous && entry.source!=='cloudwatch' && entry.source!=='cloudwatchLogs' && entry.source!=='loki' && !entry.error)sample=JSON.parse(JSON.stringify(previous));
          if(!sample)return;
          if(['cloudwatch','cloudwatchLogs'].indexOf(entry.source)>=0 || windowRange)sample.window=anchoredRange;
          if(entry.breakdown)sample.breakdown=entry.breakdown;if(entry.intervalMs)sample.intervalMs=entry.intervalMs;
          if(entry.unit)sample.unit=entry.unit;else delete sample.unit;
          var one={signals:{}};one.signals[entry.name]=entry;
          var query=telemetryQueryUrl(entry.links.query) || (entry.failed && sample.links && sample.links.query) || telemetryGrafanaUrl(entry.exploreUrl) || entry.explore && links[entry.explore];
          if(!query){
            var sameRefresh=jobs.reduce(function(all,j){return all.concat(j.signals.map(function(e){return e.exploreUrl || e.explore && links[e.explore];}));},[]).filter(Boolean)[0];
            var base=sameRefresh || telemetryGrafanaUrl(config.grafana.baseUrl);
            query=telemetryGrafanaExploreUrl(one,config,range,base);
          }
          if(query)sample.links={query:query};
          out.signals[entry.name]=sample;
        });
        if(!Object.keys(out.signals).length)return;
        if(typeof job.links.dashboard==='string')out.links.dashboard=job.links.dashboard;
        // Preserve the existing carrier Inspect link, never use it to label a
        // mixed row. Per-signal links above remain authoritative.
        var query=telemetryQueryUrl(job.links.query);
        if(!query)query=out.signals[job.signals[0].name] && out.signals[job.signals[0].name].links && out.signals[job.signals[0].name].links.query;
        if(query)out.links.query=query;
        map[job.id]=out;
      });
      progressNote();
      if(!windowRange){last=map;lastMarkers=markers;}
      return JSON.parse(JSON.stringify(map));
    },function(error){if(signal && signal.aborted)throw telemetryGrafanaError('Grafana refresh cancelled');return refuse(error,signal,null);});
  }
  /* History is one absolute daily range per explicitly bound Prometheus/LogQL
     metric. No annotations, links, SQL, query rewriting or live fallback. */
  function history(bindings,range,signal,report){
    if(range.window)return provider(bindings,signal,report,range.window);
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
        if(entry.source!=='grafana' && entry.source!=='loki'){if(entry.source==='cloudwatch' || entry.source==='cloudwatchLogs')failures.push(job.id+' '+entry.name+': CloudWatch history unsupported; sample is unobserved');return;}
        var loki=entry.source==='loki',tool=loki?'query_loki_logs':'query_prometheus',names=TELEMETRY_GRAFANA_DATASOURCE[entry.source],uid=config.grafana[names[0]],label=job.id+' '+entry.name;
        if(!uid || offered.indexOf(tool)<0){failures.push(label+': historical datasource/tool unavailable');return;}
        // DST preserves local-day endpoints: only a discontinuity starts a new
        // 86400-second run. Ordinary same-offset days remain one query/signal.
        runs.forEach(function(run){
          // Each endpoint is the previous 24 hours, so $__range is that day.
          var input=loki?{datasourceUid:uid,logql:telemetryLokiWindowTotal(entry.query)?telemetryLokiWindowQuery(entry.query,86400000):entry.query,startRfc3339:run.from,endRfc3339:run.to,queryType:'range',stepSeconds:86400}:
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
