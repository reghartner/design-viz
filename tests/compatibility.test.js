const {readSource} = require('../tools/source-loader.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {spawnSync}=require('node:child_process'),path=require('node:path'),os=require('node:os');
const context={};vm.runInNewContext(readSource('compatibility.js'),context);
const C=context.FlowviewCompatibility;
const spec=()=>({page:{contract:'1',title:'Compatibility test',blocks:[{tabs:[{label:'Story',sections:[{
  heading:'Doorbell',diagram:{nodes:{cam:{title:'Doorbell'}},rows:[['cam']],edges:[],
    panels:[{id:'home',type:'homemap'},{id:'phone',type:'deviceapp'}],
    steps:[{id:'start'},{id:'done'},{id:'lost',failures:{'cam->cloud':'dropped'}}],
    paths:[{id:'happy',steps:['start','done']},{id:'failed',steps:['start','lost']}],
    layouts:[{id:'home',steps:['start','done']}]}
}]}]}]}});
const plain=v=>JSON.parse(JSON.stringify(v));

test('semver compares numeric components, prereleases and metadata without lexical mistakes',()=>{
  for(const [a,b] of [['1.9.0','1.10.0'],['1.0.0-alpha','1.0.0-alpha.1'],['1.0.0-beta.2','1.0.0-beta.11'],
    ['1.0.0-9','1.0.0-alpha'],['1.0.0-rc.1','1.0.0'],['2.0.0','10.0.0']]){
    assert.equal(C.compare(a,b),-1);assert.equal(C.compare(b,a),1);
  }
  assert.equal(C.compare('1.0.0+company.1','1.0.0+other'),0);
  for(const version of ['1.0','v1.2.3','01.2.3','1.0.0-01',null])assert.equal(C.compare(version,'1.0.0'),null);
});
test('legacy specs still work and a newer authoring tool alone does not require an upgrade',()=>{
  const raw=spec();assert.equal(C.check(raw).status,'unversioned');assert.equal(C.check(raw).messages.length,0);
  raw.page.flowview={authoredWith:'9.0.0',minVersion:C.version};
  assert.equal(C.check(raw).status,'compatible');
});
test('reports required/installed releases and exact unavailable features across nested sections',()=>{
  const raw=spec(),detected=plain(C.detect(raw));
  assert.deepEqual(detected,['flow.alternates','flow.failures','layout.named','layout.step-subsets','panel.deviceapp','panel.homemap']);
  raw.page.flowview={minVersion:'1.10.0',features:['panel.future']};
  const available={...C.features};delete available['panel.deviceapp'];
  const result=C.check(raw,{version:'1.9.0',contract:'1',features:available});
  assert.equal(result.status,'partial');assert.equal(result.minVersion,'1.10.0');
  assert.deepEqual(plain(result.missingFeatures),['panel.deviceapp','panel.future']);
  assert.match(result.messages.join(' '),/Camera app panel/);assert.match(result.messages.join(' '),/1.9.0/);
  assert.match(result.messages.join(' '),/1.10.0/);
});
test('schema mismatches and malformed metadata are reported instead of claiming compatibility',()=>{
  const raw=spec();raw.page.contract='2';assert.equal(C.check(raw).status,'unsupported');
  raw.page.contract='1';
  for(const metadata of [[],false,'1',{minVersion:'latest'},{features:'homemap'},{authoredWith:42},{features:[null]}]){
    raw.page.flowview=metadata;assert.equal(C.check(raw).status,'partial');
    assert.ok(C.metadataWarnings(raw).length);
  }
});
test('stamping infers feature requirements, preserves future declarations and never mutates the editor value',()=>{
  const raw=spec();raw.page.flowview={minVersion:'9.0.0',features:['panel.future'],companyField:'kept'};
  const before=JSON.stringify(raw),stamped=C.stamp(raw);
  assert.equal(JSON.stringify(raw),before);assert.equal(stamped.page.flowview.minVersion,'9.0.0');
  assert.equal(stamped.page.flowview.authoredWith,C.version);assert.equal(stamped.page.flowview.companyField,'kept');
  assert.ok(stamped.page.flowview.features.includes('panel.future'));
  assert.ok(stamped.page.flowview.features.includes('panel.deviceapp'));
  assert.deepEqual(plain(C.stamp(stamped)),plain(stamped));
  assert.equal(C.stampText('{unfinished'),'{unfinished');
  assert.equal(C.stampText('{"value":1e400}'),'{"value":1e400}');
  assert.equal(C.stamp({nodes:{a:{}},rows:[['a']]}).page.contract,'1');
});
test('new feature release requirements are inferred rather than stamping every spec with the current editor version',()=>{
  const source=readSource('compatibility.js').replace("version = '0.1.0'","version = '2.0.0'");
  const newer={};vm.runInNewContext(source,newer);const N=newer.FlowviewCompatibility;
  N.features['panel.deviceapp'].since='1.2.0';
  const stamped=N.stamp(spec());
  assert.equal(stamped.page.flowview.authoredWith,'2.0.0');assert.equal(stamped.page.flowview.minVersion,'1.2.0');
});
test('all current panel types have an explicit compatibility capability',()=>{
  const validator={};vm.runInNewContext(readSource('validator.js'),validator);
  for(const type of validator.PANEL_TYPES)assert.ok(C.features['panel.'+type],type+' requires a capability entry');
  for(const feature of Object.values(C.features)){
    assert.notEqual(C.compare(feature.since,C.version),null);assert.ok(C.compare(feature.since,C.version)<=0);
  }
});
test('CLI stamps to stdout without changing input and exits nonzero for incompatible specs',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'flowview-compatibility-'));
  try{
    const file=path.join(dir,'spec.json'),raw=spec(),before=JSON.stringify(raw);fs.writeFileSync(file,before);
    const stamped=spawnSync(process.execPath,['tools/compatibility.js','--stamp',file],{encoding:'utf8'});
    assert.equal(stamped.status,0,stamped.stderr);assert.equal(JSON.parse(stamped.stdout).page.flowview.authoredWith,C.version);
    assert.equal(fs.readFileSync(file,'utf8'),before);
    raw.page.flowview={minVersion:'9.0.0'};fs.writeFileSync(file,JSON.stringify(raw));
    const checked=spawnSync(process.execPath,['tools/compatibility.js',file],{encoding:'utf8'});
    assert.equal(checked.status,1);assert.equal(JSON.parse(checked.stdout).status,'partial');
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
