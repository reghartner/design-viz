#!/usr/bin/env node
'use strict';

/* Write an anonymous snapshot of the production node and edge geometry. The
   source document is read only and never copied into the output object. */
const fs=require('node:fs');
const path=require('node:path');

const USAGE='usage: node tools/export-layout.cjs input.spec.json output.layout.json';

function parseArgs(args){
  if(args.includes('--help'))return {help:true};
  if(args.length!==2 || args.some(function(arg){return arg.startsWith('--');}))throw new Error(USAGE);
  return {input:args[0],output:args[1]};
}

function canonicalTarget(file){
  const absolute=path.resolve(file);
  if(fs.existsSync(absolute))return fs.realpathSync(absolute);
  return path.join(fs.realpathSync(path.dirname(absolute)),path.basename(absolute));
}

function distinctPaths(input,output){
  const source=fs.realpathSync(input),target=canonicalTarget(output);
  if(source===target)throw new Error('Input and output must be different files.');
  if(fs.existsSync(target)){
    const a=fs.statSync(source),b=fs.statSync(target);
    if(a.dev===b.dev && a.ino===b.ino)throw new Error('Input and output must be different files.');
  }
  return {source,target};
}

function atomicWrite(file,text){
  const directory=path.dirname(file),base=path.basename(file);
  const temporary=path.join(directory,'.'+base+'.layout-export-'+process.pid+'-'+Date.now());
  let created=false;
  try{
    fs.writeFileSync(temporary,text,{encoding:'utf8',flag:'wx',mode:0o600});created=true;
    fs.renameSync(temporary,file);created=false;
  }finally{if(created)try{fs.unlinkSync(temporary);}catch(ignored){}}
}

function loadCore(){
  try{return require('./canon/core.cjs');}
  catch(error){
    if(error && error.code==='MODULE_NOT_FOUND' && String(error.message).includes('generated-runtime.cjs'))
      throw new Error('Missing generated backend runtime; run python3 tools/build.py --runtime-only.');
    throw error;
  }
}

function readJson(file){
  let source;
  try{source=fs.readFileSync(file,'utf8');}
  catch(ignored){throw new Error('Unable to read the input file.');}
  try{return JSON.parse(source);}
  catch(ignored){throw new Error('Input is not valid JSON.');}
}

function main(args){
  const options=parseArgs(args);
  if(options.help){process.stdout.write(USAGE+'\n\nExports only anonymous node bounds, edge topology, and SVG path geometry.\n');return;}
  let files;
  try{files=distinctPaths(options.input,options.output);}
  catch(error){
    if(error && error.message==='Input and output must be different files.')throw error;
    throw new Error('Unable to resolve the input or output path.');
  }
  const raw=readJson(files.source),result=loadCore().exportAnonymousLayout(raw);
  try{atomicWrite(files.target,JSON.stringify(result,null,2)+'\n');}
  catch(ignored){throw new Error('Unable to write the output file.');}
  const nodes=result.diagrams.reduce(function(total,d){return total+d.nodes.length;},0);
  const edges=result.diagrams.reduce(function(total,d){return total+d.edges.length;},0);
  process.stdout.write('Exported '+result.diagrams.length+' diagram'+(result.diagrams.length===1?'':'s')+', '+nodes+' nodes, and '+edges+' edges.\n');
}

module.exports={parseArgs,canonicalTarget,distinctPaths,atomicWrite,readJson,main};
if(require.main===module){
  try{main(process.argv.slice(2));}
  catch(error){process.stderr.write((error && error.message || 'Layout export failed.')+'\n');process.exitCode=1;}
}
