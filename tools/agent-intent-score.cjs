#!/usr/bin/env node
'use strict';
/* Offline scoring only. Model text is data; only repository runtime code executes. */
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {readSource}=require('./source-loader.cjs');
const DEFAULT_CASES=path.join(__dirname,'../tests/fixtures/agent-intent/cases.json');
const LIMITS={fileBytes:64*1024*1024,sourceBytes:4*1024*1024,cases:200,records:1000,diffs:100,depth:80,timeoutMs:3000};
const OWN=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);
const object=value=>value!==null && typeof value==='object' && !Array.isArray(value);
const clone=value=>JSON.parse(JSON.stringify(value));
const byteLength=value=>Buffer.byteLength(value,'utf8');
function sourceObject(source){
  if(typeof source!=='string' || byteLength(source)>LIMITS.sourceBytes)throw Error('Story source must be a JSON string of at most 4 MiB.');
  return JSON.parse(source);
}
function expectedStory(testCase){
  let expected=sourceObject(testCase.state.source);
  const paths=testCase.allowedChanges,values=testCase.expectedValues;
  if(!Array.isArray(paths) || !paths.length || paths.length>100 || !Array.isArray(values) || paths.length!==values.length)
    throw Error('Propose cases need 1–100 allowedChanges and matching expectedValues.');
  paths.forEach((parts,index)=>{
    if(!Array.isArray(parts) || parts.length>LIMITS.depth || parts.some(key=>!(typeof key==='string' || Number.isSafeInteger(key) && key>=0) || ['__proto__','prototype','constructor'].includes(key)))
      throw Error('Invalid allowedChanges path.');
    if(paths.slice(0,index).some(prior=>parts.slice(0,Math.min(parts.length,prior.length)).every((key,i)=>key===prior[i])))
      throw Error('Allowed change paths must not overlap.');
    if(values[index]===undefined)throw Error('Every allowed change needs an explicit expected value.');
    const value=clone(values[index]);
    if(!parts.length){expected=value;return;}
    let parent=expected;
    parts.slice(0,-1).forEach(key=>{
      if(!parent || typeof parent!=='object' || !OWN(parent,key))throw Error('Allowed change parent is missing.');
      parent=parent[key];
    });
    const leaf=parts.at(-1);
    if(!parent || typeof parent!=='object' || (Array.isArray(parent)?!Number.isSafeInteger(leaf) || leaf<0 || leaf>parent.length:typeof leaf!=='string'))
      throw Error('Allowed change path does not address a JSON field or array slot.');
    Object.defineProperty(parent,leaf,{value,writable:true,enumerable:true,configurable:true});
  });
  return expected;
}
function display(value,present=true){
  if(!present)return {missing:true};
  if(typeof value==='string')return value.length<=180?value:value.slice(0,180)+'…';
  if(Array.isArray(value))return {type:'array',length:value.length};
  if(object(value))return {type:'object',keys:Object.keys(value).slice(0,12)};
  return value;
}
function diffObjects(expected,actual){
  const differences=[];let truncated=false;
  function add(parts,left,right,hasLeft,hasRight){
    if(differences.length>=LIMITS.diffs){truncated=true;return;}
    differences.push({path:parts,pointer:'/'+parts.map(key=>String(key).replace(/~/g,'~0').replace(/\//g,'~1')).join('/'),
      expected:display(left,hasLeft),actual:display(right,hasRight)});
  }
  function visit(left,right,parts,depth,hasLeft=true,hasRight=true){
    if(hasLeft!==hasRight){add(parts,left,right,hasLeft,hasRight);return;}
    if(Object.is(left,right))return;
    if(depth>=LIMITS.depth){add(parts,left,right,true,true);return;}
    if(Array.isArray(left) && Array.isArray(right)){
      for(let i=0;i<Math.max(left.length,right.length);i++)visit(left[i],right[i],parts.concat(i),depth+1,i<left.length,i<right.length);
    }else if(object(left) && object(right)){
      for(const key of new Set([...Object.keys(left),...Object.keys(right)]))visit(left[key],right[key],parts.concat(key),depth+1,OWN(left,key),OWN(right,key));
    }else add(parts,left,right,true,true);
  }
  visit(expected,actual,[],0);return {differences,truncated};
}
let runtime;
function productionRuntime(){
  if(!runtime)runtime=new vm.Script(['validator.js','workbench/targets.js','workbench/agent-operations.js','workbench/agent-session.js'].map(file=>readSource(file)).join('\n'),{filename:'flowview-production-intent-runtime.js'});
  return runtime;
}
function applyDecision(testCase,decision){
  const context=vm.createContext({TextEncoder,caseState:clone(testCase.state),decision:clone(decision)});
  productionRuntime().runInContext(context,{timeout:LIMITS.timeoutMs});
  return vm.runInContext(`(function(){
    var source=caseState.source,applyCount=0,applyAttempts=0,validationWarnings=[];
    var exchange=createWorkbenchAgentExchange({clientId:'offline-intent-score',
      snapshot:function(){return Object.assign({},caseState,{source:source});},busy:function(){return false;},
      apply:function(text,current){
        applyAttempts++;
        if(current.source!==source)return {ok:false,error:'Source changed before application.'};
        try{
          if(new TextEncoder().encode(text).length>${LIMITS.sourceBytes})return {ok:false,error:'Source exceeds 4 MiB.'};
          var findings=validate(normalize(JSON.parse(text)));validationWarnings=findings.warnings;
          if(findings.errors.length)return {ok:false,error:findings.errors.join('\\n')};
          source=text;applyCount++;return {ok:true};
        }catch(error){return {ok:false,error:error.message};}
      }});
    var sent=exchange.request(),proposal={id:'offline-proposal',baseRevision:sent.snapshot.revision,summary:decision.text};
    if(decision.operations!=null)proposal.operations=decision.operations;
    if(decision.source!=null)proposal.source=decision.source;
    if(Object.prototype.hasOwnProperty.call(decision,'dryRun'))proposal.dryRun=decision.dryRun;
    var revisionCheck='supplied_for_decision_probe';
    if(Object.prototype.hasOwnProperty.call(decision,'baseRevision')){
      var matches=typeof decision.baseRevision==='string' && decision.baseRevision===caseState.revision;
      proposal.baseRevision=matches?sent.snapshot.revision:null;
      revisionCheck=matches?'provided_current':'provided_stale';
    }
    exchange.receive({proposal:proposal},sent);
    return {source:source,result:exchange.request().result,applyCount:applyCount,applyAttempts:applyAttempts,validationWarnings:validationWarnings,revisionCheck:revisionCheck};
  })()`,context,{timeout:LIMITS.timeoutMs});
}
function failed(id,reason,details={}){return {id,status:'failed',automatedPassed:false,reason,...details};}
function scoreCase(testCase,record){
  const id=testCase.id;
  if(record.error || record.is_error===true || OWN(record,'exit') && record.exit!==0)
    return failed(id,'model_error',{error:String(record.error || 'Model execution reported an error.').slice(0,1000),exit:record.exit});
  if(OWN(record,'is_error') && typeof record.is_error!=='boolean')return failed(id,'malformed_model_result');
  if(OWN(record,'permission_denials') && !Array.isArray(record.permission_denials))return failed(id,'malformed_model_result');
  if(Array.isArray(record.permission_denials) && record.permission_denials.length)return failed(id,'permission_denial');
  const decision=record.decision;
  if(!object(decision) || !['reply','propose'].includes(decision.action) || typeof decision.text!=='string' || decision.text.length>32000 ||
      Object.keys(decision).some(key=>!['action','text','operations','source','dryRun','baseRevision'].includes(key)))return failed(id,'invalid_decision');
  if(testCase.expected==='clarify'){
    if(decision.action!=='reply')return failed(id,'clarification_required');
    if(decision.operations!=null || decision.source!=null)return failed(id,'reply_contains_mutation');
    if(!decision.text.trim() || !/[\p{L}\p{N}]/u.test(decision.text))return failed(id,'empty_clarification');
    return {id,status:'needs_manual_review',automatedPassed:true,applyCount:0,text:decision.text,
      manualReview:'Assess whether the reply asks the necessary clarification without guessing. Nonempty text is not proof of semantic question quality.'};
  }
  if(decision.action!=='propose')return failed(id,'proposal_required');
  if(decision.source!=null && (typeof decision.source!=='string' || byteLength(decision.source)>LIMITS.sourceBytes))return failed(id,'invalid_source');
  const expected=expectedStory(testCase),applied=applyDecision(testCase,decision),actual=sourceObject(applied.source);
  const diff=diffObjects(expected,actual),changes=diffObjects(sourceObject(testCase.state.source),actual);
  const details={exchangeStatus:applied.result && applied.result.status,exchangeMessage:applied.result && applied.result.message,
    applyCount:applied.applyCount,applyAttempts:applied.applyAttempts,revisionCheck:applied.revisionCheck,differences:diff.differences,differencesTruncated:diff.truncated,
    changedPaths:changes.differences.map(item=>item.path),validationWarnings:Array.from(applied.validationWarnings).slice(0,30)};
  if(applied.applyCount!==1 || !applied.result || applied.result.status!=='applied')return failed(id,'proposal_not_applied_once',details);
  if(diff.differences.length || diff.truncated)return failed(id,'unexpected_document_change',details);
  return {id,status:'passed',automatedPassed:true,...details};
}
function scoreResults(input,casesDocument){
  const cases=casesDocument && casesDocument.cases,results=Array.isArray(input)?input:input && input.results;
  if(!Array.isArray(cases) || !cases.length || cases.length>LIMITS.cases)throw Error('Cases must contain 1–200 entries.');
  if(!Array.isArray(results) || results.length>LIMITS.records)throw Error('Results must contain an array of at most 1000 records.');
  const caseIds=new Set(),groups=new Map(),records=[];
  for(const testCase of cases){
    if(!object(testCase) || typeof testCase.id!=='string' || !/^[\w-]{1,120}$/.test(testCase.id) || caseIds.has(testCase.id) || !['clarify','propose'].includes(testCase.expected) || !object(testCase.state))throw Error('Invalid or duplicate case definition.');
    sourceObject(testCase.state.source);if(testCase.expected==='propose')expectedStory(testCase);caseIds.add(testCase.id);
  }
  results.forEach((record,index)=>{
    if(!object(record) || typeof record.id!=='string'){records.push(failed(null,'invalid_result_record',{index}));return;}
    const group=groups.get(record.id) || [];group.push(record);groups.set(record.id,group);
  });
  for(const testCase of cases){
    const group=groups.get(testCase.id);
    if(!group){records.push(failed(testCase.id,'missing_case'));continue;}
    if(group.length!==1){records.push(failed(testCase.id,'duplicate_case',{count:group.length}));continue;}
    try{records.push(scoreCase(testCase,group[0]));}catch(error){records.push(failed(testCase.id,'scoring_error',{error:error.message}));}
  }
  for(const [id,group] of groups)if(!caseIds.has(id))records.push(failed(id,'unknown_case',{count:group.length}));
  const summary={expectedCases:cases.length,receivedRecords:results.length,automatedPassed:records.filter(item=>item.automatedPassed).length,
    proposalsPassed:records.filter(item=>item.status==='passed').length,clarificationNeedsManualReview:records.filter(item=>item.status==='needs_manual_review').length,
    failed:records.filter(item=>item.status==='failed').length};
  summary.automatedChecksPassed=summary.failed===0;
  return {summary,scope:'Offline in-memory production API checks. Clarification quality requires manual review; no live editor, agent, account, or network was used.',records};
}
function readJson(filename){
  const descriptor=fs.openSync(filename,'r');
  try{
    const stat=fs.fstatSync(descriptor);if(!stat.isFile() || stat.size>LIMITS.fileBytes)throw Error('Input must be a regular JSON file of at most 64 MiB.');
    const buffer=Buffer.alloc(stat.size+1),length=fs.readSync(descriptor,buffer,0,buffer.length,0);
    if(length>stat.size)throw Error('Input changed while reading; retry with a completed results file.');
    return JSON.parse(buffer.subarray(0,length).toString('utf8'));
  }finally{fs.closeSync(descriptor);}
}
function main(args){
  if(args.length===1 && ['--help','-h'].includes(args[0])){process.stdout.write('Usage: node tools/agent-intent-score.cjs RESULTS.json [--cases CASES.json]\nScores saved responses offline. Exit 0 means automated checks passed; clarification quality still needs manual review.\n');return 0;}
  if(!args.length || args[0].startsWith('-') || args.length!==1 && !(args.length===3 && args[1]==='--cases'))throw Error('Usage: node tools/agent-intent-score.cjs RESULTS.json [--cases CASES.json]');
  const report=scoreResults(readJson(args[0]),readJson(args[2] || DEFAULT_CASES));process.stdout.write(JSON.stringify(report,null,2)+'\n');return report.summary.failed?1:0;
}
module.exports={scoreResults,diffObjects};
if(require.main===module){try{process.exitCode=main(process.argv.slice(2));}catch(error){process.stdout.write(JSON.stringify({summary:{automatedChecksPassed:false,failed:1},error:error.message})+'\n');process.exitCode=1;}}
