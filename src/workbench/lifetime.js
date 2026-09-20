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
