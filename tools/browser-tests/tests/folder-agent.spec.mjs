import {test,expect} from '@playwright/test';
import {readFile,writeFile,mkdir,mkdtemp,rm,stat,rename,readdir} from 'node:fs/promises';
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
  const folder=await mkdtemp(path.join(tmpdir(),'flowview-browser-folder-'));let sessionFolder,failWrite,writeId=0,readGate=null;const requests=[],errors=[],writes=[];
  await writeFile(path.join(folder,'README.md'),'Existing agent project notes.');
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
  await page.exposeBinding('folderDisk',async(_,operation,name,value)=>{
    const target=path.resolve(folder,'.'+name);if(!target.startsWith(folder+path.sep)&&target!==folder)throw Error('Outside test folder');
    if(operation==='entries')return (await readdir(target,{withFileTypes:true})).map(e=>({name:e.name,kind:e.isDirectory()?'directory':'file'}));
    if(operation==='mkdir'){if(!value?.create){try{return (await stat(target)).isDirectory();}catch(e){if(e.code==='ENOENT')return false;throw e;}}await mkdir(target,{recursive:true});sessionFolder=target;return true;}
    if(operation==='write'){
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
    if(url.pathname==='/index.html')return route.fulfill({contentType:'text/html',body:await readFile(path.join(root,'workbench/flowspec.html'),'utf8')});
    return route.fulfill({contentType:'application/json',body:'[]'});
  });
  await page.goto(origin+'/index.html');
  return {folder,requests,errors,writes,readGate:gate=>readGate=gate,failNextWrite:name=>failWrite=name,get session(){return sessionFolder;},
    read:async name=>JSON.parse(await readFile(path.join(sessionFolder,name),'utf8')),
    run:(...args)=>execFileSync('python3',[path.relative(folder,path.join(sessionFolder,'folder-agent.py')),...args],{cwd:folder,encoding:'utf8'}),
    cleanup:()=>rm(folder,{recursive:true,force:true})};
}
async function closeGuide(page){
  if(await page.locator('#folder-agent-guide').isVisible())await page.locator('#folder-agent-close-guide').click();
}
async function chooseFolder(page){
  if(!await page.locator('#folder-agent-guide').isVisible())await page.locator('#folder-agent-open-setup').click();
  await page.locator('#folder-agent-workflow').selectOption('embedded');await page.locator('#folder-agent-connect').click();
}
async function resumeFolder(page){
  if(!await page.locator('#folder-agent-guide').isVisible())await page.locator('#folder-agent-open-setup').click();
  await expect(page.locator('#folder-agent-connect')).toBeVisible();
  await page.locator('#folder-agent-connect').click();
}
async function publishedRequest(h,text){
  // Send disables while its file write is pending, before Claude can read it.
  // Synchronize on the exact published turn so a previous request cannot pass.
  await expect.poll(async()=>{try{return (await h.read('request.json')).text;}catch(error){if(error.code==='ENOENT')return null;throw error;}}).toBe(text);
  return h.read('request.json');
}
async function disconnect(page){
  await closeGuide(page);
  if(!await page.locator('#folder-agent-disconnect').isVisible())await page.locator('#folder-agent-pairing>summary').click();
  await page.locator('#folder-agent-disconnect').click();
}
test('editor conversation uses real local files and helper; changes render with one Undo/Redo',async({page},info)=>{
  const h=await setup(page);
  try{
    await page.locator('#welcome-paste').click();await page.locator('#welcome-json').fill(source);
    await page.locator('#welcome-paste-form button[type=submit]').click();
    await page.locator('[data-dv-node="a"]').click();await page.locator('#editor-tab-agent').click();
    await chooseFolder(page);await expect(page.locator('#folder-agent-connection')).toHaveText('Waiting for Claude listener');
    await expect(page.locator('#folder-agent-instructions')).toHaveValue(/Monitor/);
    const manifest=await h.read('session.json'),prompt=await page.locator('#folder-agent-instructions').inputValue();
    expect(prompt).toContain(JSON.stringify('./Test folder'));
    expect(prompt).toContain('relative to your current working directory');
    expect(prompt).toContain(manifest.sessionId);expect(prompt).toContain(manifest.connectionId);
    expect(await readFile(path.join(h.folder,'README.md'),'utf8')).toBe('Existing agent project notes.');
    await expect(page.locator('#folder-agent-context')).toContainText('a');
    await closeGuide(page);await page.locator('#folder-agent-input').fill('Tell the customer story');await page.locator('#folder-agent-send').click();
    await expect(page.locator('#folder-agent-send')).toBeDisabled();const request=await publishedRequest(h,'Tell the customer story');expect(request.selection[0].id).toBe('a');
    expect(request.technicalLevel).toBe('story');
    await page.locator('#folder-agent-detail-summary').click();await page.locator('#folder-agent-level').selectOption('engineering');
    expect(await h.read('request.json')).toEqual(request); // This control configures the next request only.
    // Simulated agent asks a real protocol question; text must stay inert.
    await writeFile(path.join(h.session,'answer.txt'),'What should the customer learn? <img src=x onerror=alert(1)>');
    h.run('reply','--request',request.id,'--file','answer.txt');
    await expect(page.locator('#folder-agent-messages')).toContainText('What should the customer learn?');
    await expect(page.locator('#folder-agent-messages img')).toHaveCount(0);
    await closeGuide(page);await page.locator('#folder-agent-input').fill('They can receive camera updates.');await page.locator('#folder-agent-send').click();
    await expect(page.locator('#folder-agent-messages article')).toHaveCount(3);
    const next=await publishedRequest(h,'They can receive camera updates.'),current=await h.read('state.json'),edited=source.replace('"title": "Doorbell"','"title": "Customer camera"');
    expect(next.technicalLevel).toBe('engineering');
    await writeFile(path.join(h.session,'candidate.spec.json'),edited);
    await page.locator('#folder-agent-input').focus(); // Composer focus must allow diagram updates.
    await writeFile(path.join(h.session,'candidate.ledger.md'),'# Coverage ledger\n\nThis trial changes the requested node title and preserves unrelated story behavior.\n');
    h.run('propose','--ledger','candidate.ledger.md','--request',next.id,'--revision',current.revision,'--file','candidate.spec.json','--summary','Customer story updated');
    await expect(page.locator('#agent-update-banner')).toBeVisible();
    await page.locator('#agent-update-open').click();await expect(page.locator('#agent-update-view')).toContainText('Customer camera');
    await expect(page.locator('#src')).toHaveValue(source);await page.locator('#agent-update-commit').click();
    await expect.poll(async()=>{try{return (await h.read('result.json')).status;}catch{return null;}}).toBe('applied');
    await expect(page.locator('#editor-agent')).toBeVisible();
    await expect(page.locator('[data-dv-node="a"]')).toContainText('Customer camera');await expect(page.locator('#src')).toHaveValue(edited);
    h.run('reply','--request',next.id,'--file','answer.txt');await expect(page.locator('#folder-agent-send')).toBeEnabled();
    await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(source);
    await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(edited);
    await expect(page.locator('#editor-agent')).toBeVisible();
    await page.screenshot({path:info.outputPath('folder-conversation.png')});
    await disconnect(page);await expect(page.locator('#folder-agent-connection')).toHaveText('Not connected');
    await expect.poll(async()=> (await h.read('editor.json')).connected).toBe(false);
    expect(h.errors).toEqual([]);expect(h.requests.filter(url=>!['/index.html','/starters.json','/catalog.json'].includes(new URL(url).pathname))).toEqual([]);
  }finally{await page.close();await h.cleanup();}
});
test('new-story entry, picker cancellation and unsupported browser have useful states',async({page})=>{
  const h=await setup(page);
  try{
    await page.locator('#welcome-agent').click();await expect(page.locator('#welcome-build-screen')).toBeVisible();await page.locator('#welcome-build-embedded').click();
    await expect(page.locator('#editor-agent')).toBeVisible();
    await page.evaluate(()=>window.cancelPicker=true);await chooseFolder(page);
    await expect(page.locator('#folder-agent-status')).toHaveText('Folder selection cancelled.');
    await page.evaluate(()=>window.showDirectoryPicker=undefined);await chooseFolder(page);
    await expect(page.locator('#folder-agent-status')).toContainText('Chrome or Edge');expect(h.errors).toEqual([]);
  }finally{await page.close();await h.cleanup();}
});

