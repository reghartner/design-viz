import {test,expect,paste,closeTools} from '../helpers/test.mjs';
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
async function view(nav,name){await nav.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));const picker=nav.getByRole('combobox',{name:'Choose View',exact:true});if(await picker.isVisible())await picker.selectOption({label:name});else await nav.getByRole('button',{name,exact:true}).click();}
async function contained(control,container){const a=await control.boundingBox(),b=await container.boundingBox();expect(a.x).toBeGreaterThanOrEqual(b.x-1);expect(a.x+a.width).toBeLessThanOrEqual(b.x+b.width+1);}

test('only Sections scroll, arrows preserve selection, and resize and membership remove overflow',async({page,server},info)=>{
 await page.setViewportSize({width:1440,height:900});const nav=await reader(page,server),strip=nav.locator('.explore-section-strip'),left=nav.getByRole('button',{name:'Scroll sections left'}),right=nav.getByRole('button',{name:'Scroll sections right'});
 for(const name of ['Full story','Explore story','Create + Review','Review + Backstage'])await expect(nav.getByRole('button',{name,exact:true})).toBeInViewport({ratio:1});
 await view(nav,'Explore story');const label=nav.locator('.explore-navigation-diagrams>.explore-navigation-label'),labelBox=await label.boundingBox(),box=await nav.boundingBox(),board=page.locator('.explore-board:visible'),camera=()=>board.evaluate(el=>({x:el.scrollLeft,y:el.scrollTop})),initialCamera=await camera(),hash=new URL(page.url()).hash;
 await expect(left).toBeDisabled();await expect(right).toBeEnabled();
 for(let i=0;i<20 && await right.isEnabled();i++)await right.click();await expect(right).toBeDisabled();await expect(left).toBeEnabled();expect(await label.boundingBox()).toEqual(labelBox);
 const last=strip.locator('.explore-diagram-button:visible').last();await contained(last,strip);
 expect(new URL(page.url()).hash).toBe(hash);expect(await camera()).toEqual(initialCamera);await expect(nav.locator('.explore-diagram-button[aria-pressed=true]')).toHaveText('Section 1 — delivery and review');
 for(let i=0;i<20 && await left.isEnabled();i++)await left.click();await expect(left).toBeDisabled();await expect(right).toBeEnabled();
 await strip.hover();await page.mouse.wheel(200,0);await expect.poll(()=>strip.evaluate(el=>el.scrollLeft)).toBeGreaterThan(0);expect(new URL(page.url()).hash).toBe(hash);
 // Keyboard focus reveals a long clipped chip without selecting its section.
 await last.focus();await contained(last,strip);expect(new URL(page.url()).hash).toBe(hash);await last.press('Enter');await expect(last).toHaveAttribute('aria-pressed','true');
 await view(nav,'Review + Backstage');await expect(strip.locator('.explore-diagram-button:visible')).toHaveCount(2);await contained(last,strip);expect(await nav.boundingBox()).toEqual(box);
 await page.setViewportSize({width:3000,height:900});await expect(left).toBeHidden();await expect(right).toBeHidden();await view(nav,'Full story');await expect(right).toBeHidden();
 await page.setViewportSize({width:1440,height:900});await expect(right).toBeVisible();
 const lanes=await nav.locator('.explore-navigation-tabs,.explore-navigation-chapters,.explore-navigation-actions').evaluateAll(nodes=>nodes.map(el=>({width:el.clientWidth,content:el.scrollWidth,overflow:getComputedStyle(el).overflowX})));
 for(const lane of lanes){expect(lane.content).toBeLessThanOrEqual(lane.width+1);expect(lane.overflow).not.toMatch(/auto|scroll/);}
 await info.attach('desktop-section-arrows',{body:await page.screenshot(),contentType:'image/png'});
});

for(const width of [320,390,870])test(`compact navigation keeps Tabs and Views reachable with stable focus at ${width}px`,async({page,server},info)=>{
 await page.setViewportSize({width,height:900});const nav=await reader(page,server),tabs=nav.getByRole('combobox',{name:'Choose Tab',exact:true}),views=nav.getByRole('combobox',{name:'Choose View',exact:true}),strip=nav.locator('.explore-section-strip');
 await expect(tabs).toBeVisible();await expect(views).toBeVisible();await contained(tabs,nav);await contained(views,nav);expect((await strip.boundingBox()).width).toBeGreaterThan(140);
 await views.focus();await views.selectOption({label:'Explore story'});await expect(views).toBeFocused();const box=await nav.boundingBox();
 await views.selectOption({label:'Full story'});await expect(views).toBeFocused();expect(await nav.boundingBox()).toEqual(box);
 await tabs.focus();await tabs.selectOption({label:'Notes'});await expect(page.locator('#section-notes-section')).toBeVisible();
 if(await tabs.isVisible()){await expect(tabs).toBeFocused();await tabs.selectOption({label:'Product journey'});}else{await expect(nav.getByRole('tab',{name:'Notes',exact:true})).toBeFocused();await nav.getByRole('tab',{name:'Product journey',exact:true}).click();}await expect(tabs).toBeFocused();
 await page.evaluate(()=>{navigator.clipboard.writeText=async value=>{window.copiedTabLink=value;};});await nav.getByRole('button',{name:'Copy link to tab Product journey',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.copiedTabLink)).toContain('t=product-journey');
 await views.focus();await views.selectOption({label:'Explore story'});await expect(views).toBeFocused();await page.setViewportSize({width:1920,height:900});await expect(views).toBeHidden();await expect(nav.getByRole('button',{name:'Explore story',exact:true})).toBeFocused();
 await page.setViewportSize({width,height:900});await expect(views).toBeVisible();await expect(views).toBeFocused();
 await info.attach('compact-navigation-'+width,{body:await page.screenshot(),contentType:'image/png'});
});

