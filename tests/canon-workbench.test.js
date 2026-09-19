'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../src/canon.workbench.js'),'utf8');
function harness(){
  function element(){return {children:[],handlers:{},appendChild(child){this.children.push(child);},setAttribute(){},addEventListener(type,fn){this.handlers[type]=fn;}};}
  const host=element(),loads=[],requests=[];
  let finish;
  const history={state:{kept:1},replaceState(state,title,url){this.state=state;this.url=url;}};
  const sandbox={URL,URLSearchParams,history,location:{search:'?canon=doorbell&review=one',href:'http://example.test/workbench/flowspec.html?canon=doorbell&review=one&layout=backstage#step=2'},
    document:{querySelector:()=>host,createElement:element},
    FlowCanon:{catalog:raw=>raw,validate:()=>[]},normalize:x=>x,validate:()=>({errors:[]}),
    fetch(url,options){requests.push({url,options});if(options)return Promise.resolve({ok:true,json:async()=>({id:'new-review'})});return new Promise(resolve=>{finish=resolve;});}};
  vm.runInNewContext(source,sandbox);
  const src={value:'{"page":{"title":"Existing"}}'};
  const context=sandbox.initCanonWorkbench({src,loadSpec:raw=>loads.push(raw)});
  const details=host.children[0],status=details.children[1],save=details.children.find(c=>c.textContent==='Propose spec update');
  return {context,loads,requests,src,status,save,history,complete:async()=>{
    finish({ok:true,json:async()=>({spec:{page:{title:'Company diagram'}},catalog:{services:[{name:'camera'}]},revision:'rev-1'})});
    await new Promise(resolve=>setImmediate(resolve));
  }};
}
test('a company deep link loads the spec and retains its revision for proposals',async()=>{
  const h=harness();await h.complete();
  assert.equal(h.loads.length,1);assert.equal(h.context.revision,'rev-1');assert.equal(h.save.disabled,false);
  await h.save.handlers.click();
  const proposal=JSON.parse(h.requests[1].options.body);
  assert.equal(proposal.id,'doorbell');assert.equal(proposal.review,'one');assert.equal(proposal.baseRevision,'rev-1');
});
test('opening a new local project preserves catalog choices but detaches the old company proposal',async()=>{
  const h=harness();await h.complete();h.context.detach();
  assert.equal(h.context.catalog.services.length,1);assert.equal(h.context.revision,null);
  assert.equal(h.save.hidden,true);assert.equal(h.save.disabled,true);
  await h.save.handlers.click();assert.equal(h.requests.length,1);
  assert.match(h.status.textContent,/not attached/);
  assert.equal(h.history.url,'/workbench/flowspec.html?layout=backstage#step=2');
  assert.deepEqual(h.history.state,{kept:1});
});
test('a slow company response cannot overwrite a new project chosen from welcome',async()=>{
  const h=harness();h.context.detach();await h.complete();
  assert.equal(h.loads.length,0);assert.equal(h.context.revision,null);assert.equal(h.save.disabled,true);
});
