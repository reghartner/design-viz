'use strict';
/* #1290 PR 5: proof, reference traces and provider checks for declared trace spans.
   Design section 1.6, 6.3, D19 and D20.
| row | rule |
|---|---|
| P1 | Existing approvals keep their contract digest byte for byte: the doorbell example (steps with traceMatch) and the checkout board through --resolve-imports (tests/trace-cli-imports.test.js pins the CLI one). |
| P2 | Inheriting steps are measured: a reference over the orders example (no traceMatch, declared spans) is eligible and maps them; ambiguous inheriting steps block approval; unmapped and not-this-flow steps are left out. |
| P3 | The contract digests each step's effective selector: a provider edit to a span the consumer inherits (send, or the receiving node's process span that times the hand-off) makes compare ask for a new approval; an edit to a declared carrier no step lights does not. Every declared carrier a step lights counts, shared or not. |
| P4 | Incident steps for inheriting steps take their text from the step and its spans; an optional missing inheriting step and a step of another flow do not throw. |
| P5 | Provider check (D19): on a diagram with an approved reference trace, a declared exact operation or operationPrefix with no matching span of its service warns in plain words; an imported carrier's warning names the provider; attribute-only declarations are not checked. |
*/
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const C=require('../tools/canon/core.cjs');
const load=()=>import('../tools/canon/traces.mjs');
const plain=v=>JSON.parse(JSON.stringify(v));
const read=file=>JSON.parse(fs.readFileSync(path.join(__dirname,'..',file),'utf8'));
const diagramOf=s=>s.page.sections[0].diagram;
// The orders example pair: the board's steps carry no traceMatch and inherit the declared spans.
function orders(edit){
  const platform=read('examples/canon/topology/orders-platform.json'),board=read('examples/canon/topology/orders-board.json');
  if(edit)edit(diagramOf(platform),diagramOf(board));
  return {platform,board,resolved:C.materializeTopology([platform,board]).find(s=>s.page.canon.id==='orders-board')};
}
const span=(id,parent,service,name,startMs,ms,extra={})=>({'trace.trace_id':'orders-1','trace.span_id':id,'trace.parent_id':parent || '','service.name':service,name,startMs,duration_ms:ms,error:false,'deployment.environment.name':'demo',...extra});
// One order: the shop posts to the API (a link), the API publishes to the worker (namespace eu).
const ORDER=()=>({spans:[span('web',null,'shop-web','GET /checkout',0,200),span('post','web','shop-web','POST /orders',10,5),
  span('api','post','order-api','POST /orders',12,60),span('pub','api','order-api','publish orders',30,2,{'service.namespace':'eu'}),
  span('proc','pub','order-worker','process orders v2',40,30)]});

test('P1 existing approvals keep their contract digest',async()=>{
  const T=await load();
  // Computed on trace-spans cb205631, before this change.
  const doorbell=T.approveReference(read('examples/canon/specs/doorbell.json'),read('examples/canon/traces/happy.json'),{reason:'Reviewed',at:'2026-11-11T00:00:00Z'});
  assert.equal(diagramOf(doorbell).referenceTrace.contract,'cb68a51e079e430efeb74625b6db65ac4328b0ffe50f55b85546938ee9028b90');
});

