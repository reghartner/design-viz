import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {test,expect,paste,pagePreview} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
const named=JSON.parse(await readFile(path.join(repo,'src/starters/named-layouts.json'),'utf8'));
named.page.sections[0].diagram.autoplay=false;
const section=page=>page.locator('#docview .doc-sec').first();
const raw=async page=>JSON.parse(await page.locator('#src').inputValue());

test('Presentation is a per-view undoable edit and survives host preview changes and duplication',async({page,server})=>{
  await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(named,null,2));await pagePreview(page);
  await expect(page.locator('#welcome-paste-error')).toBeEmpty();
  await section(page).getByRole('button',{name:'Service flow',exact:true}).click();await pagePreview(page);
  await section(page).getByRole('button',{name:'Arrange section',exact:true}).click();
  const presentation=()=>section(page).getByRole('combobox',{name:'View type',exact:true});
  await expect(presentation()).toHaveValue('explore');
  const before=await page.locator('#src').inputValue();
  await presentation().selectOption('standard');
  const changed=await page.locator('#src').inputValue();expect(changed).toBe(before.replace('"presentation": "explore"','"presentation": "standard"'));
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(before);await expect(presentation()).toHaveValue('explore');
  await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(changed);await expect(presentation()).toHaveValue('standard');
  await presentation().selectOption('explore');
  const explored=await page.locator('#src').inputValue();await pagePreview(page);
  if(!await page.locator('#layout-preview-target').isVisible())await page.locator('#workspace-appearance>summary').click();await page.getByRole('combobox',{name:'Preview host',exact:true}).selectOption('confluence');
  await section(page).getByRole('button',{name:'Arrange section',exact:true}).click();
  await expect(presentation()).toHaveValue('explore');await expect(page.locator('#src')).toHaveValue(explored);
  await section(page).getByRole('button',{name:'Duplicate view',exact:true}).click();
  const diagram=(await raw(page)).page.sections[0].diagram,copy=diagram.layouts.at(-1);
  expect(copy.presentation).toBe('explore');expect(diagram.defaultLayout).toBe('home-story');
  expect(diagram.layouts[0]).toEqual(named.page.sections[0].diagram.layouts[0]);
  expect(diagram.steps).toEqual(named.page.sections[0].diagram.steps);expect(diagram.paths).toEqual(named.page.sections[0].diagram.paths);
  expect(copy.sectionLayout).toEqual(diagram.layouts[1].sectionLayout);
  await expect(section(page)).toHaveAttribute('data-view-id',copy.id);await expect(presentation()).toHaveValue('explore');
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(explored);
});

