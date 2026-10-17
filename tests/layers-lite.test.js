'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const {entrypoint}=require('../tools/source-loader.cjs');
const C={URL,TextEncoder};vm.runInNewContext(entrypoint('workbench').body,C);
const plain=value=>JSON.parse(JSON.stringify(value));
function fixture(){return {page:{sections:[{heading:'One',diagram:{nodes:{a:{title:'Alpha',group:'g'},b:{title:'Beta',locked:true,group:'g'},c:{title:'Gamma',group:'g'},f:{title:'Float',locked:true},x:{title:'Extra'},r:{type:'text',text:'Release notes\nsecond line'},u:{title:'Unused'}},rows:[['a',['b','c']],['r']],floats:[{id:'f',side:'below',x:500,y:300,noSpread:true},{id:'x',side:'below',x:800,y:300,noSpread:true}],edges:[{from:'a',to:'b'},{from:'b',to:'x'}],groups:{g:{}}}},{heading:'Two',prose:'No diagram here.'}]}};}
const diagram=raw=>raw.page.sections[0].diagram;
const centers=d=>plain(C.layout(d).pos);
const xy=p=>({cx:p.cx,cy:p.cy});

test('locking one node or a row is one edit; undo restores membership and unlock retains its position',()=>{
 let text=JSON.stringify(fixture(),null,2),original=text;
 const persistence=C.createBuilderPersistence({storage:()=>({getItem:()=>null,setItem(){},removeItem(){}}),now:()=>0,schedule(){},cancel(){}});
 const session=C.createBuilderSession({source:{read:()=>text,write:value=>text=value},render(){},persistence});
 const before=centers(diagram(JSON.parse(text))).a;
 assert.equal(session.accept(C.planSetNodeLocked(text,JSON.parse(text),0,'a',true)),true);
 let d=diagram(JSON.parse(text));assert.equal(d.nodes.a.locked,true);
 assert.deepEqual(xy(centers(d).a),xy(before));assert.equal(session.undo(),true);assert.equal(text,original);assert.equal(session.canUndo(),false);
 assert.equal(session.accept(C.planSetNodesLocked(text,JSON.parse(text),0,['a','b','c'],true)),true);
 d=diagram(JSON.parse(text));assert.ok(['a','b','c'].every(id=>d.nodes[id].locked===true));
 assert.equal(session.undo(),true);assert.equal(text,original);
 assert.equal(session.accept(C.planSetNodeLocked(text,JSON.parse(text),0,'a',true)),true);
 assert.equal(session.accept(C.planSetNodeLocked(text,JSON.parse(text),0,'a',false)),true);
 d=diagram(JSON.parse(text));assert.equal(d.nodes.a.locked,undefined);assert.deepEqual(xy(centers(d).a),xy(before));
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

/* #617 lock leaves every other node in place. Contract matrix:
 row | fixture | assertion (scoped) | rejects
 1 single lock | reflowFixture standard + lanes, lock 'b' inside the 4-node row a,b,c,h | layout(d).pos cx/cy of EVERY node equal before/after | lift-to-float that lets 'c' slide left into the gap (4 slots to 3)
 2 row lock | same, lock all of row 0 (a,b,c,h) | every node's cx/cy unchanged | row vanishing so rows below slide up
 3 multi-select lock (#520) | same, lock ['b','e'] (each inside its row) across two rows | every node's cx/cy unchanged | per-row reflow of either row
 4 group band | standard variant: only 'b' is grouped | every node's cy unchanged after locking 'b' | top band shrinking when the only grouped node leaves rows
 5 unlock | each locked state above, then unlock the same ids | every node's cx/cy unchanged, locked flags removed | unlock re-inserting into rows or clearing the pin
 6 undo/redo | each lock and unlock | undo restores exact prior text; redo restores exact locked text and positions | multi-edit locks or lossy undo
 7 pin holds | lock 'b', then delete row neighbour 'a' | 'b' keeps its cx/cy | a flag-only lock that leaves 'b' re-spacing with its row
 8 old documents | legacyLockFixture: old-style locked noSpread float + raw locked row node | layout positions equal recorded numbers | changing how stored locks render */
function reflowFixture(lanes){
 const d={nodes:{a:{title:'Alpha'},b:{title:'Beta'},c:{title:'Gamma'},h:{title:'Hotel'},d:{title:'Delta'},e:{title:'Echo'},f:{title:'Fox'},i:{title:'India'}},rows:[['a','b','c','h'],['d','e','f','i']],edges:[{from:'a',to:'b'},{from:'b',to:'c'},{from:'c',to:'h'},{from:'b',to:'e'},{from:'d',to:'f'}]};
 if(lanes)d.routing='lanes';
 else{d.rows=[['a','b','c','h'],['d','e',['f','i']]];d.nodes.b.group='g';d.groups={g:{title:'Only Beta'}};d.nodes.x={title:'Spread float'};d.floats=[{id:'x',side:'below'}];d.edges.push({from:'x',to:'c'});}
 return {page:{sections:[{heading:'Rows',diagram:d}]}};
}
function lockSession(raw){
 const state={text:JSON.stringify(raw,null,2)};
 const persistence=C.createBuilderPersistence({storage:()=>({getItem:()=>null,setItem(){},removeItem(){}}),now:()=>0,schedule(){},cancel(){}});
 state.session=C.createBuilderSession({source:{read:()=>state.text,write:value=>state.text=value},render(){},persistence});
 return state;
}
const allCenters=text=>Object.fromEntries(Object.entries(centers(diagram(JSON.parse(text)))).map(([id,p])=>[id,xy(p)]));

for(const lanes of [false,true])for(const [label,ids] of [['single middle node',['b']],['row lock',['a','b','c','h']],['multi-select across rows',['b','e']]])
test('#617 '+(lanes?'lanes':'standard')+' '+label+': lock and unlock move no node; undo/redo exact',()=>{
 const state=lockSession(reflowFixture(lanes)),original=state.text,before=allCenters(original);
 assert.equal(Object.keys(before).length,lanes?8:9);
 assert.equal(state.session.accept(C.planSetNodesLocked(state.text,JSON.parse(state.text),0,ids,true)),true);
 const locked=state.text;assert.notEqual(locked,original);
 assert.ok(ids.every(id=>diagram(JSON.parse(locked)).nodes[id].locked===true));
 assert.deepEqual(allCenters(locked),before);
 assert.equal(state.session.undo(),true);assert.equal(state.text,original);
 assert.equal(state.session.redo(),true);assert.equal(state.text,locked);assert.deepEqual(allCenters(state.text),before);
 assert.equal(state.session.accept(C.planSetNodesLocked(state.text,JSON.parse(state.text),0,ids,false)),true);
 const unlocked=state.text;assert.ok(ids.every(id=>diagram(JSON.parse(unlocked)).nodes[id].locked===undefined));
 assert.deepEqual(allCenters(unlocked),before);
 assert.equal(state.session.undo(),true);assert.equal(state.text,locked);
 assert.equal(state.session.redo(),true);assert.equal(state.text,unlocked);
});

test('#617 a locked row node stays pinned when a row neighbour is deleted',()=>{
 for(const lanes of [false,true]){
  const raw=reflowFixture(lanes),text=JSON.stringify(raw,null,2),before=allCenters(text);
  const lock=C.planSetNodeLocked(text,raw,0,'b',true);assert.equal(lock.error,undefined);
  const del=C.planDeleteNode(lock.text,JSON.parse(lock.text),0,'a');assert.equal(del.error,undefined);
  assert.deepEqual(allCenters(del.text).b,before.b);
 }
});

test('#617 documents saved with older locks render unchanged',()=>{
 const d={nodes:{a:{title:'Alpha'},b:{title:'Beta',locked:true},c:{title:'Gamma'},p:{title:'Pinned',locked:true}},rows:[['a','b','c']],floats:[{id:'p',side:'below',x:410,y:260,noSpread:true}],edges:[{from:'a',to:'p'}]};
 assert.deepEqual(Object.fromEntries(Object.entries(centers(d)).map(([id,p])=>[id,xy(p)])),{a:{cx:110,cy:69},b:{cx:590,cy:69},c:{cx:1070,cy:69},p:{cx:410,cy:260}});
});

/* #617 a lock stays a pin under every non-placement edit that would re-space
 its row or band. Each row: fixture | edit | the same edit WITHOUT the lock
 moves 'b' (precondition) | with 'b' locked, 'b' keeps its cx/cy AND the edit's
 content change equals the unlocked one. Rejects a flag-only lock that leaves
 the node to re-space with its row, and a plan that skips edits near locks. */
function pinFixture(options={}){
 const raw=reflowFixture(!!options.lanes),d=diagram(raw);
 if(!options.lanes){d.rows=[['a','b','c','h'],['d','e','f','i']];delete d.groups;delete d.nodes.b.group;delete d.nodes.x;delete d.floats;d.edges=d.edges.filter(e=>e.from!=='x');}
 if(options.groupA){d.nodes.a.group='g';d.groups={g:{title:'Alpha group'},p:{title:'Outer'}};}
 if(options.sameRowEdge)d.edges.push({from:'b',to:'a'});
 return raw;
}
const groupedSource=pinFixture({groupA:true});
const pinCases=[
 ['delete row neighbour (standard)',{},(t,r)=>C.planDeleteNode(t,r,0,'a')],
 ['cut / bulk delete row neighbour',{},(t)=>C.planBulkDelete(t,[{kind:'node',section:0,id:'a'}])],
 ['duplicate row neighbour',{},(t,r)=>C.planDuplicateNode(t,r,0,'a')],
 ['set group on row neighbour',{},(t,r)=>C.planSetNodeGroup(t,r,0,'a','g')],
 ['bulk set group on row neighbours',{},(t)=>C.planBulkSetGroup(t,JSON.parse(t),[{kind:'node',section:0,id:'a'},{kind:'node',section:0,id:'c'}],'g')],
 ['set group parent',{groupA:true},(t,r)=>C.planSetGroupParent(t,r,0,'g','p')],
 ['delete group',{groupA:true},(t,r)=>C.planDeleteGroup(t,r,0,'g')],
 ['add image into the row',{},(t,r)=>C.planAddImageNode(t,r,0,{name:'shot.png',data:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4UYAAAAASUVORK5CYII='},{row:0,slot:0})],
 ['paste a grouped node',{},(t,r)=>C.planPasteBuilderClipboard(t,r,C.builderClipboardCopy(groupedSource,[{kind:'node',section:0,id:'a'}]).data,{section:0})],
 ['extract row neighbours to a diagram',{},(t,r)=>C.planExtractIndependentDiagram(t,r,0,['a','c'],{mode:'local',title:'Orders'})],
 ['lanes: add edge',{lanes:true},(t,r)=>C.planAddEdge(t,r,0)],
 ['lanes: add edge between',{lanes:true},(t,r)=>C.planAddEdgeBetween(t,r,0,'a','c')],
 ['lanes: delete edge',{lanes:true,sameRowEdge:true},(t,r)=>C.planDeleteEdge(t,r,0,5)],
 ['lanes: change edge endpoint',{lanes:true},(t,r)=>C.planSetEdgeEndpoint(t,r,0,3,'to','h')]
];
/* Everything except b's own lock flag and placement entry: the locked edit
 must make the same content AND placement change for every other node as the
 unlocked one, so a plan that refuses, drops or misplaces the edit near a
 lock cannot pass. b leaves its slot the way a pin lift does (a one-node
 stack collapses, an emptied row stays). */
function contentOnly(text){
 const raw=JSON.parse(text),d=diagram(raw);delete d.nodes.b.locked;
 d.rows=(d.rows||[]).map(row=>row.flatMap(slot=>{if(!Array.isArray(slot))return slot==='b'?[]:[slot];const kept=slot.filter(id=>id!=='b');return kept.length===1?[kept[0]]:kept.length?[kept]:[];}));
 d.floats=(d.floats||[]).filter(f=>f.id!=='b');return raw;
}
for(const [label,options,edit] of pinCases)test('#617 lock pins b through: '+label,()=>{
 const raw=pinFixture(options),text=JSON.stringify(raw,null,2),before=allCenters(text).b;
 const unlocked=edit(text,JSON.parse(text));assert.equal(unlocked.error,undefined);assert.notDeepEqual(allCenters(unlocked.text).b,before,'precondition: the edit re-spaces b when unlocked');
 const lock=C.planSetNodeLocked(text,JSON.parse(text),0,'b',true);assert.equal(lock.error,undefined);assert.deepEqual(allCenters(lock.text).b,before);
 const locked=edit(lock.text,JSON.parse(lock.text));assert.equal(locked.error,undefined);
 const after=JSON.parse(locked.text);assert.equal(diagram(after).nodes.b.locked,true);assert.deepEqual(allCenters(locked.text).b,before);
 assert.notDeepEqual(contentOnly(unlocked.text),contentOnly(text),'the edit changes content');assert.deepEqual(contentOnly(locked.text),contentOnly(unlocked.text),'the locked edit still happens');
});

/* #617 guard: row slots are spaced by slot count and fixed card height, never
 by content, so Inspector field edits on a neighbour (title, subtitle, icon,
 text-box text and size) cannot re-space a row and need no pin lift. */
test('#617 content and size edits on a row neighbour leave b in place, locked or not',()=>{
 const raw=pinFixture(),d=diagram(raw);d.nodes.a={type:'text',text:'Short',textStyle:{width:120,height:40}};
 const text=JSON.stringify(raw,null,2),before=allCenters(text).b,path=['page','sections',0,'diagram','nodes','c'];
 const edits=[
  (t,r)=>C.planSetField(t,r,path,'title',JSON.stringify('A much longer title '.repeat(8))),
  (t,r)=>C.planSetField(t,r,path,'sub',JSON.stringify('long subtitle '.repeat(20))),
  (t,r)=>C.planSetField(t,r,path,'icon','"db"'),
  (t,r)=>C.planEditTextBox(t,r,0,'a',{text:'x'.repeat(400),textStyle:{width:900,height:600,fontSize:48}})
 ];
 for(const start of [text,C.planSetNodeLocked(text,JSON.parse(text),0,'b',true).text])for(const edit of edits){
  const plan=edit(start,JSON.parse(start));assert.equal(plan.error,undefined);assert.notEqual(plan.text,start);
  assert.deepEqual(allCenters(plan.text).b,before);assert.deepEqual(diagram(JSON.parse(plan.text)).rows,diagram(JSON.parse(start)).rows);
 }
});
