/* #1404 part 2, desktop Workbench Status board settings → Metrics → "End-to-end metrics applied".
| row | rule | broken implementation it rejects |
|---|---|---|
| E1 | Checking the box writes `tracking.endToEndMetrics: true`; the saved spec opened in the standalone viewer rolls Proof up from metrics: the in-progress carrier with a met limit reads PROVEN (not live early), the headline reads "End to end proven" and the Proof table has no Since Done column; one Undo restores the source | no control; a value the viewer ignores; two Undo steps |
| E2 | The same saved spec without the box checked keeps today's Proof (IN PROGRESS · LIVE EARLY, Since Done column) | a viewer that turns end-to-end Proof on without the flag |
Desktop only. */
import {writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect,paste,prepareEditorSurface,openStatusBoard,boardSection} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
const LABEL='End-to-end metrics applied';
const SERVICE={kind:'service',signals:{rate:{grafana:'sum(rate(http_requests_total{app="api"}[5m]))*3600',unit:'req/h'}},proof:{rate:{min:1}}};
const CALL={kind:'call',signals:{rate:{grafana:'sum(rate(sent_total[5m]))*3600',unit:'req/h'}},proof:{rate:{min:1}}};
function board(){
  const d={nodes:{api:{title:'API',tickets:['DOOR-101'],telemetry:SERVICE},db:{title:'Store'}},rows:[['api','db']],edges:[{from:'api',to:'db',label:'write',telemetry:CALL}],
    panels:[{id:'status',type:'live-status',title:'Epic status'}]};
  return {page:{title:'Board',tracking:{jira:{site:'https://acme.atlassian.net'},telemetry:{window:'24h'}},sections:[{heading:'Flow',diagram:d}]}};
}
async function open(page,server){
  await page.setViewportSize({width:1440,height:1000});
  await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(board(),null,2));await prepareEditorSurface(page);
  await page.locator('#editor-tab-inspect').click();await openStatusBoard(page,'metrics');
  return boardSection(page.locator('#guide'),'metrics');
}
// The Workbench source saved as a spec and opened in the standalone viewer with fixed Jira and metrics providers.
async function viewer(page,server,source,name){
  const file=path.join(server.root,name+'.json'),out=path.join(server.root,name+'.html');await writeFile(file,source);
  execFileSync('python3',[path.join(repo,'tools/inject.py'),file,path.join(repo,'template/flowview.html'),out]);
  const view=await page.context().newPage();await view.setViewportSize({width:1440,height:900});
  await view.addInitScript(()=>{localStorage.setItem('dv_tour_v1','done');
    window.flowviewLiveStatus={provider:async()=>({'DOOR-101':{state:'active',title:'API work',updatedAt:new Date().toISOString()}})};
    window.flowviewTelemetry={provider:async()=>({api:{signals:{rate:{value:40}}},'api->db':{signals:{rate:{value:40}}}})};});
  await view.goto(server.origin+'/'+name+'.html');
  const panel=view.locator('#docview .pt-live-status');
  await expect(view.locator('#docview g.node[data-dv-node="api"]')).toHaveClass(/dv-live-active/);
  await panel.getByRole('switch',{name:'Metrics overlay',exact:true}).click();
  await expect(panel.locator('.dv-live-proof-row')).toHaveCount(2);
  return {view,panel};
}
const headings=panel=>panel.locator('.dv-live-proof-table thead th').allTextContents();

test('E1 desktop End-to-end metrics applied writes tracking.endToEndMetrics; the viewer rolls Proof up from metrics; one Undo removes it',async({page,server},info)=>{
  const metrics=await open(page,server),src=page.locator('#src'),before=await src.inputValue();
  const box=metrics.getByLabel(LABEL,{exact:true});
  await expect(box).not.toBeChecked();await expect(box).toHaveAttribute('title',/.+/);
  await box.focus();await box.press('Space');
  await expect.poll(async()=>JSON.parse(await src.inputValue()).page.tracking.endToEndMetrics).toBe(true);
  await expect(boardSection(page.locator('#guide'),'metrics').getByLabel(LABEL,{exact:true})).toBeChecked();
  await page.screenshot({path:info.outputPath('e2e-metrics-checkbox.png')});
  const {view,panel}=await viewer(page,server,await src.inputValue(),'e2e-metrics-on');
  await expect(panel.locator('.dv-live-proof-headline')).toHaveText('End to end proven');
  await expect(panel.locator('[data-proof-carrier="api"] .dv-live-proof-pill')).toHaveText('PROVEN');
  expect(await headings(panel)).not.toContain('Since Done');
  await panel.screenshot({path:info.outputPath('e2e-metrics-viewer.png')});await view.close();
  await page.locator('#undo-builder').click();await expect(src).toHaveValue(before);
});

test('E2 desktop the same board without the box keeps today\'s Proof',async({page,server})=>{
  await open(page,server);const src=page.locator('#src');
  const {view,panel}=await viewer(page,server,await src.inputValue(),'e2e-metrics-off');
  await expect(panel.locator('.dv-live-proof-headline')).toHaveCount(0);
  await expect(panel.locator('[data-proof-carrier="api"] .dv-live-proof-pill')).toHaveText('IN PROGRESS · LIVE EARLY');
  expect(await headings(panel)).toContain('Since Done');await view.close();
});
