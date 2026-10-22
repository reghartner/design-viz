/* Own cosmetic animation suspension for one authoring preview. The owner is
   intentionally scoped to the builder's docview: reader previews, exports and
   standalone documents keep their own clocks. */
function createWorkbenchMotionLifetime(options){
  options=options || {};
  var doc=options.document,win=options.window,view=options.view,activity=options.active;
  var retired=false,paused=new Set(),cleanups=[],observer=null;
  var focused=!doc || typeof doc.hasFocus!=='function' ? true : doc.hasFocus();
  function listen(target,type,callback){
    if(!target || typeof target.addEventListener!=='function')return;
    target.addEventListener(type,callback);
    cleanups.push(function(){if(typeof target.removeEventListener==='function')target.removeEventListener(type,callback);});
  }
  function foreground(){
    return (!doc || doc.hidden!==true) && focused && (!activity || activity());
  }
  function owns(svg){return !!(view && view.contains && view.contains(svg));}
  function hasMotion(svg){
    return !svg.querySelector || !!svg.querySelector('animate,animateMotion,animateTransform,set');
  }
  function pause(svg){
    if(!hasMotion(svg) || typeof svg.pauseAnimations!=='function')return;
    try{
      if(typeof svg.animationsPaused==='function' && svg.animationsPaused())return;
      svg.pauseAnimations();paused.add(svg);
    }catch(ignored){}
  }
  function resumeOwned(){
    paused.forEach(function(svg){
      if(owns(svg) && typeof svg.unpauseAnimations==='function'){
        try{svg.unpauseAnimations();}catch(ignored){}
      }
    });
    paused.clear();
  }
  function refresh(){
    if(retired || !view)return;
    paused.forEach(function(svg){if(!owns(svg))paused.delete(svg);});
    var suspended=!foreground();
    if(view.classList)view.classList.toggle('dv-workbench-motion-paused',suspended);
    if(!suspended){resumeOwned();return;}
    if(view.querySelectorAll)Array.prototype.forEach.call(view.querySelectorAll('.boardcanvas > svg'),pause);
  }
  function focus(){focused=true;refresh();}
  function blur(){focused=false;refresh();}
  function visibility(){
    if(doc && doc.hidden!==true && typeof doc.hasFocus==='function')focused=doc.hasFocus();
    refresh();
  }
  listen(win,'focus',focus);listen(win,'blur',blur);listen(doc,'visibilitychange',visibility);
  var Observer=win && win.MutationObserver;
  if(Observer && options.activityTarget){
    observer=new Observer(refresh);observer.observe(options.activityTarget,{attributes:true,attributeFilter:['hidden']});
  }
  refresh();
  function destroy(){
    if(retired)return;retired=true;
    cleanups.splice(0).forEach(function(cleanup){cleanup();});
    if(observer)observer.disconnect();
    if(view && view.classList)view.classList.remove('dv-workbench-motion-paused');
    resumeOwned();
  }
  return {refresh:refresh,destroy:destroy,suspended:function(){return !foreground();}};
}
