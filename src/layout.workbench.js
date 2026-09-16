/* Authored section layouts are spec data; host preview dimensions are workspace
   state. Pointer previews never write source until one successful release. */
function planSectionLayout(text,raw,section,target,items){
  var got=builderDiagram(text,raw,section);
  if(got.error)return got;
  if(['default','backstage','confluence'].indexOf(target)<0)return {error:'Unknown layout target.'};
  var layouts=builderClone(got.d.sectionLayout || {});
  if(items===null)delete layouts[target];else layouts[target]=items;
  var copy=Object.assign({},got.d,{sectionLayout:layouts}),warnings=[];
  sectionLayoutWarnings(copy,'diagram',warnings);
  if(warnings.length)return {error:warnings.join('\n')};
  return planSetField(text,raw,got.path,'sectionLayout',Object.keys(layouts).length?JSON.stringify(layouts):null);
}
function sectionLayoutGesture(items,key,dx,dy,resize){
  var next=items.map(function(it){return Object.assign({},it);}),item=next.find(function(it){return sectionLayoutKey(it)===key;});
  if(!item)return next;
  if(resize){item.w=Math.max(1,Math.min(12-item.x,item.w+Math.round(dx)));item.h=Math.max(3,Math.min(40,item.h+Math.round(dy)));}
  else{item.x=Math.max(0,Math.min(12-item.w,item.x+Math.round(dx)));item.y=Math.max(0,Math.min(500,item.y+Math.round(dy)));}
  return sectionLayoutPack(next,key);
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
function initSectionLayoutEditor(opts){
  var view=opts.view,editing=null,drag=null,selected='diagram',widths={backstage:1080,confluence:760};
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
  function persist(index,items){
    if(!ready())return false;
    var ok=opts.commit(index,target.value,items);if(ok)feedback('Saved '+target.options[target.selectedIndex].text+' layout · Undo restores the previous arrangement.');
    return ok;
  }
  function forceLayout(index){
    var ctl=opts.ctl && opts.ctl(),rec=ctl && ctl.sections.find(function(r){return r.number===index+1;});
    if(rec && rec.presentation)rec.presentation.setMode('layout');
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
    grid.querySelectorAll('.section-layout-tile').forEach(function(tile){
      var item=items.find(function(it){return sectionLayoutKey(it)===tile.getAttribute('data-layout-key');});if(!item)return;
      tile.style.setProperty('--tile-x',item.x+1);tile.style.setProperty('--tile-y',item.y+1);tile.style.setProperty('--tile-w',item.w);tile.style.setProperty('--tile-h',item.h);
    });
  }
  function cancel(){
    if(!drag)return;var prior=drag;drag=null;paint(prior.grid,prior.items);
    if(prior.handle.hasPointerCapture(prior.pointer))prior.handle.releasePointerCapture(prior.pointer);
    prior.grid.classList.remove('layout-dragging');
  }
  function fields(section,d){
    var row=section.querySelector('.section-arrange-fields');if(!row)return;row.replaceChildren();
    var items=sectionLayoutItems(d,target.value);if(!items)return;
    var choose=el('select');choose.setAttribute('aria-label','Layout element');
    sectionLayoutTiles(d).filter(function(t){return items.some(function(it){return sectionLayoutKey(it)===t.key;});}).forEach(function(t){var o=el('option',null,t.title);o.value=t.key;choose.appendChild(o);});
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
          var current=rawDiagram(index),items=sectionLayoutItems(current,target.value);
          if(!items)persist(index,sectionLayoutPreset(current,target.value));else{
            var detached=sectionLayoutDetachSteps(current,items);
            if(detached!==items)persist(index,detached);else{forceLayout(index);refresh();}
          }
        });arrange.setAttribute('data-arrange-toggle','');controls.appendChild(arrange);
        controls.appendChild(button('Optimize layout',function(){if(!ready())return;editing=index;persist(index,sectionLayoutPreset(rawDiagram(index),target.value));}));
        controls.appendChild(button('Reset layout',function(){if(!ready())return;editing=null;persist(index,null);}));
        var caption=el('span','fnote');caption.setAttribute('data-arrange-target','');controls.appendChild(caption);
        actions.appendChild(el('div','section-arrange-fields'));
        actions.addEventListener('click',function(ev){ev.stopPropagation();});actions.addEventListener('pointerdown',function(ev){ev.stopPropagation();});
        var board=section.querySelector('.diagram-views,.boardgrid');section.insertBefore(actions,board);
      }
      actions.querySelector('[data-arrange-toggle]').textContent=editing===index?'Done arranging':'Arrange section';
      actions.querySelector('[data-arrange-toggle]').setAttribute('aria-pressed',String(editing===index));
      actions.querySelector('[data-arrange-target]').textContent='Editing '+target.options[target.selectedIndex].text+' layout';
      actions.querySelector('.section-arrange-fields').hidden=editing!==index;
      section.classList.toggle('section-arranging',editing===index);
      if(editing===index){
        forceLayout(index);fields(section,d);
        section.querySelectorAll('.section-layout-tile').forEach(function(tile){
          if(tile.querySelector('.section-tile-move'))return;
          var name=tile.getAttribute('data-layout-label');
          var move=el('button','section-tile-move','⠿ '+name);move.type='button';move.setAttribute('aria-label','Move '+name);move.title='Drag to move. Arrow keys move; Shift + arrows resize.';tile.appendChild(move);
          var resize=el('button','section-tile-resize','↘');resize.type='button';resize.setAttribute('aria-label','Resize '+name);resize.title='Drag to resize; arrow keys also resize.';tile.appendChild(resize);
        });
      }
    });
  }
  view.addEventListener('pointerdown',function(ev){
    var handle=ev.target.closest('.section-tile-move,.section-tile-resize');if(!handle || ev.button!==0 || ev.isPrimary===false)return;
    var section=handle.closest('.doc-sec'),index=Number(section.getAttribute('data-dv-section'));if(editing!==index||!ready())return;
    var grid=handle.closest('.section-layout-grid');if(getComputedStyle(grid).display!=='grid'){feedback('Use size / position fields on narrow screens, or widen the preview to drag.');return;}
    ev.preventDefault();ev.stopPropagation();cancel();selected=handle.parentNode.getAttribute('data-layout-key');
    var items=sectionLayoutItems(rawDiagram(index),target.value),rect=grid.getBoundingClientRect();
    drag={handle:handle,grid:grid,section:index,key:selected,items:items,next:items,text:opts.src.value,x:ev.clientX,y:ev.clientY,left:rect.left,top:rect.top,pointer:ev.pointerId,resize:handle.classList.contains('section-tile-resize'),cell:(grid.clientWidth+8)/12};
    handle.setPointerCapture(ev.pointerId);grid.classList.add('layout-dragging');
  },true);
  view.addEventListener('pointermove',function(ev){
    if(!drag||ev.pointerId!==drag.pointer)return;ev.preventDefault();
    var rect=drag.grid.getBoundingClientRect();
    drag.next=sectionLayoutGesture(drag.items,drag.key,(ev.clientX-drag.x+drag.left-rect.left)/drag.cell,(ev.clientY-drag.y+drag.top-rect.top)/40,drag.resize);paint(drag.grid,drag.next);
  },true);
  view.addEventListener('pointerup',function(ev){
    if(!drag||ev.pointerId!==drag.pointer)return;ev.preventDefault();ev.stopPropagation();var finished=drag;cancel();
    if(finished.text!==opts.src.value){feedback('Source changed during the gesture; arrangement cancelled.');return;}
    if(JSON.stringify(finished.items)!==JSON.stringify(finished.next))persist(finished.section,finished.next);
    else fields(finished.handle.closest('.doc-sec'),rawDiagram(finished.section));
  },true);
  ['pointercancel','lostpointercapture'].forEach(function(type){view.addEventListener(type,cancel,true);});
  view.addEventListener('keydown',function(ev){
    var handle=ev.target.closest('.section-tile-move,.section-tile-resize');if(!handle)return;
    if(ev.key==='Escape'){ev.preventDefault();ev.stopPropagation();cancel();return;}
    if(ev.altKey||ev.metaKey||ev.ctrlKey||['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].indexOf(ev.key)<0)return;
    ev.preventDefault();ev.stopPropagation();if(!ready())return;
    var section=handle.closest('.doc-sec'),index=Number(section.getAttribute('data-dv-section')),key=handle.parentNode.getAttribute('data-layout-key');
    selected=key;var delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[ev.key];
    var resize=ev.shiftKey||handle.classList.contains('section-tile-resize');
    if(persist(index,sectionLayoutGesture(sectionLayoutItems(rawDiagram(index),target.value),key,delta[0],delta[1],resize)))setTimeout(function(){
      if(editing!==index)return;refresh();
      var sec=view.querySelector('[data-dv-section="'+index+'"]');if(!sec)return;
      var tile=Array.prototype.find.call(sec.querySelectorAll('.section-layout-tile'),function(t){return t.getAttribute('data-layout-key')===key;});
      var focus=tile && tile.querySelector(resize?'.section-tile-resize':'.section-tile-move');if(focus)focus.focus({preventScroll:true});
    },0);
  },true);
  view.addEventListener('click',function(ev){if(ev.target.closest('.section-tile-move,.section-tile-resize')){ev.preventDefault();ev.stopPropagation();}},true);
  document.addEventListener('keydown',function(ev){if(drag&&ev.key==='Escape'){ev.preventDefault();ev.stopPropagation();cancel();}},true);
  window.addEventListener('blur',cancel);window.addEventListener('resize',cancel);opts.src.addEventListener('input',cancel);
  var query=new URLSearchParams(window.location.search).get('layout');if(['backstage','confluence'].indexOf(query)>=0)target.value=query;
  setFrame();return {refresh:refresh};
}
