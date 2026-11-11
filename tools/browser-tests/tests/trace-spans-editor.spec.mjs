/* #1290 PR 6 desktop Workbench: Inspect → Tracking → Trace spans on a node or connection,
   local and imported. Node coverage: tests/carrier-trace-spans-form.test.js.
| row | rule |
|---|---|
| T1 | A local node: Add span writes node.trace; a field edit and Remove span are one Undo step each. |
| T2 | An imported node: the span names its provider; a field edit stores only that field in nodeTracking; hide and Revert all are one Undo step each; the provider is untouched. |
| T3 | An imported connection: a field edit stores only that field in edgeTracking. |
Selection goes through inspectPageElement (close the floating tool windows, click, open Inspect), as the other imported-carrier specs do.
*/
import {test,expect,paste,prepareEditorSurface,inspectPageElement} from '../helpers/test.mjs';
const spec=(id,diagram)=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},sections:[{id:'main',diagram}]}});
const provider=spec('provider',{nodes:{a:{title:'Provider A'},b:{title:'Provider B',trace:{spans:{process:{serviceName:'b-svc',operation:'handle',role:'process'},find:{serviceName:'b-svc',operationPrefix:'find ',role:'database'}}}}},
  rows:[['a','b']],edges:[{from:'a',to:'b',label:'Provider delivery',trace:{spans:{send:{serviceName:'a-svc',operation:'publish',role:'send'}}}}],topologyExports:{core:{nodes:['a','b'],edges:['a->b']}}});
const consumer=spec('consumer',{nodes:{x:{title:'Local X'}},rows:[['x']],edges:[],topologyImports:[{spec:'provider',export:'core',as:'direct',position:{x:50,y:250}}]});

async function load(page,server){
  await page.setViewportSize({width:1680,height:1100});
  await page.goto(server.origin+'/lifetime/index.html');
  await paste(page,JSON.stringify({page:{title:'x',sections:[{diagram:{nodes:{x:{title:'X'}},rows:[['x']]}}]}}));await prepareEditorSurface(page);
  await page.evaluate(({provider,consumer})=>{window.spanContext={version:1,id:'consumer',specs:[provider,consumer]};window.__editorTest.builder.loadText(JSON.stringify(consumer),window.spanContext);},{provider,consumer});
}
// Select a node or connection through Inspect, and open its Trace spans fold.
async function spans(page,select){
  await select();
  const fold=page.locator('#guide details.trace-spans-editor');await expect(fold,'Inspect → Tracking has a Trace spans editor').toHaveCount(1);
  if(!await fold.evaluate(el=>el.open))await fold.locator(':scope > summary').click();
  return fold;
}
const diagram=async page=>JSON.parse(await page.locator('#src').inputValue()).page.sections[0].diagram;
// The floating Inspect window can cover the canvas (it covered Provider B in CI), so tool windows
// are closed first (inspectPageElement), and the element's centre is checked to be uncovered
// before the click.
async function clickUncovered(page,target,name){
  await inspectPageElement(page,{click:async()=>{
    await target.scrollIntoViewIfNeeded();
    await expect.poll(()=>target.evaluate(el=>{const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return !!hit && el.contains(hit);}),name+' is not covered at its centre').toBe(true);
    await target.click();
  }});
}
const node=(page,id)=>()=>clickUncovered(page,page.locator('#docview g.node[data-dv-node="'+id+'"]').first(),'node '+id);

test('T1 T2 T3 desktop: trace spans on a local node, an imported node and an imported connection, one Undo each',async({page,server})=>{
  await load(page,server);const source=page.locator('#src');
  // T1 local node.
  let fold=await spans(page,node(page,'x'));
  await fold.getByLabel('New span name',{exact:true}).fill('process');await fold.getByLabel('New span service',{exact:true}).fill('x-svc');
  await fold.getByLabel('New span value',{exact:true}).fill('handle x');await fold.getByLabel('New span value',{exact:true}).press('Enter');
  await expect.poll(async()=>(await diagram(page)).nodes.x.trace).toEqual({spans:{process:{serviceName:'x-svc',operation:'handle x',role:'process'}}});
  const added=await source.inputValue();
  fold=await spans(page,node(page,'x'));
  await fold.getByLabel('process value',{exact:true}).fill('handle x v2');await fold.getByLabel('process value',{exact:true}).press('Enter');
  await expect.poll(async()=>(await diagram(page)).nodes.x.trace.spans.process.operation).toBe('handle x v2');
  await page.locator('#undo-builder').click();await expect(source).toHaveValue(added);
  // T2 imported node.
  fold=await spans(page,node(page,'direct::b'));
  await expect(fold.locator('.trace-span-origin').first()).toHaveText('Inherited from provider');
  const overlay=async()=>(await diagram(page)).topologyImports[0].nodeTracking?.b?.trace;
  await fold.getByLabel('process value',{exact:true}).fill('handle v2');await fold.getByLabel('process value',{exact:true}).press('Enter');
  await expect.poll(overlay).toEqual({spans:{process:{operation:'handle v2'}}});
  fold=await spans(page,node(page,'direct::b'));
  await fold.getByLabel('find hidden for this document',{exact:true}).check();
  await expect.poll(overlay).toEqual({spans:{process:{operation:'handle v2'}},hide:['find']});
  fold=await spans(page,node(page,'direct::b'));
  await fold.getByRole('button',{name:'Revert all trace spans',exact:true}).click();
  await expect.poll(overlay).toBeUndefined();
  await page.locator('#undo-builder').click();await expect.poll(overlay,'Revert all is one Undo step').toEqual({spans:{process:{operation:'handle v2'}},hide:['find']});
  // T3 imported connection.
  fold=await spans(page,()=>clickUncovered(page,page.locator('#docview text.lbl[data-dv-edge="0"]').first(),'the Provider delivery label'));
  await expect(fold.getByLabel('send namespace',{exact:true})).toBeVisible();
  await fold.getByLabel('send namespace',{exact:true}).fill('eu');await fold.getByLabel('send namespace',{exact:true}).press('Enter');
  await expect.poll(async()=>(await diagram(page)).topologyImports[0].edgeTracking?.['a->b']?.trace).toEqual({spans:{send:{namespace:'eu'}}});
  expect(await page.evaluate(()=>window.spanContext.specs[0])).toEqual(provider);
});
