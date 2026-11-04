import {test,expect,paste,closeTools} from '../helpers/test.mjs';
import {editorSpec} from '../fixtures/editor-spec.mjs';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {repo} from '../helpers/prepare.mjs';

/* #920 contract (Chuck, 2026-11-03): floating Inspect keeps its saved size. Automatic
   placement may still move it to cover the least of the selection, and may overlap the
   selection; it never shrinks Inspect (no 240px-tall or 300px-wide stand-in). Other tools keep
   their own placement rules, except that (Chuck, 2026-11-03) an open tool window whose title
   bar or resize handle Inspect covers moves aside, for display only. Desktop only. §0 ruling:
   extend existing tests.

   | row | fixture | assertion (scoped) | rejects |
   | 1 open over a section-wide panel keeps saved height | truth-table example at 1600x1000, saved 430x650 by keyboard resize, panel selected, Inspect closed then opened from its tab | #workspace-window-inspect box h == saved h | today's {h:240} candidates winning `place(…,opening)` |
   | 2 open over a section-wide panel keeps saved width | same | box w == saved w | an impl that drops only the {h:240} candidates (a 300-wide full-height window overlaps less, so {w:300} wins) |
   | 3 selecting a section-wide panel while Inspect is open keeps saved height | same viewport, Inspect open at saved size, then the panel title clicked | box h == saved h | a fix applied only on the open path (showTool), not on selection re-placement |
   | 4 same, keeps saved width | same | box w == saved w | as row 2, on the selection path |
   | 5 the saved size is the user's, not the default | keyboard resize to 430x650 before any selection | precondition box == 430x650 != default 380x700 | an impl that re-sizes Inspect to defaults() instead of the saved preference |
   | 6 Inspect stays usable at its saved size | rows 1 and 3 | grip, close and resize hit-test to themselves | a placement that pushes the saved-size window's controls off-screen |
   | 7 Inspect still avoids a selected node when it can | existing `desktop panel placement…` at 1280x720, 1440x900, 1920x1080 | clearSelectionOverlap (unchanged) | an impl that skips Inspect placement entirely |
   | 8 Agent and Inspect controls both reachable together | existing `desktop panel placement…` (unchanged) | hit() on both windows' controls | a full-size Inspect left under Agent's title bar or resize handle |
   | 9 a tool window Inspect displaces really moves and stays usable | editorSpec at 1280x720, Find objects keyboard-moved to a saved spot, Doorbell selected so Inspect lands on its close button | box moved > 15px; grip, close and resize hit-test to themselves | removing the neighbor move |
   | 10 the displaced window's saved rect does not change | same, read after Inspect's close persists | windows.outline in localStorage byte-identical before and after | a neighbor move that writes prefs.windows |
   | 11 reload puts the window back at its saved rect | same, Inspect closed, page reloaded | box == saved rect | a neighbor move that reaches saved geometry by any path |
   | - may move / may overlap the selection | permission, not a requirement | not asserted | - |
   Discriminating power: a loud precondition proves every saved-size position in the workspace
   intersects the selected panel, so placement cannot avoid it without shrinking. */

