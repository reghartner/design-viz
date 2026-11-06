import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
import {createMockBridge,nativeQuery,EVENT_QUERY,expected} from '../../../tests/helpers/honeycomb-bridge.mjs';
import {cueSpec,nestedSpec,importedDetailSpec,PANEL} from '../helpers/telemetry-cards.mjs';
const RAW='https://mcp.honeycomb.io/query_results/SYNTHETIC_BROWSER_TEST_ONLY';
const recorded=await readFile(path.join(repo,'tests/fixtures/honeycomb/recorded-query-response-redacted.txt'),'utf8');
const metadata=recorded.replace('https://mcp.honeycomb.io/query_results/REDACTED_EXPIRED_TOKEN',RAW);
const metrics=root=>root.getByRole('button',{name:'Metrics',exact:true});
async function setup(page,server,audit,{disabled,missing=false,detail=false,nested=false,mode='ok',real=null}={}){
 let bridge=real?createMockBridge(real):null;
 if(bridge){await page.exposeFunction('mockTools',()=>bridge.listTools());await page.exposeFunction('mockCall',(server,tool,input)=>bridge.callTool(server,tool,input));}
 let requests=0,release,redirectRequests=0;page.on('request',request=>{if(request.url()==='https://mcp.honeycomb.io/query_results/UNEXPECTED_REDIRECT')redirectRequests++;});
 if(mode==='http-error'||mode==='redirect')audit.allowStatus(mode==='redirect'?302:403,url=>url===RAW || mode==='redirect'&&url==='https://mcp.honeycomb.io/query_results/UNEXPECTED_REDIRECT');
 await audit.mockExternal(RAW,async route=>{requests++;if(mode==='http-error'||mode==='redirect'){await route.fulfill({status:mode==='redirect'?302:403,headers:{'access-control-allow-origin':'*',...(mode==='redirect'?{location:'https://mcp.honeycomb.io/query_results/UNEXPECTED_REDIRECT'}:{})},body:''});return;}if(mode==='held'){audit.allowAbort(route.request());await new Promise(r=>release=r);}if(mode==='failure'){await route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:'{}'});return;}await route.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({results:[{data:{'P95(duration_ms)':12.3456789}}],series:[{data:{time:'2026-10-12T06:30:00Z','P95(duration_ms)':12.3456789}}],info:{granularity_seconds:1800}})});});
 let spec=detail?{page:{title:'Real selected detail',sections:[{id:'main',diagram:{nodes:{parent:{title:'Imported service',detail:{spec:'approved-detail',revision:'r1',section:'selected'}}},rows:[['parent']],panels:[PANEL]}}]}}:nested?nestedSpec():cueSpec();
 if(nested)spec.page.sections[0].diagram.edges[0].tickets=['NEST-1'];
 function bind(value){if(!value||typeof value!=='object')return;if(value.telemetry?.signals){value.telemetry.signals.latency={honeycomb:{calculations:[{op:'P95',column:'duration_ms'}],filters:[{column:'service.name',op:'=',value:'EXPLICIT_FILTER'}]},unit:'ms'};if(mode.startsWith('blocked')){value.telemetry.signals.latency.honeycomb.calculations=[{op:'COUNT'}];value.telemetry.signals.latency.unit='events';value.telemetry.signals.rate=structuredClone(value.telemetry.signals.latency);}}Object.values(value).forEach(bind);}
 const detailSpec=real&&detail?nestedSpec():importedDetailSpec();
 if(real&&detail){const selected=detailSpec.page.sections[0];selected.id='selected';selected.heading='Selected nested imported detail';for(const node of Object.values(selected.diagram.nodes)){node.telemetry={kind:'service',signals:{}};node.tickets=['NEST-1'];}selected.diagram.edges[0].tickets=['NEST-1'];detailSpec.page.sections.unshift({id:'decoy',heading:'Wrong unselected detail',diagram:{nodes:{wrong:{title:'Wrong'}},rows:[['wrong']]}});}
 bind(spec);bind(detailSpec);
 if(real){function mockBindings(v){if(!v||typeof v!=='object')return;if(v.telemetry?.signals){v.telemetry.signals={rate:{grafana:EVENT_QUERY,unit:'req/h'},latency:{honeycomb:nativeQuery(),unit:'req/h'},push:{honeycomb:nativeQuery('notify->app'),unit:'req/h'}};if(real.clockRegression)v.telemetry.signals={rate:{honeycomb:nativeQuery(real.zero?'notify->app':'mcu->ingest'),unit:'req/h'},peer:{grafana:EVENT_QUERY,unit:'req/h'}};v.telemetry.proof={rate:{min:1}};}Object.values(v).forEach(mockBindings);}mockBindings(spec);mockBindings(detailSpec);}

 const keys=new Set();function tickets(v){if(!v||typeof v!=='object')return;(v.tickets||[]).forEach(k=>keys.add(k));Object.values(v).forEach(tickets);}tickets(spec);tickets(detailSpec);const jira=Object.fromEntries([...keys].map(k=>[k,{state:'done',...(real?.clockRegression?{updatedAt:'2026-10-30T23:00:00Z'}:{})}]));
 spec.page.tracking={telemetry:{enabled:disabled!=='page',grafana:{prometheus:'real-uid'},honeycomb:{environment:'prod',dataset:'events'}}};
 if(real){spec.page.tracking.telemetry.honeycomb={environment:'flowview-demo',dataset:'doorbell'};spec.page.tracking.telemetry.grafana.prometheus='prom-main';spec.page.tracking.telemetry.window=real.window||'24h';}
 const specPath=path.join(server.root,'mixed.spec.json'),out=path.join(server.root,'mixed.html');await writeFile(specPath,JSON.stringify(spec));execFileSync('python3',[path.join(repo,'tools/inject.py'),specPath,path.join(repo,'template/flowview.html'),out],{stdio:'pipe'});
 await page.addInitScript(({metadata,disabled,missing,RAW,detailSpec,jira,real,mode})=>{
  window.calls=[];window.rawOptions=[];window.rawAborts=0;window.metadataCalls=0;window.signedInChanged=false;
  if(disabled==='host')window.flowviewTelemetry=false;
  // A real host-provider boundary supplies independent synthetic Jira evidence.
  // Without a ticket map, Over time deliberately has no UI to open.
  window.jiraCalls=0;window.flowviewLiveStatus={provider:async()=>{window.jiraCalls++;return jira;}};
  const nativeFetch=window.fetch.bind(window);window.fetch=(url,options)=>{if(url===RAW){if(mode==='blocked'||mode==='blocked-zero'||mode==='blocked-missing')return Promise.reject(new TypeError('Failed to fetch'));window.rawOptions.push({credentials:options.credentials,referrerPolicy:options.referrerPolicy,redirect:options.redirect});options.signal.addEventListener('abort',()=>window.rawAborts++);}return nativeFetch(url,options);};
  const schema={type:'object',properties:{environment_slug:{type:'string'},dataset_slug:{type:['null','string']},query_spec:{type:'string'}},required:['environment_slug','query_spec']};
  window.claude={use:async name=>name==='mcp'?{listTools:async()=>{window.metadataCalls++;if(real)return window.mockTools();return missing?[]:[{server:'Grafana',tools:['query_prometheus','query_loki_logs','search_tempo_traces','get_annotations','generate_deeplink']},{server:'Honeycomb',tools:[{name:'run_query',description:'Run a query',annotations:{readOnlyHint:true}}]}];},describeTool:async(server,tool)=>({name:tool,inputSchema:schema}),callTool:async(server,tool,input,options)=>{
   window.calls.push({server,tool,input});if(window.signedInChanged)throw {code:'user_changed'};if(real)return window.mockCall(server,tool,input);
   if(tool==='run_query')return {payload:metadata};
   if(tool==='query_prometheus'){const t=input.startTime.startsWith('now')?Date.parse('2026-10-12T06:30:00Z'):Date.parse(input.startTime),end=input.endTime.startsWith('now')?t:Date.parse(input.endTime),values=[];for(let at=t;at<=end;at+=86400000)values.push([at/1000,'42']);return {payload:{data:[{values}]}};}
   return {payload:[]};
  }}:name==='permissions'?{request:async names=>Object.fromEntries(names.map(n=>[n,'granted']))}:null};
  window.flowviewBooted=ctl=>{window.ctl=ctl;ctl.liveStatus.setHistory({load:()=>({days:[0,1].map(i=>({key:real?'2026-10-'+(30+i):'2026-10-'+(10+i),at:new Date(Date.parse(real?'2026-10-31T00:00:00Z':'2026-10-11T06:30:00Z')+i*86400000).toISOString(),label:'Day '+i,states:Object.fromEntries(Object.keys(jira).map(k=>[k,{state:i===0?'active':'done'}]))})),index:1})});};
  // Standalone exposes its production globals; the real detail loader is
  // supplied at render boundary, then the user gesture selects the section.
  window.detailFixture=detailSpec;
 },{metadata:mode.startsWith('blocked')?metadata.replaceAll('error_rate_pct','COUNT').replace('| 5.00 |',mode==='blocked-zero'?'| 0 |':mode==='blocked-missing'?'| — |':'| 104084 |'):mode==='bad-url'?metadata.replace(RAW,'https://example.invalid/forbidden-result'):metadata,disabled,missing,RAW,detailSpec,jira,real:!!real,mode});
 if(detail){let html=await readFile(out,'utf8');html=html.replace('var ctl = renderPage(view, page, bootSkin, backlinkData, renderOptions);','renderOptions.loadDetail=async function(ref){window.loadedDetail=ref;await new Promise(function(resolve){setTimeout(resolve,25);});window.detailResolved=true;return window.detailFixture;};\n  var ctl = renderPage(view, page, bootSkin, backlinkData, renderOptions);');await writeFile(out,html);}
 await page.goto(server.origin+'/mixed.html');await page.waitForFunction(()=>!!window.ctl && Object.keys(window.ctl.liveStatus.snapshot().states).length>0);let root=page.locator('#docview');
 if(detail){await root.getByRole('button',{name:'Explore Imported service',exact:true}).click();root=root.locator('[data-dv-detail-preview]:visible');await expect(root).toHaveCount(1);expect(await page.evaluate(()=>window.loadedDetail.section)).toBe('selected');}
 return {root,bridge,requests:()=>requests,redirectRequests:()=>redirectRequests,release:()=>release?.()};
}
for(const shape of ['direct','nested','detail'])test('desktop mixed '+shape+': real fetch, Metrics and Over time retain independent evidence',async({page,server,audit})=>{
 const h=await setup(page,server,audit,{nested:shape==='nested',detail:shape==='detail'}),root=h.root;
 await expect(metrics(root)).toHaveAttribute('aria-pressed','false');expect(await page.evaluate(()=>window.calls.length)).toBe(0);await metrics(root).click();
 const id=shape==='nested'?'outer::inner::a->outer::inner::b':'shared::api->shared::store';
 await expect.poll(()=>page.evaluate(id=>window.ctl.telemetry.snapshot().map[id]?.signals.latency?.value,id)).toBe(12.3456789);
 expect(await page.evaluate(id=>window.ctl.telemetry.snapshot().map[id].signals.rate.value,id)).toBe(42);
 expect(await page.evaluate(()=>{const map=window.ctl.telemetry.snapshot().map;return window.ctl.telemetry.bindings().filter(b=>b.signals.latency).every(b=>map[b.id]?.signals.latency?.value===12.3456789);})).toBe(true);
 await expect(root.locator('[data-metrics-card="'+id+'"]')).toContainText('42');expect(h.requests()).toBeGreaterThan(0);
 expect(await page.evaluate(()=>window.rawOptions.every(o=>o.credentials==='omit'&&o.redirect==='error'&&o.referrerPolicy==='no-referrer'))).toBe(true);
 const before=await page.evaluate(()=>window.calls.filter(c=>c.tool==='run_query').length);
 await root.getByRole('button',{name:'Over time',exact:true}).click();await expect(root.getByRole('slider',{name:'Day',exact:true})).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>window.ctl.telemetry.status().busy)).toBe(false);
 expect(await page.evaluate(id=>window.ctl.telemetry.snapshot().map[id]?.signals.latency,id)).toBeUndefined();expect(await page.evaluate(()=>window.ctl.telemetry.status().note)).toContain('Honeycomb historical metrics unsupported');
 const count=await page.evaluate(()=>window.calls.length);await root.getByRole('slider',{name:'Day',exact:true}).press('Home');expect(await page.evaluate(()=>window.calls.length)).toBe(count);expect(await page.evaluate(()=>window.calls.filter(c=>c.tool==='run_query').length)).toBe(before);
 await root.getByRole('button',{name:'Live',exact:true}).click();await expect.poll(()=>page.evaluate(id=>window.ctl.telemetry.snapshot().map[id]?.signals.latency?.value,id)).toBe(12.3456789);
 await metrics(root).click();await expect(root.locator('.dv-metrics-card')).toHaveCount(0);expect(await page.evaluate(()=>window.ctl.liveStatus.enabled())).toBe(true);expect(await page.evaluate(()=>JSON.stringify(window.ctl.telemetry.snapshot()).includes('SYNTHETIC_BROWSER'))).toBe(false);
});
for(const disabled of ['page','host','missing'])test('desktop '+disabled+' hides Metrics and leaves Over time usable',async({page,server,audit})=>{const {root}=await setup(page,server,audit,{disabled,missing:disabled==='missing'});await expect(metrics(root)).toBeHidden();await root.getByRole('button',{name:'Over time',exact:true}).click();await expect(root.getByRole('slider',{name:'Day',exact:true})).toBeVisible();expect(await page.evaluate(()=>window.calls.length)).toBe(0);if(disabled!=='missing')expect(await page.evaluate(()=>window.metadataCalls)).toBe(0);});
test('desktop completed-but-missing raw result keeps Grafana evidence',async({page,server,audit})=>{const {root}=await setup(page,server,audit,{mode:'failure'});await metrics(root).click();await expect.poll(()=>page.evaluate(()=>window.ctl.telemetry.status().busy)).toBe(false);const s=await page.evaluate(()=>window.ctl.telemetry.snapshot());expect(s.map['shared::api'].signals.rate.value).toBe(42);expect(s.map['shared::api'].signals.latency).toBeUndefined();expect(s.status.note).toContain('missing or ambiguous');});
test('desktop Metrics off aborts actual raw fetch and drops its late result',async({page,server,audit})=>{const h=await setup(page,server,audit,{mode:'held'});await metrics(h.root).click();await expect.poll(h.requests).toBeGreaterThan(0);await metrics(h.root).click();await expect.poll(()=>page.evaluate(()=>window.rawAborts)).toBeGreaterThan(0);h.release();await expect(h.root.locator('.dv-metrics-card')).toHaveCount(0);expect(await page.evaluate(()=>window.ctl.telemetry.snapshot().map)).toEqual({});});

