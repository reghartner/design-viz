import {readFile,writeFile,mkdir,rename,realpath,stat} from 'node:fs/promises';
import path from 'node:path';
import {initialState} from './drift.mjs';
import library from './manifest.cjs';
import C from './core.cjs';
export async function json(file){return JSON.parse(await readFile(file,'utf8'));}
export async function canonLibrary(file='canon.json'){
  const root=await realpath(path.dirname(path.resolve(file))),manifest=await json(file),entries=[];
  for(const entry of library.entries(manifest)){
    const filename=await realpath(path.join(root,entry.path));
    const html=await realpath(path.join(root,entry.html));
    if(!(await stat(filename)).isFile() || !(await stat(html)).isFile())throw new Error('Canon requires regular JSON and HTML files.');
    const folder=path.join(root,entry.folder)+path.sep;
    if(!filename.startsWith(folder) || !html.startsWith(folder))throw new Error('Canon files must remain inside their diagram folder.');
    const spec=library.spec(await json(filename),entry);
    const errors=C.validate(spec).concat(C.validateSpec(spec).errors);
    if(errors.length)throw new Error(entry.path+': '+errors.join('\n'));
    entries.push({...entry,filename,spec});
  }
  return {root,entries,specs:entries.map(entry=>entry.spec)};
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
  return {root,entries,specs:entries.map(e=>e.spec)};
}
export async function stateFile(file){try{return await json(file);}catch(e){if(e.code==='ENOENT')return initialState();throw e;}}
export async function atomicJSON(file,value){await mkdir(path.dirname(path.resolve(file)),{recursive:true});const temp=file+'.tmp-'+process.pid;await writeFile(temp,JSON.stringify(value,null,2)+'\n');await rename(temp,file);}
