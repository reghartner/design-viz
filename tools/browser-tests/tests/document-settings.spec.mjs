import {test,expect,openInspectorGroup,paste,prepareEditorSurface,inspectPageElement} from '../helpers/test.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {repo} from '../helpers/prepare.mjs';
const source=page=>page.locator('#src').inputValue();
async function settings(page){await page.locator('#editor-tab-inspect').click();await page.locator('#document-settings').click();}
async function edit(page,label,value){const field=page.locator('#guide').getByLabel(label,{exact:true});await field.fill(value);await field.press('Enter');}
const diagram={nodes:{a:{title:'Client'},b:{title:'Service'}},rows:[['a','b']],edges:[{from:'a',to:'b'}],steps:[{id:'one',edge:'a->b',text:'Call'}],layouts:[
  {id:'first',name:'First',sectionLayout:{default:[{x:0,y:0,w:12,h:8}]}},
  {id:'second',name:'Second',sectionLayout:{default:[{x:0,y:0,w:12,h:8}]}}
],defaultLayout:'first'};

test('saved document metadata and initial prose collapse survive Save/export, Undo, preview overrides and navigation',async({page,server,context},info)=>{
  const raw={page:{title:'Before',skin:'aurora',blocks:[{heading:'Flow',text:['This explains the flow.'],diagram}]}};
  const original=JSON.stringify(raw,null,'\t');await page.goto(server.origin+'/workbench.html');await paste(page,original);await prepareEditorSurface(page);
  const section=page.locator('#docview .doc-sec').first();await section.getByRole('button',{name:'Second',exact:true}).click();
  await settings(page);await edit(page,'Document title','Design notes');
  await expect(page.locator('#docview .doc-title')).toHaveText('Design notes');await expect(section).toHaveAttribute('data-view-id','second');
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);await expect(section).toHaveAttribute('data-view-id','second');
  await page.locator('#redo-builder').click();await settings(page);
  await edit(page,'Source URL','https://example.test/design');await edit(page,'Source description','Design specification');await edit(page,'Source version','v2');await edit(page,'Source date','2026-09-29');
  await expect(page.locator('#docview .generated-from')).toHaveText('Generated from Design specification · v2 · 2026-09-29');
  await page.locator('#workspace-appearance>summary').click();await page.locator('#sk-terminal').click();
  const beforeSkin=await source(page);await page.locator('#workspace-appearance>summary').click();
  await page.locator('#guide').getByLabel('Saved default skin',{exact:true}).selectOption('daylight');
  await expect(page.locator('#docview')).toHaveClass(/sk-terminal/);expect(JSON.parse(await source(page)).page.skin).toBe('daylight');
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(beforeSkin);await page.locator('#redo-builder').click();
  await page.locator('#workspace-appearance>summary').click();await expect(page.locator('#preview-skin-status')).toHaveText('Preview: terminal · Saved default: daylight.');await page.locator('#workspace-appearance').screenshot({path:info.outputPath('preview-appearance.png')});
  const beforePreview=await source(page);await page.locator('#preview-skin-default').click();await expect(page.locator('#docview')).toHaveClass(/sk-daylight/);expect(await source(page)).toBe(beforePreview);await expect(section).toHaveAttribute('data-view-id','second');
  await page.locator('#preview-skin-settings').click();await expect(page.locator('#guide').getByLabel('Document title')).toHaveValue('Design notes');
  await inspectPageElement(page,section.locator('.sec-h'));const collapse=page.locator('#guide').getByLabel('Initially collapse prose',{exact:true});const beforeCollapse=await source(page);
  await collapse.check();await expect(section.locator('.prosetoggle')).toHaveAttribute('aria-expanded','false');
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(beforeCollapse);await expect(section.locator('.prosetoggle')).toHaveAttribute('aria-expanded','true');await page.locator('#redo-builder').click();
  const download=page.waitForEvent('download');await page.locator('#file-save').click();const saved=await readFile(await (await download).path(),'utf8');
  const savedPage=JSON.parse(saved).page;expect(savedPage.title).toBe('Design notes');expect(savedPage.skin).toBe('daylight');expect(savedPage.blocks[0].collapsed).toBe(true);expect(savedPage.generatedFrom).toEqual({url:'https://example.test/design',label:'Design specification',version:'v2',at:'2026-09-29'});
  const input=path.join(server.root,'document-settings.spec.json'),output=path.join(server.root,'document-settings.html');await writeFile(input,saved);execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),output]);
  const reader=await context.newPage();await reader.goto(server.origin+'/document-settings.html');await expect(reader.locator('.doc-title')).toHaveText('Design notes');await expect(reader.locator('.docview')).toHaveClass(/sk-daylight/);await expect(reader.locator('.prosetoggle')).toHaveAttribute('aria-expanded','false');await reader.close();
  await settings(page);await page.screenshot({path:info.outputPath('document-settings-desktop.png')});
  const final=await source(page);await page.locator('#workspace-home').click();await page.goBack();await expect(page.locator('#src')).toHaveValue(final);
  await page.setViewportSize({width:760,height:900});await settings(page);await expect(page.locator('#guide').getByLabel('Document title')).toBeVisible();await page.screenshot({path:info.outputPath('document-settings-narrow.png')});
});

