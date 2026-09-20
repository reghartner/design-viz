/* Bounded native renderer environment. Each statically compiled runtime receives
   only the browser surfaces it uses; the host's globals and DOM are never patched. */
const nativeFontOwners = new WeakMap();
function acquireNativeFonts(doc, win, fonts){
  let entry = nativeFontOwners.get(doc);
  if (!entry){
    const faces = fonts.map(font => new win.FontFace(font.family, font.source,
      {style:'normal', weight:String(font.weight), display:'swap'}));
    entry = {refs:0, faces, ready:Promise.all(faces.map(face => face.load()))};
    // Validation can reject before a mount subscribes. Keep font failures handled
    // while preserving the original rejection for a live mount's warning callback.
    entry.ready.catch(() => {});
    // Register immediately. Pending loads never add a face after retirement.
    faces.forEach(face => doc.fonts.add(face));
    nativeFontOwners.set(doc, entry);
  }
  entry.refs++;
  let released = false;
  return {ready:entry.ready, release(){
    if (released) return; released = true;
    if (--entry.refs === 0){
      entry.faces.forEach(face => doc.fonts.delete(face));
      nativeFontOwners.delete(doc);
    }
  }};
}
function createNativeEnvironment(host, assets){
  if (!host || !host.attachShadow || host.childNodes && host.childNodes.length || host.shadowRoot && host.shadowRoot.childNodes.length)
    throw new Error('Mount Flowview in an empty dedicated host element.');
  const doc = host.ownerDocument, win = doc.defaultView;
  const root = host.shadowRoot || host.attachShadow({mode:'open'});
  const style = doc.createElement('style'); style.textContent = assets.css;
  const body = doc.createElement('flowview-root'); body.className = 'flowview-root';
  body.innerHTML = assets.icons; // Trusted compiled symbols, never spec data.
  const fonts = acquireNativeFonts(doc, win, assets.fonts);
  root.append(style, body);
  let disposed = false;
  const timeouts = new Set(), intervals = new Set(), frames = new Set(), observers = new Set(), listeners = new Set();
  function listen(target, type, fn, options){
    if (disposed) return () => {};
    const guarded = event => {if (!disposed) fn.call(target, event);};
    target.addEventListener(type, guarded, options);
    const entry = {target, type, fn, options, guarded}; listeners.add(entry);
    return () => {target.removeEventListener(type, guarded, options); listeners.delete(entry);};
  }
  const documentListeners = [];
  function addDocumentListener(type, fn, options){
    if (disposed) return;
    const capture = typeof options === 'boolean' ? options : !!(options && options.capture);
    if (documentListeners.some(e => e.type === type && e.fn === fn && e.capture === capture)) return;
    const off = [];
    if (type === 'visibilitychange') off.push(listen(doc, type, fn, options));
    else {
      // Inside events retain their original shadow target. Outside events are
      // only dismissal signals; keyboard actions belong to the focused root.
      off.push(listen(root, type, fn, options));
      if (type !== 'keydown') off.push(listen(doc, type, event => {
        if (!event.composedPath().includes(root)) fn(event);
      }, options));
    }
    documentListeners.push({type, fn, capture, off});
  }
  function removeDocumentListener(type, fn, options){
    const capture = typeof options === 'boolean' ? options : !!(options && options.capture);
    const index = documentListeners.findIndex(e => e.type === type && e.fn === fn && e.capture === capture);
    if (index >= 0) documentListeners.splice(index,1)[0].off.forEach(off => off());
  }
  function later(fn, delay, ...args){
    if (disposed) return null;
    const id = win.setTimeout(() => {timeouts.delete(id); if (!disposed) fn(...args);},delay);
    timeouts.add(id); return id;
  }
  function clearLater(id){win.clearTimeout(id);timeouts.delete(id);}
  function repeat(fn, delay, ...args){
    if (disposed) return null;
    const id = win.setInterval(() => {if (!disposed) fn(...args);},delay);
    intervals.add(id);return id;
  }
  function clearRepeat(id){win.clearInterval(id);intervals.delete(id);}
  function frame(fn){
    if (disposed) return null;
    const id = win.requestAnimationFrame(time => {frames.delete(id);if (!disposed) fn(time);});
    frames.add(id);return id;
  }
  function clearFrame(id){win.cancelAnimationFrame(id);frames.delete(id);}
  function observer(Type){
    return class {
      constructor(callback){
        this.native = new Type((...args) => {if (!disposed) callback(...args);});
        observers.add(this);
      }
      observe(...args){if (!disposed){observers.add(this);this.native.observe(...args);}}
      unobserve(...args){if(this.native.unobserve)this.native.unobserve(...args);}
      takeRecords(){return this.native.takeRecords ? this.native.takeRecords() : [];}
      disconnect(){this.native.disconnect();observers.delete(this);}
    };
  }
  const boundDocument = {
    createElement:doc.createElement.bind(doc), createElementNS:doc.createElementNS.bind(doc),
    createComment:doc.createComment.bind(doc), getElementById:root.getElementById.bind(root),
    addEventListener:addDocumentListener, removeEventListener:removeDocumentListener,
    get activeElement(){return root.activeElement;}, get hidden(){return doc.hidden;},
    get documentElement(){return doc.documentElement;}, get scrollingElement(){return doc.scrollingElement;},
    body
  };
  const windowListeners = [];
  const boundWindow = {
    matchMedia:win.matchMedia.bind(win), get innerWidth(){return win.innerWidth;}, get innerHeight(){return win.innerHeight;},
    setTimeout:later, clearTimeout:clearLater, setInterval:repeat, clearInterval:clearRepeat,
    addEventListener(type,fn,options){
      if (disposed) return;
      const capture=typeof options==='boolean'?options:!!(options && options.capture);
      if(windowListeners.some(e=>e.type===type && e.fn===fn && e.capture===capture))return;
      windowListeners.push({type,fn,capture,off:listen(win,type,fn,options)});
    },
    removeEventListener(type,fn,options){
      const capture=typeof options==='boolean'?options:!!(options && options.capture);
      const index=windowListeners.findIndex(e=>e.type===type && e.fn===fn && e.capture===capture);
      if(index>=0)windowListeners.splice(index,1)[0].off();
    }
  };
  return {
    root, body, document:boundDocument, window:boundWindow, listen,
    setTimeout:later, clearTimeout:clearLater, setInterval:repeat, clearInterval:clearRepeat,
    requestAnimationFrame:frame, cancelAnimationFrame:clearFrame,
    ResizeObserver:observer(win.ResizeObserver), MutationObserver:observer(win.MutationObserver),
    CustomEvent:win.CustomEvent, fontsReady:fonts.ready,
    get disposed(){return disposed;},
    resources(){return {disposed,timeouts:timeouts.size,intervals:intervals.size,frames:frames.size,observers:observers.size,listeners:listeners.size};},
    destroy(){
      if(disposed)return;disposed=true;
      timeouts.forEach(id=>win.clearTimeout(id));timeouts.clear();
      intervals.forEach(id=>win.clearInterval(id));intervals.clear();
      frames.forEach(id=>win.cancelAnimationFrame(id));frames.clear();
      observers.forEach(item=>item.native.disconnect());observers.clear();
      listeners.forEach(e=>e.target.removeEventListener(e.type,e.guarded,e.options));listeners.clear();
      documentListeners.length=0;windowListeners.length=0;
      root.querySelectorAll('*').forEach(element=>element.getAnimations().forEach(animation=>animation.cancel()));
      fonts.release();root.replaceChildren();
    }
  };
}
