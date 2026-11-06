/* Focused compare view (issue #848, PR 2 of 3): one change at a time, Before left / After
   right, showing only what changed: each side's step controls at the change's step, then only
   the panels whose folded state differs there, with value labels, a carried-range note per
   panel, a caption word diff and step-strip markers. Contract: issue #848 "How it should look"
   and Test + flip rows 1, 2, 2b, 3; Chuck 2026-10-31 (Focused default + Full diagram toggle;
   EDIT-only list with markers on affected steps) and 2026-11-01 (coverage = this new spec + old
   tests updated in place + Node unit tests in tests/compare-focus.test.js; clicking a step on
   either side moves BOTH sides and redraws the rows; camera sync was originally one-way; superseded by Chuck 2026-11-05: manual camera sync in both directions). Desktop only.
   Viewer-only page with the audited server; fixtures are built before interaction; all
   interaction is real pointer/keyboard input on visible controls.

   CONTRACT MATRIX
   F1 default     the view opens Focused ("Focused" pressed, "Full diagram" not); the first change
                  (step 6) shows each side's step controls at step 6 with that side's caption;
                  no node or edge of either diagram is visible                 rejects: Full by default; one side only
   F2 rows        exactly the panels that differ at step 6, in declaration order (Power draw,
                  Battery, Event log; the unchanged Mailbox absent); each row holds that one panel
                  per side with the side's folded value (6 mA | 42 mA, 80 % | 75 %, 3 | 4 log
                  lines), exact value labels and an exact carried-range note     rejects: all panels; values from one side
   F3 markers     each side's step strip marks edited steps (6, 8, 10: the steps the change list
                  edits) and carried steps (7, 9, 11, 12: no edit, but the reader sees a difference)
                  and no other step                                            rejects: markers on every step; edited only
   F4 step click  clicking step 7 on the Before side moves both sides to 7 and redraws the rows
                  (Power draw, Event log); clicking step 2 on the After side moves both to 2 with
                  no rows and the empty-state text                             rejects: one-side stepping; stale rows
   F4b pairing    the proposal inserts a step after step 1, so paired steps sit at different
                  positions; run with step ids, without ids (content + caption pairing) and with only
                  the inserted step id'd while the edited step's caption changes (one-to-one): clicking
                  Before step 3 puts After on step 4 (same caption, same changed-panel row);
                  clicking the inserted After step 2 leaves Before without a current step and shows
                  "Step not in the current document"; each side's step dots follow the pairing
                  (Before: 3 edited, 4 carried; After: 2 and 4 edited, 5 carried)
                                                                              rejects: pairing by position or by id only; dots copied by index
   F5 caption     the caption change (step 8) shows both captions and a word diff with exact
                  removed and added words                                      rejects: whole-text replace; no diff
   F6 untrusted   markup in a caption and in a panel value is shown as literal text in the word diff
                  and the value label; no img/script element is created in the focused view and
                  the markup's script never runs                               rejects: innerHTML of authored text
   F7 placeholder an added panel's row shows "Not in the current document" on the Before side and the
                  panel on the After side; a removed step's After controls show "Step not in the
                  proposal" while Before shows that step                       rejects: empty cell; wrong side
   F8 toggle      "Full diagram" hides the focused view and shows both full panes (nodes visible);
                  the mode stays while changes are selected; "Focused" restores the rows
                                                                              rejects: toggle resets on selection
   F9 crop        (PR 3, updated in place) a node change in Focused mode shows both panes cropped
                  to the node: no fallback note, Zoom out and Whole section offered
                                                                              rejects: full-diagram fallback for nodes
   F9b kinds      (PR 3, updated in place) an imported node (provider change), a local edge and a new
                  node each show the crop controls and no note (their framing and widening are C2,
                  C3 and C6); a section heading change still shows the full panes with the note
                                                                              rejects: crop controls on a section change
   --- PR 3 (node/edge crop; issue #848 rows 4 and 7a; Chuck 2026-10-31 crop + zoom out + whole
       section; 2026-11-01 coverage: extend this spec, F9/F9b updated in place) ---
   Every crop case (C1-C4, C6) runs the same check (exerciseCrop), in BOTH panes: the framed
   nodes are inside the pane's visible area and two far nodes of the same row are outside it; the
   changed object carries the change outline and an unchanged neighbour does not; Zoom out shows
   more nodes, keeps the changed object shown, and shrinks an unchanged reference node by the same
   factor in both panes (1/1.6, within 0.05); Whole section shows both ends of the row.
   C1 node crop   local node n6: n5 n6 n7 framed                               rejects: no crop; one pane; per-pane zoom
   C2 imported    imported node child::p6 changed by its provider              rejects: local-only crop
   C2b imp. conn. imported connection child::p5 -> child::p6 changed by its provider: endpoints and
                  their neighbours (p4 p5 p6 p7) framed; the outlined connection is the one each side
                  labels "hop 5" / "hop five changed"                           rejects: local-edge-only crop; wrong edge outlined
   C3 connection  local connection n5 -> n6: endpoints and their neighbours (n4 n5 n6 n7) framed
                                                                              rejects: endpoint-only crop
   C4 removed     removed node n6: Before frames n5 n6 n7; After (without n6) frames n5 n7
                                                                              rejects: blank or whole-section side
   C6 added       added node x after n11: After frames x and n11 (x outlined as added); Before
                  (without x) frames n11; n0 and n1 outside; Whole section shows n0..x in After and
                  n0..n11 in Before                                            rejects: unframed added node
   C5 reset       selecting another node change after Whole section crops again (the zoom level
                  belongs to one selection)                                    rejects: sticky Whole section
   T1-T5: issue #892 (Chuck 2026-11-03: "Line diff in view": the Focused area shows Before lines
   left, After lines right, only the changed lines, changed words marked; page-level fields as
   Before/After values; coverage = extend this spec and compare-view.spec.mjs).
   T1 ledger      a modified coverage ledger with two separate hunks: exactly two blocks headed
                  "Before line 3 · After line 3" and "Before line 5 · After lines 5-6"; each side
                  holds only its changed lines with their line numbers; removed words are <del> on
                  the Before side only, added words <ins> on the After side only (a whole added line
                  is one <ins>); unchanged lines (e.g. "Paths preserved.") are absent; no diagram
                  node or edge is visible                                       rejects: whole ledger; one side; unmarked words
   T2 page field  a changed page title and an added page description (page metadata): two blocks
                  headed "title" and "description"; title Before "Doorbell", After "Doorbell v2" with
                  "v2" as the only <ins>; description Before "Not set", After the whole text as one
                  <ins>; no <del>, no line numbers                             rejects: raw JSON dump; Details-only; blank absent side
   T3 added /     a ledger only in the proposal: heading "Before no ledger · After lines 1-2";
      removed     Before shows "No coverage ledger"; After lists both lines, each one <ins>. A ledger
                  only in the current document: "Before lines 1-2 · After no ledger"; After shows "No
                  coverage ledger"; Before lists both lines, each one <del>    rejects: empty column; unmarked lines
   T4 full        Full diagram on a ledger change hides the line diff and shows both panes;
                  Focused shows it again                                       rejects: line diff stuck in Full mode
   T5 untrusted   markup in a ledger line and in the title stays literal text (no element made,
                  no script run)                                               rejects: innerHTML rendering
   T7 whitespace  a ledger whose edits change only whitespace (indent "  - item" -> "    - item", a double
                  space "a  b" -> "a b"): each line shows its exact text (indentation and repeated spaces
                  kept, compared without normalization), the removed whitespace is a <del> on the Before
                  side and the added whitespace an <ins> on the After side      rejects: whitespace collapsed; whitespace-only edits unmarked
   T6 opening     a proposal that changes the page title and a step's panel opens on the step
                  change (its rail item current, the Focused panel row shown), not on the title
                  change listed first; a ledger-only comparison opens on the ledger change (T1's
                  fixture: the first item is current on load)                  rejects: opening on a text-only change while a diagram change exists
                  (the onboarding tour's preview step, workbench-onboarding.spec.mjs, needs both panes)
   D1-D4: issue #893 (Chuck 2026-11-03: "Step strip + diagrams": a step edit that changes only the
   diagram, and a path edit, keep both full diagram panes set to the affected step, with each side's
   step strip above them, the affected steps marked; the rail names the affected steps
   ("affects steps 3-4"); coverage = extend this spec).
   D1 diagram     a step edit that changes only the highlighted node (s3 nodes app -> hub): rail text
      step        exactly "Modified · Step s3 · nodes · affects step 3"; selecting it keeps Focused
                  pressed and shows each side's step strip (12 steps) on step 3 with only step 3 marked
                  "edited"; both panes stay visible and show step 3's caption ("Mailbox flag rises"),
                  the After pane highlights (class lit) hub, the Before pane app; no panel rows, no "Use Full diagram" note, no
                  fallback note                                                rejects: full panes without strips; strips hiding the panes
   D2 stepping    clicking step 4 on the After strip moves both strips and both panes to step 4
                  ("Hub checks the camera")                                    rejects: strip moves without the panes; one side only
   D3 path        a path whose members change (alt: s9 -> s5 at step 5): rail text exactly
      members     "Modified · Path Short ring · steps · affects step 5"; selecting it shows the alt
                  path's strips (6 steps each) on step 5, only step 5 marked on both sides; the After
                  pane shows "Push is delivered" (s5), the Before pane "Stream ends" (s9)
                                                                              rejects: main path shown; one side without a step
   D1 layout      in D1 both step strips are visible and each ends above the top of its side's pane;
                  Full diagram hides the strips and keeps both panes; Focused shows them again
                                                                              rejects: hidden or overlapping strips; strips stuck in Full mode
   D1b carried    a tone edit at step 2 (reader effects at steps 2-12): rail "Modified · Step s2 ·
                  tone.hub · affects steps 2-12"; strips on step 2, step 2 marked "edited" and steps
                  3-12 "carried" on both sides                                 rejects: single-step label; unmarked carried steps
   D3b path list  a path whose members change at positions 2, 5 and 6: rail "Modified · Path Short
                  ring · steps · affects steps 2, 5-6"; strips open on step 2 (After "Camera streams",
                  Before "Hub wakes the radio") with steps 2, 5, 6 marked on both sides
                                                                              rejects: range-only formatting; first position only
   D5 imported    a consumer step that changes its highlight to the imported node child::p1: rail
                  "Modified · Step two · nodes · affects step 2"; strips on step 2; the After pane
                  highlights child::p1, the Before pane b                     rejects: local-only node handling
   D6 added path  an added path keeps today's view: rail "Added · Path Third ring" (no affected
                  steps); no step strips, the full-diagram note shown, both panes visible
                                                                              rejects: diagram mode for added records
   D4 path label  a path label edit (no reader effect): rail text exactly "Modified · Path Quick ring
                  · label" (no affected steps); the strips show that path (6 steps) on step 1 with no
                  marks; both panes visible                                    rejects: invented affected steps; wrong path
   excluded       section heading text diffs (issue row 7b): a heading change shows the full panes;
                  not in #892 */
import {test,expect} from '../helpers/test.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const plain=v=>JSON.parse(JSON.stringify(v));

/* Twelve steps, four panels. The proposal edits step 6 (three panels), step 8 (caption) and
   step 10 (Power draw). Power draw differs at 6-7 (step 8 sets 9 on both sides) and 10-12;
   Battery at 6 only (step 7 sets 70 on both); Event log from 6 to the end (log lines accumulate). */
