import {test,expect,paste,closeTools,chapterOptions,chooseAddDestination,arrangeChapter} from '../helpers/test.mjs';
import {editorSpec} from '../fixtures/editor-spec.mjs';
function fixture(){
 const raw=editorSpec(),first=raw.page.blocks[0];first.id='primary';first.text='The notes belong to this view.';
 const d=first.diagram;delete d.layouts[0].steps;d.layouts[0].presentation='explore';d.layouts[0].name='Engineering';
 d.layouts.push({...structuredClone(d.layouts[0]),id:'standard',name:'Overview',presentation:'standard'});
 const other=structuredClone(first);other.id='secondary';other.heading='Second diagram';
 raw.page.blocks=[{tabs:[{label:'Main story',presentation:'explore',sections:[first,other]},{label:'Notes',sections:[{id:'notes',heading:'Notes only',text:'A prose destination.'}]}]}];return raw;
}
async function open(page,server){const source=JSON.stringify(fixture(),null,2);await page.goto(server.origin+'/workbench.html');await paste(page,source);await closeTools(page);return source;}
const nav=page=>page.locator('#docview .explore-navigation');
const selected=page=>page.locator('#docview .workspace-active-section');
async function camera(page){return selected(page).locator('.explore-board').evaluate(el=>({x:el.scrollLeft,y:el.scrollTop,width:el.style.getPropertyValue('--explore-width')}));}

test('one measured navigation surface keeps original tabs, all diagrams and compact mode icons across widths',async({page,server},info)=>{
 const source=await open(page,server);
 await expect(page.getByRole('button',{name:'Back to page',exact:true})).toHaveCount(0);
 await expect(nav(page)).toHaveCount(1);await expect(nav(page).locator('.explore-navigation-diagrams button:not([hidden])')).toHaveCount(2);
 await expect(nav(page).getByRole('tab',{name:'Main story',exact:true}).locator('.explore-indicator-badge svg')).toBeVisible();
 await expect(nav(page).getByRole('button',{name:'Engineering',exact:true}).locator('.explore-indicator-badge svg')).toBeVisible();
 for(const width of [1440,1024,768,390]){
  await page.setViewportSize({width,height:1000});
  await expect.poll(()=>nav(page).evaluate(el=>{const r=el.getBoundingClientRect(),header=document.querySelector('.workbench-header').getBoundingClientRect();return Math.abs(r.top-header.bottom);})).toBeLessThanOrEqual(1);
  const geometry=await nav(page).evaluate(el=>{const r=el.getBoundingClientRect(),stage=document.querySelector('.workspace-active-section .explore-stage').getBoundingClientRect(),undo=document.querySelector('#undo-builder').getBoundingClientRect(),player=document.querySelector('.workspace-active-section .explore-player').getBoundingClientRect(),tools=document.querySelector('.workspace-canvas-controls').getBoundingClientRect();return {bottom:r.bottom,stageTop:stage.top,undoLeft:undo.left,undoRight:undo.right,playerRight:player.right,playerBottom:player.bottom,toolsTop:tools.top};});
  if(width===1440)expect(geometry.bottom).toBeLessThanOrEqual(112);
  expect(geometry.stageTop).toBeGreaterThanOrEqual(geometry.bottom);
  expect(geometry.undoLeft).toBeGreaterThanOrEqual(0);expect(geometry.undoRight).toBeLessThanOrEqual(width);
  expect(geometry.playerRight).toBeLessThanOrEqual(width);expect(geometry.playerBottom).toBeLessThanOrEqual(geometry.toolsTop-6);
  for(const selector of ['.step-transport','.schips','.stepline']){const content=selected(page).locator('.explore-player '+selector);await expect(content).toBeInViewport();const r=await content.boundingBox(),dock=await selected(page).locator('.explore-player').boundingBox();expect(r.x).toBeGreaterThanOrEqual(dock.x);expect(r.x+r.width).toBeLessThanOrEqual(dock.x+dock.width+1);expect(r.y+r.height).toBeLessThanOrEqual(dock.y+dock.height+1);}
  await info.attach('navigation-'+width,{body:await page.screenshot(),contentType:'image/png'});
 }
 await nav(page).getByRole('button',{name:'Overview',exact:true}).click();
 await expect(page.locator('body')).toHaveClass(/workspace-diagram/);await expect(nav(page)).toHaveCount(1);
 await expect(nav(page).getByRole('tab',{name:'Main story',exact:true}).locator('.explore-indicator-badge')).toHaveCount(1);
 await expect(page.locator('#section-primary .playback-mode-rail')).toBeVisible();await page.locator('#section-primary .playback-mode-rail').getByRole('button',{name:'AMBIENT',exact:true}).click();await expect(page.locator('#section-primary .explore-player')).toHaveClass(/ambient/);await page.locator('#section-primary .playback-mode-rail').getByRole('button',{name:'STEP',exact:true}).click();await expect(page.locator('#section-primary .termbar')).toBeVisible();
 await expect(nav(page).getByRole('button',{name:'Engineering',exact:true}).locator('.explore-indicator-badge svg')).toBeVisible();
 await nav(page).getByRole('button',{name:'Second diagram',exact:true}).click();await expect(selected(page)).toHaveAttribute('id','section-secondary');
 await nav(page).getByRole('button',{name:'Delivery',exact:true}).click();await expect(page.locator('#section-primary')).toHaveAttribute('data-view-id','standard');
 await expect(page.locator('#src')).toHaveValue(source);
});