test('one Build click guides visible copying and folder recovery, then the listener opens chat',async({page},info)=>{
  const h=await setup(page);let watcher;
  try{
    await page.context().grantPermissions(['clipboard-read','clipboard-write'],{origin});
    await page.locator('#welcome-agent').click();await expect(page.locator('#welcome-build-screen')).toBeVisible();await page.locator('#welcome-build-embedded').click();
    await expect(page.getByRole('dialog',{name:'Choose your diagram folder.'})).toBeVisible();
    expect(await page.evaluate(()=>window.pickerCalls)).toBe(0);
    await page.screenshot({path:info.outputPath('claude-centered-start.png')});
    await chooseFolder(page);await expect(page.locator('#folder-agent-copy')).toBeEnabled();
    const oldFolder=h.session,prompt=await page.locator('#folder-agent-instructions').inputValue();
    await page.locator('#folder-agent-copy').click();
    await expect(page.locator('#folder-agent-guide-waiting')).toBeVisible();
    expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe(prompt);
    await expect(page.locator('#folder-agent-guide')).toBeVisible();
    await page.locator('#folder-agent-folder-missing').click();
    await expect(page.locator('#folder-agent-guide-help')).toBeVisible();
    await page.locator('#folder-agent-guide-help [data-agent-change-folder]').click();
    await expect.poll(async()=>JSON.parse(await readFile(path.join(oldFolder,'editor.json'),'utf8')).connected).toBe(false);
    await chooseFolder(page);await expect(page.locator('#folder-agent-copy')).toBeEnabled();
    expect(h.session).toBe(oldFolder);
    await page.locator('#folder-agent-copy').click();
    await page.screenshot({path:info.outputPath('claude-centered-wait.png')});
    watcher=spawn('python3',[path.join(h.session,'folder-agent.py'),'watch','--minutes','1'],{stdio:'ignore'});
    await expect(page.locator('#folder-agent-guide')).not.toBeVisible();
    await expect(page.locator('#folder-agent-input')).toBeFocused();
    await expect(page.locator('#folder-agent-indicator-text')).toHaveText('Claude ready');
    await page.getByRole('button',{name:'Close Agent · Claude panel',exact:true}).click();
    await page.locator('#folder-agent-indicator').click();
    await expect(page.locator('#folder-agent-input')).toBeFocused();
    await expect(page.locator('#folder-agent-guide')).not.toBeVisible();
    expect(await page.evaluate(()=>window.pickerCalls)).toBe(2);
    await disconnect(page);expect(h.errors).toEqual([]);
  }finally{watcher?.kill();await page.close();await h.cleanup();}
});

test('Claude activity streams before the final answer and remains visible without duplicate or executable text',async({page},info)=>{
  const h=await setup(page);let watcher;
  try{
    await page.locator('#welcome-agent').click();await expect(page.locator('#welcome-build-screen')).toBeVisible();await page.locator('#welcome-build-embedded').click();
    await chooseFolder(page);await expect(page.locator('#folder-agent-copy')).toBeEnabled();
    watcher=spawn('python3',[path.join(h.session,'folder-agent.py'),'watch','--minutes','1'],{stdio:'ignore'});
    await expect(page.locator('#folder-agent-connection')).toHaveText('Claude listener active');
    await expect(page.locator('#folder-agent-guide')).not.toBeVisible();
    await closeGuide(page);await page.locator('#folder-agent-input').fill('Explain our customer story');await page.locator('#folder-agent-send').click();
    await expect(page.locator('#folder-agent-activity-title')).toHaveText('Waiting for Claude to respond');
    await expect(page.locator('#folder-agent-progress')).toContainText('has not acknowledged');
    const request=await publishedRequest(h,'Explain our customer story');
    h.run('progress','--request',request.id,'--text','Reading your customer story.');
    h.run('progress','--request',request.id,'--text','Checking the paths. <img src=x onerror=alert(1)>');
    await expect(page.locator('#folder-agent-activity-log li')).toHaveCount(2);
    await expect(page.locator('#folder-agent-activity-title')).toHaveText('Claude is working');
    await expect(page.locator('#folder-agent-activity-log li').first()).toContainText('Reading your customer story.');
    await expect(page.locator('#folder-agent-activity-log img')).toHaveCount(0);
    await expect(page.locator('#folder-agent-send')).toBeDisabled();
    await page.locator('#folder-agent-activity').scrollIntoViewIfNeeded();
    await page.screenshot({path:info.outputPath('claude-activity-live.png')});
    h.run('reply','--request',request.id,'--text','Who is the customer?');
    await expect(page.locator('#folder-agent-messages')).toContainText('Who is the customer?');
    await expect(page.locator('#folder-agent-activity-title')).toHaveText('Claude finished this turn');
    await expect(page.locator('#folder-agent-activity-log li')).toHaveCount(2);
    await expect(page.locator('#folder-agent-send')).toBeEnabled();
    await closeGuide(page);await page.locator('#folder-agent-input').fill('A new member');await page.locator('#folder-agent-send').click();
    await expect(page.locator('#folder-agent-activity-log li')).toHaveCount(0);
    await expect(page.locator('#folder-agent-activity-title')).toHaveText('Waiting for Claude to respond');
    await disconnect(page);expect(h.errors).toEqual([]);
  }finally{watcher?.kill();await page.close();await h.cleanup();}
});


