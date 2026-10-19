import {test,expect,paste,inspectPageElement,openInspectorGroup,closeTools} from '../helpers/test.mjs';
import {CORE_EDITOR_SKINS,LEGACY_CARD,styledDiagram,contrastRatio,auditCards,auditState,auditTone,auditEditorStyle} from '../helpers/node-styles.mjs';

const fixture=()=>({page:{title:'Inspector actions',sections:[
  {id:'overview',heading:'Overview',diagram:{autoplay:false,
    nodes:{a:{title:'Domain',detail:{section:'child',mode:'focus',future:'keep'}},b:{title:'Receiver',handoff:{spec:'child',siteBaseUrl:'https://example.com/view.html'}}},
    rows:[['a','b']],edges:[{from:'a',to:'b'}],
    panels:[{id:'home',type:'homemap',title:'Shared home',outline:{w:300,h:164,future:'keep'}}],
    steps:Array.from({length:6},(_,i)=>({id:'p'+i,text:'Parent event '+i,edge:'a->b'}))}},
  {id:'child',heading:'Child',detailOnly:true,diagram:{nodes:{inside:{title:'Inside'}},rows:[['inside']],steps:[{id:'first',text:'First',nodes:['inside']},{id:'last',text:'Last',nodes:['inside']}]}}
]}});
async function start(page,server,raw=fixture()){
  const original=JSON.stringify(raw,null,2);
  await page.goto(server.origin+'/workbench.html');await paste(page,original);return original;
}
async function before(first,second){
  const a=await first.boundingBox(),b=await second.boundingBox();expect(a.y+a.height).toBeLessThanOrEqual(b.y+1);
}

test('panel and multiselection actions precede long forms at short height',async({page,server},info)=>{
  const original=await start(page,server),guide=page.locator('#guide'),src=page.locator('#src');
  await inspectPageElement(page,page.locator('#docview [data-dv-panel="0"]').first());
  await page.setViewportSize({width:1280,height:600});
  const actions=guide.locator(':scope > .inspector-actions');
  await before(actions,guide.locator(':scope > .iform'));
  for(const label of ['Copy panel','Duplicate panel','Change panel type…','delete panel'])
    await expect(actions.getByRole('button',{name:label,exact:true})).toBeInViewport();
  const appearance=await actions.locator('button').evaluateAll(buttons=>buttons.filter(b=>!b.classList.contains('bdanger')).map(b=>getComputedStyle(b).backgroundColor));
  expect(new Set(appearance).size).toBe(1);
  await page.screenshot({path:info.outputPath('panel-actions-short.png')});
  await actions.getByRole('button',{name:'Change panel type…',exact:true}).click();
  await page.keyboard.press('Escape');await expect(src).toHaveValue(original);
  await expect(actions.getByRole('button',{name:'Change panel type…',exact:true})).toBeFocused();
  await page.locator('#section-overview [data-dv-node="a"]').focus();await page.keyboard.press('Enter');
  await page.locator('#section-overview [data-dv-node="b"]').focus();await page.keyboard.press('Shift+Enter');
  await expect(guide).toContainText('2 nodes selected');await before(actions,guide.locator(':scope > .iform'));
  await info.attach('multiselection-layout',{body:JSON.stringify(await page.evaluate(()=>{
    const selectors=['#workspace-window-inspect','#editor-inspect','#guide','#guide>.inspector-actions','.editor-clipboard','#diagram-import-open'];
    return selectors.map(selector=>{const el=document.querySelector(selector),r=el.getBoundingClientRect(),s=getComputedStyle(el);return {selector,rect:r.toJSON(),clientHeight:el.clientHeight,scrollHeight:el.scrollHeight,scrollTop:el.scrollTop,font:s.font,padding:s.padding,gap:s.gap};}).concat(Array.from(document.querySelectorAll('#guide>.inspector-actions>*')).map(el=>({text:el.textContent,rect:el.getBoundingClientRect().toJSON()})));
  }),null,2),contentType:'application/json'});
  await page.screenshot({path:info.outputPath('multiselection-actions-short.png')});
  await expect(actions.getByRole('button',{name:'Create domain from selected nodes',exact:true})).toBeInViewport({ratio:1});
  const importDiagram=page.getByRole('group',{name:'Document actions'}).getByRole('button',{name:'Add / Paste diagram…',exact:true});
  await expect(importDiagram).toBeInViewport({ratio:1});await importDiagram.focus();await page.keyboard.press('Enter');
  await expect(page.locator('#diagram-import')).toBeVisible();await page.keyboard.press('Escape');await expect(importDiagram).toBeFocused();
  await expect(src).toHaveValue(original);
});

