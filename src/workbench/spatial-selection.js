/* Workbench-only Explore gestures. Viewer panels and graph nodes share authored
   selection; this owner keeps all menus, capture and marquee DOM transient. */
function createBuilderSpatialSelection(opts){
  var life=createWorkbenchLifetime(),doc=opts.document,win=opts.window,view=opts.view,menu=null,menuLife=null,opener=null,marquee=null,swallow=false,focusNodes=[],nudge=null,status=null;
  var fitButton=doc.getElementById?doc.getElementById('workspace-fit-selection'):null;
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
    Array.from(view.querySelectorAll('.viewport-explore .boardcanvas g.node[data-dv-node],.viewport-explore .explore-canvas-objects [data-explore-panel]')).forEach(function(el){
      var section=el.closest('.doc-sec'),panel=el.hasAttribute('data-explore-panel'),id=el.getAttribute(panel?'data-explore-panel':'data-dv-node');
      if(!section || el.closest('[data-dv-detail-preview]'))return;
      var got=builderDiagram(s.text,s.raw,Number(section.getAttribute('data-dv-section')));
      if(got.error)return;
      var value=panel?(got.d.panels || []).find(function(p){return p.id===id;}):(got.d.nodes || {})[id];if(!value)return;
      var help='Enter selects; Shift+Enter adds or removes; arrows move 10 graph units, Shift+arrows 50; release arrows to commit; Escape cancels; Shift+F10 opens actions.';
      if(!panel && !(got.d.floats || []).some(function(f){return f.id===id;}))help='Row nodes follow the row layout. Use Free placement to move this node. '+help;
      var attrs={},values={tabindex:'0',role:'group','aria-label':(value.title || id)+(panel?' canvas panel':' node'),'aria-haspopup':'menu','aria-keyshortcuts':'Enter Shift+Enter ArrowUp ArrowDown ArrowLeft ArrowRight Shift+F10','aria-description':help,title:help,'data-dv-object-menu':''};
      Object.keys(values).forEach(function(name){attrs[name]=el.getAttribute(name);el.setAttribute(name,values[name]);});
      focusNodes.push({el:el,attrs:attrs});
    });
    sync();
  }
  function candidates(shell){return Array.from(shell.querySelectorAll('.boardcanvas [data-dv-node],.explore-canvas-objects [data-explore-panel]')).map(target).filter(function(t){var r=t && t.el.getBoundingClientRect();return r && r.width>0 && r.height>0 && t.el.getClientRects().length;});}
  function layoutId(shell){var p=shell.querySelector('[data-explore-layout]');return p && p.getAttribute('data-explore-layout');}
  function rects(targets,shell){
    var svg=shell.querySelector('.boardcanvas > svg'),matrix=svg && svg.getScreenCTM();if(!matrix)return [];
    var inverse=matrix.inverse();return targets.map(function(t){var el=t.el,r=el && el.getBoundingClientRect();if(!r)return null;var a=new win.DOMPoint(r.left,r.top).matrixTransform(inverse),b=new win.DOMPoint(r.right,r.bottom).matrixTransform(inverse);return {x:a.x,y:a.y,w:b.x-a.x,h:b.y-a.y};});
  }
  function close(focus){if(menuLife)menuLife.destroy();menuLife=null;if(menu)menu.remove();menu=null;var el=opener;opener=null;if(focus && el && el.isConnected)el.focus({preventScroll:true});}
  function cancel(){if(!marquee)return;var m=marquee;marquee=null;if(m.box)m.box.remove();try{if(m.board.hasPointerCapture(m.id))m.board.releasePointerCapture(m.id);}catch(_){} }
  function clear(){close(false);cancel();cancelNudge();if(status)status.remove();status=null;swallow=false;sync();}
  function currentTargets(){return opts.selection().map(function(t){if(t.kind==='panel' && t.el){var shell=surface(t.el),card=shell && Array.from(shell.querySelectorAll('.explore-canvas-objects [data-explore-panel]')).find(function(el){return el.contains(t.el);});if(card){var authored=target(card);if(authored)return authored;}}if(t.kind!=='panel' || t.id)return t;var s=snapshot(),got=s && builderDiagram(s.text,s.raw,t.section),p=got && !got.error && (got.d.panels || [])[t.index];return Object.assign({},t,{id:p && p.id});});}
  function context(){
    var targets=currentTargets(),shell=targets.length && surface(targets[0].el),s=snapshot();
    if(!s || !shell || targets.some(function(t){return !t.el || surface(t.el)!==shell || !t.el.isConnected || !t.el.getClientRects().length || ['node','panel'].indexOf(t.kind)<0;}))return null;
    var geometry=rects(targets,shell);if(geometry.length!==targets.length || geometry.some(function(r){return !r || r.w<=0 || r.h<=0;}))return null;
    return {targets:targets,shell:shell,s:s,id:layoutId(shell),geometry:geometry};
  }
  function fitSelection(){
    var c=context();if(!active() || !c)return;
    var rs=c.geometry,x=Math.min.apply(null,rs.map(function(r){return r.x;})),y=Math.min.apply(null,rs.map(function(r){return r.y;}));
    view.dispatchEvent(new win.CustomEvent('workbench-fit-selection',{detail:{x:x,y:y,w:Math.max.apply(null,rs.map(function(r){return r.x+r.w;}))-x,h:Math.max.apply(null,rs.map(function(r){return r.y+r.h;}))-y}}));
  }
  function sync(){if(status){status.remove();status=null;}if(fitButton){var c=life.alive()?context():null;fitButton.disabled=!c;fitButton.title=c?'Frame selected nodes and canvas panels':'Select visible nodes or canvas panels to fit.';}}
  function distribute(direction){var c=context();if(!active() || !c)return;opts.apply(planDistributeSpatial(c.s.text,c.s.raw,c.targets,c.id,direction,c.geometry),null,c.s);}
  function actions(host,lifetime){
    var c=context();sync();if(!c)return;
    var box=doc.createElement('div');box.className='iactions dv-spatial-actions';host.appendChild(box);
    var fit=doc.createElement('button');fit.type='button';fit.className='bbtn';fit.textContent='Fit selection';box.appendChild(fit);lifetime.listen(fit,'click',fitSelection);
    var entries=[];
    ['horizontal','vertical'].forEach(function(direction){var button=doc.createElement('button');button.type='button';button.className='bbtn';button.textContent='Distribute '+(direction==='horizontal'?'horizontally':'vertically');box.appendChild(button);entries.push({button:button,direction:direction});lifetime.listen(button,'click',function(){distribute(direction);});});
    var note=doc.createElement('p');note.className='fnote';box.appendChild(note);
    function update(){var current=context(),reasons=[];fit.disabled=!current;entries.forEach(function(entry){var reason=current?planDistributeSpatial(current.s.text,current.s.raw,current.targets,current.id,entry.direction,current.geometry).error:'Render and select the objects again.';entry.button.disabled=!!reason;entry.button.title=reason || 'Keep outer bounds and equalize visual gaps.';if(reason && reasons.indexOf(reason)<0)reasons.push(reason);});note.textContent='Tab to an object; Enter selects, Shift+Enter adds or removes. Arrows move 10 graph units; Shift+arrows move 50. Release arrows for one Undo action. '+reasons.join(' ');}
    update();lifetime.listen(opts.src,'input',update);
  }
  function announce(message,shell){if(status)status.remove();status=doc.createElement('div');status.className='dv-spatial-status';status.setAttribute('role','status');status.textContent=message;shell.appendChild(status);}
  function cancelNudge(){if(!nudge)return;var g=nudge;nudge=null;g.preview.forEach(function(p){if(p.node){if(p.transform===null)p.el.removeAttribute('transform');else p.el.setAttribute('transform',p.transform);}else p.el.style.transform=p.transform;});}
  function finishNudge(){
    if(!nudge)return;var g=nudge,plan=planNudgeSpatial(g.c.s.text,g.c.s.raw,g.c.targets,g.c.id,g.c.geometry,g.dx,g.dy);cancelNudge();
    if(!active() || opts.session.text()!==g.c.s.text)return;
    if(plan.error){announce(plan.error,g.c.shell);return;}
    if(opts.apply(plan,null,g.c.s)){var el=opts.find(g.focus);if(el)el.focus({preventScroll:true});sync();}
  }
  function keyboard(ev){
    if(!active() || opts.busy())return;
    if(nudge && ev.key==='Escape'){ev.preventDefault();ev.stopImmediatePropagation();cancelNudge();return;}
    var el=ev.target,t=el.matches && el.matches('[data-dv-object-menu]')?target(el):null;if(!t)return;
    if(ev.key==='ContextMenu' || ev.key==='F10' && ev.shiftKey && !ev.ctrlKey && !ev.altKey && !ev.metaKey){open(ev);return;}
    if(ev.ctrlKey || ev.metaKey || ev.altKey)return;
    if(ev.key==='Enter'){ev.preventDefault();ev.stopImmediatePropagation();cancelNudge();if(ev.shiftKey)opts.toggle(t);else opts.select([t]);sync();return;}
    var dirs={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]},dir=dirs[ev.key];if(!dir)return;
    ev.preventDefault();ev.stopImmediatePropagation();
    if(!nudge){
      if(!currentTargets().some(function(x){return x.kind===t.kind && x.section===t.section && x.id===t.id;}))opts.select([t]);
      var c=context();if(!c)return;var check=builderMovableSpatial(c.s.text,c.s.raw,c.targets,c.id,c.geometry);
      if(check.error){announce(check.error,c.shell);return;}
      if(status)status.remove();status=null;
      nudge={c:c,focus:t,dx:0,dy:0,keys:new Set(),preview:c.targets.map(function(x){return {el:x.el,node:x.kind==='node',transform:x.kind==='node'?x.el.getAttribute('transform'):x.el.style.transform};})};
    }
    var step=ev.shiftKey?50:10;nudge.dx+=dir[0]*step;nudge.dy+=dir[1]*step;nudge.keys.add(ev.key);
    nudge.preview.forEach(function(p){var move='translate('+nudge.dx+(p.node?' ': 'px,')+nudge.dy+(p.node?')':'px)');if(p.node)p.el.setAttribute('transform',(p.transform || '')+' '+move);else p.el.style.transform=(p.transform || '')+' '+move;});
  }
  life.listen(fitButton,'click',fitSelection);
  life.listen(view,'keydown',keyboard,true);
  life.listen(win,'keyup',function(ev){if(nudge && nudge.keys.has(ev.key)){ev.preventDefault();nudge.keys.delete(ev.key);if(!nudge.keys.size)finishNudge();}},true);
  life.listen(doc,'pointerdown',cancelNudge,true);
  life.listen(doc,'focusin',function(ev){if(nudge && ev.target!==nudge.focus.el)cancelNudge();},true);
  function open(ev){
    if(!active() || opts.busy())return;var t=target(ev.target);if(!t)return;
    ev.preventDefault();ev.stopPropagation();close(false);cancel();cancelNudge();
    var targets=currentTargets();if(!targets.some(function(x){return x.section===t.section && x.kind===t.kind && (t.id!=null?x.id===t.id:x.index===t.index);})) {opts.select([t]);targets=currentTargets();}
    var shell=surface(t.el),s=snapshot();if(!s)return;
    var id=layoutId(shell),geometry=rects(targets,shell),spatial=targets.every(function(x){return x.kind==='node' || x.kind==='panel';});
    var alignment=planAlignSpatial(s.text,s.raw,targets,id,'horizontal',geometry);
    menu=doc.createElement('div');menu.className='dv-object-menu';menu.setAttribute('popover','manual');menu.setAttribute('role','menu');menu.setAttribute('aria-label','Object actions');
    menuLife=createWorkbenchLifetime();opener=doc.activeElement;
    function item(label,action,reason){var button=doc.createElement('button');button.type='button';button.setAttribute('role','menuitem');button.textContent=label;button.tabIndex=-1;
      if(reason){button.setAttribute('aria-disabled','true');button.title=reason;var note=doc.createElement('small');note.textContent=reason;button.appendChild(note);}
      menuLife.listen(button,'click',function(e){e.stopPropagation();if(reason)return;close(false);if(opts.session.text()!==s.text)return;action();});menu.appendChild(button);return button;
    }
    item('Inspect',function(){opts.inspect();});
    item('Delete',function(){var plan=planBulkDelete(s.text,targets);if(opts.apply(plan,null,s))opts.select([]);},!spatial && targets.length>1?'Select one kind to delete.':null);
    item('Duplicate',function(){opts.apply(planDuplicateSpatial(s.text,s.raw,targets,id,geometry),null,s);},spatial?null:'Duplicate supports nodes and canvas panels.');
    ['horizontal','vertical'].forEach(function(direction){item('Align '+(direction==='horizontal'?'horizontally':'vertically'),function(){opts.apply(planAlignSpatial(s.text,s.raw,targets,id,direction,geometry),null,s);},alignment.error);});
    ['horizontal','vertical'].forEach(function(direction){var plan=planDistributeSpatial(s.text,s.raw,targets,id,direction,geometry);item('Distribute '+(direction==='horizontal'?'horizontally':'vertically'),function(){distribute(direction);},plan.error);});
    item('Fit selection',fitSelection,context()?null:'Select visible nodes or canvas panels to fit.');
    shell.appendChild(menu);var bounds=shell.getBoundingClientRect();menu.style.maxHeight=Math.max(80,Math.min(win.innerHeight,bounds.bottom)-Math.max(8,bounds.top)-8)+'px';if(menu.showPopover)menu.showPopover();var r=menu.getBoundingClientRect(),x=ev.clientX||t.el.getBoundingClientRect().left,y=ev.clientY||t.el.getBoundingClientRect().top;
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
  life.listen(doc,'keydown',function(ev){if(ev.key==='Escape' && nudge){ev.preventDefault();ev.stopImmediatePropagation();cancelNudge();return;}if(ev.key==='Escape' && !menu && !marquee && active() && surface(ev.target) && !ev.target.closest('dialog,[data-dv-detail-preview]')){opts.select([]);return;}if(ev.key==='Escape' && marquee){ev.preventDefault();ev.stopImmediatePropagation();cancel();opts.select([]);swallow=true;}},true);
  life.listen(win,'pointercancel',cancel);life.listen(win,'blur',clear);
  life.listen(view,'lostpointercapture',function(ev){if(marquee && ev.pointerId===marquee.id)cancel();},true);
  life.listen(opts.src,'input',clear);
  life.listen(view,'click',function(ev){if(ev.target.closest('[data-view-layout]')){clear();opts.select([]);}},true);
  life.listen(view,'dv:pathchange',clear);
  return {actions:actions,sync:sync,target:target,clear:clear,refresh:refresh,busy:function(){return !!marquee;},destroy:function(){life.destroy();clear();restoreFocusNodes();}};
}
