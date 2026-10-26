import {test,expect,paste,closeTools,chooseNavigation} from '../helpers/test.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {repo} from '../helpers/prepare.mjs';
const fixture=async()=>JSON.parse(await readFile(path.join(repo,'examples/tab-views/tab-views.spec.json'),'utf8'));
async function standalone(page,server,raw){raw=raw || await fixture();raw.page.blocks[0].tabs[0].sections[2].text=Array.from({length:30},()=> 'Section C explains the shared content across Views.');await writeFile(path.join(server.root,'tab-views.json'),JSON.stringify(raw));execFileSync('python3',[path.join(repo,'tools/inject.py'),path.join(server.root,'tab-views.json'),path.join(repo,'template/flowview.html'),path.join(server.root,'tab-views.html')]);await page.goto(server.origin+'/tab-views.html');return page.locator('#docview');}
const nav=root=>root.locator('.explore-navigation').first();
async function chooseView(root,name){await chooseNavigation(nav(root),'View',name);}
async function chooseTab(root,name){await chooseNavigation(nav(root),'Tab',name);}
const visible=root=>root.locator('.doc-sec[data-dv-section]:visible');
for(const width of [1280,1440])test(`Legacy Views select single section occurrences and retain browser-top navigation at ${width}`,async({page,server},info)=>{
 await page.setViewportSize({width,height:950});const root=await standalone(page,server);
 await expect(nav(root).getByRole('tab',{name:'Product',exact:true,includeHidden:true})).not.toHaveAttribute('data-explore-view','true');
 await expect(visible(root)).toHaveCount(1);await expect(root.locator('#section-b')).toBeHidden();await expect(root.locator('#section-detail')).toBeHidden();
 await nav(root).evaluate(el=>{window.savedNav=el;});
 const geometry=async()=>nav(root).evaluate(el=>({same:el===window.savedNav,y:el.getBoundingClientRect().y,width:el.getBoundingClientRect().width}));
 expect(await geometry()).toEqual({same:true,y:0,width});await page.evaluate(()=>scrollTo(0,500));expect(await geometry()).toEqual({same:true,y:0,width});
 await chooseView(root,'Explore B + C');await expect(nav(root).getByRole('tab',{name:'Product',exact:true,includeHidden:true})).toHaveAttribute('data-explore-view','true');await expect(visible(root)).toHaveCount(1);await expect(root.locator('#section-b')).toBeVisible();
 await expect(nav(root).locator('.reader-tree-sections[data-reader-view=explore-bc] .reader-tree-section')).toHaveText(['Section B','Section C']);await nav(root).locator('.reader-tree-sections[data-reader-view=explore-bc]').getByRole('button',{name:'Section C',exact:true}).click();await expect(root.locator('#section-c .explore-board')).toBeVisible();await expect(root.locator('#section-b')).toBeHidden();
 await expect(root.locator('.explore-player:visible')).toHaveCount(1);expect(await geometry()).toEqual({same:true,y:0,width});
 await chooseView(root,'Explore A');await expect(root.locator('#section-a .explore-board')).toBeVisible();await expect(root.locator('#section-b')).toBeHidden();await expect(root.locator('#section-c')).toBeHidden();
 await root.locator('#section-a [data-dv-detail]').click();await expect(root.locator('[data-dv-detail-preview]:visible')).toHaveCount(1);await expect(nav(root).getByRole('button',{name:'Explore B + C',exact:true})).toBeVisible();await root.locator('[data-dv-detail-preview]:visible .detail-breadcrumb button').first().click();await expect(nav(root).getByRole('button',{name:'Explore A',exact:true})).toHaveAttribute('aria-pressed','true');
 await chooseView(root,'Standard A + C');await expect(nav(root).getByRole('tab',{name:'Product',exact:true,includeHidden:true})).not.toHaveAttribute('data-explore-view','true');await expect(visible(root)).toHaveCount(1);await root.locator('#section-a [data-dv-detail]').click();await root.locator('[data-dv-detail-preview]:visible .detail-breadcrumb button').first().click();await expect(nav(root).getByRole('button',{name:'Explore A',exact:true})).toBeVisible();expect(await geometry()).toEqual({same:true,y:0,width});
 await info.attach('tab-views-'+width,{body:await page.screenshot(),contentType:'image/png'});
 await page.goto(server.origin+'/tab-views.html#d=b&v=explore-a');await expect(root.locator('#section-b')).toBeVisible();await expect(nav(root).getByRole('button',{name:'Explore B + C',exact:true})).toHaveAttribute('aria-pressed','true');await expect(nav(root).getByRole('tab',{name:'Product',exact:true,includeHidden:true})).toHaveAttribute('data-explore-view','true');await expect(root.locator('#section-a')).toBeHidden();
});
test('Workbench first View edit migrates the owner atomically and preserves selected shared content',async({page,server})=>{
 const raw=await fixture();await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(raw,null,2));await closeTools(page);const root=page.locator('#docview'),source=page.locator('#src');
 await chooseView(root,'Explore B + C');await nav(root).locator('.reader-tree-sections[data-reader-view=explore-bc]').getByRole('button',{name:'Section C',exact:true}).click();const before=await source.inputValue();
 await nav(root).locator('.section-view-options>summary').click();await nav(root).getByLabel('View name',{exact:true}).fill('Data C');await nav(root).getByRole('button',{name:'Rename View',exact:true}).click();
 const migrated=JSON.parse(await source.inputValue()),tab=migrated.page.blocks[0].tabs[0];expect(tab.views).toBeUndefined();expect(tab.sections[2].views.map(v=>v.name)).toEqual(['Standard A + C','Data C']);expect(tab.sections[2].diagram).toEqual(raw.page.blocks[0].tabs[0].sections[2].diagram);await expect(root.locator('#section-c')).toBeVisible();
 await page.locator('#undo-builder').click();await expect(source).toHaveValue(before);await expect(root.locator('#section-c')).toBeVisible();await page.locator('#redo-builder').click();await expect(root.locator('#section-c')).toBeVisible();
 await root.locator('#section-c [data-dv-node=service]').click();const title=page.locator('#guide').getByLabel('Name',{exact:true});await title.fill('Edited C');await title.press('Enter');await closeTools(page);await root.getByRole('tab',{name:'Standard A + C',exact:true}).click();await expect(root.locator('#section-c [data-dv-node=service]')).toContainText('Edited C');await root.getByRole('tab',{name:'Data C',exact:true}).click();await expect(root.locator('#section-c [data-dv-node=service]')).toContainText('Edited C');
 const priorAdd=await source.inputValue();await page.locator('#diagram-add').click();await page.locator('.diagram-add-structure>summary').click();await page.locator('#add-section').click();const added=JSON.parse(await source.inputValue());expect(added.page.blocks[0].tabs[0].sections).toHaveLength(5);expect(added.page.blocks[0].tabs[0].sections[4].views[0].presentation).toBe('standard');await page.locator('#undo-builder').click();await expect(source).toHaveValue(priorAdd);
});
test('native Views keep host-top nav, reject cross-View destinations and isolate sibling mounts',async({page,server})=>{
 await writeFile(path.join(server.root,'tab-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));await writeFile(path.join(server.root,'tab-native.html'),'<style>body{margin:0}.host{height:700px;overflow:auto;position:relative;width:48%;display:inline-block;vertical-align:top}</style><div class="host" id="one"></div><div class="host" id="two"></div><script type="module">import {mountNativeViewer} from "./tab-native.js";window.mount=mountNativeViewer;</script>');await page.goto(server.origin+'/tab-native.html');await page.waitForFunction(()=>!!window.mount);await page.evaluate(raw=>{window.first=mount(document.querySelector('#one'),raw);window.second=mount(document.querySelector('#two'),raw);first.setCanvas(true);},await fixture());
 const one=page.locator('#one'),two=page.locator('#two'),navbar=one.locator('.explore-navigation');await navbar.evaluate(el=>window.savedNav=el);const geometry=()=>navbar.evaluate(el=>({same:el===window.savedNav,y:el.getBoundingClientRect().top,width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height}));const initial=await geometry();
 await chooseView(one,'Explore B + C');expect(await page.evaluate(()=>first.snapshot())).toMatchObject({section:'b',view:'explore-bc'});await expect(two.locator('#section-a')).toBeVisible();await expect(two.locator('#section-b')).toBeHidden();
 expect(await page.evaluate(()=>{try{first.navigate({section:'c',view:'explore-a'});return false;}catch{return true;}})).toBe(true);await expect(one.locator('#section-b')).toBeVisible();
 await chooseView(one,'Standard A + C');await expect(one.locator('#section-a')).toBeVisible();await expect(one.locator('#section-c')).toBeHidden();expect(await geometry()).toEqual(initial);await chooseView(one,'Explore A');expect(await geometry()).toEqual(initial);
 await page.evaluate(()=>first.destroy());await expect(one.locator('.explore-navigation')).toHaveCount(0);await expect(two.locator('.explore-navigation')).toHaveCount(1);await page.evaluate(()=>{second.destroy();window.legacy=mount(document.querySelector('#two'),{sections:[{id:'plain',diagram:{nodes:{a:{title:'A'}},rows:[['a']]}}]});legacy.navigate({section:'plain',view:'flow'});});await expect(two.locator('#section-plain')).toBeVisible();await page.evaluate(()=>legacy.destroy());
});

test('compound contract routes retain the second member navigation through tour restoration and reload',async({page,server})=>{
 const raw=await fixture(),sections=raw.page.blocks[0].tabs[0].sections;
 for(const id of ['a','c'])sections.find(section=>section.id===id).contract={title:'Contract '+id.toUpperCase(),fields:[{k:'event',v:id}]};
 raw.page.tour={version:1,steps:[{id:'visit-a',target:{selector:'.board',within:'section'},diagramState:{section:'a',mode:'step'},copy:{heading:'Visit A'}}]};
 const input=path.join(server.root,'tab-view-contracts.json'),output=path.join(server.root,'tab-view-contracts.html');
 await writeFile(input,JSON.stringify(raw));execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),output]);
 const url=server.origin+'/tab-view-contracts.html',root=page.locator('#docview');
 async function assertContext(){
  await expect(nav(root)).toHaveAttribute('data-navigation-section','3');
  await expect(nav(root).getByRole('button',{name:'Standard A + C',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(nav(root).getByRole('button',{name:/^Copy embed link for Section C/})).toBeVisible();
  await expect(root.locator('#section-b')).toBeHidden();
 }
 for(const route of ['#d=c&v=standard-ac&c=c','#d=c&v=standard-ac&c=c&r=1','#c=c']){
  await page.goto(url+route);await assertContext();
  const hash=new URL(page.url()).hash;
  await nav(root).locator('.explore-tour-button').click();
  await expect(page.locator('.dv-tour-ui .dv-tour-heading')).toHaveText('Visit A');
  await page.keyboard.press('Escape');await expect(page.locator('.dv-tour')).toBeHidden();await assertContext();
  expect(new URL(page.url()).hash).toBe(hash);
  await page.reload();await assertContext();expect(new URL(page.url()).hash).toBe(hash);
 }
});


for(const width of [320,390])test(`reader menus and utilities stay reachable at ${width}px`,async({page,server},info)=>{
 await page.setViewportSize({width,height:900});const root=await standalone(page,server),navigation=nav(root);
 await chooseView(root,'Explore B + C');
 const before=await navigation.boundingBox();await expect(navigation.locator('.explore-legend-menu')).toBeHidden();
 const samples=await navigation.locator('.explore-panel-menu>summary').evaluate(async summary=>{
  const body=summary.parentElement.querySelector('.explore-panel-body'),frames=[];
  const sample=()=>{if(body.getClientRects().length)frames.push(body.getBoundingClientRect().toJSON());};
  summary.focus();summary.click();sample();for(let i=0;i<8;i++){await new Promise(requestAnimationFrame);sample();}return frames;
 });
 expect(samples.length).toBeGreaterThan(0);for(const box of samples){expect(box.x).toBeGreaterThanOrEqual(12);expect(box.right).toBeLessThanOrEqual(width-12);expect(box.bottom).toBeLessThanOrEqual(900-12);}
 await info.attach('opening-menu-frames',{body:JSON.stringify(samples,null,2),contentType:'application/json'});
 await page.keyboard.press('Escape');await expect(navigation.locator('.explore-panel-menu>summary')).toBeFocused();
 const dock=root.locator(':scope > .reader-page-actions'),player=root.locator('.explore-player:visible');
 async function separated(){await expect.poll(async()=>{const a=await player.boundingBox(),b=await dock.boundingBox();return b.y-a.y-a.height;}).toBeGreaterThanOrEqual(8);}
 await separated();
 // A longer discovery label forces another row and exercises the live dock
 // measurement, including resize/font-layout changes rather than a fixed inset.
 await dock.locator('.dv-shortcuts').evaluate(el=>el.textContent='Keyboard shortcuts and recently added controls');await separated();
 await page.setViewportSize({width:width+90,height:760});await separated();
 await page.setViewportSize({width,height:900});await separated();
 await chooseView(root,'Explore A');expect(await navigation.boundingBox()).toEqual(before);
 await chooseView(root,'Standard A + C');expect(await navigation.boundingBox()).toEqual(before);
 await expect(dock).toBeVisible();
 // The Contents tree keeps every Tab reachable without scrolling chrome.
 await chooseTab(root,'Notes');await expect(root.locator('.reader-tab-label')).toHaveText('Notes');await chooseTab(root,'Product');await expect(root.locator('.reader-tab-label')).toHaveText('Product');
 await info.attach('reader-phone',{body:await page.screenshot(),contentType:'image/png'});
});


test('Legend follows the selected member section and omits empty keys',async({page,server})=>{
 const raw=await fixture(),diagram=raw.page.blocks[0].tabs[0].sections[2].diagram;
 diagram.nodes.target={title:'Published event'};diagram.rows=[['service','target']];diagram.edges=[{id:'publish',from:'service',to:'target',kind:'evt',label:'Publish'}];
 const root=await standalone(page,server,raw),navigation=nav(root);
 await chooseView(root,'Explore B + C');await expect(navigation.locator('.explore-legend-menu')).toBeHidden();
 await navigation.locator('.reader-tree-sections[data-reader-view=explore-bc]').getByRole('button',{name:'Section C',exact:true}).click();await navigation.locator('.explore-legend-menu>summary').click();
 await expect(navigation.getByRole('group',{name:'Edge legend',exact:true})).toBeVisible();await expect(navigation.locator('.explore-edge-legend .li')).toHaveCount(1);
 await page.keyboard.press('Escape');await navigation.getByRole('button',{name:'Section B',exact:true}).click();await expect(navigation.locator('.explore-legend-menu')).toBeHidden();
});


for(const skin of ['pastel','aurora'])test(`dense phone playback keeps wrapped captions above utilities and neutralizes them in Ambient (${skin})`,async({page,server},info)=>{
 await page.setViewportSize({width:390,height:900});await page.emulateMedia({reducedMotion:'reduce'});
 const raw=JSON.parse(await readFile(path.join(repo,'examples/flowview-product-tour/flowview-product-tour.spec.json'),'utf8'));
 raw.page.skin=skin;const tab=raw.page.blocks[0].tabs[3],section=tab.sections[0];
 tab.views=[{id:'standard',name:'Backstage story',presentation:'standard',sections:[section.id]},{id:'explore',name:'Explore Backstage',presentation:'explore',sections:[section.id]}];tab.defaultView='explore';
 section.diagram.autoplay=false;
 const input=path.join(server.root,'dense-caption-'+skin+'.json'),output=path.join(server.root,'dense-caption-'+skin+'.html');
 await writeFile(input,JSON.stringify(raw));execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),output]);
 await page.goto(server.origin+'/dense-caption-'+skin+'.html');await chooseTab(page.locator('#docview'),'04 · Backstage');await page.evaluate(()=>document.fonts.ready);
 const root=page.locator('#section-backstage'),player=root.locator('.explore-player'),bar=player.locator('.termbar'),caption=bar.locator('.stepline'),dock=page.locator('#docview > .reader-page-actions'),board=root.locator('.explore-board');
 await expect(bar.locator('.schips button')).toHaveCount(7);
 const camera=()=>board.evaluate(el=>({x:el.scrollLeft,y:el.scrollTop}));
 async function separated(){await expect.poll(async()=>{const p=await player.boundingBox(),d=await dock.boundingBox();return d.y-p.y-p.height;}).toBeGreaterThanOrEqual(8);}
 async function readable(){
  await expect(bar).toBeVisible();await expect(caption).toBeInViewport();await separated();
  const metrics=await caption.evaluate(el=>({height:el.clientHeight,content:el.scrollHeight,box:el.getBoundingClientRect().toJSON()})),p=await player.boundingBox();
  expect(metrics.height).toBeGreaterThan(34);expect(metrics.content).toBeLessThanOrEqual(metrics.height);expect(metrics.box.bottom).toBeLessThanOrEqual(p.y+p.height);
 }
 // This read-only layout contract measures a deliberately paused camera.
 const follow=player.locator('.follow-active');await expect(follow).toHaveAttribute('aria-pressed','true');await follow.click();await expect(follow).toHaveAttribute('aria-pressed','false');
 await readable();const initial=await camera();await info.attach('dense-step-phone',{body:await page.screenshot(),contentType:'image/png'});
 await player.getByRole('button',{name:'Ambient',exact:true}).click();await expect(bar).toBeVisible();await expect(caption).toBeHidden();await separated();expect(await camera()).toEqual(initial);
 await expect(player.getByRole('button',{name:'Step',exact:true})).toBeInViewport();await info.attach('dense-ambient-phone',{body:await page.screenshot(),contentType:'image/png'});
 await player.getByRole('button',{name:'Step',exact:true}).click();await readable();expect(await camera()).toEqual(initial);
 // Wrapped utility rows and a shorter viewport must reserve their actual space.
 await dock.locator('.dv-shortcuts').evaluate(el=>el.textContent='Keyboard shortcuts and recently added controls');await readable();
 await page.setViewportSize({width:390,height:740});await readable();
 await player.getByRole('button',{name:'Ambient',exact:true}).click();await expect(bar).toBeVisible();await expect(caption).toBeHidden();await separated();
 await player.getByRole('button',{name:'Step',exact:true}).click();await readable();
});

