import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect,paste} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
const named=JSON.parse(await readFile(path.join(repo,'src/starters/named-layouts.json'),'utf8'));
function fixture(scale){
  const spec=structuredClone(named),sec=spec.page.sections[0],d=sec.diagram;
  sec.id='doorbell';d.autoplay=false;d.defaultLayout='service-flow';
  if(scale!==undefined){
    d.layouts[1].exploreLayout.overlayScale=scale;
    d.layouts[1].exploreLayout.controls={x:.06,y:.76,w:.6,h:.14};
  }
  d.steps[1].panelVisibility={clip:false};d.steps[2].panelVisibility={clip:true};
  return spec;
}
async function build(server,spec,name='scale'){
  const input=path.join(server.root,name+'.json'),out=path.join(server.root,name+'.html');await writeFile(input,JSON.stringify(spec));
  execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),out]);
  return server.origin+'/'+name+'.html#d=doorbell&v=service-flow&m=step&s=quiet&tour=0';
}
const graph=page=>page.locator('.explore-board .boardcanvas>svg');
const panel=page=>page.locator('[data-explore-panel=outcome]');
const player=page=>page.locator('.explore-player');
const size=async loc=>{const r=await loc.boundingBox();return {w:r.width,h:r.height};};
test('reader scale is separate from diagram zoom, scales content, packs panels and keeps the full-width step row',async({page,server})=>{
  await page.goto(await build(server,fixture()));await page.evaluate(()=>document.fonts.ready);
  const startGraph=await graph(page).boundingBox(),start=await size(panel(page)),steps=await size(player(page));
  const zoom=page.locator('.explore-overlay-zoom');await expect(zoom.locator('.explore-overlay-value')).toHaveText('100%');
  await zoom.getByRole('button',{name:'Shrink panels and controls',exact:true}).click();
  await expect(zoom.locator('.explore-overlay-value')).toHaveText('90%');
  expect((await size(panel(page))).w).toBeCloseTo(start.w*.9,0);expect((await size(player(page))).h).toBeCloseTo(steps.h*.9,0);
  expect((await size(player(page))).w).toBeGreaterThan(steps.w);
  expect(await graph(page).boundingBox()).toEqual(startGraph);
  const content=await panel(page).locator('.explore-window-body').evaluate(el=>({logical:el.offsetWidth,visual:el.getBoundingClientRect().width}));expect(content.visual/content.logical).toBeCloseTo(.9,2);
  const ps=await size(panel(page));await page.getByRole('button',{name:'Zoom in',exact:true}).click();expect((await graph(page).boundingBox()).width).toBeGreaterThan(startGraph.width);expect(await size(panel(page))).toEqual(ps);
  await page.getByRole('button',{name:'Next step',exact:true}).click();await expect(page.locator('[data-explore-panel=clip]')).toBeHidden();
  await page.getByRole('button',{name:'Next step',exact:true}).click();await expect(page.locator('[data-explore-panel=clip]')).toBeVisible();await expect(zoom.locator('.explore-overlay-value')).toHaveText('90%');
  await page.getByRole('button',{name:'Home story',exact:true}).click();await expect(page.locator('.explore-stage')).toBeHidden();
  await page.getByRole('button',{name:'Service flow',exact:true}).click();await expect(zoom.locator('.explore-overlay-value')).toHaveText('90%');
  await page.getByRole('button',{name:'Hide panels',exact:true}).click();await page.getByRole('button',{name:'Restore panels',exact:true}).click();expect(await size(panel(page))).toEqual(ps);
  await zoom.getByRole('button',{name:'Reset panels and controls size',exact:true}).click();expect((await size(panel(page))).w).toBeCloseTo(start.w,0);
  for(let n=0;n<5;n++)await zoom.getByRole('button',{name:'Shrink panels and controls',exact:true}).click();await expect(zoom.getByRole('button',{name:'Shrink panels and controls',exact:true})).toBeDisabled();
  await page.reload();await expect(zoom.locator('.explore-overlay-value')).toHaveText('100%');
});
test('saved scale survives scaled drag/resize authoring, one Undo/Redo, view switches and HTML export',async({page,server})=>{
  await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(fixture(.75),null,2));
  const source=()=>page.locator('#src').inputValue(),readout=page.locator('#workspace-overlay-size');
  await expect(readout).toBeVisible();await expect(readout).toHaveText('75%');await page.evaluate(()=>document.fonts.ready);
  const before=await source(),width=(await size(panel(page))).w,graphBefore=await graph(page).boundingBox(),savedControls=await size(player(page));
  await page.locator('#workspace-overlay-out').click();await expect(readout).toHaveText('65%');
  const scaled=await source();expect(JSON.parse(scaled).page.sections[0].diagram.layouts[1].exploreLayout.overlayScale).toBe(.65);
  expect((await size(panel(page))).w).toBeCloseTo(width*.65/.75,0);expect(await graph(page).boundingBox()).toEqual(graphBefore);
  expect((await size(player(page))).w).toBeCloseTo(savedControls.w,0);expect((await size(player(page))).h).toBeCloseTo(savedControls.h*.65/.75,0);
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(before);await expect(readout).toHaveText('75%');
  await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(scaled);await expect(readout).toHaveText('65%');
  await panel(page).locator('.explore-window-grip').press('ArrowLeft');
  const moved=await source(),r=await panel(page).boundingBox();
  await panel(page).locator('.explore-window-resize').press('ArrowRight');expect((await panel(page).boundingBox()).width).toBeCloseTo(r.width+8,0);
  const resized=await source();await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(moved);expect((await size(panel(page))).w).toBeCloseTo(r.width,0);
  await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(resized);
  await page.locator('#workspace-panels').click(); // The inspector opened by Undo would otherwise cover the panel grip.
  await page.locator('[data-explore-panel=clip] .explore-window-hide').click(); // Undocking the first panel lets the next docked header occupy its old position.
  const dragStart=await panel(page).boundingBox(),grip=await panel(page).locator('.explore-window-grip').boundingBox();
  await page.mouse.move(grip.x+24,grip.y+12);await page.mouse.down();await page.mouse.move(grip.x-76,grip.y+42,{steps:6});await page.mouse.up();
  expect((await panel(page).boundingBox()).x).toBeCloseTo(dragStart.x-100,0);expect((await panel(page).boundingBox()).y).toBeCloseTo(dragStart.y+30,0);
  expect((await size(panel(page))).w).toBeCloseTo(dragStart.width,0);await expect(readout).toHaveText('65%');
  const pr=await player(page).boundingBox();await player(page).locator('.explore-player-grip').press('ArrowUp');expect((await player(page).boundingBox()).y).toBeCloseTo(pr.y-8,0);expect((await size(player(page))).h).toBeCloseTo(pr.height,0);
  await player(page).locator('.explore-window-resize').press('ArrowRight');await player(page).locator('.explore-window-resize').press('ArrowDown');
  expect((await size(player(page))).w).toBeCloseTo(pr.width+8,0);expect((await size(player(page))).h).toBeCloseTo(pr.height+8,0);
  const saved=await source(),raw=JSON.parse(saved),layout=raw.page.sections[0].diagram.layouts[1].exploreLayout;
  expect(layout.overlayScale).toBe(.65);expect(layout.camera).toEqual(fixture(.75).page.sections[0].diagram.layouts[1].exploreLayout.camera);
  await page.getByRole('button',{name:'Home story',exact:true}).click();await expect(readout).toBeHidden();
  await page.getByRole('button',{name:'Service flow',exact:true}).click();await expect(readout).toHaveText('65%');await expect(page.locator('#src')).toHaveValue(saved);
  await page.goto(await build(server,raw,'exported'));
  await expect(page.locator('.explore-overlay-value')).toHaveText('65%');
  const exported=await panel(page).boundingBox(),stage=await page.locator('.explore-stage').boundingBox();
  expect(exported.width/stage.width).toBeCloseTo(layout.panels[0].w*.65,3);
  const exportedControls=await size(player(page));expect(exportedControls.w/stage.width).toBeCloseTo(layout.controls.w,3);expect(exportedControls.h/stage.height).toBeCloseTo(layout.controls.h*.65,3);
  await expect(page.locator('[data-explore-panel=home]')).toBeHidden();
});
