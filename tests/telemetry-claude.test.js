'use strict';
/* #943 contract matrix: the claude.ai Grafana telemetry adapter (src/viewer/telemetry-claude.js).
   Recorded payloads come from the mock Grafana MCP handler (deploy/cloudflare/mock-grafana-mcp/mcp.mjs)
   for pinned story days, wrapped in the claude.ai CallToolResult envelope (payload = structuredContent,
   else the first text block parsed as JSON, else that text).
| row | rule | fixture | scoped assertion | broken implementation rejected |
|---|---|---|---|---|
| A1 | `viewer/telemetry-claude.js` ships in the standalone entrypoint only; the standalone boot builds the adapter with `createTelemetryGrafana(page, window)` when no `window.flowviewTelemetry` host provider is set. | Bundle records plus production boot/rerender with real normalize, adapter and telemetry controller; rendering/navigation boundaries stubbed | Separate A1 cases check placement, initial attachment, host precedence, retirement, current normalized page/config and current-controller approval/retraction | Missing adapter, wrong provider, initial-only attachment, leaked handles, stale page/config or stale controller |
| A2 | `createTelemetryGrafana(page, win)` is null without `win.claude.use` (absent or throwing getter) and on pages without a grafana, loki or sql signal; otherwise `{options: {provider, source: 'Grafana', available: false}, attach(ctl, page)}`. Imported carriers count. Creating it never calls `use()`. | Runtime gates, local grafana/loki/sql signals, direct imported edge and separate nested imported node/edge bindings; absence-tolerant loader | Named A2 gate, provider/source/attach shape and zero use() assertions | Ungated or eager adapter, ignored imported carriers |
| A3 | The connector is picked by offered tools: all of query_prometheus, query_loki_logs, search_tempo_traces, get_annotations, generate_deeplink. A connector missing one (query_prometheus) is not picked; Jira-only and GitHub-only connectors are not picked; "Grafana" wins a tie, else the first qualifying one. None → the add-connector note and no tool call. | Partial, Jira, GitHub and competing qualifying connectors; inert provider if absent | Named A3 calls select the expected connector and missing tools produce the add-connector note | Name-only selection, wrong tie-break or calls without a qualifying connector |
| A4 | One refresh (default 24h window) makes exactly: get_annotations first and alone (no other call starts until it settles), one query_prometheus range call per grafana signal, one query_loki_logs metric range call per loki signal, generate_deeplink once per carrier without an authored query link; relative times now-24h..now, stepSeconds 360, the page's datasource UIDs, the provider's AbortSignal on every call. tempo and honeycomb signals are not queried. A later refresh repeats the queries but not the deeplinks. | One-shot deferred get_annotations, start/settle event log, then a second refresh | Exactly one pending call, no query starts before annotation settlement; exact inputs, budget, signals and cached links | Annotations launched concurrently with queries, early queries, extra calls or repeated deeplinks |
| A5 | Day 10 recorded payloads map to the provider shape: every Prometheus and Loki series as ascending [ms, number] points (several series added point by point), value = the last point, the authored unit; a query with no data is value 0 with no points; observedAt = the newest point; markers = the window's annotations ascending as {at, kind, label}; links = authored dashboard/query plus the generated Explore link. Imported carriers map by their resolved id. | Pinned Day 10 payloads, local and resolved imported carriers, pure mapper inputs; empty map if absent | Named A5 carrier ids, mapped values/series/units, markers, timestamps and links | Wrong Loki field, missing markers, lost imported ids or incorrect series aggregation |
| A6 | The page window drives the range and step (6h → now-6h, 90 s; 30m → 60 s floor); Day 11 shows the incident marker and the lagging queue; Day 12 the recovered queue and the still-silent push edge. | 6h/30m/7d windows and pinned Day 11/12/all-todo story; missing calls read as undefined | Named A6 ranges, step floor, incident marker, lag/recovery and silent-edge values | Fixed window/step, missing incident marker or wrong recovery/silence values |
| A7 | Through ctl.telemetry: Metrics off makes no data call (metadata discovery is permitted); the refresh never runs faster than 60 s even when the page asks for less; a hidden document pauses and returns with one catch-up; Metrics off aborts the signal. | Fake timers and document visibility through ctl.telemetry; page requests 1000 ms | Named A7 off/on calls, delivered map, 60000 ms floor, hidden pause, one catch-up and abort | Eager calls, sub-minute refresh, hidden polling, duplicate catch-up or no abort |
| A8 | A connector-level failure (server_unavailable) keeps the previous map and sets status().note; a tool_error on one query keeps the other carriers fresh, keeps that signal's previous sample and reports the failed query in status().note. | Good sample then connector failure and per-query error with distinct second-refresh Prometheus/Loki peer series, plus missing datasource; inert provider if absent | Named A8 error status/note, retained previous map/failed sample, every successful peer equals the new series and differs from its first sample, and cleared note | Failure reported as success, erased previous map, an implementation that keeps the whole stale map after one failure, or unreported query error |
| A9 | approval_required → status `approval`, no further connector call in that Metrics session, an "Allow Grafana" action on ctl.liveStatus (re-shown after another connector clears the slot, never over another connector's action); Allow makes the same call once and restarts Metrics. Authorization denials clear the map, set the note and stop calls until Metrics is turned on again; user_changed retires the adapter. | Deferred approval/denial behavior and fake live-status action through ctl.telemetry | Named A9 approval status/text, one Allow retry, retracted map and retired adapter | Silent success, repeated unattended requests, overwritten action or retained unauthorized data |
| A10 | sql signals call query_sql at most once an hour (the value is reused in between); without query_sql on the connector there is no call and the note says so. | SQL connector, controlled clock at 0/59/61 minutes, missing-tool case; no calls if absent | Named A10 SQL inputs/value, hourly cap/cache and missing-tool note | Missing SQL call, per-refresh SQL query, stale hourly cache or unsupported tool call |
| A11 | docs/live-status.md declares the Grafana connector with its five tools and states the per-refresh call budget. | docs/live-status.md source | Declared connector, five tools and call-budget prose | Missing connector declaration or budget guidance |
Flip: read the Loki metric result from the wrong field (A5 notify node and push edge fail). */
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {entrypoint}=require('../tools/source-loader.cjs');
const plain=v=>JSON.parse(JSON.stringify(v));
const settle=()=>new Promise(setImmediate);
const settled=async(n=6)=>{for(let i=0;i<n;i++)await settle();};
const ROOT=path.resolve(__dirname,'..');
const loadMock=()=>import(pathToFileURL(path.join(ROOT,'deploy/cloudflare/mock-grafana-mcp/mcp.mjs')).href);

const TOOLS=['query_prometheus','query_loki_logs','search_tempo_traces','get_annotations','generate_deeplink'];
const Q={
 press:'sum(rate(button_press_total{device="doorbell"}[5m]))*3600',
 eventRate:'sum(rate(http_server_requests_total{service="event-ingest",route="/v1/events"}[5m]))*3600',
 eventErrors:'sum(rate(http_server_requests_total{service="event-ingest",route="/v1/events",code=~"5.."}[5m]))*3600',
 eventP95:'histogram_quantile(0.95, sum by (le)(rate(http_server_request_duration_seconds_bucket{service="event-ingest",route="/v1/events"}[5m])))*1000',
 routeIn:'sum(rate(kafka_server_brokertopicmetrics_messagesin_total{topic="device-events"}[5m]))*3600',
 routeLag:'max(kafka_consumergroup_lag{topic="device-events",group="notify-consumers"})',
 pushSent:'sum(rate({app="notify"} |= "push sent" [5m]))*3600',
 pushFailed:'sum(rate({app="notify"} |= "push failed" [5m]))*3600',
 consumed:'sum(rate({app="notify"} |= "event consumed" [5m]))*3600',
 ingestPerCode:'rate(http_server_requests_total{service="event-ingest"}[5m])*3600'
};
const DASHBOARD='https://acme.grafana.net/d/ingest/events',AUTHORED_QUERY='https://acme.grafana.net/explore?authored=1';
function boardPage(window){
 const telemetry={grafana:{prometheus:'prom-main',loki:'loki-main',tempo:'tempo-main'}};if(window)telemetry.window=window;
 return {tracking:{jira:{site:'https://jira.test'},telemetry},sections:[{id:'main',diagram:{
  nodes:{button:{title:'Button'},mcu:{title:'MCU'},ingest:{title:'Ingest',telemetry:{kind:'service',signals:{rate:{grafana:Q.ingestPerCode,unit:'req/h'}}}},
   notify:{title:'Notify',telemetry:{kind:'service',signals:{rate:{loki:Q.consumed,unit:'req/h'},exemplar:{tempo:'{ resource.service.name = "notify" }'}}}},
   app:{title:'App',telemetry:{kind:'service',signals:{users:{honeycomb:{dataset:'app',calc:'COUNT'}}}}}},
  rows:[['button','mcu','ingest','notify','app']],
  edges:[
   {from:'button',to:'mcu',telemetry:{kind:'device',signals:{rate:{grafana:Q.press,unit:'press/h'}}}},
   {from:'mcu',to:'ingest',telemetry:{kind:'call',signals:{rate:{grafana:Q.eventRate,unit:'req/h'},errors:{grafana:Q.eventErrors,unit:'req/h'},p95:{grafana:Q.eventP95,unit:'ms'}},links:{dashboard:DASHBOARD}}},
   {from:'ingest',to:'notify',telemetry:{kind:'queue',signals:{in:{grafana:Q.routeIn,unit:'msg/h'},lag:{grafana:Q.routeLag,unit:'msgs'}}}},
   {from:'notify',to:'app',telemetry:{kind:'call',signals:{rate:{loki:Q.pushSent,unit:'req/h'},errors:{loki:Q.pushFailed,unit:'req/h'}},links:{query:AUTHORED_QUERY}}}
  ]}}]};
}