async function capture(page,testInfo,name){const path=testInfo.outputPath(name+'.png');await page.screenshot({path});await testInfo.attach(name,{path,contentType:'image/png'});}
async function hit(locator){
  await expect(locator).toBeVisible();
  expect(await locator.evaluate(el=>{const r=el.getBoundingClientRect(),h=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {control:el.getAttribute('aria-label'),reachable:el===h || el.contains(h),hit:h?.className};})).toMatchObject({reachable:true});
}
async function camera(page){return page.locator('.explore-board').evaluate(el=>[el.scrollLeft,el.scrollTop,el.querySelector('svg')?.getAttribute('style')]);}
async function clearSelectionOverlap(page){
  await expect.poll(async()=>page.evaluate(()=>{
    const p=document.querySelector('#workspace-window-inspect').getBoundingClientRect(),s=document.querySelector('#docview .dv-sel')?.getBoundingClientRect();
    return !!s && (p.right<=s.left || p.left>=s.right || p.bottom<=s.top || p.top>=s.bottom);
  })).toBe(true);
}
for(const [width,height] of [[1280,720],[1440,900],[1920,1080]])test(`desktop panel placement, selection and docking at ${width}x${height}`,async({page,server},testInfo)=>{
  await page.setViewportSize({width,height});
  const raw=editorSpec();raw.page.blocks[0].diagram.layouts.forEach(view=>view.presentation='explore');const source=JSON.stringify(raw,null,2);
  await page.goto(server.origin+'/workbench.html');await paste(page,source);
  const agent=page.locator('#workspace-window-agent'),inspect=page.locator('#workspace-window-inspect');
  await page.locator('#editor-tab-agent').click();
  for(const control of ['.workspace-window-grip','.workspace-window-close','.workspace-window-resize','.workspace-window-dock'])await hit(agent.locator(control));
  await hit(agent.getByRole('button',{name:'New Connection',exact:true}));
  expect((await agent.boundingBox()).x).toBeGreaterThanOrEqual(await page.locator('.workspace-rail').evaluate(el=>el.getBoundingClientRect().right));
  await capture(page,testInfo,`agent-${width}`);
  await agent.locator('.workspace-window-close').click();
  const node=page.locator('#docview [data-dv-node="c"]').first();const beforeCamera=await camera(page);
  await node.click();await page.locator('#editor-tab-inspect').click();await expect(inspect).toBeVisible();await clearSelectionOverlap(page);expect(await camera(page)).toEqual(beforeCamera);
  await expect(page.locator('#guide').getByLabel('Name',{exact:true})).toHaveValue('Storage');
  await capture(page,testInfo,`inspect-${width}`);
  // Selection changes while Inspect is open must recheck its placement.
  await page.locator('#editor-tab-outline').click();await page.locator('#outline-search').fill('Doorbell');
  await page.locator('.outline-item').filter({hasText:'Doorbell'}).click();await page.locator('#outline-inspect').click();
  await clearSelectionOverlap(page);await page.locator('#workspace-window-outline .workspace-window-close').click();
  await page.locator('#editor-tab-agent').click();
  for(const win of [agent,inspect])for(const control of ['.workspace-window-grip','.workspace-window-close','.workspace-window-resize'])await hit(win.locator(control));
  await capture(page,testInfo,`multiple-${width}`);
  await agent.locator('.workspace-window-close').click();
  const floating=await inspect.boundingBox(),canvas=await page.locator('.workbench-diagram-canvas').boundingBox();
  await inspect.getByRole('button',{name:'Dock Inspect panel',exact:true}).click();
  const dock=await inspect.boundingBox(),reserved=await page.locator('.workbench-diagram-canvas').boundingBox();
  expect(reserved.width).toBeLessThan(canvas.width-250);expect(reserved.x+reserved.width).toBeLessThanOrEqual(dock.x);
  await hit(inspect.getByRole('button',{name:'Float Inspect panel',exact:true}));
  await expect.poll(()=>page.locator('#docview .dv-sel').evaluate(el=>{const r=el.getBoundingClientRect(),b=el.closest('.explore-board').getBoundingClientRect();return {inside:r.left>=b.left && r.right<=b.right && r.top>=b.top && r.bottom<=b.bottom,selected:r.toJSON(),board:b.toJSON(),scroll:el.closest('.explore-board').scrollLeft};})).toMatchObject({inside:true});
  await capture(page,testInfo,`docked-${width}`);
  await inspect.getByRole('button',{name:'Float Inspect panel',exact:true}).click();
  // Selection avoidance may reapply, but the previous floating size is retained.
  expect((await inspect.boundingBox()).width).toBe(floating.width);
  expect((await page.locator('.workbench-diagram-canvas').boundingBox()).width).toBe(canvas.width);
  await expect(page.locator('#src')).toHaveValue(source);await expect(page.locator('#undo-builder')).toBeDisabled();
  // An authored change remains the next Undo after chrome moves and docking.
  const title=page.locator('#guide').getByLabel('Name',{exact:true});await title.fill('Front door');await title.press('Enter');
  await inspect.locator('.workspace-window-grip').focus();await page.keyboard.press('ArrowDown');
  await inspect.locator('.workspace-window-resize').focus();await page.keyboard.press('ArrowLeft');
  await inspect.getByRole('button',{name:'Dock Inspect panel',exact:true}).click();
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(source);await expect(page.locator('#undo-builder')).toBeDisabled();
  await page.reload();await expect(inspect).toHaveAttribute('data-docked','true');
  await page.setViewportSize({width:1280,height:720});
  await hit(inspect.getByRole('button',{name:'Float Inspect panel',exact:true}));await hit(inspect.locator('.workspace-window-close'));
  await inspect.getByRole('button',{name:'Float Inspect panel',exact:true}).click();
  for(const control of ['.workspace-window-grip','.workspace-window-close','.workspace-window-resize'])await hit(inspect.locator(control));
});

