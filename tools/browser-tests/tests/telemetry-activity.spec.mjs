import {test,expect} from '../helpers/test.mjs';
import {setup} from '../helpers/telemetry-proof.mjs';
import {handoffSpec} from '../helpers/telemetry-cards.mjs';
const T=Date.UTC(2026,10,4,12),H=3600000;
const metrics=root=>root.getByRole('switch',{name:'Metrics overlay',exact:true}),live=root=>root.getByRole('button',{name:'Live',exact:true}),over=root=>root.getByRole('button',{name:'Over time',exact:true});
const activity=root=>root.locator('.dv-live-activity-entry[data-activity-type="telemetry"]');
const trigger=(root,id)=>root.locator('[data-live-carrier="'+id+'"][tabindex="0"]:visible');
const production=root=>root.locator('.dv-live-popover:visible .dv-live-production');
// #1194: a metric tile is a bold label, its own small graph and one line "<scope>: <value>".
const metricLine=(root,name)=>production(root).locator('.dv-live-production-kpi').filter({has:root.page().locator('.dv-live-metric-label',{hasText:new RegExp('^'+name+'$')})}).locator('.dv-live-metric-line');
async function open(root,id,popRoot=root){const button=trigger(root,id);await expect(button).toHaveCount(1);await button.focus();await button.press('Enter');await expect(production(popRoot)).toBeVisible();return button;}
async function unobservedEvidence(root,links=[]){
 await expect(production(root)).toBeVisible();
 await expect(production(root).locator('.dv-live-production-kpi .dv-live-metric-label')).toHaveText(['rate','errors']);await expect(production(root).locator('.dv-live-production-kpi .dv-live-metric-line')).toHaveText(['unobserved','unobserved']);
 await expect(production(root).locator('.dv-live-proof-point,.dv-live-proof-series,.dv-live-proof-marker')).toHaveCount(0);
 await expect(production(root)).not.toContainText('First observed traffic');
 expect(await production(root).getByRole('link').evaluateAll(anchors=>anchors.map(a=>a.href))).toEqual(links);
}
async function day(root,index){const slider=root.getByRole('slider',{name:'Day',exact:true});await slider.focus();await slider.press('Home');for(let i=0;i<index;i++)await slider.press('ArrowRight');await expect(slider).toHaveValue(String(index));}
async function deliver(page,{id='ingest->app',rate=100,errors=0,at=T+H,missing=false}={}){
 await page.evaluate(({id,rate,errors,at,missing})=>window.viewer.controller.telemetry.apply({[id]:{observedAt:new Date(at).toISOString(),signals:missing?{errors:{value:0}}:{rate:{value:rate},errors:{value:errors}},links:{dashboard:'https://provider.test/refresh'}}}),{id,rate,errors,at,missing});
}
test('Production uses carrier identity, failing signal, Proof values and safe links; keyboard Escape returns to one trigger',async({page,server},info)=>{
 const root=await setup(page,server);await metrics(root).click();await live(root).click();await expect(live(root)).toHaveAttribute('aria-pressed','false');
 let button=await open(root,'shared::api->shared::store');await expect(production(root)).toContainText('errors is 30 req/h; limit errors no more than 1% of rate');await expect(metricLine(root,'rate')).toContainText('500 req/h');await expect(production(root).getByRole('link',{name:'Open in Grafana'})).toHaveAttribute('href','https://provider.test/fallback');await expect(root.locator('.dv-live-popover:visible .dv-live-ticket')).toContainText('IMP-2');await page.keyboard.press('Escape');await expect(button).toBeFocused();
 button=await open(root,'ingest->app');await expect(production(root).getByRole('link')).toHaveAttribute('href','https://authored.test/board');await expect(production(root).locator('.dv-live-proof-marker')).toHaveCount(1);await expect(production(root).locator('.dv-live-proof-marker[data-kind="done"]')).toHaveCount(0);await expect(production(root).locator('.dv-live-proof-series')).toHaveCount(1);await expect(production(root).locator('.dv-live-production-kpi .dv-live-metric-label')).toHaveText(['rate','errors']);await expect(production(root).locator('.dv-live-production-kpi .dv-live-metric-line')).toHaveText(['100 req/h','0 req/h']);await expect(production(root)).not.toContainText('not bound');await expect(production(root)).not.toContainText('total');
 await root.locator('.dv-live-popover:visible').screenshot({path:info.outputPath('production-desktop.png')});
 await production(root).getByRole('link').focus();await deliver(page,{errors:5});await expect(production(root)).toContainText('errors is 5 req/h');await expect(production(root).getByRole('link')).toBeFocused();await page.keyboard.press('Escape');await expect(button).toBeFocused();
 await open(root,'app->push');await expect(metricLine(root,'rate')).toContainText('unobserved');await expect(production(root).getByRole('link')).toHaveCount(0);await page.keyboard.press('Escape');
 await deliver(page,{id:'app->push',rate:0});await open(root,'app->push');await expect(metricLine(root,'rate')).toContainText('0 req/h');await expect(production(root)).toContainText('SILENT');await expect(production(root)).not.toContainText('DONE');
 expect(await page.evaluate(()=>[window.calls.live.length,window.calls.history.length])).toEqual([1,0]);
});
test('Production and typed Activity include direct, nested and actual asynchronously selected imported details',async({page,server})=>{
 const root=await setup(page,server,{details:true});await metrics(root).click();
 await open(root,'outer::inner::a->outer::inner::b');await expect(metricLine(root,'rate')).toContainText('100 req/h');await page.keyboard.press('Escape');
 await root.getByRole('button',{name:'Explore Imported service',exact:true}).click();await expect(root.getByText('Loading detail diagram…',{exact:true})).toBeVisible();await page.evaluate(()=>window.loadReleases.shift()());
 const scope=root.locator('[data-dv-detail-preview]:visible');await expect(scope.locator('.sec-h')).toHaveText('Selected imported detail');
 for(const id of ['shared::store->shared::api','detail::inner::a->detail::inner::b']){
  await deliver(page,{id,rate:100});await open(scope,id,root);await expect(production(root)).toHaveAttribute('data-production-carrier',id);await expect(metricLine(root,'rate')).toContainText('100 req/h');await expect(production(root)).not.toContainText('Decoy');await page.keyboard.press('Escape');
 }
 await expect(scope.locator('[data-activity-carrier="shared::store->shared::api"][data-activity-kind="first-traffic"]')).toHaveCount(1);
 await expect(scope.locator('[data-activity-carrier="detail::inner::a->detail::inner::b"][data-activity-kind="first-traffic"]')).toHaveCount(0);
 expect(await page.evaluate(()=>[window.calls.live.length,window.calls.detail.length])).toEqual([1,1]);
 await scope.locator('.detail-breadcrumb button').first().click();
 await page.evaluate(()=>{const d=window.detailSpec.page.sections.find(s=>s.id==='selected').diagram;d.edges.find(e=>e.from==='shared::store' && e.to==='shared::api').telemetry.signals.rate.grafana='replacement explicit query';});
 await root.getByRole('button',{name:'Explore Imported service',exact:true}).click();await expect(root.getByText('Loading detail diagram…',{exact:true})).toBeVisible();await page.evaluate(()=>window.loadReleases.shift()());await expect(scope.locator('.sec-h')).toHaveText('Selected imported detail');
 await expect(scope.locator('[data-activity-carrier="shared::store->shared::api"]')).toHaveCount(0);
 await open(scope,'shared::store->shared::api',root);await unobservedEvidence(root);expect(await page.evaluate(()=>window.viewer.controller.telemetry.snapshot().map['shared::store->shared::api'])).toBeUndefined();await page.keyboard.press('Escape');
 await deliver(page,{id:'shared::store->shared::api',rate:12,at:T+2*H});await open(scope,'shared::store->shared::api',root);await expect(metricLine(root,'rate')).toContainText('12 req/h');await expect(scope.locator('[data-activity-carrier="shared::store->shared::api"][data-activity-kind="first-traffic"]')).toHaveCount(1);
 expect(await page.evaluate(()=>[window.calls.live.length,window.calls.detail.length])).toEqual([1,2]);
});
test('slider changes open Production to the exact day without Activity or queries, Metrics off retains Over time selection',async({page,server})=>{
 const root=await setup(page,server);await metrics(root).click();const initial=await activity(root).allTextContents();await over(root).click();await day(root,0);await open(root,'ingest->app');await expect(metricLine(root,'rate')).toContainText('0 req/h');
 await day(root,1);await expect(production(root)).toBeVisible();await expect(metricLine(root,'rate')).toContainText('unobserved');await expect(production(root).locator('.dv-live-proof-point')).toHaveCount(0);
 await day(root,2);await expect(metricLine(root,'rate')).toContainText('50 req/h');await expect(production(root).locator('.dv-live-proof-point')).toHaveCount(1);expect(await activity(root).allTextContents()).toEqual(initial);expect(await page.evaluate(()=>[window.calls.live.length,window.calls.history.length])).toEqual([1,1]);
 await metrics(root).click();await expect(over(root)).toHaveAttribute('aria-pressed','true');await expect(root.getByRole('slider',{name:'Day',exact:true})).toHaveValue('2');await expect(production(root)).toHaveCount(0);await expect(activity(root)).toHaveCount(0);
 await deliver(page,{rate:777});await day(root,0);await live(root).click();await expect(root.locator('.dv-live-proof')).toHaveCount(0);await expect(activity(root)).toHaveCount(0);
});
test('new accepted live observations emit first traffic once on Return Live and retain Jira rows on Metrics off',async({page,server})=>{
 const root=await setup(page,server);await metrics(root).click();await page.evaluate(()=>window.viewer.controller.liveStatus.apply({...window.jira,'LOC-2':{state:'done',updatedAt:new Date().toISOString()}}));await expect(root.locator('[data-activity-type="jira"]')).toHaveCount(1);
 await over(root).click();const before=await activity(root).allTextContents();await deliver(page,{id:'app->push',rate:25,at:T+H});await day(root,0);expect(await activity(root).allTextContents()).toEqual(before);
 await live(root).click();await expect(activity(root).filter({hasText:'push · First observed traffic after Done'})).toHaveCount(1);await over(root).click();await day(root,1);await live(root).click();await expect(activity(root).filter({hasText:'push · First observed traffic after Done'})).toHaveCount(1);
 await metrics(root).click();await expect(activity(root)).toHaveCount(0);await expect(root.locator('[data-activity-type="jira"]')).toHaveCount(1);
});
test('telemetry-only Activity displays real threshold transitions without Jira totals, with chronological cap and honest missing times',async({page,server})=>{
 const root=await setup(page,server,{telemetryOnly:true});await page.evaluate(()=>window.seed());await deliver(page,{errors:5});await expect(activity(root)).toContainText('errors crossed outside its proof threshold');await expect(root.locator('.dv-live-epic,.dv-live-tickets:not(.dv-live-proof-table)')).toHaveCount(0);
 await page.evaluate(({T,H})=>{for(let i=2;i<25;i++)window.viewer.controller.telemetry.apply({'ingest->app':{observedAt:new Date(T+i*H).toISOString(),signals:{rate:{value:100},errors:{value:i%2?5:0}}}});},{T,H});
 await expect(activity(root)).toHaveCount(20);const dates=await activity(root).evaluateAll(rows=>rows.map(r=>r.getAttribute('data-updated-at')));expect(dates).toEqual([...dates].sort().reverse());
 await page.evaluate(()=>{window.viewer.controller.telemetry.clear();window.viewer.controller.telemetry.apply({'ingest->app':{signals:{rate:{value:100},errors:{value:0}}}});window.viewer.controller.telemetry.apply({'ingest->app':{signals:{rate:{value:100},errors:{value:5}}}});});await expect(activity(root)).toContainText('time unavailable');await expect(activity(root)).not.toHaveAttribute('data-updated-at');
});
for(const disabled of ['page','host','tools'])test(disabled+' suppression removes Production and telemetry Activity while preserving Jira',async({page,server})=>{
 const root=await setup(page,server,{disabled});await page.evaluate(()=>window.seed());await trigger(root,'ingest->app').focus();await trigger(root,'ingest->app').press('Enter');await expect(root.locator('.dv-live-popover:visible .dv-live-ticket')).toContainText('LOC-3');await expect(production(root)).toHaveCount(0);await expect(activity(root)).toHaveCount(0);expect(await page.evaluate(()=>window.calls.live.length)).toBe(0);
});
test('map clear retains unobserved bound rows; capabilities removal and destroy retract Production independently of native siblings',async({page,server})=>{
 const root=await setup(page,server,{siblings:true});await metrics(root).click();await metrics(page.locator('#sibling')).click();await open(root,'ingest->app');await page.evaluate(()=>window.viewer.controller.telemetry.clear());await unobservedEvidence(root,['https://authored.test/board']);expect(await page.evaluate(()=>window.viewer.controller.telemetry.snapshot().map)).toEqual({});await expect(activity(root)).toHaveCount(0);await expect(page.locator('#sibling .dv-live-proof')).toHaveCount(1);expect(await page.evaluate(()=>window.sibling.controller.telemetry.snapshot().map['ingest->app'].signals.rate.value)).toBe(100);await root.locator('.dv-live-popover:visible').screenshot({path:'/tmp/named-metric-values-cleared-inspect.png'});await page.keyboard.press('Escape');
 await page.evaluate(()=>window.seed());await open(root,'ingest->app');await expect(metricLine(root,'rate')).toContainText('100 req/h');await page.evaluate(()=>window.viewer.controller.telemetry.setAvailable(false));await expect(production(root)).toHaveCount(0);await expect(activity(root)).toHaveCount(0);await expect(root.locator('.dv-live-tickets:not(.dv-live-proof-table)')).toHaveCount(1);await page.evaluate(()=>window.viewer.destroy());await expect(root).toBeEmpty();await expect(page.locator('#sibling .dv-live-proof')).toHaveCount(1);
});
test('local/direct/nested handoff cues keep Production separate from the existing navigation gesture',async({page,server})=>{
 await setup(page,server);const raw=handoffSpec();for(const node of Object.values(raw.page.sections[0].diagram.nodes))if(node.handoff)node.telemetry={kind:'service',signals:{rate:{grafana:'explicit',unit:'req/h'}},proof:{rate:{min:1}}};
 await page.evaluate(raw=>{window.viewer.destroy();window.viewer=window.mount(document.querySelector('#host'),raw,{telemetry:{provider:async()=>({})}});window.viewer.controller.liveStatus.apply({'LOC-1':{state:'done'},'IMP-1':{state:'done'}});window.viewer.controller.telemetry.apply(Object.fromEntries(['h','direct::h','nested::inner::h'].map(id=>[id,{signals:{rate:{value:7}}}])));},raw);
 const root=page.locator('#host');for(const id of ['h','direct::h','nested::inner::h']){await open(root,id);await expect(metricLine(root,'rate')).toContainText('7 req/h');await page.keyboard.press('Escape');}
 await root.locator('[data-dv-node="h"] .handoff-link').press('Enter');await expect(root.locator('#section-destination')).toBeVisible();
});

