#!/usr/bin/env node
'use strict';
/* Explicit offline conversion; the reader never writes source. */
const fs=require('node:fs'),core=require('./canon/core.cjs');
function migrate(input,options={}){
  const routing=core.viewerRouting(),providers=options.providers || [];
  function validate(raw){const resolved=providers.length?core.materializeTopology(JSON.parse(JSON.stringify([raw,...providers])))[0]:raw;const result=core.validateSpec(resolved);if(result.errors.length)throw new Error('Invalid spec: '+result.errors.join('; '));return result;}
  validate(input);
  const metadataIssues=core.compatibility.metadataWarnings(input);
  if(metadataIssues.length)throw new Error('Invalid compatibility metadata: '+metadataIssues.join('; '));
  const result=routing.migrateSectionViews(input),stamped=core.compatibility.stamp(result.spec);
  if(JSON.stringify(stamped)!==JSON.stringify(result.spec)){
    result.report.changed=true;
    result.report.changes.push('Refreshed compatibility metadata for the converted document.');
  }
  result.spec=stamped;validate(result.spec);
  return result;
}
function main(args){
  let file,output,check=false,providers=[];
  for(let i=0;i<args.length;i++){
    if(args[i]==='--output')output=args[++i];else if(args[i]==='--check' || args[i]==='--dry-run')check=true;else if(args[i]==='--provider')providers.push(args[++i]);
    else if(args[i].startsWith('-') || file)throw new Error('Usage: migrate-section-views.cjs INPUT (--check | --output NEW) [--provider SPEC]');else file=args[i];
  }
  if(!file || check===!!output || providers.some(p=>!p))throw new Error('Provide INPUT and exactly one of --check or --output NEW.');
  const read=file=>{if(fs.statSync(file).size>16*1024*1024)throw new Error(file+' exceeds 16 MiB');return JSON.parse(fs.readFileSync(file,'utf8'));};
  const result=migrate(read(file),{providers:providers.map(read)});
  if(output)fs.writeFileSync(output,JSON.stringify(result.spec,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify(result.report,null,2));
}
module.exports={migrate};
if(require.main===module){try{main(process.argv.slice(2));}catch(error){console.error(error.message);process.exitCode=1;}}
