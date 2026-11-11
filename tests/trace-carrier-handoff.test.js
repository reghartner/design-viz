'use strict';
/* #1290 PR 3: connection hand-off timing from declared spans. Design section 2.4 and Q1.
   A connection's time is the hand-off: receive start minus send start. Send spans are the
   connection's role:send declarations; the receiver is its own role:receive declarations, or
   else the receiving node's role:process declarations. The receiver's own work stays on its
   node. Browser coverage: tools/browser-tests/tests/trace-carrier-spans.spec.mjs.
| row | rule |
|---|---|
| H1 | Async publish: send 100-102, receiver (linked child) 109-149: the connection reads 9 ms and the worker node 40 ms. |
| H2 | Sync call: client 0-30, server child 5-25: 5 ms, the latency only. |
| H3 | A receiver whose parent is not in the trace (or a root receiver) pairs when it is the only such receiver starting at or after the send, and the title says which in plain words; two such receivers do not pair; clock skew is named. |
| H4 | Two hand-offs: "… across 2 hand-offs" (union of the hand-off intervals). |
| H5 | No receiver: "send only · 2 ms", and the title says no receiver was found and that the send span's own time is shown. |
| H6 | A connection's own receive declaration replaces the receiving node's process span. |
| H7 | A receiver descending from another send never pairs with this one. |
| H8 | A receive with no send: a label only when the connection itself declares receive (Chuck 2026-11-10 default a). |
| H9 | A step traceMatch row for a declared connection moves into the title with its time, budget and conditions, and the label keeps its worst tone; undeclared connections keep today's step rows. |
| H10 | A consumer connection into an imported node pairs with the provider's process declaration; an imported connection follows the consumer's send patch; nested re-exports too. |
| H11 | Focus levels and outlines include connection rows; a board with declarations only on connections draws connection labels. |
| H12 | A pass-through queue node: each connection is timed on its own (default b). |
*/
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const loader=require('../tools/source-loader.cjs');
const V={URL,console,AbortController,TextEncoder,TextDecoder,setTimeout,clearTimeout,document:{hidden:false,addEventListener(){},removeEventListener(){}}};
vm.runInNewContext(loader.entrypoint('standalone').body,V);
const T={URL,TextEncoder};vm.createContext(T);vm.runInContext(loader.composeSources(['canon.js','validator.js']),T);
const plain=v=>JSON.parse(JSON.stringify(v));
const spec=(id,diagram,page={})=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},...page,sections:[{id:'main',diagram}]}});
const diagramOf=s=>s.page.sections[0].diagram;
const span=(id,parentId,service,name,startMs,ms,extra={})=>({id,parentId,service,name,startMs,ms,error:false,attributes:{},links:[],...extra});
const exemplar=spans=>({traceId:'t1',spans,warnings:[]});
const SEND={spans:{send:{serviceName:'api',operation:'publish orders',role:'send'}}};
const PROCESS={spans:{process:{serviceName:'worker',operation:'process orders',role:'process'}}};
function board({send=SEND,worker=PROCESS,steps=[]}={}){
  const edge={from:'api',to:'worker',label:'Publish'};if(send)edge.trace=send;
  const nodes={api:{title:'API'},worker:{title:'Worker'}};if(worker)nodes.worker.trace=worker;
  return {nodes,rows:[['api','worker']],edges:[edge],steps,panels:[{id:'status',type:'live-status'}]};
}
// The design 2.4 example: publish at 100 for 2 ms; the worker picks it up through a link at 109 for 40 ms.
const ASYNC=()=>[span('req',null,'api','POST /orders',0,200),span('pub','req','api','publish orders',100,2),span('proc',null,'worker','process orders',109,40,{links:[{traceId:'t1',spanId:'pub'}]})];
const model=(d,spans)=>V.telemetryTraceModel(d,undefined,exemplar(spans));
// The connection's label: text and title, as painted.
function edgeLabel(m,key){const rows=m.edges[key];assert.ok(rows,'connection '+key+' has a trace label');return plain(V.telemetryTraceLabel(rows));}

