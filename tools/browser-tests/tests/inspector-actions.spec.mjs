import {test,expect,paste,inspectPageElement,openInspectorGroup} from '../helpers/test.mjs';

const fixture=()=>({page:{title:'Inspector actions',sections:[
  {id:'overview',heading:'Overview',diagram:{autoplay:false,
    nodes:{a:{title:'Domain',detail:{section:'child',mode:'focus',future:'keep'}},b:{title:'Receiver',handoff:{url:'https://example.com/child'}}},
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
  await page.locator('#section-overview [data-dv-node="a"] .t1').click();
  await page.locator('#section-overview [data-dv-node="b"] .t1').click({modifiers:['Shift']});
  await expect(guide).toContainText('2 nodes selected');await before(actions,guide.locator(':scope > .iform'));
  await expect(actions.getByRole('button',{name:'Create domain from selected nodes',exact:true})).toBeInViewport();
  await expect(src).toHaveValue(original);
});

test('nested handoff and detail commits stay above fields and visible while their groups scroll',async({page,server},info)=>{
  const original=await start(page,server),guide=page.locator('#guide'),src=page.locator('#src');
  await page.setViewportSize({width:1280,height:600});
  await page.locator('#section-overview [data-dv-node="b"] .t1').click();
  const handoff=guide.locator('.node-handoff-editor');
  await expect(handoff).not.toHaveAttribute('open');await handoff.locator('summary').click();
  await before(handoff.getByRole('group',{name:'Diagram handoff actions'}),handoff.locator('.frow').first());
  await handoff.getByLabel('Destination URL',{exact:true}).fill('https://example.com/revised');
  await expect(src).toHaveValue(original);
  await expect(handoff.getByRole('button',{name:'Apply handoff',exact:true})).toBeInViewport();
  await handoff.getByRole('button',{name:'Apply handoff',exact:true}).click();
  expect(JSON.parse(await src.inputValue()).page.sections[0].diagram.nodes.b.handoff.url).toBe('https://example.com/revised');
  await page.locator('#undo-builder').click();await expect(src).toHaveValue(original);
  await page.locator('#section-overview [data-dv-node="a"] .t1').click();
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
