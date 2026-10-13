#!/usr/bin/env node
'use strict';
const fs=require('node:fs');
const core=require('./arrange/core.cjs');
const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
function hasTopologyDeclarations(raw){
  if(!raw || typeof raw!=='object' || Array.isArray(raw))return false;
  if(own(raw,'topologyImports') || own(raw,'topologyExports'))return true;
  return core.sections(raw).some(section=>{
    const diagram=section.diagram;
    return diagram && typeof diagram==='object' && (own(diagram,'topologyImports') || own(diagram,'topologyExports'));
  });
}
function check(raw,expectations,providers){
  if(providers==null)providers=[];
  if(!Array.isArray(providers))throw new Error('Topology providers must be an array of specs.');
  const resolved=(providers.length || hasTopologyDeclarations(raw))?core.materializeTopology([raw,...providers])[0]:raw;
  return core.viewerRouting().visibilityEvidence(resolved,expectations);
}
module.exports={check};
if(require.main===module){
  const args=process.argv.slice(2);
  if(args.length<2 || args.includes('--help')){
    process.stderr.write('Usage: node tools/visibility-check.cjs SPEC.json EXPECTATIONS.json [PROVIDER.json ...]\nSee docs/visibility-evidence.md. Checks eligibility, not rendered pixels.\n');process.exitCode=args.includes('--help')?0:2;
  }else try{
    const raw=JSON.parse(fs.readFileSync(args[0],'utf8'));
    const expectations=JSON.parse(fs.readFileSync(args[1],'utf8'));
    const providers=args.slice(2).map(file=>JSON.parse(fs.readFileSync(file,'utf8')));
    const report=check(raw,expectations,providers);
    process.stdout.write(JSON.stringify(report,null,2)+'\n');process.exitCode=report.ok?0:1;
  }catch(error){process.stderr.write('visibility-check: '+error.message+'\n');process.exitCode=2;}
}
