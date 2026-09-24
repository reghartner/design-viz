import {readFile} from 'node:fs/promises';
import {test,expect,paste} from '../helpers/test.mjs';
import {source,editorSpec} from '../fixtures/editor-spec.mjs';

async function open(page,server){await page.goto(server.origin+'/workbench.html');await paste(page,source);}

test('left rail and full-height editor share the left edge; global actions stay above all workspaces',async({page,server},testInfo)=>{
  await open(page,server);
  const rail=await page.locator('.workspace-rail').boundingBox(),editor=await page.locator('#spec-editor').boundingBox();
  const split=await page.locator('#workspace-columns').boundingBox(),preview=await page.locator('.workmain').boundingBox();
  expect(rail.x+rail.width).toBeLessThanOrEqual(editor.x+1);expect(editor.x+editor.width).toBeLessThanOrEqual(split.x+1);expect(split.x+split.width).toBeLessThanOrEqual(preview.x+1);
  await expect(page.locator('#workspace-expand')).toHaveCount(0);await expect(page.locator('#spec-editor > summary')).toHaveCount(0);
  await expect(page.locator('#editor-tab-file')).toBeInViewport();
  expect(editor.y+editor.height).toBeLessThanOrEqual(page.viewportSize().height);
  for(const name of ['inspect','steps','outline','json','file']){
    await page.locator('#editor-tab-'+name).click();
    await expect(page.locator('.editor-pane:visible')).toHaveCount(1);
    await expect(page.locator('#editor-'+name)).toBeVisible();
    const boxes=await Promise.all(['diagram-add','undo-builder','redo-builder','file-save'].map(id=>page.locator('#'+id).boundingBox()));
    for(const box of boxes)expect(box.y+box.height).toBeLessThan(editor.y);
    expect(Math.max(...boxes.map(b=>b.y+b.height/2))-Math.min(...boxes.map(b=>b.y+b.height/2))).toBeLessThan(3);
    await expect(page.locator('.workspace-tools [data-open-human-guide]')).toBeVisible();
  }
  await page.locator('#editor-tab-inspect').click();await page.locator('[data-dv-node="a"]').click();
  await testInfo.attach('left-editor',{body:await page.screenshot(),contentType:'image/png'});
});

test('drag and keyboard resize move the left boundary naturally without replacing the draft or preview',async({page,server})=>{
  await open(page,server);
  await page.locator('#editor-tab-json').click();const src=page.locator('#src'),draft=source+'\n  ';await src.fill(draft);
  const handle=await src.elementHandle(),preview=await page.locator('#docview .doc-sec').first().elementHandle();
  const split=page.locator('#workspace-columns'),before=Number(await split.getAttribute('aria-valuenow')),b=await split.boundingBox();
  await page.mouse.move(b.x+b.width/2,b.y+90);await page.mouse.down();await page.mouse.move(b.x+b.width/2+100,b.y+90,{steps:8});await page.mouse.up();
  await expect(split).toHaveAttribute('aria-valuenow',String(before+100));
  await split.focus();await page.keyboard.press('ArrowRight');await expect(split).toHaveAttribute('aria-valuenow',String(before+120));
  await page.keyboard.press('Shift+ArrowLeft');await expect(split).toHaveAttribute('aria-valuenow',String(before+70));
  await expect(src).toHaveValue(draft);expect(await handle.evaluate(e=>e===document.querySelector('#src'))).toBe(true);expect(await preview.evaluate(e=>e.isConnected)).toBe(true);
  await page.locator('[data-dv-node="a"]').click();await expect(page.locator('#editor-tab-json')).toHaveAttribute('aria-selected','true');await expect(src).toHaveValue(draft);
  await page.locator('[data-dv-node="b"]').click({modifiers:['Shift']});
  await expect(page.locator('#editor-tab-json')).toHaveAttribute('aria-selected','true');
  await page.locator('[data-dv-node="b"]').click({modifiers:['Shift']});
  await expect(page.locator('#editor-tab-json')).toHaveAttribute('aria-selected','true');await expect(src).toHaveValue(draft);
  await page.locator('#editor-tab-file').click();await page.locator('.workspace-preferences summary').click();await page.locator('#workspace-reset').click();
  await expect(split).toHaveAttribute('aria-valuenow','440');await expect(page.locator('#editor-tab-file')).toHaveAttribute('aria-selected','true');
  await handle.dispose();await preview.dispose();
});

