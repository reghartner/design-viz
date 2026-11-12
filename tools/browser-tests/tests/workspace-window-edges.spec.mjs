import {test,expect,paste,closeTools} from '../helpers/test.mjs';
import {editorSpec} from '../fixtures/editor-spec.mjs';

/* #1376 part 1 (Chuck, 2026-11-12): Workbench tool windows resize from all four
   corners and all four edges, like desktop windows. Docked, the free left edge
   resizes the docked width (pointer and Left/Right arrows) and the canvas
   follows. Desktop only. Real pointer input: each drag starts just inside the
   window's dragged sides, and the landed rect must equal start + pointer delta
   on the dragged sides with the opposite sides unchanged. */

const CURSORS={n:'ns-resize',s:'ns-resize',e:'ew-resize',w:'ew-resize',ne:'nesw-resize',sw:'nesw-resize',nw:'nwse-resize',se:'nwse-resize'};
async function box(locator){return locator.evaluate(el=>{const r=el.getBoundingClientRect();return [r.x,r.y,r.width,r.height].map(Math.round);});}
function near(got,want){return got.every((v,i)=>Math.abs(v-want[i])<=1);}
// Edges are pressed 3px inside; corners 6px inside on both axes, because the
// window's 12px rounded corner clips the outermost pixels of a corner handle.
function pointFor(r,edge){
  const inset=edge.length===2?6:3;
  return [edge.includes('w')?r[0]+inset:edge.includes('e')?r[0]+r[2]-inset:r[0]+r[2]/2,edge.includes('n')?r[1]+inset:edge.includes('s')?r[1]+r[3]-inset:r[1]+r[3]/2];
}
async function pointerDrag(page,[x,y],dx,dy){await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx,y+dy,{steps:6});await page.mouse.up();}
async function cursorAt(page,[x,y]){return page.evaluate(([x,y])=>{const hit=document.elementFromPoint(x,y);return hit?getComputedStyle(hit).cursor:'none';},[x,y]);}
async function open(page,server){
  await page.setViewportSize({width:1600,height:1000});
  const raw=editorSpec();raw.page.blocks[0].diagram.layouts.forEach(view=>view.presentation='explore');
  await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(raw,null,2));await closeTools(page);
}

test('a floating tool window resizes from every corner and edge and keeps the size on reload',async({page,server})=>{
  await open(page,server);await page.locator('#editor-tab-json').click();const win=page.locator('#workspace-window-json');
  // Start at the minimum size near the middle so every outward drag has room.
  await win.locator('.workspace-window-resize').focus();
  for(let i=0;i<12;i++){await page.keyboard.press('Shift+ArrowUp');await page.keyboard.press('Shift+ArrowLeft');}
  let r=await box(win);await win.locator('.workspace-window-grip').focus();
  for(let i=0;i<Math.round((800-(r[0]+r[2]/2))/50);i++)await page.keyboard.press('Shift+ArrowRight');
  for(let i=0;i<Math.round((r[0]+r[2]/2-800)/50);i++)await page.keyboard.press('Shift+ArrowLeft');
  for(let i=0;i<Math.round((500-(r[1]+r[3]/2))/50);i++)await page.keyboard.press('Shift+ArrowDown');
  r=await box(win);expect(r[0]).toBeGreaterThan(400);expect(r[1]).toBeGreaterThan(250);expect(r[0]+r[2]).toBeLessThan(1200);expect(r[1]+r[3]).toBeLessThan(750);
  for(const edge of ['nw','n','ne','e','se','s','sw','w']){
    const start=await box(win),dx=edge.includes('w')?-40:edge.includes('e')?40:0,dy=edge.includes('n')?-30:edge.includes('s')?30:0;
    await pointerDrag(page,pointFor(start,edge),dx,dy);
    const want=[start[0]+(edge.includes('w')?dx:0),start[1]+(edge.includes('n')?dy:0),start[2]+(edge.includes('w')?-dx:edge.includes('e')?dx:0),start[3]+(edge.includes('n')?-dy:edge.includes('s')?dy:0)];
    const got=await box(win);expect(near(got,want),`${edge}: expected ${want}, got ${got}`).toBe(true);
    // Hovering the same place shows that side's resize cursor.
    expect(await cursorAt(page,pointFor(got,edge)),edge).toBe(CURSORS[edge]);
  }
  const resized=await box(win);
  await expect(page.locator('#undo-builder')).toBeDisabled();
  await page.reload();await page.locator('#editor-tab-json').click();await expect.poll(()=>box(win)).toEqual(resized);
});

