/* #1242 desktop Workbench: corner handles and Alt+Left/Right change a metrics card's width in Preview metrics layout.
| row | rule | fixture | assertion | broken implementation it rejects |
|---|---|---|---|---|
| R1 | Dragging the bottom-right handle 60 units right grows card.width by 60 while showing the live width; the card does not move; one Undo restores; the Card width field shows the new width. | one bound connection, card below | `card.width` 300, no `position`, readout "Width 300" during the drag, Card width input "300", Undo exact text | handles that move the card, multi-step history, no live feedback |
| R2 | Dragging past 480 clamps to 480; a left-handle drag on a manually placed card keeps its right edge within 2 units and is one Undo step. | same, then a manual position | width 480; right edge before/after; one Undo restores the exact text | unclamped widths, a left drag that moves the right edge |
| R3 | Alt+Right on a focused card adds 10, Shift+Alt+Left takes 50; Escape during a drag cancels it with no source change. | same | width 250, then 200; source unchanged after Escape | no keyboard path, Escape that commits |
| R4 | Handles have a 20-unit hit area and the ew-resize cursor; dragging the card body still moves it. | same | hit rect 20×20, cursor ew-resize; body drag writes `position` and keeps width | tiny hit targets, a body drag that resizes |
| R5 | An inherited imported connection: a handle drag saves the consumer override in one Undo step; the Inspector keeps its scroll. | consumer importing a provider binding | `edgeTracking['a->b'].telemetry.card.width`; Undo restores; `#guide` scrollTop within 2 | resize that edits the provider or loses the Inspector scroll |
| R6 | Readers never see handles. | reader render of the same spec | reader card count 1, handle count 0 | handles painted for readers |
*/
import {test,expect,paste,prepareEditorSurface} from '../helpers/test.mjs';
const binding={kind:'call',signals:{rate:{grafana:'up',unit:'req/h'},errors:{grafana:'errors',unit:'req/h'}},card:{side:'below',offset:0}};
const raw={page:{title:'Metrics resize',sections:[{id:'flow',heading:'Delivery',diagram:{view:'ambient',nodes:{a:{title:'Sender'},b:{title:'Receiver'},c:{title:'Unbound'}},rows:[['a','b','c']],
  edges:[{from:'a',to:'b',label:'Delivery',telemetry:binding},{from:'b',to:'c',label:'Unbound delivery'}],panels:[{id:'status',type:'live-status'}]}}]}};
const toggle=page=>page.getByRole('checkbox',{name:'Preview metrics layout',exact:true});
const cards=page=>page.locator('#docview .dv-metrics-card');
const edge=text=>JSON.parse(text).page.sections[0].diagram.edges[0];
async function open(page,server,spec=raw){
  await page.setViewportSize({width:1680,height:1100});
  await page.goto(server.origin+'/lifetime/index.html');await paste(page,JSON.stringify(spec,null,2));await prepareEditorSurface(page);
}
// Screen geometry of one handle's hit area and the SVG user-unit scale.
async function handleAt(card,corner){
  return card.evaluate((el,corner)=>{const hit=el.querySelector('.dv-metrics-resize[data-corner="'+corner+'"] .dv-metrics-resize-hit');if(!hit)return null;
    const r=hit.getBoundingClientRect(),m=el.ownerSVGElement.getScreenCTM();return {x:r.x+r.width/2,y:r.y+r.height/2,scale:m.a};},corner);
}
async function dragHandle(page,card,corner,dx,{release=true,during}={}){
  const h=await handleAt(card,corner);expect(h,'the '+corner+' handle exists').not.toBeNull();
  await page.mouse.move(h.x,h.y);await page.mouse.down();await page.mouse.move(h.x+dx*h.scale,h.y,{steps:8});
  if(during)await during();
  if(release)await page.mouse.up();
}
const geometry=card=>card.evaluate(el=>{const m=el.transform.baseVal.consolidate().matrix,w=Number(el.querySelector('.dv-metrics-card-box').getAttribute('width'));return {x:m.e,y:m.f,w,right:m.e+w};});

