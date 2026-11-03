import {test,expect,pastePage,inspectPageElement,closeTools} from '../helpers/test.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {repo} from '../helpers/prepare.mjs';
const fixture=async()=>JSON.parse(await readFile(path.join(repo,'examples/device-power-truth-table/device-power-truth-table.spec.json'),'utf8'));
/* #921 contract, slice 1 "editor layout" (issue #921 "How it should look" 1-4 + "Test + flip";
   Chuck 2026-11-03 §0 ruling: "extend existing tests"; hosted in the first test below).
   Fixture: the shipped device-power example (4 cases; value columns source/charge/charging;
   icons columns powerIcon/batteryIcon), first column renamed to "Supply" by the test.
   | row | assertion (scoped) | rejects |
   | 1 one card per case | `[data-truth-case=<id>]:not([data-truth-column])` count 1 for EACH of the 4 cases, holding that case's Case ID input | today's separate icon blocks after the case list |
   | 1 icons edited inside their case | inside each case card: exactly one `[data-truth-case=<id>][data-truth-column=<col>]` per icons column, with as many pickers as that case's cell has icons | icon lists attached to the wrong case or only to the first card |
   | 1 no icon editor outside a card | every `[data-truth-column]` in Inspect (8) is inside a case card | duplicating the old blocks next to the new ones |
   | 2 type + value together | each value column of each case: one `[data-truth-property=<col>]` holding "<label> type" and "<label>" with the case's type/value, boxes overlapping vertically | today's 3-column grid that puts "Supply type" and "Supply" on different rows; pairing one column's type with another's value |
   | 3 Column kind default | each unset Properties kind select shows "value (default)" with value "" and the text fits inside the select; icons columns still show "icons" | the cut-off "(Column kind)" placeholder; a label that still clips; saving kind "value" |
   | 4 case editor full width (guard) | each case card's left edge within 16px of the Inspect content box and width >= 90% of it | the 88px setup label column beside the cases (already true at origin/main 53d7bca6: guard, not a flip) |
   | phone width | excluded — desktop-only editing (CLAUDE.md) |
   Slices 2 (No active case) and 3 (empty icon cell text) add their rows with their own RED. */

