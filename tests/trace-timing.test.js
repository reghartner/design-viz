'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'), vm=require('node:vm'), path=require('node:path');
const C={URL}; vm.createContext(C);
for(const file of ['validator','engine','trace-import','builder.workbench'])
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/'+file+'.js'),'utf8'),C);
const plain=x=>JSON.parse(JSON.stringify(x));
const span=(id,parentId,service,startMs,ms,name=id)=>({id,parentId,service,startMs,ms,name});
const panel=spans=>({id:'t',type:'trace',spans});
const model=(spans,selected)=>C.traceTimingModel(panel(spans),{selected});
const fixture=[span('root',null,'api',0,100),span('a','root','api',10,40),span('b','root','db',30,50),span('nested','a','api',20,10)];

test('overlapping direct children count once; nested grandchildren are not subtracted twice',()=>{
  const m=model(fixture,'root');
  assert.equal(m.selected.childMs,70);
  assert.equal(m.selected.uncoveredMs,30);
  assert.deepEqual(plain(m.selected.covered),[[10,80]]);
  assert.equal(m.selected.children.length,2);
  assert.equal(model(fixture,'a').selected.uncoveredMs,30);
});
test('service coverage unions nested and parallel spans instead of summing durations',()=>{
  const m=model(fixture,'root');
  assert.equal(m.serviceCoverageMs,100);
  assert.deepEqual(plain(m.rows.map(r=>r.span.id)),['root','a','nested']);
  assert.deepEqual(plain(m.rows.map(r=>r.depth)),[0,1,2]);
  assert.equal(m.rows.reduce((n,r)=>n+r.span.ms,0),150);
});
test('separated operations preserve idle gaps and use an extent distinct from coverage',()=>{
  const m=model([span('a',null,'worker',0,10),span('b',null,'worker',30,10)],'b');
  assert.equal(m.serviceCoverageMs,20); assert.equal(m.serviceEnd-m.serviceStart,40);
});
test('async or skewed children are clipped only for coverage; observed timings are preserved',()=>{
  const input=[span('p',null,'api',20,50),span('early','p','db',0,30),span('late','p','cache',60,50),span('outside','p','api',90,5)];
  const before=JSON.stringify(input), m=model(input,'p');
  assert.equal(m.selected.childMs,20); assert.equal(m.selected.uncoveredMs,30);
  assert.match(m.notices.join(' '),/3 child span/);
  assert.equal(m.selected.children[1].ms,50);
  assert.equal(JSON.stringify(input),before);
});
test('missing parents retain spans and explain partial coverage; leaves remain uncovered',()=>{
  const m=model([span('a','absent','worker',5,30)],'a');
  assert.equal(m.selected.uncoveredMs,30); assert.equal(m.rows.length,1);
  assert.match(m.notices.join(' '),/missing parents/);
  assert.match(C.tracePanelHTML(panel(fixture),{selected:'nested'},[]),/missing instrumentation; it is not CPU time/);
});
test('zero durations produce zero coverage and finite render values',()=>{
  const p=panel([span('z',null,'api',0,0)]), m=C.traceTimingModel(p,{}), html=C.tracePanelHTML(p,{},[]);
  assert.equal(m.selected.childMs,0); assert.equal(m.serviceCoverageMs,0);
  assert.ok(!/NaN|Infinity/.test(html)); assert.match(html,/Zero-duration span/);
});
test('malformed, duplicate, cyclic, over-limit data and unknown selection cannot fabricate timing',()=>{
  const cases=[[],[null],[span('a',null,'api',0,-1)],[span('a',null,'api',NaN,2)],
    [span('a',null,'api',0,1),span('a',null,'db',0,1)],
    [span('a','b','api',0,10),span('b','a','api',0,10)],
    [span('a',null,'',0,10)],Array.from({length:201},(_,i)=>span(String(i),null,'api',0,1))];
  for(const spans of cases){
    const m=model(spans); assert.ok(m.errors.length); assert.equal(m.selected,undefined);
    assert.match(C.tracePanelHTML(panel(spans),{},[]),/Timing unavailable/);
  }
  assert.match(model(fixture,'missing').errors.join(' '),/unavailable/);
});
test('union agrees with an independent unit-interval oracle, without mutating input',()=>{
  let seed=823;
  const rand=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)%100);
  for(let run=0;run<60;run++){
    const spans=[span('p',null,'api',20,50)];
    for(let i=0;i<8;i++)spans.push(span('c'+i,'p','db',rand(),rand()%40));
    const slots=new Set();
    for(const s of spans.slice(1))for(let j=Math.max(20,s.startMs);j<Math.min(70,s.startMs+s.ms);j++)slots.add(j);
    assert.equal(model(spans,'p').selected.childMs,slots.size);
    assert.equal(model(spans,'p').selected.uncoveredMs,50-slots.size);
  }
});
test('repeated operation names use span identity and jump targets from folded step state',()=>{
  const p=panel([span('a',null,'api',0,100,'same'),span('b','a','api',10,10,'same'),span('c','a','db',30,20)]);
  const states=[{selected:'a'},{selected:'b'},{selected:'c'}];
  const html=C.tracePanelHTML(p,{selected:'a'},states);
  assert.match(html,/data-dv-trace-step="0"/);assert.match(html,/data-dv-trace-step="1"/);
  assert.match(html,/data-dv-trace-service/); assert.match(html,/<option value="2">db<\/option>/);
  assert.equal(model(p.spans,'b').selected.span.id,'b');
});
test('sparse selection and enterOnce use ordinary deterministic step folding',()=>{
  const p=panel(fixture);p.initial={selected:'root'};
  const d={panels:[p],steps:[{panels:{t:{selected:'a'}}},{panels:{t:{enterOnce:{selected:'b'}}}},{}, {panels:{t:{selected:'nested'}}}]};
  const states=C.foldPanelStates(d).t;
  assert.deepEqual(plain(states.map(s=>s.selected)),['a','b','a','nested']);
  for(const i of [3,0,2,1,0]) assert.equal(C.traceTimingModel(p,states[i]).selected.span.id,states[i].selected);
});
test('trace panel validates preset, initial selection, step selection and transient selection',()=>{
  const p={...plain(C.PANEL_TEMPLATES.trace),id:'t',type:'trace'};
  const d={nodes:{n:{title:'Service'}},rows:[['n']],panels:[p],steps:[{nodes:['n']}]};
  assert.deepEqual(plain(C.validate(C.normalize(d))),{errors:[],warnings:[]});
  p.initial.selected='absent';d.steps[0].panels={t:{selected:'x',enterOnce:{selected:'y'}}};
  const issues=C.validate(C.normalize(d)).warnings.join('\n');
  assert.match(issues,/initial.selected/);assert.match(issues,/steps\[0\].panels.t.selected/);assert.match(issues,/enterOnce.selected/);
  assert.ok(C.PANEL_SETUP_FIELDS.trace);assert.ok(C.PANEL_PATCH_FIELDS.trace);
});
test('trace output escapes operation, service and span strings in text and attributes',()=>{
  const spans=[span('a" onclick="bad',null,'<service>',0,10,'<script>bad()</script>')];
  const html=C.tracePanelHTML(panel(spans),{selected:spans[0].id},[{selected:spans[0].id}]);
  assert.ok(!html.includes('<script>')); assert.ok(!html.includes('<service>'));
  assert.match(html,/&lt;script&gt;/); assert.ok(!html.includes(' onclick="bad'));
});
test('import includes normalized service timing, selects each span, and keeps unrelated attributes out',()=>{
  const input=JSON.parse(fs.readFileSync(path.join(__dirname,'../examples/traces/checkout.events.json'),'utf8'));
  input[0].secret='private-value';
  const d=C.traceToSpec(input).spec.page.blocks[0].diagram, p=d.panels.find(p=>p.type==='trace');
  assert.equal(p.spans.length,input.length); assert.equal(d.steps.length,input.length);
  assert.ok(!JSON.stringify(p).includes('private-value'));
  for(const st of d.steps) assert.equal(C.traceTimingModel(p,st.panels.internal).selected.span.id,st.id);
  const root=C.traceTimingModel(p,{selected:'root'});
  assert.equal(root.selected.childMs,235); assert.equal(root.selected.uncoveredMs,65);
});
