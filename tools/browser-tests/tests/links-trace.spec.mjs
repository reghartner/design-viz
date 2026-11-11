/* #1243 part 2: the desktop Workbench Links window, Trace match tab (mockup m4).
   row | fixture | assertion | rejects
   T1 by trace match + highlight | board below | the notify-svc · route.event row has chips for steps 2 and 4 and the matched node; Highlight lights both Steps rows, step 2's edge and the node, and Esc clears | a list that misses a sharing step, a highlight of one step only
   T2 drag + Assign | same | dragging step 2's chip onto Steps row 3 (no match) moves the whole match in one Undo step; + Assign step ticks step 3 and writes {serviceName, operation}; Undo restores | a drop that copies, two Undo steps
   T3 by element edit + Add as alternative | same | step 2's chip opens the inline editor; an Operation edit is one Undo step; an unsupported attribute name (event.type) is refused beside its field with nothing written; dragging step 1's chip onto step 2 offers Replace / Add as alternative, and Add as alternative writes the array form in one Undo step | a silent replace, an edit that drops attributes
   T4 keyboard Move to… + Esc | same | Enter on step 1's chip → Move to… → Step 2 asks Replace / Add as alternative; Esc writes nothing; Replace writes step 1's match onto step 2 and clears step 1 | a keyboard path that skips the question, an Esc that writes
   T5 shared rename | same | Rename on the row says "Renames on 2 steps" before the write; Save changes both steps; one Undo restores both | a rename that changes one step, a count missing before the write
   T7 drag wording | same | a chip drag names its source step and asks for a step, never undefined or nodes/connections; a handle drop on a step with another match says "as an alternative" before and after the write | a status naming undefined, a silent alternative
   T8 refused rename | same | clearing Operation and pressing Rename keeps the typed values, marks Operation aria-invalid with the reason beside it, and writes nothing | lost typing, an error under the wrong field
   T9 editor Esc + gone alternative + failed create | same | Esc from the Node select closes the editor; removing the match being edited closes its editor; a re-render keeps the typed service and operation, and a refused Create keeps them with the reason beside Service name | an editor stuck on "This match changed", lost typing
   T10 refused menu choice | same | Move to… step 4 (it already has the same match) marks Add as alternative aria-disabled with its described reason; ArrowDown reaches it, Enter on it writes nothing and keeps the menu, ArrowDown reaches Cancel, Enter writes nothing | arrow keys stuck, a refused choice that writes or hides its reason
   T11 create draft follows its step | same | a + Add trace match draft on step 3 is dropped when a JSON edit removes step 1 and moves another step into its place | a draft that jumps to another step
   T12 id-less step | step 3 without an id | + Add trace match is focusable, aria-disabled and described by the visible reason; clicking it writes nothing and says the reason in the status line | a disabled control that hides its reason from keyboard users
   T6 imported node | consumer importing provider api | the Node select lists API (imported) and writes nodeId canon::api in one Undo step | imported nodes missing from the select
   T13 declarations (#1290 PR 8) | notify and ctrl->ingest declare spans; Path A shares notify, Path B does not | the route row lists "declared on Notification service (route)" and "Step 3 · push (inherited on Path B)"; the rename notice says it changes the steps' trace matches, not the declarations; Edit in Inspect opens the Trace spans fold; By element lists the node's own declarations | a declaration row that can be dragged or renamed, a rename that hides what it leaves alone */
import {test,expect,paste,closeTools,pointerTo} from '../helpers/test.mjs';
import {digest} from '../../canon/drift.mjs';

const KEY='notify-svc · route.event';
const fixture={page:{title:'Doorbell',sections:[{heading:'Flow',diagram:{autoplay:false,
  nodes:{ctrl:{title:'Doorbell controller'},ingest:{title:'Event ingest'},notify:{title:'Notification service'}},
  rows:[['ctrl','ingest','notify']],
  edges:[{from:'ctrl',to:'ingest',label:'event'},{from:'ingest',to:'notify',label:'route'}],
  steps:[
    {id:'publish',text:'The controller publishes',edge:'ctrl->ingest',traceMatch:{serviceName:'ingest-api',operation:'POST /v1/events'}},
    {id:'route',text:'Ingest routes the event',edge:'ingest->notify',traceMatch:{serviceName:'notify-svc',operation:'route.event',nodeId:'notify',attributes:{'deployment.environment.name':'prod'}}},
    {id:'push',text:'The service pushes an alert',nodes:['notify']},
    {id:'retry',text:'Offline: retry',nodes:['notify'],traceMatch:{serviceName:'notify-svc',operation:'route.event'}}]}}]}};
