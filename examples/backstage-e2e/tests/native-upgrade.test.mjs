import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,access,symlink} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {vendorFlowview} from '../fixtures/designer/scripts/vendor-flowview.mjs';
const exec=promisify(execFile);
const setup=fileURLToPath(new URL('../fixtures/mock/scripts/setup-sandbox.mjs',import.meta.url));
async function file(root,name,content){await mkdir(path.dirname(path.join(root,name)),{recursive:true});await writeFile(path.join(root,name),content);}
test('repeat setup replaces the owned plugin tree without changing sibling files or local credentials',async()=>{
  const temp=await mkdtemp(path.join(tmpdir(),'native-setup-'));
  try{
    const designer=path.join(temp,'designer'),mock=path.join(temp,'mock');await mkdir(mock);
    await file(designer,'apps/backstage/src/generated/nativeViewer.js','export const native=true;');
    await file(designer,'apps/backstage/node_modules/ignored.js','dependency');
    await file(mock,'sandbox/backstage/plugins/other/keep.txt','other plugin');
    await exec(process.execPath,[setup,designer],{cwd:mock});
    await assert.rejects(exec(process.execPath,[setup,path.join(temp,'missing')],{cwd:mock}));
    assert.equal(await readFile(path.join(mock,'sandbox/backstage/plugins/flowview/src/generated/nativeViewer.js'),'utf8'),'export const native=true;');
    const secrets=await readFile(path.join(mock,'.local/secrets.json'),'utf8');
    await file(mock,'sandbox/backstage/plugins/flowview/src/generated/viewerDocument.ts','retired iframe');
    await file(mock,'sandbox/backstage/plugins/flowview/viewer/frame.js','retired code');
    await file(mock,'sandbox/backstage/plugins/flowview/tests/frame-navigation.test.ts','retired test');
    await exec(process.execPath,[setup,designer],{cwd:mock});
    for(const name of ['src/generated/viewerDocument.ts','viewer/frame.js','tests/frame-navigation.test.ts','node_modules/ignored.js'])
      await assert.rejects(access(path.join(mock,'sandbox/backstage/plugins/flowview',name)),{code:'ENOENT'});
    assert.equal(await readFile(path.join(mock,'sandbox/backstage/plugins/flowview/src/generated/nativeViewer.js'),'utf8'),'export const native=true;');
    assert.equal(await readFile(path.join(mock,'sandbox/backstage/plugins/other/keep.txt'),'utf8'),'other plugin');
    assert.equal(await readFile(path.join(mock,'.local/secrets.json'),'utf8'),secrets);
    const {backend:{csp}}=JSON.parse(await readFile(path.join(mock,'sandbox/backstage/app-config.local.yaml'),'utf8'));
    assert.deepEqual(csp['script-src'],["'self'"]);assert.deepEqual(csp['script-src-elem'],["'self'"]);
    assert.ok(csp['font-src'].includes('data:'));assert.ok(csp['img-src'].includes('data:'));assert.equal(csp['frame-src'],undefined);
  }finally{await rm(temp,{recursive:true,force:true});}
});
test('runtime vendoring removes obsolete plugin files before the next sandbox copy',async()=>{
  const temp=await mkdtemp(path.join(tmpdir(),'native-vendor-'));
  try{
    const source=path.join(temp,'source'),designer=path.join(temp,'designer');await mkdir(source);await mkdir(designer);
    await file(source,'LICENSE','fixture');await file(source,'apps/backstage/src/generated/nativeViewer.js','export const native=true;');
    for(const args of [['init','--quiet'],['config','user.name','Fixture'],['config','user.email','fixture@example.test'],['remote','add','origin','https://github.com/fixture/runtime'],['add','.'],['commit','--quiet','-m','Native fixture']])await exec('git',args,{cwd:source});
    await file(designer,'apps/backstage/viewer/frame.js','retired');await file(designer,'specs/company.json','company data');
    await vendorFlowview(source,designer);
    await assert.rejects(access(path.join(designer,'apps/backstage/viewer/frame.js')),{code:'ENOENT'});
    assert.equal(await readFile(path.join(designer,'specs/company.json'),'utf8'),'company data');
    assert.equal(await readFile(path.join(designer,'apps/backstage/src/generated/nativeViewer.js'),'utf8'),'export const native=true;');
    await assert.rejects(vendorFlowview(source,source),/separate designer/);
    const alias=path.join(temp,'source-alias');await symlink(source,alias,'dir');
    await assert.rejects(vendorFlowview(source,alias),/separate designer/);
    await assert.rejects(vendorFlowview(source,path.join(alias,'new-designer')),/separate designer/);
    assert.equal(await readFile(path.join(source,'apps/backstage/src/generated/nativeViewer.js'),'utf8'),'export const native=true;');
  }finally{await rm(temp,{recursive:true,force:true});}
});
