import {writeFile,readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {chooseAddDestination,chooseNavigation,test,expect,paste,closeTools} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';

function diagram(prefix,count,camera,presentation='explore'){
 const ids=Array.from({length:count},(_,i)=>prefix+i),nodes={};
 ids.forEach((id,i)=>nodes[id]={title:prefix.toUpperCase()+' '+(i+1)});
 const exploreLayout=camera?{camera}:undefined;
 return {nodes,rows:[ids],layouts:[{id:presentation,name:presentation==='explore'?'Explore':'Standard',presentation,
  sectionLayout:{default:[{x:0,y:0,w:12,h:12}]},...(exploreLayout?{exploreLayout}: {})}],defaultLayout:presentation};
}
function mixedFixture(){
 const standard=diagram('s',2,null,'standard');
 standard.layouts.push({id:'source-explore',name:'Source Explore',presentation:'explore',sectionLayout:{default:[{x:0,y:0,w:12,h:12}]}});
 const explore=diagram('x',7);
 explore.layouts.push({id:'fresh',name:'Fresh view',presentation:'explore',sectionLayout:{default:[{x:0,y:0,w:12,h:12}]}});
 explore.layouts.push({id:'authored',name:'Authored',presentation:'explore',
  sectionLayout:{default:[{x:0,y:0,w:12,h:12}]},exploreLayout:{camera:{zoom:.55,x:.5,y:.5}}});
 return {page:{title:'Mixed stories',blocks:[{tabs:[
  {label:'Standard story',sections:[{id:'standard',heading:'Standard story',diagram:standard}]},
  {label:'Explore story',sections:[{id:'context',heading:'Context',text:'Read this first.'},{id:'explore',heading:'Explore story',diagram:explore}]}
 ]}]}};
}
function steppedFixture(){
 const raw=mixedFixture(),target=raw.page.blocks[0].tabs[1].sections[1].diagram;
 target.view='step';target.steps=[{id:'start',text:'Start',nodes:['x0']},{id:'finish',text:'Finish',nodes:['x6']}];
 return raw;
}
function orderedDiagrams(primary){
 const first=diagram('p',3,null,primary),later=diagram('l',4,null,primary==='explore'?'standard':'explore');
 return [{id:'primary',heading:'Primary diagram',diagram:first},{id:'later',heading:'Later diagram',diagram:later}];
}
function orderedTabFixture(primary,withSource){
 const tab={label:'Combined',sections:orderedDiagrams(primary)};
 return {page:{title:'Primary view ownership',blocks:[{tabs:withSource?[
  {label:'Source',sections:[{id:'source',heading:'Source',diagram:diagram('s',2,null,'standard')}]},tab]:[tab]}]}};
}
function navigationFixture(){
 const section=(id,label)=>({id,heading:label,diagram:diagram(id.slice(0,1),2)});
 return {page:{title:'Navigation hierarchy',blocks:[
  {tabs:[{label:'First',sections:[section('first','First diagram')]},{label:'Second',sections:[section('second','Second diagram'),section('secondary','Secondary diagram')],views:[{id:'both',name:'Both diagrams',presentation:'explore',sections:['second','secondary']}],defaultView:'both'}]},
  section('loose','Loose diagram'),
  {tabs:[{label:'Third',sections:[section('third','Third diagram')]},{label:'Fourth',sections:[section('fourth','Fourth diagram')]}]}
 ]}};
}
function fixture(){
 return {page:{title:'Explore stories',blocks:[{tabs:[
  {label:'Small story',sections:[{id:'small',heading:'Small story',diagram:diagram('a',2)}]},
  {label:'Large story',sections:[{id:'large',heading:'Large story',diagram:diagram('b',7)}]}
 ]}]}};
}
function legacyFixture(){
 const raw=fixture();raw.page.title='Legacy diagrams';
 raw.page.blocks[0].tabs.forEach(tab=>tab.sections.forEach(section=>{delete section.diagram.layouts;delete section.diagram.defaultLayout;}));
 return raw;
}
async function standalone(page,server,raw){
 const input=path.join(server.root,'canvas-tab-entry.json'),output=path.join(server.root,'canvas-tab-entry.html');
 await writeFile(input,JSON.stringify(raw));
 execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),output]);
 await page.goto(server.origin+'/canvas-tab-entry.html');
}
async function readerTab(root,name){await chooseNavigation(root.locator('.reader-navigation'),'Tab',name);}
async function afterTwoFrames(page){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
async function expectCamera(board,expected,tolerance=1){
 await expect.poll(async()=>{const current=await board.evaluate(b=>({x:b.scrollLeft,y:b.scrollTop}));return Math.max(Math.abs(current.x-expected.x),Math.abs(current.y-expected.y));}).toBeLessThanOrEqual(tolerance);
}

test('workbench first entry into a hidden Explore tab frames its diagram',async({page,server})=>{
 const source=JSON.stringify(fixture(),null,2);
 await page.goto(server.origin+'/workbench.html');await paste(page,source);await closeTools(page);
 const board=page.locator('#section-large .board');await board.evaluate(el=>el.style.display='none');
 await chooseAddDestination(page,'1');
 await expect(page.locator('#tab-0-1')).toHaveAttribute('aria-selected','true');
 await afterTwoFrames(page);await expect.poll(()=>board.evaluate(el=>el.clientWidth)).toBe(0);
 await board.evaluate(el=>el.style.removeProperty('display'));
 await expect(page.locator('#section-large [data-dv-node="b0"]')).toBeInViewport();
 await expect(page.locator('#section-large [data-dv-node="b6"]')).toBeInViewport();
 await expect(page.locator('#src')).toHaveValue(source);await expect(page.locator('#undo-builder')).toBeDisabled();
});

test('reader first entry into a hidden Explore story frames its diagram',async({page,server})=>{
 await standalone(page,server,fixture());
 await readerTab(page,'Large story');
 await expect(page.locator('#section-large [data-dv-node="b0"]')).toBeInViewport();
 await expect(page.locator('#section-large [data-dv-node="b6"]')).toBeInViewport();
});

test('workbench entering Explore through an ordinary document tab frames its diagram',async({page,server})=>{
 const source=JSON.stringify(mixedFixture(),null,2);
 await page.goto(server.origin+'/workbench.html');await paste(page,source);await closeTools(page);
 const navigation=page.locator('#docview>.explore-navigation');await chooseNavigation(navigation,'Tab','Explore story');
 await expect(page.locator('body')).toHaveClass(/workspace-diagram/);
 await expect(page.locator('#section-explore [data-view-layout][data-layout-id="explore"]')).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('#section-explore [data-dv-node="x0"]')).toBeInViewport();
 await expect(page.locator('#section-explore [data-dv-node="x6"]')).toBeInViewport();
 await expect(navigation.locator('.reader-contents')).toBeVisible();await expect(navigation.getByRole('tab',{name:'Explore',exact:true})).toBeVisible();
 const board=page.locator('#section-explore .explore-board'),box=await board.boundingBox();
 await page.locator('#docview>.explore-navigation').getByRole('button',{name:/^(?:Canvas zoom|Diagram zoom|Zoom) in$/,exact:true}).click();await page.locator('#workspace-pan').click();
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
 await page.mouse.move(box.x+box.width/2-70,box.y+box.height/2-45,{steps:6});await page.mouse.up();
 await page.locator('#workspace-pan').click();
 const zoomControl=navigation.locator('.reader-zoom-menu>summary'),camera=await board.evaluate(b=>({x:b.scrollLeft,y:b.scrollTop})),zoom=await zoomControl.textContent();
 await chooseNavigation(navigation,'Tab','Standard story');
 await chooseNavigation(navigation,'Tab','Explore story');
 await expect(page.locator('body')).toHaveClass(/workspace-diagram/);
 await expect(zoomControl).toHaveText(zoom);
 await expectCamera(board,camera);
 await board.evaluate(el=>el.style.display='none');
 await page.getByRole('button',{name:'Fresh view',exact:true}).click();await afterTwoFrames(page);
 await expect.poll(()=>board.evaluate(el=>el.clientWidth)).toBe(0);
 await board.evaluate(el=>el.style.removeProperty('display'));
 await navigation.getByRole('tab',{name:'Explore',exact:true}).click();
 await afterTwoFrames(page);
 await expect(zoomControl).toHaveText(zoom);
 await expectCamera(board,camera);
 await page.getByRole('button',{name:'Fresh view',exact:true}).click();
 await expect(page.locator('#section-explore [data-dv-node="x0"]')).toBeInViewport();
 await expect(page.locator('#section-explore [data-dv-node="x6"]')).toBeInViewport();
 await afterTwoFrames(page);
 const freshCamera=await board.evaluate(b=>({x:b.scrollLeft,y:b.scrollTop})),freshZoom=await zoomControl.textContent();
 await page.locator('#docview>.explore-navigation').getByRole('button',{name:/^Fit(?: canvas| diagram)?$/,exact:true}).click();await expect(zoomControl).toHaveText(freshZoom);
 await expect.poll(()=>board.evaluate(b=>({x:b.scrollLeft,y:b.scrollTop}))).toEqual(freshCamera);
 await page.getByRole('button',{name:'Authored',exact:true}).click();
 await expect(zoomControl).toContainText('55%');
 await page.getByRole('button',{name:'Explore',exact:true}).click();
 await expect(zoomControl).toHaveText(zoom);
 await expectCamera(board,camera);
 await expect(page.locator('#diagram-add-target')).toHaveValue('2');
 await expect(page.locator('#src')).toHaveValue(source);await expect(page.locator('#undo-builder')).toBeDisabled();
});

