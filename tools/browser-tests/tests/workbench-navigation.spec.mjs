import {chooseNavigation} from '../helpers/test.mjs';
import {test,expect,paste,closeTools,chapterOptions,chooseAddDestination,arrangeChapter} from '../helpers/test.mjs';
import {editorSpec} from '../fixtures/editor-spec.mjs';
import {writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {repo} from '../helpers/prepare.mjs';
function fixture(){
 const raw=editorSpec(),first=raw.page.blocks[0];raw.page.title='Sections and Views · Product journey';first.id='primary';first.text='The notes belong to this chapter.';
 const d=first.diagram;delete d.layouts[0].steps;d.layouts[0].presentation='explore';d.layouts[0].name='Engineering';
 d.layouts.push({...structuredClone(d.layouts[0]),id:'standard',name:'Overview',presentation:'standard'});
 const other=structuredClone(first);other.id='secondary';other.heading='Second diagram';
 raw.page.blocks=[{tabs:[{label:'Main story',defaultView:'engineering',views:[{id:'engineering',name:'Engineering',presentation:'explore',sections:[{section:'primary',layout:d.layouts[0].id},{section:'secondary',layout:d.layouts[0].id}]},{id:'overview',name:'Overview',presentation:'standard',sections:[{section:'primary',layout:'standard'},{section:'secondary',layout:'standard'}]}],sections:[first,other]},{label:'Notes',sections:[{id:'notes',heading:'Notes only',text:'A prose destination.'}]}]}];return raw;
}
async function open(page,server){const source=JSON.stringify(fixture(),null,2);await page.goto(server.origin+'/workbench.html');await paste(page,source);await closeTools(page);return source;}
const nav=page=>page.locator('#docview .explore-navigation');
const selected=page=>page.locator('#docview .workspace-active-section');
async function camera(page){return selected(page).locator('.explore-board').evaluate(el=>({x:el.scrollLeft,y:el.scrollTop,width:el.style.getPropertyValue('--explore-width')}));}

test('editor shares the Contents, Views and Page shell without covering its authoring tools',async({page,server},info)=>{
 const source=await open(page,server);
 await expect(page.getByRole('button',{name:'Back to page',exact:true})).toHaveCount(0);
 await expect(nav(page)).toHaveCount(1);await expect(nav(page).locator('.reader-contents')).toBeVisible();
 await expect(nav(page).locator('.explore-navigation-diagrams')).toBeHidden();
 await expect(nav(page).getByRole('tab',{name:'Engineering',exact:true})).toHaveAttribute('aria-selected','true');
 await expect(page.locator('#workbench-editor-title')).toHaveText(fixture().page.title);await expect(page.locator('#workbench-editor-title')).toHaveAttribute('title',fixture().page.title);
 await expect(nav(page).locator('.embedcopy')).toHaveCount(1);
 const contentsToggle=nav(page).locator('.reader-top>button');await contentsToggle.click();await expect(nav(page).locator('.reader-contents')).toBeHidden();
 await page.locator('#editor-tab-inspect').click();await page.locator('#document-settings').click();const title=page.locator('#guide').getByLabel('Document title',{exact:true});await title.fill('Edited Product journey');await title.press('Enter');
 await expect(page.locator('#workbench-editor-title')).toHaveText('Edited Product journey');await expect(nav(page).locator('.reader-contents')).toBeHidden();await expect(page.locator('.workspace-rail')).toHaveCSS('left','56px');
 await page.locator('#undo-builder').click();await expect(page.locator('#workbench-editor-title')).toHaveText(fixture().page.title);await expect(nav(page).locator('.reader-contents')).toBeHidden();await page.locator('#redo-builder').click();await expect(page.locator('#workbench-editor-title')).toHaveText('Edited Product journey');await expect(nav(page).locator('.reader-contents')).toBeHidden();await page.locator('#undo-builder').click();await closeTools(page);await contentsToggle.click();await expect(nav(page).locator('.reader-contents')).toBeVisible();
 // Workbench authoring is desktop-only; exercise wide and compact desktop shells.
 for(const width of [1440,1024]){
  await page.setViewportSize({width,height:1000});
  await expect.poll(()=>page.locator('.workbench-header').evaluate(el=>el.getBoundingClientRect().height)).toBeLessThanOrEqual(54);
  await expect.poll(()=>nav(page).evaluate(el=>{const r=el.getBoundingClientRect(),header=document.querySelector('.workbench-header').getBoundingClientRect();return Math.abs(r.top-header.bottom);})).toBeLessThanOrEqual(1);
  const geometry=await nav(page).evaluate(el=>{const r=el.getBoundingClientRect(),stage=document.querySelector('.workspace-active-section .explore-stage').getBoundingClientRect(),player=document.querySelector('.workspace-active-section .explore-player').getBoundingClientRect(),tools=document.querySelector('.workspace-canvas-controls').getBoundingClientRect(),rail=document.querySelector('.workspace-rail').getBoundingClientRect(),side=el.querySelector('.reader-contents').getBoundingClientRect(),pager=el.querySelector('.reader-page-index').getBoundingClientRect();return {bottom:r.bottom,stageTop:stage.top,player:{left:player.left,top:player.top,right:player.right,bottom:player.bottom},tools:{left:tools.left,top:tools.top,right:tools.right,bottom:tools.bottom},railLeft:rail.left,sideRight:side.right,sideVisible:!!side.width,pageCenter:(pager.left+pager.right)/2};});
  expect(geometry.stageTop).toBeGreaterThanOrEqual(geometry.bottom);
  expect(Math.abs(geometry.pageCenter-width/2)).toBeLessThanOrEqual(2);
  expect(geometry.sideVisible).toBe(true);expect(geometry.railLeft).toBeGreaterThanOrEqual(geometry.sideRight+11);
  expect(geometry.player.right).toBeLessThanOrEqual(width);expect(Math.min(geometry.player.right,geometry.tools.right)-Math.max(geometry.player.left,geometry.tools.left)>1&&Math.min(geometry.player.bottom,geometry.tools.bottom)-Math.max(geometry.player.top,geometry.tools.top)>1).toBe(false);
  const pan=page.locator('#workspace-pan');await pan.click();await expect(pan).toHaveAttribute('aria-pressed','true');await pan.click();await expect(pan).toHaveAttribute('aria-pressed','false');
  for(const selector of ['.step-transport','.schips','.stepline']){const content=selected(page).locator('.explore-player '+selector);await expect(content).toBeInViewport();const r=await content.boundingBox(),dock=await selected(page).locator('.explore-player').boundingBox();expect(r.x).toBeGreaterThanOrEqual(dock.x);expect(r.x+r.width).toBeLessThanOrEqual(dock.x+dock.width+1);expect(r.y+r.height).toBeLessThanOrEqual(dock.y+dock.height+1);}
  await info.attach('navigation-'+width,{body:await page.screenshot(),contentType:'image/png'});
 }
 await chooseNavigation(nav(page),'View','Overview');
 await expect(page.locator('body')).not.toHaveClass(/workspace-diagram/);await expect(nav(page)).toHaveCount(1);
 await expect(nav(page).getByRole('tab',{name:'Overview',exact:true})).toHaveAttribute('aria-selected','true');await expect(page.locator('#docview>.doc-heading')).toBeHidden();
 await expect(page.locator('#section-primary')).toBeVisible();await expect(page.locator('#section-secondary')).toBeHidden();
 const overviewSections=nav(page).locator('.reader-tree-sections[data-reader-view="overview"]');await expect(overviewSections.getByRole('button')).toHaveText(['Delivery','Second diagram']);
 const overviewSecond=overviewSections.getByRole('button',{name:'Second diagram',exact:true});await overviewSecond.focus();await page.keyboard.press('Enter');await expect(overviewSecond).toBeFocused();await expect(overviewSecond).toHaveAttribute('aria-current','page');await expect(nav(page).locator('.reader-page-label')).toHaveText('Page 4 of 5');await expect(page.locator('#section-primary')).toBeHidden();await expect(page.locator('#section-secondary')).toBeVisible();await info.attach('standard-section-headlines',{body:await page.screenshot(),contentType:'image/png'});
 await overviewSections.getByRole('button',{name:'Delivery',exact:true}).click();await expect(nav(page).locator('.reader-page-label')).toHaveText('Page 3 of 5');await expect(page.locator('#section-secondary')).toBeHidden();await expect(page.locator('#section-primary .playback-mode-rail')).toBeVisible();await page.locator('#section-primary .playback-mode-rail').getByRole('button',{name:'Ambient',exact:true}).click();await expect(page.locator('#section-primary .termbar')).toBeHidden();await page.locator('#section-primary .playback-mode-rail').getByRole('button',{name:'Step',exact:true}).click();await expect(page.locator('#section-primary .termbar')).toBeVisible();
 await page.setViewportSize({width:1024,height:1000});await chooseNavigation(nav(page),'View','Engineering');
 if(!await nav(page).locator('.reader-contents').isVisible())await nav(page).locator('.reader-top>button').click();
 await nav(page).locator('.reader-tree-sections[data-reader-view="engineering"]').getByRole('button',{name:'Second diagram',exact:true}).click();await expect(page.locator('body')).toHaveClass(/workspace-diagram/);await expect(selected(page)).toHaveAttribute('id','section-secondary');
 if(!await nav(page).locator('.reader-contents').isVisible())await nav(page).locator('.reader-top>button').click();
 await nav(page).locator('.reader-tree-sections[data-reader-view="engineering"]').getByRole('button',{name:'Delivery',exact:true}).click();await expect(selected(page)).toHaveAttribute('id','section-primary');
 // Desktop titles may ellipsize; their full accessible title and project actions remain available.
 await expect(page.locator('#workbench-editor-title')).toHaveAttribute('title',fixture().page.title);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(1024);
 const add=page.locator('#diagram-add');await expect(add).toHaveAttribute('aria-label','Add to diagram');await expect(add).toBeInViewport();expect(await add.evaluate(el=>{const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return r.width>=36&&r.height>=34&&el.contains(hit);})).toBe(true);
 const more=page.locator('#workspace-more>summary');await expect(more).toHaveAttribute('aria-label','More project actions');await more.focus();await page.keyboard.press('Enter');await expect(page.locator('#workspace-file')).toBeVisible();await expect(page.locator('#undo-builder')).toBeVisible();await expect(page.locator('#workspace-export-trigger')).toBeVisible();
 await page.locator('#workspace-export-trigger').click();await expect(page.locator('#file-save')).toBeVisible();await expect(page.locator('#workspace-more')).toHaveAttribute('open','');
 await expect(page.locator('#src')).toHaveValue(source);
});

/* #559 — Appearance menu and a direct Preview action (desktop editor only).
 row | fixture | assertion (scoped) | rejects
 1 Preview is one click | editor at 1440, no header menu open (asserted) | #open-page-preview is visible in .workbench-header, outside #workspace-appearance, its own visible text is exactly Preview and its accessible name Open page preview; one real click opens #page-preview | Preview still nested inside the skin menu (two clicks), or a direct button still labelled Open page preview
 1b Preview looks like its header neighbours | same | #open-page-preview computed font-family, font-size, font-weight, color, background-color and border widths equal those of .workspace-help>summary in the same header | Preview left in the small monospace bordered .bbtn style
 2 skin menu is clearly named | same | #workspace-appearance>summary text is exactly Appearance (not Preview) | menu left labelled Preview
 3 Appearance keeps every skin setting, no preview action | Appearance opened by a real click | inside #workspace-appearance-body: each of the seven #skinbtns buttons, #preview-skin-status, Use document default, Edit saved default…, Preview host select and Preview width spinbutton are visible; that body has 0 #open-page-preview and 0 buttons named Open page preview | duplicate Preview command left in the menu, or skin status/default/host controls dropped in the move
 4 one skin control in the editor | editor Contents sidebar visible (asserted) | #docview .explore-navigation .reader-contents contains 0 .reader-theme-footer/.reader-theme-menu | second bottom-left Theme picker left in the editor
 5 Appearance choice applies to the canvas only | Terminal not pressed and #docview not sk-terminal (asserted) | click #sk-terminal: its aria-pressed=true, #docview gets sk-terminal, #src unchanged | inert skin buttons, or skin written into the JSON
 6 readers keep their theme picker (#554 ruling) | page preview opened from row 1 | #page-preview-view .reader-contents .reader-theme-menu>summary is visible with data-current-skin=terminal; choosing Lavender there gives #page-preview-view sk-lavender | removing the picker from the shared viewer Contents, or rendering it unusable
 7 exported viewer keeps its theme picker (#554 ruling) | same fixture injected into template/flowview.html | #docview .reader-contents .reader-theme-menu>summary visible and choosing Rose there gives #docview sk-rose | removing the reader picker everywhere instead of only in the editor
 8 user guide updated | Help → User guide | inside #hg-workspace: a <b> reading exactly Appearance, the sentence naming Appearance as the editor's one skin control, the sentence saying Preview opens in one click; 0 <b> containing Open page preview | stale guide wording
*/
test('Preview opens the page preview in one click and Appearance is the only editor skin control',async({page,server})=>{
 await page.setViewportSize({width:1440,height:900});const source=await open(page,server);
 const header=page.locator('.workbench-header'),appearance=page.locator('#workspace-appearance'),body=page.locator('#workspace-appearance-body'),preview=header.locator('#open-page-preview');
 expect(await appearance.evaluate(el=>el.open)).toBe(false);expect(await page.locator('#workspace-more').evaluate(el=>el.open)).toBe(true);
 await expect(appearance.locator(':scope>summary')).toHaveText('Appearance');
 await expect(preview).toBeVisible();await expect(preview).toHaveText('Preview');await expect(preview).toHaveAccessibleName('Open page preview');
 const look=el=>{const c=getComputedStyle(el);return {font:c.fontFamily,size:c.fontSize,weight:c.fontWeight,color:c.color,background:c.backgroundColor,border:[c.borderTopWidth,c.borderRightWidth,c.borderBottomWidth,c.borderLeftWidth].join(' ')};};
 expect(await preview.evaluate(look)).toEqual(await header.locator('.workspace-help>summary').evaluate(look));expect(await preview.evaluate(el=>!!el.closest('#workspace-appearance'))).toBe(false);
 await expect(nav(page).locator('.reader-contents')).toBeVisible();await expect(nav(page).locator('.reader-contents .reader-theme-footer, .reader-contents .reader-theme-menu')).toHaveCount(0);
 await appearance.locator(':scope>summary').click();await expect(body).toBeVisible();
 for(const skin of ['aurora','pastel','blueprint','terminal','rose','lavender','lilac'])await expect(body.locator('#skinbtns #sk-'+skin)).toBeVisible();
 for(const control of [body.locator('#preview-skin-status'),body.getByRole('button',{name:'Use document default',exact:true}),body.getByRole('button',{name:'Edit saved default…',exact:true}),body.getByRole('combobox',{name:'Preview host',exact:true}),body.getByRole('spinbutton',{name:'Preview width in pixels',exact:true})])await expect(control).toBeVisible();
 await expect(body.locator('#open-page-preview')).toHaveCount(0);await expect(body.getByRole('button',{name:'Open page preview'})).toHaveCount(0);
 const terminal=body.locator('#sk-terminal');await expect(terminal).toHaveAttribute('aria-pressed','false');await expect(page.locator('#docview')).not.toHaveClass(/sk-terminal/);
 await terminal.click();await expect(terminal).toHaveAttribute('aria-pressed','true');await expect(page.locator('#docview')).toHaveClass(/sk-terminal/);await expect(page.locator('#src')).toHaveValue(source);
 await appearance.locator(':scope>summary').click();await expect(body).toBeHidden();
 await expect(page.locator('#page-preview')).toBeHidden();await preview.click();await expect(page.locator('#page-preview')).toBeVisible();
 const previewNav=page.locator('#page-preview-view .explore-navigation').first();if(!await previewNav.locator('.reader-contents').isVisible())await previewNav.locator('.reader-top>button').click();
 const previewTheme=previewNav.locator('.reader-contents .reader-theme-menu>summary');await expect(previewTheme).toBeVisible();await expect(previewTheme).toHaveAttribute('data-current-skin','terminal');
 await expect(page.locator('#page-preview-view')).not.toHaveClass(/sk-lavender/);await previewTheme.click();await previewNav.getByRole('menuitemradio',{name:'Lavender',exact:true}).click();await expect(page.locator('#page-preview-view')).toHaveClass(/sk-lavender/);

 await page.locator('#close-page-preview').click();await expect(page.locator('#page-preview')).toBeHidden();
 await page.locator('.workspace-help>summary').click();await page.locator('.workspace-help [data-open-human-guide]').click();
 const guide=page.locator('#hg-workspace');await expect(guide.locator('b',{hasText:/^Appearance$/}).first()).toBeVisible();await expect(guide.locator('b',{hasText:'Open page preview'})).toHaveCount(0);
 await expect(guide).toContainText("Appearance is the editor's one skin control");await expect(guide).toContainText('Preview opens the last usable document in one click');
 await page.keyboard.press('Escape');
 const input=path.join(server.root,'appearance-559.json'),output=path.join(server.root,'appearance-559.html');await writeFile(input,source);execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),output]);
 await page.goto(server.origin+'/appearance-559.html');const reader=page.locator('#docview .explore-navigation');if(!await reader.locator('.reader-contents').isVisible())await reader.locator('.reader-top>button').click();
 const theme=reader.locator('.reader-contents .reader-theme-menu>summary');await expect(theme).toBeVisible();await expect(page.locator('#docview')).not.toHaveClass(/sk-rose/);await theme.click();await reader.getByRole('menuitemradio',{name:'Rose',exact:true}).click();await expect(page.locator('#docview')).toHaveClass(/sk-rose/);
});

