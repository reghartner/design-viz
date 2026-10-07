'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const A=require('../tools/arrange-spec.cjs'),M=require('../tools/arrange/model.cjs'),S=require('../tools/arrange/solver.cjs');
const diagram=()=>({nodes:{a:{title:'A'}},rows:[[]],floats:[{id:'a',side:'below'}],edges:[],steps:[],panels:[]});
const defaults={width:1200,profile:'default',rearrange:false};
test('setup preserves packaged runtimes and rejects an incomplete source-free kit',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'arrange-setup-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const dir=path.join(root,'tools/arrange'),backend=path.join(root,'tools/canon/generated-runtime.cjs'),native=path.join(dir,'generated-native.html');fs.mkdirSync(dir,{recursive:true});fs.mkdirSync(path.dirname(backend),{recursive:true});
 const {preparePayloads}=require('../tools/arrange/setup.cjs');assert.throws(()=>preparePayloads(dir),/missing packaged runtimes/);
 fs.writeFileSync(backend,'packaged backend');assert.throws(()=>preparePayloads(dir),/missing packaged runtimes/);fs.writeFileSync(native,'packaged native');preparePayloads(dir);assert.equal(fs.readFileSync(backend,'utf8'),'packaged backend');assert.equal(fs.readFileSync(native,'utf8'),'packaged native');
});
test('complete CLI selects explicitly and protects authored geometry and profile boundaries',()=>{
 assert.equal(A.parseArgs(['--section','2','--width','1000','--profile','confluence','in','out']).width,1000);
 assert.throws(()=>A.parseArgs(['--width','640','in','out']),/800 to 1920/);
 const d=diagram();A.preflight(d,defaults);d.rows=[['a']];assert.throws(()=>A.preflight(d,defaults),/already has geometry/);A.preflight(d,{...defaults,rearrange:true});
 d.layouts=[{id:'main'}];assert.throws(()=>A.preflight(d,{...defaults,rearrange:true}),/named views/);delete d.layouts;
 d.sectionLayout={backstage:[{x:0,y:0,w:12,h:8}]};assert.throws(()=>A.preflight(d,{...defaults,rearrange:true}),/legacy 12-column sibling/);
 d.sectionLayout.columns=24;A.preflight(d,{...defaults,rearrange:true});
 assert.throws(()=>A.select({page:{sections:[{diagram:d},{diagram:diagram()}]}},[]),/Multiple diagrams/);
});
test('adapter creates rectangles without author input and preserves hidden tile geometry',()=>{
 const d=diagram();d.panels=[{id:'steps',type:'battery'},{id:'diagram',type:'battery'}];const hidden={panel:'steps',hidden:true,x:19,y:20,w:5,h:4};
 const seeded=A.seed(d,[hidden]);assert.deepEqual(seeded.sectionLayout.default.find(t=>t.panel==='steps'),hidden);assert.equal(seeded.sectionLayout.columns,24);assert.equal(d.sectionLayout,undefined);
});
test('every graph-arranger-owned marker requires explicit rearrangement',async t=>{
 const fields={diagram:['routing','graphFrame','sectionLayout'],float:['x','y','dx','dy','noSpread'],edge:['bend','curvePoints','curveControls','fromPort','toPort','fromDx','fromDy','toDx','toDy','labelDx','labelDy','labelAt']};
 for(const [kind,keys] of Object.entries(fields))for(const key of keys)await t.test(kind+'.'+key,()=>{
  const d=diagram();d.edges=[{from:'a',to:'a'}];const target=kind==='diagram'?d:kind==='float'?d.floats[0]:d.edges[0];
  target[key]=key==='routing'?'curves':key==='graphFrame'?{x:0,y:0,w:100,h:100}:key==='sectionLayout'?{}:key==='noSpread'?false:key==='fromPort'||key==='toPort'?{side:'right'}:key==='curvePoints'||key==='curveControls'?[]:0;
  const before=JSON.stringify(d);assert.throws(()=>A.preflight(d,defaults),/already has geometry/);A.preflight(d,{...defaults,rearrange:true});assert.equal(JSON.stringify(d),before);
 });
 const d=diagram();d.edges=[{from:'a',to:'a',id:'request',label:'Read state',color:'blue',dashed:true,delta:true}];d.nodes.a.subtitle='Semantic detail';A.preflight(d,defaults);
});
test('native solver handles panel IDs colliding with graph/controls, determinism and zero steps',()=>{
 const d=diagram();d.panels=[{id:'diagram',type:'battery'},{id:'steps',type:'battery'}];
 const source={diagram:A.seed(d,[])},options={registry:{get:()=>({layout:{sectionSizing:{minWidth:180,preferredWidth:210,maxWidth:300,aspectPolicy:'content',grow:1}}})},geometry:{gridWidth:1150,gridTop:100,scale:1,bounds:{x:0,y:0,w:180,h:80}}};
 const first=S.solve(source,options),second=S.solve(source,options);assert.deepEqual(first,second);M.check(first.spec);assert.equal(M.layout(first.spec).filter(t=>t.controls).length,0);assert.equal(M.layout(first.spec).filter(t=>t.panel).length,2);assert.deepEqual(first.spec.diagram.panels,d.panels);
});
test('failures are dependency-free and preserve source and existing destination',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'arrange-atomic-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const input=path.join(dir,'in.json'),output=path.join(dir,'out.json');
 const d=diagram();d.rows=[['a']];fs.writeFileSync(input,JSON.stringify({page:{title:'Test',sections:[{diagram:d}]}}));fs.writeFileSync(output,'retained');const before=fs.readFileSync(input,'utf8');
 const result=spawnSync(process.execPath,[path.resolve(__dirname,'../tools/arrange-spec.cjs'),input,output],{encoding:'utf8'});assert.notEqual(result.status,0);assert.match(result.stderr,/already has geometry/);assert.equal(fs.readFileSync(output,'utf8'),'retained');assert.equal(fs.readFileSync(input,'utf8'),before);
 const same=spawnSync(process.execPath,[path.resolve(__dirname,'../tools/arrange-spec.cjs'),input,input],{encoding:'utf8'});assert.notEqual(same.status,0);assert.match(same.stderr,/different|distinct/i);
 for(const marker of ['edge','float']){
  const routed=diagram();if(marker==='edge')routed.edges=[{from:'a',to:'a',fromPort:{side:'right'},curveControls:[{t:0,dx:0,dy:0},{t:1,dx:0,dy:0}]}];else routed.floats[0].dx=0;
  const bytes=JSON.stringify({page:{title:'Preserved',flowview:{authoredWith:'0.1.0',minVersion:'0.1.0',features:[]},sections:[{diagram:routed}]}});fs.writeFileSync(input,bytes);
  const rejected=spawnSync(process.execPath,[path.resolve(__dirname,'../tools/arrange-spec.cjs'),input,output],{encoding:'utf8'});assert.notEqual(rejected.status,0);assert.match(rejected.stderr,/already has geometry/);assert.equal(fs.readFileSync(input,'utf8'),bytes);assert.equal(fs.readFileSync(output,'utf8'),'retained');
 }
});