const source=async page=>JSON.parse(await page.locator('#src').inputValue());
// Edit the JSON source as an author does: the JSON window, then Render; then back to Links.
async function renderSource(page,edit){
  const raw=await source(page);edit(raw);
  await page.locator('#editor-tab-json').click();await page.locator('#src').fill(JSON.stringify(raw,null,2));await page.locator('#go').click();
  await page.locator('#editor-tab-links').click();
}
const steps=raw=>raw.page.sections[0].diagram.steps;

async function open(page,server,spec=fixture){
  await page.setViewportSize({width:1440,height:1000});
  await page.goto(server.origin+'/workbench.html');
  const text=JSON.stringify(spec,null,2);await paste(page,text);
  await expect(page.locator('#docview g.node[data-dv-node="ctrl"]')).toBeVisible();await closeTools(page);
  await page.locator('#editor-tab-links').click();
  const links=page.locator('#workspace-window-links');await expect(links).toBeVisible();
  if(await page.locator('#workspace-fit').isVisible())await page.locator('#workspace-fit').click();
  // The tab count shows before the tab is first opened (mockup m4).
  if(spec===fixture)await expect(links.getByRole('tab',{name:'Trace match (2)',exact:true})).toBeVisible();
  await links.getByRole('tab',{name:/^Trace match/}).click();
  await expect(links.getByRole('tab',{name:/^Trace match/})).toHaveAttribute('aria-selected','true');
  return {links,text,panel:links.getByRole('tabpanel')};
}

test('T1 By trace match lists notify-svc · route.event with both steps and its node, and highlights them',async({page,server})=>{
  const {panel}=await open(page,server);
  await expect(panel.getByRole('button',{name:'By trace match',exact:true})).toHaveAttribute('aria-pressed','true');
  const row=panel.locator('[data-links-trace="'+KEY+'"]');
  expect((await row.locator('[data-links-chip]').evaluateAll(list=>list.map(el=>el.getAttribute('data-links-chip')))).sort()).toEqual(['node:0:notify','step:0:1','step:0:3']);
  await page.locator('#editor-tab-steps').click();await expect(page.locator('#steps-list [data-step-index="3"]')).toBeVisible();
  await page.locator('#editor-tab-links').click();
  await row.getByRole('button',{name:'Highlight '+KEY,exact:true}).click();
  const lit=()=>page.evaluate(()=>({
    nodes:[...document.querySelectorAll('#docview g.node.dv-links-lit')].map(el=>el.getAttribute('data-dv-node')).sort(),
    edges:[...document.querySelectorAll('#docview path.edge.dv-links-lit')].map(el=>el.getAttribute('data-dv-edge')).sort(),
    steps:[...document.querySelectorAll('#steps-list .dv-links-lit')].map(el=>el.getAttribute('data-step-index')).sort()}));
  await expect.poll(lit).toEqual({nodes:['notify'],edges:['1'],steps:['1','3']});
  await expect(page.locator('.links-canvas-pill')).toContainText(KEY);
  await row.getByRole('button',{name:'Highlight '+KEY,exact:true}).focus();await page.keyboard.press('Escape');
  await expect.poll(lit).toEqual({nodes:[],edges:[],steps:[]});
});

