import {arrangeChapter} from '../helpers/test.mjs';
import {test,expect,paste,prepareEditorSurface} from '../helpers/test.mjs';
import {editorSpec} from '../fixtures/editor-spec.mjs';

/* #1376 part 3 (Chuck, 2026-11-12): in Arrange, every corner and edge of a
   Standard tile resizes it in whole grid cells; the opposite sides stay put.
   Attached step controls also get a top edge that moves the line between the
   visualization and the controls. Desktop Workbench, real pointer input. */

// A 24-column grid: diagram and attached step controls in columns 0-15, rows
// 0-15; the home tile at columns 8-13, rows 24-31, with free cells around it.
function fixture(){
  const raw=editorSpec(),layout=raw.page.blocks[0].diagram.layouts[0].sectionLayout;
  layout.columns=24;layout.default=[{x:0,y:0,w:16,h:16},{panel:'home',x:8,y:24,w:6,h:8},{controls:'steps',attachTo:'diagram',x:0,y:12,w:16,h:4}];
  return raw;
}
const CURSORS={n:'ns-resize',s:'ns-resize',e:'ew-resize',w:'ew-resize',ne:'nesw-resize',sw:'nesw-resize',nw:'nwse-resize',se:'nwse-resize'};
const items=text=>JSON.parse(text).page.blocks[0].diagram.layouts[0].sectionLayout.default;
const cells=it=>it && [it.x,it.y,it.w,it.h];
const homeItem=text=>cells(items(text).find(it=>it.panel==='home'));
const others=text=>items(text).filter(it=>it.panel!=='home').map(it=>[it.panel || it.controls || 'diagram',...cells(it)]);
const tileVars=tile=>tile.evaluate(el=>['--tile-x','--tile-y','--tile-w','--tile-h'].map(k=>Number(el.style.getPropertyValue(k))));
async function open(page,server,raw){
  await page.setViewportSize({width:1500,height:900});
  await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(raw));await prepareEditorSurface(page);
  await arrangeChapter(page);await page.evaluate(()=>document.fonts.ready);
  await page.getByRole('button',{name:'Hide arrangement controls',exact:true}).click();
}
async function grid(tile){return tile.evaluate(el=>{const g=el.closest('.section-layout-grid'),r=g.getBoundingClientRect(),scale=g.offsetWidth?r.width/g.offsetWidth:1;return {cell:(g.clientWidth+8)*scale/24,row:40*scale};});}
// Strips straddle the grid gap; tile content sits above their inner half, so
// they are pressed 2px outside the tile. The bottom-right is the resize button
// inside the tile.
function pointFor(r,edge){
  if(edge==='se')return [r.x+r.width-12,r.y+r.height-12];
  const inset=-2;
  return [edge.includes('w')?r.x+inset:edge.includes('e')?r.x+r.width-inset:r.x+r.width/2,edge.includes('n')?r.y+inset:edge.includes('s')?r.y+r.height-inset:r.y+r.height/2];
}
// The element under a press point: '<edge>|<tile key>' for a strip, else what it is.
function stripAt(page,[x,y]){return page.evaluate(([x,y])=>{const hit=document.elementFromPoint(x,y),tile=hit && hit.closest('[data-layout-key]');return hit && (hit.getAttribute('data-edge') || (hit.classList.contains('section-tile-resize')?'se':''))?(hit.getAttribute('data-edge') || 'se')+'|'+(tile && tile.getAttribute('data-layout-key')):'other '+(hit && String(hit.className || hit.tagName));},[x,y]);}
async function pointerDrag(page,[x,y],dx,dy){await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx,y+dy,{steps:8});await page.mouse.up();}

