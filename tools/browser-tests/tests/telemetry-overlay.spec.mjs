/* Contract matrix: #939 PR 1 of 2 (the Metrics button and the host telemetry provider). Nothing paints on the canvas in this PR.
| row | rule | fixture | assertion |
|---|---|---|---|
| P1 | Metrics is hidden without a telemetry provider or demo | native mount of an imported-topology consumer with Jira evidence and no `telemetry` option | Live is visible; no visible Metrics button and no metrics connector text |
| P2 | With a provider, Metrics is present and off by default | same page with `telemetry.provider` | Metrics visible with aria-pressed false, "Metrics: not connected", provider never called after first paint |
| P3 | Turning Metrics on calls the provider with every bound carrier, local and imported | click Metrics | one call with local node + edge and imported node + edge ids (unbound carriers absent); "Metrics: connected, refreshed <time>"; ctl.telemetry holds the map; Live stays pressed |
| P4 | Turning Metrics off stops and clears | click Metrics again | aria-pressed false, "Metrics: not connected", map empty, the signal aborted, no further call |
| P5 | Standalone boot hands `window.flowviewTelemetry` to the page | built template with an init script provider | Metrics visible; on calls the provider with the bound carrier |
| C1 | Packet streams on bound flowing edges | excluded — orchestrator ruling: PR 2 |
| C2 | Silent Done edge ghost | excluded — orchestrator ruling: PR 2 |
| C3 | Node sparklines and proof seals | excluded — orchestrator ruling: PR 2 |
| C4 | Unbound carriers unchanged; off removes every cue | excluded — orchestrator ruling: PR 2 |
| C5 | The same canvas cues on imported carriers | excluded — orchestrator ruling: PR 2 |
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
