/* Authored section layouts are spec data; host preview dimensions are workspace
   state. Pointer previews never write source until one successful release. */
function planSectionLayout(text,raw,section,target,items,layoutId){
  var got=builderDiagram(text,raw,section);if(got.error)return got;
  if(['default','backstage','confluence'].indexOf(target)<0)return {error:'Unknown layout target.'};
  var index=Array.isArray(got.d.layouts)?got.d.layouts.findIndex(function(v){return v && v.id===layoutId;}):-1;
  if(Array.isArray(got.d.layouts) && index<0)return {error:'Reselect the layout before editing it.'};
  var definition=index>=0?got.d.layouts[index]:got.d, layouts=builderClone(definition.sectionLayout || {});
  if(items===null)delete layouts[target];else layouts[target]=items;
  if(index>=0 && !Object.keys(layouts).length)layouts.default=sectionLayoutPreset(got.d,'default');
  var warnings=[];sectionLayoutProfileWarnings(got.d,layouts,'diagram',warnings);
  if(warnings.length)return {error:warnings.join('\n')};
  return planSetField(text,raw,index>=0?got.path.concat(['layouts',index]):got.path,'sectionLayout',Object.keys(layouts).length?JSON.stringify(layouts):null);
}
function planSectionLayoutName(text,raw,section,name,layoutId){
  var got=builderDiagram(text,raw,section);if(got.error)return got;
  if(typeof name!=='string' || name.trim().length>40)return {error:'Use a layout name of up to 40 characters.'};
  if(Array.isArray(got.d.layouts)){
    var index=got.d.layouts.findIndex(function(v){return v && v.id===layoutId;});
    if(index<0 || !name.trim())return {error:'Select a layout and give it a nonempty name.'};
    return planSetField(text,raw,got.path.concat(['layouts',index]),'name',JSON.stringify(name.trim()));
  }
  return planSetField(text,raw,got.path,'layoutName',name.trim()?JSON.stringify(name.trim()):null);
}
function planEnsureSectionView(text,raw,section,optimizeTarget){
  var got=builderDiagram(text,raw,section);if(got.error)return got;
  if(Array.isArray(got.d.layouts))return {error:'This diagram already has named views.'};
  return builderRewrite(text,raw,got.path,function(d){
    var source=sectionLayoutDefinition(d),name=source?source.name:(d.primaryPanel?'Home':'Data flow');
    d.layouts=[{id:'view-1',name:name,sectionLayout:builderClone(source?source.sectionLayout:{default:sectionLayoutOptimize(d,'default',null)})}];
    if(optimizeTarget)d.layouts[0].sectionLayout[optimizeTarget]=sectionLayoutOptimize(got.d,optimizeTarget,sectionLayoutItems(got.d,optimizeTarget));
    d.defaultLayout='view-1';delete d.sectionLayout;delete d.layoutName;
  });
}
function planSectionViewSteps(text,raw,section,layoutId,indices){
  var got=builderDiagram(text,raw,section);if(got.error)return got;
  var index=(got.d.layouts || []).findIndex(function(v){return v.id===layoutId;});
  if(index<0)return {error:'Select a named view before choosing its steps.'};
  if(indices!==null && (!Array.isArray(indices) || !indices.length || indices.some(function(i,n){return !Number.isInteger(i) || !got.d.steps[i] || indices.indexOf(i)!==n;})))return {error:'Choose at least one step for this view.'};
  if(indices && !diagramPathList(got.d).some(function(p){return p.indices.some(function(i){return indices.indexOf(i)>=0;});}))return {error:'Choose at least one step that belongs to a story path.'};
  return builderRewrite(text,raw,got.path,function(d){
    if(indices===null){delete d.layouts[index].steps;return;}
    var taken=new Set((d.steps || []).map(function(st){return st.id;}));
    (d.steps || []).forEach(function(st,i){
      if(st.id)return;var n=i+1,id='step-'+n;while(taken.has(id))id='step-'+(++n);
      st.id=id;taken.add(id);
    });
    d.layouts[index].steps=indices.map(function(i){return d.steps[i].id;});
    if(d.layouts[index].steps.some(function(id){return d.steps.filter(function(st){return st.id===id;}).length!==1;}))return {error:'Selected steps need unique IDs. Fix duplicate step IDs first.'};
  });
}
function planDuplicateSectionLayout(text,raw,section,layoutId){
  var got=builderDiagram(text,raw,section);if(got.error)return got;
  var warnings=[];sectionLayoutWarnings(got.d,'diagram',warnings);if(warnings.length)return {error:warnings.join('\n')};
  var d=builderClone(got.d), source=sectionLayoutDefinition(d,layoutId);
  if(!Array.isArray(d.layouts)){
    d.layouts=[{id:'layout-1',name:source?source.name:'Layout',sectionLayout:builderClone(source?source.sectionLayout:{default:sectionLayoutPreset(d,'default')})}];
    d.defaultLayout='layout-1';delete d.sectionLayout;delete d.layoutName;source=d.layouts[0];
  }
  if(!source)return {error:'Select a layout to duplicate.'};
  var n=1;while(d.layouts.some(function(v){return v.id==='layout-'+n;}))n++;
  var id='layout-'+n, name=source.name.slice(0,33)+' copy';
  var suffix=2;while(d.layouts.some(function(v){return v.name===name;}))name=source.name.slice(0,28)+' copy '+suffix++;
  var profiles=builderClone(source.sectionLayout);
  Object.keys(profiles).forEach(function(target){
    profiles[target]=sectionLayoutItems(Object.assign({},d,{layouts:undefined,defaultLayout:undefined,sectionLayout:profiles}),target);
  });
  var copy={id:id,name:name,sectionLayout:profiles};if(source.steps)copy.steps=builderClone(source.steps);
  d.layouts.push(copy);
  var plan=planReplaceValue(text,raw,got.path,JSON.stringify(d));plan.layoutId=id;return plan;
}
function planDeleteSectionLayout(text,raw,section,layoutId){
  var got=builderDiagram(text,raw,section);if(got.error)return got;
  if(!Array.isArray(got.d.layouts) || !got.d.layouts.some(function(v){return v && v.id===layoutId;}))return {error:'Select a named layout to delete.'};
  return builderRewrite(text,raw,got.path,function(d){
    d.layouts=d.layouts.filter(function(v){return v.id!==layoutId;});
    if(!d.layouts.length){delete d.layouts;delete d.defaultLayout;}
    else if(d.defaultLayout===layoutId)d.defaultLayout=d.layouts[0].id;
  });
}
function planDefaultSectionLayout(text,raw,section,layoutId){
  var got=builderDiagram(text,raw,section);if(got.error)return got;
  if(!Array.isArray(got.d.layouts) || !got.d.layouts.some(function(v){return v && v.id===layoutId;}))return {error:'Select a named layout first.'};
  return planSetField(text,raw,got.path,'defaultLayout',JSON.stringify(layoutId));
}
function sectionLayoutSwap(items,from,to){
  var next=items.map(function(it){return Object.assign({},it);});
  var a=next.find(function(it){return sectionLayoutKey(it)===from;}),b=next.find(function(it){return sectionLayoutKey(it)===to;});
  if(!a || !b || a.controls || b.controls)return next;
  ['x','y','w','h','hidden'].forEach(function(k){var value=a[k];if(b[k]===undefined)delete a[k];else a[k]=b[k];if(value===undefined)delete b[k];else b[k]=value;});
  return sectionLayoutPack(next);
}
function sectionLayoutOptimize(d,target,items){
  var hidden=(items || []).filter(function(it){return it.hidden===true && it.controls==null;});
  var previous=(items || []).find(function(it){return it.controls==='steps';});
  var attachment=previous?previous.attachTo:items?'diagram':d.primaryPanel && (d.panels || []).some(function(p){return p.id===d.primaryPanel && panelCapability(p.type,'attachControls',false);})?'panel:'+d.primaryPanel:'diagram';
  var excluded=hidden.map(sectionLayoutKey),dock=attachment && excluded.indexOf(attachment)<0 && sectionLayoutTiles(d).some(function(t){return t.key==='steps';});
  if(dock)excluded.push('steps');
  var presetDiagram=attachment?Object.assign({},d,{primaryPanel:attachment==='diagram'?undefined:attachment.slice(6)}):d;
  var next=sectionLayoutPreset(presetDiagram,target,excluded);
  if(dock){
    var host=next.find(function(it){return sectionLayoutKey(it)===attachment;});
    if(host){
      var height=sectionLayoutControlsRows(d,items);
      next.push({controls:'steps',attachTo:attachment,x:host.x,y:host.y+host.h,w:host.w,h:height});
      host.h=Math.min(40,host.h+height);
    }
  }else{
    var stepTile=next.find(function(it){return it.controls==='steps';});
    if(stepTile){if(attachment)stepTile.attachTo=attachment;if(previous)stepTile.h=previous.h;}
  }
  return sectionLayoutPack(next.concat(hidden.map(function(it){return Object.assign({},it);})));
}
function sectionLayoutGesture(items,key,dx,dy,resize){
  var next=items.map(function(it){return Object.assign({},it);}),item=next.find(function(it){return sectionLayoutKey(it)===key;});
  if(!item)return next;
  if(resize){item.w=Math.max(1,Math.min(12-item.x,item.w+Math.round(dx)));item.h=Math.max(3,Math.min(40,item.h+Math.round(dy)));}
  else{item.x=Math.max(0,Math.min(12-item.w,item.x+Math.round(dx)));item.y=Math.max(0,Math.min(500,item.y+Math.round(dy)));}
  return sectionLayoutPack(next,key);
}
function sectionLayoutAttach(d,items,key){
  var next=sectionLayoutDetachSteps(d,items).map(function(it){return Object.assign({},it);});
  var step=next.find(function(it){return it.controls==='steps';});if(!step)return next;
  var prior=sectionLayoutDock(next);
  if(key){
    step.attachTo=key;
    var host=next.find(function(it){return sectionLayoutKey(it)===key;});
    if(host && key!==prior){host.h=Math.min(40,host.h+step.h);step.x=host.x;step.y=host.y+host.h;step.w=host.w;}
  }else delete step.attachTo;
  return sectionLayoutPack(next);
}
/* Grow the combined tile by the same amount, leaving the visualization's
   allotted height intact. Legacy combined tiles gain an explicit transport. */
