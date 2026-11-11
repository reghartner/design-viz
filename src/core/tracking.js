/* Authored references only; live Jira state never belongs in the spec.
   The optional invalid callback lets validation report original entry indices
   while every consumer shares the same filtering and deduplication rules. */
var trackingKeyPattern = /^[A-Z][A-Z0-9_]+-[0-9]+$/;
/* Accept explicit browse links on any Jira host, including context paths.
   Reject URL repair (whitespace, backslashes, credentials and dot segments). */
function trackingTicket(value){
  if(typeof value!=='string')return null;
  if(trackingKeyPattern.test(value))return {key:value,url:null};
  if(!/^https?:\/\/[^/?#]+(?:[/?#]|$)/i.test(value) || /[\s\u0000-\u001f\u007f\\]/.test(value) || /%(?![0-9a-f]{2})/i.test(value))return null;
  var url;try{url=new URL(value);}catch(ex){return null;}
  if(!url.hostname || url.username || url.password || /^https?:\/\/[^/\?#]*@/i.test(value))return null;
  var path=value.replace(/^https?:\/\/[^/]+/i,'').split(/[?#]/)[0];
  if(/(?:^|\/)(?:\.|%2e){1,2}(?:\/|$)/i.test(path))return null;
  var match=/^(?:\/[A-Za-z0-9._~-]+)*\/browse\/([A-Z][A-Z0-9_]+-[0-9]+)$/.exec(url.pathname);
  return match?{key:match[1],url:url.href}:null;
}
function trackingTicketURL(obj,key){
  var values=obj && Array.isArray(obj.tickets)?obj.tickets:[];
  for(var i=0;i<values.length;i++){
    var ticket=trackingTicket(values[i]);if(ticket && ticket.key===key && ticket.url)return ticket.url;
  }
  return null;
}
/* Canonical authored forms retain browse links. Identity/deduplication remains
   the issue key, with the first occurrence (inherited before local) winning. */
function trackingStoredRefs(obj){
  var refs=trackingRefs(obj);
  refs.tickets=refs.tickets.map(function(key){
    for(var i=0;i<obj.tickets.length;i++){
      var ticket=trackingTicket(obj.tickets[i]);if(ticket && ticket.key===key)return ticket.url || key;
    }
  });return refs;
}
function trackingRefs(obj, invalid){
  var refs = {tickets:[], prs:[]};
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return refs;
  ['tickets', 'prs'].forEach(function(field){
    if (!Object.prototype.hasOwnProperty.call(obj, field)) return;
    if (!Array.isArray(obj[field])){
      if (invalid) invalid(field, null);
      return;
    }
    obj[field].forEach(function(value, index){
      var ref = field === 'tickets'
        ? ((trackingTicket(value) || {}).key || null)
        : deltaLinkUrl(value);
      if (ref === null){
        if (invalid) invalid(field, index);
      } else if (refs[field].indexOf(ref) < 0) refs[field].push(ref);
    });
  });
  return refs;
}
/* Carrier identities are section-local; ticket keys are deduplicated only when
   counting work. Broad aggregates may include the endpoints of selected hops;
   visible step state, captions and ticket lists use direct carriers only. */
function trackingStepCarriers(diagram,step,directOnly){
  var out=[],nodes=stepNodes(step).slice(),keys=stepKeys(step).concat(Object.keys(stepFailures(step)));
  (diagram.edges || []).forEach(function(edge){
    var key=edge.from+'->'+edge.to;if(keys.indexOf(key)<0)return;
    out.push({id:key,value:edge});if(!directOnly)nodes.push(edge.from,edge.to);
  });
  nodes.filter(function(id,i){return nodes.indexOf(id)===i;}).forEach(function(id){
    var node=(diagram.nodes || {})[id];if(node && !isTextBoxNode(node))out.push({id:id,value:node});
  });return out;
}
/* #1103: `ticketFilter` names the subset of the tickets on a step's directly lit
   carriers that the step shows. It never adds a ticket, and carriers keep all of
   theirs. The value is a self-contained array of Jira keys so an imported step's
   override can carry the same shape. Malformed entries are skipped like carrier
   tickets; with no valid entry every ticket shows. `invalid` reports them. */
function trackingStepFilter(step,invalid){
  if(!step || typeof step!=='object' || !Object.prototype.hasOwnProperty.call(step,'ticketFilter'))return null;
  var value=step.ticketFilter,out=[];
  if(!Array.isArray(value) || !value.length){if(invalid)invalid(null);return null;}
  value.forEach(function(key,index){
    if(typeof key!=='string' || !trackingKeyPattern.test(key)){if(invalid)invalid(index);}
    else if(out.indexOf(key)<0)out.push(key);
  });
  return out.length?out:null;
}
/* The tickets a step filter may name on one carrier: its own, plus, for a node
   whose detail is a section of the same `page`, that section's carriers'
   tickets, recursively. A remote detail (detail.spec) never counts, so the set is
   the same in the viewer, validator and Workbench, before and after it loads. */
function trackingCarrierStepTickets(page,value){
  var keys=[],seen=[];
  function add(carrier){trackingRefs(carrier).tickets.forEach(function(key){if(keys.indexOf(key)<0)keys.push(key);});}
  function descend(node,depth){
    add(node);
    var record=page && node && !isTextBoxNode(node)?detailTarget(page,node.detail):null,child=record && record.section.diagram;
    if(!child || seen.indexOf(child)>=0 || depth>=DETAIL_MAX_DEPTH)return;
    seen.push(child);
    Object.keys(child.nodes || {}).forEach(function(id){if(!isTextBoxNode(child.nodes[id]))descend(child.nodes[id],depth+1);});
    (child.edges || []).forEach(add);
  }
  descend(value,0);return keys;
}
/* Ticket keys a step lights directly, before any filter: the keys a filter may
   name. `diagram` is the authored (resolved) section diagram of `page`. */
function trackingStepLitTickets(diagram,step,page){
  var keys=[];trackingStepCarriers(diagram || {},step,true).forEach(function(carrier){
    trackingCarrierStepTickets(page,carrier.value).forEach(function(key){if(keys.indexOf(key)<0)keys.push(key);});
  });return keys;
}
/* The filter a step applies: its keys that are lit, in lit order. Tickets
   churn, so a key on no lit carrier is ignored (the validator warns), and with
   none left the step shows every ticket. */
function trackingStepTicketFilter(diagram,step,page){
  var keys=trackingStepFilter(step);if(!keys)return null;
  var shown=trackingStepLitTickets(diagram,step,page).filter(function(key){return keys.indexOf(key)>=0;});
  return shown.length?shown:null;
}
/* Per direct carrier id, the filtered tickets a step's proof verdict uses; null
   without a filter, so verdicts keep each carrier's own tickets. */
function trackingStepProofTickets(diagram,step,page){
  var filter=trackingStepTicketFilter(diagram,step,page),out=Object.create(null);if(!filter)return null;
  trackingStepCarriers(diagram || {},step,true).forEach(function(carrier){
    out[carrier.id]=trackingCarrierStepTickets(page,carrier.value).filter(function(key){return filter.indexOf(key)>=0;});
  });return out;
}
/* Page-level parent roots (legacy `epic` field) share the ticket key grammar.
   Jira metadata determines whether each root is an Epic or an Initiative. */
function trackingEpics(page,invalid){
  var jira=page && page.tracking && page.tracking.jira,out=[];
  if(!jira || !Object.prototype.hasOwnProperty.call(jira,'epic'))return out;
  var value=jira.epic;
  if(typeof value!=='string' && !Array.isArray(value)){if(invalid)invalid(null);return out;}
  (Array.isArray(value)?value:[value]).forEach(function(key,index){
    if(typeof key!=='string' || !trackingKeyPattern.test(key)){if(invalid)invalid(Array.isArray(value)?index:null);}
    else if(out.indexOf(key)<0)out.push(key);
  });return out;
}
/* Exclusions affect inherited membership only; explicit carrier tickets win. */
function trackingExclusions(page,invalid){
  var jira=page && page.tracking && page.tracking.jira,out=[];
  if(!jira || !Object.prototype.hasOwnProperty.call(jira,'exclude'))return out;
  if(!Array.isArray(jira.exclude)){if(invalid)invalid(null);return out;}
  jira.exclude.forEach(function(key,index){
    if(typeof key!=='string' || !trackingKeyPattern.test(key)){if(invalid)invalid(index);}
    else if(out.indexOf(key)<0)out.push(key);
  });return out;
}
/* GitHub discovery is always bounded to authored repositories or an org. */
var trackingGithubRepoPattern=/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
var trackingGithubOrgPattern=/^[A-Za-z0-9_.-]+$/;
function trackingGithubScope(page,invalid){
  var out={repos:[],org:null},tracking=page && page.tracking;
  if(!tracking || !Object.prototype.hasOwnProperty.call(tracking,'github'))return out;
  var github=tracking.github;
  if(!github || typeof github!=='object' || Array.isArray(github)){if(invalid)invalid('',null);return out;}
  if(Object.prototype.hasOwnProperty.call(github,'repos')){
    if(!Array.isArray(github.repos)){if(invalid)invalid('.repos',null);}
    else github.repos.forEach(function(repo,index){
      if(typeof repo!=='string' || !trackingGithubRepoPattern.test(repo)){if(invalid)invalid('.repos',index);}
      else if(out.repos.indexOf(repo)<0)out.repos.push(repo);
    });
  }
  if(Object.prototype.hasOwnProperty.call(github,'org')){
    if(typeof github.org==='string' && trackingGithubOrgPattern.test(github.org))out.org=github.org;
    else if(invalid)invalid('.org',null);
  }
  return out;
}
/* Authored delivery dependencies (#765): ticket -> ticket pairs the design source
   implies, merged at runtime with Jira issue links. Never derived from edges. */
function trackingDependencies(page,invalid){
  var tracking=page && page.tracking,out=[];
  if(!tracking || typeof tracking!=='object' || !Object.prototype.hasOwnProperty.call(tracking,'dependencies'))return out;
  var value=tracking.dependencies;
  if(!Array.isArray(value)){if(invalid)invalid(null);return out;}
  value.forEach(function(entry,index){
    var ok=entry && typeof entry==='object' && !Array.isArray(entry) &&
      typeof entry.ticket==='string' && trackingKeyPattern.test(entry.ticket) &&
      typeof entry.on==='string' && trackingKeyPattern.test(entry.on) && entry.ticket!==entry.on &&
      (!Object.prototype.hasOwnProperty.call(entry,'reason') || typeof entry.reason==='string');
    if(!ok){if(invalid)invalid(index);return;}
    if(out.some(function(item){return item.ticket===entry.ticket && item.on===entry.on;}))return;
    var item={ticket:entry.ticket,on:entry.on};if(typeof entry.reason==='string' && entry.reason.trim())item.reason=entry.reason.trim();out.push(item);
  });
  return out;
}
/* Jira link descriptions (as shown on the dependent issue) that mean "waits on". */
var TRACKING_DEFAULT_DEPENDENCY_LINKS=['is blocked by','depends on'];
function trackingDependencyLinks(page,invalid){
  var jira=page && page.tracking && page.tracking.jira;
  if(!jira || typeof jira!=='object' || !Object.prototype.hasOwnProperty.call(jira,'dependencyLinks'))return TRACKING_DEFAULT_DEPENDENCY_LINKS.slice();
  var value=jira.dependencyLinks,out=[];
  if(!Array.isArray(value)){if(invalid)invalid(null);return TRACKING_DEFAULT_DEPENDENCY_LINKS.slice();}
  value.forEach(function(name,index){
    var text=typeof name==='string'?name.trim().toLowerCase():'';
    if(!text){if(invalid)invalid(index);return;}
    if(out.indexOf(text)<0)out.push(text);
  });
  return out.length?out:TRACKING_DEFAULT_DEPENDENCY_LINKS.slice();
}

/* Existence is opt-in and supported only on real carriers with Jira references. */
function trackingExistsWhen(value){
  var text=value && value.type==='text' && (Object.prototype.hasOwnProperty.call(value,'text') || Object.prototype.hasOwnProperty.call(value,'textStyle'));
  return value && !text && value.existsWhen==='tickets-done' && Array.isArray(value.tickets) && value.tickets.some(trackingTicket)?'tickets-done':null;
}

/* Telemetry signal bindings (#937). The spec stores queries and proof limits
   only, never results. Nothing is inferred from ids, titles or service names:
   a carrier without `telemetry` is unbound. Every parser reports problems through
   invalid(path, message), where path is relative to the telemetry object
   ('' for the object itself, '.signals.rate', '.templates.kafka-topic.params[0]'),
   drops the offending entry and never throws or modifies its input.

   carrierTelemetry(obj, templates, invalid) returns null (unbound) or:
     {kind: 'call'|'queue'|'service'|'log-event'|'device',
      signals: {<name>: {source: 'grafana'|'loki'|'tempo'|'sql'|'honeycomb'|'cloudwatch',
                         query: <string; a cloned query object for honeycomb/cloudwatch>,
                         unit: <string>|null, scope?: string, label?: string, showOnCard?: boolean, links?: {query?: string},
                         missingMeansZero?: boolean (loki and grafana only),
                         window?: <duration such as '1h'; a display label, never a query change>}},
      proof: {<signal name>: {min?: number, max?: number, maxRatioOf?: <other signal name>}},
      links: {dashboard?: <absolute http(s) URL>, query?: <absolute http(s) URL>},
      card: null | {side?: 'right'|'left'|'above'|'below', offset?: number, position?: {x:number,y:number},
             title?: string (replaces the edge label), width?: number (140–480; default 240)}}
   With maxRatioOf, max is the highest allowed ratio of this signal to the named one.

   trackingTelemetry(page, invalid) always returns:
     {grafana: {prometheus?, loki?, tempo?, cloudwatch?, accountId?, sql?: <datasource UID>},
      honeycomb: {environment?, dataset?},
      window: <duration such as '1h'; default '24h', the previous 24 hours>,
      refreshMs: <number of ms, at least 300000>|null,
      templates: {<name>: {kind?, params: [<name>], signals, proof?, links?}},
      lookups?: {<id>: {label, query, values?, datasource?, fields: {traceId, spanId}}}}
   Templates keep their authored form so `use` can expand them by pure string
   substitution of the declared $param / ${param} placeholders. Lookups are
   present only when authored; see telemetryLookups. */
var TELEMETRY_KINDS=['call','queue','service','log-event','device'];
var TELEMETRY_SOURCES=['grafana','loki','tempo','sql','honeycomb','cloudwatch','cloudwatchLogs'];
var TELEMETRY_CARD_SIDES=['right','left','above','below'];
var TELEMETRY_LINKS=['dashboard','query'];
var TELEMETRY_BINDING_FIELDS=['kind','signals','proof','links','card'];
var TELEMETRY_RESERVED=TELEMETRY_BINDING_FIELDS.concat(['use','params']);
var TELEMETRY_DEFAULT_WINDOW='24h',TELEMETRY_MIN_REFRESH_MS=300000,TELEMETRY_CARD_OFFSET_MAX=1000,TELEMETRY_CARD_WIDTH_MIN=140,TELEMETRY_CARD_WIDTH_MAX=480;
var telemetryNamePattern=/^[A-Za-z][A-Za-z0-9_-]*$/;
var telemetryParamPattern=/^[A-Za-z][A-Za-z0-9_]*$/;
var telemetryWindowPattern=/^(?:now-|-)?([1-9][0-9]*[smhdw])$/;
/* Relative lookbacks normalize for every provider; authored source stays intact. */
function telemetryWindowDuration(value){
  var match=typeof value==='string'?telemetryWindowPattern.exec(value.trim()):null;
  return match?match[1]:null;
}
function telemetryObject(v){return !!v && typeof v==='object' && !Array.isArray(v);}
function telemetryOwn(v,key){return Object.prototype.hasOwnProperty.call(v,key);}
function telemetryText(v){return typeof v==='string' && v.trim()!=='';}
function telemetryClone(v){return JSON.parse(JSON.stringify(v));}
function telemetryNumber(v){return typeof v==='number' && isFinite(v);}
function telemetryCardTitle(v){return telemetryText(v) && v.length<=120 && !/[\x00-\x1f\x7f]/.test(v);}
function telemetryCardWidth(v){return telemetryNumber(v) && v>=TELEMETRY_CARD_WIDTH_MIN && v<=TELEMETRY_CARD_WIDTH_MAX;}
function telemetryTextBox(v){return !!(v && v.type==='text' && (telemetryOwn(v,'text') || telemetryOwn(v,'textStyle')));}
function telemetryWarn(invalid){return function(path,message){if(invalid)invalid(path,message);};}
function telemetryUnknown(value,allowed,warn,prefix){
  Object.keys(value).forEach(function(key){if(allowed.indexOf(key)<0)warn((prefix || '')+'.'+key,'unknown field — ignored');});
}
/* Preserve dimension case; period is validated against the selected window at query time. */
function telemetryCloudwatchQuery(query){
  return telemetryObject(query) && (!telemetryOwn(query,'period') || Number.isInteger(query.period) && query.period>0) && (!telemetryOwn(query,'missingMeansZero') || typeof query.missingMeansZero==='boolean') && ['namespace','metric','region','accountId'].every(function(key){return telemetryText(query[key]);}) &&
    (['Sum','Maximum','Minimum','Average','SampleCount'].indexOf(query.statistic)>=0 || typeof query.statistic==='string' && /^\$(?:[A-Za-z][A-Za-z0-9_]*|\{[A-Za-z][A-Za-z0-9_]*\})$/.test(query.statistic)) && telemetryObject(query.dimensions) && Object.keys(query.dimensions).every(function(key){return telemetryText(key) && telemetryText(query.dimensions[key]);});
}
function telemetryLogBreakdownQuery(value){
  function heading(text){return telemetryText(text) && text.length<=80;}
  return telemetryObject(value) && telemetryText(value.query) && heading(value.labelField) && heading(value.valueField) &&
    ['title','labelTitle','valueTitle'].every(function(key){return !telemetryOwn(value,key) || heading(value[key]);}) &&
    (!telemetryOwn(value,'limit') || Number.isInteger(value.limit) && value.limit>=1 && value.limit<=100) &&
    (!telemetryOwn(value,'columns') || Array.isArray(value.columns) && value.columns.length<=4 && value.columns.every(function(column){return telemetryObject(column) && heading(column.field) && heading(column.label);}));
}
function telemetryLogTrendQuery(value){return value===false || telemetryObject(value) && ['query','timeField','valueField'].every(function(k){return telemetryText(value[k]);}) && (!telemetryOwn(value,'binSeconds') || Number.isInteger(value.binSeconds) && value.binSeconds>0);}
function telemetryCloudwatchLogsQuery(query){
  return telemetryObject(query) && Array.isArray(query.logGroups) && query.logGroups.length>0 && query.logGroups.every(telemetryText) && telemetryText(query.query) && telemetryText(query.region) && (!telemetryOwn(query,'valueField') || telemetryText(query.valueField)) && (!telemetryOwn(query,'breakdown') || telemetryLogBreakdownQuery(query.breakdown)) && (!telemetryOwn(query,'trend') || telemetryLogTrendQuery(query.trend));
}
/* One signal entry has exactly one source key plus optional display metadata.
   Returns the cleaned authored entry or null. */
function telemetryQueryUrl(value){
  if(!telemetryConfigUrl(value))return null;
  var url=new URL(value);return /(?:^|\.)honeycomb\.io$/.test(url.hostname) && /(?:query_results|trace_results)(?:\/|$)/.test(url.pathname)?null:value;
}
function telemetrySignal(name,value,warn){
  var at='.signals.'+name;
  if(!telemetryNamePattern.test(name)){warn(at,'signal names start with a letter and use letters, digits, - and _ — signal ignored');return null;}
  if(!telemetryObject(value)){warn(at,'must be an object with one source key ('+TELEMETRY_SOURCES.join(', ')+') — signal ignored');return null;}
  var sources=TELEMETRY_SOURCES.filter(function(key){return telemetryOwn(value,key);});
  if(sources.length!==1){warn(at,'use exactly one of '+TELEMETRY_SOURCES.join(', ')+' — signal ignored');return null;}
  var source=sources[0],query=value[source];
  if(source==='cloudwatch'){
    if(!telemetryCloudwatchQuery(query)){warn(at,'cloudwatch requires namespace, metric, region, accountId, string dimensions and statistic: Sum, Maximum, Minimum, Average or SampleCount — signal ignored');return null;}
    telemetryUnknown(query,['namespace','metric','region','accountId','dimensions','statistic','missingMeansZero','period'],warn,at+'.cloudwatch');
  }else if(source==='cloudwatchLogs'){
    if(!telemetryCloudwatchLogsQuery(query)){warn(at,'cloudwatchLogs requires logGroups, query, region; breakdown needs query, labelField, valueField, limit 1–100 and at most 4 text columns — signal ignored');return null;}
    telemetryUnknown(query,['logGroups','query','region','valueField','breakdown','trend'],warn,at+'.cloudwatchLogs');
    if(query.trend)telemetryUnknown(query.trend,['query','timeField','valueField','binSeconds'],warn,at+'.cloudwatchLogs.trend');
    if(query.breakdown){telemetryUnknown(query.breakdown,['query','labelField','valueField','title','labelTitle','valueTitle','columns','limit'],warn,at+'.cloudwatchLogs.breakdown');(query.breakdown.columns || []).forEach(function(column,i){telemetryUnknown(column,['field','label'],warn,at+'.cloudwatchLogs.breakdown.columns.'+i);});}
  }else if(source==='honeycomb'){
    if(!telemetryObject(query) || !Object.keys(query).length){warn(at,'honeycomb must be a non-empty query object — signal ignored');return null;}
  }else if(!telemetryText(query)){warn(at,source+' must be a non-empty query string — signal ignored');return null;}
  var out={};out[source]=telemetryClone(query);
  if(telemetryOwn(value,'unit')){
    if(telemetryText(value.unit))out.unit=value.unit;
    else warn(at+'.unit','must be non-empty text — unit ignored');
  }
  // #1194: an authored empty scope ("") hides the scope; whitespace alone is a mistake and is ignored with a warning.
  if(telemetryOwn(value,'scope')){if(value.scope==='' || telemetryText(value.scope))out.scope=value.scope;else warn(at+'.scope','must be non-empty text, or "" to hide the scope — ignored');}
  if(telemetryOwn(value,'label')){if(telemetryText(value.label) && value.label.length<=120 && !/[\x00-\x1f\x7f]/.test(value.label))out.label=value.label.trim();else warn(at+'.label','must be plain text of 1–120 characters without control characters — ignored');}
  if(telemetryOwn(value,'showOnCard')){if(typeof value.showOnCard==='boolean')out.showOnCard=value.showOnCard;else warn(at+'.showOnCard','must be a boolean — ignored');}
  // #1201: an error signal turns its card red when over its limit.
  if(telemetryOwn(value,'role')){if(value.role==='error')out.role='error';else warn(at+'.role','must be "error" — ignored');}
  if(telemetryOwn(value,'missingMeansZero')){
    if(source!=='loki' && source!=='grafana')warn(at+'.missingMeansZero','only loki and grafana signals take this field'+(source==='cloudwatch'?'; CloudWatch reads it inside the cloudwatch query':'')+' — ignored');
    else if(typeof value.missingMeansZero==='boolean')out.missingMeansZero=value.missingMeansZero;
    else warn(at+'.missingMeansZero','must be a boolean — ignored');
  }
  if(telemetryOwn(value,'window')){var span=telemetryWindowDuration(value.window);if(source==='cloudwatch')warn(at+'.window','cloudwatch signals always cover the page window — ignored');else if(span)out.window=span;else warn(at+'.window','use a duration such as "1h", "7d" or "now-7d" — ignored');}
  if(telemetryOwn(value,'links')){
    if(!telemetryObject(value.links))warn(at+'.links','must be an object {query?} — ignored');
    else {out.links={};telemetryUnknown(value.links,['query'],warn,at+'.links');if(telemetryOwn(value.links,'query')){if(telemetryQueryUrl(value.links.query))out.links.query=value.links.query;else warn(at+'.links.query','must be an absolute HTTP(S) URL without credentials — ignored');}}
  }
  telemetryUnknown(value,[source,'unit','scope','label','showOnCard','role','missingMeansZero','links','window'],warn,at);
  return out;
}
/* One proof entry for a known signal. Returns the cleaned entry or null. */
function telemetryProofEntry(name,value,signals,warn){
  var at='.proof.'+name,out={},warned=false;
  if(!telemetryOwn(signals,name)){warn(at,'names no signal of this binding — limit ignored');return null;}
  if(!telemetryObject(value)){warn(at,'must be an object {min?, max?, maxRatioOf?} — limit ignored');return null;}
  ['min','max'].forEach(function(key){
    if(!telemetryOwn(value,key))return;
    if(telemetryNumber(value[key]))out[key]=value[key];
    else {warn(at+'.'+key,'must be a finite number — ignored');warned=true;}
  });
  if(telemetryOwn(value,'maxRatioOf')){
    var other=value.maxRatioOf;
    if(typeof other!=='string' || other===name || !telemetryOwn(signals,other)){warn(at+'.maxRatioOf','must name another signal of this binding — limit ignored');return null;}
    if(!telemetryOwn(out,'max')){warn(at+'.maxRatioOf','needs max, the highest allowed ratio — limit ignored');return null;}
    out.maxRatioOf=other;
  }
  Object.keys(value).forEach(function(key){if(['min','max','maxRatioOf'].indexOf(key)<0){warn(at+'.'+key,'unknown field — ignored');warned=true;}});
  if(!out.maxRatioOf && telemetryOwn(out,'min') && telemetryOwn(out,'max') && out.min>out.max){warn(at,'min is above max, so the limit can never hold — limit ignored');return null;}
  if(!Object.keys(out).length){if(!warned)warn(at,'needs min, max or maxRatioOf — limit ignored');return null;}
  return out;
}
/* Validates an expanded authored binding (no `use`). template mode keeps the
   authored form, makes kind optional, and checks links only as text because
   their $param placeholders are not substituted yet. */
function telemetryClean(raw,warn,template){
  var allowed=template?['kind','params','signals','proof','links']:TELEMETRY_BINDING_FIELDS,ok=true,out={};
  if(template && telemetryOwn(raw,'card'))warn('.card','card fields belong on the carrier — ignored');
  telemetryUnknown(raw,allowed.concat(template?['card']:[]),warn);
  if(telemetryOwn(raw,'kind') || !template){
    if(TELEMETRY_KINDS.indexOf(raw.kind)<0){warn('.kind','use one of '+TELEMETRY_KINDS.join(', ')+' — '+(template?'template':'binding')+' ignored');ok=false;}
    else out.kind=raw.kind;
  }
  var signals={};
  if(!telemetryObject(raw.signals)){
    if(telemetryOwn(raw,'signals'))warn('.signals','must be an object of named signals — '+(template?'template':'binding')+' ignored');
    else warn('.signals','needs at least one signal — '+(template?'template':'binding')+' ignored');
    ok=false;
  }else{
    Object.keys(raw.signals).forEach(function(name){var signal=telemetrySignal(name,raw.signals[name],warn);if(signal)signals[name]=signal;});
    if(!Object.keys(signals).length){warn('.signals','needs at least one valid signal — '+(template?'template':'binding')+' ignored');ok=false;}
  }
  out.signals=signals;
  if(telemetryOwn(raw,'proof')){
    out.proof={};
    if(!telemetryObject(raw.proof))warn('.proof','must be an object of per-signal limits — ignored');
    else Object.keys(raw.proof).forEach(function(name){var entry=telemetryProofEntry(name,raw.proof[name],signals,warn);if(entry)out.proof[name]=entry;});
  }
  if(telemetryOwn(raw,'links')){
    out.links={};
    if(!telemetryObject(raw.links))warn('.links','must be an object {dashboard?, query?} — ignored');
    else Object.keys(raw.links).forEach(function(key){
      var url=raw.links[key],at='.links.'+key;
      if(TELEMETRY_LINKS.indexOf(key)<0)warn(at,'unknown link — ignored');
      else if(template?!telemetryText(url):!deltaLinkUrl(url))warn(at,'must be an absolute http(s) URL — ignored');
      else out.links[key]=template?url:deltaLinkUrl(url);
    });
  }
  if(!template && telemetryOwn(raw,'card')){
    var card=raw.card,placed={};
    if(!telemetryObject(card))warn('.card','must be an object {side?, offset?, position?, title?, width?} — ignored');
    else{
      if(telemetryOwn(card,'side')){if(TELEMETRY_CARD_SIDES.indexOf(card.side)>=0)placed.side=card.side;else warn('.card.side','use one of '+TELEMETRY_CARD_SIDES.join(', ')+' — ignored');}
      if(telemetryOwn(card,'offset')){
        if(telemetryNumber(card.offset) && Math.abs(card.offset)<=TELEMETRY_CARD_OFFSET_MAX)placed.offset=card.offset;
        else warn('.card.offset','must be a number of pixels between -'+TELEMETRY_CARD_OFFSET_MAX+' and '+TELEMETRY_CARD_OFFSET_MAX+' — ignored');
      }
      if(telemetryOwn(card,'position')){
        if(telemetryObject(card.position) && telemetryNumber(card.position.x) && telemetryNumber(card.position.y))placed.position={x:card.position.x,y:card.position.y};
        else warn('.card.position','must contain finite x and y coordinates — ignored');
        if(telemetryObject(card.position))telemetryUnknown(card.position,['x','y'],warn,'.card.position');
      }
      if(telemetryOwn(card,'title')){if(telemetryCardTitle(card.title))placed.title=card.title.trim();else warn('.card.title','must be plain text of 1–120 characters without control characters — ignored');}
      if(telemetryOwn(card,'width')){if(telemetryCardWidth(card.width))placed.width=card.width;else warn('.card.width','must be a number of pixels between '+TELEMETRY_CARD_WIDTH_MIN+' and '+TELEMETRY_CARD_WIDTH_MAX+' — ignored');}
      telemetryUnknown(card,['side','offset','position','title','width'],warn,'.card');
    }
    if(Object.keys(placed).length)out.card=placed;
  }
  return ok?out:null;
}
/* Single pass over every string of a template: declared $name and ${name}
   placeholders are replaced literally; anything else (Grafana's $__interval,
   undeclared names) stays as authored. */
function telemetrySubstitute(value,values,missing,namedOnly){
  if(typeof value==='string')return value.replace(/\$\{([A-Za-z][A-Za-z0-9_]*)\}|\$([A-Za-z][A-Za-z0-9_]*)/g,function(match,braced,bare){
    var name=braced || bare;if(telemetryOwn(values,name) && (!namedOnly || braced || name==='env' || name==='account'))return values[name];if(missing && (braced || name==='env' || name==='account'))missing(name);return match;
  });
  if(Array.isArray(value))return value.map(function(item){return telemetrySubstitute(item,values,missing,namedOnly);});
  if(telemetryObject(value)){var out={};Object.keys(value).forEach(function(key){Object.defineProperty(out,key,{value:telemetrySubstitute(value[key],values,missing,namedOnly),enumerable:true,writable:true,configurable:true});});return out;}
  return value;
}
/* Authored form of a carrier binding with `use` expanded against templates:
   the template with its params substituted, then the carrier's own kind and
   card replacing, and its signals, proof and links laid over per name.
   Returns raw itself (cloned) when there is no `use`, or null when the
   template cannot be applied. */
function telemetryExpand(raw,templates,invalid){
  var warn=telemetryWarn(invalid);
  if(!telemetryObject(raw))return null;
  if(!telemetryOwn(raw,'use'))return telemetryClone(raw);
  var name=raw.use,template=typeof name==='string' && telemetryObject(templates) && telemetryOwn(templates,name)?templates[name]:null;
  if(!telemetryObject(template)){warn('.use','names no template in tracking.telemetry.templates — binding ignored');return null;}
  var params=(Array.isArray(template.params)?template.params:[]).filter(function(p){return typeof p==='string' && telemetryParamPattern.test(p);});
  var values=Object.create(null),missing=false;
  params.forEach(function(p){
    if(!telemetryOwn(raw,p)){warn('.'+p,'template "'+name+'" needs this parameter — binding ignored');missing=true;}
    else if(!telemetryText(raw[p])){warn('.'+p,'must be a non-empty string — binding ignored');missing=true;}
    else values[p]=raw[p];
  });
  Object.keys(raw).forEach(function(key){
    if(key!=='use' && TELEMETRY_BINDING_FIELDS.indexOf(key)<0 && params.indexOf(key)<0)warn('.'+key,'not a parameter of template "'+name+'" — ignored');
  });
  if(missing)return null;
  var base={};Object.keys(template).forEach(function(key){if(key!=='params' && key!=='card')base[key]=telemetryClone(template[key]);});
  var out=telemetrySubstitute(base,values);
  ['kind','card'].forEach(function(key){if(telemetryOwn(raw,key))out[key]=telemetryClone(raw[key]);});
  ['signals','proof','links'].forEach(function(key){
    if(!telemetryOwn(raw,key))return;
    if(!telemetryObject(raw[key])){warn('.'+key,'must be an object — carrier '+key+' ignored');return;}
    var merged=telemetryObject(out[key])?out[key]:{};
    Object.keys(raw[key]).forEach(function(entry){merged[entry]=telemetryClone(raw[key][entry]);});
    out[key]=merged;
  });
  return out;
}
/* #1266: a consumer overlay on an imported carrier. `{extends:true, ...}` merges with the
   inherited (provider) binding through FlowTopology.mergeTelemetry (canon-topology.js); an
   overlay without `extends` replaces the inherited binding (the original rule). */
var TELEMETRY_MERGE_FIELDS=['extends','kind','signals','hide','proof','links','card'];
function telemetryMergeOverlay(overlay){return telemetryObject(overlay) && overlay.extends===true;}
// Metrics rule for a removed or hidden signal: its limit goes, and so does any ratio limit based on it.
function telemetryDropSignal(binding,name){
  if(telemetryObject(binding.signals))delete binding.signals[name];
  if(!telemetryObject(binding.proof))return;
  delete binding.proof[name];
  Object.keys(binding.proof).forEach(function(key){
    var limit=binding.proof[key];if(!telemetryObject(limit) || limit.maxRatioOf!==name)return;
    // max next to maxRatioOf is a ratio: it goes with its base signal; min stays.
    delete limit.maxRatioOf;delete limit.max;if(!Object.keys(limit).length)delete binding.proof[key];
  });
  if(!Object.keys(binding.proof).length)delete binding.proof;
}
/* Shape warnings for a merge overlay as authored; the merged binding is validated where it resolves. */
function telemetryMergeOverlayWarnings(overlay,invalid,inheritedNames){
  var warn=telemetryWarn(invalid);
  telemetryUnknown(overlay,TELEMETRY_MERGE_FIELDS,warn);
  if(telemetryOwn(overlay,'kind') && TELEMETRY_KINDS.indexOf(overlay.kind)<0)warn('.kind','must be one of '+TELEMETRY_KINDS.join(', ')+' — ignored');
  if(telemetryOwn(overlay,'hide') && !(Array.isArray(overlay.hide) && overlay.hide.every(function(name){return typeof name==='string' && telemetryNamePattern.test(name);})))warn('.hide','must be an array of inherited signal names — ignored');
  ['signals','proof','links','card'].forEach(function(field){
    if(!telemetryOwn(overlay,field))return;
    if(!telemetryObject(overlay[field])){warn('.'+field,'must be an object — ignored');return;}
    if(field==='signals' || field==='proof')Object.keys(overlay[field]).forEach(function(name){
      var entry=overlay[field][name];if(entry!==null && !telemetryObject(entry))warn('.'+field+'.'+name,'must be an object of changed fields or null — ignored');
    });
  });
  /* #1266 review: the authored document does not know the provider's signal names. An entry that
     names a source, or any entry when inheritedNames says it is new, is a whole local signal and gets
     the full signal checks; any other entry is a field change and gets field-name checks. */
  var signals=telemetryObject(overlay.signals)?overlay.signals:{},kind=TELEMETRY_KINDS.indexOf(overlay.kind)>=0?overlay.kind:'call';
  Object.keys(signals).forEach(function(name){
    var entry=signals[name];if(!telemetryObject(entry))return;
    var added=Array.isArray(inheritedNames)?inheritedNames.indexOf(name)<0:TELEMETRY_SOURCES.some(function(source){return telemetryOwn(entry,source) && entry[source]!==null;});
    var prefix='.signals.'+name;
    if(added){
      var whole={};Object.keys(entry).forEach(function(key){if(entry[key]!==null)whole[key]=entry[key];});
      var one={};one[name]=whole;
      carrierTelemetry({telemetry:{kind:kind,signals:one}},{},function(path,message){if(path.indexOf(prefix)===0)warn(path,message);});
    }else telemetryUnknown(entry,TELEMETRY_SOURCES.concat(['unit','scope','label','showOnCard','role','missingMeansZero','links','window']),warn,prefix);
  });
  // A limit needs its signal: an added one here, or (when the provider's names are known) an inherited one.
  if(telemetryObject(overlay.proof))Object.keys(overlay.proof).forEach(function(name){
    if(overlay.proof[name]===null || telemetryOwn(signals,name))return;
    if(Array.isArray(inheritedNames)?inheritedNames.indexOf(name)<0:false)warn('.proof.'+name,'names no signal of this binding or the provider — limit ignored');
  });
}
function carrierTelemetry(obj,templates,invalid,environment){
  var warn=telemetryWarn(invalid);
  if(!telemetryObject(obj) || !telemetryOwn(obj,'telemetry'))return null;
  if(telemetryTextBox(obj)){warn('','text boxes do not carry telemetry — ignored');return null;}
  var raw=obj.telemetry;
  if(!telemetryObject(raw)){warn('','must be an object {kind, signals, proof?, links?, card?} or {use, ...params} — ignored');return null;}
  // Imported templates have already had their template pass in canon-topology.
  // Local templates take that same pass here, before exactly one environment pass.
  var expanded=telemetryExpand(raw,templates,warn);
  if(!expanded)return null;
  var config=telemetryObject(environment)?environment:environment?{environment:environment}:null,errors=Object.create(null),breakdownErrors=Object.create(null),trendErrors=Object.create(null);
  if(config){
    var values=Object.assign(Object.create(null),config.variables || {});
    if(config.environment)values.env=config.environment;
    if(config.grafana && config.grafana.accountId)values.account=config.grafana.accountId;
    Object.keys(expanded).forEach(function(key){
      if(key==='signals' && telemetryObject(expanded[key]))Object.keys(expanded[key]).forEach(function(name){
        var authored=expanded[key][name],logs=telemetryObject(authored) && authored.cloudwatchLogs,hasBreakdown=telemetryObject(logs) && telemetryOwn(logs,'breakdown'),breakdown=hasBreakdown?logs.breakdown:null,hasTrend=telemetryObject(logs) && telemetryOwn(logs,'trend'),trend=hasTrend?logs.trend:null;
        // Display-only fields cannot prevent the metric query from running.
        // Keep their one environment pass separate from source/query errors.
        var display={};if(telemetryObject(authored))['label','links','window'].forEach(function(field){if(telemetryOwn(authored,field)){display[field]=authored[field];delete authored[field];}});
        // The optional grouped query owns its configuration errors. Resolve it
        // separately, once, so it cannot suppress an otherwise readable total.
        if(hasBreakdown)delete logs.breakdown;if(hasTrend)delete logs.trend;
        function missingReason(missing){return 'Set telemetry variable ${'+missing+'} in the active environment'+(missing==='account'?' or tracking.telemetry.grafana.accountId':'')+'.';}
        expanded[key][name]=telemetrySubstitute(expanded[key][name],values,function(missing){
          errors[name]=missingReason(missing);
        },true);
        Object.keys(display).forEach(function(field){
          var unresolved=false,resolved=telemetrySubstitute(display[field],values,function(missing){unresolved=true;warn('.signals.'+name+'.'+field,'unresolved telemetry variable '+missing+' — display metadata ignored');},true);
          if(!unresolved)expanded[key][name][field]=resolved;
        });
        if(hasTrend)expanded[key][name].cloudwatchLogs.trend=telemetrySubstitute(trend,values,function(missing){trendErrors[name]=missingReason(missing);},true);
        if(hasBreakdown)expanded[key][name].cloudwatchLogs.breakdown=telemetrySubstitute(breakdown,values,function(missing){breakdownErrors[name]=missingReason(missing);},true);
      });
      else expanded[key]=telemetrySubstitute(expanded[key],values,null,true);
    });
  }
  var clean=telemetryClean(expanded,warn,false);
  if(!clean)return null;
  var signals={};
  Object.keys(clean.signals).forEach(function(name){
    var entry=clean.signals[name],source=TELEMETRY_SOURCES.filter(function(key){return telemetryOwn(entry,key);})[0];
    signals[name]={source:source,query:entry[source],unit:telemetryOwn(entry,'unit')?entry.unit:null};
    if(typeof entry.scope==='string')signals[name].scope=entry.scope;
    if(entry.label)signals[name].label=entry.label;
    if(telemetryOwn(entry,'showOnCard'))signals[name].showOnCard=entry.showOnCard;
    if(entry.role)signals[name].role=entry.role;
    if(telemetryOwn(entry,'missingMeansZero'))signals[name].missingMeansZero=entry.missingMeansZero;
    if(entry.window)signals[name].window=entry.window;
    if(entry.links)signals[name].links=entry.links;
    if(errors[name])signals[name].error=errors[name];
    if(breakdownErrors[name])signals[name].breakdownError=breakdownErrors[name];
    if(trendErrors[name])signals[name].trendError=trendErrors[name];
  });
  return {kind:clean.kind,signals:signals,proof:clean.proof || {},links:clean.links || {},card:clean.card || null};
}
function telemetryConfigUrl(value){try{var u=new URL(value);return typeof value==='string' && /^https?:\/\//i.test(value) && !/[\s\\]/.test(value) && !u.username && !u.password;}catch(e){return false;}}
/* Load trace log lookups (#1099): a Loki log query whose lines carry a trace id
   and span id (structured metadata, parsed or stream labels). The query keeps
   its $value slot and environment placeholders; the viewer fills them when the
   reader finds lines. A value never contains a quote, backtick or backslash, so
   it cannot leave the LogQL string it is placed in. */
var TELEMETRY_LOOKUP_FIELDS=['label','query','values','datasource','fields'];
var telemetryLogFieldPattern=/^[A-Za-z_][A-Za-z0-9_]{0,79}$/;
var telemetryLookupValuePattern=/^[^"`\\\x00-\x1f\x7f]{1,200}$/;
function telemetryLookupSlot(query){return typeof query==='string' && /\$\{value\}|\$value(?![A-Za-z0-9_])/.test(query);}
function telemetryLookups(raw,warn){
  var out={};
  if(!telemetryObject(raw)){warn('.lookups','must be an object of named log lookups {label, query, values?, datasource?, fields?} — ignored');return null;}
  Object.keys(raw).forEach(function(id){
    var at='.lookups.'+id,entry=raw[id],ok=true;
    function bad(path,message){warn(at+path,message+' — lookup ignored');ok=false;}
    if(!telemetryNamePattern.test(id)){bad('','lookup ids start with a letter and use letters, digits, - and _');return;}
    if(!telemetryObject(entry)){bad('','must be an object {label, query, values?, datasource?, fields?}');return;}
    Object.keys(entry).forEach(function(key){if(TELEMETRY_LOOKUP_FIELDS.indexOf(key)<0)bad('.'+key,'unknown field');});
    if(!telemetryText(entry.label) || entry.label.length>80 || /[\x00-\x1f\x7f]/.test(entry.label))bad('.label','must be plain text of 1–80 characters');
    if(!telemetryText(entry.query) || entry.query.length>2000)bad('.query','must be a non-empty LogQL log query of at most 2000 characters');
    if(telemetryOwn(entry,'values')){
      if(!Array.isArray(entry.values) || !entry.values.length || entry.values.length>50)bad('.values','must be an array of 1–50 suggested values');
      else entry.values.forEach(function(v,i){if(typeof v!=='string' || v.trim()!==v || !telemetryLookupValuePattern.test(v))bad('.values['+i+']','must be text of 1–200 characters without quotes, backticks, backslashes or control characters');});
      if(telemetryText(entry.query) && !telemetryLookupSlot(entry.query))bad('.query','has suggested values but no $value slot');
    }
    if(telemetryOwn(entry,'datasource') && !telemetryText(entry.datasource))bad('.datasource','must be a non-empty Loki datasource UID');
    var fields={traceId:'trace_id',spanId:'span_id'};
    if(telemetryOwn(entry,'fields')){
      if(!telemetryObject(entry.fields))bad('.fields','must be an object {traceId?, spanId?}');
      else Object.keys(entry.fields).forEach(function(key){
        if(['traceId','spanId'].indexOf(key)<0)bad('.fields.'+key,'unknown field');
        else if(typeof entry.fields[key]!=='string' || !telemetryLogFieldPattern.test(entry.fields[key]))bad('.fields.'+key,'must be a Loki label name: letters, digits and _, not starting with a digit');
        else fields[key]=entry.fields[key];
      });
    }
    if(!ok)return;
    var clean={label:entry.label.trim(),query:entry.query};
    if(entry.values)clean.values=entry.values.slice();
    if(entry.datasource)clean.datasource=entry.datasource;
    clean.fields=fields;out[id]=clean;
  });
  return out;
}
function trackingTelemetry(page,invalid){
  var warn=telemetryWarn(invalid),out={enabled:true,grafana:{},honeycomb:{},window:TELEMETRY_DEFAULT_WINDOW,refreshMs:null,templates:{}};
  var tracking=page && page.tracking;
  if(typeof FlowTraceConnections!=='undefined'){var direct=FlowTraceConnections.resolve(page,TELEMETRY_COMPANY_TRACE_CONNECTIONS);if(Object.keys(direct).length)out.traceConnections=direct;}
  if(!telemetryObject(tracking) || !telemetryOwn(tracking,'telemetry'))return out;
  var value=tracking.telemetry;
  if(!telemetryObject(value)){warn('','must be an object {enabled?, grafana?, honeycomb?, window?, refreshMs?, templates?} — ignored');return out;}
  if(telemetryOwn(value,'enabled')){if(typeof value.enabled==='boolean')out.enabled=value.enabled;else warn('.enabled','must be a boolean — using true');}
  telemetryUnknown(value,['enabled','grafana','honeycomb','window','refreshMs','templates','environment','environments','variables','traceConnections','lookups'],warn);
  [['grafana',['prometheus','loki','tempo','sql','cloudwatch','accountId','baseUrl'],'datasource UID'],['honeycomb',['environment','dataset'],'name']].forEach(function(group){
    var key=group[0],given=value[key];
    if(!telemetryOwn(value,key))return;
    if(!telemetryObject(given)){warn('.'+key,'must be an object of '+group[1].join(', ')+' — ignored');return;}
    Object.keys(given).forEach(function(field){
      if(group[1].indexOf(field)<0)warn('.'+key+'.'+field,'unknown field — ignored');
      else if(field==='baseUrl' && !telemetryConfigUrl(given[field]))warn('.'+key+'.'+field,'use an absolute HTTP(S) URL — ignored');
      else if(!telemetryText(given[field]))warn('.'+key+'.'+field,'use a non-empty '+group[2]+' — ignored');
      else out[key][field]=given[field];
    });
  });
  if(telemetryOwn(value,'variables')){
    if(!telemetryObject(value.variables))warn('.variables','must be an object of named strings — ignored');
    else{out.variables={};Object.keys(value.variables).forEach(function(name){
      if(!telemetryParamPattern.test(name) || ['env','account','constructor','prototype','__proto__'].indexOf(name)>=0 || !telemetryText(value.variables[name]))warn('.variables.'+name,'use a non-reserved name and non-empty string — ignored');
      else out.variables[name]=value.variables[name];
    });}
  }
  if(telemetryOwn(value,'environments')){
    if(!telemetryObject(value.environments))warn('.environments','must be an object of named environment profiles — ignored');
    else{
      var profiles={};
      Object.keys(value.environments).forEach(function(id){
        var at='.environments.'+id,profile=value.environments[id];
        if(!telemetryNamePattern.test(id)){warn(at,'environment ids start with a letter and use letters, digits, - and _ — ignored');return;}
        if(!telemetryObject(profile)){warn(at,'must be an object {grafana?, honeycomb?, variables?} — ignored');return;}
        telemetryUnknown(profile,['grafana','honeycomb','variables'],warn,at);
        var clean=trackingTelemetry({tracking:{telemetry:{grafana:telemetryOwn(profile,'grafana')?profile.grafana:{},honeycomb:telemetryOwn(profile,'honeycomb')?profile.honeycomb:{},...(telemetryOwn(profile,'variables')?{variables:profile.variables}:{})}}},function(path,message){warn(at+path,message);});
        Object.defineProperty(profiles,id,{value:Object.assign({grafana:clean.grafana,honeycomb:clean.honeycomb},clean.variables?{variables:clean.variables}:{}),enumerable:true,writable:true,configurable:true});
      });
      if(Object.keys(profiles).length){out.environments=profiles;out.environment=Object.keys(profiles)[0];}
    }
  }
  if(telemetryOwn(value,'environment')){
    if(out.environments && typeof value.environment==='string' && telemetryOwn(out.environments,value.environment))out.environment=value.environment;
    else warn('.environment','must name a configured environment — using the first valid profile, or shared settings when none exist');
  }
  if(telemetryOwn(value,'window')){
    var duration=telemetryWindowDuration(value.window);
    if(duration)out.window=duration;
    else warn('.window','use a duration such as "30m", "1h", "7d", "-6h" or "now-6h" — using '+TELEMETRY_DEFAULT_WINDOW);
  }
  if(telemetryOwn(value,'refreshMs')){
    var ms=value.refreshMs;
    if(!telemetryNumber(ms) || ms<=0)warn('.refreshMs','must be a positive number of milliseconds — using the connector default');
    else if(ms<TELEMETRY_MIN_REFRESH_MS){out.refreshMs=TELEMETRY_MIN_REFRESH_MS;warn('.refreshMs','below five minutes — using 300000');}
    else out.refreshMs=ms;
  }
  if(telemetryOwn(value,'templates')){
    if(!telemetryObject(value.templates))warn('.templates','must be an object of named signal sets — ignored');
    else Object.keys(value.templates).forEach(function(name){
      var at='.templates.'+name,raw=value.templates[name],twarn=function(path,message){warn(at+path,message);};
      if(!telemetryNamePattern.test(name)){warn(at,'template names start with a letter and use letters, digits, - and _ — template ignored');return;}
      if(!telemetryObject(raw)){warn(at,'must be an object {kind?, params?, signals, proof?, links?} — template ignored');return;}
      var params=[],ok=true;
      if(telemetryOwn(raw,'params')){
        if(!Array.isArray(raw.params)){twarn('.params','must be an array of parameter names — template ignored');return;}
        raw.params.forEach(function(p,index){
          if(typeof p!=='string' || !telemetryParamPattern.test(p) || TELEMETRY_RESERVED.indexOf(p)>=0){twarn('.params['+index+']','use letters, digits and _ starting with a letter, other than '+TELEMETRY_RESERVED.join(', ')+' — template ignored');ok=false;}
          else if(params.indexOf(p)>=0){twarn('.params['+index+']','duplicate parameter — template ignored');ok=false;}
          else params.push(p);
        });
      }
      var clean=telemetryClean(raw,twarn,true);
      if(!ok || !clean)return;
      clean.params=params;out.templates[name]=clean;
    });
  }
  if(telemetryOwn(value,'lookups')){var lookups=telemetryLookups(value.lookups,warn);if(lookups)out.lookups=lookups;}
  if(typeof FlowTraceConnections!=='undefined' && (telemetryOwn(value,'traceConnections') || out.traceConnections))out.traceConnections=FlowTraceConnections.resolve(page,TELEMETRY_COMPANY_TRACE_CONNECTIONS,warn);
  return out;
}

/* Resolve a consumer's selected profile without changing authored source. A
   deployment id is distinct from the Honeycomb environment slug. */
var TELEMETRY_COMPANY_AWS_ACCOUNTS=/* @company-aws-accounts */ {};
function telemetryEnvironmentConfig(page,environment){
  var config=trackingTelemetry(page),profiles=config.environments;
  if(!profiles){if(typeof environment==='string')config.environment=environment;return config;}
  var id=typeof environment==='string' && telemetryOwn(profiles,environment)?environment:config.environment;
  config.environment=id;
  var accounts=telemetryOwn(TELEMETRY_COMPANY_AWS_ACCOUNTS,id)?TELEMETRY_COMPANY_AWS_ACCOUNTS[id]:null;
  if(accounts || config.variables || profiles[id].variables)config.variables=Object.assign({},accounts,config.variables,profiles[id].variables);
  ['grafana','honeycomb'].forEach(function(key){config[key]=telemetrySubstitute(Object.assign({},config[key],profiles[id][key]),{env:id});});
  return config;
}
function telemetryProviderConfig(page,ctl){
  return ctl && ctl.telemetry && typeof ctl.telemetry.config==='function'?ctl.telemetry.config():telemetryEnvironmentConfig(page);
}

/* Scope is evidence metadata, never inferred from an edge title or arbitrary query text. */
function telemetrySignalScope(signal){
  if(!signal)return '';
  if(typeof signal.scope==='string')return signal.scope;
  if(signal.source!=='cloudwatch')return '';
  var q=signal.query,d=q.dimensions || {},scope='';
  if(d.QueueName)scope='queue only: '+d.QueueName;
  else if(q.namespace==='AWS/IoT' && d.RuleName)scope='this rule only: '+d.RuleName;
  else if(q.namespace==='AWS/IoT' && Object.keys(d).every(function(k){return ['Protocol','AccountId'].indexOf(k)>=0;})){
    if(q.metric==='PublishIn.AuthError')scope='all topics / whole account';
    if(q.metric==='Connect.AuthError')scope='all connections / whole account';
  }
  return scope?scope+' · account '+q.accountId+(d.Protocol?' · '+d.Protocol:''):'';
}
/* A signal's own time span (#1108): its declared `window`, else the one range
   selector of a PromQL/LogQL counting query. String literals are not scanned.
   [$__range], variables, subqueries and several selectors derive nothing. */
var TELEMETRY_COUNTING=/\b(?:count_over_time|sum_over_time|bytes_over_time|increase)\s*\(/;
function telemetrySignalSpan(signal){
  if(!signal)return null;
  if(signal.window)return signal.window;
  if(signal.source!=='grafana' && signal.source!=='loki' || typeof signal.query!=='string')return null;
  var text=signal.query.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`[^`]*`/g,'Q'),ranges=text.match(/\[[^\]]*\]/g);
  if(/["'`]/.test(text) || !TELEMETRY_COUNTING.test(text) || !ranges || ranges.length!==1)return null;
  var match=/^\[\s*([1-9][0-9]*[smhdw])\s*\]$/.exec(ranges[0]);
  return match?match[1]:null;
}
/* 'last 1h' when the signal's span differs from the board window, else ''. */
function telemetrySpanNote(signal,window){
  var span=telemetrySignalSpan(signal),board=telemetryWindowDuration(window);
  function seconds(d){return Number(d.slice(0,-1))*{s:1,m:60,h:3600,d:86400,w:604800}[d.slice(-1)];}
  return span && board && seconds(span)!==seconds(board)?'last '+span:'';
}
