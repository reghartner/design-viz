import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {repo} from '../helpers/prepare.mjs';
import {test,expect,paste,pastePage,closeTools} from '../helpers/test.mjs';
function fixture(row=false){return {page:{title:'Spatial edit',skin:'pastel',sections:[{heading:'Explore objects',diagram:{autoplay:false,nodes:{a:{title:'Anchor'},b:{title:'Second'}},rows:row?[['a','b']]:[[]],floats:row?[]:[{id:'a',x:180,y:100},{id:'b',x:500,y:320}],edges:[{from:'a',to:'b'}],panels:[{id:'p',type:'state',title:'Canvas status',states:['Ready'],initial:{state:'Ready'}},{id:'q',type:'state',title:'Floating status',states:['Ready'],initial:{state:'Ready'}}],layouts:[{id:'canvas',name:'Canvas',presentation:'explore',sectionLayout:{default:[{x:0,y:0,w:8,h:12},{panel:'p',x:8,y:0,w:4,h:4},{panel:'q',x:8,y:4,w:4,h:4}]},exploreLayout:{panelPlacement:'canvas',panelPlacements:[{panel:'q',placement:'floating'}],canvas:{panels:[{panel:'p',x:700,y:80,w:240,h:400}]}}}]}}]}};}
async function open(page,server,row=false,skin='pastel'){await page.setViewportSize({width:1280,height:800});await page.goto(server.origin+'/standalone.html');await page.evaluate(()=>localStorage.clear());await page.goto(server.origin+'/workbench.html');const raw=fixture(row);raw.page.skin=skin;await paste(page,JSON.stringify(raw));await closeTools(page);await page.evaluate(()=>document.fonts.ready);await page.locator('#workspace-fit').click();await expect(page.locator('[data-explore-panel=p]')).toBeVisible();}
const node=page=>page.locator('[data-dv-node=a]');
const panel=page=>page.locator('[data-explore-panel=p]');
const menu=page=>page.getByRole('menu',{name:'Object actions'});
async function source(page){return page.locator('#src').inputValue();}
async function history(page,before,after){await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(before);await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(after);}
async function marquee(page,hold=false){
 const bounds=await page.locator('.explore-board').evaluate(el=>{const r=el.getBoundingClientRect();const boxes=Array.from(el.querySelectorAll('.boardcanvas [data-dv-node],.explore-canvas-objects [data-explore-panel]')).map(e=>e.getBoundingClientRect());let x=Math.max(r.left+5,Math.min(...boxes.map(b=>b.left))-16),y=Math.max(r.top+5,Math.min(...boxes.map(b=>b.top))-16);return {x,y,right:Math.min(r.right-5,Math.max(...boxes.map(b=>b.right))+16),bottom:Math.min(r.bottom-5,Math.max(...boxes.map(b=>b.bottom))+16)};});
 await page.keyboard.down('Alt');await page.mouse.move(bounds.x,bounds.y);await page.mouse.down();await page.mouse.move(bounds.right,bounds.bottom,{steps:8});if(!hold){await page.mouse.up();await page.keyboard.up('Alt');}
}
test('marquee selects intersecting nodes and canvas panels without source or pan; menu edits mixed objects atomically',async({page,server},info)=>{
 await open(page,server);const original=await source(page),scroll=await page.locator('.explore-board').evaluate(el=>[el.scrollLeft,el.scrollTop]);
 await marquee(page,true);await expect(page.locator('.dv-selection-marquee')).toBeVisible();await page.screenshot({path:'/tmp/explore-marquee-1280.png'});await info.attach('marquee',{body:await page.screenshot(),contentType:'image/png'});await page.mouse.up();await page.keyboard.up('Alt');
 await expect(page.locator('.dv-sel[data-dv-node]')).toHaveCount(2);await expect(panel(page)).toHaveClass(/dv-sel/);await expect(page.locator('[data-explore-panel=q]')).not.toHaveClass(/dv-sel/);expect(await source(page)).toBe(original);expect(await page.locator('.explore-board').evaluate(el=>[el.scrollLeft,el.scrollTop])).toEqual(scroll);await expect(page.locator('#undo-builder')).toBeDisabled();
 await node(page).click({button:'right'});await expect(menu(page)).toBeVisible();await page.screenshot({path:'/tmp/explore-object-menu-1280.png'});await info.attach('object menu',{body:await page.screenshot(),contentType:'image/png'});
 const mr=await menu(page).boundingBox();expect(mr.x).toBeGreaterThanOrEqual(0);expect(mr.x+mr.width).toBeLessThanOrEqual(1280);expect(mr.y+mr.height).toBeLessThanOrEqual(800);
 await menu(page).getByRole('menuitem',{name:'Inspect',exact:true}).click();await expect(page.locator('#guide')).toContainText('3 objects selected');
 await closeTools(page);await node(page).click({button:'right'});await menu(page).getByRole('menuitem',{name:'Align horizontally',exact:true}).click();const aligned=await source(page);expect(aligned).not.toBe(original);let d=JSON.parse(aligned).page.sections[0].diagram,p=d.layouts[0].exploreLayout.canvas.panels[0];expect(d.floats[0].y).toBeCloseTo(d.floats[1].y,1);expect(p.y+p.h/2).toBeCloseTo(d.floats[0].y,1);expect(p.h).toBeLessThan(400);await history(page,original,aligned);
 await closeTools(page);await page.locator('#workspace-fit').click();await marquee(page);await node(page).click({button:'right'});await menu(page).getByRole('menuitem',{name:'Duplicate',exact:true}).click();const duplicated=await source(page);d=JSON.parse(duplicated).page.sections[0].diagram;expect(Object.keys(d.nodes)).toHaveLength(4);expect(d.panels).toHaveLength(3);expect(d.layouts[0].exploreLayout.canvas.panels).toHaveLength(2);await history(page,aligned,duplicated);
 await closeTools(page);await page.locator('#workspace-fit').click();await marquee(page);await node(page).click({button:'right'});await menu(page).getByRole('menuitem',{name:'Delete',exact:true}).click();const deleted=await source(page);d=JSON.parse(deleted).page.sections[0].diagram;expect(Object.keys(d.nodes)).toHaveLength(0);expect(d.panels.map(p=>p.id)).toEqual(['q']);await history(page,duplicated,deleted);
});
test('menu covers panel body border and header, modifiers preserve selection, Escape clears, row alignment explains refusal',async({page,server})=>{
 await open(page,server,true);const original=await source(page);
 await node(page).click();await panel(page).click({position:{x:4,y:4},modifiers:['Shift']});await expect(node(page)).toHaveClass(/dv-sel/);await expect(panel(page)).toHaveClass(/dv-sel/);
 await panel(page).click({button:'right',position:{x:4,y:4}});await expect(menu(page).getByRole('menuitem',{name:/Align horizontally/})).toHaveAttribute('aria-disabled','true');await expect(menu(page)).toContainText('Free placement');await page.keyboard.press('Escape');await expect(menu(page)).toHaveCount(0);expect(await source(page)).toBe(original);
 await panel(page).focus();await panel(page).locator('.explore-window-grip').click({button:'right'});await expect(menu(page)).toBeVisible();await page.keyboard.press('ArrowDown');await expect(menu(page).getByRole('menuitem',{name:'Delete',exact:true})).toBeFocused();await page.keyboard.press('Escape');
 await page.keyboard.press('Escape');await expect(page.locator('.dv-sel')).toHaveCount(0);
 await node(page).click({modifiers:['Alt']});await expect(page.locator('.dv-connect-hint')).toBeVisible();await page.keyboard.press('Escape');
});
test('marquee intersection follows zoom, Escape and source replacement retire transient state',async({page,server})=>{
 await open(page,server);const original=await source(page);
 for(const delta of [0,150,-250]){
  if(delta)await page.locator('.explore-board').dispatchEvent('wheel',{clientX:430,clientY:400,deltaY:delta,ctrlKey:true,bubbles:true,cancelable:true});
  const r=await node(page).boundingBox();await page.keyboard.down('Alt');await page.mouse.move(r.x+r.width+10,r.y-10);await page.mouse.down();await page.mouse.move(r.x+r.width-4,r.y+6,{steps:5});await page.mouse.up();await page.keyboard.up('Alt');
  await expect(node(page)).toHaveClass(/dv-sel/);await expect(page.locator('.dv-sel')).toHaveCount(1);expect(await source(page)).toBe(original);await page.keyboard.press('Escape');await expect(page.locator('.dv-sel')).toHaveCount(0);
 }
 await page.locator('#workspace-fit').click();await marquee(page,true);await page.keyboard.press('Escape');await page.mouse.up();await page.keyboard.up('Alt');await expect(page.locator('.dv-selection-marquee')).toHaveCount(0);await expect(page.locator('.dv-sel')).toHaveCount(0);
 await node(page).click({button:'right'});await expect(menu(page)).toBeVisible();await page.locator('#src').evaluate(el=>{el.value+=' ';el.dispatchEvent(new Event('input',{bubbles:true}));});await expect(menu(page)).toHaveCount(0);await expect(page.locator('.dv-sel')).toHaveCount(0);
});