test('contained viewers react to their own width and keep sibling navigation independent through teardown',async({page,server})=>{
 await writeFile(path.join(server.root,'navigation-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));await writeFile(path.join(server.root,'navigation-native.html'),'<style>body{margin:0}.host{width:570px;height:700px;display:inline-block;vertical-align:top;overflow:auto}</style><div class="host" id="one"></div><div class="host" id="two"></div><script type="module">import {mountNativeViewer} from "./navigation-native.js";window.mount=mountNativeViewer;</script>');await page.goto(server.origin+'/navigation-native.html');await page.waitForFunction(()=>!!window.mount);await page.evaluate(raw=>{window.one=mount(document.querySelector('#one'),raw);window.two=mount(document.querySelector('#two'),raw);},fixture());
 const first=page.locator('#one .explore-navigation'),second=page.locator('#two .explore-navigation');await expect(first.getByRole('combobox',{name:'Choose View'})).toBeVisible();await view(first,'Explore story');await expect(second.getByRole('combobox',{name:'Choose View'})).toHaveValue('0');
 await page.locator('#one').evaluate(el=>el.style.width='1750px');await expect(first.getByRole('combobox',{name:'Choose View'})).toBeHidden();await expect(second.getByRole('combobox',{name:'Choose View'})).toBeVisible();
 await page.evaluate(()=>one.destroy());await page.setViewportSize({width:1400,height:850});await view(second,'Explore story');await expect(second.getByRole('combobox',{name:'Choose View'})).toHaveValue('1');await page.evaluate(()=>two.destroy());await expect(page.locator('.explore-navigation')).toHaveCount(0);
});

test('Workbench uses the same compact pickers and bounded section strip below app chrome',async({page,server})=>{
 await page.setViewportSize({width:870,height:900});await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(fixture(),null,2));await closeTools(page);const nav=page.locator('#docview > .explore-navigation'),source=await page.locator('#src').inputValue();
 await expect(nav.getByRole('combobox',{name:'Choose View'})).toBeVisible();await view(nav,'Explore story');const box=await nav.boundingBox(),header=await page.locator('.workbench-header').boundingBox();expect(box.y).toBeGreaterThanOrEqual(header.y+header.height-1);expect((await nav.locator('.explore-section-strip').boundingBox()).width).toBeGreaterThan(500);
 await view(nav,'Full story');expect(await nav.boundingBox()).toEqual(box);await expect(page.locator('#src')).toHaveValue(source);
});


test('presentation counters cannot move the navigation across a compact breakpoint',async({page,server})=>{
 const nav=await reader(page,server);await nav.evaluate(el=>window.originalNavigation=el);
 for(const width of [1100,1140,1180,1200,1220,1240,1260,1280,1300,1320,1360,1440]){
  await page.setViewportSize({width,height:900});await view(nav,'Full story');const box=await nav.boundingBox();
  await view(nav,'Explore story');expect(await nav.boundingBox()).toEqual(box);expect(await nav.evaluate(el=>el===window.originalNavigation)).toBe(true);
  const strip=nav.locator('.explore-section-strip');expect((await strip.boundingBox()).width).toBeGreaterThanOrEqual(96);await contained(strip.locator('[aria-pressed=true]'),strip);
  for(const lane of ['tabs','chapters','diagrams','actions'])await contained(nav.locator('.explore-navigation-'+lane),nav);
  const chips=await nav.locator('.explore-navigation-tabs,.explore-navigation-chapters,.explore-navigation-diagrams,.explore-navigation-actions').evaluateAll(nodes=>nodes.map(el=>el.getBoundingClientRect().toJSON()));
  for(let i=0;i<chips.length;i++)for(let j=i+1;j<chips.length;j++){const a=chips[i],b=chips[j];expect(Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top))).toBe(0);}
  await view(nav,'Full story');expect(await nav.boundingBox()).toEqual(box);
 }
});


test('compact Tab links retain visible manual-copy fallback when the clipboard is denied',async({page,server})=>{
 await page.setViewportSize({width:390,height:900});const nav=await reader(page,server);
 await page.evaluate(()=>{navigator.clipboard.writeText=async()=>{throw Error('Denied');};document.execCommand=()=>false;});
 await nav.getByRole('button',{name:'Copy link to tab Product journey',exact:true}).click();
 const field=nav.getByRole('textbox',{name:'Copy this link manually',exact:true});await expect(field).toBeVisible();await expect(field).toBeFocused();await expect(field).toHaveValue(/t=product-journey/);
 const bounds=await field.boundingBox();expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(390);expect(bounds.y).toBeGreaterThan((await nav.boundingBox()).height);
 await expect(nav.getByRole('status')).toHaveText('Copy failed');
});
