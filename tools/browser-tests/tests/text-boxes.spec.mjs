import {test,expect,pastePage,closeTools} from '../helpers/test.mjs';
import {editorSpec} from '../fixtures/editor-spec.mjs';
import {readFile} from 'node:fs/promises';
const source=page=>page.locator('#src').inputValue();
function fixture(){const raw=editorSpec(),d=raw.page.blocks[0].diagram;const standard={...structuredClone(d.layouts[0]),id:'standard-text',name:'Standard text',presentation:'standard'};d.layouts=[standard,{...structuredClone(standard),id:'explore-text',name:'Explore text',presentation:'explore'}];d.defaultLayout='standard-text';return raw;}
const box=page=>page.locator('#docview [data-dv-text-box]').first();
test('Add text, native editing, inspector formatting, resize, undo and Explore',async({page,server},testInfo)=>{
  await page.goto(server.origin+'/workbench.html');const original=JSON.stringify(fixture(),null,2);await pastePage(page,original);await closeTools(page);
  await page.locator('#diagram-add').click();await page.locator('#add-text-box').click();await expect(box(page)).toBeVisible();
  const revealed=await box(page).evaluate(el=>{const handle=el.querySelector('.dv-text-resize').getBoundingClientRect(),board=el.closest('.board').getBoundingClientRect();return handle.left>=board.left && handle.right<=board.right && handle.top>=board.top && handle.bottom<=board.bottom;});expect(revealed).toBe(true);
  const addedDiagram=JSON.parse(await source(page)).page.blocks[0].diagram,originalDiagram=JSON.parse(original).page.blocks[0].diagram;
  for(const id of Object.keys(originalDiagram.nodes))expect(addedDiagram.nodes[id]).toEqual(originalDiagram.nodes[id]);expect(addedDiagram.rows).toEqual(originalDiagram.rows);expect(addedDiagram.edges).toEqual(originalDiagram.edges);
  const added=await source(page);await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(added);
  await box(page).dblclick();const edit=page.getByRole('textbox',{name:'Edit text box',exact:true});await expect(edit).toBeFocused();
  await edit.fill('  Hello <world>\nSecond line  ');await edit.press('Control+Enter');await expect(edit).toHaveCount(0);
  const typed=await source(page);expect(typed).not.toBe(added);await expect(box(page)).toContainText('Hello <world>');
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(added);await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(typed);
  await box(page).focus();await box(page).press('Enter');await expect(edit).toBeFocused();await edit.fill('Cancelled');await edit.press('Escape');await expect(page.locator('#src')).toHaveValue(typed);
  await box(page).click();await page.locator('#editor-tab-inspect').click();const guide=page.locator('#guide');
  await guide.getByLabel('Font',{exact:true}).selectOption('Lora');await guide.getByLabel('Font size',{exact:true}).fill('30');await guide.getByLabel('Font size',{exact:true}).press('Enter');
  await guide.getByLabel('Bold',{exact:true}).check();await guide.getByLabel('Italic',{exact:true}).check();await guide.getByLabel('Underline',{exact:true}).check();await guide.getByLabel('Alignment',{exact:true}).selectOption('center');
  await guide.getByLabel('Color',{exact:true}).fill('#884422');await guide.getByLabel('Color',{exact:true}).press('Enter');
  await expect(guide.getByLabel('Choose color',{exact:true})).toHaveValue('#884422');
  await expect(box(page).locator('text')).toHaveCSS('font-family','Lora');await expect(box(page).locator('text')).toHaveCSS('font-size','30px');await expect(box(page).locator('text')).toHaveCSS('fill','rgb(136, 68, 34)');
  await page.screenshot({path:testInfo.outputPath('text-box-formatting.png'),fullPage:true});
  const formatted=await source(page);await closeTools(page);await box(page).click();const handle=box(page).locator('.dv-text-resize');await expect(handle).toBeVisible();const h=await handle.boundingBox();
  await page.mouse.move(h.x+h.width/2,h.y+h.height/2);await page.mouse.down();await page.mouse.move(h.x+h.width/2+80,h.y+h.height/2+50,{steps:8});await page.mouse.up();
  await expect.poll(()=>source(page)).not.toBe(formatted);const resized=await source(page);await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(formatted);await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(resized);
  const beforeMove=await source(page),bounds=await box(page).boundingBox();await page.mouse.move(bounds.x+20,bounds.y+20);await page.mouse.down();await page.mouse.move(bounds.x+90,bounds.y+70,{steps:8});await page.mouse.up();await expect.poll(()=>source(page)).not.toBe(beforeMove);
  const moved=await source(page);await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(beforeMove);await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(moved);
  await page.locator('#docview > .explore-navigation').getByRole('button',{name:'Explore text',exact:true}).click();await expect(page.locator('.viewport-explore [data-dv-text-box]')).toBeVisible();
  await box(page).dblclick();await edit.fill('Explore edit\nNative textarea');await edit.press('Control+Enter');await expect(box(page)).toContainText('Explore edit');
  await page.screenshot({path:testInfo.outputPath('text-box-explore.png'),fullPage:true});
});
test('text exports retain formatting, escape markup, omit editing chrome and reopen as ordinary nodes',async({page,server},info)=>{
  await page.goto(server.origin+'/workbench.html');const raw=fixture(),d=raw.page.blocks[0].diagram;
  d.nodes.note={type:'text',text:'<script> is just text\nA second line',locked:true,textStyle:{fontFamily:'Lora',fontSize:30,width:500,color:'#884422',bold:true,italic:true,underline:true,align:'center'}};d.floats=[{id:'note',x:420,y:150,side:'below'}];
  await pastePage(page,JSON.stringify(raw));await closeTools(page);await box(page).click();await expect(box(page).locator('.dv-text-resize')).toHaveCount(1);
  const download=page.waitForEvent('download');await page.locator('#workspace-export-trigger').click();await page.locator('#file-export-svg').click();const file=await download,svg=await readFile(await file.path(),'utf8');
  expect(svg).toContain('&lt;script&gt;');expect(svg).toContain('font-family:Lora');expect(svg).toContain('font-size:30px');expect(svg).toContain('fill:rgb(136, 68, 34)');expect(svg).toContain('text-decoration:underline');expect(svg).not.toMatch(/dv-text-toolbar|dv-text-resize|foreignObject|<script|text-box-hit|dv-position-lock|Position locked|data-dv-position-locked/);
  const reader=await page.context().newPage();await reader.goto('data:image/svg+xml;base64,'+Buffer.from(svg).toString('base64'));await expect(reader.getByText('<script> is just text')).toBeVisible();await info.attach('text-svg',{body:await reader.screenshot(),contentType:'image/png'});await reader.close();
});
test('locked text resize changes dimensions while preserving center, with one Undo',async({page,server})=>{
  await page.goto(server.origin+'/workbench.html');const raw=fixture(),d=raw.page.blocks[0].diagram;
  d.nodes.note={type:'text',text:'Pinned center',locked:true,textStyle:{width:280,height:80}};d.rows=[['b','c']];d.floats=[{id:'note',x:420,y:150,side:'below'},{id:'a',x:160,y:320,side:'below',noSpread:true}];const original=JSON.stringify(raw);
  await pastePage(page,original);await closeTools(page);await box(page).click();await page.locator('#editor-tab-inspect').click();await expect(page.locator('#guide').getByLabel('Position lock',{exact:true})).toBeChecked();await closeTools(page);await expect(box(page).locator('.dv-position-lock-badge')).toHaveAccessibleName('Position locked');
  const ordinary=page.locator('#docview [data-dv-node="a"]'),ordinaryBefore=JSON.parse(original).page.blocks[0].diagram;await ordinary.click({modifiers:['Shift']});await expect(page.locator('#docview .dv-sel[data-dv-node]')).toHaveCount(2);
  const card=await ordinary.locator('.card').boundingBox();await page.mouse.move(card.x+card.width/2,card.y+card.height/2);await page.mouse.down();await page.mouse.move(card.x+card.width/2+70,card.y+card.height/2+45,{steps:8});await page.mouse.up();
  const mixed=JSON.parse(await source(page)).page.blocks[0].diagram,oldA=ordinaryBefore.floats.find(f=>f.id==='a'),newA=mixed.floats.find(f=>f.id==='a'),newNote=mixed.floats.find(f=>f.id==='note');expect({x:newNote.x,y:newNote.y}).toEqual({x:d.floats[0].x,y:d.floats[0].y});expect(newA.x).toBeGreaterThan(oldA.x);expect(newA.y).toBeGreaterThan(oldA.y);expect(mixed.nodes.note.locked).toBe(true);expect(ordinaryBefore.nodes.a.locked).toBeUndefined();
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);await box(page).click();const h=await box(page).locator('.dv-text-resize').boundingBox();await page.mouse.move(h.x+5,h.y+5);await page.mouse.down();await page.mouse.move(h.x+65,h.y+45,{steps:6});await page.mouse.up();
  await expect.poll(()=>source(page)).not.toBe(original);const after=JSON.parse(await source(page)).page.blocks[0].diagram;expect(after.floats).toEqual(d.floats);expect(after.nodes.note.textStyle.width).toBeGreaterThan(280);await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);await expect(page.locator('#undo-builder')).toBeDisabled();
});
test('source replacement and builder destroy retire active text editing without late publication',async({page,server})=>{
  await page.goto(server.origin+'/lifetime/index.html');const raw=fixture(),d=raw.page.blocks[0].diagram;d.nodes.note={type:'text',text:'Original',textStyle:{width:280,fontSize:24}};d.floats=[{id:'note',x:400,y:120,side:'below'}];
  await pastePage(page,JSON.stringify(raw));await closeTools(page);await box(page).dblclick();await page.getByRole('textbox',{name:'Edit text box',exact:true}).fill('Unsaved');const before=await source(page);
  await page.evaluate(()=>__editorTest.builder.destroy());await expect(page.getByRole('textbox',{name:'Edit text box',exact:true})).toHaveCount(0);await expect(page.locator('#src')).toHaveValue(before);
});
test('annotations remain legible outside step focus but authored hidden diagram views still hide them',async({page,server})=>{
  await page.goto(server.origin+'/workbench.html');const raw=fixture(),d=raw.page.blocks[0].diagram;
  d.nodes.note={type:'text',text:'Always readable annotation'};d.floats=[{id:'note',x:420,y:150,side:'below'}];
  const hidden=structuredClone(d.layouts[0]);hidden.id='hidden-text';hidden.name='Hidden graph';hidden.sectionLayout.default[0].hidden=true;d.layouts.push(hidden);
  await pastePage(page,JSON.stringify(raw));await closeTools(page);await expect(box(page)).toBeVisible();await expect(box(page)).not.toHaveClass(/\blit\b/);await expect(box(page)).toHaveCSS('opacity','1');
  await page.locator('#docview > .explore-navigation').getByRole('button',{name:'Hidden graph',exact:true}).click();await expect(box(page)).not.toBeVisible();
  await page.locator('#docview > .explore-navigation').getByRole('button',{name:'Standard text',exact:true}).click();await expect(box(page)).toBeVisible();await expect(box(page)).toContainText('Always readable annotation');
});
for(const locked of [false,true])test('narrow text resize preserves '+(locked?'locked center':'opposite corner')+' and previews actual wrapped bounds',async({page,server})=>{
  await page.goto(server.origin+'/workbench.html');const raw=fixture(),d=raw.page.blocks[0].diagram;
  d.nodes.note={type:'text',text:'one two three four five six seven eight nine ten',locked,textStyle:{width:280,fontSize:24}};d.floats=[{id:'note',x:600,y:200,side:'below'}];const original=JSON.stringify(raw);
  await pastePage(page,original);await closeTools(page);await box(page).click();
  const bounds=()=>box(page).evaluate(el=>{const r=el.querySelector('.text-box-hit'),m=el.transform.baseVal.consolidate().matrix;return {x:m.e,y:m.f,w:Number(r.getAttribute('width')),h:Number(r.getAttribute('height')),scale:el.ownerSVGElement.getScreenCTM().a};});
  const before=await bounds(),handle=await box(page).locator('.dv-text-resize').boundingBox();
  await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();await page.mouse.move(handle.x+handle.width/2-200*before.scale,handle.y+handle.height/2,{steps:8});
  const preview=await page.locator('.dv-text-resize-preview').evaluate(el=>Object.fromEntries(['x','y','width','height'].map(k=>[k,Number(el.getAttribute(k))])));expect(preview.width).toBe(80);expect(preview.height).toBeGreaterThan(before.h);
  await page.mouse.up();const after=await bounds();expect(after.w).toBe(preview.width);expect(after.h).toBe(preview.height);expect(after.x).toBeCloseTo(preview.x,4);expect(after.y).toBeCloseTo(preview.y,4);
  if(locked){expect(after.x+after.w/2).toBeCloseTo(before.x+before.w/2,4);expect(after.y+after.h/2).toBeCloseTo(before.y+before.h/2,4);}else{expect(after.x).toBeCloseTo(before.x,4);expect(after.y).toBeCloseTo(before.y,4);}
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);await expect(page.locator('#undo-builder')).toBeDisabled();
});
test('clearing text color restores the theme in one Undo',async({page,server})=>{
  await page.goto(server.origin+'/workbench.html');const raw=fixture(),d=raw.page.blocks[0].diagram;
  d.nodes.note={type:'text',text:'Theme color',textStyle:{color:'#884422'}};d.floats=[{id:'note',x:600,y:160,side:'below'}];const original=JSON.stringify(raw);
  await pastePage(page,original);await closeTools(page);await box(page).click();await page.locator('#editor-tab-inspect').click();
  const color=page.locator('#guide').getByLabel('Color',{exact:true});await color.fill('');await color.press('Enter');
  await expect.poll(async()=>JSON.parse(await source(page)).page.blocks[0].diagram.nodes.note.textStyle.color).toBeUndefined();await expect(box(page).locator('text')).not.toHaveCSS('fill','rgb(136, 68, 34)');
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);
  await box(page).click();await page.locator('#editor-tab-inspect').click();
  const picker=page.locator('#guide').getByLabel('Choose color',{exact:true});await picker.fill('#227755');await picker.dispatchEvent('change');
  await expect(page.locator('#guide').getByLabel('Color',{exact:true})).toHaveValue('#227755');
  await expect(box(page).locator('text')).toHaveCSS('fill','rgb(34, 119, 85)');
});

