import {test,expect,pastePage as paste,inspectPageElement,closeTools} from '../helpers/test.mjs';

const fixture=()=>({page:{title:'Order contract',sections:[{heading:'Order created',diagram:{view:'step',autoplay:false,
  nodes:{service:{title:'Orders'}},rows:[['service']],primaryPanel:'contract',
  panels:[{id:'contract',type:'data-contract',title:'OrderCreated',fieldWidth:170,
    columns:[{id:'type',label:'Type',width:100},{id:'example',label:'Example',width:180}],
    fields:[{id:'order',label:'order_id',cells:{type:'string',example:'ord_2048',future:{keep:true}},future:9},
      {id:'count',label:'count',cells:{type:'integer',example:0}}],
    initial:{highlights:{order:{color:'blue',label:'Primary key'}}}}],
  steps:[{id:'created',text:'Create order'},
    {id:'checked',text:'Validate count',panels:{contract:{highlights:{count:{color:'amber',label:'Validate'}}}}},
    {id:'saved',text:'Save order'},
    {id:'done',text:'Clear highlights',panels:{contract:{highlights:{}}}}]
}}]}});

test('contract editor adds columns and fields, preserves IDs and values, and supports exact history',async({page,server})=>{
  const original=JSON.stringify(fixture(),null,2);await page.goto(server.origin+'/workbench.html');await paste(page,original);
  const root=page.locator('#docview'),guide=page.locator('#guide'),source=page.locator('#src');
  const panel=async()=>JSON.parse(await source.inputValue()).page.sections[0].diagram.panels[0];
  await inspectPageElement(page,root.locator('.pt-data-contract .ptitle'));
  const columns=guide.locator('[data-contract-editor="columns"]:not(.patchedit *)'),fields=guide.locator('[data-contract-editor="fields"]:not(.patchedit *)');
  await columns.getByRole('button',{name:'+ Add column',exact:true}).click();
  await columns.getByLabel('Column name',{exact:true}).last().fill('Notes');await columns.getByLabel('Column name',{exact:true}).last().press('Tab');
  await expect.poll(async()=>(await panel()).columns.length).toBe(3);
  await expect(root.locator('.dcontract-table thead')).toContainText('Notes');
  const added=await source.inputValue();await page.locator('#undo-builder').click();await expect(source).toHaveValue(original);
  await page.locator('#redo-builder').click();await expect(source).toHaveValue(added);
  await inspectPageElement(page,root.locator('.pt-data-contract .ptitle'));
  await fields.getByLabel('Notes',{exact:true}).first().fill('Used for idempotency');await fields.getByLabel('Notes',{exact:true}).first().press('Tab');
  await expect.poll(async()=>(await panel()).fields[0].cells.notes).toBe('Used for idempotency');
  expect((await panel()).fields[0].cells.future).toEqual({keep:true});expect((await panel()).fields[0].future).toBe(9);
  expect((await panel()).fields[1].cells.example).toBe(0);
  await fields.getByLabel('Field name',{exact:true}).first().fill('order_identifier');await fields.getByLabel('Field name',{exact:true}).first().press('Tab');
  await expect.poll(async()=>(await panel()).fields[0].label).toBe('order_identifier');
  expect((await panel()).fields[0].id).toBe('order');
  await expect(root.locator('[data-contract-field="order"]')).toHaveClass('dcontract-highlight');
  await columns.getByLabel('Column name',{exact:true}).last().fill('Description');await columns.getByLabel('Column name',{exact:true}).last().press('Tab');
  await expect(root.locator('.dcontract-table thead')).toContainText('Description');
  await expect(root.locator('[data-contract-field="order"]')).toContainText('Used for idempotency');
  expect((await panel()).columns[2].id).toBe('notes');
  await fields.getByRole('button',{name:'+ Add field',exact:true}).click();
  await fields.getByLabel('Field name',{exact:true}).last().fill('total');await fields.getByLabel('Field name',{exact:true}).last().press('Tab');
  await expect.poll(async()=>(await panel()).fields.length).toBe(3);
  await expect(root.locator('[data-contract-field="total"]')).toBeVisible();
  await fields.locator('.rowline').first().getByTitle('remove this item',{exact:true}).click();
  await expect.poll(async()=>(await panel()).initial.highlights).toEqual({});
  await expect(root.locator('[data-contract-field="order"]')).toHaveCount(0);
  await page.locator('#undo-builder').click();await expect(root.locator('[data-contract-field="order"]')).toHaveClass('dcontract-highlight');
});