test('refused folder Resume preserves the draft and instructions; successful Resume restores saved story and conversation',async({page})=>{
  const h=await setup(page);
  try{
    await page.locator('#welcome-agent').click();await expect(page.locator('#welcome-build-screen')).toBeVisible();await page.locator('#welcome-build-embedded').click();
    await chooseFolder(page);
    await expect(page.locator('#folder-agent-instructions')).toHaveValue(/Monitor/);
    const before=await h.read('session.json'),instructions=await readFile(path.join(h.session,'CONNECT.md'),'utf8');
    const savedSource=(await h.read('state.json')).source;
    await closeGuide(page);await page.locator('#folder-agent-input').fill('Keep this conversation for folder Resume');await page.locator('#folder-agent-send').click();
    const request=await publishedRequest(h,'Keep this conversation for folder Resume');
    h.run('reply','--request',request.id,'--text','The saved folder conversation is ready to continue.');
    await expect(page.locator('#folder-agent-messages')).toContainText('The saved folder conversation is ready to continue.');
    h.run('prepare');
    const skillFile=path.join(h.session,'authoring/.claude/skills/hld-to-page/SKILL.md');
    await writeFile(skillFile,'Stale skill: use the old API');
    await writeFile(path.join(h.session,'authoring/docs/agent-operations.md'),'Stale operation guidance');
    await writeFile(path.join(h.session,'authoring/src/workbench/agent-operations.js'),'Stale planner');
    await disconnect(page);
    await expect.poll(async()=> (await h.read('editor.json')).connected).toBe(false);
    const localDraft=' {"page":{"title":"Unfinished local draft before Resume"';
    await page.locator('#editor-tab-json').click();await page.locator('#src').fill(localDraft);await page.locator('#editor-tab-agent').click();
    await writeFile(path.join(h.session,'folder-agent.py'),'# Old helper preserved until an authorized resume');
    await page.evaluate(name=>window.resumeFolder=name,path.basename(h.session));
    await writeFile(path.join(h.session,'editor.json'),JSON.stringify({...before,connected:true,at:Date.now()}));
    await resumeFolder(page);
    await expect(page.locator('#folder-agent-status')).toContainText('still connected to another editor');
    expect(await readFile(path.join(h.session,'CONNECT.md'),'utf8')).toBe(instructions);
    expect(await readFile(path.join(h.session,'folder-agent.py'),'utf8')).toContain('# Old helper preserved');
    expect((await h.read('editor.json')).connected).toBe(true);
    expect((await h.read('session.json')).connectionId).toBe(before.connectionId);
    await expect(page.locator('#src')).toHaveValue(localDraft);expect((await h.read('state.json')).source).toBe(savedSource);
    await writeFile(path.join(h.session,'editor.json'),JSON.stringify({...before,connected:false,at:Date.now()}));
    await resumeFolder(page);
    await expect(page.locator('#folder-agent-instructions')).toHaveValue(/diagram folder/);
    const after=await h.read('session.json');expect(after.sessionId).toBe(before.sessionId);expect(after.connectionId).not.toBe(before.connectionId);
    await expect(page.locator('#folder-agent-recovery-choice')).toBeHidden();
    await expect(page.locator('#src')).toHaveValue(savedSource);
    expect(await page.evaluate(text=>JSON.parse(localStorage.getItem('dv-workbench-earlier-drafts')).some(entry=>entry.text===text),localDraft)).toBe(true);
    await closeGuide(page);await expect(page.locator('#folder-agent-messages')).toContainText('The saved folder conversation is ready to continue.');
    await expect(page.locator('#undo-builder')).toBeDisabled();await expect(page.locator('#redo-builder')).toBeDisabled();
    await page.locator('#editor-tab-agent').focus();await page.keyboard.press('Control+z');await expect(page.locator('#src')).toHaveValue(savedSource);
    expect(await page.locator('#folder-agent-instructions').inputValue()).toContain(after.connectionId);
    expect(await readFile(path.join(h.session,'folder-agent.py'),'utf8')).toBe(await readFile(path.join(root,'tools/folder-agent.py'),'utf8'));
    expect(await readFile(path.join(h.session,'CONNECT.md'),'utf8')).not.toMatch(/--operations|--dry-run|Semantic operations/);
    // watch() performs this same preparation before emitting any request.
    h.run('prepare');
    expect(await readFile(skillFile,'utf8')).toBe(await readFile(path.join(root,'.claude/skills/hld-to-page/SKILL.md'),'utf8'));
    await expect(readFile(path.join(h.session,'authoring/docs/agent-operations.md'))).rejects.toMatchObject({code:'ENOENT'});
    await expect(readFile(path.join(h.session,'authoring/src/workbench/agent-operations.js'))).rejects.toMatchObject({code:'ENOENT'});
    await disconnect(page);
    await page.evaluate(()=>window.resumeFolder=null);h.failNextWrite('CONNECT.md');
    await chooseFolder(page);
    await expect(page.locator('#folder-agent-status')).toContainText('Test write failure');
    await expect(page.locator('#folder-agent-connection')).toHaveText('Not connected');
    await expect(page.locator('#folder-agent-copy')).toBeDisabled();
    await expect(page.locator('#folder-agent-send')).toBeDisabled();
    await expect(page.locator('#folder-agent-connect')).toBeEnabled();
    expect((await h.read('editor.json')).connected).toBe(false);expect(h.errors).toEqual([]);
  }finally{await page.close();await h.cleanup();}
});

test('byte-identical Resume clears old history and a late owner change refuses without writing session files',async({page})=>{
  const h=await setup(page);let release;
  try{
    await page.locator('#welcome-paste').click();await page.locator('#welcome-json').fill(source);await page.locator('#welcome-paste-form button[type=submit]').click();
    await page.locator('#editor-tab-agent').click();await chooseFolder(page);await expect(page.locator('#folder-agent-copy')).toBeEnabled();
    await disconnect(page);
    await page.locator('#editor-tab-outline').click();await page.locator('#outline-search').fill('Doorbell');
    await page.locator('.outline-item').filter({hasText:'node · Doorbell'}).click();await page.locator('#outline-inspect').click();
    const title=page.locator('#guide').getByLabel('title',{exact:true});await title.fill('Edit before identical Resume');await title.press('Enter');
    await expect(page.locator('#undo-builder')).toBeEnabled();await page.locator('#undo-builder').click();
    await expect(page.locator('#src')).toHaveValue(source);await expect(page.locator('#redo-builder')).toBeEnabled();
    await page.locator('#editor-tab-agent').click();await page.evaluate(name=>window.resumeFolder=name,path.basename(h.session));
    const owner=await h.read('session.json'),saved=await h.read('state.json'),editor=await h.read('editor.json'),instructions=await readFile(path.join(h.session,'CONNECT.md'),'utf8');
    let reads=0,reached=false;const held=new Promise(resolve=>release=resolve);
    // UI inspection and its locked recheck have finished. Hold the client's
    // first owner read so its own complete inspection sees the new identity.
    h.readGate(async name=>{if(name==='session.json' && ++reads===3){reached=true;await held;}});
    h.writes.length=0;await resumeFolder(page);await expect.poll(()=>reached).toBe(true);
    const replacement={...owner,connectionId:'replacement-owner'};
    const replacementState={...saved,connectionId:replacement.connectionId};
    const replacementEditor={...editor,connectionId:replacement.connectionId,connected:false};
    await writeFile(path.join(h.session,'session.json'),JSON.stringify(replacement));
    await writeFile(path.join(h.session,'state.json'),JSON.stringify(replacementState));
    await writeFile(path.join(h.session,'editor.json'),JSON.stringify(replacementEditor));
    release();await expect(page.locator('#folder-agent-status')).toContainText(/saved session changed|identity/i);
    await expect(page.locator('#folder-agent-connect')).toBeEnabled();await expect(page.locator('#folder-agent-copy')).toBeDisabled();
    await expect(page.locator('#folder-agent-connection')).toHaveText('Not connected');
    expect(h.writes).toEqual([]);expect(await h.read('session.json')).toEqual(replacement);expect(await h.read('state.json')).toEqual(replacementState);expect(await h.read('editor.json')).toEqual(replacementEditor);
    expect(await readFile(path.join(h.session,'CONNECT.md'),'utf8')).toBe(instructions);
    await expect(page.locator('#src')).toHaveValue(source);await expect(page.locator('#undo-builder')).toBeDisabled();await expect(page.locator('#redo-builder')).toBeEnabled();
    expect(h.errors).toEqual([]);
  }finally{release?.();h.readGate(null);await page.close();await h.cleanup();}
});

