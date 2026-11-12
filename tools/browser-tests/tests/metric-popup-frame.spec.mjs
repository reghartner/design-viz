// #1165: a metric card's popup stays inside the diagram frame. It never covers the Status panel
// or the step controls (Nov 9 screenshots: N12 GetCart over the step area, N4 Charge over the
// Status panel). Close, Esc and focus are unchanged. Trace view and Jira view. Desktop only.
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {test,expect} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
import {recordedUrlEvidence} from '../../../tests/helpers/step-evidence.mjs';
const PROFILE=JSON.parse(await readFile(path.join(repo,'tests/fixtures/trace-connection-profile.json'),'utf8'));
const RECORDED=await readFile(path.join(repo,'tests/fixtures/provider-traces/honeycomb-trace.txt'),'utf8');
const schema={name:'get_trace',annotations:{readOnlyHint:true,destructiveHint:false},inputSchema:{type:'object',properties:{trace_id:{type:'string'},from:{type:'string'},environment_slug:{type:'string'},team_slug:{type:'string'},view_mode:{type:'string'}},required:['trace_id','from','environment_slug','team_slug','view_mode']}};
const call=(svc,op)=>({kind:'call',signals:{rate:{grafana:`sum(rate(rpc_calls_total{service="${svc}",method="${op}"}[5m]))*3600`,unit:'req/h'},errors:{grafana:`sum(rate(rpc_errors_total{service="${svc}",method="${op}"}[5m]))*3600`,unit:'req/h'},
 p95:{grafana:`histogram_quantile(0.95, sum by (le)(rate(rpc_duration_ms_bucket{service="${svc}",method="${op}"}[5m])))`,unit:'ms'}},proof:{rate:{min:10},errors:{maxRatioOf:'rate',max:0.01},p95:{max:300}}});
