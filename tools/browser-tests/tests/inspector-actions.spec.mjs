import {test,expect,paste,inspectPageElement,openInspectorGroup} from '../helpers/test.mjs';

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
   P1 open | click button.node-style-browse in the Node style row | dialog.node-style-picker is visible; its .node-style-grid holds one button.node-style-tile per preset plus the default tile (data-style-id=""); each preset tile shows a sample `svg .node.ns-<id> .card`; the current preset's tile is aria-pressed=true | a plain list without rendered samples
   P2 keyboard | ArrowRight from the first tile, Enter | focus moves to the next tile; Enter applies that tile: nodes.a.style equals its data-style-id, the dialog closes, focus returns to the browse button | arrows that scroll instead of moving, Enter that does nothing
   P3 render | after apply | #section-overview [data-dv-node="a"] has class ns-<id> and data-dv-style; its .card computed fill differs from node b's .card fill; title .t1 fill differs from b's | a stored field that does not paint
   P4 selected | the styled node is still selected | g.node.dv-sel .card keeps a visible dashed selection stroke (stroke-dasharray not "none") | a preset that hides the selection ring
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
  expect(tokens[0]).toBe('');expect(tokens.length).toBeGreaterThanOrEqual(10);expect(new Set(tokens).size).toBe(tokens.length);
  for(const token of tokens.slice(1))await expect(dialog.locator('.node-style-tile[data-style-id="'+token+'"] svg .node.ns-'+token+' .card')).toHaveCount(1);
  await expect(dialog.locator('.node-style-tile[aria-pressed="true"]')).toHaveAttribute('data-style-id','rose');
  // P2: ArrowRight from the first tile, Enter applies the second tile.
  await tiles.first().focus();await page.keyboard.press('ArrowRight');
  await expect(tiles.nth(1)).toBeFocused();const chosen=tokens[1];
  await page.keyboard.press('Enter');await expect(dialog).toHaveCount(0);await expect(browse).toBeFocused();
  await expect.poll(async()=>(await spec()).nodes.a.style).toBe(chosen);
  // P3 + P4
  await expect(node('a')).toHaveClass(new RegExp('\\bns-'+chosen+'\\b'));await expect(node('a')).toHaveAttribute('data-dv-style',chosen);
  expect(await fill('a','.card')).not.toBe(await fill('b','.card'));expect(await fill('a','.t1')).not.toBe(await fill('b','.t1'));
  await expect(node('a')).toHaveClass(/\bdv-sel\b/);
  expect(await node('a').locator('.card').evaluate(el=>getComputedStyle(el).strokeDasharray)).not.toBe('none');
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
