'use strict';
const {readSource} = require('../tools/source-loader.cjs');

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {spawnSync} = require('node:child_process');
const root = path.join(__dirname, '..');
const context = {URL, console};
vm.createContext(context);
for (const file of ['validator.js','engine.js','trace-import.js','builder.workbench.js'])
  vm.runInContext(readSource(file), context);
const C = context;
const plain = v => JSON.parse(JSON.stringify(v));
const clone = v => JSON.parse(JSON.stringify(v));
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'examples/traces/checkout.events.json'), 'utf8'));
const diagram = panels => ({nodes:{n:{title:'Service'}}, rows:[['n']], edges:[], panels, steps:[{nodes:['n'],text:'Inspect'}]});
const issues = (panels, patch) => {
  const d = diagram(panels);
  if (patch) d.steps[0].panels = patch;
  return C.validate(C.normalize(d));
};

test('all software panel presets and domain starters validate without warnings', () => {
  for (const type of ['table','checks','budget']){
    const p = {...clone(C.PANEL_TEMPLATES[type]), id:'p', type};
    assert.deepEqual(plain(issues([p])), {errors:[], warnings:[]});
    assert.ok(C.PANEL_SETUP_FIELDS[type]);
    assert.ok(C.PANEL_PATCH_FIELDS[type]);
  }
  for (const file of ['software-systems.json','honeycomb-trace.json']){
    const spec = JSON.parse(fs.readFileSync(path.join(root, 'src/starters', file), 'utf8'));
    const v = C.validate(C.normalize(spec));
    assert.deepEqual(plain(v), {errors:[],warnings:[]}, file);
  }
});

test('data table preserves zero, false, null and missing values distinctly, escapes text', () => {
  const p = {type:'table', title:'<unsafe>', columns:[{id:'a',label:'<A>'},{id:'b'},{id:'c'},{id:'d'}]};
  const s = {rows:[{id:'r', cells:{a:0,b:false,c:null}, status:'removed'},
    {id:'other',cells:{a:'<img src=x onerror=bad()>'},status:'changed'}]};
  assert.deepEqual(plain(C.tableModel(p,s).rows[0].cells), ['0','false','null','—']);
  const html = C.softwarePanelHTML(p,s);
  assert.ok(html.includes('&lt;img'));
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('swrow-removed'));
  assert.ok(html.includes('scope="col"'));
});

test('table caps rows, skips malformed and duplicate declarations without throwing', () => {
  const p = {type:'table',columns:[null,{id:'a'},{id:'a'},{id:'b'},{id:'extra'}]};
  const s = {rows:[null,{id:'r',cells:{a:'x'}},{id:'r',cells:{a:'duplicate'}}]};
  assert.deepEqual(plain(C.tableModel(p,s).columns.map(c=>c.id)), ['a','b']);
  assert.equal(C.tableModel(p,s).rows.length,1);
  assert.equal(C.tableModel(p,{rows:Array.from({length:20},(_,i)=>({id:String(i),cells:{}}))}).rows.length,12);
  assert.match(C.softwarePanelHTML(p,{rows:false}), /No rows/);
});

test('checks display authored outcomes and unmentioned checks remain pending', () => {
  const p = {type:'checks',checks:[{id:'a'},{id:'b'},{id:'c'}]};
  const s = {results:{a:{status:'fail',detail:'<reason>'},b:{status:'skip'}}};
  assert.deepEqual(plain(C.checksModel(p,s).map(c=>c.status)),['fail','skip','pending']);
  assert.match(C.softwarePanelHTML(p,s),/0 \/ 3 passed/);
  assert.match(C.softwarePanelHTML(p,s),/&lt;reason&gt;/);
  assert.equal(C.checksModel(p,{results:{a:{status:'approved'}}})[0].status,'pending');
});

test('budget classifies missing, zero, warning, at-limit and over-limit values truthfully', () => {
  const p = {type:'budget',metrics:[{id:'m',max:100,warn:80,unit:'ms'}]};
  for (const [value,status,pct] of [[undefined,'unknown',0],[null,'unknown',0],[0,'ok',0],[79,'ok',79],
    [80,'warn',80],[100,'limit',100],[140,'over',100],[-1,'unknown',0],['40','unknown',0],[Infinity,'unknown',0]]){
    const got = C.budgetModel(p,{values:{m:value}})[0];
    assert.equal(got.status,status,String(value)); assert.equal(got.pct,pct);
  }
  assert.match(C.softwarePanelHTML(p,{values:{m:140}}), /40 ms over budget/);
  assert.match(C.softwarePanelHTML(p,{}), /NO DATA/);
  assert.ok(!C.softwarePanelHTML(p,{}).includes('class="swtrack"'));
  assert.equal(C.budgetModel({type:'budget',metrics:[{id:'m'}]},{values:{m:12}})[0].status,'unbounded');
  assert.equal(C.budgetModel({type:'budget',metrics:[{id:'m',max:100}]},{values:{m:90}})[0].status,'ok','no invented warning threshold');
});

