import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
/* #1280 (Chuck 2026-11-10): "That shouldn't have a scroll bar. That should just stretch as long as the spans stretch."
| row | rule | fixture | assertion | broken implementation it rejects |
|---|---|---|---|---|
| G2 | Chuck's case (2026-11-10, "i am always going to use a stretching layout"): in the Standard section layout the Live status tile grows to its content, so the 60-span list grows, the panel body has no inner scroll either, the tile holds every row and the page reaches the last one | 60 spans, panel in a section-layout tile | waterfall and panel body scrollHeight <= clientHeight + 1; tile bottom >= the list's bottom; the last row, scrolled into view, is inside every clipping ancestor and the viewport and is hit by elementFromPoint | a list stretched to the tile and scrolling inside it (flex 1 1 0, contain size) |
| G1 | The same with no section layout (plain panel): the list has no scroll of its own | 60-span trace, board without a section layout | waterfall scrollHeight <= clientHeight + 1; the last row reachable | a capped list (max-height 240px, overflow auto) |
| G3 | A short trace adds no empty space under its last row, in both layouts | 3-span trace | waterfall bottom - last row bottom <= its 8px padding + 2 | a fill rule or min-height on the list |
| G4 | A span focused from the diagram far down the list is brought into view by the scroll that now holds it | 60 spans, tile and plain | the focused row is visible by the all-ancestors check | a reveal that still scrolls only the list |
Desktop only. Page functions start at host.shadowRoot || host and check the counts they find. */
const PROFILE=JSON.parse(await readFile(path.join(repo,'tests/fixtures/trace-connection-profile.json'),'utf8'));
const RECORDED=await readFile(path.join(repo,'tests/fixtures/provider-traces/honeycomb-trace.txt'),'utf8');
const ID='8413cd87a9f15b6bfe8e1acf5b3346d0',LEAF='| dcce084f04baa9e1 | 011114cbd1fd62de |';
const schema=()=>({name:'get_trace',annotations:{readOnlyHint:true,destructiveHint:false},inputSchema:{type:'object',properties:{trace_id:{type:'string'},from:{type:'string'},environment_slug:{type:'string'},team_slug:{type:'string'},view_mode:{type:'string',enum:['full']}},required:['trace_id','from','environment_slug','team_slug','view_mode'],additionalProperties:false}});
// The recorded trace has 55 spans; five more leaf copies under the same parent make 60.
function sixty(){
 const lines=RECORDED.split('\n'),at=lines.findIndex(l=>l.startsWith(LEAF));
 const extra=Array.from({length:5},(_,i)=>lines[at].replace('dcce084f04baa9e1','aaaa0000000000'+String(10+i)));
 lines.splice(at+1,0,...extra);return lines.join('\n');
}
// Only the root and its first two descendants: a three-span trace.
function three(){
 const lines=RECORDED.split('\n'),rows=lines.map((l,i)=>[l,i]).filter(([l])=>/^\| [0-9a-f]{16} \|/.test(l)).slice(3).map(([,i])=>i);
 return lines.filter((l,i)=>!rows.includes(i)).join('\n');
}
function spec(tile){
 const d={nodes:{web:{title:'Checkout frontend'},checkout:{title:'Checkout service'},payment:{title:'Payment service'}},rows:[['web','checkout','payment']],
  edges:[{from:'web',to:'checkout',label:'PlaceOrder'},{from:'checkout',to:'payment',label:'Charge'}],
  steps:[{id:'accept',text:'Accept checkout',nodes:['web'],traceMatch:{serviceName:'frontend',operation:'/cart/checkout',nodeId:'web'}},{id:'place',text:'Place the order',edge:'web->checkout',traceMatch:{serviceName:'checkout',operation:'msdemo.CheckoutService/PlaceOrder'}}],
  view:'step',autoplay:false,panels:[{id:'status',type:'live-status',title:'Status'}]};
 if(tile)d.sectionLayout={columns:24,default:[{x:0,y:0,w:15,h:16},{controls:'steps',attachTo:'diagram',x:0,y:16,w:15,h:5},{panel:'status',x:15,y:0,w:9,h:21}]};
 return {page:{title:'Checkout request path',tracking:{telemetry:{environment:'prod',environments:{prod:{},stage:{}},traceConnections:{company:PROFILE}}},sections:[{id:'main',heading:'Checkout',diagram:d}]}};
}
async function open(page,server,{tile,payload}){
 await page.setViewportSize({width:1440,height:900});
 await page.exposeFunction('traceTools',()=>[{server:PROFILE.server,tools:[{name:'get_trace',annotations:{readOnlyHint:true,destructiveHint:false}}]}]);
 await page.exposeFunction('traceDescribe',()=>schema());await page.exposeFunction('tracePermission',keys=>Object.fromEntries(keys.map(k=>[k,'granted'])));
 await page.exposeFunction('traceCall',()=>({payload}));
 await page.addInitScript(()=>{localStorage.setItem('dv_tour_v1','done');window.claude={use:async name=>name==='permissions'?{request:keys=>window.tracePermission(keys)}:{listTools:()=>window.traceTools(),describeTool:()=>window.traceDescribe(),callTool:(s,n,a)=>window.traceCall(s,n,a)}};window.flowviewBooted=ctl=>{window.ctl=ctl;};});
 const name='trace-spans-grow-'+(tile?'tile':'plain'),file=path.join(server.root,name+'.json'),out=path.join(server.root,name+'.html');await writeFile(file,JSON.stringify(spec(tile)));
 execFileSync('python3',[path.join(repo,'tools/inject.py'),file,path.join(repo,'template/flowview.html'),out],{stdio:'pipe'});
 await page.goto(server.origin+'/'+name+'.html');await page.waitForFunction(()=>!!window.ctl);
 const panel=page.locator('.pwidget.pt-live-status').filter({visible:true}).first();await expect(panel.locator('.dv-live-trace')).toBeVisible();
 await panel.getByRole('textbox',{name:'Trace ID or link',exact:true}).fill(ID);await panel.getByRole('button',{name:'Load trace',exact:true}).click();
 await expect(panel.locator('.dv-trace-span').first()).toBeVisible();
 return panel;
}
/* Measurements from the list's own elements. A row is visible when its centre lies inside every ancestor that clips
   (overflow other than visible) and inside the viewport, and elementFromPoint at that centre hits the row. */
