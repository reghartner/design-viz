// #1195: node and edge trace labels never sit on a connection (edge) label. A trace label that would is
// moved clear (down first, then sideways) or, with no clear spot, drawn on an opaque plate. Connection
// labels never move. Local and imported (topology import) nodes and edges.
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import sourceLoader from '../../../tools/source-loader.cjs';
import {test,expect} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
import {recordedUrlEvidence} from '../../../tests/helpers/step-evidence.mjs';
const PROFILE=JSON.parse(await readFile(path.join(repo,'tests/fixtures/trace-connection-profile.json'),'utf8'));
const RECORDED=await readFile(path.join(repo,'tests/fixtures/provider-traces/honeycomb-trace.txt'),'utf8'),ID='8413cd87a9f15b6bfe8e1acf5b3346d0';
const schema={name:'get_trace',annotations:{readOnlyHint:true,destructiveHint:false},inputSchema:{type:'object',properties:{trace_id:{type:'string'},from:{type:'string'},environment_slug:{type:'string'},team_slug:{type:'string'},view_mode:{type:'string'}},required:['trace_id','from','environment_slug','team_slug','view_mode']}};
const call=(svc,op)=>({kind:'call',signals:{rate:{grafana:`sum(rate(rpc_calls_total{service="${svc}",method="${op}"}[5m]))*3600`,unit:'req/h'},errors:{grafana:`sum(rate(rpc_errors_total{service="${svc}",method="${op}"}[5m]))*3600`,unit:'req/h'},
 p95:{grafana:`histogram_quantile(0.95, sum by (le)(rate(rpc_duration_ms_bucket{service="${svc}",method="${op}"}[5m])))`,unit:'ms'}},proof:{rate:{min:10},errors:{maxRatioOf:'rate',max:0.01},p95:{max:300}}});
