/* Side-by-side compare view (issue #848, PR 1 of 3). Chuck's rulings 2026-10-31:
   coverage = this new spec plus the existing single-pane assertions updated in
   place; camera = ONE-WAY sync (selecting a change frames both panes; manual
   pan/zoom in one pane never moves the other). Desktop only. Real pointer and
   keyboard input only; fixture pages are built before interaction starts.

   CONTRACT MATRIX (one test per row)
   V1 two columns      Before (current) is the left column, After (proposal) the right, same
                       top, similar widths; the Current/Proposed toggle and Highlights are gone   rejects: one pane + toggle; stacked or swapped panes
   V2 rail             changes grouped by section in document order with exact
                       "Status · Kind name · fields" text                                         rejects: ungrouped / coarse labels
   V3 navigation       first change selected on open; Next/Previous and J/K move the selection
                       with wrap-around; aria-current and "i of n" follow                         rejects: buttons only; no wrap
   V4 step sync        selecting a step change puts BOTH panes on that step (each pane's caption)  rejects: only the After pane moves
   V5 full mode        each pane renders exactly the selected section's nodes (by id, per side);
                       selecting a node change brings it into view in both panes; a manual wheel
                       scroll of the Before pane leaves the After pane's scroll unchanged          rejects: two-way lock; unframed target; wrong section
   V6 accept           Accept is enabled without choosing a side; one Undo restores; Redo re-applies   rejects: Accept gated on a side toggle
   V7 standalone       the shared component mounts on a viewer-only page (no Workbench bundle),
                       shows both panes and the rail; its Next/Previous and J/K work; destroy()
                       empties the host and removes its key listener                              rejects: Workbench-only DOM/globals; leaked listener
   V7b imported node   on the viewer-only page, a provider-caused imported node change frames
                       that imported node in both panes                                            rejects: local-only framing
   V8 stress           20 open/close cycles on the largest example, visiting every change each
                       cycle: the compare host is empty and the document's keydown listener
                       count returns to its pre-open value after every close; JS heap after GC
                       grows <= 10% from cycle 2 to 20; opening takes <= 2x the time the
                       Workbench takes to render the same-size document once (same page, no
                       navigation)                                                                 rejects: leaked renders/listeners; quadratic open
   V9 stale gating     unchanged: covered by folder-agent.spec.mjs "an open review refreshes
                       visibly and cannot accept the new version as the old review" (kept as is) */
import {test as viewerTest} from '../helpers/test.mjs';
/* The agent-folder fixture serves its own origin, so those tests use plain
   Playwright like folder-agent.spec.mjs; the viewer-only page uses the audited server. */
import {test,expect} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {setup,connectExternal,askAgent,root} from '../helpers/folder-agent.mjs';

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
const ITEMS=RAIL.flatMap(g=>g[1]);

async function openProposal(page,h,current,proposed){
  await page.setViewportSize({width:1440,height:900});
  await page.locator('#welcome-paste').click();await page.locator('#welcome-json').fill(JSON.stringify(current,null,2),{timeout:60000});
  await page.locator('#welcome-paste-form button[type=submit]').click();
  await connectExternal(page);const request=await askAgent(page,h,'Compare fixture change');const state=await h.read('state.json');
  await writeFile(path.join(h.session,'candidate.spec.json'),JSON.stringify(proposed,null,2));
  await writeFile(path.join(h.session,'candidate.ledger.md'),'# Coverage ledger\n\nCompare fixture.\n');
  h.run('propose','--request',request.id,'--revision',state.revision,'--file','candidate.spec.json','--ledger','candidate.ledger.md','--summary','Compare fixture change');
  await page.locator('#agent-update-open').click();
  await expect(page.locator('#agent-update-dialog')).toBeVisible();
}
const pane=(scope,side)=>scope.locator('.compare-pane[data-side="'+side+'"]');
const dialogPane=(page,side)=>pane(page.locator('#agent-update-compare'),side);
const caption=scope=>scope.locator('.stepline:not(.dv-caption-old)').first();
const rail=scope=>scope.locator('.compare-rail');
async function inView(scroller,node){
  await expect.poll(async()=>{const s=await scroller.boundingBox(),n=await node.boundingBox();return !!(s && n && n.y>=s.y && n.y+n.height<=s.y+s.height && n.x>=s.x && n.x+n.width<=s.x+s.width);}).toBe(true);
}
async function withProposal(page,run){
  const h=await setup(page);
  try{const {current,proposed}=fixture();await openProposal(page,h,current,proposed);await run(h,current,proposed);}finally{await h.cleanup();}
}

