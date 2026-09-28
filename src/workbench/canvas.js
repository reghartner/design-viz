/* The active diagram is the editor's canvas. Its camera and floating reader
   panels stay temporary; Page preview exposes the authored document layout. */
function initWorkbenchCanvas(){
  var surface=document.getElementById('workspace-canvas'),view=document.getElementById('docview');
  var mode=document.getElementById('workspace-view'),getController=function(){return null;},getPage=function(){return null;};
  var section=0,hand=false,spaceHeld=false,drag=null,saved=null,skipCapture=false,fitPending=0;
  function records(){var ctl=getController();return ctl && ctl.sections || [];}
  function current(){return records().find(function(r){return r.number===section+1;});}
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
  function select(index){
    finish(true);section=index;
    var all=records(),rec=current();if(!rec){rec=all[0];section=rec?rec.number-1:0;}
    document.body.classList.toggle('workspace-diagram',diagramMode());
    all.forEach(function(r){
      var on=diagramMode() && r===rec;
      r.sectionEl.classList.toggle('workspace-active-section',on);
      r.sectionEl.classList.toggle('workspace-empty-section',on && !r.viewport);
      if(r.viewport){var first=on && !r.viewport.isWorkbenchCanvas();r.viewport.setWorkbenchCanvas(on);
        if(first && !r.canvasVisited){r.canvasVisited=true;cancelAnimationFrame(fitPending);fitPending=requestAnimationFrame(fit);}}
    });
    if(rec && diagramMode() && rec.tabBlock){var ctl=getController(),tabs=ctl.tabBlocks[rec.tabBlock-1];if(tabs && tabs.active()!==rec.tab)tabs.select(rec.tab,false,false);}
    document.querySelectorAll('#workspace-pan,#workspace-zoom-out,#workspace-zoom,#workspace-zoom-in,#workspace-fit').forEach(function(b){b.disabled=!diagramMode() || !rec || !rec.viewport;});
    paintZoom();
  }
  function capture(){
    if(skipCapture){skipCapture=false;saved=null;return;}
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
    saved=null;select(section);
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
  surface.addEventListener('workbench-canvas-view',function(){cancelAnimationFrame(fitPending);fitPending=requestAnimationFrame(fit);});
  mode.addEventListener('change',function(){select(section);});
  document.getElementById('workspace-pan').addEventListener('click',function(){hand=!hand;paintHand();});
  document.getElementById('workspace-zoom-in').addEventListener('click',function(){setZoom(viewport().canvasZoom()*1.2);});
  document.getElementById('workspace-zoom-out').addEventListener('click',function(){setZoom(viewport().canvasZoom()/1.2);});
  document.getElementById('workspace-zoom').addEventListener('click',function(){setZoom(1);});
  document.getElementById('workspace-fit').addEventListener('click',fit);
  new MutationObserver(function(changes){if(changes.some(function(m){return m.target.nodeType===1 && m.target.matches('.explore-zoom');}))paintZoom();}).observe(view,{childList:true,subtree:true});
  return {bind:function(controller,page){getController=controller;getPage=page;},select:select,capture:capture,rendered:rendered,
    reset:function(){skipCapture=true;saved=null;section=0;},fit:fit};
}
