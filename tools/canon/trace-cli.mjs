#!/usr/bin/env node
import {readFile,writeFile} from 'node:fs/promises';
import {referencePreview,approveReference,compareTrace} from './traces.mjs';
const args=process.argv.slice(2),command=args.shift(),flag=k=>{const i=args.indexOf('--'+k);return i<0?undefined:args[i+1];};
try{
  if(!['preview','reference','compare'].includes(command) || !flag('spec') || !flag('trace'))throw new Error('Usage: node tools/canon/trace-cli.mjs preview|reference|compare --spec flow.json --trace trace.json [--section 0] [--out result.json] [--reason "review reason"]');
  const spec=JSON.parse(await readFile(flag('spec'),'utf8')),trace=JSON.parse(await readFile(flag('trace'),'utf8')),section=Number(flag('section') || 0);
  let output;
  if(command==='preview')output=referencePreview(spec,trace,section);
  else if(command==='reference')output=approveReference(spec,trace,{section,reason:flag('reason'),actor:'CLI reviewer'});
  else{const result=compareTrace(spec,trace,{section,label:flag('label') || 'Incident trace'});output=result.spec;console.error(JSON.stringify({firstDivergence:result.firstDivergence,pathId:result.pathId,warnings:result.warnings,unmatched:result.mapping.unmatched}));}
  const json=JSON.stringify(output,null,2)+'\n';if(flag('out'))await writeFile(flag('out'),json);else process.stdout.write(json);
}catch(e){console.error(e.message);process.exitCode=1;}