test('nested handoff and detail commits stay above fields and visible while their groups scroll',async({page,server},info)=>{
  const original=await start(page,server),guide=page.locator('#guide'),src=page.locator('#src');
  await page.setViewportSize({width:1280,height:600});
  await page.locator('#section-overview [data-dv-node="b"] .t1').click();
  const handoff=guide.locator('.node-handoff-editor');
  await expect(handoff).not.toHaveAttribute('open');await handoff.locator('summary').click();
  await before(handoff.getByRole('group',{name:'Diagram handoff actions'}),handoff.locator('.frow').first());
  await handoff.getByLabel('Internal site base URL',{exact:true}).fill('https://example.com/revised');
  await expect(src).toHaveValue(original);
  await expect(handoff.getByRole('button',{name:'Apply handoff',exact:true})).toBeInViewport();
  await handoff.getByRole('button',{name:'Apply handoff',exact:true}).click();
  expect(JSON.parse(await src.inputValue()).page.sections[0].diagram.nodes.b.handoff.siteBaseUrl).toBe('https://example.com/revised');
  await page.locator('#undo-builder').click();await expect(src).toHaveValue(original);
  await inspectPageElement(page,page.locator('#section-overview [data-dv-node="a"] .t1'));
  const detail=guide.locator('.node-detail-editor');
  await expect(detail).not.toHaveAttribute('open');await detail.locator(':scope > summary').click();
  await before(detail.getByRole('group',{name:'Domain detail actions'}),detail.getByRole('combobox',{name:'Detail target',exact:true}));
  await detail.getByLabel('Initial child step',{exact:true}).selectOption('last');
  await expect(src).toHaveValue(original);
  await detail.locator('.mapping-row').last().scrollIntoViewIfNeeded();
  await expect(detail.getByRole('button',{name:'Apply detail',exact:true})).toBeInViewport();
  await page.screenshot({path:info.outputPath('detail-apply-short.png')});
  await detail.getByRole('button',{name:'Apply detail',exact:true}).click();
  expect(JSON.parse(await src.inputValue()).page.sections[0].diagram.nodes.a.detail).toMatchObject({step:'last',future:'keep'});
  await page.locator('#undo-builder').click();await expect(src).toHaveValue(original);
});

