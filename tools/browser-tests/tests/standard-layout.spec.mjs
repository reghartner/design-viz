import {arrangeChapter} from '../helpers/test.mjs';
import {test,expect,paste,prepareEditorSurface} from '../helpers/test.mjs';
import {editorSpec} from '../fixtures/editor-spec.mjs';

function fixture(){
  const raw=editorSpec(),d=raw.page.blocks[0].diagram;
  d.layouts[0].sectionLayout.default=[{x:0,y:0,w:8,h:12},
    {panel:'home',x:8,y:24,w:4,h:8},
    {controls:'steps',attachTo:'diagram',x:0,y:12,w:8,h:4}];
  return raw;
}
async function open(page,server,raw=fixture()){
  await page.setViewportSize({width:1500,height:800});
  const source=JSON.stringify(raw);
  await page.goto(server.origin+'/workbench.html');await paste(page,source);await prepareEditorSurface(page);
  await arrangeChapter(page);
  await page.evaluate(()=>document.fonts.ready);
  return source;
}
const settle=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));

for(const attached of [true,false])test(`Standard diagram grows beyond the viewport cap with ${attached?'attached':'detached'} controls`,async({page,server})=>{
  const raw=fixture(),d=raw.page.blocks[0].diagram;
  d.rows=[['a'],['b'],['c']];
  for(let i=0;i<12;i++){const id='extra'+i;d.nodes[id]={title:'Service '+i};d.rows.push([id]);}
  if(!attached)delete d.layouts[0].sectionLayout.default[2].attachTo;
  await open(page,server,raw);
  const tile=page.locator('[data-layout-key="diagram"]');let previous;
  for(const height of [24,32]){
    await page.getByRole('spinbutton',{name:'Height',exact:true}).fill(String(height));
    await page.getByRole('button',{name:'Apply size / position',exact:true}).click();
    const sizes=await tile.evaluate(el=>{
      const col=el.querySelector('.diagramcol').getBoundingClientRect();
      const board=el.querySelector('.board').getBoundingClientRect();
      const controls=el.querySelector('.termbar')?.getBoundingClientRect(),mode=el.querySelector('.playback-mode-rail')?.getBoundingClientRect();
      const drawing=el.querySelector('.boardcanvas>svg').getBoundingClientRect();
      const margins=Array.from(el.querySelector('.diagramcol').children).reduce((sum,child)=>{
        const style=getComputedStyle(child);return sum+parseFloat(style.marginTop)+parseFloat(style.marginBottom);
      },0);
      return {available:col.height-(controls?.height || 0)-(mode?.height || 0)-margins,board:board.height,
        revealed:Math.min(board.bottom,drawing.bottom)-Math.max(board.top,drawing.top)};
    });
    expect(sizes.board).toBeGreaterThan(800*.7);
    expect(Math.abs(sizes.available-sizes.board)).toBeLessThan(2);
    if(previous){expect(sizes.board-previous.board).toBeCloseTo(8*40,0);expect(sizes.revealed).toBeGreaterThan(previous.revealed+200);}
    previous=sizes;
  }
});

for(const stacked of [false,true])test(`bottom panel ${stacked?'overlapping another tile':'beside the diagram'} follows an upward drag and saves one Undo`,async({page,server})=>{
  const raw=fixture(),items=raw.page.blocks[0].diagram.layouts[0].sectionLayout.default;
  if(stacked){items[0].h=24;items[1].x=0;items[1].w=8;}
  const source=await open(page,server,raw);
  await page.getByRole('button',{name:'Hide arrangement controls',exact:true}).click();
  const disclosure=page.locator('[data-arrange-disclosure]'),fields=page.locator('.section-arrange-fields');
  await expect(disclosure).toHaveText('Show arrangement controls');await expect(disclosure).toHaveAttribute('aria-expanded','false');await expect(fields).toBeHidden();
  const tile=page.locator('[data-layout-key="panel:home"]'),handle=tile.locator('.section-tile-move');
  await handle.scrollIntoViewIfNeeded();
  await page.locator('.workmain').evaluate(el=>{el.scrollTop=el.scrollHeight;});await settle(page);
  const box=await handle.boundingBox(),x=box.x+box.width/2,y=box.y+box.height/2;
  await page.mouse.move(x,y);await page.mouse.down();
  for(let rows=1;rows<=6;rows++){
    await page.mouse.move(x,y-rows*40);await settle(page);
    expect(await tile.evaluate(el=>Number(el.style.getPropertyValue('--tile-y')))).toBe(25-rows);
    // A stationary pointer must not keep moving the panel after layout settles.
    await page.mouse.move(x,y-rows*40);await settle(page);
    expect(await tile.evaluate(el=>Number(el.style.getPropertyValue('--tile-y')))).toBe(25-rows);
  }
  await page.mouse.up();
  const saved=JSON.parse(await page.locator('#src').inputValue());
  expect(saved.page.blocks[0].diagram.layouts[0].sectionLayout.default.find(it=>it.panel==='home').y).toBe(18);
  const savedText=await page.locator('#src').inputValue();
  await expect(disclosure).toHaveText('Show arrangement controls');await expect(disclosure).toHaveAttribute('aria-expanded','false');await expect(fields).toBeHidden();
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(source);await expect(disclosure).toHaveText('Show arrangement controls');await expect(fields).toBeHidden();
  await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(savedText);await expect(disclosure).toHaveText('Show arrangement controls');await expect(fields).toBeHidden();
  await handle.focus();await page.keyboard.press('ArrowUp');const nudged=await page.locator('#src').inputValue();expect(nudged).not.toBe(savedText);
  await expect(disclosure).toHaveText('Show arrangement controls');await expect(disclosure).toHaveAttribute('aria-expanded','false');await expect(fields).toBeHidden();
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(savedText);await expect(fields).toBeHidden();
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(source);
  await expect(page.locator('#undo-builder')).toBeDisabled();
  // Escape restores geometry and removes the temporary scroll-range floor.
  await handle.scrollIntoViewIfNeeded();const next=await handle.boundingBox();
  await page.mouse.move(next.x+next.width/2,next.y+next.height/2);await page.mouse.down();
  await page.mouse.move(next.x+next.width/2,next.y+next.height/2-80);await settle(page);
  await page.keyboard.press('Escape');await page.mouse.up();
  await expect(page.locator('#src')).toHaveValue(source);
  expect(await tile.evaluate(el=>Number(el.style.getPropertyValue('--tile-y')))).toBe(25);
  expect(await page.locator('.section-layout-grid').evaluate(el=>el.style.minHeight)).toBe('');
  await expect(page.locator('.layout-dragging')).toHaveCount(0);
  await disclosure.click();await expect(disclosure).toHaveText('Hide arrangement controls');await expect(disclosure).toHaveAttribute('aria-expanded','true');await expect(fields).toBeVisible();
  await handle.focus();await page.keyboard.press('ArrowUp');await expect(disclosure).toHaveText('Hide arrangement controls');await expect(fields).toBeVisible();
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(source);await expect(fields).toBeVisible();
  await page.getByRole('button',{name:'Done arranging',exact:true}).click();await arrangeChapter(page);
  await expect(disclosure).toHaveText('Hide arrangement controls');await expect(disclosure).toHaveAttribute('aria-expanded','true');await expect(fields).toBeVisible();
});
