/* Side-by-side compare view (issue #848, PR 1 of 3). Chuck's rulings 2026-10-31:
   coverage = this new spec plus the existing single-pane assertions updated in
   place; camera = ONE-WAY sync (selecting a change frames both panes; manual
   pan/zoom in one pane never moves the other). Desktop only. Real pointer and
   keyboard input only; fixture pages are built before interaction starts.

   CONTRACT MATRIX (one test per row)
   V1 two columns      Before (current) is the left column, After (proposal) the right, same
                       top, similar widths; the Current/Proposed toggle and Highlights are gone   rejects: one pane + toggle; stacked or swapped panes
   V2 rail             changes grouped by section in document order with exact
                       "Status · Kind name · fields" text; the proposal's coverage-ledger change is
                       its own "Document" group at the end                                       rejects: ungrouped / coarse labels
   V3 navigation       first change selected on open; Next/Previous and J/K move the selection
                       with wrap-around; aria-current and "i of n" follow                         rejects: buttons only; no wrap
   V4 step sync        selecting a step change puts BOTH panes on that step (each pane's caption)  rejects: only the After pane moves
   V5 full mode        each pane renders exactly the selected section's nodes (by id, per side)
                       and the section's declared panel;
                       selecting a node change brings it into view in both panes; a manual wheel
                       scroll of the Before pane leaves the After pane's scroll unchanged          rejects: two-way lock; unframed target; wrong section
   V6 accept           with both panes shown, Accept stays enabled while every change is selected in
                       turn (added and step changes included); one Undo restores; Redo re-applies     rejects: Accept gated on a side toggle
   V7, V7b, V8b        viewer-only component page: see compare-view-standalone.spec.mjs
   V8 stress           20 open/close cycles on a generated large document (4 sections, 160 nodes,
                       240 steps, 16 panels; the largest example is 5 MB of embedded images and the
                       agent folder cannot connect it), visiting every change each cycle: after every
                       close the compare host is empty, every render controller created on open has
                       had destroy() called (FlowviewCompare.liveOwners(): each owner counted until its
                       own destroy() runs)
                       and the document keydown listener count is back to its pre-open value; while
                       open there are 4 more (2 renders + 2 canvases); JS heap after GC grows <= 10%
                       from cycle 2 to 20                                                          rejects: leaked renders/listeners
   V9 stale gating     unchanged: covered by folder-agent.spec.mjs "an open review refreshes
                       visibly and cannot accept the new version as the old review" (kept as is) */
/* The agent-folder fixture serves its own origin, so these tests use plain
   Playwright like folder-agent.spec.mjs. The viewer-only page tests (V7, V7b,
   V8b) live in compare-view-standalone.spec.mjs with the audited server. */
import {test,expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
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
  ['Notes',['Modified · Section Notes · diagram.rows','Added · Node Note Y']],
  ['Document',[/^(Added|Modified) · Coverage ledger$/]]];
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
test('V3 Next/Previous and J/K move the selection in both directions with wrap-around and move both panes',async({page})=>{
  await withProposal(page,async()=>{
    const items=rail(page.locator('#agent-update-compare')).locator('button.compare-rail-item'),position=page.locator('#agent-update-position');
    const before=dialogPane(page,'before'),after=dialogPane(page,'after');
    const at=async(i,label)=>{await expect(items.nth(i)).toHaveAttribute('aria-current','true');await expect(position).toContainText((i+1)+' of 6');};
    const panesOn=async(beforeText,afterText)=>{await expect(caption(before)).toContainText(beforeText);await expect(caption(after)).toContainText(afterText);};
    await at(0);
    await page.locator('#agent-update-next').click();await at(1);await panesOn('API saves','API saves');
    await page.keyboard.press('j');await at(2);await panesOn('Store confirms','Store confirms the write');
    await page.keyboard.press('k');await at(1);await panesOn('API saves','API saves');
    await page.locator('#agent-update-previous').click();await at(0);
    await page.locator('#agent-update-previous').click();await at(5);/* Previous wraps first -> last */
    await page.locator('#agent-update-next').click();await at(0);/* Next wraps last -> first */
    await page.keyboard.press('k');await at(5);/* K wraps first -> last */
    await page.keyboard.press('j');await at(0);/* J wraps last -> first */
    await page.keyboard.press('j');await page.keyboard.press('j');await at(2);await panesOn('Store confirms','Store confirms the write');
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
    for(const side of [before,after])await expect(side.locator('[data-dv-section="0"] [data-dv-panel="0"]').first(),'Full mode shows the declared panel').toBeVisible();
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
    const text=await page.locator('#src').inputValue(),commit=page.locator('#agent-update-commit');
    await expect(dialogPane(page,'before')).toBeVisible();await expect(dialogPane(page,'after')).toBeVisible();
    const items=rail(page.locator('#agent-update-compare')).locator('button.compare-rail-item'),n=await items.count();expect(n).toBe(6);
    for(let i=0;i<n;i++){await items.nth(i).click();await expect(commit,'Accept stays enabled with change '+(i+1)+' selected').toBeEnabled();}
    await commit.click();
    await expect(page.locator('#agent-update-dialog')).toBeHidden();
    await expect.poll(async()=>JSON.parse(await page.locator('#src').inputValue()).page.blocks[0].diagram.nodes.b.title).toBe('Gateway');
    const accepted=await page.locator('#src').inputValue();
    await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(text);
    await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(accepted);
  });
});