test('P2 inheriting steps are measured; ambiguous ones block approval; unmapped ones are left out',async()=>{
  const T=await load(),{resolved}=orders();
  const preview=T.referencePreview(resolved,ORDER());
  assert.deepEqual(plain(preview.mapping.steps.map(s=>[s.stepId,s.status,s.inherited,s.spans.map(x=>x.id)])),[['place','matched',true,['post']],['publish','matched',true,['pub']]]);
  assert.equal(preview.eligible,true,'inheriting steps are measured and eligible');
  const approved=T.approveReference(resolved,ORDER(),{reason:'Reviewed orders'});
  assert.deepEqual(plain(diagramOf(approved).referenceTrace.mapping),[{stepId:'place',spanIds:['post']},{stepId:'publish',spanIds:['pub']}]);
  // Two scoped steps claiming the same span are ambiguous and block approval.
  const ambiguous=orders((p,b)=>{b.steps.push({id:'again',text:'Publish again',edge:'orders::api->orders::worker',traceScope:{}});b.steps[1].traceScope={};}).resolved;
  assert.equal(T.referencePreview(ambiguous,ORDER()).eligible,false);
  // A step left unmapped (shared carrier, no scope) and a step of another flow do not count.
  const left=orders((p,b)=>{b.steps.push({id:'echo',text:'Echo',edge:'orders::api->orders::worker'},{id:'other',text:'Other flow',nodes:['shop'],traceScope:{root:{serviceName:'admin',operation:'GET /'}}});}).resolved;
  const p=T.referencePreview(left,ORDER());
  assert.equal(p.mapping.steps.find(s=>s.stepId==='other').notThisFlow,true);
  assert.deepEqual(plain(p.mapping.steps.filter(s=>s.stepId==='publish' || s.stepId==='echo').map(s=>s.status)),['unmapped','unmapped'],'the shared connection leaves both unmapped');
  assert.equal(p.eligible,true,'unmapped and not-this-flow steps neither block nor count');
  assert.deepEqual(plain(diagramOf(T.approveReference(left,ORDER(),{reason:'r'})).referenceTrace.mapping.map(m=>m.stepId)),['place']);
});

test('P3 the contract covers each step\'s effective selector, so a provider span edit asks for a new approval',async()=>{
  const T=await load(),approved=T.approveReference(orders().resolved,ORDER(),{reason:'Reviewed orders'}),reference=diagramOf(approved).referenceTrace;
  const compare=edit=>{const next=orders(edit).resolved;diagramOf(next).referenceTrace=C.clone(reference);return ()=>T.compareTrace(next,ORDER());};
  assert.doesNotThrow(compare(),'nothing changed');
  assert.throws(compare(p=>{p.edges[0].trace.spans.send.operation='publish orders v3';}),/Trace mappings changed; approve the reference again\./,'the inherited send span');
  assert.throws(compare(p=>{p.nodes.worker.trace.spans.process.serviceName='order-worker-v2';}),/Trace mappings changed/,'the receiving node\'s process span times the hand-off');
  assert.throws(compare((p,b)=>{b.topologyImports[0].edgeTracking['api->worker'].trace.spans.send.namespace='us';}),/Trace mappings changed/,'the consumer overlay counts too');
  assert.throws(compare((p,b)=>{b.steps[1].traceScope={maxDurationMs:500};}),/Trace mappings changed/,'the trace scope counts');
  assert.doesNotThrow(compare(p=>{p.nodes.worker.trace.spans.find.operationPrefix='aggregate ';}),'a span no step uses (the worker\'s find) does not');
  assert.throws(compare(p=>{p.nodes.api.trace.spans.process.operation='POST /v2/orders';}),/Trace mappings changed/,'the api node\'s process span times the shop connection\'s hand-off');
  assert.doesNotThrow(compare((p,b)=>{b.nodes.shop.trace.spans.process.operation='GET /v2/checkout';}),'nor the shop node, which no step lights and no step\'s hand-off ends at');
});

