import {canvasTools} from '../helpers/test.mjs';
import {readFile} from 'node:fs/promises';
import {test,expect,paste} from '../helpers/test.mjs';
import {source,editorSpec} from '../fixtures/editor-spec.mjs';

async function open(page,server,text=source){await page.goto(server.origin+'/workbench.html');await paste(page,text);}
async function expectCenterHit(locator,label){
  await expect(locator,label).toBeVisible();
  const result=await locator.evaluate(el=>{
    const rect=el.getBoundingClientRect(),hit=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);
    return {reachable:hit===el || el.contains(hit),rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},hit:hit && (hit.id || hit.className || hit.tagName)};
  });
  expect(result,label+' center is reachable').toMatchObject({reachable:true});
  expect(result.rect.width,label+' has width').toBeGreaterThan(0);expect(result.rect.height,label+' has height').toBeGreaterThan(0);
}

test('floating tools leave the diagram full-window and global actions available',async({page,server})=>{
  const raw=editorSpec();raw.page.blocks[0].diagram.layouts.forEach(view=>view.presentation='explore');
  await open(page,server,JSON.stringify(raw,null,2));
  const size=page.viewportSize();
  const shell=await page.locator('.workbench-diagram-canvas').boundingBox(),nav=await page.locator('.explore-navigation').boundingBox();
  const stage=await page.locator('.explore-stage').boundingBox(),board=await page.locator('.explore-board').boundingBox();
  const contentTop=await page.locator('body').evaluate(el=>parseFloat(getComputedStyle(el).getPropertyValue('--workspace-content-top')));expect(contentTop).toBe(Math.ceil(nav.y+nav.height+10));expect(shell).toEqual({x:84,y:contentTop,width:size.width-96,height:size.height-contentTop-12});expect(stage.y).toBeGreaterThanOrEqual(nav.y+nav.height);
  expect(board).toEqual(stage);
  await expect(page.locator('#workspace-columns')).toBeHidden();
  for(const name of ['inspect','steps','outline','json','file']){
    await page.locator('#editor-tab-'+name).click();await expect(page.locator('#editor-'+name)).toBeVisible();
    for(const id of ['diagram-add','undo-builder','redo-builder','file-save'])await expect(page.locator('#'+id)).toBeInViewport();
  }
  await expect(page.locator('.editor-pane:visible')).toHaveCount(5);
  await canvasTools(page);await page.locator('#workspace-panels').click();await expect(page.locator('.editor-pane:visible')).toHaveCount(0);
});

test('fresh desktop entry leaves Standard and Explore controls clear until selection opens Inspect',async({page,server},testInfo)=>{
  const onboarding=JSON.parse(await readFile(new URL('../../../src/starters/onboarding.json',import.meta.url),'utf8'));
  const pixel='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4UYAAAAASUVORK5CYII=';
  onboarding.page.sections[0].diagram.panels.flatMap(panel=>panel.screens || []).forEach(screen=>{screen.src=pixel;});
  const onboardingSource=JSON.stringify(onboarding);
  let entry=0;
  async function fresh(width){
    await page.setViewportSize({width,height:900});await page.goto(server.origin+'/workbench.html');await page.evaluate(()=>localStorage.clear());
    await page.goto(server.origin+'/workbench.html?issue-340='+(++entry));await paste(page,onboardingSource);
    await expect(page.locator('#workspace-window-inspect')).toBeHidden();
  }
  for(const width of [1280,1440,1920]){
    await fresh(width);
    const story=page.locator('.section-layout-grid').filter({visible:true});
    const ambient=story.getByRole('button',{name:'AMBIENT',exact:true}),step=story.getByRole('button',{name:'STEP',exact:true});
    await expectCenterHit(ambient,'Standard AMBIENT at '+width);await ambient.click();await expect(ambient).toHaveAttribute('aria-pressed','true');
    await expectCenterHit(step,'Standard STEP at '+width);await step.click();await expect(step).toHaveAttribute('aria-pressed','true');
    await expectCenterHit(story.locator('.ptitle').filter({hasText:'Resident app'}),'Standard Resident app at '+width);
    if(width===1280)await testInfo.attach('fresh-standard-1280',{body:await page.screenshot(),contentType:'image/png'});

    await fresh(width);await page.locator('#docview [data-view-layout][data-layout-id="explore"]').filter({visible:true}).click();
    const controls=page.locator('.explore-player').filter({visible:true}),device=page.locator('.explore-window').filter({has:page.locator('.pt-deviceapp'),visible:true}),app=page.locator('.explore-window').filter({has:page.locator('.pt-appscreens'),visible:true});
    await expectCenterHit(controls,'Explore story controls at '+width);
    await expectCenterHit(device,'Explore Camera details at '+width);
    await expectCenterHit(app,'Explore Resident app at '+width);
    const before=await page.locator('#src').inputValue();await device.locator('.pwidget').click({position:{x:40,y:80}});
    await expect(page.locator('#workspace-window-inspect')).toBeVisible();await expect(page.locator('#guide').getByLabel('Title',{exact:true})).toHaveValue('Camera details');
    await expect(page.locator('#src')).toHaveValue(before);await expect(page.locator('#undo-builder')).toBeDisabled();
    if(width===1280)await testInfo.attach('fresh-explore-1280-after-selection',{body:await page.screenshot(),contentType:'image/png'});
  }
  await page.locator('#workspace-window-inspect .workspace-window-close').click();await page.reload();
  await expect(page.locator('#workspace-window-inspect')).toBeHidden();await page.locator('#docview .node').first().click();
  await expect(page.locator('#workspace-window-inspect')).toBeHidden();
});

