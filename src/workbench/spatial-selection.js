/* Workbench-only Explore gestures. Viewer panels and graph nodes share authored
   selection; this owner keeps all menus, capture and marquee DOM transient. */
function createBuilderSpatialSelection(opts){
  var life=createWorkbenchLifetime(),doc=opts.document,win=opts.window,view=opts.view,menu=null,menuLife=null,opener=null,marquee=null,swallow=false,focusNodes=[];
  function active(){return !opts.isActive || opts.isActive();}
  function surface(el){return el && el.closest && el.closest('.viewport-explore');}
  function snapshot(){var s=opts.session.snapshot();return !s.error && (s.renderedText==null || s.renderedText===s.text)?s:null;}
  function target(el){
    var shell=surface(el),sec=shell && shell.closest('.doc-sec');if(!sec || el.closest('[data-dv-detail-preview]'))return null;
    var section=Number(sec.getAttribute('data-dv-section')),s=snapshot();if(!s)return null;
    var got=builderDiagram(s.text,s.raw,section);if(got.error)return null;
    var panel=el.closest('.explore-canvas-objects [data-explore-panel]');
    if(panel){var id=panel.getAttribute('data-explore-panel'),index=(got.d.panels || []).findIndex(function(p){return p.id===id;});return index<0?null:{kind:'panel',id:id,index:index,section:section,el:panel};}
    var node=el.closest('[data-dv-node]');if(node && Object.prototype.hasOwnProperty.call(got.d.nodes || {},node.getAttribute('data-dv-node')))return {kind:'node',id:node.getAttribute('data-dv-node'),section:section,el:node};
    var existing=opts.targetFromEvent({target:el});return existing && ['edge','group'].indexOf(existing.kind)>=0?existing:null;
  }
  function restoreFocusNodes(){
    focusNodes.forEach(function(record){Object.keys(record.attrs).forEach(function(name){var value=record.attrs[name];if(value===null)record.el.removeAttribute(name);else record.el.setAttribute(name,value);});});
    focusNodes=[];
  }
  function refresh(){
    restoreFocusNodes();
    // Render decoration runs before the session publishes its fresh preview
    // identity and before welcome reveals the editor. Mutation still uses the
    // stricter snapshot()/active() checks when the menu is actually invoked.
    var s=opts.session.snapshot();if(s.error)return;
    Array.from(view.querySelectorAll('.viewport-explore .boardcanvas g.node[data-dv-node]')).forEach(function(el){
      var section=el.closest('.doc-sec'),id=el.getAttribute('data-dv-node');
      if(!section || el.closest('[data-dv-detail-preview]'))return;
      var got=builderDiagram(s.text,s.raw,Number(section.getAttribute('data-dv-section')));
      if(got.error || !Object.prototype.hasOwnProperty.call(got.d.nodes || {},id))return;
      var attrs={},values={tabindex:'0',role:'group','aria-label':((got.d.nodes[id] || {}).title || id)+' node','aria-haspopup':'menu','aria-keyshortcuts':'Shift+F10','data-dv-object-menu':''};
      Object.keys(values).forEach(function(name){attrs[name]=el.getAttribute(name);el.setAttribute(name,values[name]);});
      focusNodes.push({el:el,attrs:attrs});
    });
  }
  function candidates(shell){return Array.from(shell.querySelectorAll('.boardcanvas [data-dv-node],.explore-canvas-objects [data-explore-panel]')).map(target).filter(function(t){var r=t && t.el.getBoundingClientRect();return r && r.width>0 && r.height>0 && t.el.getClientRects().length;});}
  function layoutId(shell){var p=shell.querySelector('[data-explore-layout]');return p && p.getAttribute('data-explore-layout');}
  function rects(targets,shell){
    var svg=shell.querySelector('.boardcanvas > svg'),matrix=svg && svg.getScreenCTM();if(!matrix)return [];
    var inverse=matrix.inverse();return targets.map(function(t){var el=t.el,r=el && el.getBoundingClientRect();if(!r)return null;var a=new win.DOMPoint(r.left,r.top).matrixTransform(inverse),b=new win.DOMPoint(r.right,r.bottom).matrixTransform(inverse);return {x:a.x,y:a.y,w:b.x-a.x,h:b.y-a.y};});
  }
  function close(focus){if(menuLife)menuLife.destroy();menuLife=null;if(menu)menu.remove();menu=null;var el=opener;opener=null;if(focus && el && el.isConnected)el.focus({preventScroll:true});}
  function cancel(){if(!marquee)return;var m=marquee;marquee=null;if(m.box)m.box.remove();try{if(m.board.hasPointerCapture(m.id))m.board.releasePointerCapture(m.id);}catch(_){} }
  function clear(){close(false);cancel();swallow=false;}
  function currentTargets(){return opts.selection().map(function(t){if(t.kind==='panel' && t.el){var shell=surface(t.el),card=shell && Array.from(shell.querySelectorAll('.explore-canvas-objects [data-explore-panel]')).find(function(el){return el.contains(t.el);});if(card){var authored=target(card);if(authored)return authored;}}if(t.kind!=='panel' || t.id)return t;var s=snapshot(),got=s && builderDiagram(s.text,s.raw,t.section),p=got && !got.error && (got.d.panels || [])[t.index];return Object.assign({},t,{id:p && p.id});});}
  function open(ev){
    if(!active() || opts.busy())return;var t=target(ev.target);if(!t)return;
    ev.preventDefault();ev.stopPropagation();close(false);cancel();
    var targets=currentTargets();if(!targets.some(function(x){return x.section===t.section && x.kind===t.kind && (t.id!=null?x.id===t.id:x.index===t.index);})) {opts.select([t]);targets=currentTargets();}
    var shell=surface(t.el),s=snapshot();if(!s)return;
    var id=layoutId(shell),geometry=rects(targets,shell),spatial=targets.every(function(x){return x.kind==='node' || x.kind==='panel';});
    var alignment=planAlignSpatial(s.text,s.raw,targets,id,'horizontal',geometry);
    menu=doc.createElement('div');menu.className='dv-object-menu';menu.setAttribute('role','menu');menu.setAttribute('aria-label','Object actions');
    menuLife=createWorkbenchLifetime();opener=doc.activeElement;
    function item(label,action,reason){var button=doc.createElement('button');button.type='button';button.setAttribute('role','menuitem');button.textContent=label;button.tabIndex=-1;
      if(reason){button.setAttribute('aria-disabled','true');button.title=reason;var note=doc.createElement('small');note.textContent=reason;button.appendChild(note);}
      menuLife.listen(button,'click',function(e){e.stopPropagation();if(reason)return;close(false);if(opts.session.text()!==s.text)return;action();});menu.appendChild(button);return button;
    }
    item('Inspect',function(){opts.inspect();});
    item('Delete',function(){var plan=planBulkDelete(s.text,targets);if(opts.apply(plan,null,s))opts.select([]);},!spatial && targets.length>1?'Select one kind to delete.':null);
    item('Duplicate',function(){opts.apply(planDuplicateSpatial(s.text,s.raw,targets,id,geometry),null,s);},spatial?null:'Duplicate supports nodes and canvas panels.');
    ['horizontal','vertical'].forEach(function(direction){item('Align '+(direction==='horizontal'?'horizontally':'vertically'),function(){opts.apply(planAlignSpatial(s.text,s.raw,targets,id,direction,geometry),null,s);},alignment.error);});
    shell.appendChild(menu);var r=menu.getBoundingClientRect(),bounds=shell.getBoundingClientRect(),x=ev.clientX||t.el.getBoundingClientRect().left,y=ev.clientY||t.el.getBoundingClientRect().top;
    menu.style.left=Math.max(8,bounds.left,Math.min(x,Math.min(win.innerWidth,bounds.right)-r.width-8))+'px';menu.style.top=Math.max(8,bounds.top,Math.min(y,Math.min(win.innerHeight,bounds.bottom)-r.height-8))+'px';
    var items=Array.from(menu.querySelectorAll('button'));items[0].tabIndex=0;items[0].focus({preventScroll:true});
    menuLife.listen(menu,'keydown',function(e){var index=items.indexOf(doc.activeElement),next=index;
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(true);return;}
      if(e.key==='Tab'){close(false);return;}
      if(e.key==='ArrowDown')next=(index+1)%items.length;else if(e.key==='ArrowUp')next=(index+items.length-1)%items.length;else if(e.key==='Home')next=0;else if(e.key==='End')next=items.length-1;else return;
      e.preventDefault();items.forEach(function(b,i){b.tabIndex=i===next?0:-1;});items[next].focus();
    });
    menuLife.listen(doc,'pointerdown',function(e){if(menu && !menu.contains(e.target))close(false);},true);
    menuLife.listen(doc,'focusin',function(e){if(menu && !menu.contains(e.target))close(false);});
    menuLife.listen(win,'resize',function(){close(false);});
    var board=shell.querySelector('.explore-board'),scrollLeft=board && board.scrollLeft,scrollTop=board && board.scrollTop;
    menuLife.listen(shell,'scroll',function(e){if(e.target===board && (board.scrollLeft!==scrollLeft || board.scrollTop!==scrollTop))close(false);},true);
  }
  life.listen(view,'contextmenu',open,true);
  life.listen(view,'keydown',function(ev){
    if(ev.key!=='ContextMenu' && !(ev.key==='F10' && ev.shiftKey && !ev.ctrlKey && !ev.altKey && !ev.metaKey))return;
    var node=ev.target.closest && ev.target.closest('g.node[data-dv-object-menu]');
    if(node===ev.target)open(ev);
  },true);
  life.listen(view,'pointerdown',function(ev){
    if(!active() || opts.busy() || ev.button!==0 || !ev.altKey || ev.ctrlKey || ev.metaKey || ev.shiftKey)return;
    var board=ev.target.closest('.explore-board'),shell=surface(ev.target);if(!board || !shell || !snapshot())return;
    if(ev.target.closest('.explore-window,.explore-player,.explore-tools,a,button,input,select,textarea,[contenteditable],[role="button"],[data-dv-node],[data-dv-edge],[data-dv-step],[data-dv-group],[data-dv-row]'))return;
    ev.preventDefault();ev.stopImmediatePropagation();close(false);marquee={board:board,shell:shell,id:ev.pointerId,x:ev.clientX,y:ev.clientY,text:opts.session.text()};board.setPointerCapture(ev.pointerId);
  },true);
  life.listen(win,'pointermove',function(ev){
    var m=marquee;if(!m || ev.pointerId!==m.id)return;
    if(opts.session.text()!==m.text){cancel();return;}
    if(!m.box && Math.hypot(ev.clientX-m.x,ev.clientY-m.y)<5)return;
    if(!m.box){m.box=doc.createElement('div');m.box.className='dv-selection-marquee';m.shell.appendChild(m.box);}
    m.rect={left:Math.min(m.x,ev.clientX),top:Math.min(m.y,ev.clientY),right:Math.max(m.x,ev.clientX),bottom:Math.max(m.y,ev.clientY)};
    Object.assign(m.box.style,{left:m.rect.left+'px',top:m.rect.top+'px',width:(m.rect.right-m.rect.left)+'px',height:(m.rect.bottom-m.rect.top)+'px'});ev.preventDefault();
  },true);
  life.listen(win,'pointerup',function(ev){var m=marquee;if(!m || ev.pointerId!==m.id)return;ev.preventDefault();ev.stopImmediatePropagation();swallow=true;
    if(m.rect){var r=m.rect,selected=candidates(m.shell).filter(function(t){var b=t.el.getBoundingClientRect();return b.right>=r.left && b.left<=r.right && b.bottom>=r.top && b.top<=r.bottom;});opts.select(selected);}
    cancel();
  },true);
  life.listen(view,'click',function(ev){if(swallow){swallow=false;ev.preventDefault();ev.stopImmediatePropagation();}},true);
  life.listen(doc,'keydown',function(ev){if(ev.key==='Escape' && !menu && !marquee && active() && surface(ev.target) && !ev.target.closest('dialog,[data-dv-detail-preview]')){opts.select([]);return;}if(ev.key==='Escape' && marquee){ev.preventDefault();ev.stopImmediatePropagation();cancel();opts.select([]);swallow=true;}},true);
  life.listen(win,'pointercancel',cancel);life.listen(win,'blur',clear);
  life.listen(view,'lostpointercapture',function(ev){if(marquee && ev.pointerId===marquee.id)cancel();},true);
  life.listen(opts.src,'input',function(){clear();opts.select([]);});
  life.listen(view,'click',function(ev){if(ev.target.closest('[data-view-layout]')){clear();opts.select([]);}},true);
  life.listen(view,'dv:pathchange',clear);
  return {target:target,clear:clear,refresh:refresh,busy:function(){return !!marquee;},destroy:function(){life.destroy();clear();restoreFocusNodes();}};
}
