import {canvasTools} from '../helpers/test.mjs';
import {test,expect} from '@playwright/test';
import {chooseAddDestination} from '../helpers/test.mjs';
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
  const folder=await mkdtemp(path.join(tmpdir(),'flowview-browser-folder-'));let sessionFolder,failWrite,writeId=0,readGate=null,listener;const requests=[],errors=[],writes=[];
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
    listen:async()=>{
      await expect(page.locator('#folder-agent-copy')).toBeEnabled();
      await expect.poll(()=>sessionFolder).toBeTruthy();
      await expect.poll(async()=>{try{return JSON.parse(await readFile(path.join(sessionFolder,'session.json'),'utf8')).connectionId;}catch{return null;}}).toBeTruthy();
      if(!listener || listener.exitCode!==null)listener=spawn('python3',[path.join(sessionFolder,'folder-agent.py'),'watch','--minutes','2'],{stdio:'ignore'});
      await expect(page.locator('#folder-agent-connection')).toHaveText('Claude listener active');
    },
    cleanup:async()=>{listener?.kill();if(listener && listener.exitCode===null)await new Promise(resolve=>listener.once('close',resolve));await rm(folder,{recursive:true,force:true});}};
}
async function closeGuide(page){
  const guide=page.locator('#folder-agent-guide');
  if(await guide.evaluate(dialog=>dialog.open)){
    await page.locator('#folder-agent-close-guide').evaluate(button=>button.click());
    await expect(guide).not.toBeVisible();
  }
}
async function openAgent(page){
  if(!await page.locator('#editor-agent').isVisible())await page.locator('#editor-tab-agent').click();
  await closeGuide(page);
}
async function expectWorkbenchCanvas(page){
  const section=page.locator('.workspace-active-section'),viewport=page.viewportSize();
  const shell=await section.locator('.workbench-diagram-canvas').boundingBox(),nav=await section.locator('.explore-navigation').boundingBox();
  const stage=await section.locator('.explore-stage').boundingBox(),board=await section.locator('.explore-board').boundingBox();
  const contentTop=await page.locator('body').evaluate(el=>parseFloat(getComputedStyle(el).getPropertyValue('--workspace-content-top')));expect(contentTop).toBe(Math.ceil(nav.y+nav.height+10));expect(shell).toEqual({x:84,y:contentTop,width:viewport.width-96,height:viewport.height-contentTop-12});
  expect(stage.y).toBeGreaterThanOrEqual(nav.y+nav.height);expect(board).toEqual(stage);
}
async function copyRequest(page,text){
  await openAgent(page);
  await page.locator('#folder-agent-input').fill(text);await page.locator('#folder-agent-send').click();
  await expect(page.locator('#folder-agent-panel-status')).toContainText('Copied.');
}
async function connectExternal(page){
  await openAgent(page);await page.locator('#folder-agent-open-setup').click();
  await page.locator('#folder-agent-setup-mode-external').click();await page.locator('#folder-agent-connect').click();
  await expect(page.locator('#folder-agent-copy')).toBeEnabled();await closeGuide(page);
}
async function finishCopiedRequest(page,h){
  const request=await h.read('request.json');h.run('reply','--request',request.id,'--text','Ready for the next request.');
  await expect(page.locator('#folder-agent-cancel')).toBeHidden();
}
async function chooseFolder(page){
  if(!await page.locator('#folder-agent-guide').isVisible())await page.locator('#folder-agent-open-setup').click();
  await page.locator('#folder-agent-setup-mode-embedded').click();await page.locator('#folder-agent-start-adopt').click();await page.locator('#folder-agent-connect').click();
}
async function resumeFolder(page){
  if(!await page.locator('#folder-agent-guide').isVisible())await page.locator('#folder-agent-open-setup').click();
  await page.locator('#folder-agent-start-resume').click();
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
    await closeGuide(page);await expect(page.locator('#folder-agent-send')).toBeDisabled();await h.listen();await page.locator('#folder-agent-input').fill('Tell the customer story');await page.locator('#folder-agent-send').click();
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
test('agent topology declarations preview both states and commit authored source with one Undo/Redo',async({page},info)=>{
  const h=await setup(page);
  try{
    const raw=JSON.parse(source);raw.page.blocks[0].diagram.topologyExports={delivery:{nodes:['a','b'],edges:['a->b']}};
    const current=JSON.stringify(raw,null,4)+'\n',proposed=current.replace('"title": "Doorbell"','"title": "Customer camera"');
    await page.locator('#welcome-paste').click();await page.locator('#welcome-json').fill(current);
    await page.locator('#welcome-paste-form button[type=submit]').click();
    await page.locator('#editor-tab-agent').click();await chooseFolder(page);await closeGuide(page);await h.listen();
    await page.locator('#folder-agent-input').fill('Rename the exported camera');await page.locator('#folder-agent-send').click();
    const request=await publishedRequest(h,'Rename the exported camera'),state=await h.read('state.json');
    await writeFile(path.join(h.session,'candidate.spec.json'),proposed);
    await writeFile(path.join(h.session,'candidate.ledger.md'),'# Coverage ledger\n\nRename the camera and preserve the delivery topology export.\n');
    h.run('propose','--ledger','candidate.ledger.md','--request',request.id,'--revision',state.revision,'--file','candidate.spec.json','--summary','Exported camera renamed');
    await expect(page.locator('#agent-update-banner')).toBeVisible();await page.locator('#agent-update-open').click();
    const view=page.locator('#agent-update-view'),commit=page.locator('#agent-update-commit');
    await expect(view.locator('[data-dv-node="a"]')).toContainText('Customer camera');await expect(commit).toBeEnabled();
    await expect(page.locator('#agent-update-source')).toHaveValue(proposed);await expect(page.locator('#src')).toHaveValue(current);
    await page.locator('#agent-update-current').click();await expect(view.locator('[data-dv-node="a"]')).toContainText('Doorbell');
    await expect(page.locator('#agent-update-source')).toHaveValue(current);await expect(commit).toBeDisabled();
    await page.locator('#agent-update-proposed').click();await expect(view.locator('[data-dv-node="a"]')).toContainText('Customer camera');
    await expect(page.locator('#agent-update-source')).toHaveValue(proposed);await expect(commit).toBeEnabled();
    await page.screenshot({path:info.outputPath('agent-topology-preview.png')});await commit.click();
    await expect.poll(async()=>{try{return (await h.read('result.json')).status;}catch{return null;}}).toBe('applied');
    await expect(page.locator('#src')).toHaveValue(proposed);await expect(page.locator('[data-dv-node="a"]')).toContainText('Customer camera');
    expect((await h.read('state.json')).source).toBe(proposed);
    expect(await readFile(path.join(h.session,'candidate.spec.json'),'utf8')).toBe(proposed);
    const project=await h.read('project.json');expect(await readFile(path.join(h.folder,project.spec),'utf8')).toBe(proposed);
    expect(proposed).not.toContain('topologyProvenance');
    await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(current);
    await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(proposed);
    expect(h.errors).toEqual([]);
  }finally{await page.close();await h.cleanup();}
});
test('new-story entry, picker cancellation and unsupported browser have useful states',async({page})=>{
  const h=await setup(page);
  try{
    await page.locator('#welcome-agent').click();await expect(page.locator('#folder-agent-guide')).toBeVisible();await page.locator('#folder-agent-setup-mode-embedded').click();
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
    await page.locator('#welcome-agent').click();await expect(page.locator('#folder-agent-guide')).toBeVisible();await page.locator('#folder-agent-setup-mode-embedded').click();
    await expect(page.getByRole('dialog',{name:'How are you starting?'})).toBeVisible();
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
    await resumeFolder(page);await expect(page.locator('#folder-agent-copy')).toBeEnabled();
    expect(h.session).toBe(oldFolder);
    await page.locator('#folder-agent-copy').click();
    await page.screenshot({path:info.outputPath('claude-centered-wait.png')});
    watcher=spawn('python3',[path.join(h.session,'folder-agent.py'),'watch','--minutes','1'],{stdio:'ignore'});
    await expect(page.locator('#folder-agent-guide')).not.toBeVisible();
    await expect(page.locator('#folder-agent-input')).toBeFocused();
    await expect(page.locator('#editor-tab-agent')).toHaveAttribute('aria-label','Agent · Claude ready');
    await page.locator('#workspace-window-agent .workspace-window-close').click();
    await page.locator('#editor-tab-agent').click();
    await expect(page.locator('#folder-agent-input')).toBeVisible();
    await expect(page.locator('#folder-agent-guide')).not.toBeVisible();
    expect(await page.evaluate(()=>window.pickerCalls)).toBe(2);
    await disconnect(page);expect(h.errors).toEqual([]);
  }finally{watcher?.kill();await page.close();await h.cleanup();}
});

test('Claude activity streams before the final answer and remains visible without duplicate or executable text',async({page},info)=>{
  const h=await setup(page);let watcher;
  try{
    await page.locator('#welcome-agent').click();await expect(page.locator('#folder-agent-guide')).toBeVisible();await page.locator('#folder-agent-setup-mode-embedded').click();
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
    await page.locator('#welcome-agent').click();await expect(page.locator('#folder-agent-guide')).toBeVisible();await page.locator('#folder-agent-setup-mode-embedded').click();
    await chooseFolder(page);
    await expect(page.locator('#folder-agent-instructions')).toHaveValue(/Monitor/);
    const before=await h.read('session.json'),instructions=await readFile(path.join(h.session,'CONNECT.md'),'utf8');
    const savedSource=(await h.read('state.json')).source;
    await closeGuide(page);await h.listen();await page.locator('#folder-agent-input').fill('Keep this conversation for folder Resume');await page.locator('#folder-agent-send').click();
    const request=await publishedRequest(h,'Keep this conversation for folder Resume');
    h.run('reply','--request',request.id,'--text','The saved folder conversation is ready to continue.');
    await expect(page.locator('#folder-agent-messages')).toContainText('The saved folder conversation is ready to continue.');
    h.run('prepare');
    const skillFile=path.join(h.session,'authoring/.claude/skills/hld-to-page/SKILL.md');
    await writeFile(skillFile,'Stale skill: use the old API');
    await writeFile(path.join(h.session,'authoring/docs/agent-operations.md'),'Stale operation guidance');
    // Model an old kit explicitly; current source-free kits have no workbench sources.
    await mkdir(path.join(h.session,'authoring/src/workbench'),{recursive:true});
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
    const guide='docs/folder-agent-existing-edit.md';
    expect(await readFile(path.join(h.session,'CONNECT.md'),'utf8')).toContain('/authoring/'+guide+' first');
    expect(await readFile(path.join(h.session,'authoring',guide),'utf8')).toBe(await readFile(path.join(root,guide),'utf8'));
    await expect(readFile(path.join(h.session,'authoring/docs/agent-operations.md'))).rejects.toMatchObject({code:'ENOENT'});
    await expect(readFile(path.join(h.session,'authoring/src/workbench/agent-operations.js'))).rejects.toMatchObject({code:'ENOENT'});
    await disconnect(page);
    await page.evaluate(()=>window.resumeFolder=null);h.failNextWrite('CONNECT.md');
    await resumeFolder(page);
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
    await page.locator('#welcome-agent').click();await expect(page.locator('#folder-agent-guide')).toBeVisible();await page.locator('#folder-agent-setup-mode-embedded').click();
    await chooseFolder(page);await expect(page.locator('#folder-agent-copy')).toBeEnabled();await expect(page.locator('#folder-agent-send')).toBeDisabled();
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
    await connectExternal(page);await page.locator('#folder-agent-input').fill('Keep this draft while I inspect');
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
    await win.locator('.workspace-window-close').click();await expect(win).toBeHidden();
    await page.locator('#editor-tab-agent').click();await expect(page.locator('#folder-agent-input')).toHaveValue('Keep this draft while I inspect');
    expect((await win.boundingBox()).width).toBeCloseTo(moved.width,0);
    await canvasTools(page);await page.locator('#workspace-panels').click();await expect(win).toBeHidden();await expect(page.locator('#workspace-window-inspect')).toBeHidden();
    const canvas=await page.locator('#workspace-canvas').boundingBox();expect(canvas).toEqual({x:0,y:0,...page.viewportSize()});
    await canvasTools(page);await page.locator('#workspace-panels').click();await expect(win).toBeVisible();await expect(page.locator('#src')).toHaveValue(before);
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
    await canvasTools(page);await page.locator('#workspace-panels').click();await page.locator('#workspace-fit').click();
    const canvas=page.locator('.workspace-active-section .explore-board');
    await expectWorkbenchCanvas(page);
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

test('agent context hides until pairing and names the selection and freezes it beside the sent message',async({page})=>{
  const h=await setup(page);
  try{
    await page.locator('#welcome-paste').click();await page.locator('#welcome-json').fill(source);await page.locator('#welcome-paste-form button[type=submit]').click();
    await page.locator('[data-dv-node="a"]').first().click();await page.locator('#editor-tab-agent').click();
    await expect(page.locator('#folder-agent-context')).toBeHidden();
    await chooseFolder(page);await expect(page.locator('#folder-agent-copy')).toBeEnabled();await expect(page.locator('#folder-agent-send')).toBeDisabled();
    await closeGuide(page);await h.listen();await page.locator('#folder-agent-input').fill('Explain this');await page.locator('#folder-agent-send').click();
    await expect(page.locator('#folder-agent-send')).toBeDisabled();
    const request=await publishedRequest(h,'Explain this');expect(request.selection[0].label).toBe('Doorbell');
    await page.locator('.folder-agent-sent-context summary').click();await expect(page.locator('.folder-agent-sent-context')).toContainText('Doorbell');
    await page.locator('#workspace-window-agent .workspace-window-close').click();await page.locator('[data-dv-node="b"]').first().click();
    h.run('progress','--request',request.id,'--text','Reading the selected doorbell.');
    await expect(page.locator('#editor-tab-agent')).toHaveAttribute('aria-label','Agent · Claude working');
    await page.locator('#editor-tab-agent').click();
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
    await canvasTools(page);await page.locator('#workspace-panels').click();
    await page.locator('button[data-layout-id="technical"]').click();
    await expect(page.locator('button[data-layout-id="technical"]')).toHaveAttribute('aria-pressed','true');
    await page.locator('#workspace-fit').click();
    await chooseAddDestination(page,'1');
    await expectWorkbenchCanvas(page);
    await expect(page.locator('[data-dv-node="customer"]')).toBeInViewport();
    await expect(page.locator('[data-dv-node="a"]')).toBeHidden();
    await expect(page.locator('.workspace-active-section .explore-player')).toBeVisible();
    await chooseAddDestination(page,'0');
    await expect(page.locator('button[data-layout-id="technical"]')).toHaveAttribute('aria-pressed','true');
    await page.locator('#workspace-zoom-out').click();
    const camera=()=>page.locator('.workspace-active-section .explore-board').evaluate(el=>({x:el.scrollLeft,y:el.scrollTop,zoom:el.style.getPropertyValue('--explore-width')}));
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));const prior=await camera();
    await page.locator('#editor-tab-json').click();
    await page.locator('#src').fill(input.replace('"Backend"','"Customer support"'));await page.locator('#go').click();
    await expect(page.locator('[data-dv-node="b"]')).toContainText('Customer support');
    expect(await camera()).toEqual(prior);
    await page.locator('#workspace-window-json .workspace-window-close').click();
    await page.locator('#workspace-appearance>summary').click();
    await page.locator('#open-page-preview').click();
    await expect(page.locator('#page-preview')).toBeVisible();
    await expect(page.locator('#page-preview .viewer-diagram-canvas>.explore-stage')).toBeVisible();
    await page.locator('#page-preview .explore-navigation').getByRole('button',{name:'Delivery',exact:true}).click();
    await expect(page.locator('#page-preview .viewer-diagram-canvas')).toContainText('Customer support');
    await page.locator('#close-page-preview').click();
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
    async function send(text){await h.listen();await page.locator('#folder-agent-input').fill(text);await page.locator('#folder-agent-send').click();return publishedRequest(h,text);}
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
    await page.locator('#welcome-agent').click();await expect(page.locator('#folder-agent-guide')).toBeVisible();
    await page.screenshot({path:info.outputPath('build-workflows.png')});
    await expect(page.locator('#editor-agent')).toBeVisible();
    await expect(page.locator('.folder-agent-prerequisites')).toContainText('Copy/paste does not start Monitor or a background watcher.');
    await page.locator('#folder-agent-connect').click();await expect(page.locator('#folder-agent-copy')).toBeEnabled();
    expect((await h.read('session.json')).workflow).toBe('external');
    await page.locator('#folder-agent-copy').click();
    await expect(page.locator('#folder-agent-guide')).not.toBeVisible();await expect(page.locator('#editor-agent')).toBeVisible();
    await openAgent(page);await expect(page.locator('#editor-agent [role=tab]')).toHaveCount(0);
    await expect(page.locator('#folder-agent-send')).toHaveText('Copy request');expect((await h.read('session.json')).workflow).toBe('external');
    expect(await page.evaluate(()=>window.pickerCalls)).toBe(1);
    await copyRequest(page,'Build the delivery story. Reference: docs/delivery.md');
    const copied=await page.evaluate(()=>navigator.clipboard.readText()),request=await h.read('request.json');
    expect(copied).toContain(request.id);expect(copied).toContain('docs/delivery.md');expect(request.delivery).toBe('clipboard');expect(request.replySurface).toBe('agent');
    await page.locator('#folder-agent-send').click();expect((await h.read('request.json')).id).toBe(request.id);
    const base=await h.read('state.json');await writeFile(path.join(h.session,'candidate.spec.json'),source);
    await writeFile(path.join(h.session,'candidate.ledger.md'),'# Coverage ledger\n\nThis trial changes the requested node title and preserves unrelated story behavior.\n');
    h.run('propose','--ledger','candidate.ledger.md','--request',request.id,'--revision',base.revision,'--file','candidate.spec.json','--summary','Delivery story');
    await expect(page.locator('#agent-update-open')).toBeVisible();await expect(page.locator('#src')).toHaveValue(base.source);
    await expect(page.locator('#folder-agent-stage')).toHaveText('Ready for your review');
    await expect(page.locator('#folder-agent-review-accept')).toBeVisible();
    await expect(page.locator('#folder-agent-messages')).toBeHidden();
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
    await expect.poll(async()=>{const result=await h.read('result.json');return result.requestId===followup.id && result.status==='applied';}).toBe(true);
    await openAgent(page);
    await expect(page.locator('#folder-agent-change-history')).not.toHaveAttribute('open','');
    await page.locator('#folder-agent-change-history>summary').click();
    await page.locator('#folder-agent-change-history [data-receipt-action="undo"]').last().click();
    await expect(page.locator('#src')).toHaveValue(human);
    expect(h.errors).toEqual([]);
  }finally{watcher?.kill();native?.kill();await page.close();await h.cleanup();}
});

test('copy and paste Explore review keeps comparison, ledger and commit reachable',async({page},info)=>{
  const h=await setup(page);
  try{
    await page.context().grantPermissions(['clipboard-read','clipboard-write'],{origin});
    const raw=JSON.parse(source),diagram=raw.page.blocks[0].diagram;
    diagram.layouts.push({...structuredClone(diagram.layouts[0]),id:'explore',name:'Explore',presentation:'explore'});
    delete diagram.layouts[1].steps;
    diagram.defaultLayout='explore';
    const original=JSON.stringify(raw,null,2);
    await page.locator('#welcome-paste').click();await page.locator('#welcome-json').fill(original);
    await page.locator('#welcome-paste-form button[type=submit]').click();
    await connectExternal(page);await copyRequest(page,'Rename Backend to Delivery service.');
    const request=await h.read('request.json'),state=await h.read('state.json');
    diagram.nodes.b.title='Delivery service';const proposed=JSON.stringify(raw,null,2);
    const ledger='# Coverage ledger\n\n'+('The service name changed; the story and paths are preserved.\n'.repeat(100));
    await writeFile(path.join(h.session,'candidate.spec.json'),proposed);
    await writeFile(path.join(h.session,'candidate.ledger.md'),ledger);
    h.run('propose','--request',request.id,'--revision',state.revision,'--file','candidate.spec.json','--ledger','candidate.ledger.md','--summary','Rename the service in Explore');
    await page.locator('#agent-update-open').click();
    const view=page.locator('#agent-update-view'),stage=view.locator('.explore-stage');
    async function contained(supporting=true){
      await expect(stage).toBeVisible();
      const area=await page.locator('#agent-update-scroll').boundingBox(),canvas=await stage.boundingBox();
      expect(canvas.x).toBeGreaterThanOrEqual(area.x);expect(canvas.y).toBeGreaterThanOrEqual(area.y);
      expect(canvas.x+canvas.width).toBeLessThanOrEqual(area.x+area.width+1);
      expect(canvas.y+canvas.height).toBeLessThanOrEqual(area.y+area.height+1);
      expect(canvas.height).toBeGreaterThan(200);
      for(const id of ['close','current','proposed','commit'].concat(supporting?['ledger-summary']:[])){
        await expect(page.locator('#agent-update-'+id)).toBeInViewport();
        await page.locator('#agent-update-'+id).click({trial:true});
      }
    }
    await page.screenshot({path:info.outputPath('explore-review.png')});await contained();
    await expect(view.locator('[data-dv-node="b"]')).toContainText('Delivery service');
    await expect(view.locator('[data-dv-node="b"]')).toHaveAttribute('data-agent-change','modified');
    await expect(page.locator('#agent-update-change-status')).toContainText('1 modified');
    await expect(page.locator('#agent-update-highlights')).toHaveAttribute('aria-pressed','true');
    await page.locator('#agent-update-highlights').click();await expect(view).not.toHaveAttribute('data-agent-highlights','');
    await expect(view.locator('[data-dv-node="b"]')).not.toHaveAttribute('data-agent-change');
    await page.locator('#agent-update-highlights').click();await expect(view.locator('[data-dv-node="b"]')).toHaveAttribute('data-agent-change','modified');
    const standardStage=await stage.boundingBox();await page.locator('#agent-update-immersive').click();
    await expect(page.locator('#agent-update-dialog')).toHaveClass(/agent-update-immersive/);
    const fullDialog=await page.locator('#agent-update-dialog').boundingBox(),viewport=page.viewportSize();
    expect(fullDialog).toEqual({x:0,y:0,width:viewport.width,height:viewport.height});await expect(page.locator('#agent-update-note')).toBeHidden();
    await expect.poll(async()=> (await stage.boundingBox()).height).toBeGreaterThan(standardStage.height);
    for(const id of ['close','current','proposed','highlights','immersive','discard','commit'])await expect(page.locator('#agent-update-'+id)).toBeInViewport();
    await contained(false);await page.locator('#agent-update-immersive').click();await expect(page.locator('#agent-update-dialog')).not.toHaveClass(/agent-update-immersive/);
    await view.locator('.explore-legend-menu>summary').click();
    await expect(view.getByRole('group',{name:'Edge legend',exact:true}).locator('.li')).toBeVisible();
    await page.keyboard.press('Escape');await expect(page.locator('#agent-update-dialog')).toBeVisible();
    await expect(view.getByRole('group',{name:'Edge legend',exact:true})).toBeHidden();
    await expect(page.locator('#src')).toHaveValue(original);await expect(page.locator('#undo-builder')).toBeDisabled();
    const zoom=view.locator('.explore-zoom'),beforeZoom=await zoom.innerText();
    await view.getByRole('button',{name:'Zoom in',exact:true}).click();await expect(zoom).not.toHaveText(beforeZoom);
    await view.getByRole('button',{name:'Fit diagram',exact:true}).click();
    await view.getByRole('button',{name:'Next step',exact:true}).click();
    await expect(view.locator('.stepline')).toContainText('Recording ready');
    await view.locator('.path-chip[data-dv-path="failed"]').click();await expect(view.locator('.stepline')).toContainText('Exact hidden failure');
    await view.locator('.path-chip[data-dv-path="happy"]').click();
    await view.locator('.explore-panel-menu summary').click();await view.getByRole('button',{name:'Hide panels',exact:true}).click();await expect(view.locator('.explore-window:visible')).toHaveCount(0);
    await view.getByRole('button',{name:'Restore panels',exact:true}).click();await expect(view.locator('.explore-window:visible')).toHaveCount(1);
    const collapsed=await stage.boundingBox();
    await page.locator('#agent-update-ledger-summary').click();await expect(page.locator('#agent-update-ledger')).toBeVisible();
    await contained();expect((await stage.boundingBox()).height).toBeLessThan(collapsed.height);
    await page.locator('#agent-update-current').click();await expect(view.locator('[data-dv-node="b"]')).toContainText('Backend');
    await expect(view.locator('[data-dv-node="b"]')).toHaveAttribute('data-agent-change','modified');await expect(page.locator('#agent-update-change-status')).toContainText('1 modified');
    await expect(page.locator('#agent-update-commit')).toBeDisabled();
    await page.locator('#agent-update-proposed').click();await contained();
    await page.locator('#agent-update-ledger-summary').click();
    await view.getByRole('button',{name:'Business',exact:true}).click();await expect(stage).toBeHidden();
    await expect(view.locator('[data-dv-node="b"]')).toBeVisible();
    await view.getByRole('button',{name:'Explore',exact:true}).click();await contained();
    await page.locator('#agent-update-close').click();await expect(page.locator('#agent-update-dialog')).not.toBeVisible();
    await expect(page.locator('#src')).toHaveValue(original);await expect(page.locator('body')).not.toHaveClass(/viewer-exploring/);
    await page.locator('#agent-update-open').click();await contained();
    await page.screenshot({path:info.outputPath('explore-review-ready.png')});
    await page.setViewportSize({width:640,height:800});await contained();
    await view.locator('.explore-legend-menu>summary').click();
    await expect(view.getByRole('group',{name:'Edge legend',exact:true}).locator('.li')).toBeInViewport();
    await page.screenshot({path:info.outputPath('explore-review-narrow.png')});
    await page.keyboard.press('Escape');await expect(page.locator('#agent-update-dialog')).toBeVisible();
    await page.setViewportSize({width:1440,height:1000});
    await page.locator('#agent-update-commit').click();await expect(page.locator('#src')).toHaveValue(proposed);
    await expect.poll(async()=>{try{return (await h.read('result.json')).status;}catch{return null;}}).toBe('applied');
    await expect(page.locator('body')).not.toHaveClass(/viewer-exploring/);
    await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);
    await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(proposed);
    expect(h.errors).toEqual([]);
  }finally{await page.close();await h.cleanup();}
});

test('copy and paste treats the folder as connected without Monitor and keeps conversation output out of the panel',async({page},info)=>{
  const h=await setup(page);
  try{
    await page.context().grantPermissions(['clipboard-read','clipboard-write'],{origin});
    await page.locator('#welcome-paste').click();await page.locator('#welcome-json').fill(source);await page.locator('#welcome-paste-form button[type=submit]').click();
    await openAgent(page);await expect(page.locator('#folder-agent-stage')).toHaveText('No shared folder connected');
    await page.locator('#folder-agent-open-setup').click();await page.locator('#folder-agent-connect').click();await expect(page.locator('#folder-agent-copy')).toBeEnabled();await closeGuide(page);
    expect((await h.read('session.json')).workflow).toBe('external');
    await expect(page.locator('#folder-agent-stage')).toHaveText('Shared folder ready');
    await expect(page.locator('#editor-tab-agent')).toHaveAttribute('aria-label','Agent · Shared folder ready');
    await expect(page.locator('.folder-agent-history-frame')).toBeHidden();
    const compact=await page.evaluate(()=>({header:document.querySelector('.folder-agent-header').getBoundingClientRect().bottom,composer:document.querySelector('.folder-agent-composer').getBoundingClientRect().top}));
    expect(Math.abs(compact.composer-compact.header)).toBeLessThan(2);
    await copyRequest(page,'Explain this selected flow in our agent conversation');const request=await h.read('request.json');
    await expect(page.locator('#folder-agent-stage')).toHaveText('Request active · Continue in your agent');
    h.run('progress','--request',request.id,'--text','Only the native conversation needs this detailed progress.');
    await expect(page.locator('#folder-agent-activity')).toBeHidden();await expect(page.locator('#folder-agent-messages')).toBeHidden();
    await expect(page.locator('.folder-agent-history-frame')).toBeHidden();
    await page.screenshot({path:info.outputPath('copy-paste-connected-compact.png')});
    await expect(page.locator('#editor-agent [role=tab]')).toHaveCount(0);
    await expect(page.locator('#folder-agent-stage')).toHaveText('Request active · Continue in your agent');
    await expect(page.locator('#folder-agent-activity-log li')).toHaveCount(0);
    await expect(page.locator('#folder-agent-messages article')).toHaveCount(0);
    await expect(page.locator('#folder-agent-latest')).toBeHidden();
    expect((await h.read('request.json')).id).toBe(request.id);
    h.run('reply','--request',request.id,'--text','This final answer belongs in the native conversation.');
    await expect(page.locator('#folder-agent-stage')).toHaveText('Shared folder ready');
    await expect(page.locator('#folder-agent-panel-status')).toHaveText('Request finished. Continue in your agent.');
    await expect(page.locator('#folder-agent-send')).toBeEnabled();
    await expect(page.locator('.folder-agent-history-frame')).toBeHidden();
    await expect(page.locator('#folder-agent-input')).toHaveValue('Explain this selected flow in our agent conversation');
    // Folder I/O failures still surface, and recovering access restores readiness.
    h.readGate(async()=>{throw Error('Test folder temporarily unavailable');});
    await expect(page.locator('#folder-agent-stage')).toHaveText('Folder access needs attention');
    h.readGate(null);await expect(page.locator('#folder-agent-stage')).toHaveText('Shared folder ready');
    await expect(page.locator('#folder-agent-panel-status')).toHaveText('Folder access restored. Continue in your agent.');
    await disconnect(page);await expect(page.locator('#folder-agent-stage')).toHaveText('No shared folder connected');
    expect(h.errors).toEqual([]);
  }finally{h.readGate(null);await page.close();await h.cleanup();}
});

test('conflicting update preserves local edits and copies actionable feedback for the agent',async({page},info)=>{
  const h=await setup(page);
  try{
    await page.context().grantPermissions(['clipboard-read','clipboard-write'],{origin});
    await page.locator('#welcome-paste').click();await page.locator('#welcome-json').fill(source);await page.locator('#welcome-paste-form button[type=submit]').click();
    await page.locator('#editor-tab-agent').click();await chooseFolder(page);await closeGuide(page);
    await h.listen();await page.locator('#folder-agent-input').fill('Rename the camera');await page.locator('#folder-agent-send').click();const request=await publishedRequest(h,'Rename the camera'),base=await h.read('state.json');
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

test('Connected Agent reuses current node, step and panel selection and preserves one draft',async({page},info)=>{
  const h=await setup(page);
  try{
    await page.context().grantPermissions(['clipboard-read','clipboard-write'],{origin});
    const spec=JSON.parse(source),diagram=spec.page.blocks[0].diagram;
    diagram.nodes.a.codeRefs=[{id:'capture',repository:'https://github.com/example/camera',path:'capture.js',revision:'a'.repeat(40),anchor:{start:'// capture:start',end:'// capture:end'}}];
    const input=JSON.stringify(spec,null,2);await page.locator('#welcome-paste').click();await page.locator('#welcome-json').fill(input);await page.locator('#welcome-paste-form button[type=submit]').click();
    await expect(page.locator('#agent-message-open')).toHaveCount(0);await expect(page.locator('#agent-message-dialog')).toHaveCount(0);
    await page.locator('[data-dv-node="a"]').click();await openAgent(page);
    await expect(page.locator('#folder-agent-input')).toBeHidden();
    await connectExternal(page);await expect(page.locator('#editor-agent [role=tab]')).toHaveCount(0);
    await expect(page.locator('#folder-agent-context')).toContainText('Doorbell');
    await page.locator('#folder-agent-input').fill('Explain the selected item. docs/design.md');
    await expect(page.locator('#folder-agent-context')).toContainText('Doorbell');
    await expect(page.locator('#folder-agent-input')).toHaveValue('Explain the selected item. docs/design.md');
    await copyRequest(page,'Explain the selected item. docs/design.md');
    let copied=await page.evaluate(()=>navigator.clipboard.readText());expect(copied).toContain('capture.js');expect(copied).toMatch(/"kind":\s*"node"/);expect(copied).not.toContain(input);expect(copied).not.toContain('"rows"');
    await page.locator('#workspace-window-agent .workspace-window-close').click();
    await page.locator('#editor-tab-steps').click();await page.locator('#steps-list [data-step-index="1"]').click();
    await page.locator('#workspace-window-steps .workspace-window-close').click();await openAgent(page);
    await expect(page.locator('#folder-agent-context')).toContainText('step');
    await finishCopiedRequest(page,h);
    await expect(page.locator('#folder-agent-input')).toHaveValue('Explain the selected item. docs/design.md');await copyRequest(page,'Explain the selected item. docs/design.md');
    copied=await page.evaluate(()=>navigator.clipboard.readText());expect(copied).toMatch(/"kind":\s*"step"/);expect(copied).toMatch(/"steps",\s*1/);
    await page.locator('#workspace-window-agent .workspace-window-close').click();
    if(await page.locator('#workspace-window-inspect').isVisible())await page.locator('#workspace-window-inspect .workspace-window-close').click();
    await page.locator('#docview [data-dv-panel="0"] .ptitle').first().click();await openAgent(page);
    await finishCopiedRequest(page,h);await expect(page.locator('#folder-agent-context')).toContainText('Home');await copyRequest(page,'Explain the selected item. docs/design.md');
    copied=await page.evaluate(()=>navigator.clipboard.readText());expect(copied).toMatch(/"kind":\s*"panel"/);expect(copied).toMatch(/"panels",\s*0/);
    expect(await page.evaluate(()=>window.pickerCalls)).toBe(1);
    await page.screenshot({path:info.outputPath('unified-agent-copy.png')});

    await page.setViewportSize({width:640,height:360});
    for(const id of ['folder-agent-input','folder-agent-send']){
      const control=page.locator('#'+id);await control.scrollIntoViewIfNeeded();
      expect(await control.evaluate(node=>{const r=node.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return hit===node || node.contains(hit);}),id+' reachable at short height').toBe(true);
    }
    await page.screenshot({path:info.outputPath('unified-agent-short.png')});
    await page.setViewportSize({width:430,height:920});expect(await page.locator('#editor-agent').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
    await expect(page.locator('#src')).toHaveValue(input);await expect(page.locator('#undo-builder')).toBeDisabled();
    expect(h.errors).toEqual([]);
  }finally{await page.close();await h.cleanup();}
});

test('Copy for agent copies the canvas selection directly and preserves the draft and workflow',async({page},info)=>{
  const h=await setup(page);
  try{
    await page.context().grantPermissions(['clipboard-read','clipboard-write'],{origin});
    await page.locator('#welcome-paste').click();await page.locator('#welcome-json').fill(source);await page.locator('#welcome-paste-form button[type=submit]').click();
    const quick=page.locator('#folder-agent-selection');await expect(quick).toBeHidden();
    await connectExternal(page);await page.locator('#workspace-window-agent .workspace-window-close').click();
    await page.locator('#docview [data-dv-node="a"]').click();
    if(await page.locator('#workspace-window-inspect').isVisible())await page.locator('#workspace-window-inspect .workspace-window-close').click();
    await expect(quick).toHaveText('Copy for agent · 1 selected');await quick.click();
    await expect(quick).toHaveText('Copied · 1 selected');await expect(page.locator('#editor-agent')).toBeHidden();
    let copied=await page.evaluate(()=>navigator.clipboard.readText());
    expect(copied).toContain('Selection context only');expect(copied).toMatch(/"nodes",\s*"a"/);expect(copied).not.toContain(source);
    await page.locator('#docview [data-dv-node="b"]').click({modifiers:['Shift']});
    await expect(quick).toHaveText('Copy for agent · 2 selected');await quick.focus();await page.keyboard.press('Enter');
    copied=await page.evaluate(()=>navigator.clipboard.readText());expect(copied).toMatch(/"nodes",\s*"a"/);expect(copied).toMatch(/"nodes",\s*"b"/);
    await openAgent(page);await page.locator('#folder-agent-input').fill('Keep this unfinished request private.');
    await page.locator('#workspace-window-agent .workspace-window-close').click();
    await quick.click();await expect(quick).toHaveText('Copied · 2 selected');
    expect(await page.evaluate(()=>navigator.clipboard.readText())).not.toContain('Keep this unfinished request private.');
    await expect(page.locator('#editor-agent')).toBeHidden();
    await page.setViewportSize({width:640,height:360});await quick.scrollIntoViewIfNeeded();
    expect(await quick.evaluate(node=>{const r=node.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===node;})).toBe(true);
    await page.screenshot({path:info.outputPath('copy-for-agent-selection.png')});
    await page.setViewportSize({width:1280,height:900});await openAgent(page);
    await expect(page.locator('#folder-agent-send')).toHaveText('Copy request');
    await expect(page.locator('#folder-agent-input')).toHaveValue('Keep this unfinished request private.');
    await expect(page.locator('#src')).toHaveValue(source);await expect(page.locator('#undo-builder')).toBeDisabled();
    expect(await page.evaluate(()=>window.pickerCalls)).toBe(1);expect(h.errors).toEqual([]);
  }finally{await page.close();await h.cleanup();}
});

test('Copy for agent opens manual copy only on denial and retires a late fallback after source replacement',async({page})=>{
  const h=await setup(page);
  try{
    await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>Promise.reject(Error('denied'))}}));
    await page.locator('#welcome-paste').click();await page.locator('#welcome-json').fill(source);await page.locator('#welcome-paste-form button[type=submit]').click();
    await connectExternal(page);await page.locator('#workspace-window-agent .workspace-window-close').click();
    await page.locator('#docview [data-dv-node="a"]').click();await page.locator('#folder-agent-selection').click();
    const preview=page.getByRole('textbox',{name:'Selected context for agent',exact:true});
    await expect(preview).toBeVisible();await expect(preview).toBeFocused();
    expect(await preview.inputValue()).toMatch(/"nodes",\s*"a"/);expect(await preview.inputValue()).not.toContain(source);
    expect(await preview.evaluate(node=>node.selectionEnd-node.selectionStart)).toBe((await preview.inputValue()).length);
    await expect(page.locator('#folder-agent-input')).toHaveValue('');
    await page.locator('#folder-agent-copy-back').click();await page.locator('#workspace-window-agent .workspace-window-close').click();
    await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:()=>new Promise((resolve,reject)=>{window.rejectSelectionCopy=reject;})}}));
    await page.locator('#folder-agent-selection').click();await expect.poll(()=>page.evaluate(()=>!!window.rejectSelectionCopy)).toBe(true);
    await page.locator('#editor-tab-json').click();const next=source.replace('Browser contract','Replacement draft');
    await page.locator('#src').fill(next);await page.locator('#go').click();
    await page.evaluate(()=>window.rejectSelectionCopy(Error('late denial')));
    await expect(page.locator('#folder-agent-copy-preview')).toBeHidden();await expect(page.locator('#editor-agent')).toBeHidden();
    await expect(page.locator('#src')).toHaveValue(next);expect(h.errors).toEqual([]);
  }finally{await page.close();await h.cleanup();}
});

