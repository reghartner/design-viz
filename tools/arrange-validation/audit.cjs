#!/usr/bin/env node
'use strict';
// Independent check of serialized output through the native cubic decoder.
// This never imports the arranger placement, sampler, or router.
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const native=vm.createContext({});
vm.runInContext('function clamp(n,a,b){return Math.max(a,Math.min(b,n));}\n'+fs.readFileSync(path.join(__dirname,'../../src/core/geometry.js'),'utf8'),native);
function auditDiagram(diagram){
  const layout=native.layout(diagram),ids=Object.keys(diagram.nodes),overlaps=[],intrusions=[],headerIntrusions=[],outsideFrame=[];
  const headers=Object.entries(layout.groups).map(([id,b])=>({id,x:b.x,y:b.y,w:b.w,h:20}));
  for(let i=0;i<ids.length;i++)for(let j=0;j<i;j++){
    const a=layout.pos[ids[i]],b=layout.pos[ids[j]];
    if(!a||!b)throw new Error('Unplaced node');
    if(Math.abs(a.cx-b.cx)<(a.w+b.w)/2&&Math.abs(a.cy-b.cy)<(a.h+b.h)/2)overlaps.push([ids[i],ids[j]]);
  }
  for(let i=0;i<(diagram.edges??[]).length;i++){
    const edge=diagram.edges[i];if(!native.validCurveControls(edge.curveControls))throw new Error('Invalid native curve controls');
    const hit=new Set(),headerHit=new Set();let outside=false;
    for(const [a,b,c,d] of native.edgeCurveSegments(edge,layout))for(let j=0;j<=500;j++){
      const t=j/500,u=1-t,x=u*u*u*a.x+3*u*u*t*b.x+3*u*t*t*c.x+t*t*t*d.x,y=u*u*u*a.y+3*u*u*t*b.y+3*u*t*t*c.y+t*t*t*d.y;
      if(!Number.isFinite(x)||!Number.isFinite(y))throw new Error('Nonfinite curve geometry');
      for(const id of ids){const p=layout.pos[id];if(Math.abs(x-p.cx)<p.w/2-.1&&Math.abs(y-p.cy)<p.h/2-.1)hit.add(id);}
      for(const h of headers)if(x>h.x+.1&&x<h.x+h.w-.1&&y>h.y+.1&&y<h.y+h.h-.1)headerHit.add(h.id);
      const f=diagram.graphFrame;if(f&&(x<f.x-.1||y<f.y-.1||x>f.x+f.w+.1||y>f.y+f.h+.1))outside=true;
    }
    if(hit.size)intrusions.push({edge:i,nodes:[...hit]});if(headerHit.size)headerIntrusions.push({edge:i,groups:[...headerHit]});if(outside)outsideFrame.push(i);
  }
  return {nodes:ids.length,edges:(diagram.edges??[]).length,overlaps,intrusions,headerIntrusions,outsideFrame};
}
function auditSpec(spec){const results=[];function walk(value){if(!value||typeof value!=='object')return;if(value.nodes&&Array.isArray(value.edges)){results.push(auditDiagram(value));return;}for(const child of Object.values(value))walk(child);}walk(spec);return results;}
function main(args){
  if(!args.length)throw new Error('Usage: node tools/arrange-validation/audit.cjs OUTPUT_DIRECTORY_OR_SPEC.json');
  const input=args[0],files=fs.statSync(input).isDirectory()?fs.readdirSync(input).filter(f=>f.endsWith('.spec.json')).sort().map(f=>path.join(input,f)):[input];
  const report=files.map(file=>({file,diagrams:auditSpec(JSON.parse(fs.readFileSync(file,'utf8')))}));
  console.log(JSON.stringify(report,null,2));
  if(report.some(r=>r.diagrams.some(d=>d.overlaps.length||d.intrusions.length||d.headerIntrusions.length||d.outsideFrame.length)))process.exitCode=1;
}
if(require.main===module){try{main(process.argv.slice(2));}catch(error){console.error(error.message);process.exitCode=1;}}
module.exports={auditDiagram,auditSpec};
