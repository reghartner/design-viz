/* #1243 part 4: the desktop Workbench Links window, Metrics tab (mockup m3).
   row | fixture | assertion | rejects
   M1 rows + highlight | board below (0 validator errors, 0 warnings) | the tab says Metrics (4) before it opens; rows http-service, kafka-topic, Raw signals, No metrics with their carriers; Highlight kafka-topic lights its edge and the Steps row of the step that lights it | a row missing a carrier, a highlight without steps
   M2 handle drop binds | same | dragging kafka-topic's handle onto the route edge label writes {use:"kafka-topic"} in one Undo step and opens its editor with topic and group flagged aria-invalid | a drop that writes nothing, unflagged missing parameters
   M3 chip drag switches | same | dragging the Notification service chip onto the kafka-topic row switches it in one Undo step | a copy, two Undo steps
   M4 inline edits | same | the topic parameter and a lag max limit save in one Undo step each; Remove metrics removes the binding | edits that drop other fields
   M5 raw → template asks | same | a drop onto Event ingest (raw signals) asks Replace; Esc writes nothing; Replace writes the template | raw signals silently lost
   M6 imported | consumer importing provider api with a binding | Provider metrics lists API; unticking Show errors writes the #1266 hide overlay; a template drop onto API is refused with "Templates aren't available on imported nodes yet" | a template replacing provider metrics
   M7 keyboard | same as M1 | Enter on a chip → Move to… → http-service switches it; Enter on a handle opens Assign, a tick binds and opens the editor with the missing parameter flagged | a keyboard path that skips the flag
   M8 sync + card kept | edge 0 card pinned at x 120, y 40, width 240 | a parameter edit in Links shows in Inspect's Metrics editor, and an edit there shows in Links, with no reload; switching edge 0 to http-service keeps its card position and width | a stale copy, a lost card pin */
import {test,expect,paste,closeTools,pointerTo} from '../helpers/test.mjs';
import {digest} from '../../canon/drift.mjs';

const fixture={page:{title:'Doorbell',tracking:{telemetry:{templates:{
  'kafka-topic':{kind:'queue',params:['topic','group'],signals:{lag:{grafana:'sum(kafka_consumergroup_lag{topic="$topic",group="$group"})',unit:'msgs'},rate:{grafana:'sum(rate(kafka_topic_messages_in_total{topic="$topic"}[5m]))',unit:'msg/s'}}},
  'http-service':{kind:'call',params:['service'],signals:{latency:{grafana:'histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{service="$service"}[5m])) by (le))',unit:'s'},errors:{grafana:'sum(rate(http_requests_total{service="$service",code=~"5.."}[5m]))'}}}}}},
  sections:[{heading:'Flow',diagram:{autoplay:false,
    nodes:{ctrl:{title:'Doorbell controller'},ingest:{title:'Event ingest',telemetry:{kind:'call',signals:{depth:{grafana:'sum(queue_depth{queue="events"})'}}}},notify:{title:'Notification service',telemetry:{use:'http-service',service:'notify'}},push:{title:'Push gateway'}},
    rows:[['ctrl','ingest','notify','push']],
    edges:[{from:'ctrl',to:'ingest',label:'event',telemetry:{use:'kafka-topic',topic:'doorbell-press',group:'ingest-workers'}},{from:'ingest',to:'notify',label:'route'},{from:'notify',to:'push',label:'push'}],
    steps:[{id:'publish',text:'publish',edge:'ctrl->ingest'},{id:'route',text:'route',edge:'ingest->notify',nodes:['notify']},{id:'push',text:'push',edge:'notify->push'}],
    panels:[{id:'status',type:'live-status',title:'Delivery status'}]}}]}};
const source=async page=>JSON.parse(await page.locator('#src').inputValue());
const diagram=raw=>raw.page.sections[0].diagram;
const CTRL_EDGE='connection Doorbell controller → Event ingest · event',ROUTE_EDGE='connection Event ingest → Notification service · route';

