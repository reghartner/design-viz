import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {test,expect,paste} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
const source = await readFile(path.join(repo,'src/starters/security-response.json'),'utf8');

test('native monitoring and dispatch preserve independent outcomes across skins and embedded widths', async ({page,server}) => {
  await writeFile(path.join(server.root,'response-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
  await writeFile(path.join(server.root,'response-native.html'),'<div id="host" style="width:1400px"></div><script type="module">import {mountNativeViewer} from "./response-native.js"; window.mountResponse=mountNativeViewer;</script>');
  await page.goto(server.origin+'/response-native.html');
  await page.waitForFunction(()=>!!window.mountResponse);
  const host=page.locator('#host');
  for (const skin of ['pastel','aurora','daylight','editorial','terminal','blueprint']) {
    await page.evaluate(({raw,skin})=>{
      window.viewer?.destroy();
      window.viewer=mountResponse(document.querySelector('#host'),raw,{skin});
      viewer.navigate({section:'security-response',path:'confirmed',step:'onscene'});
    },{raw:JSON.parse(source),skin});
    await expect(host.locator('.secmon')).toHaveClass(/secmon-verified/);
    await expect(host.locator('.dispatch')).toHaveClass(/dispatch-onscene/);
    await expect(host.locator('[data-responder-id="patrol"]')).toHaveClass(/dispatch-unit-onscene/);
    await expect(host.locator('[data-responder-id="backup"]')).toHaveClass(/dispatch-unit-available/);
    for (const width of [1400,960]) {
      await host.evaluate((el,w)=>el.style.width=w+'px',width);
      for (const selector of ['.pt-security','.pt-dispatch']) {
        const panel=host.locator(selector);
        await expect(panel).toBeVisible();
        expect(await panel.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
      }
    }
    await page.evaluate(()=>viewer.navigate({section:'security-response',path:'false-alarm',step:'false-alarm'}));
    await expect(host.locator('.secmon')).toHaveClass(/secmon-cleared/);
    await expect(host.locator('.dispatch')).toHaveClass(/dispatch-idle/);
    await expect(host.locator('[data-responder-id="patrol"]')).toHaveClass(/dispatch-unit-available/);
    await page.evaluate(()=>viewer.navigate({section:'security-response',path:'dispatch-unavailable',step:'dispatch-blocked'}));
    await expect(host.locator('.dispatch')).toHaveClass(/dispatch-blocked/);
    await expect(host.locator('[data-responder-id="patrol"]')).not.toContainText('3 min');
    await expect(host.locator('.secmon-emblem')).toHaveCSS('animation-name','none');
  }
  await page.evaluate(()=>viewer.destroy());
  await expect(host).toBeEmpty();
});

test('workbench edits monitoring per step and discovers both panels in the visual picker', async ({page,server}) => {
  await page.goto(server.origin+'/workbench.html');
  await paste(page,source);
  await page.locator('#editor-tab-steps').click();
  await page.locator('#steps-list [data-step-index="1"]').click();
  await page.locator('#editor-tab-inspect').click();
  const patch=page.locator('#guide .patchedit').filter({has:page.locator('summary').filter({hasText:/^monitor ·/})});
  await patch.locator('summary').first().click();
  await patch.getByLabel('status',{exact:true}).selectOption('reviewing');
  await expect.poll(async()=>JSON.parse(await page.locator('#src').inputValue()).page.sections[0].diagram.steps[1].panels.monitor.status).toBe('reviewing');
  await page.locator('#undo-builder').click();
  await expect(page.locator('#src')).toHaveValue(source);
  await page.locator('#editor-tab-steps').click();
  await page.locator('#steps-list [data-step-index="1"]').click();
  await page.locator('#editor-tab-inspect').click();
  await patch.locator('summary').first().click();
  await patch.getByLabel('video',{exact:true}).selectOption('reviewing');
  await expect.poll(async()=>JSON.parse(await page.locator('#src').inputValue()).page.sections[0].diagram.steps[1].panels.monitor.video).toBe('reviewing');
  await page.locator('#undo-builder').click();
  await expect(page.locator('#src')).toHaveValue(source);
  await page.locator('#sec-insert > summary').click();
  await page.locator('#add-panel').click();
  for (const type of ['security','dispatch']) {
    await page.locator('.panel-picker-card[data-panel-type="'+type+'"]').click();
    await expect(page.locator('#panel-picker-preview .pt-'+type)).toBeVisible();
  }
  await page.locator('#panel-picker-add').click();
  await expect.poll(async()=>JSON.parse(await page.locator('#src').inputValue()).page.sections[0].diagram.panels.length).toBe(4);
  await page.locator('#undo-builder').click();
  await expect(page.locator('#src')).toHaveValue(source);
});

test('operator video and response vehicles retain their authored position through navigation and replay', async ({page,server}) => {
  await writeFile(path.join(server.root,'response-scenes-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
  await writeFile(path.join(server.root,'response-scenes-native.html'),'<div id="host" style="width:1400px"></div><script type="module">import {mountNativeViewer} from "./response-scenes-native.js"; window.mountResponse=mountNativeViewer;</script>');
  await page.goto(server.origin+'/response-scenes-native.html');
  await page.waitForFunction(()=>!!window.mountResponse);
  await page.evaluate(raw=>{window.viewer=mountResponse(document.querySelector('#host'),raw);},JSON.parse(source));
  const host=page.locator('#host');
  const navigate=step=>page.evaluate(step=>viewer.navigate({section:'security-response',path:'confirmed',step}),step);
  const patrol=host.locator('.dispatch-vehicle[data-unit-id="patrol"]');
  await expect(host.locator('.secmon-stage')).toHaveClass(/secmon-review-closed/);
  await navigate('review');
  await expect(host.locator('.secmon-stage')).toHaveClass(/secmon-review-opening/);
  await navigate('clip-review');
  const clip=host.locator('.secmon-video .scene-entry');
  await expect(clip).toBeVisible();
  await clip.evaluate(el=>window.__evidenceClip=el);
  await navigate('verified');
  expect(await clip.evaluate(el=>el===window.__evidenceClip)).toBe(true);
  await navigate('assigned');
  await expect(patrol).toHaveAttribute('data-progress','0');
  await navigate('enroute');
  await expect(patrol).toHaveAttribute('data-progress','35');
  const departure=await patrol.boundingBox();
  await navigate('approaching');
  await expect(patrol).toHaveAttribute('data-progress','78');
  const approach=await patrol.boundingBox();
  expect(approach.x).toBeGreaterThan(departure.x);
  await navigate('onscene');
  await expect(patrol).toHaveAttribute('data-progress','100');
  const arrival=await patrol.boundingBox();
  expect(arrival.x).toBeGreaterThan(approach.x);
  await navigate('enroute');
  await expect(patrol).toHaveAttribute('data-progress','35');
  expect((await patrol.boundingBox()).x).toBeCloseTo(departure.x,0);
  await page.evaluate(()=>viewer.navigate({section:'security-response',path:'false-alarm',step:'false-alarm'}));
  await expect(host.locator('.secmon-stage')).toHaveClass(/secmon-review-closed/);
  await expect(host.locator('.secmon-video .scene')).toHaveCount(0);
  await expect(patrol).toHaveAttribute('data-progress','0');
  await page.evaluate(()=>viewer.navigate({section:'security-response',path:'dispatch-unavailable',step:'dispatch-blocked'}));
  await expect(host.locator('.dispatch')).toHaveClass(/dispatch-blocked/);
  await expect(patrol).toHaveAttribute('data-progress','0');
  await page.evaluate(()=>viewer.destroy());
  await expect(host).toBeEmpty();
});
