/* Shared compare component on a viewer-only page (issue #848, PR 1 of 3).
   Companion to compare-view.spec.mjs (the agent-preview dialog); these tests
   use the audited local server, which the agent-folder fixture cannot.
   Fixture pages are built before interaction; all interaction is real input.

   CONTRACT MATRIX
   V7  standalone   the component mounts on a viewer-only page (no Workbench bundle), shows both
                    panes and the rail; its Next/Previous and J/K work; destroy() empties the host
                    and removes its key listener                                  rejects: Workbench-only DOM/globals; leaked listener
   V7b imported     a provider-caused imported node change frames that imported node in both panes
                                                                                  rejects: local-only framing
   V8b open time    with real clicks, mounting both panes takes <= 2x mounting one pane of the same view
                    (median of 3 each, timed until every diagram section in the mounted panes has
                    rendered). Chuck 2026-10-31: "today's single-pane preview" no longer exists after
                    #848, so the baseline is one pane of the same view; the limit stays at the issue's
                    2x and the implementation is optimized to meet it
                                                                                  rejects: quadratic or repeated rendering on open */
import {test,expect} from '../helpers/test.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
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
const ITEMS=['Modified · Node Gateway · title','Modified · Step s2 · panels.p.value','Modified · Step s3 · text','Modified · Section Notes · diagram.rows','Added · Node Note Y'];
const pane=(scope,side)=>scope.locator('.compare-pane[data-side="'+side+'"]');
const caption=scope=>scope.locator('.stepline:not(.dv-caption-old)').first();
const rail=scope=>scope.locator('.compare-rail');
async function inView(scroller,node){
  await expect.poll(async()=>{const s=await scroller.boundingBox(),n=await node.boundingBox();return !!(s && n && n.y>=s.y && n.y+n.height<=s.y+s.height && n.x>=s.x && n.x+n.width<=s.x+s.width);}).toBe(true);
}

/* Viewer-only page: the injected viewer template plus a fixture script that
   mounts the shared component (no Workbench bundle). */
