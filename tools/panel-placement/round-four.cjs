'use strict';
const fs=require('node:fs'),path=require('node:path'),L=require('./layouts.cjs'),F=require('./feedback.cjs');
const FOLLOWUPS=['overview-3','security-1','health-2','hardware-2','api-1'];
function candidate(root,record,label){const spec={};for(const field of ['spec','png']){const file=path.resolve(root,record[label][field]);if(!file.startsWith(path.resolve(root)+path.sep))throw Error('Invalid source path');const bytes=fs.readFileSync(file);if(L.hash(bytes)!==record[label][field==='spec'?'sha256':'pngSha256'])throw Error('Source hash mismatch');if(field==='spec')spec.value=JSON.parse(bytes);}return spec.value;}
function rankFresh(manifest,judged,followups,seed){
 const pending=manifest.pairs.filter(p=>p.split==='review'&&!judged.has(p.id)),chosen=[...followups],ranked=[];
 while(pending.length){const types=new Set(chosen.flatMap(p=>p.panelTypes)),widths=new Set(chosen.map(p=>p.host.width)),densities=new Set(chosen.map(p=>p.density)),counts=new Set(chosen.map(p=>p.panelCount)),profiles=new Set(chosen.map(p=>p.host.profile)),roles=new Set(chosen.map(p=>p.graphRole));
  const score=p=>new Set(p.panelTypes.filter(t=>!types.has(t))).size*100+(!widths.has(p.host.width)?20:0)+(!densities.has(p.density)?12:0)+(!roles.has(p.graphRole)?10:0)+(!counts.has(p.panelCount)?8:0)+(!profiles.has(p.host.profile)?6:0);
  pending.sort((a,b)=>score(b)-score(a)||L.hash(seed+a.id).localeCompare(L.hash(seed+b.id)));const p=pending.shift();ranked.push({...p,selectionCoverageScore:score(p)});chosen.push(p);
 }
 return ranked;
}
function load(rounds,feedback,seed){
 const inputs=rounds.map((r,i)=>F.load(r,feedback[i]));
 if(inputs[1].manifest.renderer.feedbackSha256!==inputs[0].provenance.feedbackSha256)throw Error('Feedback chain mismatch');
 for(let i=0;i<2;i++)if(inputs[2].manifest.renderer.feedback[i].feedbackSha256!==inputs[i].provenance.feedbackSha256||inputs[2].manifest.renderer.feedback[i].sourceManifestSha256!==inputs[i].provenance.sourceManifestSha256)throw Error('Feedback chain mismatch');
 const followups=FOLLOWUPS.map(id=>{const item=inputs[2].cases.find(c=>c.scenario.id===id);return {...item,axis:'follow-up',referenceAccepted:item.feedback.choice!=='Neither'};});
 const judged=new Set(inputs.flatMap(i=>i.cases.map(c=>c.scenario.id))),fresh=rankFresh(inputs[0].manifest,judged,followups.map(c=>c.scenario),seed).map(s=>{
  const root=path.join(rounds[0],'review'),a=candidate(root,s,'A'),b=candidate(root,s,'B');if(L.checkPair(a,b)!==s.contentSha256)throw Error('Fresh source identity mismatch');return {scenario:s,source:a,axis:'new-case',sourceCandidate:s.A,referenceAccepted:false};
 });
 return {followups,fresh,feedback:inputs.map(i=>i.provenance),selectionRule:'Greedy new panel-type coverage, then missing host width/density/graph role/count/profile; seeded hash tie-break; excludes all previously judged IDs and private holdouts'};
}
module.exports={FOLLOWUPS,rankFresh,load,candidate};