function sectionLayoutResizeControls(d,items,height){
  var next=items.map(function(it){return Object.assign({},it);});
  var step=next.find(function(it){return it.controls==='steps';});
  if(!step){
    var diagram=next.find(function(it){return sectionLayoutKey(it)==='diagram';});
    if(!diagram)return next;
    step={controls:'steps',attachTo:'diagram',x:diagram.x,y:diagram.y+diagram.h,w:diagram.w,h:sectionLayoutControlsRows(d,items)};next.push(step);
  }
  var dock=sectionLayoutDock(next),host=dock && next.find(function(it){return sectionLayoutKey(it)===dock;});
  var maximum=host?Math.min(40,step.h+40-host.h):40;
  var value=Math.max(3,Math.min(maximum,Math.round(height)));
  if(!Number.isFinite(value))return items;
  if(host)host.h=Math.max(3,host.h+value-step.h);
  step.h=value;
  return sectionLayoutPack(next,dock || 'steps');
}
/* Separating a legacy combined tile is an explicit, undoable authoring edit. */
function sectionLayoutDetachSteps(d,items){
  if(!sectionLayoutTiles(d).some(function(t){return t.key==='steps';}) || items.some(function(it){return sectionLayoutKey(it)==='steps';}))return items;
  var next=items.map(function(it){return Object.assign({},it);}),diagram=next.find(function(it){return sectionLayoutKey(it)==='diagram';});
  if(!diagram)return items;
  var height=Math.min((d.paths || []).length>1?6:4,Math.max(3,diagram.h-3));
  diagram.h=Math.max(3,diagram.h-height);
  next.push({controls:'steps',x:diagram.x,y:diagram.y+diagram.h,w:diagram.w,h:height});
  return sectionLayoutPack(next,'steps');
}
/* Bind visibility to explicit tile identities, independently of the placement
   selector. Labels identify both the element and the layout being edited. */
