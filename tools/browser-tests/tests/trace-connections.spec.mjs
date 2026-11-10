import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
import {nestedSpec,PANEL} from '../helpers/telemetry-cards.mjs';
const PROFILE=JSON.parse(await readFile(path.join(repo,'tests/fixtures/trace-connection-profile.json'),'utf8'));
const RECORDED=await readFile(path.join(repo,'tests/fixtures/provider-traces/honeycomb-trace.txt'),'utf8'),ID='8413cd87a9f15b6bfe8e1acf5b3346d0';
const schema=()=>({name:'get_trace',annotations:{readOnlyHint:true,destructiveHint:false},inputSchema:{type:'object',properties:{trace_id:{type:'string'},from:{anyOf:[{type:'string'},{type:'null'}]},environment_slug:{type:'string'},team_slug:{type:'string'},view_mode:{type:'string',enum:['full']}},required:['trace_id','from','environment_slug','team_slug','view_mode'],additionalProperties:false}});
const clone=x=>JSON.parse(JSON.stringify(x));
// #1136: a board without ticket references opens on the Trace view and shows no Jira | Trace switch.
async function onTrace(root){await expect(root.getByRole('button',{name:/^(Jira|Trace)( · \d+)?$/})).toHaveCount(0);await expect(root.locator('.dv-live-trace')).toBeVisible();}
async function observeTraceReveals(page){await page.evaluate(()=>{window.traceReveals=[];const original=Element.prototype.scrollIntoView;Element.prototype.scrollIntoView=function(...args){if(this.matches('.dv-trace-selected'))window.traceReveals.push(this);return original.apply(this,args);};});}
async function openTraceConfiguration(root){const config=root.locator('.dv-trace-config');if(!await config.evaluate(node=>node.open))await config.locator(':scope > summary').click();await expect(config).toHaveJSProperty('open',true);}
// #1230: a loaded trace sits in the reserved space above the search, which stays open below it.
async function expectCompactTrace(root){
 await expect(root.locator('.dv-trace-config')).toHaveJSProperty('open',true);await expect(root.locator('.dv-trace-diagnostics')).toHaveJSProperty('open',false);await expect(root.locator('.dv-trace-arguments')).toBeHidden();
 await expect(root.locator('.dv-trace-config > summary')).toContainText('Production');await expect(root.locator('.dv-trace-span').first()).toBeInViewport();
 await expect(root.locator('.dv-trace-slot > .dv-trace-selected')).toHaveCount(1);
 const body=await root.locator('.dv-live-trace').boundingBox(),config=await root.locator('.dv-trace-direct').boundingBox(),selected=await root.locator('.dv-trace-selected').boundingBox(),waterfall=await root.locator('.dv-trace-waterfall').boundingBox();
 expect(selected.y,'the selected request is above the search').toBeLessThan(config.y);expect(selected.y-body.y,'selected request stays beside the diagram').toBeLessThan(470);expect(waterfall.y-body.y,'waterfall is not pushed below the search').toBeLessThan(720);
}
function detailSpec(){const detail=nestedSpec(),d=detail.page.sections[0].diagram;detail.page.title='Loaded detail';detail.page.sections[0].heading='Imported detail';delete d.edges[0].telemetry;d.edges[0].curvePoints=[{t:.5,dx:0,dy:70}];
 d.nodes.local={title:'Local frontend'};d.rows.push(['local']);d.steps=[{id:'local',nodes:['local'],text:'Local checkout',traceMatch:{serviceName:'frontend',operation:'/cart/checkout',nodeId:'local'}},{id:'imported',edge:'outer::inner::a->outer::inner::b',text:'Imported currency',traceMatch:{serviceName:'currency',operation:'grpc.msdemo.CurrencyService/GetSupportedCurrencies',nodeId:'outer::inner::b'}}];return detail;}
