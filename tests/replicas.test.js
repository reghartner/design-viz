const {readSource} = require('../tools/source-loader.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const C = {URL}; vm.createContext(C);
for (const file of ['validator','engine','builder.workbench'])
  vm.runInContext(readSource(file+'.js'),C);
const plain = x=>JSON.parse(JSON.stringify(x));
const panel = {id:'copies',type:'replicas',unit:'records',replicas:[{id:'a',label:'Primary'},{id:'b',label:'Follower'},{id:'c',label:'Remote'}]};
const cursor = (position,series='orders/a')=>({position,series});
const snapshot = (replicas,reference=cursor(104))=>({replicas,reference});
const diagram = (p=panel,steps=[])=>({nodes:{service:{}},rows:[['service']],edges:[],panels:[p],steps});

test('same-sequence cursor ruler shows behind, equal and ahead with one reference',()=>{
  const m=C.replicaModel(panel,snapshot({a:cursor(104),b:cursor(101),c:cursor(106)}));
  assert.deepEqual(plain(m.rows.map(r=>[r.delta,r.comparison,r.pct])),[[0,'equal',60],[-3,'behind',0],[2,'ahead',100]]);
  assert.equal(m.min,101);assert.equal(m.max,106);assert.equal(m.referencePct,60);assert.equal(m.comparable,3);
});
test('different or absent sequences never compare and do not stretch the ruler',()=>{
  const m=C.replicaModel(panel,snapshot({a:cursor(104),b:cursor(9999,'orders/b'),c:{position:103}}));
  assert.deepEqual(plain(m.rows.map(r=>r.comparison)),['equal','different-series','unknown']);
  assert.equal(m.rows[1].delta,null);assert.equal(m.rows[1].pct,null);assert.equal(m.rows[2].position,103);
  assert.equal(m.min,104);assert.equal(m.max,104);assert.equal(m.referencePct,50);
  assert.equal(C.replicaModel(panel,snapshot({a:cursor(104)},cursor(104,'Orders/a'))).rows[0].delta,null);
});
test('position zero and largest safe integers stay precise; invalid numbers remain unknown',()=>{
  for (const position of [0,Number.MAX_SAFE_INTEGER]){
    const m=C.replicaModel(panel,snapshot({a:cursor(position)},cursor(position)));
    assert.equal(m.rows[0].position,position);assert.equal(m.rows[0].delta,0);assert.equal(m.rows[0].pct,50);
  }
  for (const position of [-1,1.5,'104',Infinity,NaN,Number.MAX_SAFE_INTEGER+1,null]){
    const m=C.replicaModel(panel,snapshot({a:cursor(position)}));
    assert.equal(m.rows[0].position,null);assert.equal(m.rows[0].delta,null);assert.equal(m.rows[0].pct,null);
    assert.ok(!/NaN|Infinity/.test(C.replicaPanelHTML(panel,snapshot({a:cursor(position)}))));
  }
});
test('missing or malformed reference cannot produce a lag or equality claim',()=>{
  for (const ref of [null,{},[],false,{position:104},{series:'orders/a'},cursor('104')]){
    const m=C.replicaModel(panel,snapshot({a:cursor(104)},ref));
    assert.equal(m.reference,null);assert.equal(m.rows[0].comparison,'no-reference');assert.equal(m.rows[0].delta,null);
    assert.match(C.replicaPanelHTML(panel,snapshot({a:cursor(104)},ref)),/Reference unavailable/);
  }
});
test('reported lag, availability and observation labels are independent of positions',()=>{
  const m=C.replicaModel(panel,snapshot({a:{...cursor(104),status:'offline',lagMs:25,observedAt:'last seen t=2'},
    b:{...cursor(101),status:'online',lagMs:0},c:{...cursor(104),lagMs:null}}));
  assert.equal(m.rows[0].comparison,'equal');assert.equal(m.rows[0].status,'offline');assert.equal(m.rows[0].lagMs,25);
  assert.equal(m.rows[1].comparison,'behind');assert.equal(m.rows[1].lagMs,0);
  assert.equal(m.rows[2].status,'unknown');assert.equal(m.rows[2].lagMs,null);assert.equal(m.rows[2].observedAt,'');
  const html=C.replicaPanelHTML(panel,snapshot({a:{...cursor(104),status:'offline',lagMs:25}}));
  assert.match(html,/Position equality does not prove availability, commit, or read safety/);
  assert.match(html,/Reported lag: 25 ms/);assert.match(html,/Observed: time unknown/);
});
test('sparse folds carry snapshots, whole maps replace, transient and null resets do not leak forward',()=>{
  const p={...panel,initial:snapshot({a:cursor(104),b:cursor(101)})};
  const steps=[{nodes:['service'],text:'carry'},
    {nodes:['service'],text:'replace',panels:{copies:{replicas:{b:cursor(103)}}}},
    {nodes:['service'],text:'once',panels:{copies:{enterOnce:{replicas:{b:cursor(110,'other')}}}}},
    {nodes:['service'],text:'restore'},
    {nodes:['service'],text:'unknown',panels:{copies:{reference:null,replicas:null}}}];
  const folded=C.foldPanelStates(diagram(p,steps)).copies;
  const models=folded.map(s=>C.replicaModel(p,s));
  assert.equal(models[0].rows[0].delta,0);assert.equal(models[1].rows[0].position,null);
  assert.equal(models[1].rows[1].delta,-1);assert.equal(models[2].rows[1].comparison,'different-series');
  assert.equal(models[3].rows[1].delta,-1);assert.equal(models[4].reference,null);assert.equal(models[4].rows[1].position,null);
  assert.deepEqual(plain(C.replicaModel(p,folded[0])),plain(models[0]));
});
test('validator diagnoses malformed declarations, snapshots and transient cursor fields',()=>{
  const warnings=[];
  C.replicaPanelWarnings({...panel,unit:7,replicas:[null,{id:'a'},{id:'a'},{id:'b',label:42}],initial:{reference:cursor(1.5)}},'p',warnings);
  C.replicaPatchWarnings({replicas:{a:{position:'104',series:7,status:'healthy',lagMs:-1,observedAt:5,role:false},missing:{}},enterOnce:{reference:cursor(Infinity)}},'s',panel,warnings);
  const text=warnings.join('\n');
  for (const marker of ['p.unit','p.replicas[0].id','duplicate replica','p.replicas[3].label','p.initial.reference.position',
    's.replicas.a.position','s.replicas.a.series','s.replicas.a.status','s.replicas.a.lagMs','s.replicas.a.observedAt','s.replicas.a.role','s.replicas.missing','s.enterOnce.reference.position']) assert.ok(text.includes(marker),marker);
  const v=C.validate(C.normalize(diagram(panel,[{text:'bad',nodes:['service'],panels:{copies:{enterOnce:{replicas:{a:{lagMs:-2}}}}}}])));
  assert.ok(v.warnings.some(w=>w.includes('.panels.copies.enterOnce.replicas.a.lagMs')));
});
test('defensive models bound rows, reject malformed entries, and preserve unusual own-property ids',()=>{
  const p={...panel,replicas:[null,{id:'a'},{id:'a'},{id:' '},{id:'b'},...Array.from({length:10},(_,i)=>({id:'r'+i}))]};
  assert.deepEqual(plain(C.replicaModel(p,{}).rows.map(r=>r.id)),['a','b','r0','r1','r2']);
  const special={...panel,replicas:[{id:'__proto__'},{id:'constructor'}]};
  const s=JSON.parse('{"reference":{"series":"x","position":0},"replicas":{"__proto__":{"series":"x","position":0},"constructor":{"series":"x","position":1}}}');
  assert.deepEqual(plain(C.replicaModel(special,s).rows.map(r=>r.delta)),[0,1]);
  for(const state of [null,false,[],{replicas:[]},{replicas:{a:'oops'}}]) assert.doesNotThrow(()=>C.replicaPanelHTML(panel,state));
});
test('replica text is escaped and markup exposes numeric comparisons without color reliance',()=>{
  const p={...panel,unit:'<units>',replicas:[{id:'a',label:'<img src=x>'}]};
  const s=snapshot({a:{...cursor(103,'<series>'),role:'<script>',observedAt:'" onload="x',status:'<x>',lagMs:0}},cursor(104,'<series>'));
  s.note='<unsafe note>';
  const html=C.replicaPanelHTML(p,s);
  assert.ok(!/<img|<script>|<unsafe/.test(html));
  assert.match(html,/&lt;img/);assert.match(html,/1 &lt;units&gt; behind/);assert.match(html,/Reported lag: 0 ms/);
  assert.match(html,/aria-hidden="true"/);assert.match(html,/unknown<\/span>/);
  assert.match(html,/tabindex="0" role="region" aria-label="Replica observations"/);
});
test('replica picker preset and setup/patch authoring contract agree with validation',()=>{
  const p={...plain(C.PANEL_TEMPLATES.replicas),id:'copies',type:'replicas'};
  assert.deepEqual(plain(C.validate(C.normalize(diagram(p)))),{errors:[],warnings:[]});
  assert.deepEqual(plain(C.PANEL_SETUP_FIELDS.replicas.map(f=>f[0])),['unit','replicas','initial']);
  assert.deepEqual(plain(C.PANEL_PATCH_FIELDS.replicas.map(f=>f[0])),['reference','replicas','note']);
});