function doorbell(){
  const T=['Resident presses the doorbell','Hub wakes the radio','Mailbox flag rises','Hub checks the camera','Push is delivered','Resident taps Live View',
    'Camera streams','Hub logs the press','Stream ends','Power settles','Radio sleeps','Hub idles'];
  const steps=T.map((text,i)=>({id:'s'+(i+1),nodes:[['bell','hub','app'][i%3]],text}));
  steps[0].panels={power:{value:2},log:{log:[{tag:'DEV',text:'PIR IRQ · motion'}]}};
  steps[1].panels={log:{log:[{tag:'NET',text:'PUB evt/door/motion'}]}};
  steps[2].panels={mail:{value:1}};
  steps[4].panels={log:{log:[{tag:'NET',text:'push delivered'}]}};
  steps[5].panels={power:{value:6},battery:{value:80}};
  steps[6].panels={battery:{value:70}};
  steps[7].panels={power:{value:9}};
  steps[9].panels={power:{value:320}};
  const current={page:{title:'Doorbell',blocks:[{id:'ring',heading:'Ring the doorbell',diagram:{view:'step',autoplay:false,
    nodes:{bell:{title:'Doorbell'},hub:{title:'Hub'},app:{title:'App'}},rows:[['bell','hub','app']],
    edges:[{from:'bell',to:'hub'},{from:'hub',to:'app'}],
    panels:[{id:'power',type:'gauge',title:'Power draw',unit:'mA',max:400,initial:{value:0}},
      {id:'battery',type:'gauge',title:'Battery',unit:'%',max:100,initial:{value:100}},
      {id:'mail',type:'gauge',title:'Mailbox',max:5,initial:{value:0}},
      {id:'log',type:'log',title:'Event log',tags:{DEV:'#FFC53D',NET:'#38E1FF',APP:'#5AD8A6'}}],
    steps}}]}};
  const proposed=plain(current),s=proposed.page.blocks[0].diagram.steps;
  s[5].panels={power:{value:42},battery:{value:75},log:{log:[{tag:'APP',text:'LIVE VIEW requested by resident'}]}};
  s[7].text='Hub records the button press';
  s[9].panels={power:{value:300}};
  return {current,proposed};
}

/* Viewer-only page: the injected viewer template plus a fixture script that mounts the
   shared component through window.FlowviewCompare (no Workbench bundle). */
/* JSON for an inline script: "<" is escaped so authored text such as "</script>" cannot end the script element. */
const inline=v=>JSON.stringify(v).replace(/</g,'\\u003c');
async function mountPage(page,server,name,current,proposed,mode,script){
  await writeFile(path.join(server.root,name+'.json'),JSON.stringify(current));
  execFileSync('python3',[path.join(root,'tools/inject.py'),path.join(server.root,name+'.json'),path.join(root,'template/flowview.html'),path.join(server.root,name+'.html')]);
  const html=await readFile(path.join(server.root,name+'.html'),'utf8');
  expect(html,'precondition: viewer-only page').not.toContain('initWorkbenchAgentReview');
  const close=html.lastIndexOf('</body>'),at=close>=0?close:html.length;
  await writeFile(path.join(server.root,name+'.html'),html.slice(0,at)+`<div id="compare-host" style="position:fixed;inset:0;z-index:9999;background:#fff"></div>
<script>window.addEventListener('load',function(){
  if(!window.FlowviewCompare)return;
  ${script||`var a=FlowviewCompare.normalize(${inline(current)}),b=FlowviewCompare.normalize(${inline(proposed)});
  var entries=FlowviewCompare.compare({authored:a,resolved:a,ledger:null},{authored:b,resolved:b,ledger:null});
  window.cv=FlowviewCompare.mount(document.getElementById('compare-host'),${mode?`{before:a,after:b,entries:entries,mode:${JSON.stringify(mode)}}`:'{before:a,after:b,entries:entries}'});`}
});</script>`+html.slice(at));
  await page.setViewportSize({width:1440,height:900});
  await page.goto(server.origin+'/'+name+'.html');
  return page.locator('#compare-host');
}
const side=(host,s)=>host.locator('.compare-focus-side[data-side="'+s+'"]');
const stepButtons=(host,s)=>side(host,s).locator('button.compare-focus-step');
const currentStep=(host,s)=>side(host,s).locator('button.compare-focus-step[aria-current="true"]');
const rows=host=>host.locator('.compare-focus-row');
const cell=(row,s)=>row.locator('.compare-focus-cell[data-side="'+s+'"]');
const items=host=>host.locator('.compare-rail button.compare-rail-item');
/* The compare view's own mode bar: each pane's reader toolbar also has a "Zoom out" button. */
const modeBar=host=>host.getByRole('group',{name:'Compare mode'});
async function bothAt(host,n,captions){
  for(const s of ['before','after']){
    await expect(currentStep(host,s),s+' side is on step '+n).toHaveText(String(n));
    if(captions)await expect(side(host,s).locator('.compare-focus-caption')).toHaveText(captions[s==='before'?0:1]);
  }
}
async function noGraphVisible(host){
  await expect(host.locator('[data-dv-node]:visible'),'no diagram node is visible in Focused mode').toHaveCount(0);
  await expect(host.locator('[data-dv-edge]:visible'),'no diagram edge is visible in Focused mode').toHaveCount(0);
}
async function rowTitles(host){return rows(host).evaluateAll(list=>list.map(r=>r.getAttribute('data-panel-id')));}

