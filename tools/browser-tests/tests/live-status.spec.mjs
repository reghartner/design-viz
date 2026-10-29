/* Contract matrix (browser and VM coverage together):
| row | rule |
|---|---|
| V1 | New file src/viewer/live-status.js, added to the `engine.js` list in src/source-bundles.json (so standalone, workbench, native/Backstage and forge entrypoints all get it; check tests/source-loader.test.js). ES5 browser code like its neighbours. |
| V2 | `renderPage` attaches `ctl.liveStatus` with: `refs()` → `{tickets:[distinct keys], prs:[distinct urls]}` over every diagram of the page (all sections, all paths, detail flows) using `trackingRefs`; `apply(map)`; `clear()`; `enabled()`; `setEnabled(bool)`; `onChange(fn)` (fires after apply/clear/setEnabled with `{states, counts, updatedAt}`); `state(ref)`. `map` is `{ "<ticket key>": {state, title?, url?, assignee?, prs?: {count, state}, detail?, updatedAt?} }`, `state` ∈ `todo|active|done|blocked|missing`. Unknown state strings are ignored (treated as absent). |
| V3 | Rollup for one carrier with several tickets (docs/live-status.md): any blocked → blocked; else any missing → missing; else any active → active; else all done → done; else all todo → todo; else (mix of done and todo) → active. A carrier whose tickets are all absent from the map gets NO class. Implement as a pure function `liveStatusRollup(states[])` (exported as a global like other engine helpers) so it is unit-testable. |
| V4 | `apply(map)` sets exactly one `dv-live-<state>` class (removing the others) on: every node `g.node[data-dv-node]` with tickets; every edge `path.edge[data-dv-edge]` with tickets, plus its halo path and its `text.lbl` label (same `data-dv-edge` index); every step coin `g.coin[data-dv-step]` and step chip `button.schip[data-step-source]` whose step involves (via `edges`/keys, `nodes`, failures) at least one carrier that has a state — rollup of those carriers' states; in path-timeline chips too. Text boxes (`g.node.node-text`) never get a class. |
| V5 | CSS in src/style.core.css, for EVERY skin selector family that paints `.card`/edges today (aurora, daylight, editorial, terminal, pastel, blueprint, rose, lavender, lilac — check the skin list in the file): `.dv-live-todo` grey, `.dv-live-active` azure, `.dv-live-done` green, `.dv-live-blocked` and `.dv-live-missing` red. Node: card stroke + a soft halo (drop-shadow) in the state color and the status badge; edge: stroke color (main + halo) with the state color; coin: circle fill + ink via the same `--step-color`/`--step-ink` custom properties the `.step-colored` rules use (so precedence and `!important` match); chip: background via the same variables. Define the five colors once as CSS custom properties on `:root` (`--dv-live-todo`, …) and reuse. active/blocked/missing pulse: reuse the existing `runtime-pulse` keyframes (stroke-width) on the badge circle and a slow (≈2.4 s) opacity pulse on the card halo; `@media (prefers-reduced-motion: reduce)` disables both (follow the existing reduced-motion blocks). Live classes win over `tone-*` card fill/stroke while present. Step-mode dimming (`.stepmode .node:not(.lit)` etc.) still applies but with an opacity floor of .55 for live-classed elements, like `.stepmode .coin.step-colored:not(.lit)`. Print: no pulse, keep colors. |
| V6 | No canvas badge (#762, Chuck 2026-10-27): state is carried by card stroke and halo, edge stroke, dashed todo/waiting strokes, step coins and the break glyph. The ticket popover (manual popover in the `.nbackpop` style: one row per ticket with key link to `tracking.jira.site + '/browse/' + key` when site exists, else `url`, else plain text; state pill, title, assignee, "PRs: n open/merged"; then authored `prs` URLs) opens from the carrier itself: a click on a ticketed node card (not its links/detail/handoff controls) or on an edge line, label or live break glyph (one keyboard trigger: the label, or path/visible live break when unlabelled). In the reader the card/label is a named `role="button"` with `tabindex="0"`, opened by Enter/Space; Escape/outside click closes and returns focus to it. Under `authoring` (Workbench) carriers stay inert so selection keeps its clicks. |
| V7 | Node "⋯" menu: `nodeReferenceLinks` (`src/engine.js:257`) gains a "Tickets" group listing ticket keys (browse links when site is set) and authored PR links for that node, so the menu shows them even without a provider. |
| V8 | Live controls live only in the authored `live-status` panel's `.dv-live-head`, below its engine-owned title; reader navigation has no Live control row. The header includes `button.dv-live-toggle` ("Live", `aria-pressed` reflecting `enabled()`), per-state counts hidden when zero, `time.dv-live-updated` when a timestamp exists, the provider note and action, First blocker when available, and Play/Pause plus Next day when demo controls are supplied. Without ticket references or epics the panel shows the empty-page message; before a provider or applied map is available it shows only the provider note and any required action. |
| V9 | Re-apply after every rebuild: listen on the section element for `dv:pathrender` and `dv:pathchange`, on the view for `diagram-tab-change`, `tab-view-change`, `diagram-view-change`, `navigation-mounted`, `detail-navigation`, and use one MutationObserver (childList, subtree) scoped to step-control containers for chip rebuilds; coalesce with requestAnimationFrame. The classes survive a path switch (new SVG) and a detail flow open. `ctl.destroy()` disconnects everything. |
| V10 | Host hook: `renderPage(..., {liveStatus: {provider: function(refs, signal) → Promise<map>, refreshMs}})`. When present: call the provider after first paint, then every `max(refreshMs, 30000)` ms while `document.visibilityState === 'visible'` (pause when hidden, one catch-up call on return); an AbortController signal is passed and aborted on destroy; rejections set `note(message,'error')` and keep the last map. `mountNativeSpec` (src/native/mount.js) forwards `liveStatus` and src/native/mount.d.ts declares `liveStatus?: {provider: (refs: {tickets: string[]; prs: string[]}, signal: AbortSignal) => Promise<Record<string, LiveStatusEntry>>; refreshMs?: number}` with a `LiveStatusEntry` type. src/boot.flowview.js passes `window.flowviewLiveStatus` (if set before boot) as that option. |
| V11 | Without live evidence, tracked Step captions still show authored ticket references; no carrier paint is applied. Pages without ticket refs keep no Live control markup or derived ticket row. |
*/
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect,paste,prepareEditorSurface,closeTools} from '../helpers/test.mjs';
import {projectFiles,useProjectDownloads} from '../helpers/project-export.mjs';
import {repo} from '../helpers/prepare.mjs';
// Freeze the original overlay fixture: the authored story may evolve independently.
const raw={"page":{"title":"Connected doorbell delivery","contract":"1","flowview":{"authoredWith":"0.2.0","minVersion":"0.2.0","features":["flow.live-status"]},"tracking":{"jira":{"site":"https://acme.atlassian.net"}},"sections":[{"heading":"From button press to resident notification","text":["Track implementation work on each component and the interactions between them. The spec stores references; Jira owns live status."],"diagram":{"nodes":{"hardware":{"title":"Hardware","sub":"Doorbell button","tickets":["HW-123"]},"firmware":{"title":"Firmware","sub":"Event delivery","tickets":["FW-45"],"prs":["https://github.com/acme/firmware/pull/88"]},"backend":{"title":"Backend","sub":"Notification service","tickets":["BE-67"]},"ux":{"title":"UX mobile app","sub":"Resident experience","tickets":["UX-89"]}},"rows":[["hardware","firmware","backend","ux"]],"edges":[{"from":"hardware","to":"firmware","label":"press","tickets":["HW-124","FW-46"]},{"from":"firmware","to":"backend","label":"event","kind":"https","tickets":["BE-68"],"prs":["https://github.com/acme/backend/pull/91"]},{"from":"backend","to":"ux","label":"notify","kind":"https"}]}}]}};
raw.page.sections[0].diagram.panels=[{id:'status',type:'live-status',title:'Epic status'}];
const FIXED_MAP={'HW-123':{state:'active',title:'Button delivery',assignee:'Alex',updatedAt:'2026-10-26T12:00:00Z',prs:{count:2,state:'open'}},'FW-45':{state:'done'},'FW-46':{state:'todo'},'BE-67':{state:'done'},'HW-124':{state:'blocked'},'BE-68':{state:'missing'}};
function fixture(){
 const spec=structuredClone(raw),section=spec.page.sections[0],d=section.diagram;section.id='delivery';
 d.nodes.firmware.tickets.push('FW-46');d.nodes.ux.tickets.push('BE-68');d.nodes.hardware.detail={section:'detail'};
 d.nodes.todo={title:'Planned work',tickets:['FW-46']};d.rows.push(['todo']);
 d.steps=[{id:'press',edge:'hardware->firmware',text:'Press'},{id:'notify',edge:'backend->ux',text:'Notify'},{id:'retry',edge:'backend->ux',failures:{'hardware->firmware':'dropped'},text:'Retry'}];
 d.paths=[{id:'normal',label:'Normal',steps:['press','notify']},{id:'retry',label:'Retry',steps:['press','retry','notify']}];
 spec.page.sections.push({id:'detail',heading:'Hardware detail',detailOnly:true,diagram:{nodes:{child:{title:'Child work',tickets:['HW-123']}},rows:[['child']]}});return spec;
}
// Clicks a node card in its empty right margin: the centre holds the title text.
async function cardClick(card){await card.scrollIntoViewIfNeeded();const box=await card.boundingBox();await card.click({position:{x:box.width-6,y:box.height/2}});}
// Find a visible point on the actual stroke, away from labels, coins and cards.
// Use a real mouse click so SVG hit testing participates in the contract.
async function strokeClick(page,path){
 await path.scrollIntoViewIfNeeded();
 const point=await path.evaluate(el=>{
  const matrix=el.getScreenCTM(),length=el.getTotalLength();
  for(const fraction of [.2,.3,.7,.8,.1,.9,.4,.6,.5]){
   const p=el.getPointAtLength(length*fraction),screen=new DOMPoint(p.x,p.y).matrixTransform(matrix);
   if(document.elementFromPoint(screen.x,screen.y)===el)return {x:screen.x,y:screen.y};
  }
  return null;
 });
 expect(point,'edge stroke has a visible pointer target').not.toBeNull();await page.mouse.click(point.x,point.y);
}
async function open(page,server,spec=fixture(),provider=true){
 await page.setViewportSize({width:1440,height:1000});
 if(provider)await page.addInitScript(map=>{window.flowviewLiveStatus={provider:async(refs,signal)=>{window.__liveRefs=refs;return map;}};},FIXED_MAP);
 const file=path.join(server.root,'live-status.json'),out=path.join(server.root,'live-status.html');await writeFile(file,JSON.stringify(spec));execFileSync('python3',[path.join(repo,'tools/inject.py'),file,path.join(repo,'template/flowview.html'),out]);await page.goto(server.origin+'/live-status.html');return page.locator('#docview');
}
test('V2 V3 V4 V6 V8 V9 V10 live states survive toggles, path rebuilds and detail navigation',async({page,server})=>{
 const root=await open(page,server),section=root.locator('#section-delivery'),node=id=>section.locator('g.node[data-dv-node="'+id+'"]');
 await expect(node('hardware')).toHaveClass(/dv-live-active/);await expect(node('firmware')).toHaveClass(/dv-live-active/);await expect(node('ux')).toHaveClass(/dv-live-missing/);await expect(node('todo')).toHaveClass(/dv-live-todo/);
 for(const tag of ['path.edge','path.halo','text.lbl'])await expect(section.locator(tag+'[data-dv-edge="0"]')).toHaveClass(/dv-live-blocked/);
 await expect(section.locator('g.coin[data-dv-step="0"]')).toHaveClass(/dv-live-blocked/);await expect(section.locator('.schip[data-step-source="0"]').first()).toHaveClass(/dv-live-blocked/);
 const live=root.locator('.dv-live-toggle');await expect(live).toBeVisible();await expect(live).toHaveAttribute('aria-pressed','true');for(const state of ['todo','active','done','blocked','missing'])await expect(root.locator('.dv-live-head').locator('[data-live-count="'+state+'"]')).toContainText(state==='done'?'2':'1');
 await live.click();await expect(root.locator('.dv-live-active,.dv-live-done,.dv-live-todo,.dv-live-blocked,.dv-live-missing')).toHaveCount(0);await expect(live).toHaveAttribute('aria-pressed','false');await live.click();await expect(node('hardware')).toHaveClass(/dv-live-active/);
 await section.locator('.path-chip[data-dv-path="retry"]').click();await expect(section.locator('g.coin[data-dv-step="2"]')).toHaveClass(/dv-live-blocked/);await expect(section.locator('path.edge[data-dv-edge="0"]')).toHaveClass(/dv-live-blocked/);
 // Return to Ambient so the badges are comfortably visible in the overview.
 await section.getByRole('button',{name:'Ambient',exact:true}).click();
 const badge=node('hardware').locator('.card'),pop=root.locator('.dv-live-popover');await cardClick(badge);await expect(pop).toBeVisible();await expect(pop.getByRole('link',{name:'HW-123',exact:true})).toHaveAttribute('href','https://acme.atlassian.net/browse/HW-123');await expect(pop).toContainText('Button delivery');await expect(pop).toContainText('Alex');await expect(pop).toContainText('PRs: 2 open');
 await page.keyboard.press('Escape');await expect(pop).toBeHidden();await expect(badge).toBeFocused();await badge.press('Space');await expect(pop).toBeVisible();await root.locator('.doc-title').click();await expect(pop).toBeHidden();await expect(badge).toBeFocused();
 await node('firmware').locator('.card').press('Enter');await expect(pop.getByRole('link',{name:'FW-45',exact:true})).toBeVisible();await expect(pop.getByRole('link',{name:'FW-46',exact:true})).toBeVisible();await expect(pop.getByRole('link',{name:'https://github.com/acme/firmware/pull/88',exact:true})).toBeVisible();await page.keyboard.press('Escape');
 await node('hardware').locator('.detail-trigger').click();await expect(root.locator('[data-dv-detail-preview] [data-dv-node="child"]')).toHaveClass(/dv-live-active/);
});
// Render CSS colors through the browser so color-mix and alpha are measured.
async function contrast(locator,fillProperty,inkProperty,inkSelector){
 return locator.evaluate((el,{fillProperty,inkProperty,inkSelector})=>{
  const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d');
  const rgba=value=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=value;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data].map((v,i)=>i===3?v/255:v);};
  const mix=(top,bottom)=>top.slice(0,3).map((v,i)=>v*top[3]+bottom[i]*(1-top[3]));
  const layers=[];for(let host=el.closest('.board')||el.parentElement;host;host=host.parentElement){const c=rgba(getComputedStyle(host).backgroundColor);layers.push(c);if(c[3]===1)break;}
  let ground=[255,255,255];for(const c of layers.reverse())ground=mix(c,ground);
  const target=el.matches('g.node')?el.querySelector('.card'):el.matches('g.coin')?el.querySelector('circle'):el;
  const fill=rgba(getComputedStyle(target)[fillProperty]),back=mix(fill,ground),ink=rgba(getComputedStyle(inkSelector?el.querySelector(inkSelector):el)[inkProperty]);
  const luminance=rgb=>rgb.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
  const l=[luminance(ink),luminance(back)].sort((a,b)=>a-b);const tint=rgba(getComputedStyle(el).getPropertyValue('--dv-live-color'));return {ratio:(l[1]+.05)/(l[0]+.05),alpha:fill[3],back,ground,expected:ground.map((v,i)=>v*.85+tint[i]*.15),ink:ink.slice(0,3)};
 },{fillProperty,inkProperty,inkSelector});
}
test('V5 all nine skins share status backings, patterns, contrast and separate selection',async({page,server},testInfo)=>{
 const spec=fixture(),d=spec.page.sections[0].diagram;d.nodes.unchanged={title:'Existing audit',sub:'No new work'};d.nodes.uncovered={title:'Uncovered work',sub:'Ticket still needed',missingWork:true};d.rows.push(['unchanged','uncovered']);
 for(const [id,node] of [['active','hardware'],['done','backend'],['todo','todo'],['missing','uncovered'],['unchanged','unchanged']]){d.steps.push({id,nodes:[node],text:id,color:'#654321'});d.paths[0].steps.push(id);}
 d.edges.push({from:'hardware',to:'todo',label:'active'},{from:'backend',to:'unchanged',label:'done'});d.steps[3].edge='hardware->todo';d.steps[4].edge='backend->unchanged';
 d.steps[0].tone={hardware:'ok'};
 for(const skin of ['aurora','terminal','pastel','blueprint','rose','lavender','lilac','daylight','editorial']){
  spec.page.skin=skin;const root=await open(page,server,spec),section=root.locator('#section-delivery');
  const hardware=section.locator('[data-dv-node="hardware"]'),activeChip=section.locator('.schip[data-step-source="3"]').first(),activeCoin=section.locator('.coin[data-dv-step="3"]');
  await expect(hardware).toHaveAttribute('data-live-appearance','active');
  await expect(hardware.locator('.card')).toHaveCSS('stroke','rgb(22, 102, 199)');
  await expect(hardware.locator('.t1')).toHaveCSS('fill',await hardware.locator('.t2').evaluate(el=>getComputedStyle(el).fill));
  for(const label of ['.t1','.t2']){const measured=await contrast(hardware,'fill','fill',label);expect(measured.ratio,skin+' node '+label+' contrast').toBeGreaterThanOrEqual(4.5);measured.back.forEach((v,i)=>expect(Math.abs(v-measured.expected[i]),skin+' 15% node backing').toBeLessThan(1.5));}
  await expect(section.locator('[data-dv-node="backend"]>.dv-live-halo')).not.toHaveCSS('filter','none');await expect(section.locator('[data-dv-node="backend"]>.dv-live-halo')).toHaveCSS('animation-name','none');
  await expect(section.locator('.coin[data-dv-step="4"]>circle')).not.toHaveCSS('filter','none');await expect(section.locator('.coin[data-dv-step="4"]>circle')).toHaveCSS('animation-name','none');
  const nodeColors=await hardware.evaluate(el=>({ink:getComputedStyle(el.querySelector('.t1')).fill,fill:getComputedStyle(el.querySelector('.card')).fill}));
  expect(nodeColors.ink).toMatch(/^rgb\((?:0, 0, 0|255, 255, 255)\)$/);
  for(const [id,dash] of [['todo','1px, 4px'],['uncovered','6px, 4px'],['unchanged','none']])await expect(section.locator('[data-dv-node="'+id+'"] .card')).toHaveCSS('stroke-dasharray',dash);
  for(const [index,state] of [[3,'active'],[4,'done'],[5,'todo'],[6,'missing'],[7,'unchanged']]){
   const chip=section.locator('.schip[data-step-source="'+index+'"]').first();await expect(chip).toHaveAttribute('data-live-appearance',state);
   const measured=await contrast(chip,'backgroundColor','color');expect(measured.alpha).toBeCloseTo(.15,2);expect(measured.ratio,skin+' '+state+' chip contrast').toBeGreaterThanOrEqual(4.5);
  }
  await expect(activeCoin.locator('circle')).toHaveCSS('stroke','rgb(22, 102, 199)');const coinContrast=await contrast(activeCoin,'fill','fill','text');expect(coinContrast.alpha).toBeCloseTo(.15,2);expect(coinContrast.ratio,skin+' coin numeral contrast').toBeGreaterThanOrEqual(4.5);
  await activeChip.click();await expect(activeChip).toHaveCSS('box-shadow','none');
  expect(await activeChip.evaluate(el=>getComputedStyle(el,'::after').height)).toBe('2px');
  await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');await expect(activeChip).toBeFocused();await expect(activeChip).toHaveCSS('outline-style','solid');
  for(const pill of [root.locator('[data-live-count="active"]'),root.locator('tr[data-live-ticket="HW-123"] .dv-live-state-pill')]){await expect(pill).toHaveCSS('border-color','rgb(22, 102, 199)');const measured=await contrast(pill,'backgroundColor','color');expect(measured.alpha).toBeCloseTo(.15,2);expect(measured.ratio).toBeGreaterThanOrEqual(4.5);}
  await cardClick(hardware.locator('.card'));await expect(root.locator('.dv-live-popover .dv-live-ticket-state')).toHaveAttribute('data-live-appearance','active');await page.keyboard.press('Escape');
  if(['aurora','pastel'].includes(skin))await section.screenshot({path:testInfo.outputPath('status-surfaces-'+skin+'.png')});
  await root.locator('.dv-live-toggle').click();await expect(activeChip).toHaveCSS('background-color','rgb(101, 67, 33)');await expect(hardware).not.toHaveAttribute('data-live-appearance');await root.locator('.dv-live-toggle').click();await expect(activeChip).toHaveAttribute('data-live-appearance','active');
 }
 await page.emulateMedia({reducedMotion:'no-preference'});await expect(page.locator('[data-dv-node="hardware"] .dv-live-halo').first()).toHaveCSS('animation-duration','2.6s');
 await page.emulateMedia({reducedMotion:'reduce'});await expect(page.locator('[data-dv-node="hardware"] .dv-live-halo').first()).toHaveCSS('animation-name','none');
 await page.emulateMedia({media:'print',reducedMotion:'no-preference'});await expect(page.locator('[data-dv-node="hardware"] .dv-live-halo').first()).toHaveCSS('animation-name','none');
});
test('V7 V11 authored reference menus work without provider paint',async({page,server})=>{
 const root=await open(page,server,fixture(),false);await expect(root.locator('.dv-live-badge')).toHaveCount(0);await expect(root.locator('.dv-live-toggle')).toBeHidden();
 await root.locator('#section-delivery [data-dv-node="firmware"] .nrefs-trigger').click();const menu=root.locator('.node-link-menu:visible');await expect(menu).toContainText('Tickets');await expect(menu.getByRole('link',{name:'FW-45',exact:false})).toHaveAttribute('href','https://acme.atlassian.net/browse/FW-45');await expect(menu.getByRole('link',{name:'https://github.com/acme/firmware/pull/88',exact:false})).toHaveAttribute('href','https://github.com/acme/firmware/pull/88');
});
test('V11 a page without tickets has no Live control markup',async({page,server})=>{
 const spec=JSON.parse(await readFile(path.join(repo,'examples/step-colors/step-colors.spec.json')));const root=await open(page,server,spec,false);await expect(root.locator('.dv-live-toggle,.dv-live-badge,.dv-live-note,.dv-live-updated')).toHaveCount(0);
});

