'use strict';
const {readSource} = require('../tools/source-loader.cjs');

const test=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'), vm=require('node:vm'), path=require('node:path'), os=require('node:os');
const {spawnSync}=require('node:child_process');
const root=path.join(__dirname,'..'), C={URL}; vm.createContext(C);
for(const name of ['validator','engine','trace-import']) vm.runInContext(readSource(name+'.js'),C);
const plain=x=>JSON.parse(JSON.stringify(x));
const fixture=JSON.parse(fs.readFileSync(path.join(root,'examples/traces/complex-checkout.events.json'),'utf8'));
const event=(id,parent,service,start,duration)=>({'trace.trace_id':'large','trace.span_id':id,'trace.parent_id':parent,'service.name':service,name:'operation '+id,timestamp:start/1000,duration_ms:duration});

test('preview preserves the input and reports a full export without creating a spec',()=>{
  const before=JSON.stringify(fixture), p=C.tracePreview(fixture);
  assert.equal(JSON.stringify(fixture),before); assert.equal(p.spec,undefined);
  assert.equal(p.stats.spans,24);assert.equal(p.sourceStats.services,17);assert.equal(p.canBuild,true);assert.equal(p.focus,null);
  assert.equal(p.subtreeSizes.get('span-1'),24);assert.equal(p.subtreeSizes.get('span-3'),5);
});
test('subtree focus preserves original parent IDs, descendants, durations and relative timing',()=>{
  const p=C.tracePreview(fixture,{rootSpanId:'span-3'});
  assert.equal(p.stats.spans,5);assert.equal(p.stats.elapsedMs,360);assert.equal(p.focus.omittedSpans,19);
  assert.equal(p.focus.boundarySpans,1);assert.equal(p.focus.viewOffsetMs,160);
  assert.deepEqual(plain(p.focus.ancestors.map(s=>s.id)),['span-1','span-2']);
  for(const s of p.spans){
    const source=p.sourceSpans.find(v=>v.id===s.id);
    assert.equal(s.parentId,source.parentId);assert.equal(s.ms,source.ms);
    assert.equal(s.traceStartMs,source.startMs);
    assert.ok(Math.abs(s.startMs+p.focus.viewOffsetMs-source.startMs)<.00001);
  }
  assert.equal(p.spans.find(s=>s.id==='span-3').parentId,'span-2');
});
test('service focus retains every matching span and its descendants across service re-entry',()=>{
  const p=C.tracePreview(fixture,{service:'checkout'}), included=new Set(p.spans.map(s=>s.id));
  assert.equal(p.focus.kind,'service');assert.ok(p.spans.filter(s=>s.service==='checkout').length>1);
  assert.ok(p.spans.some(s=>s.service==='payments'));
  for(const s of p.sourceSpans){
    if(s.service==='checkout' || included.has(s.parentId)) assert.ok(included.has(s.id));
  }
  assert.equal(included.size,p.spans.length,'overlapping seed subtrees are deduplicated');
});
test('focusing leaves every included span’s child-covered and uncovered duration intact',()=>{
  const source=C.traceToSpec(fixture).spec.page.blocks[0].diagram.panels.find(p=>p.type==='trace');
  for(const options of [{rootSpanId:'span-3'},{service:'checkout'},{service:'database'}]){
    const focused=C.traceToSpec(fixture,options).spec.page.blocks[0].diagram.panels.find(p=>p.type==='trace');
    for(const s of focused.spans){
      const a=C.traceTimingModel(source,{selected:s.id}),b=C.traceTimingModel(focused,{selected:s.id});
      assert.ok(Math.abs(a.selected.childMs-b.selected.childMs)<.00001);
      assert.ok(Math.abs(a.selected.uncoveredMs-b.selected.uncoveredMs)<.00001);
    }
  }
});
test('generated focused diagrams keep stable service IDs and never synthesize a boundary edge',()=>{
  const full=C.traceToSpec(fixture).spec.page.blocks[0].diagram;
  const out=C.traceToSpec(fixture,{rootSpanId:'span-3'}), d=out.spec.page.blocks[0].diagram;
  for(const [id,node]of Object.entries(d.nodes))assert.equal(node.title,full.nodes[id].title);
  assert.ok(d.edges.every(e=>d.nodes[e.from]&&d.nodes[e.to]));
  const first=d.steps.find(s=>s.id==='span-3'); assert.equal(first.edge,undefined);
  const facts=first.panels.span.rows.map(r=>[r.cells.field,r.cells.value]);
  assert.ok(facts.some(([k,v])=>k==='parent_id'&&v==='span-2'));assert.ok(facts.some(([k,v])=>k==='trace_start_ms'&&v===160));
  assert.equal(out.spec.page.traceImport.sourceSpans,24);assert.equal(out.spec.page.traceImport.includedSpans,5);
  assert.match(out.warnings.join(' '),/19 omitted/);assert.match(out.warnings.join(' '),/Original parent IDs/);
  assert.deepEqual(plain(C.validate(C.normalize(out.spec)).errors),[]);
});
test('large exports are previewable while oversized boards require an explicit narrower focus',()=>{
  const events=[event('root',null,'api',0,1000),...Array.from({length:999},(_,i)=>event('n'+i,'root','worker',1,1))];
  const p=C.tracePreview(events);assert.equal(p.stats.spans,1000);assert.equal(p.canBuild,false);assert.match(p.blocked,/up to 200/);
  assert.throws(()=>C.traceToSpec(events),/nothing was truncated/);
  const small=C.traceToSpec(events,{rootSpanId:'n12'});
  assert.equal(small.stats.spans,1);assert.equal(small.spec.page.traceImport.focus.omittedSpans,999);
  assert.equal(C.tracePreview(events,{service:'api'}).canBuild,false,'service descendants must not be silently clipped');
});
test('service limits are assessed after focus and all exported source spans remain available',()=>{
  const events=Array.from({length:40},(_,i)=>event('n'+i,null,'service-'+i,0,1));
  const p=C.tracePreview(events);assert.equal(p.canBuild,false);assert.match(p.blocked,/30 services/);
  const focused=C.tracePreview(events,{service:'service-33'});
  assert.equal(focused.canBuild,true);assert.equal(focused.sourceSpans.length,40);assert.equal(focused.focus.omittedServices,39);
});
test('10,000-deep valid traces are analyzed iteratively and breadcrumb output stays bounded',()=>{
  const events=Array.from({length:10000},(_,i)=>event('n'+i,i?'n'+(i-1):null,'api',i,10000-i));
  const p=C.tracePreview(events,{rootSpanId:'n9999'});
  assert.equal(p.sourceStats.spans,10000);assert.equal(p.subtreeSizes.get('n0'),10000);
  assert.equal(p.stats.spans,1);assert.equal(p.focus.ancestors.length,8);assert.equal(p.focus.omittedAncestors,9991);
  assert.throws(()=>C.tracePreview([...events,events[0]]),/10,000/);
});
test('invalid data cannot be hidden by focusing another branch; cycles still fail',()=>{
  const invalid=plain(fixture);invalid[23].duration_ms=-2;
  assert.throws(()=>C.tracePreview(invalid,{rootSpanId:'span-3'}),/non-negative/);
  const cycle=[event('a','c','api',0,1),event('b','a','api',0,1),event('c','b','api',0,1)];
  assert.throws(()=>C.tracePreview(cycle,{rootSpanId:'b'}),/Parent cycle/);
  assert.throws(()=>C.tracePreview(fixture,{rootSpanId:'missing'}),/No span matches/);
  assert.throws(()=>C.tracePreview(fixture,{service:'missing'}),/No spans match/);
  assert.throws(()=>C.tracePreview(fixture,{rootSpanId:'span-1',service:'gateway'}),/not both/);
  assert.throws(()=>C.tracePreview(fixture,{rootSpanId:''}),/non-empty/);
});
test('focus and preview are deterministic across shuffled events and do not accumulate offsets',()=>{
  const opts={rootSpanId:'span-3'};
  const a=C.traceToSpec(fixture,opts), b=C.traceToSpec(fixture.slice().reverse(),opts);
  assert.deepEqual(plain(a),plain(b));assert.deepEqual(plain(a),plain(C.traceToSpec(fixture,opts)));
  const p=C.tracePreview(fixture);assert.equal(p.spans.find(s=>s.id==='span-3').startMs,160);
  assert.equal(p.spans.find(s=>s.id==='span-3').traceStartMs,undefined);
});
test('a cut with several children reports boundary spans rather than inventing distinct missing parents',()=>{
  const p=C.tracePreview([event('root',null,'api',0,100),event('a','root','db',10,10),event('b','root','db',30,10)],{service:'db'});
  assert.equal(p.focus.boundarySpans,2);assert.match(p.warnings.join(' '),/2 included span\(s\) have parents/);
});
test('CLI preview emits bounded metadata, supports focused conversion and cannot overwrite a spec with a preview',()=>{
  const args=['tools/trace2spec.js','examples/traces/complex-checkout.events.json','--root-span','span-3'];
  const preview=spawnSync(process.execPath,[...args,'--preview'],{cwd:root,encoding:'utf8'});
  assert.equal(preview.status,0,preview.stderr); const p=JSON.parse(preview.stdout);
  assert.equal(p.selection.spans,5);assert.equal(p.source.spans,24);assert.equal(p.sourceSpans,undefined);
  const run=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8'});
  assert.equal(run.status,0,run.stderr);assert.deepEqual(JSON.parse(run.stdout),plain(C.traceToSpec(fixture,{rootSpanId:'span-3'}).spec));
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'trace-preview-')), target=path.join(temp,'keep.json');
  try{
    fs.writeFileSync(target,'original');
    const invalid=spawnSync(process.execPath,[...args,'--preview','-o',target],{cwd:root,encoding:'utf8'});
    assert.notEqual(invalid.status,0);assert.equal(fs.readFileSync(target,'utf8'),'original');
  }finally{fs.rmSync(temp,{recursive:true});}
});
