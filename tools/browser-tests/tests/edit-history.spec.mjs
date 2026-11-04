/* #827 edit-history panel, real viewport. Contract source: #827 "How it should look and behave",
   #825 Design "Edit-history panel"; §0 ruling (Chuck 2026-10-30): the issue's own Test + flip plan.
   Node rows H1–H11 live in tests/live-status-panel.test.js and tests/live-status.test.js.
| row | fixture | assertion (scoped) | rejects |
|---|---|---|---|
| B1 the example shows the panel below the board in every layout profile | examples/live-status spec built with inject.py, opened plain and with ?layout=backstage / confluence | `.pwidget.pt-edit-history` visible, its top at or below the board's and the status panel's bottom; at least one row from the hand-written history | a type registered but not placed, or placed beside the board; flip: drop it from one profile → that profile's assertion fails |
| B2 three entries render three collapsed rows newest first; a click expands one | spec with entries dated 28, 30, 29 Oct | three `details.dv-edit-details`, `li[data-edit-at]` order 30, 29, 28; none open; a real click on the first summary opens only it and shows its two change lines | rows rendered without `<details>` (the open assertion fails); rows in authored order |
| B3 (#855; Chuck 2026-11-01, §0: issue's own Test + flip plan) a clear-missing-work change has no ticket | one entry [clear-missing-work on door, add EX-1 on door] | summary first "Missing work cleared from Door"; expanded, the clear line has data-edit-op clear-missing-work, no data-edit-ticket, no `.dv-edit-ticket`, op "Missing work cleared from", carrier "Door"; the add line keeps its ticket | ticket-first prose for a clear; the entry rejected as malformed (no row) |
| B4 (#974; Chuck 2026-11-04: name + agent tag + time + summary, expands to its ticket changes) an agent entry row | entries: board edit 4 Nov 09:00 (Alex), agent entry 4 Nov 10:00 with two ticket changes, agent entry 4 Nov 11:00 with none | newest first; the 11:00 row is `li[data-edit-at]` with `.dv-edit-who` "Chuck", `.dv-edit-agent` "agent", `.dv-edit-first` its summary, no `.dv-edit-count` and no `details`; the 10:00 row is a collapsed `details` whose summary shows the same parts and a real click opens its two change lines; the board row keeps its count and no agent tag | rows that show the first change instead of the summary; an agent tag on board rows; an empty expandable row |
*/
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';

async function build(server,name,spec){
 const file=path.join(server.root,name+'.json'),out=path.join(server.root,name+'.html');
 await writeFile(file,JSON.stringify(spec));
 execFileSync('python3',[path.join(repo,'tools/inject.py'),file,path.join(repo,'template/flowview.html'),out,'--timeline','none']);
 return server.origin+'/'+name+'.html';
}
const bottom=box=>box.y+box.height;

test('B1 the live-status example places the Edit history panel below the board in every host profile',async({page,server},info)=>{
 await page.setViewportSize({width:1440,height:1000});
 const spec=JSON.parse(await readFile(path.join(repo,'examples/live-status/live-status.spec.json'),'utf8'));
 const url=await build(server,'edit-history-example',spec);
 for(const profile of ['default','backstage','confluence']){
  await page.goto(url+(profile==='default'?'':'?layout='+profile));
  const root=page.locator('.docview'),panel=root.locator('.pwidget.pt-edit-history'),status=root.locator('.pwidget.pt-live-status'),board=root.locator('.board').first();
  await expect(panel,profile).toBeVisible();await expect(panel.locator('.ptitle'),profile).toContainText('Edit history');
  await expect(status,profile).toBeVisible();await expect(board,profile).toBeVisible();
  const [panelBox,statusBox,boardBox]=await Promise.all([panel.boundingBox(),status.boundingBox(),board.boundingBox()]);
  expect(panelBox.y,profile+': below the board').toBeGreaterThanOrEqual(bottom(boardBox)-1);
  expect(panelBox.y,profile+': below the status panel').toBeGreaterThanOrEqual(bottom(statusBox)-1);
  await expect(panel.locator('details.dv-edit-details').first(),profile+': hand-written history renders').toBeVisible();
  await panel.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('edit-history-'+profile+'.png')});
 }
});

