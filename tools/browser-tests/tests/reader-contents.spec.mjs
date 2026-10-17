import {test,expect,activeCompanyBrand,paste,closeTools} from '../helpers/test.mjs';
import {writeFile,readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {repo} from '../helpers/prepare.mjs';

function story(skin='pastel'){
  const section=(id,heading)=>({id,heading,text:'Keep the full section title and its live playback state.',diagram:{view:'step',autoplay:false,nodes:{a:{title:'Source'},b:{title:'Destination'}},rows:[['a','b']],edges:[{from:'a',to:'b'}],steps:[{id:'first',text:'First',edge:'a->b'},{id:'second',text:'Second',edge:'a->b'}]}});
  return {page:{title:'Contents acceptance',skin,sections:[{tabs:[{label:'Product journey',defaultView:'full',views:[{id:'full',name:'Full story',presentation:'standard',sections:['build','review','backstage']},{id:'explore',name:'Explore story',presentation:'explore',sections:['build','review','backstage']},{id:'subset',name:'Review + Backstage',presentation:'explore',sections:['backstage','review']}],sections:[section('build','Turn a doorbell story into a reviewable draft'),section('review','Decide what becomes the accepted diagram'),section('backstage','Find the right workspace in Backstage')]},{label:'Reference',sections:[section('reference','Reference material')]}]}]}};
}
async function open(page,server,skin='pastel'){
  return openRaw(page,server,story(skin));
}
async function openRaw(page,server,raw,name='contents'){
  const input=path.join(server.root,name+'.json'),output=path.join(server.root,name+'.html');await writeFile(input,JSON.stringify(raw));
  execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),output]);await page.goto(server.origin+'/'+name+'.html');return page.locator('#docview');
}
async function choose(root,id){await root.locator('.reader-tree-view[data-tab-view="'+id+'"]').click();}

test('Contents preserves Standard stacks, ordered Explore members and state through theme changes',async({page,server})=>{
  // #622: the pager counts the document's parts (two Tabs here), so moves inside a View go through Contents rows.
  const root=await open(page,server);await expect(root.locator('.reader-page-label')).toHaveText('Section 1 of 2');
  await expect(root.locator('.doc-sec:visible')).toHaveCount(3);
  await root.locator('.reader-tree-sections[data-reader-view="full"]').getByRole('button',{name:'Decide what becomes the accepted diagram',exact:true}).click();await expect(root.locator('.reader-page-label')).toHaveText('Section 1 of 2');await expect(root.locator('.doc-sec:visible')).toHaveCount(3);
  await choose(root,'subset');await expect(root.locator('.reader-page-label')).toHaveText('Section 1 of 2');await expect(root.locator('.explore-active-section')).toHaveAttribute('id','section-review');
  await root.locator('.reader-tree-sections[data-reader-view="subset"]').getByRole('button',{name:'Find the right workspace in Backstage',exact:true}).click();await expect(root.locator('.explore-active-section')).toHaveAttribute('id','section-backstage');
  await root.locator('.reader-tree-sections[data-reader-view="subset"]').getByRole('button',{name:'Decide what becomes the accepted diagram',exact:true}).click();await expect(root.locator('.explore-active-section')).toHaveAttribute('id','section-review');
  await root.locator('.reader-toolbar').getByRole('button',{name:/^(?:Canvas zoom|Diagram zoom|Zoom) in$/,exact:true}).click();const zoom=await root.locator('.reader-zoom-menu>summary').innerText();
  const board=await root.locator('#section-review .board').elementHandle();
  await root.locator('.reader-theme-menu>summary').click();await expect(root.getByRole('menuitemradio')).toHaveText(['Aurora','Pastel','Blueprint','Terminal','Rose','Lavender','Opus Lilac']);
  await root.getByRole('menuitemradio',{name:'Opus Lilac',exact:true}).click();await expect(root).toHaveClass(/sk-lilac/);await expect(root.locator('.reader-page-label')).toHaveText('Section 1 of 2');await expect(root.locator('.explore-active-section')).toHaveAttribute('id','section-review');await expect(root.locator('.reader-zoom-menu>summary')).toHaveText(zoom);expect(await board.evaluate(el=>el.isConnected)).toBe(true);
  await expect(root.locator('.reader-theme-menu>summary')).toBeFocused();
  await choose(root,'full');await root.locator('.reader-toolbar').getByRole('button',{name:/^(?:Canvas zoom|Diagram zoom|Zoom) in$/,exact:true}).click();await expect(root.locator('#section-review')).toHaveCSS('zoom','1.25');
  await choose(root,'explore');await expect(root.locator('#section-review')).toHaveCSS('zoom','1');await choose(root,'full');await expect(root.locator('#section-review')).toHaveCSS('zoom','1.25');
  await root.locator('#section-backstage').evaluate(el=>el.scrollIntoView({block:'start'}));await expect(root.locator('.reader-tree-sections[data-reader-view="full"] .reader-tree-section').nth(2)).toHaveAttribute('aria-current','page');await expect(root.locator('.reader-page-label')).toHaveText('Section 1 of 2');await expect(root.locator('.doc-sec:visible')).toHaveCount(3);
});

test('Standard Contents exposes ordered section headlines and routes mouse and keyboard without collapsing the stack',async({page,server})=>{
  const raw=story(),tab=raw.page.sections[0].tabs[0];tab.defaultView='standard-subset';tab.views.push({id:'standard-subset',name:'Backstage + Review',presentation:'standard',sections:['backstage','review']});
  const root=await openRaw(page,server,raw,'standard-headlines'),headlines=root.locator('.reader-tree-sections[data-reader-view="standard-subset"]');
  await expect(headlines.getByRole('button')).toHaveText(['Find the right workspace in Backstage','Decide what becomes the accepted diagram']);
  await expect(root.locator('.reader-tree-sections[data-reader-view="explore"] .reader-tree-section')).toHaveCount(3);
  await expect(root.locator('.doc-sec:visible')).toHaveCount(2);
  const review=headlines.getByRole('button',{name:'Decide what becomes the accepted diagram',exact:true});await review.click();
  await expect(root.locator('.reader-page-label')).toHaveText('Section 1 of 2');await expect(review).toHaveAttribute('aria-current','page');await expect(root.locator('.doc-sec:visible')).toHaveCount(2);
  const backstage=headlines.getByRole('button',{name:'Find the right workspace in Backstage',exact:true});await backstage.focus();await page.keyboard.press('Enter');
  await expect(backstage).toBeFocused();await expect(backstage).toHaveAttribute('aria-current','page');await expect(root.locator('.reader-page-label')).toHaveText('Section 1 of 2');await expect(root.locator('.doc-sec:visible')).toHaveCount(2);
  const target=await root.locator('#section-backstage').boundingBox(),navigation=await root.locator('.reader-navigation').boundingBox();expect(target.y).toBeGreaterThanOrEqual(navigation.y+navigation.height);expect(target.y).toBeLessThanOrEqual(navigation.y+navigation.height+16);
  await expect(root.locator('.reader-tree-tab').filter({hasText:'Reference'})).toHaveAttribute('aria-expanded','true');const prose=root.locator('.reader-tree-sections[data-reader-view="standard"] .reader-tree-section');await expect(prose).toHaveText(['Reference material']);await prose.click();await expect(prose).toHaveAttribute('aria-current','page');await expect(root.locator('#section-reference')).toBeVisible();await expect(root.locator('.reader-page-label')).toHaveText('Section 2 of 2');
});

test('desktop Contents expands every View by default and preserves independent disclosure choices',async({page,server})=>{
  await page.setViewportSize({width:1440,height:900});const root=await open(page,server),sections=id=>root.locator('.reader-tree-sections[data-reader-view="'+id+'"] .reader-tree-section'),disclosure=id=>root.locator('.reader-tree-view[data-tab-view="'+id+'"]').locator('..').locator('.reader-view-disclosure');
  await expect(sections('full')).toHaveCount(3);await expect(sections('explore')).toHaveCount(3);
  await expect(disclosure('full')).toHaveAttribute('aria-expanded','true');await expect(disclosure('full')).toHaveAccessibleName('Collapse Full story');
  await expect(disclosure('explore')).toHaveAttribute('aria-expanded','true');await expect(disclosure('explore')).toHaveAccessibleName('Collapse Explore story');
  await expect(root.locator('.reader-tree-view[data-tab-view="full"]')).not.toHaveAttribute('data-explore-view','true');await expect(root.locator('.reader-tree-view[data-tab-view="explore"]')).toHaveAttribute('data-explore-view','true');
  await disclosure('full').focus();await page.keyboard.press('Enter');await expect(disclosure('full')).toBeFocused();await expect(disclosure('full')).toHaveAttribute('aria-expanded','false');await expect(disclosure('full')).toHaveAccessibleName('Expand Full story');await expect(sections('full')).toHaveCount(0);await expect(sections('explore')).toHaveCount(3);
  await disclosure('explore').click();await expect(disclosure('explore')).toHaveAttribute('aria-expanded','false');await expect(sections('explore')).toHaveCount(0);
  await choose(root,'explore');await expect(disclosure('full')).toHaveAttribute('aria-expanded','false');await expect(disclosure('explore')).toHaveAttribute('aria-expanded','false');
  await page.evaluate(()=>location.hash='d=review&v=explore');await expect(root.locator('.explore-active-section')).toHaveAttribute('id','section-review');await expect(root.locator('.reader-page-label')).toHaveText('Section 1 of 2');await expect(disclosure('full')).toHaveAttribute('aria-expanded','false');await expect(disclosure('explore')).toHaveAttribute('aria-expanded','false');
  await disclosure('full').click();await disclosure('explore').click();await expect(sections('full')).toHaveCount(3);await expect(sections('explore')).toHaveCount(3);
});

