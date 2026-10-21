/* Playback framing is session navigation, never authored diagram geometry. */
function activeStepBounds(board, step){
  if(!board || !step || !board.svg)return null;
  var svg=board.svg,root=svg.getCTM();if(!root)return null;
  var inverse=root.inverse(),elements=[],nodes=Object.create(null),boxes=[];
  (step.nodes || []).forEach(function(id){nodes[id]=true;});
  (step.keys || []).concat(Object.keys(step.failures || {})).forEach(function(key){
    var edge=board.edgeIds[key];if(!edge)return;
    // A failed connection still needs its destination to explain the route;
    // this does not change which endpoints the stepper lights.
    nodes[edge.e.from]=nodes[edge.e.to]=true;
    elements.push(edge.pathEl,edge.labelEl);
  });
  Object.keys(nodes).forEach(function(id){elements.push(board.nodeEls[id]);});
  elements.forEach(function(el){
    if(!el || !el.isConnected || getComputedStyle(el).display==='none' || getComputedStyle(el).visibility==='hidden')return;
    var b=el.getBBox(),ctm=el.getCTM();if(!ctm || !b.width && !b.height)return;
    var m=inverse.multiply(ctm),points=[[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]].map(function(p){return {x:m.a*p[0]+m.c*p[1]+m.e,y:m.b*p[0]+m.d*p[1]+m.f};});
    var x=Math.min.apply(null,points.map(function(p){return p.x;})),y=Math.min.apply(null,points.map(function(p){return p.y;}));
    boxes.push({x:x,y:y,w:Math.max.apply(null,points.map(function(p){return p.x;}))-x,h:Math.max.apply(null,points.map(function(p){return p.y;}))-y});
  });
  return boxes.length?unionGraphFrame(null,boxes,4):null;
}

/* One RAF owner, shared by both cameras. A retarget reads the camera where the
   preceding frame actually landed; it never queues an obsolete destination. */
function createCameraMotion(){
  var frame=0,revision=0;
  function cancel(){revision++;if(frame)cancelAnimationFrame(frame);frame=0;}
  return {cancel:cancel,move:function(from,to,write,valid){
    cancel();
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){if(valid())write(to);return;}
    var start=null,turn=revision;
    function tick(time){
      frame=0;if(turn!==revision || !valid())return;if(start===null)start=time;
      var t=Math.min(1,(time-start)/720),ease=t*t*(3-2*t),value={};
      Object.keys(to).forEach(function(key){value[key]=from[key]+(to[key]-from[key])*ease;});
      write(value);if(t<1 && turn===revision)frame=requestAnimationFrame(tick);
    }
    frame=requestAnimationFrame(tick);
  }};
}

function createActiveFollow(section,board,host,stepper,camera){
  var enabled=true,retired=false,visible=true,pending=0,last=null;
  var button=document.createElement('button');button.type='button';button.className='mbtn follow-active';host.appendChild(button);
  function paint(){button.textContent=enabled?'Follow active':'Resume follow';button.setAttribute('aria-pressed',String(enabled));button.title=enabled?'Follow the current step. Pan or zoom to pause.':'Resume following the current step';}
  function cancelMotion(){var ctl=camera();if(ctl && ctl.cancelFollow)ctl.cancelFollow();last=null;}
  function cancel(){if(pending)cancelAnimationFrame(pending);pending=0;cancelMotion();}
  function pause(){if(retired)return;enabled=false;cancel();paint();}
  function update(){
    if(pending)cancelAnimationFrame(pending);pending=0;if(!enabled || !visible || retired)return;
    pending=requestAnimationFrame(function(){
      pending=0;if(!enabled || !visible || retired || document.hidden || !board.isConnected || !board.clientWidth || !board.getClientRects().length)return;
      var focus=stepper.activeFocus(),extent=focus && activeStepBounds(focus.board,focus.step),ctl=camera();
      if(!extent || !ctl || !ctl.followActive){cancel();return;}
      var signature=JSON.stringify([extent,board.clientWidth,board.clientHeight]);if(last===signature)return;last=signature;
      ctl.followActive(extent);
    });
  }
  function toggle(){if(retired)return;if(enabled)pause();else{enabled=true;paint();update();}}
  function pointer(ev){
    // Object selection/editing must keep a stable camera under the pointer.
    if(ev.button===0 && (ev.target===board || ev.target.closest('[data-dv-node],[data-dv-edge],.explore-window-header,.explore-window-resize,.explore-player-grip')))pause();
  }
  function hidden(){if(document.hidden)cancel();}
  var dimensions=[board.clientWidth,board.clientHeight];
  var observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(function(){var next=[board.clientWidth,board.clientHeight];if(next[0]!==dimensions[0] || next[1]!==dimensions[1])cancelMotion();dimensions=next;}):null;
  if(observer)observer.observe(board);
  var geometry=typeof MutationObserver!=='undefined'?new MutationObserver(cancelMotion):null;
  if(geometry)geometry.observe(board,{subtree:true,attributes:true,attributeFilter:['viewBox']});
  button.addEventListener('click',toggle);board.addEventListener('dv:cameramanual',pause);
  section.addEventListener('pointerdown',pointer,true);section.addEventListener('diagram-view-change',cancel);document.addEventListener('visibilitychange',hidden);
  paint();
  return {update:update,pause:pause,cancel:cancel,
    setVisible:function(value){visible=value;if(!value)cancel();},
    snapshot:function(){return enabled;},restore:function(value){cancel();enabled=value!==false;paint();},
    destroy:function(){retired=true;cancel();if(observer)observer.disconnect();if(geometry)geometry.disconnect();button.removeEventListener('click',toggle);board.removeEventListener('dv:cameramanual',pause);section.removeEventListener('pointerdown',pointer,true);section.removeEventListener('diagram-view-change',cancel);document.removeEventListener('visibilitychange',hidden);}};
}
