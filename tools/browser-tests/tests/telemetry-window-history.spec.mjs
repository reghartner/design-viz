import {writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect} from '../helpers/test.mjs';
import sourceLoader from '../../../tools/source-loader.cjs';
import {repo} from '../helpers/prepare.mjs';
import {cueSpec,CUE_JIRA,mountCues} from '../helpers/telemetry-cards.mjs';
const NOW=Date.UTC(2026,10,6,15),DAY=86400000,HOUR=3600000;
function spec(){const raw=cueSpec();raw.page.title='Selected numeric history';raw.page.tracking.telemetry={window:'24h',environment:'stg',environments:{stg:{},prd:{}},grafana:{cloudwatch:'cw-$env'},honeycomb:{environment:'fixture',dataset:'events'}};
 const binding={kind:'call',signals:{received:{cloudwatch:{namespace:'AWS/IoT',metric:'Success',region:'us-east-1',accountId:'111111111111',dimensions:{RuleName:'camera_delivery_rule_with_full_name_retained_in_inspect_$env'},statistic:'Sum'},label:'Received',unit:'events',links:{query:'https://grafana.example/explore/received'}},failed:{cloudwatchLogs:{logGroups:['fixture'],query:'filter status = "Failure" | stats count() as n',region:'us-east-1',valueField:'n'},label:'Rejected',unit:'events'},latency:{honeycomb:{calculations:[{op:'P95',column:'duration_ms'}]},label:'Latency p95',unit:'ms'}},proof:{received:{min:1}}};
 function bind(v){if(!v||typeof v!=='object')return;if(v.telemetry?.signals)v.telemetry=structuredClone(binding);else Object.values(v).forEach(bind);}bind(raw);return raw;}
