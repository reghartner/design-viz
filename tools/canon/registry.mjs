import {readFile,readdir,writeFile,mkdir,rename,realpath,stat} from 'node:fs/promises';
import path from 'node:path';
import {initialState} from './drift.mjs';
import library from './manifest.cjs';
import C from './core.cjs';
export async function json(file){return JSON.parse(await readFile(file,'utf8'));}
export function materializeEntries(entries){
  for(const entry of entries)if(C.sections(entry.spec).some(s=>s.diagram.topologyProvenance))throw new Error('Publish authored references, not generated topologyProvenance: '+entry.id);
  // Legacy callers keep their diagnostics; topology snapshots validate as a
  // batch before any consumer can be indexed, digested, or published.
  if(!entries.some(entry=>C.sections(entry.spec).some(s=>s.diagram.topologyProvenance || Object.hasOwn(s.diagram,'topologyImports') || Object.hasOwn(s.diagram,'topologyExports'))))return entries;
  const specs=C.materializeTopology(entries.map(entry=>entry.spec));
  return entries.map((entry,i)=>({...entry,resolvedSpec:specs[i]}));
}
// A present topologyExports (even {}) declares a provider, as in materializeEntries.
function declaresExports(spec){
  const own=(value,key)=>!!value && typeof value==='object' && Object.hasOwn(value,key);
  return own(spec,'topologyExports') || C.sections(spec).some(section=>own(section.diagram,'topologyExports'));
}
/* An exporting spec outside canon.json splits a provider from its registration:
   consumers can import an ID that canon never publishes. Walk diagrams/ without
   following symlinks; agent metadata (dot folders), node_modules and files that do
   not parse declare nothing, so they keep loading as before. */
async function unlistedExporters(root,listed){
  let top;
  try{top=await realpath(path.join(root,'diagrams'));}catch(error){if(error.code==='ENOENT')return [];throw error;}
  const found=[];
  async function walk(folder){
    const children=await readdir(folder,{withFileTypes:true});
    children.sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);
    for(const child of children){
      if(child.name.startsWith('.') || child.name==='node_modules')continue;
      const filename=path.join(folder,child.name);
      if(child.isDirectory()){await walk(filename);continue;}
      if(!child.isFile() || !child.name.endsWith('.spec.json') || listed.has(filename))continue;
      const text=await readFile(filename,'utf8');let spec;
      try{spec=JSON.parse(text);}catch{continue;}
      if(declaresExports(spec))found.push(path.relative(root,filename).split(path.sep).join('/'));
    }
  }
  await walk(top);
  return found;
}
function unlistedExporterError(paths){
  return new Error('Every spec under diagrams/ that declares topologyExports must be listed in canon.json.\n'+paths.map(relative=>{
    const folder=path.posix.dirname(relative),leaf=path.posix.basename(folder);
    const fix=path.posix.basename(relative)===leaf+'.spec.json'?'Add its folder to canon.json ("folder": "'+folder+'", with its owner)':
      'Give it its own diagrams/…/<id>/ folder as <id>.spec.json and add that folder to canon.json';
    return relative+' declares topologyExports but is not listed in canon.json. '+fix+
      ' in the same commit and PR as the consumers that import it, or remove topologyExports.';
  }).join('\n'));
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
  const unlisted=await unlistedExporters(root,new Set(entries.map(entry=>entry.filename)));
  if(unlisted.length)throw unlistedExporterError(unlisted);
  const resolved=materializeEntries(entries);
  for(const entry of resolved){
    const rendered=entry.resolvedSpec || entry.spec;
    const errors=C.validate(rendered).concat(C.validateSpec(rendered).errors);
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
    entries.push({...entry,folder:path.relative(root,path.dirname(filename)).split(path.sep).join('/'),filename,spec});
  }
  const resolved=materializeEntries(entries);
  return {root,entries:resolved,specs:resolved.map(e=>e.spec)};
}
export async function stateFile(file){try{return await json(file);}catch(e){if(e.code==='ENOENT')return initialState();throw e;}}
export async function atomicJSON(file,value){await mkdir(path.dirname(path.resolve(file)),{recursive:true});const temp=file+'.tmp-'+process.pid;await writeFile(temp,JSON.stringify(value,null,2)+'\n');await rename(temp,file);}
