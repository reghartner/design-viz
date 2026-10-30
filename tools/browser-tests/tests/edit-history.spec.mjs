/* #827 edit-history panel, real viewport. Contract source: #827 "How it should look and behave",
   #825 Design "Edit-history panel"; §0 ruling (Chuck 2026-10-30): the issue's own Test + flip plan.
   Node rows H1–H11 live in tests/live-status-panel.test.js and tests/live-status.test.js.
| row | fixture | assertion (scoped) | rejects |
|---|---|---|---|
| B1 the example shows the panel below the board in every layout profile | examples/live-status spec built with inject.py, opened plain and with ?layout=backstage / confluence | `.pwidget.pt-edit-history` visible, its top at or below the board's and the status panel's bottom; at least one row from the hand-written history | a type registered but not placed, or placed beside the board; flip: drop it from one profile → that profile's assertion fails |
| B2 three entries render three collapsed rows newest first; a click expands one | spec with entries dated 28, 30, 29 Oct | three `details.dv-edit-details`, `li[data-edit-at]` order 30, 29, 28; none open; a real click on the first summary opens only it and shows its two change lines | rows rendered without `<details>` (the open assertion fails); rows in authored order |
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