// #1138: the same board with every ticket and the Jira tracking removed.
function jiraFree(raw){delete raw.page.tracking.jira;(function strip(v){if(!v||typeof v!=='object')return;if(!Array.isArray(v))delete v.tickets;Object.values(v).forEach(strip);})(raw);return raw;}
async function fixture(page,server,native,free){
 await page.setViewportSize({width:1440,height:1000});await page.clock.setFixedTime(new Date(NOW));
 await page.addInitScript(({NOW,HOUR})=>{
  window.historyCalls=[];window.holdHoney=true;window.releaseHoney=[];window.failCloud=false;
  window.claude={use:async()=>({listTools:async()=>[{server:'Grafana',tools:['query_cloudwatch','query_cloudwatch_logs']},{server:'Honeycomb',tools:[{name:'run_query',inputSchema:{type:'object',properties:{environment_slug:{type:'string'},dataset_slug:{type:'string'},query_spec:{type:'object'}},required:['environment_slug','query_spec']}}]}],callTool:async(server,tool,input,options)=>{
   window.historyCalls.push({tool,input,signal:options?.signal});const end=Date.parse(input.end || input.query_spec?.to || new Date(NOW).toISOString()),today=end===NOW;
   if(tool==='query_cloudwatch'){if(window.failCloud)throw {code:'tool_error',message:'CloudWatch unavailable for this window'};return {payload:{timestamps:[end-8*HOUR,end-7*HOUR,end-2*HOUR],values:today?[5,7,8]:[2,3,4]}};}
   if(tool==='query_cloudwatch_logs')return {payload:{status:'Complete',totalFound:999,logs:input.limit===1000?[{flowview_time:new Date(end-2*HOUR).toISOString(),n:'4'},{flowview_time:new Date(end-HOUR).toISOString(),n:'5'}]:[{n:'15'}]}};
   const value={structuredContent:{results:[{data:{'P95(duration_ms)':today?95:75}}],series:[{data:{time:new Date(end-2*HOUR).toISOString(),'P95(duration_ms)':today?90:70}},{data:{time:new Date(end-HOUR).toISOString(),'P95(duration_ms)':today?95:75}}],info:{granularity_seconds:3600}}};
   return window.holdHoney?new Promise(resolve=>window.releaseHoney.push(()=>resolve(value))):value;
  }})};window.flowviewBooted=ctl=>window.historyCtl=ctl;
 },{NOW,HOUR});
 const raw=free?jiraFree(spec()):spec();
 if(native){await mountCues(page,server);await page.addScriptTag({content:sourceLoader.entrypoint('standalone').body});await page.evaluate(raw=>{window.viewer.destroy();const p=normalize(raw),adapter=createTelemetryProviders(p,window);window.viewer=window.mount(document.querySelector('#host'),raw,{telemetry:adapter.options});window.historyCtl=window.viewer.controller;adapter.attach(window.historyCtl,p);},raw);}
 else {const input=path.join(server.root,'window-history.json'),out=path.join(server.root,'window-history.html');await writeFile(input,JSON.stringify(raw));execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),out],{stdio:'pipe'});await page.goto(server.origin+'/window-history.html');}
 await page.waitForFunction(()=>!!window.historyCtl);
 if(free)return page.locator('#docview');
 await page.evaluate(({jira,NOW,DAY})=>{window.historyCtl.liveStatus.apply(jira);const today=new Date(NOW).toISOString().slice(0,10);window.historyDays=[-1,0,1].map(i=>({key:new Date(Date.parse(today)+i*DAY).toISOString().slice(0,10),at:new Date(Date.parse(today)+(i+1)*DAY).toISOString(),label:i===0?'Today':i<0?'Yesterday':'Tomorrow',short:i===0?'Today':i<0?'Yesterday':'Tomorrow',states:jira}));window.historyCtl.liveStatus.setHistory({load:()=>({days:window.historyDays,index:1})});},{jira:CUE_JIRA,NOW,DAY});
 return page.locator(native?'#host':'#docview');
}
for(const native of [false,true])test((native?'native shadow DOM':'standalone')+' selected numeric history: Today, partial loading, past cache, future, env, off/on and Live',async({page,server})=>{
 const root=await fixture(page,server,native),panel=root.locator('.pt-live-status').first(),metrics=panel.getByRole('switch',{name:'Metrics overlay',exact:true}),over=panel.getByRole('button',{name:'Over time',exact:true}),live=panel.getByRole('button',{name:'Live',exact:true}),slider=panel.getByRole('slider',{name:'Day',exact:true});
 await over.click();await expect(slider).toHaveValue('1');expect(await page.evaluate(()=>window.historyCalls.length)).toBe(0);await metrics.click();
 const local=root.locator('[data-metrics-card="ingest->app"]').first(),imported=root.locator('[data-metrics-card="shared::api->shared::store"]').first();
 for(const card of [local,imported]){await expect(card).toContainText('20 events');await expect(card).toContainText('15 events');await expect(card).toContainText('Loading…');}
 if(!native)await page.screenshot({path:'/tmp/metric-history-today-loading.png'});
 await page.evaluate(()=>{window.holdHoney=false;window.releaseHoney.splice(0).forEach(f=>f());});for(const card of [local,imported])await expect(card).toContainText('95 ms');
 expect(await page.evaluate(()=>window.historyCalls.filter(c=>c.tool==='query_cloudwatch').every(c=>Date.parse(c.input.end)===Date.now()&&Date.parse(c.input.start)===Date.now()-86400000&&c.input.period===3600))).toBe(true);
 const geometry=await local.evaluate(card=>{const box=card.querySelector('rect'),dots=[...card.querySelectorAll('circle.dv-metrics-sparkline')],lines=[...card.querySelectorAll('polyline.dv-metrics-sparkline')];return {width:+box.getAttribute('width'),dots:dots.map(d=>+d.getAttribute('cx')),lines:lines.length};});expect(geometry.width).toBeLessThanOrEqual(240);expect(geometry.dots).toHaveLength(3);expect(geometry.lines).toBe(1);expect(geometry.dots.at(-1)).toBeLessThan(110);
 await root.locator('g.node[data-dv-node="shared::api"]').click();await expect(root.locator('.dv-live-production-heading')).toHaveText('STG Evidence');await expect(root.locator('.dv-live-popover')).toContainText('95 ms');if(!native)await page.screenshot({path:'/tmp/metric-history-imported-inspect.png'});await page.keyboard.press('Escape');
 await slider.focus();await slider.press('Home');await expect(local).toContainText('9 events');await expect(local).toContainText('75 ms');const pastCalls=await page.evaluate(()=>window.historyCalls.length);
 await slider.press('End');await expect(local).toContainText('unobserved');expect(await page.evaluate(()=>window.historyCalls.length)).toBe(pastCalls);await slider.press('Home');await expect(local).toContainText('9 events');expect(await page.evaluate(()=>window.historyCalls.length)).toBe(pastCalls);
 if(!native){await root.screenshot({path:'/tmp/metric-history-yesterday.png'});await local.screenshot({path:'/tmp/metric-history-card.png'});}
 await panel.getByRole('combobox',{name:'Env',exact:true}).selectOption('prd');await expect(local).toContainText('9 events');expect(await page.evaluate(()=>window.historyCalls.filter(c=>c.tool==='query_cloudwatch').at(-1).input.dimensions.RuleName.endsWith('_prd'))).toBe(true);
 await page.evaluate(()=>{window.failCloud=true;window.historyCtl.telemetry.retry();});await expect(local).toContainText('unobserved');await expect(local).toContainText('15 events');await expect(local).toContainText('75 ms');await expect(panel.locator('.dv-live-metrics-connection')).toContainText('CloudWatch unavailable');
 await metrics.click();await expect(local).toHaveCount(0);await page.evaluate(()=>window.failCloud=false);await metrics.click();await expect(local).toContainText('9 events');await live.click();await expect(slider).toBeHidden();await expect(local).toContainText('20 events');await expect(local).toContainText('95 ms');expect(await page.evaluate(()=>window.historyCalls.some(c=>/trace/i.test(c.tool)))).toBe(false);
});
// #1138 (D2): a board with no Jira gets Over time on the last 7 local days, built with no calls, and shows the selected day's cards.
test('Jira-free board: Over time offers the last 7 local days and shows the selected day\'s metric cards (#1138)',async({page,server})=>{
 const root=await fixture(page,server,false,true),panel=root.locator('.pt-live-status').first(),metrics=panel.getByRole('switch',{name:'Metrics overlay',exact:true}),over=panel.getByRole('button',{name:'Over time',exact:true}),slider=panel.getByRole('slider',{name:'Day',exact:true}),local=root.locator('[data-metrics-card="ingest->app"]').first();
 expect(await page.evaluate(()=>window.historyCtl.liveStatus.snapshot().available)).toBe(false);
 await expect(over).toBeVisible();await over.click();await expect(root.locator('.dv-live-over-time-row')).toBeVisible();await expect(slider).toHaveAttribute('max','6');await expect(slider).toHaveValue('6');await expect(root.locator('.dv-live-over-time-day')).toHaveText('TODAY');
 expect(await page.evaluate(()=>window.historyCalls.length)).toBe(0);
 await page.evaluate(()=>{window.holdHoney=false;});await metrics.click();await expect(local).toContainText('20 events');await expect(local).toContainText('95 ms');
 await slider.focus();await slider.press('Home');await expect(local).toContainText('9 events');await expect(local).toContainText('75 ms');
 const first=await page.evaluate(()=>{const now=new Date(Date.now());return new Date(now.getFullYear(),now.getMonth(),now.getDate()-5).toISOString();});
 expect(await page.evaluate(()=>window.historyCalls.filter(c=>c.tool==='query_cloudwatch').at(-1).input.end)).toBe(first);
});