test('B2 three entries render three collapsed rows newest first and a click expands one',async({page,server},info)=>{
 await page.setViewportSize({width:1440,height:1000});
 const spec={page:{title:'Edit history rows',tracking:{jira:{site:'https://acme.atlassian.net'}},
  editHistory:[
   {at:'2026-10-28T09:00:00Z',by:{id:'u_bo',name:'Bo'},changes:[{op:'remove',ticket:'EX-3',edge:['door','cloud'],label:'Door → Cloud'}]},
   {at:'2026-10-30T16:23:15Z',by:{id:'u_alex',name:'Alex'},changes:[{op:'add',ticket:'EX-1',node:'payment-api',label:'Payment API'},{op:'remove',ticket:'EX-2',node:'door',label:'Door'}]},
   {at:'2026-10-29T12:00:00Z',by:{name:'Cam'},changes:[{op:'add',ticket:'EX-2',node:'door'}]}],
  sections:[{id:'board',heading:'Board',diagram:{nodes:{'payment-api':{title:'Payment API',tickets:['EX-1']},door:{title:'Door'},cloud:{title:'Cloud',tickets:['EX-3']}},rows:[['door','payment-api','cloud']],edges:[{from:'door',to:'cloud',label:'sync'}],
   panels:[{id:'status',type:'live-status',title:'Epic status'},{id:'history',type:'edit-history',title:'Edit history'}]}}]}};
 await page.goto(await build(server,'edit-history-rows',spec));
 const root=page.locator('.docview'),panel=root.locator('.pwidget.pt-edit-history'),rows=panel.locator('details.dv-edit-details');
 await expect(panel).toBeVisible();await expect(rows).toHaveCount(3);
 expect(await panel.locator('li[data-edit-at]').evaluateAll(items=>items.map(item=>item.getAttribute('data-edit-at')))).toEqual(['2026-10-30T16:23:15Z','2026-10-29T12:00:00Z','2026-10-28T09:00:00Z']);
 for(let i=0;i<3;i++)await expect(rows.nth(i),'row '+i+' collapsed').not.toHaveAttribute('open',/.*/);
 const first=rows.nth(0),summary=first.locator('summary.dv-edit-summary');
 await expect(summary.locator('.dv-edit-who')).toHaveText('Alex');await expect(summary.locator('.dv-edit-count')).toHaveText('2 changes');
 await expect(summary.locator('.dv-edit-first')).toHaveText('EX-1 added to Payment API');
 await expect(summary.locator('time.dv-edit-when')).toHaveAttribute('datetime','2026-10-30T16:23:15Z');
 await expect(first.locator('li.dv-edit-change')).toHaveCount(2);await expect(first.locator('li.dv-edit-change').first()).toBeHidden();
 await summary.click();
 await expect(first).toHaveAttribute('open',/.*/);
 const changes=first.locator('li.dv-edit-change');await expect(changes).toHaveCount(2);
 await expect(changes.nth(0)).toBeVisible();await expect(changes.nth(0)).toHaveAttribute('data-edit-op','add');await expect(changes.nth(0)).toHaveAttribute('data-edit-ticket','EX-1');
 await expect(changes.nth(0).locator('.dv-edit-carrier')).toHaveText('Payment API');
 await expect(changes.nth(1)).toHaveAttribute('data-edit-op','remove');await expect(changes.nth(1).locator('.dv-edit-carrier')).toHaveText('Door');
 await expect(rows.nth(1)).not.toHaveAttribute('open',/.*/);await expect(rows.nth(2)).not.toHaveAttribute('open',/.*/);
 await expect(rows.nth(2).locator('.dv-edit-first')).toHaveText('EX-3 removed from Door → Cloud');
 await expect(rows.nth(1).locator('.dv-edit-who')).toHaveText('Cam');await expect(rows.nth(1).locator('.dv-edit-first')).toHaveText('EX-2 added to door');
 await page.screenshot({path:info.outputPath('edit-history-expanded.png')});
});

test('B3 a clear-missing-work change reads "Missing work cleared from" its carrier with no ticket',async({page,server})=>{
 await page.setViewportSize({width:1440,height:1000});
 const spec={page:{title:'Edit history clear',tracking:{jira:{site:'https://acme.atlassian.net'}},
  editHistory:[{at:'2026-11-01T10:00:00Z',by:{name:'Alex'},changes:[{op:'clear-missing-work',node:'door',label:'Door'},{op:'add',ticket:'EX-1',node:'door',label:'Door'}]}],
  sections:[{id:'board',heading:'Board',diagram:{nodes:{door:{title:'Door',tickets:['EX-1']},cloud:{title:'Cloud'}},rows:[['door','cloud']],edges:[{from:'door',to:'cloud',label:'sync'}],
   panels:[{id:'status',type:'live-status',title:'Epic status'},{id:'history',type:'edit-history',title:'Edit history'}]}}]}};
 await page.goto(await build(server,'edit-history-clear',spec));
 const panel=page.locator('.docview .pwidget.pt-edit-history'),rows=panel.locator('details.dv-edit-details');
 await expect(rows).toHaveCount(1);
 const summary=rows.first().locator('summary.dv-edit-summary');
 await expect(summary.locator('.dv-edit-first')).toHaveText('Missing work cleared from Door');await expect(summary.locator('.dv-edit-count')).toHaveText('2 changes');
 await summary.click();await expect(rows.first()).toHaveAttribute('open',/.*/);
 const changes=rows.first().locator('li.dv-edit-change');await expect(changes).toHaveCount(2);
 const clear=changes.nth(0);await expect(clear).toBeVisible();
 await expect(clear).toHaveAttribute('data-edit-op','clear-missing-work');await expect(clear).not.toHaveAttribute('data-edit-ticket',/.*/);
 await expect(clear.locator('.dv-edit-ticket')).toHaveCount(0);
 await expect(clear.locator('.dv-edit-op')).toHaveText('Missing work cleared from');await expect(clear.locator('.dv-edit-carrier')).toHaveText('Door');
 await expect(changes.nth(1)).toHaveAttribute('data-edit-ticket','EX-1');await expect(changes.nth(1).locator('.dv-edit-op')).toHaveText('added to');
});

