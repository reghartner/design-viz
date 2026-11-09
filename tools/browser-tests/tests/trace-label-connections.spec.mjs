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
async function setup(page,server,origin){
 const spec={page:{title:'Checkout request path',tracking:{telemetry:{traceConnections:{company:PROFILE}}},sections:[{id:'main',heading:'Checkout',diagram:origin==='imported'?imported():checkout()}]}};
 await page.setViewportSize({width:1440,height:1100});
 await writeFile(path.join(server.root,'trace-label-connections-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
 await writeFile(path.join(server.root,'trace-label-connections.html'),'<div id="host"></div><script type="module">import {mountNativeViewer} from "./trace-label-connections-native.js";window.mount=mountNativeViewer;</script>');
 await page.goto(server.origin+'/trace-label-connections.html');await page.waitForFunction(()=>!!window.mount);
 await page.evaluate(({spec,schema,text})=>{window.viewer=window.mount(document.querySelector('#host'),spec,{telemetry:{directTrace:{describe:async()=>schema,call:async()=>({payload:text})}}});},{spec,schema,text:RECORDED});
 return page.locator('#host');
}
// Runs in the page against the viewer's shadow root: shown connection labels (position and box), trace
// label boxes, and each trace label that intersects a connection label without an opaque plate.
function labels(root){
 return root.evaluate(host=>{
  const scope=host.shadowRoot || host,hit=(a,b)=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>.5 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>.5;
  const shown=el=>{const s=getComputedStyle(el);return s.display!=='none' && s.visibility!=='hidden' && Number(s.opacity)>0;};
  const connections=Array.from(scope.querySelectorAll('text.lbl[data-dv-edge]')).filter(shown).map(el=>({text:el.textContent,x:el.getAttribute('x'),y:el.getAttribute('y'),transform:el.getAttribute('transform'),box:el.getBoundingClientRect()}));
  const traces=Array.from(scope.querySelectorAll('.dv-trace-overlay text')).map(el=>({text:el.textContent,box:el.getBoundingClientRect(),plate:!!el.parentNode.querySelector('.dv-trace-label-plate')}));
  const overlaps=[];traces.forEach(t=>connections.forEach(c=>{if(!t.plate && hit(t.box,c.box))overlaps.push('"'+t.text+'" on "'+c.text+'"');}));
  return {connections:connections.map(c=>[c.text,c.x,c.y,c.transform]),traces:traces.length,overlaps};
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
