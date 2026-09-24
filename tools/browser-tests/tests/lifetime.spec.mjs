import {test,expect,paste,pointerTo,trackResources,resources} from '../helpers/test.mjs';
import {source} from '../fixtures/editor-spec.mjs';
test('builder destruction retires captured gestures and old controls across same-DOM remounts',async({page,server})=>{
  await page.addInitScript(trackResources);await page.goto(server.origin+'/lifetime/index.html');await paste(page,source);
  const src=page.locator('#src'),node=id=>page.locator(`[data-dv-node="${id}"]`);
  await pointerTo(page,node('a'),node('b'),{release:false});
  await page.evaluate(()=>{window.__oldBuilder=__editorTest.builder;__editorTest.builder.destroy();});await page.mouse.up();
  await expect(src).toHaveValue(source);await expect(page.locator('.dv-ghost,.dv-rowline,.dv-ghostback')).toHaveCount(0);
  await expect.poll(async()=>{const r=await resources(page);return [r.timers,r.intervals,r.frames];}).toEqual([0,0,0]);
  const baseline=await resources(page);
  await page.evaluate(()=>{document.querySelector('#add-step').click();document.querySelector('#undo-builder').click();__oldBuilder.loadText('{"nodes":{}}');});
  await expect(src).toHaveValue(source);
  for(let cycle=0;cycle<2;cycle++){
    await page.evaluate(()=>__editorTest.remount());await node('a').click();
    const title=page.locator('#guide').getByLabel('title',{exact:true});await title.fill('Camera '+cycle);await title.press('Enter');
    expect(JSON.parse(await src.inputValue()).page.blocks[0].diagram.nodes.a.title).toBe('Camera '+cycle);
    await page.locator('#undo-builder').click();await expect(src).toHaveValue(source);
    await page.locator('#editor-tab-file').click();
    if(!await page.locator('#import-mermaid').isVisible())await page.locator('#sec-insert > summary').click();
    await page.locator('#import-mermaid').click();await page.evaluate(()=>__oldBuilder.destroy());
    await expect(page.locator('#importbox')).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('#importbox')).toBeHidden();
    if(cycle===0){
      await page.locator('#editor-tab-inspect').click();await page.locator('.pt-homemap [data-home-layout]').click();
      const map=page.locator('#guide .home-layout-map'),device=map.locator('[data-device="doorbell"]');
      await device.hover();const box=await device.boundingBox(),held=await map.elementHandle();
      await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
      await page.mouse.move(box.x+box.width/2+30,box.y+box.height/2+10,{steps:8});
      expect(await held.evaluate(e=>e.hasPointerCapture(1))).toBe(true);
      await page.evaluate(()=>__editorTest.builder.destroy());await page.mouse.up();
      expect(await held.evaluate(e=>e.hasPointerCapture(1))).toBe(false);await held.dispose();
      await expect(src).toHaveValue(source);
    }else{
      await page.locator('#diagram-add').click();await page.locator('[data-add-kind=panel]').click();
      await page.locator('#panel-picker-grid .pwidget').first().waitFor();
      await page.evaluate(()=>__editorTest.builder.destroy());await expect(page.locator('#panel-picker')).toBeHidden();
    }
    // Boot/workspace/Canon/preview remain mounted: compare their actual baseline.
    await expect.poll(()=>resources(page)).toEqual(baseline);
  }
});