for(const mode of ['bad-url','redirect','http-error'])test('desktop raw transport '+mode+' is unobserved and preserves peer',async({page,server,audit})=>{const h=await setup(page,server,audit,{mode});await metrics(h.root).click();await expect.poll(()=>page.evaluate(()=>window.ctl.telemetry.status().busy)).toBe(false);const s=await page.evaluate(()=>window.ctl.telemetry.snapshot());expect(s.map['shared::api'].signals.rate.value).toBe(42);expect(s.map['shared::api'].signals.latency).toBeUndefined();expect(s.status.note).toMatch(/formatted Results header/);expect(h.requests()).toBe(mode==='bad-url'?0:5);expect(h.redirectRequests()).toBe(0);expect(JSON.stringify(s)).not.toContain('SYNTHETIC_BROWSER');});
test('desktop account change retires all mixed samples',async({page,server,audit})=>{const {root}=await setup(page,server,audit);await metrics(root).click();await expect.poll(()=>page.evaluate(()=>window.ctl.telemetry.snapshot().map['shared::api']?.signals.latency?.value)).toBe(12.3456789);await metrics(root).click();await page.evaluate(()=>window.signedInChanged=true);await metrics(root).click();await expect(metrics(root)).toBeHidden();expect(await page.evaluate(()=>window.ctl.telemetry.snapshot().map)).toEqual({});expect(await page.evaluate(()=>window.ctl.liveStatus.enabled())).toBe(true);});

