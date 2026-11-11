'use strict';
/* #1290 PR 9: "Declare on this node/connection" in board Edit mode (src/viewer/board-edit.js). A span
   dropped on a carrier is written as a declaration (trace.spans.<key>: serviceName, the exact
   operation, a role) on a local node or connection, or as an added span in the consumer overlay of an
   imported one. The key is a slug of the operation, unique on that carrier (a provider name hidden here
   is taken). It can be undone until Save; Save records one "trace-span" change, which the validator
   accepts; a conflict replay re-applies it.
| row | rule |
|---|---|
| D1 | Local node and connection: declareSpan writes trace.spans.<slug> {serviceName, operation, role}; declared() names it; Undo restores the exact text. |
| D2 | Keys: a slug of the operation, starting with a letter, unique on the carrier (-2, -3); declarePreview says the key before the write. |
| D3 | Refusals change nothing: no operation, a role the carrier cannot have, an unknown carrier. |
| D4 | Imported node: an added span in nodeTracking.<id>.trace.spans (tickets kept), a hidden provider name is taken, the provider untouched, the resolved board shows it. |
| D5 | Save records {op:"trace-span", path, label, node|edge, span:{key, serviceName, operation, role}}; the validator accepts the history entry. |
| D6 | A conflict replay re-applies the declaration on the winner's text, or counts it as already there. |
| D7 | Declare on <title> instead (team-lead ruling: the immediate mapping stays): declareInstead swaps the pending mapping for the declaration, one pending change; its Undo restores the mapping as it was; Save records only the trace-span. |
*/
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {entrypoint}=require('../tools/source-loader.cjs');
const plain=v=>JSON.parse(JSON.stringify(v));
const settle=async()=>{for(let i=0;i<12;i++)await new Promise(setImmediate);};
const page=(id,diagram,extra={})=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},...extra,sections:[{id:'main',diagram}]}});
function local(){
  return page('checkout',{nodes:{web:{title:'Web'},pay:{title:'Pay',tickets:['PAY-1'],trace:{spans:{'charge-card':{serviceName:'payment',operation:'Charge card',role:'process'}}}}},rows:[['web','pay']],
    edges:[{from:'web',to:'pay',label:'Charge'}],steps:[{id:'charge',text:'Charge the card',edge:'web->pay'}]});
}
function imported(){
  const provider=page('provider',{nodes:{store:{title:'Store',trace:{spans:{write:{serviceName:'store-svc',operation:'INSERT orders',role:'database'},old:{serviceName:'store-svc',operation:'old',role:'database'}}}}},
    rows:[['store']],topologyExports:{core:{nodes:['store'],edges:[]}}});
  const consumer=page('consumer',{nodes:{web:{title:'Web'}},rows:[['web']],
    topologyImports:[{spec:'provider',export:'core',as:'shared',nodeTracking:{store:{tickets:['ST-1'],trace:{hide:['old']}}}}]});
  return {provider,consumer,context:{version:1,id:'consumer',specs:[provider,consumer]}};
}
function runtime(store,reject){
  const published=[];
  const win={console,location:{pathname:'/board/'},addEventListener(){},removeEventListener(){},
    sessionStorage:{getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},
    claude:{use:async name=>name==='artifact'?{publish:async files=>{published.push(files['flowspec.json'].content);if(reject)throw {code:reject};}}:name==='user'?{canEdit:async()=>true,me:async()=>({id:'u1',name:'Reader'})}:null}};
  return {win,published};
}
async function editor(spec,{context=null,store=new Map(),reject=null,start=true}={}){
  const C={console,URL};vm.runInNewContext(entrypoint('standalone').body,C);
  const r=runtime(store,reject),text=JSON.stringify(spec,null,2);
  const e=C.createBoardEditor({win:r.win,text,specFile:'flowspec.json',context,render:()=>null});
  await settle();if(start){e.start();assert.equal(e.state().active,true);}
  assert.equal(typeof e.declareSpan,'function','the board editor offers declareSpan');
  return {C,e,text,published:r.published,store,d:()=>JSON.parse(e.text()).page.sections[0].diagram};
}
const PAY={section:0,kind:'node',id:'pay'},WEB={section:0,kind:'node',id:'web'},EDGE={section:0,kind:'edge',index:0},STORE={section:0,kind:'node',id:'shared::store'};

