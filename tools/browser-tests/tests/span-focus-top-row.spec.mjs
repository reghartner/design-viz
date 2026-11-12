// #1172: focusing a span (Trace view, Auto view, a trace loaded by ID) follows its step and can show the
// diagram's Scroll row. The taller toolbar must not cover the top row of nodes: before the focus every top-row
// card is fully shown; after it the focused step's cards (Checkout service, Payment service) are fully inside
// the visible diagram frame below the toolbar, and no top-row card is partly or wholly under the toolbar. N4 setup
// (Metrics overlay on) and a guard with the overlay off. The camera animates (no reduced motion); every frame from the
// click on is sampled, so the follow camera's first frame counts even when its tween later moves on. Desktop only.
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {test,expect} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
const PROFILE=JSON.parse(await readFile(path.join(repo,'tests/fixtures/trace-connection-profile.json'),'utf8'));
const RECORDED=await readFile(path.join(repo,'tests/fixtures/provider-traces/honeycomb-trace.txt'),'utf8'),ID='8413cd87a9f15b6bfe8e1acf5b3346d0';
const CHARGE='2beed983172122bf';// payment grpc.msdemo.PaymentService/Charge in the recorded trace
const schema={name:'get_trace',annotations:{readOnlyHint:true,destructiveHint:false},inputSchema:{type:'object',properties:{trace_id:{type:'string'},from:{type:'string'},environment_slug:{type:'string'},team_slug:{type:'string'},view_mode:{type:'string'}},required:['trace_id','from','environment_slug','team_slug','view_mode']}};
const call=(svc,op)=>({kind:'call',signals:{rate:{grafana:`sum(rate(rpc_calls_total{service="${svc}",method="${op}"}[5m]))*3600`,unit:'req/h'},errors:{grafana:`sum(rate(rpc_errors_total{service="${svc}",method="${op}"}[5m]))*3600`,unit:'req/h'},
 p95:{grafana:`histogram_quantile(0.95, sum by (le)(rate(rpc_duration_ms_bucket{service="${svc}",method="${op}"}[5m])))`,unit:'ms'}},proof:{rate:{min:10},errors:{maxRatioOf:'rate',max:0.01},p95:{max:300}}});