/* #560 — insert-target badge, save-status badge and Home tooltip (desktop editor only).
 row | fixture | assertion (scoped) | rejects
 1 badge wording | editor at 1440, Overview (Standard) View chosen through Contents, where sections show their insert frame; insert target starts on #section-primary (asserted) | #section-primary.dv-inserttarget has exactly one child .dv-inserttarget-tag whose own text is exactly Adding here; the section's ::before content is none/normal | old "insert target" corner text kept, or both labels shown
 2 badge tooltip is reachable | same | the tag is visible, its title names Add and says how to change the section; a real hover reaches it (document.elementFromPoint at the tag's centre is the tag) | tooltip on an element with pointer-events:none, or no title
 3 badge follows the target | Add → destination picker chooses section 2 (real select) | the tag moves to #section-secondary; #docview holds exactly one .dv-inserttarget-tag | stale or duplicated tags left behind
 4 save status is a status badge, not a button | same editor | #workspace-provenance keeps role=status, is not a button/link, has text Browser only, computed cursor is default, it has a non-transparent background and a pill radius (≥ half its height), and a visible round status dot (its ::before is 4–10px square, round, with a non-transparent fill); its background colour and its border radius each differ from both the File .bbtn and the Preview header button | plain text that reads as a header action, a button-styled pill, or a dot that is not drawn
 5 Home has a tooltip that is true | same editor | #workspace-home title names Home and says the draft stays available; a real click on Home shows the welcome screen with #welcome-resume visible, and clicking it returns to the editor with #src unchanged | no tooltip, or a tooltip promising a draft that Home loses
 6 user guide | Help → User guide | #hg-workspace has <b> Adding here and a <b> Browser only, and the sentences explaining the badge and that Home keeps the draft | stale guide
*/
test('#560 insert target says Adding here, save status is a badge and Home explains the kept draft',async({page,server})=>{
 await page.setViewportSize({width:1440,height:900});const source=await open(page,server);await chooseNavigation(nav(page),'View','Overview');
 const view=page.locator('#docview'),primary=view.locator('#section-primary'),secondary=view.locator('#section-secondary');
 await expect(primary).toHaveClass(/\bdv-inserttarget\b/);await expect(secondary).not.toHaveClass(/\bdv-inserttarget\b/);
 const tag=primary.locator(':scope>.dv-inserttarget-tag');await expect(tag).toHaveCount(1);await expect(tag).toBeVisible();await expect(tag).toHaveText('Adding here');
 expect(await primary.evaluate(el=>getComputedStyle(el,'::before').content)).toMatch(/^(none|normal)$/);
 await expect(tag).toHaveAttribute('title',/Add/);await expect(tag).toHaveAttribute('title',/another section/);
 await tag.hover();expect(await tag.evaluate(el=>{const r=el.getBoundingClientRect();return document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)===el;})).toBe(true);
 await page.locator('#diagram-add').click();await page.locator('.diagram-add-destination-picker summary').click();await page.locator('#diagram-add-target').selectOption('1');await page.keyboard.press('Escape');
 await expect(secondary).toHaveClass(/\bdv-inserttarget\b/);await expect(secondary.locator(':scope>.dv-inserttarget-tag')).toHaveText('Adding here');await expect(view.locator('.dv-inserttarget-tag')).toHaveCount(1);await expect(page.locator('#src')).toHaveValue(source);

 const status=page.locator('.workbench-header #workspace-provenance');await expect(status).toBeVisible();await expect(status).toHaveText('Browser only');await expect(status).toHaveAttribute('role','status');
 expect(await status.evaluate(el=>el.tagName)).toBe('SPAN');expect(await status.evaluate(el=>!!el.closest('button,a,summary'))).toBe(false);
 const look=el=>{const c=getComputedStyle(el),b=getComputedStyle(el,'::before');return {cursor:c.cursor,background:c.backgroundColor,radius:parseFloat(c.borderTopLeftRadius),height:el.getBoundingClientRect().height,dot:{content:b.content,display:b.display,width:parseFloat(b.width),height:parseFloat(b.height),radius:b.borderTopLeftRadius,fill:b.backgroundColor}};};
 const badge=await status.evaluate(look),file=await page.locator('#workspace-file').evaluate(look),previewButton=await page.locator('.workbench-header #open-page-preview').evaluate(look);
 expect(badge.cursor).toBe('default');expect(badge.background).not.toBe('rgba(0, 0, 0, 0)');expect(badge.radius).toBeGreaterThanOrEqual(badge.height/2-0.5);expect(badge.dot.content).not.toMatch(/^(none|normal)$/);expect(badge.dot.display).not.toBe('none');expect(badge.dot.width).toBeGreaterThanOrEqual(4);expect(badge.dot.width).toBeLessThanOrEqual(10);expect(badge.dot.height).toBe(badge.dot.width);expect(badge.dot.radius).toBe('50%');expect(badge.dot.fill).not.toBe('rgba(0, 0, 0, 0)');
 for(const button of [file,previewButton]){expect(badge.background).not.toBe(button.background);expect(badge.radius).not.toBe(button.radius);}

 const home=page.locator('.workbench-header #workspace-home');await expect(home).toBeVisible();await expect(home).toHaveAttribute('title',/Home/);await expect(home).toHaveAttribute('title',/draft stays/);
 await home.hover();await home.click();await expect(page.locator('#workbench-welcome')).toBeVisible();const resume=page.locator('#welcome-resume');await expect(resume).toBeVisible();
 await resume.click();await expect(page.locator('#workbench-welcome')).toBeHidden();await expect(page.locator('#src')).toHaveValue(source);

 await page.locator('.workspace-help>summary').click();await page.locator('.workspace-help [data-open-human-guide]').click();
 const guide=page.locator('#hg-workspace');await expect(guide.locator('b',{hasText:/^Adding here$/})).toHaveCount(1);await expect(guide.locator('b',{hasText:/^Browser only$/})).toHaveCount(1);
 await expect(guide).toContainText('A dotted frame tagged Adding here marks the section that Add puts new items into');await expect(guide).toContainText('Home keeps your draft');
});

