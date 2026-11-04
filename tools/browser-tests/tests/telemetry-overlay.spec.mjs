/* Contract matrix: #939, the Metrics button and the host telemetry provider (PR 1), and the canvas cues (PR 2).
| row | rule | fixture | assertion |
|---|---|---|---|
| P1 | Metrics is hidden without a telemetry provider or demo | native mount of an imported-topology consumer with Jira evidence and no `telemetry` option | Live is visible; no visible Metrics button and no metrics connector text |
| P2 | With a provider, Metrics is present and off by default | same page with `telemetry.provider` | Metrics visible with aria-pressed false, "Metrics: not connected", provider never called after first paint |
| P3 | Turning Metrics on calls the provider with every bound carrier, local and imported | click Metrics | one call with local node + edge and imported node + edge ids (unbound carriers absent); "Metrics: connected, refreshed <time>"; ctl.telemetry holds the map; Live stays pressed |
| P4 | Turning Metrics off stops and clears | click Metrics again | aria-pressed false, "Metrics: not connected", map empty, the signal aborted, no further call |
| P5 | Standalone boot hands `window.flowviewTelemetry` to the page | built template with an init script provider | Metrics visible; on calls the provider with the bound carrier |
| P6 | Metrics off paints no canvas cue | native mount of a consumer with local and imported bound carriers, Jira map applied, telemetry provider | no `.dv-metrics-*` element and no `data-metrics-state` before the click |
| P7 | On: streams, ghost, seals; unbound unchanged; local and imported alike | click Metrics | 4 moving packets on the 1300 req/h local edge and 3 on the 500 req/h imported edge; a ghost on the silent Done edge, whose stroke is dimmed; proven seals on the local and imported bound nodes; the unbound node and edge carry nothing; Jira appearance unchanged |
| P8 | Off removes every cue | click again | no cue element or attribute left; Jira appearance unchanged |
| P9 | Reduced motion shows static packets | `reducedMotion: 'reduce'` | moving packets hidden, static packets visible |
| P10 | Ordinary step packets and failure packets are untouched by Metrics | Metrics off, then on | the `circle.pkt` and `.comm-packet` counts are equal |
| P11 | `#live=demo` mounts the demo telemetry so Metrics follows the demo day | pending #976 (demo telemetry builder and timeline block) | pending #976 |
*/
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import vm from 'node:vm';
import sourceLoader from '../../../tools/source-loader.cjs';
import {test,expect} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';

const QUEUE=()=>({kind:'queue',signals:{lag:{grafana:'max(kafka_consumergroup_lag{topic="device-events"})',unit:'msgs'}},proof:{lag:{max:500}}});
const CALL=()=>({kind:'call',signals:{rate:{grafana:'sum(rate(push_sent_total[5m]))*3600',unit:'req/h'},errors:{grafana:'sum(rate(push_failed_total[5m]))*3600',unit:'req/h'}},proof:{rate:{min:1},errors:{maxRatioOf:'rate',max:0.01}}});
const SERVICE=()=>({kind:'service',signals:{rate:{grafana:'sum(rate(http_requests_total{app="api"}[5m]))*3600',unit:'req/h'}},proof:{rate:{min:1}}});
const PANEL={id:'status',type:'live-status',title:'Status'};
const JIRA={'LOC-1':{state:'done'},'LOC-2':{state:'active'},'IMP-1':{state:'done'}};
const BOUND_IDS=['ingest','shared::api','shared::store','ingest->app','shared::api->shared::store'];

