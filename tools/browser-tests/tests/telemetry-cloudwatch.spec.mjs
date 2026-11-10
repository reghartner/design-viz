import {writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect,paste,prepareEditorSurface,openMetricsFold} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
import {cueSpec} from '../helpers/telemetry-cards.mjs';

const query={namespace:'AWS/IoT',metric:'TopicMatch',dimensions:{RuleName:'camera_message_camera_stats_$env'},statistic:'Sum',region:'us-east-1',accountId:'$account'};
test('desktop CloudWatch editor round-trip and local/imported zero versus unobserved cards',async({page,server},testInfo)=>{
 await page.setViewportSize({width:1440,height:1000});
 const spec=cueSpec();spec.page.tracking.telemetry={window:'24h',environment:'stg',grafana:{cloudwatch:'cw-monitor'},environments:{stg:{grafana:{accountId:'646998985045'}},prd:{grafana:{accountId:'333333333333'}}}};
 function bind(v){if(!v||typeof v!=='object')return;if(v.telemetry?.signals){v.telemetry.signals={rate:{cloudwatch:query,unit:'events'}};v.telemetry.proof={rate:{min:1}};}Object.values(v).forEach(bind);}bind(spec);
 await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(spec));await prepareEditorSurface(page);
 await page.locator('#docview text.lbl[data-dv-edge="0"]').click();await page.locator('#editor-tab-inspect').click();
 const guide=page.locator('#guide'),source=page.locator('#src');await expect(guide.getByLabel('rate source',{exact:true})).toHaveValue('cloudwatch');
 const edited={...query,metric:'Success',dimensions:{RuleName:'camera_message_camera_stats_$env',ActionType:'SQS'}};
 await openMetricsFold(guide,'Signal rate');const before=await source.inputValue(),field=guide.getByLabel('rate query',{exact:true});await field.fill(JSON.stringify(edited));await field.press('Tab');
 await expect.poll(async()=>JSON.parse(await source.inputValue()).page.sections[0].diagram.edges[0].telemetry.signals.rate.cloudwatch).toEqual(edited);
 const after=await source.inputValue();await page.locator('#undo-builder').click();await expect(source).toHaveValue(before);await page.locator('#redo-builder').click();await expect(source).toHaveValue(after);
 await page.locator('#status-board-settings').click();await expect(guide.getByLabel('Grafana CloudWatch UID',{exact:true})).toHaveValue('cw-monitor');await expect(guide.getByLabel('stg CloudWatch account ID',{exact:true})).toHaveValue('646998985045');
 const input=path.join(server.root,'cloudwatch.spec.json'),output=path.join(server.root,'cloudwatch.html');await writeFile(input,after);execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),output],{stdio:'pipe'});
 await page.addInitScript(()=>{
  window.cloudwatchEmpty=false;window.cloudwatchCalls=[];
  window.claude={use:async()=>({listTools:async()=>[{server:'Grafana',tools:['query_cloudwatch']}],callTool:async(server,tool,input)=>{window.cloudwatchCalls.push({tool,input});return {payload:window.cloudwatchEmpty?{timestamps:[],values:[],statistics:{sum:0},hints:['No data']}:{timestamps:[Date.parse(input.end)-3600000],values:[0],statistics:{sum:0}}};}})};
  window.flowviewBooted=ctl=>window.cloudwatchController=ctl;
 });
 await page.goto(server.origin+'/cloudwatch.html');await page.waitForFunction(()=>!!window.cloudwatchController);
 const panel=page.locator('#docview .pt-live-status').first();await panel.getByRole('switch',{name:'Metrics overlay',exact:true}).click();
 for(const id of ['ingest->app','shared::api->shared::store'])await expect(page.locator('[data-metrics-card="'+id+'"]').first()).toContainText('0 events');
 for(const id of ['ingest','shared::api'])expect(await page.evaluate(id=>window.cloudwatchController.telemetry.snapshot().map[id]?.signals.rate?.value,id)).toBe(0);
 const calls=await page.evaluate(()=>window.cloudwatchCalls);expect(calls.every(c=>c.tool==='query_cloudwatch'&&c.input.accountId==='646998985045'&&c.input.period===3600&&Date.parse(c.input.end)-Date.parse(c.input.start)===86400000)).toBe(true);expect(calls.some(c=>c.input.dimensions.ActionType==='SQS')).toBe(true);
 await page.locator('#docview .board').first().screenshot({path:testInfo.outputPath('cloudwatch-zero.png')});
 await page.evaluate(()=>{window.cloudwatchEmpty=true;window.cloudwatchController.telemetry.retry();});
 await expect.poll(()=>page.evaluate(()=>Object.keys(window.cloudwatchController.telemetry.snapshot().map))).toEqual([]);
 for(const id of ['ingest->app','shared::api->shared::store']){const card=page.locator('[data-metrics-card="'+id+'"]').first();await expect(card).toContainText(/unobserved/i);await expect(card).not.toContainText('0 events');}
 await panel.getByRole('combobox',{name:'Env',exact:true}).selectOption('prd');await expect.poll(()=>page.evaluate(()=>window.cloudwatchCalls.at(-1).input.accountId)).toBe('333333333333');
 await page.locator('#docview .board').first().screenshot({path:testInfo.outputPath('cloudwatch-unobserved.png')});
});
