import {test,expect,pastePage as paste,inspectPageElement} from '../helpers/test.mjs';

const raw={page:{sections:[{heading:'Collection state',diagram:{nodes:{service:{title:'Service'}},rows:[['service']],panels:[
  {id:'flight',type:'inflight',title:'Requests in flight',lanes:[{id:'request',label:'Request'}]},
  {id:'timeline',type:'timeline',title:'Heartbeat',span:'2h',cadence:{every:'30m'},initial:{events:[{at:'0',label:'Boot'}]}},
  {id:'xray',type:'xray',title:'Protection layers',layers:[{id:'case',label:'Case'},{id:'board',label:'Board'}],initial:{layers:[{id:'case',open:true,future:true},{id:'future',open:true}]}},
  {id:'buffer',type:'buffer',title:'Upload buffer',segments:3,initial:{cells:['buffered','future-token','empty']}}
],steps:[
  {id:'start',text:'Request starts',panels:{flight:{start:[{lane:'request',label:'send',future:true}]},timeline:{events:[{at:'15m',label:'Ready',future:true}]}}},
  {id:'inspect',text:'Inspect and recover',panels:{xray:{hop:'gateway'},buffer:{mark:[[0,1,'uploaded','future-tail']]}}}
]}}]}};

async function inspectStep(page,index){
  await page.locator('#editor-tab-steps').click();await page.locator('#steps-list [data-step-index="'+index+'"]').click();await page.locator('#editor-tab-inspect').click();
}
async function openPatch(guide,id){
  const patch=guide.locator('.patchedit[data-panel-state="step"][data-panel-id="'+id+'"]');
  if(await patch.getAttribute('open')===null)await patch.locator(':scope > summary').click();
  return patch;
}

test('operation and snapshot composers preserve source shape across targets and history',async({page,server},testInfo)=>{
  const original=JSON.stringify(raw,null,2);await page.goto(server.origin+'/workbench.html');await paste(page,original);
  const root=page.locator('#docview'),guide=page.locator('#guide'),source=page.locator('#src');
  const diagram=async()=>JSON.parse(await source.inputValue()).page.sections[0].diagram;

  await inspectPageElement(page,root.locator('.pt-xray .ptitle'));
  const initial=guide.locator('.initialedit[data-panel-id="xray"]');
  if(await initial.getAttribute('open')===null)await initial.locator(':scope > summary').click();
  await expect(initial.getByLabel('Board layer state',{exact:true})).toHaveValue('sealed');
  await initial.getByLabel('Board layer state',{exact:true}).selectOption('open');
  await expect.poll(async()=>(await diagram()).panels[2].initial.layers.at(-1).id).toBe('board');
  expect((await diagram()).panels[2].initial.layers).toEqual([
    {id:'case',open:true,future:true},{id:'future',open:true},{id:'board',open:true}
  ]);
  const changed=await source.inputValue();await page.locator('#undo-builder').click();await expect(source).toHaveValue(original);
  await page.locator('#redo-builder').click();await expect(source).toHaveValue(changed);

  await inspectStep(page,1);const xray=await openPatch(guide,'xray');
  await expect(xray.locator('.panel-state-note').first()).toContainText('Inherited');
  await xray.getByLabel('Board layer state',{exact:true}).selectOption('sealed');
  expect((await diagram()).steps[1].panels.xray.layers).toEqual([{id:'case',open:true,future:true},{id:'future',open:true}]);
  expect((await diagram()).steps[1].panels.xray.hop).toBe('gateway');

  const buffer=await openPatch(guide,'buffer');
  await buffer.getByLabel('Cell 1 state',{exact:true}).selectOption('protected');
  expect((await diagram()).steps[1].panels.buffer).toEqual({mark:[[0,1,'uploaded','future-tail']],cells:['protected','future-token','empty']});
  await buffer.getByLabel('State',{exact:true}).selectOption('dropped');
  expect((await diagram()).steps[1].panels.buffer.mark).toEqual([[0,1,'dropped','future-tail']]);
  await guide.screenshot({path:testInfo.outputPath('remaining-collection-composers.png')});

  await inspectStep(page,0);const flight=await openPatch(guide,'flight');
  await flight.getByLabel('Operation label',{exact:true}).fill('retry');await flight.getByLabel('Operation label',{exact:true}).press('Tab');
  expect((await diagram()).steps[0].panels.flight.start).toEqual([{lane:'request',label:'retry',future:true}]);
  const timeline=await openPatch(guide,'timeline');
  await timeline.getByLabel('Event label',{exact:true}).fill('Recovered');await timeline.getByLabel('Event label',{exact:true}).press('Tab');
  expect((await diagram()).steps[0].panels.timeline.events).toEqual([{at:'15m',label:'Recovered',future:true}]);
});
