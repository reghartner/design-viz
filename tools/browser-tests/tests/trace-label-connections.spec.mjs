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
  traces.forEach(t=>{if(t.plate){const st=getComputedStyle(t.plate);plates.push({text:t.text,opacity:st.opacity,effective:effective(t.plate),textOpacity:getComputedStyle(t.el).fillOpacity,focus:t.el.parentNode.getAttribute('data-trace-focus'),fill:st.fill,ink:getComputedStyle(t.el).fill,ground:getComputedStyle(t.el.closest('.board')).backgroundColor});}});
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
// Test-only connection labels (text.lbl, fixed width through textLength) placed against the Checkout service
// card, in SVG units: they block every spot the avoidance would try, or only the spots straight down.
function block(root,origin,mode){
 return root.evaluate((host,{id,mode})=>{
  const scope=host.shadowRoot || host,node=scope.querySelector('g.node[data-dv-node="'+id+'"]'),svg=node.closest('svg'),card=node.querySelector('.card');
  const m=svg.getCTM().inverse().multiply(card.getCTM()),b=card.getBBox(),cx=m.a*(b.x+b.width/2)+m.e,cb=m.d*(b.y+b.height)+m.f;
  const add=(x,y,w,size)=>{const t=document.createElementNS('http://www.w3.org/2000/svg','text');t.setAttribute('class','lbl');t.setAttribute('data-test-blocker','');
   t.setAttribute('x',x);t.setAttribute('y',y);t.setAttribute('textLength',w);t.setAttribute('lengthAdjust','spacingAndGlyphs');t.style.fontSize=size+'px';t.textContent='blocker';svg.appendChild(t);};
  // 'side': the real ShipOrder label is hidden so only the blocker decides; the blocker covers the left of
  // the label's home spot and every spot straight down, leaving room to the right within the card.
  if(mode==='all')add(cx-200,cb+175,400,200);
  else{Array.from(scope.querySelectorAll('text.lbl')).find(l=>l.textContent==='ShipOrder').style.display='none';add(cx-40,cb+58,35,56);}
 },{id:(origin==='imported'?'shop::':'')+'checkout',mode});
}
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
test('desktop a trace label blocked straight down moves sideways, staying within its card',async({page,server})=>{
 const root=await setup(page,server,'local');await block(root,'local','side');await load(root);
 const moved=await checkoutLabel(root,'local'),after=await labels(root);
 expect(moved.plate,'a clear spot exists sideways').toBe(false);
 expect(moved.y,'not moved down').toBeCloseTo(moved.home.y,3);expect(Math.abs(moved.x-moved.home.x),'moved sideways').toBeGreaterThan(10);
 expect(Math.abs(moved.x-moved.home.x)+moved.width/2,'the whole label stays within its card width').toBeLessThanOrEqual(moved.card/2);
 expect(after.overlaps).toEqual([]);
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
 expect(plate.textOpacity,'the plated text keeps its node dimming').toBe(node);
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
