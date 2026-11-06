import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
import {createMockBridge,nativeQuery,EVENT_QUERY,expected} from '../../../tests/helpers/honeycomb-bridge.mjs';
import {nestedSpec,PANEL,mountCues} from '../helpers/telemetry-cards.mjs';
const metrics=root=>root.getByRole('button',{name:'Metrics',exact:true});
async function setup(page,server,{source='honeycomb',disabled,held=false}={}){
 const bridge=createMockBridge({day:9});let release,hold=held;const original=bridge.callTool;
 bridge.callTool=async(...args)=>{const result=await original(...args);if(hold&&args[1]==='get_trace')await new Promise(r=>release=r);return result;};
 await page.exposeFunction('mockTools',()=>bridge.listTools());await page.exposeFunction('mockCall',(s,n,a)=>bridge.callTool(s,n,a));
 const spec={page:{title:'Runtime traces',tracking:{telemetry:{enabled:disabled!=='page',window:' now-6h ',honeycomb:{environment:'flowview-demo',dataset:'doorbell'},grafana:{prometheus:'prom-main',tempo:'tempo-main'}}},sections:[{id:'main',diagram:{nodes:{parent:{title:'Imported service',detail:{spec:'approved-detail',revision:'r1',section:'selected'}}},rows:[['parent']],panels:[PANEL]}}]}},detail=nestedSpec();
 detail.page.sections[0].id='selected';
 const trace=source==='tempo'?{tempo:'{ resource.service.name = "event-ingest" }'}:{honeycomb:{query_spec:{filters:[{column:'service.name',op:'=',value:'event-ingest'}]},raw_row_columns:['trace.trace_id','timestamp','error'],results_limit:20}};
 function bind(v){if(!v||typeof v!=='object')return;if(v.telemetry?.signals){v.telemetry.signals={rate:{grafana:EVENT_QUERY},scalar:{honeycomb:nativeQuery()},trace};v.telemetry.proof={rate:{min:1}};v.tickets=['TRACE-1'];}Object.values(v).forEach(bind);}bind(detail);
 // Include a local node as well as nested imported nodes and edges in the
 // actual asynchronously loaded selected detail.
 detail.page.sections[0].diagram.nodes.local={title:'Local',tickets:['TRACE-1'],telemetry:{kind:'service',signals:{trace}}};detail.page.sections[0].diagram.rows.push(['local']);
 await page.addInitScript(({detail,disabled})=>{
  Date.now=()=>Date.parse('2026-10-30T00:00:00Z');if(disabled==='host')window.flowviewTelemetry=false;
  window.flowviewLiveStatus={provider:async()=>({'TRACE-1':{state:'done'}})};
  window.claude={use:async()=>({listTools:()=>window.mockTools(),callTool:(s,n,a)=>window.mockCall(s,n,a)})};window.detailFixture=detail;
  window.flowviewBooted=ctl=>{window.ctl=ctl;window.authoredBefore=JSON.stringify(window.detailFixture);ctl.liveStatus.setHistory({load:()=>({days:[{key:'2026-10-28',at:'2026-10-29T00:00:00Z',label:'Earlier',states:{'TRACE-1':{state:'active'}}},{key:'2026-10-29',at:'2026-10-30T00:00:00Z',label:'Today',states:{'TRACE-1':{state:'done'}}}],index:1})});};
 },{detail,disabled});
 const file=path.join(server.root,'trace.spec.json'),out=path.join(server.root,'trace.html');await writeFile(file,JSON.stringify(spec));execFileSync('python3',[path.join(repo,'tools/inject.py'),file,path.join(repo,'template/flowview.html'),out],{stdio:'pipe'});
 let html=await readFile(out,'utf8');html=html.replace('var ctl = renderPage(view, page, bootSkin, backlinkData, renderOptions);','renderOptions.loadDetail=async function(ref){window.loadedDetail=ref;await new Promise(function(resolve){setTimeout(resolve,25);});window.detailResolved=true;return window.detailFixture;};\n  var ctl = renderPage(view, page, bootSkin, backlinkData, renderOptions);');await writeFile(out,html);
 await page.goto(server.origin+'/trace.html');await page.waitForFunction(()=>!!window.ctl);await page.locator('#docview').getByRole('button',{name:'Explore Imported service',exact:true}).click();await page.waitForFunction(()=>window.detailResolved);const root=page.locator('[data-dv-detail-preview]:visible');await expect(root).toHaveCount(1);
 return {root,bridge,release(){hold=false;release?.();}};
}
for(const source of ['honeycomb','tempo'])test(`desktop ${source} runtime API through real async nested import, cached alternate and Over time`,async({page,server})=>{
 const h=await setup(page,server,{source}),root=h.root,id='outer::inner::a->outer::inner::b';await expect(metrics(root)).toHaveAttribute('aria-pressed','false');expect(h.bridge.calls).toHaveLength(0);await metrics(root).click();
 await expect.poll(()=>page.evaluate(id=>window.ctl.telemetry.snapshot().map[id]?.exemplars?.length,id)).toBe(1);
 await expect(root.locator('g.node[data-dv-node="local"] .dv-metrics-node')).toHaveCount(0);expect(await page.evaluate(()=>window.ctl.telemetry.verdicts().carriers.local.bound)).toBe(false);
 const all=await page.evaluate(()=>window.ctl.telemetry.bindings().map(b=>({id:b.id,sample:window.ctl.telemetry.snapshot().map[b.id]})));expect(all.some(b=>b.id==='local')).toBe(true);for(const b of all)expect(b.sample?.exemplars?.length,b.id).toBe(1);
 const e=await page.evaluate(id=>window.ctl.telemetry.snapshot().map[id].exemplars[0],id),get=source==='tempo'?'get_tempo_trace':'get_trace',initial=h.bridge.calls.filter(c=>c.name===get).length;expect(initial).toBe(all.length);
 await page.evaluate(()=>{window.ctl.telemetry.snapshot();window.ctl.telemetry.verdicts();window.ctl.telemetry.retry();});await expect.poll(()=>page.evaluate(()=>window.ctl.telemetry.status().busy)).toBe(false);expect(h.bridge.calls.filter(c=>c.name===get)).toHaveLength(initial);
 const search=source==='tempo'?'search_tempo_traces':'run_query';for(const call of h.bridge.calls.filter(c=>c.name===search||c.name===get)){if(source==='honeycomb'){expect(call.name===get?call.args.from:call.args.query_spec.from).toBe('-6h');if(call.args.raw_row_columns)expect(call.args.raw_row_columns).not.toContain('timestamp');}else{expect(call.args.start).toBe('2026-10-29T18:00:00.000Z');expect(call.args.end).toBe('2026-10-30T00:00:00.000Z');}}
 await root.getByRole('button',{name:/^Trace(?: · \d+)?$/}).click();const key=await page.evaluate(id=>window.ctl.liveStatus.snapshot().trace.entries.find(e=>e.carrier===id).key,id);await root.getByRole('combobox',{name:'Trace source'}).selectOption(key);
 const alternate=e.candidates.find(c=>c.traceId!==e.traceId);await root.locator('.dv-trace-candidate[data-trace-id="'+alternate.traceId+'"]').click();await expect(root.locator('.dv-trace-selected')).toHaveAttribute('data-trace-id',alternate.traceId);await expect(root.locator('.dv-live-tickets,.dv-live-proof,.dv-live-activity')).toHaveCount(0);await root.getByRole('button',{name:'Jira',exact:true}).click();expect(h.bridge.calls.filter(c=>c.name===get)).toHaveLength(initial+1);expect(await page.evaluate(id=>window.ctl.telemetry.snapshot().map[id].exemplars[0].traceId,id)).toBe(alternate.traceId);
 // Honeycomb uses run_query for both numeric calculations and raw trace rows.
 // Date changes may fetch the former, but must never fetch the latter.
 const query=call=>typeof call.args.query_spec==='string'?JSON.parse(call.args.query_spec):call.args.query_spec;
 const numericHoneycomb=call=>call.name==='run_query'&&Array.isArray(query(call)?.calculations)&&!call.args.raw_row_columns;
 const traceCall=call=>['get_trace','get_tempo_trace','search_tempo_traces'].includes(call.name)||call.name==='run_query'&&!numericHoneycomb(call);
 const traceBefore=h.bridge.calls.filter(traceCall),start=h.bridge.calls.length,slider=root.getByRole('slider',{name:'Day',exact:true});
 function numericWindow(after,to){
  const calls=h.bridge.calls.slice(after),from=new Date(Date.parse(to)-6*3600000).toISOString(),honey=calls.filter(numericHoneycomb),prom=calls.filter(c=>c.name==='query_prometheus');
  expect(honey.length).toBeGreaterThan(0);expect(prom.length).toBeGreaterThan(0);
  for(const c of honey)expect(query(c)).toMatchObject({from,to,calculations:nativeQuery().calculations});
  for(const c of prom)expect(c.args).toMatchObject({startTime:from,endTime:to});
  expect(h.bridge.calls.filter(traceCall)).toEqual(traceBefore);
 }
 async function withoutTraceEvidence(to){
  await expect.poll(()=>page.evaluate(()=>window.ctl.telemetry.status().busy)).toBe(false);
  const snapshot=await page.evaluate(()=>window.ctl.telemetry.snapshot());
  expect(snapshot.window).toEqual({from:new Date(Date.parse(to)-6*3600000).toISOString(),to});
  expect(Object.values(snapshot.map).some(s=>s.exemplars?.length)).toBe(false);expect(h.bridge.calls.filter(traceCall)).toEqual(traceBefore);
  await expect(root.locator('.dv-trace-selected,.dv-trace-candidate,[data-metrics-card="local"]')).toHaveCount(0);
  await expect(root.locator('g.node[data-dv-node="local"] .dv-metrics-node')).toHaveCount(0);
  return snapshot;
 }
 await root.getByRole('button',{name:'Over time',exact:true}).click();await expect(slider).toHaveValue('1');
 await expect.poll(()=>page.evaluate(id=>window.ctl.telemetry.snapshot().map[id]?.signals.scalar?.value,id)).toBe(expected(9,'mcu->ingest',6));
 let historic=await withoutTraceEvidence('2026-10-30T00:00:00.000Z');numericWindow(start,'2026-10-30T00:00:00.000Z');expect(historic.map[id].signals.rate.value).toBeGreaterThan(0);
 const count=h.bridge.calls.length;await slider.press('Home');await expect(slider).toHaveValue('0');
 historic=await withoutTraceEvidence('2026-10-29T00:00:00.000Z');numericWindow(count,'2026-10-29T00:00:00.000Z');
 expect(expected(8,'mcu->ingest',6)).toBeUndefined();expect(historic.map[id]?.signals.scalar).toBeUndefined();expect(historic.map[id]?.signals.rate).toBeUndefined();
 await expect(root.locator('[data-metrics-card="'+id+'"] .dv-metrics-card-value')).toHaveText(['unobserved','unobserved']);
 await root.screenshot({path:'/tmp/pr4-traces-'+source+'-numeric-history.png'});
 const cached=h.bridge.calls.length;await slider.press('End');await expect.poll(()=>page.evaluate(id=>window.ctl.telemetry.snapshot().map[id]?.signals.scalar?.value,id)).toBe(expected(9,'mcu->ingest',6));await withoutTraceEvidence('2026-10-30T00:00:00.000Z');expect(h.bridge.calls).toHaveLength(cached);expect(h.bridge.calls.filter(c=>c.name===get)).toHaveLength(initial+1);
 expect(await page.evaluate(()=>JSON.stringify(window.detailFixture)===window.authoredBefore)).toBe(true);expect(await page.evaluate(()=>window.ctl.liveStatus.enabled())).toBe(true);
});
for(const disabled of ['page','host'])test(`desktop ${disabled} false prevents trace metadata and data calls through loaded imports`,async({page,server})=>{const h=await setup(page,server,{disabled});await expect(metrics(h.root)).toBeHidden();expect(h.bridge.lists).toBe(0);expect(h.bridge.calls).toHaveLength(0);});
test('desktop Metrics off discards actual late detail response',async({page,server})=>{const h=await setup(page,server,{held:true});await metrics(h.root).click();await expect.poll(()=>h.bridge.calls.filter(c=>c.name==='get_trace').length).toBe(1);await metrics(h.root).click();h.release();await expect.poll(()=>page.evaluate(()=>window.ctl.telemetry.status().busy)).toBe(false);expect(await page.evaluate(()=>window.ctl.telemetry.snapshot().map)).toEqual({});});


