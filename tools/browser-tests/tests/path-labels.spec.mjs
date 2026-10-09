import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';

const shared=await readFile(path.join(repo,'examples/kestrel-overnight/story.spec.json'),'utf8');
const ordinary=await readFile(path.join(repo,'examples/flowview-product-tour/flowview-product-tour.spec.json'),'utf8');

async function standalone(page,server,name,source){
  await writeFile(path.join(server.root,name+'.json'),source);
  execFileSync('python3',[path.join(repo,'tools/inject.py'),path.join(server.root,name+'.json'),path.join(repo,'template/flowview.html'),path.join(server.root,name+'.html')]);
  await page.goto(server.origin+'/'+name+'.html');
  return page.locator('.docview');
}

async function constrain(scroller,width=360){
  await scroller.evaluate((element,width)=>{
    Object.assign(element.style,{width:width+'px',maxWidth:width+'px',flex:'0 0 '+width+'px'});
  },width);
}

async function focusedStepGeometry(scroller){
  return scroller.evaluate(element=>{
    const frame=element.getBoundingClientRect(),button=document.activeElement?.getBoundingClientRect();
    const rail=element.querySelector('.path-timeline-labels');
    const paintedRight=rail?rail.getBoundingClientRect().right:
      Math.max(...[...element.querySelectorAll('.path-chip')].map(label=>label.getBoundingClientRect().right));
    return {frame:{left:frame.left,right:frame.right},paintedRight,
      button:button&&{left:button.left,right:button.right}};
  });
}

async function expectFocusedStepClear(scroller){
  const geometry=await focusedStepGeometry(scroller);
  expect(geometry.button.left).toBeGreaterThanOrEqual(geometry.paintedRight+7);
  expect(geometry.button.right).toBeLessThanOrEqual(geometry.frame.right+1);
}

async function expectActiveStepClear(scroller){
  const geometry=await scroller.evaluate(element=>{
    const frame=element.getBoundingClientRect(),button=element.querySelector('.schip[aria-current="true"]').getBoundingClientRect();
    const rail=element.querySelector('.path-timeline-labels');
    const paintedRight=rail?rail.getBoundingClientRect().right:
      Math.max(...[...element.querySelectorAll('.path-chip')].map(label=>label.getBoundingClientRect().right));
    return {frame:{right:frame.right},paintedRight,button:{left:button.left,right:button.right}};
  });
  expect(geometry.button.left).toBeGreaterThanOrEqual(geometry.paintedRight+7);
  expect(geometry.button.right).toBeLessThanOrEqual(geometry.frame.right+1);
}

async function expectLastStepReachable(scroller){
  const geometry=await scroller.evaluate(element=>{
    element.scrollLeft=element.scrollWidth;
    const frame=element.getBoundingClientRect(),labels=[...element.querySelectorAll('.path-chip')],rail=element.querySelector('.path-timeline-labels');
    const button=[...element.querySelectorAll('.schip')].at(-1).getBoundingClientRect();
    return {frame:{left:frame.left,right:frame.right},paintedRight:rail?rail.getBoundingClientRect().right:Math.max(...labels.map(label=>label.getBoundingClientRect().right)),
      button:{left:button.left,right:button.right}};
  });
  expect(geometry.button.left).toBeGreaterThanOrEqual(geometry.paintedRight+7);
  expect(geometry.button.right).toBeLessThanOrEqual(geometry.frame.right+1);
}

async function traverseIntermediateSteps(page,scroller,count){
  for(let index=0;index<count;index++){
    await page.keyboard.press('Shift+Tab');await expect(page.locator(':focus')).toHaveClass(/schip/);
    await expectFocusedStepClear(scroller);await page.keyboard.press('Enter');
    await expect(page.locator(':focus')).toHaveAttribute('aria-current','true');await expectFocusedStepClear(scroller);
  }
}

async function expectScaledKeyboardReveal(page,scroller,last){
  await scroller.evaluate(element=>{
    element.style.transform='scale(.75)';element.style.transformOrigin='left top';element.scrollLeft=element.scrollWidth;
  });
  await last.evaluate(button=>button.focus({preventScroll:true}));await page.keyboard.press('Shift+Tab');
  await expect(page.locator(':focus')).toHaveClass(/schip/);await expectFocusedStepClear(scroller);
  await scroller.evaluate(element=>{element.style.transform='';element.style.transformOrigin='';});
}

