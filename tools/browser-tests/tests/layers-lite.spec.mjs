import {readFile} from 'node:fs/promises';
import {test,expect,paste,openAutoArrange,chooseNavigation} from '../helpers/test.mjs';
import {editorSpec} from '../fixtures/editor-spec.mjs';

const source=page=>page.locator('#src').inputValue();
const node=(page,id)=>page.locator('#docview [data-dv-node="'+id+'"]');
const center=async locator=>{const r=await locator.boundingBox();return {x:r.x+r.width/2,y:r.y+r.height/2};};
const graphCenter=locator=>locator.evaluate(el=>{const card=el.querySelector('.card'),b=card.getBBox(),m=el.transform.baseVal.consolidate().matrix;return {x:m.e+b.x+b.width/2,y:m.f+b.y+b.height/2};});

test('Layers syncs selection, row and node lock history, source lifecycle, keyboard, read-only preview, SVG export, and Standard/Explore',async({page,server})=>{
 const raw=editorSpec();raw.page.blocks.push({heading:'Notes only',text:'No diagram in this section.'});
 const original=JSON.stringify(raw,null,2);
 await page.goto(server.origin+'/workbench.html');await paste(page,original);
 await page.locator('#editor-tab-layers').click();
 const win=page.locator('#workspace-window-layers'),rows=win.locator('.layer-row');
 await expect(win).toBeVisible();await expect(rows).toHaveCount(3);
 await expect(rows.locator('.layer-title')).toHaveText(['Doorbell','Backend','Storage']);

 const search=win.locator('#layers-search');await search.focus();await page.keyboard.press('ArrowDown');
 await expect(rows.first().locator('.layer-select')).toBeFocused();
 await rows.filter({hasText:'Backend'}).locator('.layer-select').click();
 await expect(rows.filter({hasText:'Backend'})).toHaveClass(/is-selected/);
 await expect(node(page,'b')).toHaveClass(/dv-sel/);
 await node(page,'c').locator('.t1').click();
 await expect(rows.filter({hasText:'Storage'})).toHaveClass(/is-selected/);

 // A row lock is one source edit and uses the same per-node flags/pins.
 await win.getByRole('button',{name:'Lock all nodes in row 1',exact:true}).click();
 let locked=JSON.parse(await source(page)).page.blocks[0].diagram;
 expect(['a','b','c'].every(id=>locked.nodes[id].locked===true)).toBe(true);
 expect(locked.floats.map(f=>f.id).sort()).toEqual(['a','b','c']);
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);await expect(page.locator('#undo-builder')).toBeDisabled();

 const storage=rows.filter({hasText:'Storage'}),lock=storage.locator('.layer-lock');await lock.click();
 await expect(lock).toHaveAttribute('aria-pressed','true');
 expect(JSON.parse(await source(page)).page.blocks[0].diagram.nodes.c.locked).toBe(true);
 await expect(node(page,'c')).toHaveAttribute('data-dv-position-locked','true');
 await expect(node(page,'c').locator('.dv-position-lock-badge')).toHaveAccessibleName('Position locked');

 // The lock treatment is authoring chrome, not reader preview or exported SVG.
 await page.locator('#workspace-appearance>summary').click();await page.locator('#open-page-preview').click();
 const preview=page.locator('#page-preview-view');await expect(preview.locator('[data-dv-node="c"]')).toBeVisible();
 await expect(preview.locator('.dv-position-lock-badge,.dv-position-locked')).toHaveCount(0);
 await page.locator('#close-page-preview').click();
 const download=page.waitForEvent('download');await page.locator('#workspace-export-trigger').click();await page.locator('#file-export-svg').click();
 const svg=await readFile(await (await download).path(),'utf8');expect(svg).not.toMatch(/dv-position-lock|Position locked|data-dv-position-locked/);
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);
 await expect(storage.locator('.layer-lock')).toHaveAttribute('aria-pressed','false');await expect(page.locator('#undo-builder')).toBeDisabled();

 await search.fill('back');await expect(rows).toHaveCount(1);await expect(rows.first()).toContainText('Backend');await search.fill('');
 const navigation=page.locator('#docview .explore-navigation');
 await navigation.getByRole('button',{name:'Next Page',exact:true}).click();
 await expect(navigation.locator('.reader-page-label')).toHaveText('Page 2 of 2');
 await expect(win.locator('.layers-empty')).toContainText('no diagram');
 await navigation.getByRole('button',{name:'Previous Page',exact:true}).click();
 await expect(navigation.locator('.reader-page-label')).toHaveText('Page 1 of 2');
 await expect(rows).toHaveCount(3);

 await page.locator('#src').evaluate(el=>{const raw=JSON.parse(el.value);delete raw.page.blocks[0].diagram;el.value=JSON.stringify(raw,null,2);el.dispatchEvent(new Event('input',{bubbles:true}));});
 await expect(win.locator('.layers-empty')).toContainText('no diagram');
 await page.locator('#src').evaluate((el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));},original);await expect(rows).toHaveCount(3);

 await page.locator('#src').evaluate(el=>{const raw=JSON.parse(el.value);raw.page.blocks[0].diagram.layouts[0].presentation='explore';el.value=JSON.stringify(raw,null,2);el.dispatchEvent(new Event('input',{bubbles:true}));});
 await expect(rows).toHaveCount(3);await page.locator('#editor-tab-json').click();await page.locator('#go').click();await expect(page.locator('.workspace-active-section .explore-stage')).toBeVisible();
 await expect(win).toBeVisible();await expect(rows).toHaveCount(3);
});

