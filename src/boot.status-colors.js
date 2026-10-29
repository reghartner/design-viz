(function(){
  var view=document.getElementById('palette-view'),message=document.getElementById('palette-message'),fields=document.getElementById('palette-fields'),skin=document.getElementById('palette-skin'),json=document.getElementById('palette-json'),rows={},appearanceRows={},draft={version:1,colors:{}},ctl;
  function say(text,error){message.textContent=text;message.dataset.error=error?'true':'false';}
  try{draft=FlowStatusColors.read(window);say('Saved defaults loaded. Changes preview here until saved.');}catch(error){say('Could not load saved defaults. '+error.message,true);}
  function sample(){
    var states=['todo','active','done','blocked','missing','unchanged'],nodes={},map={},edges=[];
    states.forEach(function(state,index){
      var node={title:state==='todo'?'To do':state[0].toUpperCase()+state.slice(1),sub:'Local node'};
      if(state!=='unchanged'){
        node.tickets=['COLOR-'+(index+1)];
        map['COLOR-'+(index+1)]={state:state,title:node.title+' example',assignee:'Preview owner',prs:{links:[{url:'https://github.com/example/preview/pull/'+(index+1),number:index+1,title:'Preview change',state:['open','draft','merged','closed','open'][index],checks:['pending','none','passing','failing','pending'][index]}]}};
      }
      nodes[state]=node;
      if(index>0)edges.push({from:states[index-1],to:state,label:state,tickets:state==='unchanged'?[]:['COLOR-'+(index+1)]});
    });
    var importedNodes={};states.forEach(function(state){var id=state==='active'?'imported':state;importedNodes[id]=Object.assign({},nodes[state],{title:'Imported '+nodes[state].title,sub:'Shared topology'});});
    var provider={page:{title:'Imported preview',canon:{version:1,id:'palette-provider',kind:'canonical',owner:'group:default/preview'},sections:[{id:'main',diagram:{nodes:importedNodes,rows:[['todo','imported','done'],['blocked','missing','unchanged']],edges:[{from:'imported',to:'missing'}],topologyExports:{colors:{nodes:Object.keys(importedNodes),edges:['imported->missing']}}}}]}};
    var source={page:{title:'Delivery status',skin:'pastel',canon:{version:1,id:'palette-preview',kind:'canonical',owner:'group:default/preview'},sections:[{id:'sample',heading:'Status on every node',diagram:{nodes:nodes,rows:[['todo','active','done'],['blocked','missing','unchanged']],edges:edges,topologyImports:[{spec:'palette-provider',export:'colors',as:'shared',position:{x:0,y:340}}],view:'step',steps:[{nodes:states.concat(Object.keys(importedNodes).map(function(id){return 'shared::'+id;})),text:'All status colors · local and imported nodes'}].concat(states.map(function(state){return {nodes:[state],text:state==='todo'?'To do':state[0].toUpperCase()+state.slice(1)};})).concat([{edge:'todo->active',text:'Active connection'}]),panels:[{id:'status',type:'live-status',title:'Tickets and pull requests'}],sectionLayout:{columns:24,default:[{x:0,y:0,w:24,h:12},{controls:'steps',x:0,y:12,w:24,h:5},{panel:'status',x:0,y:17,w:24,h:18}]}}}]}};
    return {page:normalize(FlowTopology.resolveSource(source,{version:1,id:'palette-preview',specs:[provider,source]})),map:map};
  }
  var fixture=sample();
  function repaint(){FlowStatusColors.apply(view,draft);view.dispatchEvent(new CustomEvent('reader-skin-change'));}
  function render(){if(ctl)ctl.destroy();applySkinClasses(document.body,view,skin.value);
    // Capture the production page ground before restoring the neutral editor shell.
    document.body.classList.remove('palette-page');var ground=getComputedStyle(document.body).background;document.body.classList.add('palette-page');view.parentElement.style.background=ground;
    ctl=renderPage(view,fixture.page,skin.value,{}, {liveStatus:{colorsPreview:true}});ctl.liveStatus.apply(fixture.map);repaint();}
  function defaults(name,prop){if(prop==='borderColor')return getComputedStyle(view).getPropertyValue('--dv-'+name).trim();if(prop==='borderWidth')return name==='live-blocked'?3:2;if(prop==='fillStrength')return 15;return name==='live-active' || name==='live-done'?100:0;}
  function sync(){
    var computed=window.getComputedStyle(view);
    Object.keys(appearanceRows).forEach(function(name){Object.keys(appearanceRows[name]).forEach(function(prop){var row=appearanceRows[name][prop],overrides=draft.appearance && draft.appearance[name] || {},set=Object.prototype.hasOwnProperty.call(overrides,prop),value=set?overrides[prop]:defaults(name,prop);row.input.value=value;if(row.slider)row.slider.value=value;row.input.removeAttribute('aria-invalid');if(row.color)row.color.value=value;row.reset.disabled=!set;});});
    FlowStatusColors.fields.forEach(function(field){var value=computed.getPropertyValue('--dv-'+field[0]).trim(),row=rows[field[0]];row.hex.value=value.toLowerCase();row.color.value=value;row.hex.removeAttribute('aria-invalid');row.reset.disabled=!Object.prototype.hasOwnProperty.call(draft.colors,field[0]);});
  }
  function valid(){var bad=fields.querySelector('[aria-invalid=true]');if(bad){say('Correct the highlighted setting before saving or exporting. Colors need six-digit hex values such as #1666c7.',true);bad.focus();return false;}return true;}
  function edit(name,value,input){
    if(!/^#[0-9a-f]{6}$/i.test(value)){input.setAttribute('aria-invalid','true');say('Use a six-digit hex color such as #1666c7.',true);return;}
    draft.colors[name]=value.toLowerCase();input.removeAttribute('aria-invalid');repaint();
    rows[name].hex.value=value.toLowerCase();rows[name].hex.removeAttribute('aria-invalid');rows[name].color.value=value;rows[name].reset.disabled=false;var border=appearanceRows[name] && appearanceRows[name].borderColor;if(border && !(draft.appearance && draft.appearance[name] && draft.appearance[name].borderColor)){border.input.value=value;border.color.value=value;}say('Unsaved preview. Save defaults to apply across this site.');
  }
  function appearanceControl(parent,field,prop,title){
    var name=field[0],setting=FlowStatusColors.settings[prop],row=document.createElement('div');row.className='palette-setting';
    var label=document.createElement('label'),input=document.createElement('input'),reset=document.createElement('button'),picker,slider;
    label.textContent=title;input.id=name+'-'+prop;label.htmlFor=input.id;input.setAttribute('aria-label',field[1]+' '+title.toLowerCase());
    if(prop==='borderColor'){input.type='text';input.maxLength=7;input.spellcheck=false;picker=document.createElement('input');picker.type='color';picker.setAttribute('aria-label',field[1]+' border color picker');row.appendChild(picker);}
    else {input.type='number';input.min=setting.min;input.max=setting.max;input.step=prop==='borderWidth'?'0.5':'1';slider=document.createElement('input');slider.type='range';slider.min=input.min;slider.max=input.max;slider.step=input.step;slider.setAttribute('aria-label',field[1]+' '+title.toLowerCase()+' slider');row.classList.add('palette-setting-number');row.appendChild(slider);}
    reset.textContent='↶';reset.title='Reset '+field[1]+' '+title.toLowerCase();reset.setAttribute('aria-label',reset.title);
    function change(value){
      if(prop!=='borderColor')value=value.trim()===''?NaN:Number(value);
      var next=JSON.parse(JSON.stringify(draft));next.version=2;next.appearance=next.appearance || {};next.appearance[name]=next.appearance[name] || {};next.appearance[name][prop]=value;
      try{draft=FlowStatusColors.validate(next);}catch(error){input.setAttribute('aria-invalid','true');say(error.message,true);return;}
      input.removeAttribute('aria-invalid');input.value=value;if(slider)slider.value=value;if(picker)picker.value=value;reset.disabled=false;repaint();say('Unsaved preview. Save defaults to apply across this site.');
    }
    input.addEventListener('input',function(){change(input.value);});if(slider)slider.addEventListener('input',function(){change(slider.value);});if(picker)picker.addEventListener('input',function(){change(picker.value);});
    reset.addEventListener('click',function(){if(draft.appearance && draft.appearance[name]){delete draft.appearance[name][prop];if(!Object.keys(draft.appearance[name]).length)delete draft.appearance[name];}repaint();sync();say('Default setting previewed. Save defaults to keep it.');});
    row.prepend(label);row.append(input,reset);parent.appendChild(row);appearanceRows[name][prop]={input:input,color:picker,slider:slider,reset:reset};
  }
  FlowStatusColors.fields.forEach(function(field,index){
    if(index===0 || index===6 || index===10){var heading=document.createElement('h2');heading.textContent=index===0?'Status':index===6?'Pull request icons':'GitHub check dots';fields.appendChild(heading);if(index>0){var help=document.createElement('p');help.className='palette-note';help.textContent=index===6?'PR = pull request: open is ready for review; draft is still in progress; merged is included in the target branch; closed ended without merging.':'Dots summarize automated GitHub checks: passing succeeded, failing needs attention, pending is running or waiting. No dot means no check result is available.';fields.appendChild(help);}}
    var row=document.createElement('div');row.className='palette-row';var label=document.createElement('label');label.textContent=field[1];label.htmlFor='hex-'+field[0];
    var color=document.createElement('input');color.type='color';color.setAttribute('aria-label',field[1]+' color');
    var hex=document.createElement('input');hex.type='text';hex.id=label.htmlFor;hex.spellcheck=false;hex.setAttribute('aria-label',field[1]+' hex');hex.maxLength=7;
    var reset=document.createElement('button');reset.textContent='↶';reset.title='Reset '+field[1];reset.setAttribute('aria-label',reset.title);
    color.addEventListener('input',function(){edit(field[0],color.value,color);});hex.addEventListener('input',function(){edit(field[0],hex.value,hex);});reset.addEventListener('click',function(){delete draft.colors[field[0]];repaint();sync();say('Default color previewed. Save defaults to keep it.');});
    row.append(label,color,hex,reset);fields.appendChild(row);rows[field[0]]={color:color,hex:hex,reset:reset};
    if(index<6){var details=document.createElement('details'),summary=document.createElement('summary');details.className='palette-status-details';summary.textContent=field[1]+' border, fill & glow';details.appendChild(summary);appearanceRows[field[0]]={};[['borderColor','Border color'],['borderWidth','Border width (px)'],['fillStrength','Fill tint (%)'],['glowStrength','Glow strength (%)']].forEach(function(pair){appearanceControl(details,field,pair[0],pair[1]);});fields.appendChild(details);}
  });
  SKIN_NAMES.forEach(function(name){var option=document.createElement('option');option.value=name;option.textContent=skinLabel(name);skin.appendChild(option);});skin.value='pastel';
  skin.addEventListener('change',function(){render();sync();});
  document.getElementById('palette-save').addEventListener('click',function(){if(!valid())return;try{FlowStatusColors.save(window,draft);say('Defaults saved for this site in this browser.');}catch(error){say('Could not save defaults. Your preview is still available to export. '+error.message,true);}});
  document.getElementById('palette-reset').addEventListener('click',function(){draft={version:1,colors:{}};repaint();sync();say('Built-in defaults previewed. Save defaults to clear your saved overrides.');});
  document.getElementById('palette-import').addEventListener('click',function(){try{if(json.value.length>65536)throw new Error('Palette JSON is too large.');var next=FlowStatusColors.validate(JSON.parse(json.value));draft=next;repaint();sync();say('Palette imported as a preview. Save defaults to apply it.');}catch(error){say('Import rejected. '+error.message,true);}});
  document.getElementById('palette-export').addEventListener('click',function(){if(!valid())return;var text=JSON.stringify(FlowStatusColors.validate(draft),null,2);json.value=text;var blob=new Blob([text+'\n'],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='flowview-status-colors.json';link.click();setTimeout(function(){URL.revokeObjectURL(url);},0);say('Palette exported. Only explicit overrides are included; other settings follow built-in defaults.');});
  render();sync();
  window.addEventListener('pagehide',function(){if(ctl){ctl.destroy();ctl=null;}});
  window.addEventListener('pageshow',function(event){if(event.persisted && !ctl){render();sync();}});
})();
