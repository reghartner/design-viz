import {chooseNavigation} from '../helpers/test.mjs';
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
for(const host of ['standalone','embed','native inline','native canvas'])test(host+' reader keeps sizing modes, zoom and panel sizing reachable at both widths',async({page,server},info)=>{
 const root=await open(page,server,host),nav=root.locator('.reader-navigation'),row=nav.locator('.reader-toolbar'),zoom=nav.locator('.reader-zoom-menu'),panelMenu=nav.locator('.explore-panel-menu');
 await expect(root.getByRole('button',{name:/Back to page/i})).toHaveCount(0);
 await expect(root.getByRole('button',{name:/Edit in Workbench/i})).toHaveCount(0);
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:1000});await page.evaluate(()=>document.fonts.ready);await expect(row).toBeVisible();
  const geometry=await row.evaluate(el=>{const r=el.getBoundingClientRect(),p=el.querySelector('.reader-page-index').getBoundingClientRect();return {height:r.height,center:(p.left+p.right-r.left-r.right)/2};});
  expect(geometry.height).toBe(45);expect(Math.abs(geometry.center)).toBeLessThan(1);
  await zoom.locator('summary').click();await zoom.getByRole('button',{name:'Zoom 150%',exact:true}).click();
  const graph=root.locator('.explore-board .boardcanvas>svg');const zoomed=await graph.evaluate(el=>el.getBoundingClientRect().width);
  await zoom.locator('summary').click();
  for(const name of ['Readable','Fit width','Auto']){
   const button=zoom.getByRole('button',{name,exact:true});await button.focus();await button.click();await expect(button).toHaveAttribute('aria-pressed','true');await expect(button).toBeInViewport();
   if(name==='Readable'){const size=await graph.evaluate(el=>({width:el.getBoundingClientRect().width,natural:el.viewBox.baseVal.width}));expect(size.width).toBeCloseTo(size.natural,0);expect(size.width).toBeLessThan(zoomed);}
  }
  await page.keyboard.press('Escape');await panelMenu.locator('summary').click();
  const panel=panelMenu.getByRole('button',{name:'Shrink panels and controls',exact:true}),overlayValue=panelMenu.locator('.explore-overlay-value');
  const initialScale=Number((await overlayValue.textContent()).replace('%',''));await panel.click();await expect(panel).toBeInViewport();await expect(overlayValue).toHaveText((initialScale-10)+'%');
  await panelMenu.getByRole('button',{name:'Reset panels and controls size',exact:true}).click();await page.keyboard.press('Escape');await row.getByRole('button',{name:'Fit',exact:true}).click();
  await info.attach(host+'-'+width,{body:await page.screenshot(),contentType:'image/png'});
 }
 await chooseNavigation(nav,'View','Overview');await expect(row).toBeVisible();if(host!=='native canvas')await expect(root.locator('.explore-board')).toHaveCount(0);
 await chooseNavigation(nav,'View','Engineering');await panelMenu.locator('summary').click();await expect(panelMenu.locator('.explore-overlay-value')).toHaveText('100%');
});

test('Page preview keeps live reader sizing while Workbench retains its own controls',async({page,server})=>{
 await page.goto(server.origin+'/workbench.html');const source=JSON.stringify(story(),null,2);await paste(page,source);await closeTools(page);
 await expect(page.locator('#docview .explore-tools')).toBeHidden();await expect(page.locator('#docview>.explore-navigation').getByRole('button',{name:'Zoom in',exact:true})).toBeVisible();
 await page.locator('#workspace-appearance>summary').click();await page.locator('#open-page-preview').click();
 const preview=page.locator('#page-preview-view'),nav=preview.locator('.reader-navigation');await expect(nav.locator('.reader-toolbar')).toBeVisible();
 await nav.locator('.reader-zoom-menu>summary').click();await nav.getByRole('button',{name:'Readable',exact:true}).click();await expect(nav.getByRole('button',{name:'Readable',exact:true})).toHaveAttribute('aria-pressed','true');await page.keyboard.press('Escape');
 await nav.locator('.explore-panel-menu>summary').click();await nav.getByRole('button',{name:'Shrink panels and controls',exact:true}).click();await expect(nav.locator('.explore-overlay-value')).toHaveText('90%');
 await expect(preview.getByRole('button',{name:/Back to page/i})).toHaveCount(0);
 await page.locator('#close-page-preview').click();await expect(page.locator('#src')).toHaveValue(source);await expect(page.locator('#undo-builder')).toBeDisabled();
 await expect(page.locator('#docview .explore-tools')).toBeHidden();await expect(page.locator('#docview>.explore-navigation').getByRole('button',{name:'Zoom in',exact:true})).toBeVisible();
});