test('measure 50 file-only exchanges separately from model work',async({page},info)=>{
  test.setTimeout(90000);
  const h=await setup(page);let watcher;
  try{
    await page.locator('#welcome-agent').click();await expect(page.locator('#welcome-build-screen')).toBeVisible();await page.locator('#welcome-build-embedded').click();
    await chooseFolder(page);await expect(page.locator('#folder-agent-send')).toBeEnabled();
    const events=new Map(),waiting=new Map();
    watcher=spawn('python3',[path.join(h.session,'folder-agent.py'),'watch','--minutes','1'],{stdio:['ignore','pipe','pipe']});
    createInterface({input:watcher.stdout}).on('line',line=>{
      const event=JSON.parse(line);if(event.event!=='flowview_request')return;
      const at=Date.now();events.set(event.id,at);waiting.get(event.id)?.(at);
    });
    await expect(page.locator('#folder-agent-connection')).toHaveText('Claude listener active');
    await page.evaluate(()=>{
      window.replyTimes={};const log=document.getElementById('folder-agent-messages');
      new MutationObserver(()=>{for(const el of log.querySelectorAll('article div'))if(/^Measured reply /.test(el.textContent)&&!window.replyTimes[el.textContent])window.replyTimes[el.textContent]=Date.now();}).observe(log,{childList:true,subtree:true});
    });
    const detections=[],deliveries=[];
    for(let i=0;i<50;i++){
      await closeGuide(page);await page.locator('#folder-agent-input').fill('Measured request '+i);await page.locator('#folder-agent-send').click();
      await expect(page.locator('#folder-agent-send')).toBeDisabled();
      const request=await publishedRequest(h,'Measured request '+i);
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
    await disconnect(page);expect(h.errors).toEqual([]);
  }finally{watcher?.kill();await page.close();await h.cleanup();}
});

test('floating tools preserve drafts, coexist, move, resize, close and restore within the screen',async({page},info)=>{
  const h=await setup(page);
  try{
    await page.locator('#welcome-paste').click();await page.locator('#welcome-json').fill(source);await page.locator('#welcome-paste-form button[type=submit]').click();
    await page.locator('#editor-tab-agent').click();await closeGuide(page);await page.locator('#folder-agent-input').fill('Keep this draft while I inspect');
    await page.locator('#editor-tab-inspect').click();
    await expect(page.locator('#editor-agent')).toBeVisible();await expect(page.locator('#editor-inspect')).toBeVisible();
    const before=await page.locator('#src').inputValue(),win=page.locator('#workspace-window-agent'),grip=win.locator('.workspace-window-grip');
    const r=await win.boundingBox();await grip.focus();await page.keyboard.press('Shift+ArrowRight');
    expect((await win.boundingBox()).x).toBeCloseTo(r.x+50,0);
    await win.locator('.workspace-window-resize').focus();await page.keyboard.press('Shift+ArrowRight');
    expect((await win.boundingBox()).width).toBeCloseTo(r.width+50,0);
    const moved=await win.boundingBox(),g=await grip.boundingBox();
    await page.mouse.move(g.x+50,g.y+10);await page.mouse.down();await page.mouse.move(g.x+120,g.y+60);await page.keyboard.press('Escape');await page.mouse.up();
    expect((await win.boundingBox()).x).toBeCloseTo(moved.x,0);
    await win.getByRole('button',{name:'Close Agent · Claude panel',exact:true}).click();await expect(win).toBeHidden();
    await page.locator('#editor-tab-agent').click();await expect(page.locator('#folder-agent-input')).toHaveValue('Keep this draft while I inspect');
    expect((await win.boundingBox()).width).toBeCloseTo(moved.width,0);
    await page.locator('#workspace-panels').click();await expect(win).toBeHidden();await expect(page.locator('#workspace-window-inspect')).toBeHidden();
    const canvas=await page.locator('#workspace-canvas').boundingBox();expect(canvas).toEqual({x:0,y:0,...page.viewportSize()});
    await page.locator('#workspace-panels').click();await expect(win).toBeVisible();await expect(page.locator('#src')).toHaveValue(before);
    await page.screenshot({path:info.outputPath('floating-agent-and-inspect.png')});
    await page.reload();await expect(win).toBeVisible();expect((await win.boundingBox()).x).toBeCloseTo(moved.x,0);
    await page.setViewportSize({width:700,height:700});const small=await win.boundingBox();expect(small.x).toBeGreaterThanOrEqual(12);expect(small.x+small.width).toBeLessThanOrEqual(688);
    expect(small.y+small.height).toBeLessThanOrEqual(688);expect(h.errors).toEqual([]);
  }finally{await page.close();await h.cleanup();}
});

test('diagram itself fills the browser and pans and zooms without editing source or losing the rendered nodes',async({page},info)=>{
  const h=await setup(page);
  try{
    const raw=JSON.parse(source);raw.page.blocks[0].diagram.layouts.forEach(view=>view.presentation='explore');const input=JSON.stringify(raw,null,2);
    await page.locator('#welcome-paste').click();await page.locator('#welcome-json').fill(input);await page.locator('#welcome-paste-form button[type=submit]').click();
    await page.locator('#workspace-panels').click();await page.locator('#workspace-fit').click();
    const canvas=page.locator('.workspace-active-section .explore-board');
    expect(await canvas.boundingBox()).toEqual({x:0,y:0,...page.viewportSize()});
    await expect(page.locator('#docview .doc-title')).toBeHidden();
    const position=()=>canvas.evaluate(el=>({x:el.scrollLeft,y:el.scrollTop}));
    const before=await position(),node=page.locator('[data-dv-node="a"]').first(),n=await node.boundingBox();
    await page.locator('#workspace-pan').click();await page.mouse.move(n.x+10,n.y+10);await page.mouse.down();await page.mouse.move(n.x+90,n.y+70,{steps:5});await page.mouse.up();
    expect((await position()).x).toBeCloseTo(before.x-80,0);expect((await position()).y).toBeCloseTo(before.y-60,0);
    const z=await page.locator('#workspace-zoom').textContent();await page.locator('#workspace-zoom-in').click();expect(await page.locator('#workspace-zoom').textContent()).not.toBe(z);
    await page.locator('#workspace-fit').click();await expect(node).toBeInViewport();await expect(page.locator('#src')).toHaveValue(input);
    await page.screenshot({path:info.outputPath('diagram-canvas.png')});expect(h.errors).toEqual([]);
  }finally{await page.close();await h.cleanup();}
});

test('agent context names the selection before pairing and freezes it beside the sent message',async({page})=>{
  const h=await setup(page);
  try{
    await page.locator('#welcome-paste').click();await page.locator('#welcome-json').fill(source);await page.locator('#welcome-paste-form button[type=submit]').click();
    await page.locator('[data-dv-node="a"]').first().click();await page.locator('#editor-tab-agent').click();
    await expect(page.locator('#folder-agent-context')).toContainText('Doorbell');
    await chooseFolder(page);await expect(page.locator('#folder-agent-send')).toBeEnabled();
    await closeGuide(page);await page.locator('#folder-agent-input').fill('Explain this');await page.locator('#folder-agent-send').click();
    await expect(page.locator('#folder-agent-send')).toBeDisabled();
    const request=await publishedRequest(h,'Explain this');expect(request.selection[0].label).toBe('Doorbell');
    await page.locator('.folder-agent-sent-context summary').click();await expect(page.locator('.folder-agent-sent-context')).toContainText('Doorbell');
    await page.locator('#workspace-window-agent .workspace-window-close').click();await page.locator('[data-dv-node="b"]').first().click();
    h.run('progress','--request',request.id,'--text','Reading the selected doorbell.');
    await expect(page.locator('#folder-agent-indicator')).toContainText('Claude working');
    await page.locator('#folder-agent-indicator').click();
    await expect(page.locator('#folder-agent-context')).toContainText('Backend');
    await expect(page.locator('.folder-agent-sent-context')).toContainText('Doorbell');
    expect((await h.read('request.json')).selection[0].label).toBe('Doorbell');
    expect(h.errors).toEqual([]);
  }finally{await page.close();await h.cleanup();}
});

test('diagram canvas switches sections and views, keeps its camera after edits, and preserves page preview',async({page},info)=>{
  const h=await setup(page);
  try{
    const raw=JSON.parse(source),d=raw.page.blocks[0].diagram;
    d.layouts.forEach(view=>view.presentation='explore');
    d.layouts.push({...structuredClone(d.layouts[0]),id:'technical',name:'Technical',steps:undefined});
    raw.page.blocks.push({tabs:[{label:'More',sections:[{id:'other',heading:'Other story',text:['Page preview prose'],diagram:{view:'step',nodes:{customer:{title:'Customer'},team:{title:'Team'}},rows:[['customer','team']],edges:[{from:'customer',to:'team'}],steps:[{edge:'customer->team',text:'Contact the team'}]}}]}]});
    const otherDiagram=raw.page.blocks[1].tabs[0].sections[0].diagram;
    otherDiagram.layouts=[{id:'flow',name:'Data',presentation:'explore',sectionLayout:{default:[{x:0,y:0,w:12,h:12},{controls:'steps',attachTo:'diagram',x:0,y:12,w:12,h:4}]}}];
    const input=JSON.stringify(raw,null,2);
    await page.locator('#welcome-paste').click();await page.locator('#welcome-json').fill(input);await page.locator('#welcome-paste-form button[type=submit]').click();
    await page.locator('#workspace-panels').click();
    await page.locator('button[data-layout-id="technical"]').click();
    await expect(page.locator('button[data-layout-id="technical"]')).toHaveAttribute('aria-pressed','true');
    await page.locator('#workspace-fit').click();
    await page.locator('#diagram-add-target').selectOption('1');
    const other=page.locator('.workspace-active-section .explore-board');
    expect(await other.boundingBox()).toEqual({x:0,y:0,...page.viewportSize()});
    await expect(page.locator('[data-dv-node="customer"]')).toBeInViewport();
    await expect(page.locator('[data-dv-node="a"]')).toBeHidden();
    await expect(page.locator('.workspace-active-section .explore-player')).toBeVisible();
    await page.locator('#diagram-add-target').selectOption('0');
    await expect(page.locator('button[data-layout-id="technical"]')).toHaveAttribute('aria-pressed','true');
    await page.locator('#workspace-zoom-out').click();
    const camera=()=>page.locator('.workspace-active-section .explore-board').evaluate(el=>({x:el.scrollLeft,y:el.scrollTop,zoom:el.style.getPropertyValue('--explore-width')}));
    const prior=await camera();
    await page.locator('#editor-tab-json').click();
    await page.locator('#src').fill(input.replace('"Backend"','"Customer support"'));await page.locator('#go').click();
    await expect(page.locator('[data-dv-node="b"]')).toContainText('Customer support');
    expect(await camera()).toEqual(prior);
    await page.locator('#workspace-window-json .workspace-window-close').click();
    await page.locator('#workspace-page').click();
    await expect(page.locator('#docview .doc-title')).toBeVisible();
    await expect(page.locator('.workbench-diagram-canvas')).toHaveCount(0);
    await expect(page.getByRole('button',{name:'Arrange section',exact:true}).first()).toBeVisible();
    await page.locator('#workspace-page').click();
    expect(await camera()).toEqual(prior);
    await expect(page.locator('#src')).toHaveValue(input.replace('"Backend"','"Customer support"'));
    await page.screenshot({path:info.outputPath('full-diagram-canvas.png')});
    expect(h.errors).toEqual([]);
  }finally{await page.close();await h.cleanup();}
});


test('full-document reviewed apply, exact receipt Undo and cancelled late proposals use the real folder transport',async({page})=>{
  const h=await setup(page);
  try{
    const spec=JSON.parse(source);spec.page.blocks[0].id='delivery';const original=JSON.stringify(spec,null,2);
    await page.locator('#welcome-paste').click();await page.locator('#welcome-json').fill(original);await page.locator('#welcome-paste-form button[type=submit]').click();
    await page.locator('#editor-tab-agent').click();await chooseFolder(page);await closeGuide(page);
    async function send(text){await page.locator('#folder-agent-input').fill(text);await page.locator('#folder-agent-send').click();return publishedRequest(h,text);}
    const request=await send('Rename the delivery service'),current=await h.read('state.json');

    spec.page.blocks[0].diagram.nodes.b.title='Delivery service';
    await writeFile(path.join(h.session,'candidate.spec.json'),JSON.stringify(spec,null,2));
    await writeFile(path.join(h.session,'candidate.ledger.md'),'# Coverage ledger\n\nThis trial changes the requested node title and preserves unrelated story behavior.\n');
    h.run('propose','--ledger','candidate.ledger.md','--request',request.id,'--revision',current.revision,'--file','candidate.spec.json','--summary','Rename one service');
    await expect(page.locator('#folder-agent-review')).toBeVisible();await expect(page.locator('#src')).toHaveValue(original);
    await page.locator('#folder-agent-review-accept').click();await page.locator('#agent-update-commit').click();await expect.poll(async()=>{try{return (await h.read('result.json')).status;}catch(error){if(error.code==='ENOENT')return null;throw error;}}).toBe('applied');
    await expect(page.locator('#src')).toHaveValue(/Delivery service/);h.run('reply','--request',request.id,'--text','Renamed the service.');await expect(page.locator('#folder-agent-send')).toBeEnabled();
    await page.getByRole('button',{name:'Undo change',exact:true}).click();await expect(page.locator('#src')).toHaveValue(original);
    const cancelled=await send('This turn will be stopped'),state=await h.read('state.json');await page.locator('#folder-agent-cancel').click();await expect(page.locator('#folder-agent-send')).toBeEnabled();
    const manifest=await h.read('session.json');await writeFile(path.join(h.session,'proposal.json'),JSON.stringify({...manifest,id:'late-cancelled',requestId:cancelled.id,baseRevision:state.revision,source:original.replace('Doorbell','Wrong old reply')}));
    await send('Keep this new turn separate');await expect(page.locator('#folder-agent-messages')).toContainText('Keep this new turn separate');await expect(page.locator('#src')).toHaveValue(original);
    // Switching projects must retire both pending work and old conversation receipts.
    await page.locator('#file-input').setInputFiles({name:'new.spec.json',mimeType:'application/json',buffer:Buffer.from(original.replace('Browser contract','Separate story'))});
    await expect(page.locator('#folder-agent-messages')).not.toContainText('Rename the delivery service');await expect(page.locator('#folder-agent-messages [data-change-id]')).toHaveCount(0);await expect(page.locator('#folder-agent-input')).toHaveValue('');
    expect(h.errors).toEqual([]);
  }finally{await page.close();await h.cleanup();}
});

test('external branch copies context without dispatch, accepts native followups and previews a safe merge before commit',async({page},info)=>{
  const h=await setup(page);let watcher,native;
  try{
    await page.context().grantPermissions(['clipboard-read','clipboard-write'],{origin});
    await page.locator('#welcome-agent').click();await expect(page.locator('#welcome-build-screen')).toBeVisible();
    await page.screenshot({path:info.outputPath('build-workflows.png')});
    await page.locator('#welcome-build-external').click();await expect(page.locator('#editor-agent')).not.toBeVisible();
    await expect(page.locator('.folder-agent-prerequisites')).toContainText('Copy/paste works without Monitor.');
    await page.locator('#folder-agent-connect').click();await expect(page.locator('#folder-agent-copy')).toBeEnabled();
    expect((await h.read('session.json')).workflow).toBe('external');
    await page.locator('#folder-agent-copy').click();
    await expect(page.locator('#folder-agent-guide')).not.toBeVisible();await expect(page.locator('#editor-agent')).not.toBeVisible();
    await page.locator('#agent-message-open').click();await page.locator('#agent-message-text').fill('Build the delivery story');
    await page.locator('#agent-message-extra').fill('docs/delivery.md');await expect(page.locator('#agent-message-send')).toBeDisabled();await page.locator('#agent-message-copy').click();
    await expect(page.locator('#agent-message-status')).toContainText('Copied.');
    const copied=await page.evaluate(()=>navigator.clipboard.readText()),request=await h.read('request.json');
    expect(copied).toContain(request.id);expect(copied).toContain('docs/delivery.md');expect(request.delivery).toBe('clipboard');expect(request.replySurface).toBe('agent');
    await page.locator('#agent-message-copy').click();expect((await h.read('request.json')).id).toBe(request.id);
    await page.locator('#agent-message-close').click();
    const base=await h.read('state.json');await writeFile(path.join(h.session,'candidate.spec.json'),source);
    await writeFile(path.join(h.session,'candidate.ledger.md'),'# Coverage ledger\n\nThis trial changes the requested node title and preserves unrelated story behavior.\n');
    h.run('propose','--ledger','candidate.ledger.md','--request',request.id,'--revision',base.revision,'--file','candidate.spec.json','--summary','Delivery story');
    await expect(page.locator('#agent-update-open')).toBeVisible();await expect(page.locator('#src')).toHaveValue(base.source);
    expect(h.run('watch','--minutes','.002','--interval','.1')).toBe(''); // Even an optional watcher never dispatches a copied request.
    await page.locator('#agent-update-open').click();await expect(page.locator('#agent-update-view')).toContainText('Doorbell');
    await page.screenshot({path:info.outputPath('agent-full-preview.png')});
    await page.locator('#agent-update-current').click();await expect(page.locator('#agent-update-view')).toContainText('My story');await expect(page.locator('#agent-update-commit')).toBeDisabled();
    await page.locator('#agent-update-proposed').click();await page.locator('#agent-update-commit').click();
    await expect(page.locator('#src')).toHaveValue(source);await expect.poll(async()=>{try{return (await h.read('result.json')).status;}catch{return null;}}).toBe('applied');h.run('reply','--request',request.id,'--text','Ready for our next question here.');
    await expect.poll(async()=> (await h.read('transcript.json')).messages.at(-1).role).toBe('assistant');
    // A subsequent request can originate in the native conversation without going through embedded chat.
    native=spawn('python3',[path.join(h.session,'folder-agent.py'),'begin','--text','Rename backend'],{stdio:['ignore','pipe','pipe']});
    let output='',errors='';native.stdout.on('data',d=>output+=d);native.stderr.on('data',d=>errors+=d);
    const exit=await new Promise(resolve=>native.on('close',resolve));expect(exit,errors).toBe(0);
    const followup=JSON.parse(output),before=await h.read('state.json');
    const human=source.replace('"Doorbell"','"Human camera"'),agent=source.replace('"Backend"','"Agent backend"');
    await page.locator('#editor-tab-json').click();await page.locator('#src').fill(human);await page.locator('#go').click();
    await expect.poll(async()=> (await h.read('state.json')).source).toBe(human);
    await writeFile(path.join(h.session,'candidate.spec.json'),agent);
    await writeFile(path.join(h.session,'candidate.ledger.md'),'# Coverage ledger\n\nThis trial changes the requested node title and preserves unrelated story behavior.\n');
    h.run('propose','--ledger','candidate.ledger.md','--request',followup.id,'--revision',before.revision,'--file','candidate.spec.json','--summary','Agent backend');
    await expect(page.locator('#agent-update-banner-summary')).toContainText('Includes your latest edits');
    await page.locator('#agent-update-open').click();await expect(page.locator('#agent-update-view')).toContainText('Human camera');await expect(page.locator('#agent-update-view')).toContainText('Agent backend');
    await expect(page.locator('#src')).toHaveValue(human);await page.locator('#agent-update-commit').click();await expect(page.locator('#src')).toHaveValue(/Agent backend/);
    await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(human);
    expect(h.errors).toEqual([]);
  }finally{watcher?.kill();native?.kill();await page.close();await h.cleanup();}
});

test('conflicting update preserves local edits and copies actionable feedback for the agent',async({page},info)=>{
  const h=await setup(page);
  try{
    await page.context().grantPermissions(['clipboard-read','clipboard-write'],{origin});
    await page.locator('#welcome-paste').click();await page.locator('#welcome-json').fill(source);await page.locator('#welcome-paste-form button[type=submit]').click();
    await page.locator('#editor-tab-agent').click();await chooseFolder(page);await closeGuide(page);
    await page.locator('#folder-agent-input').fill('Rename the camera');await page.locator('#folder-agent-send').click();const request=await publishedRequest(h,'Rename the camera'),base=await h.read('state.json');
    const human=source.replace('"Doorbell"','"My camera"');
    await page.locator('#editor-tab-json').click();await page.locator('#src').fill(human);await page.locator('#go').click();await expect.poll(async()=> (await h.read('state.json')).source).toBe(human);
    await writeFile(path.join(h.session,'candidate.spec.json'),source.replace('"Doorbell"','"Their camera"'));
    await writeFile(path.join(h.session,'candidate.ledger.md'),'# Coverage ledger\n\nThis trial changes the requested node title and preserves unrelated story behavior.\n');
    h.run('propose','--ledger','candidate.ledger.md','--request',request.id,'--revision',base.revision,'--file','candidate.spec.json');
    await expect(page.locator('#agent-update-banner-title')).toHaveText('Agent update needs attention');await page.locator('#agent-update-open').click();
    await expect(page.locator('#agent-update-commit')).toBeDisabled();await expect(page.locator('#agent-update-feedback')).toHaveValue(/nodes\/a\/title/);
    await page.screenshot({path:info.outputPath('agent-conflict-feedback.png')});
    await page.locator('#agent-update-copy-feedback').click();expect(await page.evaluate(()=>navigator.clipboard.readText())).toContain('Reread .flowview-agent/state.json');
    await expect.poll(async()=>{try{return (await h.read('result.json')).status;}catch{return null;}}).toBe('rejected');
    await expect(page.locator('#src')).toHaveValue(human);expect(h.errors).toEqual([]);
  }finally{await page.close();await h.cleanup();}
});

test('message composer independently selects nodes and references without changing the diagram',async({page},info)=>{
  const h=await setup(page);
  try{
    await page.context().grantPermissions(['clipboard-read','clipboard-write'],{origin});
    const spec=JSON.parse(source),diagram=spec.page.blocks[0].diagram;
    diagram.nodes.a.codeRefs=[{id:'capture',repository:'https://github.com/example/camera',path:'capture.js',revision:'a'.repeat(40),anchor:{start:'// capture:start',end:'// capture:end'}}];
    diagram.nodes.b.binding={entityRef:'component:default/backend'};
    const input=JSON.stringify(spec,null,2);await page.locator('#welcome-paste').click();await page.locator('#welcome-json').fill(input);await page.locator('#welcome-paste-form button[type=submit]').click();
    await page.locator('[data-dv-node="a"]').click();await page.locator('#agent-message-open').click();
    await expect(page.locator('#agent-message-nodes input:checked')).toHaveCount(1);await expect(page.locator('#agent-message-references input:checked')).toHaveCount(1);
    await page.locator('#agent-message-text').fill('Explain this flow.');await page.locator('#agent-message-references input').first().uncheck();await page.locator('#agent-message-nodes input').nth(1).check();
    await expect(page.locator('#agent-message-preview')).not.toHaveValue(/capture.js|component:default\/backend/);
    await page.locator('#agent-message-copy').click();await expect(page.locator('#agent-message-status')).toContainText('Copied.');
    expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe(await page.locator('#agent-message-preview').inputValue());
    await page.screenshot({path:info.outputPath('agent-context-message.png')});await page.setViewportSize({width:430,height:920});
    expect(await page.locator('#agent-message-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
    await page.keyboard.press('Escape');await expect(page.locator('#src')).toHaveValue(input);await expect(page.locator('#undo-builder')).toBeDisabled();
    expect(h.errors).toEqual([]);
  }finally{await page.close();await h.cleanup();}
});

test('clipboard failure offers manual copy and invalid source cannot create context',async({page})=>{
  const h=await setup(page);
  try{
    await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:()=>Promise.reject(Error('denied'))}}));
    await page.locator('#welcome-paste').click();await page.locator('#welcome-json').fill(source);await page.locator('#welcome-paste-form button[type=submit]').click();
    await page.locator('#agent-message-open').click();await page.locator('#agent-message-text').fill('Review this.');await page.locator('#agent-message-copy').click();
    await expect(page.locator('#agent-message-status')).toContainText('Press ⌘C');
    expect(await page.locator('#agent-message-preview').evaluate(el=>el.selectionEnd-el.selectionStart)).toBe((await page.locator('#agent-message-preview').inputValue()).length);
    await page.keyboard.press('Escape');await expect(page.locator('#agent-message-open')).toBeFocused();
    await page.locator('#editor-tab-json').click();await page.locator('#src').fill('{');await page.locator('#agent-message-open').click();
    await expect(page.locator('#agent-message-error')).toContainText('Fix the diagram');await expect(page.locator('#agent-message-copy')).toBeDisabled();
    expect(h.errors).toEqual([]);
  }finally{await page.close();await h.cleanup();}
});