test('T2 dragging a match onto a step with none moves it in one Undo step, and + Assign step gives a step the match',async({page,server})=>{
  const {panel,text}=await open(page,server);
  await page.locator('#editor-tab-steps').click();const target=page.locator('#steps-list [data-step-index="2"]');await expect(target).toBeVisible();
  await page.locator('#editor-tab-links').click();
  const chip=panel.locator('[data-links-trace="'+KEY+'"] [data-links-chip="step:0:1"] .links-chip-main');
  await pointerTo(page,chip,target,{release:false});
  await expect(target).toHaveClass(/dv-links-drop/);
  await page.mouse.up();
  await expect.poll(async()=>steps(await source(page))[2].traceMatch).toEqual({serviceName:'notify-svc',operation:'route.event',nodeId:'notify',attributes:{'deployment.environment.name':'prod'}});
  expect(steps(await source(page))[1].traceMatch).toBeUndefined();
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(text);

  await panel.locator('[data-links-trace="'+KEY+'"]').getByRole('button',{name:'Assign '+KEY+' to steps',exact:true}).click();
  const picker=page.getByRole('dialog',{name:'Assign '+KEY+' to steps'});await expect(picker).toBeVisible();
  await picker.getByRole('checkbox',{name:'Step 3 · push',exact:true}).check();
  await expect.poll(async()=>steps(await source(page))[2].traceMatch).toEqual({serviceName:'notify-svc',operation:'route.event'});
  await page.keyboard.press('Escape');await expect(picker).toBeHidden();
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(text);
});

test('T3 By element: the inline editor edits a match in one Undo step; a drop onto a step with a match offers Add as alternative',async({page,server})=>{
  const {panel,text}=await open(page,server);
  await panel.getByRole('button',{name:'By element',exact:true}).click();
  await panel.locator('[data-links-element="step:0:1"] [data-links-trace-chip="'+KEY+'"] .links-chip-main').click();
  const editor=panel.getByRole('group',{name:/^Trace match · Step 2/});await expect(editor).toBeVisible();
  const operation=editor.getByRole('textbox',{name:'Operation',exact:true});
  await operation.fill('route.event.v2');await operation.press('Enter');
  await expect.poll(async()=>steps(await source(page))[1].traceMatch.operation).toBe('route.event.v2');
  expect(steps(await source(page))[1].traceMatch.attributes).toEqual({'deployment.environment.name':'prod'});
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(text);
  // An attribute name trace matching does not support is refused beside its field, before any write.
  // The name field suggests the supported names (a datalist), so its role is combobox.
  const newName=editor.getByRole('combobox',{name:'New attribute name',exact:true});
  await newName.fill('event.type');await editor.getByRole('textbox',{name:'New attribute value',exact:true}).fill('doorbell.press');
  await editor.getByRole('button',{name:'Add attribute',exact:true}).click();
  await expect(newName).toHaveAttribute('aria-invalid','true');
  await expect(page.locator('#'+await newName.getAttribute('aria-describedby'))).toContainText('event.type is not a trace attribute');
  await expect(page.locator('#src')).toHaveValue(text);

  const from=panel.locator('[data-links-element="step:0:0"] [data-links-trace-chip="ingest-api · POST /v1/events"] .links-chip-main');
  const onto=panel.locator('[data-links-element="step:0:1"]');
  await pointerTo(page,from,onto);
  const ask=page.getByRole('menu',{name:/Step 2 · route already has a trace match/});await expect(ask).toBeVisible();
  await expect(page.locator('#src')).toHaveValue(text);
  await ask.getByRole('menuitem',{name:'Add as alternative'}).click();
  await expect.poll(async()=>Array.isArray(steps(await source(page))[1].traceMatch)).toBe(true);
  const after=steps(await source(page));
  expect(after[1].traceMatch[1]).toEqual({serviceName:'ingest-api',operation:'POST /v1/events'});expect(after[0].traceMatch).toBeUndefined();
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(text);
});

test('T4 keyboard Move to… onto a step with a match asks Replace or Add as alternative; Esc writes nothing',async({page,server})=>{
  const {panel,text}=await open(page,server);
  await panel.getByRole('button',{name:'By element',exact:true}).click();
  const chip=()=>panel.locator('[data-links-element="step:0:0"] [data-links-trace-chip="ingest-api · POST /v1/events"] .links-chip-main');
  async function moveToStep2(){
    await chip().focus();await page.keyboard.press('Enter');
    const menu=page.getByRole('menu',{name:/ingest-api · POST \/v1\/events/});await expect(menu).toBeVisible();
    await menu.getByRole('menuitem',{name:'Move to…'}).click();
    const picker=page.getByRole('dialog',{name:/Move ingest-api · POST \/v1\/events/});await expect(picker).toBeVisible();
    // A refused target (the source step) stays focusable, says why in visible text, and is described by it.
    const self=picker.getByRole('button',{name:'Step 1 · publish',exact:true});
    await expect(self).toHaveAttribute('aria-disabled','true');
    const why=page.locator('#'+await self.getAttribute('aria-describedby'));await expect(why).toBeVisible();await expect(why).toContainText('already here');
    await picker.getByRole('button',{name:'Step 2 · route',exact:true}).focus();await page.keyboard.press('Enter');
    const ask=page.getByRole('menu',{name:/Step 2 · route already has a trace match/});await expect(ask).toBeVisible();
    return ask;
  }
  let ask=await moveToStep2();
  await page.keyboard.press('Escape');await expect(ask).toBeHidden();
  await expect(page.locator('#src')).toHaveValue(text);
  ask=await moveToStep2();
  await ask.getByRole('menuitem',{name:'Replace'}).focus();await page.keyboard.press('Enter');
  await expect.poll(async()=>steps(await source(page))[1].traceMatch).toEqual({serviceName:'ingest-api',operation:'POST /v1/events'});
  expect(steps(await source(page))[0].traceMatch).toBeUndefined();
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(text);
});

