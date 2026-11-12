import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
/* #1411 (Chuck 2026-11-12): "the trace panel should not infinitely scroll that was a bad idea - you want it to stay ON THE
   PAGE so it's always next to the diagram." In the Trace view, with a 60-span trace loaded, the Status panel never reaches
   past the window's bottom; the diagram stays on screen beside it; a real mouse wheel over the span list scrolls the panel
   body (the one scroller) while the panel and the page stay put (window.scrollY 0).
| surface | fixture | broken implementation it rejects |
|---|---|---|
| plain | published reader (template/flowview.html, claude.ai host stub), no section layout | a panel that grows with its spans so the page scrolls |
| tile | the same with a section layout whose tiles fit the window (the Status tile grows to its content) | a tile that grows past the window |
| explore | the same board's Explore View: the Status panel in its floating window | a window that grows past the window, scrolls the page, or holds the panel in a second scroller |
The Workbench preview renders with telemetry off (src/workbench/preview.js renderOptions telemetry:false), so it cannot load
a trace and has no case here. Desktop only (1440x900). Page functions check the counts they find. */
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
const TILES=[{x:0,y:0,w:15,h:11},{controls:'steps',attachTo:'diagram',x:0,y:11,w:15,h:4},{panel:'status',x:15,y:0,w:9,h:15}];
function spec(surface){
 const d={nodes:{web:{title:'Checkout frontend'},checkout:{title:'Checkout service'},payment:{title:'Payment service'}},rows:[['web','checkout','payment']],
  edges:[{from:'web',to:'checkout',label:'PlaceOrder'},{from:'checkout',to:'payment',label:'Charge'}],
  steps:[{id:'accept',text:'Accept checkout',nodes:['web'],traceMatch:{serviceName:'frontend',operation:'/cart/checkout',nodeId:'web'}},{id:'place',text:'Place the order',edge:'web->checkout',traceMatch:{serviceName:'checkout',operation:'msdemo.CheckoutService/PlaceOrder'}},{id:'cache',text:'Read the cart cache',nodes:['payment'],traceMatch:{serviceName:'redis',operation:'HGET',nodeId:'payment'}}],
  view:'step',autoplay:false,panels:[{id:'status',type:'live-status',title:'Status'}]};
 // follower: a Status controls panel follows the Status card in the same panel column (no section layout).
 if(surface==='follower')d.panels.push({id:'controls',type:'status-controls',title:'Status controls'});
 if(surface==='tile')d.sectionLayout={columns:24,default:structuredClone(TILES)};
 if(surface==='explore'){
  d.layouts=['standard','explore'].map(id=>({id,name:id[0].toUpperCase()+id.slice(1),presentation:id,sectionLayout:{columns:24,default:structuredClone(TILES)}}));d.defaultLayout='standard';
 }
 return {page:{title:'Checkout request path',tracking:{telemetry:{environment:'prod',environments:{prod:{},stage:{}},traceConnections:{company:PROFILE}}},sections:[{id:'main',heading:'Checkout',diagram:d}]}};
}
async function host(page){
 await page.setViewportSize({width:1440,height:900});
 await page.exposeFunction('traceTools',()=>[{server:PROFILE.server,tools:[{name:'get_trace',annotations:{readOnlyHint:true,destructiveHint:false}}]}]);
 await page.exposeFunction('traceDescribe',()=>schema());await page.exposeFunction('tracePermission',keys=>Object.fromEntries(keys.map(k=>[k,'granted'])));
 await page.exposeFunction('traceCall',()=>({payload:sixty()}));
 await page.addInitScript(()=>{try{localStorage.setItem('dv_tour_v1','done');}catch(e){}window.claude={use:async name=>name==='permissions'?{request:keys=>window.tracePermission(keys)}:{listTools:()=>window.traceTools(),describeTool:()=>window.traceDescribe(),callTool:(s,n,a)=>window.traceCall(s,n,a)}};});
}
// The reader's Explore View: its tab in the toolbar's Views strip, else the View picker (as in status-explore.spec.mjs).
async function enterExplore(scope){
 const page=scope.page(),tab=page.locator('.reader-view-strip [role="tab"]').filter({hasText:/^Explore$/}).first(),picker=page.locator('select.reader-view-picker').first();
 await expect(tab.or(picker).first()).toBeVisible();
 if(await tab.isVisible())await tab.click();else await picker.selectOption({label:'Explore'});
 await expect(scope.locator('.explore-stage').first()).toBeVisible();
}
// Opens the surface and loads the 60-span trace in its Status panel; returns the panel card locator.
async function open(page,server,surface,before=null){
 await host(page);
 const name='trace-panel-on-page-'+surface,file=path.join(server.root,name+'.json'),out=path.join(server.root,name+'.html');await writeFile(file,JSON.stringify(spec(surface)));
 execFileSync('python3',[path.join(repo,'tools/inject.py'),file,path.join(repo,'template/flowview.html'),out],{stdio:'pipe'});
 await page.goto(server.origin+'/'+name+'.html');
 const view=page.locator('#docview');await expect(view.locator('.dv-live-trace').first()).toBeVisible();
 if(before)await before(page);
 if(surface==='explore'){await enterExplore(view);await expect(view.locator('[data-explore-panel="status"] .dv-live-trace')).toBeVisible();}
 const panel=(surface==='explore'?view.locator('[data-explore-panel="status"] .pwidget.pt-live-status'):view.locator('.pwidget.pt-live-status')).filter({visible:true}).first();
 await panel.getByRole('textbox',{name:'Trace ID or link',exact:true}).fill(ID);await panel.getByRole('button',{name:'Load trace',exact:true}).click();
 await expect(panel.locator('.dv-trace-span')).toHaveCount(60);
 return panel;
}
/* The panel box: the Status card, or in Explore its floating window. Also the diagram board's box, the first span row's
   top, the page scroll, and the window height. */
