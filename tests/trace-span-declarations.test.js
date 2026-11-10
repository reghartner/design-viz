'use strict';
/* #1290 PR 1: trace span declarations on nodes and connections (`trace.spans`), carried by
   topology imports and patched per span by the consumer's nodeTracking / edgeTracking overlay.
   Design: section 2.1-2.2 data model, section 3 import and overlay.
| row | rule |
|---|---|
| S1 | canon validate: a declaration needs serviceName, exactly one of operation / operationPrefix (2+ characters), or attributes alone; role from the node list or the connection list; supported attributes; no unknown fields; span names are tokens; `trace` is {spans:{…}}. Errors name the carrier and span. Valid local declarations, and attributes a trace connection profile lists, give no error. |
| S2 | An import carries `trace` on the imported node and connection under the `as::` id unchanged, nested re-exports included. |
| S3 | The overlay patches one field of one span (other fields and later provider changes keep flowing), adds a span, hides one by `hide` or by a null entry; a hide of a span the provider lacks is accepted and does nothing; operation and operationPrefix replace each other; hiding every span removes `trace`. |
| S4 | Overlay shape: `trace` is allowed in nodeTracking / edgeTracking; malformed hide, entries, fields and values fail; keys must be selected or exported. |
| S5 | A provider declaration the consumer's validation rejects is dropped for the consumer with a warning naming the provider path; its other spans stay; a consumer patch that fixes it keeps it; a malformed provider `trace` is dropped whole; nested drops follow the re-export. The provider's own validation reports the error. A consumer patch that breaks a valid provider span is not dropped: the consumer's validation reports it. |
| S6 | Compatibility declares flow.trace-spans for carrier and overlay declarations only. |
| S7 | A resolved snapshot may edit `trace` on an imported carrier; the imported structure stays read only. |
| S8 | The example pair examples/canon/topology/orders-platform.json + orders-board.json resolves to the documented spans. |
*/
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const loader=require('../tools/source-loader.cjs');
const C={URL,TextEncoder};vm.createContext(C);
vm.runInContext(loader.composeSources(['canon.js','validator.js','compatibility.js']),C);
const plain=v=>JSON.parse(JSON.stringify(v));
const spec=(id,diagram,page={})=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},...page,sections:[{id:'main',diagram}]}});
const diagramOf=s=>s.page.sections[0].diagram;
const WORKER=()=>({spans:{
  process:{serviceName:'worker',operation:'process orders',role:'process'},
  find:{serviceName:'worker',operationPrefix:'find ',role:'database'},
  cache:{serviceName:'worker',attributes:{'db.system':'redis'},role:'cache'}}});
const SEND=()=>({spans:{send:{serviceName:'api',operation:'publish orders',role:'send'}}});
function providerSpec(worker=WORKER(),send=SEND(),id='provider'){
  return spec(id,{nodes:{api:{title:'API'},worker:{title:'Worker',trace:worker}},rows:[['api','worker']],
    edges:[{from:'api',to:'worker',label:'Publish',trace:send}],topologyExports:{core:{nodes:['api','worker'],edges:['api->worker']}}});
}
function fixtures(nodeTrace,edgeTrace,provider=providerSpec()){
  const imp={spec:'provider',export:'core',as:'shared'};
  if(nodeTrace!==undefined)imp.nodeTracking={worker:{trace:nodeTrace}};
  if(edgeTrace!==undefined)imp.edgeTracking={'api->worker':{trace:edgeTrace}};
  const consumer=spec('consumer',{nodes:{local:{title:'Local'}},rows:[['local']],edges:[],topologyImports:[imp]});
  return {provider,consumer,context:{version:1,id:'consumer',specs:[provider,consumer]}};
}
const resolved=f=>C.FlowTopology.resolveSource(f.consumer,f.context);
const nodeTrace=f=>plain(diagramOf(resolved(f)).nodes['shared::worker'].trace);
const edgeTrace=f=>plain(diagramOf(resolved(f)).edges.find(e=>e.from==='shared::api' && e.to==='shared::worker').trace);
const canonErrors=raw=>plain(C.FlowCanon.validate(raw)).filter(e=>/\.trace/.test(e));
const warnings=raw=>plain(C.validate(C.normalize(raw)).warnings).filter(w=>/\.trace/.test(w));
const errors=raw=>plain(C.validate(C.normalize(raw)).errors).filter(e=>/\.trace/.test(e));