test('V1 Before is the left column and After the right column; the side toggle and Highlights are gone',async({page})=>{
  await withProposal(page,async()=>{
    const before=dialogPane(page,'before'),after=dialogPane(page,'after');
    await expect(before.locator('.compare-pane-title')).toHaveText('Before · current document');
    await expect(after.locator('.compare-pane-title')).toHaveText('After · agent proposal');
    const b=await before.boundingBox(),a=await after.boundingBox();
    expect(b && a,'both panes rendered').toBeTruthy();
    expect(b.x+b.width,'Before ends before After starts').toBeLessThanOrEqual(a.x+1);
    expect(Math.abs(b.y-a.y),'same top').toBeLessThanOrEqual(1);expect(Math.abs(b.width-a.width)/a.width,'similar widths').toBeLessThan(.1);
    await expect(before.locator('[data-dv-node="b"]').first()).toContainText('API');await expect(after.locator('[data-dv-node="b"]').first()).toContainText('Gateway');
    for(const id of ['current','proposed','highlights'])await expect(page.locator('#agent-update-'+id)).toHaveCount(0);
  });
});
test('V2 the rail groups changes by section with exact labels',async({page})=>{
  await withProposal(page,async()=>{
    const groups=rail(page.locator('#agent-update-compare')).locator('.compare-rail-group');await expect(groups).toHaveCount(RAIL.length);
    for(let g=0;g<RAIL.length;g++){
      await expect(groups.nth(g).locator('.compare-rail-heading')).toHaveText(RAIL[g][0]);
      await expect(groups.nth(g).locator('button.compare-rail-item')).toHaveText(RAIL[g][1]);
    }
  });
});
test('V3 Next/Previous and J/K move the selection with wrap-around',async({page})=>{
  await withProposal(page,async()=>{
    const items=rail(page.locator('#agent-update-compare')).locator('button.compare-rail-item'),position=page.locator('#agent-update-position');
    await expect(items.nth(0)).toHaveAttribute('aria-current','true');await expect(position).toContainText('1 of 5');
    await page.locator('#agent-update-next').click();await expect(items.nth(1)).toHaveAttribute('aria-current','true');await expect(position).toContainText('2 of 5');
    await page.keyboard.press('j');await expect(items.nth(2)).toHaveAttribute('aria-current','true');await expect(position).toContainText('3 of 5');
    await page.keyboard.press('k');await expect(items.nth(1)).toHaveAttribute('aria-current','true');
    await page.locator('#agent-update-previous').click();await page.locator('#agent-update-previous').click();
    await expect(items.nth(4)).toHaveAttribute('aria-current','true');await expect(position).toContainText('5 of 5');
    await page.keyboard.press('j');await expect(items.nth(0)).toHaveAttribute('aria-current','true');await expect(position).toContainText('1 of 5');
  });
});
test('V4 selecting a step change puts both panes on that step',async({page})=>{
  await withProposal(page,async()=>{
    const before=dialogPane(page,'before'),after=dialogPane(page,'after');
    await rail(page.locator('#agent-update-compare')).getByRole('button',{name:ITEMS[2],exact:true}).click();
    await expect(caption(before)).toContainText('Store confirms');await expect(caption(before)).not.toContainText('the write');
    await expect(caption(after)).toContainText('Store confirms the write');
  });
});
test('V5 Full mode renders each section exactly and frames a node change in both panes; manual scroll stays per pane',async({page})=>{
  await withProposal(page,async()=>{
    const before=dialogPane(page,'before'),after=dialogPane(page,'after');
    const ids=(scope,section)=>scope.locator('[data-dv-section="'+section+'"] g.node[data-dv-node]').evaluateAll(nodes=>[...new Set(nodes.map(n=>n.getAttribute('data-dv-node')))].sort());
    await expect.poll(()=>ids(before,0)).toEqual(['a','b','c']);await expect.poll(()=>ids(after,0)).toEqual(['a','b','c']);
    await expect.poll(()=>ids(before,1)).toEqual(['x']);await expect.poll(()=>ids(after,1)).toEqual(['x','y']);
    await rail(page.locator('#agent-update-compare')).getByRole('button',{name:ITEMS[0],exact:true}).click();
    for(const side of [before,after])await inView(side.locator('.compare-pane-scroll'),side.locator('[data-dv-node="b"]').first());
    const left=before.locator('.compare-pane-scroll'),right=after.locator('.compare-pane-scroll');
    const rightTop=await right.evaluate(el=>el.scrollTop),leftTop=await left.evaluate(el=>el.scrollTop);
    await left.hover();await page.mouse.wheel(0,400);
    await expect.poll(()=>left.evaluate(el=>el.scrollTop)).not.toBe(leftTop);
    await page.waitForTimeout(300);expect(await right.evaluate(el=>el.scrollTop),'manual scroll of Before leaves After unchanged').toBe(rightTop);
  });
});
test('V6 Accept is enabled without choosing a side and applies once with Undo/Redo',async({page})=>{
  await withProposal(page,async()=>{
    const text=await page.locator('#src').inputValue();
    await expect(page.locator('#agent-update-commit')).toBeEnabled();await page.locator('#agent-update-commit').click();
    await expect(page.locator('#agent-update-dialog')).toBeHidden();
    await expect.poll(async()=>JSON.parse(await page.locator('#src').inputValue()).page.blocks[0].diagram.nodes.b.title).toBe('Gateway');
    const accepted=await page.locator('#src').inputValue();
    await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(text);
    await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(accepted);
  });
});

