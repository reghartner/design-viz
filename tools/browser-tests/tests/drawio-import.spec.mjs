import {deflateRawSync} from 'node:zlib';
import {test,expect,paste,closeTools} from '../helpers/test.mjs';
import {projectFiles,useProjectDownloads} from '../helpers/project-export.mjs';
import {model,secondModel,multi,compressedFile,compressed,original} from '../fixtures/drawio.mjs';

async function parse(page,text){return page.evaluate(async text=>{try{return {raw:await __editorTest.parseDrawio(text)};}catch(ex){return {error:ex.message};}},text);}
async function pasteXml(page,text){await page.evaluate(text=>{const data=new DataTransfer();data.setData('text/plain',text);document.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}));},text);}
async function dropXml(page,target,text,name='orders.drawio'){
  await page.locator(target).evaluate((node,{text,name})=>{const data=new DataTransfer();data.items.add(new File([text],name,{type:'application/xml'}));node.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:data}));},{text,name});
}
test('real XML boundary decodes plain/compressed/mixed pages, wrappers, formatting and direction without network',async({page,server})=>{
  await page.goto(server.origin+'/lifetime/index.html');
  for(const text of [model,compressedFile,multi]){
    const result=await parse(page,text);expect(result.error).toBeUndefined();const d=result.raw.page.sections[0].diagram;
    expect(d.nodes['drawio-node-1'].title).toBe('Receive order');expect(d.nodes['drawio-node-2'].title).toBe('Dispatch');expect(d.nodes['drawio-node-1'].group).toBe('drawio-group-1');
    expect(d.floats[0]).toMatchObject({x:190,y:180});expect(d.edges[0]).toMatchObject({from:'drawio-node-1',to:'drawio-node-2',label:'approved'});expect(d.steps).toEqual([]);
    expect(result.raw.todos.join(' ')).toContain('HTML label formatting');expect(result.raw.todos.join(' ')).toContain('metadata');
  }
  const result=await parse(page,multi);expect(result.raw.page.sections.map(s=>s.heading)).toEqual(['Orders','Second page']);
  const amp=await parse(page,model.replace('&lt;b&gt;Receive order&lt;/b&gt;','API &amp; Worker'));expect(amp.raw.page.sections[0].diagram.nodes['drawio-node-1'].title).toBe('API & Worker');
});
test('XML/security/geometry and decompression failures reject with no partial conversion',async({page,server})=>{
  await page.goto(server.origin+'/lifetime/index.html');
  const cases=[
    ['<mxGraphModel>',/malformed/],['<!DOCTYPE mxfile SYSTEM "https://example.com/external.dtd">'+multi,/DOCTYPE/],
    ['<!DOCTYPE mxfile [<!ENTITY x "x">]>'+multi,/DOCTYPE/],['<?danger now?>'+model,/processing/],
    [model.replace('<root>','<root><script/>'),/unsupported XML/],
    [model.replace('&lt;b&gt;Receive order&lt;/b&gt;','&lt;img src=&quot;https://example.com/pixel&quot;/&gt;'),/active or resource/],
    [model.replace('&lt;b&gt;Receive order&lt;/b&gt;','&lt;script&gt;alert(1)&lt;/script&gt;'),/active content/],
    [model.replace('&lt;b&gt;Receive order&lt;/b&gt;','&lt;a href=&quot;https://example.com&quot;&gt;link&lt;/a&gt;'),/active or resource/],
    [model.replace('source="b"','source="missing"'),/terminals/],[model.replace('id="b"','id="a"'),/duplicate/],
    [model.replace('width="160"','width="NaN"'),/finite/],[model.replace('x="30"','x="200000"'),/finite/],
    [model.replace('parent="g"','parent="a"'),/cycle/],[model.replace('style="group"','style="group" collapsed="1"'),/collapsed/],
    [model.replace('parent="0"','parent="0" visible="0"'),/hidden/],
    [model.replace('startArrow=block;endArrow=none;','endArrow=none;'),/exactly one/],
    [model.replace('startArrow=block;endArrow=none;','endArrow=ERmany;'),/semantic arrow/],
    [model.replace('style="group"','style="shape=image;image=https://example.com/x;"'),/images/],
    [multi.replace('id="second"','id="orders"'),/duplicate page/],
    ['<mxfile><diagram>not base64!</diagram></mxfile>',/Base64/],
    ['<mxfile><diagram>AAAA</diagram></mxfile>',/corrupt/],
    ['<mxfile><diagram>'+deflateRawSync(Buffer.from('%invalid-uri')).toString('base64')+'</diagram></mxfile>',/corrupt/],
    ['<mxfile><diagram>'+compressed('%not-valid-uri')+'</diagram></mxfile>',/malformed/],
    ['<mxfile><diagram>'+compressed('x'.repeat(8*1024*1024+1))+'</diagram></mxfile>',/aggregate 8 MiB/]
  ];
  for(const [text,message] of cases){const result=await parse(page,text);expect(result.raw).toBeUndefined();expect(result.error,text.slice(0,80)).toMatch(message);}
  const large=model.replace('</mxGraphModel>','<!--'+'x'.repeat(4*1024*1024)+'--></mxGraphModel>'),packed=compressed(large);
  expect((await parse(page,'<mxfile><diagram id="a">'+packed+'</diagram><diagram id="b">'+packed+'</diagram></mxfile>')).error).toMatch(/aggregate 8 MiB/);
  await page.evaluate(()=>{window.__drawioInflater=window.DecompressionStream;window.DecompressionStream=undefined;});expect((await parse(page,compressedFile)).error).toMatch(/export uncompressed XML/);
  await page.evaluate(()=>{window.DecompressionStream=window.__drawioInflater;});
});
test('whole-file drop previews every page, cancels, confirms once and saves/reopens native source',async({page,server},info)=>{
  await useProjectDownloads({page});await page.goto(server.origin+'/workbench.html');await paste(page,original);await closeTools(page);
  await dropXml(page,'#workbench-workspace',multi);const preview=page.locator('.file-import-dialog:visible');
  await expect(preview).toContainText('draw.io XML');await expect(preview).toContainText('2 sections');await expect(preview).toContainText('node centers are retained');await expect(page.locator('#src')).toHaveValue(original);
  await page.screenshot({path:info.outputPath('drawio-file-preview.png')});await preview.getByRole('button',{name:'Cancel',exact:true}).click();await expect(page.locator('#src')).toHaveValue(original);await expect(page.locator('#undo-builder')).toBeDisabled();
  await page.locator('#file-import-input').setInputFiles({name:'pages.xml',mimeType:'application/xml',buffer:Buffer.from(multi)});await preview.getByRole('button',{name:'Import',exact:true}).click();
  const converted=await page.locator('#src').inputValue();expect(JSON.parse(converted).page.sections).toHaveLength(2);await expect(page.locator('#docview')).toContainText('Receive order');await expect(page.locator('#docview')).toContainText('Second page node');
  await page.screenshot({path:info.outputPath('drawio-converted.png')});await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);await expect(page.locator('#undo-builder')).toBeDisabled();await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(converted);
  const saving=page.waitForEvent('download');await page.locator('#workspace-export-trigger').click();await page.locator('#file-save').click();const saved=await saving;
  expect(saved.suggestedFilename()).toBe('imported-draw-io.zip');const files=await projectFiles(saved),savedText=files['imported-draw-io.spec.json'];
  expect(Object.keys(files)).toEqual(['imported-draw-io.spec.json','imported-draw-io.html','imported-draw-io.ledger.md','README.md']);
  expect(JSON.parse(savedText).page.sections).toEqual(JSON.parse(converted).page.sections);expect(files['imported-draw-io.html']).toContain('Receive order');
  await page.locator('#file-input').setInputFiles({name:'reopened.spec.json',mimeType:'application/json',buffer:Buffer.from(savedText)});await expect(page.locator('#src')).toHaveValue(savedText);
});
test('additive XML page selection and canvas drop retain locked content, cancel and exact one Undo/Redo',async({page,server},info)=>{
  await page.goto(server.origin+'/workbench.html');await paste(page,original);await closeTools(page);
  const placement=await page.locator('#docview [data-dv-node="pin"]').getAttribute('transform');
  await pasteXml(page,multi);await expect(page.locator('#diagram-import-preview')).toContainText('2 nodes, 1 group, 1 connection');await page.locator('#diagram-import-section').selectOption('1');await expect(page.locator('#diagram-import-preview')).toContainText('1 node');await page.locator('#diagram-import-cancel').click();await expect(page.locator('#src')).toHaveValue(original);
  await pasteXml(page,multi);await page.locator('#diagram-import-section').selectOption('1');await page.locator('#diagram-import-apply').click();
  const after=await page.locator('#src').inputValue(),d=JSON.parse(after).page.sections[0].diagram;expect(d.nodes['drawio-node-3-copy'].title).toBe('Second page node');expect(d.nodes['drawio-node-1-copy']).toBeUndefined();expect(d.floats[0]).toEqual(JSON.parse(original).page.sections[0].diagram.floats[0]);expect(await page.locator('#docview [data-dv-node="pin"]').getAttribute('transform')).toBe(placement);
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);await expect(page.locator('#undo-builder')).toBeDisabled();await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(after);await page.locator('#undo-builder').click();
  await dropXml(page,'#docview .board',compressedFile);await expect(page.locator('#diagram-import-preview')).toContainText('2 nodes');await page.locator('#diagram-import-apply').click();await closeTools(page);await expect(page.locator('#docview')).toContainText('Receive order');await page.screenshot({path:info.outputPath('drawio-additive.png')});await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);
  await pasteXml(page,model.replace('source="b"','source="missing"'));await expect(page.locator('#diagram-import-preview')).toContainText('terminals');await expect(page.locator('#diagram-import-apply')).toBeDisabled();await page.locator('#diagram-import-cancel').click();await expect(page.locator('#src')).toHaveValue(original);await expect(page.locator('#undo-builder')).toBeDisabled();
});

