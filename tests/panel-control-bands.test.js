'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const S=require('../tools/panel-placement/solver-v2.cjs'),V1=require('../tools/panel-placement/solver.cjs'),R=require('../tools/panel-placement/round-four.cjs'),L=require('../tools/panel-placement/layouts.cjs'),corpus=require('../tools/panel-placement/corpus.cjs'),C=corpus.engine();
function fixture(types=['state','signal','deviceapp'],hidden=true){return {page:{title:'Abstract fixture',sections:[{id:'synthetic',diagram:{nodes:{n:{title:'Node'}},floats:[{id:'n',x:150,y:100}],steps:[{panels:{}}],panels:types.map((type,i)=>({id:'p'+i,type})),layouts:[{id:'view',sectionLayout:{columns:24,default:[{x:0,y:0,w:24,h:4,hidden},...types.map((t,i)=>({panel:'p'+i,x:0,y:4+i*4,w:24,h:4})),{controls:'steps',x:0,y:4+types.length*4,w:24,h:3}]}}]}}]}};}
const geometry={gridWidth:1000,scale:.8,gridTop:320};
function solve(source,extra={}){return S.solve(source,{registry:C.PanelRegistry,geometry,...extra});}
test('solid-edge metric distinguishes aligned tops from a ragged bottom',()=>{
 const content=[{x:0,y:3,w:8,h:3},{x:8,y:3,w:8,h:3},{x:16,y:3,w:8,h:6}];assert.equal(S.edgeMetrics(content,{x:0,y:0,w:24,h:3}).solidEdge,1);assert.equal(S.edgeMetrics(content,{x:0,y:9,w:24,h:3}).solidEdge,1/3);
 const result=solve(fixture(['state','gauge','battery']),{measurements:{p0:{intrinsicHeight:50,chrome:50},p1:{intrinsicHeight:50,chrome:50},p2:{intrinsicHeight:170,chrome:50}}});assert.equal(result.metadata.policy,'above-group');assert.equal(result.metadata.metrics.solidEdge,1);
});
test('long compositions have bounded central control bands and column cavities',()=>{
 const base=new Map([['a',{x:0,y:0,w:12,h:8}],['b',{x:12,y:0,w:12,h:16}],['c',{x:0,y:8,w:12,h:8}]]),bands=S.controlBands(base);assert.ok(bands.some(b=>b.kind==='interior-band'&&b.control.y===8));
 const long=solve(fixture(['table','table','table','table']),{measurements:Object.fromEntries([0,1,2,3].map(i=>['p'+i,{intrinsicHeight:420,chrome:50,text:'Detailed observations '.repeat(45)}]))});assert.ok(['interior-band','column-band'].includes(long.metadata.policy));assert.ok(long.metadata.metrics.areaAbove>0&&long.metadata.metrics.areaBelow>0);L.check(long.spec);
});
test('mixed-height packing avoids a deep empty cavity beside a tall report',()=>{
 const source=fixture(['deviceapp','state','gauge','budget','checks']);const result=solve(source,{measurements:{p1:{intrinsicHeight:60},p2:{intrinsicHeight:70},p3:{intrinsicHeight:100},p4:{intrinsicHeight:100}}});L.check(result.spec);const tiles=L.layout(result.spec).filter(t=>t.panel),tall=tiles.find(t=>t.panel==='p0');assert.ok(tiles.filter(t=>t!==tall).some(t=>t.y>tall.y&&t.y<tall.y+tall.h));assert.ok(result.metadata.metrics.unusedGridCells<160);
 const c=V1.contract({type:'deviceapp'},C.PanelRegistry);assert.equal(c.grow,0);assert.ok(tall.w*42-8<=c.maxWidth);
});
test('renaming and property order never affect geometry; identity, labels and hidden choices persist',()=>{
 const source=fixture(),copy=structuredClone(source);copy.page.title='Renamed';copy.page.sections[0].id='Another ID';copy.page.meta={z:1,a:2};const d=L.diagram(copy);copy.page.sections[0].diagram=Object.fromEntries(Object.entries(d).reverse());const a=solve(source),b=solve(copy);assert.deepEqual(L.layout(a.spec),L.layout(b.spec));assert.equal(L.semantic(a.spec),L.semantic(source));assert.deepEqual(solve(source),a);assert.equal(L.layout(a.spec)[0].hidden,true);
 const alternate=solve(source,{excludeLayout:L.stable(L.layout(a.spec))});L.checkPair(a.spec,alternate.spec);assert.ok(alternate.metadata.selectionRule.includes('excluding'));
});
test('fresh case coverage selection is deterministic and excludes judgments and holdouts',()=>{
 const all=corpus.scenarios(),judged=new Set(all.filter((x,i)=>x.split==='review'&&i%3===0).map(x=>x.id)),followups=all.filter(x=>judged.has(x.id)).slice(0,5);const a=R.rankFresh({pairs:all},judged,followups,'synthetic-seed'),b=R.rankFresh({pairs:[...all].reverse()},judged,followups,'synthetic-seed');assert.deepEqual(a,b);assert.ok(a.every(x=>x.split==='review'&&!judged.has(x.id)));assert.equal(new Set(a.map(x=>x.id)).size,a.length);
});
test('control wrap height is cached per width and includes native mode-selector chrome',async()=>{
 const {calibrate}=require('../tools/panel-placement/calibrate-v2.cjs');
 const source=fixture(['state']),seen=[];let calls=0;
 const observed=(overflow=0)=>({panels:[],controls:{overflowY:overflow,clippedButtons:!!overflow,neededHeight:150,neededHeightWithChrome:190}});
 const result=await calibrate(source,{initial:observed(),solve:(s,o,minimums)=>{seen.push(structuredClone(minimums));const spec=structuredClone(s),tile=L.layout(spec).find(t=>t.controls);tile.w=calls?24:10;tile.h=minimums.stepsByWidth?.[tile.w]||3;return {spec,metadata:{}};},measure:async()=>observed(calls++===0?40:0),validate:()=>{}});
 assert.equal(seen[1].stepsByWidth[10],5);assert.equal(seen[1].stepsByWidth[24],undefined);assert.equal(L.layout(result.spec).find(t=>t.controls).h,3);assert.equal(result.calibration.iterations,3);
});
test('round-four populated-output refusal does not require feedback or a browser',()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process'),out=fs.mkdtempSync(path.join(os.tmpdir(),'panel-four-guard-'));
 try{fs.writeFileSync(path.join(out,'keep.txt'),'immutable');const args=['tools/panel-placement/generate-round-four.mjs','--output',out];for(const k of ['round-one','round-two','round-three','feedback-one','feedback-two','feedback-three'])args.push('--'+k,'nonexistent');const child=spawnSync(process.execPath,args,{encoding:'utf8'});assert.notEqual(child.status,0);assert.match(child.stderr,/Output is populated/);assert.equal(fs.readFileSync(path.join(out,'keep.txt'),'utf8'),'immutable');}finally{fs.rmSync(out,{recursive:true,force:true});}
});
test('graph occupancy uses frozen node aspect instead of counting a wide sparse tile as full',()=>{
 const narrow={w:350,h:400},a=S.graphWaste(narrow,12,14,42,.85),b=S.graphWaste(narrow,24,14,42,.85);assert.ok(b.emptyGridCells>a.emptyGridCells+100);assert.ok(b.horizontalFraction>.5);assert.equal(a.labelEstimate,b.labelEstimate);
 const wide=S.graphWaste({w:900,h:130},24,7,42,.85);assert.ok(wide.horizontalFraction<.1);
});
test('explicit central-band experiments select only generic candidates without changing the default solver',()=>{
 const source=fixture(['table','checks','table']),measurements={p0:{intrinsicHeight:450},p1:{intrinsicHeight:160},p2:{intrinsicHeight:500}},normal=solve(source,{measurements});
 const experiment=solve(source,{measurements,controlPolicy:'interior-band'});assert.equal(experiment.metadata.policy,'interior-band');assert.ok(experiment.metadata.metrics.areaAbove>0&&experiment.metadata.metrics.areaBelow>0);assert.match(experiment.metadata.selectionRule,/explicit experiment/);assert.equal(L.semantic(experiment.spec),L.semantic(source));assert.deepEqual(solve(source,{measurements}),normal);L.check(experiment.spec);
});
