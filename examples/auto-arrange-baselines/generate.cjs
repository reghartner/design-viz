'use strict';
// Run from any directory: node examples/auto-arrange-baselines/generate.cjs
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),{entrypoint}=require(path.join(root,'tools/source-loader.cjs'));
const Viz=require(path.join(root,'src/workbench/vendor/viz-3.31.0.js'));
const cola=require(path.join(root,'src/workbench/vendor/webcola-3.4.0.js'));
const C={URL};vm.runInNewContext(entrypoint('workbench').body,C);
(async()=>{
  const viz=await Viz.instance(),input=JSON.parse(fs.readFileSync(path.join(__dirname,'graph-input.spec.json'),'utf8'));
  const output=JSON.parse(JSON.stringify(input)),metrics=[];
  for(const block of output.page.blocks){
    const d=block.diagram,result=C.autoArrangeCandidates(d,viz,cola);
    assert.equal(result.score.overlaps,0);assert.equal(result.score.hits,0);
    block.diagram=C.autoArrangeDiagram(d,result);
    metrics.push({section:block.id,nodes:Object.keys(d.nodes).length,edges:d.edges.length,...result.score});
  }
  for(const spec of [input,output])assert.deepEqual(Array.from(C.validate(C.normalize(spec)).errors),[]);
  fs.writeFileSync(path.join(__dirname,'auto-arranged.spec.json'),JSON.stringify(output,null,2)+'\n');
  console.table(metrics.map(m=>({section:m.section,nodes:m.nodes,edges:m.edges,crossings:m.crossings,overlaps:m.overlaps,hits:m.hits,width:Math.round(m.width),height:Math.round(m.height),aspect:m.aspect.toFixed(2)})));
})().catch(error=>{console.error(error);process.exitCode=1;});