test('late host callback after Metrics off cannot resurrect Production, Proof or Activity; initial preload and fresh enable still work',async({page,server})=>{
 const root=await setup(page,server,{pending:true});await page.evaluate(()=>window.seed());
 await expect(metrics(root)).toHaveAttribute('aria-checked','false');await expect(root.locator('.dv-live-proof')).toHaveCount(1);await open(root,'ingest->app');await expect(metricLine(root,'rate')).toContainText('100 req/h');await page.keyboard.press('Escape');
 await metrics(root).click();await expect.poll(()=>page.evaluate(()=>window.liveReleases.length)).toBe(1);await metrics(root).click();
 await deliver(page,{rate:777});
 await expect(activity(root),'late host callback must not recreate telemetry Activity after explicit off').toHaveCount(0);
 await expect(root.locator('.dv-live-proof')).toHaveCount(0);await trigger(root,'ingest->app').press('Enter');await expect(root.locator('.dv-live-popover:visible .dv-live-ticket')).toContainText('LOC-3');await expect(production(root)).toHaveCount(0);await page.keyboard.press('Escape');
 await metrics(root).click();await expect.poll(()=>page.evaluate(()=>window.liveReleases.length)).toBe(2);
 async function pendingWithoutStaleEvidence(){
  await expect(root.locator('.dv-live-proof')).toHaveCount(1);await expect(root.locator('[data-proof-carrier="ingest->app"]')).toContainText('Loading…');
  await expect(root.locator('[data-proof-carrier="ingest->app"]')).not.toContainText('777');await expect(activity(root)).toHaveCount(0);
  expect(await page.evaluate(()=>window.viewer.controller.telemetry.snapshot().map)).toEqual({});
  expect(await page.evaluate(()=>window.viewer.controller.telemetry.verdicts().rollups.proven)).toBe(0);
 }
 await pendingWithoutStaleEvidence();
 await page.evaluate(()=>window.liveReleases.shift()());await pendingWithoutStaleEvidence();
 await page.evaluate(()=>window.liveReleases.shift()());await open(root,'ingest->app');await expect(metricLine(root,'rate')).toContainText('100 req/h');await expect(activity(root).filter({hasText:'Delivery <script>bad()</script> · First observed traffic after Done'})).toHaveCount(1);
});