/* While src/viewer/telemetry-claude.js does not exist (RED), an inert stand-in takes
   its globals: a provider that resolves {} without a call, an attach() handle and
   empty mappers. A1 alone asserts the module exists; every other row runs to its own
   contract assertion and fails there (no call made, wrong map, no marker, null gate...). */
const ABSENT_ADAPTER=['function createTelemetryGrafana(){return {options:{provider:function(){return Promise.resolve({});},source:""},attach:function(){return {destroy:function(){}};}};}',
 'function telemetryGrafanaServer(){return null;}','function telemetryGrafanaPrometheus(){return [];}','function telemetryGrafanaLoki(){return [];}',
 'function telemetryGrafanaMarkers(){return [];}','function telemetryGrafanaSql(){return null;}'].join('\n');
/* Missing source is an ordinary RED fixture; syntax/runtime errors still surface.
   Bundle placement and existence belong to A1 alone. */
function loadAdapter(C){
 let source;
 try{source=fs.readFileSync(path.join(ROOT,'src/viewer/telemetry-claude.js'),'utf8');}
 catch(error){if(error.code==='ENOENT')return null;throw error;}
 vm.runInNewContext(source,C);return C;
}
/* A vm context with the engine (createTelemetry, telemetryBindings, normalize, FlowTopology)
   and the adapter module (or the inert RED stand-in above). */
function context(){
 const timers=new Map(),listeners={};let serial=0;
 const doc={hidden:false,visibilityState:'visible',addEventListener:(t,f)=>{(listeners[t]??=new Set()).add(f);},removeEventListener:(t,f)=>listeners[t]?.delete(f),
  createElement:()=>({style:{},setAttribute(){},appendChild(){}}),dispatch:t=>[...(listeners[t]||[])].forEach(f=>f({type:t}))};
 const setTimer=(fn,ms)=>{const id=++serial;timers.set(id,{fn,ms});return id;},clearTimer=id=>timers.delete(id);
 const C={URL,console,AbortController,document:doc,setTimeout:setTimer,clearTimeout:clearTimer};
 vm.runInNewContext(entrypoint('native').source,C);
 if(!loadAdapter(C))vm.runInNewContext(ABSENT_ADAPTER,C);
 return {C,doc,timers,
  hide(on){doc.hidden=on;doc.visibilityState=on?'hidden':'visible';doc.dispatch('visibilitychange');},
  tick(ms){const entry=[...timers].find(([,x])=>ms===undefined || x.ms===ms);assert.ok(entry,'a refresh timer'+(ms?' of '+ms+' ms':'')+' is armed');timers.delete(entry[0]);entry[1].fn();}};
}
/* Every carrier of the normalized page, as ctl.liveStatus walks it (local and imported). */
function carriersOf(C,page){
 return fn=>C.sectionRecords(page).forEach(record=>{const d=record.section.diagram || {};
  Object.keys(d.nodes || {}).forEach(id=>fn(d.nodes[id],id,page));
  (Array.isArray(d.edges)?d.edges:[]).forEach(edge=>fn(edge,edge && typeof edge==='object'?edge.from+'->'+edge.to:null,page));});
}
/* The viewer's MCP namespace, answering through the mock handler for a pinned day.
   events logs 'start:<tool>' when a call is made and 'settle:<tool>' when its promise
   settles; the next call to each tool in holds waits for release(tool) before answering. */
async function mockMcp(env,servers,overrides={},holds=[]){
 const {handleMcp}=await loadMock();const calls=[],events=[],held=[],holdNext=new Set(holds);
 function answer(call){
  if(overrides[call.tool]){const given=overrides[call.tool](call.input,calls);if(given)return given;}
  const reply=handleMcp({jsonrpc:'2.0',id:calls.length,method:'tools/call',params:{name:call.tool,arguments:call.input}},env);
  if(reply.error)return Promise.reject({code:'bad_request',message:reply.error.message});
  const result=reply.result,text=result.content[0].text;
  if(result.isError)return Promise.reject({code:'tool_error',message:text,result});
  let payload=result.structuredContent;if(payload===undefined){try{payload=JSON.parse(text);}catch{payload=text;}}
  return Promise.resolve({content:result.content,structuredContent:result.structuredContent,payload});
 }
 const mcp={
  listTools:()=>Promise.resolve({servers:plain(servers)}),
  callTool(server,tool,input,options){
   const call={server,tool,input:plain(input),signal:options && options.signal};calls.push(call);events.push('start:'+tool);
   const gate=holdNext.delete(tool)?new Promise(resolve=>held.push({tool,resolve})):Promise.resolve();
   const settled=gate.then(()=>answer(call));
   settled.then(()=>events.push('settle:'+tool),()=>events.push('settle:'+tool));
   return settled;
  }};
 function release(tool){held.filter(h=>h.tool===tool).forEach(h=>{held.splice(held.indexOf(h),1);h.resolve();});}
 return {mcp,calls,events,release,handleMcp};
}
const GRAFANA_SERVER={server:'Ops Grafana',authStatus:'connected',tools:TOOLS.map(name=>({name,description:''}))};
const JIRA_SERVER={server:'Atlassian',tools:[{name:'getAccessibleAtlassianResources'},{name:'searchJiraIssuesUsingJql'}]};
function claudeWin(mcp){let used=0;return {win:{claude:{use:name=>{used++;return Promise.resolve(name==='mcp'?mcp:null);}}},used:()=>used};}
async function setup({day=9,scenario,window,servers=[JIRA_SERVER,GRAFANA_SERVER],overrides,holds,page,now}={}){
 const ctx=context(),C=ctx.C;
 const raw=page || boardPage(window),normalized=C.normalize(raw);
 const env={day};if(scenario)env.scenario=scenario;
 const net=await mockMcp(env,servers,overrides,holds),host=claudeWin(net.mcp);
 const adapter=C.createTelemetryGrafana(normalized,host.win,now);
 const bindings=()=>C.telemetryBindings(carriersOf(C,normalized));
 return {...ctx,C,page:normalized,net,host,adapter,bindings,
  async refresh(signal=new AbortController().signal){const notes=[];const map=await adapter.options.provider(bindings(),signal,{note:t=>notes.push(t)});return {map:plain(map),notes};}};
}
/* Expected points read straight from a recorded payload. */
const promPoints=payload=>payload.data[0].values.map(([s,v])=>[Math.round(s*1000),Number(v)]);
const lokiPoints=payload=>payload.data[0].values.map(p=>[Math.round(Number(p.timestamp)*1000),Number(p.value)]);
function record(handleMcp,env,tool,args){
 const reply=handleMcp({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:tool,arguments:args}},env);
 assert.ok(!reply.result.isError,tool+' recorded without error');return JSON.parse(reply.result.content[0].text);
}
const PROM=(expr,extra={})=>({datasourceUid:'prom-main',expr,startTime:'now-24h',endTime:'now',stepSeconds:360,queryType:'range',...extra});
const LOKI=(logql,extra={})=>({datasourceUid:'loki-main',logql,startRfc3339:'now-24h',endRfc3339:'now',queryType:'range',stepSeconds:360,...extra});
const DAY10_NOW=Date.parse('2026-10-30T00:00:00Z');

