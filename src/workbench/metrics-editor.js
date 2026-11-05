/* Desktop Workbench Metrics editor (#941): Inspect → Tracking → Metrics for a
   node or connection, and Document settings → Tracking → Metrics for the page
   block. Read models and edits live in workbench/commands/telemetry.js; source,
   history and form lifetime stay inspector-owned, so every control calls
   o.commit(edit) and one accepted edit is one Undo step. Nothing here runs a
   query or draws on the canvas; preview rendering has its own owner. */
function flowMetricsDom(o){
  var doc=o.document,c=o.controls;
  function el(tag,cls,text){var node=doc.createElement(tag);if(cls)node.className=cls;if(text!=null)node.textContent=text;return node;}
  function note(parent,text,cls){var p=el('p','fnote'+(cls?' '+cls:''),text);parent.appendChild(p);return p;}
  // Each control carries its row label as its accessible name; a <label> around a <select> would include the option text.
  function row(parent,label,control){control.setAttribute('aria-label',label);parent.appendChild(c.row(label,control));return control;}
  function relabel(select,labels){Array.prototype.forEach.call(select.options,function(option){if(Object.prototype.hasOwnProperty.call(labels,option.value))option.textContent=labels[option.value];});return select;}
  function group(parent,cls,legend){var box=el('fieldset',cls);box.appendChild(el('legend',null,legend));parent.appendChild(box);return box;}
  function draft(parent,label,kind,options,value){
    var input=el(kind==='select'?'select':kind==='textarea'?'textarea':'input','fctl');
    if(kind==='text')input.type='text';
    (options || []).forEach(function(option){var item=el('option',null,option[1]);item.value=option[0];input.appendChild(item);});
    if(value!=null)input.value=value;
    return row(parent,label,input);
  }
  function warnings(parent,list,label){
    if(!list.length)return;
    var ul=el('ul','metrics-warnings');ul.setAttribute('aria-label',label);
    list.forEach(function(text){ul.appendChild(el('li',null,text));});parent.appendChild(ul);
  }
  var sourceOptions=TELEMETRY_SOURCES.map(function(source){return [source,TELEMETRY_SOURCE_LABELS[source]];});
  /* Signal rows and the Add signal group, shared by carrier raw bindings and
     page templates. prefix names the owner in every label ('' or 'kafka-topic '). */
  function signalEditors(parent,binding,prefix,commit,extra){
    var signals=telemetryObject(binding.signals)?binding.signals:{},names=Object.keys(signals);
    names.forEach(function(name){
      var entry=signals[name],source=telemetrySignalSource(entry),box=group(parent,'metrics-signal','Signal '+name);
      row(box,prefix+name+' name',c.text(name,function(v){return commit({op:'signal',name:name,field:'name',value:v});},{required:'A signal needs a name; use Remove signal to delete it.'}));
      row(box,prefix+name+' source',relabel(c.select(TELEMETRY_SOURCES,source || '',function(v){return commit({op:'signal',name:name,field:'source',value:v});}),TELEMETRY_SOURCE_LABELS));
      row(box,prefix+name+' query',c.text(source?telemetryQueryText(source,entry[source]):'',function(v){return commit({op:'signal',name:name,field:'query',value:v});},{textarea:true,placeholder:source==='honeycomb'?'{"calculations":[{"op":"COUNT"}],"filters":[]}':'Query text'}));
      row(box,prefix+name+' unit',c.text(telemetryObject(entry)?entry.unit:null,function(v){return commit({op:'signal',name:name,field:'unit',value:v});},{placeholder:'req/h, msgs, ms'}));
      proofEditors(box,binding.proof,names,name,prefix,commit);
      box.appendChild(c.action(prefix?'Remove '+prefix+'signal '+name:'Remove signal '+name,function(){return commit({op:'removeSignal',name:name});}));
    });
    var add=group(parent,'metrics-add',prefix?'Add '+prefix+'signal':'Add signal'),label=prefix?prefix+'new signal':'New signal';
    var nameInput=draft(add,label+' name','text',null,''),source=draft(add,label+' source','select',sourceOptions,'grafana');
    var query=draft(add,label+' query','textarea',null,''),unit=draft(add,label+' unit','text',null,'');
    nameInput.placeholder='rate, errors, lag';unit.placeholder='req/h, msgs, ms';
    function submit(){
      var edit={op:'addSignal',name:nameInput.value.trim(),source:source.value,query:query.value,unit:unit.value.trim() || null};
      if(extra)extra(edit);return commit(edit);
    }
    [nameInput,unit].forEach(function(input){o.listen(input,'keydown',function(ev){if(ev.key==='Enter'){ev.preventDefault();submit();}});});
    add.appendChild(c.action(prefix?'Add '+prefix+'signal':'Add signal',submit));
  }
  /* min / max / ratio of for one signal. proof is the effective proof. */
  function proofEditors(parent,proof,names,name,prefix,commit){
    var limit=telemetryObject(proof) && telemetryObject(proof[name])?proof[name]:{};
    ['min','max'].forEach(function(field){
      row(parent,prefix+name+' '+field,c.number(telemetryNumber(limit[field])?limit[field]:null,function(v){return commit({op:'proof',signal:name,field:field,value:v});}));
    });
    var others=names.filter(function(other){return other!==name;});
    row(parent,prefix+name+' ratio of',relabel(c.select(others,typeof limit.maxRatioOf==='string'?limit.maxRatioOf:'',function(v){return commit({op:'proof',signal:name,field:'maxRatioOf',value:v});},true),{'':'(absolute limits)'}));
  }
  function linkEditors(parent,links,prefix,commit,placeholders){
    [['dashboard','dashboard link'],['query','query link']].forEach(function(link){
      var label=prefix?prefix+link[1]:link[1].charAt(0).toUpperCase()+link[1].slice(1);
      row(parent,label,c.text(telemetryObject(links)?links[link[0]]:null,function(v){return commit({op:'link',key:link[0],value:v});},{placeholder:placeholders && placeholders[link[0]]?'Template: '+placeholders[link[0]]:'https://…'}));
    });
  }
  return {el:el,note:note,row:row,relabel:relabel,group:group,draft:draft,warnings:warnings,signalEditors:signalEditors,proofEditors:proofEditors,linkEditors:linkEditors,sourceOptions:sourceOptions};
}

