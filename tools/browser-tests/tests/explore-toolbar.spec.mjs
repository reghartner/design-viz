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
async function open(page,server,host,raw=story()){
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
function crowdedStory(){
 const raw=story(),section=raw.page.blocks[0],base=section.diagram.layouts[0];
 section.diagram.layouts.push(...Array.from({length:5},(_,i)=>({...structuredClone(base),id:'extra-'+i,name:i===0?'Complete product journey and implementation review with supporting source context':'Additional review choice '+(i+1),presentation:i%2?'standard':'explore'})));
 return raw;
}
for(const host of ['standalone','embed','native inline','native canvas'])test(host+' reader keeps Explore zoom and panel sizing reachable at both widths',async({page,server},info)=>{
 const root=await open(page,server,host),nav=root.locator('.reader-navigation'),row=nav.locator('.reader-toolbar'),zoom=nav.locator('.reader-zoom-menu'),panelMenu=nav.locator('.explore-panel-menu');
 await expect(root.getByRole('button',{name:/Back to page/i})).toHaveCount(0);
 await expect(root.getByRole('button',{name:/Edit in Workbench/i})).toHaveCount(0);
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:1000});await page.evaluate(()=>document.fonts.ready);await expect(row).toBeVisible();
  const geometry=await nav.evaluate(el=>{const n=el.getBoundingClientRect(),top=el.querySelector('.reader-top').getBoundingClientRect(),row=el.querySelector('.reader-toolbar').getBoundingClientRect(),controls=Array.from(el.querySelectorAll('.reader-top :is(button,summary,select)')).filter(node=>node.checkVisibility({visibilityProperty:true})).map(node=>node.getBoundingClientRect());return {nav:{left:n.left,right:n.right,top:n.top,bottom:n.bottom},top:{left:top.left,right:top.right,top:top.top,bottom:top.bottom,height:top.height},row:{left:row.left,right:row.right,top:row.top,bottom:row.bottom},bounded:controls.every(r=>r.left>=n.left-1&&r.right<=n.right+1&&r.top>=n.top-1&&r.bottom<=n.bottom+1)};});
  expect(geometry.row.left).toBeGreaterThanOrEqual(geometry.top.left);expect(geometry.row.right).toBeLessThanOrEqual(geometry.top.right);expect(geometry.row.top).toBeGreaterThanOrEqual(geometry.top.top);expect(geometry.row.bottom).toBeLessThanOrEqual(geometry.top.bottom);expect(geometry.bounded).toBe(true);if(width===1440){expect(geometry.top.height).toBeGreaterThanOrEqual(56);expect(geometry.top.height).toBeLessThanOrEqual(57);}expect(geometry.nav.bottom-geometry.top.bottom).toBeGreaterThanOrEqual(0);expect(geometry.nav.bottom-geometry.top.bottom).toBeLessThanOrEqual(1);
  const graph=root.locator('.explore-board .boardcanvas>svg'),initial=await graph.evaluate(el=>el.getBoundingClientRect().width);
  await zoom.locator('summary').click();await zoom.getByRole('button',{name:'Zoom 150%',exact:true}).click();
  const zoomed=await graph.evaluate(el=>el.getBoundingClientRect().width);expect(zoomed).toBeGreaterThan(initial);
  await zoom.locator('summary').click();
  for(const name of ['Fit diagram','Fit width','Readable','Auto'])await expect(zoom.getByRole('button',{name,exact:true})).toHaveCount(0);
  await page.keyboard.press('Escape');await panelMenu.locator('summary').click();
  const panel=panelMenu.getByRole('button',{name:'Shrink floating panels',exact:true}),overlayValue=panelMenu.locator('.explore-overlay-value');
  const initialScale=Number((await overlayValue.textContent()).replace('%',''));await panel.click();await expect(panel).toBeInViewport();await expect(overlayValue).toHaveText((initialScale-10)+'%');
  await panelMenu.getByRole('button',{name:'Reset floating panels size',exact:true}).click();await page.keyboard.press('Escape');await row.getByRole('button',{name:/^Fit(?: canvas| diagram)?$/,exact:true}).click();
  await info.attach(host+'-'+width,{body:await page.screenshot(),contentType:'image/png'});
 }
 await page.setViewportSize({width:1440,height:1000});
 await chooseNavigation(nav,'View','Overview');await expect(row).toBeVisible();await expect(row.getByRole('button',{name:'Fit',exact:true})).toHaveCount(0);if(host!=='native canvas'){await expect(root.locator('.explore-board')).toHaveCount(0);await expect(root.locator('.board-size').getByRole('button',{name:'Fit diagram',exact:true})).toBeVisible();await expect(root.locator('.board-size').getByRole('button',{name:'Fit width',exact:true})).toBeVisible();}
 await chooseNavigation(nav,'View','Engineering');await expect(row.getByRole('button',{name:'Fit',exact:true})).toBeVisible();await expect(root.locator('.explore-diagram-zoom')).toBeHidden();await panelMenu.locator('summary').click();await expect(panelMenu.locator('.explore-overlay-value')).toHaveText('100%');
});

