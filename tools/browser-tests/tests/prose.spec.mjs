import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect,pastePage as paste,openInspectorGroup} from '../helpers/test.mjs';
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
  const field=page.locator('#guide').getByLabel('Prose text',{exact:true});await expect(field).toHaveValue(caption);
  const changed=caption.replace('button_press','motion_detected');
  await field.fill(changed);await field.press('Tab');
  await expect(root.locator('.sec-text').first()).toContainText('motion_detected');
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(source);
  await page.locator('#editor-tab-steps').click();await page.locator('#steps-list [data-step-index="0"]').click();
  await page.locator('#editor-tab-inspect').click();const stepField=page.locator('#guide').getByLabel('text',{exact:true});await expect(stepField).toHaveValue(caption);
  await stepField.fill('Changed `code`.\n```js\nreturn true;\n```');await stepField.press('Tab');
  await expect(root.locator('.step-text pre code')).toHaveText('return true;\n');
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(source);
  await page.locator('#redo-builder').click();await expect(root.locator('.step-text pre code')).toHaveText('return true;\n');
  await testInfo.attach('prose-workbench',{body:await page.screenshot(),contentType:'image/png'});
});

test('step Markdown toolbar keeps selections and link drafts separate from change notes',async({page,server},testInfo)=>{
  const spec=structuredClone(raw),step=spec.page.sections[0].diagram.steps[0];
  step.text='Send event';step.delta=true;step.deltaText='Change reason';
  const original=JSON.stringify(spec,null,2);
  await page.goto(server.origin+'/workbench.html');await paste(page,original);
  await page.locator('#editor-tab-steps').click();await page.locator('#steps-list [data-step-index="0"]').click();await page.locator('#editor-tab-inspect').click();
  const guide=page.locator('#guide'),src=page.locator('#src');
  const text=guide.getByLabel('text',{exact:true}),editor=guide.locator('.prose-editor').filter({has:page.getByLabel('text',{exact:true})});
  await text.focus();await text.evaluate(el=>el.setSelectionRange(5,10));
  await editor.getByRole('button',{name:'Bold',exact:true}).click();
  await expect(text).toHaveValue('Send **event**');await expect(page.locator('.step-text strong')).toHaveText('event');
  await expect(text).toBeFocused();expect(await text.evaluate(el=>el.value.slice(el.selectionStart,el.selectionEnd))).toBe('event');
  const bold=await src.inputValue();
  await editor.getByLabel('Formatting link URL').fill(server.origin+'/step');
  await openInspectorGroup(guide.locator('.delta-details-editor'));
  const note=guide.getByLabel('Delta note',{exact:true}),noteEditor=guide.locator('.prose-editor').filter({has:page.getByLabel('Delta note',{exact:true})});
  await noteEditor.getByLabel('Formatting link URL').fill(server.origin+'/change');
  await note.focus();await note.evaluate(el=>el.setSelectionRange(7,13));
  await noteEditor.getByRole('button',{name:'Code',exact:true}).click();
  await expect(note).toHaveValue('Change `reason`');
  await expect(editor.getByLabel('Formatting link URL')).toHaveValue(server.origin+'/step');
  await expect(noteEditor.getByLabel('Formatting link URL')).toHaveValue(server.origin+'/change');
  await text.focus();await text.evaluate(el=>el.setSelectionRange(7,12));
  await editor.getByRole('button',{name:'Insert link',exact:true}).click();
  await expect(page.locator('.step-text a')).toHaveAttribute('href',server.origin+'/step');
  const linked=await src.inputValue();
  await page.locator('#undo-builder').click();await expect(src).not.toHaveValue(linked);
  await page.locator('#redo-builder').click();await expect(src).toHaveValue(linked);
  await page.locator('#undo-builder').click();await page.locator('#undo-builder').click();await expect(src).toHaveValue(bold);
  await page.locator('#undo-builder').click();await expect(src).toHaveValue(original);
  await testInfo.attach('step-markdown-toolbar',{body:await page.screenshot(),contentType:'image/png'});
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