test('R1 R4 desktop bottom-right handle drag grows the width with live feedback, never moves the card, and is one Undo step',async({page,server})=>{
  await open(page,server);await toggle(page).check();await expect(cards(page)).toHaveCount(1);
  const card=cards(page),source=page.locator('#src'),before=await source.inputValue(),start=await geometry(card);expect(start.w).toBe(240);
  const hit=await card.evaluate(el=>[...el.querySelectorAll('.dv-metrics-resize')].map(g=>{const r=g.querySelector('.dv-metrics-resize-hit');return [g.getAttribute('data-corner'),+r.getAttribute('width'),+r.getAttribute('height'),getComputedStyle(g).cursor];}));
  expect(hit).toEqual([['nw',20,20,'ew-resize'],['ne',20,20,'ew-resize'],['sw',20,20,'ew-resize'],['se',20,20,'ew-resize']]);
  await dragHandle(page,card,'se',60,{during:async()=>{
    await expect(card.locator('.dv-metrics-resize-readout')).toHaveText('Width 300');await expect(source).toHaveValue(before);
  }});
  await expect.poll(async()=>edge(await source.inputValue()).telemetry.card).toEqual({side:'below',offset:0,width:300});
  expect((await geometry(card)).w).toBe(300);
  await expect(card.locator('.dv-metrics-resize-readout')).toHaveCount(0);
  await page.locator('#editor-tab-inspect').click();await expect(page.locator('#guide').getByLabel('Card width',{exact:true})).toHaveValue('300');
  const resized=await source.inputValue();
  await page.locator('#undo-builder').click();await expect(source).toHaveValue(before);await expect.poll(async()=>(await geometry(card)).w).toBe(240);
  await page.locator('#redo-builder').click();await expect(source).toHaveValue(resized);
  // The card body still moves the card and never changes its width.
  const body=await card.evaluate(el=>{const r=el.querySelector('.dv-metrics-card-box').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};});
  await page.mouse.move(body.x,body.y);await page.mouse.down();await page.mouse.move(body.x+40,body.y+30,{steps:6});await page.mouse.up();
  await expect.poll(async()=>edge(await source.inputValue()).telemetry.card.position).toBeTruthy();
  expect(edge(await source.inputValue()).telemetry.card.width).toBe(300);
});

test('R2 desktop handle drags clamp at 480 and a left-handle drag on a manually placed card keeps its right edge',async({page,server})=>{
  const spec=JSON.parse(JSON.stringify(raw));spec.page.sections[0].diagram.edges[0].telemetry.card.position={x:-120,y:60};
  await open(page,server,spec);await toggle(page).check();await expect(cards(page)).toHaveCount(1);
  const card=cards(page),source=page.locator('#src');
  await dragHandle(page,card,'ne',260);
  await expect.poll(async()=>edge(await source.inputValue()).telemetry.card.width).toBe(480);
  expect(edge(await source.inputValue()).telemetry.card.position,'a right-handle drag keeps the manual position').toEqual({x:-120,y:60});
  const wide=await source.inputValue(),start=await geometry(card);expect(start.w).toBe(480);
  await dragHandle(page,card,'sw',100);
  await expect.poll(async()=>edge(await source.inputValue()).telemetry.card.width).toBe(380);
  const end=await geometry(card);expect(Math.abs(end.right-start.right),'right edge stays within 2 units').toBeLessThanOrEqual(2);
  expect(edge(await source.inputValue()).telemetry.card.position).toEqual({x:-20,y:60});
  await page.locator('#undo-builder').click();await expect(source).toHaveValue(wide);
  await dragHandle(page,card,'nw',360);
  await expect.poll(async()=>edge(await source.inputValue()).telemetry.card.width).toBe(140);
  const narrow=await geometry(card);expect(Math.abs(narrow.right-start.right)).toBeLessThanOrEqual(2);
});