test('contract highlights change by step with stable widths, custom colors, clear and undo',async({page,server},testInfo)=>{
  await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(fixture(),null,2));
  const root=page.locator('#docview'),guide=page.locator('#guide'),source=page.locator('#src');
  await closeTools(page);await page.evaluate(()=>document.fonts.ready);
  const widths=()=>root.locator('.dcontract-table thead th').evaluateAll(cells=>cells.map(cell=>cell.getBoundingClientRect().width));
  const before=await widths(),order=root.locator('[data-contract-field="order"]'),count=root.locator('[data-contract-field="count"]');
  await expect(order).toHaveClass('dcontract-highlight');await expect(count).not.toHaveClass('dcontract-highlight');
  await root.getByRole('button',{name:'Next step',exact:true}).click();
  await expect(count).toHaveClass('dcontract-highlight');await expect(order).not.toHaveClass('dcontract-highlight');
  expect(await widths()).toEqual(before);
  await root.getByRole('button',{name:'Next step',exact:true}).click();await expect(count).toHaveClass('dcontract-highlight');
  await root.getByRole('button',{name:'Next step',exact:true}).click();await expect(count).not.toHaveClass('dcontract-highlight');
  expect(await widths()).toEqual(before);

  await page.locator('#editor-tab-steps').click();await page.locator('#steps-list [data-step-index="1"]').click();await page.locator('#editor-tab-inspect').click();
  const patch=guide.locator('.patchedit[data-panel-state="step"][data-panel-id="contract"]');
  if(await patch.getAttribute('open')===null)await patch.locator(':scope > summary').click();
  const prior=await source.inputValue();
  await patch.getByLabel('order_id highlight',{exact:true}).selectOption('purple');
  const changed=await source.inputValue();expect(changed).not.toBe(prior);
  await expect(order).toHaveAttribute('style','--contract-highlight:#a855f7');
  await page.locator('#undo-builder').click();await expect(source).toHaveValue(prior);
  await page.locator('#redo-builder').click();await expect(source).toHaveValue(changed);
  await page.locator('#editor-tab-steps').click();await page.locator('#steps-list [data-step-index="1"]').click();await page.locator('#editor-tab-inspect').click();
  if(await patch.getAttribute('open')===null)await patch.locator(':scope > summary').click();
  await patch.getByLabel('order_id custom color',{exact:true}).fill('#c72d73');
  await expect(order).toHaveAttribute('style','--contract-highlight:#c72d73');
  await patch.getByLabel('order_id highlight label',{exact:true}).fill('Required by consumer');await patch.getByLabel('order_id highlight label',{exact:true}).press('Tab');
  await expect(order).toContainText('Required by consumer');
  await closeTools(page);await root.locator('.pt-data-contract').screenshot({path:testInfo.outputPath('data-contract-highlights.png')});
  await page.locator('#editor-tab-inspect').click();
  await patch.getByRole('button',{name:'Clear all highlights',exact:true}).click();
  await expect(root.locator('.dcontract-highlight')).toHaveCount(0);
});