function importedSpec(){
 const spec=(id,diagram,extra={})=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},...extra,sections:[{diagram}]}});
 const provider=spec('provider',{nodes:{api:{title:'Imported API'},store:{title:'Imported store',telemetry:{use:'db',table:'events'}},cache:{title:'Imported cache'}},rows:[['api','store','cache']],
  edges:[{from:'api',to:'store',label:'Persist'},{from:'api',to:'cache',label:'Warm'}],topologyExports:{core:{nodes:['api','store','cache'],edges:['api->store','api->cache']}}},
  {tracking:{telemetry:{templates:{db:{kind:'service',params:['table'],signals:{writes:{sql:'select count(*) from $table'}}}}}}});
 const consumer=spec('consumer',{nodes:{ingest:{title:'Ingest',tickets:['LOC-1'],telemetry:QUEUE()},app:{title:'Resident app',tickets:['LOC-2']}},rows:[['ingest','app']],
  edges:[{from:'ingest',to:'app',label:'notify',tickets:['LOC-2'],telemetry:CALL()}],panels:[PANEL],
  topologyImports:[{spec:'provider',export:'core',as:'shared',position:{x:80,y:260},nodeTracking:{api:{tickets:['IMP-1'],telemetry:SERVICE()}},edgeTracking:{'api->store':{telemetry:CALL()}}}]});
 consumer.page.tracking={jira:{site:'https://jira.test'}};
 const context=vm.createContext({});vm.runInContext(sourceLoader.composeSources(['validator.js','canon.js']),context);
 const resolved=JSON.parse(JSON.stringify(context.FlowTopology.resolveSource(consumer,{version:1,id:'consumer',specs:[provider,consumer]})));
 expect(consumer.page.sections[0].diagram.nodes['shared::api'],'the consumer source is not modified').toBeUndefined();
 expect(resolved.page.sections[0].diagram.nodes['shared::api'].telemetry).toEqual(SERVICE());
 return resolved;
}
async function mountNative(page,server,withTelemetry){
 await page.setViewportSize({width:1440,height:1000});
 await writeFile(path.join(server.root,'telemetry-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
 await writeFile(path.join(server.root,'telemetry-native.html'),'<div id="host"></div><script type="module">import {mountNativeViewer} from "./telemetry-native.js";window.mount=mountNativeViewer;</script>');
 await page.goto(server.origin+'/telemetry-native.html');await page.waitForFunction(()=>!!window.mount);
 await page.evaluate(({spec,withTelemetry,jira})=>{
  window.telemetryCalls=[];window.telemetryAborts=0;
  const provider=(bindings,signal)=>{
   window.telemetryCalls.push(JSON.parse(JSON.stringify(bindings)));signal.addEventListener('abort',()=>{window.telemetryAborts++;});
   return Promise.resolve(Object.fromEntries(bindings.map(binding=>[binding.id,{signals:Object.fromEntries(Object.keys(binding.signals).map(name=>[name,{value:1,series:[[Date.UTC(2026,10,3,9),1],[Date.UTC(2026,10,3,10),1]]}])),observedAt:'2026-11-03T10:00:00Z'}])));
  };
  window.viewer=window.mount(document.querySelector('#host'),spec,withTelemetry?{telemetry:{provider}}:{});
  window.viewer.controller.liveStatus.apply(jira);
 },{spec:importedSpec(),withTelemetry,jira:JIRA});
 const panel=page.locator('#host .pt-live-status');
 await expect(panel.getByRole('button',{name:'Live',exact:true})).toBeVisible();
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(resolve,50)))));
 return panel;
}
const metricsButton=panel=>panel.getByRole('button',{name:'Metrics',exact:true});

test('P1 the Metrics button is hidden without a telemetry provider',async({page,server})=>{
 const panel=await mountNative(page,server,false);
 await expect(metricsButton(panel)).toHaveCount(0);
 await expect(panel.locator('.dv-live-metrics-connection')).toBeHidden();
 expect(await page.evaluate(()=>window.viewer.controller.telemetry.status().state)).toBe('absent');
});

