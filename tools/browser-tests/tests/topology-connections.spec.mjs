import {readFile} from 'node:fs/promises';
import {projectFiles,projectSource,useProjectDownloads} from '../helpers/project-export.mjs';
import {test,expect,closeTools,pastePage} from '../helpers/test.mjs';
import {digest} from '../../canon/drift.mjs';

test.beforeEach(useProjectDownloads);

const diagram=raw=>raw.page.sections[0].diagram;
const node=(page,id)=>page.locator('#docview g.node[data-dv-node="'+id+'"]');
const source=page=>page.locator('#src').inputValue();
async function fixture(page,server,mode='file',view='ambient',configure){
  const model=(id,d)=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},sections:[{id:'main',diagram:d}]}});
  const provider=model('provider',{nodes:{api:{title:'API'},store:{title:'Store'}},rows:[['api','store']],edges:[{from:'api',to:'store',label:'Persist'}],topologyExports:{core:{nodes:['api','store'],edges:['api->store']}}});
  const consumer=model('consumer',{nodes:{local:{title:'Local'},other:{title:'Other'}},rows:[['local','other']],topologyImports:[{spec:'provider',export:'core',as:'shared'}],edges:[{from:'local',to:'shared::api',label:'Request'}],steps:[{id:'request',edge:'local->shared::api',text:'Request'},{id:'persist',edge:'shared::api->shared::store',text:'Persist'}],autoplay:false});
  if(view==='step')diagram(consumer).view='step';
  if(view==='explore')diagram(consumer).layouts=[{id:'canvas',name:'Canvas',presentation:'explore',sectionLayout:{default:[{x:0,y:0,w:12,h:10}]}}];
  if(configure)configure(provider,consumer);
  const catalog={version:3,diagrams:[provider,consumer].map(spec=>({id:spec.page.canon.id,title:spec.page.title,canon:spec.page.canon,counts:{nodes:2,steps:0,panels:0},revision:digest(spec),specUrl:spec.page.canon.id+'.json'}))};
  await page.route('**/diagrams.json',route=>route.fulfill({json:catalog}));
  for(const spec of [provider,consumer])await page.route('**/'+spec.page.canon.id+'.json',route=>route.fulfill({json:spec}));
  await page.goto(server.origin+(mode==='lifetime'?'/lifetime/index.html':'/workbench.html')+(mode==='canon'?'?diagram=consumer':''));
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
async function viewOptions(page){
  const navigation=page.locator('#docview>.explore-navigation'),settings=navigation.locator('.section-view-settings');
  if(!await settings.isVisible() && await navigation.locator('.reader-utilities>summary').isVisible())await navigation.locator('.reader-utilities>summary').click();
  const options=settings.locator('details');if(await options.getAttribute('open')===null)await options.getByText('View',{exact:true}).click();return settings;
}
for(const mode of ['file','canon'])for(const view of ['ambient','step','explore'])test('saved import edges survive '+mode+' open, save and reload in '+view,async({page,server},info)=>{
  const {provider}=await fixture(page,server,mode,view);await painted(page);
  await page.screenshot({path:info.outputPath('initial-'+mode+'-'+view+'.png')});
  // Changing the server cannot change this session's approved provider.
  diagram(provider).nodes.api.title='Later deployment';diagram(provider).edges=[];
  const before=await source(page);
  await node(page,'local').click();await page.locator('#editor-tab-inspect').click();
  const title=page.getByRole('textbox',{name:'Name',exact:true});await title.fill('Edited local');await title.press('Enter');
  await roundtrip(page,before);await painted(page);
  const download=page.waitForEvent('download');await page.locator('#workspace-export-trigger').click();await page.locator('#file-save').click();
  const bytes=await projectSource(await download),saved=JSON.parse(bytes);
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
  await page.getByRole('button',{name:'Step',exact:true}).click();
  for(const index of [0,1]){
    await page.locator('#docview .coin[data-dv-step="'+index+'"]').click();
    await expect(page.locator('#docview path.edge[data-dv-edge="'+index+'"]')).toHaveClass(/lit/);await painted(page);
    await closeTools(page);
  }
  await expect(page.locator('#src')).toHaveValue(before);
});

