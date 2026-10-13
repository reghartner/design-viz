'use strict';
/* Small generic behaviors company forks otherwise patch locally. */
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const {packedArtifact}=require('../tools/npm-pack-json.cjs');
const {resolveContainerPort,imageContainerPort}=require('./helpers/container-port.js');

test('npm pack --json artifacts parse from the npm 11 array and the npm 12 keyed object',()=>{
  const record={id:'@flowview/backstage-plugin@1.1.0',filename:'flowview-backstage-plugin-1.1.0.tgz',entryCount:3,size:10};
  assert.deepEqual(packedArtifact(JSON.stringify([record])),record);
  assert.deepEqual(packedArtifact(JSON.stringify({'@flowview/backstage-plugin':record})),record);
  assert.throws(()=>packedArtifact('[]','npm warn nothing packed'),/no artifact filename[\s\S]*stdout:\n\[\][\s\S]*stderr:\nnpm warn nothing packed/);
  assert.throws(()=>packedArtifact('null'),/no artifact filename/);
  assert.throws(()=>packedArtifact('{"pkg":{"id":"x"}}'),/no artifact filename/);
  assert.throws(()=>packedArtifact('npm ERR! oops','details'),/did not print JSON[\s\S]*npm ERR! oops[\s\S]*details/);
});

test('the installed npm reports the Backstage package artifact in a parseable shape',()=>{
  const npm=process.platform==='win32'?'npm.cmd':'npm';
  const stdout=execFileSync(npm,['pack','--dry-run','--json','--ignore-scripts'],
    {cwd:path.join(__dirname,'../apps/backstage'),encoding:'utf8',timeout:60000,stdio:['ignore','pipe','pipe']});
  assert.match(packedArtifact(stdout).filename,/^flowview-backstage-plugin-.+\.tgz$/);
});

test('the image container port comes from FLOWVIEW_IMAGE_PORT, then a single exposed TCP port, then 80',()=>{
  assert.equal(resolveContainerPort({env:{}}),80);
  assert.equal(resolveContainerPort({env:{},exposedPorts:null}),80);
  assert.equal(resolveContainerPort({env:{},exposedPorts:{'8080/tcp':{}}}),8080);
  assert.equal(resolveContainerPort({env:{},exposedPorts:{'8080/tcp':{},'53/udp':{}}}),8080);
  assert.equal(resolveContainerPort({env:{FLOWVIEW_IMAGE_PORT:'9000'},exposedPorts:{'8080/tcp':{}}}),9000);
  assert.equal(resolveContainerPort({env:{FLOWVIEW_IMAGE_PORT:''},exposedPorts:{'8080/tcp':{}}}),8080);
  assert.throws(()=>resolveContainerPort({env:{},exposedPorts:{'80/tcp':{},'8080/tcp':{}}}),/several TCP ports \(80, 8080\)[\s\S]*FLOWVIEW_IMAGE_PORT/);
  for(const bad of ['0','65536','80/tcp','http','8.5'])
    assert.throws(()=>resolveContainerPort({env:{FLOWVIEW_IMAGE_PORT:bad}}),/FLOWVIEW_IMAGE_PORT must be a TCP port/,bad);
  // The environment override never needs Docker.
  assert.equal(imageContainerPort('unused:image',{env:{FLOWVIEW_IMAGE_PORT:'8080'},docker:'/nonexistent/docker'}),8080);
});

test('without an override, the image port is read from the image configuration',{skip:process.platform==='win32'},t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'flowview-fake-docker-'));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const docker=path.join(directory,'docker'),log=path.join(directory,'args');
  const fake=ports=>fs.writeFileSync(docker,'#!/bin/sh\nprintf "%s\\n" "$@" > '+JSON.stringify(log)+'\nprintf \'%s\\n\' '+JSON.stringify(ports)+'\n',{mode:0o755});
  fake('{"8080/tcp":{}}');
  assert.equal(imageContainerPort('fork:test',{env:{},docker}),8080);
  assert.deepEqual(fs.readFileSync(log,'utf8').trim().split('\n'),['image','inspect','--format','{{json .Config.ExposedPorts}}','fork:test']);
  fake('null');
  assert.equal(imageContainerPort('fork:test',{env:{},docker}),80);
});
