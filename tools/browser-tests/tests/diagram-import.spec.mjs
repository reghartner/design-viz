import {test,expect,pastePage,closeTools} from '../helpers/test.mjs';
import {editorSpec} from '../fixtures/editor-spec.mjs';
const incoming=JSON.stringify({page:{sections:[{heading:'First graph',diagram:{nodes:{a:{title:'Imported A'},b:{title:'Imported B'}},rows:[['a','b']],edges:[{from:'a',to:'b',kind:'https'}]}},{heading:'Second graph',diagram:{nodes:{second:{title:'Chosen graph'}},rows:[['second']]}}]}});
function fixture(){const raw=editorSpec(),d=raw.page.blocks[0].diagram;d.layouts=[{...d.layouts[0],id:'standard',name:'Standard',presentation:'standard'},{...d.layouts[0],id:'explore',name:'Explore',presentation:'explore'}];d.defaultLayout='standard';return JSON.stringify(raw,null,2);}
async function transfer(page,kind,text=incoming){return page.evaluate(({kind,text})=>{
  const data=new DataTransfer(),board=Array.from(document.querySelectorAll('#docview .doc-sec[data-dv-section="0"] .board')).find(el=>el.getClientRects().length);
  if(kind==='drop')data.items.add(new File([text],'diagram.json',{type:'application/json'}));else data.setData('text/plain',text);
  if(kind==='drop'){
    document.querySelector('#workbench-workspace').dispatchEvent(new DragEvent('dragenter',{bubbles:true,cancelable:true,dataTransfer:data}));
    board.dispatchEvent(new DragEvent('dragenter',{bubbles:true,cancelable:true,dataTransfer:data}));
    board.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:data}));
  }
  const r=board.getBoundingClientRect(),event=kind==='drop'?new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:data,clientX:r.left+100,clientY:r.top+100}):new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data});
  (kind==='drop'?board:document).dispatchEvent(event);return event.defaultPrevented;
},{kind,text});}
test('file drop previews graph counts, chooses source, inserts once and restores exact source; Explore paste agrees',async({page,server},testInfo)=>{
  await page.goto(server.origin+'/workbench.html');const original=fixture();await pastePage(page,original);await closeTools(page);
  expect(await transfer(page,'drop')).toBe(true);await expect(page.locator('#diagram-import-preview')).toContainText('2 nodes');await expect(page.locator('#src')).toHaveValue(original);
  await expect(page.locator('.file-import-dialog:visible')).toHaveCount(0);await expect(page.locator('.file-drop-overlay:visible')).toHaveCount(0);
  await expect(page.locator('#diagram-import')).toContainText('Panels, timelines, prose, and named views are not merged');
  await page.locator('#diagram-import-section').selectOption('1');await expect(page.locator('#diagram-import-preview')).toContainText('1 node');
  await page.screenshot({path:testInfo.outputPath('diagram-import-preview.png')});
  await page.locator('#diagram-import-apply').click();await expect(page.locator('#diagram-import')).not.toBeVisible();
  let after=JSON.parse(await page.locator('#src').inputValue()),d=after.page.blocks[0].diagram;
  expect(Object.keys(d.nodes)).toContain('second-copy');expect(d.steps).toEqual(JSON.parse(original).page.blocks[0].diagram.steps);expect(d.rows).toEqual([['a','b','c']]);
  await expect(page.locator('#docview [data-dv-node="second-copy"].dv-sel')).toHaveCount(1);
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);await expect(page.locator('#undo-builder')).toBeDisabled();
  await page.locator('#docview > .explore-navigation').getByRole('button',{name:'Explore',exact:true}).click();
  expect(await transfer(page,'paste','```mermaid\nsequenceDiagram\nClient->>Server: request\n```')).toBe(true);await expect(page.locator('#diagram-import-preview')).toContainText('2 nodes');
  await page.locator('#diagram-import-apply').click();await expect(page.locator('#docview .viewport-explore [data-dv-node="client-copy"]')).toHaveCount(1);
  await expect(page.locator('#docview .viewport-explore .node.dv-sel')).toHaveCount(2);
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);
});
test('explicit paste, cancel, invalid source, native text and stale lifecycle keep source unchanged',async({page,server})=>{
  await page.goto(server.origin+'/lifetime/index.html');const original=fixture();await pastePage(page,original);
  await page.locator('#editor-tab-inspect').click();await page.locator('#diagram-import-open').click();await page.locator('#diagram-import-text').fill(incoming);
  await expect(page.locator('#diagram-import-apply')).toBeEnabled();await page.locator('#diagram-import-cancel').click();await expect(page.locator('#src')).toHaveValue(original);
  expect(await transfer(page,'drop','{"broken":true}')).toBe(true);await expect(page.locator('#diagram-import-apply')).toBeDisabled();await page.locator('#diagram-import-cancel').click();
  const native=await page.evaluate(text=>{const data=new DataTransfer();data.setData('text/plain',text);const event=new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data});document.querySelector('#src').dispatchEvent(event);return event.defaultPrevented;},incoming);expect(native).toBe(false);
  await transfer(page,'paste');await page.evaluate(()=>{const src=document.querySelector('#src');src.value+=' ';src.dispatchEvent(new Event('input',{bubbles:true}));});
  await expect(page.locator('#diagram-import-apply')).toBeDisabled();await expect(page.locator('#diagram-import-preview')).toContainText('destination changed');await expect(page.locator('#src')).toHaveValue(original+' ');await page.locator('#diagram-import-cancel').click();
  await page.evaluate(()=>__editorTest.builder.loadSpec(JSON.parse(document.querySelector('#src').value)));const baseline=await page.locator('#src').inputValue();
  await transfer(page,'paste');await page.evaluate(()=>__editorTest.builder.destroy());await expect(page.locator('#diagram-import')).toHaveCount(0);await expect(page.locator('#src')).toHaveValue(baseline);
});
test('held file completion cannot replace typed source, new project or destroyed owner',async({page,server})=>{
  await page.goto(server.origin+'/lifetime/index.html');await pastePage(page,fixture());await closeTools(page);
  await page.evaluate(()=>{window.__realReader=window.FileReader;window.FileReader=class {constructor(){this.readyState=0;window.__heldDiagramReader=this;}readAsText(){this.readyState=1;}abort(){this.readyState=2;}};});
  await transfer(page,'drop');await page.locator('#diagram-import-text').fill('sequenceDiagram\nFresh->>Text: typed');
  await page.evaluate(text=>{const reader=window.__heldDiagramReader;reader.result=text;reader.onload();},incoming);await expect(page.locator('#diagram-import-text')).toHaveValue('sequenceDiagram\nFresh->>Text: typed');await page.locator('#diagram-import-cancel').click();
  await transfer(page,'drop');const original=await page.locator('#src').inputValue();await page.evaluate(text=>{__editorTest.builder.loadSpec(JSON.parse(document.querySelector('#src').value));const reader=window.__heldDiagramReader;reader.result=text;reader.onload();},incoming);
  await expect(page.locator('#diagram-import-apply')).toBeDisabled();await expect(page.locator('#src')).toHaveValue(original);await page.locator('#diagram-import-cancel').click();
  await transfer(page,'drop');await page.evaluate(text=>{__editorTest.builder.destroy();const reader=window.__heldDiagramReader;reader.result=text;reader.onload();window.FileReader=window.__realReader;},incoming);await expect(page.locator('#diagram-import')).toHaveCount(0);await expect(page.locator('#src')).toHaveValue(original);
});
test('Add menu works on a narrow canvas and oversized files preserve source and history',async({page,server})=>{
  await page.setViewportSize({width:430,height:900});await page.goto(server.origin+'/workbench.html');const original=fixture();await pastePage(page,original);await closeTools(page);
  await page.locator('#diagram-add').click();await page.locator('#add-diagram-import').click();await expect(page.locator('#diagram-import')).toBeVisible();
  const box=await page.locator('#diagram-import').boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(430);
  await page.locator('#diagram-import-text').fill('sequenceDiagram\nA->>B: small');await expect(page.locator('#diagram-import-apply')).toBeEnabled();await page.locator('#diagram-import-cancel').click();
  await page.setViewportSize({width:1800,height:1200});await transfer(page,'drop',' '.repeat(2*1024*1024+1));
  await expect(page.locator('#diagram-import-preview')).toContainText('up to 2 MiB');await expect(page.locator('#diagram-import-apply')).toBeDisabled();await page.locator('#diagram-import-cancel').click();
  await expect(page.locator('#src')).toHaveValue(original);await expect(page.locator('#undo-builder')).toBeDisabled();
});
