import {test,expect,paste} from '../helpers/test.mjs';
import {source} from '../fixtures/editor-spec.mjs';

async function mousePan(page,board){
  await board.getByRole('button',{name:'Fit width',exact:true}).click();
  const pan=board.getByRole('group',{name:'Horizontal diagram scroll'});
  await expect(pan).toBeHidden();
  await board.getByRole('button',{name:'Readable',exact:true}).click();await expect(pan).toBeVisible();
  const slider=pan.getByRole('slider',{name:'Horizontal diagram position'});
  const position=()=>board.evaluate(el=>el.scrollLeft);
  const max=()=>board.evaluate(el=>el.scrollWidth-el.clientWidth);
  const center=await position();expect(center).toBeGreaterThan(0);
  await pan.getByRole('button',{name:'Scroll diagram right',exact:true}).click();
  expect(await position()).toBeGreaterThan(center);
  await slider.focus();await slider.press('Home');await expect.poll(position).toBe(0);
  await expect(pan.getByRole('button',{name:'Scroll diagram left',exact:true})).toBeDisabled();
  // Grab the native range thumb with an ordinary left mouse drag.
  const box=await slider.boundingBox();
  await page.mouse.move(box.x+8,box.y+box.height/2);await page.mouse.down();
  await page.mouse.move(box.x+box.width*.75,box.y+box.height/2,{steps:12});await page.mouse.up();
  expect(await position()).toBeGreaterThan((await max())*.55);
  expect(await position()).toBeLessThan((await max())*.95);
  // Native scrolling keeps the visible control synchronized.
  await board.evaluate(el=>{el.scrollLeft=(el.scrollWidth-el.clientWidth)/4;});
  await expect.poll(async()=>Number(await slider.inputValue())).toBeCloseTo(25,0);
  await slider.press('End');await expect.poll(position).toBe(await max());
  await expect(pan.getByRole('button',{name:'Scroll diagram right',exact:true})).toBeDisabled();
  // The sticky control itself must remain reachable at either edge.
  const bounds=await pan.boundingBox(),frame=await board.boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(frame.x);expect(bounds.x+bounds.width).toBeLessThanOrEqual(frame.x+frame.width);
  await pan.getByRole('button',{name:'Scroll diagram left',exact:true}).click();
  expect(await position()).toBeLessThan(await max());
  await board.getByRole('button',{name:'Fit width',exact:true}).click();await expect(pan).toBeHidden();
}

test('mouse scroll controls work in the workbench without editing the spec or conflicting with node gestures',async({page,server})=>{
  await page.goto(server.origin+'/workbench.html');await paste(page,source);
  const board=page.locator('.board');await mousePan(page,board);
  await expect(page.locator('#src')).toHaveValue(source);
  await page.locator('[data-dv-node="a"]').click();await expect(page.locator('#guide').getByLabel('id',{exact:true})).toHaveValue('a');
  await page.locator('#workspace-columns').focus();await page.locator('#workspace-columns').press('End');
  await board.getByRole('button',{name:'Auto',exact:true}).click();
  await expect(board.getByRole('group',{name:'Horizontal diagram scroll'})).toBeVisible();
  await expect(page.locator('#src')).toHaveValue(source);
});

test('mouse scrolling works in standalone HTML and native Backstage ShadowRoots',async({page,server})=>{
  await page.setViewportSize({width:1000,height:1000});
  await page.goto(server.origin+'/standalone.html');await mousePan(page,page.locator('.board').first());
  await page.goto(server.origin+'/native/index.html');await page.waitForFunction(()=>!!window.__host);
  await page.evaluate(()=>{__host.left(true);__host.right(true);});
  await mousePan(page,page.locator('#alpha .board'));
  await expect(page.locator('#beta').getByRole('button',{name:'Auto',exact:true})).toHaveAttribute('aria-pressed','true');
});