test('F1 F2 F3 the view opens Focused on the step 6 change with only the changed panels, value labels, carried notes and step markers',async({page,server})=>{
  const {current:a,proposed:b}=doorbell(),host=await mountPage(page,server,'focus-default-'+Date.now(),a,b);
  /* F1 */
  await expect(host.getByRole('button',{name:'Focused',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(host.getByRole('button',{name:'Full diagram',exact:true})).toHaveAttribute('aria-pressed','false');
  await expect(items(host)).toHaveCount(3);await expect(items(host).nth(0)).toHaveAttribute('aria-current','true');
  for(const s of ['before','after'])await expect(stepButtons(host,s)).toHaveText(['1','2','3','4','5','6','7','8','9','10','11','12']);
  await bothAt(host,6,['Resident taps Live View','Resident taps Live View']);
  await noGraphVisible(host);
  /* F2 */
  await expect(rows(host)).toHaveCount(3);
  expect(await rowTitles(host),'changed panels in declaration order; the unchanged Mailbox is absent').toEqual(['power','battery','log']);
  const expected=[
    {title:'Power draw',before:'6 mA',after:'42 mA',chips:['value 6 → 42'],note:'Power draw differs from step 6 through step 7'},
    {title:'Battery',before:'80 %',after:'75 %',chips:['value 80 → 75'],note:'Battery differs at step 6 only'},
    {title:'Event log',chips:['log +1 entry'],note:'Event log differs from step 6 through step 12'}];
  for(let i=0;i<expected.length;i++){
    const row=rows(host).nth(i),e=expected[i];
    for(const s of ['before','after']){
      await expect(cell(row,s).locator('.pwidget'),'one panel per side in row '+i).toHaveCount(1);
      await expect(cell(row,s).locator('.ptitle')).toHaveText(e.title);
    }
    if(e.before){await expect(cell(row,'before').locator('.gaugeval')).toHaveText(e.before);await expect(cell(row,'after').locator('.gaugeval')).toHaveText(e.after);}
    else{
      await expect(cell(row,'before').locator('.pbody')).not.toContainText('LIVE VIEW requested by resident');
      await expect(cell(row,'after').locator('.pbody')).toContainText('LIVE VIEW requested by resident');
      await expect(cell(row,'before').locator('.pbody')).toContainText('push delivered');
    }
    await expect(row.locator('.compare-focus-chip')).toHaveText(e.chips);
    await expect(row.locator('.compare-focus-note')).toHaveText(e.note);
  }
  await expect(host.locator('.compare-focus .pwidget .ptitle').filter({hasText:'Mailbox'})).toHaveCount(0);
  /* F3 */
  for(const s of ['before','after']){
    const marks=await stepButtons(host,s).evaluateAll(list=>list.map(b=>b.getAttribute('data-step-mark')||''));
    expect(marks,s+' step strip markers').toEqual(['','','','','','edited','carried','edited','carried','edited','carried','carried']);
  }
});

test('F4 clicking a step on either side moves both sides and redraws the changed panels',async({page,server})=>{
  const {current:a,proposed:b}=doorbell(),host=await mountPage(page,server,'focus-step-'+Date.now(),a,b);
  await bothAt(host,6);await expect(rows(host),'precondition: three rows at step 6').toHaveCount(3);
  await stepButtons(host,'before').filter({hasText:/^7$/}).click();
  await bothAt(host,7,['Camera streams','Camera streams']);
  await expect.poll(()=>rowTitles(host)).toEqual(['power','log']);
  await expect(rows(host).nth(0).locator('.compare-focus-chip')).toHaveText(['value 6 → 42']);
  await expect(rows(host).nth(0).locator('.compare-focus-note')).toHaveText('Power draw differs from step 6 through step 7');
  await expect(rows(host).nth(1).locator('.compare-focus-chip')).toHaveText(['log +1 entry']);
  await stepButtons(host,'after').filter({hasText:/^2$/}).click();
  await bothAt(host,2,['Hub wakes the radio','Hub wakes the radio']);
  await expect(rows(host)).toHaveCount(0);
  await expect(host.locator('.compare-focus-empty')).toHaveText('No panel differences at step 2.');
  await noGraphVisible(host);
});

test('F5 a caption change shows both captions and a word diff',async({page,server})=>{
  const {current:a,proposed:b}=doorbell(),host=await mountPage(page,server,'focus-caption-'+Date.now(),a,b);
  await expect(items(host).nth(0)).toHaveAttribute('aria-current','true');
  await expect(host.locator('.compare-word-diff'),'precondition: the step 6 change has no caption diff').toHaveCount(0);
  await page.keyboard.press('j');await expect(items(host).nth(1)).toHaveAttribute('aria-current','true');
  await bothAt(host,8,['Hub logs the press','Hub records the button press']);
  const diff=host.locator('.compare-word-diff');
  await expect(diff).toHaveCount(1);
  await expect(diff.locator('del')).toHaveText(['logs']);
  await expect(diff.locator('ins')).toHaveText(['records','button']);
  await expect(diff).toHaveText('Hub logs records the button press');
  await expect.poll(()=>rowTitles(host),{message:'the Event log still differs at step 8'}).toEqual(['log']);
  await noGraphVisible(host);
});

test('F6 markup in a caption and in a panel value stays literal text',async({page,server})=>{
  const IMG='<img src=x onerror=window.__pwned=1>',SCRIPT='<script>window.__pwned=1</script>';
  const current={page:{title:'Untrusted',blocks:[{id:'u',heading:'Untrusted',diagram:{view:'step',autoplay:false,nodes:{a:{title:'A'}},rows:[['a']],
    panels:[{id:'g',type:'gauge',title:'Gauge',initial:{value:1,label:'plain'}},{id:'log',type:'log',title:'Log'}],
    steps:[{id:'s1',nodes:['a'],text:'Before text'},{id:'s2',nodes:['a'],text:'Second'}]}}]}};
  const proposed=plain(current),d=proposed.page.blocks[0].diagram;
  d.steps[0].text='Before '+IMG+' text';d.steps[0].panels={g:{label:IMG},log:{log:[{tag:'X',text:SCRIPT}]}};
  const host=await mountPage(page,server,'focus-untrusted-'+Date.now(),current,proposed);
  await bothAt(host,1);
  const diff=host.locator('.compare-word-diff');
  await expect(diff).toContainText('<img src=x onerror=window.__pwned=1>');
  await expect(host.locator('.compare-focus-row[data-panel-id="g"] .compare-focus-chip')).toHaveText(['label plain → '+IMG]);
  await expect(cell(host.locator('.compare-focus-row[data-panel-id="log"]'),'after').locator('.pbody')).toContainText(SCRIPT);
  await expect(host.locator('.compare-focus img, .compare-focus script')).toHaveCount(0);
  expect(await page.evaluate(()=>window.__pwned),'authored markup never runs').toBeUndefined();
});

test('F7 F9 added panels and removed steps show placeholders; a node change shows the cropped panes',async({page,server})=>{
  const current={page:{title:'Place',blocks:[{id:'p',heading:'Place',diagram:{view:'step',autoplay:false,
    nodes:{a:{title:'Alpha'},b:{title:'Beta'},c:{title:'Gamma'}},rows:[['a','b','c']],edges:[{from:'a',to:'b'},{from:'b',to:'c'}],
    panels:[{id:'g',type:'gauge',title:'Gauge',initial:{value:1}}],
    steps:[{id:'s1',nodes:['a'],text:'First'},{id:'s2',nodes:['b'],text:'Middle'},{id:'s3',nodes:['c'],text:'Last'}]}}]}};
  const proposed=plain(current),d=proposed.page.blocks[0].diagram;
  d.nodes.c.title='Gamma renamed';d.panels.push({id:'vf',type:'gauge',title:'Viewfinder',initial:{value:3}});d.steps.splice(1,1);
  const host=await mountPage(page,server,'focus-place-'+Date.now(),current,proposed);
  await expect(items(host)).toHaveText(['Modified · Node Gamma renamed · title','Added · Panel Viewfinder','Removed · Step s2']);
  /* F9: the first change is a node change: both panes, cropped to it */
  await expect(items(host).nth(0)).toHaveAttribute('aria-current','true');
  await expect(host.getByRole('button',{name:'Focused',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(host.locator('.compare-focus')).toBeHidden();
  await expect(host.locator('.compare-mode-note')).toBeHidden();
  await expect(modeBar(host).getByRole('button',{name:'Zoom out',exact:true})).toBeVisible();
  await expect(modeBar(host).getByRole('button',{name:'Whole section',exact:true})).toBeVisible();
  await expect(host.locator('.compare-pane[data-side="after"] [data-dv-node="c"]:visible').first()).toContainText('Gamma renamed');
  await expect(host.locator('.compare-pane[data-side="before"] [data-dv-node="c"]:visible').first()).toContainText('Gamma');
  /* F7: added panel */
  await items(host).nth(1).click();
  await expect(host.locator('.compare-focus')).toBeVisible();await expect(host.locator('.compare-mode-note')).toBeHidden();
  const row=host.locator('.compare-focus-row[data-panel-id="vf"]');
  await expect(cell(row,'before').locator('.compare-focus-missing')).toHaveText('Not in the current document');
  await expect(cell(row,'before').locator('.pwidget')).toHaveCount(0);
  await expect(cell(row,'after').locator('.ptitle')).toHaveText('Viewfinder');
  await expect(cell(row,'after').locator('.gaugeval')).toHaveText('3');
  /* F7: removed step */
  await items(host).nth(2).click();
  await expect(currentStep(host,'before')).toHaveText('2');
  await expect(side(host,'before').locator('.compare-focus-caption')).toHaveText('Middle');
  await expect(side(host,'after').locator('.compare-focus-missing')).toHaveText('Step not in the proposal');
  await expect(currentStep(host,'after')).toHaveCount(0);
  await noGraphVisible(host);
});

test('F8 the Full diagram toggle shows both full panes and keeps its mode across selections',async({page,server})=>{
  const {current:a,proposed:b}=doorbell(),host=await mountPage(page,server,'focus-toggle-'+Date.now(),a,b);
  await expect(rows(host),'precondition: Focused rows').toHaveCount(3);
  await host.getByRole('button',{name:'Full diagram',exact:true}).click();
  await expect(host.getByRole('button',{name:'Full diagram',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(host.getByRole('button',{name:'Focused',exact:true})).toHaveAttribute('aria-pressed','false');
  await expect(host.locator('.compare-focus')).toBeHidden();
  for(const s of ['before','after'])await expect(host.locator('.compare-pane[data-side="'+s+'"] [data-dv-node="hub"]:visible').first()).toBeVisible();
  await page.keyboard.press('j');await expect(items(host).nth(1)).toHaveAttribute('aria-current','true');
  await expect(host.locator('.compare-focus'),'Full mode stays after selecting another change').toBeHidden();
  await expect(host.locator('.compare-pane[data-side="after"] [data-dv-node="hub"]:visible').first()).toBeVisible();
  await host.getByRole('button',{name:'Focused',exact:true}).click();
  await expect(host.locator('.compare-focus')).toBeVisible();
  await bothAt(host,8);
  await expect.poll(()=>rowTitles(host)).toEqual(['log']);
  await noGraphVisible(host);
});

/* Three ways the engine pairs the edited step "Three" while an inserted step shifts positions: by id;
   without ids by its unique caption; and, when its caption also changes and only the inserted step has an
   id, as the single leftover id-less step on each side (one-to-one). All give the same pairing and dots. */
const PAIRINGS=[{name:'step ids',ids:true,edited:'Three'},{name:'no step ids, caption pairing',ids:false,edited:'Three'},
  {name:'no step ids, one-to-one pairing',ids:false,edited:'Three revised',insertedId:true}];
for(const v of PAIRINGS)test('F4b step clicks and step dots follow the engine step pairing when the proposal inserts a step ('+v.name+')',async({page,server})=>{
  const withIds=v.ids,step=(id,text,extra)=>Object.assign(withIds?{id}:{},{nodes:['a'],text},extra||{});
  const current={page:{title:'Pairing',blocks:[{id:'p',heading:'Pairing',diagram:{view:'step',autoplay:false,nodes:{a:{title:'A'}},rows:[['a']],
    panels:[{id:'g',type:'gauge',title:'Gauge',initial:{value:1}}],
    steps:[step('s1','One'),step('s2','Two'),step('s3','Three',{panels:{g:{value:5}}}),step('s4','Four')]}}]}};
  const proposed=plain(current),d=proposed.page.blocks[0].diagram;
  d.steps.splice(1,0,Object.assign(v.insertedId?{id:'new'}:{},step('new','Inserted')));d.steps[3].panels={g:{value:7}};d.steps[3].text=v.edited;
  const host=await mountPage(page,server,'focus-pairing-'+PAIRINGS.indexOf(v)+'-'+Date.now(),current,proposed);
  await expect(stepButtons(host,'before'),'precondition: Before has 4 step buttons').toHaveCount(4);
  await expect(stepButtons(host,'after'),'precondition: After has 5 step buttons').toHaveCount(5);
  /* Dots: the edited step (Three: Before 3, After 4) and the inserted step (After 2) are edited; Four
     carries the Gauge difference (5 vs 7) and is carried on both sides; One and Two are unmarked. */
  const marks=s=>stepButtons(host,s).evaluateAll(list=>list.map(b=>b.getAttribute('data-step-mark')||''));
  await expect.poll(()=>marks('before'),{message:'Before step dots'}).toEqual(['','','edited','carried']);
  await expect.poll(()=>marks('after'),{message:'After step dots'}).toEqual(['','edited','','edited','carried']);
  await stepButtons(host,'before').filter({hasText:/^3$/}).click();
  await expect(currentStep(host,'before')).toHaveText('3');
  await expect(currentStep(host,'after'),'Before step 3 pairs with After step 4').toHaveText('4');
  await expect(side(host,'before').locator('.compare-focus-caption')).toHaveText('Three');
  await expect(side(host,'after').locator('.compare-focus-caption')).toHaveText(v.edited);
  await expect.poll(()=>rowTitles(host)).toEqual(['g']);
  await expect(rows(host).first().locator('.compare-focus-chip')).toHaveText(['value 5 → 7']);
  await stepButtons(host,'after').filter({hasText:/^2$/}).click();
  await expect(currentStep(host,'after')).toHaveText('2');
  await expect(side(host,'after').locator('.compare-focus-caption')).toHaveText('Inserted');
  await expect(currentStep(host,'before'),'the inserted step has no Before step').toHaveCount(0);
  await expect(side(host,'before').locator('.compare-focus-missing')).toHaveText('Step not in the current document');
  await stepButtons(host,'after').filter({hasText:/^5$/}).click();
  await expect(currentStep(host,'before'),'After step 5 pairs with Before step 4').toHaveText('4');
  for(const s of ['before','after'])await expect(side(host,s).locator('.compare-focus-caption')).toHaveText('Four');
  await expect(rows(host).first().locator('.compare-focus-note')).toHaveText('Gauge differs from step 4 through step 5');
});

test('F9b imported nodes, edges and added nodes show the cropped panes; a section change falls back to the full panes',async({page,server})=>{
  const spec=(id,d)=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},sections:[{id:'main',heading:'Main',diagram:d}]}});
  const provider=spec('provider',{nodes:{p1:{title:'Provider one'},p2:{title:'Provider two'}},rows:[['p1','p2']],edges:[{from:'p1',to:'p2'}],
    topologyExports:{public:{nodes:['p1','p2'],edges:['p1->p2']}}});
  const provider2=plain(provider);provider2.page.sections[0].diagram.nodes.p2.title='Provider two changed';
  const consumer=spec('consumer',{nodes:{a:{title:'Anchor'},b:{title:'Bee'}},rows:[['a','b']],edges:[{from:'a',to:'b',label:'old'}],
    topologyImports:[{spec:'provider',export:'public',as:'child'}]});
  const consumer2=plain(consumer),d=consumer2.page.sections[0].diagram;
  consumer2.page.sections[0].heading='Main renamed';d.edges[0].label='new';d.nodes.c={title:'Sea'};d.rows=[['a','b','c']];
  const script=`function side(c,p){var raw=JSON.parse(JSON.stringify(c));return {authored:FlowviewCompare.normalize(JSON.parse(JSON.stringify(c))),resolved:FlowviewCompare.normalize(FlowviewCompare.resolve(raw,{version:1,id:'consumer',specs:[p,c]})),ledger:null};}
  var A=side(${inline(consumer)},${inline(provider)}),B=side(${inline(consumer2)},${inline(provider2)}),entries=FlowviewCompare.compare(A,B);
  window.cv=FlowviewCompare.mount(document.getElementById('compare-host'),{before:A.resolved,after:B.resolved,entries:entries});`;
  /* The injected viewer page holds a plain document; the fixture script mounts the resolved consumer pair. */
  const host=await mountPage(page,server,'focus-fallback-'+Date.now(),doorbell().current,null,null,script);
  const labels=await items(host).allInnerTexts();
  for(const want of [/^Modified · Section Main renamed/,/^Added · Node Sea$/,/^Modified · Connection .* · label$/,/^Modified · Imported node child::p2 · title$/])
    expect(labels.some(l=>want.test(l)),'precondition: the rail lists '+want+' in '+JSON.stringify(labels)).toBe(true);
  for(let i=0;i<labels.length;i++){
    await items(host).nth(i).click();await expect(items(host).nth(i)).toHaveAttribute('aria-current','true');
    await expect(host.getByRole('button',{name:'Focused',exact:true}),labels[i]).toHaveAttribute('aria-pressed','true');
    await expect(host.locator('.compare-focus'),labels[i]+': no focused rows').toBeHidden();
    if(/^Modified · Section /.test(labels[i])){
      await expect(host.locator('.compare-mode-note'),labels[i]).toHaveText('This change shows in the full diagram.');
      await expect(modeBar(host).getByRole('button',{name:'Whole section',exact:true}),labels[i]+': no crop controls').toBeHidden();
    }else{
      await expect(host.locator('.compare-mode-note'),labels[i]+': no fallback note').toBeHidden();
      await expect(modeBar(host).getByRole('button',{name:'Whole section',exact:true}),labels[i]+': crop controls').toBeVisible();
    }
    await expect(host.locator('.compare-pane[data-side="after"] [data-dv-node="a"]:visible').first(),labels[i]+': the After pane is shown').toBeVisible();
    await expect(host.locator('.compare-pane[data-side="before"] [data-dv-node="a"]:visible').first(),labels[i]+': the Before pane is shown').toBeVisible();
  }
  const imported=labels.findIndex(l=>/Imported node child::p2/.test(l));
  await items(host).nth(imported).click();
  await expect(host.locator('.compare-pane[data-side="after"] [data-dv-node="child::p2"]:visible').first()).toContainText('Provider two changed');
});

/* ---------- PR 3: node and connection crop ---------- */
/* One row of twelve nodes n0..n11 joined in a chain: n6's direct neighbours are n5 and n7; n0 and
   n11 are far from it. */
function chain(prefix,titles){
  const ids=Array.from({length:12},(_,i)=>prefix+i);
  return {nodes:Object.fromEntries(ids.map(id=>[id,{title:(titles||'Node ')+id}])),rows:[ids],edges:ids.slice(1).map((id,i)=>({from:ids[i],to:id,label:'hop '+i}))};
}
/* Whether the largest visible copy of a node in the first section lies inside the pane's visible area. */
async function shown(host,s,id){
  return host.locator('.compare-pane[data-side="'+s+'"]').evaluate((pane,id)=>{
    const box=pane.querySelector('.compare-pane-scroll').getBoundingClientRect();let best=null,area=0;
    pane.querySelectorAll('[data-dv-section="0"] [data-dv-node]').forEach(n=>{if(n.getAttribute('data-dv-node')!==id)return;const r=n.getBoundingClientRect();if(r.width*r.height>area && getComputedStyle(n).visibility!=='hidden'){best=r;area=r.width*r.height;}});
    return !!best && best.left>=box.left-1 && best.right<=box.right+1 && best.top>=box.top-1 && best.bottom<=box.bottom+1;
  },id);
}
async function shownCount(host,s,ids){let n=0;for(const id of ids)if(await shown(host,s,id))n++;return n;}
async function cropped(host,s,inside,outside){
  for(const id of inside)await expect.poll(()=>shown(host,s,id),{message:s+' pane shows '+id}).toBe(true);
  for(const id of outside)await expect.poll(()=>shown(host,s,id),{message:s+' pane leaves '+id+' outside the crop'}).toBe(false);
}
const IDS=Array.from({length:12},(_,i)=>'n'+i);
/* Rendered width of the largest copy of a node in the first section of a pane. */
async function width(host,s,id){
  return host.locator('.compare-pane[data-side="'+s+'"]').evaluate((pane,id)=>{let w=0;pane.querySelectorAll('[data-dv-section="0"] [data-dv-node]').forEach(n=>{if(n.getAttribute('data-dv-node')===id)w=Math.max(w,n.getBoundingClientRect().width);});return w;},id);
}
const outlined=(host,s,attr,key)=>host.locator('.compare-pane[data-side="'+s+'"] [data-dv-section="0"] ['+attr+'="'+key+'"][data-agent-change]');
/* The shared crop check. cfg: {inside:{before,after}, far:[ids], all:[ids], changed:{before,after} as
   [attr,key,status] or null, neighbour:[attr,key], ref: an unchanged node shown in both panes, ends:[ids]}. */
async function exerciseCrop(host,cfg){
  await expect(host.locator('.compare-mode-note'),'no fallback note').toBeHidden();
  for(const s of ['before','after'])await cropped(host,s,cfg.inside[s],cfg.far);
  for(const s of ['before','after']){
    const c=cfg.changed[s];
    if(c)await expect(outlined(host,s,c[0],c[1]).first(),s+': the changed object is outlined').toHaveAttribute('data-agent-change',c[2]);
    await expect(outlined(host,s,cfg.neighbour[0],cfg.neighbour[1]),s+': an unchanged neighbour is not outlined').toHaveCount(0);
  }
  const count={},w={};
  for(const s of ['before','after']){count[s]=await shownCount(host,s,cfg.all);w[s]=await width(host,s,cfg.ref);expect(w[s],'precondition: '+s+' shows the reference node').toBeGreaterThan(0);}
  await modeBar(host).getByRole('button',{name:'Zoom out',exact:true}).click();
  for(const s of ['before','after'])await expect.poll(()=>shownCount(host,s,cfg.all),{message:s+': Zoom out shows more nodes'}).toBeGreaterThan(count[s]);
  for(const s of ['before','after'])for(const id of cfg.keep[s])await expect.poll(()=>shown(host,s,id),{message:s+': still shows '+id}).toBe(true);
  const ratio={};
  for(const s of ['before','after']){await expect.poll(async()=>(await width(host,s,cfg.ref))/w[s],{message:s+': zoomed out by 1/1.6'}).toBeLessThan(.75);ratio[s]=(await width(host,s,cfg.ref))/w[s];}
  expect(ratio.before,'both panes zoom out by the same factor '+JSON.stringify(ratio)).toBeGreaterThan(.5);
  expect(Math.abs(ratio.before-ratio.after),'both panes zoom out by the same factor '+JSON.stringify(ratio)).toBeLessThan(.05);
  await modeBar(host).getByRole('button',{name:'Whole section',exact:true}).click();
  for(const s of ['before','after'])await cropped(host,s,Array.isArray(cfg.ends)?cfg.ends:cfg.ends[s],[]);
}
const provided=(c,c2)=>`function side(c,p){var raw=JSON.parse(JSON.stringify(c));return {authored:FlowviewCompare.normalize(JSON.parse(JSON.stringify(c))),resolved:FlowviewCompare.normalize(FlowviewCompare.resolve(raw,{version:1,id:'consumer',specs:[p,c]})),ledger:null};}
  var A=side(${inline(c.consumer)},${inline(c.provider)}),B=side(${inline(c.consumer)},${inline(c2)}),entries=FlowviewCompare.compare(A,B);
  window.cv=FlowviewCompare.mount(document.getElementById('compare-host'),{before:A.resolved,after:B.resolved,entries:entries});`;
function providerPair(){
  const spec=(id,d)=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},sections:[{id:'main',heading:'Main',diagram:d}]}});
  const c=chain('p','Provider ');
  const provider=spec('provider',Object.assign({},c,{topologyExports:{public:{nodes:Object.keys(c.nodes),edges:c.edges.map(e=>e.from+'->'+e.to)}}}));
  const consumer=spec('consumer',{nodes:{anchor:{title:'Anchor'}},rows:[['anchor']],topologyImports:[{spec:'provider',export:'public',as:'child'}]});
  return {provider,consumer};
}
const P=id=>'child::'+id,PIDS=Array.from({length:12},(_,i)=>P('p'+i));

test('C1 C5 a local node change crops both panes to the node and its neighbours; Zoom out and Whole section widen both alike; the next change crops again',async({page,server})=>{
  const mk=()=>({page:{title:'Chain',blocks:[{id:'c',heading:'Chain',diagram:chain('n')},{id:'d',heading:'Other',diagram:chain('n')}]}});
  const current=mk(),proposed=plain(current);proposed.page.blocks[0].diagram.nodes.n6.title='Node n6 renamed';proposed.page.blocks[1].diagram.nodes.n3.title='Other n3 renamed';
  const host=await mountPage(page,server,'crop-node-'+Date.now(),current,proposed);
  await expect(items(host)).toHaveText(['Modified · Node Node n6 renamed · title','Modified · Node Other n3 renamed · title']);
  await exerciseCrop(host,{inside:{before:['n5','n6','n7'],after:['n5','n6','n7']},far:['n0','n11'],all:IDS,
    changed:{before:['data-dv-node','n6','modified'],after:['data-dv-node','n6','modified']},neighbour:['data-dv-node','n5'],ref:'n5',keep:{before:['n6'],after:['n6']},ends:['n0','n11']});
  /* C5: the next node change crops again */
  await page.keyboard.press('j');await expect(items(host).nth(1)).toHaveAttribute('aria-current','true');
  for(const s of ['before','after']){
    await expect.poll(()=>host.locator('.compare-pane[data-side="'+s+'"]').evaluate(pane=>{
      const box=pane.querySelector('.compare-pane-scroll').getBoundingClientRect(),sec=pane.querySelector('[data-dv-section="1"]');if(!sec)return 'no section';
      const at=id=>{let best=null,a=0;sec.querySelectorAll('[data-dv-node="'+id+'"]').forEach(n=>{const r=n.getBoundingClientRect();if(r.width*r.height>a){best=r;a=r.width*r.height;}});return !!best && best.left>=box.left-1 && best.right<=box.right+1 && best.top>=box.top-1 && best.bottom<=box.bottom+1;};
      return [at('n2'),at('n3'),at('n4'),at('n11')].join(',');
    }),{message:s+': the Other section is cropped to n3 and its neighbours'}).toBe('true,true,true,false');
  }
});

test('C2 an imported node changed by its provider crops both panes like a local node',async({page,server})=>{
  const pair=providerPair(),p2=plain(pair.provider);p2.page.sections[0].diagram.nodes.p6.title='Provider p6 changed';
  const host=await mountPage(page,server,'crop-imported-'+Date.now(),doorbell().current,null,null,provided(pair,p2));
  await expect(items(host)).toHaveText(['Modified · Imported node child::p6 · title']);
  await exerciseCrop(host,{inside:{before:[P('p5'),P('p6'),P('p7')],after:[P('p5'),P('p6'),P('p7')]},far:[P('p0'),P('p11')],all:PIDS,
    changed:{before:['data-dv-node',P('p6'),'modified'],after:['data-dv-node',P('p6'),'modified']},neighbour:['data-dv-node',P('p5')],ref:P('p5'),keep:{before:[P('p6')],after:[P('p6')]},ends:[P('p0'),P('p11')]});
});

test('C2b an imported connection changed by its provider crops both panes to its endpoints and their neighbours',async({page,server})=>{
  const pair=providerPair(),p2=plain(pair.provider);p2.page.sections[0].diagram.edges[5].label='hop five changed';/* p5 -> p6 */
  const host=await mountPage(page,server,'crop-imported-edge-'+Date.now(),doorbell().current,null,null,provided(pair,p2));
  const labels=await items(host).allInnerTexts();
  expect(labels.length,'precondition: one change '+JSON.stringify(labels)).toBe(1);expect(labels[0]).toMatch(/^Modified · Imported connection /);
  /* Each side's connection is found by its own label text, independently of the change outline. */
  const keyOf=(s,label)=>host.locator('.compare-pane[data-side="'+s+'"] [data-dv-section="0"]').first().evaluate((sec,label)=>{
    const hit=[...sec.querySelectorAll('[data-dv-edge]')].find(n=>n.textContent.trim()===label);return hit?hit.getAttribute('data-dv-edge'):null;},label);
  await expect.poll(()=>keyOf('before','hop 5'),{message:'precondition: Before labels the connection "hop 5"'}).not.toBeNull();
  await expect.poll(()=>keyOf('after','hop five changed'),{message:'precondition: After labels the connection "hop five changed"'}).not.toBeNull();
  const keyB=await keyOf('before','hop 5'),keyA=await keyOf('after','hop five changed');
  await exerciseCrop(host,{inside:{before:[P('p4'),P('p5'),P('p6'),P('p7')],after:[P('p4'),P('p5'),P('p6'),P('p7')]},far:[P('p0'),P('p11')],all:PIDS,
    changed:{before:['data-dv-edge',keyB,'modified'],after:['data-dv-edge',keyA,'modified']},neighbour:['data-dv-node',P('p5')],ref:P('p5'),keep:{before:[P('p5'),P('p6')],after:[P('p5'),P('p6')]},ends:[P('p0'),P('p11')]});
});

test('C3 a local connection change crops both panes to its endpoints and their neighbours',async({page,server})=>{
  const current={page:{title:'Chain',blocks:[{id:'c',heading:'Chain',diagram:chain('n')}]}},proposed=plain(current);
  proposed.page.blocks[0].diagram.edges[5].label='hop five renamed';/* n5 -> n6 */
  const host=await mountPage(page,server,'crop-edge-'+Date.now(),current,proposed);
  await expect(items(host)).toHaveText([/^Modified · Connection n5 → n6 · label$/]);
  await exerciseCrop(host,{inside:{before:['n4','n5','n6','n7'],after:['n4','n5','n6','n7']},far:['n0','n11'],all:IDS,
    changed:{before:['data-dv-edge','5','modified'],after:['data-dv-edge','5','modified']},neighbour:['data-dv-node','n5'],ref:'n5',keep:{before:['n5','n6'],after:['n5','n6']},ends:['n0','n11']});
});

test('C4 a removed node crops the Before pane to it and the After pane to its former neighbours',async({page,server})=>{
  const current={page:{title:'Chain',blocks:[{id:'c',heading:'Chain',diagram:chain('n')}]}},proposed=plain(current),d=proposed.page.blocks[0].diagram;
  delete d.nodes.n6;d.rows=[IDS.filter(id=>id!=='n6')];d.edges=d.edges.filter(e=>e.from!=='n6' && e.to!=='n6').concat([{from:'n5',to:'n7',label:'bypass'}]);
  const host=await mountPage(page,server,'crop-removed-'+Date.now(),current,proposed);
  const labels=await items(host).allInnerTexts(),i=labels.findIndex(l=>/^Removed · Node Node n6$/.test(l));
  expect(i,'precondition: the rail lists the removed node in '+JSON.stringify(labels)).toBeGreaterThanOrEqual(0);
  await items(host).nth(i).click();await expect(items(host).nth(i)).toHaveAttribute('aria-current','true');
  await exerciseCrop(host,{inside:{before:['n5','n6','n7'],after:['n5','n7']},far:['n0','n11'],all:IDS,
    changed:{before:['data-dv-node','n6','removed'],after:null},neighbour:['data-dv-node','n5'],ref:'n5',keep:{before:['n6'],after:['n5','n7']},ends:['n0','n11']});
});

test('C6 an added node crops the After pane to it and the Before pane to its neighbour',async({page,server})=>{
  const current={page:{title:'Chain',blocks:[{id:'c',heading:'Chain',diagram:chain('n')}]}},proposed=plain(current),d=proposed.page.blocks[0].diagram;
  d.nodes.x={title:'Added x'};d.rows=[IDS.concat(['x'])];d.edges.push({from:'n11',to:'x',label:'new hop'});
  const host=await mountPage(page,server,'crop-added-'+Date.now(),current,proposed);
  const labels=await items(host).allInnerTexts(),i=labels.findIndex(l=>/^Added · Node Added x$/.test(l));
  expect(i,'precondition: the rail lists the added node in '+JSON.stringify(labels)).toBeGreaterThanOrEqual(0);
  await items(host).nth(i).click();await expect(items(host).nth(i)).toHaveAttribute('aria-current','true');
  await exerciseCrop(host,{inside:{before:['n11'],after:['n11','x']},far:['n0','n1'],all:IDS.concat(['x']),
    changed:{before:null,after:['data-dv-node','x','added']},neighbour:['data-dv-node','n11'],ref:'n11',keep:{before:['n11'],after:['x']},ends:{before:['n0','n11'],after:['n0','x']}});
});

/* ---------- #892: line diff for the coverage ledger and page-level fields ---------- */
const LEDGER_BEFORE='# Coverage\n\nNode b is named API.\nPaths preserved.\nStep s3 confirms.\nEnd.';
const LEDGER_AFTER='# Coverage\n\nNode b is named Gateway.\nPaths preserved.\nStep s3 confirms the write.\nNew line.\nEnd.';
const ledgerScript=(current,proposed,ledgerA,ledgerB)=>`var a=FlowviewCompare.normalize(${inline(current)}),b=FlowviewCompare.normalize(${inline(proposed)});
  var entries=FlowviewCompare.compare({authored:a,resolved:a,ledger:${inline(ledgerA)}},{authored:b,resolved:b,ledger:${inline(ledgerB)}});
  window.cv=FlowviewCompare.mount(document.getElementById('compare-host'),{before:a,after:b,entries:entries});`;
const textBlocks=host=>host.locator('.compare-focus .compare-text-block');
const textSide=(block,s)=>block.locator('.compare-text-side[data-side="'+s+'"]');
async function selectItem(host,re){
  const labels=await items(host).allInnerTexts(),i=labels.findIndex(l=>re.test(l));
  expect(i,'precondition: the rail lists '+re+' in '+JSON.stringify(labels)).toBeGreaterThanOrEqual(0);
  await items(host).nth(i).click();await expect(items(host).nth(i)).toHaveAttribute('aria-current','true');
}
async function sideLines(block,s){
  return textSide(block,s).locator('.compare-text-line').evaluateAll(list=>list.map(l=>{
    const n=l.querySelector('.compare-text-num');return (n?n.textContent+' ':'')+l.querySelector('.compare-text-body').textContent;}));
}

test('T1 a modified coverage ledger shows only its changed lines, Before left and After right, with marked words',async({page,server})=>{
  const {current}=doorbell();
  const host=await mountPage(page,server,'ledger-diff-'+Date.now(),current,current,null,ledgerScript(current,current,LEDGER_BEFORE,LEDGER_AFTER));
  await selectItem(host,/^Modified · Coverage ledger$/);
  await expect(modeBar(host).getByRole('button',{name:'Focused',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(host.locator('.compare-focus')).toBeVisible();await noGraphVisible(host);
  const blocks=textBlocks(host);await expect(blocks).toHaveCount(2);
  await expect(blocks.locator('.compare-text-title')).toHaveText(['Before line 3 · After line 3','Before line 5 · After lines 5-6']);
  expect(await sideLines(blocks.nth(0),'before')).toEqual(['3 Node b is named API.']);
  expect(await sideLines(blocks.nth(0),'after')).toEqual(['3 Node b is named Gateway.']);
  expect(await sideLines(blocks.nth(1),'before')).toEqual(['5 Step s3 confirms.']);
  expect(await sideLines(blocks.nth(1),'after')).toEqual(['5 Step s3 confirms the write.','6 New line.']);
  await expect(textSide(blocks.nth(0),'before').locator('del')).toHaveText(['API.']);
  await expect(textSide(blocks.nth(0),'after').locator('ins')).toHaveText(['Gateway.']);
  await expect(textSide(blocks.nth(1),'before').locator('del')).toHaveText(['confirms.']);
  await expect(textSide(blocks.nth(1),'after').locator('ins')).toHaveText(['confirms the write.','New line.']);
  for(const b of [0,1]){
    await expect(textSide(blocks.nth(b),'before').locator('ins'),'no added words on the Before side').toHaveCount(0);
    await expect(textSide(blocks.nth(b),'after').locator('del'),'no removed words on the After side').toHaveCount(0);
  }
  await expect(host.locator('.compare-focus .compare-text')).not.toContainText('Paths preserved.');
  await expect(host.locator('.compare-focus .compare-text')).not.toContainText('# Coverage');
});

test('T2 a changed page title and an added page description show their Before and After values',async({page,server})=>{
  const {current}=doorbell(),proposed=plain(current);proposed.page.title='Doorbell v2';proposed.page.description='Ring flow for the front door';
  const host=await mountPage(page,server,'title-diff-'+Date.now(),current,proposed);
  await selectItem(host,/^Modified · Document · title, description$/);
  await expect(host.locator('.compare-focus')).toBeVisible();await noGraphVisible(host);
  const blocks=textBlocks(host);await expect(blocks).toHaveCount(2);
  await expect(blocks.locator('.compare-text-title')).toHaveText(['title','description']);
  expect(await sideLines(blocks.nth(0),'before')).toEqual(['Doorbell']);
  expect(await sideLines(blocks.nth(0),'after')).toEqual(['Doorbell v2']);
  await expect(textSide(blocks.nth(0),'after').locator('ins')).toHaveText(['v2']);
  await expect(textSide(blocks.nth(1),'before').locator('.compare-text-missing')).toHaveText('Not set');
  await expect(textSide(blocks.nth(1),'before').locator('.compare-text-line')).toHaveCount(0);
  expect(await sideLines(blocks.nth(1),'after')).toEqual(['Ring flow for the front door']);
  await expect(textSide(blocks.nth(1),'after').locator('ins')).toHaveText(['Ring flow for the front door']);
  await expect(blocks.locator('del')).toHaveCount(0);
  await expect(blocks.locator('.compare-text-num'),'page fields have no line numbers').toHaveCount(0);
});

test('T3 a ledger only on one side lists its lines as added or removed beside "No coverage ledger"',async({page,server})=>{
  const {current}=doorbell();
  const host=await mountPage(page,server,'ledger-added-'+Date.now(),current,current,null,ledgerScript(current,current,null,'First line\nSecond line'));
  await selectItem(host,/^Added · Coverage ledger$/);
  const blocks=textBlocks(host);await expect(blocks).toHaveCount(1);
  await expect(blocks.locator('.compare-text-title')).toHaveText(['Before no ledger · After lines 1-2']);
  await expect(textSide(blocks.nth(0),'before').locator('.compare-text-missing')).toHaveText('No coverage ledger');
  await expect(textSide(blocks.nth(0),'before').locator('.compare-text-line')).toHaveCount(0);
  expect(await sideLines(blocks.nth(0),'after')).toEqual(['1 First line','2 Second line']);
  await expect(textSide(blocks.nth(0),'after').locator('ins')).toHaveText(['First line','Second line']);
  const gone=await mountPage(page,server,'ledger-removed-'+Date.now(),current,current,null,ledgerScript(current,current,'Old one\nOld two',null));
  await selectItem(gone,/^Removed · Coverage ledger$/);
  const removed=textBlocks(gone);await expect(removed).toHaveCount(1);
  await expect(removed.locator('.compare-text-title')).toHaveText(['Before lines 1-2 · After no ledger']);
  await expect(textSide(removed.nth(0),'after').locator('.compare-text-missing')).toHaveText('No coverage ledger');
  await expect(textSide(removed.nth(0),'after').locator('.compare-text-line')).toHaveCount(0);
  expect(await sideLines(removed.nth(0),'before')).toEqual(['1 Old one','2 Old two']);
  await expect(textSide(removed.nth(0),'before').locator('del')).toHaveText(['Old one','Old two']);
  await expect(removed.locator('ins')).toHaveCount(0);
});

test('T4 Full diagram hides the line diff and shows both panes; Focused shows it again',async({page,server})=>{
  const {current}=doorbell();
  const host=await mountPage(page,server,'ledger-full-'+Date.now(),current,current,null,ledgerScript(current,current,LEDGER_BEFORE,LEDGER_AFTER));
  await selectItem(host,/^Modified · Coverage ledger$/);
  await expect(textBlocks(host)).toHaveCount(2);await expect(textBlocks(host).first()).toBeVisible();
  await modeBar(host).getByRole('button',{name:'Full diagram',exact:true}).click();
  await expect(host.locator('.compare-focus')).toBeHidden();
  for(const s of ['before','after'])await expect(host.locator('.compare-pane[data-side="'+s+'"] [data-dv-node="bell"]:visible').first()).toBeVisible();
  await modeBar(host).getByRole('button',{name:'Focused',exact:true}).click();
  await expect(textBlocks(host).first()).toBeVisible();await noGraphVisible(host);
});

test('T5 markup in a ledger line and in the page title stays literal text',async({page,server})=>{
  const {current}=doorbell(),proposed=plain(current),evil='<img src=x onerror="window.pwned=1"><b>bold</b>';proposed.page.title='Doorbell '+evil;
  const host=await mountPage(page,server,'text-untrusted-'+Date.now(),current,proposed,null,ledgerScript(current,proposed,'Safe line','Safe line\n'+evil));
  await selectItem(host,/^Modified · Document · title$/);
  expect(await sideLines(textBlocks(host).nth(0),'after')).toEqual(['Doorbell '+evil]);
  await expect(host.locator('.compare-focus img, .compare-focus b')).toHaveCount(0);
  await selectItem(host,/^Modified · Coverage ledger$/);
  expect(await sideLines(textBlocks(host).nth(0),'after')).toEqual(['2 '+evil]);
  await expect(host.locator('.compare-focus img, .compare-focus b')).toHaveCount(0);
  expect(await page.evaluate(()=>window.pwned)).toBeUndefined();
});

test('T6 the view opens on the first diagram change when page-field changes are listed before it',async({page,server})=>{
  const {current,proposed}=doorbell();proposed.page.title='Doorbell v2';
  const host=await mountPage(page,server,'open-diagram-'+Date.now(),current,proposed);
  const labels=await items(host).allInnerTexts();
  expect(labels[0],'precondition: the title change is listed first').toBe('Modified · Document · title');
  const step=labels.findIndex(l=>/^Modified · Step s6 · /.test(l));
  expect(step,'precondition: the rail lists the step 6 change in '+JSON.stringify(labels)).toBeGreaterThan(0);
  await expect(items(host).nth(step)).toHaveAttribute('aria-current','true');
  await expect(items(host).nth(0)).toHaveAttribute('aria-current','false');
  await expect(textBlocks(host)).toHaveCount(0);
  await expect(rows(host).first()).toBeVisible();
  const only=await mountPage(page,server,'open-ledger-'+Date.now(),current,current,null,ledgerScript(current,current,LEDGER_BEFORE,LEDGER_AFTER));
  await expect(items(only)).toHaveText(['Modified · Coverage ledger']);
  await expect(items(only).nth(0)).toHaveAttribute('aria-current','true');
  await expect(textBlocks(only)).toHaveCount(2);
});

test('T7 whitespace-only ledger edits keep their exact text and are marked',async({page,server})=>{
  const {current}=doorbell();
  const host=await mountPage(page,server,'ledger-space-'+Date.now(),current,current,null,
    ledgerScript(current,current,'# Coverage\n  - item one\nkeep\na  b','# Coverage\n    - item one\nkeep\na b'));
  await selectItem(host,/^Modified · Coverage ledger$/);
  const blocks=textBlocks(host);await expect(blocks).toHaveCount(2);
  const exact=(block,s)=>textSide(block,s).evaluate(col=>({
    lines:[...col.querySelectorAll('.compare-text-body')].map(b=>b.textContent),
    marks:[...col.querySelectorAll('del, ins')].map(m=>m.tagName.toLowerCase()+':'+JSON.stringify(m.textContent))}));
  expect(await exact(blocks.nth(0),'before')).toEqual({lines:['  - item one'],marks:['del:"  "']});
  expect(await exact(blocks.nth(0),'after')).toEqual({lines:['    - item one'],marks:['ins:"    "']});
  expect(await exact(blocks.nth(1),'before')).toEqual({lines:['a  b'],marks:['del:"  "']});
  expect(await exact(blocks.nth(1),'after')).toEqual({lines:['a b'],marks:['ins:" "']});
});

/* ---------- #893: diagram-only step edits and path edits ---------- */
const paneCaption=(host,s)=>host.locator('.compare-pane[data-side="'+s+'"] .stepline:not(.dv-caption-old)').first();
const markedSteps=(host,s)=>stepButtons(host,s).evaluateAll(list=>list.filter(b=>b.getAttribute('data-step-mark')).map(b=>b.textContent+':'+b.getAttribute('data-step-mark')));
async function panesShown(host,label){
  for(const s of ['before','after'])
    await expect(host.locator('.compare-pane[data-side="'+s+'"] [data-dv-node="bell"]:visible').first(),label+': the '+s+' pane is shown').toBeVisible();
}
async function stripsAbovePanes(host,label){
  for(const s of ['before','after']){
    const strip=side(host,s).locator('.compare-focus-steps');
    await expect(strip,label+': '+s+' strip visible').toBeVisible();
    await expect.poll(async()=>{const a=await strip.boundingBox(),b=await host.locator('.compare-pane[data-side="'+s+'"]').boundingBox();
      return !!(a && b && a.y+a.height<=b.y+1);},{message:label+': '+s+' strip ends above its pane'}).toBe(true);
  }
}
function withPaths(){
  /* No panels: the path fixtures isolate step-strip marks from carried panel differences. */
  const {current}=doorbell(),d=current.page.blocks[0].diagram;delete d.panels;d.steps.forEach(st=>{delete st.panels;});
  d.paths=[{id:'main',steps:d.steps.map(x=>x.id)},{id:'alt',label:'Short ring',steps:['s1','s2','s3','s4','s9','s10']}];
  return current;
}

test('D1 D2 a diagram-only step edit keeps both panes on the step under each side\'s step strip',async({page,server})=>{
  const {current}=doorbell(),proposed=plain(current);proposed.page.blocks[0].diagram.steps[2].nodes=['hub'];
  const host=await mountPage(page,server,'step-diagram-'+Date.now(),current,proposed);
  await expect(items(host)).toHaveText(['Modified · Step s3 · nodes · affects step 3']);
  await items(host).nth(0).click();await expect(items(host).nth(0)).toHaveAttribute('aria-current','true');
  await expect(modeBar(host).getByRole('button',{name:'Focused',exact:true})).toHaveAttribute('aria-pressed','true');
  for(const s of ['before','after']){
    await expect(stepButtons(host,s)).toHaveCount(12);
    await expect(currentStep(host,s),s+' strip on step 3').toHaveText('3');
    expect(await markedSteps(host,s),s+' marks').toEqual(['3:edited']);
  }
  await panesShown(host,'D1');
  for(const s of ['before','after'])await expect(paneCaption(host,s)).toContainText('Mailbox flag rises');
  await expect(host.locator('.compare-pane[data-side="after"] [data-dv-node="hub"]:visible').first(),'the After pane highlights hub at step 3').toHaveClass(/\blit\b/);
  await expect(host.locator('.compare-pane[data-side="before"] [data-dv-node="app"]:visible').first(),'the Before pane highlights app at step 3').toHaveClass(/\blit\b/);
  await expect(rows(host)).toHaveCount(0);
  await expect(host.locator('.compare-focus-other')).toHaveCount(0);
  await expect(host.locator('.compare-mode-note')).toBeHidden();
  await stripsAbovePanes(host,'D1');
  await modeBar(host).getByRole('button',{name:'Full diagram',exact:true}).click();
  await expect(host.locator('.compare-focus-steps')).toHaveCount(2);
  for(const s of ['before','after'])await expect(side(host,s).locator('.compare-focus-steps'),s+' strip hidden in Full').toBeHidden();
  await panesShown(host,'D1 Full');
  await modeBar(host).getByRole('button',{name:'Focused',exact:true}).click();
  await stripsAbovePanes(host,'D1 Focused again');
  await stepButtons(host,'after').filter({hasText:/^4$/}).click();
  for(const s of ['before','after']){
    await expect(currentStep(host,s),s+' strip follows to step 4').toHaveText('4');
    await expect(paneCaption(host,s),s+' pane follows to step 4').toContainText('Hub checks the camera');
  }
  await panesShown(host,'D2');
});

test('D3 a path whose members change shows that path on the affected step in both panes',async({page,server})=>{
  const current=withPaths(),proposed=plain(current);proposed.page.blocks[0].diagram.paths[1].steps=['s1','s2','s3','s4','s5','s10'];
  const host=await mountPage(page,server,'path-steps-'+Date.now(),current,proposed);
  await expect(items(host)).toHaveText(['Modified · Path Short ring · steps · affects step 5']);
  await items(host).nth(0).click();await expect(items(host).nth(0)).toHaveAttribute('aria-current','true');
  for(const s of ['before','after']){
    await expect(stepButtons(host,s),s+' strip shows the 6-step path').toHaveCount(6);
    await expect(currentStep(host,s),s+' strip on step 5').toHaveText('5');
    expect(await markedSteps(host,s),s+' marks').toEqual(['5:edited']);
  }
  await panesShown(host,'D3');
  await expect(paneCaption(host,'after')).toContainText('Push is delivered');
  await expect(paneCaption(host,'before')).toContainText('Stream ends');
});

test('D4 a path label edit shows that path from step 1 with no affected steps',async({page,server})=>{
  const current=withPaths(),proposed=plain(current);proposed.page.blocks[0].diagram.paths[1].label='Quick ring';
  const host=await mountPage(page,server,'path-label-'+Date.now(),current,proposed);
  await expect(items(host)).toHaveText(['Modified · Path Quick ring · label']);
  await items(host).nth(0).click();await expect(items(host).nth(0)).toHaveAttribute('aria-current','true');
  for(const s of ['before','after']){
    await expect(stepButtons(host,s),s+' strip shows the 6-step path').toHaveCount(6);
    await expect(currentStep(host,s),s+' strip on step 1').toHaveText('1');
    expect(await markedSteps(host,s),s+' marks').toEqual([]);
  }
  await panesShown(host,'D4');
  for(const s of ['before','after'])await expect(paneCaption(host,s)).toContainText('Resident presses the doorbell');
});

test('D1b a tone edit names every step it carries into and marks them',async({page,server})=>{
  const {current}=doorbell(),proposed=plain(current);proposed.page.blocks[0].diagram.steps[1].tone={hub:'warn'};
  const host=await mountPage(page,server,'step-tone-'+Date.now(),current,proposed);
  await expect(items(host)).toHaveText(['Modified · Step s2 · tone.hub · affects steps 2-12']);
  await items(host).nth(0).click();
  const want=['2:edited'].concat([3,4,5,6,7,8,9,10,11,12].map(n=>n+':carried'));
  for(const s of ['before','after']){
    await expect(currentStep(host,s),s+' strip on step 2').toHaveText('2');
    await expect.poll(()=>markedSteps(host,s),{message:s+' marks'}).toEqual(want);
  }
  await stripsAbovePanes(host,'D1b');await panesShown(host,'D1b');
});

test('D3b a path whose members change at several positions lists them and opens on the first',async({page,server})=>{
  const current=withPaths(),proposed=plain(current);proposed.page.blocks[0].diagram.paths[1].steps=['s1','s7','s3','s4','s5','s11'];
  const host=await mountPage(page,server,'path-list-'+Date.now(),current,proposed);
  await expect(items(host)).toHaveText(['Modified · Path Short ring · steps · affects steps 2, 5-6']);
  await items(host).nth(0).click();
  for(const s of ['before','after']){
    await expect(stepButtons(host,s)).toHaveCount(6);
    await expect(currentStep(host,s),s+' strip on step 2').toHaveText('2');
    expect(await markedSteps(host,s),s+' marks').toEqual(['2:edited','5:edited','6:edited']);
  }
  await expect(paneCaption(host,'after')).toContainText('Camera streams');
  await expect(paneCaption(host,'before')).toContainText('Hub wakes the radio');
  await stripsAbovePanes(host,'D3b');
});

test('D5 a step that now highlights an imported node shows it in both panes under the strips',async({page,server})=>{
  const spec=(id,d)=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},sections:[{id:'main',heading:'Main',diagram:d}]}});
  const provider=spec('provider',{nodes:{p1:{title:'Provider one'},p2:{title:'Provider two'}},rows:[['p1','p2']],edges:[{from:'p1',to:'p2'}],
    topologyExports:{public:{nodes:['p1','p2'],edges:['p1->p2']}}});
  const consumer=spec('consumer',{view:'step',autoplay:false,nodes:{a:{title:'Anchor'},b:{title:'Bee'}},rows:[['a','b']],edges:[{from:'a',to:'b'}],
    topologyImports:[{spec:'provider',export:'public',as:'child'}],
    steps:[{id:'one',nodes:['a'],text:'One'},{id:'two',nodes:['b'],text:'Two'},{id:'three',nodes:['a'],text:'Three'}]});
  const consumer2=plain(consumer);consumer2.page.sections[0].diagram.steps[1].nodes=['child::p1'];
  const script=`function side(c,p){var raw=JSON.parse(JSON.stringify(c));return {authored:FlowviewCompare.normalize(JSON.parse(JSON.stringify(c))),resolved:FlowviewCompare.normalize(FlowviewCompare.resolve(raw,{version:1,id:'consumer',specs:[p,c]})),ledger:null};}
  var A=side(${inline(consumer)},${inline(provider)}),B=side(${inline(consumer2)},${inline(provider)}),entries=FlowviewCompare.compare(A,B);
  window.cv=FlowviewCompare.mount(document.getElementById('compare-host'),{before:A.resolved,after:B.resolved,entries:entries});`;
  const host=await mountPage(page,server,'step-imported-'+Date.now(),doorbell().current,null,null,script);
  await expect(items(host)).toHaveText(['Modified · Step two · nodes · affects step 2']);
  await items(host).nth(0).click();
  for(const s of ['before','after']){
    await expect(currentStep(host,s),s+' strip on step 2').toHaveText('2');
    expect(await markedSteps(host,s),s+' marks').toEqual(['2:edited']);
    await expect(paneCaption(host,s)).toContainText('Two');
  }
  await expect(host.locator('.compare-pane[data-side="after"] [data-dv-node="child::p1"]:visible').first(),'the After pane highlights the imported node').toHaveClass(/\blit\b/);
  await expect(host.locator('.compare-pane[data-side="before"] [data-dv-node="b"]:visible').first(),'the Before pane highlights b').toHaveClass(/\blit\b/);
  await stripsAbovePanes(host,'D5');
});

