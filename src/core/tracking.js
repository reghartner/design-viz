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
                         unit: <string>|null}},
      proof: {<signal name>: {min?: number, max?: number, maxRatioOf?: <other signal name>}},
      links: {dashboard?: <absolute http(s) URL>, query?: <absolute http(s) URL>},
      card: null | {side?: 'right'|'left'|'above'|'below', offset?: number, position?: {x:number,y:number}}}
   With maxRatioOf, max is the highest allowed ratio of this signal to the named one.

   trackingTelemetry(page, invalid) always returns:
     {grafana: {prometheus?, loki?, tempo?, cloudwatch?, accountId?, sql?: <datasource UID>},
      honeycomb: {environment?, dataset?},
      window: <duration such as '1h'; default '24h', the previous 24 hours>,
      refreshMs: <number of ms, at least 60000>|null,
      templates: {<name>: {kind?, params: [<name>], signals, proof?, links?}}}
   Templates keep their authored form so `use` can expand them by pure string
   substitution of the declared $param / ${param} placeholders. */
var TELEMETRY_KINDS=['call','queue','service','log-event','device'];
var TELEMETRY_SOURCES=['grafana','loki','tempo','sql','honeycomb','cloudwatch'];
var TELEMETRY_CARD_SIDES=['right','left','above','below'];
var TELEMETRY_LINKS=['dashboard','query'];
var TELEMETRY_BINDING_FIELDS=['kind','signals','proof','links','card'];
var TELEMETRY_RESERVED=TELEMETRY_BINDING_FIELDS.concat(['use','params']);
var TELEMETRY_DEFAULT_WINDOW='24h',TELEMETRY_MIN_REFRESH_MS=60000,TELEMETRY_CARD_OFFSET_MAX=1000;
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
function telemetryTextBox(v){return !!(v && v.type==='text' && (telemetryOwn(v,'text') || telemetryOwn(v,'textStyle')));}
function telemetryWarn(invalid){return function(path,message){if(invalid)invalid(path,message);};}
function telemetryUnknown(value,allowed,warn,prefix){
  Object.keys(value).forEach(function(key){if(allowed.indexOf(key)<0)warn((prefix || '')+'.'+key,'unknown field — ignored');});
}
/* CloudWatch currently supports window totals only. Preserve dimension case. */
function telemetryCloudwatchQuery(query){
  return telemetryObject(query) && ['namespace','metric','region','accountId'].every(function(key){return telemetryText(query[key]);}) &&
    query.statistic==='Sum' && telemetryObject(query.dimensions) && Object.keys(query.dimensions).every(function(key){return telemetryText(key) && telemetryText(query.dimensions[key]);});
}
/* One signal entry: exactly one source key plus an optional unit. Returns the
   cleaned authored entry ({<source>: query, unit?}) or null. */
function telemetrySignal(name,value,warn){
  var at='.signals.'+name;
  if(!telemetryNamePattern.test(name)){warn(at,'signal names start with a letter and use letters, digits, - and _ — signal ignored');return null;}
  if(!telemetryObject(value)){warn(at,'must be an object with one source key ('+TELEMETRY_SOURCES.join(', ')+') — signal ignored');return null;}
  var sources=TELEMETRY_SOURCES.filter(function(key){return telemetryOwn(value,key);});
  if(sources.length!==1){warn(at,'use exactly one of '+TELEMETRY_SOURCES.join(', ')+' — signal ignored');return null;}
  var source=sources[0],query=value[source];
  if(source==='cloudwatch'){
    if(!telemetryCloudwatchQuery(query)){warn(at,'cloudwatch requires namespace, metric, region, accountId, string dimensions and statistic: Sum — signal ignored');return null;}
    telemetryUnknown(query,['namespace','metric','region','accountId','dimensions','statistic'],warn,at+'.cloudwatch');
  }else if(source==='honeycomb'){
    if(!telemetryObject(query) || !Object.keys(query).length){warn(at,'honeycomb must be a non-empty query object — signal ignored');return null;}
  }else if(!telemetryText(query)){warn(at,source+' must be a non-empty query string — signal ignored');return null;}
  var out={};out[source]=telemetryClone(query);
  if(telemetryOwn(value,'unit')){
    if(telemetryText(value.unit))out.unit=value.unit;
    else warn(at+'.unit','must be non-empty text — unit ignored');
  }
  telemetryUnknown(value,[source,'unit'],warn,at);
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
  if(template && telemetryOwn(raw,'card'))warn('.card','card placement belongs on the carrier — ignored');
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
    if(!telemetryObject(card))warn('.card','must be an object {side?, offset?, position?} — ignored');
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
      telemetryUnknown(card,['side','offset','position'],warn,'.card');
    }
    if(Object.keys(placed).length)out.card=placed;
  }
  return ok?out:null;
}
/* Single pass over every string of a template: declared $name and ${name}
   placeholders are replaced literally; anything else (Grafana's $__interval,
   undeclared names) stays as authored. */
