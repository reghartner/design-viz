import {readFile} from 'node:fs/promises';
import {test,expect,paste,openAutoArrange,chooseNavigation} from '../helpers/test.mjs';
import {editorSpec} from '../fixtures/editor-spec.mjs';

const source=page=>page.locator('#src').inputValue();
const node=(page,id)=>page.locator('#docview [data-dv-node="'+id+'"]');
const center=async locator=>{const r=await locator.boundingBox();return {x:r.x+r.width/2,y:r.y+r.height/2};};
const graphCenter=locator=>locator.evaluate(el=>{const card=el.querySelector('.card'),b=card.getBBox(),m=el.transform.baseVal.consolidate().matrix;return {x:m.e+b.x+b.width/2,y:m.f+b.y+b.height/2};});

// The Layers tab was removed in #611; locks are set from the node's object menu (and Inspect).
test('object-menu position lock writes one undoable edit and stays out of reader preview and SVG export',async({page,server})=>{
 const original=JSON.stringify(editorSpec(),null,2);
 await page.setViewportSize({width:1440,height:900});await page.goto(server.origin+'/workbench.html');await paste(page,original);
 await expect(node(page,'c')).not.toHaveAttribute('data-dv-position-locked','true');await expect(node(page,'c').locator('.dv-position-lock-badge')).toHaveCount(0);
 await node(page,'c').locator('.t1').click({button:'right'});
 await page.getByRole('menu',{name:'Object actions'}).getByRole('menuitem',{name:'Lock position',exact:true}).click();
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
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);await expect(page.locator('#undo-builder')).toBeDisabled();
 await expect(node(page,'c')).not.toHaveAttribute('data-dv-position-locked','true');
});

test('mixed Shift/Meta and Alt-marquee selections keep pins fixed during pointer drag, nudge, and Auto arrange',async({page,server},info)=>{
 const raw=editorSpec(),d=raw.page.blocks[0].diagram;
 d.rows=[[]];d.floats=[{id:'a',side:'below',x:180,y:120,noSpread:true},{id:'b',side:'below',x:480,y:150,noSpread:true},{id:'c',side:'below',x:760,y:310,noSpread:true}];d.nodes.b.locked=true;
 const base=structuredClone(d.layouts[0]);d.layouts=[{...base,id:'standard',name:'Standard',presentation:'standard'},{...base,id:'explore',name:'Explore',presentation:'explore'}];d.defaultLayout='standard';
 await page.setViewportSize({width:1440,height:950});await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(raw,null,2));
 await expect(node(page,'b').locator('.dv-position-lock-badge')).toHaveCount(1);

 await node(page,'a').click();await node(page,'b').click({modifiers:['Shift']});await expect(page.locator('#docview .dv-sel[data-dv-node]')).toHaveCount(2);
 const platformModifier=process.platform==='darwin'?'Meta':'Control';await node(page,'c').click({modifiers:[platformModifier]});await expect(page.locator('#docview .dv-sel[data-dv-node]')).toHaveCount(3);await node(page,'c').click({modifiers:[platformModifier]});await expect(page.locator('#docview .dv-sel[data-dv-node]')).toHaveCount(2);
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

/* #628 File import keeps locked nodes in place when the file is the same
 document (same diagram ID, or same title when neither has an ID); a
 different document is imported exactly as written.
 row | fixture | assertion (scoped) | rejects
 same document | paste "Browser contract" with b locked; import the same title with z added before a (moves b when unlocked) | b's rendered graph center unchanged, b still locked, z rendered, source differs from the file only by b's pin; one Undo restores the pasted source | an import that skips the guard
 different document | same file retitled "Other story" | source equals the file byte-for-byte and b's center moved | a guard that pins across documents by node id */
test('importing the same document keeps a locked node in place; a different document imports exactly',async({page,server})=>{
 const raw=editorSpec();raw.page.blocks[0].diagram.nodes.b.locked=true;const original=JSON.stringify(raw,null,2);
 const file=title=>{const next=structuredClone(raw),d=next.page.blocks[0].diagram;next.page.title=title;d.nodes.z={title:'Zulu'};d.rows[0].unshift('z');return JSON.stringify(next,null,2);};
 const importFile=async text=>{
  await page.locator('#editor-tab-file').click();await page.locator('#file-import-input').setInputFiles({name:'story.spec.json',mimeType:'application/json',buffer:Buffer.from(text)});
  const preview=page.locator('.file-import-dialog:visible');await expect(preview).toContainText('story.spec.json · Flowview JSON');
  await preview.getByRole('button',{name:'Import'}).click();await expect(preview).toBeHidden();await expect(node(page,'z')).toBeVisible();
 };
 await page.setViewportSize({width:1440,height:900});await page.goto(server.origin+'/workbench.html');await paste(page,original);
 await expect(node(page,'b')).toHaveAttribute('data-dv-position-locked','true');const start=await graphCenter(node(page,'b'));

 const same=file('Browser contract');await importFile(same);
 // Rendered SVG boxes carry float noise, so centers compare within half a graph unit.
 const imported=JSON.parse(await source(page)),pins=imported.page.blocks[0].diagram.floats||[];
 expect(pins).toHaveLength(1);expect(pins[0]).toMatchObject({id:'b',side:'below',noSpread:true});
 expect(Math.abs(pins[0].x-start.x)).toBeLessThan(0.5);expect(Math.abs(pins[0].y-start.y)).toBeLessThan(0.5);
 const expected=JSON.parse(same);expected.page.blocks[0].diagram.rows[0]=['z','a','c'];delete imported.page.blocks[0].diagram.floats;
 expect(imported).toEqual(expected);
 await expect.poll(async()=>{const now=await graphCenter(node(page,'b'));return Math.abs(now.x-start.x)<0.5 && Math.abs(now.y-start.y)<0.5;}).toBe(true);
 await expect(node(page,'b')).toHaveAttribute('data-dv-position-locked','true');
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);await expect(node(page,'z')).toHaveCount(0);

 const other=file('Other story');await importFile(other);
 await expect(page.locator('#src')).toHaveValue(other);const moved=await graphCenter(node(page,'b'));expect(Math.abs(moved.x-start.x)+Math.abs(moved.y-start.y)).toBeGreaterThan(50);
});
