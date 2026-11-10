'use strict';
/* #1290 PR 2: carrier matching and node time. Spans declared on a node (`trace.spans`, PR 1)
   match a loaded trace by exact operation, operation prefix or attributes alone; a declared node
   is annotated with the union of its matched spans even when no step lights it (D16). Connection
   declarations are matched but not drawn until PR 3. Browser coverage:
   tools/browser-tests/tests/trace-carrier-spans.spec.mjs.
| row | rule |
|---|---|
| M1 | FlowTraceMatch.carrierSpans: exact operation, operationPrefix, attributes alone; namespace and attributes narrow every mode; other services never match; one span declared on two carriers shows on both. |
| M2 | An attribute a declaration needs that no span of its service records is reported as not recorded. |
| M3 | telemetryTraceModel: a declared node with no step gets one carrier row; its label is the union time ("… across N spans", overlaps counted once); its title lists each declaration by name and role with its time, or "not in this trace" / "attribute … not recorded". |
| M4 | A declared node with no span in the trace gets no row and no label (Chuck, 2026-11-10). |
| M5 | Connection declarations draw nothing in this PR: no edge row and no edge label. |
| M6 | A span that a step row and the carrier row share counts once in the node time. |
| M7 | Imported carriers: the resolved consumer's patch and hide change the node time and title; nested re-exports too. |
| M8 | Focus levels include carrier rows; existing step rows, labels and edge timing are unchanged. |
| M9 | A board whose only trace mapping is carrier declarations (local, imported, or an overlay alone) uses traces: company trace profiles apply and the Trace view does not say mapping is not configured. |
*/
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const loader=require('../tools/source-loader.cjs');
const V={URL,console,AbortController,TextEncoder,TextDecoder,setTimeout,clearTimeout,document:{hidden:false,addEventListener(){},removeEventListener(){}}};
vm.runInNewContext(loader.entrypoint('standalone').body,V);
const T={URL,TextEncoder};vm.createContext(T);vm.runInContext(loader.composeSources(['canon.js','validator.js']),T);
const plain=v=>JSON.parse(JSON.stringify(v));
const spec=(id,diagram,page={})=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},...page,sections:[{id:'main',diagram}]}});
const diagramOf=s=>s.page.sections[0].diagram;
// One request: the API publishes, the worker processes it with two finds inside and a redis call after.
const span=(id,parentId,service,name,startMs,ms,attributes={})=>({id,parentId,service,name,startMs,ms,error:false,attributes,links:[]});
const SPANS=()=>[
  span('req',null,'api','POST /orders',0,200),
  span('pub','req','api','publish orders',10,2),
  span('proc','pub','worker','process orders',100,40,{'service.namespace':'orders'}),
  span('f1','proc','worker','find orders',110,5,{'db.system':'mongodb'}),
  span('f2','proc','worker','find users',120,5,{'db.system':'mongodb'}),
  span('h1','proc','worker','hget',145,3,{'db.system':'redis'}),
  span('h2','proc','worker','hset',150,2,{'db.system':'redis'}),
  span('other','req','billing','process orders',160,10)];
const exemplar=(spans=SPANS())=>({traceId:'t1',spans,warnings:[]});
const WORKER=()=>({spans:{
  process:{serviceName:'worker',operation:'process orders',role:'process'},
  find:{serviceName:'worker',operationPrefix:'find ',role:'database'},
  cache:{serviceName:'worker',attributes:{'db.system':'redis'},role:'cache'}}});
function board(worker=WORKER(),extra={}){
  return {nodes:{api:{title:'API'},worker:{title:'Worker',trace:worker},billing:{title:'Billing'}},rows:[['api','worker','billing']],
    edges:[{from:'api',to:'worker',label:'Publish',trace:{spans:{send:{serviceName:'api',operation:'publish orders',role:'send'}}}}],
    steps:[{id:'publish',text:'Publish the order',edge:'api->worker'}],panels:[{id:'status',type:'live-status'}],...extra};
}
const model=(d,e=exemplar())=>V.telemetryTraceModel(d,undefined,e);
const label=rows=>{assert.ok(rows,'the node has trace rows (a label)');return plain(V.telemetryTraceLabel(rows));};