test('S1 canon validate checks each declaration on nodes and connections',()=>{
  assert.deepEqual(canonErrors(providerSpec()),[],'valid node and connection declarations');
  const bad=(worker,send)=>canonErrors(providerSpec(worker,send||SEND()));
  const node=span=>bad({spans:{x:span}});
  assert.deepEqual(node({operation:'a',role:'process'}),['nodes.worker.trace.spans.x: serviceName required']);
  assert.deepEqual(node({serviceName:'w',operation:'a',operationPrefix:'ab',role:'process'}),['nodes.worker.trace.spans.x: operation and operationPrefix cannot be combined']);
  assert.deepEqual(node({serviceName:'w',operationPrefix:'f ',role:'database'}),['nodes.worker.trace.spans.x: operationPrefix must be at least two characters'],'the prefix is measured without surrounding spaces');
  assert.deepEqual(node({serviceName:'w',role:'process'}),['nodes.worker.trace.spans.x: needs operation, operationPrefix or attributes']);
  assert.deepEqual(node({serviceName:'w',attributes:{},role:'process'}),['nodes.worker.trace.spans.x: needs operation, operationPrefix or attributes']);
  assert.deepEqual(node({serviceName:'w',operation:' ',role:'process'}),['nodes.worker.trace.spans.x: operation must be a nonempty string']);
  assert.deepEqual(node({serviceName:'w',operation:'a',namespace:'',role:'process'}),['nodes.worker.trace.spans.x: namespace must be a nonempty string']);
  assert.deepEqual(node({serviceName:'w',operation:'a',role:'send'}),['nodes.worker.trace.spans.x: role must be one of process, database, cache, call, work']);
  assert.deepEqual(node({serviceName:'w',operation:'a'}),['nodes.worker.trace.spans.x: role must be one of process, database, cache, call, work'],'role is required');
  assert.deepEqual(node({serviceName:'w',operation:'a',role:'process',maxDurationMs:5}),['nodes.worker.trace.spans.x: unknown field maxDurationMs'],'budgets belong to steps');
  assert.deepEqual(node({serviceName:'w',attributes:{'not.listed':'x'},role:'cache'}),['nodes.worker.trace.spans.x: attributes: use supported operational attributes only']);
  assert.deepEqual(node({serviceName:'w',attributes:{'db.system':{}},role:'cache'}),['nodes.worker.trace.spans.x: attributes: use supported operational attributes only']);
  assert.deepEqual(node('process'),['nodes.worker.trace.spans.x: expected a span declaration object']);
  assert.deepEqual(bad({spans:{'1st':{serviceName:'w',operation:'a',role:'process'}}}),['nodes.worker.trace.spans.1st: span names start with a letter and use letters, digits, - and _']);
  for(const trace of [[],{spans:[]},{spans:{},extra:1},'x'])assert.deepEqual(bad(trace),['nodes.worker.trace: expected {"spans": {<name>: <span declaration>}}'],JSON.stringify(trace));
  assert.deepEqual(bad(WORKER(),{spans:{send:{serviceName:'api',operation:'publish',role:'process'}}}),['edges.api->worker.trace.spans.send: role must be one of send, receive']);
  assert.deepEqual(bad(WORKER(),{spans:{receive:{serviceName:'worker',operation:'process orders',role:'receive'}}}),[],'a connection may declare its receive side');
  // Attributes a trace connection profile lists are accepted, as for step traceMatch.
  const listed=providerSpec({spans:{x:{serviceName:'w',attributes:{'tenant.id':'t1'},role:'process'}}});
  listed.page.tracking={telemetry:{traceConnections:{company:{...require('./fixtures/trace-connection-profile.json'),dataset:'events',allowedAttributes:['tenant.id']}}}};
  assert.deepEqual(canonErrors(listed),[]);
  // The document validator reports the same errors (it includes FlowCanon.validate).
  assert.deepEqual(errors(providerSpec({spans:{x:{serviceName:'w',role:'process'}}})),['nodes.worker.trace.spans.x: needs operation, operationPrefix or attributes']);
  assert.equal(typeof C.FlowCanon.traceDeclarationErrors,'function','FlowCanon.traceDeclarationErrors is the shared declaration check');
});

