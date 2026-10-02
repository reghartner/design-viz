'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readSource,entrypoint,readStyles}=require('../tools/source-loader.cjs');
const {companyBrand}=require('./helpers/company-brand.cjs');

const escapeHtml=value=>String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const escapeRegex=value=>String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function assertRenderedBrand(html,brand){
  assert.match(html,new RegExp('<span class="fv-brand-name">'+escapeRegex(escapeHtml(brand.app))+'</span>'));
  if(brand.logoImage)assert.ok(html.includes('src="'+escapeHtml(brand.logoImage)+'"'));
  else assert.match(html,new RegExp('aria-label="'+escapeRegex(escapeHtml(brand.app+' logo'))+'"[^>]*>'+escapeRegex(escapeHtml(brand.logo))+'</span>'));
  assert.ok(html.includes('style="--fv-brand-accent:'+brand.accent+';--fv-brand-bg:'+brand.bg+';--fv-brand-fg:'+brand.fg+'"'));
}

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
  const h=harness(),view=h.element(),global=companyBrand();
  h.context.renderPage(view,{title:'System map',sections:[]},'aurora');
  assert.equal(view.children[0].className,'doc-heading');
  assert.equal(view.children[0].children[0].textContent,'System map');
  assert.match(view.children[0].children[1].innerHTML,/doc-company-brand-lockup/);
  assertRenderedBrand(view.children[0].children[1].innerHTML,global);

  const local=h.element(),localName=global.app==='Local Co'?'Local Override':'Local Co';
  h.context.renderPage(local,{title:'Local',brand:{app:localName,logo:'LC'},sections:[]},'aurora');
  const localHtml=local.children[0].children[1].innerHTML;
  assertRenderedBrand(localHtml,{...global,app:localName,logo:'LC',logoImage:undefined});
  assert.doesNotMatch(localHtml,new RegExp('<span class="fv-brand-name">'+escapeRegex(escapeHtml(global.app))+'</span>'));

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

test('workbench example and Canon reader suppress the complete title and company lockup wrapper',()=>{
  const styles=readStyles('style.workbench.css');
  assert.match(styles,/#welcome-example-stage>\.doc-heading[^}]*display:none/);
  assert.match(styles,/#canon-reader \.doc-heading\{display:none\}/);
  assert.doesNotMatch(styles,/#welcome-example-stage>\.doc-title/);
  assert.doesNotMatch(styles,/#canon-reader \.doc-title\{display:none\}/);
});