async function open(page,server,spec=fixture,count=4){
  await page.setViewportSize({width:1440,height:1000});
  await page.goto(server.origin+'/workbench.html');
  const text=JSON.stringify(spec,null,2);await paste(page,text);
  await expect(page.locator('#docview g.node[data-dv-node="ctrl"]')).toBeVisible();await closeTools(page);
  await page.locator('#editor-tab-links').click();
  const links=page.locator('#workspace-window-links');await expect(links).toBeVisible();
  if(await page.locator('#workspace-fit').isVisible())await page.locator('#workspace-fit').click();
  // The count shows before the tab is opened.
  await expect(links.getByRole('tab',{name:'Metrics ('+count+')',exact:true})).toBeVisible();
  await links.getByRole('tab',{name:/^Metrics/}).click();
  return {links,text,panel:links.getByRole('tabpanel')};
}
const metricRow=(panel,key)=>panel.locator('[data-links-metric="'+key+'"]');

test('M1 rows list each template, Raw signals and No metrics with their carriers; Highlight lights carriers and steps',async({page,server})=>{
  const {panel}=await open(page,server);
  expect(await panel.locator('[data-links-metric]').evaluateAll(list=>list.map(el=>el.getAttribute('data-links-metric')))).toEqual(['template:http-service','template:kafka-topic','raw','none']);
  const chips=async key=>(await metricRow(panel,key).locator('[data-links-chip]').evaluateAll(list=>list.map(el=>el.getAttribute('data-links-chip')))).sort();
  expect(await chips('template:kafka-topic')).toEqual(['edge:0:0']);
  expect(await chips('template:http-service')).toEqual(['node:0:notify']);
  expect(await chips('raw')).toEqual(['node:0:ingest']);
  expect(await chips('none')).toEqual(['edge:0:1','edge:0:2','node:0:ctrl','node:0:push']);
  await expect(metricRow(panel,'template:kafka-topic')).toContainText('step 1');
  await page.locator('#editor-tab-steps').click();await expect(page.locator('#steps-list [data-step-index="0"]')).toBeVisible();
  await page.locator('#editor-tab-links').click();
  await metricRow(panel,'template:kafka-topic').getByRole('button',{name:'Highlight kafka-topic',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>({edges:[...document.querySelectorAll('#docview path.edge.dv-links-lit')].map(e=>e.getAttribute('data-dv-edge')),steps:[...document.querySelectorAll('#steps-list .dv-links-lit')].map(e=>e.getAttribute('data-step-index'))}))).toEqual({edges:['0'],steps:['0']});
  await page.keyboard.press('Escape');
  await expect(page.locator('#docview .dv-links-lit')).toHaveCount(0);
});

test('M2 dropping a template handle onto an edge binds it in one Undo step and flags the missing parameters',async({page,server})=>{
  const {panel,text}=await open(page,server);
  const label=page.locator('#docview text.lbl[data-dv-edge="1"]');await expect(label).toBeInViewport();
  await pointerTo(page,metricRow(panel,'template:kafka-topic').getByRole('button',{name:'Drag kafka-topic to a node or connection',exact:true}),label,{release:false});
  await expect(page.locator('#docview path.edge[data-dv-edge="1"].dv-links-drop')).toHaveCount(1);
  await page.mouse.up();
  await expect.poll(async()=>diagram(await source(page)).edges[1].telemetry).toEqual({use:'kafka-topic'});
  const editor=panel.getByRole('group',{name:'Metrics on '+ROUTE_EDGE,exact:true});await expect(editor).toBeVisible();
  for(const p of ['topic','group'])await expect(editor.getByRole('textbox',{name:p,exact:true})).toHaveAttribute('aria-invalid','true');
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(text);
});

test('M3 dragging a carrier chip onto another template row switches it in one Undo step',async({page,server})=>{
  const {panel,text}=await open(page,server);
  await pointerTo(page,metricRow(panel,'template:http-service').locator('[data-links-chip="node:0:notify"] .links-chip-main'),metricRow(panel,'template:kafka-topic'),{release:false});
  await expect(metricRow(panel,'template:kafka-topic')).toHaveClass(/dv-links-drop/);
  await page.mouse.up();
  await expect.poll(async()=>diagram(await source(page)).nodes.notify.telemetry).toEqual({use:'kafka-topic'});
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(text);
});