function telemetrySubstitute(value,values){
  if(typeof value==='string')return value.replace(/\$\{([A-Za-z][A-Za-z0-9_]*)\}|\$([A-Za-z][A-Za-z0-9_]*)/g,function(match,braced,bare){
    var name=braced || bare;return Object.prototype.hasOwnProperty.call(values,name)?values[name]:match;
  });
  if(Array.isArray(value))return value.map(function(item){return telemetrySubstitute(item,values);});
  if(telemetryObject(value)){var out={};Object.keys(value).forEach(function(key){out[key]=telemetrySubstitute(value[key],values);});return out;}
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
function carrierTelemetry(obj,templates,invalid,environment){
  var warn=telemetryWarn(invalid);
  if(!telemetryObject(obj) || !telemetryOwn(obj,'telemetry'))return null;
  if(telemetryTextBox(obj)){warn('','text boxes do not carry telemetry — ignored');return null;}
  var raw=obj.telemetry;
  if(!telemetryObject(raw)){warn('','must be an object {kind, signals, proof?, links?, card?} or {use, ...params} — ignored');return null;}
  var expanded=telemetryExpand(raw,templates,warn);
  if(!expanded)return null;
  if(environment)expanded=telemetrySubstitute(expanded,{env:environment});
  var clean=telemetryClean(expanded,warn,false);
  if(!clean)return null;
  var signals={};
  Object.keys(clean.signals).forEach(function(name){
    var entry=clean.signals[name],source=TELEMETRY_SOURCES.filter(function(key){return telemetryOwn(entry,key);})[0];
    signals[name]={source:source,query:entry[source],unit:telemetryOwn(entry,'unit')?entry.unit:null};
  });
  return {kind:clean.kind,signals:signals,proof:clean.proof || {},links:clean.links || {},card:clean.card || null};
}
function telemetryConfigUrl(value){try{var u=new URL(value);return typeof value==='string' && /^https?:\/\//i.test(value) && !/[\s\\]/.test(value) && !u.username && !u.password;}catch(e){return false;}}
function trackingTelemetry(page,invalid){
  var warn=telemetryWarn(invalid),out={enabled:true,grafana:{},honeycomb:{},window:TELEMETRY_DEFAULT_WINDOW,refreshMs:null,templates:{}};
  var tracking=page && page.tracking;
  if(!telemetryObject(tracking) || !telemetryOwn(tracking,'telemetry'))return out;
  var value=tracking.telemetry;
  if(!telemetryObject(value)){warn('','must be an object {enabled?, grafana?, honeycomb?, window?, refreshMs?, templates?} — ignored');return out;}
  if(telemetryOwn(value,'enabled')){if(typeof value.enabled==='boolean')out.enabled=value.enabled;else warn('.enabled','must be a boolean — using true');}
  telemetryUnknown(value,['enabled','grafana','honeycomb','window','refreshMs','templates','environment','environments'],warn);
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
  if(telemetryOwn(value,'environments')){
    if(!telemetryObject(value.environments))warn('.environments','must be an object of named environment profiles — ignored');
    else{
      var profiles={};
      Object.keys(value.environments).forEach(function(id){
        var at='.environments.'+id,profile=value.environments[id];
        if(!telemetryNamePattern.test(id)){warn(at,'environment ids start with a letter and use letters, digits, - and _ — ignored');return;}
        if(!telemetryObject(profile)){warn(at,'must be an object {grafana?, honeycomb?} — ignored');return;}
        telemetryUnknown(profile,['grafana','honeycomb'],warn,at);
        var clean=trackingTelemetry({tracking:{telemetry:{grafana:telemetryOwn(profile,'grafana')?profile.grafana:{},honeycomb:telemetryOwn(profile,'honeycomb')?profile.honeycomb:{}}}},function(path,message){warn(at+path,message);});
        Object.defineProperty(profiles,id,{value:{grafana:clean.grafana,honeycomb:clean.honeycomb},enumerable:true,writable:true,configurable:true});
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
    else if(ms<TELEMETRY_MIN_REFRESH_MS){out.refreshMs=TELEMETRY_MIN_REFRESH_MS;warn('.refreshMs','below one minute — using 60000');}
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
  return out;
}

/* Resolve a consumer's selected profile without changing authored source. A
   deployment id is distinct from the Honeycomb environment slug. */
function telemetryEnvironmentConfig(page,environment){
  var config=trackingTelemetry(page),profiles=config.environments;
  if(!profiles)return config;
  var id=typeof environment==='string' && telemetryOwn(profiles,environment)?environment:config.environment;
  config.environment=id;
  ['grafana','honeycomb'].forEach(function(key){config[key]=telemetrySubstitute(Object.assign({},config[key],profiles[id][key]),{env:id});});
  return config;
}
function telemetryProviderConfig(page,ctl){
  return ctl && ctl.telemetry && typeof ctl.telemetry.config==='function'?ctl.telemetry.config():telemetryEnvironmentConfig(page);
}