for(const host of ['standalone','native inline'])test(host+' reader preserves nested utility focus while controls move through More',async({page,server})=>{
 await page.setViewportSize({width:1440,height:1000});const root=await open(page,server,host,crowdedStory()),nav=root.locator('.reader-navigation'),utilities=nav.locator('.reader-page-utilities'),more=utilities.locator(':scope>summary'),panelMenu=nav.locator('.explore-panel-menu'),panelSummary=panelMenu.locator(':scope>summary'),shrink=panelMenu.getByRole('button',{name:'Shrink floating panels',exact:true});
 if(host.startsWith('native'))await expect(root.locator('flowview-root')).toHaveCount(1);
 await panelSummary.focus();await expect(panelSummary).toBeFocused();await page.setViewportSize({width:1024,height:1000});await expect(utilities).toBeVisible();await expect(utilities).toHaveJSProperty('open',true);await expect(panelSummary).toBeFocused();
 await page.setViewportSize({width:1440,height:1000});await expect(utilities).toBeHidden();await expect(panelSummary).toBeFocused();
 await page.setViewportSize({width:1024,height:1000});await expect(more).toBeVisible();await more.focus();await expect(more).toBeFocused();await page.setViewportSize({width:1440,height:1000});await expect(more).toBeHidden();await expect(panelSummary).toBeFocused();
 await panelSummary.click();await shrink.focus();await expect(shrink).toBeFocused();await page.setViewportSize({width:1024,height:1000});await expect(utilities).toBeVisible();await expect(utilities).toHaveJSProperty('open',true);await expect(panelMenu).toHaveJSProperty('open',true);await expect(shrink).toBeFocused();await page.keyboard.press('Escape');await expect(panelMenu).toHaveJSProperty('open',false);await expect(panelSummary).toBeFocused();
 await panelSummary.click();await shrink.focus();await page.setViewportSize({width:1440,height:1000});await expect(utilities).toBeHidden();await expect(panelMenu).toHaveJSProperty('open',true);await expect(shrink).toBeFocused();await page.keyboard.press('Escape');await expect(panelMenu).toHaveJSProperty('open',false);await expect(panelSummary).toBeFocused();
});

test('Explore Fit uses the available desktop canvas beyond 150% without overlapping floating controls',async({page,server},info)=>{
 await page.setViewportSize({width:2560,height:1400});const root=await open(page,server,'standalone'),row=root.locator('.reader-toolbar'),graph=root.locator('.explore-board .boardcanvas>svg');await page.evaluate(()=>document.fonts.ready);
 await row.locator('.reader-zoom-menu>summary').click();await row.getByRole('button',{name:'Zoom 50%',exact:true}).click();const small=await graph.boundingBox();
 await row.getByRole('button',{name:'Fit',exact:true}).click();const fitted=await graph.boundingBox(),scale=await graph.evaluate(el=>el.getBoundingClientRect().width/el.viewBox.baseVal.width),stage=await root.locator('.explore-stage').boundingBox();
 expect(fitted.width).toBeGreaterThan(small.width);expect(scale).toBeGreaterThan(1.5);expect(fitted.x).toBeGreaterThanOrEqual(stage.x-2);expect(fitted.y).toBeGreaterThanOrEqual(stage.y-2);expect(fitted.x+fitted.width).toBeLessThanOrEqual(stage.x+stage.width+2);expect(fitted.y+fitted.height).toBeLessThanOrEqual(stage.y+stage.height+2);
 for(const obstacle of await root.locator('.explore-window:visible,.explore-player:visible').all()){const r=await obstacle.boundingBox();expect(fitted.x<r.x+r.width+10 && fitted.x+fitted.width+10>r.x && fitted.y<r.y+r.height+10 && fitted.y+fitted.height+10>r.y).toBe(false);}
 await page.screenshot({path:'/tmp/explore-fit-tight-desktop.png'});await info.attach('explore-fit-tight-desktop',{body:await page.screenshot(),contentType:'image/png'});
});

test('Page preview keeps live reader zoom while Workbench retains its own controls',async({page,server})=>{
 await page.goto(server.origin+'/workbench.html');const source=JSON.stringify(story(),null,2);await paste(page,source);await closeTools(page);
 await expect(page.locator('#docview .explore-tools')).toBeHidden();await expect(page.locator('#docview>.explore-navigation').getByRole('button',{name:/^(?:Canvas zoom|Diagram zoom|Zoom) in$/,exact:true})).toBeVisible();
 await page.locator('#workspace-appearance>summary').click();await page.locator('#open-page-preview').click();
 const preview=page.locator('#page-preview-view'),nav=preview.locator('.reader-navigation');await expect(nav).toHaveClass(/reader-single-toolbar/);await expect(nav.locator('.reader-top>.reader-toolbar')).toBeVisible();await expect(nav.locator(':scope>.reader-toolbar')).toHaveCount(0);
 await nav.locator('.reader-zoom-menu>summary').click();await nav.getByRole('button',{name:'Zoom 150%',exact:true}).click();await expect(nav.locator('.reader-zoom-menu>summary')).toContainText('150%');
 await nav.locator('.reader-zoom-menu>summary').click();for(const name of ['Fit diagram','Fit width','Readable','Auto'])await expect(nav.getByRole('button',{name,exact:true})).toHaveCount(0);await page.keyboard.press('Escape');
 await nav.locator('.explore-panel-menu>summary').click();await nav.getByRole('button',{name:'Shrink floating panels',exact:true}).click();await expect(nav.locator('.explore-overlay-value')).toHaveText('90%');
 await expect(preview.getByRole('button',{name:/Back to page/i})).toHaveCount(0);
 await page.locator('#close-page-preview').click();await expect(page.locator('#src')).toHaveValue(source);await expect(page.locator('#undo-builder')).toBeDisabled();
 await expect(page.locator('#docview .explore-tools')).toBeHidden();await expect(page.locator('#docview>.explore-navigation').getByRole('button',{name:/^(?:Canvas zoom|Diagram zoom|Zoom) in$/,exact:true})).toBeVisible();
});
