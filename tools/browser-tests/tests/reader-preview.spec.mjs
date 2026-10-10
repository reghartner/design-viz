import {test,expect,paste,closeTools,chapterOptions} from '../helpers/test.mjs';
import {readFile} from 'node:fs/promises';
import {editorSpec} from '../fixtures/editor-spec.mjs';

function longReaderSpec(){
  const raw=editorSpec(),section=raw.page.blocks[0];
  section.heading='Reader preview section';
  section.text=Array.from({length:18},(_,index)=>('Reader-facing context paragraph '+(index+1)+'. ').repeat(5));
  section.diagram.layouts[0].steps=['press','done','failed'];
  return JSON.stringify(raw,null,2);
}

test('read-only page preview is a separate interactive reader and returns without editing source',async({page,server})=>{
  const source=longReaderSpec();
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.goto(server.origin+'/workbench.html');await paste(page,source);

  await page.locator('#workspace-appearance>summary').click();await page.locator('#sk-terminal').click();await page.locator('#workspace-appearance>summary').click();
  await page.locator('#docview .path-chip[data-dv-path="happy"]').first().click();
  await expect(page.locator('#docview .stepline').first()).toContainText('Button pressed');
  const workspaceHandle=await page.locator('#workbench-workspace').elementHandle();
  const authorViewHandle=await page.locator('#docview').elementHandle();
  const sourceHandle=await page.locator('#src').elementHandle();
  const authorNode=await page.locator('#docview .node[data-dv-node="a"]').first().elementHandle();
  const authorEdge=await page.locator('#docview path.edge[data-dv-edge="0"]').first().elementHandle();
  const authorCoin=await page.locator('#docview .coin[data-dv-step="0"]').first().elementHandle();
  for(const handle of [authorNode,authorEdge,authorCoin])expect(await handle.evaluate(element=>element.classList.contains('lit'))).toBe(true);
  await page.locator('#docview .playback-button').first().click();
  await expect(page.locator('#docview .playback-status').first()).toContainText('Playing');
  const authorPlayback=await page.locator('#docview .playback-status').first().elementHandle();
  const canvas=page.locator('#workspace-canvas');
  await canvas.evaluate(element=>{element.scrollTop=240;});
  const canvasScroll=await canvas.evaluate(element=>element.scrollTop);

  await page.locator('#workspace-appearance>summary').click();await page.locator('#open-page-preview').click();
  const reader=page.locator('#page-preview-view'),back=page.locator('#close-page-preview');
  await expect(page.locator('#workbench-workspace')).toBeHidden();
  expect(await workspaceHandle.evaluate(element=>element.isConnected)).toBe(true);
  await expect(page.locator('#docview')).toHaveCount(0);
  expect(await authorViewHandle.evaluate(element=>element.isConnected)).toBe(false);
  expect(await authorPlayback.textContent()).toContain('Paused');
  await expect(page.locator('.workbench-header')).toBeHidden();
  await expect(reader).toBeVisible();await expect(reader).toHaveClass(/sk-terminal/);
  await expect(back).toBeFocused();
  await expect(reader.locator('.path-chip[data-dv-path="happy"]').first()).toHaveAttribute('aria-pressed','true');
  await expect(reader.locator('.stepline').first()).toContainText('Button pressed');
  await expect(reader.locator('.node[data-dv-node="a"]').first()).toHaveClass(/\blit\b/);
  await expect(reader.locator('path.edge[data-dv-edge="0"]').first()).toHaveClass(/\blit\b/);
  await expect(reader.locator('.coin[data-dv-step="0"]').first()).toHaveClass(/\blit\b/);
  await expect(reader.locator('.dv-rowgrab,.home-layout-button,.workspace-window,.workspace-rail,.workspace-canvas-controls')).toHaveCount(0);

  await reader.getByRole('button',{name:'Next step'}).first().click();
  await expect(reader.locator('.stepline').first()).toContainText('Recording ready');
  await expect(reader.locator('.node[data-dv-node="a"]').first()).not.toHaveClass(/\blit\b/);
  await expect(reader.locator('.node[data-dv-node="b"]').first()).toHaveClass(/\blit\b/);
  await expect(reader.locator('path.edge[data-dv-edge="0"]').first()).not.toHaveClass(/\blit\b/);
  await expect(reader.locator('.coin[data-dv-step="0"]').first()).not.toHaveClass(/\blit\b/);
  await reader.locator('.playback-button').first().click();
  await expect(reader.locator('.playback-status').first()).toContainText('Playing');
  await expect(reader.locator('path.edge[data-dv-edge="0"]').first()).toHaveClass(/\blit\b/);
  await expect(reader.locator('.coin[data-dv-step="0"]').first()).toHaveClass(/\blit\b/);
  await reader.locator('.playback-button').first().click();
  await reader.locator('.path-chip[data-dv-path="failed"]').first().click();
  await expect(reader.locator('.comm-failure[data-dv-edge="0"]').first()).toBeVisible();
  await reader.locator('.node').first().click();await page.keyboard.press('Delete');
  expect(await sourceHandle.inputValue()).toBe(source);
  for(const handle of [authorNode,authorEdge,authorCoin])expect(await handle.evaluate(element=>element.classList.contains('lit'))).toBe(true);

  await page.setViewportSize({width:520,height:640});
  const backBefore=await back.boundingBox();
  await page.locator('#page-preview-surface').evaluate(el=>{el.scrollTop=el.scrollHeight;});
  const backBox=await back.boundingBox();expect(backBox).toEqual(backBefore);await expect(back).toBeInViewport();
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),{message:'Reader preview fits the narrow viewport'}).toBe(true);

  await back.click();
  await expect(page.locator('#page-preview')).toBeHidden();
  await expect(page.locator('#workbench-workspace')).toBeVisible();
  expect(await workspaceHandle.evaluate(element=>element.isConnected)).toBe(true);
  expect(await authorViewHandle.evaluate(element=>element.isConnected)).toBe(true);
  await expect(page.locator('.workbench-header')).toBeVisible();
  await expect(page.locator('#docview .playback-status').first()).toContainText('Playing');
  await page.locator('#docview .playback-button').first().evaluate(element=>element.click());
  await expect(page.locator('#docview .playback-status').first()).toContainText('Paused');
  await expect(page.locator('#open-page-preview')).toBeFocused();
  await expect(page.locator('#open-page-preview')).toBeInViewport();
  await expect(page.locator('#src')).toHaveValue(source);
  expect(await canvas.evaluate(element=>element.scrollTop)).toBe(canvasScroll);
  await expect(page.locator('#docview .path-chip[data-dv-path="happy"]').first()).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#docview .stepline').first()).toContainText('Button pressed');
  for(const handle of [authorNode,authorEdge,authorCoin]){
    expect(await handle.evaluate(element=>element.isConnected)).toBe(true);
    expect(await handle.evaluate(element=>element.classList.contains('lit'))).toBe(true);
  }
});


