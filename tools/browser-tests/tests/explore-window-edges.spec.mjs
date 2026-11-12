import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {test,expect,paste,closeTools} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
import {editorSpec} from '../fixtures/editor-spec.mjs';

/* #1376 part 2 (Chuck, 2026-11-12): Explore windows resize from all four
   corners and all four edges; the opposite sides stay put. Ordinary panel
   windows stay inside the stage. Canvas-object windows show their handles only
   while selected. Width-locked canvas windows change width from every handle
   and their height follows; they show no top/bottom edge handles. Desktop
   Workbench, real pointer input: each drag starts just inside the dragged
   sides, and the landed rect must equal start + pointer delta. */

const CURSORS={n:'ns-resize',s:'ns-resize',e:'ew-resize',w:'ew-resize',ne:'nesw-resize',sw:'nesw-resize',nw:'nwse-resize',se:'nwse-resize'};
const SIDES=['nw','n','ne','e','se','s','sw','w'];
async function box(locator){return locator.evaluate(el=>{const r=el.getBoundingClientRect();return [r.x,r.y,r.width,r.height].map(Math.round);});}
function near(got,want,tolerance=1){return got.every((v,i)=>Math.abs(v-want[i])<=tolerance);}
// Edges are pressed 3px inside; corners 6px inside, clear of the 12px rounded corner clip.
function pointFor(r,edge){
  const inset=edge.length===2?6:3;
  return [edge.includes('w')?r[0]+inset:edge.includes('e')?r[0]+r[2]-inset:r[0]+r[2]/2,edge.includes('n')?r[1]+inset:edge.includes('s')?r[1]+r[3]-inset:r[1]+r[3]/2];
}
function outward(edge){return [edge.includes('w')?-40:edge.includes('e')?40:0,edge.includes('n')?-30:edge.includes('s')?30:0];}
function landed(r,edge,dx,dy){return [r[0]+(edge.includes('w')?dx:0),r[1]+(edge.includes('n')?dy:0),r[2]+(edge.includes('w')?-dx:edge.includes('e')?dx:0),r[3]+(edge.includes('n')?-dy:edge.includes('s')?dy:0)];}
async function pointerDrag(page,[x,y],dx,dy){await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx,y+dy,{steps:6});await page.mouse.up();}
async function cursorAt(page,[x,y]){return page.evaluate(([x,y])=>{const hit=document.elementFromPoint(x,y);return hit?getComputedStyle(hit).cursor:'none';},[x,y]);}
async function shown(locator,edge){return locator.locator(`.explore-window-edge[data-edge="${edge}"]`).evaluate(el=>getComputedStyle(el).display!=='none' && getComputedStyle(el).visibility!=='hidden');}

function floatingSpec(){const raw=editorSpec();raw.page.blocks[0].diagram.layouts.forEach(view=>view.presentation='explore');return JSON.stringify(raw,null,2);}