test('New View and Duplicate View accept an edge-bearing referenced topology document',async({page,server})=>{
  await page.setViewportSize({width:1440,height:1000});const {consumer}=await fixture(page,server),before=await source(page);
  let settings=await viewOptions(page);await settings.getByRole('button',{name:'New View',exact:true}).click();
  const created=await source(page),createdRaw=JSON.parse(created);expect(createdRaw.page.sections[0].views).toHaveLength(2);
  expect(diagram(createdRaw).topologyImports).toEqual(diagram(consumer).topologyImports);expect(diagram(createdRaw).topologyProvenance).toBeUndefined();
  settings=await viewOptions(page);await settings.getByRole('button',{name:'Duplicate View',exact:true}).click();
  const duplicated=await source(page),duplicatedRaw=JSON.parse(duplicated);expect(duplicatedRaw.page.sections[0].views).toHaveLength(3);
  expect(diagram(duplicatedRaw).topologyImports).toEqual(diagram(consumer).topologyImports);expect(Object.keys(diagram(duplicatedRaw).nodes)).toEqual(['local','other']);
  await painted(page);await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(created);
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(before);
});


for(const imported of [true,false])for(const first of ['label','endpoint'])test('same Inspector accepts '+first+' then endpoint edits for '+(imported?'imported':'local')+' nodes',async({page,server})=>{
  const destination=imported?'shared::store':'third';
  if(imported)await fixture(page,server);
  else{
    await page.goto(server.origin+'/workbench.html');
    await pastePage(page,JSON.stringify({page:{title:'Local connections',sections:[{diagram:{nodes:{local:{},other:{},third:{}},rows:[['local','other','third']],edges:[{from:'local',to:'other',label:'Request'}],steps:[{id:'request',edge:'local->other'}]}}]}}));
    await closeTools(page);
  }
  await page.locator('#docview path.edge[data-dv-edge="0"]').dispatchEvent('click');await page.locator('#editor-tab-inspect').click();
  const before=await source(page);
  if(first==='label'){
    const label=page.getByRole('textbox',{name:'label',exact:true});await label.fill('Changed');await label.press('Enter');
    await expect.poll(async()=>diagram(JSON.parse(await source(page))).edges[0].label).toBe('Changed');
  }else{
    await page.getByRole('combobox',{name:'to',exact:true}).selectOption(destination);
    await expect.poll(async()=>diagram(JSON.parse(await source(page))).edges[0].to).toBe(destination);
  }
  const afterFirst=await source(page),field=first==='label'?'to':'from',value=first==='label'?destination:'other';
  // Do not reselect the edge: ordinary field edits retain this mounted form.
  await page.getByRole('combobox',{name:field,exact:true}).selectOption(value);
  await expect.poll(async()=>diagram(JSON.parse(await source(page))).edges[0][field]).toBe(value);
  const afterSecond=await source(page),d=diagram(JSON.parse(afterSecond));
  expect(d.edges[0].to).toBe(destination);expect(d.steps[0].edge).toBe(d.edges[0].from+'->'+destination);
  expect(d.edges[0].label).toBe(first==='label'?'Changed':'Request');expect(d.edges).toHaveLength(1);
  for(const text of [afterFirst,before]){await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(text);}
  for(const text of [afterFirst,afterSecond]){await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(text);}
});


test('held endpoint callbacks cannot edit replacement source after manual Render',async({page,server})=>{
  await fixture(page,server);await page.locator('#docview path.edge[data-dv-edge="0"]').dispatchEvent('click');await page.locator('#editor-tab-inspect').click();
  await page.getByRole('combobox',{name:'to',exact:true}).evaluate(el=>window.oldEndpoint=el);
  const raw=JSON.parse(await source(page)),d=diagram(raw);d.edges[0]={from:'other',to:'local',label:'Replacement'};d.steps[0].edge='other->local';d.nodes.local.title='Replacement rendered';
  const changed=JSON.stringify(raw);await page.locator('#editor-tab-json').click();await page.locator('#src').fill(changed);await page.locator('#go').click();
  await expect(node(page,'local')).toContainText('Replacement rendered');
  await page.evaluate(()=>{window.oldEndpoint.value='shared::store';window.oldEndpoint.dispatchEvent(new Event('change',{bubbles:true}));});
  await expect(page.locator('#src')).toHaveValue(changed);
});


