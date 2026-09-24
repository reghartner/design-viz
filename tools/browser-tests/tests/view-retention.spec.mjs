import {test,expect,paste} from '../helpers/test.mjs';

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
  return {page:{title:'View retention',blocks:[{heading:'Doorbell story',diagram}]}};
}
const section=page=>page.locator('#docview .doc-sec').first();
const guide=page=>page.locator('#guide');
async function change(page,label,value){const field=guide(page).getByLabel(label,{exact:true});await field.fill(value);await field.press('Enter');}
async function renderJSON(page,edit){
  const raw=JSON.parse(await page.locator('#src').inputValue());edit(raw);
  await page.locator('#editor-tab-json').click();await page.locator('#src').fill(JSON.stringify(raw,null,2));await page.locator('#go').click();
}
for(const kind of ['named','Home/Data flow','single layout'])test(`${kind} view survives node, section and page edits, Undo and host preview`,async({page,server})=>{
  await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(fixture(kind),null,2));
  const flow=kind==='named'?'service-flow':'flow';
  await section(page).getByRole('button',{name:'Data flow',exact:true}).click();
  await expect(section(page)).toHaveAttribute('data-view-id',flow);
  await section(page).locator('[data-dv-node="camera"]').click();await change(page,'id','doorbell');
  await expect(section(page)).toHaveAttribute('data-view-id',flow);
  await expect(section(page).locator('[data-dv-node="doorbell"]')).toBeVisible();
  await page.locator('#undo-builder').click();await expect(section(page)).toHaveAttribute('data-view-id',flow);
  await page.locator('#redo-builder').click();await expect(section(page)).toHaveAttribute('data-view-id',flow);
  await section(page).locator('.sec-h').click();await change(page,'heading','Front door');
  await expect(section(page)).toHaveAttribute('data-view-id',flow);
  await renderJSON(page,raw=>{raw.page.title='Renamed page';});await expect(section(page)).toHaveAttribute('data-view-id',flow);
  await renderJSON(page,raw=>{const d=raw.page.blocks[0].diagram;d.nodes.store={title:'Storage'};d.rows[0].push('store');});await expect(section(page)).toHaveAttribute('data-view-id',flow);
  if(kind==='Home/Data flow'){
    await renderJSON(page,raw=>{const d=raw.page.blocks[0].diagram;d.panels[0].id='front-yard';d.primaryPanel='front-yard';});
    await expect(section(page)).toHaveAttribute('data-view-id',flow);
  }
  await page.getByRole('combobox',{name:'Preview host',exact:true}).selectOption('confluence');await expect(section(page)).toHaveAttribute('data-view-id',flow);
  await page.getByRole('combobox',{name:'Preview host',exact:true}).selectOption('default');await expect(section(page)).toHaveAttribute('data-view-id',flow);
  await page.locator('#workspace-home').click();await paste(page,JSON.stringify(fixture(kind),null,2));
  await expect(section(page)).toHaveAttribute('data-view-id',kind==='named'?'home-story':kind==='single layout'?'layout':'home');
});

test('removing the selected view uses the remaining authored default',async({page,server})=>{
  await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(fixture('named'),null,2));
  await section(page).getByRole('button',{name:'Data flow',exact:true}).click();
  await renderJSON(page,raw=>{raw.page.blocks[0].diagram.layouts.pop();});
  await expect(section(page)).toHaveAttribute('data-view-id','home-story');
});
