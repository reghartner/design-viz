import {test,expect,paste,inspectPageElement,openInspectorGroup,closeTools} from '../helpers/test.mjs';

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
   P2 keyboard | ArrowRight from the first tile, Enter | focus moves to the next tile; Enter applies that tile: nodes.a.style equals its data-style-id, the dialog closes, focus returns to the browse button | arrows that scroll instead of moving, Enter that does nothing
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
  // P2: ArrowRight from the first tile, Enter applies the second tile.
  await tiles.first().focus();await page.keyboard.press('ArrowRight');
  await expect(tiles.nth(1)).toBeFocused();const chosen=tokens[1];
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

/* Color helpers for the contracts below: WCAG relative luminance on computed
   `rgb(r, g, b)` strings, and OKLab distance for "looks different". */
function rgbTriple(text){const m=/rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(text||'');if(!m)throw new Error('not an rgb color: '+text);return [1,2,3].map(i=>Number(m[i]));}
function contrastRatio(a,b){
  const lum=rgb=>{const c=rgb.map(v=>v/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2];};
  const [hi,lo]=[lum(rgbTriple(a)),lum(rgbTriple(b))].sort((x,y)=>y-x);return (hi+.05)/(lo+.05);
}
function oklab(text){
  const [r,g,b]=rgbTriple(text).map(v=>v/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);
  const l=Math.cbrt(.4122214708*r+.5363325363*g+.0514459929*b),m=Math.cbrt(.2119034982*r+.6806995451*g+.1073969566*b),s=Math.cbrt(.0883024619*r+.2817188376*g+.6299787005*b);
  return [.2104542553*l+.7936177850*m-.0040720468*s,1.9779984951*l-2.4285922050*m+.4505937099*s,.0259040371*l+.7827717662*m-.8086757660*s];
}
function labDistance(a,b){const p=oklab(a),q=oklab(b);return Math.hypot(p[0]-q[0],p[1]-q[1],p[2]-q[2]);}
/* The default card colors each skin shipped before #610, captured from the
   rendered viewer; a node without `style` must still paint exactly these. */
const LEGACY_CARD={
  daylight:{fill:'rgb(255, 255, 255)',stroke:'rgb(224, 220, 209)',t1:'rgb(35, 39, 46)',t2:'rgb(121, 128, 139)'},
  editorial:{fill:'rgb(255, 253, 248)',stroke:'rgb(200, 190, 174)',t1:'rgb(30, 41, 39)',t2:'rgb(104, 108, 103)'},
  pastel:{fill:'rgb(255, 255, 255)',stroke:'rgb(216, 224, 235)',t1:'rgb(39, 53, 77)',t2:'rgb(115, 128, 150)'},
  rose:{fill:'rgb(255, 255, 255)',stroke:'rgb(224, 195, 206)',t1:'rgb(74, 44, 58)',t2:'rgb(122, 95, 108)'},
  lavender:{fill:'rgb(255, 253, 248)',stroke:'rgb(205, 186, 219)',t1:'rgb(68, 50, 79)',t2:'rgb(114, 93, 123)'},
  lilac:{fill:'rgb(255, 255, 255)',stroke:'rgb(214, 198, 227)',t1:'rgb(58, 42, 72)',t2:'rgb(110, 92, 126)'},
  aurora:{fill:'rgb(16, 26, 44)',stroke:'rgb(37, 54, 79)',t1:'rgb(234, 242, 255)',t2:'rgb(126, 147, 184)'},
  terminal:{fill:'rgb(12, 20, 17)',stroke:'rgb(38, 53, 47)',t1:'rgb(228, 238, 233)',t2:'rgb(116, 135, 126)'},
  blueprint:{fill:'rgb(8, 54, 109)',stroke:'rgb(166, 231, 243)',t1:'rgb(255, 255, 255)',t2:'rgb(184, 215, 231)'}
};