test('H1 H2 the connection reads the hand-off; the receiver\'s own work stays on its node',()=>{
  let m=model(board(),ASYNC());
  const a=edgeLabel(m,'api->worker');
  assert.equal(a.text,'9 ms','2 ms send plus 7 ms wait');
  assert.match(a.title,/^Hand-off 9 ms: from the start of the send span \(api publish orders\) to the start of the receiving span \(worker process orders\)\./);
  assert.equal(plain(V.telemetryTraceLabel(m.nodes.worker)).text,'40 ms','the worker node keeps its 40 ms');
  assert.deepEqual(plain(m.edges['api->worker'][0].spanIds),['pub','proc']);
  assert.equal(m.edges['api->worker'][0].edgeIndex,0);
  // Sync: the server span starts inside the client span.
  const sync=board({send:{spans:{send:{serviceName:'api',operation:'GET /stock',role:'send'}}},worker:{spans:{process:{serviceName:'worker',operation:'GET /stock',role:'process'}}}});
  m=model(sync,[span('client',null,'api','GET /stock',0,30),span('server','client','worker','GET /stock',5,20)]);
  assert.equal(edgeLabel(m,'api->worker').text,'5 ms','the hand-off latency, not the server\'s 20 ms');
});

test('H3 H5 H7 a receiver without its parent pairs only when it is the only candidate; no receiver means send only',()=>{
  // The receiving span's parent is not in this trace (a lost context), and it starts after the send.
  const orphan=[span('pub',null,'api','publish orders',100,2),span('proc','missing-parent','worker','process orders',109,40)];
  let t=edgeLabel(model(board(),orphan),'api->worker');
  assert.equal(t.text,'9 ms');
  assert.match(t.title,/The receiving span's parent is not in this trace; it was paired as the only receiving span that started after the send\./);
  // A receiver with no parent at all starts its own trace tree; the title says that instead.
  t=edgeLabel(model(board(),[span('pub',null,'api','publish orders',100,2),span('proc',null,'worker','process orders',109,40)]),'api->worker');
  assert.equal(t.text,'9 ms');
  assert.match(t.title,/The receiving span has no parent span \(it starts its own trace tree\); it was paired as the only receiving span that started after the send\./);
  assert.doesNotMatch(t.title,/parent is not in this trace/);
  // Clock skew: a receiver that descends from the send but starts before it.
  t=edgeLabel(model(board(),[span('pub',null,'api','publish orders',100,2),span('proc','pub','worker','process orders',98,40)]),'api->worker');
  assert.equal(t.text,'0 ms');
  assert.match(t.title,/The receiving span starts before its send span, so the services' clocks disagree; that hand-off counts as 0 ms\./);
  // Two such receivers: nothing tells which one, so no pair.
  const two=orphan.concat([span('proc2','other-missing','worker','process orders',120,10)]);
  t=edgeLabel(model(board(),two),'api->worker');
  assert.equal(t.text,'send only · 2 ms');
  assert.match(t.title,/^No receiver found in this trace; showing the send span's own time \(2 ms\)\./);
  // An orphan that started before the send is not its receiver.
  t=edgeLabel(model(board(),[span('pub',null,'api','publish orders',100,2),span('proc','missing-parent','worker','process orders',90,40)]),'api->worker');
  assert.equal(t.text,'send only · 2 ms');
  // A receiver that descends from another send is never paired with this one.
  const other=[span('pub',null,'api','publish orders',100,2),span('pub2',null,'api','publish audit',101,1),span('proc','pub2','worker','process orders',109,40)];
  t=edgeLabel(model(board(),other),'api->worker');
  assert.equal(t.text,'send only · 2 ms','its ancestry is known and leads elsewhere');
  // No receiver declared or present at all.
  t=edgeLabel(model(board({worker:null}),ASYNC()),'api->worker');
  assert.equal(t.text,'send only · 2 ms');
});

test('H4 H6 H8 several hand-offs; a declared receive; a receive with no send',()=>{
  const twice=[span('pub1',null,'api','publish orders',100,2),span('proc1','pub1','worker','process orders',105,10),
    span('pub2',null,'api','publish orders',200,2),span('proc2','pub2','worker','process orders',203,10)];
  let t=edgeLabel(model(board(),twice),'api->worker');
  assert.equal(t.text,'8 ms across 2 hand-offs','5 ms and 3 ms');
  assert.match(t.title,/^Hand-offs 8 ms across 2 hand-offs: each from the start of a send span \(api publish orders\) to the start of its receiving span \(worker process orders\)\./);
  // The connection declares its own receive: the hand-off ends at that span, not at process.
  const own={spans:{send:SEND.spans.send,receive:{serviceName:'worker',operation:'orders receive',role:'receive'}}};
  const spans=ASYNC().concat([span('recv',null,'worker','orders receive',104,1,{links:[{traceId:'t1',spanId:'pub'}]})]);
  t=edgeLabel(model(board({send:own}),spans),'api->worker');
  assert.equal(t.text,'4 ms');assert.match(t.title,/receiving span \(worker orders receive\)/);
  // Receive seen, send not in trace: labelled only when the connection declares receive itself.
  const noSend=[span('recv',null,'worker','orders receive',104,1),span('proc','recv','worker','process orders',109,40)];
  t=edgeLabel(model(board({send:own}),noSend),'api->worker');
  assert.equal(t.text,'receive seen · send not in trace');
  assert.match(t.title,/^The receiving span \(worker orders receive\) is in this trace but no send span is, so there is no hand-off time\./);
  assert.equal(model(board(),[span('proc',null,'worker','process orders',109,40)]).edges['api->worker'],undefined,'a receiver inferred from the node\'s process span alone draws nothing');
});

test('H9 a step row on a declared connection moves into the title; undeclared connections keep today\'s rows',()=>{
  const steps=[{id:'publish',text:'Publish',edge:'api->worker',traceMatch:{serviceName:'worker',operation:'process orders',nodeId:'worker'}}];
  let m=model(board({steps}),ASYNC());
  assert.equal(m.edges['api->worker'].length,1,'one label on the connection');
  const t=edgeLabel(m,'api->worker');
  assert.equal(t.text,'9 ms');
  assert.match(t.title,/ Step publish, process orders: 40 ms\./,'the old number stays readable');
  assert.equal(m.rows.find(r=>r.id==='publish').label,'40 ms','the step row itself is unchanged in the Status list');
  // Without declarations the connection keeps today's receiving-span time.
  m=model(board({send:null,worker:null,steps}),ASYNC());
  assert.equal(edgeLabel(m,'api->worker').text,'40 ms');
  // A declared send never hides a step's warning or error: the label keeps the worst tone and
  // the title keeps the step's conditions and budget.
  const busy=[span('pub',null,'api','publish orders',100,2),
    span('proc',null,'worker','process orders',110,100,{links:[{traceId:'t1',spanId:'pub'}],attributes:{'messaging.queue.depth':40,'flow.delivery_failed':true}})];
  const queued=[{id:'pub',text:'Publish',edge:'api->worker',traceMatch:{serviceName:'worker',operation:'process orders',maxQueueDepth:10}}];
  const before=model(board({send:null,worker:null,steps:queued}),busy).edges['api->worker'][0];
  assert.equal(before.tone,'error','undeclared: the step row is an error');
  m=model(board({steps:queued}),busy);
  assert.equal(m.edges['api->worker'][0].tone,'error','declared: still an error');
  const declared=edgeLabel(m,'api->worker');assert.equal(declared.text,'10 ms');
  assert.match(declared.title,/Step pub, process orders: 100 ms; Delivery failed \(explicit telemetry\); Queue buildup · 40 messages\./);
  const budget=[{id:'work',text:'Work',edge:'api->worker',traceMatch:{serviceName:'worker',operation:'process orders',nodeId:'worker',maxDurationMs:50}}];
  const slow=[span('pub',null,'api','publish orders',100,2),span('proc',null,'worker','process orders',110,100,{links:[{traceId:'t1',spanId:'pub'}]})];
  m=model(board({steps:budget}),slow);
  assert.equal(m.edges['api->worker'][0].tone,'warning','a slow step keeps the connection amber');
  assert.match(edgeLabel(m,'api->worker').title,/Step work, process orders: 100 ms \/ 50 ms budget; Slow operation · 100 ms \/ 50 ms budget\./);
});

test('H10 imported connections and receivers follow the resolved consumer',()=>{
  const provider=spec('provider',{nodes:{api:{title:'API'},worker:{title:'Worker',trace:PROCESS}},rows:[['api','worker']],
    edges:[{from:'api',to:'worker',label:'Publish',trace:SEND}],topologyExports:{core:{nodes:['api','worker'],edges:['api->worker']}}});
  // A consumer connection into the imported worker, and the imported connection with a consumer send patch.
  const consumer=spec('consumer',{nodes:{shop:{title:'Shop'}},rows:[['shop']],panels:[{id:'status',type:'live-status'}],
    edges:[{from:'shop',to:'shared::worker',label:'Order',trace:{spans:{send:{serviceName:'shop',operation:'publish orders',role:'send'}}}}],
    topologyImports:[{spec:'provider',export:'core',as:'shared',edgeTracking:{'api->worker':{trace:{spans:{send:{operation:'publish orders v2'}}}}}}]});
  const d=plain(diagramOf(T.FlowTopology.resolveSource(consumer,{version:1,id:'consumer',specs:[provider,consumer]})));
  const spans=[span('shopPub',null,'shop','publish orders',10,1),span('proc','shopPub','worker','process orders',13,20),
    span('pubOld',null,'api','publish orders',50,1),span('pubNew',null,'api','publish orders v2',60,1),span('proc2','pubNew','worker','process orders',66,5)];
  const m=model(d,spans);
  assert.equal(edgeLabel(m,'shop->shared::worker').text,'3 ms','a consumer connection pairs with the provider\'s process declaration');
  assert.equal(edgeLabel(m,'shared::api->shared::worker').text,'6 ms','the patched send (v2) pairs; the old operation is not this connection\'s send');
  // Nested: provider -> middle (re-export) -> outer, which hides the send.
  const middle=spec('middle',{nodes:{},rows:[[]],topologyImports:[{spec:'provider',export:'core',as:'p'}],topologyExports:{all:{nodes:['p::api','p::worker'],edges:['p::api->p::worker']}}});
  const outer=spec('outer',{nodes:{},rows:[[]],panels:[{id:'status',type:'live-status'}],topologyImports:[{spec:'middle',export:'all',as:'m'}]});
  let nested=plain(diagramOf(T.FlowTopology.resolveSource(outer,{version:1,id:'outer',specs:[provider,middle,outer]})));
  assert.equal(edgeLabel(model(nested,ASYNC()),'m::p::api->m::p::worker').text,'9 ms');
  diagramOf(outer).topologyImports[0].edgeTracking={'p::api->p::worker':{trace:{hide:['send']}}};
  nested=plain(diagramOf(T.FlowTopology.resolveSource(outer,{version:1,id:'outer',specs:[provider,middle,outer]})));
  assert.equal(model(nested,ASYNC()).edges['m::p::api->m::p::worker'],undefined,'a hidden send leaves the connection undrawn');
});

test('H11 H12 focus levels include connection rows; connections-only boards draw; queue nodes time each connection',()=>{
  const m=model(board(),ASYNC());
  assert.equal(V.telemetryTraceLevels(m,null).edges[0]?.level,'below');
  assert.equal(V.telemetryTraceLevels(m,{spanId:'pub'}).edges[0]?.level,'current');
  // Declarations only on the connection and its receiving node's process: the connection is drawn.
  const only=board({worker:PROCESS});assert.ok(model(only,ASYNC()).edges['api->worker']);
  // api -> topic -> worker: the topic declares nothing; each connection is on its own.
  const queue={nodes:{api:{title:'API'},topic:{title:'Orders topic'},worker:{title:'Worker',trace:PROCESS}},rows:[['api','topic','worker']],
    edges:[{from:'api',to:'topic',trace:SEND},{from:'topic',to:'worker',trace:{spans:{receive:{serviceName:'worker',operation:'orders receive',role:'receive'}}}}],steps:[]};
  const spans=ASYNC().concat([span('recv','pub','worker','orders receive',104,1)]);
  const q=model(queue,spans);
  assert.equal(edgeLabel(q,'api->topic').text,'send only · 2 ms','the topic has no receiver of its own');
  assert.equal(edgeLabel(q,'topic->worker').text,'receive seen · send not in trace','no pairing across the pass-through node');
});
