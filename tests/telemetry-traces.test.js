'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {entrypoint}=require('../tools/source-loader.cjs');
const plain=x=>JSON.parse(JSON.stringify(x)),settle=async()=>{for(let i=0;i<20;i++)await new Promise(setImmediate);};
const fixture=name=>fs.readFileSync('tests/fixtures/provider-traces/'+name,'utf8');
const traceText=fixture('honeycomb-trace.txt'),candidateText=fixture('honeycomb-candidates.txt'),recordedId='8413cd87a9f15b6bfe8e1acf5b3346d0';
const rawQuery=()=>({query_spec:{filters:[{column:'service.name',op:'=',value:'event-ingest'}]},raw_row_columns:['trace.trace_id','timestamp','error'],results_limit:20});
const binding=(source='honeycomb')=>({kind:'service',signals:{trace:source==='tempo'?{tempo:'{ resource.service.name = "event-ingest" }'}:{honeycomb:rawQuery()}}});
const pageSpec=(source='honeycomb')=>({tracking:{telemetry:{honeycomb:{environment:'flowview-demo',dataset:'doorbell'},grafana:{tempo:'tempo-main',prometheus:'prom-main'}}},sections:[{id:'main',diagram:{nodes:{a:{telemetry:binding(source)}},rows:[['a']]}}]});
function context(clock){const timers=new Map();let serial=0;class Clock extends Date{constructor(...args){if(clock && !args.length)super(clock.now);else super(...args);}static now(){return clock?clock.now:Date.parse('2026-10-30T00:00:00Z');}}const C={URL,AbortController,TextDecoder,TextEncoder,Date:Clock,console,setTimeout:(fn,ms)=>{timers.set(++serial,{fn,ms});return serial;},clearTimeout:id=>timers.delete(id),document:{hidden:false,addEventListener(){},removeEventListener(){}}};vm.runInNewContext(entrypoint('standalone').body,C);return {C,timers};}
async function setup({page=pageSpec(),transport,wrap,host=false,hosted=false,permission='granted',spyTraces,clock}={}){
 const {createMockBridge}=await import('./helpers/honeycomb-bridge.mjs'),bridge=createMockBridge({day:9,transport}),{C,timers}=context(clock);if(wrap)wrap(bridge);
 // #1289: a test can hold the Traces adapter and the facade the providers hand it.
 if(spyTraces){const create=C.createTelemetryTraces;C.createTelemetryTraces=(...args)=>{const adapter=create(...args);if(adapter){const attach=adapter.attach;adapter.attach=(next,nextPage)=>{spyTraces.adapter=adapter;spyTraces.facade=next.telemetry;return attach(next,nextPage);};}return adapter;};}
 let permissions=[];
 if(hosted){const list=bridge.listTools;bridge.listTools=async()=>{const servers=await list();return servers.map(s=>({...s,tools:s.tools.map(t=>({name:t.name,description:t.description,annotations:t.annotations}))}));};bridge.describeTool=async(server,name)=>{const servers=await list();return servers.find(s=>s.server===server).tools.find(t=>t.name===name);};}
 const p=C.normalize(page),win={claude:{use:async name=>name==='permissions'?{request:async names=>{permissions.push(...names);return Object.fromEntries(names.map(n=>[n,typeof permission==='function'?permission(n):permission]));}}:bridge}},adapter=host?null:C.createTelemetryProviders(p,win);
 const api=C.createTelemetry(p,host?false:adapter?.options||false,{carriers:fn=>C.sectionRecords(p).forEach(r=>{const d=r.section.diagram||{};Object.keys(d.nodes||{}).forEach(id=>fn(d.nodes[id],id,p));(d.edges||[]).forEach(e=>fn(e,e.from+'->'+e.to,p));})});
 const handle=adapter?.attach({telemetry:api,liveStatus:{onDestroy:()=>()=>{}}},p);await settle();return {C,p,win,api,bridge,adapter,timers,permissions,close(){handle?.destroy();api.destroy();}};
}
function envelope(C,trace=C.telemetryHoneycombTrace({payload:traceText},recordedId)){
 return C.telemetryTraceEnvelope({version:1,provider:'honeycomb',traceId:recordedId,signal:'trace',selectionToken:'test-token',selectionReason:'actual returned match',observedAt:'2026-10-12T06:34:09Z',range:{from:'2026-10-12T00:34:09Z',to:'2026-10-12T06:34:09Z'},candidates:[{traceId:recordedId,status:'unknown'}],...trace});
}
test('official recorded candidates and trace: precision, collapsed metadata, safe public links',()=>{
 const {C}=context(),c=C.telemetryHoneycombCandidates({payload:candidateText});assert.equal(c.candidates.length,8);assert.equal(c.candidates[5].traceId,recordedId);assert.equal(c.candidates[5].time,'2026-10-12T04:33:06.602552834Z');assert.equal(c.candidates[0].durationMs,undefined);assert.equal(C.telemetryTraceSelect(c.candidates).reason,'latest among returned matches');
 const v=envelope(C);assert.equal(v.spans.length,55);assert.equal(v.completeness,'partial');assert.equal(v.spans[1].startMs,4640.718592);assert.equal(v.spans[0].ms,4650.643585);assert.match(v.url,/ui.honeycomb.io/);assert.ok(!JSON.stringify(v).includes('query_results'));assert.equal(v.spans[0].attributes['http.route'],'/cart/checkout');
});
test('synthetic nanosecond negative variants: malformed time, mismatched ID, huge payload fail',()=>{const {C}=context();assert.throws(()=>C.telemetryHoneycombTrace({payload:traceText},'0'.repeat(32)),/differs/);for(const s of [traceText.replace('1791779586602194688','oops'),traceText.replace('4650643585','-1'),'x'.repeat(1048577)])assert.throws(()=>C.telemetryHoneycombTrace({payload:s},recordedId));});
test('duplicate IDs, parent cycles and invalid normalized times fail; missing parents warn',()=>{const {C}=context(),v=plain(envelope(C));for(const alter of [x=>x.spans.push(x.spans[0]),x=>x.spans[0].parentId=x.spans[1].id,x=>x.spans[0].ms=-1,x=>x.spans[0].startMs=NaN,x=>x.spans[0].time='invalid']){const x=structuredClone(v);alter(x);assert.throws(()=>C.telemetryTraceEnvelope(x));}v.spans[0].parentId='a'.repeat(16);assert.ok(C.telemetryTraceEnvelope(v).warnings.includes('Missing parent spans.'));});
test('unknown completeness, annotation rows and >200 spans never silently complete',()=>{const {C}=context();const unknown=traceText.replace(/  (?:total_spans|visible_spans|collapsed_nodes|view_mode):.*\n/g,'').replaceAll('| true |','| false |');assert.equal(C.telemetryHoneycombTrace({payload:unknown},recordedId).completeness,'unknown');const annotation=traceText.replace('| /cart/checkout |  |  |  | 0 |','| /cart/checkout | log |  |  | 0 |');const v=C.telemetryHoneycombTrace({payload:annotation},recordedId);assert.equal(v.spans.length,54);assert.ok(v.warnings.some(w=>/Annotation/.test(w)));
 const lines=traceText.split('\n'),row=lines[2];const huge=[lines[0],lines[1],...Array.from({length:201},(_,i)=>row.replace('dbd662d250034c44',i.toString(16).padStart(16,'0'))),'','Metadata:',`  trace_id: ${recordedId}`].join('\n');const out=C.telemetryHoneycombTrace({payload:huge},recordedId);assert.equal(out.spans.length,0);assert.equal(out.completeness,'partial');assert.match(out.warnings.join(' '),/200/);
});
test('bounds and allowlist survive sample normalization without changing numeric zero/history',()=>{const {C}=context(),v=plain(envelope(C));v.spans[0].attributes['auth.token']='private';const s=C.telemetrySample({signals:{rate:{value:0}},exemplars:[v]});assert.equal(s.signals.rate.value,0);assert.equal(s.exemplars[0].spans[0].attributes['auth.token'],undefined);assert.ok(!C.telemetryHistoryDay({a:s},{at:v.observedAt}).a);assert.deepEqual(plain(C.telemetrySample({exemplars:[{...v,provider:'invented'}]}).exemplars),[]);assert.throws(()=>C.telemetryTraceCandidates(Array.from({length:21},()=>({traceId:recordedId,status:'unknown'}))),/Too many/);});
for(const source of ['honeycomb','tempo'])for(const transport of ['structuredContent','payload'])test(`actual mock ${source}/${transport}: trace-only discovery and one cached initial fetch`,async t=>{
 const h=await setup({page:pageSpec(source),transport});t.after(()=>h.close());assert.equal(h.api.enabled(),false);assert.equal(h.api.snapshot().available,true);assert.equal(h.bridge.calls.length,0);h.api.setEnabled(true);await settle();let s=h.api.snapshot();assert.equal(s.map.a?.exemplars?.length,1,JSON.stringify(s.status));const e=s.map.a.exemplars[0];assert.equal(e.provider,source);assert.equal(Object.keys(s.map.a.signals).length,0);assert.ok(e.spans.length>0);const get=source==='tempo'?'get_tempo_trace':'get_trace',search=source==='tempo'?'search_tempo_traces':'run_query';assert.equal(h.bridge.calls.filter(c=>c.name===get).length,1);assert.equal(h.bridge.calls.filter(c=>c.name===search).length,1);assert.equal(h.bridge.calls.find(c=>c.name===get).args.trace_id,e.traceId);assert.ok(!h.bridge.calls.some(c=>c.name==='get_query_results'));
 h.api.retry();await settle();h.api.snapshot();h.api.verdicts();assert.equal(h.bridge.calls.filter(c=>c.name===get).length,1);assert.equal(h.bridge.calls.filter(c=>c.name===search).length,1);
 const alternate=e.candidates.find(c=>c.traceId!==e.traceId);assert.ok(alternate);const callsBefore=h.bridge.calls.length;assert.equal(h.api.canChooseExemplar('a',e.selectionToken,alternate.traceId),true);assert.equal(h.api.canChooseExemplar('a','expired',alternate.traceId),false);assert.equal(h.bridge.calls.length,callsBefore);await h.api.chooseExemplar('a',e.selectionToken,alternate.traceId);assert.equal(h.bridge.calls.filter(c=>c.name===get).length,2);assert.equal(h.api.snapshot().map.a.exemplars[0].traceId,alternate.traceId);await h.api.chooseExemplar('a',e.selectionToken,alternate.traceId);assert.equal(h.bridge.calls.filter(c=>c.name===get).length,2);await assert.rejects(h.api.chooseExemplar('a',e.selectionToken,'f'.repeat(32)),/actual returned/);
 h.api.openHistory([{at:'2026-10-29T00:00:00Z'}],0);await settle();assert.equal(h.api.snapshot().map.a,undefined);await assert.rejects(h.api.chooseExemplar('a',e.selectionToken,e.traceId),/unavailable/);const count=h.bridge.calls.length;h.api.historyDay(0);h.api.snapshot();await settle();assert.equal(h.bridge.calls.length,count);h.api.closeHistory();await settle();assert.equal(h.bridge.calls.filter(c=>c.name===get).length,2);h.api.setEnabled(false);assert.deepEqual(plain(h.api.snapshot().map),{});assert.equal(h.timers.size,0);
});
test('mixed same-carrier numeric zero, both scalar providers and first authored trace selection',async t=>{
 const {nativeQuery,EVENT_QUERY}=await import('./helpers/honeycomb-bridge.mjs'),p=pageSpec();p.sections[0].diagram.nodes.a.telemetry.signals={rate:{grafana:EVENT_QUERY},zero:{honeycomb:nativeQuery('notify->app')},trace:{honeycomb:rawQuery()},other:{tempo:'{}'}};
 const h=await setup({page:p,wrap:b=>{b.day=11;}});t.after(()=>h.close());h.api.setEnabled(true);await settle();const s=h.api.snapshot();assert.equal(s.map.a.signals.zero.value,0);assert.ok(s.map.a.signals.rate.value>0);assert.equal(s.map.a.exemplars[0].provider,'honeycomb');assert.ok(!h.bridge.calls.some(c=>c.name==='search_tempo_traces'));assert.equal(h.bridge.calls.filter(c=>c.name==='run_query').length,2);
});
for(const which of ['page','host','missing','schema'])test(which+' disable keeps dependent trace control unavailable',async t=>{const p=pageSpec();if(which==='page')p.tracking.telemetry.enabled=false;const h=await setup({page:p,host:which==='host',wrap:b=>{const list=b.listTools;b.listTools=async()=>{const s=await list();if(which==='missing')s[1].tools=s[1].tools.filter(t=>t.name!=='get_trace');if(which==='schema')s[1].tools.find(t=>t.name==='get_trace').inputSchema.properties.trace_id.type='number';return s;};}});t.after(()=>h.close());assert.equal(h.api.snapshot().available,false);h.api.setEnabled(true);await settle();assert.equal(h.bridge.calls.length,0);if(which==='page'||which==='host')assert.equal(h.bridge.lists,0);});
test('tools removal and account change invalidate cached traces, keep healthy scalar peer unless account changed',async()=>{for(const mode of ['removed','account']){let changed=false;const {EVENT_QUERY}=await import('./helpers/honeycomb-bridge.mjs'),p=pageSpec();p.sections[0].diagram.nodes.a.telemetry.signals.rate={grafana:EVENT_QUERY};const h=await setup({page:p,wrap:b=>{const list=b.listTools;b.listTools=async()=>{if(changed&&mode==='account')throw {code:'user_changed'};const s=await list();if(changed&&mode==='removed')s[1].tools=s[1].tools.filter(t=>t.name!=='get_trace');return s;};}});h.api.setEnabled(true);await settle();assert.ok(h.api.snapshot().map.a?.exemplars,JSON.stringify(h.api.status()));const e=h.api.snapshot().map.a.exemplars[0];changed=true;h.api.retry();await settle();const s=h.api.snapshot();assert.equal(s.map.a?.exemplars,undefined);if(mode==='removed')assert.ok(s.map.a.signals.rate.value>0);else assert.equal(s.available,false);await assert.rejects(h.api.chooseExemplar('a',e.selectionToken,e.traceId));h.close();}});
for(const stop of ['off','destroy','rebind'])test(stop+' rejects late details and expires selection tokens',async t=>{let release;const h=await setup({wrap:b=>{const call=b.callTool;b.callTool=async(...args)=>{const value=await call(...args);if(args[1]==='get_trace')await new Promise(r=>release=r);return value;};}});t.after(()=>h.close());h.api.setEnabled(true);await settle();assert.ok(release,JSON.stringify({status:h.api.status(),calls:h.bridge.calls}));const oldRelease=release;if(stop==='destroy')h.close();else if(stop==='off')h.api.setEnabled(false);else {h.p.sections[0].diagram.nodes.a.telemetry.signals.trace.honeycomb.results_limit=1;h.api.bindingsChanged();await settle();}oldRelease();await settle();assert.equal(h.api.snapshot().map.a?.exemplars,undefined);if(stop==='rebind'){release();await settle();assert.equal(h.api.snapshot().map.a?.exemplars[0].candidates.length,1);}});
test('schema string query_spec honored; fields remain top-level and no fake polling',async t=>{const h=await setup({wrap:b=>{const list=b.listTools,call=b.callTool;b.listTools=async()=>{const s=await list();s[1].tools.find(t=>t.name==='run_query').inputSchema.properties.query_spec.type='string';return s;};b.callTool=async(s,n,a)=>call(s,n,n==='run_query'?{...a,query_spec:JSON.parse(a.query_spec)}:a);}});t.after(()=>h.close());h.api.setEnabled(true);await settle();assert.ok(h.api.snapshot().map.a?.exemplars[0],JSON.stringify(h.api.status()));const args=h.bridge.calls.find(c=>c.name==='run_query').args;assert.equal(args.query_spec.from,'-24h');assert.deepEqual(args.raw_row_columns,rawQuery().raw_row_columns.filter(c=>c!=='timestamp'));assert.ok(rawQuery().raw_row_columns.includes('timestamp'));assert.equal(args.query_spec.raw_row_columns,undefined);});
for(const nested of [false,true])for(const source of ['honeycomb','tempo'])test((nested?'nested':'direct')+' imported nodes/edges and local nodes share '+source+' relative window behavior',async t=>{const {C}=context(),spec=(id,diagram)=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},sections:[{diagram}]}}),b=binding(source);const provider=spec('provider',{nodes:{api:{telemetry:b},store:{}},rows:[['api','store']],edges:[{from:'api',to:'store',telemetry:b}],topologyExports:{core:{nodes:['api','store'],edges:['api->store']}}});const mid=spec('middle',{nodes:{},rows:[],topologyImports:[{spec:'provider',export:'core',as:'shared'}],topologyExports:{nested:{nodes:['shared::api','shared::store'],edges:['shared::api->shared::store']}}});const consumer=spec('consumer',{nodes:{local:{telemetry:b}},rows:[['local']],topologyImports:[nested?{spec:'middle',export:'nested',as:'outer'}:{spec:'provider',export:'core',as:'shared'}]});consumer.page.tracking=pageSpec(source).tracking;consumer.page.tracking.telemetry.window=nested?' now-6h ':'-6h';const authored=JSON.stringify(consumer);const h=await setup({page:C.FlowTopology.resolveSource(consumer,{version:1,id:'consumer',specs:[provider,mid,consumer]})});t.after(()=>h.close());h.api.setEnabled(true);await settle();const prefix=nested?'outer::shared::':'shared::';for(const id of ['local',prefix+'api',prefix+'api->'+prefix+'store'])assert.ok(h.api.snapshot().map[id]?.exemplars[0],JSON.stringify(h.api.status()));const search=source==='tempo'?'search_tempo_traces':'run_query',detail=source==='tempo'?'get_tempo_trace':'get_trace';
 const queries=h.bridge.calls.filter(c=>c.name===search||c.name===detail);assert.equal(queries.length,6);
 for(const call of queries){
  if(source==='tempo'){assert.equal(call.args.start,'2026-10-29T18:00:00.000Z');assert.equal(call.args.end,'2026-10-30T00:00:00.000Z');}
  else assert.equal(call.name===search?call.args.query_spec.from:call.args.from,'-6h');
 }
 for(const id of ['local',prefix+'api',prefix+'api->'+prefix+'store']){const range=h.api.snapshot().map[id].exemplars[0].range;assert.equal(Date.parse(range.from),Date.parse('2026-10-29T18:00:00Z'));assert.equal(Date.parse(range.to),Date.parse('2026-10-30T00:00:00Z'));}
 assert.equal(JSON.stringify(consumer),authored,'trace lookbacks do not rewrite authored source');
});
test('official Grafana source fixture preserves exact timing, events; synthetic partial/links survive structured form',()=>{const {C}=context(),raw=JSON.parse(fixture('grafana-source-test.json')),r=C.telemetryTempoTrace({payload:raw},raw.traceId);assert.equal(r.spans[0].ms,125);assert.equal(r.spans[1].startMs,20);assert.equal(r.spans[0].error,true);assert.equal(r.spans[0].events[0].attributes['exception.type'],'PaymentTimeout');assert.equal(r.completeness,'unknown');
 const partial={...raw,partial:true,message:'trace exceeded max bytes'};assert.equal(C.telemetryTempoTrace({payload:partial},raw.traceId).completeness,'partial');assert.ok(C.telemetryTempoTrace({payload:partial},raw.traceId).warnings.includes(partial.message));
 raw.services[0].spans[0].links=[{traceId:'a'.repeat(32),spanId:'b'.repeat(16),attributes:{'rpc.method':'publish',password:'drop'}}];const structured={traceId:raw.traceId,grafanaUrl:'https://grafana.example.com/explore?provided=1',spans:raw.services[0].spans.map(p=>({...p,id:p.spanId,parentId:p.parentSpanId,serviceName:'checkout'}))};delete structured.spans[0].links;
 const combined=C.telemetryTempoTrace({structuredContent:JSON.parse(JSON.stringify(structured)),content:[{type:'text',text:JSON.stringify(raw)}]},raw.traceId);assert.equal(combined.spans[0].links.length,1);assert.equal(combined.url,structured.grafanaUrl);assert.throws(()=>C.telemetryTempoTrace({payload:raw},'c'.repeat(32)),/differs/);
});
test('returned ID mismatch fails closed while scalar peer survives; no signed error leakage',async t=>{const {EVENT_QUERY}=await import('./helpers/honeycomb-bridge.mjs'),p=pageSpec();p.sections[0].diagram.nodes.a.telemetry.signals.rate={grafana:EVENT_QUERY};const h=await setup({page:p,wrap:b=>{const call=b.callTool;b.callTool=async(...args)=>{const result=await call(...args);if(args[1]==='get_trace')result.content[0].text=result.content[0].text.replace(/  trace_id: .*/, '  trace_id: "'+ 'f'.repeat(32)+'"');return result;};}});t.after(()=>h.close());h.api.setEnabled(true);await settle();assert.ok(h.api.snapshot().map.a.signals.rate.value>0);assert.equal(h.api.snapshot().map.a.exemplars,undefined);assert.match(h.api.status().note,/Returned trace ID differs/);});
test('failed scalar cannot clobber healthy trace and passing alternative is an actual returned status',async t=>{const {nativeQuery}=await import('./helpers/honeycomb-bridge.mjs'),p=pageSpec();p.sections[0].diagram.nodes.a.telemetry.signals.bad={honeycomb:nativeQuery('does-not-exist')};const h=await setup({page:p});t.after(()=>h.close());h.api.setEnabled(true);await settle();const e=h.api.snapshot().map.a.exemplars[0];assert.equal(h.api.snapshot().map.a.signals.bad,undefined);const passing=e.candidates.find(c=>c.status==='passing'&&c.traceId!==e.traceId);assert.ok(passing);const chosen=await h.api.chooseExemplar('a',e.selectionToken,passing.traceId);assert.equal(chosen.traceId,passing.traceId);assert.ok(chosen.spans.every(s=>!s.error));});
test('rebinding then off/on cannot reuse an old selection token',async t=>{const h=await setup();t.after(()=>h.close());h.api.setEnabled(true);await settle();const old=h.api.snapshot().map.a.exemplars[0];h.p.sections[0].diagram.nodes.a.telemetry.signals.trace.honeycomb.results_limit=1;h.api.bindingsChanged();await settle();const current=h.api.snapshot().map.a.exemplars[0];assert.notEqual(current.selectionToken,old.selectionToken);await assert.rejects(h.api.chooseExemplar('a',old.selectionToken,current.traceId),/expired/);const searches=h.bridge.calls.filter(c=>c.name==='run_query').length;h.api.setEnabled(false);h.api.setEnabled(true);await settle();
 // #1289 review c2: on again within 5 minutes reuses the answer, its example trace included, under a fresh token; the old token is dead.
 const reused=h.api.snapshot().map.a?.exemplars?.[0];assert.ok(reused,'the reused answer keeps its example trace');assert.equal(reused.traceId,current.traceId);assert.notEqual(reused.selectionToken,current.selectionToken);
 assert.equal(h.api.canChooseExemplar('a',current.selectionToken,current.traceId),false);assert.equal(h.bridge.calls.filter(c=>c.name==='run_query').length,searches,'no new trace search');});
