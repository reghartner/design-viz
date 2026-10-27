/* Contract matrix (browser and VM coverage together):
| row | rule |
|---|---|
| V1 | New file src/viewer/live-status.js, added to the `engine.js` list in src/source-bundles.json (so standalone, workbench, native/Backstage and forge entrypoints all get it; check tests/source-loader.test.js). ES5 browser code like its neighbours. |
| V2 | `renderPage` attaches `ctl.liveStatus` with: `refs()` → `{tickets:[distinct keys], prs:[distinct urls]}` over every diagram of the page (all sections, all paths, detail flows) using `trackingRefs`; `apply(map)`; `clear()`; `enabled()`; `setEnabled(bool)`; `onChange(fn)` (fires after apply/clear/setEnabled with `{states, counts, updatedAt}`); `state(ref)`. `map` is `{ "<ticket key>": {state, title?, url?, assignee?, prs?: {count, state}, detail?, updatedAt?} }`, `state` ∈ `todo|active|done|blocked|missing`. Unknown state strings are ignored (treated as absent). |
| V3 | Rollup for one carrier with several tickets (docs/live-status.md): any blocked → blocked; else any missing → missing; else any active → active; else all done → done; else all todo → todo; else (mix of done and todo) → active. A carrier whose tickets are all absent from the map gets NO class. Implement as a pure function `liveStatusRollup(states[])` (exported as a global like other engine helpers) so it is unit-testable. |
| V4 | `apply(map)` sets exactly one `dv-live-<state>` class (removing the others) on: every node `g.node[data-dv-node]` with tickets; every edge `path.edge[data-dv-edge]` with tickets, plus its halo path and its `text.lbl` label (same `data-dv-edge` index); every step coin `g.coin[data-dv-step]` and step chip `button.schip[data-step-source]` whose step involves (via `edges`/keys, `nodes`, failures) at least one carrier that has a state — rollup of those carriers' states; in path-timeline chips too. Text boxes (`g.node.node-text`) never get a class. |
| V5 | CSS in src/style.core.css, for EVERY skin selector family that paints `.card`/edges today (aurora, daylight, editorial, terminal, pastel, blueprint, rose, lavender, lilac — check the skin list in the file): `.dv-live-todo` grey, `.dv-live-active` amber, `.dv-live-done` green, `.dv-live-blocked` and `.dv-live-missing` red. Node: card stroke + a soft halo (drop-shadow) in the state color and the status badge; edge: stroke color (main + halo) with the state color; coin: circle fill + ink via the same `--step-color`/`--step-ink` custom properties the `.step-colored` rules use (so precedence and `!important` match); chip: background via the same variables. Define the five colors once as CSS custom properties on `:root` (`--dv-live-todo`, …) and reuse. active/blocked/missing pulse: reuse the existing `runtime-pulse` keyframes (stroke-width) on the badge circle and a slow (≈2.4 s) opacity pulse on the card halo; `@media (prefers-reduced-motion: reduce)` disables both (follow the existing reduced-motion blocks). Live classes win over `tone-*` card fill/stroke while present. Step-mode dimming (`.stepmode .node:not(.lit)` etc.) still applies but with an opacity floor of .55 for live-classed elements, like `.stepmode .coin.step-colored:not(.lit)`. Print: no pulse, keep colors. |
| V6 | Badge: on each live-classed node and edge, a small SVG `g.dv-live-badge` (circle + glyph: todo "○", active "◔", done "✓", blocked "!", missing "?") appended like `renderRuntimeConditions` does (`src/engine.js`, around line 1586) — top-right of the card (the bottom-right slot belongs to runtime badges and detail triggers); for edges at the label position. `missing` badge gets a hatched (dashed stroke) circle. Clicking/Enter/Space on a badge opens a popover (reuse the manual popover construction of `wireNodeReferences` / `.nbackpop`): one row per ticket — key (link to `tracking.jira.site + '/browse/' + key` when site exists, else `url` from the map, else plain text), state label, title, assignee, and "PRs: n open/merged" when `prs` present — then the authored `prs` URLs as plain links. Escape/outside click closes; focus returns to the badge. |
| V7 | Node "⋯" menu: `nodeReferenceLinks` (`src/engine.js:257`) gains a "Tickets" group listing ticket keys (browse links when site is set) and authored PR links for that node, so the menu shows them even without a provider. |
| V8 | Live control: in the reader controls (where the theme menu / Contents controls live, `src/viewer/contents.js`), a `button.dv-live-toggle` with text "Live" + counts chip per state (hidden when zero), `aria-pressed` reflecting `enabled()`, a `time.dv-live-updated` ("updated <relative>" from the newest `updatedAt`; omitted when none), and a `span.dv-live-note` text slot set by `ctl.liveStatus.note(text, kind)` (`kind` ∈ `info|warn|error`) plus `ctl.liveStatus.action(label, fn)` to show one button (used by #738 for "Allow"). The control is hidden until the page has at least one ticket ref (`refs().tickets.length > 0`). |
| V9 | Re-apply after every rebuild: listen on the section element for `dv:pathrender` and `dv:pathchange`, on the view for `diagram-tab-change`, `tab-view-change`, `diagram-view-change`, `navigation-mounted`, `detail-navigation`, and use one MutationObserver (childList, subtree) scoped to step-control containers for chip rebuilds; coalesce with requestAnimationFrame. The classes survive a path switch (new SVG) and a detail flow open. `ctl.destroy()` disconnects everything. |
| V10 | Host hook: `renderPage(..., {liveStatus: {provider: function(refs, signal) → Promise<map>, refreshMs}})`. When present: call the provider after first paint, then every `max(refreshMs, 30000)` ms while `document.visibilityState === 'visible'` (pause when hidden, one catch-up call on return); an AbortController signal is passed and aborted on destroy; rejections set `note(message,'error')` and keep the last map. `mountNativeSpec` (src/native/mount.js) forwards `liveStatus` and src/native/mount.d.ts declares `liveStatus?: {provider: (refs: {tickets: string[]; prs: string[]}, signal: AbortSignal) => Promise<Record<string, LiveStatusEntry>>; refreshMs?: number}` with a `LiveStatusEntry` type. src/boot.flowview.js passes `window.flowviewLiveStatus` (if set before boot) as that option. |
| V11 | No provider and no `apply` → no DOM/CSS difference versus today except the hidden Live control markup (keep it out of the DOM entirely when there are no ticket refs, so pages without tickets are byte-identical in structure). |
*/
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
// Freeze the original overlay fixture: the authored story may evolve independently.
const raw={"page":{"title":"Connected doorbell delivery","contract":"1","flowview":{"authoredWith":"0.2.0","minVersion":"0.2.0","features":["flow.live-status"]},"tracking":{"jira":{"site":"https://acme.atlassian.net"}},"sections":[{"heading":"From button press to resident notification","text":["Track implementation work on each component and the interactions between them. The spec stores references; Jira owns live status."],"diagram":{"nodes":{"hardware":{"title":"Hardware","sub":"Doorbell button","tickets":["HW-123"]},"firmware":{"title":"Firmware","sub":"Event delivery","tickets":["FW-45"],"prs":["https://github.com/acme/firmware/pull/88"]},"backend":{"title":"Backend","sub":"Notification service","tickets":["BE-67"]},"ux":{"title":"UX mobile app","sub":"Resident experience","tickets":["UX-89"]}},"rows":[["hardware","firmware","backend","ux"]],"edges":[{"from":"hardware","to":"firmware","label":"press","tickets":["HW-124","FW-46"]},{"from":"firmware","to":"backend","label":"event","kind":"https","tickets":["BE-68"],"prs":["https://github.com/acme/backend/pull/91"]},{"from":"backend","to":"ux","label":"notify","kind":"https"}]}}]}};
const FIXED_MAP={'HW-123':{state:'active',title:'Button delivery',assignee:'Alex',updatedAt:'2026-10-26T12:00:00Z',prs:{count:2,state:'open'}},'FW-45':{state:'done'},'FW-46':{state:'todo'},'BE-67':{state:'done'},'HW-124':{state:'blocked'},'BE-68':{state:'missing'}};
function fixture(){
 const spec=structuredClone(raw),section=spec.page.sections[0],d=section.diagram;section.id='delivery';
 d.nodes.firmware.tickets.push('FW-46');d.nodes.ux.tickets.push('BE-68');d.nodes.hardware.detail={section:'detail'};
 d.nodes.todo={title:'Planned work',tickets:['FW-46']};d.rows.push(['todo']);
 d.steps=[{id:'press',edge:'hardware->firmware',text:'Press'},{id:'notify',edge:'backend->ux',text:'Notify'},{id:'retry',edge:'backend->ux',failures:{'hardware->firmware':'dropped'},text:'Retry'}];
 d.paths=[{id:'normal',label:'Normal',steps:['press','notify']},{id:'retry',label:'Retry',steps:['press','retry','notify']}];
 spec.page.sections.push({id:'detail',heading:'Hardware detail',detailOnly:true,diagram:{nodes:{child:{title:'Child work',tickets:['HW-123']}},rows:[['child']]}});return spec;
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
 const live=root.locator('.dv-live-toggle');await expect(live).toBeVisible();await expect(live).toHaveAttribute('aria-pressed','true');for(const state of ['todo','active','done','blocked','missing'])await expect(live.locator('[data-live-count="'+state+'"]')).toContainText(state==='done'?'2':'1');await expect(root.locator('time.dv-live-updated')).toContainText('updated');
 await live.click();await expect(root.locator('.dv-live-active,.dv-live-done,.dv-live-todo,.dv-live-blocked,.dv-live-missing')).toHaveCount(0);await expect(live).toHaveAttribute('aria-pressed','false');await live.click();await expect(node('hardware')).toHaveClass(/dv-live-active/);
 await section.locator('.path-chip[data-dv-path="retry"]').click();await expect(section.locator('g.coin[data-dv-step="2"]')).toHaveClass(/dv-live-blocked/);await expect(section.locator('path.edge[data-dv-edge="0"]')).toHaveClass(/dv-live-blocked/);
 // Return to Ambient so the badges are comfortably visible in the overview.
 await section.getByRole('button',{name:'Ambient',exact:true}).click();
 const badge=node('hardware').locator('.dv-live-badge'),pop=root.locator('.dv-live-popover');await badge.click();await expect(pop).toBeVisible();await expect(pop.getByRole('link',{name:'HW-123',exact:true})).toHaveAttribute('href','https://acme.atlassian.net/browse/HW-123');await expect(pop).toContainText('Button delivery');await expect(pop).toContainText('Alex');await expect(pop).toContainText('PRs: 2 open');
 await page.keyboard.press('Escape');await expect(pop).toBeHidden();await expect(badge).toBeFocused();await badge.press('Space');await expect(pop).toBeVisible();await root.locator('.doc-title').click();await expect(pop).toBeHidden();await expect(badge).toBeFocused();
 await node('firmware').locator('.dv-live-badge').press('Enter');await expect(pop.getByRole('link',{name:'FW-45',exact:true})).toBeVisible();await expect(pop.getByRole('link',{name:'FW-46',exact:true})).toBeVisible();await expect(pop.getByRole('link',{name:'https://github.com/acme/firmware/pull/88',exact:true})).toBeVisible();await page.keyboard.press('Escape');
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
  await expect(section.locator('[data-dv-node="hardware"] .card')).toHaveCSS('stroke','rgb(245, 158, 11)');await expect(section.locator('path.edge[data-dv-edge="0"]')).toHaveCSS('stroke','rgb(239, 68, 68)');await expect(section.locator('.coin[data-dv-step="0"] > circle')).toHaveCSS('fill','rgb(239, 68, 68)');await expect(section.locator('.schip[data-step-source="0"]').first()).toHaveCSS('background-color','rgb(239, 68, 68)');
 }
 await page.emulateMedia({reducedMotion:'no-preference'});await expect(section.locator('[data-dv-node="hardware"] .dv-live-badge circle')).toHaveCSS('animation-name','runtime-pulse');await expect(section.locator('[data-dv-node="hardware"] .dv-live-halo')).toHaveCSS('animation-duration','2.4s');
 await page.emulateMedia({reducedMotion:'reduce'});await expect(section.locator('[data-dv-node="hardware"] .dv-live-badge circle')).toHaveCSS('animation-name','none');await expect(section.locator('[data-dv-node="hardware"] .dv-live-halo')).toHaveCSS('animation-name','none');
 await expect(section.locator('[data-dv-node="ux"] .dv-live-badge circle')).toHaveCSS('stroke-dasharray','2px, 2px');
 await expect.poll(()=>section.locator('[data-dv-node="ux"]').evaluate(el=>+getComputedStyle(el).opacity)).toBeGreaterThanOrEqual(.55);
 await page.emulateMedia({media:'print',reducedMotion:'no-preference'});await expect(section.locator('[data-dv-node="hardware"] .dv-live-badge circle')).toHaveCSS('animation-name','none');await expect(section.locator('[data-dv-node="hardware"] .card')).toHaveCSS('stroke','rgb(245, 158, 11)');
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
 await expect(edge).toHaveClass(/dv-live-blocked/);const failure=root.locator('g.comm-failure[data-dv-edge="0"]');await expect(failure).toHaveCount(1);await expect(failure).toHaveAttribute('aria-label',/Not sent:.*HW-124/);await expect(failure.locator('text')).toContainText('HW-124');
 await expect(node('mcu')).toHaveClass(/dv-live-waiting/);await expect(node('mcu')).toHaveClass(/dv-live-active/);await expect(node('mcu')).toHaveAttribute('data-dv-live-waiting-on','HW-124');await expect(node('button')).not.toHaveClass(/dv-live-waiting/);
 await expect(node('mcu').locator('.dv-live-waiting-tag')).toContainText('waiting on HW-124');await node('mcu').locator('.dv-live-badge').press('Enter');await expect(root.locator('.dv-live-popover')).toContainText('waiting on HW-124');await page.keyboard.press('Escape');
 for(const skin of ['aurora','terminal','pastel','blueprint','rose','lavender','lilac','daylight','editorial']){await page.evaluate(s=>window.dvSetSkin(s),skin);await expect(node('mcu').locator('.card')).toHaveCSS('stroke','rgb(168, 119, 119)');await expect(node('mcu').locator('.card')).toHaveCSS('stroke-dasharray','5px, 5px');}
 await page.emulateMedia({media:'print'});await expect(node('mcu').locator('.card')).toHaveCSS('stroke','rgb(168, 119, 119)');await expect(node('mcu').locator('.dv-live-halo')).toHaveCSS('animation-name','none');await page.emulateMedia({media:'screen'});
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
test('S2 S3 without hash there are no demo controls or live classes',async({page,server})=>{
 const root=await openStory(page,server,'');await expect(root.locator('.dv-live-demo')).toHaveCount(0);await expect(root.locator('.dv-live-badge,.dv-live-waiting,.dv-live-todo')).toHaveCount(0);
});
test('S2 host provider takes precedence over the demo hash',async({page,server})=>{
 await page.addInitScript(()=>{window.flowviewLiveStatus={provider:refs=>Object.fromEntries(refs.tickets.map(key=>[key,{state:'done'}]))};});const root=await openStory(page,server);await expect(root.locator('path.edge').first()).toHaveClass(/dv-live-done/);await expect(root.locator('.dv-live-demo')).toHaveCount(0);
});
test('S2 S3 fallback demo honors cadence, Pause and reduced motion',async({page,server})=>{
 await page.clock.install();await page.emulateMedia({reducedMotion:'no-preference'});await page.setViewportSize({width:1440,height:1000});
 const spec={page:{title:'Fallback',sections:[{diagram:{nodes:{a:{title:'A',tickets:['AA-1']},b:{title:'B',tickets:['BB-1']}},rows:[['a','b']],edges:[{from:'a',to:'b'}]}}]}};
 const file=path.join(server.root,'fallback.json'),out=path.join(server.root,'fallback.html');await writeFile(file,JSON.stringify(spec));execFileSync('python3',[path.join(repo,'tools/inject.py'),file,path.join(repo,'template/flowview.html'),out]);await page.goto(server.origin+'/fallback.html#live=demo');const root=page.locator('#docview'),demo=root.locator('.dv-live-demo');
 await expect(demo).toBeVisible();await expect(page.locator('#live-timeline')).toHaveCount(0);await expect(root.locator('.dv-live-note')).toContainText('Day 1');await page.clock.runFor(6000);await expect(root.locator('.dv-live-note')).toContainText('Day 2');
 await demo.getByRole('button',{name:'Pause',exact:true}).click();await page.clock.runFor(12000);await expect(root.locator('.dv-live-note')).toContainText('Day 2');await demo.getByRole('button',{name:'Play',exact:true}).click();await page.clock.runFor(6000);await expect(root.locator('.dv-live-note')).toContainText('Day 3');
 await page.emulateMedia({reducedMotion:'reduce'});await page.clock.runFor(12000);await expect(root.locator('.dv-live-note')).toContainText('Day 3');await demo.getByRole('button',{name:'Next day',exact:true}).click();await expect(root.locator('g.node.dv-live-done')).toHaveCount(2);
});
