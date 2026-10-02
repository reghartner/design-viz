import {writeFile,readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {chooseAddDestination,test,expect,paste,closeTools} from '../helpers/test.mjs';
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
  {tabs:[{label:'First',sections:[section('first','First diagram')]},{label:'Second',sections:[section('second','Second diagram'),section('secondary','Secondary diagram')]}]},
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
 await page.getByRole('tab',{name:'Large story',exact:true}).click();
 await expect(page.locator('#section-large [data-dv-node="b0"]')).toBeInViewport();
 await expect(page.locator('#section-large [data-dv-node="b6"]')).toBeInViewport();
});

test('workbench entering Explore through an ordinary document tab frames its diagram',async({page,server})=>{
 const source=JSON.stringify(mixedFixture(),null,2);
 await page.goto(server.origin+'/workbench.html');await paste(page,source);await closeTools(page);
 await page.locator('#tab-0-1').click();
 await expect(page.locator('body')).toHaveClass(/workspace-diagram/);
 await expect(page.locator('#section-explore [data-view-layout][data-layout-id="explore"]')).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('#section-explore [data-dv-node="x0"]')).toBeInViewport();
 await expect(page.locator('#section-explore [data-dv-node="x6"]')).toBeInViewport();
 await expect(page.locator('.explore-navigation-tabs')).toBeVisible();await expect(page.locator('.explore-navigation-chapters')).toBeVisible();
 const board=page.locator('#section-explore .explore-board'),box=await board.boundingBox();
 await page.locator('#workspace-zoom-in').click();await page.locator('#workspace-pan').click();
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
 await page.mouse.move(box.x+box.width/2-70,box.y+box.height/2-45,{steps:6});await page.mouse.up();
 await page.locator('#workspace-pan').click();
 const camera=await board.evaluate(b=>({x:b.scrollLeft,y:b.scrollTop})),zoom=await page.locator('#workspace-zoom').textContent();
 await page.locator('#tab-0-0').click();
 await page.locator('#tab-0-0').press('ArrowRight');
 await expect(page.locator('body')).toHaveClass(/workspace-diagram/);
 await expect(page.locator('#workspace-zoom')).toHaveText(zoom);
 await expectCamera(board,camera);
 await board.evaluate(el=>el.style.display='none');
 await page.getByRole('button',{name:'Fresh view',exact:true}).click();await afterTwoFrames(page);
 await expect.poll(()=>board.evaluate(el=>el.clientWidth)).toBe(0);
 await page.evaluate(()=>{
  document.querySelector('#section-explore .board').style.removeProperty('display');
  Array.from(document.querySelectorAll('#section-explore .diagram-views button')).find(el=>el.textContent==='Explore').click();
 });
 await afterTwoFrames(page);
 await expect(page.locator('#workspace-zoom')).toHaveText(zoom);
 await expectCamera(board,camera);
 await page.getByRole('button',{name:'Fresh view',exact:true}).click();
 await expect(page.locator('#section-explore [data-dv-node="x0"]')).toBeInViewport();
 await expect(page.locator('#section-explore [data-dv-node="x6"]')).toBeInViewport();
 await afterTwoFrames(page);
 const freshCamera=await board.evaluate(b=>({x:b.scrollLeft,y:b.scrollTop})),freshZoom=await page.locator('#workspace-zoom').textContent();
 await page.locator('#workspace-fit').click();await expect(page.locator('#workspace-zoom')).toHaveText(freshZoom);
 await expect.poll(()=>board.evaluate(b=>({x:b.scrollLeft,y:b.scrollTop}))).toEqual(freshCamera);
 await page.getByRole('button',{name:'Authored',exact:true}).click();
 await expect(page.locator('#workspace-zoom')).toHaveText('55%');
 await page.getByRole('button',{name:'Explore',exact:true}).click();
 await expect(page.locator('#workspace-zoom')).toHaveText(zoom);
 await expectCamera(board,camera);
 await expect(page.locator('#diagram-add-target')).toHaveValue('2');
 await expect(page.locator('#src')).toHaveValue(source);await expect(page.locator('#undo-builder')).toBeDisabled();
});