test('Add follows prose tabs and deliberate destination changes while stale source remains blocked',async({page,server})=>{
 const original=await open(page,server);await nav(page).getByRole('tab',{name:'Notes',exact:true}).click();
 await page.locator('#diagram-add').click();await expect(page.locator('#add-node')).toBeDisabled();await expect(page.locator('#add-paragraph')).toBeEnabled();await expect(page.locator('#diagram-add-destination')).toContainText('Notes');
 await page.locator('.diagram-add-destination-picker summary').click();await page.locator('#diagram-add-target').selectOption('1');
 await expect(nav(page).getByRole('tab',{name:'Main story',exact:true})).toHaveAttribute('aria-selected','true');await expect(selected(page)).toHaveAttribute('id','section-secondary');
 await expect(page.locator('#add-node')).toBeEnabled();await page.locator('#add-node').click();await page.locator('#diagram-add-presets').getByRole('button',{name:'Service',exact:true}).click();
 let changed=JSON.parse(await page.locator('#src').inputValue());expect(Object.keys(changed.page.blocks[0].tabs[0].sections[1].diagram.nodes)).toHaveLength(4);expect(Object.keys(changed.page.blocks[0].tabs[0].sections[0].diagram.nodes)).toHaveLength(3);
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);
 await page.locator('#diagram-add').click();await page.locator('#src').evaluate(el=>{el.value+=' ';el.dispatchEvent(new Event('input',{bubbles:true}));});await expect(page.locator('#add-node')).toBeDisabled();await expect(page.locator('#diagram-add-error')).toContainText('changed');
 await page.locator('.diagram-add-destination-picker summary').click();await page.locator('#diagram-add-target').selectOption('0');await expect(page.locator('#add-node')).toBeDisabled();await expect(page.locator('#diagram-add-error')).toContainText('changed');
});

test('page preview is isolated and explicit camera commands author one undoable change',async({page,server})=>{
 const original=await open(page,server);await page.locator('#workspace-zoom-in').click();
 await page.locator('#workspace-appearance>summary').click();await page.locator('#sk-daylight').click();await page.locator('#layout-preview-target').selectOption('backstage');await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));const before=await camera(page);await page.locator('#open-page-preview').click();
 await expect(page.locator('#page-preview-surface')).toHaveClass(/viewer-exploring/);await expect(page.locator('#page-preview-view')).toHaveClass(/sk-daylight/);await page.locator('#page-preview-view .explore-navigation').getByRole('tab',{name:'Notes',exact:true}).click();await page.locator('#close-page-preview').click();
 await expect(selected(page)).toHaveAttribute('id','section-primary');expect(await camera(page)).toEqual(before);await expect(page.locator('#src')).toHaveValue(original);await expect(page.locator('#undo-builder')).toBeDisabled();
 await page.locator('#workspace-appearance>summary').click();await chapterOptions(page);await nav(page).getByRole('button',{name:'Use current camera as opening view',exact:true}).click();
 const saved=await page.locator('#src').inputValue(),authored=JSON.parse(saved).page.blocks[0].tabs[0].sections[0].diagram.layouts[0].exploreLayout.camera;expect(authored.zoom).toBeGreaterThan(0);
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);await expect(page.locator('#undo-builder')).toBeDisabled();await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(saved);
 await chapterOptions(page);await nav(page).getByRole('button',{name:'Reset opening camera',exact:true}).click();expect(JSON.parse(await page.locator('#src').inputValue()).page.blocks[0].tabs[0].sections[0].diagram.layouts[0].exploreLayout.camera).toBeUndefined();await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(saved);
 await selected(page).getByRole('button',{name:'AMBIENT',exact:true}).click();await expect(selected(page).getByRole('button',{name:'STEP',exact:true})).toBeVisible();await selected(page).getByRole('button',{name:'STEP',exact:true}).click();await expect(selected(page).locator('.termbar')).toBeVisible();
});

