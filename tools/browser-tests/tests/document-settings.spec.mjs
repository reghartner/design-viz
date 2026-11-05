import {test,expect,openInspectorGroup,paste,prepareEditorSurface,inspectPageElement} from '../helpers/test.mjs';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {projectFiles,useProjectDownloads} from '../helpers/project-export.mjs';
const source=page=>page.locator('#src').inputValue();
async function settings(page){await page.locator('#editor-tab-inspect').click();await page.locator('#document-settings').click();}
async function edit(page,label,value){const field=page.locator('#guide').getByLabel(label,{exact:true});await field.fill(value);await field.press('Enter');}
const diagram={nodes:{a:{title:'Client'},b:{title:'Service'}},rows:[['a','b']],edges:[{from:'a',to:'b'}],steps:[{id:'one',edge:'a->b',text:'Call'}],layouts:[
  {id:'first',name:'First',sectionLayout:{default:[{x:0,y:0,w:12,h:8}]}},
  {id:'second',name:'Second',sectionLayout:{default:[{x:0,y:0,w:12,h:8}]}}
],defaultLayout:'first'};

test('saved document metadata and initial prose collapse survive project export, Undo, preview overrides and navigation',async({page,server,context},info)=>{
  await useProjectDownloads({page});
  const raw={page:{title:'Before',skin:'aurora',blocks:[{heading:'Flow',text:['This explains the flow.'],diagram}]}};
  const original=JSON.stringify(raw,null,'\t');await page.goto(server.origin+'/workbench.html');await paste(page,original);await prepareEditorSurface(page);
  const section=page.locator('#docview .doc-sec').first();await page.locator('#docview>.explore-navigation').getByRole('button',{name:'Second',exact:true}).click();
  await settings(page);await edit(page,'Document title','Design notes');
  await expect(page.locator('#docview .doc-title')).toHaveText('Design notes');await expect(page.locator('#workbench-editor-title')).toHaveText('Design notes');await expect(section).toHaveAttribute('data-view-id','second');
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);await expect(page.locator('#workbench-editor-title')).toHaveText('Before');await expect(section).toHaveAttribute('data-view-id','second');
  await page.locator('#redo-builder').click();await expect(page.locator('#workbench-editor-title')).toHaveText('Design notes');await settings(page);
  await edit(page,'Source URL','https://example.test/design');await edit(page,'Source description','Design specification');await edit(page,'Source version','v2');await edit(page,'Source date','2026-09-29');
  await expect(page.locator('#docview .generated-from')).toHaveText('Generated from Design specification · v2 · 2026-09-29');
  await page.locator('#workspace-appearance>summary').click();await page.locator('#sk-terminal').click();
  const beforeSkin=await source(page);await page.locator('#workspace-appearance>summary').click();
  await page.locator('#guide').getByLabel('Saved default skin',{exact:true}).selectOption('lilac');
  await expect(page.locator('#docview')).toHaveClass(/sk-terminal/);expect(JSON.parse(await source(page)).page.skin).toBe('lilac');
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(beforeSkin);await page.locator('#redo-builder').click();
  await page.locator('#workspace-appearance>summary').click();await expect(page.locator('#preview-skin-status')).toHaveText('Preview: terminal · Saved default: lilac.');await page.locator('#workspace-appearance').screenshot({path:info.outputPath('preview-appearance.png')});
  const beforePreview=await source(page);await page.locator('#preview-skin-default').click();await expect(page.locator('#docview')).toHaveClass(/sk-lilac/);expect(await source(page)).toBe(beforePreview);await expect(section).toHaveAttribute('data-view-id','second');
  await page.locator('#preview-skin-settings').click();await expect(page.locator('#guide').getByLabel('Document title')).toHaveValue('Design notes');
  await inspectPageElement(page,section.locator('.sec-h'));const collapse=page.locator('#guide').getByLabel('Initially collapse prose',{exact:true});const beforeCollapse=await source(page);
  await collapse.check();await expect(section.locator('.prosetoggle')).toHaveAttribute('aria-expanded','false');
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(beforeCollapse);await expect(section.locator('.prosetoggle')).toHaveAttribute('aria-expanded','true');await page.locator('#redo-builder').click();
  const download=page.waitForEvent('download');await page.locator('#workspace-export-trigger').click();await page.locator('#file-save').click();const bundle=await download,files=await projectFiles(bundle);
  expect(bundle.suggestedFilename()).toBe('design-notes.zip');expect(Object.keys(files).sort()).toEqual(['README.md','design-notes.html','design-notes.ledger.md','design-notes.spec.json']);
  const saved=files['design-notes.spec.json'];
  const savedPage=JSON.parse(saved).page;expect(savedPage.title).toBe('Design notes');expect(savedPage.skin).toBe('lilac');expect(savedPage.blocks[0].collapsed).toBe(true);expect(savedPage.generatedFrom).toEqual({url:'https://example.test/design',label:'Design specification',version:'v2',at:'2026-09-29'});
  await writeFile(path.join(server.root,'document-settings.html'),files['design-notes.html']);
  const reader=await context.newPage();await reader.goto(server.origin+'/document-settings.html');await expect(reader.locator('.doc-title')).toHaveText('Design notes');await expect(reader.locator('.docview')).toHaveClass(/sk-lilac/);await expect(reader.locator('.prosetoggle')).toHaveAttribute('aria-expanded','false');await reader.close();
  await settings(page);await page.screenshot({path:info.outputPath('document-settings-desktop.png')});
  const final=await source(page);await page.locator('#workspace-home').click();await page.goBack();await expect(page.locator('#src')).toHaveValue(final);
  await page.setViewportSize({width:1280,height:900});await settings(page);await expect(page.locator('#guide').getByLabel('Document title')).toBeVisible();await page.screenshot({path:info.outputPath('document-settings-compact-desktop.png')});
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

// #583 — Document settings edit description and tags; Save/Export and reopen keep them.
// row | fixture | assertion (scoped) | rejects
// 1 precondition | page without description/tags | Description and Tags fields empty; source has neither key | a fixture that already holds the values
// 2 edit description | type into Description + Enter | source page.description equals the text; Undo restores the exact original source, Redo re-applies | a field that does not commit or bypasses Undo
// 3 edit tags | "Checkout, payments-v2" into Tags | source page.tags equals ["checkout","payments-v2"] | storing one comma string or keeping uppercase
// 4 invalid tags rejected | "two words, checkout" then "checkout, checkout" | #guide .ierr names the lowercase / duplicate rule and the source is unchanged | silently committing invalid tags
// 5 invalid description rejected | 201 characters | #guide .ierr names the 200-character limit; source unchanged | committing an over-long description
// 6 save/export | Save in Export | exported *.spec.json page.description and page.tags equal the edited values | export dropping them
// 7 reopen | paste the exported spec into a fresh Workbench | Document settings Description and Tags fields show the saved values | a form that cannot display stored values
// 8 clear | empty both fields in the reopened editor | source page has neither key | storing "" or [] placeholders
test('#583 document settings edit description and tags; invalid values are rejected and saved values survive export and reopen',async({page,server})=>{
  await useProjectDownloads({page});
  const original=JSON.stringify({page:{title:'Checkout',blocks:[{heading:'Flow',diagram}]}},null,2);
  await page.goto(server.origin+'/workbench.html');await paste(page,original);await prepareEditorSurface(page);await settings(page);
  const field=label=>page.locator('#guide').getByLabel(label,{exact:true});
  await expect(field('Description')).toHaveValue('');await expect(field('Tags')).toHaveValue('');
  expect(Object.keys(JSON.parse(await source(page)).page)).toEqual(['title','blocks']);
  await edit(page,'Description','Explains the checkout flow');
  await expect.poll(async()=>JSON.parse(await source(page)).page.description).toBe('Explains the checkout flow');
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);
  await page.locator('#redo-builder').click();await expect.poll(async()=>JSON.parse(await source(page)).page.description).toBe('Explains the checkout flow');
  await settings(page);await edit(page,'Tags','Checkout, payments-v2');
  await expect.poll(async()=>JSON.parse(await source(page)).page.tags).toEqual(['checkout','payments-v2']);
  const valid=await source(page);
  await edit(page,'Tags','two words, checkout');await expect(page.locator('#guide .ierr')).toContainText('lowercase');expect(await source(page)).toBe(valid);
  await edit(page,'Tags','checkout, checkout');await expect(page.locator('#guide .ierr')).toContainText('duplicate');expect(await source(page)).toBe(valid);
  await edit(page,'Description','x'.repeat(201));await expect(page.locator('#guide .ierr')).toContainText('200 characters');expect(await source(page)).toBe(valid);
  const download=page.waitForEvent('download');await page.locator('#workspace-export-trigger').click();await page.locator('#file-save').click();
  const files=await projectFiles(await download),saved=Object.entries(files).find(([name])=>name.endsWith('.spec.json'))[1];
  const savedPage=JSON.parse(saved).page;expect(savedPage.description).toBe('Explains the checkout flow');expect(savedPage.tags).toEqual(['checkout','payments-v2']);
  const reopened=await page.context().newPage();await reopened.goto(server.origin+'/workbench.html');await paste(reopened,saved);await prepareEditorSurface(reopened);await settings(reopened);
  await expect(reopened.locator('#guide').getByLabel('Description',{exact:true})).toHaveValue('Explains the checkout flow');
  await expect(reopened.locator('#guide').getByLabel('Tags',{exact:true})).toHaveValue('checkout, payments-v2');
  await edit(reopened,'Tags','');await expect.poll(async()=>Object.hasOwn(JSON.parse(await source(reopened)).page,'tags')).toBe(false);
  await settings(reopened);await edit(reopened,'Description','');await expect.poll(async()=>Object.hasOwn(JSON.parse(await source(reopened)).page,'description')).toBe(false);
  await reopened.close();
});