/* o: {document, state: telemetryCarrierState(...), controls:{row,text,select,number,action}, listen, commit(edit)} */
function createFlowMetricsEditor(o){
  var d=flowMetricsDom(o),c=o.controls,s=o.state,commit=o.commit,b=s.binding,templateNames=Object.keys(s.templates || {});
  var box=d.el('fieldset','metrics-editor');box.appendChild(d.el('legend',null,'Metrics'));
  if(s.imported)d.note(box,'Inherited metrics from '+s.provider+' (read only): '+(s.inherited?telemetrySummary(s.inherited)+'. A binding saved here replaces it in this consumer.':'none. A binding saved here applies only in this consumer.'),'metrics-inherited');
  // An imported carrier that inherits a provider binding is bound; only a carrier with neither is unbound.
  if(!b && !s.inherited)d.note(box,'Unbound: no metrics overlay and no proof verdict. Choose a kind, then add a signal'+(templateNames.length?' or pick a template':'')+'.','metrics-status');
  // An unbound carrier's kind is a draft: it is written with the first signal or template.
  var draftKind='call',template=s.mode==='template';
  var kind=c.select(TELEMETRY_KINDS,b?(typeof b.kind==='string'?b.kind:''):draftKind,function(v){
    if(!b){draftKind=v || 'call';return true;}
    return commit({op:'kind',value:v});
  },!!b && template);
  d.row(box,'Metrics kind',d.relabel(kind,{'':'(template kind'+(s.templateBase && typeof s.templateBase.kind==='string'?': '+s.templateBase.kind:'')+')'}));
  if(templateNames.length || template){
    d.row(box,'Signals from',d.relabel(c.select(templateNames,template?s.template:'',function(v){return commit({op:'use',name:v,kind:draftKind});},true),{'':'Raw signals'}));
  }
  if(template){
    var chosen=s.templates[s.template],effective=s.effective;
    if(!chosen || !effective)d.note(box,'Template "'+s.template+'" is not defined in Document settings → Tracking → Metrics. Choose another template, or use Remove metrics.');
    else{
      (Array.isArray(chosen.params)?chosen.params:[]).forEach(function(p){
        d.row(box,'Template parameter '+p,c.text(typeof b[p]==='string'?b[p]:'',function(v){return commit({op:'param',name:p,value:v});},{placeholder:p}));
      });
      var signals=telemetryObject(effective.signals)?effective.signals:{},names=Object.keys(signals);
      d.note(box,'Template signals: '+(names.map(function(name){var source=telemetrySignalSource(signals[name]),unit=signals[name] && signals[name].unit;return name+' ('+(source || 'no source')+(telemetryText(unit)?', '+unit:'')+')';}).join(', ') || 'none')+'. Edit them in Document settings → Tracking → Metrics; limits set here apply only to this carrier.');
      names.forEach(function(name){d.proofEditors(d.group(box,'metrics-signal','Signal '+name),effective.proof,names,name,'',commit);});
    }
  }else{
    d.signalEditors(box,b || {},'',commit,function(edit){edit.kind=draftKind;});
  }
  if(b){
    d.note(box,'Proof limits: min is a floor and max a ceiling; with ratio of, max is the highest allowed ratio to that signal.');
    d.linkEditors(box,b.links,'',commit,s.templateBase && s.templateBase.links);
    if(s.edge){
      var card=telemetryObject(b.card)?b.card:{};
      d.row(box,'Card side',d.relabel(c.select(TELEMETRY_CARD_SIDES,typeof card.side==='string'?card.side:'',function(v){return commit({op:'card',field:'side',value:v});},true),{'':'(automatic)'}));
      d.row(box,'Card offset',c.number(telemetryNumber(card.offset)?card.offset:null,function(v){return commit({op:'card',field:'offset',value:v});}));
      d.note(box,'Card side and offset (pixels) move this connection’s metrics card in Preview metrics layout and when a reader turns Metrics on.');
    }
    box.appendChild(c.action('Remove metrics',function(){return commit({op:'remove'});}));
  }
  d.warnings(box,s.warnings || [],'Metrics warnings');
  return box;
}

