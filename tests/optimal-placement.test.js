'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{execFileSync}=require('node:child_process');
const {entrypoint}=require('../tools/source-loader.cjs');
const C={URL,TextEncoder};vm.runInNewContext(entrypoint('workbench').body,C);
const plain=v=>JSON.parse(JSON.stringify(v)),targets=(...ids)=>ids.map(id=>({kind:'node',section:0,id}));
const fixture=()=>({page:{title:'Incremental',blocks:[{heading:'Flow',text:'Keep this prose',diagram:{
 nodes:{a:{title:'Client',group:'app'},b:{title:'Service',group:'app'},c:{title:'Store',locked:true},f:{title:'Worker'},z:{title:'Authored origin'}},
 groups:{app:{label:'Application'}},rows:[['a','b','c']],floats:[{id:'f',side:'above'},{id:'z',side:'below',x:0,y:0,noSpread:true}],
 edges:[{from:'a',to:'b',fromPort:{side:'right',offset:.5},bend:35},{from:'b',to:'c'},{from:'a',to:'f'}],
 steps:[{edge:'a->b',text:'Call'}],panels:[{id:'state',type:'state',states:['ready'],initial:{state:'ready'}}],
 layouts:[{id:'canvas',name:'Canvas',presentation:'explore',sectionLayout:{default:[{diagram:true,col:1,row:1,w:12,h:8}]},exploreLayout:{canvas:{panels:[{panel:'state',x:850,y:300,w:300,h:200}]}}}],defaultLayout:'canvas'
}}]}});
const diagram=s=>s.page.blocks[0].diagram;
function center(p){return {x:p.cx,y:p.cy};}
function noCollision(d,ids){const pos=C.layout(d).pos;for(const id of ids)for(const other of Object.keys(pos))if(id!==other){const p=pos[id],q=pos[other];assert.ok(Math.abs(p.cx-q.cx)>=(p.w+q.w)/2+23.9 || Math.abs(p.cy-q.cy)>=(p.h+q.h)/2+23.9,`${id} overlaps ${other}`);}}
function preservedFields(before,after){for(const key of ['nodes','groups','edges','steps','panels','layouts','defaultLayout'])assert.deepEqual(after[key],before[key],key);}

test('selected row nodes use local topology, preserve unrelated/locked centers, routes and named layouts deterministically',()=>{
 const raw=fixture(),text=JSON.stringify(raw,null,2),d=diagram(raw),before=C.layout(d).pos;
 const plan=C.planPlaceOptimally(text,raw,targets('b','c'));assert.ok(plan.text,plan.error);
 const next=JSON.parse(plan.text),after=diagram(next),pos=C.layout(after).pos;
 for(const id of ['a','c','f','z'])assert.deepEqual(center(pos[id]),center(before[id]),id);
 assert.ok(after.floats.some(f=>f.id==='b' && f.noSpread));noCollision(after,['b']);preservedFields(d,after);
 assert.equal(next.page.blocks[0].text,'Keep this prose');assert.equal(JSON.stringify(raw,null,2),text);
 assert.equal(C.planPlaceOptimally(text,raw,targets('c','b')).text,plan.text,'selection order does not affect result');
 const panel=d.layouts[0].exploreLayout.canvas.panels[0],b=pos.b;
 assert.ok(b.cx+b.w/2<=panel.x || b.cx-b.w/2>=panel.x+panel.w || b.cy+b.h/2<=panel.y || b.cy-b.h/2>=panel.y+panel.h);
 assert.equal(C.planPlaceOptimally(text,raw,targets('c')).noop,true);
 assert.ok(C.planPlaceOptimally(text,raw,targets('absent')).error);
});

test('multiple connected and disconnected nodes use real text sizes, retain group membership and do not pile up',()=>{
 const raw=fixture(),d=diagram(raw);d.nodes.x={title:'Added'};d.nodes.y={type:'text',text:'Wide annotation',textStyle:{width:620,height:180,fontSize:24}};d.nodes.orphan={title:'Independent',group:'app'};
 d.edges.push({from:'a',to:'x'},{from:'x',to:'y'});
 const text=JSON.stringify(raw),p=C.planPlaceOptimally(text,raw,targets('y','x','orphan'));assert.ok(p.text,p.error);
 const after=diagram(JSON.parse(p.text)),pos=C.layout(after).pos;noCollision(after,['x','y','orphan']);
 assert.equal(pos.y.w,620);assert.equal(pos.y.h,180);assert.ok(pos.x.cx>pos.a.cx,'downstream node prefers right of anchor');assert.ok(Math.hypot(pos.x.cx-pos.a.cx,pos.x.cy-pos.a.cy)<700);
 assert.equal(after.nodes.orphan.group,'app');preservedFields(d,after);
});

