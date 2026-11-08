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

test('reference and compare --resolve-imports produce output and leave the authored spec byte-identical',t=>{
  const h=setup(t),before=fs.readFileSync(h.spec),out=path.join(h.dir,'reference.json');
  const reference=cli('reference','--spec',h.spec,'--trace',h.happy,'--resolve-imports',REGISTRY,'--reason','Reviewed checkout mapping','--out',out);
  assert.equal(reference.status,0,reference.stderr);
  const referenceTrace=JSON.parse(fs.readFileSync(out,'utf8')).page.sections[0].diagram.referenceTrace;
  assert.equal(referenceTrace.approval.reason,'Reviewed checkout mapping');
  assert.deepEqual(referenceTrace.mapping,[{stepId:'request',spanIds:['submit']},{stepId:'persist',spanIds:['insert']}]);
  assert.deepEqual(fs.readFileSync(h.spec),before);
  // The resolved copy must never replace the authored file.
  const overwrite=cli('reference','--spec',h.spec,'--trace',h.happy,'--resolve-imports',REGISTRY,'--reason','Reviewed','--out',h.spec);
  assert.equal(overwrite.status,1);assert.match(overwrite.stderr,/authored spec/);
  assert.deepEqual(fs.readFileSync(h.spec),before);
  // An authored consumer that keeps its imports and carries the approved reference.
  const approved=structuredClone(h.raw);approved.page.sections[0].diagram.referenceTrace=referenceTrace;
  const authored=h.write('approved.spec.json',approved),saved=fs.readFileSync(authored);
  const compare=cli('compare','--spec',authored,'--trace',h.failed,'--resolve-imports',REGISTRY);
  assert.equal(compare.status,0,compare.stderr);
  assert.equal(JSON.parse(compare.stderr).firstDivergence,'persist');
  const d=JSON.parse(compare.stdout).page.sections[0].diagram,incident=d.paths.at(-1);
  assert.match(incident.id,/^incident-/);
  assert.deepEqual(d.steps.find(s=>s.id===incident.steps.at(-1)).nodes,['platform::store']);
  assert.ok(d.nodes['platform::store']);
  assert.deepEqual(fs.readFileSync(authored),saved);h.unchanged();
});

test('without --resolve-imports a spec with topology imports exits 1 and names the option',t=>{
  const h=setup(t),before=fs.readFileSync(h.spec);
  for(const command of ['preview','reference','compare']){
    const run=cli(command,'--spec',h.spec,'--trace',h.happy,'--reason','Reviewed');
    assert.equal(run.status,1,command);assert.match(run.stderr,/--resolve-imports <repository folder or registry JSON>/,command);
  }
  const usage=cli('preview');
  assert.equal(usage.status,1);assert.match(usage.stderr,/\[--resolve-imports <repository folder or registry JSON>\]/);
  assert.deepEqual(fs.readFileSync(h.spec),before);
});
