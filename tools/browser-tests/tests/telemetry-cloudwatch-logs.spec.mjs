import {writeFile,readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect,paste,prepareEditorSurface} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
import {cueSpec,importedDetailSpec} from '../helpers/telemetry-cards.mjs';

const logs={logGroups:['arn:aws:logs:us-east-1:${iotAccount}:log-group:AWSIotLogsV2'],query:'filter eventType = "Publish-In" and status = "Failure" and reason = "AUTHORIZATION_FAILURE" and topicName = "$aws/rules/camera_message_power_state" | stats count() as n',region:'us-east-1',valueField:'n'};
logs.breakdown={query:'filter deviceType = "${deviceFilter}" | '+logs.query.replace('stats count() as n','stats count() as n, latest(reason) as sampleReason by clientId | sort n desc | limit 20'),labelField:'clientId',valueField:'n',title:'Devices',labelTitle:'Client ID',valueTitle:'Failures',columns:[{field:'sampleReason',label:'Latest reason'}],limit:20};
test('desktop Logs editor variables round-trip, imported cards and Proof show count/scope, environments clear unreadable evidence',async({page,server},testInfo)=>{
 await page.setViewportSize({width:1800,height:1200});
 const spec=cueSpec();spec.page.tracking.telemetry={window:'24h',environment:'stg',variables:{aws:'must-not-replace-topic-prefix'},grafana:{cloudwatch:'cw-monitor'},environments:{qa:{variables:{}},stg:{variables:{iotAccount:'646998985045',queueAccount:'551960222585',deviceFilter:'camera'}},prd:{variables:{iotAccount:'139648982912',queueAccount:'PRD_TEST_QUEUE',deviceFilter:'camera'}},limited:{variables:{iotAccount:'139648982912',queueAccount:'PRD_TEST_QUEUE'}}}};
 function bind(v){if(!v||typeof v!=='object')return;if(v.telemetry?.signals){v.telemetry.kind='call';v.telemetry.signals={rate:{cloudwatchLogs:logs,unit:'refused publishes',scope:'topic $aws/rules/camera_message_power_state · account ${iotAccount}'},sent:{cloudwatch:{namespace:'AWS/SQS',metric:'NumberOfMessagesSent',dimensions:{QueueName:'camera_$env'},statistic:'Sum',region:'us-east-1',accountId:'${queueAccount}'}}};v.telemetry.proof={rate:{max:0}};}Object.values(v).forEach(bind);}bind(spec);
 await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(spec));await prepareEditorSurface(page);
 await page.locator('#docview text.lbl[data-dv-edge="0"]').click();await page.locator('#editor-tab-inspect').click();
 const guide=page.locator('#guide'),source=page.locator('#src');await expect(guide.getByLabel('rate source',{exact:true})).toHaveValue('cloudwatchLogs');
 const edited={...logs,query:logs.query+' ',breakdown:{...logs.breakdown,labelField:'deviceId',labelTitle:'Device',query:'filter deviceType = "${deviceFilter}" | '+logs.query.replace('stats count() as n','parse @message /device_id=(?<deviceId>[^ ]+)/ | stats count() as n, latest(reason) as sampleReason by deviceId | sort n desc | limit 20')}};
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
  window.claude={use:async()=>({listTools:async()=>[{server:'Grafana',tools:['query_cloudwatch_logs','query_cloudwatch']}],callTool:async(server,tool,input)=>{window.logsCalls.push({tool,input});if(tool==='query_cloudwatch')return {payload:{timestamps:[Date.parse(input.end)-3600000],values:[5],statistics:{count:1,sum:999}}};if(window.logsMode==='error')throw {code:'tool_error',message:'Log group permission denied'};if(input.limit===1000)return {payload:{status:'Complete',logs:[{flowview_time:new Date(Date.parse(input.end)-3600000).toISOString(),n:'15'}],totalFound:1}};if(input.queryString.includes(' by ')){if(window.logsMode==='details-error')throw {code:'tool_error',message:'Details permission denied'};const rows=window.logsMode==='zero'?[]:window.logsMode==='many'?Array.from({length:35},(_,i)=>({clientId:'cam-'+i,deviceId:'cam-'+i,n:String(i),sampleReason:'x'.repeat(900)})):[{clientId:'cam-123',deviceId:'cam-123',n:'12',sampleReason:'AUTHORIZATION_FAILURE'},{clientId:'cam-456',deviceId:'cam-456',n:'2',sampleReason:'<img src=x onerror=alert(1)>'}];return {payload:{status:'Complete',logs:rows,totalFound:99999}};}return {payload:{structuredContent:{logs:window.logsMode==='zero'?[]:[{n:'15'}],totalFound:window.logsMode==='zero'?0:999,status:'Complete'}}};}})};
  window.flowviewBooted=ctl=>window.logsController=ctl;
 });
 await page.goto(server.origin+'/logs.html');await page.waitForFunction(()=>!!window.logsController);
 const panel=page.locator('#docview .pt-live-status').first();await panel.getByRole('switch',{name:'Metrics overlay',exact:true}).click();
 for(const id of ['ingest->app','shared::api->shared::store']){const card=page.locator('[data-metrics-card="'+id+'"]').first();await expect(card.locator('.dv-metrics-card-value').first()).toHaveText('15 refused publishes');await expect(card).toContainText('24h window');await expect(card).toContainText('topic');await expect(card).toContainText('This queue');await expect(card).not.toContainText('646998985045');expect(await card.locator('rect').first().evaluate(rect=>rect.getBBox().width)).toBeLessThanOrEqual(240);}
 for(const id of ['ingest','shared::api'])expect(await page.evaluate(id=>window.logsController.telemetry.snapshot().map[id]?.signals.rate?.value,id)).toBe(15);
 for(const id of ['ingest','shared::api']){await page.locator('g.node[data-dv-node="'+id+'"]').click();const evidence=page.locator('.dv-live-production');await expect(evidence.locator('.dv-live-production-kpi').first()).toContainText('topic $aws/rules/camera_message_power_state · account 646998985045');await expect(evidence).toContainText('account 551960222585');if(id==='shared::api')await evidence.screenshot({path:'/tmp/named-metric-values-logs-imported-scope.png'});await page.keyboard.press('Escape');}
 expect(await page.evaluate(()=>window.logsCalls.filter(c=>c.tool==='query_cloudwatch').every(c=>c.input.accountId==='551960222585'))).toBe(true);
 expect(await page.evaluate(()=>window.logsCalls.filter(c=>c.tool==='query_cloudwatch_logs').every(c=>c.input.queryString.includes('$aws/rules/camera_message_power_state')&&!c.input.queryString.includes('must-not-replace-topic-prefix')))).toBe(true);
 await expect(panel.locator('.dv-live-proof-table')).toContainText('topic $aws/rules/camera_message_power_state · account 646998985045');
 const dimensions=await page.locator('.dv-metrics-card').evaluateAll(cards=>cards.map(card=>{const r=card.querySelector('rect').getBBox();return [...card.querySelectorAll('text')].every(t=>{const b=t.getBBox();return b.x>=0&&b.y>=0&&b.x+b.width<=r.width+1&&b.y+b.height<=r.height+1;});}));expect(dimensions.every(Boolean)).toBe(true);
 const groups=panel.locator('.dv-live-log-group');await expect(groups).toHaveCount(5);
 for(const id of ['ingest','ingest->app','shared::api','shared::api->shared::store']){expect(await panel.locator('[data-log-carrier="'+id+'"]').getAttribute('open')).toBe(null);}
 const detail=panel.locator('[data-log-carrier="ingest->app"]');
 const geometry=()=>page.locator('#docview g.node').evaluateAll(nodes=>nodes.map(n=>({id:n.getAttribute('data-dv-node'),transform:n.getAttribute('transform')})));
 const beforeGeometry=await geometry();await detail.locator('summary').click();await expect(detail.locator('table')).toBeVisible();await expect(detail).toContainText('Total: 15');await expect(detail.locator('table')).toContainText('cam-123');await expect(detail.locator('table')).toContainText('12');await expect(detail.locator('table')).toContainText('<img src=x onerror=alert(1)>');await expect(detail.locator('img')).toHaveCount(0);await expect(detail).toContainText('Showing 2 of 2 returned rows');await expect(detail).not.toContainText('99999');
 expect(await geometry()).toEqual(beforeGeometry);expect(await detail.locator('th').evaluateAll(cells=>cells.every(cell=>cell.getBoundingClientRect().width>=85))).toBe(true);
 await detail.locator('summary').focus();await page.evaluate(()=>window.logsController.telemetry.retry());await expect.poll(()=>page.evaluate(()=>window.logsController.telemetry.status().busy)).toBe(false);await expect(detail.locator('summary')).toBeFocused();expect(await detail.getAttribute('open')).not.toBe(null);
 expect(await page.evaluate(()=>window.logsCalls.some(c=>c.input.queryString?.includes('parse @message /device_id=(?<deviceId>[^ ]+)/')))).toBe(true);
 await detail.screenshot({path:testInfo.outputPath('cloudwatch-log-device-details.png')});
 await page.evaluate(()=>{window.logsMode='many';window.logsController.telemetry.retry();});await expect(detail).toContainText('Showing 20 of 35 returned rows');await expect(detail.locator('tbody tr')).toHaveCount(20);await expect(detail).toContainText('Long text shortened');expect(await detail.locator('.dv-live-log-scroll').evaluate(el=>el.clientHeight<=280&&el.scrollHeight>el.clientHeight)).toBe(true);expect(await geometry()).toEqual(beforeGeometry);
 await page.evaluate(()=>{window.logsMode='details-error';window.logsController.telemetry.retry();});await expect(detail).toContainText('Log details unavailable: Details permission denied');await expect(detail.locator('table')).toHaveCount(0);await expect(page.locator('[data-metrics-card="ingest->app"]').first()).toContainText('15 refused publishes');
 await page.evaluate(()=>{window.logsMode='count';window.logsController.telemetry.retry();});await expect(detail.locator('table')).toBeVisible();

 await panel.getByRole('combobox',{name:'Env',exact:true}).selectOption('prd');await expect(page.locator('[data-metrics-card="shared::api->shared::store"]').first()).toContainText('15 refused publishes');await expect(page.locator('[data-metrics-card="shared::api->shared::store"]').first()).not.toContainText('139648982912');await expect.poll(()=>page.evaluate(()=>window.logsCalls.filter(c=>c.tool==='query_cloudwatch').at(-1).input.accountId)).toBe('PRD_TEST_QUEUE');expect(await detail.getAttribute('open')).toBe(null);await detail.locator('summary').click();await expect(detail).toContainText('account 139648982912');
 await page.evaluate(()=>{window.logsMode='zero';window.logsController.telemetry.retry();});await expect(page.locator('[data-metrics-card="ingest->app"]').first()).toContainText('0 refused publishes');await expect(page.locator('[data-metrics-card="ingest->app"]').first()).toContainText('24h window');await expect(detail).toContainText('Query complete: no grouped rows returned.');await expect(detail.locator('table')).toHaveCount(0);
 await page.evaluate(()=>{window.logsMode='error';window.logsController.telemetry.retry();});await expect(page.locator('[data-metrics-card="ingest->app"]').first()).toContainText('unobserved');await expect(page.locator('[data-metrics-card="ingest->app"]').first()).not.toContainText('0 refused publishes');await expect(panel).toContainText('permission denied');
 await page.evaluate(()=>{window.logsMode='count';});const beforeLimited=await page.evaluate(()=>window.logsCalls.length);await panel.getByRole('combobox',{name:'Env',exact:true}).selectOption('limited');await expect(page.locator('[data-metrics-card="ingest->app"]').first()).toContainText('15 refused publishes');await detail.locator('summary').click();await expect(detail).toContainText('Set telemetry variable ${deviceFilter}');await expect(detail.locator('table')).toHaveCount(0);expect(await page.evaluate(n=>window.logsCalls.slice(n).filter(c=>c.tool==='query_cloudwatch_logs').every(c=>!c.input.queryString.includes(' by deviceId')&&!c.input.queryString.includes(' by clientId')),beforeLimited)).toBe(true);
 const count=await page.evaluate(()=>window.logsCalls.length);await panel.getByRole('combobox',{name:'Env',exact:true}).selectOption('qa');await expect(panel).toContainText('iotAccount');expect(await page.evaluate(()=>window.logsCalls.length)).toBe(count);await panel.getByRole('switch',{name:'Metrics overlay',exact:true}).click();await expect(groups).toHaveCount(0);
});


