'use strict';
/* The normal Node CI job exercises the shipped image, including central membership.
   Local checkouts without Docker can still run the unit/browser contracts. */
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {execFileSync,spawnSync}=require('node:child_process');
const ROOT=path.join(__dirname,'..');
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
  for(const folder of ['deploy/workbench','tools/canon','workbench','template','src/starters']){
    fs.cpSync(path.join(ROOT,folder),path.join(directory,folder),{recursive:true});
  }
  const spec=JSON.parse(fs.readFileSync(path.join(ROOT,'examples/canon/specs/doorbell.json')));
  spec.page.canon.id='old-spec-id';
  spec.page.canon.kind='design';
  const source=path.join(directory,'diagrams/feature/feature.spec.json');
  fs.mkdirSync(path.dirname(source),{recursive:true});fs.writeFileSync(source,JSON.stringify(spec));
  fs.writeFileSync(path.join(directory,'diagrams/feature/feature.html'),'<!doctype html><title>Feature</title>');
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
    try{response=await fetch(url,{signal:AbortSignal.timeout(2000)});break;}
    catch(error){if(attempt===19)throw error;await new Promise(resolve=>setTimeout(resolve,100));}
  }
  assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-cache/);
  const library=await response.json();assert.equal(library.version,1);
  const expected=structuredClone(spec);expected.page.canon.id='feature';expected.page.canon.kind='canonical';
  assert.deepEqual(library.diagrams.map(d=>d.spec),[expected]);
  const canonResponse=await fetch('http://127.0.0.1:'+port+'/canon.json');
  assert.deepEqual(await canonResponse.json(),manifest);assert.match(canonResponse.headers.get('cache-control'),/no-cache/);
  assert.equal((await fetch('http://127.0.0.1:'+port+'/diagrams/feature/feature.html')).status,200);
  assert.deepEqual(JSON.parse(fs.readFileSync(source)),spec);
});
