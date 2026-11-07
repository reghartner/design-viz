'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {entrypoint}=require('../tools/source-loader.cjs');
const C={URL,console,AbortController,TextEncoder,TextDecoder,setTimeout,clearTimeout,document:{hidden:false,addEventListener(){},removeEventListener(){}}};vm.runInNewContext(entrypoint('standalone').body,C);
const plain=x=>JSON.parse(JSON.stringify(x));let fixture;
async function story(){return fixture || (fixture=await (await import('./helpers/step-evidence.mjs')).stepFixture());}
function model(f,index=0,path='event',jiraOn=true){const d=f.spec.page.sections[0].diagram;return C.telemetryStepModel(d,index,path,f.spec.page,{map:f.samples}, {'TRACE-1':{state:'done'}},jiraOn);}
test('step captions retain primary headline and worst direct-carrier verdict without selecting traces',async()=>{
 const f=structuredClone(await story()),m=model(f),d=f.spec.page.sections[0].diagram;
 assert.equal(m.primary,'mcu->ingest');assert.match(m.caption,/PROVEN/);assert.equal(m.trace,undefined);assert.match(model(f,0,'event',false).caption,/HEALTHY/);
 d.steps[0].edges=['mcu->ingest','ingest->notify'];delete d.steps[0].edge;d.edges[1].tickets=['TRACE-1'];d.edges[1].telemetry.proof.rate={min:1};f.samples['ingest->notify'].signals.rate.value=0;f.samples['ingest->notify'].signals.rate.series=[];
 assert.match(model(f).caption,/DONE · UNPROVEN/);d.edges[1].telemetry.proof.rate={max:1};f.samples['ingest->notify'].signals.rate.value=20;assert.match(model(f).caption,/DONE · DEGRADED/);
});
test('selected trace maps only the exact source/path and never guesses display-name joins',async()=>{
 const f=structuredClone(await story()),d=f.spec.page.sections[0].diagram,e=f.samples['mcu->ingest'].exemplars[0];
 assert.equal(C.telemetryTraceModel(d,'event',e).rows.length,4);assert.equal(C.telemetryTraceModel(d,'short',e).rows.length,2);
 assert.equal(C.telemetryTraceModel(d,'absent',e).rows.length,0);delete d.steps[0].traceMatch;
 assert.equal(C.telemetryTraceModel(d,'event',e).edges['mcu->ingest'],undefined);assert.equal(C.telemetryTraceModel(d,'event',e).rows[0].status,'unmapped');
});
test('shared source/packaged/Node matching parity: attributes, links, serial occurrence, attempts and ownership',async()=>{
 const T=await import('../tools/canon/traces.mjs'),P=require('../tools/canon/core.cjs');
 const s=(id,start,attrs={},parentId='')=>({id,serviceName:'svc',operation:'call',startMs:start,durationMs:3,attributes:{'service.namespace':'ns',...attrs},links:[],parentId});
 const trace={spans:[s('a',0,{'retry.attempt':0}),s('b',10,{'retry.attempt':1})],warnings:['Partial sample']};
 for(const selector of [{serviceName:'svc',operation:'call',namespace:'ns',occurrence:2},{serviceName:'svc',operation:'call',repeat:'attempts'},{serviceName:'svc',operation:'call',attributes:{'retry.attempt':1}},{serviceName:'svc',operation:'call',namespace:'missing'}]){
  const d={steps:[{id:'s',traceMatch:selector}]};assert.deepEqual(plain(C.FlowTraceMatch.mapTrace(d,trace)),plain(T.mapTrace(d,trace)));assert.deepEqual(plain(P.traceMatch.mapTrace(d,trace)),plain(T.mapTrace(d,trace)));
 }
 const d={steps:[{id:'p',traceMatch:{serviceName:'svc',operation:'call',attributes:{'retry.attempt':0}}},{id:'c',traceMatch:{serviceName:'svc',operation:'child',parentStepId:'p'}}]};trace.spans.push({...s('c',0),operation:'child',links:['a']});assert.equal(C.FlowTraceMatch.mapTrace(d,trace).steps[1].status,'matched');
 trace.spans[1].startMs=1;assert.equal(C.FlowTraceMatch.mapTrace({steps:[{id:'s',traceMatch:{serviceName:'svc',operation:'call',occurrence:1}}]},trace).steps[0].status,'ambiguous');
 d.steps.push({...d.steps[0],id:'duplicate'});assert.equal(C.FlowTraceMatch.mapTrace(d,trace).steps[0].status,'ambiguous');
});
test('trace-only pin dedupe/cap and lifecycle without numeric Proof',async()=>{
 const f=await story(),e=f.samples['mcu->ingest'].exemplars[0],binding={id:'a',title:'A',signals:{trace:{source:'honeycomb',query:{}}},proof:{},kind:'call'};
 const activity=C.liveStatusTelemetryActivity();assert.equal(activity.pin(binding,e,'2026-11-05T00:00:00Z'),true);assert.equal(activity.pin(binding,e,'2026-11-05T01:00:00Z'),false);assert.equal(activity.snapshot()[0].traceAt,e.candidates.find(c=>c.traceId===e.traceId).time);
 for(let i=0;i<25;i++)activity.pin(binding,{...e,traceId:i.toString(16).padStart(32,'0')},new Date(Date.UTC(2026,10,5,1,i)).toISOString());assert.equal(activity.snapshot().length,20);
 activity.reconcile([{...binding,signals:{}}]);assert.equal(activity.snapshot().length,0);activity.pin(binding,e,'2026-11-05T00:00:00Z');activity.reconcileTraces({historical:false,map:{}});assert.equal(activity.snapshot().length,0);
});
test('read-only alternative capability requires handler and current live capability; off/history invalidate',async t=>{
 const f=await story(),e=f.samples['mcu->ingest'].exemplars[0],p=f.spec.page;let calls=0,allowed=true;
 const options={provider:async()=>f.samples,chooseExemplar:async()=>{calls++;return f.alternative;},canChooseExemplar:()=>allowed};
 const api=C.createTelemetry(p,options,{carriers:fn=>p.sections[0].diagram.edges.forEach(edge=>fn(edge,edge.from+'->'+edge.to,p))});
 t.after(()=>api.destroy());api.apply(f.samples);const id='mcu->ingest',alt=f.alternative.traceId;assert.equal(api.canChooseExemplar(id,e.selectionToken,alt),false);api.setEnabled(true);await new Promise(setImmediate);
 assert.equal(api.canChooseExemplar(id,e.selectionToken,alt),true);assert.equal(api.canChooseExemplar(id,'old',alt),false);assert.equal(calls,0);allowed=false;assert.equal(api.canChooseExemplar(id,e.selectionToken,alt),false);allowed=true;api.openHistory([{at:f.at}],0);assert.equal(api.canChooseExemplar(id,e.selectionToken,alt),false);api.setEnabled(false);assert.deepEqual(plain(api.snapshot().map),{});api.destroy();
});