test('long navigation labels reveal the selected chapter and detail insertion explains its source boundary',async({page,server},info)=>{
 const raw=fixture(),primary=raw.page.blocks[0].tabs[0].sections[0],d=primary.diagram;
 for(let i=0;i<9;i++)d.layouts.push({...structuredClone(d.layouts[0]),id:'long-'+i,name:'View '+i+' — detailed engineering view'});
 const detail=structuredClone(primary);detail.id='detail-source';detail.heading='Detailed source';detail.detailOnly=true;d.nodes.a.detail={section:'detail-source'};raw.page.blocks.push(detail);
 raw.page.blocks[0].tabs[0].sections.push({id:'context-notes',heading:'Architecture context without a diagram',text:'Editable prose in this tab.'});
 const source=JSON.stringify(raw,null,2);await page.goto(server.origin+'/workbench.html');await paste(page,source);await closeTools(page);await page.setViewportSize({width:390,height:1000});
 const last=nav(page).getByRole('button',{name:'View 8 — detailed engineering view',exact:true});await last.click();await expect(last).toHaveAttribute('aria-pressed','true');await expect(last).toBeInViewport();await expect(last.locator('.explore-indicator-badge svg')).toBeInViewport();const chip=await last.boundingBox(),icon=await last.locator('.explore-indicator-badge svg').boundingBox();expect(icon.x).toBeGreaterThanOrEqual(chip.x);expect(icon.x+icon.width).toBeLessThanOrEqual(chip.x+chip.width);
 await chapterOptions(page);const mode=nav(page).getByRole('textbox',{name:'View name',exact:true});await mode.focus();await page.keyboard.press('Escape');await expect(nav(page).locator('.section-view-options>summary')).toBeFocused();await expect(nav(page).locator('.section-view-options')).not.toHaveAttribute('open','');
 await nav(page).getByRole('button',{name:'Architecture context without a diagram',exact:true}).click();await page.locator('#diagram-add').click();await expect(page.locator('#add-node')).toBeDisabled();await expect(page.locator('#add-paragraph')).toBeEnabled();await expect(page.locator('#diagram-add-destination')).toContainText('Architecture context');await page.locator('#diagram-add-close').click();
 await nav(page).getByRole('button',{name:'Delivery',exact:true}).click();await expect(last).toHaveAttribute('aria-pressed','true');await expect(last).toBeInViewport();await info.attach('long-chapter-narrow',{body:await page.screenshot(),contentType:'image/png'});
 await page.setViewportSize({width:1440,height:1000});await selected(page).locator('[data-dv-detail=a]').click();await page.locator('#diagram-add').click();await expect(page.locator('#diagram-add-error')).toContainText('Detail previews');await expect(page.locator('#add-node')).toBeDisabled();await expect(page.locator('#add-paragraph')).toBeDisabled();await page.locator('#diagram-add-close').click();
 await expect(page.locator('#src')).toHaveValue(source);await expect(page.locator('#undo-builder')).toBeDisabled();
});