test('window resize preserves the JSON draft and the live preview DOM',async({page,server})=>{
  await open(page,server);await page.locator('#editor-tab-json').click();
  const src=page.locator('#src'),draft=source+'\n  ';await src.fill(draft);
  const sourceHandle=await src.elementHandle(),preview=await page.locator('#docview .doc-sec').first().elementHandle();
  const win=page.locator('#workspace-window-json'),before=await win.boundingBox();
  await win.locator('.workspace-window-resize').focus();await page.keyboard.press('Shift+ArrowLeft');
  expect((await win.boundingBox()).width).toBeCloseTo(before.width-50,0);
  await expect(src).toHaveValue(draft);expect(await sourceHandle.evaluate(el=>el.isConnected)).toBe(true);expect(await preview.evaluate(el=>el.isConnected)).toBe(true);
  await win.locator('.workspace-window-close').click();await page.locator('#editor-tab-json').click();await expect(src).toHaveValue(draft);
  await page.locator('#editor-tab-file').click();await page.locator('.workspace-preferences summary').click();await page.locator('#workspace-reset').click();
  expect((await win.boundingBox()).width).toBeCloseTo(before.width,0);
  await sourceHandle.dispose();await preview.dispose();
});

test('outline shortcut and selection stay in Outline; explicit inspection opens the selected object',async({page,server})=>{
  await open(page,server);await page.locator('#editor-tab-json').click();
  await page.keyboard.press('ControlOrMeta+k');await expect(page.locator('#editor-outline')).toBeVisible();await expect(page.locator('#outline-search')).toBeFocused();
  await page.locator('#outline-search').fill('Doorbell');await page.locator('.outline-item').filter({hasText:'node · Doorbell'}).click();
  await expect(page.locator('#editor-outline')).toBeVisible();await page.locator('#outline-inspect').click();
  const title=page.locator('#guide').getByLabel('title',{exact:true});await expect(title).toHaveValue('Doorbell');
  await title.fill('Front camera');await title.press('Enter');await expect(title).toBeFocused();
  await page.locator('#editor-tab-file').click();await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(source);
  await page.locator('#redo-builder').click();expect(JSON.parse(await page.locator('#src').inputValue()).page.blocks[0].diagram.nodes.a.title).toBe('Front camera');
});

test('File hosts company catalog, imports and exports; global Save works from JSON',async({page,server})=>{
  await open(page,server);await page.locator('#editor-tab-file').click();
  await page.locator('#editor-company summary').click();await expect(page.getByRole('textbox',{name:'Catalog JSON',exact:true})).toBeVisible();
  await page.locator('#sec-insert > summary').click();await page.locator('#import-mermaid').click();await expect(page.locator('#importbox')).toBeVisible();
  await page.locator('#editor-tab-json').click();await page.locator('#editor-tab-file').click();await expect(page.locator('#importbox')).toBeVisible();
  await page.locator('#import-mermaid-cancel').click();
  const exportedPromise=page.waitForEvent('download');await page.locator('#confluence-export').click();const exported=await exportedPromise;
  expect(exported.suggestedFilename()).toContain('confluence');expect(JSON.parse(await readFile(await exported.path(),'utf8'))).toBeTruthy();
  await page.locator('#editor-tab-json').click();const savePromise=page.waitForEvent('download');await page.locator('#file-save').click();const saved=await savePromise;
  expect(JSON.parse(await readFile(await saved.path(),'utf8')).page.title).toBe(editorSpec().page.title);
});

