'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const {arrangeGraph,arrangeDiagram,arrangeSpec}=require('../tools/arrange-experimental/index.cjs');
const quick={seed:71,restarts:1,iterations:1600};
const geometry=vm.createContext({});
vm.runInContext('function clamp(n,a,b){return Math.max(a,Math.min(b,n));}\n'+fs.readFileSync(path.join(__dirname,'../src/core/geometry.js'),'utf8'),geometry);
const diagram=(ids,edges)=>({nodes:Object.fromEntries(ids.map(id=>[id,{title:id,icon:'server'}])),rows:[ids],edges:edges.map(([from,to],i)=>({id:'edge-'+i,from,to}))});
function bare(result){const clone=structuredClone(result);for(const key of ['runtimeMs','placementMs','routingMs']){delete clone.metrics?.[key];clone.reports?.forEach(r=>delete r[key]);}return clone;}
function assertGeometry(d){
  const L=geometry.layout(d),ids=Object.keys(d.nodes);
  assert.equal(d.floats.length,ids.length);
  assert.equal(new Set(d.floats.map(f=>f.id)).size,ids.length);
  for(let i=0;i<ids.length;i++)for(let j=0;j<i;j++){
    const a=L.pos[ids[i]],b=L.pos[ids[j]];
    assert.ok(Math.abs(a.cx-b.cx)>=(a.w+b.w)/2+20||Math.abs(a.cy-b.cy)>=(a.h+b.h)/2+20,'Cards need a readable gap');
  }
  for(const e of d.edges){
    assert.ok(geometry.validCurveControls(e.curveControls));
    const segments=geometry.edgeCurveSegments(e,L);assert.ok(segments.length);
    // Independently sample the actual renderer's decoded cubic geometry. This
    // does not call the experimental router's sampler or collision function.
    for(const [a,b,c,z] of segments)for(let k=1;k<300;k++){
      const t=k/300,u=1-t,x=u*u*u*a.x+3*u*u*t*b.x+3*u*t*t*c.x+t*t*t*z.x,y=u*u*u*a.y+3*u*u*t*b.y+3*u*t*t*c.y+t*t*t*z.y;
      assert.ok(Number.isFinite(x)&&Number.isFinite(y));
      for(const id of ids){const n=L.pos[id];assert.ok(!(Math.abs(x-n.cx)<n.w/2-.1&&Math.abs(y-n.cy)<n.h/2-.1),`${e.from}->${e.to} enters ${id}`);}
      assert.ok(x>=d.graphFrame.x-1&&x<=d.graphFrame.x+d.graphFrame.w+1&&y>=d.graphFrame.y-1&&y<=d.graphFrame.y+d.graphFrame.h+1,'The declared frame contains the route');
    }
  }
}

test('arranges and routes a fork, reconvergence, skip link and feedback without mutating input',()=>{
  const d=diagram(['a','b','c','d','e','f'],[['a','b'],['b','c'],['b','d'],['c','e'],['d','e'],['e','f'],['a','e'],['e','b']]),copy=structuredClone(d);
  const result=arrangeDiagram(d,quick);assert.deepEqual(d,copy);assert.deepEqual(result.diagram.nodes,d.nodes);assert.equal(result.metrics.cardIntrusions,0);assertGeometry(result.diagram);
});

test('ignores previous authored geometry and node presentation',()=>{
  const d=diagram(['a','b','c','d'],[['a','b'],['b','c'],['c','d']]);
  const changed=structuredClone(d);changed.rows=[['d'],['c','b','a']];changed.floats=Object.keys(d.nodes).map((id,i)=>({id,x:5000-i*970,y:-2000+i*87}));changed.graphFrame={x:-9999,y:-9999,w:99999,h:99999};
  changed.edges.forEach(e=>Object.assign(e,{fromPort:{side:'left'},curvePoints:[{t:.5,dx:567,dy:-800}],bend:150,labelDx:700,labelDy:-100}));
  changed.nodes.a={title:'A totally different title',icon:'phone',tint:'data'};
  const a=arrangeDiagram(d,quick).diagram,b=arrangeDiagram(changed,quick).diagram;
  assert.deepEqual(a.floats,b.floats);assert.deepEqual(a.edges,b.edges);assert.deepEqual(a.graphFrame,b.graphFrame);
});

