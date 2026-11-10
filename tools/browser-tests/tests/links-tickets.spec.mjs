/* #1243 part 1: the desktop Workbench Links window, Tickets tab.
   row | fixture | assertion | rejects
   B1 by ticket + highlight | board below | FW-45 row lists chips for node ctrl, edge ctrl->ingest and step 2; Highlight FW-45 marks those on the canvas and the Steps row, dims the rest; Esc clears | a list that misses step links, or a highlight that only selects one element
   B2 drag + Assign | same | dragging FW-45's handle onto the ingest->notify label adds FW-45 to edges[2].tickets; one Undo restores the source; + Assign ticks node notify (one Undo step each) | a drop that writes nothing, a drop that takes two Undo steps
   B4 canvas pill | same | the canvas pill names FW-45 and its Clear ends the highlight; closing Links ends it too | a dimmed canvas with no explanation after Links closes
   B5 refused step move | ctrl with FW-45, FW-46 plus a step lighting ctrl with ticketFilter [FW-46] | dragging the FW-45 chip from ctrl onto that step marks it refused, not amber, and the drop changes nothing | a move that deletes the ticket
   B6 keyboard + Edit key | B1 board | Enter on the FW-45 handle opens Assign; Edit key with a bad key marks the field aria-invalid with the message beside it; Edit key onto BE-67 asks to merge and Merge writes BE-67 in one Undo step | errors far from the field, a silent merge
   B7 reveal + Esc on canvas | 40 filler steps, then a step lighting ingest | Highlight BE-67 scrolls its Steps row into view without moving the Steps window, leaves the linked node clickable, and Esc pressed on the canvas clears the highlight | a highlight off screen or under a tool window, Esc only working inside Links
   B8 imported overlay | consumer importing provider api (CAN-1) with nodeTracking API-2 | the inherited CAN-1 chip has no remove; + Assign LOC-1 ticks API and writes topologyImports[0].nodeTracking.api; Undo restores | writing onto the imported node, removable inherited tickets
   B3 by element move | same | By element: step 2 row shows FW-45; dragging the FW-45 chip from the ctrl row onto the notify row moves it in one Undo step; ⌥-drag copies; Enter on a chip offers Move to… and moving by keyboard writes the same | a move that leaves the source, a copy that removes it */
import {test,expect,paste,closeTools,pointerTo} from '../helpers/test.mjs';
import {digest} from '../../canon/drift.mjs';

const fixture={page:{title:'Doorbell',sections:[{heading:'Flow',diagram:{autoplay:false,
  nodes:{button:{title:'Doorbell button'},ctrl:{title:'Doorbell controller',tickets:['FW-45']},ingest:{title:'Event ingest',tickets:['BE-67']},notify:{title:'Notification service'}},
  rows:[['button','ctrl','ingest','notify']],
  edges:[{from:'button',to:'ctrl',label:'press'},{from:'ctrl',to:'ingest',label:'event',tickets:['FW-45']},{from:'ingest',to:'notify',label:'route'}],
  steps:[{id:'press',text:'The button reports a press',edge:'button->ctrl'},{id:'publish',text:'The controller publishes',nodes:['ctrl']},{id:'route',text:'Ingest routes the event',nodes:['ingest'],edge:'ingest->notify'}]}}]}};
const source=async page=>JSON.parse(await page.locator('#src').inputValue());
const diagram=raw=>raw.page.sections[0].diagram;

async function open(page,server,spec=fixture){
  await page.setViewportSize({width:1440,height:1000});
  await page.goto(server.origin+'/workbench.html');
  const text=JSON.stringify(spec,null,2);await paste(page,text);
  await expect(page.locator('#docview g.node[data-dv-node="ctrl"]')).toBeVisible();await closeTools(page);
  await page.locator('#editor-tab-links').click();
  const links=page.locator('#workspace-window-links');await expect(links).toBeVisible();
  // In diagram mode, Fit leaves room for the open Links window; a static board has no Fit button.
  if(await page.locator('#workspace-fit').isVisible())await page.locator('#workspace-fit').click();
  return {links,text};
}