const geometry=panel=>panel.evaluate(card=>{
 const box=el=>{const r=el.getBoundingClientRect();return {left:Math.round(r.left),top:Math.round(r.top),right:Math.round(r.right),bottom:Math.round(r.bottom)};};
 const shell=card.closest('.explore-window') || card,section=card.closest('.doc-sec') || document,boards=Array.from(section.querySelectorAll('.board')).filter(b=>b.getClientRects().length);
 const rows=card.querySelectorAll('.dv-trace-span'),body=card.querySelector(':scope>.pbody'),win=card.closest('.explore-window-body');
 return {bodyTop:body?Math.round(body.scrollTop):null,windowBody:win?{scroll:win.scrollHeight,client:win.clientHeight}:null,panel:box(shell),board:boards.length?box(boards[0]):null,boards:boards.length,rows:rows.length,firstRow:rows.length?rows[0].getBoundingClientRect().top:null,
  pageY:Math.round((document.scrollingElement || document.documentElement).scrollTop),innerHeight};
});
const frames=page=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(r)))));

for(const surface of ['plain','tile','explore']){
 test(`#1411 ${surface}: the Trace view panel stays on the page beside the diagram and its spans scroll inside it`,async({page,server},info)=>{
  const panel=await open(page,server,surface);
  // The tile grows to its content a frame or two after the trace renders: wait until the panel box holds still.
  await expect.poll(async()=>{const a=JSON.stringify((await geometry(panel)).panel);await frames(page);return a===JSON.stringify((await geometry(panel)).panel);},{message:'the panel box has settled'}).toBe(true);
  const g=await geometry(panel),where=' ('+surface+': panel '+JSON.stringify(g.panel)+', window height '+g.innerHeight+', page scrollY '+g.pageY+')';
  expect([g.rows,g.boards],'60 span rows and one visible diagram board').toEqual([60,1]);
  expect(g.panel.bottom,'the Status panel ends inside the window'+where).toBeLessThanOrEqual(g.innerHeight);
  expect(g.pageY,'loading the trace did not scroll the page'+where).toBe(0);
  expect(g.board.top,'the diagram is on screen beside the panel; board '+JSON.stringify(g.board)).toBeLessThan(g.innerHeight-150);
  // One scroller: in Explore the window body itself never overflows (no second scroller around the panel body).
  if(surface==='explore')expect(g.windowBody.scroll,'the Explore window body does not scroll '+JSON.stringify(g.windowBody)).toBeLessThanOrEqual(g.windowBody.client+1);
  await page.screenshot({path:info.outputPath('trace-panel-on-page-'+surface+'.png')});
  // A real wheel over the span list moves the spans inside the panel; the panel and the page stay where they are.
  const row=panel.locator('.dv-trace-span').nth(2),b=await row.boundingBox();
  await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.wheel(0,600);
  await expect.poll(async()=>g.firstRow-(await geometry(panel)).firstRow,{message:'the wheel moves the span list inside the panel'+where}).toBeGreaterThan(100);
  await frames(page);const after=await geometry(panel);
  expect(after.panel,'the panel did not move'+where).toEqual(g.panel);
  expect(after.pageY,'the page did not scroll'+where).toBe(0);
  expect(after.bodyTop,'what scrolled is the panel body'+where).toBeGreaterThan(100);
 });
}

