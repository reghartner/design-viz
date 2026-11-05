'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {entrypoint}=require('../tools/source-loader.cjs');
const C={URL,console,AbortController,TextEncoder,TextDecoder,setTimeout,clearTimeout,document:{hidden:false,addEventListener(){},removeEventListener(){}}};vm.runInNewContext(entrypoint('standalone').body,C);
const plain=x=>JSON.parse(JSON.stringify(x));let fixture;
async function story(){return fixture || (fixture=await (await import('./helpers/step-evidence.mjs')).stepFixture());}
function model(f,index=0,path='event',jiraOn=true){const d=f.spec.page.sections[0].diagram;return C.telemetryStepModel(d,index,path,f.spec.page,{map:f.samples}, {'TRACE-1':{state:'done'}},jiraOn);}
test('actual mock trace, source-scoped proof and original observation time; no fetched-clock age',async()=>{
 const f=await story(),m=model(f);assert.equal(m.primary,'mcu->ingest');assert.match(m.caption,/PROVEN/);assert.equal(m.trace.at,m.trace.exemplar.candidates.find(c=>c.traceId===m.trace.exemplar.traceId).time);assert.notEqual(m.trace.at,m.trace.exemplar.observedAt);assert.equal(m.trace.packets[0].startMs,0);assert.ok(m.trace.never.some(s=>s.stepId==='push'));assert.equal(model(f,3).trace,null);
 const short=model(f,0,'short');assert.equal(short.trace.never.length,0);assert.match(model(f,0,'event',false).caption,/HEALTHY/);
});
test('unavailable timeline retains identity but cannot assert missing spans or precise timing',async()=>{
 const f=structuredClone(await story()),e=f.samples['mcu->ingest'].exemplars[0];e.spans=[];e.completeness='unknown';
 const trace=model(f).trace;assert.equal(trace.exemplar.traceId,e.traceId);assert.equal(trace.mapping,null);assert.equal(trace.never.length,0);assert.equal(trace.packets.length,0);assert.match(trace.warning,/timeline unavailable/);
});
test('worst secondary verdict wins, while headline and exemplar stay on primary',async()=>{
 const f=structuredClone(await story()),d=f.spec.page.sections[0].diagram;d.steps[0].edges=['mcu->ingest','ingest->notify'];delete d.steps[0].edge;d.edges[1].tickets=['TRACE-1'];d.edges[1].telemetry.proof.rate={min:1};f.samples['ingest->notify'].signals.rate.value=0;f.samples['ingest->notify'].signals.rate.series=[];
 assert.match(model(f).caption,/DONE · UNPROVEN/);assert.equal(model(f).trace.primary,'mcu->ingest');
 d.edges[1].telemetry.proof.rate={max:1};f.samples['ingest->notify'].signals.rate.value=20;assert.match(model(f).caption,/DONE · DEGRADED/);
});
test('no display-name mapping, missing exact selectors, explicit selected path and duplicate IDs in other sections',async()=>{
 const f=structuredClone(await story()),d=f.spec.page.sections[0].diagram;f.spec.page.sections.push({diagram:{...structuredClone(d),steps:[{id:'submit',nodes:['app']}]}});
 assert.equal(model(f).trace.packets.length,1);delete d.steps[0].traceMatch;assert.equal(model(f).trace.packets.length,0);assert.equal(model(f).trace.mapping.steps[0].status,'unmapped');
 d.steps[0].traceMatch={serviceName:'Wrong service',operation:'POST /v1/events'};assert.equal(model(f).trace.packets.length,0);assert.equal(model(f).trace.mapping.steps[0].status,'missing');
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
