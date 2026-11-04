/* #941 PR 1 of 2: desktop Workbench Inspect → Tracking → Metrics editor and Document settings telemetry block.
   Node-level rows M1–M15 live in tests/telemetry-editor.test.js; this spec proves the real Workbench path.
| row | rule |
|---|---|
| W1 | Desktop: select a connection label, Inspect → Tracking → Metrics shows it unbound; choosing Metrics kind and typing New signal name/source/query/unit, then Enter, binds one raw signal; one Undo restores the exact source and one Redo the edit; a proof limit is added; Export project keeps the binding and declares flow.telemetry. |
| W2 | Document settings → Tracking → Metrics: Add template with name, kind, parameters and a first signal; one Undo/Redo; Metrics window; a connection uses the template through Signals from + Template parameter inputs; Export project keeps the page block and the carrier binding. |
| P1 | Preview metrics layout toggle (placeholder edge cards): excluded — orchestrator ruling: PR 2. |
*/
import {test,expect,paste,prepareEditorSurface} from '../helpers/test.mjs';
import {projectFiles,useProjectDownloads} from '../helpers/project-export.mjs';

const PROM='sum(rate(push_sent_total{app="notify"}[5m]))*3600';
const LAG='max(kafka_consumergroup_lag{topic="$topic",group="$group"})';
const raw={page:{title:'Doorbell delivery',tracking:{jira:{site:'https://acme.atlassian.net'}},sections:[{heading:'From event to notification',diagram:{
  nodes:{ingest:{title:'Ingest',tickets:['BE-66']},notify:{title:'Notify'},app:{title:'App'}},rows:[['ingest','notify','app']],
  edges:[{from:'ingest',to:'notify',label:'route',tickets:['BE-67']},{from:'notify',to:'app',label:'push'}],
  panels:[{id:'status',type:'live-status',title:'Delivery status'}]}}]}};
const edgeAt=(text,i)=>JSON.parse(text).page.sections[0].diagram.edges[i];

async function open(page,server){
  await page.setViewportSize({width:1440,height:1000});await useProjectDownloads({page});
  await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(raw));await prepareEditorSurface(page);
}
async function exportProject(page){
  const pending=page.waitForEvent('download');await page.locator('#workspace-export-trigger').click();await page.locator('#file-save').click();
  const files=await projectFiles(await pending);return JSON.parse(files[Object.keys(files).find(k=>k.endsWith('.spec.json'))]);
}

test('W1 desktop connection gets a raw metrics signal with one Undo Redo, a proof limit and Export project',async({page,server},testInfo)=>{
  await open(page,server);
  const source=page.locator('#src'),guide=page.locator('#guide'),label=page.locator('#docview text.lbl[data-dv-edge="0"]');
  await label.click();await page.locator('#editor-tab-inspect').click();
  const metrics=guide.locator('fieldset.tracking-editor fieldset.metrics-editor');
  await expect(metrics).toBeVisible();await expect(metrics).toContainText('Unbound: no metrics overlay and no proof verdict');
  const before=await source.inputValue();
  await guide.getByLabel('Metrics kind',{exact:true}).selectOption('call');await expect(source).toHaveValue(before);
  await guide.getByLabel('New signal name',{exact:true}).fill('rate');
  await guide.getByLabel('New signal source',{exact:true}).selectOption('grafana');
  await guide.getByLabel('New signal query',{exact:true}).fill(PROM);
  const unit=guide.getByLabel('New signal unit',{exact:true});await unit.fill('req/h');await unit.press('Enter');
  const bound={kind:'call',signals:{rate:{grafana:PROM,unit:'req/h'}}};
  await expect.poll(async()=>edgeAt(await source.inputValue(),0).telemetry).toEqual(bound);
  const changed=await source.inputValue();
  expect(edgeAt(changed,0)).toEqual({...raw.page.sections[0].diagram.edges[0],telemetry:bound});
  await page.locator('#undo-builder').click();await expect(source).toHaveValue(before);
  await page.locator('#redo-builder').click();await expect(source).toHaveValue(changed);
  await label.click();await expect(metrics).not.toContainText('Unbound');
  await expect(guide.getByLabel('rate query',{exact:true})).toHaveValue(PROM);
  const min=guide.getByLabel('rate min',{exact:true});await min.fill('10');await min.press('Enter');
  await expect.poll(async()=>edgeAt(await source.inputValue(),0).telemetry.proof).toEqual({rate:{min:10}});
  await label.click();await metrics.screenshot({path:testInfo.outputPath('metrics-editor.png')});
  const saved=await exportProject(page);
  expect(saved.page.sections[0].diagram.edges[0]).toEqual({...raw.page.sections[0].diagram.edges[0],telemetry:{...bound,proof:{rate:{min:10}}}});
  expect(saved.page.sections[0].diagram.edges[1]).toEqual(raw.page.sections[0].diagram.edges[1]);
  expect(saved.page.tracking).toEqual(raw.page.tracking);
  expect(saved.page.flowview.features).toContain('flow.telemetry');
});

