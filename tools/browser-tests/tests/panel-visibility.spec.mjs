import {test,expect,paste} from '../helpers/test.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {repo} from '../helpers/prepare.mjs';

const fixture=()=>({page:{title:'Panel visibility',sections:[{heading:'A visitor arrives',diagram:{
 view:'step',autoplay:false,nodes:{n:{title:'Doorbell'}},rows:[['n']],
 panels:[{id:'phone',type:'phone',title:'Resident phone',visible:false},{id:'camera',type:'homemap',title:'Home',devices:[{id:'door',kind:'camera',x:20,y:50}]}],
 steps:[{id:'start',text:'Waiting',nodes:['n']},{id:'notify',text:'Visitor detected',panelVisibility:{phone:true,camera:false},panels:{phone:{notify:{app:'Doorbell',title:'Visitor',text:'At the door'}}}},{id:'failed',text:'Offline',panelVisibility:{camera:false}},{id:'shared',text:'Finish',nodes:['n']}],
 paths:[{id:'happy',label:'Happy path',steps:['start','notify','shared']},{id:'offline',label:'Offline',steps:['start','failed','shared']}],
 layouts:[{id:'story',name:'Story',sectionLayout:{default:[{panel:'camera',x:0,y:0,w:6,h:10},{panel:'phone',x:6,y:0,w:6,h:10},{controls:'steps',x:0,y:10,w:12,h:5,attachTo:'panel:camera'}]}},{id:'summary',name:'Summary',steps:['start','shared'],sectionLayout:{default:[{panel:'camera',x:0,y:0,w:6,h:10,hidden:true},{panel:'phone',x:6,y:0,w:6,h:10},{controls:'steps',x:0,y:10,w:12,h:5}]}}],defaultLayout:'story'
}}]}});

