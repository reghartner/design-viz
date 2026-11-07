import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {test,expect} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
import {nestedSpec,PANEL} from '../helpers/telemetry-cards.mjs';
import {recordedUrlEvidence} from '../../../tests/helpers/step-evidence.mjs';
const PROFILE=JSON.parse(await readFile(path.join(repo,'tests/fixtures/trace-connection-profile.json'),'utf8'));
const RECORDED=await readFile(path.join(repo,'tests/fixtures/provider-traces/honeycomb-trace.txt'),'utf8'),ID='8413cd87a9f15b6bfe8e1acf5b3346d0';
const schema={name:'get_trace',annotations:{readOnlyHint:true,destructiveHint:false},inputSchema:{type:'object',properties:{trace_id:{type:'string'},from:{type:'string'},environment_slug:{type:'string'},team_slug:{type:'string'},view_mode:{type:'string'}},required:['trace_id','from','environment_slug','team_slug','view_mode']}};
async function setup(page,server,{ambiguous=false,baseline=false,textTarget=false,edgeScene=false,extremeCurve=false,edgeOnly=false,multiEdge=false,brokenEdge=false,reducedMotion='reduce'}={}){
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
 if(edgeScene){
  d.nodes.client={title:'Checkout browser'};d.rows=[[]];d.floats=[{id:'outer::inner::a',x:100,y:160},{id:'outer::inner::b',x:650,y:160},{id:'client',x:100,y:470},{id:'local',x:650,y:470}];
  Object.assign(d.edges[0],{curvePoints:[{t:.5,dx:0,dy:90}],presentation:'baseline',ret:true,tickets:['EDGE-1']});
  d.edges.push({from:'client',to:'local',label:'POST checkout',curvePoints:[{t:.5,dx:0,dy:-90}],presentation:'baseline',kind:'https',tickets:['EDGE-2']});d.steps[0].edge='client->local';
 }
 if(extremeCurve)d.edges[0].curvePoints=[{t:.5,dx:0,dy:550}];
 if(edgeOnly || multiEdge)delete d.steps[1].traceMatch.nodeId;
 if(multiEdge){d.edges.push({from:'outer::inner::a',to:'local',label:'Another authored delivery'});delete d.steps[1].edge;d.steps[1].edges=['outer::inner::a->outer::inner::b','outer::inner::a->local'];}
 if(brokenEdge)d.edges[0].missingWork=true;
 if(ambiguous){d.steps.push({...structuredClone(d.steps[1]),id:'retry',text:'Retry currency lookup'});d.paths.push({id:'retry',label:'Recovery',steps:['retry','finish']});}
 await writeFile(path.join(server.root,'trace-focus-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
 await writeFile(path.join(server.root,'trace-focus.html'),'<div id="host"></div><div id="peer"></div><script type="module">import {mountNativeViewer} from "./trace-focus-native.js";window.mount=mountNativeViewer;</script>');
 await page.goto(server.origin+'/trace-focus.html');await page.waitForFunction(()=>!!window.mount);
 await page.evaluate(({spec,schema,text})=>{
  window.traceScrolls=0;const scroll=Element.prototype.scrollIntoView;Element.prototype.scrollIntoView=function(...args){if(this.matches('.dv-trace-selected'))window.traceScrolls++;return scroll.apply(this,args);};
  window.focusSpec=spec;window.focusOptions={telemetry:{directTrace:{describe:async()=>schema,call:async()=>({payload:text})}}};
  window.viewer=window.mount(document.querySelector('#host'),spec,window.focusOptions);window.peer=window.mount(document.querySelector('#peer'),spec,window.focusOptions);
  window.api=window.viewer.controller.liveStatus;window.sp=window.viewer.controller.sections[0].stepper;window.api.apply({'EDGE-1':{state:'active'},'EDGE-2':{state:'done'}});
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
 await row(root,imported).click();await expect(root.getByRole('group',{name:'Choose trace step'})).toBeVisible();expect(await state(page)).toMatchObject({step:'local',playing:false});await expect(root.locator('.dv-trace-focus-overlay,.dv-trace-edge-focus')).toHaveCount(0);
 await expectPanelFits(root);await info.attach('trace-focus-explicit-operation-choice',{body:await root.screenshot(),contentType:'image/png'});
 await root.getByRole('button',{name:'Step 1: Retry currency lookup · Recovery',exact:true}).click();expect(await state(page)).toMatchObject({step:'retry',path:'retry',playing:false});await expect(node(root,'outer::inner::b')).toHaveAttribute('data-trace-focus','true');await expect(root.locator('.dv-trace-edge-focus')).toHaveCount(1);
 const unmapped=e.spans.find(s=>s.service!=='currency' && s.service!=='frontend');await row(root,unmapped).scrollIntoViewIfNeeded();expect(await page.evaluate(()=>{window.sp.toggleAuto();return window.sp.playing();})).toBe(true);await row(root,unmapped).click();await expect(root.locator('.dv-trace-focus-status')).toContainText('Inspection only');expect(await state(page)).toMatchObject({step:'retry',path:'retry',playing:false});await expect(root.locator('.dv-trace-focus-overlay,.dv-trace-edge-focus')).toHaveCount(0);
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
 expect(await page.evaluate(()=>window.staleResult)).toBe(false);expect(await page.evaluate(()=>window.jumpCalls)).toBe(0);await expect(root.locator('.dv-trace-focus-overlay,.dv-trace-edge-focus')).toHaveCount(0);
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


async function edgeInk(edge){return edge.evaluate(el=>{const s=getComputedStyle(el);return {d:el.getAttribute('d'),stroke:s.stroke,width:s.strokeWidth,dash:s.strokeDasharray,marker:el.getAttribute('marker-end')};});}
async function expectEdgeOutline(root,index){
 const edge=root.locator('path.edge[data-dv-edge="'+index+'"]'),focus=root.locator('.dv-trace-edge-focus');
 await expect(focus).toHaveCount(1);await expect(focus).toHaveAttribute('pointer-events','none');await expect(focus).toHaveAttribute('aria-hidden','true');
 await expect(focus.locator('[data-dv-edge],.edge,[marker-end]')).toHaveCount(0);
 const evidence=await focus.evaluate(g=>{
  const outline=g.querySelector('.dv-trace-edge-outline'),mask=g.querySelector('mask'),strokes=Array.from(mask.querySelectorAll('path')),style=getComputedStyle(outline);
  return {d:outline.getAttribute('d'),mask:outline.getAttribute('mask'),id:mask.id,colors:strokes.map(p=>p.getAttribute('stroke')),widths:strokes.map(p=>Number(p.getAttribute('stroke-width'))),stroke:style.stroke,animation:style.animationName,opacity:getComputedStyle(g).opacity};
 });
 expect(evidence.d).toBe(await edge.getAttribute('d'));expect(evidence.mask).toBe('url(#'+evidence.id+')');expect(evidence.colors).toEqual(['white','black']);expect(evidence.widths[0]-evidence.widths[1]).toBe(4);expect(evidence.widths[1]).toBeGreaterThan(parseFloat((await edgeInk(edge)).width)+6);expect(evidence.stroke).toBe('rgb(0, 159, 199)');expect(evidence.animation).toBe('none');expect(evidence.opacity).toBe('1');
 await expect.poll(()=>focus.evaluate(g=>{
  const box=g.getBoundingClientRect(),board=g.closest('.board'),frame=board.getBoundingClientRect(),toolbar=board.querySelector('.lg').getBoundingClientRect();
  return box.width>0 && box.height>0 && box.left>=frame.left && box.right<=frame.right && box.top>=toolbar.bottom && box.bottom<=frame.bottom;
 }),{message:'The complete curved outline is visible at the chosen camera scale'}).toBe(true);
}
async function expectTimingUnclipped(text){
 await expect.poll(()=>text.evaluate(el=>{
  const box=el.getBoundingClientRect(),svg=el.closest('svg'),clip=svg.getBoundingClientRect(),board=el.closest('.board'),frame=board.getBoundingClientRect(),toolbar=board.querySelector('.lg').getBoundingClientRect(),m=el.getScreenCTM();
  const ink=1.5*Math.max(Math.hypot(m.a,m.b),Math.hypot(m.c,m.d));
  return box.width>0 && box.height>0 && box.left-ink>=Math.max(clip.left,frame.left) && box.right+ink<=Math.min(clip.right,frame.right) && box.top-ink>=Math.max(clip.top,toolbar.bottom) && box.bottom+ink<=Math.min(clip.bottom,frame.bottom);
 }),{message:'Complete timing glyphs and their white stroke fit inside SVG clip and below the toolbar'}).toBe(true);
}
async function expectLargeTiming(root,index,span){
 const onCanvas=root.locator('.dv-trace-overlay[data-trace-edge="'+index+'"]'),duration=root.locator('.dv-trace-operation-detail .dv-trace-duration');
 await expectTimingUnclipped(onCanvas.locator('text'));await expect(onCanvas.locator('text')).toHaveCSS('font-size','14px');await expect(onCanvas).toHaveAttribute('aria-label',new RegExp(String(span.ms).replaceAll('.','\\.')+' ms'));
 await expect(root.locator('.dv-trace-operation-detail').getByRole('img',{name:span.ms+' milliseconds',exact:true})).toHaveCount(1);await expect(duration).toHaveCSS('font-size','20px');await expect(duration).toHaveAttribute('aria-label',span.ms+' milliseconds');await expect(row(root,span).locator('.dv-trace-duration')).toHaveCSS('font-size','13px');
 expect((await duration.innerText()).length).toBeLessThan(13);await expectPanelFits(root);
 await expect.poll(()=>onCanvas.locator('text').evaluate(text=>{
  const box=text.getBoundingClientRect(),board=text.closest('.board'),frame=board.getBoundingClientRect(),obstacles=board.querySelectorAll('text.lbl,g.coin,g.node .t1,g.node .t2');
  const overlap=other=>box.left<other.right && box.right>other.left && box.top<other.bottom && box.bottom>other.top;
  return box.left>=frame.left && box.right<=frame.right && box.top>=frame.top && box.bottom<=frame.bottom && Array.from(obstacles).every(el=>!overlap(el.getBoundingClientRect()));
 }),{message:'Readable milliseconds do not cover a protocol label, step coin or node title'}).toBe(true);
}

test('desktop curved local and imported selected edges have separated cyan outlines and readable exact-accessible timings',async({page,server},info)=>{
 const {root,local,imported}=await setup(page,server,{edgeScene:true,baseline:true});
 for(const [index,span,id] of [[1,local,'local'],[0,imported,'outer::inner::b']]){
  const edge=root.locator('path.edge[data-dv-edge="'+index+'"]'),ink=await edgeInk(edge),nodeInk=await border(node(root,id));expect(ink.d).toMatch(/[CQ]/);expect(ink.marker).toMatch(/^url/);expect(ink.dash).not.toBe('none');
  await row(root,span).click();await root.getByRole('button',{name:'Fit diagram',exact:true}).click();
  await expectEdgeOutline(root,index);expect(await edgeInk(edge)).toEqual(ink);expect(await border(node(root,id))).toEqual(nodeInk);await expectLargeTiming(root,index,span);
  await captureFocus(root,info,'trace-floating-edge-'+(index?'local':'nested-import')+'-larger-ms');
  // A routine repaint retains just one mask and never changes the original path.
  await page.evaluate(()=>{for(let i=0;i<4;i++)window.api.setTraceShow(true);});await expect(root.locator('.dv-trace-edge-focus mask')).toHaveCount(1);expect(await edgeInk(edge)).toEqual(ink);
  await page.evaluate(()=>window.api.setTraceShow(false));await expect(root.locator('.dv-trace-focus-overlay,.dv-trace-edge-focus')).toHaveCount(0);
  await page.evaluate(()=>window.api.setTraceShow(true));await expectEdgeOutline(root,index);
  await root.getByRole('button',{name:'Clear trace focus',exact:true}).click();await expect(root.locator('.dv-trace-edge-focus')).toHaveCount(0);await expect(root.locator('mask[id^="dv-trace-focus-mask-"]')).toHaveCount(0);expect(await edgeInk(edge)).toEqual(ink);
 }
});

test('desktop edge-only mapping follows actual transformed geometry and isolates masks across native mounts',async({page,server},info)=>{
 const {root,imported}=await setup(page,server,{edgeScene:true,edgeOnly:true});await row(root,imported).click();
 await root.getByRole('button',{name:'Fit diagram',exact:true}).click();await expectEdgeOutline(root,0);await expect(root.locator('.dv-trace-focus-overlay')).toHaveCount(0);await expect(root.locator('.dv-trace-focus-status')).not.toContainText('no authored diagram target');
 const edge=root.locator('path.edge[data-dv-edge="0"]');await edge.evaluate(el=>el.setAttribute('transform','translate(7 9)'));await page.evaluate(()=>window.api.setTraceShow(true));await expect(root.locator('.dv-trace-edge-focus')).toHaveAttribute('transform','translate(7 9)');await expectEdgeOutline(root,0);await expectLargeTiming(root,0,imported);
 await info.attach('trace-floating-transformed-edge-only',{body:await root.screenshot(),contentType:'image/png'});
 const peer=page.locator('#peer');await peer.getByRole('button',{name:'Trace',exact:true}).click();await peer.getByRole('combobox',{name:'Connection environment',exact:true}).selectOption('prod');await peer.getByRole('textbox',{name:'Trace ID or link',exact:true}).fill(ID);await peer.getByRole('button',{name:'Load trace',exact:true}).click();await row(peer,imported).click();
 const ids=await page.locator('.dv-trace-edge-focus mask').evaluateAll(masks=>masks.map(m=>m.id));expect(ids).toHaveLength(2);expect(new Set(ids).size).toBe(2);
 await page.evaluate(()=>{window.retiredRoot=document.querySelector('#host').shadowRoot;window.viewer.destroy();});expect(await page.evaluate(()=>window.retiredRoot.querySelectorAll('.dv-trace-edge-focus,mask[id^="dv-trace-focus-mask-"]').length)).toBe(0);await expect(peer.locator('.dv-trace-edge-focus')).toHaveCount(1);
});

for(const mode of ['multiple delivered edges','broken status edge'])test('desktop '+mode+' never receives a misleading continuous selected edge',async({page,server})=>{
 const {root,local,imported}=await setup(page,server,{multiEdge:mode==='multiple delivered edges',brokenEdge:mode==='broken status edge'});
 await row(root,local).click();await expect(root.locator('.dv-trace-edge-focus')).toHaveCount(0); // Node-only step.
 await row(root,imported).click();expect(await state(page)).toMatchObject({step:'currency',path:'imported',playing:false});await expect(root.locator('.dv-trace-edge-focus')).toHaveCount(0);
 if(mode==='broken status edge'){await expect(root.locator('path.edge[data-dv-edge="0"]')).toHaveClass(/dv-live-comm-hidden/);await expect(root.locator('.dv-live-comm-failure')).toHaveCount(1);}
});


for(const extremeCurve of [false,true])test('desktop timing ink fits the SVG clip at '+(extremeCurve?'an extreme curve':'a bottom float')+' without reframing',async({page,server},info)=>{
 const {root,local,imported}=await setup(page,server,{edgeScene:true,extremeCurve});const span=extremeCurve?imported:local;
 const target=extremeCurve?root.locator('path.edge[data-dv-edge="0"]'):node(root,'local').locator('.card');
 // Prove this fixture exercises the 24-unit canvas gutter, not only the board.
 const gutter=await target.evaluate(el=>{
  const svg=el.closest('svg'),frame=svg.viewBox.baseVal,m=svg.getCTM().inverse().multiply(el.getCTM()),b=el.getBBox();
  const bottom=Math.max(...[[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]].map(([x,y])=>m.b*x+m.d*y+m.f));return frame.y+frame.height-bottom;
 });expect(gutter).toBeGreaterThanOrEqual(22);expect(gutter).toBeLessThanOrEqual(26);
 const svg=root.locator('.board svg:has(path.edge)').first(),frame=await svg.getAttribute('viewBox');
 await row(root,span).click();await root.getByRole('button',{name:'Fit diagram',exact:true}).click();
 const text=extremeCurve?root.locator('.dv-trace-overlay[data-trace-edge="0"] text'):node(root,'local').locator('.dv-trace-overlay text');
 await expectTimingUnclipped(text);await expect(text).toHaveCSS('font-size','14px');
 if(extremeCurve)await expectLargeTiming(root,0,span);
 else expect(await text.evaluate(el=>{const a=el.getBoundingClientRect(),b=el.closest('g.node').querySelector('.card').getBoundingClientRect();return a.top>b.bottom;})).toBe(true);
 await info.attach(extremeCurve?'trace-timing-extreme-curve-svg-clip':'trace-timing-bottom-float-svg-clip',{body:await root.screenshot(),contentType:'image/png'});
 await page.evaluate(()=>{for(let i=0;i<3;i++)window.api.setTraceShow(true);});await expectTimingUnclipped(text);await expect(svg).toHaveAttribute('viewBox',frame);
 await root.getByRole('button',{name:'Clear trace focus',exact:true}).click();await expect(svg).toHaveAttribute('viewBox',frame);
 await page.evaluate(()=>window.api.setTraceShow(false));await expect(svg).toHaveAttribute('viewBox',frame);await expect(root.locator('.dv-trace-overlay,.dv-trace-edge-focus')).toHaveCount(0);
});