test('ratio denominator-only crossings appear in Activity with their own measurement date',async({page,server})=>{
 const root=await setup(page,server);
 async function sample(rate,rateAt,errors=1,errorAt=T){
  await page.evaluate(({rate,rateAt,errors,errorAt,T,H})=>window.viewer.controller.telemetry.apply({'ingest->app':{
   observedAt:new Date(T+100*H).toISOString(),signals:{
    errors:{value:errors,observedAt:new Date(errorAt).toISOString()},
    rate:{value:rate,observedAt:new Date(rateAt).toISOString(),retrievedAt:new Date(T+200*H).toISOString()}
   }
  }}),{rate,rateAt,errors,errorAt,T,H});
 }
 const rows=root.locator('[data-activity-carrier="ingest->app"][data-activity-kind="threshold"]');
 await sample(100,T);await expect(rows).toHaveCount(0);
 await sample(10,T+H);await expect(rows).toHaveCount(1);
 await expect(rows.first()).toContainText('errors crossed outside its proof threshold');
 await expect(rows.first()).toHaveAttribute('data-updated-at',new Date(T+H).toISOString());
 await open(root,'ingest->app');await expect(production(root)).toContainText('errors is 1 req/h');await page.keyboard.press('Escape');
 await sample(10,T+H);await sample(100,T);await sample(100,T+H);await expect(rows).toHaveCount(1);
 await sample(null,T+2*H);await expect(rows).toHaveCount(1);
 await sample(100,T+3*H,1,T+20*H);await expect(rows).toHaveCount(2);
 await expect(rows.first()).toContainText('errors crossed back within its proof threshold');
 await expect(rows.first()).toHaveAttribute('data-updated-at',new Date(T+3*H).toISOString());
 await sample(10,T+H);await expect(rows).toHaveCount(2);
 expect(await page.evaluate(()=>[window.calls.live.length,window.calls.history.length])).toEqual([0,0]);
});