async function scrollToLateStep(scroller,pathCount){
  await scroller.evaluate(element=>{element.scrollLeft=element.scrollWidth;});
  const geometry=await scroller.evaluate(element=>{
    const frame=element.getBoundingClientRect();
    const labels=[...element.querySelectorAll('.path-chip')].map(button=>{
      const rect=button.getBoundingClientRect();return {left:rect.left,right:rect.right};
    });
    const rail=element.querySelector('.path-timeline-labels');
    const active=element.querySelector('.schip[aria-current="true"]')?.getBoundingClientRect();
    return {scrollLeft:element.scrollLeft,frame:{left:frame.left,right:frame.right},labels,
      paintedRight:rail?rail.getBoundingClientRect().right:Math.max(...labels.map(label=>label.right)),active:active&&{left:active.left,right:active.right}};
  });
  expect(geometry.scrollLeft).toBeGreaterThan(50);
  expect(geometry.labels.length).toBe(pathCount);
  for(const label of geometry.labels){
    expect(label.left).toBeGreaterThanOrEqual(geometry.frame.left-1);
    expect(label.right).toBeLessThanOrEqual(geometry.frame.right+1);
  }
  expect(geometry.active.left).toBeGreaterThanOrEqual(geometry.paintedRight+7);
}

test('shared timeline keeps one usable path control rail while late steps scroll',async({page,server},testInfo)=>{
  const root=await standalone(page,server,'path-labels-shared',shared);
  const timeline=root.locator('.path-timeline'),scroller=timeline.locator('..');
  await expect(timeline).toHaveCount(1);
  await timeline.locator('[data-dv-path="wifi-down"]').click();
  await timeline.locator('.schip').last().click();
  await page.screenshot({path:testInfo.outputPath('shared-labels-wide.png'),fullPage:true});
  expect(await scroller.evaluate(element=>element.scrollWidth<=element.clientWidth+1)).toBe(true);
  await constrain(scroller);
  await scrollToLateStep(scroller,2);
  await page.screenshot({path:testInfo.outputPath('shared-labels-late.png'),fullPage:true});
  await traverseIntermediateSteps(page,scroller,5);
  await expectScaledKeyboardReveal(page,scroller,timeline.locator('.schip').last());
  for(const width of [220,240,260,280]){
    await constrain(scroller,width);await timeline.locator('.schip').last().click();await expectLastStepReachable(scroller);
    if(width===220)for(let previous=0;previous<4;previous++){
      await root.getByRole('button',{name:'Previous step',exact:true}).click();await expectActiveStepClear(scroller);
    }
    if(width===220)await page.screenshot({path:testInfo.outputPath('shared-labels-220.png'),fullPage:true});
  }
  await root.locator('[data-dv-path="normal"]').focus();await page.keyboard.press('Enter');
  await expect(root.locator('[data-dv-path="normal"]')).toHaveAttribute('aria-pressed','true');
  await expect(root.locator('.schip[aria-current="true"]')).toHaveText('1');
  await expect.poll(()=>scroller.evaluate(element=>element.scrollLeft)).toBe(0);
});

test('ordinary path matrix keeps one usable path control rail while late steps scroll',async({page,server},testInfo)=>{
  const root=await standalone(page,server,'path-labels-matrix',ordinary);
  const matrix=root.locator('.path-matrix').first(),scroller=matrix.locator('..');
  await expect(matrix).toHaveCount(1);
  await matrix.locator('[data-dv-path="trace"]').click();
  await matrix.locator('[data-path-row="trace"] .schip').last().click();
  await page.screenshot({path:testInfo.outputPath('matrix-labels-wide.png'),fullPage:true});
  expect(await scroller.evaluate(element=>element.scrollWidth<=element.clientWidth+1)).toBe(true);
  await constrain(scroller);
  await scrollToLateStep(scroller,3);
  await page.screenshot({path:testInfo.outputPath('matrix-labels-late.png'),fullPage:true});
  await traverseIntermediateSteps(page,scroller,7);
  await expectScaledKeyboardReveal(page,scroller,matrix.locator('.schip').last());
  for(const width of [220,240,260,280]){
    await constrain(scroller,width);await matrix.locator('.schip').last().click();await expectLastStepReachable(scroller);
    if(width===220)await page.screenshot({path:testInfo.outputPath('matrix-labels-220.png'),fullPage:true});
  }
  await matrix.locator('[data-dv-path="story"]').focus();await page.keyboard.press('Enter');
  await expect(matrix.locator('[data-dv-path="story"]')).toHaveAttribute('aria-pressed','true');
  await expect(matrix.locator('.schip[aria-current="true"]')).toHaveText('1');
  await expect.poll(()=>scroller.evaluate(element=>element.scrollLeft)).toBe(0);
  await matrix.locator('[data-path-row="story"] .schip').first().focus();await expectFocusedStepClear(scroller);
});
