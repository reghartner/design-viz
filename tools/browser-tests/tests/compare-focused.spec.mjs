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
   F9 fallback    a node change in Focused mode shows the full panes with the note "This change
                  shows in the full diagram." (node cropping is PR 3)          rejects: blank view for node changes
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
async function mountPage(page,server,name,current,proposed,mode){
  await writeFile(path.join(server.root,name+'.json'),JSON.stringify(current));
  execFileSync('python3',[path.join(root,'tools/inject.py'),path.join(server.root,name+'.json'),path.join(root,'template/flowview.html'),path.join(server.root,name+'.html')]);
  const html=await readFile(path.join(server.root,name+'.html'),'utf8');
  expect(html,'precondition: viewer-only page').not.toContain('initWorkbenchAgentReview');
  const close=html.lastIndexOf('</body>'),at=close>=0?close:html.length;
  await writeFile(path.join(server.root,name+'.html'),html.slice(0,at)+`<div id="compare-host" style="position:fixed;inset:0;z-index:9999;background:#fff"></div>
<script>window.addEventListener('load',function(){
  if(!window.FlowviewCompare)return;
  var a=FlowviewCompare.normalize(${JSON.stringify(current)}),b=FlowviewCompare.normalize(${JSON.stringify(proposed)});
  var entries=FlowviewCompare.compare({authored:a,resolved:a,ledger:null},{authored:b,resolved:b,ledger:null});
  window.cv=FlowviewCompare.mount(document.getElementById('compare-host'),${mode?`{before:a,after:b,entries:entries,mode:${JSON.stringify(mode)}}`:'{before:a,after:b,entries:entries}'});
});</script>`+html.slice(at));
  await page.setViewportSize({width:1440,height:900});
  await page.goto(server.origin+'/'+name+'.html');
  return page.locator('#compare-host');
}
const side=(host,s)=>host.locator('.compare-focus-side[data-side="'+s+'"]');
const stepButtons=(host,s)=>side(host,s).locator('button.compare-focus-step');
const current=(host,s)=>side(host,s).locator('button.compare-focus-step[aria-current="true"]');
const rows=host=>host.locator('.compare-focus-row');
const cell=(row,s)=>row.locator('.compare-focus-cell[data-side="'+s+'"]');
const items=host=>host.locator('.compare-rail button.compare-rail-item');
async function bothAt(host,n,captions){
  for(const s of ['before','after']){
    await expect(current(host,s),s+' side is on step '+n).toHaveText(String(n));
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

test('F7 F9 added panels and removed steps show placeholders; a node change falls back to the full panes',async({page,server})=>{
  const current={page:{title:'Place',blocks:[{id:'p',heading:'Place',diagram:{view:'step',autoplay:false,
    nodes:{a:{title:'Alpha'},b:{title:'Beta'},c:{title:'Gamma'}},rows:[['a','b','c']],edges:[{from:'a',to:'b'},{from:'b',to:'c'}],
    panels:[{id:'g',type:'gauge',title:'Gauge',initial:{value:1}}],
    steps:[{id:'s1',nodes:['a'],text:'First'},{id:'s2',nodes:['b'],text:'Middle'},{id:'s3',nodes:['c'],text:'Last'}]}}]}};
  const proposed=plain(current),d=proposed.page.blocks[0].diagram;
  d.nodes.c.title='Gamma renamed';d.panels.push({id:'vf',type:'gauge',title:'Viewfinder',initial:{value:3}});d.steps.splice(1,1);
  const host=await mountPage(page,server,'focus-place-'+Date.now(),current,proposed);
  await expect(items(host)).toHaveText(['Modified · Node Gamma renamed · title','Added · Panel Viewfinder','Removed · Step s2']);
  /* F9: the first change is a node change */
  await expect(items(host).nth(0)).toHaveAttribute('aria-current','true');
  await expect(host.getByRole('button',{name:'Focused',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(host.locator('.compare-focus')).toBeHidden();
  await expect(host.locator('.compare-mode-note')).toHaveText('This change shows in the full diagram.');
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
  await expect(current(host,'before')).toHaveText('2');
  await expect(side(host,'before').locator('.compare-focus-caption')).toHaveText('Middle');
  await expect(side(host,'after').locator('.compare-focus-missing')).toHaveText('Step not in the proposal');
  await expect(current(host,'after')).toHaveCount(0);
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
