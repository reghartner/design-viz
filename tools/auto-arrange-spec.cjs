#!/usr/bin/env node
'use strict';

/* Apply the production Workbench arranger without opening a browser. The
   input is never modified; every diagram is arranged in memory before one
   atomic output write. */
const fs=require('node:fs');
const path=require('node:path');
const core=require('./arrange/core.cjs');

function vendor(name){
  const bundled=path.join(__dirname,'auto-arrange','vendor',name);
  const checkout=path.join(__dirname,'../src/workbench/vendor',name);
  return require(fs.existsSync(bundled)?bundled:checkout);
}

function diagramRecords(raw){
  if(raw && raw.nodes && Array.isArray(raw.rows))return [{diagram:raw,path:'diagram',section:0}];
  const page=raw && raw.page || raw;
  if(!page || typeof page!=='object')return [];
  const key=Array.isArray(page.blocks)?'blocks':Array.isArray(page.sections)?'sections':null;
  if(!key)return [];
  const records=[];let section=0;
  page[key].forEach(function(block,blockIndex){
    if(block && Array.isArray(block.tabs)){
      block.tabs.forEach(function(tab,tabIndex){
        (tab && Array.isArray(tab.sections)?tab.sections:[]).forEach(function(item,sectionIndex){
          if(item && item.diagram)records.push({diagram:item.diagram,path:key+'['+blockIndex+'].tabs['+tabIndex+'].sections['+sectionIndex+'].diagram',section:section});
          section++;
        });
      });
    }else{
      if(block && block.diagram)records.push({diagram:block.diagram,path:key+'['+blockIndex+'].diagram',section:section});
      section++;
    }
  });
  return records;
}

function assertValid(raw,label){
  const verdict=core.validateSpec(raw);
  if(verdict.errors.length)throw new Error(label+' is invalid:\n'+verdict.errors.map(function(message){return '- '+message;}).join('\n'));
}

async function arrangeSpec(raw,sectionIds){
  assertValid(raw,'Input spec');
  const output=JSON.parse(JSON.stringify(raw)),available=diagramRecords(output);
  if(!available.length)throw new Error('Input spec has no diagrams to arrange.');
  let records;
  if(sectionIds==='all')records=available;
  else if(Array.isArray(sectionIds) && sectionIds.length){
    records=sectionIds.map(function(id){
      const record=available.find(function(candidate){return candidate.section===id;});
      if(!record)throw new Error('Section '+id+' does not contain a diagram.');
      return record;
    });
  }else if(available.length===1)records=available;
  else throw new Error('Input has multiple diagrams; pass --section INDEX for each new diagram, or --all only when every diagram is new.');
  const Viz=vendor('viz-3.31.0.js'),cola=vendor('webcola-3.4.0.js'),viz=await Viz.instance();
  for(const record of records){
    try{
      const result=core.autoArrangeCandidates(record.diagram,viz,cola);
      const arranged=core.autoArrangeDiagram(record.diagram,result);
      Object.keys(record.diagram).forEach(function(key){delete record.diagram[key];});
      Object.assign(record.diagram,arranged);
    }catch(error){throw new Error(record.path+': '+error.message);}
  }
  assertValid(output,'Arranged spec');
  return {raw:output,count:records.length};
}

function parseArgs(args){
  const sections=[],files=[];let all=false;
  for(let i=0;i<args.length;i++){
    if(args[i]==='--all'){all=true;continue;}
    if(args[i]==='--section'){
      const value=args[++i];
      if(value==null || !/^\d+$/.test(value))throw new Error('--section requires a zero-based section index.');
      sections.push(Number(value));continue;
    }
    if(args[i].startsWith('--'))throw new Error('Unknown option: '+args[i]);
    files.push(args[i]);
  }
  if(files.length!==2 || all && sections.length || new Set(sections).size!==sections.length)
    throw new Error('usage: node tools/auto-arrange-spec.cjs [--section INDEX ... | --all] input.spec.json output.spec.json');
  return {input:files[0],output:files[1],sections:all?'all':sections};
}

function canonicalTarget(file){
  const absolute=path.resolve(file);
  if(fs.existsSync(absolute))return fs.realpathSync(absolute);
  return path.join(fs.realpathSync(path.dirname(absolute)),path.basename(absolute));
}

function distinctPaths(input,output){
  const source=fs.realpathSync(input),target=canonicalTarget(output);
  if(source===target)throw new Error('Input and output must be different files.');
  if(fs.existsSync(output)){
    const a=fs.statSync(source),b=fs.statSync(output);
    if(a.dev===b.dev && a.ino===b.ino)throw new Error('Input and output must be different files.');
  }
  return {source,target};
}

function atomicWrite(file,text){
  const directory=path.dirname(file),base=path.basename(file);
  const temporary=path.join(directory,'.'+base+'.auto-arrange-'+process.pid+'-'+Date.now());
  let created=false;
  try{
    fs.writeFileSync(temporary,text,{encoding:'utf8',flag:'wx',mode:0o600});created=true;
    fs.renameSync(temporary,file);created=false;
  }finally{if(created)try{fs.unlinkSync(temporary);}catch(ignored){}}
}

async function main(args){
  const options=parseArgs(args),files=distinctPaths(options.input,options.output);
  const input=JSON.parse(fs.readFileSync(files.source,'utf8'));
  const result=await arrangeSpec(input,options.sections);
  atomicWrite(files.target,JSON.stringify(result.raw,null,2)+'\n');
  process.stdout.write('Arranged '+result.count+' diagram'+(result.count===1?'':'s')+' in '+files.target+'\n');
}

module.exports={arrangeSpec,diagramRecords,parseArgs,distinctPaths,atomicWrite};
if(require.main===module)main(process.argv.slice(2)).catch(function(error){
  process.stderr.write(error.message+'\n');process.exitCode=1;
});
