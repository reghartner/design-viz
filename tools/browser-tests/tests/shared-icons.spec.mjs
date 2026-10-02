import {test,expect,pastePage as paste,inspectPageElement} from '../helpers/test.mjs';
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
 await expect(guide.locator('.flow-icon-control > select')).toBeHidden();
 await expect(guide.locator('.flow-icon-value')).toHaveText('Camera');
 await expect(guide.locator('.flow-icon-browse')).toHaveAccessibleName('Icon: Camera. Choose icon');
 await page.screenshot({path:info.outputPath('icon-field.png')});
 await guide.locator('.flow-icon-browse').first().click();
 const dialog=page.locator('dialog.flow-icon-picker');await expect(dialog).toBeVisible();
 await dialog.locator('.flow-icon-search').fill('voltage');await expect(dialog.locator('[data-icon-id="voltage-low"]')).toBeVisible();
 await expect(dialog.locator('.flow-icon-tile[data-icon-id^="voltage"]')).toHaveCount(5);
 await page.screenshot({path:info.outputPath('icon-picker.png')});
 const before=await source.inputValue();await dialog.locator('[data-icon-id="voltage-low"]').click();
 await expect(dialog).toHaveCount(0);expect(JSON.parse(await source.inputValue()).page.sections[0].diagram.nodes.camera.icon).toBe('voltage-low');
 await page.locator('#undo-builder').click();await expect(source).toHaveValue(before);
 await page.locator('#docview .node[data-dv-node="camera"]').click();
 await guide.locator('.flow-icon-browse').first().click();await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
 await guide.locator('.flow-icon-browse').first().click();
 await page.evaluate(()=>document.querySelector('#docview .node[data-dv-node="cloud"]').dispatchEvent(new MouseEvent('click',{bubbles:true})));await expect(dialog).toHaveCount(0);
});

