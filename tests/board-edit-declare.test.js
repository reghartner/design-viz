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
| D2 | Keys: a slug of the operation's last meaningful segment (after the last /, skipping {id}, :id and numbers), starting with a letter, unique on the carrier (-2, -3); declarePreview says the key before the write. |
| D3 | Refusals change nothing: no operation, a role the carrier cannot have, an unknown carrier. |
| D4 | Imported node: an added span in nodeTracking.<id>.trace.spans (tickets kept), a hidden provider name is taken, the provider untouched, the resolved board shows it. |
| D5 | Save records {op:"trace-span", path, label, node|edge, span:{key, serviceName, operation, role}}; the validator accepts the history entry. |
| D6 | A conflict replay re-applies the declaration on the winner's text, or counts it as already there. |
| D8 | A conflict replay compares the whole declared span: a winner with the same key and another role is not "already there"; the change is dropped (not written under a new key) and the notice names it, its span and the true reason. With two declarations on one carrier, only the clashing one is dropped. |
| D10 | Every replay-drop reason is true for its case: a mapping whose step the winner maps differently names that mapping; a clear with no marker left says so; a gone carrier keeps "carrier moved, removed or ambiguous"; a ticket add whose provider now carries the ticket says so, naming the provider by its title. Each refusal is its own sentence; "1 … was"; no "0 could not be" clause. |
| D11 | A replayed declaration whose whole span the winner already declares under another key counts as already there and writes nothing. |
| D9 | A span the carrier already declares under another key (same service, operation and role) is refused: "Already declared as <key> on <title>." |
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
  assert.deepEqual(plain(b.d().nodes.web.trace),{spans:{checkout:{serviceName:'frontend',operation:'/cart/checkout',role:'process'}}});
  assert.equal(b.e.state().pending,1);
  assert.deepEqual(plain(b.e.state().declared),{key:'checkout',label:'Web',span:{serviceName:'frontend',operation:'/cart/checkout',role:'process'}});
  assert.equal(b.e.undoDeclare(),true);assert.equal(b.e.text(),b.text,'Undo restores the exact text');assert.equal(b.e.state().pending,0);assert.equal(b.e.state().declared,null);
  assert.equal(b.e.declareSpan(EDGE,{serviceName:'frontend',operation:'POST /charge',role:'send'}),true);
  assert.deepEqual(plain(b.d().edges[0].trace),{spans:{'post-charge':{serviceName:'frontend',operation:'POST /charge',role:'send'}}},'a leading HTTP method is kept');
  assert.equal(b.e.state().declared.label,'Web → Pay');
  // A node that has spans keeps them, its tickets and its order.
  assert.equal(b.e.declareSpan(PAY,{serviceName:'payment',operation:'Refund',role:'process'}),true);
  assert.deepEqual(Object.keys(b.d().nodes.pay.trace.spans),['charge-card','refund']);assert.deepEqual(plain(b.d().nodes.pay.tickets),['PAY-1']);
});

test('D2 keys: a slug of the operation\'s last meaningful segment, starting with a letter, unique on the carrier; the preview says it first',async()=>{
  const b=await editor(local());
  assert.deepEqual(plain(b.e.declarePreview(PAY,{serviceName:'payment',operation:'Charge card',role:'call'})),{key:'charge-card-2'},'charge-card is taken on Pay');
  assert.equal(b.e.declareSpan(PAY,{serviceName:'payment',operation:'Charge card',role:'call'}),true);
  assert.deepEqual(Object.keys(b.d().nodes.pay.trace.spans),['charge-card','charge-card-2']);
  assert.deepEqual(plain(b.e.declarePreview(PAY,{serviceName:'payment',operation:'Charge card',role:'work'})),{key:'charge-card-3'});
  assert.deepEqual(plain(b.e.declarePreview(WEB,{serviceName:'x',operation:'grpc.msdemo.PaymentService/Charge',role:'process'})),{key:'charge'});
  assert.deepEqual(plain(b.e.declarePreview(WEB,{serviceName:'x',operation:'INSERT orders',role:'process'})),{key:'insert-orders'});
  assert.deepEqual(plain(b.e.declarePreview(WEB,{serviceName:'x',operation:'GET /items/{id}',role:'process'})),{key:'get-items'},'a path parameter is skipped; the HTTP method stays');
  assert.deepEqual(plain(b.e.declarePreview(WEB,{serviceName:'x',operation:'GET /orders',role:'process'})),{key:'get-orders'});
  assert.deepEqual(plain(b.e.declarePreview(WEB,{serviceName:'x',operation:'/v2/orders/42/',role:'process'})),{key:'orders'},'numbers and a trailing slash are skipped');
  assert.deepEqual(plain(b.e.declarePreview(WEB,{serviceName:'x',operation:'route.event',role:'process'})),{key:'route-event'},'no slash: the whole operation');
  assert.deepEqual(plain(b.e.declarePreview(WEB,{serviceName:'x',operation:'123 go!',role:'process'})),{key:'span-123-go'});
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
  assert.deepEqual(saved.page.editHistory.at(-1).changes,[{op:'trace-span',path:['page','sections',0,'diagram','nodes','web'],label:'Web',node:'web',span:{key:'checkout',serviceName:'frontend',operation:'/cart/checkout',role:'process'}}]);
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
  assert.deepEqual(plain(next.d().nodes.web.trace),{spans:{checkout:{serviceName:'frontend',operation:'/cart/checkout',role:'process'}}});
  assert.match(next.e.state().notice.text,/1 of your changes was re-applied\./);
  const store2=new Map(),again=await editor(local(),{store:store2,reject:'conflict'});
  again.e.declareSpan(WEB,{serviceName:'frontend',operation:'/cart/checkout',role:'process'});again.e.save();await settle();
  const already=local();already.page.sections[0].diagram.nodes.web.trace={spans:{checkout:{serviceName:'frontend',operation:'/cart/checkout',role:'process'}}};
  const third=await editor(already,{store:store2,start:false});
  assert.match(third.e.state().notice.text,/1 was already in their version/);
  assert.deepEqual(Object.keys(third.d().nodes.web.trace.spans),['checkout'],'not declared twice');
});