test('software validation names initial, step, and transient field errors', () => {
  const ps = [{id:'t',type:'table',columns:[{id:'a'},{id:'a'}],initial:{rows:'bad'}},
    {id:'c',type:'checks',checks:[{id:'one'}]}, {id:'b',type:'budget',metrics:[{id:'m',max:0,warn:-1}]}];
  const v = issues(ps,{c:{results:{one:{status:'bad'},extra:{status:'pass'}}},b:{enterOnce:{values:{m:-5}}}});
  const text = v.warnings.join('\n');
  assert.match(text,/columns\[1\].id: duplicate/);
  assert.match(text,/initial.rows/);
  assert.match(text,/panels.c.results.one/);
  assert.match(text,/panels.c.results.extra/);
  assert.match(text,/panels.b.enterOnce.values.m/);
});

test('new panel snapshots use whole-map replacement and deterministic transient folding', () => {
  const d = diagram([{id:'b',type:'budget',metrics:[{id:'a',max:10},{id:'b',max:10}],initial:{values:{a:1,b:2},note:'base'}}]);
  d.steps = [{panels:{b:{values:{a:5},enterOnce:{note:'one step'}}}},{nodes:['n']},
    {panels:{b:{values:{a:9,b:8}}}}];
  const source = JSON.stringify(d), states = C.foldPanelStates(d).b;
  assert.equal(C.budgetModel(d.panels[0],states[0])[1].status,'unknown');
  assert.equal(states[0].note,'one step'); assert.equal(states[1].note,'base');
  const later = C.softwarePanelHTML(d.panels[0],states[2]);
  C.softwarePanelHTML(d.panels[0],states[0]);
  assert.equal(C.softwarePanelHTML(d.panels[0],states[2]),later);
  assert.equal(JSON.stringify(d),source,'fold and rendering do not mutate authored input');
});

test('trace offsets preserve nested and parallel timing instead of adding durations', () => {
  const spans = [{id:'root',ms:300,startMs:0},{id:'a',ms:40,startMs:20},{id:'b',ms:100,startMs:30}];
  const m = C.waterfallModel(spans,{});
  assert.equal(m.totalMs,300); assert.equal(m.shownMs,300); assert.equal(m.timed,true);
  assert.equal(m.rows[1].offsetPct,20/300*100);
  assert.equal(m.rows[2].offsetPct,10);
  assert.equal(C.waterfallModel([{ms:20},{ms:30}],{}).totalMs,50,'legacy sequential spans unchanged');
  assert.equal(C.waterfallModel([{ms:20,startMs:10},{ms:30}],{}).totalMs,60);
});

test('Honeycomb fixture produces service topology, span steps and a 300 ms observed extent', () => {
  const result = C.traceToSpec(fixture);
  assert.deepEqual(plain(result.stats),{traceId:'fictional-checkout-001',spans:6,services:5,elapsedMs:300});
  assert.deepEqual(plain(result.warnings),[]);
  const d = result.spec.page.blocks[0].diagram;
  assert.equal(Object.keys(d.nodes).length,5);
  assert.equal(d.edges.length,4,'same-service cache span does not invent a service call');
  assert.equal(d.steps.length,6); assert.equal(d.steps[4].id,'pay');
  assert.equal(d.panels[0].spans[4].error,true);
  assert.equal(d.panels[0].spans[3].startMs,30);
  assert.ok(d.edges.every(e=>e.kind==='trace'));
  assert.equal(C.waterfallModel(d.panels[0].spans,{}).totalMs,300);
  assert.deepEqual(plain(issues(d.panels).errors),[]);
});

test('trace conversion is deterministic across shuffled input and preserves source links', () => {
  const opts = {sourceUrl:'https://ui.honeycomb.io/team/environments/prod/trace?trace_id=abc'};
  const a = C.traceToSpec(fixture,opts), b = C.traceToSpec(fixture.slice().reverse(),opts);
  assert.deepEqual(plain(a),plain(b));
  const sec = a.spec.page.blocks[0];
  assert.equal(sec.source,opts.sourceUrl); assert.equal(sec.diagram.steps[0].link,opts.sourceUrl);
});

test('partial traces are retained with visible warnings and no fabricated parents', () => {
  const input = clone(fixture).filter(e=>e['trace.span_id']!=='root');
  const result = C.traceToSpec(input), sec = result.spec.page.blocks[0];
  assert.match(result.warnings.join(' '),/missing parents/);
  assert.match(result.warnings.join(' '),/0 root spans/);
  assert.equal(sec.bullets.length,result.warnings.length);
  assert.equal(sec.diagram.edges.length,0);
});

