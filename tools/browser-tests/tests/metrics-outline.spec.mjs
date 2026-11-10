/* #1294: the Metrics overlay's Outline display style. Contract source: #1294 "Ask" and
   "Acceptance" (Chuck 2026-11-10, revised mockup approved the same day).

| row | fixture | assertion (scoped) | rejects |
|---|---|---|---|
| O1 toggle + outlines | cueSpec (Jira board, local ingest node, ingest->app and app->push edges, imported shared::api node and shared::api->shared::store edge) | "Metrics style" group shows only while the overlay is on, Cards pressed by default; Outline draws no visible card, one outline per bound carrier (local and imported) whose data-metric-state equals that carrier's Cards-mode card state, stroked in the verdict colour; a node ring lies outside the node's card | cards left visible; a missing imported outline; Jira colour instead of the verdict colour |
| O2 hover | same | hovering a carrier shows its card beside it without covering the hovered point or node; leaving hides it | no card, or a card over the carrier |
| O3 keyboard | same | focus on the outline shows the card; Enter opens the detail popover; Esc closes it and focus returns to the outline | no keyboard path |
| O4 click | same | a click on a connection opens the detail popover from the outline | click does nothing |
| O5 remembered | same, remounted | Outline is kept for this board after a remount; Cards restores the cards and removes the outlines | the choice lost, or outlines left behind |
| O6 phone tap | same at 390 px with touch | a first tap shows the card only; a second tap opens the detail; a tap on the shown card opens the detail | tap opens the popover at once, or never |
Every DOM measurement starts at #host's shadowRoot (the native viewer renders inside it).
Flip: without the Outline style the "Metrics style" group does not exist, so O1-O6 fail at the toggle. */
import {test,expect} from '../helpers/test.mjs';
import {mountCues} from '../helpers/telemetry-cards.mjs';

const EDGES=['ingest->app','app->push','shared::api->shared::store'],NODES=['ingest','shared::api'];
// Green healthy, amber degraded, red breach, grey no data (#1294).
const COLOUR={held:'rgb(35, 160, 71)',flowing:'rgb(35, 160, 71)',failing:'rgb(200, 139, 20)',error:'rgb(214, 75, 104)',waiting:'rgb(135, 146, 158)'};

async function overlayOn(root){
 const section=root.locator('#section-main'),panel=section.locator('.pt-live-status'),style=panel.getByRole('group',{name:'Metrics style',exact:true});
 await expect(style).toHaveCount(0);
 await panel.getByRole('switch',{name:'Metrics overlay',exact:true}).click();
 await expect(section.locator('.dv-live-metrics-connection')).toHaveAttribute('data-state','connected');
 await expect(style).toBeVisible();
 return {section,panel,style,cards:style.getByRole('button',{name:'Cards',exact:true}),outline:style.getByRole('button',{name:'Outline',exact:true})};
}
// The shadow-root view of every card and outline: what the page itself sees.
async function canvas(page){
 return page.evaluate(()=>{
  const scope=document.querySelector('#host').shadowRoot,svg=scope.querySelector('#section-main svg');
  const rect=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};};
  const shown=el=>{const s=getComputedStyle(el);return s.display!=='none' && s.visibility!=='hidden' && Number(s.opacity)>0 && el.getBoundingClientRect().width>0;};
  const cards=Array.from(svg.querySelectorAll('.dv-metrics-card')).map(c=>({id:c.dataset.metricsCard,state:c.dataset.metricState || null,shown:shown(c),rect:rect(c)}));
  const outlines=Array.from(svg.querySelectorAll('.dv-metrics-outline')).map(o=>{
   const node=o.closest('g.node[data-dv-node]'),card=node && node.querySelector('.card');
   return {id:o.dataset.metricsCarrier,kind:node?'node':'edge',state:o.dataset.metricState || null,stroke:getComputedStyle(o).stroke,shown:shown(o),rect:rect(o),card:card?rect(card):null};
  });
  return {cards,outlines,active:scope.activeElement && scope.activeElement.dataset ? scope.activeElement.dataset.metricsCarrier || null : null};
 });
}
// Screen point on a bound connection's outline (its midpoint) or a node ring's top edge.
async function point(page,id){
 return page.evaluate(id=>{
  const scope=document.querySelector('#host').shadowRoot,o=scope.querySelector('.dv-metrics-outline[data-metrics-carrier="'+CSS.escape(id)+'"]');
  if(!o)return null;
  if(o.tagName.toLowerCase()==='path'){const p=o.getPointAtLength(o.getTotalLength()/2),m=o.getScreenCTM();return {x:m.a*p.x+m.c*p.y+m.e,y:m.b*p.x+m.d*p.y+m.f};}
  const r=o.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+1};
 },id);
}
const hit=(a,b,pad=0)=>a.x<b.x+b.w+pad && a.x+a.w>b.x-pad && a.y<b.y+b.h+pad && a.y+a.h>b.y-pad;

