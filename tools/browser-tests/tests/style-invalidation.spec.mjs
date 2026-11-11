/* #1318 desktop Workbench: node drops must not restyle every button in the page while the Links window is open.
| row | rule | fixture | assertion | broken implementation it rejects |
|---|---|---|---|---|
| G1 | A node drop restyles about as many elements with Links open on Tickets as with Links closed (the ~700 Links buttons are not restyled on every forced style read). Counts come from the Chrome trace (UpdateLayoutTree elementCount), not timing. | 24 nodes in two rows, 2 tickets each | sum of elementCount over one traced drop: open ≤ 1.3 × closed; closed > 0 | a body-anchored :has() or a bare `button` after :has(), which made the open count about 6× closed |
| E1 | The canvas zoom buttons stay hidden while the Workbench page shows reader Contents (the old `.workspace-canvas:has(#docview.has-reader-contents)` rule, now a class on the canvas). | same board | #workspace-zoom-out/#workspace-zoom/#workspace-zoom-in/#workspace-fit display none while #docview has has-reader-contents | zoom buttons that reappear |
| R1 | Reader rail (page markers, #1305): on every page reached, including backward moves, each item carries reader-rail-past-item exactly when its marker is reader-rail-past, and the connector above an item takes the accent colour exactly when the item before it is past (the old `li:has(.reader-rail-past)+li:before` rule). | 5 document pages (page sections, a Tab with two Views, a second Tab), Contents closed | per-item class pairs; per-connector ::before background against the two observed colours | a past class that drifts from the marker; connectors that stop following the pages |
| E2 | In a short desktop window (height ≤ 520px) an open Agent window lifts the spec editor to z-index 180, and closing it drops back (the old `.workspace-canvas:has(#workspace-window-agent:not([hidden]))` rule). | same board, 1280×500 | computed z-index of #spec-editor with Agent open and closed | a lost stacking fix |
*/
import {test,expect,paste,closeTools} from '../helpers/test.mjs';
import {writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {repo} from '../helpers/prepare.mjs';

function board(){
  const nodes={},rows=[[],[]],edges=[];
  for(let i=0;i<24;i++){const id='n'+i;nodes[id]={title:'Service '+i,tickets:['CHM-'+(100+2*i),'CHM-'+(101+2*i)]};rows[i<12?0:1].push(id);if(i)edges.push({from:'n'+(i-1),to:id,label:'call '+i,tickets:['EDG-'+i]});}
  return {page:{title:'Ticket-heavy board',sections:[{heading:'Flow',diagram:{autoplay:false,nodes,rows,edges,
    steps:Array.from({length:6},(_,i)=>({id:'s'+i,text:'Step '+i,nodes:['n'+(i*3)]})),panels:[{id:'status',type:'live-status'}]}}]}};
}
async function open(page,server,size={width:1440,height:1000}){
  await page.setViewportSize(size);
  await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(board(),null,2));
  await expect(page.locator('#docview g.node[data-dv-node="n0"]')).toBeVisible();await closeTools(page);
}
// Drag the first visible node just past its right-hand neighbour, as a person reorders a row.
async function drop(page){
  const p=await page.evaluate(()=>{
    const nodes=[...document.querySelectorAll('#docview svg g.node[data-dv-node]')].filter(n=>{const b=n.getBoundingClientRect();return b.width>0 && b.top>=0 && b.bottom<innerHeight && b.right<innerWidth;});
    for(const a of nodes){const ba=a.getBoundingClientRect();
      const right=nodes.filter(n=>n!==a).map(n=>n.getBoundingClientRect()).filter(b=>Math.abs((b.top+b.bottom)/2-(ba.top+ba.bottom)/2)<8 && b.left>ba.right).sort((x,y)=>x.left-y.left);
      if(right.length)return {x:(ba.left+ba.right)/2,y:(ba.top+ba.bottom)/2,tx:right[0].right+12,ty:(right[0].top+right[0].bottom)/2};
    }
    return null;
  });
  expect(p,'a draggable pair of nodes').not.toBeNull();
  const before=await page.locator('#src').inputValue();
  await page.mouse.move(p.x,p.y);await page.mouse.down();
  for(let i=1;i<=12;i++)await page.mouse.move(p.x+(p.tx-p.x)*i/12,p.y+(p.ty-p.y)*i/12);
  await page.mouse.up();
  await expect.poll(()=>page.locator('#src').inputValue()).not.toBe(before);
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(r,0)))));
}
// Elements restyled during one drop, from the Chrome trace.
async function restyledDuringDrop(page){
  const cdp=await page.context().newCDPSession(page),events=[];
  cdp.on('Tracing.dataCollected',e=>events.push(...e.value));
  await cdp.send('Tracing.start',{traceConfig:{includedCategories:['devtools.timeline','disabled-by-default-devtools.timeline']},transferMode:'ReportEvents'});
  await drop(page);
  const done=new Promise(r=>cdp.once('Tracing.tracingComplete',r));await cdp.send('Tracing.end');await done;await cdp.detach();
  return events.filter(e=>e.name==='UpdateLayoutTree').reduce((sum,e)=>{const a=e.args || {};return sum+(a.elementCount || (a.data && a.data.elementCount) || (a.endData && a.endData.elementCount) || 0);},0);
}