for(const inspect of [false,true])test('Escape owns the active text edit with Inspect '+(inspect?'open':'closed'),async({page,server})=>{
  await page.goto(server.origin+'/workbench.html');const raw=fixture(),d=raw.page.blocks[0].diagram;
  d.nodes.note={type:'text',text:'Original',locked:true,textStyle:{width:280,fontSize:24}};d.floats=[{id:'note',x:550,y:120,side:'below'}];const original=JSON.stringify(raw);
  await pastePage(page,original);await closeTools(page);await box(page).click();if(inspect)await page.locator('#editor-tab-inspect').click();
  await box(page).dblclick();const edit=page.getByRole('textbox',{name:'Edit text box',exact:true});await expect(edit).toBeFocused();await edit.fill('Cancelled text');await edit.press('Escape');
  await expect(edit).toHaveCount(0);await expect(box(page)).toBeFocused();await expect(box(page)).toHaveClass(/dv-sel/);await expect(page.locator('#src')).toHaveValue(original);
});

test('clicking blank canvas finishes text with Inspect closed and one Undo',async({page,server})=>{
  await page.goto(server.origin+'/workbench.html');const raw=fixture(),d=raw.page.blocks[0].diagram;
  d.nodes.note={type:'text',text:'Original',textStyle:{width:280,fontSize:24}};d.floats=[{id:'note',x:550,y:120,side:'below'}];const original=JSON.stringify(raw);
  await pastePage(page,original);await closeTools(page);await box(page).dblclick();const edit=page.getByRole('textbox',{name:'Edit text box',exact:true});await edit.fill('Click outside commits');
  const surface=page.locator('#docview .section-viewport').first();const r=await surface.boundingBox();await page.mouse.click(r.x+r.width-30,r.y+r.height-30);
  await expect(edit).toHaveCount(0);await expect.poll(async()=>JSON.parse(await source(page)).page.blocks[0].diagram.nodes.note.text).toBe('Click outside commits');const changed=await source(page);
  await page.locator('#docview [data-dv-node="a"]').click();await expect(page.locator('#docview [data-dv-node="a"]')).toHaveClass(/dv-sel/);
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);await expect(page.locator('#undo-builder')).toBeDisabled();await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(changed);
  const canvas=page.locator('#docview .boardcanvas').first(),board=page.locator('#docview .board').first(),bounds=await canvas.boundingBox();await page.mouse.move(bounds.x+5,bounds.y+5);await page.mouse.down();await expect(board).toHaveClass(/board-dragging/);await page.mouse.move(bounds.x+25,bounds.y+25,{steps:4});await page.mouse.up();await expect(board).not.toHaveClass(/board-dragging/);await expect(page.locator('#src')).toHaveValue(changed);
});

