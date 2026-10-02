'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readSource,entrypoint,readStyles}=require('../tools/source-loader.cjs');

function harness(){
  function element(tag='div'){
    const node={tag,children:[],className:'',textContent:'',attributes:{},hidden:false,
      style:{setProperty(){},removeProperty(){}},
      appendChild(child){child.parentNode=node;node.children.push(child);return child;},
      setAttribute(name,value){node.attributes[name]=String(value);},
      addEventListener(){},removeEventListener(){},dispatchEvent(){},
      querySelectorAll(){return [];},querySelector(){return null;},
      insertAdjacentHTML(_where,html){node.insertedHTML=(node.insertedHTML||'')+html;}};
    let html='';
    Object.defineProperty(node,'innerHTML',{get(){return html;},set(value){html=String(value);node.children=[];}});
    return node;
  }
  const document={createElement:element};
  const context=vm.createContext({document,URL});
  vm.runInContext(readSource('validator.js')+'\n'+readSource('engine.js'),context);
  return {context,element};
}

test('shared renderPage header shows the global lockup and honors page overrides and opt-out',()=>{
  const h=harness(),view=h.element();
  h.context.renderPage(view,{title:'System map',sections:[]},'aurora');
  assert.equal(view.children[0].className,'doc-heading');
  assert.equal(view.children[0].children[0].textContent,'System map');
  assert.match(view.children[0].children[1].innerHTML,/doc-company-brand-lockup/);
  assert.match(view.children[0].children[1].innerHTML,/YOUR COMPANY/);
  assert.match(view.children[0].children[1].innerHTML,/YC/);

  const local=h.element();
  h.context.renderPage(local,{title:'Local',brand:{app:'Local Co',logo:'LC'},sections:[]},'aurora');
  assert.match(local.children[0].children[1].innerHTML,/Local Co/);
  assert.match(local.children[0].children[1].innerHTML,/LC/);
  assert.doesNotMatch(local.children[0].children[1].innerHTML,/YOUR COMPANY/);

  const off=h.element();
  h.context.renderPage(off,{title:'Private',brand:false,sections:[]},'aurora');
  assert.equal(off.children[0].children.length,1);
});

test('all rendered viewer entrypoints share one header implementation and embed CSS suppresses it',()=>{
  for(const name of ['standalone','workbench','native','forge']){
    const source=entrypoint(name).source;
    assert.equal(source.split("className = 'doc-company-brand'").length-1,1,name);
  }
  assert.match(readStyles('style.core.css'),/body\.dv-embed \.doc-heading/);
});