/* o: {document, state: telemetryPageState(raw), controls, listen, commit(edit)} */
function createFlowMetricsSettings(o){
  var d=flowMetricsDom(o),c=o.controls,s=o.state,commit=o.commit,t=s.telemetry || {};
  var box=d.el('fieldset','metrics-settings');box.appendChild(d.el('legend',null,'Metrics'));
  var allow=c.checkbox(t.enabled!==false,function(value){return commit({op:'enabled',value:value});});
  allow.querySelector('input').setAttribute('aria-label','Allow metrics');
  d.row(box,'Allow metrics',allow);
  d.note(box,'Allow metrics controls availability on this page, including imported diagrams and details. Turning it off keeps your bindings and settings. It does not turn Metrics on or run queries.');
  d.note(box,'Shared settings for the metrics bindings on this page. The Workbench stores queries only and never runs them.');
  [['grafana','prometheus','Grafana Prometheus UID','prom-main'],['grafana','loki','Grafana Loki UID','loki-main'],['grafana','tempo','Grafana Tempo UID','tempo-main'],
    ['grafana','baseUrl','Grafana base URL','https://example.grafana.net'],['grafana','sql','Grafana SQL UID','lake'],['grafana','cloudwatch','Grafana CloudWatch UID','cloudwatch-main'],['grafana','accountId','CloudWatch account ID','123456789012'],['honeycomb','environment','Honeycomb environment','prod'],['honeycomb','dataset','Honeycomb dataset','doorbell-prod']].forEach(function(field){
    var group=telemetryObject(t[field[0]])?t[field[0]]:{};
    d.row(box,field[2],c.text(group[field[1]],function(v){return commit({op:field[0],key:field[1],value:v});},{placeholder:field[3]}));
  });
  var profiles=telemetryObject(t.environments)?t.environments:{},environmentIds=Object.keys(profiles);
  var environments=d.group(box,'metrics-environments','Environments');
  d.note(environments,'Optional deployment profiles, such as qa, stg and prd. Blank values inherit shared settings. Readers can switch environments in Live status. Use $env or ${env} in queries, links and datasource values.');
  if(environmentIds.length)d.row(environments,'Default environment',c.select(environmentIds,t.environment || environmentIds[0],function(v){return commit({op:'environment',value:v});}));
  environmentIds.forEach(function(id){
    var profile=telemetryObject(profiles[id])?profiles[id]:{},set=d.group(environments,'metrics-environment','Environment '+id);
    [['grafana','prometheus','Grafana Prometheus UID'],['grafana','loki','Grafana Loki UID'],['grafana','tempo','Grafana Tempo UID'],['grafana','baseUrl','Grafana base URL'],['grafana','sql','Grafana SQL UID'],['grafana','cloudwatch','Grafana CloudWatch UID'],['grafana','accountId','CloudWatch account ID'],['honeycomb','environment','Honeycomb environment'],['honeycomb','dataset','Honeycomb dataset']].forEach(function(field){
      var group=telemetryObject(profile[field[0]])?profile[field[0]]:{};
      d.row(set,id+' '+field[2],c.text(group[field[1]],function(v){return commit({op:'environmentSetting',name:id,source:field[0],key:field[1],value:v});},{placeholder:'Inherit shared setting'}));
    });
    set.appendChild(c.action('Remove environment '+id,function(){return commit({op:'removeEnvironment',name:id});}));
  });
  var environmentName=d.draft(environments,'New environment id','text',null,'');environmentName.placeholder='qa, stg or prd';
  function addEnvironment(){return commit({op:'addEnvironment',name:environmentName.value.trim()});}
  o.listen(environmentName,'keydown',function(ev){if(ev.key==='Enter'){ev.preventDefault();addEnvironment();}});
  environments.appendChild(c.action('Add environment',addEnvironment));
  d.row(box,'Metrics window',c.text(typeof t.window==='string'?t.window:t.window==null?null:JSON.stringify(t.window),function(v){return commit({op:'window',value:v});},{placeholder:'24h'}));
  var refresh=c.number(t.refreshMs==null?null:t.refreshMs,function(v){return commit({op:'refreshMs',value:v});});refresh.placeholder='connector default';
  d.row(box,'Metrics refresh ms',refresh);
  var templates=telemetryObject(t.templates)?t.templates:{};
  Object.keys(templates).forEach(function(name){
    var template=templates[name],set=d.group(box,'metrics-template','Template '+name),prefix=name+' ';
    function edit(e){return commit({op:'template',template:name,edit:e});}
    if(!telemetryObject(template))d.note(set,'This template is not an object; remove it or repair it in JSON.');
    else{
      d.row(set,prefix+'template kind',d.relabel(c.select(TELEMETRY_KINDS,typeof template.kind==='string'?template.kind:'',function(v){return edit({op:'kind',value:v});},true),{'':'(set on each carrier)'}));
      d.row(set,prefix+'template parameters',c.text(Array.isArray(template.params)?template.params.join(', '):'',function(v){return commit({op:'params',template:name,value:v});},{placeholder:'topic, group'}));
      d.signalEditors(set,template,prefix,edit);
      d.linkEditors(set,template.links,prefix,edit);
      var uses=s.uses[name] || 0;
      d.note(set,(uses?uses+(uses===1?' carrier uses':' carriers use')+' this template. ':'No carrier uses this template yet. ')+'Write $param or ${param} in queries and links; each carrier supplies the values.');
    }
    set.appendChild(c.action('Remove template '+name,function(){return commit({op:'removeTemplate',name:name});}));
  });
  var add=d.group(box,'metrics-add','Add template');
  var name=d.draft(add,'New template name','text',null,''),kind=d.draft(add,'New template kind','select',[['','(set on each carrier)']].concat(TELEMETRY_KINDS.map(function(k){return [k,k];})),'');
  var params=d.draft(add,'New template parameters','text',null,''),signal=d.draft(add,'New template signal name','text',null,'');
  var source=d.draft(add,'New template signal source','select',d.sourceOptions,'grafana'),query=d.draft(add,'New template signal query','textarea',null,''),unit=d.draft(add,'New template signal unit','text',null,'');
  name.placeholder='kafka-topic';params.placeholder='topic, group';signal.placeholder='lag';
  function submit(){
    return commit({op:'addTemplate',name:name.value.trim(),kind:kind.value || null,params:params.value,
      signal:{name:signal.value.trim(),source:source.value,query:query.value,unit:unit.value.trim() || null}});
  }
  [name,params,signal,unit].forEach(function(input){o.listen(input,'keydown',function(ev){if(ev.key==='Enter'){ev.preventDefault();submit();}});});
  add.appendChild(c.action('Add template',submit));
  d.warnings(box,s.warnings || [],'Metrics settings warnings');
  return box;
}
