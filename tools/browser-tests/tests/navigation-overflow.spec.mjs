import {test,expect,paste,closeTools,chooseNavigation} from '../helpers/test.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {repo} from '../helpers/prepare.mjs';
function fixture(){
 const sections=Array.from({length:6},(_,i)=>({id:'section-'+i,heading:'Section '+(i+1)+' — delivery and review',diagram:{nodes:{a:{title:'Node '+i}},rows:[['a']]}}));
 const members=sections.map(s=>s.id);
 return {page:{title:'Navigation choices',blocks:[{type:'tabs',tabs:[{id:'product',label:'Product journey',defaultView:'all',sections,views:[{id:'all',name:'Full story',presentation:'standard',sections:members},{id:'explore',name:'Explore story',presentation:'explore',sections:members},{id:'review',name:'Create + Review',presentation:'standard',sections:members.slice(0,2)},{id:'subset',name:'Review + Backstage',presentation:'explore',sections:members.slice(-2)}]},{id:'notes',label:'Notes',sections:[{id:'notes-section',heading:'Notes',text:'A different Tab.'}]}]}]}};
}
async function reader(page,server){const input=path.join(server.root,'navigation-overflow.json');await writeFile(input,JSON.stringify(fixture()));execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),path.join(server.root,'navigation-overflow.html')]);await page.goto(server.origin+'/navigation-overflow.html');await page.evaluate(()=>document.fonts.ready);return page.locator('#docview > .explore-navigation');}
async function view(nav,name){await chooseNavigation(nav,'View',name);}
async function contents(nav){if(!await nav.locator('.reader-contents').isVisible())await nav.locator('.reader-top>button').click();}
async function contained(control,container){const a=await control.boundingBox(),b=await container.boundingBox();expect(a.x).toBeGreaterThanOrEqual(b.x-1);expect(a.x+a.width).toBeLessThanOrEqual(b.x+b.width+1);}