test('G1 desktop node drop restyles about as many elements with Links open on Tickets as closed',async({page,server},info)=>{
  await open(page,server);
  await drop(page);// warm-up
  const closed=await restyledDuringDrop(page);
  await page.locator('#editor-tab-links').click();
  const links=page.locator('#workspace-window-links');await expect(links).toBeVisible();
  await links.getByRole('tab',{name:/^Tickets/}).click();
  const buttons=await links.locator('button').count();
  await drop(page);// warm-up with Links open
  const opened=await restyledDuringDrop(page);
  await info.attach('restyle-counts',{body:JSON.stringify({closed,opened,linksButtons:buttons,ratio:opened/closed}),contentType:'application/json'});
  expect(buttons,'the Links window lists the tickets with many buttons').toBeGreaterThan(100);
  expect(closed,'the trace reports restyled elements').toBeGreaterThan(0);
  expect(opened/closed,'restyled elements with Links open vs closed: '+opened+' / '+closed).toBeLessThanOrEqual(1.3);
});

test('E1 desktop canvas zoom buttons stay hidden while the page shows reader Contents',async({page,server})=>{
  await open(page,server);
  await expect(page.locator('#docview')).toHaveClass(/has-reader-contents/);
  for(const id of ['workspace-zoom-out','workspace-zoom','workspace-zoom-in','workspace-fit'])
    await expect(page.locator('#'+id)).toHaveCSS('display','none');
});

test('E2 desktop short window: an open Agent window lifts the spec editor; closing it drops back',async({page,server})=>{
  await open(page,server,{width:1280,height:500});
  const editor=page.locator('#spec-editor');
  const closedZ=await editor.evaluate(el=>getComputedStyle(el).zIndex);
  expect(closedZ).not.toBe('180');
  await page.locator('#editor-tab-agent').click();await expect(page.locator('#workspace-window-agent')).toBeVisible();
  await expect(editor).toHaveCSS('z-index','180');
  await page.locator('#workspace-window-agent .workspace-window-close').click();await expect(page.locator('#workspace-window-agent')).toBeHidden();
  await expect(editor).toHaveCSS('z-index',closedZ);
});

test('R1 reader rail connectors follow past pages forward and backward',async({page,server})=>{
  await page.setViewportSize({width:1440,height:900});
  const prose=(id,heading)=>({id,heading,text:heading+' prose.'});
  const raw={page:{title:'Rail connectors',sections:[prose('intro','Introduction'),{tabs:[
    {label:'Alpha',defaultView:'one',views:[{id:'one',name:'View one',presentation:'standard',sections:['a1','a2']},{id:'two',name:'View two',presentation:'standard',sections:['a2']}],sections:[prose('a1','Alpha one'),prose('a2','Alpha two')]},
    {label:'Beta',sections:[prose('b1','Beta one')]}]}]}};
  const input=path.join(server.root,'rail-connectors.json'),output=path.join(server.root,'rail-connectors.html');await writeFile(input,JSON.stringify(raw));
  execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),output]);await page.goto(server.origin+'/rail-connectors.html');
  const root=page.locator('#docview'),toggle=root.locator('.reader-top>button');
  if(await toggle.getAttribute('aria-expanded')==='true')await toggle.click();
  const rail=root.locator('.reader-rail'),marks=rail.locator('.reader-rail-mark');await expect(rail).toBeVisible();
  const state=()=>rail.locator('.reader-rail-list>li').evaluateAll(items=>items.map(li=>({item:li.classList.contains('reader-rail-past-item'),mark:li.querySelector('.reader-rail-mark').classList.contains('reader-rail-past'),
    connector:li.previousElementSibling?getComputedStyle(li,'::before').backgroundColor:null})));
  const colours={past:new Set(),plain:new Set()};
  const count=await marks.count();expect(count,'one marker per page').toBeGreaterThanOrEqual(4);
  for(const k of [3,count,2,1,count-1]){
    await marks.nth(k-1).click();await expect(marks.nth(k-1)).toHaveAttribute('aria-current','page');
    const items=await state();
    items.forEach((it,i)=>{
      expect(it.item,'item '+(i+1)+' past class matches its marker on page '+k).toBe(it.mark);
      expect(it.mark,'marker '+(i+1)+' is past exactly when it is before page '+k).toBe(i<k-1);
      if(i)(items[i-1].item?colours.past:colours.plain).add(it.connector);
    });
  }
  expect(colours.past.size,'every connector after a past item has one colour').toBe(1);
  expect(colours.plain.size,'every other connector has one colour').toBe(1);
  expect([...colours.past][0],'past connectors use the accent, not the border colour').not.toBe([...colours.plain][0]);
});
