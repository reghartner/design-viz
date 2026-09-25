const test=require('node:test'),assert=require('node:assert/strict');
const C=require('./workbench-command-context.cjs')(['visibility']);
const story=()=>({nodes:{a:{},b:{}},rows:[['a','b']],edges:[{from:'a',to:'b',future:{keep:true}}],steps:['a','b','c','x','y','unused'].map(id=>({id,text:id})),paths:[{id:'main',steps:['a','b','c']},{id:'alternate',steps:['a','x','y','c']}]});
test('fragment edits preserve prose and unknown metadata and support every target shape',()=>{
 const raw={page:{blocks:[{tabs:[{label:'Story',sections:[{bullets:['Plain prose'],contracts:[{fields:[{k:'field',future:true}]}],diagram:story()}]}]}]}};
 for(const target of [{kind:'bullet',section:0,index:0},{kind:'crow',section:0,index:0,card:0},{kind:'edge',section:0,index:0}]){
  const text=JSON.stringify(raw),path=C.builderTargetPath(raw,target),before=C.specValueAt(raw,path);
  const plan=C.planFragmentVisibility(text,raw,target,'revealAt',2,JSON.stringify(before));assert.equal(plan.error,undefined);
  const after=C.specValueAt(JSON.parse(plan.text),path);assert.deepEqual(after,{...(typeof before==='string'?{text:before}:before),revealAt:2});
  const cleared=C.planFragmentVisibility(plan.text,JSON.parse(plan.text),target,'revealAt',null);assert.equal(C.specValueAt(JSON.parse(cleared.text),path).revealAt,undefined);
  assert.equal(JSON.stringify(raw),text);
 }
});
test('invalid intervals, changed source and unsupported targets fail without writes',()=>{
 const raw=story(),target={kind:'edge',section:0,index:0};raw.edges[0].hideAt=2;const text=JSON.stringify(raw);
 for(const value of [-1,1.5,NaN,2,3])assert.ok(C.planFragmentVisibility(text,raw,target,'revealAt',value).error);
 assert.ok(C.planFragmentVisibility(text,raw,target,'revealAt',1,'stale').error);
 assert.ok(C.planFragmentVisibility(text,raw,{kind:'node',section:0,id:'a'},'revealAt',1).error);assert.equal(JSON.stringify(raw),text);
});
test('reachability uses longest full path rather than registry or filtered view',()=>{
 const raw={sections:[{bullets:[{text:'Unreachable',revealAt:4}],diagram:story()}]};
 let warnings=C.validate(C.normalize(raw)).warnings;assert.ok(warnings.some(w=>/bullets.*beyond every full path/.test(w)));
 raw.sections[0].bullets[0].revealAt=3;warnings=C.validate(C.normalize(raw)).warnings;assert.ok(!warnings.some(w=>/bullets.*revealAt/.test(w)));
});