test('node inspector keeps ordinary edits clear and expert source data in Advanced',async({page,server},info)=>{
  const raw=fixture(),diagram=raw.page.sections[0].diagram;
  const long='North entrance camera responsible for after-hours package deliveries and visitor verification';
  diagram.nodes.a={title:long,sub:'Porch · east wall',icon:'camera',tint:'auth',group:'outside',
    link:'https://example.com/cameras/north',binding:{entityRef:'component:default/north-camera'},
    codeRefs:[{id:'capture',repository:'https://github.com/example/camera',path:'src/camera.js',revision:'a'.repeat(40),anchor:{start:'// camera:start',end:'// camera:end'}}]};
  diagram.groups={outside:{title:'Outside'}};diagram.rows=[['b']];diagram.floats=[{id:'a',x:180,y:280,side:'below'}];
  const original=await start(page,server,raw),guide=page.locator('#guide'),src=page.locator('#src');
  await inspectPageElement(page,page.locator('#section-overview [data-dv-node="a"] .t1'));
  await expect(guide.locator('.inspector-title')).toHaveText('Node · '+long);
  await expect(guide.locator('.iform>.frow>.flab')).toHaveText(['Name','Subtitle','Icon','Node style','Placement','Group','Keep position fixed','Link','Show change marker']);
  const advanced=guide.locator('.node-advanced');await expect(advanced).not.toHaveAttribute('open');
  await expect(src).toHaveValue(original);
  const color=guide.getByLabel('Icon color',{exact:true});
  await expect(color.locator('option')).toHaveText(['Default · Command','Command · blue','Identity & access · amber','Data · violet','Messaging · pink','Device · green']);
  await expect(color).toHaveValue('auth');
  const titleBox=await guide.locator('.inspector-title').evaluate(el=>({client:el.clientWidth,scroll:el.scrollWidth}));
  expect(titleBox.scroll).toBeLessThanOrEqual(titleBox.client);

  for(const [width,height,name] of [[1280,720,'node-common-1280x720.png'],[1440,900,'node-common-1440x900.png']]){
    await page.setViewportSize({width,height});await page.screenshot({path:info.outputPath(name)});
  }
  await advanced.locator(':scope > summary').focus();await page.keyboard.press('Enter');await expect(advanced).toHaveAttribute('open');
  for(const label of ['Stable identifier','Float X','Float Y','Service binding JSON','Code references JSON'])
    await expect(advanced.locator('.frow').filter({has:page.locator('.flab').filter({hasText:new RegExp('^'+label+'$')})})).toHaveCount(1);
  await expect(advanced.locator('.node-source-path')).toContainText('nodes');
  for(const [width,height,name] of [[1280,720,'node-advanced-1280x720.png'],[1440,900,'node-advanced-1440x900.png']]){
    await page.setViewportSize({width,height});await advanced.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath(name)});
  }

  const name=guide.getByLabel('Name',{exact:true});await name.focus();await name.evaluate(el=>el.setSelectionRange(6,6));
  await page.keyboard.type('entry ');await page.keyboard.press('Tab');await expect(guide.getByLabel('Subtitle',{exact:true})).toBeFocused();
  const renamed=JSON.parse(await src.inputValue());expect(renamed.page.sections[0].diagram.nodes.a.title).toBe('North entry entrance camera responsible for after-hours package deliveries and visitor verification');
  await page.locator('#undo-builder').click();await expect(src).toHaveValue(original);
  await page.locator('#redo-builder').click();await expect.poll(async()=>JSON.parse(await src.inputValue()).page.sections[0].diagram.nodes.a.title).toContain('North entry entrance');
  await inspectPageElement(page,page.locator('#section-overview [data-dv-node="a"]'));
  await guide.getByLabel('Icon color',{exact:true}).selectOption('mqtt');await expect.poll(async()=>JSON.parse(await src.inputValue()).page.sections[0].diagram.nodes.a.tint).toBe('mqtt');
  await page.locator('#undo-builder').click();await expect.poll(async()=>JSON.parse(await src.inputValue()).page.sections[0].diagram.nodes.a.tint).toBe('auth');
  await page.locator('#redo-builder').click();await expect.poll(async()=>JSON.parse(await src.inputValue()).page.sections[0].diagram.nodes.a.tint).toBe('mqtt');

  await inspectPageElement(page,page.locator('#section-overview [data-dv-node="a"]'));
  await openInspectorGroup(guide.locator('.node-advanced'));
  const stable=guide.getByLabel('Stable identifier',{exact:true});await stable.fill('');await stable.press('Enter');
  const error=guide.locator('.ierr');await expect(error).toContainText('a node needs an id');
  const fit=await error.evaluate(el=>({client:el.clientWidth,scroll:el.scrollWidth}));expect(fit.scroll).toBeLessThanOrEqual(fit.client);
  await stable.fill('camera');await guide.evaluate(el=>{el.scrollTop=61;});const beforeRenameScroll=await guide.evaluate(el=>el.scrollTop);
  await stable.press('Enter');await expect(error).toBeHidden();
  await expect(guide.locator('.node-advanced')).toHaveAttribute('open');await expect(guide.getByLabel('Stable identifier',{exact:true})).toBeFocused();
  await expect.poll(()=>guide.evaluate(el=>el.scrollTop)).toBe(beforeRenameScroll);
  expect(JSON.parse(await src.inputValue()).page.sections[0].diagram.nodes.camera.title).toContain('North entry entrance');

  const placement=guide.getByText('Placement',{exact:true}).locator('..').locator('select');await placement.focus();await guide.evaluate(el=>{el.scrollTop=73;});
  await placement.selectOption('above');await expect(guide.getByText('Placement',{exact:true}).locator('..').locator('select')).toBeFocused();
  await expect(guide.locator('.node-advanced')).toHaveAttribute('open');await expect.poll(()=>guide.evaluate(el=>el.scrollTop)).toBe(73);
  expect(JSON.parse(await src.inputValue()).page.sections[0].diagram.floats[0].side).toBe('above');
  await page.locator('#section-overview [data-dv-node="b"] .t1').click();await expect(guide.locator('.node-advanced')).not.toHaveAttribute('open');
});

