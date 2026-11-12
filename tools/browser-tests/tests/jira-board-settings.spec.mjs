/* #1237 desktop Workbench Status board settings → Jira: dependencies, "waits on" link names and no-activity days.
| row | rule | fixture | assertion | broken implementation it rejects |
|---|---|---|---|---|
| D1 | Typing a New dependency (ticket, waits on, reason) and clicking Add dependency writes `tracking.dependencies[0]` {ticket,on,reason}; the saved spec opened in the viewer shows the ticket's card waiting on the other ticket; one Undo removes it. | live-status board, DOOR-101 on api and DOOR-102 on db, no dependencies | source value; viewer `data-dv-live-waiting-on="DOOR-102"` on api with a provider map where both are To do; source after Undo equals the text before | no control; a field the viewer ignores; an Add that takes two Undo steps |
| D2 | Add link name writes `tracking.jira.dependencyLinks` with the defaults plus the chosen name; Use default link names removes the key (back to the defaults). | the same board | defaults listed while unset; source list after Enter; key absent after Use default link names | an empty array left behind; the defaults silently dropped |
| D3 | No activity after (days) = 3 writes `tracking.staleDays: 3` and the saved spec marks a ticket last updated 4 days ago stale in the viewer; 0 is written and its validator warning sits next to the field (aria-invalid, visible note). | the same board | source value; viewer `dv-live-stale` on api; aria-invalid and note text | a warning only at the end of the section; a value the viewer ignores |
The viewer use of dependencyLinks is in the Jira connector provider and is covered by tests/live-status.test.js (custom link types). Desktop only.
*/
import {writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect,paste,prepareEditorSurface,openStatusBoard,boardSection} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
const DAY=86400000,ago=days=>new Date(Date.now()-days*DAY).toISOString();
function board(){
  const d={nodes:{api:{title:'API',tickets:['DOOR-101']},db:{title:'Store',tickets:['DOOR-102']}},rows:[['api','db']],edges:[{from:'api',to:'db',label:'write'}],
    panels:[{id:'status',type:'live-status',title:'Epic status'}]};
  return {page:{title:'Board',tracking:{jira:{site:'https://acme.atlassian.net'}},sections:[{heading:'Flow',diagram:d}]}};
}
async function open(page,server){
  await page.setViewportSize({width:1440,height:1000});
  await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(board(),null,2));await prepareEditorSurface(page);
  await page.locator('#editor-tab-inspect').click();await openStatusBoard(page,'jira');
  return boardSection(page.locator('#guide'),'jira');
}
// The Workbench source, saved as a spec and opened in the standalone viewer with a fixed Jira map.
async function viewer(page,server,source,map,name){
  const file=path.join(server.root,name+'.json'),out=path.join(server.root,name+'.html');await writeFile(file,source);
  execFileSync('python3',[path.join(repo,'tools/inject.py'),file,path.join(repo,'template/flowview.html'),out]);
  const view=await page.context().newPage();await view.setViewportSize({width:1440,height:900});
  await view.addInitScript(map=>{localStorage.setItem('dv_tour_v1','done');window.flowviewLiveStatus={provider:async()=>map};},map);
  await view.goto(server.origin+'/'+name+'.html');
  const api=view.locator('#docview g.node[data-dv-node="api"]');await expect(api).toHaveClass(/dv-live-todo/);
  return {view,api};
}
async function typeInto(field,text){await field.click();await field.press('ControlOrMeta+a');await field.press('Backspace');await field.pressSequentially(text);}

