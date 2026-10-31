/* Side-by-side compare view (issue #848, PR 1 of 3). Chuck's rulings 2026-10-31:
   coverage = this new spec plus the existing single-pane assertions updated in
   place; camera = ONE-WAY sync (selecting a change frames both panes; manual
   pan/zoom in one pane never moves the other). Desktop only.

   CONTRACT MATRIX (real pointer/keyboard input through the shipped UI)
   V1 two panes        dialog shows a Before pane (current) and an After pane (proposal);
                       the old Current/Proposed toggle and Highlights button are gone   rejects: one pane with a toggle
   V2 rail             changes are listed grouped by section in document order, with exact
                       "Status · Kind name · fields" text                                 rejects: ungrouped / coarse labels
   V3 navigation       first change selected on open; Next/Previous buttons and J/K keys move
                       the selection with wrap-around; aria-current and "i of n" follow  rejects: buttons only; no wrap
   V4 step sync        selecting a step change puts BOTH panes on that step (each pane's own
                       caption text)                                                      rejects: only the after pane moves
   V5 full mode        each pane renders every node of the section; selecting a node change
                       brings that node into view in both panes; a manual scroll of the
                       Before pane leaves the After pane's scroll position unchanged      rejects: two-way lock; unframed target
   V6 accept           Accept is enabled without choosing a side; one Undo restores the
                       document; Redo re-applies                                          rejects: Accept gated on a side toggle
   V7 standalone       the shared component mounts on a viewer-only page (no Workbench
                       bundle), shows both panes and the rail, Next works, destroy()
                       empties its host                                                   rejects: Workbench-only DOM/globals
   V8 stress           20 open/close cycles on the largest example: the compare host is empty
                       after every close, JS heap after GC grows <= 10% from cycle 2 to 20,
                       and opening takes <= 2x the time the viewer needs to render the same
                       proposal alone                                                     rejects: leaked renders; quadratic open
*/
import {test as viewerTest} from '../helpers/test.mjs';
/* The agent-folder fixture serves its own origin, so those tests use plain
   Playwright like folder-agent.spec.mjs; the viewer-only page uses the audited server. */
