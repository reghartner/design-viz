'use strict';
/* #943 contract matrix: the claude.ai Grafana telemetry adapter (src/viewer/telemetry-claude.js).
   Recorded payloads come from the mock Grafana MCP handler (deploy/cloudflare/mock-grafana-mcp/mcp.mjs)
   for pinned story days, wrapped in the claude.ai CallToolResult envelope (payload = structuredContent,
   else the first text block parsed as JSON, else that text).
| row | rule |
|---|---|
| A1 | `viewer/telemetry-claude.js` ships in the standalone entrypoint only; the standalone boot builds the adapter with `createTelemetryGrafana(page, window)` when no `window.flowviewTelemetry` host provider is set. |
| A2 | `createTelemetryGrafana(page, win)` is null without `win.claude.use` (absent or throwing getter) and on pages without a grafana, loki or sql signal; otherwise `{options: {provider, source: 'Grafana'}, attach(ctl, page)}`. Imported carriers count. Creating it never calls `use()`. |
| A3 | The connector is picked by offered tools: all of query_prometheus, query_loki_logs, search_tempo_traces, get_annotations, generate_deeplink. A connector missing one (query_prometheus) is not picked; Jira-only and GitHub-only connectors are not picked; "Grafana" wins a tie, else the first qualifying one. None → the add-connector note and no tool call. |
| A4 | One refresh (default 24h window) makes exactly: get_annotations first and alone, one query_prometheus range call per grafana signal, one query_loki_logs metric range call per loki signal, generate_deeplink once per carrier without an authored query link; relative times now-24h..now, stepSeconds 360, the page's datasource UIDs, the provider's AbortSignal on every call. tempo and honeycomb signals are not queried. A later refresh repeats the queries but not the deeplinks. |
| A5 | Day 10 recorded payloads map to the provider shape: every Prometheus and Loki series as ascending [ms, number] points (several series added point by point), value = the last point, the authored unit; a query with no data is value 0 with no points; observedAt = the newest point; markers = the window's annotations ascending as {at, kind, label}; links = authored dashboard/query plus the generated Explore link. Imported carriers map by their resolved id. |
| A6 | The page window drives the range and step (6h → now-6h, 90 s; 30m → 60 s floor); Day 11 shows the incident marker and the lagging queue; Day 12 the recovered queue and the still-silent push edge. |
| A7 | Through ctl.telemetry: Metrics off makes no call; the refresh never runs faster than 60 s even when the page asks for less; a hidden document pauses and returns with one catch-up; Metrics off aborts the signal. |
| A8 | A connector-level failure (server_unavailable) keeps the previous map and sets status().note; a tool_error on one query keeps the other carriers fresh, keeps that signal's previous sample and reports the failed query in status().note. |
| A9 | approval_required → status `approval`, no further connector call in that Metrics session, an "Allow Grafana" action on ctl.liveStatus (re-shown after another connector clears the slot, never over another connector's action); Allow makes the same call once and restarts Metrics. Authorization denials clear the map, set the note and stop calls until Metrics is turned on again; user_changed retires the adapter. |
| A10 | sql signals call query_sql at most once an hour (the value is reused in between); without query_sql on the connector there is no call and the note says so. |
| A11 | docs/live-status.md declares the Grafana connector with its five tools and states the per-refresh call budget. |
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

/* A vm context with the engine (createTelemetry, telemetryBindings, normalize, FlowTopology)
   and, when it exists, the adapter module taken from the standalone entrypoint. */