test('Copy for agent keeps an existing shared-folder request intact',async({page})=>{
  const h=await setup(page);
  try{
    await page.context().grantPermissions(['clipboard-read','clipboard-write'],{origin});
    await page.locator('#welcome-paste').click();await page.locator('#welcome-json').fill(source);await page.locator('#welcome-paste-form button[type=submit]').click();
    await openAgent(page);await page.locator('#folder-agent-open-setup').click();await page.locator('#folder-agent-connect').click();
    await expect(page.locator('#folder-agent-copy')).toBeEnabled();await page.locator('#folder-agent-copy').click();
    await copyRequest(page,'Keep this request active.');const request=await h.read('request.json'),manifest=await h.read('session.json');
    await page.locator('#workspace-window-agent .workspace-window-close').click();await page.locator('#docview [data-dv-node="a"]').click();
    await page.locator('#folder-agent-selection').click();await expect(page.locator('#folder-agent-selection')).toHaveText('Copied · 1 selected');
    const copied=await page.evaluate(()=>navigator.clipboard.readText());
    expect(copied).toContain(manifest.connectionId);expect(copied).toContain('.flowview-agent/CONNECT.md');
    expect(copied).toContain('Selection context only');expect(copied).not.toContain(request.id);expect(copied).not.toContain('Keep this request active.');
    expect(await h.read('request.json')).toEqual(request);await expect(page.locator('#editor-agent')).toBeHidden();
    await openAgent(page);await expect(page.locator('#folder-agent-input')).toHaveValue('Keep this request active.');
    await expect(page.locator('#folder-agent-cancel')).toBeVisible();expect(h.errors).toEqual([]);
  }finally{await page.close();await h.cleanup();}
});