test('T5 the shared rename says how many steps it changes before the write, and one Undo restores all of them',async({page,server})=>{
  const {panel,text}=await open(page,server);
  const row=panel.locator('[data-links-trace="'+KEY+'"]');
  await row.getByRole('button',{name:'Rename '+KEY,exact:true}).click();
  const form=row.getByRole('group',{name:'Rename '+KEY});await expect(form).toBeVisible();
  await expect(form).toContainText('Renames on 2 steps');
  await expect(page.locator('#src')).toHaveValue(text);
  await form.getByRole('textbox',{name:'Operation',exact:true}).fill('route.evt');
  await form.getByRole('button',{name:'Rename on 2 steps',exact:true}).click();
  await expect.poll(async()=>steps(await source(page)).map(st=>st.traceMatch && st.traceMatch.operation)).toEqual(['POST /v1/events','route.evt',undefined,'route.evt']);
  expect(steps(await source(page))[1].traceMatch.nodeId).toBe('notify');
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(text);
});

test('T6 the Node select lists imported nodes and writes the namespaced id',async({page,server})=>{
  await page.setViewportSize({width:1440,height:1000});
  const model=(id,dg)=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},sections:[{id:'main',diagram:dg}]}});
  const provider=model('provider',{nodes:{api:{title:'API'},store:{title:'Store'}},rows:[['api','store']],edges:[{from:'api',to:'store',label:'Persist'}],topologyExports:{core:{nodes:['api','store'],edges:['api->store']}}});
  const consumer=model('consumer',{autoplay:false,nodes:{local:{title:'Local worker'}},rows:[['local']],
    topologyImports:[{spec:'provider',export:'core',as:'canon'}],steps:[{id:'call',nodes:['canon::api'],traceMatch:{serviceName:'api',operation:'GET /items'}}]});
  const catalog={version:3,diagrams:[provider,consumer].map(spec=>({id:spec.page.canon.id,title:spec.page.title,canon:spec.page.canon,counts:{nodes:2,steps:0,panels:0},revision:digest(spec),specUrl:spec.page.canon.id+'.json'}))};
  await page.route('**/diagrams.json',route=>route.fulfill({json:catalog}));
  for(const spec of [provider,consumer])await page.route('**/'+spec.page.canon.id+'.json',route=>route.fulfill({json:spec}));
  await page.goto(server.origin+'/workbench.html');
  await page.locator('#welcome-file').setInputFiles({name:'consumer.spec.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(consumer,null,2))});
  await expect(page.locator('#docview g.node[data-dv-node="canon::api"]')).toBeVisible();await closeTools(page);
  await page.locator('#editor-tab-links').click();const links=page.locator('#workspace-window-links');
  await links.getByRole('tab',{name:/^Trace match/}).click();const panel=links.getByRole('tabpanel');
  const before=await page.locator('#src').inputValue();
  await panel.getByRole('button',{name:'By element',exact:true}).click();
  await panel.locator('[data-links-element="step:0:0"] [data-links-trace-chip="api · GET /items"] .links-chip-main').click();
  const node=panel.getByRole('group',{name:/^Trace match · Step 1/}).getByRole('combobox',{name:'Node',exact:true});
  await expect(node.locator('option',{hasText:'API (imported)'})).toHaveCount(1);
  await node.selectOption('canon::api');
  await expect.poll(async()=>steps(await source(page))[0].traceMatch.nodeId).toBe('canon::api');
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(before);
});

