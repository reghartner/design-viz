import {projectSource,useProjectDownloads} from '../helpers/project-export.mjs';
import {test,expect,paste,closeTools} from '../helpers/test.mjs';

test.beforeEach(useProjectDownloads);


const chart='flowchart LR\nsubgraph service [Service]\nA["Receive order"] --> B{Ready}\nend\nB -->|yes| C[Dispatch]\nB -->|no| D[Review]\nclassDef ready fill:#cfc\nclass B ready';
const markdown='# Order flow\n```mermaid\n'+chart+'\n```';
const original=JSON.stringify({page:{title:'Retained document',sections:[{heading:'First',diagram:{nodes:{keep:{title:'Keep first'}},rows:[['keep']],edges:[],steps:[]}},{heading:'Destination',text:['Retained prose'],diagram:{nodes:{pin:{title:'Locked existing'}},rows:[[]],floats:[{id:'pin',side:'below',x:80,y:300,locked:true,noSpread:true}],edges:[],steps:[]}}]}},null,2);
async function drop(page,target,text,name='order.mmd'){
  await page.locator(target).evaluate((node,{text,name})=>{const data=new DataTransfer();data.items.add(new File([text],name,{type:'text/plain'}));node.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:data}));},{text,name});
}

test('whole Markdown drop and chosen flowchart preview warnings, cancel, confirm once, save and reopen',async({page,server},info)=>{
  await page.goto(server.origin+'/workbench.html');await paste(page,original);await closeTools(page);
  await drop(page,'#workbench-workspace',markdown,'orders.md');
  const preview=page.locator('.file-import-dialog:visible');
  await expect(preview).toContainText('Markdown Mermaid flowchart');await expect(preview).toContainText('4 nodes · 1 group · 3 connections');
  await expect(preview).toContainText('shapes are normalized to native cards');await expect(preview).toContainText('styles and classes are not imported');
  await expect(page.locator('#src')).toHaveValue(original);await page.screenshot({path:info.outputPath('flowchart-file-preview.png')});
  await preview.getByRole('button',{name:'Cancel',exact:true}).click();await expect(page.locator('#src')).toHaveValue(original);await expect(page.locator('#undo-builder')).toBeDisabled();
  await page.locator('#file-import-input').setInputFiles({name:'orders.mermaid',mimeType:'text/plain',buffer:Buffer.from(chart)});
  await preview.getByRole('button',{name:'Import',exact:true}).click();
  const converted=await page.locator('#src').inputValue(),raw=JSON.parse(converted),d=raw.page.sections[0].diagram;
  expect(d.steps).toEqual([]);expect(d.edges).toHaveLength(3);expect(d.nodes.A.group).toBe('service');expect(d.nodes.B.group).toBe('service');
  await expect(page.locator('#docview [data-dv-node="A"]')).toBeVisible();await expect(page.locator('#docview')).toContainText('Receive order');
  const positions=await page.locator('#docview [data-dv-node]').evaluateAll(nodes=>Object.fromEntries(nodes.map(node=>[node.dataset.dvNode,node.getBoundingClientRect().x])));
  expect(positions.A).toBeLessThan(positions.B);expect(positions.B).toBeLessThan(positions.C);
  await page.screenshot({path:info.outputPath('flowchart-converted.png')});
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);await expect(page.locator('#undo-builder')).toBeDisabled();
  await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(converted);await expect(page.locator('#redo-builder')).toBeDisabled();
  const saving=page.waitForEvent('download');await page.locator('#workspace-export-trigger').click();await page.locator('#file-save').click();const saved=await saving;
  const savedText=await projectSource(saved);expect(JSON.parse(savedText).page.sections[0].diagram).toEqual(d);
  await page.locator('#file-input').setInputFiles({name:'reopened.spec.json',mimeType:'application/json',buffer:Buffer.from(savedText)});await expect(page.locator('#src')).toHaveValue(savedText);await expect(page.locator('#docview [data-dv-node="A"]')).toBeVisible();
});

