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
/* #970 node rename by double-click (desktop Workbench; ticket "Test + flip", Chuck's coverage ruling
   2026-11-04: the Test + flip section as written). Hosted by "double-click renames a local node" below,
   once in Standard and once in Explore, and by the updated creation test. Fixture fixture(): node a
   {title:'Existing', sub:'Keep details'} in rows, no history after paste. The rename editor is the
   textbox "Node name" inside the node's own g.node; the creation editor is "New node title".
   Right-click / Shift+F10 -> Rename rows: node-alignment.spec.mjs. Imported nodes:
   topology-connections.spec.mjs.

   row | fixture / input | scoped assertion | rejects
   P1 contrast | paste | a .t1 'Existing', no "Node name" editor | -
   P2 Inspect empty rule | click a, Inspect Name cleared + Enter | parsed #src equals the fixture
      without nodes.a.title (ID key a kept) | (precondition for N6)
   N1 double-click the name opens in place (FLIP) | dblclick a .t1 | "Node name" editor inside g.node a,
      focused, value 'Existing', selection [0,8], box inside the card and over the name's vertical
      middle; no "New node title" editor; #src unchanged | no route (fails today); an editor opened
      in Inspect or elsewhere; the creation editor reused
   N2 accessible text | same | aria-description says "Enter or click outside saves" and "Escape
      cancels", not "Later changes use Inspect" | the creation entry's label/help reused
   N3 Escape writes nothing | type, Escape | editor gone; #src === original; .t1 'Existing' | Escape
      that saves
   N4 double-click the card body opens | dblclick .card at its right middle (away from the text) |
      "Node name" editor focused, value 'Existing' | a selector on the name text only, when Chuck
      ruled "double-clicking a node also renames it"
   N5 save, ID, selection, one Undo | dblclick, type, Enter | parsed #src equals the fixture with
      only nodes.a.title = 'Renamed node' (no new key, ID a kept); .t1 shows it; g.node a has dv-sel
      and is the only selected node; Undo: #src === original exactly, Undo disabled; Redo: saved |
      an ID rename; a write to sub or another node; a save recording two entries or none; a
      commit that drops the selection
   N6 empty value = Inspect | dblclick, type three spaces (replacing the selection), Enter | #src ===
      the P2 source exactly; .t1 shows the ID 'a'; Undo: original | the editor's raw-string save
      (JSON "   " or "")
   C1 creation editor keeps its name; double-click after creation renames (changed on purpose) |
      Add node (preset and canvas menu), Enter, Undo, Redo, dblclick the new node's .t1 | "New node
      title" at creation; afterwards "Node name" focused with 'New title' and no "New node title"
      editor; Escape; Inspect Name still edits the title | creation editor reopened for renames
   hosted elsewhere: a double-click that does not move a node, and dragging by the name, run on free
      nodes in node-alignment.spec.mjs (row node a here cannot move).
   excluded — §0 ruling ("the Test + flip section as written"): text-box nodes keep their own
      double-click editor (named only in "How it should look"; text-boxes.spec.mjs:14 stays green). */
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
for(const contextual of [false,true])test('new node '+(contextual?'canvas':'preset')+' title is direct at creation, then double-click renames it and Inspect still edits it',async({page,server},info)=>{
 await setup(page,server,true);
 if(contextual){
  const board=page.locator('#docview .board'),p=await board.evaluate(board=>{const r=board.getBoundingClientRect();for(let y=Math.min(r.bottom-20,innerHeight-20);y>r.top+20;y-=30)for(let x=Math.min(r.right-20,innerWidth-20);x>r.left+20;x-=30){const el=document.elementFromPoint(x,y);if(el&&board.contains(el)&&!el.closest('button,input,textarea,a,.explore-window,.explore-player,[data-dv-node],[data-dv-edge],[data-dv-group],[data-dv-row]'))return {x,y};}throw Error('No exposed background');});await page.mouse.click(p.x,p.y,{button:'right'});await page.getByRole('menuitem',{name:'Node',exact:true}).click();
 }else{await page.locator('#diagram-add').click();await page.locator('#add-node').click();await page.locator('#diagram-add-presets').getByRole('button',{name:'Console',exact:true}).click();}
 const edit=page.getByRole('textbox',{name:'New node title',exact:true});await expect(edit).toBeFocused();expect(await edit.evaluate(el=>[el.selectionStart,el.selectionEnd])).toEqual([0,(await edit.inputValue()).length]);const created=await page.locator('#src').inputValue();await page.screenshot({path:info.outputPath('new-node-title-'+(contextual?'canvas':'preset')+'.png')});
 await edit.pressSequentially('New title');await edit.press('Enter');await expect(edit).toHaveCount(0);let raw=JSON.parse(await page.locator('#src').inputValue()),id=Object.keys(raw.page.sections[0].diagram.nodes).find(id=>id!=='a');expect(raw.page.sections[0].diagram.nodes[id].title).toBe('New title');
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(created);await page.locator('#redo-builder').click();
 // C1 (changed on purpose, #970): double-click now opens the rename editor, never the creation editor.
 const node=page.locator('#docview [data-dv-node="'+id+'"]'),rename=node.getByRole('textbox',{name:'Node name',exact:true});await node.locator('.t1').dblclick();
 await expect(rename).toBeFocused();await expect(rename).toHaveValue('New title');await expect(edit).toHaveCount(0);await rename.press('Escape');await expect(rename).toHaveCount(0);
 await page.locator('#editor-tab-inspect').click();const title=page.locator('#guide').getByLabel('Name',{exact:true});await title.fill('Inspector title');await title.press('Enter');expect(JSON.parse(await page.locator('#src').inputValue()).page.sections[0].diagram.nodes[id].title).toBe('Inspector title');
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

for(const explore of [false,true])test('double-click renames a local node in place ('+(explore?'Explore':'Standard')+'): Node name editor, Escape, card body, one Undo, selection, empty rule',async({page,server})=>{
 const original=await setup(page,server,explore),src=page.locator('#src'),undo=page.locator('#undo-builder'),redo=page.locator('#redo-builder');
 const card=page.locator('#docview g.node[data-dv-node="a"]'),name=card.locator('.t1'),edit=card.getByRole('textbox',{name:'Node name',exact:true}),anyEdit=page.getByRole('textbox',{name:'Node name',exact:true});
 const want=title=>{const raw=fixture(explore),n=raw.page.sections[0].diagram.nodes.a;if(title==null)delete n.title;else n.title=title;return raw;};
 // P1: contrasting precondition.
 await expect(name).toHaveText('Existing');await expect(anyEdit).toHaveCount(0);await expect(undo).toBeDisabled();
 // P2: Inspect's empty rule for Name removes `title` and keeps the ID.
 await card.click();await page.locator('#editor-tab-inspect').click();const inspectName=page.locator('#guide').getByLabel('Name',{exact:true});
 await expect(inspectName).toHaveValue('Existing');await inspectName.fill('');await inspectName.press('Enter');await expect(src).not.toHaveValue(original);
 const inspectCleared=await src.inputValue();expect(JSON.parse(inspectCleared)).toEqual(want(null));
 await undo.click();await expect(src).toHaveValue(original);await expect(undo).toBeDisabled();await closeTools(page);await expect(name).toHaveText('Existing');
 // N1 (flip) + N2: double-click the name opens the single-line rename editor over it, all text selected.
 await name.dblclick();await expect(edit).toBeVisible();await expect(edit).toBeFocused();await expect(edit).toHaveValue('Existing');
 expect(await edit.evaluate(el=>[el.selectionStart,el.selectionEnd])).toEqual([0,'Existing'.length]);
 await expect(page.getByRole('textbox',{name:'New node title',exact:true})).toHaveCount(0);await expect(src).toHaveValue(original);
 const box=await edit.boundingBox(),cardBox=await card.locator('.card').boundingBox(),nameBox=await name.boundingBox();
 expect(box.x).toBeGreaterThanOrEqual(cardBox.x-1);expect(box.x+box.width).toBeLessThanOrEqual(cardBox.x+cardBox.width+1);
 expect(box.y).toBeGreaterThanOrEqual(cardBox.y-1);expect(box.y+box.height).toBeLessThanOrEqual(cardBox.y+cardBox.height+1);
 expect(box.y).toBeLessThanOrEqual(nameBox.y+nameBox.height/2);expect(box.y+box.height).toBeGreaterThanOrEqual(nameBox.y+nameBox.height/2);
 await expect(edit).toHaveAttribute('aria-description',/Enter or click outside saves/);await expect(edit).toHaveAttribute('aria-description',/Escape cancels/);
 await expect(edit).not.toHaveAttribute('aria-description',/Later changes use Inspect/);
 // N3: Escape cancels and writes nothing.
 await edit.pressSequentially('Discarded');await expect(edit).toHaveValue('Discarded');await edit.press('Escape');
 await expect(anyEdit).toHaveCount(0);await expect(src).toHaveValue(original);await expect(name).toHaveText('Existing');
 // N4: double-clicking the card body, away from the name text, also renames the node.
 const body=await card.locator('.card').boundingBox();await card.locator('.card').dblclick({position:{x:body.width-12,y:body.height/2}});
 await expect(edit).toBeFocused();await expect(edit).toHaveValue('Existing');await edit.press('Escape');await expect(anyEdit).toHaveCount(0);await expect(src).toHaveValue(original);
 // N5: Enter saves only nodes.a.title; the ID stays, the node stays selected, one Undo entry.
 await name.dblclick();await expect(edit).toBeFocused();await edit.pressSequentially('Renamed node');await edit.press('Enter');await expect(anyEdit).toHaveCount(0);
 const saved=await src.inputValue();expect(JSON.parse(saved)).toEqual(want('Renamed node'));
 await expect(name).toHaveText('Renamed node');await expect(card).toHaveClass(/dv-sel/);await expect(page.locator('#docview g.node.dv-sel')).toHaveCount(1);
 await undo.click();await expect(src).toHaveValue(original);await expect(undo).toBeDisabled();await expect(name).toHaveText('Existing');
 await redo.click();await expect(src).toHaveValue(saved);await undo.click();await expect(src).toHaveValue(original);
 // N6: a whitespace-only name saves the same source as clearing Inspect -> Name.
 await name.dblclick();await expect(edit).toBeFocused();await edit.pressSequentially('   ');await expect(edit).toHaveValue('   ');await edit.press('Enter');
 await expect(anyEdit).toHaveCount(0);await expect(src).toHaveValue(inspectCleared);await expect(name).toHaveText('a');
 await undo.click();await expect(src).toHaveValue(original);await expect(name).toHaveText('Existing');
});

// #963 desktop panel titles: real Standard title / Explore grip double-clicks,
// raw title (not ID fallback), Inspect empty parity, exact history, and unchanged
// panel content. Home map deliberately exercises a panel with a clickTarget hook.
function panelTitleFixture(explore=false,titled=true,homeMap=false){
 const home=homeMap?{id:'home',type:'homemap',outline:{w:300,h:164},rooms:[],devices:[]}:{id:'home',type:'state',states:['Ready'],initial:{state:'Ready'}};
 if(titled)home.title='Shared home';
 return {page:{title:'Panel titles',sections:[{heading:'Panel section',diagram:{autoplay:false,
  nodes:{a:{title:'Actor'}},rows:[['a']],panels:[home],steps:[{text:'At home',nodes:['a']}],
  layouts:[{id:'main',name:'Main',presentation:explore?'explore':'standard',
   sectionLayout:{default:[{x:0,y:0,w:7,h:12},{panel:'home',x:7,y:0,w:5,h:12}]},
   exploreLayout:{panelPlacement:'floating',panels:[{panel:'home',x:.3,y:.1,w:.45,h:.6,stacked:false}]}}],defaultLayout:'main'}}]}};
}
const panelTitleSurface=(page,explore)=>page.locator(explore?'#docview [data-explore-panel="home"] > .explore-window-header > .explore-window-grip':'#docview .pwidget[data-dv-panel="0"] > .ptitle');
const panelTitleInput=page=>page.locator('#docview').getByRole('textbox',{name:'Panel title',exact:true});
async function setupPanelTitle(page,server,explore=false,titled=true,homeMap=false){
 await page.setViewportSize({width:1280,height:900});await page.goto(server.origin+'/workbench.html');
 const original=JSON.stringify(panelTitleFixture(explore,titled,homeMap),null,2);await pastePage(page,original);await closeTools(page);return original;
}
function withPanelTitle(source,title){
 const raw=JSON.parse(source),panel=raw.page.sections[0].diagram.panels[0];
 if(title==null)delete panel.title;else panel.title=title;return raw;
}
for(const explore of [false,true])test('panel title '+(explore?'Explore grip':'Standard')+' edits in place: selection, Escape, Enter, click outside, empty parity and one Undo',async({page,server})=>{
 const original=await setupPanelTitle(page,server,explore),src=page.locator('#src'),undo=page.locator('#undo-builder'),redo=page.locator('#redo-builder');
 const title=panelTitleSurface(page,explore),edit=panelTitleInput(page),card=page.locator('#docview .pwidget[data-dv-panel="0"]');
 await expect(title).toBeVisible();await expect(title).toHaveText('Shared home');await expect(edit).toHaveCount(0);
 // Single click selects the panel and never opens a draft.
 await title.click();await expect(edit).toHaveCount(0);await expect(src).toHaveValue(original);
 await page.locator('#editor-tab-inspect').click();
 const inspectTitle=page.locator('#guide').getByRole('textbox',{name:'Title',exact:true});
 await expect(inspectTitle).toHaveValue('Shared home');
 // Inspect defines the empty rule; the inline editor must produce identical bytes.
 await inspectTitle.fill('');await inspectTitle.press('Enter');await expect(src).not.toHaveValue(original);
 const cleared=await src.inputValue();expect(JSON.parse(cleared)).toEqual(withPanelTitle(original,null));
 if(explore)await expect(title).toHaveText('home');else await expect(title).toHaveCount(0);
 await undo.click();await expect(src).toHaveValue(original);await closeTools(page);
 const spot=await title.boundingBox();
 await title.dblclick();await expect(edit).toBeVisible();await expect(edit).toBeFocused();await expect(edit).toHaveValue('Shared home');
 expect(await edit.evaluate(el=>[el.selectionStart,el.selectionEnd])).toEqual([0,'Shared home'.length]);
 const box=await edit.boundingBox(),cx=spot.x+spot.width/2,cy=spot.y+spot.height/2;
 expect(box.x<=cx && cx<=box.x+box.width && box.y<=cy && cy<=box.y+box.height,'editor covers the title').toBe(true);
 await expect(src).toHaveValue(original);await expect(edit).toHaveAttribute('aria-description',/Enter or click outside saves.*Escape cancels/);
 // A sibling input avoids nesting an interactive control inside the grip button.
 expect(await edit.evaluate(el=>!!el.closest('button'))).toBe(false);
 await edit.pressSequentially('Discarded');await edit.press('Escape');await expect(edit).toHaveCount(0);
 await expect(src).toHaveValue(original);await expect(title).toBeVisible();await expect(title).toHaveText('Shared home');
 await expect(page.locator('#docview .dv-inline-html-mount')).toHaveCount(0);
 // Enter changes just the title; one Undo restores exact source and Redo reapplies it.
 await title.dblclick();await expect(edit).toBeFocused();await edit.pressSequentially('  Revised home  ');await edit.press('Enter');await expect(edit).toHaveCount(0);
 const saved=await src.inputValue();expect(JSON.parse(saved)).toEqual(withPanelTitle(original,'Revised home'));await expect(title).toHaveText('Revised home');
 await undo.click();await expect(src).toHaveValue(original);await expect(undo).toBeDisabled();await expect(title).toHaveText('Shared home');
 await redo.click();await expect(src).toHaveValue(saved);await expect(title).toHaveText('Revised home');await undo.click();await expect(src).toHaveValue(original);
 // Clicking a different selection saves the draft once.
 await title.dblclick();await expect(edit).toBeFocused();await edit.pressSequentially('Clicked away');
 await page.locator('#docview .sec-h').click();await expect(edit).toHaveCount(0);expect(JSON.parse(await src.inputValue())).toEqual(withPanelTitle(original,'Clicked away'));
 await expect(title).toHaveText('Clicked away');await undo.click();await expect(src).toHaveValue(original);
 await title.dblclick();await expect(edit).toBeFocused();await edit.pressSequentially('   ');await edit.press('Enter');await expect(edit).toHaveCount(0);
 await expect(src).toHaveValue(cleared);
 if(explore)await expect(title).toHaveText('home');else await expect(card.locator(':scope > .ptitle')).toHaveCount(0);
 await undo.click();await expect(src).toHaveValue(original);await expect(title).toHaveText('Shared home');
});

test('untitled Explore panel opens an empty title draft and grip dragging moves only the window',async({page,server})=>{
 const original=await setupPanelTitle(page,server,true,false),src=page.locator('#src'),undo=page.locator('#undo-builder');
 const title=panelTitleSurface(page,true),edit=panelTitleInput(page),window=page.locator('#docview [data-explore-panel="home"]');
 await expect(title).toHaveText('home');await title.dblclick();await expect(edit).toBeFocused();await expect(edit).toHaveValue('');await expect(src).toHaveValue(original);
 await edit.pressSequentially('New home title');await edit.press('Enter');await expect(edit).toHaveCount(0);
 const saved=await src.inputValue();expect(JSON.parse(saved)).toEqual(withPanelTitle(original,'New home title'));await expect(title).toHaveText('New home title');
 await undo.click();await expect(src).toHaveValue(original);await expect(title).toHaveText('home');
 await page.locator('#redo-builder').click();await expect(src).toHaveValue(saved);await expect(title).toHaveText('New home title');
 const before=await window.boundingBox(),grip=await title.boundingBox();
 await page.mouse.move(grip.x+30,grip.y+grip.height/2);await page.mouse.down();await page.mouse.move(grip.x+100,grip.y+grip.height/2+35,{steps:8});await page.mouse.up();
 await expect(edit).toHaveCount(0);await expect(src).not.toHaveValue(saved);
 const after=await window.boundingBox();expect(after.x-before.x).toBeGreaterThan(40);expect(after.y-before.y).toBeGreaterThan(15);
 const moved=JSON.parse(await src.inputValue()),prior=JSON.parse(saved);
 expect(moved.page.sections[0].diagram.panels).toEqual(prior.page.sections[0].diagram.panels);
 // Geometry may change only the active Explore layout, never panel content or identity.
 const movedLayout=moved.page.sections[0].diagram.layouts[0].exploreLayout;
 prior.page.sections[0].diagram.layouts[0].exploreLayout=movedLayout;expect(moved).toEqual(prior);
 await expect(title).toHaveText('New home title');await undo.click();await expect(src).toHaveValue(saved);
});

test('untitled Standard panel still adds its title through Inspect',async({page,server})=>{
 const original=await setupPanelTitle(page,server,false,false),src=page.locator('#src'),card=page.locator('#docview .pwidget[data-dv-panel="0"]');
 await expect(card.locator(':scope > .ptitle')).toHaveCount(0);await expect(panelTitleInput(page)).toHaveCount(0);
 await inspectPageElement(page,card);const field=page.locator('#guide').getByRole('textbox',{name:'Title',exact:true});
 await expect(field).toHaveValue('');await field.fill('Inspector title');await field.press('Enter');
 expect(JSON.parse(await src.inputValue())).toEqual(withPanelTitle(original,'Inspector title'));await expect(panelTitleSurface(page,false)).toHaveText('Inspector title');
 await page.locator('#undo-builder').click();await expect(src).toHaveValue(original);await expect(card.locator(':scope > .ptitle')).toHaveCount(0);
});

test('Home map title resolves to the panel and keeps its layout control alive while editing',async({page,server})=>{
 const original=await setupPanelTitle(page,server,false,true,true),src=page.locator('#src'),title=panelTitleSurface(page,false),edit=panelTitleInput(page);
 const layout=title.getByRole('button',{name:'Edit home layout',exact:true}),held=await layout.elementHandle();
 // The title includes a child button; target the actual text, not the full bar's centre.
 const at=await title.evaluate(el=>{const range=document.createRange();range.selectNodeContents(el.firstChild);const r=range.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};});
 await page.mouse.dblclick(at.x,at.y);await expect(edit).toBeFocused();await expect(edit).toHaveValue('Shared home');
 const box=await edit.boundingBox();expect(at.x).toBeGreaterThanOrEqual(box.x);expect(at.x).toBeLessThanOrEqual(box.x+box.width);
 expect(at.y).toBeGreaterThanOrEqual(box.y);expect(at.y).toBeLessThanOrEqual(box.y+box.height);
 await expect(layout).toBeVisible();expect(await held.evaluate(el=>el.isConnected)).toBe(true);
 await edit.pressSequentially('Revised map');await edit.press('Enter');await expect(edit).toHaveCount(0);
 expect(JSON.parse(await src.inputValue())).toEqual(withPanelTitle(original,'Revised map'));await expect(title).toContainText('Revised map');await expect(layout).toBeVisible();
 await page.locator('#undo-builder').click();await expect(src).toHaveValue(original);
 // The title's control keeps its action; double-click never opens a title draft.
 await layout.dblclick();await expect(edit).toHaveCount(0);await expect(src).toHaveValue(original);
});

test('panel title source replacement drops the draft and removes its temporary HTML host',async({page,server})=>{
 const original=await setupPanelTitle(page,server,true),src=page.locator('#src'),title=panelTitleSurface(page,true),edit=panelTitleInput(page);
 await title.dblclick();await expect(edit).toBeFocused();await edit.pressSequentially('Stale draft');const held=await edit.elementHandle();
 const changed=original.replace('Shared home','Replacement');
 await page.evaluate(text=>{const src=document.querySelector('#src');src.value=text;src.dispatchEvent(new Event('input',{bubbles:true}));},changed);
 await expect(edit).toHaveCount(0);await expect(title).toBeVisible();await expect(page.locator('#docview .dv-inline-html-mount')).toHaveCount(0);
 await held.evaluate(el=>el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})));
 await expect(src).toHaveValue(changed);
});