test('deterministic placement and routes survive node and edge serialization order',()=>{
  const d=diagram(['gamma','beta','alpha','delta','epsilon'],[['alpha','beta'],['alpha','gamma'],['beta','delta'],['gamma','delta'],['delta','epsilon']]);
  const a=arrangeDiagram(d,quick),b=arrangeDiagram({...d,nodes:Object.fromEntries(Object.entries(d.nodes).reverse()),edges:[...d.edges].reverse()},quick);
  assert.deepEqual(a.diagram.floats,b.diagram.floats);assert.deepEqual(a.diagram.edges,[...b.diagram.edges].reverse());
  assert.deepEqual(bare(a),bare(arrangeDiagram(d,quick)));
});

test('preserves edge identity, semantics, unknown metadata and unrelated page content',()=>{
  const d=diagram(['a','b'],[['a','b']]);d.edges[0]={...d.edges[0],kind:'http',label:'Approved',when:{step:2},delta:true,custom:{keep:['this']}};d.nodes.a.custom='keep';d.floats=[{id:'a',x:10,y:20,custom:'placement metadata'}];d.panels=[{id:'note',type:'text',body:'Keep this.'}];
  const input={version:7,page:{title:'Preserve',custom:{diagramText:'Prose'},blocks:[{type:'prose',body:'Unrelated'}, {id:'one',diagram:d},{id:'two',diagram:structuredClone(d)}]}};
  const copy=structuredClone(input),result=arrangeSpec(input,quick);
  assert.deepEqual(input,copy);assert.equal(result.reports.length,2);assert.equal(result.spec.version,7);assert.deepEqual(result.spec.page.blocks[0],input.page.blocks[0]);assert.deepEqual(result.spec.page.custom,input.page.custom);
  for(const block of result.spec.page.blocks.filter(b=>b.diagram)){
    const out=block.diagram;assert.deepEqual(out.panels,d.panels);assert.deepEqual(out.nodes,d.nodes);assert.equal(out.floats.find(f=>f.id==='a').custom,'placement metadata');
    for(const key of Object.keys(d.edges[0]))assert.deepEqual(out.edges[0][key],d.edges[0][key]);
  }
});

test('empty, singleton and disconnected diagrams retain all nodes',()=>{
  assert.deepEqual(arrangeDiagram({nodes:{},rows:[[]],edges:[]},quick).diagram.floats,[]);
  for(const d of [diagram(['a'],[]),diagram(['a','b','c','d','e'],[['a','b'],['c','d']])])assertGeometry(arrangeDiagram(d,quick).diagram);
});

test('self loops and parallel/reverse edges have finite, distinct, decodable geometry',()=>{
  const d=diagram(['a','b','c'],[['a','a'],['a','b'],['a','b'],['b','a'],['b','c'],['c','c']]);
  const out=arrangeDiagram(d,quick).diagram;assertGeometry(out);
  assert.notDeepEqual(out.edges[1].curveControls,out.edges[2].curveControls);assert.notDeepEqual(out.edges[1].fromPort,out.edges[2].fromPort);
});

test('dimension API separates mixed rectangular cards and ignores supplied coordinates',()=>{
  const input={nodes:[{id:'a',width:330,height:90,x:10000,y:-200},{id:'b',width:80,height:180},{id:'c',width:160,height:60},{id:'d',width:210,height:35}],edges:[{from:'a',to:'b'},{from:'b',to:'c'},{from:'b',to:'d'}]};
  const result=arrangeGraph(input,quick);assert.equal(result.metrics.cardIntrusions,0);
  for(let i=0;i<result.positions.length;i++)for(let j=0;j<i;j++){const a=result.positions[i],b=result.positions[j];assert.ok(Math.abs(a.x-b.x)>=(a.width+b.width)/2+20||Math.abs(a.y-b.y)>=(a.height+b.height)/2+20);}
  const changed=structuredClone(input);changed.nodes.forEach(n=>{n.x=0;n.y=0;});assert.deepEqual(result.positions,arrangeGraph(changed,quick).positions);
});