test('reader entering Explore through an ordinary document tab frames its diagram',async({page,server})=>{
 await standalone(page,server,mixedFixture());
 const board=page.locator('#section-explore .board');await board.evaluate(el=>el.style.display='none');
 await page.locator('#tab-0-1').click();
 await expect(page.locator('body')).toHaveClass(/viewer-exploring/);
 await expect(page.locator('#section-explore [data-view-layout][data-layout-id="explore"]')).toHaveAttribute('aria-pressed','true');
 await afterTwoFrames(page);await expect.poll(()=>board.evaluate(el=>el.clientWidth)).toBe(0);
 await board.evaluate(el=>el.style.removeProperty('display'));
 await expect(page.locator('#section-explore [data-dv-node="x0"]')).toBeInViewport();
 await expect(page.locator('#section-explore [data-dv-node="x6"]')).toBeInViewport();
});

test('keyboard tab entry opens the default Explore view of a stepped story',async({page,server})=>{
 await standalone(page,server,steppedFixture());
 await page.locator('#tab-0-0').focus();await page.keyboard.press('ArrowRight');
 await expect(page.locator('#tab-0-1')).toHaveAttribute('aria-selected','true');
 await expect(page.locator('#tab-0-1')).toBeFocused();
 await expect(page.locator('body')).toHaveClass(/viewer-exploring/);
 await expect(page.locator('#section-explore [data-view-layout][data-layout-id="explore"]')).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('#section-explore .schip[aria-current="true"]')).toHaveText('1');
 await page.keyboard.press('Home');await expect(page.locator('#tab-0-0')).toBeFocused();
 await expect(page.locator('body')).not.toHaveClass(/viewer-exploring/);
 await page.keyboard.press('End');await expect(page.locator('#tab-0-1')).toBeFocused();
 await expect(page.locator('body')).toHaveClass(/viewer-exploring/);
});

test('Explore markers preserve labels and follow each tab primary view',async({page,server},info)=>{
 await standalone(page,server,mixedFixture());
 const standardTab=page.getByRole('tab',{name:'Standard story',exact:true});
 const exploreTab=page.getByRole('tab',{name:'Explore story',exact:true});
 await expect(standardTab).not.toHaveAttribute('data-explore-view','true');
 await expect(exploreTab).toHaveAttribute('data-explore-view','true');
 await expect(exploreTab.locator('.explore-indicator-badge')).toHaveCount(1);
 await expect(exploreTab).toHaveAttribute('aria-description',/pan.*zoom/);
 await exploreTab.click();
 const navigation=page.locator('.explore-navigation');await expect(navigation).toBeVisible();
 await expect(navigation.locator('.explore-navigation-group:not([hidden]) .explore-navigation-label')).toHaveText(['Tabs','Sections','Chapters']);
 await expect(navigation.getByRole('tab')).toHaveText(['Standard story','Explore story']);
 const destinationViews=page.locator('#section-explore .diagram-view-choice [data-view-layout]');
 await expect(destinationViews).toHaveCount(3);
 for(const name of ['Explore','Fresh view','Authored']){
  const button=page.getByRole('button',{name,exact:true});await expect(button).toHaveAttribute('data-explore-view','true');
  await expect(button).toHaveAttribute('aria-description',/pan.*zoom/);
 }
 const desktop=info.outputPath('explore-navigation-desktop.png');await page.screenshot({path:desktop});
 await info.attach('explore-navigation-desktop',{path:desktop,contentType:'image/png'});
 const fresh=page.getByRole('button',{name:'Fresh view',exact:true});await fresh.focus();await page.keyboard.press('Enter');
 await expect(fresh).toHaveAttribute('aria-pressed','true');await page.getByRole('button',{name:'Explore',exact:true}).click();
 await standardTab.click();
 await page.getByRole('button',{name:'Source Explore',exact:true}).click();
 await expect(standardTab).toHaveAttribute('data-explore-view','true');
 await page.getByRole('button',{name:'Standard',exact:true}).click();
 await expect(standardTab).not.toHaveAttribute('data-explore-view','true');
 await page.setViewportSize({width:480,height:720});
 const narrowFixture=mixedFixture();narrowFixture.page.blocks[0].tabs[0].sections[0].diagram.rows=[['s0'],['s1']];
 await standalone(page,server,narrowFixture);await page.getByRole('button',{name:'Source Explore',exact:true}).click();
 await expect(page.locator('.explore-navigation-tabs')).toBeVisible();await expect(page.locator('.explore-navigation-chapters')).toBeVisible();
 await expect(page.locator('#section-standard [data-dv-node="s0"]')).toBeInViewport();
 await expect(page.locator('#section-standard [data-dv-node="s1"]')).toBeInViewport();
 await expect.poll(()=>page.evaluate(()=>{
  const bar=document.querySelector('.explore-full-window .diagram-views'),stage=document.querySelector('.explore-full-window .explore-stage'),tools=stage&&stage.querySelector('.explore-tools');
  if(!bar || !stage || !tools)return false;const b=bar.getBoundingClientRect(),s=stage.getBoundingClientRect(),t=tools.getBoundingClientRect();
  return s.top>=b.bottom && t.top>=s.top && t.bottom<=s.bottom;
 })).toBe(true);
 const narrow=info.outputPath('explore-navigation-narrow.png');await page.screenshot({path:narrow});
 await info.attach('explore-navigation-narrow',{path:narrow,contentType:'image/png'});
});