test('desktop truth-table author edits properties, cases and shared icons with exact Undo/Redo',async({page,server},info)=>{
  const original=JSON.stringify(await fixture(),null,2);
  await page.goto(server.origin+'/workbench.html');await pastePage(page,original);
  const root=page.locator('#docview'),guide=page.locator('#guide'),source=page.locator('#src');
  const panel=root.locator('.pt-truth-table'),table=panel.locator('table');
  const declaration=async()=>JSON.parse(await source.inputValue()).page.sections[0].diagram.panels[0];
  await expect(table.locator('tbody tr').first().locator('svg')).toHaveCount(3);
  await expect(table.locator('[aria-current="true"]')).toContainText('Solar charging');
  await inspectPageElement(page,panel.locator('.ptitle'));
  // Property declarations use the standard editable row controls.
  const header=guide.getByRole('textbox',{name:'label',exact:true}).first();await header.fill('Supply');await header.press('Tab');
  await expect.poll(async()=>(await declaration()).columns[0].label).toBe('Supply');
  await expect(table.locator('thead')).toContainText('Supply');
  const changedHeader=await source.inputValue();await page.locator('#undo-builder').click();await expect(source).toHaveValue(original);
  await page.locator('#redo-builder').click();await expect(source).toHaveValue(changedHeader);
  await inspectPageElement(page,panel.locator('.ptitle'));
  // #921 slice 1 (matrix above): one card per case with its property pairs and its own icon lists.
  const authored=await declaration(),valueColumns=authored.columns.filter(col=>col.kind!=='icons'),iconColumns=authored.columns.filter(col=>col.kind==='icons');
  expect([authored.cases.length,valueColumns.map(col=>col.label),iconColumns.length],'precondition: 4 cases, renamed value columns, 2 icons columns').toEqual([4,['Supply','Battery','Charging'],2]);
  // Rows 3 and 2 are soft so one run reports each row; row 1 stops the test.
  const kinds=guide.getByLabel('Column kind',{exact:true});await expect(kinds,'precondition: one kind select per column').toHaveCount(5);
  await page.evaluate(()=>document.fonts.ready);
  for(const [i,col] of authored.columns.entries()){
    const kind=kinds.nth(i);
    if(col.kind==='icons'){await expect.soft(kind.locator('option:checked'),`(3) ${col.id} kind`).toHaveText('icons');continue;}
    await expect.soft(kind,`(3) ${col.id} kind stays unset`).toHaveValue('');
    await expect.soft(kind.locator('option:checked'),`(3) ${col.id} unset kind names its default`).toHaveText('value (default)');
    const fit=await kind.evaluate(el=>{const cs=getComputedStyle(el),ctx=document.createElement('canvas').getContext('2d');ctx.font=[cs.fontStyle,cs.fontWeight,cs.fontSize,cs.fontFamily].join(' ');
      return {text:Math.ceil(ctx.measureText(el.selectedOptions[0].textContent).width+parseFloat(cs.paddingLeft)+parseFloat(cs.paddingRight)+20),box:el.clientWidth};});
    expect.soft(fit.text,`(3) ${col.id} "value (default)" fits its select (arrow included)`).toBeLessThanOrEqual(fit.box);
  }
  expect.soft((await declaration()).columns.map(col=>col.kind),'(3) showing the default saves nothing').toEqual([undefined,undefined,undefined,'icons','icons']);
  await expect.soft(guide.locator('[data-truth-property]'),'(2) one property pair per case and value column').toHaveCount(12);
  const caseCards=guide.locator('[data-truth-case]:not([data-truth-column])');
  await expect(caseCards,'(1) one card per case').toHaveCount(4);
  await expect(guide.locator('[data-truth-column]'),'precondition: one icon editor per case and icons column').toHaveCount(8);
  await expect(caseCards.locator('[data-truth-column]'),'(1) every icon editor sits inside a case card').toHaveCount(8);
  const contentBox=()=>guide.evaluate(el=>{const r=el.getBoundingClientRect(),cs=getComputedStyle(el);const left=r.left+el.clientLeft+parseFloat(cs.paddingLeft);return {left,width:el.clientWidth-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight)};});
  for(const row of authored.cases){
    const card=guide.locator(`[data-truth-case="${row.id}"]:not([data-truth-column])`);
    await expect(card,`(1) ${row.id} has one case card`).toHaveCount(1);
    await expect(card.getByLabel('Case ID',{exact:true}),`(1) ${row.id} card edits its own case`).toHaveValue(row.id);
    for(const col of iconColumns){
      const icons=card.locator(`[data-truth-case="${row.id}"][data-truth-column="${col.id}"]`);
      await expect(icons,`(1) ${row.id} edits ${col.id} inside its card`).toHaveCount(1);
      await expect(icons.locator('.flow-icon-browse'),`(1) ${row.id} ${col.id} shows its own icons`).toHaveCount(row.cells[col.id].length);
    }
    for(const col of valueColumns){
      const pair=card.locator(`[data-truth-property="${col.id}"]`);
      await expect(pair,`(2) ${row.id} ${col.id} has one property pair`).toHaveCount(1);
      const type=pair.getByLabel(col.label+' type',{exact:true}),value=pair.getByLabel(col.label,{exact:true}),cell=row.cells[col.id];
      await expect(type,`(2) ${row.id} ${col.id} pair holds the type`).toHaveValue(typeof cell);
      await expect(value,`(2) ${row.id} ${col.id} pair holds the value`).toHaveValue(String(cell));
      const a=await type.boundingBox(),b=await value.boundingBox();
      expect(a.y<b.y+b.height && b.y<a.y+a.height,`(2) ${row.id} ${col.id} type and value share one visual row`).toBe(true);
    }
    const content=await contentBox(),box=await card.boundingBox();
    expect(Math.abs(box.x-content.left),`(4) ${row.id} card starts at the Inspect content edge`).toBeLessThanOrEqual(16);
    expect(box.width,`(4) ${row.id} card uses the Inspect content width`).toBeGreaterThanOrEqual(content.width*.9);
  }
  await guide.getByLabel('Case label',{exact:true}).first().fill('Solar input');await guide.getByLabel('Case label',{exact:true}).first().press('Tab');
  await expect.poll(async()=>(await declaration()).cases[0].label).toBe('Solar input');
  await guide.getByLabel('Supply',{exact:true}).first().fill('Roof panel');await guide.getByLabel('Supply',{exact:true}).first().press('Tab');
  await expect.poll(async()=>(await declaration()).cases[0].cells.source).toBe('Roof panel');
  expect((await declaration()).cases[0].cells.charging).toBe(true);
  const beforeIcon=await source.inputValue();await guide.locator('.flow-icon-browse').first().click();
  const dialog=page.locator('dialog.flow-icon-picker');await dialog.locator('.flow-icon-search').fill('plug');
  await dialog.locator('[data-icon-id="plug"]').click();
  await expect.poll(async()=>(await declaration()).cases[0].cells.powerIcon[0].icon).toBe('plug');
  const changedIcon=await source.inputValue();await page.locator('#undo-builder').click();await expect(source).toHaveValue(beforeIcon);
  await page.locator('#redo-builder').click();await expect(source).toHaveValue(changedIcon);
  await inspectPageElement(page,panel.locator('.ptitle'));
  // Removing every output is explicit and leaves the case/properties intact.
  const icons=guide.locator('[data-truth-case="solar"][data-truth-column="batteryIcon"]');
  const powerBefore=(await declaration()).cases[0].cells.powerIcon;
  await icons.locator('.rowline').first().getByTitle('remove this item',{exact:true}).click();
  await expect.poll(async()=>(await declaration()).cases[0].cells.batteryIcon.length).toBe(1);
  await icons.locator('.rowline').first().getByTitle('remove this item',{exact:true}).click();
  await expect.poll(async()=>(await declaration()).cases[0].cells.batteryIcon).toEqual([]);
  await expect(table.locator('tbody tr').first()).toContainText('No icons');
  expect((await declaration()).cases[0].cells.powerIcon).toEqual(powerBefore);
  await page.locator('#undo-builder').click();await page.locator('#undo-builder').click();
  await expect(table.locator('tbody tr').first().locator('svg')).toHaveCount(3);
  await inspectPageElement(page,panel.locator('.ptitle'));
  await info.attach('desktop-truth-table-editor',{body:await guide.screenshot({path:info.outputPath('editor.png')}),contentType:'image/png'});
  await closeTools(page);
  await info.attach('truth-table-light',{body:await panel.screenshot({path:info.outputPath('light.png')}),contentType:'image/png'});
  // Use the actual exported reader for theme and print evidence; workbench chrome hides during print.
  const exportSpec=path.join(server.root,'truth-table-export.spec.json');
  await writeFile(exportSpec,await source.inputValue());
  execFileSync('python3',[path.join(repo,'tools/page_build.py'),exportSpec,'truth-table-export','--root',server.root],{cwd:repo});
  await page.context().addCookies([{name:'dv_skin',value:'aurora',url:server.origin}]);
  await page.goto(server.origin+'/truth-table-export.html');
  const exported=page.locator('.pt-truth-table');
  await info.attach('truth-table-dark',{body:await exported.screenshot({path:info.outputPath('dark.png')}),contentType:'image/png'});
  const scroll=exported.locator('.truth-table-scroll');
  await scroll.evaluate(el=>el.style.maxWidth='300px');expect(await scroll.evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(true);
  await scroll.evaluate(el=>el.style.removeProperty('max-width'));
  await page.emulateMedia({media:'print'});await expect(scroll).toHaveCSS('max-height','none');
  await expect(exported).toBeVisible();await expect(exported).toHaveCSS('background-color','rgb(255, 255, 255)');await info.attach('truth-table-print',{body:await exported.screenshot({path:info.outputPath('print.png')}),contentType:'image/png'});
});

