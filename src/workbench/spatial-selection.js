/* Workbench-only diagram gestures. Standard and Explore graph nodes share
   authored selection; Explore also contributes canvas panels and controls. This
   owner keeps all menus, capture and marquee DOM transient. */
function createBuilderSpatialSelection(opts){
  var life=createWorkbenchLifetime(),doc=opts.document,win=opts.window,view=opts.view,menu=null,menuLife=null,opener=null,marquee=null,swallow=false,focusNodes=[],nudge=null,status=null,assistiveStatus=null;
  var fitButton=doc.getElementById?doc.getElementById('workspace-fit-selection'):null;
  function active(){return !opts.isActive || opts.isActive();}
  function surface(el){return el && el.closest && el.closest('.section-viewport');}
  function snapshot(){var s=opts.session.snapshot();return !s.error && (s.renderedText==null || s.renderedText===s.text)?s:null;}
  function traversal(s){
    var paths=specSectionPaths(s.raw),diagrams=Object.create(null),resolvedReady=false,resolvedPaths=[],resolved=null;
    function diagram(section){
      var key=String(section);if(Object.prototype.hasOwnProperty.call(diagrams,key))return diagrams[key];
      var record=paths[section],got;
      if(!record)got={error:'no section to insert into — click a section first'};
      else if(!jsonLocate(s.text,record.diagram))got={error:'this section has no diagram yet — add "diagram": {"nodes": {...}, "rows": [[...]]} inside it first'};
      else got={path:record.diagram,d:specValueAt(s.raw,record.diagram)};
      diagrams[key]=got;return got;
    }
    function node(got,section,id){
      var local=(got.d.nodes || {})[id];if(local)return {value:local,imported:false};
      if(!opts.session.resolve)return null;
      if(!resolvedReady){
        resolvedReady=true;
        try{resolved=opts.session.resolve(s.raw);resolvedPaths=specSectionPaths(resolved);}catch(_){resolved=null;resolvedPaths=[];}
      }
      var record=resolvedPaths[section],resolvedDiagram=record && specValueAt(resolved,record.diagram),value=resolvedDiagram && (resolvedDiagram.nodes || {})[id];
      return value?{value:value,imported:true}:null;
    }
    return {snapshot:s,diagram:diagram,node:node};
  }
  function traversalTarget(el,lookup){
    var shell=surface(el),sec=shell && shell.closest('.doc-sec');if(!sec || el.closest('[data-dv-detail-preview]'))return null;
    var section=Number(sec.getAttribute('data-dv-section')),got=lookup.diagram(section);if(got.error)return null;
    var panel=el.closest('.explore-canvas-objects [data-explore-panel]');
    if(panel){var id=panel.getAttribute('data-explore-panel'),index=(got.d.panels || []).findIndex(function(p){return p.id===id;});return index<0?null:{kind:'panel',id:id,index:index,section:section,el:panel};}
    var controls=el.closest('.explore-canvas-objects .explore-player');
    if(controls)return {kind:'step-controls',section:section,layoutId:controls.getAttribute('data-explore-layout'),el:controls};
    var node=el.closest('[data-dv-node]'),id=node && node.getAttribute('data-dv-node'),record=node && lookup.node(got,section,id);if(record)return {kind:'node',id:id,section:section,el:node,imported:record.imported};
    var existing=opts.targetFromEvent({target:el});return existing && ['edge','group'].indexOf(existing.kind)>=0?existing:null;
  }
  function target(el){if(!surface(el) || el.closest('[data-dv-detail-preview]'))return null;var s=snapshot();return s?traversalTarget(el,traversal(s)):null;}
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
    var lookup=traversal(s);
    Array.from(view.querySelectorAll('.section-viewport .boardcanvas g.node[data-dv-node],.viewport-explore .explore-canvas-objects [data-explore-panel],.viewport-explore .explore-canvas-objects .explore-player')).forEach(function(el){
      var section=el.closest('.doc-sec'),controls=el.classList.contains('explore-player'),panel=el.hasAttribute('data-explore-panel'),id=el.getAttribute(panel?'data-explore-panel':'data-dv-node');
      if(!section || el.closest('[data-dv-detail-preview]'))return;
      var sectionIndex=Number(section.getAttribute('data-dv-section')),got=lookup.diagram(sectionIndex);
      if(got.error)return;
      var nodeRecord;
      if(!controls && !panel){
        nodeRecord=lookup.node(got,sectionIndex,id);
      }
      var value=controls?{title:'Step controls'}:panel?(got.d.panels || []).find(function(p){return p.id===id;}):nodeRecord && nodeRecord.value;if(!value)return;
      var help='Enter selects; Shift+Enter adds or removes; arrows move 10 graph units, Shift+arrows 50; release arrows to commit; Escape cancels; Shift+F10 opens actions.';
      if(controls)help='Enter selects; Shift+Enter adds or removes; Shift+F10 opens actions. Select and use the move or resize handle; arrow keys on handles change geometry. Group movement and alignment support nodes and panels.';
      if(!controls && !panel && nodeRecord.imported)help='This imported node can be aligned here; only this consumer’s arrangement is saved. '+help;
      else if(!controls && !panel && !(got.d.floats || []).some(function(f){return f.id===id;}))help='Row nodes follow the row layout. Use Free placement to move this node. '+help;
      if(!controls && !panel && nodeRecord && !nodeRecord.imported && nodeRecord.value.locked===true)help='Position locked; selection and content editing remain available. '+help;
      var attrs={},values={tabindex:'0',role:'group','aria-label':(value.title || id)+(controls?' on canvas':panel?' canvas panel':' node'),'aria-haspopup':'menu','aria-keyshortcuts':controls?'Enter Shift+Enter Shift+F10':'Enter Shift+Enter ArrowUp ArrowDown ArrowLeft ArrowRight Shift+F10','aria-description':help,title:help,'data-dv-object-menu':''};
      Object.keys(values).forEach(function(name){attrs[name]=el.getAttribute(name);el.setAttribute(name,values[name]);});
      focusNodes.push({el:el,attrs:attrs});
    });
    sync();
  }
  function candidates(shell){var elements=Array.from(shell.querySelectorAll('.boardcanvas [data-dv-node],.explore-canvas-objects [data-explore-panel],.explore-canvas-objects .explore-player'));if(!elements.length)return [];var s=snapshot(),lookup=s && traversal(s);return lookup?elements.map(function(el){return traversalTarget(el,lookup);}).filter(function(t){var r=t && t.el.getBoundingClientRect();return r && r.width>0 && r.height>0 && t.el.getClientRects().length;}):[];}
  function activeSurface(){
    var section=view.querySelector('.doc-sec.workspace-active-section') || view.querySelector('.doc-sec[data-dv-section="'+opts.session.insertSection+'"]');
    if(!section)return null;
    return Array.from(section.querySelectorAll('.section-viewport')).find(function(shell){
      return shell.getClientRects().length && shell.querySelector('.boardcanvas [data-dv-node]');
    }) || null;
  }
  function selectAllNodes(){
    if(!active() || opts.busy())return false;
    var shell=activeSurface(),nodes=shell && candidates(shell).filter(function(item){return item.kind==='node';});
    if(!nodes || !nodes.length)return false;
    opts.select(nodes);sync();return true;
  }
  function layoutId(shell){var p=shell.querySelector('[data-explore-layout]');return p && p.getAttribute('data-explore-layout');}
  function rects(targets,shell){
    var svg=shell.querySelector('.boardcanvas > svg'),matrix=svg && svg.getScreenCTM();if(!matrix)return [];
    var inverse=matrix.inverse();return targets.map(function(t){
      // The authored float center owns the card, while badges, links and long
      // label ink can extend the renderer's node group in one direction.
      var el=t.kind==='node' && t.el && t.el.querySelector('.card') || t.el,r=el && el.getBoundingClientRect();if(!r)return null;
      var a=new win.DOMPoint(r.left,r.top).matrixTransform(inverse),b=new win.DOMPoint(r.right,r.bottom).matrixTransform(inverse);return {x:a.x,y:a.y,w:b.x-a.x,h:b.y-a.y};
    });
  }
  function close(focus){if(menuLife)menuLife.destroy();menuLife=null;if(menu)menu.remove();menu=null;var el=opener;opener=null;if(focus && el && el.isConnected)el.focus({preventScroll:true});}
  function cancel(){if(!marquee)return;var m=marquee;marquee=null;if(m.box)m.box.remove();try{if(m.board.hasPointerCapture(m.id))m.board.releasePointerCapture(m.id);}catch(_){} }
  function clear(){close(false);cancel();cancelNudge();if(status)status.remove();status=null;if(assistiveStatus)assistiveStatus.remove();assistiveStatus=null;swallow=false;sync();}
  function currentTargets(){return opts.selection().map(function(t){if(t.kind==='panel' && t.el){var shell=surface(t.el),card=shell && Array.from(shell.querySelectorAll('.explore-canvas-objects [data-explore-panel]')).find(function(el){return el.contains(t.el);});if(card){var authored=target(card);if(authored)return authored;}}if(t.kind!=='panel' || t.id)return t;var s=snapshot(),got=s && builderDiagram(s.text,s.raw,t.section),p=got && !got.error && (got.d.panels || [])[t.index];return Object.assign({},t,{id:p && p.id});});}
  function sameTarget(a,b){return a && b && a.kind===b.kind && a.section===b.section && (a.id!=null || b.id!=null?a.id===b.id:a.index===b.index);}
  function focusSelection(preferred){
    var targets=currentTargets().filter(function(t){return t.kind==='node' || t.kind==='panel';});
    var chosen=targets.find(function(t){return sameTarget(t,preferred);}) || targets[0],el=chosen && chosen.el;
    if(!el || !el.isConnected || !el.matches || !el.matches('[data-dv-object-menu]'))return false;
    el.focus({preventScroll:true});return true;
  }
  function edgeRoutingTargets(s,targets){
    var resolved=s.raw;try{if(opts.session.resolve)resolved=opts.session.resolve(s.raw);}catch(_){}
    return targets.map(function(t){
      if(t.kind!=='edge')return t;
      var rawRecord=specSectionPaths(s.raw)[t.section],rawDiagram=rawRecord && specValueAt(s.raw,rawRecord.diagram),rawEdge=rawDiagram && (rawDiagram.edges || [])[t.index];
      var record=specSectionPaths(resolved)[t.section],diagram=record && specValueAt(resolved,record.diagram),edge=diagram && (diagram.edges || [])[t.index],key=edge && builderEdgeKey(edge);
      var imported=rawEdge && builderImportedEdgeKeys(rawDiagram).has(builderEdgeKey(rawEdge));
      if(rawEdge && !imported && (!key || builderEdgeKey(rawEdge)===key)){
        var authored=Object.assign({},t,{imported:false});delete authored.key;return authored;
      }
      return Object.assign({},t,{key:key || t.key,imported:true});
    });
  }
  function context(){
    var targets=currentTargets(),shell=targets.length && surface(targets[0].el),s=snapshot();
    if(!s || !shell || targets.some(function(t){return !t.el || surface(t.el)!==shell || !t.el.isConnected || !t.el.getClientRects().length || t.kind==='step-controls' && !t.el.closest('.explore-canvas-objects') || ['node','panel','step-controls'].indexOf(t.kind)<0;}))return null;
    var geometry=rects(targets,shell);if(geometry.length!==targets.length || geometry.some(function(r){return !r || r.w<=0 || r.h<=0;}))return null;
    return {targets:targets,shell:shell,s:s,id:layoutId(shell),geometry:geometry};
  }
  function fitReason(c){return !c?'Select visible nodes, canvas panels or canvas step controls to fit.':null;}
  function fitSelection(){
    var c=context();if(!active() || fitReason(c))return;
    var rs=c.geometry,x=Math.min.apply(null,rs.map(function(r){return r.x;})),y=Math.min.apply(null,rs.map(function(r){return r.y;}));
    view.dispatchEvent(new win.CustomEvent('workbench-fit-selection',{detail:{section:c.targets[0].section,x:x,y:y,w:Math.max.apply(null,rs.map(function(r){return r.x+r.w;}))-x,h:Math.max.apply(null,rs.map(function(r){return r.y+r.h;}))-y}}));
  }
  function sync(){if(status){status.remove();status=null;}if(fitButton){var c=life.alive()?context():null,reason=fitReason(c);fitButton.disabled=!!reason;fitButton.title=reason || 'Frame selected canvas objects';}}
  function distribute(direction){var c=context();if(!active() || !c)return;var plan=planDistributeSpatial(c.s.text,c.s.raw,c.targets,c.id,direction,c.geometry);if(plan.noop){announce('Every selected graph node is position-locked; nothing moved.',c.shell);return;}opts.apply(plan,null,c.s);}
  function actions(host,lifetime){
    var c=context();sync();if(!c)return;
    var box=doc.createElement('div');box.className='iactions dv-spatial-actions';host.appendChild(box);
    var fit=doc.createElement('button');fit.type='button';fit.className='bbtn';fit.textContent='Fit selection';box.appendChild(fit);lifetime.listen(fit,'click',fitSelection);
    if(!c.shell.classList.contains('viewport-explore'))return;
    var entries=[];
    ['horizontal','vertical'].forEach(function(direction){var button=doc.createElement('button');button.type='button';button.className='bbtn';button.textContent='Distribute '+(direction==='horizontal'?'horizontally':'vertically');box.appendChild(button);entries.push({button:button,direction:direction});lifetime.listen(button,'click',function(){distribute(direction);});});
    var note=doc.createElement('p');note.className='fnote';box.appendChild(note);
    function update(){var current=context(),reasons=[],fitError=fitReason(current);fit.disabled=!!fitError;fit.title=fitError || 'Frame selected canvas objects';if(fitError)reasons.push(fitError);entries.forEach(function(entry){var reason=current?planDistributeSpatial(current.s.text,current.s.raw,current.targets,current.id,entry.direction,current.geometry).error:'Render and select the objects again.';entry.button.disabled=!!reason;entry.button.title=reason || 'Keep outer bounds and equalize visual gaps.';if(reason && reasons.indexOf(reason)<0)reasons.push(reason);});note.textContent='Tab to an object; Enter selects, Shift+Enter adds or removes. Arrows move 10 graph units; Shift+arrows move 50. Release arrows for one Undo action. '+reasons.join(' ');}
    update();lifetime.listen(opts.src,'input',update);
  }
  function announce(message,shell){if(status)status.remove();status=doc.createElement('div');status.className='dv-spatial-status';status.setAttribute('role','status');status.textContent=message;shell.appendChild(status);}
  function announceAssistive(message,shell){if(assistiveStatus)assistiveStatus.remove();assistiveStatus=doc.createElement('div');assistiveStatus.className='dv-spatial-assistive-status';assistiveStatus.setAttribute('role','status');assistiveStatus.setAttribute('aria-live','polite');assistiveStatus.setAttribute('aria-atomic','true');assistiveStatus.textContent=message;shell.appendChild(assistiveStatus);}
  function clearAssistiveAnnouncement(){if(assistiveStatus)assistiveStatus.remove();assistiveStatus=null;}
  function cancelNudge(){if(!nudge)return;var g=nudge;nudge=null;g.preview.forEach(function(p){if(p.node){if(p.transform===null)p.el.removeAttribute('transform');else p.el.setAttribute('transform',p.transform);}else p.el.style.transform=p.transform;});}
  function finishNudge(){
    if(!nudge)return;var g=nudge,plan=planNudgeSpatial(g.c.s.text,g.c.s.raw,g.c.targets,g.c.id,g.c.geometry,g.dx,g.dy);cancelNudge();
    if(!active() || opts.session.text()!==g.c.s.text)return;
    if(plan.error){announce(plan.error,g.c.shell);return;}if(plan.noop){announce('Every selected graph node is position-locked; nothing moved.',g.c.shell);return;}
    if(opts.apply(plan,null,g.c.s)){var el=opts.find(g.focus);if(el)el.focus({preventScroll:true});sync();}
  }
  function keyboard(ev){
    if(!active() || opts.busy())return;
    if(nudge && ev.key==='Escape'){ev.preventDefault();ev.stopImmediatePropagation();cancelNudge();return;}
    var el=ev.target,t=el.matches && el.matches('[data-dv-object-menu]')?target(el):null;if(!t)return;
    if(ev.key==='ContextMenu' || ev.key==='F10' && ev.shiftKey && !ev.ctrlKey && !ev.altKey && !ev.metaKey){open(ev);return;}
    if(ev.ctrlKey || ev.metaKey || ev.altKey)return;
    if(ev.key==='Enter'){ev.preventDefault();ev.stopImmediatePropagation();cancelNudge();if(ev.shiftKey)opts.toggle(t);else opts.select([t]);sync();return;}
    if(t.kind==='step-controls')return;
    var dirs={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]},dir=dirs[ev.key];if(!dir)return;
    ev.preventDefault();ev.stopImmediatePropagation();
    if(!nudge){
      if(!currentTargets().some(function(x){return x.kind===t.kind && x.section===t.section && x.id===t.id;}))opts.select([t]);
      var c=context();if(!c)return;var check=builderMovableSpatial(c.s.text,c.s.raw,c.targets,c.id,c.geometry);
      if(check.error){announce(check.error,c.shell);return;}
      if(check.noop){announce('Every selected graph node is position-locked; nothing moved.',c.shell);return;}
      if(status)status.remove();status=null;
      nudge={c:c,focus:t,dx:0,dy:0,keys:new Set(),preview:c.targets.filter(function(x){return x.kind!=='node' || !builderNodePositionLocked(check.d,x.id);}).map(function(x){return {el:x.el,node:x.kind==='node',transform:x.kind==='node'?x.el.getAttribute('transform'):x.el.style.transform};})};
    }
    var step=ev.shiftKey?50:10;nudge.dx+=dir[0]*step;nudge.dy+=dir[1]*step;nudge.keys.add(ev.key);
    nudge.preview.forEach(function(p){var move='translate('+nudge.dx+(p.node?' ': 'px,')+nudge.dy+(p.node?')':'px)');if(p.node)p.el.setAttribute('transform',(p.transform || '')+' '+move);else p.el.style.transform=(p.transform || '')+' '+move;});
  }
  life.listen(fitButton,'click',fitSelection);
  life.listen(view,'keydown',keyboard,true);
  life.listen(win,'keyup',function(ev){if(nudge && nudge.keys.has(ev.key)){ev.preventDefault();nudge.keys.delete(ev.key);if(!nudge.keys.size)finishNudge();}},true);
  life.listen(doc,'pointerdown',cancelNudge,true);
  life.listen(doc,'focusin',function(ev){if(nudge && ev.target!==nudge.focus.el)cancelNudge();},true);
  function blank(ev){
    var el=ev.target,shell=surface(el),board=el.closest('.board'),sec=shell && shell.closest('.doc-sec');
    if(!board || !sec || !snapshot() || !opts.openAdd)return;
    if(el.closest('[data-dv-detail-preview],.explore-window,.explore-player,.explore-tools,.dv-text-toolbar,.dv-text-editor,a,button,input,select,textarea,[contenteditable],[role="button"],[data-dv-node],[data-dv-edge],[data-dv-step],[data-dv-group],[data-dv-row],[data-dv-panel]'))return;
    var svg=board.querySelector('.boardcanvas > svg'),matrix=svg && svg.getScreenCTM();
    if(!matrix || !svg.getClientRects().length)return;
    var point=new win.DOMPoint(ev.clientX,ev.clientY).matrixTransform(matrix.inverse());
    if(!Number.isFinite(point.x) || !Number.isFinite(point.y))return;
    if(opts.openAdd({section:Number(sec.getAttribute('data-dv-section')),point:{x:point.x,y:point.y},explore:shell.classList.contains('viewport-explore'),x:ev.clientX,y:ev.clientY,shell:shell})){
      ev.preventDefault();ev.stopPropagation();close(false);cancel();cancelNudge();
    }
  }
  function open(ev){
    if(!active() || opts.busy() || ev.defaultPrevented || ev.target.closest('input,textarea,select,[contenteditable],.dv-text-editor'))return;
    var t=target(ev.target);if(!t){blank(ev);return;}
    ev.preventDefault();ev.stopPropagation();close(false);cancel();cancelNudge();
    var targets=currentTargets();if(!targets.some(function(x){return x.section===t.section && x.kind===t.kind && (t.id!=null?x.id===t.id:x.index===t.index);})) {opts.select([t]);targets=currentTargets();}
    var shell=surface(t.el),s=snapshot();if(!s)return;
    var topologyContext=opts.session.topologyContext?opts.session.topologyContext():null,topologyKey=JSON.stringify(topologyContext);
    var id=layoutId(shell),geometry=rects(targets,shell),spatial=targets.every(function(x){return x.kind==='node' || x.kind==='panel';});
    var anchorIndex=targets.findIndex(function(x){return x.section===t.section && x.kind===t.kind && (t.id!=null?x.id===t.id:x.index===t.index);});
    var routingTargets=edgeRoutingTargets(s,targets),selectedNodes=targets.filter(function(target){return target.kind==='node';}),ownership=selectedNodes.length?builderNodeArrangementTargets(s.text,s.raw,selectedNodes,topologyContext):null;
    var authored=selectedNodes.length?builderDiagram(s.text,s.raw,selectedNodes[0].section):null;
    var containsImported=!!(ownership && !ownership.error && ownership.records.some(function(record){return !record.local;})) ||
      !!(authored && !authored.error && selectedNodes.some(function(target){return !Object.prototype.hasOwnProperty.call(authored.d.nodes || {},target.id);})) ||
      routingTargets.some(function(target){return target.kind==='edge' && target.imported===true;});
    menu=doc.createElement('div');menu.className='dv-object-menu';menu.setAttribute('popover','manual');menu.setAttribute('role','menu');menu.setAttribute('aria-label','Object actions');
    menuLife=createWorkbenchLifetime();opener=doc.activeElement;
    function item(label,action,reason){var button=doc.createElement('button');button.type='button';button.setAttribute('role','menuitem');button.textContent=label;button.tabIndex=-1;
      if(reason){button.setAttribute('aria-disabled','true');button.title=reason;var note=doc.createElement('small');note.textContent=reason;button.appendChild(note);}
      menuLife.listen(button,'click',function(e){e.stopPropagation();if(reason)return;close(false);if(opts.session.text()!==s.text || JSON.stringify(opts.session.topologyContext?opts.session.topologyContext():null)!==topologyKey)return;action();});menu.appendChild(button);return button;
    }
    item('Inspect',function(){opts.inspect();});
    if(selectedNodes.length && selectedNodes.length===targets.length){
      var lockIds=selectedNodes.map(function(target){return target.id;}),lockSection=selectedNodes[0].section;
      var lockReason=containsImported?'Imported structure belongs to its provider.':null;
      if(selectedNodes.length===1){
        var positionLocked=!lockReason && authored && !authored.error && builderNodePositionLocked(authored.d,lockIds[0]);
        var lockPlan=lockReason?null:planSetNodesLocked(s.text,s.raw,lockSection,lockIds,!positionLocked);
        item(positionLocked?'Unlock position':'Lock position',function(){opts.apply(lockPlan,null,s);},lockReason || lockPlan && lockPlan.error);
      }else{
        [true,false].forEach(function(value){
          var plan=lockReason?null:planSetNodesLocked(s.text,s.raw,lockSection,lockIds,value);
          var reason=lockReason || plan && plan.error || plan && plan.noop && (value?'All selected positions are already locked.':'All selected positions are already unlocked.');
          item(value?'Lock selected positions':'Unlock selected positions',function(){opts.apply(plan,null,s);},reason);
        });
      }
    }
    item('Delete',function(){var plan=planBulkDelete(s.text,targets);if(opts.apply(plan,null,s))opts.select([]);},containsImported?'Imported structure belongs to its provider.':targets.some(function(t){return t.kind==='step-controls';})?'Step controls belong to the section and cannot be deleted.':!spatial && targets.length>1?'Select one kind to delete.':null);
    item('Duplicate',function(){opts.apply(planDuplicateSpatial(s.text,s.raw,targets,id,geometry),null,s);},containsImported?'Imported structure belongs to its provider.':spatial?null:'Duplicate supports nodes and canvas panels.');
    var clearPlan=planClearCustomEdges(s.text,s.raw,{targets:routingTargets}),clearReason=clearPlan.error || (clearPlan.noop?'No authored custom edge geometry is in scope.':null);
    item('Clear Custom Edges',function(){opts.apply(clearPlan,null,s);},clearReason);
    ['horizontal','vertical'].forEach(function(direction){var alignment=planAlignSpatial(s.text,s.raw,targets,id,direction,geometry,anchorIndex,topologyContext);item('Align '+(direction==='horizontal'?'horizontally':'vertically'),function(){var plan=planAlignSpatial(s.text,s.raw,targets,id,direction,geometry,anchorIndex,topologyContext);if(plan.noop)announce('Every selected graph node is position-locked or already aligned; nothing moved.',shell);else opts.apply(plan,null,s);},alignment.error);});
    ['horizontal','vertical'].forEach(function(direction){var plan=planDistributeSpatial(s.text,s.raw,targets,id,direction,geometry);item('Distribute '+(direction==='horizontal'?'horizontally':'vertically'),function(){distribute(direction);},plan.error);});
    item('Fit selection',fitSelection,fitReason(context()));
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
    var board=shell.querySelector('.board'),scrollLeft=board && board.scrollLeft,scrollTop=board && board.scrollTop;
    menuLife.listen(shell,'scroll',function(e){if(e.target===board && (board.scrollLeft!==scrollLeft || board.scrollTop!==scrollTop))close(false);},true);
  }
  life.listen(view,'contextmenu',open,true);
  life.listen(view,'pointerdown',function(ev){
    if(!active() || opts.busy() || ev.button!==0 || !ev.altKey || ev.ctrlKey || ev.metaKey || ev.shiftKey)return;
    var board=ev.target.closest('.board'),shell=surface(ev.target);if(!board || !shell || !snapshot())return;
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
    if(m.rect){var r=m.rect,selected=candidates(m.shell).filter(function(t){var b=t.el.getBoundingClientRect();return b.right>=r.left && b.left<=r.right && b.bottom>=r.top && b.top<=r.bottom;});opts.select(selected);focusSelection(selected[0]);}
    cancel();
  },true);
  life.listen(view,'click',function(ev){if(swallow){swallow=false;ev.preventDefault();ev.stopImmediatePropagation();}},true);
  life.listen(doc,'keydown',function(ev){if(ev.key==='Escape' && nudge){ev.preventDefault();ev.stopImmediatePropagation();cancelNudge();return;}if(ev.key==='Escape' && !menu && !marquee && active() && surface(ev.target) && !ev.target.closest('dialog,[data-dv-detail-preview]')){opts.select([]);return;}if(ev.key==='Escape' && marquee){ev.preventDefault();ev.stopImmediatePropagation();cancel();opts.select([]);swallow=true;}},true);
  life.listen(win,'pointercancel',cancel);life.listen(win,'blur',clear);
  life.listen(view,'lostpointercapture',function(ev){if(marquee && ev.pointerId===marquee.id)cancel();},true);
  life.listen(opts.src,'input',clear);
  life.listen(view,'click',function(ev){if(ev.target.closest('[data-view-layout],[data-tab-view]')){clear();opts.select([]);}},true);
  life.listen(view,'dv:pathchange',clear);
  return {actions:actions,sync:sync,target:target,clear:clear,refresh:refresh,focusSelection:focusSelection,announceAssistive:announceAssistive,clearAssistiveAnnouncement:clearAssistiveAnnouncement,selectAllNodes:selectAllNodes,busy:function(){return !!marquee;},destroy:function(){life.destroy();clear();restoreFocusNodes();}};
}
