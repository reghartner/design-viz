import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {test,expect} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
import {nestedSpec,PANEL} from '../helpers/telemetry-cards.mjs';
import {recordedUrlEvidence} from '../../../tests/helpers/step-evidence.mjs';
const PROFILE=JSON.parse(await readFile(path.join(repo,'tests/fixtures/trace-connection-profile.json'),'utf8'));
const RECORDED=await readFile(path.join(repo,'tests/fixtures/provider-traces/honeycomb-trace.txt'),'utf8'),ID='8413cd87a9f15b6bfe8e1acf5b3346d0';
const schema={name:'get_trace',annotations:{readOnlyHint:true,destructiveHint:false},inputSchema:{type:'object',properties:{trace_id:{type:'string'},from:{type:'string'},environment_slug:{type:'string'},team_slug:{type:'string'},view_mode:{type:'string'}},required:['trace_id','from','environment_slug','team_slug','view_mode']}};
async function setup(page,server,{ambiguous=false,baseline=false,textTarget=false,reducedMotion='reduce'}={}){
 await page.setViewportSize({width:1600,height:1100});await page.emulateMedia({reducedMotion});
 const spec=nestedSpec(),d=spec.page.sections[0].diagram,e=await recordedUrlEvidence();
 spec.page.title='Trace focus · checkout request';spec.page.subtitle='Recorded request · explicit authored steps';
 spec.page.tracking={telemetry:{traceConnections:{company:PROFILE}}};
 d.view='step';d.autoplay=false;d.panels=[PANEL];d.edges.forEach(edge=>delete edge.telemetry);
 d.nodes.local={title:'Checkout frontend',missingWork:true};d.rows.push(['local']);d.nodes['outer::inner::b'].missingWork=true;
 d.steps=[{id:'local',text:'Accept checkout',nodes:['local'],traceMatch:{serviceName:'frontend',operation:'/cart/checkout',nodeId:'local'}},
  {id:'currency',text:'Resolve supported currencies',edge:'outer::inner::a->outer::inner::b',traceMatch:{serviceName:'currency',operation:'grpc.msdemo.CurrencyService/GetSupportedCurrencies',nodeId:'outer::inner::b'}}];
 d.steps.push({id:'finish',text:'Complete request inspection',nodes:['outer::inner::a']});
 d.paths=[{id:'checkout',label:'Checkout',steps:['local','finish']},{id:'imported',label:'Imported service',steps:['currency','finish']}];
 if(baseline){d.nodes.local.presentation='baseline';d.nodes['outer::inner::b'].presentation='baseline';}
 if(textTarget){d.nodes.note={type:'text',text:'Checkout operation notes',presentation:'baseline'};d.floats=(d.floats || []).concat([{id:'note',x:100,y:450}]);d.steps[0].nodes=['note'];d.steps[0].traceMatch.nodeId='note';}
 if(ambiguous){d.steps.push({...structuredClone(d.steps[1]),id:'retry',text:'Retry currency lookup'});d.paths.push({id:'retry',label:'Recovery',steps:['retry','finish']});}
 await writeFile(path.join(server.root,'trace-focus-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
 await writeFile(path.join(server.root,'trace-focus.html'),'<div id="host"></div><div id="peer"></div><script type="module">import {mountNativeViewer} from "./trace-focus-native.js";window.mount=mountNativeViewer;</script>');
 await page.goto(server.origin+'/trace-focus.html');await page.waitForFunction(()=>!!window.mount);
 await page.evaluate(({spec,schema,text})=>{
  window.traceScrolls=0;const scroll=Element.prototype.scrollIntoView;Element.prototype.scrollIntoView=function(...args){if(this.matches('.dv-trace-selected'))window.traceScrolls++;return scroll.apply(this,args);};
  window.focusSpec=spec;window.focusOptions={telemetry:{directTrace:{describe:async()=>schema,call:async()=>({payload:text})}}};
  window.viewer=window.mount(document.querySelector('#host'),spec,window.focusOptions);window.peer=window.mount(document.querySelector('#peer'),spec,window.focusOptions);
  window.api=window.viewer.controller.liveStatus;window.sp=window.viewer.controller.sections[0].stepper;
 },{spec,schema,text:RECORDED});
 const root=page.locator('#host');await root.getByRole('button',{name:'Trace',exact:true}).click();
 await root.getByRole('combobox',{name:'Connection environment',exact:true}).selectOption('prod');
 await root.getByRole('textbox',{name:'Trace ID or link',exact:true}).fill(ID);await root.getByRole('button',{name:'Load trace',exact:true}).click();
 await expect(root.locator('.dv-trace-span')).toHaveCount(e.spans.length);
 const local=e.spans.find(s=>s.service==='frontend' && s.name==='/cart/checkout'),imported=e.spans.find(s=>s.service==='currency' && s.name==='grpc.msdemo.CurrencyService/GetSupportedCurrencies');
 return {root,local,imported,e};
}
const row=(root,span)=>root.locator('.dv-trace-span[data-span-id="'+span.id+'"]');
const node=(root,id)=>root.locator('g.node[data-dv-node="'+id+'"]:not(.node-text)');
async function state(page){return page.evaluate(()=>({step:window.sp.current().id,path:window.sp.path(),playing:window.sp.playing(),focus:window.api.snapshot().trace.selected?.focus?.spanId}));}
async function border(locator){return locator.locator('.card').evaluate(el=>{const s=getComputedStyle(el);return {stroke:s.stroke,dash:s.strokeDasharray,width:s.strokeWidth};});}
// Screenshots must show settled JS-camera framing, not an intermediate RAF.
async function expectTraceVisible(root){
 await expect(root.locator('.dv-trace-focus-overlay')).toHaveCount(1);
 await expect.poll(()=>root.locator('.dv-trace-focus-overlay').evaluate(marker=>{
  const box=marker.getBoundingClientRect(),board=marker.closest('.board'),frame=board.getBoundingClientRect(),toolbar=board.querySelector('.lg').getBoundingClientRect();
  return box.width>0 && box.height>0 && box.left>=frame.left+2 && box.right<=frame.right-2 && box.top>=toolbar.bottom+2 && box.bottom<=frame.bottom-2;
 }),{message:'Complete Trace brackets and tag fit below the diagram toolbar'}).toBe(true);
}
async function expectPanelFits(root){
 const regions=root.locator('.dv-trace-operation-detail,.dv-trace-focus-summary');
 await expect.poll(()=>regions.evaluateAll(nodes=>nodes.every(node=>{
  const box=node.getBoundingClientRect();return node.scrollWidth<=node.clientWidth+1 && Array.from(node.children).every(child=>{
   const bounds=child.getBoundingClientRect();return bounds.left>=box.left && bounds.right<=box.right+1 && child.scrollWidth<=child.clientWidth+1;
  });
 })),{message:'Operation, duration, step labels and choices fit the desktop panel'}).toBe(true);
}
async function captureFocus(root,info,name){await expectTraceVisible(root);await expectPanelFits(root);await info.attach(name,{body:await root.screenshot(),contentType:'image/png'});}

test('desktop native trace focus selects source steps, preserves imported/local missing-work borders, and clears without playback',async({page,server},info)=>{
 const {root,local,imported}=await setup(page,server,{reducedMotion:'no-preference'});
 await expect(root.locator('.dv-trace-span[aria-pressed="true"]')).toHaveCount(0);
 const ink={local:await border(node(root,'local')),imported:await border(node(root,'outer::inner::b'))};
 expect(ink.local.dash).not.toBe('none');expect(ink.imported.dash).not.toBe('none');
 await row(root,local).focus();expect(await page.evaluate(()=>{window.sp.toggleAuto();return window.sp.playing();})).toBe(true);await page.keyboard.press('Enter');
 await expect(node(root,'local')).toHaveAttribute('data-trace-focus','true');expect(await state(page)).toMatchObject({step:'local',path:'checkout',playing:false,focus:local.id});
 await expect(row(root,local)).toHaveAttribute('aria-pressed','true');expect(await border(node(root,'local'))).toEqual(ink.local);
 await captureFocus(root,info,'trace-focus-local-step-and-missing-work');
 // A wholly filtered alternate still receives its exact source step preview.
 await page.evaluate(()=>{window.sp.setViewFilter(['checkout'],['local']);});await row(root,imported).click();
 await expect(node(root,'outer::inner::b')).toHaveAttribute('data-trace-focus','true');expect(await state(page)).toMatchObject({step:'currency',path:'imported',playing:false,focus:imported.id});
 expect(await border(node(root,'outer::inner::b'))).toEqual(ink.imported);await expectTraceVisible(root);
 await page.evaluate(()=>window.sp.jumpSource(0,'checkout'));await expect(node(root,'outer::inner::b')).toHaveCSS('opacity','1');
 await page.evaluate(()=>window.sp.jumpSource(1,'imported'));await expect(root.locator('.dv-trace-focus-overlay')).toHaveCount(1);
 await expect(page.locator('#peer [data-trace-focus]')).toHaveCount(0);expect(await page.evaluate(()=>window.peer.controller.sections[0].stepper.current().id)).toBe('local');
 await captureFocus(root,info,'trace-focus-nested-import-hidden-alternate');
 const scrolls=await page.evaluate(()=>window.traceScrolls);await page.evaluate(()=>{for(let i=0;i<4;i++)window.api.setTraceShow(true);});
 await expect(root.locator('.dv-trace-focus-overlay')).toHaveCount(1);expect(await page.evaluate(()=>window.traceScrolls)).toBe(scrolls);
 await root.getByRole('button',{name:'Clear trace focus',exact:true}).click();await expect(root.locator('[data-trace-focus]')).toHaveCount(0);await expect(root.locator('.dv-trace-span[aria-pressed="true"]')).toHaveCount(0);expect(await state(page)).toMatchObject({step:'currency',playing:false});
 await page.evaluate(()=>window.sp.enterAmbient());await row(root,local).click();expect(await state(page)).toMatchObject({step:'local',playing:false});await expect(node(root,'local')).toHaveAttribute('data-trace-focus','true');
});

test('desktop ambiguous and unmapped spans pause for inspection without guessing; explicit choice selects its path',async({page,server},info)=>{
 const {root,imported,e}=await setup(page,server,{ambiguous:true,reducedMotion:'no-preference'});
 await row(root,imported).scrollIntoViewIfNeeded();expect(await page.evaluate(()=>{window.sp.toggleAuto();return window.sp.playing();})).toBe(true);
 await row(root,imported).click();await expect(root.getByRole('group',{name:'Choose trace step'})).toBeVisible();expect(await state(page)).toMatchObject({step:'local',playing:false});await expect(root.locator('.dv-trace-focus-overlay')).toHaveCount(0);
 await expectPanelFits(root);await info.attach('trace-focus-explicit-operation-choice',{body:await root.screenshot(),contentType:'image/png'});
 await root.getByRole('button',{name:'Step 1: Retry currency lookup · Recovery',exact:true}).click();expect(await state(page)).toMatchObject({step:'retry',path:'retry',playing:false});await expect(node(root,'outer::inner::b')).toHaveAttribute('data-trace-focus','true');
 const unmapped=e.spans.find(s=>s.service!=='currency' && s.service!=='frontend');await row(root,unmapped).scrollIntoViewIfNeeded();expect(await page.evaluate(()=>{window.sp.toggleAuto();return window.sp.playing();})).toBe(true);await row(root,unmapped).click();await expect(root.locator('.dv-trace-focus-status')).toContainText('Inspection only');expect(await state(page)).toMatchObject({step:'retry',path:'retry',playing:false});await expect(root.locator('.dv-trace-focus-overlay')).toHaveCount(0);
});

for(const change of ['environment','connection','clear','history','remount'])test('desktop stale span callbacks cannot navigate after '+change,async({page,server})=>{
 const {root,imported}=await setup(page,server);await row(root,imported).click();
 await page.evaluate(()=>{window.staleAPI=window.api;window.staleAction={context:window.api.snapshot().trace.selected.context,spanId:window.api.snapshot().trace.selected.focus.spanId};window.jumpCalls=0;const jump=window.sp.jumpSource;window.sp.jumpSource=function(...args){window.jumpCalls++;return jump.apply(this,args);};});
 await page.evaluate(change=>{
  if(change==='environment')window.api.setDirectTraceField({field:'environment',value:'stage'});
  if(change==='connection')window.api.setDirectTraceField({field:'connection',value:''});
  if(change==='clear')window.api.clearTraceFocus({context:window.staleAction.context});
  if(change==='history')window.viewer.controller.telemetry.openHistory([{at:'2026-10-12T00:00:00Z'}],0);
  if(change==='remount'){window.viewer.destroy();window.viewer=window.mount(document.querySelector('#host'),window.focusSpec,window.focusOptions);}
  window.staleResult=window.staleAPI.selectTraceSpan(window.staleAction);
 },change);
 expect(await page.evaluate(()=>window.staleResult)).toBe(false);expect(await page.evaluate(()=>window.jumpCalls)).toBe(0);await expect(root.locator('.dv-trace-focus-overlay')).toHaveCount(0);
 if(change==='history'){await expect(root.locator('.dv-trace-selected')).toHaveCount(0);expect(await page.evaluate(()=>window.viewer.controller.telemetry.enabled())).toBe(false);}
});


test('desktop focused baseline local and imported nodes retain full opacity and restore baseline dimming on clear',async({page,server},info)=>{
 const {root,local,imported}=await setup(page,server,{baseline:true});await page.mouse.move(0,0);
 for(const [id,span,index,path] of [['local',local,0,'checkout'],['outer::inner::b',imported,1,'imported']]){
  const target=node(root,id),ink=await border(target);await expect(target).toHaveClass(/review-baseline/);
  await row(root,span).click();await expect(target).toHaveCSS('opacity','1');await expect(target.locator('.dv-trace-focus-overlay')).toHaveCount(1);expect(await border(target)).toEqual(ink);
  // Both lit and non-lit baseline states must yield to explicit trace focus.
  await page.evaluate(()=>window.sp.jumpSource(2,'checkout'));await expect(target).toHaveCSS('opacity','1');
  // This scene deliberately moved to another step to prove non-lit opacity.
  // Fit pauses follow and makes the focused comparison target visible again.
  await root.getByRole('button',{name:'Fit diagram',exact:true}).click();
  await captureFocus(root,info,'trace-focus-baseline-'+(id==='local'?'local':'imported'));
  await root.getByRole('button',{name:'Clear trace focus',exact:true}).click();await page.mouse.move(0,0);await expect(target).toHaveCSS('opacity','0.25');expect(await border(target)).toEqual(ink);
  await page.evaluate(({index,path})=>window.sp.jumpSource(index,path),{index,path});await expect(target).toHaveCSS('opacity','0.82');
 }
});

test('desktop actual text-box trace target receives brackets and restores baseline opacity',async({page,server},info)=>{
 const {root,local}=await setup(page,server,{textTarget:true}),text=root.locator('g.node.node-text[data-dv-node="note"]');
 await expect(text).toHaveAttribute('data-dv-text-box','true');await expect(text.locator('.text-box-hit')).toHaveCount(1);await expect(text.locator('.card')).toHaveCount(0);
 await row(root,local).click();await expect(text).toHaveAttribute('data-trace-focus','true');await expect(text).toHaveCSS('opacity','1');await expect(text.locator('.dv-trace-focus-overlay')).toHaveCount(1);
 await page.evaluate(()=>window.sp.jumpSource(2,'checkout'));await expect(text).toHaveCSS('opacity','1');
 await root.getByRole('button',{name:'Fit diagram',exact:true}).click();await captureFocus(root,info,'trace-focus-authored-text-box');
 await root.getByRole('button',{name:'Clear trace focus',exact:true}).click();await page.mouse.move(0,0);await expect(text).toHaveCSS('opacity','0.25');await expect(text.locator('.dv-trace-focus-overlay')).toHaveCount(0);
});