test('mixed traces require an explicit selector and unused events are not silently combined', () => {
  const other = {...fixture[0],'trace.trace_id':'other'};
  assert.throws(()=>C.traceToSpec([...fixture,other]),/2 traces/);
  assert.equal(C.traceToSpec([...fixture,other],{traceId:'other'}).stats.spans,1);
  assert.throws(()=>C.traceToSpec(fixture,{traceId:'absent'}),/No spans/);
});

test('duplicate IDs, parent cycles and incomplete required fields fail actionably', () => {
  assert.throws(()=>C.traceToSpec([...fixture,fixture[0]]),/Duplicate span/);
  const cyclic=clone(fixture); cyclic[0]['trace.parent_id']='pay';
  assert.throws(()=>C.traceToSpec(cyclic),/Parent cycle/);
  for (const field of ['service.name','trace.span_id','duration_ms','timestamp']){
    const bad=clone(fixture); delete bad[0][field];
    assert.throws(()=>C.traceToSpec(bad),new RegExp(field.replace('.','\\.')));
  }
  assert.throws(()=>C.traceToSpec({data:{results:[]}}),/aggregated/);
  assert.throws(()=>C.traceToSpec('{'),/valid JSON/);
});

test('timestamps require units and zones; custom mapping and Honeycomb envelopes work', () => {
  const input = {events:fixture.map(e=>({time:e.timestamp,data:{...e}}))};
  input.events.forEach(e=>delete e.data.timestamp);
  assert.equal(C.traceToSpec(input).stats.elapsedMs,300);
  const custom=fixture.map(e=>{const v={...e, app:e['service.name'], seconds:Date.parse(e.timestamp)/1000};delete v['service.name'];delete v.timestamp;return v;});
  assert.equal(C.traceToSpec(custom,{fields:{service:'app',timestamp:'seconds'}}).stats.elapsedMs,300);
  const bad=clone(fixture); bad[0].timestamp='2026-09-13T12:00:00';
  assert.throws(()=>C.traceToSpec(bad),/timezone/);
  assert.throws(()=>C.traceToSpec(fixture,{fields:{secret:'token'}}),/field mapping/);
  assert.throws(()=>C.traceToSpec(fixture,{sourceUrl:'javascript:alert(1)'}),/HTTP/);
});

test('span annotations, clock skew, telemetry allowlist, and error conventions are explicit', () => {
  const input=clone(fixture); input[1].timestamp='2026-09-13T11:59:59.990Z';
  input[2].error=false; input[2]['otel.status_code']='ERROR'; input[2].secret='do not copy';
  input.push({'meta.annotation_type':'span_event'});
  const result=C.traceToSpec(input);
  assert.match(result.warnings.join(' '),/non-span/); assert.match(result.warnings.join(' '),/clock skew/);
  assert.ok(!JSON.stringify(result.spec).includes('do not copy'));
  assert.equal(result.spec.page.blocks[0].diagram.panels[0].spans.find(s=>s.id==='auth').error,true);
});

test('trace import bounds reject rather than silently truncate spans', () => {
  const many=Array.from({length:201},(_,i)=>({...fixture[0],'trace.span_id':String(i)}));
  assert.throws(()=>C.traceToSpec(many),/up to 200/);
});

test('trace CLI shares the converter and emits valid JSON separately from diagnostics', () => {
  const run=spawnSync(process.execPath,['tools/trace2spec.js','examples/traces/checkout.events.json'],{cwd:root,encoding:'utf8'});
  assert.equal(run.status,0,run.stderr);
  assert.deepEqual(JSON.parse(run.stdout),plain(C.traceToSpec(fixture).spec));
  assert.match(run.stderr,/TRACE IMPORT OK/);
});

test('outline indexes hidden tabs, edgeless steps, unplaced nodes, and exact source paths', () => {
  const spec={page:{blocks:[{heading:'Intro',text:'Hello'},{tabs:[{label:'Hidden',sections:[{heading:'Details',diagram:{nodes:{'a.b':{title:'Unplaced'}},panels:[{id:'limits',type:'budget'}],steps:[{text:'Caption only'}]}}]}]}]}};
  const matches=C.builderOutline(spec,'hidden unplaced');
  assert.equal(matches.length,1);
  assert.deepEqual(plain(matches[0].tab),{block:1,tab:0});
  assert.deepEqual(plain(matches[0].path),['page','blocks',1,'tabs',0,'sections',0,'diagram','nodes','a.b']);
  assert.equal(C.builderOutline(spec,'step caption')[0].target.section,1);
  assert.equal(C.builderOutline(spec,'BUDGET')[0].target.kind,'panel');
  assert.equal(C.builderOutline(spec,'no-match').length,0);
  assert.equal(C.builderOutline({nodes:{n:{title:'Bare'}},rows:[['n']]},'bare')[0].path[0],'nodes');
});
