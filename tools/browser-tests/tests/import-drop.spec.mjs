import {test,expect,paste} from '../helpers/test.mjs';
import {editorSpec} from '../fixtures/editor-spec.mjs';

function story(title){const raw=editorSpec();raw.page.title=title;return JSON.stringify(raw,null,2);}
async function dropFile(target,{name,text,type='text/plain',extra=false}){
  await target.evaluate((node,file)=>{
    const transfer=new DataTransfer();transfer.items.add(new File([file.text],file.name,{type:file.type}));
    if(file.extra)transfer.items.add(new File(['sequenceDiagram\nA->>B: two'],'second.mmd',{type:'text/plain'}));
    node.dispatchEvent(new DragEvent('dragenter',{bubbles:true,cancelable:true,dataTransfer:transfer}));
    node.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:transfer}));
    node.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer}));
  },{name,text,type,extra});
}

test('Welcome stages dropped Flowview and Markdown imports before opening the workbench',async({page,server})=>{
  await page.goto(server.origin+'/workbench.html');const initial=await page.locator('#src').inputValue();
  const source=story('Dropped welcome story');await dropFile(page.locator('#workbench-welcome'),{name:'story.spec.json',text:source,type:'application/json'});
  const preview=page.locator('.file-import-dialog:visible');await expect(preview).toContainText('story.spec.json · Flowview JSON');
  await expect(preview).toContainText('Dropped welcome story');await expect(page.locator('#src')).toHaveValue(initial);
  await preview.getByRole('button',{name:'Cancel'}).click();await expect(page.locator('#src')).toHaveValue(initial);await expect(page.locator('#workbench-welcome')).toBeVisible();

  const markdown='# Sequence\n\n```mermaid\nsequenceDiagram\nparticipant App\nparticipant API\nApp->>API: GET /orders\nNote over App: add retry\n```\n';
  await dropFile(page.locator('#workbench-welcome'),{name:'orders.md',text:markdown,type:'text/markdown'});
  await expect(preview).toContainText('orders.md · Markdown Mermaid sequence');await expect(preview).toContainText('2 participants · 1 message · 1 Mermaid todo');
  await preview.getByRole('button',{name:'Import'}).click();await expect(page.locator('#workbench-workspace')).toBeVisible();
  await expect.poll(async()=>JSON.parse(await page.locator('#src').inputValue()).page.title).toBe('Converted sequence');
});

test('Welcome Open keeps the established immediate Flowview JSON behavior',async({page,server})=>{
  await page.goto(server.origin+'/workbench.html');
  await page.locator('#welcome-file').setInputFiles({name:'opened.spec.json',mimeType:'application/json',buffer:Buffer.from(story('Opened directly'))});
  await expect(page.locator('#workbench-workspace')).toBeVisible();
  await expect(page.locator('.file-import-dialog:visible')).toHaveCount(0);
  await expect.poll(async()=>JSON.parse(await page.locator('#src').inputValue()).page.title).toBe('Opened directly');
});

test('editor file import confirms once, cancels with Escape, and Undo restores the source',async({page,server})=>{
  const original=story('Original editor story');await page.goto(server.origin+'/workbench.html');await paste(page,original);
  const mermaid='sequenceDiagram\nparticipant Web\nparticipant API\nWeb->>API: POST /orders';
  await page.locator('#editor-tab-file').click();const importButton=page.locator('#file-import');await expect(importButton).toBeVisible();
  const choosing=page.waitForEvent('filechooser');await importButton.focus();await page.keyboard.press('Enter');
  await (await choosing).setFiles({name:'orders.mmd',mimeType:'text/plain',buffer:Buffer.from(mermaid)});
  const preview=page.locator('.file-import-dialog:visible');await expect(preview).toContainText('orders.mmd · Mermaid sequence');
  await expect.poll(()=>preview.evaluate(node=>node.matches(':modal'))).toBe(true);
  await page.evaluate(()=>{window.__importBackgroundClicks=0;document.getElementById('editor-tab-json').addEventListener('click',()=>window.__importBackgroundClicks++);});
  const backgroundBox=await page.locator('#editor-tab-json').boundingBox();
  await page.mouse.click(backgroundBox.x+backgroundBox.width/2,backgroundBox.y+backgroundBox.height/2);
  await expect.poll(()=>page.evaluate(()=>window.__importBackgroundClicks)).toBe(0);
  await page.locator('#editor-tab-json').evaluate(node=>node.focus());
  await expect.poll(()=>page.evaluate(()=>!!document.activeElement.closest('.file-import-dialog'))).toBe(true);
  await expect(page.locator('#src')).toHaveValue(original);await page.keyboard.press('Escape');await expect(preview).toBeHidden();await expect(page.locator('#src')).toHaveValue(original);
  await page.locator('#file-import-input').setInputFiles({name:'orders.mmd',mimeType:'text/plain',buffer:Buffer.from(mermaid)});
  await preview.getByRole('button',{name:'Import'}).click();await expect(page.locator('#src')).not.toHaveValue(original);
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);await expect(page.locator('#undo-builder')).toBeDisabled();
});