test('D6 an added path keeps the full panes with the full-diagram note and no step strips',async({page,server})=>{
  const current=withPaths(),proposed=plain(current);proposed.page.blocks[0].diagram.paths.push({id:'third',label:'Third ring',steps:['s1','s12']});
  const host=await mountPage(page,server,'path-added-'+Date.now(),current,proposed);
  await expect(items(host)).toHaveText(['Added · Path Third ring']);
  await items(host).nth(0).click();await expect(items(host).nth(0)).toHaveAttribute('aria-current','true');
  await expect(host.locator('.compare-focus')).toBeHidden();
  await expect(host.locator('.compare-focus-steps:visible')).toHaveCount(0);
  await expect(host.locator('.compare-mode-note')).toHaveText('This change shows in the full diagram.');
  await panesShown(host,'D6');
});

/* Current-view navigation: Standard is explicitly authored, so a successful
   reveal cannot rely on the user opening Explore. Different extents exercise
   camera scale independently of the diagram's width. */
async function stableCamera(host){
  const samples=await host.evaluate(async root=>{
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const frames=[];
    for(let i=0;i<36;i++){
      await new Promise(requestAnimationFrame);
      frames.push([...root.querySelectorAll('.compare-pane')].map(p=>{
        const svg=[...p.querySelectorAll('svg[aria-label="flow diagram"]')].find(n=>n.getClientRects().length),r=svg.getBoundingClientRect();return [r.x,r.y,r.width,r.height];
      }).flat());
    }
    return frames;
  });
  for(let i=0;i<samples[0].length;i++)expect(Math.max(...samples.map(s=>s[i]))-Math.min(...samples.map(s=>s[i])),'camera stays stable across consecutive paints').toBeLessThan(1.1);
}
async function alignedLandmark(host,id,diagramSpace=false){
  const positions=await host.locator('.compare-pane').evaluateAll((panes,{id,diagramSpace})=>panes.map(p=>{
    const node=[...p.querySelectorAll('[data-dv-node]')].find(n=>n.getAttribute('data-dv-node')===id && n.getClientRects().length);
    const box=p.querySelector('.compare-pane-scroll').getBoundingClientRect();
    if(diagramSpace){
      const svg=node.ownerSVGElement,r=svg.getBoundingClientRect(),vb=svg.viewBox.baseVal,scale=r.width/vb.width;
      return {x:r.x-box.x-vb.x*scale,y:r.y-box.y-vb.y*scale,width:scale};
    }
    const r=node.getBoundingClientRect();return {x:r.x-box.x,y:r.y-box.y,width:r.width};
  }),{id,diagramSpace});
  return Math.max(...['x','y','width'].map(axis=>Math.abs(positions[0][axis]-positions[1][axis])));
}
for(const imported of [false,true])test('N1 '+(imported?'imported':'local')+' added node is revealed in Standard and manual zoom tracks both directions',async({page,server},testInfo)=>{
  await page.emulateMedia({reducedMotion:'no-preference'});
  const raw={page:{title:'Navigation',defaultView:'standard',views:[{id:'standard',name:'Standard',presentation:'standard',sections:['c']},{id:'explore',name:'Explore',presentation:'explore',sections:['c']}],sections:[{id:'c',heading:'Chain',diagram:chain('n')}]}},after=plain(raw);
  let script;
  if(imported){
    const pair=providerPair();pair.consumer.page.views=raw.page.views;pair.consumer.page.defaultView='standard';pair.consumer.page.sections[0].id='c';
    const provider2=plain(pair.provider),d=provider2.page.sections[0].diagram;
    d.nodes.x={title:'Added x'};d.rows[0].push('x');d.edges.push({from:'p11',to:'x'});d.topologyExports.public.nodes.push('x');d.topologyExports.public.edges.push('p11->x');
    script=provided(pair,provider2);
  }else{const d=after.page.sections[0].diagram;d.nodes.x={title:'Added x'};d.rows[0].push('x');d.edges.push({from:'n11',to:'x'});}
  const host=await mountPage(page,server,'navigation-'+imported+'-'+Date.now(),raw,after,null,script),id=imported?'child::x':'x';
  await expect(items(host).filter({hasText:imported?/^Added · Imported node child::x/:/^Added · Node Added x/})).toHaveAttribute('aria-current','true');
  await expect.poll(()=>shown(host,'after',id)).toBe(true);
  await selectItem(host,imported?/^Added · Imported node child::x/:/^Added · Node Added x/);
  await expect.poll(()=>shown(host,'after',id)).toBe(true);
  await expect(host.locator('.viewer-exploring')).toHaveCount(0);
  await expect.poll(()=>alignedLandmark(host,imported?'child::p11':'n11',true),{message:'selection aligns both diagrams before manual navigation'}).toBeLessThan(2);
  for(const compareMode of ['Full diagram','Focused']){
    await modeBar(host).getByRole('button',{name:compareMode,exact:true}).click();
    await selectItem(host,imported?/^Added · Imported node child::x/:/^Added · Node Added x/);
    await expect.poll(()=>host.locator('.compare-pane[data-side="after"]').evaluate((pane,id)=>{
      const node=[...pane.querySelectorAll('[data-dv-node]')].find(n=>n.getAttribute('data-dv-node')===id && n.getClientRects().length),r=node.getBoundingClientRect(),board=node.closest('.board'),b=board.getBoundingClientRect(),controls=board.querySelector(':scope > .lg');
      return r.top>=(controls?controls.getBoundingClientRect().bottom:b.top)-1 && r.bottom<=b.bottom+1 && r.left>=b.left-1 && r.right<=b.right+1;
    },id),{message:'added node is unobscured by the Standard board controls'}).toBe(true);
  }
  await testInfo.attach('standard-added-node',{body:await host.screenshot(),contentType:'image/png'});

  for(const mode of ['Standard','Explore']){
    if(mode==='Explore'){
      await host.locator('.compare-pane[data-side="before"] .reader-view-picker').selectOption({label:'Explore'});
      await expect(host.locator('.compare-pane[data-side="after"] .reader-view-picker')).toHaveValue('page:explore');
      await expect.poll(()=>shown(host,'after',id),{message:'switching to Explore opens a visible diagram'}).toBe(true);
      await selectItem(host,imported?/^Added · Imported node child::x/:/^Added · Node Added x/);
      await expect.poll(()=>shown(host,'after',id)).toBe(true);
    }
    const panes=['before','after'].map(side=>host.locator('.compare-pane[data-side="'+side+'"]'));
    for(const own of [0,1]){
      const summary=p=>p.locator('.reader-zoom-menu>summary').first();
      const old=await summary(panes[own]).innerText();
      const zoomButton=panes[own].getByRole('button',{name:/^(Zoom in|Canvas zoom in|Diagram zoom in)$/}).first();
      if(own===1)await zoomButton.press('Enter');else await zoomButton.click();
      await expect(summary(panes[own])).not.toHaveText(old);
      await expect.poll(()=>summary(panes[1-own]).innerText()).toBe(await summary(panes[own]).innerText());
      const ref=imported?'child::p11':'n11';
      await expect.poll(async()=>Math.abs((await width(host,'before',ref))-(await width(host,'after',ref)))).toBeLessThan(2);
      // Sample consecutive paints across the old 150 ms retry and 250 ms
      // remount windows; normal motion must not produce a late camera jump.
      await expect.poll(()=>alignedLandmark(host,ref,true),{message:'the same diagram coordinates occupy the same pane location'}).toBeLessThan(2);
      await stableCamera(host);
    }
    const ref=imported?'child::p11':'n11',position=side=>panes[side].locator('[data-dv-node="'+ref+'"]:visible').first().evaluate(n=>n.getBoundingClientRect().x);
    for(const own of [0,1]){
      const starts=await Promise.all([position(0),position(1)]);
      await panes[own].locator('.board:visible').first().hover();await page.mouse.wheel(-90,0);
      await expect.poll(async()=>Math.abs(await position(own)-starts[own])).toBeGreaterThan(20);
      await expect.poll(async()=>Math.abs((await position(0)-starts[0])-(await position(1)-starts[1]))).toBeLessThan(2);
      await expect.poll(()=>alignedLandmark(host,ref,true),{message:'panning preserves absolute diagram alignment'}).toBeLessThan(2);
    }
    if(mode==='Explore'){await expect.poll(()=>shown(host,'after',ref),{message:'linked camera keeps the changed area on screen'}).toBe(true);}
    await page.setViewportSize({width:1560,height:960});
    await expect.poll(()=>alignedLandmark(host,ref,true),{message:'resizing retains the same diagram location'}).toBeLessThan(2);
    await page.setViewportSize({width:1440,height:900});
    await expect.poll(()=>alignedLandmark(host,ref,true)).toBeLessThan(2);
    if(mode==='Explore')await testInfo.attach('explore-linked-zoom',{body:await host.screenshot(),contentType:'image/png'});
  }
});

