'use strict';
// Run from any directory: node examples/auto-arrange-large-baselines/generate.cjs
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const root=path.resolve(__dirname,'../..'),{entrypoint}=require(path.join(root,'tools/source-loader.cjs'));
const Viz=require(path.join(root,'src/workbench/vendor/viz-3.31.0.js'));
const cola=require(path.join(root,'src/workbench/vendor/webcola-3.4.0.js'));
const C={URL};vm.runInNewContext(entrypoint('workbench').body,C);
const expectedCounts=[24,32,40,48],expectedEdges=[33,48,50,60];
const edgeGeometryKeys=new Set(['bend','curvePoints','curveControls','fromPort','toPort','fromDx','fromDy','toDx','toDy','labelDx','labelDy','labelAt']);
function plain(value){return JSON.parse(JSON.stringify(value));}
function endpoints(edges){return Array.from(edges,({from,to})=>({from,to}));}
function assertNeutralInput(diagram){
  assert.equal(diagram.groups,undefined);assert.equal(diagram.floats,undefined);assert.equal(diagram.routing,undefined);
  assert.equal(diagram.rows.length,1);assert.deepEqual(diagram.rows[0],Object.keys(diagram.nodes));
  for(const edge of diagram.edges)for(const key of edgeGeometryKeys)assert.equal(edge[key],undefined,`input edge ${edge.from} -> ${edge.to} has ${key}`);
}
function assertK33(diagram){
  const left=['us-ingress','eu-ingress','apac-ingress'],right=['tax-engine','fx-engine','fraud-engine'];
  const keys=new Set(diagram.edges.map(edge=>`${edge.from}->${edge.to}`));
  for(const from of left)for(const to of right)assert(keys.has(`${from}->${to}`),`missing K3,3 edge ${from} -> ${to}`);
}
(async()=>{
  const viz=await Viz.instance(),input=JSON.parse(fs.readFileSync(path.join(__dirname,'graph-input.spec.json'),'utf8'));
  const output=plain(input),metrics=[];
  assert.deepEqual(Array.from(C.validate(C.normalize(input)).errors),[]);
  assert.equal(output.page.blocks.length,expectedCounts.length);
  for(let index=0;index<output.page.blocks.length;index++){
    const block=output.page.blocks[index],diagram=block.diagram,count=Object.keys(diagram.nodes).length;
    assert.equal(count,expectedCounts[index]);assert.equal(diagram.edges.length,expectedEdges[index]);assertNeutralInput(diagram);
    const tints=new Set(Object.values(diagram.nodes).map(node=>node.tint));
    assert(tints.size>=4 && tints.size<=5,`${block.id} should use four or five role tints`);
    for(const node of Object.values(diagram.nodes))assert.equal(node.group,undefined);
    if(block.id==='regional-billing')assertK33(diagram);
    const beforeNodes=Object.keys(diagram.nodes),beforeEdges=endpoints(diagram.edges),started=performance.now();
    const result=C.autoArrangeCandidates(diagram,viz,cola),elapsedMs=performance.now()-started;
    assert(elapsedMs<20000,`${block.id} exceeded the 20s worker deadline: ${Math.round(elapsedMs)}ms`);
    assert.equal(result.score.overlaps,0,`${block.id} has overlapping cards`);
    assert.equal(result.score.hits,0,`${block.id} has routes through unrelated cards`);
    block.diagram=C.autoArrangeDiagram(diagram,result);
    assert.deepEqual(Object.keys(block.diagram.nodes),beforeNodes);assert.deepEqual(endpoints(block.diagram.edges),beforeEdges);
    assert.equal(block.diagram.rows.length,1);assert.equal(block.diagram.rows[0].length,0);
    assert.equal(block.diagram.floats.length,count);
    for(const edge of block.diagram.edges){assert.equal(edge.fromPort,undefined);assert.equal(edge.toPort,undefined);}
    metrics.push({section:block.id,nodes:count,edges:diagram.edges.length,elapsedMs:Math.round(elapsedMs),...plain(result.score)});
  }
  assert.deepEqual(Array.from(C.validate(C.normalize(output)).errors),[]);
  fs.writeFileSync(path.join(__dirname,'auto-arranged.spec.json'),JSON.stringify(output,null,2)+'\n');
  console.table(metrics.map(metric=>({section:metric.section,nodes:metric.nodes,edges:metric.edges,ms:metric.elapsedMs,crossings:metric.crossings,incident:metric.incidentCrossings,overlaps:metric.overlaps,hits:metric.hits,width:Math.round(metric.width),height:Math.round(metric.height),aspect:metric.aspect.toFixed(2)})));
})().catch(error=>{console.error(error);process.exitCode=1;});
