import {test,expect,paste,closeTools} from '../helpers/test.mjs';
import {editorSpec} from '../fixtures/editor-spec.mjs';
import {writeFile,readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {repo} from '../helpers/prepare.mjs';

function story(){
 const raw=editorSpec(),section=raw.page.blocks[0];section.id='delivery';
 section.diagram.layouts[0].presentation='explore';section.diagram.layouts[0].name='Engineering';
 section.diagram.layouts.push({...structuredClone(section.diagram.layouts[0]),id:'standard',name:'Overview',presentation:'standard'});
 return raw;
}
async function open(page,server,host){
 const raw=story();
 if(host.startsWith('native')){
  await writeFile(path.join(server.root,'toolbar-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
  await writeFile(path.join(server.root,'toolbar-native.html'),'<style>body{margin:0}#host{position:fixed;inset:0}</style><div id="host"></div><script type="module">import {mountNativeViewer} from "./toolbar-native.js";window.mount=mountNativeViewer;</script>');
  await page.goto(server.origin+'/toolbar-native.html');await page.waitForFunction(()=>!!window.mount);
  await page.evaluate(({raw,canvas})=>{window.viewer=mount(document.querySelector('#host'),raw);if(canvas)viewer.setCanvas(true);},{raw,canvas:host==='native canvas'});
  return page.locator('#host');
 }
 const input=path.join(server.root,'toolbar.json'),output=path.join(server.root,'toolbar.html');await writeFile(input,JSON.stringify(raw));
 execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),output]);
 if(host==='embed'){
  await writeFile(path.join(server.root,'toolbar-embed.html'),'<style>body{margin:0}iframe{width:100vw;height:100dvh;border:0;display:block}</style><iframe title="Diagram" src="/toolbar.html?embed=1&section=delivery"></iframe>');
  await page.goto(server.origin+'/toolbar-embed.html');return page.frameLocator('iframe').locator('#docview');
 }
 await page.goto(server.origin+'/toolbar.html');return page.locator('#docview');
}
for(const host of ['standalone','embed','native inline','native canvas'])test(host+' Explore has one flush sizing row with equal controls and reachable narrow overflow',async({page,server},info)=>{
 const root=await open(page,server,host),row=root.getByRole('group',{name:'Explore sizing and zoom',exact:true});
 await expect(root.getByRole('button',{name:/Back to page/i})).toHaveCount(0);
 await expect(root.getByRole('button',{name:/Edit in Workbench/i})).toHaveCount(0);
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:1000});await page.evaluate(()=>document.fonts.ready);
  await expect(row).toBeVisible();
  const geometry=await row.evaluate(el=>{
   const r=el.getBoundingClientRect(),shell=el.parentElement,nav=shell.querySelector(':scope>.diagram-views').getBoundingClientRect(),stage=shell.querySelector('.explore-stage').getBoundingClientRect();
   const controls=Array.from(el.querySelectorAll('.mbtn,.explore-zoom')).filter(b=>b.getClientRects().length).map(b=>{const r=b.getBoundingClientRect();return {y:r.y,h:r.height};});
   return {top:r.top,bottom:r.bottom,height:r.height,navBottom:nav.bottom,stageTop:stage.top,controls};
  });
  expect(geometry.top).toBeCloseTo(geometry.navBottom,0);expect(geometry.stageTop).toBeCloseTo(geometry.bottom,0);
  expect(geometry.height).toBeLessThanOrEqual(45);expect(geometry.controls.length).toBe(10);
  expect(new Set(geometry.controls.map(b=>b.y)).size).toBe(1);expect(new Set(geometry.controls.map(b=>b.h))).toEqual(new Set([28]));
  for(const name of ['Auto','Fit width','Readable']){
   const button=row.getByRole('button',{name,exact:true});await button.focus();await button.click();await expect(button).toHaveAttribute('aria-pressed','true');await expect(button).toBeInViewport();
  }
  const panel=row.getByRole('button',{name:'Shrink panels and controls',exact:true});await panel.focus();await panel.click();await expect(panel).toBeInViewport();await expect(row.locator('.explore-overlay-value')).toHaveText('90%');
  await row.getByRole('button',{name:'Reset panels and controls size',exact:true}).click();
  await row.getByRole('button',{name:'Fit diagram',exact:true}).click();
  await row.getByRole('button',{name:'Auto',exact:true}).focus();
  await info.attach(host+'-'+width,{body:await page.screenshot(),contentType:'image/png'});
 }
 await root.getByRole('button',{name:'Overview',exact:true}).click();
 if(host!=='native canvas')await expect(row).toBeHidden();
 await root.getByRole('button',{name:'Engineering',exact:true}).click();await expect(row).toBeVisible();await expect(row.locator('.explore-overlay-value')).toHaveText('100%');
});

test('Page preview uses the reader row while Workbench retains one owned set of controls',async({page,server})=>{
 await page.goto(server.origin+'/workbench.html');const source=JSON.stringify(story(),null,2);await paste(page,source);await closeTools(page);
 await expect(page.locator('#docview .explore-tools')).toBeHidden();await expect(page.locator('#workspace-zoom-in')).toBeVisible();
 await page.locator('#workspace-appearance>summary').click();await page.locator('#open-page-preview').click();
 const preview=page.locator('#page-preview-view'),row=preview.getByRole('group',{name:'Explore sizing and zoom',exact:true});await expect(row).toBeVisible();
 const geometry=await row.evaluate(el=>{const shell=el.parentElement,r=el.getBoundingClientRect(),nav=shell.querySelector('.diagram-views').getBoundingClientRect(),stage=shell.querySelector('.explore-stage').getBoundingClientRect();return {top:r.top,bottom:r.bottom,navBottom:nav.bottom,stageTop:stage.top};});
 expect(geometry.top).toBe(geometry.navBottom);expect(geometry.stageTop).toBe(geometry.bottom);
 await row.getByRole('button',{name:'Shrink panels and controls',exact:true}).click();await expect(row.locator('.explore-overlay-value')).toHaveText('90%');
 await expect(preview.getByRole('button',{name:/Back to page/i})).toHaveCount(0);
 await page.locator('#close-page-preview').click();await expect(page.locator('#src')).toHaveValue(source);await expect(page.locator('#undo-builder')).toBeDisabled();
 await expect(page.locator('#docview .explore-tools')).toBeHidden();await expect(page.locator('#workspace-zoom-in')).toBeVisible();
});