test('B1 Links by ticket lists FW-45 with its node, edge and step, and highlights them on the canvas and in Steps',async({page,server})=>{
  const {links}=await open(page,server);
  await expect(links.getByRole('tab',{name:/^Tickets/})).toHaveAttribute('aria-selected','true');
  for(const name of [/^Metrics/,/^Trace match/,/^Log searches/]){
    await links.getByRole('tab',{name}).click();await expect(links.getByRole('tabpanel')).toContainText('Coming next');
  }
  await links.getByRole('tab',{name:/^Tickets/}).click();
  await expect(links.getByRole('button',{name:'By ticket',exact:true})).toHaveAttribute('aria-pressed','true');
  const row=links.locator('[data-links-ticket="FW-45"]');
  await expect(row.locator('[data-links-chip]')).toHaveCount(3);
  expect((await row.locator('[data-links-chip]').evaluateAll(list=>list.map(el=>el.getAttribute('data-links-chip')))).sort()).toEqual(['edge:0:1','node:0:ctrl','step:0:1']);
  await page.locator('#editor-tab-steps').click();await expect(page.locator('#steps-list [data-step-index="1"]')).toBeVisible();
  await page.locator('#editor-tab-links').click();
  await row.getByRole('button',{name:'Highlight FW-45',exact:true}).click();
  const lit=()=>page.evaluate(()=>({
    nodes:[...document.querySelectorAll('#docview g.node.dv-links-lit')].map(el=>el.getAttribute('data-dv-node')).sort(),
    edges:[...document.querySelectorAll('#docview path.edge.dv-links-lit')].map(el=>el.getAttribute('data-dv-edge')).sort(),
    steps:[...document.querySelectorAll('#steps-list .dv-links-lit')].map(el=>el.getAttribute('data-step-index')).sort(),
    dimmed:document.querySelectorAll('#docview .doc-sec.dv-links-dimming').length}));
  await expect.poll(lit).toEqual({nodes:['ctrl'],edges:['1'],steps:['1'],dimmed:1});
  await expect(links.locator('.links-status')).toContainText('FW-45');
  await page.keyboard.press('Escape');
  await expect.poll(lit).toEqual({nodes:[],edges:[],steps:[],dimmed:0});
});

test('B2 dragging FW-45 onto an edge attaches it in one Undo step, and + Assign ticks a node',async({page,server})=>{
  const {links,text}=await open(page,server);
  const row=links.locator('[data-links-ticket="FW-45"]');
  const handle=row.getByRole('button',{name:/^Drag FW-45/});
  await expect(handle).toBeVisible();
  const box=await handle.boundingBox();expect(box.width).toBeGreaterThanOrEqual(24);expect(box.height).toBeGreaterThanOrEqual(24);
  const label=page.locator('#docview text.lbl[data-dv-edge="2"]');
  // Default placement: the label may sit under the Links window; the drag looks through it.
  await expect(label).toBeInViewport();
  await pointerTo(page,handle,label,{release:false});
  await expect(page.locator('#docview path.edge[data-dv-edge="2"].dv-links-drop')).toHaveCount(1);
  await expect(links.locator('.links-status')).toContainText('Drop to');
  await page.mouse.up();
  await expect.poll(async()=>diagram(await source(page)).edges[2].tickets).toEqual(['FW-45']);
  expect(diagram(await source(page)).nodes.ctrl.tickets).toEqual(['FW-45']);
  await page.locator('#undo-builder').click();
  await expect(page.locator('#src')).toHaveValue(text);

  await row.getByRole('button',{name:'Assign FW-45',exact:true}).click();
  const picker=page.getByRole('dialog',{name:'Assign FW-45'});await expect(picker).toBeVisible();
  const notify=picker.getByRole('checkbox',{name:'Notification service',exact:true});
  await expect(notify).not.toBeChecked();await notify.check();
  await expect.poll(async()=>diagram(await source(page)).nodes.notify.tickets).toEqual(['FW-45']);
  await page.keyboard.press('Escape');await expect(picker).toBeHidden();
  await expect(row.getByRole('button',{name:'Assign FW-45',exact:true})).toBeFocused();
  await page.locator('#undo-builder').click();
  await expect(page.locator('#src')).toHaveValue(text);
});

test('B3 By element: the step row shows FW-45; a chip drag moves it in one Undo step, ⌥-drag copies, Enter offers Move to…',async({page,server})=>{
  const {links,text}=await open(page,server);
  await links.getByRole('button',{name:'By element',exact:true}).click();
  await expect(links.locator('[data-links-element="step:0:1"] [data-links-chip-ticket="FW-45"]')).toHaveCount(1);
  const chip=links.locator('[data-links-element="node:0:ctrl"] [data-links-chip-ticket="FW-45"] .links-chip-main');
  const target=links.locator('[data-links-element="node:0:notify"]');
  await pointerTo(page,chip,target,{release:false});
  await expect(target).toHaveClass(/dv-links-drop/);
  await page.mouse.up();
  await expect.poll(async()=>diagram(await source(page)).nodes.notify.tickets).toEqual(['FW-45']);
  expect(diagram(await source(page)).nodes.ctrl.tickets).toBeUndefined();
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(text);

  await page.keyboard.down('Alt');
  await pointerTo(page,links.locator('[data-links-element="node:0:ctrl"] [data-links-chip-ticket="FW-45"] .links-chip-main'),target);
  await page.keyboard.up('Alt');
  await expect.poll(async()=>diagram(await source(page)).nodes.notify.tickets).toEqual(['FW-45']);
  expect(diagram(await source(page)).nodes.ctrl.tickets).toEqual(['FW-45']);
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(text);

  const again=links.locator('[data-links-element="node:0:ctrl"] [data-links-chip-ticket="FW-45"] .links-chip-main');
  await again.focus();await page.keyboard.press('Enter');
  const menu=page.getByRole('menu',{name:/FW-45/});await expect(menu).toBeVisible();
  await menu.getByRole('menuitem',{name:'Move to…'}).click();
  const picker=page.getByRole('dialog',{name:/Move FW-45/});await expect(picker).toBeVisible();
  await picker.getByRole('button',{name:'Notification service',exact:true}).click();
  await expect.poll(async()=>diagram(await source(page)).nodes.notify.tickets).toEqual(['FW-45']);
  expect(diagram(await source(page)).nodes.ctrl.tickets).toBeUndefined();
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(text);
});

