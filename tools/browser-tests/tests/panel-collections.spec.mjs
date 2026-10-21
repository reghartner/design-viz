import {test,expect,pastePage as paste,inspectPageElement,closeTools} from '../helpers/test.mjs';

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

test('authored table widths stay fixed across snapshots, empty rows and history',async({page,server},testInfo)=>{
  const raw={page:{sections:[{heading:'Stable columns',diagram:{view:'step',autoplay:false,
    nodes:{service:{title:'Service'}},rows:[['service']],
    panels:[{id:'table',type:'table',title:'Data rows',columns:[{id:'key',label:'Key'},{id:'value',label:'Value'}],
      initial:{rows:[{id:'one',cells:{key:'a',value:'b'}}]}}],
    steps:[{id:'short',text:'Short values'},
      {id:'long',text:'Long values',panels:{table:{rows:[{id:'one',cells:{key:'record_identifier_'.repeat(8),value:'a much longer value '.repeat(15)},status:'changed'}]}}},
      {id:'empty',text:'Empty snapshot',panels:{table:{rows:[]}}}]
  }}]}};
  const original=JSON.stringify(raw,null,2);
  await page.goto(server.origin+'/workbench.html');await paste(page,original);
  const root=page.locator('#docview'),guide=page.locator('#guide'),source=page.locator('#src');
  const table=root.locator('.pt-table .swtable');
  const columns=async()=>JSON.parse(await source.inputValue()).page.sections[0].diagram.panels[0].columns;
  const widths=()=>table.locator('th').evaluateAll(cells=>cells.map(cell=>cell.getBoundingClientRect().width));
  await expect(table).toHaveCSS('table-layout','auto');
  await inspectPageElement(page,root.locator('.pt-table .ptitle'));
  const width=guide.getByLabel('Width (px)',{exact:true});
  await width.first().fill('160');await width.first().press('Tab');
  await expect.poll(async()=>(await columns())[0].width).toBe(160);
  await expect(table).toHaveCSS('table-layout','fixed');
  const changed=await source.inputValue();
  await page.locator('#undo-builder').click();await expect(source).toHaveValue(original);
  await expect(table).toHaveCSS('table-layout','auto');
  await page.locator('#redo-builder').click();await expect(source).toHaveValue(changed);
  await page.evaluate(()=>document.fonts.ready);
  const partial=await widths();expect(partial[0]).toBeCloseTo(160,0);
  // Inspector editing is complete; expose the document playback controls.
  await closeTools(page);
  await root.getByRole('button',{name:'Next step',exact:true}).click();
  await expect(table).toContainText('record_identifier_');expect(await widths()).toEqual(partial);
  await root.getByRole('button',{name:'Next step',exact:true}).click();
  await expect(table).toContainText('No rows at this step');expect(await widths()).toEqual(partial);

  // Widths wider than the panel scroll inside it, including the Change column.
  await inspectPageElement(page,root.locator('.pt-table .ptitle'));
  await width.nth(1).fill('320');await width.nth(1).press('Tab');
  await expect.poll(async()=>(await columns())[1].width).toBe(320);
  const full=await widths();expect(full[0]).toBeCloseTo(160,0);expect(full[1]).toBeCloseTo(320,0);
  const wrap=root.locator('.pt-table .swtablewrap');
  expect(await wrap.evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(true);
  await closeTools(page);
  await root.getByRole('button',{name:'Previous step',exact:true}).click();
  await expect(table).toContainText('record_identifier_');expect(await widths()).toEqual(full);
  await closeTools(page);
  await root.locator('.pt-table').screenshot({path:testInfo.outputPath('fixed-table-columns.png')});
  await inspectPageElement(page,root.locator('.pt-table .ptitle'));
  await width.first().fill('');await width.first().press('Tab');
  await expect.poll(async()=>(await columns())[0].width).toBeUndefined();
  await width.nth(1).fill('');await width.nth(1).press('Tab');
  await expect.poll(async()=>(await columns())[1].width).toBeUndefined();
  await expect(table).toHaveCSS('table-layout','auto');
});

test('desktop tables can omit Change, preserve typed rows and statuses, and restore it with exact history',async({page,server},testInfo)=>{
  const rows=[{id:'one',status:'removed',cells:{number:0,flag:false,nil:null,text:' padded ',hidden:{keep:true}}}];
  const raw={page:{sections:[{heading:'Plain data',diagram:{view:'step',autoplay:false,nodes:{service:{}},rows:[['service']],
    panels:[{id:'table',type:'table',title:'Data rows',columns:[{id:'number',label:'Count',width:120},{id:'flag',label:'Enabled'},{id:'nil',label:'Empty'},{id:'text',label:'Text'}],initial:{rows}}],
    steps:[{id:'start',text:'Values',nodes:['service']},{id:'empty',text:'Empty',panels:{table:{rows:[]}}}]
  }}]}};
  const original=JSON.stringify(raw,null,2);
  await page.goto(server.origin+'/workbench.html');await paste(page,original);
  const root=page.locator('#docview'),guide=page.locator('#guide'),source=page.locator('#src'),table=root.locator('.swtable');
  const panel=async()=>JSON.parse(await source.inputValue()).page.sections[0].diagram.panels[0];
  await expect(table.locator('thead th')).toHaveText(['Count','Enabled','Empty','Text','Change']);
  await inspectPageElement(page,root.locator('.pt-table .ptitle'));
  const toggle=guide.getByRole('checkbox',{name:'Show Change column',exact:true});await expect(toggle).toBeChecked();
  await toggle.uncheck();
  await expect(table.locator('thead th')).toHaveText(['Count','Enabled','Empty','Text']);
  await expect(table.locator('colgroup col')).toHaveCount(4);await expect(table).toHaveCSS('min-width','360px');
  await expect(table.locator('.swbadge')).toHaveCount(0);
  for(const cell of await table.locator('.swrow-removed td').all())await expect(cell).toHaveCSS('text-decoration-line','line-through');
  expect((await panel()).initial.rows).toEqual(rows);
  const hidden=await source.inputValue();await page.locator('#undo-builder').click();await expect(source).toHaveValue(original);
  await page.locator('#redo-builder').click();await expect(source).toHaveValue(hidden);
  await inspectPageElement(page,root.locator('.pt-table .ptitle'));
  const initial=guide.locator('.initialedit');if(await initial.getAttribute('open')===null)await initial.locator(':scope > summary').click();
  await expect(initial.getByLabel('Change',{exact:true})).toHaveCount(0);
  await initial.getByLabel('Row ID',{exact:true}).fill('renamed');await initial.getByLabel('Row ID',{exact:true}).press('Tab');
  await expect.poll(async()=>(await panel()).initial.rows).toEqual([{...rows[0],id:'renamed'}]);
  await toggle.check();await expect(table.locator('.swbadge')).toHaveText('removed');
  await expect(initial.getByLabel('Change',{exact:true})).toHaveValue('removed');
  await toggle.uncheck();
  await closeTools(page);await root.locator('.pt-table').screenshot({path:testInfo.outputPath('table-without-change.png')});
  await root.getByRole('button',{name:'Next step',exact:true}).click();
  await expect(table.locator('.swempty')).toHaveAttribute('colspan','4');
  await inspectPageElement(page,root.locator('.pt-table .ptitle'));
  const width=guide.getByLabel('Width (px)',{exact:true}).first();await width.fill('');await width.press('Tab');
  await expect(table).toHaveCSS('table-layout','auto');await expect(table.locator('colgroup')).toHaveCount(0);
  await expect(table.locator('thead th')).toHaveCount(4);
});