/* Story contract matrix S1–S8:
 S1 built story and embedded data; S2 opt-in hash, provider priority and fallback;
 S3 manual/automatic days and reduced motion; S4 dependency waiting (#765: ticket -> ticket from Jira links and authored pairs, tone from the direct upstream; edges propagate nothing);
 S5 ambient/step blocked break + packet suppression/clearing; S6 skin/print tag + popover;
 S7 docs: unit gate; S8 workbench excluded: unit/diff gate. Desktop reader only.
*/
async function openStory(page,server,hash='#live=demo'){
 await page.setViewportSize({width:1440,height:1000});await page.emulateMedia({reducedMotion:'reduce'});
 // Exercise the production runtime rebuilt by global setup, keeping the
 // authored example and its timeline. The checked-in export can be older.
 const out=path.join(server.root,'story-live.html');
 execFileSync('python3',[path.join(repo,'tools/inject.py'),path.join(repo,'examples/live-status/live-status.spec.json'),path.join(repo,'template/flowview.html'),out,'--timeline',path.join(repo,'examples/live-status/live-status.timeline.json')]);
 await page.goto(server.origin+'/story-live.html'+hash);return page.locator('#docview');
}
test('S1 S2 S3 S4 S5 S6 built demo plays the story through blockers to completion',async({page,server})=>{
 const root=await openStory(page,server),next=root.getByRole('button',{name:'Next day',exact:true});await expect(next).toBeVisible();
 const spec=await page.locator('#flowspec').evaluate(el=>JSON.parse(el.textContent));const d=spec.page.sections[0].diagram;
 expect(spec.page.title).toBe('Doorbell Delivery Live Status');expect(Object.keys(d.nodes)).toHaveLength(6);expect(d.edges).toHaveLength(5);expect(d.steps).toHaveLength(7);
 const timeline=await page.locator('#live-timeline').evaluate(el=>JSON.parse(el.textContent));expect(timeline.days).toHaveLength(12);
 await expect(root.locator('.dv-live-note')).toHaveText('Day 1 — kickoff');await expect(root.locator('.dv-live-demo').getByRole('button',{name:'Play',exact:true})).toBeDisabled();
 const edge=root.locator('path.edge[data-dv-edge="0"]'),node=id=>root.locator('g.node[data-dv-node="'+id+'"]');
 await expect(edge).toHaveClass(/dv-live-todo/);await expect(edge).toHaveCSS('stroke-dasharray','5px, 5px');
 const edgeDots=()=>root.locator('circle.pkt').filter({has:page.locator('mpath[href$="-e0"]')});
 expect(await edgeDots().count()).toBeGreaterThan(0);for(const dot of await edgeDots().all())await expect(dot).toHaveCSS('display','none');
 for(let day=2;day<=4;day++){await next.click();await expect(root.locator('.dv-live-note')).toContainText('Day '+day+' —');}
 await expect(edge).toHaveClass(/dv-live-blocked/);const failure=root.locator('g.comm-failure[data-dv-edge="0"]');await expect(failure).toHaveCount(1);await expect(failure).toHaveAttribute('aria-label',/Not sent:.*HW-124/);await expect(failure.locator('text')).toHaveCount(0);
 // FW-46 (on the controller) is blocked by HW-124 in Jira: red waiting on an active carrier. Nothing is inferred from the press edge's direction.
 await expect(node('mcu')).toHaveClass(/dv-live-waiting/);await expect(node('mcu')).toHaveClass(/dv-live-active/);await expect(node('mcu')).toHaveAttribute('data-dv-live-waiting-on','HW-124');await expect(node('mcu')).toHaveAttribute('data-dv-live-waiting-tone','red');await expect(node('button')).not.toHaveClass(/dv-live-waiting/);
 await expect(node('ingest')).toHaveClass(/dv-live-waiting/);await expect(node('ingest')).toHaveAttribute('data-dv-live-waiting-tone','grey');await expect(node('ingest')).toHaveAttribute('data-dv-live-waiting-on','FW-45');
 await expect(node('mcu').locator('.dv-live-waiting-tag')).toHaveCount(0);await expect(root.locator('svg .dv-live-waiting-icon')).toHaveCount(0);await node('mcu').locator('.card').press('Enter');await expect(root.locator('.dv-live-popover .dv-live-waiting-detail')).toHaveText('Waiting on HW-124 · blocked');await expect(root.locator('.dv-live-popover .dv-live-waiting-chain')).toHaveText('HW-124 holds FW-46');await page.keyboard.press('Escape');
 for(const skin of ['aurora','terminal','pastel','blueprint','rose','lavender','lilac','daylight','editorial']){await page.evaluate(s=>window.dvSetSkin(s),skin);await expect(node('mcu').locator('.card')).toHaveCSS('stroke',statusLine('blocked'));await expect(node('mcu').locator('.card')).toHaveCSS('stroke-dasharray','5px, 5px');await expect(node('mcu').locator('.dv-live-halo'),skin+' red waiting halo').toHaveCSS('stroke',statusLine('blocked'));await expect(node('ingest').locator('.card'),skin+' grey waiting card').toHaveCSS('stroke',statusLine('todo'));}
 await page.emulateMedia({media:'print'});await expect(node('mcu').locator('.card')).toHaveCSS('stroke',statusLine('blocked'));await expect(node('mcu').locator('.dv-live-halo')).toHaveCSS('animation-name','none');await page.emulateMedia({media:'screen'});
 await root.locator('.schip[data-step-source="0"]').first().click();await expect(failure).toHaveCount(1);await expect(failure).toBeVisible();
 for(let day=5;day<=12;day++){
  await next.click();await expect(root.locator('.dv-live-note')).toContainText('Day '+day+' —');
  if(day===6){await expect(node('app')).toHaveClass(/dv-live-missing/);await expect(root.locator('g.comm-failure[data-dv-edge="4"]')).toHaveCount(0);}
  // Day 7: HW-124 is unblocked but unfinished, so FW-46 still waits, now grey. Day 8: FW-46 is active and nothing waits.
  if(day===7){await expect(root.locator('g.comm-failure')).toHaveCount(0);await expect(node('mcu')).toHaveClass(/dv-live-waiting/);await expect(node('mcu')).toHaveAttribute('data-dv-live-waiting-tone','grey');await expect(node('mcu').locator('.card')).toHaveCSS('stroke',statusLine('todo'));}
  if(day===8)await expect(root.locator('.dv-live-waiting')).toHaveCount(0);
  if(day===9){await expect(node('chime')).toHaveClass(/dv-live-done/);await expect(node('chime')).not.toHaveClass(/dv-live-waiting/);}
 }
 await expect(root.locator('.dv-live-waiting')).toHaveCount(0);await expect(root.locator('g.node.dv-live-done')).toHaveCount(6);await expect(root.locator('path.edge.dv-live-done')).toHaveCount(5);await expect(next).toBeDisabled();
 // Existing reduced-motion and step-mode rules also hide ordinary packets.
 await page.emulateMedia({reducedMotion:'no-preference'});await root.getByRole('button',{name:'Ambient',exact:true}).click();
 for(const dot of await edgeDots().all())await expect(dot).not.toHaveCSS('display','none');
});
test('S4 waiting follows ticket dependencies from the provider and the authored pairs, never the edges',async({page,server})=>{
 await page.addInitScript(()=>{window.flowviewLiveStatus={provider:refs=>Object.fromEntries(refs.tickets.map(key=>[key,Object.assign({state:key==='HW-123'?'blocked':key==='FW-45'?'done':'todo'},key==='FW-46'?{dependsOn:[{key:'HW-123',source:'jira',linkType:'is blocked by'}]}:{})]))};});
 const root=await openStory(page,server,''),node=id=>root.locator('g.node[data-dv-node="'+id+'"]');
 await expect(node('button')).toHaveClass(/dv-live-blocked/);
 // The controller carries FW-45 (done) and FW-46 (todo, blocked by HW-123): active rollup, red waiting, rose preset.
 await expect(node('mcu')).toHaveClass(/dv-live-active/);await expect(node('mcu')).toHaveClass(/dv-live-waiting/);await expect(node('mcu')).toHaveAttribute('data-dv-live-waiting-on','HW-123');await expect(node('mcu')).toHaveAttribute('data-dv-live-waiting-tone','red');await expect(node('mcu')).toHaveClass(/\bns-rose\b/);
 // Ingest sits downstream of the blocked button by data flow only: no dependency, no waiting.
 await expect(node('ingest')).toHaveClass(/dv-live-todo/);await expect(node('ingest')).not.toHaveClass(/dv-live-waiting/);await expect(node('ingest')).not.toHaveAttribute('data-dv-live-waiting-on',/./);
 // The authored pair UX-89 -> BE-68 (both todo) paints the app and the push edge grey.
 await expect(node('app')).toHaveClass(/dv-live-waiting/);await expect(node('app')).toHaveAttribute('data-dv-live-waiting-tone','grey');await expect(node('app')).toHaveClass(/\bns-slate\b/);await expect(node('app')).toHaveAttribute('data-dv-live-waiting-on','BE-68');
 await expect(root.locator('path.edge[data-dv-edge="4"]')).toHaveClass(/dv-live-waiting/);await expect(root.locator('path.edge[data-dv-edge="4"]')).toHaveAttribute('data-dv-live-waiting-tone','grey');
 const panel=root.locator('.pt-live-status');await expect(panel.locator('.dv-live-suggest')).toHaveText('1 authored dependency (UX-89 → BE-68) has no Jira link. Suggest link in Jira');
 const dep=panel.locator('tr[data-live-ticket="FW-46"] .dv-live-dep');await expect(dep).toHaveAttribute('data-tone','red');await expect(dep.locator('.dv-live-dep-key')).toHaveText('HW-123');await expect(dep.locator('svg[data-icon="alarm"]')).toHaveCount(1);
 await expect(panel.locator('tr[data-live-ticket="UX-89"] .dv-live-dep svg[data-icon="hand"]')).toHaveCount(1);await expect(panel.locator('tr[data-live-ticket="UX-89"] .dv-live-dep')).toHaveAttribute('title','needs the push payload contract');
});
test('S2 S3 without hash there are no demo controls or live classes',async({page,server})=>{
 const root=await openStory(page,server,'');await expect(root.locator('.dv-live-demo')).toHaveCount(0);await expect(root.locator('.dv-live-badge,.dv-live-waiting,.dv-live-todo')).toHaveCount(0);
});
test('S2 host provider takes precedence over the demo hash',async({page,server})=>{
 await page.addInitScript(()=>{window.flowviewLiveStatus={provider:refs=>Object.fromEntries(refs.tickets.map(key=>[key,{state:'done'}]))};});const root=await openStory(page,server);await expect(root.locator('path.edge').first()).toHaveClass(/dv-live-done/);await expect(root.locator('.dv-live-demo')).toHaveCount(0);
});
test('S2 S3 fallback demo honors cadence, Pause and reduced motion',async({page,server})=>{
 await page.clock.install();await page.emulateMedia({reducedMotion:'no-preference'});await page.setViewportSize({width:1440,height:1000});
 const spec={page:{title:'Fallback',sections:[{diagram:{nodes:{a:{title:'A',tickets:['AA-1']},b:{title:'B',tickets:['BB-1']}},rows:[['a','b']],edges:[{from:'a',to:'b'}]}}]}};
 spec.page.sections[0].diagram.panels=[{id:'status',type:'live-status',title:'Live status'}];
 const file=path.join(server.root,'fallback.json'),out=path.join(server.root,'fallback.html');await writeFile(file,JSON.stringify(spec));execFileSync('python3',[path.join(repo,'tools/inject.py'),file,path.join(repo,'template/flowview.html'),out]);await page.goto(server.origin+'/fallback.html#live=demo');const root=page.locator('#docview'),demo=root.locator('.dv-live-demo');
 await expect(demo).toBeVisible();await expect(page.locator('#live-timeline')).toHaveCount(0);await expect(root.locator('.dv-live-note')).toContainText('Day 1');await page.clock.runFor(6000);await expect(root.locator('.dv-live-note')).toContainText('Day 2');
 await demo.getByRole('button',{name:'Pause',exact:true}).click();await page.clock.runFor(12000);await expect(root.locator('.dv-live-note')).toContainText('Day 2');await demo.getByRole('button',{name:'Play',exact:true}).click();await page.clock.runFor(6000);await expect(root.locator('.dv-live-note')).toContainText('Day 3');
 await page.emulateMedia({reducedMotion:'reduce'});await page.clock.runFor(12000);await expect(root.locator('.dv-live-note')).toContainText('Day 3');await demo.getByRole('button',{name:'Next day',exact:true}).click();await expect(root.locator('g.node.dv-live-done')).toHaveCount(2);
});