test('A1 the adapter ships in the standalone entrypoint only',()=>{
 const record=entrypoint('standalone').records.find(r=>r.file==='viewer/telemetry-claude.js');
 assert.ok(record,'A1 viewer/telemetry-claude.js is a standalone source (src/source-bundles.json)');
 assert.match(entrypoint('standalone').body,/function createTelemetryGrafana\(/);
 for(const name of ['native','workbench','forge'])assert.doesNotMatch(entrypoint(name).body,/function createTelemetryGrafana\(/,'A1 '+name+' has no claude.ai adapter');
});

/* Execute the unmodified standalone boot, including its editor render callback.
   Only DOM rendering, the editor UI and unrelated navigation wires are boundaries:
   normalization/validation, the Grafana adapter and ctl.telemetry are production code.
   Attach/destroy wrappers record calls and delegate to the real adapter handles. */
async function bootHarness({page=boardPage(),hostProvider,overrides}={}){
 const ctx=context(),{C,doc}=ctx,net=await mockMcp({day:9},[GRAFANA_SERVER],overrides),host=claudeWin(net.mcp);
 const renders=[],attachments=[],adapters=[],events=[];let editorRender;
 const text=JSON.stringify(page),view={style:{},appendChild(){}};
 doc.getElementById=id=>id==='docview'?view:id==='flowspec'?{textContent:text}:null;
 doc.querySelector=selector=>selector==='meta[name="dv-spec-file"]'?{getAttribute:()=> 'flowspec.json'}:null;
 doc.body={};
 const win=Object.assign(host.win,{location:{hash:'',search:'',hostname:'localhost',href:'https://example.test/board.html'},
  addEventListener(){},scrollTo(){},scrollX:0,scrollY:0,flowviewTelemetry:hostProvider});
 Object.assign(C,{window:win,URLSearchParams,fetch:async()=>({ok:true,text:async()=>text}),
  readWorkspaceHandoff:()=>null,verifyWorkspaceHandoff:async()=>{},applySkinClasses:()=>true,
  wireDeepLinks:()=>null,initViewerExploreCanvas:()=>null,wirePresenter:()=>null,tourArtifactHost:()=>false,
  initWorkbenchHumanGuide:undefined,wireArtifactComments:undefined,wireLiveStatusClaude:undefined,
  wireTour:undefined,wireReaderShortcuts:undefined,
  createBoardEditor(options){editorRender=options.render;return {};},
  renderPage(view,page,skin,optionsBacklinks,options){
   const id=renders.length,telemetry=C.createTelemetry(page,options.telemetry,{carriers:carriersOf(C,page)}),enabledCalls=[];
   const setEnabled=telemetry.setEnabled;
   telemetry.setEnabled=value=>{enabledCalls.push(value);return setEnabled(value);};
   const ctl={page,telemetry,liveStatus:fakeLive(),enabledCalls,destroyed:false,
    destroy(){events.push('controller-destroy:'+id);ctl.destroyed=true;telemetry.destroy();}};
   renders.push({ctl,page,options});events.push('render:'+id);return ctl;
  }});
 const create=C.createTelemetryGrafana;
 C.createTelemetryGrafana=(page,win)=>{
  const adapter=create(page,win);adapters.push(adapter);
  if(adapter){const attach=adapter.attach;adapter.attach=(ctl,page)=>{
   const handle=attach(ctl,page),id=attachments.length,record={ctl,page,destroyed:false};
   attachments.push(record);events.push('attach:'+id);
   return {destroy(){events.push('adapter-destroy:'+id);record.destroyed=true;handle.destroy();}};
  };}
  return adapter;
 };
 vm.runInNewContext(fs.readFileSync(path.join(ROOT,'src/boot.flowview.js'),'utf8'),C);
 await settled();
 return {...ctx,net,host,renders,attachments,adapters,events,
  rerender(raw){assert.equal(typeof editorRender,'function','the two-file boot created the editor render callback');return editorRender(JSON.stringify(raw));},
  destroy(){renders.at(-1)?.ctl.telemetry.destroy();}};
}

test('A1 initial standalone boot attaches the selected adapter to its controller with metadata discovery only',async t=>{
 const h=await bootHarness();t.after(()=>h.destroy());
 assert.equal(h.renders.length,1,'boot rendered the page');
 assert.equal(h.attachments.length,1,'initial controller is attached');
 assert.equal(h.attachments[0].ctl,h.renders[0].ctl);
 assert.equal(h.attachments[0].page,h.renders[0].page);
 assert.equal(h.renders[0].options.telemetry,h.adapters[0].options,'renderPage receives the selected Grafana provider');
 assert.equal(h.renders[0].ctl.telemetry.snapshot().available,true);
 assert.equal(h.host.used(),1,'boot discovers MCP metadata');assert.equal(h.net.calls.length,0,'no data calls before Metrics is enabled');
});

test('A1 an explicit host provider wins on initial boot and re-render',async t=>{
 const hostProvider={provider:async()=>({}),source:'Host'},h=await bootHarness({hostProvider});t.after(()=>h.destroy());
 assert.equal(h.renders[0]?.options.telemetry,hostProvider,'initial render uses host provider');
 assert.equal(h.rerender(boardPage('6h')),null);
 assert.equal(h.renders[1]?.options.telemetry,hostProvider,'re-render uses host provider');
 assert.equal(h.adapters.length,0,'boot never creates a Grafana adapter over the host');
 assert.equal(h.attachments.length,0);
});

test('A1 re-render destroys the old adapter handle before retiring its controller and rendering again',async t=>{
 const h=await bootHarness();t.after(()=>h.destroy());
 assert.equal(h.rerender(boardPage('6h')),null);
 assert.equal(h.attachments[0]?.destroyed,true,'previous adapter attachment is retired');
 assert.equal(h.renders[0].ctl.liveStatus.listenerCount(),0,'the real handle unsubscribes from the retired controller');
 assert.equal(h.renders[0].ctl.destroyed,true,'previous controller is retired');
 assert.ok(h.events.indexOf('adapter-destroy:0')<h.events.indexOf('controller-destroy:0'),'attachment retires before the old controller');
 assert.ok(h.events.indexOf('controller-destroy:0')<h.events.indexOf('render:1'),'old controller retires before the next render');
});

test('A1 re-render reuses the adapter and supplies the new controller and current normalized page',async t=>{
 const h=await bootHarness();t.after(()=>h.destroy());
 const edited={page:{...boardPage('6h'),title:'Edited board'}};
 assert.equal(h.rerender(edited),null);
 assert.equal(h.adapters.length,1,'the adapter outlives individual renders');
 assert.equal(h.attachments.length,2,'the new render attaches too');
 assert.equal(h.attachments[1].ctl,h.renders[1].ctl,'attachment follows the current controller');
 assert.equal(h.attachments[1].page,h.renders[1].page,'attachment gets the same normalized page as rendering');
 assert.notEqual(h.attachments[1].page,h.attachments[0].page,'the original page is replaced');
 assert.deepEqual(plain(h.attachments[1].page),plain(h.C.normalize(edited)),'the edited source is normalized before attachment');
});

for(const [contract,expected] of [
 ['Prometheus datasource','prom-edited'],['Loki datasource','loki-edited'],['window','now-6h'],['step',90]
])test('A1 re-render queries use the current '+contract,async t=>{
 const h=await bootHarness();t.after(()=>h.destroy());
 const edited=boardPage('6h');edited.tracking.telemetry.grafana={prometheus:'prom-edited',loki:'loki-edited'};
 assert.equal(h.rerender({page:edited}),null);
 await settled();h.renders[1].ctl.telemetry.setEnabled(true);await settled();
 const prom=h.net.calls.filter(c=>c.tool==='query_prometheus'),loki=h.net.calls.filter(c=>c.tool==='query_loki_logs');
 assert.ok(prom.length && loki.length,'current controller issues both signal families');
 if(contract==='Prometheus datasource')assert.deepEqual([...new Set(prom.map(c=>c.input.datasourceUid))],[expected]);
 else if(contract==='Loki datasource')assert.deepEqual([...new Set(loki.map(c=>c.input.datasourceUid))],[expected]);
 else{
  for(const call of prom)assert.equal(contract==='window'?call.input.startTime:call.input.stepSeconds,expected,'current Prometheus '+contract);
  for(const call of loki)assert.equal(contract==='window'?call.input.startRfc3339:call.input.stepSeconds,expected,'current Loki '+contract);
 }
});

for(const contract of ['map retraction','approval action','Allow restart'])test('A1 after re-render '+contract+' follows the current controller',async t=>{
 let needsApproval=true;
 const h=await bootHarness({overrides:{get_annotations:()=>needsApproval?Promise.reject({code:'approval_required'}):null}});t.after(()=>h.destroy());
 const previous=h.renders[0].ctl;
 assert.equal(h.rerender(boardPage('6h')),null);
 await settled();const current=h.renders[1].ctl;
 current.telemetry.apply({ingest:{signals:{rate:{value:123}}}});
 assert.equal(current.telemetry.snapshot().map.ingest.signals.rate.value,123,'there is a current map to retract');
 current.telemetry.setEnabled(true);await settled();
 if(contract==='map retraction'){
  assert.deepEqual(plain(current.telemetry.snapshot().map),{},'refusal clears the current controller map');
 }else if(contract==='approval action'){
  assert.equal(current.liveStatus.label(),'Allow Grafana','approval action belongs to the current controller');
  assert.equal(previous.liveStatus.label(),'','retired controller receives no action');
 }else{
  needsApproval=false;current.liveStatus.run();await settled();
  assert.equal(h.net.calls.filter(c=>c.tool==='get_annotations').length,3,'failed call, one Allow retry, then restarted refresh');
  assert.deepEqual(current.enabledCalls,[true,false,true],'Allow restarts current Metrics');
  assert.deepEqual(previous.enabledCalls,[],'Allow does not restart retired Metrics');
  assert.equal(current.liveStatus.label(),'','successful Allow clears the current action');
  assert.equal(current.telemetry.status().state,'ok');
  assert.ok(current.telemetry.snapshot().map.ingest,'restarted current controller receives fresh data');
 }
});

test('A2 the adapter needs the claude.ai runtime and a grafana, loki or sql signal, local or imported; creating it never calls use()',async()=>{
 const {C}=context();
 const page=C.normalize(boardPage());let used=0;const win={claude:{use:()=>{used++;return Promise.resolve(null);}}};
 assert.equal(C.createTelemetryGrafana(page,{}),null,'A2 no window.claude');
 const throwing={};Object.defineProperty(throwing,'claude',{get(){throw Error('unavailable');}});
 assert.equal(C.createTelemetryGrafana(page,throwing),null,'A2 a throwing claude getter');
 assert.equal(C.createTelemetryGrafana(page,{claude:{}}),null,'A2 claude without use()');
 const only=signals=>C.normalize({sections:[{id:'main',diagram:{nodes:{a:{telemetry:{kind:'service',signals}}},rows:[['a']]}}]});
 for(const signals of [{t:{tempo:'{ }'}},{h:{honeycomb:{dataset:'x'}}}])assert.equal(C.createTelemetryGrafana(only(signals),win),null,'A2 no Grafana-run signal: '+JSON.stringify(signals));
 assert.equal(C.createTelemetryGrafana(C.normalize({nodes:{a:{}},rows:[['a']]}),win),null,'A2 an unbound page');
 for(const signals of [{r:{grafana:'up'}},{r:{loki:'sum(rate({app="a"}[5m]))'}},{r:{sql:'select 1'}}]){
  const adapter=C.createTelemetryGrafana(only(signals),win);
  assert.ok(adapter,'A2 '+Object.keys(signals.r)[0]+' signal');assert.equal(typeof adapter.options.provider,'function');assert.equal(adapter.options.source,'Grafana');assert.equal(typeof adapter.attach,'function');
 }
 // Imported topology: the only Grafana binding sits on an imported edge (consumer edgeTracking).
 const spec=(id,diagram,extra={})=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},...extra,sections:[{id:'main',diagram}]}});
 const provider=spec('provider',{nodes:{api:{title:'API'},store:{title:'Store'}},rows:[['api','store']],edges:[{from:'api',to:'store',label:'Persist'}],topologyExports:{core:{nodes:['api','store'],edges:['api->store']}}});
 const consumer=spec('consumer',{nodes:{local:{title:'Local'}},rows:[['local']],topologyImports:[{spec:'provider',export:'core',as:'shared',edgeTracking:{'api->store':{telemetry:{kind:'call',signals:{rate:{grafana:Q.eventRate}}}}}}]});
 const imported=C.normalize(C.FlowTopology.resolveSource(consumer,{version:1,id:'consumer',specs:[provider,consumer]}));
 assert.ok(C.createTelemetryGrafana(imported,win),'A2 an imported carrier binding counts');
 assert.equal(used,0,'A2 creating the adapter never calls claude.use()');
});