test('top Home and File keep project navigation and exports reachable at desktop width',async({page,server})=>{
  await page.setViewportSize({width:1280,height:800});await open(page,server);const original=await page.locator('#src').inputValue();
  const home=page.locator('#workspace-home'),file=page.locator('#workspace-file');
  await expect(home).toHaveText('Home');await expectCenterHit(home,'top Home');await expectCenterHit(file,'top File');
  await file.click();await expect(page.locator('#workspace-window-file')).toBeVisible();await expect(page.locator('#file-export')).toBeVisible();await expect(page.locator('#editor-tab-file')).toBeFocused();
  await page.locator('.workspace-preferences summary').click();await page.locator('#workspace-preset').selectOption('present');await expect(page.locator('.workspace-window:visible')).toHaveCount(0);
  await file.click();await expect(page.locator('#workspace-window-file')).toBeVisible();await expect(page.locator('#file-export')).toBeVisible();await expect(page.locator('#src')).toHaveValue(original);
  const download=page.waitForEvent('download');await page.locator('#file-save').click();const saved=await download;
  expect(JSON.parse(await readFile(await saved.path(),'utf8')).page.title).toBe(editorSpec().page.title);await expect(page.locator('#src')).toHaveValue(original);
  await home.click();await expect(page.locator('#welcome-home')).toBeVisible();await expect(page.locator('#workbench-workspace')).toBeHidden();
});

test('wide step inspectors share space with nested panel controls and retain their state when changing tools',async({page,server},testInfo)=>{
  await page.setViewportSize({width:1800,height:1100});await open(page,server);
  await page.locator('#editor-tab-steps').click();await page.locator('#steps-list [data-step-index="0"]').click();await page.locator('#steps-inspect').click();
  const win=page.locator('#workspace-window-inspect');await win.locator('.workspace-window-grip').focus();for(let i=0;i<9;i++)await page.keyboard.press('Shift+ArrowLeft');await win.locator('.workspace-window-resize').focus();for(let i=0;i<9;i++)await page.keyboard.press('Shift+ArrowRight');
  const story=await page.locator('.step-form-story').boundingBox(),panels=await page.locator('.step-form-panels').boundingBox();
  expect(panels.x).toBeGreaterThan(story.x);expect(Math.abs(panels.y-story.y)).toBeLessThan(2);
  const sourceBefore=await page.locator('#src').inputValue();
  const fold=page.locator('.step-form-panels .panel-step-group');await fold.locator(':scope > summary').click();
  await page.locator('#editor-tab-json').click();await page.locator('#editor-tab-inspect').click();await expect(fold).toHaveAttribute('open','');
  await expect(page.locator('#src')).toHaveValue(sourceBefore);
  await testInfo.attach('wide-step-editor',{body:await page.screenshot(),contentType:'image/png'});
  await fold.locator(':scope > summary').click();await expect(fold).not.toHaveAttribute('open','');
  const caption=page.locator('#guide').getByLabel('text',{exact:true});await caption.fill('Edited while Home is collapsed');await caption.press('Tab');
  await expect(page.locator('.panel-step-group')).not.toHaveAttribute('open','');
  expect(JSON.parse(await page.locator('#src').inputValue()).page.blocks[0].diagram.steps[0].text).toBe('Edited while Home is collapsed');
  await page.locator('#workspace-home').click();await paste(page,source);
  await page.locator('#editor-tab-steps').click();await page.locator('#steps-list [data-step-index="0"]').click();await page.locator('#steps-inspect').click();
  await expect(page.locator('.panel-step-group')).not.toHaveAttribute('open','');
  for(const width of [1280,1024,820,720]){
    await page.setViewportSize({width,height:900});
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),{message:'Workspace fits '+width+'px after responsive layout settles'}).toBe(true);
  }
});

test('panel disclosure state is independent between sections with the same panel ID',async({page,server})=>{
  const spec=editorSpec();spec.page.blocks.push(structuredClone(spec.page.blocks[0]));spec.page.blocks[1].heading='Other delivery';
  await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(spec));
  const inspectStep=async section=>{
    await page.locator('#editor-tab-steps').click();await page.locator('#steps-section').selectOption(String(section));
    await page.locator('#steps-list [data-step-index="0"]').click();await page.locator('#steps-inspect').click();
  };
  await inspectStep(0);await expect(page.locator('.panel-step-group')).not.toHaveAttribute('open','');
  await page.locator('.panel-step-group > summary').click();await expect(page.locator('.panel-step-group')).toHaveAttribute('open','');
  await inspectStep(1);await expect(page.locator('.panel-step-group')).not.toHaveAttribute('open','');
  await inspectStep(0);await expect(page.locator('.panel-step-group')).not.toHaveAttribute('open','');
});