test('desktop Ambient keeps step controls visible and step circles restore exact same-path and alternate focus',async({page,server})=>{
 await page.setViewportSize({width:1280,height:900});await page.emulateMedia({reducedMotion:'reduce'});
 const raw=JSON.parse(await readFile(path.join(repo,'src/starters/homemap-story.json'),'utf8')),diagram=raw.page.sections[0].diagram;
 diagram.view='ambient';diagram.autoplay=false;delete raw.page.views;delete raw.page.defaultView;delete diagram.layouts;delete diagram.defaultLayout;
 const input=path.join(server.root,'ambient-controls.json'),output=path.join(server.root,'ambient-controls.html');
 await writeFile(input,JSON.stringify(raw));execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),output]);
 await page.goto(server.origin+'/ambient-controls.html');await page.evaluate(()=>document.fonts.ready);
 const root=page.locator('.doc-sec[data-dv-section]').first(),bar=root.locator('.termbar'),caption=bar.locator('.stepline');
 const ambient=root.getByRole('button',{name:'Ambient',exact:true}),step=root.getByRole('button',{name:'Step',exact:true});
 await expect(ambient).toHaveAttribute('aria-pressed','true');await expect(bar).toBeVisible();await expect(caption).toBeHidden();
 await expect(root.locator('.section-steps-placeholder')).toHaveCount(0);await expect(bar.locator('.schip[aria-current="true"]')).toHaveCount(0);
 const litNodes=()=>root.locator('[data-dv-node].lit').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-dv-node')).sort());
 const happy=bar.locator('[aria-label^="Go to step 2 on Happy path"]');await happy.click();
 await expect(step).toHaveAttribute('aria-pressed','true');await expect(caption).toBeVisible();await expect(happy).toHaveAttribute('aria-current','true');
 await expect(bar.locator('.schip[aria-current="true"]')).toHaveCount(1);expect(await litNodes()).toEqual(['camera','hub']);await expect(bar.locator('.playback-status')).toContainText('Paused');
 await ambient.click();await expect(bar).toBeVisible();await expect(caption).toBeHidden();await expect(bar.locator('.schip[aria-current="true"]')).toHaveCount(0);
 const alternate=bar.getByRole('button',{name:'Go to step 4 on Internet down',exact:true});await alternate.click();
 await expect(step).toHaveAttribute('aria-pressed','true');await expect(alternate).toHaveAttribute('aria-current','true');await expect(bar.locator('.schip[aria-current="true"]')).toHaveCount(1);
 expect(await litNodes()).toEqual(['camera']);await expect(bar.locator('.playback-status')).toContainText('Paused');
});