for(const view of ['ambient','explore'])test('imported node arrangement survives history, block drag, reset and authored save/reload in '+view,async({page,server},info)=>{
  await fixture(page,server,'file',view);const before=await source(page);
  const center=async id=>node(page,id).evaluate(n=>{const m=n.transform.baseVal.consolidate().matrix,c=n.querySelector('.card');return {x:m.e+Number(c.getAttribute('width'))/2,y:m.f+Number(c.getAttribute('height'))/2};});
  const ids=['local','other','shared::api','shared::store'],initial=await Promise.all(ids.map(center));
  const handle=page.locator('#docview .dv-topology-boundary[data-topology-import="shared"] .dv-topology-handle');
  async function drag(target,dx,dy){
    await closeTools(page);const box=await target.boundingBox(),scale=await node(page,'shared::api').evaluate(n=>n.ownerSVGElement.getScreenCTM().a);
    const x=Math.round(box.x+box.width/2),y=Math.round(box.y+box.height/2);
    await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+Math.round(dx*scale),y+Math.round(dy*scale),{steps:10});
    return {dx:Math.round(dx*scale)/scale,dy:Math.round(dy*scale)/scale};
  }
  const nodeDelta=await drag(node(page,'shared::store').locator('.card'),-100,100);
  await expect(page.locator('#docview .dv-ghost')).toHaveCount(1);await expect(page.locator('#docview .dv-free-edge-preview')).toHaveCount(1);
  await page.mouse.up();const arranged=await roundtrip(page,before),arrangedD=diagram(JSON.parse(arranged));
  expect(arrangedD.topologyImports[0].nodePositions.store).toBeDefined();
  const expected=JSON.parse(before);diagram(expected).topologyImports=arrangedD.topologyImports;expect(JSON.parse(arranged)).toEqual(expected);
  const positions=await Promise.all(ids.map(center));expect(positions.slice(0,3)).toEqual(initial.slice(0,3));
  expect(positions[3].x-initial[3].x).toBeCloseTo(nodeDelta.dx,0);expect(positions[3].y-initial[3].y).toBeCloseTo(nodeDelta.dy,0);
  const blockDelta=await drag(handle,50,40);await expect(page.locator('#docview .dv-ghost')).toHaveCount(2);await page.mouse.up();
  const moved=await roundtrip(page,arranged),movedD=diagram(JSON.parse(moved));
  expect(movedD.topologyImports[0].nodePositions).toEqual(arrangedD.topologyImports[0].nodePositions);
  const movedPositions=await Promise.all(ids.map(center));expect(movedPositions.slice(0,2)).toEqual(initial.slice(0,2));
  for(const i of [2,3]){expect(movedPositions[i].x-positions[i].x).toBeCloseTo(blockDelta.dx,0);expect(movedPositions[i].y-positions[i].y).toBeCloseTo(blockDelta.dy,0);}
  await closeTools(page);await handle.click();await page.getByRole('menuitem',{name:'Reset node arrangement',exact:true}).click();
  const reset=await roundtrip(page,moved),resetD=diagram(JSON.parse(reset));
  expect(resetD.topologyImports[0].nodePositions).toBeUndefined();expect(resetD.topologyImports[0].position).toEqual(movedD.topologyImports[0].position);
  const resetPositions=await Promise.all(ids.map(center));
  for(const i of [2,3]){expect(resetPositions[i].x-initial[i].x).toBeCloseTo(blockDelta.dx,0);expect(resetPositions[i].y-initial[i].y).toBeCloseTo(blockDelta.dy,0);}
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(moved);
  await closeTools(page);await node(page,'shared::store').click();await page.locator('#editor-tab-inspect').click();
  await page.getByRole('button',{name:'Reset node arrangement',exact:true}).click();await expect(page.locator('#src')).toHaveValue(reset);
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(moved);
  await drag(node(page,'shared::store').locator('.card'),50,50);await page.keyboard.press('Escape');await page.mouse.up();await expect(page.locator('#src')).toHaveValue(moved);
  await expect(page.locator('#docview .dv-ghost,.dv-free-edge-preview')).toHaveCount(0);
  await drag(node(page,'shared::store').locator('.card'),50,50);const stale=moved+'\n';
  await page.evaluate(value=>{const src=document.querySelector('#src');src.value=value;src.dispatchEvent(new Event('input',{bubbles:true}));},stale);
  await page.mouse.up();await expect(page.locator('#src')).toHaveValue(stale);await expect(page.locator('#docview .dv-ghost,.dv-free-edge-preview')).toHaveCount(0);
  await page.locator('#editor-tab-json').click();await page.locator('#go').click();await closeTools(page);
  const download=page.waitForEvent('download');await page.locator('#workspace-export-trigger').click();await page.locator('#file-save').click();
  const bytes=await projectSource(await download);expect(diagram(JSON.parse(bytes))).toEqual(movedD);
  await page.locator('#file-input').setInputFiles({name:'arranged.spec.json',mimeType:'application/json',buffer:Buffer.from(bytes)});
  await page.reload();await expect(node(page,'shared::store')).toBeVisible();await closeTools(page);
  expect(await Promise.all(ids.map(center))).toEqual(movedPositions);await painted(page);
  // Explore's #docview holds only fixed-position children, so capture the viewport.
  await info.attach('custom-import-arrangement',{body:await page.screenshot(),contentType:'image/png'});
});

