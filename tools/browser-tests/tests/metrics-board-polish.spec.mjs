/* #1240 desktop Workbench: metrics variables as rows, environment rename, signal role and window.
| row | rule | fixture | assertion | broken implementation it rejects |
|---|---|---|---|---|
| P1 | Status board settings → Metrics: typing team / core into New shared variable and clicking Add shared variable writes `tracking.telemetry.variables.team`; the stg row in Environments (Enter) writes `environments.stg.variables.team`. | board with page telemetry and environments qa, stg | source values; the new rows are listed | a JSON textarea only; a write in the wrong scope |
| P2 | Renaming environment stg to staging while it is the default renames the profile in place and updates `environment`; one Undo restores the source. | environment stg default | key order and environment after Enter; source after Undo | the default left on the old id; two Undo steps |
| P3 | A connection signal's role set to Error writes `role:"error"`; a template signal's window typed as 7d writes `templates.<t>.signals.<s>.window`. | connection with a grafana signal; template queue with signal lag | source values | no controls; edits written to the wrong binding |
Desktop only.
*/
import {test,expect,paste,prepareEditorSurface,openStatusBoard,openMetricsFold,boardSection} from '../helpers/test.mjs';
function board(){
  return {page:{title:'Board',tracking:{jira:{site:'https://acme.atlassian.net'},telemetry:{grafana:{prometheus:'prom'},environment:'stg',
    environments:{qa:{grafana:{prometheus:'qa-prom'}},stg:{grafana:{prometheus:'stg-prom'}}},
    templates:{queue:{kind:'queue',signals:{lag:{loki:'sum(count_over_time({app="x"}[5m]))',unit:'msgs'}}}}}},
    sections:[{heading:'Flow',diagram:{nodes:{api:{title:'API'},db:{title:'Store'}},rows:[['api','db']],
      edges:[{from:'api',to:'db',label:'write',telemetry:{kind:'call',signals:{rate:{grafana:'sum(rate(x[5m]))',unit:'req/h'}}}}],
      panels:[{id:'status',type:'live-status',title:'Epic status'}]}}]}};
}
async function open(page,server){
  await page.setViewportSize({width:1440,height:1000});
  await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(board(),null,2));await prepareEditorSurface(page);
  await page.locator('#editor-tab-inspect').click();
}
const telemetry=async src=>JSON.parse(await src.inputValue()).page.tracking.telemetry;
async function typeInto(field,text){await field.click();await field.press('ControlOrMeta+a');await field.press('Backspace');await field.pressSequentially(text);}

test('P1 desktop Add shared variable writes tracking.telemetry.variables; an environment row writes under that environment',async({page,server},info)=>{
  await open(page,server);await openStatusBoard(page,'metrics','environments');
  const guide=page.locator('#guide'),src=page.locator('#src'),metrics=boardSection(guide,'metrics'),environments=boardSection(guide,'environments');
  await typeInto(metrics.getByLabel('New shared variable name',{exact:true}),'team');
  await typeInto(metrics.getByLabel('New shared variable value',{exact:true}),'core');
  await metrics.getByRole('button',{name:'Add shared variable',exact:true}).click();
  await expect.poll(async()=>(await telemetry(src)).variables).toEqual({team:'core'});
  await expect(metrics.getByLabel('Shared variable 1 name',{exact:true})).toHaveValue('team');
  await typeInto(environments.getByLabel('New stg environment variable name',{exact:true}),'team');
  const value=environments.getByLabel('New stg environment variable value',{exact:true});await typeInto(value,'edge');await value.press('Enter');
  await expect.poll(async()=>(await telemetry(src)).environments.stg.variables).toEqual({team:'edge'});
  expect((await telemetry(src)).environments.qa.variables).toBeUndefined();
  await expect(environments.getByLabel('stg environment variable 1 value',{exact:true})).toHaveValue('edge');
  await page.screenshot({path:info.outputPath('metrics-variables-rows.png')});
});

test('P2 desktop rename environment stg to staging while it is the default; one Undo restores',async({page,server},info)=>{
  await open(page,server);await openStatusBoard(page,'environments');
  const guide=page.locator('#guide'),src=page.locator('#src'),environments=boardSection(guide,'environments'),before=await src.inputValue();
  const id=environments.getByLabel('stg environment id',{exact:true});await typeInto(id,'staging');await id.press('Enter');
  await expect.poll(async()=>Object.keys((await telemetry(src)).environments)).toEqual(['qa','staging']);
  const t=await telemetry(src);expect(t.environment).toBe('staging');expect(t.environments.staging).toEqual({grafana:{prometheus:'stg-prom'}});
  await expect(environments.getByLabel('staging environment id',{exact:true})).toHaveValue('staging');
  await page.screenshot({path:info.outputPath('environment-renamed.png')});
  await page.locator('#undo-builder').click();await expect(src).toHaveValue(before);
});

test('P3 desktop signal role Error on a connection; template signal window 7d',async({page,server},info)=>{
  await open(page,server);
  const guide=page.locator('#guide'),src=page.locator('#src');
  await page.locator('#docview text.lbl[data-dv-edge="0"]').click();
  await openMetricsFold(guide,'Signal rate');
  await guide.getByLabel('rate role',{exact:true}).selectOption('error');
  await expect.poll(async()=>JSON.parse(await src.inputValue()).page.sections[0].diagram.edges[0].telemetry.signals.rate.role).toBe('error');
  await page.screenshot({path:info.outputPath('signal-role.png')});
  await openStatusBoard(page,'metrics');
  const metrics=boardSection(guide,'metrics');await openMetricsFold(metrics,'Template queue');await openMetricsFold(metrics,'Signal lag');
  const window=metrics.getByLabel('queue lag window',{exact:true});await typeInto(window,'7d');await window.press('Enter');
  await expect.poll(async()=>(await telemetry(src)).templates.queue.signals.lag.window).toBe('7d');
});
