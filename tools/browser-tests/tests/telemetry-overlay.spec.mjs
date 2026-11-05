/* Contract matrix: #939, the Metrics button and the host telemetry provider (PR 1), and the canvas cues (PR 2).
| row | rule | fixture | assertion |
|---|---|---|---|
| P1 | Metrics is hidden without a telemetry provider or demo | native mount of an imported-topology consumer with Jira evidence and no `telemetry` option | Live is visible; no visible Metrics button and no metrics connector text |
| P2 | With a provider, Metrics is present and off by default | same page with `telemetry.provider` | Metrics visible with aria-pressed false, "Metrics: not connected", provider never called after first paint |
| P3 | Turning Metrics on calls the provider with every bound carrier, local and imported | click Metrics | one call with local node + edge and imported node + edge ids (unbound carriers absent); "Metrics: connected, refreshed <time>"; ctl.telemetry holds the map; Live stays pressed |
| P4 | Turning Metrics off stops and clears | click Metrics again | aria-pressed false, "Metrics: not connected", map empty, the signal aborted, no further call |
| P5 | Standalone boot hands `window.flowviewTelemetry` to the page | built template with an init script provider | Metrics visible; on calls the provider with the bound carrier |
| P6 | Metrics streams local and imported flowing edges; ordinary packets and Jira paint stay unchanged | independent native mount, no required ordinary-packet count; Metrics off then on | no cue before on; named stream counts (4 local, 3 imported), no cue on the unbound edge; ordinary packet counts equal before/after. Rejects missing streams or replacing ordinary/Jira paint |
| P7 | Silent Done edge gets a ghost over a dimmed stroke | independent native mount; click Metrics with no cue precondition | first contract assertion is named `P7 the silent Done edge has a ghost`; dimmed stroke and no stream follow. Rejects omitting the silent-edge ghost |
| P8 | Bound local and imported nodes get seals; unbound nodes stay unchanged | independent native mount; click Metrics with no stream/ghost precondition | first contract assertion is named `P8 the bound local node has a proven seal`; imported seal/sparkline present, unbound node has no cue. Rejects missing seals or skipping imported nodes |
| P9 | Reduced motion shows static packets | `reducedMotion: 'reduce'` | moving packets hidden, static packets visible |
| P10 | Off removes every cue | independent native mount; wait for the existing provider connection, record cues on, then click off | named `P10 off removes every cue painted while on` assertion checks both nonempty on and empty off after both clicks, so absent cues fail this row without a feature-dependent precondition; off also clears carrier verdicts/classes and preserves Jira paint. Rejects missing cues or incomplete cleanup |
| P11 | `#live=demo` mounts the demo telemetry so Metrics follows the demo day | built example with its timeline, `#live=demo` | Metrics visible and off; on is "Metrics: demo, refreshed …"; Day 8 has no stream; Day 10 streams 3 packets on the 530 req/h `mcu->ingest` call edge, ghosts the silent Done `notify->app` push edge and seals `ingest`; off removes every cue |
| P12 / C4 | Loaded imported detail carriers get the same cues | real native host `loadDetail` returns a resolved imported consumer; click the parent detail control to load and mount the explicitly selected, nonfirst section, then click Metrics | independent tests for provider bindings, proven seal, sparkline, stream, ghost, dimmed stroke, unbound node, off and destroy cleanup; no cue precondition hides another contract. A decoy first section shares unbound carrier IDs to detect painting with the wrong section binding. Destroy inspects the retained section DOM so merely detaching the viewer cannot pass |
*/
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import vm from 'node:vm';
import sourceLoader from '../../../tools/source-loader.cjs';
import {test,expect} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
import {mountCues,mountImportedDetail,CUES} from '../helpers/telemetry-cards.mjs';

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
const stream=(root,i)=>root.locator('g.dv-metrics-stream[data-metrics-edge="'+i+'"] circle.dv-metrics-moving');
const ordinary=async root=>({pkt:await root.locator('circle.pkt').count(),comm:await root.locator('.comm-packet').count()});

test('P6 Metrics streams local and imported edges and preserves ordinary packets and Jira paint',async({page,server})=>{
 const {root,metrics}=await mountCues(page,server),edge=i=>root.locator('path.edge[data-dv-edge="'+i+'"]');
 await expect(root.locator(CUES),'P6 nothing while Metrics is off').toHaveCount(0);
 // Ordinary packet counts can be zero outside step playback; no cue depends on their presence.
 const before=await ordinary(root);
 await metrics.click();
 await expect(stream(root,0),'P6 1300 req/h is four packets').toHaveCount(4);
 await expect(stream(root,3),'P6 imported edge, 500 req/h is three packets').toHaveCount(3);
 await expect(edge(2),'P6 unbound edge has no Metrics state').not.toHaveAttribute('data-metrics-state',/./);
 await expect(root.locator('[data-metrics-edge="2"]'),'P6 unbound edge unchanged').toHaveCount(0);
 await expect(edge(0),'P6 Jira appearance unchanged').toHaveAttribute('data-live-appearance','done');
 expect(await ordinary(root),'P6 ordinary step and failure packets are untouched').toEqual(before);
});