test('S2 S8 imports carry trace on nodes and connections under the namespace, nested re-exports included',()=>{
  const f=fixtures();
  assert.deepEqual(nodeTrace(f),WORKER());assert.deepEqual(edgeTrace(f),SEND());
  assert.deepEqual(warnings(resolved(f)),[]);assert.deepEqual(errors(resolved(f)),[]);
  // Nested: provider -> middle (re-exports with a patch) -> consumer (another patch).
  const provider=providerSpec();
  const middle=spec('middle',{nodes:{gate:{title:'Gate'}},rows:[['gate']],
    topologyImports:[{spec:'provider',export:'core',as:'p',nodeTracking:{worker:{trace:{spans:{process:{namespace:'eu'}},hide:['cache']}}}}],
    topologyExports:{all:{nodes:['gate','p::api','p::worker'],edges:['p::api->p::worker']}}});
  const consumer=spec('consumer',{nodes:{},rows:[[]],topologyImports:[{spec:'middle',export:'all',as:'m',
    nodeTracking:{'p::worker':{trace:{spans:{find:{operationPrefix:'aggregate '}}}}},edgeTracking:{'p::api->p::worker':{trace:{spans:{send:{operation:'publish orders v2'}}}}}}]});
  const out=diagramOf(C.FlowTopology.resolveSource(consumer,{version:1,id:'consumer',specs:[provider,middle,consumer]}));
  assert.deepEqual(plain(out.nodes['m::p::worker'].trace),{spans:{process:{serviceName:'worker',operation:'process orders',role:'process',namespace:'eu'},find:{serviceName:'worker',operationPrefix:'aggregate ',role:'database'}}});
  assert.deepEqual(plain(out.edges.find(e=>e.from==='m::p::api').trace),{spans:{send:{serviceName:'api',operation:'publish orders v2',role:'send'}}});
  // The example pair in examples/canon/topology.
  const read=id=>JSON.parse(fs.readFileSync(path.join(__dirname,'../examples/canon/topology/'+id+'.json'),'utf8'));
  const board=read('orders-board'),platform=read('orders-platform');
  const d=diagramOf(C.FlowTopology.resolveSource(board,{version:1,id:'orders-board',specs:[platform,board]}));
  assert.deepEqual(plain(d.nodes['orders::worker'].trace),{spans:{
    process:{serviceName:'order-worker',operation:'process orders v2',role:'process'},
    find:{serviceName:'order-worker',operationPrefix:'find ',role:'database'},
    audit:{serviceName:'order-worker',operation:'audit write',role:'database'}}},'one span changed, one added, one hidden');
  assert.deepEqual(plain(d.edges.find(e=>e.from==='orders::api').trace),{spans:{send:{serviceName:'order-api',operation:'publish orders',role:'send',namespace:'eu'}}});
  assert.deepEqual(plain(d.nodes['orders::api'].trace),plain(diagramOf(platform).nodes.api.trace),'a carrier without an overlay keeps the provider spans');
  assert.deepEqual(plain(d.nodes.shop.trace.spans.process),{serviceName:'shop-web',operation:'GET /checkout',role:'process'},'local declarations are untouched');
  const page=C.FlowTopology.resolveSource(board,{version:1,id:'orders-board',specs:[platform,board]});
  assert.deepEqual(errors(page),[]);assert.deepEqual(warnings(page),[]);assert.deepEqual(canonErrors(platform),[]);
});