for(const shape of ['direct','nested','detail'])test('actual mock '+shape+': native from and exact mixed values coexist with Jira Over time',async({page,server,audit})=>{
 const h=await setup(page,server,audit,{real:{day:11},nested:shape==='nested',detail:shape==='detail'}),root=h.root;
 const id=shape==='direct'?'shared::api->shared::store':'outer::inner::a->outer::inner::b';
 await expect(metrics(root)).toHaveAttribute('aria-pressed','false');expect(h.bridge.calls).toHaveLength(0);
 if(shape==='detail'){expect(await page.evaluate(()=>window.detailResolved)).toBe(true);await expect(root.locator('.sec-h')).toHaveText('Selected nested imported detail');expect(await page.evaluate(()=>window.loadedDetail)).toMatchObject({section:'selected',revision:'r1'});}
 await metrics(root).click();await expect.poll(()=>page.evaluate(id=>window.ctl.telemetry.snapshot().map[id]?.signals.latency?.value,id)).toBe(expected());
 const bound=await page.evaluate(()=>{const c=window.ctl;return c.telemetry.bindings().filter(b=>b.signals.latency).map(b=>({id:b.id,sample:c.telemetry.snapshot().map[b.id]}));});
 for(const b of bound){expect(b.sample,'all applicable loaded carriers have exact mock evidence').toBeDefined();expect(b.sample.signals.latency.value).toBe(expected());expect(b.sample.signals.push.value).toBe(0);expect(b.sample.signals.rate.value).toBeGreaterThan(0);}
 expect(bound.some(b=>b.id===id)).toBe(true);expect(await page.evaluate(()=>window.ctl.liveStatus.snapshot().metrics.source)).toBe('Grafana / Honeycomb');expect(h.requests()).toBe(0);expect(h.bridge.lists).toBeGreaterThan(0);
 for(const c of h.bridge.calls.filter(c=>c.name==='run_query')){expect(c.args.query_spec.from).toBe('-24h');expect(c.args.query_spec.time_range).toBeUndefined();expect(c.args.query_spec.calculations).toEqual(nativeQuery().calculations);}
 const hc=h.bridge.calls.filter(c=>c.name==='run_query').length;
 await root.getByRole('button',{name:'Over time',exact:true}).click();await expect(root.getByRole('slider',{name:'Day',exact:true})).toBeVisible();await expect.poll(()=>page.evaluate(()=>window.ctl.telemetry.status().busy)).toBe(false);
 const historic=await page.evaluate(()=>({metrics:window.ctl.telemetry.snapshot(),jira:window.ctl.liveStatus.snapshot()}));
 expect(historic.jira.overTime).toMatchObject({active:true,index:1,label:'Day 1'});expect(Object.values(historic.jira.states).every(v=>v.state==='done')).toBe(true);expect(historic.metrics.at).toBe('2026-11-01T00:00:00.000Z');expect(historic.metrics.map[id]?.signals.latency).toBeUndefined();expect(historic.metrics.map[id]?.signals.rate.value).toBeGreaterThan(0);
 expect(await page.evaluate(()=>window.ctl.telemetry.status().note)).toContain('Honeycomb historical metrics unsupported');
 const before=h.bridge.calls.length;await root.getByRole('slider',{name:'Day',exact:true}).press('Home');
 await expect.poll(()=>page.evaluate(()=>window.ctl.telemetry.snapshot().at)).toBe('2026-10-31T00:00:00.000Z');expect(await page.evaluate(()=>window.ctl.liveStatus.snapshot().overTime.index)).toBe(0);expect(await page.evaluate(()=>Object.values(window.ctl.liveStatus.snapshot().states).every(v=>v.state==='active'))).toBe(true);expect(h.bridge.calls).toHaveLength(before);expect(h.bridge.calls.filter(c=>c.name==='run_query')).toHaveLength(hc);
 await root.getByRole('button',{name:'Live',exact:true}).click();await expect.poll(()=>page.evaluate(id=>window.ctl.telemetry.snapshot().map[id]?.signals.latency?.value,id)).toBe(expected());
 await metrics(root).click();expect(await page.evaluate(()=>window.ctl.telemetry.snapshot().map)).toEqual({});expect(await page.evaluate(()=>window.ctl.liveStatus.enabled())).toBe(true);
});
test('actual mock payload: page 6h window is applied; Day8 absence is not zero',async({page,server,audit})=>{
 const h=await setup(page,server,audit,{real:{day:11,transport:'payload',window:'6h'}}),id='shared::api';await metrics(h.root).click();
 await expect.poll(()=>page.evaluate(id=>window.ctl.telemetry.snapshot().map[id]?.signals.latency?.value,id)).toBe(expected(11,'mcu->ingest',6));
 expect(await page.evaluate(id=>window.ctl.telemetry.snapshot().map[id].signals.latency.series.length,id)).toBe(6);expect(h.bridge.calls.filter(c=>c.name==='run_query').every(c=>c.args.query_spec.from==='-6h')).toBe(true);
 await metrics(h.root).click();h.bridge.day=7;await metrics(h.root).click();await expect.poll(()=>page.evaluate(()=>window.ctl.telemetry.status().busy)).toBe(false);expect(await page.evaluate(id=>window.ctl.telemetry.snapshot().map[id]?.signals.latency,id)).toBeUndefined();expect(h.requests()).toBe(0);
});
for(const disabled of ['page','host','missing'])test('actual mock async nested detail '+disabled+': no queries and root/host no metadata',async({page,server,audit})=>{
 const h=await setup(page,server,audit,{detail:true,disabled,real:{absent:disabled==='missing'}});await expect(metrics(h.root)).toBeHidden();expect(h.bridge.calls).toHaveLength(0);if(disabled!=='missing')expect(h.bridge.lists).toBe(0);
 await h.root.getByRole('button',{name:'Over time',exact:true}).click();await expect(h.root.getByRole('slider',{name:'Day',exact:true})).toBeVisible();expect(h.bridge.calls).toHaveLength(0);
});

