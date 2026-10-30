/* #828 Edit mode on the shared live board: drag a Tickets row onto a node or edge,
   Remove from the carrier popover, Save publishes flowspec.json. Contract source: #828
   "What changes" + "Test + flip", #825 Design "Edit mode" and "Conflict"; the #828 comment
   (Chuck 2026-10-30): a page booted from the inline fallback must not save. §0 ruling
   (Chuck 2026-10-30): the issue's own Test + flip plan, plus that fallback test.
   Desktop only (1440 px); real pointer input; window.claude is a mock recording `publish`.
   Imported carriers (overlay rows I1–I3) live in tests/topology-tracking.spec.mjs.

| row | fixture | assertion (scoped) | rejects |
|---|---|---|---|
| E1 Edit only for editors with the artifact capability | boardSpec; canEdit false; then canEdit true with use("artifact") null | Live status panel: no Edit button; the EX-1 row is not draggable; a drag onto B leaves EX-1 NOT ON DIAGRAM; zero publish calls | an Edit button shown to every viewer; one gated only on canEdit |
| E2 drop on a node + Save | EX-1 (NOT ON DIAGRAM) dragged onto node B | before Save: zero publishes, B's Jira cue appears, EX-1 tag gone, button "Save 1 change"; after Save: exactly one publish of only flowspec.json (application/json) whose B.tickets == ["EX-1"], one new page.editHistory entry {at ISO between click and answer, by {id,name} of user.me(), changes [{op add, ticket EX-1, node b, label "Beta service", path to B}]}, every other authored line unchanged; Save/Discard gone; the Edit history panel shows the entry | a re-serialized spec; a publish per drop; a history entry without by or label; a whole-document publish |
| E3 drop on an edge + Save | EX-1 dragged onto edge A → B ("calls") | edges[0].tickets == ["EX-1"]; change {edge ["a","b"], label "Alpha service → Beta service"} | edge label text instead of endpoint titles; writing to a node |
| E4 add-only | AA-1 (on A) dragged onto B | A.tickets and B.tickets both ["AA-1"] | a move (removing from A) |
| E5 no-op drops | AA-1 onto A; EX-1 onto B twice | after the first: no Save, no Discard; after the repeat: still "Save 1 change"; saved B.tickets == ["EX-1"] | counting a drop that changes nothing; duplicating a key |
| E6 Remove from the popover | A's popover; edge B → C's popover; node C's popover | outside Edit mode A's popover has no Remove; in Edit mode Remove AA-1 → Save → A has no AA-1, change {op remove, node a, label "Alpha service"}; the B → C popover lists CC-1 (availability cause) with no Remove; C's own CC-1 has Remove | Remove on availability-cause rows; Remove for readers |
| E7 Discard | two pending changes | Discard → zero publishes, EX-1 NOT ON DIAGRAM again, B has no Jira cue, Save/Discard gone | Discard that hides buttons but keeps the edited board |
| E8 leave warning | one pending change; then after Save; then after Discard | navigation raises one beforeunload dialog with a pending change and none after Save or Discard | no handler; a handler left armed after Save/Discard |
| E9 read-only rejection | publish rejects not_writer | Edit, Save and Discard gone; the panel says the board is read-only here | treating not_writer as a retryable error |
| E10 conflict | publish rejects conflict once; the reload serves another editor's spec (A retitled, its own history entry) | after reload: A's new title shows (the winner rendered), EX-1 re-applied (B has it, tag gone), notice "Another editor saved first. 1 of your changes were re-applied; 0 could not be", zero publishes until Save; Save publishes the winner text plus EX-1 on B with both history entries | an automatic second publish; replay onto the editor's stale text; losing the winner's history |
| E11 duplicate identities | node id door in sections one and two; two parallel edges door → cloud in section two | drops onto section two's door and the second parallel edge change only sections[1].nodes.door and sections[1].edges[1] | addressing by node id or endpoints alone |
| E12 conflict replay: sections swapped | editor drops on section "second"'s door; the winner swaps the sections | EX-1 lands on the door of the section whose id is "second" (now index 0), not on index 1 | replay by stored numeric path |
| E13 conflict replay: ambiguous parallel edge | two identical unlabeled door → cloud edges; the editor drops on the second; the winner deletes the first | the op is dropped and listed ("0 of your changes were re-applied; 1 could not be"), the remaining edge has no EX-1, no Save button | replaying onto the only remaining edge |
| E14 conflict replay: carrier deleted | editor drops on B; the winner deletes B | op dropped and listed; no carrier gains EX-1 | applying to a same-titled or nearby carrier |
| E15 inline fallback cannot save | two-file page whose flowspec.json is missing (inline copy, warning banner) | Edit is disabled with the reason "couldn't load its latest version"; EX-1 row not draggable; zero publishes | saving the fallback copy over the newer file |
Flip: remove the drop handler → E2's publish count 0 ≠ 1.
*/
import {test,expect} from '../helpers/test.mjs';
import {rm} from 'node:fs/promises';
import {EDITOR,boardSpec,buildBoard,serveWinner,mockRuntime,publishes,openBoard,ticketRow,coverageTag,editButton,saveButton,discardButton,
 nodeCard,edgeLabel,cardPoint,strokePoint,dragTicket,startEditing,save,diagramAt,expectSurgical,withoutEdits,TRACKING,PANELS} from '../helpers/board-edit.mjs';