test('S3 the overlay patches, adds and hides one span; other spans and provider changes keep flowing',()=>{
  let f=fixtures({spans:{process:{operation:'process orders v2'}}});
  assert.deepEqual(nodeTrace(f).spans.process,{serviceName:'worker',operation:'process orders v2',role:'process'},'one field patched');
  assert.deepEqual(nodeTrace(f).spans.find,WORKER().spans.find);assert.deepEqual(nodeTrace(f).spans.cache,WORKER().spans.cache);
  // A later provider change to a field the consumer did not patch reaches the consumer.
  const changed=WORKER();changed.spans.process.namespace='orders';changed.spans.find.operationPrefix='aggregate ';
  f=fixtures({spans:{process:{operation:'process orders v2'}}},undefined,providerSpec(changed));
  assert.deepEqual(nodeTrace(f).spans.process,{serviceName:'worker',operation:'process orders v2',role:'process',namespace:'orders'});
  assert.equal(nodeTrace(f).spans.find.operationPrefix,'aggregate ');
  // Add, hide by list, hide by null; a hide of an absent span does nothing.
  f=fixtures({spans:{audit:{serviceName:'worker',operation:'audit write',role:'database'},find:null},hide:['cache','gone']});
  assert.deepEqual(Object.keys(nodeTrace(f).spans),['process','audit']);
  assert.deepEqual(nodeTrace(f).spans.audit,{serviceName:'worker',operation:'audit write',role:'database'});
  assert.deepEqual(errors(resolved(f)),[]);
  // A null field deletes that field only.
  f=fixtures({spans:{cache:{attributes:{'db.system':'redis'},operation:'hget',namespace:null}}});
  assert.deepEqual(nodeTrace(f).spans.cache,{serviceName:'worker',attributes:{'db.system':'redis'},role:'cache',operation:'hget'});
  // operation and operationPrefix replace each other, so a span never has both.
  f=fixtures({spans:{process:{operationPrefix:'process '},find:{operation:'find orders'}}});
  assert.deepEqual(nodeTrace(f).spans.process,{serviceName:'worker',role:'process',operationPrefix:'process '});
  assert.deepEqual(nodeTrace(f).spans.find,{serviceName:'worker',role:'database',operation:'find orders'});
  assert.deepEqual(errors(resolved(f)),[]);
  // Switching to attributes alone: null the operation and set attributes.
  f=fixtures(undefined,{spans:{send:{operation:null,attributes:{'messaging.queue.depth':0}}}});
  assert.deepEqual(edgeTrace(f),{spans:{send:{serviceName:'api',role:'send',attributes:{'messaging.queue.depth':0}}}});
  // Connections: patch, add a receive side.
  f=fixtures(undefined,{spans:{send:{namespace:'eu'},receive:{serviceName:'worker',operation:'consume orders',role:'receive'}}});
  assert.deepEqual(edgeTrace(f),{spans:{send:{serviceName:'api',operation:'publish orders',role:'send',namespace:'eu'},receive:{serviceName:'worker',operation:'consume orders',role:'receive'}}});
  // Hiding every span removes trace; a consumer may declare spans on a carrier the provider left bare.
  f=fixtures({hide:['process','find','cache']},{spans:{send:null}});
  assert.equal(Object.hasOwn(diagramOf(resolved(f)).nodes['shared::worker'],'trace'),false);
  assert.equal(Object.hasOwn(diagramOf(resolved(f)).edges.find(e=>e.from==='shared::api'),'trace'),false);
  const bare=fixtures();bare.consumer.page.sections[0].diagram.topologyImports[0].nodeTracking={api:{trace:{spans:{process:{serviceName:'api',operation:'POST /orders',role:'process'}}}}};
  assert.deepEqual(plain(diagramOf(resolved(bare)).nodes['shared::api'].trace),{spans:{process:{serviceName:'api',operation:'POST /orders',role:'process'}}});
  // Overlay tickets and telemetry still merge beside trace.
  const mixed=fixtures();mixed.consumer.page.sections[0].diagram.topologyImports[0].nodeTracking={worker:{tickets:['ORD-1'],trace:{hide:['cache']}}};
  const worker=plain(diagramOf(resolved(mixed)).nodes['shared::worker']);
  assert.deepEqual(worker.tickets,['ORD-1']);assert.deepEqual(Object.keys(worker.trace.spans),['process','find']);
  // The provider document is not changed.
  assert.deepEqual(plain(diagramOf(f.provider).nodes.worker.trace),WORKER());
  // mergeTrace is the rule set on the shared overlay engine.
  assert.deepEqual(plain(C.FlowTopology.mergeTrace(WORKER(),{spans:{find:{operation:'find x'}},hide:['cache']})),{spans:{process:WORKER().spans.process,find:{serviceName:'worker',role:'database',operation:'find x'}}});
});

