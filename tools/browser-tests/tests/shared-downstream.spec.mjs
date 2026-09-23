import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect,paste} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
const source=await readFile(path.join(repo,'examples/shared-downstream/shared-downstream.spec.json'),'utf8');
const raw=JSON.parse(source);
const chip=(root,pathId,index)=>root.locator('.schip[data-step-path="'+pathId+'"][data-step-source="'+index+'"]');
async function checkShared(root){
 const base=chip(root,'button',5),alt=chip(root,'motion',5);
 await expect(base).toHaveText('3');await expect(alt).toHaveText('4');
 await expect(base.locator('.shared-step-link')).toBeVisible();await expect(alt.locator('.shared-step-link')).toBeVisible();
 await expect(base).not.toHaveClass(/shared-step-shadow/);await expect(alt).toHaveCSS('opacity','0.35');
 await expect(alt).toHaveCSS('background-color','rgb(13, 148, 136)');
 await expect(base).toHaveAttribute('title','Shared step — also in Motion detected (step 4)');
 await alt.click();await expect(alt).toHaveAttribute('aria-current','true');await expect(alt).toHaveCSS('opacity','1');
 await expect(root.locator('.step-shared-note')).toHaveText('Shared step · also in Button press (step 3)');
 await expect(root.locator('.pt-state .preadout')).toHaveText('Motion');
 await base.click();await expect(root.locator('.pt-state .preadout')).toHaveText('Button');
 await expect(root.locator('.step-shared-note')).toHaveText('Shared step · also in Motion detected (step 4)');
}

test('standalone joins stay identifiable in all skins and preserve each input state',async({page,server},testInfo)=>{
 await writeFile(path.join(server.root,'shared.json'),source);
 execFileSync('python3',[path.join(repo,'tools/inject.py'),path.join(server.root,'shared.json'),path.join(repo,'template/flowview.html'),path.join(server.root,'shared.html')]);
 await page.goto(server.origin+'/shared.html');const root=page.locator('.docview');
 for(const skin of ['pastel','aurora','daylight','editorial','terminal','blueprint']){
  await page.evaluate(skin=>window.dvSetSkin(skin),skin);await chip(root,'button',0).click();await checkShared(root);
  await chip(root,'motion',7).click();await expect(root.locator('.pt-state .preadout')).toHaveText('Motion');
  await expect(root.locator('.pt-log')).toContainText('Notify resident');
  await chip(root,'motion',2).click();await expect(root.locator('.step-shared-note')).toBeHidden();
 }
 await page.evaluate(()=>window.dvSetSkin('pastel'));await chip(root,'motion',5).click();
 await page.screenshot({path:testInfo.outputPath('shared-downstream-standalone.png'),fullPage:true});
 // A non-current shadow must still be clearly visible when keyboard-focused.
 await page.keyboard.press('Tab');await expect(chip(root,'motion',6)).toBeFocused();await expect(chip(root,'motion',6)).toHaveCSS('opacity','1');
});

test('workbench can detach a downstream shared step and Undo restores its sharing cue',async({page,server},testInfo)=>{
 await page.goto(server.origin+'/workbench.html');await paste(page,source);const root=page.locator('#docview');await checkShared(root);
 await page.locator('#editor-tab-steps').click();await page.locator('#steps-path').selectOption('motion');
 await page.locator('#steps-list [data-step-index="5"]').click();
 await expect(page.locator('#steps-shared-with')).toContainText('Shared with Button press');
 await page.locator('#steps-independent').click();
 await expect(chip(root,'button',5).locator('.shared-step-link')).toHaveCount(0);
 const updated=JSON.parse(await page.locator('#src').inputValue()).page.sections[0].diagram;
 const copy=updated.steps.findIndex(s=>s.id===updated.paths[1].steps[3]);
 expect(copy).not.toBe(5);await expect(chip(root,'motion',copy)).not.toHaveClass(/shared-step-shadow|shared-downstream-step/);
 await expect(chip(root,'motion',6).locator('.shared-step-link')).toBeVisible();
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(source);
 await expect(chip(root,'motion',5).locator('.shared-step-link')).toBeVisible();
 await page.screenshot({path:testInfo.outputPath('shared-downstream-editor.png')});
});

test('native viewer keeps joins when a named view hides the separate input steps',async({page,server})=>{
 const spec=structuredClone(raw),d=spec.page.sections[0].diagram;d.steps[5].delta=true;
 const composition={default:[{x:0,y:0,w:8,h:22},{panel:'origin',x:8,y:0,w:4,h:7},{panel:'work',x:8,y:7,w:4,h:15},{controls:'steps',attachTo:'diagram',x:0,y:22,w:8,h:8}]};
 d.layouts=[{id:'full',name:'Full story',sectionLayout:composition},{id:'brief',name:'Processing only',steps:['process','persist','notify'],sectionLayout:composition}];d.defaultLayout='full';
 await writeFile(path.join(server.root,'shared-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
 await writeFile(path.join(server.root,'shared-native.html'),'<div id="host" style="width:1100px"></div><script type="module">import {mountNativeViewer} from "./shared-native.js";window.mount=mountNativeViewer;</script>');
 await page.goto(server.origin+'/shared-native.html');await page.waitForFunction(()=>!!window.mount);
 await page.evaluate(spec=>window.viewer=mount(document.querySelector('#host'),spec),spec);const root=page.locator('#host');
 await root.getByRole('button',{name:'Full story',exact:true}).click();await checkShared(root);
 await root.getByRole('button',{name:'Processing only',exact:true}).click();
 await expect(chip(root,'motion',5)).toHaveText('1');await expect(chip(root,'button',5)).toHaveText('1');
 await expect(chip(root,'motion',5)).toHaveClass(/dvd/);await expect(chip(root,'motion',5).locator('.shared-step-link')).toBeVisible();
 await chip(root,'motion',5).click();await expect(root.locator('.pt-state .preadout')).toHaveText('Motion');
 await expect(root.locator('.step-shared-note')).toHaveText('Shared step · also in Button press (step 1)');
 await expect(chip(root,'motion',5)).toHaveCSS('background-color','rgb(13, 148, 136)');
 await page.evaluate(()=>viewer.destroy());await expect(root).toBeEmpty();
});

test('Forge renders linked downstream stops through the production bridge resource',async({page,server})=>{
 await page.addInitScript(raw=>{window.__bridge={callBridge:async method=>{if(method==='getContext')return {siteUrl:'https://company.atlassian.net',extension:{config:{specJson:JSON.stringify(raw)},macro:{isConfiguring:false}}};return true;}};},raw);
 await page.goto(server.origin+'/forge/index.html');await checkShared(page.locator('#docview'));
});
