/* #1413 desktop Workbench → saved spec → viewer matcher: a starts-with attribute on an imported connection's
   send span. Node coverage: tests/trace-attribute-operators.test.js (truth table, validator, imports, commands).
| row | rule | fixture | assertion | broken implementation it rejects |
|---|---|---|---|---|
| A1 | On imported connection a → b, typing deployment.environment.name / prd into the send span's new attribute, choosing Starts with and clicking Add attribute writes the consumer overlay edgeTracking["a->b"] with {"startsWith":"prd"} (one Undo step; provider untouched); the row reads "starts with"; the saved source, resolved and matched in the page's own viewer matcher (FlowTraceMatch.carrierSpans), claims only the prd span of three POST spans. | provider a → b with a send span on POST; consumer importing it | overlay; Undo; row label; claimed span ids | an operator written as text; a matcher that claims every POST |
Selection goes through inspectPageElement, as trace-spans-editor.spec.mjs does. Desktop only.
*/
import {test,expect,paste,prepareEditorSurface,inspectPageElement} from '../helpers/test.mjs';
const A='deployment.environment.name';
const spec=(id,diagram)=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},sections:[{id:'main',diagram}]}});
const provider=spec('provider',{nodes:{a:{title:'Provider A'},b:{title:'Provider B'}},rows:[['a','b']],
  edges:[{from:'a',to:'b',label:'Provider delivery',trace:{spans:{send:{serviceName:'a-svc',operation:'POST',role:'send'}}}}],topologyExports:{core:{nodes:['a','b'],edges:['a->b']}}});
const consumer=spec('consumer',{nodes:{x:{title:'Local X'}},rows:[['x']],edges:[],topologyImports:[{spec:'provider',export:'core',as:'direct',position:{x:50,y:250}}]});

test('A1 desktop: a starts-with attribute on an imported connection\'s span is saved as an operator and claims only the matching span',async({page,server},info)=>{
  await page.setViewportSize({width:1680,height:1100});
  await page.goto(server.origin+'/lifetime/index.html');
  await paste(page,JSON.stringify({page:{title:'x',sections:[{diagram:{nodes:{x:{title:'X'}},rows:[['x']]}}]}}));await prepareEditorSurface(page);
  await page.evaluate(({provider,consumer})=>{window.spanContext={version:1,id:'consumer',specs:[provider,consumer]};window.__editorTest.builder.loadText(JSON.stringify(consumer),window.spanContext);},{provider,consumer});
  const source=page.locator('#src'),label=page.locator('#docview text.lbl[data-dv-edge="0"]').first();
  await inspectPageElement(page,{click:async()=>{await label.scrollIntoViewIfNeeded();await label.click();}});
  const fold=page.locator('#guide details.trace-spans-editor');await expect(fold).toHaveCount(1);
  if(!await fold.evaluate(el=>el.open))await fold.locator(':scope > summary').click();
  const before=await source.inputValue();
  const name=fold.getByLabel('send new attribute name',{exact:true});await name.click();await page.keyboard.type(A);
  const value=fold.getByLabel('send new attribute value',{exact:true});await value.click();await page.keyboard.type('prd');
  await fold.getByLabel('send new attribute match',{exact:true}).selectOption('startsWith');
  await fold.getByRole('button',{name:'Add attribute to send',exact:true}).click();
  const overlay=async()=>JSON.parse(await source.inputValue()).page.sections[0].diagram.topologyImports[0].edgeTracking?.['a->b']?.trace;
  await expect.poll(overlay).toEqual({spans:{send:{attributes:{[A]:{startsWith:'prd'}}}}});
  await expect(fold.locator('.trace-span-attributes .fnote').first()).toHaveText(A+' starts with prd');
  await expect(fold.getByLabel('send attribute '+A+' match',{exact:true})).toHaveValue('startsWith');
  await page.screenshot({path:info.outputPath('trace-attribute-starts-with.png')});
  const saved=await source.inputValue();
  expect(await page.evaluate(()=>window.spanContext.specs[0])).toEqual(provider);
  // The saved source, resolved as a board renders it, in the page's own trace matcher.
  const claimed=await page.evaluate(({saved,A})=>{
    const board=JSON.parse(saved),d=FlowTopology.resolveSource(board,{version:1,id:'consumer',specs:[window.spanContext.specs[0],board]}).page.sections[0].diagram;
    const span=(id,v)=>({id,parentId:null,serviceName:'a-svc',operation:'POST',startMs:0,durationMs:5,error:false,attributes:{[A]:v},links:[]});
    const out=FlowTraceMatch.carrierSpans(d,{spans:[span('prd',"prd-eu"),span('stg','stg-eu'),span('dev','dev')]});
    return (out.edges['direct::a->direct::b'] || []).flatMap(x=>x.spans.map(s=>s.id));
  },{saved,A});
  expect(claimed).toEqual(['prd']);
  await page.locator('#undo-builder').click();await expect(source).toHaveValue(before);
});
