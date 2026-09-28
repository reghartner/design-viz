'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {scoreResults,diffObjects}=require('../tools/agent-intent-score.cjs');
const CLI=path.join(__dirname,'../tools/agent-intent-score.cjs');
function story(){return {page:{title:'Checkout',sections:[{id:'journey',heading:'Customer checkout',diagram:{nodes:{customer:{title:'Customer'},payment:{title:'Payment'}},rows:[['customer','payment']],edges:[{from:'customer',to:'payment'}],steps:[{id:'pay',edge:'customer->payment'}]}}]},acceptedBehavior:{failure:'Unknown remains unknown'}};}
function cases(){const state={source:JSON.stringify(story()),project:1,open:true};return {version:1,cases:[
 {id:'unclear',expected:'clarify',state},
 {id:'rename',expected:'propose',state,allowedChanges:[['page','sections',0,'diagram','nodes','payment','title']],expectedValues:['Payment processor']}
]};}
function proposal(extra={}){return {action:'propose',text:'Rename the payment title only.',operations:[{op:'updateNode',sectionId:'journey',nodeId:'payment',patch:{title:'Payment processor'}}],source:null,...extra};}
function results(decision=proposal()){return [{id:'unclear',is_error:false,exit:0,decision:{action:'reply',text:'Please identify the intended Payment node before I rename it.',operations:null,source:null}},{id:'rename',decision}];}
function renamed(){const raw=story();raw.page.sections[0].diagram.nodes.payment.title='Payment processor';return raw;}

test('scores a real semantic transaction and keeps clarification quality explicitly pending',()=>{
 const report=scoreResults(results(),cases());assert.equal(report.summary.failed,0);assert.equal(report.summary.proposalsPassed,1);assert.equal(report.summary.clarificationNeedsManualReview,1);
 const reply=report.records.find(r=>r.id==='unclear');assert.equal(reply.status,'needs_manual_review');assert.match(reply.manualReview,/not proof/);assert.equal(reply.applyCount,0);
 const edit=report.records.find(r=>r.id==='rename');assert.equal(edit.status,'passed');assert.equal(edit.exchangeStatus,'applied');assert.equal(edit.applyCount,1);assert.deepEqual(edit.differences,[]);
 assert.deepEqual(edit.changedPaths,[['page','sections',0,'diagram','nodes','payment','title']]);
});
test('whole-source fallback is compared as a complete object, independent of key order',()=>{
 const raw=renamed(),reordered={acceptedBehavior:raw.acceptedBehavior,page:raw.page};
 const report=scoreResults(results(proposal({operations:null,source:JSON.stringify(reordered)})),cases());
 assert.equal(report.summary.failed,0);assert.equal(report.records.find(r=>r.id==='rename').applyCount,1);
});
test('overbroad semantic and full-source proposals report the exact unexpected path',()=>{
 const altered=renamed();altered.acceptedBehavior.failure='Pretend success';
 const semantic=proposal();semantic.operations[0].patch.title='Wrong service';
 for(const decision of [semantic,proposal({operations:null,source:JSON.stringify(altered)})]){
  const report=scoreResults(results(decision),cases()),record=report.records.find(r=>r.id==='rename');
  assert.equal(record.status,'failed');assert.equal(record.reason,'unexpected_document_change');assert.equal(record.applyCount,1);
  assert.ok(record.differences.some(d=>d.pointer==='/acceptedBehavior/failure' || d.pointer==='/page/sections/0/diagram/nodes/payment/title'));
 }
});
test('invalid, stale, mixed, no-op, and dry-run proposals never receive an applied-change pass',()=>{
 for(const decision of [proposal({operations:[{op:'updateNode',sectionId:'journey',nodeId:'missing',patch:{title:'X'}}]}),
  proposal({source:'{}'}),proposal({baseRevision:'old-revision'}),proposal({dryRun:true}),proposal({dryRun:'true'}),
  proposal({operations:null,source:'{bad JSON'}),proposal({operations:null,source:JSON.stringify({page:{sections:[{diagram:{nodes:{},rows:[]}}]}})}),
  proposal({operations:null,source:JSON.stringify(story())})]){
  const record=scoreResults(results(decision),cases()).records.find(r=>r.id==='rename');
  assert.equal(record.status,'failed');assert.equal(record.reason,'proposal_not_applied_once');assert.equal(record.applyCount,0);
 }
});
test('clarification replies cannot carry even empty mutation payloads or punctuation-only content',()=>{
 for(const decision of [
  {action:'reply',text:'Which node?',operations:[]},
  {action:'reply',text:'Which node?',source:''},
  {action:'reply',text:'   ',operations:null,source:null},
  {action:'reply',text:'???'},proposal()
 ]){
  const input=results();input[0].decision=decision;const record=scoreResults(input,cases()).records.find(r=>r.id==='unclear');assert.equal(record.status,'failed');
 }
 const input=results();input[0].decision.text='Done';const record=scoreResults(input,cases()).records.find(r=>r.id==='unclear');
 assert.equal(record.status,'needs_manual_review','The scorer cannot infer clarification quality from punctuation or phrasing.');
});
test('missing, duplicate, unknown, malformed, and model-error records fail closed',()=>{
 const inputs=[results().slice(0,1),[...results(),results()[1]],[...results(),{id:'unknown',decision:proposal()}],[...results(),null]];
 for(const field of [{is_error:true},{exit:1},{error:'Timed out'},{is_error:'false'},{permission_denials:[{tool_name:'forbidden'}]}]){
  const input=results();Object.assign(input[0],field);inputs.push(input);
 }
 for(const input of inputs){const report=scoreResults(input,cases());assert.ok(report.summary.failed);assert.equal(report.summary.automatedChecksPassed,false);}
 const spoof=results();spoof[0].expected='propose';spoof[0].decision=proposal();assert.equal(scoreResults(spoof,cases()).records.find(r=>r.id==='unclear').reason,'clarification_required');
});
test('permission denial metadata must be an array when present, for replies and proposals',()=>{
 for(const value of ['denied',{tool:'forbidden'},true,1,false,0,'',null,undefined]){
  for(const index of [0,1]){
   const input=results();input[index].permission_denials=value;
   const report=scoreResults(input,cases()),record=report.records.find(r=>r.id===input[index].id);
   assert.equal(report.summary.automatedChecksPassed,false,JSON.stringify({index,value}));
   assert.equal(record.reason,'malformed_model_result');assert.notEqual(record.applyCount,1);
  }
 }
 const absent=scoreResults(results(),cases());assert.equal(absent.summary.failed,0);
 const empty=results();empty.forEach(record=>record.permission_denials=[]);assert.equal(scoreResults(empty,cases()).summary.failed,0);
 const denied=results();denied[1].permission_denials=[{tool_name:'forbidden'}];
 assert.equal(scoreResults(denied,cases()).records.find(r=>r.id==='rename').reason,'permission_denial');
});
test('expected values and complete preservation are mandatory evaluation metadata',()=>{
 const absent=cases();delete absent.cases[1].expectedValues;assert.throws(()=>scoreResults(results(),absent),/expectedValues/);
 const unsafe=cases();unsafe.cases[1].allowedChanges=[['__proto__','polluted']];assert.throws(()=>scoreResults(results(),unsafe),/Invalid allowedChanges/);assert.equal({}.polluted,undefined);
 const duplicate=cases();duplicate.cases.push(duplicate.cases[0]);assert.throws(()=>scoreResults(results(),duplicate),/duplicate case/);
 const extra=cases();extra.cases[1].allowedChanges.push(['page','sections',0,'diagram','nodes','payment']);extra.cases[1].expectedValues.push({title:'X'});
 assert.throws(()=>scoreResults(results(),extra),/overlap/);
});
test('path diffs distinguish missing fields and escape JSON pointer tokens',()=>{
 const diff=diffObjects({'a/b':{'~key':'Expected'},list:[1,2]},{list:[1]});
 assert.ok(diff.differences.some(d=>d.pointer==='/a~1b' && d.actual.missing===true));
 assert.ok(diff.differences.some(d=>d.pointer==='/list/1' && d.actual.missing===true));
});
test('CLI is offline, supports safe help, and returns nonzero for scored or input failures',t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'flowview-intent-score-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const casePath=path.join(directory,'cases.json'),resultPath=path.join(directory,'results.json');fs.writeFileSync(casePath,JSON.stringify(cases()));fs.writeFileSync(resultPath,JSON.stringify(results()));
 let run=spawnSync(process.execPath,[CLI,resultPath,'--cases',casePath],{encoding:'utf8',timeout:10000});assert.equal(run.status,0,run.stderr);assert.equal(JSON.parse(run.stdout).summary.failed,0);
 fs.writeFileSync(resultPath,'[]');run=spawnSync(process.execPath,[CLI,resultPath,'--cases',casePath],{encoding:'utf8',timeout:10000});assert.equal(run.status,1);assert.equal(JSON.parse(run.stdout).summary.failed,2);
 run=spawnSync(process.execPath,[CLI,'--help'],{encoding:'utf8',timeout:10000});assert.equal(run.status,0);assert.match(run.stdout,/offline/);
 run=spawnSync(process.execPath,[CLI,'--run-claude'],{encoding:'utf8',timeout:10000});assert.equal(run.status,1);assert.equal(JSON.parse(run.stdout).summary.automatedChecksPassed,false);
});

