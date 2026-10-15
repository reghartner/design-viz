import {test,expect,paste,closeTools} from '../helpers/test.mjs';
import {editorSpec} from '../fixtures/editor-spec.mjs';

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
  await expect(page.locator('#guide').getByLabel('title',{exact:true})).toHaveValue('Storage');
  await capture(page,testInfo,`inspect-${width}`);
  // Selection changes while Inspect is open must recheck its placement.
  await page.locator('#editor-tab-outline').click();await page.locator('#outline-search').fill('Doorbell');
  await page.locator('.outline-item').filter({hasText:'node · Doorbell'}).click();await page.locator('#outline-inspect').click();
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
  const title=page.locator('#guide').getByLabel('title',{exact:true});await title.fill('Front door');await title.press('Enter');
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

test('Contents changes, tool restoration and the single dock keep desktop controls usable',async({page,server})=>{
  await page.setViewportSize({width:1280,height:720});await page.goto(server.origin+'/workbench.html');
  const source=JSON.stringify(editorSpec(),null,2);await paste(page,source);
  for(const name of ['brief','layers','steps','outline','json','file']){
    await page.locator('#editor-tab-'+name).click();const win=page.locator('#workspace-window-'+name);
    for(const control of ['.workspace-window-grip','.workspace-window-close','.workspace-window-resize','.workspace-window-dock'])await hit(win.locator(control));
    await win.locator('.workspace-window-close').click();
  }
  await page.getByRole('button',{name:'Close Contents',exact:true}).first().click();await page.locator('#editor-tab-agent').click();
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
