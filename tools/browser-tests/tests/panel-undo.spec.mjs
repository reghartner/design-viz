import {test,expect,paste,closeTools,pagePreview} from '../helpers/test.mjs';
import {editorSpec} from '../fixtures/editor-spec.mjs';

function exploreSpec(){const raw=editorSpec();raw.page.blocks[0].diagram.layouts.forEach(view=>view.presentation='explore');return raw;}
const source=JSON.stringify(exploreSpec(),null,2);

async function open(page,server){await page.goto(server.origin+'/workbench.html');await paste(page,source);await closeTools(page);}
async function geometry(el){return el.evaluate(el=>{const r=el.getBoundingClientRect();return [r.x,r.y,r.width,r.height].map(Math.round);});}
async function drag(page,handle,dx,dy){
  await handle.hover();const r=await handle.boundingBox();
  await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.down();
  await page.mouse.move(r.x+r.width/2+dx,r.y+r.height/2+dy,{steps:6});await page.mouse.up();
}

test('editor tool moves and resizes share toolbar and keyboard history without touching source',async({page,server})=>{
  await open(page,server);await page.locator('#editor-tab-json').click();
  const win=page.locator('#workspace-window-json'),before=await geometry(win);
  const preview=await page.locator('#docview .doc-sec').first().elementHandle();
  await drag(page,win.locator('.workspace-window-grip'),-160,40);const moved=await geometry(win);expect(moved).not.toEqual(before);
  await page.locator('#undo-builder').click();await expect.poll(()=>geometry(win)).toEqual(before);await expect(page.locator('#src')).toHaveValue(source);
  await win.locator('.workspace-window-grip').focus();await page.keyboard.press('ControlOrMeta+Shift+z');await expect.poll(()=>geometry(win)).toEqual(moved);
  await drag(page,win.locator('.workspace-window-resize'),80,-60);const resized=await geometry(win);expect(resized[2]).toBeGreaterThan(moved[2]);
  await page.keyboard.press('ControlOrMeta+z');await expect.poll(()=>geometry(win)).toEqual(moved);
  await page.locator('#redo-builder').click();await expect.poll(()=>geometry(win)).toEqual(resized);
  expect(await preview.evaluate(el=>el.isConnected)).toBe(true);
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('dv-workbench-floating-v1')).windows.json);expect(Math.round(saved.w)).toBe(resized[2]);
  await page.reload();await page.locator('#editor-tab-json').click();await expect.poll(()=>geometry(win)).toEqual(resized);
});

test('Explore data-panel and step-control gestures author separate undoable layout edits',async({page,server})=>{
  await open(page,server);const panel=page.locator('[data-explore-panel=home]'),before=await geometry(panel);
  await drag(page,panel.locator('.explore-window-grip'),-180,70);const moved=await geometry(panel);expect(moved).not.toEqual(before);
  const movedSource=await page.locator('#src').inputValue();expect(movedSource).not.toBe(source);
  await page.locator('#undo-builder').click();await expect.poll(()=>geometry(panel)).toEqual(before);await expect(page.locator('#src')).toHaveValue(source);
  await page.locator('#redo-builder').click();await expect.poll(()=>geometry(panel)).toEqual(moved);
  await closeTools(page);
  await drag(page,panel.locator('.explore-window-resize'),85,55);const resized=await geometry(panel);expect(resized[2]).toBeGreaterThan(moved[2]);
  const resizedSource=await page.locator('#src').inputValue();expect(resizedSource).not.toBe(movedSource);
  await page.keyboard.press('ControlOrMeta+z');await expect.poll(()=>geometry(panel)).toEqual(moved);
  await expect(page.locator('#src')).toHaveValue(movedSource);
  await page.keyboard.press('ControlOrMeta+Shift+z');await expect.poll(()=>geometry(panel)).toEqual(resized);
  const controls=page.locator('.explore-player'),initialControls=await geometry(controls);
  await controls.locator('.explore-player-grip').focus();await page.keyboard.press('Shift+ArrowUp');expect(await geometry(controls)).not.toEqual(initialControls);
  const controlsSource=await page.locator('#src').inputValue();expect(controlsSource).not.toBe(resizedSource);
  await page.locator('#undo-builder').click();await expect.poll(()=>geometry(controls)).toEqual(initialControls);
  await expect(page.locator('#src')).toHaveValue(resizedSource);
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(movedSource);
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(source);await expect(page.locator('#undo-builder')).toBeDisabled();
});

