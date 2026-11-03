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
   | 2 type + value together | each value column of each case: one `[data-truth-property=<col>]` holding "<label> type" and "<label>" with the case's type/value, vertical centers within 4px and the type left of the value | today's 3-column grid that puts "Supply type" and "Supply" on different rows; a pair offset by part of a row or stacked; pairing one column's type with another's value |
   | 3 Column kind default | each unset Properties kind select shows "value (default)" with value "" and the text fits inside the select; icons columns still show "icons" | the cut-off "(Column kind)" placeholder; a label that still clips; saving kind "value" |
   | 4 case editor full width (guard) | each case card's left and right edges within 2px of the Inspect content box (#guide inside border, padding and any scrollbar) | the 88px setup label column beside the cases; a card that leaves part of the width unused (already true at origin/main 53d7bca6: guard, not a flip) |
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
  // Rows 3 and 2 read the rendered form once (no retry waits) and assert softly, so one run reports each row; row 1 stops the test.
  const kinds=guide.getByLabel('Column kind',{exact:true});await expect(kinds,'precondition: one kind select per column').toHaveCount(5);
  await page.evaluate(()=>document.fonts.ready);
  const kindState=await kinds.evaluateAll(els=>els.map(el=>{const cs=getComputedStyle(el),ctx=document.createElement('canvas').getContext('2d');ctx.font=[cs.fontStyle,cs.fontWeight,cs.fontSize,cs.fontFamily].join(' ');
    const text=el.selectedOptions[0].textContent;return {value:el.value,text,need:Math.ceil(ctx.measureText(text).width+parseFloat(cs.paddingLeft)+parseFloat(cs.paddingRight)+20),box:el.clientWidth};}));
  for(const [i,col] of authored.columns.entries()){
    const kind=kindState[i];
    if(col.kind==='icons'){expect.soft([kind.value,kind.text],`(3) ${col.id} kind`).toEqual(['icons','icons']);continue;}
    expect.soft(kind.value,`(3) ${col.id} kind stays unset`).toBe('');
    expect.soft(kind.text,`(3) ${col.id} unset kind names its default`).toBe('value (default)');
    expect.soft(kind.need,`(3) ${col.id} "${kind.text}" fits its select (arrow included)`).toBeLessThanOrEqual(kind.box);
  }
  expect.soft((await declaration()).columns.map(col=>col.kind),'(3) showing the default saves nothing').toEqual([undefined,undefined,undefined,'icons','icons']);
  expect.soft(await guide.locator('[data-truth-property]').count(),'(2) one property pair per case and value column').toBe(12);
  const caseCards=guide.locator('[data-truth-case]:not([data-truth-column])');
  await expect(caseCards,'(1) one card per case').toHaveCount(4);
  await expect(guide.locator('[data-truth-column]'),'precondition: one icon editor per case and icons column').toHaveCount(8);
  await expect(caseCards.locator('[data-truth-column]'),'(1) every icon editor sits inside a case card').toHaveCount(8);
  // Inspect content box: inside #guide's border and padding; clientWidth already excludes a scrollbar.
  const contentBox=()=>guide.evaluate(el=>{const r=el.getBoundingClientRect(),cs=getComputedStyle(el);const left=r.left+el.clientLeft+parseFloat(cs.paddingLeft);return {left,right:left+el.clientWidth-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight)};});
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
      expect(Math.abs((a.y+a.height/2)-(b.y+b.height/2)),`(2) ${row.id} ${col.id} type and value share one visual row (centers)`).toBeLessThanOrEqual(4);
      expect(a.x+a.width,`(2) ${row.id} ${col.id} type sits left of its value`).toBeLessThanOrEqual(b.x+1);
    }
    const content=await contentBox(),box=await card.boundingBox();
    expect(Math.abs(box.x-content.left),`(4) ${row.id} card starts at the Inspect content left edge`).toBeLessThanOrEqual(2);
    expect(Math.abs(box.x+box.width-content.right),`(4) ${row.id} card ends at the Inspect content right edge`).toBeLessThanOrEqual(2);
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