/* Claude provider contract matrix (these browser cases + tests/live-status.test.js):
 P1 standalone boot, async mcp namespace, inert without refs/runtime/with host.
 P2 Jira envelopes/categories/Flagged/Development/missing/chunking (VM helpers).
 P3 connector discovery and visible add-connector note without tool calls.
 P4 resource selection/cache (VM); resource lookup through mcp here.
 P5 paired chunk watches, active node, Flagged edge, missing key, cached updated.
 P6 explicit Allow Jira click calls search once; other error/retry branches in VM.
 P7 Live toggles retain watches; destroy and late results covered by VM.
 P8 publishing declaration checked by VM.
 P9 no network fetch; existing no-provider browser cases remain unchanged.
 All authoring/editing remains desktop-only. */
function stubLiveClaude(mode){
 const log=window.__mcpStub={calls:[],watches:[]};
 const issue=(key,category='indeterminate')=>({key,fields:{summary:'Work '+key,status:{name:'In Progress',statusCategory:{key:category}},assignee:{displayName:'Alex'},updated:'2026-10-20T09:00:00Z'}});
 const result=input=>({payload:{issues:{nodes:input.jql.includes('Flagged')?[issue('HW-124')]:['HW-123','FW-45','BE-67','HW-124','FW-46','BE-68'].map(key=>issue(key))}},cache:{storedAt:1793000000000}});
 const mcp={
  listTools:async()=>mode==='missing'?[]:[{server:'Mock-atlassian',authStatus:'unknown',tools:[{name:'getAccessibleAtlassianResources'},{name:'searchJiraIssuesUsingJql'}]}],
  callTool:async(server,tool,input,opts)=>{log.calls.push({server,tool,input,opts});return tool==='getAccessibleAtlassianResources'?{payload:[{id:'cloud',url:'https://acme.atlassian.net'}]}:result(input);},
  watchTool(server,tool,input,handler,opts){
   const watch={server,tool,input,opts,stopped:false};log.watches.push(watch);
   const deliver=()=>{if(!watch.stopped)handler(mode==='approval'&&!input.jql.includes('Flagged')?{type:'error',error:{code:'approval_required'}}:{type:'data',result:result(input)});};
   setTimeout(deliver,0);watch.deliver=deliver;return ()=>{watch.stopped=true;};
  }
 };
 window.claude={use:name=>Promise.resolve(name==='mcp'?mcp:null)};
}
// GitHub is a separate connector beside Mock-atlassian; no direct network.
function stubLiveGithub(){
 const use=window.claude.use;
 window.claude.use=async name=>{
  const mcp=await use(name);if(name!=='mcp')return mcp;
  const list=mcp.listTools,watch=mcp.watchTool;
  mcp.listTools=async()=>[...await list(),{server:'GitHub',tools:[{name:'search_pull_requests'},{name:'pull_request_read'}]}];
  mcp.watchTool=(server,tool,input,handler,opts)=>{
   if(server!=='GitHub')return watch(server,tool,input,handler,opts);
   const w={server,tool,input,opts,stopped:false};window.__mcpStub.watches.push(w);
   const pr=n=>({number:n,title:'Change '+n,html_url:'https://github.com/acme/firmware/pull/'+n,state:[755,701].includes(n)?'closed':'open',merged:n===755,merged_at:n===755?'2026-10-27T12:00:00Z':null,draft:n===700,user:{login:'sam'},updated_at:'2026-10-27T12:00:00Z',head:{ref:'feature'}});
   const payload=tool==='search_pull_requests'?{items:[]}:input.method==='get_check_runs'?{check_runs:[{status:'completed',conclusion:input.pullNumber===742?'failure':'success'}]}:input.method==='get_reviews'?[{state:'APPROVED',user:{login:'kim'}}]:pr(input.pullNumber);
   setTimeout(()=>{if(!w.stopped)handler({type:'data',result:{payload}});},0);return ()=>{w.stopped=true;};
  };return mcp;
 };
}
async function openClaude(page,server,mode){
 await page.addInitScript(stubLiveClaude,mode);
 // A connector stub is the only allowed transport; fail any attempted fetch/XHR.
 const requests=[];await page.route('**/*',route=>{const request=route.request();if(['fetch','xhr'].includes(request.resourceType())){requests.push(request.url());return route.abort();}return route.continue();});
 const root=await open(page,server,fixture(),false);return {root,requests};
}
test('P1 P4 P5 P7 P9 claude connector paints Jira nodes and Flagged edges with cached time',async({page,server})=>{
 const {root,requests}=await openClaude(page,server,'data'),section=root.locator('#section-delivery');
 await expect(section.locator('g.node[data-dv-node="hardware"]')).toHaveClass(/dv-live-active/);
 await expect(section.locator('path.edge[data-dv-edge="0"]')).toHaveClass(/dv-live-blocked/);
 await expect(section.locator('g.node[data-dv-node="ux"]')).toHaveClass(/dv-live-missing/);
 await expect(root.locator('.dv-live-connection')).toHaveAttribute('data-state','connected');await expect(root.locator('.dv-live-connection')).toContainText('Jira connected, refreshed');
 const registrations=await page.evaluate(()=>__mcpStub.watches.map(({server,tool,input,opts})=>({server,tool,input,opts})));
 expect(registrations).toHaveLength(2);expect(registrations[0].server).toBe('Mock-atlassian');expect(registrations[0].opts).toEqual({refetchInterval:60000});expect(registrations[1].input.jql).toBe(registrations[0].input.jql+' AND Flagged = Impediment');
 await root.locator('.dv-live-toggle').click();await expect(root.locator('.dv-live-active,.dv-live-blocked,.dv-live-missing')).toHaveCount(0);
 await page.evaluate(()=>__mcpStub.watches.forEach(w=>w.deliver()));expect(await page.evaluate(()=>__mcpStub.watches.some(w=>w.stopped))).toBe(false);
 await root.locator('.dv-live-toggle').click();await expect(section.locator('g.node[data-dv-node="hardware"]')).toHaveClass(/dv-live-active/);expect(requests).toEqual([]);
});
test('P3 missing claude Atlassian connector shows setup note without paint or calls',async({page,server})=>{
 const {root,requests}=await openClaude(page,server,'missing');
 await expect(root.locator('.dv-live-note')).toHaveText('Add the Atlassian connector in claude.ai Settings → Connectors to see live ticket status.');await expect(root.locator('.dv-live-note')).toBeVisible();
 await expect(root.locator('.dv-live-todo,.dv-live-active,.dv-live-done,.dv-live-blocked,.dv-live-missing')).toHaveCount(0);
 expect(await page.evaluate(()=>__mcpStub.calls)).toEqual([]);expect(requests).toEqual([]);
});
test('P6 claude Jira approval is an explicit click and repeats the search exactly once',async({page,server})=>{
 const {root,requests}=await openClaude(page,server,'approval'),action=root.getByRole('button',{name:'Allow Jira',exact:true});
 await expect(action).toBeVisible();await expect(root.locator('.dv-live-note')).toHaveText('Jira access needs your approval');
 expect(await page.evaluate(()=>__mcpStub.calls.filter(c=>c.tool==='searchJiraIssuesUsingJql').length)).toBe(0);
 await action.click();await expect(root.locator('#section-delivery g.node[data-dv-node="hardware"]')).toHaveClass(/dv-live-active/);
 expect(await page.evaluate(()=>__mcpStub.calls.filter(c=>c.tool==='searchJiraIssuesUsingJql').length)).toBe(1);await expect(action).toBeHidden();expect(requests).toEqual([]);
});


test('S2 P1 explicit demo takes precedence over the claude connector',async({page,server})=>{
 await page.addInitScript(stubLiveClaude,'data');
 const root=await openStory(page,server);
 await expect(root.locator('.dv-live-demo')).toBeVisible();
 await expect(root.locator('.dv-live-note')).toContainText('Day 1');
 await root.getByRole('button',{name:'Next day',exact:true}).click();
 await expect(root.locator('.dv-live-note')).toContainText('Day 2');
 expect(await page.evaluate(()=>__mcpStub.calls)).toEqual([]);
 expect(await page.evaluate(()=>__mcpStub.watches)).toEqual([]);
});

/* B1–B10 story panel matrix: B1 per-step tickets/team context; B2 caption;
 B3 shipped Play pauses and focuses badge; B4 First blocker uses current path;
 B5 real demo changes populate Activity; B6 stale helper/paint in VM;
 B7 dialog/ring/verdict/downstream/missing/Escape; B8 built demo final day;
 B9 reduced motion + print here and no-ticket DOM in V11; B10 docs/validator in VM.
 All cases use desktop reader dimensions; mobile document editing is out of scope. */