test('R3 desktop Alt+Left/Right changes the focused card width; Escape cancels a handle drag',async({page,server})=>{
  await open(page,server);await toggle(page).check();await expect(cards(page)).toHaveCount(1);
  const card=cards(page),source=page.locator('#src');
  await card.focus();await card.press('Alt+ArrowRight');
  await expect.poll(async()=>edge(await source.inputValue()).telemetry.card.width).toBe(250);
  await expect(card).toBeFocused();
  await card.press('Shift+Alt+ArrowLeft');await expect.poll(async()=>edge(await source.inputValue()).telemetry.card.width).toBe(200);
  expect(edge(await source.inputValue()).telemetry.card.position,'keyboard width changes never move the card').toBeUndefined();
  const before=await source.inputValue();
  await dragHandle(page,card,'se',80,{release:false});await expect(card.locator('.dv-metrics-resize-readout')).toHaveText('Width 280');
  await page.keyboard.press('Escape');await page.mouse.up();
  await expect(source).toHaveValue(before);await expect.poll(async()=>(await geometry(card)).w).toBe(200);
  await expect(card.locator('.dv-metrics-resize-readout')).toHaveCount(0);
});

test('R5 desktop inherited imported connection handle drag saves the consumer override in one Undo step and keeps the Inspector scroll',async({page,server})=>{
  await open(page,server);
  const spec=(id,diagram)=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},sections:[{id:'main',diagram}]}});
  const provider=spec('provider',{nodes:{a:{title:'Provider A'},b:{title:'Provider B'}},rows:[['a','b']],edges:[{from:'a',to:'b',label:'Provider delivery',telemetry:binding}],topologyExports:{core:{nodes:['a','b'],edges:['a->b']}}});
  const consumer=spec('consumer',{nodes:{x:{title:'Local X'},y:{title:'Local Y'}},rows:[['x','y']],edges:[{from:'x',to:'y',label:'Local'}],topologyImports:[{spec:'provider',export:'core',as:'direct',position:{x:50,y:250}}]});
  await page.evaluate(({provider,consumer})=>{window.resizeImportContext={version:1,id:'consumer',specs:[provider,consumer]};window.__editorTest.builder.loadText(JSON.stringify(consumer),window.resizeImportContext);},{provider,consumer});
  await toggle(page).check();
  const card=page.locator('#docview .dv-metrics-card[data-metrics-card="direct::a->direct::b"]'),source=page.locator('#src'),guide=page.locator('#guide');
  await card.click();await page.locator('#editor-tab-inspect').click();await expect(guide.locator('.metrics-inherited')).toContainText('(read only)');
  const before=await source.inputValue();
  const top=await guide.evaluate(el=>{el.scrollTop=Math.min(200,el.scrollHeight-el.clientHeight);return el.scrollTop;});expect(top).toBeGreaterThan(40);
  await dragHandle(page,card,'se',40);
  const overlay=text=>JSON.parse(text).page.sections[0].diagram.topologyImports[0].edgeTracking?.['a->b']?.telemetry;
  await expect.poll(async()=>overlay(await source.inputValue())?.card?.width).toBe(280);
  expect(overlay(await source.inputValue()).signals).toEqual(binding.signals);
  expect(await page.evaluate(()=>window.resizeImportContext.specs[0])).toEqual(provider);
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  expect(Math.abs(await guide.evaluate(el=>el.scrollTop)-top),'Inspector scroll kept across the resize refresh').toBeLessThanOrEqual(2);
  await page.locator('#undo-builder').click();await expect(source).toHaveValue(before);
});

test('R6 readers never see metrics card handles',async({page,server})=>{
  await open(page,server);
  await page.evaluate(spec=>{const host=document.createElement('div');host.id='resize-reader';host.style.width='1400px';document.body.append(host);
    window.resizeReader=window.__editorTest.renderPage(host,window.__editorTest.normalize(spec),'pastel',null,{autoplay:false,telemetry:{provider:()=>({'a->b':{signals:{rate:{value:12},errors:{value:0}}}})}});window.resizeReader.telemetry.setEnabled(true);},raw);
  const count=()=>page.evaluate(()=>{const host=document.getElementById('resize-reader');return {cards:host.querySelectorAll('.dv-metrics-card').length,handles:host.querySelectorAll('.dv-metrics-resize').length,editable:host.querySelectorAll('.dv-metrics-card[data-metrics-section]').length};});
  await expect.poll(async()=>(await count()).cards,'the reader painted the card').toBe(1);
  expect(await count()).toEqual({cards:1,handles:0,editable:0});
});
