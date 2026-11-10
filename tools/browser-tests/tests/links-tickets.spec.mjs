/* #1243 part 1: the desktop Workbench Links window, Tickets tab.
   row | fixture | assertion | rejects
   B1 by ticket + highlight | board below | FW-45 row lists chips for node ctrl, edge ctrl->ingest and step 2; Highlight FW-45 marks those on the canvas and the Steps row, dims the rest; Esc clears | a list that misses step links, or a highlight that only selects one element
   B2 drag + Assign | same | dragging FW-45's handle onto the ingest->notify label adds FW-45 to edges[2].tickets; one Undo restores the source; + Assign ticks node notify (one Undo step each) | a drop that writes nothing, a drop that takes two Undo steps
   B3 by element move | same | By element: step 2 row shows FW-45; dragging the FW-45 chip from the ctrl row onto the notify row moves it in one Undo step; ⌥-drag copies; Enter on a chip offers Move to… and moving by keyboard writes the same | a move that leaves the source, a copy that removes it */
import {test,expect,paste,closeTools,pointerTo} from '../helpers/test.mjs';

const fixture={page:{title:'Doorbell',sections:[{heading:'Flow',diagram:{autoplay:false,
  nodes:{button:{title:'Doorbell button'},ctrl:{title:'Doorbell controller',tickets:['FW-45']},ingest:{title:'Event ingest',tickets:['BE-67']},notify:{title:'Notification service'}},
  rows:[['button','ctrl','ingest','notify']],
  edges:[{from:'button',to:'ctrl',label:'press'},{from:'ctrl',to:'ingest',label:'event',tickets:['FW-45']},{from:'ingest',to:'notify',label:'route'}],
  steps:[{id:'press',text:'The button reports a press',edge:'button->ctrl'},{id:'publish',text:'The controller publishes',nodes:['ctrl']},{id:'route',text:'Ingest routes the event',nodes:['ingest'],edge:'ingest->notify'}]}}]}};
const source=async page=>JSON.parse(await page.locator('#src').inputValue());
const diagram=raw=>raw.page.sections[0].diagram;

async function open(page,server){
  await page.setViewportSize({width:1440,height:1000});
  await page.goto(server.origin+'/workbench.html');
  const text=JSON.stringify(fixture,null,2);await paste(page,text);
  await expect(page.locator('#docview g.node[data-dv-node="ctrl"]')).toBeVisible();await closeTools(page);
  await page.locator('#editor-tab-links').click();
  const links=page.locator('#workspace-window-links');await expect(links).toBeVisible();
  // Fit leaves room for the open Links window, so canvas drop targets are not under it.
  await page.locator('#workspace-fit').click();
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
  await expect.poll(()=>label.evaluate(n=>{const r=n.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return hit===n || n.contains(hit);})).toBe(true);
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