test('company logo upload is shared across panels with override, opt-out and Undo',async({page,server},info)=>{
 await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(fixture(),null,2));
 const root=page.locator('#docview');
 await expect(root.locator('.doc-heading .fv-brand-name')).toHaveText('YOUR COMPANY');
 await expect(root.locator('.pt-deviceapp .fv-brand-name')).toHaveText('Cedar');
 await inspectPageElement(page,root.locator('.pt-deviceapp .ptitle'));
 const guide=page.locator('#guide'),brand=guide.locator('.fv-brand-editor');await brand.evaluate(el=>{el.open=true;});
 await expect(brand.locator('.flow-icon-control > select')).toBeHidden();
 await expect(brand.locator('.flow-icon-browse')).toHaveAccessibleName('Brand icon: Home. Choose icon');
 await brand.getByLabel('Company logo file').setInputFiles({name:'logo.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
 await expect(root.locator('.pt-deviceapp .fv-brand img')).toHaveCount(1);await expect(root.locator('.pt-screen .fv-brand img')).toHaveCount(1);await expect(root.locator('.pt-security .fv-brand img')).toHaveCount(1);
 const raw=JSON.parse(await page.locator('#src').inputValue());expect(raw.page.sections[0].diagram.brand.logoImage).toContain('data:image/png;base64,');expect(raw.page.sections[0].diagram.brand.icon).toBeUndefined();
 await page.locator('#undo-builder').click();await expect(root.locator('.fv-brand img')).toHaveCount(0);
 await inspectPageElement(page,root.locator('.pt-deviceapp .ptitle'));await brand.evaluate(el=>{el.open=true;});
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

test('embedded company marks stay compact and shrink in narrow and nested Screen canvases',async({page,server})=>{
 await writeFile(path.join(server.root,'compact-brand-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
 await writeFile(path.join(server.root,'compact-brand-native.html'),'<div id="host"></div><script type="module">import {mountNativeViewer} from "./compact-brand-native.js";window.mount=mountNativeViewer;</script>');
 await page.goto(server.origin+'/compact-brand-native.html');await page.waitForFunction(()=>!!window.mount);
 const raw=fixture(),d=raw.page.sections[0].diagram;
 d.brand={app:'Cedar',logoImage:'data:image/png;base64,'+png};
 await page.evaluate(raw=>{window.viewer=mount(document.querySelector('#host'),raw,{skin:'pastel'});},raw);
 const root=page.locator('#host'),screen=root.locator('.pt-screen .screenbox'),nested=root.locator('.pt-security .secmon-video .screenbox');
 const screenMark=screen.locator('.fv-brand-compact img'),nestedMark=nested.locator('.fv-brand-compact img');
 await expect(screenMark).toBeVisible();await expect(nestedMark).toBeVisible();
 await expect(screenMark).toHaveCSS('object-fit','contain');await expect(nestedMark).toHaveCSS('object-fit','contain');
 await screen.evaluate(el=>el.style.width='400px');
 const normal=await screenMark.boundingBox();
 expect(normal.width).toBeCloseTo(20,0);expect(normal.height).toBeCloseTo(20,0);
 await screen.evaluate(el=>el.style.width='160px');
 const narrow=await screenMark.boundingBox();
 expect(narrow.width).toBeCloseTo(12,0);expect(narrow.height).toBeCloseTo(12,0);expect(narrow.width).toBeLessThan(normal.width);
 await nested.evaluate(el=>el.style.width='140px');
 const nestedSize=await nestedMark.boundingBox();
 expect(nestedSize.width).toBeCloseTo(12,0);expect(nestedSize.height).toBeCloseTo(12,0);
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

test('multi-node icons use the picker, show mixed values, and apply or clear together with Undo',async({page,server})=>{
 await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(fixture(),null,2));
 async function selectBoth(){await page.locator('#docview .node[data-dv-node="camera"]').click();await page.locator('#docview .node[data-dv-node="cloud"]').click({modifiers:['Shift']});}
 await selectBoth();const control=page.locator('#guide .flow-icon-control'),source=page.locator('#src');
 await expect(control.locator('.flow-icon-value')).toHaveText('Mixed icons');await expect(control.locator('select')).toBeHidden();
 const before=await source.inputValue();await control.locator('button').click();
 const dialog=page.locator('dialog.flow-icon-picker');await expect(dialog.locator('[aria-pressed="true"]')).toHaveCount(0);
 await dialog.locator('[data-icon-id="battery-full"]').click();
 let nodes=JSON.parse(await source.inputValue()).page.sections[0].diagram.nodes;expect(nodes.camera.icon).toBe('battery-full');expect(nodes.cloud.icon).toBe('battery-full');
 await page.locator('#undo-builder').click();await expect(source).toHaveValue(before);
 await selectBoth();await control.locator('button').click();await dialog.locator('[data-icon-id=""]').click();
 nodes=JSON.parse(await source.inputValue()).page.sections[0].diagram.nodes;expect(nodes.camera.icon).toBeUndefined();expect(nodes.cloud.icon).toBeUndefined();
 await page.locator('#undo-builder').click();await expect(source).toHaveValue(before);
});

test('Home icon picker keeps Restore layout distinct from Inherit and supports keyboard opening',async({page,server})=>{
 const raw=fixture(),d=raw.page.sections[0].diagram;
 d.panels=[{id:'home',type:'homemap',title:'Home',devices:[{id:'porch',kind:'camera',label:'Porch camera',x:50,y:50,icon:'camera'}]}];
 d.steps[0].panels={home:{porch:{icon:'hot'}}};d.steps[1].panels={home:{porch:{icon:'cold'}}};
 await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(raw,null,2));
 await page.locator('#editor-tab-steps').click();await page.locator('#steps-list [data-step-index="1"]').click();await page.locator('#editor-tab-inspect').click();
 const field=page.locator('#guide .frow').filter({has:page.locator('.flow-icon-browse[aria-label^="Porch camera icon:"]')});
 // The section can be collapsed; opening it only exposes the existing control.
 await field.evaluate(el=>{for(let p=el.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;});
 await expect(field.locator('select')).toBeHidden();await field.locator('button').focus();await page.keyboard.press('Enter');
 const dialog=page.locator('dialog.flow-icon-picker');await expect(dialog).toBeVisible();
 await dialog.locator('.flow-icon-search').fill('cloud');await expect(dialog.locator('[data-icon-id="__default__"]')).toContainText('Restore layout icon');
 await dialog.locator('[data-icon-id="__default__"]').click();
 expect(JSON.parse(await page.locator('#src').inputValue()).page.sections[0].diagram.steps[1].panels.home.porch.icon).toBeNull();
 await expect(field.locator('.flow-icon-value')).toHaveText('Restore layout icon');
 await field.locator('button').click();await dialog.locator('[data-icon-id=""]').click();
 const patch=JSON.parse(await page.locator('#src').inputValue()).page.sections[0].diagram.steps[1].panels?.home?.porch;
 expect(patch?.icon).toBeUndefined();
 await expect(field.locator('.flow-icon-value')).toHaveText('Inherit previous icon');
});

for(const local of [false,true])test((local?'Panel':'Diagram')+' malformed brand is preserved until explicit repair, with exact Undo',async({page,server})=>{
  const raw=fixture(),d=raw.page.sections[0].diagram;if(local)d.panels[0].brand=[];else d.brand=[];
  await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(raw,null,2));
  await inspectPageElement(page,page.locator('#docview .pt-deviceapp .ptitle'));
  const brand=page.locator('#guide .fv-brand-editor');await brand.locator('summary').click();
  await expect(brand).toContainText('Repair it in JSON');await expect(brand.getByLabel('Company logo file')).toHaveCount(0);
  const before=await page.locator('#src').inputValue();await brand.getByRole('button',{name:'Reset invalid branding'}).click();
  const changed=JSON.parse(await page.locator('#src').inputValue()).page.sections[0].diagram;
  expect(local?changed.panels[0].brand:changed.brand).toBeUndefined();
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(before);
});
