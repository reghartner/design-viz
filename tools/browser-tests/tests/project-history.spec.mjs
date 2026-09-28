import {test,expect,paste,closeTools} from '../helpers/test.mjs';
import {editorSpec} from '../fixtures/editor-spec.mjs';

function story(title){const raw=editorSpec();raw.page.title=title;raw.page.blocks[0].diagram.layouts.forEach(view=>view.presentation='explore');return JSON.stringify(raw,null,2);}
async function rename(page,value){
  await page.locator('#editor-tab-outline').click();await page.locator('#outline-search').fill('Doorbell');
  await page.locator('.outline-item').filter({hasText:'node · Doorbell'}).click();await page.locator('#outline-inspect').click();
  const title=page.locator('#guide').getByLabel('title',{exact:true});await title.fill(value);await title.press('Enter');
}
async function openFile(page,source){await page.locator('#file-input').setInputFiles({name:'story.json',mimeType:'application/json',buffer:Buffer.from(source)});await expect(page.locator('#src')).toHaveValue(source);}

test('opening a different file clears source and panel history without losing the outgoing draft',async({page,server})=>{
  const a=story('File A'),b=story('File B');await page.goto(server.origin+'/workbench.html');await paste(page,a);
  await rename(page,'File A camera');const editedA=await page.locator('#src').inputValue();await closeTools(page);
  await page.locator('[data-explore-panel=home] .explore-window-grip').focus();await page.keyboard.press('Shift+ArrowLeft');
  const outgoingA=await page.locator('#src').inputValue();expect(outgoingA).not.toBe(editedA);
  const savedDiagram=JSON.parse(outgoingA).page.blocks[0].diagram;
  expect(savedDiagram.nodes.a.title).toBe('File A camera');
  expect(savedDiagram.layouts[0].exploreLayout.panels).toEqual(expect.arrayContaining([expect.objectContaining({panel:'home',stacked:false})]));
  await openFile(page,b);await expect(page.locator('#undo-builder')).toBeDisabled();await expect(page.locator('#redo-builder')).toBeDisabled();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('dv-workbench-earlier-drafts')).map(entry=>entry.text))).toContain(outgoingA);
  await closeTools(page);await page.locator('[data-explore-panel=home] .explore-window-grip').focus();
  await page.keyboard.press('ControlOrMeta+z');await page.keyboard.press('ControlOrMeta+Shift+z');await expect(page.locator('#src')).toHaveValue(b);
  await rename(page,'File B camera');const editedB=await page.locator('#src').inputValue();expect(editedB).not.toBe(b);
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(b);await expect(page.locator('#undo-builder')).toBeDisabled();
  await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(editedB);await expect(page.locator('#redo-builder')).toBeDisabled();
  await openFile(page,a);await expect(page.locator('#undo-builder')).toBeDisabled();await expect(page.locator('#redo-builder')).toBeDisabled();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('dv-workbench-earlier-drafts')).map(entry=>entry.text))).toContain(editedB);
});

test('Home and Continue retain the same file history including panel geometry',async({page,server})=>{
  const source=story('One file');await page.goto(server.origin+'/workbench.html');await paste(page,source);await closeTools(page);
  const panel=page.locator('[data-explore-panel=home]');const before=await panel.boundingBox();
  await panel.locator('.explore-window-grip').focus();await page.keyboard.press('Shift+ArrowLeft');const moved=await panel.boundingBox();expect(moved.x).not.toBe(before.x);
  const movedSource=await page.locator('#src').inputValue();expect(movedSource).not.toBe(source);
  await page.locator('#workspace-home').click();await page.locator('#welcome-resume').click();
  await expect(page.locator('#src')).toHaveValue(movedSource);
  await page.locator('#undo-builder').click();await expect.poll(async()=>Math.round((await panel.boundingBox()).x)).toBe(Math.round(before.x));await expect(page.locator('#src')).toHaveValue(source);
  await expect(page.locator('#undo-builder')).toBeDisabled();
  await page.locator('#redo-builder').click();await expect.poll(async()=>Math.round((await panel.boundingBox()).x)).toBe(Math.round(moved.x));await expect(page.locator('#src')).toHaveValue(movedSource);
  await expect(page.locator('#redo-builder')).toBeDisabled();
});