test('selected canonical traces map normal, slow, error, partial and queue evidence to exact node/edge IDs',async()=>{
 const f=await (await import('./helpers/canon-trace-evidence.mjs')).canonTraceFixture(),d=f.spec.page.sections[0].diagram;
 const map=name=>C.telemetryTraceModel(d,null,C.telemetryTraceEnvelope(f.alternatives[f.ids[name]]));
 assert.equal(map('happy').nodes.database[0].tone,'observed');
 assert.equal(map('database-slow').nodes.database[0].tone,'warning');assert.equal(map('database-slow').nodes.database[0].duration,900);assert.equal(map('database-slow').nodes.database[0].budget,150);
 assert.equal(map('service-error').nodes.cloud[0].tone,'error');assert.equal(map('partial').nodes.database[0].tone,'unknown');assert.equal(map('backpressure').nodes.queue[0].tone,'warning');
 assert.equal(map('database-slow').edges['cloud->database'][0].duration,900);
});
test('ambiguous and unavailable traces never produce timed edge annotations or inferred node joins',async()=>{
 const f=structuredClone(await story()),d=f.spec.page.sections[0].diagram,e=f.samples['mcu->ingest'].exemplars[0];
 let m=C.telemetryTraceModel(d,'event',e);assert.ok(m.nodes.ingest);assert.equal(m.nodes.app,undefined);
 d.steps.push({...structuredClone(d.steps[0]),id:'duplicate'});d.paths[0].steps.push('duplicate');m=C.telemetryTraceModel(d,'event',e);assert.equal(m.nodes.ingest[0].tone,'unknown');assert.equal(m.edges['mcu->ingest'],undefined);
 e.spans=[];m=C.telemetryTraceModel(d,'event',e);assert.deepEqual(plain(m.nodes),{});assert.deepEqual(plain(m.edges),{});assert.match(m.warning,/timeline unavailable/);
});

// Span focus resolves source registries, including steps hidden by a view. It
// never infers navigation from a service title, an edge, or declaration order.
test('span choices preserve shared current context and expose alternate-path ambiguity',async()=>{
 const f=structuredClone(await story()),d=f.spec.page.sections[0].diagram,e=f.samples['mcu->ingest'].exemplars[0];
 const span=C.telemetryTraceModel(d,'event',e).rows[0].spanIds[0];
 let choices=plain(C.telemetryTraceChoices(d,'event',e,span));assert.equal(choices.length,1);assert.equal(choices[0].pathId,'event');assert.equal(choices[0].sourceIndex,0);
 choices=plain(C.telemetryTraceChoices(d,'absent',e,span));assert.deepEqual(choices.map(c=>c.pathId),['event','short']);
 d.steps.push({...structuredClone(d.steps[0]),id:'alternate',text:'Alternative owner'});d.paths.push({id:'hidden',label:'Hidden path',steps:['alternate']});
 choices=plain(C.telemetryTraceChoices(d,'event',e,span));assert.deepEqual(choices.map(c=>c.stepId),['submit','alternate']);assert.equal(choices[1].sourceIndex,4);
 assert.deepEqual(plain(C.telemetryTraceChoices(d,'event',e,'not-a-span')),[]);
});
test('one ambiguous operation with concurrent spans still requires a choice',async()=>{
 const f=structuredClone(await story()),d=f.spec.page.sections[0].diagram,e=f.samples['mcu->ingest'].exemplars[0];
 const span=e.spans.find(s=>s.name==='POST /v1/events');e.spans.push({...structuredClone(span),id:'concurrent'});
 const choices=plain(C.telemetryTraceChoices(d,'event',e,span.id));assert.equal(choices.length,1);assert.equal(choices[0].row.status,'ambiguous');
});
