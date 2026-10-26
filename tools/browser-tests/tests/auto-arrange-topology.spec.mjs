import {test,expect,prepareEditorSurface,openAutoArrange} from '../helpers/test.mjs';
import {digest} from '../../canon/drift.mjs';

const source=page=>page.locator('#src').inputValue();
const active=raw=>raw.page.blocks[0].tabs[0].sections[0].diagram;
function fixtures(mixed){
 const model=(id,sections)=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},sections}});
 const provider=model('provider',[{id:'main',diagram:{nodes:{api:{title:'API'},store:{title:'Store'}},rows:[['api','store']],edges:[{from:'api',to:'store',label:'Persist',bend:50,fromDx:8,toDy:9,labelDx:30}],topologyExports:{core:{nodes:['api','store'],edges:['api->store']}}}}]);
 const consumer=model('consumer',[]);delete consumer.page.sections;
 consumer.page.blocks=[{tabs:[{label:'Imported',sections:[{heading:'Imported story',diagram:{nodes:mixed?{local:{title:'Local'}}:{},rows:mixed?[['local']]:[[]],edges:mixed?[{from:'local',to:'shared::api',label:'Request'}]:[],topologyImports:[{spec:'provider',export:'core',as:'shared'}],autoplay:false}}]},{label:'Untouched',sections:[{heading:'Other diagram',diagram:{nodes:{other:{title:'Other'}},rows:[['other']],autoplay:false}}]}]}];
 return {provider,consumer};
}
for(const mixed of [false,true])test('Canon '+(mixed?'mixed':'import-only')+' diagram uses the production worker and keeps import ownership across tabs and exact Undo/Redo',async({page,server})=>{
 const {provider,consumer}=fixtures(mixed),errors=[];page.on('pageerror',error=>errors.push(error.message));
 const catalog={version:3,diagrams:[provider,consumer].map(spec=>({id:spec.page.canon.id,title:spec.page.title,canon:spec.page.canon,counts:{nodes:2,steps:0,panels:0},revision:digest(spec),specUrl:spec.page.canon.id+'.json'}))};
 await page.route('**/diagrams.json',route=>route.fulfill({json:catalog}));
 for(const spec of [provider,consumer])await page.route('**/'+spec.page.canon.id+'.json',route=>route.fulfill({json:spec}));
 await page.goto(server.origin+'/workbench.html?diagram=consumer');await expect(page.locator('#canon-reader-edit')).toBeEnabled();await page.locator('#canon-reader-edit').click();await prepareEditorSurface(page);
 await expect(page.locator('#docview g.node[data-dv-node="shared::api"]')).toBeVisible();
 const before=await source(page),frozen=await page.evaluate(()=>JSON.parse(localStorage.getItem('dv-workbench-draft')).topologyContext);
 // Capture the production worker's input/output without replacing its algorithm.
 await page.evaluate(()=>{const Real=window.Worker;window.Worker=class extends Real{postMessage(data){window.__arrangeInput=data;this.addEventListener('message',e=>window.__arrangeResult=e.data,{once:true});super.postMessage(data);}};});
 provider.page.sections[0].diagram.nodes.api.title='New remote deployment';
 await openAutoArrange(page);await page.locator('[data-arrange-confirm]').click();await expect(page.locator('#auto-arrange-dialog')).not.toBeVisible({timeout:25000});
 const after=await source(page),changed=JSON.parse(after),diagram=active(changed),worker=await page.evaluate(()=>({input:window.__arrangeInput,result:window.__arrangeResult}));
 expect(worker.result.error).toBeUndefined();expect(Object.keys(worker.input.nodes)).toHaveLength(mixed?3:2);expect(worker.input.nodes['shared::api'].title).toBe('API');expect(worker.input.edges).toHaveLength(mixed?2:1);
 expect(diagram.nodes).toEqual(active(consumer).nodes);expect(diagram.edges).toHaveLength(mixed?1:0);expect(diagram.floats.map(f=>f.id)).toEqual(mixed?['local']:[]);expect(diagram.topologyProvenance).toBeUndefined();
 expect(changed.page.blocks[0].tabs[1]).toEqual(consumer.page.blocks[0].tabs[1]);
 const imp=diagram.topologyImports[0];expect(Object.keys(imp.nodePositions).sort()).toEqual(['api','store']);
 for(const key of ['bend','curvePoints','fromDx','fromDy','toDx','toDy'])expect(imp.edgeOverrides['api->store'][key]).toBeNull();
 const rendered=await page.locator('#docview g.node').evaluateAll(nodes=>Object.fromEntries(nodes.map(node=>{const m=node.transform.baseVal.consolidate().matrix,card=node.querySelector('.card');return [node.dataset.dvNode,{x:m.e+Number(card.getAttribute('width'))/2,y:m.f+Number(card.getAttribute('height'))/2}];})));
 for(const p of worker.result.result.positions)expect(rendered[p.id]).toEqual({x:p.x,y:p.y});
 for(const p of worker.result.result.positions.filter(p=>p.id.startsWith('shared::')))expect(imp.nodePositions[p.id.slice(8)]).toEqual({x:p.x-imp.position.x,y:p.y-imp.position.y});
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('dv-workbench-draft')).topologyContext)).toEqual(frozen);
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(before);await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(after);
 await page.reload();await expect(page.locator('#src')).toHaveValue(after);await expect(page.locator('#docview g.node[data-dv-node="shared::api"]')).toContainText('API');
 expect(errors).toEqual([]);
});
