/* Focused compare view (issue #848, PR 2 of 3): one change at a time, Before left / After
   right, showing only what changed: each side's step controls at the change's step, then only
   the panels whose folded state differs there, with value labels, a carried-range note per
   panel, a caption word diff and step-strip markers. Contract: issue #848 "How it should look"
   and Test + flip rows 1, 2, 2b, 3; Chuck 2026-10-31 (Focused default + Full diagram toggle;
   EDIT-only list with markers on affected steps) and 2026-11-01 (coverage = this new spec + old
   tests updated in place + Node unit tests in tests/compare-focus.test.js; clicking a step on
   either side moves BOTH sides and redraws the rows; camera sync stays one-way). Desktop only.
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
                  node each show the cropped panes (Zoom out / Whole section, no note); a section
                  heading change still shows the full panes with the note       rejects: local-node-only crop
   --- PR 3 (node/edge crop; issue #848 rows 4 and 7a; Chuck 2026-10-31 crop + zoom out + whole
       section; 2026-11-01 coverage: extend this spec, F9/F9b updated in place) ---
   C1 node crop   a local node change frames, in BOTH panes, the changed node and its direct
                  neighbours inside the pane's visible area and leaves a far node of the same row
                  outside it; Zoom out shows more nodes in both panes; Whole section shows the far
                  nodes at both ends in both panes; the changed node carries the change outline in
                  both panes and its neighbours do not                         rejects: no crop; one pane; fixed zoom
   C2 imported    the same crop for an imported node changed by its provider (child::p6)
                                                                              rejects: local-only crop
   C3 connection  a connection change frames both endpoints and excludes the far nodes
                                                                              rejects: node-only crop
   C4 removed     a removed node: the Before pane frames the node and its neighbours; the After pane
                  (without the node) frames its former neighbours               rejects: blank or whole-section side
   C5 reset       selecting another node change after Whole section crops again (the zoom level
                  belongs to one selection)                                    rejects: sticky Whole section
   excluded       section heading / ledger / document text diffs (issue row 2b's ledger and heading
                  cases, row 7b): not in PR 2 per the issue's PR split; node/edge crop: PR 3 */
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
  await expect(host.getByRole('button',{name:'Zoom out',exact:true}).first()).toBeVisible();
  await expect(host.getByRole('button',{name:'Whole section',exact:true})).toBeVisible();
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
      await expect(host.getByRole('button',{name:'Whole section',exact:true}),labels[i]+': no crop controls').toBeHidden();
    }else{
      await expect(host.locator('.compare-mode-note'),labels[i]+': no fallback note').toBeHidden();
      await expect(host.getByRole('button',{name:'Whole section',exact:true}),labels[i]+': crop controls').toBeVisible();
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

test('C1 C5 a node change crops both panes to the node and its neighbours; Zoom out and Whole section widen both; the outline marks only the changed node',async({page,server})=>{
  const mk=()=>({page:{title:'Chain',blocks:[{id:'c',heading:'Chain',diagram:chain('n')},{id:'d',heading:'Other',diagram:chain('n')}]}});
  const current=mk(),proposed=plain(current);proposed.page.blocks[0].diagram.nodes.n6.title='Node n6 renamed';proposed.page.blocks[1].diagram.nodes.n3.title='Other n3 renamed';
  const host=await mountPage(page,server,'crop-node-'+Date.now(),current,proposed);
  await expect(items(host)).toHaveText(['Modified · Node Node n6 renamed · title','Modified · Node Other n3 renamed · title']);
  await expect(host.locator('.compare-mode-note')).toBeHidden();
  for(const s of ['before','after'])await cropped(host,s,['n5','n6','n7'],['n0','n11']);
  for(const s of ['before','after']){
    await expect(host.locator('.compare-pane[data-side="'+s+'"] [data-dv-section="0"] [data-dv-node="n6"][data-agent-change="modified"]').first(),s+': n6 outlined').toBeAttached();
    await expect(host.locator('.compare-pane[data-side="'+s+'"] [data-dv-section="0"] [data-dv-node="n5"][data-agent-change]'),s+': neighbour not outlined').toHaveCount(0);
  }
  const before={};for(const s of ['before','after'])before[s]=await shownCount(host,s,IDS);
  await host.getByRole('button',{name:'Zoom out',exact:true}).first().click();
  for(const s of ['before','after'])await expect.poll(()=>shownCount(host,s,IDS),{message:s+': Zoom out shows more nodes'}).toBeGreaterThan(before[s]);
  for(const s of ['before','after'])await expect.poll(()=>shown(host,s,'n6'),{message:s+': still shows n6'}).toBe(true);
  await host.getByRole('button',{name:'Whole section',exact:true}).click();
  for(const s of ['before','after'])await cropped(host,s,['n0','n6','n11'],[]);
  /* C5: the next node change crops again */
  await page.keyboard.press('j');await expect(items(host).nth(1)).toHaveAttribute('aria-current','true');
  for(const s of ['before','after']){
    await expect.poll(()=>host.locator('.compare-pane[data-side="'+s+'"]').evaluate(pane=>{
      const box=pane.querySelector('.compare-pane-scroll').getBoundingClientRect(),sec=pane.querySelector('[data-dv-section="1"]');if(!sec)return 'no section';
      const at=id=>{let best=null,a=0;sec.querySelectorAll('[data-dv-node="'+id+'"]').forEach(n=>{const r=n.getBoundingClientRect();if(r.width*r.height>a){best=r;a=r.width*r.height;}});return best && best.left>=box.left-1 && best.right<=box.right+1 && best.top>=box.top-1 && best.bottom<=box.bottom+1;};
      return [at('n2'),at('n3'),at('n4'),at('n11')].join(',');
    }),{message:s+': the Other section is cropped to n3 and its neighbours'}).toBe('true,true,true,false');
  }
});

test('C2 an imported node changed by its provider crops both panes to it and its neighbours',async({page,server})=>{
  const spec=(id,d)=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},sections:[{id:'main',heading:'Main',diagram:d}]}});
  const c=chain('p','Provider ');const provider=spec('provider',Object.assign({},c,{topologyExports:{public:{nodes:Object.keys(c.nodes),edges:c.edges.map(e=>e.from+'->'+e.to)}}}));
  const provider2=plain(provider);provider2.page.sections[0].diagram.nodes.p6.title='Provider p6 changed';
  const consumer=spec('consumer',{nodes:{anchor:{title:'Anchor'}},rows:[['anchor']],topologyImports:[{spec:'provider',export:'public',as:'child'}]});
  const script=`function side(c,p){var raw=JSON.parse(JSON.stringify(c));return {authored:FlowviewCompare.normalize(JSON.parse(JSON.stringify(c))),resolved:FlowviewCompare.normalize(FlowviewCompare.resolve(raw,{version:1,id:'consumer',specs:[p,c]})),ledger:null};}
  var A=side(${inline(consumer)},${inline(provider)}),B=side(${inline(consumer)},${inline(provider2)}),entries=FlowviewCompare.compare(A,B);
  window.cv=FlowviewCompare.mount(document.getElementById('compare-host'),{before:A.resolved,after:B.resolved,entries:entries});`;
  const host=await mountPage(page,server,'crop-imported-'+Date.now(),doorbell().current,null,null,script);
  await expect(items(host)).toHaveText(['Modified · Imported node child::p6 · title']);
  await expect(host.locator('.compare-mode-note')).toBeHidden();
  for(const s of ['before','after'])await cropped(host,s,['child::p5','child::p6','child::p7'],['child::p0','child::p11']);
  await host.getByRole('button',{name:'Whole section',exact:true}).click();
  for(const s of ['before','after'])await cropped(host,s,['child::p0','child::p11'],[]);
});

