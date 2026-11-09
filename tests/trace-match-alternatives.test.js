'use strict';
// #1100: a step's traceMatch may list alternatives (for example one root span per
// message transport). Source and packaged runtimes must agree.
//
// Contract: ticket #1100 Ask + Test plan; review cycle 1 MAJOR 1 (off-path parents);
// docs/provider-traces.md "traceMatch alternatives".
// | row | fixture | assertion (scoped) | rejects |
// |---|---|---|---|
// | first root only | diagram() + rabbitTrace | steps[0] matched r1, alternative 0 | trying only the last alternative |
// | second root only | diagram() + pulsarTrace | steps[0] matched p1, alternative 1 | trying only the first alternative |
// | matched selector | pulsar result | selector(step,result).maxDurationMs 10 | reading traceMatch[0] for budgets |
// | no alternative matches | unrelated span | steps[0] missing, alternative 1 (last tried) | an unmapped/empty result |
// | ambiguous kept | two r1-like spans | steps[0] ambiguous, alternative 0 | a later missing hiding the ambiguity |
// | single object unchanged | traceMatch = first entry | exact result objects, no alternative key | wrapping a single object as [m] |
// | child via second alternative | diagram() + pulsarTrace | steps[1] matched p-db | child resolved against alternative 0 only |
// | child descends from matched span | p1 + r-db under r1 | steps[1] missing | child accepted under any alternative's spans |
// | shared child, two paths | twoPaths() rabbit/pulsar path | persist matched r-db (alt 0) / p-db (alt 1) | throwing on a parent not on the path |
// | missing child on first path | twoPaths() rabbit path, no r-db | persist missing, alternative 0, detail '' | reporting the off-path alternative |
// | every parent off the path | twoPaths() orphan path | persist missing with a not-on-this-path detail | throwing or matching without a parent |
// | single object off-path parent | single-object persist, pulsar path | mapTrace throws Unknown parent step | silently skipping a single selector |
// | valid array | diagram() | no traceMatch errors | rejecting arrays |
// | empty array | traceMatch [] | traceMatch: ... alternative | accepting [] |
// | invalid entry field | traceMatch[1].occurrence 0 | 'traceMatch[1].occurrence: ...' | unindexed messages |
// | entry missing operation | delete traceMatch[1].operation | 'traceMatch[1]: ...operation...' | validating only entry 0 |
// | parent cycle via later entry | traceMatch[1].parentStepId persist | 'traceMatch: cyclic parentStepId' | cycle check on entry 0 only |
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readSource}=require('../tools/source-loader.cjs');
const packaged=require('../tools/canon/generated-runtime.cjs');
const source=vm.createContext({URL,TextEncoder});
for(const file of ['compatibility.js','canon.js','validator.js','engine.js'])vm.runInContext(readSource(file),source);
const plain=v=>JSON.parse(JSON.stringify(v));
const RABBIT='camera_stats_message process',PULSAR='persistent://stats/camera process';
const span=(id,operation,parentId=null,serviceName='stats-consumer',startMs=0)=>({id,parentId,serviceName,operation,startMs,durationMs:4,error:false,attributes:{},links:[]});
const trace=(...spans)=>({spans,warnings:[]});
const rabbitTrace=()=>trace(span('r1',RABBIT),span('r-db','INSERT stats','r1','stats-store'));
const pulsarTrace=()=>trace(span('p1',PULSAR),span('p-db','INSERT stats','p1','stats-store'));
const diagram=()=>({nodes:{consumer:{},store:{}},rows:[['consumer','store']],steps:[
  {id:'consume',text:'Consume stats',traceMatch:[{serviceName:'stats-consumer',operation:RABBIT,nodeId:'consumer'},{serviceName:'stats-consumer',operation:PULSAR,nodeId:'consumer',maxDurationMs:10}]},
  {id:'persist',text:'Persist stats',traceMatch:{serviceName:'stats-store',operation:'INSERT stats',nodeId:'store',parentStepId:'consume'}},
]});
function both(d,t,pathId){
  const a=plain(source.FlowTraceMatch.mapTrace(d,t,pathId)),b=plain(packaged.traceMatch.mapTrace(d,t,pathId));
  assert.deepEqual(b,a,'packaged and source matching agree');
  return a;
}
function errors(d){
  const raw={page:{sections:[{diagram:d}]}},a=Array.from(source.FlowCanon.validate(raw));
  assert.deepEqual(packaged.validateSpec(raw).errors.filter(e=>/^traceMatch/.test(e)),a.filter(e=>/^traceMatch/.test(e)),'packaged and source validation agree');
  return a;
}