// The board from the Nov 9 report: the diagram with its step controls on the left, the Status panel on the right.
// jira: the Charge connection carries a ticket, so the board opens in the Jira view. rows: the diagram tile's height
// (a shorter frame caps the popup). explore: the same tiles as a Standard View and an Explore View.
function board(jira,rows=16,explore=false){
 return {nodes:{web:{title:'Checkout frontend'},checkout:{title:'Checkout service'},payment:{title:'Payment service'},cart:{title:'Cart service'},shipping:{title:'Shipping service'},email:{title:'Email service'}},
  rows:[['web','checkout','payment'],['cart','shipping','email']],
  edges:[{from:'web',to:'checkout',label:'PlaceOrder',telemetry:call('checkout','PlaceOrder')},{from:'checkout',to:'cart',label:'GetCart',telemetry:call('cart','GetCart')},
   {from:'checkout',to:'payment',label:'Charge',telemetry:call('payment','Charge'),...jira?{tickets:['PAY-1']}:{}},{from:'checkout',to:'shipping',label:'ShipOrder'},{from:'checkout',to:'email',label:'Send confirmation'}],
  steps:[{id:'accept',text:'Accept checkout',nodes:['web'],traceMatch:{serviceName:'frontend',operation:'/cart/checkout',nodeId:'web'}},
   {id:'place',text:'Place the order',edge:'web->checkout',traceMatch:{serviceName:'checkout',operation:'msdemo.CheckoutService/PlaceOrder'}},
   {id:'cart',text:'Read the cart',edge:'checkout->cart',traceMatch:{serviceName:'cart',operation:'msdemo.CartService/GetCart'}},
   {id:'charge',text:'Charge the card',edge:'checkout->payment',traceMatch:{serviceName:'payment',operation:'grpc.msdemo.PaymentService/Charge'}},
   {id:'ship',text:'Ship the order',edge:'checkout->shipping',traceMatch:{serviceName:'shipping',operation:'msdemo.ShippingService/ShipOrder'}},
   {id:'email',text:'Send the confirmation',edge:'checkout->email'}],
  view:'step',autoplay:false,panels:[{id:'status',type:'live-status',title:'Status'}],
  ...explore?{layouts:['standard','explore'].map(id=>({id,name:id[0].toUpperCase()+id.slice(1),presentation:id,sectionLayout:tiles(rows)})),defaultLayout:'standard'}:{sectionLayout:tiles(rows)}};
}
function tiles(rows){return {columns:24,default:[{x:0,y:0,w:15,h:rows},{controls:'steps',attachTo:'diagram',x:0,y:rows,w:15,h:5},{panel:'status',x:15,y:0,w:9,h:rows+5}]};}
async function setup(page,server,{jira,rows=16,explore=false}){
 const now=new Date().toISOString(),key=(a,b)=>a+'->'+b;
 const spec={page:{title:'Checkout request path',tracking:{...jira?{jira:{site:'https://acme.atlassian.net'}}:{},telemetry:{traceConnections:{company:PROFILE}}},sections:[{id:'main',heading:'Checkout',diagram:board(jira,rows,explore)}]}};
 const series=base=>Array.from({length:24},(_,k)=>[new Date(Date.now()-(23-k)*3600000).toISOString(),Math.round(base*(1+.15*Math.sin(k/3)))]);
 const signals=(rate,errors,p95)=>({rate:{value:rate,unit:'req/h',series:series(rate)},errors:{value:errors,unit:'req/h',series:series(errors)},p95:{value:p95,unit:'ms',series:series(p95)}});
 const samples={[key('web','checkout')]:{signals:signals(5500,12,4447)},[key('checkout','cart')]:{signals:signals(5400,3,41)},[key('checkout','payment')]:{signals:signals(5200,140,262)}};
 samples[key('web','checkout')].exemplars=[{...await recordedUrlEvidence(),observedAt:now,range:{from:new Date(Date.now()-86400000).toISOString(),to:now}}];
 await page.setViewportSize({width:1440,height:1100});
 await writeFile(path.join(server.root,'metric-popup-frame-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
 await writeFile(path.join(server.root,'metric-popup-frame.html'),'<div id="host"></div><script type="module">import {mountNativeViewer} from "./metric-popup-frame-native.js";window.mount=mountNativeViewer;</script>');
 await page.goto(server.origin+'/metric-popup-frame.html');await page.waitForFunction(()=>!!window.mount);
 await page.evaluate(({spec,samples,schema,text,jira})=>{
  window.samples=samples;
  window.viewer=window.mount(document.querySelector('#host'),spec,{telemetry:{provider:async()=>structuredClone(samples),canChooseExemplar:()=>false,directTrace:{describe:async()=>schema,call:async()=>({payload:text})}},
   ...jira?{liveStatus:{provider:async()=>({'PAY-1':{state:'active',title:'Charge the card'}})}}:{}});
 },{spec,samples,schema,text:RECORDED,jira});
 const root=page.locator('#host'),metrics=root.getByRole('switch',{name:'Metrics overlay',exact:true});
 await expect(metrics).toBeVisible();await metrics.click();await expect(metrics).toHaveAttribute('aria-checked','true');
 await expect(root.locator('.dv-metrics-card')).toHaveCount(3);
 return root;
}
// Trace view: keep an automatic example selection, otherwise pick the first example as a reader does (#1168).
async function pickExample(root){
 const page=root.page(),trace=()=>page.evaluate(()=>{const t=window.viewer.controller.liveStatus.snapshot().trace;return {entries:t.entries.length,selected:!!t.selected,id:t.entries[0] && t.entries[0].exemplar.traceId};});
 await expect.poll(async()=>(await trace()).entries).toBeGreaterThan(0);
 const state=await trace();if(!state.selected)await root.locator('.dv-trace-candidate[data-trace-id="'+state.id+'"]').first().click();
 await expect(root.locator('.dv-trace-selected')).toBeVisible();
}
// The board has settled once the zoom, the frame and every card transform hold for two frames.
async function cameraSettled(root){
 await expect.poll(()=>root.evaluate(host=>new Promise(resolve=>{
  const scope=host.shadowRoot || host,zoom=scope.querySelector('.board-zoom-value'),svg=scope.querySelector('.board svg');
  const read=()=>JSON.stringify([zoom && zoom.textContent,svg && svg.getAttribute('viewBox'),Array.from(scope.querySelectorAll('.dv-metrics-card')).map(card=>card.getAttribute('transform'))]);
  const first=read();requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(first===read())));
 })),{message:'the board camera and cards have settled'}).toBe(true);
}
// Runs in the page from #host's shadow root. The diagram frame is the section's .board box cut by every
// ancestor that clips (overflow not visible) and by the window. The Status panel is its layout tile; the
// step area is the step controls bar. The popup's corners and centre must hit the popup (elementFromPoint).
function geometry(host){
 const scope=host.shadowRoot || host,box=el=>{const r=el.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom};};
 const cut=(a,b)=>({left:Math.max(a.left,b.left),top:Math.max(a.top,b.top),right:Math.min(a.right,b.right),bottom:Math.min(a.bottom,b.bottom)});
 const visible=el=>{let r=box(el);for(let a=el.parentElement || (el.parentNode && el.parentNode.host);a && a!==document.body;a=a.parentElement || (a.parentNode && a.parentNode.host)){const cs=getComputedStyle(a);if(cs.overflowX!=='visible' || cs.overflowY!=='visible')r=cut(r,box(a));}return cut(r,{left:0,top:0,right:innerWidth,bottom:innerHeight});};
 const section=scope.querySelector('#section-main'),boards=section?Array.from(section.querySelectorAll('.board')):[];
 const pops=Array.from(scope.querySelectorAll('.dv-live-popover')).filter(p=>!p.hidden);
 const status=section?Array.from(section.querySelectorAll('.section-layout-tile')).filter(t=>t.querySelector('.pwidget[data-dv-panel]') && /Status/.test(t.getAttribute('data-layout-label') || '')):[];
 const steps=section?Array.from(section.querySelectorAll('.termbar')).filter(t=>!t.hidden && t.getBoundingClientRect().height>0):[];
 if(boards.length!==1 || pops.length!==1 || status.length!==1 || steps.length!==1)return {boards:boards.length,pops:pops.length,status:status.length,steps:steps.length};
 const frame=cut(visible(boards[0]),box(boards[0])),pop=box(pops[0]),panel=visible(status[0]),bar=visible(steps[0]);
 const hit=(a,b)=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>.5 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>.5;
 const points=[[pop.left+3,pop.top+3],[pop.right-3,pop.top+3],[pop.left+3,pop.bottom-3],[pop.right-3,pop.bottom-3],[(pop.left+pop.right)/2,(pop.top+pop.bottom)/2]];
 const covered=points.filter(([x,y])=>{const at=scope.elementFromPoint(x,y);return !(at && pops[0].contains(at));}).map(([x,y])=>Math.round(x)+','+Math.round(y));
 const round=r=>Object.fromEntries(Object.entries(r).map(([k,v])=>[k,Math.round(v)]));
 return {boards:1,pops:1,status:1,steps:1,frame:round(frame),pop:round(pop),panel:round(panel),bar:round(bar),
  outside:pop.left<frame.left-.5 || pop.right>frame.right+.5 || pop.top<frame.top-.5 || pop.bottom>frame.bottom+.5,
  overStatus:hit(pop,panel),overSteps:hit(pop,bar),covered,popHeight:pop.bottom-pop.top};
}
// The popup's box holds still for two frames (its Evidence has painted and it has been placed).
async function popupSettled(root){
 await expect.poll(()=>root.evaluate(host=>new Promise(resolve=>{
  const pop=(host.shadowRoot || host).querySelector('.dv-live-popover'),read=()=>pop?JSON.stringify(pop.getBoundingClientRect()):'';
  const first=read();requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(!!first && first===read())));
 })),{message:'the popup box has settled'}).toBe(true);
}
// Explore view: the popup stays inside the canvas frame and clear of every floating window and the step player.
function exploreGeometry(host){
 const scope=host.shadowRoot || host,box=el=>{const r=el.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom};};
 const cut=(a,b)=>({left:Math.max(a.left,b.left),top:Math.max(a.top,b.top),right:Math.min(a.right,b.right),bottom:Math.min(a.bottom,b.bottom)});
 let frame=null;const board=scope.querySelector('.explore-stage .board.explore-board');
 if(board){frame=box(board);for(let a=board.parentElement || (board.parentNode && board.parentNode.host);a && a!==document.body;a=a.parentElement || (a.parentNode && a.parentNode.host)){const cs=getComputedStyle(a);if(cs.overflowX!=='visible' || cs.overflowY!=='visible')frame=cut(frame,box(a));}frame=cut(frame,{left:0,top:0,right:innerWidth,bottom:innerHeight});}
 const pops=Array.from(scope.querySelectorAll('.dv-live-popover')).filter(p=>!p.hidden);
 const others=Array.from(scope.querySelectorAll('.explore-stage .explore-window,.explore-stage .explore-player')).map(el=>({name:el.getAttribute('data-explore-panel') || el.className,box:box(el)})).filter(o=>o.box.right>o.box.left && o.box.bottom>o.box.top);
 if(!board || pops.length!==1)return {board:!!board,pops:pops.length};
 const pop=box(pops[0]),hit=(a,b)=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>.5 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>.5,round=r=>Object.fromEntries(Object.entries(r).map(([k,v])=>[k,Math.round(v)]));
 return {board:true,pops:1,windows:others.map(o=>o.name),status:others.some(o=>o.name==='status'),player:others.some(o=>/explore-player/.test(o.name)),pop:round(pop),frame:round(frame),
  outside:pop.left<frame.left-.5 || pop.right>frame.right+.5 || pop.top<frame.top-.5 || pop.bottom>frame.bottom+.5,
  covers:others.filter(o=>hit(pop,o.box)).map(o=>o.name+' '+JSON.stringify(round(o.box)))};
}
// Close is in view (inside the popup's box and the topmost element at its centre).
function closeShown(host){
 const scope=host.shadowRoot || host,pop=scope.querySelector('.dv-live-popover'),close=pop.querySelector('.node-link-close'),p=pop.getBoundingClientRect(),c=close.getBoundingClientRect();
 const at=scope.elementFromPoint(c.left+c.width/2,c.top+c.height/2);
 return c.width>0 && c.top>=p.top-.5 && c.bottom<=p.bottom+.5 && c.left>=p.left-.5 && c.right<=p.right+.5 && !!at && (at===close || close.contains(at));
}
async function expectInFrame(root,edge,title){
 const card=root.locator('.dv-metrics-card[data-metrics-card="'+edge+'"]'),pop=root.locator('.dv-live-popover');
 await expect(card).toHaveCount(1);await cameraSettled(root);
 await card.click();
 await expect(pop).toBeVisible();await expect(pop).toContainText(title);await expect(pop).toContainText('Evidence');
 await popupSettled(root);
 const g=await root.evaluate(geometry);
 expect({boards:g.boards,pops:g.pops,status:g.status,steps:g.steps},'one diagram frame, one open popup, one Status panel and one step bar seen in the shadow root').toEqual({boards:1,pops:1,status:1,steps:1});
 const where=' popup '+JSON.stringify(g.pop)+' frame '+JSON.stringify(g.frame)+' Status '+JSON.stringify(g.panel)+' steps '+JSON.stringify(g.bar);
 expect(g.outside,title+' popup inside the diagram frame;'+where).toBe(false);
 expect(g.overStatus,title+' popup does not cover the Status panel;'+where).toBe(false);
 expect(g.overSteps,title+' popup does not cover the step area;'+where).toBe(false);
 expect(g.covered,title+' popup corners and centre are its own (nothing covers it)').toEqual([]);
 expect(g.popHeight,title+' popup shows its content').toBeGreaterThan(60);
 // Close, Esc and focus are unchanged: Esc closes and focus returns to the card.
 await root.page().keyboard.press('Escape');await expect(pop).toBeHidden();await expect(card).toBeFocused();
 await card.click();await expect(pop).toBeVisible();
 await pop.getByRole('button',{name:/^Close/}).click();await expect(pop).toBeHidden();await expect(card).toBeFocused();
}