test('T7 drag status names the source step and asks for a step; a handle drop onto another match says it adds an alternative',async({page,server})=>{
  const {panel,text,links}=await open(page,server);
  const status=links.locator('.links-status');
  await page.locator('#editor-tab-steps').click();const push=page.locator('#steps-list [data-step-index="2"]'),publish=page.locator('#steps-list [data-step-index="0"]');await expect(push).toBeVisible();
  await page.locator('#editor-tab-links').click();
  const chip=panel.locator('[data-links-trace="'+KEY+'"] [data-links-chip="step:0:1"] .links-chip-main');
  const box=await chip.boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+12,box.y+box.height/2+40,{steps:4});
  await expect(status).toContainText('from Step 2 · route');await expect(status).toContainText('Drop on a step');
  await expect(status).not.toContainText('undefined');await expect(status).not.toContainText('connection');
  const target=await push.boundingBox();await page.mouse.move(target.x+target.width/2,target.y+target.height/2,{steps:10});
  await expect(status).toContainText('Drop to move '+KEY+' from Step 2 · route to Step 3 · push');
  await page.keyboard.press('Escape');await page.mouse.up();await expect(page.locator('#src')).toHaveValue(text);

  await pointerTo(page,panel.locator('[data-links-trace="'+KEY+'"]').getByRole('button',{name:/^Drag notify-svc/}),publish,{release:false});
  await expect(status).toContainText('as an alternative');
  await page.mouse.up();
  await expect.poll(async()=>(steps(await source(page))[0].traceMatch || []).length).toBe(2);
  await expect(status).toContainText('Gave Step 1 · publish '+KEY+' as an alternative');
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(text);
});

test('T8 a refused rename keeps the typed values and puts the reason under the field at fault',async({page,server})=>{
  const {panel,text}=await open(page,server);
  const row=panel.locator('[data-links-trace="'+KEY+'"]');
  await row.getByRole('button',{name:'Rename '+KEY,exact:true}).click();
  const form=row.getByRole('group',{name:'Rename '+KEY});
  await form.getByRole('textbox',{name:'Service name',exact:true}).fill('notify-v2');
  await form.getByRole('textbox',{name:'Operation',exact:true}).fill('');
  await form.getByRole('button',{name:'Rename on 2 steps',exact:true}).click();
  const again=panel.locator('[data-links-trace="'+KEY+'"]').getByRole('group',{name:'Rename '+KEY});
  const op=again.getByRole('textbox',{name:'Operation',exact:true});
  await expect(op).toHaveAttribute('aria-invalid','true');await expect(op).toHaveValue('');
  await expect(again.getByRole('textbox',{name:'Service name',exact:true})).toHaveValue('notify-v2');
  await expect(page.locator('#'+await op.getAttribute('aria-describedby'))).toContainText('service name and an operation');
  await expect(page.locator('#src')).toHaveValue(text);
  // Opening Rename on another row drops this row's unsaved typing; reopening shows the saved values.
  await panel.locator('[data-links-trace="ingest-api · POST /v1/events"]').getByRole('button',{name:'Rename ingest-api · POST /v1/events',exact:true}).click();
  await expect(panel.getByRole('group',{name:'Rename '+KEY})).toHaveCount(0);
  await panel.locator('[data-links-trace="'+KEY+'"]').getByRole('button',{name:'Rename '+KEY,exact:true}).click();
  const fresh=panel.getByRole('group',{name:'Rename '+KEY});
  await expect(fresh.getByRole('textbox',{name:'Service name',exact:true})).toHaveValue('notify-svc');
  await expect(fresh.getByRole('textbox',{name:'Operation',exact:true})).toHaveValue('route.event');
});

