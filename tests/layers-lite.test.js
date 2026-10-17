'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const {entrypoint}=require('../tools/source-loader.cjs');
const C={URL};vm.runInNewContext(entrypoint('workbench').body,C);
const plain=value=>JSON.parse(JSON.stringify(value));
function fixture(){return {page:{sections:[{heading:'One',diagram:{nodes:{a:{title:'Alpha',group:'g'},b:{title:'Beta',locked:true,group:'g'},c:{title:'Gamma',group:'g'},f:{title:'Float',locked:true},x:{title:'Extra'},r:{type:'text',text:'Release notes\nsecond line'},u:{title:'Unused'}},rows:[['a',['b','c']],['r']],floats:[{id:'f',side:'below',x:500,y:300,noSpread:true},{id:'x',side:'below',x:800,y:300,noSpread:true}],edges:[{from:'a',to:'b'},{from:'b',to:'x'}],groups:{g:{}}}},{heading:'Two',prose:'No diagram here.'}]}};}
const diagram=raw=>raw.page.sections[0].diagram;
const centers=d=>plain(C.layout(d).pos);
const xy=p=>({cx:p.cx,cy:p.cy});

test('locking one node or a row is one edit; undo restores membership and unlock retains its pin',()=>{
 let text=JSON.stringify(fixture(),null,2),original=text;
 const persistence=C.createBuilderPersistence({storage:()=>({getItem:()=>null,setItem(){},removeItem(){}}),now:()=>0,schedule(){},cancel(){}});
 const session=C.createBuilderSession({source:{read:()=>text,write:value=>text=value},render(){},persistence});
 const before=centers(diagram(JSON.parse(text))).a;
 assert.equal(session.accept(C.planSetNodeLocked(text,JSON.parse(text),0,'a',true)),true);
 let d=diagram(JSON.parse(text));assert.equal(d.nodes.a.locked,true);assert.ok(d.floats.some(f=>f.id==='a'&&f.noSpread===true));
 assert.deepEqual(xy(centers(d).a),xy(before));assert.equal(session.undo(),true);assert.equal(text,original);assert.equal(session.canUndo(),false);
 assert.equal(session.accept(C.planSetNodesLocked(text,JSON.parse(text),0,['a','b','c'],true)),true);
 d=diagram(JSON.parse(text));assert.ok(['a','b','c'].every(id=>d.nodes[id].locked===true));
 assert.equal(session.undo(),true);assert.equal(text,original);
 assert.equal(session.accept(C.planSetNodeLocked(text,JSON.parse(text),0,'a',true)),true);
 assert.equal(session.accept(C.planSetNodeLocked(text,JSON.parse(text),0,'a',false)),true);
 d=diagram(JSON.parse(text));assert.equal(d.nodes.a.locked,undefined);assert.ok(d.floats.some(f=>f.id==='a'));
});

test('mixed placement operations retain locked selection but move only unlocked nodes',()=>{
 const raw=fixture(),text=JSON.stringify(raw,null,2),base=centers(diagram(raw));
 function result(plan){assert.equal(plan.error,undefined);assert.notEqual(plan.noop,true);return diagram(JSON.parse(plan.text));}
 let d=result(C.planMoveRow(text,raw,0,0,1));assert.deepEqual(xy(centers(d).b),xy(base.b));assert.ok(d.floats.some(f=>f.id==='b'&&f.noSpread===true));
 d=result(C.planMoveGroup(text,raw,0,'g',{gap:2}));assert.deepEqual(xy(centers(d).b),xy(base.b));assert.deepEqual(d.rows,[['r'],['a','c']]);assert.ok(d.floats.some(f=>f.id==='b'&&f.noSpread===true));
 assert.equal(C.planMoveNode(text,raw,0,'b',{gap:1}).noop,true);
 assert.equal(C.planPlaceFloat(text,raw,0,'f',520,320).noop,true);
 assert.equal(C.planSetNodeFloat(text,raw,0,'f','above').noop,true);
 assert.equal(C.planSwapNodes(text,raw,0,'a','b').noop,true);
 d=result(C.planStackNodes(text,raw,0,['a','b','c']));assert.deepEqual(xy(centers(d).b),xy(base.b));
 const targets=[{kind:'node',section:0,id:'f'},{kind:'node',section:0,id:'x'}],rects=[{x:425,y:265,w:150,h:70},{x:725,y:265,w:150,h:70}];
 d=result(C.planTransformFloats(text,raw,targets,{type:'move',dx:40,dy:10}));let p=centers(d);assert.deepEqual(xy(p.f),xy(base.f));assert.equal(p.x.cx,base.x.cx+40);assert.equal(p.x.cy,base.x.cy+10);
 d=result(C.planAlignSpatial(text,raw,targets,'f','vertical',rects));p=centers(d);assert.deepEqual(xy(p.f),xy(base.f));assert.equal(p.x.cx,base.f.cx);
 d=result(C.planNudgeSpatial(text,raw,targets,'f',rects,10,0));p=centers(d);assert.deepEqual(xy(p.f),xy(base.f));assert.equal(p.x.cx,base.x.cx+10);
 const lockedTargets=[targets[0],{kind:'node',section:0,id:'b'}],lockedRects=[rects[0],{x:base.b.cx-base.b.w/2,y:base.b.cy-base.b.h/2,w:base.b.w,h:base.b.h}];
 assert.equal(C.planTransformFloats(text,raw,lockedTargets,{type:'move',dx:10,dy:0}).noop,true);
 assert.equal(C.planAlignSpatial(text,raw,lockedTargets,'f','vertical',lockedRects).noop,true);
 assert.equal(C.planNudgeSpatial(text,raw,lockedTargets,'f',lockedRects,10,0).noop,true);
 assert.equal(C.planSetField(text,raw,['page','sections',0,'diagram','nodes','b'],'title','"Edited"').error,undefined);
 assert.equal(C.planDuplicateNode(text,raw,0,'b').error,undefined);
 assert.equal(C.planDeleteNode(text,raw,0,'b').error,undefined);
 const distributed=fixture(),dd=diagram(distributed);dd.nodes.y={title:'Yet another'};dd.floats.find(f=>f.id==='x').x=700;dd.floats.push({id:'y',side:'below',x:1000,y:300,noSpread:true});
 const dt=[{kind:'node',section:0,id:'f'},{kind:'node',section:0,id:'x'},{kind:'node',section:0,id:'y'}],dr=[{x:425,y:265,w:150,h:70},{x:625,y:265,w:150,h:70},{x:925,y:265,w:150,h:70}],dp=C.planDistributeSpatial(JSON.stringify(distributed),distributed,dt,'missing','horizontal',dr);
 d=result(dp);p=centers(d);assert.equal(p.f.cx,500);assert.equal(p.x.cx,750);assert.equal(p.y.cx,1000);
});