/* #610 contract matrix (every preset × every skin, computed on the rendered card)
   row | fixture | assertion (scoped) | rejects
   K1 readable | one node per token plus a default node; the 7 editor skins chosen through the Workbench appearance buttons, plus Daylight and Editorial as standalone reader pages (the editor offers no button for them) — all 9 skins | for every token: computed .t1 fill and .t2 fill each contrast >= 4.5:1 against the computed .card fill | an unreadable preset in any skin
   K2 border | same | computed .card stroke differs from its fill, stroke-width >= 1, stroke-opacity 1, and contrasts with the fill at >= 1.3:1 | a border that vanishes into the card
   K3 distinct | same | every pair of presets differs by an OKLab distance >= 0.05 on the border OR >= 0.05 on the background; every preset differs from the default card on fill or stroke | two presets that look alike, or a preset equal to the skin card
   K4 legacy | the node without style, every skin | computed fill, stroke, .t1 and .t2 equal the LEGACY_CARD table captured before #610 | a change to older documents
   K5 lit | standalone viewer page (inject.py), step mode lighting the styled node | the lit card's stroke differs from the same card's stroke out of step mode; the class ns-<token> and data-dv-style are present in the reader | a preset that hides the lit-step highlight, or a reader that drops the field */
const STYLE_TOKENS=['slate','rose','ember','amber','moss','teal','sky','indigo','violet','magenta','sand','ink'];
function styledDiagram(){
  const diagram={autoplay:false,nodes:{plain:{title:'Default card',sub:'no style'}},rows:[],edges:[],steps:[]};
  STYLE_TOKENS.forEach(token=>{diagram.nodes[token]={title:token,sub:'subtitle',style:token};});
  const ids=Object.keys(diagram.nodes);for(let i=0;i<ids.length;i+=4)diagram.rows.push(ids.slice(i,i+4));
  diagram.edges=[{from:'plain',to:'rose'},{from:'rose',to:'teal'}];
  diagram.steps=[{id:'first',text:'first',edge:'plain->rose'},{id:'second',text:'second',edge:'rose->teal'}];
  return diagram;
}
/* Reads every card in `scope` and checks rows K1–K4 for one skin. */
async function auditCards(page,scope,skin){
  const seen=await page.evaluate(scope=>{
    const out={};for(const g of document.querySelectorAll(scope+' [data-dv-node]')){
      const cs=el=>getComputedStyle(el),card=cs(g.querySelector('.card'));
      out[g.dataset.dvNode]={fill:card.fill,stroke:card.stroke,width:parseFloat(card.strokeWidth),opacity:parseFloat(card.strokeOpacity),t1:cs(g.querySelector('.t1')).fill,t2:cs(g.querySelector('.t2')).fill,style:g.dataset.dvStyle||null};
    }return out;},scope);
  // K4
  expect({skin,plain:seen.plain}).toEqual({skin,plain:{...LEGACY_CARD[skin],width:expect.any(Number),opacity:expect.any(Number),style:null}});
  for(const token of STYLE_TOKENS){
    const c=seen[token];expect(c.style,skin+' '+token).toBe(token);
    // K1
    expect(contrastRatio(c.t1,c.fill),skin+' '+token+' title').toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(c.t2,c.fill),skin+' '+token+' subtitle').toBeGreaterThanOrEqual(4.5);
    // K2
    expect(c.stroke,skin+' '+token+' border').not.toBe(c.fill);expect(c.width).toBeGreaterThanOrEqual(1);expect(c.opacity).toBe(1);
    expect(contrastRatio(c.stroke,c.fill),skin+' '+token+' border contrast').toBeGreaterThanOrEqual(1.3);
    // K3 vs default
    expect(c.fill!==seen.plain.fill || c.stroke!==seen.plain.stroke,skin+' '+token+' differs from the skin card').toBe(true);
  }
  for(let i=0;i<STYLE_TOKENS.length;i++)for(let j=i+1;j<STYLE_TOKENS.length;j++){
    const a=seen[STYLE_TOKENS[i]],b=seen[STYLE_TOKENS[j]];
    const apart=Math.max(labDistance(a.stroke,b.stroke),labDistance(a.fill,b.fill));
    expect(apart,skin+': '+STYLE_TOKENS[i]+' vs '+STYLE_TOKENS[j]+' OKLab '+apart.toFixed(3)).toBeGreaterThanOrEqual(.05);
  }
  return seen;
}
test('every node style preset stays readable, bordered and distinct in the editor skins while default cards are unchanged',async({page,server})=>{
  const raw=fixture();raw.page.sections[0].diagram=styledDiagram();
  await start(page,server,raw);
  // The hidden Node style select lists the field's tokens; this matrix must cover exactly those.
  await inspectPageElement(page,page.locator('#section-overview [data-dv-node="plain"] .t1'));
  const live=(await page.locator('#guide select[aria-label="Node style"] option').evaluateAll(options=>options.map(o=>o.value))).filter(Boolean);
  expect(live).toEqual(STYLE_TOKENS);await closeTools(page);
  await page.locator('#workspace-appearance>summary').click();
  const editorSkins=await page.locator('#workspace-appearance-body button[id^="sk-"]').evaluateAll(buttons=>buttons.map(b=>b.id.slice(3)));
  expect(editorSkins.sort()).toEqual(['aurora','blueprint','lavender','lilac','pastel','rose','terminal']);
  for(const skin of editorSkins){
    await page.locator('#sk-'+skin).click();await expect(page.locator('body')).toHaveClass(new RegExp('\\bsk-'+skin+'\\b'));
    await auditCards(page,'#section-overview',skin);
  }
});

