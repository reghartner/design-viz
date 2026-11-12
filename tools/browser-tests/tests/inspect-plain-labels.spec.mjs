import {test,expect,pastePage,inspectPageElement,openInspectorGroup} from '../helpers/test.mjs';

/* #997: the panel parts of Inspect name every column, step change and
   effective-state field in plain words. Raw spec keys stay secondary. */
const spec={page:{sections:[{heading:'Grid labels',diagram:{nodes:{api:{title:'API'}},rows:[['api']],panels:[
  {id:'heat',type:'grid',title:'Values by group',decimals:2,
    rows:[{id:'groupA',label:'Group A'},{id:'groupB',label:'Group B'}],
    cols:[{id:'period1',label:'Period 1'},{id:'period2',label:'Period 2'}],
    initial:{cells:{'groupA.period1':1.4}}}
],steps:[
  {id:'peak',text:'Peak',panels:{heat:{cells:{'groupA.period1':2},note:'Peak value'}}}
]}}]}};
const RAW_KEYS=['id','label','cells','note'];

test('grid columns in Inspect have plain visible and accessible labels, also after typing',async({page,server})=>{
  const original=JSON.stringify(spec,null,2);
  await page.goto(server.origin+'/workbench.html');await pastePage(page,original);
  const guide=page.locator('#guide'),source=page.locator('#src'),root=page.locator('#docview');
  const panel=async()=>JSON.parse(await source.inputValue()).page.sections[0].diagram.panels[0];
  await inspectPageElement(page,root.locator('.pt-grid .ptitle'));

  for(const [field,thing] of [['Rows','Row'],['Columns','Column']]){
    const block=guide.locator('.frow').filter({has:page.locator(':scope > .flab',{hasText:new RegExp('^'+field+'$')})});
    const lines=block.locator('.rowline');
    await expect(lines).toHaveCount(2);
    // A visible caption names each input in this two-column (narrow) layout.
    await expect(lines.first().locator('.rowk')).toHaveText([thing+' ID *',thing+' name']);
    await expect(lines.first().locator('.rowk').first()).toBeVisible();
    await expect(block.getByRole('textbox',{name:thing+' ID',exact:true})).toHaveCount(2);
    await expect(block.getByRole('textbox',{name:thing+' name',exact:true})).toHaveCount(2);
    const names=await block.locator('.rowline input').evaluateAll(inputs=>inputs.map(input=>input.getAttribute('aria-label')));
    expect(names.filter(name=>RAW_KEYS.includes(name))).toEqual([]);
  }

  // Type a value: the caption stays visible once the placeholder is gone.
  const rows=guide.locator('.frow').filter({has:page.locator(':scope > .flab',{hasText:/^Rows$/})});
  const name=rows.getByRole('textbox',{name:'Row name',exact:true}).first();
  await name.click();await page.keyboard.press('ControlOrMeta+A');await page.keyboard.type('Group Alpha');await page.keyboard.press('Tab');
  await expect.poll(async()=>(await panel()).rows[0]).toEqual({id:'groupA',label:'Group Alpha'});
  const first=rows.locator('.rowline').first();
  await expect(first.getByRole('textbox',{name:'Row name',exact:true})).toHaveValue('Group Alpha');
  await expect(first.locator('.rowk').nth(1)).toBeVisible();
  await expect(first.locator('.rowk').nth(1)).toHaveText('Row name');
  await page.locator('#undo-builder').click();await expect(source).toHaveValue(original);

  // Starting-state fields are named by their plain label, not the spec key.
  const initial=guide.locator('.initialedit');await openInspectorGroup(initial);
  await expect(initial.getByLabel('Cell values',{exact:true})).toHaveCount(1);
  await expect(initial.getByLabel('cells',{exact:true})).toHaveCount(0);
});

test('step change summaries and effective state use the panel title and plain field labels',async({page,server})=>{
  await page.goto(server.origin+'/workbench.html');await pastePage(page,JSON.stringify(spec,null,2));
  await page.locator('#editor-tab-steps').click();await page.locator('#steps-list [data-step-index="0"]').click();await page.locator('#editor-tab-inspect').click();
  const guide=page.locator('#guide');
  const change=guide.locator('.patchedit[data-panel-state="step"][data-panel-id="heat"]');
  await expect(change.locator(':scope > summary')).toHaveText('heat · Cell values → {…} · Explanation → Peak value');

  const effective=guide.locator('.effective-state');
  if(await effective.getAttribute('open')===null)await effective.locator(':scope > summary').click();
  const box=effective.locator('.effective-panel').first();
  const summary=box.locator(':scope > summary');
  await expect(summary).toContainText('Values by group');
  await expect(summary.locator('.effective-key')).toHaveText('heat · grid');
  if(await box.getAttribute('open')===null)await summary.click();
  const cells=box.locator('[data-effective-field="cells"] .effective-heading');
  await expect(cells.locator('.effective-label')).toHaveText('Cell values');
  await expect(cells.locator('code')).toHaveText('cells');
  await expect(box.locator('[data-effective-field="note"] .effective-label')).toHaveText('Explanation');
});
