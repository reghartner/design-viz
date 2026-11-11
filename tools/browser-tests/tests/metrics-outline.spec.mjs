/* #1294: the Metrics overlay's Outline display style. Contract source: #1294 "Ask" and
   "Acceptance" (Chuck 2026-11-10, revised mockup approved the same day) and review c1 of PR #1299.

| row | fixture | assertion (scoped) | rejects |
|---|---|---|---|
| O1 toggle + outlines | cueSpec (Jira board: local ingest node, ingest->app and app->push edges; imported shared::api node and shared::api->shared::store edge) | "Metrics style" shows only while the overlay is on, Cards pressed by default; Outline draws no visible card and one outline per bound carrier, local and imported, in the verdict colour of the worst signal; node rings lie outside the node border; each edge has one carrier button (the halo), not a second one on its label; step coins do not move | cards left visible; a missing imported outline; card colour instead of the verdict colour; two tab stops per edge; coins shifted by hidden cards |
| O2 hover | cueSpec plus bound carriers at the frame's right edge (push) and bottom edge (imported store), and an authored card side on ingest->app | hovering each carrier shows its card, fully visible through every clipping ancestor (elementFromPoint lands in it), not over the hovered point, its node or its own line; leaving hides it | a clipped or off-frame card; a card covering its carrier |
| O3 keyboard | same, with a query link on ingest->app | focus on the carrier button shows the card; real Tab reaches the card's link and then moves past the card; Enter opens the detail; Esc closes it and keeps focus | no keyboard path; unreachable card link |
| O4 click | cueSpec | clicking a connection, or a Jira node's ring, opens the detail popover from that carrier's button | click does nothing |
| O5 remembered | cueSpec, remounted | Outline kept after a remount; Cards restores cards and removes outlines | lost choice; leftover outlines |
| O6 phone tap | cueSpec at 390 px with touch | first tap shows the card only; a second tap, or a tap on the card, opens the detail | tap opens at once or never |
| O7 repaint keeps the open node popover | cueSpec | a node's Jira popover opened in Outline stays open on its node card, with the same text, through a metrics repaint | the ring stealing the popover or focus |
| O8 loaded detail | importedDetailSpec | Outline outlines the loaded detail's imported carriers and shows their cards | detail carriers left out |
| O9 handoff node | handoffSpec with a bound handoff node | its ring opens the ticket popover from the Jira cue that took over the node's button | a ring pointing at a cleared button |
| O10 repaint (#1324) | cueSpec | a card open on hover stays open through a metrics repaint and shows the new value; keyboard focus on a carrier stays on it | the repaint closing the card |
| O3 (c2) hidden next stop | O3 board | Tab from the card's last link skips a hidden next stop and leaves the link | a keyboard trap on the link |
Every DOM measurement starts at #host's shadowRoot (the native viewer renders inside it).
Flip: without the Outline style the "Metrics style" group does not exist, so every row fails at the toggle. */
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {test,expect} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
import {cueSpec,mountCues,mountImportedDetail,handoffSpec,CUE_JIRA,CUE_SAMPLES} from '../helpers/telemetry-cards.mjs';

const EDGES=['ingest->app','app->push','shared::api->shared::store'],NODES=['ingest','shared::api'];
// Worst signal wins: breach > degraded > no data > healthy (app->push has no traffic, so its rate limit fails).
const EXPECT={'ingest->app':'held','app->push':'failing','shared::api->shared::store':'held',ingest:'held','shared::api':'held'};
// The metrics palette tokens: --dv-metrics-proven, -amber, -error, -ghost.
const COLOUR={held:'rgb(46, 214, 0)',flowing:'rgb(46, 214, 0)',failing:'rgb(232, 163, 0)',error:'rgb(232, 23, 23)',waiting:'rgb(138, 147, 163)'};
const SERVICE={kind:'service',signals:{rate:{grafana:'sum(rate(http_requests_total[5m]))*3600',unit:'req/h'}},proof:{rate:{min:1}}};

