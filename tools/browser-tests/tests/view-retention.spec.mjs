import {createRequire} from 'node:module';
const {migrate}=createRequire(import.meta.url)('../../migrate-panel-views.cjs');
import {test,expect,paste,prepareEditorSurface,openInspectorGroup} from '../helpers/test.mjs';

function fixture(kind){
  const diagram={primaryPanel:'home',view:'step',autoplay:false,nodes:{camera:{title:'Camera'},service:{title:'Service'}},rows:[['camera','service']],edges:[{from:'camera',to:'service'}],
    panels:[{id:'home',type:'homemap',title:'Home',outline:{w:280,h:160},rooms:[],devices:[],subjects:[]}],
    steps:[{id:'start',nodes:['camera'],text:'Detect a visitor'},{id:'upload',edge:'camera->service',text:'Upload the recording'}]};
  if(kind==='named'){
    diagram.layouts=[{id:'home-story',name:'Home story',sectionLayout:{default:[{panel:'home',x:0,y:0,w:12,h:8},{x:0,y:8,w:12,h:8,hidden:true},{controls:'steps',attachTo:'panel:home',x:0,y:16,w:12,h:4}]}},
      {id:'service-flow',name:'Data flow',sectionLayout:{default:[{x:0,y:0,w:12,h:8},{panel:'home',x:0,y:8,w:12,h:8,hidden:true},{controls:'steps',attachTo:'diagram',x:0,y:16,w:12,h:4}]}}];
    diagram.defaultLayout='home-story';
  }
  if(kind==='single layout')diagram.sectionLayout={default:[{panel:'home',x:0,y:0,w:8,h:8},{x:8,y:0,w:4,h:8},{controls:'steps',attachTo:'panel:home',x:0,y:8,w:12,h:4}]};
  return migrate({page:{title:'View retention',blocks:[{heading:'Doorbell story',diagram}]}}).spec;
}
const section=page=>page.locator('#docview .doc-sec').first();
const guide=page=>page.locator('#guide');
async function change(page,label,value){
  await page.locator('#editor-tab-inspect').click();
  if(label==='Stable identifier')await openInspectorGroup(guide(page).locator('.node-advanced'));
  const field=guide(page).getByLabel(label,{exact:true});await field.fill(value);await field.press('Enter');
}
async function renderJSON(page,edit){
  const raw=JSON.parse(await page.locator('#src').inputValue());edit(raw);
  await page.locator('#editor-tab-json').click();await page.locator('#src').fill(JSON.stringify(raw,null,2));await page.locator('#go').click();
}
for(const kind of ['named','Home/Data flow','single layout'])test(`${kind} view survives node, section and page edits, Undo and host preview`,async({page,server})=>{
  await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(fixture(kind),null,2));await prepareEditorSurface(page);
  const flow=kind==='named'?'service-flow':'flow';
  await page.locator('#docview>.explore-navigation').getByRole('button',{name:'Data flow',exact:true}).click();
  await expect(section(page)).toHaveAttribute('data-view-id',flow);
  await section(page).locator('[data-dv-node="camera"]').click();await change(page,'Stable identifier','doorbell');
  await expect(section(page)).toHaveAttribute('data-view-id',flow);
  await expect(section(page).locator('[data-dv-node="doorbell"]')).toBeVisible();
  await page.locator('#undo-builder').click();await expect(section(page)).toHaveAttribute('data-view-id',flow);
  await page.locator('#redo-builder').click();await expect(section(page)).toHaveAttribute('data-view-id',flow);
  await section(page).locator('.sec-h').click();await change(page,'heading','Front door');
  await expect(section(page)).toHaveAttribute('data-view-id',flow);
  await renderJSON(page,raw=>{raw.page.title='Renamed page';});await expect(section(page)).toHaveAttribute('data-view-id',flow);
  await renderJSON(page,raw=>{const d=raw.page.blocks[0].diagram;d.nodes.store={title:'Storage'};d.rows[0].push('store');});await expect(section(page)).toHaveAttribute('data-view-id',flow);
  if(kind==='Home/Data flow'){
    await renderJSON(page,raw=>{const d=raw.page.blocks[0].diagram;d.panels[0].id='front-yard';d.layouts.forEach(v=>Object.values(v.sectionLayout).filter(Array.isArray).forEach(items=>items.forEach(t=>{if(t.panel==='home')t.panel='front-yard';if(t.attachTo==='panel:home')t.attachTo='panel:front-yard';})));});
    await expect(section(page)).toHaveAttribute('data-view-id',flow);
  }
  if(!await page.locator('#layout-preview-target').isVisible())await page.locator('#workspace-appearance>summary').click();await page.getByRole('combobox',{name:'Preview host',exact:true}).selectOption('confluence');await expect(section(page)).toHaveAttribute('data-view-id',flow);
  if(!await page.locator('#layout-preview-target').isVisible())await page.locator('#workspace-appearance>summary').click();await page.getByRole('combobox',{name:'Preview host',exact:true}).selectOption('default');await expect(section(page)).toHaveAttribute('data-view-id',flow);
  await page.locator('#workspace-appearance>summary').click();
  await page.locator('#workspace-home').click();await paste(page,JSON.stringify(fixture(kind),null,2));await prepareEditorSurface(page);
  await expect(section(page)).toHaveAttribute('data-view-id',kind==='named'?'home-story':'home');
});

