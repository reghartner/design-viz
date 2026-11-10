/* #1236 desktop Workbench Status board settings.
| row | rule | fixture | assertion | broken implementation it rejects |
|---|---|---|---|---|
| B1 | Inspect → Status board settings on a live-status board shows five sections (Jira, Metrics, Traces, Environments, Log searches); Jira site there writes `tracking.jira.site`; one Undo restores the source; Find objects → Status board settings opens the same area. | live-status board with tracking.jira and a Live status panel | five `details.board-section` summaries; source value after the edit and after Undo; the Find objects button shows the same sections | no entry point; sections missing; an edit that needs two Undo steps |
| B2 | An invalid `tracking.staleDays` and Jira site show their validator warnings in the Jira section. | the same board with staleDays 0 and a bad site | `Jira warnings` list inside the Jira section contains both paths; the section is open | warnings missing or in another section |
| B3 | Make this a status board on a bare diagram adds a page wrapper, an empty tracking block and a Live status panel; one Undo restores the bare diagram. | bare {nodes,rows,edges} diagram | source shape after the click; the preview shows the Live status panel; source after Undo equals the bare text | several Undo steps; a lost diagram; no panel |
*/
import {test,expect,paste,prepareEditorSurface} from '../helpers/test.mjs';
const diagram=()=>({nodes:{api:{title:'API',tickets:['DOOR-101']},db:{title:'Store'}},rows:[['api','db']],edges:[{from:'api',to:'db',label:'write'}]});
function board(tracking){
  const d=diagram();d.panels=[{id:'status',type:'live-status',title:'Epic status'}];
  return {page:{title:'Board',tracking:tracking || {jira:{site:'https://acme.atlassian.net',epic:'DOOR-100'}},sections:[{heading:'Flow',diagram:d}]}};
}
const TITLES=['Jira','Metrics','Traces','Environments','Log searches'];
const sections=guide=>guide.locator('details.board-section');
const section=(guide,id)=>guide.locator('details.board-section[data-board-section="'+id+'"]');
async function open(page,server,spec){
  await page.setViewportSize({width:1440,height:1000});
  await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(spec,null,2));await prepareEditorSurface(page);
  await page.locator('#editor-tab-inspect').click();
}
async function titles(guide){return (await sections(guide).locator(':scope > summary').allTextContents()).map(t=>t.split(' · ')[0]);}

test('B1 desktop Status board settings shows five sections; Jira site edits tracking.jira.site with one Undo; Find objects opens it too',async({page,server},info)=>{
  await open(page,server,board());
  const guide=page.locator('#guide'),src=page.locator('#src');
  await page.locator('#status-board-settings').click();
  await expect(guide.locator('.inspector-title')).toHaveText('Status board settings');
  expect(await titles(guide)).toEqual(TITLES);
  const site=section(guide,'jira').getByLabel('Jira site',{exact:true});await expect(site).toBeVisible();
  const before=await src.inputValue();
  await site.fill('https://door.atlassian.net');await site.press('Enter');
  await expect.poll(async()=>JSON.parse(await src.inputValue()).page.tracking.jira.site).toBe('https://door.atlassian.net/');
  expect(JSON.parse(await src.inputValue()).page.tracking.jira.epic).toBe('DOOR-100');
  await page.screenshot({path:info.outputPath('status-board-settings.png')});
  await page.locator('#undo-builder').click();await expect(src).toHaveValue(before);
  await page.locator('#editor-tab-outline').click();await page.locator('#outline-status-board-settings').click();
  await expect(guide.locator('.inspector-title')).toHaveText('Status board settings');expect(await titles(guide)).toEqual(TITLES);
});

test('B2 desktop invalid staleDays and Jira site show their warnings in the Jira section',async({page,server})=>{
  await open(page,server,board({staleDays:0,jira:{site:'not a url'}}));
  const guide=page.locator('#guide');await page.locator('#status-board-settings').click();
  const jira=section(guide,'jira');await expect(jira).toHaveAttribute('open','');
  const list=jira.getByRole('list',{name:'Jira warnings',exact:true});await expect(list).toBeVisible();
  await expect(list).toContainText('tracking.staleDays');await expect(list).toContainText('tracking.jira.site');
  await expect(jira.locator(':scope > summary')).toContainText('2 warnings');
});

test('B3 desktop Make this a status board on a bare diagram adds page, tracking and Live status panel as one Undo step',async({page,server},info)=>{
  const bare=diagram();await open(page,server,bare);
  const guide=page.locator('#guide'),src=page.locator('#src'),before=await src.inputValue();
  await page.locator('#status-board-settings').click();
  await expect(sections(guide)).toHaveCount(0);
  await guide.getByRole('button',{name:'Make this a status board',exact:true}).click();
  await expect.poll(async()=>JSON.parse(await src.inputValue()).page?.tracking).toEqual({});
  const raw=JSON.parse(await src.inputValue()),d=raw.page.sections[0].diagram;
  expect(d.panels.map(p=>p.type)).toEqual(['live-status']);delete d.panels;expect(d).toEqual(bare);
  await expect(page.locator('#docview .pt-live-status')).toHaveCount(1);
  expect(await titles(guide)).toEqual(TITLES);
  await page.screenshot({path:info.outputPath('make-status-board.png')});
  await page.locator('#undo-builder').click();await expect(src).toHaveValue(before);
});