/* Only the chosen nested carrier is bound. A sibling/local binding must not
   accidentally open the gate for an adapter that drops nested imported signals. */
function nestedCarrierPage(C,kind){
 const spec=(id,diagram,extra={})=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},...extra,sections:[{id:'main',diagram}]}});
 const provider=spec('provider',{nodes:{api:{title:'API'},store:{title:'Store'}},rows:[['api','store']],
  edges:[{from:'api',to:'store',label:'Persist'}],topologyExports:{core:{nodes:['api','store'],edges:['api->store']}}});
 const binding=kind==='node'?{nodeTracking:{api:{telemetry:{kind:'service',signals:{rate:{loki:Q.consumed,unit:'req/h'}}}}}}:
  {edgeTracking:{'api->store':{telemetry:{kind:'call',signals:{rate:{grafana:Q.press,unit:'press/h'}}}}}};
 const middle=spec('middle',{nodes:{},rows:[],topologyImports:[{spec:'provider',export:'core',as:'shared',...binding}],
  topologyExports:{nested:{nodes:['shared::api','shared::store'],edges:['shared::api->shared::store']}}});
 const consumer=spec('consumer',{nodes:{local:{title:'Local'}},rows:[['local']],topologyImports:[{spec:'middle',export:'nested',as:'outer'}]},
  {tracking:{telemetry:{grafana:{prometheus:'prom-main',loki:'loki-main'}}}});
 return C.FlowTopology.resolveSource(consumer,{version:1,id:'consumer',specs:[provider,middle,consumer]});
}
for(const kind of ['node','edge']){
 test('A2 a nested imported '+kind+' signal alone enables the adapter without acquiring MCP',()=>{
  const {C}=context(),page=C.normalize(nestedCarrierPage(C,kind)),host=claudeWin(null);
  const adapter=C.createTelemetryGrafana(page,host.win);
  assert.ok(adapter,'the only runnable signal is on the nested imported '+kind);
  assert.equal(typeof adapter.options.provider,'function');assert.equal(adapter.options.source,'Grafana');
  assert.equal(host.used(),0,'adapter discovery is lazy for nested imports too');
 });
 test('A5 a nested imported '+kind+' is queried and mapped under its full resolved identity',async()=>{
  const {C}=context(),s=await setup({page:nestedCarrierPage(C,kind)}),{map,notes}=await s.refresh();
  const node=kind==='node',id=node?'outer::shared::api':'outer::shared::api->outer::shared::store';
  assert.deepEqual(Object.keys(map),[id],'only the nested bound carrier is mapped, without flattening its identity');
  const tool=node?'query_loki_logs':'query_prometheus',input=node?LOKI(Q.consumed):PROM(Q.press);
  assert.deepEqual(s.net.calls.filter(c=>c.tool==='query_prometheus' || c.tool==='query_loki_logs').map(c=>[c.tool,c.input]),[[tool,input]],'exactly the nested signal query uses the consumer datasource');
  const payload=record(s.net.handleMcp,{day:9},tool,input),series=(node?lokiPoints:promPoints)(payload);
  assert.deepEqual(map[id].signals.rate,{value:series.at(-1)[1],series,unit:node?'req/h':'press/h'},'recorded points, latest value and unit reach the nested carrier');
  assert.deepEqual(notes.filter(Boolean),[]);
 });
}