/* #607 — Contents lands with every Tab and View expanded (desktop widths only).
   row | fixture | assertion (scoped) | rejects
   L0 precondition | twoTabs(): Product journey (3 Views) + Reference (2 Views, 2 sections), 1440x900, no hash | .reader-tab-label = Product journey; the current page row sits inside the Product journey group | a test whose landing Tab is already the second group
   L1 every Tab expanded | same | each .reader-tree-tab aria-expanded=true; each group's own .reader-tree-view names = its authored Views | expanding only the current Tab (today's initial frame)
   L2 every View expanded | same | each View's own disclosure aria-expanded=true and its own .reader-tree-sections rows = its authored members, in both groups | expanding Tabs but leaving non-current Views collapsed
   M1 Tab toggles by hand | real clicks on the Reference Tab row | aria-expanded false + 0 View rows in that group while Product journey keeps its 3; second click restores both Views | a landing default re-applied on every draw
   M2 View toggles by hand | real Enter/click on a Reference View disclosure | that View's sections 0 and aria-expanded false, the sibling View keeps 2; click restores | disclosure state shared across Views or reset by the default
   N1 moving keeps groups | Next section, then a real click on a Reference View row | after each move the other group stays aria-expanded=true with its View rows | collapsing every group except the new owner on navigation
   D1 deep link lands | fresh load of #t=reference&d=glossary&v=ref-explore | tab label Reference, glossary row in ref-explore aria-current=page, #section-glossary is the Explore section; both Tabs expanded | a deep-link landing that expands only the linked Tab
   D3 cross-document link | a second standalone document (with documentLinks) whose node handoff {spec,section:'glossary',view:'ref-explore',siteBaseUrl} points at contents-expanded.html; real click on its new-tab link | the opened tab is contents-expanded.html?diagram=…#d=glossary&v=ref-explore, lands with tab label Reference, glossary row current, every Tab/View expanded | a cross-document landing that expands only the linked Tab or loses the section
   D2 hash change | real same-document navigation to #d=review&v=explore | Product journey owns, review row current, Reference still expanded | hashchange routing that recollapses groups
   R1 restore() wins | Workbench re-render (workbench-navigation.spec.mjs) | a Tab the reader collapsed stays collapsed after the preview re-renders | the landing default overriding saved state
   E1 Backstage native | twoTabs() mounted through apps/backstage nativeViewer.js (shadow root) | same L1/L2 assertions inside the host | fixing only the standalone viewer
   H1 hosted ?diagram= reader | ?diagram=delivery#d=c&v=explore-bc (human-guide-library.spec.mjs) | linked section current and every Tab/View expanded in #canon-reader | a deep-link landing that expands only the linked Tab
   Forge: not a row. The Confluence Forge viewer renders through core.renderPage without initViewerExploreCanvas, so it has no Contents panel (checked 2026-10-17: #docview .reader-contents count 0). */
function twoTabs(){
  const raw=story(),[journey,reference]=raw.page.sections[0].tabs,base=journey.sections[0];
  const section=(id,heading)=>({...structuredClone(base),id,heading});
  reference.sections=[section('reference','Reference material'),section('glossary','Glossary terms')];
  reference.defaultView='ref-standard';reference.views=[{id:'ref-standard',name:'Reference pages',presentation:'standard',sections:['reference','glossary']},{id:'ref-explore',name:'Reference map',presentation:'explore',sections:['glossary','reference']}];
  return raw;
}
const authored={'Product journey':{full:3,explore:3,subset:2},'Reference':{'ref-standard':2,'ref-explore':2}};
async function expectAllExpanded(root){
  for(const [label,views] of Object.entries(authored)){
    const group=root.locator('.reader-contents-tab').filter({has:root.page().locator('.reader-tree-tab').filter({hasText:label})});
    await expect(group.locator('.reader-tree-tab'),label+' Tab').toHaveAttribute('aria-expanded','true');
    await expect(group.locator('.reader-tree-view')).toHaveCount(Object.keys(views).length);
    for(const [id,count] of Object.entries(views)){
      await expect(group.locator('.reader-tree-view[data-tab-view="'+id+'"]').locator('..').locator('.reader-view-disclosure'),label+' '+id).toHaveAttribute('aria-expanded','true');
      await expect(group.locator('.reader-tree-sections[data-reader-view="'+id+'"] .reader-tree-section')).toHaveCount(count);
    }
  }
}
test('#607 desktop Contents lands with every Tab and View expanded and keeps reader choices',async({page,server})=>{
  await page.setViewportSize({width:1440,height:900});const root=await openRaw(page,server,twoTabs(),'contents-expanded');
  const group=label=>root.locator('.reader-contents-tab').filter({has:root.page().locator('.reader-tree-tab').filter({hasText:label})}),tabRow=label=>group(label).locator('.reader-tree-tab');
  const views=label=>group(label).locator('.reader-tree-view'),sections=id=>root.locator('.reader-tree-sections[data-reader-view="'+id+'"] .reader-tree-section'),disclosure=id=>root.locator('.reader-tree-view[data-tab-view="'+id+'"]').locator('..').locator('.reader-view-disclosure');
  await expect(root.locator('.reader-contents')).toBeVisible();
  await expect(root.locator('.reader-tab-label')).toHaveText('Product journey');await expect(group('Product journey').locator('.reader-tree-view[aria-current="page"]')).toHaveText('Full story');
  // The landing default is applied after the first frame; settle it before asserting.
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await expectAllExpanded(root);
  await expect(group('Reference').locator('.reader-tree-sections[data-reader-view="ref-explore"] .reader-tree-section')).toHaveText(['Glossary terms','Reference material']);
  await tabRow('Reference').click();await expect(tabRow('Reference')).toHaveAttribute('aria-expanded','false');await expect(views('Reference')).toHaveCount(0);await expect(views('Product journey')).toHaveCount(3);
  await tabRow('Reference').click();await expect(tabRow('Reference')).toHaveAttribute('aria-expanded','true');await expect(views('Reference')).toHaveText(['Reference pages','Reference map']);
  await disclosure('ref-standard').focus();await page.keyboard.press('Enter');await expect(disclosure('ref-standard')).toHaveAttribute('aria-expanded','false');await expect(sections('ref-standard')).toHaveCount(0);await expect(sections('ref-explore')).toHaveCount(2);
  await disclosure('ref-standard').click();await expect(disclosure('ref-standard')).toHaveAttribute('aria-expanded','true');await expect(sections('ref-standard')).toHaveCount(2);
  await root.getByRole('button',{name:'Next section',exact:true}).click();await expect(root.locator('.reader-page-label')).toHaveText('Section 2 of 2');await expect(tabRow('Reference')).toHaveAttribute('aria-expanded','true');await expect(views('Reference')).toHaveCount(2);
  await group('Reference').locator('.reader-tree-view[data-tab-view="ref-explore"]').click();await expect(root.locator('.reader-tab-label')).toHaveText('Reference');await expect(tabRow('Product journey')).toHaveAttribute('aria-expanded','true');await expect(views('Product journey')).toHaveCount(3);
  await page.goto(server.origin+'/contents-expanded.html#t=reference&d=glossary&v=ref-explore');await page.reload();
  await expect(root.locator('.reader-tab-label')).toHaveText('Reference');await expect(sections('ref-explore').filter({hasText:'Glossary terms'})).toHaveAttribute('aria-current','page');await expect(root.locator('.explore-active-section')).toHaveAttribute('id','section-glossary');
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await expectAllExpanded(root);
  await page.goto(server.origin+'/contents-expanded.html#d=review&v=explore');
  await expect(root.locator('.reader-tab-label')).toHaveText('Product journey');await expect(sections('explore').filter({hasText:'Decide what becomes the accepted diagram'})).toHaveAttribute('aria-current','page');await expect(tabRow('Reference')).toHaveAttribute('aria-expanded','true');await expect(views('Reference')).toHaveCount(2);
  const linking={page:{title:'Linking document',documentLinks:{id:'contents-linking',siteBaseUrl:server.origin+'/contents-linking.html'},sections:[{id:'source',heading:'Source',diagram:{nodes:{a:{title:'Glossary link',handoff:{spec:'contents-expanded',section:'glossary',view:'ref-explore',siteBaseUrl:server.origin+'/contents-expanded.html'}}},rows:[['a']]}}]}};
  await openRaw(page,server,linking,'contents-linking');const opened=page.context().waitForEvent('page');await page.getByRole('link',{name:'Open Glossary link diagram (new tab)',exact:true}).click();const linked=await opened;
  expect(linked.url()).toContain('/contents-expanded.html?diagram=contents-expanded#');const target=linked.locator('#docview');
  await expect(target.locator('.reader-tab-label')).toHaveText('Reference');await expect(target.locator('.reader-tree-sections[data-reader-view="ref-explore"] .reader-tree-section').filter({hasText:'Glossary terms'})).toHaveAttribute('aria-current','page');await expect(target.locator('.explore-active-section')).toHaveAttribute('id','section-glossary');
  await linked.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await expectAllExpanded(target);await linked.close();
});

