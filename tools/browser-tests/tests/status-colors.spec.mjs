import {test,expect} from '../helpers/test.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {repo} from '../helpers/prepare.mjs';

test('desktop status colors preview local/imported nodes, save across tabs, reload and reset',async({page,context,server},testInfo)=>{
 await page.setViewportSize({width:1600,height:1100});await page.goto(server.origin+'/status-colors.html');
 const view=page.locator('#palette-view');
 await expect(view.locator('[data-dv-node="active"] .card')).toHaveCSS('stroke','rgb(22, 102, 199)');
 await expect(view.locator('[data-dv-node="shared::imported"] .card')).toHaveCSS('stroke','rgb(22, 102, 199)');
 await expect(view.locator('[data-dv-node="shared::missing"]')).toHaveAttribute('data-live-appearance','missing');
 await expect(view.locator('.dv-live-pr-link[data-pr-state=merged]')).toBeVisible();
 await expect(view.locator('.schip[data-step-source="0"]').first()).toBeVisible();
 await page.getByRole('textbox',{name:'Active hex',exact:true}).fill('#9933cc');
 for(const id of ['active','shared::imported'])await expect(view.locator('[data-dv-node="'+id+'"] .card')).toHaveCSS('stroke','rgb(153, 51, 204)');
 expect(await page.evaluate(()=>localStorage.getItem('flowview.status-colors.v1'))).toBeNull();
 // An independent, ordinary built viewer receives storage events and reloads the saved value.
 const reader=await context.newPage();await reader.goto(server.origin+'/standalone.html');
 await page.getByRole('button',{name:'Save defaults',exact:true}).click();
 await expect(reader.locator('#docview')).toHaveCSS('--dv-live-active','#9933cc');
 await reader.reload();await expect(reader.locator('#docview')).toHaveCSS('--dv-live-active','#9933cc');
 await page.reload();await expect(page.getByRole('textbox',{name:'Active hex',exact:true})).toHaveValue('#9933cc');
 await page.getByRole('textbox',{name:'Blocked hex',exact:true}).fill('#008888');
 for(const skin of ['aurora','terminal','pastel','blueprint','rose','lavender','lilac','daylight','editorial']){
  await page.getByLabel('Preview skin').selectOption(skin);
  const surface=await view.locator('.board').first().evaluate(el=>({ground:getComputedStyle(el).getPropertyValue('--dv-board-ground').trim(),background:getComputedStyle(el).backgroundColor,title:getComputedStyle(document.querySelector('#palette-view .doc-title')).color,page:getComputedStyle(document.querySelector('.palette-preview')).backgroundColor}));
  if(['pastel','rose','lavender','lilac','daylight','editorial'].includes(skin)){expect(surface.background).not.toBe('rgb(11, 18, 32)');expect(surface.title).not.toBe('rgb(255, 255, 255)');}
  expect(surface.ground).not.toBe('');
  if(skin==='aurora')expect(surface.page).toBe('rgb(11, 18, 32)');
  if(skin==='blueprint')expect(surface.page).toBe('rgb(7, 59, 119)');
  const breaks=view.locator('.comm-break');expect(await breaks.count()).toBeGreaterThan(0);
  for(const icon of await breaks.all())await expect(icon).toHaveCSS('stroke','rgb(180, 35, 56)');
 }
 await page.getByLabel('Preview skin').selectOption('pastel');
 await expect(view.locator('.board').first()).toHaveCSS('background-color','rgb(250, 251, 254)');
 await page.screenshot({path:testInfo.outputPath('status-colors-desktop.png'),fullPage:true});
 await page.getByRole('button',{name:'Reset all',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Active hex',exact:true})).toHaveValue('#1666c7');
 await expect(reader.locator('#docview')).toHaveCSS('--dv-live-active','#9933cc');
 await page.getByRole('button',{name:'Save defaults',exact:true}).click();await expect(reader.locator('#docview')).toHaveCSS('--dv-live-active','#1666c7');
 expect(await page.evaluate(()=>localStorage.getItem('flowview.status-colors.v1'))).toBeNull();
});

test('palette imports, exports, invalid edits and storage failure preserve honest save state',async({page,server})=>{
 await page.goto(server.origin+'/status-colors.html');await page.getByText('Import / export colors',{exact:true}).click();
 await page.getByLabel('Palette JSON').fill('{"version":1,"colors":{"live-active":"#abcdef","pr-open":"#123456"}}');await page.getByRole('button',{name:'Import JSON',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Active hex',exact:true})).toHaveValue('#abcdef');
 await expect(page.locator('#palette-view .dv-live-pr-link[data-pr-state=open]').first()).toHaveCSS('color','rgb(18, 52, 86)');
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export JSON',exact:true}).click();const exported=await download;expect(exported.suggestedFilename()).toBe('flowview-status-colors.json');
 const stream=await exported.createReadStream();let content='';for await(const chunk of stream)content+=chunk;expect(JSON.parse(content)).toEqual({version:1,colors:{'live-active':'#abcdef','pr-open':'#123456'}});
 await page.getByLabel('Palette JSON').fill('{"version":1,"colors":{"live-active":"#bad"}}');await page.getByRole('button',{name:'Import JSON',exact:true}).click();await expect(page.locator('#palette-message')).toContainText('Import rejected');await expect(page.getByRole('textbox',{name:'Active hex',exact:true})).toHaveValue('#abcdef');
 await page.getByRole('textbox',{name:'Active hex',exact:true}).fill('invalid');await page.getByRole('button',{name:'Save defaults',exact:true}).click();await expect(page.locator('#palette-message')).toContainText('six-digit');expect(await page.evaluate(()=>localStorage.getItem('flowview.status-colors.v1'))).toBeNull();
 await page.getByRole('textbox',{name:'Active hex',exact:true}).fill('#ffffff');
 await page.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('Storage is full','QuotaExceededError');};});await page.getByRole('button',{name:'Save defaults',exact:true}).click();await expect(page.locator('#palette-message')).toContainText('Could not save defaults');
});


test('native sibling palettes isolate host styles, refresh ink and retire listeners',async({page,server})=>{
 await writeFile(path.join(server.root,'palette-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
 await writeFile(path.join(server.root,'palette-native.html'),'<style>#one,#two{width:1000px}</style><div id="one"></div><div id="two"></div><script type="module">import {mountNativeViewer} from "./palette-native.js";window.mount=mountNativeViewer;</script>');
 await page.goto(server.origin+'/palette-native.html');await page.waitForFunction(()=>!!window.mount);
 const spec={page:{title:'Native palette',sections:[{diagram:{nodes:{a:{title:'Active',tickets:['TEST-1']},b:{title:'Unknown',tickets:['TEST-2'],existsWhen:'tickets-done'}},rows:[['a','b']],edges:[{from:'a',to:'b',tickets:['TEST-1']}]}}]}};
 await page.evaluate(spec=>{
  const names=['storage','flowview-status-colors-change'],add=window.addEventListener.bind(window),remove=window.removeEventListener.bind(window);window.paletteListeners=new Set();window.paletteHeld=[];
  window.addEventListener=(type,fn,...rest)=>{if(names.includes(type)){window.paletteListeners.add(fn);window.paletteHeld.push(fn);}return add(type,fn,...rest);};
  window.removeEventListener=(type,fn,...rest)=>{if(names.includes(type))window.paletteListeners.delete(fn);return remove(type,fn,...rest);};
  window.viewers=['one','two'].map(id=>window.mount(document.getElementById(id),spec,{skin:'pastel'}));
  window.viewers.forEach(v=>v.controller.liveStatus.apply({'TEST-1':{state:'active'}}));
 },spec);
 const node=page.locator('#one [data-dv-node="a"]');
 await expect(node.locator('.card')).toHaveCSS('stroke','rgb(22, 102, 199)');
 expect(await page.evaluate(()=>window.paletteListeners.size)).toBe(2);
 const change=async color=>page.evaluate(color=>{localStorage.setItem('flowview.status-colors.v1',JSON.stringify({version:1,colors:{'live-active':color,'live-blocked':'#008888'}}));window.dispatchEvent(new CustomEvent('flowview-status-colors-change'));},color);
 await node.evaluate(el=>el.closest('.board').style.setProperty('--dv-board-ground','#777777'));
 await change('#000000');await expect(node.locator('.t1')).toHaveCSS('fill','rgb(255, 255, 255)');
 await change('#ffffff');await expect(node.locator('.t1')).toHaveCSS('fill','rgb(0, 0, 0)');
 await expect(page.locator('#two [data-dv-node="a"] .card')).toHaveCSS('stroke','rgb(255, 255, 255)');
 expect(await page.locator('body').evaluate(el=>el.style.getPropertyValue('--dv-live-active'))).toBe('');
 for(const state of ['todo','active','done','blocked','missing',null]){
  await page.evaluate(state=>window.viewers.forEach(v=>v.controller.liveStatus.apply(state?{'TEST-1':{state}}:{})),state);
  await expect(page.locator('#one .comm-break')).toHaveCSS('stroke','rgb(180, 35, 56)');
 }
 await page.evaluate(()=>window.viewers[0].destroy());expect(await page.evaluate(()=>window.paletteListeners.size)).toBe(1);
 await change('#abcdef');await page.evaluate(()=>window.viewers[1].controller.liveStatus.apply({'TEST-1':{state:'active'}}));await expect(page.locator('#two [data-dv-node="a"] .card')).toHaveCSS('stroke','rgb(171, 205, 239)');
 await page.evaluate(()=>{window.viewers[1].destroy();window.paletteHeld.forEach(fn=>fn(new CustomEvent('flowview-status-colors-change')));});expect(await page.evaluate(()=>window.paletteListeners.size)).toBe(0);
 await expect(page.locator('#one .docview,#two .docview')).toHaveCount(0);
});
