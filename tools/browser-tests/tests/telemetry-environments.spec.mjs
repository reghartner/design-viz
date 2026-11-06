import {writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect,paste,prepareEditorSurface} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
import {cueSpec} from '../helpers/telemetry-cards.mjs';

test('desktop environment profiles author with Undo and switch local/imported requests without changing default',async({page,server},testInfo)=>{
 await page.setViewportSize({width:1440,height:1000});
 const spec=cueSpec();spec.page.tracking.telemetry={grafana:{prometheus:'prom-$env'}};
 function bind(v){if(!v||typeof v!=='object')return;if(v.telemetry?.signals){v.telemetry.signals={rate:{grafana:'sum(rate(new_pipe_total{env="$env"}[5m]))',unit:'req/s'}};v.telemetry.links={dashboard:'https://grafana.example/d/${env}'};}Object.values(v).forEach(bind);}bind(spec);
 await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(spec));await prepareEditorSurface(page);
 await page.locator('#editor-tab-inspect').click();await page.locator('#document-settings').click();
 const guide=page.locator('#guide'),source=page.locator('#src');
 const before=await source.inputValue();
 await guide.getByLabel('New environment id',{exact:true}).fill('qa');await guide.getByRole('button',{name:'Add environment',exact:true}).click();
 const after=await source.inputValue();await page.locator('#undo-builder').click();await expect(source).toHaveValue(before);await page.locator('#redo-builder').click();await expect(source).toHaveValue(after);
 await page.locator('#document-settings').click();
 for(const id of ['stg','prd']){await guide.getByLabel('New environment id',{exact:true}).fill(id);await guide.getByRole('button',{name:'Add environment',exact:true}).click();}
 await guide.getByLabel('Default environment',{exact:true}).selectOption('stg');
 const uid=guide.getByLabel('prd Grafana Prometheus UID',{exact:true});await uid.fill('production-prom');await uid.press('Enter');
 const authored=JSON.parse(await source.inputValue());expect(authored.page.tracking.telemetry.environment).toBe('stg');expect(authored.page.tracking.telemetry.environments.prd.grafana.prometheus).toBe('production-prom');
 await guide.locator('.metrics-environments').screenshot({path:testInfo.outputPath('environment-settings.png')});
 const input=path.join(server.root,'environment.spec.json'),output=path.join(server.root,'environment.html');await writeFile(input,JSON.stringify(authored));execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),output],{stdio:'pipe'});
 await page.addInitScript(()=>{
  window.envCalls=[];window.claude={use:async()=>({listTools:async()=>[{server:'Grafana',tools:['query_prometheus','query_loki_logs','search_tempo_traces','get_annotations','generate_deeplink']}],callTool:async(server,tool,input)=>{window.envCalls.push({tool,input});if(tool==='query_prometheus')return {payload:{data:[{values:[[1793491200,input.datasourceUid==='production-prom'?'91':'12']]}]}};return {payload:[]};}})};
  window.flowviewBooted=ctl=>window.envController=ctl;
 });
 await page.goto(server.origin+'/environment.html');await page.waitForFunction(()=>!!window.envController);
 const panel=page.locator('#docview .pt-live-status').first(),selector=panel.getByRole('combobox',{name:'Environment',exact:true}),metrics=panel.getByRole('button',{name:'Metrics',exact:true});
 await expect(selector).toHaveValue('stg');await expect(metrics).toBeVisible();expect(await page.evaluate(()=>window.envCalls.length)).toBe(0);
 await selector.selectOption('qa');expect(await page.evaluate(()=>window.envCalls.length)).toBe(0);
 await metrics.click();await expect.poll(()=>page.evaluate(()=>window.envController.telemetry.snapshot().map['shared::api']?.signals.rate?.value)).toBe(12);
 await expect.poll(()=>page.evaluate(()=>window.envController.telemetry.snapshot().map.ingest?.signals.rate?.value)).toBe(12);
 await selector.selectOption('prd');await expect(metrics).toHaveAttribute('aria-pressed','true');
 await expect.poll(()=>page.evaluate(()=>window.envController.telemetry.snapshot().map['shared::api']?.signals.rate?.value)).toBe(91);
 expect(await page.evaluate(()=>window.envController.telemetry.snapshot().map.ingest.signals.rate.value)).toBe(91);
 const calls=await page.evaluate(()=>window.envCalls.filter(c=>c.tool==='query_prometheus'));
 expect(calls.some(c=>c.input.datasourceUid==='prom-qa'&&c.input.expr.includes('env="qa"'))).toBe(true);expect(calls.some(c=>c.input.datasourceUid==='production-prom'&&c.input.expr.includes('env="prd"'))).toBe(true);
 await expect(panel.locator('.dv-live-metrics-connection')).toContainText('prd');
 expect(await page.evaluate(()=>JSON.parse(document.querySelector('#flowspec').textContent).page.tracking.telemetry.environment)).toBe('stg');
 await panel.screenshot({path:testInfo.outputPath('environment-reader.png')});
 for(const id of ['ingest','shared::api']){await page.locator('g.node[data-dv-node="'+id+'"]').click();await expect(page.locator('.dv-live-production-heading')).toHaveText('PRD Evidence');await expect(page.locator('.dv-live-production-link')).toHaveAttribute('href','https://grafana.example/d/prd');await page.evaluate(()=>window.envController.telemetry.retry());await expect(page.locator('.dv-live-production-heading')).toHaveText('PRD Evidence');await page.keyboard.press('Escape');}
 await selector.selectOption('stg');await expect.poll(()=>page.evaluate(()=>window.envController.telemetry.snapshot().map.ingest?.signals.rate?.value)).toBe(12);await page.locator('g.node[data-dv-node="shared::api"]').click();await expect(page.locator('.dv-live-production-heading')).toHaveText('STG Evidence');await page.screenshot({path:'/tmp/evidence-status-stg-inspect.png'});await page.keyboard.press('Escape');
 await metrics.click();const count=await page.evaluate(()=>window.envCalls.length);await selector.selectOption('stg');expect(await page.evaluate(()=>window.envCalls.length)).toBe(count);
});

