import {test,expect,pastePage,closeTools} from '../helpers/test.mjs';
import {editorSpec} from '../fixtures/editor-spec.mjs';

const PNG='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4UYAAAAASUVORK5CYII=';
const GIF='R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
function fixture(){
  const raw=editorSpec(),d=raw.page.blocks[0].diagram;
  const standard={...structuredClone(d.layouts[0]),id:'standard-images',name:'Standard images',presentation:'standard'};
  const explore={...structuredClone(standard),id:'explore-images',name:'Explore images',presentation:'explore'};
  d.layouts=[standard,explore];d.defaultLayout='standard-images';return raw;
}
const source=page=>page.locator('#src').inputValue();
const board=page=>page.locator('#docview .doc-sec[data-dv-section="0"] .board:visible').first();
async function transfer(page,kind,{base64=PNG,name='camera-capture.png',type='image/png'}={}){
  return page.evaluate(({kind,base64,name,type})=>{
    const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0)),file=new File([bytes],name,{type}),data=new DataTransfer();data.items.add(file);
    const target=document.querySelector('#docview .doc-sec[data-dv-section="0"] .board:not([hidden])'),rect=target.getBoundingClientRect();
    const init={bubbles:true,cancelable:true,dataTransfer:data,clipboardData:data,clientX:rect.left+rect.width/2,clientY:rect.top+rect.height/2};
    const event=kind==='paste'?new ClipboardEvent('paste',init):new DragEvent(kind,init);
    (kind==='paste'?document:target).dispatchEvent(event);return event.defaultPrevented;
  },{kind,base64,name,type});
}

test('drop and paste add ordinary image nodes in Standard and Explore with one Undo each',async({page,server})=>{
  await page.goto(server.origin+'/workbench.html');const raw=fixture(),original=JSON.stringify(raw,null,2);await pastePage(page,original);await closeTools(page);
  await transfer(page,'dragenter');
  await expect(page.locator('.file-drop-overlay:visible')).toHaveCount(0);
  await expect(board(page)).toHaveClass(/dv-image-drop-target/);
  await transfer(page,'dragover');await expect(board(page)).toHaveClass(/dv-image-drop-target/);
  await expect(page.locator('.file-drop-overlay:visible')).toHaveCount(0);
  expect(await transfer(page,'drop')).toBe(true);
  const image=page.locator('#docview [data-dv-node-image="true"]');await expect(image).toHaveCount(1);
  await expect(page.locator('.file-drop-overlay:visible')).toHaveCount(0);
  await expect(page.locator('.file-import-dialog:visible')).toHaveCount(0);
  await expect(image.locator('image.node-image')).toHaveAttribute('href',/^data:image\/png;base64,/);
  await expect(image).toHaveAttribute('aria-label',/Camera capture/);
  await image.click();await page.locator('#editor-tab-inspect').click();
  await expect(page.locator('#guide').getByLabel('Name',{exact:true})).toHaveValue('Camera capture');
  await expect(page.locator('#guide').getByLabel('Image description',{exact:true})).toHaveValue('Camera capture');
  const afterDrop=await source(page),dropNode=Object.entries(JSON.parse(afterDrop).page.blocks[0].diagram.nodes).find(([,node])=>node.image);
  expect(dropNode[0]).toMatch(/^camera-capture\d+$/);expect(dropNode[1]).toMatchObject({title:'Camera capture',alt:'Camera capture'});
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);await expect(page.locator('#undo-builder')).toBeDisabled();
  await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(afterDrop);
  await page.locator('#docview > .explore-navigation').getByRole('button',{name:'Explore images',exact:true}).click();
  await expect(page.locator('#docview .viewport-explore [data-dv-node-image="true"]')).toHaveCount(1);
  const beforePaste=await source(page);expect(await transfer(page,'paste',{name:'pasted-view.png'})).toBe(true);
  await expect(page.locator('#docview .viewport-explore [data-dv-node-image="true"]')).toHaveCount(2);
  const afterPaste=await source(page);expect(afterPaste).not.toBe(beforePaste);
  const pastedDiagram=JSON.parse(afterPaste).page.blocks[0].diagram;
  const pastedId=Object.entries(pastedDiagram.nodes).find(([,node])=>node.title==='Pasted view')[0];
  expect(pastedDiagram.rows.at(-1)).toContain(pastedId);expect(pastedDiagram.floats||[]).not.toContainEqual(expect.objectContaining({id:pastedId}));
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(beforePaste);
  await expect(page.locator('#docview .viewport-explore [data-dv-node-image="true"]')).toHaveCount(1);
});