test('clipboard failure offers manual copy and invalid source cannot create context',async({page},info)=>{
  const h=await setup(page);
  try{
    await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:()=>Promise.reject(Error('denied'))}}));
    await page.locator('#welcome-paste').click();await page.locator('#welcome-json').fill(source);await page.locator('#welcome-paste-form button[type=submit]').click();
    await connectExternal(page);await page.locator('#folder-agent-input').fill('Review this.');await page.locator('#folder-agent-send').click();
    await expect(page.locator('#folder-agent-panel-status')).toContainText('Ctrl+C');
    const preview=page.locator('#folder-agent-copy-preview');await expect(preview).toBeVisible();await expect(preview).toHaveAttribute('readonly','');
    expect(await preview.evaluate(el=>el.selectionEnd-el.selectionStart)).toBe((await preview.inputValue()).length);
    expect(await preview.inputValue()).not.toContain(source);expect(await preview.inputValue()).not.toContain('"rows"');
    for(const width of [1051,1050,900,801,800,768,640,390])for(let cycle=0;cycle<2;cycle++){
      await page.setViewportSize({width,height:360});
      await expect(page.locator('#folder-agent-working')).toBeVisible();await expect(page.locator('#folder-agent-working')).toHaveAccessibleName(/Open Agent/);
      for(const selector of ['#workbench-home','#workspace-home','#workspace-file','#diagram-add','#undo-builder','#redo-builder','#workspace-appearance>summary','#folder-agent-working','.workspace-help>summary','#workspace-export-trigger']){
        const control=await page.locator(selector).evaluate(node=>{const r=node.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {inside:r.left>=0 && r.right<=innerWidth && r.top>=0 && r.bottom<=innerHeight,reachable:hit===node || node.contains(hit),left:+r.left.toFixed(1),right:+r.right.toFixed(1),width:+r.width.toFixed(1)};});
        expect(control,selector+' while Agent is active at '+width+'px').toMatchObject({inside:true,reachable:true});
      }
      if(!await preview.isVisible())await page.locator('#folder-agent-send').click();
      await expect(preview).toBeVisible();await preview.focus();
      await page.screenshot({path:info.outputPath('unified-agent-short-copy-fallback-'+width+'-'+cycle+'.png')});
      expect(await preview.evaluate(node=>{const r=node.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return hit===node || node.contains(hit);}), 'manual copy remains reachable at short height').toBe(true);
      const windowRect=await page.locator('#workspace-window-agent').boundingBox();
      await page.locator('#folder-agent-copy-back').click();await expect(preview).toBeHidden();
      await expect(page.locator('#folder-agent-input')).toHaveValue('Review this.');await expect(page.locator('#folder-agent-input')).toBeFocused();
      expect(await page.locator('#folder-agent-send').evaluate(node=>{const r=node.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return hit===node || node.contains(hit);}), 'Copy request remains reachable after returning to draft').toBe(true);
      for(const id of ['#folder-agent-input','#workspace-canvas-tools>summary'])expect(await page.locator(id).evaluate(node=>{const r=node.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return hit===node || node.contains(hit);}),id+' remains reachable alongside Copy request').toBe(true);
      expect(await page.locator('#workspace-window-agent').boundingBox()).toEqual(windowRect);
      await page.screenshot({path:info.outputPath('unified-agent-short-return-draft-'+width+'-'+cycle+'.png')});
    }
    await page.setViewportSize({width:1280,height:900});
    await page.locator('#workspace-window-agent .workspace-window-close').click();await page.locator('#editor-tab-json').click();await page.locator('#src').fill('{');
    await page.locator('#workspace-window-json .workspace-window-close').click();await openAgent(page);
    await expect(page.locator('#folder-agent-send')).toBeDisabled();
    expect(h.errors).toEqual([]);
  }finally{await page.close();await h.cleanup();}
});

