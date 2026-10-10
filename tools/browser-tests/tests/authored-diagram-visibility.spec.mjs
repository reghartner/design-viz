import {nativeViewerSource} from '../../native-viewer-build.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect,paste,prepareEditorSurface,chapterOptions,arrangeChapter} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
const seed=JSON.parse(await readFile(path.join(repo,'src/starters/named-layouts.json'),'utf8'));
function fixture(){
  const chapter=structuredClone(seed.page.sections[0]);chapter.id='first';chapter.diagram.autoplay=false;
  chapter.diagram.layouts[0].sectionLayout.default.forEach(it=>{if(!it.panel && !it.controls)delete it.hidden;});
  chapter.diagram.layouts[1].exploreLayout={panelPlacement:'canvas',controlsPlacement:'canvas',prosePlacement:'canvas',canvas:{panels:[{panel:'outcome',x:20,y:20,w:450,h:250},{panel:'clip',x:500,y:20,w:450,h:300}],controls:{x:20,y:350,w:900,h:220},prose:{x:20,y:620,w:900,h:200}}};
  const second=structuredClone(chapter);second.id='second';second.heading='Second tab story';
  return {page:{title:'Authored diagram visibility',sections:[{tabs:[{label:'First tab',sections:[chapter]},{label:'Second tab',sections:[second]}]}]}};
}
const section=page=>page.locator('#docview .doc-sec[data-dv-section="0"]');
const source=page=>page.locator('#src').inputValue();
const checkbox=page=>page.locator('#docview>.explore-navigation').getByRole('checkbox',{name:'Show selected section diagram',exact:true});
async function change(page,visible){await chapterOptions(page,section(page));if(await checkbox(page).isChecked()!==visible)await checkbox(page).click();await chapterOptions(page);await expect(checkbox(page)).toBeChecked({checked:visible});await page.keyboard.press('Escape');await prepareEditorSurface(page);}
async function open(page,server,raw){await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(raw,null,2));await prepareEditorSurface(page);}
async function exportReader(context,server,text,name,profile='default'){
  const input=path.join(server.root,name+'.json'),output=path.join(server.root,name+'.html');await writeFile(input,text);
  execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),output]);
  const reader=await context.newPage();await reader.goto(server.origin+'/'+name+'.html?layout='+profile);return reader;
}
for(const width of [1280,1800])test('chapter diagram visibility saves and restores in Standard and Explore at '+width,async({page,server,context})=>{
  await page.setViewportSize({width,height:1000});await open(page,server,fixture());
  await page.screenshot({path:'/tmp/authored-visibility-standard-visible-'+width+'.png'});
  const initial=await source(page);await change(page,false);const hidden=await source(page);
  await expect(section(page).locator('.board')).toBeHidden();await expect(section(page).locator('.pwidget').first()).toBeVisible();
  await expect(page.locator('[data-layout-flow]')).toHaveCount(0);
  await arrangeChapter(page,section(page));await section(page).getByRole('combobox',{name:'Arrangement profile',exact:true}).selectOption('confluence');await expect(section(page).locator('.board')).toBeHidden();await expect(page.locator('#src')).toHaveValue(hidden);await section(page).getByRole('combobox',{name:'Arrangement profile',exact:true}).selectOption('default');await section(page).getByRole('button',{name:'Done arranging',exact:true}).click();
  await chapterOptions(page,section(page));await expect(checkbox(page)).not.toBeChecked();await page.screenshot({path:'/tmp/authored-visibility-standard-hidden-'+width+'.png'});await page.keyboard.press('Escape');
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(initial);await expect(section(page).locator('.board')).toBeVisible();
  await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(hidden);await expect(section(page).locator('.board')).toBeHidden();
  await page.getByRole('tab',{name:'Second tab',exact:true}).click();await expect(page.locator('#docview .doc-sec[data-dv-section="1"] .board')).toBeVisible();
  await page.getByRole('tab',{name:'First tab',exact:true}).click();await expect(section(page).locator('.board')).toBeHidden();await expect(page.locator('#src')).toHaveValue(hidden);
  await page.locator('#docview>.explore-navigation').getByRole('button',{name:'Service flow',exact:true}).click();await expect(section(page).locator('.boardcanvas>svg')).toBeVisible();
  await change(page,false);const exploreHidden=await source(page);
  await expect(section(page).locator('.boardcanvas>svg')).toBeHidden();await expect(section(page).locator('.explore-canvas-objects [data-explore-panel="outcome"]')).toBeVisible();await expect(section(page).locator('.explore-player')).toBeVisible();
  await chapterOptions(page,section(page));await expect(checkbox(page)).not.toBeChecked();await page.screenshot({path:'/tmp/authored-visibility-explore-hidden-'+width+'.png'});await page.keyboard.press('Escape');
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(hidden);await expect(section(page).locator('.boardcanvas>svg')).toBeVisible();
  await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(exploreHidden);await expect(section(page).locator('.boardcanvas>svg')).toBeHidden();
  await change(page,true);await expect(section(page).locator('.boardcanvas>svg')).toBeVisible();await page.screenshot({path:'/tmp/authored-visibility-explore-visible-'+width+'.png'});
  for(const profile of ['default','backstage','confluence']){
    const reader=await exportReader(context,server,exploreHidden,'visibility-'+width+'-'+profile,profile);
    const sec=reader.locator('.doc-sec[data-dv-section="0"]');await expect(sec.locator('.board')).toBeHidden();await expect(reader.locator('[data-layout-flow]')).toHaveCount(0);
    await reader.locator('.explore-navigation').getByRole('button',{name:'Service flow',exact:true}).click();await expect(sec.locator('.boardcanvas>svg')).toBeHidden();await expect(sec.locator('.explore-canvas-objects [data-explore-panel="outcome"]')).toBeVisible();await expect(sec.locator('.explore-player')).toBeVisible();
    await reader.locator('.explore-navigation').getByRole('button',{name:'Home story',exact:true}).click();await expect(sec.locator('.board')).toBeHidden();await reader.close();
  }
});
for(const savedLayout of [false,true])test('legacy '+(savedLayout?'saved':'automatic')+' chapters gain undoable visibility without a reader reveal override',async({page,server})=>{
  const d=structuredClone(seed.page.sections[0].diagram);delete d.layouts;delete d.defaultLayout;
  if(savedLayout)d.sectionLayout=structuredClone(seed.page.sections[0].diagram.layouts[0].sectionLayout);
  d.autoplay=false;const raw={page:{sections:[{heading:'Legacy story',diagram:d}]}};
  await open(page,server,raw);const initial=await source(page);
  await page.locator('#docview>.explore-navigation').getByRole('button',{name:'Data flow',exact:true}).click();await change(page,false);const hidden=await source(page),saved=JSON.parse(hidden).page.sections[0].diagram;
  expect(saved.layouts.map(v=>v.id)).toEqual([savedLayout?'layout':'home','flow']);expect(saved.layouts[1].sectionLayout.default.find(it=>!it.panel&&!it.controls).hidden).toBe(true);
  await expect(section(page).locator('.board')).toBeHidden();await expect(page.locator('#docview>.explore-navigation').getByRole('button',{name:'Data flow',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(initial);await expect(section(page).locator('.board')).toBeVisible();
  await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(hidden);await expect(section(page).locator('.board')).toBeHidden();
  await change(page,true);await expect(section(page).locator('.board')).toBeVisible();
});

test('Backstage native mount honors authored diagram visibility through host navigation',async({page,server})=>{
  const raw=fixture();const d=raw.page.sections[0].tabs[0].sections[0].diagram;
  d.layouts.forEach(view=>Object.values(view.sectionLayout).filter(Array.isArray).forEach(items=>items.forEach(item=>{if(!item.panel&&!item.controls)item.hidden=true;})));
  await writeFile(path.join(server.root,'visibility-native.js'),await nativeViewerSource());
  await writeFile(path.join(server.root,'visibility-native.json'),JSON.stringify(raw));
  await writeFile(path.join(server.root,'visibility-native.html'),'<html><body><main id="native"></main><script type="module">import {mountNativeViewer} from "./visibility-native.js";const raw=await fetch("./visibility-native.json").then(r=>r.json());window.native=mountNativeViewer(document.getElementById("native"),raw,{layoutTarget:"backstage"});</script></body></html>');
  await page.goto(server.origin+'/visibility-native.html');const root=page.locator('#native'),sec=root.locator('.doc-sec[data-dv-section="0"]');
  await expect(sec.locator('.board')).toBeHidden();await expect(root.locator('[data-layout-flow]')).toHaveCount(0);
  await page.evaluate(()=>window.native.navigate({section:'first',view:'service-flow'}));
  await expect(sec.locator('.boardcanvas>svg')).toBeHidden();await expect(sec.locator('.explore-player')).toBeVisible();await expect(sec.locator('[data-explore-panel="outcome"]')).toBeVisible();
  await page.evaluate(()=>window.native.navigate({section:'second',view:'service-flow'}));await expect(root.locator('.doc-sec[data-dv-section="1"] .boardcanvas>svg')).toBeVisible();
  await page.evaluate(()=>window.native.navigate({section:'first',view:'home-story'}));await expect(sec.locator('.board')).toBeHidden();
  await page.evaluate(()=>window.native.destroy());await expect(root.locator('.docview')).toHaveCount(0);
});
