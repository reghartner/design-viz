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
  /* #1240: a validator warning under the control(s) it names: the text without its path. */
  var warnSerial=0;
  function fieldWarning(parent,controls,texts){
    if(!texts || !texts.length)return null;
    var p=note(parent,texts.map(function(text){var m=text.slice(text.indexOf(': ')+2);return m.charAt(0).toUpperCase()+m.slice(1)+(/[.!?]$/.test(m)?'':'.');}).join(' '),'metrics-field-warning');
    p.id=(o.idPrefix || 'dv-metrics')+'-warning-'+(warnSerial++)+'-'+Math.random().toString(36).slice(2,8);p.setAttribute('role','note');
    controls.forEach(function(control){control.setAttribute('aria-invalid','true');control.setAttribute('aria-describedby',((control.getAttribute('aria-describedby') || '')+' '+p.id).trim());});
    return p;
  }
  function warningsAt(list,path){return (list || []).filter(function(text){return text.indexOf(path+': ')===0;});}
  /* #1240: named variables as rows. env is null for the shared variables, else an environment id (its
     labels say "environment", so an environment named "shared" cannot collide with the shared rows);
     commit takes a page edit {op:'variable', action, name, to?, value?} (environment is added by the
     caller). path is the validator path of the variables object, for the warnings under each row. */
  /* #1393: env may instead be {title, lower, legend, note} for a node, connection or import's scoped
     variables; those rows commit the same {op:'variable', …} edits through their own commit. */
  function variableRows(parent,vars,env,commit,list,path){
    var custom=env && typeof env==='object',shared=env==null;
    var title=custom?env.title:shared?'Shared':env+' environment',lower=custom?env.lower:shared?'shared':env+' environment';
    var set=group(parent,'metrics-variables',custom?env.legend:shared?'Shared variables':env+' variables');
    note(set,custom?env.note:shared?'Named values for ${name} in signal queries, links and scopes. An environment\'s variables override these.':'Override the shared variables while '+env+' is the environment. No row: the shared value applies.');
    if(vars!=null && !telemetryObject(vars)){note(set,'These variables are not an object; repair them in JSON first.');fieldWarning(set,[],warningsAt(list,path));return set;}
    var authored=telemetryObject(vars)?vars:{};
    fieldWarning(set,[],warningsAt(list,path));
    Object.keys(authored).forEach(function(name,index){
      var n=index+1,item=el('div','metrics-variable'),value=authored[name];item.setAttribute('role','group');item.setAttribute('aria-label',title+' variable '+n);set.appendChild(item);
      var nameControl=row(item,title+' variable '+n+' name',c.text(name,function(v){return commit({op:'variable',action:'rename',name:name,to:v});},{required:'A variable needs a name; use Remove to delete it.',placeholder:'team'}));
      var valueControl=row(item,title+' variable '+n+' value',c.text(typeof value==='string'?value:JSON.stringify(value),function(v){return commit({op:'variable',action:'value',name:name,value:v});},{required:'A variable value is non-empty text; use Remove to delete it.',placeholder:'core'}));
      nameControl.title='Write ${'+name+'} in a query, link or scope to use this value.';
      fieldWarning(item,[nameControl,valueControl],warningsAt(list,path+'.'+name));
      var remove=c.action('Remove '+lower+' variable '+name,function(){return commit({op:'variable',action:'remove',name:name});},'bdanger');
      remove.title='Remove this variable. Undo brings it back.';item.appendChild(remove);
    });
    var newName=keptDraft(set,'New '+lower+' variable name','text',null,''),newValue=keptDraft(set,'New '+lower+' variable value','text',null,'');
    newName.placeholder='team';newValue.placeholder='core';
    function add(){
      var ok=commit({op:'variable',action:'add',name:newName.value.trim(),value:newValue.value});
      if(ok){forget(['New '+lower+' variable name','New '+lower+' variable value']);newName.value='';newValue.value='';}
      return ok;
    }
    [newName,newValue].forEach(function(input){o.listen(input,'keydown',function(ev){if(ev.key==='Enter' && !ev.isComposing){ev.preventDefault();add();}});});
    var addButton=c.action('Add '+lower+' variable',add);addButton.title='Save this name and value as one Undo step. Enter in either field does the same.';set.appendChild(addButton);
    return set;
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
  function signalEditors(parent,binding,prefix,commit,extra,merge,state,warnAt){
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
      // #1240: role "error" turns the card red over its limit; window is this signal's own time range.
      var role=row(box,prefix+name+' role',relabel(c.select(['error'],telemetryObject(entry) && typeof entry.role==='string'?entry.role:'',function(v){return commit({op:'signal',name:name,field:'role',value:v});},true),{'':'Normal','error':'Error: red card over its limit'}));
      role.title='Error: the card turns red when this signal is over its limit. Normal: the usual proof colours.';
      var hasWindow=telemetryObject(entry) && telemetryOwn(entry,'window');
      var windowControl=row(box,prefix+name+' window',c.text(hasWindow?(typeof entry.window==='string'?entry.window:JSON.stringify(entry.window)):null,function(v){return commit({op:'signal',name:name,field:'window',value:v});},{placeholder:'Page window (e.g. 1h, 7d)'}));
      windowControl.title=source==='cloudwatch'?'CloudWatch signals always cover the page window.':'Time range for this signal only, such as 1h, 7d or now-7d. Empty uses the page Metrics window.';
      if(source==='cloudwatch' && !hasWindow){windowControl.disabled=true;note(box,'Window: CloudWatch signals always cover the page window.','metrics-window-note');}
      if(warnAt){fieldWarning(box,[role],warnAt(name,'role'));fieldWarning(box,[windowControl],warnAt(name,'window'));}
      row(box,prefix+name+' show on card',c.checkbox(!entry || entry.showOnCard!==false,function(v){return commit({op:'signal',name:name,field:'showOnCard',value:v});}));
      if(source==='loki' || source==='grafana')row(box,prefix+name+' empty result reads 0',c.checkbox(entry.missingMeansZero!==false,function(v){return commit({op:'signal',name:name,field:'missingMeansZero',value:v});})).setAttribute('title','On: an empty Prometheus result reads 0 in Live; an empty Loki count/rate reads 0 in Live and Over time. Off: empty stays unobserved (missingMeansZero: false).');
      row(box,prefix+name+' query link',c.text(entry && entry.links?entry.links.query:null,function(v){return commit({op:'signal',name:name,field:'queryLink',value:v});},{placeholder:'https://… (stable source query)'}));
      row(box,prefix+name+' scope',c.text(telemetryObject(entry)?entry.scope:null,function(v){return commit({op:'signal',name:name,field:'scope',value:v});},{placeholder:'Exact counting scope (optional)'}));
      // #1194: scope "" hides the scope line; unchecking removes the key, so the generated scope returns.
      row(box,prefix+name+' hide scope',c.checkbox(telemetryObject(entry) && entry.scope==='',function(v){return commit({op:'signal',name:name,field:'scope',value:v?'':null});}));
      if(state)narrowEditors(box,name,source,state,commit);
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
  /* #1363: a carrier signal's narrowing. Inherited fragments are read-only; the board's own have
     Remove. Add narrowing runs the viewer's check first, so a refused fragment is never stored. The
     editor shows the viewer's Not shown reason and the query it would send (never queried). */
  function narrowEditors(box,name,source,state,commit){
    var n=state.narrow && state.narrow[name],sent=state.sent && state.sent[name];
    if(sent && sent.error)note(box,'Not shown: '+sent.error,'metrics-not-shown');
    if(!n)return;
    n.inherited.forEach(function(f){note(box,name+' narrowing from the provider: '+telemetryNarrowText(f),'metrics-narrow-inherited');});
    n.own.forEach(function(f,i){
      var index=n.inherited.length+i;
      note(box,name+' narrowing: '+telemetryNarrowText(f),'metrics-narrow');
      box.appendChild(c.action('Remove '+name+' narrowing '+(i+1),function(){return commit({op:'narrow',name:name,action:'remove',index:index});}));
    });
    if(source!=='sql' && source!=='tempo'){
      var json=telemetryOwn(TELEMETRY_NARROW_JSON,source),label=name+' add narrowing',input=keptDraft(box,label,json?'textarea':'text',null,'');
      input.placeholder=json?TELEMETRY_NARROW_JSON[source]:{loki:'| event_code="FULL_CHARGE"',grafana:'type="full_charge"',cloudwatchLogs:'filter code = "FULL_CHARGE"'}[source] || '';
      function add(){var ok=commit({op:'narrow',name:name,action:'add',fragment:input.value});if(ok)forget([label]);return ok;}
      if(!json)o.listen(input,'keydown',function(ev){if(ev.key==='Enter'){ev.preventDefault();add();}});
      box.appendChild(c.action('Add '+name+' narrowing',add));
    }
    // #1363 c1: what the provider requires is read-only; the field holds only this board's own fields.
    var required=n.needs.inherited,has=required===true || required.length>0;
    if(has){var fixed=el('input','fctl');fixed.type='text';fixed.readOnly=true;fixed.value=telemetryNeedsText(required);row(box,name+' required by the provider',fixed);}
    if(required!==true)row(box,name+' boards must narrow by',c.text(telemetryNeedsText(n.needs.own) || null,function(v){
      var mine=telemetryNeedsValue(v);if(mine.error)return commit({op:'needsNarrow',name:name,value:v});
      return commit({op:'needsNarrow',name:name,value:telemetryNeedsText(telemetryNeedsMerge(has?required:null,mine.value)) || null});
    },{placeholder:has?'More fields, separated by commas (or any)':'event_code, type (or any)'}));
    if(sent && !sent.error && (n.inherited.length || n.own.length)){
      var query=el('textarea','fctl');query.readOnly=true;query.value=sent.query;row(box,name+' query sent',query);
    }
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
  return {el:el,note:note,row:row,relabel:relabel,group:group,fold:fold,draft:draft,keptDraft:keptDraft,kept:kept,forget:forget,drafts:drafts,warnings:warnings,fieldWarning:fieldWarning,warningsAt:warningsAt,variableRows:variableRows,signalEditors:signalEditors,proofEditors:proofEditors,linkEditors:linkEditors,sourceOptions:sourceOptions};
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
  // #1266: additions on a carrier whose provider no longer has a binding need their own kind.
  if(s.merge && b && telemetryObject(b.signals) && Object.keys(b.signals).length && TELEMETRY_KINDS.indexOf(b.kind)<0){
    d.note(box,'The provider no longer has a metrics binding here, so this document\'s signals need their own kind. Set kind here stores the selected Metrics kind.','metrics-status');
    box.appendChild(c.action('Set kind here',function(){return commit({op:'kind',value:TELEMETRY_KINDS.indexOf(kind.value)>=0?kind.value:'call'});})).setAttribute('title','Store the selected Metrics kind in this document so its signals stay a valid binding.');
  }
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
    d.signalEditors(box,b || {},'',commit,function(edit){edit.kind=draftKind;},s.merge,s,function(name,field){return d.warningsAt(s.warnings,'telemetry.signals.'+name+'.'+field);});
  }
  // #1363: scoped variables for this carrier and, on an imported one, for its import.
  if(b){
    /* #1393: scoped variables as rows (the #1240 row control). Each row edit is a {op:'variableRow'} edit;
       commands/telemetry.js checks the name and the scoped-value allowlist and refuses a value that would
       keep one of this carrier's signals from being sent. */
    var vars=s.variables || {own:{},inherited:{}},what=s.edge?'connection':'node',inheritedNames=Object.keys(vars.inherited);
    var carrierSet=d.variableRows(box,vars.own,{title:what.charAt(0).toUpperCase()+what.slice(1),lower:what,legend:'Variables for this '+what,
      note:'Named values for ${name} in this '+what+'\'s signal queries, links and scopes. They override the import\'s, the environment\'s and the shared variables. Letters, digits, _ . @ : and inner - (and spaces) only.'+
        (inheritedNames.length?' Set by the provider: '+inheritedNames.map(function(k){return k+' = '+vars.inherited[k];}).join(', ')+'.':'')},
      function(e){return commit(Object.assign({},e,{op:'variableRow',scope:'carrier'}));},s.warnings,'telemetry.variables');
    carrierSet.classList.add('metrics-carrier-variables');
    if(s.importVariables){
      var as=s.importVariables.as;
      d.variableRows(box,s.importVariables.value,{title:'Import '+as,lower:'import '+as,legend:'Variables for import '+as,
        note:'Apply to every node and connection from import '+as+', under this '+what+'\'s own. Letters, digits, _ . @ : and inner - (and spaces) only.'},
        function(e){return commit(Object.assign({},e,{op:'variableRow',scope:'import'}));},[],'');
    }
    if(s.merge && s.inherited){
      box.appendChild(c.action('Copy provider queries',function(){return commit({op:'copyProviderQuery'});}));
      d.note(box,'Saves the provider\'s queries in this document; later provider changes no longer reach it. Required narrowing still applies.','metrics-copy-note');
    }
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
  d.variableRows(box,t.variables,null,commit,s.warnings,'tracking.telemetry.variables');
  var environmentWarnings=o.environmentWarnings || s.warnings || [];
  var profiles=telemetryObject(t.environments)?t.environments:{},environmentIds=Object.keys(profiles);
  // #1236: Status board settings passes its Environments section as o.environments.
  var environments=o.environments?o.environments.appendChild(d.el('div','metrics-environments')):d.fold(box,'metrics-environments','Environments');
  d.note(environments,'Optional deployment profiles, such as qa, stg and prd. Blank values inherit shared settings. Readers can switch environments in Live status. Use $env or ${env} in queries, links and datasource values. Use ${name} for named variables in any signal string; profile variables override shared defaults.');
  if(environmentIds.length)d.row(environments,'Default environment',c.select(environmentIds,t.environment || environmentIds[0],function(v){return commit({op:'environment',value:v});}));
  environmentIds.forEach(function(id){
    var profile=telemetryObject(profiles[id])?profiles[id]:{},set=d.group(environments,'metrics-environment','Environment '+id);
    // #1240: rename keeps the profile's place and settings; a default that named it follows.
    var idControl=d.row(set,id+' environment id',c.text(id,function(v){return commit({op:'renameEnvironment',name:id,to:v});},{required:'An environment needs an id; use Remove environment '+id+' to delete it.',placeholder:'qa, stg or prd'}));
    idControl.title='Rename this environment. Its settings stay, and the default environment follows the new id.';
    [['grafana','prometheus','Grafana Prometheus UID'],['grafana','loki','Grafana Loki UID'],['grafana','tempo','Grafana Tempo UID'],['grafana','baseUrl','Grafana base URL'],['grafana','sql','Grafana SQL UID'],['grafana','cloudwatch','Grafana CloudWatch UID'],['grafana','accountId','CloudWatch account ID'],['honeycomb','environment','Honeycomb environment'],['honeycomb','dataset','Honeycomb dataset']].forEach(function(field){
      var group=telemetryObject(profile[field[0]])?profile[field[0]]:{};
      d.row(set,id+' '+field[2],c.text(group[field[1]],function(v){return commit({op:'environmentSetting',name:id,source:field[0],key:field[1],value:v});},{placeholder:'Inherit shared setting'}));
    });
    d.variableRows(set,profile.variables,id,function(edit){edit.environment=id;return commit(edit);},environmentWarnings,'tracking.telemetry.environments.'+id+'.variables');
    set.appendChild(c.action('Remove environment '+id,function(){return commit({op:'removeEnvironment',name:id});}));
  });
  var environmentName=d.keptDraft(environments,'New environment id','text',null,'');environmentName.placeholder='qa, stg or prd';
  function addEnvironment(){var ok=commit({op:'addEnvironment',name:environmentName.value.trim()});if(ok)d.forget(['New environment id']);return ok;}
  o.listen(environmentName,'keydown',function(ev){if(ev.key==='Enter'){ev.preventDefault();addEnvironment();}});
  environments.appendChild(c.action('Add environment',addEnvironment));
  d.row(box,'Metrics window',c.text(typeof t.window==='string'?t.window:t.window==null?null:JSON.stringify(t.window),function(v){return commit({op:'window',value:v});},{placeholder:'24h'}));
  // #1287: metrics refresh at most every five minutes; the field says so before anything is typed.
  var refresh=c.number(t.refreshMs==null?null:t.refreshMs,function(v){return commit({op:'refreshMs',value:v});});refresh.placeholder='300000 (5 min)';
  refresh.min=String(TELEMETRY_MIN_REFRESH_MS);refresh.title='How often Metrics refreshes while it is on, in ms: at least 300000 (five minutes), the default when empty.';
  d.row(box,'Metrics refresh ms',refresh);
  var templates=telemetryObject(t.templates)?t.templates:{};
  Object.keys(templates).forEach(function(name){
    var template=templates[name],set=d.fold(box,'metrics-template','Template '+name),prefix=name+' ';
    function edit(e){return commit({op:'template',template:name,edit:e});}
    if(!telemetryObject(template))d.note(set,'This template is not an object; remove it or repair it in JSON.');
    else{
      d.row(set,prefix+'template kind',d.relabel(c.select(TELEMETRY_KINDS,typeof template.kind==='string'?template.kind:'',function(v){return edit({op:'kind',value:v});},true),{'':'(set on each carrier)'}));
      d.row(set,prefix+'template parameters',c.text(Array.isArray(template.params)?template.params.join(', '):'',function(v){return commit({op:'params',template:name,value:v});},{placeholder:'topic, group'}));
      d.signalEditors(set,template,prefix,edit,null,null,null,function(signal,field){return d.warningsAt(s.warnings,'tracking.telemetry.templates.'+name+'.signals.'+signal+'.'+field);});
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