test('M1 M2 carrierSpans matches by exact operation, prefix or attributes alone',()=>{
  const trace={spans:SPANS().map(s=>({id:s.id,parentId:s.parentId,serviceName:s.service,operation:s.name,startMs:s.startMs,durationMs:s.ms,attributes:s.attributes,links:[]}))};
  const ids=r=>Object.fromEntries((r || []).map(x=>[x.key,x.spans.map(s=>s.id)]));
  // Without the matcher every carrier reads as having no declarations, so the assertions below fail on what they return.
  const carrierSpans=(d,t)=>(V.FlowTraceMatch.carrierSpans || (()=>({nodes:{},edges:{}})))(d,t);
  let out=carrierSpans(board(),trace);
  assert.deepEqual(plain(ids(out.nodes.worker)),{process:['proc'],find:['f1','f2'],cache:['h1','h2']},'the billing span of the same name is another service');
  assert.deepEqual(plain((out.nodes.worker || []).map(x=>x.role)),['process','database','cache']);
  assert.deepEqual(plain(ids(out.edges['api->worker'])),{send:['pub']},'connection declarations are matched (drawn in PR 3)');
  // namespace and attributes narrow each mode.
  const narrowed={spans:{process:{serviceName:'worker',operation:'process orders',namespace:'eu',role:'process'},
    find:{serviceName:'worker',operationPrefix:'find ',attributes:{'db.system':'postgres'},role:'database'},
    cache:{serviceName:'worker',attributes:{'db.system':'redis'},namespace:'orders',role:'cache'},
    mine:{serviceName:'worker',operation:'process orders',namespace:'orders',role:'process'}}};
  out=carrierSpans(board(narrowed),trace);
  assert.deepEqual(plain(ids(out.nodes.worker)),{process:[],find:[],cache:[],mine:['proc']});
  // One span declared on two carriers shows on both: declarations describe, they do not own.
  const d=board();d.nodes.billing.trace={spans:{process:{serviceName:'worker',operation:'process orders',role:'process'}}};
  out=carrierSpans(d,trace);
  assert.deepEqual(plain(ids(out.nodes.billing)),{process:['proc']});assert.deepEqual(plain(ids(out.nodes.worker)).process,['proc']);
  // An attribute no span of that service records is reported, not just missing.
  const unrecorded=board({spans:{cache:{serviceName:'worker',attributes:{'cache.region':'eu'},role:'cache'},find:{serviceName:'worker',operationPrefix:'find ',attributes:{'db.system':'mongodb'},role:'database'}}});
  out=carrierSpans(unrecorded,trace);
  assert.deepEqual(plain((out.nodes.worker || []).map(x=>[x.key,x.spans.length,x.notRecorded])),[['cache',0,['cache.region']],['find',2,[]]]);
  assert.deepEqual(plain(carrierSpans({nodes:{a:{title:'A'}},edges:[]},trace)),{nodes:{},edges:{}});
  assert.equal(typeof V.FlowTraceMatch.carrierSpans,'function','FlowTraceMatch.carrierSpans is the carrier matcher');
});

