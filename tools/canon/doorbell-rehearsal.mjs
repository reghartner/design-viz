#!/usr/bin/env node
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,mkdtemp,cp,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import {scan,decide,effectiveSpecs,reportMarkdown} from './drift.mjs';
import {LocalGitSources,localGitEnvironment} from './local-git.mjs';
import {atomicJSON} from './registry.mjs';
import C from './core.cjs';
const exec=promisify(execFile),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const app=path.join(root,'examples/canon/doorbell-app'),repository='https://example.test/doorbell-app';

async function processResult(command,args,cwd) {
  // This is an independent test run, not a child participating in the outer
  // node:test runner's IPC protocol (when the rehearsal itself is under test).
  const env={...process.env};delete env.NODE_TEST_CONTEXT;
  try {const r=await exec(command,args,{cwd,env,encoding:'utf8',maxBuffer:2_000_000,timeout:15000});return {exitCode:0,...r};}
  catch(e){if(e.killed || e.signal || !Number.isInteger(e.code))throw e;return {exitCode:e.code,stdout:e.stdout,stderr:e.stderr};}
}
function sampleSpec(raw,revision,texts) {
  const spec=C.clone(raw),d=C.sections(spec)[0].diagram;
  spec.page.title='Doorbell sample app · code drift rehearsal';spec.page.canon.id='doorbell-app-demo';
  C.sections(spec)[0].heading='Button press, recording, resident notification';
  C.sections(spec)[0].text=['An executable fictional app with in-memory storage and push delivery. Source revisions refer to the local rehearsal repository, not a hosted company service.'];
  delete d.nodes.database;delete d.nodes.queue;d.rows=[['camera','hub'],['cloud','phone']];
  d.edges=d.edges.filter(e=>e.from!=='cloud' || !['database','queue'].includes(e.to));
  d.edges.find(e=>e.to==='phone').from='cloud';
  d.steps=d.steps.filter(s=>!['persist','enqueue'].includes(s.id));
  d.panels=d.panels.filter(p=>p.id!=='delivery');
  const notify=d.steps.find(s=>s.id==='notify');notify.edge='cloud->phone';notify.traceMatch.parentStepId='upload';delete notify.panels.delivery;
  for(const hit of C.references(spec)){
    const r=hit.reference,location=C.locate(texts[r.path],r.anchor);assert.ok(!location.error,location.error);
    r.repository=repository;r.revision=revision;r.startLine=location.startLine;r.endLine=location.endLine;
  }
  const errors=C.validateSpec(spec).errors;assert.equal(errors.length,0,errors.join('\n'));
  return spec;
}
export async function runDoorbellRehearsal({outDir,parentDir=path.join(root,'.local/doorbell-rehearsals')}={}) {
  let directory;
  if(outDir){directory=path.resolve(outDir);await mkdir(path.dirname(directory),{recursive:true});await mkdir(directory);}
  else {await mkdir(parentDir,{recursive:true});directory=await mkdtemp(path.join(parentDir,'run-'));}
  const checkout=path.join(directory,'source');await mkdir(checkout);
  // Only this checked-in, dependency-free sample app is executed. Callers
  // cannot select an arbitrary repository, command, revision, or patch.
  for(const entry of ['src','package.json','run.mjs','contract.test.mjs'])await cp(path.join(app,entry),path.join(checkout,entry),{recursive:true});
  const env={...localGitEnvironment(),GIT_AUTHOR_NAME:'Flowview Fictional Demo',GIT_AUTHOR_EMAIL:'demo@example.test',GIT_COMMITTER_NAME:'Flowview Fictional Demo',GIT_COMMITTER_EMAIL:'demo@example.test'};
  async function git(...args){return (await exec('git',['-c','core.hooksPath=/dev/null','-c','commit.gpgsign=false',...args],{cwd:checkout,env,encoding:'utf8',timeout:10000,maxBuffer:2_000_000})).stdout.trim();}
  await git('init','--quiet','--initial-branch=main','--template=');
  await git('config','user.name','Flowview Fictional Demo');await git('config','user.email','demo@example.test');
  async function commit(message){await git('add','.');await git('commit','--quiet','-m',message);return git('rev-parse','HEAD');}
  async function observe(name){
    // Fresh processes prevent ESM's module cache from hiding a changed file.
    const tests=await processResult(process.execPath,['--test','--test-reporter=tap','contract.test.mjs'],checkout);
    const run=await processResult(process.execPath,['run.mjs'],checkout),behavior=JSON.parse(run.stdout);
    await writeFile(path.join(directory,name+'.tests.tap'),tests.stdout+tests.stderr);
    await atomicJSON(path.join(directory,name+'.behavior.json'),behavior);
    return {testExitCode:tests.exitCode,runExitCode:run.exitCode,behavior,testLog:name+'.tests.tap'};
  }
  async function change(name,message){
    const patch=path.join(app,'changes',name+'.patch');await git('apply','--check',patch);await git('apply',patch);return commit(message);
  }
  const baseline=await commit('Demo baseline: record before notifying with a 500 ms deadline');
  const texts={};for(const name of ['porch-hub','recording-service','notification-service'])texts['src/'+name+'.js']=await readFile(path.join(checkout,'src',name+'.js'),'utf8');
  const spec=sampleSpec(JSON.parse(await readFile(path.join(root,'examples/canon/specs/doorbell.json'),'utf8')),baseline,texts),sources=new LocalGitSources({[repository]:checkout});
  await atomicJSON(path.join(directory,'specs/doorbell.json'),spec);
  await atomicJSON(path.join(directory,'registry.json'),{version:1,diagrams:[{id:spec.page.canon.id,path:'specs/doorbell.json',title:spec.page.title}]});
  await atomicJSON(path.join(directory,'local-sources.json'),{version:1,repositories:{[repository]:'source'}});
  const initial=await observe('baseline');assert.equal(initial.testExitCode,0,'Baseline contract must pass.');assert.equal(initial.runExitCode,0);assert.equal(initial.behavior.notifications.length,1);
  const clean=await scan([spec],sources);assert.equal(clean.findings.length,0);

  const nonBreaking=await change('non-breaking','Demo refactor: name the recording result without changing behavior');
  const refactor=await observe('non-breaking');assert.equal(refactor.testExitCode,0,'Refactor contract must pass.');assert.deepEqual(refactor.behavior,initial.behavior);
  const changed=await scan([spec],sources,clean.state);assert.equal(changed.findings.length,1);const harmless=changed.findings[0];
  assert.equal(harmless.impacts[0].targetId,'upload');assert.equal(harmless.error,undefined);
  const accepted=decide([spec],changed.state,harmless.id,{disposition:'no-impact',actor:'simulated reviewer',reason:'Rehearsal: the unchanged contract passes and the complete fake recording/notification result is identical.'});
  assert.equal((await scan([spec],sources,accepted)).findings.length,0,'Acceptance should stop repeat reports.');
  await atomicJSON(path.join(directory,'accepted-spec.json'),effectiveSpecs([spec],accepted)[0]);

  const breaking=await change('breaking','Demo regression: cut the recording deadline from 500 ms to 50 ms');
  const regression=await observe('breaking');assert.equal(regression.testExitCode,1,'The intentionally broken contract must fail.');assert.equal(regression.runExitCode,1);
  assert.equal(regression.behavior.error.code,'RECORDING_TIMEOUT');assert.equal(regression.behavior.recordings.length,0);assert.equal(regression.behavior.notifications.length,0);
  const broken=await scan([spec],sources,accepted);assert.equal(broken.findings.length,1);const harmful=broken.findings[0];assert.equal(harmful.reference.revision,nonBreaking);assert.equal(harmful.head,breaking);
  const state=decide([spec],broken.state,harmful.id,{disposition:'regression',actor:'simulated reviewer',ticket:'https://example.test/issues/doorbell-timeout',reason:'Rehearsal: the 120 ms storage operation now times out at 50 ms, so no recording or notification is produced. Preserve expected behavior.'});
  assert.deepEqual(effectiveSpecs([spec],state),effectiveSpecs([spec],accepted),'A regression must not rewrite canon.');
  const repeat=await scan([spec],sources,state);assert.equal(repeat.findings.length,1);assert.equal(repeat.findings[0].status,'regression');assert.equal(Object.keys(repeat.state.reviews).length,2);
  const report={version:1,simulated:true,passed:true,createdAt:new Date().toISOString(),directory,repository,
    commits:{baseline,nonBreaking,breaking},acceptedRevision:nonBreaking,
    stages:[{name:'Baseline',revision:baseline,...initial,review:null},{name:'Non-breaking refactor',revision:nonBreaking,...refactor,review:state.reviews[harmless.id]},{name:'Breaking timeout change',revision:breaking,...regression,review:state.reviews[harmful.id]}],
    note:'Rehearsal passed: the broken revision is expected to fail its app tests. Review dispositions are scripted simulations; changed code alone does not determine behavioral impact.'};
  await atomicJSON(path.join(directory,'state.json'),state);await atomicJSON(path.join(directory,'report.json'),report);
  const summary='# Doorbell app drift rehearsal\n\n'+report.note+'\n\n| Revision | App contract | Recording / notification | Review |\n| --- | --- | --- | --- |\n'+report.stages.map(s=>'| '+s.name+' (`'+s.revision.slice(0,8)+'`) | '+(s.testExitCode?'FAIL (expected regression)':'PASS')+' | '+s.behavior.recordings.length+' / '+s.behavior.notifications.length+' | '+(s.review?.status || 'clean')+' |').join('\n')+'\n\nAccepted recording revision remains `'+nonBreaking+'`; source HEAD is the intentionally broken `'+breaking+'`.\n\n';
  await writeFile(path.join(directory,'report.md'),summary+reportMarkdown(Object.values(state.reviews)));
  return report;
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2);
  try{
    if(args.length && (args.length!==2 || args[0]!=='--out'))throw new Error('Usage: node tools/canon/doorbell-rehearsal.mjs [--out NEW_DIRECTORY]');
    const report=await runDoorbellRehearsal({outDir:args[1]});console.log(report.note);console.log('Evidence: '+path.join(report.directory,'report.md'));
  }catch(e){console.error(e.message);process.exitCode=1;}
}