test('M4 inline parameter and limit edits are one Undo step each; Remove metrics removes the binding',async({page,server})=>{
  const {panel,text}=await open(page,server);
  await metricRow(panel,'template:kafka-topic').getByRole('button',{name:'Edit metrics on '+CTRL_EDGE,exact:true}).click();
  const editor=()=>panel.getByRole('group',{name:'Metrics on '+CTRL_EDGE,exact:true});
  const topic=editor().getByRole('textbox',{name:'topic',exact:true});await topic.fill('doorbell-ring');await topic.press('Enter');
  await expect.poll(async()=>diagram(await source(page)).edges[0].telemetry.topic).toBe('doorbell-ring');
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(text);
  const max=editor().getByRole('textbox',{name:'lag max',exact:true});await max.fill('100');await max.press('Enter');
  await expect.poll(async()=>diagram(await source(page)).edges[0].telemetry.proof).toEqual({lag:{max:100}});
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(text);
  await editor().getByRole('button',{name:'Remove metrics',exact:true}).click();
  await expect.poll(async()=>diagram(await source(page)).edges[0].telemetry).toBeUndefined();
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(text);
});

test('M5 a drop onto a carrier with raw signals asks before replacing them; Esc writes nothing',async({page,server})=>{
  const {panel,text}=await open(page,server);
  const drag=metricRow(panel,'template:kafka-topic').getByRole('button',{name:'Drag kafka-topic to a node or connection',exact:true});
  await pointerTo(page,drag,metricRow(panel,'raw').locator('[data-links-chip="node:0:ingest"]'));
  const ask=page.getByRole('menu',{name:/Event ingest has raw signals/});await expect(ask).toBeVisible();
  await page.keyboard.press('Escape');await expect(ask).toBeHidden();await expect(page.locator('#src')).toHaveValue(text);
  await pointerTo(page,drag,metricRow(panel,'raw').locator('[data-links-chip="node:0:ingest"]'));
  await page.getByRole('menu',{name:/Event ingest has raw signals/}).getByRole('menuitem',{name:'Replace with kafka-topic',exact:true}).click();
  await expect.poll(async()=>diagram(await source(page)).nodes.ingest.telemetry).toEqual({use:'kafka-topic'});
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(text);
});

