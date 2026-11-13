/* #1413 desktop Workbench → saved spec → viewer matcher: a starts-with attribute on an imported connection's
   send span. Node coverage: tests/trace-attribute-operators.test.js (truth table, validator, imports, commands).
| row | rule | fixture | assertion | broken implementation it rejects |
|---|---|---|---|---|
| A1 | On imported connection a → b, typing deployment.environment.name / prd into the send span's new attribute, choosing Starts with and clicking Add attribute writes the consumer overlay edgeTracking["a->b"] with {"startsWith":"prd"} (one Undo step; provider untouched); the row reads "starts with"; the saved source, resolved and matched by the viewer's trace matcher (FlowTraceMatch.carrierSpans, loaded from the shipped sources), claims only the prd span of three POST spans. | provider a → b with a send span on POST; consumer importing it | overlay; Undo; row label; claimed span ids | an operator written as text; a matcher that claims every POST |
Selection goes through inspectPageElement, as trace-spans-editor.spec.mjs does. Desktop only.
*/
import vm from 'node:vm';
import sourceLoader from '../../../tools/source-loader.cjs';
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
  /* Runs 142af956 and 85a672c4 lost the typed name: the New attribute row was one squeezed row, and the name field
     was about 25px wide, mostly its datalist button, so the click did not leave a place to type. The name and the
     value now each take a full line (#1413; two to a row was 90px), and both must be wide enough to type in. Type
     once, after they are ready. */
  const name=fold.getByLabel('send new attribute name',{exact:true}),value=fold.getByLabel('send new attribute value',{exact:true});
  const match=fold.getByLabel('send new attribute match',{exact:true});
  // The operator first: on main there is no such choice, which is the RED reason.
  await match.selectOption('startsWith');
  await expect(name).toBeEnabled();await expect(value).toBeEnabled();
  for(const field of [name,value])expect((await field.boundingBox()).width,'the New attribute fields are wide enough to type in').toBeGreaterThan(100);
  await name.click();await page.keyboard.type(A);await expect(name).toHaveValue(A);
  await value.click();await page.keyboard.type('prd');await expect(value).toHaveValue('prd');
  await expect(match).toHaveValue('startsWith');await expect(name).toHaveValue(A);
  await fold.getByRole('button',{name:'Add attribute to send',exact:true}).click();
  const overlay=async()=>JSON.parse(await source.inputValue()).page.sections[0].diagram.topologyImports[0].edgeTracking?.['a->b']?.trace;
  await expect.poll(overlay).toEqual({spans:{send:{attributes:{[A]:{startsWith:'prd'}}}}});
  await expect(fold.locator('.trace-span-attributes .fnote').first()).toHaveText(A+' starts with prd');
  await expect(fold.getByLabel('send attribute '+A+' match',{exact:true})).toHaveValue('startsWith');
  await page.screenshot({path:info.outputPath('trace-attribute-starts-with.png')});
  const saved=await source.inputValue();
  expect(await page.evaluate(()=>window.spanContext.specs[0])).toEqual(provider);
  /* The saved source, resolved as a board renders it (FlowTopology.resolveSource) and run through the viewer's
     trace matcher (FlowTraceMatch.carrierSpans), loaded from the shipped sources as metrics-narrow-editor.spec.mjs
     does: the Workbench page does not expose these as globals (run 0e007ed9). */
  const context=vm.createContext({URL,TextEncoder});vm.runInContext(sourceLoader.composeSources(['validator.js','canon.js']),context);
  const board=JSON.parse(saved),d=context.FlowTopology.resolveSource(board,{version:1,id:'consumer',specs:[provider,board]}).page.sections[0].diagram;
  const span=(id,v)=>({id,parentId:null,serviceName:'a-svc',operation:'POST',startMs:0,durationMs:5,error:false,attributes:{[A]:v},links:[]});
  const out=context.FlowTraceMatch.carrierSpans(d,{spans:[span('prd','prd-eu'),span('stg','stg-eu'),span('dev','dev')]});
  const claimed=JSON.parse(JSON.stringify((out.edges['direct::a->direct::b'] || []).flatMap(x=>x.spans.map(s=>s.id))));
  expect(claimed,'only the prd span is claimed').toEqual(['prd']);
  await page.locator('#undo-builder').click();await expect(source).toHaveValue(before);
});
