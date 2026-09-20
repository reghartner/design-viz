/* Test instrumentation, installed before the host. Only global/root listeners
   are counted: ordinary detached controls are never retained in a DOM ledger. */
export function trackResources(){
  const add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener;
  const owners=new WeakMap(),listeners=new Set(),timers=new Set(),intervals=new Set(),frames=new Set(),observers=new Set();
  const capture=options=>typeof options==='boolean'?options:!!options?.capture;
  const tracked=target=>target===window||target===document||target instanceof ShadowRoot;
  function forget(record){
    listeners.delete(record);owners.get(record.target)?.delete(record);
    if(record.signal)remove.call(record.signal,'abort',record.abort);
  }
  EventTarget.prototype.addEventListener=function(type,callback,options){
    if(!tracked(this)||!callback)return add.call(this,type,callback,options);
    const key=String(type),cap=capture(options),records=owners.get(this)||new Set();
    const prior=[...records].find(r=>r.type===key&&r.callback===callback&&r.capture===cap);
    if(prior)return add.call(this,key,prior.wrapper,options);
    if(options?.signal?.aborted)return add.call(this,key,callback,options);
    const record={target:this,type:key,callback,capture:cap,signal:options?.signal,once:!!options?.once};
    record.wrapper=function(event){
      if(record.once)forget(record);
      return typeof callback==='function'?callback.call(this,event):callback.handleEvent(event);
    };
    record.abort=()=>forget(record);
    add.call(this,key,record.wrapper,options);
    records.add(record);owners.set(this,records);listeners.add(record);
    if(record.signal)add.call(record.signal,'abort',record.abort,{once:true});
  };
  EventTarget.prototype.removeEventListener=function(type,callback,options){
    const record=[...(owners.get(this)||[])].find(r=>r.type===String(type)&&r.callback===callback&&r.capture===capture(options));
    if(record){forget(record);return remove.call(this,type,record.wrapper,options);}
    return remove.call(this,type,callback,options);
  };
  const timeout=window.setTimeout.bind(window),clearTimeout=window.clearTimeout.bind(window);
  const interval=window.setInterval.bind(window),clearInterval=window.clearInterval.bind(window);
  const raf=window.requestAnimationFrame.bind(window),cancel=window.cancelAnimationFrame.bind(window);
  window.setTimeout=function(callback,ms,...args){
    // Product callbacks are functions. String handlers retain native semantics.
    if(typeof callback!=='function')return timeout(callback,ms,...args);
    const id=timeout(function(){timers.delete(id);callback.apply(this,args);},ms);
    timers.add(id);return id;
  };
  window.clearTimeout=id=>{timers.delete(id);intervals.delete(id);return clearTimeout(id);};
  window.setInterval=function(callback,ms,...args){const id=interval(callback,ms,...args);intervals.add(id);return id;};
  window.clearInterval=id=>{intervals.delete(id);timers.delete(id);return clearInterval(id);};
  window.requestAnimationFrame=callback=>{const id=raf(function(time){frames.delete(id);callback.call(this,time);});frames.add(id);return id;};
  window.cancelAnimationFrame=id=>{frames.delete(id);return cancel(id);};
  for(const name of ['ResizeObserver','MutationObserver','IntersectionObserver']){
    const Native=window[name];
    window[name]=class extends Native{
      #targets=new WeakSet();#count=0;
      observe(target,...args){super.observe(target,...args);if(!this.#targets.has(target)){this.#targets.add(target);this.#count++;}observers.add(this);}
      _forgetTarget(target){if(this.#targets.delete(target))this.#count--;if(!this.#count)observers.delete(this);}
      disconnect(){super.disconnect();this.#targets=new WeakSet();this.#count=0;observers.delete(this);}
    };
    if(Native.prototype.unobserve)window[name].prototype.unobserve=function(target){Native.prototype.unobserve.call(this,target);this._forgetTarget(target);};
  }
  window.__resourceCounts=()=>({listeners:listeners.size,timers:timers.size,intervals:intervals.size,frames:frames.size,observers:observers.size,fonts:document.fonts.size});
}
