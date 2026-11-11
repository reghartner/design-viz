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
    if(telemetryOwn(entry,'window'))next.window=entry.window;
    if(telemetryOwn(entry,'role'))next.role=entry.role;
    var label=edit.field==='label'?edit.value:entry.label;
    if(label!=null){if(!telemetryText(label) || label.length>120 || /[\x00-\x1f\x7f]/.test(label))return {error:'A label is 1–120 plain-text characters without control characters.'};next.label=label.trim();}
    var queryLink=edit.field==='queryLink'?edit.value:entry.links && entry.links.query;
    if(queryLink!=null){if(!telemetryQueryUrl(queryLink))return {error:'A query link is an absolute HTTP(S) URL without credentials or signed result tokens.'};next.links={query:queryLink};}
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
  if(op==='addEnvironment' || op==='removeEnvironment' || op==='environment' || op==='environmentSetting'){
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
  var patch={};
  Object.keys(signals).forEach(function(name){
    var from=telemetryObject(base.signals) && telemetryOwn(base.signals,name)?base.signals[name]:null;
    var d=from?telemetryFieldDiff(from,signals[name]):telemetryClone(signals[name]);if(d)patch[name]=d;
  });
  if(Object.keys(patch).length)out.signals=patch;
  var proof={},baseProof=telemetryObject(base.proof)?base.proof:{},nextProof=telemetryObject(effective.proof)?effective.proof:{};
  Object.keys(nextProof).forEach(function(name){var d=telemetryFieldDiff(baseProof[name],nextProof[name]);if(d)proof[name]=d;});
  Object.keys(baseProof).forEach(function(name){if(!telemetryOwn(nextProof,name))proof[name]=null;});
  if(Object.keys(proof).length)out.proof=proof;
  ['links','card'].forEach(function(field){var d=telemetryFieldDiff(base[field],effective[field]);if(d)out[field]=d;});
  return out;
}
function telemetryEditMerge(inherited,overlay,edit,options){
  inherited=telemetryObject(inherited)?inherited:{};
  var o=telemetryMergeOverlay(overlay)?telemetryClone(overlay):{extends:true},op=edit && edit.op,names=telemetryObject(inherited.signals)?inherited.signals:{};
  if(op==='use')return {error:'A template cannot be used on an imported node or connection: its metrics merge with the provider\'s, and a template would replace them. To use a template\'s signals here, add them with New signal; they are kept as this document\'s additions.'};
  if(op==='remove')return {value:null};
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
function planCarrierTelemetry(text,raw,target,edit,context){
  var t=telemetryCarrierTarget(text,raw,target,context);if(t.error)return t;
  var inherited=telemetryInheritedBinding(text,raw,target,t,context);
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
  return {id:t.id,imported:!!t.owner,provider:t.owner?t.owner.spec+' / '+t.owner.export:null,edge:target.kind==='edge',binding:binding,inherited:inherited,merge:merge,mergeEffects:mergeEffects,templates:templates,
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
    if(mode==='attributes'){
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
      var type=edit.type || (key!=null?typeof attrs[key]:'string'),parsed=traceMatchAttributeValue(edit.value!==undefined?edit.value:key!=null?String(attrs[key]):'',type,attr);
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