test('reader entering Explore through an ordinary document tab frames its diagram',async({page,server})=>{
 await standalone(page,server,mixedFixture());
 const board=page.locator('#section-explore .board');await board.evaluate(el=>el.style.display='none');
 await readerTab(page,'Explore story');
 await expect(page.locator('body')).toHaveClass(/viewer-exploring/);
 await expect(page.locator('#section-explore [data-view-layout][data-layout-id="explore"]')).toHaveAttribute('aria-pressed','true');
 await afterTwoFrames(page);await expect.poll(()=>board.evaluate(el=>el.clientWidth)).toBe(0);
 await board.evaluate(el=>el.style.removeProperty('display'));
 await expect(page.locator('#section-explore [data-dv-node="x0"]')).toBeInViewport();
 await expect(page.locator('#section-explore [data-dv-node="x6"]')).toBeInViewport();
});

test('keyboard Contents entry opens the default Explore view of a stepped story',async({page,server})=>{
 await standalone(page,server,steppedFixture());
 const tab=page.locator('.reader-tree-tab').filter({hasText:'Explore story'});await expect(tab).toHaveAttribute('aria-expanded','true');
 const view=page.locator('.reader-tree-view').filter({hasText:/^Explore$/});await view.focus();await page.keyboard.press('Enter');
 await expect(page.locator('#tab-0-1')).toHaveAttribute('aria-selected','true');await expect(view).toBeFocused();
 await expect(page.locator('body')).toHaveClass(/viewer-exploring/);
 await expect(page.locator('#section-explore [data-view-layout][data-layout-id="explore"]')).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('#section-explore .schip[aria-current="true"]')).toHaveText('1');
 const standard=page.locator('.reader-contents-tab').filter({has:page.locator('.reader-tree-tab').filter({hasText:'Standard story'})}).getByRole('button',{name:'Standard',exact:true});await standard.focus();await page.keyboard.press('Enter');
 await expect(standard).toBeFocused();await expect(page.locator('body')).not.toHaveClass(/viewer-exploring/);
 await view.focus();await page.keyboard.press('Enter');await expect(view).toBeFocused();await expect(page.locator('body')).toHaveClass(/viewer-exploring/);
});

