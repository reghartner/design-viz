/* A local resource ledger for one editor owner. Wrappers also retire callbacks
   already queued by the platform or retained by an old control. */
function createWorkbenchLifetime(){
  var disposed=false,listeners=[],delays=new Map(),cleanups=[];
  function guard(fn){return function(){if(!disposed)return fn.apply(this,arguments);};}
  function listen(target,type,fn,options){
    if(disposed || !target)return function(){};
    var capture=typeof options==='boolean'?options:!!(options && options.capture);
    var prior=listeners.find(function(rec){return rec.target===target && rec.type===type && rec.fn===fn && rec.capture===capture;});
    if(prior)return prior.remove;
    var rec={target:target,type:type,fn:fn,capture:capture,active:true};
    rec.remove=function(){
      if(!rec.active)return;rec.active=false;
      if(target.removeEventListener)target.removeEventListener(type,rec.wrapped,capture);
      var at=listeners.indexOf(rec);if(at>=0)listeners.splice(at,1);
    };
    rec.wrapped=function(){
      if(disposed || !rec.active)return;
      if(options && options.once)rec.remove();
      return fn.apply(this,arguments);
    };
    listeners.push(rec);target.addEventListener(type,rec.wrapped,options);return rec.remove;
  }
  function delay(fn,ms){
    if(disposed)return null;
    var rec={active:true},id=setTimeout(function(){
      delays.delete(id);if(disposed || !rec.active)return;rec.active=false;fn();
    },ms);delays.set(id,rec);return id;
  }
  function cancelDelay(id){
    var rec=delays.get(id);if(!rec)return;rec.active=false;delays.delete(id);clearTimeout(id);
  }
  function own(cleanup){
    if(disposed){cleanup();return function(){};}
    cleanups.push(cleanup);return function(){var at=cleanups.indexOf(cleanup);if(at>=0)cleanups.splice(at,1);};
  }
  function destroy(){
    if(disposed)return;disposed=true;
    listeners.slice().forEach(function(rec){rec.remove();});
    Array.from(delays.keys()).forEach(cancelDelay);
    var pending=cleanups,errors=[];cleanups=[];pending.reverse().forEach(function(cleanup){try{cleanup();}catch(error){errors.push(error);}});
    if(errors.length)throw errors[0];
  }
  return {alive:function(){return !disposed;},guard:guard,listen:listen,delay:delay,cancelDelay:cancelDelay,own:own,destroy:destroy};
}

/* #1223: delays for work that must keep running while the Workbench tab is hidden (the
   folder heartbeat and request polling). After about five minutes hidden, Chrome's intensive
   throttling wakes a page's chained timers about once a minute; a dedicated worker's timers
   are not intensively throttled, so the worker keeps each delay and posts back when it is due.
   Without Worker, or when the worker cannot start, the page timer is used. A frozen tab runs
   neither (see docs/folder-agent-session.md). The page still owns every check the callback makes. */
var WORKBENCH_BACKGROUND_TIMER_SOURCE='var t={};onmessage=function(e){var m=e.data;if(m && m.cancel!==undefined){clearTimeout(t[m.cancel]);delete t[m.cancel];return;}'+
  't[m.id]=setTimeout(function(){delete t[m.id];postMessage(m.id);},m.ms);};';
function createWorkbenchBackgroundTimer(options){
  // The worker starts lazily, on the first delay, so a Workbench that never connects a folder
  // (or the tour's practice frame, whose CSP refuses blob workers) never creates one.
  // release() ends an idle worker (a retired connection); a later delay starts a new one.
  var pageOnly=!!(options && options.pageOnly),life=createWorkbenchLifetime(),worker=null,url=null,failed=false,serial=0,pending=new Map();
  function page(rec){rec.page=life.delay(function(){if(pending.get(rec.id)===rec){pending.delete(rec.id);rec.fn();}},rec.ms);}
  function stop(){
    if(worker){try{worker.terminate();}catch(ignored){}worker=null;}
    if(url){try{URL.revokeObjectURL(url);}catch(ignored){}url=null;}
  }
  function fallback(){if(!worker)return;stop();failed=true;pending.forEach(function(rec){if(rec.page==null)page(rec);});}
  function start(){
    if(worker || failed || pageOnly)return worker;
    try{
      if(typeof Worker!=='function' || typeof Blob!=='function' || typeof URL==='undefined' || !URL.createObjectURL){failed=true;return null;}
      url=URL.createObjectURL(new Blob([WORKBENCH_BACKGROUND_TIMER_SOURCE],{type:'text/javascript'}));
      worker=new Worker(url);
      worker.onmessage=function(event){var rec=pending.get(event.data);if(rec && rec.page==null && life.alive()){pending.delete(rec.id);rec.fn();}};
      worker.onerror=function(event){if(event && event.preventDefault)event.preventDefault();fallback();};
    }catch(ignored){stop();failed=true;}
    return worker;
  }
  return {
    delay:function(fn,ms){
      if(!life.alive())return null;
      var rec={id:++serial,fn:fn,ms:ms,page:null};pending.set(rec.id,rec);
      if(start())worker.postMessage({id:rec.id,ms:ms});else page(rec);
      return rec.id;
    },
    cancelDelay:function(id){
      var rec=pending.get(id);if(!rec)return;pending.delete(id);
      if(rec.page!=null)life.cancelDelay(rec.page);else if(worker)worker.postMessage({cancel:id});
    },
    release:function(){if(!pending.size)stop();},
    kind:function(){return worker?'worker':'page';},
    destroy:function(){pending.clear();stop();life.destroy();}
  };
}
