import {test,expect,paste,pointerTo} from '../helpers/test.mjs';
import {source} from '../fixtures/editor-spec.mjs';

for(const canvas of [false,true])test(`Undo and Redo preserve closed and open Inspector state in ${canvas?'Canvas':'Standard'}`,async({page,server})=>{
  const raw=JSON.parse(source);if(canvas)raw.page.blocks[0].diagram.layouts[0].presentation='explore';
  const original=JSON.stringify(raw,null,2);await page.goto(server.origin+'/workbench.html');await paste(page,original);
  const src=page.locator('#src'),inspect=page.locator('#workspace-window-inspect'),json=page.locator('#workspace-window-json'),disclosure=page.locator('#sec-inspect');
  const node=page.locator('[data-dv-node="a"]');await node.click();
  const title=page.locator('#guide').getByLabel('title',{exact:true});await title.fill('Edited camera');await title.press('Enter');
  const edited=await src.inputValue();expect(edited).not.toBe(original);
  // The floating workspace hides this legacy disclosure summary, but history
  // must still preserve a collapsed state restored by an older workspace.
  await disclosure.evaluate(el=>el.open=false);await expect(disclosure).not.toHaveAttribute('open','');
  if(await inspect.isVisible())await inspect.locator('.workspace-window-close').click();await page.locator('#editor-tab-json').click();
  await expect(inspect).toBeHidden();await expect(json).toBeVisible();await expect(page.locator('#editor-tab-json')).toHaveAttribute('aria-pressed','true');

  await page.locator('#undo-builder').click();await expect(src).toHaveValue(original);
  await expect(inspect).toBeHidden();await expect(json).toBeVisible();await expect(disclosure).not.toHaveAttribute('open','');await expect(page.locator('#builder-history-status')).toBeVisible();await expect(page.locator('#builder-history-status')).toHaveText('Undo complete');
  await page.locator('#redo-builder').click();await expect(src).toHaveValue(edited);
  await expect(inspect).toBeHidden();await expect(json).toBeVisible();await expect(disclosure).not.toHaveAttribute('open','');await expect(page.locator('#builder-history-status')).toHaveText('Redo complete');

  await page.locator('#editor-tab-inspect').click();await disclosure.evaluate(el=>el.open=false);await expect(disclosure).not.toHaveAttribute('open','');
  await page.locator('#undo-builder').click();await expect(src).toHaveValue(original);await expect(disclosure).not.toHaveAttribute('open','');
  await page.locator('#redo-builder').click();await expect(src).toHaveValue(edited);await expect(disclosure).not.toHaveAttribute('open','');
  await disclosure.evaluate(el=>el.open=true);await node.click();await expect(disclosure).toHaveAttribute('open','');
  const openTitle=page.locator('#guide').getByLabel('title',{exact:true});await openTitle.fill('Second edit');await openTitle.press('Enter');
  await page.locator('#undo-builder').click();await expect(inspect).toBeVisible();await expect(page.locator('#guide')).toContainText('undid the last builder action');
  await expect(page.locator('.dv-sel')).toHaveCount(0);await expect(page.locator('#editor-tab-inspect')).toHaveAttribute('aria-pressed','true');
  await page.locator('#redo-builder').click();await expect(inspect).toBeVisible();await expect(page.locator('#guide')).toContainText('redid the builder action');
  await expect(page.locator('.dv-sel')).toHaveCount(0);await expect(page.locator('#editor-tab-inspect')).toHaveAttribute('aria-pressed','true');
});

test('committed editor preserves exact source, focused edits, hidden paths, pointer Undo and retired file reads',async({page,server})=>{
  await page.addInitScript(()=>{
    const Native=FileReader;
    window.FileReader=class extends Native{
      get result(){return this.heldText===undefined?super.result:this.heldText;}
      readAsText(file,...args){if(file.name!=='pending.json')return super.readAsText(file,...args);window.__heldRead=this;this.pendingText=file.text();}
    };
    window.__releaseRead=async()=>{const reader=window.__heldRead;reader.heldText=await reader.pendingText;reader.onload?.(new ProgressEvent('load'));};
  });
  await page.goto(server.origin+'/workbench.html');await paste(page,source);
  const src=page.locator('#src'),undo=page.locator('#undo-builder'),redo=page.locator('#redo-builder');
  const node=id=>page.locator(`[data-dv-node="${id}"]`);
  await node('a').click();
  const title=page.locator('#guide').getByLabel('title',{exact:true});await title.fill('Front camera');await title.press('Enter');
  const edited=source.replace('"title": "Doorbell"','"title": "Front camera"');
  await expect(src).toHaveValue(edited);await expect(title).toBeFocused();
  await page.locator('#editor-tab-json').click();const handwritten=edited+'\n  ';await src.fill(handwritten);
  await undo.click();await expect(src).toHaveValue(source);await redo.click();await expect(src).toHaveValue(handwritten);
  await page.locator('#editor-tab-inspect').click();
  await pointerTo(page,node('b'),node('c'));
  expect(JSON.parse(await src.inputValue()).page.blocks[0].diagram.rows).toEqual([['a','c','b']]);
  await undo.click();await expect(src).toHaveValue(handwritten);
  await page.locator('#editor-tab-steps').click();await page.locator('#steps-path').selectOption('failed');
  await expect(page.locator('#steps-path')).toHaveValue('failed');
  await page.locator('#steps-list [data-step-index="2"]').click();await page.locator('#editor-tab-inspect').click();
  const text=page.locator('#guide').getByLabel('text',{exact:true});await text.fill('Failure still exact');await text.press('Tab');
  const d=JSON.parse(await src.inputValue()).page.blocks[0].diagram;
  expect(d.steps[2].text).toBe('Failure still exact');expect(d.layouts[0].steps).toEqual(['done']);
  await expect(page.locator('.playback-status')).toContainText(/hidden step/i);
  await expect(page.locator('#steps-path')).toHaveValue('failed');
  await undo.click();await expect(src).toHaveValue(handwritten);
  await page.locator('#file-input').setInputFiles({name:'pending.json',mimeType:'application/json',buffer:Buffer.from(source.replace('Browser contract','STALE FILE'))});
  await page.waitForFunction(()=>!!window.__heldRead);await page.locator('#workspace-home').click();
  const replacement=source.replace('Browser contract','Replacement project');await paste(page,replacement);
  await page.evaluate(()=>__releaseRead());await expect(src).toHaveValue(replacement);
  await expect(undo).toBeDisabled();await expect(redo).toBeDisabled();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('dv-workbench-earlier-drafts')).map(entry=>entry.text))).toContain(handwritten);
  await page.locator('#editor-tab-json').focus();await page.keyboard.press('ControlOrMeta+z');await expect(src).toHaveValue(replacement);
});
