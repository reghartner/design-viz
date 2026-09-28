'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
async function helper(t){
  // Lease time is a protocol input, not the time spent in fetch/filesystem I/O.
  // The test context restores this mock after the server is closed.
  let now=Date.now();t.mock.method(Date,'now',()=>now);
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'flowview-agent-test-'));
  await fs.mkdir(path.join(dir,'workbench'));await fs.mkdir(path.join(dir,'template'));
  await fs.writeFile(path.join(dir,'workbench/flowspec.html'),'<title>Workbench</title>');
  const {startAgentSession}=await import('../tools/agent-session.mjs');
  const server=await startAgentSession({root:dir,leaseMs:100});
  t.after(async()=>{await server.close();await fs.rm(dir,{recursive:true,force:true});});
  const snapshot={revision:'browser-1',project:0,source:'{"nodes":{}}',open:true,selection:[],views:[]};
  const send=(body={},headers={})=>fetch(server.origin+'/__flowview_agent/sync',{method:'POST',headers:{'Content-Type':'application/json','X-Flowview-Session':server.token,...headers},body:JSON.stringify({clientId:'browser',snapshot,...body})});
  return {server,snapshot,send,advanceTime:ms=>{now+=ms;},read:name=>fs.readFile(path.join(server.scratch,name),'utf8').then(JSON.parse),
    propose:value=>fs.writeFile(path.join(server.scratch,'proposal.json'),JSON.stringify(value))};
}
test('local helper publishes source/selection and delivers file proposals exactly once after acknowledgement',async t=>{
  const h=await helper(t),selection=[{kind:'node',section:0,id:'camera'}];
  assert.equal((await h.send({snapshot:{...h.snapshot,selection}})).status,200);
  const state=await h.read('state.json');assert.deepEqual(state.selection,selection);assert.equal(state.connected,true);
  assert.equal(state.source,h.snapshot.source);assert.ok(!JSON.stringify(state).includes(h.server.token));
  const proposal={id:'edit-1',baseRevision:state.revision,source:'{"nodes":{"a":{}}}',summary:'Add camera'};
  await h.propose(proposal);
  assert.deepEqual((await (await h.send()).json()).proposal,proposal);
  assert.deepEqual((await (await h.send()).json()).proposal,proposal,'retry before acknowledgement');
  assert.deepEqual(await (await h.send({result:{id:proposal.id,baseRevision:proposal.baseRevision,status:'applied',revision:'browser-2'}})).json(),{acknowledged:proposal.id});
  assert.equal((await h.read('result.json')).status,'applied');
  assert.deepEqual(await (await h.send()).json(),{});
  await h.send({disconnect:true});assert.equal((await h.read('state.json')).connected,false);
});
test('helper rejects other origins, unauthenticated calls, arbitrary files and conflicting tabs',async t=>{
  const h=await helper(t);
  assert.equal((await h.send({}, {'X-Flowview-Session':''})).status,403);
  assert.equal((await h.send({}, {Origin:'https://untrusted.example'})).status,403);
  assert.equal((await h.send({}, {'Sec-Fetch-Site':'cross-site'})).status,403);
  assert.equal((await fetch(h.server.origin+'/tools/agent-session.mjs')).status,404);
  assert.equal((await fetch(h.server.origin+'/.local/state.json')).status,404);
  await h.send();
  assert.deepEqual(await (await h.send({clientId:'other-tab'})).json(),{occupied:true});
  assert.equal((await h.read('state.json')).revision,'browser-1');
  await h.send({disconnect:true});
  assert.deepEqual(await (await h.send({clientId:'other-tab',snapshot:{...h.snapshot,revision:'other-1'}})).json(),{});
  assert.equal((await h.read('state.json')).revision,'other-1');
  const html=await fetch(h.server.origin+'/workbench/flowspec.html');assert.match(await html.text(),/flowview-local-agent/);
  assert.equal(html.headers.get('x-frame-options'),'DENY');assert.equal(html.headers.get('cache-control'),'no-store');
});
test('disconnect acknowledges an applied edit; late owner acknowledgements survive lease expiry without taking over another tab',async t=>{
  const h=await helper(t),proposal={id:'before-disconnect',baseRevision:'browser-1',source:'{}'};
  await h.propose(proposal);await h.send();
  let result={id:proposal.id,baseRevision:proposal.baseRevision,status:'applied',revision:'browser-2'};
  assert.deepEqual(await (await h.send({disconnect:true,result})).json(),{disconnected:true,acknowledged:proposal.id});
  assert.equal((await h.read('result.json')).status,'applied');
  assert.equal((await h.read('state.json')).connected,false);
  assert.deepEqual(await (await h.send({result})).json(),{acknowledged:proposal.id},'lost ack response is repeatable');
  proposal.id='before-sleep';await h.propose(proposal);await h.send();
  h.advanceTime(99);
  assert.deepEqual(await (await h.send({clientId:'other-tab',snapshot:{...h.snapshot,revision:'other-1'}})).json(),{occupied:true},
    'another tab cannot claim an unexpired lease');
  assert.equal((await h.read('state.json')).revision,'browser-1');
  h.advanceTime(1);
  const other=await (await h.send({clientId:'other-tab',snapshot:{...h.snapshot,revision:'other-1'}})).json();
  assert.equal(other.proposal,undefined);assert.match(other.fileError,/previous tab/);
  await h.send({clientId:'other-tab',snapshot:{...h.snapshot,revision:'other-1'},
    result:{id:proposal.id,baseRevision:proposal.baseRevision,status:'rejected',revision:'other-1'}});
  assert.equal((await h.read('result.json')).id,'before-disconnect','another tab cannot consume an unresolved delivery');
  result={...result,id:proposal.id};
  assert.deepEqual(await (await h.send({result})).json(),{occupied:true,acknowledged:proposal.id});
  assert.equal((await h.read('result.json')).status,'applied');assert.equal((await h.read('state.json')).revision,'other-1');
  assert.deepEqual(await (await h.send({clientId:'forged-owner',result:{...result,id:'not-delivered'}})).json(),{occupied:true});
  // This is the response CI observed when real I/O outlasted the replacement
  // owner's lease. It is permitted only after that second lease expires.
  h.advanceTime(100);
  assert.deepEqual(await (await h.send({result})).json(),{acknowledged:proposal.id});
  assert.equal((await h.read('state.json')).revision,'browser-1');
});
test('malformed, oversized and symlink proposals never reach the browser; existing scratch is not reused',async t=>{
  const h=await helper(t);
  await h.propose({id:'oops'});assert.match((await (await h.send()).json()).fileError,/Expected/);
  const file=path.join(h.server.scratch,'proposal.json');await fs.writeFile(file,'{');
  assert.ok((await (await h.send()).json()).fileError);
  await fs.unlink(file);await fs.symlink(path.join(h.server.scratch,'state.json'),file);
  assert.ok((await (await h.send()).json()).fileError);
  await fs.unlink(file);await h.propose({id:'huge',baseRevision:'browser-1',source:'x'.repeat(4*1024*1024+1)});
  assert.match((await (await h.send()).json()).fileError,/4 MiB/);
  const {startAgentSession}=await import('../tools/agent-session.mjs');
  await assert.rejects(startAgentSession({root:path.dirname(path.dirname(h.server.scratch)),scratch:h.server.scratch}),/EEXIST/);
});