function context(){
 const timers=new Map(),listeners={};let serial=0;
 const doc={hidden:false,visibilityState:'visible',addEventListener:(t,f)=>{(listeners[t]??=new Set()).add(f);},removeEventListener:(t,f)=>listeners[t]?.delete(f),
  createElement:()=>({style:{},setAttribute(){},appendChild(){}}),dispatch:t=>[...(listeners[t]||[])].forEach(f=>f({type:t}))};
 const setTimer=(fn,ms)=>{const id=++serial;timers.set(id,{fn,ms});return id;},clearTimer=id=>timers.delete(id);
 const C={URL,console,AbortController,document:doc,setTimeout:setTimer,clearTimeout:clearTimer};
 vm.runInNewContext(entrypoint('native').source,C);
 const record=entrypoint('standalone').records.find(r=>r.file==='viewer/telemetry-claude.js');
 if(record)vm.runInNewContext(record.source,C);
 return {C,doc,timers,
  hide(on){doc.hidden=on;doc.visibilityState=on?'hidden':'visible';doc.dispatch('visibilitychange');},
  tick(ms){const entry=[...timers].find(([,x])=>ms===undefined || x.ms===ms);assert.ok(entry,'a refresh timer'+(ms?' of '+ms+' ms':'')+' is armed');timers.delete(entry[0]);entry[1].fn();}};
}
function adapterApi(C){
 assert.equal(typeof C.createTelemetryGrafana,'function','A1 createTelemetryGrafana comes from src/viewer/telemetry-claude.js in the standalone entrypoint');
 return C;
}
/* Every carrier of the normalized page, as ctl.liveStatus walks it (local and imported). */
function carriersOf(C,page){
 return fn=>C.sectionRecords(page).forEach(record=>{const d=record.section.diagram || {};
  Object.keys(d.nodes || {}).forEach(id=>fn(d.nodes[id],id,page));
  (Array.isArray(d.edges)?d.edges:[]).forEach(edge=>fn(edge,edge && typeof edge==='object'?edge.from+'->'+edge.to:null,page));});
}
/* The viewer's MCP namespace, answering through the mock handler for a pinned day. */
async function mockMcp(env,servers,overrides={}){
 const {handleMcp}=await loadMock();const calls=[];
 const mcp={
  listTools:()=>Promise.resolve({servers:plain(servers)}),
  callTool(server,tool,input,options){
   const call={server,tool,input:plain(input),signal:options && options.signal};calls.push(call);
   if(overrides[tool]){const answer=overrides[tool](call.input,calls);if(answer)return answer;}
   const reply=handleMcp({jsonrpc:'2.0',id:calls.length,method:'tools/call',params:{name:tool,arguments:call.input}},env);
   if(reply.error)return Promise.reject({code:'bad_request',message:reply.error.message});
   const result=reply.result,text=result.content[0].text;
   if(result.isError)return Promise.reject({code:'tool_error',message:text,result});
   let payload=result.structuredContent;if(payload===undefined){try{payload=JSON.parse(text);}catch{payload=text;}}
   return Promise.resolve({content:result.content,structuredContent:result.structuredContent,payload});
  }};
 return {mcp,calls,handleMcp};
}
const GRAFANA_SERVER={server:'Ops Grafana',authStatus:'connected',tools:TOOLS.map(name=>({name,description:''}))};
const JIRA_SERVER={server:'Atlassian',tools:[{name:'getAccessibleAtlassianResources'},{name:'searchJiraIssuesUsingJql'}]};
function claudeWin(mcp){let used=0;return {win:{claude:{use:name=>{used++;return Promise.resolve(name==='mcp'?mcp:null);}}},used:()=>used};}
async function setup({day=9,scenario,window,servers=[JIRA_SERVER,GRAFANA_SERVER],overrides,page,now}={}){
 const ctx=context(),C=adapterApi(ctx.C);
 const raw=page || boardPage(window),normalized=C.normalize(raw);
 const env={day};if(scenario)env.scenario=scenario;
 const net=await mockMcp(env,servers,overrides),host=claudeWin(net.mcp);
 const adapter=C.createTelemetryGrafana(normalized,host.win,now);
 assert.ok(adapter && adapter.options && typeof adapter.options.provider==='function','A2 a page with Grafana signals in claude.ai gets the adapter');
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

test('A1 the adapter ships in the standalone entrypoint only and the boot builds it after the host provider',()=>{
 const record=entrypoint('standalone').records.find(r=>r.file==='viewer/telemetry-claude.js');
 assert.ok(record,'A1 viewer/telemetry-claude.js is a standalone source (src/source-bundles.json)');
 assert.match(entrypoint('standalone').body,/function createTelemetryGrafana\(/);
 for(const name of ['native','workbench','forge'])assert.doesNotMatch(entrypoint(name).body,/function createTelemetryGrafana\(/,'A1 '+name+' has no claude.ai adapter');
 const boot=fs.readFileSync(path.join(ROOT,'src/boot.flowview.js'),'utf8');
 assert.match(boot,/window\.flowviewTelemetry[\s\S]{0,400}createTelemetryGrafana\(page, window\)/,'A1 the host provider wins; otherwise the boot builds the Grafana adapter');
 assert.match(boot,/\.attach\(ctl, page\)/,'A1 every render attaches the adapter to its controller');
});

test('A2 the adapter needs the claude.ai runtime and a grafana, loki or sql signal, local or imported; creating it never calls use()',async()=>{
 const {C}=context();adapterApi(C);
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
 const {C}=context();adapterApi(C);
 assert.equal(typeof C.telemetryGrafanaServer,'function','A3 the picker is a named helper');
 assert.equal(C.telemetryGrafanaServer({servers:[missing]}),null);assert.equal(C.telemetryGrafanaServer([GRAFANA_SERVER]),'Ops Grafana','A3 a bare server array is accepted');
});

test('A4 one refresh makes exactly the budgeted calls with relative 24h times and the page datasource UIDs; deeplinks are generated once',async()=>{
 const s=await setup(),signal=new AbortController().signal;
 await s.refresh(signal);
 const calls=s.net.calls;
 assert.equal(calls[0].tool,'get_annotations','A4 the annotation read goes first, alone');assert.deepEqual(calls[0].input,{type:'annotation',limit:100});
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
 // Several series (an unaggregated query: one per code) are added point by point.
 const byCode=rec('query_prometheus',PROM(Q.ingestPerCode));assert.equal(byCode.data.length,2,'the recorded ingest payload has a 200 and a 503 series');
 const added=byCode.data[0].values.map(([t,v],i)=>[Math.round(t*1000),Number(v)+Number(byCode.data[1].values[i][1])]);
 assert.deepEqual(map.ingest.signals.rate,{value:added.at(-1)[1],series:added,unit:'req/h'},'A5 several series are added point by point');
 // Loki metric queries: data[].values[] of {timestamp, value}. The flip mis-maps this field.
 const consumed=lokiPoints(rec('query_loki_logs',LOKI(Q.consumed)));
 assert.ok(consumed.length>10 && consumed.at(-1)[1]>0,'the recorded notify stream flows on Day 10');
 assert.deepEqual(map.notify.signals.rate,{value:consumed.at(-1)[1],series:consumed,unit:'req/h'},'A5 the Loki metric series and its last value');
 assert.deepEqual(Object.keys(map.notify.signals),['rate'],'A5 the tempo signal is not mapped');
 // The push edge is silent: the query ran and matched nothing.
 assert.deepEqual(rec('query_loki_logs',LOKI(Q.pushSent)).data,[],'the recorded push stream is empty');
 assert.deepEqual(map['notify->app'].signals,{rate:{value:0,series:[],unit:'req/h'},errors:{value:0,series:[],unit:'req/h'}},'A5 no data is value 0 with no points');
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
 const ctx=context(),C=adapterApi(ctx.C);
 const spec=(id,diagram,extra={})=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},...extra,sections:[{id:'main',diagram}]}});
 const provider=spec('provider',{nodes:{api:{title:'API'},store:{title:'Store'}},rows:[['api','store']],edges:[{from:'api',to:'store',label:'Persist'}],topologyExports:{core:{nodes:['api','store'],edges:['api->store']}}});
 const consumer=spec('consumer',{nodes:{local:{title:'Local'}},rows:[['local']],topologyImports:[{spec:'provider',export:'core',as:'shared',
  nodeTracking:{api:{telemetry:{kind:'service',signals:{rate:{loki:Q.consumed}}}}},edgeTracking:{'api->store':{telemetry:{kind:'call',signals:{rate:{grafana:Q.press,unit:'press/h'}}}}}}]},
  {tracking:{telemetry:{grafana:{prometheus:'prom-main',loki:'loki-main'}}}});
 const resolved=C.FlowTopology.resolveSource(consumer,{version:1,id:'consumer',specs:[provider,consumer]});
 const s=await setup({page:resolved});const {map}=await s.refresh();
 assert.deepEqual(Object.keys(map).sort(),['shared::api','shared::api->shared::store'],'A5 imported node and edge keep their resolved ids');
 assert.ok(map['shared::api->shared::store'].signals.rate.series.length>=100 && map['shared::api'].signals.rate.value>0,'A5 imported carriers carry data');
 assert.equal(typeof C.telemetryGrafanaPrometheus,'function');assert.equal(typeof C.telemetryGrafanaLoki,'function');assert.equal(typeof C.telemetryGrafanaMarkers,'function');
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
  const q=s.net.calls.find(c=>c.tool==='query_prometheus');assert.equal(q.input.startTime,from,'A6 '+window);assert.equal(q.input.stepSeconds,step,'A6 step for '+window);
  const l=s.net.calls.find(c=>c.tool==='query_loki_logs');assert.equal(l.input.startRfc3339,from);assert.equal(l.input.stepSeconds,step);
 }
 const day11=await setup({day:10}),{map:m11}=await day11.refresh();
 assert.deepEqual(m11.ingest.markers,[{at:'2026-10-30T18:00:00.000Z',kind:'incident',label:'notify-consumers rebalance'}],'A6 Day 11 incident marker');
 assert.ok(Math.max(...m11['ingest->notify'].signals.lag.series.map(p=>p[1]))>=2000,'A6 Day 11 the route queue lags');
 const day12=await setup({day:11}),{map:m12}=await day12.refresh();
 assert.ok(m12['ingest->notify'].signals.lag.value<100,'A6 Day 12 the queue has recovered');
 assert.deepEqual(m12['notify->app'].signals.rate,{value:0,series:[],unit:'req/h'},'A6 Day 12 push is still silent');
 assert.deepEqual(m12.ingest.markers,[],'A6 no annotation inside Day 12');
 const silent=await setup({scenario:'all-todo'}),{map:quiet}=await silent.refresh();
 assert.deepEqual(quiet['button->mcu'].signals.rate,{value:0,series:[],unit:'press/h'},'A6 a silent scenario reports zeros');
});