test('a Standard tile resizes from every corner and edge in whole cells, one Undo each, and the saved grid renders',async({page,server,context})=>{
  await open(page,server,fixture());
  const tile=page.locator('[data-layout-key="panel:home"]'),src=page.locator('#src');
  await tile.scrollIntoViewIfNeeded();const {cell,row}=await grid(tile);
  let item={x:8,y:24,w:6,h:8},previous=null;
  for(const edge of ['nw','n','ne','e','se','s','sw','w']){
    const dx=edge.includes('w')?-1:edge.includes('e')?1:0,dy=edge.includes('n')?-1:edge.includes('s')?1:0,before=await src.inputValue();
    await tile.scrollIntoViewIfNeeded();const r=await tile.boundingBox();
    expect(await stripAt(page,pointFor(r,edge)),`${edge} press reaches the strip`).toBe(edge+'|panel:home');
    await pointerDrag(page,pointFor(r,edge),dx*cell,dy*row);
    const want={x:item.x+(edge.includes('w')?dx:0),y:item.y+(edge.includes('n')?dy:0),w:item.w+(edge.includes('w')?-dx:edge.includes('e')?dx:0),h:item.h+(edge.includes('n')?-dy:edge.includes('s')?dy:0)};
    await expect.poll(async()=>homeItem(await src.inputValue()),{message:edge}).toEqual(cells(want));
    await expect.poll(()=>tileVars(tile),{message:edge}).toEqual([want.x+1,want.y+1,want.w,want.h]);
    // The other tiles keep their cells.
    expect(others(await src.inputValue())).toEqual(others(before));
    const now=await tile.boundingBox();expect(await page.evaluate(([x,y])=>getComputedStyle(document.elementFromPoint(x,y)).cursor,pointFor(now,edge)),edge).toBe(CURSORS[edge]);
    previous=item;item=want;
  }
  expect(item).toEqual({x:5,y:21,w:12,h:14});
  await page.locator('#undo-builder').click();await expect.poll(async()=>homeItem(await src.inputValue())).toEqual(cells(previous));
  await page.locator('#redo-builder').click();await expect.poll(async()=>homeItem(await src.inputValue())).toEqual(cells(item));
  // The saved source renders the tile at its saved cells outside Arrange.
  const fresh=await context.newPage();await fresh.setViewportSize({width:1500,height:900});
  await fresh.goto(server.origin+'/workbench.html');await paste(fresh,await src.inputValue());await prepareEditorSurface(fresh);
  await expect.poll(()=>tileVars(fresh.locator('[data-layout-key="panel:home"]'))).toEqual([6,22,12,14]);await fresh.close();
});

test('attached step controls move their top line in whole rows; the tile outline stays put',async({page,server})=>{
  await open(page,server,fixture());
  const tile=page.locator('[data-layout-key="diagram"]'),bar=tile.locator('.termbar'),src=page.locator('#src');
  await bar.scrollIntoViewIfNeeded();const {row}=await grid(tile),r=await bar.boundingBox(),before=await src.inputValue();
  await pointerDrag(page,[r.x+r.width/2,r.y+1],0,-2*row);
  await expect.poll(async()=>items(await src.inputValue()).find(it=>it.controls==='steps').h).toBe(6);
  const saved=items(await src.inputValue());
  expect(cells(saved.find(it=>!it.panel && !it.controls))).toEqual(cells(items(before).find(it=>!it.panel && !it.controls)));
  expect(cells(saved.find(it=>it.panel==='home'))).toEqual(cells(items(before).find(it=>it.panel==='home')));
  await page.locator('#undo-builder').click();await expect(src).toHaveValue(before);
});