/* #921 contract, slice 2 "No active case" (issue #921 "How it should look" 5 + "Test + flip";
   Chuck 2026-11-03 §0 ruling: "extend existing tests"; hosted in the test below). Fixture: the
   shipped example (cases solar/mains/battery/low; initial.active "solar"; step 2 only sets a
   note and inherits). Every choice is made with real input in the visible Active case control.
   | row | assertion (scoped to that editor's Active case control and the saved JSON) | rejects |
   | A step control: one dropdown | step 2 control options exactly [Inherit previous, 4 case labels, No active case]; no "Active case assignment" control in that editor | today's raw IDs plus the separate assignment dropdown; adding labels but keeping the second dropdown |
   | B Starting state control: one dropdown | Starting state options exactly [Use panel default, 4 case labels, No active case]; no assignment control | a fix applied to steps only |
   | C step No active case | choosing it saves steps[2].panels.power.active === null (key present, note kept) and step 2 highlights no row (was Low battery) | saving omission (inherits Low battery); dropping the note |
   | D Starting state No active case | saves initial.active === null (key present) and step 0 highlights no row (was Solar charging) | omitting initial.active; a step-only fix |
   | E a label commits its ID | choosing "Battery operation" saves "battery" and highlights Battery operation; selectOption('low') still saves "low" | committing the label text |
   | F Inherit previous removes the assignment | after null, choosing it deletes steps[2].panels.power.active and step 2 inherits Low battery again | treating inherit as null |
   | G IDs where needed | after real renames (solar -> "No active case", mains -> blank, battery -> "Low battery"): options read [Use panel default, No active case (solar), mains, Low battery (battery), Low battery (low), No active case] | duplicate or reserved texts left ambiguous; a blank label shown as "" |
   | H shows the current choice | step 1 shows Low battery checked; Starting state shows Solar charging; an inheriting step shows Inherit previous | an unselected control after save |
   | active opts out of the shared selector; Explanation keeps it | Node (tests/truth-table-panel.test.js): merged initial and step presentation meta: active.assignment === false, note.assignment !== false | a global change to every panel's assignment selector |
   | template keeps initial.active "solar" | Node: picker example's initial is {active:"solar"} | changing the template default |
   | phone width | excluded — desktop-only editing (CLAUDE.md) | */
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
  await expect(table.locator('[aria-current="true"]'),'precondition: step 0 starts on Solar charging').toContainText('Solar charging');
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
  // #921 slice 2 (matrix above): one Active case control with case labels and No active case, in steps and Starting state.
  const diagram=async()=>JSON.parse(await source.inputValue()).page.sections[0].diagram;
  const labels=['Solar charging','Mains connected','Battery operation','Low battery'],current=table.locator('[aria-current="true"]');
  const activeCase=editor=>editor.getByLabel('Active case',{exact:true});
  const open=async editor=>{await expect(editor).toHaveCount(1);if(await editor.getAttribute('open')===null)await editor.locator(':scope > summary').click();};
  await expect(activeCase(patch).locator('option:checked'),'(H) step 1 shows its saved case by label').toHaveText('Low battery');
  await page.locator('#editor-tab-steps').click();await page.locator('#steps-list [data-step-index="2"]').click();await page.locator('#editor-tab-inspect').click();
  await expect(current,'precondition: step 2 inherits Low battery').toContainText('Low battery');
  const step2=guide.locator('.patchedit[data-panel-state="step"]');await open(step2);
  expect(await activeCase(step2).locator('option').allTextContents(),'(A) step options: inherit, case labels, No active case').toEqual(['Inherit previous',...labels,'No active case']);
  await expect(activeCase(step2).locator('option:checked'),'(H) an inheriting step shows Inherit previous').toHaveText('Inherit previous');
  await expect(step2.getByLabel('Active case assignment',{exact:true}),'(A) no separate assignment dropdown').toHaveCount(0);
  await activeCase(step2).selectOption({label:'Battery operation'});
  await expect.poll(async()=>(await diagram()).steps[2].panels.power.active,'(E) a case label saves its ID').toBe('battery');
  await expect(current,'(E) step 2 highlights the chosen case').toContainText('Battery operation');
  await activeCase(step2).selectOption({label:'No active case'});
  await expect.poll(async()=>{const p=(await diagram()).steps[2].panels.power;return [Object.hasOwn(p,'active'),p.active,p.note];},'(C) step 2 saves active:null and keeps its note').toEqual([true,null,'The mains case stays highlighted until another case is selected.']);
  await expect(current,'(C) step 2 highlights no case').toHaveCount(0);
  await activeCase(step2).selectOption({label:'Inherit previous'});
  await expect.poll(async()=>Object.hasOwn((await diagram()).steps[2].panels.power,'active'),'(F) Inherit previous removes the assignment').toBe(false);
  await expect(current,'(F) step 2 inherits Low battery again').toContainText('Low battery');
  await inspectPageElement(page,root.locator('.pt-truth-table .ptitle'));
  const starting=guide.locator('.patchedit[data-panel-state="initial"]');await open(starting);
  expect(await activeCase(starting).locator('option').allTextContents(),'(B) Starting state options: panel default, case labels, No active case').toEqual(['Use panel default',...labels,'No active case']);
  await expect(activeCase(starting).locator('option:checked'),'(H) Starting state shows Solar charging').toHaveText('Solar charging');
  await expect(starting.getByLabel('Active case assignment',{exact:true}),'(B) no separate assignment dropdown').toHaveCount(0);
  await activeCase(starting).selectOption({label:'No active case'});
  await expect.poll(async()=>{const initial=(await diagram()).panels[0].initial;return [Object.hasOwn(initial,'active'),initial.active];},'(D) Starting state saves active:null').toEqual([true,null]);
  await page.locator('#editor-tab-steps').click();await page.locator('#steps-list [data-step-index="0"]').click();
  await expect(current,'(D) step 0 starts with no highlighted case').toHaveCount(0);
  // (G) Labels that collide, are blank or reuse a reserved choice are told apart by ID.
  await inspectPageElement(page,root.locator('.pt-truth-table .ptitle'));
  for(const [id,label] of [['solar','No active case'],['mains',''],['battery','Low battery']]){
    const field=guide.locator(`[data-truth-case="${id}"]:not([data-truth-column])`).getByLabel('Case label',{exact:true});
    await field.fill(label);await field.press('Tab');
    await expect.poll(async()=>(await diagram()).panels[0].cases.find(row=>row.id===id).label,`precondition: ${id} renamed`).toBe(label||undefined);
  }
  await open(starting);
  expect(await activeCase(starting).locator('option').allTextContents(),'(G) IDs tell duplicate, blank and reserved labels apart').toEqual(['Use panel default','No active case (solar)','mains','Low battery (battery)','Low battery (low)','No active case']);
});
