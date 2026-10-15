import {test,expect,paste,prepareEditorSurface,arrangeChapter} from '../helpers/test.mjs';
import {writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {repo} from '../helpers/prepare.mjs';
function fixture(explicit=false){const raw={page:{title:'Geometry without extra Views',sections:[{id:'story',heading:'Story',diagram:{nodes:{a:{title:'Request'},b:{title:'Response'}},rows:[['a','b']],edges:[{from:'a',to:'b'}],sectionLayout:{columns:24,default:[{x:0,y:0,w:24,h:12}]}}}]}};if(explicit)raw.page.views=[{id:'reading',name:'Standard',presentation:'standard',sections:['story']}];return raw;}
async function exportPage(server,raw){const input=path.join(server.root,'geometry.json'),output=path.join(server.root,'geometry.html');await writeFile(input,JSON.stringify(raw));execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),output]);return server.origin+'/geometry.html';}
async function assertStandard(page){await expect(page.locator('.explore-navigation').first().getByRole('button',{name:'Standard',exact:true})).toBeVisible();await expect(page.locator('[data-view-layout], [data-view-focus]')).toHaveCount(0);await expect(page.locator('.explore-navigation').first().getByRole('button',{name:'Layout',exact:true})).toHaveCount(0);await expect(page.locator('.explore-navigation').first().getByRole('button',{name:'Data flow',exact:true})).toHaveCount(0);await expect(page.locator('.section-layout-grid')).toBeVisible();}
for(const explicit of [false,true])test(`saved geometry keeps only Standard in both choice layers (${explicit?'explicit':'implicit'})`,async({page,server})=>{
 await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.copiedLink=text;}}}));
 await page.setViewportSize({width:1440,height:950});const url=await exportPage(server,fixture(explicit));
 for(const alias of ['', '#d=story&v=layout','#d=story&v=flow']){await page.goto(url+alias);await assertStandard(page);await page.getByRole('button',{name:/^Copy embed link for Story/}).click();await expect.poll(()=>page.evaluate(()=>window.copiedLink)).toContain('v='+(explicit?'reading':'standard'));const copied=await page.evaluate(()=>window.copiedLink);await page.goto(copied.replace('#embed=','#d='));await page.reload();await assertStandard(page);}
 await mkdir('/tmp/section-layout-evidence',{recursive:true});await page.screenshot({path:`/tmp/section-layout-evidence/${explicit?'explicit':'implicit'}-standard.png`,fullPage:true});
});
test('Arrange geometry survives Undo, reload and standalone export without extra choices',async({page,server})=>{
 await page.setViewportSize({width:1600,height:1000});await page.goto(server.origin+'/workbench.html');const raw=fixture(),d=raw.page.sections[0].diagram;delete d.sectionLayout;d.view='step';d.autoplay=false;d.panels=[{id:'queue',type:'queue',title:'Queue'}];d.steps=[{id:'send',nodes:['a'],text:'Send request'}];
 await paste(page,JSON.stringify(raw));await prepareEditorSurface(page);await arrangeChapter(page);await page.getByRole('button',{name:'Optimize layout',exact:true}).click();
 await assertStandard(page);await page.getByRole('spinbutton',{name:'Height',exact:true}).fill('18');await page.getByRole('button',{name:'Apply size / position',exact:true}).click();
 const panelHandle=page.locator('[data-layout-key="panel:queue"] .section-tile-move');await panelHandle.focus();await page.keyboard.press('ArrowDown');
 const saved=await page.locator('#src').inputValue(),value=JSON.parse(saved),items=value.page.sections[0].diagram.sectionLayout.default,panel=items.find(it=>it.panel==='queue'),controls=items.find(it=>it.controls==='steps');expect(panel.y).toBe(1);expect(controls.attachTo).toBe('diagram');expect(value.page.sections[0].diagram.sectionLayout.default[0].h).toBe(18);expect(value.page.sections[0].diagram.layouts).toBeUndefined();
 await page.locator('#undo-builder').click();await assertStandard(page);await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(saved);await page.reload();await expect(page.locator('#src')).toHaveValue(saved);await assertStandard(page);
 await page.goto(await exportPage(server,value));await assertStandard(page);await expect(page.locator('[data-layout-key=diagram]')).toHaveCSS('--tile-h','18');
 await expect(page.locator('[data-layout-key="panel:queue"]')).toHaveCSS('--tile-y',String(panel.y+1));await expect(page.locator('[data-layout-key="panel:queue"]')).toHaveCSS('--tile-w',String(panel.w));await expect(page.locator('[data-layout-key=diagram] .termbar')).toBeVisible();expect(await page.locator('[data-layout-key=diagram]').evaluate(el=>el.style.getPropertyValue('--attached-controls-height'))).toBe((controls.h*40-8)+'px');
 await mkdir('/tmp/section-layout-evidence',{recursive:true});await page.screenshot({path:'/tmp/section-layout-evidence/arranged-export.png',fullPage:true});
});
test('legacy aliases resolve containing explicit Views while authored IDs take priority',async({page,server})=>{
 const raw=fixture(true);raw.page.sections.push({id:'other',heading:'Other',diagram:{nodes:{c:{title:'Other'}},rows:[['c']]}});raw.page.views=[{id:'reading',name:'Reading',presentation:'standard',sections:['story']},{id:'flow',name:'Authored flow',presentation:'standard',sections:['other']}];
 const url=await exportPage(server,raw);
 for(const alias of ['layout','flow']){await page.goto(url+'#d=other&v='+alias);await expect(page.locator('#section-other')).toBeVisible();await expect(page.locator('#section-story')).toBeHidden();await expect(page.locator('.explore-navigation').getByRole('button',{name:'Authored flow',exact:true})).toHaveAttribute('aria-pressed','true');}
 await page.goto(url+'#d=story&v=layout');await expect(page.locator('#section-story')).toBeVisible();await expect(page.locator('.explore-navigation').getByRole('button',{name:'Reading',exact:true})).toHaveAttribute('aria-pressed','true');
});

test('migrated explicit arrangements retain both legacy destinations and copy canonical links',async({page,server})=>{
 await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.copiedLink=text;}}}));
 const raw=fixture(),d=raw.page.sections[0].diagram;d.layouts=[{id:'layout',name:'Resident story',sectionLayout:d.sectionLayout},{id:'flow',name:'Data flow',sectionLayout:{columns:24,default:[{x:0,y:0,w:24,h:16}]}}];d.defaultLayout='layout';delete d.sectionLayout;
 const url=await exportPage(server,raw);
 for(const [id,name] of [['layout','Resident story'],['flow','Data flow']]){
  await page.goto('about:blank');await page.goto(url+'#d=story&v='+id);await expect(page.locator('.explore-navigation').getByRole('button',{name,exact:true})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:/^Copy embed link for Story/}).click();await expect.poll(()=>page.evaluate(()=>window.copiedLink)).toContain('v='+id);const copied=await page.evaluate(()=>window.copiedLink);await page.goto('about:blank');await page.goto(copied);await expect(page.locator('.section-layout-grid')).toHaveAttribute('data-layout-id',id);await page.reload();await expect(page.locator('.section-layout-grid')).toHaveAttribute('data-layout-id',id);
 }
});