test('invalid drafts retain the last usable Explore reader across host and width changes without fragment or author mutations',async({page,server})=>{
  const raw=editorSpec(),diagram=raw.page.blocks[0].diagram;
  diagram.layouts[0].presentation='explore';delete diagram.layouts[0].steps;
  const source=JSON.stringify(raw,null,2);await page.goto(server.origin+'/workbench.html');await paste(page,source);await closeTools(page);
  await page.locator('#docview .path-chip[data-dv-path="happy"]').first().click();
  const author=await page.locator('#docview').elementHandle(),node=await page.locator('#docview .node[data-dv-node="a"]').first().elementHandle();
  await page.locator('#editor-tab-json').click();const invalid=source+' invalid draft';
  await page.locator('#src').fill(invalid);await page.locator('#go').click();await closeTools(page);
  await page.evaluate(()=>history.replaceState(null,'','#unchanged-preview-fragment'));const hash=await page.evaluate(()=>location.hash);
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('dv-workbench-draft')).text)).toBe(invalid);
  const draft=await page.evaluate(()=>localStorage.getItem('dv-workbench-draft'));
  const camera=()=>page.locator('#docview .explore-board').evaluate(el=>{const pixels=parseFloat(el.style.getPropertyValue('--explore-width')),ratio=el.querySelector('svg').viewBox.baseVal.height/el.querySelector('svg').viewBox.baseVal.width;return {x:(el.scrollLeft+el.clientWidth/2-parseFloat(el.style.getPropertyValue('--explore-margin-x')))/pixels,y:(el.scrollTop+el.clientHeight/2-parseFloat(el.style.getPropertyValue('--explore-margin-y')))/(pixels*ratio)};});
  const beforeCamera=await camera();
  await page.locator('#workspace-appearance>summary').click();await page.locator('#layout-preview-target').selectOption('backstage');await page.locator('#open-page-preview').click();
  await expect(page.locator('#page-preview-surface')).toHaveClass(/viewer-exploring/);
  await expect(page.locator('#page-preview-view .explore-navigation').getByRole('button',{name:'Business',exact:true})).toHaveAttribute('aria-pressed','true');
  for(const host of ['confluence','backstage','default']){
    await page.locator('#layout-preview-target').selectOption(host);
    if(host!=='default'){await page.getByRole('spinbutton',{name:'Preview width in pixels',exact:true}).fill('720');await page.getByRole('spinbutton',{name:'Preview width in pixels',exact:true}).dispatchEvent('change');expect(await page.locator('#page-preview-surface').evaluate(el=>el.clientWidth)).toBe(720);}
    expect(await author.evaluate(el=>el.isConnected)).toBe(false);expect(await node.evaluate(el=>el.isConnected)).toBe(false);
    await expect(page.locator('#page-preview-view .path-chip[data-dv-path="happy"]').first()).toHaveAttribute('aria-pressed','true');
    expect(await page.evaluate(()=>location.hash)).toBe(hash);
  }
  await page.locator('#page-preview-view').getByRole('button',{name:'Next step',exact:true}).first().click();
  expect(await page.evaluate(()=>location.hash)).toBe(hash);await page.setViewportSize({width:390,height:900});
  const chapter=page.locator('#page-preview-view .explore-navigation').getByRole('button',{name:'Business',exact:true});await expect(chapter).toBeInViewport();expect(await chapter.evaluate(el=>{const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return el===hit || el.contains(hit);})).toBe(true);await expect(chapter.locator('.explore-indicator-badge svg')).toBeInViewport();
  await page.setViewportSize({width:1024,height:760});await page.keyboard.press('Escape');
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));const afterCamera=await camera();expect(afterCamera.x).toBeCloseTo(beforeCamera.x,2);expect(afterCamera.y).toBeCloseTo(beforeCamera.y,2);
  expect(await author.evaluate(el=>el.isConnected)).toBe(true);expect(await node.evaluate(el=>el.isConnected)).toBe(true);
  await expect(page.locator('#src')).toHaveValue(invalid);expect(await page.evaluate(()=>localStorage.getItem('dv-workbench-draft'))).toBe(draft);
  await expect(page.locator('#undo-builder')).toBeDisabled();await expect(page.locator('#open-page-preview')).toBeFocused();
  await expect(page.locator('#docview .stepline').first()).toContainText('Button pressed');
  expect(await page.evaluate(()=>location.hash)).toBe(hash);
});