test('P4 incident steps for inheriting steps use the step and its spans',async()=>{
  const T=await load(),approved=T.approveReference(orders().resolved,ORDER(),{reason:'Reviewed orders'});
  const failed=ORDER();failed.spans[3].error=true;failed.spans[3]['http.response.status_code']=503;
  assert.doesNotThrow(()=>T.compareTrace(approved,failed),'incident steps for inheriting steps');
  const r=T.compareTrace(approved,failed);
  assert.equal(r.firstDivergence,'publish');
  const d=diagramOf(r.spec),incident=d.steps.find(s=>s.id===r.spec.page.sections[0].diagram.paths[1].steps[1]);
  assert.match(incident.text,/^Service error · HTTP 503$/);
  assert.deepEqual(plain(C.validateSpec(r.spec).errors),[]);
  // An optional inheriting step missing from the trace, and a step of another flow.
  const optional=orders((p,b)=>{b.steps[1].traceScope={optional:true};}).resolved,ok=T.approveReference(optional,ORDER(),{reason:'r'});
  // The shop's post fails (a divergence at place) and the publish is not in the trace: its incident step reads optional.
  const noPub=ORDER();noPub.spans=noPub.spans.filter(x=>x['trace.span_id']!=='pub');noPub.spans.find(x=>x['trace.span_id']==='proc')['trace.parent_id']='api';noPub.spans[1].error=true;
  assert.doesNotThrow(()=>T.compareTrace(ok,noPub),'an optional inheriting incident step');
  const opt=T.compareTrace(ok,noPub);
  assert.equal(opt.firstDivergence,'place');assert.equal(opt.mapping.steps.find(s=>s.stepId==='publish').optional,true);
  assert.ok(diagramOf(opt.spec).steps.some(s=>s.text==='Optional, not in this trace: The API publishes it to the worker'),'the optional incident step uses the step text');
  // Observed text for a matched inheriting step after the divergence names its span.
  const lateApproved=T.approveReference(orders((p,b)=>{b.steps.unshift({id:'start',text:'Start',nodes:['shop'],traceScope:{maxDurationMs:1000}});}).resolved,ORDER(),{reason:'r'});
  const slow=orders((p,b)=>{b.steps.unshift({id:'start',text:'Start',nodes:['shop'],traceScope:{maxDurationMs:1000}});}).resolved;diagramOf(slow).referenceTrace=diagramOf(lateApproved).referenceTrace;
  const slowTrace=ORDER();slowTrace.spans[0].duration_ms=5000;
  const out=T.compareTrace(slow,slowTrace),texts=diagramOf(out.spec).steps.filter(s=>s.evidence).map(s=>s.text);
  assert.equal(out.firstDivergence,'start');
  assert.ok(texts.includes('Observed shop-web · POST /orders'),texts.join(' | '));
});

test('P5 a provider declaration that matches nothing in its approved reference trace warns, naming the provider for imports',async()=>{
  const T=await load(),warnings=s=>plain(C.validateSpec(s).warnings).filter(w=>/approved reference trace/.test(w));
  // The provider approves a reference trace with one of its own steps.
  const {platform}=orders();
  diagramOf(platform).steps=[{id:'publish',text:'Publish',edge:'api->worker'}];
  const ref=ORDER();
  // The provider's own build validates it resolved (its exports removed).
  const approved=T.approveReference(C.materializeTopology([platform])[0],ref,{reason:'Provider reference'});
  assert.deepEqual(warnings(approved),[
    'sections[0].diagram.nodes.worker.trace.spans.process: no span in the approved reference trace matches order-worker process orders; check the declaration or approve a new reference',
    'sections[0].diagram.nodes.worker.trace.spans.find: no span in the approved reference trace matches order-worker operations starting "find "; check the declaration or approve a new reference'],
    'process orders is not in this trace (the v2 worker ran); the attribute-only cache span is not checked');
  // The consumer's own approved reference: an imported carrier's warning names the provider.
  const {resolved}=orders(),board=T.approveReference(resolved,ORDER(),{reason:'Board reference'});
  assert.deepEqual(warnings(board).filter(w=>/orders::worker/.test(w)),[
    'sections[0].diagram.nodes.orders::worker.trace.spans.find: no span in the approved reference trace matches order-worker operations starting "find "; check the declaration or approve a new reference. It comes from "orders-platform"; fix it there, or patch it in this board\'s nodeTracking for worker',
    'sections[0].diagram.nodes.orders::worker.trace.spans.audit: no span in the approved reference trace matches order-worker audit write; check the declaration or approve a new reference']);
  // Without an approved reference trace nothing is checked.
  assert.deepEqual(warnings(orders().resolved),[]);
});