test('latest candidate ordering preserves sub-millisecond timestamps; conflicting complete/collapsed flags stay partial',()=>{const {C}=context(),c=[{traceId:'a'.repeat(32),time:'2026-10-12T00:00:00.000000001Z',status:'unknown'},{traceId:'b'.repeat(32),time:'2026-10-12T00:00:00.000000002Z',status:'unknown'}];assert.equal(C.telemetryTraceSelect(c).candidate.traceId,c[1].traceId);const conflict=traceText.replace('collapsed_nodes: 1','collapsed_nodes: 0').replace('total_spans: 77','total_spans: 55').replace('view_mode: auto','view_mode: full');assert.equal(C.telemetryHoneycombTrace({payload:conflict},recordedId).completeness,'partial');});
test('oversize source with duplicate spans fails before display limit; missing raw wrapper fields do not query',async t=>{const {C}=context(),lines=traceText.split('\n'),duplicate=[lines[0],lines[1],...Array(201).fill(lines[2]),'','Metadata:',`  trace_id: ${recordedId}`].join('\n');assert.throws(()=>C.telemetryHoneycombTrace({payload:duplicate},recordedId),/Duplicate/);const p=pageSpec();delete p.sections[0].diagram.nodes.a.telemetry.signals.trace.honeycomb.results_limit;const h=await setup({page:p});t.after(()=>h.close());h.api.setEnabled(true);await settle();assert.equal(h.bridge.calls.length,0);assert.equal(h.api.snapshot().available,false);});
test('synthetic 1ns boundary catches epoch-before-subtraction precision loss',()=>{const {C}=context();const variant=traceText.replace('1791779586602194688','1791779586602194689').replace('1791779591242913280','1791779586602194690');const spans=C.telemetryHoneycombTrace({payload:variant},recordedId).spans;assert.equal(spans[1].startMs,0.000001);});
test('explicit asynchronous alternatives are bounded and the latest action wins',async t=>{let gates=[],hold=false;const h=await setup({wrap:b=>{const call=b.callTool;b.callTool=async(...args)=>{const result=await call(...args);if(hold&&args[1]==='get_trace')await new Promise(r=>gates.push(r));return result;};}});t.after(()=>h.close());h.api.setEnabled(true);await settle();const e=h.api.snapshot().map.a.exemplars[0],alts=e.candidates.filter(c=>c.traceId!==e.traceId);hold=true;const first=h.api.chooseExemplar('a',e.selectionToken,alts[0].traceId);const rejected=assert.rejects(first,/replaced/);await settle();const last=h.api.chooseExemplar('a',e.selectionToken,alts[1].traceId);await settle();assert.equal(gates.length,2);gates[1]();await last;gates[0]();await rejected;assert.equal(h.api.snapshot().map.a.exemplars[0].traceId,alts[1].traceId);assert.equal(h.bridge.calls.filter(c=>c.name==='get_trace').length,3);});
test('metadata account change during initial discovery retires cleanly',async t=>{const h=await setup({wrap:b=>{b.listTools=async()=>{throw {code:'user_changed'};};}});t.after(()=>h.close());assert.equal(h.api.snapshot().available,false);assert.equal(h.bridge.calls.length,0);});
test('native host bundle carries validated exemplars without provider networking',()=>{const {C}=context(),value=plain(envelope(C)),N={URL,AbortController,TextEncoder,TextDecoder,setTimeout,clearTimeout,document:{addEventListener(){},removeEventListener(){}}};vm.runInNewContext(entrypoint('native').source,N);assert.equal(typeof N.createTelemetryTraces,'undefined');assert.equal(typeof N.telemetryTraceEnvelope,'function');const sample=N.telemetrySample({signals:{zero:{value:0}},exemplars:[value]});assert.equal(sample.exemplars[0].traceId,recordedId);assert.equal(sample.signals.zero.value,0);const history=N.telemetryHistoryDay({a:sample},{at:value.observedAt});assert.equal(history.a,undefined);});
test('adding trace evidence cannot change measured-zero numeric Proof classification',()=>{const {C}=context(),p=C.normalize(pageSpec()),node=p.sections[0].diagram.nodes.a;node.telemetry.signals.zero={honeycomb:{calculations:[{op:'COUNT'}]}};node.telemetry.proof={zero:{max:0}};const sample={signals:{zero:{value:0}}};const input=map=>C.telemetryProofInput(fn=>fn(node,'a',p),()=>{}, {},map);const before=C.proofVerdicts(input({a:sample}));const after=C.proofVerdicts(input({a:{...sample,exemplars:[envelope(C)]}}));assert.deepEqual(plain(after),plain(before));});

