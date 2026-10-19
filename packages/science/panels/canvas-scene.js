/* Reusable lifecycle for panel-owned Canvas 2D scenes. Renderers supply all art;
   this helper owns DPR sizing, reduced-motion state, playback and cleanup. */
function scienceCanvasScene(host, canvas, options) {
  if (!host || !canvas || !options || typeof options.render !== 'function') return null;
  var ownHost=options.ownHost!==false;
  if (ownHost && typeof host._panelMotionCleanup === 'function') host._panelMotionCleanup();
  var view=canvas.ownerDocument && canvas.ownerDocument.defaultView;
  var raf=typeof requestAnimationFrame === 'function' ? requestAnimationFrame : null;
  var caf=typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : null;
  var observer=null, media=options.observeMotion!==false && view && typeof view.matchMedia === 'function' ? view.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var state={destroyed:false,playing:options.playing!==false,reduced:media?!!media.matches:!!options.reduced,elapsed:Number(options.elapsed)||0,lastTime:null,frame:0,width:0,height:0,dpr:1,prefs:Object.assign({},options.prefs || {})};
  var frameId=null,ctx=canvas.getContext && canvas.getContext('2d');
  if (!ctx) return null;
  function animates() { return !!raf && !state.destroyed && !state.reduced && state.playing && (!options.shouldAnimate || options.shouldAnimate(state)); }
  function resize() {
    var rect=canvas.getBoundingClientRect(), width=Math.max(1,Math.round(rect.width)), height=Math.max(1,Math.round(rect.height));
    var dpr=Math.max(1,Math.min(2,Number(view && view.devicePixelRatio) || 1));
    if (width===state.width && height===state.height && dpr===state.dpr) return;
    state.width=width;state.height=height;state.dpr=dpr;
    canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
    drawNow();
  }
  function paint(timestamp) {
    frameId=null;
    host._thTween=null;
    if (state.destroyed) return;
    if (animates()) {
      if (state.lastTime != null) state.elapsed+=Math.min(80,Math.max(0,timestamp-state.lastTime));
      state.lastTime=timestamp;
    } else state.lastTime=null;
    state.frame+=1;
    ctx.setTransform(state.dpr,0,0,state.dpr,0,0);
    options.render(ctx,state);
    canvas.setAttribute('data-canvas-running',String(animates()));
    canvas.setAttribute('data-canvas-frame',String(state.frame));
    canvas.setAttribute('data-canvas-dpr',String(state.dpr));
    if (animates()) requestDraw();
  }
  function requestDraw() {
    if (state.destroyed || frameId != null) return;
    if (raf) { frameId=raf(paint);host._thTween=frameId; }
    else paint(0);
  }
  function drawNow() {
    if(frameId!=null && caf)caf(frameId);
    frameId=null;host._thTween=null;
    paint(state.lastTime || 0);
  }
  function setPrefs(next) { next=next || {};if(options.beforePrefs)options.beforePrefs(state,next);Object.assign(state.prefs,next);if(options.onStateChange)options.onStateChange(state);requestDraw(); }
  function play() { if(state.reduced)return;state.playing=true;state.lastTime=null;requestDraw(); }
  function pause() { state.playing=false;state.lastTime=null;drawNow(); }
  function replay() { state.elapsed=0;state.playing=!state.reduced;state.lastTime=null;requestDraw(); }
  function seek(milliseconds) { state.elapsed=Math.max(0,Number(milliseconds)||0);state.playing=false;state.lastTime=null;requestDraw(); }
  function setReduced(reduced) { if(state.destroyed)return;state.reduced=!!reduced;if(state.reduced)state.lastTime=null;if(options.onStateChange)options.onStateChange(state);requestDraw(); }
  function motionChanged(event) { setReduced(event.matches); }
  function destroy() {
    if(state.destroyed)return;state.destroyed=true;
    if(frameId!=null && caf)caf(frameId);frameId=null;host._thTween=null;
    if(observer)observer.disconnect();observer=null;
    if(media){if(media.removeEventListener)media.removeEventListener('change',motionChanged);else if(media.removeListener)media.removeListener(motionChanged);}
    if(ownHost && host._panelMotionCleanup===destroy)host._panelMotionCleanup=null;
  }
  if(typeof ResizeObserver === 'function'){observer=new ResizeObserver(resize);observer.observe(canvas);}
  if(media){if(media.addEventListener)media.addEventListener('change',motionChanged);else if(media.addListener)media.addListener(motionChanged);}
  if(ownHost)host._panelMotionCleanup=destroy;
  resize();
  return {state:state,setPrefs:setPrefs,setReduced:setReduced,play:play,pause:pause,replay:replay,seek:seek,requestDraw:requestDraw,destroy:destroy,canAnimate:function(){return !state.reduced && !!raf;}};
}

