// #1185: trace highlight levels. Every carrier of a shown trace gets #1074's marks: node corner
// brackets and an outline that follows the edge's own (curved) path. With no span focused they are
// "below"; focusing the Charge span makes its edge "current" and its ancestors' carriers "above".
// Local nodes and edges on the reported checkout board.
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {test,expect} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
const PROFILE=JSON.parse(await readFile(path.join(repo,'tests/fixtures/trace-connection-profile.json'),'utf8'));
const RECORDED=await readFile(path.join(repo,'tests/fixtures/provider-traces/honeycomb-trace.txt'),'utf8'),ID='8413cd87a9f15b6bfe8e1acf5b3346d0';
const CHARGE='2beed983172122bf';
const schema={name:'get_trace',annotations:{readOnlyHint:true,destructiveHint:false},inputSchema:{type:'object',properties:{trace_id:{type:'string'},from:{type:'string'},environment_slug:{type:'string'},team_slug:{type:'string'},view_mode:{type:'string'}},required:['trace_id','from','environment_slug','team_slug','view_mode']}};
function checkout(){
 return {nodes:{web:{title:'Checkout frontend'},checkout:{title:'Checkout service'},payment:{title:'Payment service'},cart:{title:'Cart service'},shipping:{title:'Shipping service'},email:{title:'Email service'}},
  rows:[['web','checkout','payment'],['cart','shipping','email']],
  // Curved routes: the outline must follow each edge's own path, not a straight line.
  edges:[{from:'web',to:'checkout',label:'PlaceOrder',curvePoints:[{t:.5,dx:0,dy:-40}]},{from:'checkout',to:'cart',label:'GetCart',curvePoints:[{t:.5,dx:-30,dy:30}]},
   {from:'checkout',to:'payment',label:'Charge',curvePoints:[{t:.5,dx:0,dy:40}]},{from:'checkout',to:'shipping',label:'ShipOrder'},{from:'checkout',to:'email',label:'Send confirmation'}],
  steps:[{id:'accept',text:'Accept checkout',nodes:['web'],traceMatch:{serviceName:'frontend',operation:'/cart/checkout',nodeId:'web'}},
   {id:'place',text:'Place the order',edge:'web->checkout',traceMatch:{serviceName:'checkout',operation:'msdemo.CheckoutService/PlaceOrder'}},
   {id:'cart',text:'Read the cart',edge:'checkout->cart',traceMatch:{serviceName:'cart',operation:'msdemo.CartService/GetCart'}},
   {id:'charge',text:'Charge the card',edge:'checkout->payment',traceMatch:{serviceName:'payment',operation:'grpc.msdemo.PaymentService/Charge'}},
   {id:'ship',text:'Ship the order',edge:'checkout->shipping',traceMatch:{serviceName:'shipping',operation:'msdemo.ShippingService/ShipOrder'}},
   {id:'quote',text:'Store the shipping quote',nodes:['shipping'],traceMatch:{serviceName:'database',operation:'INSERT shipping.quotes',nodeId:'shipping'}}],
  view:'step',autoplay:false,panels:[{id:'status',type:'live-status',title:'Status'}],
  sectionLayout:{columns:24,default:[{x:0,y:0,w:15,h:16},{controls:'steps',attachTo:'diagram',x:0,y:16,w:15,h:5},{panel:'status',x:15,y:0,w:9,h:21}]}};
}
async function setup(page,server){
 const spec={page:{title:'Checkout request path',tracking:{telemetry:{traceConnections:{company:PROFILE}}},sections:[{id:'main',heading:'Checkout',diagram:checkout()}]}};
 await page.setViewportSize({width:1440,height:1100});
 await writeFile(path.join(server.root,'trace-levels-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
 await writeFile(path.join(server.root,'trace-levels.html'),'<div id="host"></div><script type="module">import {mountNativeViewer} from "./trace-levels-native.js";window.mount=mountNativeViewer;</script>');
 await page.goto(server.origin+'/trace-levels.html');await page.waitForFunction(()=>!!window.mount);
 await page.evaluate(({spec,schema,text})=>{window.viewer=window.mount(document.querySelector('#host'),spec,{telemetry:{directTrace:{describe:async()=>schema,call:async()=>({payload:text})}}});},{spec,schema,text:RECORDED});
 const root=page.locator('#host');
 await root.getByRole('combobox',{name:'Connection environment',exact:true}).selectOption('prod');
 await root.getByRole('textbox',{name:'Trace ID or link',exact:true}).fill(ID);await root.getByRole('button',{name:'Load trace',exact:true}).click();
 await expect(root.locator('.dv-trace-overlay text')).toHaveCount(6);
 return root;
}
// Runs in the page against the viewer's shadow root: each edge's mark level and outline geometry, each
// node's bracket level. The outline is checked by sampling it against the edge path at 24 points.
function marks(root){
 return root.evaluate(host=>{
  const scope=host.shadowRoot || host,out={edges:{},nodes:{}};
  scope.querySelectorAll('path.edge[data-dv-edge]').forEach(path=>{
   const index=path.getAttribute('data-dv-edge'),ring=path.previousElementSibling,outline=ring && ring.classList.contains('dv-trace-edge-focus') && ring.querySelector('.dv-trace-edge-outline');
   if(!outline)return;
   const n=24,length=path.getTotalLength(),drift=Math.max(...Array.from({length:n+1},(_,k)=>{const a=path.getPointAtLength(length*k/n),b=outline.getPointAtLength(outline.getTotalLength()*k/n);return Math.hypot(a.x-b.x,a.y-b.y);}));
   out.edges[index]={level:ring.getAttribute('data-trace-level'),tone:ring.getAttribute('data-trace-tone'),curved:/[CQ]/.test(path.getAttribute('d')),drift,transform:ring.getAttribute('transform')===path.getAttribute('transform')};
  });
  scope.querySelectorAll('g.node[data-dv-node]').forEach(node=>{const b=node.querySelector('.dv-trace-focus-overlay');if(b)out.nodes[node.getAttribute('data-dv-node')]=b.getAttribute('data-trace-level');});
  return out;
 });
}

test('desktop trace levels: below and above marks use #1074 brackets and outlines that follow curved edges',async({page,server},info)=>{
 const root=await setup(page,server);
 // No span focused: every carrier in the trace has the "below" marks.
 await expect.poll(async()=>Object.keys((await marks(root)).edges).length,{message:'edges 0-3 carry outlines'}).toBe(4);
 let m=await marks(root);
 for(const i of ['0','1','2','3']){expect(m.edges[i].level,'edge '+i).toBe('below');expect(m.edges[i].drift,'edge '+i+' outline follows its path').toBeLessThan(1);expect(m.edges[i].transform).toBe(true);}
 for(const i of ['0','1','2'])expect(m.edges[i].curved,'edge '+i+' is curved').toBe(true);
 expect(m.nodes).toEqual({web:'below',shipping:'below'});
 // Focus the Charge span: its edge is current; PlaceOrder and the root span are its ancestors.
 await root.locator('.dv-trace-span[data-span-id="'+CHARGE+'"]').click();
 await expect.poll(async()=>(await marks(root)).edges['2']?.level,{message:'the focused Charge edge is current'}).toBe('current');
 m=await marks(root);
 expect(m.edges['0'].level,'PlaceOrder (an ancestor) is above').toBe('above');expect(m.edges['0'].drift).toBeLessThan(1);
 expect(m.nodes.web,'the root span node is above').toBe('above');
 expect(m.edges['1'],'GetCart is another branch: no outline').toBeUndefined();expect(m.nodes.shipping,'the shipping node is another branch: no brackets').toBeUndefined();
 await info.attach('trace-levels-focused-charge',{body:await root.screenshot(),contentType:'image/png'});
});
