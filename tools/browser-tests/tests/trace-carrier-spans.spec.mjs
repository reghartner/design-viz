// #1290 PR 2: nodes that declare trace spans are annotated from a loaded trace with the union of
// their matched spans, with no step needed: a local node and an imported node (after the consumer's
// overlay patch). Declared connections draw nothing yet (PR 3). Nothing calls the trace provider
// before the reader presses Load. Node coverage: tests/trace-carrier-spans.test.js.
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import sourceLoader from '../../../tools/source-loader.cjs';
import {test,expect} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
const PROFILE=JSON.parse(await readFile(path.join(repo,'tests/fixtures/trace-connection-profile.json'),'utf8'));
const ID='8413cd87a9f15b6bfe8e1acf5b3346d0';
const RECORDED=await readFile(path.join(repo,'tests/fixtures/provider-traces/honeycomb-trace.txt'),'utf8');
const schema={name:'get_trace',annotations:{readOnlyHint:true,destructiveHint:false},inputSchema:{type:'object',properties:{trace_id:{type:'string'},from:{type:'string'},environment_slug:{type:'string'},team_slug:{type:'string'},view_mode:{type:'string'}},required:['trace_id','from','environment_slug','team_slug']}};
const canon=(id,diagram,page={})=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},...page,sections:[{id:'main',heading:'Checkout',diagram}]}});
// The provider declares the shipping node's spans; the consumer narrows `ship` to ShipOrder only.
function resolvedBoard(){
  const provider=canon('platform',{nodes:{shipping:{title:'Shipping service',trace:{spans:{
    ship:{serviceName:'shipping',operationPrefix:'msdemo.ShippingService/',role:'process'},
    writes:{serviceName:'database',operationPrefix:'INSERT shipping.',role:'database'}}}}},rows:[['shipping']],topologyExports:{core:{nodes:['shipping'],edges:[]}}});
  const consumer=canon('checkout-board',{view:'step',autoplay:false,
    nodes:{web:{title:'Checkout frontend'},checkout:{title:'Checkout service'},payment:{title:'Payment service',trace:{spans:{
      process:{serviceName:'payment',operation:'grpc.msdemo.PaymentService/Charge',role:'process'},
      charges:{serviceName:'database',operation:'INSERT payment.charges',role:'database'}}}}},
    rows:[['web','checkout','payment']],
    edges:[{from:'web',to:'checkout',label:'PlaceOrder'},
      {from:'checkout',to:'payment',label:'Charge',trace:{spans:{send:{serviceName:'checkout',operation:'msdemo.PaymentService/Charge',role:'send'}}}},
      {from:'checkout',to:'platform::shipping',label:'ShipOrder'}],
    topologyImports:[{spec:'platform',export:'core',as:'platform',position:{x:80,y:260},nodeTracking:{shipping:{trace:{spans:{ship:{operation:'msdemo.ShippingService/ShipOrder'}}}}}}],
    steps:[{id:'charge',text:'Charge the card',edge:'checkout->payment'}],
    panels:[{id:'status',type:'live-status',title:'Status'}],
    sectionLayout:{columns:24,default:[{x:0,y:0,w:15,h:16},{controls:'steps',attachTo:'diagram',x:0,y:16,w:15,h:5},{panel:'status',x:15,y:0,w:9,h:21}]}},
    {tracking:{telemetry:{traceConnections:{company:PROFILE}}}});
  const context=vm.createContext({URL,TextEncoder});vm.runInContext(sourceLoader.composeSources(['canon.js','validator.js']),context);
  return JSON.parse(JSON.stringify(context.FlowTopology.resolveSource(consumer,{version:1,id:'checkout-board',specs:[provider,consumer]})));
}
// In the page, from the viewer's shadow root: each node's trace label and every edge trace label.
function labels(root){
  return root.evaluate(host=>{
    const scope=host.shadowRoot,out={nodes:{},edges:scope.querySelectorAll('.dv-trace-overlay[data-trace-edge]').length,status:(scope.querySelector('.dv-trace-mode-status') || {}).textContent || ''};
    scope.querySelectorAll('g.node[data-dv-node]').forEach(node=>{const text=node.querySelector('.dv-trace-overlay text');if(text)out.nodes[node.getAttribute('data-dv-node')]=text.textContent;});
    return out;
  });
}

test('desktop: declared local and imported nodes show their span time from a loaded trace; declared connections draw nothing yet',async({page,server})=>{
  const spec=resolvedBoard();
  await page.setViewportSize({width:1440,height:1100});
  await writeFile(path.join(server.root,'trace-carrier-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
  await writeFile(path.join(server.root,'trace-carrier.html'),'<div id="host"></div><script type="module">import {mountNativeViewer} from "./trace-carrier-native.js";window.mount=mountNativeViewer;</script>');
  await page.goto(server.origin+'/trace-carrier.html');await page.waitForFunction(()=>!!window.mount);
  await page.evaluate(({spec,schema,text})=>{
    window.providerCalls=[];
    window.viewer=window.mount(document.querySelector('#host'),spec,{telemetry:{directTrace:{
      describe:async()=>{window.providerCalls.push('describe');return schema;},call:async()=>{window.providerCalls.push('call');return {payload:text};}}}});
  },{spec,schema,text:RECORDED});
  const root=page.locator('#host');
  await root.getByRole('combobox',{name:'Connection environment',exact:true}).selectOption('prod');
  await root.getByRole('textbox',{name:'Trace ID or link',exact:true}).fill(ID);
  // The Load trace control and its connection checks call no provider before Load.
  expect(await page.evaluate(()=>window.providerCalls)).toEqual([]);
  await root.getByRole('button',{name:'Load trace',exact:true}).click();
  await expect.poll(async()=>Object.keys((await labels(root)).nodes).length,{message:'two declared nodes are annotated'}).toBe(2);
  const out=await labels(root);
  expect(out.nodes).toEqual({payment:'23.6 ms across 2 spans','platform::shipping':'182.4 ms across 3 spans'});
  expect(out.edges,'a declared connection has no trace label in this PR').toBe(0);
  expect(out.status).not.toContain('Diagram mapping is not configured');
  expect(await page.evaluate(()=>window.providerCalls.length)).toBeGreaterThan(0);
  const title=await root.locator('g.node[data-dv-node="platform::shipping"] .dv-trace-overlay title').textContent();
  expect(title).toMatch(/^Declared spans: ship \(process\) [\d.]+ ms; writes \(database\) [\d.]+ ms across 2 spans/);
});
