/* Desktop metrics placement. A gesture previews only SVG geometry; one accepted
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
    return {card:card,svg:svg,snapshot:snapshot,target:target,topology:topology,contextKey:JSON.stringify(topology),
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
  function consume(){suppress=true;life.delay(function(){suppress=false;},0);}
  function cancelNudge(){if(!nudge)return;var g=nudge;nudge=null;preview(g.c,g.c.origin);}
  function cancel(){
    cancelNudge();
    if(!gesture)return;var g=gesture;gesture=null;
    g.c.card.classList.remove('dv-metrics-dragging');preview(g.c,g.c.origin);
    if(g.c.card.hasPointerCapture && g.c.card.hasPointerCapture(g.id))g.c.card.releasePointerCapture(g.id);
  }
  function save(c,p){
    if(!fresh(c)){opts.message('The source changed. Metrics card move cancelled.');return;}
    var value=p?{x:Math.round((p.x-c.anchor.x)*100)/100,y:Math.round((p.y-c.anchor.y)*100)/100}:null;
    var plan=planCarrierTelemetry(c.snapshot.text,c.snapshot.raw,c.target,{op:'card',field:'position',value:value},c.topology);
    if(plan.error){opts.message(plan.error);return;}
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
    gesture={c:c,start:p,x:ev.clientX,y:ev.clientY,id:ev.pointerId,moved:false,position:c.origin};
    if(card.setPointerCapture)card.setPointerCapture(ev.pointerId);
  },true);
  life.listen(win,'pointermove',function(ev){
    var g=gesture;if(!g || ev.pointerId!==g.id)return;
    if(!fresh(g.c)){cancel();return;}
    if(Math.hypot(ev.clientX-g.x,ev.clientY-g.y)>3)g.moved=true;
    if(!g.moved)return;var p=point(g.c,ev);if(!p)return;
    g.position={x:g.c.origin.x+p.x-g.start.x,y:g.c.origin.y+p.y-g.start.y};
    g.c.card.classList.add('dv-metrics-dragging');preview(g.c,g.position);ev.preventDefault();
  });
  life.listen(win,'pointerup',function(ev){
    var g=gesture;if(!g || ev.pointerId!==g.id)return;cancel();consume();
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
    if(!delta || ev.altKey || ev.ctrlKey || ev.metaKey)return;
    ev.preventDefault();ev.stopImmediatePropagation();if(gesture)cancel();opts.pause();
    if(nudge && (nudge.c.card!==card || !fresh(nudge.c)))cancelNudge();
    if(!nudge)nudge={c:c,position:{x:c.origin.x,y:c.origin.y},keys:new Set()};
    var step=ev.shiftKey?50:10;nudge.position.x+=delta[0]*step;nudge.position.y+=delta[1]*step;nudge.keys.add(ev.key);preview(nudge.c,nudge.position);
  },true);
  life.listen(win,'keyup',function(ev){if(!nudge || !nudge.keys.has(ev.key))return;ev.preventDefault();nudge.keys.delete(ev.key);if(nudge.keys.size)return;var g=nudge;cancelNudge();if(g.position.x!==g.c.origin.x || g.position.y!==g.c.origin.y)save(g.c,g.position);},true);
  life.listen(view.ownerDocument,'focusin',function(ev){if(nudge && ev.target!==nudge.c.card)cancelNudge();},true);
  life.listen(win,'keydown',function(ev){if(ev.key==='Escape' && (gesture || nudge)){ev.preventDefault();ev.stopImmediatePropagation();cancel();consume();}},true);
  life.listen(win,'pointercancel',cancel);life.listen(win,'blur',cancel);life.listen(opts.src,'input',cancel);
  life.listen(view,'lostpointercapture',function(ev){if(gesture && gesture.id===ev.pointerId)cancel();},true);
  return {cancel:cancel,busy:function(){return !!(gesture || nudge);},destroy:function(){cancel();life.destroy();}};
}
