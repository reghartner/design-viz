const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const {spawnSync}=require('node:child_process');
function fixture(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'flowview-aws-stage-'));const config=path.join(root,'config.json');fs.writeFileSync(config,JSON.stringify({api:'https://api.example',domain:'https://login.example',clientId:'public',scope:'flowview/projects',redirectUri:'https://editor.example/'}));return {root,config,out:path.join(root,'output'),run:()=>spawnSync(process.execPath,['deploy/aws/stage.mjs',config,path.join(root,'output')],{encoding:'utf8'})};}
test('public shell staging refuses populated directories and never deletes unrelated/private files',()=>{
 const f=fixture();try{fs.mkdirSync(f.out);fs.writeFileSync(path.join(f.out,'private.json'),'retain me');const result=f.run();assert.notEqual(result.status,0);assert.match(result.stderr,/must be empty/);assert.equal(fs.readFileSync(path.join(f.out,'private.json'),'utf8'),'retain me');}finally{fs.rmSync(f.root,{recursive:true,force:true});}
});
test('production packager rejects fake auth and plain HTTP configuration before any build',()=>{
 const f=fixture();try{const config=JSON.parse(fs.readFileSync(f.config));config.mock=true;fs.writeFileSync(f.config,JSON.stringify(config));assert.match(f.run().stderr,/mock auth is forbidden/);delete config.mock;config.api='http://localhost:8787';fs.writeFileSync(f.config,JSON.stringify(config));assert.match(f.run().stderr,/HTTPS/);assert.ok(!fs.existsSync(f.out));}finally{fs.rmSync(f.root,{recursive:true,force:true});}
});
test('SAM packaging allowlists production code and uses npm ci from reviewed lockfile',()=>{
 const make=fs.readFileSync('deploy/aws/Makefile','utf8');assert.match(make,/cp handler.mjs service.mjs aws-adapters.mjs package.json package-lock.json/);assert.match(make,/npm ci/);assert.ok(!make.includes('mock.mjs'));assert.ok(!make.includes('memory.mjs'));
});
