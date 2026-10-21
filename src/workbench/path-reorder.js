/* Workbench-only path-chip ordering. The renderer owns ordinary path
   selection; this controller adds authoring gestures around those buttons. */
function createBuilderPathReorder(opts){
  var life=createWorkbenchLifetime(),view=opts.view,document=opts.document,window=opts.window,session=opts.session;
  var drag=null,suppressClick=false,cancelledPointer=null;
  function active(){return (!opts.isActive || opts.isActive()) && (!opts.disabled || !opts.disabled());}
  function sectionOf(chip){
    var section=chip && chip.closest('.doc-sec[data-dv-section]');
    return section?Number(section.getAttribute('data-dv-section')):NaN;
  }
  function visibleChips(chip){
    var controller=chip && chip.closest('.path-matrix,.path-timeline');
    if(!controller)return [];
    return Array.prototype.filter.call(controller.querySelectorAll('.path-chip[data-dv-path]'),function(item){
      return item.isConnected && (!item.getClientRects || item.getClientRects().length);
    }).sort(function(a,b){
      var ar=a.getBoundingClientRect(),br=b.getBoundingClientRect();
      return ar.top-br.top || ar.left-br.left;
    });
  }
  function findChip(section,pathId){
    var sec=view.querySelector('.doc-sec[data-dv-section="'+section+'"]');
    if(!sec)return null;
    return Array.prototype.find.call(sec.querySelectorAll('.path-chip[data-dv-path]'),function(chip){
      return chip.getAttribute('data-dv-path')===pathId && (!chip.getClientRects || chip.getClientRects().length);
    }) || null;
  }
  function decorate(chip){
    if(chip.hasAttribute('data-dv-path-reorder'))return;
    chip.setAttribute('data-dv-path-reorder','true');
    chip.setAttribute('data-dv-path-reorder-title',chip.getAttribute('title') || '');
    chip.setAttribute('title',(chip.getAttribute('title') || chip.textContent.trim())+' — drag to reorder; Alt+Up/Down also moves it');
    chip.setAttribute('aria-keyshortcuts','Alt+ArrowUp Alt+ArrowDown');
  }
  function undecorate(chip){
    if(!chip.hasAttribute('data-dv-path-reorder'))return;
    var title=chip.getAttribute('data-dv-path-reorder-title');
    if(title)chip.setAttribute('title',title);else chip.removeAttribute('title');
    chip.removeAttribute('data-dv-path-reorder-title');chip.removeAttribute('data-dv-path-reorder');
    chip.removeAttribute('aria-keyshortcuts');
    chip.classList.remove('dv-path-dragging','dv-path-drop-before','dv-path-drop-after');
  }
  function refresh(){
    if(drag && (!drag.chip.isConnected || drag.chip.closest('.path-matrix,.path-timeline')!==drag.controller))cancel();
    Array.prototype.forEach.call(view.querySelectorAll('.path-chip[data-dv-path]'),decorate);
  }
  function clearDrop(current){
    var d=current || drag;if(!d)return;
    (d.chips || []).forEach(function(chip){chip.classList.remove('dv-path-drop-before','dv-path-drop-after');});
    d.drop=null;
  }
  function release(current){
    if(!current || !current.chip || current.pointerId==null)return;
    try{if(current.chip.hasPointerCapture && current.chip.hasPointerCapture(current.pointerId))current.chip.releasePointerCapture(current.pointerId);}catch(_){ }
  }
  function cancel(holdClick){
    if(!drag)return;
    var current=drag;drag=null;clearDrop(current);
    current.chip.classList.remove('dv-path-dragging');current.controller.classList.remove('dv-path-reordering');
    release(current);
    if(holdClick && current.moved){suppressClick=true;cancelledPointer=current.pointerId;}
  }
  function sourceOrder(snapshot,section){
    if(!snapshot || snapshot.error)return null;
    var record=specSectionPaths(snapshot.raw)[section],diagram=record && specValueAt(snapshot.raw,record.diagram);
    return diagram && Array.isArray(diagram.paths)?diagram.paths.map(function(path){return path && path.id;}):null;
  }
  function dropAt(current,clientY){
    var bounds=current.controller.getBoundingClientRect();
    if(current.clientX<bounds.left || current.clientX>bounds.right || clientY<bounds.top || clientY>bounds.bottom)return null;
    var others=current.chips.filter(function(chip){return chip!==current.chip;}),target,placement;
    if(!others.length)return null;
    for(var i=0;i<others.length;i++){
      var rect=others[i].getBoundingClientRect();
      if(clientY<rect.top+rect.height/2){target=others[i];placement='before';break;}
    }
    if(!target){target=others[others.length-1];placement='after';}
    return {chip:target,pathId:target.getAttribute('data-dv-path'),placement:placement};
  }
  function paintDrop(current,next){
    clearDrop(current);if(!next)return;
    var plan=planReorderPath(current.snapshot.text,current.snapshot.raw,current.section,current.pathId,next.pathId,next.placement);
    if(plan.error || plan.noop)return;
    current.drop=next;next.chip.classList.add(next.placement==='before'?'dv-path-drop-before':'dv-path-drop-after');
  }
  function focusPath(section,pathId){
    var chip=findChip(section,pathId);if(chip)chip.focus({preventScroll:true});
  }
  function commit(plan,snapshot,section,pathId){
    if(plan.error){if(opts.message)opts.message(plan.error);return false;}
    if(plan.noop)return false;
    return opts.apply(plan,{after:function(){focusPath(section,pathId);}},snapshot);
  }
  function stale(current,snapshot){
    if(!snapshot || snapshot.error || snapshot.text!==current.snapshot.text || snapshot.project!==current.snapshot.project)return true;
    if(snapshot.renderedText!=null && snapshot.renderedText!==snapshot.text)return true;
    if(!current.chip.isConnected)return true;
    return JSON.stringify(sourceOrder(snapshot,current.section))!==current.order;
  }
  life.listen(view,'pointerdown',function(event){
    if(!active() || event.button!==0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || !event.target.closest)return;
    var chip=event.target.closest('.path-chip[data-dv-path][data-dv-path-reorder]');
    if(!chip || !view.contains(chip) || chip.closest('[data-dv-detail-preview]'))return;
    var section=sectionOf(chip),snapshot=session.snapshot(),chips=visibleChips(chip),order=sourceOrder(snapshot,section);
    if(!Number.isInteger(section) || snapshot.error || snapshot.renderedText!=null && snapshot.renderedText!==snapshot.text || chips.length<2 || !order)return;
    if(opts.pause)opts.pause();
    drag={chip:chip,controller:chip.closest('.path-matrix,.path-timeline'),chips:chips,section:section,pathId:chip.getAttribute('data-dv-path'),
      pointerId:event.pointerId,x0:event.clientX,y0:event.clientY,moved:false,drop:null,snapshot:snapshot,order:JSON.stringify(order)};
    try{chip.setPointerCapture(event.pointerId);}catch(_){ }
  });
  life.listen(window,'pointermove',function(event){
    if(!drag || event.pointerId!==drag.pointerId)return;
    var dx=event.clientX-drag.x0,dy=event.clientY-drag.y0;
    if(!drag.moved && dx*dx+dy*dy<=25)return;
    if(!drag.moved){drag.moved=true;drag.chip.classList.add('dv-path-dragging');drag.controller.classList.add('dv-path-reordering');}
    event.preventDefault();drag.clientX=event.clientX;paintDrop(drag,dropAt(drag,event.clientY));
  });
  life.listen(window,'pointerup',function(event){
    if(cancelledPointer===event.pointerId){cancelledPointer=null;life.delay(function(){suppressClick=false;},0);return;}
    if(!drag || event.pointerId!==drag.pointerId)return;
    var current=drag,moved=current.moved,drop=current.drop;cancel(false);
    if(!moved)return;
    suppressClick=true;life.delay(function(){suppressClick=false;},0);
    if(!drop)return;
    var snapshot=session.snapshot();
    if(stale(current,snapshot)){if(opts.message)opts.message('The source or preview changed during the drag. Path move cancelled.');return;}
    commit(planReorderPath(snapshot.text,snapshot.raw,current.section,current.pathId,drop.pathId,drop.placement),snapshot,current.section,current.pathId);
  });
  life.listen(view,'click',function(event){
    if(!suppressClick || !event.target.closest || !event.target.closest('.path-chip[data-dv-path]'))return;
    suppressClick=false;event.preventDefault();event.stopImmediatePropagation();
  },true);
  life.listen(view,'keydown',function(event){
    if(!active() || !event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || (event.key!=='ArrowUp' && event.key!=='ArrowDown') || !event.target.closest)return;
    var chip=event.target.closest('.path-chip[data-dv-path][data-dv-path-reorder]');
    if(!chip || !view.contains(chip) || chip.closest('[data-dv-detail-preview]'))return;
    event.preventDefault();event.stopPropagation();
    var chips=visibleChips(chip),at=chips.indexOf(chip),delta=event.key==='ArrowUp'?-1:1,target=chips[at+delta];
    if(!target)return;
    var section=sectionOf(chip),snapshot=session.snapshot();
    if(snapshot.error || snapshot.renderedText!=null && snapshot.renderedText!==snapshot.text){if(opts.message)opts.message('Render the current JSON before moving a path.');return;}
    if(opts.pause)opts.pause();
    commit(planReorderPath(snapshot.text,snapshot.raw,section,chip.getAttribute('data-dv-path'),target.getAttribute('data-dv-path'),delta<0?'before':'after'),snapshot,section,chip.getAttribute('data-dv-path'));
  });
  life.listen(view,'dv:pathrender',refresh);
  life.listen(window,'pointercancel',function(event){if(drag && event.pointerId===drag.pointerId)cancel(false);});
  life.listen(view,'lostpointercapture',function(event){if(drag && event.pointerId===drag.pointerId)cancel(true);},true);
  life.listen(window,'blur',function(){cancel(true);});
  life.listen(window,'keydown',function(event){if(event.key==='Escape' && drag){cancel(true);event.preventDefault();event.stopImmediatePropagation();}},true);
  life.listen(opts.src,'input',function(){cancel(true);});
  refresh();
  return {
    refresh:life.guard(refresh),beforeReplace:life.guard(function(){cancel(true);}),retire:life.guard(function(){cancel(false);suppressClick=false;cancelledPointer=null;}),
    busy:function(){return life.alive() && !!drag;},
    destroy:function(){if(!life.alive())return;cancel(false);Array.prototype.forEach.call(view.querySelectorAll('[data-dv-path-reorder]'),undecorate);life.destroy();}
  };
}
