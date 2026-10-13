const test=require('node:test'),assert=require('node:assert/strict');
const {check}=require('../tools/visibility-check.cjs');
const {fixture,expectation}=require('./fixtures/visibility-evidence.cjs');
const report=(spec,rows)=>check(spec,{version:1,expectations:rows});
function topologyFixture(){
 const fs=require('node:fs'),path=require('node:path'),consumer=fixture();
 consumer.page.canon={version:1,id:'visibility-consumer',kind:'design',owner:'group:default/test'};
 consumer.page.sections[0].diagram.topologyImports=[{spec:'platform',export:'core',as:'platform'}];
 consumer.page.blocks=consumer.page.sections;consumer.page.sections=[];
 const provider=JSON.parse(fs.readFileSync(path.join(__dirname,'../examples/canon/topology/platform.json'),'utf8'));
 return {consumer,provider};
}

test('visibility distinguishes carried values from home, hidden card and carried whole-panel eligibility without mutation',()=>{
 const raw=fixture(),before=JSON.stringify(raw);
 const rows=['wait','open','hide-card','hide-panel','restore','shared'].map(step=>expectation({step}));
 const output=report(raw,rows);
 assert.deepEqual(output.results.map(r=>r.status),['fail','pass','fail','fail','pass','pass']);
 assert.match(output.results[0].reason,/phoneScreen=home/);
 assert.match(output.results[2].reason,/Card visible=false/);
 assert.match(output.results[3].reason,/Panel hidden/);
 assert.equal(JSON.stringify(raw),before);
 assert.ok(report(raw,[expectation({step:'wait',visible:false})]).ok);
});
test('all panel types support content visibility while unsupported fields never become hidden successes',()=>{
 const raw=fixture(),d=raw.page.sections[0].diagram;d.panels[1].visible=false;
 assert.ok(report(raw,[expectation({panel:'state',field:undefined,visible:false})]).ok);
 const unsupported=report(raw,[expectation({panel:'state',field:'state',visible:false}),expectation({field:'battery.value'}),expectation({field:'nope'})]);
 assert.deepEqual(unsupported.results.map(r=>r.status),['unsupported','unsupported','unsupported']);
});
test('named view membership and skipped stops are distinct from hidden panels; paths fold independently',()=>{
 const raw=fixture();
 const output=report(raw,[expectation({step:'shared'}),expectation({step:'shared',path:'offline'}),expectation({step:'shared'}),expectation({view:'summary',step:'shared'}),expectation({view:'summary',step:'open',visible:false}),expectation({view:'summary',path:'offline',step:'shared',visible:false})]);
 assert.deepEqual(output.results.map(r=>r.status),['pass','fail','pass','fail','invalid','invalid']);
 assert.match(output.results[3].reason,/layout/);assert.match(output.results[4].reason,/filtered/);assert.match(output.results[5].reason,/excluded/);
 const d=raw.page.sections[0].diagram;d.layouts[1].sectionLayout.default[0].hidden=false;
 assert.ok(report(raw,[expectation({view:'summary',step:'shared'})]).ok,'skipped restore still carries into shared');
});
test('canonical identities, unknown, malformed and unreachable targets never silently fall back',()=>{
 const raw=fixture();
 assert.deepEqual(report(raw,[expectation({section:'Arrival'}),expectation({view:'flow'}),expectation({path:'missing'}),expectation({step:'missing'}),expectation({panel:'missing'}),expectation({visible:'true'}),expectation({selector:'body'})]).results.map(r=>r.status),Array(7).fill('invalid'));
 assert.throws(()=>check(raw,{version:1,expectations:[]}),/at least one/);
 raw.page.sections[0].diagram.view='ambient-only';assert.equal(report(raw,[expectation()]).results[0].status,'invalid');
});
test('tabs and numeric step ID collisions retain canonical addressing',()=>{
 const raw=fixture(),sec=raw.page.sections[0];sec.diagram.steps[1].id='1';sec.diagram.paths[0].steps[1]='1';raw.page.sections=[{heading:'Introduction',text:'Prose'},{tabs:[{label:'First',sections:[{heading:'Nothing',text:'Here'}]},{label:'Second',sections:[sec]}]}];
 const result=report(raw,[expectation({step:'1'})]).results[0];assert.equal(result.status,'pass');assert.equal(result.resolved.sectionNumber,3);assert.equal(result.resolved.sourceIndex,1);
});

test('duplicate named views are ambiguous even though viewer normalization keeps the first',()=>{
 const raw=fixture();raw.page.sections[0].diagram.layouts.push(structuredClone(raw.page.sections[0].diagram.layouts[0]));
 assert.equal(report(raw,[expectation()]).results[0].status,'invalid');
});

test('CLI reports nonzero failures and malformed input without writing either input',()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'visibility-cli-'));
 try{
  const spec=path.join(dir,'spec.json'),expect=path.join(dir,'expect.json');fs.writeFileSync(spec,JSON.stringify(fixture()));
  fs.writeFileSync(expect,JSON.stringify({version:1,expectations:[expectation({step:'wait'})]}));
  const before=[fs.readFileSync(spec,'utf8'),fs.readFileSync(expect,'utf8')];
  const run=()=>spawnSync(process.execPath,[require.resolve('../tools/visibility-check.cjs'),spec,expect],{encoding:'utf8'});
  const fail=run();assert.equal(fail.status,1);assert.equal(JSON.parse(fail.stdout).results[0].status,'fail');
  assert.deepEqual([fs.readFileSync(spec,'utf8'),fs.readFileSync(expect,'utf8')],before);
  fs.writeFileSync(expect,'{"version":2}');assert.equal(run().status,2);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('both-alias imported topology resolves from providers without mutating programmatic inputs',()=>{
 const {consumer,provider}=topologyFixture(),expectations={version:1,expectations:[expectation({step:'open'})]};
 const before=structuredClone([consumer,provider,expectations]);
 const output=check(consumer,expectations,[provider]);
 assert.equal(output.ok,true);assert.deepEqual([consumer,provider,expectations],before);
 assert.throws(()=>check(consumer,expectations),/Topology visibility-consumer.*missing spec platform/);
});

test('CLI accepts providers for both-alias topology and reserves exit 2 for missing topology',()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'visibility-topology-cli-'));
 try{
  const {consumer,provider}=topologyFixture(),spec=path.join(dir,'consumer.json'),providerFile=path.join(dir,'platform.json'),expect=path.join(dir,'expect.json');
  fs.writeFileSync(spec,JSON.stringify(consumer));fs.writeFileSync(providerFile,JSON.stringify(provider));
  fs.writeFileSync(expect,JSON.stringify({version:1,expectations:[expectation({step:'open'})]}));
  const before=[spec,providerFile,expect].map(file=>fs.readFileSync(file,'utf8'));
  const cli=require.resolve('../tools/visibility-check.cjs');
  const success=spawnSync(process.execPath,[cli,spec,expect,providerFile],{encoding:'utf8'});
  assert.equal(success.status,0,success.stderr);assert.equal(JSON.parse(success.stdout).ok,true);
  const missing=spawnSync(process.execPath,[cli,spec,expect],{encoding:'utf8'});
  assert.equal(missing.status,2);assert.match(missing.stderr,/missing spec platform/);
  assert.deepEqual([spec,providerFile,expect].map(file=>fs.readFileSync(file,'utf8')),before);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