test('docked Inspect resizes from its left edge by pointer and keyboard; the canvas follows and the width returns on reload',async({page,server})=>{
  await open(page,server);await page.locator('#editor-tab-inspect').click();const inspect=page.locator('#workspace-window-inspect');
  const floating=await box(inspect);
  await inspect.getByRole('button',{name:'Dock Inspect panel',exact:true}).click();
  const canvas=page.locator('.workbench-diagram-canvas'),dockVar=()=>page.evaluate(()=>parseFloat(getComputedStyle(document.body).getPropertyValue('--workspace-dock-width')));
  const before=await box(inspect),canvasBefore=await box(canvas),reserveBefore=await dockVar();
  const point=[before[0]+3,before[1]+before[3]/2];
  expect(await cursorAt(page,point)).toBe('ew-resize');
  await pointerDrag(page,point,-120,0);
  const after=await box(inspect);expect(near(after,[before[0]-120,before[1],before[2]+120,before[3]]),`docked: ${after}`).toBe(true);
  await expect.poll(async()=>Math.round(await dockVar())).toBe(Math.round(reserveBefore+120));
  await expect.poll(async()=>Math.abs((await box(canvas))[2]-(canvasBefore[2]-120))<=1).toBe(true);
  const splitter=inspect.getByRole('separator',{name:'Resize docked Inspect panel width',exact:true});
  await splitter.focus();await page.keyboard.press('ArrowLeft');await expect.poll(async()=>(await box(inspect))[2]).toBe(after[2]+10);
  await page.keyboard.press('Shift+ArrowRight');await expect.poll(async()=>(await box(inspect))[2]).toBe(after[2]-40);
  const kept=await box(inspect);
  await page.reload();await page.locator('#editor-tab-inspect').click();await expect.poll(()=>box(inspect)).toEqual(kept);
  // Float restores the floating size; the docked width is its own preference.
  await inspect.getByRole('button',{name:'Float Inspect panel',exact:true}).click();
  await expect.poll(async()=>(await box(inspect)).slice(2)).toEqual(floating.slice(2));
});

test('resize strips leave the pane scrollbar, the grip and the close button usable',async({page,server})=>{
  await open(page,server);await page.locator('[data-dv-node=a]').first().click();await page.locator('#editor-tab-inspect').click();
  const win=page.locator('#workspace-window-inspect'),pane=win.locator('.editor-pane');
  await win.locator('.workspace-window-resize').focus();for(let i=0;i<12;i++)await page.keyboard.press('Shift+ArrowUp');
  // The right strip sits beside the pane, so it covers none of its scrollbar.
  const strip=await box(win.locator('.workspace-window-edge[data-edge="e"]')),paneBox=await box(pane);
  expect(strip[0]).toBeGreaterThanOrEqual(paneBox[0]+paneBox[2]);
  // Corner squares leave the grip and the close button reachable up to their
  // edges: edge midpoints 1px in and corners 3px in (inside a 6px radius).
  for(const control of ['.workspace-window-grip','.workspace-window-close']){
    const missed=await win.locator(control).evaluate(el=>{
      const r=el.getBoundingClientRect(),cx=(r.left+r.right)/2,cy=(r.top+r.bottom)/2;
      const points=[[r.left+3,r.top+3],[r.right-3,r.top+3],[r.left+3,r.bottom-3],[r.right-3,r.bottom-3],[cx,r.top+1],[cx,r.bottom-1],[r.left+1,cy],[r.right-1,cy]];
      return points.map(([x,y])=>{const hit=document.elementFromPoint(x,y);return hit===el || el.contains(hit)?null:[Math.round(x-r.left),Math.round(y-r.top),hit && (hit.className || hit.tagName)];}).filter(Boolean);
    });
    expect(missed,control).toEqual([]);
  }
  // With a classic scrollbar, dragging its thumb scrolls the pane and never resizes the window.
  const bar=await pane.evaluate(el=>({width:el.offsetWidth-el.clientWidth,overflow:el.scrollHeight-el.clientHeight}));
  expect(bar.overflow).toBeGreaterThan(40);
  if(bar.width>0){
    const before=await box(win),x=paneBox[0]+paneBox[2]-bar.width/2,y=paneBox[1]+bar.width+6;
    await pointerDrag(page,[x,y],0,40);
    expect(await pane.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);expect(await box(win)).toEqual(before);
  }
});