test('an Explore panel window and the step controls resize from every corner and edge, one Undo each, and reopen at the saved size',async({page,server,context})=>{
  await page.setViewportSize({width:1600,height:1000});
  await page.goto(server.origin+'/workbench.html');await paste(page,floatingSpec());await closeTools(page);
  const panel=page.locator('[data-explore-panel=home]');
  // Unstack the panel and bring it toward the middle so every outward drag has room.
  await panel.locator('.explore-window-grip').focus();for(let i=0;i<20;i++)await page.keyboard.press('Shift+ArrowLeft');
  for(let i=0;i<8;i++)await page.keyboard.press('Shift+ArrowDown');
  await closeTools(page);
  let previous=null;
  for(const edge of SIDES){
    const start=await box(panel),[dx,dy]=outward(edge),before=await page.locator('#src').inputValue();
    await pointerDrag(page,pointFor(start,edge),dx,dy);
    const want=landed(start,edge,dx,dy),got=await box(panel);
    expect(near(got,want),`${edge}: expected ${want}, got ${got}`).toBe(true);
    expect(await page.locator('#src').inputValue(),`${edge} saves the layout`).not.toBe(before);
    expect(await cursorAt(page,pointFor(got,edge)),edge).toBe(CURSORS[edge]);
    await closeTools(page);previous=[start,got];
  }
  // Each drag is one Undo step.
  await page.locator('#undo-builder').click();await expect.poll(async()=>near(await box(panel),previous[0])).toBe(true);
  await page.locator('#redo-builder').click();await expect.poll(async()=>near(await box(panel),previous[1])).toBe(true);
  const saved=await page.locator('#src').inputValue(),final=await box(panel);
  // The step controls get the full set too.
  const player=page.locator('.explore-player'),playerStart=await box(player);
  for(const edge of ['n','e','w','nw','ne','sw'])expect(await shown(player,edge),`player ${edge}`).toBe(true);
  await pointerDrag(page,pointFor(playerStart,'n'),0,-30);
  const playerWant=landed(playerStart,'n',0,-30),playerGot=await box(player);
  expect(near(playerGot,playerWant),`player n: expected ${playerWant}, got ${playerGot}`).toBe(true);
  // A fresh Workbench opening the saved source shows the panel at the saved size.
  const fresh=await context.newPage();await fresh.setViewportSize({width:1600,height:1000});
  await fresh.goto(server.origin+'/workbench.html');await paste(fresh,saved);await closeTools(fresh);
  await expect.poll(async()=>near(await box(fresh.locator('[data-explore-panel=home]')),final)).toBe(true);await fresh.close();
});

test('resize strips of a floating Explore window leave the body scrollbar, the grip and Hide usable',async({page,server})=>{
  await page.setViewportSize({width:1600,height:1000});
  await page.goto(server.origin+'/workbench.html');await paste(page,floatingSpec());await closeTools(page);
  const panel=page.locator('[data-explore-panel=home]'),body=panel.locator('.explore-window-body');
  // Make the body scroll: shrink the window from its bottom-right button.
  await panel.locator('.explore-window-resize').focus();for(let i=0;i<10;i++)await page.keyboard.press('Shift+ArrowUp');
  await closeTools(page);
  // Corner squares leave the grip and Hide reachable up to their edges: edge
  // midpoints 1px in and corners 3px in (inside Hide's 6px radius).
  for(const control of ['.explore-window-grip','.explore-window-hide']){
    const missed=await panel.locator(control).evaluate(el=>{
      const r=el.getBoundingClientRect(),cx=(r.left+r.right)/2,cy=(r.top+r.bottom)/2;
      const points=[[r.left+3,r.top+3],[r.right-3,r.top+3],[r.left+3,r.bottom-3],[r.right-3,r.bottom-3],[cx,r.top+1],[cx,r.bottom-1],[r.left+1,cy],[r.right-1,cy]];
      return points.map(([x,y])=>{const hit=document.elementFromPoint(x,y);return hit===el || el.contains(hit)?null:[Math.round(x-r.left),Math.round(y-r.top),hit && (hit.className || hit.tagName)];}).filter(Boolean);
    });
    expect(missed,control).toEqual([]);
  }
  const strip=await box(panel.locator('.explore-window-edge[data-edge="e"]')),bodyBox=await box(body);
  expect(strip[0]).toBeGreaterThanOrEqual(bodyBox[0]+bodyBox[2]-1);
  const bar=await body.evaluate(el=>({width:el.offsetWidth-el.clientWidth,overflow:el.scrollHeight-el.clientHeight}));
  if(bar.width>0 && bar.overflow>20){
    const before=await box(panel),scale=bodyBox[2]/(await body.evaluate(el=>el.offsetWidth));
    await pointerDrag(page,[bodyBox[0]+bodyBox[2]-bar.width*scale/2,bodyBox[1]+bar.width*scale+4],0,30);
    expect(await body.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);expect(await box(panel)).toEqual(before);
  }
});

