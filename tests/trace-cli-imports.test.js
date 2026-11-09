'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const ROOT=path.join(__dirname,'..'),TOPOLOGY=path.join(ROOT,'examples/canon/topology'),REGISTRY=path.join(TOPOLOGY,'registry.json');
const cli=(...args)=>spawnSync(process.execPath,[path.join(ROOT,'tools/canon/trace-cli.mjs'),...args],{cwd:ROOT,encoding:'utf8'});
const span=(id,serviceName,operation,extra={})=>({traceId:'checkout-1',id,serviceName,operation,startMs:id==='submit'?0:5,durationMs:id==='submit'?40:10,...extra});
const trace=(insert={})=>({spans:[span('submit','platform-api','POST /checkout'),span('insert','platform-store','INSERT order',{parentId:'submit',...insert})]});

// The checkout consumer from examples/canon/topology, with trace selectors on the
// steps that cross the imported platform nodes. It is not in the registry.
function setup(t){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'trace-cli-imports-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const raw=JSON.parse(fs.readFileSync(path.join(TOPOLOGY,'checkout.json'),'utf8')),d=raw.page.sections[0].diagram;
  d.steps.find(s=>s.id==='request').traceMatch={serviceName:'platform-api',operation:'POST /checkout',nodeId:'platform::api'};
  d.steps.find(s=>s.id==='persist').traceMatch={serviceName:'platform-store',operation:'INSERT order',nodeId:'platform::store',parentStepId:'request'};
  const write=(name,value)=>{const file=path.join(dir,name);fs.writeFileSync(file,JSON.stringify(value,null,2));return file;};
  const examples=Object.fromEntries(fs.readdirSync(TOPOLOGY).map(name=>[name,fs.readFileSync(path.join(TOPOLOGY,name))]));
  return {dir,raw,write,spec:write('checkout.spec.json',raw),happy:write('happy.json',trace()),failed:write('failed.json',trace({error:true,statusCode:500})),
    unchanged(){for(const [name,bytes] of Object.entries(examples))assert.deepEqual(fs.readFileSync(path.join(TOPOLOGY,name)),bytes,name);}};
}

test('preview --resolve-imports maps steps to the imported namespaced nodes without touching the authored spec',t=>{
  const h=setup(t),before=fs.readFileSync(h.spec);
  const run=cli('preview','--spec',h.spec,'--trace',h.happy,'--resolve-imports',REGISTRY);
  assert.equal(run.status,0,run.stderr);
  const steps=JSON.parse(run.stdout).mapping.steps;
  assert.deepEqual(steps.map(s=>[s.stepId,s.nodeId,s.status]),[['request','platform::api','matched'],['persist','platform::store','matched']]);
  assert.deepEqual(fs.readFileSync(h.spec),before);h.unchanged();
});

test('reference and compare --resolve-imports output the authored spec with the new evidence and leave the input byte-identical',t=>{
  const h=setup(t),before=fs.readFileSync(h.spec),out=path.join(h.dir,'reference.json');
  const reference=cli('reference','--spec',h.spec,'--trace',h.happy,'--resolve-imports',REGISTRY,'--reason','Reviewed checkout mapping','--out',out);
  assert.equal(reference.status,0,reference.stderr);
  const approved=JSON.parse(fs.readFileSync(out,'utf8')),referenceTrace=approved.page.sections[0].diagram.referenceTrace;
  assert.equal(referenceTrace.approval.reason,'Reviewed checkout mapping');
  assert.deepEqual(referenceTrace.mapping,[{stepId:'request',spanIds:['submit']},{stepId:'persist',spanIds:['insert']}]);
  // The authored board plus referenceTrace: imports kept, no provider content inlined.
  delete approved.page.sections[0].diagram.referenceTrace;assert.deepEqual(approved,h.raw);
  assert.deepEqual(fs.readFileSync(h.spec),before);
  const overwrite=cli('reference','--spec',h.spec,'--trace',h.happy,'--resolve-imports',REGISTRY,'--reason','Reviewed','--out',h.spec);
  assert.equal(overwrite.status,1);assert.match(overwrite.stderr,/authored spec/);
  assert.deepEqual(fs.readFileSync(h.spec),before);
  const saved=fs.readFileSync(out),compare=cli('compare','--spec',out,'--trace',h.failed,'--resolve-imports',REGISTRY);
  assert.equal(compare.status,0,compare.stderr);
  assert.equal(JSON.parse(compare.stderr).firstDivergence,'persist');
  const d=JSON.parse(compare.stdout).page.sections[0].diagram,incident=d.paths.at(-1);
  assert.match(incident.id,/^incident-/);
  assert.deepEqual(d.steps.find(s=>s.id===incident.steps.at(-1)).nodes,['platform::store']);
  assert.deepEqual(d.topologyImports,h.raw.page.sections[0].diagram.topologyImports);
  assert.equal(d.topologyProvenance,undefined);assert.deepEqual(Object.keys(d.nodes),['client']);
  // The same overlay compare writes for the authored board without the option.
  const unresolved=cli('compare','--spec',out,'--trace',h.failed);
  assert.equal(unresolved.status,0,unresolved.stderr);assert.equal(unresolved.stdout,compare.stdout);assert.equal(unresolved.stderr,compare.stderr);
  assert.deepEqual(fs.readFileSync(out),saved);h.unchanged();
});

