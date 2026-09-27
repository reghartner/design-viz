import {test,expect} from '@playwright/test';
import {readFile,writeFile,mkdir,mkdtemp,rm,stat} from 'node:fs/promises';
import {execFileSync,spawn} from 'node:child_process';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline';
import {source} from '../fixtures/editor-spec.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const origin='https://flowview-folder.test';
// This substitutes ONLY the user picker/directory handles. Disk, helper, editor,
// validation, rendering, history and conversation are real. It is not evidence
// that a human granted native browser permission or that Claude's Monitor ran.
async function setup(page){
  const folder=await mkdtemp(path.join(tmpdir(),'flowview-browser-folder-'));let sessionFolder;const requests=[],errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
  await page.exposeBinding('folderDisk',async(_,operation,name,value)=>{
    const target=path.resolve(folder,'.'+name);if(!target.startsWith(folder+path.sep)&&target!==folder)throw Error('Outside test folder');
    if(operation==='mkdir'){await mkdir(target,{recursive:true});sessionFolder=target;return;}
    if(operation==='write'){await writeFile(target,value);return;}
    if(operation==='read'){try{return await readFile(target,'utf8');}catch(e){if(e.code==='ENOENT')return null;throw e;}}
    if(operation==='exists'){try{await stat(target);return true;}catch{return false;}}
  });
  await page.addInitScript(()=>{
    localStorage.setItem('dv_tour_v1','done');
    function dir(name){return {name:name.split('/').pop()||'Test folder',
      async getDirectoryHandle(child){await window.folderDisk('mkdir',name+'/'+child);return dir(name+'/'+child);},
      async getFileHandle(child,options){const file=name+'/'+child;
        if(!options?.create && !await window.folderDisk('exists',file))throw new DOMException('Missing','NotFoundError');
        return {async getFile(){const text=await window.folderDisk('read',file);return new File([text],child);},
          async createWritable(){let value;return {async write(text){value=text;},async close(){await window.folderDisk('write',file,value);},async abort(){}};}};
      }};}
    window.showDirectoryPicker=async()=>{if(window.cancelPicker)throw new DOMException('Cancelled','AbortError');return dir('');};
  });
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin!==origin)throw Error('Unexpected network: '+url.href);
    if(url.pathname==='/index.html')return route.fulfill({contentType:'text/html',body:await readFile(path.join(root,'workbench/flowspec.html'),'utf8')});
    return route.fulfill({contentType:'application/json',body:'[]'});
  });
  await page.goto(origin+'/index.html');
  return {folder,requests,errors,get session(){return sessionFolder;},
    read:async name=>JSON.parse(await readFile(path.join(sessionFolder,name),'utf8')),
    run:(...args)=>execFileSync('python3',[path.join(sessionFolder,'folder-agent.py'),...args],{encoding:'utf8'}),
    cleanup:()=>rm(folder,{recursive:true,force:true})};
}
test('editor conversation uses real local files and helper; changes render with one Undo/Redo',async({page},info)=>{
  const h=await setup(page);
  try{
    await page.locator('#welcome-paste').click();await page.locator('#welcome-json').fill(source);
    await page.locator('#welcome-paste-form button[type=submit]').click();
    await page.locator('[data-dv-node="a"]').click();await page.locator('#editor-tab-agent').click();
    await page.locator('#folder-agent-connect').click();await expect(page.locator('#folder-agent-connection')).toHaveText('Waiting for Claude listener');
    await expect(page.locator('#folder-agent-instructions')).toHaveValue(/Monitor/);
    await expect(page.locator('#folder-agent-context')).toContainText('a');
    await page.locator('#folder-agent-input').fill('Tell the customer story');await page.locator('#folder-agent-send').click();
    await expect(page.locator('#folder-agent-send')).toBeDisabled();const request=await h.read('request.json');expect(request.selection[0].id).toBe('a');
    // Simulated agent asks a real protocol question; text must stay inert.
    await writeFile(path.join(h.session,'answer.txt'),'What should the customer learn? <img src=x onerror=alert(1)>');
    h.run('reply','--request',request.id,'--file','answer.txt');
    await expect(page.locator('#folder-agent-messages')).toContainText('What should the customer learn?');
    await expect(page.locator('#folder-agent-messages img')).toHaveCount(0);
    await page.locator('#folder-agent-input').fill('They can receive camera updates.');await page.locator('#folder-agent-send').click();
    await expect(page.locator('#folder-agent-messages article')).toHaveCount(3);
    const next=await h.read('request.json'),current=await h.read('state.json'),edited=source.replace('"title": "Doorbell"','"title": "Customer camera"');
    await writeFile(path.join(h.session,'candidate.spec.json'),edited);
    await page.locator('#folder-agent-input').focus(); // Composer focus must allow diagram updates.
    h.run('propose','--request',next.id,'--revision',current.revision,'--file','candidate.spec.json','--summary','Customer story updated');
    await expect.poll(async()=>{try{return (await h.read('result.json')).status;}catch{return null;}}).toBe('applied');
    await expect(page.locator('#editor-agent')).toBeVisible();
    await expect(page.locator('[data-dv-node="a"]')).toContainText('Customer camera');await expect(page.locator('#src')).toHaveValue(edited);
    h.run('reply','--request',next.id,'--file','answer.txt');await expect(page.locator('#folder-agent-send')).toBeEnabled();
    await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(source);
    await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(edited);
    await expect(page.locator('#editor-agent')).toBeVisible();
    await page.locator('#folder-agent-setup summary').click();
    await page.screenshot({path:info.outputPath('folder-conversation.png')});
    await page.locator('#folder-agent-disconnect').click();await expect(page.locator('#folder-agent-connection')).toHaveText('Not connected');
    await expect.poll(async()=> (await h.read('editor.json')).connected).toBe(false);
    expect(h.errors).toEqual([]);expect(h.requests.filter(url=>!['/index.html','/starters.json','/catalog.json'].includes(new URL(url).pathname))).toEqual([]);
  }finally{await page.close();await h.cleanup();}
});
test('new-story entry, picker cancellation and unsupported browser have useful states',async({page})=>{
  const h=await setup(page);
  try{
    await page.locator('#welcome-agent').click();await page.locator('#welcome-agent-live').click();
    await expect(page.locator('#editor-agent')).toBeVisible();
    await page.evaluate(()=>window.cancelPicker=true);await page.locator('#folder-agent-connect').click();
    await expect(page.locator('#folder-agent-status')).toHaveText('Folder selection cancelled.');
    await page.evaluate(()=>window.showDirectoryPicker=undefined);await page.locator('#folder-agent-connect').click();
    await expect(page.locator('#folder-agent-status')).toContainText('Chrome or Edge');expect(h.errors).toEqual([]);
  }finally{await page.close();await h.cleanup();}
});


