import {test,expect,paste,closeTools,panelsOptions} from '../helpers/test.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {repo} from '../helpers/prepare.mjs';
const fixture=()=>({page:{title:'Section Views',blocks:[{tabs:[{label:'Product',sections:[
 {id:'intro',heading:'Introduction',text:['Independent text section'],views:[{id:'standard',name:'Read',presentation:'standard'}]},
 {id:'story',heading:'Shared story',text:['Shared section notes'],views:[{id:'standard',name:'Business',presentation:'standard',layout:'business'},{id:'data',name:'Data',presentation:'explore',layout:'data'}],diagram:{view:'step',autoplay:false,nodes:{service:{title:'Shared service'}},rows:[['service']],steps:[{id:'ready',text:'Shared step',nodes:['service']}],layouts:[{id:'business',name:'Business arrangement',sectionLayout:{columns:24,default:[{x:0,y:0,w:24,h:16,hidden:true}]}},{id:'data',name:'Data arrangement',sectionLayout:{columns:24,default:[{x:0,y:0,w:24,h:16}]}}]}}
 ]}]}]}});
const nav=root=>root.locator('.explore-navigation').first();
async function standalone(page,server,raw=fixture(),hash=''){const input=path.join(server.root,'section-owned.json');await writeFile(input,JSON.stringify(raw));execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),path.join(server.root,'section-owned.html')]);await page.goto(server.origin+'/section-owned.html'+hash);return page.locator('#docview');}
async function choose(root,name){const n=nav(root),button=n.getByRole('tab',{name,exact:true});if(await button.isVisible())await button.click();else await n.locator('.tab-view-choices').getByRole('button',{name,exact:true}).click();}
async function viewOptions(root){const summary=nav(root).locator('.section-view-options>summary');if(!await summary.locator('..').evaluate(el=>el.open))await summary.click();}
function sharedPlacementFixture(placement){
 const raw=fixture(),tab=raw.page.blocks[0].tabs[0],story=tab.sections[1];tab.opening={section:'story',view:'standard'};story.defaultView='standard';
 story.views=[{id:'standard',name:'Standard',presentation:'standard',layout:'shared'},{id:'explore',name:'Explore',presentation:'explore',layout:'shared'}];
 story.diagram.layouts=[{id:'shared',name:'Imported shared arrangement',presentation:'explore',sectionLayout:{columns:24,default:[{controls:'steps',x:0,y:0,w:24,h:6},{x:0,y:6,w:24,h:16}]},exploreLayout:{controlsPlacement:placement,controlsScale:.9,controls:{x:.04,y:.72,w:.9,h:.2},canvas:{controls:{x:-120,y:420,w:840,h:220}},steps:{textPosition:'right'},camera:{zoom:.8,x:.4,y:.6}}}];
 return raw;
}
test('Contents uses one plain row for singleton Views and named subrows for multiple Views',async({page,server},info)=>{
 const root=await standalone(page,server),contents=nav(root).locator('.reader-contents');
 const pseudo=(row,part='::before')=>row.evaluate((el,part)=>getComputedStyle(el,part).content,part);
 const intro=contents.locator('.reader-tree-single-view[data-reader-section="intro"]');
 await expect(intro).toHaveText('Introduction');await expect(intro).toHaveAttribute('data-tab-view','standard');await expect(intro).not.toHaveAttribute('data-explore-view','true');await expect(intro).toHaveAttribute('aria-current','page');
 await expect(intro.locator('..').locator('.reader-tree-view')).toHaveCount(0);
 const tab=contents.locator('.reader-tree-tab'),storyHeading=contents.locator('.reader-tree-section[data-reader-section="story"]'),story=storyHeading.locator('..').locator('..');
 const views=story.locator('.reader-tree-view');await expect(views).toHaveText(['Business','Data']);
 expect(await pseudo(tab)).toBe('none');expect(await pseudo(tab,'::after')).toContain('⌄');expect(await pseudo(intro)).toBe('none');expect(await pseudo(storyHeading)).toBe('none');expect(await pseudo(views.first())).toBe('none');expect(await pseudo(views.last())).toBe('none');
 await story.locator('.reader-tree-view[data-tab-view="data"]').click();await intro.focus();await page.keyboard.press('Enter');
 await expect(intro).toBeFocused();await expect(intro).toHaveAttribute('aria-current','page');await expect(page).toHaveURL(/d=intro.*v=standard/);
 await info.attach('singleton-standard-and-multi-view-contents',{body:await page.screenshot(),contentType:'image/png'});

 const exploreRaw=fixture();exploreRaw.page.blocks[0].tabs[0].sections[0].views[0].presentation='explore';
 await standalone(page,server,exploreRaw);const explore=nav(root).locator('.reader-tree-single-view[data-reader-section="intro"]');
 await expect(explore).toHaveAttribute('data-explore-view','true');await expect(explore).toHaveAttribute('aria-description','Explore: pan and zoom the graph.');
 expect(await pseudo(explore)).toBe('none');
 await expect(explore.locator('..').locator('.reader-tree-view')).toHaveCount(0);
 await info.attach('singleton-explore-contents',{body:await page.screenshot(),contentType:'image/png'});
});
test('section pages replace the main surface, repeat local IDs safely and restore exact links/history',async({page,server},info)=>{
 const root=await standalone(page,server);await expect(nav(root).locator('.reader-page-label')).toHaveText('Page 1 of 3');await expect(root.locator('#section-intro')).toBeVisible();await expect(root.locator('#section-story')).toBeHidden();await expect(nav(root)).toHaveAttribute('data-reader-multiple-views','false');
 await nav(root).getByRole('button',{name:'Next page',exact:true}).click();await expect(nav(root).locator('.reader-page-label')).toHaveText('Page 2 of 3');await expect(nav(root)).toHaveAttribute('data-reader-multiple-views','true');await expect(root.locator('#section-intro')).toBeHidden();await expect(root.locator('#section-story')).toBeVisible();await expect(root.locator('#section-story .board')).toBeHidden();
 await nav(root).getByRole('button',{name:'Next page',exact:true}).click();await expect(nav(root).locator('.reader-page-label')).toHaveText('Page 3 of 3');await expect(root).toHaveClass(/explore-full-window/);await expect(root.locator('#section-story .explore-board')).toBeVisible();await expect(root.locator('.doc-sec[data-dv-section]:visible')).toHaveCount(1);await expect(page).toHaveURL(/d=story.*v=data/);await page.screenshot({path:info.outputPath('shared-data-explore.png')});
 await choose(root,'Business');await expect(root).not.toHaveClass(/explore-full-window/);await expect(root.locator('#section-story .board')).toBeHidden();
 await page.goBack();await expect(nav(root).locator('.reader-page-label')).toHaveText('Page 3 of 3');await page.reload();await expect(nav(root).locator('.reader-page-label')).toHaveText('Page 3 of 3');
 await page.goto(server.origin+'/section-owned.html#d=intro&v=standard');await expect(root.locator('#section-intro')).toBeVisible();await expect(nav(root).locator('.reader-page-label')).toHaveText('Page 1 of 3');
});
test('desktop Workbench local View edits, shared content, independent visibility and Undo',async({page,server})=>{
 await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(fixture(),null,2));await closeTools(page);const root=page.locator('#docview'),source=page.locator('#src');
 await expect(nav(root).locator('.reader-tree-single-view[data-reader-section="intro"]')).toHaveAttribute('data-tab-view','standard');await expect(nav(root).locator('.reader-tree-view[data-reader-section="story"]')).toHaveCount(2);
 await nav(root).getByRole('button',{name:'Shared story',exact:true}).first().click();await choose(root,'Data');
 const before=await source.inputValue();await viewOptions(root);await nav(root).getByRole('button',{name:'Duplicate View',exact:true}).click();let raw=JSON.parse(await source.inputValue()),section=raw.page.blocks[0].tabs[0].sections[1];expect(section.views).toHaveLength(3);expect(section.views[1].layout).not.toBe(section.views[2].layout);expect(section.diagram.nodes.service.title).toBe('Shared service');
 await page.locator('#undo-builder').click();await expect(source).toHaveValue(before);await page.locator('#redo-builder').click();await choose(root,'Data copy');
 await viewOptions(root);await nav(root).getByRole('button',{name:'Move View up',exact:true}).click();raw=JSON.parse(await source.inputValue());expect(raw.page.blocks[0].tabs[0].sections[1].views[1].name).toBe('Data copy');
 await viewOptions(root);await nav(root).getByRole('button',{name:'Delete View',exact:true}).click();raw=JSON.parse(await source.inputValue());expect(raw.page.blocks[0].tabs[0].sections[1].views).toHaveLength(2);
 await choose(root,'Data');await root.locator('#section-story [data-dv-node=service]').click();const name=page.locator('#guide').getByLabel('Name',{exact:true});await name.fill('Edited shared service');await name.press('Enter');await closeTools(page);
 await choose(root,'Business');await viewOptions(root);await nav(root).getByLabel('Show selected section diagram',{exact:true}).check();await expect(root.locator('#section-story [data-dv-node=service]')).toContainText('Edited shared service');
 await viewOptions(root);await nav(root).getByLabel('Show selected section diagram',{exact:true}).uncheck();await choose(root,'Data');await expect(root.locator('#section-story [data-dv-node=service]')).toBeVisible();await expect(root.locator('#section-story [data-dv-node=service]')).toContainText('Edited shared service');
 await viewOptions(root);await expect(nav(root).getByText('Sections in this View',{exact:true})).toHaveCount(0);
});
for(const placement of ['floating','canvas'])test(`canonical Standard ignores saved Explore ${placement} controls and preserves the shared arrangement`,async({page,server},testInfo)=>{
 const raw=sharedPlacementFixture(placement);await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(raw,null,2));
 const root=page.locator('#docview'),section=root.locator('#section-story'),source=page.locator('#src');await nav(root).getByRole('button',{name:'Shared story',exact:true}).first().click();await choose(root,'Standard');await closeTools(page);const original=await source.inputValue();
 await expect(section.locator('.explore-stage')).toBeHidden();await expect(section.locator('.standard-controls-player')).toHaveCount(0);await expect(section.locator('.section-layout-grid .termbar')).toBeVisible();
 await page.screenshot({path:testInfo.outputPath(`shared-${placement}-standard.png`)});
 const menu=await panelsOptions(page);await expect(menu.getByRole('combobox',{name:'Step controls placement',exact:true})).toHaveCount(0);await menu.locator('summary').click();
 await section.locator('.section-layout-grid .schips').click({position:{x:2,y:2}});await page.locator('#editor-tab-inspect').click();await expect(page.getByRole('combobox',{name:'Step controls placement',exact:true})).toHaveCount(0);await expect(source).toHaveValue(original);await closeTools(page);
 await choose(root,'Explore');await expect(section.locator(placement==='canvas'?'.explore-canvas-objects>.explore-player':'.explore-stage>.explore-player')).toBeVisible();await page.screenshot({path:testInfo.outputPath(`shared-${placement}-explore.png`)});await section.locator('.explore-player .stepline').click();await page.locator('#editor-tab-inspect').click();await expect(page.getByRole('combobox',{name:'Step controls placement',exact:true})).toHaveValue(placement);await expect(source).toHaveValue(original);await closeTools(page);
 await choose(root,'Standard');await expect(section.locator('.standard-controls-player')).toHaveCount(0);await expect(section.locator('.termbar')).toBeVisible();await expect(source).toHaveValue(original);
 await choose(root,'Explore');await expect(section.locator(placement==='canvas'?'.explore-canvas-objects>.explore-player':'.explore-stage>.explore-player')).toBeVisible();await expect(source).toHaveValue(original);
 await choose(root,'Standard');await viewOptions(root);await nav(root).getByRole('combobox',{name:'View presentation',exact:true}).selectOption('explore');
 const changed=await source.inputValue(),expected=JSON.parse(original);expected.page.blocks[0].tabs[0].sections[1].views[0].presentation='explore';expect(JSON.parse(changed)).toEqual(expected);
 await page.locator('#undo-builder').click();await expect(source).toHaveValue(original);await page.locator('#redo-builder').click();await expect(source).toHaveValue(changed);
});
test('native section View navigation isolates host state and rejects cross-section local IDs',async({page,server})=>{
 await writeFile(path.join(server.root,'section-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));await writeFile(path.join(server.root,'section-native.html'),'<style>.host{height:700px;overflow:auto;position:relative;width:48%;display:inline-block;vertical-align:top}</style><div class="host" id="one"></div><div class="host" id="two"></div><script type="module">import {mountNativeViewer} from "./section-native.js";window.mount=mountNativeViewer;</script>');await page.goto(server.origin+'/section-native.html');await page.waitForFunction(()=>!!window.mount);await page.evaluate(raw=>{window.first=mount(document.querySelector('#one'),raw);window.second=mount(document.querySelector('#two'),raw);first.setCanvas(true);},fixture());
 await expect(page.locator('#one .reader-tree-single-view[data-reader-section="intro"]')).toHaveAttribute('data-tab-view','standard');await expect(page.locator('#one .reader-tree-view[data-reader-section="story"]')).toHaveCount(2);
 await page.evaluate(()=>first.navigate({section:'story',view:'data'}));expect(await page.evaluate(()=>first.snapshot())).toMatchObject({section:'story',view:'data'});expect(await page.evaluate(()=>second.snapshot())).toMatchObject({section:'intro',view:'standard'});await expect(page.locator('#one #section-story .explore-board')).toBeVisible();await expect(page.locator('#two #section-intro')).toBeVisible();
 expect(await page.evaluate(()=>{try{first.navigate({section:'intro',view:'data'});return false;}catch{return true;}})).toBe(true);expect(await page.evaluate(()=>first.snapshot())).toMatchObject({section:'story',view:'data'});
 await page.evaluate(()=>first.navigate({section:'intro',view:'standard'}));await expect(page.locator('#one #section-intro')).toBeVisible();await page.evaluate(()=>{first.destroy();second.destroy();});await expect(page.locator('.explore-navigation')).toHaveCount(0);
});

test('legacy layout and flow links survive explicit conversion, reload and opening selection',async({page,server})=>{
 const {migrate}=await import('../../migrate-section-views.cjs');const raw=fixture(),tab=raw.page.blocks[0].tabs[0],story=tab.sections[1];tab.sections.forEach(s=>{delete s.views;});story.diagram.layouts[0].id='layout';story.diagram.layouts[1].id='flow';story.diagram.layouts[0].presentation='standard';story.diagram.layouts[1].presentation='explore';story.diagram.defaultLayout='flow';
 const before=JSON.stringify(raw),converted=migrate(raw).spec;expect(JSON.stringify(raw)).toBe(before);expect(converted.page.blocks[0].tabs[0].opening.section).toBe('story');
 for(const spec of [raw,converted]){
  const root=await standalone(page,server,spec);await expect(root.locator('#section-story .explore-board')).toBeVisible();
  await page.goto(server.origin+'/section-owned.html#d=story&v=layout');await page.reload();await expect(root).not.toHaveClass(/explore-full-window/);await expect(root.locator('#section-story')).toBeVisible();await expect(root.locator('#section-story .board')).toBeHidden();
  await page.goto(server.origin+'/section-owned.html#d=story&v=flow');await page.reload();await expect(root.locator('#section-story .explore-board')).toBeVisible();await expect(root.locator('#section-intro')).toBeHidden();
 }
});
