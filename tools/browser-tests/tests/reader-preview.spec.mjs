import {test,expect,paste} from '../helpers/test.mjs';
import {editorSpec} from '../fixtures/editor-spec.mjs';

function longReaderSpec(){
  const raw=editorSpec(),section=raw.page.blocks[0];
  section.heading='Reader preview section';
  section.text=Array.from({length:18},(_,index)=>('Reader-facing context paragraph '+(index+1)+'. ').repeat(5));
  section.diagram.layouts[0].steps=['press','done','failed'];
  return JSON.stringify(raw,null,2);
}

test('read-only page preview is a separate interactive reader and returns without editing source',async({page,server})=>{
  const source=longReaderSpec();
  await page.goto(server.origin+'/workbench.html');await paste(page,source);

  await page.locator('#workspace-appearance>summary').click();await page.locator('#sk-terminal').click();
  await page.locator('#docview .path-chip[data-dv-path="failed"]').first().click();
  await expect(page.locator('#docview .path-chip[data-dv-path="failed"]').first()).toHaveAttribute('aria-pressed','true');
  const canvas=page.locator('#workspace-canvas');
  await canvas.evaluate(element=>{element.scrollTop=240;});
  const canvasScroll=await canvas.evaluate(element=>element.scrollTop);

  await page.locator('#workbench-reader-open').click();
  const reader=page.locator('#workbench-reader'),back=page.locator('#workbench-reader-back');
  await expect(page.locator('#workbench-workspace')).toBeHidden();
  await expect(page.locator('.workbench-header')).toBeHidden();
  await expect(reader).toBeVisible();await expect(reader).toHaveClass(/sk-terminal/);
  await expect(back).toBeFocused();
  await expect(reader.locator('.path-chip[data-dv-path="failed"]').first()).toHaveAttribute('aria-pressed','true');
  await expect(reader.locator('.dv-rowgrab,.home-layout-button,.workspace-window,.workspace-rail,.workspace-canvas-controls')).toHaveCount(0);

  await reader.locator('.path-chip[data-dv-path="happy"]').first().click();
  await expect(reader.locator('.path-chip[data-dv-path="happy"]').first()).toHaveAttribute('aria-pressed','true');
  await reader.getByRole('button',{name:'Next step'}).first().click();
  await reader.locator('.node').first().click();await page.keyboard.press('Delete');
  await expect(page.locator('#src')).toHaveValue(source);

  await page.setViewportSize({width:520,height:640});
  await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
  expect(await back.evaluate(element=>getComputedStyle(element).position)).toBe('fixed');
  const backBox=await back.boundingBox();expect(backBox.y).toBeLessThanOrEqual(12);
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),{message:'Reader preview fits the narrow viewport'}).toBe(true);

  await back.click();
  await expect(page.locator('#workbench-reader-preview')).toBeHidden();
  await expect(page.locator('#workbench-workspace')).toBeVisible();
  await expect(page.locator('.workbench-header')).toBeVisible();
  await expect(page.locator('#workbench-reader-open')).toBeFocused();
  await expect(page.locator('#workbench-reader-open')).toBeInViewport();
  await expect(page.locator('#src')).toHaveValue(source);
  expect(await canvas.evaluate(element=>element.scrollTop)).toBe(canvasScroll);
  await expect(page.locator('#docview .path-chip[data-dv-path="failed"]').first()).toHaveAttribute('aria-pressed','true');
});