// #964: both titles use their existing planners and Inspect empty-value rules.
// Exact-source comparisons also protect non-title metadata and neighboring fields.
for(const kind of ['document','section'])test('inline '+kind+' title saves through its settings planner: Escape, Enter, click outside, empty parity, one Undo',async({page,server})=>{
 await page.setViewportSize({width:1440,height:900});await page.goto(server.origin+'/workbench.html');
 const raw={page:{title:'Original document',skin:'aurora',blocks:[{heading:'Original section',text:['Body stays'],diagram}]}},original=JSON.stringify(raw,null,'\t');
 await paste(page,original);await prepareEditorSurface(page);
 const doc=kind==='document',title=page.locator(doc?'#workbench-editor-title':'#docview .sec-h'),src=page.locator('#src'),undo=page.locator('#undo-builder'),redo=page.locator('#redo-builder');
 const draft=page.locator('.dv-inline-editor').getByRole('textbox',{name:doc?'Document title':'Section heading',exact:true}),label=doc?'Document title':'heading',first=doc?'Original document':'Original section';
 if(doc)await settings(page);else await inspectPageElement(page,title);
 await edit(page,label,'');await expect(src).not.toHaveValue(original);const cleared=await source(page),empty=JSON.parse(cleared);
 expect(doc?Object.hasOwn(empty.page,'title'):Object.hasOwn(empty.page.blocks[0],'heading')).toBe(false);
 await undo.click();await expect(src).toHaveValue(original);await prepareEditorSurface(page);
 const spot=await title.boundingBox();await title.dblclick();await expect(draft).toBeVisible();await expect(draft).toBeFocused();await expect(draft).toHaveValue(first);
 expect(await draft.evaluate(el=>[el.selectionStart,el.selectionEnd])).toEqual([0,first.length]);
 const box=await draft.boundingBox(),cx=spot.x+spot.width/2,cy=spot.y+spot.height/2;
 expect(box.x<=cx && cx<=box.x+box.width && box.y<=cy && cy<=box.y+box.height,'editor covers title').toBe(true);
 await draft.pressSequentially('Discarded');await draft.press('Escape');await expect(draft).toHaveCount(0);await expect(src).toHaveValue(original);await expect(title).toContainText(first);
 await title.dblclick();await expect(draft).toBeFocused();await draft.pressSequentially('  Renamed title  ');await draft.press('Enter');await expect(draft).toHaveCount(0);
 const saved=await source(page),want=structuredClone(raw);if(doc)want.page.title='Renamed title';else want.page.blocks[0].heading='Renamed title';
 expect(JSON.parse(saved)).toEqual(want);await expect(title).toContainText('Renamed title');
 if(doc)await expect(page.locator('#docview .doc-title')).toHaveText('Renamed title');
 await undo.click();await expect(src).toHaveValue(original);await expect(undo).toBeDisabled();await redo.click();await expect(src).toHaveValue(saved);
 await undo.click();await expect(src).toHaveValue(original);
 await title.dblclick();await expect(draft).toBeFocused();await draft.pressSequentially('Click-away title');
 await page.locator('#editor-tab-inspect').click();await expect(draft).toHaveCount(0);
 const clicked=structuredClone(raw);if(doc)clicked.page.title='Click-away title';else clicked.page.blocks[0].heading='Click-away title';
 expect(JSON.parse(await source(page))).toEqual(clicked);await undo.click();await expect(src).toHaveValue(original);await prepareEditorSurface(page);
 await title.dblclick();await expect(draft).toBeFocused();await draft.pressSequentially('   ');await draft.press('Enter');await expect(draft).toHaveCount(0);await expect(src).toHaveValue(cleared);
 if(doc){await expect(page.locator('#docview .doc-title')).toHaveCount(0);await expect(title).toHaveText('Untitled story');await title.dblclick();await expect(draft).toHaveCount(0);await expect(src).toHaveValue(cleared);}
 else await expect(title).toHaveCount(0);
 await undo.click();await expect(src).toHaveValue(original);await expect(title).toContainText(first);
});