test('T9 inline editor: Esc from the Node select closes it, removing its match closes it, and a failed Create keeps the typing',async({page,server})=>{
  const {panel,text}=await open(page,server);
  await panel.getByRole('button',{name:'By element',exact:true}).click();
  const chip=panel.locator('[data-links-element="step:0:1"] [data-links-trace-chip="'+KEY+'"] .links-chip-main');
  await chip.click();
  const editor=panel.getByRole('group',{name:/^Trace match · Step 2/});await expect(editor).toBeVisible();
  await editor.getByRole('combobox',{name:'Node',exact:true}).focus();await page.keyboard.press('Escape');
  await expect(editor).toBeHidden();await expect(chip).toBeFocused();
  await chip.click();await expect(editor).toBeVisible();
  await panel.locator('[data-links-element="step:0:1"]').getByRole('button',{name:'Remove trace match '+KEY+' from Step 2 · route',exact:true}).click();
  await expect.poll(async()=>steps(await source(page))[1].traceMatch).toBeUndefined();
  await expect(panel.locator('.links-trace-editor')).toHaveCount(0);
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(text);

  await panel.locator('[data-links-element="step:0:2"]').getByRole('button',{name:'Add trace match to Step 3 · push',exact:true}).click();
  const create=panel.getByRole('group',{name:'New trace match · Step 3 · push'});
  await create.getByRole('textbox',{name:'Service name',exact:true}).fill('push-gw');
  await create.getByRole('textbox',{name:'Operation',exact:true}).fill('apns.send');
  // Another edit gives step 3 a match meanwhile (JSON + Render): the form keeps the typing, and Create is refused.
  await renderSource(page,raw=>{raw.page.sections[0].diagram.steps[2].traceMatch={serviceName:'other',operation:'op'};});
  await expect.poll(async()=>steps(await source(page))[2].traceMatch).toEqual({serviceName:'other',operation:'op'});
  await expect(create.getByRole('textbox',{name:'Service name',exact:true})).toHaveValue('push-gw');
  await create.getByRole('button',{name:'Create trace match',exact:true}).click();
  const kept=panel.getByRole('group',{name:'New trace match · Step 3 · push'});
  await expect(kept.getByRole('textbox',{name:'Service name',exact:true})).toHaveValue('push-gw');
  await expect(kept.getByRole('textbox',{name:'Operation',exact:true})).toHaveValue('apns.send');
  await expect(kept.getByRole('textbox',{name:'Service name',exact:true})).toHaveAttribute('aria-invalid','true');
});

test('T10 a refused Add as alternative is reachable by the arrow keys, says why, and Enter on it writes nothing',async({page,server})=>{
  const {panel,text}=await open(page,server);
  await panel.getByRole('button',{name:'By element',exact:true}).click();
  await panel.locator('[data-links-element="step:0:1"] [data-links-trace-chip="'+KEY+'"] .links-chip-main').focus();await page.keyboard.press('Enter');
  await page.getByRole('menu',{name:new RegExp(KEY)}).getByRole('menuitem',{name:'Move to…'}).click();
  await page.getByRole('dialog',{name:new RegExp('Move '+KEY)}).getByRole('button',{name:'Step 4 · retry',exact:true}).click();
  const ask=page.getByRole('menu',{name:/Step 4 · retry already has a trace match/});await expect(ask).toBeVisible();
  const alternative=ask.getByRole('menuitem',{name:'Add as alternative'});
  await expect(alternative).toHaveAttribute('aria-disabled','true');
  const why=page.locator('#'+await alternative.getAttribute('aria-describedby'));await expect(why).toBeVisible();await expect(why).toContainText('already has '+KEY);
  await expect(ask.getByRole('menuitem',{name:'Replace'})).toBeFocused();
  // The refused choice is reachable by the arrow keys; Enter on it writes nothing and keeps the menu open.
  await page.keyboard.press('ArrowDown');await expect(alternative).toBeFocused();
  await page.keyboard.press('Enter');await expect(ask).toBeVisible();await expect(page.locator('#src')).toHaveValue(text);
  await expect(page.locator('#workspace-window-links .links-status')).toContainText('Cannot add as an alternative');
  await page.keyboard.press('ArrowDown');await expect(ask.getByRole('menuitem',{name:'Cancel'})).toBeFocused();
  await page.keyboard.press('Enter');await expect(ask).toBeHidden();
  await expect(page.locator('#src')).toHaveValue(text);
});