test('Explore markers preserve labels and follow each tab primary view',async({page,server},info)=>{
 await standalone(page,server,mixedFixture());
 const standardTab=page.getByRole('tab',{name:'Standard story',exact:true,includeHidden:true});
 const exploreTab=page.getByRole('tab',{name:'Explore story',exact:true,includeHidden:true});
 await expect(standardTab).not.toHaveAttribute('data-explore-view','true');await expect(exploreTab).toHaveAttribute('data-explore-view','true');
 await readerTab(page,'Explore story');const navigation=page.locator('.reader-navigation');
 // #622 numbers each top-level Contents entry to match the section rail.
 await expect(navigation.locator('.reader-tree-tab')).toHaveText(['1Standard story','2Explore story']);
 await expect(page.locator('#section-explore .diagram-view-choice [data-view-layout]')).toHaveCount(3);
 for(const name of ['Explore','Fresh view','Authored']){const button=navigation.getByRole('button',{name,exact:true});await expect(button).toHaveAttribute('data-explore-view','true');await expect(button).toHaveAttribute('aria-description',/pan.*zoom/);}
 await info.attach('explore-navigation-desktop',{body:await page.screenshot(),contentType:'image/png'});
 const fresh=navigation.getByRole('button',{name:'Fresh view',exact:true});await fresh.focus();await page.keyboard.press('Enter');await expect(fresh).toHaveAttribute('aria-pressed','true');
 await navigation.getByRole('button',{name:'Explore',exact:true}).click();await readerTab(page,'Standard story');
 await navigation.getByRole('button',{name:'Source Explore',exact:true}).click();await expect(standardTab).toHaveAttribute('data-explore-view','true');
 await navigation.locator('.reader-contents-tab').filter({has:page.locator('.reader-tree-tab').filter({hasText:'Standard story'})}).getByRole('button',{name:'Standard',exact:true}).click();await expect(standardTab).not.toHaveAttribute('data-explore-view','true');
 await page.setViewportSize({width:480,height:720});const raw=mixedFixture();raw.page.blocks[0].tabs[0].sections[0].diagram.rows=[['s0'],['s1']];await standalone(page,server,raw);
 await chooseNavigation(page.locator('.reader-navigation'),'View','Source Explore');
 await expect(page.locator('.reader-contents')).toBeHidden();await expect(page.locator('.reader-top-view[aria-selected=true]')).toHaveText('Source Explore');
 for(const id of ['s0','s1'])await expect(page.locator('#section-standard [data-dv-node="'+id+'"]').first()).toBeInViewport();
 const nav=await navigation.boundingBox(),top=await navigation.locator('.reader-top').boundingBox(),stage=await page.locator('.explore-active-section .explore-stage').boundingBox(),toolbar=await page.locator('.reader-toolbar').boundingBox();
 expect(stage.y).toBe(nav.y+nav.height);expect(Math.abs(top.width-nav.width)).toBeLessThanOrEqual(1);expect(toolbar.x).toBeGreaterThanOrEqual(top.x);expect(toolbar.x+toolbar.width).toBeLessThanOrEqual(top.x+top.width);expect(toolbar.y+toolbar.height).toBeLessThanOrEqual(stage.y);
 await page.locator('.reader-zoom-menu>summary').click();for(const name of ['Fit diagram','Fit width','Readable','Auto'])await expect(page.locator('.reader-zoom-options').getByRole('button',{name,exact:true})).toHaveCount(0);
 await info.attach('explore-navigation-narrow',{body:await page.screenshot(),contentType:'image/png'});
});

