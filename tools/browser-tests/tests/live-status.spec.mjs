/* Contract matrix (browser and VM coverage together):
| row | rule |
|---|---|
| V1 | New file src/viewer/live-status.js, added to the `engine.js` list in src/source-bundles.json (so standalone, workbench, native/Backstage and forge entrypoints all get it; check tests/source-loader.test.js). ES5 browser code like its neighbours. |
| V2 | `renderPage` attaches `ctl.liveStatus` with: `refs()` → `{tickets:[distinct keys], prs:[distinct urls]}` over every diagram of the page (all sections, all paths, detail flows) using `trackingRefs`; `apply(map)`; `clear()`; `enabled()`; `setEnabled(bool)`; `onChange(fn)` (fires after apply/clear/setEnabled with `{states, counts, updatedAt}`); `state(ref)`. `map` is `{ "<ticket key>": {state, title?, url?, assignee?, prs?: {count, state}, detail?, updatedAt?} }`, `state` ∈ `todo|active|done|blocked|missing`. Unknown state strings are ignored (treated as absent). |
| V3 | Rollup for one carrier with several tickets (docs/live-status.md): any blocked → blocked; else any missing → missing; else any active → active; else all done → done; else all todo → todo; else (mix of done and todo) → active. A carrier whose tickets are all absent from the map gets NO class. Implement as a pure function `liveStatusRollup(states[])` (exported as a global like other engine helpers) so it is unit-testable. |
| V4 | `apply(map)` sets exactly one `dv-live-<state>` class (removing the others) on: every node `g.node[data-dv-node]` with tickets; every edge `path.edge[data-dv-edge]` with tickets, plus its halo path and its `text.lbl` label (same `data-dv-edge` index); every step coin `g.coin[data-dv-step]` and step chip `button.schip[data-step-source]` whose step involves (via `edges`/keys, `nodes`, failures) at least one carrier that has a state — rollup of those carriers' states; in path-timeline chips too. Text boxes (`g.node.node-text`) never get a class. |
| V5 | CSS in src/style.core.css, for EVERY skin selector family that paints `.card`/edges today (aurora, daylight, editorial, terminal, pastel, blueprint, rose, lavender, lilac — check the skin list in the file): `.dv-live-todo` grey, `.dv-live-active` amber, `.dv-live-done` green, `.dv-live-blocked` and `.dv-live-missing` red. Node: card stroke + a soft halo (drop-shadow) in the state color and the status badge; edge: stroke color (main + halo) with the state color; coin: circle fill + ink via the same `--step-color`/`--step-ink` custom properties the `.step-colored` rules use (so precedence and `!important` match); chip: background via the same variables. Define the five colors once as CSS custom properties on `:root` (`--dv-live-todo`, …) and reuse. active/blocked/missing pulse: reuse the existing `runtime-pulse` keyframes (stroke-width) on the badge circle and a slow (≈2.4 s) opacity pulse on the card halo; `@media (prefers-reduced-motion: reduce)` disables both (follow the existing reduced-motion blocks). Live classes win over `tone-*` card fill/stroke while present. Step-mode dimming (`.stepmode .node:not(.lit)` etc.) still applies but with an opacity floor of .55 for live-classed elements, like `.stepmode .coin.step-colored:not(.lit)`. Print: no pulse, keep colors. |
| V6 | No canvas badge (#762, Chuck 2026-10-27): state is carried by card stroke and halo, edge stroke, dashed todo/waiting strokes, step coins and the break glyph. The ticket popover (manual popover in the `.nbackpop` style: one row per ticket with key link to `tracking.jira.site + '/browse/' + key` when site exists, else `url`, else plain text; state pill, title, assignee, "PRs: n open/merged"; then authored `prs` URLs) opens from the carrier itself: a click on a ticketed node card (not its links/detail/handoff controls) or on an edge label (the edge path when unlabelled). In the reader the card/label is a named `role="button"` with `tabindex="0"`, opened by Enter/Space; Escape/outside click closes and returns focus to it. Under `authoring` (Workbench) carriers stay inert so selection keeps its clicks. |
| V7 | Node "⋯" menu: `nodeReferenceLinks` (`src/engine.js:257`) gains a "Tickets" group listing ticket keys (browse links when site is set) and authored PR links for that node, so the menu shows them even without a provider. |
| V8 | Live controls live only in the authored `live-status` panel's `.dv-live-head`, below its engine-owned title; reader navigation has no Live control row. The header includes `button.dv-live-toggle` ("Live", `aria-pressed` reflecting `enabled()`), per-state counts hidden when zero, `time.dv-live-updated` when a timestamp exists, the provider note and action, First blocker when available, and Play/Pause plus Next day when demo controls are supplied. Without ticket references or epics the panel shows the empty-page message; before a provider or applied map is available it shows only the provider note and any required action. |
| V9 | Re-apply after every rebuild: listen on the section element for `dv:pathrender` and `dv:pathchange`, on the view for `diagram-tab-change`, `tab-view-change`, `diagram-view-change`, `navigation-mounted`, `detail-navigation`, and use one MutationObserver (childList, subtree) scoped to step-control containers for chip rebuilds; coalesce with requestAnimationFrame. The classes survive a path switch (new SVG) and a detail flow open. `ctl.destroy()` disconnects everything. |
| V10 | Host hook: `renderPage(..., {liveStatus: {provider: function(refs, signal) → Promise<map>, refreshMs}})`. When present: call the provider after first paint, then every `max(refreshMs, 30000)` ms while `document.visibilityState === 'visible'` (pause when hidden, one catch-up call on return); an AbortController signal is passed and aborted on destroy; rejections set `note(message,'error')` and keep the last map. `mountNativeSpec` (src/native/mount.js) forwards `liveStatus` and src/native/mount.d.ts declares `liveStatus?: {provider: (refs: {tickets: string[]; prs: string[]}, signal: AbortSignal) => Promise<Record<string, LiveStatusEntry>>; refreshMs?: number}` with a `LiveStatusEntry` type. src/boot.flowview.js passes `window.flowviewLiveStatus` (if set before boot) as that option. |
| V11 | No provider and no `apply` → no DOM/CSS difference versus today except the hidden Live control markup (keep it out of the DOM entirely when there are no ticket refs, so pages without tickets are byte-identical in structure). |
*/
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect,paste,prepareEditorSurface} from '../helpers/test.mjs';
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
 const live=root.locator('.dv-live-toggle');await expect(live).toBeVisible();await expect(live).toHaveAttribute('aria-pressed','true');for(const state of ['todo','active','done','blocked','missing'])await expect(root.locator('.dv-live-head').locator('[data-live-count="'+state+'"]')).toContainText(state==='done'?'2':'1');await expect(root.locator('time.dv-live-updated')).toContainText('updated');
 await live.click();await expect(root.locator('.dv-live-active,.dv-live-done,.dv-live-todo,.dv-live-blocked,.dv-live-missing')).toHaveCount(0);await expect(live).toHaveAttribute('aria-pressed','false');await live.click();await expect(node('hardware')).toHaveClass(/dv-live-active/);
 await section.locator('.path-chip[data-dv-path="retry"]').click();await expect(section.locator('g.coin[data-dv-step="2"]')).toHaveClass(/dv-live-blocked/);await expect(section.locator('path.edge[data-dv-edge="0"]')).toHaveClass(/dv-live-blocked/);
 // Return to Ambient so the badges are comfortably visible in the overview.
 await section.getByRole('button',{name:'Ambient',exact:true}).click();
 const badge=node('hardware').locator('.card'),pop=root.locator('.dv-live-popover');await cardClick(badge);await expect(pop).toBeVisible();await expect(pop.getByRole('link',{name:'HW-123',exact:true})).toHaveAttribute('href','https://acme.atlassian.net/browse/HW-123');await expect(pop).toContainText('Button delivery');await expect(pop).toContainText('Alex');await expect(pop).toContainText('PRs: 2 open');
 await page.keyboard.press('Escape');await expect(pop).toBeHidden();await expect(badge).toBeFocused();await badge.press('Space');await expect(pop).toBeVisible();await root.locator('.doc-title').click();await expect(pop).toBeHidden();await expect(badge).toBeFocused();
 await node('firmware').locator('.card').press('Enter');await expect(pop.getByRole('link',{name:'FW-45',exact:true})).toBeVisible();await expect(pop.getByRole('link',{name:'FW-46',exact:true})).toBeVisible();await expect(pop.getByRole('link',{name:'https://github.com/acme/firmware/pull/88',exact:true})).toBeVisible();await page.keyboard.press('Escape');
 await node('hardware').locator('.detail-trigger').click();await expect(root.locator('[data-dv-detail-preview] [data-dv-node="child"]')).toHaveClass(/dv-live-active/);
});
test('V5 all skins keep live card, edge, coin and chip paint above tones and authored colors',async({page,server})=>{
 const spec=fixture(),d=spec.page.sections[0].diagram;d.steps[0].tone={hardware:'ok'};d.steps[0].color='#123456';const root=await open(page,server,spec),section=root.locator('#section-delivery');
 await section.locator('.schip[data-step-source="0"]').first().click();
 for(const skin of ['aurora','terminal','pastel','blueprint','rose','lavender','lilac','daylight','editorial']){
  if(['daylight','editorial'].includes(skin)){
   // Legacy skins are supported authored inputs but absent from the picker.
   spec.page.skin=skin;await open(page,server,spec,false);
   await section.locator('.schip[data-step-source="0"]').first().click();
  }else{
   const nav=root.locator('.explore-navigation').first();
   if(!await nav.locator('.reader-contents').isVisible())await nav.getByRole('button',{name:'Open Contents',exact:true}).click();
   await nav.locator('.reader-theme-menu > summary').click();
   await nav.locator('[data-reader-skin="'+skin+'"]').click();
   await expect(nav.locator('.reader-theme-menu > summary')).toHaveAttribute('data-current-skin',skin);
  }
  await expect(root).toHaveClass(new RegExp('(^|\\s)sk-'+skin+'(\\s|$)'));
  await expect(section.locator('[data-dv-node="hardware"] .card')).toHaveCSS('stroke',await presetLine(page,'ember'));await expect(section.locator('path.edge[data-dv-edge="0"]')).toHaveCSS('stroke',await presetLine(page,'rose'));await expect(section.locator('.coin[data-dv-step="0"] > circle')).toHaveCSS('fill',await presetLine(page,'rose'));await expect(section.locator('.schip[data-step-source="0"]').first()).toHaveCSS('background-color',await presetLine(page,'rose'));
 }
 await page.emulateMedia({reducedMotion:'no-preference'});await expect(section.locator('[data-dv-node="hardware"] .dv-live-halo')).toHaveCSS('animation-duration','2.4s');
 await page.emulateMedia({reducedMotion:'reduce'});await expect(section.locator('[data-dv-node="hardware"] .dv-live-halo')).toHaveCSS('animation-name','none');
 await expect.poll(()=>section.locator('[data-dv-node="ux"]').evaluate(el=>+getComputedStyle(el).opacity)).toBeGreaterThanOrEqual(.55);
 await page.emulateMedia({media:'print',reducedMotion:'no-preference'});await expect(section.locator('[data-dv-node="hardware"] .dv-live-halo')).toHaveCSS('animation-name','none');await expect(section.locator('[data-dv-node="hardware"] .card')).toHaveCSS('stroke',await presetLine(page,'ember'));
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
 S3 manual/automatic days and reduced motion; S4 downstream waiting and done immunity;
 S5 ambient/step blocked break + packet suppression/clearing; S6 skin/print tag + popover;
 S7 docs: unit gate; S8 workbench excluded: unit/diff gate. Desktop reader only.
*/
async function openStory(page,server,hash='#live=demo'){
 await page.setViewportSize({width:1440,height:1000});await page.emulateMedia({reducedMotion:'reduce'});
 // At RED the page is not built yet: inject the existing example so failures
 // exercise the missing runtime behavior rather than ENOENT or HTTP errors.
 const out=path.join(server.root,'story-live.html');
 try{await writeFile(out,await readFile(path.join(repo,'examples/live-status/live-status.html')));}
 catch(error){if(error.code!=='ENOENT')throw error;execFileSync('python3',[path.join(repo,'tools/inject.py'),path.join(repo,'examples/live-status/live-status.spec.json'),path.join(repo,'template/flowview.html'),out]);}
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
 await expect(node('mcu')).toHaveClass(/dv-live-waiting/);await expect(node('mcu')).toHaveClass(/dv-live-active/);await expect(node('mcu')).toHaveAttribute('data-dv-live-waiting-on','HW-124');await expect(node('button')).not.toHaveClass(/dv-live-waiting/);
 await expect(node('mcu').locator('.dv-live-waiting-tag')).toHaveCount(0);await node('mcu').locator('.card').press('Enter');await expect(root.locator('.dv-live-popover')).toContainText('waiting on HW-124');await page.keyboard.press('Escape');
 for(const skin of ['aurora','terminal','pastel','blueprint','rose','lavender','lilac','daylight','editorial']){await page.evaluate(s=>window.dvSetSkin(s),skin);await expect(node('mcu').locator('.card')).toHaveCSS('stroke',await presetLine(page,'slate'));await expect(node('mcu').locator('.card')).toHaveCSS('stroke-dasharray','5px, 5px');await expect(node('mcu').locator('.dv-live-halo'),skin+' waiting halo').toHaveCSS('stroke',await presetLine(page,'slate'));}
 await page.emulateMedia({media:'print'});await expect(node('mcu').locator('.card')).toHaveCSS('stroke',await presetLine(page,'slate'));await expect(node('mcu').locator('.dv-live-halo')).toHaveCSS('animation-name','none');await page.emulateMedia({media:'screen'});
 await root.locator('.schip[data-step-source="0"]').first().click();await expect(failure).toHaveCount(1);await expect(failure).toBeVisible();
 for(let day=5;day<=12;day++){
  await next.click();await expect(root.locator('.dv-live-note')).toContainText('Day '+day+' —');
  if(day===6){await expect(node('app')).toHaveClass(/dv-live-missing/);await expect(root.locator('g.comm-failure[data-dv-edge="4"]')).toHaveCount(0);}
  if(day===7){await expect(root.locator('g.comm-failure')).toHaveCount(0);await expect(root.locator('.dv-live-waiting')).toHaveCount(0);}
  if(day===9){await expect(node('chime')).toHaveClass(/dv-live-done/);await expect(node('chime')).not.toHaveClass(/dv-live-waiting/);}
 }
 await expect(root.locator('.dv-live-waiting')).toHaveCount(0);await expect(root.locator('g.node.dv-live-done')).toHaveCount(6);await expect(root.locator('path.edge.dv-live-done')).toHaveCount(5);await expect(next).toBeDisabled();
 // Existing reduced-motion and step-mode rules also hide ordinary packets.
 await page.emulateMedia({reducedMotion:'no-preference'});await root.getByRole('button',{name:'Ambient',exact:true}).click();
 for(const dot of await edgeDots().all())await expect(dot).not.toHaveCSS('display','none');
});
test('S4 an active upstream blocker skips done descendants and marks todo descendants waiting',async({page,server})=>{
 await page.addInitScript(()=>{window.flowviewLiveStatus={provider:refs=>Object.fromEntries(refs.tickets.map(key=>[key,{state:key==='HW-123'?'blocked':key==='FW-45'?'done':'todo'}]))};});
 const root=await openStory(page,server,''),node=id=>root.locator('g.node[data-dv-node="'+id+'"]');
 // button -> mcu -> ingest: propagation must cross the done controller.
 await expect(node('button')).toHaveClass(/dv-live-blocked/);
 await expect(node('ingest')).toHaveClass(/dv-live-todo/);
 await expect(node('ingest')).toHaveClass(/dv-live-waiting/);
 await expect(node('ingest')).toHaveAttribute('data-dv-live-waiting-on','HW-123');
 await expect(node('mcu')).toHaveClass(/dv-live-done/);
 await expect(node('mcu')).not.toHaveClass(/dv-live-waiting/);
 await expect(node('mcu')).not.toHaveAttribute('data-dv-live-waiting-on',/./);
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
 await expect(root.locator('time.dv-live-updated')).toHaveAttribute('datetime',new Date(1793000000000).toISOString());await expect(root.locator('time.dv-live-updated')).toContainText('updated');
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

/* B1–B10 story panel matrix: B1 lane totals/title; B2 caption;
 B3 shipped Play pauses and focuses badge; B4 First blocker uses current path;
 B5 real demo changes populate Activity; B6 stale helper/paint in VM;
 B7 dialog/ring/verdict/downstream/missing/Escape; B8 built demo final day;
 B9 reduced motion + print here and no-ticket DOM in V11; B10 docs/validator in VM.
 All cases use desktop reader dimensions; mobile document editing is out of scope. */
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
 await expect(bar.locator('.lanepill')).toContainText('Hardware · 0/4 done');await expect(bar.locator('.lanepill')).toHaveClass(/dv-live-blocked/);await expect(bar.locator('.lanepill')).toHaveAttribute('title',/HW-124 · blocked/);
 await root.locator('.schip[data-step-source="5"]').first().click();await root.getByRole('button',{name:'First blocker',exact:true}).click();
 await expect(root.locator('.schip[data-step-source="0"][aria-current="true"]')).toHaveCount(1);await expect(root.locator('.dv-live-target:focus').locator('xpath=ancestor-or-self::*[contains(@class,"dv-live-blocked")][1]')).toHaveCount(1);
 const panel=root.locator('.pt-live-status');
 await expect(panel).toBeVisible();await expect(panel.locator('.ptitle')).toHaveText('Epic status');await expect(panel.locator('.dv-live-verdict')).toHaveText(/1 blockers · \d+ waiting/);
 await expect(panel.locator('.dv-live-completion svg circle')).toHaveCount(2);await expect(panel.locator('[data-live-lane]')).toHaveCount(0);await expect(panel.locator('h3',{hasText:'Teams'})).toHaveCount(0);
 const blocker=panel.locator('.dv-live-blocker').filter({hasText:'HW-124'});await expect(blocker).toContainText(/\d+ downstream carriers · \d+ steps/);await expect(blocker.getByRole('link',{name:'HW-124',exact:true})).toHaveAttribute('href','https://acme.atlassian.net/browse/HW-124');
 await expect(panel.locator('.dv-live-activity')).toContainText('HW-124 · active → blocked');
 await page.emulateMedia({media:'print'});await expect(panel.locator('.pbody')).not.toBeEmpty();await page.emulateMedia({media:'screen'});
 for(let day=5;day<=12;day++){
  await next.click();
  if(day===6)await expect(panel.locator('.dv-live-blocker').filter({hasText:'UX-89'})).toContainText('not found in Jira (deleted, renamed, or no permission)');
 }
 await expect.poll(async()=> (await panel.locator('.dv-live-verdict').textContent()).split(' · ')[0]).toBe('Ready to demo');await expect(panel.locator('.dv-live-blocker')).toHaveCount(0);await expect(root.getByRole('button',{name:'First blocker',exact:true})).toBeHidden();await expect(panel.locator('.dv-live-completion')).toContainText('11/11');
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

test('B5 changed node pulses its card in every skin without moving the positioned group',async({page,server})=>{
 const root=await openStory(page,server),node=root.locator('g.node[data-dv-node="button"]');
 await page.emulateMedia({reducedMotion:'no-preference'});
 const before=await node.evaluate(el=>{
  const card=el.querySelector('.card');
  const pause=ev=>{
   if(ev.target!==card || ev.animationName!=='dvnodepulse')return;
   const animation=card.getAnimations().find(a=>a.animationName==='dvnodepulse');
   animation.pause();animation.currentTime=230;el.removeEventListener('animationstart',pause);
  };
  el.addEventListener('animationstart',pause);
  return {transform:getComputedStyle(el).transform,attribute:el.getAttribute('transform')};
 });
 await root.getByRole('button',{name:'Next day',exact:true}).click();
 await expect(node).toHaveClass(/dv-live-changed/);
 await expect.poll(()=>node.locator('.card').evaluate(el=>el.getAnimations().some(a=>a.animationName==='dvnodepulse' && a.playState==='paused'))).toBe(true);
 for(const skin of ['aurora','daylight','editorial','terminal','pastel','blueprint','rose','lavender','lilac']){
  await page.evaluate(s=>window.dvSetSkin(s),skin);
  await expect(node.locator('.card')).toHaveCSS('animation-name','dvnodepulse');
  await expect(node).toHaveCSS('transform',before.transform);await expect(node).toHaveAttribute('transform',before.attribute);
  expect(await node.evaluate(el=>el.getAnimations().some(a=>a.animationName==='dvnodepulse'))).toBe(false);
  expect(await node.locator('.card').evaluate(el=>getComputedStyle(el).transform)).not.toBe('none');
 }
 await node.locator('.card').evaluate(el=>el.getAnimations().find(a=>a.animationName==='dvnodepulse').finish());
 await expect(node).not.toHaveClass(/dv-live-changed/);
});

test('E6 E10 E11 built epic Tickets table lists all children and coverage focuses the badge',async({page,server})=>{
 const root=await openStory(page,server),next=root.getByRole('button',{name:'Next day',exact:true});
 for(let day=2;day<=12;day++)await next.click();const panel=root.locator('.pt-live-status'),table=panel.locator('table.dv-live-tickets');
 await expect(table.locator('tbody tr')).toHaveCount(8);await expect(table.locator('th')).toHaveText(['Key','Title','State','Owner','PRs','Coverage']);
 await expect(table.locator('tr[data-live-ticket="UX-90"] .dv-live-coverage-tag')).toHaveText('NOT ON DIAGRAM');
 const hw=table.locator('tr[data-live-ticket="HW-124"]');await expect(hw.getByRole('button')).toHaveText(['Indoor chime','press','ring']);await expect(panel.locator('.dv-live-verdict')).toHaveText('Ready to demo · 7 of 8 epic stories on diagram');
 await hw.getByRole('button',{name:'Indoor chime',exact:true}).click();await expect(root.locator('g.node[data-dv-node="chime"] .card')).toBeFocused();
 await page.setViewportSize({width:390,height:844});await expect(table).toBeVisible();expect(await panel.locator('.pbody').evaluate(el=>el.scrollHeight>el.clientHeight || el.scrollWidth>el.clientWidth)).toBe(true);
});
test('E8 desktop page Epic controls validate preserve history export and demo',async({page,server})=>{
 await page.setViewportSize({width:1440,height:1000});await useProjectDownloads({page});await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(raw));await prepareEditorSurface(page);
 const src=page.locator('#src'),settings=async()=>{await page.locator('#editor-tab-inspect').click();await page.locator('#document-settings').click();};await settings();
 const input=page.locator('#guide').getByLabel('Epic',{exact:true}),before=await src.inputValue();await input.fill('bad');await input.press('Enter');await expect(src).toHaveValue(before);await expect(page.locator('#guide .ierr')).toContainText('Jira key');
 for(const key of ['DOOR-100','DOOR-200']){
  const previous=await src.inputValue();await input.fill(key);await input.press('Enter');await expect.poll(async()=>JSON.parse(await src.inputValue()).page.tracking.jira.epic).toContain(key);const changed=await src.inputValue();
  await page.locator('#undo-builder').click();await expect(src).toHaveValue(previous);await page.locator('#redo-builder').click();await expect(src).toHaveValue(changed);await settings();
 }
 const both=await src.inputValue();await page.locator('#guide').getByRole('button',{name:'Remove epic 1',exact:true}).click();await expect.poll(async()=>JSON.parse(await src.inputValue()).page.tracking.jira.epic).toEqual(['DOOR-200']);await page.locator('#undo-builder').click();await expect(src).toHaveValue(both);await page.locator('#redo-builder').click();
 const demo=page.getByRole('checkbox',{name:'Demo live status',exact:true});await demo.check();await expect(page.locator('#docview g.node[data-dv-node="hardware"]')).toHaveClass(/dv-live-(todo|active|done|blocked)/);const final=await src.inputValue();
 const pending=page.waitForEvent('download');await page.locator('#workspace-export-trigger').click();await page.locator('#file-save').click();const files=await projectFiles(await pending),saved=JSON.parse(files[Object.keys(files).find(k=>k.endsWith('.spec.json'))]);
 expect(saved.page.sections[0].diagram.panels).toEqual(raw.page.sections[0].diagram.panels);await expect(page.locator('#docview .pt-live-status .dv-live-head .dv-live-note')).toContainText('Demo day');
 expect(saved.page.tracking.jira).toEqual({site:'https://acme.atlassian.net',epic:['DOOR-200']});expect(await src.inputValue()).toBe(final);
});

test('E6 rework coverage opens a closed detail and focuses its visible badge after each return',async({page,server})=>{
 const root=await open(page,server),panel=root.locator('.pt-live-status');
 await expect(root.locator('#section-delivery [data-dv-node="hardware"] .card.dv-live-target')).toBeVisible();
 for(let visit=0;visit<2;visit++){
  await expect(panel).toBeVisible();
  await panel.locator('tr[data-live-ticket="HW-123"]').getByRole('button',{name:'Child work',exact:true}).click();
  const child=root.locator('[data-dv-detail-preview] [data-dv-node="child"] .card');
  await expect(child).toBeVisible();await expect(child).toBeFocused();await expect(panel).toBeHidden();
  // The rendered back button includes the arrow in its accessible name.
  const back=root.locator('[data-dv-detail-preview] .detail-breadcrumb').getByRole('button',{name:/Overview$/});
  await expect(back).toBeVisible();await back.click();
  await expect(root.locator('[data-dv-detail-preview]')).toHaveCount(0);
 }
});

test('L4 unlinked detail coverage names its page and stays disabled',async({page,server})=>{
 const spec=fixture();delete spec.page.sections[0].diagram.nodes.hardware.detail;
 const child=spec.page.sections[1].diagram;child.nodes.end={title:'End'};child.rows=[['child','end']];child.edges=[{from:'child',to:'end',label:'Unlinked call',tickets:['BE-68']}];
 const root=await open(page,server,spec),panel=root.locator('.pt-live-status');
 for(const [key,label] of [['HW-123','Child work'],['BE-68','Unlinked call']]){
  const button=panel.locator('tr[data-live-ticket="'+key+'"]').getByRole('button',{name:label,exact:true});await expect(button).toBeDisabled();await expect(button).toHaveAttribute('title',/Hardware detail/);
 }
 await expect(root.locator('.dv-live-carrier-preview')).toHaveCount(0);await expect(root.locator('#section-detail')).toBeHidden();expect(await page.locator('#flowspec').evaluate(el=>JSON.parse(el.textContent))).toEqual(spec);
});

test('L3 L4 L5 L10 live-status panel is beside the diagram without a click and keeps its print paint',async({page,server})=>{
 const root=await openStory(page,server),panel=root.locator('.pt-live-status'),body=panel.locator('.pbody'),head=body.locator('.dv-live-head');
 await expect(body).toBeVisible();await expect(panel.locator('.ptitle')).toHaveText('Epic status');
 const diagram=root.locator('.section-layout-tile[data-layout-key="diagram"]'),tile=panel.locator('xpath=ancestor::*[contains(@class,"section-layout-tile")][1]');
 // Default arrangement (Chuck 2026-10-27): panel in the left half, diagram with attached step controls in the right half, both visible on open.
 const a=await diagram.boundingBox(),b=await tile.boundingBox();expect(b.x+b.width).toBeLessThanOrEqual(a.x+2);expect(Math.abs(b.y-a.y)).toBeLessThan(2);expect(b.width).toBeGreaterThan(300);
 await expect(root.locator('.reader-navigation > .dv-live-control')).toHaveCount(0);await expect(root.locator('.dv-live-popover[popover],.dv-live-panel[popover],.dv-live-carrier-preview[popover]')).toHaveCount(0);
 await head.locator('.dv-live-toggle').click();await expect(root.locator('.dv-live-target')).toHaveCount(0);await head.locator('.dv-live-toggle').click();await expect(root.locator('.dv-live-target').first()).toBeVisible();
 await head.getByRole('button',{name:'Next day',exact:true}).click();await expect(head.locator('.dv-live-note')).toContainText('Day 2');
 for(let day=3;day<=12;day++)await head.getByRole('button',{name:'Next day',exact:true}).click();
 await expect(body.locator('tr[data-live-ticket="UX-90"]')).toContainText('NOT ON DIAGRAM');await expect(body.locator('.dv-live-verdict')).toContainText('7 of 8 epic stories on diagram');
 await body.locator('tr[data-live-ticket="HW-124"]').getByRole('button',{name:'Indoor chime',exact:true}).click();await expect(root.locator('[data-dv-node="chime"] .card')).toBeFocused();
 await page.emulateMedia({media:'print'});await expect(body).not.toBeEmpty();await expect(body.locator('table.dv-live-tickets')).toBeVisible();
});

test('L4 loaded external coverage disables unrelated sections without another load',async({page,server})=>{
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
  for(const [key,label] of [['CH-1','Remote carrier'],['CH-2','Remote call']]){
   const button=panel.locator('tr[data-live-ticket="'+key+'"]').getByRole('button',{name:label,exact:true});await expect(button).toBeDisabled();await expect(button).toHaveAttribute('title',/Unrelated work/);
  }
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
 for(const key of ['HW-124','FW-46'])await expect(pop.getByRole('link',{name:key,exact:true})).toBeVisible();
 await page.keyboard.press('Escape');await expect(pop).toBeHidden();
 await node('mcu').locator('.t1').click();await expect(pop).toHaveAttribute('aria-label','Live tickets for Doorbell controller');await page.keyboard.press('Escape');await expect(pop).toBeHidden();
 await node('mcu').locator('.nrefs-trigger').click();await expect(root.locator('.node-link-menu')).toBeVisible();await expect(pop).toBeHidden();
});
test('R2 keyboard reaches ticketed carriers; coverage and First blocker focus the carrier itself',async({page,server})=>{
 const root=await openStory(page,server),node=id=>root.locator('g.node[data-dv-node="'+id+'"]'),pop=root.locator('.dv-live-popover');await demoDay(root,4);
 const card=node('chime').locator('.card'),label=root.locator('text.lbl[data-dv-edge="1"]');
 await expect(card).toHaveAttribute('role','button');await expect(card).toHaveAttribute('tabindex','0');await expect(card).toHaveAttribute('aria-label',/^Live tickets for Indoor chime/);
 await expect(label).toHaveAttribute('role','button');await expect(label).toHaveAttribute('tabindex','0');await expect(label).toHaveAttribute('aria-haspopup','dialog');
 await card.focus();await page.keyboard.press('Enter');await expect(pop).toBeVisible();await expect(card).toHaveAttribute('aria-expanded','true');
 await page.keyboard.press('Escape');await expect(pop).toBeHidden();await expect(card).toBeFocused();
 await label.focus();await page.keyboard.press(' ');await expect(pop).toHaveAttribute('aria-label','Live tickets for ring');await page.keyboard.press('Escape');await expect(label).toBeFocused();
 await expect(node('mcu').locator('.card')).toHaveAttribute('aria-label',/waiting on HW-124/);
 const panel=root.locator('.pt-live-status');await panel.locator('tr[data-live-ticket="HW-124"]').getByRole('button',{name:'Indoor chime',exact:true}).click();await expect(card).toBeFocused();
 await panel.locator('tr[data-live-ticket="HW-124"]').getByRole('button',{name:'press',exact:true}).click();await expect(root.locator('text.lbl[data-dv-edge="0"]')).toBeFocused();
});
test('R3 Workbench demo paint has no badges and a card click selects without the ticket popover',async({page,server})=>{
 await page.setViewportSize({width:1440,height:1000});await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(raw));await prepareEditorSurface(page);
 await page.getByRole('checkbox',{name:'Demo live status',exact:true}).check();const view=page.locator('#docview');
 await expect(view.locator('g.node.dv-live-active,g.node.dv-live-todo,g.node.dv-live-done,g.node.dv-live-blocked').first()).toBeVisible();
 await expect(view.locator('.dv-live-badge')).toHaveCount(0);await expect(view.locator('.card[tabindex],text.lbl[role="button"]')).toHaveCount(0);
 await cardClick(view.locator('g.node[data-dv-node="firmware"] .card'));await expect(view.locator('.dv-live-popover')).toBeHidden();
 await expect(view.locator('g.node[data-dv-node="firmware"]')).toHaveClass(/\bdv-sel\b/);
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

/* Node Styles presets for live paint (#762 addition, Chuck 2026-10-27): no overlay palette of its own.
 P1 nodes wear `node-styled ns-<preset>` (todo slate, active ember, done moss, blocked/missing rose, waiting slate);
    edges, coins and node cards take that preset's --ns-line in a light and a dark skin. Coin numerals follow the
    engine's step-colour rule (stepCircleInk: black or white, whichever contrasts more), which is black on every live fill.
 P2 missing carriers have a dotted rose outline/stroke; blocked ones are solid.
 P3 an authored node `style` yields to live state and returns when Live is turned off. */
const LIVE_PRESET={todo:'slate',active:'ember',done:'moss',blocked:'rose',missing:'rose'};
async function presetLine(page,token){
 return page.evaluate(t=>{
  const svg=document.querySelector('#docview g.node').ownerSVGElement,g=document.createElementNS('http://www.w3.org/2000/svg','g');g.setAttribute('class','node ns-'+t);svg.appendChild(g);
  const probe=document.createElement('span');probe.style.color=getComputedStyle(g).getPropertyValue('--ns-line').trim();document.body.appendChild(probe);const color=getComputedStyle(probe).color;probe.remove();g.remove();return color;
 },token);
}
test('P1 live nodes wear Node Styles presets; cards, edges and coins share the preset line in daylight and aurora',async({page,server})=>{
 const root=await openStory(page,server),node=id=>root.locator('g.node[data-dv-node="'+id+'"]');
 await demoDay(root,2);
 for(const skin of ['daylight','aurora']){
  await page.evaluate(s=>window.dvSetSkin(s),skin);
  await expect(root.locator('path.edge[data-dv-edge="0"]'),skin).toHaveClass(/dv-live-active/);
  await expect(root.locator('path.edge[data-dv-edge="0"]'),skin+' active edge').toHaveCSS('stroke',await presetLine(page,'ember'));
  const coins=await root.locator('g.coin[data-dv-step]').evaluateAll(els=>els.map(el=>({state:(/dv-live-(todo|active|done|blocked|missing)/.exec(el.getAttribute('class'))||[])[1],fill:getComputedStyle(el.querySelector('circle')).fill,ink:getComputedStyle(el.querySelector('text')).fill})).filter(c=>c.state));
  expect(coins.length,skin+' painted coins').toBeGreaterThan(0);
  for(const coin of coins){expect(coin.fill,skin+' '+coin.state+' coin').toBe(await presetLine(page,LIVE_PRESET[coin.state]));expect(coin.ink,skin+' '+coin.state+' coin numeral').toBe('rgb(0, 0, 0)');}
 }
 await demoDay(root,4);
 for(const [id,token] of [['chime','rose'],['button','ember'],['mcu','slate'],['ingest','slate']]){await expect(node(id),id).toHaveClass(/\bnode-styled\b/);await expect(node(id),id).toHaveClass(new RegExp('\\bns-'+token+'\\b'));}
 for(const skin of ['daylight','aurora']){
  await page.evaluate(s=>window.dvSetSkin(s),skin);
  for(const [id,token] of [['chime','rose'],['button','ember'],['mcu','slate']])await expect(node(id).locator('.card'),skin+' '+id).toHaveCSS('stroke',await presetLine(page,token));
  await expect(root.locator('path.edge[data-dv-edge="2"]'),skin+' waiting edge').toHaveCSS('stroke',await presetLine(page,'slate'));
 }
});
test('P2 missing carriers are dotted rose, blocked ones solid rose',async({page,server})=>{
 const root=await openStory(page,server),node=id=>root.locator('g.node[data-dv-node="'+id+'"]');await demoDay(root,6);
 await expect(node('app')).toHaveClass(/dv-live-missing/);await expect(node('app')).toHaveClass(/\bns-rose\b/);
 await expect(node('app').locator('.card')).toHaveCSS('stroke-dasharray','2px, 3px');
 await expect(root.locator('path.edge[data-dv-edge="4"]')).toHaveClass(/dv-live-missing/);await expect(root.locator('path.edge[data-dv-edge="4"]')).toHaveCSS('stroke-dasharray','2px, 3px');
 await expect(node('chime')).toHaveClass(/dv-live-blocked/);await expect(node('chime').locator('.card')).toHaveCSS('stroke-dasharray','none');
});
test('P3 an authored node style yields to live paint and returns when Live is off',async({page,server})=>{
 const spec=fixture();spec.page.sections[0].diagram.nodes.hardware.style='teal';
 const root=await open(page,server,spec),hw=root.locator('#section-delivery g.node[data-dv-node="hardware"]');
 await expect(hw).toHaveClass(/dv-live-active/);await expect(hw).toHaveClass(/\bns-ember\b/);await expect(hw).not.toHaveClass(/\bns-teal\b/);
 const live=root.locator('.dv-live-toggle');await live.click();await expect(hw).not.toHaveClass(/dv-live-active/);
 await expect(hw).toHaveClass(/\bnode-styled\b/);await expect(hw).toHaveClass(/\bns-teal\b/);await expect(hw).not.toHaveClass(/\bns-ember\b/);
 await live.click();await expect(hw).toHaveClass(/\bns-ember\b/);
});
