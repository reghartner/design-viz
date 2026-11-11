'use strict';
/* #1290 PR 4: steps inherit the trace spans declared on the carriers they light, and
   `traceScope` narrows them. Design section 2.5-2.9 and 6.2.
| row | rule |
|---|---|
| I1 | A step without traceMatch inherits the declared spans of the carriers it lights directly: its delivered edges (their own send and receive spans) and its nodes. Edge endpoints are not lit, so a step on worker->billing never inherits the worker's process span. |
| I2 | Default inheritance only from carriers no other step on the path lights. A shared carrier with no traceScope leaves the step unmapped with a plain hint naming the carrier and the other step; with a traceScope on both, a shared span makes both steps ambiguous, naming the span and the other step. Never "earliest wins". |
| I3 | traceScope.skip drops declared spans by name or by role:<role>. |
| I4 | traceScope.attributes keeps only spans with those exact values. |
| I5 | traceScope.root: a trace whose root differs reads "not this flow" (neutral); a trace with no root span keeps the step and says the root is not in the trace. |
| I6 | traceScope.parentStepId keeps spans that descend from the parent step's spans and spans whose ancestry is not in the trace (marked); it drops spans whose known ancestry leads elsewhere; a parent with no mapping makes the step ambiguous when spans exist. |
| I7 | Budgets: maxDurationMs on the union time of a node step's spans or the hand-off time of an edge step; database-slow when the step's spans are database spans; maxQueueDepth as today. |
| I8 | optional makes a missing inheriting step neutral. |
| I9 | An explicit traceMatch and an inheriting step on one span are both ambiguous. Explicit traceMatch steps, and their parentStepId on an inheriting step, keep working. |
| I10 | Imported carriers through consumer overlays: added, hidden and overridden spans change what a step inherits; skip names the imported carrier id. |
| I11 | canon validate: traceMatch with traceScope, root, skip, parentStepId (unknown, self, cyclic), optional, budgets and attributes are checked. Validator warnings in plain words: a skip of a span the carrier does not declare, a skip of a carrier the step does not light, a step that inherits nothing because its carriers are shared. |
| I12 | Compatibility declares flow.trace-scope. |
| I13 | Reader: inheriting step rows (a node step on its node), "Not this flow" and the coverage line with timed nodes and connections and the plain unmapped hint, in node and step titles. A "not this flow" row paints nothing on the canvas. |
| I14 | An edge step owns only its edge's send spans; a declared receive is timing only, so it never collides with the receiving node's step. |
| I15 | Mapping a span onto a scoped step (board Edit mode and the Workbench trace match form) replaces its traceScope, so the result validates; the controls say so. |
*/
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const loader=require('../tools/source-loader.cjs');
const V={URL,console,AbortController,TextEncoder,TextDecoder,setTimeout,clearTimeout,document:{hidden:false,addEventListener(){},removeEventListener(){}}};
vm.runInNewContext(loader.entrypoint('standalone').body,V);
const T={URL,TextEncoder};vm.createContext(T);vm.runInContext(loader.composeSources(['canon.js','validator.js','compatibility.js']),T);
const plain=v=>JSON.parse(JSON.stringify(v));
const spec=(id,diagram,page={})=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},...page,sections:[{id:'main',diagram}]}});
const diagramOf=s=>s.page.sections[0].diagram;
// Normalized spans (the mapTrace input).
const s=(id,parentId,serviceName,operation,startMs,durationMs,extra={})=>({id,parentId,serviceName,operation,startMs,durationMs,error:false,attributes:{},links:[],...extra});
const SPANS=()=>[
  s('req',null,'api','POST /orders',0,300),
  s('pub','req','api','publish orders',100,2),
  s('proc',null,'worker','process orders',109,40,{links:['pub']}),
  s('f1','proc','worker','find orders',110,5,{attributes:{'db.system':'mongodb'}}),
  s('f2','proc','worker','find users',120,5,{attributes:{'db.system':'mongodb'}}),
  s('h1','proc','worker','hget',145,3,{attributes:{'db.system':'redis'}}),
  s('charge','proc','worker','POST /charge',150,20),
  s('bill','charge','billing','POST /charge',152,15)];