test('a late denied copy cannot reveal an old project or steal focus after file replacement',async({page})=>{
  const h=await setup(page);
  try{
    await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:()=>new Promise((resolve,reject)=>{window.rejectCopy=reject;})}}));
    await page.locator('#welcome-paste').click();await page.locator('#welcome-json').fill(source);await page.locator('#welcome-paste-form button[type=submit]').click();
    await connectExternal(page);await page.locator('#folder-agent-input').fill('Old project draft');await page.locator('#folder-agent-send').click();
    await page.waitForFunction(()=>typeof window.rejectCopy==='function');
    const replacement=source.replace('Browser contract','Replacement project');
    await page.locator('#file-input').setInputFiles({name:'replacement.spec.json',mimeType:'application/json',buffer:Buffer.from(replacement)});
    await expect(page.locator('#folder-agent-input')).toHaveValue('');
    await page.locator('#editor-tab-json').focus();await page.evaluate(()=>window.rejectCopy(Error('denied')));
    await expect(page.locator('#folder-agent-copy-preview')).toBeHidden();await expect(page.locator('#editor-tab-json')).toBeFocused();
    await expect(page.locator('#src')).toHaveValue(replacement);expect(h.errors).toEqual([]);
  }finally{await page.close();await h.cleanup();}
});

