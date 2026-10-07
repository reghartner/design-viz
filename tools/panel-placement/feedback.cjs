'use strict';
const fs=require('node:fs'),path=require('node:path'),L=require('./layouts.cjs'),A=require('./adaptive.cjs');
function load(round,submission){
 const root=path.resolve(round,'review'),manifestBytes=fs.readFileSync(path.join(root,'manifest.json')),manifest=JSON.parse(manifestBytes),feedbackBytes=fs.readFileSync(submission),feedback=JSON.parse(feedbackBytes);
 if(feedback.source!=='human-comparison-ui'||feedback.datasetPurpose!=='human-review'||feedback.reviewMode!=='panel-layout')throw Error('Expected explicit human panel evidence');
 if(feedback.manifestSha256!==L.hash(manifestBytes)||feedback.datasetId!==manifest.datasetId||feedback.datasetVersion!==manifest.datasetVersion)throw Error('Feedback manifest identity mismatch');
 const ids=[...A.SIZING,...A.CONTROLS],choices=new Map();
 for(const vote of feedback.choices){if(choices.has(vote.pairId))throw Error('Duplicate feedback');choices.set(vote.pairId,vote);}
 const cases=ids.map(id=>{
  const scenario=manifest.pairs.find(p=>p.id===id),vote=choices.get(id);if(!scenario||scenario.split!=='review'||!vote)throw Error('Missing reviewed scenario '+id);
  if(!['A','B','Both','Neither'].includes(vote.choice))throw Error('Invalid feedback choice');
  const specs={};for(const label of ['A','B']){
   const candidate=scenario[label];for(const k of ['id','sha256','pngSha256'])if(candidate[k]!==vote[label]?.[k])throw Error('Feedback candidate identity mismatch');
   for(const field of ['spec','png']){const file=path.resolve(root,candidate[field]);if(!file.startsWith(root+path.sep))throw Error('Invalid source asset path');const bytes=fs.readFileSync(file);if(L.hash(bytes)!==candidate[field==='spec'?'sha256':'pngSha256'])throw Error('Frozen source asset hash mismatch');if(field==='spec')specs[label]=JSON.parse(bytes);}
  }
  if(L.checkPair(specs.A,specs.B)!==scenario.contentSha256)throw Error('Frozen source semantic mismatch');
  const label=['A','B'].includes(vote.choice)?vote.choice:'A';
  return {scenario:{...scenario,batch:1,experimentAxis:A.axis(id)},source:specs[label],sourceCandidate:{label,...scenario[label]},feedback:{choice:vote.choice,reason:vote.reason||''}};
 });
 return {cases,provenance:{sourceDatasetId:manifest.datasetId,sourceManifestSha256:L.hash(manifestBytes),feedbackSha256:L.hash(feedbackBytes),feedbackSubmissionId:feedback.submissionId,feedbackCount:feedback.choices.length,interpretation:'Provisional heuristics from explicit choices and notes; not statistically learned'},manifest};
}
module.exports={load};