test('N2 rapid selections and mode changes retire old framing before manual camera use on a multi-section document',async({page,server})=>{
  await page.emulateMedia({reducedMotion:'no-preference'});
  const current={page:{title:'Camera lifetime',sections:[{id:'c',heading:'Chain',diagram:chain('n')},{id:'other',heading:'Other',diagram:chain('p')}]}},proposed=plain(current);
  proposed.page.sections[0].diagram.nodes.n2.title='Changed two';proposed.page.sections[0].diagram.nodes.n9.title='Changed nine';
  const host=await mountPage(page,server,'camera-lifetime-'+Date.now(),current,proposed);
  await page.keyboard.press('j');await page.keyboard.press('k');await page.keyboard.press('j');
  await modeBar(host).getByRole('button',{name:'Full diagram',exact:true}).click();
  await modeBar(host).getByRole('button',{name:'Focused',exact:true}).click();
  await expect(items(host).nth(1)).toHaveAttribute('aria-current','true');
  const pane=host.locator('.compare-pane[data-side="before"]');
  await pane.getByRole('button',{name:'Zoom in',exact:true}).first().click();
  await stableCamera(host);
  await expect.poll(()=>shown(host,'after','n9')).toBe(true);
});

test('N3 a removed imported node reveals its former neighbours on the side without it',async({page,server})=>{
  const pair=providerPair(),p2=plain(pair.provider),d=p2.page.sections[0].diagram;
  delete d.nodes.p6;d.rows[0]=d.rows[0].filter(id=>id!=='p6');d.edges=d.edges.filter(e=>e.from!=='p6' && e.to!=='p6');
  d.topologyExports.public.nodes=d.topologyExports.public.nodes.filter(id=>id!=='p6');d.topologyExports.public.edges=d.edges.map(e=>e.from+'->'+e.to);
  const host=await mountPage(page,server,'removed-imported-'+Date.now(),doorbell().current,null,null,provided(pair,p2));
  await selectItem(host,/^Removed · Imported node child::p6/);
  await exerciseCrop(host,{inside:{before:[P('p5'),P('p6'),P('p7')],after:[P('p5'),P('p7')]},far:[P('p0'),P('p11')],all:PIDS,
    changed:{before:['data-dv-node',P('p6'),'removed'],after:null},neighbour:['data-dv-node',P('p5')],ref:P('p5'),keep:{before:[P('p6')],after:[P('p5'),P('p7')]},ends:[P('p0'),P('p11')]});
});