for(const [view,selection] of [['ambient','Shift'],['explore','Alt marquee']])test(view+' imported groups drag together after '+selection+' selection from imported and local initiators',async({page,server})=>{
  const {provider}=await fixture(page,server,'file',view,(_provider,consumer)=>{
    const d=diagram(consumer);d.rows=[[]];d.floats=[{id:'local',x:200,y:520},{id:'other',x:900,y:520}];
    Object.assign(d.topologyImports[0],{position:{x:200,y:180},nodePositions:{api:{x:0,y:0},store:{x:260,y:0}}});
  });
  const providerSource=JSON.stringify(provider),all=['local','other','shared::api','shared::store'];
  async function centers(){return Object.fromEntries(await Promise.all(all.map(async id=>[id,await node(page,id).evaluate(n=>{const m=n.transform.baseVal.consolidate().matrix,c=n.querySelector('.card');return {x:m.e+Number(c.getAttribute('width'))/2,y:m.f+Number(c.getAttribute('height'))/2};})])));}
  async function select(ids){
    await closeTools(page);
    if(selection==='Shift'){
      await node(page,ids[0]).click();await node(page,ids[1]).click({modifiers:['Shift']});
    }else{
      const bounds=await page.locator(ids.map(id=>'#docview [data-dv-node="'+id+'"] .card').join(',')).evaluateAll(cards=>{
        const board=cards[0].closest('.board').getBoundingClientRect(),boxes=cards.map(card=>card.getBoundingClientRect());
        return {x:board.left+20,y:board.top+20,right:Math.min(board.right-3,Math.max(...boxes.map(b=>b.right))+10),bottom:Math.min(board.bottom-3,Math.max(...boxes.map(b=>b.bottom))+10)};
      });
      await page.keyboard.down('Alt');await page.mouse.move(bounds.x,bounds.y);await page.mouse.down();await page.mouse.move(bounds.right,bounds.bottom,{steps:8});await page.mouse.up();await page.keyboard.up('Alt');
    }
    await expect(page.locator('#docview g.node.dv-sel')).toHaveCount(ids.length);
    for(const id of ids)await expect(node(page,id)).toHaveClass(/dv-sel/);
  }
  async function move(ids,initiator,holdShift=false){
    await select(ids);const before=await source(page),beforeCenters=await centers(),box=await node(page,initiator).locator('.card').boundingBox();
    const scale=await node(page,initiator).evaluate(n=>n.ownerSVGElement.getScreenCTM().a),x=box.x+box.width/2,y=box.y+box.height/2;
    if(holdShift)await page.keyboard.down('Shift');
    await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+65*scale,y+45*scale,{steps:8});
    await expect(page.locator('#docview .dv-ghost')).toHaveCount(ids.length);await expect(page.locator('#src')).toHaveValue(before);
    await page.mouse.up();if(holdShift)await page.keyboard.up('Shift');
    const after=await source(page),afterCenters=await centers(),delta={x:afterCenters[ids[0]].x-beforeCenters[ids[0]].x,y:afterCenters[ids[0]].y-beforeCenters[ids[0]].y};
    expect(after).not.toBe(before);for(const id of ids){expect(afterCenters[id].x-beforeCenters[id].x).toBeCloseTo(delta.x,1);expect(afterCenters[id].y-beforeCenters[id].y).toBeCloseTo(delta.y,1);}
    for(const id of all.filter(id=>!ids.includes(id))){expect(afterCenters[id].x).toBeCloseTo(beforeCenters[id].x,1);expect(afterCenters[id].y).toBeCloseTo(beforeCenters[id].y,1);}
    const authored=diagram(JSON.parse(after));expect(Object.keys(authored.nodes)).toEqual(['local','other']);expect(JSON.stringify(provider)).toBe(providerSource);
    await expect(page.locator('#docview g.node.dv-sel')).toHaveCount(ids.length);
    await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(before);await expect(page.locator('#undo-builder')).toBeDisabled();
    await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(after);await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(before);
  }
  await move(['shared::api','shared::store'],'shared::api',selection==='Shift');
  await move(['local','shared::api'],'local',selection==='Shift');
  await move(['local','shared::api'],'shared::api',selection==='Shift');
});