test('extraction actions remain visible over a long preview and external Apply tracks the current download',async({page,server},info)=>{
  const raw=fixture();delete raw.page.sections[0].diagram.nodes.a.detail;delete raw.page.sections[0].diagram.nodes.b.handoff;
  const original=await start(page,server,raw),guide=page.locator('#guide'),src=page.locator('#src');
  await page.locator('#section-overview [data-dv-node="a"] .t1').click();
  await page.locator('#section-overview [data-dv-node="b"] .t1').click({modifiers:['Shift']});
  await guide.getByRole('button',{name:'Create domain from selected nodes',exact:true}).click();
  await page.setViewportSize({width:1280,height:600});
  const preview=guide.locator('.extraction-preview'),actions=preview.getByRole('group',{name:'Extraction actions'});
  await before(actions,preview.locator('.iform'));
  await preview.getByRole('combobox',{name:'Destination',exact:true}).selectOption('external');
  await preview.getByLabel('Spec ID',{exact:true}).fill('independent');
  const apply=actions.getByRole('button',{name:'Apply extraction',exact:true});await expect(apply).toBeDisabled();
  await preview.locator('.extraction-status').scrollIntoViewIfNeeded();
  await expect(apply).toBeInViewport();await expect(actions.getByRole('button',{name:'Cancel',exact:true})).toBeInViewport();
  await page.screenshot({path:info.outputPath('extraction-actions-short.png')});
  const download=page.waitForEvent('download');await actions.getByRole('button',{name:'Download destination JSON',exact:true}).click();await download;
  await expect(apply).toBeEnabled();await expect(src).toHaveValue(original);
  await preview.getByLabel('Domain title').fill('Revised domain');await expect(apply).toBeDisabled();
  await actions.getByRole('button',{name:'Cancel',exact:true}).click();await expect(src).toHaveValue(original);
});