test('native grouped evidence follows loaded imported details and stays isolated across sibling mounts and destroy',async({page,server})=>{
 await page.setViewportSize({width:1800,height:1200});
 await writeFile(path.join(server.root,'log-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
 await writeFile(path.join(server.root,'log-native.html'),'<div id="a"></div><div id="b"></div><script type="module">import {mountNativeViewer} from "./log-native.js";window.mount=mountNativeViewer;</script>');
 const binding={kind:'call',signals:{refused:{cloudwatchLogs:logs,unit:'refused publishes',scope:'account ${iotAccount}'}}};
 const spec={page:{title:'Native logs',
  tracking:{telemetry:{environment:'stg',environments:{stg:{variables:{iotAccount:'STG_FIXTURE',deviceFilter:'camera'}},prd:{variables:{iotAccount:'PRD_FIXTURE',deviceFilter:'camera'}}}}},
  sections:[{id:'root',diagram:{nodes:{local:{title:'Root device',telemetry:binding,detail:{spec:'details',revision:'r1',section:'selected'}}},rows:[['local']],panels:[{type:'live-status',id:'status'}]}}]}};
 const detail=importedDetailSpec();function bind(v){if(!v||typeof v!=='object')return;if(v.telemetry?.signals)v.telemetry=structuredClone(binding);Object.values(v).forEach(bind);}bind(detail);
 await page.goto(server.origin+'/log-native.html');await page.waitForFunction(()=>!!window.mount);
 await page.evaluate(({spec,detail})=>{
  window.nativeCalls=[];window.late=[];window.holdNative=false;
  function options(owner){return {loadDetail:()=>Promise.resolve(structuredClone(detail)),telemetry:{provider:(bindings,signal)=>{
   window.nativeCalls.push({owner,bindings:structuredClone(bindings),signal});
   const result=Object.fromEntries(bindings.map(b=>[b.id,{signals:{refused:{value:15,breakdown:{status:'complete',limit:20,returnedRows:2,range:{from:'2026-11-05T00:00:00Z',to:'2026-11-06T00:00:00Z'},rows:[{label:owner+'-cam1',value:12,cells:['latest reason']},{label:owner+'-cam2',value:2,cells:['<script>bad()</script>']}]}}}}]));
   return window.holdNative&&owner==='A'?new Promise(resolve=>window.late.push(()=>resolve(result))):Promise.resolve(result);
  }}};}
  window.a=window.mount(document.querySelector('#a'),spec,options('A'));window.b=window.mount(document.querySelector('#b'),spec,options('B'));
  window.a.controller.telemetry.setEnabled(true);window.b.controller.telemetry.setEnabled(true);
  // #1136: this board has no ticket references, so it opens on Trace with no switch; its log details are in the Jira view, which only the controller can still open.
  window.a.controller.liveStatus.setStatusMode('jira');window.b.controller.liveStatus.setStatusMode('jira');
 },{spec,detail});
 const a=page.locator('#a'),b=page.locator('#b');await expect(a.locator('[data-log-carrier="local"]')).toHaveCount(1);await expect(b.locator('[data-log-carrier="local"]')).toHaveCount(1);
 await b.locator('[data-log-carrier="local"] summary').click();await expect(b.locator('.dv-live-log-table')).toContainText('B-cam1');
 await a.getByRole('button',{name:'Explore Root device',exact:true}).click();const preview=a.locator('[data-dv-detail-preview]:visible');await expect(preview).toHaveCount(1);
 // Loaded bindings join the existing refresh loop; request its next cycle now.
 await page.evaluate(()=>window.a.controller.telemetry.retry());
 const imported=preview.locator('[data-log-carrier="shared::api"]');await expect(imported).toHaveCount(1);await imported.locator('summary').click();await expect(imported.locator('table')).toContainText('A-cam1');await expect(imported).toContainText('account STG_FIXTURE');
 await expect(preview.locator('[data-log-carrier="shared::api->shared::store"]')).toHaveCount(1);
 expect(await page.evaluate(()=>window.nativeCalls.filter(x=>x.owner==='A').at(-1).bindings.filter(x=>x.id.startsWith('shared::')).every(x=>x.signals.refused.query.logGroups[0].includes('STG_FIXTURE')))).toBe(true);
 await page.evaluate(()=>window.a.controller.telemetry.setEnvironment('prd'));await expect(imported).toContainText('account PRD_FIXTURE');expect(await imported.getAttribute('open')).toBe(null);await expect(b.locator('.dv-live-log-table')).toContainText('B-cam1');await expect(b.locator('[data-log-carrier="local"]')).toContainText('account STG_FIXTURE');
 await page.evaluate(()=>{window.holdNative=true;window.a.controller.telemetry.retry();});await expect.poll(()=>page.evaluate(()=>window.late.length)).toBeGreaterThan(0);
 await page.evaluate(()=>{window.a.destroy();window.late.forEach(resolve=>resolve());});await expect(a.locator('.dv-live-log-group')).toHaveCount(0);await expect(b.locator('.dv-live-log-table')).toContainText('B-cam1');
 await page.evaluate(()=>window.b.controller.telemetry.setEnabled(false));await expect(b.locator('.dv-live-log-group')).toHaveCount(0);
});