// The cue fixture plus carriers at the frame's right (push) and bottom (imported store) edges,
// an authored card side on ingest->app, and a query link on its rate.
async function mountEdges(page,server){
 const spec=cueSpec(d=>{
  d.nodes.push.telemetry=structuredClone(SERVICE);
  d.topologyImports[0].nodeTracking.store={telemetry:structuredClone(SERVICE)};
  const edge=d.edges.find(e=>e.from==='ingest' && e.to==='app');edge.telemetry.card={side:'right'};edge.telemetry.signals.rate.links={query:'https://grafana.example/explore?q=rate'};
 });
 const samples={...structuredClone(CUE_SAMPLES),push:{signals:{rate:{value:5}}},'shared::store':{signals:{rate:{value:7}}}};
 await page.setViewportSize({width:1440,height:1000});
 await writeFile(path.join(server.root,'telemetry-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
 await writeFile(path.join(server.root,'outline-native.html'),'<div id="host"></div><script type="module">import {mountNativeViewer} from "./telemetry-native.js";window.mount=mountNativeViewer;</script>');
 await page.goto(server.origin+'/outline-native.html');await page.waitForFunction(()=>!!window.mount);
 await page.evaluate(({spec,jira,samples})=>{
  window.viewer=window.mount(document.querySelector('#host'),spec,{telemetry:{provider:()=>Promise.resolve(JSON.parse(JSON.stringify(samples)))}});
  window.viewer.controller.liveStatus.apply(jira);
 },{spec,jira:CUE_JIRA,samples});
 const root=page.locator('#host');await expect(root.locator('.pt-live-status').getByRole('button',{name:'Live',exact:true})).toBeVisible();
 return {root};
}
async function overlayOn(root,scope){
 const section=scope?root.locator(scope).first():root,panel=section.locator('.pt-live-status').first();
 await expect(panel,'the Status panel is mounted').toBeVisible();
 const style=panel.getByRole('group',{name:'Metrics style',exact:true});
 await expect(style).toHaveCount(0);
 await panel.getByRole('switch',{name:'Metrics overlay',exact:true}).click();
 await expect(section.locator('.dv-live-metrics-connection')).toHaveAttribute('data-state','connected');
 await expect(style).toBeVisible();
 return {section,panel,style,cards:style.getByRole('button',{name:'Cards',exact:true}),outline:style.getByRole('button',{name:'Outline',exact:true})};
}
// The shadow-root view of every card, outline, coin and carrier button in one board svg.
async function canvas(page,scope){
 return page.evaluate(scope=>{
  const host=document.querySelector('#host');if(!host || !host.shadowRoot)throw new Error('canvas: #host has no shadowRoot (viewer not mounted)');
  const root=host.shadowRoot,container=scope?Array.from(root.querySelectorAll(scope)).find(el=>el.getClientRects().length):root;
  if(!container)throw new Error('canvas: no visible '+scope+' in the shadow root');
  const boards=Array.from(container.querySelectorAll('svg')).filter(s=>s.querySelector('path.edge[data-dv-edge]'));
  const svg=boards.find(s=>s.querySelector('.dv-metrics-outline,.dv-metrics-card')) || boards[0];
  if(!svg)throw new Error('canvas: no board svg with edges in '+(scope || 'the shadow root'));
  const rect=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};};
  const shown=el=>{const s=getComputedStyle(el);return s.display!=='none' && s.visibility!=='hidden' && Number(s.opacity)>0 && el.getBoundingClientRect().width>0;};
  // The part of an element left after every clipping ancestor (overflow or an svg viewport), across the shadow boundary.
  function visible(el){
   let r=el.getBoundingClientRect(),box={l:r.left,t:r.top,r:r.right,b:r.bottom};
   for(let a=el.parentElement || el.getRootNode().host;a;a=a.parentElement || (a.getRootNode && a.getRootNode().host)){
    const s=getComputedStyle(a),clips=a.tagName.toLowerCase()==='svg' || [s.overflow,s.overflowX,s.overflowY].some(v=>v && v!=='visible');
    if(!clips)continue;const c=a.getBoundingClientRect();box={l:Math.max(box.l,c.left),t:Math.max(box.t,c.top),r:Math.min(box.r,c.right),b:Math.min(box.b,c.bottom)};
   }
   box.l=Math.max(box.l,0);box.t=Math.max(box.t,0);box.r=Math.min(box.r,innerWidth);box.b=Math.min(box.b,innerHeight);
   const w=Math.max(0,box.r-box.l),h=Math.max(0,box.b-box.t),cx=box.l+w/2,cy=box.t+h/2,hit=w>0 && h>0?root.elementFromPoint(cx,cy):null;
   return {fraction:r.width*r.height?w*h/(r.width*r.height):0,hit:!!(hit && el.contains(hit))};
  }
  const cards=Array.from(svg.querySelectorAll('.dv-metrics-card')).map(c=>{const v=shown(c)?visible(c):null;return {id:c.dataset.metricsCard,state:c.dataset.metricState || null,shown:shown(c),rect:rect(c),fraction:v?v.fraction:0,hit:v?v.hit:false};});
  const outlines=Array.from(svg.querySelectorAll('.dv-metrics-outline')).map(o=>{
   const node=o.closest('g.node[data-dv-node]'),card=node && node.querySelector('.card');
   let line=[];if(!node){const edge=svg.querySelector('path.edge[data-dv-edge="'+o.getAttribute('data-dv-edge')+'"]'),m=edge.getScreenCTM(),n=edge.getTotalLength();for(let at=0;at<=n;at+=8){const p=edge.getPointAtLength(at);line.push({x:m.a*p.x+m.c*p.y+m.e,y:m.b*p.x+m.d*p.y+m.f});}}
   const label=node?null:svg.querySelector('text.lbl[data-dv-edge="'+o.getAttribute('data-dv-edge')+'"]');
   return {id:o.dataset.metricsCarrier,kind:node?'node':'edge',state:o.dataset.metricState || null,stroke:getComputedStyle(o).stroke,shown:shown(o),rect:rect(o),card:card?rect(card):null,line,
    button:o.getAttribute('role')==='button' && o.getAttribute('tabindex')==='0',labelButton:!!(label && label.getAttribute('role')==='button')};
  });
  // Coins in board units, so a frame change that rescales the board does not count as a move.
  const inv=svg.getScreenCTM().inverse(),coins=Array.from(svg.querySelectorAll('.coin')).map(c=>{const r=c.getBoundingClientRect(),p=new DOMPoint(r.x+r.width/2,r.y+r.height/2).matrixTransform(inv);return Math.round(p.x)+','+Math.round(p.y);});
  const a=root.activeElement;
  return {cards,outlines,coins,active:a?a.getAttribute('data-live-carrier') || (a.closest('.dv-metrics-card') && 'card:'+a.closest('.dv-metrics-card').dataset.metricsCard) || null:null};
 },scope);
}
// Screen point on a bound connection's halo (a third of the way along: the midpoint holds the step coin) or on a node ring's top edge.
async function point(page,id,scope){
 return page.evaluate(({id,scope})=>{
  const root=document.querySelector('#host').shadowRoot,container=scope?Array.from(root.querySelectorAll(scope)).find(el=>el.getClientRects().length):root;
  const o=container && container.querySelector('.dv-metrics-outline[data-metrics-carrier="'+CSS.escape(id)+'"]');
  if(!o)return null;
  if(o.tagName.toLowerCase()==='path'){const p=o.getPointAtLength(o.getTotalLength()/3),m=o.getScreenCTM();return {x:m.a*p.x+m.c*p.y+m.e,y:m.b*p.x+m.d*p.y+m.f};}
  const r=o.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+1};
 },{id,scope});
}
const hit=(a,b,pad=0)=>a.x<b.x+b.w+pad && a.x+a.w>b.x-pad && a.y<b.y+b.h+pad && a.y+a.h>b.y-pad;
const outlinesReady=(page,n,scope)=>expect.poll(async()=>(await canvas(page,scope)).outlines.length).toBe(n);