/* Visibility-owned proxy for rich panels. Hidden tabs and offscreen sections
   retain authored settings/progress but allocate no drawing context, resize
   observer or rAF. One media listener belongs to this proxy, not its mounts. */
function scienceLazyCanvasScene(host,canvas,options){
  if(!host || !canvas || !options)return null;
  if(typeof host._panelMotionCleanup==='function')host._panelMotionCleanup();
  var view=canvas.ownerDocument && canvas.ownerDocument.defaultView,inner=null,observer=null,destroyed=false;
  var media=view && typeof view.matchMedia==='function' ? view.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var saved=options.memoryKey && host[options.memoryKey];
  var memory=saved ? {prefs:Object.assign({},saved.prefs),playing:!!saved.playing,elapsed:Number(saved.elapsed)||0,reduced:!!saved.reduced} : {prefs:Object.assign({},options.prefs || {}),playing:true,elapsed:0,reduced:false};
  if(media)memory.reduced=!!media.matches;
  function sync(){if(!inner)return;memory.prefs=Object.assign({},inner.state.prefs);memory.playing=inner.state.playing;memory.elapsed=inner.state.elapsed;memory.reduced=inner.state.reduced;}
  function visible(){return !!(canvas.isConnected && canvas.getClientRects().length && !canvas.closest('[hidden]'));}
  function mount(){
    if(destroyed || inner || !visible())return;
    inner=scienceCanvasScene(host,canvas,Object.assign({},options,{ownHost:false,observeMotion:false,reduced:memory.reduced,prefs:memory.prefs,elapsed:memory.elapsed,playing:memory.playing,onStateChange:function(state){memory.reduced=state.reduced;if(options.onStateChange)options.onStateChange(state);}}));if(!inner)return;
    memory.reduced=inner.state.reduced;canvas.setAttribute('data-canvas-live','true');
  }
  function unmount(){if(!inner)return;sync();inner.destroy();inner=null;canvas.setAttribute('data-canvas-live','false');canvas.setAttribute('data-canvas-running','false');}
  function reconcile(entries){var shown=entries?entries.some(function(entry){return entry.target===canvas && entry.isIntersecting;}):visible();if(shown&&visible())mount();else unmount();}
  function setPrefs(next){next=next || {};if(inner){inner.setPrefs(next);sync();}else{if(options.beforePrefs)options.beforePrefs(memory,next);Object.assign(memory.prefs,next);if(options.onStateChange)options.onStateChange(memory);}}
  function play(){if(memory.reduced)return;memory.playing=true;if(inner)inner.play();}
  function pause(){memory.playing=false;if(inner)inner.pause();}
  function replay(){memory.elapsed=0;memory.playing=!memory.reduced;if(inner)inner.replay();}
  function seek(ms){memory.elapsed=Math.max(0,Number(ms)||0);memory.playing=false;if(inner)inner.seek(memory.elapsed);}
  function motionChanged(event){if(destroyed)return;memory.reduced=!!event.matches;if(inner)inner.setReduced(memory.reduced);else if(options.onStateChange)options.onStateChange(memory);}
  function destroy(){if(destroyed)return;destroyed=true;if(observer)observer.disconnect();observer=null;unmount();if(media){if(media.removeEventListener)media.removeEventListener('change',motionChanged);else if(media.removeListener)media.removeListener(motionChanged);}if(options.memoryKey)host[options.memoryKey]={prefs:Object.assign({},memory.prefs),playing:memory.playing,elapsed:memory.elapsed,reduced:memory.reduced};if(host._panelMotionCleanup===destroy)host._panelMotionCleanup=null;}
  var proxy={state:memory,setPrefs:setPrefs,play:play,pause:pause,replay:replay,seek:seek,requestDraw:function(){if(inner)inner.requestDraw();},destroy:destroy,live:function(){return !!inner;},canAnimate:function(){return !destroyed && !memory.reduced && typeof requestAnimationFrame==='function';}};
  if(media){if(media.addEventListener)media.addEventListener('change',motionChanged);else if(media.addListener)media.addListener(motionChanged);}
  if(typeof IntersectionObserver==='function'){observer=new IntersectionObserver(reconcile,{root:null,rootMargin:'160px 0px'});observer.observe(canvas);canvas.setAttribute('data-canvas-live','false');}
  else mount();
  host._panelMotionCleanup=destroy;
  return proxy;
}