for(const shape of ['direct','detail','zero'])test('actual mock measurement clock '+shape+': November client renders October card and Proof series',async({page,server,audit})=>{
 // Deliberately outside the story: only this browser test fixes the receipt clock.
 await page.clock.setFixedTime(new Date('2026-11-05T00:00:00Z'));
 const h=await setup(page,server,audit,{detail:shape==='detail',real:{day:11,clockRegression:true,zero:shape==='zero'}}),root=h.root;
 const id=shape==='detail'?'outer::inner::a->outer::inner::b':'shared::api->shared::store';
 await expect(metrics(root)).toHaveAttribute('aria-pressed','false');expect(h.bridge.calls).toHaveLength(0);await metrics(root).click();
 await expect.poll(()=>page.evaluate(id=>window.ctl.telemetry.snapshot().map[id]?.signals.rate?.value,id)).toBe(shape==='zero'?0:expected());
 const sample=await page.evaluate(id=>window.ctl.telemetry.snapshot().map[id],id);
 expect(sample.signals.rate.observedAt).toBe('2026-11-01T00:00:00.000Z');expect(sample.signals.rate.retrievedAt).toBe('2026-11-05T00:00:00.000Z');
 expect(new Date(sample.signals.peer.series.at(-1)[0]).toISOString()).toBe(sample.signals.rate.observedAt);
 const card=root.locator('[data-metrics-card="'+id+'"]'),row=root.locator('[data-proof-carrier="'+id+'"]');
 await expect(card).toContainText(shape==='zero'?'0':'645.4');
 expect((await card.locator('.dv-metrics-sparkline').getAttribute('points')).trim().split(/\s+/)).toHaveLength(24);
 await expect(row.locator('.dv-live-proof-point')).toHaveCount(24);await expect(row.locator('.dv-live-proof-series')).toHaveCount(1);
 expect(await page.evaluate(id=>window.ctl.liveStatus.snapshot().metrics.proof.rows.find(r=>r.id===id).chart.observedAt,id)).toBe('2026-11-01T00:00:00.000Z');
 const before=h.bridge.calls.length;
 const trigger=root.locator('[data-live-carrier="'+id+'"][tabindex="0"]:visible');await expect(trigger).toHaveCount(1);await trigger.focus();await trigger.press('Enter');
 const production=page.locator('#docview .dv-live-popover:visible .dv-live-production');await expect(production).toBeVisible();await expect(production.locator('.dv-live-proof-point')).toHaveCount(24);await expect(production).toContainText(shape==='zero'?'rate: 0 req/h':'rate: 645.4 req/h');
 await page.keyboard.press('Escape');await expect(trigger).toBeFocused();
 const events=await page.evaluate(id=>window.ctl.liveStatus.snapshot().activity.filter(e=>e.type==='telemetry'&&e.carrier===id),id);
 expect(events.find(e=>e.kind==='first-traffic')?.at).toBe('2026-10-31T00:00:00.000Z');
 if(shape==='zero')expect(events.find(e=>e.kind==='silent'),'measured zero Honeycomb cannot label a carrier silent while its Grafana rate is positive').toBeUndefined();
 await row.hover();expect(h.bridge.calls).toHaveLength(before);
 await metrics(root).click();h.bridge.day=7;await metrics(root).click();await expect.poll(()=>page.evaluate(()=>window.ctl.telemetry.status().busy)).toBe(false);
 expect(await page.evaluate(id=>window.ctl.telemetry.snapshot().map[id]?.signals.rate,id)).toBeUndefined();await expect(row.locator('.dv-live-proof-point')).toHaveCount(0);await expect(row).toHaveAttribute('data-telemetry','unobserved');await expect(row).toContainText('rate: unobserved');await expect(row).toHaveAttribute('data-verdict','done');
 expect(h.requests()).toBe(0);
});

