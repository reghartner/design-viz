// Real agent-folder fixture shared by folder-agent.spec.mjs and compare-view.spec.mjs.
// Moved verbatim from folder-agent.spec.mjs (no behavior change).
import {expect} from '@playwright/test';
import {readFile,writeFile,mkdir,mkdtemp,rm,stat,rename,readdir} from 'node:fs/promises';
import {execFileSync,spawn} from 'node:child_process';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
export const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
export const origin='https://flowview-folder.test';
// This substitutes ONLY the user picker/directory handles. Disk, helper, editor,
// validation, rendering, history and conversation are real. It is not evidence
// that a human granted native browser permission or that Claude's Monitor ran.
export async function setup(page){
  const folder=await mkdtemp(path.join(tmpdir(),'flowview-browser-folder-'));let sessionFolder,failWrite,writeId=0,readGate=null,writeGate=null,listener;const requests=[],errors=[],writes=[];
  const listenerActive=()=>listener && listener.exitCode===null && listener.signalCode===null;
  async function stopListener(){
    if(!listenerActive())return;
    const closed=new Promise(resolve=>listener.once('close',resolve));listener.kill();await closed;
  }
  await writeFile(path.join(folder,'README.md'),'Existing agent project notes.');
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
  await page.exposeBinding('folderDisk',async(_,operation,name,value)=>{
    const target=path.resolve(folder,'.'+name);if(!target.startsWith(folder+path.sep)&&target!==folder)throw Error('Outside test folder');
    if(operation==='entries')return (await readdir(target,{withFileTypes:true})).map(e=>({name:e.name,kind:e.isDirectory()?'directory':'file'}));
    if(operation==='mkdir'){if(!value?.create){try{return (await stat(target)).isDirectory();}catch(e){if(e.code==='ENOENT')return false;throw e;}}await mkdir(target,{recursive:true});sessionFolder=target;return true;}
    if(operation==='write'){
      if(writeGate)await writeGate(path.basename(target));
      writes.push(name);
      if(path.basename(target)===failWrite){failWrite=null;throw Error('Test write failure');}
      // createWritable buffers writes until close; readers see a complete file.
      const pending=path.join(path.dirname(target),'.browser-write-'+(++writeId));
      try{await writeFile(pending,value,{flag:'wx'});await rename(pending,target);}finally{await rm(pending,{force:true});}
      return;
    }
    if(operation==='read'){if(readGate)await readGate(path.basename(target));try{return await readFile(target,'utf8');}catch(e){if(e.code==='ENOENT')return null;throw e;}}
    if(operation==='exists'){try{await stat(target);return true;}catch{return false;}}
  });
  await page.addInitScript(()=>{
    localStorage.setItem('dv_tour_v1','done');
    function dir(name){return {name:name.split('/').pop()||'Test folder',
      async *values(){for(const entry of await window.folderDisk('entries',name || '/'))yield entry;},
      async getDirectoryHandle(child,options){if(!await window.folderDisk('mkdir',name+'/'+child,options))throw new DOMException('Missing','NotFoundError');return dir(name+'/'+child);},
      async getFileHandle(child,options){const file=name+'/'+child;
        if(!options?.create && !await window.folderDisk('exists',file))throw new DOMException('Missing','NotFoundError');
        return {async getFile(){const text=await window.folderDisk('read',file);return new File([text],child);},
          async createWritable(){let value;return {async write(text){value=text;},async close(){await window.folderDisk('write',file,value);},async abort(){}};}};
      }};}
    window.pickerCalls=0;
    window.showDirectoryPicker=async()=>{window.pickerCalls++;if(window.cancelPicker)throw new DOMException('Cancelled','AbortError');return dir(window.pickPath || '');};
  });
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin!==origin)throw Error('Unexpected network: '+url.href);
    if(url.pathname.endsWith('/template/flowview.html'))return route.fulfill({contentType:'text/html',body:await readFile(path.join(root,'template/flowview.html'),'utf8')});
    if(url.pathname==='/index.html')return route.fulfill({contentType:'text/html',body:await readFile(path.join(root,'workbench/flowspec.html'),'utf8')});
    return route.fulfill({contentType:'application/json',body:'[]'});
  });
  await page.goto(origin+'/index.html');
  return {folder,requests,errors,writes,readGate:gate=>readGate=gate,writeGate:gate=>writeGate=gate,failNextWrite:name=>failWrite=name,get session(){return sessionFolder;},
    read:async name=>JSON.parse(await readFile(path.join(sessionFolder,name),'utf8')),
    run:(...args)=>execFileSync('python3',[path.relative(folder,path.join(sessionFolder,'folder-agent.py')),...args],{cwd:folder,encoding:'utf8'}),
    // The agent registers a request from its own conversation; begin waits for the editor.
    begin:text=>new Promise((resolve,reject)=>{
      const child=spawn('python3',[path.join(sessionFolder,'folder-agent.py'),'begin','--text',text],{cwd:folder,stdio:['ignore','pipe','pipe']});let out='',err='';
      child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);child.on('close',code=>code===0?resolve(JSON.parse(out)):reject(Error(err || 'begin exited '+code)));
    }),
    listen:async()=>{
      await expect(page.locator('#folder-agent-copy')).toBeEnabled();
      await expect.poll(()=>sessionFolder).toBeTruthy();
      await expect.poll(async()=>{try{return JSON.parse(await readFile(path.join(sessionFolder,'session.json'),'utf8')).connectionId;}catch{return null;}}).toBeTruthy();
      // A renewed session retires the old watcher; start one for the current connection.
      const connection=JSON.parse(await readFile(path.join(sessionFolder,'session.json'),'utf8')).connectionId;
      if(listenerActive() && listener.connection!==connection)await stopListener();
      if(!listenerActive()){listener=spawn('python3',[path.join(sessionFolder,'folder-agent.py'),'watch','--minutes','2'],{stdio:'ignore'});listener.connection=connection;}
      await expect(page.locator('#folder-agent-connection')).toHaveText('Claude listener active');
    },
    cleanup:async()=>{await stopListener();await rm(folder,{recursive:true,force:true,maxRetries:5,retryDelay:100});}};
}
export async function closeGuide(page){
  const guide=page.locator('#folder-agent-guide');
  if(await guide.evaluate(dialog=>dialog.open)){
    await page.locator('#folder-agent-close-guide').evaluate(button=>button.click());
    await expect(guide).not.toBeVisible();
  }
}
export async function openAgent(page){
  if(!await page.locator('#editor-agent').isVisible())await page.locator('#editor-tab-agent').click();
  await closeGuide(page);
}
export async function askAgent(page,h,text){
  const begun=await h.begin(text),request=await h.read('request.json');expect(request.id).toBe(begun.id);
  await expect(page.locator('#folder-agent-stage')).toHaveText('Request active · Continue in your agent');
  return request;
}
export async function connectExternal(page){
  await openAgent(page);await page.locator('#folder-agent-open-setup').click();
  await page.locator('#folder-agent-setup-mode-external').click();await page.locator('#folder-agent-connect').click();
  await expect(page.locator('#folder-agent-copy')).toBeEnabled();await closeGuide(page);
}
