import {test,expect,paste} from '../helpers/test.mjs';
import {editorSpec,source} from '../fixtures/editor-spec.mjs';

const open=async(page,kind)=>{
  await page.locator('#diagram-add').click();
  await page.locator('[data-add-kind='+kind+']').click();
};
const text=page=>page.locator('#src').inputValue();
const spec=async page=>JSON.parse(await text(page));

test('persistent Add entry targets tab sections and preserves one-change Undo/Redo',async({page,server})=>{
  const raw=editorSpec();
  raw.page.blocks.push({tabs:[{label:'Overview',sections:[{heading:'Overview',diagram:{nodes:{x:{title:'Overview node'}},rows:[['x']]}}]},
    {label:'Operations',sections:[{heading:'Cloud processing',diagram:{nodes:{y:{title:'Cloud'}},rows:[['y']]}}]}]});
  const original=JSON.stringify(raw,null,2);
  await page.goto(server.origin+'/workbench.html');await paste(page,original);
  const add=page.locator('#diagram-add'),target=page.locator('#diagram-add-target');
  expect((await add.boundingBox()).y).toBeLessThan((await page.locator('.editor-tabs').boundingBox()).y);
  await page.locator('#editor-tab-json').click();
  await target.selectOption('2');
  await expect(page.locator('#tab-1-1')).toHaveAttribute('aria-selected','true');
  await expect(page.locator('#editor-tab-json')).toHaveAttribute('aria-selected','true');
  await expect(target.locator('option:checked')).toContainText('Operations');
  await add.focus();await page.keyboard.press('Enter');
  await expect(page.locator('#diagram-add-menu')).toBeVisible();
  await page.locator('#diagram-add-preset').selectOption({label:'Service'});
  await page.locator('#add-node').click();
  const inserted=await spec(page),diagram=inserted.page.blocks[1].tabs[1].sections[0].diagram;
  expect(Object.values(diagram.nodes).map(n=>n.title)).toEqual(['Cloud','Service']);
  expect(inserted.page.blocks[0]).toEqual(raw.page.blocks[0]);
  expect(inserted.page.blocks[1].tabs[0]).toEqual(raw.page.blocks[1].tabs[0]);
  const after=await text(page);
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);
  await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(after);
  await target.selectOption('0');await open(page,'edge');await page.locator('#add-edge').click();
  await expect(add).toBeDisabled();await expect(target).toBeDisabled();
  // A source outside the selected section cannot silently retarget the addition.
  await page.locator('[data-dv-node=y]').click();await expect(page.locator('#btarget')).toContainText('section 1');
  await page.locator('[data-dv-node=b]').click();await page.locator('[data-dv-node=c]').click();
  expect((await spec(page)).page.blocks[0].diagram.edges).toHaveLength(2);
  await expect(add).toBeEnabled();
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(after);
});

test('chooser adds to the selected path, opens the existing panel library, and adds page structure',async({page,server})=>{
  const raw=editorSpec();delete raw.page.blocks[0].diagram.layouts;delete raw.page.blocks[0].diagram.defaultLayout;
  const original=JSON.stringify(raw,null,2);
  await page.goto(server.origin+'/workbench.html');await paste(page,original);
  await page.locator('#editor-tab-steps').click();await page.locator('#steps-path').selectOption('failed');
  await open(page,'step');await page.locator('#add-step').click();
  const added=await spec(page),d=added.page.blocks[0].diagram;
  expect(d.steps).toHaveLength(4);expect(d.paths[0]).toEqual(raw.page.blocks[0].diagram.paths[0]);expect(d.paths[1].steps).toHaveLength(2);
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);
  await open(page,'panel');await page.locator('#add-panel').click();
  await expect(page.locator('#diagram-add-menu')).toBeHidden();await expect(page.locator('#panel-picker')).toBeVisible();
  await page.locator('.panel-picker-card[data-panel-type=screen]').click();await page.locator('#panel-picker-add').click();
  expect((await spec(page)).page.blocks[0].diagram.panels.at(-1).type).toBe('screen');
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);
  await open(page,'panel');await page.locator('#add-panel').click();await page.keyboard.press('Escape');
  await expect(page.locator('#diagram-add')).toBeFocused();
  for(const action of ['section','tabs']){
    await open(page,'node');await page.locator('.diagram-add-structure summary').click();await page.locator('#add-'+action).click();
    expect((await spec(page)).page.blocks).toHaveLength(2);
    await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);
  }
});

test('chooser cancels cleanly, blocks stale/invalid source, and retires on builder remount',async({page,server})=>{
  await page.goto(server.origin+'/lifetime/index.html');await paste(page,source);
  await open(page,'node');await page.keyboard.press('Delete');await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('#src')).toHaveValue(source);await page.keyboard.press('Escape');
  await expect(page.locator('#diagram-add')).toBeFocused();
  await open(page,'node');
  const changed=source.replace('Browser contract','Changed while choosing');
  await page.evaluate(changed=>{const src=document.querySelector('#src');src.value=changed;src.dispatchEvent(new Event('input',{bubbles:true}));},changed);
  await expect(page.locator('#add-node')).toBeDisabled();await expect(page.locator('#diagram-add-error')).toContainText('changed');
  await page.evaluate(()=>document.querySelector('#add-node').click());await expect(page.locator('#src')).toHaveValue(changed);
  await page.keyboard.press('Escape');
  await page.evaluate(()=>{const src=document.querySelector('#src');src.value='{';src.dispatchEvent(new Event('input',{bubbles:true}));});
  await open(page,'step');await expect(page.locator('#add-step')).toBeDisabled();await expect(page.locator('#diagram-add-error')).toBeVisible();
  await page.evaluate(()=>__editorTest.builder.destroy());await expect(page.locator('#diagram-add-menu')).toBeHidden();
  await page.evaluate(source=>{document.querySelector('#src').value=source;__editorTest.remount();},source);
  await open(page,'node');await page.locator('#add-node').click();
  expect(Object.keys((await spec(page)).page.blocks[0].diagram.nodes)).toHaveLength(4);
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(source);
});

test('Add UI stays within a narrow editor and its modal fits supported skins',async({page,server},testInfo)=>{
  await page.goto(server.origin+'/workbench.html');await paste(page,source);
  await page.locator('#workspace-columns').focus();await page.keyboard.press('Home');
  const box=await page.locator('.workspace-tools').boundingBox();
  for(const id of ['diagram-add','diagram-add-target']){
    const child=await page.locator('#'+id).boundingBox();expect(child.x+child.width).toBeLessThanOrEqual(box.x+box.width);
  }
  for(const skin of ['pastel','aurora','daylight','editorial','terminal','blueprint']){
    await page.locator('#sk-'+skin).click();
    await open(page,'node');
    const dialog=page.locator('#diagram-add-menu');
    expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
    await expect(page.locator('#add-node')).toBeInViewport();
    if(skin==='pastel')await testInfo.attach('add-chooser-pastel',{body:await page.screenshot(),contentType:'image/png'});
    await page.keyboard.press('Escape');
  }
  await page.setViewportSize({width:720,height:800});await open(page,'panel');
  await expect(page.locator('#add-panel')).toBeInViewport();
  expect(await page.locator('#diagram-add-menu').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
});