test('connected Copy preserves a large message while registering a bounded native request',async({page})=>{
  const h=await setup(page);
  try{
    await page.context().grantPermissions(['clipboard-read','clipboard-write'],{origin});
    await page.locator('#welcome-agent').click();await page.locator('#welcome-build-external').click();
    await page.locator('#folder-agent-connect').click();await expect(page.locator('#folder-agent-copy')).toBeEnabled();await page.locator('#folder-agent-copy').click();
    await page.locator('#agent-message-open').click();
    const long='Read this complete pasted context. '+('Reference detail. '.repeat(1400))+' END OF MESSAGE';
    await page.locator('#agent-message-text').fill(long);await page.locator('#agent-message-copy').click();
    await expect(page.locator('#agent-message-status')).toContainText('Copied.');
    const request=await h.read('request.json'),copied=await page.evaluate(()=>navigator.clipboard.readText());
    expect(request.text.length).toBeLessThanOrEqual(16000);expect(request.delivery).toBe('clipboard');
    expect(copied).toContain(request.id);expect(copied).toContain(long);
    await page.locator('#agent-message-copy').click();expect((await h.read('request.json')).id).toBe(request.id);
    expect(h.errors).toEqual([]);
  }finally{await page.close();await h.cleanup();}
});

test('diagram folder opens an existing named pair without metadata and reviews ledger-only changes with paired Undo',async({page},info)=>{
  const h=await setup(page);
  const beforeLedger='# Coverage ledger\n\nExisting evidence and decisions.\n';
  const afterLedger='# Coverage ledger\n\nExisting evidence and decisions.\n\nReviewed: the same diagram needs no spec change.\n';
  try{
    await writeFile(path.join(h.folder,'payments.spec.json'),source);
    await writeFile(path.join(h.folder,'payments.ledger.md'),beforeLedger);
    await page.locator('#welcome-agent').click();await page.locator('#welcome-build-external').click();
    await page.locator('#folder-agent-connect').click();await expect(page.locator('#folder-agent-copy')).toBeEnabled();
    await expect(page.locator('#src')).toHaveValue(source);
    expect(path.basename(h.session)).toBe('.flowview-agent');
    expect((await h.read('session.json')).artifacts).toMatchObject({spec:'payments.spec.json',ledger:'payments.ledger.md'});
    expect(await readFile(path.join(h.folder,'README.md'),'utf8')).toBe('Existing agent project notes.');
    await closeGuide(page);await page.context().grantPermissions(['clipboard-read','clipboard-write']);
    await page.locator('#agent-message-open').click();await page.locator('#agent-message-text').fill('Record the reviewed evidence in the ledger.');await page.locator('#agent-message-copy').click();await page.locator('#agent-message-close').click();
    const request=await h.read('request.json'),state=await h.read('state.json');
    await writeFile(path.join(h.session,'candidate.spec.json'),source);await writeFile(path.join(h.session,'candidate.ledger.md'),afterLedger);
    h.run('propose','--request',request.id,'--revision',state.revision,'--file','candidate.spec.json','--ledger','candidate.ledger.md','--summary','Review evidence without changing the diagram');
    await page.locator('#agent-update-open').click();await expect(page.locator('#agent-update-ledger')).toHaveText(afterLedger.trim());
    expect(await readFile(path.join(h.folder,'payments.ledger.md'),'utf8')).toBe(beforeLedger);
    await page.locator('#agent-update-current').click();await expect(page.locator('#agent-update-ledger')).toHaveText(beforeLedger.trim());
    await page.locator('#agent-update-proposed').click();await page.screenshot({path:info.outputPath('paired-diagram-ledger-preview.png')});
    await page.locator('#agent-update-commit').click();await expect.poll(async()=>{try{return (await h.read('result.json')).status;}catch{return null;}}).toBe('applied');
    await expect.poll(()=>readFile(path.join(h.folder,'payments.ledger.md'),'utf8')).toBe(afterLedger);
    const handwritten=source.replace('Doorbell','Handwritten after approval');await page.locator('#editor-tab-json').click();await page.locator('#src').fill(handwritten);await page.locator('#editor-tab-json').focus();
    await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(source);await expect.poll(()=>readFile(path.join(h.folder,'payments.ledger.md'),'utf8')).toBe(beforeLedger);
    await page.locator('#redo-builder').click();await expect.poll(()=>readFile(path.join(h.folder,'payments.ledger.md'),'utf8')).toBe(afterLedger);
    expect(await readFile(path.join(h.folder,'payments.spec.json'),'utf8')).toBe(handwritten);
    await page.locator('#editor-tab-agent').click();await disconnect(page);
    const outside=source.replace('Doorbell','Outside edit');await writeFile(path.join(h.folder,'payments.spec.json'),outside);
    await chooseFolder(page);await expect(page.locator('#folder-agent-copy')).toBeEnabled();await expect(page.locator('#src')).toHaveValue(outside);
    expect((await h.read('state.json')).ledger).toBe(afterLedger);
    expect(await page.evaluate(text=>JSON.parse(localStorage.getItem('dv-workbench-earlier-drafts')).some(entry=>entry.text===text && entry.ledger),handwritten)).toBe(true);
    await closeGuide(page);await disconnect(page);await mkdir(path.join(h.folder,'second-diagram'));
    await page.evaluate(()=>window.pickPath='/second-diagram');await chooseFolder(page);await expect(page.locator('#folder-agent-copy')).toBeEnabled();
    await expect(page.locator('#undo-builder')).toBeDisabled();await expect(page.locator('#redo-builder')).toBeDisabled();
    expect(await readFile(path.join(h.folder,'second-diagram/story.ledger.md'),'utf8')).toBe(afterLedger);
    expect(await readFile(path.join(h.folder,'payments.ledger.md'),'utf8')).toBe(afterLedger);
    await closeGuide(page);await page.locator('#editor-tab-json').click();await page.locator('#src').fill('{broken JSON');await page.locator('#editor-tab-json').focus();
    await expect.poll(async()=>(await h.read('state.json')).source).toBe('{broken JSON');
    expect(await readFile(path.join(h.folder,'second-diagram/story.spec.json'),'utf8')).toBe(outside);
    expect(await readFile(path.join(h.folder,'second-diagram/story.ledger.md'),'utf8')).toBe(afterLedger);
    await page.locator('#editor-tab-agent').click();await disconnect(page);await chooseFolder(page);await expect(page.locator('#folder-agent-copy')).toBeEnabled();await expect(page.locator('#src')).toHaveValue(outside);
    expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('dv-workbench-draft')).ledger)).toBe(afterLedger);
    expect(h.errors).toEqual([]);
  }finally{await page.close();await h.cleanup();}
});

