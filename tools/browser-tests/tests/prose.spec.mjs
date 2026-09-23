import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect,paste} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
import {raw,source,code,caption} from '../fixtures/prose-spec.mjs';

async function checkProse(root){
  await expect(root.locator('.sec-text').first().locator('pre code')).toHaveText(code,{useInnerText:false});
  await expect(root.locator('.sec-bullets pre')).toHaveCount(1);
  await expect(root.locator('.ctg pre')).toHaveCount(1);await expect(root.locator('.ctnote pre')).toHaveCount(1);
  expect(await root.locator('.ctg').evaluate(el=>el.clientWidth/el.closest('table').clientWidth)).toBeGreaterThan(.4);
  await expect(root.locator('.step-text pre code')).toHaveText(code,{useInnerText:false});
  await expect(root.locator('.step-text strong')).toHaveText('acknowledge');
  await expect(root.locator('[data-dv-node=device]')).toContainText('`Doorbell`');
  await expect(root.locator('.ctv')).toHaveText('`sample-value`');
  await expect(root.locator('.prose-code img,.prose-code a,.prose-code strong,.prose-code script')).toHaveCount(0);
  await expect(root.locator('.printsteps li').first().locator('pre code')).toHaveText(code,{useInnerText:false});
  for(const selector of ['.sec-text','.ctcard','.stepline']){
    for(const element of await root.locator(selector).all())expect(await element.evaluate(el=>el.scrollWidth<=el.clientWidth+1),selector+' stays bounded').toBe(true);
  }
  const snippet=root.locator('.step-text pre');
  expect(await snippet.evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(true);
  await snippet.focus();await snippet.press('ArrowRight');
  await expect.poll(()=>snippet.evaluate(el=>el.scrollLeft)).toBeGreaterThan(0);
}

test('code renders and edits in the workbench without changing diagram labels or Undo semantics',async({page,server},testInfo)=>{
  await page.goto(server.origin+'/workbench.html');await paste(page,source);
  const root=page.locator('#docview');
  await checkProse(root);
  await root.locator('.sec-text').first().locator('pre').click();
  const field=page.locator('#guide').getByLabel('text',{exact:true});await expect(field).toHaveValue(caption);
  const changed=caption.replace('button_press','motion_detected');
  await field.fill(changed);await field.press('Tab');
  await expect(root.locator('.sec-text').first()).toContainText('motion_detected');
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(source);
  await page.locator('#editor-tab-steps').click();await page.locator('#steps-list [data-step-index="0"]').click();
  await page.locator('#editor-tab-inspect').click();await expect(field).toHaveValue(caption);
  await field.fill('Changed `code`.\n```js\nreturn true;\n```');await field.press('Tab');
  await expect(root.locator('.step-text pre code')).toHaveText('return true;\n');
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(source);
  await page.locator('#redo-builder').click();await expect(root.locator('.step-text pre code')).toHaveText('return true;\n');
  await testInfo.attach('prose-workbench',{body:await page.screenshot(),contentType:'image/png'});
});

test('standalone prose and step code survive navigation, printing, six skins and embedded widths',async({page,server},testInfo)=>{
  await writeFile(path.join(server.root,'prose.json'),source);
  execFileSync('python3',[path.join(repo,'tools/inject.py'),path.join(server.root,'prose.json'),path.join(repo,'template/flowview.html'),path.join(server.root,'prose.html')]);
  for(const skin of ['pastel','aurora','daylight','editorial','terminal','blueprint']){
    await page.context().addCookies([{name:'dv_skin',value:skin,url:server.origin}]);
    await page.setViewportSize({width:1440,height:1200});await page.goto(server.origin+'/prose.html');
    const root=page.locator('.docview');await checkProse(root);
    await page.evaluate(()=>document.body.classList.add('presenting'));
    await checkProse(root); // Focused code owns arrow keys even during a presentation.
    await page.evaluate(()=>document.body.classList.remove('presenting'));
    await root.getByRole('button',{name:'Next step',exact:true}).click();
    await expect(root.locator('.step-text code')).toHaveText('202');await expect(root.locator('.step-text pre')).toHaveCount(0);
    await root.getByRole('button',{name:'Previous step',exact:true}).click();await expect(root.locator('.step-text pre code')).toHaveText(code);
    await page.setViewportSize({width:800,height:1000});await checkProse(root);
    if(skin==='pastel'){
      await page.setViewportSize({width:1440,height:1200});await root.locator('.stepline').scrollIntoViewIfNeeded();
      await testInfo.attach('prose-pastel',{body:await page.screenshot(),contentType:'image/png'});
    }
  }
  await page.emulateMedia({media:'print'});
  await expect(page.locator('.printsteps')).toBeVisible();
  await expect(page.locator('.printsteps pre').first()).toHaveCSS('white-space','pre-wrap');
});

test('native Backstage renderer formats code inside its ShadowRoot without loading scripts or styles',async({page,server})=>{
  await writeFile(path.join(server.root,'prose-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
  await writeFile(path.join(server.root,'prose-native.html'),'<div id="host" style="width:960px"></div><script type="module">import {mountNativeViewer} from "./prose-native.js";window.mount=mountNativeViewer;</script>');
  await page.goto(server.origin+'/prose-native.html');await page.waitForFunction(()=>!!window.mount);
  await page.evaluate(raw=>window.viewer=mount(document.querySelector('#host'),raw),raw);
  await checkProse(page.locator('#host'));
  await page.evaluate(()=>viewer.navigate({section:'code-story',step:'ack',mode:'step'}));
  await expect(page.locator('#host .step-text code')).toHaveText('202');
  await page.evaluate(()=>viewer.destroy());await expect(page.locator('#host')).toBeEmpty();
});
