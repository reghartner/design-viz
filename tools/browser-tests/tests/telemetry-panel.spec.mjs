import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
import {setup,spec} from '../helpers/telemetry-proof.mjs';
const T=Date.UTC(2026,10,4,12),H=3600000,DAY=24*H;
const metrics=root=>root.getByRole('button',{name:'Metrics',exact:true}),over=root=>root.getByRole('button',{name:'Over time',exact:true}),live=root=>root.getByRole('button',{name:'Live',exact:true});
const carrier=(root,id)=>root.locator('[data-proof-carrier="'+id+'"]');
async function day(root,index){const s=root.getByRole('slider',{name:'Day',exact:true});await s.focus();await s.press('Home');for(let i=0;i<index;i++)await s.press('ArrowRight');await expect(s).toHaveValue(String(index));}
test('Proof exact bound rows, ring denominator and neutral remainder across local/direct/nested carriers, safe links, retained section order',async({page,server},testInfo)=>{
 const root=await setup(page,server);await expect(metrics(root)).toHaveAttribute('aria-pressed','false');await expect(root.locator('.dv-live-proof')).toHaveCount(0);await metrics(root).click();
 const panel=root.locator('.pt-live-status');await expect(panel.locator('.dv-live-proof-row')).toHaveCount(6);
 expect(await panel.locator('.dv-live-proof-row').evaluateAll(rows=>rows.map(r=>r.dataset.proofCarrier))).toEqual(['ingest','shared::api','ingest->app','app->push','shared::api->shared::store','outer::inner::a->outer::inner::b']);
 await expect(panel.locator('.dv-live-proof-ratio')).toHaveText('2/6 bound proven');await expect(panel.locator('.dv-live-proof')).toHaveAttribute('data-proof-bound','6');await expect(panel.locator('.dv-live-proof')).toHaveAttribute('data-proof-unbound','6');
 const arcs=await panel.locator('.dv-live-proof-arc').evaluateAll(nodes=>nodes.map(n=>({bucket:n.dataset.proofBucket,size:parseFloat(n.getAttribute('stroke-dasharray')),offset:Number(n.getAttribute('stroke-dashoffset'))})));
 expect(arcs.map(a=>a.bucket)).toEqual(['proven','degraded','unproven','liveEarly']);expect(arcs[0].size).toBeCloseTo(100*2/6,8);expect(arcs.slice(1).map(a=>a.size)).toEqual([100/6,100/6,100/6]);expect(arcs.reduce((n,a)=>n+a.size,0)).toBeCloseTo(100*5/6,8);
 await expect(panel.locator('.dv-live-proof-pills')).toHaveText('2 proven1 degraded1 unproven1 live early1 unclassified6 unbound');
 expect(await panel.locator('.dv-live-panel-body').evaluate(body=>[...body.children].filter(n=>n.matches('.dv-live-epic,.dv-live-proof,h3')).map(n=>n.classList.contains('dv-live-proof')?'Proof':n.classList.contains('dv-live-epic')?'Epic':n.textContent))).toEqual(['Epic','Proof','Tickets','Proof table','Blockers and dependency chains','Activity']);
 await expect(carrier(panel,'ingest->app')).toContainText('Delivery <script>bad()</script>');await expect(carrier(panel,'ingest->app').locator('script')).toHaveCount(0);await expect(carrier(panel,'ingest->app').locator('a')).toHaveAttribute('href','https://authored.test/board');await expect(carrier(panel,'shared::api->shared::store').locator('a')).toHaveAttribute('href','https://provider.test/fallback');await expect(carrier(panel,'app->push').locator('a')).toHaveCount(0);
 await expect(carrier(panel,'ingest->app').locator('.dv-live-proof-marker')).toHaveCount(2);await expect(carrier(panel,'ingest->app').locator('.dv-live-proof-series')).toHaveCount(1);await expect(carrier(panel,'shared::api')).toContainText('unobserved');await expect(carrier(panel,'app->push')).toContainText('rate: 0 req/h');
 await page.evaluate(()=>{window.retained=document.querySelector('#host').shadowRoot.querySelector('[data-proof-carrier="ingest->app"]');});await carrier(panel,'ingest->app').locator('a').focus();await page.evaluate(()=>window.seed());expect(await page.evaluate(()=>window.retained===document.querySelector('#host').shadowRoot.querySelector('[data-proof-carrier="ingest->app"]'))).toBe(true);await expect(carrier(panel,'ingest->app').locator('a')).toBeFocused();await expect(carrier(panel,'ingest->app').locator('svg[data-icon="external-link"]')).toHaveCount(1);
 await panel.locator('.dv-live-proof-table').evaluate(table=>{table.parentElement.scrollLeft=0;});
 await panel.screenshot({path:testInfo.outputPath('proof-panel-desktop.png')});
 await panel.getByRole('button',{name:'Key',exact:true}).click();expect(await page.evaluate(()=>window.calls.live.length)).toBe(1);await metrics(root).click();await expect(root.locator('.dv-live-proof')).toHaveCount(0);
});
test('telemetry-only host apply while Metrics is off shows Proof without Jira totals and isolates sibling lifetime',async({page,server})=>{
 const root=await setup(page,server,{telemetryOnly:true,siblings:true});await page.evaluate(()=>window.seed());await expect(root.locator('.dv-live-proof-row')).toHaveCount(6);await expect(metrics(root)).toHaveAttribute('aria-pressed','false');await expect(root.locator('.dv-metrics-card')).toHaveCount(0);await expect(root.locator('.dv-live-epic:not(.dv-live-proof),.dv-live-tickets:not(.dv-live-proof-table),.dv-live-empty')).toHaveCount(0);await expect(root.locator('.dv-live-proof-row').first()).toContainText('No tickets');
 await expect(page.locator('#sibling .dv-live-proof')).toHaveCount(0);expect(await page.evaluate(()=>window.calls.live.length)).toBe(0);await page.evaluate(()=>window.viewer.controller.telemetry.setAvailable(false));await expect(metrics(root)).toBeHidden();await expect(root.locator('.dv-live-proof')).toHaveCount(0);await page.evaluate(()=>window.seed());await expect(root.locator('.dv-live-proof')).toHaveCount(0);
 await page.evaluate(()=>window.viewer.destroy());await expect(root).toBeEmpty();await metrics(page.locator('#sibling')).click();await expect(page.locator('#sibling .dv-live-proof')).toHaveCount(1);await page.evaluate(()=>{window.retiredProof=document.querySelector('#sibling').shadowRoot.querySelector('.pt-live-status');window.sibling.destroy();});await expect(page.locator('#sibling')).toBeEmpty();expect(await page.evaluate(()=>window.retiredProof.querySelectorAll('.dv-live-proof,.dv-live-proof-table').length)).toBe(0);
});
test('Proof activation ignores unknown, unbound and unobserved data but accepts local/direct/nested zero while Metrics is off',async({page,server})=>{
 const root=await setup(page,server,{telemetryOnly:true});
 const invalid=['unknown carrier','unbound carrier','unbound signal','empty sample','empty signals','empty series','markers and links only','invalid values and points'];
 for(const mode of invalid){
  await page.evaluate(({mode,T})=>{
   const maps={
    'unknown carrier':{unknown:{signals:{rate:{value:42}}}},
    'unbound carrier':{app:{signals:{rate:{value:42}}}},
    'unbound signal':{'shared::api':{signals:{lag:{value:42}}}},
    'empty sample':{ingest:{}},'empty signals':{ingest:{signals:{}}},
    'empty series':{ingest:{signals:{lag:{series:[]}}}},
    'markers and links only':{ingest:{markers:[{kind:'deploy',at:new Date(T).toISOString()}],links:{dashboard:'https://provider.test'}}},
    'invalid values and points':{ingest:{signals:{lag:{value:NaN,series:[[T,Infinity],['invalid',0],[T,'0']]},age:{value:'0'}}}}
   };window.viewer.controller.telemetry.apply(maps[mode]);
  },{mode,T});
  await expect(root.locator('.dv-live-proof,.dv-live-proof-table'),mode).toHaveCount(0);
 }
 for(const [id,signal] of [['ingest','lag'],['shared::api','rate'],['outer::inner::a->outer::inner::b','rate']]){
  for(const series of [false,true]){
   await page.evaluate(({id,signal,series,T})=>window.viewer.controller.telemetry.apply({[id]:{signals:{[signal]:series?{series:[[T,0]]}:{value:0}}}}),{id,signal,series,T});
   await expect(root.locator('.dv-live-proof')).toHaveCount(1);await expect(root.locator('.dv-live-proof-row')).toHaveCount(6);
   await expect(carrier(root,id)).toContainText(signal+': 0');
   await expect(carrier(root,'ingest->app')).toContainText('unobserved');
   await page.evaluate(()=>window.viewer.controller.telemetry.apply({ingest:{signals:{lag:{}}}}));
   await expect(root.locator('.dv-live-proof,.dv-live-proof-table')).toHaveCount(0);
  }
 }
 await expect(metrics(root)).toHaveAttribute('aria-pressed','false');await expect(root.locator('.dv-metrics-card')).toHaveCount(0);
 expect(await page.evaluate(()=>[window.calls.live.length,window.calls.history.length])).toEqual([0,0]);
});
test('Proof activation uses actual loader-selected detail identities and bound signals without querying',async({page,server})=>{
 const root=await setup(page,server,{details:true});
 // A detail-only identity is unknown until the actual loader selects its section.
 await page.evaluate(()=>window.viewer.controller.telemetry.apply({'shared::store->shared::api':{signals:{rate:{value:0}}}}));
 await expect(root.locator('.dv-live-proof,.dv-live-proof-table')).toHaveCount(0);
 await root.getByRole('button',{name:'Explore Imported service',exact:true}).click();await expect(root.getByText('Loading detail diagram…',{exact:true})).toBeVisible();await page.evaluate(()=>window.loadReleases.shift()());
 const scope=root.locator('[data-dv-detail-preview]:visible');await expect(scope.locator('.sec-h')).toHaveText('Selected imported detail');
 for(const id of ['shared::store->shared::api','detail::inner::a->detail::inner::b']){
  await page.evaluate(id=>window.viewer.controller.telemetry.apply({[id]:{signals:{unboundSignal:{value:0}}}}),id);
  await expect(root.locator('.dv-live-proof,.dv-live-proof-table')).toHaveCount(0);
  await page.evaluate(({id,T})=>window.viewer.controller.telemetry.apply({[id]:{signals:{rate:{series:[[T,0]]}}}}),{id,T});
  await expect(scope.locator('.dv-live-proof')).toHaveCount(1);await expect(carrier(scope,id)).toContainText('rate: 0 req/h');
  await expect(carrier(scope,'ingest->app')).toContainText('unobserved');await expect(scope.locator('.dv-live-proof-table')).not.toContainText('Decoy');
 }
 await expect(metrics(scope)).toHaveAttribute('aria-pressed','false');expect(await page.evaluate(()=>[window.calls.live.length,window.calls.history.length,window.calls.detail.length])).toEqual([0,0,1]);
 await scope.locator('.detail-breadcrumb button').first().click();await page.evaluate(()=>window.viewer.controller.telemetry.apply({}));await expect(root.locator('.dv-live-proof,.dv-live-proof-table')).toHaveCount(0);
});
for(const disabled of ['page','host','tools'])test(disabled+' disable hides controls, rejects seeded Proof and preserves Jira',async({page,server})=>{
 const root=await setup(page,server,{disabled});await page.evaluate(()=>window.seed());await expect(metrics(root)).toBeHidden();await expect(root.locator('.dv-live-proof')).toHaveCount(0);await expect(root.locator('.dv-live-tickets')).toHaveCount(1);await over(root).click();await day(root,0);await live(root).click();expect(await page.evaluate(()=>[window.calls.live.length,window.calls.history.length,Object.keys(window.viewer.controller.telemetry.snapshot().map).length])).toEqual([0,0,0]);
});
test('real Metrics and Over time controls select identical card/table evidence without slider or retained-render queries',async({page,server})=>{
 const root=await setup(page,server);await metrics(root).click();await over(root).click();await day(root,0);await expect(carrier(root,'ingest->app')).toHaveAttribute('data-verdict','done-unproven');await expect(root.locator('[data-metrics-card="ingest->app"]')).toHaveAttribute('data-verdict','done-unproven');await expect(carrier(root,'ingest->app')).toContainText('rate: 0 req/h');await expect(carrier(root,'ingest->app').locator('.dv-live-proof-series,.dv-live-proof-marker')).toHaveCount(0);await expect(carrier(root,'ingest->app').locator('.dv-live-proof-point')).toHaveCount(1);
 await day(root,1);await expect(carrier(root,'ingest->app')).toContainText('rate: unobserved');await expect(root.locator('[data-metrics-card="ingest->app"]')).toContainText('unobserved');await day(root,2);await expect(carrier(root,'ingest->app')).toContainText('rate: 50 req/h');await expect(root.locator('[data-metrics-card="ingest->app"]')).toContainText('50 req/h');await root.getByRole('button',{name:'Key',exact:true}).click();expect(await page.evaluate(()=>[window.calls.live.length,window.calls.history.length])).toEqual([1,1]);
 await live(root).click();await expect(carrier(root,'ingest->app')).toContainText('rate: 100 req/h');await expect(root.locator('[data-metrics-card="ingest->app"]')).toContainText('100 req/h');expect(await page.evaluate(()=>window.calls.history.length)).toBe(1);
});
test('actual async selected detail adds direct and nested imported Proof in history, with one binding batch and safe Back teardown',async({page,server})=>{
 const root=await setup(page,server,{details:true});await metrics(root).click();await over(root).click();await day(root,0);await root.getByRole('button',{name:'Explore Imported service',exact:true}).click();await expect(root.getByText('Loading detail diagram…',{exact:true})).toBeVisible();await page.evaluate(()=>window.loadReleases.shift()());const scope=root.locator('[data-dv-detail-preview]:visible');await expect(scope.locator('.sec-h')).toHaveText('Selected imported detail');
 await expect(carrier(scope,'shared::store->shared::api')).toHaveAttribute('data-verdict','done-unproven');await expect(carrier(scope,'detail::inner::a->detail::inner::b')).toHaveAttribute('data-verdict','done-unproven');await expect(scope.locator('[data-metrics-card="shared::store->shared::api"]')).toHaveAttribute('data-verdict','done-unproven');await expect(scope.locator('.dv-live-proof-table')).not.toContainText('Decoy');
 expect(await page.evaluate(()=>window.calls.detail[0].ref)).toEqual({spec:'selected-detail',revision:'r1',section:'selected'});const calls=await page.evaluate(()=>window.calls.history);expect(calls).toHaveLength(2);expect(calls[1].bindings.map(b=>b.id)).toEqual(['shared::store->shared::api','detail::inner::a->detail::inner::b']);
 await day(scope,2);await expect(carrier(scope,'shared::store->shared::api')).toContainText('rate: 50 req/h');await expect(scope.locator('[data-metrics-card="shared::store->shared::api"]')).toContainText('50 req/h');expect(await page.evaluate(()=>window.calls.history.length)).toBe(2);
 await scope.locator('.detail-breadcrumb button').first().click();await expect(root.locator('[data-dv-detail-preview]')).toHaveCount(0);await metrics(root).click();await expect(root.locator('.dv-live-proof')).toHaveCount(0);await page.evaluate(()=>window.viewer.destroy());await expect(root).toBeEmpty();
});
test('discovered missing tools hide Metrics and reject Proof without starting queries',async({page,server})=>{
 const raw=spec();raw.page.sections[0].diagram.edges[0].label='Delivery';raw.page.tracking.telemetry.grafana={prometheus:'prom-main'};
 await page.addInitScript(()=>{window.toolCalls=[];window.flowviewBooted=ctl=>window.ctl=ctl;window.claude={use:async()=>({listTools:async()=>[{server:'Grafana',tools:['query_prometheus']}],callTool:async(...args)=>{window.toolCalls.push(args);return {payload:[]};}})};});
 const file=path.join(server.root,'proof-missing-tools.json'),out=path.join(server.root,'proof-missing-tools.html');await writeFile(file,JSON.stringify(raw));execFileSync('python3',[path.join(repo,'tools/inject.py'),file,path.join(repo,'template/flowview.html'),out]);await page.goto(server.origin+'/proof-missing-tools.html');await page.waitForFunction(()=>!!window.ctl);const root=page.locator('#docview');await expect(metrics(root)).toBeHidden();await page.evaluate(()=>window.ctl.telemetry.apply({ingest:{signals:{lag:{value:10}}}}));await expect(root.locator('.dv-live-proof')).toHaveCount(0);expect(await page.evaluate(()=>window.toolCalls)).toEqual([]);
});