test('Explore top bar keeps every tab block and untabbed or secondary diagram reachable',async({page,server})=>{
 await standalone(page,server,navigationFixture());
 const navigation=page.locator('.explore-navigation');await expect(navigation).toBeVisible();
 await expect(navigation.getByRole('tablist')).toHaveCount(2);
 await expect(navigation.getByRole('tab')).toHaveText(['First','Second','Third','Fourth']);
 await navigation.getByRole('tab',{name:'Fourth',exact:true}).click();
 await expect(page.locator('#section-fourth [data-dv-node="f0"]')).toBeInViewport();
 await navigation.getByRole('button',{name:'Loose diagram',exact:true}).click();
 await expect(page.locator('#section-loose [data-dv-node="l0"]')).toBeInViewport();
 await navigation.getByRole('tab',{name:'Second',exact:true}).click();
 await navigation.getByRole('button',{name:'Secondary diagram',exact:true}).click();
 await expect(page.locator('#section-secondary [data-dv-node="s0"]')).toBeInViewport();
});

test('workbench diagram buttons update editing context without changing source or Undo',async({page,server})=>{
 const raw=navigationFixture(),source=JSON.stringify(raw,null,2);
 await page.goto(server.origin+'/workbench.html');await paste(page,source);await closeTools(page);
 const navigation=page.locator('.explore-navigation');await navigation.getByRole('button',{name:'Loose diagram',exact:true}).click();
 await expect(page.locator('#section-loose [data-dv-node="l0"]')).toBeInViewport();await expect(page.locator('#diagram-add-target')).toHaveValue('3');
 await navigation.getByRole('tab',{name:'Second',exact:true}).click();
 await navigation.getByRole('button',{name:'Secondary diagram',exact:true}).click();
 await expect(page.locator('#section-secondary [data-dv-node="s0"]')).toBeInViewport();await expect(page.locator('#diagram-add-target')).toHaveValue('2');
 await expect(page.locator('#src')).toHaveValue(source);await expect(page.locator('#undo-builder')).toBeDisabled();
});