test('desktop Trace view: the GetCart and Charge metric popups stay inside the diagram frame',async({page,server})=>{
 const root=await setup(page,server,{jira:false});await pickExample(root);
 await expectInFrame(root,'checkout->cart','Metrics · GetCart');
 await expectInFrame(root,'checkout->payment','Metrics · Charge');
});
test('desktop Jira view: the Charge and GetCart popups stay inside the diagram frame',async({page,server})=>{
 const root=await setup(page,server,{jira:true});
 await expect(root.locator('.dv-metrics-card[data-metrics-card="checkout->payment"]')).toHaveAttribute('aria-label',/^Live tickets for Charge/);
 await expectInFrame(root,'checkout->payment','Work status · Charge');
 await expectInFrame(root,'checkout->cart','Work status · GetCart');
});

// Review #1380: a popup taller than the frame is capped and scrolls; a repaint while it is open (a data refresh;
// Over time and late Evidence take the same path) keeps the reader's scroll position, and Close stays in view.
test('desktop a capped popup scrolls, keeps its scroll position through a repaint, and keeps Close in view',async({page,server})=>{
 const root=await setup(page,server,{jira:false,rows:10});await pickExample(root);
 const card=root.locator('.dv-metrics-card[data-metrics-card="checkout->cart"]'),pop=root.locator('.dv-live-popover');
 await cameraSettled(root);await card.click();await expect(pop).toContainText('Metrics · GetCart');await expect(pop).toContainText('Evidence');await popupSettled(root);
 const inFrame=async when=>{const g=await root.evaluate(geometry);expect({boards:g.boards,pops:g.pops,status:g.status,steps:g.steps}).toEqual({boards:1,pops:1,status:1,steps:1});
  expect(g.outside,'popup inside the diagram frame '+when+'; popup '+JSON.stringify(g.pop)+' frame '+JSON.stringify(g.frame)).toBe(false);expect(g.overSteps,'popup off the step area '+when).toBe(false);};
 await inFrame('when opened');
 const scroll=()=>pop.evaluate(el=>({top:el.scrollTop,max:el.scrollHeight-el.clientHeight}));
 expect((await scroll()).max,'the popup is capped to the frame and its body scrolls').toBeGreaterThan(40);
 const box=await pop.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.wheel(0,30);
 await expect.poll(async()=>(await scroll()).top,{message:'the wheel scrolls the popup body'}).toBeGreaterThan(10);
 await popupSettled(root);const before=(await scroll()).top;
 expect(await root.evaluate(closeShown),'Close stays in view while the body is scrolled').toBe(true);
 await pop.evaluate(el=>{window.__popMutations=0;new MutationObserver(()=>window.__popMutations++).observe(el,{subtree:true,childList:true,characterData:true,attributes:true});});
 await page.evaluate(()=>{const next=structuredClone(window.samples);Object.values(next).forEach(v=>Object.values(v.signals).forEach(s=>{s.value=Math.round(s.value*1.1)+1;s.series=s.series.map(([t,n])=>[t,Math.round(n*1.1)+1]);}));window.viewer.controller.telemetry.apply(next);});
 await expect.poll(()=>page.evaluate(()=>window.__popMutations),{message:'the open popup repainted'}).toBeGreaterThan(0);
 await expect(pop).toBeVisible();await popupSettled(root);
 const after=(await scroll()).top;expect(Math.abs(after-before),'the scroll position is kept through the repaint ('+before+' then '+after+')').toBeLessThanOrEqual(1);
 await inFrame('after the repaint');expect(await root.evaluate(closeShown),'Close in view after the repaint').toBe(true);
 await pop.getByRole('button',{name:/^Close/}).click();await expect(pop).toBeHidden();await expect(card).toBeFocused();
});
// The reader's Explore View (as in status-explore.spec.mjs): its tab in the Views strip, else the View picker.
async function enterExplore(scope){
 const page=scope.page(),tab=page.locator('.reader-view-strip [role="tab"]').filter({hasText:/^Explore$/}).first(),picker=page.locator('select.reader-view-picker').first();
 await expect(tab.or(picker).first()).toBeVisible();
 if(await tab.isVisible())await tab.click();else await picker.selectOption({label:'Explore'});
 await expect(scope.locator('.explore-stage').first()).toBeVisible();
}
test('desktop Explore view: the GetCart and Charge popups keep clear of the floating Status window and the step player',async({page,server})=>{
 const root=await setup(page,server,{jira:false,explore:true});await pickExample(root);await enterExplore(root);
 await expect(root.locator('[data-explore-panel="status"]')).toBeVisible();await expect(root.locator('.explore-stage .dv-metrics-card')).toHaveCount(3);
 const pop=root.locator('.dv-live-popover');
 for(const [edge,title] of [['checkout->cart','Metrics · GetCart'],['checkout->payment','Metrics · Charge']]){
  const card=root.locator('.explore-stage .dv-metrics-card[data-metrics-card="'+edge+'"]');await expect(card).toBeVisible();await cameraSettled(root);
  await card.click();await expect(pop).toContainText(title);await expect(pop).toContainText('Evidence');await popupSettled(root);
  const g=await root.evaluate(exploreGeometry);
  expect({board:g.board,pops:g.pops,status:g.status,player:g.player},'the Explore canvas, one popup, the Status window and the step player: '+JSON.stringify(g.windows)).toEqual({board:true,pops:1,status:true,player:true});
  expect(g.outside,title+' popup inside the Explore canvas; popup '+JSON.stringify(g.pop)+' frame '+JSON.stringify(g.frame)).toBe(false);
  expect(g.covers,title+' popup covers no Explore window and not the step player; popup '+JSON.stringify(g.pop)).toEqual([]);
  await page.keyboard.press('Escape');await expect(pop).toBeHidden();await expect(card).toBeFocused();
 }
});
