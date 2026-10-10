import {test,expect,paste,closeTools} from '../helpers/test.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {repo} from '../helpers/prepare.mjs';
const fixture=async()=>JSON.parse(await readFile(path.join(repo,'examples/tab-views/tab-views.spec.json'),'utf8'));
async function standalone(page,server){const raw=await fixture();raw.page.blocks[0].tabs[0].sections[2].text=Array.from({length:30},()=> 'Section C explains the shared content across Views.');await writeFile(path.join(server.root,'tab-views.json'),JSON.stringify(raw));execFileSync('python3',[path.join(repo,'tools/inject.py'),path.join(server.root,'tab-views.json'),path.join(repo,'template/flowview.html'),path.join(server.root,'tab-views.html')]);await page.goto(server.origin+'/tab-views.html');return page.locator('#docview');}
const nav=root=>root.locator(':scope > .explore-navigation');
const visible=root=>root.locator('.doc-sec[data-dv-section]:visible');
for(const width of [1280,1440])test(`Tab Views enforce overlap membership and retain browser-top navigation at ${width}`,async({page,server},info)=>{
 await page.setViewportSize({width,height:950});const root=await standalone(page,server);
 await expect(nav(root).getByRole('tab',{name:'Product',exact:true})).not.toHaveAttribute('data-explore-view','true');
 await expect(visible(root)).toHaveCount(2);await expect(root.locator('#section-b')).toBeHidden();await expect(root.locator('#section-detail')).toBeHidden();
 await nav(root).evaluate(el=>{window.savedNav=el;});
 const geometry=async()=>nav(root).evaluate(el=>({same:el===window.savedNav,y:el.getBoundingClientRect().y,width:el.getBoundingClientRect().width}));
 expect(await geometry()).toEqual({same:true,y:0,width});await page.evaluate(()=>scrollTo(0,500));await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(100);expect(await geometry()).toEqual({same:true,y:0,width});
 await nav(root).getByRole('button',{name:'Explore B + C',exact:true}).click();await expect(nav(root).getByRole('tab',{name:'Product',exact:true})).toHaveAttribute('data-explore-view','true');await expect(visible(root)).toHaveCount(1);await expect(root.locator('#section-b')).toBeVisible();
 await expect(nav(root).locator('.explore-navigation-diagrams button:visible')).toHaveText(['Section B','Section C']);await nav(root).getByRole('button',{name:'Section C',exact:true}).click();await expect(root.locator('#section-c .explore-board')).toBeVisible();await expect(root.locator('#section-b')).toBeHidden();
 await expect(root.locator('.explore-player:visible')).toHaveCount(1);expect(await geometry()).toEqual({same:true,y:0,width});
 await nav(root).getByRole('button',{name:'Explore A',exact:true}).click();await expect(root.locator('#section-a .explore-board')).toBeVisible();await expect(root.locator('#section-b')).toBeHidden();await expect(root.locator('#section-c')).toBeHidden();
 await root.locator('#section-a [data-dv-detail]').click();await expect(root.locator('[data-dv-detail-preview]:visible')).toHaveCount(1);await expect(nav(root).getByRole('button',{name:'Explore B + C',exact:true})).toBeVisible();await root.locator('[data-dv-detail-preview]:visible .detail-breadcrumb button').first().click();await expect(nav(root).getByRole('button',{name:'Explore A',exact:true})).toHaveAttribute('aria-pressed','true');
 await nav(root).getByRole('button',{name:'Standard A + C',exact:true}).click();await expect(nav(root).getByRole('tab',{name:'Product',exact:true})).not.toHaveAttribute('data-explore-view','true');await expect(visible(root)).toHaveCount(2);await root.locator('#section-a [data-dv-detail]').click();await root.locator('[data-dv-detail-preview]:visible .detail-breadcrumb button').first().click();await expect(nav(root).getByRole('button',{name:'Explore A',exact:true})).toBeVisible();expect(await geometry()).toEqual({same:true,y:0,width});
 await info.attach('tab-views-'+width,{body:await page.screenshot(),contentType:'image/png'});
 await page.goto(server.origin+'/tab-views.html#d=b&v=explore-a');await expect(root.locator('#section-b')).toBeVisible();await expect(nav(root).getByRole('button',{name:'Explore B + C',exact:true})).toHaveAttribute('aria-pressed','true');await expect(nav(root).getByRole('tab',{name:'Product',exact:true})).toHaveAttribute('data-explore-view','true');await expect(root.locator('#section-a')).toBeHidden();
});
test('Workbench View authoring has one Undo and retains the selected View through content edits',async({page,server})=>{
 const raw=await fixture();await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(raw,null,2));await closeTools(page);const root=page.locator('#docview'),source=page.locator('#src');
 await nav(root).getByRole('button',{name:'Explore B + C',exact:true}).click();const before=await source.inputValue();
 await nav(root).locator('.section-view-options>summary').click();await page.getByRole('button',{name:'Duplicate View',exact:true}).click();
 const duplicated=JSON.parse(await source.inputValue());expect(duplicated.page.blocks[0].tabs[0].views).toHaveLength(4);expect(duplicated.page.blocks[0].tabs[0].sections).toEqual(raw.page.blocks[0].tabs[0].sections);
 await page.locator('#undo-builder').click();await expect(source).toHaveValue(before);await expect(nav(root).getByRole('button',{name:'Explore B + C',exact:true})).toHaveAttribute('aria-pressed','true');
 await nav(root).locator('.section-view-options>summary').click();await nav(root).getByLabel('View name',{exact:true}).fill('Review B and C');await page.getByRole('button',{name:'Rename View',exact:true}).click();await expect(nav(root).getByRole('button',{name:'Review B and C',exact:true})).toHaveAttribute('aria-pressed','true');
 await nav(root).locator('.section-view-options>summary').click();await nav(root).getByLabel('Include Section C',{exact:true}).uncheck();await expect(root.locator('#section-c')).toBeHidden();expect(JSON.parse(await source.inputValue()).page.blocks[0].tabs[0].views[1].sections).toEqual([{section:'b'}]);
 await page.locator('#undo-builder').click();await expect(nav(root).getByRole('button',{name:'Review B and C',exact:true})).toHaveAttribute('aria-pressed','true');
 await nav(root).getByRole('button',{name:'Section C',exact:true}).click();const beforeContent=await source.inputValue();await root.locator('#section-c [data-dv-node=service]').click();const title=page.locator('#guide').getByLabel('title',{exact:true});await title.fill('Edited C');await title.press('Enter');await closeTools(page);await expect(nav(root).getByRole('button',{name:'Review B and C',exact:true})).toHaveAttribute('aria-pressed','true');await expect(root.locator('#section-c [data-dv-node=service]')).toContainText('Edited C');await nav(root).getByRole('button',{name:'Standard A + C',exact:true}).click();await expect(root.locator('#section-c [data-dv-node=service]')).toContainText('Edited C');await nav(root).getByRole('button',{name:'Review B and C',exact:true}).click();
 await page.locator('#undo-builder').click();await expect(source).toHaveValue(beforeContent);await expect(nav(root).getByRole('button',{name:'Review B and C',exact:true})).toHaveAttribute('aria-pressed','true');await expect(root.locator('#section-c')).toBeVisible();
 await page.locator('#diagram-add').click();await page.locator('.diagram-add-structure>summary').click();await page.locator('#add-section').click();const added=JSON.parse(await source.inputValue());expect(added.page.blocks[0].tabs[0].sections).toHaveLength(5);expect(added.page.blocks[0].tabs[0].views[1].sections.at(-1).section).toBe(added.page.blocks[0].tabs[0].sections.at(-1).id);await page.locator('#undo-builder').click();await expect(source).toHaveValue(beforeContent);await expect(nav(root).getByRole('button',{name:'Review B and C',exact:true})).toHaveAttribute('aria-pressed','true');
 const saved=await source.inputValue();await page.reload();await expect(source).toHaveValue(saved);await expect(nav(root).getByRole('button',{name:'Review B and C',exact:true})).toBeVisible();
});
test('native Views keep host-top nav, reject cross-View destinations and isolate sibling mounts',async({page,server})=>{
 await writeFile(path.join(server.root,'tab-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));await writeFile(path.join(server.root,'tab-native.html'),'<style>body{margin:0}.host{height:700px;overflow:auto;position:relative;width:48%;display:inline-block;vertical-align:top}</style><div class="host" id="one"></div><div class="host" id="two"></div><script type="module">import {mountNativeViewer} from "./tab-native.js";window.mount=mountNativeViewer;</script>');await page.goto(server.origin+'/tab-native.html');await page.waitForFunction(()=>!!window.mount);await page.evaluate(raw=>{window.first=mount(document.querySelector('#one'),raw);window.second=mount(document.querySelector('#two'),raw);first.setCanvas(true);},await fixture());
 const one=page.locator('#one'),two=page.locator('#two'),navbar=one.locator('.explore-navigation');await navbar.evaluate(el=>window.savedNav=el);const geometry=()=>navbar.evaluate(el=>({same:el===window.savedNav,y:el.getBoundingClientRect().top,width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height}));const initial=await geometry();
 await navbar.getByRole('button',{name:'Explore B + C',exact:true}).click();expect(await page.evaluate(()=>first.snapshot())).toMatchObject({section:'b',view:'explore-bc'});await expect(two.locator('#section-a')).toBeVisible();await expect(two.locator('#section-b')).toBeHidden();
 expect(await page.evaluate(()=>{try{first.navigate({section:'c',view:'explore-a'});return false;}catch{return true;}})).toBe(true);await expect(one.locator('#section-b')).toBeVisible();
 await navbar.getByRole('button',{name:'Standard A + C',exact:true}).click();await expect(one.locator('#section-a')).toBeVisible();await expect(one.locator('#section-c')).toBeVisible();expect(await geometry()).toEqual(initial);await navbar.getByRole('button',{name:'Explore A',exact:true}).click();expect(await geometry()).toEqual(initial);
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
  await page.getByRole('button',{name:'Replay the tour',exact:true}).click();
  await expect(page.locator('.dv-tour-ui .dv-tour-heading')).toHaveText('Visit A');
  await page.keyboard.press('Escape');await expect(page.locator('.dv-tour')).toBeHidden();await assertContext();
  expect(new URL(page.url()).hash).toBe(hash);
  await page.reload();await assertContext();expect(new URL(page.url()).hash).toBe(hash);
 }
});