// which: a row index (negative counts from the end) or a span id.
const measure=(panel,which)=>panel.evaluate((p,which)=>{
 const r=p.shadowRoot || p,lists=r.querySelectorAll('.dv-trace-waterfall'),list=lists[0],items=list?list.querySelectorAll(':scope > .dv-trace-span-item'):[];
 if(lists.length!==1 || !items.length)return {lists:lists.length,items:items.length};
 if(typeof which==='string' && !list.querySelector('.dv-trace-span[data-span-id="'+which+'"]'))return {lists:1,items:items.length,rowId:null};
 const row=typeof which==='string'?list.querySelector('.dv-trace-span[data-span-id="'+which+'"]'):items[which<0?items.length+which:which].querySelector('.dv-trace-span'),lb=list.getBoundingClientRect(),last=items[items.length-1].getBoundingClientRect();
 function visible(el){
  const b=el.getBoundingClientRect(),x=b.left+b.width/2,y=b.top+b.height/2;if(!b.height || x<0 || y<0 || x>innerWidth || y>innerHeight)return false;
  for(let a=el.parentElement || el.parentNode;a && a!==document;a=a.parentElement || (a.parentNode && a.parentNode.host) || null){
   if(a.nodeType!==1)continue;const s=getComputedStyle(a);if(s.overflowX==='visible' && s.overflowY==='visible')continue;
   const c=a.getBoundingClientRect();if(x<c.left || x>c.right || y<c.top || y>c.bottom)return false;
  }
  const hit=(r.elementFromPoint?r:document).elementFromPoint(x,y);return !!hit && (hit===el || el.contains(hit));
 }
 const scroller=list.closest('.pbody') || p.querySelector('.pbody'),tile=p.closest('.section-layout-tile');
 return {lists:1,items:items.length,scroll:list.scrollHeight,client:list.clientHeight,overflow:getComputedStyle(list).overflowY,gap:lb.bottom-last.bottom,listBottom:lb.bottom,
  body:scroller?{scroll:scroller.scrollHeight,client:scroller.clientHeight}:null,tileBottom:tile?tile.getBoundingClientRect().bottom:null,rowVisible:visible(row),rowId:row.getAttribute('data-span-id')};
},which);
const reveal=(panel,index)=>panel.evaluate((p,index)=>{const r=p.shadowRoot || p,items=r.querySelectorAll('.dv-trace-waterfall > .dv-trace-span-item');items[index<0?items.length+index:index].querySelector('.dv-trace-span').scrollIntoView({block:'center'});},index);

for(const tile of [true,false]){
 const where=tile?'the stretching section layout':'a plain panel';
 test('#1280 '+(tile?'G2':'G1')+' in '+where+' the 60-span list has no scroll of its own and its last row is reached',async({page,server},info)=>{
  const panel=await open(page,server,{tile,payload:sixty()});
  let m=await measure(panel,-1);expect([m.lists,m.items],'one list of 60 rows').toEqual([1,60]);
  expect(m.scroll,'no inner scroll: scrollHeight '+m.scroll+' vs clientHeight '+m.client+' (overflow '+m.overflow+')').toBeLessThanOrEqual(m.client+1);
  if(tile){
   // The tile grows to the panel's content in whole rows after the trace renders.
   await expect.poll(async()=>{const t=await measure(panel,-1);return t.body && t.body.scroll<=t.body.client+1 && t.tileBottom>=t.listBottom;},{message:'the tile grows: no panel-body scroll, the tile holds the whole list'}).toBe(true);
  }
  await reveal(panel,-1);m=await measure(panel,-1);expect(m.rowVisible,'the last row is visible after scrolling the page').toBe(true);
  await page.screenshot({path:info.outputPath('trace-spans-grow-'+(tile?'tile':'plain')+'.png')});
 });
 test('#1280 G3 in '+where+' a three-span trace adds no empty space under its last row',async({page,server})=>{
  const panel=await open(page,server,{tile,payload:three()});
  const m=await measure(panel,-1);expect([m.lists,m.items],'one list of 3 rows').toEqual([1,3]);
  expect(m.gap,'space under the last row: '+m.gap).toBeLessThanOrEqual(10);
 });
 test('#1280 G4 in '+where+' a span focused from the diagram far down the list is brought into view',async({page,server})=>{
  const panel=await open(page,server,{tile,payload:sixty()});
  await panel.locator('.dv-trace-span').nth(1).click();await expect(panel.locator('.dv-trace-span-detail')).toHaveCount(1);
  const far=await page.evaluate(()=>{const t=window.ctl.liveStatus.snapshot().trace.selected,span=t.exemplar.spans[52];window.ctl.liveStatus.selectTraceSpan({context:t.context,spanId:span.id});return span.id;});
  await expect(panel.locator('.dv-trace-span[data-span-id="'+far+'"]')).toHaveAttribute('aria-pressed','true');
  await expect.poll(async()=>{const m2=await measure(panel,far);return m2.rowId===far && m2.rowVisible;},{message:'the focused row is visible by the all-ancestors check'}).toBe(true);
 });
}
