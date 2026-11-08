import {writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
import {cueSpec} from '../helpers/telemetry-cards.mjs';

async function mount(page,server,kind,{missing=false,denied=false}={}){
 await page.setViewportSize({width:1440,height:1000});const spec=cueSpec();
 spec.page.tracking={telemetry:{grafana:{prometheus:'prom',loki:'logs',baseUrl:'https://evidenced.grafana.net'},honeycomb:{environment:'feature-qa'}}};
 function bind(v){if(!v||typeof v!=='object')return;if(v.telemetry?.signals){v.telemetry.signals=kind==='honeycomb'?{count:{honeycomb:{calculations:[{op:'SUM',column:'messaging.batch.message_count'}],filters:[{column:'service.name',op:'=',value:'new-pipe'},{column:'topic',op:'=',value:'new-topic'}]}}}:{rate:{loki:'sum(rate({topic="new-topic"}[5m]))'}};v.telemetry.links={};}Object.values(v).forEach(bind);}bind(spec);
 const input=path.join(server.root,'hosted.json'),out=path.join(server.root,'hosted.html');await writeFile(input,JSON.stringify(spec));execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),out],{stdio:'pipe'});
 await page.addInitScript(({kind,missing,denied})=>{
  window.hostedEvents=[];const schema={type:'object',properties:{environment_slug:{type:'string'},dataset_slug:{type:['null','string']},query_spec:{type:'object',properties:{calculations:{type:'array',items:{type:'object',properties:{op:{type:'string'},column:{type:['null','string']}},required:['op']}},filters:{type:'array'},from:{type:'string'}}}},required:['environment_slug','query_spec']};
  window.claude={use:async name=>name==='permissions'?{request:async names=>{window.hostedEvents.push({kind:'permission',names});return Object.fromEntries(names.map(n=>[n,denied?'denied':'granted']));}}:name==='mcp'?{
   listTools:async()=>[{server:kind==='honeycomb'?'Honeycomb Production':'Grafana Cloud',tools:[{name:kind==='honeycomb'?'run_query':missing?'query_prometheus':'query_loki_logs',description:'Hosted query',annotations:{readOnlyHint:true}}]}],
   describeTool:async(server,tool)=>{window.hostedEvents.push({kind:'describe',server,tool});return {name:tool,inputSchema:schema};},
   callTool:async(server,tool,input)=>{window.hostedEvents.push({kind:'query',server,tool,input});return tool==='run_query'?{structuredContent:{results:[{data:{'SUM(messaging.batch.message_count)':125}}],series:[]}}:{payload:{data:[{values:[{timestamp:'1793894400.000',value:7}]}]}};}
  }:null};window.flowviewBooted=ctl=>window.hostedController=ctl;
 },{kind,missing,denied});
 await page.goto(server.origin+'/hosted.html');await page.waitForFunction(()=>!!window.hostedController);const panel=page.locator('#docview .pt-live-status').first();return {panel,metrics:panel.getByRole('switch',{name:'Metrics overlay',exact:true})};
}
test('hosted Grafana without optional tools runs local/imported Loki and builds evidenced Explore links',async({page,server,audit})=>{
 const h=await mount(page,server,'grafana');await expect(h.metrics).toBeVisible();expect(await page.evaluate(()=>window.hostedEvents.length)).toBe(0);await h.metrics.click();await expect.poll(()=>page.evaluate(()=>window.hostedController.telemetry.snapshot().map['shared::api']?.signals.rate?.value)).toBe(7);
 const maps=await page.evaluate(()=>window.hostedController.telemetry.snapshot().map);expect(maps.ingest.signals.rate.value).toBe(7);
 for(const id of ['ingest','shared::api']){const u=new URL(maps[id].links.query);expect(u.origin).toBe('https://evidenced.grafana.net');expect(u.pathname).toBe('/explore');const pane=JSON.parse(u.searchParams.get('panes')).a;expect(pane.datasource).toBe('logs');expect(pane.queries[0]).toMatchObject({datasource:{uid:'logs',type:'loki'},expr:'sum(rate({topic="new-topic"}[5m]))',range:true,refId:'A'});expect(pane.range).toEqual({from:'now-24h',to:'now'});}
 await page.locator('g.node[data-dv-node="shared::api"]').click();await expect(page.locator('.dv-live-production-link')).toHaveAttribute('href',maps['shared::api'].links.query);
 await audit.mockExternal(maps['shared::api'].links.query,route=>route.fulfill({contentType:'text/html',body:'<h1>Explore destination</h1>'}));const popupPromise=page.waitForEvent('popup');await page.locator('.dv-live-production-link').click();const popup=await popupPromise;await expect(popup).toHaveURL(maps['shared::api'].links.query);await expect(popup.getByRole('heading',{name:'Explore destination'})).toBeVisible();await popup.close();expect(await page.evaluate(()=>window.hostedEvents.every(e=>e.tool==='query_loki_logs'))).toBe(true);
});
test('hosted Grafana missing a bound query tool has a visible diagnostic',async({page,server})=>{const h=await mount(page,server,'grafana',{missing:true});await expect(h.metrics).toBeHidden();await expect(h.panel.locator('.dv-live-metrics-connection')).toBeVisible();await expect(h.panel.locator('.dv-live-metrics-connection')).toContainText('query_loki_logs');});
test('hosted Honeycomb scalar-only board requests permission then nullable schema and exact local/imported values',async({page,server})=>{
 const h=await mount(page,server,'honeycomb');await expect(h.metrics).toBeVisible();expect(await page.evaluate(()=>window.hostedEvents.length)).toBe(0);await h.metrics.click();await expect.poll(()=>page.evaluate(()=>window.hostedController.telemetry.snapshot().map['shared::api']?.signals.count?.value)).toBe(125);expect(await page.evaluate(()=>window.hostedController.telemetry.snapshot().map.ingest.signals.count.value)).toBe(125);
 const events=await page.evaluate(()=>window.hostedEvents);expect(events[0]).toEqual({kind:'permission',names:['mcp:Honeycomb Production']});expect(events[1].kind).toBe('describe');expect(events[2].input.dataset_slug).toBeUndefined();expect(events[2].input.query_spec.filters).toHaveLength(2);await h.metrics.click();expect(await page.evaluate(()=>window.hostedController.telemetry.snapshot().map)).toEqual({});
});
test('hosted Honeycomb denied permission hides Metrics without describing or querying',async({page,server})=>{const h=await mount(page,server,'honeycomb',{denied:true});await expect(h.metrics).toBeVisible();await h.metrics.click();await expect(h.metrics).toBeHidden();expect(await page.evaluate(()=>window.hostedEvents.map(e=>e.kind))).toEqual(['permission']);});