test('B1 selected edges highlight endpoints but list only directly authored tickets',async({page,server})=>{
 const spec=fixture(),d=spec.page.sections[0].diagram;
 d.view='step';d.autoplay=false;
 d.steps=[
  {id:'edge',edge:'hardware->firmware',text:'Integration work only'},
  {id:'failed',failures:{'hardware->firmware':'dropped'},text:'Failed integration work only'},
  {id:'explicit',edges:['hardware->firmware'],nodes:['firmware'],text:'Include firmware implementation'},
  {id:'untracked',edge:'backend->ux',text:'Untracked integration'}
 ];delete d.paths;
 const root=await open(page,server,spec),section=root.locator('#section-delivery'),bar=section.locator('.termbar'),row=bar.locator('.dv-live-step-tickets');
 async function endpoints(){
  for(const id of ['hardware','firmware'])await expect(section.locator('g.node[data-dv-node="'+id+'"]')).toHaveClass(/\blit\b/);
 }
 await expect(row.locator('a')).toHaveText(['HW-124','FW-46']);await endpoints();
 await expect(bar.locator('.dv-live-caption')).toContainText('BLOCKED · HW-124');
 await section.locator('.schip[data-step-source="1"]').first().click();
 await expect(row.locator('a')).toHaveText(['HW-124','FW-46']);
 // Failed delivery keeps the existing source-only focus.
 await expect(section.locator('g.node[data-dv-node="hardware"]')).toHaveClass(/\blit\b/);
 await expect(section.locator('g.comm-failure')).not.toHaveCount(0);
 await section.locator('.schip[data-step-source="2"]').first().click();
 await expect(row.locator('a')).toHaveText(['HW-124','FW-46','FW-45']);await endpoints();
 await expect(row.getByRole('link',{name:'HW-123',exact:true})).toHaveCount(0);
 await section.locator('.schip[data-step-source="0"]').first().click();
 await expect(row.locator('a')).toHaveText(['HW-124','FW-46']);
 await section.locator('.schip[data-step-source="3"]').first().click();await expect(row).toHaveCount(0);
 await expect(section.locator('g.node[data-dv-node="backend"]')).toHaveClass(/\blit\b/);
 await expect(section.locator('g.node[data-dv-node="ux"]')).toHaveClass(/\blit\b/);
 await expect(bar.locator('.dv-live-caption')).toContainText('MISSING · BE-68');
});
test('B1 step ticket links sit beneath prose before evidence and follow navigation without team-wide tickets',async({page,server},testInfo)=>{
 await page.clock.install();
 await page.addInitScript(()=>{window.flowviewLiveStatus={provider:()=>new Promise(resolve=>{window.__resolveStepStatus=resolve;})};});
 const spec=fixture(),d=spec.page.sections[0].diagram;
 // This layout/focus scenario intentionally includes endpoint work in each step.
 d.steps[0].nodes=['hardware','firmware'];d.steps[1].nodes=['backend','ux'];d.steps[2].nodes=['hardware','firmware','backend','ux'];
 spec.page.lanes={TEAM:{label:'Delivery team',color:'#146d55'}};spec.page.tracking.jira.epic='DEL-1';
 // A local Jira stub exercises real new-tab activation while the browser audit keeps all traffic offline.
 spec.page.tracking.jira.site=server.origin+'/jira';const ticketURL=server.origin+'/jira/browse/HW-124';
 d.view='step';d.autoplay=false;d.steps.forEach(step=>{step.lane='TEAM';});
 d.steps[0].text='Press the **doorbell** to send an event to the controller.';
 d.steps.push({id:'untracked',lane:'TEAM',text:'Describe the next planning discussion.'});d.paths[0].steps.push('untracked');
 const root=await open(page,server,spec,false),section=root.locator('#section-delivery'),bar=section.locator('.termbar'),row=bar.locator('.dv-live-step-tickets');
 const keys=['HW-124','FW-46','HW-123','FW-45'];
 await expect(row.locator('a')).toHaveText(keys);await expect(bar.locator('.dv-live-caption')).toHaveCount(0);
 await expect(row.locator('.dv-live-step-title')).toHaveCount(0);
 await expect(bar.locator('.lanepill')).toBeHidden();await expect(row.locator('.dv-live-step-state')).toHaveText(['No status','No status','No status','No status']);await expect(bar.locator('.step-text strong')).toHaveText('doorbell');
 expect(await row.evaluate(el=>{
  const host=el.parentElement,range=document.createRange();range.setStart(host,0);range.setEndBefore(el);
  return el.getBoundingClientRect().top>=range.getBoundingClientRect().bottom;
 })).toBe(true);
 const ticket=row.getByRole('link',{name:'HW-124',exact:true});
 await expect(ticket).toHaveAttribute('href',ticketURL);await expect(ticket).toHaveAttribute('rel','noopener noreferrer');
 await page.context().route(server.origin+'/jira/browse/**',route=>route.fulfill({body:'Jira ticket'}));
 for(const keyboard of [true,false]){
  const popupPromise=page.waitForEvent('popup');
  if(keyboard){await ticket.focus();await page.keyboard.press('Enter');}else await ticket.click();
  const popup=await popupPromise;await popup.waitForLoadState();expect(popup.url()).toBe(ticketURL);await popup.close();
 }
 await ticket.focus();await expect.poll(()=>page.evaluate(()=>typeof window.__resolveStepStatus)).toBe('function');
 await page.evaluate(()=>window.__resolveStepStatus({'HW-124':{state:'active',title:'Repair <strong>doorbell</strong> & delivery'},'FW-46':{state:'todo',title:'  '},'BE-67':{state:'done'},'DEL-99':{state:'todo',epic:'DEL-1',lane:'TEAM'}}));
 await expect(row.locator('.dv-live-step-title')).toHaveText(['Repair <strong>doorbell</strong> & delivery']);await expect(row.locator('.dv-live-step-title strong')).toHaveCount(0);
 await expect(bar.locator('.dv-live-caption')).toContainText('IN PROGRESS');await expect(ticket).toBeFocused();await expect(row.locator('a')).toHaveText(keys);await expect(row.locator('.dv-live-step-state')).toHaveText(['In progress','To do','No status','No status']);
 await row.scrollIntoViewIfNeeded();await page.screenshot({path:testInfo.outputPath('step-ticket-title.png')});
 await page.clock.runFor(30001);await page.evaluate(()=>window.__resolveStepStatus({'HW-124':{state:'done'},'FW-46':{state:'todo'},'HW-123':{state:'blocked'},'FW-45':{state:'missing'}}));
 await expect(bar.locator('.dv-live-caption')).toContainText('BLOCKED');await expect(row).toHaveCount(1);await expect(ticket).toBeFocused();
 await expect(row.locator('.dv-live-step-state')).toHaveText(['Done','To do','Blocked','Missing']);
 await expect(row.locator('.dv-live-step-title')).toHaveCount(0);
 const longTitle='Restore delivery after the controller reconnects and preserve every queued event. '.repeat(12)+'UnbrokenReference'.repeat(18);
 await ticket.evaluate(el=>{el.__titleAnchor=true;});
 await page.clock.runFor(30001);await page.evaluate(title=>window.__resolveStepStatus({'HW-124':{state:'done',title},'FW-46':{state:'todo'},'HW-123':{state:'blocked'},'FW-45':{state:'missing'}}),longTitle);
 await expect(row.locator('.dv-live-step-title')).toHaveText(longTitle);await expect(row.locator('.dv-live-step-title')).toHaveAttribute('title',longTitle);await expect(ticket).toBeFocused();expect(await ticket.evaluate(el=>el.__titleAnchor)).toBe(true);
 expect(await row.locator('.dv-live-step-ticket').first().evaluate(el=>{
  const title=el.querySelector('.dv-live-step-title'),key=el.querySelector('.nbacklink'),state=el.querySelector('.dv-live-step-state');
  const bounds=el.closest('.stepline').getBoundingClientRect(),titleBox=title.getBoundingClientRect(),keyBox=key.getBoundingClientRect(),stateBox=state.getBoundingClientRect();
  const style=getComputedStyle(title),range=document.createRange();range.selectNodeContents(title);
  const lines=Array.from(range.getClientRects());
  return {singleLine:lines.length>0 && lines.every(rect=>Math.abs(rect.top-lines[0].top)<1) && getComputedStyle(el).flexWrap==='nowrap',separate:keyBox.right<=titleBox.left && titleBox.right<=stateBox.left,withinCaption:keyBox.left>=bounds.left-1 && stateBox.right<=bounds.right+1,truncated:title.scrollWidth>title.clientWidth && style.whiteSpace==='nowrap' && style.overflow==='hidden' && style.textOverflow==='ellipsis'};
 })).toEqual({singleLine:true,separate:true,withinCaption:true,truncated:true});
 await row.scrollIntoViewIfNeeded();await page.screenshot({path:testInfo.outputPath('step-ticket-long-title.png')});
 await page.clock.runFor(30001);await page.evaluate(()=>window.__resolveStepStatus({'HW-124':{state:'done',title:'  '},'FW-46':{state:'todo'},'HW-123':{state:'blocked'},'FW-45':{state:'missing'}}));
 await expect(row.locator('.dv-live-step-title')).toHaveCount(0);await expect(ticket).toBeFocused();expect(await ticket.evaluate(el=>el.__titleAnchor)).toBe(true);
 expect(await row.locator('.dv-live-step-ticket').evaluateAll(els=>els.every((el,index)=>!index || el.getBoundingClientRect().top>=els[index-1].getBoundingClientRect().bottom))).toBe(true);
 await row.scrollIntoViewIfNeeded();await page.screenshot({path:testInfo.outputPath('step-ticket-links.png')});
 await section.locator('.schip[data-step-source="1"]').first().click();await expect(row.locator('a')).toHaveText(['BE-67','UX-89','BE-68']);
 await section.locator('.path-chip[data-dv-path="retry"]').click();await section.locator('.schip[data-step-source="2"]').first().click();
 await expect(row.locator('a')).toHaveText(['HW-124','FW-46','HW-123','FW-45','BE-67','UX-89','BE-68']);
 await expect(row.locator('.dv-live-step-state')).toHaveText(['Done','To do','Blocked','Missing','No status','No status','No status']);
 await bar.locator('.stepline:not(.dv-caption-old)').scrollIntoViewIfNeeded();
 await expect(row.locator('.dv-live-step-ticket').first()).toBeInViewport();await expect(row.locator('.dv-live-step-ticket').last()).toBeInViewport();await expect(bar.locator('.dv-live-caption')).toBeInViewport();
 await page.screenshot({path:testInfo.outputPath('step-ticket-links-seven.png')});
 await section.getByRole('button',{name:'Ambient',exact:true}).click();await expect(row).toHaveCount(0);
 await section.locator('.schip[data-step-source="0"]').first().click();await expect(row).toHaveCount(1);
 await root.locator('.dv-live-toggle').click();await expect(row).toHaveCount(0);await expect(bar.locator('.lanepill')).toBeHidden();await root.locator('.dv-live-toggle').click();await expect(row).toHaveCount(1);
 await section.locator('.path-chip[data-dv-path="normal"]').click();await section.locator('.schip[data-step-source="3"]').first().click();await expect(row).toHaveCount(0);
});
test('B1 regular diagrams keep authored lane chips beside status boards, including when Live is off',async({page,server})=>{
 const spec=fixture(),board=spec.page.sections[0].diagram;spec.page.lanes={TEAM:{label:'Delivery team',color:'#146d55'}};
 board.view='step';board.autoplay=false;board.steps.forEach(step=>{step.lane='TEAM';});
 spec.page.sections.push({id:'regular',heading:'Ordinary diagram',diagram:{view:'step',autoplay:false,nodes:{a:{title:'Ordinary work'}},rows:[['a']],steps:[{lane:'TEAM',nodes:['a'],text:'Keep the authored team context.'}]}});
 const root=await open(page,server,spec),boardPill=root.locator('#section-delivery .lanepill'),regularPill=root.locator('#section-regular .lanepill');
 await expect(boardPill).toBeHidden();
 await root.getByRole('button',{name:'Ordinary diagram',exact:true}).click();await expect(regularPill).toBeVisible();await expect(regularPill).toHaveText('Delivery team');
 await root.getByRole('button',{name:'From button press to resident notification',exact:true}).click();
 await root.locator('.dv-live-toggle').click();await expect(boardPill).toBeHidden();
 await root.getByRole('button',{name:'Ordinary diagram',exact:true}).click();await expect(regularPill).toBeVisible();
 await root.getByRole('button',{name:'From button press to resident notification',exact:true}).click();
 await root.locator('#section-delivery .schip[data-step-source="1"]').first().click();await expect(boardPill).toBeHidden();
});
test('B1 grid captions retain safe runtime ticket URLs and plain keys beneath authored prose',async({page,server})=>{
 const spec=fixture(),d=spec.page.sections[0].diagram;delete spec.page.tracking;
 // Explicit work keeps four/seven ticket rows for the grid overflow contract.
 d.steps[0].nodes=['hardware','firmware'];d.steps[2].nodes=['hardware','firmware','backend','ux'];
 d.view='step';d.autoplay=false;
 d.layouts=[{id:'chapter',name:'Chapter',presentation:'standard',playbackPosition:'above',sectionLayout:{columns:24,default:[{x:0,y:0,w:24,h:12}]},exploreLayout:{steps:{textPosition:'right'}}}];
 await page.addInitScript(()=>{window.flowviewLiveStatus={provider:()=>({'HW-124':{state:'todo',url:'https://runtime.test/HW-124'},'FW-46':{state:'todo',url:'javascript:alert(1)'}})};});
 const root=await open(page,server,spec,false),bar=root.locator('#section-delivery .termbar'),row=bar.locator('.dv-live-step-tickets');
 await expect(row.locator('.nbacklink')).toHaveText(['HW-124','FW-46','HW-123','FW-45']);await expect(row.locator('a')).toHaveCount(1);await expect(row.locator('a')).toHaveAttribute('href','https://runtime.test/HW-124');
 await expect(row.locator('span.nbacklink')).toHaveText(['FW-46','HW-123','FW-45']);await expect(row.locator('.dv-live-step-state')).toHaveText(['To do','To do','No status','No status']);
 expect(await row.evaluate(el=>{const range=document.createRange();range.setStart(el.parentElement,0);range.setEndBefore(el);return el.getBoundingClientRect().top>=range.getBoundingClientRect().bottom;})).toBe(true);
 await root.locator('#section-delivery .path-chip[data-dv-path="retry"]').click();await root.locator('#section-delivery .schip[data-step-source="2"]').first().click();
 await expect(row.locator('.dv-live-step-ticket')).toHaveCount(7);
 // Authored control regions may scroll; the last ticket and aggregate caption must remain reachable.
 await row.locator('.dv-live-step-ticket').last().scrollIntoViewIfNeeded();await expect(row.locator('.dv-live-step-ticket').last()).toBeInViewport();
 await bar.locator('.dv-live-caption').scrollIntoViewIfNeeded();await expect(bar.locator('.dv-live-caption')).toBeInViewport();
 expect(await row.locator('.dv-live-step-ticket').evaluateAll(els=>els.every((el,index)=>!index || el.getBoundingClientRect().top>=els[index-1].getBoundingClientRect().bottom))).toBe(true);
});
test('B1 B2 B3 B4 B5 B7 B8 story playback stops on blockers and details reach ready',async({page,server})=>{
 const root=await openStory(page,server),next=root.getByRole('button',{name:'Next day',exact:true});
 for(let day=2;day<=4;day++)await next.click();
 const bar=root.locator('.termbar').first();
 // Replay starts at step one, which is the first blocked beat on this path.
 await root.locator('.schip[data-step-source="5"]').first().click();
 await bar.getByRole('button',{name:'Replay',exact:true}).click();
 await expect(bar).toHaveAttribute('data-playback','paused');
 await expect(root.locator('.schip[data-step-source="0"][aria-current="true"]')).toHaveCount(1);
 await expect(bar.locator('.dv-live-caption')).toContainText('BLOCKED · HW-124');
 await expect(root.locator('.dv-live-target:focus').locator('xpath=ancestor-or-self::*[contains(@class,"dv-live-blocked")][1]')).toHaveCount(1);
 await expect(bar.locator('.lanepill')).toBeHidden();
 await root.locator('.schip[data-step-source="5"]').first().click();await root.getByRole('button',{name:'First blocker',exact:true}).click();
 await expect(root.locator('.schip[data-step-source="0"][aria-current="true"]')).toHaveCount(1);await expect(root.locator('.dv-live-target:focus').locator('xpath=ancestor-or-self::*[contains(@class,"dv-live-blocked")][1]')).toHaveCount(1);
 const panel=root.locator('.pt-live-status');
 await expect(panel).toBeVisible();await expect(panel.locator('.ptitle')).toHaveText('Epic status');await expect(panel.locator('.dv-live-verdict')).toHaveCount(0);
 // Epic header box inside the panel (#765): key link, summary, state, stories done / on diagram, counts. Never in the title bar.
 const epic=panel.locator('.dv-live-epic');await expect(epic.locator('.dv-live-epic-key')).toHaveText('DOOR-100');await expect(epic.locator('.dv-live-epic-key')).toHaveAttribute('href','https://acme.atlassian.net/browse/DOOR-100');await expect(epic.locator('.dv-live-epic-title')).toHaveText('Connected doorbell delivery');await expect(epic.locator('.dv-live-epic-state')).toHaveText('active');await expect(epic.locator('.dv-live-epic-progress')).toHaveText(/0 of 7 stories done · 7 of 7 on diagram/);await expect(epic.locator('.dv-live-epic-counts')).toHaveText(/1 blocked · \d+ waiting · 0 outside epic/);await expect(root.locator('.ptitle .dv-live-epic, .reader-nav .dv-live-epic')).toHaveCount(0);
 await expect(panel.locator('h3')).toHaveText(['Tickets','Blockers and dependency chains','Activity']);await expect(panel.locator('.dv-live-tickets th')).toHaveText(['Key','Title','State','Owner','Depends on','PRs']);
 const chain=panel.locator('.dv-live-chain').filter({hasText:'HW-124'});await expect(chain.locator('.dv-live-dep-key')).toHaveText(['HW-124','FW-46']);await expect(chain.locator('.dv-live-chain-holds')).toHaveText(['holds']);
 await expect(panel.locator('.dv-live-completion svg circle')).toHaveCount(2);await expect(panel.locator('[data-live-lane]')).toHaveCount(0);await expect(panel.locator('h3',{hasText:'Teams'})).toHaveCount(0);
 const blocker=panel.locator('.dv-live-blocker').filter({hasText:'HW-124'});await expect(blocker).toContainText(/\d+ downstream carriers · \d+ steps/);await expect(blocker.getByRole('link',{name:'HW-124',exact:true})).toHaveAttribute('href','https://acme.atlassian.net/browse/HW-124');
 await expect(panel.locator('.dv-live-activity')).toContainText('HW-124 · active → blocked');
 await page.emulateMedia({media:'print'});await expect(panel.locator('.pbody')).not.toBeEmpty();await page.emulateMedia({media:'screen'});
 for(let day=5;day<=12;day++){
  await next.click();
  if(day===6)await expect(panel.locator('.dv-live-blocker').filter({hasText:'UX-89'})).toContainText('not found in Jira (deleted, renamed, or no permission)');
 }
 await expect.poll(async()=> (await panel.locator('.dv-live-epic-counts').textContent()).split(' · ')[0]).toBe('Ready to demo');
 // Completed upstream work wears the green check (Chuck, PR #784 review).
 const doneDep=panel.locator('tr[data-live-ticket="FW-46"] .dv-live-dep');await expect(doneDep).toHaveAttribute('data-tone','done');await expect(doneDep.locator('svg[data-icon="check"]')).toHaveCount(1);await expect(doneDep.locator('svg[data-icon="check"]')).toHaveCSS('color',statusLine('done'));await expect(panel.locator('.dv-live-epic-progress')).toHaveText('8 of 8 stories done · 7 of 8 on diagram');await expect(panel.locator('.dv-live-blocker')).toHaveCount(0);await expect(root.getByRole('button',{name:'First blocker',exact:true})).toBeHidden();await expect(panel.locator('.dv-live-completion')).toContainText('11/11');
 await page.keyboard.press('Escape');await expect(panel).toBeVisible();await expect(panel.locator('.pbody')).not.toBeEmpty();
});
test('B2 B3 automatic advancement pauses on the newly selected missing beat; manual navigation remains available',async({page,server})=>{
 await page.clock.install();
 const root=await openStory(page,server),next=root.getByRole('button',{name:'Next day',exact:true});
 for(let day=2;day<=6;day++)await next.click();
 // Route is clear; the next beat involves the missing UX-89 ticket.
 await root.locator('.schip[data-step-source="3"]').first().click();const bar=root.locator('.termbar').first();
 await bar.getByRole('button',{name:'Play',exact:true}).click();await expect(bar).toHaveAttribute('data-playback','playing');await page.clock.runFor(3100);
 await expect(bar).toHaveAttribute('data-playback','paused');await expect(root.locator('.schip[data-step-source="4"][aria-current="true"]')).toHaveCount(1);await expect(bar.locator('.dv-live-caption')).toHaveText('MISSING · UX-89');await expect(root.locator('.dv-live-target:focus').locator('xpath=ancestor-or-self::*[contains(@class,"dv-live-missing")][1]')).toHaveCount(1);
 await bar.getByRole('button',{name:'Next step',exact:true}).click();await expect(root.locator('.schip[data-step-source="5"][aria-current="true"]')).toHaveCount(1);
});
test('B5 B9 reduced motion creates no change pulse after real demo changes',async({page,server})=>{
 const root=await openStory(page,server);await root.getByRole('button',{name:'Next day',exact:true}).click();await expect(root.locator('.dv-live-changed')).toHaveCount(0);
});

test('B5 changing evidence keeps text and geometry steady while only active borders pulse',async({page,server})=>{
 const root=await openStory(page,server),node=root.locator('g.node[data-dv-node="button"]');await page.emulateMedia({reducedMotion:'no-preference'});
 const before=await node.getAttribute('transform');await root.getByRole('button',{name:'Next day',exact:true}).click();
 for(const skin of ['aurora','daylight','editorial','terminal','pastel','blueprint','rose','lavender','lilac']){
  await page.evaluate(s=>window.dvSetSkin(s),skin);await expect(node.locator('.card')).toHaveCSS('animation-name','none');await expect(node).toHaveAttribute('transform',before);
  const halo=node.locator('.dv-live-halo');await expect(halo).toHaveCSS('animation-duration','2.6s');
  const states=await node.evaluate(el=>{const a=el.querySelector('.dv-live-halo').getAnimations()[0];a.pause();a.currentTime=0;const low=getComputedStyle(el.querySelector('.dv-live-halo')).opacity;a.currentTime=1300;return {low,high:getComputedStyle(el.querySelector('.dv-live-halo')).opacity,text:getComputedStyle(el.querySelector('.t1')).opacity,transform:getComputedStyle(el.querySelector('.t1')).transform};});
  expect(+states.high).toBeGreaterThan(+states.low);expect(states.text).toBe('1');expect(states.transform).toBe('none');
 }
});