test('O1 Cards | Outline: Cards by default; Outline draws verdict-colour outlines and no cards for local and imported carriers',async({page,server})=>{
 const {root}=await mountCues(page,server);
 const coinsBefore=(await canvas(page)).coins;
 const {section,style,cards,outline}=await overlayOn(root);
 await expect(cards).toHaveAttribute('aria-pressed','true');await expect(outline).toHaveAttribute('aria-pressed','false');
 const before=await canvas(page);
 expect(before.cards.filter(c=>c.shown).map(c=>c.id).sort()).toEqual([...EDGES].sort());
 expect(before.outlines).toEqual([]);
 await outline.click();await expect(outline).toHaveAttribute('aria-pressed','true');await expect(cards).toHaveAttribute('aria-pressed','false');
 await outlinesReady(page,EDGES.length+NODES.length);
 const after=await canvas(page);
 expect(after.cards.filter(c=>c.shown),'Outline draws no card').toEqual([]);
 expect(after.outlines.filter(o=>o.kind==='edge').map(o=>o.id).sort()).toEqual([...EDGES].sort());
 expect(after.outlines.filter(o=>o.kind==='node').map(o=>o.id).sort()).toEqual([...NODES].sort());
 for(const o of after.outlines){
  expect(o.shown,o.id+' outline visible').toBe(true);
  expect(o.state,o.id+' worst-signal verdict').toBe(EXPECT[o.id]);
  expect(o.stroke,o.id+' verdict colour').toBe(COLOUR[o.state]);
  if(o.kind==='node')expect(o.rect.x<o.card.x-3 && o.rect.y<o.card.y-3 && o.rect.x+o.rect.w>o.card.x+o.card.w+3 && o.rect.y+o.rect.h>o.card.y+o.card.h+3,o.id+' ring outside the node border').toBe(true);
  if(o.kind==='edge'){expect(o.button,o.id+' halo is the edge button').toBe(true);expect(o.labelButton,o.id+' label is not a second button').toBe(false);}
 }
 expect(after.coins,'hidden outline cards never move step coins').toEqual(coinsBefore);
 await section.getByRole('switch',{name:'Metrics overlay',exact:true}).click();await expect(style).toBeHidden();
 expect((await canvas(page)).outlines).toEqual([]);
});