test('toolbar preserves text selection, batches formatting and text, and matches Inspect',async({page,server},info)=>{
  await page.setViewportSize({width:1366,height:900});await page.goto(server.origin+'/workbench.html');const raw=fixture(),d=raw.page.blocks[0].diagram;
  d.nodes.note={type:'text',text:'Original',locked:true,textStyle:{width:280,fontSize:24,color:'#884422',underline:true}};d.floats=[{id:'note',x:550,y:120,side:'below'}];const original=JSON.stringify(raw);
  await pastePage(page,original);await closeTools(page);await box(page).click();const toolbar=page.getByRole('toolbar',{name:'Text formatting'}),edit=page.getByRole('textbox',{name:'Edit text box',exact:true});await expect(toolbar).toBeVisible();await expect(toolbar.getByLabel('Font size',{exact:true})).toHaveValue('24');
  await box(page).dblclick();await edit.fill('New annotation');await edit.press('Home');await edit.press('ArrowRight');await edit.press('Shift+ArrowRight');
  const caret=await edit.evaluate(el=>[el.selectionStart,el.selectionEnd]);await toolbar.getByRole('button',{name:'Bold',exact:true}).click();await expect(edit).toBeFocused();expect(await edit.evaluate(el=>[el.selectionStart,el.selectionEnd])).toEqual(caret);await expect(edit).toHaveCSS('font-weight','700');
  await edit.press('Tab');await expect(toolbar.getByLabel('Font',{exact:true})).toBeFocused();await toolbar.getByLabel('Font',{exact:true}).selectOption('Lora');await expect(edit).toBeFocused();expect(await edit.evaluate(el=>[el.selectionStart,el.selectionEnd])).toEqual(caret);
  const size=toolbar.getByLabel('Font size',{exact:true});await size.fill('30');await size.press('Enter');await expect(edit).toBeFocused();await toolbar.getByRole('button',{name:'Italic',exact:true}).click();await expect(edit).toHaveCSS('font-size','30px');await expect(edit).toHaveCSS('font-style','italic');await expect(page.locator('#src')).toHaveValue(original);
  const bounds=await toolbar.boundingBox(),textBounds=await edit.boundingBox();expect(bounds.width).toBeLessThan(460);expect(bounds.y+bounds.height<=textBounds.y || bounds.y>=textBounds.y+textBounds.height).toBe(true);await page.screenshot({path:info.outputPath('text-toolbar-desktop.png')});
  // Document-capture canvas handlers must not process composition keys.
  await edit.dispatchEvent('compositionstart');await edit.dispatchEvent('keydown',{key:'Escape',isComposing:true});await edit.dispatchEvent('keydown',{key:'Enter',ctrlKey:true,isComposing:true});await expect(edit).toBeFocused();await expect(box(page)).toHaveClass(/dv-sel/);await edit.dispatchEvent('compositionend');
  await edit.press('Control+Enter');await expect(edit).toHaveCount(0);const committed=await source(page),node=JSON.parse(committed).page.blocks[0].diagram.nodes.note;expect(node.text).toBe('New annotation');expect(node.textStyle).toMatchObject({fontFamily:'Lora',fontSize:30,bold:true,italic:true,color:'#884422',underline:true});expect(node.locked).toBe(true);
  await page.locator('#editor-tab-inspect').click();const guide=page.locator('#guide');await expect(guide.getByLabel('Font',{exact:true})).toHaveValue('Lora');await expect(guide.getByLabel('Bold',{exact:true})).toBeChecked();await expect(guide.getByLabel('Italic',{exact:true})).toBeChecked();await expect(guide.getByLabel('Font size',{exact:true})).toHaveValue('30');
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);await expect(page.locator('#undo-builder')).toBeDisabled();await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(committed);
  await closeTools(page);await box(page).dblclick();await edit.fill('Cancel all');await toolbar.getByRole('button',{name:'Bold',exact:true}).click();await toolbar.getByLabel('Font size',{exact:true}).focus();await page.keyboard.press('Escape');await expect(edit).toHaveCount(0);await expect(box(page)).toBeFocused();await expect(page.locator('#src')).toHaveValue(committed);
});