test('long step groups start collapsed with tinted headers and retain keyboard-open state only on the same selection',async({page,server},info)=>{
  const raw=fixture(),d=raw.page.sections[0].diagram;
  d.panels.push({id:'state',type:'state',title:'Device state',states:['OFF','ON'],initial:{state:'OFF'}},
    {id:'reading',type:'gauge',title:'Current draw',unit:'mA',initial:{value:12}},
    {id:'phone',type:'phone',title:'Phone'}, {id:'app',type:'deviceapp',title:'Device app',fields:[]});
  d.steps.forEach(step=>{step.panels={state:{},reading:{},phone:{},app:{}};});
  const original=await start(page,server,raw),guide=page.locator('#guide'),src=page.locator('#src');
  async function select(index){await page.locator('#editor-tab-steps').click();await page.locator('#steps-list [data-step-index="'+index+'"]').click();await page.locator('#editor-tab-inspect').click();}
  await select(0);await expect(guide.locator('details[open]')).toHaveCount(0);
  await page.setViewportSize({width:1280,height:600});
  await before(guide.locator(':scope > .inspector-actions'),guide.locator(':scope > .iform'));
  await guide.locator('.step-form-panels').scrollIntoViewIfNeeded();
  const headers=await guide.locator('.step-form-panels details>summary').evaluateAll(elements=>elements.map(el=>getComputedStyle(el).backgroundColor));
  expect(headers.length).toBeGreaterThanOrEqual(5);expect(headers.every(color=>!['rgba(0, 0, 0, 0)','rgb(255, 255, 255)'].includes(color))).toBe(true);
  await page.screenshot({path:info.outputPath('long-step-collapsed-short.png')});
  const state=guide.locator('details[data-panel-state="step"][data-panel-id="state"]');
  await state.locator(':scope > summary').focus();await page.keyboard.press('Enter');await expect(state).toHaveAttribute('open');
  await state.getByLabel('state',{exact:true}).selectOption('ON');
  await expect.poll(async()=>JSON.parse(await src.inputValue()).page.sections[0].diagram.steps[0].panels.state.state).toBe('ON');
  await expect(state).toHaveAttribute('open');
  await page.locator('#undo-builder').click();await expect(src).toHaveValue(original);
  await select(1);await expect(guide.locator('details[open]')).toHaveCount(0);
  await select(0);await expect(guide.locator('details[open]')).toHaveCount(0);
});

test('Home selection and new rows reveal the intended editor while normal selection stays collapsed',async({page,server})=>{
  const raw=fixture(),d=raw.page.sections[0].diagram;d.view='ambient';
  d.panels[0].devices=[{id:'camera',label:'Front camera',kind:'camera',x:40,y:40}];
  d.panels[0].subjects=[{id:'resident',label:'Resident',x:80,y:50}];
  const original=await start(page,server,raw),guide=page.locator('#guide'),src=page.locator('#src');
  await inspectPageElement(page,page.locator('#docview [data-dv-panel="0"] .ptitle').first());
  await expect(guide.locator('details[open]')).toHaveCount(0);
  await inspectPageElement(page,page.locator('#docview [data-dv-panel="0"] [data-device="camera"]').first());
  const devices=guide.locator('.home-elements').filter({has:page.locator(':scope > summary').filter({hasText:/^Devices/})});
  await expect(devices).toHaveAttribute('open');await expect(devices.locator('.home-element').first()).toHaveAttribute('open');
  await expect(guide.locator('.home-elements').filter({has:page.locator(':scope > summary').filter({hasText:/^Subjects/})})).not.toHaveAttribute('open');
  await expect(src).toHaveValue(original);
  await devices.getByRole('button',{name:'+ item',exact:true}).click();
  const added=devices.locator('.home-element').last();await expect(added).toHaveAttribute('open');await expect(added.locator('input').first()).toBeFocused();
  await expect(src).toHaveValue(original);
  await page.locator('#section-overview [data-dv-node="b"] .t1').click();
  await inspectPageElement(page,page.locator('#docview [data-dv-panel="0"] .ptitle').first());
  await expect(guide.locator('details[open]')).toHaveCount(0);
  await openInspectorGroup(devices);await expect(devices.locator('.home-element[open]')).toHaveCount(0);
});

/* #610 contract matrix (Node style picker modal, real input)
   row | fixture | assertion (scoped) | rejects
   P1 open | click button.node-style-browse in the Node style row | dialog.node-style-picker is visible; its .node-style-grid tile ids equal ['', ...NODE_STYLE_SET] in order; each preset tile shows a sample `svg .node.ns-<id> .card`; the current preset's tile is aria-pressed=true | a plain list, a missing preset, an invented tile
   P2 keyboard | from the first tile: ArrowRight, ArrowDown, ArrowUp, ArrowLeft, End, Home, then ArrowRight + Enter | each key moves focus to the expected tile (down/up by one grid row); Enter applies the focused tile: nodes.a.style equals its data-style-id, the dialog closes, focus returns to the browse button | a missing arrow direction, arrows that scroll, Enter that does nothing
   P3 render | after apply | #section-overview [data-dv-node="a"] has class ns-<id> and data-dv-style; its .card computed fill differs from node b's .card fill; title .t1 fill differs from b's | a stored field that does not paint
   P4 selected | the styled node is still selected | its .card stroke is the dashed selection ring: stroke-dasharray set, stroke-width >= 2, stroke-opacity >= .9, and the stroke color contrasts with the card fill at >= 1.5:1 | a preset whose border hides or matches the selection ring
   P5 escape | reopen, press Escape | the dialog is gone, the source is unchanged, focus is back on the browse button | a modal that swallows Escape
   P6 click | reopen, click the Default tile | nodes.a has no style field; the node loses ns-/data-dv-style; Undo restores the previous preset | a default tile that writes "style": ""
   P7 bulk | select a and b, open the multi-form picker, click a preset tile | both nodes carry that style; one Undo removes both | bulk edits without the modal */