test('N4 background completion preserves both painted cameras without manual input',async({page,server})=>{
  await page.emulateMedia({reducedMotion:'no-preference'});
  const current={page:{title:'Background completion',sections:[{id:'c',heading:'Chain',diagram:chain('n')},{id:'second',heading:'Second',diagram:chain('p')},{id:'third',heading:'Third',diagram:chain('q')}]}},proposed=plain(current);
  proposed.page.sections[0].diagram.nodes.n6.title='Changed six';
  const script=`document.fonts.ready.then(function(){
    var a=FlowviewCompare.normalize(${inline(current)}),b=FlowviewCompare.normalize(${inline(proposed)}),entries=FlowviewCompare.compare({authored:a,resolved:a,ledger:null},{authored:b,resolved:b,ledger:null});
    window.cv=FlowviewCompare.mount(document.getElementById('compare-host'),{before:a,after:b,entries:entries});
    window.completionFrames=[];
    function sample(){
      var panes=Array.from(document.querySelectorAll('#compare-host .compare-pane'));
      window.completionFrames.push({beforeCount:panes[0].querySelectorAll('svg[aria-label="flow diagram"]').length,geometry:panes.map(function(p){var r=p.querySelector('[data-dv-node="n6"]').getBoundingClientRect();return [r.x,r.y,r.width,r.height];}).flat()});
      if(window.completionFrames.length<90)requestAnimationFrame(sample);
    }
    requestAnimationFrame(function(){requestAnimationFrame(sample);});
  });`;
  await mountPage(page,server,'background-camera-'+Date.now(),current,proposed,null,script);
  await expect.poll(()=>page.evaluate(()=>window.completionFrames && window.completionFrames.length)).toBe(90);
  const samples=await page.evaluate(()=>window.completionFrames);
  expect(samples.map(s=>s.beforeCount)).toContain(1);expect(samples.map(s=>s.beforeCount)).toContain(3);
  for(let i=0;i<8;i++)expect(Math.max(...samples.map(s=>s.geometry[i]))-Math.min(...samples.map(s=>s.geometry[i])),'background completion preserves each pane coordinate').toBeLessThan(1.1);
});