test('connected Copy preserves a large message while registering a bounded native request',async({page})=>{
  const h=await setup(page);
  try{
    await page.context().grantPermissions(['clipboard-read','clipboard-write'],{origin});
    await page.locator('#welcome-agent').click();
    await page.locator('#folder-agent-connect').click();await expect(page.locator('#folder-agent-copy')).toBeEnabled();await page.locator('#folder-agent-copy').click();
    await openAgent(page);
    const long='Read this complete pasted context. '+('Reference detail. '.repeat(1400))+' END OF MESSAGE';
    await copyRequest(page,long);
    const request=await h.read('request.json'),copied=await page.evaluate(()=>navigator.clipboard.readText());
    expect(request.text.length).toBeLessThanOrEqual(16000);expect(request.delivery).toBe('clipboard');
    expect(copied).toContain(request.id);expect(copied).toContain(long);
    await page.locator('#folder-agent-send').click();expect((await h.read('request.json')).id).toBe(request.id);
    h.run('reply','--request',request.id,'--text','Ready for the next request.');
    await expect.poll(async()=> (await h.read('transcript.json')).messages.at(-1).role).toBe('assistant');
    const priorSource=await page.locator('#src').inputValue(),large=JSON.parse(priorSource);large.page.blocks[0].text='Complete evidence. '.repeat(1000)+'SOURCE END';const largeSource=JSON.stringify(large,null,2);
    await page.locator('#workspace-window-agent .workspace-window-close').click();await page.locator('#editor-tab-json').click();await page.locator('#src').fill(largeSource);await page.locator('#go').click();
    await expect.poll(async()=>(await h.read('state.json')).source).toBe(largeSource);
    await page.locator('#workspace-window-json .workspace-window-close').click();await copyRequest(page,'Review the full source.');
    const largeRequest=await h.read('request.json'),fullCopy=await page.evaluate(()=>navigator.clipboard.readText());
    expect(largeRequest.id).not.toBe(request.id);expect(largeRequest.text.length).toBeLessThanOrEqual(16000);
    expect(fullCopy).toContain('Review the full source.');expect(fullCopy).toContain(largeRequest.id);
    expect(fullCopy).not.toContain('SOURCE END');expect(fullCopy).not.toContain('Complete evidence.');
    expect(fullCopy.length).toBeLessThan(3000);
    expect((await h.read('state.json')).source).toBe(largeSource);
    // A valid published request's named pair is exactly its Workbench pair, read between matching states.
    const project=await h.read('project.json'),owner=await h.read('session.json'),stateBefore=await h.read('state.json');
    expect(project).toMatchObject({version:1,spec:expect.any(String),ledger:expect.any(String)});
    const pair={source:await readFile(path.join(h.folder,project.spec),'utf8'),ledger:await readFile(path.join(h.folder,project.ledger),'utf8')};
    const stateAfter=await h.read('state.json'),active={sessionId:largeRequest.sessionId,connectionId:largeRequest.connectionId,revision:largeRequest.revision};
    expect(active).toEqual({sessionId:owner.sessionId,connectionId:owner.connectionId,revision:expect.any(String)});
    expect(largeRequest.revision).not.toBe(request.revision);
    for(const state of [stateBefore,stateAfter]){
      expect({sessionId:state.sessionId,connectionId:state.connectionId,revision:state.revision}).toEqual(active);
      expect(pair).toEqual({source:state.source,ledger:state.ledger ?? ''});
    }
    expect(priorSource).not.toBe(largeSource);expect(pair.source).toBe(largeSource);

    expect(h.errors).toEqual([]);
  }finally{await page.close();await h.cleanup();}
});