test('outside object and closing Inspect finish edits; toolbar keeps the edit internal',async({page,server})=>{
  await page.goto(server.origin+'/workbench.html');const raw=fixture(),d=raw.page.blocks[0].diagram;d.nodes.note={type:'text',text:'Original'};d.floats=[{id:'note',x:550,y:120,side:'below'}];await pastePage(page,JSON.stringify(raw));await closeTools(page);
  const edit=page.getByRole('textbox',{name:'Edit text box',exact:true}),other=page.locator('#docview [data-dv-node="a"]');
  await box(page).dblclick();await edit.fill('Object click');await other.click();await expect(edit).toHaveCount(0);await expect(other).toHaveClass(/dv-sel/);expect(JSON.parse(await source(page)).page.blocks[0].diagram.nodes.note.text).toBe('Object click');
  await box(page).click();await page.locator('#editor-tab-inspect').click();await box(page).dblclick();await edit.fill('Closed during edit');await page.locator('#workspace-window-inspect .workspace-window-close').click();await expect(edit).toHaveCount(0);expect(JSON.parse(await source(page)).page.blocks[0].diagram.nodes.note.text).toBe('Closed during edit');
  await box(page).dblclick();await edit.fill('After closing Inspect');await edit.press('Escape');await expect(edit).toHaveCount(0);expect(JSON.parse(await source(page)).page.blocks[0].diagram.nodes.note.text).toBe('Closed during edit');
  await box(page).dblclick();await edit.fill('After closing saved');await other.click();await expect(edit).toHaveCount(0);expect(JSON.parse(await source(page)).page.blocks[0].diagram.nodes.note.text).toBe('After closing saved');
});