test('section source and embed chips keep their actions and stay outside the title editor',async({page,server,context})=>{
 await page.addInitScript(()=>{window.__titleCopies=[];Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>window.__titleCopies.push(text)}});});
 await context.route('https://example.test/heading-source',route=>route.fulfill({contentType:'text/html',body:'<h1>Heading source</h1>'}));
 await page.goto(server.origin+'/workbench.html');
 const raw={page:{title:'Title chips',blocks:[{id:'story',heading:'Story heading',source:'https://example.test/heading-source',diagram}]}},original=JSON.stringify(raw,null,2);
 await paste(page,original);await prepareEditorSurface(page);
 const title=page.locator('#docview .sec-h'),sourceChip=title.locator('.srcchip'),draft=page.locator('.dv-inline-editor').getByRole('textbox',{name:'Section heading',exact:true});
 // Click actual heading text; its linked source remains mounted and usable beside it.
 const point=await title.evaluate(el=>{const r=document.createRange();r.selectNodeContents(el.firstChild);const b=r.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2};});
 await page.mouse.dblclick(point.x,point.y);await expect(draft).toBeFocused();await expect(draft).toHaveValue('Story heading');await expect(sourceChip).toBeVisible();
 await draft.press('Escape');await expect(draft).toHaveCount(0);
 const opened=page.waitForEvent('popup');await sourceChip.dblclick();const popup=await opened;
 await expect(popup).toHaveURL('https://example.test/heading-source');await popup.close();await expect(draft).toHaveCount(0);await expect(page.locator('#src')).toHaveValue(original);
 // The navigation owns the same embed button when the current View is active.
 const embed=page.locator('#docview .embedcopy:visible');await expect(embed).toHaveCount(1);await embed.dblclick();
 await expect.poll(()=>page.evaluate(()=>window.__titleCopies.length)).toBeGreaterThan(0);
 const copied=await page.evaluate(()=>window.__titleCopies.at(-1));expect(new URL(copied).hash).toContain('embed=story');
 await expect(draft).toHaveCount(0);await expect(page.locator('#src')).toHaveValue(original);
});

