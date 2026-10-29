import {test,expect,prepareEditorSurface,closeTools} from '../helpers/test.mjs';
import {digest} from '../../canon/drift.mjs';
const source=page=>page.locator('#src').inputValue(),d=raw=>raw.page.sections[0].diagram;
const node=(page,id)=>page.locator('#docview g.node[data-dv-node="'+id+'"]');
function fixtures(presentation){
 const spec=(id,diagram)=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},sections:[{heading:'Arrangement',diagram}]}});
 const provider=spec('provider',{nodes:{a:{title:'API'},b:{title:'Store'},c:{title:'Cache'}},rows:[[]],floats:[{id:'a',x:100,y:100},{id:'b',x:350,y:350},{id:'c',x:900,y:900}],edges:[],topologyExports:{core:{nodes:['a','b','c'],edges:[]}}});
 const consumer=spec('consumer',{nodes:{local:{title:'Local'}},rows:[[]],floats:[{id:'local',x:100,y:100}],topologyImports:[{spec:'provider',export:'core',as:'shared'}],layouts:[{id:'view',name:'View',presentation,sectionLayout:{default:[{x:0,y:0,w:12,h:12}]},...(presentation==='explore'?{exploreLayout:{}}:{})}],autoplay:false});return {provider,consumer};
}
async function open(page,server,presentation,routing=false){
 const f=fixtures(presentation);if(routing){d(f.provider).edges=[{from:'a',to:'b',bend:60,fromPort:{side:'right'},label:'Provider route',labelDx:7},{from:'b',to:'c',curvePoints:[{t:.5,dx:0,dy:40}]}];d(f.provider).topologyExports.core.edges=['a->b','b->c'];d(f.consumer).edges=[{from:'local',to:'shared::a',toPort:{side:'left'},label:'Local route',labelDy:9}];d(f.consumer).topologyImports[0].edgeOverrides={'a->b':{label:'Consumer route',labelDx:12}};}const catalog={version:3,diagrams:Object.values(f).map(spec=>({id:spec.page.canon.id,title:spec.page.title,canon:spec.page.canon,counts:{nodes:3,steps:0,panels:0},revision:digest(spec),specUrl:spec.page.canon.id+'.json'}))};
 await page.route('**/diagrams.json',route=>route.fulfill({json:catalog}));for(const spec of Object.values(f))await page.route('**/'+spec.page.canon.id+'.json',route=>route.fulfill({json:spec}));
 await page.goto(server.origin+'/workbench.html?diagram=consumer');await expect(page.locator('#canon-reader-edit')).toBeEnabled();await page.locator('#canon-reader-edit').click();await prepareEditorSurface(page);await closeTools(page);await page.evaluate(()=>document.fonts.ready);await expect(node(page,'shared::a')).toBeVisible();return f;
}
async function positions(page){return page.locator('#docview g.node[data-dv-node]').evaluateAll(nodes=>Object.fromEntries(nodes.map(el=>{const m=el.transform.baseVal.consolidate().matrix,card=el.querySelector('.card');return [el.dataset.dvNode,{x:m.e+Number(card.getAttribute('width'))/2,y:m.f+Number(card.getAttribute('height'))/2,w:Number(card.getAttribute('width')),h:Number(card.getAttribute('height'))}];})));}
async function select(page,ids){await node(page,ids[0]).focus();await page.keyboard.press('Enter');for(const id of ids.slice(1)){await node(page,id).focus();await page.keyboard.press('Shift+Enter');}await expect(page.locator('#docview .dv-sel[data-dv-node]')).toHaveCount(ids.length);}
function moved(before,after,ids,dx,dy){for(const id of Object.keys(before)){expect(after[id].x-before[id].x,id+' x').toBeCloseTo(ids.includes(id)?dx:0,1);expect(after[id].y-before[id].y,id+' y').toBeCloseTo(ids.includes(id)?dy:0,1);}}
async function history(page,before,after,beforePositions,afterPositions){await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(before);expect(await positions(page)).toEqual(beforePositions);await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(after);expect(await positions(page)).toEqual(afterPositions);}
for(const presentation of ['standard','explore'])test(presentation+' imported and mixed highlighted selections nudge, retain focus, cancel and undo exactly',async({page,server})=>{
 const f=await open(page,server,presentation),frozen=await page.evaluate(()=>JSON.parse(localStorage.getItem('dv-workbench-draft')).topologyContext);
 for(const ids of [['shared::a'],['shared::a','shared::b'],['shared::a','local'],['local','shared::a']]){
  await select(page,ids);const focused=ids.at(-1),before=await source(page),beforePositions=await positions(page);
  await page.keyboard.down('ArrowRight');await page.keyboard.down('ArrowRight');await page.keyboard.down('ArrowRight');expect(await source(page)).toBe(before);await page.keyboard.up('ArrowRight');
  await expect(node(page,focused)).toBeFocused();await expect(page.locator('#docview .dv-sel[data-dv-node]')).toHaveCount(ids.length);const after=await source(page),afterPositions=await positions(page);moved(beforePositions,afterPositions,ids,30,0);expect(d(JSON.parse(after)).nodes).toEqual(d(f.consumer).nodes);expect(d(JSON.parse(after)).topologyProvenance).toBeUndefined();await history(page,before,after,beforePositions,afterPositions);
  await select(page,ids);const shiftBefore=await source(page),shiftPositions=await positions(page);await page.keyboard.press('Shift+ArrowDown');const shiftAfter=await source(page),shiftMoved=await positions(page);moved(shiftPositions,shiftMoved,ids,0,50);await history(page,shiftBefore,shiftAfter,shiftPositions,shiftMoved);
  await select(page,ids);const unchanged=await source(page),cancelPositions=await positions(page);await page.keyboard.down('ArrowLeft');await page.keyboard.press('Escape');await page.keyboard.up('ArrowLeft');expect(await source(page)).toBe(unchanged);expect(await positions(page)).toEqual(cancelPositions);await expect(page.locator('#docview .dv-sel[data-dv-node]')).toHaveCount(ids.length);
 }
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('dv-workbench-draft')).topologyContext)).toEqual(frozen);
});
for(const presentation of ['standard','explore'])for(const mixed of [false,true])test(presentation+' '+(mixed?'mixed':'imported-only')+' distribution is available and equalizes gaps with exact history',async({page,server})=>{
 const f=await open(page,server,presentation),ids=mixed?['shared::a','local','shared::c']:['shared::a','shared::b','shared::c'];
 for(const direction of ['horizontal','vertical']){
  await select(page,ids);const before=await source(page),beforePositions=await positions(page),axis=direction==='horizontal'?'x':'y',size=axis==='x'?'w':'h',label='Distribute '+(direction==='horizontal'?'horizontally':'vertically');
  if(presentation==='explore' && direction==='vertical'){
   await page.locator('#editor-tab-inspect').click();const button=page.locator('#guide').getByRole('button',{name:label,exact:true});await expect(button).toBeEnabled();await button.click();
  }else{
   await page.keyboard.press('Shift+F10');const item=page.getByRole('menu',{name:'Object actions'}).getByRole('menuitem',{name:label,exact:true});await expect(item).not.toHaveAttribute('aria-disabled','true');await item.click();
  }
  const after=await source(page),afterPositions=await positions(page),ordered=ids.toSorted((a,b)=>beforePositions[a][axis]-beforePositions[b][axis]),gap=(a,b)=>afterPositions[b][axis]-afterPositions[b][size]/2-afterPositions[a][axis]-afterPositions[a][size]/2;
  expect(after).not.toBe(before);expect(gap(ordered[0],ordered[1])).toBeCloseTo(gap(ordered[1],ordered[2]),1);for(const id of [ordered[0],ordered[2],...Object.keys(beforePositions).filter(id=>!ids.includes(id))])expect(afterPositions[id]).toEqual(beforePositions[id]);expect(d(JSON.parse(after)).nodes).toEqual(d(f.consumer).nodes);expect(d(JSON.parse(after)).topologyProvenance).toBeUndefined();await expect(page.locator('#docview .dv-sel[data-dv-node]')).toHaveCount(ids.length);await history(page,before,after,beforePositions,afterPositions);
  await closeTools(page);
 }
});