// #1375 + #1376: a strip press with an uncommitted Inspector edit saves the
// edit and lands the resize in the same gesture; Undo removes the resize, then the edit.
test('the first tile-strip resize after an uncommitted Inspector edit saves the edit and lands the resize',async({page,server})=>{
  await open(page,server,fixture());const src=page.locator('#src'),before=await src.inputValue();
  await page.locator('#editor-tab-outline').click();await page.locator('#outline-search').fill('Doorbell');
  await page.locator('.outline-item').filter({hasText:'Doorbell'}).click();await page.locator('#outline-inspect').click();
  const outline=page.locator('#workspace-window-outline .workspace-window-close');if(await outline.isVisible())await outline.press('Enter');
  const title=page.locator('#guide').getByLabel('Name',{exact:true}),tile=page.locator('[data-layout-key="panel:home"]');
  await expect(title).toHaveValue('Doorbell');
  const grip=page.locator('#workspace-window-inspect .workspace-window-grip');await grip.focus();for(let i=0;i<20;i++)await grip.press('Shift+ArrowLeft');
  await title.fill('Pending before the strip');
  await tile.scrollIntoViewIfNeeded();const {cell,row}=await grid(tile),r=await tile.boundingBox(),point=pointFor(r,'nw');
  // The press must reach the strip itself, not a tool window over it.
  expect(await stripAt(page,point)).toBe('nw|panel:home');
  await pointerDrag(page,point,-cell,-row);
  await expect(src).toHaveValue(/Pending before the strip/);
  await expect.poll(async()=>homeItem(await src.inputValue())).toEqual([7,23,7,9]);
  await page.locator('#undo-builder').click();await expect(src).toHaveValue(/Pending before the strip/);
  expect(homeItem(await src.inputValue())).toEqual([8,24,6,8]);
  await page.locator('#undo-builder').click();await expect(src).not.toHaveValue(/Pending before the strip/);
  expect(homeItem(await src.inputValue())).toEqual(homeItem(before));
});

test('boundary tiles resize from their outer edges and adjacent tiles each own their half of the gap',async({page,server})=>{
  const raw=fixture(),d=raw.page.blocks[0].diagram;
  d.panels.push({id:'below',type:'state',title:'Below panel',states:['Ready'],initial:{state:'Ready'}});
  d.layouts[0].sectionLayout.default.push({panel:'below',x:14,y:24,w:4,h:8});
  await open(page,server,raw);const src=page.locator('#src');
  // Adjacent tiles: 2px either side of the shared gap's middle reaches each tile's own strip.
  const home=page.locator('[data-layout-key="panel:home"]'),below=page.locator('[data-layout-key="panel:below"]');
  await home.scrollIntoViewIfNeeded();const h=await home.boundingBox(),b=await below.boundingBox(),mid=(h.x+h.width+b.x)/2,y=h.y+h.height/2;
  expect(b.x-(h.x+h.width)).toBeGreaterThan(5);
  expect(await stripAt(page,[mid-2,y])).toBe('e|panel:home');expect(await stripAt(page,[mid+2,y])).toBe('w|panel:below');
  // The diagram tile sits on the grid's left and top boundary: its w, n and nw
  // strips take its own outer 4px. Drag them inward by one cell or row.
  const diagram=page.locator('[data-layout-key="diagram"]');await diagram.scrollIntoViewIfNeeded();
  const {cell,row}=await grid(diagram);
  const cellsOf=async()=>{const it=items(await src.inputValue()).find(it=>!it.panel && !it.controls);return [it.x,it.y,it.w,it.h];};
  let r=await diagram.boundingBox(),point=[r.x+2,r.y+r.height/2];
  expect(await stripAt(page,point)).toBe('w|diagram');await pointerDrag(page,point,cell,0);
  await expect.poll(cellsOf).toEqual([1,0,15,16]);
  r=await diagram.boundingBox();point=[r.x+r.width/2,r.y+2];
  expect(await stripAt(page,point)).toBe('n|diagram');await pointerDrag(page,point,0,row);
  await expect.poll(cellsOf).toEqual([1,1,15,15]);
  r=await diagram.boundingBox();point=[r.x+2,r.y+2];
  // Off the boundary now, so the nw corner is pressed outside the tile again.
  expect(await stripAt(page,[r.x-2,r.y-2])).toBe('nw|diagram');await pointerDrag(page,[r.x-2,r.y-2],-cell,-row);
  await expect.poll(cellsOf).toEqual([0,0,16,16]);
});