test('desktop floating Inspect keeps its saved size over a section-wide panel at 1600x1000',async({page,server},testInfo)=>{
  await page.setViewportSize({width:1600,height:1000});
  const source=JSON.stringify(JSON.parse(await readFile(path.join(repo,'examples/device-power-truth-table/device-power-truth-table.spec.json'),'utf8')),null,2);
  await page.goto(server.origin+'/workbench.html');await paste(page,source);await closeTools(page);
  const inspect=page.locator('#workspace-window-inspect'),panel=page.locator('#docview .pwidget.pt-truth-table'),settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))));
  const size=async()=>{const b=await inspect.boundingBox();return {w:Math.round(b.width),h:Math.round(b.height)};};
  await expect(inspect).toBeHidden();await expect(page.locator('#docview .dv-sel')).toHaveCount(0);
  // Row 5: the saved size comes from the user's own resize, not the 380x700 default.
  await page.locator('#editor-tab-inspect').click();await expect(inspect).toBeVisible();await settle();
  expect(await size()).toEqual({w:380,h:700});
  await inspect.locator('.workspace-window-resize').focus();await page.keyboard.press('Shift+ArrowUp');await page.keyboard.press('Shift+ArrowRight');await settle();
  const saved=await size();expect(saved).toEqual({w:430,h:650});
  // Rows 3-4 and 6: selecting the section-wide panel re-places the open Inspect without shrinking it.
  await panel.locator('.ptitle').click();await expect(panel).toHaveClass(/(^|\s)dv-sel(\s|$)/);
  // Discriminating precondition: every saved-size position in the workspace intersects the panel.
  expect(await panel.evaluate((el,{w,h})=>{
    const s=el.getBoundingClientRect(),rail=document.querySelector('.workspace-rail').getBoundingClientRect(),header=document.querySelector('.workbench-header').getBoundingClientRect();
    return {leftmost:s.left<rail.right+12+w,rightmost:s.right>innerWidth-12-w,topmost:s.top<header.bottom+10+h,bottommost:s.bottom>innerHeight-12-h};
  },saved)).toEqual({leftmost:true,rightmost:true,topmost:true,bottommost:true});
  await settle();
  expect.soft(await size(),'selection re-placement keeps the saved Inspect size').toEqual(saved);
  for(const control of ['.workspace-window-grip','.workspace-window-close','.workspace-window-resize'])await hit(inspect.locator(control));
  await capture(page,testInfo,'inspect-selected-panel-1600');
  // Rows 1-2 and 6: opening Inspect over the already-selected panel keeps the saved size.
  await inspect.locator('.workspace-window-close').click();await expect(inspect).toBeHidden();await expect(panel).toHaveClass(/(^|\s)dv-sel(\s|$)/);
  await page.locator('#editor-tab-inspect').click();await expect(inspect).toBeVisible();await settle();
  expect.soft(await size(),'opening Inspect keeps the saved Inspect size').toEqual(saved);
  for(const control of ['.workspace-window-grip','.workspace-window-close','.workspace-window-resize'])await hit(inspect.locator(control));
  await capture(page,testInfo,'inspect-opened-over-panel-1600');
  await expect(page.locator('#src')).toHaveValue(source);
});