test('B4 the canvas pill explains and clears the highlight, and closing Links clears it',async({page,server})=>{
  const {links}=await open(page,server);
  const pill=page.locator('.links-canvas-pill'),litCount=()=>page.locator('#docview .dv-links-lit').count();
  await expect(pill).toBeHidden();
  await links.locator('[data-links-ticket="FW-45"]').getByRole('button',{name:'Highlight FW-45',exact:true}).click();
  await expect(pill).toBeVisible();await expect(pill).toContainText('FW-45');
  await pill.getByRole('button',{name:'Clear link highlight'}).click();
  await expect(pill).toBeHidden();await expect.poll(litCount).toBe(0);
  await links.locator('[data-links-ticket="FW-45"]').getByRole('button',{name:'Highlight FW-45',exact:true}).click();
  await expect.poll(litCount).toBeGreaterThan(0);
  await links.locator('.workspace-window-close').click();
  await expect(links).toBeHidden();await expect(pill).toBeHidden();await expect.poll(litCount).toBe(0);
  await expect(page.locator('#docview .dv-links-dimming')).toHaveCount(0);
});

test('B5 dragging a ticket from a node onto a step it would vanish from is refused before the drop',async({page,server})=>{
  const spec=JSON.parse(JSON.stringify(fixture)),d=diagram(spec);
  d.nodes.ctrl.tickets=['FW-45','FW-46'];d.steps.push({id:'chime',text:'The controller rings the chime',nodes:['ctrl'],ticketFilter:['FW-46']});
  const second=await open(page,server,spec);
  await second.links.getByRole('button',{name:'By element',exact:true}).click();
  const step=second.links.locator('[data-links-element="step:0:3"]');
  await pointerTo(page,second.links.locator('[data-links-element="node:0:ctrl"] [data-links-chip-ticket="FW-45"] .links-chip-main'),step,{release:false});
  await expect(step).toHaveClass(/dv-links-refused/);await expect(step).not.toHaveClass(/dv-links-drop/);
  await expect(second.links.locator('.links-status')).toContainText('Hold ⌥');
  await page.mouse.up();
  await expect(page.locator('#src')).toHaveValue(second.text);
  await expect(second.links.locator('.links-error')).toContainText('would take it off the node');
});

test('B6 Enter on the handle opens Assign; Edit key errors sit beside the field; renaming onto an existing key asks to merge',async({page,server})=>{
  const {links,text}=await open(page,server);
  const row=links.locator('[data-links-ticket="FW-45"]');
  await row.getByRole('button',{name:/^Drag FW-45/}).focus();await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog',{name:'Assign FW-45'})).toBeVisible();
  await page.keyboard.press('Escape');await expect(page.getByRole('dialog',{name:'Assign FW-45'})).toBeHidden();
  await row.getByRole('button',{name:'Edit key FW-45'}).click();
  const field=row.getByRole('textbox',{name:'New key for FW-45'});await expect(field).toBeFocused();
  await field.fill('fw 45');await field.press('Enter');
  await expect(field).toHaveAttribute('aria-invalid','true');
  const described=await field.getAttribute('aria-describedby');
  await expect(page.locator('#'+described)).toContainText('Jira key');
  await field.fill('BE-67');await field.press('Enter');
  await expect(page.locator('#src')).toHaveValue(text);
  await expect(row).toContainText('BE-67 already exists. Merge FW-45 into it?');
  await row.getByRole('button',{name:'Merge into BE-67'}).click();
  await expect.poll(async()=>diagram(await source(page)).nodes.ctrl.tickets).toEqual(['BE-67']);
  expect(diagram(await source(page)).edges[1].tickets).toEqual(['BE-67']);
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(text);
});