test('truth table picker adds the panel and step controls carry, change and clear the active case',async({page,server},info)=>{
  await page.goto(server.origin+'/workbench.html');await pastePage(page,JSON.stringify(await fixture(),null,2));
  const root=page.locator('#docview'),source=page.locator('#src');
  await page.locator('#diagram-add').click();await page.locator('#add-panel').click();
  await page.locator('#panel-picker-search').fill('Truth table');await page.locator('.panel-picker-card[data-panel-type="truth-table"]').click();
  await expect(page.locator('#panel-picker')).toContainText('Properties in, UX icons out');
  await page.locator('#panel-picker-add').click();
  await expect.poll(async()=>JSON.parse(await source.inputValue()).page.sections[0].diagram.panels.length).toBe(2);
  await page.locator('#undo-builder').click();
  await closeTools(page);
  const table=root.locator('.truth-table');
  await root.getByRole('button',{name:'Next step',exact:true}).click();await expect(table.locator('[aria-current="true"]')).toContainText('Mains connected');
  await root.getByRole('button',{name:'Next step',exact:true}).click();await expect(table.locator('[aria-current="true"]')).toContainText('Mains connected');
  await root.getByRole('button',{name:'Next step',exact:true}).click();await expect(table.locator('[aria-current="true"]')).toContainText('Battery operation');
  await root.getByRole('button',{name:'Next step',exact:true}).click();await expect(table.locator('[aria-current="true"]')).toHaveCount(0);
  await page.locator('#editor-tab-steps').click();await page.locator('#steps-list [data-step-index="1"]').click();await page.locator('#editor-tab-inspect').click();
  const guide=page.locator('#guide'),patch=guide.locator('.patchedit[data-panel-state="step"]').first();await patch.locator(':scope > summary').click();
  await patch.getByLabel('Active case',{exact:true}).selectOption('low');
  await expect.poll(async()=>JSON.parse(await source.inputValue()).page.sections[0].diagram.steps[1].panels.power.active).toBe('low');
  await patch.getByLabel('Explanation',{exact:true}).fill('Low battery shown deliberately');await patch.getByLabel('Explanation',{exact:true}).press('Tab');
  await expect.poll(async()=>JSON.parse(await source.inputValue()).page.sections[0].diagram.steps[1].panels.power.note).toBe('Low battery shown deliberately');
  await info.attach('truth-table-step-editor',{body:await guide.screenshot({path:info.outputPath('editor.png')}),contentType:'image/png'});
});
