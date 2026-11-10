/* #1238 test plan items 1-3: the desktop Workbench step Inspect edits a step's
   traceMatch with a form (Code and trace evidence → Trace match) instead of the
   raw "Trace match JSON" box. The consumer imports provider nodes, so the Node
   list and the written nodeId cover imported nodes. Item 4 is
   tests/step-trace-match-form.test.js. */
import {test,expect,closeTools} from '../helpers/test.mjs';
import {digest} from '../../canon/drift.mjs';

const source=async page=>JSON.parse(await page.locator('#src').inputValue());
const step=(raw,i=1)=>raw.page.sections[0].diagram.steps[i];
const JSON_ONLY={maxDurationMs:250,parentStepId:'request',role:'database'};
async function open(page,server,persist){
  await page.setViewportSize({width:1440,height:1000});
  const model=(id,d)=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},sections:[{id:'main',diagram:d}]}});
  const provider=model('provider',{nodes:{api:{title:'API'},store:{title:'Store'}},rows:[['api','store']],edges:[{from:'api',to:'store',label:'Persist'}],topologyExports:{core:{nodes:['api','store'],edges:['api->store']}}});
  const steps=[{id:'request',text:'Request',nodes:['local'],traceMatch:{serviceName:'gateway',operation:'POST /orders'}},Object.assign({id:'persist',text:'Persist the order',nodes:['canon::store']},persist)];
  const consumer=model('consumer',{autoplay:false,nodes:{local:{title:'Local worker'}},rows:[['local']],topologyImports:[{spec:'provider',export:'core',as:'canon'}],steps});
  const catalog={version:3,diagrams:[provider,consumer].map(spec=>({id:spec.page.canon.id,title:spec.page.title,canon:spec.page.canon,counts:{nodes:2,steps:0,panels:0},revision:digest(spec),specUrl:spec.page.canon.id+'.json'}))};
  await page.route('**/diagrams.json',route=>route.fulfill({json:catalog}));
  for(const spec of [provider,consumer])await page.route('**/'+spec.page.canon.id+'.json',route=>route.fulfill({json:spec}));
  await page.goto(server.origin+'/workbench.html');
  await page.locator('#welcome-file').setInputFiles({name:'consumer.spec.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(consumer,null,2))});
  await expect(page.locator('#docview g.node[data-dv-node="canon::api"]')).toBeVisible();await closeTools(page);
}
/* Opens the second step in Inspect and its Code and trace evidence fold. */
async function inspectStep(page){
  await page.locator('#editor-tab-steps').click();await page.locator('#steps-list [data-step-index="1"]').click();await page.locator('#editor-tab-inspect').click();
  const fold=page.locator('#guide details').filter({has:page.locator('summary',{hasText:'Code and trace evidence'})}).first();
  if(!await fold.evaluate(el=>el.open))await fold.locator('summary').first().click();
  const form=page.locator('#guide fieldset.trace-match-editor');await expect(form).toBeVisible();
  return form;
}
// By accessible name: inputs with a datalist of attribute names are comboboxes, not textboxes.
const field=(form,name)=>form.getByLabel(name,{exact:true});

test('1: service name and operation write traceMatch from the form; Undo restores',async({page,server})=>{
  await open(page,server,{});
  let form=await inspectStep(page);
  await expect(page.locator('#guide').getByText('Trace match JSON',{exact:true})).toHaveCount(0);
  const original=await page.locator('#src').inputValue();
  expect(step(await source(page)).traceMatch).toBeUndefined();
  // Keyboard path: type the service name, Tab to the operation, Enter adds the match.
  await field(form,'new trace match service name').fill('orders-db');
  await page.keyboard.press('Tab');await expect(field(form,'new trace match operation')).toBeFocused();
  await page.keyboard.type('INSERT orders');await page.keyboard.press('Enter');
  await expect.poll(async()=>step(await source(page)).traceMatch).toEqual({serviceName:'orders-db',operation:'INSERT orders'});
  const created=await page.locator('#src').inputValue();
  form=await inspectStep(page);
  await field(form,'service name').fill('orders-db-v2');await field(form,'service name').press('Enter');
  await expect.poll(async()=>step(await source(page)).traceMatch).toEqual({serviceName:'orders-db-v2',operation:'INSERT orders'});
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(created);
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);
  expect(step(await source(page)).traceMatch).toBeUndefined();
  await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(created);
});

