import {writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect,paste,prepareEditorSurface} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
import {cueSpec} from '../helpers/telemetry-cards.mjs';

const logs={logGroups:['arn:aws:logs:us-east-1:${iotAccount}:log-group:AWSIotLogsV2'],query:'filter eventType = "Publish-In" and status = "Failure" and reason = "AUTHORIZATION_FAILURE" and topicName = "$aws/rules/camera_message_power_state" | stats count() as n',region:'us-east-1',valueField:'n'};
test('desktop Logs editor variables round-trip, imported cards and Proof show count/scope, environments clear unreadable evidence',async({page,server},testInfo)=>{
 await page.setViewportSize({width:1800,height:1200});
 const spec=cueSpec();spec.page.tracking.telemetry={window:'24h',environment:'stg',grafana:{cloudwatch:'cw-monitor'},environments:{qa:{variables:{}},stg:{variables:{iotAccount:'646998985045',queueAccount:'551960222585'}},prd:{variables:{iotAccount:'139648982912',queueAccount:'PRD_TEST_QUEUE'}}}};
 function bind(v){if(!v||typeof v!=='object')return;if(v.telemetry?.signals){v.telemetry.kind='call';v.telemetry.signals={rate:{cloudwatchLogs:logs,unit:'refused publishes',scope:'topic $aws/rules/camera_message_power_state · account ${iotAccount}'},sent:{cloudwatch:{namespace:'AWS/SQS',metric:'NumberOfMessagesSent',dimensions:{QueueName:'camera_$env'},statistic:'Sum',region:'us-east-1',accountId:'${queueAccount}'}}};v.telemetry.proof={rate:{max:0}};}Object.values(v).forEach(bind);}bind(spec);
 await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(spec));await prepareEditorSurface(page);
 await page.locator('#docview text.lbl[data-dv-edge="0"]').click();await page.locator('#editor-tab-inspect').click();
 const guide=page.locator('#guide'),source=page.locator('#src');await expect(guide.getByLabel('rate source',{exact:true})).toHaveValue('cloudwatchLogs');
 const edited={...logs,query:logs.query+' '};
 let before=await source.inputValue();const field=guide.getByLabel('rate query',{exact:true});await field.fill(JSON.stringify(edited));await field.press('Tab');
 await expect.poll(async()=>JSON.parse(await source.inputValue()).page.sections[0].diagram.edges[0].telemetry.signals.rate.cloudwatchLogs).toEqual(edited);
 let after=await source.inputValue();await page.locator('#undo-builder').click();await expect(source).toHaveValue(before);await page.locator('#redo-builder').click();await expect(source).toHaveValue(after);
 await page.locator('#document-settings').click();const variables=guide.getByLabel('stg metrics variables',{exact:true});await expect(variables).toHaveValue(JSON.stringify(spec.page.tracking.telemetry.environments.stg.variables));
 before=await source.inputValue();await variables.fill(JSON.stringify({...spec.page.tracking.telemetry.environments.stg.variables,topic:'camera_message_power_state'}));await variables.press('Tab');
 await expect.poll(async()=>JSON.parse(await source.inputValue()).page.tracking.telemetry.environments.stg.variables.topic).toBe('camera_message_power_state');
 after=await source.inputValue();await page.locator('#undo-builder').click();await expect(source).toHaveValue(before);await page.locator('#redo-builder').click();await expect(source).toHaveValue(after);
 const input=path.join(server.root,'logs.spec.json'),output=path.join(server.root,'logs.html');await writeFile(input,after);execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),output],{stdio:'pipe'});
 await page.addInitScript(()=>{
  window.logsMode='count';window.logsCalls=[];
  window.claude={use:async()=>({listTools:async()=>[{server:'Grafana',tools:['query_cloudwatch_logs','query_cloudwatch']}],callTool:async(server,tool,input)=>{window.logsCalls.push({tool,input});if(tool==='query_cloudwatch')return {payload:{timestamps:[1793827860000],values:[5],statistics:{count:1,sum:999}}};if(window.logsMode==='error')throw {code:'tool_error',message:'Log group permission denied'};return {payload:{structuredContent:{logs:window.logsMode==='zero'?[]:[{n:'15'}],totalFound:window.logsMode==='zero'?0:999,status:'Complete'}}};}})};
  window.flowviewBooted=ctl=>window.logsController=ctl;
 });
 await page.goto(server.origin+'/logs.html');await page.waitForFunction(()=>!!window.logsController);
 const panel=page.locator('#docview .pt-live-status').first();await panel.getByRole('button',{name:'Metrics',exact:true}).click();
 for(const id of ['ingest->app','shared::api->shared::store']){const card=page.locator('[data-metrics-card="'+id+'"]').first();await expect(card).toContainText('15 refused publishes in 24h');await expect(card).toContainText('topic $aws/rules/camera_message_power_state · account 646998985045');}
 for(const id of ['ingest','shared::api'])expect(await page.evaluate(id=>window.logsController.telemetry.snapshot().map[id]?.signals.rate?.value,id)).toBe(15);
 expect(await page.evaluate(()=>window.logsCalls.filter(c=>c.tool==='query_cloudwatch').every(c=>c.input.accountId==='551960222585'))).toBe(true);
 await expect(panel.locator('.dv-live-proof-table')).toContainText('topic $aws/rules/camera_message_power_state · account 646998985045');
 const dimensions=await page.locator('.dv-metrics-card').evaluateAll(cards=>cards.map(card=>{const r=card.querySelector('rect').getBBox();return [...card.querySelectorAll('text')].every(t=>{const b=t.getBBox();return b.x>=0&&b.y>=0&&b.x+b.width<=r.width+1&&b.y+b.height<=r.height+1;});}));expect(dimensions.every(Boolean)).toBe(true);
 await page.locator('#docview .board').first().screenshot({path:testInfo.outputPath('cloudwatch-logs-count-scope.png')});
 await panel.getByRole('combobox',{name:'Environment',exact:true}).selectOption('prd');await expect(page.locator('[data-metrics-card="shared::api->shared::store"]').first()).toContainText('account 139648982912');await expect.poll(()=>page.evaluate(()=>window.logsCalls.filter(c=>c.tool==='query_cloudwatch').at(-1).input.accountId)).toBe('PRD_TEST_QUEUE');
 await page.evaluate(()=>{window.logsMode='zero';window.logsController.telemetry.retry();});await expect(page.locator('[data-metrics-card="ingest->app"]').first()).toContainText('0 refused publishes in 24h');
 await page.evaluate(()=>{window.logsMode='error';window.logsController.telemetry.retry();});await expect(page.locator('[data-metrics-card="ingest->app"]').first()).toContainText('unobserved');await expect(page.locator('[data-metrics-card="ingest->app"]').first()).not.toContainText('0 refused publishes');await expect(panel).toContainText('permission denied');
 const count=await page.evaluate(()=>window.logsCalls.length);await panel.getByRole('combobox',{name:'Environment',exact:true}).selectOption('qa');await expect(panel).toContainText('iotAccount');expect(await page.evaluate(()=>window.logsCalls.length)).toBe(count);
});
