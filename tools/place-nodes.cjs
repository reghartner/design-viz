#!/usr/bin/env node
'use strict';
/* The portable agent kit contains the same pure planner as the desktop. */
const fs=require('node:fs'),path=require('node:path');
function runtime(){
  const packaged=path.join(__dirname,'placement-runtime.cjs');
  if(fs.existsSync(packaged))return require(packaged);
  const {moduleSource}=require('./source-loader.cjs'),Module=require('node:module');
  const loaded=new Module(__filename);loaded.filename=__filename;loaded.paths=module.paths;
  loaded._compile(moduleSource('placement','cjs'),__filename);return loaded.exports;
}
const usage='Usage: node tools/place-nodes.cjs --section 0 --node ID [--node ID] [--context topology.json] input.json output.json\nUse a different output file that does not exist. Imported nodes require an approved frozen topology context.\n';
function main(args){
  if(args.length===1 && (args[0]==='--help' || args[0]==='-h')){process.stdout.write(usage);return;}
  const ids=[],files=[];let section=0,context;
  for(let i=0;i<args.length;i++){
    if(args[i]==='--node')ids.push(args[++i]);
    else if(args[i]==='--section')section=Number(args[++i]);
    else if(args[i]==='--context')context=JSON.parse(fs.readFileSync(args[++i],'utf8'));
    else if(args[i].startsWith('--'))throw Error('Unknown option: '+args[i]);
    else files.push(args[i]);
  }
  if(files.length!==2 || !ids.length || ids.some(id=>!id) || !Number.isInteger(section) || section<0)
    throw Error(usage.trim());
  if(path.resolve(files[0])===path.resolve(files[1]))throw Error('Use different input and output files.');
  const source=fs.readFileSync(files[0],'utf8'),raw=JSON.parse(source);
  const result=runtime().planPlaceOptimally(source,raw,ids.map(id=>({kind:'node',section,id})),context);
  if(result.error)throw Error(result.error);
  fs.writeFileSync(files[1],result.text || source,{flag:'wx'});
  process.stdout.write(result.noop?'Selected nodes are locked or already placed.\n':'Placed selected nodes; existing routes and panel layouts retained.\n');
}
if(require.main===module)try{main(process.argv.slice(2));}catch(error){process.stderr.write(error.message+'\n');process.exitCode=1;}
module.exports={runtime,main};