test('B4 an agent entry shows the editor, an agent tag and its summary, and expands to its ticket changes',async({page,server})=>{
 await page.setViewportSize({width:1440,height:1000});
 const spec={page:{title:'Edit history agent',tracking:{jira:{site:'https://acme.atlassian.net'}},
  editHistory:[
   {at:'2026-11-04T09:00:00Z',by:{name:'Alex'},changes:[{op:'add',ticket:'EX-1',node:'door',label:'Door'}]},
   {at:'2026-11-04T10:00:00Z',by:{name:'Chuck'},source:'agent',summary:'Added 2 nodes, moved 1 ticket',changes:[{op:'remove',ticket:'EX-2',node:'door',label:'Door'},{op:'add',ticket:'EX-2',node:'cloud',label:'Cloud'}]},
   {at:'2026-11-04T11:00:00Z',by:{name:'Chuck'},source:'agent',summary:'Renamed the sync connection',changes:[]}],
  sections:[{id:'board',heading:'Board',diagram:{nodes:{door:{title:'Door',tickets:['EX-1']},cloud:{title:'Cloud',tickets:['EX-2']}},rows:[['door','cloud']],edges:[{from:'door',to:'cloud',label:'sync'}],
   panels:[{id:'status',type:'live-status',title:'Epic status'},{id:'history',type:'edit-history',title:'Edit history'}]}}]}};
 await page.goto(await build(server,'edit-history-agent',spec));
 const panel=page.locator('.docview .pwidget.pt-edit-history'),items=panel.locator('li[data-edit-at]');
 await expect(items).toHaveCount(3);
 expect(await items.evaluateAll(list=>list.map(item=>item.getAttribute('data-edit-at')))).toEqual(['2026-11-04T11:00:00Z','2026-11-04T10:00:00Z','2026-11-04T09:00:00Z']);
 const bare=items.nth(0);
 await expect(bare.locator('details')).toHaveCount(0);
 await expect(bare.locator('.dv-edit-who')).toHaveText('Chuck');await expect(bare.locator('.dv-edit-agent')).toHaveText('agent');
 await expect(bare.locator('.dv-edit-first')).toHaveText('Renamed the sync connection');await expect(bare.locator('.dv-edit-count')).toHaveCount(0);
 await expect(bare.locator('time.dv-edit-when')).toHaveAttribute('datetime','2026-11-04T11:00:00Z');
 const moved=items.nth(1),details=moved.locator('details.dv-edit-details'),summary=details.locator('summary.dv-edit-summary');
 await expect(details).toHaveCount(1);await expect(details).not.toHaveAttribute('open',/.*/);
 await expect(summary.locator('.dv-edit-who')).toHaveText('Chuck');await expect(summary.locator('.dv-edit-agent')).toHaveText('agent');
 await expect(summary.locator('.dv-edit-first')).toHaveText('Added 2 nodes, moved 1 ticket');await expect(summary.locator('.dv-edit-count')).toHaveCount(0);
 await expect(moved.locator('li.dv-edit-change').first()).toBeHidden();
 await summary.click();await expect(details).toHaveAttribute('open',/.*/);
 const changes=moved.locator('li.dv-edit-change');await expect(changes).toHaveCount(2);await expect(changes.nth(0)).toBeVisible();
 await expect(changes.nth(0)).toHaveAttribute('data-edit-op','remove');await expect(changes.nth(0).locator('.dv-edit-carrier')).toHaveText('Door');
 await expect(changes.nth(1)).toHaveAttribute('data-edit-op','add');await expect(changes.nth(1).locator('.dv-edit-carrier')).toHaveText('Cloud');
 const board=items.nth(2);
 await expect(board.locator('.dv-edit-agent')).toHaveCount(0);await expect(board.locator('.dv-edit-count')).toHaveText('1 change');
 await expect(board.locator('.dv-edit-first')).toHaveText('EX-1 added to Door');
});