test('#607 Backstage native reader lands with every Tab and View expanded',async({page,server})=>{
  await page.setViewportSize({width:1440,height:900});
  await writeFile(path.join(server.root,'expanded-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
  await writeFile(path.join(server.root,'expanded-native.html'),'<style>body{margin:0}.host{width:1200px;height:800px;overflow:auto;position:relative}</style><div id="one" class="host"></div><script type="module">import {mountNativeViewer} from "./expanded-native.js";window.mount=mountNativeViewer;</script>');
  await page.goto(server.origin+'/expanded-native.html');await page.waitForFunction(()=>!!window.mount);await page.evaluate(raw=>{window.one=mount(document.querySelector('#one'),raw);},twoTabs());
  const native=page.locator('#one');await expect(native.locator('.reader-contents')).toBeVisible();await expect(native.locator('.reader-tab-label')).toHaveText('Product journey');
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await expectAllExpanded(native);
});

for(const width of [1440,390,320,286])test('Contents geometry, overlay and bounded theme menu at '+width,async({page,server})=>{
  await page.setViewportSize({width,height:844});const root=await open(page,server,'rose');const nav=root.locator('.reader-navigation');
  if(width<=670)await root.locator('.reader-top>button').click();
  await expect(root.locator('.reader-contents')).toBeVisible();
  const geometry=await nav.evaluate(el=>{const nav=el.getBoundingClientRect(),pager=el.querySelector('.reader-page-index').getBoundingClientRect(),side=el.querySelector('.reader-contents').getBoundingClientRect(),footer=el.querySelector('.reader-theme-footer').getBoundingClientRect();return {center:(pager.left+pager.right)/2-nav.width/2,sideBottom:side.bottom,footerBottom:footer.bottom,width:document.documentElement.scrollWidth};});
  expect(Math.abs(geometry.center)).toBeLessThan(1);expect(geometry.width).toBe(width);expect(geometry.footerBottom).toBe(geometry.sideBottom);
  await root.locator('.reader-theme-menu>summary').click();const menu=await root.locator('.reader-theme-options').boundingBox();expect(menu.y).toBeGreaterThan(100);expect(menu.x).toBeGreaterThanOrEqual(0);expect(menu.x+menu.width).toBeLessThanOrEqual(width);
  await page.keyboard.press('Escape');await expect(root.locator('.reader-theme-menu>summary')).toBeFocused();await expect(root.locator('.reader-contents')).toBeVisible();
  if(width<=670){await expect(root.locator('.reader-scrim')).toBeVisible();await page.keyboard.press('Escape');await expect(root.locator('.reader-contents')).toBeHidden();await expect(root.locator('.reader-top>button')).toBeFocused();await root.locator('.reader-top>button').click();await choose(root,'explore');}
  else{await choose(root,'explore');const canvas=await root.locator('.viewer-diagram-canvas').boundingBox();expect(canvas.x).toBe(284);}
  await root.locator('.reader-zoom-menu>summary').click();await expect(root.locator('.reader-zoom-options').getByRole('button',{name:'Readable',exact:true})).toBeVisible();
  const zoomBox=await root.locator('.reader-zoom-options').boundingBox();expect(zoomBox.x).toBeGreaterThanOrEqual(0);expect(zoomBox.x+zoomBox.width).toBeLessThanOrEqual(width);expect(zoomBox.y+zoomBox.height).toBeLessThanOrEqual(844);
});

test('legacy skins remain labeled and host skin updates preserve document content',async({page,server})=>{
  const root=await open(page,server,'editorial');await expect(root.locator('.reader-theme-menu>summary')).toHaveAttribute('data-current-skin','editorial');
  const section=await root.locator('#section-build').elementHandle();await page.evaluate(()=>dvSetSkin('daylight'));await expect(root.locator('.reader-theme-menu>summary')).toHaveAttribute('data-current-skin','daylight');expect(await section.evaluate(el=>el.isConnected)).toBe(true);
  expect(await page.evaluate(()=>JSON.parse(document.querySelector('#flowspec').textContent).page.skin)).toBe('editorial');
});

test('native Contents themes and destruction are isolated between sibling hosts',async({page,server})=>{
  await writeFile(path.join(server.root,'contents-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
  await writeFile(path.join(server.root,'contents-native.html'),'<style>body{margin:0;display:flex}.host{width:50vw;height:800px;overflow:auto;position:relative}</style><div id="one" class="host"></div><div id="two" class="host"></div><script type="module">import {mountNativeViewer} from "./contents-native.js";window.mount=mountNativeViewer;</script>');
  await page.goto(server.origin+'/contents-native.html');await page.waitForFunction(()=>!!window.mount);await page.evaluate(raw=>{window.one=mount(document.querySelector('#one'),raw);window.two=mount(document.querySelector('#two'),raw);},story());
  const one=page.locator('#one'),two=page.locator('#two'),standard=one.locator('.reader-tree-sections[data-reader-view="full"]');await expect(standard.getByRole('button')).toHaveCount(3);await standard.getByRole('button',{name:'Find the right workspace in Backstage',exact:true}).click();await expect(standard.getByRole('button',{name:'Find the right workspace in Backstage',exact:true})).toHaveAttribute('aria-current','page');await expect(one.locator('.doc-sec:visible')).toHaveCount(3);
  const nativeHeading=await one.locator('#section-backstage .sec-h').boundingBox(),nativeNav=await one.locator('.reader-navigation').boundingBox(),nativeHost=await one.boundingBox();expect(await one.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);expect(nativeHeading.y).toBeGreaterThanOrEqual(nativeHost.y+nativeNav.height);expect(nativeHeading.y).toBeLessThanOrEqual(nativeHost.y+nativeHost.height*.6);expect(nativeHeading.y+nativeHeading.height).toBeLessThanOrEqual(nativeHost.y+nativeHost.height);
  await choose(one,'explore');await one.locator('.reader-theme-menu>summary').click();await one.getByRole('menuitemradio',{name:'Rose',exact:true}).click();await expect(one.locator('.docview')).toHaveClass(/sk-rose/);await expect(two.locator('.docview')).not.toHaveClass(/sk-rose/);
  const canvas=await one.locator('.viewer-diagram-canvas').boundingBox();expect(canvas.x+canvas.width).toBeLessThanOrEqual(900);
  const nativeRoot=await one.locator('flowview-root').boundingBox(),sidebar=await one.locator('.reader-contents').boundingBox();expect(sidebar.y+sidebar.height).toBe(nativeRoot.y+nativeRoot.height);
  await page.evaluate(()=>window.one.destroy());await two.getByRole('button',{name:'Next section',exact:true}).click();await expect(two.locator('.reader-page-label')).toHaveText('Section 2 of 2');await expect(one.locator('.reader-navigation')).toHaveCount(0);
});


test('desktop Contents closes on transition to phone and releases its focus trap',async({page,server})=>{
  await page.setViewportSize({width:1440,height:900});const root=await open(page,server),toggle=root.locator('.reader-top>button');
  await expect(root.locator('.reader-contents')).toBeVisible();await root.locator('.reader-tree-view[aria-current="page"]').focus();
  await page.setViewportSize({width:390,height:844});
  await expect(toggle).toHaveAttribute('aria-expanded','false');await expect(toggle).toBeFocused();await expect(root.locator('.reader-scrim')).toBeHidden();
  await root.getByRole('button',{name:'Next section',exact:true}).click();await expect(root.locator('.reader-page-label')).toHaveText('Section 2 of 2');
  await toggle.click();await expect(root.locator('.reader-contents')).toBeVisible();
  // A height-only resize must preserve a deliberately opened phone overlay.
  await page.setViewportSize({width:390,height:700});await expect(toggle).toHaveAttribute('aria-expanded','true');
  await page.keyboard.press('Escape');await expect(toggle).toBeFocused();await expect(toggle).toHaveAttribute('aria-expanded','false');
});

for(const width of [1440,390])test('top Views route with Contents closed and retain keyboard focus at '+width,async({page,server})=>{
  await page.setViewportSize({width,height:900});const root=await open(page,server),strip=root.getByRole('tablist',{name:'Views in selected Tab'}),toggle=root.locator('.reader-top>button');
  if(await root.locator('.reader-contents').isVisible())await toggle.click();
  await expect(strip.getByRole('tab')).toHaveText(['Full story','Explore story','Review + Backstage']);
  const full=strip.getByRole('tab',{name:'Full story',exact:true}),subset=strip.getByRole('tab',{name:'Review + Backstage',exact:true});
  await full.focus();await page.keyboard.press('ArrowRight');const explore=strip.getByRole('tab',{name:'Explore story',exact:true});await expect(explore).toBeFocused();
  await page.evaluate(()=>location.hash='d=review&v=full');await expect(root.locator('#section-review')).toBeVisible();await expect(root.locator('.reader-page-label')).toHaveText('Section 1 of 2');await expect(explore).toBeFocused();await expect(explore).toHaveAttribute('tabindex','0');await expect(full).toHaveAttribute('tabindex','-1');await expect(full).toHaveAttribute('aria-selected','true');await expect(strip.locator('[tabindex="0"]')).toHaveCount(1);
  await page.evaluate(()=>location.hash='d=build&v=full');await expect(root.locator('.reader-page-label')).toHaveText('Section 1 of 2');
  await full.focus();await page.keyboard.press('End');await expect(subset).toBeFocused();await expect(full).toHaveAttribute('aria-selected','true');await page.keyboard.press('Enter');
  await expect(subset).toBeFocused();await expect(subset).toHaveAttribute('aria-selected','true');await expect(root.locator('.reader-contents')).toBeHidden();
  await expect(root.locator('.explore-active-section')).toHaveAttribute('id','section-backstage');await expect(root.locator('.reader-page-label')).toHaveText('Section 1 of 2');expect(new URL(page.url()).hash).toContain('v=subset');
  await page.evaluate(()=>location.hash='d=review&v=subset');await expect(root.locator('.explore-active-section')).toHaveAttribute('id','section-review');
  const step=root.locator('#section-review .stepid'),before=await step.innerText();await page.evaluate(()=>document.body.classList.add('presenting'));
  await subset.focus();await page.keyboard.press('ArrowLeft');await expect(strip.getByRole('tab',{name:'Explore story',exact:true})).toBeFocused();await expect(subset).toHaveAttribute('aria-selected','true');await expect(step).toHaveText(before);
  await page.keyboard.press('Space');await expect(strip.getByRole('tab',{name:'Explore story',exact:true})).toHaveAttribute('aria-selected','true');await expect(step).toHaveText(before);await expect(root.locator('#section-review .termbar')).toContainText('Paused');await page.evaluate(()=>document.body.classList.remove('presenting'));
  await toggle.click();await expect(root.locator('.reader-tree-view[data-tab-view=explore]')).toHaveAttribute('aria-current','page');await choose(root,'full');await expect(full).toHaveAttribute('aria-selected','true');
  await page.evaluate(()=>location.hash='d=review&v=explore');await expect(strip.getByRole('tab',{name:'Explore story',exact:true})).toHaveAttribute('aria-selected','true');await expect(root.locator('#section-build')).toBeHidden();await expect(root.locator('#section-review')).toBeVisible();
  if(!await root.locator('.reader-contents').isVisible())await toggle.click();await expect(root.locator('.reader-tree-tab').filter({hasText:'Reference'})).toHaveAttribute('aria-expanded','true');await root.locator('.reader-tree-tab').filter({hasText:'Reference'}).locator('..').locator('.reader-tree-view').first().click();
  await expect(root.locator('.reader-tab-label')).toHaveText('Reference');await expect(strip.getByRole('tab')).toHaveCount(1);await expect(strip.getByRole('tab',{selected:true})).toHaveText('Standard');await expect(root.locator('#section-reference')).toBeVisible();
});

for(const width of [1440,1120,768,390,320,286])test('all top Views wrap without overflow or presentation height changes at '+width,async({page,server},info)=>{
  await page.setViewportSize({width,height:1000});const raw=story('lavender'),tab=raw.page.sections[0].tabs[0];
  tab.views.push(...Array.from({length:4},(_,i)=>({id:'long-'+i,name:i===0?'Complete product journey and implementation review with supporting source context'.slice(0,80):'Additional review choice '+(i+1),presentation:i%2?'explore':'standard',sections:['build','review']})));
  const input=path.join(server.root,'top-long.json'),output=path.join(server.root,'top-long.html');await writeFile(input,JSON.stringify(raw));execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),output]);await page.goto(server.origin+'/top-long.html');await page.evaluate(()=>document.fonts.ready);
  const nav=page.locator('.reader-navigation'),strip=nav.locator('.reader-view-strip');await expect(strip.getByRole('tab')).toHaveCount(7);
  const box=await nav.boundingBox();
  for(const choice of await strip.getByRole('tab').all()){
    await expect(choice).toBeVisible();const r=await choice.boundingBox();expect(r.x).toBeGreaterThanOrEqual(0);expect(r.x+r.width).toBeLessThanOrEqual(width);expect(r.height).toBeGreaterThanOrEqual(30);expect(r.y+r.height).toBeLessThanOrEqual(box.y+box.height-45);
    await choice.click();await expect(choice).toHaveAttribute('aria-selected','true');expect(await nav.boundingBox()).toEqual(box);
  }
  // Selection is synchronous, but the shared viewport and header ResizeObservers
  // finish their layout on subsequent frames. Assert the exact settled document
  // width, including content outside the header, rather than racing that work.
  try{await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);}
  catch(error){
    const diagnostic=await page.evaluate(async()=>{
      const frames=[];
      for(let i=0;i<3;i++){
        if(i)await new Promise(requestAnimationFrame);
        const limit=document.documentElement.clientWidth;
        frames.push({root:document.documentElement.scrollWidth,body:document.body.scrollWidth,limit,
          overflow:[...document.querySelectorAll('*')].filter(el=>{const r=el.getBoundingClientRect();return r.width&&r.right>limit;}).map(el=>{
            const r=el.getBoundingClientRect(),s=getComputedStyle(el),ancestors=[];
            for(let parent=el.parentElement;parent;parent=parent.parentElement)ancestors.push({tag:parent.tagName,id:parent.id,class:parent.getAttribute('class'),overflow:getComputedStyle(parent).overflow});
            return{tag:el.tagName,id:el.id,class:el.getAttribute('class'),x:r.x,right:r.right,width:r.width,scrollWidth:el.scrollWidth,clientWidth:el.clientWidth,position:s.position,overflow:s.overflow,minWidth:s.minWidth,ancestors};
          })});
      }
      return frames;
    });
    await info.attach('document-overflow-geometry',{body:JSON.stringify(diagnostic,null,2),contentType:'application/json'});throw error;
  }
  const center=await nav.locator('.reader-page-index').evaluate(el=>{const r=el.getBoundingClientRect();return(r.left+r.right)/2;});expect(Math.abs(center-width/2)).toBeLessThan(1);
  await strip.getByRole('tab',{name:'Explore story',exact:true}).click();const canvas=await page.locator('.viewer-diagram-canvas').boundingBox();expect(canvas.y).toBe(box.y+box.height);
  if(width>670){const side=await nav.locator('.reader-contents').boundingBox();expect(side.y).toBe(box.y+box.height);}
  await info.attach('wrapped-top-'+width,{body:await page.screenshot(),contentType:'image/png'});
});

