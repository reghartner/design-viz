#!/usr/bin/env node
/* Publish reviewed specs as static data; no GitHub credentials in HTML. */
import {readdir,readFile,realpath} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {registry,atomicJSON} from './registry.mjs';
import C from './core.cjs';

function libraryFromEntries(entries){
  const ids=new Map();
  return {version:1,diagrams:entries.map(entry=>{
    const label=entry.filename || entry.id;
    if(typeof entry.id!=='string' || !entry.id.trim() || entry.id.length>200)throw new Error(label+': every library diagram needs an ID of 1–200 characters.');
    if(ids.has(entry.id))throw new Error('Duplicate canon ID '+entry.id+': '+ids.get(entry.id)+' and '+label);
    ids.set(entry.id,label);
    const errors=C.validate(entry.spec).concat(C.validateSpec(entry.spec).errors);
    if(errors.length)throw new Error('Invalid diagram '+label+': '+errors.join('; '));
    return {id:entry.id,title:entry.title || entry.spec.page.title || entry.id,spec:entry.spec};
  })};
}
export async function buildLibrary(registryPath){return libraryFromEntries((await registry(registryPath)).entries);}

/* Only regular JSON files under the chosen directory are inputs. Never follow
   symlinks into another repository or publish files merely because they exist. */
export async function buildLibraryFromDirectory(directory){
  const entries=[];
  async function walk(folder){
    const children=await readdir(folder,{withFileTypes:true});
    children.sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);
    for(const child of children){
      const filename=path.join(folder,child.name);
      if(child.isDirectory()){await walk(filename);continue;}
      if(!child.isFile() || !child.name.toLowerCase().endsWith('.json'))continue;
      let spec;
      try{spec=JSON.parse(await readFile(filename,'utf8'));}
      catch(error){throw new Error(filename+': '+error.message);}
      if(!spec?.page || !Object.hasOwn(spec.page,'canon'))continue;
      entries.push({filename,id:spec.page.canon?.id,spec});
    }
  }
  await walk(path.resolve(directory));
  return libraryFromEntries(entries);
}

/* Resolve existing ancestors too: a not-yet-created output can still sit
   beneath a symlinked directory that aliases a source location. */
async function physicalPath(filename){
  let current=path.resolve(filename);const suffix=[];
  while(true){
    try{return path.join(await realpath(current),...suffix);}
    catch(error){
      if(error.code!=='ENOENT' || path.dirname(current)===current)throw error;
      suffix.unshift(path.basename(current));current=path.dirname(current);
    }
  }
}
function withinDirectory(filename,directory){
  const relative=path.relative(directory,filename);
  return !relative || (relative!=='..' && !relative.startsWith('..'+path.sep) && !path.isAbsolute(relative));
}

export async function publishLibrary({registryPath,diagramsDir='docs/diagrams',output='workbench/diagrams.json'}={}){
  const destination=path.resolve(output),physicalDestination=await physicalPath(destination);
  let library;
  if(registryPath){
    if(path.resolve(registryPath)===destination || await realpath(registryPath)===physicalDestination)throw new Error('Output must not overwrite the source registry.');
    const source=await registry(registryPath);
    if((await Promise.all(source.entries.map(entry=>realpath(entry.filename)))).includes(physicalDestination))throw new Error('Output must not overwrite a source spec.');
    library=libraryFromEntries(source.entries);
  }else{
    const directory=path.resolve(diagramsDir);
    if(withinDirectory(destination,directory) || withinDirectory(physicalDestination,await realpath(directory)))throw new Error('Output must be outside the diagram source directory.');
    library=await buildLibraryFromDirectory(directory);
  }
  if(Buffer.byteLength(JSON.stringify(library,null,2)+'\n')>30*1024*1024)throw new Error('Library exceeds 30 MB.');
  await atomicJSON(destination,library);
  return library;
}

async function main(args){
  const options={},flags={'--registry':'registryPath','--diagrams':'diagramsDir','--out':'output'};
  while(args.length){
    const arg=args.shift();
    if(!Object.hasOwn(flags,arg))throw new Error('Unknown argument: '+arg);
    const key=flags[arg];
    const value=args.shift();
    if(!value || value.startsWith('--'))throw new Error('Missing value for '+arg);
    if(Object.hasOwn(options,key))throw new Error('Repeated argument: '+arg);
    options[key]=value;
  }
  if(options.registryPath && options.diagramsDir)throw new Error('Choose --diagrams or --registry, not both.');
  const library=await publishLibrary(options);
  console.log('Published '+library.diagrams.length+' diagrams to '+(options.output || 'workbench/diagrams.json'));
}
if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  main(process.argv.slice(2)).catch(error=>{console.error(error.message);process.exitCode=1;});
}