test('D1 desktop Add dependency writes tracking.dependencies[0]; the viewer shows the ticket waiting; one Undo removes it',async({page,server},info)=>{
  const jira=await open(page,server),src=page.locator('#src'),before=await src.inputValue();
  await typeInto(jira.getByLabel('New dependency ticket',{exact:true}),'DOOR-101');
  await typeInto(jira.getByLabel('New dependency waits on',{exact:true}),'DOOR-102');
  await typeInto(jira.getByLabel('New dependency reason',{exact:true}),'Schema first');
  await jira.getByRole('button',{name:'Add dependency',exact:true}).click();
  await expect.poll(async()=>JSON.parse(await src.inputValue()).page.tracking.dependencies).toEqual([{ticket:'DOOR-101',on:'DOOR-102',reason:'Schema first'}]);
  await expect(jira.getByLabel('Dependency 1 ticket',{exact:true})).toHaveValue('DOOR-101');
  await expect(jira.locator(':scope > summary')).toContainText('1 dependency');
  await page.screenshot({path:info.outputPath('jira-dependency-added.png')});
  const map={'DOOR-101':{state:'todo',title:'API work',updatedAt:ago(1)},'DOOR-102':{state:'todo',title:'Store work',updatedAt:ago(1)}};
  const {view,api}=await viewer(page,server,await src.inputValue(),map,'jira-board-dependency');
  await expect(api).toHaveAttribute('data-dv-live-waiting-on','DOOR-102');await view.close();
  await page.locator('#undo-builder').click();await expect(src).toHaveValue(before);
});

test('D2 desktop Add link name writes tracking.jira.dependencyLinks; Use default link names removes the key',async({page,server},info)=>{
  const jira=await open(page,server),src=page.locator('#src');
  await expect(jira.locator('.board-link-name > span')).toHaveText(['is blocked by (default)','depends on (default)']);
  const add=jira.getByLabel('Add link name',{exact:true});await typeInto(add,'is gated by');await add.press('Enter');
  await expect.poll(async()=>JSON.parse(await src.inputValue()).page.tracking.jira.dependencyLinks).toEqual(['is blocked by','depends on','is gated by']);
  await expect(jira.locator('.board-link-name > span')).toHaveText(['is blocked by','depends on','is gated by']);
  await page.screenshot({path:info.outputPath('jira-link-names.png')});
  await jira.getByRole('button',{name:'Use default link names',exact:true}).click();
  await expect.poll(async()=>Object.keys(JSON.parse(await src.inputValue()).page.tracking.jira)).toEqual(['site']);
  await expect(jira.locator('.board-link-name > span')).toHaveText(['is blocked by (default)','depends on (default)']);
});

test('D3 desktop No activity after 3 days writes tracking.staleDays and the viewer marks older tickets stale; 0 shows the validator warning at the field',async({page,server},info)=>{
  const jira=await open(page,server),src=page.locator('#src');
  const days=jira.getByLabel('No activity after (days)',{exact:true});await expect(days).toHaveAttribute('placeholder','7');
  await typeInto(days,'3');await days.press('Enter');
  await expect.poll(async()=>JSON.parse(await src.inputValue()).page.tracking.staleDays).toBe(3);
  const map={'DOOR-101':{state:'todo',title:'API work',updatedAt:ago(4)},'DOOR-102':{state:'todo',title:'Store work',updatedAt:ago(1)}};
  const {view,api}=await viewer(page,server,await src.inputValue(),map,'jira-board-stale');
  await expect(api).toHaveClass(/dv-live-stale/);await expect(view.locator('#docview g.node[data-dv-node="db"]')).not.toHaveClass(/dv-live-stale/);await view.close();
  const field=jira.getByLabel('No activity after (days)',{exact:true});await typeInto(field,'0');await field.press('Enter');
  await expect.poll(async()=>JSON.parse(await src.inputValue()).page.tracking.staleDays).toBe(0);
  const warned=boardSection(page.locator('#guide'),'jira').getByLabel('No activity after (days)',{exact:true});
  await expect(warned).toHaveAttribute('aria-invalid','true');
  const note=page.locator('#'+(await warned.getAttribute('aria-describedby')).split(' ').pop());
  await expect(note).toBeVisible();await expect(note).toHaveText('Must be a positive number — using 7 days.');
  await page.screenshot({path:info.outputPath('jira-stale-days-warning.png')});
});