test('D1 local node and connection: one declaration each, named for the Undo note, and Undo restores the exact text',async()=>{
  const b=await editor(local());
  assert.equal(b.e.declareSpan(WEB,{serviceName:'frontend',operation:'/cart/checkout',role:'process'}),true);
  assert.deepEqual(plain(b.d().nodes.web.trace),{spans:{'cart-checkout':{serviceName:'frontend',operation:'/cart/checkout',role:'process'}}});
  assert.equal(b.e.state().pending,1);
  assert.deepEqual(plain(b.e.state().declared),{key:'cart-checkout',label:'Web',span:{serviceName:'frontend',operation:'/cart/checkout',role:'process'}});
  assert.equal(b.e.undoDeclare(),true);assert.equal(b.e.text(),b.text,'Undo restores the exact text');assert.equal(b.e.state().pending,0);assert.equal(b.e.state().declared,null);
  assert.equal(b.e.declareSpan(EDGE,{serviceName:'frontend',operation:'POST /charge',role:'send'}),true);
  assert.deepEqual(plain(b.d().edges[0].trace),{spans:{'post-charge':{serviceName:'frontend',operation:'POST /charge',role:'send'}}});
  assert.equal(b.e.state().declared.label,'Web → Pay');
  // A node that has spans keeps them, its tickets and its order.
  assert.equal(b.e.declareSpan(PAY,{serviceName:'payment',operation:'Refund',role:'process'}),true);
  assert.deepEqual(Object.keys(b.d().nodes.pay.trace.spans),['charge-card','refund']);assert.deepEqual(plain(b.d().nodes.pay.tickets),['PAY-1']);
});

test('D2 keys: a slug of the operation, starting with a letter, unique on the carrier; the preview says it first',async()=>{
  const b=await editor(local());
  assert.deepEqual(plain(b.e.declarePreview(PAY,{serviceName:'payment',operation:'Charge card',role:'process'})),{key:'charge-card-2'},'charge-card is taken on Pay');
  assert.equal(b.e.declareSpan(PAY,{serviceName:'payment',operation:'Charge card',role:'process'}),true);
  assert.deepEqual(Object.keys(b.d().nodes.pay.trace.spans),['charge-card','charge-card-2']);
  assert.deepEqual(plain(b.e.declarePreview(PAY,{serviceName:'payment',operation:'Charge card',role:'process'})),{key:'charge-card-3'});
  assert.deepEqual(plain(b.e.declarePreview(WEB,{serviceName:'x',operation:'123 go!',role:'process'})),{key:'span-123-go'});
  assert.deepEqual(plain(b.e.declarePreview(WEB,{serviceName:'x',operation:'GET /items/{id}',role:'process'})),{key:'get-items-id'});
});