test('page preview opens the selected authored Explore View as a full canvas across host rerenders',async({page,server})=>{
  const raw=editorSpec(),diagram=raw.page.blocks[0].diagram;
  diagram.layouts[0].name='Overview';
  diagram.layouts.push({...structuredClone(diagram.layouts[0]),id:'engineering',name:'Engineering',presentation:'standard'});
  await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(raw,null,2));await closeTools(page);

  await page.locator('#docview').getByRole('button',{name:'Engineering',exact:true}).click();
  await chapterOptions(page);
  await page.locator('#docview>.explore-navigation').getByRole('combobox',{name:'View presentation',exact:true}).selectOption('explore');
  await expect(page.locator('#docview .doc-sec').first()).toHaveAttribute('data-view-id','engineering');
  const source=await page.locator('#src').inputValue(),undoDisabled=await page.locator('#undo-builder').isDisabled();
  await page.locator('#workspace-appearance>summary').click();await page.locator('#open-page-preview').click();
  const surface=page.locator('#page-preview-surface'),reader=page.locator('#page-preview-view');
  await expect(surface).toHaveClass(/viewer-exploring/);await expect(reader).toHaveClass(/explore-full-window/);
  await expect(reader.getByRole('button',{name:'Engineering',exact:true})).toHaveAttribute('aria-pressed','true');
  async function assertGeometry(){
    const geometry=await surface.evaluate(el=>{
      const canvas=el.querySelector('.viewer-diagram-canvas'),nav=el.querySelector('.explore-navigation'),a=el.getBoundingClientRect(),b=canvas.getBoundingClientRect(),n=nav.getBoundingClientRect();
      const hits=[[a.left+12,a.top+12],[a.right-12,a.top+12],[a.left+12,a.bottom-12],[a.right-12,a.bottom-12]].map(([x,y])=>{const hit=document.elementFromPoint(x,y);return canvas.contains(hit)||nav.contains(hit);});
      return {surface:{x:a.x,y:a.y,width:a.width,height:a.height},canvas:{x:b.x,y:b.y,width:b.width,height:b.height},nav:{x:n.x,y:n.y,width:n.width,height:n.height},hits};
    });
    expect(geometry.nav.height).toBeGreaterThan(0);expect(geometry.nav).toEqual({...geometry.surface,height:geometry.nav.height});
    expect(geometry.canvas).toEqual({...geometry.surface,y:geometry.nav.y+geometry.nav.height,height:geometry.surface.height-geometry.nav.height});expect(geometry.hits).toEqual([true,true,true,true]);
  }
  await assertGeometry();
  for(const host of ['backstage','confluence','default']){
    await page.locator('#layout-preview-target').selectOption(host);
    if(host!=='default'){
      await page.getByRole('spinbutton',{name:'Preview width in pixels',exact:true}).fill('720');
      await page.getByRole('spinbutton',{name:'Preview width in pixels',exact:true}).dispatchEvent('change');
    }
    await expect(surface).toHaveClass(/viewer-exploring/);await expect(reader).toHaveClass(/explore-full-window/);
    await expect(reader.getByRole('button',{name:'Engineering',exact:true})).toHaveAttribute('aria-pressed','true');await assertGeometry();
  }
  await page.locator('#close-page-preview').click();
  await expect(page.locator('#docview .doc-sec').first()).toHaveAttribute('data-view-id','engineering');
  await expect(page.locator('#src')).toHaveValue(source);expect(await page.locator('#undo-builder').isDisabled()).toBe(undoDisabled);

  await page.locator('#docview').getByRole('button',{name:'Overview',exact:true}).click();
  if(!await page.locator('#open-page-preview').isVisible())await page.locator('#workspace-appearance>summary').click();
  await page.locator('#open-page-preview').click();
  await expect(surface).not.toHaveClass(/viewer-exploring/);await expect(reader).not.toHaveClass(/explore-full-window/);
  await expect(reader.getByRole('button',{name:'Overview',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.locator('#close-page-preview').click();await expect(page.locator('#src')).toHaveValue(source);
});

test('reader snapshot promotes the visibly active Explore section over stale navigation state',async({page})=>{
  await page.setContent('<section id="active" class="explore-active-section"></section>');
  await page.addScriptTag({content:await readFile(new URL('../../../src/workbench/preview.js',import.meta.url),'utf8')});
  const target=await page.evaluate(()=>{
    window.sectionRecords=()=>[];window.activeTabReferences=()=>null;
    const sectionEl=document.getElementById('active');
    return workbenchReaderPreviewSnapshot({}, {activeTarget:{kind:'page'},sections:[{number:3,sectionEl,viewport:{isExplore:()=>true}}]});
  });
  expect(target.target).toEqual({kind:'diagram',section:3});
});


test('reader owner unwinds renderer errors and repeated destroy before reconnecting author DOM',async({page})=>{
  await page.setContent('<header class="workbench-header"><details id="workspace-appearance"><summary>Preview</summary><div><button id="open-page-preview">Open page preview</button><div class="layout-preview-tools"><select><option value="default">Responsive</option></select><input value="760"></div></div></details></header><main id="workbench-workspace"><div id="workspace-canvas"><div id="docview"><div id="author-node">Author</div></div></div></main><dialog id="page-preview"><header><button id="close-page-preview">Close preview</button></header><div id="page-preview-surface"><div id="page-preview-view"></div></div></dialog>');
  await page.addScriptTag({content:await readFile(new URL('../../../src/workbench/lifetime.js',import.meta.url),'utf8')});
  await page.addScriptTag({content:await readFile(new URL('../../../src/workspace.workbench.js',import.meta.url),'utf8')});
  const result=await page.evaluate(()=>{
    const author=document.getElementById('docview'),settings=document.querySelector('.layout-preview-tools'),parent=settings.parentNode,events=[];let playing=true;
    window.syncNavigationPopover=()=>{};window.workbenchReaderPreviewSnapshot=()=>({});
    window.initViewerExploreCanvas=()=>({destroy(){events.push('canvas:'+author.isConnected);}});
    const opts={page:()=>({}),skin:()=> 'pastel',controller:()=>({steppers:[{stepper:{playing:()=>playing,pause(){playing=false;},toggleAuto(){playing=!playing;}}}]})};
    const owner=initWorkbenchReaderPreview({...opts,render(view){view.innerHTML='<span id="reader-node">Reader</span>';return {destroy(){events.push('reader:'+author.isConnected);}};}});
    owner.show();const detached=!author.isConnected && !playing;owner.destroy();owner.destroy();
    const restored=author.isConnected && settings.parentNode===parent && playing && !document.getElementById('page-preview').open && !document.getElementById('reader-node');
    const failure=initWorkbenchReaderPreview({...opts,render(){throw Error('intentional render failure');}});let message;try{failure.show();}catch(error){message=error.message;}
    const unwound=!failure.active() && author.isConnected && settings.parentNode===parent && playing && !document.getElementById('page-preview').open;failure.destroy();
    return {events,detached,restored,unwound,message,authors:document.querySelectorAll('#docview').length,settings:document.querySelectorAll('.layout-preview-tools').length};
  });
  expect(result).toEqual({events:['canvas:false','reader:false'],detached:true,restored:true,unwound:true,message:'intentional render failure',authors:1,settings:1});
});