test('O2 hover shows each card fully visible beside its carrier, at the frame edges too; leaving hides it',async({page,server})=>{
 const {root}=await mountEdges(page,server),{outline}=await overlayOn(root);await outline.click();
 const ids=['ingest->app','app->push','shared::api->shared::store','ingest','shared::api','push','shared::store'];
 await outlinesReady(page,ids.length);
 for(const id of ids){
  const p=await point(page,id);expect(p,id+' has an outline').not.toBeNull();
  await page.mouse.move(p.x,p.y);
  await expect.poll(async()=>(await canvas(page)).cards.filter(c=>c.shown).map(c=>c.id),id+' card on hover').toEqual([id]);
  const now=await canvas(page),card=now.cards.find(c=>c.id===id),o=now.outlines.find(x=>x.id===id);
  expect(card.fraction,id+' card not clipped by any ancestor').toBeGreaterThan(0.99);
  expect(card.hit,id+' elementFromPoint lands in the card').toBe(true);
  expect(hit(card.rect,{x:p.x-4,y:p.y-4,w:8,h:8}),id+' card never covers the hovered point').toBe(false);
  if(o.kind==='node')expect(hit(card.rect,o.card),id+' card never covers its node').toBe(false);
  else expect(o.line.filter(q=>hit(card.rect,{x:q.x,y:q.y,w:0,h:0},-2)).length,id+' card never covers its own line').toBe(0);
  await page.mouse.move(2,2);
  await expect.poll(async()=>(await canvas(page)).cards.filter(c=>c.shown).length,id+' card hides on leave').toBe(0);
 }
});

