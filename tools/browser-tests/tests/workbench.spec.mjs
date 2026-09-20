import {test,expect,paste,pointerTo} from '../helpers/test.mjs';
import {source} from '../fixtures/editor-spec.mjs';
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
  await undo.click();await expect(src).toHaveValue(handwritten);await redo.click();await expect(src).toHaveValue(replacement);
});