test('node style picker applies presets from a modal of rendered samples with mouse and keyboard',async({page,server})=>{
  const raw=fixture(),diagram=raw.page.sections[0].diagram;
  diagram.nodes.a.style='rose';
  const original=await start(page,server,raw),guide=page.locator('#guide'),src=page.locator('#src');
  const node=id=>page.locator('#section-overview [data-dv-node="'+id+'"]');
  const fill=async(id,part)=>node(id).locator(part).first().evaluate(el=>getComputedStyle(el).fill);
  const spec=async()=>JSON.parse(await src.inputValue()).page.sections[0].diagram;
  await inspectPageElement(page,node('a').locator('.t1'));
  const row=guide.locator('.iform>.frow').filter({has:page.locator('.flab',{hasText:/^Node style$/})});
  const browse=row.locator('button.node-style-browse');await expect(browse).toHaveAttribute('aria-haspopup','dialog');
  await expect(node('a')).toHaveClass(/\bns-rose\b/);await expect(node('a')).toHaveAttribute('data-dv-style','rose');
  // P1
  await browse.click();const dialog=page.locator('dialog.node-style-picker');await expect(dialog).toBeVisible();
  const tiles=dialog.locator('.node-style-grid button.node-style-tile');
  const tokens=await tiles.evaluateAll(buttons=>buttons.map(b=>b.dataset.styleId));
  // The hidden select is the field's own list of tokens; the modal must offer exactly those, default first.
  const styleSet=(await row.locator('select[aria-label="Node style"] option').evaluateAll(options=>options.map(o=>o.value))).filter(Boolean);
  expect(styleSet.length).toBeGreaterThan(8);expect(tokens).toEqual(['',...styleSet]);
  for(const token of tokens.slice(1))await expect(dialog.locator('.node-style-tile[data-style-id="'+token+'"] svg .node.ns-'+token+' .card')).toHaveCount(1);
  await expect(dialog.locator('.node-style-tile[aria-pressed="true"]')).toHaveAttribute('data-style-id','rose');
  // P2: every arrow direction moves focus by the grid; Enter applies the focused tile.
  const columns=await dialog.locator('.node-style-grid').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(/\s+/).filter(Boolean).length);
  expect(columns).toBeGreaterThanOrEqual(2);expect(tokens.length).toBeGreaterThan(columns+1);
  await tiles.first().focus();await expect(tiles.nth(0)).toBeFocused();
  await page.keyboard.press('ArrowRight');await expect(tiles.nth(1)).toBeFocused();
  await page.keyboard.press('ArrowDown');await expect(tiles.nth(1+columns)).toBeFocused();
  await page.keyboard.press('ArrowUp');await expect(tiles.nth(1)).toBeFocused();
  await page.keyboard.press('ArrowLeft');await expect(tiles.nth(0)).toBeFocused();
  await page.keyboard.press('End');await expect(tiles.nth(tokens.length-1)).toBeFocused();
  await page.keyboard.press('Home');await expect(tiles.nth(0)).toBeFocused();
  await page.keyboard.press('ArrowRight');await expect(tiles.nth(1)).toBeFocused();const chosen=tokens[1];
  await page.keyboard.press('Enter');await expect(dialog).toHaveCount(0);await expect(browse).toBeFocused();
  await expect.poll(async()=>(await spec()).nodes.a.style).toBe(chosen);
  // P3 + P4
  await expect(node('a')).toHaveClass(new RegExp('\\bns-'+chosen+'\\b'));await expect(node('a')).toHaveAttribute('data-dv-style',chosen);
  expect(await fill('a','.card')).not.toBe(await fill('b','.card'));expect(await fill('a','.t1')).not.toBe(await fill('b','.t1'));
  await expect(node('a')).toHaveClass(/\bdv-sel\b/);
  const ring=await node('a').locator('.card').evaluate(el=>{const s=getComputedStyle(el);return {dash:s.strokeDasharray,width:parseFloat(s.strokeWidth),opacity:parseFloat(s.strokeOpacity),stroke:s.stroke,fill:s.fill};});
  expect(ring.dash).not.toBe('none');expect(ring.width).toBeGreaterThanOrEqual(2);expect(ring.opacity).toBeGreaterThanOrEqual(.9);
  expect(contrastRatio(ring.stroke,ring.fill)).toBeGreaterThanOrEqual(1.5);
  // P5
  const afterChoice=await src.inputValue();await browse.click();await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(src).toHaveValue(afterChoice);await expect(browse).toBeFocused();
  // P6
  await browse.click();await dialog.locator('.node-style-tile[data-style-id=""]').click();await expect(dialog).toHaveCount(0);
  await expect.poll(async()=>'style' in (await spec()).nodes.a).toBe(false);
  await expect(node('a')).not.toHaveClass(/\bns-/);await expect(node('a')).not.toHaveAttribute('data-dv-style');
  await page.locator('#undo-builder').click();await expect(src).toHaveValue(afterChoice);await expect(node('a')).toHaveClass(new RegExp('\\bns-'+chosen+'\\b'));
  // P7: bulk
  await node('a').focus();await page.keyboard.press('Enter');await node('b').focus();await page.keyboard.press('Shift+Enter');
  await expect(guide).toContainText('2 nodes selected');
  const bulkRow=guide.locator('.frow').filter({has:page.locator('.flab',{hasText:/^Node style$/})});
  const beforeBulk=await src.inputValue();await bulkRow.locator('button.node-style-browse').click();await expect(dialog).toBeVisible();
  const bulkToken=tokens[tokens.length-1];await dialog.locator('.node-style-tile[data-style-id="'+bulkToken+'"]').click();await expect(dialog).toHaveCount(0);
  await expect.poll(async()=>{const d=await spec();return [d.nodes.a.style,d.nodes.b.style];}).toEqual([bulkToken,bulkToken]);
  await expect(node('b')).toHaveClass(new RegExp('\\bns-'+bulkToken+'\\b'));
  await page.locator('#undo-builder').click();await expect(src).toHaveValue(beforeBulk);
});