test('P2 P3 P4 Metrics is off by default, turns the provider on for local and imported carriers, and clears when off',async({page,server})=>{
 const panel=await mountNative(page,server,true),metrics=metricsButton(panel),status=panel.locator('.dv-live-metrics-connection');
 await expect(metrics).toBeVisible();await expect(metrics).toHaveAttribute('aria-pressed','false');
 await expect(status).toBeVisible();await expect(status).toHaveText('Metrics: not connected');await expect(status).toHaveAttribute('data-state','disconnected');
 expect(await page.evaluate(()=>window.telemetryCalls.length),'P2 no provider call while Metrics is off').toBe(0);
 const live=panel.getByRole('button',{name:'Live',exact:true});await expect(live).toHaveAttribute('aria-pressed','true');

 await metrics.click();
 await expect(metrics).toHaveAttribute('aria-pressed','true');
 await expect(status).toHaveText(/^Metrics: connected, refreshed /);await expect(status).toHaveAttribute('data-state','connected');
 const calls=await page.evaluate(()=>window.telemetryCalls);
 expect(calls.length,'P3 one provider call per click').toBe(1);
 expect(calls[0].map(binding=>binding.id),'P3 every bound carrier, local and imported, and no unbound one').toEqual(BOUND_IDS);
 const byId=Object.fromEntries(calls[0].map(binding=>[binding.id,binding]));
 expect(byId['shared::api']).toEqual({id:'shared::api',kind:'service',signals:{rate:{source:'grafana',query:'sum(rate(http_requests_total{app="api"}[5m]))*3600',unit:'req/h'}},proof:{rate:{min:1}},links:{},card:null});
 expect(byId['shared::store'].signals).toEqual({writes:{source:'sql',query:'select count(*) from events',unit:null}});
 expect(byId['shared::api->shared::store'].kind).toBe('call');expect(byId['ingest->app'].kind).toBe('call');expect(byId.ingest.kind).toBe('queue');
 const on=await page.evaluate(()=>window.viewer.controller.telemetry.snapshot());
 expect(on.enabled).toBe(true);expect(Object.keys(on.map)).toEqual(BOUND_IDS);expect(on.map['shared::api'].signals.rate.value).toBe(1);
 await expect(live,'P3 Jira Live is untouched').toHaveAttribute('aria-pressed','true');

 await metrics.click();
 await expect(metrics).toHaveAttribute('aria-pressed','false');
 await expect(status).toHaveText('Metrics: not connected');await expect(status).toHaveAttribute('data-state','disconnected');
 const off=await page.evaluate(()=>({snapshot:window.viewer.controller.telemetry.snapshot(),aborts:window.telemetryAborts,calls:window.telemetryCalls.length}));
 expect(off.snapshot.enabled).toBe(false);expect(off.snapshot.map,'P4 off clears the map').toEqual({});
 expect(off.aborts,'P4 off aborts the provider signal').toBe(1);expect(off.calls,'P4 off makes no further call').toBe(1);
 await expect(live).toHaveAttribute('aria-pressed','true');
});

test('P5 standalone boot passes window.flowviewTelemetry to the page',async({page,server})=>{
 await page.setViewportSize({width:1440,height:1000});
 const spec={page:{title:'Telemetry boot',tracking:{jira:{site:'https://jira.test'}},sections:[{id:'main',diagram:{nodes:{ingest:{title:'Ingest',tickets:['LOC-1'],telemetry:QUEUE()},app:{title:'App',tickets:['LOC-2']}},rows:[['ingest','app']],edges:[{from:'ingest',to:'app',label:'notify'}],panels:[PANEL]}}]}};
 await page.addInitScript(()=>{window.telemetryCalls=[];window.flowviewTelemetry={provider:async bindings=>{window.telemetryCalls.push(bindings.map(binding=>binding.id));return {ingest:{signals:{lag:{value:3}}}};}};});
 const file=path.join(server.root,'telemetry-boot.json'),out=path.join(server.root,'telemetry-boot.html');
 await writeFile(file,JSON.stringify(spec));execFileSync('python3',[path.join(repo,'tools/inject.py'),file,path.join(repo,'template/flowview.html'),out]);
 await page.goto(server.origin+'/telemetry-boot.html');
 const panel=page.locator('#docview .pt-live-status'),metrics=metricsButton(panel);
 await expect(metrics).toBeVisible();await expect(metrics).toHaveAttribute('aria-pressed','false');
 expect(await page.evaluate(()=>window.telemetryCalls.length)).toBe(0);
 await metrics.click();
 await expect(panel.locator('.dv-live-metrics-connection')).toHaveText(/^Metrics: connected, refreshed /);
 expect(await page.evaluate(()=>window.telemetryCalls)).toEqual([['ingest']]);
});

