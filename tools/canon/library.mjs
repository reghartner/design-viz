#!/usr/bin/env node
/* Publish approved registry specs as static data; no GitHub credentials in HTML. */
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {registry,atomicJSON} from './registry.mjs';
import C from './core.cjs';
function libraryFromRegistry(source){
  return {version:1,diagrams:source.entries.map(entry=>{
    if(typeof entry.id!=='string' || !entry.id.trim() || entry.id.length>200)throw new Error('Every library diagram needs an ID of 1–200 characters.');
    const errors=C.validate(entry.spec).concat(C.validateSpec(entry.spec).errors);
    if(errors.length)throw new Error('Invalid diagram '+entry.id+': '+errors.join('; '));
    return {id:entry.id,title:entry.title || entry.spec.page.title || entry.id,spec:entry.spec};
  })};
}
export async function buildLibrary(registryPath){return libraryFromRegistry(await registry(registryPath));}
async function main(args){
  let input,output;
  while(args.length){
    const arg=args.shift();
    if(arg==='--registry')input=args.shift();
    else if(arg==='--out')output=args.shift();
    else throw new Error('Unknown argument: '+arg);
  }
  if(!input || !output)throw new Error('Usage: node tools/canon/library.mjs --registry registry.json --out workbench/diagrams.json');
  if(path.resolve(input)===path.resolve(output))throw new Error('Output must not overwrite the source registry.');
  const source=await registry(input);
  if(source.entries.some(entry=>entry.filename===path.resolve(output)))throw new Error('Output must not overwrite a source spec.');
  const library=libraryFromRegistry(source);
  if(Buffer.byteLength(JSON.stringify(library,null,2)+'\n')>30*1024*1024)throw new Error('Library exceeds 30 MB.');
  await atomicJSON(output,library);
  console.log('Published '+library.diagrams.length+' diagrams to '+output);
}
if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  main(process.argv.slice(2)).catch(error=>{console.error(error.message);process.exitCode=1;});
}
