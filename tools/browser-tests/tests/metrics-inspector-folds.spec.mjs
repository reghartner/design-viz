/* #1228 desktop Workbench Inspect → Tracking → Metrics: same-selection edits keep the
   Inspector scroll and focus, and the Card / Signal folds stay open across the refresh.
| row | rule | fixture | assertion | broken implementation it rejects |
|---|---|---|---|---|
| F0 | An inherited imported connection (the reported case): scroll the Inspector so Card width is in view and commit a width; the edit writes the consumer override, the Inspector scrollTop is unchanged (within 2px) and Card width keeps focus. | consumer importing a provider connection with a binding; Preview metrics layout on | `edgeTracking['a->b'].telemetry.card.width`; `#guide` scrollTop; focused control | an imported form that rebuilds without restoring scroll and focus |
| F1 | Scroll the Inspector so Card width is in view and commit a new width: the Inspector scrollTop is unchanged (within 2px), Card width keeps focus and the Card fold is still open. | one bound connection (two signals, a card) | `#guide` scrollTop before/after; focused control; `details.metrics-fold` "Card" open | a refresh that resets the scroll or closes the fold |
| F2 | The same for one signal field (errors unit) in its Signal fold. | same | same, "Signal errors" fold | signal edits that reset the scroll |
| F3 | Status board settings → Metrics (#1236): a template signal edit keeps the Template and Signal folds open and the scroll. | page template with one signal | scrollTop within 2px; both folds open | page-level folds that close on refresh |
*/
import {test,expect,paste,prepareEditorSurface,openInspectorGroup} from '../helpers/test.mjs';
const binding={kind:'call',signals:{rate:{grafana:'up',unit:'req/h'},errors:{grafana:'errors',unit:'req/h'}},card:{side:'below',offset:0}};
const raw={page:{title:'Metrics folds',tracking:{telemetry:{templates:{queue:{kind:'queue',params:['topic'],signals:{lag:{grafana:'max(lag{topic="$topic"})',unit:'msgs'}}}}}},
  sections:[{id:'flow',heading:'Delivery',diagram:{nodes:{a:{title:'Sender'},b:{title:'Receiver'},c:{title:'Unbound'}},rows:[['a','b','c']],
  edges:[{from:'a',to:'b',label:'delivery',telemetry:binding},{from:'b',to:'c',label:'Unbound delivery'}],panels:[{id:'status',type:'live-status'}]}}]}};
const edge=text=>JSON.parse(text).page.sections[0].diagram.edges[0];
const fold=(scope,title)=>scope.locator('details.metrics-fold').filter({has:scope.page().locator(':scope > summary',{hasText:new RegExp('^'+title+'$')})});
async function open(page,server){
  await page.setViewportSize({width:1440,height:900});
  await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(raw,null,2));await prepareEditorSurface(page);
}
async function settle(page){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
async function openFold(scope,title){const f=fold(scope,title);if(await f.count())await openInspectorGroup(f);}
// Put the control mid-way down the Inspector and return the Inspector scrollTop.
async function scrollTo(page,control){
  const top=await control.evaluate(el=>{const g=document.getElementById('guide');g.scrollTop+=el.getBoundingClientRect().top-g.getBoundingClientRect().top-g.clientHeight/2;return g.scrollTop;});
  expect(top,'the Inspector scrolled down to the control').toBeGreaterThan(40);return top;
}
const guideTop=page=>page.locator('#guide').evaluate(el=>el.scrollTop);

function imports(){
  const spec=(id,diagram)=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},sections:[{id:'main',diagram}]}});
  const provider=spec('provider',{nodes:{a:{title:'Provider A'},b:{title:'Provider B'}},rows:[['a','b']],edges:[{from:'a',to:'b',label:'Provider delivery',telemetry:binding}],topologyExports:{core:{nodes:['a','b'],edges:['a->b']}}});
  const consumer=spec('consumer',{nodes:{x:{title:'Local X'},y:{title:'Local Y'}},rows:[['x','y']],edges:[{from:'x',to:'y',label:'Local'}],topologyImports:[{spec:'provider',export:'core',as:'direct',position:{x:50,y:250}}]});
  return {provider,consumer};
}
test('F0 desktop inherited imported connection Card width commit keeps the Inspector scroll and focus',async({page,server})=>{
  await page.setViewportSize({width:1440,height:900});
  await page.goto(server.origin+'/lifetime/index.html');await paste(page,JSON.stringify(raw,null,2));await prepareEditorSurface(page);
  const {provider,consumer}=imports();
  await page.evaluate(({provider,consumer})=>{window.foldsImportContext={version:1,id:'consumer',specs:[provider,consumer]};window.__editorTest.builder.loadText(JSON.stringify(consumer),window.foldsImportContext);},{provider,consumer});
  await page.getByRole('checkbox',{name:'Preview metrics layout',exact:true}).check();
  await page.locator('#docview .dv-metrics-card[data-metrics-card="direct::a->direct::b"]').click();await page.locator('#editor-tab-inspect').click();
  const guide=page.locator('#guide'),source=page.locator('#src'),control=guide.getByLabel('Card width',{exact:true});
  await expect(guide.locator('.metrics-inherited')).toContainText('(read only)');await expect(control).toHaveCount(1);
  await openFold(guide,'Card');await expect(control).toBeVisible();
  const before=await scrollTo(page,control);
  await control.click();await control.fill('300');await control.press('Enter');
  await expect.poll(async()=>JSON.parse(await source.inputValue()).page.sections[0].diagram.topologyImports[0].edgeTracking?.['a->b']?.telemetry?.card?.width).toBe(300);
  await settle(page);await settle(page);
  expect(Math.abs(await guideTop(page)-before),'Inspector scrollTop unchanged after the inherited Card width commit').toBeLessThanOrEqual(2);
  await expect(guide.getByLabel('Card width',{exact:true})).toBeFocused();
  await expect(fold(guide,'Card')).toHaveCount(1);await expect(fold(guide,'Card')).toHaveAttribute('open','');
});