test('P7 Metrics ghosts the silent Done edge and dims its stroke',async({page,server})=>{
 const {root,metrics}=await mountCues(page,server);await metrics.click();
 await expect(root.locator('path.dv-metrics-ghost[data-metrics-edge="1"]'),'P7 the silent Done edge has a ghost').toHaveCount(1);
 await expect(root.locator('path.edge[data-dv-edge="1"]'),'P7 the silent stroke is dimmed').toHaveClass(/dv-metrics-silent/);
 await expect(stream(root,1),'P7 the silent edge has no stream').toHaveCount(0);
});

test('P8 Metrics seals bound local and imported nodes and leaves unbound nodes unchanged',async({page,server})=>{
 const {root,metrics}=await mountCues(page,server),node=id=>root.locator('g.node[data-dv-node="'+id+'"]');await metrics.click();
 await expect(node('ingest').locator('.dv-metrics-seal'),'P8 the bound local node has a proven seal').toHaveAttribute('data-seal','proven');
 await expect(node('shared::api').locator('.dv-metrics-seal'),'P8 the bound imported node has a proven seal').toHaveAttribute('data-seal','proven');
 await expect(node('shared::api').locator('polyline.dv-metrics-sparkline'),'P8 imported node sparkline').toHaveCount(1);
 for(const id of ['app','push','shared::store']){
  await expect(node(id).locator('.dv-metrics-node'),'P8 unbound '+id+' has no seal or sparkline').toHaveCount(0);
  await expect(node(id),'P8 unbound '+id+' has no Metrics state').not.toHaveAttribute('data-metrics-state',/./);
 }
});

test('P10 turning Metrics off removes every cue and preserves Jira paint',async({page,server})=>{
 const {root,metrics}=await mountCues(page,server);await metrics.click();
 // The connection contract already exists on the base; wait for samples without requiring any canvas cue.
 await expect(root.locator('.dv-live-metrics-connection')).toHaveAttribute('data-state','connected');
 const paintedWhileOn=await root.locator(CUES).count();
 await metrics.click();
 await expect.poll(async()=>({paintedWhileOn:paintedWhileOn>0,remainingAfterOff:await root.locator(CUES).count()}),{message:'P10 off removes every cue painted while on'}).toEqual({paintedWhileOn:true,remainingAfterOff:0});
 await expect(root.locator('[data-metrics-verdict],.dv-metrics-bound,.dv-metrics-flowing,.dv-metrics-degraded,.dv-metrics-silent,.dv-metrics-unobserved,.dv-metrics-ghosted'),'P10 off removes carrier verdicts and classes').toHaveCount(0);
 await expect(root.locator('path.edge[data-dv-edge="0"]'),'P10 Jira appearance unchanged').toHaveAttribute('data-live-appearance','done');
});

test('P9 reduced motion shows static Metrics packets instead of moving ones',async({page,server})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 const {root,metrics}=await mountCues(page,server);await metrics.click();
 await expect(stream(root,0)).toHaveCount(4);
 await expect(stream(root,0).first()).toBeHidden();
 await expect(root.locator('g.dv-metrics-stream[data-metrics-edge="0"] circle.dv-metrics-static').first()).toBeVisible();
});

/* P12 / C4: use the native host's real loader, normalization, validation,
   buildSection and detail-navigation event. The first section is a decoy;
   the selected section's imported bindings must drive its actual rendered DOM. */