async function holdDecompression(page){await page.evaluate(()=>{
  const Native=window.DecompressionStream;window.__releaseDrawio=null;window.__drawioGateDone=false;window.__drawioCancelled=false;
  window.DecompressionStream=class {constructor(format){
    const native=new Native(format),reader=native.readable.getReader();this.writable=native.writable;
    this.readable=new ReadableStream({async pull(controller){try{
      await new Promise(resolve=>{window.__releaseDrawio=resolve;});
      if(window.__drawioCancelled)return;
      const chunk=await reader.read();if(chunk.done)controller.close();else controller.enqueue(chunk.value);
    }finally{window.__drawioGateDone=true;}},cancel(){window.__drawioCancelled=true;return reader.cancel();}});
  }};
  window.__restoreDrawio=()=>{window.DecompressionStream=Native;};
});}
for(const change of ['input','file','source','project','close','destroy'])test('late additive decompression is retired after '+change,async({page,server})=>{
  await page.goto(server.origin+'/lifetime/index.html');await paste(page,original);await closeTools(page);await holdDecompression(page);await pasteXml(page,compressedFile);
  await expect(page.locator('#diagram-import-preview')).toContainText('Decoding');await expect.poll(()=>page.evaluate(()=>!!window.__releaseDrawio)).toBe(true);await expect(page.locator('#diagram-import-apply')).toBeDisabled();
  if(change==='input')await page.locator('#diagram-import-text').fill('flowchart TD\nFresh-->Text');
  if(change==='file')await page.locator('#diagram-import input[type=file]').setInputFiles({name:'fresh.xml',mimeType:'application/xml',buffer:Buffer.from(secondModel)});
  if(change==='source')await page.locator('#src').evaluate(el=>{el.value+=' ';el.dispatchEvent(new Event('input',{bubbles:true}));});
  if(change==='project')await page.evaluate(()=>__editorTest.builder.loadText(document.querySelector('#src').value));
  if(change==='close')await page.locator('#diagram-import-cancel').click();
  if(change==='destroy')await page.evaluate(()=>__editorTest.builder.destroy());
  await expect.poll(()=>page.evaluate(()=>window.__drawioCancelled)).toBe(true);
  expect(await page.evaluate(()=>window.__drawioGateDone)).toBe(false);
  await page.evaluate(()=>{window.__releaseDrawio();window.__restoreDrawio();});
  await expect.poll(()=>page.evaluate(()=>window.__drawioGateDone)).toBe(true);
  if(change==='input'){await expect(page.locator('#diagram-import-preview')).toContainText('2 nodes');await expect(page.locator('#diagram-import-text')).toHaveValue('flowchart TD\nFresh-->Text');}
  else if(change==='file')await expect(page.locator('#diagram-import-preview')).toContainText('1 node');
  else if(change==='source' || change==='project')await expect(page.locator('#diagram-import-apply')).toBeDisabled();
  else await expect(page.locator('#diagram-import')).not.toBeVisible();
  await expect(page.locator('#src')).toHaveValue(original+(change==='source'?' ':''));
});
test('late whole-file decompression cannot open a preview after source changes',async({page,server})=>{
  await page.goto(server.origin+'/workbench.html');await paste(page,original);await holdDecompression(page);
  await page.locator('#file-import-input').setInputFiles({name:'orders.drawio',mimeType:'application/xml',buffer:Buffer.from(compressedFile)});await expect.poll(()=>page.evaluate(()=>!!window.__releaseDrawio)).toBe(true);
  await page.locator('#src').evaluate(el=>{el.value+=' ';el.dispatchEvent(new Event('input',{bubbles:true}));});
  await expect.poll(()=>page.evaluate(()=>window.__drawioCancelled)).toBe(true);
  expect(await page.evaluate(()=>window.__drawioGateDone)).toBe(false);
  await expect(page.locator('.file-import-dialog:visible')).toHaveCount(0);await expect(page.locator('#src')).toHaveValue(original+' ');
  await page.evaluate(()=>{window.__releaseDrawio();window.__restoreDrawio();});await expect.poll(()=>page.evaluate(()=>window.__drawioGateDone)).toBe(true);await expect(page.locator('.file-import-dialog:visible')).toHaveCount(0);await expect(page.locator('#src')).toHaveValue(original+' ');
});