test('native Tempo operational attributes survive envelopes and canonical explicit retry/attribute mapping',async()=>{
 const {normalizeTrace,mapTrace}=await import('../tools/canon/traces.mjs'),{C}=context();
 // Synthetic operational variant of the pinned native source fixture, not a recorded account trace.
 const raw=JSON.parse(fixture('grafana-source-test.json')),svc=raw.services[0];
 Object.assign(svc.resource,{'service.namespace':'orders','service.version':'v2','deployment.environment':'legacy','auth.token':'drop'});
 const operational={'retry.attempt':1,'flow.delivery_failed':true,'flow.backpressure':true,'flow.step.id':'dispatch','queue.depth':15,'messaging.queue.depth':20,'messaging.message.age_ms':500,'db.system.name':'postgresql','http.response.status_code':503};
 svc.spans[1].attributes={...operational,'request.body':'drop','auth.token':'drop','user.id':'drop','exception.stacktrace':'drop'};
 svc.spans.push({...svc.spans[1],spanId:'2222222222222222',startTimeMs:svc.spans[1].startTimeMs+70,attributes:{...svc.spans[1].attributes,'retry.attempt':2}});
 const check=result=>{
  const parsed=C.telemetryTempoTrace(result,raw.traceId),e=C.telemetryTraceEnvelope({...plain(envelope(C)),provider:'tempo',traceId:raw.traceId,candidates:[{traceId:raw.traceId,status:'unknown'}],...parsed});
  for(const [k,v] of Object.entries(operational))assert.equal(e.spans[1].attributes[k],v,k);
  assert.equal(e.spans[1].attributes['deployment.environment.name'],'production');
  for(const k of ['request.body','auth.token','user.id','exception.stacktrace'])assert.equal(e.spans[1].attributes[k],undefined);
  const trace=normalizeTrace({traceId:e.traceId,spans:e.spans.map(s=>({...s,serviceName:s.service,durationMs:s.ms}))});
  assert.equal(trace.context.environment,'production');assert.equal(trace.context.versions['orders/checkout'],'v2');
  const diagram={steps:[{id:'retry',traceMatch:{serviceName:'checkout',operation:'authorize',namespace:'orders',attributes:{'flow.step.id':'dispatch'},repeat:'attempts',maxQueueDepth:10,maxDurationMs:40}}]};
  const mapping=mapTrace(diagram,trace).steps[0];assert.equal(mapping.status,'matched');
  for(const kind of ['retry','delivery-failed','backpressure','queue-buildup','database-slow'])assert.ok(mapping.conditions.some(c=>c.kind===kind),kind);
  assert.equal(mapping.conditions.find(c=>c.kind==='retry').attempts,2);
  // Negative controls exercise the existing mapper: no retry metadata means ambiguity;
  // an explicit attribute mismatch must never map the spans by name alone.
  const noAttempts=structuredClone(trace);noAttempts.spans.forEach(s=>delete s.attributes['retry.attempt']);assert.equal(mapTrace(diagram,noAttempts).steps[0].status,'ambiguous');
  diagram.steps[0].traceMatch.attributes['flow.step.id']='different';assert.equal(mapTrace(diagram,trace).steps[0].status,'missing');
 };
 check({payload:raw});
 const structured={traceId:raw.traceId,spans:svc.spans.map(p=>({...p,id:p.spanId,parentId:p.parentSpanId,serviceName:svc.serviceName,attributes:{...Object.fromEntries(Object.entries(svc.resource).map(([k,v])=>['resource.'+k,v])),...p.attributes}}))};
 check({structuredContent:plain(structured),content:[{type:'text',text:JSON.stringify(raw)}]});
 structured.spans[1].attributes['deployment.environment.name']='span-env';assert.equal(C.telemetryTempoTrace({payload:plain(structured)},raw.traceId).spans[1].attributes['deployment.environment.name'],'span-env');
});
test('synthetic Honeycomb link row reports unsupported ownership without inventing relationships',()=>{
 const {C}=context(),variant=traceText.replace('| /cart/checkout |  |  |  | 0 |','| /cart/checkout | link | aaaaaaaaaaaaaaaa | bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb | 0 |');
 assert.notEqual(variant,traceText);const parsed=C.telemetryHoneycombTrace({payload:variant},recordedId);
 assert.match(parsed.warnings.join(' '),/link-row ownership is unverified/);assert.ok(parsed.spans.every(s=>s.links.length===0 && s.attributes['retry.attempt']===undefined));
});

