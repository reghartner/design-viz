import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {repo} from '../helpers/prepare.mjs';
import {test,expect,paste,closeTools,arrangeChapter,panelsOptions} from '../helpers/test.mjs';
/* #474 panel position locks. Contract matrix:
 row | surface | action | assertion | rejects
 1 Explore canvas panel | right-click Lock position | canvas.panels[p].locked true, [data-explore-locked], one Undo | a lock that rewrites geometry
 2 Explore mixed nudge | select node a + locked p, ArrowRight | a moves, p rect unchanged, one Undo | locked member moving or dropping from selection
 3 Explore floating panel | Panels → Lock position of q | panels[q] rect materialized with locked, stacked false | locking without a saved rectangle
 4 Explore locked drag | drag q header | source unchanged, lock feedback | a drag that writes source
 5 Explore Optimize | Optimize layout | p and q rectangles and placement unchanged, one Undo; repeat changes nothing | optimize moving or unlocking panels
 6 Standard tile | Arrange → Lock position of p | tile.locked, badge + class while arranging only, arrow keys stay, Optimize keeps rect | chrome outside Arrange
 7 Reader | exported HTML | no lock chrome or Lock control | editing chrome leaking to readers */
function fixture(){return {page:{title:'Panel locks',skin:'pastel',sections:[{heading:'Locked panels',diagram:{autoplay:false,nodes:{a:{title:'Anchor'},b:{title:'Second'}},rows:[[]],floats:[{id:'a',x:180,y:100},{id:'b',x:500,y:320}],edges:[{from:'a',to:'b'}],panels:[{id:'p',type:'state',title:'Canvas status',states:['Ready'],initial:{state:'Ready'}},{id:'q',type:'state',title:'Floating status',states:['Ready'],initial:{state:'Ready'}}],layouts:[{id:'canvas',name:'Canvas',presentation:'explore',sectionLayout:{default:[{x:0,y:0,w:8,h:12},{panel:'p',x:8,y:0,w:4,h:4},{panel:'q',x:8,y:4,w:4,h:4}]},exploreLayout:{panelPlacement:'canvas',panelPlacements:[{panel:'q',placement:'floating'}],canvas:{panels:[{panel:'p',x:700,y:80,w:240,h:400}]}}}]}}]}};}
const navigation=page=>page.locator('#docview>.explore-navigation');
async function fit(page){await navigation(page).getByRole('button',{name:/^Fit(?: canvas| diagram)?$/,exact:true}).click();}
async function openRaw(page,server,raw){await page.setViewportSize({width:1280,height:800});await page.goto(server.origin+'/standalone.html');await page.evaluate(()=>localStorage.clear());await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(raw));await closeTools(page);await page.evaluate(()=>document.fonts.ready);}
const node=page=>page.locator('[data-dv-node=a]');
const panel=page=>page.locator('[data-explore-panel=p]');
const floating=page=>page.locator('[data-explore-panel=q]');
const menu=page=>page.getByRole('menu',{name:'Object actions'});
async function source(page){return page.locator('#src').inputValue();}
const diagram=text=>JSON.parse(text).page.sections[0].diagram;
const explore=text=>diagram(text).layouts[0].exploreLayout;
const rect=r=>({x:r.x,y:r.y,w:r.w,h:r.h});
async function history(page,before,after){await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(before);await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(after);}