for(const presentation of ['standard','explore'])test(presentation+' pointer selection highlights and nudges both imported/local selection orders',async({page,server})=>{
 await open(page,server,presentation);
 for(const ids of [['shared::a','local'],['local','shared::a']]){
  await node(page,ids[0]).click();await node(page,ids[1]).click({modifiers:['Shift']});await expect(node(page,ids[1])).toBeFocused();await expect(page.locator('#docview .dv-sel[data-dv-node]')).toHaveCount(2);const before=await positions(page);await page.keyboard.press('ArrowRight');moved(before,await positions(page),ids,10,0);await expect(node(page,ids[1])).toBeFocused();await expect(page.locator('#docview .dv-sel[data-dv-node]')).toHaveCount(2);
 }
});
for(const presentation of ['standard','explore'])test(presentation+' imported edge reference menu, mixed node menu and node Inspector clear consumer routing with exact history',async({page,server})=>{
 const f=await open(page,server,presentation,true),original=await source(page),frozen=await page.evaluate(()=>JSON.parse(localStorage.getItem('dv-workbench-draft')).topologyContext);
 // A direct imported edge uses the reference menu, which previously hard-disabled Clear.
 await page.locator('#docview text.lbl[data-dv-edge="1"]').click({button:'right'});const reference=page.getByRole('menu',{name:'Reference actions for shared'}),clear=reference.getByRole('menuitem',{name:'Clear Custom Edges',exact:true});await expect(clear).not.toHaveAttribute('aria-disabled','true');await clear.click();const single=await source(page),singleImport=d(JSON.parse(single)).topologyImports[0];expect(singleImport.edgeOverrides['a->b'].bend).toBeNull();expect(singleImport.edgeOverrides['a->b'].fromPort).toBeNull();expect(singleImport.edgeOverrides['a->b'].label).toBe('Consumer route');expect(singleImport.edgeOverrides['a->b'].labelDx).toBe(12);expect(d(JSON.parse(single)).edges).toEqual(d(f.consumer).edges);expect(singleImport.edgeOverrides['b->c']).toBeUndefined();
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(single);await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);
 // Imported node incident scope combined with a local node clears both origins.
 await select(page,['shared::a','local']);await page.keyboard.press('Shift+F10');await page.getByRole('menu',{name:'Object actions'}).getByRole('menuitem',{name:'Clear Custom Edges',exact:true}).click();const mixed=await source(page);expect(d(JSON.parse(mixed)).edges[0].toPort).toBeUndefined();expect(d(JSON.parse(mixed)).edges[0].labelDy).toBe(9);expect(d(JSON.parse(mixed)).topologyImports[0].edgeOverrides['a->b'].bend).toBeNull();await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(mixed);await page.locator('#undo-builder').click();
 // Inspect a single imported node: the same command clears its incident route.
 await node(page,'shared::a').click();await page.locator('#editor-tab-inspect').click();const inspector=page.locator('#guide > .inspector-actions').getByRole('button',{name:'Clear Custom Edges',exact:true});await expect(inspector).toBeEnabled();await inspector.click();expect(d(JSON.parse(await source(page))).topologyImports[0].edgeOverrides['a->b'].bend).toBeNull();await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('dv-workbench-draft')).topologyContext)).toEqual(frozen);
});