test('blank projects and bare sections pages expose saved document settings without canvas selection',async({page,server})=>{
  await page.goto(server.origin+'/workbench.html');await page.locator('#welcome-new').click();await page.getByRole('button',{name:/Blank diagram/}).click();
  await settings(page);const before=await source(page);await edit(page,'Document title','Blank document');expect(JSON.parse(await source(page)).page.title).toBe('Blank document');await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(before);
  await page.locator('#workspace-home').click();await paste(page,JSON.stringify({title:'Bare page',sections:[{heading:'One',diagram:{nodes:{},rows:[[]]}}]}));await settings(page);await edit(page,'Document title','Bare page edited');expect(JSON.parse(await source(page)).title).toBe('Bare page edited');expect(JSON.parse(await source(page)).page).toBeUndefined();
});

test('bare diagram wrapper is explicit, preserves the diagram, and has one Undo',async({page,server})=>{
  const bare=JSON.stringify(diagram);await page.goto(server.origin+'/workbench.html');await paste(page,bare);await settings(page);await page.locator('#guide').getByRole('button',{name:'Add document settings',exact:true}).click();
  expect(JSON.parse(await source(page)).page.sections[0].diagram).toEqual(diagram);await expect(page.locator('#guide').getByLabel('Document title')).toBeVisible();await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(bare);
});


test('advanced reader tour validates before committing and compatibility remains read-only',async({page,server},info)=>{
  const raw={page:{title:'Advanced document',flowview:{authoredWith:'0.1.0',minVersion:'0.1.0',features:[]},sections:[{heading:'Flow',diagram}]}};
  await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(raw));await page.locator('#editor-tab-outline').click();await page.locator('#outline-document-settings').click();
  await page.locator('#guide summary').filter({hasText:'Advanced: reader tour and compatibility'}).click();
  const field=page.getByLabel('Reader tour JSON',{exact:true}),before=await source(page);
  await expect(page.locator('.document-advanced')).toContainText('Runtime 0.2.0');await expect(page.locator('.document-advanced')).toContainText('Required features: layout.named');
  await field.fill('{');await field.press('Tab');await expect(page.locator('#guide .ierr')).toContainText('not valid JSON');expect(await source(page)).toBe(before);await expect(field).toHaveValue('{');
  await field.fill('{"version":2,"steps":[]}');await field.press('Tab');await expect(page.locator('#guide .ierr')).toContainText('unknown version');expect(await source(page)).toBe(before);
  const tour={version:1,steps:[{id:'end',kind:'done',copy:{heading:'Done',body:'That is the story.'}}]};await field.fill(JSON.stringify(tour));await field.press('Tab');
  await expect.poll(async()=>JSON.parse(await source(page)).page.tour).toEqual(tour);expect(JSON.parse(await source(page)).page.flowview).toEqual(raw.page.flowview);await page.locator('#guide').screenshot({path:info.outputPath('document-advanced.png')});
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(before);await page.locator('#redo-builder').click();await settings(page);await openInspectorGroup(page.locator('#guide .document-advanced'));await expect(field).toBeVisible();await field.fill('');await field.press('Tab');await expect.poll(async()=>JSON.parse(await source(page)).page.tour).toBeUndefined();
});
