/* Standalone Explore uses the browser (or embedding frame). Dialog hosts supply
   a containing surface for the canvas and its scroll lock. Curated standard
   views keep their document layout. Navigation never edits the spec. */
function initViewerExploreCanvas(ctl,view,opts){
  var container=opts && opts.container || document.body;
  view.classList.toggle('navigation-contained',container!==document.body || !!(opts && opts.contained));
  var active=null,detailRoot=null,detailOriginExplore=false,seen=new Set(),frame=0,lastTarget=null;
  var fitObserver=new ResizeObserver(function(entries){
    if(!frame && entries.some(function(entry){return entry.contentRect.width && entry.contentRect.height;}))frame=requestAnimationFrame(firstFit);
  }),fitRecord=null,fitDefinition=null,fitKey=null;
  function selectSection(rec){
    detailRoot=null;
    if(ctl.views && !ctl.views.ensure(rec,undefined,true))return;
    if(ctl.details)ctl.details.showSection(rec.reference);
    if(rec.tabBlock)ctl.tabBlocks[rec.tabBlock-1].select(rec.tab,false);
    ctl.activeTarget={kind:'diagram',section:rec.number};
    if(ctl.onChange)ctl.onChange();
    show(rec);if(!active)rec.sectionEl.scrollIntoView({block:'start'});
  }
  var navigation=createExploreNavigation(ctl,{selectSection:selectSection,action:opts && opts.action,isCanvas:function(){return !!active;}});
  function cancelFirstFit(){cancelAnimationFrame(frame);frame=0;fitObserver.disconnect();fitRecord=fitDefinition=fitKey=null;}
  function firstFit(){
    frame=0;var rec=fitRecord,definition=fitDefinition,key=fitKey;
    if(!rec || active!==rec || active.viewport.viewDefinition().id!==definition.id){cancelFirstFit();return;}
    var board=rec.sectionEl.querySelector('.board');
    if(!board || !board.clientWidth || !board.clientHeight){if(board)fitObserver.observe(board);return;}
    cancelFirstFit();seen.add(key);
    if(!(definition.exploreLayout && definition.exploreLayout.camera))active.viewport.fitCanvas({left:24,right:board.clientWidth<=640?24:260,top:20,bottom:180});
  }
  function show(rec){
    cancelFirstFit();
    var definition=ctl.views && ctl.views.current(rec);
    var previous=active;active=rec && (rec.viewport && rec.viewport.isExplore() || !rec.viewport && definition && definition.presentation==='explore')?rec:null;
    if(previous && previous!==active){
      // Restore focused tab/chapter controls before the viewport changes DOM
      // ownership; otherwise a keyboard mode switch can strand focus on body.
      previous.sectionEl.classList.remove('explore-active-section');if(previous.viewport){previous.viewport.setReaderCanvas(false);if(previous.sectionEl.hasAttribute('data-dv-detail-preview'))previous.viewport.setWorkbenchCanvas(false);}
    }
    container.classList.toggle('viewer-exploring',!!active);view.classList.toggle('explore-full-window',!!active);
    if(!active){
      // Moving the real tab bars changes the height above a routed contract.
      // Keep its reader scroll anchor; dialog/native hosts own their own scroll.
      var anchor=container===document.body && view.querySelector('.dv-hash-target');
      if(anchor!==document.activeElement)anchor=null;
      var top=anchor && anchor.getBoundingClientRect().top;
      navigation.mount(rec);
      if(anchor && anchor.isConnected)window.scrollBy(0,anchor.getBoundingClientRect().top-top);
      return;
    }
    active.sectionEl.classList.add('explore-active-section');
    navigation.mount(active);
    var detail=ctl.details && ctl.details.snapshot(),root=detail && ctl.sections.find(function(r){return r.reference===detail.section;});
    if(!active.viewport)return;
    active.viewport.setReaderCanvas(true);
    active.viewport.restoreInitialCamera();
    var definition=active.viewport.viewDefinition(),key=active.number+':'+definition.id;
    if(!seen.has(key)){
      fitRecord=rec;fitDefinition=definition;fitKey=key;frame=requestAnimationFrame(function(){
        // Boot-time indexing briefly visits other views. Only mark a view after
        // its frame actually opens, so those cancelled visits cannot skip Fit.
        firstFit();
      });
    }
  }
  function viewChanged(ev){
    if(ctl.views && ctl.views.updating())return;
    var rec=ctl.sections.find(function(r){return r.sectionEl.contains(ev.target);});
    if(rec && !rec.detailOnly && !rec.viewExcluded){if(ctl.views)ctl.views.ensure(rec,undefined,true);show(rec);}
    else if(ctl.details && ctl.details.activeSections().some(function(r){return r.sectionEl.contains(ev.target);})){
      detailChanged();
    }
  }
  view.addEventListener('diagram-view-change',viewChanged);
  function tabViewChanged(){var rec=ctl.sections.find(function(r){return r.number===ctl.activeTarget.section;});if(rec)show(rec);}
  view.addEventListener('tab-view-change',tabViewChanged);
  function detailChanged(){
    var stack=ctl.details && ctl.details.activeSections?ctl.details.activeSections():[];
    if(stack.length>1){
      if(detailRoot!==stack[0]){detailRoot=stack[0];detailOriginExplore=active===detailRoot;}
      var inherited=detailOriginExplore;
      stack.slice(1).forEach(function(rec){
        var p=rec.presentation,id=p && p.viewId && p.viewId(),definition=rec.viewport && rec.viewport.viewDefinition();
        var explicit=definition && !definition.legacy && p && p.views && p.views().some(function(v){return v.id===id;});
        rec.viewport.setWorkbenchCanvas(!explicit && inherited);inherited=rec.viewport.isExplore();
      });
      show(stack[stack.length-1]);
    }else if(detailRoot){var root=detailRoot;detailRoot=null;show(root);}
    else if(active){var target=ctl.activeTarget;show(ctl.sections.find(function(r){return target && r.number===target.section;}));}
  }
  view.addEventListener('detail-navigation',detailChanged);
  function tabPrimary(target){if(target && ctl.views)return ctl.views.primary(target.tabBlock,target.tab);return target && ctl.sections.find(function(r){return !r.detailOnly && r.hasDiagram && r.viewport && r.tabBlock===target.tabBlock && r.tab===target.tab;});}
  function exploreDefinition(rec){var definition=rec && rec.viewport && rec.viewport.viewDefinition();return definition && definition.presentation==='explore'?rec:null;}
  function navigationState(){
    var target=ctl.activeTarget,rec=target && target.kind==='diagram'?ctl.sections.find(function(r){return r.number===target.section;}):null;
    if(!rec && target && target.kind==='tab')rec=tabPrimary(target) || ctl.sections.find(function(r){return r.tabBlock===target.tabBlock && r.tab===target.tab;});
    // A page/contract target still has a selected owner View. Restoring such a
    // route (for example after a tour) must not empty the document navigation.
    if(!rec){
      var visible=ctl.sections.find(function(r){return !r.detailOnly && !r.viewExcluded && (!r.tabBlock || ctl.tabBlocks[r.tabBlock-1].active()===r.tab);});
      rec=visible && (ctl.views && ctl.views.primary(visible.tabBlock,visible.tab) || visible);
    }
    var ownerView=ctl.views && ctl.views.current(rec),definition=rec && rec.viewport && rec.viewport.viewDefinition();
    return {rec:rec,key:JSON.stringify([target,ownerView && ownerView.id,definition && definition.id,definition && definition.presentation])};
  }
  function navigationChanged(){
    var state=navigationState();if(state.key===lastTarget)return;lastTarget=state.key;
    detailRoot=null;show(state.rec);
  }
  var priorChange=ctl.onChange;
  function changed(){if(priorChange)priorChange.apply(ctl,arguments);navigationChanged();}
  ctl.onChange=changed;
  window.addEventListener('hashchange',navigationChanged);
  var target=ctl.activeTarget,initial=target && target.kind==='diagram'?ctl.sections.find(function(r){return r.number===target.section;}):target && target.kind==='tab'?tabPrimary(target):null;
  if(!initial && (!target || target.kind!=='tab'))initial=ctl.sections.find(function(r){return !r.detailOnly && r.viewport && r.viewport.isExplore() && !r.tabBlock;});
  if(!initial)initial=ctl.sections.find(function(r){return !r.detailOnly && (!r.tabBlock || ctl.tabBlocks[r.tabBlock-1].active()===r.tab);});
  show(initial);lastTarget=navigationState().key;if(ctl.details && ctl.details.activeSection && ctl.details.activeSection())detailChanged();
  return {destroy:function(){if(ctl.onChange===changed)ctl.onChange=priorChange;window.removeEventListener('hashchange',navigationChanged);view.removeEventListener('detail-navigation',detailChanged);view.removeEventListener('diagram-view-change',viewChanged);cancelFirstFit();show(null);navigation.destroy();view.classList.remove('navigation-contained');view.removeEventListener('tab-view-change',tabViewChanged);}};
}