async function standalonePage(server,name,body){
  await writeFile(path.join(server.root,name+'.json'),JSON.stringify(fixture().current));
  execFileSync('python3',[path.join(root,'tools/inject.py'),path.join(server.root,name+'.json'),path.join(root,'template/flowview.html'),path.join(server.root,name+'.html')]);
  const html=await readFile(path.join(server.root,name+'.html'),'utf8');
  expect(html,'precondition: viewer-only page').not.toContain('initWorkbenchAgentReview');
  const at=html.lastIndexOf('</body>');expect(at,'precondition: the page has a closing body tag').toBeGreaterThan(0);
  await writeFile(path.join(server.root,name+'.html'),html.slice(0,at)+`<div id="compare-host" style="position:fixed;inset:0 0 48px 0;z-index:9999;background:#fff"></div>
<div style="position:fixed;left:0;right:0;bottom:0;height:48px;z-index:10000;background:#eee"><button id="cv-prev">Previous</button><button id="cv-next">Next</button><button id="cv-destroy">Destroy</button></div>
<script>window.addEventListener('load',function(){${body}
  document.getElementById('cv-prev').addEventListener('click',function(){view.previous();});
  document.getElementById('cv-next').addEventListener('click',function(){view.next();});
  document.getElementById('cv-destroy').addEventListener('click',function(){view.destroy();});
});</script>`+html.slice(at));
}
test('V7 the shared compare component works on a viewer-only page and cleans up on destroy',async({page,server})=>{
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
test('V7b an imported node change frames the imported node in both panes',async({page,server})=>{
  const spec=(id,d)=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},sections:[{id:'main',heading:'Main',diagram:d}]}});
  /* A wide provider: the changed imported node is the last of 24 in one row, off-screen until framed. */
  const ids=Array.from({length:24},(_,i)=>'n'+i),pnodes=Object.fromEntries(ids.map(id=>[id,{title:'Provider '+id}]));
  const provider=spec('provider',{nodes:pnodes,rows:[ids],edges:ids.slice(1).map((id,i)=>({from:ids[i],to:id})),topologyExports:{public:{nodes:ids,edges:ids.slice(1).map((id,i)=>ids[i]+'->'+id)}}});
  const provider2=plain(provider);provider2.page.sections[0].diagram.nodes.n23.title='Provider n23 changed';
  const consumer=spec('consumer',{nodes:{local:{title:'Local'}},rows:[['local']],steps:[{id:'t0',nodes:['local']}],topologyImports:[{spec:'provider',export:'public',as:'child'}]});
  const consumer2=plain(consumer);consumer2.page.sections[0].diagram.nodes.local.title='Local renamed';
  const name='compare-imported-'+Date.now();
  await standalonePage(server,name,`function side(c,p){var raw=JSON.parse(JSON.stringify(c));return {authored:normalize(JSON.parse(JSON.stringify(c))),resolved:normalize(FlowTopology.resolveSource(raw,{version:1,id:'consumer',specs:[p,c]})),ledger:null};}
  var A=side(${JSON.stringify(consumer)},${JSON.stringify(provider)}),B=side(${JSON.stringify(consumer2)},${JSON.stringify(provider2)}),entries=compareDocuments(A,B);
  var view=window.cv=mountCompareView(document.getElementById('compare-host'),{before:A.resolved,after:B.resolved,entries:entries,mode:'full'});`);
  await page.setViewportSize({width:1280,height:800});await page.goto(server.origin+'/'+name+'.html');
  const host=page.locator('#compare-host'),items=rail(host).locator('button.compare-rail-item');
  await expect(items).toHaveText(['Modified · Node Local renamed · title','Modified · Imported node child::n23 · title']);
  await expect(items.nth(0)).toHaveAttribute('aria-current','true');
  const target=side=>pane(host,side).locator('[data-dv-node="child::n23"]').first();
  const visible=async side=>{const s=await pane(host,side).locator('.compare-pane-scroll').boundingBox(),n=await target(side).boundingBox();return !!(s && n && n.x>=s.x && n.x+n.width<=s.x+s.width && n.y>=s.y && n.y+n.height<=s.y+s.height);};
  for(const side of ['before','after'])expect(await visible(side),'precondition: the imported node starts outside the '+side+' pane view').toBe(false);
  await page.locator('#cv-next').click();await expect(items.nth(1)).toHaveAttribute('aria-current','true');
  for(const side of ['before','after'])await expect.poll(()=>visible(side),{message:'selecting the imported change frames child::n23 in the '+side+' pane'}).toBe(true);
  await expect(target('before')).toContainText('Provider n23');await expect(target('after')).toContainText('Provider n23 changed');
});
test('V8b mounting both panes takes at most 2x mounting one pane',async({page,server})=>{
  test.setTimeout(180000);
  const blocks=[];
  for(let k=0;k<4;k++){
    const nodes={},rows=[],edges=[],steps=[];
    for(let n=0;n<40;n++){nodes['n'+n]={title:'S'+k+' node '+n};if(n%8===0)rows.push([]);rows[rows.length-1].push('n'+n);}
    for(let n=0;n<39;n++)edges.push({from:'n'+n,to:'n'+(n+1)});
    for(let t=0;t<60;t++)steps.push({id:'t'+t,edge:'n'+(t%39)+'->n'+(t%39+1),text:'Step '+t});
    blocks.push({id:'s'+k,heading:'Large '+k,diagram:{view:'step',autoplay:false,nodes,rows,edges,steps}});
  }
  const current={page:{title:'Large',blocks}},proposed=plain(current);proposed.page.blocks[1].diagram.nodes.n3.title='Changed';
  const name='compare-perf-'+Date.now();
  await standalonePage(server,name,`var a=normalize(${JSON.stringify(current)}),b=normalize(${JSON.stringify(proposed)});
  var entries=compareDocuments({authored:a,resolved:a,ledger:null},{authored:b,resolved:b,ledger:null}),view=null,host=document.getElementById('compare-host');
  function mount(single){if(view)view.destroy();view=mountCompareView(host,{before:single?null:a,after:b,entries:entries,mode:'full'});}
  var bar=document.getElementById('cv-destroy').parentNode;
  [['cv-one',true],['cv-two',false]].forEach(function(p){var btn=document.createElement('button');btn.id=p[0];btn.textContent=p[0];btn.addEventListener('click',function(){mount(p[1]);});bar.appendChild(btn);});
  view={previous:function(){},next:function(){},destroy:function(){}};`);
  await page.setViewportSize({width:1440,height:900});await page.goto(server.origin+'/'+name+'.html');
  const host=page.locator('#compare-host');
  async function time(button,panes){
    await page.locator('#cv-destroy').click();await expect.poll(()=>host.evaluate(el=>el.childElementCount)).toBe(0);
    const t=Date.now();await page.locator(button).click();
    for(const side of panes)await expect(pane(host,side).locator('svg[aria-label="flow diagram"]')).toHaveCount(4,{timeout:60000});
    return Date.now()-t;
  }
  const median=list=>list.slice().sort((x,y)=>x-y)[1],one=[],two=[];
  for(let i=0;i<3;i++){one.push(await time('#cv-one',['after']));two.push(await time('#cv-two',['before','after']));}
  expect(median(two),'both panes '+JSON.stringify(two)+' ms vs one pane '+JSON.stringify(one)+' ms').toBeLessThanOrEqual(2*median(one));
});
