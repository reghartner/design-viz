import {writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
/* #1198 (company round 5, Chuck 2026-11-09): in the Jira view's popup each ticket is one row: the key on the left, the
   title on one line (the full title in its tooltip) and the status chip at the right, with no owner. Desktop only. */
const MAP={
 'EE-1':{state:'done',title:'Place the order through the checkout service with retries, idempotency keys and a saga for refunds',assignee:'Pat Lee',updatedAt:'2026-11-05T12:00:00Z'},
 'EE-2':{state:'active',title:'Charge the card',assignee:'Sam Roe',updatedAt:'2026-11-05T12:00:00Z'},
 'EE-3':{state:'todo',title:'Send the confirmation email',assignee:'Kim Poe',updatedAt:'2026-11-05T12:00:00Z'}};
function spec(){
 return {page:{title:'Checkout work',tracking:{jira:{site:'https://acme.atlassian.net'}},sections:[{id:'main',heading:'Checkout',
  diagram:{nodes:{checkout:{title:'Checkout service',tickets:['EE-1','EE-2','EE-3']},payment:{title:'Payment service'}},rows:[['checkout','payment']],edges:[{from:'checkout',to:'payment',label:'Charge'}],
   panels:[{id:'status',type:'live-status',title:'Epic status'}]}}]}};
}
test('#1198 at 1440x900 the Jira popup shows each ticket on one line: key, title, status chip, no owner',async({page,server},info)=>{
 await page.setViewportSize({width:1440,height:900});
 await page.addInitScript(map=>{localStorage.setItem('dv_tour_v1','done');window.flowviewLiveStatus={provider:async()=>map};},MAP);
 const file=path.join(server.root,'popup-ticket-rows.json'),out=path.join(server.root,'popup-ticket-rows.html');await writeFile(file,JSON.stringify(spec()));
 execFileSync('python3',[path.join(repo,'tools/inject.py'),file,path.join(repo,'template/flowview.html'),out]);await page.goto(server.origin+'/popup-ticket-rows.html');
 const root=page.locator('#docview'),card=root.locator('g.node[data-dv-node="checkout"] .card');await expect(card).toHaveClass(/dv-live-/);
 await card.scrollIntoViewIfNeeded();const box=await card.boundingBox();await card.click({position:{x:box.width-6,y:box.height/2}});
 const pop=root.locator('.dv-live-popover');await expect(pop).toBeVisible();const rows=pop.locator('.dv-live-ticket');await expect(rows).toHaveCount(3);
 await expect(pop).not.toContainText('Pat Lee');
 for(const key of ['EE-1','EE-2','EE-3']){
  const row=pop.locator('.dv-live-ticket[data-live-ticket="'+key+'"]'),title=row.locator('.dv-live-ticket-title');
  await expect(title).toHaveAttribute('title',MAP[key].title);
  const g=await row.evaluate(el=>{const r=el.getBoundingClientRect(),key=el.querySelector('a,.nbacklink').getBoundingClientRect(),title=el.querySelector('.dv-live-ticket-title'),t=title.getBoundingClientRect(),chip=el.querySelector('.dv-live-ticket-state').getBoundingClientRect(),line=parseFloat(getComputedStyle(title).lineHeight) || 16;
   return {height:r.height,line,keyRight:key.right,titleLeft:t.left,titleRight:t.right,titleHeight:t.height,chipLeft:chip.left,mid:[key.top+key.height/2,t.top+t.height/2,chip.top+chip.height/2],clipped:title.scrollWidth>title.clientWidth};});
  expect(g.titleHeight,key+': the title is one line').toBeLessThan(g.line*1.5);
  expect(g.titleLeft,key+': the title follows the key').toBeGreaterThanOrEqual(g.keyRight);expect(g.chipLeft,key+': the chip is at the right').toBeGreaterThanOrEqual(g.titleRight);
  expect(Math.max(...g.mid)-Math.min(...g.mid),key+': key, title and chip share one line').toBeLessThan(6);
  expect(g.height,key+': one row').toBeLessThan(40);
  if(key==='EE-1')expect(g.clipped,'the long title is cut to one line').toBe(true);
 }
 await page.screenshot({path:info.outputPath('popup-ticket-rows-1440x900.png')});
});
