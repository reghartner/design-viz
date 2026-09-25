const test=require('node:test'),assert=require('node:assert/strict');
const C=require('./workbench-command-context.cjs')(['detail-mapping']);
const fixture=()=>({sections:[{id:'parent',diagram:{nodes:{domain:{detail:{section:'child',mode:'focus',path:'main',step:'a',ports:{in:'n'},future:7,stepMap:{p1:{step:2,layout:'brief',future:true}}}}},rows:[['domain']],steps:[{id:'p1',nodes:['domain']},{id:'p2',nodes:['domain']}]}},{id:'child',detailOnly:true,diagram:{nodes:{n:{}},rows:[['n']],steps:['a','b','x'].map(id=>({id,nodes:['n']})),paths:[{id:'main',steps:['a','b']},{id:'alt',steps:['a','x']}]}}]});
const target={kind:'node',section:0,id:'domain'},detail=raw=>raw.sections[0].diagram.nodes.domain.detail;
test('mapping writes/renames/removes preserve defaults, ports, numeric imports and advanced fields',()=>{
 const raw=fixture(),before=JSON.stringify(raw);
 let plan=C.planDetailMapping(before,raw,target,{action:'write',key:null,parent:'p2',changes:{path:'alt',step:'x'}});assert.equal(plan.error,undefined);
 let next=JSON.parse(plan.text);assert.deepEqual(detail(next),{...detail(raw),stepMap:{...detail(raw).stepMap,p2:{path:'alt',step:'x'}}});
 plan=C.planDetailMapping(plan.text,next,target,{action:'remove',key:'p2'});assert.deepEqual(detail(JSON.parse(plan.text)),detail(raw));
 plan=C.planDetailMapping(before,raw,target,{action:'write',key:'p1',parent:'p2',changes:{path:null}});assert.equal(plan.error,undefined);
 assert.deepEqual(detail(JSON.parse(plan.text)).stepMap,{p2:{step:2,layout:'brief',future:true,path:null}});assert.equal(JSON.stringify(raw),before);
});
test('invalid effective inherited targets, duplicate parents and stale details reject atomically',()=>{
 const raw=fixture();detail(raw).step='b';const text=JSON.stringify(raw);
 const bad=C.planDetailMapping(text,raw,target,{action:'write',key:null,parent:'p2',changes:{path:'alt'}});assert.match(bad.error,/unknown child step or path/);
 const good=C.planDetailMapping(text,raw,target,{action:'write',key:null,parent:'p2',changes:{path:'alt',step:null}});assert.equal(good.error,undefined);
 assert.ok(C.planDetailMapping(text,raw,target,{action:'write',key:null,parent:'p1',changes:{}}).error);
 assert.ok(C.planDetailMapping(text,raw,target,{action:'remove',key:'p1'},'stale').error);assert.equal(JSON.stringify(raw),text);
});
test('explicit null path resolves to the first child path, and mapping shorthand remains invalid',()=>{
 const raw=fixture();Object.assign(detail(raw),{path:'alt',step:'x',stepMap:{p1:{path:null,step:'b'}}});
 assert.deepEqual(Array.from(C.validate(C.normalize(raw)).errors),[]);
 detail(raw).stepMap.p1='b';assert.ok(C.validate(C.normalize(raw)).errors.some(x=>/stepMap.*expected/.test(x)));
});