test('without --resolve-imports preview and reference exit 1 naming the option; resolver errors name it too',t=>{
  const h=setup(t),before=fs.readFileSync(h.spec);
  for(const command of ['preview','reference']){
    const run=cli(command,'--spec',h.spec,'--trace',h.happy,'--reason','Reviewed');
    assert.equal(run.status,1,command);assert.match(run.stderr,/--resolve-imports <repository folder or registry JSON>/,command);
  }
  const usage=cli('preview');
  assert.equal(usage.status,1);assert.match(usage.stderr,/\[--resolve-imports <repository folder or registry JSON>\]/);
  const registry=cli('preview','--spec',h.spec,'--trace',h.happy,'--resolve-imports',path.join(h.dir,'missing.json'));
  assert.equal(registry.status,1);assert.match(registry.stderr,/^--resolve-imports .*missing\.json: ENOENT/);
  const orphan=structuredClone(h.raw);orphan.page.sections[0].diagram.topologyImports[0].spec='inventory';
  const provider=cli('preview','--spec',h.write('orphan.spec.json',orphan),'--trace',h.happy,'--resolve-imports',REGISTRY);
  assert.equal(provider.status,1);assert.match(provider.stderr,/^--resolve-imports .*missing spec inventory/);
  assert.deepEqual(fs.readFileSync(h.spec),before);h.unchanged();
});

// #1175: an optional step on imported nodes that this trace lacks previews as
// optional, not in this trace, with no unknown condition.
test('preview --resolve-imports shows a missing optional step as optional, not in this trace',t=>{
  const h=setup(t),submitOnly=h.write('submit-only.json',{spans:[span('submit','platform-api','POST /checkout')]});
  const optional=structuredClone(h.raw);optional.page.sections[0].diagram.steps.find(s=>s.id==='persist').traceMatch.optional=true;
  const run=cli('preview','--spec',h.write('optional.spec.json',optional),'--trace',submitOnly,'--resolve-imports',REGISTRY);
  assert.equal(run.status,0,run.stderr);
  const persist=JSON.parse(run.stdout).mapping.steps.find(s=>s.stepId==='persist');
  assert.deepEqual([persist.nodeId,persist.status,persist.optional,persist.detail,persist.conditions],['platform::store','missing',true,'Optional, not in this trace.',[]]);
  const plainRun=cli('preview','--spec',h.spec,'--trace',submitOnly,'--resolve-imports',REGISTRY);
  assert.equal(plainRun.status,0,plainRun.stderr);
  const plainPersist=JSON.parse(plainRun.stdout).mapping.steps.find(s=>s.stepId==='persist');
  assert.equal(plainPersist.optional,undefined);assert.deepEqual(plainPersist.conditions.map(c=>c.label),['Not observed · outcome unknown'],'without optional the step stays unknown');
  // Compare: a missing optional step is not a divergence, and an incident step after the fork never claims it was observed.
  const out=path.join(h.dir,'optional-reference.json');
  assert.equal(cli('reference','--spec',h.write('optional.spec.json',optional),'--trace',h.happy,'--resolve-imports',REGISTRY,'--reason','Reviewed','--out',out).status,0);
  const quiet=cli('compare','--spec',out,'--trace',submitOnly,'--resolve-imports',REGISTRY);
  assert.equal(quiet.status,0,quiet.stderr);assert.equal(JSON.parse(quiet.stderr).firstDivergence,null);
  const failed=h.write('failed-submit-only.json',{spans:[span('submit','platform-api','POST /checkout',{error:true,statusCode:500})]});
  const fork=cli('compare','--spec',out,'--trace',failed,'--resolve-imports',REGISTRY);
  assert.equal(fork.status,0,fork.stderr);assert.equal(JSON.parse(fork.stderr).firstDivergence,'request');
  const d=JSON.parse(fork.stdout).page.sections[0].diagram,incident=d.steps.find(s=>s.id===d.paths.at(-1).steps.at(-1));
  assert.equal(incident.text,'Optional, not in this trace: platform-store · INSERT order');assert.equal(incident.evidence.canonicalStepId,'persist');
  h.unchanged();
});

