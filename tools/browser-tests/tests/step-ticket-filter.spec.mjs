/* #1103 T5: the desktop Workbench step Inspect offers the step ticket filter as a
   checklist of the tickets on the nodes and edges the step lights, imported
   carriers included, and writes `ticketFilter` without raw JSON. */
import {test,expect,closeTools} from '../helpers/test.mjs';
import {digest} from '../../canon/drift.mjs';

const source=async page=>JSON.parse(await page.locator('#src').inputValue());
const step=raw=>raw.page.sections[0].diagram.steps[0];
async function open(page,server){
  await page.setViewportSize({width:1440,height:1000});
  const model=(id,d)=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},tracking:{jira:{site:'https://acme.atlassian.net'}},sections:[{id:'main',diagram:d}]}});
  const provider=model('provider',{nodes:{api:{title:'API',tickets:['CAN-1']},store:{title:'Store'}},rows:[['api','store']],edges:[{from:'api',to:'store',label:'Persist'}],topologyExports:{core:{nodes:['api','store'],edges:['api->store']}}});
  const consumer=model('consumer',{autoplay:false,nodes:{local:{title:'Local worker',tickets:['LOC-1','LOC-2']}},rows:[['local']],
    topologyImports:[{spec:'provider',export:'core',as:'canon',nodeTracking:{api:{tickets:['API-2']}}}],
    panels:[{id:'status',type:'live-status',title:'Delivery status'}],steps:[{id:'build',nodes:['canon::api','local'],text:'Build the API'}]});
  const catalog={version:3,diagrams:[provider,consumer].map(spec=>({id:spec.page.canon.id,title:spec.page.title,canon:spec.page.canon,counts:{nodes:2,steps:0,panels:0},revision:digest(spec),specUrl:spec.page.canon.id+'.json'}))};
  await page.route('**/diagrams.json',route=>route.fulfill({json:catalog}));
  for(const spec of [provider,consumer])await page.route('**/'+spec.page.canon.id+'.json',route=>route.fulfill({json:spec}));
  await page.goto(server.origin+'/workbench.html');
  await page.locator('#welcome-file').setInputFiles({name:'consumer.spec.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(consumer,null,2))});
  await expect(page.locator('#docview g.node[data-dv-node="canon::api"]')).toBeVisible();await closeTools(page);
}
async function inspectStep(page){
  await page.locator('#editor-tab-steps').click();await page.locator('#steps-list [data-step-index="0"]').click();await page.locator('#editor-tab-inspect').click();
  return page.locator('#guide').getByRole('group',{name:'Tickets on this step',exact:true});
}

test('desktop step Inspect checklist writes the step ticket filter over local and imported tickets',async({page,server})=>{
  await open(page,server);
  let list=await inspectStep(page);const box=key=>list.getByRole('checkbox',{name:key,exact:true});
  await expect(list.getByRole('checkbox')).toHaveCount(4);
  for(const key of ['CAN-1','API-2','LOC-1','LOC-2'])await expect(box(key)).toBeChecked();
  expect(step(await source(page)).ticketFilter).toBeUndefined();
  const original=await page.locator('#src').inputValue();
  await box('CAN-1').uncheck();
  await expect.poll(async()=>step(await source(page)).ticketFilter).toEqual(['API-2','LOC-1','LOC-2']);
  list=await inspectStep(page);await box('LOC-2').uncheck();
  await expect.poll(async()=>step(await source(page)).ticketFilter).toEqual(['API-2','LOC-1']);
  const filtered=await page.locator('#src').inputValue();
  expect((await source(page)).page.sections[0].diagram.topologyImports[0].nodeTracking).toEqual({api:{tickets:['API-2']}});
  await page.locator('#undo-builder').click();await expect.poll(async()=>step(await source(page)).ticketFilter).toEqual(['API-2','LOC-1','LOC-2']);
  await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(filtered);
  list=await inspectStep(page);
  for(const [key,on] of [['CAN-1',false],['API-2',true],['LOC-1',true],['LOC-2',false]])await expect(box(key)).toBeChecked({checked:on});
  await box('API-2').uncheck();await expect.poll(async()=>step(await source(page)).ticketFilter).toEqual(['LOC-1']);
  // The guard puts the box back, so click rather than uncheck (uncheck asserts the new state).
  list=await inspectStep(page);await box('LOC-1').click();
  await expect(page.locator('#guide .ierr')).toContainText('Keep at least one ticket');
  await expect(box('LOC-1')).toBeChecked();expect(step(await source(page)).ticketFilter).toEqual(['LOC-1']);
  for(const key of ['CAN-1','API-2','LOC-2']){list=await inspectStep(page);await box(key).check();}
  await expect.poll(async()=>step(await source(page)).ticketFilter).toBeUndefined();
  expect(JSON.parse(await page.locator('#src').inputValue())).toEqual(JSON.parse(original));
});
