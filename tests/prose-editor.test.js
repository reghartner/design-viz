const test=require('node:test'),assert=require('node:assert/strict');
const C=require('./workbench-command-context.cjs')(['prose','visibility']);
const fixture=()=>({sections:[{bullets:['First',{text:'Parent',future:{keep:true},sub:['Child',{text:'Deep',revealAt:1,sub:['Grandchild']} ]},'Last']} ]});
const target=(...indices)=>({kind:'bullet',section:0,index:indices[0],bulletPath:indices});
function edit(raw,t,action){const plan=C.planBulletStructure(JSON.stringify(raw),raw,t,action);assert.equal(plan.error,undefined);return {raw:JSON.parse(plan.text),target:plan.target};}
test('nested addressing retains old top-level targets and rejects invalid descent',()=>{
 const raw=fixture();assert.deepEqual(Array.from(C.builderTargetPath(raw,{kind:'bullet',section:0,index:1})),['sections',0,'bullets',1]);
 assert.equal(C.specValueAt(raw,C.builderTargetPath(raw,target(1,1,0))),'Grandchild');
 for(const path of [[],[-1],[1,4],[0,0],[1,1.5]])assert.equal(C.builderTargetPath(raw,{kind:'bullet',section:0,index:0,bulletPath:path}),null);
});
test('structural operations move full subtrees and return their new addresses',()=>{
 const original=fixture(),moved=edit(original,target(1,1),'up');
 assert.deepEqual(Array.from(moved.target.bulletPath),[1,0]);assert.deepEqual(moved.raw.sections[0].bullets[1].sub[0],original.sections[0].bullets[1].sub[1]);
 const down=edit(moved.raw,moved.target,'down');assert.deepEqual(down.raw,original);
 const indent=edit(original,target(2),'indent');assert.deepEqual(Array.from(indent.target.bulletPath),[1,2]);assert.equal(indent.raw.sections[0].bullets[1].sub[2],'Last');
 const outdent=edit(indent.raw,indent.target,'outdent');assert.deepEqual(outdent.raw,original);
 const deep=edit(original,target(1,1),'outdent');assert.deepEqual(deep.raw.sections[0].bullets[2],original.sections[0].bullets[1].sub[1]);assert.equal(deep.raw.sections[0].bullets[1].sub.length,1);
 assert.deepEqual(original,fixture());
});
test('add actions preserve string text and existing metadata; boundaries and stale tree fail',()=>{
 const raw=fixture(),child=edit(raw,target(0),'child');assert.deepEqual(child.raw.sections[0].bullets[0],{text:'First',sub:['New subpoint']});
 const sibling=edit(raw,target(1,1),'sibling');assert.equal(sibling.raw.sections[0].bullets[1].sub[2],'New point');
 for(const [t,action] of [[target(0),'up'],[target(0),'indent'],[target(1),'outdent'],[target(2),'down']])assert.ok(C.planBulletStructure(JSON.stringify(raw),raw,t,action).error);
 assert.ok(C.planBulletStructure(JSON.stringify(raw),raw,target(1),'child','stale').error);
});
test('bulk deletion handles descendants, duplicate selection and shifting sibling indices',()=>{
 const raw=fixture();
 for(const targets of [[target(1),target(1,1,0),target(1)],[target(1,0),target(1,1)], [target(0),target(1,1,0)]]){
  const plan=C.planBulkDelete(JSON.stringify(raw),targets);assert.equal(plan.error,undefined);const list=JSON.parse(plan.text).sections[0].bullets;
  if(targets.length===3)assert.deepEqual(list,['First','Last']);
  else if(targets[0].bulletPath.length===2)assert.deepEqual(list[1].sub,[]);
  else {assert.equal(list[0].text,'Parent');assert.deepEqual(list[0].sub[1].sub,[]);}
 }
});
test('formatting selects inserted content, escapes code delimiters and rejects unsafe links',()=>{
 const code=C.proseFormatEdit('alpha `x` omega',6,9,'code');assert.equal(code.text,'alpha `` `x` `` omega');
 const nested=C.proseFormatEdit('a\n```example```\nz',2,15,'block');assert.match(nested.text,/````\n```example```\n````/);
 const bold=C.proseFormatEdit('alpha beta',6,10,'bold');assert.equal(bold.text,'alpha **beta**');assert.equal(bold.text.slice(bold.start,bold.end),'beta');
 const link=C.proseFormatEdit('Docs',0,4,'link','https://example.org/api');assert.equal(link.text,'[Docs](https://example.org/api)');
 for(const url of ['javascript:alert(1)','https://example.org/a b','https://example.org/a)'])assert.ok(C.proseFormatEdit('Docs',0,4,'link',url).error);
});