test('Explore top bar keeps every tab block reachable and restricts section navigation to its View',async({page,server})=>{
 await standalone(page,server,navigationFixture());
 const navigation=page.locator('.explore-navigation');await expect(navigation).toBeVisible();
 await expect(navigation.locator('.tabbar[role=tablist]')).toHaveCount(2);
 await expect(navigation.locator('.reader-tree-tab')).toHaveText(['1Navigation hierarchy','2First','3Second','4Third','5Fourth']);
 await chooseNavigation(navigation,'Tab','Fourth');
 await expect(page.locator('#section-fourth [data-dv-node="f0"]')).toBeInViewport();
 await expect(navigation.getByRole('button',{name:'Loose diagram',exact:true})).toHaveAttribute('aria-current','false');
 await page.evaluate(()=>{location.hash='d=loose&v=explore';});
 await expect(page.locator('#section-loose [data-dv-node="l0"]')).toBeInViewport();
 await chooseNavigation(navigation,'Tab','Second');
 await navigation.getByRole('button',{name:'Secondary diagram',exact:true}).click();
 await expect(page.locator('#section-secondary [data-dv-node="s0"]')).toBeInViewport();
});

test('workbench diagram buttons update editing context without changing source or Undo',async({page,server})=>{
 const raw=navigationFixture(),source=JSON.stringify(raw,null,2);
 await page.goto(server.origin+'/workbench.html');await paste(page,source);await closeTools(page);
 const navigation=page.locator('.explore-navigation');await expect(navigation.getByRole('button',{name:'Loose diagram',exact:true})).toHaveAttribute('aria-current','false');
 await chooseAddDestination(page,'3');
 await expect(page.locator('#section-loose [data-dv-node="l0"]')).toBeInViewport();await expect(page.locator('#diagram-add-target')).toHaveValue('3');
 await chooseNavigation(navigation,'Tab','Second');
 await navigation.getByRole('button',{name:'Secondary diagram',exact:true}).click();
 await expect(page.locator('#section-secondary [data-dv-node="s0"]')).toBeInViewport();await expect(page.locator('#diagram-add-target')).toHaveValue('2');
 await expect(page.locator('#src')).toHaveValue(source);await expect(page.locator('#undo-builder')).toBeDisabled();
});

