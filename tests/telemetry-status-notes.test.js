'use strict';
// #1152: the Metrics status note names Tempo trace search only for a board with
// a tempo signal, and several notes read as sentences (no ".;").
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {entrypoint}=require('../tools/source-loader.cjs');
const settle=async()=>{for(let i=0;i<20;i++)await new Promise(setImmediate);};
const rawQuery=()=>({query_spec:{filters:[{column:'service.name',op:'=',value:'event-ingest'}]},raw_row_columns:['trace.trace_id','timestamp','error'],results_limit:20});
function context(){class Clock extends Date{static now(){return Date.parse('2026-10-30T00:00:00Z');}}const C={URL,AbortController,TextDecoder,TextEncoder,Date:Clock,console,setTimeout:()=>0,clearTimeout:()=>{},document:{hidden:false,addEventListener(){},removeEventListener(){}}};vm.runInNewContext(entrypoint('standalone').body,C);return C;}
// The host offers Grafana only, and its Grafana lacks search_tempo_traces.
async function grafanaHost(signals){
 const {createMockBridge,EVENT_QUERY}=await import('./helpers/honeycomb-bridge.mjs'),bridge=createMockBridge({day:9}),C=context(),list=bridge.listTools,call=bridge.callTool;
 bridge.listTools=async()=>(await list()).filter(s=>s.server==='Grafana').map(s=>({...s,tools:s.tools.filter(t=>t.name!=='search_tempo_traces')}));
 bridge.callTool=async(server,name,args)=>{if(JSON.stringify(args).includes('broken_metric'))throw Object.assign(new Error('parse error.'),{code:'tool_error'});return call(server,name,args);};
 const page={tracking:{telemetry:{honeycomb:{environment:'flowview-demo',dataset:'doorbell'},grafana:{tempo:'tempo-main',prometheus:'prom-main'}}},sections:[{id:'main',diagram:{nodes:{a:{telemetry:{kind:'service',signals:{rate:{grafana:EVENT_QUERY},...signals}}}},rows:[['a']]}}]};
 const p=C.normalize(page),win={claude:{use:async name=>name==='permissions'?{request:async names=>Object.fromEntries(names.map(n=>[n,'granted']))}:bridge}},adapter=C.createTelemetryProviders(p,win);
 const api=C.createTelemetry(p,adapter.options,{carriers:fn=>C.sectionRecords(p).forEach(r=>{const d=r.section.diagram||{};Object.keys(d.nodes||{}).forEach(id=>fn(d.nodes[id],id,p));})});
 const handle=adapter.attach({telemetry:api,liveStatus:{onDestroy:()=>()=>{}}},p);await settle();api.setEnabled(true);await settle();
 return {api,close(){handle.destroy();api.destroy();}};
}
test('Honeycomb trace bindings on a Grafana host without search_tempo_traces show no Tempo note',async t=>{
 const h=await grafanaHost({trace:{honeycomb:rawQuery()}});t.after(()=>h.close());
 assert.ok(h.api.snapshot().map.a.signals.rate.value>0,JSON.stringify(h.api.status()));
 assert.equal(h.api.status().note,'');
});
test('a tempo signal on that host shows "Tempo trace search is not connected."',async t=>{
 const h=await grafanaHost({trace:{tempo:'{ resource.service.name = "event-ingest" }'}});t.after(()=>h.close());
 assert.ok(h.api.snapshot().map.a.signals.rate.value>0,JSON.stringify(h.api.status()));
 assert.equal(h.api.status().note,'Tempo trace search is not connected.');
});
test('three notes join as sentences without ".;"',async t=>{
 const {nativeQuery}=await import('./helpers/honeycomb-bridge.mjs');
 const h=await grafanaHost({zero:{honeycomb:nativeQuery('a')},broken:{grafana:'sum(rate(broken_metric[5m]))'},trace:{tempo:'{ resource.service.name = "event-ingest" }'}});t.after(()=>h.close());
 const note=h.api.status().note;
 assert.doesNotMatch(note,/\.;/);
 assert.equal(note,'Honeycomb unavailable. Tempo trace search is not connected. 1 Grafana query failed: a broken: parse error.');
});
