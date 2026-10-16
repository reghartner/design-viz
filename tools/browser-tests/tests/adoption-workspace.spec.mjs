import {openAutoArrange} from '../helpers/test.mjs';
import {test,expect,paste} from '../helpers/test.mjs';
import {editorSpec} from '../fixtures/editor-spec.mjs';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {repo} from '../helpers/prepare.mjs';
const spec=()=>{const value=editorSpec();value.page.blocks[0].id='delivery';return value;};
async function arrangeEditor(page,mode){
  if(!await page.locator('#workspace-window-file').isVisible())await page.locator('#editor-tab-file').click();
  const preferences=page.locator('.workspace-preferences');
  if(!await preferences.evaluate(el=>el.open))await preferences.locator('summary').click();
  await page.locator('#workspace-preset').selectOption(mode);
}

test('workspace presets preserve authored story and short windows keep New Connection reachable',async({page,server})=>{
  await page.goto(server.origin+'/workbench.html');const original=JSON.stringify(spec());await paste(page,original);
  for(const mode of ['story','engineering','present']){await arrangeEditor(page,mode);await expect(page.locator('#src')).toHaveValue(original);}
  await expect(page.locator('.workspace-window:visible')).toHaveCount(0);
  await expect(page.locator('.workbench-header #folder-agent-indicator, .workbench-header #workspace-prepare-review, .workbench-header #workspace-preset')).toHaveCount(0);
  await expect(page.locator('#workspace-preset')).not.toBeVisible();
  await page.setViewportSize({width:640,height:360});await page.locator('#editor-tab-agent').click();
  await expect(page.locator('#folder-agent-input')).toBeHidden();
  await expect(page.locator('#editor-agent [role=tab]')).toHaveCount(0);
  const setup=page.getByRole('button',{name:'New Connection',exact:true});
  await setup.scrollIntoViewIfNeeded();
  expect(await setup.evaluate(node=>{const r=node.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===node;})).toBe(true);
  await setup.click();
  for(const mode of ['external','embedded']){
    await page.locator('#folder-agent-setup-mode-'+mode).click();
    await expect(page.locator('#folder-agent-setup-mode-'+mode)).toHaveAttribute('aria-pressed','true');
    await expect(page.locator('#src')).toHaveValue(original);
  }
  await page.locator('#folder-agent-close-guide').click();
  await expect(page.locator('#folder-agent-input')).toBeHidden();
});

test('Brief links engineering evidence to a block story and exports the exact viewable draft',async({page,server},info)=>{
  await page.route('**/template/flowview.html',async route=>route.fulfill({contentType:'text/html',body:await readFile(path.join(repo,'template/flowview.html'),'utf8')}));
  await page.goto(server.origin+'/workbench.html');const original=JSON.stringify(spec());await paste(page,original);
  await page.locator('#editor-tab-brief').click();const brief=page.locator('#editor-brief');await brief.getByText('Add engineering evidence',{exact:true}).click();
  await brief.locator('[name=storyTarget]').selectOption(JSON.stringify({kind:'node',sectionId:'delivery',id:'a'}));
  await brief.locator('[name=reference]').fill('src/delivery.ts:42');await brief.locator('[name=note]').fill('Retry behavior conflicts with the promised outcome');await brief.locator('[name=relationship]').selectOption('conflicts');
  await brief.getByRole('button',{name:'Attach evidence',exact:true}).click();await expect(brief).toContainText('Evidence attached');const enriched=await page.locator('#src').inputValue();
  expect(JSON.parse(enriched).page).toEqual(JSON.parse(original).page);expect(JSON.parse(enriched).storyBrief.evidence[0].storyTarget).toEqual({kind:'node',sectionId:'delivery',id:'a'});
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(enriched);
  const download=page.waitForEvent('download');await brief.getByRole('button',{name:'Download review package',exact:true}).click();const file=await download,destination=info.outputPath('engineering-handoff.zip');await file.saveAs(destination);
  const result=JSON.parse(execFileSync('python3',['-c','import zipfile,json,sys; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; print(json.dumps({"source":z.read("story.spec.json").decode(),"manifest":json.loads(z.read("sources.json")),"viewer":z.read("story.html").decode()}))',destination],{encoding:'utf8',maxBuffer:8*1024*1024}));
  expect(result.source).toBe(enriched);expect(result.manifest.publication).toBe('local-draft');expect(result.viewer).toContain('Retry behavior conflicts with the promised outcome');expect(result.manifest.references.some(item=>item.kind==='engineering-evidence')).toBe(true);
});

