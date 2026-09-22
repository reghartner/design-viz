'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {entrypoint}=require('../tools/source-loader.cjs');
const B={console,URL};vm.runInNewContext(entrypoint('standalone').body,B);
const fixture=JSON.parse(fs.readFileSync('src/starters/domain-drilldown.json','utf8'));
const copy=()=>structuredClone(fixture);const plain=v=>JSON.parse(JSON.stringify(v));
test('domain example validates and uses stable references for nested detail and index traversal',()=>{
 const p=copy().page;assert.deepEqual(plain(B.validate(p)),{errors:[],warnings:[]});
 assert.equal(B.detailSection(p,'connectivity').section.id,'connectivity');
 assert.ok(B.FlowviewCompatibility.detect(p).includes('flow.drilldown'));
 const names=B.sectionRecords(p).map(r=>r.reference);assert.equal(new Set(names).size,names.length);
 p.sections[1].heading='Renamed without breaking references';assert.equal(B.detailSection(p,'connectivity').section.heading,p.sections[1].heading);
});
test('detail validation rejects missing targets, unsafe URLs, ambiguous IDs and invalid boundary/step mappings',()=>{
 for(const mutate of [p=>p.sections[0].diagram.nodes.connectivity.detail.section='missing',p=>p.sections[0].diagram.nodes.connectivity.detail.url='javascript:alert(1)',p=>p.sections[1].id=p.sections[0].id,p=>p.sections[0].diagram.nodes.connectivity.detail.ports.in='missing',p=>p.sections[0].diagram.nodes.connectivity.detail.stepMap.nonexistent={step:'missing'},p=>p.sections[0].diagram.nodes.recording.detail.ports={}]){
  const p=copy().page;mutate(p);assert.ok(B.validate(p).errors.length,JSON.stringify(p));
 }
});
test('expansion reconnects boundary edges, projects failures, preserves source and separates compound bounds',()=>{
 const p=copy().page,d=p.sections[0].diagram,before=JSON.stringify(p);const domain=d.nodes.recording,child=B.detailTarget(p,domain.detail).section.diagram;
 const expanded=B.expandDetailDiagram(p,d,['recording']),L=B.layout(expanded);
 assert.equal(JSON.stringify(p),before);assert.ok(!expanded.nodes.recording);
 assert.equal(expanded.edges.length,d.edges.length+child.edges.length);
 for(const edge of expanded.edges){assert.ok(L.pos[edge.from],edge.from);assert.ok(L.pos[edge.to],edge.to);}
 for(const step of expanded.steps)for(const key of Object.keys(step.failures || {}))assert.ok(expanded.edges.some(e=>e.from+'->'+e.to===key),key);
 const group=L.groups[Object.keys(L.groups).find(k=>k.startsWith('__detail_recording'))];assert.ok(group);
 for(const [id,pos] of Object.entries(L.pos))if(!id.startsWith('__detail_recording'))assert.ok(pos.cx+pos.w/2<=group.x || pos.cx-pos.w/2>=group.x+group.w || pos.cy+pos.h/2<=group.y || pos.cy-pos.h/2>=group.y+group.h,id+' overlaps expanded group');
 const path=B.diagramForPath(expanded);assert.equal(B.layout(path),L,'path projection retains derived geometry identity');
});
test('expansion rejects boundary nodes that are defined but have no placement',()=>{
 const p=copy().page,d=p.sections[0].diagram,detail=d.nodes.recording.detail;
 const child=B.detailTarget(p,detail).section.diagram;
 child.nodes.unplaced={title:'Unused boundary'};detail.ports.in='unplaced';
 assert.match(B.validate(p).errors.join('\n'),/ports.in: child node must be placed/);
 const before=JSON.stringify(p);
 assert.throws(()=>B.expandDetailDiagram(p,d,['recording']),/boundary nodes must be placed/);
 assert.equal(JSON.stringify(p),before);
});
test('drill navigation hash preserves opaque state and source-derived step mapping',()=>{
 const q=JSON.stringify({section:'doorbell-domains',frames:[{node:'connectivity',expanded:[],state:{path:'link-lost',step:'held'}}]});
 assert.equal(B.parseHash(B.buildHash({d:'doorbell-domains',q})).q,q);
 const detail={path:'happy',step:'start',stepMap:{failed:{path:'failure',step:'timeout'}}};
 assert.deepEqual(plain(B.detailStepTarget(detail,{current:()=>({id:'failed'})})),{path:'failure',step:'timeout'});
});
test('stable section IDs retain old heading links and reject aliases that would silently retarget them',()=>{
 const p={sections:[{id:'stable',heading:'Old heading',diagram:{nodes:{a:{}},rows:[['a']]}}]};
 assert.equal(B.detailSection(p,'old-heading').reference,'stable');
 const records=B.sectionRecords(p),manifest={sections:records.map(r=>({...r,stepIds:[]}))};
 assert.equal(B.resolveHashTarget({d:'old-heading'},manifest).diagram.section,1);
 p.sections.push({id:'old-heading',heading:'Other',diagram:{nodes:{b:{}},rows:[['b']]}});
 assert.match(B.validate(p).errors.join('\n'),/legacy heading reference/);
});
test('a detail diagram without a step timeline remains a valid direct navigation target',()=>{
 const target=B.resolveHashTarget({d:'architecture'},{sections:[{reference:'architecture',number:2,hasDiagram:true,stepIds:null}]});
 assert.equal(target.kind,'diagram');assert.equal(target.diagram.section,2);assert.equal(target.diagram.mode,null);
 assert.ok(B.FlowviewCompatibility.detect({sections:[{detailOnly:true,diagram:{nodes:{a:{}},rows:[['a']]}}]}).includes('flow.drilldown'));
});