/* #577 contract: with Follow paused, Step <-> Ambient must not move the Explore camera.
   row | fixture | assertion (scoped) | rejects
   1 viewBox | product-tour Backstage Explore, desktop, both skins | this board's own svg viewBox attribute equal in Step, Ambient, Step | a frame re-measured on the mode switch (late font/label ink) that grows 1-3 units
   2 camera | same | this board's scrollLeft/scrollTop equal in all three states | a camera re-fit or scroll jump on the switch
   3 on-screen graph | same | the first node's own client rect equal in all three states | a viewBox/fitted-size change that shifts the drawing under an unchanged scroll
   4 fitted size | same | this board's svg client width/height equal in all three states | a board resized by playback-only label state
   5 modes really switch | same | Step/Ambient aria-pressed while controls stay visible and neutral in Ambient | a test that never leaves Step */
for(const skin of ['pastel','aurora'])test(`desktop Explore camera and viewBox stay fixed across Step, Ambient and Step with follow paused (${skin})`,async({page,server})=>{
 await page.setViewportSize({width:1280,height:900});await page.emulateMedia({reducedMotion:'reduce'});
 const raw=JSON.parse(await readFile(path.join(repo,'examples/flowview-product-tour/flowview-product-tour.spec.json'),'utf8'));
 raw.page.skin=skin;const tab=raw.page.blocks[0].tabs[3],section=tab.sections[0];
 tab.views=[{id:'standard',name:'Backstage story',presentation:'standard',sections:[section.id]},{id:'explore',name:'Explore Backstage',presentation:'explore',sections:[section.id]}];tab.defaultView='explore';
 section.diagram.autoplay=false;
 const input=path.join(server.root,'stable-camera-'+skin+'.json'),output=path.join(server.root,'stable-camera-'+skin+'.html');
 await writeFile(input,JSON.stringify(raw));execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),output]);
 await page.goto(server.origin+'/stable-camera-'+skin+'.html');await chooseTab(page.locator('#docview'),'04 · Backstage');await page.evaluate(()=>document.fonts.ready);
 const root=page.locator('#section-backstage'),player=root.locator('.explore-player'),bar=player.locator('.termbar'),board=root.locator('.explore-board'),step=player.getByRole('button',{name:'Step',exact:true}),ambient=player.getByRole('button',{name:'Ambient',exact:true});
 await expect(board).toBeVisible();await expect(step).toHaveAttribute('aria-pressed','true');await expect(bar).toBeVisible();
 const state=()=>board.evaluate(el=>{const svg=el.querySelector('.boardcanvas>svg'),box=svg.getBoundingClientRect(),node=svg.querySelector('[data-dv-node]').getBoundingClientRect();return {viewBox:svg.getAttribute('viewBox'),x:el.scrollLeft,y:el.scrollTop,width:box.width,height:box.height,node:{x:node.x,y:node.y,width:node.width,height:node.height}};});
 const follow=player.locator('.follow-active');await expect(follow).toHaveAttribute('aria-pressed','true');await follow.click();await expect(follow).toHaveAttribute('aria-pressed','false');
 const initial=await state();
 await ambient.click();await expect(ambient).toHaveAttribute('aria-pressed','true');await expect(bar).toBeVisible();await expect(bar.locator('.stepline')).toBeHidden();await expect(bar.locator('.schip[aria-current="true"]')).toHaveCount(0);expect(await state()).toEqual(initial);
 await step.click();await expect(step).toHaveAttribute('aria-pressed','true');await expect(bar).toBeVisible();expect(await state()).toEqual(initial);
 await expect(follow).toHaveAttribute('aria-pressed','false');
 // Enabled Follow deliberately frames Step; Ambient itself has no active target.
 await ambient.click();await follow.click();await expect(follow).toHaveAttribute('aria-pressed','true');expect(await state()).toEqual(initial);
 await step.click();await expect.poll(async()=>(await state()).width).toBeGreaterThan(initial.width);
 expect((await state()).viewBox).toBe(initial.viewBox);
});