test('invalid authored graphs cannot be packaged as a successful viewable handoff',async({page,server})=>{
  await page.goto(server.origin+'/workbench.html');const value=spec();await paste(page,JSON.stringify(value));value.page.blocks[0].diagram.edges[0].to='missing';
  await page.locator('#file-input').setInputFiles({name:'invalid.spec.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(value))});
  const downloads=[];page.on('download',event=>downloads.push(event));await page.locator('#editor-tab-brief').click();await page.locator('#editor-brief').getByRole('button',{name:'Download review package',exact:true}).click();
  await expect(page.locator('.story-brief-status')).toContainText('Repair the story');await expect(page.locator('.story-brief-status')).toContainText('missing');expect(downloads).toHaveLength(0);
});

test('compact chrome keeps Add, Auto arrange, appearance and workspace controls independently reachable',async({page,server})=>{
  await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(spec()));
  const more=page.locator('#workspace-more');
  await page.setViewportSize({width:1181,height:800});await expect(more).toHaveAttribute('open','');
  await page.setViewportSize({width:1180,height:800});await expect(more).not.toHaveAttribute('open','');
  await page.setViewportSize({width:1051,height:800});await expect(more).not.toHaveAttribute('open','');
  await page.setViewportSize({width:1181,height:800});await expect(more).toHaveAttribute('open','');
  for(const [width,height] of [[1800,800],[1501,800],[1500,800],[1499,800],[1281,800],[1280,800],[1279,800],[1240,800],[1200,800],[1190,800],[1181,800],[1180,800],[1150,800],[1050,800],[1024,800],[850,800],[820,800],[720,800],[640,800],[421,800],[420,800]]){
    // Workbench editing is desktop-only (CLAUDE.md); phone widths below 420px are not an editing target.
    await page.setViewportSize({width,height});
    if(!await page.locator('#workspace-export-trigger').isVisible() && await more.getAttribute('open')===null)await more.locator(':scope > summary').click();
    const controls=await page.evaluate(()=>['#diagram-add','#workspace-export-trigger','#undo-builder','#redo-builder','#workspace-appearance>summary','#open-page-preview','.workspace-help>summary','#editor-tab-agent'].map(selector=>{
      const node=document.querySelector(selector),r=node.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
      return {selector,left:+r.left.toFixed(1),right:+r.right.toFixed(1),width:+r.width.toFixed(1),inside:r.left>=0 && r.right<=innerWidth && r.top>=0 && r.bottom<=innerHeight,reachable:hit===node || node.contains(hit)};
    }));
    for(const control of controls)expect(control,JSON.stringify(control)+' at '+width+'×'+height+'px').toMatchObject({inside:true,reachable:true});
    const viewOptions=page.locator('#docview .explore-navigation .section-view-options>summary');if(await more.getAttribute('open')!==null && await more.locator(':scope > summary').isVisible())await more.locator(':scope > summary').click();if(!await viewOptions.isVisible())await page.locator('#docview .reader-utilities>summary').click();await expect(viewOptions).toBeVisible();expect(await viewOptions.evaluate(node=>{const r=node.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return r.left>=0 && r.right<=innerWidth && (hit===node || node.contains(hit));})).toBe(true);if(!await page.locator('#workspace-export-trigger').isVisible())await more.locator(':scope > summary').click();
    const header=await page.locator('.workbench-header').evaluate(el=>({client:el.clientWidth,scroll:el.scrollWidth}));
    expect(header.scroll).toBeLessThanOrEqual(header.client+1);
    await expect(page.locator('#workspace-export-trigger')).toHaveAccessibleName('Export');
    await page.locator('.workspace-help>summary').click();await expect(page.locator('.workspace-help [data-workbench-tour]')).toBeVisible();await expect(page.locator('.workspace-help [data-workbench-tour]')).toHaveAccessibleName('Take the workbench tour');await page.locator('.workspace-help>summary').click();if(await more.getAttribute('open')!==null && await more.locator(':scope > summary').isVisible())await more.locator(':scope > summary').click();
    await page.locator('#diagram-add').click();await expect(page.locator('#add-node')).toBeVisible();await page.keyboard.press('Escape');
    if(width===1024){
      const before=await page.locator('#src').inputValue();
      await openAutoArrange(page);await expect(page.locator('#auto-arrange-dialog')).toBeVisible();
      await page.locator('[data-arrange-cancel]').click();await expect(page.locator('#auto-arrange-dialog')).not.toBeVisible();
      await expect(page.locator('#src')).toHaveValue(before);
    }
    if(!await page.locator('#workspace-appearance>summary').isVisible())await more.locator(':scope > summary').click();
    await page.locator('#workspace-appearance>summary').click();await expect(page.locator('#sk-pastel')).toBeVisible();await expect(page.locator('#open-page-preview')).toBeVisible();await expect(page.locator('#open-page-preview')).toHaveAccessibleName('Open page preview');
    await page.locator('#workspace-appearance>summary').click();await arrangeEditor(page,'present');
  }
});

test('short-height rail scrolls to every tool with pointer and keyboard access',async({page,server})=>{
  await page.setViewportSize({width:640,height:360});await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(spec()));
  const rail=page.locator('.workspace-rail');
  expect(await rail.evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true);
  await page.locator('#editor-tab-json').click();await expect(page.locator('#editor-tab-json')).toBeInViewport();await expect(page.locator('#workspace-window-json')).toBeVisible();
  await page.locator('#editor-tab-file').click();await expect(page.locator('#editor-tab-file')).toBeInViewport();await expect(page.locator('#workspace-window-file')).toBeVisible();
  await page.locator('#editor-tab-agent').focus();await page.keyboard.press('End');
  await expect(page.locator('#editor-tab-file')).toBeFocused();await expect(page.locator('#editor-tab-file')).toBeInViewport();
  await page.keyboard.press('Home');await expect(page.locator('#editor-tab-agent')).toBeFocused();await expect(page.locator('#editor-tab-agent')).toBeInViewport();
  const r=await rail.boundingBox();expect(r.y+r.height).toBeLessThanOrEqual(360);
});