test('combined provider clocks, totals, raw bucket starts and trace receipt stay independent through ratio Activity and history',()=>{
 const {C}=context(),T=Date.parse('2026-10-12T00:00:00Z'),H=3600000,iso=t=>new Date(t).toISOString(),e=plain(envelope(C)),log=C.liveStatusTelemetryActivity();
 const carrier={telemetry:{kind:'service',signals:{errors:{honeycomb:{calculations:[{op:'COUNT'}]}},rate:{grafana:'rate'},total:{grafana:'total'},unknown:{honeycomb:{calculations:[{op:'SUM',column:'count'}]}},trace:{honeycomb:rawQuery()}},proof:{errors:{max:.05,maxRatioOf:'rate'}}}};
 const api=C.createTelemetry({}, {demo:{mount:()=>()=>{}}},{carriers:fn=>fn(carrier,'a',{}),observed:log.observe,reset:log.clear,retire:log.retire});
 const honey={a:{observedAt:iso(T+20*H),signals:{errors:{value:1,series:[[iso(T-H),1]],observedAt:iso(T),retrievedAt:iso(T+20*H)},unknown:{value:0,observedAt:null,aggregate:{kind:'total',from:iso(T-H),to:iso(T)}}}}};
 function apply(rate,at){
  const grafana={a:{observedAt:iso(at),signals:{rate:{value:rate,series:[[iso(at),rate]]},total:{value:0,observedAt:iso(T),aggregate:{kind:'total',from:iso(T-H),to:iso(T)}}}}};
  const merged=C.telemetryProviderMerge([honey,grafana,{a:{signals:{},exemplars:[e]}}]);api.apply(merged);return api.snapshot().map.a;
 }
 api.setEnabled(true);let sample=apply(100,T);assert.equal(sample.signals.errors.observedAt,iso(T));assert.equal(sample.signals.errors.retrievedAt,iso(T+20*H));assert.equal(sample.signals.errors.series[0][0],iso(T-H),'raw bucket start survives');
 assert.equal(sample.signals.rate.observedAt,iso(T));assert.equal(sample.signals.unknown.observedAt,null);assert.equal(sample.signals.unknown.aggregate,undefined,'unknown as-of cannot borrow a peer receipt');assert.equal(sample.signals.total.value,0);assert.equal(sample.signals.total.aggregate.to,iso(T));assert.equal(sample.exemplars[0].observedAt,e.observedAt);
 sample=apply(10,T+H);const crossings=log.snapshot().filter(e=>e.kind==='threshold');assert.equal(crossings.length,1);assert.equal(crossings[0].at,iso(T+H));assert.equal(sample.signals.errors.observedAt,iso(T));
 const projected=C.telemetryHistoryDay({a:sample},{at:iso(T+H)}).a;assert.equal(projected.exemplars,undefined);assert.equal(projected.signals.rate.value,10);assert.equal(projected.signals.total,undefined);
 const embedded={a:sample};api.openHistory([{at:iso(T+H),telemetry:embedded}],0);const historical=api.snapshot().map.a;assert.equal(historical.exemplars,undefined);assert.equal(historical.signals.total.aggregate,undefined);assert.equal(historical.signals.total.value,0);assert.ok(embedded.a.exemplars,'history projection does not mutate input');assert.ok(embedded.a.signals.total.aggregate);
 api.closeHistory();assert.equal(api.snapshot().map.a.exemplars[0].selectionToken,e.selectionToken);api.destroy();
});
test('identical async detail replacement retires provider cache and tokens, including a pending alternative',async t=>{
 let hold=false,release;const h=await setup({wrap:b=>{const call=b.callTool;b.callTool=async(...args)=>{const result=await call(...args);if(hold&&args[1]==='get_trace'){hold=false;await new Promise(r=>release=r);}return result;};}});t.after(()=>h.close());h.api.setEnabled(true);await settle();const old=h.api.snapshot().map.a.exemplars[0],alt=old.candidates.find(c=>c.traceId!==old.traceId);
 hold=true;const pending=assert.rejects(h.api.chooseExemplar('a',old.selectionToken,alt.traceId));await settle();assert.ok(release);
 h.api.bindingsChanged(['a']);await settle();const fresh=h.api.snapshot().map.a.exemplars[0];assert.notEqual(fresh.selectionToken,old.selectionToken);assert.equal(h.bridge.calls.filter(c=>c.name==='run_query').length,2);
 release();await pending;await settle();assert.equal(h.api.snapshot().map.a.exemplars[0].selectionToken,fresh.selectionToken);await assert.rejects(h.api.chooseExemplar('a',old.selectionToken,old.traceId));
 h.api.retry();await settle();assert.equal(h.bridge.calls.filter(c=>c.name==='run_query').length,2,'replacement gets one initial search, then caches');
});
test('native host preload retains numeric and trace evidence together until explicit off, including off before enable',()=>{
 const {C}=context(),sample={a:{signals:{rate:{value:0}},exemplars:[plain(envelope(C))]}};
 for(const initiallyEnable of [false,true]){const api=C.createTelemetry({}, {demo:{mount:()=>()=>{}}},{});api.apply(sample);assert.equal(api.snapshot().map.a.exemplars.length,1);assert.equal(api.snapshot().map.a.signals.rate.value,0);if(initiallyEnable)api.setEnabled(true);
 api.setEnabled(false);api.apply(sample);assert.deepEqual(plain(api.snapshot().map),{});api.setEnabled(true);assert.deepEqual(plain(api.snapshot().map),{});api.apply(sample);assert.equal(api.snapshot().map.a.exemplars.length,1);api.destroy();api.apply(sample);assert.deepEqual(plain(api.snapshot().map),{});}
});

