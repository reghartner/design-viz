import {test,expect,pastePage,closeTools} from '../helpers/test.mjs';

function fixture(){return {page:{title:'Shortcut contract',sections:[{heading:'Active canvas',diagram:{
  nodes:{a:{title:'Anchor'},b:{title:'Second'},note:{title:'Plain text',type:'text'}},rows:[[]],floats:[{id:'a',x:160,y:100},{id:'b',x:450,y:250},{id:'note',x:710,y:120}],edges:[],
  layouts:[{id:'canvas',name:'Canvas',presentation:'explore',sectionLayout:{default:[{x:0,y:0,w:12,h:12}]},exploreLayout:{}}],defaultLayout:'canvas'
}},{heading:'Inactive section',diagram:{nodes:{other:{title:'Other'}},rows:[['other']]}}]}};}
async function open(page,server,path='/lifetime/index.html'){
  await page.setViewportSize({width:1280,height:800});await page.goto(server.origin+path);await page.evaluate(()=>localStorage.clear());await page.goto(server.origin+path);
  await pastePage(page,JSON.stringify(fixture()));await closeTools(page);
  // Reader navigation owns the visible Fit control; its legacy action remains
  // the shortcut target. Wait on the active canvas and its retained control.
  await expect(page.locator('.workspace-active-section [data-dv-node]').first()).toBeVisible();await expect(page.locator('#workspace-fit-selection')).toBeVisible();
}
const activeNodes=page=>page.locator('.workspace-active-section [data-dv-node]');

test('canvas workflow keys select active visible nodes, call existing fit actions, inspect, and never change source',async({page,server})=>{
  await open(page,server);const src=page.locator('#src'),before=await src.inputValue(),nodes=activeNodes(page);await expect(nodes).toHaveCount(3);
  await nodes.first().evaluate(el=>el.setAttribute('data-dv-locked','true'));await nodes.first().focus();
  await page.keyboard.press('ControlOrMeta+a');await expect(page.locator('.workspace-active-section .dv-sel[data-dv-node]')).toHaveCount(3);await expect(page.locator('[data-dv-locked].dv-sel')).toHaveCount(1);await expect(page.locator('.doc-sec:not(.workspace-active-section) .dv-sel')).toHaveCount(0);
  const calls=await page.evaluate(()=>{window.__shortcutFits=[];for(const id of ['workspace-fit','workspace-fit-selection'])document.getElementById(id).addEventListener('click',()=>__shortcutFits.push(id));return true;});expect(calls).toBe(true);
  await page.keyboard.press('f');await page.keyboard.press('Shift+f');expect(await page.evaluate(()=>__shortcutFits)).toEqual(['workspace-fit','workspace-fit-selection']);
  await page.keyboard.press('F2');await expect(page.locator('#workspace-window-inspect')).toBeVisible();await expect(page.locator('#guide')).toContainText('3 nodes selected');await expect(page.locator('#guide input, #guide textarea, #guide select').first()).toBeFocused();
  await expect(src).toHaveValue(before);await expect(page.locator('#undo-builder')).toBeDisabled();
  const shortcuts=page.getByRole('dialog',{name:'Keyboard shortcuts'});await page.evaluate(()=>{const text=document.querySelector('.workspace-active-section .sec-h'),range=document.createRange();range.selectNodeContents(text);getSelection().removeAllRanges();getSelection().addRange(range);});await page.keyboard.type('?');await expect(shortcuts).toBeHidden();await page.evaluate(()=>getSelection().removeAllRanges());
  await page.locator('#workspace-appearance>summary').click();await page.locator('#open-page-preview').click();await expect(page.locator('#page-preview')).toBeVisible();await page.keyboard.type('?');await expect(shortcuts).toBeHidden();await page.locator('#close-page-preview').click();
  await page.locator('#editor-tab-json').click();await src.focus();await page.keyboard.press('ControlOrMeta+a');await page.keyboard.press('f');await expect(src).toHaveValue('f');expect(await page.evaluate(()=>__shortcutFits)).toEqual(['workspace-fit','workspace-fit-selection']);
});

test('shortcut sheet is discoverable and stays usable in the narrow workspace',async({page,server},info)=>{
  await open(page,server,'/workbench.html');await page.setViewportSize({width:390,height:740});
  await expect(page.locator('#workspace-more')).not.toHaveAttribute('open','');
  await page.locator('#workspace-more > summary').click();
  const help=page.locator('.workspace-help'),shortcutButton=help.getByRole('button',{name:/Keyboard shortcuts/});await help.locator('summary').click();await expect(shortcutButton).toBeVisible();await shortcutButton.click();
  const dialog=page.getByRole('dialog',{name:'Keyboard shortcuts'});await expect(dialog).toBeVisible();await expect(dialog).toContainText('Select every visible node');const box=await dialog.boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(390);expect(box.y+box.height).toBeLessThanOrEqual(740);await info.attach('narrow shortcut sheet',{body:await page.screenshot(),contentType:'image/png'});await dialog.getByRole('button',{name:/Close/}).click();
  await expect(shortcutButton).toBeFocused();await page.keyboard.type('?');await expect(dialog).toBeVisible();
});

test('shortcut listeners retire on destroy and remount once on the same DOM',async({page,server})=>{
  await open(page,server);const dialog=page.getByRole('dialog',{name:'Keyboard shortcuts'}),node=activeNodes(page).first();await node.focus();
  await page.evaluate(()=>__editorTest.builder.destroy());await page.keyboard.type('?');await expect(dialog).toBeHidden();
  await page.evaluate(()=>__editorTest.remount());await node.focus();await page.keyboard.type('?');await expect(dialog).toBeVisible();await dialog.getByRole('button',{name:/Close/}).click();
  const before=await page.locator('#src').inputValue();await node.focus();await page.keyboard.press('ControlOrMeta+a');await expect(page.locator('.workspace-active-section .dv-sel[data-dv-node]')).toHaveCount(3);await expect(page.locator('#src')).toHaveValue(before);await expect(page.locator('#undo-builder')).toBeDisabled();
});