test('M6 imported carriers: Provider metrics, Hide/Show writes the overlay, a template drop is refused for now',async({page,server})=>{
  await page.setViewportSize({width:1440,height:1000});
  const model=(id,dg,tracking)=>({page:Object.assign({title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'}},tracking?{tracking}:{},{sections:[{id:'main',diagram:dg}]})});
  const provider=model('provider',{nodes:{api:{title:'API',telemetry:{kind:'call',signals:{latency:{grafana:'histogram_quantile(0.95, x)'},errors:{grafana:'sum(rate(errors[5m]))'}}}},store:{title:'Store'}},rows:[['api','store']],edges:[{from:'api',to:'store',label:'Persist'}],topologyExports:{core:{nodes:['api','store'],edges:['api->store']}}});
  const consumer=model('consumer',{autoplay:false,nodes:{local:{title:'Local worker'}},rows:[['local']],topologyImports:[{spec:'provider',export:'core',as:'canon'}],steps:[{id:'call',nodes:['canon::api']}],
    panels:[{id:'status',type:'live-status',title:'Delivery status'}]},fixture.page.tracking);
  const catalog={version:3,diagrams:[provider,consumer].map(spec=>({id:spec.page.canon.id,title:spec.page.title,canon:spec.page.canon,counts:{nodes:2,steps:0,panels:0},revision:digest(spec),specUrl:spec.page.canon.id+'.json'}))};
  await page.route('**/diagrams.json',route=>route.fulfill({json:catalog}));
  for(const spec of [provider,consumer])await page.route('**/'+spec.page.canon.id+'.json',route=>route.fulfill({json:spec}));
  await page.goto(server.origin+'/workbench.html');
  await page.locator('#welcome-file').setInputFiles({name:'consumer.spec.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(consumer,null,2))});
  await expect(page.locator('#docview g.node[data-dv-node="canon::api"]')).toBeVisible();await closeTools(page);
  await page.locator('#editor-tab-links').click();const links=page.locator('#workspace-window-links');
  await links.getByRole('tab',{name:/^Metrics/}).click();const panel=links.getByRole('tabpanel');
  const before=await page.locator('#src').inputValue();
  await expect(metricRow(panel,'provider').locator('[data-links-chip="node:0:canon::api"]')).toHaveCount(1);
  await metricRow(panel,'provider').getByRole('button',{name:'Edit metrics on node API',exact:true}).click();
  const show=panel.getByRole('group',{name:'Metrics on node API',exact:true}).getByRole('checkbox',{name:'Show errors',exact:true});
  await expect(show).toBeChecked();await show.uncheck();
  await expect.poll(async()=>diagram(await source(page)).topologyImports[0].nodeTracking.api.telemetry).toEqual({extends:true,hide:['errors']});
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(before);
  await pointerTo(page,metricRow(panel,'template:http-service').getByRole('button',{name:'Drag http-service to a node or connection',exact:true}),metricRow(panel,'provider').locator('[data-links-chip="node:0:canon::api"]'),{release:false});
  await expect(links.locator('.links-status')).toContainText('Templates aren’t available on imported nodes yet');
  await page.mouse.up();await expect(page.locator('#src')).toHaveValue(before);
});

test('M7 keyboard: Move to… switches template; Enter on a handle opens Assign and a tick binds and flags the missing parameter',async({page,server})=>{
  const {panel,text}=await open(page,server);
  const chip=metricRow(panel,'template:kafka-topic').locator('[data-links-chip="edge:0:0"] .links-chip-main');
  await chip.focus();await page.keyboard.press('Shift+F10');
  await page.getByRole('menu',{name:/kafka-topic on/}).getByRole('menuitem',{name:'Move to…'}).click();
  await page.getByRole('dialog',{name:/Move metrics of /}).getByRole('button',{name:'http-service',exact:true}).click();
  await expect.poll(async()=>diagram(await source(page)).edges[0].telemetry.use).toBe('http-service');
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(text);
  await metricRow(panel,'template:http-service').getByRole('button',{name:'Drag http-service to a node or connection',exact:true}).focus();await page.keyboard.press('Enter');
  const assign=page.getByRole('dialog',{name:'Assign http-service',exact:true});await expect(assign).toBeVisible();
  await assign.getByRole('checkbox',{name:'Push gateway',exact:true}).check();
  await expect.poll(async()=>diagram(await source(page)).nodes.push.telemetry).toEqual({use:'http-service'});
  await page.keyboard.press('Escape');
  await expect(panel.getByRole('group',{name:'Metrics on node Push gateway',exact:true}).getByRole('textbox',{name:'service',exact:true})).toHaveAttribute('aria-invalid','true');
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(text);
});

test('M8 Links and Inspect show each other\'s edits with no reload; switching template keeps the card pin',async({page,server})=>{
  const spec=JSON.parse(JSON.stringify(fixture));diagram(spec).edges[0].telemetry.card={position:{x:120,y:40},width:240};
  const {panel}=await open(page,server,spec);
  await metricRow(panel,'template:kafka-topic').getByRole('button',{name:'Edit metrics on '+CTRL_EDGE,exact:true}).click();
  const editor=()=>panel.getByRole('group',{name:'Metrics on '+CTRL_EDGE,exact:true});
  const topic=editor().getByRole('textbox',{name:'topic',exact:true});await topic.fill('doorbell-ring');await topic.press('Enter');
  await expect.poll(async()=>diagram(await source(page)).edges[0].telemetry.topic).toBe('doorbell-ring');
  await editor().getByRole('button',{name:'Open in Inspect',exact:true}).click();
  const guide=page.locator('#guide');
  await expect(guide.getByLabel('Template parameter topic',{exact:true})).toHaveValue('doorbell-ring');
  const group=guide.getByLabel('Template parameter group',{exact:true});await group.fill('alerts');await group.press('Enter');
  await expect.poll(async()=>diagram(await source(page)).edges[0].telemetry.group).toBe('alerts');
  await page.locator('#editor-tab-links').click();
  await expect(editor().getByRole('textbox',{name:'group',exact:true})).toHaveValue('alerts');
  await editor().getByRole('combobox',{name:'Signals from',exact:true}).selectOption('http-service');
  await expect.poll(async()=>diagram(await source(page)).edges[0].telemetry.use).toBe('http-service');
  expect(diagram(await source(page)).edges[0].telemetry.card).toEqual({position:{x:120,y:40},width:240});
});
