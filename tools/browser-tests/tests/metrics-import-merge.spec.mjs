/* #1266 desktop Workbench: an imported connection's metrics are the provider binding plus this
   document's additions minus its hidden signals.
| row | rule | fixture | assertion | broken implementation it rejects |
|---|---|---|---|---|
| G1 | Add signal on an inherited connection adds to the inherited signals; hiding an inherited signal removes it from the card; each step is one Undo; the provider is untouched. | consumer importing a provider connection with rate and errors; Preview metrics layout on | the card's signal rows (data-signal) after each step and each Undo; the overlay stores `extends` with the addition and `hide` | replace (inherited signals vanish); filters that keep the hidden row; multi-step history |
*/
import {test,expect,paste,prepareEditorSurface,openMetricsFold} from '../helpers/test.mjs';
const binding={kind:'call',signals:{rate:{grafana:'up',unit:'req/h'},errors:{grafana:'errors',unit:'req/h'}},card:{side:'below',offset:0}};
const spec=(id,diagram)=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},sections:[{id:'main',diagram}]}});
const provider=spec('provider',{nodes:{a:{title:'Provider A'},b:{title:'Provider B'}},rows:[['a','b']],edges:[{from:'a',to:'b',label:'Provider delivery',telemetry:binding}],topologyExports:{core:{nodes:['a','b'],edges:['a->b']}}});
const consumer=spec('consumer',{nodes:{x:{title:'Local X'}},rows:[['x']],edges:[],panels:[{id:'status',type:'live-status'}],topologyImports:[{spec:'provider',export:'core',as:'direct',position:{x:50,y:250}}]});

test('G1 desktop imported connection: Add signal adds and Hide filters inherited signals on the metrics card, one Undo each',async({page,server})=>{
  await page.setViewportSize({width:1680,height:1100});
  await page.goto(server.origin+'/lifetime/index.html');await paste(page,JSON.stringify({page:{title:'x',sections:[{diagram:{nodes:{x:{title:'X'}},rows:[['x']]}}]}}));await prepareEditorSurface(page);
  await page.evaluate(({provider,consumer})=>{window.mergeContext={version:1,id:'consumer',specs:[provider,consumer]};window.__editorTest.builder.loadText(JSON.stringify(consumer),window.mergeContext);},{provider,consumer});
  await page.getByRole('checkbox',{name:'Preview metrics layout',exact:true}).check();
  const card=page.locator('#docview .dv-metrics-card[data-metrics-card="direct::a->direct::b"]'),source=page.locator('#src'),guide=page.locator('#guide');
  const rows=()=>card.evaluate(el=>[...new Set([...el.querySelectorAll('.dv-metrics-card-label[data-signal]')].map(t=>t.getAttribute('data-signal')))].sort().join(','));
  const overlay=async()=>JSON.parse(await source.inputValue()).page.sections[0].diagram.topologyImports[0].edgeTracking?.['a->b']?.telemetry;
  await expect(card).toHaveCount(1);await expect.poll(rows).toBe('errors,rate');
  await card.click();await page.locator('#editor-tab-inspect').click();
  await expect(guide.locator('.metrics-inherited')).toContainText('Signals you add here are added to the provider');
  const original=await source.inputValue();
  await openMetricsFold(guide,'New signal');
  await guide.getByLabel('New signal name',{exact:true}).fill('local');await guide.getByLabel('New signal query',{exact:true}).fill('consumer_rate');
  await guide.getByRole('button',{name:'Add signal',exact:true}).click();
  await expect.poll(overlay).toEqual({extends:true,kind:'call',signals:{local:{grafana:'consumer_rate'}}});
  await expect.poll(rows,'the added signal joins the inherited ones').toBe('errors,local,rate');
  const added=await source.inputValue();
  await card.click();await openMetricsFold(guide,'Signal errors · inherited');
  const hide=guide.getByLabel('errors hidden for this document',{exact:true});await expect(hide).not.toBeChecked();await hide.check();
  await expect.poll(overlay).toEqual({extends:true,kind:'call',signals:{local:{grafana:'consumer_rate'}},hide:['errors']});
  await expect.poll(rows,'the hidden inherited signal leaves the card').toBe('local,rate');
  await page.locator('#undo-builder').click();await expect(source).toHaveValue(added);await expect.poll(rows).toBe('errors,local,rate');
  await page.locator('#undo-builder').click();await expect(source).toHaveValue(original);await expect.poll(rows).toBe('errors,rate');
  expect(await page.evaluate(()=>window.mergeContext.specs[0])).toEqual(provider);
});