function largeDocument(){
  const blocks=[];
  for(let k=0;k<4;k++){
    const nodes={},rows=[],edges=[],steps=[];
    for(let n=0;n<40;n++){nodes['n'+n]={title:'Section '+k+' node '+n,sub:'service '+n};if(n%8===0)rows.push([]);rows[rows.length-1].push('n'+n);}
    for(let n=0;n<39;n++)edges.push({from:'n'+n,to:'n'+(n+1),label:'hop '+n});
    const panels=Array.from({length:4},(_,p)=>({id:'g'+p,type:'gauge',title:'Gauge '+p,initial:{value:p}}));
    for(let t=0;t<60;t++)steps.push({id:'t'+t,edge:'n'+(t%39)+'->n'+(t%39+1),text:'Section '+k+' step '+t,panels:{['g'+(t%4)]:{value:t}}});
    blocks.push({id:'s'+k,heading:'Large section '+k,diagram:{view:'step',autoplay:false,nodes,rows,edges,panels,steps}});
  }
  return {page:{title:'Large compare document',blocks}};
}
test('V8 twenty open/close cycles on a large document leave no renders, listeners or heap growth behind',async({page})=>{
  test.setTimeout(420000);
  const current=largeDocument(),proposed=plain(current);
  proposed.page.blocks[0].diagram.steps[0].text+=' (agent edit)';proposed.page.blocks[2].diagram.nodes.n5.title='Renamed by agent';proposed.page.blocks[3].diagram.steps[10].panels={g1:{value:999}};
  const h=await setup(page);
  try{
    await openProposal(page,h,current,proposed);await page.locator('#agent-update-close').click();
    const cdp=await page.context().newCDPSession(page);
    const heap=async()=>{await cdp.send('HeapProfiler.collectGarbage');return (await cdp.send('Runtime.getHeapUsage')).usedSize;};
    const keydown=async()=>{const {result}=await cdp.send('Runtime.evaluate',{expression:'document'});return (await cdp.send('DOMDebugger.getEventListeners',{objectId:result.objectId})).listeners.filter(l=>l.type==='keydown').length;};
    /* Read-only: the public entry point reports render and canvas owners created by
       compare views whose own destroy() has not run (counted per owner, not set by close). */
    const live=()=>page.evaluate(()=>window.FlowviewCompare?window.FlowviewCompare.liveOwners():null);
    const host=page.locator('#agent-update-compare'),html=page.locator('html'),listeners=await keydown(),baseline=await live();let base=0;
    for(let cycle=1;cycle<=20;cycle++){
      await page.locator('#agent-update-open').click();
      await expect(dialogPane(page,'before').locator('svg[aria-label="flow diagram"]').first()).toBeVisible();
      await expect(dialogPane(page,'after').locator('svg[aria-label="flow diagram"]').first()).toBeVisible();
      await expect.poll(live,{message:'two render controllers and two canvas controllers live while open'}).toBe(baseline+4);
      const items=rail(host).locator('button.compare-rail-item'),n=await items.count();expect(n,'precondition: the proposal has changes').toBeGreaterThan(2);
      for(let i=1;i<=n;i++){await page.keyboard.press('j');await expect(items.nth(i%n)).toHaveAttribute('aria-current','true');}
      await page.locator('#agent-update-close').click();await expect(page.locator('#agent-update-dialog')).toBeHidden();
      await expect.poll(()=>host.evaluate(el=>el.childElementCount),{message:'cycle '+cycle+' leaves the compare host empty'}).toBe(0);
      expect(await live(),'cycle '+cycle+' destroys both render and both canvas controllers').toBe(baseline);
      expect(await keydown(),'cycle '+cycle+' removes the compare key listener').toBe(listeners);
      if(cycle===2)base=await heap();
    }
    const end=await heap();
    expect(end,'heap after cycle 20 within 10% of cycle 2 ('+base+' -> '+end+')').toBeLessThanOrEqual(base*1.1);
  }finally{await h.cleanup();}
});