test('all checked-in evaluation expectations can be applied exactly without grading clarification quality',()=>{
 const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/agent-intent/cases.json'),'utf8'));
 const synthetic=fixture.cases.map(item=>{
  if(item.expected==='clarify')return {id:item.id,decision:{action:'reply',text:'Please clarify the intended change before I edit.',operations:null,source:null}};
  const source=JSON.parse(item.state.source);
  item.allowedChanges.forEach((parts,index)=>{let parent=source;for(const key of parts.slice(0,-1))parent=parent[key];parent[parts.at(-1)]=item.expectedValues[index];});
  return {id:item.id,decision:{action:'propose',text:'Synthetic exact-scope fixture control.',operations:null,source:JSON.stringify(source)}};
 });
 const report=scoreResults(synthetic,fixture);assert.equal(report.summary.failed,0,JSON.stringify(report.records.filter(r=>r.status==='failed')));
 assert.equal(report.summary.proposalsPassed,fixture.cases.filter(c=>c.expected==='propose').length);
 assert.equal(report.summary.clarificationNeedsManualReview,fixture.cases.filter(c=>c.expected==='clarify').length);
});


test('an explicit revision must match the fixture before mapping to the isolated exchange revision',()=>{
 const fixture=cases();fixture.cases[1].state={...fixture.cases[1].state,revision:'captured-current-12'};
 const valid=scoreResults(results(proposal({baseRevision:'captured-current-12'})),fixture).records.find(r=>r.id==='rename');
 assert.equal(valid.status,'passed');assert.equal(valid.revisionCheck,'provided_current');
 const stale=scoreResults(results(proposal({baseRevision:'captured-current-11'})),fixture).records.find(r=>r.id==='rename');
 assert.equal(stale.status,'failed');assert.equal(stale.applyCount,0);assert.equal(stale.revisionCheck,'provided_stale');
});