function sectionLayoutVisibilityControl(doc,d,items,name,onChange){
  var group=doc.createElement('fieldset');group.className='layout-visibility';
  var legend=doc.createElement('legend');legend.textContent='Visible elements · '+name;group.appendChild(legend);
  var tiles=sectionLayoutTiles(d);
  tiles.forEach(function(tile){
    var item=items.find(function(it){return sectionLayoutKey(it)===tile.key;});
    if(!item || tile.key==='steps')return;
    var title=tile.title;
    if(tile.panel && tiles.filter(function(t){return t.title===title;}).length>1)title+=' ('+tile.panel+')';
    var label=doc.createElement('label'),input=doc.createElement('input'),text=doc.createElement('span');
    input.type='checkbox';input.checked=!item.hidden;
    input.setAttribute('data-layout-visibility',tile.key);
    input.setAttribute('aria-label','Show '+title+' in '+name);
    input.addEventListener('change',function(){onChange(tile.key,input.checked);});
    text.textContent=title;label.appendChild(input);label.appendChild(text);group.appendChild(label);
  });
  if(tiles.some(function(tile){return tile.key==='steps';})){
    var note=doc.createElement('span');note.className='layout-visibility-note';note.textContent='Step controls stay visible.';group.appendChild(note);
  }
  return group;
}
function initSectionLayoutEditor(opts){
  var view=opts.view,editing=null,drag=null,selected='diagram',stepsOpen=false,widths={backstage:1080,confluence:760};
  function el(tag,cls,text){var n=document.createElement(tag);if(cls)n.className=cls;if(text)n.textContent=text;return n;}
  function button(label,fn){var b=el('button','bbtn',label);b.type='button';b.addEventListener('click',fn);return b;}
  var toolbar=el('div','layout-preview-tools'),label=el('label',null,'Preview '),target=el('select');
  target.id='layout-preview-target';target.setAttribute('aria-label','Preview host');
  [['default','Responsive'],['backstage','Backstage'],['confluence','Confluence']].forEach(function(v){var o=el('option',null,v[1]);o.value=v[0];target.appendChild(o);});
  label.appendChild(target);toolbar.appendChild(label);
  var widthLabel=el('label',null,'Width '),width=el('input');width.type='number';width.min='320';width.max='1920';width.step='10';width.setAttribute('aria-label','Preview width in pixels');widthLabel.appendChild(width);toolbar.appendChild(widthLabel);
  var note=el('span','fnote');toolbar.appendChild(note);
  var stage=el('div','layout-preview-stage'),frame=el('div','layout-preview-frame');
  view.parentNode.insertBefore(toolbar,view);view.parentNode.insertBefore(stage,view);stage.appendChild(frame);frame.appendChild(view);
  function feedback(text){note.textContent=text;}
  function setFrame(){
    var host=target.value;frame.setAttribute('data-target',host);
    width.disabled=host==='default';width.value=host==='default'?'':widths[host];
    frame.style.width=host==='default'?'100%':widths[host]+'px';
    view.style.setProperty('--home-max-height',host==='confluence'?'560px':'70vh');
    feedback(host==='default'?'Responsive to the editor split.':host+' content-area simulation · actual host widths vary · scroll to inspect wide previews.');
  }
  function rawDiagram(index){
    try{var raw=JSON.parse(opts.src.value),rec=specSectionPaths(raw)[index];return rec&&specValueAt(raw,rec.diagram);}catch(ex){return null;}
  }
  function ready(){
    if(opts.renderedText && opts.renderedText()!==opts.src.value){feedback('Render the current JSON before arranging the section.');return false;}
    if(opts.locked && opts.locked()){feedback('Finish the current diagram editing action first.');return false;}
    return true;
  }
  function persist(index,items,expectedLayout){
    if(!ready())return false;
    if(expectedLayout!==undefined && expectedLayout!==activeLayout(index)){feedback('The selected layout changed. Use its current visibility controls.');return false;}
    var ok=opts.commit(index,target.value,items,activeLayout(index));if(ok)feedback('Saved '+target.options[target.selectedIndex].text+' layout · Undo restores the previous arrangement.');
    return ok;
  }
  function presentation(index){
    var ctl=opts.ctl && opts.ctl(),rec=ctl && ctl.sections.find(function(r){return r.number===index+1;});
    return rec && rec.presentation;
  }
  function activeLayout(index){var p=presentation(index);return p && p.layoutId?p.layoutId():undefined;}
  function currentItems(index,d){return sectionLayoutItems(d || rawDiagram(index),target.value,activeLayout(index));}
  function forceLayout(index){
    var p=presentation(index);if(!p)return;
    p.setMode('layout');
    if(p.setDiagramVisible)p.setDiagramVisible(!(currentItems(index) || []).some(function(it){return sectionLayoutKey(it)==='diagram' && it.hidden;}));
  }
  function updateTarget(){
    cancel();editing=null;setFrame();opts.render();
    var ctl=opts.ctl && opts.ctl();if(ctl)ctl.sections.forEach(function(rec){if(rec.presentation && rec.sectionEl.querySelector('.section-layout-grid'))rec.presentation.setMode('layout');});
    refresh();
  }
  target.addEventListener('change',updateTarget);
  width.addEventListener('change',function(){
    cancel();var n=Number(width.value);if(!Number.isFinite(n))n=760;
    widths[target.value]=Math.max(320,Math.min(1920,Math.round(n)));setFrame();
  });
  function paint(grid,items){
    var d=rawDiagram(Number(grid.closest('.doc-sec').getAttribute('data-dv-section')));
    grid.querySelectorAll('.section-layout-tile').forEach(function(tile){
      var item=items.find(function(it){return sectionLayoutKey(it)===tile.getAttribute('data-layout-key');});if(!item)return;
      tile.style.setProperty('--tile-x',item.x+1);tile.style.setProperty('--tile-y',item.y+1);tile.style.setProperty('--tile-w',item.w);tile.style.setProperty('--tile-h',item.h);
      if(d && tile.classList.contains('layout-has-attached-controls'))tile.style.setProperty('--attached-controls-height',(sectionLayoutControlsRows(d,items)*40-8)+'px');
    });
  }
  function cancel(){
    if(!drag)return;var prior=drag;drag=null;paint(prior.grid,prior.items);
    if(prior.handle.hasPointerCapture(prior.pointer))prior.handle.releasePointerCapture(prior.pointer);
    prior.grid.classList.remove('layout-dragging');
  }
  function fields(section,d){
    var row=section.querySelector('.section-arrange-fields');if(!row)return;row.replaceChildren();
    var index=Number(section.getAttribute('data-dv-section')),id=activeLayout(index),definition=sectionLayoutDefinition(d,id);
    var items=currentItems(index,d);if(!items)return;
    var dock=sectionLayoutDock(items);if(dock && selected==='steps')selected=dock;
    var choose=el('select');choose.setAttribute('aria-label','Layout element');
    sectionLayoutTiles(d).filter(function(t){return !(dock && t.key==='steps') && items.some(function(it){return sectionLayoutKey(it)===t.key;});}).forEach(function(t){var o=el('option',null,t.title);o.value=t.key;choose.appendChild(o);});
    if(!items.some(function(it){return sectionLayoutKey(it)===selected;}))selected='diagram';choose.value=selected;
    choose.addEventListener('change',function(){selected=choose.value;fields(section,d);});row.appendChild(choose);
    var item=items.find(function(it){return sectionLayoutKey(it)===selected;}),inputs={};
    [['x','Column',1,12],['y','Row',1,501],['w','Width',1,12],['h','Height',3,40]].forEach(function(f){
      var l=el('label',null,f[1]+' '),input=el('input');input.type='number';input.min=f[2];input.max=f[3];input.step='1';input.value=item[f[0]]+(f[0]==='x'||f[0]==='y'?1:0);input.setAttribute('aria-label',f[1]);inputs[f[0]]=input;l.appendChild(input);row.appendChild(l);
    });
    row.appendChild(button('Apply size / position',function(){
      var next=items.map(function(it){return Object.assign({},it);}),it=next.find(function(v){return sectionLayoutKey(v)===selected;});
      Object.keys(inputs).forEach(function(k){it[k]=Number(inputs[k].value)-(k==='x'||k==='y'?1:0);});
      var warnings=[];sectionLayoutWarnings(Object.assign({},d,{sectionLayout:{default:next}}),'diagram',warnings);
      if(warnings.length){feedback(warnings[0]);return;}
      persist(Number(section.getAttribute('data-dv-section')),sectionLayoutPack(next,selected));
    }));
    var visibility=sectionLayoutVisibilityControl(document,d,items,definition?definition.name:'Layout',function(key,visible){
      var next=items.map(function(it){var copy=Object.assign({},it);if(sectionLayoutKey(it)===key){if(visible)delete copy.hidden;else copy.hidden=true;}return copy;});
      persist(index,next,id);
    });
    row.insertBefore(visibility,row.firstChild);
    if(sectionLayoutTiles(d).some(function(t){return t.key==='steps';})){
      var coupling=el('label',null,'Step controls '),attach=el('select');attach.setAttribute('aria-label','Attach step controls to');
      [{key:'',title:'Detached'}].concat(sectionLayoutTiles(d).filter(function(t){return t.key==='diagram' || panelCapability(t.type,'attachControls',false);})).forEach(function(t){var o=el('option',null,t.key?'Attached to '+t.title:t.title);o.value=t.key;attach.appendChild(o);});
      var controls=items.find(function(it){return it.controls==='steps';});attach.value=controls?controls.attachTo || '':'diagram';
      attach.addEventListener('change',function(){persist(index,sectionLayoutAttach(d,items,attach.value),id);});coupling.appendChild(attach);row.appendChild(coupling);
      if(dock || !controls){
        var heightLabel=el('label',null,'Attached controls height '),height=el('input');
        var host=items.find(function(it){return sectionLayoutKey(it)===(dock || 'diagram');}),current=sectionLayoutControlsRows(d,items);
        height.type='number';height.min='3';height.max=String(host?Math.min(40,current+40-host.h):40);height.step='1';height.value=current;height.setAttribute('aria-label','Attached controls height in rows');
        heightLabel.appendChild(height);row.appendChild(heightLabel);
        row.appendChild(button('Apply controls height',function(){
          if(!height.checkValidity() || !height.value){feedback('Use a whole number from 3 to '+height.max+' rows for the attached controls.');return;}
          persist(index,sectionLayoutResizeControls(d,items,Number(height.value)),id);
        }));
        row.appendChild(el('span','fnote','Controls scroll when text is longer. Resizing them preserves the visualization height.'));
      }
      if(controls && controls.attachTo && !dock)row.appendChild(el('span','fnote','Attachment panel is hidden; controls are shown separately.'));
      if(definition && !definition.legacy){
        var detail=el('details','layout-step-selection');detail.open=stepsOpen;
        var count=definition.steps?definition.steps.length:(d.steps || []).length;
        detail.appendChild(el('summary',null,'Steps shown in this view · '+(definition.steps?count+' selected':'All '+count)));
        detail.addEventListener('toggle',function(){if(detail.isConnected)stepsOpen=detail.open;});
        detail.appendChild(el('p','fnote','Skipped steps still affect the story. Each path plays only its selected stops, in story order.'));
        detail.appendChild(button('Show all steps',function(){if(ready() && activeLayout(index)===id)opts.steps(index,id,null);}));
        var list=el('div','layout-step-options');
        (d.steps || []).forEach(function(st,i){
          var label=el('label'),input=el('input');input.type='checkbox';input.checked=!definition.steps || definition.steps.indexOf(st.id)>=0;
          input.disabled=input.checked && count===1;input.setAttribute('data-view-step',String(i));input.setAttribute('aria-label','Show step '+(i+1)+' in '+definition.name);
          label.appendChild(input);label.appendChild(el('span',null,(i+1)+'. '+(st.text || st.id || 'Untitled step')));
          input.addEventListener('change',function(){
            if(!ready() || activeLayout(index)!==id)return;
            var indices=Array.prototype.filter.call(list.querySelectorAll('input'),function(box){return box.checked;}).map(function(box){return Number(box.getAttribute('data-view-step'));});
            if(!opts.steps(index,id,indices))fields(section,d);
          });list.appendChild(label);
        });detail.appendChild(list);row.appendChild(detail);
      }
    }
    if(selected!=='steps'){
      var swap=el('select');swap.setAttribute('aria-label','Swap places with');
      sectionLayoutTiles(d).filter(function(t){return t.key!==selected && t.key!=='steps';}).forEach(function(t){var o=el('option',null,t.title);o.value=t.key;swap.appendChild(o);});
      row.appendChild(swap);var swapButton=button('Swap places',function(){persist(index,sectionLayoutSwap(items,selected,swap.value));});
      swapButton.disabled=!swap.options.length;swapButton.title='Exchange position, size and visibility with the selected element.';row.appendChild(swapButton);
    }
    var nameLabel=el('label',null,'View name '),name=el('input');name.type='text';name.maxLength=40;
    name.value=definition?definition.name:'';name.placeholder='View';name.setAttribute('aria-label','View name');
    name.addEventListener('change',function(){if(ready())opts.rename(index,name.value,id);});
    nameLabel.appendChild(name);row.insertBefore(nameLabel,row.firstChild);
    row.appendChild(button('Duplicate view',function(){
      if(!ready())return;var nextId=opts.duplicate(index,id);
      if(nextId){var p=presentation(index);if(p && p.setLayout)p.setLayout(nextId);refresh();}
    }));
    if(definition && !definition.legacy){
      var makeDefault=button(sectionLayoutDefinition(d).id===id?'Default view':'Make default',function(){if(ready())opts.makeDefault(index,id);});
      makeDefault.disabled=sectionLayoutDefinition(d).id===id;row.appendChild(makeDefault);
      row.appendChild(button('Delete view',function(){if(ready()){editing=null;opts.remove(index,id);refresh();}}));
    }
    section.querySelectorAll('.section-layout-tile').forEach(function(tile){tile.classList.toggle('layout-selected',tile.getAttribute('data-layout-key')===selected);});
  }
  function refresh(){
    if(drag && !drag.grid.isConnected)cancel();
    view.querySelectorAll('.doc-sec[data-dv-section]').forEach(function(section){
      var index=Number(section.getAttribute('data-dv-section')),d=rawDiagram(index);if(!d)return;
      var actions=section.querySelector('.section-arranger');
      if(!actions){
        actions=el('div','section-arranger');var controls=el('div','section-arrange-actions');actions.appendChild(controls);
        var arrange=button('Arrange section',function(){
          if(!ready())return;
          if(editing===index){editing=null;refresh();return;}
          editing=index;selected='diagram';if(opts.pause)opts.pause();
          var current=rawDiagram(index),items=currentItems(index,current);
          if(!Array.isArray(current.layouts)){opts.ensureView(index);return;}
          forceLayout(index);refresh();
        });arrange.setAttribute('data-arrange-toggle','');controls.appendChild(arrange);
        var rename=button('Rename view',function(){
          if(!ready())return;editing=index;if(opts.pause)opts.pause();forceLayout(index);refresh();
          var name=section.querySelector('[aria-label="View name"]');if(name){name.focus();name.select();}
        });rename.setAttribute('data-layout-rename','');controls.appendChild(rename);
        controls.appendChild(button('Optimize layout',function(){
          if(!ready())return;editing=index;
          if(!Array.isArray(rawDiagram(index).layouts)){opts.ensureView(index,target.value);return;}
          var current=rawDiagram(index),items=currentItems(index,current),p=presentation(index);
          if(p && p.mode()==='layout' && p.diagramVisible && !p.diagramVisible())items=items.map(function(it){return sectionLayoutKey(it)==='diagram'?Object.assign({},it,{hidden:true}):it;});
          persist(index,sectionLayoutOptimize(current,target.value,items));
        }));
        controls.appendChild(button('Reset layout',function(){if(!ready())return;editing=null;persist(index,null);}));
        var caption=el('span','fnote');caption.setAttribute('data-arrange-target','');controls.appendChild(caption);
        actions.appendChild(el('div','section-arrange-fields'));
        actions.addEventListener('click',function(ev){ev.stopPropagation();});actions.addEventListener('pointerdown',function(ev){ev.stopPropagation();});
        var board=section.querySelector('.diagram-views,.boardgrid');section.insertBefore(actions,board);
      }
      actions.querySelector('[data-arrange-toggle]').textContent=editing===index?'Done arranging':'Arrange section';
      actions.querySelector('[data-arrange-toggle]').setAttribute('aria-pressed',String(editing===index));
      actions.querySelector('[data-layout-rename]').disabled=!currentItems(index,d);
      var definition=sectionLayoutDefinition(d,activeLayout(index));
      actions.querySelector('[data-arrange-target]').textContent='Editing '+(definition?'“'+definition.name+'” · ':'')+target.options[target.selectedIndex].text;
      actions.querySelector('.section-arrange-fields').hidden=editing!==index;
      section.classList.toggle('section-arranging',editing===index);
      section.querySelectorAll('.section-controls-resize').forEach(function(handle){handle.remove();});
      if(editing===index){
        forceLayout(index);fields(section,d);
        section.querySelectorAll('.section-layout-tile').forEach(function(tile){
          if(!tile.querySelector('.section-tile-move')){
            var name=tile.getAttribute('data-layout-label');
            var move=el('button','section-tile-move','⠿ '+name);move.type='button';move.setAttribute('aria-label','Move '+name);move.title='Drag to move. Arrow keys move; Shift + arrows resize.';tile.appendChild(move);
            var resize=el('button','section-tile-resize','↘');resize.type='button';resize.setAttribute('aria-label','Resize '+name);resize.title='Drag to resize; arrow keys also resize.';tile.appendChild(resize);
          }
          var bar=tile.querySelector('.termbar');
          if(bar && tile.classList.contains('layout-has-attached-controls')){
            var grip=el('button','section-controls-resize','↕');grip.type='button';grip.setAttribute('aria-label','Resize attached step controls');grip.title='Drag vertically, or use Up / Down, to resize controls without shrinking the visualization.';bar.appendChild(grip);
          }
        });
      }
    });
  }
  view.addEventListener('click',function(ev){
    if(ev.target.closest('[data-view-layout]')){cancel();refresh();}
    else if(ev.target.closest('[data-view-focus]')){cancel();editing=null;refresh();}
  });
  view.addEventListener('pointerdown',function(ev){
    var handle=ev.target.closest('.section-tile-move,.section-tile-resize,.section-controls-resize');if(!handle || ev.button!==0 || ev.isPrimary===false)return;
    var section=handle.closest('.doc-sec'),index=Number(section.getAttribute('data-dv-section'));if(editing!==index||!ready())return;
    var grid=handle.closest('.section-layout-grid');if(getComputedStyle(grid).display!=='grid'){feedback('Use size / position fields on narrow screens, or widen the preview to drag.');return;}
    ev.preventDefault();ev.stopPropagation();cancel();selected=handle.closest('.section-layout-tile').getAttribute('data-layout-key');
    var items=currentItems(index),rect=grid.getBoundingClientRect();
    drag={handle:handle,grid:grid,section:index,key:selected,items:items,next:items,text:opts.src.value,x:ev.clientX,y:ev.clientY,left:rect.left,top:rect.top,pointer:ev.pointerId,resize:handle.classList.contains('section-tile-resize'),controls:handle.classList.contains('section-controls-resize'),cell:(grid.clientWidth+8)/12};
    handle.setPointerCapture(ev.pointerId);grid.classList.add('layout-dragging');
  },true);
  view.addEventListener('pointermove',function(ev){
    if(!drag||ev.pointerId!==drag.pointer)return;ev.preventDefault();
    var rect=drag.grid.getBoundingClientRect();
    var dy=(ev.clientY-drag.y+drag.top-rect.top)/40,d=rawDiagram(drag.section);
    drag.next=drag.controls?sectionLayoutResizeControls(d,drag.items,sectionLayoutControlsRows(d,drag.items)+dy):sectionLayoutGesture(drag.items,drag.key,(ev.clientX-drag.x+drag.left-rect.left)/drag.cell,dy,drag.resize);paint(drag.grid,drag.next);
  },true);
  view.addEventListener('pointerup',function(ev){
    if(!drag||ev.pointerId!==drag.pointer)return;ev.preventDefault();ev.stopPropagation();var finished=drag;cancel();
    if(finished.text!==opts.src.value){feedback('Source changed during the gesture; arrangement cancelled.');return;}
    if(JSON.stringify(finished.items)!==JSON.stringify(finished.next))persist(finished.section,finished.next);
    else fields(finished.handle.closest('.doc-sec'),rawDiagram(finished.section));
  },true);
  ['pointercancel','lostpointercapture'].forEach(function(type){view.addEventListener(type,cancel,true);});
  view.addEventListener('keydown',function(ev){
    var handle=ev.target.closest('.section-tile-move,.section-tile-resize,.section-controls-resize');if(!handle)return;
    if(ev.key==='Escape'){ev.preventDefault();ev.stopPropagation();cancel();return;}
    if(ev.altKey||ev.metaKey||ev.ctrlKey||['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].indexOf(ev.key)<0)return;
    ev.preventDefault();ev.stopPropagation();if(!ready())return;
    var section=handle.closest('.doc-sec'),index=Number(section.getAttribute('data-dv-section')),key=handle.closest('.section-layout-tile').getAttribute('data-layout-key'),controls=handle.classList.contains('section-controls-resize');
    if(controls && (ev.key==='ArrowLeft' || ev.key==='ArrowRight'))return;
    selected=key;var delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[ev.key];
    var resize=ev.shiftKey||handle.classList.contains('section-tile-resize');
    var items=currentItems(index),d=rawDiagram(index),next=controls?sectionLayoutResizeControls(d,items,sectionLayoutControlsRows(d,items)+delta[1]):sectionLayoutGesture(items,key,delta[0],delta[1],resize);
    if(persist(index,next))setTimeout(function(){
      if(editing!==index)return;refresh();
      var sec=view.querySelector('[data-dv-section="'+index+'"]');if(!sec)return;
      var tile=Array.prototype.find.call(sec.querySelectorAll('.section-layout-tile'),function(t){return t.getAttribute('data-layout-key')===key;});
      var focus=tile && tile.querySelector(controls?'.section-controls-resize':resize?'.section-tile-resize':'.section-tile-move');if(focus)focus.focus({preventScroll:true});
    },0);
  },true);
  view.addEventListener('click',function(ev){if(ev.target.closest('.section-tile-move,.section-tile-resize,.section-controls-resize')){ev.preventDefault();ev.stopPropagation();}},true);
  document.addEventListener('keydown',function(ev){if(drag&&ev.key==='Escape'){ev.preventDefault();ev.stopPropagation();cancel();}},true);
  window.addEventListener('blur',cancel);window.addEventListener('resize',cancel);opts.src.addEventListener('input',cancel);
  var query=new URLSearchParams(window.location.search).get('layout');if(['backstage','confluence'].indexOf(query)>=0)target.value=query;
  setFrame();return {refresh:refresh};
}