// Keep each complete skin audit bounded; every skin also checks SVG export.
for(const editorSkin of CORE_EDITOR_SKINS){
  test('every node style preset stays readable, bordered and distinct in the editor skins while default cards are unchanged — '+editorSkin,async({page,server})=>{
    await auditEditorStyle({page,server},editorSkin,{fixture,start});
  });
}

test('the standalone reader paints presets in Daylight and Editorial and keeps the lit-step highlight on a styled card (K1–K5)',async({page,server})=>{
  const {execFileSync}=await import('node:child_process'),{writeFile}=await import('node:fs/promises'),path=(await import('node:path')).default,{repo}=await import('../helpers/prepare.mjs');
  for(const skin of ['editorial','daylight']){
    const raw={page:{title:'Styled reader',skin,sections:[{id:'flow',heading:'Flow',diagram:{view:'ambient',...styledDiagram()}}]}};
    const spec=path.join(server.root,'node-styles-'+skin+'.json');await writeFile(spec,JSON.stringify(raw));
    execFileSync('python3',[path.join(repo,'tools/inject.py'),spec,path.join(repo,'template/flowview.html'),path.join(server.root,'node-styles-'+skin+'.html')]);
    await page.goto(server.origin+'/node-styles-'+skin+'.html');await expect(page.locator('body')).toHaveClass(new RegExp('\\bsk-'+skin+'\\b'));
    const resting=await auditCards(page,'#section-flow',skin);
    // K5 in the reader: Step mode, first step lights every card.
    await page.getByRole('button',{name:'Step',exact:true}).first().click();await page.locator('button.schip').first().click();
    await expect(page.locator('[data-dv-node="rose"]').first()).toHaveClass(/\blit\b/);
    await auditState(page,'#section-flow',skin,resting,'lit');
    // K8 in the reader.
    await page.locator('button.schip').last().click();await expect(page.locator('[data-dv-node="plain"]').first()).toHaveClass(/\btone-alert\b/);
    await auditTone(page,'#section-flow',skin);
    await page.getByRole('button',{name:'Ambient',exact:true}).first().click();
    await expect(page.locator('[data-dv-node="rose"]').first()).not.toHaveClass(/\blit\b/);
  }
  const node=id=>page.locator('[data-dv-node="'+id+'"]').first();
  await expect(node('rose')).toHaveClass(/\bns-rose\b/);await expect(node('rose')).toHaveAttribute('data-dv-style','rose');
  await expect(node('plain')).not.toHaveAttribute('data-dv-style');
});