test('S4 overlay shape and selection are checked',()=>{
  const fails=(nodeOverlay,pattern)=>assert.throws(()=>resolved(fixtures(nodeOverlay)),pattern,JSON.stringify(nodeOverlay));
  fails({spans:{process:{operation:'x'}},extra:true},/nodeTracking worker trace: expected an object with fields spans, hide/);
  fails({hide:'cache'},/hide must be an array of span names/);
  fails({hide:[1]},/hide must be an array of span names/);
  fails({spans:[]},/spans must be an object keyed by span name/);
  fails({spans:{process:'x'}},/trace span process: must be a field patch object or null/);
  fails({spans:{process:{maxDurationMs:5}}},/trace span process: expected an object with fields serviceName, operation, operationPrefix, namespace, attributes, role/);
  fails({spans:{process:{operation:5}}},/operation must be a string or null/);
  fails({spans:{process:{attributes:'x'}}},/attributes must be an object or null/);
  assert.equal(C.FlowTopology.validateTracking({trace:{spans:{a:null},hide:['b']}},'x'),undefined,'a valid trace overlay passes validateTracking');
  // Keys must name selected or exported carriers.
  const f=fixtures();f.consumer.page.sections[0].diagram.topologyImports[0].nodes=['api'];f.consumer.page.sections[0].diagram.topologyImports[0].edges=[];
  f.consumer.page.sections[0].diagram.topologyImports[0].nodeTracking={worker:{trace:{hide:['cache']}}};
  assert.throws(()=>resolved(f),/nodeTracking identity is not selected\/exported: worker/);
});

