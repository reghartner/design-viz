'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {entrypoint}=require('../tools/source-loader.cjs');
const C={URL};vm.runInNewContext(entrypoint('workbench').body,C);
const plain=value=>JSON.parse(JSON.stringify(value));
function fixture(){return {page:{sections:[{heading:'One',diagram:{nodes:{a:{title:'Alpha',group:'g'},b:{title:'Beta',locked:true,group:'g'},c:{title:'Gamma'},f:{title:'Float',locked:true},x:{title:'Extra'},u:{title:'Unused'}},rows:[['a',['b','c']]],floats:[{id:'f',side:'below',x:500,y:300},{id:'x',side:'below',x:800,y:300}],edges:[{from:'a',to:'b'}],groups:{g:{}}}},{heading:'Two'}]}};}
const diagram=raw=>raw.page.sections[0].diagram;

test('Layers order follows rows, stacks, floats, then unplaced source nodes and filters by title or id',()=>{
 const d=fixture().page.sections[0].diagram;
 assert.deepEqual(plain(C.builderLayerNodes(d,'')).map(x=>[x.id,x.placement.kind,x.locked]),[
  ['a','row',false],['b','row',true],['c','row',false],['f','float',true],['x','float',false],['u','unplaced',false]
 ]);
 assert.deepEqual(plain(C.builderLayerNodes(d,'gamma')).map(x=>x.id),['c']);
 assert.deepEqual(plain(C.builderLayerNodes(d,' f ')).map(x=>x.id),['f']);
});

test('one lock toggle is exactly one undoable source edit and selection itself has no history',()=>{
 let text=JSON.stringify(fixture(),null,2);const original=text;
 const persistence=C.createBuilderPersistence({storage:()=>({getItem:()=>null,setItem(){},removeItem(){}}),now:()=>0,schedule(){},cancel(){}});
 const session=C.createBuilderSession({source:{read:()=>text,write:value=>text=value},render(){},persistence});
 session.target={kind:'node',section:0,id:'a'};assert.equal(session.canUndo(),false);
 const plan=C.planSetNodeLocked(text,JSON.parse(text),0,'a',true);assert.equal(plan.error,undefined);assert.equal(session.accept(plan),true);
 assert.equal(JSON.parse(text).page.sections[0].diagram.nodes.a.locked,true);assert.equal(session.canUndo(),true);
 assert.equal(session.undo(),true);assert.equal(text,original);assert.equal(session.canUndo(),false);
});

test('every ordinary graph placement planner blocks locked nodes while content and deletion stay editable',()=>{
 const raw=fixture(),text=JSON.stringify(raw,null,2),locked=/Unlock .*Layers or Inspect/;
 const targets=[{kind:'node',section:0,id:'f'},{kind:'node',section:0,id:'x'}],rects=[{x:425,y:265,w:150,h:70},{x:725,y:265,w:150,h:70}];
 const blocked=[
  C.planMoveRow(text,raw,0,0,1),C.planMoveGroup(text,raw,0,'g',{gap:1}),C.planMoveNode(text,raw,0,'b',{gap:1}),
  C.planPlaceFloat(text,raw,0,'f',520,320),C.planSetNodeFloat(text,raw,0,'f','above'),C.planSwapNodes(text,raw,0,'a','b'),
  C.planStackNodes(text,raw,0,['a','b']),C.planTransformFloats(text,raw,targets,{type:'move',dx:10,dy:10}),
  C.planAlignSpatial(text,raw,targets,'missing','horizontal',rects),C.planNudgeSpatial(text,raw,targets,'missing',rects,10,0),
  C.planDistributeSpatial(text,raw,targets.concat({kind:'node',section:0,id:'a'}),'missing',rects.concat({x:800,y:100,w:150,h:70}),'horizontal'),
  C.planAutoArrange(text,raw,0,{})
 ];
 blocked.forEach((plan,index)=>assert.match(plan.error,locked,'blocked seam '+index));
 assert.equal(C.planSetField(text,raw,['page','sections',0,'diagram','nodes','b'],'title','"Edited"').error,undefined);
 assert.equal(C.planDeleteNode(text,raw,0,'b').error,undefined);
});

test('locked validates as boolean and the renderer carries a subtle lock affordance',()=>{
 const raw=fixture();diagram(raw).nodes.a.locked='yes';
 const findings=C.validate(C.normalize(raw));assert.ok(findings.warnings.some(w=>w.includes('.nodes.a.locked: must be true or false')));
 const host={innerHTML:'',insertAdjacentHTML(where,html){this.innerHTML=html;},querySelector(){return null;}};
 // Contract-level proof stays independent of DOM SVG shims.
 const engine=entrypoint('workbench').body;assert.match(engine,/data-dv-position-locked/);assert.match(engine,/node-position-lock/);
});
