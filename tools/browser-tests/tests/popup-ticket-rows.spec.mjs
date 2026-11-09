import {writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
/* #1198 (company round 5, Chuck 2026-11-09): in the Jira view's popup each ticket is one row: the key on the left, the
   title on one line (the full title in its tooltip) and the status chip at the right, with no owner. #1213 review: only the
   title shrinks; staleness, the PR count and PR links are never clipped, and links wrap onto a second line inside the row
   when they do not fit, with the chip still at the top right. Dates are relative to now (a ticket goes stale after 7 days).
   Desktop only. */
const DAY=86400000,ago=days=>new Date(Date.now()-days*DAY).toISOString();
const MAP={
 'EE-1':{state:'done',title:'Place the order through the checkout service with retries, idempotency keys and a saga for refunds',assignee:'Pat Lee',updatedAt:ago(1)},
 'EE-2':{state:'active',title:'Charge the card',assignee:'Sam Roe',updatedAt:ago(1)},
 'EE-3':{state:'todo',title:'Send the confirmation email',assignee:'Kim Poe',updatedAt:ago(1)}};
const prLinks=count=>Array.from({length:count},(_,i)=>({url:'https://github.com/acme/checkout/pull/'+(i+1)}));
function spec(tickets){
 return {page:{title:'Checkout work',tracking:{jira:{site:'https://acme.atlassian.net'}},sections:[{id:'main',heading:'Checkout',
  diagram:{nodes:{checkout:{title:'Checkout service',tickets},payment:{title:'Payment service'}},rows:[['checkout','payment']],edges:[{from:'checkout',to:'payment',label:'Charge'}],
   panels:[{id:'status',type:'live-status',title:'Epic status'}]}}]}};
}
async function openPopup(page,server,map,tickets){
 await page.setViewportSize({width:1440,height:900});
 await page.addInitScript(map=>{localStorage.setItem('dv_tour_v1','done');window.flowviewLiveStatus={provider:async()=>map};},map);
 const file=path.join(server.root,'popup-ticket-rows.json'),out=path.join(server.root,'popup-ticket-rows.html');await writeFile(file,JSON.stringify(spec(tickets)));
 execFileSync('python3',[path.join(repo,'tools/inject.py'),file,path.join(repo,'template/flowview.html'),out]);await page.goto(server.origin+'/popup-ticket-rows.html');
 const root=page.locator('#docview'),card=root.locator('g.node[data-dv-node="checkout"] .card');await expect(card).toHaveClass(/dv-live-/);
 await card.scrollIntoViewIfNeeded();const box=await card.boundingBox();await card.click({position:{x:box.width-6,y:box.height/2}});
 const pop=root.locator('.dv-live-popover');await expect(pop).toBeVisible();return pop;
}
// Row geometry: the chip on the key's line inside the row, and every stale/count/link part fully inside the row and the
// popover, not cut by any clipping ancestor up to the popover, and the topmost element at its centre (nothing covers it).
const geometry=row=>row.evaluate(el=>{
 const box=n=>n.getBoundingClientRect(),r=box(el),pop=box(el.closest('.dv-live-popover')),key=box(el.querySelector('.nbacklink')),chip=box(el.querySelector('.dv-live-ticket-state')),title=el.querySelector('.dv-live-ticket-title');
 const parts=Array.from(el.querySelectorAll('.dv-live-stale-detail,.dv-live-ticket-prs,.dv-live-ticket-links a'));
 const inside=b=>b.width>0 && b.left>=r.left-1 && b.right<=r.right+1 && b.left>=pop.left && b.right<=pop.right && b.top>=r.top-1 && b.bottom<=r.bottom+1;
 const unclipped=(n,b)=>{for(let a=n.parentElement;a;a=a.parentElement){const cs=getComputedStyle(a);if(cs.overflowX!=='visible' || cs.overflowY!=='visible'){const ab=box(a);if(b.left<ab.left-.5 || b.right>ab.right+.5 || b.top<ab.top-.5 || b.bottom>ab.bottom+.5)return false;}if(a.classList.contains('dv-live-popover'))break;}return true;};
 const topmost=(n,b)=>{const hit=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2);return !!hit && (hit===n || n.contains(hit));};
 const shown=n=>{const b=box(n);return inside(b) && unclipped(n,b) && topmost(n,b);};
 return {height:r.height,keyTop:key.top,chipTop:chip.top,chipRight:chip.right,right:r.right,titleWidth:title?box(title).width:0,titleClipped:title?title.scrollWidth>title.clientWidth:false,
  rowFits:el.scrollWidth<=el.clientWidth+1,parts:parts.map(n=>({cls:n.className || n.tagName,inside:shown(n),width:Math.round(box(n).width),text:n.textContent})),
  textClipped:parts.filter(n=>n.matches('.dv-live-stale-detail,.dv-live-ticket-prs')).some(n=>n.scrollWidth>n.clientWidth+1)};
});
test('#1198 at 1440x900 the Jira popup shows each ticket on one line: key, title, status chip, no owner',async({page,server},info)=>{
 const pop=await openPopup(page,server,MAP,['EE-1','EE-2','EE-3']),rows=pop.locator('.dv-live-ticket');await expect(rows).toHaveCount(3);
 await expect(pop).not.toContainText('Pat Lee');
 for(const key of ['EE-1','EE-2','EE-3']){
  const row=pop.locator('.dv-live-ticket[data-live-ticket="'+key+'"]'),title=row.locator('.dv-live-ticket-title');
  await expect(title).toHaveAttribute('title',MAP[key].title);
  const g=await row.evaluate(el=>{const r=el.getBoundingClientRect(),key=el.querySelector('a,.nbacklink').getBoundingClientRect(),title=el.querySelector('.dv-live-ticket-title'),t=title.getBoundingClientRect(),chip=el.querySelector('.dv-live-ticket-state').getBoundingClientRect(),line=parseFloat(getComputedStyle(title).lineHeight) || 16;
   return {height:r.height,line,keyRight:key.right,titleLeft:t.left,titleRight:t.right,titleHeight:t.height,chipLeft:chip.left,mid:[key.top+key.height/2,t.top+t.height/2,chip.top+chip.height/2],clipped:title.scrollWidth>title.clientWidth};});
  expect(g.titleHeight,key+': the title is one line').toBeLessThan(g.line*1.5);
  expect(g.titleLeft,key+': the title follows the key').toBeGreaterThanOrEqual(g.keyRight);expect(g.chipLeft,key+': the chip is at the right').toBeGreaterThanOrEqual(g.titleRight);
  expect(Math.max(...g.mid)-Math.min(...g.mid),key+': key, title and chip share one line').toBeLessThan(6);
  expect(g.height,key+': one row').toBeLessThan(46);
  if(key==='EE-1')expect(g.clipped,'the long title is cut to one line').toBe(true);
 }
 await page.screenshot({path:info.outputPath('popup-ticket-rows-1440x900.png')});
});
test('#1198 a long title with one PR stays on one line and shows its PR count and link',async({page,server},info)=>{
 const map={...MAP,'EE-9':{state:'active',title:'Reconcile the payment ledger after a partial capture across two currencies and three regions',updatedAt:ago(1),prs:{count:1,state:'open',links:prLinks(1)}}};
 const pop=await openPopup(page,server,map,['EE-1','EE-9']),row=pop.locator('.dv-live-ticket[data-live-ticket="EE-9"]');
 await expect(row.locator('.dv-live-ticket-prs')).toHaveText('PRs: 1 open');await expect(row.locator('.dv-live-ticket-links a')).toHaveCount(1);
 const g=await geometry(row);
 expect(g.height,'one line (a second line would add 28px)').toBeLessThan(46);expect(g.titleClipped,'only the title shrinks').toBe(true);
 expect(g.parts.every(p=>p.inside),'the count and the link are fully visible: '+JSON.stringify(g.parts)).toBe(true);expect(g.rowFits).toBe(true);expect(g.textClipped).toBe(false);
 expect(Math.abs(g.chipTop-g.keyTop),'the chip is on the key\'s line').toBeLessThan(6);expect(g.chipRight).toBeLessThanOrEqual(g.right+1);
 await row.screenshot({path:info.outputPath('popup-row-one-pr.png')});
});
test('#1198 a 3-PR row with an ordinary key (CHECKOUT-1234) stays on one line with every link visible',async({page,server},info)=>{
 const map={...MAP,'CHECKOUT-1234':{state:'active',title:'Capture the authorised payment',updatedAt:ago(1),prs:{count:3,state:'open',links:prLinks(3)}}};
 const pop=await openPopup(page,server,map,['EE-1','CHECKOUT-1234']),row=pop.locator('.dv-live-ticket[data-live-ticket="CHECKOUT-1234"]');
 await expect(row.locator('.dv-live-ticket-prs')).toHaveText('PRs: 3 open');await expect(row.locator('.dv-live-ticket-links a')).toHaveCount(3);
 const g=await geometry(row);
 expect(g.height,'one line (a second line would add 28px)').toBeLessThan(46);
 expect(g.parts.every(p=>p.inside),'the count and all three links are fully visible: '+JSON.stringify(g.parts)).toBe(true);expect(g.rowFits).toBe(true);expect(g.textClipped).toBe(false);
 expect(g.parts.filter(p=>p.cls.includes('dv-live-pr-link')).every(p=>p.width<=23),'each PR icon is a 22px box').toBe(true);
 expect(Math.abs(g.chipTop-g.keyTop),'the chip is on the key\'s line').toBeLessThan(6);expect(g.chipRight).toBeLessThanOrEqual(g.right+1);
 await row.screenshot({path:info.outputPath('popup-row-three-prs.png')});
});
test('#1198 a crowded ticket row (eight PR links, PR count, stale marker, long key) shows every part, links wrapping inside the row',async({page,server},info)=>{
 const map={...MAP,'CHECKOUTPLATFORM-12345':{state:'active',title:'Retry the payment capture after a gateway timeout',updatedAt:ago(15),prs:{count:8,state:'open',links:prLinks(8)}}};
 const pop=await openPopup(page,server,map,['EE-1','CHECKOUTPLATFORM-12345']),row=pop.locator('.dv-live-ticket[data-live-ticket="CHECKOUTPLATFORM-12345"]');
 await expect(row.locator('.dv-live-stale-detail')).toHaveText('no activity 15 d');await expect(row.locator('.dv-live-ticket-prs')).toHaveText('PRs: 8 open');await expect(row.locator('.dv-live-ticket-links a')).toHaveCount(8);
 const g=await geometry(row);
 expect(g.parts.length).toBe(10);expect(g.parts.every(p=>p.inside),'the stale marker, the count and all eight links are fully visible: '+JSON.stringify(g.parts)).toBe(true);
 expect(g.rowFits,'nothing overflows the row').toBe(true);expect(g.textClipped).toBe(false);
 expect(Math.abs(g.chipTop-g.keyTop),'the chip stays on the key\'s line, at the top right').toBeLessThan(6);expect(g.chipRight).toBeLessThanOrEqual(g.right+1);
 expect(g.titleWidth,'the title keeps its minimum (56px)').toBeGreaterThanOrEqual(55);
 await row.screenshot({path:info.outputPath('popup-row-crowded.png')});
});