test('2: Add alternative makes the alternatives array; removing one returns the single object',async({page,server})=>{
  await open(page,server,{traceMatch:{serviceName:'orders-db',operation:'INSERT orders'}});
  let form=await inspectStep(page);
  await form.getByRole('button',{name:'Add alternative',exact:true}).click();
  await expect.poll(async()=>step(await source(page)).traceMatch).toEqual([{serviceName:'orders-db',operation:'INSERT orders'},{serviceName:'orders-db',operation:'INSERT orders'}]);
  form=await inspectStep(page);
  await expect(form.locator('fieldset.trace-match-alternative')).toHaveCount(2);
  await field(form,'Alternative 2 operation').fill('INSERT order_rows');await field(form,'Alternative 2 operation').press('Enter');
  await expect.poll(async()=>step(await source(page)).traceMatch).toEqual([{serviceName:'orders-db',operation:'INSERT orders'},{serviceName:'orders-db',operation:'INSERT order_rows'}]);
  form=await inspectStep(page);
  await form.getByRole('button',{name:'Remove alternative 1',exact:true}).click();
  await expect.poll(async()=>step(await source(page)).traceMatch).toEqual({serviceName:'orders-db',operation:'INSERT order_rows'});
  form=await inspectStep(page);
  await expect(form.locator('fieldset.trace-match-alternative')).toHaveCount(0);
  await expect(field(form,'service name')).toHaveValue('orders-db');
});

test('3: an attribute row writes attributes.<key>; JSON-only fields survive form edits; the Node list writes imported nodes',async({page,server})=>{
  await open(page,server,{traceMatch:{serviceName:'orders-db',operation:'INSERT orders',...JSON_ONLY}});
  let form=await inspectStep(page);
  // Advanced (JSON) starts closed; its summary opens it.
  await expect(form.getByRole('textbox',{name:'advanced JSON',exact:true})).toBeHidden();
  await form.locator('details.trace-match-advanced > summary').click();
  await expect(form.getByRole('textbox',{name:'advanced JSON',exact:true})).toHaveValue(JSON.stringify(JSON_ONLY,null,2));
  await field(form,'new attribute name').fill('deployment.environment.name');
  await field(form,'new attribute value').fill('prod');await field(form,'new attribute value').press('Enter');
  await expect.poll(async()=>step(await source(page)).traceMatch.attributes).toEqual({'deployment.environment.name':'prod'});
  form=await inspectStep(page);
  await expect(field(form,'attribute 1 name')).toHaveValue('deployment.environment.name');
  await field(form,'attribute 1 value').fill('staging');await field(form,'attribute 1 value').press('Enter');
  await expect.poll(async()=>step(await source(page)).traceMatch.attributes).toEqual({'deployment.environment.name':'staging'});
  form=await inspectStep(page);
  const node=form.getByRole('combobox',{name:'node',exact:true});
  await expect(node.locator('option[value="canon::store"]')).toHaveText('Store · canon::store');
  await node.selectOption('canon::store');
  await expect.poll(async()=>step(await source(page)).traceMatch.nodeId).toBe('canon::store');
  form=await inspectStep(page);
  await field(form,'operation').fill('INSERT order_rows');await field(form,'operation').press('Enter');
  await expect.poll(async()=>step(await source(page)).traceMatch.operation).toBe('INSERT order_rows');
  const match=step(await source(page)).traceMatch;
  expect(match).toEqual({serviceName:'orders-db',operation:'INSERT order_rows',...JSON_ONLY,attributes:{'deployment.environment.name':'staging'},nodeId:'canon::store'});
  for(const key of Object.keys(JSON_ONLY))expect(match[key]).toEqual(JSON_ONLY[key]);
  // The first step and the import are untouched.
  const raw=await source(page);
  expect(step(raw,0).traceMatch).toEqual({serviceName:'gateway',operation:'POST /orders'});
  expect(raw.page.sections[0].diagram.topologyImports).toEqual([{spec:'provider',export:'core',as:'canon'}]);
});