/* #564 — one UI font for buttons; no Arial fallback; monospace kept for code and deliberate skins (desktop only).
 row | fixture | assertion (scoped) | rejects
 1 header toolbar and mode buttons share one family | editor at 1440 in the fixture's own skin (Pastel), no menu open except More (asserted) | named roster Home, Add, File, Undo, Redo, Appearance summary, Preview, Help summary, Export, every rail tab #editor-tab-*, Focus diagram, Fit selection is visible; that roster plus EVERY visible .workbench-header button/summary and EVERY visible .bbtn/.skbtn/.rbtn/.bexit/rail tab outside the #docview canvas: each element's own computed first family is one value, equal to body's first family and not monospace | Home/File/Undo/Redo left in IBM Plex Mono, Add left in Sora, rail tabs or any other .bbtn on a different family
 2 menu buttons share it too | same editor; Appearance, Help and Export each opened by a real click (closed before, asserted) | every visible button inside that menu body (skin buttons, Use document default, Keyboard shortcuts, User guide, Export project, SVG actions): own first family equals body's | .skbtn or menu .bbtn left in monospace
 3 editor buttons never fall back to Arial | same editor; #docview holds ≥1 .prosetoggle/.copychip (asserted) | every button/input[type=button|submit|reset] in the document (visible or hidden): own computed first family is not Arial | prose toggles, copy chips, window close/resize buttons left on the UA default
 4 code/JSON stays monospace | same editor | #src computed first family is IBM Plex Mono | a blanket rule that turns code fields sans
 5 every skin keeps the header in one family | Appearance → each of Aurora, Blueprint, Terminal, Rose, Lavender, Lilac, Pastel by real click (aria-pressed false before, true after) | per skin: the row 1 element set shares exactly one first family equal to body's; it is IBM Plex Mono for Terminal (the skin's deliberate monospace UI) and not monospace for every other skin; no button in the document computes to Arial | a skin font reaching some header buttons but not others, a fix that overrides Terminal's monospace, or Arial resurfacing under a skin
 6 exported viewer buttons never fall back to Arial | the fixture injected into template/flowview.html, ≥1 .prosetoggle/.copychip present (asserted) | every button/input button in the document: own computed first family is not Arial | viewer-only buttons left on the UA default
 7 terminal skin keeps its deliberate monospace in the viewer | that viewer, reader theme menu → Terminal by real click (#docview not sk-terminal before, sk-terminal after) | EVERY visible button in #docview (≥5 asserted) computes IBM Plex Mono as its first family | a fix that overrides the terminal skin's monospace on some viewer buttons
 8 welcome buttons never fall back to Arial | run last: welcome screen at 1440 (asserted visible; reached by a real Home click if the kept draft reopens the editor), then a real click on Build with my agent | #folder-agent-connect and every visible .welcome-text-button: own first family is not Arial and equals its parent element's first family (the panel's UI font); every button/input button in the document: not Arial | welcome-button/text-button left on the UA Arial default outside .welcome
*/
test('#564 buttons share one UI font, never fall back to Arial, and keep monospace for code and the terminal skin',async({page,server})=>{
 test.setTimeout(90_000);
 await page.setViewportSize({width:1440,height:900});
 const first=f=>f.split(',')[0].trim().replace(/^["']|["']$/g,'');
 const family=loc=>loc.evaluate(el=>getComputedStyle(el).fontFamily).then(first);
 const bodyFamily=()=>page.evaluate(()=>getComputedStyle(document.body).fontFamily).then(first);
 const arial=()=>page.evaluate(()=>[...document.querySelectorAll('button,input[type=button],input[type=submit],input[type=reset]')].map(el=>({el:(el.id?'#'+el.id:el.tagName.toLowerCase()+'.'+String(el.className).trim().split(/\s+/).join('.')),f:getComputedStyle(el).fontFamily.split(',')[0].trim().replace(/^["']|["']$/g,'')})).filter(r=>/^arial$/i.test(r.f)).map(r=>r.el));
 const visibleFamilies=(scope,selector)=>scope.evaluate((root,selector)=>{const out={};for(const el of root.querySelectorAll(selector)){if(!el.getClientRects().length||getComputedStyle(el).visibility==='hidden'||el.closest('#docview'))continue;const f=getComputedStyle(el).fontFamily.split(',')[0].trim().replace(/^["']|["']$/g,'');(out[f]??=[]).push(el.id?'#'+el.id:el.tagName.toLowerCase()+'.'+String(el.className).trim().split(/\s+/).join('.')+'|'+el.textContent.trim().slice(0,20));}return out;},selector);
 const source=await open(page,server);
 expect(await page.locator('#workspace-appearance').evaluate(el=>el.open)).toBe(false);expect(await page.locator('#workspace-more').evaluate(el=>el.open)).toBe(true);
 const header=page.locator('.workbench-header');
 const roster=[header.locator('#workspace-home'),header.locator('#diagram-add'),header.locator('#workspace-file'),header.locator('#undo-builder'),header.locator('#redo-builder'),header.locator('#workspace-appearance>summary'),header.locator('#open-page-preview'),header.locator('.workspace-help>summary'),header.locator('#workspace-export-trigger'),
  ...['agent','brief','inspect','steps','outline','json','file'].map(name=>page.locator('#editor-tab-'+name)),page.locator('#workspace-focus-diagram'),page.locator('#workspace-fit-selection')];
 const controls='.workbench-header :is(button,summary), .bbtn, .skbtn, .rbtn, .bexit, .workspace-rail [role="tab"]';
 const families=async()=>{const named=[];for(const control of roster){await expect(control).toBeVisible();named.push(await family(control));}const all=await visibleFamilies(page.locator('body'),controls);for(const f of named)(all[f]??=[]);return Object.keys(all).length===1?Object.keys(all):all;};
 const editorBody=await bodyFamily();expect(editorBody).not.toMatch(/mono/i);
 expect(await families()).toEqual([editorBody]);
 for(const [menu,body] of [['#workspace-appearance','#workspace-appearance-body'],['.workspace-help','.workspace-help-body'],['#workspace-export','.workspace-export-body']]){
  const details=header.locator(menu).first();expect(await details.evaluate(el=>el.open)).toBe(false);await details.locator(':scope>summary').click();expect(await details.evaluate(el=>el.open)).toBe(true);
  const inside=await visibleFamilies(details.locator(body).first(),'button');expect(Object.values(inside).flat().length).toBeGreaterThan(1);expect(Object.keys(inside)).toEqual([editorBody]);
  await details.locator(':scope>summary').click();expect(await details.evaluate(el=>el.open)).toBe(false);
 }
 expect(await page.locator('#docview').locator('.prosetoggle, .copychip').count()).toBeGreaterThan(0);
 expect(await arial()).toEqual([]);
 expect(await family(page.locator('#src'))).toBe('IBM Plex Mono');

 const appearance=page.locator('#workspace-appearance>summary');
 for(const skin of ['aurora','blueprint','terminal','rose','lavender','lilac','pastel']){
  await appearance.click();const button=page.locator('#workspace-appearance-body #sk-'+skin);
  await expect(button).toHaveAttribute('aria-pressed','false');await button.click();await expect(button).toHaveAttribute('aria-pressed','true');
  await appearance.click();await expect(page.locator('#workspace-appearance-body')).toBeHidden();
  const body=await bodyFamily();if(skin==='terminal')expect(body).toBe('IBM Plex Mono');else expect(body,skin).not.toMatch(/mono/i);
  expect(await families(),skin).toEqual([body]);expect(await arial(),skin).toEqual([]);
 }
 await expect(page.locator('#src')).toHaveValue(source);

 const input=path.join(server.root,'fonts-564.json'),output=path.join(server.root,'fonts-564.html');await writeFile(input,source);execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),output]);
 await page.goto(server.origin+'/fonts-564.html');await expect(page.locator('#docview .prosetoggle').first()).toBeVisible();
 expect(await page.locator('#docview').locator('.prosetoggle, .copychip').count()).toBeGreaterThan(0);
 expect(await arial()).toEqual([]);
 const reader=page.locator('#docview .explore-navigation');if(!await reader.locator('.reader-contents').isVisible())await reader.locator('.reader-top>button').click();
 await expect(page.locator('#docview')).not.toHaveClass(/sk-terminal/);await reader.locator('.reader-contents .reader-theme-menu>summary').click();await reader.getByRole('menuitemradio',{name:'Terminal',exact:true}).click();
 await expect(page.locator('#docview')).toHaveClass(/sk-terminal/);
 const viewerControls=await page.locator('#docview').evaluate(root=>{const out={};for(const el of root.querySelectorAll('button,.explore-tour-count')){if(!el.getClientRects().length)continue;const f=getComputedStyle(el).fontFamily.split(',')[0].trim().replace(/^["']|["']$/g,'');(out[f]??=[]).push(String(el.className));}return out;});
 expect(Object.values(viewerControls).flat().length).toBeGreaterThanOrEqual(5);expect(Object.keys(viewerControls)).toEqual(['IBM Plex Mono']);

 await page.goto(server.origin+'/workbench.html');const welcome=page.locator('#workbench-welcome');if(!await welcome.isVisible())await page.locator('#workspace-home').click();await expect(welcome).toBeVisible();
 await page.locator('#welcome-agent').click();const connect=page.locator('#folder-agent-connect');await expect(connect).toBeVisible();
 const textButtons=page.locator('.welcome-text-button:visible');expect(await textButtons.count()).toBeGreaterThan(0);
 for(const button of [connect,...await textButtons.all()]){const own=await family(button);expect(own).not.toMatch(/^arial$/i);expect(own).toBe(await family(button.locator('xpath=..')));}
 expect(await arial()).toEqual([]);
});

/* #607 Workbench rows (contract matrix in reader-contents.spec.mjs):
   W1 landing | this fixture with Notes given two Views (Notes pages: 2 sections, Notes brief: 1), 1440x1000, Main story current | Main story and Notes Tab rows aria-expanded=true; every View disclosure in both groups aria-expanded=true with its own member rows | expanding only the current Tab, or non-current Tabs without their Views, in the Workbench reader
   R1 restore() wins | real clicks collapse the Notes Tab and the Overview View, then a document-title edit re-renders the preview (capture -> restore) | Notes stays aria-expanded=false with 0 View rows; Overview stays collapsed with 0 rows; Main story and Engineering stay expanded | the landing default overriding the saved navigation state */
test('desktop editor Contents preserves Standard and Explore disclosure choices while switching Views',async({page,server})=>{
 await page.setViewportSize({width:1440,height:1000});
 const raw=fixture(),notes=raw.page.blocks[0].tabs[1];notes.sections.push({id:'notes-more',heading:'More notes',text:'A second prose destination.'});
 notes.views=[{id:'notes-pages',name:'Notes pages',presentation:'standard',sections:['notes','notes-more']},{id:'notes-brief',name:'Notes brief',presentation:'standard',sections:['notes-more']}];
 await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(raw,null,2));await closeTools(page);const contents=nav(page),sections=id=>contents.locator('.reader-tree-sections[data-reader-view="'+id+'"] .reader-tree-section'),disclosure=id=>contents.locator('.reader-tree-view[data-tab-view="'+id+'"]').locator('..').locator('.reader-view-disclosure');
 const group=label=>contents.locator('.reader-contents-tab').filter({has:page.locator('.reader-tree-tab').filter({hasText:label})}),tabRow=label=>group(label).locator('.reader-tree-tab');
 await expect(contents.locator('.reader-tab-label')).toHaveText('Main story');await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 await expect(tabRow('Main story')).toHaveAttribute('aria-expanded','true');await expect(tabRow('Notes')).toHaveAttribute('aria-expanded','true');await expect(group('Notes').locator('.reader-tree-view')).toHaveText(['Notes pages','Notes brief']);await expect(group('Main story').locator('.reader-tree-view')).toHaveCount(2);
 for(const [id,count] of [['engineering',2],['overview',2],['notes-pages',2],['notes-brief',1]]){await expect(disclosure(id),id).toHaveAttribute('aria-expanded','true');await expect(sections(id)).toHaveCount(count);}
 await expect(sections('engineering')).toHaveCount(2);await expect(sections('overview')).toHaveCount(2);await expect(disclosure('engineering')).toHaveAttribute('aria-expanded','true');await expect(disclosure('overview')).toHaveAttribute('aria-expanded','true');
 await disclosure('engineering').focus();await page.keyboard.press('Enter');await expect(disclosure('engineering')).toBeFocused();await expect(disclosure('engineering')).toHaveAccessibleName('Expand Engineering');await expect(sections('engineering')).toHaveCount(0);await expect(sections('overview')).toHaveCount(2);
 await chooseNavigation(contents,'View','Overview');await expect(disclosure('engineering')).toHaveAttribute('aria-expanded','false');await disclosure('overview').click();await expect(disclosure('overview')).toHaveAccessibleName('Expand Overview');await expect(sections('overview')).toHaveCount(0);
 await chooseNavigation(contents,'View','Engineering');await expect(disclosure('engineering')).toHaveAttribute('aria-expanded','false');await expect(disclosure('overview')).toHaveAttribute('aria-expanded','false');
 await disclosure('engineering').click();await disclosure('overview').click();await expect(sections('engineering')).toHaveCount(2);await expect(sections('overview')).toHaveCount(2);
 await tabRow('Notes').click();await expect(tabRow('Notes')).toHaveAttribute('aria-expanded','false');await expect(group('Notes').locator('.reader-tree-view')).toHaveCount(0);
 await disclosure('overview').click();await expect(disclosure('overview')).toHaveAttribute('aria-expanded','false');await expect(sections('overview')).toHaveCount(0);
 await page.locator('#editor-tab-inspect').click();await page.locator('#document-settings').click();const title=page.locator('#guide').getByLabel('Document title',{exact:true});await title.fill('Edited Product journey');await title.press('Enter');
 await expect(page.locator('#workbench-editor-title')).toHaveText('Edited Product journey');await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 await expect(tabRow('Notes')).toHaveAttribute('aria-expanded','false');await expect(group('Notes').locator('.reader-tree-view')).toHaveCount(0);await expect(tabRow('Main story')).toHaveAttribute('aria-expanded','true');await expect(sections('engineering')).toHaveCount(2);
 await expect(disclosure('overview')).toHaveAttribute('aria-expanded','false');await expect(sections('overview')).toHaveCount(0);
});

test('Add follows prose tabs and deliberate destination changes while stale source remains blocked',async({page,server})=>{
 const original=await open(page,server);await chooseNavigation(nav(page),'Tab','Notes');
 await page.locator('#diagram-add').click();await expect(page.locator('#add-node')).toBeDisabled();await expect(page.locator('#add-paragraph')).toBeEnabled();await expect(page.locator('#diagram-add-destination')).toContainText('Notes');
 await page.locator('.diagram-add-destination-picker summary').click();await page.locator('#diagram-add-target').selectOption('1');
 await expect(selected(page)).toHaveAttribute('id','section-secondary');
 await expect(page.locator('#add-node')).toBeEnabled();await page.locator('#add-node').click();await page.locator('#diagram-add-presets').getByRole('button',{name:'Service',exact:true}).click();
 let changed=JSON.parse(await page.locator('#src').inputValue());expect(Object.keys(changed.page.blocks[0].tabs[0].sections[1].diagram.nodes)).toHaveLength(4);expect(Object.keys(changed.page.blocks[0].tabs[0].sections[0].diagram.nodes)).toHaveLength(3);
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);
 await page.locator('#diagram-add').click();await page.locator('#src').evaluate(el=>{el.value+=' ';el.dispatchEvent(new Event('input',{bubbles:true}));});await expect(page.locator('#add-node')).toBeDisabled();await expect(page.locator('#diagram-add-error')).toContainText('changed');
 await page.locator('.diagram-add-destination-picker summary').click();await page.locator('#diagram-add-target').selectOption('0');await expect(page.locator('#add-node')).toBeDisabled();await expect(page.locator('#diagram-add-error')).toContainText('changed');
});

test('page preview is isolated and explicit camera commands author one undoable change',async({page,server})=>{
 const original=await open(page,server);await nav(page).getByRole('button',{name:/^(?:Canvas zoom|Diagram zoom|Zoom) in$/,exact:true}).click();
 await page.locator('#workspace-appearance>summary').click();await page.locator('#sk-lilac').click();await page.locator('#layout-preview-target').selectOption('backstage');await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));const before=await camera(page);await page.locator('#open-page-preview').click();
 await expect(page.locator('#page-preview-surface')).toHaveClass(/viewer-exploring/);await expect(page.locator('#page-preview-view')).toHaveClass(/sk-lilac/);await chooseNavigation(page.locator('#page-preview-view .explore-navigation'),'Tab','Notes');await page.locator('#close-page-preview').click();
 await expect(selected(page)).toHaveAttribute('id','section-primary');expect(await camera(page)).toEqual(before);await expect(page.locator('#src')).toHaveValue(original);await expect(page.locator('#undo-builder')).toBeDisabled();
 await page.locator('#workspace-appearance>summary').click();await chapterOptions(page);await nav(page).getByRole('button',{name:'Use current camera as opening view',exact:true}).click();
 const saved=await page.locator('#src').inputValue(),authored=JSON.parse(saved).page.blocks[0].tabs[0].sections[0].diagram.layouts[0].exploreLayout.camera;expect(authored.zoom).toBeGreaterThan(0);
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);await expect(page.locator('#undo-builder')).toBeDisabled();await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(saved);
 await chapterOptions(page);await nav(page).getByRole('button',{name:'Reset opening camera',exact:true}).click();expect(JSON.parse(await page.locator('#src').inputValue()).page.blocks[0].tabs[0].sections[0].diagram.layouts[0].exploreLayout.camera).toBeUndefined();await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(saved);
 await selected(page).getByRole('button',{name:'Ambient',exact:true}).click();await expect(selected(page).getByRole('button',{name:'Step',exact:true})).toBeVisible();await selected(page).getByRole('button',{name:'Step',exact:true}).click();await expect(selected(page).locator('.termbar')).toBeVisible();
});

test('long navigation labels reveal the selected chapter and detail insertion explains its source boundary',async({page,server},info)=>{
 test.slow();
 const raw=fixture(),primary=raw.page.blocks[0].tabs[0].sections[0],d=primary.diagram;
 for(let i=0;i<9;i++){d.layouts.push({...structuredClone(d.layouts[0]),id:'long-'+i,name:'View '+i+' — detailed engineering view'});raw.page.blocks[0].tabs[0].views.push({id:'long-'+i,name:'View '+i+' — detailed engineering view',presentation:'explore',sections:[{section:'primary',layout:'long-'+i},'context-notes']});}
 const detail=structuredClone(primary);detail.id='detail-source';detail.heading='Detailed source';detail.detailOnly=true;d.nodes.a.detail={section:'detail-source'};raw.page.blocks.push(detail);
 raw.page.blocks[0].tabs[0].sections.push({id:'context-notes',heading:'Architecture context without a diagram',text:'Editable prose in this tab.'});
 const source=JSON.stringify(raw,null,2);await page.goto(server.origin+'/workbench.html');await page.locator('#welcome-paste').click();await page.locator('#welcome-json').evaluate((el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));},source);await page.locator('#welcome-paste-form button[type=submit]').click();await expect(page.locator('#src')).toHaveValue(source);await closeTools(page);await page.setViewportSize({width:1024,height:1000});
 const name='View 8 — detailed engineering view';await chooseNavigation(nav(page),'View',name);const last=nav(page).getByRole('tab',{name,exact:true});await last.focus();await expect(last).toBeFocused();await expect(last).toBeInViewport({ratio:1});await expect(last).toHaveAttribute('title',name);await expect(selected(page).locator('.explore-board')).toBeVisible();
 await chapterOptions(page);const mode=nav(page).getByRole('combobox',{name:'View presentation',exact:true});await mode.focus();await page.keyboard.press('Escape');await expect(nav(page).locator('.section-view-options>summary')).toBeFocused();await expect(nav(page).locator('.section-view-options')).not.toHaveAttribute('open','');
 if(!await nav(page).locator('.reader-contents').isVisible())await nav(page).locator('.reader-top>button').click();await nav(page).locator('.reader-tree-sections[data-reader-view="long-8"]').getByRole('button',{name:'Architecture context without a diagram',exact:true}).click();await page.locator('#diagram-add').click();await expect(page.locator('#add-node')).toBeDisabled();await expect(page.locator('#add-paragraph')).toBeEnabled();await expect(page.locator('#diagram-add-destination')).toContainText('Architecture context');await page.locator('#diagram-add-close').click();
 if(!await nav(page).locator('.reader-contents').isVisible())await nav(page).locator('.reader-top>button').click();await nav(page).locator('.reader-tree-sections[data-reader-view="long-8"]').getByRole('button',{name:'Delivery',exact:true}).click();await expect(last).toHaveAttribute('aria-selected','true');await expect(last).toBeInViewport({ratio:1});await info.attach('long-chapter-desktop',{body:await page.screenshot(),contentType:'image/png'});
 await page.setViewportSize({width:1440,height:1000});await selected(page).locator('[data-dv-detail=a]').click();await page.locator('#diagram-add').click();await expect(page.locator('#diagram-add-error')).toContainText('Detail previews');await expect(page.locator('#add-node')).toBeDisabled();await expect(page.locator('#add-paragraph')).toBeDisabled();await page.locator('#diagram-add-close').click();
 await expect(page.locator('#src')).toHaveValue(source);await expect(page.locator('#undo-builder')).toBeDisabled();
});


test('arrangement profile edits render the selected host and preserve sibling profiles with exact Undo',async({page,server},info)=>{
 await page.setViewportSize({width:1440,height:1000});const raw=editorSpec(),d=raw.page.blocks[0].diagram,profiles=d.layouts[0].sectionLayout;
 profiles.confluence=[{x:0,y:0,w:7,h:16},{panel:'home',x:7,y:0,w:5,h:9},{controls:'steps',attachTo:'diagram',x:0,y:16,w:7,h:5}];
 profiles.backstage=[{x:0,y:0,w:9,h:18},{panel:'home',x:9,y:0,w:3,h:10},{controls:'steps',attachTo:'diagram',x:0,y:18,w:9,h:4}];
 const original=JSON.stringify(raw,null,2),siblings=JSON.stringify([profiles.default,profiles.backstage].map(items=>items.map(it=>({...it,x:it.x*2,w:it.w*2}))));
 await page.goto(server.origin+'/workbench.html');await paste(page,original);await closeTools(page);await info.attach('profile-closed-navigation',{body:await page.screenshot(),contentType:'image/png'});await arrangeChapter(page);
 const profile=page.getByRole('combobox',{name:'Arrangement profile',exact:true}),grid=page.locator('.section-layout-grid'),diagram=page.locator('[data-layout-key="diagram"]');
 await profile.selectOption('confluence');await expect(grid).toHaveAttribute('data-layout-target','confluence');await expect(page.getByRole('spinbutton',{name:'Width',exact:true})).toHaveValue('14');await info.attach('confluence-arrangement-profile',{body:await page.screenshot(),contentType:'image/png'});
 expect(await diagram.evaluate(el=>Number(el.style.getPropertyValue('--tile-w')))).toBe(14);await expect(page.locator('#src')).toHaveValue(original);await expect(page.locator('#undo-builder')).toBeDisabled();
 const read=async()=>JSON.parse(await page.locator('#src').inputValue()).page.blocks[0].diagram.layouts[0].sectionLayout;
 const unchanged=async()=>{expect((await read()).columns).toBe(24);expect(JSON.stringify([(await read()).default,(await read()).backstage])).toBe(siblings);};
 await page.getByRole('spinbutton',{name:'Height',exact:true}).fill('20');await page.getByRole('button',{name:'Apply size / position',exact:true}).click();expect((await read()).confluence[0].h).toBe(20);await unchanged();await expect(grid).toHaveAttribute('data-layout-target','confluence');
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);await expect(page.locator('#undo-builder')).toBeDisabled();
 await diagram.locator('.section-tile-move').focus();await page.keyboard.press('ArrowDown');expect((await read()).confluence[0].y).toBe(1);await unchanged();await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);
 await page.getByRole('checkbox',{name:'Show Home in Business',exact:true}).uncheck();expect((await read()).confluence.find(it=>it.panel==='home').hidden).toBe(true);await unchanged();await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);
 await page.getByRole('button',{name:'Optimize layout',exact:true}).click();await unchanged();expect((await read()).confluence).not.toEqual(profiles.confluence);await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);
 await page.getByRole('button',{name:'Reset layout',exact:true}).click();expect((await read()).confluence).toBeUndefined();await unchanged();await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);await expect(page.locator('#undo-builder')).toBeDisabled();
 await closeTools(page);await arrangeChapter(page);await profile.selectOption('backstage');await expect(grid).toHaveAttribute('data-layout-target','backstage');await expect(page.getByRole('spinbutton',{name:'Width',exact:true})).toHaveValue('18');
 await page.locator('#workspace-appearance>summary').click();await page.locator('#layout-preview-target').selectOption('confluence');await page.locator('#open-page-preview').click();await expect(page.locator('#page-preview-view .section-layout-grid')).toHaveAttribute('data-layout-target','confluence');await page.locator('#close-page-preview').click();await expect(grid).toHaveAttribute('data-layout-target','backstage');await expect(profile).toHaveValue('backstage');await expect(page.locator('#src')).toHaveValue(original);
});


test('arranger stays above Inspect and retires cleanly on Escape, chapter, tab and source changes',async({page,server})=>{
 const original=await open(page,server);await nav(page).getByRole('button',{name:'Overview',exact:true}).click();await arrangeChapter(page);
 const arranger=page.locator('.section-arranger:popover-open');await expect(arranger).toHaveCount(1);
 await page.locator('#editor-tab-inspect').click();await expect(page.locator('#workspace-window-inspect')).toBeVisible();
 await arranger.getByRole('button',{name:'Hide arrangement controls',exact:true}).click();await expect(arranger.locator('.section-arrange-fields')).toBeHidden();await arranger.getByRole('button',{name:'Show arrangement controls',exact:true}).click();await expect(arranger.locator('.section-arrange-fields')).toBeVisible();
 await arranger.getByRole('combobox',{name:'Arrangement profile',exact:true}).focus();await page.keyboard.press('Escape');await expect(arranger).toHaveCount(0);await expect(nav(page).locator('.section-view-options>summary')).toBeFocused();
 await arrangeChapter(page);await arranger.getByRole('button',{name:'Done arranging',exact:true}).click();await expect(arranger).toHaveCount(0);await expect(nav(page).locator('.section-view-options>summary')).toBeFocused();
 await arrangeChapter(page);await nav(page).getByRole('button',{name:'Engineering',exact:true}).click();await expect(arranger).toHaveCount(0);
 await arrangeChapter(page);await chooseNavigation(nav(page),'Tab','Notes');await expect(arranger).toHaveCount(0);await chooseNavigation(nav(page),'Tab','Main story');await expect(arranger).toHaveCount(0);
 await arrangeChapter(page);await page.locator('#src').evaluate(el=>{el.value+=' ';el.dispatchEvent(new Event('input',{bubbles:true}));});await expect(arranger).toHaveCount(0);await page.locator('#editor-tab-json').click();await page.locator('#go').click();await expect(arranger).toHaveCount(0);await expect(page.locator('#src')).toHaveValue(original+' ');
});
