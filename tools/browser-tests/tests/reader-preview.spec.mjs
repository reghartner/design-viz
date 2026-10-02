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
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.goto(server.origin+'/workbench.html');await paste(page,source);

  await page.locator('#workspace-appearance>summary').click();await page.locator('#sk-terminal').click();
  await page.locator('#docview .path-chip[data-dv-path="happy"]').first().click();
  await expect(page.locator('#docview .stepline').first()).toContainText('Button pressed');
  const workspaceHandle=await page.locator('#workbench-workspace').elementHandle();
  const authorViewHandle=await page.locator('#docview').elementHandle();
  const sourceHandle=await page.locator('#src').elementHandle();
  const authorNode=await page.locator('#docview .node[data-dv-node="a"]').first().elementHandle();
  const authorEdge=await page.locator('#docview path.edge[data-dv-edge="0"]').first().elementHandle();
  const authorCoin=await page.locator('#docview .coin[data-dv-step="0"]').first().elementHandle();
  for(const handle of [authorNode,authorEdge,authorCoin])expect(await handle.evaluate(element=>element.classList.contains('lit'))).toBe(true);
  await page.locator('#docview .playback-button').first().click();
  await expect(page.locator('#docview .playback-status').first()).toContainText('Playing');
  const authorPlayback=await page.locator('#docview .playback-status').first().elementHandle();
  const canvas=page.locator('#workspace-canvas');
  await canvas.evaluate(element=>{element.scrollTop=240;});
  const canvasScroll=await canvas.evaluate(element=>element.scrollTop);

  await page.setViewportSize({width:1800,height:900});
  await page.locator('#workbench-reader-open').click();
  const surface=page.locator('#workbench-reader-preview');
  const reader=page.locator('#workbench-reader'),back=page.locator('#workbench-reader-back');
  await expect(page.locator('#workbench-workspace')).toBeHidden();
  expect(await workspaceHandle.evaluate(element=>element.isConnected)).toBe(true);
  await expect(page.locator('#docview')).toHaveCount(0);
  expect(await authorViewHandle.evaluate(element=>element.isConnected)).toBe(false);
  expect(await authorPlayback.textContent()).toContain('Paused');
  await expect(page.locator('.workbench-header')).toBeHidden();
  await expect(reader).toBeVisible();await expect(reader).toHaveClass(/sk-terminal/);
  await expect(back).toBeFocused();
  const desktopBox=await reader.boundingBox();
  expect(desktopBox.x).toBe(0);expect(desktopBox.width).toBe(1800);
  await expect(surface).toHaveCSS('padding-left','0px');
  await expect(reader).toHaveCSS('max-width','none');
  await expect(reader).toHaveCSS('border-left-width','0px');
  await expect(reader.locator('.path-chip[data-dv-path="happy"]').first()).toHaveAttribute('aria-pressed','true');
  await expect(reader.locator('.stepline').first()).toContainText('Button pressed');
  await expect(reader.locator('.node[data-dv-node="a"]').first()).toHaveClass(/\blit\b/);
  await expect(reader.locator('path.edge[data-dv-edge="0"]').first()).toHaveClass(/\blit\b/);
  await expect(reader.locator('.coin[data-dv-step="0"]').first()).toHaveClass(/\blit\b/);
  await expect(reader.locator('.dv-rowgrab,.home-layout-button,.workspace-window,.workspace-rail,.workspace-canvas-controls')).toHaveCount(0);

  await reader.getByRole('button',{name:'Next step'}).first().click();
  await expect(reader.locator('.stepline').first()).toContainText('Recording ready');
  await expect(reader.locator('.node[data-dv-node="a"]').first()).not.toHaveClass(/\blit\b/);
  await expect(reader.locator('.node[data-dv-node="b"]').first()).toHaveClass(/\blit\b/);
  await expect(reader.locator('path.edge[data-dv-edge="0"]').first()).not.toHaveClass(/\blit\b/);
  await expect(reader.locator('.coin[data-dv-step="0"]').first()).not.toHaveClass(/\blit\b/);
  await reader.locator('.playback-button').first().click();
  await expect(reader.locator('.playback-status').first()).toContainText('Playing');
  await expect(reader.locator('path.edge[data-dv-edge="0"]').first()).toHaveClass(/\blit\b/);
  await expect(reader.locator('.coin[data-dv-step="0"]').first()).toHaveClass(/\blit\b/);
  await reader.locator('.playback-button').first().click();
  await reader.locator('.path-chip[data-dv-path="failed"]').first().click();
  await expect(reader.locator('.comm-failure[data-dv-edge="0"]').first()).toBeVisible();
  await reader.locator('.node').first().click();await page.keyboard.press('Delete');
  expect(await sourceHandle.inputValue()).toBe(source);
  for(const handle of [authorNode,authorEdge,authorCoin])expect(await handle.evaluate(element=>element.classList.contains('lit'))).toBe(true);

  await page.setViewportSize({width:520,height:640});
  await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
  expect(await back.evaluate(element=>getComputedStyle(element).position)).toBe('fixed');
  const backBox=await back.boundingBox();expect(backBox.y).toBeLessThanOrEqual(12);
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),{message:'Reader preview fits the narrow viewport'}).toBe(true);

  await back.click();
  await expect(page.locator('#workbench-reader-preview')).toBeHidden();
  await expect(page.locator('#workbench-workspace')).toBeVisible();
  expect(await workspaceHandle.evaluate(element=>element.isConnected)).toBe(true);
  expect(await authorViewHandle.evaluate(element=>element.isConnected)).toBe(true);
  await expect(page.locator('.workbench-header')).toBeVisible();
  await expect(page.locator('#docview .playback-status').first()).toContainText('Playing');
  await page.locator('#docview .playback-button').first().evaluate(element=>element.click());
  await expect(page.locator('#docview .playback-status').first()).toContainText('Paused');
  await expect(page.locator('#workbench-reader-open')).toBeFocused();
  await expect(page.locator('#workbench-reader-open')).toBeInViewport();
  await expect(page.locator('#src')).toHaveValue(source);
  expect(await canvas.evaluate(element=>element.scrollTop)).toBe(canvasScroll);
  await expect(page.locator('#docview .path-chip[data-dv-path="happy"]').first()).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#docview .stepline').first()).toContainText('Button pressed');
  for(const handle of [authorNode,authorEdge,authorCoin]){
    expect(await handle.evaluate(element=>element.isConnected)).toBe(true);
    expect(await handle.evaluate(element=>element.classList.contains('lit'))).toBe(true);
  }
});