const starter=JSON.parse(await readFile(path.join(repo,'src/starters/named-layouts.json'),'utf8'));
function canvasSpec(){
  const raw=structuredClone(starter),s=raw.page.sections[0],d=s.diagram;s.id='canvas-story';s.text='Section notes stay with the diagram.';d.autoplay=false;d.defaultLayout='service-flow';
  d.layouts[1].sectionLayout.default.forEach(t=>{if(t.panel)t.hidden=false;});
  d.layouts[1].exploreLayout={panelPlacement:'canvas',canvas:{panels:[{panel:'home',x:-380,y:20,w:340,h:300},{panel:'clip',x:500,y:450,w:340,h:280},{panel:'outcome',x:900,y:20,w:300,h:240}],prose:{x:900,y:310,w:300,h:180}}};
  return JSON.stringify(raw);
}
const savedCanvas=(text,id)=>{const canvas=JSON.parse(text).page.sections[0].diagram.layouts[1].exploreLayout.canvas;return id==='prose'?canvas.prose:canvas.panels.find(p=>p.panel===id);};

test('canvas windows show edge handles only while selected; width-locked windows follow width from the side edge',async({page,server})=>{
  await page.setViewportSize({width:1600,height:1000});
  await page.goto(server.origin+'/standalone.html');await page.evaluate(()=>localStorage.clear());
  await page.goto(server.origin+'/workbench.html');await paste(page,canvasSpec());await closeTools(page);
  // Section notes are an ordinary (not width-locked) canvas window.
  const notes=page.locator('.explore-canvas-objects [data-explore-content=prose]'),clip=page.locator('.explore-canvas-objects [data-explore-panel=clip]');
  await expect(notes).toBeVisible();
  for(const edge of SIDES.filter(e=>e!=='se'))expect(await shown(notes,edge),`unselected ${edge}`).toBe(false);
  await notes.focus();await expect(notes).toHaveAttribute('aria-current','true');await closeTools(page);
  for(const edge of SIDES.filter(e=>e!=='se'))expect(await shown(notes,edge),`selected ${edge}`).toBe(true);
  // An ordinary canvas window: the north-west corner moves only the top and left sides.
  const before=await page.locator('#src').inputValue(),old=savedCanvas(before,'prose'),start=await box(notes),scale=start[2]/old.w;
  await pointerDrag(page,pointFor(start,'nw'),-40,-30);
  const moved=await page.locator('#src').inputValue(),now=savedCanvas(moved,'prose');
  expect(near([now.x,now.y,now.w,now.h],[old.x-40/scale,old.y-30/scale,old.w+40/scale,old.h+30/scale]),`notes: ${JSON.stringify(old)} -> ${JSON.stringify(now)} at scale ${scale}`).toBe(true);
  expect(near([now.x+now.w,now.y+now.h],[old.x+old.w,old.y+old.h])).toBe(true);
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(before);
  // A width-locked window: no top or bottom edge; the west edge widens it, the right side stays put, the height follows.
  await clip.focus();await expect(clip).toHaveAttribute('aria-current','true');await closeTools(page);
  expect(await shown(clip,'n')).toBe(false);expect(await shown(clip,'s')).toBe(false);expect(await shown(clip,'w')).toBe(true);
  const clipBefore=await page.locator('#src').inputValue(),clipOld=savedCanvas(clipBefore,'clip'),clipStart=await box(clip),clipScale=clipStart[2]/clipOld.w;
  await pointerDrag(page,pointFor(clipStart,'w'),-48,0);
  const clipNow=savedCanvas(await page.locator('#src').inputValue(),'clip'),outer=await clip.evaluate(el=>el.offsetHeight);
  expect(Math.abs(clipNow.w-(clipOld.w+48/clipScale))).toBeLessThanOrEqual(1);
  expect(Math.abs(clipNow.x+clipNow.w-(clipOld.x+clipOld.w))).toBeLessThanOrEqual(1);
  expect(Math.abs(clipNow.h-outer)).toBeLessThanOrEqual(1);
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(clipBefore);
});
