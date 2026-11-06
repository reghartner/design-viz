// Canonical authored diagram + existing fictional trace fixtures through the
// production envelope contract. Hex transport IDs and clock are fixture-only.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const hex=(value,n)=>createHash('sha256').update(value).digest('hex').slice(0,n);
const at='2026-10-30T00:00:00Z';
export async function canonTraceFixture(){
 const spec=JSON.parse(await readFile(new URL('../../examples/canon/specs/doorbell.json',import.meta.url),'utf8'));
 const d=spec.page.sections[0].diagram;d.autoplay=false;d.panels=[{id:'status',type:'live-status',title:'Status'}];d.steps.forEach(s=>{delete s.panels;if(s.traceMatch)delete s.traceMatch.panelId;});delete spec.page.views;delete spec.page.defaultView;delete d.layouts;delete d.defaultLayout;
 d.sectionLayout={columns:24,default:[{x:0,y:0,w:15,h:16},{controls:'steps',attachTo:'diagram',x:0,y:16,w:15,h:5},{panel:'status',x:15,y:0,w:9,h:21}]};
 spec.page.sections[0].id='main';spec.page.subtitle='Fictional canonical trace fixtures · no live account queries';spec.page.tracking={telemetry:{enabled:true}};
 d.edges[0].telemetry={kind:'call',signals:{trace:{tempo:'{ resource.service.name = "porch-hub" }'}}};
 const names=['happy','database-slow','service-error','partial','backpressure'],alternatives={},ids={};
 for(const name of names){
  const raw=JSON.parse(await readFile(new URL('../../examples/canon/traces/'+name+'.json',import.meta.url),'utf8')),traceId=hex(name,32);ids[name]=traceId;
  const spans=raw.spans.map(s=>({id:hex(s['trace.span_id'],16),parentId:s['trace.parent_id']?hex(s['trace.parent_id'],16):null,service:s['service.name'],name:s.name,startMs:s.startMs,ms:s.duration_ms,time:new Date(Date.parse(at)+s.startMs).toISOString(),error:s.error===true,attributes:Object.fromEntries(Object.entries(s).filter(([k])=>!['trace.trace_id','trace.span_id','trace.parent_id','service.name','name','startMs','duration_ms','links'].includes(k))),events:[],links:(s.links || []).map(l=>({traceId,spanId:hex(typeof l==='string'?l:l.spanId,16)}))}));
  alternatives[traceId]={version:1,provider:'tempo',traceId,signal:'trace',selectionToken:'canonical-fixture',selectionReason:'Fictional canonical fixture: '+name,observedAt:at,range:{from:'2026-10-29T00:00:00Z',to:at},completeness:name==='partial'?'partial':'unknown',warnings:['Fictional fixture replay; completeness is not established.'],candidates:[],spans};
 }
 const candidates=names.map(name=>({traceId:ids[name],time:at,status:name==='service-error'?'failing':'unknown',durationMs:Math.max(...alternatives[ids[name]].spans.map(s=>s.startMs+s.ms))}));
 Object.values(alternatives).forEach(e=>e.candidates=candidates);
 return {spec,samples:{'camera->hub':{signals:{},exemplars:[alternatives[ids.happy]]}},alternatives,ids,alternative:alternatives[ids['database-slow']],at,provenance:'Existing examples/canon/specs/doorbell.json and examples/canon/traces/*.json. Only fixture transport IDs/clock are adapted; selectors and span timing are preserved.'};
}