for(const imported of [false,true])test('N5 '+(imported?'imported':'local')+' document wheel and keyboard scrolling mirror the same location across reordered sections',async({page,server},testInfo)=>{
  const pair=providerPair(),current=plain(pair.consumer),proposed=plain(current);
  if(!imported){current.page.sections[0].diagram=chain('n');proposed.page.sections[0].diagram=chain('n');}
  const paragraphs=count=>Array.from({length:count},(_,i)=>'Context '+i+'. The section keeps enough prose to scroll independently of the diagram.');
  current.page.sections[0].text=paragraphs(18);proposed.page.sections[0].text=paragraphs(29);
  const extra=(id)=>({id,heading:id,text:paragraphs(8),diagram:chain(id)});
  current.page.sections.unshift(extra('earlier'));current.page.sections.push(extra('later'));
  proposed.page.sections.unshift(extra('later'),extra('inserted'));proposed.page.sections.push(extra('earlier'));
  const provider2=plain(pair.provider),ref=imported?'child::p6':'n6';
  if(imported)provider2.page.sections[0].diagram.nodes.p6.title='Changed six';else proposed.page.sections[2].diagram.nodes.n6.title='Changed six';
  const script=imported?`function side(c,p){return FlowviewCompare.normalize(FlowviewCompare.resolve(JSON.parse(JSON.stringify(c)),{version:1,id:'consumer',specs:[p,c]}));}
    var a=side(${inline(current)},${inline(pair.provider)}),b=side(${inline(proposed)},${inline(provider2)});
    var entries=FlowviewCompare.compare({authored:FlowviewCompare.normalize(${inline(current)}),resolved:a,ledger:null},{authored:FlowviewCompare.normalize(${inline(proposed)}),resolved:b,ledger:null});
    window.cv=FlowviewCompare.mount(document.getElementById('compare-host'),{before:a,after:b,entries:entries});`:null;
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const host=await mountPage(page,server,'scroll-navigation-'+imported+'-'+Date.now(),current,proposed,null,script);
  await selectItem(host,imported?/^Modified · Imported node child::p6/:/^Modified · Node Changed six/);
  // The first gesture also completes a still-partial Before render; section
  // matching must use identity, not the changed numeric index.
  for(const own of ['after','before']){
    const pane=host.locator('.compare-pane[data-side="'+own+'"] .compare-pane-scroll');
    const start=await pane.evaluate(n=>n.scrollTop),box=await pane.boundingBox();
    await page.mouse.move(box.x+3,box.y+box.height/2);await page.mouse.wheel(0,-160);
    await expect.poll(()=>pane.evaluate(n=>n.scrollTop)).toBeLessThan(start-100);
    await expect.poll(()=>alignedLandmark(host,ref),{message:'outer wheel scroll preserves matching diagram coordinates'}).toBeLessThan(2);
    await pane.focus();const at=await pane.evaluate(n=>n.scrollTop);await pane.press('ArrowDown');
    await expect.poll(()=>pane.evaluate(n=>n.scrollTop)).toBeGreaterThan(at+10);
    await expect.poll(()=>alignedLandmark(host,ref),{message:'keyboard document scroll mirrors in either direction'}).toBeLessThan(2);
    await stableCamera(host);
  }
  await testInfo.attach('linked-document-scroll-'+(imported?'imported':'local'),{body:await host.screenshot(),contentType:'image/png'});
  expect(errors).toEqual([]);
});


