import {test,expect,paste} from '../helpers/test.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {repo} from '../helpers/prepare.mjs';
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6E0AAAAASUVORK5CYII=';
const fixture=()=>({page:{title:'Shared icon language',sections:[{heading:'A branded camera story',diagram:{view:'step',autoplay:false,
 brand:{app:'Cedar',icon:'house'},nodes:{camera:{title:'Camera',icon:'camera'},cloud:{title:'Cloud',icon:'cloud'}},rows:[['camera','cloud']],edges:[{from:'camera',to:'cloud',kind:'https'}],
 panels:[{id:'app',type:'deviceapp',title:'Phone',fields:[{id:'heat',label:'Temperature',icon:'temperature'}],initial:{heat:{value:22,status:'ready'}}},{id:'video',type:'screen',title:'Camera feed',scene:'person-through-door',initial:{mode:'active'}},{id:'monitor',type:'security',title:'Monitoring',initial:{status:'armed'}}],
 steps:[{id:'normal',text:'Normal',nodes:['camera']},{id:'hot',text:'Too hot',panels:{app:{heat:{value:60,icon:'hot'}},video:{mode:'unavailable',reason:'Thermal pause'},monitor:{status:'reviewing'}}}]
}}]}});

test('visual icon picker searches, filters, chooses one transaction, and closes when the owner retires',async({page,server},info)=>{
 await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(fixture(),null,2));
 await page.locator('#docview .node[data-dv-node="camera"]').click();
 const guide=page.locator('#guide'),source=page.locator('#src');
 await guide.locator('.flow-icon-browse').first().click();
 const dialog=page.locator('dialog.flow-icon-picker');await expect(dialog).toBeVisible();
 await dialog.locator('.flow-icon-search').fill('battery');await expect(dialog.locator('[data-icon-id="battery-low"]')).toBeVisible();
 await page.screenshot({path:info.outputPath('icon-picker.png')});
 const before=await source.inputValue();await dialog.locator('[data-icon-id="battery-low"]').click();
 await expect(dialog).toHaveCount(0);expect(JSON.parse(await source.inputValue()).page.sections[0].diagram.nodes.camera.icon).toBe('battery-low');
 await page.locator('#undo-builder').click();await expect(source).toHaveValue(before);
 await page.locator('#docview .node[data-dv-node="camera"]').click();
 await guide.locator('.flow-icon-browse').first().click();await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
 await guide.locator('.flow-icon-browse').first().click();
 await page.evaluate(()=>document.querySelector('#docview .node[data-dv-node="cloud"]').dispatchEvent(new MouseEvent('click',{bubbles:true})));await expect(dialog).toHaveCount(0);
});

test('company logo upload is shared across panels with override, opt-out and Undo',async({page,server},info)=>{
 await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(fixture(),null,2));
 const root=page.locator('#docview');await expect(root.locator('.fv-brand-name').first()).toHaveText('Cedar');
 await root.locator('.pt-deviceapp .ptitle').click();
 const guide=page.locator('#guide'),brand=guide.locator('.fv-brand-editor');await brand.evaluate(el=>{el.open=true;});
 await brand.getByLabel('Company logo file').setInputFiles({name:'logo.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
 await expect(root.locator('.pt-deviceapp .fv-brand img')).toHaveCount(1);await expect(root.locator('.pt-screen .fv-brand img')).toHaveCount(1);await expect(root.locator('.pt-security .fv-brand img')).toHaveCount(1);
 const raw=JSON.parse(await page.locator('#src').inputValue());expect(raw.page.sections[0].diagram.brand.logoImage).toContain('data:image/png;base64,');expect(raw.page.sections[0].diagram.brand.icon).toBeUndefined();
 await page.locator('#undo-builder').click();await expect(root.locator('.fv-brand img')).toHaveCount(0);
 await root.locator('.pt-deviceapp .ptitle').click();await brand.evaluate(el=>{el.open=true;});
 await brand.getByLabel('Branding scope').selectOption('none');await expect(root.locator('.pt-deviceapp .fv-brand')).toHaveCount(0);await expect(root.locator('.pt-screen .fv-brand')).toHaveCount(1);
 await page.screenshot({path:info.outputPath('shared-branding.png')});
});

test('native viewer renders shared branding and step icons without extra assets; backward seeks restore icon',async({page,server})=>{
 await writeFile(path.join(server.root,'icons-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
 await writeFile(path.join(server.root,'icons-native.html'),'<div id="host"></div><script type="module">import {mountNativeViewer} from "./icons-native.js";window.mount=mountNativeViewer;</script>');
 await page.goto(server.origin+'/icons-native.html');await page.waitForFunction(()=>!!window.mount);
 await page.evaluate(raw=>{window.viewer=mount(document.querySelector('#host'),raw,{skin:'pastel'});},fixture());
 const root=page.locator('#host');await expect(root.locator('.pt-deviceapp .da-icon')).toHaveAttribute('data-icon','temperature');
 await expect(root.locator('.pt-screen .fv-brand')).toHaveCount(1);await expect(root.locator('.pt-security .fv-brand-name')).toContainText('Cedar');
 await root.getByRole('button',{name:'Next step',exact:true}).click();await expect(root.locator('.pt-deviceapp .da-icon')).toHaveAttribute('data-icon','hot');await expect(root.locator('.screen-unavailable')).toContainText('Thermal pause');
 await root.getByRole('button',{name:'Previous step',exact:true}).click();await expect(root.locator('.pt-deviceapp .da-icon')).toHaveAttribute('data-icon','temperature');
 await page.evaluate(()=>viewer.destroy());await expect(root).toBeEmpty();
});

test('step icon picker changes a device card and Inherit removes only that step override',async({page,server})=>{
 await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(fixture(),null,2));
 await page.locator('#editor-tab-steps').click();await page.locator('#steps-list [data-step-index="1"]').click();await page.locator('#editor-tab-inspect').click();
 const patch=page.locator('#guide .patchedit').filter({has:page.locator('summary').filter({hasText:/^app ·/})});await patch.locator(':scope > summary').click();
 const picker=patch.locator('.flow-icon-control').first();await picker.locator('.flow-icon-browse').click();
 const dialog=page.locator('dialog.flow-icon-picker');await expect(dialog.locator('[data-icon-id=""]')).toContainText('Inherit previous icon');
 await dialog.locator('.flow-icon-search').fill('cold');await dialog.locator('[data-icon-id="cold"]').click();
 await expect(page.locator('#docview .da-icon')).toHaveAttribute('data-icon','cold');
 expect(JSON.parse(await page.locator('#src').inputValue()).page.sections[0].diagram.steps[1].panels.app.heat.icon).toBe('cold');
 await picker.locator('.flow-icon-browse').click();await dialog.locator('[data-icon-id=""]').click();
 expect(JSON.parse(await page.locator('#src').inputValue()).page.sections[0].diagram.steps[1].panels.app.heat.icon).toBeUndefined();
 await expect(page.locator('#docview .da-icon')).toHaveAttribute('data-icon','temperature');
});