test('editing inherited highlights preserves the other colors and can apply to one step only',async({page,server})=>{
  await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(fixture(),null,2));
  const root=page.locator('#docview'),guide=page.locator('#guide'),source=page.locator('#src');
  await page.locator('#editor-tab-steps').click();await page.locator('#steps-list [data-step-index="2"]').click();await page.locator('#editor-tab-inspect').click();
  await guide.getByRole('button',{name:'ADD TO STEP',exact:true}).click();
  await root.locator('.pt-data-contract .ptitle').click();await page.keyboard.press('Escape');
  await expect.poll(async()=>JSON.parse(await source.inputValue()).page.sections[0].diagram.steps[2].panels?.contract).toEqual({});
  await page.locator('#editor-tab-steps').click();await page.locator('#steps-list [data-step-index="2"]').click();await page.locator('#editor-tab-inspect').click();
  const patch=guide.locator('.patchedit[data-panel-state="step"][data-panel-id="contract"]');
  if(await patch.getAttribute('open')===null)await patch.locator(':scope > summary').click();
  await expect(patch.getByLabel('count highlight',{exact:true})).toHaveValue('amber');
  await patch.getByLabel('order_id highlight',{exact:true}).selectOption('green');
  await patch.getByLabel('highlights duration',{exact:true}).selectOption('once');
  const d=JSON.parse(await source.inputValue()).page.sections[0].diagram;
  expect(d.steps[2].panels.contract.highlights).toBeUndefined();
  expect(d.steps[2].panels.contract.enterOnce.highlights).toEqual({count:{color:'amber',label:'Validate'},order:{color:'green'}});
  await closeTools(page);
  await expect(root.locator('.dcontract-highlight')).toHaveCount(2);
  await root.getByRole('button',{name:'Previous step',exact:true}).click();
  await expect(root.locator('.dcontract-highlight')).toHaveCount(1);
  await expect(root.locator('[data-contract-field="count"]')).toHaveClass('dcontract-highlight');
  await inspectPageElement(page,root.locator('.pt-data-contract .ptitle'));
  const beforeRemoval=await source.inputValue();
  await guide.locator('[data-contract-editor="fields"]:not(.patchedit *) .rowline').nth(1).getByTitle('remove this item',{exact:true}).click();
  await expect(root.locator('[data-contract-field="count"]')).toHaveCount(0);
  const removed=JSON.parse(await source.inputValue()).page.sections[0].diagram;
  expect(removed.steps[1].panels.contract.highlights).toEqual({});
  expect(removed.steps[2].panels.contract.enterOnce.highlights).toEqual({order:{color:'green'}});
  expect(removed.panels[0].initial.highlights).toEqual({order:{color:'blue',label:'Primary key'}});
  await page.locator('#undo-builder').click();await expect(source).toHaveValue(beforeRemoval);
});

test('step content edits inherit all cells and columns, undo exactly, and can last one step',async({page,server})=>{
  const spec=fixture(),d=spec.page.sections[0].diagram;
  d.steps[1].panels.contract.columns=[...d.panels[0].columns,{id:'notes',label:'Notes',width:150}];
  d.steps[1].panels.contract.fields=[...d.panels[0].fields,{id:'added',label:'Added',cells:{notes:'Inherited note'}}];
  d.steps[2].panels={contract:{}};
  await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(spec,null,2));
  const root=page.locator('#docview'),source=page.locator('#src');
  await page.locator('#editor-tab-steps').click();await page.locator('#steps-list [data-step-index="2"]').click();await page.locator('#editor-tab-inspect').click();
  const patch=page.locator('#guide .patchedit[data-panel-state="step"][data-panel-id="contract"]');
  if(await patch.getAttribute('open')===null)await patch.locator(':scope > summary').click();
  const fields=patch.locator('[data-contract-editor="fields"]');
  await expect(fields.getByLabel('Notes',{exact:true}).last()).toHaveValue('Inherited note');
  const before=await source.inputValue();
  await fields.getByLabel('Notes',{exact:true}).last().fill('Only here');
  await fields.getByLabel('Notes',{exact:true}).last().press('Tab');
  await expect(root.locator('[data-contract-field="added"]')).toContainText('Only here');
  const changed=await source.inputValue();
  expect(JSON.parse(changed).page.sections[0].diagram.panels).toEqual(d.panels);
  await page.locator('#undo-builder').click();await expect(source).toHaveValue(before);
  await page.locator('#redo-builder').click();await expect(source).toHaveValue(changed);
  await page.locator('#editor-tab-steps').click();await page.locator('#steps-list [data-step-index="2"]').click();await page.locator('#editor-tab-inspect').click();
  if(await patch.getAttribute('open')===null)await patch.locator(':scope > summary').click();
  await patch.getByLabel('fields duration',{exact:true}).selectOption('once');
  await expect(patch.getByLabel('Added highlight',{exact:true})).toBeVisible();
  await closeTools(page);await root.getByRole('button',{name:'Next step',exact:true}).click();
  await expect(root.locator('[data-contract-field="added"]')).toContainText('Inherited note');
});