// Review c2: a card after the Status card in the same column (the Status controls panel) is never covered: the Status card is
// sticky only as the last card of its column, so the next panel scrolls into view with the page and takes a click.
test('#1411 follower: a panel after the Status card in its column can be scrolled into view and clicked while the Trace view is open',async({page,server})=>{
 const panel=await open(page,server,'follower'),controls=page.locator('#docview .pwidget.pt-status-controls');
 await expect(controls).toHaveCount(1);
 expect(await panel.evaluate(card=>getComputedStyle(card).position),'the Status card is not sticky with a card after it').not.toBe('sticky');
 const g=await geometry(panel);expect(g.panel.bottom,'the Status panel still ends inside the window').toBeLessThanOrEqual(g.innerHeight);
 const title=controls.locator('.ptitle');await title.scrollIntoViewIfNeeded();
 const hit=await title.evaluate(el=>{const b=el.getBoundingClientRect(),at=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2);return {inside:b.top>=0 && b.bottom<=innerHeight,own:!!at && el.closest('.pwidget').contains(at),at:at && (at.className || at.tagName)};});
 expect(hit,'the Status controls title is on screen and nothing covers it').toEqual({inside:true,own:true,at:hit.at});
 await title.click();
});
// Review c2: the cap follows a page scroll. Content above the section puts the card low on the page, so its cap is short; a
// real wheel over that content scrolls the page, the card's top rises and the re-measured cap grows, still ending on screen.
// The card starts more than the documented 160 px floor (plus 8) above the window's bottom, so the floor does not apply;
// a block below the section gives the page room to scroll.
test('#1411 plain: after a page scroll the re-measured cap grows and the panel still ends inside the window',async({page,server})=>{
 const panel=await open(page,server,'plain',async page=>page.evaluate(()=>{const spacer=document.createElement('div');spacer.className='trace-on-page-spacer';spacer.style.height='300px';const below=document.createElement('div');below.style.height='1200px';const sec=document.querySelector('#docview .doc-sec');sec.before(spacer);sec.after(below);window.scrollTo(0,0);}));
 const settle=async()=>{await expect.poll(async()=>{const a=JSON.stringify((await geometry(panel)).panel);await frames(page);return a===JSON.stringify((await geometry(panel)).panel);},{message:'the panel box has settled'}).toBe(true);return geometry(panel);};
 // The Load reveals the loaded trace's request line (#1280), which can scroll the page: start this check from the top.
 await page.evaluate(()=>window.scrollTo(0,0));
 const first=await settle(),h0=first.panel.bottom-first.panel.top;
 expect(first.pageY,'the page starts at the top').toBe(0);expect(first.panel.bottom,'the low card ends inside the window').toBeLessThanOrEqual(first.innerHeight);
 const spacer=await page.locator('.trace-on-page-spacer').boundingBox();await page.mouse.move(spacer.x+spacer.width/2,Math.max(spacer.y+40,first.panel.top-200));await page.mouse.wheel(0,300);
 await expect.poll(()=>page.evaluate(()=>Math.round(scrollY)),{message:'the wheel over the content above scrolls the page'}).toBeGreaterThan(200);
 const after=await settle(),h1=after.panel.bottom-after.panel.top;
 expect(h1,'the cap grew with the room the page scroll made ('+h0+' then '+h1+')').toBeGreaterThan(h0+150);
 expect(after.panel.bottom,'the panel still ends inside the window').toBeLessThanOrEqual(after.innerHeight);
});