const TOP=['web','checkout','payment'];
// The board from the Nov 9 report (N4): the diagram with its step controls on the left, the Status panel on the right.
function checkout(){
 return {nodes:{web:{title:'Checkout frontend'},checkout:{title:'Checkout service'},payment:{title:'Payment service'},cart:{title:'Cart service'},shipping:{title:'Shipping service'},email:{title:'Email service'}},
  rows:[TOP,['cart','shipping','email']],
  edges:[{from:'web',to:'checkout',label:'PlaceOrder',telemetry:call('checkout','PlaceOrder')},{from:'checkout',to:'cart',label:'GetCart',telemetry:call('cart','GetCart')},
   {from:'checkout',to:'payment',label:'Charge',telemetry:call('payment','Charge')},{from:'checkout',to:'shipping',label:'ShipOrder'},{from:'checkout',to:'email',label:'Send confirmation'}],
  steps:[{id:'accept',text:'Accept checkout',nodes:['web'],traceMatch:{serviceName:'frontend',operation:'/cart/checkout',nodeId:'web'}},
   {id:'place',text:'Place the order',edge:'web->checkout',traceMatch:{serviceName:'checkout',operation:'msdemo.CheckoutService/PlaceOrder'}},
   {id:'cart',text:'Read the cart',edge:'checkout->cart',traceMatch:{serviceName:'cart',operation:'msdemo.CartService/GetCart'}},
   {id:'charge',text:'Charge the card',edge:'checkout->payment',traceMatch:{serviceName:'payment',operation:'grpc.msdemo.PaymentService/Charge'}},
   {id:'ship',text:'Ship the order',edge:'checkout->shipping',traceMatch:{serviceName:'shipping',operation:'msdemo.ShippingService/ShipOrder'}},
   {id:'quote',text:'Store the shipping quote',nodes:['shipping'],traceMatch:[{serviceName:'shipping',operation:'msdemo.ShippingService/StoreQuoteV2',nodeId:'shipping'},{serviceName:'database',operation:'INSERT shipping.quotes',nodeId:'shipping'}]},
   {id:'email',text:'Send the confirmation',edge:'checkout->email'}],
  view:'step',autoplay:false,panels:[{id:'status',type:'live-status',title:'Status'}],
  sectionLayout:{columns:24,default:[{x:0,y:0,w:15,h:16},{controls:'steps',attachTo:'diagram',x:0,y:16,w:15,h:5},{panel:'status',x:15,y:0,w:9,h:21}]}};
}
async function setup(page,server){
 const key=(a,b)=>a+'->'+b;
 // The reader's camera animates (the project default is reduced motion, which jumps straight to the follow frame).
 await page.emulateMedia({reducedMotion:'no-preference'});
 const spec={page:{title:'Checkout request path',tracking:{telemetry:{traceConnections:{company:PROFILE}}},sections:[{id:'main',heading:'Checkout',diagram:checkout()}]}};
 const series=base=>Array.from({length:24},(_,k)=>[new Date(Date.now()-(23-k)*3600000).toISOString(),Math.round(base*(1+.15*Math.sin(k/3)))]);
 const signals=(rate,errors,p95)=>({rate:{value:rate,unit:'req/h',series:series(rate)},errors:{value:errors,unit:'req/h',series:series(errors)},p95:{value:p95,unit:'ms',series:series(p95)}});
 const samples={[key('web','checkout')]:{signals:signals(5500,12,4447)},[key('checkout','cart')]:{signals:signals(5400,3,41)},[key('checkout','payment')]:{signals:signals(5200,140,262)}};
 await page.setViewportSize({width:1440,height:1100});
 await writeFile(path.join(server.root,'span-focus-top-row-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
 await writeFile(path.join(server.root,'span-focus-top-row.html'),'<div id="host"></div><script type="module">import {mountNativeViewer} from "./span-focus-top-row-native.js";window.mount=mountNativeViewer;</script>');
 await page.goto(server.origin+'/span-focus-top-row.html');await page.waitForFunction(()=>!!window.mount);
 await page.evaluate(({spec,samples,schema,text})=>{
  window.viewer=window.mount(document.querySelector('#host'),spec,{telemetry:{provider:async()=>structuredClone(samples),canChooseExemplar:()=>false,directTrace:{describe:async()=>schema,call:async()=>({payload:text})}}});
 },{spec,samples,schema,text:RECORDED});
 const root=page.locator('#host');await expect(root.getByRole('switch',{name:'Metrics overlay',exact:true})).toBeVisible();
 return root;
}
// Runs in the page from #host's shadow root. For each top-row node card: its box, the visible diagram frame (the
// section's .board cut by every clipping ancestor and the window) with the toolbar (the board's .lg) bottom as its
// top, whether the card is fully inside it, whether it straddles the toolbar's bottom edge (partly under the
// toolbar), and whether the toolbar or anything outside the board is topmost at points just inside its corners and top edge.
// The toolbar and every clipping ancestor are returned for the failure message.
function topRow(host,ids){
 const scope=host.shadowRoot || host,box=el=>{const r=el.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom};};
 const cut=(a,b)=>({left:Math.max(a.left,b.left),top:Math.max(a.top,b.top),right:Math.min(a.right,b.right),bottom:Math.min(a.bottom,b.bottom)});
 const round=r=>Object.fromEntries(Object.entries(r).map(([k,v])=>[k,Math.round(v)]));
 const section=scope.querySelector('#section-main'),boards=section?Array.from(section.querySelectorAll('.board')):[];
 if(boards.length!==1)return {boards:boards.length};
 const board=boards[0],lg=board.querySelector(':scope>.lg'),ancestors=[];let frame=box(board);
 for(let a=board.parentElement || (board.parentNode && board.parentNode.host);a && a!==document.body;a=a.parentElement || (a.parentNode && a.parentNode.host)){
  const cs=getComputedStyle(a);if(cs.overflowX!=='visible' || cs.overflowY!=='visible'){frame=cut(frame,box(a));ancestors.push((a.id?'#'+a.id:a.tagName.toLowerCase()+'.'+String(a.className).trim().split(/\s+/).join('.'))+' '+JSON.stringify(round(box(a))));}
 }
 frame=cut(frame,{left:0,top:0,right:innerWidth,bottom:innerHeight});
 const bar=lg?box(lg):null,visible={...frame,top:Math.max(frame.top,bar?bar.bottom:frame.top)};
 const nodes=ids.map(id=>{
  const g=board.querySelector('g.node[data-dv-node="'+id+'"]'),card=g && g.querySelector('.card');if(!card)return {id,found:false};
  const b=box(card),inset=3,points=[[b.left+inset,b.top+inset],[b.right-inset,b.top+inset],[(b.left+b.right)/2,b.top+inset],[b.left+inset,b.bottom-inset],[b.right-inset,b.bottom-inset]];
  // A card can ignore pointer events (the hit test then falls through to the board behind it), so a point counts as
  // covered only when the topmost element there is the toolbar or lies outside the board.
  const hidden=points.filter(([x,y])=>{const at=scope.elementFromPoint(x,y);return !at || !board.contains(at) || !!(lg && lg.contains(at));}).map(([x,y])=>{const at=scope.elementFromPoint(x,y);return Math.round(x)+','+Math.round(y)+' → '+(at?(at.getAttribute('class') || at.tagName):'nothing');});
  const across=Math.min(b.right,frame.right)-Math.max(b.left,frame.left)>.5;
  return {id,found:true,card:round(b),inside:b.left>=visible.left-.5 && b.right<=visible.right+.5 && b.top>=visible.top-.5 && b.bottom<=visible.bottom+.5,
   underToolbar:!!bar && across && b.top<bar.bottom-.5,hidden};
 });
 // Metric cards in the frame's width whose box reaches above the toolbar's bottom edge (partly or wholly under it).
 const metrics=Array.from(board.querySelectorAll('.dv-metrics-card')).map(card=>{const b=box(card.querySelector('.dv-metrics-card-box') || card);return {id:card.getAttribute('data-metrics-card'),card:round(b),
  under:!!bar && b.right>b.left && Math.min(b.right,frame.right)-Math.max(b.left,frame.left)>.5 && b.top<bar.bottom-.5};});
 const pan=board.querySelector('.board-pan'),zoom=board.querySelector('.board-zoom-value');
 return {boards:1,frame:round(frame),toolbar:bar?{element:'.lg.'+String(lg.className).trim().split(/\s+/).join('.'),rect:round(bar),height:Math.round(bar.bottom-bar.top)}:null,ancestors,
  metrics,scrollRow:!!(pan && !pan.hidden),zoom:zoom && zoom.textContent,scrollTop:Math.round(board.scrollTop),pageY:Math.round(scrollY),nodes};
}
// The camera has settled once the zoom, the viewBox, the scroll offsets and the toolbar height hold for two frames.
async function settled(root){
 await expect.poll(()=>root.evaluate(host=>new Promise(resolve=>{
  const scope=host.shadowRoot || host,board=scope.querySelector('#section-main .board'),svg=board && board.querySelector('svg'),lg=board && board.querySelector(':scope>.lg'),zoom=board && board.querySelector('.board-zoom-value');
  const read=()=>JSON.stringify([zoom && zoom.textContent,svg && svg.getAttribute('viewBox'),board && board.scrollTop,board && board.scrollLeft,lg && lg.offsetHeight,Array.from(scope.querySelectorAll('.dv-metrics-card')).map(c=>c.getAttribute('transform'))]);
  const first=read();requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(first===read()))));
 })),{message:'the board camera has settled'}).toBe(true);
}
// all: every listed card is fully inside the visible frame below the toolbar and nothing covers it.
// Otherwise (after a focus that may zoom in): the focused step's cards are fully shown, and no top-row card
// is partly hidden under the toolbar (straddles its bottom edge).
async function expectTopRowShown(root,when,shown=TOP){
 await settled(root);
 const g=await root.evaluate(topRow,TOP);expect(g.boards,'one diagram board in the section').toBe(1);
 const where=' ('+when+'; frame '+JSON.stringify(g.frame)+', toolbar '+JSON.stringify(g.toolbar)+', clipping ancestors '+JSON.stringify(g.ancestors)+', Scroll row '+g.scrollRow+', zoom '+g.zoom+', board scrollTop '+g.scrollTop+', page scrollY '+g.pageY+')';
 expect(g.toolbar,'the board toolbar (.lg) was found'+where).not.toBeNull();
 expect(g.frame.bottom-g.frame.top,'the diagram frame is on screen'+where).toBeGreaterThan(200);
 for(const n of g.nodes){
  expect(n.found,n.id+' node card found in the shadow root').toBe(true);
  expect(n.underToolbar,n.id+' card '+JSON.stringify(n.card)+' is not partly or wholly hidden under the toolbar'+where).toBe(false);
  if(!shown.includes(n.id))continue;
  expect(n.inside,n.id+' card '+JSON.stringify(n.card)+' lies inside the visible diagram frame below the toolbar'+where).toBe(true);
  expect(n.hidden,n.id+' card: neither the toolbar nor anything outside the board covers its corners or top edge'+where).toEqual([]);
 }
 return g;
}
// Records every top-row card and metric card seen partly or wholly under the toolbar after each DOM change and on every frame, from the
// span click until the camera settles: the follow camera's first frame keeps the graph where it was while the
// Scroll row grows the toolbar, and a later tween (or none, when it is cancelled) must not be needed to fix it.
const TOP_ROW=topRow.toString();
function startSampling(root){
 return root.evaluate((host,{source,ids})=>{
  const scope=host.shadowRoot || host,check=(0,eval)('('+source+')'),seen=window.__topRowSeen=[];window.__topRowStop=false;
  const sample=()=>{const g=check(host,ids);if(!g.nodes)return;g.metrics.forEach(m=>{if(m.under && seen.length<6)seen.push('metric card '+m.id+' '+JSON.stringify(m.card)+' under toolbar '+JSON.stringify(g.toolbar && g.toolbar.rect)+', Scroll row '+g.scrollRow+', zoom '+g.zoom+', scrollTop '+g.scrollTop);});g.nodes.forEach(n=>{if(n.underToolbar && seen.length<6)seen.push(n.id+' card '+JSON.stringify(n.card)+' under toolbar '+JSON.stringify(g.toolbar && g.toolbar.rect)+', Scroll row '+g.scrollRow+', zoom '+g.zoom+', scrollTop '+g.scrollTop);});};
  const observer=new MutationObserver(sample);observer.observe(scope,{subtree:true,childList:true,attributes:true,attributeFilter:['style','class','hidden','transform','viewBox']});
  const frame=()=>{if(window.__topRowStop){observer.disconnect();return;}sample();requestAnimationFrame(frame);};requestAnimationFrame(frame);
 },{source:TOP_ROW,ids:TOP});
}
function stopSampling(page){return page.evaluate(()=>{window.__topRowStop=true;return window.__topRowSeen;});}
async function loadAndFocus(root){
 const page=root.page();
 await root.getByRole('combobox',{name:'Connection environment',exact:true}).selectOption('prod');
 await root.getByRole('textbox',{name:'Trace ID or link',exact:true}).fill(ID);await root.getByRole('button',{name:'Load trace',exact:true}).click();
 const span=root.locator('.dv-trace-span[data-span-id="'+CHARGE+'"]');await expect(span).toHaveCount(1);
 await expectTopRowShown(root,'trace loaded, before the span focus');
 const pageY=await page.evaluate(()=>scrollY),before=await root.evaluate(topRow,TOP);
 await startSampling(root);await span.click();
 // The follow camera has started (its setup shows or hides the Scroll row, or the zoom moves) before settling is checked.
 await expect.poll(async()=>{const now=await root.evaluate(topRow,TOP);return now.scrollRow!==before.scrollRow || now.zoom!==before.zoom;},{message:'the follow camera starts after the span click'}).toBe(true);
 // The focused span's carrier wears the current-level marker (an edge ring or node brackets).
 await expect(root.locator('.dv-trace-edge-focus[data-trace-level="current"],.dv-trace-focus-overlay[data-trace-level="current"]').first()).toBeAttached();
 await expect.poll(()=>page.evaluate(()=>window.viewer.controller.sections[0].stepper.current().id),{message:'the Charge span focus jumps to its step'}).toBe('charge');
 // The focus may scroll the page to the panel; bring the page back so the diagram is on screen (the board's own camera is unchanged).
 await settled(root);
 expect(await stopSampling(page),'no top-row card or metric card is partly or wholly under the toolbar at any frame from the span click on').toEqual([]);
 await page.evaluate(y=>scrollTo(0,y),pageY);
}

test('desktop N4: with the Metrics overlay on, focusing the Charge span keeps the top row of nodes below the toolbar',async({page,server})=>{
 const root=await setup(page,server),metrics=root.getByRole('switch',{name:'Metrics overlay',exact:true});
 await metrics.click();await expect(metrics).toHaveAttribute('aria-checked','true');await expect(root.locator('.dv-metrics-card')).toHaveCount(3);
 await loadAndFocus(root);
 await expectTopRowShown(root,'after the Charge span focus, overlay on',['checkout','payment']);
});
test('desktop guard: with the Metrics overlay off, focusing the Charge span keeps the top row of nodes below the toolbar',async({page,server})=>{
 const root=await setup(page,server);
 await loadAndFocus(root);await expect(root.locator('.dv-metrics-card')).toHaveCount(0);
 await expectTopRowShown(root,'after the Charge span focus, overlay off',['checkout','payment']);
});