test('desktop native host preload rejects incompatible absolute clocks while preserving measured zero and valid sub-ms spans',async({page,server})=>{
 await mountCues(page,server);
 const result=await page.evaluate(()=>{
  const api=window.viewer.controller.telemetry,ids=api.bindings().map(b=>b.id),time='2026-10-12T04:33:06.602Z';
  const span={id:'1111111111111111',parentId:null,service:'checkout',name:'send',startMs:0,ms:.000001,error:false,time,attributes:{},events:[],links:[]};
  const e={version:1,provider:'honeycomb',traceId:'a'.repeat(32),signal:'trace',selectionToken:'host-clock-test',selectionReason:'synthetic host fixture',observedAt:'2026-10-12T06:00:00Z',range:{from:'2026-10-12T00:00:00Z',to:'2026-10-12T06:00:00Z'},completeness:'unknown',warnings:[],candidates:[{traceId:'a'.repeat(32),status:'unknown'}],spans:[span,{...span,id:'2222222222222222',parentId:span.id,startMs:.000001}]};
  const apply=value=>api.apply(Object.fromEntries(ids.map(id=>[id,{signals:{rate:{value:0}},exemplars:[value]}])));
  apply(e);const valid=ids.map(id=>({id,offset:api.snapshot().map[id].exemplars[0].spans[1].startMs}));
  const rejected=[];for(const bad of [()=>{e.spans[1].time='2026-10-15T04:33:06.602Z';},()=>{e.spans[1].time=time;e.spans[1].ms=86400000;}]){bad();apply(e);rejected.push(ids.every(id=>{const s=api.snapshot().map[id];return s.signals.rate.value===0 && s.exemplars.length===0;}));}
  const off=api.enabled()===false;e.spans[1].ms=.000001;api.setEnabled(false);apply(e);
  return {valid,rejected,off,retired:Object.keys(api.snapshot().map).length===0};
 });
 expect(result.valid.some(x=>x.id.includes('::'))).toBe(true);expect(result.valid.length).toBeGreaterThan(1);for(const s of result.valid)expect(s.offset,s.id).toBe(.000001);
 expect(result.rejected).toEqual([true,true]);expect(result.off).toBe(true);expect(result.retired).toBe(true);
});