/* Viewer-only page: the injected viewer template plus a fixture script that
   mounts the shared component (no Workbench bundle). */
async function standalonePage(server,name,body){
  await writeFile(path.join(server.root,name+'.json'),JSON.stringify(fixture().current));
  execFileSync('python3',[path.join(root,'tools/inject.py'),path.join(server.root,name+'.json'),path.join(root,'template/flowview.html'),path.join(server.root,name+'.html')]);
  const html=await readFile(path.join(server.root,name+'.html'),'utf8');
  expect(html,'precondition: viewer-only page').not.toContain('initWorkbenchAgentReview');
  await writeFile(path.join(server.root,name+'.html'),html.replace('</body>',`<div id="compare-host" style="position:fixed;inset:0 0 48px 0;z-index:9999;background:#fff"></div>
<div style="position:fixed;left:0;right:0;bottom:0;height:48px;z-index:10000;background:#eee"><button id="cv-prev">Previous</button><button id="cv-next">Next</button><button id="cv-destroy">Destroy</button></div>
<script>window.addEventListener('load',function(){${body}
  document.getElementById('cv-prev').addEventListener('click',function(){view.previous();});
  document.getElementById('cv-next').addEventListener('click',function(){view.next();});
  document.getElementById('cv-destroy').addEventListener('click',function(){view.destroy();});
});</script></body>`));
}
viewerTest('V7 the shared compare component works on a viewer-only page and cleans up on destroy',async({page,server})=>{
  const {current,proposed}=fixture(),name='compare-standalone-'+Date.now();
  await standalonePage(server,name,`var a=normalize(${JSON.stringify(current)}),b=normalize(${JSON.stringify(proposed)});
  var entries=compareDocuments({authored:a,resolved:a,ledger:null},{authored:b,resolved:b,ledger:null});
  var view=window.cv=mountCompareView(document.getElementById('compare-host'),{before:a,after:b,entries:entries,mode:'full'});`);
  await page.setViewportSize({width:1440,height:900});
  const cdp=await page.context().newCDPSession(page);
  const keydown=async()=>{const {result}=await cdp.send('Runtime.evaluate',{expression:'document'});return (await cdp.send('DOMDebugger.getEventListeners',{objectId:result.objectId})).listeners.filter(l=>l.type==='keydown').length;};
  await page.goto(server.origin+'/'+name+'.html');
  const host=page.locator('#compare-host');
  await expect(pane(host,'before').locator('.compare-pane-title')).toHaveText('Before · current document');
  await expect(pane(host,'after').locator('[data-dv-node="b"]').first()).toContainText('Gateway');
  const items=rail(host).locator('button.compare-rail-item');await expect(items).toHaveText(ITEMS);
  await expect(items.nth(0)).toHaveAttribute('aria-current','true');
  await page.locator('#cv-next').click();await expect(items.nth(1)).toHaveAttribute('aria-current','true');
  await page.locator('#cv-prev').click();await page.locator('#cv-prev').click();await expect(items.nth(4)).toHaveAttribute('aria-current','true');
  await page.keyboard.press('j');await expect(items.nth(0)).toHaveAttribute('aria-current','true');
  await page.keyboard.press('j');await page.keyboard.press('j');await expect(items.nth(2)).toHaveAttribute('aria-current','true');
  await expect(caption(pane(host,'after'))).toContainText('Store confirms the write');
  const withView=await keydown();
  await page.locator('#cv-destroy').click();
  await expect.poll(()=>host.evaluate(el=>el.childElementCount)).toBe(0);
  expect(await keydown(),'destroy() removes the component key listener').toBe(withView-1);
  await page.keyboard.press('j');await expect(host.locator('*')).toHaveCount(0);
});
viewerTest('V7b an imported node change frames the imported node in both panes',async({page,server})=>{
  const spec=(id,d)=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},sections:[{id:'main',heading:'Main',diagram:d}]}});
  const provider=spec('provider',{nodes:{a:{title:'Provider A'},b:{title:'Provider B'}},rows:[['a','b']],edges:[{from:'a',to:'b',label:'ab'}],topologyExports:{public:{nodes:['a','b'],edges:['a->b']}}});
  const provider2=plain(provider);provider2.page.sections[0].diagram.nodes.b.title='Provider B changed';
  const consumer=spec('consumer',{nodes:{local:{title:'Local'}},rows:[['local']],steps:[{id:'t0',nodes:['local']}],topologyImports:[{spec:'provider',export:'public',as:'child'}]});
  const name='compare-imported-'+Date.now();
  await standalonePage(server,name,`var c=${JSON.stringify(consumer)};
  function side(p){var raw=JSON.parse(JSON.stringify(c));return {authored:normalize(JSON.parse(JSON.stringify(c))),resolved:normalize(FlowTopology.resolveSource(raw,{version:1,id:'consumer',specs:[p,c]})),ledger:null};}
  var A=side(${JSON.stringify(provider)}),B=side(${JSON.stringify(provider2)}),entries=compareDocuments(A,B);
  var view=window.cv=mountCompareView(document.getElementById('compare-host'),{before:A.resolved,after:B.resolved,entries:entries,mode:'full'});`);
  await page.setViewportSize({width:1440,height:900});await page.goto(server.origin+'/'+name+'.html');
  const host=page.locator('#compare-host'),items=rail(host).locator('button.compare-rail-item');
  await expect(items).toHaveText(['Modified · Imported node child::b · title']);
  await items.nth(0).click();
  for(const side of ['before','after']){
    const p=pane(host,side);
    await inView(p.locator('.compare-pane-scroll'),p.locator('[data-dv-node="child::b"]').first());
  }
  await expect(pane(host,'before').locator('[data-dv-node="child::b"]').first()).toContainText('Provider B');
  await expect(pane(host,'after').locator('[data-dv-node="child::b"]').first()).toContainText('Provider B changed');
});