test('diagram folder opens an existing named pair without metadata and reviews ledger-only changes with paired Undo',async({page},info)=>{
  const h=await setup(page);
  const beforeLedger='# Coverage ledger\n\nExisting evidence and decisions.\n';
  const afterLedger='# Coverage ledger\n\nExisting evidence and decisions.\n\nReviewed: the same diagram needs no spec change.\n'+Array.from({length:500},(_,i)=>'Evidence '+i+': verified against the source and retained for review.').join('\n')+'\n';
  try{
    await writeFile(path.join(h.folder,'payments.spec.json'),source);
    await writeFile(path.join(h.folder,'payments.ledger.md'),beforeLedger);
    await page.locator('#welcome-agent').click();
    await page.locator('#folder-agent-start-adopt').click();
    await page.locator('#folder-agent-connect').click();await expect(page.locator('#folder-agent-copy')).toBeEnabled();
    await expect(page.locator('#src')).toHaveValue(source);
    expect(path.basename(h.session)).toBe('.flowview-agent');
    expect((await h.read('session.json')).artifacts).toMatchObject({spec:'payments.spec.json',ledger:'payments.ledger.md'});
    expect(await readFile(path.join(h.folder,'README.md'),'utf8')).toBe('Existing agent project notes.');
    await closeGuide(page);await page.context().grantPermissions(['clipboard-read','clipboard-write']);
    await copyRequest(page,'Record the reviewed evidence in the ledger.');
    const request=await h.read('request.json'),state=await h.read('state.json');
    await writeFile(path.join(h.session,'candidate.spec.json'),source);await writeFile(path.join(h.session,'candidate.ledger.md'),afterLedger);
    h.run('propose','--request',request.id,'--revision',state.revision,'--file','candidate.spec.json','--ledger','candidate.ledger.md','--summary','Review evidence without changing the diagram');
    await page.locator('#agent-update-open').click();await expect(page.locator('#agent-update-ledger')).toHaveText(afterLedger.trim());
    await expect(page.locator('#agent-update-ledger')).toBeHidden();
    await expect(page.locator('#agent-update-ledger-summary')).toHaveText('Coverage ledger · Changed in this update');
    const collapsed=await page.locator('#agent-update-scroll').boundingBox();
    await page.screenshot({path:info.outputPath('ledger-collapsed-preview.png')});
    await page.locator('#agent-update-ledger-summary').focus();await page.keyboard.press('Enter');
    await expect(page.locator('#agent-update-ledger')).toBeVisible();
    const expanded=await page.locator('#agent-update-scroll').boundingBox(),ledger=await page.locator('#agent-update-ledger').boundingBox();
    expect(expanded.height).toBeLessThan(collapsed.height);expect(expanded.height).toBeGreaterThan(200);
    expect(ledger.height).toBeLessThanOrEqual(page.viewportSize().height*.24+1);
    await page.locator('#agent-update-ledger').focus();await page.keyboard.press('PageDown');
    await expect.poll(()=>page.locator('#agent-update-ledger').evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
    await page.mouse.move(ledger.x+ledger.width-3,ledger.y+ledger.height-3);await page.mouse.down();await page.mouse.move(ledger.x+ledger.width-3,ledger.y+ledger.height-63,{steps:5});await page.mouse.up();
    await expect.poll(async()=> (await page.locator('#agent-update-ledger').boundingBox()).height).toBeLessThan(ledger.height-30);
    expect(await readFile(path.join(h.folder,'payments.ledger.md'),'utf8')).toBe(beforeLedger);
    await page.locator('#agent-update-current').click();await expect(page.locator('#agent-update-ledger')).toHaveText(beforeLedger.trim());
    await expect(page.locator('#agent-update-ledger')).toBeVisible();
    await expect(page.locator('#agent-update-ledger-summary')).toHaveText('Coverage ledger · Current state');
    await page.locator('#agent-update-proposed').click();await page.screenshot({path:info.outputPath('paired-diagram-ledger-preview.png')});
    await expect(page.locator('#agent-update-ledger')).toHaveText(afterLedger.trim());
    await page.setViewportSize({width:640,height:600});
    await page.locator('#agent-update-ledger-summary').focus();await page.keyboard.press('Enter');
    await expect(page.locator('#agent-update-ledger')).toBeHidden();
    await expect(page.locator('#agent-update-commit')).toBeInViewport();
    await page.screenshot({path:info.outputPath('ledger-collapsed-narrow-preview.png')});
    await page.setViewportSize({width:1440,height:1000});
    await page.locator('#agent-update-commit').click();await expect.poll(async()=>{try{return (await h.read('result.json')).status;}catch{return null;}}).toBe('applied');
    await expect.poll(()=>readFile(path.join(h.folder,'payments.ledger.md'),'utf8')).toBe(afterLedger);
    const handwritten=source.replace('Doorbell','Handwritten after approval');await page.locator('#editor-tab-json').click();await page.locator('#src').fill(handwritten);await page.locator('#editor-tab-json').focus();
    await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(source);await expect.poll(()=>readFile(path.join(h.folder,'payments.ledger.md'),'utf8')).toBe(beforeLedger);
    await page.locator('#redo-builder').click();await expect.poll(()=>readFile(path.join(h.folder,'payments.ledger.md'),'utf8')).toBe(afterLedger);
    expect(await readFile(path.join(h.folder,'payments.spec.json'),'utf8')).toBe(handwritten);
    await page.locator('#editor-tab-agent').click();await disconnect(page);
    const outside=source.replace('Doorbell','Outside edit');await writeFile(path.join(h.folder,'payments.spec.json'),outside);
    await resumeFolder(page);await expect(page.locator('#folder-agent-copy')).toBeEnabled();await expect(page.locator('#src')).toHaveValue(outside);
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
    await page.locator('#editor-tab-agent').click();await disconnect(page);await resumeFolder(page);await expect(page.locator('#folder-agent-copy')).toBeEnabled();await expect(page.locator('#src')).toHaveValue(outside);
    expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('dv-workbench-draft')).ledger)).toBe(afterLedger);
    expect(h.errors).toEqual([]);
  }finally{await page.close();await h.cleanup();}
});