test('additive flowchart paste targets the current section, keeps locks, cancel and exact single Undo/Redo',async({page,server},info)=>{
  await page.goto(server.origin+'/workbench.html');await paste(page,original);await closeTools(page);
  // A real node selection makes the second section the destination.
  await page.locator('#docview [data-dv-node="pin"]').click();await closeTools(page);
  const beforePlacement=await page.locator('#docview [data-dv-node="pin"]').getAttribute('transform');
  const pasteChart=async text=>page.evaluate(text=>{const data=new DataTransfer();data.setData('text/plain',text);document.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}));},text);
  await pasteChart(markdown);await expect(page.locator('#diagram-import')).toContainText('Section 2 · Destination');
  await expect(page.locator('#diagram-import-preview')).toContainText('4 nodes, 1 group, 3 connections');await expect(page.locator('#diagram-import-preview')).toContainText('native cards');
  await page.locator('#diagram-import-cancel').click();await expect(page.locator('#src')).toHaveValue(original);
  await pasteChart(markdown);await page.locator('#diagram-import-apply').click();const after=await page.locator('#src').inputValue(),raw=JSON.parse(after),d=raw.page.sections[1].diagram;
  expect(raw.page.sections[0]).toEqual(JSON.parse(original).page.sections[0]);expect(d.floats[0]).toEqual(JSON.parse(original).page.sections[1].diagram.floats[0]);expect(d.nodes['A-copy'].group).toBe('service-copy');expect(d.steps).toEqual([]);
  await expect(page.locator('#docview [data-dv-node="A-copy"].dv-sel')).toHaveCount(1);
  expect(await page.locator('#docview [data-dv-node="pin"]').getAttribute('transform')).toBe(beforePlacement);
  await closeTools(page);
  await page.screenshot({path:info.outputPath('flowchart-additive.png')});
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);await expect(page.locator('#undo-builder')).toBeDisabled();
  await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(after);await expect(page.locator('#redo-builder')).toBeDisabled();
  await page.locator('#undo-builder').click();
  await drop(page,'#docview .doc-sec[data-dv-section="1"] .board','graph TD\nX-->Y');await expect(page.locator('#diagram-import-preview')).toContainText('2 nodes');await page.locator('#diagram-import-apply').click();
  await expect(page.locator('#docview [data-dv-node="X-copy"]')).toBeVisible();await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);
  await pasteChart('flowchart TD\nA --- B');await expect(page.locator('#diagram-import-apply')).toBeDisabled();await expect(page.locator('#diagram-import-preview')).toContainText('directed');await page.locator('#diagram-import-cancel').click();await expect(page.locator('#src')).toHaveValue(original);await expect(page.locator('#undo-builder')).toBeDisabled();
});

test('inline Mermaid flowchart previews conversions; malformed and unsafe inputs preserve source',async({page,server})=>{
  await page.goto(server.origin+'/workbench.html');await paste(page,original);await page.locator('#editor-tab-file').click();
  await page.locator('#sec-insert > summary').click();await page.locator('#import-mermaid').click();await page.locator('#import-mermaid-text').fill(chart);
  await expect(page.locator('#import-mermaid-preview')).toContainText('native cards');await expect(page.locator('#import-mermaid-preview')).toContainText('styles and classes');
  await page.locator('#import-mermaid-cancel').click();await expect(page.locator('#src')).toHaveValue(original);
  await page.locator('#import-mermaid').click();await page.locator('#import-mermaid-convert').click();expect(JSON.parse(await page.locator('#src').inputValue()).page.title).toBe('Converted flowchart');
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);
  for(const text of ['flowchart TD\nA -->','flowchart TD\nclick A "https://example.com"','flowchart TD\nA["<img src=x onerror=alert(1)>"]']){
    await page.locator('#import-mermaid').click();await page.locator('#import-mermaid-text').fill(text);await page.locator('#import-mermaid-convert').click();await expect(page.locator('#src')).toHaveValue(original);await expect(page.locator('#undo-builder')).toBeDisabled();
  }
  await page.locator('#import-mermaid-cancel').click();await page.locator('#file-import-input').setInputFiles({name:'bad.mmd',mimeType:'text/plain',buffer:Buffer.from('graph TD\nA --- B')});await expect(page.locator('.file-import-status:visible')).toContainText('directed');await expect(page.locator('#src')).toHaveValue(original);
});