test('Explore editing chrome follows shared light and dark theme colors',async({page,server},info)=>{
 for(const skin of ['pastel','aurora']){
  await open(page,server,false,skin);await marquee(page);await node(page).click({button:'right'});
  const colors=await node(page).evaluate(el=>{const card=el.querySelector('.card'),probe=document.createElement('span');probe.style.color='var(--accent)';el.closest('.section-viewport').appendChild(probe);const expected=getComputedStyle(probe).color;probe.remove();return {stroke:getComputedStyle(card).stroke,expected};});expect(colors.stroke).toBe(colors.expected);
  const theme=await menu(page).evaluate(el=>{const probe=document.createElement('span');probe.style.background='var(--explore-bg)';el.appendChild(probe);const expected=getComputedStyle(probe).backgroundColor;probe.remove();return {actual:getComputedStyle(el).backgroundColor,expected};});expect(theme.actual).toBe(theme.expected);
  await page.screenshot({path:'/tmp/explore-object-menu-'+skin+'-1280.png'});await info.attach(skin+' context menu',{body:await page.screenshot(),contentType:'image/png'});await page.keyboard.press('Escape');
 }
});

test('Reader and Backstage keep native context menus and have no marquee editing UI',async({page,server})=>{
 for(const host of ['reader','backstage']){
  const raw=fixture();
  if(host==='reader'){
   const input=path.join(server.root,'spatial-reader.json'),output=path.join(server.root,'spatial-reader.html');await writeFile(input,JSON.stringify(raw));execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),output]);await page.goto(server.origin+'/spatial-reader.html');
  }else{
   await writeFile(path.join(server.root,'spatial-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));await writeFile(path.join(server.root,'spatial-native.html'),'<style>body{margin:0}#host{position:fixed;inset:0}</style><div id="host"></div><script type="module">import {mountNativeViewer} from "./spatial-native.js";window.mount=mountNativeViewer;</script>');await page.goto(server.origin+'/spatial-native.html');await page.waitForFunction(()=>!!window.mount);await page.evaluate(raw=>{window.viewer=mount(document.querySelector('#host'),raw);viewer.setCanvas(true);},raw);
  }
  await expect(panel(page)).toBeVisible();await expect(node(page)).not.toHaveAttribute('tabindex','0');await expect(node(page)).not.toHaveAttribute('data-dv-object-menu','');await page.evaluate(()=>document.addEventListener('contextmenu',e=>{window.contextPrevented=e.defaultPrevented;}));await node(page).click({button:'right'});expect(await page.evaluate(()=>window.contextPrevented)).toBe(false);await expect(menu(page)).toHaveCount(0);
  const r=await page.locator('.explore-board').boundingBox();await page.keyboard.down('Alt');await page.mouse.move(r.x+20,r.y+20);await page.mouse.down();await page.mouse.move(r.x+100,r.y+80,{steps:5});await expect(page.locator('.dv-selection-marquee')).toHaveCount(0);await page.mouse.up();await page.keyboard.up('Alt');await expect(page.locator('.dv-sel')).toHaveCount(0);
 }
});