test('V8 twenty open/close cycles on the largest example leave nothing behind and open within 2x a single render',async({page})=>{
  test.setTimeout(420000);
  const largest=JSON.parse(await readFile(path.join(root,'examples/flowview-product-tour/flowview-product-tour.spec.json'),'utf8'));
  /* The example nests sections inside tab groups: search both levels. */
  const stepped=p=>{for(const b of p.blocks || p.sections || []){if(b.diagram && (b.diagram.steps || []).length)return b.diagram;for(const t of b.tabs || [])for(const sec of t.sections || [])if(sec.diagram && (sec.diagram.steps || []).length)return sec.diagram;}return null;};
  const proposed=plain(largest),diagram=stepped(proposed.page);expect(diagram,'precondition: the largest example has a diagram with steps').toBeTruthy();
  diagram.steps[0].text=String(diagram.steps[0].text || '')+' (agent edit)';
  const h=await setup(page);
  try{
    await page.setViewportSize({width:1440,height:900});
    // Baseline: the Workbench rendering the same-size document once (same page, no navigation).
    await page.locator('#welcome-paste').click();await page.locator('#welcome-json').fill(JSON.stringify(largest,null,2),{timeout:60000});
    const t0=Date.now();await page.locator('#welcome-paste-form button[type=submit]').click();
    await expect(page.locator('#docview svg[aria-label="flow diagram"]').first()).toBeVisible({timeout:60000});const single=Date.now()-t0;
    await connectExternal(page);const request=await askAgent(page,h,'Stress the compare view');const state=await h.read('state.json');
    await writeFile(path.join(h.session,'candidate.spec.json'),JSON.stringify(proposed,null,2));await writeFile(path.join(h.session,'candidate.ledger.md'),'# Coverage ledger\n\nStress.\n');
    h.run('propose','--request',request.id,'--revision',state.revision,'--file','candidate.spec.json','--ledger','candidate.ledger.md','--summary','Stress');
    const cdp=await page.context().newCDPSession(page);
    const heap=async()=>{await cdp.send('HeapProfiler.collectGarbage');return (await cdp.send('Runtime.getHeapUsage')).usedSize;};
    const keydown=async()=>{const {result}=await cdp.send('Runtime.evaluate',{expression:'document'});return (await cdp.send('DOMDebugger.getEventListeners',{objectId:result.objectId})).listeners.filter(l=>l.type==='keydown').length;};
    const host=page.locator('#agent-update-compare'),listeners=await keydown();let base=0,worst=0;
    for(let cycle=1;cycle<=20;cycle++){
      const start=Date.now();await page.locator('#agent-update-open').click();
      await expect(dialogPane(page,'before').locator('svg[aria-label="flow diagram"]').first()).toBeVisible();
      await expect(dialogPane(page,'after').locator('svg[aria-label="flow diagram"]').first()).toBeVisible();
      worst=Math.max(worst,Date.now()-start);
      const items=rail(host).locator('button.compare-rail-item'),n=await items.count();expect(n,'precondition: the proposal has changes').toBeGreaterThan(0);
      for(let i=1;i<=n;i++){await page.keyboard.press('j');await expect(items.nth(i%n)).toHaveAttribute('aria-current','true');}
      await page.locator('#agent-update-close').click();await expect(page.locator('#agent-update-dialog')).toBeHidden();
      await expect.poll(()=>host.evaluate(el=>el.childElementCount),{message:'cycle '+cycle+' leaves the compare host empty'}).toBe(0);
      expect(await keydown(),'cycle '+cycle+' removes the compare key listener').toBe(listeners);
      if(cycle===2)base=await heap();
    }
    const end=await heap();
    expect(end,'heap after cycle 20 within 10% of cycle 2 ('+base+' -> '+end+')').toBeLessThanOrEqual(base*1.1);
    expect(worst,'worst open '+worst+' ms vs single render '+single+' ms').toBeLessThanOrEqual(2*single);
  }finally{await h.cleanup();}
});