for(const mode of ['blocked','blocked-zero','blocked-missing'])test('published-page controlled '+mode+' download keeps labeled Results fallback for imported nodes and edges',async({page,server,audit})=>{
 const h=await setup(page,server,audit,{mode}),root=h.root;await metrics(root).click();await expect.poll(()=>page.evaluate(()=>window.ctl.telemetry.status().busy)).toBe(false);
 const snapshot=await page.evaluate(()=>window.ctl.telemetry.snapshot());expect(h.requests()).toBe(0);
 const bound=snapshot.carriers.filter(b=>b.signals.latency);expect(bound.some(b=>b.id.includes('::'))).toBe(true);expect(bound.some(b=>b.id.includes('->'))).toBe(true);
 for(const binding of bound){const s=snapshot.map[binding.id]?.signals.latency;if(mode==='blocked-missing'){expect(s).toBeUndefined();continue;}expect(s.value).toBe(mode==='blocked-zero'?0:104084);expect(s.provenance).toBe('formatted-text');expect(s.observedAt).toBeNull();expect(s.series).toEqual([]);}
 if(mode!=='blocked-missing')await expect(root.locator('.dv-metrics-card').filter({hasText:'formatted text; may be rounded'}).first()).toBeVisible();
 expect(JSON.stringify(snapshot)).not.toContain('SYNTHETIC_BROWSER');
 const queries=await page.evaluate(()=>window.calls.filter(c=>c.tool==='run_query').map(c=>JSON.parse(c.input.query_spec)));expect(queries.every(q=>q.from==='-24h')).toBe(true);
 if(mode==='blocked'){
  await root.getByRole('button',{name:/^Trace(?: · \d+)?$/}).click();await expect(root.locator('.dv-metrics-card')).toHaveCount(0);await expect(root.locator('.dv-trace-selected')).toHaveCount(0);await expect(root.locator('.dv-trace-mode-status')).toContainText('No trace evidence');
  await root.getByRole('button',{name:'Jira',exact:true}).click();await expect(root.locator('.dv-metrics-card').filter({hasText:'formatted text; may be rounded'}).first()).toBeVisible();
  await page.screenshot({path:path.join(repo,'.local/step-evidence/screenshots/formatted-text-metrics.png'),fullPage:true});
 }
});
