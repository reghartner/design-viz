'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const T=require('../tools/arrange-training/core.cjs');
const engine=T.loadEngine(process.env.ARRANGE_ENGINE_ROOT),corpus=T.loadCorpus();
function synthetic(){return {title:'Synthetic fork',nodes:{a:{title:'Entry'},b:{icon:'cloud'},c:{tint:'blue'},d:{}},rows:[[]],floats:[{id:'a',x:100,y:200},{id:'b',x:600,y:40},{id:'c',x:600,y:360},{id:'d',x:1100,y:200}],edges:[{from:'a',to:'b',label:'AB'},{from:'a',to:'c'},{from:'b',to:'d'},{from:'c',to:'d'}],steps:[{edge:'a->b',text:'Preserve'}],paths:[{id:'p',steps:[1]}],panels:[]};}
const simpleModel={weights:[1,1,1,0,0],scales:[1,1,1,1,1]};
function close(a,b){for(const k of Object.keys(a))assert.ok(Math.abs(a[k]-b[k])<1e-7,`${k}: ${a[k]} vs ${b[k]}`);}
test('portable corpus preserves exact displayed choices, hashes and only media block',()=>{
  assert.deepEqual(corpus.map(p=>[p.id,p.choice]),[['equipment-lending','B'],['signage-distribution','B'],['research-compute-federation','A'],['media-platform','A']]);
  assert.equal(corpus[1].candidates.B.agentVariant,'a');
  assert.deepEqual(corpus.map(p=>Object.keys(p.diagrams.A.nodes).length),[18,26,34,20]);
  assert.equal(require('./fixtures/auto-arrange-training/round2-labels.json').verbatimUserMessage,'B b a');
  assert.equal(require('./fixtures/auto-arrange-training/media-label.json').user_statement,'I favor A');
  assert.ok(engine.provenance.commit);assert.match(engine.provenance.sourceSha256,/^[0-9a-f]{64}$/);
});
test('corpus rejects forged label mapping, evidence, geometry hashes and topology',()=>{
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'arrange-corpus-'));
  try{
    fs.cpSync(T.DEFAULT_CORPUS,tmp,{recursive:true});const manifestPath=path.join(tmp,'corpus.json'),base=JSON.parse(fs.readFileSync(manifestPath));
    let changed=T.clone(base);changed.pairs[1].choice='A';fs.writeFileSync(manifestPath,JSON.stringify(changed));assert.throws(()=>T.loadCorpus(tmp),/provenance/);
    fs.writeFileSync(manifestPath,JSON.stringify(base));const sourcePath=path.join(tmp,base.pairs[0].candidates.A.file);fs.appendFileSync(sourcePath,' ');assert.throws(()=>T.loadCorpus(tmp),/hash/);
    fs.cpSync(T.DEFAULT_CORPUS,tmp,{recursive:true});fs.appendFileSync(path.join(tmp,'round2-labels.json'),' ');assert.throws(()=>T.loadCorpus(tmp),/Evidence hash/);
    // Even a self-consistent newly authored manifest/evidence must keep topology equal.
    fs.cpSync(T.DEFAULT_CORPUS,tmp,{recursive:true});const raw=JSON.parse(fs.readFileSync(sourcePath));raw.page.blocks[0].diagram.edges.pop();const bytes=JSON.stringify(raw);fs.writeFileSync(sourcePath,bytes);
    changed=T.clone(base);changed.pairs[0].candidates.A.sha256=T.hash(bytes);
    const evidencePath=path.join(tmp,'round2-labels.json'),e=JSON.parse(fs.readFileSync(evidencePath));e.graphs[0].A.sha256=T.hash(bytes);fs.writeFileSync(evidencePath,JSON.stringify(e));changed.evidenceHashes['round2-labels.json']=T.hash(fs.readFileSync(evidencePath));fs.writeFileSync(manifestPath,JSON.stringify(changed));assert.throws(()=>T.loadCorpus(tmp),/topology/);
  }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