test('imported node drags retire when rendering, replacing provider context or destroying the editor',async({page,server})=>{
  const {provider,consumer}=await fixture(page,server,'lifetime','ambient',(_provider,value)=>{const d=diagram(value);d.rows=[[]];d.floats=[{id:'local',x:800,y:500},{id:'other',x:1050,y:500}];});const before=await source(page);
  async function hold(){
    await closeTools(page);const box=await node(page,'shared::store').locator('.card').boundingBox();
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
    await page.mouse.move(box.x+box.width/2+70,box.y+box.height/2+50,{steps:8});
    await expect(page.locator('#docview .dv-ghost')).toHaveCount(1);
  }
  await hold();await page.evaluate(()=>document.querySelector('#go').click());await page.mouse.up();
  await expect(page.locator('#src')).toHaveValue(before);await expect(page.locator('#docview .dv-ghost,.dv-free-edge-preview')).toHaveCount(0);
  await closeTools(page);await node(page,'local').click();await node(page,'shared::api').click({modifiers:['Shift']});
  const localBox=await node(page,'local').locator('.card').boundingBox();await page.mouse.move(localBox.x+localBox.width/2,localBox.y+localBox.height/2);await page.mouse.down();await page.mouse.move(localBox.x+localBox.width/2+70,localBox.y+localBox.height/2+50,{steps:8});
  await expect(page.locator('#docview .dv-ghost')).toHaveCount(2);diagram(provider).nodes.api.title='Updated provider';
  await page.evaluate(({text,context})=>__editorTest.builder.loadText(text,context),{text:before,context:{version:1,id:'consumer',specs:[provider,consumer]}});
  await page.mouse.up();await expect(page.locator('#src')).toHaveValue(before);await expect(node(page,'shared::api')).toContainText('Updated provider');
  await expect(page.locator('#docview .dv-ghost,.dv-free-edge-preview')).toHaveCount(0);
  await hold();await page.evaluate(()=>__editorTest.builder.destroy());await page.mouse.up();
  await expect(page.locator('#src')).toHaveValue(before);await expect(page.locator('#docview .dv-ghost,.dv-free-edge-preview')).toHaveCount(0);
});

const codeRef=id=>({id,repository:'https://github.com/example/service',path:'src/'+id+'.js',revision:'a'.repeat(40),anchor:{start:'start',end:'end'}});
const importedEdge=page=>page.locator('#docview path.edge[data-dv-edge="1"]');
async function dragElement(page,locator,dx,dy,release=true){
  const b=await locator.boundingBox();expect(b).not.toBeNull();
  await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();
  await page.mouse.move(b.x+b.width/2+dx,b.y+b.height/2+dy,{steps:10});if(release)await page.mouse.up();
}
async function dragImportedCurve(page,release=true){
  const p=await importedEdge(page).evaluate(el=>{const p=el.getPointAtLength(el.getTotalLength()*.3),m=el.getScreenCTM(),q=new DOMPoint(p.x,p.y).matrixTransform(m);return {x:q.x,y:q.y};});
  await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+15,p.y-65,{steps:10});if(release)await page.mouse.up();
}
const overlay=async page=>diagram(JSON.parse(await source(page))).topologyImports[0];

