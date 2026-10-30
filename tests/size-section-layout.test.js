'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const Z=require('../tools/size-section-layout.cjs'),core=require('../tools/arrange/core.cjs'),P=require('../tools/arrange/packing.cjs'),E=require('../tools/arrange/estimate.cjs');
const S=core.containerSize,grid=S.grid(1200);
const diagram=(steps=3,text='Short step.')=>({
 nodes:{a:{title:'A'},b:{title:'B'},c:{title:'C'}},rows:[['a','b','c']],edges:[{from:'a',to:'b'},{from:'b',to:'c'}],
 steps:Array.from({length:steps},(_,i)=>({id:'s'+i,nodes:[i%2?'b':'a'],edge:i%2?'b->c':'a->b',text}))});
const page=d=>({page:{title:'Sizing',sections:[{diagram:d}]}});
test('a longest path of four steps or fewer puts step controls in a left column beside the diagram',()=>{
 const r=Z.sizeSection(diagram(4),grid),[controls,graph]=r.sectionLayout.default;
 assert.equal(r.arrangement,'side-by-side');
 assert.deepEqual([controls.controls,controls.x,controls.y,controls.w],['steps',0,0,7]);
 assert.deepEqual([graph.x,graph.y,graph.w],[7,0,17]);
 assert.equal(controls.h,graph.h);assert.ok(graph.h>=r.controls.rows&&graph.h>=r.diagram.rows);
});
test('a longer path stacks a full-width diagram above full-width step controls',()=>{
 const r=Z.sizeSection(diagram(5),grid),[graph,controls]=r.sectionLayout.default;
 assert.equal(r.arrangement,'stacked');assert.match(r.reason,/5 steps/);
 assert.deepEqual([graph.x,graph.y,graph.w,graph.h],[0,0,24,r.diagram.rows]);
 assert.deepEqual([controls.controls,controls.y,controls.w,controls.h],['steps',graph.h,24,r.controls.rows]);
});
test('step controls grow with their longest caption and the diagram with its drawing height',()=>{
 const short=S.stepControls(diagram(3),300),long=S.stepControls(diagram(3,'Detailed step narrative. '.repeat(30)),300);
 assert.ok(long.rows>short.rows&&long.maxLines>short.maxLines);
 const flat=S.diagram(null,700,1,{x:0,y:0,w:1000,h:200}),tall=S.diagram(null,700,1,{x:0,y:0,w:1000,h:800});
 assert.ok(tall.rows>flat.rows);assert.equal(flat.labelPx,tall.labelPx);
 assert.ok(S.diagram(null,700,1,{x:0,y:0,w:2000,h:200}).labelPx<flat.labelPx);
});
test('the composer reads the same step-control and diagram sizes',()=>{
 const d=diagram(4,'Wrapped caption text. '.repeat(8)),bounds={x:0,y:0,w:1180,h:300};
 assert.deepEqual(E.controlDepth(d,E.states(d),400),S.stepControls(d,400));
 assert.equal(P.graphHeight(bounds,17,grid.pitch),S.diagram(null,17*grid.pitch-8,1,bounds).rows);
 assert.equal(P.graphWaste(bounds,17,0,grid.pitch,1).labelEstimate,S.diagram(null,17*grid.pitch-8,1,bounds).labelPx);
});
test('sections the helper does not own are reported, not rewritten',()=>{
 const withPanel={...diagram(),panels:[{id:'p',type:'state'}]};
 assert.match(Z.sizeSection(withPanel,grid).skipped,/compose-page-layout/);
 assert.match(Z.sizeSection({...diagram(),layouts:[{id:'v'}]},grid).skipped,/named views/);
 assert.match(Z.sizeSection({...diagram(),steps:[]},grid).skipped,/no steps/);
});
test('--write saves a valid sized copy and leaves the input unchanged',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'size-layout-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const input=path.join(dir,'in.json'),output=path.join(dir,'out.json'),bytes=JSON.stringify(page(diagram(3)));fs.writeFileSync(input,bytes);
 const run=spawnSync(process.execPath,[path.resolve(__dirname,'../tools/size-section-layout.cjs'),'--write',output,input],{encoding:'utf8'});
 assert.equal(run.status,0,run.stderr);assert.equal(fs.readFileSync(input,'utf8'),bytes);
 const sized=JSON.parse(fs.readFileSync(output,'utf8'));assert.deepEqual(core.validateSpec(sized).errors,[]);
 assert.deepEqual(sized.page.sections[0].diagram.sectionLayout,JSON.parse(run.stdout).sections[0].sectionLayout);
 const same=spawnSync(process.execPath,[path.resolve(__dirname,'../tools/size-section-layout.cjs'),'--write',input,input],{encoding:'utf8'});
 assert.notEqual(same.status,0);assert.match(same.stderr,/different files/);assert.equal(fs.readFileSync(input,'utf8'),bytes);
});