test('all-row, stacked, lanes, automatic floats and nested groups preserve every unrelated center',()=>{
 for(const lanes of [false,true]){
 const raw={nodes:{a:{group:'deep'},b:{group:'deep'},c:{},f:{}},groups:{outer:{label:'Outer'},deep:{label:'Deep',parent:'outer'}},rows:lanes?[['a','b','c']]:[[['a','b'],'c']],edges:[{from:'a',to:'b'},{from:'b',to:'c'}],floats:lanes?[]:[{id:'f',side:'above'}]};if(lanes){raw.routing='lanes';delete raw.nodes.f;}
 const before=C.layout(raw).pos,p=C.planPlaceOptimally(JSON.stringify(raw),raw,targets('a'));assert.ok(p.text,p.error);const d=JSON.parse(p.text),after=C.layout(d).pos;
 for(const id of Object.keys(before).filter(id=>id!=='a'))assert.deepEqual(center(after[id]),center(before[id]),id);noCollision(d,['a']);
 const all=C.planPlaceOptimally(p.text,d,targets(...Object.keys(d.nodes)));assert.ok(all.text,all.error);assert.deepEqual(JSON.parse(all.text).rows,[[]]);noCollision(JSON.parse(all.text),Object.keys(d.nodes));
 }
});

test('imported-only and mixed selections edit consumer positions and preserve other imports and local centers',()=>{
 for(const selected of [['platform::api'],['client','platform::api']]){
 const specs=['platform','checkout'].map(id=>JSON.parse(fs.readFileSync(path.join(__dirname,'../examples/canon/topology/'+id+'.json'),'utf8'))),raw=specs[1],d=raw.page.sections[0].diagram;
 d.topologyImports.push({spec:'platform',export:'core',as:'second'});const ctx={version:1,id:'checkout',specs},saved=JSON.stringify(specs);
 const before=C.layout(C.FlowTopology.resolveSource(raw,ctx).page.sections[0].diagram).pos;
 const plan=C.planPlaceOptimally(JSON.stringify(raw),raw,targets(...selected),ctx);assert.ok(plan.text,plan.error);
 const next=JSON.parse(plan.text),afterD=next.page.sections[0].diagram,after=C.layout(C.FlowTopology.resolveSource(next,ctx).page.sections[0].diagram).pos;
 for(const id of Object.keys(before).filter(id=>!selected.includes(id)))assert.deepEqual(center(after[id]),center(before[id]),id);
 assert.deepEqual(afterD.nodes,d.nodes);assert.deepEqual(afterD.edges,d.edges);assert.equal(JSON.stringify(specs),saved);
 assert.ok(afterD.topologyImports[0].nodePositions.api);assert.ok(C.planPlaceOptimally(JSON.stringify(raw),raw,targets(...selected)).error);
 }
});

test('normalization places only new missing/unpositioned/zero nodes and retains explicit points and old origin',()=>{
 const raw=fixture(),source=JSON.stringify(raw),next=plain(raw),d=diagram(next),before=C.layout(diagram(raw)).pos;
 for(const id of ['missing','automatic','zero','explicit','row'])d.nodes[id]={title:id};
 d.floats.push({id:'automatic',side:'below',noSpread:true},{id:'zero',side:'below',x:0,y:0},{id:'explicit',side:'below',x:420,y:750,noSpread:true});
 d.rows[0].push('row');d.edges.push({from:'a',to:'missing'},{from:'missing',to:'zero'});
 const normalized=C.normalizeWorkbenchAgentPlacement(source,JSON.stringify(next)),after=diagram(JSON.parse(normalized));
 for(const id of ['missing','automatic','zero'])assert.ok(after.floats.find(f=>f.id===id && f.noSpread && Number.isFinite(f.x) && Number.isFinite(f.y) && (f.x || f.y)),id);
 assert.deepEqual(after.floats.find(f=>f.id==='explicit'),d.floats.find(f=>f.id==='explicit'));assert.deepEqual(center(C.layout(after).pos.z),center(before.z));
 assert.ok(after.rows.some(row=>row.includes('row')));noCollision(after,['missing','automatic','zero']);
 assert.equal(C.normalizeWorkbenchAgentPlacement(source,normalized),normalized,'idempotent on accepted preview');
 assert.equal(C.normalizeWorkbenchAgentPlacement(source,source),source,'no-op preserves exact source');
});