test('B7 highlighting scrolls the Steps row into view, and Esc on the canvas clears it',async({page,server})=>{
  const spec=JSON.parse(JSON.stringify(fixture)),d=diagram(spec);
  for(let i=0;i<40;i++)d.steps.push({id:'filler'+i,text:'Filler step '+i,nodes:['button']});
  d.steps.push({id:'late',text:'Ingest checks the event',nodes:['ingest']});
  const {links}=await open(page,server,spec),late=d.steps.length-1;
  await page.locator('#editor-tab-steps').click();await expect(page.locator('#steps-list [data-step-index="0"]')).toBeVisible();
  await expect(page.locator('#steps-list [data-step-index="'+late+'"]')).not.toBeInViewport();
  await page.locator('#editor-tab-links').click();
  // The Steps row reveal scrolls only the Steps list; it never moves a tool window over the canvas.
  const stepsBox=await page.locator('#workspace-window-steps').boundingBox();
  await links.locator('[data-links-ticket="BE-67"]').getByRole('button',{name:'Highlight BE-67',exact:true}).click();
  const row=page.locator('#steps-list [data-step-index="'+late+'"]');
  await expect(row).toHaveClass(/dv-links-lit/);await expect(row).toBeInViewport();
  // The linked node is revealed where it can be clicked: in the viewport and not under any tool window.
  const ingest=page.locator('#docview g.node[data-dv-node="ingest"]');
  await expect(ingest).toBeInViewport();
  await expect.poll(()=>ingest.evaluate(n=>{const r=(n.querySelector('.card') || n).getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return !!hit && n.contains(hit);})).toBe(true);
  expect(await page.locator('#workspace-window-steps').boundingBox()).toEqual(stepsBox);
  await ingest.click();
  await expect(page.locator('#workspace-window-links .links-key:focus')).toHaveCount(0);
  // The first Esc may be used by the canvas (it clears the node selection); the highlight clears once Esc is free.
  await page.keyboard.press('Escape');
  if(await page.locator('#docview .dv-links-lit').count())await page.keyboard.press('Escape');
  await expect(page.locator('#docview .dv-links-lit')).toHaveCount(0);await expect(page.locator('.links-canvas-pill')).toBeHidden();
});

test('B8 imported nodes: inherited tickets stay read only and Assign writes the consumer overlay',async({page,server})=>{
  await page.setViewportSize({width:1440,height:1000});
  const model=(id,dg)=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},tracking:{jira:{site:'https://acme.atlassian.net'}},sections:[{id:'main',diagram:dg}]}});
  const provider=model('provider',{nodes:{api:{title:'API',tickets:['CAN-1']},store:{title:'Store'}},rows:[['api','store']],edges:[{from:'api',to:'store',label:'Persist'}],topologyExports:{core:{nodes:['api','store'],edges:['api->store']}}});
  const consumer=model('consumer',{autoplay:false,nodes:{local:{title:'Local worker',tickets:['LOC-1']}},rows:[['local']],
    topologyImports:[{spec:'provider',export:'core',as:'canon',nodeTracking:{api:{tickets:['API-2']}}}],steps:[{id:'build',nodes:['canon::api','local'],text:'Build the API'}]});
  const catalog={version:3,diagrams:[provider,consumer].map(spec=>({id:spec.page.canon.id,title:spec.page.title,canon:spec.page.canon,counts:{nodes:2,steps:0,panels:0},revision:digest(spec),specUrl:spec.page.canon.id+'.json'}))};
  await page.route('**/diagrams.json',route=>route.fulfill({json:catalog}));
  for(const spec of [provider,consumer])await page.route('**/'+spec.page.canon.id+'.json',route=>route.fulfill({json:spec}));
  await page.goto(server.origin+'/workbench.html');
  await page.locator('#welcome-file').setInputFiles({name:'consumer.spec.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(consumer,null,2))});
  await expect(page.locator('#docview g.node[data-dv-node="canon::api"]')).toBeVisible();await closeTools(page);
  await page.locator('#editor-tab-links').click();const links=page.locator('#workspace-window-links');
  const before=await page.locator('#src').inputValue();
  const inherited=links.locator('[data-links-ticket="CAN-1"] [data-links-chip="node:0:canon::api"]');
  await expect(inherited).toHaveCount(1);await expect(inherited).toHaveClass(/links-chip-inherited/);
  await expect(inherited.locator('.links-chip-remove')).toHaveCount(0);
  await links.locator('[data-links-ticket="LOC-1"]').getByRole('button',{name:'Assign LOC-1',exact:true}).click();
  const picker=page.getByRole('dialog',{name:'Assign LOC-1'});
  await picker.getByRole('checkbox',{name:'API',exact:true}).check();
  await expect.poll(async()=>diagram(await source(page)).topologyImports[0].nodeTracking).toEqual({api:{tickets:['API-2','LOC-1']}});
  expect(diagram(await source(page)).nodes['canon::api']).toBeUndefined();
  await page.keyboard.press('Escape');
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(before);
});