test('a step with two alternatives matches a trace with only the first root and one with only the second',()=>{
  const rabbit=both(diagram(),rabbitTrace()).steps[0],pulsar=both(diagram(),pulsarTrace()).steps[0];
  assert.equal(rabbit.status,'matched');assert.deepEqual(rabbit.spans.map(s=>s.id),['r1']);assert.equal(rabbit.alternative,0);
  assert.equal(pulsar.status,'matched');assert.deepEqual(pulsar.spans.map(s=>s.id),['p1']);assert.equal(pulsar.alternative,1);
  assert.equal(source.FlowTraceMatch.selector(diagram().steps[0],pulsar).maxDurationMs,10,'the matched alternative is the selector');
  const neither=both(diagram(),trace(span('x','other'))).steps[0];
  assert.equal(neither.status,'missing');assert.equal(neither.alternative,1,'no match reports the last alternative tried');
  const ambiguous=both(diagram(),trace(span('r1',RABBIT),span('r2',RABBIT,null,'stats-consumer',1))).steps[0];
  assert.equal(ambiguous.status,'ambiguous','an ambiguous alternative is reported over a later missing one');assert.equal(ambiguous.alternative,0);
});

test('a single-object traceMatch maps exactly as before',()=>{
  const d=diagram();d.steps[0].traceMatch=d.steps[0].traceMatch[0];
  assert.deepEqual(both(d,rabbitTrace()).steps[0],{stepId:'consume',nodeId:'consumer',status:'matched',detail:'',spans:[span('r1',RABBIT)],conditions:[]});
  assert.deepEqual(both(d,pulsarTrace()).steps[0],{stepId:'consume',nodeId:'consumer',status:'missing',detail:'',spans:[],conditions:[{kind:'unknown',nodeId:'consumer',label:'Not observed · outcome unknown',spanIds:[]}]});
  assert.equal(source.FlowTraceMatch.selector(d.steps[0],both(d,rabbitTrace()).steps[0]),d.steps[0].traceMatch);
});

test('a child parentStepId follows whichever parent alternative matched',()=>{
  const viaSecond=both(diagram(),pulsarTrace()).steps[1];
  assert.equal(viaSecond.status,'matched');assert.deepEqual(viaSecond.spans.map(s=>s.id),['p-db']);
  assert.deepEqual(both(diagram(),rabbitTrace()).steps[1].spans.map(s=>s.id),['r-db']);
  const crossed=trace(span('p1',PULSAR),span('r-db','INSERT stats','r1','stats-store'));
  assert.equal(both(diagram(),crossed).steps[1].status,'missing','the child must descend from the matched alternative span');
});

test('validation accepts alternatives, rejects an empty array and names the invalid entry index',()=>{
  assert.deepEqual(errors(diagram()).filter(e=>/^traceMatch/.test(e)),[]);
  const empty=diagram();empty.steps[0].traceMatch=[];
  assert.ok(errors(empty).some(e=>/^traceMatch: /.test(e) && /alternative/.test(e)),'empty array fails');
  const invalid=diagram();invalid.steps[0].traceMatch[1].occurrence=0;
  assert.ok(errors(invalid).includes('traceMatch[1].occurrence: positive integer required'));
  const missing=diagram();delete missing.steps[0].traceMatch[1].operation;
  assert.ok(errors(missing).some(e=>/^traceMatch\[1\]: /.test(e) && /operation/.test(e)));
  const cycle=diagram();cycle.steps[0].traceMatch[1].parentStepId='persist';
  assert.ok(errors(cycle).includes('traceMatch: cyclic parentStepId'),'a parent cycle through a later alternative fails');
});

