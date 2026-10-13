'use strict';
/* tools/backstage-pack.mjs packs or publishes apps/backstage with the fork's
   repository URL and registry, without editing apps/backstage/package.json. */
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const ROOT=path.join(__dirname,'..');
const PACKAGE=path.join(ROOT,'apps/backstage/package.json');
const tool=()=>import(require('node:url').pathToFileURL(path.join(ROOT,'tools/backstage-pack.mjs')).href);

test('package identity comes from the environment, then company.json, then nothing',async()=>{
  const {packageIdentity,stagedManifest}=await tool();
  assert.deepEqual(packageIdentity({env:{},company:null}),{repositoryUrl:null,registry:null});
  assert.deepEqual(packageIdentity({env:{},company:{repository:'https://github.com/acme/design-viz',package:{}}}),
    {repositoryUrl:'git+https://github.com/acme/design-viz.git',registry:null});
  assert.deepEqual(packageIdentity({env:{},company:{repository:'https://github.com/acme/design-viz',package:{repositoryUrl:'git+ssh://git@example.test/acme/viz.git',registry:'https://npm.acme.test/'}}}),
    {repositoryUrl:'git+ssh://git@example.test/acme/viz.git',registry:'https://npm.acme.test/'});
  assert.deepEqual(packageIdentity({env:{FLOWVIEW_PACKAGE_REPOSITORY_URL:'git+https://example.test/a/b.git',FLOWVIEW_PACKAGE_REGISTRY:'https://registry.example.test/'},
    company:{repository:'https://github.com/acme/design-viz',package:{registry:'https://npm.acme.test/'}}}),
    {repositoryUrl:'git+https://example.test/a/b.git',registry:'https://registry.example.test/'});
  assert.throws(()=>packageIdentity({env:{FLOWVIEW_PACKAGE_REGISTRY:'ftp://x'}}),/registry must be an http\(s\) URL/);
  const manifest=JSON.parse(fs.readFileSync(PACKAGE,'utf8'));
  const staged=stagedManifest(manifest,{repositoryUrl:'git+https://example.test/a/b.git',registry:'https://registry.example.test/'});
  assert.deepEqual(staged.repository,{...manifest.repository,url:'git+https://example.test/a/b.git'});
  assert.deepEqual(staged.publishConfig,{registry:'https://registry.example.test/'});
  const {repository,publishConfig,...rest}=staged,{repository:r0,publishConfig:p0,...original}=manifest;
  assert.deepEqual(rest,original);
  assert.deepEqual(stagedManifest(manifest,{repositoryUrl:null,registry:null}),manifest);
});

test('the staged package is named on the npm command line, so npm keeps apps/backstage config',async()=>{
  const {stagedCommand}=await tool();
  assert.deepEqual(stagedCommand('pack',['--pack-destination','/out','--ignore-scripts','--json'],'/tmp/stage'),
    ['pack','/tmp/stage','--pack-destination','/out','--json','--ignore-scripts']);
  assert.deepEqual(stagedCommand('publish',['--tag','next'],'/tmp/stage'),['publish','/tmp/stage','--tag','next','--ignore-scripts']);
  const source=fs.readFileSync(path.join(ROOT,'tools/backstage-pack.mjs'),'utf8');
  assert.match(source,/run\(stagedCommand\(command, args, staging\), source\)/);
});

function packed(t,env){
  const destination=fs.mkdtempSync(path.join(os.tmpdir(),'flowview-pack-identity-'));
  t.after(()=>fs.rmSync(destination,{recursive:true,force:true}));
  const before=fs.readFileSync(PACKAGE);
  execFileSync(process.execPath,['tools/backstage-pack.mjs','pack','--ignore-scripts','--pack-destination',path.relative(ROOT,destination)],
    {cwd:ROOT,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:120000,
      env:{...process.env,FLOWVIEW_COMPANY_IDENTITY:'off',FLOWVIEW_PACKAGE_REPOSITORY_URL:'',FLOWVIEW_PACKAGE_REGISTRY:'',...env}});
  assert.ok(before.equals(fs.readFileSync(PACKAGE)),'apps/backstage/package.json is never edited');
  const [tarball]=fs.readdirSync(destination).filter(name=>name.endsWith('.tgz'));
  assert.ok(tarball,'tarball written to the relative --pack-destination');
  const file=path.join(destination,tarball);
  return {manifest:JSON.parse(execFileSync('tar',['-xOf',file,'package/package.json'],{encoding:'utf8'})),
    files:execFileSync('tar',['-tzf',file],{encoding:'utf8'}).trim().split('\n').sort()};
}

test('packing with configured identity changes only repository.url and publishConfig.registry',{skip:process.platform==='win32'},t=>{
  const plain=packed(t,{}),source=JSON.parse(fs.readFileSync(PACKAGE,'utf8'));
  assert.deepEqual(plain.manifest,source);
  const identity=packed(t,{FLOWVIEW_PACKAGE_REPOSITORY_URL:'git+https://github.com/acme/design-viz.git',FLOWVIEW_PACKAGE_REGISTRY:'https://npm.acme.test/'});
  assert.deepEqual(identity.files,plain.files);
  assert.equal(identity.manifest.repository.url,'git+https://github.com/acme/design-viz.git');
  assert.equal(identity.manifest.repository.directory,source.repository.directory);
  assert.deepEqual(identity.manifest.publishConfig,{registry:'https://npm.acme.test/'});
  if(source.publishConfig)identity.manifest.publishConfig=source.publishConfig;
  else delete identity.manifest.publishConfig;
  identity.manifest.repository.url=source.repository.url;
  assert.deepEqual(identity.manifest,source);
});