test('panel history survives source rerenders and follows source edits in both directions',async({page,server})=>{
  await open(page,server);const panel=page.locator('[data-explore-panel=home]'),before=await geometry(panel);
  await drag(page,panel.locator('.explore-window-grip'),-480,80);const moved=await geometry(panel);
  const movedSource=await page.locator('#src').inputValue();expect(movedSource).not.toBe(source);
  const oldPanel=await panel.elementHandle();
  await page.locator('#editor-tab-outline').click();await page.locator('#outline-search').fill('Doorbell');
  await page.locator('.outline-item').filter({hasText:'node · Doorbell'}).click();await page.locator('#outline-inspect').click();
  const title=page.locator('#guide').getByLabel('title',{exact:true});await title.fill('Renamed camera');await title.press('Enter');
  const edited=await page.locator('#src').inputValue();expect(edited).not.toBe(source);expect(await oldPanel.evaluate(el=>el.isConnected)).toBe(false);
  await closeTools(page);await expect.poll(()=>geometry(panel)).toEqual(moved);
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(movedSource);await expect.poll(()=>geometry(panel)).toEqual(moved);
  const board=page.locator('.explore-board');await board.evaluate(el=>{el.scrollLeft+=70;el.scrollTop+=25;});
  const camera=await board.evaluate(el=>[el.scrollLeft,el.scrollTop]);
  await page.locator('#undo-builder').click();await expect.poll(()=>geometry(panel)).toEqual(before);await expect(page.locator('#src')).toHaveValue(source);
  expect(await board.evaluate(el=>[el.scrollLeft,el.scrollTop])).toEqual(camera);
  await page.locator('#redo-builder').click();await expect.poll(()=>geometry(panel)).toEqual(moved);await expect(page.locator('#src')).toHaveValue(movedSource);
  await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(edited);await expect.poll(()=>geometry(panel)).toEqual(moved);
});

test('cancelled drags and tool visibility add no history; geometry undo keeps closed tools closed',async({page,server})=>{
  await open(page,server);await page.locator('#editor-tab-json').click();const win=page.locator('#workspace-window-json'),before=await geometry(win);
  const grip=win.locator('.workspace-window-grip');await drag(page,grip,-150,40);const first=await geometry(win);
  await drag(page,grip,-90,30);const second=await geometry(win);expect(second).not.toEqual(first);
  await grip.hover();const r=await grip.boundingBox();await page.mouse.move(r.x+40,r.y+12);await page.mouse.down();await page.mouse.move(r.x-60,r.y+70,{steps:5});
  await page.keyboard.press('Escape');await page.mouse.up();await expect.poll(()=>geometry(win)).toEqual(second);
  await win.locator('.workspace-window-close').click();await page.locator('#undo-builder').click();await expect(win).toBeHidden();
  await page.locator('#editor-tab-json').click();await expect.poll(()=>geometry(win)).toEqual(first);
  await page.locator('#undo-builder').click();await expect.poll(()=>geometry(win)).toEqual(before);await expect(page.locator('#src')).toHaveValue(source);
  await page.locator('#redo-builder').click();await expect.poll(()=>geometry(win)).toEqual(first);
  await grip.focus();await page.keyboard.press('ArrowLeft');await expect(page.locator('#redo-builder')).toBeDisabled();
  const typed=source+'\n{ unfinished';await page.locator('#src').fill(typed);
  await page.locator('#undo-builder').click();await expect.poll(()=>geometry(win)).toEqual(first);await expect(page.locator('#src')).toHaveValue(typed);
});