test('a tool window that moves aside for Inspect keeps its saved position',async({page,server},testInfo)=>{
  await page.setViewportSize({width:1280,height:720});
  const raw=editorSpec();raw.page.blocks[0].diagram.layouts.forEach(view=>view.presentation='explore');
  await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(raw,null,2));
  const inspect=page.locator('#workspace-window-inspect'),outline=page.locator('#workspace-window-outline');
  const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))));
  const savedRecord=()=>page.evaluate(()=>JSON.stringify(JSON.parse(localStorage.getItem('dv-workbench-floating-v1')).windows.outline));
  const shown=async()=>{const b=await outline.boundingBox();return {x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height)};};
  await page.locator('#docview [data-dv-node="c"]').first().click();await page.locator('#editor-tab-inspect').click();await expect(inspect).toBeVisible();await clearSelectionOverlap(page);
  await page.locator('#editor-tab-outline').click();await expect(outline).toBeVisible();
  // A keyboard move makes the saved rect the user's own, so display and preference start equal.
  await outline.locator('.workspace-window-grip').focus();await page.keyboard.press('ArrowLeft');await settle();
  const before=await savedRecord(),atSaved=await shown(),{x,y,w,h}=JSON.parse(before);expect({x,y,w,h}).toEqual(atSaved);
  const close=await outline.locator('.workspace-window-close').boundingBox();
  await page.locator('#outline-search').fill('Doorbell');await page.locator('.outline-item').filter({hasText:'Doorbell'}).click();await page.locator('#outline-inspect').click();
  await clearSelectionOverlap(page);await settle();
  // Discriminating precondition: Inspect now covers the spot where the neighbor's close button was.
  const cover=await inspect.boundingBox(),spot={x:close.x+close.width/2,y:close.y+close.height/2};
  expect(spot.x>=cover.x && spot.x<=cover.x+cover.width && spot.y>=cover.y && spot.y<=cover.y+cover.height).toBe(true);
  // Rows 9-11: the move is real on screen, and only on screen.
  const moved=await shown();expect(Math.abs(moved.x-atSaved.x)+Math.abs(moved.y-atSaved.y),'the neighbor moves out from under Inspect').toBeGreaterThan(15);
  for(const control of ['.workspace-window-grip','.workspace-window-close','.workspace-window-resize'])await hit(outline.locator(control));
  await capture(page,testInfo,'neighbor-moved-1280');
  await inspect.locator('.workspace-window-close').click();await expect(inspect).toBeHidden();
  expect.soft(await savedRecord(),'the neighbor move leaves its saved rect byte-identical').toBe(before);
  await page.reload();await expect(outline).toBeVisible();await expect(inspect).toBeHidden();
  await expect.poll(shown,{message:'reload restores the saved rect'}).toEqual(atSaved);
});

test('Contents changes, tool restoration and the single dock keep desktop controls usable',async({page,server})=>{
  await page.setViewportSize({width:1280,height:720});await page.goto(server.origin+'/workbench.html');
  const source=JSON.stringify(editorSpec(),null,2);await paste(page,source);
  for(const name of ['brief','steps','outline','json','file']){
    await page.locator('#editor-tab-'+name).click();const win=page.locator('#workspace-window-'+name);
    for(const control of ['.workspace-window-grip','.workspace-window-close','.workspace-window-resize','.workspace-window-dock'])await hit(win.locator(control));
    await win.locator('.workspace-window-close').click();
  }
  await expect(page.getByRole('button',{name:'Open Contents',exact:true}).first()).toBeVisible();await page.locator('#editor-tab-agent').click();
  const agent=page.locator('#workspace-window-agent');await agent.locator('.workspace-window-grip').focus();
  for(let n=0;n<12;n++)await page.keyboard.press('Shift+ArrowLeft');
  const collapsed=await agent.boundingBox();expect(collapsed.x).toBeLessThan(200);
  await page.getByRole('button',{name:'Open Contents',exact:true}).first().click();
  await expect.poll(async()=>(await agent.boundingBox()).x).toBeGreaterThan(300);
  for(const control of ['.workspace-window-grip','.workspace-window-close','.workspace-window-resize'])await hit(agent.locator(control));
  // Docking reserves Standard's scroller too, and closing gives it back.
  const standard=page.locator('#workspace-canvas'),full=await standard.boundingBox();
  await agent.getByRole('button',{name:'Dock Agent panel',exact:true}).click();
  expect((await standard.boundingBox()).width).toBeLessThan(full.width-250);
  await page.locator('#editor-tab-json').click();const json=page.locator('#workspace-window-json');
  await json.getByRole('button',{name:'Dock JSON source panel',exact:true}).click();
  await expect(agent).toHaveAttribute('data-docked','false');await expect(json).toHaveAttribute('data-docked','true');
  await json.locator('.workspace-window-close').click();expect((await standard.boundingBox()).width).toBe(full.width);
  await page.locator('#editor-tab-json').click();await expect(json).toHaveAttribute('data-docked','true');
  await json.getByRole('button',{name:'Float JSON source panel',exact:true}).click();expect((await standard.boundingBox()).width).toBe(full.width);
  await expect(page.locator('#src')).toHaveValue(source);await expect(page.locator('#undo-builder')).toBeDisabled();
});