test('the Confluence and Backstage hosts paint presets through their own stylesheets (H1, H2)',async({page,server})=>{
  // H1: Forge viewer with a pasted styled spec in a dark skin.
  await page.addInitScript(()=>{window.__bridge={callBridge:async(method)=>{
    if(method==='getContext')return {siteUrl:'https://company.atlassian.net',extension:{config:{},macro:{isConfiguring:true}}};
    if(['submit','close','navigate'].includes(method))return true;throw Error('Unexpected bridge call: '+method);}};});
  await page.goto(server.origin+'/forge/index.html');await expect(page.locator('#app-status')).toBeHidden();
  const raw={page:{title:'Styled host',skin:'aurora',sections:[{id:'flow',heading:'Flow',diagram:{view:'ambient',...styledDiagram()}}]}};
  await page.locator('#spec-input').fill(JSON.stringify(raw,null,2));await page.locator('#validate').click();
  await expect(page.locator('#docview [data-dv-node="rose"]')).toHaveClass(/\bns-rose\b/);
  await auditCards(page,'#docview','aurora');
  // H2: the packaged Backstage components, scoped styles and all.
  await page.goto(server.origin+'/native/index.html');await page.waitForFunction(()=>!!window.__host);
  await page.evaluate(()=>{__host.left(true);});
  const alpha=page.locator('#alpha');await expect(alpha.locator('[data-dv-node="camera"]').first()).toHaveClass(/\bns-rose\b/);
  // The packaged components render inside a shadow root; locators pierce it, so read each card through one.
  const read=id=>alpha.locator('[data-dv-node="'+id+'"]').first().evaluate(g=>{const card=getComputedStyle(g.querySelector('.card'));return {fill:card.fill,stroke:card.stroke,t1:getComputedStyle(g.querySelector('.t1')).fill,t2:getComputedStyle(g.querySelector('.t2')).fill};});
  const cards={camera:await read('camera'),service:await read('service')};
  // The fixture opens in Step mode, so the sibling's stroke may be the lit ring; its fill and text stay the pastel legacy colors.
  expect({fill:cards.service.fill,t1:cards.service.t1,t2:cards.service.t2}).toEqual({fill:LEGACY_CARD.pastel.fill,t1:LEGACY_CARD.pastel.t1,t2:LEGACY_CARD.pastel.t2});
  expect(cards.camera.fill).not.toBe(cards.service.fill);expect(cards.camera.t1).not.toBe(cards.service.t1);
  expect(contrastRatio(cards.camera.t1,cards.camera.fill)).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio(cards.camera.t2,cards.camera.fill)).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio(cards.camera.stroke,cards.camera.fill)).toBeGreaterThanOrEqual(1.3);
});