const WORKER=()=>({spans:{process:{serviceName:'worker',operation:'process orders',role:'process'},
  find:{serviceName:'worker',operationPrefix:'find ',role:'database'},cache:{serviceName:'worker',attributes:{'db.system':'redis'},role:'cache'}}});
function board(steps){
  return {nodes:{api:{title:'API',trace:{spans:{process:{serviceName:'api',operation:'POST /orders',role:'process'}}}},worker:{title:'Worker',trace:WORKER()},
    billing:{title:'Billing',trace:{spans:{process:{serviceName:'billing',operation:'POST /charge',role:'process'}}}}},rows:[['api','worker','billing']],
    edges:[{from:'api',to:'worker',label:'Publish',trace:{spans:{send:{serviceName:'api',operation:'publish orders',role:'send'}}}},
      {from:'worker',to:'billing',label:'Charge',trace:{spans:{send:{serviceName:'worker',operation:'POST /charge',role:'send'}}}}],
    steps:steps || [{id:'submit',text:'API publishes the order',edge:'api->worker'},{id:'work',text:'Worker handles it',nodes:['worker']},{id:'bill',text:'Worker charges billing',edge:'worker->billing'}],
    panels:[{id:'status',type:'live-status'}]};
}
const map=(d,spans=SPANS())=>V.FlowTraceMatch.mapTrace(d,{spans,warnings:[]});
const step=(m,id)=>{const r=m.steps.find(x=>x.stepId===id);assert.ok(r,'step '+id+' has a mapping result');return r;};
const ids=r=>r.spans.map(x=>x.id);

test('I1 a step inherits the declared spans of the carriers it lights directly',()=>{
  const m=map(board());
  assert.equal(step(m,'submit').status,'matched');assert.deepEqual(plain(ids(step(m,'submit'))),['pub'],'an edge step inherits the edge\'s own send span');
  assert.equal(step(m,'work').status,'matched');assert.deepEqual(plain(ids(step(m,'work')).sort()),['f1','f2','h1','proc'],'a node step inherits its node\'s spans');
  assert.deepEqual(plain(ids(step(m,'bill'))),['charge'],'a step on worker->billing never inherits the worker\'s process span');
  assert.equal(step(m,'work').inherited,true);
  // No declarations on the lit carriers: unmapped, as today.
  const bare=board();delete bare.nodes.worker.trace;
  assert.equal(step(map(bare),'work').status,'unmapped');
});

test('I2 a shared carrier needs a trace scope; scoped steps sharing a span are both ambiguous',()=>{
  const steps=[{id:'work',text:'Worker handles it',nodes:['worker']},{id:'reply',text:'Worker replies',nodes:['worker']}];
  let m=map(board(steps));
  for(const [id,other] of [['work','reply'],['reply','work']]){
    const r=step(m,id);
    assert.equal(r.status,'unmapped',id+' inherits nothing from a shared carrier without a scope');
    assert.equal(r.hint,'worker is also lit by step '+other+'; add a trace scope to this step to choose its spans.');
  }
  // With a scope on both the shared spans make both ambiguous; nothing goes to the earlier step.
  m=map(board(steps.map(x=>({...x,traceScope:{}}))));
  for(const [id,other] of [['work','reply'],['reply','work']]){
    const r=step(m,id);assert.equal(r.status,'ambiguous',id);
    assert.match(r.conditions[0].label,new RegExp('^worker process orders is also matched by step '+other+'; add a trace scope \\(root, parent step or attributes\\) to separate them\\.$'));
  }
});

