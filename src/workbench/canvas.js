/* The selected View owns the editor surface, just as in the reader. */
function initWorkbenchCanvas(options){
  options=options || {};
  var surface=document.getElementById('workspace-canvas'),view=document.getElementById('docview');
  var focusState=null,navigationState=null,focusFrame=0;
  var focusButton=document.getElementById('workspace-focus-diagram');
  var selectionKey=null,selecting=false,getController=function(){return null;},getPage=function(){return null;};
  var savedSelection=null,savedOwnerSections=null,section=0,hand=false,spaceHeld=false,drag=null,saved=null,skipCapture=false,fitPending=0,fitRequests=new Set(),activeCanvas=null,history=null,activeDetail=null,detailStates=[],savedDetail=null,navigation=null,navigationController=null,contentsOpen=null;
  var fitObserver=new ResizeObserver(function(entries){
    if(!fitPending && entries.some(function(entry){return entry.contentRect.width && entry.contentRect.height;}))fitPending=requestAnimationFrame(autoFit);
  });
  var header=document.querySelector('.workbench-header'),headerTitle=document.getElementById('workbench-reader-title'),editorTitle=document.getElementById('workbench-editor-title'),measuredNav=null;
  function paintTitle(){var page=getPage(),text=page && typeof page.title==='string' && page.title.trim()?page.title.trim():'Untitled story';editorTitle.textContent=text;editorTitle.title=text;editorTitle.hidden=false;headerTitle.hidden=false;}
  window.addEventListener('workbench-editor-visible',paintTitle);
  function measureChrome(){
    if(document.body.classList.contains('welcome-active') || document.body.classList.contains('workbench-reader-preview-active'))return;
    var head=header.getBoundingClientRect().bottom;document.body.style.setProperty('--workspace-header-bottom',head+'px');
    var nav=navigation && navigation.element,edge=nav && nav.isConnected?nav.getBoundingClientRect().bottom:head;
    document.body.style.setProperty('--workspace-content-top',Math.ceil(edge+10)+'px');
    document.dispatchEvent(new CustomEvent('workbench-chrome-resize'));
  }
  var chromeObserver=new ResizeObserver(measureChrome);chromeObserver.observe(header);
  view.addEventListener('navigation-mounted',function(){var nav=navigation && navigation.element;if(nav && nav!==measuredNav){if(measuredNav)chromeObserver.unobserve(measuredNav);measuredNav=nav;chromeObserver.observe(nav);}measureChrome();});
  view.addEventListener('workbench-navigation-refresh',function(){if(navigation)navigation.mount(current());measureChrome();});
  var canvasCommand=null,canvasCommandAnchor=null,canvasMenu=document.getElementById('workspace-canvas-tools');
  function restoreCanvasCommand(){if(canvasCommandAnchor && canvasCommandAnchor.parentNode){canvasCommandAnchor.parentNode.replaceChild(canvasCommand,canvasCommandAnchor);}canvasCommand=canvasCommandAnchor=null;}
  function mountCanvasCommand(rec){restoreCanvasCommand();if(!rec || !rec.viewport)return;canvasCommand=rec.viewport.canvasCommand();canvasCommandAnchor=document.createComment('canvas command');canvasCommand.before(canvasCommandAnchor);canvasMenu.querySelector('div').prepend(canvasCommand);}
  canvasMenu.addEventListener('keydown',function(ev){if(!((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase()==='z'))ev.stopPropagation();if(ev.key==='Escape'){ev.preventDefault();canvasMenu.open=false;canvasMenu.querySelector('summary').focus();}});
  function records(){var ctl=getController();return ctl && ctl.sections || [];}
  // Child copies have transient DOM IDs. Keep their geometry by the source
  // sections along the local node chain, and re-resolve every link on restore.
  function detailContext(snapshot){
    var page=getPage();if(!page || !snapshot || !snapshot.frames.length)return null;
    var all=sectionRecords(page),rec=detailSection(page,snapshot.section),indices=[],nodes=[];
    if(!rec)return null;indices.push(all.findIndex(function(r){return r.section===rec.section;}));
    for(var i=0;i<snapshot.frames.length;i++){
      var id=snapshot.frames[i].node,node=rec.section.diagram && rec.section.diagram.nodes[id];
      rec=detailTarget(page,node && node.detail);if(!rec || !rec.section.diagram)return null;
      indices.push(all.findIndex(function(r){return r.section===rec.section;}));nodes.push(id);
    }
    return {sections:workbenchPreviewSections(page),indices:indices,nodes:nodes};
  }
  function resolveDetail(context){
    var page=getPage();if(!page)return null;
    var all=sectionRecords(page),matches=matchWorkbenchPreviewSections(context.sections,workbenchPreviewSections(page));
    var indices=context.indices.map(function(index){return all.findIndex(function(r,i){return matches.get(i)===context.sections[index];});});
    if(indices.some(function(index){return index<0;}))return null;
    for(var i=0;i<context.nodes.length;i++){
      var d=all[indices[i]].section.diagram,node=d && d.nodes[context.nodes[i]],next=detailTarget(page,node && node.detail);
      if(!next || next.section!==all[indices[i+1]].section)return null;
    }
    return {indices:indices,reference:all[indices[0]].reference,diagram:all[indices[indices.length-1]].section.diagram};
  }
  function detailEntry(snapshot){
    var context=detailContext(snapshot);if(!context)return null;
    var key=JSON.stringify([context.indices,context.nodes]);
    var entry=detailStates.find(function(item){var current=resolveDetail(item.context);return current && JSON.stringify([current.indices,item.context.nodes])===key;});
    if(!entry){entry={context:context,reader:{}};detailStates.push(entry);}
    return entry;
  }
  function saveDetail(){
    if(activeDetail && activeCanvas && activeCanvas.viewport){
      activeDetail.reader=activeCanvas.viewport.snapshotCanvasState();activeDetail.visited=activeCanvas.canvasVisited;
      var current=resolveDetail(activeDetail.context);if(current)activeDetail.config=JSON.stringify([current.diagram.layouts,current.diagram.sectionLayout]);
    }
  }
  function current(){
    var base=records().find(function(r){return r.number===section+1;}),ctl=getController(),details=ctl && ctl.details,snapshot=details && details.snapshot();
    return snapshot && base && snapshot.section===base.reference && details.activeSection?details.activeSection() || base:base;
  }
  function viewport(){var rec=current();return rec && rec.viewport;}
  function board(){var rec=current();return rec && rec.sectionEl.querySelector('.explore-board');}
  function explicitView(rec){
    var p=rec && rec.presentation,id=p && p.viewId && p.viewId(),definition=rec && rec.viewport && rec.viewport.viewDefinition();
    return definition && !definition.legacy && p && p.views && p.views().some(function(v){return v.id===id;});
  }
  function exploreView(rec){
    var definition=rec && rec.viewport && rec.viewport.viewDefinition();
    if(rec && rec.viewOwner && rec.viewingMode)return rec.viewingMode==='explore';
    return !!(definition && definition.presentation==='explore' || rec && rec.inheritedExplore && !explicitView(rec));
  }
  function diagramMode(){return !!focusState || exploreView(current());}
  function identity(rec){
    var p=rec && rec.presentation,definition=rec && rec.viewport && rec.viewport.viewDefinition();
    var ctl=getController(),snapshot=ctl && ctl.details && ctl.details.snapshot();
    return JSON.stringify([section,snapshot && snapshot.frames.map(function(f){return f.node;}),explicitView(rec)?definition.id:p && p.viewId?p.viewId():'flow',exploreView(rec)]);
  }
  function paintFocus(){focusButton.textContent=focusState?'Return to page':'Focus diagram';focusButton.setAttribute('aria-pressed',String(!!focusState));focusButton.hidden=!viewport();document.body.classList.toggle('workspace-diagram-focused',!!focusState);}
  function releaseFocus(restore){
    if(!focusState)return;var state=focusState;focusState=null;cancelAnimationFrame(focusFrame);focusFrame=0;
    if(activeCanvas && activeCanvas.viewport)activeCanvas.viewport.setWorkbenchFocus(false);
    document.querySelectorAll('.workspace-focus-tucked').forEach(function(el){el.classList.remove('workspace-focus-tucked');});
    if(options.restoreTools)options.restoreTools(state.tools);
    if(navigation && navigation.contents)navigation.contents.setOpen(state.navigation.opened===true);
    paintFocus();
    if(!restore)return;
    select(section);
    var rec=current();if(!rec || identity(rec)!==state.key)return;
    // Restore navigation only. Panel geometry/content edited while focused stays
    // owned by the current preview and its normal Undo history.
    var memory=rec.viewport.snapshotCanvasState();
    var resolved=state.detail && resolveDetail(state.detail),diagram=state.detail?resolved && resolved.diagram:sectionRecords(getPage())[section].section.diagram;
    if(!diagram)return;
    var oldViews=diagramLayoutViews(state.diagram),newViews=diagramLayoutViews(diagram);
    Object.keys(state.canvas).forEach(function(id){var oldView=oldViews.find(function(v){return v.id===id;}),newView=newViews.find(function(v){return v.id===id;});if(oldView && !newView)return;if(JSON.stringify(oldView && oldView.exploreLayout && oldView.exploreLayout.camera)!==JSON.stringify(newView && newView.exploreLayout && newView.exploreLayout.camera))return;if(memory[id])['scroll','zoom','fitFloor'].forEach(function(key){memory[id][key]=state.canvas[id][key];});});
    rec.viewport.restoreCanvasState(memory);
    if(rec.boardSize)rec.boardSize.restore(state.board);
    if(navigation && navigation.contents)navigation.contents.restore(state.navigation);
    surface.scrollLeft=state.left;surface.scrollTop=state.top;
    paintZoom();
  }
  function focusedSelection(){
    var rec=current(),svg=rec && rec.sectionEl.querySelector('.boardcanvas>svg'),matrix=svg && svg.getScreenCTM();if(!matrix)return null;
    var inverse=matrix.inverse(),rects=Array.from(svg.querySelectorAll('[data-dv-node].dv-sel')).map(function(el){var r=(el.querySelector('.card') || el).getBoundingClientRect(),a=new DOMPoint(r.left,r.top).matrixTransform(inverse),b=new DOMPoint(r.right,r.bottom).matrixTransform(inverse);return {x:a.x,y:a.y,right:b.x,bottom:b.y};});
    if(!rects.length)return null;var x=Math.min.apply(null,rects.map(function(r){return r.x;})),y=Math.min.apply(null,rects.map(function(r){return r.y;}));
    return {x:x,y:y,w:Math.max.apply(null,rects.map(function(r){return r.right;}))-x,h:Math.max.apply(null,rects.map(function(r){return r.bottom;}))-y};
  }
  function focusDiagram(){
    if(focusState){releaseFocus(true);focusButton.focus({preventScroll:true});return;}
    var rec=current();if(!rec || !rec.viewport || !navigation || !navigation.contents)return;
    var ctl=getController(),detail=detailContext(ctl && ctl.details && ctl.details.snapshot()),resolved=detail && resolveDetail(detail);
    if(detail && !resolved)return;
    focusState={key:identity(rec),tools:options.snapshotTools && options.snapshotTools(),detail:detail,navigation:navigation.contents.snapshot(),canvas:rec.viewport.snapshotCanvasState(),diagram:resolved?resolved.diagram:sectionRecords(getPage())[section].section.diagram,board:rec.boardSize && rec.boardSize.snapshot(),left:surface.scrollLeft,top:surface.scrollTop};
    document.querySelectorAll('.workspace-window:not([hidden]):not(#workspace-window-inspect)').forEach(function(el){el.classList.add('workspace-focus-tucked');});
    navigation.contents.setOpen(false);select(section);cancelFit();
    rec.canvasVisited=true;rec.viewport.setWorkbenchFocus(true);paintFocus();
    focusFrame=requestAnimationFrame(function(){focusFrame=0;if(focusState)fit(focusedSelection());});
  }
  focusButton.addEventListener('click',focusDiagram);
  document.addEventListener('click',function(event){var tab=event.target.closest('[id^="editor-tab-"],#workspace-file');if(!focusState || !tab)return;var name=tab.id==='workspace-file'?'file':tab.id.slice(11),win=document.getElementById('workspace-window-'+name);if(win)win.classList.remove('workspace-focus-tucked');},true);
  function fitIdentity(rec){
    var ctl=getController(),snapshot=ctl && ctl.details && ctl.details.snapshot(),definition=rec && rec.viewport && rec.viewport.viewDefinition();
    return JSON.stringify([rec && rec.reference,snapshot && snapshot.section,snapshot && snapshot.frames.map(function(f){return f.node;}),definition && definition.id]);
  }
  function selectedByEvent(ev){
    if(selecting)return;
    var element=ev.target.closest('.doc-sec'),rec=records().find(function(r){return r.sectionEl===element;});
    if(!rec){var ctl=getController(),child=ctl && ctl.details && ctl.details.activeSection();if(!child || child.sectionEl!==element)return;}
    if(rec && ev.type==='diagram-view-change' && rec.number!==section+1)return;
    if(rec){
      view.dispatchEvent(new CustomEvent('workbench-view-section',{detail:rec.number-1}));
      select(rec.number-1);
    }else select(section);
  }
  view.addEventListener('local-handoff-navigation',function(ev){
    var index=ev.detail && ev.detail.section;if(!Number.isInteger(index))return;
    var rec=records().find(function(r){return r.number===index+1;});
    if(!rec)return;
    view.dispatchEvent(new CustomEvent('workbench-view-section',{detail:index}));
    select(index);
  });
  view.addEventListener('tab-view-change',function(ev){if(!selecting && ev.detail)select(ev.detail.section-1);});
  view.addEventListener('diagram-tab-change',function(ev){
    var target=ev.detail,matching=target && records().filter(function(r){return !r.detailOnly && r.tabBlock===target.tabBlock && r.tab===target.tab;}) || [];
    var ctl=getController(),rec=ctl && ctl.views && ctl.views.primary(target.tabBlock,target.tab) || matching.find(function(r){return r.viewport;}) || matching[0];
    if(!rec)return;
    view.dispatchEvent(new CustomEvent('workbench-view-section',{detail:rec.number-1}));
    select(rec.number-1);
  });
  surface.addEventListener('explore-placement-change',function(){paintZoom();});
  function paintZoom(){
    var vp=viewport(),value=vp && vp.canvasZoom();
    var percent=(value || 1)*100;document.getElementById('workspace-zoom').textContent=(percent<1?Math.round(percent*100)/100:Math.round(percent))+'%';
    var scope=vp && vp.panelPlacement()==='canvas'?'Canvas':'Diagram';document.getElementById('workspace-fit').textContent='Fit '+scope.toLowerCase();canvasMenu.parentNode.querySelector('.workspace-zoom-label').textContent=scope+' zoom';document.getElementById('workspace-zoom-out').setAttribute('aria-label',scope+' zoom out');document.getElementById('workspace-zoom-in').setAttribute('aria-label',scope+' zoom in');document.getElementById('workspace-zoom').title='Reset '+scope.toLowerCase()+' to 100%';
  }
  function fit(selection,automatic){
    if(!selection || !Number.isFinite(selection.w))selection=null;
    if(selection && Number.isInteger(selection.section) && selection.section!==section)select(selection.section);
    var rec=current(),vp=viewport();if(!vp)return;
    if(!diagramMode()){
      if(!selection || !rec.boardSize)return;
      var target=rec.sectionEl.querySelector('.board');if(!target)return;
      target.scrollIntoView({block:'center',inline:'nearest'});
      var bounds=target.getBoundingClientRect(),scale=target.offsetWidth?bounds.width/target.offsetWidth:1,insets={left:24,right:24,top:24,bottom:24};
      document.querySelectorAll('.workspace-window:not([hidden])').forEach(function(win){var r=win.getBoundingClientRect();if(!r.width || r.bottom<=bounds.top || r.top>=bounds.bottom)return;if(r.left<bounds.left+bounds.width/2)insets.left=Math.max(insets.left,(r.right-bounds.left+16)/scale);else insets.right=Math.max(insets.right,(bounds.right-r.left+16)/scale);});
      if(target.clientWidth-insets.left-insets.right<100)insets.left=insets.right=24;
      rec.boardSize.fitSelection(selection,insets);return;
    }
    var target=board(),bounds=target && target.getBoundingClientRect(),left=20,right=24,top=20,bottom=24,width=bounds?bounds.width:innerWidth;
    var player=current() && current().sectionEl.querySelector('.explore-player'),playerRect=player && !player.hidden && !player.closest('.explore-canvas-objects') && player.getBoundingClientRect();
    if(bounds && playerRect && playerRect.top>=bounds.top+bounds.height/2)bottom=Math.max(bottom,bounds.bottom-playerRect.top+12);
    document.querySelectorAll('.workspace-window:not([hidden]):not([data-docked="true"])').forEach(function(win){
      var r=win.getBoundingClientRect();if(r.left<innerWidth/2)left=Math.max(left,Math.min(width*.4,r.right-(bounds?bounds.left:0)+16));else right=Math.max(right,Math.min(width*.4,(bounds?bounds.right:innerWidth)-r.left+16));
    });
    if(width-left-right<350){left=20;right=24;}
    var insets={left:left,right:right,top:top,bottom:bottom};
    if(selection){
      var obstacles=[];
      document.querySelectorAll('.workspace-window:not([hidden]),.workspace-canvas-controls').forEach(function(el){var r=el.getBoundingClientRect();if(bounds && r.width && r.height)obstacles.push({x:r.left-bounds.left,y:r.top-bounds.top,w:r.width,h:r.height});});
      vp.fitSelection(selection,{left:24,right:24,top:24,bottom:24},obstacles);
    }else vp.fitCanvas(insets,null,null,false,automatic);
    paintZoom();
  }
  function cancelFit(){cancelAnimationFrame(fitPending);fitPending=0;fitObserver.disconnect();}
  function scheduleFit(){cancelFit();fitPending=requestAnimationFrame(function(){fitPending=requestAnimationFrame(autoFit);});}
  function autoFit(){
    fitPending=0;if(!diagramMode())return;
    var rec=current(),vp=viewport(),definition=vp && vp.viewDefinition(),target=board();
    if(!target || !target.clientWidth || !target.clientHeight){if(target)fitObserver.observe(target);return;}
    fitObserver.disconnect();fitRequests.delete(fitIdentity(rec));if(rec)rec.canvasVisited=true;
    if(!(definition && definition.exploreLayout && definition.exploreLayout.camera))fit(null,true);
  }
  function select(index){
    if(selecting)return;selecting=true;cancelFit();
    paintTitle();
    var changedSection=section!==index;finish(true);saveDetail();section=index;
    var ctl=getController(),base=records().find(function(r){return r.number===section+1;}),details=ctl && ctl.details,snapshot=details && details.snapshot();
    if(snapshot && base && snapshot.section!==base.reference)details.close(true);
    if(base && ctl.views && !base.detailOnly)ctl.views.ensure(base,undefined,true);
    var all=records(),rec=current();if(!rec){rec=all[0];section=rec?rec.number-1:0;}
    if(activeCanvas && all.indexOf(activeCanvas)<0 && activeCanvas!==rec){activeCanvas.sectionEl.classList.remove('workspace-active-section');if(activeCanvas.viewport)activeCanvas.viewport.setWorkbenchCanvas(false);}
    var child=rec && all.indexOf(rec)<0?detailEntry(details.snapshot()):null;
    if(child && rec!==activeCanvas && rec.viewport){
      var resolved=resolveDetail(child.context),config=JSON.stringify([resolved.diagram.layouts,resolved.diagram.sectionLayout]);
      if(child.config!==undefined && child.config!==config)child.reader={};
      rec.viewport.restoreCanvasState(child.reader);rec.canvasVisited=child.visited;child.config=config;
    }
    if(rec && all.indexOf(rec)<0){
      var inherited=false;
      (details.activeSections?details.activeSections().slice(0,-1):[base]).forEach(function(parent){
        var definition=parent.viewport && parent.viewport.viewDefinition();
        if(explicitView(parent))inherited=definition.presentation==='explore';
      });
      rec.inheritedExplore=inherited;all=all.concat(rec);
    }
    if(focusState && identity(rec)!==focusState.key)releaseFocus(false);
    var key=identity(rec),requestedFit=fitRequests.has(fitIdentity(rec));selectionKey=key;
    activeCanvas=rec;activeDetail=child;
    document.body.classList.toggle('workspace-diagram',diagramMode());
    if(ctl && navigationController!==ctl){if(navigation)navigation.destroy();navigation=createExploreNavigation(ctl,{contents:true,themePicker:false,zoomLabels:true,isCanvas:diagramMode,skipTabShare:true,insetTarget:document.body,initialOpen:contentsOpen,onOpenChange:function(value){contentsOpen=value;requestAnimationFrame(measureChrome);},fit:function(){if(!diagramMode())return false;fit();return true;},selectSection:function(target){view.dispatchEvent(new CustomEvent('workbench-view-section',{detail:target.number-1}));select(target.number-1);}});navigationController=ctl;}
    // Measure navigation in its selected, visible section before the viewport
    // restores its camera. Hidden navigation reports zero height and would cause
    // an unnecessary resize (and camera rounding) immediately after restoration.
    all.forEach(function(r){
      var on=diagramMode() && r===rec;
      r.sectionEl.classList.toggle('workspace-active-section',on);
      r.sectionEl.classList.toggle('workspace-empty-section',on && !r.viewport);
    });
    if(rec && rec.tabBlock){var tabs=ctl.tabBlocks[rec.tabBlock-1];if(tabs && tabs.active()!==rec.tab)tabs.select(rec.tab,false,false);}
    if(navigation){navigation.mount(rec);if(navigationState && navigation.contents){navigation.contents.restore(navigationState);navigationState=null;}if(focusState && navigation.contents)navigation.contents.setOpen(false);measureChrome();}
    all.forEach(function(r){
      var on=diagramMode() && r===rec;
      if(r.viewport && !on){
        r.viewport.setWorkbenchCanvas(false);
        if(r===rec && exploreView(r) && !r.pageCanvasVisited){r.viewport.restoreInitialCamera(true);r.pageCanvasVisited=true;}
      }
      if(r.viewport){r.viewport.setWorkbenchFocus(!!focusState && r===rec);r.viewport.setWorkbenchCanvas(on);
        if(on && (!r.canvasVisited || requestedFit))scheduleFit();}
    });
    // A View can enter Explore before the shared navigation is mounted.
    // Reconcile the camera immediately with the stage space the top bar took.
    if(diagramMode() && rec && rec.viewport){rec.viewport.refresh();if(!rec.canvasVisited)rec.viewport.restoreInitialCamera();}
    document.querySelectorAll('#workspace-pan,#workspace-zoom-out,#workspace-zoom,#workspace-zoom-in,#workspace-fit').forEach(function(b){b.disabled=!diagramMode() || !rec || !rec.viewport;b.hidden=b.disabled;});
    mountCanvasCommand(rec);paintZoom();paintFocus();selecting=false;measureChrome();
    if(changedSection && rec && !diagramMode())rec.sectionEl.scrollIntoView({block:'start'});
  }
  function capture(){
    cancelFit();
    if(skipCapture){skipCapture=false;saved=null;savedDetail=null;restoreCanvasCommand();if(navigation)navigation.restore();return;}
    if(navigation && navigation.contents)navigationState=navigation.contents.snapshot();
    saveDetail();
    var ctl=getController(),snapshot=ctl && ctl.details && ctl.details.snapshot();
    var context=detailContext(snapshot);savedDetail=context?{context:context,navigation:snapshot}:null;
    activeCanvas=null;activeDetail=null;
    var page=getPage();saved=page?workbenchPreviewSections(page):null;savedSelection=saved && saved[section];
    var owner=ctl && ctl.views && ctl.views.owner(records().find(function(rec){return rec.number===section+1;}));savedOwnerSections=owner && saved?owner.records.map(function(record){return saved[record.number-1];}):null;
    if(saved)records().forEach(function(rec){var s=saved[rec.number-1];if(s && rec.viewport){
      s.reader=rec.viewport.snapshotCanvasState();s.boardNavigation=rec.boardSize && rec.boardSize.snapshot();s.config=JSON.stringify([s.diagram.layouts,s.diagram.sectionLayout]);s.visited=rec.canvasVisited;
    }});
    restoreCanvasCommand();if(navigation)navigation.restore();
  }
  function rendered(outcome){
    if(!outcome.ok){if(outcome.replaced)releaseFocus(false);return;}if(!outcome.replaced)return;
    var page=getPage(),matches=saved && page?matchWorkbenchPreviewSections(saved,workbenchPreviewSections(page)):new Map();
    records().forEach(function(rec){
      var prior=matches.get(rec.number-1),d=page && sectionRecords(page)[rec.number-1].section.diagram || {};
      if(prior && prior.reader && rec.viewport){
        var memory=prior.reader;
        if(prior.config!==JSON.stringify([d.layouts,d.sectionLayout])){
          // Panel Undo restores authored rectangles while navigation stays where
          // the reader left it. An actual authored camera/type change resets it.
          memory={};var oldViews=diagramLayoutViews(prior.diagram);
          diagramLayoutViews(d).forEach(function(definition){
            var old=oldViews.find(function(v){return v.id===definition.id;}),implicitView=!oldViews.length && ['flow','home'].indexOf(definition.id)>=0,state=prior.reader[definition.id];
            var oldCamera=old && old.exploreLayout && old.exploreLayout.camera,newCamera=definition.exploreLayout && definition.exploreLayout.camera;
            if(!state || (!implicitView && (!old || old.presentation!==definition.presentation)) || JSON.stringify(oldCamera)!==JSON.stringify(newCamera))return;
            memory[definition.id]={panels:{},focus:state.focus,scroll:state.scroll,zoom:state.zoom,layout:definition.exploreLayout || {}};
          });
        }
        rec.viewport.restoreCanvasState(memory);var definition=rec.viewport.viewDefinition();
        rec.canvasVisited=prior.visited && !!(definition && memory[definition.id]);
      }
    });
    if(saved && matches.get(section)!==savedSelection){
      selectionKey=null;var matched=records().find(function(rec){return matches.get(rec.number-1)===savedSelection;});
      if(!matched && savedOwnerSections){var sibling=records().find(function(rec){return savedOwnerSections.indexOf(matches.get(rec.number-1))>=0;});var owner=sibling && getController().views.owner(sibling);matched=owner && owner.selected;}
      if(matched){section=matched.number-1;view.dispatchEvent(new CustomEvent('workbench-view-section',{detail:section}));}
    }
    if(focusState){
      var match=records().find(function(rec){return matches.get(rec.number-1)===savedSelection;});
      if(!match)releaseFocus(false);else{section=match.number-1;focusState.key=JSON.stringify([section].concat(JSON.parse(focusState.key).slice(1)));}
    }
    saved=null;savedSelection=null;savedOwnerSections=null;
    var ctl=getController(),resolved=savedDetail && resolveDetail(savedDetail.context);
    if(resolved && ctl && ctl.details){
      section=resolved.indices[0];ctl.details.restore(Object.assign({},savedDetail.navigation,{section:resolved.reference}));
    }
    savedDetail=null;select(section);
    // The navigation mount restores the outer section zoom. Restore Standard
    // scroll coordinates only once its final layout can accept them; restoring
    // into the temporary unzoomed board can clamp the saved camera.
    records().forEach(function(rec){
      var prior=matches.get(rec.number-1);
      if(prior && rec.boardSize && rec.viewport && !rec.viewport.isExplore())rec.boardSize.restore(prior.boardNavigation);
    });

  }
  function setZoom(value){var vp=viewport();if(diagramMode() && vp){vp.canvasZoom(value);paintZoom();}}
  function paintHand(){surface.classList.toggle('canvas-hand',hand || spaceHeld);document.getElementById('workspace-pan').setAttribute('aria-pressed',String(hand));}
  function finish(cancel){
    if(!drag)return;var g=drag;drag=null;
    if(cancel){g.board.scrollLeft=g.left;g.board.scrollTop=g.top;}
    surface.classList.remove('canvas-panning');if(surface.hasPointerCapture(g.id))surface.releasePointerCapture(g.id);
  }
  surface.addEventListener('pointerdown',function(ev){
    var target=board();if(!target || !target.contains(ev.target) || !ev.isPrimary || drag || !(ev.button===1 || ev.button===0 && (hand || spaceHeld)))return;
    ev.preventDefault();ev.stopPropagation();drag={board:target,id:ev.pointerId,x:ev.clientX,y:ev.clientY,left:target.scrollLeft,top:target.scrollTop};
    surface.setPointerCapture(ev.pointerId);surface.classList.add('canvas-panning');
  },true);
  surface.addEventListener('pointermove',function(ev){if(drag && drag.id===ev.pointerId){ev.preventDefault();ev.stopPropagation();drag.board.scrollLeft=drag.left-(ev.clientX-drag.x);drag.board.scrollTop=drag.top-(ev.clientY-drag.y);}},true);
  surface.addEventListener('pointerup',function(ev){if(drag && drag.id===ev.pointerId){ev.preventDefault();ev.stopPropagation();finish(false);}},true);
  surface.addEventListener('pointercancel',function(){finish(true);});surface.addEventListener('lostpointercapture',function(ev){if(drag)finish(ev.buttons!==0);});
  surface.addEventListener('click',function(ev){if((hand || spaceHeld) && ev.target.closest('.explore-board')){ev.preventDefault();ev.stopPropagation();}},true);
  window.addEventListener('keydown',function(ev){
    if(!diagramMode() || document.body.classList.contains('welcome-active'))return;
    if(ev.key==='Escape' && drag){ev.preventDefault();ev.stopPropagation();finish(true);return;}
    if(ev.code==='Space' && !ev.ctrlKey && !ev.metaKey && !ev.target.closest('input,textarea,select,button,summary,[contenteditable="true"],.workspace-window,dialog')){ev.preventDefault();spaceHeld=true;paintHand();}
  },true);
  window.addEventListener('keyup',function(ev){if(ev.code==='Space'){spaceHeld=false;paintHand();}});
  window.addEventListener('blur',function(){spaceHeld=false;paintHand();finish(true);});
  window.addEventListener('resize',function(){finish(true);paintZoom();});
  view.addEventListener('detail-navigation',function(){select(section);});
  view.addEventListener('workbench-panel-geometry',function(event){
    if(!history || !getPage())return;
    var element=event.target.closest('[data-dv-section]'),rec=records().find(function(r){return r.sectionEl===element;}),change=event.detail;
    if(!rec){
      if(!activeDetail || !activeCanvas || activeCanvas.sectionEl!==element)return;
      saveDetail();var entry=activeDetail;
      history({before:change.before,after:change.after,restore:function(value){
        var resolved=resolveDetail(entry.context);if(!resolved)return 'expired';
        if(activeDetail===entry && activeCanvas && activeCanvas.viewport){
          if(!activeCanvas.viewport.restoreCanvasPanelGeometry(change.view,value))return 'expired';
          saveDetail();return true;
        }
        // A closed detail keeps its own saved geometry; Undo never opens it.
        return restoreCanvasPanelMemory(resolved.diagram,entry.reader,change.view,value)?true:'expired';
      }});return;
    }
    var sections=workbenchPreviewSections(getPage()),origin=sections[rec.number-1];
    if(!origin)return;
    history({before:change.before,after:change.after,restore:function(value){
      if(!getPage())return 'expired';
      var matches=matchWorkbenchPreviewSections(sections,workbenchPreviewSections(getPage()));
      var current=records().find(function(r){return matches.get(r.number-1)===origin;});
      return current && current.viewport && current.viewport.restoreCanvasPanelGeometry(change.view,value)?true:'expired';
    }});
  });
  surface.addEventListener('workbench-canvas-view',function(){var rec=current();if(rec)fitRequests.add(fitIdentity(rec));});
  view.addEventListener('diagram-view-change',selectedByEvent);
  view.addEventListener('explore-overlay-scale',paintZoom);
  view.addEventListener('click',function(ev){if(ev.target.closest('[data-view-layout],.section-view-settings'))selectedByEvent(ev);},true);
  view.addEventListener('change',function(ev){if(ev.target.closest('.section-view-settings'))selectedByEvent(ev);},true);
  // Named arrangement clicks also select their section.
  view.addEventListener('click',function(ev){if(ev.target.closest('[data-view-layout]'))selectedByEvent(ev);});
  document.getElementById('workspace-pan').addEventListener('click',function(){hand=!hand;paintHand();});
  document.getElementById('workspace-zoom-in').addEventListener('click',function(){setZoom(viewport().canvasZoom()*1.2);});
  document.getElementById('workspace-zoom-out').addEventListener('click',function(){setZoom(viewport().canvasZoom()/1.2);});
  document.getElementById('workspace-zoom').addEventListener('click',function(){setZoom(1);});
  document.getElementById('workspace-fit').addEventListener('click',fit);
  view.addEventListener('workbench-fit-selection',function(event){fit(event.detail);});
  new MutationObserver(function(changes){if(changes.some(function(m){return m.target.nodeType===1 && m.target.matches('.explore-zoom');}))paintZoom();}).observe(view,{childList:true,subtree:true});
  return {setHistory:function(value){history=value;},bind:function(controller,page){getController=controller;getPage=page;},select:select,capture:capture,rendered:rendered,
    reset:function(){releaseFocus(false);navigationState=null;cancelFit();if(navigation)navigation.restore();fitRequests.clear();skipCapture=true;saved=null;savedDetail=null;activeDetail=null;detailStates=[];section=0;selectionKey=null;},fit:fit};
}