import {test,expect} from '@playwright/test';
import {readFile,writeFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {setup,connectExternal,askAgent,root,origin} from '../helpers/folder-agent.mjs';

const plain=v=>JSON.parse(JSON.stringify(v));
function fixture(){
  const current={page:{title:'Compare fixture',blocks:[
    {id:'flow',heading:'Delivery flow',diagram:{view:'step',autoplay:false,
      nodes:{a:{title:'Client'},b:{title:'API'},c:{title:'Store'}},rows:[['a','b','c']],
      edges:[{from:'a',to:'b',label:'send'},{from:'b',to:'c',label:'save'}],
      panels:[{id:'p',type:'gauge',title:'Power',unit:'mA',max:400,initial:{value:6}}],
      steps:[{id:'s1',edge:'a->b',text:'Client sends'},{id:'s2',edge:'b->c',text:'API saves'},{id:'s3',nodes:['c'],text:'Store confirms'},{id:'s4',edge:'b->c',text:'API retries'}]}},
    {id:'notes',heading:'Notes',diagram:{nodes:{x:{title:'Note X'}},rows:[['x']]}}]}};
  const proposed=plain(current),flow=proposed.page.blocks[0].diagram,notes=proposed.page.blocks[1].diagram;
  flow.steps[2].text='Store confirms the write';flow.steps[1].panels={p:{value:42}};flow.nodes.b.title='Gateway';
  notes.nodes.y={title:'Note Y'};notes.rows=[['x','y']];
  return {current,proposed};
}
/* Exact rail for the fixture: groups in document order, entries in engine order. */
const RAIL=[
  ['Delivery flow',['Modified · Node Gateway · title','Modified · Step s2 · panels.p.value','Modified · Step s3 · text']],
  ['Notes',['Modified · Section Notes · diagram.rows','Added · Node Note Y']]];

async function openProposal(page,h,current,proposed){
  await page.setViewportSize({width:1440,height:900});
  await page.locator('#welcome-paste').click();await page.locator('#welcome-json').fill(JSON.stringify(current,null,2));
  await page.locator('#welcome-paste-form button[type=submit]').click();
  await connectExternal(page);const request=await askAgent(page,h,'Compare fixture change');const state=await h.read('state.json');
  await writeFile(path.join(h.session,'candidate.spec.json'),JSON.stringify(proposed,null,2));
  await writeFile(path.join(h.session,'candidate.ledger.md'),'# Coverage ledger\n\nCompare fixture.\n');
  h.run('propose','--request',request.id,'--revision',state.revision,'--file','candidate.spec.json','--ledger','candidate.ledger.md','--summary','Compare fixture change');
  await page.locator('#agent-update-open').click();
  await expect(page.locator('#agent-update-dialog')).toBeVisible();
}
const pane=(page,side)=>page.locator('#agent-update-compare .compare-pane[data-side="'+side+'"]');
const caption=(scope)=>scope.locator('.stepline:not(.dv-caption-old)').first();

test('V1–V6 the agent preview compares Before and After side by side with a grouped rail and one-way framing',async({page})=>{
  const h=await setup(page);
  try{
    const {current,proposed}=fixture();await openProposal(page,h,current,proposed);
    // V1
    await expect(page.locator('#agent-update-current')).toHaveCount(0);await expect(page.locator('#agent-update-proposed')).toHaveCount(0);
    await expect(page.locator('#agent-update-highlights')).toHaveCount(0);
    const before=pane(page,'before'),after=pane(page,'after');
    await expect(before.locator('.compare-pane-title')).toHaveText('Before · current document');
    await expect(after.locator('.compare-pane-title')).toHaveText('After · agent proposal');
    await expect(before.locator('[data-dv-node="b"]').first()).toContainText('API');await expect(after.locator('[data-dv-node="b"]').first()).toContainText('Gateway');
    // V2
    const rail=page.locator('#agent-update-compare .compare-rail');
    const groups=rail.locator('.compare-rail-group');await expect(groups).toHaveCount(RAIL.length);
    for(let g=0;g<RAIL.length;g++){
      await expect(groups.nth(g).locator('.compare-rail-heading')).toHaveText(RAIL[g][0]);
      await expect(groups.nth(g).locator('button.compare-rail-item')).toHaveText(RAIL[g][1]);
    }
    const items=rail.locator('button.compare-rail-item'),position=page.locator('#agent-update-position');
    // V3
    await expect(items.nth(0)).toHaveAttribute('aria-current','true');await expect(position).toContainText('1 of 5');
    await page.locator('#agent-update-next').click();await expect(items.nth(1)).toHaveAttribute('aria-current','true');await expect(position).toContainText('2 of 5');
    await page.keyboard.press('j');await expect(items.nth(2)).toHaveAttribute('aria-current','true');await expect(position).toContainText('3 of 5');
    await page.keyboard.press('k');await expect(items.nth(1)).toHaveAttribute('aria-current','true');
    await page.locator('#agent-update-previous').click();await page.locator('#agent-update-previous').click();
    await expect(items.nth(4)).toHaveAttribute('aria-current','true');await expect(position).toContainText('5 of 5');
    await page.keyboard.press('j');await expect(items.nth(0)).toHaveAttribute('aria-current','true');
    // V4
    await items.nth(2).click();await expect(position).toContainText('3 of 5');
    await expect(caption(before)).toContainText('Store confirms');await expect(caption(before)).not.toContainText('the write');
    await expect(caption(after)).toContainText('Store confirms the write');
    // V5
    for(const side of [before,after])await expect(side.locator('[data-dv-section] [data-dv-node]').filter({visible:true})).toHaveCount(side===before?4:5);
    await items.nth(0).click();
    for(const side of [before,after]){
      const scroller=side.locator('.compare-pane-scroll'),node=side.locator('[data-dv-node="b"]').first();
      await expect.poll(async()=>{const s=await scroller.boundingBox(),n=await node.boundingBox();return !!(s && n && n.y>=s.y && n.y+n.height<=s.y+s.height && n.x>=s.x && n.x+n.width<=s.x+s.width);}).toBe(true);
    }
    const leftScroll=before.locator('.compare-pane-scroll'),rightScroll=after.locator('.compare-pane-scroll');
    const rightTop=await rightScroll.evaluate(el=>el.scrollTop);
    await leftScroll.hover();await page.mouse.wheel(0,400);
    await expect.poll(()=>leftScroll.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
    await page.waitForTimeout(300);expect(await rightScroll.evaluate(el=>el.scrollTop)).toBe(rightTop);
    // V6
    const text=await page.locator('#src').inputValue();
    await expect(page.locator('#agent-update-commit')).toBeEnabled();await page.locator('#agent-update-commit').click();
    await expect(page.locator('#agent-update-dialog')).toBeHidden();
    await expect.poll(async()=>JSON.parse(await page.locator('#src').inputValue()).page.blocks[0].diagram.nodes.b.title).toBe('Gateway');
    const accepted=await page.locator('#src').inputValue();
    await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(text);
    await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(accepted);
  }finally{await h.cleanup();}
});

viewerTest('V7 the shared compare component mounts on a viewer-only page and cleans up on destroy',async({page,server})=>{
  const {current,proposed}=fixture(),name='compare-standalone-'+Date.now();
  await writeFile(path.join(server.root,name+'.json'),JSON.stringify(current));
  execFileSync('python3',[path.join(root,'tools/inject.py'),path.join(server.root,name+'.json'),path.join(root,'template/flowview.html'),path.join(server.root,name+'.html')]);
  const html=await readFile(path.join(server.root,name+'.html'),'utf8');
  expect(html).not.toContain('initWorkbenchAgentReview');/* precondition: viewer-only page, no Workbench bundle */
  const mount=`<div id="compare-host" style="position:fixed;inset:0;z-index:9999;background:#fff"></div><button id="destroy-compare" style="position:fixed;right:8px;bottom:8px;z-index:10000">Destroy</button>
<script>window.addEventListener('load',function(){
  var a=normalize(${JSON.stringify(current)}),b=normalize(${JSON.stringify(proposed)});
  var entries=compareDocuments({authored:a,resolved:a,ledger:null},{authored:b,resolved:b,ledger:null});
  var view=mountCompareView(document.getElementById('compare-host'),{before:a,after:b,entries:entries,mode:'full'});
  document.getElementById('destroy-compare').addEventListener('click',function(){view.destroy();});
});</script>`;
  await writeFile(path.join(server.root,name+'.html'),html.replace('</body>',mount+'</body>'));
  await page.setViewportSize({width:1440,height:900});await page.goto(server.origin+'/'+name+'.html');
  const host=page.locator('#compare-host');
  await expect(host.locator('.compare-pane[data-side="before"] .compare-pane-title')).toHaveText('Before · current document');
  await expect(host.locator('.compare-pane[data-side="after"] [data-dv-node="b"]').first()).toContainText('Gateway');
  const items=host.locator('.compare-rail button.compare-rail-item');await expect(items).toHaveText(RAIL.flatMap(g=>g[1]));
  await expect(items.nth(0)).toHaveAttribute('aria-current','true');
  await host.locator('.compare-rail button.compare-rail-item').nth(2).click();
  await expect(caption(host.locator('.compare-pane[data-side="after"]'))).toContainText('Store confirms the write');
  await page.locator('#destroy-compare').click();
  await expect.poll(()=>host.evaluate(el=>el.childElementCount)).toBe(0);
});

test('V8 twenty open/close cycles on the largest example leave nothing behind and open within 2x a single render',async({page})=>{
  test.setTimeout(240000);
  const largest=JSON.parse(await readFile(path.join(root,'examples/flowview-product-tour/flowview-product-tour.spec.json'),'utf8'));
  const proposed=plain(largest),firstSteps=(proposed.page.blocks || proposed.page.sections).find(b=>b.diagram && b.diagram.steps && b.diagram.steps.length).diagram.steps;
  firstSteps[0].text=String(firstSteps[0].text || '')+' (agent edit)';
  const h=await setup(page);
  try{
    // Baseline: the viewer rendering the proposal alone, served through the fixture origin.
    const dir=await mkdtemp(path.join(tmpdir(),'compare-baseline-'));await writeFile(path.join(dir,'p.json'),JSON.stringify(proposed));
    execFileSync('python3',[path.join(root,'tools/inject.py'),path.join(dir,'p.json'),path.join(root,'template/flowview.html'),path.join(dir,'p.html')]);
    const baseline=await readFile(path.join(dir,'p.html'),'utf8');
    await page.route(origin+'/compare-baseline.html',route=>route.fulfill({contentType:'text/html',body:baseline}));
    await page.setViewportSize({width:1440,height:900});
    const t0=Date.now();await page.goto(origin+'/compare-baseline.html');await expect(page.locator('svg[aria-label="flow diagram"]').first()).toBeVisible();const single=Date.now()-t0;
    await page.goto(origin+'/index.html');
    await openProposal(page,h,largest,proposed);await page.locator('#agent-update-close').click();
    const cdp=await page.context().newCDPSession(page),heap=async()=>{await cdp.send('HeapProfiler.collectGarbage');return (await cdp.send('Runtime.getHeapUsage')).usedSize;};
    const host=page.locator('#agent-update-compare');let base=0,worst=0;
    for(let cycle=1;cycle<=20;cycle++){
      const start=Date.now();await page.locator('#agent-update-open').click();
      await expect(pane(page,'before').locator('svg[aria-label="flow diagram"]').first()).toBeVisible();
      await expect(pane(page,'after').locator('svg[aria-label="flow diagram"]').first()).toBeVisible();
      worst=Math.max(worst,Date.now()-start);
      await page.locator('#agent-update-close').click();await expect(page.locator('#agent-update-dialog')).toBeHidden();
      await expect.poll(()=>host.evaluate(el=>el.childElementCount),{message:'cycle '+cycle+' leaves the compare host empty'}).toBe(0);
      if(cycle===2)base=await heap();
    }
    const end=await heap();
    expect(end,'heap after cycle 20 within 10% of cycle 2 ('+base+' -> '+end+')').toBeLessThanOrEqual(base*1.1);
    expect(worst,'worst open '+worst+' ms vs single render '+single+' ms').toBeLessThanOrEqual(2*single);
  }finally{await h.cleanup();}
});