test('A3 the Grafana connector is picked by its offered tools; a connector missing query_prometheus is not picked',async()=>{
 const missing={server:'Partial',tools:TOOLS.filter(t=>t!=='query_prometheus').map(name=>({name}))};
 const github={server:'GitHub',tools:[{name:'search_pull_requests'},{name:'pull_request_read'}]};
 for(const [servers,want,why] of [
  [[JIRA_SERVER,github,missing,GRAFANA_SERVER],'Ops Grafana','A3 the only connector offering all five tools'],
  [[GRAFANA_SERVER,{server:'Grafana',tools:TOOLS.slice()}],'Grafana','A3 "Grafana" wins a tie; tools may be listed as names'],
  [[{server:'First',tools:TOOLS.slice()},{server:'Second',tools:TOOLS.slice()}],'First','A3 else the first qualifying connector']
 ]){
  const s=await setup({servers});await s.refresh();
  assert.ok(s.net.calls.length,why+': calls were made');assert.ok(s.net.calls.every(c=>c.server===want),why);
 }
 for(const servers of [[JIRA_SERVER,github,missing],[]]){
  const s=await setup({servers});
  await assert.rejects(s.refresh(),err=>{assert.equal(err.message,'Add a Grafana connector in claude.ai Settings → Connectors to see live metrics.');return true;},'A3 no qualifying connector');
  assert.equal(s.net.calls.length,0,'A3 no tool call without a qualifying connector');
 }
 const {C}=context();
 assert.equal(typeof C.telemetryGrafanaServer,'function','A3 the picker is a named helper');
 assert.equal(C.telemetryGrafanaServer({servers:[missing]}),null);assert.equal(C.telemetryGrafanaServer([GRAFANA_SERVER]),'Ops Grafana','A3 a bare server array is accepted');
});

test('A4 one refresh makes exactly the budgeted calls with relative 24h times and the page datasource UIDs; deeplinks are generated once',async()=>{
 const s=await setup({holds:['get_annotations']}),signal=new AbortController().signal;
 const pending=s.refresh(signal);await settled();
 try{
  assert.deepEqual(s.net.calls.map(c=>c.tool),['get_annotations'],'A4 get_annotations goes first and alone: no other call starts while it is unresolved');
  assert.deepEqual(s.net.events,['start:get_annotations'],'A4 annotations remain pending and neither Prometheus nor Loki has started');
 }finally{s.net.release('get_annotations');}
 await pending;
 const calls=s.net.calls,events=s.net.events,annotationsResolved=events.indexOf('settle:get_annotations');
 for(const tool of ['query_prometheus','query_loki_logs']){
  assert.ok(annotationsResolved>=0 && events.indexOf('start:'+tool)>annotationsResolved,'A4 '+tool+' starts only after get_annotations resolves: '+events.join(', '));
  assert.ok(events.indexOf('settle:'+tool)>events.indexOf('start:'+tool),'A4 '+tool+' resolves after it starts');
 }
 assert.deepEqual(calls[0].input,{type:'annotation',limit:100},'A4 the annotation read input');
 const queries=calls.filter(c=>c.tool==='query_prometheus' || c.tool==='query_loki_logs').map(c=>[c.tool,c.input]);
 assert.deepEqual(queries,[
  ['query_prometheus',PROM(Q.ingestPerCode)],['query_loki_logs',LOKI(Q.consumed)],['query_prometheus',PROM(Q.press)],
  ['query_prometheus',PROM(Q.eventRate)],['query_prometheus',PROM(Q.eventErrors)],['query_prometheus',PROM(Q.eventP95)],
  ['query_prometheus',PROM(Q.routeIn)],['query_prometheus',PROM(Q.routeLag)],['query_loki_logs',LOKI(Q.pushSent)],['query_loki_logs',LOKI(Q.pushFailed)]
 ],'A4 one range call per grafana and loki signal, in binding order; tempo and honeycomb signals are not queried');
 const links=calls.filter(c=>c.tool==='generate_deeplink');
 assert.deepEqual(links.map(c=>c.input.queries.map(q=>q.expr)),[[Q.ingestPerCode],[Q.consumed],[Q.press],[Q.eventRate,Q.eventErrors,Q.eventP95],[Q.routeIn,Q.routeLag]],'A4 one Explore link per carrier without an authored query link; the push edge keeps its authored one');
 assert.deepEqual(links[3].input,{resourceType:'explore',datasourceUid:'prom-main',queries:[{refId:'A',expr:Q.eventRate},{refId:'B',expr:Q.eventErrors},{refId:'C',expr:Q.eventP95}],timeRange:{from:'now-24h',to:'now'}});
 assert.equal(links[1].input.datasourceUid,'loki-main','A4 a Loki carrier links to its Loki datasource');
 assert.equal(calls.length,1+10+5,'A4 nothing else is called');
 assert.ok(calls.every(c=>c.signal===signal),'A4 every call carries the provider AbortSignal');
 assert.ok(!calls.some(c=>['search_tempo_traces','get_tempo_trace','query_sql','list_datasources'].includes(c.tool)));
 const before=calls.length;await s.refresh();
 assert.deepEqual(calls.slice(before).map(c=>c.tool),['get_annotations'].concat(queries.map(q=>q[0])),'A4 a later refresh repeats the reads, never the deeplinks');
});

test('A5 Day 10 recorded payloads map to the provider shape: series, values, units, silence, markers, observedAt and links',async()=>{
 const s=await setup({day:9}),env={day:9};
 const {map,notes}=await s.refresh();
 assert.deepEqual(notes.filter(Boolean),[],'A5 no failed query');
 assert.deepEqual(Object.keys(map).sort(),['button->mcu','ingest','ingest->notify','mcu->ingest','notify','notify->app'],'A5 every carrier with a grafana or loki signal, by carrier id');
 const rec=(tool,args)=>record(s.net.handleMcp,env,tool,args);
 // Prometheus: one summed series per query, read from data[].values.
 for(const [id,name,expr,unit] of [['button->mcu','rate',Q.press,'press/h'],['mcu->ingest','rate',Q.eventRate,'req/h'],['mcu->ingest','errors',Q.eventErrors,'req/h'],['mcu->ingest','p95',Q.eventP95,'ms'],['ingest->notify','in',Q.routeIn,'msg/h'],['ingest->notify','lag',Q.routeLag,'msgs']]){
  const points=promPoints(rec('query_prometheus',PROM(expr)));
  assert.ok(points.length>=100,'A5 '+id+' '+name+' recorded the hours since traffic began');
  assert.deepEqual(map[id].signals[name],{value:points.at(-1)[1],series:points,unit},'A5 '+id+' '+name);
 }
 // Several series (an unaggregated query: one per label set) are added point by point.
 const byCode=rec('query_prometheus',PROM(Q.ingestPerCode));assert.ok(byCode.data.length>=2,'the recorded ingest payload has several series: '+byCode.data.length);
 const totals=new Map();for(const entry of byCode.data)for(const [t,v] of entry.values){const ms=Math.round(t*1000);totals.set(ms,(totals.get(ms) || 0)+Number(v));}
 const added=[...totals].sort((a,b)=>a[0]-b[0]);
 assert.deepEqual(map.ingest.signals.rate,{value:added.at(-1)[1],series:added,unit:'req/h'},'A5 several series are added point by point');
 // Loki metric queries: data[].values[] of {timestamp, value}. The flip mis-maps this field.
 const consumed=lokiPoints(rec('query_loki_logs',LOKI(Q.consumed)));
 assert.ok(consumed.length>10 && consumed.at(-1)[1]>0,'the recorded notify stream flows on Day 10');
 assert.deepEqual(map.notify.signals.rate,{value:consumed.at(-1)[1],series:consumed,unit:'req/h'},'A5 the Loki metric series and its last value');
 assert.deepEqual(Object.keys(map.notify.signals),['rate'],'A5 the tempo signal is not mapped');
 // #994: the demo now authors measured zero, distinct from missing historical evidence.
 for(const [name,query] of [['rate',Q.pushSent],['errors',Q.pushFailed]]){
  const points=lokiPoints(rec('query_loki_logs',LOKI(query)));assert.ok(points.length>0 && points.every(p=>p[1]===0),'A5 explicit push zeros');
  assert.deepEqual(map['notify->app'].signals[name],{value:0,series:points,unit:'req/h'},'A5 measured silence keeps its samples');
 }
 // Story checks: degraded after the firmware 2.4.1 deploy.
 const ratio=map['mcu->ingest'].signals.errors.value/map['mcu->ingest'].signals.rate.value;
 assert.ok(ratio>0.03 && ratio<0.05,'A5 the event edge error ratio is about 4% at the end of Day 10: '+ratio);
 assert.ok(map['mcu->ingest'].signals.p95.value>350,'A5 p95 is about 410 ms after the deploy');
 for(const id of Object.keys(map))assert.equal(map[id].observedAt,new Date(DAY10_NOW).toISOString(),'A5 observedAt is the newest point: '+id);
 const markers=[['2026-10-29T10:00:00.000Z','deploy','firmware 2.4.0 rollout'],['2026-10-29T10:00:00.000Z','deploy','event-ingest 1.4.0'],['2026-10-29T10:05:00.000Z','deploy','notify 2.0.0'],['2026-10-29T16:00:00.000Z','deploy','firmware 2.4.1 rollout']]
  .map(([at,kind,label])=>({at,kind,label}));
 const sorted=list=>list.slice().sort((a,b)=>a.at<b.at?-1:a.at>b.at?1:a.label<b.label?-1:1);
 for(const id of Object.keys(map))assert.deepEqual(sorted(map[id].markers),sorted(markers),'A5 the window annotations are markers on '+id);
 assert.ok(map.ingest.markers.every((m,i,list)=>!i || list[i-1].at<=m.at),'A5 markers ascend in time');
 assert.equal(map['mcu->ingest'].links.dashboard,DASHBOARD,'A5 the authored dashboard link');
 assert.match(map['mcu->ingest'].links.query,/^https:\/\/acme\.grafana\.net\/explore\?panes=/,'A5 the generated Explore link');
 const explore=decodeURIComponent(map['mcu->ingest'].links.query.split('panes=')[1].split('&')[0].replace(/\+/g,' '));
 assert.match(explore,/http_server_request_duration_seconds_bucket/);assert.match(explore,/"from":"now-24h"/);
 assert.deepEqual(map['notify->app'].links,{query:AUTHORED_QUERY},'A5 an authored query link wins and no dashboard is invented');
 assert.deepEqual(Object.keys(map.ingest.links),['query'],'A5 a carrier without authored links gets the generated one only');
 // The adapter output survives ctl.telemetry.apply() unchanged (it already has the provider shape).
 const t=s.C.createTelemetry(s.page,{},{carriers:carriersOf(s.C,s.page)});t.apply(map);
 assert.deepEqual(plain(t.snapshot().map),map,'A5 apply keeps every field the adapter produced');
});

