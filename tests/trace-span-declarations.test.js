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
| S9 | Every Workbench and board Edit tracking edit of an imported carrier (tickets, PRs, Missing work, availability, metrics binding, Links window tickets) keeps the consumer's trace overlay, for a node and a connection. |
| S10 | Only the exact declaration messages are set aside during resolution: a span name with a colon still only warns for consumers; any other error still fails. |
| S11 | Overlay findings name the overlay: a hide or null entry for a span the provider lacks warns; a patch key the provider lacks says so; hide plus patch warns and the hide wins; an allowlist drop names the attribute and this board's allowedAttributes; a nested patch that cannot restore a dropped span still warns; Honeycomb number/boolean attribute values warn; a snapshot edit gets the full declaration check. |
| S8 | The example pair examples/canon/topology/orders-platform.json + orders-board.json resolves to the documented spans. |
| S9 | (#1290 PR 10) examples/canon/topology/orders-scoped.json: two steps light the imported worker; the one with a traceScope inherits it (a shared carrier needs a scope), skips the cache span and has a budget; the other inherits nothing. Valid, needs flow.trace-scope. |
*/
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const loader=require('../tools/source-loader.cjs');
const C={URL,TextEncoder};vm.createContext(C);
vm.runInContext(loader.composeSources(['canon.js','validator.js','compatibility.js','workbench/source-edit.js','workbench/targets.js','workbench/commands/common.js','workbench/commands/graph.js','workbench/commands/document.js','workbench/commands/layout.js','workbench/commands/topology.js','workbench/commands/telemetry.js','workbench/commands/links.js','workbench/io-model.js','workbench/session.js']),C);
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
  // A consumer patch that breaks a valid provider span is the consumer's error at its overlay, and the span is left out.
  f=fixtures({spans:{process:{role:'send'}}});page=resolved(f);
  assert.equal(Object.hasOwn(diagramOf(page).nodes['shared::worker'].trace.spans,'process'),false);
  assert.deepEqual(errors(page),['sections[0].diagram.topologyImports[0].nodeTracking.worker.trace.spans.process: role must be one of process, database, cache, call, work']);
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

test('S9 Workbench and board Edit tracking edits keep the consumer trace overlay on nodes and connections',()=>{
  const NODE={spans:{process:{operation:'process orders v2'},audit:{serviceName:'worker',operation:'audit write',role:'database'}},hide:['cache']};
  const EDGE={spans:{send:{namespace:'eu'}}};
  const f=fixtures(NODE,EDGE);f.provider.page.tracking={jira:{site:'https://jira.test'}};
  const apply=(source,fn)=>{const plan=fn(JSON.stringify(source,null,2),source);assert.equal(plan.error,undefined,plan.error);assert.ok(plan.text,'the edit writes');return JSON.parse(plan.text);};
  const overlay=(source,field,key)=>plain(diagramOf(source).topologyImports[0][field][key]);
  let source=f.consumer;
  const node=(fieldName,ref,remove)=>source=apply(source,(t,r)=>C.planTopologyTracking(t,r,0,'node','shared::worker',fieldName,ref,remove,f.context));
  const edge=(fieldName,ref,remove)=>source=apply(source,(t,r)=>C.planTopologyTracking(t,r,0,'edge','shared::api->shared::worker',fieldName,ref,remove,f.context,0));
  node('tickets','ORD-1',false);assert.deepEqual(overlay(source,'nodeTracking','worker'),{tickets:['ORD-1'],trace:NODE},'Inspect / board Edit ticket add');
  node('prs','https://github.com/acme/orders/pull/7',false);node('missingWork',true,false);node('existsWhen','tickets-done',false);
  node('telemetry',{kind:'service',signals:{up:{grafana:'up'}}},false);
  assert.deepEqual(overlay(source,'nodeTracking','worker').trace,NODE,'PRs, Missing work, availability and metrics keep it');
  for(const [field,ref] of [['telemetry',null],['existsWhen','tickets-done'],['missingWork',true],['prs','https://github.com/acme/orders/pull/7'],['tickets','ORD-1']])node(field,ref,true);
  assert.deepEqual(overlay(source,'nodeTracking','worker'),{trace:NODE},'removing everything else leaves the trace overlay');
  edge('missingWork',true,false);assert.deepEqual(overlay(source,'edgeTracking','api->worker'),{missingWork:true,trace:EDGE},'board Edit Missing work on a connection');
  edge('tickets','ORD-2',false);edge('missingWork',true,true);edge('tickets','ORD-2',true);
  assert.deepEqual(overlay(source,'edgeTracking','api->worker'),{trace:EDGE});
  // Metrics editor (planCarrierTelemetry) and the Links window (linksOverlayPlan) share the planner.
  source=apply(source,(t,r)=>C.planCarrierTelemetry(t,r,{section:0,kind:'edge',index:0,key:'shared::api->shared::worker'},{op:'addSignal',name:'rate',source:'grafana',query:'rate_q',kind:'call'},f.context));
  assert.deepEqual(overlay(source,'edgeTracking','api->worker').trace,EDGE,'a metrics binding edit keeps it');
  source=apply(source,(t,r)=>C.linksOverlayPlan(t,r,0,'node','shared::worker','ORD-3','ORD-3',false,f.context));
  assert.deepEqual(overlay(source,'nodeTracking','worker'),{tickets:['ORD-3'],trace:NODE},'a Links window ticket keeps it');
  // The resolved carriers still carry the merged spans.
  const d=diagramOf(C.FlowTopology.resolveSource(source,f.context));
  assert.deepEqual(Object.keys(plain(d.nodes['shared::worker'].trace.spans)),['process','find','audit']);
  assert.equal(d.edges.find(e=>e.from==='shared::api').trace.spans.send.namespace,'eu');
});

test('S10 resolution sets aside only exact declaration messages',()=>{
  // A span name with a colon is invalid in the provider and only warns for its consumers.
  const colon=WORKER();colon.spans['mongo:find']={serviceName:'worker',operation:'find',role:'database'};
  const provider=providerSpec(colon);
  assert.deepEqual(canonErrors(provider),['nodes.worker.trace.spans.mongo:find: span names start with a letter and use letters, digits, - and _']);
  const page=resolved(fixtures(undefined,undefined,provider));
  assert.deepEqual(Object.keys(plain(diagramOf(page).nodes['shared::worker'].trace.spans)),['process','find','cache']);
  assert.deepEqual(errors(page),[]);
  assert.match(warnings(page)[0],/^sections\[0\]\.diagram\.nodes\.shared::worker\.trace\.spans\.mongo:find: provider "provider" .*span names start with a letter/);
  // A spec with a span error and another error still fails resolution on the other error.
  const both=providerSpec(colon);diagramOf(both).nodes.api.binding={entityRef:'not a ref'};
  assert.throws(()=>resolved(fixtures(undefined,undefined,both)),e=>/invalid materialized spec/.test(e.message) && /nodes\.api\.binding/.test(e.message) && !/mongo:find/.test(e.message));
  // A consumer overlay error does not block resolution either; the consumer's validation reports it.
  assert.doesNotThrow(()=>resolved(fixtures({spans:{procss:{operation:'x'}}})));
});

test('S11 overlay findings name the overlay and say what happened',()=>{
  const at='sections[0].diagram.topologyImports[0].nodeTracking.worker.trace';
  // A hide or null entry for a span the provider lacks.
  let page=resolved(fixtures({hide:['cahce'],spans:{gone:null}}));
  assert.deepEqual(warnings(page),[at+'.hide: the provider declares no span cahce on this carrier; the hide is kept in case it returns',at+'.spans.gone: the provider declares no span gone on this carrier; the hide is kept in case it returns']);
  assert.deepEqual(Object.keys(plain(diagramOf(page).nodes['shared::worker'].trace.spans)),['process','find','cache'],'the provider cache span stays');
  // A typo'd patch key.
  page=resolved(fixtures({spans:{procss:{operation:'process orders v2'}}}));
  assert.deepEqual(errors(page),[at+'.spans.procss: the provider declares no span procss on this carrier, so this entry is a new span and needs a full declaration: serviceName required; role must be one of process, database, cache, call, work']);
  assert.equal(diagramOf(page).nodes['shared::worker'].trace.spans.process.operation,'process orders','the provider span is unchanged');
  // A full declaration under a new name with another fault does not get the new-span prefix.
  page=resolved(fixtures({spans:{'db:x':{serviceName:'worker',operation:'find',role:'database'}}}));
  assert.deepEqual(errors(page),[at+'.spans.db:x: span names start with a letter and use letters, digits, - and _']);
  // A malformed provider trace: its drop warns, and a consumer hide adds no "no such span" warning.
  page=resolved(fixtures({hide:['cache']},undefined,providerSpec({spans:[]})));
  assert.deepEqual(warnings(page),['sections[0].diagram.nodes.shared::worker.trace: provider "provider" sections[0].diagram.nodes.worker.trace: expected {"spans": {<name>: <span declaration>}}; not used on this board']);
  // Hide plus patch of the same span: the hide wins.
  page=resolved(fixtures({hide:['cache'],spans:{cache:{operation:'hget'}}}));
  assert.deepEqual(warnings(page),[at+'.spans.cache: span cache is both hidden and patched; the hide wins']);
  assert.equal(Object.hasOwn(diagramOf(page).nodes['shared::worker'].trace.spans,'cache'),false);
  // A provider attribute its own profile allows but this board does not.
  const profile={...require('./fixtures/trace-connection-profile.json'),dataset:'events',allowedAttributes:['tenant.id']};
  const listed=providerSpec({spans:{tenant:{serviceName:'worker',attributes:{'tenant.id':'t1'},role:'process'}}});listed.page.tracking={telemetry:{traceConnections:{company:profile}}};
  assert.deepEqual(canonErrors(listed),[]);
  page=resolved(fixtures(undefined,undefined,listed));
  assert.deepEqual(warnings(page),['sections[0].diagram.nodes.shared::worker.trace.spans.tenant: provider "provider" sections[0].diagram.nodes.worker.trace.spans.tenant: attribute tenant.id is not allowed on this board; list it in this board\'s trace connection allowedAttributes; not used on this board']);
  const allowed=fixtures(undefined,undefined,listed);allowed.consumer.page.tracking={telemetry:{traceConnections:{company:profile}}};
  assert.deepEqual(plain(diagramOf(resolved(allowed)).nodes['shared::worker'].trace.spans.tenant),{serviceName:'worker',attributes:{'tenant.id':'t1'},role:'process'},'listed on this board too: kept');
  // Nested: an outer patch that cannot bring back a span the middle dropped still warns.
  const broken=WORKER();broken.spans.find.operation='find orders';
  const provider=providerSpec(broken);
  const middle=spec('middle',{nodes:{},rows:[[]],topologyImports:[{spec:'provider',export:'core',as:'p'}],topologyExports:{all:{nodes:['p::api','p::worker'],edges:['p::api->p::worker']}}});
  const outer=spec('outer',{nodes:{},rows:[[]],topologyImports:[{spec:'middle',export:'all',as:'m',nodeTracking:{'p::worker':{trace:{spans:{find:{operationPrefix:null}}}}}}]});
  page=C.FlowTopology.resolveSource(outer,{version:1,id:'outer',specs:[provider,middle,outer]});
  assert.equal(Object.hasOwn(diagramOf(page).nodes['m::p::worker'].trace.spans,'find'),false);
  assert.ok(warnings(page).some(w=>/^sections\[0\]\.diagram\.nodes\.m::p::worker\.trace\.spans\.find: provider "provider"/.test(w)),warnings(page).join('\n'));
  // Honeycomb number or boolean attribute values warn, as for step traceMatch.
  const honeycomb={...require('./fixtures/trace-connection-profile.json'),provider:'honeycomb',dataset:'events',allowedAttributes:['order.count','order.vip']};
  const hc=providerSpec({spans:{orders:{serviceName:'worker',attributes:{'order.count':2,'order.vip':true},role:'process'}}});hc.page.tracking={telemetry:{traceConnections:{hc:honeycomb}}};
  const hcWarnings=plain(C.FlowCanon.traceWarnings(hc)).filter(w=>/trace\.spans/.test(w));
  assert.deepEqual(hcWarnings,['nodes.worker.trace.spans.orders.attributes.order.count: Honeycomb table cells are text; a number value never matches','nodes.worker.trace.spans.orders.attributes.order.vip: Honeycomb table cells are text; a boolean value never matches']);
  // A resolved snapshot edit gets the full declaration check.
  const before=resolved(fixtures());
  for(const bad of [{hide:['cache'],spans:{}},{spans:{process:{operation:'x'}}}]){
    const after=JSON.parse(JSON.stringify(before));diagramOf(after).nodes['shared::worker'].trace=bad;
    assert.match(C.FlowTopology.editError(before,after) || '',/snapshot node shared::worker tracking: trace/,JSON.stringify(bad));
  }
});

test('S9 the scoped example: a shared worker is inherited only by the step with a traceScope, which skips its cache span',()=>{
  const read=id=>JSON.parse(fs.readFileSync(path.join(__dirname,'../examples/canon/topology/'+id+'.json'),'utf8'));
  const board=read('orders-scoped'),platform=read('orders-platform');
  assert.deepEqual(plain(diagramOf(board).steps),[
    {id:'receive',nodes:['orders::worker'],text:'The worker takes the order (no traceScope on purpose: it warns because step work also lights the worker; a scope here would inherit the worker too, and spans both steps claim would read ambiguous)'},
    {id:'work',text:'The worker processes it',nodes:['orders::worker'],traceScope:{skip:{'orders::worker':['role:cache']},maxDurationMs:250}}]);
  const page=C.FlowTopology.resolveSource(board,{version:1,id:'orders-scoped',specs:[platform,board]});
  assert.deepEqual(plain(C.validate(C.normalize(page)).errors),[]);
  assert.ok(plain(C.FlowviewCompatibility.detect(board)).includes('flow.trace-scope'),'the page needs flow.trace-scope');
  const d=diagramOf(page),eff=id=>plain(C.FlowTraceMatch.effectiveSelector(d,d.steps.find(s=>s.id===id),d.steps));
  assert.deepEqual(eff('work').inherits,['orders::worker'],'the scope inherits the shared worker');
  assert.deepEqual(eff('receive').inherits,[],'without a scope a shared carrier is not inherited');
});
