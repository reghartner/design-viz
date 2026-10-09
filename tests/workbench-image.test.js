'use strict';
/* The normal Node CI job exercises the shipped image, including central membership.
   Local checkouts without Docker can still run the unit/browser contracts. */
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {execFileSync,spawnSync}=require('node:child_process');
const ROOT=path.join(__dirname,'..');
const {probeHttp}=require('./helpers/http-probe.js');
const dockerAvailable=spawnSync('docker',['info','--format','{{.ServerVersion}}'],{encoding:'utf8',timeout:10000}).status===0;

test('production and prebuilt images recursively copy the diagram tree',()=>{
  for(const dockerfile of ['Dockerfile','Dockerfile.prebuilt']){
    const text=fs.readFileSync(path.join(ROOT,'deploy/workbench',dockerfile),'utf8');
    assert.match(text,/COPY diagrams\/ diagrams\//);
    assert.match(text,/COPY (?:--from=build \/build\/)?diagrams\/ \/usr\/share\/nginx\/html\/diagrams\//);
  }
});

function prepareImageContext(directory){
  for(const folder of ['deploy/workbench','tools/canon','workbench','src','contract','cookbook','docs','.claude/skills/hld-to-page','examples/canon',
    'examples/contract-blocks','examples/data-contract','examples/doorbell-chime','examples/independent-extraction']){
    fs.cpSync(path.join(ROOT,folder),path.join(directory,folder),{recursive:true});
  }
  fs.copyFileSync(path.join(ROOT,'LICENSE'),path.join(directory,'LICENSE'));
  fs.rmSync(path.join(directory,'tools/canon/generated-runtime.cjs'),{force:true});
  // Exercise a fresh source-only image context, even if the local checkout was built.
  fs.rmSync(path.join(directory,'workbench/flowspec.html'),{force:true});
  for(const file of fs.readdirSync(path.join(ROOT,'tools'))){
    if(/\.(?:py|cjs|js)$/.test(file))fs.copyFileSync(path.join(ROOT,'tools',file),path.join(directory,'tools',file));
  }
  fs.mkdirSync(path.join(directory,'tools/arrange'),{recursive:true});
  for(const file of fs.readdirSync(path.join(ROOT,'tools/arrange'))){
    if(/\.(?:cjs|js|json)$/.test(file))fs.copyFileSync(path.join(ROOT,'tools/arrange',file),path.join(directory,'tools/arrange',file));
  }
  assert.equal(fs.existsSync(path.join(directory,'template/flowview.html')),false);
  const spec=JSON.parse(fs.readFileSync(path.join(ROOT,'examples/canon/specs/doorbell.json')));
  spec.page.canon.id='old-spec-id';
  spec.page.canon.kind='design';
  const source=path.join(directory,'diagrams/product-area/feature/feature.spec.json');
  fs.mkdirSync(path.dirname(source),{recursive:true});fs.writeFileSync(source,JSON.stringify(spec));
  const manifest={version:1,diagrams:[{folder:'diagrams/product-area/feature',owner:spec.page.canon.owner}]};
  fs.writeFileSync(path.join(directory,'canon.json'),JSON.stringify(manifest));
  fs.mkdirSync(path.join(directory,'diagrams/unlisted'));
  fs.writeFileSync(path.join(directory,'diagrams/unlisted/unlisted.spec.json'),JSON.stringify(spec));
  fs.writeFileSync(path.join(directory,'workbench/diagrams.json'),'{"version":0}');
  return {source,spec,manifest};
}

test('image fixture contains every literal Docker COPY source without requiring Docker',t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'flowview-image-inputs-'));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  prepareImageContext(directory);
  const dockerfile=fs.readFileSync(path.join(ROOT,'deploy/workbench/Dockerfile'),'utf8');
  for(const line of dockerfile.split('\n').filter(line=>/^COPY\s/.test(line)&&!line.includes('--from='))){
    for(const source of line.trim().split(/\s+/).slice(1,-1)){
      if(!/[?*[]/.test(source))assert.ok(fs.existsSync(path.join(directory,source)),`Missing image fixture input: ${source}`);
    }
  }
});

test('image source fixture builds without Docker or preexisting generated arrangement inputs',t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'flowview-image-source-'));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  prepareImageContext(directory);
  for(const file of ['tools/compose-page-layout.cjs','tools/arrange/core.cjs','tools/arrange/estimate.cjs'])
    assert.equal(fs.readFileSync(path.join(directory,file),'utf8'),fs.readFileSync(path.join(ROOT,file),'utf8'));
  for(const file of ['tools/arrange/generated-native.html','tools/arrange/node_modules','tools/canon/generated-runtime.cjs','workbench/flowspec.html'])
    assert.equal(fs.existsSync(path.join(directory,file)),false,file);
  execFileSync('python3',['tools/build.py'],{cwd:directory,encoding:'utf8',timeout:60000,maxBuffer:20*1024*1024});
  const html=fs.readFileSync(path.join(directory,'workbench/flowspec.html'),'utf8');
  const envelope=JSON.parse(html.match(/<script[^>]+id="flowview-folder-kit"[^>]*>(.*?)<\/script>/s)[1]);
  const kit=JSON.parse(require('node:zlib').gunzipSync(Buffer.from(envelope.gzip,'base64'))).files;
  for(const file of ['examples/contract-blocks/contract-blocks.spec.json','examples/data-contract/data-contract.spec.json',
    'examples/doorbell-chime/doorbell-chime.spec.json','examples/independent-extraction/README.md','examples/independent-extraction/before.spec.json']){
    assert.equal(kit[file],fs.readFileSync(path.join(ROOT,file),'utf8'),`Offline kit reference: ${file}`);
  }
});

test('nginx image publishes central canon membership and replaces a stale library',{skip:!dockerAvailable && !process.env.CI,timeout:240000},async t=>{
  assert.ok(dockerAvailable,'Docker must be available in CI for the workbench image contract.');
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'flowview-image-'));
  const name='flowview-library-'+process.pid+'-'+Date.now(),image=name+':test';
  t.after(()=>{
    spawnSync('docker',['rm','-f',name],{timeout:10000,stdio:'ignore'});
    spawnSync('docker',['image','rm',image],{timeout:10000,stdio:'ignore'});
    fs.rmSync(directory,{recursive:true,force:true});
  });
  const {source,spec,manifest}=prepareImageContext(directory);
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
  const library=JSON.parse(response.body);assert.equal(library.version,3);
  const expected=structuredClone(spec);expected.page.canon.id='feature';expected.page.canon.kind='canonical';
  assert.equal(library.diagrams[0].spec,undefined);
  assert.equal(library.diagrams[0].specUrl,'../diagrams/product-area/feature/feature.spec.json');
  assert.deepEqual(library.diagrams[0].canon,expected.page.canon);
  const specResponse=await probeHttp(new URL(library.diagrams[0].specUrl,url).href,2000);
  assert.equal(specResponse.status,200);assert.deepEqual(JSON.parse(specResponse.body),spec);
  // The lazy library serves authored JSON. Membership is applied in memory.
  const sourceResponse=await probeHttp('http://127.0.0.1:'+port+'/diagrams/product-area/feature/feature.spec.json',2000);
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
