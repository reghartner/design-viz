import {test,expect,closeTools} from '../helpers/test.mjs';
import {readFile} from 'node:fs/promises';
import {digest} from '../../canon/drift.mjs';
const diagram=raw=>raw.page.sections[0].diagram;
const node=(page,id)=>page.locator('#docview g.node[data-dv-node="'+id+'"]');
const source=page=>page.locator('#src').inputValue();
async function fixture(page,server,mode='file',view='ambient'){
  const model=(id,d)=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},sections:[{id:'main',diagram:d}]}});
  const provider=model('provider',{nodes:{api:{title:'API'},store:{title:'Store'}},rows:[['api','store']],edges:[{from:'api',to:'store',label:'Persist'}],topologyExports:{core:{nodes:['api','store'],edges:['api->store']}}});
  const consumer=model('consumer',{nodes:{local:{title:'Local'},other:{title:'Other'}},rows:[['local','other']],topologyImports:[{spec:'provider',export:'core',as:'shared'}],edges:[{from:'local',to:'shared::api',label:'Request'}],steps:[{id:'request',edge:'local->shared::api',text:'Request'},{id:'persist',edge:'shared::api->shared::store',text:'Persist'}],autoplay:false});
  if(view==='step')diagram(consumer).view='step';
  if(view==='explore')diagram(consumer).layouts=[{id:'canvas',name:'Canvas',presentation:'explore',sectionLayout:{default:[{x:0,y:0,w:12,h:10}]}}];
  const catalog={version:3,diagrams:[provider,consumer].map(spec=>({id:spec.page.canon.id,title:spec.page.title,canon:spec.page.canon,counts:{nodes:2,steps:0,panels:0},revision:digest(spec),specUrl:spec.page.canon.id+'.json'}))};
  await page.route('**/diagrams.json',route=>route.fulfill({json:catalog}));
  for(const spec of [provider,consumer])await page.route('**/'+spec.page.canon.id+'.json',route=>route.fulfill({json:spec}));
  await page.goto(server.origin+'/workbench.html'+(mode==='canon'?'?diagram=consumer':''));
  if(mode==='canon'){await expect(page.locator('#canon-reader-edit')).toBeEnabled();await page.locator('#canon-reader-edit').click();}
  else await page.locator('#welcome-file').setInputFiles({name:'consumer.spec.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(consumer,null,2))});
  await expect(node(page,'shared::api')).toBeVisible();await closeTools(page);
  return {provider,consumer};
}

async function painted(page,count=2){
  const edges=page.locator('#docview path.edge');await expect(edges).toHaveCount(count);
  // Axis-aligned SVG paths have a zero-width/height bounding box, even when
  // their strokes paint. Check the actual stroke/geometry and capture pixels.
  for(const edge of await edges.all()){
    const paint=await edge.evaluate(e=>{const s=getComputedStyle(e);return {length:e.getTotalLength(),opacity:Number(s.opacity),width:parseFloat(s.strokeWidth),visibility:s.visibility,display:s.display,stroke:s.stroke,d:e.getAttribute('d')};});
    expect(paint.length).toBeGreaterThan(1);expect(paint.opacity).toBeGreaterThan(0);expect(paint.width).toBeGreaterThan(0);
    expect(paint.visibility).toBe('visible');expect(paint.display).not.toBe('none');expect(paint.stroke).not.toBe('none');expect(paint.d).not.toMatch(/NaN/);
  }
}
async function roundtrip(page,before){
  const after=await source(page);expect(after).not.toBe(before);
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(before);
  await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(after);
  return after;
}
for(const mode of ['file','canon'])for(const view of ['ambient','step','explore'])test('saved import edges survive '+mode+' open, save and reload in '+view,async({page,server},info)=>{
  const {provider}=await fixture(page,server,mode,view);await painted(page);
  await page.screenshot({path:info.outputPath('initial-'+mode+'-'+view+'.png')});
  // Changing the server cannot change this session's approved provider.
  diagram(provider).nodes.api.title='Later deployment';diagram(provider).edges=[];
  const before=await source(page);
  await node(page,'local').click();await page.locator('#editor-tab-inspect').click();
  const title=page.getByRole('textbox',{name:'title',exact:true});await title.fill('Edited local');await title.press('Enter');
  await roundtrip(page,before);await painted(page);
  const download=page.waitForEvent('download');await page.locator('#workspace-export-trigger').click();await page.locator('#file-save').click();
  const bytes=await readFile(await(await download).path(),'utf8'),saved=JSON.parse(bytes);
  expect(diagram(saved).edges).toEqual([{from:'local',to:'shared::api',label:'Request'}]);
  expect(Object.keys(diagram(saved).nodes)).toEqual(['local','other']);expect(bytes).not.toContain('topologyProvenance');
  await page.locator('#file-input').setInputFiles({name:'saved.spec.json',mimeType:'application/json',buffer:Buffer.from(bytes)});
  await painted(page);await expect(node(page,'shared::api')).toContainText('API');
  await page.reload();await expect(page.locator('#src')).toHaveValue(bytes);await painted(page);
  await expect(node(page,'shared::api')).toContainText('API');
});
test('endpoint dropdowns rewire both directions with exact history and story retargeting',async({page,server})=>{
  await fixture(page,server);
  for(const [field,id] of [['to','shared::store'],['to','other'],['from','shared::api'],['from','local']]){
    await closeTools(page);await page.locator('#docview path.edge[data-dv-edge="0"]').dispatchEvent('click');
    await page.locator('#editor-tab-inspect').click();const before=await source(page);
    await page.getByRole('combobox',{name:field,exact:true}).selectOption(id);
    await expect.poll(async()=>diagram(JSON.parse(await source(page))).edges[0][field]).toBe(id);
    const after=await roundtrip(page,before),d=diagram(JSON.parse(after));
    expect(d.steps[0].edge).toBe(d.edges[0].from+'->'+d.edges[0].to);
    expect(d.edges).toHaveLength(1);expect(d.topologyProvenance).toBeUndefined();await painted(page);
  }
  await closeTools(page);await page.locator('#docview path.edge[data-dv-edge="1"]').dispatchEvent('click');await page.locator('#editor-tab-inspect').click();
  await expect(page.locator('#guide')).toContainText('Read-only topology');await expect(page.getByRole('combobox',{name:'to',exact:true})).toHaveCount(0);
});
test('manual connections accept imported sources and destinations with exact history',async({page,server},info)=>{
  await fixture(page,server);
  for(const [from,to,action] of [['other','shared::api','alt'],['shared::store','other','inspector'],['shared::store','shared::api','add']]){
    await closeTools(page);const before=await source(page);
    if(action==='inspector'){
      await node(page,from).click();await page.locator('#editor-tab-inspect').click();
      const button=page.getByRole('button',{name:'Connect from this node',exact:true});await button.focus();await page.keyboard.press('Enter');
    }else if(action==='add'){
      await page.locator('#diagram-add').click();await page.locator('[data-add-kind=edge]').click();await closeTools(page);await node(page,from).click();
    }else await node(page,from).click({modifiers:['Alt']});
    await expect(page.locator('.dv-connect-hint')).toBeVisible();await expect(node(page,to)).toHaveClass(/dv-connect-candidate/);
    await closeTools(page);await node(page,to).click();
    await expect.poll(async()=>diagram(JSON.parse(await source(page))).edges.length).toBe(2);
    await expect(page.locator('#docview [data-dv-edge="1"].dv-sel')).toHaveCount(1);
    const after=await roundtrip(page,before),d=diagram(JSON.parse(after));expect(d.edges[1]).toMatchObject({from,to});
    expect(Object.keys(d.nodes)).toEqual(['local','other']);expect(d.topologyProvenance).toBeUndefined();await painted(page,3);
    await closeTools(page);await page.screenshot({path:info.outputPath(action+'-connection.png')});
    await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(before);
  }
});

test('imported connection actions keep stale controls and duplicate edges inert',async({page,server})=>{
  await fixture(page,server);const before=await source(page);
  await node(page,'shared::store').click();await page.locator('#editor-tab-inspect').click();
  await page.evaluate(()=>window.retiredImportedConnect=document.querySelector('.node-connect-button'));
  await closeTools(page);await node(page,'local').click();
  await page.evaluate(()=>window.retiredImportedConnect.click());await expect(page.locator('.dv-connect-hint')).toHaveCount(0);
  for(const target of ['shared::api','shared::store']){
    await closeTools(page);await node(page,'shared::api').click({modifiers:['Alt']});await node(page,target).click();
    await expect(page.locator('.dv-connect-hint')).toHaveCount(0);await expect(page.locator('#src')).toHaveValue(before);
  }
});

test('an endpoint dropdown cannot write after unrendered topology source changes',async({page,server})=>{
  await fixture(page,server);await page.locator('#docview path.edge[data-dv-edge="0"]').dispatchEvent('click');await page.locator('#editor-tab-inspect').click();
  await page.getByRole('combobox',{name:'to',exact:true}).evaluate(el=>window.oldEndpoint=el);
  const raw=JSON.parse(await source(page));diagram(raw).topologyImports[0].export='missing';const changed=JSON.stringify(raw);
  await page.evaluate(text=>{const src=document.querySelector('#src');src.value=text;src.dispatchEvent(new Event('input',{bubbles:true}));window.oldEndpoint.value='shared::store';window.oldEndpoint.dispatchEvent(new Event('change',{bubbles:true}));},changed);
  await expect(page.locator('#src')).toHaveValue(changed);await expect(page.locator('#guide')).toContainText('Source changed');await expect(page.locator('#undo-builder')).toBeDisabled();
});

test('consumer story activates saved cross and provider edges without changing ownership',async({page,server})=>{
  await fixture(page,server,'file','step');const before=await source(page);
  await page.getByRole('button',{name:'STEP',exact:true}).click();
  for(const index of [0,1]){
    await page.locator('#docview .coin[data-dv-step="'+index+'"]').click();
    await expect(page.locator('#docview path.edge[data-dv-edge="'+index+'"]')).toHaveClass(/lit/);await painted(page);
    await closeTools(page);
  }
  await expect(page.locator('#src')).toHaveValue(before);
});