test('O3 focus shows the card; Tab reaches its link and moves on; Enter opens the detail; Esc closes and keeps focus',async({page,server})=>{
 const {root}=await mountEdges(page,server),{section}=await overlayOn(root);await section.getByRole('button',{name:'Outline',exact:true}).click();
 await outlinesReady(page,7);
 const pop=root.locator('.dv-live-popover');
 // A Jira node keeps its own card as its one carrier button; a connection's button is its halo.
 for(const [id,target] of [['ingest',section.locator('g.node[data-dv-node="ingest"] .card')],['shared::api->shared::store',section.locator('.dv-metrics-outline[data-metrics-carrier="shared::api->shared::store"]')]]){
  await expect(target).toHaveAttribute('tabindex','0');await expect(target).toHaveAttribute('role','button');
  await target.focus();
  await expect.poll(async()=>(await canvas(page)).active).toBe(id);
  await expect.poll(async()=>(await canvas(page)).cards.filter(c=>c.shown).map(c=>c.id),id+' card on focus').toEqual([id]);
  await page.keyboard.press('Enter');await expect(pop).toBeVisible();await expect(pop).toContainText('Evidence');
  await expect(target).toHaveAttribute('aria-expanded','true');
  await page.keyboard.press('Escape');await expect(pop).toBeHidden();
  await expect.poll(async()=>(await canvas(page)).active,id+' focus returns').toBe(id);
 }
 // Real Tab presses: carrier button, then the shown card's query link, then on past the card.
 const halo=section.locator('.dv-metrics-outline[data-metrics-carrier="ingest->app"]');await halo.focus();
 await expect.poll(async()=>(await canvas(page)).cards.filter(c=>c.shown).map(c=>c.id)).toEqual(['ingest->app']);
 await page.keyboard.press('Tab');
 await expect.poll(async()=>(await canvas(page)).active,'Tab reaches the card link').toBe('card:ingest->app');
 await page.keyboard.press('Shift+Tab');await expect.poll(async()=>(await canvas(page)).active,'Shift+Tab returns to the carrier').toBe('ingest->app');
 await page.keyboard.press('Tab');await page.keyboard.press('Tab');
 await expect.poll(async()=>(await canvas(page)).active,'Tab moves on past the card').not.toMatch(/^card:|^ingest->app$/);
 await expect.poll(async()=>(await canvas(page)).cards.filter(c=>c.id==='ingest->app' && c.shown).length).toBe(0);
 // Review c2: a hidden next stop is skipped, never a trap on the link.
 await halo.focus();await page.keyboard.press('Tab');
 await expect.poll(async()=>(await canvas(page)).active).toBe('card:ingest->app');
 const hidden=await page.evaluate(()=>{
  const root=document.querySelector('#host').shadowRoot;
  const halo=root.querySelector('.dv-metrics-outline[data-metrics-carrier="ingest->app"]');
  const stops=Array.from(root.querySelectorAll('a[href],button,input,select,textarea,[tabindex]')).filter(el=>el.tabIndex>=0 && !el.disabled && !el.closest('.dv-metrics-card[data-metrics-style="outline"]') && el.getClientRects().length && el.checkVisibility({visibilityProperty:true}));
  const next=stops[stops.indexOf(halo)+1];if(!next)return null;next.style.visibility='hidden';next.setAttribute('data-outline-hidden-stop','');return next.tagName;
 });
 expect(hidden,'a stop follows the carrier').not.toBeNull();
 await page.keyboard.press('Tab');
 await expect.poll(async()=>(await canvas(page)).active,'Tab leaves the link').not.toBe('card:ingest->app');
 expect(await page.evaluate(()=>{const a=document.querySelector('#host').shadowRoot.activeElement;return !!(a && a.hasAttribute('data-outline-hidden-stop'));}),'the hidden stop is skipped').toBe(false);
});

test('O4 a click on a connection or on a Jira node ring opens the detail popover',async({page,server})=>{
 const {root}=await mountCues(page,server),{section,outline}=await overlayOn(root);await outline.click();
 await outlinesReady(page,EDGES.length+NODES.length);
 const pop=root.locator('.dv-live-popover');
 for(const [id,button] of [['app->push','.dv-metrics-outline[data-metrics-carrier="app->push"]'],['shared::api->shared::store','.dv-metrics-outline[data-metrics-carrier="shared::api->shared::store"]'],['ingest','g.node[data-dv-node="ingest"] .card']]){
  const p=await point(page,id);await page.mouse.click(p.x,p.y);
  await expect(pop).toBeVisible();await expect(pop).toContainText('Evidence');
  await expect(section.locator(button)).toHaveAttribute('aria-expanded','true');
  await page.keyboard.press('Escape');await expect(pop).toBeHidden();
 }
});