test('imported node evidence appends locally, retains invalid draft, removes additions and survives save/reopen',async({page,server},info)=>{
  const {provider}=await fixture(page,server,'file','ambient',provider=>{diagram(provider).nodes.api.codeRefs=[codeRef('inherited')];});
  const providerBefore=JSON.stringify(provider);
  await node(page,'shared::api').click();await page.locator('#editor-tab-inspect').click();
  const inherited=page.getByRole('textbox',{name:'Inherited code references (read only)',exact:true});
  await expect(inherited).toHaveAttribute('readonly','');expect(JSON.parse(await inherited.inputValue())).toEqual([codeRef('inherited')]);
  const refs=page.getByRole('textbox',{name:'Additional code references JSON',exact:true}),before=await source(page);
  await refs.fill('[{"id":"bad"}]');await refs.press('Tab');
  await expect(page.locator('#src')).toHaveValue(before);await expect(refs).toHaveValue('[{"id":"bad"}]');await expect(page.locator('#guide .ierr')).toContainText('repository');
  await refs.fill(JSON.stringify([codeRef('local')]));await refs.press('Tab');
  await expect.poll(async()=> (await overlay(page)).nodeCodeRefs?.api).toEqual([codeRef('local')]);
  await roundtrip(page,before);
  await node(page,'shared::api').click();await page.locator('#editor-tab-inspect').click();
  await expect(inherited).toHaveValue(JSON.stringify([codeRef('inherited')],null,2));
  await page.screenshot({path:info.outputPath('imported-node-code-references.png')});
  const added=await source(page);await refs.fill('[]');await refs.press('Tab');await expect.poll(async()=> (await overlay(page)).nodeCodeRefs).toBeUndefined();
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(added);
  const download=page.waitForEvent('download');await page.locator('#workspace-export-trigger').click();await page.locator('#file-save').click();const bytes=await projectSource(await download);
  expect(diagram(JSON.parse(bytes)).topologyImports[0].nodeCodeRefs.api).toEqual([codeRef('local')]);expect(bytes).not.toContain('topologyProvenance');
  await page.locator('#file-input').setInputFiles({name:'overlay.spec.json',mimeType:'application/json',buffer:Buffer.from(bytes)});await expect(node(page,'shared::api')).toBeVisible();
  await page.reload();await expect(page.locator('#src')).toHaveValue(bytes);await node(page,'shared::api').click();await page.locator('#editor-tab-inspect').click();
  expect(JSON.parse(await refs.inputValue())).toEqual([codeRef('local')]);expect(JSON.parse(await inherited.inputValue())).toEqual([codeRef('inherited')]);expect(JSON.stringify(provider)).toBe(providerBefore);
});

test('imported label, curve and attachment drags save overlays with exact history and provider reset',async({page,server},info)=>{
  await fixture(page,server,'file','ambient',provider=>{diagram(provider).edges[0].labelDx=9;diagram(provider).edges[0].fromPort={side:'right',offset:.3};});
  const initial=await source(page),providerRoute=await importedEdge(page).getAttribute('d');
  await dragElement(page,page.locator('#docview text.lbl[data-dv-edge="1"]'),35,-25);
  await expect.poll(async()=> (await overlay(page)).edgeOverrides?.['api->store']?.labelDx).not.toBeUndefined();await roundtrip(page,initial);
  let before=await source(page);await dragImportedCurve(page);await expect.poll(async()=> (await overlay(page)).edgeOverrides?.['api->store']?.curvePoints?.length).toBe(1);await roundtrip(page,before);
  await importedEdge(page).dispatchEvent('click');await expect(page.locator('[data-edge-port="fromPort"]')).toBeVisible();
  before=await source(page);await dragElement(page,page.locator('[data-edge-port="fromPort"]'),-35,-35);
  await expect.poll(async()=> (await overlay(page)).edgeOverrides?.['api->store']?.fromPort).not.toBeUndefined();await roundtrip(page,before);
  const authored=diagram(JSON.parse(await source(page)));expect(authored.edges).toEqual([{from:'local',to:'shared::api',label:'Request'}]);expect(Object.keys(authored.nodes)).toEqual(['local','other']);expect(authored.topologyProvenance).toBeUndefined();
  await importedEdge(page).dispatchEvent('click');await page.locator('#editor-tab-inspect').click();await expect(page.getByRole('button',{name:'Reset imported connection layout',exact:true})).toBeVisible();
  await page.screenshot({path:info.outputPath('imported-edge-layout-controls.png')});
  const savedOverlay=await source(page),savedRoute=await importedEdge(page).getAttribute('d');
  const download=page.waitForEvent('download');await page.locator('#workspace-export-trigger').click();await page.locator('#file-save').click();const bytes=await projectSource(await download);
  expect(diagram(JSON.parse(bytes))).toEqual(diagram(JSON.parse(savedOverlay)));await page.locator('#file-input').setInputFiles({name:'edge-layout.spec.json',mimeType:'application/json',buffer:Buffer.from(bytes)});
  await page.reload();await expect(page.locator('#src')).toHaveValue(bytes);await expect(importedEdge(page)).toHaveAttribute('d',savedRoute);
  await importedEdge(page).dispatchEvent('click');await page.locator('#editor-tab-inspect').click();
  before=await source(page);await page.getByRole('button',{name:'Reset imported connection layout',exact:true}).click();await expect.poll(async()=> (await overlay(page)).edgeOverrides).toBeUndefined();await expect(importedEdge(page)).toHaveAttribute('d',providerRoute);await roundtrip(page,before);
  expect(diagram(JSON.parse(await source(page)))).toEqual(diagram(JSON.parse(initial)));
});