test('a newer selection retires pending dock camera preservation',async({page,server})=>{
  await page.setViewportSize({width:1440,height:900});const raw=editorSpec();raw.page.blocks[0].diagram.layouts.forEach(view=>view.presentation='explore');
  await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(raw));
  await page.locator('#docview [data-dv-node="a"]').first().click();
  const result=await page.evaluate(async()=>{
    const board=document.querySelector('.explore-board'),next=board.querySelector('[data-dv-node="c"]'),before=next.getBoundingClientRect(),width=board.clientWidth;
    document.querySelector('#workspace-window-inspect .workspace-window-dock').click();
    next.dispatchEvent(new MouseEvent('click',{bubbles:true}));
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    return {selected:next.classList.contains('dv-sel'),shift:next.getBoundingClientRect().left-before.left,expected:-(width-board.clientWidth)/2};
  });
  expect(result.selected).toBe(true);expect(result.shift).toBeCloseTo(result.expected,0);
  // Two toggles in one frame must leave the latest viewport in charge.
  await page.evaluate(async()=>{const toggle=document.querySelector('#workspace-window-inspect .workspace-window-dock');toggle.click();toggle.click();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));});
  await expect(page.locator('#workspace-window-inspect')).toHaveAttribute('data-docked','true');
  // The final Dock may preserve the current selection, but never resurrect the
  // old left-node anchor; the selected node must finish in the usable viewport.
  await expect.poll(()=>page.locator('#docview .dv-sel').evaluate(el=>{const r=el.getBoundingClientRect(),b=el.closest('.explore-board').getBoundingClientRect();return r.left>=b.left && r.right<=b.right;})).toBe(true);
  await expect(page.locator('#undo-builder')).toBeDisabled();
});


for(const presentation of ['standard','explore'])test(presentation+' diagram Focus releases a tucked dock and restores its cameras on Return',async({page,server})=>{
  await page.setViewportSize({width:1440,height:900});const raw=editorSpec();raw.page.blocks[0].diagram.layouts.forEach(view=>view.presentation=presentation);
  const source=JSON.stringify(raw);await page.goto(server.origin+'/workbench.html');await paste(page,source);
  const agent=page.locator('#workspace-window-agent'),inspect=page.locator('#workspace-window-inspect');
  const reservation=()=>page.locator('body').evaluate(el=>el.style.getPropertyValue('--workspace-dock-width'));
  const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))));
  const cameras=()=>page.locator('#docview .board').first().evaluate(el=>({x:el.scrollLeft,y:el.scrollTop,graph:el.querySelector('.boardcanvas>svg').getBoundingClientRect().width,canvas:el.closest('.doc-sec').style.zoom}));
  await page.locator('#editor-tab-agent').click();await agent.getByRole('button',{name:'Dock Agent panel',exact:true}).click();
  const saved=await reservation();expect(parseFloat(saved)).toBeGreaterThan(300);await settle();const agentCameras=await cameras();
  await page.getByRole('button',{name:'Focus diagram',exact:true}).click();
  await expect(agent).toBeHidden();await expect.poll(reservation).toBe('0px');
  await page.getByRole('button',{name:'Return to page',exact:true}).click();
  await expect(agent).toBeVisible();await expect(agent).toHaveAttribute('data-docked','true');await expect.poll(reservation).toBe(saved);await settle();expect(await cameras()).toEqual(agentCameras);
  await agent.locator('.workspace-window-close').click();
  await page.locator('#docview [data-dv-node="a"]').first().click();await page.locator('#editor-tab-inspect').click();
  await inspect.getByRole('button',{name:'Dock Inspect panel',exact:true}).click();
  const inspectReserve=await reservation();await settle();const inspectCameras=await cameras();
  await page.getByRole('button',{name:'Focus diagram',exact:true}).click();
  await expect(inspect).toBeVisible();await expect.poll(reservation).toBe(inspectReserve);
  await page.getByRole('button',{name:'Return to page',exact:true}).click();
  await expect(inspect).toHaveAttribute('data-docked','true');await expect.poll(reservation).toBe(inspectReserve);await settle();expect(await cameras()).toEqual(inspectCameras);
  await expect(page.locator('#src')).toHaveValue(source);await expect(page.locator('#undo-builder')).toBeDisabled();
});
