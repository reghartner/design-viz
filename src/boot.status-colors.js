(function(){
  var view=document.getElementById('palette-view'),message=document.getElementById('palette-message'),fields=document.getElementById('palette-fields'),skin=document.getElementById('palette-skin'),json=document.getElementById('palette-json'),rows={},draft={version:1,colors:{}},ctl;
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
    var provider={page:{title:'Imported preview',canon:{version:1,id:'palette-provider',kind:'canonical',owner:'group:default/preview'},sections:[{id:'main',diagram:{nodes:{imported:{title:'Imported active',sub:'Shared topology',tickets:['COLOR-2']},missing:{title:'Imported missing',sub:'Shared topology',missingWork:true}},rows:[['imported','missing']],edges:[{from:'imported',to:'missing'}],topologyExports:{colors:{nodes:['imported','missing'],edges:['imported->missing']}}}}]}};
    var source={page:{title:'Delivery status',skin:'pastel',canon:{version:1,id:'palette-preview',kind:'canonical',owner:'group:default/preview'},sections:[{id:'sample',heading:'Status on every node',diagram:{nodes:nodes,rows:[['todo','active','done'],['blocked','missing','unchanged']],edges:edges,topologyImports:[{spec:'palette-provider',export:'colors',as:'shared',position:{x:0,y:340}}],view:'step',steps:[{nodes:states.concat(['shared::imported','shared::missing']),text:'All status colors · local and imported nodes'}].concat(states.map(function(state){return {nodes:[state],text:state==='todo'?'To do':state[0].toUpperCase()+state.slice(1)};})).concat([{edge:'todo->active',text:'Active connection'}]),panels:[{id:'status',type:'live-status',title:'Tickets and pull requests'}],sectionLayout:{columns:24,default:[{x:0,y:0,w:24,h:12},{controls:'steps',x:0,y:12,w:24,h:5},{panel:'status',x:0,y:17,w:24,h:18}]}}}]}};
    return {page:normalize(FlowTopology.resolveSource(source,{version:1,id:'palette-preview',specs:[provider,source]})),map:map};
  }
  var fixture=sample();
  function repaint(){FlowStatusColors.apply(view,draft);view.dispatchEvent(new CustomEvent('reader-skin-change'));}
  function render(){if(ctl)ctl.destroy();applySkinClasses(document.body,view,skin.value);
    // Capture the production page ground before restoring the neutral editor shell.
    document.body.classList.remove('palette-page');var ground=getComputedStyle(document.body).background;document.body.classList.add('palette-page');view.parentElement.style.background=ground;
    ctl=renderPage(view,fixture.page,skin.value,{}, {liveStatus:{colorsPreview:true}});ctl.liveStatus.apply(fixture.map);repaint();}
  function sync(){
    var computed=window.getComputedStyle(view);
    FlowStatusColors.fields.forEach(function(field){var value=computed.getPropertyValue('--dv-'+field[0]).trim(),row=rows[field[0]];row.hex.value=value.toLowerCase();row.color.value=value;row.hex.removeAttribute('aria-invalid');row.reset.disabled=!Object.prototype.hasOwnProperty.call(draft.colors,field[0]);});
  }
  function valid(){var bad=fields.querySelector('[aria-invalid=true]');if(bad){say('Enter a six-digit hex color such as #1666c7 before saving or exporting.',true);bad.focus();return false;}return true;}
  function edit(name,value,input){
    if(!/^#[0-9a-f]{6}$/i.test(value)){input.setAttribute('aria-invalid','true');say('Use a six-digit hex color such as #1666c7.',true);return;}
    draft.colors[name]=value.toLowerCase();input.removeAttribute('aria-invalid');repaint();
    rows[name].hex.value=value.toLowerCase();rows[name].hex.removeAttribute('aria-invalid');rows[name].color.value=value;rows[name].reset.disabled=false;say('Unsaved preview. Save defaults to apply across this site.');
  }
  FlowStatusColors.fields.forEach(function(field,index){
    if(index===0 || index===6 || index===10){var heading=document.createElement('h2');heading.textContent=index===0?'Status':index===6?'Pull requests':'Checks';fields.appendChild(heading);}
    var row=document.createElement('div');row.className='palette-row';var label=document.createElement('label');label.textContent=field[1];label.htmlFor='hex-'+field[0];
    var color=document.createElement('input');color.type='color';color.setAttribute('aria-label',field[1]+' color');
    var hex=document.createElement('input');hex.type='text';hex.id=label.htmlFor;hex.spellcheck=false;hex.setAttribute('aria-label',field[1]+' hex');hex.maxLength=7;
    var reset=document.createElement('button');reset.textContent='↶';reset.title='Reset '+field[1];reset.setAttribute('aria-label',reset.title);
    color.addEventListener('input',function(){edit(field[0],color.value,color);});hex.addEventListener('input',function(){edit(field[0],hex.value,hex);});reset.addEventListener('click',function(){delete draft.colors[field[0]];repaint();sync();say('Default color previewed. Save defaults to keep it.');});
    row.append(label,color,hex,reset);fields.appendChild(row);rows[field[0]]={color:color,hex:hex,reset:reset};
  });
  SKIN_NAMES.forEach(function(name){var option=document.createElement('option');option.value=name;option.textContent=skinLabel(name);skin.appendChild(option);});skin.value='pastel';
  skin.addEventListener('change',function(){render();sync();});
  document.getElementById('palette-save').addEventListener('click',function(){if(!valid())return;try{FlowStatusColors.save(window,draft);say('Defaults saved for this site in this browser.');}catch(error){say('Could not save defaults. Your preview is still available to export. '+error.message,true);}});
  document.getElementById('palette-reset').addEventListener('click',function(){draft={version:1,colors:{}};repaint();sync();say('Built-in defaults previewed. Save defaults to clear your saved overrides.');});
  document.getElementById('palette-import').addEventListener('click',function(){try{if(json.value.length>65536)throw new Error('Palette JSON is too large.');var next=FlowStatusColors.validate(JSON.parse(json.value));draft=next;repaint();sync();say('Palette imported as a preview. Save defaults to apply it.');}catch(error){say('Import rejected. '+error.message,true);}});
  document.getElementById('palette-export').addEventListener('click',function(){if(!valid())return;var text=JSON.stringify(FlowStatusColors.validate(draft),null,2);json.value=text;var blob=new Blob([text+'\n'],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='flowview-status-colors.json';link.click();setTimeout(function(){URL.revokeObjectURL(url);},0);say('Palette exported. Only explicit overrides are included; other colors follow each skin.');});
  render();sync();
  window.addEventListener('pagehide',function(){if(ctl){ctl.destroy();ctl=null;}});
  window.addEventListener('pageshow',function(event){if(event.persisted && !ctl){render();sync();}});
})();
