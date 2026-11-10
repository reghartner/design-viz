// #1290 PR 2: nodes that declare trace spans are annotated from a loaded trace with the union of
// their matched spans, with no step needed: a local node and an imported node (after the consumer's
// overlay patch). Declared connections draw nothing yet (PR 3). Nothing calls the trace provider
// before the reader presses Load. Node coverage: tests/trace-carrier-spans.test.js.
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
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
// variant 'busy' adds step traceMatch rows (one on the declared Charge connection), a ticket and a
// metrics binding on that connection, for the title, size and collision checks.
function resolvedBoard(variant){
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
    steps:variant==='busy'?[{id:'place',text:'Place the order',edge:'web->checkout',traceMatch:{serviceName:'checkout',operation:'msdemo.CheckoutService/PlaceOrder'}},
      {id:'charge',text:'Charge the card',edge:'checkout->payment',traceMatch:{serviceName:'payment',operation:'grpc.msdemo.PaymentService/Charge'}}]:[{id:'charge',text:'Charge the card',edge:'checkout->payment'}],
    panels:[{id:'status',type:'live-status',title:'Status'}],
    sectionLayout:{columns:24,default:[{x:0,y:0,w:15,h:16},{controls:'steps',attachTo:'diagram',x:0,y:16,w:15,h:5},{panel:'status',x:15,y:0,w:9,h:21}]}},
    {tracking:{telemetry:{traceConnections:{company:PROFILE}}}});
  if(variant==='busy'){
    const charge=consumer.page.sections[0].diagram.edges[1];charge.tickets=['PAY-1'];
    charge.telemetry={kind:'call',signals:{rate:{grafana:'sum(rate(rpc_calls_total{service="payment"}[5m]))*3600',unit:'req/h'}}};
    consumer.page.tracking.jira={site:'https://acme.atlassian.net'};
  }
  const context=vm.createContext({URL,TextEncoder});vm.runInContext(sourceLoader.composeSources(['canon.js','validator.js']),context);
  return JSON.parse(JSON.stringify(context.FlowTopology.resolveSource(consumer,{version:1,id:'checkout-board',specs:[provider,consumer]})));
}
// In the page, from the native viewer's shadow root (or the standalone page): each node's trace label,
// the number of edge trace labels, the Trace view status and the Selected request card text.
function labels(root){
  return root.evaluate(host=>{
    const scope=host.shadowRoot || host,request=scope.querySelector('.dv-trace-request');
    const edges=Array.from(scope.querySelectorAll('.dv-trace-overlay[data-trace-edge]'));
    const out={nodes:{},edges:edges.length,edgeLabels:Object.fromEntries(edges.map(g=>[g.getAttribute('data-trace-edge'),g.querySelector('text').textContent])),status:(scope.querySelector('.dv-trace-mode-status') || {}).textContent || '',request:request?request.textContent:null};
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
  // #1290 PR 3: the declared Charge connection reads the hand-off: payment's server span starts 0.5 ms after
  // checkout's client span (825.9998 - 825.495 ms in the fixture); the payment node keeps its own time.
  expect(out.edgeLabels,'only the declared connection has a trace label').toEqual({'1':'0.5 ms'});
  expect(out.status).not.toContain('Diagram mapping is not configured');
  expect(out.request,'the Selected request card is shown').not.toBeNull();
  expect(out.request,'the Selected request card has no mapping-unavailable note').not.toContain('Diagram mapping is not configured');
  expect(await page.evaluate(()=>window.providerCalls.length)).toBeGreaterThan(0);
  const title=await root.locator('g.node[data-dv-node="platform::shipping"] .dv-trace-overlay title').textContent();
  expect(title).toMatch(/^Declared spans: ship \(process\) [\d.]+ ms; writes \(database\) [\d.]+ ms across 2 spans/);
});

test('desktop: a declarations-only board with no trace connection of its own inherits the company profile and loads on Load only',async({page,server})=>{
  const spec=resolvedBoard();delete spec.page.tracking;
  await page.setViewportSize({width:1500,height:1100});
  const calls=[];
  await page.exposeFunction('traceTools',()=>[{server:PROFILE.server,tools:[{name:schema.name,annotations:schema.annotations}]}]);
  await page.exposeFunction('traceDescribe',()=>{calls.push('describe');return schema;});
  await page.exposeFunction('tracePermission',keys=>Object.fromEntries(keys.map(k=>[k,'granted'])));
  await page.exposeFunction('traceCall',()=>{calls.push('call');return {payload:RECORDED};});
  await page.addInitScript(()=>{
    window.claude={use:async name=>name==='permissions'?{request:keys=>window.tracePermission(keys)}:{listTools:()=>window.traceTools(),describeTool:()=>window.traceDescribe(),callTool:(s,n,a)=>window.traceCall(s,n,a)}};
    window.flowviewBooted=ctl=>{window.ctl=ctl;};
  });
  const file=path.join(server.root,'trace-carrier-inherited.spec.json'),output=path.join(server.root,'trace-carrier-inherited.html');
  await writeFile(file,JSON.stringify(spec));execFileSync('python3',[path.join(repo,'tools/inject.py'),file,path.join(repo,'template/flowview.html'),output],{stdio:'pipe'});
  // The company profile is inherited (no page tracking): set the build-time company connections.
  const boot='var ctl = renderPage(view, page, bootSkin, backlinkData, renderOptions);';
  let html=await readFile(output,'utf8');expect(html).toContain(boot);
  html=html.replace(boot,'TELEMETRY_COMPANY_TRACE_CONNECTIONS='+JSON.stringify({company:PROFILE})+';\n'+boot);await writeFile(output,html);
  await page.goto(server.origin+'/trace-carrier-inherited.html');await page.waitForFunction(()=>!!window.ctl);
  const root=page.locator('body');
  await expect(root.getByRole('combobox',{name:'Connection environment',exact:true}),'company trace profile inherited').toBeVisible();
  await root.getByRole('combobox',{name:'Connection environment',exact:true}).selectOption('prod');
  await root.getByRole('textbox',{name:'Trace ID or link',exact:true}).fill(ID);
  expect(calls,'nothing calls the provider before Load').toEqual([]);
  await root.getByRole('button',{name:'Load trace',exact:true}).click();
  await expect.poll(async()=>Object.keys((await labels(root)).nodes).length,{message:'two declared nodes are annotated'}).toBe(2);
  const out=await labels(root);
  expect(out.nodes).toEqual({payment:'23.6 ms across 2 spans','platform::shipping':'182.4 ms across 3 spans'});
  expect(out.edgeLabels).toEqual({'1':'0.5 ms'});
  expect(out.status).not.toContain('Diagram mapping is not configured');
  expect(out.request).not.toBeNull();expect(out.request).not.toContain('Diagram mapping is not configured');
  expect(calls).toContain('call');
});

test('desktop: a hand-off label keeps the old step time in its title, has the edge label size, and stays clear of metrics cards and connection labels',async({page,server})=>{
  const spec=resolvedBoard('busy');
  const series=base=>Array.from({length:24},(_,k)=>[new Date(Date.now()-(23-k)*3600000).toISOString(),base]);
  const samples={'checkout->payment':{signals:{rate:{value:5200,unit:'req/h',series:series(5200)}}}};
  await page.setViewportSize({width:1440,height:1100});
  await writeFile(path.join(server.root,'trace-handoff-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
  await writeFile(path.join(server.root,'trace-handoff.html'),'<div id="host"></div><script type="module">import {mountNativeViewer} from "./trace-handoff-native.js";window.mount=mountNativeViewer;</script>');
  await page.goto(server.origin+'/trace-handoff.html');await page.waitForFunction(()=>!!window.mount);
  await page.evaluate(({spec,samples,schema,text})=>{
    window.viewer=window.mount(document.querySelector('#host'),spec,{telemetry:{provider:async()=>structuredClone(samples),canChooseExemplar:()=>false,directTrace:{describe:async()=>schema,call:async()=>({payload:text})}}});
  },{spec,samples,schema,text:RECORDED});
  const root=page.locator('#host');
  // The board has tickets, so the Status panel has a Jira | Trace switch; Jira cues are painted only outside the Trace view.
  const traceView=root.getByRole('button',{name:/^Trace( · \d+)?$/});
  await expect(traceView,'the board offers a Trace view').toBeVisible();await traceView.click();
  await root.getByRole('combobox',{name:'Connection environment',exact:true}).selectOption('prod');
  await root.getByRole('textbox',{name:'Trace ID or link',exact:true}).fill(ID);
  await root.getByRole('button',{name:'Load trace',exact:true}).click();
  await expect.poll(async()=>(await labels(root)).edgeLabels['1'],{message:'the Charge hand-off label'}).toBe('0.5 ms');
  const metrics=root.getByRole('switch',{name:'Metrics overlay',exact:true});await expect(metrics,'the connection carries a metrics binding').toBeVisible();
  if(await metrics.getAttribute('aria-checked')!=='true')await metrics.click();
  await expect(root.locator('.dv-metrics-card'),'the Charge metrics card is shown').not.toHaveCount(0);
  const found=await root.evaluate(host=>{
    const scope=host.shadowRoot,box=el=>el.getBoundingClientRect(),hit=(a,b)=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>.5 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>.5;
    const label=g=>g && g.querySelector('text'),handoff=label(scope.querySelector('.dv-trace-overlay[data-trace-edge="1"]')),step=label(scope.querySelector('.dv-trace-overlay[data-trace-edge="0"]'));
    const others=Array.from(scope.querySelectorAll('.dv-metrics-card-box,text.lbl,.dv-jira-cue')).map(el=>({cls:el.getAttribute('class'),text:el.textContent,box:box(el)}));
    return {title:handoff.parentNode.querySelector('title').textContent,size:getComputedStyle(handoff).fontSize,stepSize:step && getComputedStyle(step).fontSize,
      cards:scope.querySelectorAll('.dv-metrics-card-box').length,cues:scope.querySelectorAll('.dv-jira-cue').length,
      overlaps:others.filter(o=>hit(box(handoff),o.box)).map(o=>o.cls+' '+o.text)};
  });
  expect(found.title,'the old step time stays readable').toContain("Step charge: 23.6 ms (the receiving span's own time, as before)");
  expect(found.title).toMatch(/^Hand-off 0\.5 ms: from the start of the send span \(checkout msdemo\.PaymentService\/Charge\) to the start of the receiving span \(payment grpc\.msdemo\.PaymentService\/Charge\)\./);
  expect(found.stepSize,'the undeclared PlaceOrder connection keeps its step label').toBeTruthy();
  expect(found.size,'the hand-off label has the edge label size').toBe(found.stepSize);
  expect(found.cards).toBeGreaterThan(0);
  expect(found.cues,'Jira cues are not painted while the Trace view shows trace labels').toBe(0);
  expect(found.overlaps,'the hand-off label overlaps no metrics card, connection label or Jira cue').toEqual([]);
});