test('outline shortcut and selection stay in Outline; explicit inspection opens the selected object',async({page,server})=>{
  await open(page,server);await page.locator('#editor-tab-json').click();
  await page.keyboard.press('ControlOrMeta+k');await expect(page.locator('#editor-outline')).toBeVisible();await expect(page.locator('#outline-search')).toBeFocused();
  await page.locator('#outline-search').fill('Doorbell');await page.locator('.outline-item').filter({hasText:'node · Doorbell'}).click();
  await expect(page.locator('#editor-outline')).toBeVisible();await page.locator('#outline-inspect').click();
  const title=page.locator('#guide').getByLabel('title',{exact:true});await expect(title).toHaveValue('Doorbell');
  await title.fill('Front camera');await title.press('Enter');await expect(title).toBeFocused();
  await page.locator('#editor-tab-file').click();await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(source);
  await page.locator('#redo-builder').click();expect(JSON.parse(await page.locator('#src').inputValue()).page.blocks[0].diagram.nodes.a.title).toBe('Front camera');
});

test('File hosts company catalog, imports and exports; global Save works from JSON',async({page,server})=>{
  await open(page,server);await page.locator('#editor-tab-file').click();
  await page.locator('#editor-company summary').click();await expect(page.getByRole('textbox',{name:'Catalog JSON',exact:true})).toBeVisible();
  await page.locator('#sec-insert > summary').click();await page.locator('#import-mermaid').click();await expect(page.locator('#importbox')).toBeVisible();
  await page.locator('#editor-tab-json').click();await page.locator('#editor-tab-file').click();await expect(page.locator('#importbox')).toBeVisible();
  await page.locator('#import-mermaid-cancel').click();
  const exportedPromise=page.waitForEvent('download');await page.locator('#confluence-export').click();const exported=await exportedPromise;
  expect(exported.suggestedFilename()).toContain('confluence');expect(JSON.parse(await readFile(await exported.path(),'utf8'))).toBeTruthy();
  await page.locator('#editor-tab-json').click();const savePromise=page.waitForEvent('download');await page.locator('#file-save').click();const saved=await savePromise;
  expect(JSON.parse(await readFile(await saved.path(),'utf8')).page.title).toBe(editorSpec().page.title);
});

test('wide step inspectors share space with nested panel controls and retain their state when changing tools',async({page,server},testInfo)=>{
  await page.setViewportSize({width:1800,height:1100});await open(page,server);
  await page.locator('#editor-tab-steps').click();await page.locator('#steps-list [data-step-index="0"]').click();await page.locator('#steps-inspect').click();
  const divider=page.locator('#workspace-columns');await divider.focus();await page.keyboard.press('End');
  const story=await page.locator('.step-form-story').boundingBox(),panels=await page.locator('.step-form-panels').boundingBox();
  expect(panels.x).toBeGreaterThan(story.x);expect(Math.abs(panels.y-story.y)).toBeLessThan(2);
  const sourceBefore=await page.locator('#src').inputValue();
  const fold=page.locator('.step-form-panels details').first();await fold.evaluate(e=>{e.open=true;});
  await page.locator('#editor-tab-json').click();await page.locator('#editor-tab-inspect').click();await expect(fold).toHaveAttribute('open','');
  await expect(page.locator('#src')).toHaveValue(sourceBefore);
  await testInfo.attach('wide-step-editor',{body:await page.screenshot(),contentType:'image/png'});
  await fold.locator(':scope > summary').click();await expect(fold).not.toHaveAttribute('open','');
  const caption=page.locator('#guide').getByLabel('text',{exact:true});await caption.fill('Edited while Home is collapsed');await caption.press('Tab');
  await expect(page.locator('.panel-step-group')).not.toHaveAttribute('open','');
  expect(JSON.parse(await page.locator('#src').inputValue()).page.blocks[0].diagram.steps[0].text).toBe('Edited while Home is collapsed');
  await page.locator('#workspace-home').click();await paste(page,source);
  await page.locator('#editor-tab-steps').click();await page.locator('#steps-list [data-step-index="0"]').click();await page.locator('#steps-inspect').click();
  await expect(page.locator('.panel-step-group')).toHaveAttribute('open','');
  for(const width of [1280,1024,820,720]){
    await page.setViewportSize({width,height:900});
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),{message:'Workspace fits '+width+'px after responsive layout settles'}).toBe(true);
  }
});

test('panel disclosure state is independent between sections with the same panel ID',async({page,server})=>{
  const spec=editorSpec();spec.page.blocks.push(structuredClone(spec.page.blocks[0]));spec.page.blocks[1].heading='Other delivery';
  await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(spec));
  const inspectStep=async section=>{
    await page.locator('#editor-tab-steps').click();await page.locator('#steps-section').selectOption(String(section));
    await page.locator('#steps-list [data-step-index="0"]').click();await page.locator('#steps-inspect').click();
  };
  await inspectStep(0);await page.locator('.panel-step-group > summary').click();
  await expect(page.locator('.panel-step-group')).not.toHaveAttribute('open','');
  await inspectStep(1);await expect(page.locator('.panel-step-group')).toHaveAttribute('open','');
  await inspectStep(0);await expect(page.locator('.panel-step-group')).not.toHaveAttribute('open','');
});