test('plain Explore nodes expose a keyboard entry point and return focus after menu dismissal',async({page,server})=>{
 await open(page,server);const original=await source(page),anchor=node(page);
 await expect(anchor).toHaveAttribute('tabindex','0');await expect(anchor).toHaveAttribute('role','group');await expect(anchor).toHaveAccessibleName('Anchor node');
 await page.locator('#diagram-add').focus();
 let reached=false;
 for(let i=0;i<60;i++){await page.keyboard.press('Tab');if(await anchor.evaluate(el=>el===document.activeElement)){reached=true;break;}}
 expect(reached).toBe(true);await expect(anchor).toBeFocused();
 expect(await anchor.locator('.card').evaluate(el=>getComputedStyle(el).strokeWidth)).toBe('4px');expect(await source(page)).toBe(original);await page.screenshot({path:'/tmp/explore-node-keyboard-focus-1280.png'});
 await page.keyboard.press('Shift+F10');await expect(menu(page)).toBeVisible();await expect(menu(page).getByRole('menuitem',{name:'Inspect',exact:true})).toBeFocused();await expect(anchor).toHaveClass(/dv-sel/);await page.screenshot({path:'/tmp/explore-node-keyboard-menu-1280.png'});
 await page.keyboard.press('ArrowDown');await expect(menu(page).getByRole('menuitem',{name:'Delete',exact:true})).toBeFocused();await page.keyboard.press('Escape');await expect(menu(page)).toHaveCount(0);await expect(anchor).toBeFocused();
 await page.keyboard.press('ContextMenu');await expect(menu(page)).toBeVisible();await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowDown');await expect(menu(page).getByRole('menuitem',{name:'Duplicate',exact:true})).toBeFocused();await page.keyboard.press('Enter');
 await expect(menu(page)).toHaveCount(0);const duplicated=await source(page);expect(Object.keys(JSON.parse(duplicated).page.sections[0].diagram.nodes)).toHaveLength(3);await history(page,original,duplicated);
 await expect(node(page)).toHaveAttribute('tabindex','0');
});

test('Explore keyboard decorations and an open object menu retire across builder remount',async({page,server})=>{
 await page.goto(server.origin+'/lifetime/index.html');await pastePage(page,JSON.stringify(fixture()));await closeTools(page);
 const anchor=node(page);await expect(anchor).toHaveAttribute('tabindex','0');await anchor.focus();await page.keyboard.press('Shift+F10');await expect(menu(page)).toBeVisible();
 await page.evaluate(()=>__editorTest.builder.destroy());await expect(menu(page)).toHaveCount(0);await expect(anchor).not.toHaveAttribute('tabindex','0');await expect(anchor).not.toHaveAttribute('aria-haspopup','menu');await expect(anchor).not.toHaveAttribute('role','group');
 await page.evaluate(()=>__editorTest.remount());await expect(anchor).toHaveAttribute('tabindex','0');await anchor.focus();await page.keyboard.press('Shift+F10');await expect(menu(page)).toHaveCount(1);await page.keyboard.press('Escape');await expect(anchor).toBeFocused();
});