test('C3 a connection change crops both panes to its endpoints',async({page,server})=>{
  const current={page:{title:'Chain',blocks:[{id:'c',heading:'Chain',diagram:chain('n')}]}},proposed=plain(current);
  proposed.page.blocks[0].diagram.edges[5].label='hop five renamed';/* n5 -> n6 */
  const host=await mountPage(page,server,'crop-edge-'+Date.now(),current,proposed);
  await expect(items(host)).toHaveText([/^Modified · Connection n5 → n6 · label$/]);
  for(const s of ['before','after'])await cropped(host,s,['n5','n6'],['n0','n11']);
  for(const s of ['before','after'])await expect(host.locator('.compare-pane[data-side="'+s+'"] [data-dv-edge="5"][data-agent-change="modified"]').first(),s+': connection outlined').toBeAttached();
});

test('C4 a removed node crops the Before pane to it and the After pane to its former neighbours',async({page,server})=>{
  const current={page:{title:'Chain',blocks:[{id:'c',heading:'Chain',diagram:chain('n')}]}},proposed=plain(current),d=proposed.page.blocks[0].diagram;
  delete d.nodes.n6;d.rows=[IDS.filter(id=>id!=='n6')];d.edges=d.edges.filter(e=>e.from!=='n6' && e.to!=='n6').concat([{from:'n5',to:'n7',label:'bypass'}]);
  const host=await mountPage(page,server,'crop-removed-'+Date.now(),current,proposed);
  const labels=await items(host).allInnerTexts(),i=labels.findIndex(l=>/^Removed · Node Node n6$/.test(l));
  expect(i,'precondition: the rail lists the removed node in '+JSON.stringify(labels)).toBeGreaterThanOrEqual(0);
  await items(host).nth(i).click();await expect(items(host).nth(i)).toHaveAttribute('aria-current','true');
  await cropped(host,'before',['n5','n6','n7'],['n0','n11']);
  await cropped(host,'after',['n5','n7'],['n0','n11']);
});