// The checkout board with the PlaceOrder span also mapped to the Checkout service node: that node's
// time label lands on the ShipOrder connection label just below the card (#1195, company round 5).
function checkout(){
 return {nodes:{web:{title:'Checkout frontend'},checkout:{title:'Checkout service'},payment:{title:'Payment service'},cart:{title:'Cart service'},shipping:{title:'Shipping service'},email:{title:'Email service'}},
  rows:[['web','checkout','payment'],['cart','shipping','email']],
  edges:[{from:'web',to:'checkout',label:'PlaceOrder',telemetry:call('checkout','PlaceOrder')},{from:'checkout',to:'cart',label:'GetCart',telemetry:call('cart','GetCart')},
   {from:'checkout',to:'payment',label:'Charge',telemetry:call('payment','Charge')},{from:'checkout',to:'shipping',label:'ShipOrder'},{from:'checkout',to:'email',label:'Send confirmation'}],
  steps:[{id:'accept',text:'Accept checkout',nodes:['web'],traceMatch:{serviceName:'frontend',operation:'/cart/checkout',nodeId:'web'}},
   {id:'place',text:'Place the order',edge:'web->checkout',traceMatch:{serviceName:'checkout',operation:'msdemo.CheckoutService/PlaceOrder',nodeId:'checkout'}},
   {id:'cart',text:'Read the cart',edge:'checkout->cart',traceMatch:{serviceName:'cart',operation:'msdemo.CartService/GetCart'}},
   {id:'charge',text:'Charge the card',edge:'checkout->payment',traceMatch:{serviceName:'payment',operation:'grpc.msdemo.PaymentService/Charge'}},
   {id:'ship',text:'Ship the order',edge:'checkout->shipping',traceMatch:{serviceName:'shipping',operation:'msdemo.ShippingService/ShipOrder'}},
   {id:'quote',text:'Store the shipping quote',nodes:['shipping'],traceMatch:[{serviceName:'shipping',operation:'msdemo.ShippingService/StoreQuoteV2',nodeId:'shipping'},{serviceName:'database',operation:'INSERT shipping.quotes',nodeId:'shipping'}]},
   {id:'email',text:'Send the confirmation',edge:'checkout->email'}],
  view:'step',autoplay:false,panels:[{id:'status',type:'live-status',title:'Status'}],
  sectionLayout:{columns:24,default:[{x:0,y:0,w:15,h:16},{controls:'steps',attachTo:'diagram',x:0,y:16,w:15,h:5},{panel:'status',x:15,y:0,w:9,h:21}]}};
}
// The same board through a topology import: node IDs "shop::web", edge keys "shop::web->shop::checkout".
function imported(){
 const local=checkout(),edgeTracking={};local.edges.forEach(e=>{if(e.telemetry){edgeTracking[e.from+'->'+e.to]={telemetry:e.telemetry};delete e.telemetry;}});
 const canon=id=>({version:1,id,kind:'canonical',owner:'group:default/test'});
 const provider={page:{title:'shop',canon:canon('shop'),sections:[{id:'main',diagram:{nodes:local.nodes,rows:local.rows,edges:local.edges,topologyExports:{core:{nodes:Object.keys(local.nodes),edges:local.edges.map(e=>e.from+'->'+e.to)}}}}]}};
 const consumer={page:{title:'consumer',canon:canon('consumer'),sections:[{id:'main',diagram:{nodes:{},rows:[],topologyImports:[{spec:'shop',export:'core',as:'shop',edgeTracking}]}}]}};
 const context=vm.createContext({});vm.runInContext(sourceLoader.composeSources(['validator.js','canon.js']),context);
 const d=JSON.parse(JSON.stringify(context.FlowTopology.resolveSource(consumer,{version:1,id:'consumer',specs:[provider,consumer]}))).page.sections[0].diagram,q=id=>'shop::'+id;
 const match=m=>m.nodeId?{...m,nodeId:q(m.nodeId)}:m;
 d.steps=local.steps.map(step=>({...step,...step.nodes?{nodes:step.nodes.map(q)}:{},...step.edge?{edge:step.edge.split('->').map(q).join('->')}:{},...step.traceMatch?{traceMatch:Array.isArray(step.traceMatch)?step.traceMatch.map(match):match(step.traceMatch)}:{}}));
 return Object.assign(d,{view:local.view,autoplay:false,panels:local.panels,sectionLayout:local.sectionLayout});
}
// focusUnlit: the PlaceOrder span errors, so it is auto-focused, and its step lights only the frontend, so
// the focused Checkout service node is not lit by the step.
async function setup(page,server,origin,{skin,metrics,focusUnlit}={}){
 const diagram=origin==='imported'?imported():checkout();
 if(focusUnlit)diagram.steps=diagram.steps.map(step=>step.id==='place'?(({edge,...rest})=>({...rest,nodes:['web']}))(step):step);
 const text=focusUnlit?RECORDED.replace(/^(\| 2275c50ef5f955a5 \|(?:[^|]*\|){4}) UNSET \| false \|/m,'$1 ERROR | true |'):RECORDED;
 if(focusUnlit && text===RECORDED)throw new Error('PlaceOrder span not found in the recorded trace');
 const spec={page:{title:'Checkout request path',...skin?{skin}:{},tracking:{telemetry:{traceConnections:{company:PROFILE}}},sections:[{id:'main',heading:'Checkout',diagram}]}};
 const prefix=origin==='imported'?'shop::':'',key=(a,b)=>prefix+a+'->'+prefix+b,n=v=>({value:v,unit:'req/h'});
 const samples={[key('web','checkout')]:{signals:{rate:n(5500),errors:n(12),p95:{value:4447,unit:'ms'}}},[key('checkout','cart')]:{signals:{rate:n(5400),errors:n(3),p95:{value:41,unit:'ms'}}},[key('checkout','payment')]:{signals:{rate:n(5200),errors:n(140),p95:{value:262,unit:'ms'}}}};
 await page.setViewportSize({width:1440,height:1100});
 await writeFile(path.join(server.root,'trace-label-connections-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
 await writeFile(path.join(server.root,'trace-label-connections.html'),'<div id="host"></div><script type="module">import {mountNativeViewer} from "./trace-label-connections-native.js";window.mount=mountNativeViewer;</script>');
 await page.goto(server.origin+'/trace-label-connections.html');await page.waitForFunction(()=>!!window.mount);
 await page.evaluate(({spec,schema,text,samples,metrics})=>{window.viewer=window.mount(document.querySelector('#host'),spec,{telemetry:{...metrics?{provider:async()=>structuredClone(samples)}:{},directTrace:{describe:async()=>schema,call:async()=>({payload:text})}}});},{spec,schema,text,samples,metrics});
 return page.locator('#host');
}
// Runs in the page against the viewer's shadow root: shown connection labels (position and box), trace
// label boxes, and each trace label that intersects a connection label without an opaque plate.
function labels(root){
 return root.evaluate(host=>{
  const scope=host.shadowRoot || host,hit=(a,b)=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>.5 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>.5;
  const shown=el=>{const s=getComputedStyle(el);return s.display!=='none' && s.visibility!=='hidden' && Number(s.opacity)>0;};
  const connections=Array.from(scope.querySelectorAll('text.lbl[data-dv-edge]')).filter(shown).map(el=>({text:el.textContent,x:el.getAttribute('x'),y:el.getAttribute('y'),transform:el.getAttribute('transform'),box:el.getBoundingClientRect()}));
  const traces=Array.from(scope.querySelectorAll('.dv-trace-overlay text')).map(el=>({el,text:el.textContent,box:el.getBoundingClientRect(),plate:el.parentNode.querySelector('.dv-trace-label-plate')}));
  // A plated label may share space with a connection label only when the label and its plate are on top there.
  const onTop=(t,c)=>{const g=t.el.parentNode,x=(Math.max(t.box.left,c.box.left)+Math.min(t.box.right,c.box.right))/2,y=(Math.max(t.box.top,c.box.top)+Math.min(t.box.bottom,c.box.bottom))/2;
   g.style.pointerEvents='visiblePainted';const top=scope.elementFromPoint(x,y);g.style.pointerEvents='';return !!top && (top===t.el || top===t.plate || t.el.contains(top));};
  const overlaps=[],plates=[];traces.forEach(t=>connections.forEach(c=>{if(hit(t.box,c.box) && !(t.plate && onTop(t,c)))overlaps.push('"'+t.text+'" on "'+c.text+'"');}));
  // effective: the plate's opacity times every ancestor's, up to the svg.
  const effective=el=>{let e=1;for(;el && el.tagName!=='svg';el=el.parentNode)e*=Number(getComputedStyle(el).opacity);return e;};
  traces.forEach(t=>{if(t.plate){const st=getComputedStyle(t.plate);plates.push({text:t.text,opacity:st.opacity,effective:effective(t.plate),textOpacity:getComputedStyle(t.el).opacity,level:t.el.parentNode.getAttribute('data-trace-level'),focus:t.el.parentNode.getAttribute('data-trace-focus'),fill:st.fill,ink:getComputedStyle(t.el).fill,ground:getComputedStyle(t.el.closest('.board')).backgroundColor});}});
  return {connections:connections.map(c=>[c.text,c.x,c.y,c.transform]),traces:traces.length,overlaps,plates};
 });
}
for(const origin of ['local','imported'])test(`desktop ${origin} trace labels never sit on a connection label, and connection labels do not move`,async({page,server},info)=>{
 const root=await setup(page,server,origin);
 const before=await labels(root);expect(before.traces).toBe(0);expect(before.connections.map(c=>c[0])).toContain('ShipOrder');
 await root.getByRole('combobox',{name:'Connection environment',exact:true}).selectOption('prod');
 await root.getByRole('textbox',{name:'Trace ID or link',exact:true}).fill(ID);await root.getByRole('button',{name:'Load trace',exact:true}).click();
 await expect(root.locator('.dv-trace-overlay text')).toHaveCount(7);
 const after=await labels(root);expect(after.traces,'trace labels seen in the viewer').toBe(7);
 expect(after.overlaps,'no trace label sits on a connection label').toEqual([]);
 expect(after.connections,'connection labels never move').toEqual(before.connections);
 await info.attach('trace-labels-clear-of-connections-'+origin,{body:await root.screenshot(),contentType:'image/png'});
});
// A test-only connection label (text.lbl, fixed width through textLength) placed against the Checkout service
// card, in SVG units, that blocks every spot the avoidance would try.
function block(root,origin,mode){
 return root.evaluate((host,{id,mode})=>{
  const scope=host.shadowRoot || host,node=scope.querySelector('g.node[data-dv-node="'+id+'"]'),svg=node.closest('svg'),card=node.querySelector('.card');
  const m=svg.getCTM().inverse().multiply(card.getCTM()),b=card.getBBox(),cx=m.a*(b.x+b.width/2)+m.e,cb=m.d*(b.y+b.height)+m.f;
  const add=(x,y,w,size)=>{const t=document.createElementNS('http://www.w3.org/2000/svg','text');t.setAttribute('class','lbl');t.setAttribute('data-test-blocker','');
   t.setAttribute('x',x);t.setAttribute('y',y);t.setAttribute('textLength',w);t.setAttribute('lengthAdjust','spacingAndGlyphs');t.style.fontSize=size+'px';t.textContent='blocker';svg.appendChild(t);};
  if(mode==='all')add(cx-200,cb+175,400,200);
 },{id:(origin==='imported'?'shop::':'')+'checkout',mode});
}
// Font-independent geometry, in svg units, for a node's trace label (local board): its home box (centred under
// the card, baseline 24 below it) from the label's measured size, its box now, its card's centre and width,
// and whether it is plated. hide: connection labels hidden first, so only test blockers decide.
function measure(root,id,hide=[]){
 return root.evaluate((host,{id,hide})=>{
  const scope=host.shadowRoot || host,node=scope.querySelector('g.node[data-dv-node="'+id+'"]'),svg=node.closest('svg'),card=node.querySelector('.card');
  Array.from(scope.querySelectorAll('text.lbl')).filter(l=>hide.includes(l.textContent)).forEach(l=>{l.style.display='none';});
  const g=node.querySelector('.dv-trace-overlay') || scope.querySelector('.dv-trace-overlay[data-trace-node="'+id+'"]'),text=g.querySelector('text');
  const inv=svg.getCTM().inverse(),m=inv.multiply(card.getCTM()),mt=inv.multiply(text.getCTM()),c=card.getBBox(),t=text.getBBox(),ty=Number(text.getAttribute('y'));
  const cx=m.a*(c.x+c.width/2)+m.e,base=m.d*(c.y+c.height+24)+m.f,half=t.width*mt.a/2;
  return {cx,card:c.width*m.a,width:2*half,home:{x0:cx-half,x1:cx+half,y0:base+(t.y-ty)*mt.d,y1:base+(t.y+t.height-ty)*mt.d},
   now:{x0:mt.a*t.x+mt.e,x1:mt.a*(t.x+t.width)+mt.e,y0:mt.d*t.y+mt.f,y1:mt.d*(t.y+t.height)+mt.f},plate:!!g.querySelector('.dv-trace-label-plate')};
 },{id,hide});
}
// Adds a test-only connection label (text.lbl) that fills the svg box given, whatever the font: its size and
// position are corrected from its measured box. Returns the box it fills.
function addBlocker(root,box){
 return root.evaluate((host,{x0,x1,y0,y1})=>{
  const scope=host.shadowRoot || host,svg=scope.querySelector('g.node').closest('svg'),t=document.createElementNS('http://www.w3.org/2000/svg','text');
  t.setAttribute('class','lbl');t.setAttribute('data-test-blocker','');t.textContent='blocker';t.setAttribute('lengthAdjust','spacingAndGlyphs');t.setAttribute('textLength',x1-x0);
  t.setAttribute('x',x0);t.setAttribute('y',y1);t.style.fontSize='20px';svg.appendChild(t);
  for(let i=0;i<4;i++){const b=t.getBBox();t.style.fontSize=(parseFloat(t.style.fontSize)*(y1-y0)/b.height)+'px';const c=t.getBBox();t.setAttribute('x',Number(t.getAttribute('x'))+x0-c.x);t.setAttribute('y',Number(t.getAttribute('y'))+y0-c.y);}
  const b=t.getBBox();return {x0:b.x,x1:b.x+b.width,y0:b.y,y1:b.y+b.height};
 },box);
}
// Places blockers against a loaded trace's measured labels, then loads the trace again and waits until every
// trace label has been painted anew (the old label elements are marked first).
async function reblock(root,boxes){
 for(const box of boxes){const got=await addBlocker(root,box);for(const k of ['x0','x1','y0','y1'])expect(Math.abs(got[k]-box[k]),'blocker '+k).toBeLessThan(1);}
 await root.evaluate(host=>(host.shadowRoot || host).querySelectorAll('.dv-trace-overlay text').forEach(t=>t.setAttribute('data-test-old','')));
 await root.getByRole('button',{name:'Load trace',exact:true}).click();
 await expect(root.locator('.dv-trace-overlay text[data-test-old]'),'painted anew').toHaveCount(0);
 await expect(root.locator('.dv-trace-overlay text')).toHaveCount(7);
}
const centre=b=>(b.x0+b.x1)/2;
// count: labels painted (6 with focusUnlit, whose PlaceOrder step has no edge).
async function load(root,count=7){
 await root.getByRole('combobox',{name:'Connection environment',exact:true}).selectOption('prod');
 await root.getByRole('textbox',{name:'Trace ID or link',exact:true}).fill(ID);await root.getByRole('button',{name:'Load trace',exact:true}).click();
 await expect(root.locator('.dv-trace-overlay text')).toHaveCount(count);
}
// The Checkout service's time label: its text x/y and width, the spot it is first placed at (centred, 24 under
// its card), its card's width, and whether it has a plate. A plated label is raised to the top of the svg with data-trace-node.
const checkoutLabel=(root,origin)=>root.evaluate((host,id)=>{
 const scope=host.shadowRoot || host,node=scope.querySelector('g.node[data-dv-node="'+id+'"]'),card=node.querySelector('.card').getBBox();
 const g=node.querySelector('.dv-trace-overlay') || scope.querySelector('.dv-trace-overlay[data-trace-node="'+id+'"]'),text=g && g.querySelector('text');
 return text?{x:Number(text.getAttribute('x')),y:Number(text.getAttribute('y')),width:text.getBBox().width,card:card.width,home:{x:card.x+card.width/2,y:card.y+card.height+24},plate:!!g.querySelector('.dv-trace-label-plate')}:null;
},(origin==='imported'?'shop::':'')+'checkout');
// The blockers below are sized from the label measured in the viewer, so CI fonts do not change the case.
// Each one covers the label's home spot and every spot straight down (down moves go to 32).
test('desktop a trace label blocked straight down moves sideways, staying within its card',async({page,server})=>{
 const root=await setup(page,server,'local');await load(root);
 const a=await measure(root,'checkout',['ShipOrder']),half=a.width/2;
 expect(12+half,'room for a 12-unit move within the card').toBeLessThanOrEqual(a.card/2);
 // Covers the left of the home spot only: the first sideways move (right, 12) is clear.
 await reblock(root,[{x0:a.cx-half-120,x1:a.cx-half+5,y0:a.home.y0-2,y1:a.home.y1+40}]);
 const moved=await measure(root,'checkout'),dx=centre(moved.now)-a.cx;expect(dx,'moved sideways').toBeGreaterThan(10);
 expect(moved.plate,'a clear spot exists sideways').toBe(false);
 expect(moved.now.y0,'not moved down').toBeCloseTo(a.home.y0,3);
 expect(Math.abs(dx)+half,'the whole label stays within its card width').toBeLessThanOrEqual(a.card/2+.01);
 expect((await labels(root)).overlaps).toEqual([]);
});
test('desktop a sideways spot that leaves the card is not used; the label is plated instead',async({page,server})=>{
 const root=await setup(page,server,'local');await load(root);
 const a=await measure(root,'checkout',['ShipOrder']),half=a.width/2;
 // legal: the largest sideways move (12 to 72 in steps of 12) that keeps the whole label within its card;
 // the next one leaves the card. The blocker covers every spot left of that next spot, and that spot only is clear,
 // so an avoidance that allowed any move keeping the label's centre over its card would use it.
 const legal=12*Math.min(6,Math.floor((a.card/2-half)/12)),next=legal+12;
 expect(next,'a next move exists').toBeLessThanOrEqual(72);expect(next+half,'the next move leaves the card').toBeGreaterThan(a.card/2);
 expect(next,'the next move keeps the centre over the card').toBeLessThanOrEqual(a.card/2);
 await reblock(root,[{x0:a.cx-half-120,x1:a.cx+legal-half+4,y0:a.home.y0-2,y1:a.home.y1+40}]);
 const clear=await root.evaluate((host,{x0,x1,y0,y1})=>{const scope=host.shadowRoot || host,svg=scope.querySelector('g.node').closest('svg'),inv=svg.getCTM().inverse();
  return Array.from(scope.querySelectorAll('text.lbl,.node .card')).filter(el=>getComputedStyle(el).display!=='none').every(el=>{const m=inv.multiply(el.getCTM()),b=el.getBBox(),l=m.a*b.x+m.e,r=m.a*(b.x+b.width)+m.e,t=m.d*b.y+m.f,u=m.d*(b.y+b.height)+m.f;
   return r<=x0-2 || l>=x1+2 || u<=y0-2 || t>=y1+2;});},{x0:a.home.x0+next,x1:a.home.x1+next,y0:a.home.y0,y1:a.home.y1});
 expect(clear,'the spot that leaves the card is clear').toBe(true);
 const label=await measure(root,'checkout');expect(label.plate,'plated').toBe(true);expect(centre(label.now),'kept at home').toBeCloseTo(a.cx,3);expect(label.now.y0).toBeCloseTo(a.home.y0,3);
 expect((await labels(root)).overlaps).toEqual([]);
});
test('desktop a label wider than its card still moves straight down to a clear spot, with no plate',async({page,server})=>{
 const root=await setup(page,server,'local');await load(root);
 const a=await measure(root,'shipping');expect(a.width,'the Shipping label is wider than its card').toBeGreaterThan(a.card);
 // Covers the top half of the home spot only: a short move down is clear.
 await reblock(root,[{x0:a.home.x0,x1:a.home.x1,y0:a.home.y0,y1:(a.home.y0+a.home.y1)/2}]);
 const moved=await measure(root,'shipping');expect(moved.now.y0-a.home.y0,'moved down').toBeGreaterThan(1);
 expect(moved.plate,'a clear spot exists straight down').toBe(false);expect(centre(moved.now),'not moved sideways').toBeCloseTo(a.cx,3);
 expect(moved.now.y0-a.home.y0,'within the down moves').toBeLessThanOrEqual(32);
 expect((await labels(root)).overlaps).toEqual([]);
});
test('desktop with no clear spot the label is plated above the connection labels in the board ground colour, on a dark skin',async({page,server},info)=>{
 const root=await setup(page,server,'local',{skin:'blueprint'});await block(root,'local','all');await load(root);
 const label=await checkoutLabel(root,'local');expect(label.plate,'no clear spot: a plate').toBe(true);
 expect(label.x,'not moved off its card').toBeCloseTo(label.home.x,3);
 const after=await labels(root);expect(after.overlaps,'the plated label is drawn on top of the connection labels').toEqual([]);
 const plate=after.plates.find(p=>/^4,446 ms/.test(p.text));expect(plate.opacity).toBe('1');
 expect(plate.effective,'the plate is fully opaque').toBe(1);
 // Raised out of g.node, the label's text keeps its node's step dimming (the node is not lit here).
 const node=await nodeOpacity(root);expect(Number(node),'the Checkout node is dimmed').toBeLessThan(1);
 expect(Number(plate.textOpacity),'the plated text (fill and halo) keeps its node dimming').toBeCloseTo(Number(node)*(plate.level==='other'?.55:1),3);
 expect(plate.fill,'the plate takes the board ground').toBe(plate.ground);expect(plate.fill).not.toBe(plate.ink);
 await info.attach('trace-label-plate-blueprint',{body:await root.screenshot(),contentType:'image/png'});
});
test('desktop a plated label of the trace-focused node is not dimmed',async({page,server})=>{
 const root=await setup(page,server,'local',{skin:'blueprint',focusUnlit:true});await block(root,'local','all');await load(root,6);
 await expect(root.locator('g.node[data-dv-node="checkout"]'),'the errored span is focused on the Checkout node').toHaveAttribute('data-trace-focus','true');
 await expect(root.locator('g.node[data-dv-node="checkout"]'),'not lit by the step').not.toHaveClass(/\blit\b/);
 await expect.poll(()=>nodeOpacity(root),'a trace-focused node is not dimmed').toBe('1');
 const plate=(await labels(root)).plates.find(p=>/^4,446 ms/.test(p.text));
 expect(plate.focus).toBe('true');expect(plate.effective).toBe(1);expect(plate.textOpacity,'its plated label is not dimmed either').toBe('1');
});
// The Checkout node's settled opacity (step dimming fades over 0.4s).
async function nodeOpacity(root){
 let last=null;for(let i=0;i<20;i++){const v=await root.evaluate(host=>getComputedStyle((host.shadowRoot || host).querySelector('g.node[data-dv-node="checkout"]')).opacity);if(v===last)return v;last=v;await new Promise(r=>setTimeout(r,250));}
 return last;
}
// Moves a connection label (one a metric card hides) onto the Shipping service time label's home spot:
// centred, 22 under the card. Test-only, before the trace loads.
function moveOntoShippingHome(root,text){
 return root.evaluate((host,text)=>{
  const scope=host.shadowRoot || host,node=scope.querySelector('g.node[data-dv-node="shipping"]'),svg=node.closest('svg'),card=node.querySelector('.card');
  const m=svg.getCTM().inverse().multiply(card.getCTM()),b=card.getBBox(),x=m.a*(b.x+b.width/2)+m.e,y=m.d*(b.y+b.height+22)+m.f;
  const label=Array.from(scope.querySelectorAll('text.lbl')).find(el=>el.textContent===text),local=svg.getCTM().inverse().multiply(label.getCTM()).inverse();
  label.setAttribute('text-anchor','middle');label.setAttribute('x',local.a*x+local.c*y+local.e);label.setAttribute('y',local.b*x+local.d*y+local.f);
 },text);
}
test('desktop turning Metrics off shows the card-hidden connection labels without a trace label on them',async({page,server})=>{
 // GetCart sits where the Shipping service time label would go; its metric card hides it while Metrics is on.
 const root=await setup(page,server,'local',{metrics:true});await moveOntoShippingHome(root,'GetCart');await load(root);
 const metric=root.getByRole('switch',{name:'Metrics overlay',exact:true});
 await metric.click();await expect(root.locator('.dv-metrics-card')).toHaveCount(3);
 await metric.click();await expect(root.locator('.dv-metrics-card')).toHaveCount(0);
 const after=await labels(root);expect(after.connections.map(c=>c[0])).toEqual(expect.arrayContaining(['PlaceOrder','GetCart','Charge']));
 expect(after.overlaps).toEqual([]);
});