test('imported label, curve and attachment gestures cancel on Escape and source edits',async({page,server})=>{
  await fixture(page,server);
  for(const kind of ['label','curve','port']){
    await closeTools(page);await importedEdge(page).dispatchEvent('click');const before=await source(page);
    const begin=()=>kind==='label'?dragElement(page,page.locator('#docview text.lbl[data-dv-edge="1"]'),30,-30,false):kind==='curve'?dragImportedCurve(page,false):dragElement(page,page.locator('[data-edge-port="fromPort"]'),-35,-35,false);
    await begin();await page.keyboard.press('Escape');await page.mouse.up();await expect(page.locator('#src')).toHaveValue(before);await expect(page.locator('.dv-free-edge-preview')).toHaveCount(0);
    await importedEdge(page).dispatchEvent('click');await begin();await page.locator('#src').evaluate(el=>{el.value+='\n';el.dispatchEvent(new Event('input',{bubbles:true}));});await page.mouse.up();await expect(page.locator('#src')).toHaveValue(before+'\n');
    await page.locator('#go').evaluate(el=>el.click());
  }
});


test('imported edge gestures retire on render, provider replacement and project replacement',async({page,server})=>{
  const {provider,consumer}=await fixture(page,server,'lifetime');const before=await source(page);
  for(const kind of ['label','curve','port'])for(const change of ['render','provider']){
    await closeTools(page);await importedEdge(page).dispatchEvent('click');
    if(kind==='label')await dragElement(page,page.locator('#docview text.lbl[data-dv-edge="1"]'),30,-30,false);
    else if(kind==='curve')await dragImportedCurve(page,false);
    else await dragElement(page,page.locator('[data-edge-port="fromPort"]'),-35,-35,false);
    if(change==='render')await page.evaluate(()=>document.querySelector('#go').click());
    else{
      diagram(provider).nodes.api.title+=' refreshed';
      await page.evaluate(({text,context})=>__editorTest.builder.loadText(text,context),{text:before,context:{version:1,id:'consumer',specs:[provider,consumer]}});
    }
    await page.mouse.up();await expect(page.locator('#src')).toHaveValue(before);await expect(page.locator('.dv-free-edge-preview')).toHaveCount(0);
  }
  await closeTools(page);await dragImportedCurve(page,false);
  const replacement=JSON.stringify({nodes:{new:{title:'New project'}},rows:[['new']]});await page.evaluate(text=>__editorTest.builder.loadText(text),replacement);
  await page.mouse.up();await expect(page.locator('#src')).toHaveValue(replacement);await expect(page.locator('.dv-free-edge-preview')).toHaveCount(0);
});


test('local connection curve reset still works beside imported topology',async({page,server})=>{
  await fixture(page,server,'file','ambient',(_provider,consumer)=>{diagram(consumer).edges[0].curvePoints=[{t:.5,dx:30,dy:-40}];});
  const before=await source(page);await page.locator('#docview path.edge[data-dv-edge="0"]').dispatchEvent('click');await page.locator('#editor-tab-inspect').click();
  await page.getByRole('button',{name:'Reset curve',exact:true}).click();
  await expect.poll(async()=>diagram(JSON.parse(await source(page))).edges[0].curvePoints).toBeUndefined();await roundtrip(page,before);
  expect((await overlay(page)).edgeOverrides).toBeUndefined();
});