test('E6 E10 E11 built epic Tickets table lists all children without diagram links',async({page,server})=>{
 const root=await openStory(page,server),next=root.getByRole('button',{name:'Next day',exact:true});
 for(let day=2;day<=12;day++)await next.click();const panel=root.locator('.pt-live-status'),table=panel.locator('table.dv-live-tickets');
 await expect(table.locator('tbody tr[data-live-ticket]')).toHaveCount(8);await expect(table.locator('tbody tr.dv-live-coverage-row')).toHaveCount(1);await expect(table.locator('th')).toHaveText(['Key','Title','State','Owner','Depends on','PRs']);
 await expect(table.locator('tr[data-live-coverage-for="UX-90"] .dv-live-coverage-tag')).toHaveText('NOT ON DIAGRAM');await expect(table.locator('tr[data-live-ticket="HW-124"] td').nth(3)).toHaveText('Alex');
 await expect(table.locator('tr[data-live-coverage-for="HW-124"],.dv-live-chip')).toHaveCount(0);await expect(panel.locator('.dv-live-epic-counts')).toHaveText(/^Ready to demo · /);await expect(panel.locator('.dv-live-epic-progress')).toHaveText('8 of 8 stories done · 7 of 8 on diagram');
 await page.setViewportSize({width:390,height:844});await expect(table).toBeVisible();expect(await panel.locator('.pbody').evaluate(el=>el.scrollHeight>el.clientHeight || el.scrollWidth>el.clientWidth)).toBe(true);
});
test('E6 desktop Ticket columns give long titles and linked owners room to wrap',async({page,server},testInfo)=>{
 const map={'HW-123':{state:'active',title:'Coordinate device firmware events with notification delivery across every supported household configuration',assignee:'Alexandria Catherine Montgomery',assigneeId:'person-1'},'FW-45':{state:'active',title:'Deliver firmware events',dependsOn:[{key:'HW-123',source:'jira',linkType:'is blocked by'}]},'BE-67':{state:'done'}};
 await page.addInitScript(value=>{window.flowviewLiveStatus={provider:async()=>value};},map);
 const root=await open(page,server,fixture(),false),panel=root.locator('.pt-live-status'),scroll=panel.locator('.dv-live-tickets-scroll'),table=panel.locator('.dv-live-tickets');
 await expect(panel.locator('tr[data-live-ticket="HW-123"] .dv-live-ticket-owner a')).toHaveText('Alexandria Catherine Montgomery');
 await panel.evaluate(el=>{el.style.width='700px';el.style.maxWidth='700px';});
 await expect.poll(()=>scroll.evaluate(el=>el.clientWidth)).toBeGreaterThan(600);
 const sizes=await table.evaluate(el=>{const row=el.querySelector('tr[data-live-ticket="HW-123"]'),title=row.querySelector('.dv-live-ticket-title'),owner=row.querySelector('.dv-live-ticket-owner'),link=owner.querySelector('a'),range=document.createRange();range.selectNodeContents(title);return {titleLines:range.getClientRects().length,ownerHeight:link.getBoundingClientRect().height,ownerWidth:owner.getBoundingClientRect().width,linkWidth:link.getBoundingClientRect().width,ownerDisplay:getComputedStyle(link).display,ownerAlignment:getComputedStyle(link).textAlign,scrollWidth:el.scrollWidth};});
 expect(sizes.titleLines).toBeGreaterThan(1);expect(sizes.ownerHeight).toBeGreaterThan(30);expect(sizes.ownerDisplay).toBe('inline-block');expect(sizes.ownerAlignment).toBe('center');expect(sizes.linkWidth).toBeLessThanOrEqual(sizes.ownerWidth);expect(sizes.scrollWidth).toBeLessThanOrEqual(720);
 await panel.screenshot({path:testInfo.outputPath('status-panel-widths.png')});
});
test('E8 desktop page Parent controls validate preserve history export and demo',async({page,server})=>{
 await page.setViewportSize({width:1440,height:1000});await useProjectDownloads({page});await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(raw));await prepareEditorSurface(page);
 const src=page.locator('#src'),settings=async()=>{await page.locator('#editor-tab-inspect').click();await page.locator('#document-settings').click();};await settings();
 const input=page.locator('#guide').getByLabel('Parent',{exact:true}),before=await src.inputValue();await input.fill('bad');await input.press('Enter');await expect(src).toHaveValue(before);await expect(page.locator('#guide .ierr')).toContainText('Jira key');
 for(const key of ['DOOR-100','INIT-100']){
  const previous=await src.inputValue();await input.fill(key);await input.press('Enter');await expect.poll(async()=>JSON.parse(await src.inputValue()).page.tracking.jira.epic).toContain(key);const changed=await src.inputValue();
  await page.locator('#undo-builder').click();await expect(src).toHaveValue(previous);await page.locator('#redo-builder').click();await expect(src).toHaveValue(changed);await settings();
 }
 const both=await src.inputValue();await page.locator('#guide').getByRole('button',{name:'Remove parent 1',exact:true}).click();await expect.poll(async()=>JSON.parse(await src.inputValue()).page.tracking.jira.epic).toEqual(['INIT-100']);await page.locator('#undo-builder').click();await expect(src).toHaveValue(both);await page.locator('#redo-builder').click();
 const demo=page.getByRole('checkbox',{name:'Demo live status',exact:true});await demo.check();await expect(page.locator('#docview g.node[data-dv-node="hardware"]')).toHaveClass(/dv-live-(todo|active|done|blocked)/);const final=await src.inputValue();
 const pending=page.waitForEvent('download');await page.locator('#workspace-export-trigger').click();await page.locator('#file-save').click();const files=await projectFiles(await pending),saved=JSON.parse(files[Object.keys(files).find(k=>k.endsWith('.spec.json'))]);
 expect(saved.page.sections[0].diagram.panels).toEqual(raw.page.sections[0].diagram.panels);await expect(page.locator('#docview .pt-live-status .dv-live-head .dv-live-note')).toContainText('Demo day');
 expect(saved.page.tracking.jira).toEqual({site:'https://acme.atlassian.net',epic:['INIT-100']});expect(await src.inputValue()).toBe(final);
});

test('E6 detail carrier has no panel link while authored detail navigation still works',async({page,server})=>{
 const root=await open(page,server),panel=root.locator('.pt-live-status');
 await expect(root.locator('#section-delivery [data-dv-node="hardware"] .card.dv-live-target')).toBeVisible();
 for(let visit=0;visit<2;visit++){
  await expect(panel).toBeVisible();
  await expect(panel.locator('tr[data-live-coverage-for="HW-123"],.dv-live-chip')).toHaveCount(0);await root.locator('#section-delivery [data-dv-detail="hardware"]').click();
  const child=root.locator('[data-dv-detail-preview] [data-dv-node="child"] .card');
  await expect(child).toBeVisible();await expect(panel).toBeHidden();
  // The rendered back button includes the arrow in its accessible name.
  const back=root.locator('[data-dv-detail-preview] .detail-breadcrumb').getByRole('button',{name:/Overview$/});
  await expect(back).toBeVisible();await back.click();
  await expect(root.locator('[data-dv-detail-preview]')).toHaveCount(0);
 }
});

test('L4 unlinked detail carriers have no panel links',async({page,server})=>{
 const spec=fixture();delete spec.page.sections[0].diagram.nodes.hardware.detail;
 const child=spec.page.sections[1].diagram;child.nodes.end={title:'End'};child.rows=[['child','end']];child.edges=[{from:'child',to:'end',label:'Unlinked call',tickets:['BE-68']}];
 const root=await open(page,server,spec),panel=root.locator('.pt-live-status');
 for(const key of ['HW-123','BE-68'])await expect(panel.locator('tr[data-live-coverage-for="'+key+'"]')).toHaveCount(0);await expect(panel.locator('.dv-live-chip')).toHaveCount(0);
 await expect(root.locator('.dv-live-carrier-preview')).toHaveCount(0);await expect(root.locator('#section-detail')).toBeHidden();expect(await page.locator('#flowspec').evaluate(el=>JSON.parse(el.textContent))).toEqual(spec);
});

test('L3 L4 L5 L10 live-status panel is beside the diagram without a click and keeps its print paint',async({page,server})=>{
 const root=await openStory(page,server),panel=root.locator('.pt-live-status'),body=panel.locator('.pbody'),head=body.locator('.dv-live-head');
 await expect(body).toBeVisible();await expect(panel.locator('.ptitle')).toHaveText('Epic status');
 const diagram=root.locator('.section-layout-tile[data-layout-key="diagram"]'),tile=panel.locator('xpath=ancestor::*[contains(@class,"section-layout-tile")][1]');
 // Default arrangement (Chuck 2026-10-27): panel in the left half, diagram with attached step controls in the right half, both visible on open.
 const a=await diagram.boundingBox(),b=await tile.boundingBox();expect(b.x+b.width).toBeLessThanOrEqual(a.x+2);expect(Math.abs(b.y-a.y)).toBeLessThan(2);expect(b.width).toBeGreaterThan(300);
 await expect(head.locator('.dv-live-connection')).toHaveAttribute('data-state','demo');await expect(head.locator('.dv-live-connection')).toContainText('Demo, refreshed');await expect(root.locator('time.dv-live-updated')).toHaveCount(0);
 await expect(root.locator('.reader-navigation > .dv-live-control')).toHaveCount(0);await expect(root.locator('.dv-live-popover[popover],.dv-live-panel[popover],.dv-live-carrier-preview[popover]')).toHaveCount(0);
 await head.locator('.dv-live-toggle').click();await expect(root.locator('.dv-live-target')).toHaveCount(0);await head.locator('.dv-live-toggle').click();await expect(root.locator('.dv-live-target').first()).toBeVisible();
 await head.getByRole('button',{name:'Next day',exact:true}).click();await expect(head.locator('.dv-live-note')).toContainText('Day 2');
 for(let day=3;day<=12;day++)await head.getByRole('button',{name:'Next day',exact:true}).click();
 await expect(body.locator('tr[data-live-coverage-for="UX-90"]')).toContainText('NOT ON DIAGRAM');await expect(body.locator('.dv-live-epic-progress')).toContainText('7 of 8 on diagram');
 await expect(body.locator('tr[data-live-coverage-for="HW-124"],.dv-live-chip')).toHaveCount(0);
 await page.emulateMedia({media:'print'});await expect(body).not.toBeEmpty();await expect(body.locator('table.dv-live-tickets')).toBeVisible();
});