test('arrangement profile edits render the selected host and preserve sibling profiles with exact Undo',async({page,server},info)=>{
 await page.setViewportSize({width:1440,height:1000});const raw=editorSpec(),d=raw.page.blocks[0].diagram,profiles=d.layouts[0].sectionLayout;
 profiles.confluence=[{x:0,y:0,w:7,h:16},{panel:'home',x:7,y:0,w:5,h:9},{controls:'steps',attachTo:'diagram',x:0,y:16,w:7,h:5}];
 profiles.backstage=[{x:0,y:0,w:9,h:18},{panel:'home',x:9,y:0,w:3,h:10},{controls:'steps',attachTo:'diagram',x:0,y:18,w:9,h:4}];
 const original=JSON.stringify(raw,null,2),siblings=JSON.stringify([profiles.default,profiles.backstage].map(items=>items.map(it=>({...it,x:it.x*2,w:it.w*2}))));
 await page.goto(server.origin+'/workbench.html');await paste(page,original);await closeTools(page);await info.attach('profile-closed-navigation',{body:await page.screenshot(),contentType:'image/png'});await arrangeChapter(page);
 const profile=page.getByRole('combobox',{name:'Arrangement profile',exact:true}),grid=page.locator('.section-layout-grid'),diagram=page.locator('[data-layout-key="diagram"]');
 await profile.selectOption('confluence');await expect(grid).toHaveAttribute('data-layout-target','confluence');await expect(page.getByRole('spinbutton',{name:'Width',exact:true})).toHaveValue('14');await info.attach('confluence-arrangement-profile',{body:await page.screenshot(),contentType:'image/png'});
 expect(await diagram.evaluate(el=>Number(el.style.getPropertyValue('--tile-w')))).toBe(14);await expect(page.locator('#src')).toHaveValue(original);await expect(page.locator('#undo-builder')).toBeDisabled();
 const read=async()=>JSON.parse(await page.locator('#src').inputValue()).page.blocks[0].diagram.layouts[0].sectionLayout;
 const unchanged=async()=>{expect((await read()).columns).toBe(24);expect(JSON.stringify([(await read()).default,(await read()).backstage])).toBe(siblings);};
 await page.getByRole('spinbutton',{name:'Height',exact:true}).fill('20');await page.getByRole('button',{name:'Apply size / position',exact:true}).click();expect((await read()).confluence[0].h).toBe(20);await unchanged();await expect(grid).toHaveAttribute('data-layout-target','confluence');
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);await expect(page.locator('#undo-builder')).toBeDisabled();
 await diagram.locator('.section-tile-move').focus();await page.keyboard.press('ArrowDown');expect((await read()).confluence[0].y).toBe(1);await unchanged();await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);
 await page.getByRole('checkbox',{name:'Show Home in Business',exact:true}).uncheck();expect((await read()).confluence.find(it=>it.panel==='home').hidden).toBe(true);await unchanged();await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);
 await page.getByRole('button',{name:'Optimize layout',exact:true}).click();await unchanged();expect((await read()).confluence).not.toEqual(profiles.confluence);await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);
 await page.getByRole('button',{name:'Reset layout',exact:true}).click();expect((await read()).confluence).toBeUndefined();await unchanged();await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);await expect(page.locator('#undo-builder')).toBeDisabled();
 await closeTools(page);await arrangeChapter(page);await profile.selectOption('backstage');await expect(grid).toHaveAttribute('data-layout-target','backstage');await expect(page.getByRole('spinbutton',{name:'Width',exact:true})).toHaveValue('18');
 await page.locator('#workspace-appearance>summary').click();await page.locator('#layout-preview-target').selectOption('confluence');await page.locator('#open-page-preview').click();await expect(page.locator('#page-preview-view .section-layout-grid')).toHaveAttribute('data-layout-target','confluence');await page.locator('#close-page-preview').click();await expect(grid).toHaveAttribute('data-layout-target','backstage');await expect(profile).toHaveValue('backstage');await expect(page.locator('#src')).toHaveValue(original);
});


test('arranger stays above Inspect and retires cleanly on Escape, chapter, tab and source changes',async({page,server})=>{
 const original=await open(page,server);await nav(page).getByRole('button',{name:'Overview',exact:true}).click();await arrangeChapter(page);
 const arranger=page.locator('.section-arranger:popover-open');await expect(arranger).toHaveCount(1);
 await page.locator('#editor-tab-inspect').click();await expect(page.locator('#workspace-window-inspect')).toBeVisible();
 await arranger.getByRole('button',{name:'Hide arrangement controls',exact:true}).click();await expect(arranger.locator('.section-arrange-fields')).toBeHidden();await arranger.getByRole('button',{name:'Show arrangement controls',exact:true}).click();await expect(arranger.locator('.section-arrange-fields')).toBeVisible();
 await arranger.getByRole('combobox',{name:'Arrangement profile',exact:true}).focus();await page.keyboard.press('Escape');await expect(arranger).toHaveCount(0);await expect(nav(page).locator('.section-view-options>summary')).toBeFocused();
 await arrangeChapter(page);await arranger.getByRole('button',{name:'Done arranging',exact:true}).click();await expect(arranger).toHaveCount(0);await expect(nav(page).locator('.section-view-options>summary')).toBeFocused();
 await arrangeChapter(page);await nav(page).getByRole('button',{name:'Engineering',exact:true}).click();await expect(arranger).toHaveCount(0);
 await arrangeChapter(page);await nav(page).getByRole('tab',{name:'Notes',exact:true}).click();await expect(arranger).toHaveCount(0);await nav(page).getByRole('tab',{name:'Main story',exact:true}).click();await expect(arranger).toHaveCount(0);
 await arrangeChapter(page);await page.locator('#src').evaluate(el=>{el.value+=' ';el.dispatchEvent(new Event('input',{bubbles:true}));});await expect(arranger).toHaveCount(0);await page.locator('#editor-tab-json').click();await page.locator('#go').click();await expect(arranger).toHaveCount(0);await expect(page.locator('#src')).toHaveValue(original+' ');
});