test('T11 a new trace match draft is dropped when its step moves away',async({page,server})=>{
  const {panel}=await open(page,server);
  await panel.getByRole('button',{name:'By element',exact:true}).click();
  await panel.locator('[data-links-element="step:0:2"]').getByRole('button',{name:'Add trace match to Step 3 · push',exact:true}).click();
  await panel.getByRole('group',{name:'New trace match · Step 3 · push'}).getByRole('textbox',{name:'Service name',exact:true}).fill('push-gw');
  await renderSource(page,raw=>{raw.page.sections[0].diagram.steps.splice(0,1);});
  await expect.poll(async()=>steps(await source(page)).length).toBe(3);
  await expect(panel.locator('.links-trace-editor')).toHaveCount(0);
  await expect(panel.locator('[data-links-element="step:0:1"]').getByRole('button',{name:'Add trace match to Step 2 · push',exact:true})).toBeVisible();
});

test('T12 + Add trace match on a step without an id is focusable, explains why, and does nothing',async({page,server})=>{
  const spec=JSON.parse(JSON.stringify(fixture));delete spec.page.sections[0].diagram.steps[2].id;
  const {panel,text,links}=await open(page,server,spec);
  await panel.getByRole('button',{name:'By element',exact:true}).click();
  const add=panel.locator('[data-links-element="step:0:2"]').getByRole('button',{name:/^Add trace match to Step 3/});
  await add.focus();await expect(add).toBeFocused();
  await expect(add).toHaveAttribute('aria-disabled','true');
  const why=page.locator('#'+await add.getAttribute('aria-describedby'));await expect(why).toBeVisible();await expect(why).toContainText('Give this step an id in Inspect first');
  // An aria-disabled control is refused by its handler; activate it the way a keyboard user does.
  await page.keyboard.press('Enter');
  await expect(panel.locator('.links-trace-editor')).toHaveCount(0);
  await expect(links.locator('.links-status')).toContainText('Give this step an id in Inspect first');
  await expect(page.locator('#src')).toHaveValue(text);
});

test('T13 declared spans: read-only rows with inheriting steps per path, a plain rename notice, Edit in Inspect, By element',async({page,server})=>{
  const spec=JSON.parse(JSON.stringify(fixture)),dd=spec.page.sections[0].diagram;
  dd.nodes.notify.trace={spans:{route:{serviceName:'notify-svc',operation:'route.event',role:'process'},lookup:{serviceName:'notify-svc',operationPrefix:'GET ',role:'database'}}};
  dd.edges[0].trace={spans:{send:{serviceName:'ingest-api',operation:'POST /v1/events',role:'send'}}};
  delete dd.steps[0].traceMatch;
  dd.paths=[{id:'a',label:'Path A',steps:['publish','route','push','retry']},{id:'b',label:'Path B',steps:['publish','push']}];
  const {panel}=await open(page,server,spec);
  const row=panel.locator('[data-links-trace="'+KEY+'"]');
  await expect(row.locator('.links-declaration')).toHaveText(['declared on Notification service (route)']);
  await expect(row.locator('.links-inherited')).toHaveText(['Step 3 · push (inherited on Path B)']);
  const prefix=panel.locator('[data-links-trace="notify-svc · GET … (prefix)"]');
  await expect(prefix.getByRole('button',{name:/^Rename/})).toHaveCount(0);await expect(prefix.locator('.links-handle')).toHaveCount(0);
  await row.getByRole('button',{name:'Rename '+KEY,exact:true}).click();
  await expect(row.locator('.links-trace-rename')).toContainText('This changes the steps\' trace matches only, not the spans declared on nodes and connections.');
  await row.getByRole('button',{name:'Cancel',exact:true}).click();
  const edit=row.getByRole('button',{name:'Edit route on Notification service in Inspect',exact:true});
  const box=await edit.boundingBox();expect(box.height,'the button is at least 24px tall').toBeGreaterThanOrEqual(24);
  await edit.click();
  const fold=page.locator('#guide details.trace-spans-editor');
  await expect(fold).toBeVisible();expect(await fold.evaluate(el=>el.open)).toBe(true);
  await expect(fold.getByLabel('route service',{exact:true})).toHaveValue('notify-svc');
  if(!await page.locator('#workspace-window-links').isVisible())await page.locator('#editor-tab-links').click();
  await panel.getByRole('button',{name:'By element',exact:true}).click();
  await expect(panel.locator('[data-links-element="node:0:notify"] .links-declaration')).toHaveText(['route · notify-svc route.event','lookup · notify-svc GET … (prefix)']);
});
