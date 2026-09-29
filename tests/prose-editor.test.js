const test=require('node:test'),assert=require('node:assert/strict');
const C=require('./workbench-command-context.cjs')(['prose','visibility']);
const fixture=()=>({sections:[{bullets:['First',{text:'Parent',future:{keep:true},sub:['Child',{text:'Deep',revealAt:1,sub:['Grandchild']} ]},'Last']} ]});
const target=(...indices)=>({kind:'bullet',section:0,index:indices[0],bulletPath:indices});
function edit(raw,t,action){const plan=C.planBulletStructure(JSON.stringify(raw),raw,t,action);assert.equal(plan.error,undefined);return {raw:JSON.parse(plan.text),target:plan.target};}
test('first prose additions preserve wrappers, tab destination and unrelated source bytes',()=>{
 for(const raw of [{sections:[{heading:'Blank'}]},{page:{blocks:[{heading:'Keep',text:['Untouched']},{tabs:[{label:'Story',sections:[{heading:'Blank',future:{keep:true}}]}]}]}}]){
  const section=C.specSectionPaths(raw).length-1,path=Array.from(C.specSectionPaths(raw)[section].section);
  for(const [fn,key,placeholder,kind] of [[C.planAddParagraph,'text','New paragraph','para'],[C.planAddBullet,'bullets','New point','bullet']]){
   const source=JSON.stringify(raw,null,3),loc=C.jsonLocate(source,path),plan=fn(source,raw,section);
   assert.equal(plan.error,undefined);assert.equal(plan.kind,kind);assert.equal(plan.index,0);
   assert.deepEqual(C.specValueAt(JSON.parse(plan.text),path)[key],[placeholder]);
   const resultLoc=C.jsonLocate(plan.text,path);
   assert.equal(plan.text.slice(0,resultLoc.start),source.slice(0,loc.start));
   assert.equal(plan.text.slice(resultLoc.end),source.slice(loc.end));
   const next=fn(plan.text,JSON.parse(plan.text),section);assert.equal(next.index,1);
   assert.deepEqual(C.specValueAt(JSON.parse(next.text),path)[key],[placeholder,placeholder]);
  }
 }
});
test('paragraph insertion and moves retain string content and follow its new selection',()=>{
 const original={page:{sections:[{heading:'Story',text:'Code: `hello`\n```js\n  x()\n```',bullets:fixture().sections[0].bullets,future:true}]}},first={kind:'para',section:0,index:0};
 const source=JSON.stringify(original),append=C.planAddParagraph(source,original,0);
 assert.deepEqual(JSON.parse(append.text).page.sections[0].text,[original.page.sections[0].text,'New paragraph']);
 const before=C.planParagraphStructure(source,original,first,'before');assert.equal(before.target.index,0);
 assert.deepEqual(JSON.parse(before.text).page.sections[0].text,['New paragraph',original.page.sections[0].text]);
 const down=C.planParagraphStructure(before.text,JSON.parse(before.text),before.target,'down');assert.equal(down.target.index,1);
 const up=C.planParagraphStructure(down.text,JSON.parse(down.text),down.target,'up');assert.equal(up.text,before.text);
 const after=C.planParagraphStructure(up.text,JSON.parse(up.text),up.target,'after');assert.equal(after.target.index,1);
 const result=JSON.parse(after.text);assert.deepEqual(result.page.sections[0].bullets,original.page.sections[0].bullets);assert.equal(result.page.sections[0].future,true);
 const removed=C.builderDeletePlan(after.text,result,after.target);assert.deepEqual(JSON.parse(removed.text),JSON.parse(before.text));
 assert.equal(C.specValueAt(JSON.parse(down.text),C.builderTargetPath(JSON.parse(down.text),down.target)),'New paragraph');
});
test('prose planners reject malformed content, invalid selections, bare diagrams and stale paragraphs',()=>{
 const raw={sections:[{text:['One','Two']} ]},source=JSON.stringify(raw),t={kind:'para',section:0,index:0};
 for(const [target,action] of [[t,'up'],[{...t,index:1},'down'],[{...t,index:9},'after'],[{...t,index:-1},'after'],[{...t,index:0.5},'before'],[{...t,kind:'bullet'},'after'],[t,'unknown']])assert.ok(C.planParagraphStructure(source,raw,target,action).error);
 assert.ok(C.planParagraphStructure(source,raw,t,'after','stale').error);
 for(const bad of [{sections:[{text:{keep:true},bullets:{keep:true}}]},{nodes:{},rows:[[]]}]){
  assert.ok(C.planAddParagraph(JSON.stringify(bad),bad,0).error);assert.ok(C.planAddBullet(JSON.stringify(bad),bad,0).error);
 }
 assert.ok(C.planAddParagraph(source,raw,99).error);
 const malformed={sections:[{text:['One',{keep:true}]}]};assert.ok(C.planAddParagraph(JSON.stringify(malformed),malformed,0).error);
});
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