test('Explore editing saves floating panels, controls and camera with Undo, reload and host scaling',async({page,server})=>{
  await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(named,null,2));await pagePreview(page);
  await section(page).getByRole('button',{name:'Service flow',exact:true}).click();await pagePreview(page);
  await section(page).getByRole('button',{name:'Arrange section',exact:true}).click();
  const stage=section(page).locator('.explore-stage'),panel=section(page).locator('[data-explore-panel=outcome]');
  await expect(stage).toBeVisible();await expect(section(page).getByRole('combobox',{name:'Layout element',exact:true})).toHaveCount(0);
  const initial=await page.locator('#src').inputValue();
  const grip=()=>panel.locator('.explore-window-grip');await grip().focus();await page.keyboard.press('Shift+ArrowLeft');
  await expect.poll(async()=>JSON.parse(await page.locator('#src').inputValue()).page.sections[0].diagram.layouts[1].exploreLayout?.panels[0].stacked).toBe(false);
  const moved=await page.locator('#src').inputValue();await expect(grip()).toBeFocused();
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(initial);await expect(panel).toHaveClass(/explore-stacked/);
  await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(moved);await expect(panel).not.toHaveClass(/explore-stacked/);
  const handle=panel.locator('.explore-window-resize');await handle.focus();await page.keyboard.press('Shift+ArrowLeft');
  const resized=await page.locator('#src').inputValue();expect(resized).not.toBe(moved);
  let r=await grip().boundingBox();await page.mouse.move(r.x+30,r.y+12);await page.mouse.down();await page.mouse.move(r.x-150,r.y+50,{steps:5});await page.keyboard.press('Escape');await page.mouse.up();await expect(page.locator('#src')).toHaveValue(resized);
  await section(page).getByRole('button',{name:'Move step controls; use arrow keys',exact:true}).focus();await page.keyboard.press('Shift+ArrowUp');
  const controls=(await raw(page)).page.sections[0].diagram.layouts[1].exploreLayout.controls;expect(controls.y).toBeLessThan(.9);
  await section(page).getByRole('button',{name:'Zoom in',exact:true}).click();
  const board=section(page).locator('.explore-board');await board.scrollIntoViewIfNeeded();
  const beforePanSource=await page.locator('#src').inputValue();
  const beforePan=(await raw(page)).page.sections[0].diagram.layouts[1].exploreLayout.camera;
  const b=await board.evaluate(el=>{const r=el.getBoundingClientRect();for(let y=Math.max(100,r.top+100);y<Math.min(innerHeight-120,r.bottom-120);y+=50)for(let x=r.left+30;x<r.right-350;x+=50){const hit=document.elementFromPoint(x,y);if(hit && hit.closest('.explore-board')===el && hit.matches('.explore-board,.boardcanvas,svg,.dv-board-grid'))return {x,y};}throw Error('No empty graph area');});
  await page.mouse.move(b.x,b.y);await page.mouse.down();await expect(section(page).locator('.section-viewport')).toHaveClass(/viewport-gesturing/);await page.mouse.move(b.x+80,b.y+70,{steps:5});await page.mouse.up();
  const saved=await page.locator('#src').inputValue(),defaults=(await raw(page)).page.sections[0].diagram.layouts[1].exploreLayout;
  expect(defaults.camera.zoom).toBeGreaterThan(0);expect(defaults.camera.x).toBeLessThan(beforePan.x-.02);
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(beforePanSource);
  await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(saved);
  if(!await page.locator('#layout-preview-target').isVisible())await page.locator('#workspace-appearance>summary').click();await page.getByRole('combobox',{name:'Preview host',exact:true}).selectOption('confluence');await expect(stage).toBeVisible();await expect(page.locator('#src')).toHaveValue(saved);
  const norm=await panel.evaluate(el=>{const r=el.getBoundingClientRect(),s=el.closest('.explore-stage').getBoundingClientRect();return {w:r.width/s.width,y:(r.y-s.y)/s.height,sw:s.width};});
  expect(norm.w).toBeCloseTo(Math.max(128/norm.sw,defaults.panels[0].w),2);expect(norm.y).toBeCloseTo(defaults.panels[0].y,2);
  await page.reload();await page.locator('#workspace-home').click();await paste(page,saved);await pagePreview(page);
  await section(page).getByRole('button',{name:'Service flow',exact:true}).click();await pagePreview(page);await expect(panel).not.toHaveClass(/explore-stacked/);
  const restored=await board.evaluate(el=>({left:el.scrollLeft,top:el.scrollTop,width:parseFloat(el.style.getPropertyValue('--explore-width')),mx:parseFloat(el.style.getPropertyValue('--explore-margin-x')),my:parseFloat(el.style.getPropertyValue('--explore-margin-y')),cw:el.clientWidth,ch:el.clientHeight,ratio:el.querySelector('svg').viewBox.baseVal.height/el.querySelector('svg').viewBox.baseVal.width}));
  expect((restored.left+restored.cw/2-restored.mx)/restored.width).toBeCloseTo(defaults.camera.x,2);
  expect((restored.top+restored.ch/2-restored.my)/(restored.width*restored.ratio)).toBeCloseTo(defaults.camera.y,2);
  await section(page).getByRole('button',{name:'Optimize layout',exact:true}).click();await expect(panel).toHaveClass(/explore-stacked/);await expect(section(page).locator('[data-explore-panel=home]')).toBeHidden();
  expect((await raw(page)).page.sections[0].diagram.layouts[1].exploreLayout).toEqual({});
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(saved);
  await stage.screenshot({path:'/tmp/flowview-explore-workbench.png'});
});

test('wheel panning saves once, while a pending pan cannot replace handwritten source',async({page,server})=>{
  await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(named,null,2));await pagePreview(page);
  await section(page).getByRole('button',{name:'Service flow',exact:true}).click();await pagePreview(page);
  const board=section(page).locator('.explore-board');await board.scrollIntoViewIfNeeded();
  const original=await page.locator('#src').inputValue();
  const r=await board.boundingBox();await page.mouse.move(r.x+60,Math.max(150,r.y+100));await page.mouse.wheel(0,160);
  await expect.poll(async()=>((await raw(page)).page.sections[0].diagram.layouts[1].exploreLayout || {}).camera).toBeTruthy();
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);
  await board.scrollIntoViewIfNeeded();const b=await board.boundingBox();await page.mouse.move(b.x+60,Math.max(150,b.y+100));await page.mouse.wheel(0,180);
  const handwritten=original.replace('Porch camera','Camera renamed by hand');
  await page.locator('#src').evaluate((el,text)=>{el.value=text;el.dispatchEvent(new Event('input',{bubbles:true}));},handwritten);
  await page.waitForTimeout(350);await expect(page.locator('#src')).toHaveValue(handwritten);
});