async function portable(page,server,{held=false,absolute=false,inherited=false,duplicates=false}={}){
 await page.setViewportSize({width:1500,height:1100});const profile=clone(PROFILE),tools=[schema()],calls=[],permissions=[],releases=[];let hold=held,payload=RECORDED;
 if(absolute){profile.time={encoding:'iso8601',type:'string',defaultLookback:'2h'};profile.arguments.end='to';tools[0].inputSchema.properties.to={type:'string'};tools[0].inputSchema.required.push('to');}
 await page.exposeFunction('traceTools',()=>[{server:profile.server,tools:tools.map(t=>({name:t.name,annotations:t.annotations}))}]);
 await page.exposeFunction('traceDescribe',()=>tools[0]);await page.exposeFunction('tracePermission',keys=>{permissions.push(...keys);return Object.fromEntries(keys.map(k=>[k,'granted']));});
 await page.exposeFunction('traceCall',async(server,tool,args)=>{calls.push({server,tool,args});if(hold)await new Promise(resolve=>releases.push(resolve));return {payload};});
 const spec={page:{title:'Direct traces',tracking:{telemetry:{traceConnections:{company:profile,alternate:{...profile,label:'Alternate connection'}}}},sections:[{id:'main',diagram:{nodes:{parent:{title:'Imported service',detail:{spec:'approved-detail',revision:'r1',section:'main'}}},rows:[['parent']],panels:[PANEL]}}]}},detail=detailSpec();
 if(duplicates){const root=spec.page.sections[0].diagram;root.nodes.local={title:'Root decoy'};root.nodes['outer::inner::b']={title:'Duplicate imported ID'};root.rows.push(['local','outer::inner::b']);root.steps=clone(detail.page.sections[0].diagram.steps).map(step=>({...step,edge:undefined,nodes:['local']}));}
 await page.addInitScript(({detail})=>{
  window.claude={use:async name=>name==='permissions'?{request:keys=>window.tracePermission(keys)}:{listTools:()=>window.traceTools(),describeTool:()=>window.traceDescribe(),callTool:(s,n,a)=>window.traceCall(s,n,a)}};
  window.directDetail=detail;window.flowviewBooted=ctl=>{window.ctl=ctl;window.sourceBefore=JSON.stringify(window.directDetail);};
 },{detail});
 // #1095: no tracking at all; the live-status panel plus the node detail reference make this board use traces.
 if(inherited)delete spec.page.tracking;
 const file=path.join(server.root,'direct-trace.spec.json'),output=path.join(server.root,'direct-trace.html');await writeFile(file,JSON.stringify(spec));execFileSync('python3',[path.join(repo,'tools/inject.py'),file,path.join(repo,'template/flowview.html'),output],{stdio:'pipe'});
 let html=await readFile(output,'utf8');if(inherited)html=html.replace('var ctl = renderPage(view, page, bootSkin, backlinkData, renderOptions);','TELEMETRY_COMPANY_TRACE_CONNECTIONS='+JSON.stringify({company:profile,alternate:{...profile,label:'Alternate connection'}})+';\nvar ctl = renderPage(view, page, bootSkin, backlinkData, renderOptions);');html=html.replace('var ctl = renderPage(view, page, bootSkin, backlinkData, renderOptions);','renderOptions.loadDetail=async function(){await new Promise(function(resolve){setTimeout(resolve,20);});return window.directDetail;};\n  var ctl = renderPage(view, page, bootSkin, backlinkData, renderOptions);');await writeFile(output,html);
 await page.goto(server.origin+'/direct-trace.html');await page.waitForFunction(()=>!!window.ctl);await page.getByRole('button',{name:'Explore Imported service',exact:true}).click();const root=page.locator('[data-dv-detail-preview]:visible');await expect(root).toHaveCount(1);await onTrace(root);
 await root.getByRole('combobox',{name:'Trace connection',exact:true}).selectOption('company');await root.getByRole('combobox',{name:'Connection environment',exact:true}).selectOption('prod');
 const choices=await root.getByRole('combobox',{name:'Mapping diagram',exact:true}).locator('option').evaluateAll(nodes=>nodes.map(n=>({value:n.value,text:n.textContent}))),selected=choices.find(o=>o.text.includes('Loaded detail'));
 await root.getByRole('combobox',{name:'Mapping diagram',exact:true}).selectOption(selected.value);
 return {root,calls,permissions,choices,selected,release(){hold=false;releases.splice(0).forEach(fn=>fn());},tools,respond(value){payload=value;}};
}
test('desktop inherited-company direct-only read-only load maps local and nested imported nodes in the exact loaded section, with zero search/numeric calls',async({page,server},info)=>{
 const h=await portable(page,server,{inherited:true});await observeTraceReveals(page);expect(h.calls).toHaveLength(0);expect(h.permissions).toHaveLength(0);expect(await page.evaluate(()=>window.ctl.telemetry.enabled())).toBe(false);
 const time=h.root.locator('.dv-trace-time');await expect(time).toHaveJSProperty('open',false);await time.locator('summary').click();await h.root.getByRole('textbox',{name:'Trace start',exact:true}).fill('-2h');await time.locator('summary').click();
 const input=h.root.getByRole('textbox',{name:'Trace ID or link',exact:true});await input.fill(ID);expect(h.calls).toHaveLength(0);expect(h.permissions).toHaveLength(0);
 await h.root.getByRole('button',{name:'Load trace',exact:true}).click();await expect(h.root.locator('.dv-trace-selected')).toHaveAttribute('data-trace-id',ID);await expect(h.root.locator('.dv-trace-span')).toHaveCount(55);
 expect(h.calls).toEqual([{server:PROFILE.server,tool:'get_trace',args:{view_mode:'full',trace_id:ID,from:'-2h',environment_slug:'production',team_slug:'example-team'}}]);expect(h.permissions).toEqual(['mcp:'+PROFILE.server]);
 for(const id of ['local','outer::inner::b'])await expect(h.root.locator('g.node[data-dv-node="'+id+'"]')).toHaveAttribute('data-trace-tone','observed');
 await expect(h.root.locator('.dv-trace-direct-status')).toContainText('ID matched');await expect(h.root.locator('.dv-trace-direct-report')).toContainText('partial completeness');await expectCompactTrace(h.root);
 expect(await page.evaluate(()=>window.ctl.telemetry.snapshot().map)).toEqual({});expect(await page.evaluate(()=>window.ctl.telemetry.enabled())).toBe(false);expect(await page.evaluate(()=>JSON.stringify(window.directDetail)===window.sourceBefore)).toBe(true);
 expect(await h.root.evaluate(root=>window.traceReveals.length===1 && root.contains(window.traceReveals[0]))).toBe(true);await info.attach('direct-loaded-imported-viewport',{body:await page.screenshot(),contentType:'image/png'});
 await h.root.locator('.dv-trace-span').first().click();expect(await page.evaluate(()=>window.traceReveals.length)).toBe(1);
 await info.attach('direct-loaded-imported',{body:await h.root.screenshot(),contentType:'image/png'});
 await openTraceConfiguration(h.root);await h.root.getByRole('button',{name:'Verify trace connection',exact:true}).click();await expect.poll(()=>h.calls.length).toBe(2);await expect(h.root.locator('.dv-trace-direct-report')).toContainText('Stage: complete');await expect(h.root.locator('.dv-trace-diagnostics')).toHaveJSProperty('open',true);await expect(h.root.locator('.dv-trace-arguments')).toBeVisible();await expect(h.root.locator('.dv-trace-arguments')).toContainText('[configured]');expect(await page.evaluate(()=>window.traceReveals.length)).toBe(1);await info.attach('direct-verified-expanded',{body:await h.root.screenshot(),contentType:'image/png'});
 await h.root.getByRole('button',{name:'Clear loaded trace',exact:true}).click();await expect(h.root.locator('.dv-trace-selected')).toHaveCount(0);await expect(h.root.locator('[data-trace-tone]')).toHaveCount(0);expect(h.calls).toHaveLength(2);
});
test('desktop Load trace shows the active lookback, and a no-spans load names it and opens the Lookback section',async({page,server})=>{
 const h=await portable(page,server),note=h.root.locator('.dv-trace-lookback-note'),time=h.root.locator('.dv-trace-time'),status=h.root.locator('.dv-trace-direct-status'),input=h.root.getByRole('textbox',{name:'Trace ID or link',exact:true});
 await expect(note).toHaveText('Looks back 2h; change under Lookback.');await expect(time.locator('summary')).toHaveText('Lookback (optional)');await expect(time).toHaveJSProperty('open',false);
 h.respond('---\nMetadata:\n  environment: ms-demo\n  navigation_hints: no spans found\n  total_spans: 0\n  trace_id: '+ID+'\n  view_mode: full\n  visible_spans: 0\n');
 await input.fill('https://ui.honeycomb.io/example-team/environments/production/trace?trace_id='+ID+'&trace_start_ts=1791779586.602194688&trace_end_ts=1791779592.123456789');await expect(note).toHaveText("This link's time range cannot be used with this connection; paste the trace ID alone.");
 await input.fill(ID);await expect(note).toHaveText('Looks back 2h; change under Lookback.');await h.root.getByRole('button',{name:'Load trace',exact:true}).click();
 await expect(status).toHaveText('Trace not found in the last 2h. Try a longer lookback under Lookback.');await expect(time).toHaveJSProperty('open',true);
 // #1230 (Chuck: stacked, not beside): the error sits directly under the Load trace controls, inside the search.
 const placed=await h.root.locator('.dv-trace-direct-report').evaluate(r=>{const p=r.previousElementSibling,a=r.getBoundingClientRect(),b=p && p.getBoundingClientRect();
  return {inSearch:!!r.closest('details.dv-trace-config'),afterLoad:!!(p && p.querySelector('.dv-trace-load')),gap:b?a.top-b.bottom:null,overlap:b?Math.min(a.right,b.right)-Math.max(a.left,b.left):null,width:a.width};});
 expect([placed.inSearch,placed.afterLoad],'after the Load trace controls').toEqual([true,true]);expect(placed.gap,'directly below them').toBeGreaterThanOrEqual(-1);expect(placed.gap).toBeLessThanOrEqual(16);
 expect(placed.overlap,'stacked under them, not beside').toBeGreaterThan(placed.width*0.5);await expect(h.root.locator('.dv-trace-selected')).toHaveCount(0);expect(h.calls).toHaveLength(1);expect(h.calls[0].args.from).toBe('-2h');
 await time.locator('summary').click();await expect(time).toHaveJSProperty('open',false);await page.evaluate(()=>window.ctl.liveStatus.setStatusMode('jira'));await h.root.getByRole('button',{name:'Trace',exact:true}).click();
 await expect(status).toHaveText('Trace not found in the last 2h. Try a longer lookback under Lookback.');await expect(h.root.locator('.dv-trace-time')).toHaveJSProperty('open',false);await h.root.locator('.dv-trace-time > summary').click();
 await h.root.getByRole('textbox',{name:'Trace start',exact:true}).fill('-7d');await expect(note).toHaveText('Looks back 7d; change under Lookback.');
 const end=h.root.getByRole('textbox',{name:'Trace end',exact:true});await end.fill('2026-11-06T06:00:00Z');await expect(note).toHaveText('Uses the time set under Lookback.');await end.fill('');await expect(note).toHaveText('Looks back 7d; change under Lookback.');await expect(time).toHaveJSProperty('open',true);
 h.respond(RECORDED);await h.root.getByRole('button',{name:'Load trace',exact:true}).click();await expect(h.root.locator('.dv-trace-selected')).toHaveAttribute('data-trace-id',ID);expect(h.calls).toHaveLength(2);expect(h.calls[1].args.from).toBe('-7d');
});
for(const change of ['environment','connection','section'])test('desktop changing '+change+' cancels pending detail without fetching again',async({page,server})=>{
 const h=await portable(page,server,{held:true});await observeTraceReveals(page);await h.root.getByRole('textbox',{name:'Trace ID or link',exact:true}).fill(ID);await h.root.getByRole('button',{name:'Load trace',exact:true}).click();await expect.poll(()=>h.calls.length).toBe(1);await expect(h.root.getByRole('button',{name:'Cancel request',exact:true})).toBeVisible();
 if(change==='environment')await h.root.getByRole('combobox',{name:'Connection environment',exact:true}).selectOption('stage');
 if(change==='connection')await h.root.getByRole('combobox',{name:'Trace connection',exact:true}).selectOption('alternate');
 if(change==='section')await h.root.getByRole('combobox',{name:'Mapping diagram',exact:true}).selectOption(h.choices.find(o=>o.value && o.value!==h.selected.value).value);
 h.release();await expect(h.root.locator('.dv-trace-direct-report')).toHaveCount(0);await expect(h.root.locator('.dv-trace-selected')).toHaveCount(0);expect(h.calls).toHaveLength(1);expect(await page.evaluate(()=>window.ctl.telemetry.snapshot().map)).toEqual({});expect(await page.evaluate(()=>window.traceReveals.length)).toBe(0);
 if(change==='section')await expect(h.root.getByRole('textbox',{name:'Trace ID or link',exact:true})).toHaveValue(ID);
 else {await expect(h.root.getByRole('textbox',{name:'Trace ID or link',exact:true})).toHaveValue('');await expect(h.root.getByRole('button',{name:'Load trace',exact:true})).toBeDisabled();await expect(h.root.getByRole('button',{name:'Verify trace connection',exact:true})).toBeDisabled();}
 if(change==='environment'){await h.root.getByRole('textbox',{name:'Trace ID or link',exact:true}).fill(ID);await h.root.getByRole('button',{name:'Load trace',exact:true}).click();await expect(h.root.locator('.dv-trace-selected')).toHaveAttribute('data-trace-id',ID);expect(h.calls).toHaveLength(2);expect(h.calls[1].args.environment_slug).toBe('staging');}
});
test('desktop link bounds reach the detail tool exactly; mismatched environment and schema errors do not call',async({page,server})=>{
 const h=await portable(page,server,{absolute:true}),url='https://ui.honeycomb.io/example-team/environments/production/trace?trace_id='+ID+'&trace_start_ts=1791779586.602194688&trace_end_ts=1791779592.123456789';
 await h.root.getByRole('textbox',{name:'Trace ID or link',exact:true}).fill(url);await expect(h.root.locator('.dv-trace-lookback-note')).toHaveText('Uses the time range in the pasted link.');await h.root.getByRole('button',{name:'Verify trace connection',exact:true}).click();await expect(h.root.locator('.dv-trace-direct-report')).toContainText('Stage: complete');expect(h.calls).toHaveLength(1);expect(h.calls[0].args.from).toBe('2026-10-12T04:33:06.602194688Z');expect(h.calls[0].args.to).toBe('2026-10-12T04:33:12.123456789Z');
 await openTraceConfiguration(h.root);await h.root.getByRole('combobox',{name:'Connection environment',exact:true}).selectOption('stage');await expect(h.root.getByRole('button',{name:'Load trace',exact:true})).toBeDisabled();await h.root.getByRole('textbox',{name:'Trace ID or link',exact:true}).fill(url);await h.root.getByRole('button',{name:'Load trace',exact:true}).click();await expect(h.root.locator('.dv-trace-direct-status')).toContainText('conflicts with the selected environment');await expect(h.root.locator('.dv-trace-direct-status')).toBeVisible();expect(h.calls).toHaveLength(1);
 await h.root.getByRole('combobox',{name:'Connection environment',exact:true}).selectOption('prod');await h.root.getByRole('textbox',{name:'Trace ID or link',exact:true}).fill(url);h.tools[0].inputSchema.required.push('missing_company_field');await h.root.getByRole('button',{name:'Load trace',exact:true}).click();await expect(h.root.locator('.dv-trace-direct-report')).toContainText('missing required');expect(h.calls).toHaveLength(1);await expect(h.root.locator('.dv-trace-selected')).toHaveCount(0);
});
test('desktop native direct-only callbacks show an unmapped waterfall and reject late responses after destroy',async({page,server},info)=>{
 await page.setViewportSize({width:1500,height:1100});await writeFile(path.join(server.root,'direct-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));await writeFile(path.join(server.root,'direct-native.html'),'<div id="host"></div><script type="module">import {mountNativeViewer} from "./direct-native.js";window.mount=mountNativeViewer;</script>');await page.goto(server.origin+'/direct-native.html');await page.waitForFunction(()=>!!window.mount);
 await observeTraceReveals(page);
 const spec={page:{title:'Native direct',tracking:{telemetry:{traceConnections:{company:PROFILE}}},sections:[{id:'main',diagram:{nodes:{a:{title:'No mappings authored'}},rows:[['a']],panels:[PANEL]}}]}};
 await page.evaluate(({spec,tool,text})=>{window.nativeCalls=[];window.holdDirect=false;window.nativeViewer=window.mount(document.querySelector('#host'),spec,{telemetry:{directTrace:{describe:async()=>tool,call:async(request,args)=>{window.nativeCalls.push(args);if(window.holdDirect)await new Promise(resolve=>window.releaseDirect=resolve);return {payload:text};}}}});},{spec,tool:schema(),text:RECORDED});
 const root=page.locator('#host');await onTrace(root);await root.getByRole('combobox',{name:'Connection environment',exact:true}).selectOption('prod');await root.getByRole('textbox',{name:'Trace ID or link',exact:true}).fill(ID);await root.getByRole('button',{name:'Load trace',exact:true}).click();await expect(root.locator('.dv-trace-span')).toHaveCount(55);await expect(root).toContainText('Diagram mapping is not configured');expect(await page.evaluate(()=>window.nativeCalls.length)).toBe(1);expect(await page.evaluate(()=>window.nativeViewer.controller.telemetry.enabled())).toBe(false);await expectCompactTrace(root);await info.attach('native-direct-unmapped',{body:await root.screenshot(),contentType:'image/png'});
 expect(await page.evaluate(()=>window.traceReveals.length)).toBe(1);expect(await root.locator('.dv-trace-selected').evaluate(selected=>window.traceReveals[0]===selected)).toBe(true);await info.attach('native-direct-unmapped-viewport',{body:await page.screenshot(),contentType:'image/png'});
 await openTraceConfiguration(root);await page.evaluate(()=>window.holdDirect=true);await root.getByRole('button',{name:'Verify trace connection',exact:true}).click();await page.waitForFunction(()=>!!window.releaseDirect);await page.evaluate(()=>{window.nativeViewer.destroy();window.releaseDirect();});await expect(root.locator('.dv-trace-selected')).toHaveCount(0);expect(await page.evaluate(()=>window.traceReveals.length)).toBe(1);
 await page.evaluate(spec=>window.nativeViewer=window.mount(document.querySelector('#host'),spec,{}),spec);await onTrace(root);await expect(root).toContainText('Direct trace retrieval is unavailable');await expect(root.getByRole('button',{name:'Load trace',exact:true})).toBeDisabled();expect(await page.evaluate(()=>window.nativeCalls.length)).toBe(2);
});


test('desktop loaded detail span focus owns its exact source despite duplicate root node and step IDs',async({page,server},info)=>{
 const h=await portable(page,server,{duplicates:true});await h.root.getByRole('textbox',{name:'Trace ID or link',exact:true}).fill(ID);await h.root.getByRole('button',{name:'Load trace',exact:true}).click();
 await expect(h.root.locator('.dv-trace-selected')).toHaveAttribute('data-trace-id',ID);
 const span=await page.evaluate(()=>window.ctl.liveStatus.snapshot().trace.selected.exemplar.spans.find(s=>s.service==='currency' && s.name==='grpc.msdemo.CurrencyService/GetSupportedCurrencies').id);
 const before=await page.evaluate(()=>window.ctl.sections[0].stepper.current().id);
 const edge=h.root.locator('path.edge[data-dv-edge="0"]'),geometry=await edge.getAttribute('d'),arrow=await edge.getAttribute('marker-end');
 await h.root.locator('.dv-trace-span[data-span-id="'+span+'"]').click();
 await expect(h.root.locator('g.node[data-dv-node="outer::inner::b"]:not(.node-text)')).toHaveAttribute('data-trace-focus','true');
 expect(await page.evaluate(()=>window.ctl.details.activeSections()[1].stepper.current().id)).toBe('imported');expect(await page.evaluate(()=>window.ctl.sections[0].stepper.current().id)).toBe(before);
 await expect(h.root.locator('.dv-trace-edge-focus[data-trace-level="current"]')).toHaveCount(1);await expect(h.root.locator('.dv-trace-edge-focus[data-trace-level="current"] .dv-trace-edge-outline')).toHaveAttribute('d',geometry);await expect(edge).toHaveAttribute('marker-end',arrow);await expect(h.root.locator('.dv-trace-overlay[data-trace-edge="0"] text')).toHaveCSS('font-size','16px');
 await h.root.getByRole('button',{name:'Fit diagram',exact:true}).click();
 await expect.poll(()=>h.root.locator('.dv-trace-edge-focus[data-trace-level="current"]').evaluate(g=>{const box=g.getBoundingClientRect(),board=g.closest('.board'),frame=board.getBoundingClientRect(),toolbar=board.querySelector('.lg').getBoundingClientRect();return box.width>0 && box.left>=frame.left && box.right<=frame.right && box.top>=toolbar.bottom && box.bottom<=frame.bottom;})).toBe(true);
 await info.attach('trace-focus-exact-loaded-source',{body:await h.root.screenshot(),contentType:'image/png'});
 await page.evaluate(()=>{const selected=window.ctl.liveStatus.snapshot().trace.selected;window.oldSpanAction={context:selected.context,spanId:selected.focus.spanId};});
 await openTraceConfiguration(h.root);await h.root.getByRole('combobox',{name:'Mapping diagram',exact:true}).selectOption(h.choices.find(o=>o.value && o.value!==h.selected.value).value);
 expect(await page.evaluate(()=>window.ctl.liveStatus.selectTraceSpan(window.oldSpanAction))).toBe(false);await expect(h.root.locator('.dv-trace-focus-overlay[data-trace-level="current"],.dv-trace-edge-focus[data-trace-level="current"]')).toHaveCount(0);
});