/* #554 exported reader chrome. Chuck's ruling: remove the build line, keep the theme picker.
   row | fixture | assertion (scoped) | rejects
   1 no build line on load | exported contents.html (pastel), Full + Explore views | #docview has no [data-dv-skin-label], no direct-child <p> reading "generated from spec", and the whole page body text omits it | CSS-only hiding; dropping only the data attribute; moving the line into another element
   2 no build line after theme change | real clicks Theme -> each skin | same scoped check after every skin | applySkinClasses re-inserting or rewriting the line
   3 theme picker kept | .reader-theme-footer in exported page | footer visible; choosing a theme via real clicks flips #docview's sk-* class and the summary | hiding the picker per the issue's original recommendation
   4 header company name >= 4.5:1 | global placeholder brand, every SELECTABLE skin | .doc-heading .doc-company-brand .fv-brand-name color vs the composited ancestor background-color AND that base under every ancestor background-image gradient stop (worst case) | white brand fg (#FFFFFF) inherited onto light skins; fixing only one skin; passing only on the flat base under a tinted gradient
   5 monogram text >= 4.5:1 | same | .fv-brand-monogram color vs its own background | a fix that recolors the mark text onto its accent fill
   The brand must render (company-brand-header.test.js and shared-icons.spec.mjs require it), so "not rendered" is not taken here. */