test('drill-down panel geometry survives child refresh and stays scoped when closed',async({page,server})=>{
  const raw=exploreSpec(),root=raw.page.blocks[0];root.id='overview';
  const child=structuredClone(root);child.id='child';child.heading='Child flow';child.detailOnly=true;child.diagram.nodes.a.title='Child camera';
  root.diagram.nodes.a.detail={section:'child'};raw.page.blocks.push(child);const original=JSON.stringify(raw,null,2);
  await page.goto(server.origin+'/workbench.html');await paste(page,original);await closeTools(page);
  const parent=page.locator('#section-overview'),detail=page.locator('[data-dv-detail-preview]:visible'),panel=detail.locator('[data-explore-panel=home]');
  await parent.locator('[data-dv-detail=a]').click();const before=await geometry(panel);
  await drag(page,panel.locator('.explore-window-grip'),-430,60);const moved=await geometry(panel);
  // A drill-down is a reading preview. Its panel geometry stays temporary;
  // source authoring belongs to the actual child section's editor.
  await expect(page.locator('#src')).toHaveValue(original);
  await drag(page,panel.locator('.explore-window-resize'),70,45);const resized=await geometry(panel);
  await expect(page.locator('#src')).toHaveValue(original);
  await page.locator('#undo-builder').click();await expect.poll(()=>geometry(panel)).toEqual(moved);
  await expect(page.locator('#src')).toHaveValue(original);
  await page.keyboard.press('ControlOrMeta+Shift+z');await expect.poll(()=>geometry(panel)).toEqual(resized);
  const oldPanel=await panel.elementHandle();
  await page.locator('#editor-tab-outline').click();await page.locator('#outline-search').fill('Doorbell');
  await page.locator('.outline-item').filter({hasText:'node · Doorbell'}).click();await page.locator('#outline-inspect').click();
  const title=page.locator('#guide').getByLabel('title',{exact:true});await title.fill('Updated overview camera');await title.press('Enter');
  const edited=await page.locator('#src').inputValue();expect(edited).not.toBe(original);expect(await oldPanel.evaluate(el=>el.isConnected)).toBe(false);
  await closeTools(page);await expect(detail).toBeVisible();await expect.poll(()=>geometry(panel)).toEqual(resized);
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);await expect.poll(()=>geometry(panel)).toEqual(resized);
  await page.locator('#undo-builder').click();await expect.poll(()=>geometry(panel)).toEqual(moved);
  await detail.locator('.detail-breadcrumb button').first().click();await expect(detail).toHaveCount(0);
  await page.locator('#undo-builder').click();await expect(detail).toHaveCount(0);await expect(parent).toBeVisible();
  await expect(page.locator('#src')).toHaveValue(original);await expect(page.locator('#undo-builder')).toBeDisabled();
  await parent.locator('[data-dv-detail=a]').click();await expect.poll(()=>geometry(panel)).toEqual(before);
  await page.locator('#redo-builder').click();await expect.poll(()=>geometry(panel)).toEqual(moved);
  await page.locator('#redo-builder').click();await expect.poll(()=>geometry(panel)).toEqual(resized);
  await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(edited);await expect.poll(()=>geometry(panel)).toEqual(resized);
});

test('layout edits cannot strand an earlier geometry history entry for an inactive view',async({page,server})=>{
  const raw=exploreSpec();raw.page.blocks[0].diagram.layouts.push({...structuredClone(raw.page.blocks[0].diagram.layouts[0]),id:'engineering',name:'Engineering'});const source=JSON.stringify(raw,null,2);
  await page.goto(server.origin+'/workbench.html');await paste(page,source);await closeTools(page);
  const sec=page.locator('#docview .doc-sec').first(),panel=sec.locator('[data-explore-panel=home]'),before=await geometry(panel);
  await panel.locator('.explore-window-grip').focus();await page.keyboard.press('Shift+ArrowLeft');const moved=await geometry(panel);
  const movedSource=await page.locator('#src').inputValue();expect(movedSource).not.toBe(source);
  await sec.getByRole('button',{name:'Engineering',exact:true}).click();await pagePreview(page);
  await sec.getByRole('button',{name:'Arrange section',exact:true}).click();
  await sec.getByRole('button',{name:'Duplicate chapter',exact:true}).click();const edited=await page.locator('#src').inputValue();expect(edited).not.toBe(source);
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(movedSource);
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(source);
  await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(movedSource);
  await sec.getByRole('button',{name:'Business',exact:true}).click();await expect.poll(()=>geometry(panel)).toEqual(moved);
  await page.locator('#undo-builder').click();await expect.poll(()=>geometry(panel)).toEqual(before);
  await page.locator('#redo-builder').click();await expect.poll(()=>geometry(panel)).toEqual(moved);
  await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(edited);
});

test('returning a canvas drag to its starting rectangle preserves Redo',async({page,server})=>{
  await open(page,server);const panel=page.locator('[data-explore-panel=home]'),before=await geometry(panel),grip=panel.locator('.explore-window-grip');
  await drag(page,grip,-180,60);await page.locator('#undo-builder').click();await expect.poll(()=>geometry(panel)).toEqual(before);
  const r=await grip.boundingBox(),x=r.x+40,y=r.y+12;
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x-100,y+50,{steps:4});await page.mouse.move(x,y,{steps:4});await page.mouse.up();
  await expect.poll(()=>geometry(panel)).toEqual(before);await expect(page.locator('#redo-builder')).toBeEnabled();
});