test('seeded candidate pair is edited in place, proposed, previewed, committed and undone through real files',async({page})=>{
  const h=await setup(page);let native;
  const beforeLedger='# Coverage ledger\n\nDoorbell evidence is reviewed.\n',afterLedger=beforeLedger+'\nRenamed Doorbell to Seeded doorbell at the user’s request.\n';
  try{
    await writeFile(path.join(h.folder,'payments.spec.json'),source);await writeFile(path.join(h.folder,'payments.ledger.md'),beforeLedger);
    await page.locator('#welcome-agent').click();await expect(page.locator('#folder-agent-guide')).toBeVisible();
    await expect(page.locator('#folder-agent-setup-mode-external')).toHaveAttribute('aria-pressed','true');
    await page.locator('#folder-agent-start-adopt').click();
    await page.locator('#folder-agent-connect').click();await expect(page.locator('#folder-agent-copy')).toBeEnabled();
    await closeGuide(page);await page.context().grantPermissions(['clipboard-read','clipboard-write']);
    await copyRequest(page,'Rename the doorbell.');
    const request=await h.read('request.json'),state=await h.read('state.json'),candidate=request.candidate;
    expect(candidate).toEqual({spec:`candidate-${request.id}.spec.json`,ledger:`candidate-${request.id}.ledger.md`,baseRevision:state.revision});
    expect(request.revision).toBe(state.revision);
    // Copy request delivers the seeded files with the short existing-edit guide.
    const copied=await page.evaluate(()=>navigator.clipboard.readText());
    expect(copied).toContain(request.id);expect(copied).toContain(JSON.stringify(candidate.spec));expect(copied).toContain(JSON.stringify(candidate.ledger));
    const connect=await readFile(path.join(h.session,'CONNECT.md'),'utf8'),guide='docs/folder-agent-existing-edit.md';
    expect(connect).toContain('/authoring/'+guide+' first');expect(connect).toContain('request.candidate names them');
    expect(connect).not.toMatch(/hld-to-page\/SKILL\.md|docs\/folder-agent-session\.md/);
    h.run('prepare');expect(await readFile(path.join(h.session,'authoring',guide),'utf8')).toBe(await readFile(path.join(root,guide),'utf8'));
    const seeded=await readFile(path.join(h.session,candidate.spec),'utf8');
    expect(seeded).toBe(source);expect(await readFile(path.join(h.session,candidate.ledger),'utf8')).toBe(beforeLedger);
    // One targeted edit to each seeded copy, then the unchanged propose command.
    const edited=seeded.replace('"Doorbell"','"Seeded doorbell"');expect(edited).not.toBe(seeded);
    await writeFile(path.join(h.session,candidate.spec),edited);await writeFile(path.join(h.session,candidate.ledger),afterLedger);
    h.run('propose','--request',request.id,'--revision',candidate.baseRevision,'--file',candidate.spec,'--ledger',candidate.ledger,'--summary','Rename the doorbell');
    await page.locator('#agent-update-open').click();await expect(page.locator('#agent-update-view')).toContainText('Seeded doorbell');
    await expect(page.locator('#src')).toHaveValue(source);
    expect(await readFile(path.join(h.folder,'payments.spec.json'),'utf8')).toBe(source);expect(await readFile(path.join(h.folder,'payments.ledger.md'),'utf8')).toBe(beforeLedger);
    await page.locator('#agent-update-commit').click();await expect.poll(async()=>{try{return (await h.read('result.json')).status;}catch{return null;}}).toBe('applied');
    await expect(page.locator('#src')).toHaveValue(edited);
    await expect.poll(()=>readFile(path.join(h.folder,'payments.spec.json'),'utf8')).toBe(edited);
    await expect.poll(()=>readFile(path.join(h.folder,'payments.ledger.md'),'utf8')).toBe(afterLedger);
    h.run('reply','--request',request.id,'--text','Renamed the doorbell.');await expect(page.locator('#folder-agent-send')).toBeEnabled();
    await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(source);
    await expect.poll(()=>readFile(path.join(h.folder,'payments.spec.json'),'utf8')).toBe(source);
    await expect.poll(()=>readFile(path.join(h.folder,'payments.ledger.md'),'utf8')).toBe(beforeLedger);
    // A native begin request is seeded from the current saved pair the same way.
    native=spawn('python3',[path.join(h.session,'folder-agent.py'),'begin','--text','Check the doorbell'],{stdio:['ignore','pipe','pipe']});
    let output='',failure='';native.stdout.on('data',d=>output+=d);native.stderr.on('data',d=>failure+=d);
    expect(await new Promise(resolve=>native.on('close',resolve)),failure).toBe(0);
    const begun=await h.read('request.json'),current=await h.read('state.json');
    expect(begun.id).toBe(JSON.parse(output).id);expect(begun.delivery).toBe('native');
    expect(begun.candidate).toEqual({spec:`candidate-${begun.id}.spec.json`,ledger:`candidate-${begun.id}.ledger.md`,baseRevision:begun.revision});
    expect(begun.revision).toBe(current.revision);
    expect(await readFile(path.join(h.session,begun.candidate.spec),'utf8')).toBe(source);expect(await readFile(path.join(h.session,begun.candidate.ledger),'utf8')).toBe(beforeLedger);
    expect(await readFile(path.join(h.session,candidate.spec),'utf8')).toBe(edited);
    expect(h.errors).toEqual([]);
  }finally{native?.kill();await page.close();await h.cleanup();}
});

