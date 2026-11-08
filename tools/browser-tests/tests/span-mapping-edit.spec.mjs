/* #1078 (b): board Edit mode maps a trace span to a step. Contract source: #1078 "Ask" (b)
   and its Test plan items 3 and 4. Desktop only (1440 px). The board is built two-file
   as published, window.claude is the board-edit mock that records `publish`, and
   window.flowviewTelemetry.directTrace answers Load trace with the recorded Honeycomb trace.

| row | fixture | assertion (scoped) | rejects |
|---|---|---|---|
| M1 map + save | steps accept (traceMatch), rates (edge on the imported canon::api → canon::store), charge (local edge web → pay) | Edit in the Trace view; the currency span and then the payment span each map through "Map this span to a step"; the loaded trace and focused span survive each re-render and the span then maps to its step; Save 2 → steps rates/charge carry exactly {serviceName, operation}, accept and the topology import are unchanged; history has two trace-match changes; after Save the same spans still map to those steps | writing to the import overlay or the provider; losing the trace on re-render; inexact strings |
| M2 not outside Edit mode | same board; canEdit false, then an editor before Edit and after Done | no "Map this span to a step" group for an unmapped span; the read-only viewer has no Edit | offering the mapping to readers or outside Edit mode |
Flip: drop the Trace-view Edit controls → M1 cannot start editing. */
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {test,expect} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
import {buildBoard,mockRuntime,openBoard,save,TRACKING,PANELS} from '../helpers/board-edit.mjs';

const PROFILE=JSON.parse(await readFile(path.join(repo,'tests/fixtures/trace-connection-profile.json'),'utf8'));
const RECORDED=await readFile(path.join(repo,'tests/fixtures/provider-traces/honeycomb-trace.txt'),'utf8'),ID='8413cd87a9f15b6bfe8e1acf5b3346d0';
const schema={name:'get_trace',annotations:{readOnlyHint:true,destructiveHint:false},inputSchema:{type:'object',properties:{trace_id:{type:'string'},from:{type:'string'},environment_slug:{type:'string'},team_slug:{type:'string'},view_mode:{type:'string'}},required:['trace_id','from','environment_slug','team_slug','view_mode']}};
// Span ids of the recorded trace; each (service, operation) pair occurs once in it.
const CURRENCY={id:'dcce084f04baa9e1',match:{serviceName:'currency',operation:'grpc.msdemo.CurrencyService/GetSupportedCurrencies'}};
const PAYMENT={id:'2beed983172122bf',match:{serviceName:'payment',operation:'grpc.msdemo.PaymentService/Charge'}};
const ACCEPT={serviceName:'frontend',operation:'/cart/checkout',nodeId:'web'};

function board(){
 const model=(id,d)=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},sections:[{id:'main',diagram:d}]}});
 const provider=model('provider',{nodes:{api:{title:'Currency API'},store:{title:'Rates store'}},rows:[['api','store']],edges:[{from:'api',to:'store',label:'Read rates'}],topologyExports:{core:{nodes:['api','store'],edges:['api->store']}}});
 const consumer=model('consumer',{nodes:{web:{title:'Checkout frontend',tickets:['AA-1']},pay:{title:'Payment service'}},rows:[['web','pay']],edges:[{from:'web',to:'pay',label:'Charge'}],
  topologyImports:[{spec:'provider',export:'core',as:'canon',position:{x:80,y:250}}],panels:structuredClone(PANELS),view:'step',autoplay:false,
  steps:[{id:'accept',text:'Accept checkout',nodes:['web'],traceMatch:structuredClone(ACCEPT)},
   {id:'rates',text:'Resolve supported currencies',edge:'canon::api->canon::store'},
   {id:'charge',text:'Charge the card',edge:'web->pay'}]});
 consumer.page.tracking={...structuredClone(TRACKING),telemetry:{traceConnections:{company:PROFILE}}};
 return {consumer,context:{version:1,id:'consumer',specs:[provider,consumer]}};
}
async function open(page,server,name,runtime={}){
 const {consumer,context}=board(),built=await buildBoard(server,name,consumer,{topology:context});
 await mockRuntime(page,runtime);
 await page.addInitScript(({schema,text})=>{
  window.flowviewTelemetry={directTrace:{describe:async()=>schema,call:async()=>({payload:text})}};
  window.flowviewBooted=ctl=>{window.boardCtl=ctl;};
 },{schema,text:RECORDED});
 const {root,panel}=await openBoard(page,built);
 await panel.getByRole('button',{name:'Trace',exact:true}).click();
 await panel.getByRole('combobox',{name:'Connection environment',exact:true}).selectOption('prod');
 await panel.getByRole('textbox',{name:'Trace ID or link',exact:true}).fill(ID);
 await panel.getByRole('button',{name:'Load trace',exact:true}).click();
 await expect(panel.locator('.dv-trace-span[data-span-id="'+CURRENCY.id+'"]')).toBeVisible();
 return {consumer,root,panel};
}
const span=(panel,item)=>panel.locator('.dv-trace-span[data-span-id="'+item.id+'"]');
const mapper=panel=>panel.getByRole('group',{name:'Map this span to a step',exact:true});
const status=panel=>panel.locator('.dv-trace-focus-status');
const currentStep=page=>page.evaluate(()=>window.boardCtl.sections[0].stepper.current().id);
async function expectMapped(page,panel,item,label,step){
 await expect(span(panel,item)).toHaveAttribute('aria-pressed','true');
 await expect(status(panel)).toContainText(label);
 await expect.poll(()=>currentStep(page)).toBe(step);
 await expect(mapper(panel)).toHaveCount(0);
}