test('desktop delayed queries distinguish loading, refresh, empty, failure and environment changes on local/imported evidence',async({page,server})=>{
 await page.setViewportSize({width:1440,height:1000});const raw=cueSpec();raw.page.tracking.telemetry={grafana:{cloudwatch:'cw-$env'},environment:'stg',environments:{stg:{},prd:{}}};
 function bind(v){if(!v||typeof v!=='object')return;if(v.telemetry?.signals){v.telemetry.signals={rate:{cloudwatch:{namespace:'AWS/IoT',metric:'Success',region:'us-east-1',accountId:'111111111111',dimensions:{},statistic:'Sum'},unit:'req/s'}};v.telemetry.proof={rate:{min:1}};}Object.values(v).forEach(bind);}bind(raw);
 const input=path.join(server.root,'loading.spec.json'),output=path.join(server.root,'loading.html');await writeFile(input,JSON.stringify(raw));execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),output],{stdio:'pipe'});
 await page.addInitScript(()=>{window.requests=[];window.flowviewBooted=ctl=>window.loadingCtl=ctl;window.claude={use:async()=>({listTools:async()=>[{server:'Grafana',tools:['query_cloudwatch']}],callTool:async(server,tool,input)=>new Promise((resolve,reject)=>window.requests.push({tool,input,resolve,reject,done:false}))})};window.finishQueries=(mode,value=12)=>{window.requests.filter(r=>!r.done).forEach(r=>{r.done=true;if(mode==='failure')r.reject({code:'tool_error',message:'query failed'});else r.resolve({payload:{values:mode==='empty'?[]:[value],timestamps:mode==='empty'?[]:[1793491200000]}});});};});
 await page.goto(server.origin+'/loading.html');await page.waitForFunction(()=>!!window.loadingCtl);const root=page.locator('#docview'),panel=root.locator('.pt-live-status').first(),metrics=panel.getByRole('button',{name:'Metrics',exact:true}),env=panel.getByRole('combobox',{name:'Environment',exact:true});
 await expect(root.locator('.dv-metrics-card')).toHaveCount(0);expect(await page.evaluate(()=>window.requests.length)).toBe(0);await metrics.click();
 const card=root.locator('[data-metrics-card="ingest->app"]');await expect(card).toContainText('Loading…');await expect(card).toHaveAttribute('data-state','loading');await expect(card).not.toContainText('unobserved');
 for(const id of ['ingest','shared::api']){await root.locator('g.node[data-dv-node="'+id+'"]').click();await expect(page.locator('.dv-live-production-heading')).toHaveText('STG Evidence');await expect(page.locator('.dv-live-production')).toContainText('Loading…');if(id==='shared::api')await page.screenshot({path:'/tmp/evidence-status-loading-stg.png'});await page.keyboard.press('Escape');}
 await page.evaluate(()=>window.finishQueries('value'));await expect(card).toContainText('12 req/s');await expect(card).not.toContainText('Loading');
 await root.locator('g.node[data-dv-node="shared::api"]').click();await expect(page.locator('.dv-live-production-heading')).toHaveText('STG Evidence');await expect(page.locator('.dv-live-production')).toContainText('12 req/s');await page.screenshot({path:'/tmp/evidence-status-loaded-stg.png'});await page.keyboard.press('Escape');
 await page.evaluate(()=>window.loadingCtl.telemetry.retry());await expect(card).toContainText('12 req/s · Refreshing…');await page.evaluate(()=>window.finishQueries('empty'));await expect(card).toContainText('unobserved');await expect(card).not.toContainText('Loading');await expect(card).not.toContainText('Refreshing');
 await page.evaluate(()=>window.loadingCtl.telemetry.retry());await expect(card).toContainText('Loading…');await page.evaluate(()=>window.finishQueries('failure'));await expect(card).toContainText('unobserved');await expect(card).not.toContainText('Loading');
 await page.evaluate(()=>window.loadingCtl.telemetry.retry());await expect(card).toContainText('Loading…');await page.evaluate(()=>window.finishQueries('value',33));await expect(card).toContainText('33 req/s');
 await env.selectOption('prd');await expect(card).toContainText('Loading…');await expect(card).not.toContainText('33');await page.evaluate(()=>window.finishQueries('value',44));await expect(card).toContainText('44 req/s');
 await page.evaluate(()=>window.loadingCtl.telemetry.retry());await expect(card).toContainText('Refreshing');await metrics.click();await page.evaluate(()=>window.finishQueries('value',999));await expect(root.locator('.dv-metrics-card')).toHaveCount(0);expect(await page.evaluate(()=>Object.keys(window.loadingCtl.telemetry.snapshot().pending))).toEqual([]);
});
