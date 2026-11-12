/* Desktop Workbench "Traces" editor (#1239): Status board settings → Traces edits
   tracking.telemetry.traceConnections (docs/trace-connections.md). Each company profile is Inherited
   (no board map), Use or Disable; a used profile takes a board label and an environment subset with
   label, value and context overrides. Inline profiles keep their fields in Advanced JSON; their
   allowedAttributes are rows here. A read-only list shows the connections readers can choose. Edits go
   through o.commit(edit) → commands/telemetry.js telemetryEditTraceConnections, one accepted edit per
   Undo step. Validator warnings sit in the group of the connection they name. Nothing here calls a
   trace provider. */
/* o: {document, state: telemetryTraceConnectionState(raw, company) plus warnings, controls
   (metricsControlKit), listen, commit(edit), drafts (Map), idPrefix} */
function createFlowTraceConnections(o){
  var d=flowMetricsDom(o),c=o.controls,s=o.state,commit=o.commit,warnings=s.warnings || [];
  var box=d.el('div','trace-connections');
  // What the board inherits while it sets no map: the resolver's answer (none without traces or with metrics off).
  var inherited=s.present?[]:Object.keys(s.resolved);
  function edit(fields){return commit(Object.assign({op:'traceConnections'},fields));}
  function named(control,name,title){control.setAttribute('aria-label',name);if(title)control.title=title;return control;}
  var serial=0,prefix=o.idPrefix || 'dv-trace-connections';
  // A validator warning under the controls of the connection it names: the text without its path.
  function fieldWarning(parent,controls,texts){
    if(!texts.length)return;
    var p=d.note(parent,texts.map(function(text){var m=text.slice(text.indexOf(': ')+2);return m.charAt(0).toUpperCase()+m.slice(1)+(/[.!?]$/.test(m)?'':'.');}).join(' '),'trace-connection-warning');
    p.id=prefix+'-warning-'+(serial++);p.setAttribute('role','note');
    controls.forEach(function(control){control.setAttribute('aria-invalid','true');control.setAttribute('aria-describedby',((control.getAttribute('aria-describedby') || '')+' '+p.id).trim());});
  }
  /* Allowed attribute rows (Remove each) and an Add field. target names the inline profile ({id}) or the
     company profile the board adds to ({profile, inherited}). Returns the Add field. */
  function attributeRows(set,id,list,target,text){
    d.note(set,text);
    list.forEach(function(name){
      var row=d.el('div','trace-connection-attribute');row.appendChild(d.el('span',null,String(name)));
      var remove=named(c.action('Remove',function(){return edit(Object.assign({action:'attribute',name:name,remove:true,company:o.company},target));},'bdanger'),'Remove '+id+' allowed attribute '+name,'Stop allowing this attribute. Undo brings it back.');
      row.appendChild(remove);set.appendChild(row);
    });
    var add=d.keptDraft(set,id+' new allowed attribute','text',null,'');add.placeholder='device.model';
    function submit(){var ok=edit(Object.assign({action:'attribute',name:add.value,company:o.company},target));if(ok){d.forget([id+' new allowed attribute']);add.value='';}return ok;}
    o.listen(add,'keydown',function(ev){if(ev.key==='Enter' && !ev.isComposing){ev.preventDefault();submit();}});
    var button=c.action('Add allowed attribute',submit);named(button,'Add allowed attribute to '+id,'Save this attribute name as one Undo step. Enter in the field does the same.');set.appendChild(button);
    return add;
  }
  function warningsFor(id){return warnings.filter(function(text){return text.indexOf('tracking.telemetry.traceConnections.'+id+':')===0;});}
  d.note(box,'Trace connections let readers load one trace by ID or link in the Trace view, through a connector they already have. Company profiles come with this build; each board can use, narrow or disable them. Nothing is called until a reader presses Load.');
  if(!s.valid){
    d.note(box,'tracking.telemetry.traceConnections is not an object, so readers get no trace connections. Fix it in Advanced JSON below.');
  }else if(!s.present){
    d.note(box,!s.companyIds.length?'This build has no company trace profiles. Add an inline profile in Advanced JSON.':
      !s.enabled?'Allow metrics is off for this page, so readers get no trace connections. Choosing Use still saves the choice.':
      inherited.length?'This board inherits every company profile, including ones added later. Choose Use or Disable on a profile to pick them for this board.':
      'This board does not use traces yet (a step trace match, span declarations, or Metrics on a Live status board), so it inherits no company profile. Choose Use to add one now.','trace-connections-mode');
  }else{
    d.note(box,'This board uses only the connections set to Use below and its inline profiles.','trace-connections-mode');
    var inherit=c.action('Inherit all company profiles',function(){return edit({action:'inherit',company:o.company});});
    inherit.title='Remove this board\'s trace connection settings, including board changes and inline profiles, so it inherits every company profile again. Undo restores them.';
    box.appendChild(inherit);
  }
  s.companyIds.forEach(function(id){
    var parsed=s.profiles[id],p=parsed.profile,held=s.entries[id],entry=held && telemetryObject(held.entry)?held.entry:null;
    var set=d.group(box,'trace-connection','Company profile '+id+(p?' · '+p.label:''));set.setAttribute('data-trace-profile',id);
    if(!p){d.note(set,'This company profile is not valid in this build: '+parsed.error);return;}
    var mode=!s.present?'inherit':held?'use':'disable',inheritsThis=inherited.indexOf(id)>=0;
    // Without a map a profile the board does not inherit cannot be disabled: there is nothing to turn off.
    var options=s.present?['use','disable']:inheritsThis?['inherit','use','disable']:['inherit','use'];
    var select=d.relabel(c.select(options,mode,function(v){
      if(v===mode)return true;
      return v==='inherit'?edit({action:'inherit',company:o.company}):edit({action:'mode',profile:id,value:v,company:o.company,inherited:inherited});
    }),{inherit:inheritsThis?'Inherited':'Not used',use:'Use',disable:'Disable'});
    d.row(set,id+' on this board',select);
    select.title='Inherited: the company settings, while this board sets no trace connections. Use: listed for this board, with the changes below. Disable: readers of this board cannot choose it.';
    var envIds=Object.keys(p.environments);
    var companyAttrs=Array.isArray(s.company && s.company[id] && s.company[id].allowedAttributes)?s.company[id].allowedAttributes:[];
    d.note(set,p.provider+' · '+envIds.length+(envIds.length===1?' environment':' environments')+' · allowed attributes from the company profile: '+(companyAttrs.length?companyAttrs.join(', '):'none')+'.');
    if(held && held.more.length)d.note(set,'Also listed as '+held.more.join(', ')+'; edit '+(held.more.length===1?'that entry':'those entries')+' in Advanced JSON.');
    var own=warningsFor(held?held.id:id);
    if(entry){
      var label=d.row(set,id+' board label',c.text(typeof entry.label==='string'?entry.label:null,function(v){return edit({action:'label',profile:id,value:v,company:o.company,inherited:inherited});},{placeholder:p.label}));
      label.title='The name readers see in the Trace view. Empty uses the company label.';
      var envs=d.group(set,'trace-connection-environments','Environments');
      d.note(envs,'Readers choose one of the checked environments. All checked: every environment of the profile, also ones the company adds later.');
      var chosen=telemetryObject(entry.environments)?entry.environments:null;
      envIds.forEach(function(env){
        var on=!chosen || Object.prototype.hasOwnProperty.call(chosen,env),base=p.environments[env],over=chosen && telemetryObject(chosen[env])?chosen[env]:{};
        var check=c.checkbox(on,function(v){return edit({action:'environment',profile:id,env:env,on:v,company:o.company});}),input=check.querySelector('input');
        input.setAttribute('aria-label',id+' environment '+env);
        envs.appendChild(c.row(env+(base.label?' · '+base.label:''),check));
        if(!on)return;
        function field(name,key,current,placeholder,extra){
          var control=d.row(envs,id+' '+env+' '+name,c.text(current,function(v){return edit(Object.assign({action:'envField',profile:id,env:env,field:key,value:v,company:o.company},extra || {}));},{placeholder:placeholder}));
          control.title='Board override. Empty uses the company value'+(placeholder?' ('+placeholder+')':'')+'.';
          return control;
        }
        field('label','label',typeof over.label==='string'?over.label:null,base.label || env);
        if(p.arguments.environment)field('value','value',typeof over.value==='string'?over.value:null,base.value);
        Object.keys(p.arguments.context || {}).forEach(function(key){
          var context=telemetryObject(over.context)?over.context:{};
          field('context '+key,'context',Object.prototype.hasOwnProperty.call(context,key)?String(context[key]):null,base.context[key]==null?'':String(base.context[key]),{key:key});
        });
      });
      attributeRows(set,id,Array.isArray(entry.allowedAttributes)?entry.allowedAttributes:[],{profile:id,inherited:inherited},
        'Allowed attributes this board adds to the company list above: span attribute names kept from loaded traces and allowed in a step trace match. Names that look like secrets are refused.');
    }
    fieldWarning(set,[select],own);
  });
  s.inline.forEach(function(id){
    var entry=s.map[id],set=d.group(box,'trace-connection trace-connection-inline','Inline profile '+id+(typeof entry.label==='string'?' · '+entry.label:''));
    set.setAttribute('data-trace-inline',id);
    d.note(set,'Defined in this board. Edit its other fields in Advanced JSON.');
    var add=attributeRows(set,id,Array.isArray(entry.allowedAttributes)?entry.allowedAttributes:[],{id:id},
      'Allowed attributes: span attribute names this profile keeps from loaded traces and allows in a step trace match, besides the built-in list. Names that look like secrets are refused.');
    fieldWarning(set,[add],warningsFor(id));
  });
  /* Read-only: what readers of this board can choose. */
  var resolved=d.group(box,'trace-connections-resolved','Readers can choose'),ids=Object.keys(s.resolved);
  if(!ids.length)d.note(resolved,!s.enabled?'None: Allow metrics is off for this page.':'None. Readers cannot load a trace directly on this board.');
  else{
    var ul=d.el('ul','trace-connections-resolved-list');ul.setAttribute('aria-label','Resolved trace connections');resolved.appendChild(ul);
    ids.forEach(function(id){
      var p=s.resolved[id],envs=Object.keys(p.environments).map(function(env){var e=p.environments[env];return env+(e.label && e.label!==env?' ('+e.label+')':'');});
      var li=d.el('li',null,id+' · '+p.label+' · '+p.provider+' · '+envs.join(', '));li.setAttribute('data-trace-connection',id);ul.appendChild(li);
    });
  }
  var advanced=d.fold(box,'trace-connections-advanced','Advanced JSON');
  d.note(advanced,'The whole tracking.telemetry.traceConnections map. Use it for inline profiles (a full version 1 profile instead of {"profile": …}). Empty removes the key, so the board inherits company profiles again.');
  d.row(advanced,'Trace connections JSON',c.text(s.present?JSON.stringify(s.valid?s.map:o.authored,null,2):null,function(v){return edit({action:'json',value:v,company:o.company});},{textarea:true,placeholder:'{"operations": {"profile": "operations", "environments": {"production": {}}}}'}));
  // Warnings that name no connection shown above (bad ids, the map itself) stay at the end.
  var shown=s.companyIds.map(function(id){var held=s.entries[id];return held?held.id:id;}).concat(s.inline);
  d.warnings(box,warnings.filter(function(text){return !shown.some(function(id){return text.indexOf('tracking.telemetry.traceConnections.'+id+':')===0;});}),'Trace connection warnings');
  return box;
}