for(const width of [870,1280])for(const authored of [false,true])test(`reader View reordering preserves the ${authored?'authored':'default'} camera before Fit at ${width}px`,async({page,server},info)=>{
 await page.setViewportSize({width,height:742});const raw=await fixture(),tab=raw.page.blocks[0].tabs[0];
 tab.views=[
  {id:'full-story',name:'Full story',presentation:'standard',sections:['a','b','c']},
  {id:'explore-story',name:'Explore story',presentation:'explore',sections:['a','b','c']},
  {id:'reversed',name:'Reversed subset',presentation:'explore',sections:['c','a']}
 ];tab.defaultView='full-story';
 if(authored){const d=tab.sections[2].diagram;d.defaultLayout='shared';d.layouts=[{id:'shared',name:'Shared arrangement',presentation:'standard',sectionLayout:{default:[{x:0,y:0,w:12,h:8}]},exploreLayout:{camera:{zoom:.5,x:.5,y:.5}}}];}
 const root=await standalone(page,server,raw),navigation=nav(root),section=root.locator('#section-c'),board=section.locator('.explore-board'),node=section.locator('[data-dv-node=service]');
 await chooseView(root,'Explore story');await navigation.locator('.reader-tree-sections[data-reader-view=explore-story]').getByRole('button',{name:'Section C',exact:true}).click();
 // No Fit gesture: first entry and every later transition must show the graph.
 await expect(node).toBeInViewport({ratio:1});await page.evaluate(()=>document.fonts.ready);
 const camera=()=>board.evaluate(el=>({x:el.scrollLeft,y:el.scrollTop,width:el.querySelector('.boardcanvas>svg').getBoundingClientRect().width}));
 if(authored)expect(await board.evaluate(el=>el.querySelector('.boardcanvas>svg').getBoundingClientRect().width/el.querySelector('.boardcanvas>svg').viewBox.baseVal.width)).toBeCloseTo(.5,3);
 await navigation.locator('.reader-toolbar').getByRole('button',{name:/^(?:Canvas zoom|Diagram zoom|Zoom) in$/,exact:true}).click();await board.evaluate(el=>{el.scrollLeft+=24;el.scrollTop+=12;});const saved=await camera();
 await expect(node).toBeInViewport();
 for(let cycle=0;cycle<3;cycle++){
  await chooseView(root,'Full story');await page.evaluate(()=>scrollTo(0,500));
  await chooseView(root,'Explore story');await expect(node).toBeInViewport();await expect.poll(camera).toEqual(saved);
  // C actually moves before A, not just through a redundant DOM insertion.
  await chooseView(root,'Reversed subset');expect((await navigation.locator('.reader-tree-sections[data-reader-view=reversed] .reader-tree-section').allTextContents()).sort()).toEqual(['Section A','Section C']);
  expect(await root.locator('.doc-sec[data-dv-section]').evaluateAll(nodes=>nodes.map(n=>n.id).indexOf('section-c')<nodes.map(n=>n.id).indexOf('section-a'))).toBe(true);
  await expect(root.locator('#section-b')).toBeHidden();await expect(node).toBeInViewport();await expect.poll(camera).toEqual(saved);
 }
 await info.attach('retained-reader-camera',{body:await page.screenshot(),contentType:'image/png'});
});