test('W2 Document settings templates round-trip through Undo Redo, a connection template binding and Export project',async({page,server},testInfo)=>{
  await open(page,server);
  const source=page.locator('#src'),guide=page.locator('#guide');
  const settings=async()=>{await page.locator('#editor-tab-inspect').click();await page.locator('#document-settings').click();};
  await settings();
  const block=guide.locator('fieldset.tracking-editor fieldset.metrics-settings');await expect(block).toBeVisible();
  const before=await source.inputValue();
  await guide.getByLabel('New template name',{exact:true}).fill('kafka-topic');
  await guide.getByLabel('New template kind',{exact:true}).selectOption('queue');
  await guide.getByLabel('New template parameters',{exact:true}).fill('topic, group');
  await guide.getByLabel('New template signal name',{exact:true}).fill('lag');
  await guide.getByLabel('New template signal source',{exact:true}).selectOption('grafana');
  await guide.getByLabel('New template signal query',{exact:true}).fill(LAG);
  await guide.getByLabel('New template signal unit',{exact:true}).fill('msgs');
  await guide.getByRole('button',{name:'Add template',exact:true}).click();
  const template={kind:'queue',params:['topic','group'],signals:{lag:{grafana:LAG,unit:'msgs'}}};
  await expect.poll(async()=>JSON.parse(await source.inputValue()).page.tracking.telemetry).toEqual({templates:{'kafka-topic':template}});
  const added=await source.inputValue();
  await page.locator('#undo-builder').click();await expect(source).toHaveValue(before);
  await page.locator('#redo-builder').click();await expect(source).toHaveValue(added);
  await settings();
  const windowInput=guide.getByLabel('Metrics window',{exact:true});await windowInput.fill('6h');await windowInput.press('Enter');
  await expect.poll(async()=>JSON.parse(await source.inputValue()).page.tracking.telemetry.window).toBe('6h');
  await expect(block.getByRole('button',{name:'Remove template kafka-topic',exact:true})).toBeVisible();
  await block.screenshot({path:testInfo.outputPath('metrics-settings.png')});
  const label=page.locator('#docview text.lbl[data-dv-edge="1"]');await label.click();
  await guide.getByLabel('Signals from',{exact:true}).selectOption('kafka-topic');
  await expect.poll(async()=>edgeAt(await source.inputValue(),1).telemetry).toEqual({use:'kafka-topic'});
  for(const [name,value] of [['topic','device-events'],['group','notify']]){
    await label.click();const input=guide.getByLabel('Template parameter '+name,{exact:true});await input.fill(value);await input.press('Enter');
    await expect.poll(async()=>edgeAt(await source.inputValue(),1).telemetry[name]).toBe(value);
  }
  const saved=await exportProject(page);
  expect(saved.page.tracking).toEqual({...raw.page.tracking,telemetry:{templates:{'kafka-topic':template},window:'6h'}});
  expect(saved.page.sections[0].diagram.edges[1]).toEqual({...raw.page.sections[0].diagram.edges[1],telemetry:{use:'kafka-topic',topic:'device-events',group:'notify'}});
  expect(saved.page.sections[0].diagram.edges[0]).toEqual(raw.page.sections[0].diagram.edges[0]);
  expect(saved.page.flowview.features).toContain('flow.telemetry');
});