test('D3 refusals change nothing: no operation, a role the carrier cannot have, an unknown carrier',async()=>{
  const b=await editor(local());
  assert.match(b.e.declarePreview(WEB,{serviceName:'x',operation:'',role:'process'}).error,/has no operation/);
  assert.match(b.e.declarePreview(WEB,{serviceName:'x',operation:'y',role:'receive'}).error,/A node's span role is one of process, database, cache, call or work\./);
  assert.match(b.e.declarePreview(EDGE,{serviceName:'x',operation:'y',role:'process'}).error,/A connection's span role is send or receive\./);
  assert.equal(b.e.declareSpan(WEB,{serviceName:'x',operation:'y',role:'receive'}),false);
  assert.equal(b.e.declareSpan({section:0,kind:'node',id:'ghost'},{serviceName:'x',operation:'y',role:'process'}),false);
  assert.equal(b.e.text(),b.text);assert.equal(b.e.state().pending,0);
});

test('D4 an imported node: an added span in the consumer overlay; a hidden provider name is taken; the provider untouched',async()=>{
  const f=imported(),before=JSON.stringify(f.provider),b=await editor(f.consumer,{context:f.context});
  assert.deepEqual(plain(b.e.declarePreview(STORE,{serviceName:'store-svc',operation:'old',role:'database'})),{key:'old-2'},'old is hidden here, and still taken');
  assert.equal(b.e.declareSpan(STORE,{serviceName:'store-svc',operation:'audit write',role:'database'}),true);
  const entry=b.d().topologyImports[0].nodeTracking.store;
  assert.deepEqual(plain(entry),{tickets:['ST-1'],trace:{hide:['old'],spans:{'audit-write':{serviceName:'store-svc',operation:'audit write',role:'database'}}}});
  const resolved=b.C.FlowTopology.resolveSource(JSON.parse(b.e.text()),f.context).page.sections[0].diagram.nodes['shared::store'].trace.spans;
  assert.deepEqual(Object.keys(resolved).sort(),['audit-write','write']);
  assert.equal(JSON.stringify(f.provider),before,'the provider is untouched');
  assert.equal(b.e.undoDeclare(),true);assert.equal(b.e.text(),b.text);
});

test('D5 Save records one trace-span change; the validator accepts the history entry',async()=>{
  const b=await editor(local());b.e.declareSpan(WEB,{serviceName:'frontend',operation:'/cart/checkout',role:'process'});b.e.save();await settle();
  assert.equal(b.published.length,1);const saved=JSON.parse(b.published[0]);
  assert.deepEqual(saved.page.editHistory.at(-1).changes,[{op:'trace-span',path:['page','sections',0,'diagram','nodes','web'],label:'Web',node:'web',span:{key:'cart-checkout',serviceName:'frontend',operation:'/cart/checkout',role:'process'}}]);
  const warnings=plain(b.C.validate(b.C.normalize(saved)).warnings).filter(w=>/editHistory/.test(w));
  assert.deepEqual(warnings,[],'the history entry is valid');
  assert.equal(b.C.editHistoryEntryProblem({at:'2026-11-11T00:00:00Z',changes:[{op:'trace-span',node:'web',span:{key:'x',serviceName:'s',operation:'o',role:'process'},ticket:'ABC-1'}]}),'changes[0].ticket: a "trace-span" change has no ticket');
  assert.equal(b.C.editHistoryEntryProblem({at:'2026-11-11T00:00:00Z',changes:[{op:'trace-span',node:'web',span:{key:'x',serviceName:'s',role:'process'}}]}),'changes[0].span: needs "key", "serviceName", "operation" and "role" strings');
});

test('D6 a conflict replay re-applies the declaration, or counts it as already there',async()=>{
  const store=new Map(),first=await editor(local(),{store,reject:'conflict'});
  first.e.declareSpan(WEB,{serviceName:'frontend',operation:'/cart/checkout',role:'process'});first.e.save();await settle();
  const winner=local();winner.page.sections[0].diagram.nodes.web.tickets=['WEB-9'];
  const next=await editor(winner,{store,start:false});
  assert.deepEqual(plain(next.d().nodes.web.trace),{spans:{'cart-checkout':{serviceName:'frontend',operation:'/cart/checkout',role:'process'}}});
  assert.match(next.e.state().notice.text,/1 of your changes were re-applied/);
  const store2=new Map(),again=await editor(local(),{store:store2,reject:'conflict'});
  again.e.declareSpan(WEB,{serviceName:'frontend',operation:'/cart/checkout',role:'process'});again.e.save();await settle();
  const already=local();already.page.sections[0].diagram.nodes.web.trace={spans:{'cart-checkout':{serviceName:'frontend',operation:'/cart/checkout',role:'process'}}};
  const third=await editor(already,{store:store2,start:false});
  assert.match(third.e.state().notice.text,/1 was already in their version/);
  assert.deepEqual(Object.keys(third.d().nodes.web.trace.spans),['cart-checkout'],'not declared twice');
});

test('D7 Declare instead swaps the pending mapping for the declaration; its Undo brings the mapping back as it was',async()=>{
  const b=await editor(local()),STEP={section:0,kind:'step',id:'charge'},SPAN={serviceName:'payment',operation:'Charge card v2',role:'process'};
  assert.equal(typeof b.e.declareInstead,'function','the board editor offers declareInstead');
  assert.equal(b.e.mapSpan(STEP,{serviceName:'payment',operation:'Charge card v2'}),true);const mappedText=b.e.text();
  assert.equal(b.e.declareInstead(PAY,SPAN),true);
  assert.equal(b.e.state().pending,1,'one pending change, not two');
  assert.equal(b.d().steps[0].traceMatch,undefined,'the mapping is gone');assert.deepEqual(plain(b.d().nodes.pay.trace.spans['charge-card-v2']),SPAN);
  assert.equal(b.e.state().mapped,null);assert.equal(b.e.state().declared.key,'charge-card-v2');assert.equal(b.e.state().lastTrace,'declare');
  assert.equal(b.e.undoDeclare(),true);
  assert.equal(b.e.text(),mappedText,'Undo restores the mapping exactly');assert.equal(b.e.state().pending,1);
  assert.deepEqual(plain(b.e.state().mapped.traceMatch),{serviceName:'payment',operation:'Charge card v2'});assert.equal(b.e.state().lastTrace,'map');
  // Swap again, then another change: Undo still brings the mapping back, and the other change stays.
  b.e.declareInstead(PAY,SPAN);b.e.add(WEB,'WEB-1');
  assert.equal(b.e.undoDeclare(),true);
  assert.deepEqual(plain(b.d().steps[0].traceMatch),{serviceName:'payment',operation:'Charge card v2'});assert.equal(Object.hasOwn(b.d().nodes.pay.trace.spans,'charge-card-v2'),false);
  assert.deepEqual(plain(b.d().nodes.web.tickets),['WEB-1']);assert.equal(b.e.state().pending,2);
  // Save after a swap records only the declaration.
  const c=await editor(local());c.e.mapSpan(STEP,{serviceName:'payment',operation:'Charge card v2'});c.e.declareInstead(PAY,SPAN);c.e.save();await settle();
  assert.deepEqual(JSON.parse(c.published[0]).page.editHistory.at(-1).changes.map(x=>x.op),['trace-span']);
  // Nothing to swap: refused.
  const e=await editor(local());assert.equal(e.e.declareInstead(PAY,SPAN),false);assert.equal(e.e.state().pending,0);
});
