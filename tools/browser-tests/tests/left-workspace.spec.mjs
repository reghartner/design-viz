import {projectSource,useProjectDownloads} from '../helpers/project-export.mjs';
import {canvasTools} from '../helpers/test.mjs';
import {readFile} from 'node:fs/promises';
import {test,expect,paste} from '../helpers/test.mjs';
import {source,editorSpec} from '../fixtures/editor-spec.mjs';

test.beforeEach(useProjectDownloads);

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
async function expectTabReachable(page,locator,label,limit=30){
  const visited=[];
  for(let i=0;i<limit;i++){
    await page.keyboard.press('Tab');
    if(await locator.evaluate(el=>document.activeElement===el)){await expectCenterHit(locator,label+' after Tab');return;}
    visited.push(await page.evaluate(()=>document.activeElement && (document.activeElement.id || document.activeElement.getAttribute('aria-label') || document.activeElement.tagName)));
  }
  expect(await locator.evaluate(el=>document.activeElement===el),label+' is reachable with Tab; visited '+visited.join(', ')).toBe(true);
}

test('floating tools leave the diagram full-window and global actions available',async({page,server})=>{
  const raw=editorSpec();raw.page.blocks[0].diagram.layouts.forEach(view=>view.presentation='explore');
  await open(page,server,JSON.stringify(raw,null,2));
  const size=page.viewportSize();
  const shell=await page.locator('.workbench-diagram-canvas').boundingBox(),nav=await page.locator('.explore-navigation').boundingBox();
  const stage=await page.locator('.explore-stage').boundingBox(),board=await page.locator('.explore-board').boundingBox();
  const chrome=await page.locator('body').evaluate(el=>({top:parseFloat(getComputedStyle(el).getPropertyValue('--workspace-content-top')),inset:parseFloat(getComputedStyle(el).getPropertyValue('--reader-host-inset'))||0}));expect(chrome.top).toBe(Math.ceil(nav.y+nav.height+10));expect(shell).toEqual({x:84+chrome.inset,y:chrome.top,width:size.width-96-chrome.inset,height:size.height-chrome.top-12});expect(stage.y).toBeGreaterThanOrEqual(nav.y+nav.height);
  expect(board).toEqual(stage);
  await expect(page.locator('#workspace-columns')).toBeHidden();
  for(const name of ['inspect','steps','outline','json','file']){
    await page.locator('#editor-tab-'+name).click();await expect(page.locator('#editor-'+name)).toBeVisible();
    for(const id of ['diagram-add','undo-builder','redo-builder','workspace-export-trigger'])await expect(page.locator('#'+id)).toBeInViewport();
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
    const ambient=story.getByRole('button',{name:/^ambient$/i}),step=story.getByRole('button',{name:/^step$/i});
    await expectCenterHit(ambient,'Standard AMBIENT at '+width);await ambient.click();await expect(ambient).toHaveAttribute('aria-pressed','true');
    await expectCenterHit(step,'Standard STEP at '+width);await step.click();await expect(step).toHaveAttribute('aria-pressed','true');
    await expectCenterHit(story.locator('.ptitle').filter({hasText:'Resident app'}),'Standard Resident app at '+width);
    if(width===1280)await testInfo.attach('fresh-standard-1280',{body:await page.screenshot(),contentType:'image/png'});

    await fresh(width);await page.locator('#docview > .explore-navigation').getByRole('button',{name:'System flow',exact:true}).click();
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

test('Steps opens on rows and preserves the list while filtering, inspecting and changing paths',async({page,server},testInfo)=>{
  const raw=editorSpec(),diagram=raw.page.blocks[0].diagram;
  diagram.steps=Array.from({length:16},(_,index)=>({
    id:'beat-'+(index+1),text:'Checkpoint '+(index+1)+' — a deliberately long caption keeps the customer outcome and the system response readable in the list',
    nodes:index%2?['b']:['a']
  }));
  diagram.paths=[
    {id:'main',label:'Main path',steps:diagram.steps.map(step=>step.id)},
    {id:'alternate',label:'Alternate recovery',steps:['beat-1','beat-2','beat-11','beat-12','beat-13']}
  ];
  await page.setViewportSize({width:1280,height:720});await open(page,server,JSON.stringify(raw,null,2));
  await page.locator('#editor-tab-steps').click();
  const win=page.locator('#workspace-window-steps'),pane=page.locator('#editor-steps'),list=page.locator('#steps-list');
  await expect(win).toBeVisible();await expect(page.locator('#steps-path-settings')).not.toHaveAttribute('open','');
  const geometry=await page.evaluate(()=>{
    const pane=document.querySelector('#editor-steps').getBoundingClientRect(),list=document.querySelector('#steps-list').getBoundingClientRect();
    const rows=[...document.querySelectorAll('#steps-list .story-step')].filter(row=>{const r=row.getBoundingClientRect();return r.bottom>list.top && r.top<list.bottom;});
    return {pane:{height:pane.height},list:{height:list.height},visibleRows:rows.length};
  });
  expect(geometry.visibleRows).toBeGreaterThanOrEqual(3);expect(geometry.list.height).toBeGreaterThan(120);
  expect(geometry.list.height).toBeGreaterThan(geometry.pane.height*.5);
  for(const id of ['steps-add','steps-duplicate','steps-fork','steps-inspect'])await expectCenterHit(page.locator('#'+id),id+' at 1280×720');
  const more=page.locator('.story-more-actions>summary');await expectCenterHit(more,'More step actions at 1280×720');await more.focus();await page.keyboard.press('Enter');
  await expect(page.locator('#steps-earlier')).toBeVisible();await page.keyboard.press('Enter');await expect(page.locator('#steps-earlier')).toBeHidden();
  await testInfo.attach('steps-initial-1280x720',{body:await win.screenshot(),contentType:'image/png'});

  const search=page.locator('#steps-search');await search.focus();await page.keyboard.type('checkpoint 11');
  await expect(list.locator('.story-step')).toHaveCount(1);await expect(list.locator('.story-caption')).toContainText('deliberately long caption');
  await testInfo.attach('steps-filtered-long-caption',{body:await win.screenshot(),contentType:'image/png'});
  await search.press('ControlOrMeta+a');await search.press('Backspace');await expect(list.locator('.story-step')).toHaveCount(16);

  const selected=list.locator('[data-step-index="12"]');await selected.click();await expect(selected).toHaveAttribute('aria-current','step');
  const scrollBefore=await list.evaluate(node=>node.scrollTop);expect(scrollBefore).toBeGreaterThan(0);
  await page.locator('#steps-inspect').click();await expect(page.locator('#workspace-window-inspect')).toBeVisible();
  expect(await list.evaluate(node=>node.scrollTop)).toBe(scrollBefore);await expect(selected).toHaveAttribute('aria-current','step');
  await page.locator('#workspace-window-inspect .workspace-window-close').click();await expect(selected).toHaveAttribute('aria-current','step');

  await page.locator('#steps-path').selectOption('alternate');await expect(list.locator('.story-step')).toHaveCount(5);
  const alternateSelected=list.locator('[data-step-index="12"]');await alternateSelected.click();await expect(alternateSelected).toHaveAttribute('aria-current','step');
  const pathSettings=page.locator('#steps-path-settings');await pathSettings.locator(':scope > summary').focus();await page.keyboard.press('Enter');
  await expect(pathSettings).toHaveAttribute('open','');
  const expanded=await page.evaluate(()=>{
    const pane=document.querySelector('#editor-steps'),list=document.querySelector('#steps-list').getBoundingClientRect();
    return {listHeight:list.height,paneScrollHeight:pane.scrollHeight,paneClientHeight:pane.clientHeight};
  });
  expect(expanded.listHeight).toBeGreaterThanOrEqual(120);expect(expanded.paneScrollHeight).toBeLessThanOrEqual(expanded.paneClientHeight+1);
  const expandedControls=['steps-path-label','steps-path-color','steps-path-base','steps-path-save','steps-path-remove'];
  for(const id of expandedControls){await page.locator('#'+id).scrollIntoViewIfNeeded();await expectCenterHit(page.locator('#'+id),id+' with Path settings expanded');}
  for(const id of ['steps-add','steps-duplicate','steps-fork','steps-inspect'])await expectCenterHit(page.locator('#'+id),id+' with Path settings expanded');
  await expectCenterHit(more,'More step actions with Path settings expanded');
  const pathLabel=page.locator('#steps-path-label'),pathColor=page.locator('#steps-path-color'),pathSave=page.locator('#steps-path-save'),pathRemove=page.locator('#steps-path-remove');
  await expectTabReachable(page,pathLabel,'Path label');await expectTabReachable(page,pathColor,'Path color');
  await expectTabReachable(page,page.locator('#steps-path-base'),'Compare path with');
  await expectTabReachable(page,pathSave,'Update path');await expectTabReachable(page,pathRemove,'Remove alternate');
  for(const id of ['steps-add','steps-duplicate','steps-fork','steps-inspect'])await expectTabReachable(page,page.locator('#'+id),id);
  await expectTabReachable(page,more,'More step actions');
  await testInfo.attach('steps-alternate-path-settings',{body:await win.screenshot(),contentType:'image/png'});
  const playback=page.locator('.playback-settings');await playback.locator('summary').scrollIntoViewIfNeeded();await playback.locator('summary').click();
  await expect(playback).toHaveAttribute('open','');
  for(const id of ['steps-opening-view','steps-show-ids','steps-autoplay',...expandedControls]){
    await page.locator('#'+id).scrollIntoViewIfNeeded();await expectCenterHit(page.locator('#'+id),id+' with both settings expanded');
  }
  expect((await list.boundingBox()).height).toBeGreaterThanOrEqual(120);
  for(const id of ['steps-add','steps-duplicate','steps-fork','steps-inspect'])await expectCenterHit(page.locator('#'+id),id+' with both settings expanded');
  await expectCenterHit(more,'More step actions with both settings expanded');
  await testInfo.attach('steps-both-settings-1280x720',{body:await win.screenshot(),contentType:'image/png'});
  await page.setViewportSize({width:1440,height:900});await page.locator('#editor-tab-file').click();
  await page.locator('.workspace-preferences summary').click();await page.locator('#workspace-reset').click();await page.locator('#workspace-window-file .workspace-window-close').click();
  await expect(list.locator('.story-step')).toHaveCount(5);expect((await win.boundingBox()).height).toBeGreaterThan(600);
  await testInfo.attach('steps-alternate-1440x900',{body:await win.screenshot(),contentType:'image/png'});
  await expect(pane).toBeVisible();
});

/* #565 the steps panel has one name, and the editor's mode toggle uses sentence case.
   Contract matrix (desktop 1440x900 workbench, editorSpec as authored (stepped, no delta); scoped to
   #editor-tab-steps, #workspace-window-steps and its own controls, and the visible
   .section-layout-grid's .mtoggle; text read as rendered innerText):
   row | fixture | assertion (scoped) | rejects
   S1 rail tool | fresh editor, Steps window closed | the .workspace-rail button named exactly "Steps" is #editor-tab-steps | a rail label other than "Steps"
   S2 window title | real click on the rail tab | #workspace-window-steps visible; its grip's innerText is exactly "Steps" | "Story steps" window title
   S3 window landmark | same | the window's aria-label is "Steps" | "Story steps" landmark
   S4 window controls | same | Move / Close / Resize / Dock buttons are named "<verb> Steps panel" | controls naming a different panel
   S5 list and filter | same | #steps-list aria-label "Steps"; #steps-search aria-label "Filter steps" | "Story steps" / "Filter story steps"
   S6 no other name | same | no element inside the window carries "story steps" (any case) in its rendered text or aria-label | a leftover second name anywhere in the panel
   M1 mode toggle | visible section grid | its .mtoggle buttons render exactly "Ambient" and "Step" | "AMBIENT" / "STEP" */
test('Steps panel has one name and the editor mode toggle uses sentence case',async({page,server})=>{
  await page.setViewportSize({width:1440,height:900});await open(page,server,JSON.stringify(editorSpec(),null,2));
  const rendered=locator=>locator.evaluate(el=>el.innerText.trim());
  const win=page.locator('#workspace-window-steps');
  // S1
  await expect(win).toBeHidden();
  expect(await page.locator('.workspace-rail').getByRole('button',{name:'Steps',exact:true}).evaluate(el=>el.id)).toBe('editor-tab-steps');
  // S2-S5
  await page.locator('#editor-tab-steps').click();await expect(win).toBeVisible();
  expect(await rendered(win.locator('.workspace-window-grip'))).toBe('Steps');
  await expect(win).toHaveAttribute('aria-label','Steps');
  await expect(win.locator('.workspace-window-grip')).toHaveAttribute('aria-label','Move Steps panel');
  await expect(win.locator('.workspace-window-close')).toHaveAttribute('aria-label','Close Steps panel');
  await expect(win.locator('.workspace-window-resize')).toHaveAttribute('aria-label','Resize Steps panel');
  await expect(win.locator('.workspace-window-dock')).toHaveAttribute('aria-label',/^(?:Dock|Float) Steps panel$/);
  await expect(win.locator('#steps-list')).toHaveAttribute('aria-label','Steps');
  await expect(win.locator('#steps-search')).toHaveAttribute('aria-label','Filter steps');
  // S6
  const other=await win.evaluate(root=>[root,...root.querySelectorAll('*')].flatMap(el=>[el.getAttribute('aria-label') || '',el.matches('summary,.workspace-window-grip') ? el.textContent : ''])
    .filter(text=>/story steps/i.test(text)));
  expect(other).toEqual([]);
  // M1
  const modes=page.locator('.section-layout-grid').filter({visible:true}).first().locator('.mtoggle button');
  await expect(modes).toHaveCount(3);
  expect([await rendered(modes.nth(0)),await rendered(modes.nth(1)),await rendered(modes.nth(2))]).toEqual(['Ambient','Step','Follow active']);
  await expect(modes.nth(2)).toHaveAttribute('aria-pressed','true');
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

test('object search shortcut and selection stay in Find objects; explicit inspection opens the selected object',async({page,server})=>{
  await open(page,server);await page.locator('#editor-tab-json').click();
  await page.keyboard.press('ControlOrMeta+k');await expect(page.locator('#editor-outline')).toBeVisible();await expect(page.locator('#outline-search')).toBeFocused();
  await page.locator('#outline-search').fill('Doorbell');await page.locator('.outline-item').filter({hasText:'Doorbell'}).click();
  await expect(page.locator('#editor-outline')).toBeVisible();await page.locator('#outline-inspect').click();
  const title=page.locator('#guide').getByLabel('Name',{exact:true});await expect(title).toHaveValue('Doorbell');
  await title.fill('Front camera');await title.press('Enter');await expect(title).toBeFocused();
  await page.locator('#editor-tab-file').click();await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(source);
  await page.locator('#redo-builder').click();expect(JSON.parse(await page.locator('#src').inputValue()).page.blocks[0].diagram.nodes.a.title).toBe('Front camera');
});

test('File hosts company catalog and imports, links to every export; complete project export works from JSON',async({page,server})=>{
  await open(page,server);await page.locator('#editor-tab-file').click();
  await page.locator('#editor-company summary').click();await expect(page.getByRole('textbox',{name:'Catalog JSON',exact:true})).toBeVisible();
  await page.locator('#sec-insert > summary').click();await page.locator('#import-mermaid').click();await expect(page.locator('#importbox')).toBeVisible();
  await page.locator('#editor-tab-json').click();await page.locator('#editor-tab-file').click();await expect(page.locator('#importbox')).toBeVisible();
  await page.locator('#import-mermaid-cancel').click();
  await page.locator('#file-show-exports').click();await expect(page.locator('#workspace-export')).toHaveAttribute('open','');await expect(page.locator('#file-save')).toBeFocused();await page.keyboard.press('Escape');
  await page.locator('#editor-tab-json').click();const savePromise=page.waitForEvent('download');await page.locator('#workspace-export-trigger').click();await page.locator('#file-save').click();const saved=await savePromise;
  expect(JSON.parse(await projectSource(saved)).page.title).toBe(editorSpec().page.title);
});

test('top Home and File keep project navigation and exports reachable at desktop width',async({page,server})=>{
  await page.setViewportSize({width:1280,height:800});await open(page,server);const original=await page.locator('#src').inputValue();
  const home=page.locator('#workspace-home'),file=page.locator('#workspace-file');
  await expect(home).toHaveText('Home');await expectCenterHit(home,'top Home');await expectCenterHit(file,'top File');
  await file.click();await expect(page.locator('#workspace-window-file')).toBeVisible();await expect(page.locator('#file-show-exports')).toBeVisible();await expect(page.locator('#editor-tab-file')).toBeFocused();
  await page.locator('.workspace-preferences summary').click();await page.locator('#workspace-preset').selectOption('present');await expect(page.locator('.workspace-window:visible')).toHaveCount(0);
  await file.click();await expect(page.locator('#workspace-window-file')).toBeVisible();await expect(page.locator('#file-show-exports')).toBeVisible();await expect(page.locator('#src')).toHaveValue(original);
  const download=page.waitForEvent('download');await page.locator('#workspace-export-trigger').click();await page.locator('#file-save').click();const saved=await download;
  expect(JSON.parse(await projectSource(saved)).page.title).toBe(editorSpec().page.title);await expect(page.locator('#src')).toHaveValue(original);
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