// One child step shared by two paths, each path with its own transport parent.
const twoPaths=()=>({nodes:{rq:{},pq:{},consumer:{},store:{}},rows:[['rq','pq'],['consumer'],['store']],
  edges:[{from:'rq',to:'consumer'},{from:'pq',to:'consumer'},{from:'consumer',to:'store'}],
  steps:[
    {id:'rc',text:'Consume from RabbitMQ',edge:'rq->consumer',traceMatch:{serviceName:'stats-consumer',operation:RABBIT,nodeId:'consumer'}},
    {id:'pc',text:'Consume from Pulsar',edge:'pq->consumer',traceMatch:{serviceName:'stats-consumer',operation:PULSAR,nodeId:'consumer'}},
    {id:'persist',text:'Persist stats',edge:'consumer->store',traceMatch:[
      {serviceName:'stats-store',operation:'INSERT stats',nodeId:'store',parentStepId:'rc'},
      {serviceName:'stats-store',operation:'INSERT stats',nodeId:'store',parentStepId:'pc'}]},
  ],
  paths:[{id:'rabbit',steps:['rc','persist']},{id:'pulsar',steps:['pc','persist']},{id:'orphan',steps:['persist']}]});
test('a shared child maps on each path when an alternative names a parent step that is not on the path',()=>{
  assert.deepEqual(errors(twoPaths()).filter(e=>/^traceMatch/.test(e)),[],'precondition: the validator accepts the fixture');
  const rabbit=both(twoPaths(),rabbitTrace(),'rabbit').steps.find(s=>s.stepId==='persist');
  assert.equal(rabbit.status,'matched');assert.deepEqual(rabbit.spans.map(s=>s.id),['r-db']);assert.equal(rabbit.alternative,0);
  const pulsar=both(twoPaths(),pulsarTrace(),'pulsar').steps.find(s=>s.stepId==='persist');
  assert.equal(pulsar.status,'matched');assert.deepEqual(pulsar.spans.map(s=>s.id),['p-db']);assert.equal(pulsar.alternative,1);
  const noChild=both(twoPaths(),trace(span('r1',RABBIT)),'rabbit').steps.find(s=>s.stepId==='persist');
  assert.equal(noChild.status,'missing');assert.equal(noChild.alternative,0,'the applicable alternative is reported, not the off-path one');assert.equal(noChild.detail,'');
  const orphan=both(twoPaths(),rabbitTrace(),'orphan').steps[0];
  assert.equal(orphan.status,'missing');assert.match(orphan.detail,/not on this path/);assert.deepEqual(orphan.spans,[]);
  const single=twoPaths();single.steps[2].traceMatch=single.steps[2].traceMatch[0];
  assert.throws(()=>source.FlowTraceMatch.mapTrace(single,pulsarTrace(),'pulsar'),/Unknown parent step rc/);
  assert.throws(()=>packaged.traceMatch.mapTrace(single,pulsarTrace(),'pulsar'),/Unknown parent step rc/);
});

