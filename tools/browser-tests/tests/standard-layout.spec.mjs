import {test,expect,paste,pagePreview} from '../helpers/test.mjs';
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
  await page.goto(server.origin+'/workbench.html');await paste(page,source);await pagePreview(page);
  await page.getByRole('button',{name:'Arrange section',exact:true}).click();
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
      const controls=el.querySelector('.termbar')?.getBoundingClientRect();
      const drawing=el.querySelector('.boardcanvas>svg').getBoundingClientRect();
      const margins=Array.from(el.querySelector('.diagramcol').children).reduce((sum,child)=>{
        const style=getComputedStyle(child);return sum+parseFloat(style.marginTop)+parseFloat(style.marginBottom);
      },0);
      return {available:col.height-(controls?.height || 0)-margins,board:board.height,
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
});