test('A5 imported carriers map by their resolved id, and the pure mappers read Prometheus, Loki and annotation payloads',async()=>{
 const ctx=context(),C=ctx.C;
 const spec=(id,diagram,extra={})=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},...extra,sections:[{id:'main',diagram}]}});
 const provider=spec('provider',{nodes:{api:{title:'API'},store:{title:'Store'}},rows:[['api','store']],edges:[{from:'api',to:'store',label:'Persist'}],topologyExports:{core:{nodes:['api','store'],edges:['api->store']}}});
 const consumer=spec('consumer',{nodes:{local:{title:'Local'}},rows:[['local']],topologyImports:[{spec:'provider',export:'core',as:'shared',
  nodeTracking:{api:{telemetry:{kind:'service',signals:{rate:{loki:Q.consumed}}}}},edgeTracking:{'api->store':{telemetry:{kind:'call',signals:{rate:{grafana:Q.press,unit:'press/h'}}}}}}]},
  {tracking:{telemetry:{grafana:{prometheus:'prom-main',loki:'loki-main'}}}});
 const resolved=C.FlowTopology.resolveSource(consumer,{version:1,id:'consumer',specs:[provider,consumer]});
 const s=await setup({page:resolved});const {map}=await s.refresh();
 assert.deepEqual(Object.keys(map).sort(),['shared::api','shared::api->shared::store'],'A5 imported node and edge keep their resolved ids');
 assert.ok(map['shared::api->shared::store'].signals.rate.series.length>=100 && map['shared::api'].signals.rate.value>0,'A5 imported carriers carry data');
 for(const name of ['telemetryGrafanaPrometheus','telemetryGrafanaLoki','telemetryGrafanaMarkers'])assert.equal(typeof C[name],'function','A5 '+name+' is a named mapper');
 assert.deepEqual(plain(C.telemetryGrafanaPrometheus({data:[{metric:{},values:[[100,'1'],[160,'NaN'],[220,'2.5']]},{metric:{},values:[[100,'2']]}]})),[[100000,3],[220000,2.5]],'A5 NaN points are dropped and series add by time');
 assert.deepEqual(plain(C.telemetryGrafanaPrometheus([{metric:{},value:[100,'7']}])),[[100000,7]],'A5 a bare instant vector');
 assert.deepEqual(plain(C.telemetryGrafanaPrometheus({data:[],hints:{}})),[]);assert.deepEqual(plain(C.telemetryGrafanaPrometheus('oops')),[]);
 assert.deepEqual(plain(C.telemetryGrafanaLoki({data:[{values:[{timestamp:'100.000',value:4},{timestamp:'160.500',value:'5'}],labels:{}}]})),[[100000,4],[160500,5]],'A5 Loki metric values');
 assert.deepEqual(plain(C.telemetryGrafanaLoki({data:[{timestamp:'100.000',value:3,labels:{}}]})),[[100000,3]],'A5 a Loki instant result');
 assert.deepEqual(plain(C.telemetryGrafanaLoki({data:[{timestamp:'1793000000000000000',line:'push sent',labels:{}}]})),[],'A5 log lines are not a metric');
 const markers=plain(C.telemetryGrafanaMarkers({Payload:[{time:300,text:'b',tags:['incident']},{time:200,text:'a',tags:['deploy','firmware']},{time:50,text:'old',tags:['deploy']},{time:250,text:'',tags:[]}]},100,300));
 assert.deepEqual(markers,[{at:new Date(200).toISOString(),kind:'deploy',label:'a'},{at:new Date(250).toISOString(),kind:'annotation'},{at:new Date(300).toISOString(),kind:'incident',label:'b'}],'A5 markers in the window, ascending, kind from tags');
 assert.deepEqual(plain(C.telemetryGrafanaMarkers([{time:150,text:'x',tags:['release']}],100,300)),[{at:new Date(150).toISOString(),kind:'release',label:'x'}],'A5 a bare annotation array; the first tag names other kinds');
});

test('A6 the page window drives range and step; Day 11 shows the incident and the lag, Day 12 the recovery and the silent push edge',async()=>{
 for(const [window,from,step] of [['6h','now-6h',90],['30m','now-30m',60],['7d','now-7d',2520]]){
  const s=await setup({window});await s.refresh();
  const q=s.net.calls.find(c=>c.tool==='query_prometheus');assert.equal(q?.input.startTime,from,'A6 the '+window+' window starts the Prometheus range');assert.equal(q?.input.stepSeconds,step,'A6 step for '+window);
  const l=s.net.calls.find(c=>c.tool==='query_loki_logs');assert.equal(l?.input.startRfc3339,from,'A6 the '+window+' window starts the Loki range');assert.equal(l?.input.stepSeconds,step,'A6 Loki step for '+window);
 }
 const day11=await setup({day:10}),{map:m11}=await day11.refresh();
 assert.deepEqual(m11.ingest?.markers,[{at:'2026-10-30T18:00:00.000Z',kind:'incident',label:'notify-consumers rebalance'}],'A6 Day 11 incident marker');
 assert.ok(Math.max(...(m11['ingest->notify']?.signals.lag?.series || []).map(p=>p[1]))>=2000,'A6 Day 11 the route queue lags');
 const day12=await setup({day:11}),{map:m12}=await day12.refresh();
 assert.ok(m12['ingest->notify']?.signals.lag?.value<100,'A6 Day 12 the queue has recovered');
 assert.deepEqual(m12['notify->app']?.signals.rate,{value:0,series:lokiPoints(record(day12.net.handleMcp,{day:11},'query_loki_logs',LOKI(Q.pushSent))),unit:'req/h'},'A6 Day 12 push is explicitly measured silent');
 assert.deepEqual(m12.ingest?.markers,[],'A6 no annotation inside Day 12');
 const silent=await setup({scenario:'all-todo'}),{map:quiet}=await silent.refresh();
 assert.deepEqual(quiet['button->mcu']?.signals.rate,{value:0,series:[],unit:'press/h'},'A6 a silent scenario reports zeros');
});