test('exemplar clock coherence rejects adjacent offsets with incompatible absolute timestamps',()=>{
 const {C}=context(),base=plain(envelope(C));base.spans=base.spans.slice(0,2);base.spans[0].ms=.000001;base.spans[1].startMs=.000001;base.spans[1].ms=.000001;
 const at='2026-10-12T04:33:06.602Z';base.spans.forEach(s=>s.time=at);
 assert.equal(C.telemetryTraceEnvelope(base).spans[1].startMs,.000001);
 for(const time of ['2026-10-14T04:33:06.602Z','2026-10-12T04:33:06.604Z']){const bad=structuredClone(base);bad.spans[1].time=time;assert.throws(()=>C.telemetryTraceEnvelope(bad),/clock|extent/);}
 const boundary=structuredClone(base);boundary.spans[1].startMs=0;boundary.spans[1].time='2026-10-12T04:33:06.603Z';assert.throws(()=>C.telemetryTraceEnvelope(boundary),/clock/,'disjoint one-millisecond origin intervals');
 const split=structuredClone(base);split.spans[1].startMs=1.75;split.spans[1].time='2026-10-12T04:33:06.603Z';split.spans.push({...split.spans[1],id:'3333333333333333',startMs:1.25,time:'2026-10-12T04:33:06.604Z'});assert.throws(()=>C.telemetryTraceEnvelope(split),/clock/,'all spans need one common origin, not separate tolerance against an anchor');
});
test('clock coherence preserves recorded Honeycomb nanosecond offsets and bounded quantized 24h endpoints',()=>{
 const {C}=context(),recorded=plain(envelope(C));assert.equal(recorded.spans[1].startMs,4640.718592);assert.equal(Date.parse(recorded.spans[1].time)-Date.parse(recorded.spans[0].time),4640);
 const variant=traceText.replace('1791779586602194688','1791779586602194689').replace('1791779591242913280','1791779586602194690');assert.equal(envelope(C,C.telemetryHoneycombTrace({payload:variant},recordedId)).spans[1].startMs,.000001);
 const boundary=structuredClone(recorded);boundary.spans=boundary.spans.slice(0,2);boundary.spans[0].ms=0;boundary.spans[0].time='2026-10-12T00:00:00.000Z';boundary.spans[1].time='2026-10-13T00:00:00.000Z';boundary.spans[1].startMs=86400000-.5;boundary.spans[1].ms=.5;
 assert.equal(C.telemetryTraceEnvelope(boundary).spans[1].ms,.5,'absolute ISO endpoints may differ by a fractional ms after quantization');
 boundary.spans[1].ms=.500001;assert.throws(()=>C.telemetryTraceEnvelope(boundary),/span\/time/,'relative end must not exceed 24h even by 1ns');boundary.spans[1].ms=.5;boundary.spans[1].time='2026-10-13T00:00:00.001Z';assert.throws(()=>C.telemetryTraceEnvelope(boundary),/clock|extent/);
});
test('raw and structured Tempo source representations retain fractional-ms timing through envelope validation',()=>{
 const {C}=context();for(const fractional of [false,true]){const raw=JSON.parse(fixture('grafana-source-test.json'));if(fractional){raw.services[0].spans[0].startTimeMs=1750000000000.25;raw.services[0].spans[1].startTimeMs=1750000000000.250244;raw.services[0].spans.forEach(s=>s.durationMs=.000001);}
 const structured={traceId:raw.traceId,spans:raw.services[0].spans.map(p=>({...p,id:p.spanId,parentId:p.parentSpanId,serviceName:'checkout'}))};
 for(const response of [{payload:raw},{structuredContent:plain(structured)}]){const parsed=C.telemetryTempoTrace(response,raw.traceId),e=C.telemetryTraceEnvelope({...plain(envelope(C)),provider:'tempo',traceId:raw.traceId,candidates:[{traceId:raw.traceId,status:'unknown'}],...parsed});assert.equal(e.spans[1].startMs,raw.services[0].spans[1].startTimeMs-raw.services[0].spans[0].startTimeMs);assert.equal(e.spans[1].ms,raw.services[0].spans[1].durationMs);
 const bad=plain(e);bad.spans[1].time='2026-10-15T00:00:00.000Z';assert.throws(()=>C.telemetryTraceEnvelope(bad),/clock|extent/);}
 }
});
test('native host preload rejects contradictory clocks without losing numeric zero or valid sub-ms evidence',()=>{
 const {C}=context(),value=plain(envelope(C)),N={URL,AbortController,TextEncoder,TextDecoder,setTimeout,clearTimeout,document:{addEventListener(){},removeEventListener(){}}};vm.runInNewContext(entrypoint('native').source,N);
 const api=N.createTelemetry({}, {demo:{mount:()=>()=>{}}},{});try{
 api.apply({a:{signals:{zero:{value:0}},exemplars:[value]}});assert.equal(api.snapshot().map.a.exemplars[0].spans[1].startMs,4640.718592);
 value.spans[1].time='2026-10-15T00:00:00.000Z';api.apply({a:{signals:{zero:{value:0}},exemplars:[value]}});assert.equal(api.snapshot().map.a.signals.zero.value,0);assert.equal(api.snapshot().map.a.exemplars.length,0);assert.equal(api.enabled(),false);
 }finally{api.destroy();}
});