test('Beta Send delivers seeded candidates with the short existing-edit guide',async({page})=>{
  const h=await setup(page);
  try{
    await page.locator('#welcome-agent').click();await expect(page.locator('#folder-agent-guide')).toBeVisible();
    await chooseFolder(page);await h.listen();
    const connect=await readFile(path.join(h.session,'CONNECT.md'),'utf8');
    expect(connect).toContain('/authoring/docs/folder-agent-existing-edit.md first');expect(connect).toContain('request.candidate names them');expect(connect).toContain('Start Monitor');
    expect(connect).not.toMatch(/hld-to-page\/SKILL\.md|docs\/folder-agent-session\.md/);
    await closeGuide(page);await page.locator('#folder-agent-input').fill('Rename the doorbell');await page.locator('#folder-agent-send').click();
    const request=await publishedRequest(h,'Rename the doorbell'),state=await h.read('state.json');
    expect(request.delivery).not.toBe('clipboard');expect(request.revision).toBe(state.revision);
    expect(request.candidate).toEqual({spec:`candidate-${request.id}.spec.json`,ledger:`candidate-${request.id}.ledger.md`,baseRevision:state.revision});
    expect(await readFile(path.join(h.session,request.candidate.spec),'utf8')).toBe(state.source);
    expect(await readFile(path.join(h.session,request.candidate.ledger),'utf8')).toBe(state.ledger ?? '');
    const edited=state.source.replace(/"title": ?"([^"]+)"/,'"title":"Seeded $1"');expect(edited).not.toBe(state.source);
    await writeFile(path.join(h.session,request.candidate.spec),edited);await writeFile(path.join(h.session,request.candidate.ledger),'# Coverage ledger\n\nRenamed one title in the seeded copy.\n');
    h.run('propose','--request',request.id,'--revision',request.candidate.baseRevision,'--file',request.candidate.spec,'--ledger',request.candidate.ledger,'--summary','Rename from seeded copy');
    await expect(page.locator('#agent-update-open')).toBeVisible();await expect(page.locator('#src')).toHaveValue(state.source);
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
      const text='Stress update '+index;await h.listen();await page.locator('#folder-agent-input').fill(text);await page.locator('#folder-agent-send').click();
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


test('Start new clears a connected story, preserves it, and refuses to reopen its old folder',async({page},info)=>{
  const h=await setup(page);
  try{
    await page.locator('#welcome-paste').click();await page.locator('#welcome-json').fill(source);await page.locator('#welcome-paste-form button[type=submit]').click();
    await page.locator('#workspace-home').click();await page.locator('#welcome-agent').click();
    await expect(page.locator('#src')).toHaveValue(source);
    await page.locator('#folder-agent-connect').click();await expect(page.locator('#folder-agent-copy')).toBeEnabled();
    const oldSession=h.session,oldSpec=await readFile(path.join(h.folder,'story.spec.json'),'utf8');
    // Return to setup, then choose the explicit new-diagram path.
    await page.getByRole('button',{name:'Change folder',exact:true}).click();await page.locator('#folder-agent-start-new').click();await expect(page.locator('#folder-agent-start-description')).toContainText('Choose where Flowview should create');
    await expect(page.locator('#folder-agent-copy')).toBeDisabled();await expect(page.locator('#folder-agent-instructions')).toHaveValue('');
    await expect.poll(async()=>JSON.parse(await readFile(path.join(oldSession,'editor.json'),'utf8')).connected).toBe(false);
    const writes=h.writes.length;await page.locator('#folder-agent-connect').click();
    await expect(page.locator('#folder-agent-status')).toContainText('Select a new, empty diagram folder');expect(h.writes).toHaveLength(writes);
    expect(JSON.parse(await page.locator('#src').inputValue()).page.blocks[0].diagram.nodes).toEqual({});
    expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('dv-workbench-earlier-drafts')).map(d=>d.text))).toContain(source);
    expect(await readFile(path.join(h.folder,'story.spec.json'),'utf8')).toBe(oldSpec);
    await mkdir(path.join(h.folder,'fresh'));await page.evaluate(()=>window.pickPath='/fresh');await page.locator('#folder-agent-connect').click();
    await expect(page.locator('#folder-agent-copy')).toBeEnabled();
    const prompt=await page.locator('#folder-agent-instructions').inputValue();
    expect(prompt).toContain('Do not start Monitor');expect(prompt).not.toMatch(/watch --minutes|Renew Monitor|preflight --monitor/);
    expect(JSON.parse(await readFile(path.join(h.folder,'fresh/story.spec.json'),'utf8')).page.blocks[0].diagram.nodes).toEqual({});
    await page.screenshot({path:info.outputPath('fresh-agent-setup.png')});expect(h.errors).toEqual([]);
  }finally{await page.close();await h.cleanup();}
});

test('home explicitly starts new from a saved draft and Continue still restores the chosen draft',async({page},info)=>{
  const h=await setup(page);
  try{
    await page.evaluate(text=>localStorage.setItem('dv-workbench-draft',JSON.stringify({text,at:Date.now()})),source);
    await page.reload();await page.locator('#welcome-agent').click();await expect(page.locator('#src')).toHaveValue(source);
    await page.screenshot({path:info.outputPath('agent-starting-point.png')});
    await closeGuide(page);await page.locator('#workspace-home').click();await page.locator('#welcome-new').click();await page.locator('#welcome-new-agent').click();
    await expect(page.locator('#folder-agent-start-description')).toContainText('Choose where Flowview should create');
    expect(JSON.parse(await page.locator('#src').inputValue()).page.blocks[0].diagram.nodes).toEqual({});
    expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('dv-workbench-earlier-drafts')).map(d=>d.text))).toContain(source);
    // Cancelling New and explicitly choosing Continue also clears the new-folder
    // restriction when the current draft itself has not changed.
    await closeGuide(page);await page.locator('#workspace-home').click();await page.locator('#welcome-agent').click();await page.locator('#folder-agent-start-adopt').click();
    await expect(page.locator('#folder-agent-start-description')).toContainText('Choose the folder containing its existing');
    await closeGuide(page);await page.locator('#workspace-home').click();await page.locator('#welcome-earlier-drafts>summary').click();
    await page.locator('#welcome-earlier-list').getByRole('button',{name:/^Browser contract/}).first().click();
    await page.locator('#workspace-home').click();await page.locator('#welcome-agent').click();await page.locator('#folder-agent-start-adopt').click();
    await expect(page.locator('#src')).toHaveValue(source);await expect(page.locator('#folder-agent-start-description')).toContainText('Choose the folder containing its existing');
    expect(h.errors).toEqual([]);
  }finally{await page.close();await h.cleanup();}
});

test('disconnected recovery actions remain reachable in a short window',async({page})=>{
  const h=await setup(page);
  try{
    await page.locator('#welcome-paste').click();await page.locator('#welcome-json').fill(source);await page.locator('#welcome-paste-form button[type=submit]').click();
    await connectExternal(page);await disconnect(page);await page.setViewportSize({width:640,height:360});
    await expect(page.locator('#folder-agent-continue')).toBeVisible();
    for(const id of ['folder-agent-open-setup','folder-agent-continue']){
      const button=page.locator('#'+id);await button.scrollIntoViewIfNeeded();
      expect(await button.evaluate(node=>{const r=node.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return node===hit || node.contains(hit);})).toBe(true);
    }
    expect(await page.locator('.folder-agent-header').evaluate(node=>node.clientHeight)).toBeGreaterThan(100);
    expect(h.errors).toEqual([]);
  }finally{await page.close();await h.cleanup();}
});
