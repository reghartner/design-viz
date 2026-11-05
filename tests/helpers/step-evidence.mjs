import {readFile} from 'node:fs/promises';
// Explicit fixture replay from actual shared mock handlers, never a live account.
import vm from 'node:vm';
import sourceLoader from '../../tools/source-loader.cjs';
import {createMockBridge,EVENT_QUERY} from './honeycomb-bridge.mjs';
export const AT='2026-10-30T00:00:00Z';
export async function stepFixture(){
 const bridge=createMockBridge({day:9}),timers=new Map();let serial=0;
 class Clock extends Date{static now(){return Date.parse(AT);}}
 const C={URL,AbortController,TextDecoder,TextEncoder,Date:Clock,console,setTimeout:(fn,ms)=>{timers.set(++serial,{fn,ms});return serial;},clearTimeout:id=>timers.delete(id),document:{hidden:false,addEventListener(){},removeEventListener(){}}};
 vm.runInNewContext(sourceLoader.entrypoint('standalone').body,C);
 const signal={honeycomb:{query_spec:{filters:[{column:'service.name',op:'=',value:'event-ingest'}]},raw_row_columns:['trace.trace_id','timestamp','error'],results_limit:20}};
 const binding={kind:'call',signals:{rate:{grafana:EVENT_QUERY,unit:'req/h'},trace:signal},proof:{rate:{min:1}}};
 const d={view:'step',autoplay:false,nodes:{mcu:{title:'Doorbell firmware'},ingest:{title:'Event ingest'},notify:{title:'Notification service'},app:{title:'Resident app'}},rows:[['mcu','ingest','notify','app']],
  edges:[{from:'mcu',to:'ingest',label:'Submit event',tickets:['TRACE-1'],telemetry:binding},{from:'ingest',to:'notify',label:'Publish',telemetry:structuredClone(binding)},{from:'notify',to:'app',label:'Push',telemetry:structuredClone(binding)}],
  panels:[{id:'status',type:'live-status',title:'Status'}],steps:[
   {id:'submit',text:'Submit the doorbell event',edge:'mcu->ingest',traceMatch:{serviceName:'event-ingest',operation:'POST /v1/events',nodeId:'ingest'}},
   {id:'publish',text:'Publish the event',edge:'ingest->notify',traceMatch:{serviceName:'event-ingest',operation:'device-events publish',parentStepId:'submit'}},
   {id:'push',text:'Push to the resident app',edge:'notify->app',traceMatch:{serviceName:'notify',operation:'push notification'}},
   {id:'unbound',text:'No telemetry on this step',nodes:['app']}],paths:[{id:'event',label:'Doorbell event',steps:['submit','publish','push','unbound']},{id:'short',label:'Event only',steps:['submit','unbound']}]};
 const spec={page:{title:'Trace evidence · shared mock story fixture',subtitle:'Fictional recorded fixture; no live account queries',tracking:{jira:{site:'https://jira.test'},telemetry:{honeycomb:{environment:'flowview-demo',dataset:'doorbell'},grafana:{prometheus:'prom-main'}}},sections:[{id:'main',heading:'Doorbell request · explicit traceMatch',diagram:d}]}};
 const p=C.normalize(spec.page),adapter=C.createTelemetryProviders(p,{claude:{use:async()=>bridge}});
 const api=C.createTelemetry(p,adapter.options,{carriers:fn=>p.sections[0].diagram.edges.forEach(e=>fn(e,e.from+'->'+e.to,p))});
 const handle=adapter.attach({telemetry:api,liveStatus:{onDestroy:()=>()=>{}}},p);
 for(let i=0;i<25;i++)await new Promise(setImmediate);api.setEnabled(true);for(let i=0;i<40;i++)await new Promise(setImmediate);
 const samples=JSON.parse(JSON.stringify(api.snapshot().map)),first=samples['mcu->ingest'].exemplars[0],passing=first.candidates.find(c=>c.status==='passing' && c.traceId!==first.traceId);
 const alternative=passing?await api.chooseExemplar('mcu->ingest',first.selectionToken,passing.traceId):null;
 handle.destroy();api.destroy();
 return {spec,samples,alternative:alternative && JSON.parse(JSON.stringify(alternative)),at:AT,provenance:'Actual checked-in Honeycomb/Grafana mock handlers, shared story day 10; explicit authored traceMatch, not inferred bindings.'};
}

export async function recordedUrlEvidence(){
 const C={URL,TextEncoder,TextDecoder};vm.runInNewContext(sourceLoader.entrypoint('standalone').body,C);
 const traceId='8413cd87a9f15b6bfe8e1acf5b3346d0',text=await readFile(new URL('../fixtures/provider-traces/honeycomb-trace.txt',import.meta.url),'utf8');
 const trace=C.telemetryHoneycombTrace({payload:text},traceId);
 return JSON.parse(JSON.stringify(C.telemetryTraceEnvelope({version:1,provider:'honeycomb',traceId,signal:'trace',selectionToken:'recorded-fixture',selectionReason:'Recorded official trace fixture',observedAt:'2026-10-12T06:34:09Z',range:{from:'2026-10-12T00:34:09Z',to:'2026-10-12T06:34:09Z'},candidates:[{traceId,status:'unknown'}],...trace})));
}