// #1175 ruling (FV REQUESTS, 2026-11-09): a missing optional step does not block reference
// approval. The company's case: trace A holds step 1 and lacks optional step 2. A missing
// step without optional, and an ambiguous optional step, still block.
test('reference --resolve-imports approves a trace that lacks an optional step; missing or ambiguous steps still block',t=>{
  const h=setup(t),submitOnly=h.write('submit-only.json',{spans:[span('submit','platform-api','POST /checkout')]}),out=path.join(h.dir,'a-reference.json');
  const optional=structuredClone(h.raw);optional.page.sections[0].diagram.steps.find(s=>s.id==='persist').traceMatch.optional=true;
  const spec=h.write('optional.spec.json',optional),before=fs.readFileSync(spec);
  const preview=cli('preview','--spec',spec,'--trace',submitOnly,'--resolve-imports',REGISTRY);
  assert.equal(preview.status,0,preview.stderr);assert.equal(JSON.parse(preview.stdout).eligible,true,'preview: trace A is eligible');
  const approved=cli('reference','--spec',spec,'--trace',submitOnly,'--resolve-imports',REGISTRY,'--reason','Trace A','--out',out);
  assert.equal(approved.status,0,approved.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(out,'utf8')).page.sections[0].diagram.referenceTrace.mapping,[{stepId:'request',spanIds:['submit']}],'the reference records only the steps this trace holds');
  const compare=cli('compare','--spec',out,'--trace',submitOnly,'--resolve-imports',REGISTRY);
  assert.equal(compare.status,0,compare.stderr);assert.equal(JSON.parse(compare.stderr).firstDivergence,null);
  const blocked=/Every instrumented step must map uniquely/;
  const plain=cli('reference','--spec',h.spec,'--trace',submitOnly,'--resolve-imports',REGISTRY,'--reason','Trace A');
  assert.equal(plain.status,1,'a missing step without optional still blocks');assert.match(plain.stderr,blocked);
  const twice=h.write('twice.json',{spans:[span('submit','platform-api','POST /checkout'),span('insert','platform-store','INSERT order',{parentId:'submit'}),span('insert-2','platform-store','INSERT order',{parentId:'submit',startMs:20})]});
  const ambiguous=cli('reference','--spec',spec,'--trace',twice,'--resolve-imports',REGISTRY,'--reason','Twice');
  assert.equal(ambiguous.status,1,'an ambiguous optional step still blocks');assert.match(ambiguous.stderr,blocked);
  const none=structuredClone(optional);none.page.sections[0].diagram.steps.find(s=>s.id==='request').traceMatch.optional=true;
  const empty=cli('reference','--spec',h.write('all-optional.spec.json',none),'--trace',h.write('unrelated.json',{spans:[span('submit','other','GET /')]}),'--resolve-imports',REGISTRY,'--reason','Nothing');
  assert.equal(empty.status,1,'a trace with no instrumented step present is not a reference');assert.match(empty.stderr,blocked);
  assert.deepEqual(fs.readFileSync(spec),before);h.unchanged();
});
