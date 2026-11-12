/* #1241 desktop Workbench: the Live status panel's Tickets list (Demo live status or a loaded snapshot; the
   Workbench never calls Jira, Chuck 2026-11-12) drags a row onto a node or connection with the Edit mode drop
   targets, and the Workbench writes the ticket key as one Undo step.
| row | rule | fixture | assertion | broken implementation it rejects |
|---|---|---|---|---|
| D1 | Demo live status on: a real pointer drag of the HW-123 row onto node chime adds HW-123 to chime (the row's own node keeps it); while held over chime the card shows the drop highlight; one Undo restores the source. | the doorbell example board | dv-edit-over on chime while held; nodes.chime.tickets; source after Undo | no drag in the Workbench; a move instead of an add; two Undo steps |
| D2 | A loaded snapshot whose epic lists DOOR-7 (not on the diagram): dragging DOOR-7 onto connection ingest → notify adds it there; the saved source opened in the viewer paints that connection from DOOR-7's state. | the same board; snapshot with DOOR-7 blocked | edges[3].tickets; viewer path.edge[data-dv-edge="3"] dv-live-blocked | a drop written nowhere, or to the wrong carrier |
| D3 | Neither demo nor snapshot showing: the Tickets rows are not draggable. | the same board | no draggable rows | a drag offered with nothing to drag from |
Desktop only. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect,paste,prepareEditorSurface,closeTools} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
import {ticketRow,nodeCard,cardPoint,strokePoint,dragTicket,holdTicketOver} from '../helpers/board-edit.mjs';

const raw=JSON.parse(await readFile(path.join(repo,'examples/live-status/live-status.spec.json'),'utf8'));
const AT='2026-11-10T11:02:00.000Z';
function snapshotFile(){
  const issue=(state,summary)=>({state,summary,assignee:'Snapshot Person',updated:'2026-11-10T10:00:00.000+0000',epic:'DOOR-100'});
  const issues={};for(const key of ['HW-123','FW-45','FW-46','HW-124','BE-67','BE-68','UX-89'])issues[key]=issue('done','Snapshot title '+key);
  issues['DOOR-7']=issue('blocked','Retry the push when the token expires');
  return {version:1,kind:'flowview-live-snapshot',snapshotAt:AT,board:'doorbell.spec.json',intervalSeconds:6,epics:{'DOOR-100':{summary:'Doorbell epic'}},days:[{label:'Snapshot from '+AT,issues}],errors:[]};
}
async function open(page,server){
  await page.setViewportSize({width:1600,height:1100});
  await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(raw,null,2));await prepareEditorSurface(page);
  const view=page.locator('#docview');return {view,panel:view.locator('.pt-live-status'),src:page.locator('#src')};
}
const source=async src=>JSON.parse(await src.inputValue()).page.sections[0].diagram;
async function onScreen(locator){await locator.scrollIntoViewIfNeeded();}

test('D1 desktop Demo live status: drag a Tickets row onto a node; one Undo removes it',async({page,server},info)=>{
  const {view,panel,src}=await open(page,server),before=await src.inputValue();
  await page.getByRole('checkbox',{name:'Demo live status',exact:true}).check();
  const row=ticketRow(panel,'HW-123');await expect(row).toHaveAttribute('draggable','true');
  await expect(panel.locator('.dv-live-tickets-hint')).toContainText('Drag a row onto a node or connection');
  await onScreen(row);const target=await cardPoint(nodeCard(view,'chime'));
  const release=await holdTicketOver(page,panel,'HW-123',target);
  await expect(view.locator('g.node[data-dv-node="chime"]')).toHaveClass(/dv-edit-over/);
  await page.screenshot({path:info.outputPath('workbench-ticket-drag-held.png')});
  await release();
  await expect.poll(async()=>(await source(src)).nodes.chime.tickets).toEqual(['HW-124','HW-123']);
  expect((await source(src)).nodes.button.tickets,'an add, not a move').toEqual(['HW-123']);
  await page.locator('#undo-builder').click();await expect(src).toHaveValue(before);
});

test('D2 desktop snapshot: drag a ticket that is not on the diagram onto a connection; the viewer paints it',async({page,server},info)=>{
  const {view,panel,src}=await open(page,server);
  const file=info.outputPath('doorbell.snapshot.json');await mkdir(path.dirname(file),{recursive:true});await writeFile(file,JSON.stringify(snapshotFile()));
  await closeTools(page);await page.locator('#editor-tab-file').click();
  const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Load snapshot…',exact:true}).click();await (await chooser).setFiles(file);
  await expect(page.getByRole('checkbox',{name:/^Snapshot from /})).toBeChecked();await closeTools(page);
  const row=ticketRow(panel,'DOOR-7');await expect(row).toHaveAttribute('draggable','true');await onScreen(row);
  await dragTicket(page,panel,'DOOR-7',await strokePoint(page,view,3));
  await expect.poll(async()=>(await source(src)).edges[3].tickets).toEqual(['BE-67','DOOR-7']);
  await page.screenshot({path:info.outputPath('workbench-ticket-drag-edge.png')});
  // The saved source in the viewer: the connection now carries DOOR-7 and paints from its state.
  const spec=path.join(server.root,'workbench-ticket-drag.json'),out=path.join(server.root,'workbench-ticket-drag.html');
  await writeFile(spec,await src.inputValue());execFileSync('python3',[path.join(repo,'tools/inject.py'),spec,path.join(repo,'template/flowview.html'),out]);
  const map={'DOOR-7':{state:'blocked',title:'Retry the push'}};for(const key of ['HW-123','FW-45','FW-46','HW-124','BE-67','BE-68','UX-89'])map[key]={state:'done'};
  const viewer=await page.context().newPage();await viewer.setViewportSize({width:1440,height:900});
  await viewer.addInitScript(map=>{localStorage.setItem('dv_tour_v1','done');window.flowviewLiveStatus={provider:async()=>map};},map);
  await viewer.goto(server.origin+'/workbench-ticket-drag.html');
  await expect(viewer.locator('#docview path.edge[data-dv-edge="3"]')).toHaveClass(/dv-live-blocked/);await viewer.close();
});

test('D3 desktop without the demo or a snapshot the Tickets rows do not drag',async({page,server})=>{
  const {panel}=await open(page,server);
  await expect(panel.locator('tr[draggable="true"]')).toHaveCount(0);
  await expect(panel.locator('.dv-live-tickets-hint')).toHaveCount(0);
});
