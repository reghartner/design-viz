#!/usr/bin/env node
import {readFile,writeFile,realpath} from 'node:fs/promises';
import path from 'node:path';
import C from './core.cjs';
import {resolveLocalImports} from './local-imports.mjs';
import {referencePreview,approveReference,compareTrace} from './traces.mjs';
const IMPORTS='--resolve-imports <repository folder or registry JSON>';
const args=process.argv.slice(2),command=args.shift(),flag=k=>{const i=args.indexOf('--'+k);return i<0?undefined:args[i+1];};
const declares=d=>!!d && typeof d==='object' && ['topologyImports','topologyExports'].some(k=>Object.prototype.hasOwnProperty.call(d,k));
const physical=file=>realpath(file).catch(()=>path.resolve(file));
try{
  if(!['preview','reference','compare'].includes(command) || !flag('spec') || !flag('trace'))throw new Error('Usage: node tools/canon/trace-cli.mjs preview|reference|compare --spec flow.json --trace trace.json ['+IMPORTS+'] [--section 0] [--out result.json] [--reason "review reason"]');
  const imports=flag('resolve-imports');let spec;
  if(args.includes('--resolve-imports')){
    if(!imports || imports.startsWith('--'))throw new Error('--resolve-imports requires a repository folder or registry JSON');
    // Imports resolve in memory; the output is the resolved copy, never the authored file.
    if(flag('out') && await physical(flag('out'))===await physical(flag('spec')))throw new Error('--out names the authored spec; write the resolved output to another file.');
    spec=(await resolveLocalImports(flag('spec'),imports)).resolved;
  }else{
    spec=JSON.parse(await readFile(flag('spec'),'utf8'));
    if(declares(spec) || C.sections(spec).some(s=>declares(s?.diagram)))throw new Error(flag('spec')+': unresolved topology declarations. To load providers, pass '+IMPORTS+'.');
  }
  const trace=JSON.parse(await readFile(flag('trace'),'utf8')),section=Number(flag('section') || 0);
  let output;
  if(command==='preview')output=referencePreview(spec,trace,section);
  else if(command==='reference')output=approveReference(spec,trace,{section,reason:flag('reason'),actor:'CLI reviewer'});
  else{const result=compareTrace(spec,trace,{section,label:flag('label') || 'Incident trace'});output=result.spec;console.error(JSON.stringify({firstDivergence:result.firstDivergence,pathId:result.pathId,warnings:result.warnings,unmatched:result.mapping.unmatched}));}
  const json=JSON.stringify(output,null,2)+'\n';if(flag('out'))await writeFile(flag('out'),json);else process.stdout.write(json);
}catch(e){console.error(e.message);process.exitCode=1;}