test('normalization freezes preexisting automatic geometry when a new group/header would move it',()=>{
 const old={page:{blocks:[{diagram:{nodes:{a:{},b:{}},rows:[['a','b']],floats:[],edges:[]}}]}},next=plain(old),d=diagram(next);d.nodes.x={group:'new'};d.groups={new:{label:'New group'}};d.floats.push({id:'x',side:'above'});
 const source=C.normalizeWorkbenchAgentPlacement(JSON.stringify(old),JSON.stringify(next)),after=C.layout(diagram(JSON.parse(source))).pos,before=C.layout(diagram(old)).pos;
 for(const id of ['a','b'])assert.deepEqual(center(after[id]),center(before[id]));
});

test('new diagrams without slots are placed, authored full arrangements and malformed explicit coordinates remain for validation',()=>{
 const before=JSON.stringify({page:{blocks:[]}}),raw={page:{blocks:[{diagram:{nodes:{a:{},b:{},c:{}},edges:[{from:'a',to:'b'},{from:'b',to:'c'}]}}]}};
 const source=C.normalizeWorkbenchAgentPlacement(before,JSON.stringify(raw)),d=diagram(JSON.parse(source));assert.deepEqual(d.rows,[[]]);assert.equal(d.floats.length,3);noCollision(d,['a','b','c']);assert.deepEqual(plain(C.validate(C.normalize(JSON.parse(source)))).errors,[]);
 const arranged=fixture();diagram(arranged).floats.find(f=>f.id==='z').x=20;const text=JSON.stringify(arranged);assert.equal(C.normalizeWorkbenchAgentPlacement(before,text),text);
 const malformed=plain(raw);diagram(malformed).floats=[{id:'a',side:'below',x:40}];assert.throws(()=>C.normalizeWorkbenchAgentPlacement(before,JSON.stringify(malformed)),/./);
});

test('planner limits and invalid selections fail without mutating source',()=>{
 const raw=fixture(),text=JSON.stringify(raw);assert.ok(C.planPlaceOptimally(text,raw,[...targets('a'),{kind:'node',section:1,id:'b'}]).error);
 const huge={nodes:{},rows:[[]],edges:[]};for(let i=0;i<201;i++)huge.nodes['n'+i]={};
 assert.match(C.planPlaceOptimally(JSON.stringify(huge),huge,targets(...Object.keys(huge.nodes))).error,/200 nodes/);assert.equal(JSON.stringify(raw),text);
});

test('no-point node and text additions use same collision-aware planner while explicit canvas points remain exact',()=>{
 const raw=fixture(),text=JSON.stringify(raw);
 for(const operation of [()=>C.planAddNode(text,raw,0),()=>C.planAddTextBox(text,raw,0)]){const p=operation();assert.ok(p.text,p.error);noCollision(diagram(JSON.parse(p.text)),[p.id]);assert.deepEqual(JSON.parse(p.text.slice(p.start,p.end)),diagram(JSON.parse(p.text)).nodes[p.id]);}
 const p=C.planAddNode(text,raw,0,null,{x:0,y:0}),d=diagram(JSON.parse(p.text));assert.deepEqual(center(C.layout(d).pos[p.id]),{x:0,y:0});
});

test('session accepts placement atomically, supports one Undo/Redo and rejects stale plans',()=>{
 let text=JSON.stringify(fixture());const original=text;
 const session=C.createBuilderSession({source:{read:()=>text,write:v=>{text=v;}},persistence:{read:()=>({}),preserve(){},cancel(){},save(){},destroy(){}},render(){}});
 session.replaceProject(text);const snap=session.snapshot(),p=C.planPlaceOptimally(text,JSON.parse(text),targets('a','b'));
 assert.equal(session.accept(p,{snapshot:snap}),true);const after=text;assert.equal(session.accept(p,{snapshot:snap}),false);assert.equal(text,after);
 assert.equal(session.undo(),true);assert.equal(text,original);assert.equal(session.canUndo(),false);assert.equal(session.redo(),true);assert.equal(text,after);
});

