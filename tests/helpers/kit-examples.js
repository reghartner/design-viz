'use strict';
/* Example folders the offline folder-agent kit bundles, from the same discovery
   the build uses (tools/company_overlay.py): .agent-kit markers upstream, plus
   every company/examples folder. */
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const ROOT=path.join(__dirname,'../..');

function markedExamples(directory=path.join(ROOT,'examples'),out=[]){
  const entries=fs.readdirSync(directory,{withFileTypes:true});
  if(entries.some(entry=>entry.isFile()&&entry.name==='.agent-kit'))out.push(path.relative(ROOT,directory).split(path.sep).join('/'));
  for(const entry of entries)if(entry.isDirectory()&&entry.name!=='node_modules')markedExamples(path.join(directory,entry.name),out);
  return out;
}

function kitExamples(root=ROOT){
  return JSON.parse(execFileSync('python3',['-c','import json,sys;sys.path.insert(0,"tools");from company_overlay import kit_examples;print(json.dumps(kit_examples(".")))'],{cwd:root,encoding:'utf8'}));
}

module.exports={markedExamples,kitExamples};
