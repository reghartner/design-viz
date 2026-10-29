import {mkdtemp,readFile,writeFile,mkdir,readdir,stat,rm,rename} from 'node:fs/promises';
import {spawn,execFileSync} from 'node:child_process';
import path from 'node:path';
import {tmpdir} from 'node:os';
// The real folder protocol/helper is exercised. Only native permission/picker
// handles are substituted with a temporary directory, as in folder-agent.spec.
export async function cloudFolder(page){
 const folder=await mkdtemp(path.join(tmpdir(),'flowview-cloud-folder-')),session=path.join(folder,'.flowview-agent');let counter=0;
 await page.exposeBinding('cloudFolderDisk',async(_,op,name,value)=>{
  const target=path.resolve(folder,'.'+name);if(target!==folder && !target.startsWith(folder+path.sep))throw Error('Outside test folder');
  if(op==='entries')return (await readdir(target,{withFileTypes:true})).map(e=>({name:e.name,kind:e.isDirectory()?'directory':'file'}));
  if(op==='mkdir'){if(value?.create){await mkdir(target,{recursive:true});return true;}try{return (await stat(target)).isDirectory();}catch{return false;}}
  if(op==='exists'){try{await stat(target);return true;}catch{return false;}}
  if(op==='read'){try{return await readFile(target,'utf8');}catch(e){if(e.code==='ENOENT')return null;throw e;}}
  if(op==='write'){const temp=target+'.pending-'+(++counter);await writeFile(temp,value);await rename(temp,target);}
 });
 await page.addInitScript(()=>{
  function directory(name){return {name:name.split('/').pop() || 'Cloud scratch',async *values(){for(const e of await window.cloudFolderDisk('entries',name || '/'))yield e;},
   async getDirectoryHandle(child,opts){if(!await window.cloudFolderDisk('mkdir',name+'/'+child,opts))throw new DOMException('Missing','NotFoundError');return directory(name+'/'+child);},
   async getFileHandle(child,opts){const file=name+'/'+child;if(!opts?.create && !await window.cloudFolderDisk('exists',file))throw new DOMException('Missing','NotFoundError');return {name:child,async getFile(){return new File([await window.cloudFolderDisk('read',file)],child);},async createWritable(){let data;return {async write(value){data=value;},async close(){await window.cloudFolderDisk('write',file,data);},async abort(){}};}};}
  };}
  window.flowviewTestDirectory=directory;
  window.showDirectoryPicker=async()=>directory('');
 });
 return {folder,session,read:async name=>JSON.parse(await readFile(path.join(session,name),'utf8')),
  write:async(name,value)=>writeFile(path.join(session,name),value),
  run:(...args)=>execFileSync('python3',[path.join(session,'folder-agent.py'),...args],{cwd:folder,encoding:'utf8'}),
  begin:text=>new Promise((resolve,reject)=>{const proc=spawn('python3',[path.join(session,'folder-agent.py'),'begin','--text',text],{cwd:folder});let output='',error='';proc.stdout.on('data',d=>output+=d);proc.stderr.on('data',d=>error+=d);proc.on('close',c=>c?reject(Error(error)):resolve(JSON.parse(output)));}),
  close:()=>rm(folder,{recursive:true,force:true})};
}