/* PR 2: canvas cues. Edge indices: 0 ingest->app (flowing call), 1 app->push (silent Done call),
   2 ingest->push (unbound), 3 shared::api->shared::store (imported flowing call). */
const CUE_JIRA={'LOC-1':{state:'done'},'LOC-2':{state:'active'},'LOC-3':{state:'done'},'LOC-4':{state:'done'},'LOC-5':{state:'done'},'IMP-1':{state:'done'},'IMP-2':{state:'done'}};
const T1=Date.UTC(2026,10,3,9),T2=Date.UTC(2026,10,3,10);
const CUE_SAMPLES={ingest:{signals:{lag:{value:10}}},'ingest->app':{signals:{rate:{value:1300,series:[[T1,1200],[T2,1300]]},errors:{value:4}}},
 'app->push':{signals:{rate:{value:0,series:[[T1,0],[T2,0]]},errors:{value:0}}},'shared::api':{signals:{rate:{value:50,series:[[T1,40],[T2,50]]}}},
 'shared::api->shared::store':{signals:{rate:{value:500},errors:{value:1}}}};
const CUES='.dv-metrics-stream,.dv-metrics-ghost,.dv-metrics-node,[data-metrics-state]';
function cueSpec(){
 const spec=(id,diagram,extra={})=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},...extra,sections:[{diagram}]}});
 const provider=spec('provider',{nodes:{api:{title:'Imported API'},store:{title:'Imported store'}},rows:[['api','store']],edges:[{from:'api',to:'store',label:'Persist'}],topologyExports:{core:{nodes:['api','store'],edges:['api->store']}}});
 const consumer=spec('consumer',{nodes:{ingest:{title:'Ingest',tickets:['LOC-1'],telemetry:QUEUE()},app:{title:'Resident app',tickets:['LOC-2']},push:{title:'Push gateway'}},rows:[['ingest','app','push']],
  edges:[{from:'ingest',to:'app',label:'notify',tickets:['LOC-3'],telemetry:CALL()},{from:'app',to:'push',label:'push',tickets:['LOC-4'],telemetry:CALL()},{from:'ingest',to:'push',label:'fallback',tickets:['LOC-5']}],panels:[PANEL],
  steps:[{id:'notify',edge:'ingest->app',text:'Notify'},{id:'retry',edge:'app->push',failures:{'ingest->push':'dropped'},text:'Retry'}],
  topologyImports:[{spec:'provider',export:'core',as:'shared',position:{x:80,y:300},nodeTracking:{api:{tickets:['IMP-1'],telemetry:SERVICE()}},edgeTracking:{'api->store':{tickets:['IMP-2'],telemetry:CALL()}}}]});
 consumer.page.tracking={jira:{site:'https://jira.test'}};
 const context=vm.createContext({});vm.runInContext(sourceLoader.composeSources(['validator.js','canon.js']),context);
 return JSON.parse(JSON.stringify(context.FlowTopology.resolveSource(consumer,{version:1,id:'consumer',specs:[provider,consumer]})));
}
async function mountCues(page,server){
 await page.setViewportSize({width:1440,height:1000});
 await writeFile(path.join(server.root,'telemetry-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
 await writeFile(path.join(server.root,'telemetry-native.html'),'<div id="host"></div><script type="module">import {mountNativeViewer} from "./telemetry-native.js";window.mount=mountNativeViewer;</script>');
 await page.goto(server.origin+'/telemetry-native.html');await page.waitForFunction(()=>!!window.mount);
 await page.evaluate(({spec,jira,samples})=>{
  window.viewer=window.mount(document.querySelector('#host'),spec,{telemetry:{provider:()=>Promise.resolve(JSON.parse(JSON.stringify(samples)))}});
  window.viewer.controller.liveStatus.apply(jira);
 },{spec:cueSpec(),jira:CUE_JIRA,samples:CUE_SAMPLES});
 const root=page.locator('#host'),panel=root.locator('.pt-live-status');
 await expect(panel.getByRole('button',{name:'Live',exact:true})).toBeVisible();
 return {root,metrics:metricsButton(panel)};
}
const stream=(root,i)=>root.locator('g.dv-metrics-stream[data-metrics-edge="'+i+'"] circle.dv-metrics-moving');
const ordinary=async root=>({pkt:await root.locator('circle.pkt').count(),comm:await root.locator('.comm-packet').count()});

test('P6 P7 P8 P10 Metrics cues stream, ghost and seal local and imported carriers, leave unbound ones and ordinary packets alone, and clear when off',async({page,server})=>{
 const {root,metrics}=await mountCues(page,server),edge=i=>root.locator('path.edge[data-dv-edge="'+i+'"]'),node=id=>root.locator('g.node[data-dv-node="'+id+'"]');
 await expect(edge(0)).toHaveAttribute('data-live-appearance','done');
 await expect(root.locator(CUES),'P6 nothing while Metrics is off').toHaveCount(0);
 const before=await ordinary(root);expect(before.pkt,'P10 the page has ordinary packets').toBeGreaterThan(0);expect(before.comm,'P10 and a failure packet').toBeGreaterThan(0);
 await metrics.click();
 await expect(stream(root,0),'P7 1300 req/h is four packets').toHaveCount(4);
 await expect(root.locator('path.dv-metrics-ghost[data-metrics-edge="1"]'),'P7 the silent Done edge has a ghost').toHaveCount(1);
 await expect(edge(1)).toHaveClass(/dv-metrics-silent/);await expect(stream(root,1)).toHaveCount(0);
 await expect(node('ingest').locator('.dv-metrics-seal')).toHaveAttribute('data-seal','proven');
 await expect(node('app').locator('.dv-metrics-node'),'P7 unbound node unchanged').toHaveCount(0);await expect(node('app')).not.toHaveAttribute('data-metrics-state',/./);
 await expect(edge(2)).not.toHaveAttribute('data-metrics-state',/./);await expect(root.locator('[data-metrics-edge="2"]'),'P7 unbound edge unchanged').toHaveCount(0);
 await expect(node('shared::api').locator('.dv-metrics-seal'),'P7 imported node seal').toHaveAttribute('data-seal','proven');
 await expect(node('shared::api').locator('polyline.dv-metrics-sparkline')).toHaveCount(1);
 await expect(stream(root,3),'P7 imported edge, 500 req/h is three packets').toHaveCount(3);
 await expect(edge(0)).toHaveAttribute('data-live-appearance','done');
 expect(await ordinary(root),'P10 ordinary step and failure packets are untouched').toEqual(before);
 await metrics.click();
 await expect(root.locator(CUES),'P8 off removes every cue').toHaveCount(0);
 await expect(edge(0)).toHaveAttribute('data-live-appearance','done');
});

test('P9 reduced motion shows static Metrics packets instead of moving ones',async({page,server})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 const {root,metrics}=await mountCues(page,server);await metrics.click();
 await expect(stream(root,0)).toHaveCount(4);
 await expect(stream(root,0).first()).toBeHidden();
 await expect(root.locator('g.dv-metrics-stream[data-metrics-edge="0"] circle.dv-metrics-static').first()).toBeVisible();
});