test('geometry features ignore node IDs, titles, icons, tint and edge labels',()=>{
  const a=synthetic(),b=T.clone(a),mapping={a:'renamed-7',b:'renamed-4',c:'renamed-9',d:'renamed-1'};
  b.nodes=Object.fromEntries(Object.keys(a.nodes).reverse().map(id=>[mapping[id],{title:'Different long title',icon:'db',tint:'red'}]));
  b.floats=b.floats.map(p=>({...p,id:mapping[p.id]}));b.edges=b.edges.map(e=>({...e,from:mapping[e.from],to:mapping[e.to],label:'Unrelated label'}));
  const x=T.measure(engine,a),y=T.measure(engine,b);close(x.features,y.features);assert.deepEqual(x.safety,y.safety);
});
test('translation and reflection preserve generic geometry features on natural symmetric paths',()=>{
  const d=synthetic(),base=T.measure(engine,d);
  for(const [sx,sy,dx,dy] of [[1,1,730,-400],[-1,1,2000,0],[1,-1,0,2000]]){
    const next=T.clone(d);next.floats=next.floats.map(p=>({...p,x:p.x*sx+dx,y:p.y*sy+dy}));
    const m=T.measure(engine,next);close(base.features,m.features);assert.deepEqual(base.safety,m.safety);
  }
});
test('crow-flies distance does not substitute rendered curve length, and manual controls are explicit diagnostics',()=>{
  const d={nodes:{a:{},b:{}},rows:[[]],floats:[{id:'a',x:100,y:100},{id:'b',x:700,y:100}],edges:[{from:'a',to:'b'}]};
  const base=T.measure(engine,d);d.edges[0].bend=150;const bent=T.measure(engine,d);
  assert.equal(bent.features.crowDistance,base.features.crowDistance);assert.notEqual(bent.diagnostics.renderedLength,base.diagnostics.renderedLength);
  assert.equal(base.diagnostics.crowLength,600);assert.equal(bent.diagnostics.manualRouteEdges,1);
});
test('bounded contraction finds a fresh synthetic opportunity and preserves nongeometric content',()=>{
  const d=synthetic(),original=T.clone(d),result=T.contract(engine,d,simpleModel);
  assert.ok(result.accepted>0);assert.ok(result.metrics.diagnostics.area<result.baseline.diagnostics.area);
  assert.ok(T.safe(result.metrics));assert.ok(T.preservesCrossings(result.metrics,result.baseline));assert.ok(result.checks<=12);
  assert.equal(result.metrics.diagnostics.manualRouteEdges,0);assert.ok(result.metrics.diagnostics.minCardClearance>=result.clearanceFloor-1e-7);assert.deepEqual(d,original);
  for(const k of ['nodes','steps','paths','panels','title','edges'])assert.deepEqual(result.diagram[k],d[k]);
  assert.ok(result.runtimeMs<5000);assert.deepEqual(T.contract(engine,d,simpleModel).diagram,result.diagram);
});
test('unsafe, no-benefit and invalid inputs retain fallback or fail explicitly',()=>{
  const bad=synthetic();bad.floats[1]={...bad.floats[0],id:'b'};const fallback=T.contract(engine,bad,simpleModel);
  assert.equal(fallback.accepted,0);assert.equal(fallback.checks,0);assert.deepEqual(fallback.diagram,bad);
  const d=synthetic(),zero={...simpleModel,weights:[0,0,0,0,0]},same=T.contract(engine,d,zero);assert.deepEqual(same.diagram,d);
  assert.throws(()=>T.contract(engine,d,simpleModel,{maxChecks:999}),/maxChecks/);
  d.floats[0].x=NaN;assert.throws(()=>T.measure(engine,d),/Nonfinite/);
  d.floats[0].x=Infinity;assert.throws(()=>T.measure(engine,d),/Nonfinite/);
});
test('safety distinguishes card/group overlap, unrelated card hits, ordinary and shared endpoint crossing pairs',()=>{
  const grouped=synthetic();grouped.groups={g:{},h:{}};grouped.nodes.a.group='g';grouped.nodes.d.group='g';grouped.nodes.b.group='h';grouped.floats[1].y=200;assert.ok(T.measure(engine,grouped).safety.overlaps>0);
  const m={crossingPairs:{ordinary:[[1,2]],incident:[[2,3]]}},n={crossingPairs:{ordinary:[[1,3]],incident:[[2,3]]}};
  assert.ok(!T.preservesCrossings(n,m));assert.ok(T.preservesCrossings({crossingPairs:{ordinary:[],incident:[]}},m));
  // Crossing paths share no endpoint in this X.
  const x={nodes:{a:{},b:{},c:{},d:{}},rows:[[]],floats:[{id:'a',x:0,y:0},{id:'b',x:500,y:500},{id:'c',x:0,y:500},{id:'d',x:500,y:0}],edges:[{from:'a',to:'b'},{from:'c',to:'d'}]};
  const hit={nodes:{a:{},b:{},c:{}},rows:[[]],floats:[{id:'a',x:0,y:0},{id:'b',x:600,y:0},{id:'c',x:300,y:0}],edges:[{from:'a',to:'b',curveControls:[{t:1/3,dx:0,dy:0},{t:2/3,dx:0,dy:0}]}]};
  assert.equal(T.measure(engine,hit).safety.hits,1);
  const incident=T.clone(hit);incident.floats[1].y=-100;incident.floats[2]={id:'c',x:600,y:100};incident.edges=[{from:'a',to:'b',curveControls:[{t:1/3,dx:0,dy:300},{t:2/3,dx:0,dy:300}]},{from:'a',to:'c',curveControls:[{t:1/3,dx:0,dy:-300},{t:2/3,dx:0,dy:-300}]}];
  assert.equal(T.measure(engine,incident).safety.incidentCrossings,1);assert.equal(T.measure(engine,incident).safety.ordinaryCrossings,0);
  assert.equal(T.measure(engine,x).safety.ordinaryCrossings,1);assert.equal(T.measure(engine,x).safety.incidentCrossings,0);
});
test('deterministic constrained training and leave-one-out never fit or scale the held-out pair',()=>{
  const rows=T.evaluateCorpus(engine,corpus),model=T.fit(rows);assert.deepEqual(T.fit(rows),model);
  assert.ok(model.weights.every(w=>w>=0&&w<=4));
  const folds=T.leaveOneOut(rows);for(let i=0;i<rows.length;i++){
    assert.deepEqual(folds[i].model,T.fit(rows.filter((_,j)=>i!==j)));assert.ok(!folds[i].model.fitIds.includes(rows[i].id));
    const altered=T.clone(rows);altered[i].choice=altered[i].choice==='A'?'B':'A';for(const l of ['A','B'])for(const key of T.FEATURES)altered[i][l].features[key]+=10000;
    assert.deepEqual(T.leaveOneOut(altered)[i].model,folds[i].model);
  }
  assert.throws(()=>T.fit([]),/empty/);assert.throws(()=>T.fit([{...rows[0],B:rows[0].A}]),/Untrainable/);
  assert.throws(()=>T.fit([{...rows[0],choice:'C'}]),/Invalid/);
});

test('safety ranking overrides a cheap but unsafe geometry score',()=>{
  const m=T.measure(engine,synthetic()),cheap=T.clone(m);for(const key of T.FEATURES)cheap.features[key]=0;cheap.safety.hits=1;
  const ranked=T.rank(simpleModel,{A:cheap,B:m,choice:'B'});assert.equal(ranked.rawGeometryChoice,'A');assert.equal(ranked.choice,'B');
  const neither=T.clone(m);neither.safety.overlaps=1;assert.equal(T.rank(simpleModel,{A:cheap,B:neither,choice:'B'}).choice,'neither-safe');
});
test('contraction does not squeeze an existing clearance floor even without overlap',()=>{
  for(const spacing of [204,180]){
    const d={nodes:{a:{},b:{},c:{}},rows:[[]],floats:[{id:'a',x:0,y:0},{id:'b',x:spacing,y:0},{id:'c',x:spacing*2,y:0}],edges:[{from:'a',to:'b'},{from:'b',to:'c'}]};
    const result=T.contract(engine,d,simpleModel);
    assert.equal(result.clearanceFloor,spacing-150);assert.equal(result.accepted,0);assert.deepEqual(result.diagram,d);
  }
});