test('Explore canvas and floating panel locks fix their rectangles through nudges, drags and Optimize with one Undo each',async({page,server},info)=>{
 await openRaw(page,server,fixture());await fit(page);await expect(panel(page)).toBeVisible();
 const original=await source(page);
 await panel(page).click({position:{x:4,y:4}});await panel(page).click({button:'right',position:{x:4,y:4}});await expect(menu(page)).toBeVisible();
 await menu(page).getByRole('menuitem',{name:'Lock position',exact:true}).click();
 const locked=await source(page);expect(locked).not.toBe(original);
 expect(explore(locked).canvas.panels[0]).toEqual({panel:'p',x:700,y:80,w:240,h:400,locked:true});
 await expect(panel(page)).toHaveAttribute('data-explore-locked','true');await history(page,original,locked);
 await page.screenshot({path:'/tmp/panel-lock-canvas.png'});await info.attach('locked canvas panel',{body:await page.screenshot(),contentType:'image/png'});
 // Mixed selection moves only the unlocked node; the locked panel stays selected and fixed.
 await node(page).click();await panel(page).click({modifiers:['Shift'],position:{x:4,y:4}});await expect(page.locator('.dv-sel')).toHaveCount(2);await expect(panel(page)).toHaveClass(/dv-sel/);
 await page.keyboard.press('ArrowRight');
 const nudged=await source(page);expect(nudged).not.toBe(locked);
 expect(diagram(nudged).floats.find(f=>f.id==='a').x).toBeCloseTo(190,1);expect(explore(nudged).canvas.panels[0]).toEqual(explore(locked).canvas.panels[0]);
 await expect(page.locator('.dv-sel')).toHaveCount(2);await history(page,locked,nudged);
 await panel(page).click({position:{x:4,y:4}});await panel(page).click({button:'right',position:{x:4,y:4}});await expect(menu(page).getByRole('menuitem',{name:'Unlock position',exact:true})).toBeVisible();await page.keyboard.press('Escape');
 // Panels → Lock position materializes the floating rectangle q is using right now.
 await closeTools(page);const qBefore=await floating(page).boundingBox();
 const panels=await panelsOptions(page);const lock=panels.getByRole('checkbox',{name:'Lock position of Floating status',exact:true});await expect(lock).toBeVisible();await expect(lock).not.toBeChecked();
 await lock.check();
 const floatingLocked=await source(page);expect(floatingLocked).not.toBe(nudged);
 const q=explore(floatingLocked).panels.find(p=>p.panel==='q');expect(q.locked).toBe(true);expect(q.stacked).toBe(false);expect(q.w).toBeGreaterThan(0);expect(q.h).toBeGreaterThan(0);
 await expect(floating(page)).toHaveAttribute('data-explore-locked','true');await expect(lock).toBeChecked();
 const qAfter=await floating(page).boundingBox();expect(Math.abs(qAfter.x-qBefore.x)).toBeLessThan(2);expect(Math.abs(qAfter.y-qBefore.y)).toBeLessThan(2);expect(Math.abs(qAfter.width-qBefore.width)).toBeLessThan(2);
 await history(page,nudged,floatingLocked);
 // A locked floating panel ignores authored drags and arrow keys; the attempt writes nothing.
 await panels.locator('summary').click();
 const grip=floating(page).locator('.explore-window-grip');await expect(grip).toHaveAccessibleName(/position locked/i);
 const g=await grip.boundingBox();await page.mouse.move(g.x+g.width/2,g.y+g.height/2);await page.mouse.down();await page.mouse.move(g.x+g.width/2-120,g.y+g.height/2+90,{steps:8});
 await expect(floating(page)).toHaveAttribute('data-explore-lock-feedback','true');await page.mouse.up();
 await expect(page.locator('#src')).toHaveValue(floatingLocked);const qHeld=await floating(page).boundingBox();expect(Math.abs(qHeld.x-qAfter.x)).toBeLessThan(2);expect(Math.abs(qHeld.y-qAfter.y)).toBeLessThan(2);
 await grip.focus();await page.keyboard.press('ArrowRight');await expect(page.locator('#src')).toHaveValue(floatingLocked);
 // Optimize keeps both locked rectangles and placements and is one Undo; repeating it changes nothing.
 await arrangeChapter(page);await page.getByRole('button',{name:'Optimize layout',exact:true}).click();
 const optimized=await source(page);expect(optimized).not.toBe(floatingLocked);
 expect(rect(explore(optimized).canvas.panels.find(p=>p.panel==='p'))).toEqual({x:700,y:80,w:240,h:400});expect(explore(optimized).canvas.panels.find(p=>p.panel==='p').locked).toBe(true);
 expect(explore(optimized).panelPlacements).toEqual([{panel:'p',placement:'canvas'}]);
 const qOptimized=explore(optimized).panels.find(p=>p.panel==='q');expect(rect(qOptimized)).toEqual(rect(q));expect(qOptimized.locked).toBe(true);expect(qOptimized.stacked).toBe(false);
 await expect(panel(page)).toBeVisible();await expect(floating(page)).toHaveAttribute('data-explore-locked','true');
 await history(page,floatingLocked,optimized);
 await page.getByRole('button',{name:'Optimize layout',exact:true}).click();await expect(page.locator('#src')).toHaveValue(optimized);
 await page.screenshot({path:'/tmp/panel-lock-optimized.png'});await info.attach('optimized around locks',{body:await page.screenshot(),contentType:'image/png'});
 // Unlocking from the menu keeps the rectangle and is one Undo.
 await page.getByRole('button',{name:'Done arranging',exact:true}).click();await closeTools(page);
 const unlockPanels=await panelsOptions(page);await unlockPanels.getByRole('checkbox',{name:'Lock position of Floating status',exact:true}).uncheck();
 const unlocked=await source(page);expect(rect(explore(unlocked).panels.find(p=>p.panel==='q'))).toEqual(rect(q));expect(explore(unlocked).panels.find(p=>p.panel==='q').locked).toBeUndefined();
 await expect(floating(page)).not.toHaveAttribute('data-explore-locked');await history(page,optimized,unlocked);
});

