// #1163: with the Metrics overlay on and a trace loaded, no metric card covers a
// node or edge trace label. Trace labels are painted first and the cards are
// placed clear of them; the labels themselves never move for cards. Local and
// imported (topology import) nodes and edges.
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
// The board from the Nov 9 report (N12): the Shipping service label sat under the PlaceOrder and Charge cards.
function checkout(){
 return {nodes:{web:{title:'Checkout frontend'},checkout:{title:'Checkout service'},payment:{title:'Payment service'},cart:{title:'Cart service'},shipping:{title:'Shipping service'},email:{title:'Email service'}},
  rows:[['web','checkout','payment'],['cart','shipping','email']],
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
async function setup(page,server,{origin,exemplar}){
 const prefix=origin==='imported'?'shop::':'',key=(a,b)=>prefix+a+'->'+prefix+b,now=new Date().toISOString();
 const spec={page:{title:'Checkout request path',tracking:{telemetry:{traceConnections:{company:PROFILE}}},sections:[{id:'main',heading:'Checkout',diagram:origin==='imported'?imported():checkout()}]}};
 const series=base=>Array.from({length:24},(_,k)=>[new Date(Date.now()-(23-k)*3600000).toISOString(),Math.round(base*(1+.15*Math.sin(k/3)))]);
 const signals=(rate,errors,p95)=>({rate:{value:rate,unit:'req/h',series:series(rate)},errors:{value:errors,unit:'req/h',series:series(errors)},p95:{value:p95,unit:'ms',series:series(p95)}});
 const samples={[key('web','checkout')]:{signals:signals(5500,12,4447)},[key('checkout','cart')]:{signals:signals(5400,3,41)},[key('checkout','payment')]:{signals:signals(5200,140,262)}};
 // The trace is the PlaceOrder example, as on the reported board. It is selected after the cards first appear
 // (automatically, or by the reader's pick when examples wait for one, #1168); on main the cards were then placed before its labels existed.
 if(exemplar)samples[key('web','checkout')].exemplars=[{...await recordedUrlEvidence(),observedAt:now,range:{from:new Date(Date.now()-86400000).toISOString(),to:now}}];
 await page.setViewportSize({width:1440,height:1100});
 await writeFile(path.join(server.root,'trace-label-cards-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
 await writeFile(path.join(server.root,'trace-label-cards.html'),'<div id="host"></div><script type="module">import {mountNativeViewer} from "./trace-label-cards-native.js";window.mount=mountNativeViewer;</script>');
 await page.goto(server.origin+'/trace-label-cards.html');await page.waitForFunction(()=>!!window.mount);
 await page.evaluate(({spec,samples,schema,text})=>{
  window.viewer=window.mount(document.querySelector('#host'),spec,{telemetry:{provider:async()=>structuredClone(samples),canChooseExemplar:()=>false,directTrace:{describe:async()=>schema,call:async()=>({payload:text})}}});
 },{spec,samples,schema,text:RECORDED});
 const root=page.locator('#host');await expect(root.getByRole('switch',{name:'Metrics overlay',exact:true})).toBeVisible();
 return root;
}
const metric=root=>root.getByRole('switch',{name:'Metrics overlay',exact:true});
// Select the example trace: keep an automatic selection, otherwise pick entries[0] as a reader does (#1168).
async function pickExample(root){
 const page=root.page(),trace=()=>page.evaluate(()=>{const t=window.viewer.controller.liveStatus.snapshot().trace;return {entries:t.entries.length,selected:!!t.selected,id:t.entries[0] && t.entries[0].exemplar.traceId};});
 await expect.poll(async()=>(await trace()).entries).toBeGreaterThan(0);
 const state=await trace();if(!state.selected)await root.locator('.dv-trace-candidate[data-trace-id="'+state.id+'"]').first().click();
 await expect(root.locator('.dv-trace-selected')).toBeVisible();
}
const LABELS='.dv-trace-overlay text',CARDS='.dv-metrics-card';
// Screen boxes of every trace label, metric card and node card. Lists each label a card
// covers, each label a card leader line runs through, each node card a metric card
// covers, and each card outside the board frame.
function problems(root){
 return root.evaluate(host=>{
  const box=el=>el.getBoundingClientRect(),hit=(a,b)=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>.5 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>.5;
  const cards=Array.from(host.querySelectorAll('.dv-metrics-card')).map(card=>({id:card.getAttribute('data-metrics-card'),box:box(card.querySelector('.dv-metrics-card-box')),svg:box(card.closest('svg'))}));
  const out=[];
  host.querySelectorAll('.dv-trace-overlay text').forEach(text=>cards.forEach(card=>{if(hit(box(text),card.box))out.push('label "'+text.textContent+'" under card '+card.id);}));
  const labels=Array.from(host.querySelectorAll('.dv-trace-overlay text')).map(text=>({text:text.textContent,box:box(text)}));
  host.querySelectorAll('.dv-metrics-leader').forEach(path=>{
   const length=path.getTotalLength(),m=path.getScreenCTM();if(!length || !m)return;
   for(let k=0;k<=60;k++){
    const p=path.getPointAtLength(length*k/60),x=m.a*p.x+m.c*p.y+m.e,y=m.b*p.x+m.d*p.y+m.f;
    const under=labels.find(l=>x>l.box.left+1 && x<l.box.right-1 && y>l.box.top+1 && y<l.box.bottom-1);
    if(under){out.push('leader '+path.getAttribute('data-dv-edge')+' through label "'+under.text+'"');break;}
   }
  });
  host.querySelectorAll('g.node .card').forEach(node=>cards.forEach(card=>{if(hit(box(node),card.box))out.push('node '+node.closest('g.node').getAttribute('data-dv-node')+' under card '+card.id);}));
  cards.forEach(card=>{const b=card.box,f=card.svg;if(b.left<f.left-.5 || b.right>f.right+.5 || b.top<f.top-.5 || b.bottom>f.bottom+.5)out.push('card '+card.id+' outside the board frame');});
  return out;
 });
}
// Label anchors in SVG user units (text x/y attributes), keyed by text, and whether the
// label sits within 6 units of the board frame (where telemetryTraceConstrainLabel clamps it).
function anchors(root){return root.evaluate(host=>Array.from(host.querySelectorAll('.dv-trace-overlay text')).map(t=>{
 const svg=t.closest('svg'),vb=svg.viewBox.baseVal,b=t.getBBox(),m=svg.getCTM().inverse().multiply(t.getCTM());
 const xs=[],ys=[];[[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]].forEach(([x,y])=>{xs.push(m.a*x+m.c*y+m.e);ys.push(m.b*x+m.d*y+m.f);});
 const edge=Math.min(...xs)<vb.x+6 || Math.max(...xs)>vb.x+vb.width-6 || Math.min(...ys)<vb.y+6 || Math.max(...ys)>vb.y+vb.height-6;
 return [t.textContent,Number(t.getAttribute('x')),Number(t.getAttribute('y')),edge];
}));}

for(const origin of ['local','imported']){
 test(`desktop ${origin} metric cards never cover a node or edge trace label`,async({page,server})=>{
  const root=await setup(page,server,{origin,exemplar:true});
  await metric(root).click();await expect(metric(root)).toHaveAttribute('aria-checked','true');
  await pickExample(root);await expect(root.locator(CARDS)).toHaveCount(3);await expect(root.locator(LABELS)).toHaveCount(6);
  await expect(root.locator(LABELS).filter({hasText:'Matched: database INSERT shipping.quotes'})).toHaveCount(1);
  await expect.poll(()=>problems(root),{message:'No metric card covers a trace label or a node card, and every card is inside the board frame'}).toEqual([]);
 });
 test(`desktop ${origin} trace labels keep their places when the Metrics overlay turns on and off`,async({page,server})=>{
  const root=await setup(page,server,{origin,exemplar:false});
  await root.getByRole('combobox',{name:'Connection environment',exact:true}).selectOption('prod');
  await root.getByRole('textbox',{name:'Trace ID or link',exact:true}).fill(ID);await root.getByRole('button',{name:'Load trace',exact:true}).click();
  await expect(root.locator(LABELS)).toHaveCount(6);await expect(root.locator(CARDS)).toHaveCount(0);const first=await anchors(root);
  // First overlay-on: no card covers a label, and labels do not move for the cards. The cards grow the
  // frame, and the frame keeps that size. Only a label the smaller overlay-off frame had clamped at its
  // edge may move (on the imported board the Shipping label went from y 65.8 to 74, as on main).
  await metric(root).click();await expect(root.locator(CARDS)).toHaveCount(3);await expect(root.locator(LABELS)).toHaveCount(6);
  await expect.poll(()=>problems(root)).toEqual([]);
  const grown=await anchors(root);expect(grown.map(a=>a[0])).toEqual(first.map(a=>a[0]));
  grown.forEach(([text,x,y],i)=>{if(first[i][3])return;expect(Math.abs(x-first[i][1]),text+' x').toBeLessThanOrEqual(2);expect(Math.abs(y-first[i][2]),text+' y').toBeLessThanOrEqual(2);});
  await metric(root).click();await expect(root.locator(CARDS)).toHaveCount(0);
  await expect(root.locator(LABELS)).toHaveCount(6);const off=await anchors(root);
  await metric(root).click();await expect(root.locator(CARDS)).toHaveCount(3);await expect(root.locator(LABELS)).toHaveCount(6);
  await expect.poll(()=>problems(root)).toEqual([]);
  const on=await anchors(root);expect(on.map(a=>a[0])).toEqual(off.map(a=>a[0]));
  // Cards move; labels do not. Edge labels follow font metrics by about a unit between overlay states, as before #1163.
  on.forEach(([text,x,y],i)=>{expect(Math.abs(x-off[i][1]),text+' x').toBeLessThanOrEqual(2);expect(Math.abs(y-off[i][2]),text+' y').toBeLessThanOrEqual(2);});
 });
}