test('M1 desktop Edit mode maps spans to a step on an imported edge and a local step; Save writes exact traceMatch and the spans map',async({page,server})=>{
 const {consumer,root,panel}=await open(page,server,'span-mapping');
 await span(panel,CURRENCY).click();
 await expect(status(panel)).toContainText('No authored step maps this span.');
 await expect(mapper(panel)).toHaveCount(0);
 await panel.getByRole('button',{name:'Edit',exact:true}).click();
 const pick=mapper(panel).getByRole('combobox',{name:'Step to map',exact:true});
 await expect(pick.locator('option')).toHaveText(['Step 2: Resolve supported currencies','Step 3: Charge the card']);
 await pick.selectOption('rates');
 await mapper(panel).getByRole('button',{name:'Map this span to a step',exact:true}).click();
 // The board re-renders from the edited text; the loaded trace and focused span carry over and now map.
 await expectMapped(page,panel,CURRENCY,'Step 2: Resolve supported currencies','rates');
 await expect(panel.getByRole('button',{name:'Save 1 change',exact:true})).toBeVisible();

 await span(panel,PAYMENT).click();
 await expect(pick.locator('option')).toHaveText(['Step 3: Charge the card']);
 await mapper(panel).getByRole('button',{name:'Map this span to a step',exact:true}).click();
 await expectMapped(page,panel,PAYMENT,'Step 3: Charge the card','charge');

 const saved=JSON.parse(await save(page,panel,2)),d=saved.page.sections[0].diagram,steps=Object.fromEntries(d.steps.map(step=>[step.id,step]));
 expect(steps.rates.traceMatch).toEqual(CURRENCY.match);expect(steps.charge.traceMatch).toEqual(PAYMENT.match);expect(steps.accept.traceMatch).toEqual(ACCEPT);
 expect(d.topologyImports).toEqual(consumer.page.sections[0].diagram.topologyImports);
 const at=index=>['page','sections',0,'diagram','steps',index];
 expect(saved.page.editHistory).toHaveLength(1);
 expect(saved.page.editHistory[0].changes).toEqual([
  {op:'trace-match',path:at(1),label:'Resolve supported currencies',step:'rates',traceMatch:CURRENCY.match},
  {op:'trace-match',path:at(2),label:'Charge the card',step:'charge',traceMatch:PAYMENT.match}]);
 await expect(root.locator('.dv-edit-first').first()).toHaveText('currency · grpc.msdemo.CurrencyService/GetSupportedCurrencies mapped to step Resolve supported currencies');

 // After Save the board renders the saved text: the same spans map to those steps, and Edit mode is over.
 await expect(panel.getByRole('button',{name:/^Save \d+ change/})).toHaveCount(0);
 await expectMapped(page,panel,PAYMENT,'Step 3: Charge the card','charge');
 await span(panel,CURRENCY).click();
 await expectMapped(page,panel,CURRENCY,'Step 2: Resolve supported currencies','rates');
});

test('M2 desktop "Map this span to a step" is offered only in Edit mode',async({page,server})=>{
 const {panel}=await open(page,server,'span-mapping-editor');
 await span(panel,CURRENCY).click();
 await expect(status(panel)).toContainText('No authored step maps this span.');
 await expect(mapper(panel)).toHaveCount(0);
 await panel.getByRole('button',{name:'Edit',exact:true}).click();
 await expect(mapper(panel)).toBeVisible();
 await panel.getByRole('button',{name:'Done',exact:true}).click();
 await expect(mapper(panel)).toHaveCount(0);
 await expect(panel.getByRole('button',{name:'Edit',exact:true})).toBeVisible();
});

test('M2 desktop a reader without edit access is not offered "Map this span to a step"',async({page,server})=>{
 const {panel}=await open(page,server,'span-mapping-reader',{canEdit:false});
 await span(panel,CURRENCY).click();
 await expect(status(panel)).toContainText('No authored step maps this span.');
 await expect(mapper(panel)).toHaveCount(0);
 await expect(panel.getByRole('button',{name:'Edit',exact:true})).toHaveCount(0);
});