test('O1 Cards | Outline: Cards by default; Outline draws verdict-colour outlines and no cards for local and imported carriers',async({page,server})=>{
 const {root}=await mountCues(page,server),{section,style,cards,outline}=await overlayOn(root);
 await expect(cards).toHaveAttribute('aria-pressed','true');await expect(outline).toHaveAttribute('aria-pressed','false');
 const before=await canvas(page);
 expect(before.cards.filter(c=>c.shown).map(c=>c.id).sort()).toEqual([...EDGES].sort());
 expect(before.outlines).toEqual([]);
 const states=Object.fromEntries(before.cards.map(c=>[c.id,c.state]));
 await outline.click();await expect(outline).toHaveAttribute('aria-pressed','true');await expect(cards).toHaveAttribute('aria-pressed','false');
 await expect.poll(async()=>(await canvas(page)).outlines.length).toBe(EDGES.length+NODES.length);
 const after=await canvas(page);
 expect(after.cards.filter(c=>c.shown),'Outline draws no card').toEqual([]);
 expect(after.outlines.filter(o=>o.kind==='edge').map(o=>o.id).sort()).toEqual([...EDGES].sort());
 expect(after.outlines.filter(o=>o.kind==='node').map(o=>o.id).sort()).toEqual([...NODES].sort());
 for(const o of after.outlines){
  expect(o.shown,o.id+' outline visible').toBe(true);
  expect(Object.keys(COLOUR),o.id+' metric state').toContain(o.state);
  if(o.kind==='edge')expect(o.state,o.id+' outline state equals its Cards-mode card').toBe(states[o.id]);
  expect(o.stroke,o.id+' verdict colour').toBe(COLOUR[o.state]);
  if(o.kind==='node')expect(o.rect.x<o.card.x-3 && o.rect.y<o.card.y-3 && o.rect.x+o.rect.w>o.card.x+o.card.w+3 && o.rect.y+o.rect.h>o.card.y+o.card.h+3,o.id+' ring outside the node border').toBe(true);
 }
 // The toggle leaves with the overlay.
 await section.getByRole('switch',{name:'Metrics overlay',exact:true}).click();await expect(style).toBeHidden();
 expect((await canvas(page)).outlines).toEqual([]);
});

test('O2 hover shows the carrier card beside it; leaving hides it',async({page,server})=>{
 const {root}=await mountCues(page,server),{outline}=await overlayOn(root);await outline.click();
 await expect.poll(async()=>(await canvas(page)).outlines.length).toBe(EDGES.length+NODES.length);
 for(const id of ['ingest->app','shared::api->shared::store','shared::api','ingest']){
  const p=await point(page,id);expect(p,id+' has an outline').not.toBeNull();
  await page.mouse.move(p.x,p.y);
  await expect.poll(async()=>(await canvas(page)).cards.filter(c=>c.shown).map(c=>c.id),id+' card on hover').toEqual([id]);
  const now=await canvas(page),card=now.cards.find(c=>c.id===id),o=now.outlines.find(x=>x.id===id);
  expect(hit(card.rect,{x:p.x-4,y:p.y-4,w:8,h:8}),id+' card never covers the hovered point').toBe(false);
  if(o.kind==='node')expect(hit(card.rect,o.card),id+' card never covers its node').toBe(false);
  await page.mouse.move(2,2);
  await expect.poll(async()=>(await canvas(page)).cards.filter(c=>c.shown).length,id+' card hides on leave').toBe(0);
 }
});