test('auto arrange preserves visible pins, routes around them, and is one undoable edit',()=>{
 const raw=fixture(),d=diagram(raw),before=centers(d),arranged=C.autoArrangeCandidates(d,{restarts:1,iterations:200});
 const arrangedById=Object.fromEntries(arranged.positions.map(p=>[p.id,p]));
 assert.deepEqual({x:arrangedById.b.x,y:arrangedById.b.y},{x:before.b.cx,y:before.b.cy});assert.deepEqual({x:arrangedById.f.x,y:arrangedById.f.y},{x:before.f.cx,y:before.f.cy});
 Object.keys(arrangedById).forEach(id=>{if(id==='b'||id==='f')return;['b','f'].forEach(lock=>{const a=arrangedById[id],p=arrangedById[lock];assert.ok(Math.abs(a.x-p.x)>=(a.width+p.width)/2+24 || Math.abs(a.y-p.y)>=(a.height+p.height)/2+24,id+' clears '+lock);});});
 let text=JSON.stringify(raw,null,2),original=text;
 const persistence=C.createBuilderPersistence({storage:()=>({getItem:()=>null,setItem(){},removeItem(){}}),now:()=>0,schedule(){},cancel(){}});
 const session=C.createBuilderSession({source:{read:()=>text,write:value=>text=value},render(){},persistence});
 const plan=C.planAutoArrange(text,raw,0,arranged);assert.equal(plan.error,undefined);assert.equal(session.accept(plan),true);
 const authored=diagram(JSON.parse(text)),after=centers(authored);assert.deepEqual(xy(after.b),xy(before.b));assert.deepEqual(xy(after.f),xy(before.f));
 assert.equal(authored.floats.find(entry=>entry.id==='b').noSpread,true);assert.equal(authored.floats.find(entry=>entry.id==='f').noSpread,true);
 assert.equal(Object.hasOwn(authored.floats.find(entry=>entry.id==='x'),'noSpread'),false);
 assert.equal(session.undo(),true);assert.equal(text,original);assert.equal(session.canUndo(),false);
 const all=fixture();Object.values(diagram(all).nodes).forEach(node=>node.locked=true);
 assert.equal(C.planAutoArrange(JSON.stringify(all),all,0,{}).noop,true);
});

test('auto arrange measures a locked text box, preserves its center, and clears movable nodes around it',()=>{
 const raw=fixture(),d=diagram(raw);d.nodes.r.locked=true;d.nodes.r.textStyle={width:420,height:120};
 d.rows=[[]];d.floats=[{id:'r',x:500,y:260,noSpread:true},{id:'x',x:520,y:260,noSpread:true}];d.edges=[];
 const result=C.autoArrangeCandidates(d,{restarts:1,iterations:100}),positions=Object.fromEntries(result.positions.map(p=>[p.id,p]));
 assert.deepEqual({x:positions.r.x,y:positions.r.y,width:positions.r.width,height:positions.r.height},{x:500,y:260,width:420,height:120});
 assert.ok(Math.abs(positions.x.x-positions.r.x)>=(positions.x.width+positions.r.width)/2+24 || Math.abs(positions.x.y-positions.r.y)>=(positions.x.height+positions.r.height)/2+24);
});

test('locked validates as boolean and lock affordance is Workbench/export scoped',()=>{
 const raw=fixture();diagram(raw).nodes.a.locked='yes';
 const findings=C.validate(C.normalize(raw));assert.ok(findings.warnings.some(w=>w.includes('.nodes.a.locked: must be true or false')));
 const repo=path.join(__dirname,'..'),engine=fs.readFileSync(path.join(repo,'src/engine.js'),'utf8'),interactions=fs.readFileSync(path.join(repo,'src/workbench/interactions.js'),'utf8'),exporter=fs.readFileSync(path.join(repo,'src/workbench/svg-export.js'),'utf8');
 assert.doesNotMatch(engine,/dv-position-lock/);assert.match(interactions,/dv-position-lock-badge/);assert.match(interactions,/setAttribute\('aria-label','Position locked'\)/);assert.match(interactions,/dv-position-lock-feedback/);assert.match(exporter,/dv-position-lock-badge/);assert.match(exporter,/lock-feedback/);
});