test('L4 loaded external carriers have no panel links without another load',async({page,server})=>{
 await page.setViewportSize({width:1440,height:1000});
 await writeFile(path.join(server.root,'coverage-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
 await writeFile(path.join(server.root,'coverage-native.html'),'<style>body{margin:0}#host{position:fixed;inset:0}</style><div id="host"></div><script type="module">import {mountNativeViewer} from "./coverage-native.js";window.mount=mountNativeViewer;</script>');
 await page.goto(server.origin+'/coverage-native.html');await page.waitForFunction(()=>!!window.mount);
 for(const detailOnly of [false,true]){
  await page.evaluate(detailOnly=>{
   const panels=[{id:'status',type:'live-status',title:'Epic status'}];
   const raw={page:{sections:[{id:'main',diagram:{panels,nodes:{parent:{title:'Parent',tickets:['AA-1'],detail:{spec:'approved',section:'entry'}}},rows:[['parent']]}}]}};
   const remote={page:{tracking:{jira:{site:'https://detail.test',epic:'EP-1'}},sections:[{id:'entry',heading:'Entry',diagram:{panels,nodes:{entry:{title:'Entry'}},rows:[['entry']]}},{id:'unrelated',detailOnly,heading:'Unrelated work',diagram:{nodes:{child:{title:'Remote carrier',tickets:['CH-1']},end:{}},rows:[['child','end']],edges:[{from:'child',to:'end',label:'Remote call',tickets:['CH-2']}]}}]}};
   window.__coverageLoads=0;window.__coverageSource=JSON.stringify([raw,remote]);window.__coverageRaw=[raw,remote];
   window.viewer=window.mount(document.querySelector('#host'),raw,{loadDetail:async()=>{window.__coverageLoads++;return remote;},liveStatus:{provider:async()=>({'AA-1':{state:'done'},'CH-1':{state:'active',epic:'EP-1'},'CH-2':{state:'blocked',epic:'EP-1'}})}});
  },detailOnly);
  const root=page.locator('#host');await root.locator('[data-dv-detail="parent"]').click();await expect(root.locator('[data-dv-detail-preview]')).toBeVisible();
  const panel=root.locator('[data-dv-detail-preview] .pt-live-status');
  for(const key of ['CH-1','CH-2'])await expect(panel.locator('tr[data-live-coverage-for="'+key+'"]')).toHaveCount(0);await expect(panel.locator('.dv-live-chip')).toHaveCount(0);
  expect(await page.evaluate(()=>window.__coverageLoads)).toBe(1);await expect(root.locator('.dv-live-carrier-preview')).toHaveCount(0);
  expect(await page.evaluate(()=>JSON.stringify(window.__coverageRaw))).toBe(await page.evaluate(()=>window.__coverageSource));await page.evaluate(()=>window.viewer.destroy());await expect(root).toBeEmpty();
 }
});

/* Carriers without canvas badges (#762, Chuck 2026-10-27): node/edge paint, coins and the break glyph carry state.
 R1 no .dv-live-badge after apply; a node card click and an edge-label click open the ticket popover; the node
    links trigger keeps its own menu.
 R2 keyboard: in the reader a ticketed node card and edge label are buttons named for their tickets; Enter/Space
    opens the popover, Escape returns focus to the carrier; Tickets table coverage and First blocker focus the carrier.
 R3 Workbench authoring: demo paint shows no badges, carriers stay non-focusable and a card click selects for
    editing without opening the popover. */
const LIVE_SKINS=['aurora','terminal','pastel','blueprint','rose','lavender','lilac','daylight','editorial'];
async function demoDay(root,day){
 const next=root.getByRole('button',{name:'Next day',exact:true});
 for(;;){const note=await root.locator('.dv-live-note').textContent();const current=Number(/Day (\d+)/.exec(note)[1]);if(current>=day)return;await next.click();await expect(root.locator('.dv-live-note')).toContainText('Day '+(current+1)+' —');}
}
test('R1 carriers paint without canvas badges and open the ticket popover from the node card and edge label',async({page,server})=>{
 const root=await openStory(page,server),node=id=>root.locator('g.node[data-dv-node="'+id+'"]'),pop=root.locator('.dv-live-popover');await demoDay(root,4);
 for(const skin of LIVE_SKINS){await page.evaluate(s=>window.dvSetSkin(s),skin);await expect(root.locator('.dv-live-badge'),skin).toHaveCount(0);await expect(node('chime'),skin).toHaveClass(/dv-live-blocked/);}
 await cardClick(node('chime').locator('.card'));await expect(pop).toBeVisible();await expect(pop).toHaveAttribute('aria-label','Live tickets for Indoor chime');
 await expect(pop.getByRole('link',{name:'HW-124',exact:true})).toBeVisible();await page.keyboard.press('Escape');await expect(pop).toBeHidden();
 await root.locator('text.lbl[data-dv-edge="0"]').click();await expect(pop).toBeVisible();await expect(pop).toHaveAttribute('aria-label','Live tickets for press');
 // The press edge carries HW-124 alone (#765 moved FW-46 to the controller); keys stay links named by the key.
 await expect(pop.getByRole('link',{name:'HW-124',exact:true})).toBeVisible();await expect(pop.getByRole('link',{name:'FW-46',exact:true})).toHaveCount(0);
 await page.keyboard.press('Escape');await expect(pop).toBeHidden();
 await cardClick(node('mcu').locator('.card'));await expect(pop).toBeVisible();for(const key of ['FW-45','FW-46'])await expect(pop.getByRole('link',{name:key,exact:true})).toBeVisible();
 await page.keyboard.press('Escape');await expect(pop).toBeHidden();
 await node('mcu').locator('.t1').click();await expect(pop).toHaveAttribute('aria-label','Live tickets for Doorbell controller');await page.keyboard.press('Escape');await expect(pop).toBeHidden();
 await node('mcu').locator('.nrefs-trigger').click();await expect(root.locator('.node-link-menu')).toBeVisible();await expect(pop).toBeHidden();
});
test('R1 edge lines labels live break segments and glyphs open Jira tickets with one keyboard stop',async({page,server})=>{
 const spec=fixture(),d=spec.page.sections[0].diagram;delete d.edges[2].label;d.edges[2].tickets=['FW-45'];
 const root=await open(page,server,spec),section=root.locator('#section-delivery'),pop=root.locator('.dv-live-popover');
 const line=index=>section.locator('path.edge[data-dv-edge="'+index+'"]'),label=index=>section.locator('text.lbl[data-dv-edge="'+index+'"]');
 await expect(line(1)).toHaveClass(/dv-live-missing/);
 await expect(line(1)).not.toHaveAttribute('tabindex');await expect(label(1)).toHaveAttribute('tabindex','0');
 await strokeClick(page,line(1));await expect(pop).toBeVisible();await expect(pop).toHaveAttribute('aria-label','Live tickets for event');
 await expect(pop.getByRole('link',{name:'BE-68',exact:true})).toHaveAttribute('href','https://acme.atlassian.net/browse/BE-68');await expect(pop.locator('.dv-live-ticket')).toHaveCount(1);
 await root.getByRole('heading',{name:'Connected doorbell delivery',exact:true}).click();await expect(pop).toBeHidden();await expect(label(1)).toBeFocused();
 await label(1).click();await expect(pop).toBeVisible();await page.keyboard.press('Escape');await expect(label(1)).toBeFocused();
 const failure=section.locator('g.dv-live-comm-failure[data-dv-edge="0"]');
 await strokeClick(page,failure.locator('.comm-before'));await expect(pop).toHaveAttribute('aria-label','Live tickets for press');
 for(const key of ['HW-124','FW-46'])await expect(pop.getByRole('link',{name:key,exact:true})).toHaveAttribute('href','https://acme.atlassian.net/browse/'+key);
 await expect(pop.locator('.dv-live-ticket')).toHaveCount(2);await page.keyboard.press('Escape');await expect(label(0)).toBeFocused();
 await strokeClick(page,failure.locator('.comm-break path'));await expect(pop).toBeVisible();await expect(pop).toHaveAttribute('aria-label','Live tickets for press');await page.keyboard.press('Escape');await expect(label(0)).toBeFocused();
 await expect(label(2)).toHaveCount(0);await expect(line(2)).toHaveAttribute('tabindex','0');await strokeClick(page,line(2));
 await expect(pop).toHaveAttribute('aria-label','Live tickets for backend → ux');await expect(pop.getByRole('link',{name:'FW-45',exact:true})).toHaveAttribute('href','https://acme.atlassian.net/browse/FW-45');
 await page.keyboard.press('Escape');await expect(line(2)).toBeFocused();await page.keyboard.press('Enter');await expect(pop).toBeVisible();await page.keyboard.press('Escape');await page.keyboard.press(' ');await expect(pop).toBeVisible();
 await root.locator('.dv-live-toggle').click();await expect(pop).toBeHidden();await expect(root.locator('.dv-live-pointer,.dv-live-target,.dv-live-comm-failure')).toHaveCount(0);await strokeClick(page,line(1));await expect(pop).toBeHidden();
 await root.locator('.dv-live-toggle').click();await section.locator('.path-chip[data-dv-path="retry"]').click();
 await strokeClick(page,line(1));await expect(pop).toBeVisible();await expect(pop).toHaveAttribute('aria-label','Live tickets for event');
});
test('R1 unlabeled blocked edges use their visible live break for pointer keyboard and restored focus',async({page,server})=>{
 const spec=fixture();delete spec.page.sections[0].diagram.edges[0].label;
 const root=await open(page,server,spec),section=root.locator('#section-delivery'),pop=root.locator('.dv-live-popover');
 const line=section.locator('path.edge[data-dv-edge="0"]'),failure=section.locator('g.dv-live-comm-failure[data-dv-edge="0"]');
 await expect(failure).toHaveAttribute('role','button');await expect(failure).toHaveAttribute('tabindex','0');await expect(line).not.toHaveAttribute('tabindex');
 await strokeClick(page,failure.locator('.comm-before'));await expect(pop).toBeVisible();await expect(pop).toHaveAttribute('aria-label','Live tickets for hardware → firmware');
 await expect(pop.getByRole('link',{name:'HW-124',exact:true})).toHaveAttribute('href','https://acme.atlassian.net/browse/HW-124');
 await page.keyboard.press('Escape');await expect(failure).toBeFocused();await expect(failure).toBeVisible();
 await page.keyboard.press('Enter');await expect(pop).toBeVisible();await page.keyboard.press('Escape');await page.keyboard.press(' ');await expect(pop).toBeVisible();await page.keyboard.press('Escape');
 await root.locator('.dv-live-toggle').click();await expect(root.locator('.dv-live-pointer,.dv-live-target,.dv-live-comm-failure')).toHaveCount(0);
 await root.locator('.dv-live-toggle').click();await strokeClick(page,failure.locator('.comm-break path'));await expect(pop).toBeVisible();await page.keyboard.press('Escape');await expect(failure).toBeFocused();
});
test('R2 keyboard reaches ticketed carriers without panel diagram links',async({page,server})=>{
 const root=await openStory(page,server),node=id=>root.locator('g.node[data-dv-node="'+id+'"]'),pop=root.locator('.dv-live-popover');await demoDay(root,4);
 const card=node('chime').locator('.card'),label=root.locator('text.lbl[data-dv-edge="1"]');
 await expect(card).toHaveAttribute('role','button');await expect(card).toHaveAttribute('tabindex','0');await expect(card).toHaveAttribute('aria-label',/^Live tickets for Indoor chime/);
 await expect(label).toHaveAttribute('role','button');await expect(label).toHaveAttribute('tabindex','0');await expect(label).toHaveAttribute('aria-haspopup','dialog');
 await card.focus();await page.keyboard.press('Enter');await expect(pop).toBeVisible();await expect(card).toHaveAttribute('aria-expanded','true');
 await page.keyboard.press('Escape');await expect(pop).toBeHidden();await expect(card).toBeFocused();
 await label.focus();await page.keyboard.press(' ');await expect(pop).toHaveAttribute('aria-label','Live tickets for ring');await page.keyboard.press('Escape');await expect(label).toBeFocused();
 await expect(node('mcu').locator('.card')).toHaveAttribute('aria-label',/waiting on HW-124/);
 const panel=root.locator('.pt-live-status');await expect(panel.locator('tr[data-live-coverage-for="HW-124"],.dv-live-chip')).toHaveCount(0);
});
test('R3 Workbench demo paint has no badges and a card click selects without the ticket popover',async({page,server})=>{
 await page.setViewportSize({width:1440,height:1000});await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(raw));await prepareEditorSurface(page);
 await page.getByRole('checkbox',{name:'Demo live status',exact:true}).check();const view=page.locator('#docview');
 await expect(view.locator('g.node.dv-live-active,g.node.dv-live-todo,g.node.dv-live-done,g.node.dv-live-blocked').first()).toBeVisible();
 await expect(view.locator('.dv-live-badge')).toHaveCount(0);await expect(view.locator('.card[tabindex],text.lbl[role="button"]')).toHaveCount(0);
 await cardClick(view.locator('g.node[data-dv-node="firmware"] .card'));await expect(view.locator('.dv-live-popover')).toBeHidden();
 await expect(view.locator('g.node[data-dv-node="firmware"]')).toHaveClass(/\bdv-sel\b/);
 await expect(view.locator('.dv-live-pointer')).toHaveCount(0);await strokeClick(page,view.locator('path.edge[data-dv-edge="1"]'));await expect(view.locator('.dv-live-popover')).toBeHidden();
 await expect(view.locator('path.edge[data-dv-edge="1"]')).toHaveClass(/\bdv-sel\b/);
});

/* Canvas label hygiene (#761, Chuck 2026-10-27).
 L1 on every demo day: no per-badge waiting tags; a live-blocked edge shows its break glyph with no canvas text
    (the keys stay in the group's aria-label, the badge and its popover); no dv-live text label box intersects
    another, an edge label, a step coin, a badge or a node card. */
async function liveLabelBoxes(page){
 return page.evaluate(()=>{
  const root=document.querySelector('#docview'),shown=el=>el.checkVisibility() && el.getBoundingClientRect().width>0;
  const box=el=>{const r=el.getBoundingClientRect(),owner=el.closest('[data-dv-edge],[data-dv-node]');return {l:r.left,t:r.top,r:r.right,b:r.bottom,id:(el.getAttribute('class')||el.tagName)+' '+(owner?owner.getAttribute('data-dv-edge')??owner.getAttribute('data-dv-node'):'')+' "'+(el.textContent||'').trim().slice(0,40)+'"'};};
  const all=sel=>[...root.querySelectorAll(sel)].filter(shown).map(box);
  return {labels:all('text[class*="dv-live-"]:not(.lbl)'),edgeLabels:all('text.lbl'),coins:all('g.coin'),cards:all('.node .card'),badges:all('.dv-live-badge>circle'),
   tags:root.querySelectorAll('.dv-live-waiting-tag').length,breakLabels:root.querySelectorAll('.dv-live-break-label').length,
   breaks:[...root.querySelectorAll('g.dv-live-comm-failure')].map(el=>el.getAttribute('aria-label'))};
 });
}
const overlaps=(a,b)=>a.l<b.r && b.l<a.r && a.t<b.b && b.t<a.b;
test('L1 every demo day keeps live text off edge labels, coins, badges and node cards',async({page,server})=>{
 const root=await openStory(page,server);let breaks=0;
 for(let day=1;day<=12;day++){
  await demoDay(root,day);const seen=await liveLabelBoxes(page);
  expect(seen.tags,'day '+day+' waiting tags').toBe(0);
  expect(seen.breakLabels,'day '+day+' live break text').toBe(0);
  for(const label of seen.breaks){breaks++;expect(label,'day '+day+' break keeps its keys for assistive tech').toMatch(/[A-Z]+-\d+/);}
  seen.labels.forEach((a,i)=>{
   seen.labels.slice(i+1).forEach(b=>expect(overlaps(a,b),'day '+day+': '+a.id+' overlaps '+b.id).toBe(false));
   for(const kind of ['edgeLabels','coins','badges','cards'])seen[kind].forEach(c=>expect(overlaps(a,c),'day '+day+': '+a.id+' overlaps '+kind+' '+c.id).toBe(false));
  });
 }
 expect(breaks,'blocked days still draw the break glyph').toBeGreaterThan(0);
});

/* Live paint uses Node Styles rendering, with an internal Azure palette for Active.
 P1 nodes wear `node-styled ns-<preset>` (todo slate, active azure, done moss, blocked/missing rose, waiting slate or rose by upstream tone);
    edges and node cards take that preset's --ns-line in a light and a dark skin; Active coins use a pale Azure fill. Coin numerals follow the
    engine's step-colour rule (stepCircleInk: black or white, whichever contrasts more), which is black on every live fill.
 P2 missing carriers have a dotted rose outline/stroke; blocked ones are solid.
 P3 an authored node `style` yields to live state and returns when Live is turned off. */
const LIVE_PRESET={todo:'slate',active:'azure',done:'moss',blocked:'rose',missing:'rose'};
function statusLine(state){return {todo:'rgb(107, 114, 128)',active:'rgb(22, 102, 199)',done:'rgb(35, 125, 61)',blocked:'rgb(180, 35, 56)',missing:'rgb(225, 75, 90)'}[state];}
async function presetLine(page,token){
 return page.evaluate(t=>{
  const svg=document.querySelector('#docview g.node').ownerSVGElement,g=document.createElementNS('http://www.w3.org/2000/svg','g');g.setAttribute('class','node ns-'+t+(t==='azure'?' dv-live-active':''));svg.appendChild(g);
  const probe=document.createElement('span');probe.style.color=getComputedStyle(g).getPropertyValue('--ns-line').trim();document.body.appendChild(probe);const color=getComputedStyle(probe).color;probe.remove();g.remove();return color;
 },token);
}
test('P1 live nodes wear Node Styles presets; Active coins keep pale Azure interiors in daylight and aurora',async({page,server})=>{
 const root=await openStory(page,server),node=id=>root.locator('g.node[data-dv-node="'+id+'"]');
 await demoDay(root,2);
 for(const skin of ['daylight','aurora']){
  await page.evaluate(s=>window.dvSetSkin(s),skin);await expect.poll(()=>node('button').evaluate(el=>el.style.getPropertyValue('--dv-live-ink'))).toBe(skin==='aurora'?'#ffffff':'#000000');
  await expect(root.locator('path.edge[data-dv-edge="0"]'),skin).toHaveClass(/dv-live-active/);
  await expect(root.locator('path.edge[data-dv-edge="0"]'),skin+' active edge').toHaveCSS('stroke',statusLine('active'));
  const coins=await root.locator('g.coin[data-dv-step]').evaluateAll(els=>els.map(el=>({state:(/dv-live-(todo|active|done|blocked|missing)/.exec(el.getAttribute('class'))||[])[1],fill:getComputedStyle(el.querySelector('circle')).fill,ink:getComputedStyle(el.querySelector('text')).fill})).filter(c=>c.state));
  expect(coins.length,skin+' painted coins').toBeGreaterThan(0);
  for(const coin of coins){expect(coin.fill).toContain('/ 0.15)');expect(coin.ink).toBe(skin==='aurora'?'rgb(255, 255, 255)':'rgb(0, 0, 0)');}
 }
 await demoDay(root,4);
 // Day 4: mcu waits red on the blocked HW-124 (rose); ingest waits grey on the unfinished FW-45 (slate).
 for(const [id,token] of [['chime','rose'],['button','azure'],['mcu','rose'],['ingest','slate']]){await expect(node(id),id).toHaveClass(/\bnode-styled\b/);await expect(node(id),id).toHaveClass(new RegExp('\\bns-'+token+'\\b'));}
 for(const skin of ['daylight','aurora']){
  await page.evaluate(s=>window.dvSetSkin(s),skin);
  for(const [id,token] of [['chime','rose'],['button','azure'],['mcu','rose'],['ingest','slate']])await expect(node(id).locator('.card'),skin+' '+id).toHaveCSS('stroke',statusLine({rose:'blocked',slate:'todo',azure:'active',moss:'done'}[token]));
  await expect(root.locator('path.edge[data-dv-edge="3"]'),skin+' grey waiting edge').toHaveClass(/dv-live-waiting/);await expect(root.locator('path.edge[data-dv-edge="3"]'),skin+' grey waiting edge').toHaveCSS('stroke',statusLine('todo'));
 }
});
test('P2 missing carriers are dotted rose, blocked ones solid rose',async({page,server})=>{
 const root=await openStory(page,server),node=id=>root.locator('g.node[data-dv-node="'+id+'"]');await demoDay(root,6);
 await expect(node('app')).toHaveClass(/dv-live-missing/);await expect(node('app')).toHaveClass(/\bns-rose\b/);
 await expect(node('app').locator('.card')).toHaveCSS('stroke-dasharray','6px, 4px');
 await expect(root.locator('path.edge[data-dv-edge="4"]')).toHaveClass(/dv-live-missing/);await expect(root.locator('path.edge[data-dv-edge="4"]')).toHaveCSS('stroke-dasharray','6px, 4px');
 await expect(node('chime')).toHaveClass(/dv-live-blocked/);await expect(node('chime').locator('.card')).toHaveCSS('stroke-dasharray','none');
});
test('P3 an authored node style yields to live paint and returns when Live is off',async({page,server})=>{
 for(const authored of ['teal','amber']){
  const spec=fixture();spec.page.sections[0].diagram.nodes.hardware.style=authored;
  const root=await open(page,server,spec),hw=root.locator('#section-delivery g.node[data-dv-node="hardware"]');
  await expect(hw).toHaveClass(/dv-live-active/);await expect(hw).toHaveClass(/\bns-azure\b/);await expect(hw).not.toHaveClass(new RegExp('\\bns-'+authored+'\\b'));
  const live=root.locator('.dv-live-toggle');await live.click();await expect(hw).not.toHaveClass(/dv-live-active/);
  await expect(hw).toHaveClass(/\bnode-styled\b/);await expect(hw).toHaveClass(new RegExp('\\bns-'+authored+'\\b'));await expect(hw).not.toHaveClass(/\bns-azure\b/);
  await expect(hw.locator('.card')).toHaveCSS('stroke',await presetLine(page,authored));
  await live.click();await expect(hw).toHaveClass(/\bns-azure\b/);
 }
});

test('G2 G7 G11 GitHub icons carry state checks and review in the Tickets table and popover while Jira-only stays plain',async({page,server})=>{
 await page.addInitScript({content:'('+stubLiveClaude.toString()+')("data");('+stubLiveGithub.toString()+')();'});await page.emulateMedia({reducedMotion:'reduce'});
 const spec={page:{tracking:{jira:{site:'https://acme.atlassian.net'},github:{repos:['acme/firmware']}},sections:[{diagram:{nodes:{a:{title:'Work',tickets:['HW-123'],prs:[742,755,700,701].map(n=>'https://github.com/acme/firmware/pull/'+n).concat('https://code.test/pull/1')}},rows:[['a']],panels:[{id:'status',type:'live-status',title:'Epic status'}]}}]}};
 const root=await open(page,server,spec,false),node=root.locator('g.node[data-dv-node="a"]');await expect(node).toHaveClass(/dv-live-active/);const table=root.locator('.dv-live-tickets'),icons=table.locator('a.dv-live-pr-link[data-pr-state]');
 await expect(icons).toHaveCount(4);await expect(table.locator('a.dv-live-pr-link')).toHaveCount(5);
 // Pastel takes the presets' light lines: moss, violet, slate, rose (src/style.core.css, node style presets).
 const colour={open:'rgb(83, 154, 67)',merged:'rgb(155, 107, 206)',draft:'rgb(110, 137, 165)',closed:'rgb(209, 90, 99)'};
 for(const [n,state] of [[742,'open'],[755,'merged'],[700,'draft'],[701,'closed']]){const icon=table.locator('a.dv-live-pr-link[href="https://github.com/acme/firmware/pull/'+n+'"]');await expect(icon).toHaveAttribute('data-pr-state',state);await expect(icon).toHaveAttribute('aria-label',new RegExp('^Pull request #'+n+' Change '+n+' · '+state));await expect(icon).toHaveCSS('color',colour[state]);await expect(icon).toHaveCSS('animation-name','none');await expect(icon).not.toHaveText(/\S/);}
 await expect(table.locator('a[href="https://github.com/acme/firmware/pull/742"]')).toHaveAttribute('title',/checks failing · approved/);await expect(table.locator('a[href="https://github.com/acme/firmware/pull/742"]')).not.toHaveAttribute('title',/ago|updated/);
 await expect(table.locator('.dv-live-pr-checks[data-checks="failing"]')).toHaveCSS('background-color',colour.closed);await expect(table.locator('.dv-live-pr-checks[data-checks="passing"]')).toHaveCSS('background-color',colour.open);
 const plain=table.locator('a[href="https://code.test/pull/1"]');await expect(plain).toBeVisible();await expect(plain).not.toHaveAttribute('data-pr-state',/./);await expect(plain).toHaveAttribute('aria-label','Pull request #1 on code.test');
 await expect(root.locator('.dv-live-connection-github')).toHaveText('GitHub connected');await expect(root.locator('.dv-live-connection')).toHaveAttribute('data-state','connected');
 const card=node.locator('.card');await card.focus();await page.keyboard.press('Enter');const pop=root.locator('.dv-live-popover');await expect(pop).toBeVisible();await expect(pop.locator('a.dv-live-pr-link[data-pr-state]')).toHaveCount(4);await expect(pop.locator('a.dv-live-pr-link[href="https://github.com/acme/firmware/pull/742"]')).toHaveCSS('color',colour.open);
 await page.keyboard.press('Escape');await expect(pop).toBeHidden();await expect(card).toBeFocused();
});
test('G2 G11 Jira-only connector retains plain PR links without GitHub evidence and says so on the connection line',async({page,server})=>{
 const {root}=await openClaude(page,server,'data');await expect(root.locator('g.node').first()).toHaveClass(/dv-live-active/);
 await expect(root.locator('.dv-live-tickets a[href="https://github.com/acme/firmware/pull/88"]').first()).toBeVisible();await expect(root.locator('a.dv-live-pr-link[data-pr-state]')).toHaveCount(0);await expect(root.locator('.dv-live-pr-checks')).toHaveCount(0);
 await expect(root.locator('.dv-live-connection-github')).toHaveText('GitHub not connected');await expect(root.locator('.dv-live-connection')).toHaveAttribute('data-state','connected');
});
test('G12 desktop GitHub scope validates repos and org with one Undo Redo and export',async({page,server})=>{
 await page.setViewportSize({width:1440,height:1000});await useProjectDownloads({page});await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(raw));await prepareEditorSurface(page);
 const src=page.locator('#src'),settings=async()=>{await page.locator('#editor-tab-inspect').click();await page.locator('#document-settings').click();};await settings();const input=page.locator('#guide').getByLabel('GitHub scope',{exact:true});
 const before=await src.inputValue();await input.fill('bad scope!');await input.press('Enter');await expect(src).toHaveValue(before);await expect(page.locator('#guide .ierr')).toContainText('owner/repo');
 for(const [value,want] of [['acme/firmware, acme/backend',{repos:['acme/firmware','acme/backend']}],['org:acme',{org:'acme'}]]){
  const previous=await src.inputValue();await input.fill(value);await input.press('Enter');await expect.poll(async()=>JSON.parse(await src.inputValue()).page.tracking.github).toEqual(want);const changed=await src.inputValue();await page.locator('#undo-builder').click();await expect(src).toHaveValue(previous);await page.locator('#redo-builder').click();await expect(src).toHaveValue(changed);await settings();
 }
 const pending=page.waitForEvent('download');await page.locator('#workspace-export-trigger').click();await page.locator('#file-save').click();const files=await projectFiles(await pending),saved=JSON.parse(files[Object.keys(files).find(k=>k.endsWith('.spec.json'))]);expect(saved.page.tracking.github).toEqual({org:'acme'});expect(saved.page.tracking.jira).toEqual(raw.page.tracking.jira);
});