test('cycles and nonplanar topology produce complete valid native diagrams',()=>{
  const cycle=diagram(['a','b','c','d','e'],[['a','b'],['b','c'],['c','d'],['d','a'],['a','c'],['c','e']]);
  const bipartite=diagram(['a','b','c','d','e','f'],['a','b','c'].flatMap(a=>['d','e','f'].map(b=>[a,b])));
  for(const d of [cycle,bipartite])assertGeometry(arrangeDiagram(d,quick).diagram);
});

test('invalid topology, dimensions and options fail explicitly',()=>{
  const good={nodes:[{id:'a'}],edges:[]};
  for(const input of [null,{}, {nodes:[{id:'a'},{id:'a'}],edges:[]},{nodes:[{id:'a',width:NaN}],edges:[]},{nodes:[{id:'a',height:-3}],edges:[]},{...good,edges:[{from:'a',to:'missing'}]}])assert.throws(()=>arrangeGraph(input,quick));
  for(const options of [{seed:NaN},{restarts:0},{iterations:2.3},{aspectRatio:0},{columnGap:-1},{rowGap:Infinity}])assert.throws(()=>arrangeGraph(good,options));
  assert.throws(()=>arrangeSpec({page:{blocks:[]}},quick),/No diagrams/);
});

test('CLI writes a re-readable full spec and runtime report',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'arrange-experimental-'));
  try{
    const input=path.join(dir,'in.json'),output=path.join(dir,'out.json'),report=path.join(dir,'report.json'),raw={page:{blocks:[{id:'graph',diagram:diagram(['a','b'],[['a','b']])}]}};
    fs.writeFileSync(input,JSON.stringify(raw));execFileSync(process.execPath,[path.join(__dirname,'../tools/arrange-experimental/cli.cjs'),input,output,'--report',report,'--iterations','100','--restarts','1'],{stdio:'pipe'});
    const arranged=JSON.parse(fs.readFileSync(output)),reports=JSON.parse(fs.readFileSync(report));assert.equal(reports.length,1);assert.ok(reports[0].runtimeMs>=0);assert.equal(arranged.page.blocks[0].diagram.edges[0].id,'edge-0');assertGeometry(arranged.page.blocks[0].diagram);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('incremental search energy equals complete recomputation for moves and swaps',()=>{
  const {score,topology}=require('../tools/arrange-experimental/placement.cjs');
  const edges=[[0,1],[1,2],[2,3],[3,4],[4,5],[5,1],[2,6],[0,6],[6,4]],t=topology(7,edges),points=[{x:0,y:0},{x:1,y:1},{x:2,y:0},{x:2,y:2},{x:0,y:2},{x:1,y:3},{x:3,y:1}];
  for(let a=0;a<7;a++)for(let b=-1;b<7;b++){
    if(a===b)continue;
    const next=points.map(p=>({...p})),moved=b<0?[a]:[a,b];if(b<0)next[a]={x:4,y:4};else [next[a],next[b]]=[next[b],next[a]];
    const full=score(next,edges,t,1.45,226/132)-score(points,edges,t,1.45,226/132),incremental=score(next,edges,t,1.45,226/132,moved)-score(points,edges,t,1.45,226/132,moved);
    assert.ok(Math.abs(full-incremental)<1e-8,`Incremental mismatch for ${a},${b}`);
  }
});

test('visits native page sections and tabs while leaving embedded examples untouched',()=>{
  const d=diagram(['a','b'],[['a','b']]),metadata={example:{diagram:structuredClone(d)}};
  const input={page:{metadata,sections:[{heading:'Prose',metadata},{tabs:[{label:'First',sections:[{diagram:d},{heading:'Notes',metadata}]},{label:'Second',sections:[{diagram:structuredClone(d)}]}]}]}};
  const result=arrangeSpec(input,quick);
  assert.equal(result.reports.length,2);assert.deepEqual(result.spec.page.metadata,metadata);assert.deepEqual(result.spec.page.sections[0],input.page.sections[0]);assert.deepEqual(result.spec.page.sections[1].tabs[0].sections[1],input.page.sections[1].tabs[0].sections[1]);
  assert.equal(result.reports[0].path,'$.page.sections[1].tabs[0].sections[0].diagram');
  assert.equal(arrangeSpec(input.page,quick).reports.length,2);assert.equal(arrangeSpec(d,quick).reports.length,1);
});

// Each case snapshots existing bytes and verifies that rejection happens before
// either destination can be created or overwritten.
for(const scenario of [
  {name:'report equals input',report:'in.json'},
  {name:'report equals existing output',report:'out.json'},
  {name:'relative dot segments alias a new output',report:'nested/../out.json',newOutput:true},
  {name:'case variants of two new destinations',report:'OUT.json',newOutput:true},
  {name:'Unicode normalization variants of two new destinations',output:'caf\u00e9.json',report:'cafe\u0301.json',newOutput:true},
  {name:'input and output are the same file',output:'in.json',report:'report.json'},
  {name:'report symlink targets input',report:'alias.json',link:['in.json','alias.json','symbolic']},
  {name:'report symlink targets output',report:'alias.json',link:['out.json','alias.json','symbolic']},
  {name:'report hard link targets input',report:'alias.json',link:['in.json','alias.json','hard']},
  {name:'report hard link targets output',report:'alias.json',link:['out.json','alias.json','hard']},
  {name:'output hard link targets input',output:'alias.json',report:'report.json',link:['in.json','alias.json','hard']},
  {name:'directory symlink aliases two new destinations',output:'nested/new.json',report:'linked/new.json',newOutput:true,directoryLink:true},
  {name:'dangling leaf symlink aliases a new output',report:'alias.json',newOutput:true,link:['out.json','alias.json','symbolic']},
])test(`CLI rejects collision: ${scenario.name}`,()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'arrange-experimental-collision-'));
  try {
    fs.mkdirSync(path.join(dir,'nested'));
    fs.writeFileSync(path.join(dir,'in.json'),JSON.stringify(diagram(['a','b'],[['a','b']]))+'\n');
    if(!scenario.newOutput)fs.writeFileSync(path.join(dir,'out.json'),'An existing output must remain byte-for-byte intact.\n');
    if(scenario.directoryLink)fs.symlinkSync('nested',path.join(dir,'linked'),'dir');
    if(scenario.link){const [target,name,type]=scenario.link;if(type==='hard')fs.linkSync(path.join(dir,target),path.join(dir,name));else fs.symlinkSync(target,path.join(dir,name));}
    const output=scenario.output??'out.json',report=scenario.report,before=new Map();
    for(const file of ['in.json','out.json',output,report]){const absolute=path.resolve(dir,file);if(fs.existsSync(absolute))before.set(absolute,fs.readFileSync(absolute));}
    assert.throws(()=>execFileSync(process.execPath,[path.join(__dirname,'../tools/arrange-experimental/cli.cjs'),'in.json',output,'--report',report,'--iterations','1','--restarts','1'],{cwd:dir,stdio:'pipe'}),error=>{
      assert.equal(error.status,1);assert.match(error.stderr.toString(),/File path collision/);assert.equal(error.stdout.toString(),'');return true;
    });
    for(const [file,bytes] of before)assert.deepEqual(fs.readFileSync(file),bytes,`Modified ${file}`);
    for(const file of [output,report]){const absolute=path.resolve(dir,file);if(!before.has(absolute))assert.equal(fs.existsSync(absolute),false,`Created ${file}`);}
    if(scenario.link?.[2]==='symbolic')assert.equal(fs.readlinkSync(path.join(dir,scenario.link[1])),scenario.link[0]);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