test('A7 through ctl.telemetry: off makes no call, refresh is floored at 60 s, hidden pauses with one catch-up, off aborts',async()=>{
 const raw=boardPage();raw.tracking.telemetry.refreshMs=1000;
 const s=await setup({page:raw}),t=s.C.createTelemetry(s.page,s.adapter.options,{carriers:carriersOf(s.C,s.page)});
 s.adapter.attach({telemetry:t},s.page);await settled();assert.equal(s.net.calls.length,0,'A7 Metrics off: no call');assert.equal(s.host.used(),1,'A7 Metrics off: metadata only');
 t.setEnabled(true);await settled();
 const first=s.net.calls.length;assert.ok(first>0,'A7 Metrics on refreshes at once');assert.equal(t.status().state,'ok');
 assert.equal(Object.keys(plain(t.snapshot().map)).length,6,'A7 the map reaches ctl.telemetry');
 assert.deepEqual([...s.timers.values()].map(x=>x.ms),[60000],'A7 the page asks for 1000 ms; the refresh floor is 60 s');
 s.hide(true);assert.equal(s.timers.size,0,'A7 hidden pauses the refresh');await settled();assert.equal(s.net.calls.length,first);
 s.hide(false);await settled();
 const second=s.net.calls.length;assert.ok(second>first,'A7 visible again: one catch-up refresh');
 assert.equal(s.net.calls.slice(first).filter(c=>c.tool==='get_annotations').length,1,'A7 exactly one catch-up');
 const signal=s.net.calls.at(-1).signal;t.setEnabled(false);assert.equal(signal.aborted,true,'A7 off aborts the in-flight signal');
 assert.equal(s.timers.size,0);t.destroy();await settled();assert.equal(s.net.calls.length,second,'A7 nothing runs after off and destroy');
});

test('A8 a connector failure keeps the previous map and sets the note; one failed query keeps the others fresh and names itself',async()=>{
 let mode=null;
 const peerSeries=[[DAY10_NOW+3600000,12345],[DAY10_NOW+7200000,23456]];
 const s=await setup({overrides:{
  get_annotations:()=>mode==='down'?Promise.reject({code:'server_unavailable',message:'upstream 502',retryable:true}):null,
  query_prometheus:input=>mode!=='bad'?null:input.expr===Q.eventP95
   ?Promise.reject({code:'tool_error',message:'bad_data: parse error at char 3'})
   :Promise.resolve({payload:{data:[{values:peerSeries.map(([ms,value])=>[ms/1000,String(value)])}]}}),
  query_loki_logs:()=>mode==='bad'
   ?Promise.resolve({payload:{data:[{values:peerSeries.map(([ms,value])=>({timestamp:String(ms/1000),value:String(value)}))}]}}):null}});
 const t=s.C.createTelemetry(s.page,s.adapter.options,{carriers:carriersOf(s.C,s.page)});
 s.adapter.attach({telemetry:t},s.page);await settled();t.setEnabled(true);await settled();const good=plain(t.snapshot().map);assert.equal(t.status().state,'ok','A8 the first refresh answers');assert.equal(t.status().note,'','A8 no note on a clean answer');
 mode='down';s.tick(60000);await settled();
 assert.equal(t.status().state,'error','A8 a connector failure reports error');assert.equal(t.status().note,'Grafana did not answer','A8 the connector note');
 assert.deepEqual(plain(t.snapshot().map),good,'A8 the previous map is kept');
 mode='bad';s.tick(60000);await settled();
 assert.equal(t.status().state,'ok','A8 one failed query does not fail the refresh');
 assert.equal(t.status().note,'1 Grafana query failed: mcu->ingest p95: bad_data: parse error at char 3','A8 the note names the carrier, signal and message');
 const map=plain(t.snapshot().map);
 assert.deepEqual(map['mcu->ingest'].signals.p95,good['mcu->ingest'].signals.p95,'A8 the failed signal keeps its previous sample');
 for(const [id,carrier] of Object.entries(good))for(const [name,previous] of Object.entries(carrier.signals)){
  if(id==='mcu->ingest' && name==='p95')continue;
  const expected={value:peerSeries.at(-1)[1],series:peerSeries,unit:previous.unit};
  assert.notDeepEqual(expected,previous,'A8 the second-refresh fixture differs for '+id+' '+name);
  assert.deepEqual(map[id]?.signals[name],expected,'A8 the successful peer has the new value and series: '+id+' '+name);
 }
 mode=null;s.tick(60000);await settled();assert.equal(t.status().note,'','A8 a clean refresh clears the note');
 // A first refresh with a failed query and no previous sample leaves that signal out.
 const fresh=await setup({overrides:{query_prometheus:input=>input.expr===Q.eventP95?Promise.reject({code:'tool_error',message:'boom'}):null}});
 const {map:first,notes}=await fresh.refresh();
 assert.deepEqual(Object.keys(first['mcu->ingest'].signals),['rate','errors'],'A8 no previous sample: the signal is absent');assert.deepEqual(notes.filter(Boolean),['1 Grafana query failed: mcu->ingest p95: boom']);
 // Missing datasource UID is a per-signal failure, not a call.
 const raw=boardPage();delete raw.tracking.telemetry.grafana.loki;const noLoki=await setup({page:raw});const {map:m,notes:n}=await noLoki.refresh();
 assert.equal(noLoki.net.calls.filter(c=>c.tool==='query_loki_logs').length,0,'A8 no Loki call without tracking.telemetry.grafana.loki');
 assert.equal(m.notify,undefined,'A8 a carrier whose every signal failed is absent');assert.match(n.filter(Boolean)[0],/^3 Grafana queries failed; first notify rate: no Loki datasource UID in tracking\.telemetry\.grafana\.loki$/);
});