for(const [row,foldTitle,label,value,read] of [
  ['F1','Card','Card width','300',t=>edge(t).telemetry.card.width],
  ['F2','Signal errors','errors unit','msgs',t=>edge(t).telemetry.signals.errors.unit]]){
  test(row+' desktop '+label+' commit keeps the Inspector scroll, focus and its open fold',async({page,server})=>{
    await open(page,server);const guide=page.locator('#guide'),source=page.locator('#src');
    await page.locator('#docview text.lbl[data-dv-edge="0"]').click();await page.locator('#editor-tab-inspect').click();
    const control=guide.getByLabel(label,{exact:true});await expect(control).toHaveCount(1);
    await openFold(guide,foldTitle);await expect(control).toBeVisible();
    const before=await scrollTo(page,control);
    await control.click();await control.fill(value);await control.press('Enter');
    await expect.poll(async()=>read(await source.inputValue())).toBe(value==='300'?300:value);
    await settle(page);await settle(page);
    expect(Math.abs(await guideTop(page)-before),'Inspector scrollTop unchanged after the '+label+' commit').toBeLessThanOrEqual(2);
    await expect(guide.getByLabel(label,{exact:true})).toBeFocused();
    await expect(fold(guide,foldTitle)).toHaveCount(1);await expect(fold(guide,foldTitle)).toHaveAttribute('open','');
  });
}

test('F3 desktop Status board settings template signal edit keeps the Inspector scroll and its Template and Signal folds open',async({page,server})=>{
  await open(page,server);const guide=page.locator('#guide'),source=page.locator('#src');
  await page.locator('#editor-tab-inspect').click();await page.locator('#status-board-settings').click();
  const control=guide.getByLabel('queue lag unit',{exact:true});await expect(control).toHaveCount(1);
  await openFold(guide,'Template queue');await openFold(fold(guide,'Template queue'),'Signal lag');await expect(control).toBeVisible();
  const before=await scrollTo(page,control);
  await control.click();await control.fill('items');await control.press('Enter');
  await expect.poll(async()=>JSON.parse(await source.inputValue()).page.tracking.telemetry.templates.queue.signals.lag.unit).toBe('items');
  await settle(page);await settle(page);
  expect(Math.abs(await guideTop(page)-before),'Inspector scrollTop unchanged after the template edit').toBeLessThanOrEqual(2);
  await expect(guide.getByLabel('queue lag unit',{exact:true})).toBeFocused();
  for(const scope of [fold(guide,'Template queue'),fold(fold(guide,'Template queue'),'Signal lag')]){await expect(scope).toHaveCount(1);await expect(scope).toHaveAttribute('open','');}
});
