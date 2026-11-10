/* Desktop Workbench Metrics editor (#941): Inspect → Tracking → Metrics for a
   node or connection, and Status board settings → Metrics and Environments for
   the page block (#1236). Read models and edits live in workbench/commands/telemetry.js; source,
   history and form lifetime stay inspector-owned, so every control calls
   o.commit(edit) and one accepted edit is one Undo step. Nothing here runs a
   query or draws on the canvas; preview rendering has its own owner. */
function flowMetricsDom(o){
  var doc=o.document,c=o.controls,drafts=o.drafts || new Map();
  function el(tag,cls,text){var node=doc.createElement(tag);if(cls)node.className=cls;if(text!=null)node.textContent=text;return node;}
  function note(parent,text,cls){var p=el('p','fnote'+(cls?' '+cls:''),text);parent.appendChild(p);return p;}
  // Each control carries its row label as its accessible name; a <label> around a <select> would include the option text.
  function row(parent,label,control){control.setAttribute('aria-label',label);parent.appendChild(c.row(label,control));return control;}
  function relabel(select,labels){Array.prototype.forEach.call(select.options,function(option){if(Object.prototype.hasOwnProperty.call(labels,option.value))option.textContent=labels[option.value];});return select;}
  function group(parent,cls,legend){var box=el('fieldset',cls);box.appendChild(el('legend',null,legend));parent.appendChild(box);return box;}
  // #1228: an Inspector <details> fold; inspector.js disclosureNodes keeps its open state across same-selection refreshes.
  function fold(parent,cls,title){var box=el('details','metrics-fold'+(cls?' '+cls:''));box.appendChild(el('summary',null,title));parent.appendChild(box);return box;}
  function draft(parent,label,kind,options,value){
    var input=el(kind==='select'?'select':kind==='textarea'?'textarea':'input','fctl');
    if(kind==='text')input.type='text';
    (options || []).forEach(function(option){var item=el('option',null,option[1]);item.value=option[0];input.appendChild(item);});
    if(value!=null)input.value=value;
    return row(parent,label,input);
  }
  /* #1255: unsaved New … fields survive a same-selection re-render (o.drafts is inspector-owned
     and cleared when the selection changes); a successful add forgets them. */
  function kept(input,key){
    var k='metrics:'+key;if(drafts.has(k))input.value=drafts.get(k);
    function keep(){drafts.set(k,input.value);}
    o.listen(input,'input',keep);o.listen(input,'change',keep);return input;
  }
  function forget(keys){keys.forEach(function(key){drafts.delete('metrics:'+key);});}
  // draft() stores nothing itself: callers with their own draft keys (the Log searches editor) wrap it.
  function keptDraft(parent,label,kind,options,value){return kept(draft(parent,label,kind,options,value),label);}
  function warnings(parent,list,label){
    if(!list.length)return;
    var ul=el('ul','metrics-warnings');ul.setAttribute('aria-label',label);
    list.forEach(function(text){ul.appendChild(el('li',null,text));});parent.appendChild(ul);
  }
  var sourceOptions=TELEMETRY_SOURCES.map(function(source){return [source,TELEMETRY_SOURCE_LABELS[source]];});
  /* Signal rows and the Add signal group, shared by carrier raw bindings and
     page templates. prefix names the owner in every label ('' or 'kafka-topic '). */
  // The checkbox itself carries the accessible name, so getByLabel/screen readers reach the input.
  function hideToggle(parent,label,checked,name,commit){
    var wrap=row(parent,label,c.checkbox(checked,function(v){return commit({op:'hide',name:name,value:v});})),input=wrap.querySelector('input');
    if(input){input.setAttribute('aria-label',label);wrap.removeAttribute('aria-label');}
    wrap.setAttribute('title',checked?'Show this inherited signal again in this document.':'Hide this inherited signal and its limits in this document only. The provider keeps it.');
    return wrap;
  }
  /* merge (#1266): an imported carrier's merge state. Inherited signals are tagged, can be hidden
     for this document and keep their provider name; edits store only the changed fields. */
  function signalEditors(parent,binding,prefix,commit,extra,merge){
    var signals=telemetryObject(binding.signals)?binding.signals:{},names=Object.keys(signals);
    names.forEach(function(name){
      var inherited=!!merge && merge.inheritedNames.indexOf(name)>=0,overridden=inherited && merge.overridden.indexOf(name)>=0;
      // The disclosure key is the title before ' · ', so the tag never changes a fold's open state.
      var entry=signals[name],source=telemetrySignalSource(entry),box=fold(parent,'metrics-signal','Signal '+name+(merge?inherited?' · inherited'+(overridden?', changed here':''):' · added here':''));
      if(inherited){
        hideToggle(box,prefix+name+' hidden for this document',false,name,commit);
        note(box,overridden?'Fields you change here are stored in this document; the rest follow the provider. Revert '+name+' to inherited removes your changes.':'Inherited from the provider. A field you change is stored in this document; the rest keep following the provider.');
      }
      var nameControl=row(box,prefix+name+' name',c.text(name,function(v){
        var ok=commit({op:'signal',name:name,field:'name',value:v});
        // The fold's disclosure key is its title: retitle it now so the refresh keeps the renamed signal's fold open.
        if(ok && v)box.querySelector('summary').textContent='Signal '+v;
        return ok;
      },{required:'A signal needs a name; use Remove signal to delete it.'}));
      if(inherited){nameControl.readOnly=true;nameControl.setAttribute('title','Inherited signal names come from the provider.');}
      row(box,prefix+name+' source',relabel(c.select(TELEMETRY_SOURCES,source || '',function(v){return commit({op:'signal',name:name,field:'source',value:v});}),TELEMETRY_SOURCE_LABELS));
      row(box,prefix+name+' query',c.text(source?telemetryQueryText(source,entry[source]):'',function(v){return commit({op:'signal',name:name,field:'query',value:v});},{textarea:true,placeholder:source==='honeycomb'?'{"calculations":[{"op":"COUNT"}],"filters":[]}':'Query text'}));
      row(box,prefix+name+' unit',c.text(telemetryObject(entry)?entry.unit:null,function(v){return commit({op:'signal',name:name,field:'unit',value:v});},{placeholder:'req/h, msgs, ms'}));
      row(box,prefix+name+' label',c.text(telemetryObject(entry)?entry.label:null,function(v){return commit({op:'signal',name:name,field:'label',value:v});},{placeholder:'Display name (optional, up to 120 characters)'}));
      row(box,prefix+name+' show on card',c.checkbox(!entry || entry.showOnCard!==false,function(v){return commit({op:'signal',name:name,field:'showOnCard',value:v});}));
      if(source==='loki' || source==='grafana')row(box,prefix+name+' empty result reads 0',c.checkbox(entry.missingMeansZero!==false,function(v){return commit({op:'signal',name:name,field:'missingMeansZero',value:v});})).setAttribute('title','On: an empty Prometheus result reads 0 in Live; an empty Loki count/rate reads 0 in Live and Over time. Off: empty stays unobserved (missingMeansZero: false).');
      row(box,prefix+name+' query link',c.text(entry && entry.links?entry.links.query:null,function(v){return commit({op:'signal',name:name,field:'queryLink',value:v});},{placeholder:'https://… (stable source query)'}));
      row(box,prefix+name+' scope',c.text(telemetryObject(entry)?entry.scope:null,function(v){return commit({op:'signal',name:name,field:'scope',value:v});},{placeholder:'Exact counting scope (optional)'}));
      // #1194: scope "" hides the scope line; unchecking removes the key, so the generated scope returns.
      row(box,prefix+name+' hide scope',c.checkbox(telemetryObject(entry) && entry.scope==='',function(v){return commit({op:'signal',name:name,field:'scope',value:v?'':null});}));
      proofEditors(box,binding.proof,names,name,prefix,commit);
      if(overridden)box.appendChild(c.action('Revert '+name+' to inherited',function(){return commit({op:'revert',name:name});}));
      if(!inherited)box.appendChild(c.action(prefix?'Remove '+prefix+'signal '+name:'Remove signal '+name,function(){return commit({op:'removeSignal',name:name});}));
    });
    if(merge && (merge.hidden.length || merge.staleHidden.length)){
      var hidden=fold(parent,'metrics-hidden','Hidden inherited signals');
      note(hidden,'Hidden in this document only; the provider still has them. Uncheck to show one again.');
      merge.hidden.forEach(function(name){hideToggle(hidden,prefix+name+' hidden for this document',true,name,commit);});
      if(merge.staleHidden.length){
        note(hidden,'Not in the provider now; kept hidden in case it returns. Uncheck to forget the hide.');
        merge.staleHidden.forEach(function(name){hideToggle(hidden,prefix+name+' hidden for this document',true,name,commit);});
      }
    }
    var add=fold(parent,'metrics-add',prefix?'New '+prefix+'signal':'New signal'),label=prefix?prefix+'new signal':'New signal';
    var nameInput=keptDraft(add,label+' name','text',null,''),source=keptDraft(add,label+' source','select',sourceOptions,'grafana');
    var query=keptDraft(add,label+' query','textarea',null,''),unit=keptDraft(add,label+' unit','text',null,'');
    nameInput.placeholder='rate, errors, lag';unit.placeholder='req/h, msgs, ms';
    function submit(){
      var edit={op:'addSignal',name:nameInput.value.trim(),source:source.value,query:query.value,unit:unit.value.trim() || null};
      if(extra)extra(edit);var ok=commit(edit);
      if(ok)forget(['name','source','query','unit'].map(function(field){return label+' '+field;}).concat(extra?['Metrics kind']:[]));
      return ok;
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
  return {el:el,note:note,row:row,relabel:relabel,group:group,fold:fold,draft:draft,keptDraft:keptDraft,kept:kept,forget:forget,drafts:drafts,warnings:warnings,signalEditors:signalEditors,proofEditors:proofEditors,linkEditors:linkEditors,sourceOptions:sourceOptions};
}

/* o: {document, state: telemetryCarrierState(...), controls:{row,text,select,number,action}, listen, commit(edit)} */
function createFlowMetricsEditor(o){
  var d=flowMetricsDom(o),c=o.controls,s=o.state,commit=o.commit,b=s.binding,templateNames=Object.keys(s.templates || {});
  var box=d.el('fieldset','metrics-editor');box.appendChild(d.el('legend',null,'Metrics'));
  function cardRows(card){
    card=telemetryObject(card)?card:{};
    var cardBox=d.fold(box,'metrics-card','Card');
    d.row(cardBox,'Card side',d.relabel(c.select(TELEMETRY_CARD_SIDES,typeof card.side==='string'?card.side:'',function(v){return commit({op:'card',field:'side',value:v});},true),{'':'(automatic)'}));
    d.row(cardBox,'Card offset',c.number(telemetryNumber(card.offset)?card.offset:null,function(v){return commit({op:'card',field:'offset',value:v});}));
    d.row(cardBox,'Card title',c.text(typeof card.title==='string'?card.title:'',function(v){return commit({op:'card',field:'title',value:v});},{placeholder:'(connection label)'}));
    d.row(cardBox,'Card width',c.number(telemetryNumber(card.width)?card.width:null,function(v){return commit({op:'card',field:'width',value:v});}));
    if(card.position)cardBox.appendChild(c.action('Reset card to automatic',function(){return commit({op:'card',field:'position',value:null});}));
    d.note(cardBox,'Drag the card in Preview metrics layout, or focus it and use Arrow keys (10 units; Shift moves 50). Drag a corner handle or press Alt+Left/Right to change its width; resizing pins the card where you see it. Manual placement overrides Card side and offset; Reset card to automatic restores them. Card width is 140–480 units (default 240); an empty Card title shows the connection label. Readers see the saved placement when Metrics is on.');
    return cardBox;
  }
  if(s.imported)d.note(box,'Inherited metrics from '+s.provider+': '+(!s.inherited?'none yet. Signals added here are kept as additions, so a binding the provider adds later merges with them.':
    s.merge?telemetrySummary(s.inherited)+'. Signals you add here are added to the provider\'s in this document; you can hide or change inherited ones. The provider is unchanged.':
    telemetrySummary(s.inherited)+'. This document replaces it with its own binding (saved before merging was available); Remove metrics restores the inherited binding.'),'metrics-inherited');
  if(s.merge && s.merge.allHidden)d.note(box,'All inherited signals are hidden for this document, so it shows no metrics here. Show one again under Hidden inherited signals, or add a signal.','metrics-status');
  if(s.imported && s.inherited && !s.merge && b){
    var effects=s.mergeEffects || [],about='Store these metrics as changes to the provider binding, so later provider changes reach this document'+(effects.length?'. Also: '+effects.join('; '):'')+'.';
    if(effects.length)d.note(box,'Merge with provider: '+effects.join('; ')+'.');
    box.appendChild(c.action('Merge with provider',function(){return commit({op:'mergeWithProvider'});})).setAttribute('title',about);
  }
  // An imported carrier that inherits a provider binding is bound; only a carrier with neither is unbound.
  if(!b && !s.inherited)d.note(box,'Unbound: no metrics overlay and no proof verdict. Choose a kind, then add a signal'+(templateNames.length?' or pick a template':'')+'.','metrics-status');
  // An unbound carrier's kind is a draft: it is written with the first signal or template.
  // #1255: a carrier that inherits a provider binding starts from the inherited kind.
  var inheritedKind=!b && telemetryObject(s.inherited) && TELEMETRY_KINDS.indexOf(s.inherited.kind)>=0?s.inherited.kind:null;
  var savedKind=d.drafts.get('metrics:Metrics kind'),draftKind=!b && TELEMETRY_KINDS.indexOf(savedKind)>=0?savedKind:inheritedKind || 'call',template=s.mode==='template';
  var kind=c.select(TELEMETRY_KINDS,b?(typeof b.kind==='string'?b.kind:''):draftKind,function(v){
    if(!b){draftKind=v || 'call';d.drafts.set('metrics:Metrics kind',draftKind);return true;}
    return commit({op:'kind',value:v});
  },!!b && template);
  var kindLabels={'':'(template kind'+(s.templateBase && typeof s.templateBase.kind==='string'?': '+s.templateBase.kind:'')+')'};
  if(inheritedKind)kindLabels[inheritedKind]=inheritedKind+' (inherited)';
  if(s.merge && telemetryObject(s.inherited) && TELEMETRY_KINDS.indexOf(s.inherited.kind)>=0)kindLabels[s.inherited.kind]=s.inherited.kind+' (inherited)';
  d.row(box,'Metrics kind',d.relabel(kind,kindLabels));
  // #1266: templates replace a binding, so an imported (merging) carrier explains why it has none.
  if(s.merge && templateNames.length)d.note(box,'Templates cannot be used here: this binding merges with the provider\'s, and a template would replace it. To use a template\'s signals, add them with New signal.','metrics-template-note');
  if(!s.merge && (templateNames.length || template)){
    d.row(box,'Signals from',d.relabel(c.select(templateNames,template?s.template:'',function(v){var ok=commit({op:'use',name:v,kind:draftKind});if(ok && v)d.forget(['Metrics kind']);return ok;},true),{'':'Raw signals'}));
  }
  if(template){
    var chosen=s.templates[s.template],effective=s.effective;
    if(!chosen || !effective)d.note(box,'Template "'+s.template+'" is not defined in Status board settings → Metrics. Choose another template, or use Remove metrics.');
    else{
      (Array.isArray(chosen.params)?chosen.params:[]).forEach(function(p){
        d.row(box,'Template parameter '+p,c.text(typeof b[p]==='string'?b[p]:'',function(v){return commit({op:'param',name:p,value:v});},{placeholder:p}));
      });
      var signals=telemetryObject(effective.signals)?effective.signals:{},names=Object.keys(signals);
      d.note(box,'Template signals: '+(names.map(function(name){var source=telemetrySignalSource(signals[name]),unit=signals[name] && signals[name].unit;return name+' ('+(source || 'no source')+(telemetryText(unit)?', '+unit:'')+')';}).join(', ') || 'none')+'. Edit them in Status board settings → Metrics; limits set here apply only to this carrier.');
      names.forEach(function(name){d.proofEditors(d.fold(box,'metrics-signal','Signal '+name),effective.proof,names,name,'',commit);});
    }
  }else{
    d.signalEditors(box,b || {},'',commit,function(edit){edit.kind=draftKind;},s.merge);
  }
  if(b){
    d.note(box,'Proof limits: min is a floor and max a ceiling; with ratio of, max is the highest allowed ratio to that signal.');
    d.linkEditors(d.fold(box,'metrics-links','Links'),b.links,'',commit,s.templateBase && s.templateBase.links);
    if(s.edge)cardRows(b.card);
    if(!s.merge)box.appendChild(c.action('Remove metrics',function(){return commit({op:'remove'});}));
    else if(s.merge.overlay)box.appendChild(c.action('Revert all metrics to inherited',function(){return commit({op:'remove'});})).setAttribute('title','Remove this document\'s additions, hidden signals and changes; the provider binding applies unchanged.');
  }else if(s.edge && s.inherited){
    // The first card edit of an inherited connection saves this consumer's copy of the binding.
    d.note(cardRows(s.inherited.card),'A card edit saves the inherited binding with that change as this consumer\'s override; the provider is unchanged.');
  }
  d.warnings(box,s.warnings || [],'Metrics warnings');
  return box;
}

/* o: {document, state: telemetryPageState(raw), controls, listen, commit(edit)} */
function createFlowMetricsSettings(o){
  var d=flowMetricsDom(o),c=o.controls,s=o.state,commit=o.commit,t=s.telemetry || {};
  var box=d.el('fieldset','metrics-settings');
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
  d.row(box,'Shared metrics variables',c.text(t.variables?JSON.stringify(t.variables):null,function(v){return commit({op:'variables',value:v});},{textarea:true,placeholder:'{"iotAccount":"123456789012"}'}));
  var profiles=telemetryObject(t.environments)?t.environments:{},environmentIds=Object.keys(profiles);
  // #1236: Status board settings passes its Environments section as o.environments.
  var environments=o.environments?o.environments.appendChild(d.el('div','metrics-environments')):d.fold(box,'metrics-environments','Environments');
  d.note(environments,'Optional deployment profiles, such as qa, stg and prd. Blank values inherit shared settings. Readers can switch environments in Live status. Use $env or ${env} in queries, links and datasource values. Use ${name} for named variables in any signal string; profile variables override shared defaults.');
  if(environmentIds.length)d.row(environments,'Default environment',c.select(environmentIds,t.environment || environmentIds[0],function(v){return commit({op:'environment',value:v});}));
  environmentIds.forEach(function(id){
    var profile=telemetryObject(profiles[id])?profiles[id]:{},set=d.group(environments,'metrics-environment','Environment '+id);
    [['grafana','prometheus','Grafana Prometheus UID'],['grafana','loki','Grafana Loki UID'],['grafana','tempo','Grafana Tempo UID'],['grafana','baseUrl','Grafana base URL'],['grafana','sql','Grafana SQL UID'],['grafana','cloudwatch','Grafana CloudWatch UID'],['grafana','accountId','CloudWatch account ID'],['honeycomb','environment','Honeycomb environment'],['honeycomb','dataset','Honeycomb dataset']].forEach(function(field){
      var group=telemetryObject(profile[field[0]])?profile[field[0]]:{};
      d.row(set,id+' '+field[2],c.text(group[field[1]],function(v){return commit({op:'environmentSetting',name:id,source:field[0],key:field[1],value:v});},{placeholder:'Inherit shared setting'}));
    });
    d.row(set,id+' metrics variables',c.text(profile.variables?JSON.stringify(profile.variables):null,function(v){return commit({op:'environmentSetting',name:id,source:'variables',value:v});},{textarea:true,placeholder:'Named string values; inherit shared defaults'}));
    set.appendChild(c.action('Remove environment '+id,function(){return commit({op:'removeEnvironment',name:id});}));
  });
  var environmentName=d.keptDraft(environments,'New environment id','text',null,'');environmentName.placeholder='qa, stg or prd';
  function addEnvironment(){var ok=commit({op:'addEnvironment',name:environmentName.value.trim()});if(ok)d.forget(['New environment id']);return ok;}
  o.listen(environmentName,'keydown',function(ev){if(ev.key==='Enter'){ev.preventDefault();addEnvironment();}});
  environments.appendChild(c.action('Add environment',addEnvironment));
  d.row(box,'Metrics window',c.text(typeof t.window==='string'?t.window:t.window==null?null:JSON.stringify(t.window),function(v){return commit({op:'window',value:v});},{placeholder:'24h'}));
  var refresh=c.number(t.refreshMs==null?null:t.refreshMs,function(v){return commit({op:'refreshMs',value:v});});refresh.placeholder='connector default';
  d.row(box,'Metrics refresh ms',refresh);
  var templates=telemetryObject(t.templates)?t.templates:{};
  Object.keys(templates).forEach(function(name){
    var template=templates[name],set=d.fold(box,'metrics-template','Template '+name),prefix=name+' ';
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
  var add=d.fold(box,'metrics-add','New template');
  var name=d.keptDraft(add,'New template name','text',null,''),kind=d.keptDraft(add,'New template kind','select',[['','(set on each carrier)']].concat(TELEMETRY_KINDS.map(function(k){return [k,k];})),'');
  var params=d.keptDraft(add,'New template parameters','text',null,''),signal=d.keptDraft(add,'New template signal name','text',null,'');
  var source=d.keptDraft(add,'New template signal source','select',d.sourceOptions,'grafana'),query=d.keptDraft(add,'New template signal query','textarea',null,''),unit=d.keptDraft(add,'New template signal unit','text',null,'');
  name.placeholder='kafka-topic';params.placeholder='topic, group';signal.placeholder='lag';
  function submit(){
    var ok=commit({op:'addTemplate',name:name.value.trim(),kind:kind.value || null,params:params.value,
      signal:{name:signal.value.trim(),source:source.value,query:query.value,unit:unit.value.trim() || null}});
    if(ok)d.forget(['name','kind','parameters','signal name','signal source','signal query','signal unit'].map(function(field){return 'New template '+field;}));
    return ok;
  }
  [name,params,signal,unit].forEach(function(input){o.listen(input,'keydown',function(ev){if(ev.key==='Enter'){ev.preventDefault();submit();}});});
  add.appendChild(c.action('Add template',submit));
  d.warnings(box,s.warnings || [],'Metrics settings warnings');
  return box;
}