test('P12 loaded imported detail contributes its selected telemetry bindings to the host provider',async({page,server})=>{
 await mountImportedDetail(page,server);
 const calls=await page.evaluate(()=>window.detailTelemetryCalls);
 expect(calls).toHaveLength(1);
 expect(calls[0].map(binding=>binding.id)).toEqual(['shared::api','shared::api->shared::store','shared::store->shared::api']);
 expect(calls[0][0].signals.rate).toEqual({source:'grafana',query:'sum(rate(http_requests_total{app="api"}[5m]))*3600',unit:'req/h'});
 expect(await page.evaluate(()=>window.viewer.controller.liveStatus.refs().tickets)).toEqual(['ROOT-1','IMP-1','IMP-2','IMP-3']);
});
test('P12 loaded imported detail node gets a proven seal',async({page,server})=>{
 const {node}=await mountImportedDetail(page,server);
 await expect(node.locator('.dv-metrics-seal'),'P12 loaded imported node seal').toHaveAttribute('data-seal','proven');
});
test('P12 loaded imported detail node gets a sparkline',async({page,server})=>{
 const {node}=await mountImportedDetail(page,server);
 await expect(node.locator('polyline.dv-metrics-sparkline'),'P12 loaded imported node sparkline').toHaveCount(1);
});
test('P12 loaded imported detail flowing edge gets a stream',async({page,server})=>{
 const {scope}=await mountImportedDetail(page,server);
 await expect(stream(scope,0),'P12 loaded imported edge stream').toHaveCount(3);
});
test('P12 loaded imported detail silent Done edge gets a ghost',async({page,server})=>{
 const {scope}=await mountImportedDetail(page,server);
 await expect(scope.locator('path.dv-metrics-ghost[data-metrics-edge="1"]'),'P12 loaded silent imported edge ghost').toHaveCount(1);
});
test('P12 loaded imported detail silent edge stroke is dimmed',async({page,server})=>{
 const {scope}=await mountImportedDetail(page,server);
 await expect(scope.locator('path.edge[data-dv-edge="1"]'),'P12 loaded silent imported stroke dimmed').toHaveClass(/dv-metrics-silent/);
});
test('P12 loaded unbound imported detail node stays unchanged',async({page,server})=>{
 const {scope}=await mountImportedDetail(page,server),store=scope.locator('g.node[data-dv-node="shared::store"]');
 await expect(store.locator(CUES),'P12 loaded unbound imported node has no cue').toHaveCount(0);
 await expect(store).not.toHaveAttribute('data-metrics-state',/./);
});
for(const action of ['off','destroy'])test('P12 '+action+' removes loaded imported detail cues and carrier decoration',async({page,server})=>{
 const {scope,metrics}=await mountImportedDetail(page,server);
 // Retain the real section to inspect its contents even after viewer.destroy()
 // detaches it. Counting only the host would let detachment masquerade as cleanup.
 const section=await scope.elementHandle(),paintedWhileOn=await scope.locator(CUES).count();
 if(action==='off')await metrics.click();else await page.evaluate(()=>window.viewer.destroy());
 const remaining=await section.evaluate((el,selector)=>el.querySelectorAll(selector).length,CUES);
 expect({paintedWhileOn:paintedWhileOn>0,remaining},'P12 '+action+' removes cues painted on loaded detail').toEqual({paintedWhileOn:true,remaining:0});
 expect(await section.evaluate(el=>el.querySelectorAll('[data-metrics-verdict],.dv-metrics-bound,.dv-metrics-flowing,.dv-metrics-degraded,.dv-metrics-silent,.dv-metrics-unobserved,.dv-metrics-ghosted').length),'P12 '+action+' removes loaded carrier classes and verdicts').toBe(0);
});

/* P11: the built example's #live=demo player feeds the Metrics cues day by day (#944 PR 2 timeline). */
async function openDemo(page,server){
 await page.setViewportSize({width:1440,height:1000});await page.emulateMedia({reducedMotion:'reduce'});
 const out=path.join(server.root,'telemetry-demo.html');
 execFileSync('python3',[path.join(repo,'tools/inject.py'),path.join(repo,'examples/live-status/live-status.spec.json'),path.join(repo,'template/flowview.html'),out,'--timeline',path.join(repo,'examples/live-status/live-status.timeline.json')]);
 await page.goto(server.origin+'/telemetry-demo.html#live=demo');return page.locator('#docview');
}
async function demoDay(root,day){
 const next=root.getByRole('button',{name:'Next day',exact:true});
 for(;;){const note=await root.locator('.dv-live-note').textContent();const current=Number(/Day (\d+)/.exec(note)[1]);if(current>=day)return;await next.click();await expect(root.locator('.dv-live-note')).toContainText('Day '+(current+1)+' —');}
}
test('P11 #live=demo mounts the demo telemetry: Metrics reports Demo and the cues follow the demo day',async({page,server})=>{
 const root=await openDemo(page,server),panel=root.locator('.pt-live-status'),metrics=metricsButton(panel),status=panel.locator('.dv-live-metrics-connection');
 await expect(metrics,'P11 the demo telemetry source shows Metrics').toBeVisible();await expect(metrics).toHaveAttribute('aria-pressed','false');
 await expect(root.locator(CUES)).toHaveCount(0);
 await demoDay(root,8);await metrics.click();
 await expect(status).toHaveAttribute('data-state','demo');await expect(status).toHaveText(/^Metrics: demo, refreshed /);
 await expect(root.locator('g.dv-metrics-stream'),'P11 no traffic before Day 9').toHaveCount(0);
 await demoDay(root,10);
 await expect(stream(root,2),'P11 Day 10: about 530 req/h on mcu->ingest is three packets').toHaveCount(3);
 await expect(root.locator('path.dv-metrics-ghost[data-metrics-edge="4"]'),'P11 the push edge stays silent after Done').toHaveCount(1);
 await expect(root.locator('g.node[data-dv-node="ingest"] .dv-metrics-seal')).toHaveCount(1);
 await metrics.click();await expect(root.locator(CUES),'P11 off removes every cue').toHaveCount(0);
});