test('Standard tile locks show only while arranging, block gestures and survive Optimize in the active profile',async({page,server},info)=>{
 // Declare the 24-column grid up front so the saved tile keeps these exact numbers.
 const raw=fixture(),d=raw.page.sections[0].diagram;d.layouts[0].presentation='standard';delete d.layouts[0].exploreLayout;d.layouts[0].sectionLayout={columns:24,default:[{x:0,y:0,w:16,h:12},{panel:'p',x:16,y:0,w:8,h:4},{panel:'q',x:16,y:4,w:8,h:4}]};
 await openRaw(page,server,raw);await expect(page.locator('[data-dv-node=a]')).toBeVisible();
 const original=await source(page);
 await arrangeChapter(page);await expect(page.locator('.section-layout-grid')).toBeVisible();
 await page.getByRole('combobox',{name:'Layout element',exact:true}).selectOption('panel:p');
 const lock=page.getByRole('checkbox',{name:'Lock position of Canvas status',exact:true});await expect(lock).not.toBeChecked();await lock.check();
 const locked=await source(page);expect(locked).not.toBe(original);
 const tile=diagram(locked).layouts[0].sectionLayout.default.find(t=>t.panel==='p');expect(tile).toEqual({panel:'p',x:16,y:0,w:8,h:4,locked:true});expect(diagram(locked).layouts[0].sectionLayout.columns).toBe(24);
 const tileEl=page.locator('.section-layout-tile[data-layout-key="panel:p"]');
 await expect(tileEl).toHaveClass(/dv-position-locked/);await expect(tileEl.locator('.dv-position-lock-badge')).toHaveAccessibleName('Position locked');
 await expect(page.getByRole('spinbutton',{name:'Column',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Apply size / position',exact:true})).toBeDisabled();
 await page.screenshot({path:'/tmp/panel-lock-standard.png'});await info.attach('locked Standard tile',{body:await page.screenshot(),contentType:'image/png'});
 await history(page,original,locked);
 // Arrow keys on the locked tile's handles write nothing and announce the lock.
 const move=tileEl.locator('.section-tile-move');await move.focus();await page.keyboard.press('ArrowDown');await expect(page.locator('#src')).toHaveValue(locked);
 await expect(page.locator('.layout-preview-tools [role=status]')).toContainText('Position locked');
 await tileEl.locator('.section-tile-resize').focus();await page.keyboard.press('ArrowRight');await expect(page.locator('#src')).toHaveValue(locked);
 // Unlocked q still moves; it lands below the locked tile instead of displacing it.
 const qMove=page.locator('.section-layout-tile[data-layout-key="panel:q"] .section-tile-move');await qMove.focus();await page.keyboard.press('ArrowUp');
 const moved=await source(page);expect(moved).not.toBe(locked);expect(diagram(moved).layouts[0].sectionLayout.default.find(t=>t.panel==='p')).toEqual(tile);
 await history(page,locked,moved);
 // Optimize keeps the locked tile and arranges the rest; one Undo.
 await page.getByRole('button',{name:'Optimize layout',exact:true}).click();
 const optimized=await source(page);expect(optimized).not.toBe(moved);
 const tiles=diagram(optimized).layouts[0].sectionLayout.default;expect(tiles.find(t=>t.panel==='p')).toEqual(tile);
 const shown=tiles.filter(t=>!t.hidden);for(let i=0;i<shown.length;i++)for(let j=i+1;j<shown.length;j++){const a=shown[i],b=shown[j];expect(a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y).toBe(false);}
 await history(page,moved,optimized);
 // Leaving Arrange removes the cue; the lock itself stays in source.
 await page.getByRole('button',{name:'Done arranging',exact:true}).click();
 await expect(page.locator('.dv-position-locked')).toHaveCount(0);await expect(page.locator('.dv-position-lock-badge')).toHaveCount(0);
 expect(diagram(await source(page)).layouts[0].sectionLayout.default.find(t=>t.panel==='p').locked).toBe(true);
});

test('exported reader shows locked panels in place without lock chrome or lock controls',async({page,server})=>{
 const raw=fixture(),layout=raw.page.sections[0].diagram.layouts[0].exploreLayout;layout.canvas.panels[0].locked=true;layout.panels=[{panel:'q',x:.05,y:.1,w:.25,h:.3,locked:true}];
 const input=path.join(server.root,'panel-locks-reader.json'),output=path.join(server.root,'panel-locks-reader.html');await writeFile(input,JSON.stringify(raw));execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),output]);await page.goto(server.origin+'/panel-locks-reader.html');
 await expect(panel(page)).toBeVisible();await expect(floating(page)).toBeVisible();
 await expect(page.getByRole('checkbox',{name:/Lock position of/})).toHaveCount(0);await expect(page.locator('.dv-position-lock-badge')).toHaveCount(0);
 for(const el of [panel(page),floating(page)]){
  const chrome=await el.evaluate(node=>{const after=getComputedStyle(node,'::after'),before=getComputedStyle(node,'::before');return {outline:getComputedStyle(node).outlineStyle,after:after.content,before:before.content};});
  expect(chrome.outline).toBe('none');expect(chrome.after).toBe('none');expect(chrome.before).toBe('none');
 }
 await expect(floating(page).locator('.explore-window-grip')).toHaveAccessibleName('Move Floating status; use arrow keys');
 const r=await floating(page).boundingBox(),stage=await page.locator('.explore-stage').boundingBox();expect((r.x-stage.x)/stage.width).toBeCloseTo(.05,1);expect((r.y-stage.y)/stage.height).toBeCloseTo(.1,1);
 expect(await readFile(output,'utf8')).not.toMatch(/dv-position-lock/);
});