test('agent exchange normalizes before validation/preview and accepts that exact source; failure and stale receive never write',async()=>{
 let source=JSON.stringify(fixture());const original=source,raw=JSON.parse(source);diagram(raw).nodes.new={title:'New'};diagram(raw).edges.push({from:'a',to:'new'});const proposalSource=JSON.stringify(raw),writes=[];
 const exchange=C.createWorkbenchAgentExchange({clientId:'test',snapshot:()=>({source,project:1,open:true}),busy:()=>false,prepare:async()=>null,normalize:C.normalizeWorkbenchAgentPlacement,validate:text=>C.validate(C.normalize(JSON.parse(text))).errors.join('\n'),apply:text=>{source=text;writes.push(text);return {ok:true};}});
 const sent=exchange.request(),proposal={id:'add',baseRevision:sent.snapshot.revision,source:proposalSource};const preview=await exchange.preview(proposal);
 assert.equal(preview.ok,true,JSON.stringify(preview.conflicts));assert.notEqual(preview.source,proposalSource);assert.equal(source,original);
 exchange.receive({proposal:{...proposal,source:preview.source}},sent);assert.equal(source,preview.source);assert.equal(writes.length,1);
 exchange.receive({proposal},sent);assert.equal(writes.length,1);
 const failed=C.createWorkbenchAgentExchange({clientId:'bad',snapshot:()=>({source:original,project:1,open:true}),busy:()=>false,normalize(){throw Error('placement unavailable');},apply(){throw Error('must not apply');}});
 const first=failed.request(),bad={id:'bad',baseRevision:first.snapshot.revision,source:proposalSource};assert.equal(failed.preview(bad).ok,false);assert.match(failed.receive({proposal:bad},first),/placement unavailable/);
});