test('S5 an invalid provider declaration is dropped for the consumer with a provider-path warning',()=>{
  const broken=WORKER();broken.spans.find.operation='find orders';// operation and operationPrefix together
  const provider=providerSpec(broken,{spans:{send:{serviceName:'api',operation:'publish',role:'process'}}});
  assert.deepEqual(canonErrors(provider),['nodes.worker.trace.spans.find: operation and operationPrefix cannot be combined','edges.api->worker.trace.spans.send: role must be one of send, receive'],'the provider\'s own validation reports it');
  let f=fixtures(undefined,undefined,provider),page=resolved(f),d=diagramOf(page);
  assert.deepEqual(Object.keys(plain(d.nodes['shared::worker'].trace.spans)),['process','cache'],'only the invalid span is dropped');
  assert.equal(Object.hasOwn(d.edges.find(e=>e.from==='shared::api'),'trace'),false,'a connection left with no span has no trace');
  assert.deepEqual(errors(page),[],'the consumer does not fail on the provider\'s declaration');
  assert.deepEqual(warnings(page),[
    'sections[0].diagram.nodes.shared::worker.trace.spans.find: provider "provider" sections[0].diagram.nodes.worker.trace.spans.find: operation and operationPrefix cannot be combined; not used on this board',
    'sections[0].diagram.edges[0].trace.spans.send: provider "provider" sections[0].diagram.edges[0].trace.spans.send: role must be one of send, receive; not used on this board']);
  // A consumer patch that fixes the field keeps the span, with no warning.
  f=fixtures({spans:{find:{operationPrefix:null}}},{spans:{send:{role:'send'}}},provider);page=resolved(f);
  assert.deepEqual(plain(diagramOf(page).nodes['shared::worker'].trace.spans.find),{serviceName:'worker',operation:'find orders',role:'database'});
  assert.equal(diagramOf(page).edges.find(e=>e.from==='shared::api').trace.spans.send.role,'send');
  assert.deepEqual(warnings(page),[]);assert.deepEqual(errors(page),[]);
  // A malformed provider trace is dropped whole; a consumer overlay can still declare spans.
  f=fixtures({spans:{audit:{serviceName:'worker',operation:'audit',role:'database'}}},undefined,providerSpec({spans:[]}));page=resolved(f);
  assert.deepEqual(plain(diagramOf(page).nodes['shared::worker'].trace),{spans:{audit:{serviceName:'worker',operation:'audit',role:'database'}}});
  assert.deepEqual(warnings(page),['sections[0].diagram.nodes.shared::worker.trace: provider "provider" sections[0].diagram.nodes.worker.trace: expected {"spans": {<name>: <span declaration>}}; not used on this board']);
  // Nested: the drop follows the re-export to the next consumer.
  const middle=spec('middle',{nodes:{},rows:[[]],topologyImports:[{spec:'provider',export:'core',as:'p'}],topologyExports:{all:{nodes:['p::api','p::worker'],edges:['p::api->p::worker']}}});
  const outer=spec('outer',{nodes:{},rows:[[]],topologyImports:[{spec:'middle',export:'all',as:'m'}]});
  page=C.FlowTopology.resolveSource(outer,{version:1,id:'outer',specs:[provider,middle,outer]});
  assert.deepEqual(Object.keys(plain(diagramOf(page).nodes['m::p::worker'].trace.spans)),['process','cache']);
  assert.deepEqual(warnings(page).map(w=>w.split(': provider ')[0]),['sections[0].diagram.nodes.m::p::worker.trace.spans.find','sections[0].diagram.edges[0].trace.spans.send']);
  assert.match(warnings(page)[0],/provider "provider" sections\[0\]\.diagram\.nodes\.worker\.trace\.spans\.find: operation and operationPrefix cannot be combined/);
  // A consumer patch that breaks a valid provider span is the consumer's error, not a drop.
  f=fixtures({spans:{process:{role:'send'}}});page=resolved(f);
  assert.equal(diagramOf(page).nodes['shared::worker'].trace.spans.process.role,'send');
  assert.deepEqual(errors(page),['nodes.shared::worker.trace.spans.process: role must be one of process, database, cache, call, work']);
  assert.deepEqual(warnings(page),[]);
});

test('S6 compatibility declares flow.trace-spans for carrier and overlay declarations',()=>{
  const features=raw=>plain(C.FlowviewCompatibility.detect(raw));
  assert.ok(features(providerSpec()).includes('flow.trace-spans'),'carrier declarations');
  const overlayOnly=fixtures({hide:['cache']}).consumer;
  assert.ok(features(overlayOnly).includes('flow.trace-spans'),'an overlay trace alone');
  assert.ok(!features(fixtures().consumer).includes('flow.trace-spans'),'an import without trace overlays');
  assert.ok(!features(spec('plain',{nodes:{a:{title:'A'}},rows:[['a']]})).includes('flow.trace-spans'));
  assert.ok(!features(fixtures({hide:['cache']}).consumer).includes('flow.live-status'),'a trace overlay is not live ticket status');
});

test('S7 a resolved snapshot may edit trace on an imported carrier; structure stays read only',()=>{
  const before=resolved(fixtures()),after=JSON.parse(JSON.stringify(before));
  diagramOf(after).nodes['shared::worker'].trace.spans.process.operation='process orders v3';
  delete diagramOf(after).edges.find(e=>e.from==='shared::api').trace;
  assert.equal(C.FlowTopology.editError(before,after),null);
  const moved=JSON.parse(JSON.stringify(before));diagramOf(moved).nodes['shared::worker'].title='Renamed';
  assert.match(C.FlowTopology.editError(before,moved),/read only/);
  const broken=JSON.parse(JSON.stringify(before));diagramOf(broken).nodes['shared::worker'].trace={spans:[]};
  assert.match(C.FlowTopology.editError(before,broken),/spans must be an object keyed by span name/);
});