test('transient failures at each paired commit stage recover once and preserve paired Undo/Redo',async({page})=>{
  test.setTimeout(60000);
  const h=await setup(page);
  try{
    await page.locator('#welcome-paste').click();await page.locator('#welcome-json').fill(source);await page.locator('#welcome-paste-form button[type=submit]').click();
    await page.locator('#editor-tab-agent').click();await chooseFolder(page);await expect(page.locator('#folder-agent-copy')).toBeEnabled();await closeGuide(page);
    let previousSource=source,previousLedger='';
    for(const [index,failedFile] of ['artifact-write.json','story.spec.json','story.ledger.md','result.json'].entries()){
      const text='Stress update '+index;await page.locator('#folder-agent-input').fill(text);await page.locator('#folder-agent-send').click();
      const request=await publishedRequest(h,text),state=await h.read('state.json'),candidate=JSON.parse(previousSource);
      candidate.page.blocks[0].diagram.nodes.b.title='Reviewed '+index;
      const nextSource=JSON.stringify(candidate,null,2),nextLedger='# Coverage\n\nReviewed update '+index+'.\n';
      await writeFile(path.join(h.session,'candidate.spec.json'),nextSource);await writeFile(path.join(h.session,'candidate.ledger.md'),nextLedger);
      const proposal=JSON.parse(h.run('propose','--request',request.id,'--revision',state.revision,'--file','candidate.spec.json','--ledger','candidate.ledger.md','--summary',text));
      await page.locator('#agent-update-open').click();h.failNextWrite(failedFile);await page.locator('#agent-update-commit').click();
      await expect.poll(async()=>{try{const result=await h.read('result.json');return result.id===proposal.id?result.status:null;}catch{return null;}}).toBe('applied');
      await expect(page.locator('#src')).toHaveValue(nextSource);expect(await readFile(path.join(h.folder,'story.ledger.md'),'utf8')).toBe(nextLedger);
      h.run('reply','--request',request.id,'--text','Both saved files match the reviewed pair.');await expect(page.locator('#folder-agent-send')).toBeEnabled();
      await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(previousSource);
      await expect.poll(()=>readFile(path.join(h.folder,'story.ledger.md'),'utf8')).toBe(previousLedger);
      await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(nextSource);
      await expect.poll(()=>readFile(path.join(h.folder,'story.ledger.md'),'utf8')).toBe(nextLedger);
      expect(await readFile(path.join(h.folder,'story.spec.json'),'utf8')).toBe(nextSource);
      previousSource=nextSource;previousLedger=nextLedger;
    }
    expect(h.errors).toEqual([]);
  }finally{await page.close();await h.cleanup();}
});