test('native setCanvas reuses tabs and Chapters, then restores and isolates their DOM',async({page,server},info)=>{
 await writeFile(path.join(server.root,'chapter-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
 await writeFile(path.join(server.root,'chapter-native.html'),'<style>#one{position:fixed;inset:0}#two{display:none}</style><div id="one"></div><div id="two"></div><script type="module">import {mountNativeViewer} from "./chapter-native.js";window.mount=mountNativeViewer;</script>');
 await page.goto(server.origin+'/chapter-native.html');await page.waitForFunction(()=>!!window.mount);
 await page.evaluate(raw=>{window.one=mount(document.querySelector('#one'),raw);window.two=mount(document.querySelector('#two'),raw);one.setCanvas(true);},mixedFixture());
 const one=page.locator('#one'),two=page.locator('#two');
 await expect(one.getByRole('combobox',{name:'Explore story'})).toHaveCount(0);
 await expect(one.locator('.explore-navigation-tabs')).toBeVisible();await expect(one.locator('.explore-navigation-chapters')).toBeVisible();
 await one.getByRole('tab',{name:'Explore story',exact:true}).click();
 await expect(one.locator('#section-explore [data-dv-node="x0"]')).toBeInViewport();
 await expect(one.getByRole('button',{name:'Fresh view',exact:true})).toBeVisible();
 await expect(one.getByRole('tab',{name:'Explore story',exact:true}).locator('.explore-indicator-badge svg')).toBeVisible();await expect(one.getByRole('button',{name:'Explore',exact:true}).locator('.explore-indicator-badge svg')).toBeVisible();await info.attach('native-monitor-icons',{body:await page.screenshot(),contentType:'image/png'});
 await expect(two.locator('.explore-navigation')).toHaveCount(0);await expect(two.locator('.docview > .tabbar')).toHaveCount(1);
 await page.evaluate(()=>one.setCanvas(false));
 await expect(one.locator('.explore-navigation')).toHaveCount(0);await expect(one.locator('.docview > .tabbar')).toHaveCount(1);
 await expect(one.locator('#section-explore .diagram-views > .diagram-view-choice')).toHaveCount(1);
 await page.evaluate(()=>{one.setCanvas(true);one.destroy();});await expect(one).toBeEmpty();
 await expect(two.locator('.docview > .tabbar')).toHaveCount(1);await page.evaluate(()=>two.destroy());
});

test('native canvas keeps legacy Standard tabs reachable without Chapter controls',async({page,server})=>{
 await writeFile(path.join(server.root,'legacy-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
 await writeFile(path.join(server.root,'legacy-native.html'),'<style>#host{position:fixed;inset:0}</style><div id="host"></div><script type="module">import {mountNativeViewer} from "./legacy-native.js";window.mount=mountNativeViewer;</script>');
 await page.goto(server.origin+'/legacy-native.html');await page.waitForFunction(()=>!!window.mount);
 await page.evaluate(raw=>{window.viewer=mount(document.querySelector('#host'),raw);viewer.setCanvas(true);},legacyFixture());
 const host=page.locator('#host');await expect(host.locator('.explore-navigation-tabs')).toBeVisible();
 await expect(host.locator('.explore-navigation-chapters')).toBeHidden();
 await host.getByRole('tab',{name:'Large story',exact:true}).click();
 await expect(host.locator('#section-large [data-dv-node="b0"]')).toBeInViewport();
 await expect.poll(()=>page.evaluate(()=>viewer.snapshot()?.section)).toBe('large');
 await page.evaluate(()=>viewer.setCanvas(false));await expect(host.locator('.explore-navigation')).toHaveCount(0);
 await expect(host.locator('.docview > .tabbar')).toHaveCount(1);await page.evaluate(()=>viewer.destroy());
});

for(const primary of ['standard','explore'])test('reader tab navigation follows its '+primary+' primary diagram',async({page,server})=>{
 await standalone(page,server,orderedTabFixture(primary,true));
 const tab=page.getByRole('tab',{name:'Combined',exact:true});
 if(primary==='explore')await expect(tab).toHaveAttribute('data-explore-view','true');
 else await expect(tab).not.toHaveAttribute('data-explore-view','true');
 await tab.click();
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
 const tab=page.getByRole('tab',{name:'Combined',exact:true});
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
