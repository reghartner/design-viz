/* Workbench telemetry editing (#941). Pure edits of the authored #937 field
   family (docs/live-status.md "Telemetry bindings"): a carrier `telemetry`
   binding and the page `tracking.telemetry` block. Each edit returns
   {value} (the next authored object, or null to remove it) or {error}; the
   planners turn one edit into one source change, so every edit is one Undo
   step. Imported carriers write the consumer overlay through
   planTopologyTracking('telemetry'), the same path as existsWhen. The
   Workbench never runs a query: nothing here contacts a connector. */
var TELEMETRY_SOURCE_LABELS={grafana:'Grafana (PromQL)',loki:'Loki (LogQL)',tempo:'Tempo (TraceQL)',sql:'SQL',honeycomb:'Honeycomb',cloudwatch:'CloudWatch (metric)',cloudwatchLogs:'CloudWatch Logs (Insights)'};
var TELEMETRY_DATASOURCES={grafana:['prometheus','loki','tempo','sql','cloudwatch','accountId','baseUrl'],honeycomb:['environment','dataset']};
function telemetrySignalSource(entry){
  return telemetryObject(entry)?TELEMETRY_SOURCES.filter(function(key){return telemetryOwn(entry,key);})[0] || null:null;
}
/* Query text as shown in the editor: Honeycomb queries are JSON objects. */
function telemetryQueryText(source,query){
  if(query==null)return '';
  return source==='honeycomb' || typeof query!=='string'?JSON.stringify(query):query;
}
function telemetryQueryValue(source,text){
  if(typeof text!=='string' || !text.trim())return {error:'A signal needs a query.'};
  if(source!=='honeycomb' && source!=='cloudwatch' && source!=='cloudwatchLogs')return {value:text.trim()};
  var parsed=null;try{parsed=JSON.parse(text);}catch(ex){}
  if(source==='cloudwatchLogs')return telemetryCloudwatchLogsQuery(parsed)?{value:parsed}:{error:'CloudWatch Logs needs logGroups, query, region. Optional breakdown needs query, labelField, valueField, limit 1–100 and at most 4 text columns.'};
  if(source==='cloudwatch')return telemetryCloudwatchQuery(parsed)?{value:parsed}:{error:'A CloudWatch query is a JSON object with namespace, metric, region, accountId, dimensions and statistic: Sum, Maximum, Minimum, Average or SampleCount; optional period is a positive integer in seconds.'};
  if(!telemetryObject(parsed) || !Object.keys(parsed).length)return {error:'A Honeycomb query is a JSON object such as {"calculations":[{"op":"COUNT"}]}.'};
  return {value:parsed};
}
function telemetrySignalName(name,signals,current){
  if(typeof name!=='string' || !telemetryNamePattern.test(name))return {error:'Signal names start with a letter and use letters, digits, - and _.'};
  if(name!==current && telemetryOwn(signals,name))return {error:'Signal "'+name+'" already exists.'};
  return {value:name};
}
/* Rebuild an object with one key renamed in place, keeping member order. */
function telemetryRenameKey(object,from,to){
  var out={};Object.keys(object).forEach(function(key){out[key===from?to:key]=object[key];});return out;
}
function telemetryDropEmpty(object,key){if(telemetryObject(object[key]) && !Object.keys(object[key]).length)delete object[key];}
/* #1255: a renamed signal (next) or a removed one (next null) carries its proof limit and
   every maxRatioOf reference with it. max next to maxRatioOf is a ratio, so removing the base
   signal drops that max with it (min stays); limits and a proof left empty are dropped. */
function telemetryProofSignal(binding,name,next){
  if(!telemetryObject(binding) || !telemetryObject(binding.proof))return binding;
  if(telemetryOwn(binding.proof,name)){if(next==null)delete binding.proof[name];else binding.proof=telemetryRenameKey(binding.proof,name,next);}
  Object.keys(binding.proof).forEach(function(key){
    var limit=binding.proof[key];if(!telemetryObject(limit) || limit.maxRatioOf!==name)return;
    if(next!=null){limit.maxRatioOf=next;return;}
    delete limit.maxRatioOf;delete limit.max;if(!Object.keys(limit).length)delete binding.proof[key];
  });
  telemetryDropEmpty(binding,'proof');return binding;
}
function telemetryParams(value){
  var list=Array.isArray(value)?value.slice():typeof value==='string'?value.split(/[\s,]+/).filter(Boolean):value==null?[]:null;
  if(!list)return {error:'List parameter names separated by commas.'};
  for(var i=0;i<list.length;i++){
    var p=list[i];
    if(typeof p!=='string' || !telemetryParamPattern.test(p) || TELEMETRY_RESERVED.indexOf(p)>=0)
      return {error:'Parameter "'+p+'": use letters, digits and _ starting with a letter, other than '+TELEMETRY_RESERVED.join(', ')+'.'};
    if(list.indexOf(p)!==i)return {error:'Duplicate parameter "'+p+'".'};
  }
  return {value:list};
}
/* The template half of a template binding: the page template with the
   carrier's declared parameter values substituted. Missing values keep their
   $param placeholder, so the author sees what still needs a value. */
function telemetryTemplateBase(binding,templates){
  var template=telemetryObject(binding) && typeof binding.use==='string' && telemetryObject(templates) && telemetryOwn(templates,binding.use)?templates[binding.use]:null;
  if(!telemetryObject(template))return null;
  var values=Object.create(null);
  (Array.isArray(template.params)?template.params:[]).forEach(function(p){if(telemetryText(binding[p]))values[p]=binding[p];});
  var base={};Object.keys(template).forEach(function(key){if(key!=='params' && key!=='card')base[key]=telemetryClone(template[key]);});
  return telemetrySubstitute(base,values);
}
/* Authored form of a template binding with the carrier laid over it (the
   #937 rule: kind and card replace, signals/proof/links overlay per entry). */
function telemetryEffectiveBinding(binding,templates){
  if(!telemetryObject(binding))return null;
  if(!telemetryOwn(binding,'use'))return telemetryClone(binding);
  var out=telemetryTemplateBase(binding,templates);if(!out)return null;
  ['kind','card'].forEach(function(key){if(telemetryOwn(binding,key))out[key]=telemetryClone(binding[key]);});
  ['signals','proof','links'].forEach(function(key){
    if(!telemetryObject(binding[key]))return;
    var merged=telemetryObject(out[key])?out[key]:{};
    Object.keys(binding[key]).forEach(function(entry){merged[entry]=telemetryClone(binding[key][entry]);});
    out[key]=merged;
  });
  return out;
}
/* #1363: narrowing, needsNarrow and scoped variables as the editor reads and writes them. A
   Honeycomb or CloudWatch fragment is JSON; the text sources take the fragment as written. The
   same check the viewer runs refuses a fragment before it is stored. */