test('identical trace queries in different deployment profiles never share candidates or pending choices',async t=>{
 const p=pageSpec();Object.assign(p.tracking.telemetry,{environment:'qa',environments:{qa:{},prd:{}}});
 let hold=false,release;const h=await setup({page:p,wrap:b=>{const original=b.callTool;b.callTool=async(...args)=>{const value=await original(...args);if(hold&&args[1]==='get_trace'){hold=false;await new Promise(r=>release=r);}return value;};}});t.after(()=>h.close());
 h.api.setEnabled(true);await settle();const old=h.api.snapshot().map.a.exemplars[0],other=old.candidates.find(c=>c.traceId!==old.traceId);
 hold=true;const choice=h.api.chooseExemplar('a',old.selectionToken,other.traceId),rejected=assert.rejects(choice,/cancelled|expired|unavailable/i);await settle();assert.ok(release);
 h.api.setEnvironment('prd');assert.deepEqual(plain(h.api.snapshot().map),{});assert.equal(h.api.canChooseExemplar('a',old.selectionToken,other.traceId),false);await settle();release();await rejected;await settle();
 assert.equal(h.api.enabled(),true);const fresh=h.api.snapshot().map.a.exemplars[0];assert.notEqual(fresh.selectionToken,old.selectionToken);assert.equal(h.bridge.calls.filter(c=>c.name==='run_query').length,2);
 // #1289 review c2: back to qa within 5 minutes reuses qa's answer without a call; its example trace returns under a fresh token, and the old token stays dead.
 h.api.setEnvironment('qa');await settle();const back=h.api.snapshot().map.a?.exemplars?.[0];assert.ok(back,'qa\'s example trace is listed again');assert.equal(back.traceId,old.traceId);assert.notEqual(back.selectionToken,old.selectionToken);assert.notEqual(back.selectionToken,fresh.selectionToken);
 assert.equal(h.api.canChooseExemplar('a',old.selectionToken,other.traceId),false);assert.equal(h.bridge.calls.filter(c=>c.name==='run_query').length,2);
});

test('switch during trace discovery keeps the newest environment available without data queries',async()=>{
 const {createMockBridge}=await import('./helpers/honeycomb-bridge.mjs'),bridge=createMockBridge(),{C}=context(),p=pageSpec();Object.assign(p.tracking.telemetry,{environment:'qa',environments:{qa:{},prd:{}}});
 const original=bridge.listTools;let first=true,release;bridge.listTools=async()=>{if(first){first=false;await new Promise(r=>release=r);}return original();};
 const adapter=C.createTelemetryProviders(p,{claude:{use:async()=>bridge}}),api=C.createTelemetry(p,adapter.options,{carriers:fn=>fn(p.sections[0].diagram.nodes.a,'a',p)}),handle=adapter.attach({telemetry:api},p);
 await settle();assert.ok(release);api.setEnvironment('prd');await settle();assert.equal(api.snapshot().available,true);release();await settle();assert.equal(api.snapshot().available,true);assert.equal(api.enabled(),false);assert.equal(bridge.calls.length,0);api.setEnabled(true);await settle();assert.ok(api.snapshot().map.a.exemplars.length);handle.destroy();api.destroy();
});

for(const source of ['honeycomb','tempo'])test('hosted metadata-only '+source+' trace contracts describe after consent and preserve cached selection',async t=>{
 const h=await setup({page:pageSpec(source),hosted:true});t.after(()=>h.close());assert.equal(h.api.snapshot().available,true);assert.deepEqual(h.permissions,[]);assert.equal(h.bridge.calls.length,0);h.api.setEnabled(true);await settle();const first=h.api.snapshot().map.a.exemplars[0];assert.ok(first.spans.length);assert.ok(h.permissions.includes('mcp:'+(source==='tempo'?'Grafana':'Honeycomb')));const alternate=first.candidates.find(c=>c.traceId!==first.traceId);await h.api.chooseExemplar('a',first.selectionToken,alternate.traceId);assert.equal(h.api.snapshot().map.a.exemplars[0].traceId,alternate.traceId);
});


for(const kind of ['scalar','trace'])for(const peer of [false,true])test('hosted '+kind+' denial survives environment/metadata/recreation with '+(peer?'healthy Grafana':'no peer'),async t=>{
 const {EVENT_QUERY,nativeQuery}=await import('./helpers/honeycomb-bridge.mjs'),{C}=context();
 const signals=kind==='trace'?binding().signals:{count:{honeycomb:nativeQuery()}};if(peer)signals.rate={grafana:EVENT_QUERY};
 const carrier={telemetry:{kind:'service',signals}},spec=(id,diagram)=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},sections:[{id:'main',diagram}]}});
 const provider=spec('provider',{nodes:{api:carrier},rows:[['api']],topologyExports:{core:{nodes:['api'],edges:[]}}}),consumer=spec('consumer',{nodes:{local:carrier},rows:[['local']],topologyImports:[{spec:'provider',export:'core',as:'shared'}]});
 consumer.page.tracking=pageSpec().tracking;Object.assign(consumer.page.tracking.telemetry,{environment:'qa',environments:{qa:{},prd:{}}});
 const h=await setup({page:C.FlowTopology.resolveSource(consumer,{version:1,id:'consumer',specs:[provider,consumer]}),hosted:true,permission:'denied'});t.after(()=>h.close());
 assert.equal(h.api.snapshot().available,true);h.api.setEnabled(true);await settle();assert.deepEqual(h.permissions,['mcp:Honeycomb']);
 function unchanged(api){assert.equal(api.snapshot().available,peer);assert.equal(h.bridge.calls.filter(c=>c.server==='Honeycomb').length,0);assert.deepEqual(h.permissions,['mcp:Honeycomb']);if(peer)for(const id of ['local','shared::api'])assert.ok(api.snapshot().map[id]?.signals.rate.value>0);}
 unchanged(h.api);h.api.setEnvironment('prd');await settle();h.api.setEnabled(true);await settle();unchanged(h.api);
 // Force scoped adapter recreation through an actual local binding edit.
 const q=h.p.sections[0].diagram.nodes.local.telemetry.signals[kind==='trace'?'trace':'count'].honeycomb;(q.query_spec || q).filters.push({column:'new.resource',op:'=',value:'new-topic'});h.api.bindingsChanged();await settle();unchanged(h.api);
 // A whole rerender creates another coordinator on the same host/page.
 h.close();const adapter=h.C.createTelemetryProviders(h.p,h.win),api=h.C.createTelemetry(h.p,adapter.options,{carriers:fn=>h.C.sectionRecords(h.p).forEach(r=>Object.keys(r.section.diagram.nodes).forEach(id=>fn(r.section.diagram.nodes[id],id,h.p)))}),handle=adapter.attach({telemetry:api},h.p);t.after(()=>{handle.destroy();api.destroy();});await settle();api.setEnabled(true);await settle();unchanged(api);
});

test('denied Honeycomb traces do not hide granted Tempo traces on the same page',async t=>{
 const p=pageSpec();p.sections[0].diagram.nodes.tempo={telemetry:binding('tempo')};p.sections[0].diagram.rows[0].push('tempo');Object.assign(p.tracking.telemetry,{environment:'qa',environments:{qa:{},prd:{}}});
 const h=await setup({page:p,hosted:true,permission:scope=>scope==='mcp:Honeycomb'?'denied':'granted'});t.after(()=>h.close());h.api.setEnabled(true);await settle();assert.equal(h.api.snapshot().available,true);assert.ok(h.api.snapshot().map.tempo.exemplars.length);assert.equal(h.api.snapshot().map.a,undefined);h.api.setEnvironment('prd');await settle();assert.ok(h.api.snapshot().map.tempo.exemplars.length);assert.equal(h.permissions.filter(s=>s==='mcp:Honeycomb').length,1);assert.equal(h.bridge.calls.filter(c=>c.server==='Honeycomb').length,0);
});

test('a cancelled permission wait still remembers denial only for its scoped connector',async()=>{
 const {C}=context();let active=true,finish,requests=0,descriptions=0;
 const claude={use:async()=>({request:async names=>{requests++;return names[0]==='mcp:Honeycomb'?new Promise(resolve=>finish=resolve):{[names[0]]:'granted'};}})},mcp={describeTool:async(server,name)=>{descriptions++;return {name,inputSchema:{type:'object'}};}},tools=[{name:'run_query'}];
 const pending=C.telemetryDescribeTools(claude,mcp,'Honeycomb',tools,()=>active);await settle();active=false;finish({'mcp:Honeycomb':'denied'});await assert.rejects(pending);await assert.rejects(C.telemetryDescribeTools(claude,mcp,'Honeycomb',tools,()=>true),e=>e.code==='not_granted');assert.equal(requests,1);assert.equal(descriptions,0);await C.telemetryDescribeTools(claude,mcp,'Other Honeycomb',tools,()=>true);assert.equal(requests,2);assert.equal(descriptions,1);
});