for(const imported of [false,true])test('N6 '+(imported?'imported':'local')+' Explore follows distant graph coordinates beyond either pane extent',async({page,server},testInfo)=>{
  const diagram=(after)=>({nodes:{common:{title:'Common'},[after?'added':'removed']:{title:after?'Distant added':'Distant removed'}},rows:[[]],edges:[],
    floats:[{id:'common',side:'below',x:200,y:100},{id:after?'added':'removed',side:'below',x:after?9000:-7000,y:after?6500:-5000}],
    graphFrame:after?{x:0,y:0,w:10000,h:7500}:{x:-7500,y:-5500,w:8500,h:6500}});
  const spec=d=>({page:{title:'Distant navigation',defaultView:'explore',views:[{id:'explore',name:'Explore',presentation:'explore',sections:['main']}],sections:[{id:'main',heading:'Main',diagram:d}]}});
  let current=spec(diagram(false)),proposed=spec(diagram(true)),script;
  if(imported){
    const pair=providerPair(),provider2=plain(pair.provider);
    for(const [provider,after] of [[pair.provider,false],[provider2,true]]){
      const d=diagram(after);d.topologyExports={public:{nodes:Object.keys(d.nodes),edges:[]}};provider.page.sections[0].diagram=d;
    }
    pair.consumer.page.views=current.page.views;pair.consumer.page.defaultView='explore';
    pair.consumer.page.sections[0].diagram.topologyImports[0].position={x:0,y:0};
    current=pair.consumer;proposed=plain(current);script=provided(pair,provider2);
  }
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const host=await mountPage(page,server,'distant-navigation-'+imported+'-'+Date.now(),current,proposed,null,script);
  const ref=imported?'child::common':'common',added=imported?'child::added':'added';
  await selectItem(host,imported?/^Added · Imported node child::added/:/^Added · Node Distant added/);
  await expect.poll(()=>shown(host,'after',added)).toBe(true);
  await expect.poll(()=>alignedLandmark(host,ref,true),{message:'initial distant crop aligns diagram coordinates'}).toBeLessThan(2);
  for(const [side,delta] of [['after',900],['before',-30000]]){
    const board=host.locator('.compare-pane[data-side="'+side+'"] .board:visible');
    await board.hover();const start=await board.evaluate(n=>({x:n.scrollLeft,y:n.scrollTop}));
    await page.mouse.wheel(delta,delta);
    await expect.poll(()=>board.evaluate((n,start)=>Math.max(Math.abs(n.scrollLeft-start.x),Math.abs(n.scrollTop-start.y)),start)).toBeGreaterThan(100);
    await expect.poll(()=>alignedLandmark(host,ref,true),{message:side+' pans beyond counterpart graph bounds'}).toBeLessThan(2);
    await page.keyboard.down('Control');await page.mouse.wheel(0,-250);await page.keyboard.up('Control');
    await expect.poll(()=>alignedLandmark(host,ref,true),{message:side+' zoom retains the distant graph location'}).toBeLessThan(2);
    await stableCamera(host);
  }
  await testInfo.attach('distant-linked-explore-'+(imported?'imported':'local'),{body:await host.screenshot(),contentType:'image/png'});
  expect(errors).toEqual([]);
});