async function exchangeHarness(){
  const context={};vm.createContext(context);vm.runInContext(await fs.readFile(path.join(root,'src/workbench/agent-session.js'),'utf8'),context);
  let source='{"title":"before"}',project=0,busy=false,open=true;const writes=[];
  const exchange=context.createWorkbenchAgentExchange({clientId:'client',snapshot:()=>({source,project,open,selection:[]}),busy:()=>busy,
    apply(text,expected){assert.equal(expected.source,source);source=text;writes.push(text);return {ok:true,rendered:true};}});
  return {exchange,writes,type(value){source=value;},replace(){project++;},setBusy(value){busy=value;},setOpen(value){open=value;}};
}
test('agent exchange rejects edits based on changed source or another project, including changes during a request',async()=>{
  const h=await exchangeHarness(),e=h.exchange,sent=e.request();
  const proposal={id:'one',baseRevision:sent.snapshot.revision,source:'{"title":"agent"}'};
  h.type('{ handwritten');e.receive({proposal},sent);
  assert.equal(e.request().result.status,'rejected');assert.equal(h.writes.length,0);
  const latest=e.request();h.replace();e.receive({proposal:{...proposal,id:'two',baseRevision:latest.snapshot.revision}},latest);
  assert.equal(e.request().result.status,'rejected');assert.equal(h.writes.length,0);
});
test('agent exchange waits for human gestures, applies once and preserves the result until acknowledged',async()=>{
  const h=await exchangeHarness(),e=h.exchange,sent=e.request();
  const proposal={id:'one',baseRevision:sent.snapshot.revision,source:'{"title":"agent"}'};
  h.setBusy(true);assert.match(e.receive({proposal},sent),/waiting/);assert.equal(e.request().result,null);
  h.setBusy(false);e.receive({proposal},sent);assert.equal(h.writes.length,1);
  const ack=e.request();assert.equal(ack.result.status,'applied');assert.notEqual(ack.result.revision,sent.snapshot.revision);
  assert.equal(e.request().result.id,'one','lost network response retains result');
  e.receive({acknowledged:'one'},ack);assert.equal(e.request().result,null);
  e.receive({proposal},e.request());assert.equal(h.writes.length,1,'old proposals cannot overwrite the new revision');
});
test('closed project and invalid proposal are refused, identical source adds no Undo entry',async()=>{
  const h=await exchangeHarness(),e=h.exchange,sent=e.request();
  const proposal={id:'same',baseRevision:sent.snapshot.revision,source:sent.snapshot.source};
  e.receive({proposal},sent);assert.equal(e.request().result.status,'unchanged');assert.equal(h.writes.length,0);
  h.setOpen(false);e.receive({proposal:{...proposal,id:'closed'}},e.request());assert.equal(e.request().result.status,'rejected');
});

test('retired operation and dry-run envelopes never apply, including envelopes carrying valid full source',async()=>{
  for(const extra of [{operations:[]},{operations:null},{operations:undefined},{dryRun:true},{dryRun:false},{dryRun:'true'},{dryRun:undefined}]){
    const h=await exchangeHarness(),e=h.exchange,sent=e.request();
    e.receive({proposal:{id:'legacy',baseRevision:sent.snapshot.revision,source:'{"title":"agent"}',...extra}},sent);
    assert.equal(e.request().result.status,'rejected');assert.match(e.request().result.message,/complete updated document/);
    assert.equal(h.writes.length,0);assert.equal(e.request().snapshot.source,sent.snapshot.source);assert.equal(e.request().snapshot.revision,sent.snapshot.revision);
    e.receive({acknowledged:'legacy'},e.request());
    e.receive({proposal:{id:'replacement',baseRevision:sent.snapshot.revision,source:'{"title":"agent"}'}},e.request());
    assert.equal(e.request().result.status,'applied');assert.equal(h.writes.length,1);
  }
});