test('measure 50 file-only exchanges separately from model work',async({page},info)=>{
  test.setTimeout(90000);
  const h=await setup(page);let watcher;
  try{
    await page.locator('#welcome-agent').click();await page.locator('#welcome-agent-live').click();
    await page.locator('#folder-agent-connect').click();await expect(page.locator('#folder-agent-send')).toBeEnabled();
    const events=new Map(),waiting=new Map();
    watcher=spawn('python3',[path.join(h.session,'folder-agent.py'),'watch','--minutes','1'],{stdio:['ignore','pipe','pipe']});
    createInterface({input:watcher.stdout}).on('line',line=>{
      const event=JSON.parse(line);if(event.event!=='flowview_request')return;
      const at=Date.now();events.set(event.id,at);waiting.get(event.id)?.(at);
    });
    await expect(page.locator('#folder-agent-connection')).toHaveText('Claude listener active');
    await page.locator('#folder-agent-setup summary').click();
    await page.evaluate(()=>{
      window.replyTimes={};const log=document.getElementById('folder-agent-messages');
      new MutationObserver(()=>{for(const el of log.querySelectorAll('article div'))if(/^Measured reply /.test(el.textContent)&&!window.replyTimes[el.textContent])window.replyTimes[el.textContent]=Date.now();}).observe(log,{childList:true,subtree:true});
    });
    const detections=[],deliveries=[];
    for(let i=0;i<50;i++){
      await page.locator('#folder-agent-input').fill('Measured request '+i);await page.locator('#folder-agent-send').click();
      await expect(page.locator('#folder-agent-send')).toBeDisabled();const request=await h.read('request.json');
      const at=events.has(request.id)?events.get(request.id):await new Promise(resolve=>waiting.set(request.id,resolve));
      detections.push(at-request.at);
      const reply='Measured reply '+i;await writeFile(path.join(h.session,'answer.txt'),reply);h.run('reply','--request',request.id,'--file','answer.txt');
      const written=await h.read('reply.json');await expect(page.locator('#folder-agent-send')).toBeEnabled();
      deliveries.push(await page.evaluate(text=>window.replyTimes[text],reply)-written.at);
    }
    const summary=values=>{const sorted=values.slice().sort((a,b)=>a-b);return {samples:values.length,p50_ms:sorted[24],p95_ms:sorted[47],max_ms:sorted[49]};};
    const report={browser:page.context().browser().version(),transport:'HTTPS route with injected directory adapter backed by real disk; actual Python watcher; no model',request_to_watcher:summary(detections),reply_to_editor:summary(deliveries)};
    await writeFile(info.outputPath('latency.json'),JSON.stringify(report,null,2));
    await info.attach('file-transport-latency',{body:JSON.stringify(report),contentType:'application/json'});
    await page.locator('#folder-agent-disconnect').click();expect(h.errors).toEqual([]);
  }finally{watcher?.kill();await page.close();await h.cleanup();}
});