// #1175: traceMatch.optional. A step is optional when its traceMatch, or every
// alternative, has optional:true. A missing optional step has no unknown condition.
test('a missing optional step is marked optional, not in this trace, with no unknown condition; matched and ambiguous are unchanged',()=>{
  const single=diagram();single.steps[1].traceMatch.optional=true;
  const absent=both(single,trace(span('r1',RABBIT))).steps[1];
  assert.deepEqual(absent,{stepId:'persist',nodeId:'store',status:'missing',detail:'Optional, not in this trace.',spans:[],conditions:[],optional:true});
  const plainChild=diagram();
  assert.deepEqual(both(plainChild,trace(span('r1',RABBIT))).steps[1].conditions.map(c=>c.kind),['unknown'],'without optional the missing step stays unknown');
  assert.deepEqual(both(single,rabbitTrace()).steps[1],both(plainChild,rabbitTrace()).steps[1],'a matched optional step is the same result as a matched step');
  const twice=trace(span('r1',RABBIT),span('r-db','INSERT stats','r1','stats-store'),span('r-db2','INSERT stats','r1','stats-store',1));
  assert.deepEqual(both(single,twice).steps[1],both(plainChild,twice).steps[1],'an ambiguous optional step stays ambiguous');
  assert.equal(both(single,twice).steps[1].status,'ambiguous');
  const list=diagram();list.steps[0].traceMatch.forEach(m=>m.optional=true);
  const none=both(list,trace(span('x','other'))).steps[0];
  assert.equal(none.status,'missing');assert.equal(none.optional,true,'every alternative optional: the step is optional');assert.deepEqual(none.conditions,[]);assert.equal(none.alternative,1);
  // The child of a missing optional parent is not optional itself.
  assert.deepEqual(both(list,trace(span('x','other'))).steps[1].conditions.map(c=>c.kind),['unknown']);
  const off=diagram();off.steps[1].traceMatch.optional=false;
  assert.equal(both(off,trace(span('r1',RABBIT))).steps[1].optional,undefined,'optional:false is not optional');
});
test('an optional step whose own span is in the trace but rejected by its parent stays unknown',()=>{
  const d=diagram();d.steps[1].traceMatch.optional=true;
  // Parent missing, and parent ambiguous: the INSERT span is present both times.
  for(const t of [trace(span('r-db','INSERT stats','r1','stats-store')),trace(span('r1',RABBIT),span('r2',RABBIT,null,'stats-consumer',1),span('r-db','INSERT stats','r1','stats-store'))]){
    const persist=both(d,t).steps[1];
    assert.equal(persist.status,'missing');assert.equal(persist.optional,undefined,'a present span is not "not in this trace"');
    assert.deepEqual(persist.conditions.map(c=>c.kind),['unknown']);assert.equal(persist.detail,'Parent mapping is unavailable.');
  }
  // Own span and parent both absent: optional, not in this trace.
  const absent=both(d,trace(span('x','other'))).steps[1];
  assert.equal(absent.optional,true);assert.equal(absent.detail,'Optional, not in this trace. Parent mapping is unavailable.');
  // Alternatives with different operations: alternative 0's span is present but its parent mapping is
  // unavailable, alternative 1's operation is absent. One unattributable span is enough to stay unknown.
  const mixed=diagram();mixed.steps[1].traceMatch=[{...mixed.steps[1].traceMatch,optional:true},{serviceName:'stats-store',operation:'INSERT legacy',nodeId:'store',parentStepId:'consume',optional:true}];
  const unclear=both(mixed,trace(span('r-db','INSERT stats','r1','stats-store'))).steps[1];
  assert.equal(unclear.status,'missing');assert.equal(unclear.optional,undefined);assert.deepEqual(unclear.conditions.map(c=>c.kind),['unknown']);
});
// #1175 follow-up: a span is this step's only when it can be attributed to it. A span under another, matched
// parent, or a call past the occurrence count, is not this step's span: the optional step is not in this trace.
test('an optional step whose matching span belongs to another parent, or whose occurrence is past the call count, is not in this trace',()=>{
  const call=(id,operation,parentId=null,serviceName='api',startMs=0)=>({...span(id,operation,parentId,serviceName,startMs),durationMs:2});
  // P1: audit and persist both name the store INSERT; the only INSERT is under persist's parent.
  const d={nodes:{api:{},store:{}},rows:[['api','store']],steps:[
    {id:'request',traceMatch:{serviceName:'api',operation:'POST /orders',nodeId:'api'}},
    {id:'other',traceMatch:{serviceName:'api',operation:'GET /orders',nodeId:'api'}},
    {id:'persist',traceMatch:{serviceName:'store',operation:'INSERT order',nodeId:'store',parentStepId:'request'}},
    {id:'audit',traceMatch:{serviceName:'store',operation:'INSERT order',nodeId:'store',parentStepId:'other',optional:true}}]};
  const p1=both(d,trace(call('p1','POST /orders'),call('g1','GET /orders',null,'api',5),call('c1','INSERT order','p1','store',1)));
  assert.equal(p1.steps[2].status,'matched');
  assert.deepEqual([p1.steps[3].status,p1.steps[3].optional,p1.steps[3].conditions],['missing',true,[]],'P1: the INSERT under another parent is not audit\'s span');
  // P2: a second serial call that this trace does not make.
  const o={nodes:{api:{}},rows:[['api']],steps:[
    {id:'first',traceMatch:{serviceName:'api',operation:'GET /status',nodeId:'api',occurrence:1}},
    {id:'second',traceMatch:{serviceName:'api',operation:'GET /status',nodeId:'api',occurrence:2,optional:true}}]};
  const p2=both(o,trace(call('s1','GET /status')));
  assert.equal(p2.steps[0].status,'matched');
  assert.deepEqual([p2.steps[1].status,p2.steps[1].optional,p2.steps[1].conditions],['missing',true,[]],'P2: occurrence 2 of one call is not in this trace');
  // Without optional both stay unknown.
  delete d.steps[3].traceMatch.optional;delete o.steps[1].traceMatch.optional;
  assert.deepEqual(both(d,trace(call('p1','POST /orders'),call('g1','GET /orders',null,'api',5),call('c1','INSERT order','p1','store',1))).steps[3].conditions.map(c=>c.kind),['unknown']);
  assert.deepEqual(both(o,trace(call('s1','GET /status'))).steps[1].conditions.map(c=>c.kind),['unknown']);
  // A shared child on the pulsar path: the RabbitMQ alternative's parent is not on this path, and the
  // Pulsar parent matched with no INSERT under it. The INSERT under r1 is not this path's span.
  const list=twoPaths();list.steps[2].traceMatch.forEach(m=>m.optional=true);
  const shared=both(list,trace(span('p1',PULSAR),span('r-db','INSERT stats','r1','stats-store')),'pulsar').steps.find(s=>s.stepId==='persist');
  assert.deepEqual([shared.status,shared.optional,shared.conditions,shared.detail],['missing',true,[],'Optional, not in this trace.']);
});
test('validation rejects a non-boolean optional and mixed optional values across alternatives',()=>{
  const ok=diagram();ok.steps[1].traceMatch.optional=true;ok.steps[0].traceMatch.forEach(m=>m.optional=true);
  assert.deepEqual(errors(ok).filter(e=>/^traceMatch/.test(e)),[],'optional:true on a single selector and on every alternative is valid');
  const off=diagram();off.steps[1].traceMatch.optional=false;off.steps[0].traceMatch[0].optional=false;
  assert.deepEqual(errors(off).filter(e=>/^traceMatch/.test(e)),[],'optional:false and no optional are both not optional, not mixed');
  for(const value of ['yes',1,null,'true']){
    const bad=diagram();bad.steps[1].traceMatch.optional=value;
    assert.ok(errors(bad).includes('traceMatch.optional: expected true or false'),JSON.stringify(value)+' is rejected');
    const entry=diagram();entry.steps[0].traceMatch[1].optional=value;
    assert.ok(errors(entry).includes('traceMatch[1].optional: expected true or false'),JSON.stringify(value)+' is rejected with its index');
  }
  for(const other of [undefined,false]){
    const mixed=diagram();mixed.steps[0].traceMatch[0].optional=true;if(other!==undefined)mixed.steps[0].traceMatch[1].optional=other;
    assert.ok(errors(mixed).includes('traceMatch: set optional on every alternative or on none'),'optional true with '+other+' is mixed');
  }
});