test('M3 M4 M5 a declared node gets the union time and a declaration title; nothing matched means no label; connections stay undrawn',()=>{
  const m=model(board());
  assert.equal(m.nodes.worker?.length,1,'one carrier row for the declared node');
  const row=m.nodes.worker[0];
  assert.equal(row.kind,'carrier');assert.deepEqual(plain(row.spanIds),['proc','f1','f2','h1','h2']);
  const text=label(m.nodes.worker);
  assert.equal(text.text,'45 ms across 5 spans','100-140 with the finds inside, then 145-148 and 150-152: overlaps counted once');
  assert.match(text.title,/^Declared spans: process 40 ms; find \(database\) 10 ms across 2 spans; cache 5 ms across 2 spans/);
  assert.match(text.title,/Time 45 ms across 5 spans: time covers each matched span from start to end \(overlaps counted once\)\./);
  assert.equal(m.rows.some(r=>r.kind==='carrier'),false,'carrier rows are not step rows');
  // A declaration with no span in this trace, and one whose attribute is not recorded, are named in the title only.
  const gaps=board({spans:{...WORKER().spans,audit:{serviceName:'worker',operation:'audit write',role:'database'},region:{serviceName:'worker',attributes:{'cache.region':'eu'},role:'cache'}}});
  const t=label(model(gaps).nodes.worker);
  assert.equal(t.text,'45 ms across 5 spans');
  assert.match(t.title,/audit \(database\): not in this trace; region \(cache\): attribute cache\.region not recorded/);
  // Nothing matched: no row, so no label.
  const absent=board({spans:{audit:{serviceName:'worker',operation:'audit write',role:'database'}}});
  assert.equal(model(absent).nodes.worker,undefined);
  // The declared connection gets no row and no label in this PR.
  assert.deepEqual(plain(model(board()).edges),{});
  const noStep=board();noStep.steps=[];assert.deepEqual(plain(model(noStep).edges),{});
  // An errored declared span gives the node the error tone.
  const failed=SPANS();failed[3].error=true;assert.equal(model(board(),exemplar(failed)).nodes.worker[0].tone,'error');
});

test('M6 M8 a span shared by a step row and the carrier row counts once; step rows and focus levels keep working',()=>{
  const d=board();d.steps.push({id:'process',text:'Process the order',nodes:['worker'],traceMatch:{serviceName:'worker',operation:'process orders',nodeId:'worker'}});
  const m=model(d),rows=m.nodes.worker;
  assert.deepEqual(plain(rows.map(r=>r.kind || 'step')),['step','carrier']);
  const text=label(rows);
  assert.equal(text.text,'45 ms across 5 spans','the process span is counted once, and the carrier row is not an operation');
  const two=board();two.steps.push({id:'process',text:'Process',nodes:['worker'],traceMatch:{serviceName:'worker',operation:'process orders',nodeId:'worker'}},{id:'find',text:'Find',nodes:['worker'],traceMatch:{serviceName:'worker',operation:'find orders',nodeId:'worker'}});
  assert.equal(label(model(two).nodes.worker).text,'2 operations · 45 ms across 5 spans','two step rows are two operations; the carrier row adds none');
  assert.equal(m.rows.length,2,'two step rows; the carrier row is not one');
  assert.equal(m.rows.find(r=>r.id==='process').label,'40 ms','the step row is unchanged');
  // Focus: the focused span's carrier row makes the node current; with nothing focused it is below.
  assert.equal(V.telemetryTraceLevels(model(board()),null).nodes.worker.level,'below');
  assert.equal(V.telemetryTraceLevels(model(board()),{spanId:'h1'}).nodes.worker.level,'current');
  assert.equal(V.telemetryTraceLevels(model(board()),{spanId:'req'}).nodes.worker.level,'below','a descendant span');
  // A board without declarations is unchanged.
  const plainBoard=board();delete plainBoard.nodes.worker.trace;delete plainBoard.edges[0].trace;
  plainBoard.steps=[{id:'process',text:'Process',nodes:['worker'],traceMatch:{serviceName:'worker',operation:'process orders',nodeId:'worker'}}];
  const before=model(plainBoard);
  assert.deepEqual(plain(Object.keys(before.nodes)),['worker']);assert.equal(before.nodes.worker.length,1);assert.equal(label(before.nodes.worker).text,'40 ms');
});