test('invalid, multiple, stale and internal drags never change the editor',async({page,server})=>{
  const original=story('Protected editor story');await page.goto(server.origin+'/workbench.html');await paste(page,original);
  const workspace=page.locator('#workbench-workspace');
  await workspace.evaluate(node=>{const transfer=new DataTransfer();transfer.items.add(new File(['sequenceDiagram\nA->>B: one'],'one.mmd'));window.__dropTransfer=transfer;node.dispatchEvent(new DragEvent('dragenter',{bubbles:true,cancelable:true,dataTransfer:transfer}));});
  await expect(page.locator('.file-drop-overlay:visible')).toHaveText('Drop to preview import');
  await page.locator('#docview').evaluate(node=>{node.dispatchEvent(new DragEvent('dragenter',{bubbles:true,cancelable:true,dataTransfer:window.__dropTransfer}));node.dispatchEvent(new DragEvent('dragleave',{bubbles:true,cancelable:true,dataTransfer:window.__dropTransfer}));});
  await expect(page.locator('.file-drop-overlay:visible')).toHaveCount(1);
  await workspace.evaluate(node=>node.dispatchEvent(new DragEvent('dragleave',{bubbles:true,cancelable:true,dataTransfer:window.__dropTransfer})));
  await expect(page.locator('.file-drop-overlay:visible')).toHaveCount(0);
  await dropFile(workspace,{name:'notes.txt',text:'not a supported diagram'});
  await expect(page.locator('.file-import-status:visible')).toContainText('Unsupported file');await expect(page.locator('#src')).toHaveValue(original);
  await dropFile(workspace,{name:'broken.json',text:'{"page":'});
  await expect(page.locator('.file-import-status:visible')).toContainText('Invalid Flowview JSON');await expect(page.locator('#src')).toHaveValue(original);
  await dropFile(workspace,{name:'one.mmd',text:'sequenceDiagram\nA->>B: one',extra:true});
  await expect(page.locator('.file-import-status:visible')).toContainText('Choose one file');await expect(page.locator('#src')).toHaveValue(original);

  await page.evaluate(()=>{const native=FileReader.prototype.readAsText;window.__restoreFailedImportReader=()=>{FileReader.prototype.readAsText=native;};FileReader.prototype.readAsText=function(){this.dispatchEvent(new ProgressEvent('error'));};});
  await page.locator('#file-import-input').setInputFiles({name:'unreadable.json',mimeType:'application/json',buffer:Buffer.from(story('Unreadable'))});
  await expect(page.locator('.file-import-status:visible')).toContainText('Could not read “unreadable.json”');await expect(page.locator('#src')).toHaveValue(original);
  await page.evaluate(()=>window.__restoreFailedImportReader());

  await workspace.evaluate(node=>{const transfer=new DataTransfer();transfer.setData('text/plain','canvas object');node.dispatchEvent(new DragEvent('dragenter',{bubbles:true,cancelable:true,dataTransfer:transfer}));});
  await expect(page.locator('.file-drop-overlay:visible')).toHaveCount(0);await expect(page.locator('#src')).toHaveValue(original);

  const replacement=story('Source changed while staged');await page.locator('#file-import-input').setInputFiles({name:'late.json',mimeType:'application/json',buffer:Buffer.from(story('Late import'))});
  const preview=page.locator('.file-import-dialog:visible');await expect(preview).toBeVisible();
  await page.locator('#src').evaluate((source,text)=>{source.value=text;source.dispatchEvent(new Event('input',{bubbles:true}));},replacement);
  await preview.getByRole('button',{name:'Import'}).click();await expect(page.locator('.file-import-status:visible')).toContainText('document changed');
  await expect(page.locator('#src')).toHaveValue(replacement);

  await page.evaluate(()=>{const native=FileReader.prototype.readAsText;window.__restoreImportReader=()=>{FileReader.prototype.readAsText=native;};FileReader.prototype.readAsText=function(file){setTimeout(()=>native.call(this,file),100);};});
  await page.locator('#file-import-input').setInputFiles({name:'slow.json',mimeType:'application/json',buffer:Buffer.from(story('Slow import'))});
  const typed=replacement+' ';
  await page.locator('#src').evaluate((source,text)=>{source.value=text;source.dispatchEvent(new Event('input',{bubbles:true}));},typed);
  await expect(page.locator('.file-import-status:visible')).toContainText('changed while the file was loading');await expect(page.locator('#src')).toHaveValue(typed);
  await page.evaluate(()=>window.__restoreImportReader());
});

test('project replacement and builder destruction retire staged previews',async({page,server})=>{
  const original=story('Destroy lifecycle');await page.goto(server.origin+'/lifetime/index.html');await paste(page,original);
  await page.locator('#file-import-input').setInputFiles({name:'late.mmd',mimeType:'text/plain',buffer:Buffer.from('sequenceDiagram\nA->>B: late')});
  await expect(page.locator('.file-import-dialog:visible')).toBeVisible();const replacement=story('Replacement project');
  await page.evaluate(text=>__editorTest.builder.loadText(text),replacement);await expect(page.locator('.file-import-dialog:visible')).toHaveCount(0);
  await expect(page.locator('.file-import-status:visible')).toContainText('project changed');await expect(page.locator('#src')).toHaveValue(replacement);
  await page.locator('#file-import-input').setInputFiles({name:'held.mmd',mimeType:'text/plain',buffer:Buffer.from('sequenceDiagram\nA->>B: held')});
  await expect(page.locator('.file-import-dialog:visible')).toBeVisible();
  const historyBefore=await page.evaluate(()=>({undo:document.getElementById('undo-builder').disabled,redo:document.getElementById('redo-builder').disabled}));
  await page.evaluate(()=>__editorTest.builder.destroy());
  await expect(page.locator('.file-import-dialog')).toHaveCount(1);await expect(page.locator('.file-import-dialog:visible')).toHaveCount(0);
  await expect(page.locator('#workbench-import-status')).toContainText('editor was closed');
  await expect(page.locator('#workbench-import-status')).toContainText('document is unchanged');
  await expect.poll(()=>page.evaluate(()=>({undo:document.getElementById('undo-builder').disabled,redo:document.getElementById('redo-builder').disabled}))).toEqual(historyBefore);
  await expect(page.locator('#src')).toHaveValue(replacement);
});
