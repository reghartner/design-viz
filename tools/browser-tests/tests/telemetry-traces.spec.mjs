import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
import {createMockBridge,nativeQuery,EVENT_QUERY} from '../../../tests/helpers/honeycomb-bridge.mjs';
import {nestedSpec,PANEL} from '../helpers/telemetry-cards.mjs';
const metrics=root=>root.getByRole('button',{name:'Metrics',exact:true});
async function setup(page,server,{source='honeycomb',disabled,held=false}={}){
 const bridge=createMockBridge({day:9});let release,hold=held;const original=bridge.callTool;
 bridge.callTool=async(...args)=>{const result=await original(...args);if(hold&&args[1]==='get_trace')await new Promise(r=>release=r);return result;};
 await page.exposeFunction('mockTools',()=>bridge.listTools());await page.exposeFunction('mockCall',(s,n,a)=>bridge.callTool(s,n,a));
 const spec={page:{title:'Runtime traces',tracking:{telemetry:{enabled:disabled!=='page',honeycomb:{environment:'flowview-demo',dataset:'doorbell'},grafana:{prometheus:'prom-main',tempo:'tempo-main'}}},sections:[{id:'main',diagram:{nodes:{parent:{title:'Imported service',detail:{spec:'approved-detail',revision:'r1',section:'selected'}}},rows:[['parent']],panels:[PANEL]}}]}},detail=nestedSpec();
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
 const all=await page.evaluate(()=>window.ctl.telemetry.bindings().map(b=>({id:b.id,sample:window.ctl.telemetry.snapshot().map[b.id]})));expect(all.some(b=>b.id==='local')).toBe(true);for(const b of all)expect(b.sample?.exemplars?.length,b.id).toBe(1);
 const e=await page.evaluate(id=>window.ctl.telemetry.snapshot().map[id].exemplars[0],id),get=source==='tempo'?'get_tempo_trace':'get_trace',initial=h.bridge.calls.filter(c=>c.name===get).length;expect(initial).toBe(all.length);
 await page.evaluate(()=>{window.ctl.telemetry.snapshot();window.ctl.telemetry.verdicts();window.ctl.telemetry.retry();});await expect.poll(()=>page.evaluate(()=>window.ctl.telemetry.status().busy)).toBe(false);expect(h.bridge.calls.filter(c=>c.name===get)).toHaveLength(initial);
 const alternate=e.candidates.find(c=>c.traceId!==e.traceId);await page.evaluate(({id,e,alternate})=>window.ctl.telemetry.chooseExemplar(id,e.selectionToken,alternate.traceId),{id,e,alternate});expect(h.bridge.calls.filter(c=>c.name===get)).toHaveLength(initial+1);expect(await page.evaluate(id=>window.ctl.telemetry.snapshot().map[id].exemplars[0].traceId,id)).toBe(alternate.traceId);
 await root.getByRole('button',{name:'Over time',exact:true}).click();await expect(root.getByRole('slider',{name:'Day',exact:true})).toBeVisible();await expect.poll(()=>page.evaluate(()=>window.ctl.telemetry.status().busy)).toBe(false);expect(await page.evaluate(()=>Object.values(window.ctl.telemetry.snapshot().map).some(s=>s.exemplars?.length))).toBe(false);const count=h.bridge.calls.length;await root.getByRole('slider',{name:'Day',exact:true}).press('Home');expect(h.bridge.calls).toHaveLength(count);expect(h.bridge.calls.filter(c=>c.name===get)).toHaveLength(initial+1);
 expect(await page.evaluate(()=>JSON.stringify(window.detailFixture)===window.authoredBefore)).toBe(true);expect(await page.evaluate(()=>window.ctl.liveStatus.enabled())).toBe(true);
});
for(const disabled of ['page','host'])test(`desktop ${disabled} false prevents trace metadata and data calls through loaded imports`,async({page,server})=>{const h=await setup(page,server,{disabled});await expect(metrics(h.root)).toBeHidden();expect(h.bridge.lists).toBe(0);expect(h.bridge.calls).toHaveLength(0);});
test('desktop Metrics off discards actual late detail response',async({page,server})=>{const h=await setup(page,server,{held:true});await metrics(h.root).click();await expect.poll(()=>h.bridge.calls.filter(c=>c.name==='get_trace').length).toBe(1);await metrics(h.root).click();h.release();await expect.poll(()=>page.evaluate(()=>window.ctl.telemetry.status().busy)).toBe(false);expect(await page.evaluate(()=>window.ctl.telemetry.snapshot().map)).toEqual({});});
