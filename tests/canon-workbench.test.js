'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../src/canon.workbench.js'),'utf8');
const C=require('../tools/canon/core.cjs');
const catalog=name=>({version:1,source:'https://backstage.example.test',services:[{entityRef:'component:default/'+name,title:name,apis:[]}]});
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function harness({search='?canon=doorbell&review=one',deferBundled=false,protocol='http:'}={}){
  function element(tag){return {tag,children:[],handlers:{},appendChild(child){this.children.push(child);},setAttribute(){},addEventListener(type,fn){this.handlers[type]=fn;}};}
  const host=element(),loads=[],requests=[],pending=new Map();let refreshes=0;
  const history={state:{kept:1},replaceState(state,title,url){this.state=state;this.url=url;}};
  const sandbox={URL,URLSearchParams,history,location:{protocol,search,href:'http://example.test/workbench/flowspec.html'+search+'&layout=backstage#step=2'},
    document:{querySelector:()=>host,createElement:element},
    FlowCanon:{catalog:C.catalog,validate:()=>[]},normalize:x=>x,validate:()=>({errors:[]}),
    fetch(url,options){requests.push({url,options});if(options?.method==='POST')return Promise.resolve({ok:true,json:async()=>({id:'new-review'})});
      if(url==='catalog.json'&&!deferBundled)return Promise.resolve({ok:true,json:async()=>({version:1,source:'',services:[]})});
      return new Promise(resolve=>{pending.set(url,resolve);});}};
  vm.runInNewContext(source,sandbox);
  const src={value:'{"page":{"title":"Existing"}}'};
  const context=sandbox.initCanonWorkbench({src,loadSpec:raw=>loads.push(raw),catalogChanged:()=>refreshes++});
  const details=host.children[0],status=details.children[1],save=details.children.find(c=>c.textContent==='Propose spec update');
  return {context,loads,requests,src,status,save,history,get refreshes(){return refreshes;},
    input:details.children.find(c=>c.tag==='label').children[0],
    catalogStatus:details.children.find(c=>c.className==='canon-catalog-status'),
    manual:async raw=>{details.children.find(c=>c.tag==='label').children[0].value=JSON.stringify(raw);await details.children.find(c=>c.textContent==='Load catalog').handlers.click();},
    bundled:async(raw,code=200)=>{pending.get('catalog.json')({ok:code===200,status:code,json:async()=>raw});await context.catalogReady;},
    complete:async()=>{pending.get('/api/canon/context?id=doorbell&review=one')({ok:true,json:async()=>({spec:{page:{title:'Company diagram'}},catalog:catalog('live'),revision:'rev-1'})});await flush();}
  };
}
test('a company deep link loads the spec and retains its revision for proposals',async()=>{
  const h=harness();await h.complete();
  assert.equal(h.loads.length,1);assert.equal(h.context.revision,'rev-1');assert.equal(h.save.disabled,false);
  await h.save.handlers.click();
  const proposal=JSON.parse(h.requests.find(r=>r.options?.method==='POST').options.body);
  assert.equal(proposal.id,'doorbell');assert.equal(proposal.review,'one');assert.equal(proposal.baseRevision,'rev-1');
});
test('opening a new local project preserves catalog choices but detaches the old company proposal',async()=>{
  const h=harness();await h.complete();h.context.detach();
  assert.equal(h.context.catalog.services.length,1);assert.equal(h.context.revision,null);
  assert.equal(h.save.hidden,true);assert.equal(h.save.disabled,true);
  await h.save.handlers.click();assert.equal(h.requests.filter(r=>r.options?.method==='POST').length,0);
  assert.match(h.status.textContent,/not attached/);
  assert.equal(h.history.url,'/workbench/flowspec.html?layout=backstage#step=2');
  assert.deepEqual(h.history.state,{kept:1});
});
test('a slow company response cannot overwrite a new project chosen from welcome',async()=>{
  const h=harness();h.context.detach();await h.complete();
  assert.equal(h.loads.length,0);assert.equal(h.context.revision,null);assert.equal(h.save.disabled,true);
});
test('a fresh static workbench loads its bundled catalog without a company context or source edit',async()=>{
  const h=harness({search:'',deferBundled:true}),original=h.src.value;
  await h.bundled(catalog('bundled'));
  assert.equal(h.requests.length,1);assert.equal(h.requests[0].url,'catalog.json');assert.equal(h.requests[0].options.cache,'no-cache');
  assert.equal(h.context.catalog.services[0].title,'bundled');assert.equal(h.refreshes,1);
  assert.equal(h.src.value,original);assert.equal(h.loads.length,0);assert.match(h.catalogStatus.textContent,/bundled catalog/);
});
test('approved bundled choices take precedence over live context in either completion order',async()=>{
  for(const first of ['bundled','live']){
    const h=harness({deferBundled:true});
    if(first==='bundled'){await h.bundled(catalog('approved'));await h.complete();}
    else {await h.complete();await h.bundled(catalog('approved'));}
    assert.equal(h.context.catalog.services[0].title,'approved');assert.equal(h.loads.length,1);assert.equal(h.context.revision,'rev-1');
  }
});
test('late bundled or company responses cannot replace a manual catalog import',async()=>{
  const h=harness({deferBundled:true});await h.manual(catalog('manual'));await h.bundled(catalog('bundled'));await h.complete();
  assert.equal(h.context.catalog.services[0].title,'manual');assert.equal(h.refreshes,1);assert.match(h.catalogStatus.textContent,/imported catalog/);
});
test('catalog arrival preserves text being typed for a manual import',async()=>{
  const h=harness({search:'',deferBundled:true});h.input.value='{"version":1,"services":[';h.input.handlers.input();
  await h.bundled(catalog('bundled'));
  assert.equal(h.input.value,'{"version":1,"services":[');assert.equal(h.context.catalog.services[0].title,'bundled');
});
test('missing or malformed bundled catalogs leave editing available and retain manual bindings',async()=>{
  for(const [raw,code] of [[null,404],[{version:99},200]]){
    const h=harness({search:'',deferBundled:true}),original=h.src.value;await h.bundled(raw,code);
    assert.equal(h.context.catalog,null);assert.equal(h.src.value,original);assert.equal(h.loads.length,0);assert.match(h.catalogStatus.textContent,/unavailable/);
    await h.manual(catalog('manual'));await h.manual({version:99});assert.equal(h.context.catalog.services[0].title,'manual');
  }
  const offline=harness({search:'',protocol:'file:'});assert.equal(offline.requests.length,0);await offline.manual(catalog('offline'));assert.equal(offline.context.catalog.services.length,1);
});