test('short floating tools keep their close buttons and rail reachable above canvas chrome',async({page,server})=>{
  await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(spec()));
  for(const width of [640,390]){
    await page.setViewportSize({width,height:360});await arrangeEditor(page,'present');
    for(const tool of ['agent','brief','inspect','steps','outline','json','file']){
      await page.locator('#editor-tab-'+tool).click();const win=page.locator('#workspace-window-'+tool);
      await expect(win).toBeVisible();const close=win.locator('.workspace-window-close');
      expect(await close.evaluate(node=>{const r=node.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return hit===node || node.contains(hit);}),tool+' close at '+width+'px').toBe(true);
      const canvasMenu=page.locator('#workspace-canvas-tools>summary');expect(await canvasMenu.evaluate(node=>{const r=node.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return hit===node || node.contains(hit);})).toBe(true);
      await close.click();await expect(win).toBeHidden();await expect(page.locator('#editor-tab-'+tool)).toBeFocused();await expect(page.locator('#editor-tab-'+tool)).toBeInViewport();
    }
  }
});

/* #561 contract matrix (desktop editor; editing on phones is out of scope).
   row | fixture | assertion (scoped) | rejects
   R1 distinct rail icons | editorSpec | each .workspace-rail .editor-tool-icon text is unique; Layers icon != File icon | Layers and File sharing ▱ (or any two tools sharing a glyph)
   R2 ⌘K listed | same | #keyboard-shortcuts dt "⌘/Ctrl + K" paired with dd "Find objects" | dialog without Find objects
   R3 Redo listed once | same | exactly one dd starts with Redo and its dt is "⌘/Ctrl + Shift + Z"; no "⌘/Ctrl + Y" row (Chuck 2026-10-16: Redo is only ⌘/Ctrl+Shift+Z) | dialog without Redo, or a second Redo binding
   R4 complete roster | same | ordered dt list of every #keyboard-shortcuts dl equals the global key handlers (shortcuts.js, builder ⌘K/undo/redo, clipboard copy/paste/duplicate, spatial selection Shift+F10/ContextMenu, interactions Delete/Backspace, canvas Space pan) | an omitted or stale row anywhere in the sheet
   R5 ⌘K implemented | same, focus on a canvas node | real ControlOrMeta+K shows Find objects with #outline-search focused | listing a shortcut that does nothing
   R6 Redo is ⌘/Ctrl+Shift+Z only | Storage row lock, then Undo | from a canvas-focused node a real ControlOrMeta+Y leaves nodes.c.locked false and #redo-builder enabled, then ControlOrMeta+Shift+Z re-applies it | a Y alias that still redoes, or a listed Redo that does nothing
   R7 editor pager | editorSpec + a notes-only second section | #docview .reader-page-label reads "Section 1 of 2" then "Section 2 of 2" via the "Next section"/"Previous section" buttons in group "Sections in selected View" | "Page 1 of 2" or Page-named arrows
   R8 reader preview pager | same, page preview open | #page-preview-view .reader-page-label reads "Section 1 of 2" | editor and reader using different terms */
