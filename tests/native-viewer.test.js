'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');

test('native CSS maps root type selectors without altering panel names, attributes, strings or keyframes',async()=>{
  const {scopeNativeCss}=await import('../tools/native-viewer-styles.mjs');
  const css='/* body html :root { } */\n:root{--label:"body { :root }";}\n'+
    'html,body.sk-editorial .widget-body [data-body="html"]:is(body, .body){content:"body";}\n'+
    '@media(min-width:1px){body .html,#body,[body=html]{color:red}}\n'+
    '@keyframes body{from{opacity:0}to{opacity:1}}';
  assert.equal(scopeNativeCss(css),'/* body html :root { } */\n.flowview-root{--label:"body { :root }";}\n'+
    'flowview-root,flowview-root.sk-editorial .widget-body [data-body="html"]:is(flowview-root, .body){content:"body";}\n'+
    '@media(min-width:1px){flowview-root .html,#body,[body=html]{color:red}}\n'+
    '@keyframes body{from{opacity:0}to{opacity:1}}');
});

test('native instance owns delayed callbacks, observers, shared fonts and normalized listener lifetimes',async()=>{
  let next=0;const pending=new Map(),fonts=new Set(),events=new Map(),observed=new Set(),loaded=[];
  function surface(){return {childNodes:[],append(...children){this.childNodes.push(...children);},replaceChildren(){this.childNodes=[];},getElementById(){return null;},querySelectorAll(){return [];},
    addEventListener(type,fn,options){const capture=typeof options==='boolean'?options:!!options?.capture;const list=events.get(this)||[];list.push({type,fn,capture});events.set(this,list);},
    removeEventListener(type,fn,options){const capture=typeof options==='boolean'?options:!!options?.capture;events.set(this,(events.get(this)||[]).filter(e=>e.type!==type||e.fn!==fn||e.capture!==capture));}};}
  const schedule=fn=>{pending.set(++next,fn);return next;},cancel=id=>pending.delete(id);
  class Observer{constructor(fn){this.fn=fn;observed.add(this);}observe(){}disconnect(){observed.delete(this);}}
  const win=Object.assign(surface(),{setTimeout:schedule,clearTimeout:cancel,setInterval:schedule,clearInterval:cancel,requestAnimationFrame:schedule,cancelAnimationFrame:cancel,
    matchMedia(){return {matches:false};},ResizeObserver:Observer,MutationObserver:Observer,
    FontFace:class{load(){return new Promise(resolve=>loaded.push(()=>resolve(this)));}},CustomEvent:class{}});
  const doc=Object.assign(surface(),{defaultView:win,fonts:{add:font=>fonts.add(font),delete:font=>fonts.delete(font)},createElement:surface,createElementNS:surface,createComment:surface});
  const host=()=>({ownerDocument:doc,attachShadow(){return this.shadowRoot=surface();}});
  const context={};vm.runInNewContext(fs.readFileSync(require.resolve('../src/native/environment.js'),'utf8')+'\nthis.create=createNativeEnvironment;',context);
  const assets={css:'',icons:'',fonts:[{family:'Private',source:'data:',weight:400}]};
  const a=context.create(host(),assets),b=context.create(host(),assets);assert.equal(fonts.size,1);
  let calls=0;const listener=()=>calls++;
  a.window.addEventListener('resize',listener,{capture:true});a.window.addEventListener('resize',listener,true);
  assert.equal(a.resources().listeners,1);a.window.removeEventListener('resize',listener,{capture:true});assert.equal(a.resources().listeners,0);
  a.setTimeout(listener,10);a.setInterval(listener,10);a.requestAnimationFrame(listener);new a.ResizeObserver(listener).observe({});
  a.document.addEventListener('keydown',listener,true);const retiredCallbacks=[...pending.values(),...[...observed].map(o=>o.fn),...events.get(a.root).map(e=>e.fn)];
  a.destroy();a.destroy();assert.equal(fonts.size,1);assert.equal(a.root.childNodes.length,0);
  retiredCallbacks.forEach(fn=>fn({}));assert.equal(calls,0);assert.equal(pending.size,0);assert.equal(observed.size,0);
  assert.deepEqual(JSON.parse(JSON.stringify(a.resources())),{disposed:true,timeouts:0,intervals:0,frames:0,observers:0,listeners:0});
  b.destroy();assert.equal(fonts.size,0);loaded.forEach(done=>done());await b.fontsReady;assert.equal(fonts.size,0);
  a.setTimeout(listener,10);a.requestAnimationFrame(listener);assert.equal(pending.size,0);
});