test('native setCanvas preserves persistent tabs and Views and isolates sibling DOM',async({page,server},info)=>{
 await writeFile(path.join(server.root,'chapter-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
 await writeFile(path.join(server.root,'chapter-native.html'),'<style>#one{position:fixed;inset:0}#two{display:none}</style><div id="one"></div><div id="two"></div><script type="module">import {mountNativeViewer} from "./chapter-native.js";window.mount=mountNativeViewer;</script>');
 await page.goto(server.origin+'/chapter-native.html');await page.waitForFunction(()=>!!window.mount);
 await page.evaluate(raw=>{window.one=mount(document.querySelector('#one'),raw);window.two=mount(document.querySelector('#two'),raw);one.setCanvas(true);},mixedFixture());
 const one=page.locator('#one'),two=page.locator('#two');
 await one.locator('.explore-navigation').evaluate(el=>window.oneNav=el);await two.locator('.explore-navigation').evaluate(el=>window.twoNav=el);
 const sibling=await page.evaluate(()=>two.snapshot());
 await expect(one.getByRole('combobox',{name:'Explore story'})).toHaveCount(0);
 await expect(one.locator('.reader-contents')).toBeVisible();await expect(one.locator('.reader-tree-views')).toHaveCount(2);for(const views of await one.locator('.reader-tree-views').all())await expect(views).toBeVisible();
 await readerTab(one,'Explore story');
 await expect(one.locator('#section-explore [data-dv-node="x0"]')).toBeInViewport();
 await expect(one.getByRole('button',{name:'Fresh view',exact:true})).toBeVisible();
 await expect(one.locator('.reader-tab-label')).toHaveText('Explore story');await expect(one.getByRole('button',{name:'Explore',exact:true})).toHaveAttribute('data-explore-view','true');await info.attach('native-monitor-icons',{body:await page.screenshot(),contentType:'image/png'});
 await expect(two.locator('.explore-navigation')).toHaveCount(1);await expect(two.locator('.explore-navigation .tabbar')).toHaveCount(1);expect(await page.evaluate(()=>two.snapshot())).toEqual(sibling);
 await page.evaluate(()=>one.setCanvas(false));
 expect(await one.locator('.explore-navigation').evaluate(el=>el===window.oneNav)).toBe(true);
 await expect(one.locator('.explore-navigation .tabbar')).toHaveCount(1);await expect(one.getByRole('button',{name:'Explore',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(one.locator('#section-explore .diagram-views > .diagram-view-choice')).toHaveCount(1);
 await page.evaluate(()=>{one.setCanvas(true);one.destroy();});await expect(one).toBeEmpty();
 expect(await two.locator('.explore-navigation').evaluate(el=>el===window.twoNav)).toBe(true);await expect(two.locator('.explore-navigation .tabbar')).toHaveCount(1);expect(await page.evaluate(()=>two.snapshot())).toEqual(sibling);await page.evaluate(()=>two.destroy());
});

test('native canvas preserves legacy Standard presentation and persistent navigation',async({page,server})=>{
 await writeFile(path.join(server.root,'legacy-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
 await writeFile(path.join(server.root,'legacy-native.html'),'<style>#host{position:fixed;inset:0}</style><div id="host"></div><script type="module">import {mountNativeViewer} from "./legacy-native.js";window.mount=mountNativeViewer;</script>');
 await page.goto(server.origin+'/legacy-native.html');await page.waitForFunction(()=>!!window.mount);
 await page.evaluate(raw=>{window.viewer=mount(document.querySelector('#host'),raw);viewer.setCanvas(true);},legacyFixture());
 const host=page.locator('#host');await expect(host.locator('.reader-contents')).toBeVisible();
 await expect(host.locator('.explore-navigation .reader-contents-tab:has(.reader-tree-view[aria-current="page"])').getByRole('button',{name:'Standard',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(host.locator('.viewer-diagram-canvas')).toHaveCount(0);await host.locator('.explore-navigation').evaluate(el=>window.nativeNav=el);
 await readerTab(host,'Large story');
 await expect(host.locator('#section-large [data-dv-node="b0"]')).toBeInViewport();
 await expect.poll(()=>page.evaluate(()=>viewer.snapshot()?.section)).toBe('large');
 await page.evaluate(()=>viewer.setCanvas(false));expect(await host.locator('.explore-navigation').evaluate(el=>el===window.nativeNav)).toBe(true);
 await expect(host.locator('.explore-navigation .tabbar')).toHaveCount(1);await expect(host.getByRole('tab',{includeHidden:true,name:'Large story',exact:true})).toHaveAttribute('aria-selected','true');await page.evaluate(()=>viewer.destroy());
});

for(const primary of ['standard','explore'])test('reader tab navigation follows its '+primary+' primary diagram',async({page,server})=>{
 await standalone(page,server,orderedTabFixture(primary,true));
 const tab=page.getByRole('tab',{includeHidden:true,name:'Combined',exact:true});
 if(primary==='explore')await expect(tab).toHaveAttribute('data-explore-view','true');
 else await expect(tab).not.toHaveAttribute('data-explore-view','true');
 await readerTab(page,'Combined');
 if(primary==='explore'){
  await expect(page.locator('body')).toHaveClass(/viewer-exploring/);
  await expect(page.locator('#section-primary [data-dv-node="p0"]')).toBeInViewport();
 }else{
  await expect(page.locator('body')).not.toHaveClass(/viewer-exploring/);
  await expect(page.locator('#section-primary')).toBeVisible();
 }
});

for(const primary of ['standard','explore'])test('reader initial tab state follows its '+primary+' primary diagram',async({page,server})=>{
 await standalone(page,server,orderedTabFixture(primary,false));
 const tab=page.getByRole('tab',{includeHidden:true,name:'Combined',exact:true});
 if(primary==='explore'){
  await expect(tab).toHaveAttribute('data-explore-view','true');
  await expect(page.locator('body')).toHaveClass(/viewer-exploring/);
  await expect(page.locator('#section-primary [data-dv-node="p0"]')).toBeInViewport();
 }else{
  await expect(tab).not.toHaveAttribute('data-explore-view','true');
  await expect(page.locator('body')).not.toHaveClass(/viewer-exploring/);
  await expect(page.locator('#section-primary')).toBeVisible();
 }
});