var TELEMETRY_NARROW_JSON={honeycomb:'{"filters":[{"column":"event_code","op":"=","value":"FULL_CHARGE"}]}',cloudwatch:'{"dimensions":{"Type":"FULL_CHARGE"}}'};
function telemetryNarrowText(fragment){return typeof fragment==='string'?fragment:JSON.stringify(fragment);}
function telemetryNarrowFragmentValue(source,text){
  var label=TELEMETRY_NARROW_LABELS[source] || source;
  if(source==='sql' || source==='tempo')return {error:label+' signals cannot be narrowed. Ask the provider to write a ${name} placeholder in its query, then set that variable.'};
  if(typeof text!=='string' || !text.trim())return {error:'Enter a narrowing to add.'};
  var value=text.trim();
  if(telemetryOwn(TELEMETRY_NARROW_JSON,source)){try{value=JSON.parse(value);}catch(ex){return {error:'A '+label+' narrowing is JSON, such as '+TELEMETRY_NARROW_JSON[source]+'.'};}}
  var problem=telemetryNarrowFragmentProblem(source,value);
  if(problem)return {error:'This '+label+' narrowing is not valid ('+problem.message+'), so it was not added.'};
  return {value:value};
}
// needsNarrow as typed: field names separated by commas, "any" for true, empty for none.
function telemetryNeedsValue(text){
  if(text==null || !String(text).trim())return {value:null};
  if(/^any$/i.test(String(text).trim()))return {value:true};
  var fields=[];String(text).split(',').forEach(function(f){f=f.trim();if(f && fields.indexOf(f)<0)fields.push(f);});
  if(fields.some(function(f){return /[\s"'`]/.test(f);}))return {error:'List the field names a board must narrow by, separated by commas (or any).'};
  return {value:fields};
}
/* #1363 c1: what the provider requires of a signal on an imported carrier, which this board can
   only add to: an inherited signal keeps its own needsNarrow and the binding-level one; a signal
   this board adds, and every signal of a replacing (copied) binding, gets the carrier's union
   (canon-topology, #1353). null when nothing is required. */
function telemetryRequiredNeeds(inherited,name,merging){
  if(!telemetryObject(inherited))return null;
  var signals=telemetryObject(inherited.signals)?inherited.signals:{},own=telemetryOwn(signals,name) && telemetryObject(signals[name])?signals[name]:null;
  if(merging && own)return telemetryNeedsMerge(own.needsNarrow,inherited.needsNarrow);
  var all=telemetryNeedsMerge(null,inherited.needsNarrow);
  Object.keys(signals).forEach(function(key){if(telemetryObject(signals[key]))all=telemetryNeedsMerge(all,signals[key].needsNarrow);});
  return all;
}
function telemetryNeedsKept(required,next){
  if(required==null)return true;
  if(required===true)return next===true;
  return next===true || Array.isArray(next) && required.every(function(f){return next.indexOf(f)>=0;});
}
function telemetryNeedsText(needs){return needs===true?'any':Array.isArray(needs)?needs.join(', '):'';}
function telemetryVariablesValue(text){
  if(text==null || !String(text).trim())return {value:null};
  var value;try{value=JSON.parse(text);}catch(ex){return {error:'Variables are a JSON object of named strings, such as {"code":"FULL_CHARGE"}.'};}
  if(!telemetryObject(value))return {error:'Variables are a JSON object of named strings, such as {"code":"FULL_CHARGE"}.'};
  var bad=null;telemetryScopedVariables(value,function(at){if(!bad)bad=at.slice(1);},'');
  if(bad)return {error:'Variable '+bad+': use a name that is not reserved (env, account) and a non-empty string value.'};
  return {value:Object.keys(value).length?value:null};
}
/* One edit of a carrier binding or (options.template) a page template.
   binding is the authored object or null; options.templates are the page
   templates from trackingTelemetry(page). */
function telemetryEditBinding(binding,edit,options){
  options=options || {};
  var templates=options.templates || {},asTemplate=!!options.template,op=edit && edit.op;
  var b=telemetryObject(binding)?telemetryClone(binding):null,usesTemplate=!!(b && telemetryOwn(b,'use'));
  var template=usesTemplate?templates[b.use]:null,base=usesTemplate?telemetryTemplateBase(b,templates):null;
  if(op==='remove'){if(asTemplate)return {error:'Remove the template instead.'};return {value:null};}
  if(op==='addSignal'){
    if(usesTemplate)return {error:'Switch Signals from to Raw signals to add a signal.'};
    var created=!b;if(created)b={kind:TELEMETRY_KINDS.indexOf(edit.kind)>=0?edit.kind:'call',signals:{}};
    if(!telemetryObject(b.signals))b.signals={};
    var named=telemetrySignalName(edit.name,b.signals,null);if(named.error)return named;
    if(TELEMETRY_SOURCES.indexOf(edit.source)<0)return {error:'Choose a source: Grafana, Loki, Tempo, SQL, Honeycomb, CloudWatch or CloudWatch Logs.'};
    var query=telemetryQueryValue(edit.source,edit.query);if(query.error)return query;
    var signal={};signal[edit.source]=query.value;
    if(telemetryText(edit.unit))signal.unit=edit.unit.trim();
    b.signals[named.value]=signal;
    return {value:b};
  }
  if(op==='use' && !b && !asTemplate){
    if(edit.name==null)return {value:null};
    if(!telemetryOwn(templates,edit.name))return {error:'Template "'+edit.name+'" is not defined in Status board settings → Metrics.'};
    var fresh={use:edit.name};
    // The template supplies the kind; the carrier's draft kind applies only when the template has none.
    if(!telemetryOwn(templates[edit.name],'kind') && TELEMETRY_KINDS.indexOf(edit.kind)>=0)fresh.kind=edit.kind;
    return {value:fresh};
  }
  if(!b)return {error:asTemplate?'Template not found.':'Add a signal or choose a template first.'};
  if(op==='kind'){
    if(edit.value==null){
      if(!asTemplate && !usesTemplate)return {error:'Choose a kind: '+TELEMETRY_KINDS.join(', ')+'.'};
      delete b.kind;return {value:b};
    }
    if(TELEMETRY_KINDS.indexOf(edit.value)<0)return {error:'Choose a kind: '+TELEMETRY_KINDS.join(', ')+'.'};
    b.kind=edit.value;return {value:b};
  }
  if(op==='variables'){
    var vars=telemetryVariablesValue(edit.value);if(vars.error)return vars;
    if(vars.value)b.variables=vars.value;else delete b.variables;
    return {value:b};
  }
  if(op==='narrow' || op==='needsNarrow'){
    if(usesTemplate)return {error:'This binding uses template "'+b.use+'"; narrow its signals in Status board settings → Metrics.'};
    var own=telemetryObject(b.signals)?b.signals:{};
    if(!telemetryOwn(own,edit.name) || !telemetryObject(own[edit.name]))return {error:'Signal "'+edit.name+'" not found. Render and select it again.'};
    var target=own[edit.name],from=telemetrySignalSource(target);
    if(!from)return {error:'Choose a source for this signal first.'};
    if(op==='needsNarrow'){
      var needs=telemetryNeedsValue(edit.value);if(needs.error)return needs;
      if(needs.value==null)delete target.needsNarrow;else target.needsNarrow=needs.value;
      return {value:b};
    }
    var narrow=telemetryObject(target.narrow)?Object.assign({},target.narrow):{},list=telemetryNarrowList(narrow[from]).slice();
    if(edit.action==='add'){
      var fragment=telemetryNarrowFragmentValue(from,edit.fragment);if(fragment.error)return fragment;
      var key=telemetryNarrowCanonical(fragment.value);
      if(list.some(function(f){return telemetryNarrowCanonical(f)===key;}))return {error:'This narrowing is already there.'};
      list.push(fragment.value);
    }else if(edit.action==='remove'){
      if(typeof edit.index!=='number' || edit.index<0 || edit.index>=list.length)return {error:'Narrowing not found. Render and select it again.'};
      list.splice(edit.index,1);
    }else return {error:'Unknown narrowing edit.'};
    if(list.length)narrow[from]=list;else delete narrow[from];
    if(Object.keys(narrow).length)target.narrow=narrow;else delete target.narrow;
    return {value:b};
  }
  if(op==='signal' || op==='removeSignal'){
    if(usesTemplate)return {error:'This binding uses template "'+b.use+'"; edit its signals in Status board settings → Metrics.'};
    var signals=telemetryObject(b.signals)?b.signals:{},name=edit.name;
    if(!telemetryOwn(signals,name))return {error:'Signal "'+name+'" not found. Render and select it again.'};
    if(op==='removeSignal'){
      if(asTemplate && Object.keys(signals).length===1)return {error:'A template needs at least one signal; remove the template instead.'};
      delete signals[name];telemetryProofSignal(b,name,null);
      if(!asTemplate && !Object.keys(signals).length)return {value:null};
      return {value:b};
    }
    var entry=telemetryObject(signals[name])?signals[name]:{},source=telemetrySignalSource(entry),next={};
    if(edit.field==='name'){
      var renamed=telemetrySignalName(edit.value,signals,name);if(renamed.error)return renamed;
      if(renamed.value===name)return {value:b};
      b.signals=telemetryRenameKey(signals,name,renamed.value);telemetryProofSignal(b,name,renamed.value);
      return {value:b};
    }
    if(edit.field==='source'){
      if(TELEMETRY_SOURCES.indexOf(edit.value)<0)return {error:'Choose a source: Grafana, Loki, Tempo, SQL, Honeycomb, CloudWatch or CloudWatch Logs.'};
      if(edit.value===source)return {value:b};
      var moved=telemetryQueryValue(edit.value,telemetryQueryText(source,source?entry[source]:null));
      if(moved.error)return {error:edit.value==='honeycomb'?'A Honeycomb query is a JSON object such as {"calculations":[{"op":"COUNT"}]}. Enter it as the query first, then choose Honeycomb.':moved.error};
      next[edit.value]=moved.value;
    }else if(edit.field==='query'){
      if(!source)return {error:'Choose a source for this signal first.'};
      if(edit.value==null)return {error:'A signal needs a query; use Remove signal to delete it.'};
      var value=telemetryQueryValue(source,edit.value);if(value.error)return value;
      next[source]=value.value;
    }else if(edit.field==='showOnCard' || edit.field==='missingMeansZero'){
      if(typeof edit.value!=='boolean')return {error:edit.field==='showOnCard'?'Show on card must be a boolean.':'missingMeansZero must be a boolean.'};
      if(source)next[source]=entry[source];
    }else if(edit.field==='role'){
      // #1240: "error" is the only role; null removes it.
      if(edit.value!=null && edit.value!=='error')return {error:'A signal role is "error" or none.'};
      if(source)next[source]=entry[source];
    }else if(edit.field==='window'){
      if(edit.value!=null){
        if(source==='cloudwatch')return {error:'CloudWatch signals always cover the page window; set the window in the CloudWatch query.'};
        if(!telemetryWindowDuration(edit.value))return {error:'Use a duration such as 30m, 1h, 7d or now-7d, or clear it to use the page window.'};
      }
      if(source)next[source]=entry[source];
    }else if(edit.field==='unit' || edit.field==='scope' || edit.field==='label' || edit.field==='queryLink'){
      if(source)next[source]=entry[source];
      // #1194: scope "" is authored on purpose: it hides the scope line.
      if(edit.value!=null && !telemetryText(edit.value) && !(edit.field==='scope' && edit.value===''))return {error:'Signal metadata must be non-empty text, or removed.'};
    }else return {error:'Unknown signal field.'};
    var unit=edit.field==='unit'?(edit.value==null?null:edit.value.trim()):(telemetryText(entry.unit)?entry.unit:null);
    if(unit)next.unit=unit;
    var scope=edit.field==='scope'?edit.value:entry.scope;if(scope==='')next.scope='';else if(telemetryText(scope))next.scope=scope.trim();
    var showOnCard=edit.field==='showOnCard'?edit.value:entry.showOnCard;if(typeof showOnCard==='boolean')next.showOnCard=showOnCard;
    // Checking the box returns to the default by removing the key.
    var missingMeansZero=edit.field==='missingMeansZero'?(edit.value===false?false:null):entry.missingMeansZero;if(typeof missingMeansZero==='boolean' && (next.loki!==undefined || next.grafana!==undefined))next.missingMeansZero=missingMeansZero;
    if(edit.field==='window'){if(edit.value!=null)next.window=edit.value.trim();}
    else if(telemetryOwn(entry,'window'))next.window=entry.window;
    if(edit.field==='role'){if(edit.value!=null)next.role=edit.value;}
    else if(telemetryOwn(entry,'role'))next.role=entry.role;
    var label=edit.field==='label'?edit.value:entry.label;
    if(label!=null){if(!telemetryText(label) || label.length>120 || /[\x00-\x1f\x7f]/.test(label))return {error:'A label is 1–120 plain-text characters without control characters.'};next.label=label.trim();}
    var queryLink=edit.field==='queryLink'?edit.value:entry.links && entry.links.query;
    if(queryLink!=null){if(!telemetryQueryUrl(queryLink))return {error:'A query link is an absolute HTTP(S) URL without credentials or signed result tokens.'};next.links={query:queryLink};}
    // #1363: a field edit keeps the signal's narrowing and needsNarrow.
    ['narrow','needsNarrow'].forEach(function(key){if(telemetryOwn(entry,key))next[key]=entry[key];});
    signals[name]=next;b.signals=signals;
    return {value:b};
  }
  if(op==='proof'){
    var effective=usesTemplate?telemetryEffectiveBinding(b,templates):b,known=effective && telemetryObject(effective.signals)?effective.signals:{};
    var signal=edit.signal,field=edit.field,v=edit.value;
    if(!telemetryOwn(known,signal))return {error:'Signal "'+signal+'" not found. Render and select it again.'};
    if(field==='min' || field==='max'){if(v!=null && !telemetryNumber(v))return {error:'A limit is a finite number.'};}
    else if(field==='maxRatioOf'){if(v!=null && (v===signal || !telemetryOwn(known,v)))return {error:'Ratio of names another signal of this binding.'};}
    else return {error:'Unknown limit.'};
    var own=telemetryObject(b.proof) && telemetryObject(b.proof[signal]),inherited=base && telemetryObject(base.proof) && telemetryObject(base.proof[signal])?base.proof[signal]:null;
    var limit=own?telemetryClone(b.proof[signal]):inherited?telemetryClone(inherited):{};
    if(v==null)delete limit[field];else limit[field]=v;
    if(!limit.maxRatioOf && telemetryNumber(limit.min) && telemetryNumber(limit.max) && limit.min>limit.max)return {error:'Min is above max, so the limit could never hold.'};
    var proof=telemetryObject(b.proof)?b.proof:{};
    if(usesTemplate && inherited && JSON.stringify(Object.keys(limit).sort().map(function(k){return [k,limit[k]];}))===JSON.stringify(Object.keys(inherited).sort().map(function(k){return [k,inherited[k]];})))delete proof[signal];
    else if(!Object.keys(limit).length){
      if(usesTemplate && inherited)return {error:'This limit comes from template "'+b.use+'"; set another value instead of clearing it.'};
      delete proof[signal];
    }else proof[signal]=limit;
    b.proof=proof;telemetryDropEmpty(b,'proof');
    return {value:b};
  }
  if(op==='link'){
    if(TELEMETRY_LINKS.indexOf(edit.key)<0)return {error:'Unknown link.'};
    var links=telemetryObject(b.links)?b.links:{};
    if(edit.value==null)delete links[edit.key];
    else if(asTemplate){if(!telemetryText(edit.value))return {error:'Enter a URL; $param placeholders are allowed.'};links[edit.key]=edit.value.trim();}
    else{var url=deltaLinkUrl(edit.value);if(!url)return {error:'Use an absolute http(s) URL.'};links[edit.key]=edit.value.indexOf('${env}')>=0?url.replace(/\$%7Benv%7D/gi,'${env}'):url;}
    b.links=links;telemetryDropEmpty(b,'links');
    return {value:b};
  }
  if(asTemplate)return {error:'Unknown template edit.'};
  if(op==='card'){
    var card=telemetryObject(b.card)?b.card:{};
    if(edit.field==='side'){
      if(edit.value!=null && TELEMETRY_CARD_SIDES.indexOf(edit.value)<0)return {error:'Choose a side: '+TELEMETRY_CARD_SIDES.join(', ')+'.'};
    }else if(edit.field==='offset'){
      if(edit.value!=null && !(telemetryNumber(edit.value) && Math.abs(edit.value)<=TELEMETRY_CARD_OFFSET_MAX))return {error:'Use a number of pixels between -'+TELEMETRY_CARD_OFFSET_MAX+' and '+TELEMETRY_CARD_OFFSET_MAX+'.'};
    }else if(edit.field==='position'){
      if(edit.value!=null && !(telemetryObject(edit.value) && telemetryNumber(edit.value.x) && telemetryNumber(edit.value.y)))return {error:'Card position needs finite x and y coordinates.'};
    }else if(edit.field==='title'){
      if(edit.value!=null && !telemetryCardTitle(edit.value))return {error:'A card title is 1–120 plain-text characters without control characters.'};
    }else if(edit.field==='width'){
      if(edit.value!=null && !telemetryCardWidth(edit.value))return {error:'Use a card width in pixels between '+TELEMETRY_CARD_WIDTH_MIN+' and '+TELEMETRY_CARD_WIDTH_MAX+'.'};
    }else return {error:'Unknown card field.'};
    if(edit.value==null)delete card[edit.field];else card[edit.field]=edit.field==='position'?{x:edit.value.x,y:edit.value.y}:edit.field==='title'?edit.value.trim():edit.value;
    b.card=card;telemetryDropEmpty(b,'card');
    return {value:b};
  }
  if(op==='use'){
    if(edit.name==null){
      if(!usesTemplate)return {value:b};
      var expanded=telemetryEffectiveBinding(b,templates);
      if(!expanded)return {error:'Template "'+b.use+'" is not defined in Status board settings → Metrics. Use Remove metrics to start over.'};
      var raw={};['kind','signals','proof','links','card'].forEach(function(key){if(telemetryOwn(expanded,key))raw[key]=expanded[key];});
      return {value:raw};
    }
    if(!telemetryOwn(templates,edit.name))return {error:'Template "'+edit.name+'" is not defined in Status board settings → Metrics.'};
    if(usesTemplate && b.use===edit.name)return {value:b};
    var chosen=templates[edit.name],out={use:edit.name};
    if(!telemetryOwn(chosen,'kind') && TELEMETRY_KINDS.indexOf(b.kind)>=0)out.kind=b.kind;
    (Array.isArray(chosen.params)?chosen.params:[]).forEach(function(p){if(telemetryText(b[p]))out[p]=b[p];});
    ['links','card'].forEach(function(key){if(telemetryOwn(b,key))out[key]=b[key];});
    return {value:out};
  }
  if(op==='param'){
    if(!usesTemplate || !telemetryObject(template))return {error:'Choose a template first.'};
    if((Array.isArray(template.params)?template.params:[]).indexOf(edit.name)<0)return {error:'Template "'+b.use+'" has no parameter "'+edit.name+'".'};
    if(edit.value==null)delete b[edit.name];
    else if(!telemetryText(edit.value))return {error:'A parameter value is non-empty text.'};
    else b[edit.name]=edit.value;
    return {value:b};
  }
  return {error:'Unknown metrics edit.'};
}
/* #1239: Status board settings → Traces edits tracking.telemetry.traceConnections
   (docs/trace-connections.md). edit: {op:'traceConnections', action, company, ...}; company is the
   build's company profile map (TELEMETRY_COMPANY_TRACE_CONNECTIONS).
   - inherit: remove the key, so the board inherits every company profile again.
   - mode {profile, value:'use'|'disable', inherited}: list or unlist a company profile. Leaving
     inheritance first lists the profiles the board inherits now (edit.inherited: every company profile
     on a board that uses traces, none otherwise), so only the chosen one changes.
   - label {profile, value}: the board label of that profile's connection.
   - environment {profile, env, on}: the environment subset (all environments: no key).
   - envField {profile, env, field:'label'|'value'|'context', key?, value}: one environment override.
   - attribute {id | profile, name, remove?}: add (or with remove, drop) one allowedAttributes name of an
     inline profile, or one board addition to a company profile's list (Chuck 2026-11-12).
   - json {value}: the whole map as JSON text (Advanced); null removes the key.
   Every edit but json is checked with FlowTraceConnections.resolve first: an edit that would make
   its connection fail to resolve is refused with the resolver's message. */
function telemetryTraceEntryId(map,profile){
  var found=null;Object.keys(map).some(function(id){if(telemetryObject(map[id]) && map[id].profile===profile)found=id;return !!found;});return found;
}
function telemetryEditTraceConnections(t,edit,done){
  var company=telemetryObject(edit.company)?edit.company:{},action=edit.action,present=telemetryOwn(t,'traceConnections');
  if(action==='inherit'){delete t.traceConnections;return done();}
  if(action==='json'){
    if(edit.value==null){delete t.traceConnections;return done();}
    var parsed;try{parsed=JSON.parse(edit.value);}catch(ex){return {error:'Trace connections are a JSON object of connections, such as {"operations":{"profile":"operations"}}.'};}
    if(!telemetryObject(parsed))return {error:'Trace connections are a JSON object of connections, such as {"operations":{"profile":"operations"}}.'};
    t.traceConnections=parsed;return done();
  }
  if(present && !telemetryObject(t.traceConnections))return {error:'Trace connections are not an object; fix them in Advanced JSON first.'};
  var map=present?t.traceConnections:null,touched=null,profile=edit.profile;
  function companyProfile(){return typeof profile==='string' && telemetryOwn(company,profile) && telemetryObject(company[profile])?company[profile]:null;}
  if(action==='mode' || action==='label' || action==='environment' || action==='envField' || action==='attribute' && edit.profile!=null){
    if(!companyProfile())return {error:'Unknown company trace profile "'+profile+'".'};
    if(!map){
      var inherited=(Array.isArray(edit.inherited)?edit.inherited:[]).filter(function(id){return telemetryOwn(company,id);});
      // A board that inherits nothing (no traces, or metrics off) has nothing to disable.
      if(action==='mode' && edit.value==='disable' && inherited.indexOf(profile)<0)return {error:'This board does not inherit '+profile+', so there is nothing to disable.'};
      map={};inherited.forEach(function(id){map[id]={profile:id};});
    }
    var at=telemetryTraceEntryId(map,profile);
    if(action==='mode'){
      if(edit.value==='use'){
        if(!at){at=profile;for(var n=2;telemetryOwn(map,at);n++)at=profile+'-'+n;map[at]={profile:profile};}
        touched=at;
      }else if(edit.value==='disable')Object.keys(map).forEach(function(id){if(telemetryObject(map[id]) && map[id].profile===profile)delete map[id];});
      else return {error:'Choose Use or Disable.'};
    }else{
      if(!at)return {error:'Set '+profile+' to Use first.'};
      touched=at;var entry=map[at],envIds=telemetryObject(company[profile].environments)?Object.keys(company[profile].environments):[];
      if(action==='attribute'){
        // #1239 (Chuck 2026-11-12): the board's additions to the company list; the company's own stay read only.
        var own=Array.isArray(company[profile].allowedAttributes)?company[profile].allowedAttributes:[],added=Array.isArray(entry.allowedAttributes)?entry.allowedAttributes.slice():[],attr=typeof edit.name==='string'?edit.name.trim():'';
        if(!edit.remove){
          if(!attr)return {error:'Type a span attribute name, such as device.model.'};
          if(own.indexOf(attr)>=0)return {error:'"'+attr+'" is already allowed by the company profile.'};
          if(added.indexOf(attr)>=0)return {error:'"'+attr+'" is already allowed.'};
          added.push(attr);
        }else{if(added.indexOf(attr)<0)return {error:'"'+attr+'" is not one of this board\'s additions.'};added=added.filter(function(x){return x!==attr;});}
        if(added.length)entry.allowedAttributes=added;else delete entry.allowedAttributes;
      }else if(action==='label'){
        if(edit.value==null)delete entry.label;
        else if(!telemetryText(edit.value) || edit.value.length>200 || /[\x00-\x1f<>]/.test(edit.value))return {error:'A label is 1–200 characters without < or >.'};
        else entry.label=edit.value.trim();
      }else{
        var envs=telemetryObject(entry.environments)?entry.environments:null,env=edit.env;
        if(envIds.indexOf(env)<0)return {error:'Unknown environment "'+env+'" in '+profile+'.'};
        if(!envs){envs={};envIds.forEach(function(id){envs[id]={};});}
        if(action==='environment'){
          if(edit.on){if(!telemetryOwn(envs,env))envs[env]={};}
          else{
            delete envs[env];
            if(!Object.keys(envs).length)return {error:'Keep at least one environment, or set '+profile+' to Disable.'};
          }
          // Company order, so the source reads like the profile.
          var ordered={};envIds.forEach(function(id){if(telemetryOwn(envs,id))ordered[id]=envs[id];});envs=ordered;
        }else{
          if(!telemetryOwn(envs,env))return {error:'Turn on '+env+' first.'};
          var over=telemetryObject(envs[env])?envs[env]:{},field=edit.field,value=edit.value==null?null:String(edit.value).trim();
          if(field==='label' || field==='value'){if(value==null)delete over[field];else over[field]=value;}
          else if(field==='context'){
            var context=telemetryObject(over.context)?over.context:{};
            if(value==null)delete context[edit.key];else context[edit.key]=value;
            if(Object.keys(context).length)over.context=context;else delete over.context;
          }else return {error:'Unknown environment field.'};
          envs[env]=over;
        }
        var all=envIds.every(function(id){return telemetryOwn(envs,id);}),bare=Object.keys(envs).every(function(id){return !Object.keys(envs[id] || {}).length;});
        if(all && bare)delete entry.environments;else entry.environments=envs;
      }
    }
  }else if(action==='attribute'){
    var id=edit.id;
    if(!map || !telemetryOwn(map,id) || !telemetryObject(map[id]) || telemetryOwn(map[id],'profile'))return {error:'Allowed attributes are set on an inline profile; company profiles set their own.'};
    var item=map[id],list=Array.isArray(item.allowedAttributes)?item.allowedAttributes.slice():[],name=typeof edit.name==='string'?edit.name.trim():'';
    if(!edit.remove){
      if(!name)return {error:'Type a span attribute name, such as device.model.'};
      if(list.indexOf(name)>=0)return {error:'"'+name+'" is already allowed.'};
      list.push(name);
    }else{if(list.indexOf(name)<0)return {error:'"'+name+'" is not in the list.'};list=list.filter(function(x){return x!==name;});}
    if(list.length)item.allowedAttributes=list;else delete item.allowedAttributes;
    touched=id;
  }else return {error:'Unknown trace connection edit.'};
  t.traceConnections=map;
  if(touched!=null){
    var problem=null;
    FlowTraceConnections.resolve({tracking:{telemetry:{traceConnections:map}}},company,function(path,message){if(!problem && path==='.traceConnections.'+touched)problem=message;});
    if(problem)return {error:problem.replace(/^configuration: /,'')};
  }
  return done();
}
/* #1239: read model for Status board settings → Traces. */
function telemetryTraceConnectionState(raw,company){
  var doc=builderDocumentPage(raw),page=doc && doc.page,t=page && telemetryObject(page.tracking) && telemetryObject(page.tracking.telemetry)?page.tracking.telemetry:{};
  company=telemetryObject(company)?company:{};
  var present=telemetryOwn(t,'traceConnections'),valid=!present || telemetryObject(t.traceConnections),map=present && valid?telemetryClone(t.traceConnections):null;
  var profiles={};Object.keys(company).forEach(function(id){try{profiles[id]={profile:FlowTraceConnections.profile(company[id])};}catch(ex){profiles[id]={error:String(ex.message).replace(/^configuration: /,'')};}});
  var entries={};Object.keys(company).forEach(function(id){var at=map?telemetryTraceEntryId(map,id):null;entries[id]=at?{id:at,entry:map[at],more:Object.keys(map).filter(function(k){return k!==at && telemetryObject(map[k]) && map[k].profile===id;})}:null;});
  var inline=map?Object.keys(map).filter(function(id){return telemetryObject(map[id]) && !telemetryOwn(map[id],'profile');}):[];
  var resolved={};try{resolved=page?FlowTraceConnections.resolve(page,company):{};}catch(ex){resolved={};}
  return {present:present,valid:valid,map:map,companyIds:Object.keys(company),profiles:profiles,entries:entries,inline:inline,
    resolved:resolved,usesTraces:!!page && FlowTraceConnections.usesTraces(page),enabled:t.enabled!==false};
}
/* #1240: one shared (edit.environment null) or environment variable row: action add, rename,
   value or remove. Names and values follow the validator: a non-reserved name and non-empty text.
   Entries the rows cannot read stay as written. */
var TELEMETRY_RESERVED_VARIABLES=['env','account','constructor','prototype','__proto__'];
function telemetryEditVariable(t,edit,done){
  var holder=t,env=edit.environment;
  if(env!=null){
    var profiles=telemetryObject(t.environments)?t.environments:{};
    if(typeof env!=='string' || !telemetryOwn(profiles,env) || !telemetryObject(profiles[env]))return {error:'Choose a configured environment.'};
    holder=profiles[env];
  }
  if(telemetryOwn(holder,'variables') && !telemetryObject(holder.variables))return {error:'Variables here are not an object; repair them in JSON first.'};
  var vars=telemetryObject(holder.variables)?holder.variables:{},name=edit.name,action=edit.action;
  function nameProblem(n){
    if(typeof n!=='string' || !telemetryParamPattern.test(n))return 'Variable names start with a letter and use letters, digits and _.';
    return TELEMETRY_RESERVED_VARIABLES.indexOf(n)>=0?'"'+n+'" is reserved; choose another name.':'';
  }
  function valueProblem(v){return telemetryText(v)?'':'A variable value is non-empty text; use Remove to delete the variable.';}
  var problem;
  if(action==='add'){
    if(name==null || name==='')return {error:'Type a variable name.'};
    if((problem=nameProblem(name)))return {error:problem};
    if(telemetryOwn(vars,name))return {error:'Variable "'+name+'" already exists; edit its value instead.'};
    if((problem=valueProblem(edit.value)))return {error:problem};
    vars[name]=edit.value.trim();
  }else{
    if(typeof name!=='string' || !telemetryOwn(vars,name))return {error:'Variable "'+name+'" not found. Reopen Status board settings.'};
    if(action==='remove')delete vars[name];
    else if(action==='rename'){
      if(edit.to==null)return {error:'A variable needs a name; use Remove to delete it.'};
      if(edit.to===name)return done();
      if((problem=nameProblem(edit.to)))return {error:problem};
      if(telemetryOwn(vars,edit.to))return {error:'Variable "'+edit.to+'" already exists.'};
      vars=telemetryRenameKey(vars,name,edit.to);
    }else if(action==='value'){
      if((problem=valueProblem(edit.value)))return {error:problem};
      vars[name]=edit.value.trim();
    }else return {error:'Unknown variable edit.'};
  }
  if(Object.keys(vars).length)holder.variables=vars;else delete holder.variables;
  return done();
}
/* One edit of the page `tracking.telemetry` block; null removes the block. */
function telemetryEditPage(telemetry,edit){
  var t=telemetryObject(telemetry)?telemetryClone(telemetry):{},op=edit && edit.op;
  function done(){return {value:Object.keys(t).length?t:null};}
  if(op==='enabled'){
    if(typeof edit.value!=='boolean')return {error:'Allow metrics must be true or false.'};
    if(telemetry!=null && !telemetryObject(telemetry))return {error:'Metrics settings are not an object; repair tracking.telemetry in JSON first.'};
    // #1254 item 9: true is the default, so it is not written.
    if(edit.value)delete t.enabled;else t.enabled=false;return done();
  }
  if(op==='addEnvironment' || op==='removeEnvironment' || op==='environment' || op==='environmentSetting' || op==='renameEnvironment'){
    var profiles=telemetryObject(t.environments)?t.environments:{},id=edit.name;
    if(op==='environment'){
      if(typeof edit.value!=='string' || !telemetryOwn(profiles,edit.value))return {error:'Choose a configured environment.'};
      t.environment=edit.value;return done();
    }
    if(typeof id!=='string' || !telemetryNamePattern.test(id))return {error:'Environment ids start with a letter and use letters, digits, - and _.'};
    if(op==='addEnvironment'){
      if(telemetryOwn(profiles,id))return {error:'Environment "'+id+'" already exists.'};
      Object.defineProperty(profiles,id,{value:{},enumerable:true,writable:true,configurable:true});
      if(!t.environment)t.environment=id;
    }else if(op==='renameEnvironment'){
      // #1240: the profile keeps its place and settings; a default that named it follows the new id.
      if(!telemetryOwn(profiles,id))return {error:'Choose a configured environment.'};
      if(edit.to==null)return {error:'An environment needs an id; use Remove environment '+id+' to delete it.'};
      if(typeof edit.to!=='string' || !telemetryNamePattern.test(edit.to))return {error:'Environment ids start with a letter and use letters, digits, - and _.'};
      if(edit.to===id)return done();
      if(telemetryOwn(profiles,edit.to))return {error:'Environment "'+edit.to+'" already exists.'};
      profiles=telemetryRenameKey(profiles,id,edit.to);
      if(t.environment===id)t.environment=edit.to;
    }else{
      if(!telemetryOwn(profiles,id))return {error:'Choose a configured environment.'};
      if(op==='removeEnvironment'){
        delete profiles[id];if(t.environment===id)t.environment=Object.keys(profiles)[0];
      }else{
        if(['grafana','honeycomb','variables'].indexOf(edit.source)<0)return {error:'Unknown environment datasource.'};
        var changed=telemetryEditPage(profiles[id],{op:edit.source,key:edit.key,value:edit.value});if(changed.error)return changed;
        profiles[id]=changed.value || {};
      }
    }
    if(Object.keys(profiles).length)t.environments=profiles;else {delete t.environments;delete t.environment;}
    return done();
  }
  if(op==='variable'){
    if(telemetry!=null && !telemetryObject(telemetry))return {error:'Metrics settings are not an object; repair tracking.telemetry in JSON first.'};
    return telemetryEditVariable(t,edit,done);
  }
  if(op==='variables'){
    if(edit.value==null || edit.value===''){delete t.variables;return done();}
    var variables;try{variables=typeof edit.value==='string'?JSON.parse(edit.value):edit.value;}catch(e){return {error:'Variables must be a JSON object of named strings.'};}
    var errors=[];trackingTelemetry({tracking:{telemetry:{variables:variables}}},function(at,message){errors.push(message);});
    if(errors.length)return {error:errors[0]};
    t.variables=telemetryClone(variables);return done();
  }
  if(op==='grafana' || op==='honeycomb'){
    if(TELEMETRY_DATASOURCES[op].indexOf(edit.key)<0)return {error:'Unknown '+op+' setting.'};
    var group=telemetryObject(t[op])?t[op]:{};
    if(edit.value==null)delete group[edit.key];
    else if(!telemetryText(edit.value))return {error:'Enter a name, or clear the field.'};
    else group[edit.key]=edit.value.trim();
    t[op]=group;telemetryDropEmpty(t,op);return done();
  }
  if(op==='window'){
    if(edit.value==null)delete t.window;
    else if(!telemetryWindowDuration(edit.value))return {error:'Use a duration such as 30m, 1h, 7d, -6h or now-6h.'};
    else t.window=edit.value.trim();
    return done();
  }
  if(op==='refreshMs'){
    if(edit.value==null)delete t.refreshMs;
    else if(!telemetryNumber(edit.value) || edit.value<TELEMETRY_MIN_REFRESH_MS)return {error:'Use at least '+TELEMETRY_MIN_REFRESH_MS+' ms (five minutes), or clear it for the default of five minutes.'};
    else t.refreshMs=edit.value;
    return done();
  }
  if(op==='traceConnections'){
    if(telemetry!=null && !telemetryObject(telemetry))return {error:'Metrics settings are not an object; repair tracking.telemetry in JSON first.'};
    return telemetryEditTraceConnections(t,edit,done);
  }
  if(op==='lookupsEnabled' || op==='addLookup' || op==='removeLookup' || op==='moveLookup' || op==='lookup'){
    if(telemetry!=null && !telemetryObject(telemetry))return {error:'Metrics settings are not an object; repair tracking.telemetry in JSON first.'};
    return telemetryEditLookups(t,edit,done);
  }
  var templates=telemetryObject(t.templates)?t.templates:{};
  if(op==='addTemplate'){
    if(typeof edit.name!=='string' || !telemetryNamePattern.test(edit.name))return {error:'Template names start with a letter and use letters, digits, - and _.'};
    if(telemetryOwn(templates,edit.name))return {error:'Template "'+edit.name+'" already exists.'};
    if(edit.kind!=null && TELEMETRY_KINDS.indexOf(edit.kind)<0)return {error:'Choose a kind: '+TELEMETRY_KINDS.join(', ')+'.'};
    var params=telemetryParams(edit.params);if(params.error)return params;
    var created={};if(edit.kind!=null)created.kind=edit.kind;if(params.value.length)created.params=params.value;created.signals={};
    var signal=edit.signal || {},added=telemetryEditBinding(created,{op:'addSignal',name:signal.name,source:signal.source,query:signal.query,unit:signal.unit},{template:true});
    if(added.error)return added;
    templates[edit.name]=added.value;t.templates=templates;return done();
  }
  if(!telemetryOwn(templates,edit && (edit.name || edit.template)))return {error:'Template not found. Reopen Status board settings.'};
  if(op==='removeTemplate'){delete templates[edit.name];t.templates=templates;telemetryDropEmpty(t,'templates');return done();}
  var name=edit.template,current=templates[name];
  if(!telemetryObject(current))return {error:'Template "'+name+'" is not an object; remove it or repair it in JSON.'};
  if(op==='params'){
    var list=telemetryParams(edit.value);if(list.error)return list;
    if(list.value.length)current.params=list.value;else delete current.params;
    return done();
  }
  if(op==='template'){
    var result=telemetryEditBinding(current,edit.edit,{template:true});if(result.error)return result;
    templates[name]=result.value;return done();
  }
  return {error:'Unknown metrics setting.'};
}
function telemetryPageTemplates(raw){var doc=builderDocumentPage(raw);return trackingTelemetry(doc && doc.page).templates;}
/* Every authored carrier (and consumer overlay entry) that names a template. */
function telemetryTemplateUses(raw,name){return telemetryTemplateCarriers(raw,name).length;}
/* The authored homes (local nodes and edges, import overlay entries) whose telemetry uses a template. */
function telemetryTemplateCarriers(raw,name){
  var found=[];
  specSectionPaths(raw).forEach(function(rec){
    var d=specValueAt(raw,rec.diagram);if(!telemetryObject(d))return;
    function check(value,path){if(telemetryObject(value) && telemetryObject(value.telemetry) && value.telemetry.use===name)found.push({path:rec.diagram.concat(path),telemetry:value.telemetry});}
    if(telemetryObject(d.nodes))Object.keys(d.nodes).forEach(function(id){check(d.nodes[id],['nodes',id]);});
    (Array.isArray(d.edges)?d.edges:[]).forEach(function(edge,i){check(edge,['edges',i]);});
    (Array.isArray(d.topologyImports)?d.topologyImports:[]).forEach(function(imp,i){
      ['nodeTracking','edgeTracking'].forEach(function(field){if(telemetryObject(imp && imp[field]))Object.keys(imp[field]).forEach(function(key){check(imp[field][key],['topologyImports',i,field,key]);});});
    });
  });
  return found;
}
/* Resolve the selected node or connection to its authored home: the local
   carrier, or the consumer overlay entry of an authored topology import. A
   resolved snapshot owns its imported carriers, so they edit in place. */
function telemetryCarrierTarget(text,raw,target,context){
  if(!target || (target.kind!=='node' && target.kind!=='edge'))return {error:'Choose a node or connection.'};
  var got=builderDiagram(text,raw,target.section);if(got.error)return got;
  var resolved;try{resolved=typeof FlowTopology!=='undefined'?FlowTopology.resolveSource(raw,context):raw;}catch(ex){return {error:ex.message};}
  var rec=specSectionPaths(resolved)[target.section],d=rec && specValueAt(resolved,rec.diagram);
  if(!telemetryObject(d))return {error:'Diagram not found.'};
  var out={got:got,resolvedDoc:resolved,diagram:d,hasField:false,binding:null};
  if(target.kind==='node'){
    out.id=target.id;out.resolved=telemetryObject(d.nodes) && telemetryOwn(d.nodes,target.id)?d.nodes[target.id]:null;
    if(!telemetryObject(out.resolved))return {error:'Node not found. Render and select it again.'};
  }else{
    var edge=Array.isArray(d.edges)?d.edges[target.index]:null;
    if(!telemetryObject(edge) || target.key && builderEdgeKey(edge)!==target.key)return {error:'The connection changed. Render and select it again.'};
    out.id=builderEdgeKey(edge);out.resolved=edge;
  }
  if(telemetryTextBox(out.resolved))return {error:'Text boxes do not carry telemetry.'};
  var owner=typeof FlowTopology!=='undefined'?FlowTopology.origin(d,target.kind==='node'?'nodes':'edges',out.id):null,imports=Array.isArray(got.d.topologyImports)?got.d.topologyImports:[];
  var index=owner?imports.findIndex(function(imp){return imp && imp.as===owner.as;}):-1,entry;
  if(index>=0){
    out.owner=owner;out.field=target.kind==='node'?'nodeTracking':'edgeTracking';
    var relative=out.id.split('->').map(function(part){return part.slice(owner.as.length+2);}).join('->');
    entry=telemetryObject(imports[index][out.field])?imports[index][out.field][relative]:null;
  }else{
    var edges=Array.isArray(got.d.edges)?got.d.edges:[];
    var local=target.kind==='node'?(telemetryObject(got.d.nodes) && telemetryOwn(got.d.nodes,target.id)?got.d.nodes[target.id]:null)
      :telemetryObject(edges[target.index]) && builderEdgeKey(edges[target.index])===out.id?edges[target.index]:edges.find(function(e){return builderEdgeKey(e)===out.id;});
    if(!telemetryObject(local))return {error:'Authored carrier not found. Render and select it again.'};
    if(telemetryTextBox(local))return {error:'Text boxes do not carry telemetry.'};
    out.path=target.kind==='node'?got.path.concat(['nodes',target.id]):got.path.concat(['edges',edges.indexOf(local)]);
    entry=local;
  }
  if(telemetryObject(entry) && telemetryOwn(entry,'telemetry')){out.hasField=true;out.binding=telemetryObject(entry.telemetry)?entry.telemetry:null;}
  return out;
}
/* #1266: the inherited binding of an imported carrier (resolved without this consumer's entry). */
function telemetryInheritedBinding(text,raw,target,t,context){
  if(!t.owner)return null;
  var tracked=topologyTrackingTarget(text,raw,target.section,target.kind,t.id,context,target.index);
  return !tracked.error && telemetryObject(tracked.inherited.telemetry)?tracked.inherited.telemetry:null;
}
/* An imported carrier always edits a merge overlay ({extends:true,…}), also before its provider
   has a binding, so a provider binding added later merges too. A carrier with an older replacing
   overlay keeps editing that whole binding. */
function telemetryMergeMode(t){return !!t.owner && (!t.hasField || telemetryMergeOverlay(t.binding));}
function telemetryCanonical(v){return JSON.stringify(v,function(key,value){return telemetryObject(value)?Object.keys(value).sort().reduce(function(out,k){out[k]=value[k];return out;},{}):value;});}
function telemetryFieldDiff(base,next){
  var diff={},changed=false;base=telemetryObject(base)?base:{};next=telemetryObject(next)?next:{};
  Object.keys(next).forEach(function(key){if(JSON.stringify(base[key])!==JSON.stringify(next[key])){diff[key]=telemetryClone(next[key]);changed=true;}});
  Object.keys(base).forEach(function(key){if(!telemetryOwn(next,key)){diff[key]=null;changed=true;}});
  return changed?diff:null;
}
/* The smallest merge overlay that turns the inherited binding into effective:
   FlowTopology.mergeTelemetry(inherited, overlay) deep-equals effective. */
function telemetryDiffImported(inherited,effective,previous){
  inherited=telemetryObject(inherited)?inherited:{};effective=telemetryObject(effective)?effective:{};
  var inheritedSignals=telemetryObject(inherited.signals)?Object.keys(inherited.signals):[],signals=telemetryObject(effective.signals)?effective.signals:{};
  var hide=inheritedSignals.filter(function(name){return !telemetryOwn(signals,name);}),base=telemetryClone(inherited),out={extends:true};
  hide.forEach(function(name){telemetryDropSignal(base,name);});
  // Only a kind that differs from the provider's is stored (none inherited counts as different),
  // so provider kind changes keep flowing.
  if(telemetryOwn(effective,'kind') && effective.kind!==base.kind)out.kind=effective.kind;
  // Keep hides for names the provider does not have now, so a signal it re-adds stays hidden.
  if(telemetryMergeOverlay(previous) && Array.isArray(previous.hide))previous.hide.forEach(function(name){if(inheritedSignals.indexOf(name)<0 && hide.indexOf(name)<0)hide.push(name);});
  if(hide.length)out.hide=hide;
  var patch={},narrows=false;
  Object.keys(signals).forEach(function(name){
    var from=telemetryObject(base.signals) && telemetryOwn(base.signals,name)?base.signals[name]:null,next=signals[name],d;
    if(!from)d=telemetryClone(next);
    else{
      // #1363: narrow appends and needsNarrow adds up when merged, so only the board's own are stored;
      // a board's narrowing also drops the inherited query link, which is not a change of its own.
      var own=telemetryNarrowOwn(from,next),a=telemetryClone(from),z=telemetryObject(next)?telemetryClone(next):{};
      ['narrow','needsNarrow'].forEach(function(key){delete a[key];delete z[key];});
      if(own.narrow)telemetryWithoutQueryLink(a,z);
      d=telemetryFieldDiff(a,z);
      if(own.narrow){d=d || {};d.narrow=own.narrow;narrows=true;}
      if(own.needs){d=d || {};d.needsNarrow=own.needs;}
    }
    if(d)patch[name]=d;
    if(!from && telemetryObject(next) && telemetryNarrowMerge(null,next.narrow))narrows=true;
  });
  if(Object.keys(patch).length)out.signals=patch;
  var proof={},baseProof=telemetryObject(base.proof)?base.proof:{},nextProof=telemetryObject(effective.proof)?effective.proof:{};
  Object.keys(nextProof).forEach(function(name){var d=telemetryFieldDiff(baseProof[name],nextProof[name]);if(d)proof[name]=d;});
  Object.keys(baseProof).forEach(function(name){if(!telemetryOwn(nextProof,name))proof[name]=null;});
  if(Object.keys(proof).length)out.proof=proof;
  ['links','card'].forEach(function(field){
    var from=base[field],next=effective[field];
    if(field==='links' && narrows){var a={links:from},z={links:next};telemetryWithoutQueryLink(a,z);from=a.links;}
    var d=telemetryFieldDiff(from,next);if(d)out[field]=d;
  });
  // The carrier's own scoped variables and binding needsNarrow are not part of the merged binding.
  if(telemetryMergeOverlay(previous))['variables','needsNarrow'].forEach(function(key){if(telemetryOwn(previous,key))out[key]=telemetryClone(previous[key]);});
  return out;
}
// The fragments and needsNarrow fields next has beyond from (by canonical value), or null.
function telemetryNarrowOwn(from,next){
  var out={narrow:null,needs:null},a=telemetryObject(from) && telemetryObject(from.narrow)?from.narrow:{},b=telemetryObject(next) && telemetryObject(next.narrow)?next.narrow:{};
  Object.keys(b).forEach(function(source){
    var seen=telemetryNarrowList(a[source]).map(telemetryNarrowCanonical),extra=telemetryNarrowList(b[source]).filter(function(f){return seen.indexOf(telemetryNarrowCanonical(f))<0;});
    if(extra.length){out.narrow=out.narrow || {};out.narrow[source]=telemetryClone(extra);}
  });
  var was=telemetryObject(from)?from.needsNarrow:null,now=telemetryObject(next)?next.needsNarrow:null;
  if(now===true && was!==true)out.needs=true;
  else if(Array.isArray(now) && was!==true){var more=now.filter(function(f){return !(Array.isArray(was) && was.indexOf(f)>=0);});if(more.length)out.needs=more;}
  return out;
}
// Drop links.query from a (inherited) when z (effective) has none: merging a board's narrowing drops it.
function telemetryWithoutQueryLink(a,z){
  if(!telemetryObject(a.links) || !telemetryOwn(a.links,'query') || telemetryObject(z.links) && telemetryOwn(z.links,'query'))return;
  a.links=Object.assign({},a.links);delete a.links.query;if(!Object.keys(a.links).length)delete a.links;
}
function telemetryEditMerge(inherited,overlay,edit,options){
  inherited=telemetryObject(inherited)?inherited:{};
  var o=telemetryMergeOverlay(overlay)?telemetryClone(overlay):{extends:true},op=edit && edit.op,names=telemetryObject(inherited.signals)?inherited.signals:{};
  if(op==='use')return {error:'A template cannot be used on an imported node or connection: its metrics merge with the provider\'s, and a template would replace them. To use a template\'s signals here, add them with New signal; they are kept as this document\'s additions.'};
  if(op==='remove')return {value:null};
  // #1363: the carrier's own scoped variables live in its overlay, beside the merged binding.
  if(op==='variables'){
    var vars=telemetryVariablesValue(edit.value);if(vars.error)return vars;
    if(vars.value)o.variables=vars.value;else delete o.variables;
    return {value:Object.keys(o).length>1?o:null};
  }
  var was=op==='narrow' || op==='needsNarrow'?(telemetryObject(names[edit.name])?names[edit.name]:{}):null;
  if(op==='narrow' && edit.action==='remove'){
    var source=telemetrySignalSource(was),count=source && telemetryObject(was.narrow)?telemetryNarrowList(was.narrow[source]).length:0;
    if(typeof edit.index==='number' && edit.index<count)return {error:'This narrowing comes from the provider, so it cannot be removed here. To change it, use Copy provider queries.'};
  }
  if(op==='needsNarrow'){
    var asked=telemetryNeedsValue(edit.value),required=telemetryRequiredNeeds(inherited,edit.name,true);if(asked.error)return asked;
    if(!telemetryNeedsKept(required,asked.value))return {error:'The provider asks each board to narrow this signal by '+telemetryNeedsText(required)+'; a board can add fields, never remove them.'};
  }
  var staleHide=op==='hide' && !edit.value && Array.isArray(o.hide) && o.hide.indexOf(edit.name)>=0;
  if(op==='hide' || op==='revert'){
    if(!telemetryOwn(names,edit.name) && !staleHide)return {error:'Signal "'+edit.name+'" is not inherited from the provider.'};
    var hidden=Array.isArray(o.hide)?o.hide.filter(function(name){return name!==edit.name;}):[];
    if(op==='hide' && edit.value)hidden.push(edit.name);
    if(op==='revert' || edit.value){
      if(telemetryObject(o.signals))delete o.signals[edit.name];
      if(telemetryObject(o.proof))delete o.proof[edit.name];
      ['signals','proof'].forEach(function(field){telemetryDropEmpty(o,field);});
    }
    if(hidden.length)o.hide=hidden;else delete o.hide;
  }else{
    // With nothing inherited or added yet, the first Add signal creates the binding (and its kind).
    var effective=FlowTopology.mergeTelemetry(inherited,o),result=telemetryEditBinding(Object.keys(effective).length?effective:null,edit,options);if(result.error)return result;
    o=telemetryDiffImported(inherited,result.value,telemetryMergeOverlay(overlay)?overlay:null);
  }
  // Nothing left that differs from the inherited binding (kind included): nothing to keep.
  return {value:Object.keys(o).length>1?o:null};
}
/* #1393: one scoped variable row (add, rename, value, remove) on a carrier's own variables or its
   import's. Names follow the board's rules; a value must pass the scoped-value allowlist, and an added
   or changed value that would keep one of this carrier's signals from being sent is refused with the
   viewer's reason. The write itself is the existing whole-object 'variables' / 'importVariables' edit. */
function telemetryVariableRowValue(current,edit){
  var vars=telemetryObject(current)?telemetryClone(current):{},name=edit.name,action=edit.action;
  function nameProblem(n){
    if(typeof n!=='string' || !telemetryParamPattern.test(n))return 'Variable names start with a letter and use letters, digits and _.';
    return TELEMETRY_RESERVED_VARIABLES.indexOf(n)>=0?'"'+n+'" is reserved; choose another name.':'';
  }
  function valueProblem(v){
    if(!telemetryText(v))return 'A variable value is non-empty text; use Remove to delete the variable.';
    return TELEMETRY_SCOPED_SPACED.test(v.trim())?'':TELEMETRY_SCOPED_ALLOWED.charAt(0).toUpperCase()+TELEMETRY_SCOPED_ALLOWED.slice(1)+'.';
  }
  var problem;
  if(action==='add'){
    if(!name)return {error:'Type a variable name.'};
    if((problem=nameProblem(name)))return {error:problem};
    if(telemetryOwn(vars,name))return {error:'Variable "'+name+'" already exists; edit its value instead.'};
    if((problem=valueProblem(edit.value)))return {error:problem};
    vars[name]=edit.value.trim();
  }else{
    if(typeof name!=='string' || !telemetryOwn(vars,name))return {error:'Variable "'+name+'" not found. Select the element again.'};
    if(action==='remove')delete vars[name];
    else if(action==='rename'){
      if(edit.to==null)return {error:'A variable needs a name; use Remove to delete it.'};
      if(edit.to===name)return {value:vars};
      if((problem=nameProblem(edit.to)))return {error:problem};
      if(telemetryOwn(vars,edit.to))return {error:'Variable "'+edit.to+'" already exists.'};
      vars=telemetryRenameKey(vars,name,edit.to);
    }else if(action==='value'){if((problem=valueProblem(edit.value)))return {error:problem};vars[name]=edit.value.trim();}
    else return {error:'Unknown variable edit.'};
  }
  return {value:vars};
}
/* review c1: why filling `name` = `value` would keep a signal from being sent, or null. Only that name is
   checked (telemetryScopedValueProblem with a one-name map), so another unset variable never blames it.
   Carrier scope: the selected carrier. Import scope (as): every node and connection of that import,
   except one whose own variables set the name (they win). The message names the carrier and signal. */
function telemetryVariableBlocked(raw,target,context,as,name,value){
  /* Import scope (review c2): the resolver copies the import's variables into every carrier it owns, so
     shadowing is read from a copy resolved without them: what is left is the provider's binding and the
     board's overlay, the variables that win over the import's. */
  var source=raw;
  if(as!=null){
    source=telemetryClone(raw);var paths=specSectionPaths(source)[target.section],d0=paths && specValueAt(source,paths.diagram);
    (telemetryObject(d0) && Array.isArray(d0.topologyImports)?d0.topologyImports:[]).forEach(function(imp){if(telemetryObject(imp) && imp.as===as)delete imp.variables;});
  }
  var resolved;try{resolved=typeof FlowTopology!=='undefined'?FlowTopology.resolveSource(source,context):source;}catch(ex){return null;}
  var rec=specSectionPaths(resolved)[target.section],d=rec && specValueAt(resolved,rec.diagram);if(!telemetryObject(d))return null;
  var templates=telemetryPageTemplates(resolved),carriers=[],prefix=as==null?null:as+'::';
  if(prefix==null){
    if(target.kind==='node' && telemetryObject(d.nodes) && telemetryObject(d.nodes[target.id]))carriers.push({label:'node '+target.id,value:d.nodes[target.id]});
    else if(target.kind==='edge' && Array.isArray(d.edges) && telemetryObject(d.edges[target.index])){var e=d.edges[target.index];carriers.push({label:'connection '+e.from+' → '+e.to,value:e});}
  }else{
    Object.keys(telemetryObject(d.nodes)?d.nodes:{}).forEach(function(id){if(id.indexOf(prefix)===0)carriers.push({label:'node '+id,value:d.nodes[id]});});
    (Array.isArray(d.edges)?d.edges:[]).forEach(function(e){if(telemetryObject(e) && String(e.from).indexOf(prefix)===0 && String(e.to).indexOf(prefix)===0)carriers.push({label:'connection '+e.from+' → '+e.to,value:e});});
  }
  var scoped={},found=null;scoped[name]=value;
  carriers.some(function(carrier){
    var binding=telemetryObject(carrier.value.telemetry)?carrier.value.telemetry:null;if(!binding)return false;
    if(prefix!=null && telemetryObject(binding.variables) && telemetryOwn(binding.variables,name))return false;
    var effective=telemetryEffectiveBinding(binding,templates) || binding,signals=telemetryObject(effective.signals)?effective.signals:{};
    return Object.keys(signals).some(function(signal){
      var entry=signals[signal],source=telemetrySignalSource(entry);if(!source)return false;
      var fragments=telemetryObject(entry.narrow)?telemetryNarrowList(entry.narrow[source]):[];
      var why=telemetryScopedValueProblem(source,entry[source],scoped,fragments);
      if(why)found='On '+carrier.label+', signal '+signal+' would not be sent: '+why;
      return !!found;
    });
  });
  return found;
}
function planCarrierTelemetry(text,raw,target,edit,context){
  if(edit && edit.op==='variableRow'){
    var before;try{before=telemetryCarrierState(raw,target,context);}catch(ex){return {error:ex.message};}
    if(before.error)return before;
    var importScope=edit.scope==='import';
    if(importScope && !before.importVariables)return {error:'Variables for an import are set on its imported nodes and connections.'};
    var current=importScope?before.importVariables.value:before.variables && before.variables.own;
    if(current!=null && !telemetryObject(current))return {error:'These variables are not an object; repair them in JSON first.'};
    var next=telemetryVariableRowValue(current,edit);if(next.error)return next;
    // review c1/c2: an added, changed or renamed value is checked for its (new) name, in every carrier it reaches.
    if(edit.action==='add' || edit.action==='value' || edit.action==='rename' && edit.to!==edit.name){
      var checked=edit.action==='rename'?edit.to:edit.name;
      var block=telemetryVariableBlocked(raw,target,context,importScope?before.importVariables.as:null,checked,next.value[checked]);
      if(block)return {error:block};
    }
    var whole=Object.keys(next.value).length?JSON.stringify(next.value):null;
    var plan=planCarrierTelemetry(text,raw,target,{op:importScope?'importVariables':'variables',value:whole},context);
    if(plan.error || plan.text===text || (edit.action!=='rename' && edit.action!=='remove'))return plan;
    // A rename or removal that leaves this carrier's signal without a value it used is refused (review c1 MINOR 2).
    var old=edit.name,after;try{after=telemetryCarrierState(JSON.parse(plan.text),target,context);}catch(ex){after=null;}
    var was=before.sent || {},now=after && after.sent || {},lost=null;
    Object.keys(now).some(function(signal){var e=now[signal].error || '';if(e.indexOf('${'+old+'}')>=0 && (!was[signal] || (was[signal].error || '').indexOf('${'+old+'}')<0))lost='Signal '+signal+' uses ${'+old+'}; '+(edit.action==='rename'?'renaming':'removing')+' it would leave the signal without a value. Change the query first, or keep the name.';return !!lost;});
    return lost?{error:lost}:plan;
  }
  var t=telemetryCarrierTarget(text,raw,target,context);if(t.error)return t;
  var inherited=telemetryInheritedBinding(text,raw,target,t,context);
  // #1363: an import's scoped variables (topologyImports[i].variables) apply to all its carriers.
  if(edit && edit.op==='importVariables'){
    var imports=Array.isArray(t.got.d.topologyImports)?t.got.d.topologyImports:[],at=t.owner?imports.findIndex(function(imp){return imp && imp.as===t.owner.as;}):-1;
    if(at<0)return {error:'Variables for an import are set on its imported nodes and connections.'};
    var vars=telemetryVariablesValue(edit.value);if(vars.error)return vars;
    if(JSON.stringify(vars.value)===JSON.stringify(telemetryOwn(imports[at],'variables')?imports[at].variables:null))return {text:text};
    return planSetField(text,raw,t.got.path.concat(['topologyImports',at]),'variables',vars.value==null?null:JSON.stringify(vars.value,null,2));
  }
  // #1363: copy the provider's queries into this document as its own (replacing) binding, to edit them.
  if(edit && edit.op==='copyProviderQuery'){
    if(!t.owner)return {error:'Copy provider queries works on imported nodes and connections.'};
    if(!telemetryMergeMode(t))return {error:'This node or connection already has its own copy of the metrics.'};
    if(!inherited)return {error:'The provider has no metrics here to copy.'};
    var overlay=telemetryMergeOverlay(t.binding)?t.binding:{extends:true},copy=FlowTopology.mergeTelemetry(inherited,overlay);
    if(telemetryObject(overlay.variables))copy.variables=Object.assign({},copy.variables,overlay.variables);
    if(telemetryOwn(overlay,'needsNarrow'))copy.needsNarrow=telemetryClone(overlay.needsNarrow);
    if(!telemetryObject(copy.signals) || !Object.keys(copy.signals).length)return {error:'Every inherited signal is hidden here, so there is nothing to copy.'};
    return planTopologyTracking(text,raw,target.section,target.kind,t.id,'telemetry',copy,false,context,target.index);
  }
  // #1266: convert an older replacing overlay into the merge overlay with exactly the same result.
  if(edit && edit.op==='mergeWithProvider'){
    if(!inherited || !t.hasField || telemetryMergeOverlay(t.binding))return {error:'Only a document binding that replaces an inherited one can be merged with the provider.'};
    var whole=telemetryObject(t.binding) && telemetryOwn(t.binding,'use')?telemetryExpand(t.binding,telemetryPageTemplates(raw)):telemetryObject(t.binding)?t.binding:null;
    if(!whole)return {error:'This binding cannot be expanded here; fix it before merging with the provider.'};
    var converted=telemetryDiffImported(inherited,whole,null);
    // Key order aside (signal rows follow the provider's order, then additions), the result is the same.
    if(telemetryCanonical(FlowTopology.mergeTelemetry(inherited,converted))!==telemetryCanonical(whole))return {error:'This binding cannot be stored as changes to the provider binding without changing its meaning.'};
    return planTopologyTracking(text,raw,target.section,target.kind,t.id,'telemetry',Object.keys(converted).length>1?converted:null,Object.keys(converted).length<=1,context,target.index);
  }
  if(telemetryMergeMode(t)){
    var merged=telemetryEditMerge(inherited,t.binding,edit,{templates:telemetryPageTemplates(raw)});if(merged.error)return merged;
    if(JSON.stringify(merged.value)===JSON.stringify(t.hasField?t.binding:null))return {text:text};
    return planTopologyTracking(text,raw,target.section,target.kind,t.id,'telemetry',merged.value,merged.value==null,context,target.index);
  }
  // #1363 c1: a copied (replacing) binding still carries the provider carrier's needsNarrow.
  if(edit && edit.op==='needsNarrow' && t.owner && inherited){
    var asked=telemetryNeedsValue(edit.value),required=telemetryRequiredNeeds(inherited,edit.name,false);if(asked.error)return asked;
    if(!telemetryNeedsKept(required,asked.value))return {error:'The provider asks each board to narrow this signal by '+telemetryNeedsText(required)+'; a board can add fields, never remove them.'};
  }
  // A placement edit of inherited telemetry creates a consumer override from
  // the resolver's expanded binding, never a reference to a provider template.
  var binding=t.binding;
  if(!binding && t.owner && edit && edit.op==='card')binding=telemetryObject(t.resolved.telemetry)?t.resolved.telemetry:null;
  // Clearing a card field the inherited binding does not set creates no override.
  if(!t.binding && binding && edit.value==null && !(telemetryObject(binding.card) && binding.card[edit.field]!=null))return {text:text};
  var result=telemetryEditBinding(binding,edit,{templates:telemetryPageTemplates(raw)});if(result.error)return result;
  // A non-object authored value is replaced or removed like any other binding.
  if(JSON.stringify(result.value)===JSON.stringify(t.binding) && !(t.hasField && !t.binding))return {text:text};
  if(t.owner)return planTopologyTracking(text,raw,target.section,target.kind,t.id,'telemetry',result.value,result.value==null,context,target.index);
  return planSetField(text,raw,t.path,'telemetry',result.value==null?null:JSON.stringify(result.value,null,2));
}
/* #1233: Status board settings → Log searches (tracking.telemetry.lookups). Authored key order is the Trace
   view's box order. The validator reports content problems next to each field; these edits refuse only what
   cannot be written: a bad or taken id, an empty label or query, an unknown search or setting. */
function telemetryLookupDefine(object,id,value){Object.defineProperty(object,id,{value:value,enumerable:true,writable:true,configurable:true});}
function telemetryEditLookups(t,edit,done){
  var op=edit.op,id=edit.name;
  if(telemetryOwn(t,'lookups') && !telemetryObject(t.lookups))return {error:'Log searches are not an object; repair tracking.telemetry.lookups in JSON first.'};
  var lookups=telemetryObject(t.lookups)?t.lookups:{};
  if(op==='lookupsEnabled'){
    if(typeof edit.value!=='boolean')return {error:'Offer log searches must be true or false.'};
    if(edit.value){t.lookups=lookups;return done();}
    if(Object.keys(lookups).length)return {error:'Remove the log searches first.'};
    delete t.lookups;return done();
  }
  if(op==='addLookup'){
    if(typeof id!=='string' || !telemetryNamePattern.test(id))return {error:'Log search ids start with a letter and use letters, digits, - and _.'};
    if(telemetryOwn(lookups,id))return {error:'Log search "'+id+'" already exists.'};
    var label=typeof edit.label==='string'?edit.label.trim():'',query=typeof edit.query==='string'?edit.query.trim():'';
    if(!label)return {error:'Enter a label for the new log search.'};
    if(!query)return {error:'Enter a LogQL query for the new log search.'};
    telemetryLookupDefine(lookups,id,{label:label,query:query});t.lookups=lookups;return done();
  }
  if(typeof id!=='string' || !telemetryOwn(lookups,id))return {error:'Log search not found. Reopen Status board settings.'};
  if(op==='removeLookup'){delete lookups[id];t.lookups=lookups;return done();}
  if(op==='moveLookup'){
    if(edit.offset!==-1 && edit.offset!==1)return {error:'Move a log search up or down.'};
    var ids=Object.keys(lookups),at=ids.indexOf(id),to=at+edit.offset;if(to<0 || to>=ids.length)return done();
    ids.splice(at,1);ids.splice(to,0,id);var moved={};ids.forEach(function(key){telemetryLookupDefine(moved,key,lookups[key]);});t.lookups=moved;return done();
  }
  var entry=lookups[id],field=edit.field,value=edit.value;
  if(!telemetryObject(entry))return {error:'Log search "'+id+'" is not an object; remove it or repair it in JSON.'};
  if(field==='label' || field==='query'){
    if(typeof value!=='string' || !value.trim())return {error:'A log search needs a '+(field==='label'?'label':'LogQL query')+'; use Remove log search to delete it.'};
    entry[field]=value.trim();
  }else if(field==='values'){
    if(value==null || Array.isArray(value) && !value.length)delete entry.values;
    else if(!Array.isArray(value) || value.some(function(v){return typeof v!=='string';}))return {error:'Suggested values are a list of text values.'};
    else entry.values=value.slice();
  }else if(field==='datasource'){
    if(value==null || typeof value==='string' && !value.trim())delete entry.datasource;
    else if(typeof value!=='string')return {error:'Enter a Loki datasource UID, or clear the field.'};
    else entry.datasource=value.trim();
  }else if(field==='traceId' || field==='spanId'){
    var fields=telemetryObject(entry.fields)?entry.fields:{};
    if(value==null || typeof value==='string' && !value.trim())delete fields[field];
    else if(typeof value!=='string')return {error:'Enter a field name, or clear the field.'};
    else fields[field]=value.trim();
    if(Object.keys(fields).length)entry.fields=fields;else delete entry.fields;
  }else if(field==='requireTraceId'){
    // #1415: true is the default (#1158), so it writes no key.
    if(typeof value!=='boolean')return {error:'Only lines with a trace ID starts checked must be true or false.'};
    if(value)delete entry.requireTraceId;else entry.requireTraceId=false;
  }else return {error:'Unknown log search setting.'};
  return done();
}
/* An unused log search id made from its label: "Order ID" → order-id, then order-id-2. Accents are dropped
   ("Número de pedido" → numero-de-pedido); a label with no Latin letters or digits gives search-1, search-2. */
var TELEMETRY_LOOKUP_LETTERS={'ß':'ss','æ':'ae','œ':'oe','ø':'o','ł':'l','đ':'d','ð':'d','þ':'th','ı':'i'};
function telemetryLookupId(label,existing){
  existing=existing || {};
  var text=String(label || '').toLowerCase().replace(/[ßæœøłđðþı]/g,function(ch){return TELEMETRY_LOOKUP_LETTERS[ch];});
  if(text.normalize)text=text.normalize('NFKD').replace(/[\u0300-\u036f]/g,'');
  var base=text.replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40).replace(/-+$/,''),n;
  if(!base){for(n=1;telemetryOwn(existing,'search-'+n);n++);return 'search-'+n;}
  if(!/^[a-z]/.test(base))base='search-'+base;
  var id=base;for(n=2;telemetryOwn(existing,id);n++)id=base+'-'+n;return id;
}
/* Read model for Status board settings → Log searches. */
function telemetryLookupState(raw){
  var doc=builderDocumentPage(raw),page=doc && doc.page,t=page && telemetryObject(page.tracking) && telemetryObject(page.tracking.telemetry)?page.tracking.telemetry:null;
  var present=!!t && telemetryOwn(t,'lookups'),valid=!present || telemetryObject(t.lookups),lookups=present && valid?telemetryClone(t.lookups):{};
  return {present:present,valid:valid,ids:Object.keys(lookups),lookups:lookups};
}
function planPageTelemetry(text,raw,edit){
  var doc=builderDocumentPage(raw);if(!doc)return {error:'Add document settings to this bare diagram first.'};
  var tracking=telemetryObject(doc.page.tracking)?doc.page.tracking:null,current=tracking && telemetryOwn(tracking,'telemetry')?tracking.telemetry:undefined;
  if(edit && edit.op==='removeTemplate'){
    var uses=telemetryTemplateUses(raw,edit.name);
    if(uses)return {error:uses+(uses===1?' carrier uses':' carriers use')+' template "'+edit.name+'". Switch '+(uses===1?'it':'them')+' to raw signals or another template first.'};
  }
  if(edit && edit.op==='enabled' && doc.page.tracking!=null && !tracking)return {error:'Tracking is not an object; repair it in JSON first.'};
  var result=telemetryEditPage(current,edit);if(result.error)return result;
  if(JSON.stringify(result.value)===JSON.stringify(telemetryObject(current)?current:null) && (result.value!=null || current===undefined))return {text:text};
  var plan;
  if(!tracking)plan=result.value==null?{text:text}:planSetField(text,raw,doc.path,'tracking',JSON.stringify({telemetry:result.value},null,2));
  // An emptied tracking block is dropped, unless a Live status panel uses it to mark the status board (#1254).
  else if(result.value==null && Object.keys(tracking).every(function(key){return key==='telemetry';}) && statusBoardMissing(raw).panel)plan=planSetField(text,raw,doc.path,'tracking',null);
  else plan=planSetField(text,raw,doc.path.concat(['tracking']),'telemetry',result.value==null?null:JSON.stringify(result.value,null,2));
  return plan.error?plan:telemetryTemplateSignalCarriers(plan,raw,current,result.value,edit);
}
/* #1255: renaming or removing a template signal moves or drops the limits that carriers
   using the template set on it (proof keys and maxRatioOf), in the same plan and Undo step.
   A carrier that defines a signal of the old or new name itself keeps its limits unchanged:
   that signal is the carrier's own, not the template's. */
function telemetryTemplateSignalCarriers(plan,raw,before,after,edit){
  var inner=edit && edit.op==='template' && edit.edit;
  if(!inner || !(inner.op==='removeSignal' || inner.op==='signal' && inner.field==='name'))return plan;
  function signals(page){var t=telemetryObject(page) && telemetryObject(page.templates) && page.templates[edit.template];return t && telemetryObject(t.signals)?Object.keys(t.signals):null;}
  var was=signals(before),now=signals(after);if(!was || !now || now.indexOf(inner.name)>=0)return plan;
  var next=inner.op==='removeSignal'?null:now.filter(function(key){return was.indexOf(key)<0;})[0];
  if(inner.op!=='removeSignal' && !next)return plan;
  var text=plan.text;
  telemetryTemplateCarriers(raw,edit.template).forEach(function(carrier){
    if(plan.error || !telemetryObject(carrier.telemetry.proof))return;
    var own=telemetryObject(carrier.telemetry.signals)?carrier.telemetry.signals:{};
    if(telemetryOwn(own,inner.name) || next!=null && telemetryOwn(own,next))return;
    var updated=telemetryProofSignal(telemetryClone(carrier.telemetry),inner.name,next);
    if(JSON.stringify(updated)===JSON.stringify(carrier.telemetry))return;
    var step=planSetField(text,JSON.parse(text),carrier.path,'telemetry',JSON.stringify(updated,null,2));
    if(step.error){plan=step;return;}text=step.text;
  });
  return plan.error?plan:{text:text};
}
/* Read model for the carrier editor. warnings are the validator's #937
   messages for this carrier, relative to it ('telemetry.signals.rate: …'). */
function telemetryCarrierState(raw,target,context){
  var text=JSON.stringify(raw),t=telemetryCarrierTarget(text,raw,target,context);if(t.error)return t;
  var templates=telemetryPageTemplates(raw),binding=t.binding?telemetryClone(t.binding):null,inherited=null,warnings=[];
  if(t.owner){
    var overlay=topologyTrackingTarget(text,raw,target.section,target.kind,t.id,context,target.index);
    if(!overlay.error && overlay.inherited.telemetry)inherited=overlay.inherited.telemetry;
  }
  var resolvedPage=builderDocumentPage(t.resolvedDoc),resolvedTemplates=trackingTelemetry(resolvedPage && resolvedPage.page).templates;
  if(telemetryOwn(t.resolved,'telemetry'))carrierTelemetry(t.resolved,resolvedTemplates,function(path,message){warnings.push('telemetry'+path+': '+message);});
  if(typeof FlowTopology!=='undefined' && FlowTopology.telemetryDrops)FlowTopology.telemetryDrops(t.diagram).forEach(function(drop){
    if(drop.kind===(target.kind==='node'?'nodes':'edges') && drop.id===t.id)warnings.push('telemetry: provider "'+drop.spec+'" '+drop.path+': '+drop.message);
  });
  // #1266: a carrier that inherits a binding edits the merged result; the overlay holds only the changes.
  var merge=null,mergeEffects=null;
  if(telemetryMergeMode(t)){
    var overlayBinding=telemetryMergeOverlay(binding)?binding:{extends:true},inheritedNames=inherited && telemetryObject(inherited.signals)?Object.keys(inherited.signals):[];
    var hides=Array.isArray(overlayBinding.hide)?overlayBinding.hide:[];
    merge={overlay:telemetryMergeOverlay(binding)?binding:null,inheritedNames:inheritedNames,
      hidden:inheritedNames.filter(function(name){return hides.indexOf(name)>=0;}),
      staleHidden:hides.filter(function(name){return typeof name==='string' && inheritedNames.indexOf(name)<0;}),
      overridden:inheritedNames.filter(function(name){return telemetryObject(overlayBinding.signals) && telemetryOwn(overlayBinding.signals,name) || telemetryObject(overlayBinding.proof) && telemetryOwn(overlayBinding.proof,name);})};
    binding=FlowTopology.mergeTelemetry(inherited,overlayBinding);
    merge.allHidden=!!inheritedNames.length && merge.hidden.length===inheritedNames.length && !(telemetryObject(binding.signals) && Object.keys(binding.signals).length);
    if(!Object.keys(binding).length)binding=null;
  }else if(t.owner && inherited && telemetryObject(binding)){
    // #1266 Q3: what Merge with provider changes, named before the author converts.
    mergeEffects=[];
    if(telemetryOwn(binding,'use'))mergeEffects.push('the signals of template "'+binding.use+'" are copied into this document, so later edits to that template no longer reach them');
    var whole=telemetryOwn(binding,'use')?telemetryExpand(binding,templates):binding;
    if(whole){
      var after=FlowTopology.mergeTelemetry(inherited,telemetryDiffImported(inherited,whole,null)),order=function(b){return telemetryObject(b && b.signals)?Object.keys(b.signals).join(','):'';};
      if(order(after)!==order(whole))mergeEffects.push('signals are listed in the provider\'s order, then the ones this document adds');
    }
  }
  var template=binding && telemetryOwn(binding,'use')?binding.use:null;
  // #1363: each signal's narrowing (inherited first, read-only), and what the viewer would send or
  // why it would not, for the page's default environment. Nothing is queried.
  var narrow=null,sent=null,signals=template==null && binding && telemetryObject(binding.signals)?binding.signals:null;
  if(signals){
    narrow={};
    Object.keys(signals).forEach(function(name){
      var entry=telemetryObject(signals[name])?signals[name]:{},source=telemetrySignalSource(entry);if(!source)return;
      var from=merge && inherited && telemetryObject(inherited.signals) && telemetryObject(inherited.signals[name])?inherited.signals[name]:{};
      var all=telemetryObject(entry.narrow)?telemetryNarrowList(entry.narrow[source]):[],before=telemetryObject(from.narrow)?telemetryNarrowList(from.narrow[source]):[];
      var required=t.owner?telemetryRequiredNeeds(inherited,name,!!merge && telemetryObject(inherited) && telemetryObject(inherited.signals) && telemetryOwn(inherited.signals,name)):null;
      var keys=before.map(telemetryNarrowCanonical),needs=telemetryNarrowOwn({needsNarrow:required},{needsNarrow:entry.needsNarrow}).needs;
      narrow[name]={source:source,inherited:telemetryClone(all.filter(function(f){return keys.indexOf(telemetryNarrowCanonical(f))>=0;})),
        own:telemetryClone(all.filter(function(f){return keys.indexOf(telemetryNarrowCanonical(f))<0;})),
        needs:{inherited:required===true?true:Array.isArray(required)?telemetryClone(required):[],own:needs===true?true:needs || []}};
    });
  }
  if(telemetryOwn(t.resolved,'telemetry')){
    var out=carrierTelemetry(t.resolved,resolvedTemplates,null,telemetryEnvironmentConfig(resolvedPage && resolvedPage.page));
    if(out){sent={};Object.keys(out.signals).forEach(function(name){var one=out.signals[name],q={query:telemetryQueryText(one.source,one.query)};if(one.error)q.error=one.error;sent[name]=q;});}
  }
  var ownVars=merge?(merge.overlay && merge.overlay.variables):binding && binding.variables;
  var importVariables=null;
  if(t.owner){var imps=Array.isArray(t.got.d.topologyImports)?t.got.d.topologyImports:[],imp=imps.find(function(i){return i && i.as===t.owner.as;});
    // review c1: a value that is not an object is kept as written (the rows say so), and the validator's
    // warnings for the import's variables come with it, under the path 'variables'.
    if(imp){var importWarnings=[];if(telemetryOwn(imp,'variables'))telemetryScopedVariables(imp.variables,function(path,message){importWarnings.push(path+': '+message);},'variables');
      importVariables={as:t.owner.as,value:telemetryOwn(imp,'variables')?telemetryClone(imp.variables):{},warnings:importWarnings};}}
  return {narrow:narrow,sent:sent,variables:{own:telemetryObject(ownVars)?telemetryClone(ownVars):{},inherited:merge && inherited && telemetryObject(inherited.variables)?telemetryClone(inherited.variables):{}},importVariables:importVariables,
    id:t.id,imported:!!t.owner,provider:t.owner?t.owner.spec+' / '+t.owner.export:null,edge:target.kind==='edge',binding:binding,inherited:inherited,merge:merge,mergeEffects:mergeEffects,templates:templates,
    mode:template!=null?'template':'raw',template:template,
    templateBase:template!=null?telemetryTemplateBase(binding,templates):null,
    effective:telemetryEffectiveBinding(binding,templates),warnings:warnings};
}
/* Read model for Status board settings → Metrics and Environments. */
function telemetryPageState(raw){
  var doc=builderDocumentPage(raw),page=doc && doc.page,warnings=[];
  trackingTelemetry(page,function(path,message){warnings.push('tracking.telemetry'+path+': '+message);});
  var authored=page && telemetryObject(page.tracking) && telemetryObject(page.tracking.telemetry)?telemetryClone(page.tracking.telemetry):null;
  var uses={};if(authored && telemetryObject(authored.templates))Object.keys(authored.templates).forEach(function(name){uses[name]=telemetryTemplateUses(raw,name);});
  return {telemetry:authored,warnings:warnings,uses:uses};
}
/* One-line summary of an authored binding for read-only display. */
function telemetrySummary(binding){
  if(!telemetryObject(binding))return 'invalid binding';
  if(telemetryOwn(binding,'use'))return 'template '+binding.use;
  var signals=telemetryObject(binding.signals)?binding.signals:{};
  return (binding.kind || 'no kind')+' · '+(Object.keys(signals).map(function(name){var source=telemetrySignalSource(signals[name]);return name+' ('+(source || 'no source')+(telemetryText(signals[name] && signals[name].unit)?', '+signals[name].unit:'')+')';}).join(', ') || 'no signals');
}

/* #1290 PR 6: trace spans declared on a node or connection (trace.spans), edited in Inspect.
   traceSpansEdit works on the effective spans map and returns {value} (null when none are
   left) or {error} in plain words; imported carriers store only the difference from the
   provider (traceSpansOverlayEdit) in the consumer overlay. Each edit is one source change. */
var TRACE_SPAN_ROLE_LIST={node:['process','database','cache','call','work'],edge:['send','receive']};
var TRACE_SPAN_MODES={operation:'Operation',operationPrefix:'Prefix',attributes:'Attributes only'};
function traceSpanMode(span){return telemetryObject(span) && telemetryOwn(span,'operation')?'operation':telemetryObject(span) && telemetryOwn(span,'operationPrefix')?'operationPrefix':'attributes';}
function traceSpanMatchValue(mode,value){
  var v=typeof value==='string'?value:'';
  if(mode==='operation'){if(!v.trim())return {error:'Enter the operation, exactly as the trace shows it.'};return {value:v.trim()};}
  if(mode==='operationPrefix'){if(v.trim().length<2)return {error:'A prefix needs at least 2 characters.'};return {value:v.replace(/^\s+/,'')};}
  return {value:null};
}
function traceSpansEdit(spans,edit,kind,allowed){
  var out=telemetryObject(spans)?telemetryClone(spans):{},op=edit && edit.op,name=edit && typeof edit.name==='string'?edit.name.trim():'',roles=TRACE_SPAN_ROLE_LIST[kind==='edge'?'edge':'node'];
  function done(){return {value:Object.keys(out).length?out:null};}
  // Attributes this board can match: the built-in list plus its trace connections' allowedAttributes.
  function unsupported(attr,field){
    if(!Array.isArray(allowed) || allowed.indexOf(attr)>=0)return null;
    return {error:'Attribute '+attr+' is not one this board can match. Use a supported attribute such as db.system, or list it in a trace connection\'s allowedAttributes.',field:field};
  }
  if(op==='rename'){
    var to=typeof edit.to==='string'?edit.to.trim():'';
    if(!telemetryOwn(out,name))return {error:'This span is no longer here. Render and select the node or connection again.',field:'name'};
    if(to===name)return {value:out};
    if(!/^[A-Za-z][A-Za-z0-9_-]*$/.test(to))return {error:'A span name starts with a letter and uses only letters, digits, - and _.',field:'name'};
    if(telemetryOwn(out,to))return {error:'A span named '+to+' already exists here; choose another name.',field:'name'};
    var renamed={};Object.keys(out).forEach(function(k){renamed[k===name?to:k]=out[k];});out=renamed;return done();
  }
  if(op==='add'){
    if(!/^[A-Za-z][A-Za-z0-9_-]*$/.test(name))return {error:'A span name starts with a letter and uses only letters, digits, - and _.',field:'name'};
    if(telemetryOwn(out,name))return {error:'A span named '+name+' already exists here; choose another name.',field:'name'};
    var service=typeof edit.serviceName==='string'?edit.serviceName.trim():'';if(!service)return {error:'Enter the service name, exactly as the trace shows it.',field:'serviceName'};
    if(roles.indexOf(edit.role)<0)return {error:'Choose a role: '+roles.join(', ')+'.',field:'role'};
    var mode=TRACE_SPAN_MODES[edit.mode]?edit.mode:'operation',entry={serviceName:service};
    if(mode==='attributes' && telemetryObject(edit.attributes) && Object.keys(edit.attributes).length){
      // #1413: an existing declaration's attributes, copied as they are (operator objects included).
      var copyBad=null;Object.keys(edit.attributes).some(function(k){copyBad=unsupported(k,'value');return !!copyBad;});if(copyBad)return copyBad;
      entry.attributes=telemetryClone(edit.attributes);
    }else if(mode==='attributes'){
      var pair=typeof edit.value==='string'?edit.value.split('='):[];
      if(pair.length<2 || !pair[0].trim())return {error:'Attributes-only matching needs an attribute: enter it as name=value, for example db.system=redis.',field:'value'};
      var bad=unsupported(pair[0].trim(),'value');if(bad)return bad;
      entry.attributes={};entry.attributes[pair[0].trim()]=pair.slice(1).join('=').trim();
    }else{var matched=traceSpanMatchValue(mode,edit.value);if(matched.error)return {error:matched.error,field:'value'};entry[mode]=matched.value;}
    entry.role=edit.role;out[name]=entry;return done();
  }
  if(!telemetryOwn(out,name) || !telemetryObject(out[name]))return {error:'This span is no longer here. Render and select the node or connection again.'};
  var span=out[name];
  if(op==='remove'){delete out[name];return done();}
  if(op==='set'){
    var field=edit.field,v=typeof edit.value==='string'?edit.value.trim():edit.value;
    if(field==='serviceName'){if(!v)return {error:'A span needs its service name. To delete the span, use Remove span.',field:'serviceName'};span.serviceName=v;return done();}
    if(field==='role'){if(roles.indexOf(v)<0)return {error:'Choose a role: '+roles.join(', ')+'.',field:'role'};span.role=v;return done();}
    if(field==='namespace'){if(v)span.namespace=v;else delete span.namespace;return done();}
    if(field==='match'){
      var m=TRACE_SPAN_MODES[edit.mode]?edit.mode:traceSpanMode(span);
      if(m==='attributes'){
        if(!telemetryObject(span.attributes) || !Object.keys(span.attributes).length)return {error:'Add an attribute first; attributes-only matching needs at least one.',field:'match'};
        delete span.operation;delete span.operationPrefix;return done();
      }
      var value=edit.value!=null?edit.value:span.operation!=null?span.operation:span.operationPrefix;
      var r=traceSpanMatchValue(m,value);if(r.error)return {error:r.error,field:'value'};
      delete span.operation;delete span.operationPrefix;span[m]=r.value;return done();
    }
    return {error:'Unknown span field '+field+'.'};
  }
  if(op==='attribute'){
    var attrs=telemetryObject(span.attributes)?span.attributes:{},key=edit.key==null?null:String(edit.key),attr=edit.attrName==null?'':String(edit.attrName).trim();
    if(!attr){
      if(key==null)return {error:'Enter an attribute name, such as deployment.environment.name.'};
      if(traceSpanMode(span)==='attributes' && Object.keys(attrs).length===1)return {error:'Attributes-only matching needs at least one attribute. Choose another match first, or remove the span.'};
      delete attrs[key];
    }else{
      if(attr!==key && telemetryOwn(attrs,attr))return {error:'Attribute '+attr+' is already on this span.',field:'attribute'};
      var notAllowed=attr!==key?unsupported(attr,'attribute'):null;if(notAllowed)return notAllowed;
      var type=edit.type || (key!=null?traceAttributeKind(attrs[key]):'string');
      if(!TRACE_ATTRIBUTE_KINDS.some(function(k){return k[0]===type;}))return {error:'Attribute kinds are text, number, true/false, starts with, ends with, contains or is one of.',field:'attribute'};
      var parsed=traceMatchAttributeValue(edit.value!==undefined?edit.value:key!=null?traceAttributeText(attrs[key]):'',type,attr);
      if(parsed.error)return {error:parsed.error,field:'attribute'};
      var next={};
      if(key==null){Object.keys(attrs).forEach(function(k){next[k]=attrs[k];});next[attr]=parsed.value;}
      else Object.keys(attrs).forEach(function(k){if(k===key)next[attr]=parsed.value;else next[k]=attrs[k];});
      attrs=next;
    }
    if(Object.keys(attrs).length)span.attributes=attrs;else delete span.attributes;
    return done();
  }
  return {error:'Unknown trace span edit.'};
}
/* The consumer overlay after one edit: the previous overlay with only the spans this edit changed
   rewritten (the smallest field patch against the provider), a removed inherited span hidden, a
   shown one unhidden. Untouched entries, also ones that cannot merge, stay exactly as written. */
function traceSpansOverlayEdit(inherited,before,after,previous){
  inherited=telemetryObject(inherited)?inherited:{};before=telemetryObject(before)?before:{};after=telemetryObject(after)?after:{};
  var o=telemetryObject(previous)?telemetryClone(previous):{},spans=telemetryObject(o.spans)?o.spans:{},hide=Array.isArray(o.hide)?o.hide.slice():[];
  function write(k){
    var d=telemetryOwn(inherited,k)?telemetryFieldDiff(inherited[k],after[k]):telemetryClone(after[k]);
    if(d)spans[k]=d;else delete spans[k];
  }
  var keys=Object.keys(before).concat(Object.keys(after)).filter(function(k,i,all){return all.indexOf(k)===i;});
  keys.forEach(function(k){
    var was=telemetryOwn(before,k),is=telemetryOwn(after,k);
    if(was && is){if(JSON.stringify(before[k])!==JSON.stringify(after[k]))write(k);}
    else if(was){delete spans[k];if(telemetryOwn(inherited,k) && hide.indexOf(k)<0)hide.push(k);}
    else{hide=hide.filter(function(h){return h!==k;});write(k);}
  });
  // A rename keeps the order of entries: a key moved in `after` takes its place.
  var ordered={};Object.keys(after).forEach(function(k){if(telemetryOwn(spans,k))ordered[k]=spans[k];});Object.keys(spans).forEach(function(k){if(!telemetryOwn(ordered,k))ordered[k]=spans[k];});
  var out={};if(Object.keys(ordered).length)out.spans=ordered;if(hide.length)out.hide=hide;
  return Object.keys(out).length?out:null;
}
/* The selected carrier's trace spans: local, or for an imported carrier the provider's (inherited),
   the consumer overlay and the merged result, with each span's validator messages. */
function traceSpansState(raw,target,context){
  var text=JSON.stringify(raw),t=telemetryCarrierTarget(text,raw,target,context);if(t.error)return t;
  var kind=target.kind==='edge'?'edge':'node',merged=telemetryObject(t.resolved.trace) && telemetryObject(t.resolved.trace.spans)?telemetryClone(t.resolved.trace.spans):{};
  // The provider is named by its page title in every message, its spec id when it has none.
  var providerSpec=t.owner && context && Array.isArray(context.specs)?context.specs.find(function(x){return x && x.page && x.page.canon && x.page.canon.id===t.owner.spec;}):null;
  var providerTitle=providerSpec && typeof providerSpec.page.title==='string' && providerSpec.page.title.trim()?providerSpec.page.title.trim():t.owner?t.owner.spec:null;
  var out={id:t.id,kind:kind,imported:!!t.owner,provider:t.owner?t.owner.spec:null,providerTitle:providerTitle,spans:merged,inherited:{},overlay:null,messages:{},roles:TRACE_SPAN_ROLE_LIST[kind]};
  if(t.owner){
    var imp=t.got.d.topologyImports.find(function(i){return i && i.as===t.owner.as;}),rel=t.id.split('->').map(function(part){return part.slice(t.owner.as.length+2);}).join('->');
    var entry=telemetryObject(imp[t.field])?imp[t.field][rel]:null;out.overlay=telemetryObject(entry) && telemetryObject(entry.trace)?telemetryClone(entry.trace):null;
    // The provider's spans: resolve with this consumer's trace overlay left out.
    var base=builderClone(raw),bi=specValueAt(base,t.got.path).topologyImports.find(function(i){return i && i.as===t.owner.as;});
    if(bi && telemetryObject(bi[t.field]) && telemetryObject(bi[t.field][rel]))delete bi[t.field][rel].trace;
    try{
      var r=FlowTopology.resolveSource(base,context),rec=specSectionPaths(r)[target.section],d=specValueAt(r,rec.diagram);
      var carrier=kind==='node'?d.nodes[t.id]:(d.edges || []).find(function(e){return builderEdgeKey(e)===t.id;});
      if(carrier && telemetryObject(carrier.trace) && telemetryObject(carrier.trace.spans))out.inherited=telemetryClone(carrier.trace.spans);
    }catch(ex){}
    // Hidden means hidden by this document: a hide or a null entry. A span the resolver left out
    // because this document's patch broke it is shown, built from the provider span and the patch,
    // so its error sits beside the field and no edit turns it into a hide.
    var ospans=out.overlay && telemetryObject(out.overlay.spans)?out.overlay.spans:{},ohide=out.overlay && Array.isArray(out.overlay.hide)?out.overlay.hide:[];
    out.hidden=ohide.concat(Object.keys(ospans).filter(function(k){return ospans[k]===null;})).filter(function(k,i,all){return all.indexOf(k)===i;});
    out.broken=[];
    Object.keys(out.inherited).concat(Object.keys(ospans)).forEach(function(k){
      if(telemetryOwn(merged,k) || out.hidden.indexOf(k)>=0 || out.broken.indexOf(k)>=0 || ospans[k]===null)return;
      var built=telemetryObject(ospans[k])?FlowTopology.mergeTrace(telemetryOwn(out.inherited,k)?{spans:(function(){var x={};x[k]=out.inherited[k];return x;})()}:{},{spans:(function(){var x={};x[k]=ospans[k];return x;})()}):{spans:{}};
      if(telemetryObject(built.spans) && telemetryObject(built.spans[k])){merged[k]=built.spans[k];out.broken.push(k);}
    });
    out.rel=rel;out.field=t.field;
  }
  out.allowed=FlowCanon.traceAttributeNames(t.resolvedDoc);
  // Broken overlay entries already carry the resolver's overlay message; the rest are checked here.
  if(Object.keys(merged).length)FlowCanon.traceDeclarationErrors({spans:merged},kind,t.resolvedDoc).forEach(function(x){if(x.key!=null && (out.broken || []).indexOf(x.key)<0)(out.messages[x.key]=out.messages[x.key] || []).push(x.message);});
  // Spans this board does not use (provider drops) and overlay findings, by span name.
  if(typeof FlowTopology!=='undefined' && FlowTopology.traceFindings){
    var findings=FlowTopology.traceFindings(t.diagram,''),f=findings.errors.concat(findings.warnings),mark=kind==='node'?'.nodes.'+t.id+'.trace.spans.':null;
    f.forEach(function(text){
      var m=/\.trace\.spans\.([A-Za-z][A-Za-z0-9_-]*): (.*)$/.exec(text);if(!m)return;
      var forThis=mark?text.indexOf(mark)>=0:out.rel!=null && text.indexOf('.edgeTracking.'+out.rel+'.trace')>=0;
      if(!forThis && out.rel!=null && kind==='node')forThis=text.indexOf('.nodeTracking.'+out.rel+'.trace')>=0;
      if(forThis)(out.messages[m[1]]=out.messages[m[1]] || []).push(m[2]);
    });
  }
  if(kind==='edge'){
    var e=t.resolved,to=t.diagram.nodes && t.diagram.nodes[e.to],own=Object.keys(merged).some(function(k){return merged[k] && merged[k].role==='receive';});
    // Valid process declarations only: an invalid one times nothing.
    var invalid=to && telemetryObject(to.trace)?FlowCanon.traceDeclarationErrors(to.trace,'node',t.resolvedDoc).map(function(x){return x.key;}):[];
    var procs=to && telemetryObject(to.trace) && telemetryObject(to.trace.spans)?Object.keys(to.trace.spans).filter(function(k){return telemetryObject(to.trace.spans[k]) && to.trace.spans[k].role==='process' && invalid.indexOf(k)<0 && invalid.indexOf(null)<0;}):[];
    out.receiver={declared:own,node:e.to,title:to && to.title || e.to,process:procs.map(function(k){return {key:k,span:telemetryClone(to.trace.spans[k])};})};
  }
  return out;
}
function planCarrierTraceSpans(text,raw,target,edit,context){
  var t=telemetryCarrierTarget(text,raw,target,context);if(t.error)return t;
  var state=traceSpansState(raw,target,context);if(state.error)return state;
  var op=edit && edit.op;
  if(op==='rename' && t.owner && telemetryOwn(state.inherited,edit.name))return {error:'Inherited span names come from '+state.providerTitle+'. To rename one, hide it and add a new span.',field:'name'};
  // A provider name hidden here is still taken: reusing it would drop the hide and patch the provider's span.
  var claimed=op==='rename'?edit.to:op==='add'?edit.name:null;claimed=typeof claimed==='string'?claimed.trim():claimed;
  if(t.owner && claimed && telemetryOwn(state.inherited,claimed) && !telemetryOwn(state.spans,claimed)){
    return {error:'The provider '+state.providerTitle+' declares a span named '+claimed+', hidden in this document; pick another name, or show '+claimed+' and change it instead.',field:'name'};
  }
  var plan;
  if(!t.owner){
    if(op==='hide' || op==='revert' || op==='revertAll')return {error:'Only spans inherited from an imported node or connection can be hidden or reverted.'};
    var local=traceSpansEdit(state.spans,edit,state.kind,state.allowed);if(local.error)return local;
    if(JSON.stringify(local.value)===JSON.stringify(Object.keys(state.spans).length?state.spans:null))return {text:text};
    plan=planSetField(text,raw,t.path,'trace',local.value==null?null:JSON.stringify({spans:local.value},null,2));
  }else{
    var overlay,previous=state.overlay?telemetryClone(state.overlay):null;
    if(op==='revertAll')overlay=null;
    else if(op==='hide' || op==='revert'){
      var hiddenNow=state.hidden.indexOf(edit.name)>=0;
      if(!telemetryOwn(state.inherited,edit.name) && !(op==='hide' && !edit.value && hiddenNow))return {error:'Span '+edit.name+' is not inherited from '+state.providerTitle+'.'};
      var after=telemetryClone(state.spans);
      if(op==='hide' && edit.value)delete after[edit.name];
      else if(telemetryOwn(state.inherited,edit.name))after[edit.name]=telemetryClone(state.inherited[edit.name]);
      // Showing again drops the hide and any null entry; a stale hide (the provider no longer declares it) only that.
      if(op==='hide' && !edit.value && previous){
        if(Array.isArray(previous.hide))previous.hide=previous.hide.filter(function(k){return k!==edit.name;});
        if(telemetryObject(previous.spans) && previous.spans[edit.name]===null)delete previous.spans[edit.name];
      }
      overlay=traceSpansOverlayEdit(state.inherited,state.spans,after,previous);
    }else{
      var next=traceSpansEdit(state.spans,edit,state.kind,state.allowed);if(next.error)return next;
      overlay=traceSpansOverlayEdit(state.inherited,state.spans,next.value,previous);
    }
    if(overlay){if(telemetryObject(overlay.spans) && !Object.keys(overlay.spans).length)delete overlay.spans;if(Array.isArray(overlay.hide) && !overlay.hide.length)delete overlay.hide;if(!Object.keys(overlay).length)overlay=null;}
    if(JSON.stringify(overlay)===JSON.stringify(state.overlay))return {text:text};
    plan=planTopologyTracking(text,raw,target.section,target.kind,t.id,'trace',overlay,overlay==null,context,target.index);
  }
  // A rename also renames traceScope.skip entries on this board that name the span, in the same edit.
  if(op==='rename' && !plan.error){
    var to=String(edit.to).trim(),from=edit.name,next=plan.text,parsedNext=JSON.parse(next),got=builderDiagram(next,parsedNext,target.section);
    if(!got.error)(Array.isArray(got.d.steps)?got.d.steps:[]).forEach(function(st,i){
      var skip=telemetryObject(st) && telemetryObject(st.traceScope) && telemetryObject(st.traceScope.skip) && Array.isArray(st.traceScope.skip[t.id])?st.traceScope.skip:null;
      if(!skip || skip[t.id].indexOf(from)<0)return;
      var scope=telemetryClone(st.traceScope);scope.skip[t.id]=scope.skip[t.id].map(function(x){return x===from?to:x;});
      var r=jsonSetField(next,got.path.concat(['steps',i]),'traceScope',JSON.stringify(scope));if(r)next=r.text;
    });
    plan={text:next};
  }
  return plan;
}