test('O3 focus shows the card; Enter opens the detail; Esc closes it and keeps focus',async({page,server})=>{
 const {root}=await mountCues(page,server),{section,outline}=await overlayOn(root);await outline.click();
 await expect.poll(async()=>(await canvas(page)).outlines.length).toBe(EDGES.length+NODES.length);
 const pop=root.locator('.dv-live-popover');
 for(const id of ['ingest','shared::api->shared::store']){
  const target=section.locator('.dv-metrics-outline[data-metrics-carrier="'+id+'"]');
  await expect(target).toHaveAttribute('tabindex','0');await expect(target).toHaveAttribute('role','button');
  await target.focus();
  await expect.poll(async()=>(await canvas(page)).active).toBe(id);
  await expect.poll(async()=>(await canvas(page)).cards.filter(c=>c.shown).map(c=>c.id),id+' card on focus').toEqual([id]);
  await page.keyboard.press('Enter');await expect(pop).toBeVisible();await expect(pop).toContainText('Evidence');
  await expect(target).toHaveAttribute('aria-expanded','true');
  await page.keyboard.press('Escape');await expect(pop).toBeHidden();
  await expect.poll(async()=>(await canvas(page)).active,id+' focus returns').toBe(id);
 }
});

test('O4 a click on a connection opens the detail popover',async({page,server})=>{
 const {root}=await mountCues(page,server),{section,outline}=await overlayOn(root);await outline.click();
 await expect.poll(async()=>(await canvas(page)).outlines.length).toBe(EDGES.length+NODES.length);
 const pop=root.locator('.dv-live-popover');
 for(const id of ['app->push','shared::api->shared::store']){
  const p=await point(page,id);await page.mouse.click(p.x,p.y);
  await expect(pop).toBeVisible();await expect(pop).toContainText('Evidence');
  await expect(section.locator('.dv-metrics-outline[data-metrics-carrier="'+id+'"]')).toHaveAttribute('aria-expanded','true');
  await page.keyboard.press('Escape');await expect(pop).toBeHidden();
 }
});

test('O5 the style is remembered for this board; Cards restores the cards',async({page,server})=>{
 const {root}=await mountCues(page,server);let ui=await overlayOn(root);await ui.outline.click();
 await expect.poll(async()=>(await canvas(page)).outlines.length).toBe(EDGES.length+NODES.length);
 await page.evaluate(()=>{window.viewer.destroy();});
 const {root:again}=await mountCues(page,server);ui=await overlayOn(again);
 await expect(ui.outline).toHaveAttribute('aria-pressed','true');
 await expect.poll(async()=>(await canvas(page)).outlines.length).toBe(EDGES.length+NODES.length);
 expect((await canvas(page)).cards.filter(c=>c.shown)).toEqual([]);
 await ui.cards.click();await expect(ui.cards).toHaveAttribute('aria-pressed','true');
 await expect.poll(async()=>(await canvas(page)).cards.filter(c=>c.shown).map(c=>c.id).sort()).toEqual([...EDGES].sort());
 expect((await canvas(page)).outlines).toEqual([]);
});

test.describe('O6 phone width',()=>{
 test.use({hasTouch:true});
 test('a first tap shows the card; a second tap or a tap on the card opens the detail',async({page,server})=>{
  const {root}=await mountCues(page,server),{outline}=await overlayOn(root);await outline.click();
  await page.setViewportSize({width:390,height:844});
  await expect.poll(async()=>(await canvas(page)).outlines.length).toBe(EDGES.length+NODES.length);
  const pop=root.locator('.dv-live-popover');
  for(const [id,second] of [['ingest->app','carrier'],['shared::api->shared::store','card']]){
   await page.evaluate(id=>{const o=document.querySelector('#host').shadowRoot.querySelector('.dv-metrics-outline[data-metrics-carrier="'+CSS.escape(id)+'"]');o.scrollIntoView({block:'center',inline:'center'});},id);
   const p=await point(page,id);await page.touchscreen.tap(p.x,p.y);
   await expect.poll(async()=>(await canvas(page)).cards.filter(c=>c.shown).map(c=>c.id),id+' first tap shows the card').toEqual([id]);
   await expect(pop).toBeHidden();
   if(second==='carrier')await page.touchscreen.tap(p.x,p.y);
   else{const card=(await canvas(page)).cards.find(c=>c.id===id).rect;await page.touchscreen.tap(card.x+card.w/2,card.y+card.h/2);}
   await expect(pop).toBeVisible();await expect(pop).toContainText('Evidence');
   await page.keyboard.press('Escape');await expect(pop).toBeHidden();
  }
 });
});