test('I1 desktop initiative parent auto-detection renders story totals epic context and undisplayed blockers',async({page,server},testInfo)=>{
 await page.setViewportSize({width:1600,height:1200});
 await page.addInitScript(()=>{
  const issue=(key,title,level,state,parent)=>({key,fields:{summary:title,issuetype:{name:level===2?'Program':level===1?'Epic':'Story',hierarchyLevel:level},status:{name:state==='done'?'Done':state==='blocked'?'Blocked':'In Progress',statusCategory:{key:state==='done'?'done':'indeterminate'}},assignee:{displayName:'Alex'},...(parent?{parent:{key:parent}}:{})}});
  const records={
   'INIT-100':issue('INIT-100','Connected resident experience',2,'active'),
   'EP-101':issue('EP-101','Resident notifications',1,'active','INIT-100'),
   'EP-102':issue('EP-102','Device event delivery',1,'active','INIT-100'),
   'ST-1':issue('ST-1','Show the resident notification',0,'done','EP-101'),
   'ST-2':issue('ST-2','Deliver the notification payload',0,'active','EP-101'),
   'ST-3':issue('ST-3','Stabilize the device event signal',0,'blocked','EP-102')
  };
  records['ST-2'].fields.issuelinks=[{type:{inward:'is blocked by'},inwardIssue:records['ST-3']}];
  window.__initiativeWatches=[];
  const result=input=>{const parent=/^parent = ([A-Z0-9-]+)/.exec(input.jql),keys=/^key in \(([^)]+)\)/.exec(input.jql);let issues=parent?Object.values(records).filter(row=>row.fields.parent?.key===parent[1]):(keys?.[1].split(', ')||[]).map(key=>records[key]).filter(Boolean);if(input.jql.includes('Flagged'))issues=issues.filter(row=>row.key==='ST-3');return {payload:{issues}};};
  window.claude={use:async()=>({listTools:async()=>[{server:'Atlassian',tools:['getAccessibleAtlassianResources','searchJiraIssuesUsingJql']}],callTool:async(s,t,input)=>t==='getAccessibleAtlassianResources'?{payload:[{id:'cloud',url:'https://acme.atlassian.net'}]}:result(input),watchTool(s,t,input,handler){const watch={input,stopped:false};window.__initiativeWatches.push(watch);queueMicrotask(()=>{if(!watch.stopped)handler({type:'data',result:result(input)});});return ()=>{watch.stopped=true;};}})};
 });
 const spec={page:{title:'Connected resident experience',tracking:{jira:{site:'https://acme.atlassian.net',epic:['INIT-100','EP-101']}},sections:[{id:'delivery',heading:'Implementation progress',diagram:{nodes:{resident:{title:'Resident notification',tickets:['ST-1']},service:{title:'Notification service',tickets:['ST-2']}},rows:[['service','resident']],edges:[{from:'service',to:'resident',label:'Notify'}],steps:[{edge:'service->resident',text:'The device event reaches the resident'}],sectionLayout:{columns:24,default:[{x:0,y:0,w:10,h:18},{controls:'steps',x:0,y:18,w:10,h:5},{panel:'status',x:10,y:0,w:14,h:22}]},panels:[{id:'status',type:'live-status',title:'Delivery status'}]}}]}};
 const file=path.join(server.root,'initiative.spec.json'),out=path.join(server.root,'initiative.html');await writeFile(file,JSON.stringify(spec));execFileSync('python3',[path.join(repo,'tools/inject.py'),file,path.join(repo,'template/flowview.html'),out]);await page.goto(server.origin+'/initiative.html');
 const panel=page.locator('#docview .pt-live-status');await expect(panel.locator('.dv-live-scope')).toHaveText('Initiative · 2 epics');await expect(panel.locator('.dv-live-epic-key')).toHaveText('INIT-100');await expect(panel.locator('.dv-live-epic-title')).toHaveText('Connected resident experience');await expect(panel.locator('.dv-live-epic-progress')).toHaveText('1 of 3 stories done · 2 of 3 on diagram');
 await expect(panel.locator('tr[data-live-ticket]')).toHaveCount(3);await expect(panel.locator('tr[data-live-ticket="ST-3"] .dv-live-ticket-epic')).toHaveText('epic EP-102');await expect(panel.locator('tr[data-live-ticket="ST-1"] .dv-live-ticket-epic')).toHaveText('epic EP-101');await expect(panel.locator('tr[data-live-coverage-for="ST-3"]')).toContainText('NOT ON DIAGRAM');await expect(panel.locator('tr[data-live-coverage-for="ST-1"]')).toHaveCount(0);
 await expect(panel.locator('tr[data-live-ticket="ST-2"] .dv-live-dep')).toHaveAttribute('data-tone','red');await expect(panel.locator('.dv-live-blocker')).toContainText('ST-3');expect(await page.evaluate(()=>window.__initiativeWatches.filter(w=>w.input.jql==='parent = EP-101').length)).toBe(1);
 await panel.screenshot({path:testInfo.outputPath('initiative-board.png')});
});

test('X desktop exclusions and displayed dependencies use one deduplicated story total',async({page,server},testInfo)=>{
 await page.setViewportSize({width:1600,height:1200});
 const spec={page:{title:'Delivery scope',tracking:{jira:{site:'https://acme.atlassian.net',epic:'IN-100',exclude:['ST-2','ST-3','ST-4','DEP-2']}},sections:[{id:'scope',heading:'Delivery stories',diagram:{
  nodes:{delivery:{title:'Manual additions',tickets:['ST-3','MAN-1','UNKNOWN-1','DEP-1']}},rows:[['delivery']],sectionLayout:{columns:24,default:[{x:0,y:0,w:7,h:12},{controls:'steps',x:0,y:12,w:7,h:5},{panel:'status',x:7,y:0,w:17,h:35}]},panels:[{id:'status',type:'live-status',title:'Delivery status'}],steps:[{nodes:['delivery'],text:'Deliver the selected work'}]
 }}]}};
 const map={'IN-100':{kind:'initiative',state:'active',title:'Resident delivery'},'EP-1':{kind:'epic',state:'active',initiatives:['IN-100']},
  'ST-1':{state:'done',epic:'EP-1',title:'Parent delivery'},'ST-2':{state:'done',epic:'EP-1',title:'Separate project'},'ST-3':{state:'done',epic:'EP-1',title:'Explicitly included work'},
  'ST-4':{state:'blocked',epic:'EP-1',title:'Unrelated blocked work',dependsOn:[{key:'UNRELATED-1',source:'jira'}]},'ST-5':{state:'todo',epic:'EP-1',title:'Waiting delivery',dependsOn:[{key:'DEP-1',source:'jira'},{key:'DEP-2',source:'jira'},{key:'UNKNOWN-2',source:'jira'}]},
  'MAN-1':{state:'done',title:'Manual work without an epic'},'DEP-1':{state:'done',title:'Shared upstream'},'DEP-2':{state:'blocked',title:'Required external delivery',epic:'OTHER-1'}};
 await page.addInitScript(map=>{window.flowviewLiveStatus={provider:async()=>map};},map);await open(page,server,spec,false);
 const panel=page.locator('#docview .pt-live-status');await expect(panel.locator('.dv-live-epic-progress')).toHaveText('4 of 8 stories done · 4 of 8 on diagram');
 await expect(panel.locator('[data-live-count="done"]')).toHaveText('done 4');await expect(panel.locator('[data-live-count="blocked"]')).toHaveText('blocked 1');await expect(panel.locator('.dv-live-epic-counts')).toHaveText('1 blocked · 1 waiting · 5 outside scope');
 const table=panel.getByRole('table',{name:'Tickets',exact:true});await expect(table.locator('tr[data-live-ticket]')).toHaveCount(8);await expect(table.locator('tr[data-live-ticket="ST-2"],tr[data-live-ticket="ST-4"],tr[data-live-ticket="UNRELATED-1"]')).toHaveCount(0);
 await expect(table.locator('tr[data-live-ticket="UNKNOWN-2"]')).toContainText('No status');await expect(table.locator('tr[data-live-coverage-for="DEP-2"]')).toContainText('DEPENDENCY ONLY');
 const exclusions=panel.getByRole('list',{name:'Excluded stories',exact:true});await expect(exclusions.locator('li')).toHaveCount(4);await expect(exclusions.getByRole('link',{name:'ST-2',exact:true})).toHaveAttribute('href','https://acme.atlassian.net/browse/ST-2');
 await expect(exclusions.locator('[data-live-excluded="ST-2"]')).toContainText('Separate project');await expect(exclusions.locator('[data-live-excluded="ST-3"]')).toContainText('Included by manual attachment');await expect(exclusions.locator('[data-live-excluded="DEP-2"]')).toContainText('Included as dependency');
 await expect(exclusions.locator('button,input')).toHaveCount(0);await page.setViewportSize({width:1600,height:1800});expect((await panel.boundingBox()).width).toBeGreaterThan(700);await panel.screenshot({path:testInfo.outputPath('status-exclusions.png')});
 await page.emulateMedia({media:'print'});await expect(panel.locator('.pbody')).toHaveCSS('overflow','visible');await expect(panel.locator('.pbody')).toHaveCSS('max-height','none');await expect(panel.locator('.dv-live-tickets-scroll')).toHaveCSS('overflow','visible');await expect(exclusions).toBeVisible();
});

test('X desktop exclusion controls validate deduplicate undo redo remove and export',async({page,server})=>{
 await page.setViewportSize({width:1440,height:1000});await useProjectDownloads({page});await page.goto(server.origin+'/workbench.html');
 const spec=structuredClone(raw);spec.page.tracking.jira.epic='DOOR-100';spec.page.tracking.github={org:'acme'};await paste(page,JSON.stringify(spec));await prepareEditorSurface(page);
 const src=page.locator('#src'),settings=async()=>{await page.locator('#editor-tab-inspect').click();await page.locator('#document-settings').click();};await settings();const input=page.locator('#guide').getByLabel('Exclude story',{exact:true});
 const before=await src.inputValue();await input.fill('bad');await input.press('Enter');await expect(src).toHaveValue(before);await expect(page.locator('#guide .ierr')).toContainText('Jira key');
 await input.fill('HW-124');await input.press('Enter');await expect.poll(async()=>JSON.parse(await src.inputValue()).page.tracking.jira.exclude).toEqual(['HW-124']);const added=await src.inputValue();
 await input.fill('HW-124');await input.press('Enter');await expect(src).toHaveValue(added);await page.locator('#undo-builder').click();await expect(src).toHaveValue(before);await page.locator('#redo-builder').click();await expect(src).toHaveValue(added);await settings();
 await page.locator('#guide').getByRole('button',{name:'Remove excluded story 1',exact:true}).click();await expect.poll(async()=>JSON.parse(await src.inputValue()).page.tracking.jira.exclude).toBeUndefined();await page.locator('#undo-builder').click();await expect(src).toHaveValue(added);
 const pending=page.waitForEvent('download');await page.locator('#workspace-export-trigger').click();await page.locator('#file-save').click();const files=await projectFiles(await pending),saved=JSON.parse(files[Object.keys(files).find(k=>k.endsWith('.spec.json'))]);
 expect(saved.page.tracking).toEqual({jira:{...spec.page.tracking.jira,exclude:['HW-124']},github:{org:'acme'}});expect(saved.page.sections).toEqual(spec.page.sections);
});

test('A1 planned availability keeps Jira state, breaks incident traffic and restores on Done',async({page,server},testInfo)=>{
 await page.clock.install();
 await page.addInitScript(()=>{window.__availabilityMap=null;window.flowviewLiveStatus={provider:()=>new Promise(resolve=>{window.__availabilityResolve=resolve;if(window.__availabilityMap!==null)resolve(window.__availabilityMap);})};});
 const spec=JSON.parse(await readFile(path.join(repo,'examples/ticket-availability/ticket-availability.spec.json'),'utf8')),d=spec.page.sections[0].diagram;delete d.edges[0].label;
 const root=await open(page,server,spec,false),node=root.locator('g.node[data-dv-node="api"]'),edge=root.locator('path.edge[data-dv-edge="1"]'),incident=root.locator('g.dv-live-comm-failure[data-dv-edge="0"]'),pop=root.locator('.dv-live-popover');
 await expect(node).toHaveClass(/dv-live-unavailable/);await expect(root.locator('.dv-live-comm-failure')).toHaveCount(2);
 await expect(incident).toHaveAttribute('role','button');await expect(incident).toHaveAttribute('aria-label',/Awaiting Jira status.*Planned API requires confirmed Done status for API-1, API-2/);await expect(incident).not.toHaveAttribute('aria-label',/blocked/);
 await incident.press('Enter');await expect(pop).toContainText('Awaiting Jira status');await expect(pop).not.toContainText('Not built yet');await expect(pop.getByRole('link',{name:'API-1',exact:true})).toBeVisible();await expect(pop).toContainText('No status');await page.keyboard.press('Escape');await expect(incident).toBeFocused();
 await expect.poll(()=>page.evaluate(()=>typeof window.__availabilityResolve)).toBe('function');
 await page.evaluate(()=>{window.__availabilityMap={'API-1':{state:'done'},'LINK-1':{state:'active'},'APP-1':{state:'active'}};window.__availabilityResolve(window.__availabilityMap);});
 await expect(node).not.toHaveClass(/dv-live-done/);await expect(node).toHaveClass(/dv-live-unavailable/);await expect(edge).toHaveClass(/dv-live-active/);await expect(edge).not.toHaveClass(/dv-live-blocked/);
 await expect(root.locator('.dv-live-comm-failure')).toHaveCount(2);
 const packets=root.locator('circle.pkt');expect(await packets.count()).toBeGreaterThan(0);
 expect(await packets.evaluateAll(els=>els.filter(el=>el.querySelector('mpath')?.getAttribute('href')===('#'+document.querySelector('path.edge[data-dv-edge="1"]').id)).every(el=>getComputedStyle(el).display==='none'))).toBe(true);
 for(const skin of ['aurora','pastel']){
  await page.evaluate(skin=>window.dvSetSkin(skin),skin);await expect(node.locator('.card')).toHaveCSS('fill-opacity','1');await expect(node.locator('.card')).toHaveCSS('stroke-dasharray','5px, 4px');await expect(node.locator('.t1')).toHaveCSS('opacity','1');
  await root.locator('#section-planned').screenshot({path:testInfo.outputPath('planned-'+skin+'.png')});
 }
 await page.evaluate(()=>{window.__availabilityMap['API-2']={state:'done'};});await page.clock.runFor(30001);
 await expect(node).not.toHaveClass(/dv-live-unavailable/);await expect(root.locator('.dv-live-comm-failure')).toHaveCount(1);await expect(edge).toHaveClass(/dv-live-unavailable/);
 await page.evaluate(()=>{window.__availabilityMap['LINK-1']={state:'done'};});await page.clock.runFor(30001);
 await expect(root.locator('.dv-live-unavailable,.dv-live-comm-failure')).toHaveCount(0);
 expect(await packets.evaluateAll(els=>els.every(el=>!el.classList.contains('dv-live-packet-hidden')))).toBe(true);
 await page.evaluate(()=>{window.__availabilityMap={};});await page.clock.runFor(30001);await expect(node).toHaveClass(/dv-live-unavailable/);
 await root.locator('.dv-live-toggle').click();await expect(root.locator('.dv-live-unavailable,.dv-live-comm-failure')).toHaveCount(0);await expect(node.locator('.dv-live-construction')).toHaveCount(0);
 await root.locator('.dv-live-toggle').click();await expect(node).toHaveClass(/dv-live-unavailable/);
});

