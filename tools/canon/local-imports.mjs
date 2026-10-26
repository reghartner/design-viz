/* Read only the registered dependency closure. Authored bytes never change. */
import {readFile,realpath,stat} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import membership from './manifest.cjs';
import core from './core.cjs';

export async function resolveLocalImports(file, location){
  let registryFile=path.resolve(location);
  if((await stat(registryFile)).isDirectory())registryFile=path.join(registryFile,'canon.json');
  const root=await realpath(path.dirname(registryFile));
  const registry=JSON.parse(await readFile(registryFile,'utf8'));
  const central=path.basename(registryFile)==='canon.json';
  let entries;
  if(central)entries=membership.entries(registry);
  else{
    if(registry.version!==1 || !Array.isArray(registry.diagrams))throw Error('Registry requires version 1 and diagrams.');
    const ids=new Set();
    entries=registry.diagrams.map(entry=>{
      if(!entry || typeof entry.id!=='string' || !entry.id || ids.has(entry.id) || typeof entry.path!=='string')throw Error('Registry requires unique IDs and spec paths.');
      ids.add(entry.id);return entry;
    });
  }
  const files=new Map();
  for(const entry of entries){
    const filename=path.resolve(root,entry.path),relative=path.relative(root,filename);
    if(!relative || relative==='..' || relative.startsWith('..'+path.sep) || path.isAbsolute(relative))throw Error('Registry path escapes its root: '+entry.path);
    files.set(entry.id,{...entry,filename});
  }
  const target=await realpath(file);
  // Match physical paths so a caller can use a harmless path alias, while
  // refusing symlinked providers outside the selected repository.
  let consumer;const physicalEntries=new Map();
  for(const entry of files.values()){
    let physical;try{physical=await realpath(entry.filename);}catch(error){if(['ENOENT','ENOTDIR','ELOOP','EACCES','EPERM'].includes(error.code))continue;throw error;}
    const aliases=physicalEntries.get(physical) || [];aliases.push(entry.id);physicalEntries.set(physical,aliases);
    if(physical===target)consumer=entry;
  }
  if(!consumer)throw Error('Spec is not a member of '+registryFile+': '+file);
  const visiting=new Set(),loaded=new Map();
  async function load(id){
    if(visiting.has(id))throw Error('Topology dependency cycle at '+id);
    if(loaded.has(id))return;
    const entry=files.get(id);if(!entry)throw Error('Topology import references missing spec '+id+' in '+registryFile);
    const physical=await realpath(entry.filename),relative=path.relative(root,physical);
    const aliases=physicalEntries.get(physical) || [];
    if(aliases.length>1)throw Error('Ambiguous registry membership: '+aliases.join(', ')+' resolve to the same spec file.');
    if(relative.startsWith('..'+path.sep) || relative==='..' || path.isAbsolute(relative))throw Error('Registry spec escapes its root: '+entry.path);
    if(central && !physical.startsWith(path.join(root,entry.folder)+path.sep))throw Error('Canon specs must remain inside their diagram folder.');
    if(!(await stat(physical)).isFile())throw Error('Registry requires a regular JSON spec: '+entry.path);
    let spec=JSON.parse(await readFile(physical,'utf8'));
    if(central)spec=membership.spec(spec,entry);
    else if(spec.page?.canon?.id!==id)throw Error('Registry and spec IDs differ: '+id);
    visiting.add(id);
    for(const dependency of core.topologyDependencies(spec))await load(dependency);
    visiting.delete(id);loaded.set(id,spec);
  }
  await load(consumer.id);
  const specs=Array.from(loaded.values()),resolved=core.materializeTopology(specs);
  for(let index=0;index<specs.length;index++){
    const errors=core.validate(resolved[index]).concat(core.validateSpec(resolved[index]).errors);
    if(errors.length)throw Error(specs[index].page.canon.id+': '+errors.join('\n'));
  }
  return {version:1,id:consumer.id,local:true,specs,resolved:resolved.find(spec=>spec.page.canon.id===consumer.id)};
}
const invokedPath=process.argv[1]?await realpath(process.argv[1]).catch(()=>null):null;
if(invokedPath && import.meta.url===pathToFileURL(invokedPath).href){
  resolveLocalImports(process.argv[2],process.argv[3]).then(result=>process.stdout.write(JSON.stringify(result.resolved).replace(/</g,'\\u003c')+'\n')).catch(error=>{console.error(error.message);process.exitCode=1;});
}
