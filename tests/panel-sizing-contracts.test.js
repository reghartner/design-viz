'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const S=require('../tools/panel-placement/solver.cjs'),L=require('../tools/panel-placement/layouts.cjs'),C=require('../tools/panel-placement/corpus.cjs').engine();
const geometry={gridWidth:1230,scale:1,gridTop:320};
function source(types=['state','battery','homemap','deviceapp'],hidden=true){return {page:{title:'Synthetic fixture',sections:[{id:'arbitrary-case',diagram:{nodes:{n:{title:'Node'}},floats:[{id:'n',x:150,y:100}],steps:[{panels:{}}],panels:types.map((type,i)=>({id:'p'+i,type})),layouts:[{id:'test',sectionLayout:{columns:24,default:[{x:0,y:0,w:24,h:4,hidden},...types.map((type,i)=>({panel:'p'+i,x:0,y:4+i*4,w:24,h:4})),{controls:'steps',x:0,y:4+types.length*4,w:24,h:3}]}}]}}]}};}
function solve(spec,more={}){return S.solve(spec,{registry:C.PanelRegistry,geometry,...more});}
test('panel contracts stay opt-in and distinguish body aspect from title/padding chrome',()=>{
 for(const type of C.PanelRegistry.types()){const c=S.contract({type},C.PanelRegistry);assert.ok(c.minWidth>0&&c.minWidth<=c.preferredWidth&&c.preferredWidth<=c.maxWidth);}
 const c=S.contract({type:'deviceapp'},C.PanelRegistry),small=S.dimensions(c,6,50,{chrome:40,paddingX:32}),titled=S.dimensions(c,6,50,{chrome:80,paddingX:32});assert.equal(c.grow,0);assert.equal(c.bodyAspect,9/18.5);assert.equal(titled.h,small.h+1);assert.equal(titled.bodyHeight,small.bodyHeight);
 const home=S.contract({type:'homemap'},C.PanelRegistry);assert.equal(home.bodyAspect,320/216);assert.equal(C.panelCapability('homemap','canvasSizing',null).aspect,320/216);
});
test('dense content overrides compact status width; flexible row fill respects maxima and fixed bodies',()=>{
 const compact=S.contract({type:'checks'},C.PanelRegistry),dense=S.contract({type:'checks',checks:Array(12).fill({})},C.PanelRegistry);assert.ok(dense.minWidth>compact.minWidth);assert.ok(dense.preferredWidth>compact.preferredWidth);
 const fixed={w:6,c:{grow:0,maxWidth:1000},order:0},a={w:4,c:{grow:1,maxWidth:400},order:1},b={w:4,c:{grow:1,maxWidth:400},order:2};S.rowFill([fixed,a,b],24,50);assert.equal(fixed.w,6);assert.equal(a.w,8);assert.equal(b.w,8);
 const result=solve(source(['state','battery','signal']));const panels=L.layout(result.spec).filter(t=>t.panel);assert.equal(new Set(panels.map(t=>t.y)).size,1);assert.equal(panels.reduce((n,t)=>n+t.w,0),24);
});
test('generic solver is deterministic under case renaming and metadata key order; frozen state and attachment unchanged',()=>{
 const input=source(),before=JSON.stringify(input),first=solve(input),renamed=structuredClone(input);renamed.page.title='Different label';renamed.page.sections[0].id='completely-new-id';renamed.page.metadata={z:2,a:1};const second=solve(renamed);assert.deepEqual(L.layout(first.spec),L.layout(second.spec));assert.equal(JSON.stringify(input),before);assert.equal(L.semantic(first.spec),L.semantic(input));assert.deepEqual(solve(input),first);L.check(first.spec);
});
test('reports share usable rows; controls alternatives measure proximity and choose context-sensitive locations',()=>{
 const result=solve(source(['security','dispatch']),{measurements:{p0:{intrinsicHeight:500,chrome:50},p1:{intrinsicHeight:450,chrome:50}}});const panels=L.layout(result.spec).filter(t=>t.panel);assert.equal(panels[0].y,panels[1].y);assert.notEqual(panels[0].x,panels[1].x);assert.ok(panels.every(t=>t.w>=10));
 const short=solve(source(['state','battery']));assert.equal(short.metadata.policy,'under-primary');const tall=solve(source(['deviceapp','deviceapp']),{geometry:{...geometry,gridTop:650}});assert.equal(tall.metadata.policy,'above-primary');assert.ok(short.metadata.alternatives.some(a=>a.policy==='above-primary'));assert.ok(short.metadata.alternatives.some(a=>a.policy==='under-primary'));
 const patched=source(['state','deviceapp']);L.diagram(patched).steps[0].panels.p1={status:'changed'};const relevant=solve(patched,{snapshot:0});assert.equal(relevant.metadata.relevanceRule,'current-step panel patches');
});
test('fixed graph geometry and hidden tiles survive; infeasible geometry is explicit',()=>{
 const spec=source(['state'],false),before=structuredClone(L.diagram(spec).floats),result=solve(spec);L.check(result.spec);assert.deepEqual(L.diagram(result.spec).floats,before);const huge=source(['state'],false);L.diagram(huge).floats.push({id:'far',x:9000,y:9000});assert.throws(()=>solve(huge),/Unsupported/);
 const hidden=source();L.layout(hidden).find(t=>t.panel==='p0').hidden=true;const h=solve(hidden);assert.deepEqual(L.layout(h.spec).find(t=>t.panel==='p0'),L.layout(hidden).find(t=>t.panel==='p0'));
});
test('round-three output guard is dependency-free and never rewrites evidence',()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'synthetic-contract-guard-'));try{fs.writeFileSync(path.join(dir,'evidence'),'unchanged');const result=spawnSync(process.execPath,['tools/panel-placement/generate-round-three.mjs','--round-one','missing','--round-two','missing','--feedback-one','missing','--feedback-two','missing','--output',dir],{encoding:'utf8'});assert.notEqual(result.status,0);assert.match(result.stderr,/Output is populated/);assert.equal(fs.readFileSync(path.join(dir,'evidence'),'utf8'),'unchanged');}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('measured calibration terminates deterministically on stable geometry, cycles and unbounded growth',async()=>{
 const {calibrate}=require('../tools/panel-placement/calibrate.cjs'),spec=source(['state']);const initial={panels:[],controls:{},graph:null};let calls=0;
 const stable=await calibrate(spec,{initial,solve:()=>({spec,metadata:{}}),measure:async()=>{calls++;return initial;},validate:()=>{}});assert.equal(stable.calibration.iterations,2);assert.equal(calls,2);
 let n=0;await assert.rejects(calibrate(spec,{initial,solve:()=>{const c=structuredClone(spec);L.layout(c).find(t=>t.panel).h=3+(n++%2);return {spec:c,metadata:{}};},measure:async()=>initial,validate:()=>{}}),/oscillated/);assert.equal(n,3);
 n=0;await assert.rejects(calibrate(spec,{initial,maxIterations:4,solve:()=>{const c=structuredClone(spec);L.layout(c).find(t=>t.panel).h=3+n++;return {spec:c,metadata:{}};},measure:async()=>initial,validate:()=>{}}),/within 4 iterations/);assert.equal(n,4);
});
test('width-keyed intrinsic measurements avoid reusing wrapped content height from another width',()=>{
 const c={aspectPolicy:'content',rows:2},m={chrome:50,paddingX:30,intrinsicHeight:400,byWidth:{6:{chrome:50,paddingX:30,intrinsicHeight:400},12:{chrome:50,paddingX:30,intrinsicHeight:180}}};assert.equal(S.dimensions(c,6,50,m).h,12);assert.equal(S.dimensions(c,12,50,m).h,6);assert.equal(m.intrinsicHeight,400);
 const original=source(),reordered=structuredClone(original),d=L.diagram(reordered);reordered.page.sections[0].diagram=Object.fromEntries(Object.entries(d).reverse());assert.deepEqual(L.layout(solve(original).spec),L.layout(solve(reordered).spec));
});