test('exported reader omits the build line, keeps the theme picker and renders a legible company placeholder',async({page,server})=>{
  const root=await open(page,server,'pastel'),themes=['aurora','pastel','blueprint','terminal','rose','lavender','lilac'];
  const footer=root.locator('.reader-theme-footer'),summary=footer.locator('.reader-theme-menu>summary');
  const brand=root.locator(':scope > .doc-heading .doc-company-brand'),name=brand.locator('.fv-brand-name'),mark=brand.locator('.fv-brand-monogram');
  async function noBuildLine(){
    await expect(root.locator('[data-dv-skin-label]')).toHaveCount(0);
    await expect(root.locator(':scope > p').filter({hasText:/generated from spec/i})).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText(/generated from spec/i);
  }
  const contrast=locator=>locator.evaluate((el,own)=>{
    const rgba=v=>{const m=v.match(/[\d.]+/g).map(Number);return{r:m[0],g:m[1],b:m[2],a:m.length>3?m[3]:1};};
    const over=(top,base)=>({r:top.r*top.a+base.r*(1-top.a),g:top.g*top.a+base.g*(1-top.a),b:top.b*top.a+base.b*(1-top.a),a:1});
    const layers=[],stops=[];for(let node=own?el:el.parentElement;node;node=node.parentElement){const s=getComputedStyle(node),c=rgba(s.backgroundColor);(s.backgroundImage.match(/rgba?\([^)]*\)/g)||[]).forEach(v=>stops.push(rgba(v)));if(c.a>0)layers.push(c);if(c.a>=1)break;}
    let bg={r:255,g:255,b:255,a:1};for(const layer of layers.reverse())bg=over(layer,bg);
    const lum=c=>{const ch=[c.r,c.g,c.b].map(v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);});return 0.2126*ch[0]+0.7152*ch[1]+0.0722*ch[2];};
    // Worst case over the flat base and the base under each gradient stop.
    return Math.min(...[bg].concat(stops.map(stop=>over(stop,bg))).map(back=>{const a=lum(over(rgba(getComputedStyle(el).color),back)),b=lum(back);return(Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);}));
  },locator===mark);
  await expect(root).toHaveClass(/sk-pastel/);await expect(summary).toHaveAttribute('data-current-skin','pastel');
  const strip=root.getByRole('tablist',{name:'Views in selected Tab'});
  for(const view of ['Full story','Explore story']){await strip.getByRole('tab',{name:view,exact:true}).click();await noBuildLine();}
  await expect(footer).toBeVisible();await expect(summary).toHaveAttribute('aria-label','Choose theme');
  await expect(name).toHaveText(activeCompanyBrand.app);await expect(name).toBeVisible();await expect(mark).toBeVisible();
  for(const skin of themes){
    await summary.click();await footer.locator('[data-reader-skin="'+skin+'"]').click();
    await expect(root).toHaveClass(new RegExp('(^|\\s)sk-'+skin+'(\\s|$)'));await expect(summary).toHaveAttribute('data-current-skin',skin);
    await noBuildLine();
    expect(await contrast(name),'company name contrast in '+skin).toBeGreaterThanOrEqual(4.5);
    expect(await contrast(mark),'monogram contrast in '+skin).toBeGreaterThanOrEqual(4.5);
  }
});

test('embedded top Views only offer memberships containing the embedded Section',async({page,server})=>{
  const root=await open(page,server);await page.goto(server.origin+'/contents.html#embed=build&v=explore');
  const strip=root.getByRole('tablist',{name:'Views in selected Tab'});await expect(strip.getByRole('tab')).toHaveText(['Full story','Explore story']);
  await expect(root.locator('.reader-tree-sections[data-reader-view="full"] .reader-tree-section')).toHaveText(['Turn a doorbell story into a reviewable draft']);
  for(const name of ['Full story','Explore story']){await strip.getByRole('tab',{name,exact:true}).click();await expect(root.locator('.doc-sec .board:visible')).toHaveCount(1);await expect(root.locator('#section-build .board')).toBeVisible();await expect(root.locator('.reader-page-label')).toHaveText('Section 1 of 1');}
});

