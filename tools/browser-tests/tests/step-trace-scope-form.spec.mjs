/* #1290 PR 7 desktop Workbench: a step's trace scope form (Inspect → step → Code and trace
   evidence). Node coverage: tests/step-trace-scope-form.test.js.
| row | rule |
|---|---|
| B1 | A step on an imported node shared with another step names both by title; Add trace scope, unchecking a span, and the Time budget are one Undo step each; the controls are at least 24px tall. |
| B2 | The mode radios change only the view; "Use its nodes and connections (removes this step's trace match)" replaces the trace match in one Undo step. |
Steps are opened from the Steps list, as in step-trace-match-form.spec.mjs (a step has no canvas
element to hand to inspectPageElement); tool windows are closed first so nothing covers the list.
*/
import {test,expect,closeTools} from '../helpers/test.mjs';
import {digest} from '../../canon/drift.mjs';

const source=async page=>JSON.parse(await page.locator('#src').inputValue());
const step=(raw,i)=>raw.page.sections[0].diagram.steps[i];
async function open(page,server){
  await page.setViewportSize({width:1440,height:1000});
  const model=(id,d)=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},sections:[{id:'main',diagram:d}]}});
  const provider=model('provider',{nodes:{store:{title:'Store',trace:{spans:{write:{serviceName:'store-svc',operation:'INSERT orders',role:'database'},read:{serviceName:'store-svc',operationPrefix:'SELECT ',role:'database'}}}}},
    rows:[['store']],topologyExports:{core:{nodes:['store'],edges:[]}}});
  const steps=[{id:'request',text:'Request',nodes:['local'],traceMatch:{serviceName:'gateway',operation:'POST /orders'}},
    {id:'persist',text:'Persist',nodes:['canon::store']},{id:'again',text:'Persist again',nodes:['canon::store']}];
  const consumer=model('consumer',{autoplay:false,nodes:{local:{title:'Local worker',trace:{spans:{handle:{serviceName:'gateway',operation:'POST /orders',role:'process'}}}}},rows:[['local']],
    topologyImports:[{spec:'provider',export:'core',as:'canon'}],steps});
  const catalog={version:3,diagrams:[provider,consumer].map(spec=>({id:spec.page.canon.id,title:spec.page.title,canon:spec.page.canon,counts:{nodes:1,steps:0,panels:0},revision:digest(spec),specUrl:spec.page.canon.id+'.json'}))};
  await page.route('**/diagrams.json',route=>route.fulfill({json:catalog}));
  for(const spec of [provider,consumer])await page.route('**/'+spec.page.canon.id+'.json',route=>route.fulfill({json:spec}));
  await page.goto(server.origin+'/workbench.html');
  await page.locator('#welcome-file').setInputFiles({name:'consumer.spec.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(consumer,null,2))});
  await expect(page.locator('#docview g.node[data-dv-node="canon::store"]')).toBeVisible();await closeTools(page);
}
/* Opens step `index` in Inspect and its Code and trace evidence fold. */
async function inspectStep(page,index){
  await closeTools(page);
  await page.locator('#editor-tab-steps').click();await page.locator('#steps-list [data-step-index="'+index+'"]').click();
  if(!await page.locator('#workspace-window-inspect').isVisible())await page.locator('#editor-tab-inspect').click();
  const fold=page.locator('#guide details').filter({has:page.locator('summary',{hasText:'Code and trace evidence'})}).first();
  if(!await fold.evaluate(el=>el.open))await fold.locator('summary').first().click();
  return fold;
}
const SCOPE='From its nodes and connections (trace scope)';

test('B1 desktop: a step on a shared imported node; Add trace scope, a skip and the budget are one Undo step each',async({page,server})=>{
  await open(page,server);
  let fold=await inspectStep(page,1);
  await expect(fold.locator('.trace-scope-status')).toHaveText('Inherits nothing: Store is also lit by step “Persist again”; add a trace scope to choose its spans.');
  const original=await page.locator('#src').inputValue();
  await fold.getByRole('button',{name:'Add trace scope',exact:true}).click();
  await expect.poll(async()=>step(await source(page),1).traceScope).toEqual({});
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);
  await page.locator('#redo-builder').click();await expect.poll(async()=>step(await source(page),1).traceScope).toEqual({});
  fold=await inspectStep(page,1);
  const read=fold.getByLabel('read on Store counts for this step',{exact:true});
  await expect(read).toBeChecked();
  const row=await fold.locator('.trace-scope-span-row').first().boundingBox();expect(row.height,'a span row is at least 24px tall').toBeGreaterThanOrEqual(24);
  await read.uncheck();
  await expect.poll(async()=>step(await source(page),1).traceScope).toEqual({skip:{'canon::store':['read']}});
  await expect(fold.locator('.trace-scope-status')).toHaveText('Inherits from Store (1 of 2 spans).');
  await page.locator('#undo-builder').click();await expect.poll(async()=>step(await source(page),1).traceScope).toEqual({});
  fold=await inspectStep(page,1);
  const budget=fold.getByLabel('Time budget (ms)',{exact:true});
  await budget.fill('250');await budget.press('Enter');
  await expect.poll(async()=>step(await source(page),1).traceScope).toEqual({maxDurationMs:250});
  await page.locator('#undo-builder').click();await expect.poll(async()=>step(await source(page),1).traceScope).toEqual({});
});

test('B2 desktop: the mode radios change the view; replacing the trace match is one Undo step',async({page,server})=>{
  await open(page,server);
  let fold=await inspectStep(page,0);
  const original=await page.locator('#src').inputValue();
  await fold.getByLabel(SCOPE,{exact:true}).check();
  await expect(page.locator('#src')).toHaveValue(original);
  fold=page.locator('#guide details').filter({has:page.locator('summary',{hasText:'Code and trace evidence'})}).first();
  await fold.getByRole('button',{name:'Use its nodes and connections (removes this step\'s trace match)',exact:true}).click();
  await expect.poll(async()=>step(await source(page),0)).toEqual({id:'request',text:'Request',nodes:['local'],traceScope:{}});
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);
});