test('selected-box formatting is undoable and toolbar follows desktop canvas zoom',async({page,server},info)=>{
  await page.setViewportSize({width:1280,height:800});await page.goto(server.origin+'/workbench.html');const raw=fixture(),d=raw.page.blocks[0].diagram;d.nodes.note={type:'text',text:'Zoomed annotation'};d.floats=[{id:'note',x:550,y:120,side:'below'}];const original=JSON.stringify(raw);await pastePage(page,original);await closeTools(page);await box(page).click();
  const toolbar=page.getByRole('toolbar',{name:'Text formatting'});await toolbar.getByRole('button',{name:'Bold',exact:true}).click();await expect(box(page).locator('text')).toHaveCSS('font-weight','700');await expect(page.getByRole('textbox',{name:'Edit text box',exact:true})).toHaveCount(0);await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);
  await box(page).click();const size=toolbar.getByLabel('Font size',{exact:true});await size.fill('32');await size.press('Enter');await expect(box(page).locator('text')).toHaveCSS('font-size','32px');await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);await box(page).click();const before=await toolbar.boundingBox(),beforeText=await box(page).boundingBox();await page.locator('#docview .board-zoom').getByRole('button',{name:/^(?:Canvas zoom|Diagram zoom|Zoom) in$/,exact:true}).click();await expect.poll(async()=>(await box(page).boundingBox()).width).toBeGreaterThan(beforeText.width);
  await expect.poll(async()=>{const b=await toolbar.boundingBox(),r=await box(page).locator('.text-box-hit').boundingBox();return !!b && !!r && b.x>=0 && b.x+b.width<=1280 && (b.y+b.height<=r.y || b.y>=r.y+r.height);}).toBe(true);
  const after=await toolbar.boundingBox();expect(after.width).toBeCloseTo(before.width,1);await page.screenshot({path:info.outputPath('text-toolbar-zoomed-desktop.png')});
});

