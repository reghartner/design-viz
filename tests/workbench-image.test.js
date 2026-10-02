'use strict';
/* The normal Node CI job exercises the shipped image, including central membership.
   Local checkouts without Docker can still run the unit/browser contracts. */
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {execFileSync,spawnSync}=require('node:child_process');
const ROOT=path.join(__dirname,'..');
const {probeHttp}=require('./helpers/http-probe.js');
const dockerAvailable=spawnSync('docker',['info','--format','{{.ServerVersion}}'],{encoding:'utf8',timeout:10000}).status===0;

test('nginx image publishes central canon membership and replaces a stale library',{skip:!dockerAvailable && !process.env.CI,timeout:240000},async t=>{
  assert.ok(dockerAvailable,'Docker must be available in CI for the workbench image contract.');
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'flowview-image-'));
  const name='flowview-library-'+process.pid+'-'+Date.now(),image=name+':test';
  t.after(()=>{
    spawnSync('docker',['rm','-f',name],{timeout:10000,stdio:'ignore'});
    spawnSync('docker',['image','rm',image],{timeout:10000,stdio:'ignore'});
    fs.rmSync(directory,{recursive:true,force:true});
  });
  for(const folder of ['deploy/workbench','tools/canon','workbench','src','contract','cookbook','docs','.claude/skills/hld-to-page','examples/canon']){
    fs.cpSync(path.join(ROOT,folder),path.join(directory,folder),{recursive:true});
  }
  fs.copyFileSync(path.join(ROOT,'LICENSE'),path.join(directory,'LICENSE'));
  fs.rmSync(path.join(directory,'tools/canon/generated-runtime.cjs'),{force:true});
  // Exercise a fresh source-only image context, even if the local checkout was built.
  fs.rmSync(path.join(directory,'workbench/flowspec.html'),{force:true});
  for(const file of fs.readdirSync(path.join(ROOT,'tools'))){
    if(/\.(?:py|cjs|js)$/.test(file))fs.copyFileSync(path.join(ROOT,'tools',file),path.join(directory,'tools',file));
  }
  assert.equal(fs.existsSync(path.join(directory,'template/flowview.html')),false);
  const spec=JSON.parse(fs.readFileSync(path.join(ROOT,'examples/canon/specs/doorbell.json')));
  spec.page.canon.id='old-spec-id';
  spec.page.canon.kind='design';
  const source=path.join(directory,'diagrams/feature/feature.spec.json');
  fs.mkdirSync(path.dirname(source),{recursive:true});fs.writeFileSync(source,JSON.stringify(spec));
  const manifest={version:1,diagrams:[{folder:'diagrams/feature',owner:spec.page.canon.owner}]};
  fs.writeFileSync(path.join(directory,'canon.json'),JSON.stringify(manifest));
  fs.mkdirSync(path.join(directory,'diagrams/unlisted'));
  fs.writeFileSync(path.join(directory,'diagrams/unlisted/unlisted.spec.json'),JSON.stringify(spec));
  fs.writeFileSync(path.join(directory,'workbench/diagrams.json'),'{"version":0}');
  const docker=args=>execFileSync('docker',args,{encoding:'utf8',timeout:180000,maxBuffer:20*1024*1024});
  docker(['build','-f',path.join(directory,'deploy/workbench/Dockerfile'),'-t',image,directory]);
  docker(['run','--rm','-d','--name',name,'-p','127.0.0.1::80',image]);
  const port=docker(['inspect','--format','{{(index (index .NetworkSettings.Ports "80/tcp") 0).HostPort}}',name]).trim();
  assert.match(port,/^\d+$/);
  const url='http://127.0.0.1:'+port+'/workbench/diagrams.json';
  let response;
  for(let attempt=0;attempt<20;attempt++){
    try{response=await probeHttp(url,2000);break;}
    catch(error){if(attempt===19)throw error;await new Promise(resolve=>setTimeout(resolve,100));}
  }
  assert.equal(response.status,200);assert.match(response.headers['cache-control'],/no-cache/);
  const library=JSON.parse(response.body);assert.equal(library.version,2);
  const expected=structuredClone(spec);expected.page.canon.id='feature';expected.page.canon.kind='canonical';
  assert.equal(library.diagrams[0].spec,undefined);
  assert.deepEqual(library.diagrams[0].canon,expected.page.canon);
  const specResponse=await probeHttp(new URL(library.diagrams[0].specUrl,url).href,2000);
  assert.equal(specResponse.status,200);assert.deepEqual(JSON.parse(specResponse.body),expected);
  // The lazy library serves the derived snapshot; the authored source is a
  // separate URL and must retain its original membership metadata.
  const sourceResponse=await probeHttp('http://127.0.0.1:'+port+'/diagrams/feature/feature.spec.json',2000);
  assert.equal(sourceResponse.status,200);assert.deepEqual(JSON.parse(sourceResponse.body),spec);
  const canonResponse=await probeHttp('http://127.0.0.1:'+port+'/canon.json',2000);
  assert.deepEqual(JSON.parse(canonResponse.body),manifest);assert.match(canonResponse.headers['cache-control'],/no-cache/);
  const licenseResponse=await probeHttp('http://127.0.0.1:'+port+'/LICENSE',2000);
  assert.equal(licenseResponse.status,200);
  assert.equal(licenseResponse.body,fs.readFileSync(path.join(ROOT,'LICENSE'),'utf8'));
  const editorResponse=await probeHttp('http://127.0.0.1:'+port+'/workbench/flowspec.html',2000);
  assert.equal(editorResponse.status,200);assert.match(editorResponse.body,/id="workbench-welcome"/);
  const viewerResponse=await probeHttp('http://127.0.0.1:'+port+'/template/flowview.html',2000);
  assert.equal(viewerResponse.status,200);assert.match(viewerResponse.body,/id="flowspec"/);
  assert.deepEqual(JSON.parse(fs.readFileSync(source)),spec);
});