test('the standalone reader paints presets in Daylight and Editorial and keeps the lit-step highlight on a styled card (K1–K5)',async({page,server})=>{
  const {execFileSync}=await import('node:child_process'),{writeFile}=await import('node:fs/promises'),path=(await import('node:path')).default,{repo}=await import('../helpers/prepare.mjs');
  for(const skin of ['editorial','daylight']){
    const raw={page:{title:'Styled reader',skin,sections:[{id:'flow',heading:'Flow',diagram:{view:'ambient',...styledDiagram()}}]}};
    const spec=path.join(server.root,'node-styles-'+skin+'.json');await writeFile(spec,JSON.stringify(raw));
    execFileSync('python3',[path.join(repo,'tools/inject.py'),spec,path.join(repo,'template/flowview.html'),path.join(server.root,'node-styles-'+skin+'.html')]);
    await page.goto(server.origin+'/node-styles-'+skin+'.html');await expect(page.locator('body')).toHaveClass(new RegExp('\\bsk-'+skin+'\\b'));
    await auditCards(page,'#section-flow',skin);
  }
  const node=id=>page.locator('[data-dv-node="'+id+'"]').first();
  await expect(node('rose')).toHaveClass(/\bns-rose\b/);await expect(node('rose')).toHaveAttribute('data-dv-style','rose');
  await expect(node('plain')).not.toHaveAttribute('data-dv-style');
  const card=async id=>node(id).locator('.card').evaluate(el=>({fill:getComputedStyle(el).fill,stroke:getComputedStyle(el).stroke}));
  expect((await card('rose')).fill).not.toBe((await card('plain')).fill);
  await page.getByRole('button',{name:'Step',exact:true}).first().click();await page.locator('button.schip').first().click();
  await expect(node('rose')).toHaveClass(/\blit\b/);
  const lit=await card('rose');
  await page.getByRole('button',{name:'Ambient',exact:true}).first().click();
  await expect(node('rose')).not.toHaveClass(/\blit\b/);
  const unlit=await card('rose');
  expect(lit.stroke).not.toBe(unlit.stroke);expect(unlit.fill).toBe(lit.fill);
});