test('O5 the style is remembered for this board; Cards restores the cards',async({page,server})=>{
 const {root}=await mountCues(page,server);let ui=await overlayOn(root);await ui.outline.click();
 await outlinesReady(page,EDGES.length+NODES.length);
 await page.evaluate(()=>{window.viewer.destroy();});
 const {root:again}=await mountCues(page,server);ui=await overlayOn(again);
 await expect(ui.outline).toHaveAttribute('aria-pressed','true');
 await outlinesReady(page,EDGES.length+NODES.length);
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
  await outlinesReady(page,EDGES.length+NODES.length);
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

test('O7 a node popover opened in Outline stays on its node card, unchanged, through a repaint',async({page,server})=>{
 const {root}=await mountCues(page,server),{section,outline}=await overlayOn(root);await outline.click();
 await outlinesReady(page,EDGES.length+NODES.length);
 const pop=root.locator('.dv-live-popover'),card=section.locator('g.node[data-dv-node="ingest"] .card');
 await card.focus();await page.keyboard.press('Enter');await expect(pop).toBeVisible();
 const text=await pop.innerText();
 await page.evaluate(jira=>window.viewer.controller.liveStatus.apply(jira),CUE_JIRA);
 await expect(pop).toBeVisible();await expect(card).toHaveAttribute('aria-expanded','true');
 expect(await pop.innerText(),'the popover keeps its node carrier').toBe(text);
 expect(await page.evaluate(()=>{const a=document.querySelector('#host').shadowRoot.activeElement;return !!(a && a.closest('.dv-live-popover'));}),'focus stays in the open popover').toBe(true);
 await expect(section.locator('.dv-metrics-outline[data-metrics-carrier="ingest"]')).not.toHaveAttribute('aria-expanded','true');
});

test('O8 Outline covers the carriers of a loaded imported detail',async({page,server})=>{
 const {scope}=await mountImportedDetail(page,server);
 const style=scope.locator('.pt-live-status').getByRole('group',{name:'Metrics style',exact:true});
 await expect(style).toBeVisible();await style.getByRole('button',{name:'Outline',exact:true}).click();
 const sel='[data-dv-detail-preview]';
 await expect.poll(async()=>(await canvas(page,sel)).outlines.map(o=>o.id).sort()).toEqual(['shared::api','shared::api->shared::store','shared::store->shared::api'].sort());
 expect((await canvas(page,sel)).cards.filter(c=>c.shown)).toEqual([]);
 // The two parallel api<->store connections overlap near their midpoints, so hover the imported node.
 const p=await point(page,'shared::api',sel);await page.mouse.move(p.x,p.y);
 await expect.poll(async()=>(await canvas(page,sel)).cards.filter(c=>c.shown).map(c=>c.id)).toEqual(['shared::api']);
});

test('O9 a handoff node ring opens the ticket popover from the cue that took over its button',async({page,server})=>{
 const {root}=await mountCues(page,server),spec=handoffSpec();
 spec.page.sections[0].diagram.nodes.h.telemetry=structuredClone(SERVICE);
 await page.evaluate(spec=>{
  window.viewer.destroy();
  window.viewer=window.mount(document.querySelector('#host'),spec,{telemetry:{provider:async()=>({h:{signals:{rate:{value:12}}},'a->b':{signals:{rate:{value:10},errors:{value:0}}}})}});
  window.viewer.controller.liveStatus.apply({'LOC-1':{state:'done'},'IMP-1':{state:'done'},'EDGE-1':{state:'done'}});
 },spec);
 const {section,outline}=await overlayOn(root);await outline.click();
 await expect.poll(async()=>(await canvas(page)).outlines.map(o=>o.id).sort()).toEqual(['a->b','h']);
 const pop=root.locator('.dv-live-popover'),p=await point(page,'h');
 await page.mouse.click(p.x,p.y);
 await expect(pop).toBeVisible();await expect(pop.getByRole('link',{name:'LOC-1',exact:true})).toBeVisible();
 await expect(section.locator('g.node[data-dv-node="h"] .dv-jira-cue')).toHaveAttribute('aria-expanded','true');
});

test('O10 #1324 a metrics repaint keeps the hovered card open with the new value, and keyboard focus on its carrier',async({page,server})=>{
 const {root}=await mountCues(page,server),{section,outline}=await overlayOn(root);await outline.click();
 await outlinesReady(page,EDGES.length+NODES.length);
 const id='ingest->app',p=await point(page,id);await page.mouse.move(p.x,p.y);
 await expect.poll(async()=>(await canvas(page)).cards.filter(c=>c.shown).map(c=>c.id)).toEqual([id]);
 await page.evaluate(samples=>{samples['ingest->app']={signals:{rate:{value:4242},errors:{value:4}}};window.viewer.controller.telemetry.apply(samples);},structuredClone(CUE_SAMPLES));
 await expect.poll(async()=>(await canvas(page)).cards.filter(c=>c.shown).map(c=>c.id),'the hovered card stays open after the repaint').toEqual([id]);
 await expect(section.locator('.dv-metrics-card[data-metrics-card="ingest->app"]')).toContainText('4,242');
 // Keyboard: focus on an imported connection survives a repaint, with its card open.
 const halo=section.locator('.dv-metrics-outline[data-metrics-carrier="shared::api->shared::store"]');await halo.focus();
 await page.evaluate(samples=>{samples['shared::api->shared::store']={signals:{rate:{value:6060},errors:{value:1}}};window.viewer.controller.telemetry.apply(samples);},structuredClone(CUE_SAMPLES));
 await expect.poll(async()=>(await canvas(page)).active,'focus stays on the imported carrier').toBe('shared::api->shared::store');
 await expect.poll(async()=>(await canvas(page)).cards.filter(c=>c.shown).map(c=>c.id)).toEqual(['shared::api->shared::store']);
 await expect(section.locator('.dv-metrics-card[data-metrics-card="shared::api->shared::store"]')).toContainText('6,060');
});