test('unsupported images, ordinary clipboard/files, stale reads and destroy never partially mutate',async({page,server})=>{
  await page.goto(server.origin+'/lifetime/index.html');const original=JSON.stringify(fixture());await pastePage(page,original);await closeTools(page);
  expect(await transfer(page,'drop',{base64:GIF,name:'animation.gif',type:'image/gif'})).toBe(true);
  await expect(page.locator('.file-import-status:visible')).toContainText('Binary files are not supported');
  expect(await transfer(page,'drop',{base64:PNG.slice(0,24),name:'truncated.png',type:'image/png'})).toBe(true);
  await expect(page.locator('#src')).toHaveValue(original);await expect(page.locator('#guide')).toContainText(/not a real PNG, JPEG or WebP/);
  const isolated=await page.evaluate(()=>{
    const target=document.querySelector('#docview .doc-sec[data-dv-section="0"] .board:not([hidden])');
    const text=new DataTransfer();text.setData('text/plain','ordinary prose');const paste=new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:text});document.dispatchEvent(paste);
    const json=new DataTransfer();json.items.add(new File(['{}'],'diagram.json',{type:'application/json'}));const drop=new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:json});target.dispatchEvent(drop);
    return {paste:paste.defaultPrevented,drop:drop.defaultPrevented};
  });
  // The additive board importer owns diagram JSON drops; image ingestion must
  // still leave ordinary clipboard text and rejected documents unchanged.
  expect(isolated).toEqual({paste:false,drop:true});await expect(page.locator('#src')).toHaveValue(original);
  await page.locator('#diagram-import-cancel').click();
  const mixed=await page.evaluate(({base64})=>{
    const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0)),image=()=>new File([bytes],'mixed.png',{type:'image/png'});
    const target=document.querySelector('#docview .doc-sec[data-dv-section="0"] .board:not([hidden])');
    const dispatch=(kind,data)=>{const init={bubbles:true,cancelable:true,dataTransfer:data,clipboardData:data};const event=kind==='paste'?new ClipboardEvent(kind,init):new DragEvent(kind,init);(kind==='paste'?document:target).dispatchEvent(event);return event.defaultPrevented;};
    const text=new DataTransfer();text.items.add(image());text.setData('text/plain','caption');
    const html=new DataTransfer();html.items.add(image());html.setData('text/html','<b>caption</b>');
    const uri=new DataTransfer();uri.items.add(image());uri.setData('text/uri-list','https://example.test/image.png');
    const nonimage=new DataTransfer();nonimage.items.add(image());nonimage.items.add(new File(['{}'],'data.json',{type:'application/json'}));
    const multiple=new DataTransfer();multiple.items.add(image());multiple.items.add(image());
    return {text:dispatch('paste',text),html:dispatch('paste',html),uri:dispatch('paste',uri),nonimage:dispatch('drop',nonimage),multiple:dispatch('drop',multiple)};
  },{base64:PNG});
  expect(mixed).toEqual({text:false,html:false,uri:false,nonimage:true,multiple:true});
  await expect(page.locator('.file-import-status:visible')).toContainText('Choose one file');
  await expect(page.locator('#src')).toHaveValue(original);
  await page.evaluate(({base64})=>{
    const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0)),data=new DataTransfer();data.items.add(new File([bytes],'late.png',{type:'image/png'}));
    const target=document.querySelector('#docview .doc-sec[data-dv-section="0"] .board:not([hidden])');target.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:data}));
    const src=document.querySelector('#src');src.value+=' ';src.dispatchEvent(new Event('input',{bubbles:true}));
  },{base64:PNG});
  await expect(page.locator('#src')).toHaveValue(original+' ');await expect(page.locator('#docview [data-dv-node-image="true"]')).toHaveCount(0);
  await page.evaluate(()=>{document.querySelector('#src').value=document.querySelector('#src').value.trimEnd();__editorTest.builder.loadSpec(JSON.parse(document.querySelector('#src').value));});
  const retiredBaseline=await source(page);
  await page.evaluate(({base64})=>{
    const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0)),data=new DataTransfer();data.items.add(new File([bytes],'retired.png',{type:'image/png'}));
    const target=document.querySelector('#docview .doc-sec[data-dv-section="0"] .board:not([hidden])');target.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:data}));__editorTest.builder.destroy();
  },{base64:PNG});
  await page.waitForTimeout(50);await expect(page.locator('#src')).toHaveValue(retiredBaseline);await expect(page.locator('#undo-builder')).toBeDisabled();
});