test('D8 a replay compares the whole declared span: the same key with another role is not already there, and is dropped',async()=>{
  const store=new Map(),first=await editor(local(),{store,reject:'conflict'});
  first.e.declareSpan(WEB,{serviceName:'frontend',operation:'/cart/checkout',role:'process'});first.e.save();await settle();
  const winner=local();winner.page.sections[0].diagram.nodes.web.trace={spans:{checkout:{serviceName:'frontend',operation:'/cart/checkout',role:'call'}}};
  const next=await editor(winner,{store,start:false});
  assert.equal(next.e.state().notice.text,'Another editor saved first. 0 of your changes were re-applied. Span checkout (frontend · /cart/checkout) declared on Web could not be re-applied: their version already declares a different span under checkout (frontend · /cart/checkout, role call); declare yours again under another name.');
  assert.deepEqual(plain(next.d().nodes.web.trace),{spans:{checkout:{serviceName:'frontend',operation:'/cart/checkout',role:'call'}}},'the winner\'s span stays; nothing under a new key');
  // Two declarations on one carrier: the one that clashes is named, the other is re-applied.
  const store2=new Map(),two=await editor(local(),{store:store2,reject:'conflict'});
  two.e.declareSpan(WEB,{serviceName:'frontend',operation:'/cart/checkout',role:'process'});two.e.declareSpan(WEB,{serviceName:'frontend',operation:'Refund',role:'process'});two.e.save();await settle();
  const w2=local();w2.page.sections[0].diagram.nodes.web.trace={spans:{checkout:{serviceName:'frontend',operation:'/cart/view',role:'process'}}};
  const again=await editor(w2,{store:store2,start:false});
  assert.equal(again.e.state().notice.text,'Another editor saved first. 1 of your changes was re-applied. Span checkout (frontend · /cart/checkout) declared on Web could not be re-applied: their version already declares a different span under checkout (frontend · /cart/view); declare yours again under another name. Save again.');
  assert.deepEqual(Object.keys(again.d().nodes.web.trace.spans),['checkout','refund']);
});

