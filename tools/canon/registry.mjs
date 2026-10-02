import {readFile,writeFile,mkdir,rename,realpath,stat} from 'node:fs/promises';
import path from 'node:path';
import {initialState} from './drift.mjs';
import library from './manifest.cjs';
import C from './core.cjs';
export async function json(file){return JSON.parse(await readFile(file,'utf8'));}
export function materializeEntries(entries){
  // Legacy callers keep their diagnostics; topology snapshots validate as a
  // batch before any consumer can be indexed, digested, or published.
  if(!entries.some(entry=>C.sections(entry.spec).some(s=>s.diagram.topologyProvenance || Object.hasOwn(s.diagram,'topologyImports') || Object.hasOwn(s.diagram,'topologyExports'))))return entries;
  const specs=C.materializeTopology(entries.map(entry=>entry.spec));
  return entries.map((entry,i)=>({...entry,sourceSpec:entry.sourceSpec || entry.spec,spec:specs[i]}));
}
export async function canonLibrary(file='canon.json'){
  const root=await realpath(path.dirname(path.resolve(file))),manifest=await json(file),entries=[];
  for(const entry of library.entries(manifest)){
    const filename=await realpath(path.join(root,entry.path));
    if(!(await stat(filename)).isFile())throw new Error('Canon requires a regular JSON spec file.');
    const folder=path.join(root,entry.folder)+path.sep;
    if(!filename.startsWith(folder))throw new Error('Canon specs must remain inside their diagram folder.');
    const spec=library.spec(await json(filename),entry);
    entries.push({...entry,filename,spec});
  }
  const resolved=materializeEntries(entries);
  for(const entry of resolved){
    const errors=C.validate(entry.spec).concat(C.validateSpec(entry.spec).errors);
    if(errors.length)throw new Error(entry.path+': '+errors.join('\n'));
  }
  return {root,entries:resolved,specs:resolved.map(entry=>entry.spec)};
}
export async function registry(file){
  if(path.basename(file)==='canon.json')return canonLibrary(file);
  const root=path.dirname(path.resolve(file)),manifest=await json(file);
  if(manifest.version!==1 || !Array.isArray(manifest.diagrams))throw new Error('Registry requires version 1 and diagrams.');
  const ids=new Set(),entries=[];
  for(const entry of manifest.diagrams){
    const filename=path.resolve(root,entry.path);
    if(!filename.startsWith(root+path.sep) || ids.has(entry.id))throw new Error('Registry path escapes its root or repeats an ID.');
    ids.add(entry.id);const spec=await json(filename);
    if(spec.page?.canon?.id!==entry.id)throw new Error('Registry and spec IDs differ: '+entry.id);
    entries.push({...entry,filename,spec});
  }
  const resolved=materializeEntries(entries);
  return {root,entries:resolved,specs:resolved.map(e=>e.spec)};
}
export async function stateFile(file){try{return await json(file);}catch(e){if(e.code==='ENOENT')return initialState();throw e;}}
export async function atomicJSON(file,value){await mkdir(path.dirname(path.resolve(file)),{recursive:true});const temp=file+'.tmp-'+process.pid;await writeFile(temp,JSON.stringify(value,null,2)+'\n');await rename(temp,file);}
