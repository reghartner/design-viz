/* Desktop metrics placement and width (#1242 corner handles, Alt+Left/Right). A gesture previews only SVG geometry; one accepted
   planner result owns source/history. Renderer ordinals also identify authored
   local detail copies; external documents have no editable ordinal. */
function createTelemetryCardLayoutEditor(opts){
  var life=createWorkbenchLifetime(),view=opts.view,win=opts.window,gesture=null,nudge=null,suppress=false;
  function cardFrom(ev){return ev.target.closest && !ev.target.closest('a') && ev.target.closest('.dv-metrics-card[data-metrics-section]');}
  function context(card){
    if(!card || !card.isConnected || opts.disabled())return null;
    var snapshot=opts.session.snapshot();if(snapshot.error || snapshot.renderedText!=null && snapshot.renderedText!==snapshot.text)return null;
    var target={kind:'edge',section:Number(card.getAttribute('data-metrics-section')),index:Number(card.getAttribute('data-dv-edge')),key:card.getAttribute('data-metrics-card')};
    var topology=opts.session.topologyContext?opts.session.topologyContext():null;
    var resolved=telemetryCarrierTarget(snapshot.text,snapshot.raw,target,topology);if(resolved.error)return null;
    var matrix=card.transform.baseVal.consolidate(),svg=card.ownerSVGElement;if(!matrix || !svg)return null;
    var rect=card.querySelector('.dv-metrics-card-box');
    return {card:card,svg:svg,snapshot:snapshot,target:target,topology:topology,contextKey:JSON.stringify(topology),
      width:Number(rect && rect.getAttribute('width')),height:Number(rect && rect.getAttribute('height')),
      anchor:{x:Number(card.getAttribute('data-metrics-anchor-x')),y:Number(card.getAttribute('data-metrics-anchor-y'))},
      origin:{x:matrix.matrix.e,y:matrix.matrix.f},
      leader:svg.querySelector('.dv-metrics-leader[data-dv-edge="'+target.index+'"]'),labels:telemetryTraceLabelBoxes(svg)};
  }
  function fresh(c){var now=opts.session.snapshot();return c.card.isConnected && !opts.disabled() && now.text===c.snapshot.text && now.project===c.snapshot.project && (now.renderedText==null || now.renderedText===now.text) && JSON.stringify(opts.session.topologyContext?opts.session.topologyContext():null)===c.contextKey;}
  function point(c,ev){try{var matrix=c.svg.getScreenCTM();if(!matrix)return null;var p=c.svg.createSVGPoint();p.x=ev.clientX;p.y=ev.clientY;return p.matrixTransform(matrix.inverse());}catch(ex){return null;}}
  function preview(c,p){
    c.card.setAttribute('transform','translate('+p.x+' '+p.y+')');
    var rect=c.card.querySelector('rect'),w=Number(rect.getAttribute('width')),h=Number(rect.getAttribute('height')),a=c.anchor;
    // Same leader as the live paint, with its gap at trace labels (#1163).
    if(c.leader)c.leader.setAttribute('d',telemetryCardLeaderTo(a,{x:p.x,y:p.y,w:w,h:h},c.labels));
  }
  /* #1242: a width preview. A west handle keeps the right edge in place; an east handle and
     Alt+Left/Right the left edge. The saved card is pinned exactly where the preview shows it. */
  function clampWidth(w){return Math.max(TELEMETRY_CARD_WIDTH_MIN,Math.min(TELEMETRY_CARD_WIDTH_MAX,Math.round(w)));}
  function resizedLeft(c,w,west){return c.origin.x+(west?c.width-w:0);}
  var CLIP='dv-metrics-resize-clip';
  // Content keeps its old wrapping until the commit re-renders; clip it to the previewed box.
  function clipContent(c,w){
    var doc=c.card.ownerDocument,clip=c.card.querySelector('#'+CLIP);
    if(!clip){
      clip=telemetrySvg(doc,'clipPath',{id:CLIP,'class':CLIP},c.card);telemetrySvg(doc,'rect',{x:0,y:0,height:c.height},clip);
      Array.prototype.forEach.call(c.card.children,function(el){if(!el.matches('.dv-metrics-card-box,.dv-metrics-resize,.dv-metrics-resize-readout,.'+CLIP+',title'))el.setAttribute('clip-path','url(#'+CLIP+')');});
    }
    clip.firstChild.setAttribute('width',w);
  }
  function unclipContent(c){
    var clip=c.card.querySelector('#'+CLIP);if(!clip)return;clip.remove();
    Array.prototype.forEach.call(c.card.querySelectorAll('[clip-path="url(#'+CLIP+')"]'),function(el){el.removeAttribute('clip-path');});
  }
  function previewWidth(c,w,west){
    var x=resizedLeft(c,w,west),rect=c.card.querySelector('.dv-metrics-card-box');
    rect.setAttribute('width',w);telemetryCardPlaceHandles(c.card,w);clipContent(c,w);
    c.card.setAttribute('transform','translate('+x+' '+c.origin.y+')');
    if(c.leader)c.leader.setAttribute('d',telemetryCardLeaderTo(c.anchor,{x:x,y:c.origin.y,w:w,h:c.height},c.labels));
    var readout=c.card.querySelector('.dv-metrics-resize-readout');
    if(!readout){readout=telemetrySvg(c.card.ownerDocument,'text',{'class':'dv-metrics-resize-readout',y:-8,'text-anchor':'middle'},c.card);c.card.classList.add('dv-metrics-resizing');}
    readout.setAttribute('x',w/2);readout.textContent='Width '+w;
  }
  function restoreWidth(c){
    c.card.classList.remove('dv-metrics-resizing');var readout=c.card.querySelector('.dv-metrics-resize-readout');if(readout)readout.remove();unclipContent(c);
    c.card.querySelector('.dv-metrics-card-box').setAttribute('width',c.width);telemetryCardPlaceHandles(c.card,c.width);preview(c,c.origin);
  }
  /* One Undo step: the width and the position of the previewed top-left. An automatically
     placed card is pinned there, so it never re-centres away from the pointer on release;
     Reset card to automatic restores automatic placement. A manual card's unchanged
     position plans as a no-op. */
  function saveWidth(c,w,west){
    if(!fresh(c)){opts.message('The source changed. Metrics card resize cancelled.');return;}
    var plan=planCarrierTelemetry(c.snapshot.text,c.snapshot.raw,c.target,{op:'card',field:'width',value:w},c.topology);
    if(!plan.error){
      var text=plan.text,position={x:Math.round((resizedLeft(c,w,west)-c.anchor.x)*100)/100,y:Math.round((c.origin.y-c.anchor.y)*100)/100};
      plan=planCarrierTelemetry(text,JSON.parse(text),c.target,{op:'card',field:'position',value:position},c.topology);
    }
    if(plan.error){opts.message(plan.error);return;}
    commitAndFocus(c,plan);
  }
  function consume(){suppress=true;life.delay(function(){suppress=false;},0);}
  function cancelNudge(){if(!nudge)return;var g=nudge;nudge=null;if(g.resize)restoreWidth(g.c);else preview(g.c,g.c.origin);}
  // Save a held keyboard move or width change (key release, or a switch between the two).
  function finishNudge(){
    if(!nudge)return;var g=nudge;cancelNudge();
    if(g.resize){if(g.resize.width!==g.c.width)saveWidth(g.c,g.resize.width,false);}
    else if(g.position.x!==g.c.origin.x || g.position.y!==g.c.origin.y)save(g.c,g.position);
  }
  function cancel(){
    cancelNudge();
    if(!gesture)return;var g=gesture;gesture=null;
    g.c.card.classList.remove('dv-metrics-dragging');if(g.resize)restoreWidth(g.c);else preview(g.c,g.c.origin);
    if(g.c.card.hasPointerCapture && g.c.card.hasPointerCapture(g.id))g.c.card.releasePointerCapture(g.id);
  }
  function save(c,p){
    if(!fresh(c)){opts.message('The source changed. Metrics card move cancelled.');return;}
    var value=p?{x:Math.round((p.x-c.anchor.x)*100)/100,y:Math.round((p.y-c.anchor.y)*100)/100}:null;
    var plan=planCarrierTelemetry(c.snapshot.text,c.snapshot.raw,c.target,{op:'card',field:'position',value:value},c.topology);
    if(plan.error){opts.message(plan.error);return;}
    commitAndFocus(c,plan);
  }
  function commitAndFocus(c,plan){
    opts.commit(plan,c.snapshot,c.target);
    // Re-renders replace cards. Restore keyboard focus to the same authored
    // carrier, preferring the visible local detail copy over its hidden source.
    var candidates=Array.from(view.querySelectorAll('.dv-metrics-card[data-metrics-section="'+c.target.section+'"][data-dv-edge="'+c.target.index+'"]'));
    var card=candidates.find(function(el){return el.getBoundingClientRect().width>0;});if(card)card.focus({preventScroll:true});
  }
  life.listen(view,'pointerdown',function(ev){
    var card=cardFrom(ev);if(!card || ev.button!==0 || ev.altKey || ev.ctrlKey || ev.metaKey || ev.shiftKey)return;
    cancelNudge();var c=context(card),p=c && point(c,ev);if(!p)return;
    ev.preventDefault();ev.stopImmediatePropagation();opts.pause();card.focus({preventScroll:true});
    // A corner handle only resizes; the rest of the card only moves.
    var handle=ev.target.closest('.dv-metrics-resize');
    gesture={c:c,start:p,x:ev.clientX,y:ev.clientY,id:ev.pointerId,moved:false,position:c.origin,
      resize:handle?{west:handle.getAttribute('data-corner')[1]==='w',width:c.width}:null};
    if(card.setPointerCapture)card.setPointerCapture(ev.pointerId);
  },true);
  life.listen(win,'pointermove',function(ev){
    var g=gesture;if(!g || ev.pointerId!==g.id)return;
    if(!fresh(g.c)){cancel();return;}
    if(Math.hypot(ev.clientX-g.x,ev.clientY-g.y)>3)g.moved=true;
    if(!g.moved)return;var p=point(g.c,ev);if(!p)return;
    if(g.resize){g.resize.width=clampWidth(g.c.width+(g.resize.west?-1:1)*(p.x-g.start.x));previewWidth(g.c,g.resize.width,g.resize.west);ev.preventDefault();return;}
    g.position={x:g.c.origin.x+p.x-g.start.x,y:g.c.origin.y+p.y-g.start.y};
    g.c.card.classList.add('dv-metrics-dragging');preview(g.c,g.position);ev.preventDefault();
  });
  life.listen(win,'pointerup',function(ev){
    var g=gesture;if(!g || ev.pointerId!==g.id)return;cancel();consume();
    if(g.resize && g.moved){if(g.resize.width!==g.c.width)saveWidth(g.c,g.resize.width,g.resize.west);return;}
    if(g.moved && (Math.abs(g.position.x-g.c.origin.x)>.01 || Math.abs(g.position.y-g.c.origin.y)>.01))save(g.c,g.position);
    else if(!g.moved && fresh(g.c))opts.select(g.c.card,g.c.target,ev);
  });
  life.listen(view,'click',function(ev){
    if(suppress){suppress=false;ev.preventDefault();ev.stopImmediatePropagation();return;}
    var card=cardFrom(ev),c=card && context(card);if(!c)return;
    ev.preventDefault();ev.stopImmediatePropagation();opts.select(card,c.target,ev);
  },true);
  life.listen(view,'keydown',function(ev){
    var card=cardFrom(ev),c=card && context(card);if(!c)return;
    var arrows={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]},delta=arrows[ev.key];
    if(ev.key==='Enter' || ev.key===' '){ev.preventDefault();ev.stopImmediatePropagation();opts.select(card,c.target,ev);return;}
    // #1242: Alt+Left/Right changes the width by 10 (Shift+Alt by 50), keeping the left edge.
    if(ev.altKey && !ev.ctrlKey && !ev.metaKey && (ev.key==='ArrowLeft' || ev.key==='ArrowRight')){
      ev.preventDefault();ev.stopImmediatePropagation();if(gesture)cancel();opts.pause();
      // Pressing Alt during a held move saves the move; the next repeat starts the width change.
      if(nudge && !nudge.resize && nudge.c.card===card && fresh(nudge.c)){finishNudge();return;}
      if(nudge && (nudge.c.card!==card || !nudge.resize || !fresh(nudge.c)))cancelNudge();
      if(!nudge)nudge={c:c,resize:{width:c.width},keys:new Set()};
      nudge.resize.width=clampWidth(nudge.resize.width+(ev.key==='ArrowRight'?1:-1)*(ev.shiftKey?50:10));nudge.keys.add(ev.key);previewWidth(nudge.c,nudge.resize.width,false);
      return;
    }
    if(!delta || ev.altKey || ev.ctrlKey || ev.metaKey)return;
    ev.preventDefault();ev.stopImmediatePropagation();if(gesture)cancel();opts.pause();
    // Releasing Alt during a held width change saves it; the next repeat starts the move.
    if(nudge && nudge.resize && nudge.c.card===card && fresh(nudge.c)){finishNudge();return;}
    if(nudge && (nudge.c.card!==card || !fresh(nudge.c) || nudge.resize))cancelNudge();
    if(!nudge)nudge={c:c,position:{x:c.origin.x,y:c.origin.y},keys:new Set()};
    var step=ev.shiftKey?50:10;nudge.position.x+=delta[0]*step;nudge.position.y+=delta[1]*step;nudge.keys.add(ev.key);preview(nudge.c,nudge.position);
  },true);
  life.listen(win,'keyup',function(ev){if(!nudge || !nudge.keys.has(ev.key))return;ev.preventDefault();nudge.keys.delete(ev.key);if(nudge.keys.size)return;finishNudge();},true);
  // Handles keep their on-screen size at the current zoom.
  function sizeHandles(ev){var card=cardFrom(ev),rect=card && card.querySelector('.dv-metrics-card-box');if(rect && !card.classList.contains('dv-metrics-resizing'))telemetryCardPlaceHandles(card,Number(rect.getAttribute('width')));}
  life.listen(view,'pointerover',sizeHandles,true);life.listen(view,'focusin',sizeHandles,true);
  life.listen(view.ownerDocument,'focusin',function(ev){if(nudge && ev.target!==nudge.c.card)cancelNudge();},true);
  life.listen(win,'keydown',function(ev){if(ev.key==='Escape' && (gesture || nudge)){ev.preventDefault();ev.stopImmediatePropagation();cancel();consume();}},true);
  life.listen(win,'pointercancel',cancel);life.listen(win,'blur',cancel);life.listen(opts.src,'input',cancel);
  life.listen(view,'lostpointercapture',function(ev){if(gesture && gesture.id===ev.pointerId)cancel();},true);
  return {cancel:cancel,busy:function(){return !!(gesture || nudge);},destroy:function(){cancel();life.destroy();}};
}