test('Contents scrolls independently without changing camera or selected section',async({page,server},info)=>{
 await page.setViewportSize({width:1440,height:640});const nav=await reader(page,server);await view(nav,'Explore story');
 const box=await nav.boundingBox(),board=page.locator('.explore-board:visible'),camera=()=>board.evaluate(el=>({x:el.scrollLeft,y:el.scrollTop})),initialCamera=await camera(),hash=new URL(page.url()).hash;
 const tree=nav.locator('.reader-contents-tree'),footer=await nav.locator('.reader-theme-footer').boundingBox();await tree.hover();await page.mouse.wheel(0,600);await expect.poll(()=>tree.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
 expect(new URL(page.url()).hash).toBe(hash);expect(await camera()).toEqual(initialCamera);expect(await nav.locator('.reader-theme-footer').boundingBox()).toEqual(footer);
 const last=tree.locator('[data-reader-view=explore] .reader-tree-section').last();await last.focus();await expect(last).toBeInViewport();expect(new URL(page.url()).hash).toBe(hash);await last.press('Enter');await expect(last).toHaveAttribute('aria-current','page');
 await view(nav,'Review + Backstage');await expect(tree.locator('[data-reader-view=subset] .reader-tree-section')).toHaveCount(2);expect(await nav.boundingBox()).toEqual(box);
 await page.setViewportSize({width:3000,height:640});await expect(nav.locator('.explore-section-strip')).toBeHidden();await page.setViewportSize({width:1440,height:640});await expect(nav.locator('.explore-section-strip')).toBeHidden();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(1440);await info.attach('desktop-contents',{body:await page.screenshot(),contentType:'image/png'});
});
for(const width of [320,390,870])test(`Contents keeps Tabs and Views reachable at ${width}px`,async({page,server})=>{
 await page.setViewportSize({width,height:900});const nav=await reader(page,server);await view(nav,'Explore story');const box=await nav.boundingBox();await view(nav,'Full story');expect(await nav.boundingBox()).toEqual(box);
 await chooseNavigation(nav,'Tab','Notes');await expect(page.locator('#section-notes-section')).toBeVisible();await chooseNavigation(nav,'Tab','Product journey');
 if(width<=670)await nav.locator('.reader-utilities>summary').click();await page.evaluate(()=>{navigator.clipboard.writeText=async value=>window.copiedTabLink=value;});await nav.getByRole('button',{name:'Copy link to tab Product journey',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.copiedTabLink)).toContain('t=product-journey');
 await view(nav,'Explore story');await page.setViewportSize({width:1920,height:900});await contents(nav);await expect(nav.locator('.reader-tree-view[aria-current=page]')).toHaveText('Explore story');await page.setViewportSize({width,height:900});await expect(nav.locator('.reader-tree-view[aria-current=page]')).toHaveText('Explore story');
});
test('contained Contents responds to its own width and isolates sibling teardown',async({page,server})=>{
 await writeFile(path.join(server.root,'navigation-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));await writeFile(path.join(server.root,'navigation-native.html'),'<style>body{margin:0}.host{width:570px;height:700px;display:inline-block;vertical-align:top;overflow:auto}</style><div class="host" id="one"></div><div class="host" id="two"></div><script type="module">import {mountNativeViewer} from "./navigation-native.js";window.mount=mountNativeViewer;</script>');await page.goto(server.origin+'/navigation-native.html');await page.waitForFunction(()=>!!window.mount);await page.evaluate(raw=>{window.one=mount(document.querySelector('#one'),raw);window.two=mount(document.querySelector('#two'),raw);},fixture());
 const first=page.locator('#one .explore-navigation'),second=page.locator('#two .explore-navigation');await expect(first).toHaveClass(/reader-narrow/);await view(first,'Explore story');await expect(second.locator('.reader-top-view[aria-selected=true]')).toHaveText('Full story');
 await page.locator('#one').evaluate(el=>el.style.width='1750px');await expect(first).not.toHaveClass(/reader-narrow/);await expect(second).toHaveClass(/reader-narrow/);
 await page.evaluate(()=>one.destroy());await view(second,'Explore story');await expect(second.locator('.reader-top-view[aria-selected=true]')).toHaveText('Explore story');await page.evaluate(()=>two.destroy());await expect(page.locator('.explore-navigation')).toHaveCount(0);
});
for(const font of ['default','Arial'])test('reader chrome stays fixed across widths and presentations with '+font,async({page,server})=>{
 const nav=await reader(page,server);if(font!=='default')await page.addStyleTag({content:'.reader-navigation :is(button,select){font-family:Arial!important}'});await nav.evaluate(el=>window.originalNavigation=el);
 for(const width of [320,390,670,870,1100,1240,1440]){await page.setViewportSize({width,height:900});await view(nav,'Full story');const box=await nav.boundingBox();await view(nav,'Explore story');expect(await nav.boundingBox()).toEqual(box);expect(await nav.evaluate(el=>el===window.originalNavigation)).toBe(true);await contained(nav.locator('.reader-page-index'),nav);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);}
});
test('phone Tab link preserves visible manual-copy fallback when clipboard is denied',async({page,server})=>{
 await page.setViewportSize({width:390,height:900});const nav=await reader(page,server);await page.evaluate(()=>{navigator.clipboard.writeText=async()=>{throw Error('Denied');};document.execCommand=()=>false;});await nav.locator('.reader-utilities>summary').click();await nav.getByRole('button',{name:'Copy link to tab Product journey',exact:true}).click();
 const field=nav.getByRole('textbox',{name:'Copy this link manually',exact:true});await expect(field).toBeVisible();await expect(field).toBeFocused();await expect(field).toHaveValue(/t=product-journey/);const bounds=await field.boundingBox();expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(390);await expect(nav.getByRole('status')).toHaveText('Copy failed');
});
test('Workbench uses the shared Contents and Views shell below app chrome',async({page,server})=>{
 await page.setViewportSize({width:870,height:900});await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(fixture(),null,2));await closeTools(page);const nav=page.locator('#docview > .explore-navigation'),source=await page.locator('#src').inputValue();
 await expect(nav.locator('.reader-contents')).toBeVisible();await expect(nav.getByRole('tab',{name:'Full story',exact:true})).toBeVisible();await view(nav,'Explore story');const box=await nav.boundingBox(),header=await page.locator('.workbench-header').boundingBox();expect(box.y).toBeGreaterThanOrEqual(header.y+header.height-1);await expect(nav.locator('.explore-section-strip')).toBeHidden();await expect(nav.locator('.reader-tree-section')).toHaveCount(6);
 await view(nav,'Full story');expect(await nav.boundingBox()).toEqual(box);await expect(page.locator('#src')).toHaveValue(source);
});
