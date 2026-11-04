/* #960 step caption contract (desktop Workbench; ticket "Test + flip", Chuck's coverage ruling
   2026-11-04: the Test + flip section as written). Hosted by the "step caption" test below, once
   in Standard and once in Explore. Fixture stepFixture(): steps start(0) 'Start **first**' with a
   source link, alt(1) 'Alternate start', shared(2) 'Both paths finish here'; paths main=[start,
   shared] and other=[alt,shared], so on either path the shared step is path position 1 but source
   index 2. The editor is the textbox "Edit step text" inside the live caption line
   (.termbar .stepline, ghost tween line excluded); preview = its "Live Markdown preview" region.

   row | fixture / input | scoped assertion | rejects
   P1 fixture discriminates | Next / path chips | caption .step-text reads the step text on each
      path, shared step on both, source unchanged | a fixture whose shared step is not shared
   1 single-click keeps selecting | click .step-text | Inspect (#guide) shows step `text` =
      'Start **first**' (Standard) / "Step controls placement" (Explore), absent before; no editor;
      #src unchanged | a click handler that opens the editor or stops selecting
   2 link and copy keep their actions | dblclick a.steplink, dblclick "Copy link to this diagram
      step" | no editor; #src unchanged; the link opened its (local) source page; the stubbed
      clipboard got this Workbench URL with s=start |
      a handler keyed on the whole .stepline, or one that swallows the copy click
   P2 Inspect empty rule | Steps -> step 1 -> Inspect text cleared + Tab | steps[0] has no `text`
      (removed, not "") | (precondition for row 5)
   3 double-click opens in place | dblclick .step-text | editor visible, focused, in viewport,
      inside the caption line, value 'Start **first**', preview <strong> 'first'; #src unchanged
      (FLIP: fails today, no double-click route) | no route; an editor opened elsewhere
      (Inspect/dialog); an editor holding rendered text instead of Markdown source
   4 Escape writes nothing | type, Escape | editor gone; #src === original; caption unchanged |
      Escape that saves
   5 empty value = Inspect | select all, Backspace, Ctrl/Cmd+Enter | #src text === the P2 source
      exactly; Undo restores original | an editor saving JSON "" for an empty draft
   6 Markdown save, Enter adds a line | type, Enter, type, Ctrl/Cmd+Enter | while open: value has
      '\n', preview <code>, #src unchanged; after: parsed #src equals the fixture with only
      steps[0].text changed; caption shows <code>step</code>, no <strong> | Enter that saves;
      a write to the wrong step or field; a caption not re-rendered
   7 one save = one Undo; Redo | #undo-builder, #redo-builder | Undo: #src === original exactly,
      caption <strong> 'first', Undo disabled; Redo: #src === saved | a save that records two
      entries or none
   8 shared step edits every path | main: Next, dblclick, type, click the STEP number (outside) |
      editor opens with 'Both paths finish here'; parsed #src changes only steps[2].text; path
      other step 2 caption shows <strong> 'changed' | resolving the caption by path position
      (would edit alt), a per-path copy, click-outside that does not save
   excluded — §0 ruling ("the ticket's Test + flip section, as written"): lane pill and step
      number double-click (named only in "How it should look"), node/edge/other entries
      (children #961-#971). */
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {test,expect,pastePage,closeTools,inspectPageElement} from '../helpers/test.mjs';
const fixture=(explore=false)=>({page:{title:'Inline writing',skin:'pastel',sections:[{heading:'Notes',text:['Start here'],bullets:[{text:'Parent',revealAt:0,custom:'keep',sub:[{text:'Child',custom:true}]}],diagram:{nodes:{a:{title:'Existing',sub:'Keep details'}},rows:[['a']],steps:[{text:'First',nodes:['a']}],layouts:[{id:'main',name:'Main',presentation:explore?'explore':'standard',sectionLayout:{default:[{x:0,y:0,w:12,h:14}]}}],defaultLayout:'main'}}]}});
const input=page=>page.getByRole('textbox',{name:'Edit section text',exact:true});
const paragraph=page=>page.locator('#docview [data-dv-para="0"]');
const preview=page=>page.getByRole('region',{name:'Live Markdown preview',exact:true});
async function setup(page,server,explore=false){await page.goto(server.origin+'/workbench.html');const original=JSON.stringify(fixture(explore),null,2);await pastePage(page,original);await closeTools(page);return original;}
for(const explore of [false,true])test('inline Markdown '+(explore?'Explore':'document')+' owns typing, caret, lists, code, native Undo and one source commit',async({page,server},info)=>{
 const original=await setup(page,server,explore);await paragraph(page).dblclick();const edit=input(page);await expect(edit).toBeFocused();
 await edit.selectText();await edit.pressSequentially('Hello **world**');await expect(preview(page).locator('strong')).toHaveText('world');await expect(page.locator('#src')).toHaveValue(original);
 await edit.selectText();await edit.press('ArrowLeft');await edit.press('ArrowRight');await edit.pressSequentially('i');await expect(edit).toHaveValue('Hiello **world**');expect(await edit.evaluate(el=>el.selectionStart)).toBe(2);
 await edit.press('ControlOrMeta+z');await expect(edit).toHaveValue('Hello **world**');await edit.press('ControlOrMeta+Shift+z');await expect(edit).toHaveValue('Hiello **world**');
 await edit.selectText();await edit.press('ArrowRight');await edit.press('Enter');await edit.pressSequentially('- first');await edit.press('Enter');await expect(edit).toHaveValue('Hiello **world**\n- first\n- ');
 await edit.pressSequentially('second');await edit.press('Enter');await edit.press('Enter');await expect(edit).toHaveValue('Hiello **world**\n- first\n- second\n');expect(await edit.evaluate(el=>el.selectionStart)).toBe((await edit.inputValue()).length);await edit.pressSequentially('```js');await edit.press('Enter');await edit.pressSequentially('const value = 1;');await edit.press('Enter');await edit.pressSequentially('```');
 await expect(preview(page).locator('li')).toHaveText(['first','second']);await expect(preview(page).locator('pre code')).toHaveText('const value = 1;\n');
 await edit.press('Enter');await edit.pressSequentially('*italic* and `code` [link](https://example.test)');
 await expect(preview(page).locator('em')).toHaveText('italic');await expect(preview(page).locator('a')).toHaveText('link');
 await edit.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('inline-markdown-'+(explore?'explore':'document')+'.png')});
 await preview(page).locator('a').click();await expect(edit).toHaveCount(1);await expect(page).toHaveURL(/workbench.html$/);await expect(edit).toBeFocused();await expect(edit).toBeInViewport();await expect(preview(page).locator('strong')).toBeInViewport();await page.screenshot({path:info.outputPath('inline-markdown-'+(explore?'explore':'document')+'-after-link.png')});
 const draft=await edit.inputValue();await edit.press('ControlOrMeta+Enter');await expect(edit).toHaveCount(0);expect(JSON.parse(await page.locator('#src').inputValue()).page.sections[0].text).toEqual([draft]);
 const saved=await page.locator('#src').inputValue();await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);await expect(page.locator('#undo-builder')).toBeDisabled();await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(saved);
});
test('prose draft protects IME, native paste, structured bullets, cancellation and click-away',async({page,server,context})=>{
 const original=await setup(page,server);const parent=page.locator('#docview [data-dv-bullet-path="0"]');await parent.focus();await parent.press('Enter');const edit=input(page);
 await edit.selectText();await edit.pressSequentially('Changed parent');await edit.dispatchEvent('compositionstart');await edit.press('Escape');await edit.press('ControlOrMeta+Enter');await expect(edit).toBeFocused();await expect(page.locator('#src')).toHaveValue(original);await edit.dispatchEvent('compositionend');
 await edit.press('Escape');await expect(edit).toHaveCount(0);await expect(page.locator('#src')).toHaveValue(original);await expect(parent).toBeFocused();
 await parent.dblclick();await edit.selectText();await context.grantPermissions(['clipboard-read','clipboard-write']);await page.evaluate(()=>navigator.clipboard.writeText('Pasted <b>plain</b>\n- item'));await edit.press('ControlOrMeta+v');await expect(edit).toHaveValue('Pasted <b>plain</b>\n- item');await expect(preview(page).locator('b')).toHaveCount(0);
 await page.locator('#docview .sec-h').click();await expect(edit).toHaveCount(0);const saved=JSON.parse(await page.locator('#src').inputValue());expect(saved.page.sections[0].bullets[0]).toEqual({...fixture().page.sections[0].bullets[0],text:'Pasted <b>plain</b>\n- item'});
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);
});
for(const contextual of [false,true])test('new node '+(contextual?'canvas':'preset')+' title is direct only at creation, then Inspect',async({page,server},info)=>{
 await setup(page,server,true);
 if(contextual){
  const board=page.locator('#docview .board'),p=await board.evaluate(board=>{const r=board.getBoundingClientRect();for(let y=Math.min(r.bottom-20,innerHeight-20);y>r.top+20;y-=30)for(let x=Math.min(r.right-20,innerWidth-20);x>r.left+20;x-=30){const el=document.elementFromPoint(x,y);if(el&&board.contains(el)&&!el.closest('button,input,textarea,a,.explore-window,.explore-player,[data-dv-node],[data-dv-edge],[data-dv-group],[data-dv-row]'))return {x,y};}throw Error('No exposed background');});await page.mouse.click(p.x,p.y,{button:'right'});await page.getByRole('menuitem',{name:'Node',exact:true}).click();
 }else{await page.locator('#diagram-add').click();await page.locator('#add-node').click();await page.locator('#diagram-add-presets').getByRole('button',{name:'Console',exact:true}).click();}
 const edit=page.getByRole('textbox',{name:'New node title',exact:true});await expect(edit).toBeFocused();expect(await edit.evaluate(el=>[el.selectionStart,el.selectionEnd])).toEqual([0,(await edit.inputValue()).length]);const created=await page.locator('#src').inputValue();await page.screenshot({path:info.outputPath('new-node-title-'+(contextual?'canvas':'preset')+'.png')});
 await edit.pressSequentially('New title');await edit.press('Enter');await expect(edit).toHaveCount(0);let raw=JSON.parse(await page.locator('#src').inputValue()),id=Object.keys(raw.page.sections[0].diagram.nodes).find(id=>id!=='a');expect(raw.page.sections[0].diagram.nodes[id].title).toBe('New title');
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(created);await page.locator('#redo-builder').click();
 const node=page.locator('#docview [data-dv-node="'+id+'"]');await node.dblclick();await expect(edit).toHaveCount(0);await page.locator('#editor-tab-inspect').click();const title=page.locator('#guide').getByLabel('Name',{exact:true});await title.fill('Inspector title');await title.press('Enter');expect(JSON.parse(await page.locator('#src').inputValue()).page.sections[0].diagram.nodes[id].title).toBe('Inspector title');
});
test('source replacement and teardown retire inline drafts and stale input events',async({page,server})=>{
 await page.goto(server.origin+'/lifetime/index.html');const original=JSON.stringify(fixture());await pastePage(page,original);await closeTools(page);await paragraph(page).dblclick();const edit=input(page);await edit.pressSequentially(' unsaved');const held=await edit.elementHandle();
 const changed=original.replace('Start here','Replacement');await page.evaluate(text=>{const src=document.querySelector('#src');src.value=text;src.dispatchEvent(new Event('input',{bubbles:true}));},changed);await expect(edit).toHaveCount(0);await held.evaluate(el=>{el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',ctrlKey:true,bubbles:true}));});await expect(page.locator('#src')).toHaveValue(changed);
 await page.evaluate(()=>document.querySelector('#go').click());await paragraph(page).dblclick();await input(page).pressSequentially(' unsaved');const old=await input(page).elementHandle();await page.evaluate(text=>__editorTest.builder.loadText(text),changed);await expect(edit).toHaveCount(0);await old.evaluate(el=>el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',ctrlKey:true,bubbles:true})));await expect(page.locator('#src')).toHaveValue(changed);await paragraph(page).dblclick();await input(page).pressSequentially(' unsaved');await page.evaluate(()=>__editorTest.builder.destroy());await expect(edit).toHaveCount(0);await expect(page.locator('#src')).toHaveValue(changed);
});

test('new prose accepts direct typing and new node cancellation keeps its creation title',async({page,server})=>{
 await setup(page,server,true);const src=page.locator('#src');
 for(const [kind,text] of [['paragraph','Created **paragraph**'],['bullet','Created `point`']]){
  await page.locator('#diagram-add').click();await page.locator('[data-add-kind="'+kind+'"]').click();const created=await src.inputValue(),edit=input(page);await expect(edit).toBeFocused();await edit.pressSequentially(text);await expect(preview(page)).toContainText(kind==='paragraph'?'Created paragraph':'Created point');await edit.press('ControlOrMeta+Enter');const committed=await src.inputValue();
  await page.locator('#undo-builder').click();await expect(src).toHaveValue(created);await page.locator('#redo-builder').click();await expect(src).toHaveValue(committed);
 }
 await page.locator('#diagram-add').click();await page.locator('#add-node').click();await page.locator('#diagram-add-presets').getByRole('button',{name:'Console',exact:true}).click();const created=await src.inputValue(),edit=page.getByRole('textbox',{name:'New node title',exact:true});await edit.pressSequentially('Discarded');await edit.press('Escape');await expect(src).toHaveValue(created);await expect(edit).toHaveCount(0);
});

const stepFixture=(explore,link)=>({page:{title:'Inline steps',skin:'pastel',sections:[{heading:'Notes',text:['Start here'],diagram:{view:'step',autoplay:false,
 nodes:{a:{title:'Alpha'},b:{title:'Beta'},c:{title:'Gamma'}},rows:[['a','b','c']],
 steps:[{id:'start',text:'Start **first**',nodes:['a'],link},{id:'alt',text:'Alternate start',nodes:['b']},{id:'shared',text:'Both paths finish here',nodes:['c']}],
 paths:[{id:'main',label:'Main route',steps:['start','shared']},{id:'other',label:'Other route',steps:['alt','shared']}],
 layouts:[{id:'main',name:'Main',presentation:explore?'explore':'standard',sectionLayout:{default:[{x:0,y:0,w:12,h:14}]}}],defaultLayout:'main'}}]}});
for(const explore of [false,true])test('step caption '+(explore?'Explore':'Standard')+' double-click edits the current step text in place: Markdown, Escape, empty rule, one Undo, shared step',async({page,server})=>{
 await page.addInitScript(()=>{window.__copied=[];Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__copied.push(text);}}});});
 // The step's source link opens a local page: the browser audit forbids outbound requests.
 const link=server.origin+'/inline-step-source.html';await writeFile(path.join(server.root,'inline-step-source.html'),'<!doctype html><title>Step source</title><p>Step source</p>');
 const popups=[];page.on('popup',popup=>popups.push(popup));
 await page.goto(server.origin+'/workbench.html');const original=JSON.stringify(stepFixture(explore,link),null,2);await pastePage(page,original);await closeTools(page);
 const src=page.locator('#src'),bar=page.locator('#docview .termbar'),line=bar.locator('.stepline:not(.dv-caption-old)'),caption=line.locator('.step-text'),stepN=line.locator(':scope > b');
 const edit=line.getByRole('textbox',{name:'Edit step text',exact:true}),draft=line.getByRole('region',{name:'Live Markdown preview',exact:true});
 const next=bar.getByRole('button',{name:'Next step',exact:true}),route=id=>bar.locator('.path-chip[data-dv-path="'+id+'"]');
 const stepText=page.locator('#guide').getByLabel('text',{exact:true}),placement=page.locator('#guide').getByRole('combobox',{name:'Step controls placement',exact:true});
 const undo=page.locator('#undo-builder'),redo=page.locator('#redo-builder');
 // P1: the fixture discriminates. The shared step sits at path position 1 but source index 2.
 await expect(page.locator('#docview .explore-player .termbar')).toHaveCount(explore?1:0);
 await expect(stepN).toHaveText('STEP 1/2');await expect(caption.locator('strong')).toHaveText('first');
 await next.click();await expect(stepN).toHaveText('STEP 2/2');await expect(caption).toHaveText('Both paths finish here');
 await route('other').click();await expect(stepN).toHaveText('STEP 1/2');await expect(caption).toHaveText('Alternate start');
 await next.click();await expect(stepN).toHaveText('STEP 2/2');await expect(caption).toHaveText('Both paths finish here');
 await route('main').click();await expect(stepN).toHaveText('STEP 1/2');await expect(caption).toHaveText('Start first');await expect(src).toHaveValue(original);
 // Row 1: single-click keeps today's selection (Standard: current step; Explore: step controls).
 await page.locator('#editor-tab-inspect').click();await expect(stepText).toHaveCount(0);await expect(placement).toHaveCount(0);
 await inspectPageElement(page,caption);
 if(explore)await expect(placement).toBeVisible();else await expect(stepText).toHaveValue('Start **first**');
 await expect(edit).toHaveCount(0);await expect(src).toHaveValue(original);await closeTools(page);
 // Row 2: the caption's source link and copy button keep their own actions.
 await line.locator('a.steplink').dblclick();await expect(edit).toHaveCount(0);await expect(src).toHaveValue(original);
 await expect.poll(()=>popups.length).toBeGreaterThan(0);for(const popup of popups){await popup.waitForLoadState();expect(popup.url()).toBe(link);await popup.close();}
 await line.getByRole('button',{name:'Copy link to this diagram step',exact:true}).dblclick();await expect(edit).toHaveCount(0);await expect(src).toHaveValue(original);
 await expect.poll(()=>page.evaluate(()=>window.__copied.length)).toBeGreaterThan(0);
 const copied=new URL(await page.evaluate(()=>window.__copied.at(-1)));expect(copied.origin+copied.pathname).toBe(server.origin+'/workbench.html');expect(new URLSearchParams(copied.hash.slice(1)).get('s')).toBe('start');
 // P2: Inspect's empty rule for step text removes the field.
 await page.locator('#editor-tab-steps').click();await page.locator('#steps-list [data-step-index="0"]').click();await page.locator('#editor-tab-inspect').click();
 await expect(stepText).toHaveValue('Start **first**');await stepText.fill('');await stepText.press('Tab');await expect(src).not.toHaveValue(original);
 const inspectCleared=await src.inputValue();expect(JSON.parse(inspectCleared).page.sections[0].diagram.steps[0]).not.toHaveProperty('text');
 await undo.click();await expect(src).toHaveValue(original);await closeTools(page);await expect(caption).toHaveText('Start first');
 // Row 3 (flip): double-click opens the Markdown editor in place, holding the current step's source text.
 await caption.dblclick();await expect(edit).toBeVisible();await expect(edit).toBeFocused();await expect(edit).toBeInViewport();
 await expect(edit).toHaveValue('Start **first**');await expect(draft.locator('strong')).toHaveText('first');await expect(src).toHaveValue(original);
 // Row 4: Escape cancels and writes nothing.
 await edit.pressSequentially(' discarded');await expect(edit).not.toHaveValue('Start **first**');await edit.press('Escape');
 await expect(edit).toHaveCount(0);await expect(src).toHaveValue(original);await expect(caption).toHaveText('Start first');
 // Row 5: clearing saves the same source as clearing Inspect -> text.
 await caption.dblclick();await expect(edit).toBeFocused();await edit.selectText();await edit.press('Backspace');await expect(edit).toHaveValue('');
 await edit.press('ControlOrMeta+Enter');await expect(edit).toHaveCount(0);await expect(src).toHaveValue(inspectCleared);
 await undo.click();await expect(src).toHaveValue(original);await expect(caption).toHaveText('Start first');
 // Row 6: Markdown draft, Enter adds a line, Ctrl/Cmd+Enter saves only steps[0].text.
 await caption.dblclick();await expect(edit).toBeFocused();await edit.selectText();await edit.pressSequentially('Edited `step`');await edit.press('Enter');await edit.pressSequentially('text');
 await expect(edit).toHaveValue('Edited `step`\ntext');await expect(draft.locator('code')).toHaveText('step');await expect(src).toHaveValue(original);
 await edit.press('ControlOrMeta+Enter');await expect(edit).toHaveCount(0);
 const saved=await src.inputValue(),want=stepFixture(explore,link);want.page.sections[0].diagram.steps[0].text='Edited `step`\ntext';expect(JSON.parse(saved)).toEqual(want);
 await expect(caption.locator('code')).toHaveText('step');await expect(caption.locator('strong')).toHaveCount(0);
 // Row 7: one save is one Undo entry; Redo reapplies it.
 await undo.click();await expect(src).toHaveValue(original);await expect(undo).toBeDisabled();await expect(caption.locator('strong')).toHaveText('first');
 await redo.click();await expect(src).toHaveValue(saved);await expect(caption.locator('code')).toHaveText('step');
 // Row 8: the shared step is one step; editing it on one path changes every path that uses it.
 await route('main').click();await next.click();await expect(stepN).toHaveText('STEP 2/2');await expect(caption).toHaveText('Both paths finish here');
 await caption.dblclick();await expect(edit).toBeFocused();await expect(edit).toHaveValue('Both paths finish here');await edit.selectText();await edit.pressSequentially('Both paths **changed**');
 await stepN.click();await expect(edit).toHaveCount(0);
 want.page.sections[0].diagram.steps[2].text='Both paths **changed**';expect(JSON.parse(await src.inputValue())).toEqual(want);
 await route('other').click();await expect(stepN).toHaveText('STEP 1/2');await expect(caption).toHaveText('Alternate start');
 await next.click();await expect(stepN).toHaveText('STEP 2/2');await expect(caption.locator('strong')).toHaveText('changed');await expect(caption).toHaveText('Both paths changed');
});