test('removing the selected view uses the remaining authored default',async({page,server})=>{
  await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(fixture('named'),null,2));await prepareEditorSurface(page);
  await page.locator('#docview>.explore-navigation').getByRole('button',{name:'Data flow',exact:true}).click();
  await renderJSON(page,raw=>{raw.page.blocks[0].diagram.layouts.pop();});
  await expect(section(page)).toHaveAttribute('data-view-id','home-story');
});

// #964: edit the real title surfaces while a nondefault View is selected.
// Both pinned and closed Contents must survive every source/history publication.
for(const contentsOpen of [false,true])test('inline heading and document title preserve selected View and Contents '+(contentsOpen?'open':'closed')+' through save and Undo/Redo',async({page,server})=>{
 await page.setViewportSize({width:1440,height:900});await page.goto(server.origin+'/workbench.html');
 const original=JSON.stringify(fixture('named'),null,2);await paste(page,original);await prepareEditorSurface(page);
 const src=page.locator('#src'),nav=page.locator('#docview>.explore-navigation'),toggle=nav.locator('.reader-top>button'),contents=nav.locator('.reader-contents');
 await nav.getByRole('button',{name:'Data flow',exact:true}).click();
 if((await toggle.getAttribute('aria-expanded')==='true')!==contentsOpen)await toggle.click();
 async function retained(){
  await expect(section(page)).toHaveAttribute('data-view-id','service-flow');await expect(toggle).toHaveAttribute('aria-expanded',String(contentsOpen));
  if(contentsOpen)await expect(contents).toBeVisible();else await expect(contents).toBeHidden();
 }
 await retained();
 for(const documentTitle of [false,true]){
  // In current desktop chrome .doc-title is hidden; its app-bar counterpart is visible.
  const title=documentTitle?page.locator('#workbench-editor-title'):section(page).locator('.sec-h');
  const edit=page.locator('.dv-inline-editor').getByRole('textbox',{name:documentTitle?'Document title':'Section heading',exact:true});
  const name=documentTitle?'Retitled document':'Retitled section',before=documentTitle?'View retention':'Doorbell story';
  await title.dblclick();await expect(edit).toBeVisible();await expect(edit).toBeFocused();await expect(edit).toHaveValue(before);await expect(src).toHaveValue(original);
  await edit.pressSequentially(name);await edit.press('Enter');await expect(edit).toHaveCount(0);
  const saved=await src.inputValue(),want=JSON.parse(original);if(documentTitle)want.page.title=name;else want.page.blocks[0].heading=name;
  expect(JSON.parse(saved)).toEqual(want);await expect(title).toContainText(name);await retained();
  await page.locator('#undo-builder').click();await expect(src).toHaveValue(original);await expect(title).toContainText(before);await retained();
  await page.locator('#redo-builder').click();await expect(src).toHaveValue(saved);await retained();
  await page.locator('#undo-builder').click();await expect(src).toHaveValue(original);await retained();
 }
});