for(const tool of ['run_query','get_trace'])test('trace '+tool+' failures retain stage and redacted provider explanation',async t=>{
 const h=await setup({wrap:bridge=>{const call=bridge.callTool;bridge.callTool=async(s,n,a,o)=>n===tool?{isError:true,content:[{type:'text',text:'column timestamp is always returned; token=private-token https://mcp.honeycomb.io/trace_results/private'}]}:call(s,n,a,o);}});t.after(()=>h.close());h.api.setEnabled(true);await settle();
 const note=h.api.status().note;assert.match(note,new RegExp(tool+' trace (search|detail)'));assert.match(note,/column timestamp is always returned/);assert.ok(!note.includes('private'));assert.equal(h.api.snapshot().map.a?.exemplars,undefined);
});
// #1076: Honeycomb get_trace adds a synthetic `missing-root` row (start 0) when the root span was not stored.
const placeholderRow='| missing-root |  | 0 | 0 |  | UNSET | false |  |  |  | missing root span |  |  |  | 0 | 141 | 4544 | 0 | false |';
const rootless=()=>traceText.split('\n').filter(l=>!l.includes('| dbd662d250034c44 |  |'));
const withPlaceholder=lines=>[lines[0],lines[1],placeholderRow,...lines.slice(2)].join('\n');
test('#1076 missing-root placeholder row loads, warns and is partial',()=>{const {C}=context(),out=C.telemetryHoneycombTrace({payload:withPlaceholder(rootless())},recordedId);
 assert.equal(out.spans.length,54);assert.ok(out.spans.every(s=>s.id!=='missing-root'));assert.equal(out.completeness,'partial');assert.ok(out.warnings.includes('Root span not stored; timeline starts at the earliest stored span.'));assert.ok(!out.warnings.some(w=>/Annotation/.test(w)));
 assert.equal(Math.min(...out.spans.map(s=>s.startMs)),0);const e=envelope(C,out);assert.equal(e.spans.length,54);assert.equal(e.completeness,'partial');assert.ok(e.warnings.includes('Missing parent spans.'));
 // total_spans counts the placeholder; visible_spans with or without it never adds a collapsed warning or reads complete.
 for(const visible of ['55','54']){const full=withPlaceholder(rootless()).replace('collapsed_nodes: 1','collapsed_nodes: 0').replace('total_spans: 77','total_spans: 55').replace('visible_spans: 55','visible_spans: '+visible).replace('view_mode: auto','view_mode: full').replaceAll('| true |','| false |');
  const f=C.telemetryHoneycombTrace({payload:full},recordedId);assert.equal(f.completeness,'partial');assert.deepEqual(plain(f.warnings),['Root span not stored; timeline starts at the earliest stored span.']);}
});
test('#1076 the same table without the placeholder row is unchanged',()=>{const {C}=context(),without=C.telemetryHoneycombTrace({payload:rootless().join('\n')},recordedId),withRow=C.telemetryHoneycombTrace({payload:withPlaceholder(rootless())},recordedId);
 assert.deepEqual(plain(withRow.spans),plain(without.spans));assert.ok(!without.warnings.some(w=>/Root span not stored/.test(w)));
 const recorded=C.telemetryHoneycombTrace({payload:traceText},recordedId);assert.equal(recorded.spans.length,55);assert.equal(recorded.completeness,'partial');assert.deepEqual(plain(recorded.warnings),['Provider returned a partial or collapsed trace.']);
});
test('#1076 a stored span more than 24h from the rest still fails with a missing root',()=>{const {C}=context(),lines=rootless(),starts=lines.slice(2).filter(l=>/^\| [0-9a-f]{16} /.test(l)).map(l=>BigInt(l.split('|')[3].trim())),base=starts.reduce((a,b)=>a<b?a:b);
 const move=offset=>withPlaceholder(lines.map(l=>l.startsWith('| c27df9e4c7b8bd96 |')?l.replace('| 1791779590953999872 | 14477 |',`| ${base+offset} | 0 |`):l));
 const edge=C.telemetryHoneycombTrace({payload:move(86400000000000n)},recordedId);assert.equal(edge.spans.find(s=>s.id==='c27df9e4c7b8bd96').startMs,86400000);
 assert.throws(()=>C.telemetryHoneycombTrace({payload:move(86400000000001n)},recordedId),/Trace timing exceeds bounds/);
});
test('#1076 a missing-root trace over 200 spans keeps the 200-span limit',()=>{const {C}=context(),lines=traceText.split('\n'),row=lines[3];
 const huge=[lines[0],lines[1],placeholderRow,...Array.from({length:201},(_,i)=>row.replace('011114cbd1fd62de',i.toString(16).padStart(16,'0'))),'','Metadata:',`  trace_id: ${recordedId}`].join('\n');
 const out=C.telemetryHoneycombTrace({payload:huge},recordedId);assert.equal(out.spans.length,0);assert.equal(out.completeness,'partial');assert.ok(out.warnings.includes('More than 200 spans; trace timeline unavailable.'));assert.ok(out.warnings.includes('Root span not stored; timeline starts at the earliest stored span.'));
});
test('#1076 an annotation row with start 0 and no span ID is not a missing-root placeholder',()=>{const {C}=context(),lines=traceText.split('\n'),note='|  |  | 0 | 0 |  | UNSET | false |  |  |  | exception | span_event |  |  | 0 | 0 | 0 | 0 | false |';
 const out=C.telemetryHoneycombTrace({payload:[lines[0],lines[1],note,...lines.slice(2)].join('\n')},recordedId);assert.equal(out.spans.length,55);assert.ok(!out.warnings.some(w=>/Root span not stored/.test(w)));assert.ok(out.warnings.includes('Annotation/log/link rows excluded from the span timeline.'));
});
test('#1076 a start-0 row with no span ID is dropped as a missing-root placeholder; metadata that matches the stored spans stays partial',()=>{const {C}=context(),blank=withPlaceholder(rootless()).replace('| missing-root |','|  |'),out=C.telemetryHoneycombTrace({payload:blank},recordedId);
 assert.equal(out.spans.length,54);assert.equal(out.completeness,'partial');assert.ok(out.warnings.includes('Root span not stored; timeline starts at the earliest stored span.'));assert.ok(!out.warnings.some(w=>/Annotation/.test(w)));
 const matched=withPlaceholder(rootless()).replace('collapsed_nodes: 1','collapsed_nodes: 0').replace('total_spans: 77','total_spans: 54').replace('visible_spans: 55','visible_spans: 54').replace('view_mode: auto','view_mode: full').replaceAll('| true |','| false |');
 const m=C.telemetryHoneycombTrace({payload:matched},recordedId);assert.equal(m.completeness,'partial');assert.deepEqual(plain(m.warnings),['Root span not stored; timeline starts at the earliest stored span.']);
});

/* #1252 item 1: a failed trace search or detail call is not cached; the next poll or Retry calls again. */
for(const failing of ['run_query','get_trace'])test('#1252 a failed '+failing+' is not cached: Retry calls it again and the trace appears',async t=>{
 let fail=1;const h=await setup({wrap:b=>{const call=b.callTool;b.callTool=async(...args)=>{if(args[1]===failing && fail>0){fail--;throw {code:'tool_error',message:'temporary outage'};}return call(...args);};}});t.after(()=>h.close());
 h.api.setEnabled(true);await settle();assert.equal(h.api.snapshot().map.a?.exemplars,undefined,'the outage leaves no trace');
 const before=h.bridge.calls.filter(c=>c.name===failing).length;
 h.api.retry();await settle();h.api.snapshot();await settle();
 assert.equal(h.bridge.calls.filter(c=>c.name===failing).length,before+1,'Retry calls '+failing+' again');
 assert.equal(h.api.snapshot().map.a?.exemplars?.length,1,'and the trace appears: '+JSON.stringify(h.api.status()));
});

/* #1256 review c2: a rejection that arrives after its cache entry was replaced leaves the newer entry cached.
   The adapter's provider is called directly, as a poll does: the held first search, then a changed binding whose
   search replaces the entry, then the late rejection, then the changed binding again (cached: no new search). */
test('#1252 a late rejection does not delete the entry that replaced it',async t=>{
 let release=null,first=true;const h=await setup({wrap:b=>{const call=b.callTool;b.callTool=async(...args)=>{if(args[1]==='run_query' && first){first=false;await new Promise(r=>release=r);throw {code:'tool_error',message:'temporary outage'};}return call(...args);};}});t.after(()=>h.close());
 h.api.setEnabled(true);await settle();assert.ok(release,'the first search is held');
 const poll=bindings=>h.adapter.options.provider(bindings,new h.C.AbortController().signal,{note(){}});
 const changed=plain(h.api.bindings());changed[0].signals.trace.query.results_limit=1;
 const replaced=await poll(changed);assert.equal(replaced.a?.exemplars?.length,1,'the changed binding\'s search replaced the entry');
 const searches=()=>h.bridge.calls.filter(c=>c.name==='run_query').length,before=searches();
 release();await settle();
 const again=await poll(changed);await settle();
 assert.equal(searches(),before,'the newer entry is still cached after the late rejection');assert.equal(again.a?.exemplars?.length,1);
});

/* #1289 review c2: a reused answer (Metrics off/on within 5 minutes) keeps a trace-only carrier and its example trace,
   re-issued under a fresh selection token from the cached data, with no provider call; choosing another returned
   candidate is the reader's action and loads only that trace's detail. */