/* Static rows use soft assertions so one RED run reports every unmet row. */
test('editor rail icons are distinct, the shortcut sheet lists every global key, and the pager counts sections',async({page,server})=>{
  const raw=spec();raw.page.blocks.push({heading:'Notes only',text:'No diagram in this section.'});
  await page.setViewportSize({width:1440,height:900});await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(raw,null,2));
  const icons=page.locator('.workspace-rail .editor-tool-icon');await expect(icons).toHaveCount(8);
  const glyphs=(await icons.allTextContents()).map(text=>text.trim());
  expect.soft(new Set(glyphs).size).toBe(glyphs.length);
  expect.soft(await page.locator('#editor-tab-layers .editor-tool-icon').textContent()).not.toBe(await page.locator('#editor-tab-file .editor-tool-icon').textContent());

  const sheet=page.locator('#keyboard-shortcuts');await expect(sheet).toBeHidden();
  await page.locator('.workspace-help>summary').click();await page.locator('#workspace-shortcuts').click();await expect(sheet).toBeVisible();
  const rows=await sheet.locator('dl').evaluateAll(lists=>lists.flatMap(list=>[...list.querySelectorAll(':scope > dt')].map(dt=>[dt.textContent.replace(/\s+/g,' ').trim(),dt.nextElementSibling.textContent.trim()])));
  const described=keys=>rows.filter(row=>row[0]===keys).map(row=>row[1]);
  expect.soft(described('⌘/Ctrl + K')).toEqual(['Find objects']);
  expect.soft(rows.filter(row=>/^Redo\b/.test(row[1])).map(row=>row[0])).toEqual(['⌘/Ctrl + Shift + Z']);
  expect.soft(described('⌘/Ctrl + Y')).toEqual([]);
  expect.soft(rows.map(row=>row[0])).toEqual(['?','F','Shift + F','F2','⌘/Ctrl + K','⌘/Ctrl + A','Enter','Shift + Enter','Arrow','Shift + F10 or Menu','⌘/Ctrl + C','⌘/Ctrl + V','⌘/Ctrl + D','Delete or Backspace','Esc','Space + drag','Alt/Option + click','Alt/Option + drag','⌘/Ctrl + Z','⌘/Ctrl + Shift + Z']);
  await page.locator('#keyboard-shortcuts-close').click();await expect(sheet).toBeHidden();

  const canvasNode=page.locator('#docview [data-dv-node="a"] .t1'),find=page.locator('#outline-search');
  await expect(find).not.toBeFocused();
  await canvasNode.click();await page.keyboard.press('ControlOrMeta+k');await expect(find).toBeVisible();await expect(find).toBeFocused();

  const locked=async()=>JSON.parse(await page.locator('#src').inputValue()).page.blocks[0].diagram.nodes.c.locked===true;
  await page.locator('#editor-tab-layers').click();const lock=page.locator('#workspace-window-layers .layer-row').filter({hasText:'Storage'}).locator('.layer-lock');
  await lock.click();await expect.poll(locked).toBe(true);
  await page.locator('#undo-builder').click();await expect.poll(locked).toBe(false);await expect(page.locator('#redo-builder')).toBeEnabled();
  await canvasNode.click();await page.keyboard.press('ControlOrMeta+y');
  expect.soft(await locked()).toBe(false);await expect.soft(page.locator('#redo-builder')).toBeEnabled();
  await page.keyboard.press('ControlOrMeta+Shift+z');await expect.poll(locked).toBe(true);
  await page.locator('#undo-builder').click();await expect.poll(locked).toBe(false);

  const pager=page.locator('#docview .explore-navigation .reader-page-index');
  await expect(pager).toHaveAttribute('aria-label','Sections in selected View');
  await expect(pager.locator('.reader-page-label')).toHaveText('Section 1 of 2');
  await pager.getByRole('button',{name:'Next section',exact:true}).click();await expect(pager.locator('.reader-page-label')).toHaveText('Section 2 of 2');
  await pager.getByRole('button',{name:'Previous section',exact:true}).click();await expect(pager.locator('.reader-page-label')).toHaveText('Section 1 of 2');
  await page.locator('#open-page-preview').click();
  await expect(page.locator('#page-preview-view .reader-page-label')).toHaveText('Section 1 of 2');
  await page.locator('#close-page-preview').click();
});
