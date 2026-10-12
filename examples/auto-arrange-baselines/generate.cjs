'use strict';
// Run from any directory: node examples/auto-arrange-baselines/generate.cjs
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),{entrypoint}=require(path.join(root,'tools/source-loader.cjs'));
const C={URL};vm.runInNewContext(entrypoint('workbench').body,C);
Object.assign(C,require(path.join(root,'tools/arrange/core.cjs')));
(async()=>{
  const input=JSON.parse(fs.readFileSync(path.join(__dirname,'graph-input.spec.json'),'utf8'));
  const output=JSON.parse(JSON.stringify(input)),metrics=[];
  for(const block of output.page.blocks){
    const d=block.diagram,result=C.autoArrangeCandidates(d);
    assert.equal(result.metrics.cardIntrusions,0);assert.equal(result.metrics.cardIntrusions,0);
    block.diagram=C.autoArrangeDiagram(d,result);
    metrics.push({section:block.id,nodes:Object.keys(d.nodes).length,edges:d.edges.length,...result.metrics,width:result.frame.w,height:result.frame.h,aspect:result.frame.w/result.frame.h});
  }
  for(const spec of [input,output])assert.deepEqual(Array.from(C.validate(C.normalize(spec)).errors),[]);
  fs.writeFileSync(path.join(__dirname,'auto-arranged.spec.json'),JSON.stringify(output,null,2)+'\n');
  console.table(metrics.map(m=>({section:m.section,nodes:m.nodes,edges:m.edges,crossings:m.crossings,cardHits:m.cardIntrusions,width:Math.round(m.width),height:Math.round(m.height),aspect:m.aspect.toFixed(2)})));
})().catch(error=>{console.error(error);process.exitCode=1;});