test('a reused answer keeps example traces choosable under fresh tokens, without a provider call',async t=>{
 const h=await setup();t.after(()=>h.close());h.api.setEnabled(true);await settle();
 const first=h.api.snapshot().map.a?.exemplars?.[0];assert.ok(first,'the carrier holds only an example trace');const other=first.candidates.find(c=>c.traceId!==first.traceId);assert.ok(other,'a second candidate');
 const before=h.bridge.calls.length;h.api.setEnabled(false);h.api.setEnabled(true);await settle();
 assert.equal(h.bridge.calls.length,before,'Metrics on within 5 minutes makes no provider call');
 const again=h.api.snapshot().map.a?.exemplars?.[0];assert.ok(again,'the trace-only carrier is still listed with its example trace');
 assert.equal(again.traceId,first.traceId);assert.deepEqual(again.candidates.map(c=>c.traceId),first.candidates.map(c=>c.traceId));assert.equal(again.spans.length,first.spans.length);
 assert.notEqual(again.selectionToken,first.selectionToken,'a fresh token');
 assert.equal(h.api.canChooseExemplar('a',first.selectionToken,other.traceId),false,'the old token is dead');assert.equal(h.api.canChooseExemplar('a',again.selectionToken,other.traceId),true,'the fresh token chooses');
 const chosen=await h.api.chooseExemplar('a',again.selectionToken,other.traceId);assert.equal(chosen.traceId,other.traceId);
 const after=h.bridge.calls.slice(before).map(c=>c.name);
 assert.ok(after.includes('get_trace'),'choosing loads that trace\'s detail: '+JSON.stringify(after));assert.ok(!after.includes('run_query'),'and runs no new trace search: '+JSON.stringify(after));
});

/* #1289 review c3: the restore guards. Each row fails if its guard is removed (mutation-checked):
| row | guard | fixture | assertion |
|---|---|---|---|
| G0 | none (control) | Metrics on, Traces available, matching provider | restore lists the example trace under a fresh token |
| G1 | Metrics must be on | Metrics off | the Traces adapter restores nothing |
| G2 | the Traces part must be available | the Traces part reports unavailable (its tools removed or denied) while Grafana and Honeycomb stay on | the providers restore nothing, and off/on lists no example trace |
| G3 | the cached trace's provider must have a current contract | a cached trace from another provider (tempo) for a honeycomb trace signal | the Traces adapter restores nothing |
*/
test('restore guards: Metrics on, the Traces part available, a current contract for the cached provider',async t=>{
 const {nativeQuery,EVENT_QUERY}=await import('./helpers/honeycomb-bridge.mjs'),p=pageSpec();p.sections[0].diagram.nodes.a.telemetry.signals={rate:{grafana:EVENT_QUERY},zero:{honeycomb:nativeQuery('notify->app')},trace:{honeycomb:rawQuery()}};
 const spy={},h=await setup({page:p,spyTraces:spy,wrap:b=>{b.day=11;}});t.after(()=>h.close());
 h.api.setEnabled(true);await settle();const cached=plain(h.api.snapshot().map),first=cached.a?.exemplars?.[0];assert.ok(first && spy.adapter && spy.facade,'an example trace and the Traces adapter');
 const restore=map=>plain(spy.adapter.options.restoreExemplars(map)),viaProviders=map=>plain(h.adapter.options.restoreExemplars(map));
 // G0: the control. A restore while Metrics is on lists the trace under a fresh token.
 const control=restore(cached);assert.equal(control.a?.traceId,first.traceId,'G0 the control restores');assert.notEqual(control.a.selectionToken,first.selectionToken);
 // G3: a cached trace whose provider has no matching contract is not restored.
 const tempo=plain(cached);tempo.a.exemplars[0].provider='tempo';assert.deepEqual(restore(tempo),{},'G3 another provider\'s cached trace');
 // G1: with Metrics off nothing is restored.
 h.api.setEnabled(false);assert.deepEqual(restore(cached),{},'G1 Metrics off');
 // G2: the Traces part is unavailable (its tools were removed or denied) while the numeric parts stay on.
 h.api.setEnabled(true);await settle();assert.ok(h.api.snapshot().map.a?.exemplars?.length,'traces are back after a fresh on');
 spy.facade.setAvailable(false,'Trace tools removed.');await settle();assert.equal(h.api.snapshot().available,true,'Metrics stays available for Grafana and Honeycomb');
 assert.deepEqual(viaProviders(cached),{},'G2 the providers restore nothing while the Traces part is unavailable');
 h.api.setEnabled(false);h.api.setEnabled(true);await settle();assert.equal(h.api.snapshot().map.a?.exemplars,undefined,'G2 off/on lists no example trace');
});

/* #1289 CI (telemetry-step.spec): a host provider owns its exemplars' selection tokens (canChooseExemplar decides),
   so a reused answer keeps the host's example trace as it was; the reader can still pick a candidate. */
test('a reused answer keeps a host provider\'s example trace, which the host still validates',async()=>{
 const {C}=context(),p=C.normalize(pageSpec()),e=plain(envelope(C));let calls=0;
 const api=C.createTelemetry(p,{provider:async()=>{calls++;return {a:{signals:{},exemplars:[e]}};},canChooseExemplar:()=>true,chooseExemplar:async(id,token,traceId)=>e},{carriers:fn=>C.sectionRecords(p).forEach(r=>{const d=r.section.diagram||{};Object.keys(d.nodes||{}).forEach(id=>fn(d.nodes[id],id,p));})});
 api.setEnabled(true);await settle();assert.equal(calls,1);assert.equal(api.snapshot().map.a?.exemplars?.[0]?.traceId,e.traceId);
 api.setEnabled(false);api.setEnabled(true);await settle();
 assert.equal(calls,1,'Metrics on within 5 minutes makes no call');
 const kept=api.snapshot().map.a?.exemplars?.[0];assert.ok(kept,'the host\'s example trace is kept');assert.equal(kept.selectionToken,e.selectionToken,'with the host\'s own token');
 // A retracted example trace never comes back with a reused answer.
 api.retractExemplars();assert.equal(api.snapshot().map.a,undefined);api.setEnabled(false);api.setEnabled(true);await settle();
 assert.equal(calls,1);assert.equal(api.snapshot().map.a?.exemplars,undefined,'retracted stays retracted');api.destroy();
});

/* #1313 review c1: example traces refresh with the metrics. A reuse under 5 minutes keeps the session's trace search;
   an overdue off/on and Refresh now search again (as off/on past 5 minutes did before #1293). */
test('example traces are searched again on an overdue off/on and on Refresh now, not on a fresh reuse',async t=>{
 const clock={now:Date.parse('2026-10-30T00:00:00Z')},h=await setup({clock});t.after(()=>h.close());
 const searches=()=>h.bridge.calls.filter(c=>c.name==='run_query').length;
 assert.equal(typeof h.api.refreshNow,'function','Refresh now exists');
 h.api.setEnabled(true);await settle();assert.equal(searches(),1,'Metrics on searches once');
 clock.now+=120000;h.api.setEnabled(false);h.api.setEnabled(true);await settle();assert.equal(searches(),1,'a reuse under 5 minutes keeps the search');
 assert.ok(h.api.snapshot().map.a?.exemplars?.[0],'and its example trace');
 clock.now+=360000;h.api.setEnabled(false);h.api.setEnabled(true);await settle();assert.equal(searches(),2,'an overdue off/on searches again');
 clock.now+=61000;assert.equal(h.api.refreshNow(),true);await settle();assert.equal(searches(),3,'Refresh now searches again');
 assert.ok(h.api.snapshot().map.a?.exemplars?.[0],'and the new example trace is listed');
});

/* #1313 review c3: during the wait after a failed answer, a host provider's example trace stays, as it does on a reuse. */
test('during the wait after a failed answer a host provider\'s example trace stays',async()=>{
 const {C}=context(),p=C.normalize(pageSpec()),e=plain(envelope(C));let calls=0;
 const api=C.createTelemetry(p,{provider:async(b,s,report)=>{calls++;report.note('a other: boom');return {a:{signals:{},exemplars:[e]}};},canChooseExemplar:()=>true,chooseExemplar:async()=>e},{carriers:fn=>C.sectionRecords(p).forEach(r=>{const d=r.section.diagram||{};Object.keys(d.nodes||{}).forEach(id=>fn(d.nodes[id],id,p));})});
 api.setEnabled(true);await settle();assert.equal(calls,1);assert.match(api.status().note,/boom/);
 api.setEnabled(false);api.setEnabled(true);await settle();assert.equal(calls,1,'the wait: no call');
 assert.equal(api.refreshNowState().waiting,true);assert.equal(api.snapshot().map.a?.exemplars?.[0]?.traceId,e.traceId,'the host\'s example trace stays');api.destroy();
});