test('stale toolbar callbacks retire on source replacement, preview and builder destroy',async({page,server})=>{
  await page.goto(server.origin+'/lifetime/index.html');const raw=fixture(),d=raw.page.blocks[0].diagram;d.nodes.note={type:'text',text:'Original'};d.floats=[{id:'note',x:550,y:120,side:'below'}];const original=JSON.stringify(raw);await pastePage(page,original);await closeTools(page);await box(page).dblclick();
  const edit=page.getByRole('textbox',{name:'Edit text box',exact:true}),toolbar=page.getByRole('toolbar',{name:'Text formatting'});await edit.fill('Stale draft');const held=await toolbar.getByRole('button',{name:'Bold',exact:true}).elementHandle();
  const replacement=JSON.stringify({...raw,title:'Replacement'});await page.locator('#src').evaluate((el,text)=>{el.value=text;el.dispatchEvent(new Event('input',{bubbles:true}));},replacement);await expect(edit).toHaveCount(0);await expect(toolbar).toHaveCount(0);await held.evaluate(el=>el.click());await expect(page.locator('#src')).toHaveValue(replacement);
  // Render the replacement through the ordinary JSON workspace control.
  await page.locator('#editor-tab-json').click();await page.locator('#go').click();await closeTools(page);await box(page).click();await expect(toolbar).toBeVisible();
  await page.locator('#workspace-appearance>summary').click();await page.locator('#open-page-preview').click();await expect(page.locator('#page-preview')).toBeVisible();await expect(toolbar).toHaveCount(0);await expect(page.locator('#page-preview [data-dv-text-box]')).toBeVisible();await expect(page.locator('#page-preview .dv-text-toolbar,#page-preview .dv-text-editor')).toHaveCount(0);await page.locator('#close-page-preview').click();
  await box(page).dblclick();await edit.fill('Destroy draft');const old=await toolbar.getByLabel('Font',{exact:true}).elementHandle();const before=await source(page);await page.evaluate(()=>__editorTest.builder.destroy());await expect(edit).toHaveCount(0);await expect(toolbar).toHaveCount(0);await old.evaluate(el=>{el.value='Lora';el.dispatchEvent(new Event('change',{bubbles:true}));});await expect(page.locator('#src')).toHaveValue(before);
});