test('I3 I4 skip by name or role, and keep only spans with given attributes',()=>{
  let m=map(board([{id:'work',text:'Worker handles it',nodes:['worker'],traceScope:{skip:{worker:['find','role:cache']}}}]));
  assert.deepEqual(plain(ids(step(m,'work'))),['proc']);
  m=map(board([{id:'work',text:'Worker handles it',nodes:['worker'],traceScope:{attributes:{'db.system':'mongodb'}}}]));
  assert.deepEqual(plain(ids(step(m,'work'))),['f1','f2']);
  // An unknown skip name changes nothing here (the validator warns).
  m=map(board([{id:'work',text:'Worker handles it',nodes:['worker'],traceScope:{skip:{worker:['gone']}}}]));
  assert.equal(ids(step(m,'work')).length,4);
});

test('I5 root: another flow reads "not this flow"; a trace without a root span keeps the step',()=>{
  const scoped=root=>board([{id:'work',text:'Worker handles it',nodes:['worker'],traceScope:{root}}]);
  let r=step(map(scoped({serviceName:'api',operation:'POST /orders'})),'work');
  assert.equal(r.status,'matched');
  r=step(map(scoped({serviceName:'web',operation:'GET /'})),'work');
  assert.equal(r.status,'missing');assert.equal(r.notThisFlow,true);assert.deepEqual(plain(r.conditions),[],'neutral, like optional');
  assert.equal(r.detail,'Not this flow: this trace starts at api POST /orders, not web GET /.');
  // No root span in the trace (the root was not recorded): the step is not excluded.
  const rootless=SPANS().filter(x=>x.id!=='req');
  r=step(map(scoped({serviceName:'web',operation:'GET /'}),rootless),'work');
  assert.equal(r.status,'matched');assert.match(r.detail,/The trace's root span is not in this trace, so the root was not checked\./);
});

test('I6 parentStepId keeps descendants and spans without known ancestry, drops other ancestry',()=>{
  const steps=[{id:'submit',text:'Publish',edge:'api->worker'},{id:'work',text:'Worker handles it',nodes:['worker'],traceScope:{parentStepId:'submit'}}];
  const spans=SPANS().concat([s('other-root',null,'web','GET /',0,10),s('stray','other-root','worker','process orders',200,10),s('lost','ghost','worker','find stock',210,5)]);
  let r=step(map(board(steps),spans),'work');
  assert.equal(r.status,'matched');
  assert.deepEqual(plain(ids(r).sort()),['f1','f2','h1','lost','proc'],'stray descends from another root and is dropped; lost has no known ancestry and is kept');
  assert.match(r.detail,/1 span's ancestry is not in this trace \(worker find stock\); it was kept\./);
  // The parent step has no span in this trace: unclear whose spans these are.
  r=step(map(board(steps),SPANS().filter(x=>x.id!=='pub')),'work');
  assert.equal(r.status,'ambiguous');assert.match(r.detail,/Parent mapping is unavailable\./);
  // An explicit traceMatch step can name an inheriting step as its parent.
  const explicit=[...steps.slice(0,1),{id:'proc',text:'Process',nodes:['billing'],traceMatch:{serviceName:'billing',operation:'POST /charge',parentStepId:'submit'}}];
  assert.equal(step(map(board(explicit)),'proc').status,'matched');
});

test('I7 I8 budgets on the step, database-slow for database spans, optional',()=>{
  let r=step(map(board([{id:'work',text:'Worker handles it',nodes:['worker'],traceScope:{maxDurationMs:30}}])),'work');
  assert.deepEqual(plain(r.conditions.map(c=>c.label)),['Slow operation · 40 ms / 30 ms budget'],'the union of the worker spans: 109-149, with the finds and hget inside');
  r=step(map(board([{id:'work',text:'Worker handles it',nodes:['worker'],traceScope:{skip:{worker:['process','cache']},maxDurationMs:5}}])),'work');
  assert.equal(r.conditions[0].kind,'database-slow');assert.match(r.conditions[0].label,/^Database slow · 10 ms \/ 5 ms budget$/,'the two finds, 5 ms each');
  r=step(map(board([{id:'submit',text:'Publish',edge:'api->worker',traceScope:{maxDurationMs:5}}])),'submit');
  assert.deepEqual(plain(r.conditions.map(c=>c.label)),['Slow operation · 9 ms / 5 ms budget'],'an edge step\'s time is its hand-off');
  r=step(map(board([{id:'bill',text:'Charge',edge:'worker->billing',traceScope:{optional:true}}]),SPANS().filter(x=>x.id!=='charge' && x.id!=='bill')),'bill');
  assert.equal(r.status,'missing');assert.equal(r.optional,true);assert.deepEqual(plain(r.conditions),[]);
  r=step(map(board([{id:'bill',text:'Charge',edge:'worker->billing'}]),SPANS().filter(x=>x.id!=='charge')),'bill');
  assert.equal(r.status,'missing');assert.equal(r.conditions[0].label,'Not observed · outcome unknown');
});

test('I9 an explicit traceMatch and an inheriting step on one span are both ambiguous',()=>{
  const steps=[{id:'submit',text:'Publish',edge:'api->worker'},{id:'publish',text:'Publish (explicit)',nodes:['api'],traceMatch:{serviceName:'api',operation:'publish orders',nodeId:'api'}}];
  const m=map(board(steps));
  assert.equal(step(m,'submit').status,'ambiguous');assert.equal(step(m,'publish').status,'ambiguous');
  assert.match(step(m,'submit').conditions[0].label,/^api publish orders is also matched by step publish; add a trace scope/);
  // Two explicit steps keep today's message.
  const two=map(board([{id:'a',text:'A',nodes:['api'],traceMatch:{serviceName:'api',operation:'publish orders'}},{id:'b',text:'B',nodes:['api'],traceMatch:{serviceName:'api',operation:'publish orders'}}]));
  assert.equal(step(two,'a').conditions[0].label,'One span matches multiple authored steps; refine the selectors.');
});

test('I10 imported carriers: consumer overlays change what a step inherits',()=>{
  const provider=spec('provider',{nodes:{api:{title:'API'},worker:{title:'Worker',trace:WORKER()}},rows:[['api','worker']],
    edges:[{from:'api',to:'worker',label:'Publish',trace:{spans:{send:{serviceName:'api',operation:'publish orders',role:'send'}}}}],topologyExports:{core:{nodes:['api','worker'],edges:['api->worker']}}});
  const consumer=spec('consumer',{nodes:{},rows:[[]],panels:[{id:'status',type:'live-status'}],
    topologyImports:[{spec:'provider',export:'core',as:'shared',nodeTracking:{worker:{trace:{spans:{process:{operation:'process orders v2'},audit:{serviceName:'worker',operation:'hget',role:'database'}},hide:['cache','find']}}}}],
    steps:[{id:'submit',text:'Publish',edge:'shared::api->shared::worker'},{id:'work',text:'Worker',nodes:['shared::worker']}]});
  const resolve=c=>plain(diagramOf(T.FlowTopology.resolveSource(c,{version:1,id:'consumer',specs:[provider,consumer]})));
  const spans=SPANS().concat([s('procV2',null,'worker','process orders v2',160,10)]);
  let m=map(resolve(consumer),spans);
  assert.deepEqual(plain(ids(step(m,'work')).sort()),['h1','procV2'],'overridden process (v2), added audit (hget), hidden cache and find');
  assert.deepEqual(plain(ids(step(m,'submit'))),['pub']);
  // skip names the imported carrier id.
  diagramOf(consumer).steps[1].traceScope={skip:{'shared::worker':['audit']}};
  m=map(resolve(consumer),spans);
  assert.deepEqual(plain(ids(step(m,'work'))),['procV2']);
});

test('I11 validation: shape errors, and plain-word warnings for skips and shared carriers',()=>{
  const errors=d=>plain(T.FlowCanon.validate(spec('b',d))).filter(e=>/traceScope/.test(e));
  const withStep=st=>board([{id:'submit',text:'Publish',edge:'api->worker'},{id:'work',text:'Worker',nodes:['worker'],...st}]);
  assert.deepEqual(errors(withStep({traceScope:{}})),[]);
  assert.deepEqual(errors(withStep({traceScope:{},traceMatch:{serviceName:'worker',operation:'process orders'}})),['traceScope: use traceMatch or traceScope on a step, not both']);
  assert.deepEqual(errors(withStep({traceScope:{root:{serviceName:'api'}}})),['traceScope.root: expected {serviceName, operation}']);
  assert.deepEqual(errors(withStep({traceScope:{skip:{worker:'find'}}})),['traceScope.skip: expected {<node or connection id>: [<span name or role:<role>>, …]}']);
  assert.deepEqual(errors(withStep({traceScope:{parentStepId:'ghost'}})),['traceScope: unknown or self parentStepId']);
  assert.deepEqual(errors(withStep({traceScope:{parentStepId:'work'}})),['traceScope: unknown or self parentStepId']);
  assert.deepEqual(errors(withStep({traceScope:{optional:'yes',maxDurationMs:-1,maxQueueDepth:'x'}})),['traceScope.optional: expected true or false','traceScope.maxDurationMs: nonnegative number required','traceScope.maxQueueDepth: nonnegative number required']);
  assert.deepEqual(errors(withStep({traceScope:{attributes:{'not.listed':'x'}}})),['traceScope.attributes: use supported operational attributes only']);
  assert.deepEqual(errors(withStep({traceScope:{extra:1}})),['traceScope: unknown field extra']);
  const cyclic=board([{id:'a',text:'A',nodes:['api'],traceScope:{parentStepId:'b'}},{id:'b',text:'B',nodes:['worker'],traceScope:{parentStepId:'a'}}]);
  assert.ok(plain(T.FlowCanon.validate(spec('b',cyclic))).includes('traceMatch: cyclic parentStepId'),'traceScope parents join the one cycle check');
  // Validator warnings, in plain words.
  const warnings=d=>plain(T.validate(T.normalize(spec('b',d))).warnings).filter(w=>/traceScope|trace spans/.test(w));
  assert.deepEqual(warnings(withStep({traceScope:{skip:{worker:['gone','role:send'],api:['process']}}})),[
    'sections[0].diagram.steps[1].traceScope.skip.worker: worker declares no trace span named gone; that skip is ignored',
    'sections[0].diagram.steps[1].traceScope.skip.worker: worker declares no trace span with role send; that skip is ignored',
    'sections[0].diagram.steps[1].traceScope.skip.api: step work does not light api; that skip is ignored']);
  const shared=board([{id:'work',text:'Worker',nodes:['worker']},{id:'reply',text:'Reply',nodes:['worker']}]);
  assert.deepEqual(warnings(shared),[
    'sections[0].diagram.steps[0]: step work inherits no trace spans because worker is also lit by step reply; add a traceScope to this step to choose its spans',
    'sections[0].diagram.steps[1]: step reply inherits no trace spans because worker is also lit by step work; add a traceScope to this step to choose its spans']);
  assert.deepEqual(warnings(board()),[],'the default board inherits cleanly');
  // With paths, the warning names the path where the step inherits nothing.
  const branching=board([{id:'work',text:'Worker',nodes:['worker']},{id:'reply',text:'Reply',nodes:['worker']},{id:'alt',text:'Alt',nodes:['api']}]);
  branching.paths=[{id:'a',label:'Path A',steps:['work','reply']},{id:'b',label:'Path B',steps:['work','alt']}];
  assert.deepEqual(warnings(branching),[
    'sections[0].diagram.steps[0]: on path Path A, step work inherits no trace spans because worker is also lit by step reply; add a traceScope to this step to choose its spans',
    'sections[0].diagram.steps[1]: on path Path A, step reply inherits no trace spans because worker is also lit by step work; add a traceScope to this step to choose its spans']);
});

test('I14 an edge step owns only its send spans; a declared receive is timing only',()=>{
  const d=board([{id:'submit',text:'Publish',edge:'api->worker'},{id:'work',text:'Worker handles it',nodes:['worker']}]);
  d.edges[0].trace.spans.receive={serviceName:'worker',operation:'process orders',role:'receive'};
  const m=map(d);
  assert.equal(step(m,'submit').status,'matched');assert.deepEqual(plain(ids(step(m,'submit'))),['pub']);
  assert.equal(step(m,'work').status,'matched','the receive declaration is the same span as the worker\'s process span, and nobody is ambiguous');
  const scoped=map(board([{id:'submit',text:'Publish',edge:'api->worker',traceScope:{maxDurationMs:5}}]));
  assert.match(step(scoped,'submit').conditions[0].label,/^Slow operation · 9 ms \/ 5 ms budget$/,'the receive still times the hand-off');
});

test('I15 mapping a span onto a scoped step replaces its trace scope and validates',async()=>{
  const page=spec('b',board([{id:'submit',text:'Publish',edge:'api->worker'},{id:'work',text:'Worker handles it',nodes:['worker'],traceScope:{skip:{worker:['cache']}}}]));
  const valid=raw=>assert.deepEqual(plain(T.FlowCanon.validate(raw)).filter(e=>/traceScope|traceMatch/.test(e)),[]);
  // Board Edit mode (Map this span).
  const newWin=()=>{const store=new Map();return {console,location:{pathname:'/board/'},addEventListener(){},removeEventListener(){},
    sessionStorage:{getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},
    claude:{use:async name=>name==='artifact'?{publish:async()=>{}}:name==='user'?{canEdit:async()=>true,me:async()=>({id:'u1',name:'Reader'})}:null}};};
  const e=V.createBoardEditor({win:newWin(),text:JSON.stringify(page,null,2),specFile:'flowspec.json',render:()=>null});
  for(let i=0;i<12;i++)await new Promise(setImmediate);
  e.start();assert.equal(e.mapSpan({section:0,kind:'step',id:'work'},{serviceName:'worker',operation:'process orders'}),true);
  let raw=JSON.parse(e.text()),work=diagramOf(raw).steps[1];
  assert.deepEqual(plain(work.traceMatch),{serviceName:'worker',operation:'process orders'});
  assert.equal(Object.hasOwn(work,'traceScope'),false,'the mapping replaces the trace scope');
  valid(raw);
  // Undo brings the trace scope back, right after the mapping and after a later edit.
  const scope={skip:{worker:['cache']},maxDurationMs:50};
  const scopedPage=spec('b',board([{id:'submit',text:'Publish',edge:'api->worker'},{id:'work',text:'Worker handles it',nodes:['worker'],traceScope:scope}]));
  scopedPage.page.tracking={jira:{site:'https://jira.test'}};
  async function editor(){const ed=V.createBoardEditor({win:newWin(),text:JSON.stringify(scopedPage,null,2),specFile:'flowspec.json',render:()=>null});for(let i=0;i<12;i++)await new Promise(setImmediate);ed.start();return ed;}
  let ed=await editor();
  assert.equal(ed.mapSpan({section:0,kind:'step',id:'work'},{serviceName:'worker',operation:'process orders'}),true);
  assert.equal(ed.undoMap(),true);
  work=diagramOf(JSON.parse(ed.text())).steps[1];
  assert.deepEqual(work.traceScope===undefined?'(no traceScope)':plain(work.traceScope),scope,'Undo right after the mapping restores the scope');assert.equal(Object.hasOwn(work,'traceMatch'),false);
  ed=await editor();
  assert.equal(ed.mapSpan({section:0,kind:'step',id:'work'},{serviceName:'worker',operation:'process orders'}),true);
  assert.equal(ed.add({section:0,kind:'node',id:'api'},'ORD-1'),true,'a later board edit');
  assert.equal(ed.undoMap(),true);
  raw=JSON.parse(ed.text());work=diagramOf(raw).steps[1];
  assert.deepEqual(work.traceScope===undefined?'(no traceScope)':plain(work.traceScope),scope,'Undo after a later edit restores the scope too');assert.equal(Object.hasOwn(work,'traceMatch'),false);
  assert.deepEqual(plain(diagramOf(raw).nodes.api.tickets),['ORD-1'],'the later edit stays');
  valid(raw);
  // Workbench Inspect: Add trace match on a scoped step writes traceMatch and removes traceScope in one edit.
  const W={URL,TextEncoder};vm.createContext(W);
  vm.runInContext(loader.composeSources(['canon.js','validator.js','workbench/source-edit.js','workbench/targets.js','workbench/commands/common.js','workbench/commands/narrative.js']),W);
  const text=JSON.stringify(page,null,2),plan=W.planStepTraceMatch(text,JSON.parse(text),0,1,{op:'create',serviceName:'worker',operation:'process orders'});
  assert.equal(plan.error,undefined,plan.error);
  raw=JSON.parse(plan.text);work=diagramOf(raw).steps[1];
  assert.deepEqual(plain(work.traceMatch),{serviceName:'worker',operation:'process orders'});assert.equal(Object.hasOwn(work,'traceScope'),false);
  valid(raw);
  // The reader's Map this span chooser and the Workbench button say so before the click.
  assert.equal(V.traceMapStepNote({traceScope:{}}),' · replaces this step\'s trace scope');
  assert.equal(V.traceMapStepNote({}),'');
});

test('I12 compatibility declares flow.trace-scope',()=>{
  const f=d=>plain(T.FlowviewCompatibility.detect(spec('b',d)));
  assert.ok(f(board([{id:'w',text:'W',nodes:['worker'],traceScope:{}}])).includes('flow.trace-scope'));
  assert.ok(!f(board()).includes('flow.trace-scope'));
});

test('I13 reader rows, "not this flow" and the coverage line',()=>{
  const ex=spans=>({traceId:'t1',warnings:[],spans:spans.map(x=>({id:x.id,parentId:x.parentId,service:x.serviceName,name:x.operation,startMs:x.startMs,ms:x.durationMs,error:false,attributes:x.attributes,links:x.links.map(spanId=>({traceId:'t1',spanId}))}))});
  let m=V.telemetryTraceModel(board(),undefined,ex(SPANS()));
  const work=m.rows.find(r=>r.id==='work');
  assert.equal(work.status,'matched');assert.equal(work.nodeId,'worker','a node step annotates its node');
  assert.ok(m.nodes.worker.some(r=>r.id==='work'));
  assert.equal(V.telemetryTraceCoverage(m),'3/3 steps matched · 2 spans unmatched · 3 nodes and 2 connections timed','req and bill belong to no step');
  // Shared carriers without a scope, and a step in another flow.
  const d=board([{id:'work',text:'Worker',nodes:['worker']},{id:'reply',text:'Reply',nodes:['worker']},{id:'web',text:'Web',nodes:['billing'],traceScope:{root:{serviceName:'web',operation:'GET /'}}}]);
  m=V.telemetryTraceModel(d,undefined,ex(SPANS()));
  assert.equal(m.rows.find(r=>r.id==='web').label,'Not this flow');
  assert.equal(V.telemetryTraceCoverage(m),'0/0 steps matched · 1 not this flow · 2 steps without a trace mapping · 8 spans unmatched · 3 nodes and 2 connections timed');
  // Reader hints use node and step titles and reader words, not ids or field names.
  assert.deepEqual(plain(V.telemetryTraceHints(m)),['Step “Worker”: Worker is also part of step “Reply”, so this step shows no trace spans of its own.','Step “Reply”: Worker is also part of step “Worker”, so this step shows no trace spans of its own.']);
  // A step of another flow paints nothing on its node: no empty label, no tone, no screen-reader text.
  const other=board([{id:'web',text:'Web',nodes:['billing'],traceScope:{root:{serviceName:'web',operation:'GET /'}}}]);
  const ot=V.telemetryTraceModel(other,undefined,ex(SPANS().filter(x=>x.serviceName!=='billing')));
  assert.equal(ot.rows[0].notThisFlow,true);
  assert.deepEqual(plain(V.telemetryTraceLabel(ot.nodes.billing || [])).text,'','nothing to label');
  assert.equal(V.telemetryTraceCountedRows(ot.nodes.billing || []).length,0,'the canvas counts no row for billing');
});