test('A9 approval, authorization denials and user_changed: one Allow call, no nagging, retracted data',async()=>{
 let approve=false;
 const live=fakeLive();
 const s=await setup({overrides:{get_annotations:()=>approve?null:Promise.reject({code:'approval_required',message:'Approval required'})}});
 const t=s.C.createTelemetry(s.page,s.adapter.options,{carriers:carriersOf(s.C,s.page)});
 const handle=s.adapter.attach({telemetry:t,liveStatus:live},s.page);assert.equal(typeof handle.destroy,'function');
 await settled();t.setEnabled(true);await settled();
 assert.equal(t.status().state,'approval','A9 status approval');assert.equal(t.status().note,'Grafana access needs your approval');
 assert.equal(s.net.calls.length,1,'A9 the first call asked and stopped the refresh');assert.equal(live.label(),'Allow Grafana','A9 the Allow action');
 s.tick(60000);await settled();assert.equal(s.net.calls.length,1,'A9 no unattended call while approval is pending');
 live.action('',null);assert.equal(live.label(),'Allow Grafana','A9 re-shown after another connector clears the slot');
 const jira=()=>{};live.action('Allow Jira',jira);assert.equal(live.label(),'Allow Jira','A9 never over another connector action');live.action('',null);assert.equal(live.label(),'Allow Grafana');
 approve=true;live.run();await settled();
 assert.deepEqual(s.net.calls[1].tool,'get_annotations','A9 Allow makes the same call once');assert.deepEqual(s.net.calls[1].input,s.net.calls[0].input);
 assert.equal(s.net.calls[1].signal,undefined,'A9 the Allow call is a user action without the refresh signal');
 assert.equal(live.label(),'','A9 the action clears');assert.equal(t.enabled(),true);
 assert.equal(t.status().state,'ok','A9 Metrics restarted and refreshed');assert.ok(s.net.calls.length>3);assert.equal(Object.keys(plain(t.snapshot().map)).length,6);
 handle.destroy();
 // Authorization denials retract data and stop calls for the Metrics session.
 for(const [code,note] of [['needs_reauth','Reconnect Grafana in claude.ai Settings → Connectors'],['not_in_manifest','This page is not allowed to read Grafana for your account.'],['blocked_by_policy','This page is not allowed to read Grafana for your account.']]){
  let deny=false;const d=await setup({overrides:{query_prometheus:()=>deny?Promise.reject({code,message:code}):null}});
  const dt=d.C.createTelemetry(d.page,d.adapter.options,{carriers:carriersOf(d.C,d.page)});d.adapter.attach({telemetry:dt,liveStatus:fakeLive()},d.page);
  await settled();dt.setEnabled(true);await settled();assert.ok(Object.keys(plain(dt.snapshot().map)).length,code+' first refresh');
  deny=true;d.tick(60000);await settled();
  assert.equal(dt.status().state,'error',code);assert.equal(dt.status().note,note,'A9 '+code+' note');assert.deepEqual(plain(dt.snapshot().map),{},'A9 '+code+' retracts the map');
  const after=d.net.calls.length;d.tick(60000);await settled();assert.equal(d.net.calls.length,after,'A9 '+code+': no unattended call');
  deny=false;dt.setEnabled(false);dt.setEnabled(true);await settled();assert.ok(d.net.calls.length>after,'A9 '+code+': turning Metrics on again retries');assert.equal(dt.status().state,'ok');
 }
 let changed=false;const u=await setup({overrides:{get_annotations:()=>changed?Promise.reject({code:'user_changed',message:'user changed'}):null}});
 const ut=u.C.createTelemetry(u.page,u.adapter.options,{carriers:carriersOf(u.C,u.page)});u.adapter.attach({telemetry:ut,liveStatus:fakeLive()},u.page);
 await settled();ut.setEnabled(true);await settled();changed=true;u.tick(60000);await settled();assert.deepEqual(plain(ut.snapshot().map),{},'A9 user_changed retracts');
 const frozen=u.net.calls.length;changed=false;ut.setEnabled(false);ut.setEnabled(true);await settled();assert.equal(u.net.calls.length,frozen,'A9 user_changed retires the adapter');
});
function fakeLive(){
 const listeners=[];let label='',fn=null;
 return {action(l,f){label=typeof l==='string'?l:'';fn=label && typeof f==='function'?f:null;listeners.slice().forEach(x=>x());},
  snapshot(){return {actionLabel:fn?label:''};},onChange(f){listeners.push(f);return ()=>{const i=listeners.indexOf(f);if(i>=0)listeners.splice(i,1);};},
  onDestroy(){return ()=>{};},run(){if(fn)fn();},label:()=>fn?label:'',listenerCount:()=>listeners.length};
}

test('A10 sql signals call query_sql at most hourly and reuse the value; without query_sql there is no call',async()=>{
 let clock=DAY10_NOW;const sqlAnswers=[];
 const raw=boardPage();raw.tracking.telemetry.grafana.sql='lake';
 raw.sections[0].diagram.nodes.notify.telemetry.signals.total={sql:'select count(*) as events from push_log',unit:'events'};
 const servers=[{server:'Grafana',tools:TOOLS.concat(['query_sql']).map(name=>({name}))}];
 const s=await setup({page:raw,servers,now:()=>clock,overrides:{query_sql:input=>{sqlAnswers.push(input);return Promise.resolve({content:[],payload:[{events:148000+sqlAnswers.length}]});}}});
 const first=await s.refresh();
 assert.deepEqual(sqlAnswers,[{datasourceUid:'lake',query:'select count(*) as events from push_log'}],'A10 one query_sql call with the sql datasource UID');
 assert.deepEqual(first.map.notify.signals.total,{value:148001,unit:'events'},'A10 the first numeric column of the first row is the value');
 clock+=59*60000;const second=await s.refresh();
 assert.equal(sqlAnswers.length,1,'A10 no query_sql call within the hour');assert.deepEqual(second.map.notify.signals.total,{value:148001,unit:'events'},'A10 the hourly value is reused');
 clock+=2*60000;const third=await s.refresh();
 assert.equal(sqlAnswers.length,2,'A10 query_sql again after an hour');assert.equal(third.map.notify.signals.total.value,148002);
 const {C}=context();assert.equal(typeof C.telemetryGrafanaSql,'function','A10 the query_sql reader is a named helper');
 for(const [payload,want] of [[{rows:[[null,'42']]},42],[{data:[{n:'7.5'}]},7.5],[[[3]],3],[[],null],['oops',null]])assert.equal(C.telemetryGrafanaSql(payload),want,'A10 '+JSON.stringify(payload));
 const without=await setup({page:raw,now:()=>clock});const {notes}=await without.refresh();
 assert.equal(without.net.calls.filter(c=>c.tool==='query_sql').length,0,'A10 no query_sql call when the connector does not offer it');
 assert.deepEqual(notes.filter(Boolean),['1 Grafana query failed: notify total: the Grafana connector does not offer query_sql']);
});

test('A11 docs declare the Grafana connector, its five tools and the call budget',()=>{
 const docs=fs.readFileSync(path.join(ROOT,'docs/live-status.md'),'utf8');
 assert.match(docs,/\{server: "Grafana", tools: \["query_prometheus", "query_loki_logs", "search_tempo_traces", "get_annotations", "generate_deeplink"\]\}/,'A11 the declaration');
 for(const phrase of [/Allow Grafana/,/once per refresh/i,/query_sql/,/at most once an hour/i,/now-24h/,/unverified/i])assert.match(docs,phrase);
});

test('A1 disabled boot does not discover; editor enabling creates the adapter and disabling retires it',async t=>{
 const page=boardPage();page.tracking.telemetry.enabled=false;const h=await bootHarness({page});t.after(()=>h.destroy());
 assert.equal(h.host.used(),0);assert.equal(h.renders[0].ctl.telemetry.snapshot().available,false);
 const edited=boardPage();edited.tracking.telemetry.enabled=true;assert.equal(h.rerender(edited),null);await settled();
 assert.equal(h.renders[1].ctl.telemetry.snapshot().available,true);assert.equal(h.renders[1].ctl.telemetry.enabled(),false);assert.equal(h.net.calls.length,0);
 assert.equal(h.rerender(page),null);await settled();assert.equal(h.renders[2].ctl.telemetry.snapshot().available,false);assert.equal(h.host.used(),1);
});
test('A1 explicit standalone false defeats automatic fallback across editor renders',async t=>{
 const h=await bootHarness({hostProvider:false});t.after(()=>h.destroy());assert.equal(h.host.used(),0);assert.equal(h.renders[0].ctl.telemetry.snapshot().available,false);h.rerender(boardPage('6h'));await settled();assert.equal(h.host.used(),0);assert.equal(h.renders[1].ctl.telemetry.snapshot().available,false);
});

test('A12 history over the raw mock MCP handler preserves Day 9 gaps, explicit push zero and Day 12 degradation',async()=>{
 const s=await setup({day:11}),range={from:'2026-10-21T00:00:00.000Z',to:'2026-11-01T00:00:00.000Z'},signal=new AbortController().signal,notes=[];
 const map=await s.adapter.options.history(s.bindings(),range,signal,{note:t=>notes.push(t)});
 assert.deepEqual(notes.filter(Boolean),[]);
 const expected=s.bindings().flatMap(b=>Object.values(b.signals)).filter(v=>['grafana','loki'].includes(v.source)).length;
 assert.equal(s.net.calls.length,expected,'one range per explicit supported binding and no annotation/link calls');
 for(const call of s.net.calls){assert.ok(['query_prometheus','query_loki_logs'].includes(call.tool));assert.equal(call.input.stepSeconds,86400);assert.equal(call.input.startTime || call.input.startRfc3339,range.from);assert.equal(call.input.endTime || call.input.endRfc3339,range.to);}
 const day9=s.C.telemetryHistoryDay(map,{at:'2026-10-29T00:00:00.000Z'}),day12=s.C.telemetryHistoryDay(map,{at:range.to});
 assert.equal(day9['mcu->ingest'],undefined,'Day 9 missing events are not borrowed from Live or zero-filled');
 assert.equal(day9['notify->app'].signals.rate.value,0,'explicit Day 9 push silence');
 assert.ok(day12['mcu->ingest'].signals.errors.value/day12['mcu->ingest'].signals.rate.value>.01,'Day 12 event exceeds its ratio limit');
});