test('D10 every replay-drop reason is true for its case',async()=>{
  // A mapping whose step the winner maps to another span.
  let store=new Map(),first=await editor(local(),{store,reject:'conflict'});
  first.e.mapSpan({section:0,kind:'step',id:'charge'},{serviceName:'payment',operation:'Charge'});first.e.save();await settle();
  let winner=local();winner.page.sections[0].diagram.steps[0].traceMatch={serviceName:'payment',operation:'Capture'};
  let next=await editor(winner,{store,start:false});
  assert.equal(next.e.state().notice.text,'Another editor saved first. 0 of your changes were re-applied. Span payment · Charge mapped to Charge the card could not be re-applied: their version maps that step to payment · Capture.');
  // A clear whose marker the winner no longer has.
  const marked=local();marked.page.sections[0].diagram.nodes.web.missingWork=true;
  store=new Map();first=await editor(marked,{store,reject:'conflict'});
  first.e.clearMissingWork(WEB);first.e.save();await settle();
  next=await editor(local(),{store,start:false});
  assert.equal(next.e.state().notice.text,'Another editor saved first. 0 of your changes were re-applied. Missing work cleared from Web could not be re-applied: their version has no Missing work marker on Web to clear.');
  // A declaration whose node the winner deleted keeps the generic reason, and names the span.
  store=new Map();first=await editor(local(),{store,reject:'conflict'});
  first.e.declareSpan(WEB,{serviceName:'frontend',operation:'/cart/checkout',role:'process'});first.e.save();await settle();
  winner=local();const wd=winner.page.sections[0].diagram;delete wd.nodes.web;wd.rows=[['pay']];wd.edges=[];wd.steps=[];
  next=await editor(winner,{store,start:false});
  assert.equal(next.e.state().notice.text,'Another editor saved first. 0 of your changes were re-applied; 1 could not be (carrier moved, removed or ambiguous): span checkout (frontend · /cart/checkout) declared on Web.');
  // Two refusals: one sentence each, although the key-clash reason has its own "; ".
  const both=local();both.page.sections[0].diagram.nodes.web.missingWork=true;
  store=new Map();first=await editor(both,{store,reject:'conflict'});
  first.e.declareSpan(WEB,{serviceName:'frontend',operation:'/cart/checkout',role:'process'});first.e.clearMissingWork(WEB);first.e.save();await settle();
  winner=local();winner.page.sections[0].diagram.nodes.web.trace={spans:{checkout:{serviceName:'frontend',operation:'/cart/view',role:'process'}}};
  next=await editor(winner,{store,start:false});
  assert.equal(next.e.state().notice.text,'Another editor saved first. 0 of your changes were re-applied. Span checkout (frontend · /cart/checkout) declared on Web could not be re-applied: their version already declares a different span under checkout (frontend · /cart/view); declare yours again under another name. Missing work cleared from Web could not be re-applied: their version has no Missing work marker on Web to clear.');
  // With nothing dropped, no "0 could not be" clause; one change reads "was".
  store=new Map();first=await editor(local(),{store,reject:'conflict'});first.e.add(WEB,'WEB-1');first.e.save();await settle();
  next=await editor(local(),{store,start:false});
  assert.equal(next.e.state().notice.text,'Another editor saved first. 1 of your changes was re-applied. Save again.');
  // A ticket add on an imported node whose provider now carries that ticket: present carrier, true reason.
  const f=imported(),later=imported();later.provider.page.sections[0].diagram.nodes.store.tickets=['ST-9'];later.provider.page.title='Order platform';
  store=new Map();first=await editor(f.consumer,{context:f.context,store,reject:'conflict'});first.e.add(STORE,'ST-9');first.e.save();await settle();
  next=await editor(later.consumer,{context:later.context,store,start:false});
  assert.equal(next.e.state().notice.text,'Another editor saved first. 0 of your changes were re-applied. ST-9 on Store could not be re-applied: their version already gets ST-9 on Store from Order platform.');
});

test('D11 a replayed declaration the winner already has under another key (the whole span) is already there; nothing is written',async()=>{
  const store=new Map(),first=await editor(local(),{store,reject:'conflict'});
  first.e.declareSpan(PAY,{serviceName:'payment',operation:'/v1/charge',role:'process'});first.e.save();await settle();
  const winner=local();winner.page.sections[0].diagram.nodes.pay.trace.spans.billing={serviceName:'payment',operation:'/v1/charge',role:'process'};
  const next=await editor(winner,{store,start:false});
  assert.equal(next.e.state().notice.text,'Another editor saved first. 0 of your changes were re-applied; 1 was already in their version.');
  assert.deepEqual(Object.keys(next.d().nodes.pay.trace.spans),['charge-card','billing'],'no second declaration under charge');
});

test('D9 a span the carrier already declares under another key is refused, and nothing is written',async()=>{
  const b=await editor(local());
  assert.deepEqual(plain(b.e.declarePreview(PAY,{serviceName:'payment',operation:'Charge card',role:'process'})),{error:'Already declared as charge-card on Pay.'});
  assert.equal(b.e.declareSpan(PAY,{serviceName:'payment',operation:'Charge card',role:'process'}),false);
  assert.equal(b.e.text(),b.text);assert.equal(b.e.state().pending,0);
  const f=imported(),c=await editor(f.consumer,{context:f.context});
  assert.deepEqual(plain(c.e.declarePreview(STORE,{serviceName:'store-svc',operation:'INSERT orders',role:'database'})),{error:'Already declared as write on Store.'},'an inherited span counts');
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
