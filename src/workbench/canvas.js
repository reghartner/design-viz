/* The active diagram is the editor's canvas. Named Explore views author their
   floating defaults; Standard views keep temporary canvas panel geometry. */
function initWorkbenchCanvas(){
  var surface=document.getElementById('workspace-canvas'),view=document.getElementById('docview');
  var mode=document.getElementById('workspace-view'),getController=function(){return null;},getPage=function(){return null;};
  var section=0,hand=false,spaceHeld=false,drag=null,saved=null,skipCapture=false,fitPending=0,activeCanvas=null,history=null,activeDetail=null,detailStates=[],savedDetail=null;
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
  function diagramMode(){return mode.value==='diagram';}
  function paintZoom(){var vp=viewport(),value=vp && vp.canvasZoom();document.getElementById('workspace-zoom').textContent=Math.round((value || 1)*100)+'%';}
  function fit(){
    var vp=viewport();if(!diagramMode() || !vp)return;
    var left=84,right=24,top=145,bottom=195;
    document.querySelectorAll('.workspace-window:not([hidden])').forEach(function(win){
      var r=win.getBoundingClientRect();if(r.left<innerWidth/2)left=Math.max(left,Math.min(innerWidth*.4,r.right+16));else right=Math.max(right,Math.min(innerWidth*.4,innerWidth-r.left+16));
    });
    if(innerWidth-left-right<350){left=84;right=24;}
    vp.fitCanvas({left:left,right:right,top:top,bottom:bottom});paintZoom();
  }
  function autoFit(){var vp=viewport(),definition=vp && vp.viewDefinition();if(!(definition && definition.exploreLayout && definition.exploreLayout.camera))fit();}
  function select(index){
    finish(true);saveDetail();section=index;
    var ctl=getController(),base=records().find(function(r){return r.number===section+1;}),details=ctl && ctl.details,snapshot=details && details.snapshot();
    if(snapshot && base && snapshot.section!==base.reference)details.close(true);
    var all=records(),rec=current();if(!rec){rec=all[0];section=rec?rec.number-1:0;}
    if(activeCanvas && all.indexOf(activeCanvas)<0 && activeCanvas!==rec){activeCanvas.sectionEl.classList.remove('workspace-active-section');if(activeCanvas.viewport)activeCanvas.viewport.setWorkbenchCanvas(false);}
    var child=rec && all.indexOf(rec)<0?detailEntry(details.snapshot()):null;
    if(child && rec!==activeCanvas && rec.viewport){
      var resolved=resolveDetail(child.context),config=JSON.stringify([resolved.diagram.layouts,resolved.diagram.sectionLayout]);
      if(child.config!==undefined && child.config!==config)child.reader={};
      rec.viewport.restoreCanvasState(child.reader);rec.canvasVisited=child.visited;child.config=config;
    }
    if(rec && all.indexOf(rec)<0)all=all.concat(rec);activeCanvas=rec;activeDetail=child;
    document.body.classList.toggle('workspace-diagram',diagramMode());
    all.forEach(function(r){
      var on=diagramMode() && r===rec;
      if(r.viewport && !on)r.viewport.setWorkbenchCanvas(false);
      r.sectionEl.classList.toggle('workspace-active-section',on);
      r.sectionEl.classList.toggle('workspace-empty-section',on && !r.viewport);
      if(r.viewport){var first=on && !r.viewport.isWorkbenchCanvas();r.viewport.setWorkbenchCanvas(on);
        if(first && !r.canvasVisited){r.canvasVisited=true;cancelAnimationFrame(fitPending);fitPending=requestAnimationFrame(autoFit);}}
    });
    if(rec && diagramMode() && rec.tabBlock){var ctl=getController(),tabs=ctl.tabBlocks[rec.tabBlock-1];if(tabs && tabs.active()!==rec.tab)tabs.select(rec.tab,false,false);}
    document.querySelectorAll('#workspace-pan,#workspace-zoom-out,#workspace-zoom,#workspace-zoom-in,#workspace-fit').forEach(function(b){b.disabled=!diagramMode() || !rec || !rec.viewport;});
    paintZoom();
  }
  function capture(){
    if(skipCapture){skipCapture=false;saved=null;savedDetail=null;return;}
    saveDetail();
    var ctl=getController(),snapshot=ctl && ctl.details && ctl.details.snapshot();
    var context=detailContext(snapshot);savedDetail=context?{context:context,navigation:snapshot}:null;
    activeCanvas=null;activeDetail=null;
    var page=getPage();saved=page?workbenchPreviewSections(page):null;
    if(saved)records().forEach(function(rec){var s=saved[rec.number-1];if(s && rec.viewport){s.reader=rec.viewport.snapshotCanvasState();s.config=JSON.stringify([s.diagram.layouts,s.diagram.sectionLayout]);s.visited=rec.canvasVisited;}});
  }
  function rendered(outcome){
    if(!outcome.ok || !outcome.replaced)return;
    var page=getPage(),matches=saved && page?matchWorkbenchPreviewSections(saved,workbenchPreviewSections(page)):new Map();
    records().forEach(function(rec){
      var prior=matches.get(rec.number-1),d=page && sectionRecords(page)[rec.number-1].section.diagram || {};
      if(prior && prior.reader && rec.viewport && prior.config===JSON.stringify([d.layouts,d.sectionLayout])){
        rec.viewport.restoreCanvasState(prior.reader);rec.canvasVisited=prior.visited;
      }
    });
    saved=null;
    var ctl=getController(),resolved=savedDetail && resolveDetail(savedDetail.context);
    if(resolved && ctl && ctl.details){
      section=resolved.indices[0];ctl.details.restore(Object.assign({},savedDetail.navigation,{section:resolved.reference}));
    }
    savedDetail=null;select(section);
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
  surface.addEventListener('wheel',function(ev){if((ev.ctrlKey || ev.metaKey) && ev.target.closest('.explore-board')){ev.preventDefault();setZoom(viewport().canvasZoom()*Math.exp(-ev.deltaY*.006));}},{passive:false});
  window.addEventListener('keydown',function(ev){
    if(!diagramMode() || document.body.classList.contains('welcome-active'))return;
    if(ev.key==='Escape' && drag){ev.preventDefault();ev.stopPropagation();finish(true);return;}
    if(ev.code==='Space' && !ev.ctrlKey && !ev.metaKey && !ev.target.closest('input,textarea,select,button,[contenteditable="true"],.workspace-window')){ev.preventDefault();spaceHeld=true;paintHand();}
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
  surface.addEventListener('workbench-canvas-view',function(){cancelAnimationFrame(fitPending);fitPending=requestAnimationFrame(autoFit);});
  mode.addEventListener('change',function(){select(section);});
  document.getElementById('workspace-pan').addEventListener('click',function(){hand=!hand;paintHand();});
  document.getElementById('workspace-zoom-in').addEventListener('click',function(){setZoom(viewport().canvasZoom()*1.2);});
  document.getElementById('workspace-zoom-out').addEventListener('click',function(){setZoom(viewport().canvasZoom()/1.2);});
  document.getElementById('workspace-zoom').addEventListener('click',function(){setZoom(1);});
  document.getElementById('workspace-fit').addEventListener('click',fit);
  new MutationObserver(function(changes){if(changes.some(function(m){return m.target.nodeType===1 && m.target.matches('.explore-zoom');}))paintZoom();}).observe(view,{childList:true,subtree:true});
  return {setHistory:function(value){history=value;},bind:function(controller,page){getController=controller;getPage=page;},select:select,capture:capture,rendered:rendered,
    reset:function(){skipCapture=true;saved=null;savedDetail=null;activeDetail=null;detailStates=[];section=0;},fit:fit};
}