test('A7 through ctl.telemetry: off makes no call, refresh is floored at 60 s, hidden pauses with one catch-up, off aborts',async()=>{
 const raw=boardPage();raw.tracking.telemetry.refreshMs=1000;
 const s=await setup({page:raw}),t=s.C.createTelemetry(s.page,s.adapter.options,{carriers:carriersOf(s.C,s.page)});
 await settled();assert.equal(s.net.calls.length,0,'A7 Metrics off: no call');assert.equal(s.host.used(),0,'A7 Metrics off: use() is not called');
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
 const s=await setup({overrides:{
  get_annotations:()=>mode==='down'?Promise.reject({code:'server_unavailable',message:'upstream 502',retryable:true}):null,
  query_prometheus:input=>mode==='bad' && input.expr===Q.eventP95?Promise.reject({code:'tool_error',message:'bad_data: parse error at char 3'}):null}});
 const t=s.C.createTelemetry(s.page,s.adapter.options,{carriers:carriersOf(s.C,s.page)});
 t.setEnabled(true);await settled();const good=plain(t.snapshot().map);assert.equal(t.status().state,'ok');assert.equal(t.status().note,'');
 mode='down';s.tick(60000);await settled();
 assert.equal(t.status().state,'error');assert.equal(t.status().note,'Grafana did not answer','A8 the connector note');
 assert.deepEqual(plain(t.snapshot().map),good,'A8 the previous map is kept');
 mode='bad';s.tick(60000);await settled();
 assert.equal(t.status().state,'ok','A8 one failed query does not fail the refresh');
 assert.equal(t.status().note,'1 Grafana query failed: mcu->ingest p95: bad_data: parse error at char 3','A8 the note names the carrier, signal and message');
 const map=plain(t.snapshot().map);
 assert.deepEqual(map['mcu->ingest'].signals.p95,good['mcu->ingest'].signals.p95,'A8 the failed signal keeps its previous sample');
 assert.deepEqual(map['mcu->ingest'].signals.rate,good['mcu->ingest'].signals.rate,'A8 the other signals are fresh (same pinned day)');
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
 t.setEnabled(true);await settled();
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
 for(const [code,note] of [['needs_reauth','Reconnect Grafana in claude.ai Settings → Connectors'],['not_in_manifest','This page is not allowed to read Grafana for your account.'],['blocked_by_policy','This page is not allowed to read Grafana for your account.'],['server_not_connected','Add a Grafana connector in claude.ai Settings → Connectors to see live metrics.']]){
  let deny=false;const d=await setup({overrides:{query_prometheus:()=>deny?Promise.reject({code,message:code}):null}});
  const dt=d.C.createTelemetry(d.page,d.adapter.options,{carriers:carriersOf(d.C,d.page)});d.adapter.attach({telemetry:dt,liveStatus:fakeLive()},d.page);
  dt.setEnabled(true);await settled();assert.ok(Object.keys(plain(dt.snapshot().map)).length,code+' first refresh');
  deny=true;d.tick(60000);await settled();
  assert.equal(dt.status().state,'error',code);assert.equal(dt.status().note,note,'A9 '+code+' note');assert.deepEqual(plain(dt.snapshot().map),{},'A9 '+code+' retracts the map');
  const after=d.net.calls.length;d.tick(60000);await settled();assert.equal(d.net.calls.length,after,'A9 '+code+': no unattended call');
  deny=false;dt.setEnabled(false);dt.setEnabled(true);await settled();assert.ok(d.net.calls.length>after,'A9 '+code+': turning Metrics on again retries');assert.equal(dt.status().state,'ok');
 }
 let changed=false;const u=await setup({overrides:{get_annotations:()=>changed?Promise.reject({code:'user_changed',message:'user changed'}):null}});
 const ut=u.C.createTelemetry(u.page,u.adapter.options,{carriers:carriersOf(u.C,u.page)});u.adapter.attach({telemetry:ut,liveStatus:fakeLive()},u.page);
 ut.setEnabled(true);await settled();changed=true;u.tick(60000);await settled();assert.deepEqual(plain(ut.snapshot().map),{},'A9 user_changed retracts');
 const frozen=u.net.calls.length;changed=false;ut.setEnabled(false);ut.setEnabled(true);await settled();assert.equal(u.net.calls.length,frozen,'A9 user_changed retires the adapter');
});
function fakeLive(){
 const listeners=[];let label='',fn=null;
 return {action(l,f){label=typeof l==='string'?l:'';fn=label && typeof f==='function'?f:null;listeners.slice().forEach(x=>x());},
  snapshot(){return {actionLabel:fn?label:''};},onChange(f){listeners.push(f);return ()=>{const i=listeners.indexOf(f);if(i>=0)listeners.splice(i,1);};},
  onDestroy(){return ()=>{};},run(){if(fn)fn();},label:()=>fn?label:''};
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
 const {C}=context();adapterApi(C);assert.equal(typeof C.telemetryGrafanaSql,'function');
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