test('M7 imported carriers follow the consumer overlay, nested re-exports included',()=>{
  const provider=spec('provider',{nodes:{api:{title:'API'},worker:{title:'Worker',trace:WORKER()}},rows:[['api','worker']],
    edges:[{from:'api',to:'worker',label:'Publish',trace:{spans:{send:{serviceName:'api',operation:'publish orders',role:'send'}}}}],topologyExports:{core:{nodes:['api','worker'],edges:['api->worker']}}});
  const consumer=spec('consumer',{nodes:{},rows:[[]],panels:[{id:'status',type:'live-status'}],
    topologyImports:[{spec:'provider',export:'core',as:'shared',nodeTracking:{worker:{trace:{spans:{find:{operationPrefix:'find o'}},hide:['cache']}}}}]});
  let d=diagramOf(T.FlowTopology.resolveSource(consumer,{version:1,id:'consumer',specs:[provider,consumer]}));
  let t=label(model(plain(d)).nodes['shared::worker']);
  assert.equal(t.text,'40 ms across 2 spans','the patched prefix keeps one find; the hidden cache spans are gone');
  assert.match(t.title,/^Declared spans: process 40 ms; find \(database\) 5 ms/);
  assert.doesNotMatch(t.title,/cache/);
  assert.deepEqual(plain(model(plain(d)).edges),{},'the imported connection draws nothing yet');
  // Without the overlay the provider spans apply.
  delete diagramOf(consumer).topologyImports[0].nodeTracking;
  d=diagramOf(T.FlowTopology.resolveSource(consumer,{version:1,id:'consumer',specs:[provider,consumer]}));
  assert.equal(label(model(plain(d)).nodes['shared::worker']).text,'45 ms across 5 spans');
  // Nested: provider -> middle (re-export) -> outer, which hides find.
  const middle=spec('middle',{nodes:{},rows:[[]],topologyImports:[{spec:'provider',export:'core',as:'p'}],topologyExports:{all:{nodes:['p::api','p::worker'],edges:['p::api->p::worker']}}});
  const outer=spec('outer',{nodes:{},rows:[[]],panels:[{id:'status',type:'live-status'}],topologyImports:[{spec:'middle',export:'all',as:'m',nodeTracking:{'p::worker':{trace:{hide:['find']}}}}]});
  d=diagramOf(T.FlowTopology.resolveSource(outer,{version:1,id:'outer',specs:[provider,middle,outer]}));
  assert.equal(label(model(plain(d)).nodes['m::p::worker']).text,'45 ms across 3 spans','process contains the finds, so hiding them leaves the same time over fewer spans');
});

test('M9 a board whose only trace mapping is carrier declarations uses traces',()=>{
  const uses=page=>V.FlowTraceConnections.usesTraces(page);
  const page=d=>({tracking:{jira:{site:'https://jira.test'}},sections:[{id:'main',diagram:d}]});
  assert.equal(uses(page(board())),true,'a local node or connection declaration');
  const edgeOnly=board();delete edgeOnly.nodes.worker.trace;assert.equal(uses(page(edgeOnly)),true,'a connection declaration alone');
  const none=board();delete none.nodes.worker.trace;delete none.edges[0].trace;assert.equal(uses(page(none)),false,'no declaration, no traceMatch');
  // An authored consumer whose only mapping is a trace overlay (before resolution) and the resolved imported carrier.
  const overlay={nodes:{},rows:[[]],panels:[{id:'status',type:'live-status'}],topologyImports:[{spec:'provider',export:'core',as:'shared',nodeTracking:{worker:{trace:{hide:['cache']}}}}]};
  assert.equal(uses(page(overlay)),true);
  const resolved={nodes:{'shared::worker':{title:'Worker',trace:WORKER()}},rows:[['shared::worker']],panels:[{id:'status',type:'live-status'}]};
  assert.equal(uses(page(resolved)),true);
  // Company profiles are inherited by such a board (resolve only reads configuration; it calls no provider).
  const company={company:{...require('./fixtures/trace-connection-profile.json')}};
  assert.deepEqual(Object.keys(plain(V.FlowTraceConnections.resolve(page(board()),company))),['company']);
  assert.deepEqual(Object.keys(plain(V.FlowTraceConnections.resolve(page(none),company))),[]);
});