test('mixed Shift/Meta and Alt-marquee selections keep pins fixed during pointer drag, nudge, and Auto arrange',async({page,server},info)=>{
 const raw=editorSpec(),d=raw.page.blocks[0].diagram;
 d.rows=[[]];d.floats=[{id:'a',side:'below',x:180,y:120,noSpread:true},{id:'b',side:'below',x:480,y:150,noSpread:true},{id:'c',side:'below',x:760,y:310,noSpread:true}];d.nodes.b.locked=true;
 const base=structuredClone(d.layouts[0]);d.layouts=[{...base,id:'standard',name:'Standard',presentation:'standard'},{...base,id:'explore',name:'Explore',presentation:'explore'}];d.defaultLayout='standard';
 await page.setViewportSize({width:1440,height:950});await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(raw,null,2));await page.locator('#editor-tab-layers').click();
 const win=page.locator('#workspace-window-layers');await expect(win).toBeVisible();await expect(node(page,'b').locator('.dv-position-lock-badge')).toHaveCount(1);

 await node(page,'a').click();await node(page,'b').click({modifiers:['Shift']});await expect(page.locator('#docview .dv-sel[data-dv-node]')).toHaveCount(2);
 const platformModifier=process.platform==='darwin'?'Meta':'Control';await node(page,'c').click({modifiers:[platformModifier]});await expect(page.locator('#docview .dv-sel[data-dv-node]')).toHaveCount(3);await node(page,'c').click({modifiers:[platformModifier]});await expect(page.locator('#docview .dv-sel[data-dv-node]')).toHaveCount(2);
 await expect(win.locator('.layer-row').filter({hasText:'Backend'})).toHaveClass(/is-selected/);
 await page.screenshot({path:'/tmp/layers-lite-mixed-selection.png'});await info.attach('locked-and-unlocked-mixed-selection',{body:await page.screenshot(),contentType:'image/png'});

 const beforeDrag=await source(page),diagramBefore=JSON.parse(beforeDrag).page.blocks[0].diagram,beforeB=await center(node(page,'b').locator('.card')),box=await node(page,'a').locator('.card').boundingBox();
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+90,box.y+box.height/2+60,{steps:12});await page.mouse.up();
 const dragged=JSON.parse(await source(page)).page.blocks[0].diagram,oldA=diagramBefore.floats.find(f=>f.id==='a'),newA=dragged.floats.find(f=>f.id==='a');
 expect(newA.x).toBeGreaterThan(oldA.x);expect(newA.y).toBeGreaterThan(oldA.y);expect(dragged.floats.find(f=>f.id==='b')).toEqual(diagramBefore.floats.find(f=>f.id==='b'));
 const afterB=await center(node(page,'b').locator('.card'));expect(afterB.x).toBeCloseTo(beforeB.x,1);expect(afterB.y).toBeCloseTo(beforeB.y,1);
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(beforeDrag);await expect(page.locator('#undo-builder')).toBeDisabled();

 await chooseNavigation(page.locator('#docview .explore-navigation'),'View','Explore');await expect(page.locator('.workspace-active-section .explore-stage')).toBeVisible();await page.locator('#docview .explore-navigation').getByRole('button',{name:/^Fit(?: canvas| diagram)?$/,exact:true}).click();
 const bounds=await page.locator('.explore-board').evaluate(el=>{const boxes=[...el.querySelectorAll('[data-dv-node]')].map(n=>n.getBoundingClientRect());const r=el.getBoundingClientRect();return {x:Math.max(r.left+4,Math.min(...boxes.map(b=>b.left))-12),y:Math.max(r.top+4,Math.min(...boxes.map(b=>b.top))-12),right:Math.min(r.right-4,Math.max(...boxes.map(b=>b.right))+12),bottom:Math.min(r.bottom-4,Math.max(...boxes.map(b=>b.bottom))+12)};});
 await page.keyboard.down('Alt');await page.mouse.move(bounds.x,bounds.y);await page.mouse.down();await page.mouse.move(bounds.right,bounds.bottom,{steps:10});await page.mouse.up();await page.keyboard.up('Alt');await expect(page.locator('#docview .dv-sel[data-dv-node]')).toHaveCount(3);
 const beforeNudge=await source(page),nudgeDiagram=JSON.parse(beforeNudge).page.blocks[0].diagram;await node(page,'a').focus();await page.keyboard.press('ArrowRight');
 const nudged=JSON.parse(await source(page)).page.blocks[0].diagram;expect(nudged.floats.find(f=>f.id==='a').x).toBeCloseTo(nudgeDiagram.floats.find(f=>f.id==='a').x+10,3);expect(nudged.floats.find(f=>f.id==='c').x).toBeCloseTo(nudgeDiagram.floats.find(f=>f.id==='c').x+10,3);expect(nudged.floats.find(f=>f.id==='b')).toEqual(nudgeDiagram.floats.find(f=>f.id==='b'));
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(beforeNudge);await expect(page.locator('#undo-builder')).toBeDisabled();await page.keyboard.press('Escape');

 const pinBefore=await graphCenter(node(page,'b')),beforeArrange=await source(page);await openAutoArrange(page);await page.locator('[data-arrange-confirm]').click();await expect(page.locator('#auto-arrange-dialog')).not.toBeVisible({timeout:25000});
 const arranged=JSON.parse(await source(page)).page.blocks[0].diagram;expect(arranged.floats.find(f=>f.id==='b').x).toBe(480);expect(arranged.floats.find(f=>f.id==='b').y).toBe(150);const pinAfter=await graphCenter(node(page,'b'));expect(pinAfter.x).toBeCloseTo(pinBefore.x,3);expect(pinAfter.y).toBeCloseTo(pinBefore.y,3);
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(beforeArrange);await expect(page.locator('#undo-builder')).toBeDisabled();
});