for(const host of ['workbench','standalone','native'])test(host+' whole panels hide per step without shifting layout or losing docked playback, state, path isolation or view membership',async({page,server},info)=>{
 let root;
 if(host==='workbench'){
  await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(fixture(),null,2));root=page.locator('#docview');
 }else if(host==='standalone'){
  await writeFile(path.join(server.root,'visibility.json'),JSON.stringify(fixture()));
  execFileSync('python3',[path.join(repo,'tools/inject.py'),path.join(server.root,'visibility.json'),path.join(repo,'template/flowview.html'),path.join(server.root,'visibility.html')]);
  await page.goto(server.origin+'/visibility.html');root=page.locator('.docview');
 }else{
  await writeFile(path.join(server.root,'visibility-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
  await writeFile(path.join(server.root,'visibility-native.html'),'<div id="host"></div><script type="module">import {mountNativeViewer} from "./visibility-native.js";window.mount=mountNativeViewer;</script>');
  await page.goto(server.origin+'/visibility-native.html');await page.waitForFunction(()=>!!window.mount);
  await page.evaluate(raw=>{window.viewer=mount(document.querySelector('#host'),raw,{skin:'pastel'});},fixture());root=page.locator('#host');
 }
 const camera=root.locator('.pt-homemap'),phone=root.locator('.pt-phone');
 const next=root.getByRole('button',{name:'Next step',exact:true});
 await expect(phone).toHaveClass(/panel-step-hidden/);await expect(camera).not.toHaveClass(/panel-step-hidden/);
 await expect(camera).toHaveClass(/layout-docked-card/);await expect(camera.locator('.termbar')).toBeVisible();
 const before=await camera.boundingBox();await next.click();
 await expect(camera).toHaveClass(/panel-step-hidden/);await expect(camera.locator('.pbody')).toBeHidden();
 await expect(camera.locator('.pbody')).toHaveAttribute('inert','');await expect(camera.locator('.pbody')).toHaveAttribute('aria-hidden','true');
 await expect(phone).not.toHaveClass(/panel-step-hidden/);await expect(phone).toContainText('Visitor');
 await expect(next).toBeVisible();expect(await camera.boundingBox()).toEqual(before);
 await page.screenshot({path:info.outputPath(host+'-camera-hidden.png')});
 await next.click();await expect(camera).toHaveClass(/panel-step-hidden/);
 await root.locator('[data-dv-path="offline"]').first().click();await expect(phone).toHaveClass(/panel-step-hidden/);
 await next.click();await next.click();await expect(phone).toHaveClass(/panel-step-hidden/);
 await root.locator('[data-dv-path="happy"]').first().click();await root.getByRole('button',{name:'Summary',exact:true}).click();
 await next.click();await expect(phone).not.toHaveClass(/panel-step-hidden/);await expect(phone).toContainText('Visitor');
 await expect(root.locator('[data-layout-key="panel:camera"]')).toBeHidden();
 await root.getByRole('button',{name:'AMBIENT',exact:true}).click();await expect(phone).not.toHaveClass(/panel-step-hidden/);await expect(camera).not.toHaveClass(/panel-step-hidden/);
 await expect(root.locator('[data-layout-key="panel:camera"]')).toBeHidden();
 await page.screenshot({path:info.outputPath(host+'-panel-visibility.png')});
 if(host==='native'){await page.evaluate(()=>viewer.destroy());await expect(root).toBeEmpty();}
});

test('editor exposes every panel without a patch; Show Hide Inherit and starting visibility round-trip with Undo',async({page,server})=>{
 const raw=fixture();delete raw.page.sections[0].diagram.layouts;delete raw.page.sections[0].diagram.defaultLayout;
 await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(raw,null,2));
 const source=page.locator('#src'),guide=page.locator('#guide');
 await page.locator('#editor-tab-steps').click();await page.locator('#steps-list [data-step-index="0"]').click();await page.locator('#editor-tab-inspect').click();
 const visibility=guide.getByLabel('Panel visibility · phone',{exact:true});await expect(visibility).toHaveValue('inherit');
 const before=await source.inputValue();await visibility.selectOption('show');
 await expect(page.locator('#docview .pt-phone')).not.toHaveClass(/panel-step-hidden/);
 const changed=await source.inputValue();expect(JSON.parse(changed).page.sections[0].diagram.steps[0].panelVisibility).toEqual({phone:true});
 await page.locator('#undo-builder').click();await expect(source).toHaveValue(before);
 await page.locator('#redo-builder').click();await expect(source).toHaveValue(changed);
 await page.locator('#editor-tab-steps').click();await page.locator('#steps-list [data-step-index="0"]').click();await page.locator('#editor-tab-inspect').click();
 await visibility.selectOption('hide');await expect(page.locator('#docview .pt-phone')).toHaveClass(/panel-step-hidden/);
 await visibility.selectOption('inherit');await expect(source).toHaveValue(before);
 await page.locator('#docview .pt-homemap .ptitle').click();await guide.getByLabel('Starting panel visibility').selectOption('hide');
 await expect(page.locator('#docview .pt-homemap')).toHaveClass(/panel-step-hidden/);
 expect(JSON.parse(await source.inputValue()).page.sections[0].diagram.panels[1].visible).toBe(false);
});

test('panel visibility disclosure stays collapsed through edits and is scoped to its section and project',async({page,server})=>{
 const raw=fixture();raw.page.sections.push(structuredClone(raw.page.sections[0]));raw.page.sections[1].heading='Another story';
 await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(raw,null,2));
 const inspect=async(section)=>{await page.locator('#editor-tab-steps').click();await page.locator('#steps-section').selectOption(String(section));await page.locator('#steps-list [data-step-index="0"]').click();await page.locator('#steps-inspect').click();};
 await inspect(0);const fold=page.locator('#guide .panel-visibility');await fold.locator(':scope > summary').click();await expect(fold).not.toHaveAttribute('open','');
 const caption=page.locator('#guide').getByLabel('text',{exact:true});await caption.fill('Visibility controls stay folded');await caption.press('Tab');await expect(fold).not.toHaveAttribute('open','');
 await page.locator('#editor-tab-json').click();await page.locator('#editor-tab-inspect').click();await expect(fold).not.toHaveAttribute('open','');
 await inspect(1);await expect(fold).toHaveAttribute('open','');await inspect(0);await expect(fold).not.toHaveAttribute('open','');
 await page.locator('#workspace-home').click();await paste(page,JSON.stringify(fixture(),null,2));await inspect(0);await expect(fold).toHaveAttribute('open','');
});
