'use strict';
/* A permissive fake DOM for the reader Contents and document search shells (#1318): real class lists,
   inline style maps, parent links and a mutation log; every other DOM method is a no-op. Loads the real
   workbench bundle so the code under test is the shipped code. Compare strings, never elements: fake
   elements in an assertion diff can exhaust memory. */
const vm=require('node:vm');
const {entrypoint}=require('../../tools/source-loader.cjs');

function makeDom(log){
  const noop=()=>{},proxies=new WeakMap(),proxyOf=e=>proxies.get(e) || e;
  let doc;
  function element(tag){
    let cls=[];const attrs={},props=new Map();
    const style={setProperty(k,v){log.push('set '+k+' '+v);props.set(k,String(v));},removeProperty(k){log.push('remove '+k);props.delete(k);},getPropertyValue(k){return props.get(k) || '';}};
    const el={tagName:String(tag).toUpperCase(),nodeType:1,children:[],parentElement:null,parentNode:null,style,dataset:{},hidden:false,textContent:'',innerHTML:'',id:'',value:'',
      offsetWidth:0,offsetHeight:0,clientWidth:0,clientHeight:0,scrollTop:0,scrollLeft:0,scrollHeight:0,
      get className(){return cls.join(' ');},set className(v){cls=String(v).split(/\s+/).filter(Boolean);},
      classList:{add(...c){c.forEach(x=>{if(!cls.includes(x))cls.push(x);});},remove(...c){cls=cls.filter(x=>!c.includes(x));},contains(c){return cls.includes(c);},
        toggle(c,force){const on=force===undefined?!cls.includes(c):!!force;if(on)this.add(c);else this.remove(c);return on;}},
      appendChild(child){if(child.parentNode)child.remove();child.parentElement=child.parentNode=proxyOf(el);el.children.push(child);if(child.tagName==='STYLE')log.push('insert style '+child.className);return child;},
      append(...c){c.forEach(x=>el.appendChild(x));},prepend(...c){c.forEach(x=>el.appendChild(x));},
      insertBefore(child){return el.appendChild(child);},replaceChildren(...c){el.children.slice().forEach(x=>x.remove());c.forEach(x=>el.appendChild(x));},
      remove(){const parent=el.parentNode;if(!parent)return;parent.children.splice(parent.children.indexOf(proxyOf(el)),1);el.parentNode=el.parentElement=null;if(el.tagName==='STYLE')log.push('remove style '+cls.join(' '));},
      setAttribute(k,v){attrs[k]=String(v);if(k==='id')el.id=String(v);},getAttribute(k){return attrs[k] ?? null;},removeAttribute(k){delete attrs[k];},hasAttribute(k){return k in attrs;},
      querySelector(){return null;},querySelectorAll(){return [];},contains(x){return x===proxyOf(el);},
      getBoundingClientRect(){return {left:0,top:0,right:0,bottom:0,width:0,height:0};},getRootNode(){return doc;},
      matches(selector){return selector.split(',').some(s=>{s=s.trim();return s.startsWith('.') && s.slice(1).split('.').every(c=>cls.includes(c));});},
      closest(selector){for(let at=proxyOf(el);at;at=at.parentElement)if(at.matches && at.matches(selector))return at;return null;}};
    const proxy=new Proxy(el,{get(t,k){return k in t?t[k]:typeof k==='string'?noop:undefined;},set(t,k,v){t[k]=v;return true;}});
    proxies.set(el,proxy);el.ownerDocument=null;return proxy;
  }
  doc={nodeType:9,createElement:element,createElementNS:(ns,t)=>element(t),createComment:()=>element('#comment'),createTextNode:t=>Object.assign(element('#text'),{textContent:t}),
    activeElement:null,addEventListener:noop,removeEventListener:noop,createTreeWalker:()=>({nextNode:()=>null}),createRange:()=>({setStart:noop,setEnd:noop})};
  doc.documentElement=element('html');doc.head=element('head');doc.body=element('body');
  return {doc,element};
}

function viewerEnvironment(options={}){
  const log=[],{doc,element}=makeDom(log);
  class Highlight extends Set{}
  const registry=new Map();
  const win={addEventListener(){},removeEventListener(){},innerWidth:1440,innerHeight:900,CSS:{highlights:registry},Highlight,NodeFilter:{SHOW_TEXT:4}};
  doc.defaultView=win;
  const C={URL,console,document:doc,window:win,Promise,
    getComputedStyle:()=>({getPropertyValue:()=>''}),requestAnimationFrame:()=>1,cancelAnimationFrame(){},setTimeout:()=>1,clearTimeout(){},
    MutationObserver:class{observe(){}disconnect(){}}};
  vm.createContext(C);vm.runInContext(entrypoint('workbench').body,C);
  if(options.stubSearch)vm.runInContext('createDocumentSearch=function(){return {mark:function(){},destroy:function(){},refresh:function(){}};}',C);
  function view(id,canvas){
    const body=doc.body;if(canvas)body.classList.add('workspace-canvas');
    const v=element('div');v.setAttribute('id',id);v.ownerDocument=doc;body.appendChild(v);
    const nav=element('nav');nav.ownerDocument=doc;v.appendChild(nav);
    return {view:v,nav,ctl:{view:v,sections:[],tabBlocks:[],activeTarget:{section:1},views:null,page:{}}};
  }
  return {C,doc,element,log,registry,view,flush:()=>new Promise(resolve=>setImmediate(resolve))};
}
module.exports={viewerEnvironment};