test('portable placement CLI matches the desktop planner and refuses output overwrite',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'flowview-place-'));try{
 const input=path.join(dir,'in.json'),output=path.join(dir,'out.json'),raw=fixture(),text=JSON.stringify(raw);fs.writeFileSync(input,text);
 assert.match(execFileSync(process.execPath,[path.join(__dirname,'../tools/place-nodes.cjs'),'--help'],{encoding:'utf8'}),/--context.*[\s\S]*does not exist/);
 const args=[path.join(__dirname,'../tools/place-nodes.cjs'),'--section','0','--node','b',input,output];execFileSync(process.execPath,args);
 assert.equal(fs.readFileSync(output,'utf8'),C.planPlaceOptimally(text,raw,targets('b')).text);
 assert.throws(()=>execFileSync(process.execPath,args,{stdio:'pipe'}));assert.equal(fs.readFileSync(input,'utf8'),text);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('missing new local nodes normalize before imported-topology validation and retain provider ownership',()=>{
 const specs=['platform','checkout'].map(id=>JSON.parse(fs.readFileSync(path.join(__dirname,'../examples/canon/topology/'+id+'.json'),'utf8'))),raw=specs[1],before=JSON.stringify(raw),ctx={version:1,id:'checkout',specs},next=plain(raw),d=next.page.sections[0].diagram;
 d.nodes.added={title:'Local addition'};d.edges.push({from:'platform::api',to:'added'});
 const source=C.normalizeWorkbenchAgentPlacement(before,JSON.stringify(next),ctx),after=JSON.parse(source).page.sections[0].diagram;
 assert.ok(after.floats.find(f=>f.id==='added' && Number.isFinite(f.x)));assert.deepEqual(after.nodes,d.nodes);assert.deepEqual(after.edges,d.edges);
 const resolved=C.FlowTopology.resolveSource(JSON.parse(source),ctx);assert.deepEqual(plain(C.validate(C.normalize(resolved))).errors,[]);
});

test('normalization follows stable section IDs when sections move and never repositions existing origins',()=>{
 const old=fixture();old.page.blocks[0].id='existing';const next=plain(old);next.page.blocks.unshift({id:'new-section',diagram:{nodes:{z:{title:'New z'}},rows:[[]],floats:[{id:'z',side:'below',x:0,y:0}]}});
 const output=JSON.parse(C.normalizeWorkbenchAgentPlacement(JSON.stringify(old),JSON.stringify(next)));
 assert.deepEqual(output.page.blocks[1],old.page.blocks[0]);assert.ok(output.page.blocks[0].diagram.floats[0].x || output.page.blocks[0].diagram.floats[0].y);
});


test('unmatched prepended headings cannot steal an existing section with a reused node ID',()=>{
 const old={page:{blocks:[{heading:'Old',diagram:{nodes:{start:{title:'Existing'}},rows:[[]],floats:[{id:'start',side:'below',x:320,y:210,noSpread:true}]}}]}},next=plain(old);
 next.page.blocks.unshift({heading:'New',diagram:{nodes:{start:{title:'New'}},rows:[[]],floats:[{id:'start',side:'below',x:0,y:0}]}});
 const output=JSON.parse(C.normalizeWorkbenchAgentPlacement(JSON.stringify(old),JSON.stringify(next)));
 assert.deepEqual(output.page.blocks[1],old.page.blocks[0]);
 assert.deepEqual(center(C.layout(output.page.blocks[1].diagram).pos.start),{x:320,y:210});
 const fresh=output.page.blocks[0].diagram.floats[0];assert.ok(fresh.x!==0 || fresh.y!==0);assert.equal(fresh.noSpread,true);
});

test('heading-only renames retain existing authored origins, including reordered renamed sections',()=>{
 const old={page:{blocks:[{heading:'Old',diagram:{nodes:{start:{}},rows:[[]],floats:[{id:'start',side:'below',x:0,y:0,noSpread:true}]}},{heading:'Other',diagram:{nodes:{b:{}},rows:[['b']]}}]}},next=plain(old);
 next.page.blocks[0].heading='Renamed';
 assert.equal(C.normalizeWorkbenchAgentPlacement(JSON.stringify(old),JSON.stringify(next)),JSON.stringify(next));
 next.page.blocks.reverse();assert.equal(C.normalizeWorkbenchAgentPlacement(JSON.stringify(old),JSON.stringify(next)),JSON.stringify(next));
 // With a semantic addition, exact content cannot match; the unclaimed same
 // ordinal still identifies a heading rename and preserves the authored origin.
 const edited=plain(old);edited.page.blocks[0].heading='Renamed';edited.page.blocks[0].diagram.nodes.added={};
 const output=JSON.parse(C.normalizeWorkbenchAgentPlacement(JSON.stringify(old),JSON.stringify(edited)));
 assert.deepEqual(output.page.blocks[0].diagram.floats.find(f=>f.id==='start'),old.page.blocks[0].diagram.floats[0]);
 assert.ok(output.page.blocks[0].diagram.floats.some(f=>f.id==='added' && (f.x || f.y)));
});

test('new diagram origin placeholders normalize independently of explicit nonzero siblings and row layouts',()=>{
 const before=JSON.stringify({page:{blocks:[]}});
 for(const rows of [[[]],[['row']]]){
 const d={nodes:{a:{},b:{}},rows,floats:[{id:'a',side:'below',x:0,y:0},{id:'b',side:'below',x:400,y:400,noSpread:true}],edges:[{from:'b',to:'a'}]};if(rows[0].length)d.nodes.row={};
 const next={page:{blocks:[{heading:'New',diagram:d}]}},source=C.normalizeWorkbenchAgentPlacement(before,JSON.stringify(next)),output=diagram(JSON.parse(source));
 assert.deepEqual(output.floats.find(f=>f.id==='b'),d.floats[1]);assert.deepEqual(center(C.layout(output).pos.b),{x:400,y:400});
 const placed=output.floats.find(f=>f.id==='a');assert.ok(placed.x!==0 || placed.y!==0);assert.equal(placed.noSpread,true);noCollision(output,['a']);
 assert.equal(C.normalizeWorkbenchAgentPlacement(before,source),source);
 }
 const explicit={page:{blocks:[{diagram:{nodes:{a:{},b:{}},rows:[[]],floats:[{id:'a',side:'below',x:50,y:50},{id:'b',side:'below',x:400,y:400}]}}]}};
 assert.equal(C.normalizeWorkbenchAgentPlacement(before,JSON.stringify(explicit)),JSON.stringify(explicit));
});