for(const mode of ['default','switched','expanded','fullscreen','arranged','selected','narrow','zoomed','lost-release','lost-held','other-pointer'])test('repeated canvas drags retain the released position: '+mode,async({page,server})=>{
  // Some hosts consume pointerup before the viewport receives it, but still
  // deliver the browser's implicit lostpointercapture with buttons === 0.
  if(mode==='lost-release')await page.addInitScript(()=>window.addEventListener('pointerup',ev=>{if(ev.target.closest('.explore-board'))ev.stopImmediatePropagation();},true));
  if(mode==='narrow')await page.setViewportSize({width:1280,height:800});
  const spec=structuredClone(named);if(mode==='default')spec.page.sections[0].diagram.defaultLayout='service-flow';
  await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(spec,null,2));await pagePreview(page);
  if(mode!=='default')await section(page).getByRole('button',{name:'Service flow',exact:true}).click();await pagePreview(page);
  if(mode==='arranged')await section(page).getByRole('button',{name:'Arrange section',exact:true}).click();
  if(mode==='selected')await section(page).locator('.schip').nth(2).click();
  if(mode==='zoomed')await section(page).getByRole('button',{name:'Zoom in',exact:true}).click();
  if(mode==='expanded'){await page.evaluate(()=>{Element.prototype.requestFullscreen=()=>Promise.reject(Error('Test fallback'));});await section(page).getByRole('button',{name:'Expand diagram view',exact:true}).click();}
  if(mode==='fullscreen'){await section(page).getByRole('button',{name:'Expand diagram view',exact:true}).click();await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(true);}
  const board=section(page).locator('.explore-board');await board.scrollIntoViewIfNeeded();
  const originalBoard=await board.elementHandle();
  const position=()=>board.evaluate(el=>{const r=el.querySelector('svg').getBoundingClientRect();return {x:el.scrollLeft,y:el.scrollTop,svgX:r.x,svgY:r.y,width:r.width,height:r.height};});
  for(let i=0;i<3;i++){
    const b=await board.evaluate(el=>{const r=el.getBoundingClientRect();for(let y=Math.max(100,r.top+100);y<Math.min(innerHeight-120,r.bottom-120);y+=50)for(let x=r.left+30;x<r.right-350;x+=50){const hit=document.elementFromPoint(x,y);if(hit && hit.closest('.explore-board')===el && hit.matches('.explore-board,.boardcanvas,svg,.dv-board-grid'))return {x,y};}throw Error('No empty graph area');});
    const before=await position(),source=await page.locator('#src').inputValue();
    await page.mouse.move(b.x,b.y);await page.mouse.down();await expect(section(page).locator('.section-viewport')).toHaveClass(/viewport-gesturing/);await page.mouse.move(b.x+45,b.y+45,{steps:6});
    const held=await position();expect(held.x).toBeCloseTo(before.x-45,0);expect(held.y).toBeCloseTo(before.y-45,0);
    await page.waitForTimeout(150);expect(await position()).toEqual(held);
    if(mode==='other-pointer'){
      await board.evaluate(el=>{
        el.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:1,button:2,buttons:1}));
        el.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,pointerId:2,buttons:0}));
      });
      await expect(section(page).locator('.section-viewport')).toHaveClass(/viewport-gesturing/);
      await expect(page.locator('#src')).toHaveValue(source);expect(await position()).toEqual(held);
    }
    if(mode==='lost-held'){
      await board.evaluate(el=>el.releasePointerCapture(1));await page.mouse.move(b.x+46,b.y+46);
      await expect(section(page).locator('.section-viewport')).not.toHaveClass(/viewport-gesturing/);
      expect(await position()).toEqual(before);await page.mouse.up();await expect(page.locator('#src')).toHaveValue(source);break;
    }
    await page.mouse.up();await expect(page.locator('#src')).not.toHaveValue(source);
    await page.waitForTimeout(350);expect(await position()).toEqual(held);
    expect(await originalBoard.evaluate(el=>el.isConnected)).toBe(true);
    if(mode==='fullscreen')expect(await page.evaluate(()=>!!document.fullscreenElement)).toBe(true);
    if(mode==='expanded')await expect(section(page).locator('.section-viewport')).toHaveClass(/viewport-expanded/);
  }
});