test('imported presentation controls preserve provider identity through history, save and hidden restoration',async({page,server},info)=>{
  const {provider}=await fixture(page,server,'file','ambient',provider=>{diagram(provider).nodes.api.binding={entityRef:'component:default/api'};});
  const originalProvider=JSON.stringify(provider);
  async function inspectImported(){await closeTools(page);await node(page,'shared::api').click();await page.locator('#editor-tab-inspect').click();}
  await inspectImported();
  for(const [name,value,field] of [['Display name','Checkout API','title'],['Display subtitle','This flow only','sub']]){
    await inspectImported();const before=await source(page),control=page.getByRole('textbox',{name,exact:true});await control.fill(value);await control.press('Enter');
    await expect.poll(async()=> (await overlay(page)).nodeOverrides?.api?.[field]).toBe(value);await roundtrip(page,before);
  }
  await inspectImported();const beforeTint=await source(page);await page.getByRole('combobox',{name:'Icon color',exact:true}).selectOption('data');
  await expect.poll(async()=> (await overlay(page)).nodeOverrides?.api?.tint).toBe('data');await roundtrip(page,beforeTint);
  await expect(node(page,'shared::api')).toContainText('Checkout API');await expect(node(page,'shared::api')).toHaveClass(/tint-data/);
  await inspectImported();const beforeStyle=await source(page);await page.locator('#guide .node-style-browse').click();await page.locator('.node-style-tile[data-style-id="moss"]').click();
  await expect.poll(async()=> (await overlay(page)).nodeOverrides?.api?.style).toBe('moss');await roundtrip(page,beforeStyle);await expect(node(page,'shared::api')).toHaveClass(/ns-moss/);
  await inspectImported();const beforeHidden=await source(page);await page.getByRole('checkbox',{name:'Hidden from readers',exact:true}).check();
  await expect.poll(async()=> (await overlay(page)).nodeOverrides?.api?.hidden).toBe(true);await roundtrip(page,beforeHidden);
  await expect(node(page,'shared::api')).toBeVisible();await expect(node(page,'shared::api')).toHaveCSS('opacity','0.3');
  await expect(importedEdge(page)).toBeHidden();await expect(page.locator('#docview text.lbl[data-dv-edge="1"]')).toBeHidden();
  await page.screenshot({path:info.outputPath('imported-node-presentation.png')});
  const svgDownload=page.waitForEvent('download');await page.locator('#workspace-export-trigger').click();await page.locator('#file-export-svg').click();
  const svg=await readFile(await (await svgDownload).path(),'utf8');expect(svg).not.toContain('Checkout API');expect(svg).toContain('Store');
  const download=page.waitForEvent('download');await page.locator('#workspace-export-trigger').click();await page.locator('#file-save').click();
  const files=await projectFiles(await download),bytes=Object.entries(files).find(([name])=>name.endsWith('.spec.json'))[1];
  const html=Object.entries(files).find(([name])=>name.endsWith('.html'))[1];
  expect(diagram(JSON.parse(bytes)).nodes['shared::api']).toBeUndefined();expect(bytes).not.toContain('topologyProvenance');
  const reader=await page.context().newPage();await reader.route('**/hidden-reader.html',route=>route.fulfill({contentType:'text/html',body:html}));await reader.goto(server.origin+'/hidden-reader.html#tour=0');
  await expect(reader.locator('g.node[data-dv-node="shared::api"]')).toBeHidden();await expect(reader.locator('path.edge')).toHaveCount(2);
  await expect(reader.locator('path.edge').first()).toBeHidden();await expect(reader.locator('path.edge').last()).toBeHidden();await reader.close();
  await page.locator('#file-input').setInputFiles({name:'presentation.spec.json',mimeType:'application/json',buffer:Buffer.from(bytes)});await closeTools(page);
  await node(page,'shared::api').click();await page.locator('#editor-tab-inspect').click();await page.getByRole('checkbox',{name:'Hidden from readers',exact:true}).uncheck();
  await expect(importedEdge(page)).toBeVisible();await expect(node(page,'shared::api')).not.toHaveAttribute('data-dv-hidden','true');
  await page.getByRole('button',{name:'Reset node presentation',exact:true}).click();await expect(node(page,'shared::api')).toContainText('API');await expect.poll(async()=> (await overlay(page)).nodeOverrides).toBeUndefined();
  expect(JSON.stringify(provider)).toBe(originalProvider);
});

test('imported display label control saves only its overlay and resets without changing layout',async({page,server},info)=>{
  await fixture(page,server,'file','ambient',(_,consumer)=>{diagram(consumer).topologyImports[0].edgeOverrides={'api->store':{labelDx:25}};});
  const before=await source(page);await importedEdge(page).dispatchEvent('click');await page.locator('#editor-tab-inspect').click();
  const label=page.getByRole('textbox',{name:'Display label',exact:true});await label.fill('Commit checkout');await label.press('Enter');
  await expect.poll(async()=> (await overlay(page)).edgeOverrides?.['api->store']).toEqual({labelDx:25,label:'Commit checkout'});await roundtrip(page,before);
  await expect(page.locator('#docview text.lbl[data-dv-edge="1"]')).toContainText('Commit checkout');
  await page.screenshot({path:info.outputPath('imported-display-label.png')});
  await closeTools(page);await importedEdge(page).dispatchEvent('click');await page.locator('#editor-tab-inspect').click();
  const resetBefore=await source(page);await page.getByRole('button',{name:'Reset imported display label',exact:true}).click();
  await expect.poll(async()=> (await overlay(page)).edgeOverrides?.['api->store']).toEqual({labelDx:25});await roundtrip(page,resetBefore);
  await expect(page.locator('#docview text.lbl[data-dv-edge="1"]')).toContainText('Persist');
});
