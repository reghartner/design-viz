import {test,expect,pastePage as paste,inspectPageElement} from '../helpers/test.mjs';

const spec={page:{sections:[{heading:'Operational story',diagram:{nodes:{service:{title:'Service'}},rows:[['service']],panels:[
  {id:'checks',type:'checks',title:'Decision checks',checks:[{id:'auth',label:'Authorization'}],initial:{results:{auth:{status:'pass',future:true},unknown:{keep:true}}}},
  {id:'budget',type:'budget',title:'Latency budget',metrics:[{id:'latency',label:'Latency',max:500,unit:'ms'}],initial:{values:{latency:40}}},
  {id:'table',type:'table',title:'Data rows',columns:[{id:'value',label:'Reading'}],initial:{rows:[{id:'one',cells:{value:4,hidden:true},future:9},{id:'two',cells:{value:8}}]}},
  {id:'events',type:'log',title:'Event log',tags:{NET:'#112233'},initial:{log:['Started']}}
],steps:[{id:'start',text:'Initial values',panels:{}},{id:'sent',text:'Request sent',panels:{events:{log:[{tag:'NET',text:'Sent',future:3}]},budget:{values:{latency:60}}}}]}}]}};

test('collection forms preserve unknown data and exact history across real browser edits',async({page,server},testInfo)=>{
  const original=JSON.stringify(spec,null,2);await page.goto(server.origin+'/workbench.html');await paste(page,original);
  const guide=page.locator('#guide'),source=page.locator('#src'),root=page.locator('#docview');
  const diagram=async()=>JSON.parse(await source.inputValue()).page.sections[0].diagram;
  await inspectPageElement(page,root.locator('.pt-checks .ptitle'));
  await guide.locator('.initialedit > summary').click();
  await guide.getByLabel('Authorization Result',{exact:true}).selectOption('fail');
  await expect.poll(async()=>(await diagram()).panels[0].initial.results.auth.status).toBe('fail');
  expect((await diagram()).panels[0].initial.results).toEqual({auth:{status:'fail',future:true},unknown:{keep:true}});
  const changed=await source.inputValue();await page.locator('#undo-builder').click();await expect(source).toHaveValue(original);
  await page.locator('#redo-builder').click();await expect(source).toHaveValue(changed);

  await inspectPageElement(page,root.locator('.pt-table .ptitle'));
  const initial=guide.locator('.initialedit');await initial.locator(':scope > summary').click();
  await expect(initial.getByLabel('Reading type',{exact:true}).first()).toHaveValue('number');
  await initial.locator('.rowline').first().getByTitle('move this item down',{exact:true}).click();
  await expect.poll(async()=>(await diagram()).panels[2].initial.rows.map(r=>r.id)).toEqual(['two','one']);
  expect((await diagram()).panels[2].initial.rows[1]).toEqual(spec.page.sections[0].diagram.panels[2].initial.rows[0]);
  await initial.getByLabel('Reading',{exact:true}).first().fill('12');await initial.getByLabel('Reading',{exact:true}).first().press('Tab');
  await expect.poll(async()=>(await diagram()).panels[2].initial.rows[0].cells.value).toBe(12);
  await initial.screenshot({path:testInfo.outputPath('table-composer.png')});
  await initial.locator('.rowline').first().getByTitle('remove this item',{exact:true}).click();
  await expect(initial.locator('.rowline')).toHaveCount(1);
  await initial.locator('.rowline').first().getByTitle('remove this item',{exact:true}).click();
  await expect.poll(async()=>(await diagram()).panels[2].initial.rows).toEqual([]);
});

test('step collection controls retain earlier snapshots and append-log semantics',async({page,server})=>{
  await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(spec,null,2));
  await page.locator('#editor-tab-steps').click();await page.locator('#steps-list [data-step-index="1"]').click();await page.locator('#editor-tab-inspect').click();
  const guide=page.locator('#guide'),diagram=async()=>JSON.parse(await page.locator('#src').inputValue()).page.sections[0].diagram;
  const budget=guide.locator('.patchedit[data-panel-state="step"]').filter({has:page.locator('summary').filter({hasText:/^budget ·/})});
  await budget.locator(':scope > summary').click();await budget.getByLabel('Latency no data',{exact:true}).click();
  await expect.poll(async()=>(await diagram()).steps[1].panels.budget.values.latency).toBe(null);
  expect((await diagram()).panels[1].initial.values.latency).toBe(40);
  const log=guide.locator('.patchedit[data-panel-state="step"]').filter({has:page.locator('summary').filter({hasText:/^events ·/})});
  await log.locator(':scope > summary').click();await expect(log).toContainText('append to the log');
  await log.getByLabel('text',{exact:true}).fill('Acknowledged');await log.getByLabel('text',{exact:true}).press('Tab');
  await expect.poll(async()=>(await diagram()).steps[1].panels.events.log[0].text).toBe('Acknowledged');
  expect((await diagram()).steps[1].panels.events.log[0].future).toBe(3);
  expect((await diagram()).panels[3].initial.log).toEqual(['Started']);
});
