'use strict';
/* #1318: the Workbench canvas class that replaced `.workspace-canvas:has(#docview.has-reader-contents)`
   follows the reader Contents lifecycle exactly.
| row | rule | fixture | assertion | broken implementation it rejects |
|---|---|---|---|---|
| C1 | Creating Contents on #docview inside .workspace-canvas adds workspace-docview-contents beside has-reader-contents; destroy() removes both. | fake DOM: body.workspace-canvas > #docview > nav | class strings after create and after destroy | a class left behind (zoom buttons stay hidden), or never set |
| C2 | Contents on any other view, or a #docview outside a Workbench canvas, leaves the canvas classes alone. | view #page-preview-view; #docview under a plain body | body class string unchanged through create and destroy | a reader preview or standalone reader writing Workbench state |
Class strings are compared, never elements (fake elements in assert diffs can exhaust memory). */
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {entrypoint}=require('../tools/source-loader.cjs');

/* A permissive fake DOM: real class lists and parent links; every other DOM method is a no-op. */
function makeDom(){
  const noop=()=>{},proxies=new WeakMap(),proxyOf=e=>proxies.get(e) || e;
  let doc;
  function element(tag){
    let cls=[];const attrs={};
    const el={tagName:String(tag).toUpperCase(),children:[],parentElement:null,parentNode:null,style:{setProperty:noop,removeProperty:noop},dataset:{},hidden:false,textContent:'',innerHTML:'',id:'',
      offsetWidth:0,offsetHeight:0,clientWidth:0,clientHeight:0,scrollTop:0,scrollLeft:0,scrollHeight:0,
      get className(){return cls.join(' ');},set className(v){cls=String(v).split(/\s+/).filter(Boolean);},
      classList:{add(...c){c.forEach(x=>{if(!cls.includes(x))cls.push(x);});},remove(...c){cls=cls.filter(x=>!c.includes(x));},contains(c){return cls.includes(c);},
        toggle(c,force){const on=force===undefined?!cls.includes(c):!!force;if(on)this.add(c);else this.remove(c);return on;}},
      appendChild(child){child.parentElement=child.parentNode=proxyOf(el);el.children.push(child);return child;},append(...c){c.forEach(x=>el.appendChild(x));},
      insertBefore(child){return el.appendChild(child);},replaceChildren(...c){el.children=[];c.forEach(x=>el.appendChild(x));},
      setAttribute(k,v){attrs[k]=String(v);if(k==='id')el.id=String(v);},getAttribute(k){return attrs[k] ?? null;},removeAttribute(k){delete attrs[k];},hasAttribute(k){return k in attrs;},
      querySelector(){return null;},querySelectorAll(){return [];},contains(x){return x===proxyOf(el);},
      getBoundingClientRect(){return {left:0,top:0,right:0,bottom:0,width:0,height:0};},getRootNode(){return doc;},
      matches(selector){return selector.split(',').some(s=>{s=s.trim();return s.startsWith('.') && s.slice(1).split('.').every(c=>cls.includes(c));});},
      closest(selector){for(let at=proxyOf(el);at;at=at.parentElement)if(at.matches && at.matches(selector))return at;return null;}};
    const proxy=new Proxy(el,{get(t,k){return k in t?t[k]:typeof k==='string'?noop:undefined;}});
    proxies.set(el,proxy);el.ownerDocument=null;return proxy;
  }
  doc={createElement:element,createElementNS:(ns,t)=>element(t),createComment:()=>element('#comment'),createTextNode:t=>Object.assign(element('#text'),{textContent:t}),
    activeElement:null,addEventListener:noop,removeEventListener:noop};
  doc.documentElement=element('html');doc.body=element('body');
  return {doc,element};
}
function environment(){
  const {doc,element}=makeDom();
  const C={URL,console,document:doc,window:{addEventListener(){},removeEventListener(){},innerWidth:1440,innerHeight:900},
    getComputedStyle:()=>({getPropertyValue:()=>''}),requestAnimationFrame:()=>1,cancelAnimationFrame(){},setTimeout:()=>1,clearTimeout(){}};
  vm.createContext(C);vm.runInContext(entrypoint('workbench').body,C);
  // Document search has its own tests; this check needs only the Contents shell around it.
  vm.runInContext('createDocumentSearch=function(){return {mark:function(){},destroy:function(){},refresh:function(){}};}',C);
  function contents(viewId,canvas){
    const body=doc.body;body.className=canvas?'workspace-canvas':'';
    const view=element('div');view.setAttribute('id',viewId);view.ownerDocument=doc;body.appendChild(view);
    const nav=element('nav');nav.ownerDocument=doc;view.appendChild(nav);
    const ctl={view,sections:[],tabBlocks:[],activeTarget:{section:1},views:null};
    return {body,view,instance:C.createReaderContents(ctl,nav,element('div'),{})};
  }
  return {contents};
}

test('C1 Contents on #docview inside the Workbench canvas sets workspace-docview-contents and destroy() removes it',()=>{
  const {body,view,instance}=environment().contents('docview',true);
  assert.equal(view.className,'has-reader-contents');
  assert.equal(body.className,'workspace-canvas workspace-docview-contents','the canvas mirrors reader Contents');
  instance.destroy();
  assert.equal(view.className,'');
  assert.equal(body.className,'workspace-canvas','destroy() removes the mirror, so the zoom buttons come back');
});

test('C2 other views and a #docview outside a Workbench canvas leave the canvas classes alone',()=>{
  const env=environment();
  for(const [id,canvas,expected] of [['page-preview-view',true,'workspace-canvas'],['docview',false,'']]){
    const {body,instance}=env.contents(id,canvas);
    assert.equal(body.className,expected,id+(canvas?' in the canvas':' outside a canvas')+' after create');
    instance.destroy();
    assert.equal(body.className,expected,id+' after destroy');
  }
});
