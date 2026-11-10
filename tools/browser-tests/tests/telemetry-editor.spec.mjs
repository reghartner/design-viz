/* #941 PR 1 of 2: desktop Workbench Inspect → Tracking → Metrics editor and the page telemetry block (#1236: Status board settings → Metrics).
   Node-level rows M1–M15 live in tests/telemetry-editor.test.js; this spec proves the real Workbench path.
| row | rule | fixture | structurally scoped assertion | plausible broken implementation it rejects |
|---|---|---|---|---|
| W1 | Desktop: select a connection label; once its Tracking fieldset is visible, exactly one Metrics sub-section is in it (immediate count) and it shows the connection unbound; choosing Metrics kind and typing New signal name/source/query/unit, then Enter, binds one raw signal; one Undo restores the exact source and one Redo the edit; a proof limit is added; Export project keeps the binding and declares flow.telemetry. | `raw`: two connections, page `tracking.jira`, a live-status panel; viewport 1440×1000 | `#guide fieldset.tracking-editor fieldset.metrics-editor` count is 1; the source's `edges[0]` equals the original plus the binding; Undo/Redo give exact text; the exported `edges[0]` equals the original plus binding and proof, `edges[1]` and `tracking` unchanged | controls missing or outside Tracking; UI-only state that never reaches the source; a kind change that writes a half binding; an export that drops telemetry |
| W2 | Status board settings (#1236; was Document settings → Tracking): once GitHub scope is visible, exactly one Metrics block is in its Metrics section (immediate count); Add template with name, kind, parameters and a first signal; one Undo/Redo; Metrics window; a connection uses the template through Signals from + Template parameter inputs; Export project keeps the page block and the carrier binding. | same `raw` | `details.board-section[data-board-section="metrics"] fieldset.metrics-settings` count is 1; `tracking.telemetry` equals `{templates:{kafka-topic}}`, then gains `window`; `edges[1].telemetry` equals `{use,topic,group}`; the export keeps both and `edges[0]` unchanged | a settings block that is not wired to `tracking.telemetry`; a template picker not fed by page templates; settings lost on export |
| P1 | Preview metrics layout toggle (placeholder edge cards): covered in telemetry-preview.spec.mjs. | n/a | n/a | n/a |
*/
import {test,expect,paste,prepareEditorSurface,openMetricsFold,openStatusBoard} from '../helpers/test.mjs';
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
  // The connection form has rendered: its Tracking fieldset predates #941 and is built in the same pass as Metrics.
  await expect(guide.getByRole('checkbox',{name:'Exists when tickets are complete',exact:true})).toBeVisible();
  expect(await page.locator('#guide fieldset.tracking-editor fieldset.metrics-editor').count(),'Metrics sub-section rendered in Inspect → Tracking').toBe(1);
  const metrics=guide.locator('fieldset.tracking-editor fieldset.metrics-editor');
  await expect(metrics).toBeVisible();await expect(metrics).toContainText('Unbound: no metrics overlay and no proof verdict');
  const before=await source.inputValue();
  await guide.getByLabel('Metrics kind',{exact:true}).selectOption('call');await expect(source).toHaveValue(before);
  await openMetricsFold(metrics,'New signal');await guide.getByLabel('New signal name',{exact:true}).fill('rate');
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
  await openMetricsFold(metrics,'Signal rate');const min=guide.getByLabel('rate min',{exact:true});await min.fill('10');await min.press('Enter');
  await expect.poll(async()=>edgeAt(await source.inputValue(),0).telemetry.proof).toEqual({rate:{min:10}});
  await label.click();await metrics.screenshot({path:testInfo.outputPath('metrics-editor.png')});
  const saved=await exportProject(page);
  expect(saved.page.sections[0].diagram.edges[0]).toEqual({...raw.page.sections[0].diagram.edges[0],telemetry:{...bound,proof:{rate:{min:10}}}});
  expect(saved.page.sections[0].diagram.edges[1]).toEqual(raw.page.sections[0].diagram.edges[1]);
  expect(saved.page.tracking).toEqual(raw.page.tracking);
  expect(saved.page.flowview.features).toContain('flow.telemetry');
});

test('desktop relative metrics windows preserve aliases and exact Undo Redo source',async({page,server},testInfo)=>{
  await open(page,server);
  const source=page.locator('#src'),guide=page.locator('#guide');
  const settings=async()=>{await page.locator('#editor-tab-inspect').click();await openStatusBoard(page,'jira','metrics');};
  for(const entered of [' -6h ',' now-6h ']){
    await settings();const before=await source.inputValue(),input=guide.getByLabel('Metrics window',{exact:true});
    await input.fill(entered);await input.press('Enter');
    await expect.poll(async()=>JSON.parse(await source.inputValue()).page.tracking.telemetry?.window).toBe(entered.trim());
    const changed=await source.inputValue();
    await page.locator('#undo-builder').click();await expect(source).toHaveValue(before);
    await page.locator('#redo-builder').click();await expect(source).toHaveValue(changed);
    await settings();await expect(guide.getByLabel('Metrics window',{exact:true})).toHaveValue(entered.trim());
  }
  const beforeInvalid=await source.inputValue();
  for(const invalid of ['+6h','now--6h','-0h']){
    const input=guide.getByLabel('Metrics window',{exact:true});await input.fill(invalid);await input.press('Enter');
    await expect(guide).toContainText('Use a duration such as');await expect(source).toHaveValue(beforeInvalid);
  }
  await settings();await guide.locator('fieldset.metrics-settings').screenshot({path:testInfo.outputPath('relative-metrics-window-desktop.png')});
});

test('W2 Status board settings templates round-trip through Undo Redo, a connection template binding and Export project',async({page,server},testInfo)=>{
  await open(page,server);
  const source=page.locator('#src'),guide=page.locator('#guide');
  const settings=async()=>{await page.locator('#editor-tab-inspect').click();await openStatusBoard(page,'jira','metrics');};
  await settings();
  // Status board settings has rendered: GitHub scope (Jira section) is built in the same pass as the Metrics block.
  await expect(guide.getByLabel('GitHub scope',{exact:true})).toBeVisible();
  expect(await page.locator('#guide details.board-section[data-board-section="metrics"] fieldset.metrics-settings').count(),'Status board settings → Metrics block rendered').toBe(1);
  const block=guide.locator('details.board-section[data-board-section="metrics"] fieldset.metrics-settings');await expect(block).toBeVisible();
  const before=await source.inputValue();
  await openMetricsFold(block,'New template');await guide.getByLabel('New template name',{exact:true}).fill('kafka-topic');
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
  await openMetricsFold(block,'Template kafka-topic');await expect(block.getByRole('button',{name:'Remove template kafka-topic',exact:true})).toBeVisible();
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