test('A2 desktop node and edge availability controls preserve source history and exported project',async({page,server},testInfo)=>{
 await page.setViewportSize({width:1440,height:1000});await useProjectDownloads({page});await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(raw));await prepareEditorSurface(page);
 const source=page.locator('#src'),guide=page.locator('#guide'),control=guide.getByRole('checkbox',{name:'Exists when tickets are complete',exact:true});
 const node=page.locator('#docview g.node[data-dv-node="hardware"] .card');await cardClick(node);await page.locator('#editor-tab-inspect').click();
 const before=await source.inputValue();await expect(control).not.toBeChecked();await control.check();
 await expect.poll(async()=>JSON.parse(await source.inputValue()).page.sections[0].diagram.nodes.hardware.existsWhen).toBe('tickets-done');const changed=await source.inputValue();
 await page.locator('#undo-builder').click();await expect(source).toHaveValue(before);await page.locator('#redo-builder').click();await expect(source).toHaveValue(changed);
 await cardClick(node);await control.uncheck();await expect.poll(async()=>Object.hasOwn(JSON.parse(await source.inputValue()).page.sections[0].diagram.nodes.hardware,'existsWhen')).toBe(false);await control.check();
 await page.locator('#docview text.lbl[data-dv-edge="1"]').click();await expect(control).not.toBeChecked();await control.check();
 await expect.poll(async()=>JSON.parse(await source.inputValue()).page.sections[0].diagram.edges[1].existsWhen).toBe('tickets-done');
 await guide.screenshot({path:testInfo.outputPath('availability-inspector.png')});
 const pending=page.waitForEvent('download');await page.locator('#workspace-export-trigger').click();await page.locator('#file-save').click();const files=await projectFiles(await pending),saved=JSON.parse(files[Object.keys(files).find(k=>k.endsWith('.spec.json'))]);
 expect(saved.page.sections[0].diagram.nodes.hardware).toEqual({...raw.page.sections[0].diagram.nodes.hardware,existsWhen:'tickets-done'});
 expect(saved.page.sections[0].diagram.edges[1]).toEqual({...raw.page.sections[0].diagram.edges[1],existsWhen:'tickets-done'});
 expect(saved.page.flowview.features).toContain('flow.ticket-availability');
});

test('A3 availability survives rebuilt native diagrams and clear or destroy restores authored visuals',async({page,server},testInfo)=>{
 await page.setViewportSize({width:1440,height:1000});
 await writeFile(path.join(server.root,'availability-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
 await writeFile(path.join(server.root,'availability-native.html'),'<style>body{margin:0}#host{position:fixed;inset:0}</style><div id="host"></div><script type="module">import {mountNativeViewer} from "./availability-native.js";window.mount=mountNativeViewer;</script>');
 await page.goto(server.origin+'/availability-native.html');await page.waitForFunction(()=>!!window.mount);
 const spec=JSON.parse(await readFile(path.join(repo,'examples/ticket-availability/ticket-availability.spec.json'),'utf8'));
 Object.assign(spec.page.sections[0].diagram.nodes.api,{icon:'server',sub:'Requests',link:'https://example.com/api',detail:{section:'inside'}});
 spec.page.sections.push({id:'inside',heading:'API internals',detailOnly:true,diagram:{nodes:{inside:{title:'Internal'}},rows:[['inside']],edges:[]}});
 const diagram=spec.page.sections[0].diagram;diagram.nodes.image={title:'Image node',sub:'Thumbnail',image:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1kAAAAASUVORK5CYII=',alt:'Test image',tickets:['API-1','API-2'],existsWhen:'tickets-done'};diagram.nodes.handoff={title:'API continuation',handoff:{spec:'api',claudeUrl:'https://claude.ai/artifact/api'},tickets:['API-1','API-2'],existsWhen:'tickets-done'};diagram.floats=[{id:'image',x:350,y:260},{id:'handoff',x:800,y:260}];
 spec.page.sections[0].diagram.paths=[{id:'forward',steps:['request','store','response']},{id:'reverse',steps:['response','request','store']}];
 await page.evaluate(spec=>{window.availabilitySpec=spec;window.viewer=window.mount(document.querySelector('#host'),spec,{});},spec);
 const root=page.locator('#host'),node=root.locator('g.node[data-dv-node="api"]');await expect(node).toHaveClass(/dv-live-unavailable/);
 const geometry=await node.evaluate(el=>({transform:el.getAttribute('transform'),h:el.querySelector('.card').getAttribute('height'),detail:el.querySelector('.detail-trigger rect').getAttribute('y')}));
 expect(geometry.h).toBe('86');expect(Number(geometry.detail)+22).toBeLessThanOrEqual(54);
 const imageNode=root.locator('g.node[data-dv-node="image"]'),handoff=root.locator('g.node[data-dv-node="handoff"]');
 expect(await imageNode.locator('.node-image').evaluate(el=>Number(el.getAttribute('y'))+Number(el.getAttribute('height')))).toBeLessThanOrEqual(58);
 expect(Number(await handoff.locator('.t2').getAttribute('y'))).toBeLessThan(50);
 const apply=async map=>page.evaluate(map=>window.viewer.controller.liveStatus.apply(map),map);
 const color=async token=>node.evaluate((el,token)=>{const g=el.cloneNode(false);g.setAttribute('class','node node-styled ns-'+token);el.parentNode.appendChild(g);const style=getComputedStyle(g),probe=document.createElement('span');el.getRootNode().appendChild(probe);const resolve=k=>{probe.style.color=style.getPropertyValue(k).trim();return getComputedStyle(probe).color;};const out={bg:resolve('--ns-bg'),line:resolve('--ns-line')};probe.remove();g.remove();return out;},token);
 for(const skin of ['aurora','pastel']){
  await page.evaluate(skin=>(window.viewer.destroy(),window.viewer=window.mount(document.querySelector('#host'),window.availabilitySpec,{skin})),skin);
  await root.getByRole('button',{name:'Readable',exact:true}).first().click();
  await apply({});await expect(node).toHaveClass(/dv-live-reserved/);await expect(node.locator('.dv-live-reservation-title')).toHaveText('AWAITING JIRA STATUS');
  await expect(imageNode.locator('.node-image')).toHaveCSS('visibility','hidden');await expect(handoff.locator('.dv-live-reservation-title')).toHaveText('AWAITING JIRA STATUS');expect(await handoff.locator('.dv-live-reservation-title').evaluate(el=>el.getBBox().x+el.getBBox().width)).toBeLessThanOrEqual(122);
  await expect(node.locator('.dv-live-reservation-tickets')).toHaveCSS('font-size','10px');
  expect(await node.locator('.dv-live-construction text').evaluateAll(els=>els.every(el=>{const b=el.getBBox();return b.x>=0&&b.x+b.width<=150&&b.y+b.height<=86;}))).toBe(true);
  await node.screenshot({path:testInfo.outputPath('reserved-'+skin+'.png')});
  const content=await node.locator('.t1,.t2').evaluateAll(els=>els.map(el=>({y:el.getAttribute('y'),box:el.getBBox().y+el.getBBox().height})));expect(content.every(el=>el.box<54)).toBe(true);
  await apply({'API-1':{state:'done'}});await expect(node).not.toHaveClass(/dv-live-done/);await expect(node).toHaveClass(/ns-slate/);await expect(node).not.toHaveClass(/ns-moss/);await expect(node.locator('.dv-live-reservation-title')).toHaveText('AWAITING JIRA STATUS');await expect(node.locator('.card')).toHaveAttribute('aria-label',/Awaiting Jira status/);await expect(node.locator('.card')).not.toHaveAttribute('aria-label',/Not built/);
  await apply({'API-1':{state:'active'},'API-2':{state:'todo'}});await expect(node).toHaveClass(/dv-live-blueprint/);await expect(node).toHaveClass(/ns-azure/);await expect(node.locator('.dv-live-hatching')).toHaveCount(1);await expect(node.locator('.dv-live-reservation-title')).toHaveCount(0);await expect(node.locator('use').first()).toHaveCSS('visibility','visible');
  await expect(imageNode.locator('.node-image')).toHaveCSS('visibility','visible');await expect(handoff.locator('.dv-live-hatching')).toHaveCount(1);
  await node.screenshot({path:testInfo.outputPath('blueprint-'+skin+'.png')});
  await apply({'API-1':{state:'todo'},'API-2':{state:'todo'}});await expect(node).toHaveClass(/dv-live-reserved/);await expect(node).toHaveClass(/ns-slate/);await expect(node.locator('.dv-live-hatching')).toHaveCount(0);await expect(node.locator('.dv-live-reservation-title')).toHaveText('NOT BUILT YET');await expect(node.locator('.card')).toHaveAttribute('aria-label',/Not built yet/);await node.screenshot({path:testInfo.outputPath('known-todo-'+skin+'.png')});
  await apply({'API-1':{state:'blocked'},'API-2':{state:'todo'}});await expect(node).toHaveClass(/dv-live-reserved/);await expect(node).toHaveClass(/ns-rose/);await expect(node).not.toHaveClass(/dv-live-blueprint/);
  await apply({'API-1':{state:'missing'}});await expect(node).toHaveClass(/ns-rose/);
  await apply({'API-1':{state:'done'},'API-2':{state:'todo'}});await expect(node).toHaveClass(/dv-live-blueprint/);
  await apply({'API-1':{state:'done'},'API-2':{state:'done'},'LINK-1':{state:'done'}});await expect(node).toHaveClass(/dv-live-done/);await expect(node).toHaveClass(/ns-moss/);await expect(node.locator('.dv-live-construction')).toHaveCount(0);
  await expect(node.locator('.card')).toHaveCSS('stroke',statusLine('done'));await expect(node.locator('.card')).toHaveCSS('stroke-dasharray','none');
  await node.screenshot({path:testInfo.outputPath('completed-green-'+skin+'.png')});
  expect(await node.locator('.t1,.t2').evaluateAll(els=>els.map(el=>({y:el.getAttribute('y'),box:el.getBBox().y+el.getBBox().height})))).toEqual(content);
  await root.locator('#section-planned .board').screenshot({path:testInfo.outputPath('completed-board-'+skin+'.png')});
  expect(await node.evaluate(el=>({transform:el.getAttribute('transform'),h:el.querySelector('.card').getAttribute('height'),detail:el.querySelector('.detail-trigger rect').getAttribute('y')}))).toEqual(geometry);
 }
 await page.evaluate(()=>{const spec=structuredClone(window.availabilitySpec);spec.page.sections[0].diagram.nodes.api.tickets=Array.from({length:9},(_,i)=>'LONGPROJECTKEY-1234567890'+i);window.longTicketSpec=spec;window.viewer.destroy();window.viewer=window.mount(document.querySelector('#host'),spec,{});});
 await expect(node.locator('.dv-live-reservation-tickets')).toContainText('+8');
 expect(await node.locator('.dv-live-reservation-tickets').evaluate(el=>el.getBBox().x+el.getBBox().width)).toBeLessThan(150);
 await node.locator('.card').press('Enter');for(let i=0;i<9;i++)await expect(root.locator('.dv-live-popover').getByRole('link',{name:'LONGPROJECTKEY-1234567890'+i,exact:true})).toBeVisible();await page.keyboard.press('Escape');
 await page.evaluate(()=>{window.viewer.destroy();window.viewer=window.mount(document.querySelector('#host'),window.availabilitySpec,{});});
 await apply({'API-1':{state:'active'}});await page.evaluate(()=>window.viewer.controller.liveStatus.setEnabled(false));await expect(root.locator('.dv-live-construction,.dv-live-blueprint,.dv-live-reserved')).toHaveCount(0);
 await page.evaluate(()=>window.viewer.controller.liveStatus.setEnabled(true));await expect(node).toHaveClass(/dv-live-blueprint/);
 await root.locator('.path-chip[data-dv-path="reverse"]').click();await expect(node).toHaveClass(/dv-live-blueprint/);await expect(root.locator('.dv-live-comm-failure')).toHaveCount(2);
 await page.evaluate(()=>window.viewer.controller.liveStatus.clear());await expect(root.locator('.dv-live-unavailable,.dv-live-comm-failure,.dv-live-target')).toHaveCount(0);await expect(node.locator('.dv-live-construction')).toHaveCount(0);
 await page.evaluate(()=>window.viewer.controller.liveStatus.apply({'API-1':{state:'active'}}));await expect(node).toHaveClass(/dv-live-blueprint/);
 await page.evaluate(()=>window.viewer.controller.liveStatus.destroy());await expect(root.locator('.dv-live-unavailable,.dv-live-comm-failure,.dv-live-target')).toHaveCount(0);await expect(node.locator('.dv-live-construction')).toHaveCount(0);
 await page.evaluate(()=>window.viewer.destroy());await expect(root).toBeEmpty();
});

test('desktop Missing work is one undoable edit and survives exported project reload',async({page,server},testInfo)=>{
 await page.setViewportSize({width:1440,height:1000});await useProjectDownloads({page});await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(raw));await prepareEditorSurface(page);const source=page.locator('#src'),node=page.locator('#docview g.node[data-dv-node="hardware"] .card');
 await cardClick(node);await page.locator('#editor-tab-inspect').click();const control=page.locator('#guide').getByRole('checkbox',{name:'Missing work',exact:true}),before=await source.inputValue();
 await control.check();await expect.poll(async()=>JSON.parse(await source.inputValue()).page.sections[0].diagram.nodes.hardware.missingWork).toBe(true);const after=await source.inputValue();
 await page.locator('#undo-builder').click();await expect(source).toHaveValue(before);await page.locator('#redo-builder').click();await expect(source).toHaveValue(after);
 await cardClick(node);await expect(control).toBeChecked();await page.locator('#guide').screenshot({path:testInfo.outputPath('missing-work-inspector.png')});
 const pending=page.waitForEvent('download');await page.locator('#workspace-export-trigger').click();await page.locator('#file-save').click();const files=await projectFiles(await pending),saved=files[Object.keys(files).find(k=>k.endsWith('.spec.json'))];
 expect(JSON.parse(saved).page.flowview.features).toContain('flow.missing-work');
 await page.goto(server.origin+'/workbench.html');await page.locator('#welcome-file').setInputFiles({name:'missing-work.spec.json',mimeType:'application/json',buffer:Buffer.from(saved)});
 await expect(node).toBeVisible();await closeTools(page);await cardClick(node);await page.locator('#editor-tab-inspect').click();await expect(control).toBeChecked();
 await control.uncheck();await expect.poll(async()=>Object.hasOwn(JSON.parse(await source.inputValue()).page.sections[0].diagram.nodes.hardware,'missingWork')).toBe(false);
});

test('native status ink follows shadow-host and SVG board surfaces and restores on destroy',async({page,server},testInfo)=>{
 await page.setViewportSize({width:1440,height:1000});
 await writeFile(path.join(server.root,'status-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
 await writeFile(path.join(server.root,'status-native.html'),'<style>body{margin:0}#host{background:#0b1220;min-height:100vh}</style><div id="host"></div><script type="module">import {mountNativeViewer} from "./status-native.js";window.mount=mountNativeViewer;</script>');
 await page.goto(server.origin+'/status-native.html');await page.waitForFunction(()=>!!window.mount);
 for(const skin of ['aurora','pastel']){
  await page.evaluate(({spec,skin,map})=>{if(window.viewer)window.viewer.destroy();window.viewer=window.mount(document.querySelector('#host'),spec,{skin});window.viewer.controller.liveStatus.apply(map);},{spec:fixture(),skin,map:FIXED_MAP});
  const root=page.locator('#host'),node=root.locator('#section-delivery [data-dv-node="hardware"]'),pill=root.locator('tr[data-live-ticket="HW-123"] .dv-live-state-pill');
  await expect(node).toHaveAttribute('data-live-appearance','active');
  for(const label of ['.t1','.t2'])expect((await contrast(node,'fill','fill',label)).ratio).toBeGreaterThanOrEqual(4.5);
  expect((await contrast(pill,'backgroundColor','color')).ratio).toBeGreaterThanOrEqual(4.5);
  await cardClick(node.locator('.card'));const pop=root.locator('.dv-live-popover .dv-live-ticket-state');await expect(pop).toBeVisible();expect((await contrast(pop,'backgroundColor','color')).ratio).toBeGreaterThanOrEqual(4.5);await page.keyboard.press('Escape');
  await root.screenshot({path:testInfo.outputPath('native-status-'+skin+'.png')});
  // SVG ground remains the actual substrate even if its wrapping HTML is transparent.
  await node.evaluate(el=>{el.closest('.board').style.background='transparent';});await page.evaluate(map=>window.viewer.controller.liveStatus.apply(map),FIXED_MAP);
  await expect(node.locator('.t1')).toHaveCSS('fill',skin==='aurora'?'rgb(255, 255, 255)':'rgb(0, 0, 0)');
  await page.evaluate(()=>window.viewer.controller.liveStatus.destroy());await expect(root.locator('[data-live-appearance]')).toHaveCount(0);
 }
});