test('external document-title editor drops stale source and retires its listener on builder teardown',async({page,server})=>{
 await page.goto(server.origin+'/lifetime/index.html');
 const original=JSON.stringify({page:{title:'External title',blocks:[{heading:'Flow',diagram}]}},null,2);
 await paste(page,original);await prepareEditorSurface(page);
 const title=page.locator('#workbench-editor-title'),draft=page.locator('.dv-inline-editor').getByRole('textbox',{name:'Document title',exact:true}),src=page.locator('#src');
 await title.dblclick();await expect(draft).toBeFocused();await draft.pressSequentially('Stale draft');const stale=await draft.elementHandle();
 const changed=original.replace('External title','Replacement title');
 await page.evaluate(text=>{const src=document.querySelector('#src');src.value=text;src.dispatchEvent(new Event('input',{bubbles:true}));},changed);
 await expect(draft).toHaveCount(0);await expect(title).toBeVisible();await expect(page.locator('.dv-inline-html-mount')).toHaveCount(0);
 await stale.evaluate(el=>el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})));await expect(src).toHaveValue(changed);
 await page.evaluate(text=>__editorTest.builder.loadText(text),changed);await title.dblclick();await expect(draft).toHaveValue('Replacement title');
 await page.evaluate(()=>__editorTest.builder.destroy());await expect(draft).toHaveCount(0);await expect(title).toBeVisible();
 await title.dblclick();await expect(draft).toHaveCount(0);await expect(src).toHaveValue(changed);
 await page.evaluate(()=>__editorTest.remount());await title.dblclick();await expect(draft).toBeFocused();await draft.pressSequentially('Remounted title');await draft.press('Enter');
 await expect(title).toHaveText('Remounted title');await page.locator('#undo-builder').click();await expect(src).toHaveValue(changed);
});
