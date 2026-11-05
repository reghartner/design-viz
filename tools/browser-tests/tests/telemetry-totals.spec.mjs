import {test,expect} from '../helpers/test.mjs';
import {setup} from '../helpers/telemetry-proof.mjs';
const T=Date.UTC(2026,10,4,12),H=3600000,iso=t=>new Date(t).toISOString();
const metrics=root=>root.getByRole('button',{name:'Metrics',exact:true}),over=root=>root.getByRole('button',{name:'Over time',exact:true}),live=root=>root.getByRole('button',{name:'Live',exact:true});
const since=(root,id)=>root.locator('[data-proof-carrier="'+id+'"] .dv-live-proof-since');
const production=root=>root.locator('.dv-live-popover:visible .dv-live-production');
const sample=(value=1200,from=T-H,to=T,observedAt=T)=>({observedAt:iso(observedAt),signals:{rate:{value,unit:'events',aggregate:{kind:'total',from:iso(from),to:iso(to)}}}});
async function deliver(page,id,value=sample()){await page.evaluate(({id,value})=>window.viewer.controller.telemetry.apply({[id]:value}),{id,value});}
async function open(root,id,pop=root){const button=root.locator('[data-live-carrier="'+id+'"][tabindex="0"]:visible');await expect(button).toHaveCount(1);await button.focus();await button.press('Enter');await expect(production(pop)).toBeVisible();return button;}
async function done(page){await page.evaluate(at=>{window.jira=Object.fromEntries(Object.keys(window.jira).map(key=>[key,{state:'done',updatedAt:at}]));window.viewer.controller.liveStatus.apply(window.jira);},iso(T-H));}
test('explicit measured totals retain exact value/unit and Done scope on local/direct/nested carriers before Metrics enable',async({page,server})=>{
 const root=await setup(page,server);await done(page);
 for(const id of ['ingest->app','shared::api','shared::api->shared::store','outer::inner::a->outer::inner::b']){
  await deliver(page,id);await expect(since(root,id)).toContainText('rate total: 1200 events through '+iso(T));const button=await open(root,id);await expect(production(root)).toContainText('rate total: 1200 events through '+iso(T));await page.keyboard.press('Escape');await expect(button).toBeFocused();
 }
 const id='ingest->app';for(const value of [0,1200.123456789]){await deliver(page,id,sample(value));await expect(since(root,id)).toContainText('rate total: '+value+' events through '+iso(T));await open(root,id);await expect(production(root)).toContainText('rate total: '+value+' events');await page.keyboard.press('Escape');}
 const unsafe=sample();unsafe.signals.rate.unit='events <img src=x onerror=alert(1)>';await deliver(page,id,unsafe);await open(root,id);await expect(production(root)).toContainText(unsafe.signals.rate.unit);await expect(production(root).locator('img')).toHaveCount(0);await page.keyboard.press('Escape');
 for(const from of [T-H-1,T-H+1]){await deliver(page,id,sample(1200,from));await expect(since(root,id)).not.toContainText('total:');await open(root,id);await expect(production(root)).not.toContainText('total:');await page.keyboard.press('Escape');}
 await deliver(page,id,sample(1200,T-H,T+1));await expect(since(root,id)).not.toContainText('total:');
 const ordinary=sample();delete ordinary.signals.rate.aggregate;ordinary.signals.rate.series=[[T-H,600],[T,600]];await deliver(page,id,ordinary);await expect(since(root,id)).not.toContainText('total:');
 await deliver(page,id);await expect(since(root,id)).toContainText('total:');await page.evaluate(at=>window.viewer.controller.liveStatus.apply({...window.jira,'LOC-3':{state:'done',updatedAt:at}}),iso(T-H+1));await expect(since(root,id)).not.toContainText('total:');
 await expect(metrics(root)).toHaveAttribute('aria-pressed','false');expect(await page.evaluate(()=>[window.calls.live.length,window.calls.history.length])).toEqual([0,0]);
});
test('actual asynchronously selected imports show totals for direct and nested scoped bindings',async({page,server})=>{
 const root=await setup(page,server,{details:true});await done(page);await root.getByRole('button',{name:'Explore Imported service',exact:true}).click();await expect(root.getByText('Loading detail diagram…',{exact:true})).toBeVisible();await page.evaluate(()=>window.loadReleases.shift()());const scope=root.locator('[data-dv-detail-preview]:visible');await expect(scope.locator('.sec-h')).toHaveText('Selected imported detail');
 for(const id of ['shared::api','shared::store->shared::api','detail::inner::a->detail::inner::b']){
  await deliver(page,id,sample(0));await expect(since(scope,id)).toContainText('rate total: 0 events through '+iso(T));await open(scope,id,root);await expect(production(root)).toHaveAttribute('data-production-carrier',id);await expect(production(root)).toContainText('rate total: 0 events');await expect(production(root)).not.toContainText('Decoy');await page.keyboard.press('Escape');
 }
 expect(await page.evaluate(()=>[window.calls.live.length,window.calls.detail.length])).toEqual([0,1]);
});
test('history never borrows live totals, clear/off/availability/destroy retire totals independently of siblings',async({page,server})=>{
 const root=await setup(page,server,{siblings:true});await metrics(root).click();await deliver(page,'ingest->app');await open(root,'ingest->app');await expect(production(root)).toContainText('total: 1200 events');await page.keyboard.press('Escape');
 await over(root).click();const slider=root.getByRole('slider',{name:'Day',exact:true});await slider.focus();await slider.press('Home');await open(root,'ingest->app');await expect(production(root)).not.toContainText('total:');await expect(since(root,'ingest->app')).not.toContainText('total:');
 await slider.focus();await slider.press('End');await expect(production(root)).not.toContainText('total:');await live(root).click();await expect(since(root,'ingest->app')).not.toContainText('total:');
 await deliver(page,'ingest->app');await expect(since(root,'ingest->app')).toContainText('total:');await page.evaluate(()=>window.viewer.controller.telemetry.clear());await expect(root.locator('.dv-live-proof')).toHaveCount(0);
 await deliver(page,'ingest->app');await metrics(root).click();await deliver(page,'ingest->app');await expect(root.locator('.dv-live-proof')).toHaveCount(0);await expect(root.locator('[data-activity-type="telemetry"]')).toHaveCount(0);
 await metrics(root).click();await deliver(page,'ingest->app');await expect(since(root,'ingest->app')).toContainText('total:');await page.evaluate(()=>window.viewer.controller.telemetry.setAvailable(false));await deliver(page,'ingest->app');await expect(root.locator('.dv-live-proof')).toHaveCount(0);
 await page.evaluate(value=>{window.sibling.controller.liveStatus.apply(window.jira);window.sibling.controller.telemetry.apply({'ingest->app':value});},sample());await expect(since(page.locator('#sibling'),'ingest->app')).toContainText('total:');await page.evaluate(()=>window.viewer.destroy());await expect(root).toBeEmpty();await expect(since(page.locator('#sibling'),'ingest->app')).toContainText('total:');
});
for(const disabled of ['page','host','tools'])test(disabled+' suppression rejects measured totals as well as ordinary telemetry',async({page,server})=>{
 const root=await setup(page,server,{disabled});await deliver(page,'ingest->app');await expect(root.locator('.dv-live-proof')).toHaveCount(0);await expect(root.locator('[data-activity-type="telemetry"]')).toHaveCount(0);const button=root.locator('[data-live-carrier="ingest->app"][tabindex="0"]:visible');await button.press('Enter');await expect(root.locator('.dv-live-popover:visible .dv-live-ticket')).toContainText('LOC-3');await expect(production(root)).toHaveCount(0);expect(await page.evaluate(()=>window.calls.live.length)).toBe(0);
});