const cue=(root,id)=>root.locator('g.node[data-dv-node="'+id+'"] .dv-jira-cue');
const popover=page=>page.locator('.dv-live-popover');
async function openPopover(page,target){await target.scrollIntoViewIfNeeded();const box=await target.boundingBox();await page.mouse.click(box.x+box.width-8,box.y+box.height/2);const pop=popover(page);await expect(pop).toBeVisible();return pop;}
const popoverTicket=(pop,key)=>pop.locator('.dv-live-ticket').filter({hasText:key});
function expectEntry(entry,{started,finished}){
 expect(typeof entry.at).toBe('string');expect(entry.at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
 const at=Date.parse(entry.at);expect(at).toBeGreaterThanOrEqual(started-1000);expect(at).toBeLessThanOrEqual(finished+1000);
 expect(entry.by).toEqual({id:EDITOR.id,name:EDITOR.name});
}
async function navigationDialogs(page){
 const seen=[];const handler=dialog=>{seen.push(dialog.type());dialog.accept().catch(()=>{});};
 page.on('dialog',handler);
 await page.goto('about:blank');
 page.off('dialog',handler);return seen;
}
async function precondition(root,panel){
 await expect(coverageTag(panel,'EX-1')).toHaveText('NOT ON DIAGRAM');await expect(cue(root,'b')).toHaveCount(0);
}

test('E1 read-only viewers and pages without the artifact capability get no Edit control and never publish',async({page,server})=>{
 const board=await buildBoard(server,'read-only',boardSpec());
 for(const options of [{canEdit:false},{canEdit:true,artifact:false}]){
  const context=page.context(),viewer=await context.newPage();await mockRuntime(viewer,options);
  const {root,panel}=await openBoard(viewer,board);await precondition(root,panel);
  // Edit availability resolves asynchronously; give the runtime time to answer.
  await viewer.waitForTimeout(1500);
  await expect(editButton(panel),JSON.stringify(options)).toHaveCount(0);
  await expect(ticketRow(panel,'EX-1')).not.toHaveAttribute('draggable','true');
  await dragTicket(viewer,panel,'EX-1',await cardPoint(nodeCard(root,'b')));
  await expect(coverageTag(panel,'EX-1')).toHaveText('NOT ON DIAGRAM');await expect(saveButton(panel)).toHaveCount(0);
  expect(await publishes(viewer)).toEqual([]);
  await viewer.close();
 }
});

test('E2 E8 dropping a NOT ON DIAGRAM ticket on a node and saving publishes flowspec.json once with one history entry',async({page,server})=>{
 const spec=boardSpec(),board=await buildBoard(server,'assign-node',spec);await mockRuntime(page);
 const {root,panel}=await openBoard(page,board);await precondition(root,panel);
 await expect(saveButton(panel)).toHaveCount(0);await startEditing(panel);
 await expect(ticketRow(panel,'EX-1')).toHaveAttribute('draggable','true');
 await dragTicket(page,panel,'EX-1',await cardPoint(nodeCard(root,'b')));
 await expect(saveButton(panel)).toHaveText('Save 1 change');await expect(discardButton(panel)).toBeVisible();
 await expect(coverageTag(panel,'EX-1')).toHaveCount(0);await expect(cue(root,'b')).toHaveCount(1);
 expect(await publishes(page),'nothing is published before Save').toEqual([]);
 const started=Date.now(),text=await save(page,panel,1),finished=Date.now();
 const saved=JSON.parse(text);
 expect(diagramAt(saved).nodes.b.tickets).toEqual(['EX-1']);
 expect(saved.page.editHistory).toHaveLength(1);
 const entry=saved.page.editHistory[0];expectEntry(entry,{started,finished});
 expect(entry.changes).toEqual([{op:'add',ticket:'EX-1',path:['page','sections',0,'diagram','nodes','b'],node:'b',label:'Beta service'}]);
 expect(withoutEdits(saved,s=>{delete s.page.editHistory;delete diagramAt(s).nodes.b.tickets;})).toEqual(spec);
 expectSurgical(board.text,text);
 await expect(saveButton(panel)).toHaveCount(0);await expect(discardButton(panel)).toHaveCount(0);
 await page.waitForTimeout(500);expect(await publishes(page)).toHaveLength(1);
 const history=root.locator('.pwidget.pt-edit-history li[data-edit-at]');
 await expect(history).toHaveCount(1);await expect(history.first().locator('.dv-edit-who')).toHaveText(EDITOR.name);
 await expect(history.first().locator('.dv-edit-first')).toHaveText('EX-1 added to Beta service');
 // E8: after Save nothing is pending, so leaving raises no dialog
 expect(await navigationDialogs(page)).toEqual([]);
});

test('E3 dropping a ticket on an edge label records the edge and its endpoint titles',async({page,server})=>{
 const spec=boardSpec(),board=await buildBoard(server,'assign-edge',spec);await mockRuntime(page);
 const {root,panel}=await openBoard(page,board);await precondition(root,panel);await startEditing(panel);
 await dragTicket(page,panel,'EX-1',await cardPoint(edgeLabel(root,0)));
 await expect(coverageTag(panel,'EX-1')).toHaveCount(0);
 const text=await save(page,panel,1),saved=JSON.parse(text),d=diagramAt(saved);
 expect(d.edges[0].tickets).toEqual(['EX-1']);expect(d.edges[1].tickets).toBeUndefined();expect(d.nodes.b.tickets).toBeUndefined();
 expect(saved.page.editHistory[0].changes).toEqual([{op:'add',ticket:'EX-1',path:['page','sections',0,'diagram','edges',0],edge:['a','b'],label:'Alpha service → Beta service'}]);
 expect(withoutEdits(saved,s=>{delete s.page.editHistory;delete diagramAt(s).edges[0].tickets;})).toEqual(spec);
 expectSurgical(board.text,text);
});

test('E4 E5 drops only add: a ticket stays on its carrier, and drops that change nothing are not changes',async({page,server})=>{
 const spec=boardSpec(),board=await buildBoard(server,'add-only',spec);await mockRuntime(page);
 const {root,panel}=await openBoard(page,board);await precondition(root,panel);await startEditing(panel);
 // E5: AA-1 is already on A
 await dragTicket(page,panel,'AA-1',await cardPoint(nodeCard(root,'a')));
 await page.waitForTimeout(300);await expect(saveButton(panel)).toHaveCount(0);await expect(discardButton(panel)).toHaveCount(0);
 // E5: the same key twice on B is one change
 await dragTicket(page,panel,'EX-1',await cardPoint(nodeCard(root,'b')));await expect(saveButton(panel)).toHaveText('Save 1 change');
 await dragTicket(page,panel,'EX-1',await cardPoint(nodeCard(root,'b')));await page.waitForTimeout(300);await expect(saveButton(panel)).toHaveText('Save 1 change');
 // E4: AA-1 dragged from the table onto B also stays on A
 await dragTicket(page,panel,'AA-1',await cardPoint(nodeCard(root,'b')));await expect(saveButton(panel)).toHaveText('Save 2 changes');
 const saved=JSON.parse(await save(page,panel,2)),d=diagramAt(saved);
 expect(d.nodes.a.tickets).toEqual(['AA-1']);expect(d.nodes.b.tickets).toEqual(['EX-1','AA-1']);
 expect(saved.page.editHistory[0].changes.map(change=>[change.op,change.ticket,change.node])).toEqual([['add','EX-1','b'],['add','AA-1','b']]);
});

test('E6 the carrier popover offers Remove only in Edit mode and only for tickets authored on that carrier',async({page,server})=>{
 const spec=boardSpec(),board=await buildBoard(server,'remove',spec);await mockRuntime(page);
 const {root,panel}=await openBoard(page,board);await expect(editButton(panel)).toBeVisible();
 let pop=await openPopover(page,nodeCard(root,'a'));
 await expect(popoverTicket(pop,'AA-1')).toHaveCount(1);await expect(pop.getByRole('button',{name:/^Remove /})).toHaveCount(0);
 await page.keyboard.press('Escape');await expect(pop).toBeHidden();
 await startEditing(panel);
 // availability cause: C's CC-1 is listed on the edge B → C, never removable there
 pop=await openPopover(page,edgeLabel(root,1));
 await expect(popoverTicket(pop,'CC-1')).toHaveCount(1);await expect(pop.getByRole('button',{name:/^Remove /})).toHaveCount(0);
 await page.keyboard.press('Escape');
 pop=await openPopover(page,nodeCard(root,'c'));
 await expect(pop.getByRole('button',{name:'Remove CC-1 from Gamma store',exact:true})).toBeVisible();
 await page.keyboard.press('Escape');
 pop=await openPopover(page,nodeCard(root,'a'));
 await pop.getByRole('button',{name:'Remove AA-1 from Alpha service',exact:true}).click();
 await expect(saveButton(panel)).toHaveText('Save 1 change');await expect(cue(root,'a')).toHaveCount(0);
 const text=await save(page,panel,1),saved=JSON.parse(text);
 expect(diagramAt(saved).nodes.a.tickets ?? []).toEqual([]);expect(diagramAt(saved).nodes.c.tickets).toEqual(['CC-1']);
 expect(saved.page.editHistory[0].changes).toEqual([{op:'remove',ticket:'AA-1',path:['page','sections',0,'diagram','nodes','a'],node:'a',label:'Alpha service'}]);
 expect(withoutEdits(saved,s=>{delete s.page.editHistory;delete diagramAt(s).nodes.a.tickets;})).toEqual(withoutEdits(spec,s=>{delete diagramAt(s).nodes.a.tickets;}));
});

test('E7 E8 Discard drops every pending change without publishing; only pending changes warn on leave',async({page,server})=>{
 const board=await buildBoard(server,'discard',boardSpec());await mockRuntime(page);
 let {root,panel}=await openBoard(page,board);await precondition(root,panel);await startEditing(panel);
 await dragTicket(page,panel,'EX-1',await cardPoint(nodeCard(root,'b')));
 // E8: one pending change → leaving raises the browser's leave-page warning
 expect(await navigationDialogs(page)).toEqual(['beforeunload']);
 ({root,panel}=await openBoard(page,board));await precondition(root,panel);await startEditing(panel);
 await dragTicket(page,panel,'EX-1',await cardPoint(nodeCard(root,'b')));
 await dragTicket(page,panel,'AA-1',await cardPoint(edgeLabel(root,0)));
 await expect(saveButton(panel)).toHaveText('Save 2 changes');
 await discardButton(panel).click();
 await expect(saveButton(panel)).toHaveCount(0);await expect(discardButton(panel)).toHaveCount(0);
 await expect(coverageTag(panel,'EX-1')).toHaveText('NOT ON DIAGRAM');await expect(cue(root,'b')).toHaveCount(0);
 await expect(root.locator('.dv-jira-cue[data-jira-carrier="a->b"]')).toHaveCount(0);
 await page.waitForTimeout(500);expect(await publishes(page)).toEqual([]);
 expect(await navigationDialogs(page)).toEqual([]);
});

test('E9 a not_writer rejection turns the board read-only here',async({page,server})=>{
 const board=await buildBoard(server,'not-writer',boardSpec());await mockRuntime(page,{reject:'not_writer'});
 const {root,panel}=await openBoard(page,board);await startEditing(panel);
 await dragTicket(page,panel,'EX-1',await cardPoint(nodeCard(root,'b')));
 await saveButton(panel).click();
 await expect(panel.locator('.dv-live-edit-notice')).toContainText(/read-only here/i);
 await expect(editButton(panel)).toHaveCount(0);await expect(saveButton(panel)).toHaveCount(0);await expect(discardButton(panel)).toHaveCount(0);
 expect(await publishes(page)).toHaveLength(1);
});

test('E10 a conflict replays the stashed change onto the winning spec without publishing again',async({page,server})=>{
 const spec=boardSpec(),board=await buildBoard(server,'conflict',spec);await mockRuntime(page,{reject:'conflict',rejectOnce:true});
 let {root,panel}=await openBoard(page,board);await precondition(root,panel);await startEditing(panel);
 await dragTicket(page,panel,'EX-1',await cardPoint(nodeCard(root,'b')));
 await saveButton(panel).click();await expect.poll(()=>publishes(page).then(list=>list.length)).toBe(1);
 // the runtime reloads the view to the winning version: another editor retitled A
 const winner=boardSpec();diagramAt(winner).nodes.a.title='Alpha renamed by Bo';
 winner.page.editHistory=[{at:'2026-10-30T10:00:00.000Z',by:{id:'u_bo',name:'Bo'},changes:[{op:'add',ticket:'AA-1',node:'a',label:'Alpha service'}]}];
 const winnerText=await serveWinner(board,winner);
 await page.reload();({root,panel}=await openBoard(page,board));
 await expect(root.locator('g.node[data-dv-node="a"]')).toContainText('Alpha renamed by Bo');
 await expect(panel.locator('.dv-live-edit-notice')).toHaveText(/^Another editor saved first\. 1 of your changes were re-applied; 0 could not be/);
 await expect(coverageTag(panel,'EX-1')).toHaveCount(0);await expect(cue(root,'b')).toHaveCount(1);
 await page.waitForTimeout(1000);expect(await publishes(page),'no automatic second publish').toEqual([]);
 const text=await save(page,panel,1),saved=JSON.parse(text);
 expect(diagramAt(saved).nodes.b.tickets).toEqual(['EX-1']);expect(diagramAt(saved).nodes.a.title).toBe('Alpha renamed by Bo');
 expect(saved.page.editHistory).toHaveLength(2);expect(saved.page.editHistory[0]).toEqual(winner.page.editHistory[0]);
 expect(saved.page.editHistory[1].changes).toEqual([{op:'add',ticket:'EX-1',path:['page','sections',0,'diagram','nodes','b'],node:'b',label:'Beta service'}]);
 expectSurgical(winnerText,text);
});

function twoSections({labels=true,parallel=2}={}){
 const section=(id,heading,panels)=>({id,heading,diagram:{nodes:{door:{title:'Door '+heading},cloud:{title:'Cloud '+heading}},rows:[['door','cloud']],
  edges:id==='second'?Array.from({length:parallel},(_,i)=>labels?{from:'door',to:'cloud',label:['primary','backup'][i]}:{from:'door',to:'cloud'}):[{from:'door',to:'cloud',label:'link'}],...(panels?{panels:structuredClone(PANELS)}:{})}});
 return {page:{title:'Duplicate identities',tracking:structuredClone(TRACKING),sections:[section('first','one',true),section('second','two',false)]}};
}
const sectionScope=(root,id)=>root.locator('#section-'+id);

test('E11 duplicate node ids and parallel edges: a drop changes only the carrier under the pointer',async({page,server})=>{
 const spec=twoSections(),board=await buildBoard(server,'duplicates',spec);await mockRuntime(page);
 const {root,panel}=await openBoard(page,board);await startEditing(panel);
 const second=sectionScope(root,'second');
 await dragTicket(page,panel,'EX-1',await cardPoint(nodeCard(second,'door')));
 await dragTicket(page,panel,'EX-1',await cardPoint(edgeLabel(second,1)));
 const saved=JSON.parse(await save(page,panel,2));
 expect(diagramAt(saved,1).nodes.door.tickets).toEqual(['EX-1']);expect(diagramAt(saved,1).edges[1].tickets).toEqual(['EX-1']);
 expect(withoutEdits(saved,s=>{delete s.page.editHistory;delete diagramAt(s,1).nodes.door.tickets;delete diagramAt(s,1).edges[1].tickets;})).toEqual(spec);
 expect(saved.page.editHistory[0].changes.map(change=>change.path)).toEqual([['page','sections',1,'diagram','nodes','door'],['page','sections',1,'diagram','edges',1]]);
});

async function conflictThenReload(page,board,act,winner){
 let {root,panel}=await openBoard(page,board);await startEditing(panel);
 await act(root,panel);
 await saveButton(panel).click();await expect.poll(()=>publishes(page).then(list=>list.length)).toBe(1);
 await serveWinner(board,winner);await page.reload();({root,panel}=await openBoard(page,board));
 const notice=panel.locator('.dv-live-edit-notice');await expect(notice).toBeVisible();
 await page.waitForTimeout(500);expect(await publishes(page),'no automatic second publish').toEqual([]);
 return {root,panel,notice};
}

test('E12 conflict replay finds a swapped section by identity, not position',async({page,server})=>{
 const spec=twoSections(),board=await buildBoard(server,'replay-sections',spec);await mockRuntime(page,{reject:'conflict',rejectOnce:true});
 const winner=structuredClone(spec);winner.page.sections.reverse();
 const {panel,notice}=await conflictThenReload(page,board,async(root,panel)=>{
  await dragTicket(page,panel,'EX-1',await cardPoint(nodeCard(sectionScope(root,'second'),'door')));
 },winner);
 await expect(notice).toHaveText(/1 of your changes were re-applied; 0 could not be/);
 const saved=JSON.parse(await save(page,panel,1));
 expect(saved.page.sections[0].id).toBe('second');
 expect(diagramAt(saved,0).nodes.door.tickets).toEqual(['EX-1']);expect(diagramAt(saved,1).nodes.door.tickets).toBeUndefined();
});

test('E13 conflict replay drops an op whose parallel edge was ambiguous when it was made',async({page,server})=>{
 const spec=twoSections({labels:false}),board=await buildBoard(server,'replay-parallel',spec);await mockRuntime(page,{reject:'conflict',rejectOnce:true});
 const winner=structuredClone(spec);diagramAt(winner,1).edges.splice(0,1);
 const {root,panel,notice}=await conflictThenReload(page,board,async(root,panel)=>{
  await dragTicket(page,panel,'EX-1',await strokePoint(page,sectionScope(root,'second'),1));
  await expect(saveButton(panel)).toHaveText('Save 1 change');
 },winner);
 await expect(notice).toHaveText(/0 of your changes were re-applied; 1 could not be \(carrier moved, removed or ambiguous\): .*EX-1/);
 await expect(saveButton(panel)).toHaveCount(0);await expect(coverageTag(panel,'EX-1')).toHaveText('NOT ON DIAGRAM');
 await expect(root.locator('.dv-jira-cue')).toHaveCount(0);
});

test('E14 conflict replay drops an op whose carrier the winner deleted',async({page,server})=>{
 const spec=boardSpec(),board=await buildBoard(server,'replay-deleted',spec);await mockRuntime(page,{reject:'conflict',rejectOnce:true});
 const winner=boardSpec(),d=diagramAt(winner);delete d.nodes.b;d.rows=[['a','c']];d.edges=[{from:'a',to:'c',label:'writes'}];
 const {root,panel,notice}=await conflictThenReload(page,board,async(root,panel)=>{
  await dragTicket(page,panel,'EX-1',await cardPoint(nodeCard(root,'b')));
 },winner);
 await expect(notice).toHaveText(/0 of your changes were re-applied; 1 could not be \(carrier moved, removed or ambiguous\): .*EX-1/);
 await expect(saveButton(panel)).toHaveCount(0);await expect(coverageTag(panel,'EX-1')).toHaveText('NOT ON DIAGRAM');
});

test('E15 a board booted from its inline fallback copy cannot enter Edit mode or publish',async({page,server,audit})=>{
 const board=await buildBoard(server,'fallback',boardSpec());await rm(board.specFile);
 audit.allowStatus(404,url=>url.endsWith('/board-edit-fallback/flowspec.json'));
 await mockRuntime(page);
 const {root,panel}=await openBoard(page,board);
 await expect(page.locator('.dv-source-fallback[role="alert"]')).toBeVisible();
 const edit=editButton(panel);await expect(edit).toBeVisible();await expect(edit).toBeDisabled();
 await expect(panel.locator('.dv-live-edit-reason')).toContainText("couldn't load its latest version");
 await expect(ticketRow(panel,'EX-1')).not.toHaveAttribute('draggable','true');
 await dragTicket(page,panel,'EX-1',await cardPoint(nodeCard(root,'b')));
 await expect(saveButton(panel)).toHaveCount(0);await expect(coverageTag(panel,'EX-1')).toHaveText('NOT ON DIAGRAM');
 expect(await publishes(page)).toEqual([]);
});