test('native top Views retain focus and align wrapped headers with their bounded canvas',async({page,server})=>{
  await writeFile(path.join(server.root,'top-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
  await writeFile(path.join(server.root,'top-native.html'),'<style>body{margin:0;padding:40px}.host{width:570px;height:760px;overflow:auto;position:relative}</style><div id="one" class="host"></div><script type="module">import {mountNativeViewer} from "./top-native.js";window.mount=mountNativeViewer;</script>');
  await page.goto(server.origin+'/top-native.html');await page.waitForFunction(()=>!!window.mount);await page.evaluate(raw=>window.viewer=mount(document.querySelector('#one'),raw),story('lilac'));
  const host=page.locator('#one'),nav=host.locator('.reader-navigation'),strip=nav.getByRole('tablist',{name:'Views in selected Tab'});
  for(const width of [570,286,1120]){
    await host.evaluate((el,width)=>el.style.width=width+'px',width);await expect.poll(()=>nav.evaluate(el=>el.getBoundingClientRect().width)).toBe(width);
    const explore=strip.getByRole('tab',{name:'Explore story',exact:true});await explore.click();await expect(explore).toBeFocused();await expect(explore).toHaveAttribute('aria-selected','true');
    const header=await nav.boundingBox(),canvas=await host.locator('.viewer-diagram-canvas').boundingBox(),bounds=await host.locator('flowview-root').boundingBox();expect(header.y).toBe(bounds.y);expect(canvas.y).toBe(header.y+header.height);expect(canvas.x).toBeGreaterThanOrEqual(bounds.x);expect(canvas.x+canvas.width).toBeLessThanOrEqual(bounds.x+bounds.width);expect(canvas.y+canvas.height).toBe(bounds.y+bounds.height);
    await strip.getByRole('tab',{name:'Full story',exact:true}).click();expect(await nav.boundingBox()).toEqual(header);
  }
  await page.evaluate(()=>viewer.destroy());await expect(nav).toHaveCount(0);
});

/* #552 — Contents "you are here" on scroll; header title room at 1440.
   row | fixture | assertion (scoped) | rejects
   S1 precondition | Full story stack, 1440x900, top of page | Full story Contents rows aria-current = [page,false,false] | a test that starts already on the target row
   S2 scroll marks entry | real mouse.wheel down to Review | Full story rows = [false,page,false] (only the Review row) | highlight stuck on the last clicked/loaded row
   S3 scroll to end | real mouse.wheel to page end | rows = [false,false,page] | tracking only the first transition / never reaching the last section
   S4 scroll back | real mouse.wheel up to top | rows = [page,false,false] | one-way tracking
   S5 click still works | real click on the Review row | that row aria-current=page, #section-review top within 24px under the header (its scroll-margin) | scroll tracking that swallows or overrides Contents clicks
   S6 click does not pin | real mouse.wheel up after the click | rows = [page,false,false] | a click that freezes the highlight ("keeps whatever was last clicked")
   S7 deep link kept | opened from #t=<tab>&d=build deep link; location.hash before/after each scroll | full hash (t= and d=) unchanged by scrolling; click rewrites d=review and keeps t= | scroll tracking that rewrites #d=/#t= deep links
   T1 title fits | 31-char Tab label, 1440x900 | .reader-tab-label text = full label and its scrollWidth <= clientWidth | a 120px header column that ellipsizes "Chime Doorbell — …"
   T2 hover tooltip | same | .reader-tab-label title = full label | a clipped label without a full-title tooltip
   T3 long title bounded | 90-char Tab label, 1440x900 | title = full label; label right edge <= Views strip left; no page-wide horizontal overflow | an unbounded label pushing the Views strip off the header */
function labelled(label){const raw=story();raw.page.sections[0].tabs[0].label=label;return raw;}
test('scrolling marks the visible section in Contents without pinning clicks or rewriting the deep link',async({page,server})=>{
  await page.setViewportSize({width:1440,height:900});const root=await openRaw(page,server,labelled('Chime Doorbell — motion to clip'),'contents-scroll');await page.goto(server.origin+'/contents-scroll.html#t=chime-doorbell-motion-to-clip&d=build&v=full');await page.reload();
  const rows=root.locator('.reader-tree-sections[data-reader-view="full"] .reader-tree-section'),current=()=>rows.evaluateAll(els=>els.map(el=>el.getAttribute('aria-current')));
  const wheel=async dy=>{await page.mouse.move(720,600);await page.mouse.wheel(0,dy);};
  await expect(rows).toHaveText(['Turn a doorbell story into a reviewable draft','Decide what becomes the accepted diagram','Find the right workspace in Backstage']);
  await expect.poll(current).toEqual(['page','false','false']);const hash=await page.evaluate(()=>location.hash);expect(hash).toContain('t=chime-doorbell-motion-to-clip');expect(hash).toContain('d=build');
  const reviewTop=await root.locator('#section-review').evaluate(el=>el.getBoundingClientRect().top),navBottom=await root.locator('.reader-navigation').evaluate(el=>el.getBoundingClientRect().bottom);
  await wheel(Math.round(reviewTop-navBottom-8));await expect.poll(current).toEqual(['false','page','false']);expect(await page.evaluate(()=>location.hash)).toBe(hash);
  await wheel(4000);await expect.poll(current).toEqual(['false','false','page']);expect(await page.evaluate(()=>location.hash)).toBe(hash);
  await wheel(-4000);await expect.poll(current).toEqual(['page','false','false']);expect(await page.evaluate(()=>location.hash)).toBe(hash);
  await rows.nth(1).click();await expect.poll(current).toEqual(['false','page','false']);await expect.poll(()=>page.evaluate(()=>location.hash)).toContain('d=review');expect(await page.evaluate(()=>location.hash)).toContain('t=chime-doorbell-motion-to-clip');
  const target=await root.locator('#section-review').boundingBox(),header=await root.locator('.reader-navigation').boundingBox();expect(target.y).toBeGreaterThanOrEqual(header.y+header.height);expect(target.y).toBeLessThanOrEqual(header.y+header.height+24);
  const clicked=await page.evaluate(()=>location.hash);await wheel(-4000);await expect.poll(current).toEqual(['page','false','false']);expect(await page.evaluate(()=>location.hash)).toBe(clicked);
});
test('header Tab title keeps about 30 characters unclipped at 1440 and names the full title on hover',async({page,server})=>{
  await page.setViewportSize({width:1440,height:900});
  for(const label of ['Chime Doorbell — motion to clip','Chime Doorbell — motion to clip, thermal throttle, shutdown and recovery for the resident']){
    const root=await openRaw(page,server,labelled(label),'contents-title-'+label.length),title=root.locator('.reader-top .reader-tab-label');
    await expect(title).toHaveText(label);await title.hover();await expect(title).toHaveAttribute('title',label);
    const box=await title.evaluate(el=>({scroll:el.scrollWidth,client:el.clientWidth,right:el.getBoundingClientRect().right,strip:el.closest('.reader-top').querySelector('.reader-view-strip').getBoundingClientRect().left}));
    if(label.length<=31)expect(box.scroll).toBeLessThanOrEqual(box.client);
    expect(box.right).toBeLessThanOrEqual(box.strip);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(1440);
  }
});

/* #622 — closed Contents: labelled toggle, numbered rail with hover overlay and click-to-pin, and a pager over document parts.
   A part is a top-level Contents entry: the page's own sections, then each Tab. atlas() has six: Doorbell atlas (page
   section), then five Tabs; "Answer and talk" holds two Views of two sections each, so a per-View pager reads "1 of 2" there.
   row | fixture | assertion (scoped) | rejects
   P0 precondition | atlas(), 1440x900, no hash | .reader-contents visible, .reader-rail hidden, toggle aria-expanded=true; the reader lands on the first Tab (engine default activeTarget), so part 2 | a test that starts with Contents already closed
   A1 labelled toggle | same | .reader-top>button text = "Contents · 6 sections"; accessible name stays "Close Contents"/"Open Contents" | a bare ☰ icon; a count of sections in the current View
   R1 rail shown when closed | real click on the toggle | .reader-rail visible, 44px wide, left edge = navigation left; ends at the viewport bottom | no rail; a rail that stays when Contents is pinned
   R2 markers are buttons | same | rail buttons text = 1..6; each button's accessible name = that part's Contents title, in order | unnamed/number-only markers; markers for sections of one View
   R3 current + progress | same | exactly one marker aria-current=page (marker 2, the landing Tab); .reader-rail-count = "2/6" | no current marker; a 0-based or per-View count
   R4 content not covered | same | #section-overview left >= rail right | a rail drawn over the page content
   H1 no pass-through open | real mouse sweep content → marker 3 → content | no overlay shown at any time (MutationObserver log on .reader-contents hidden) | opening on pointerenter without a delay
   H2 no edge trigger | real hover at the top bar's left edge and in the content just right of the rail, 600ms each | overlay never shown | a screen-edge hot zone
   H3 hover-intent overlay | real hover on marker 2 | .reader-contents visible with .reader-contents-overlay, opened 150–700ms after the rail's pointerenter; its left edge = rail right; #section-overview box unchanged; toggle still aria-expanded=false | a 0ms open; the pinned push sidebar; an overlay that moves the page
   H4 numbered entries match | overlay open | each .reader-tree-tab .reader-part-number = the rail marker text in order and its name = the marker's name | unnumbered Contents; numbers that drift from the rail
   H5 only current part expanded | overlay open on part 2 | .reader-tree-tab aria-expanded = [false,true,false×4] | the pinned all-expanded tree in the overlay
   H6 mouse leave closes after a delay | real mouse move from the marker into the overlay, then to the page centre | crossing into the overlay keeps it open 600ms later; leaving it hides it 150–1000ms after the pointerleave; toggle aria-expanded=false | an overlay that stays until clicked; one that closes the instant the pointer leaves the rail
   E1 Esc closes | real hover open, then keyboard Escape | overlay hidden | Esc only handled inside the navigation
   K1 click pins | real click on marker 4 while the overlay is open | toggle aria-expanded=true; panel without .reader-contents-overlay at the navigation's left; rail hidden; tab label "Smart motion"; pager "Section 4 of 6"; every Contents Tab aria-expanded=true (#607) | a click that only navigates; a pinned panel that keeps the overlay tree
   K2 keyboard | Fit focused, real Tab presses | Tab from the toolbar's last control lands on marker 1, Tab ×4 on marker 5; Enter → toggle aria-expanded=true, pager "Section 5 of 6", focus on the current Contents row inside "Day-one setup" | mouse-only markers; a marker that pins without navigating
   G1 pager unit | Contents closed on part 4 | pager group "Document sections"; Previous → "Section 3 of 6" with tab label "Answer and talk", marker 3 current, count "3/6" (not "Section 1 of 2"); Previous ×2 → "Section 1 of 6", Previous disabled; Next ×5 → "Section 6 of 6", Next disabled | today's per-View pager
   X1 Explore accepts the rail | Answer map (Explore) with Contents closed | .viewer-diagram-canvas left = rail right | a canvas under the rail
   X2 canvas drag | real mouse down on the canvas, drag onto marker 2, hold 600ms, release | overlay never shown | opening from drags that pass over the rail
   D1 deep link | fresh load of #d=setup | pager "Section 5 of 6"; after closing, marker 5 current and count "5/6" | parts counted from the landing default instead of the link
   D2 hash change | real same-document navigation to #d=talk&v=answer-explore | pager "Section 3 of 6", #section-talk is the Explore section | hashchange that leaves the pager on the old part
   D3 cross-document link | second document with a handoff to contents-rail section setup; real click on its new-tab link | opened tab: tab label "Day-one setup", pager "Section 5 of 6" | a cross-document landing on part 1
   B1 Backstage native | atlas() through nativeViewer.js in a 1200x800 shadow host | rail visible inside the host with the six named markers; hover opens the overlay beside the rail without moving the page; Escape closes; the overlay's "Pin Contents open" pins (toggle expanded, rail hidden); Next → "Section 3 of 6" | fixing only the standalone viewer
   W1 Workbench reader | atlas() pasted into workbench.html | after closing Contents: rail with six named markers left of the Workbench tool rail; hover opens the overlay; pager "Section 1 of 6", Next → "Section 2 of 6" with marker 2 current | fixing only the viewer bundle
   N1 phone hides the rail | atlas() at 390x844 (read-only mobile) | .reader-rail hidden; #section-overview left < 44; Next → "Section 3 of 6"; widening to 1440 shows the rail with its single current marker = the pager's part | a rail covering phone content
   M1 many parts scroll | 30 one-section prose Tabs at 1440x900, Tab link #t=part-28, Contents closed | rail bottom = 900; .reader-rail-list scrollHeight > clientHeight; marker 28 is current and its box lies inside the list's box; the rail's own .reader-rail-count reads "28/30" and its box lies inside the rail's box | a rail that overflows the window or hides the current marker off-list
   C1 current marker contrast | every theme in the picker at 1440, Contents closed | current marker text vs its own filled background >= 4.5:1 | accent-on-accent or dark-on-dark text in the dark skins */
function atlas(skin='pastel'){
  const base=story(skin).page.sections[0].tabs[0].sections[0],section=(id,heading)=>({...structuredClone(base),id,heading});
  const tab=(label,id,heading)=>({label,sections:[section(id,heading)]}),setup=tab('Day-one setup','setup','Set up on day one');
  // Tall enough to scroll to the top of a 1800x1200 window, so scroll tracking keeps a deep-linked landing on it.
  setup.sections[0].text=Array(80).fill('Pair over BLE, hand over WiFi credentials, enroll the device certificate and bind it to the owner account.').join(' ');
  const answer={label:'Answer and talk',defaultView:'answer-pages',views:[{id:'answer-pages',name:'Answer pages',presentation:'standard',sections:['answer','talk']},{id:'answer-explore',name:'Answer map',presentation:'explore',sections:['answer','talk']}],sections:[section('answer','Answer the door'),section('talk','Talk through the chime')]};
  return {page:{title:'Doorbell atlas',skin,sections:[section('overview','Atlas overview'),{tabs:[tab('The doorbell moment','moment','The doorbell moment'),answer,tab('Smart motion','motion','Detection that respects the mask'),setup,tab('Offline recovery','offline','Recover when offline')]}]}};
}
const atlasParts=['Doorbell atlas','The doorbell moment','Answer and talk','Smart motion','Day-one setup','Offline recovery'];
const railOf=root=>root.locator('.reader-rail'),marksOf=root=>railOf(root).getByRole('button');
async function closeContents(root){const toggle=root.locator('.reader-top>button');await expect(toggle).toHaveAttribute('aria-expanded','true');await toggle.click();await expect(toggle).toHaveAttribute('aria-expanded','false');await expect(railOf(root)).toBeVisible();}
async function expectCurrentPart(root,index){
  const marks=marksOf(root);await expect(marks.nth(index)).toHaveAttribute('aria-current','page');await expect(railOf(root).locator('[aria-current="page"]')).toHaveCount(1);
  await expect(railOf(root).locator('.reader-rail-count')).toHaveText((index+1)+'/'+atlasParts.length);
}
async function expectRailMarkers(root){
  const marks=marksOf(root);await expect(marks).toHaveText(atlasParts.map((_,i)=>String(i+1)));
  for(let i=0;i<atlasParts.length;i++)await expect(marks.nth(i)).toHaveAccessibleName(atlasParts[i]);
}
// Observe (never drive) the panel: log the rail's pointerenter and every show/hide of .reader-contents.
async function watchOverlay(nav){await nav.evaluate(el=>{const side=el.querySelector('.reader-contents'),rail=el.querySelector('.reader-rail'),log=el.__overlayLog=[];rail.addEventListener('pointerenter',()=>log.push({type:'enter',t:performance.now()}));[rail,side].forEach(target=>target.addEventListener('pointerleave',()=>log.push({type:'leave',t:performance.now()})));new MutationObserver(()=>log.push({type:side.hidden?'hidden':'shown',t:performance.now()})).observe(side,{attributes:true,attributeFilter:['hidden']});});}
const takeLog=nav=>nav.evaluate(el=>el.__overlayLog.splice(0));
async function expectNeverShown(page,nav,ms=600){await page.waitForTimeout(ms);expect((await takeLog(nav)).filter(entry=>entry.type==='shown')).toEqual([]);await expect(nav.locator('.reader-contents')).toBeHidden();}
async function expectHoverOverlay(page,root,index){
  const nav=root.locator('.reader-navigation'),side=root.locator('.reader-contents'),rail=await railOf(root).boundingBox(),before=await root.locator('#section-overview').boundingBox();
  await takeLog(nav);await marksOf(root).nth(index).hover();await expect(side).toBeVisible();await expect(side).toHaveClass(/reader-contents-overlay/);
  const log=await takeLog(nav),shown=log.find(entry=>entry.type==='shown'),enter=log.filter(entry=>entry.type==='enter' && entry.t<=shown.t).pop();
  expect(enter,'pointerenter before the overlay').toBeTruthy();expect(shown.t-enter.t).toBeGreaterThanOrEqual(150);expect(shown.t-enter.t).toBeLessThanOrEqual(700);
  const box=await side.boundingBox();expect(Math.abs(box.x-(rail.x+rail.width))).toBeLessThanOrEqual(1);
  expect(await root.locator('#section-overview').boundingBox()).toEqual(before);await expect(root.locator('.reader-top>button')).toHaveAttribute('aria-expanded','false');
}

test('#622 closed Contents shows a numbered rail, a hover overlay that pins on click, and a pager over document parts',async({page,server})=>{
  await page.setViewportSize({width:1440,height:900});
  const root=await openRaw(page,server,atlas(),'contents-rail'),nav=root.locator('.reader-navigation'),toggle=root.locator('.reader-top>button'),side=root.locator('.reader-contents'),label=root.locator('.reader-page-label'),pager=root.locator('.reader-page-index');
  await expect(side).toBeVisible();await expect(railOf(root)).toBeHidden();await expect(toggle).toHaveAttribute('aria-expanded','true');
  await expect(toggle).toHaveText(/^Contents\s*·\s*6 sections$/);await expect(toggle).toHaveAccessibleName('Close Contents');
  // The engine's landing target is the first Tab, so a page with its own section above the Tabs lands on part 2.
  await expect(pager).toHaveAttribute('aria-label','Document sections');await expect(label).toHaveText('Section 2 of 6');await expect(root.locator('.reader-tab-label')).toHaveText('The doorbell moment');
  await closeContents(root);await expect(toggle).toHaveAccessibleName('Open Contents');
  const navBox=await nav.boundingBox(),rail=await railOf(root).boundingBox();
  expect(rail.width).toBe(44);expect(rail.x).toBe(navBox.x);expect(rail.y).toBe(navBox.y+navBox.height);expect(rail.y+rail.height).toBe(900);
  await expectRailMarkers(root);await expectCurrentPart(root,1);
  expect((await root.locator('#section-overview').boundingBox()).x).toBeGreaterThanOrEqual(rail.x+rail.width);
  await watchOverlay(nav);const third=await marksOf(root).nth(2).boundingBox();
  await page.mouse.move(700,450);await page.mouse.move(third.x+third.width/2,third.y+third.height/2);await page.mouse.move(700,450);await expectNeverShown(page,nav);
  await page.mouse.move(1,navBox.y+20);await expectNeverShown(page,nav);await page.mouse.move(rail.x+rail.width+4,third.y+third.height/2);await expectNeverShown(page,nav);
  await expectHoverOverlay(page,root,1);
  const tabs=root.locator('.reader-tree-tab');await expect(tabs).toHaveCount(6);
  for(let i=0;i<6;i++){await expect(tabs.nth(i).locator('.reader-part-number')).toHaveText(String(i+1));await expect(tabs.nth(i)).toHaveAccessibleName(atlasParts[i]);}
  expect(await tabs.evaluateAll(els=>els.map(el=>el.getAttribute('aria-expanded')))).toEqual(['false','true','false','false','false','false']);
  const overlay=await side.boundingBox();await page.mouse.move(overlay.x+overlay.width/2,overlay.y+overlay.height/2);await page.waitForTimeout(600);await expect(side).toBeVisible();
  await takeLog(nav);await page.mouse.move(900,500);await expect(side).toBeHidden();await expect(toggle).toHaveAttribute('aria-expanded','false');
  const closing=await takeLog(nav),left=closing.find(entry=>entry.type==='leave'),hidden=closing.find(entry=>entry.type==='hidden');
  expect(left && hidden,'pointerleave then hide').toBeTruthy();expect(hidden.t-left.t).toBeGreaterThanOrEqual(150);expect(hidden.t-left.t).toBeLessThanOrEqual(1000);
  await marksOf(root).nth(1).hover();await expect(side).toBeVisible();await page.keyboard.press('Escape');await expect(side).toBeHidden();await expect(toggle).toHaveAttribute('aria-expanded','false');
  await page.mouse.move(900,500);await expectHoverOverlay(page,root,3);await marksOf(root).nth(3).click();
  await expect(toggle).toHaveAttribute('aria-expanded','true');await expect(side).toBeVisible();await expect(side).not.toHaveClass(/reader-contents-overlay/);expect((await side.boundingBox()).x).toBe(navBox.x);await expect(railOf(root)).toBeHidden();
  await expect(root.locator('.reader-tab-label')).toHaveText('Smart motion');await expect(label).toHaveText('Section 4 of 6');
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  expect(await tabs.evaluateAll(els=>els.map(el=>el.getAttribute('aria-expanded')))).toEqual(Array(6).fill('true'));
  expect((await root.locator('#section-motion').boundingBox()).x).toBeGreaterThanOrEqual((await side.boundingBox()).x+(await side.boundingBox()).width);
  await closeContents(root);await expectCurrentPart(root,3);
  await root.locator('.reader-toolbar').getByRole('button',{name:'Fit',exact:true}).focus();await page.keyboard.press('Tab');await expect(marksOf(root).nth(0)).toBeFocused();
  for(let i=0;i<4;i++)await page.keyboard.press('Tab');await expect(marksOf(root).nth(4)).toBeFocused();await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded','true');await expect(label).toHaveText('Section 5 of 6');await expect(root.locator('.reader-tab-label')).toHaveText('Day-one setup');
  await expect(root.locator('.reader-contents-tab').filter({has:page.locator('.reader-tree-tab',{hasText:'Day-one setup'})}).locator('[aria-current="page"]:focus')).toHaveCount(1);
  await root.getByRole('button',{name:'Next section',exact:true}).click();await expect(label).toHaveText('Section 6 of 6');await root.getByRole('button',{name:'Previous section',exact:true}).click();await root.getByRole('button',{name:'Previous section',exact:true}).click();await expect(label).toHaveText('Section 4 of 6');
  await closeContents(root);await expectCurrentPart(root,3);
  const previous=pager.getByRole('button',{name:'Previous section',exact:true}),next=pager.getByRole('button',{name:'Next section',exact:true});
  await previous.click();await expect(label).toHaveText('Section 3 of 6');await expect(root.locator('.reader-tab-label')).toHaveText('Answer and talk');await expect(root.locator('#section-answer')).toBeVisible();await expectCurrentPart(root,2);
  await previous.click();await expect(label).toHaveText('Section 2 of 6');await previous.click();await expect(label).toHaveText('Section 1 of 6');await expect(previous).toBeDisabled();await expectCurrentPart(root,0);
  for(let i=2;i<=6;i++){await next.click();await expect(label).toHaveText('Section '+i+' of 6');}
  await expect(next).toBeDisabled();await expect(root.locator('.reader-tab-label')).toHaveText('Offline recovery');await expectCurrentPart(root,5);
  await page.evaluate(()=>location.hash='d=talk&v=answer-explore');await expect(label).toHaveText('Section 3 of 6');await expect(root.locator('.explore-active-section')).toHaveAttribute('id','section-talk');await expectCurrentPart(root,2);
  const canvas=await root.locator('.viewer-diagram-canvas').boundingBox(),railNow=await railOf(root).boundingBox();expect(canvas.x).toBe(railNow.x+railNow.width);
  const second=await marksOf(root).nth(1).boundingBox();await takeLog(nav);
  await page.mouse.move(canvas.x+canvas.width/2,canvas.y+canvas.height/2);await page.mouse.down();await page.mouse.move(second.x+second.width/2,second.y+second.height/2,{steps:12});await page.waitForTimeout(600);await page.mouse.up();
  await expectNeverShown(page,nav,400);await page.mouse.move(900,500);
  await page.goto(server.origin+'/contents-rail.html#d=setup');await page.reload();await expect(label).toHaveText('Section 5 of 6');await expect(root.locator('.reader-tab-label')).toHaveText('Day-one setup');
  await closeContents(root);await expectCurrentPart(root,4);
  const linking={page:{title:'Rail linking document',documentLinks:{id:'rail-linking',siteBaseUrl:server.origin+'/rail-linking.html'},sections:[{id:'source',heading:'Source',diagram:{nodes:{a:{title:'Setup link',handoff:{spec:'contents-rail',section:'setup',siteBaseUrl:server.origin+'/contents-rail.html'}}},rows:[['a']]}}]}};
  await openRaw(page,server,linking,'rail-linking');const opened=page.context().waitForEvent('page');await page.getByRole('link',{name:'Open Setup link diagram (new tab)',exact:true}).click();const linked=await opened;
  const target=linked.locator('#docview');await expect(target.locator('.reader-tab-label')).toHaveText('Day-one setup');await expect(target.locator('.reader-page-label')).toHaveText('Section 5 of 6');await linked.close();
});

test('#622 a long document scrolls its rail and keeps the current marker in view',async({page,server})=>{
  // Prose-only parts: thirty stepped diagrams make the page too slow to load.
  await page.setViewportSize({width:1440,height:900});
  const raw={page:{title:'Thirty parts',sections:[{tabs:Array.from({length:30},(_,i)=>({label:'Part '+(i+1),sections:[{id:'part-'+(i+1),heading:'Part '+(i+1)+' section',text:'Part '+(i+1)+' prose.'}]}))}]}};
  const root=await openRaw(page,server,raw,'contents-rail-long');await page.goto(server.origin+'/contents-rail-long.html#t=part-28');await page.reload();
  await expect(root.locator('.reader-page-label')).toHaveText('Section 28 of 30');await closeContents(root);
  const rail=await railOf(root).boundingBox();expect(rail.y+rail.height).toBe(900);await expect(marksOf(root)).toHaveCount(30);
  const list=root.locator('.reader-rail-list');expect(await list.evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true);
  const counter=railOf(root).locator('.reader-rail-count');await expect(marksOf(root).nth(27)).toHaveAttribute('aria-current','page');await expect(counter).toHaveText('28/30');await expect(counter).toBeVisible();
  const box=await list.boundingBox(),mark=await marksOf(root).nth(27).boundingBox(),count=await counter.boundingBox();
  expect(mark.y).toBeGreaterThanOrEqual(box.y);expect(mark.y+mark.height).toBeLessThanOrEqual(box.y+box.height);
  expect(count.x).toBeGreaterThanOrEqual(rail.x);expect(count.x+count.width).toBeLessThanOrEqual(rail.x+rail.width);expect(count.y).toBeGreaterThanOrEqual(box.y+box.height);expect(count.y+count.height).toBeLessThanOrEqual(rail.y+rail.height);
});

test('#622 Backstage native reader shows the rail, hover overlay, pin and part pager',async({page,server})=>{
  await page.setViewportSize({width:1440,height:900});
  await writeFile(path.join(server.root,'rail-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
  await writeFile(path.join(server.root,'rail-native.html'),'<style>body{margin:0}.host{width:1200px;height:800px;overflow:auto;position:relative}</style><div id="one" class="host"></div><script type="module">import {mountNativeViewer} from "./rail-native.js";window.mount=mountNativeViewer;</script>');
  await page.goto(server.origin+'/rail-native.html');await page.waitForFunction(()=>!!window.mount);await page.evaluate(raw=>{window.one=mount(document.querySelector('#one'),raw);},atlas());
  const native=page.locator('#one'),host=await native.boundingBox(),toggle=native.locator('.reader-top>button'),side=native.locator('.reader-contents');
  await expect(side).toBeVisible();await expect(toggle).toHaveText(/^Contents\s*·\s*6 sections$/);await closeContents(native);
  const rail=await railOf(native).boundingBox();expect(rail.x).toBeGreaterThanOrEqual(host.x);expect(rail.y+rail.height).toBeLessThanOrEqual(host.y+host.height);expect(rail.width).toBe(44);
  await expectRailMarkers(native);await expectCurrentPart(native,1);
  await watchOverlay(native.locator('.reader-navigation'));await expectHoverOverlay(page,native,1);
  await page.keyboard.press('Escape');await expect(side).toBeHidden();
  await page.mouse.move(900,500);await marksOf(native).nth(2).hover();await expect(side).toBeVisible();
  await side.getByRole('button',{name:'Pin Contents open',exact:true}).click();await expect(toggle).toHaveAttribute('aria-expanded','true');await expect(side).not.toHaveClass(/reader-contents-overlay/);await expect(railOf(native)).toBeHidden();
  await native.getByRole('button',{name:'Next section',exact:true}).click();await expect(native.locator('.reader-page-label')).toHaveText('Section 3 of 6');await expect(native.locator('.reader-tab-label')).toHaveText('Answer and talk');
});

test('#622 Workbench reader shows the rail beside its tool rail and pages through document parts',async({page,server})=>{
  await page.setViewportSize({width:1440,height:900});await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(atlas(),null,2));await closeTools(page);
  const root=page.locator('#docview'),nav=root.locator('.explore-navigation');await expect(nav.locator('.reader-contents')).toBeVisible();
  await expect(nav.locator('.reader-top>button')).toHaveText(/^Contents\s*·\s*6 sections$/);await closeContents(root);
  await expectRailMarkers(root);await expectCurrentPart(root,0);
  const rail=await railOf(root).boundingBox(),tools=await page.locator('.workspace-rail').boundingBox();expect(tools.x).toBeGreaterThanOrEqual(rail.x+rail.width);
  await page.mouse.move(900,500);await marksOf(root).nth(1).hover();await expect(nav.locator('.reader-contents')).toBeVisible();await expect(nav.locator('.reader-contents')).toHaveClass(/reader-contents-overlay/);await page.mouse.move(900,500);await expect(nav.locator('.reader-contents')).toBeHidden();
  await expect(root.locator('.reader-page-label')).toHaveText('Section 1 of 6');await nav.getByRole('button',{name:'Next section',exact:true}).click();await expect(root.locator('.reader-page-label')).toHaveText('Section 2 of 6');await expectCurrentPart(root,1);
});

test('#622 the rail is hidden at the read-only phone width and its current marker stays legible in every theme',async({page,server})=>{
  await page.setViewportSize({width:390,height:844});const root=await openRaw(page,server,atlas(),'contents-rail-phone'),toggle=root.locator('.reader-top>button');
  await expect(toggle).toHaveAttribute('aria-expanded','false');await expect(railOf(root)).toBeHidden();expect((await root.locator('#section-overview').boundingBox()).x).toBeLessThan(44);
  await expect(root.locator('.reader-page-label')).toHaveText('Section 2 of 6');await root.getByRole('button',{name:'Next section',exact:true}).click();await expect(root.locator('.reader-page-label')).toHaveText('Section 3 of 6');await expect(railOf(root)).toBeHidden();
  // Resizing re-runs scroll tracking, so check the rail against whichever part the pager reports.
  await page.setViewportSize({width:1440,height:900});await expect(railOf(root)).toBeVisible();
  await expect.poll(async()=>{const part=(await root.locator('.reader-page-label').innerText()).match(/^Section (\d+) of 6$/),marks=await railOf(root).locator('[aria-current="page"]').allInnerTexts();return !!part && marks.length===1 && marks[0]===part[1];}).toBe(true);
  const contrast=locator=>locator.evaluate(el=>{
    const rgba=v=>{const m=v.match(/[\d.]+/g).map(Number),scale=v.startsWith('color(')?255:1;return{r:m[0]*scale,g:m[1]*scale,b:m[2]*scale,a:m.length>3?m[3]:1};};
    const over=(top,base)=>({r:top.r*top.a+base.r*(1-top.a),g:top.g*top.a+base.g*(1-top.a),b:top.b*top.a+base.b*(1-top.a),a:1});
    const layers=[];for(let node=el;node;node=node.parentElement){const c=rgba(getComputedStyle(node).backgroundColor);if(c.a>0)layers.push(c);if(c.a>=1)break;}
    let bg={r:255,g:255,b:255,a:1};for(const layer of layers.reverse())bg=over(layer,bg);
    const lum=c=>{const ch=[c.r,c.g,c.b].map(v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);});return 0.2126*ch[0]+0.7152*ch[1]+0.0722*ch[2];};
    const a=lum(over(rgba(getComputedStyle(el).color),bg)),b=lum(bg);return(Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);
  });
  for(const skin of ['aurora','pastel','blueprint','terminal','rose','lavender','lilac']){
    await toggle.click();await root.locator('.reader-theme-menu>summary').click();await root.locator('[data-reader-skin="'+skin+'"]').click();await expect(root).toHaveClass(new RegExp('(^|\\s)sk-'+skin+'(\\s|$)'));
    await toggle.click();await expect(railOf(root)).toBeVisible();const current=railOf(root).locator('[aria-current="page"]');
    expect(await contrast(current),'current rail marker contrast in '+skin).toBeGreaterThanOrEqual(4.5);
  }
});