test('canvas panel drag and resize take keyboard Undo focus from the Inspector',async({page,server})=>{
  const raw=exploreSpec();
  const original=JSON.stringify(raw,null,2);
  await page.goto(server.origin+'/workbench.html');await paste(page,original);await closeTools(page);
  await page.locator('[data-dv-node=a]').first().click();await page.locator('#editor-tab-inspect').click();
  await drag(page,page.locator('#workspace-window-inspect .workspace-window-grip'),-900,0);
  const title=page.locator('#guide').getByLabel('title',{exact:true});await title.fill('Focused camera');await title.press('Enter');
  await expect(page.locator('#src')).toHaveValue(/Focused camera/);const edited=await page.locator('#src').inputValue();
  const panel=page.locator('[data-explore-panel=home]'),before=await geometry(panel),grip=panel.locator('.explore-window-grip');
  await title.focus();await drag(page,grip,-350,60);const moved=await geometry(panel);expect(moved).not.toEqual(before);
  const movedSource=await page.locator('#src').inputValue();expect(movedSource).not.toBe(edited);
  await expect(grip).toBeFocused();await page.keyboard.press('ControlOrMeta+z');await expect.poll(()=>geometry(panel)).toEqual(before);
  await expect(page.locator('#src')).toHaveValue(edited);
  await page.keyboard.press('ControlOrMeta+Shift+z');await expect.poll(()=>geometry(panel)).toEqual(moved);
  // Authored layout Undo rebuilds the inspector. Re-select the node so the
  // resize still begins in a real focused text field, as the move did.
  await page.locator('[data-dv-node=a]').first().click();await page.locator('#editor-tab-inspect').click();await expect(title).toHaveValue('Focused camera');
  const resize=panel.locator('.explore-window-resize');await title.focus();await drag(page,resize,70,45);const resized=await geometry(panel);
  expect(resized).not.toEqual(moved);await expect(resize).toBeFocused();await page.keyboard.press('ControlOrMeta+z');await expect.poll(()=>geometry(panel)).toEqual(moved);
  await expect(page.locator('#src')).toHaveValue(movedSource);
});

test('a clamped canvas arrow movement is a no-op and preserves Redo',async({page,server})=>{
  await open(page,server);const panel=page.locator('[data-explore-panel=home]'),before=await geometry(panel),grip=panel.locator('.explore-window-grip');
  await drag(page,grip,-180,60);await page.locator('#undo-builder').click();await expect.poll(()=>geometry(panel)).toEqual(before);
  await grip.focus();await page.keyboard.press('ArrowRight');await expect.poll(()=>geometry(panel)).toEqual(before);
  await expect(page.locator('#redo-builder')).toBeEnabled();await expect(page.locator('#src')).toHaveValue(source);
});

test('leaving a changed Inspector field cannot start a drag on a retired canvas',async({page,server})=>{
  await open(page,server);await page.locator('[data-dv-node=a]').first().click();await page.locator('#editor-tab-inspect').click();
  await drag(page,page.locator('#workspace-window-inspect .workspace-window-grip'),-900,0);
  const title=page.locator('#guide').getByLabel('title',{exact:true}),panel=page.locator('[data-explore-panel=home]');
  const before=await geometry(panel),old=await panel.elementHandle();await title.fill('Committed on leaving Inspector');
  await drag(page,panel.locator('.explore-window-grip'),-350,60);
  await expect(page.locator('#src')).toHaveValue(/Committed on leaving Inspector/);
  expect(await old.evaluate(el=>el.isConnected)).toBe(false);await expect.poll(()=>geometry(panel)).toEqual(before);
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(source);
  await drag(page,panel.locator('.explore-window-grip'),-350,60);expect(await geometry(panel)).not.toEqual(before);
  await page.keyboard.press('ControlOrMeta+z');await expect.poll(()=>geometry(panel)).toEqual(before);await expect(page.locator('#src')).toHaveValue(source);
});

test('removing an authored Explore view in handwritten JSON preserves the full source history and draft on Redo',async({page,server})=>{
  await open(page,server);const previous=await page.locator('#src').inputValue();
  await page.locator('[data-dv-node=a]').first().click();await page.locator('#editor-tab-inspect').click();
  const title=page.locator('#guide').getByLabel('title',{exact:true});await title.fill('Edited camera');await title.press('Enter');
  const edited=await page.locator('#src').inputValue();expect(edited).not.toBe(previous);await closeTools(page);
  await page.locator('[data-explore-panel=home] .explore-window-grip').focus();await page.keyboard.press('Shift+ArrowLeft');
  expect(await page.locator('#src').inputValue()).not.toBe(edited);
  const raw=JSON.parse(edited);delete raw.page.blocks[0].diagram.layouts;delete raw.page.blocks[0].diagram.defaultLayout;
  const handwritten='  '+JSON.stringify(raw,null,2)+'\n';
  await page.locator('#editor-tab-json').click();await page.locator('#src').fill(handwritten);await page.locator('#go').click();await closeTools(page);
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(edited);
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(previous);await expect(page.locator('#undo-builder')).toBeDisabled();
  await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(edited);
  await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(handwritten);await expect(page.locator('#redo-builder')).toBeDisabled();
});
