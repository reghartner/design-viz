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
  const folder=await mkdtemp(path.join(tmpdir(),'flowview-browser-folder-'));let sessionFolder,failWrite;const requests=[],errors=[];
  await writeFile(path.join(folder,'README.md'),'Existing agent project notes.');
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
  await page.exposeBinding('folderDisk',async(_,operation,name,value)=>{
    const target=path.resolve(folder,'.'+name);if(!target.startsWith(folder+path.sep)&&target!==folder)throw Error('Outside test folder');
    if(operation==='mkdir'){await mkdir(target,{recursive:true});sessionFolder=target;return;}
    if(operation==='write'){if(path.basename(target)===failWrite){failWrite=null;throw Error('Test write failure');}await writeFile(target,value);return;}
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
    window.pickerCalls=0;
    window.showDirectoryPicker=async()=>{window.pickerCalls++;if(window.cancelPicker)throw new DOMException('Cancelled','AbortError');return dir(window.resumeFolder?'/'+window.resumeFolder:'');};
  });
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin!==origin)throw Error('Unexpected network: '+url.href);
    if(url.pathname==='/index.html')return route.fulfill({contentType:'text/html',body:await readFile(path.join(root,'workbench/flowspec.html'),'utf8')});
    return route.fulfill({contentType:'application/json',body:'[]'});
  });
  await page.goto(origin+'/index.html');
  return {folder,requests,errors,failNextWrite:name=>failWrite=name,get session(){return sessionFolder;},
    read:async name=>JSON.parse(await readFile(path.join(sessionFolder,name),'utf8')),
    run:(...args)=>execFileSync('python3',[path.relative(folder,path.join(sessionFolder,'folder-agent.py')),...args],{cwd:folder,encoding:'utf8'}),
    cleanup:()=>rm(folder,{recursive:true,force:true})};
}
async function closeGuide(page){
  if(await page.locator('#folder-agent-guide').isVisible())await page.locator('#folder-agent-close-guide').click();
}
async function chooseFolder(page){
  if(!await page.locator('#folder-agent-guide').isVisible())await page.locator('#folder-agent-open-setup').click();
  await page.locator('#folder-agent-connect').click();
}
async function resumeFolder(page){
  if(!await page.locator('#folder-agent-guide').isVisible())await page.locator('#folder-agent-open-setup').click();
  if(!await page.locator('#folder-agent-resume').isVisible())await page.getByText('Resume an existing exchange',{exact:true}).click();
  await page.locator('#folder-agent-resume').click();
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
    expect(prompt).toContain(JSON.stringify('./'+path.basename(h.session)));
    expect(prompt).toContain('relative to your current working directory');
    expect(prompt).toContain(manifest.sessionId);expect(prompt).toContain(manifest.connectionId);
    expect(await readFile(path.join(h.folder,'README.md'),'utf8')).toBe('Existing agent project notes.');
    await expect(page.locator('#folder-agent-context')).toContainText('a');
    await closeGuide(page);await page.locator('#folder-agent-input').fill('Tell the customer story');await page.locator('#folder-agent-send').click();
    await expect(page.locator('#folder-agent-send')).toBeDisabled();const request=await h.read('request.json');expect(request.selection[0].id).toBe('a');
    // Simulated agent asks a real protocol question; text must stay inert.
    await writeFile(path.join(h.session,'answer.txt'),'What should the customer learn? <img src=x onerror=alert(1)>');
    h.run('reply','--request',request.id,'--file','answer.txt');
    await expect(page.locator('#folder-agent-messages')).toContainText('What should the customer learn?');
    await expect(page.locator('#folder-agent-messages img')).toHaveCount(0);
    await closeGuide(page);await page.locator('#folder-agent-input').fill('They can receive camera updates.');await page.locator('#folder-agent-send').click();
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
    await page.screenshot({path:info.outputPath('folder-conversation.png')});
    await disconnect(page);await expect(page.locator('#folder-agent-connection')).toHaveText('Not connected');
    await expect.poll(async()=> (await h.read('editor.json')).connected).toBe(false);
    expect(h.errors).toEqual([]);expect(h.requests.filter(url=>!['/index.html','/starters.json','/catalog.json'].includes(new URL(url).pathname))).toEqual([]);
  }finally{await page.close();await h.cleanup();}
});
test('new-story entry, picker cancellation and unsupported browser have useful states',async({page})=>{
  const h=await setup(page);
  try{
    await page.locator('#welcome-agent').click();
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
    await page.locator('#welcome-agent').click();
    await expect(page.getByRole('dialog',{name:'Let’s connect your Claude.'})).toBeVisible();
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
    expect(h.session).not.toBe(oldFolder);
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
    await page.locator('#welcome-agent').click();
    await chooseFolder(page);await expect(page.locator('#folder-agent-copy')).toBeEnabled();
    watcher=spawn('python3',[path.join(h.session,'folder-agent.py'),'watch','--minutes','1'],{stdio:'ignore'});
    await expect(page.locator('#folder-agent-connection')).toHaveText('Claude listener active');
    await expect(page.locator('#folder-agent-guide')).not.toBeVisible();
    await closeGuide(page);await page.locator('#folder-agent-input').fill('Explain our customer story');await page.locator('#folder-agent-send').click();
    await expect(page.locator('#folder-agent-activity-title')).toHaveText('Waiting for Claude to respond');
    await expect(page.locator('#folder-agent-progress')).toContainText('has not acknowledged');
    const request=await h.read('request.json');
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


test('refused resume preserves the paired agent instructions; successful resume issues a new connection',async({page})=>{
  const h=await setup(page);
  try{
    await page.locator('#welcome-agent').click();
    await chooseFolder(page);
    await expect(page.locator('#folder-agent-instructions')).toHaveValue(/Monitor/);
    const before=await h.read('session.json'),instructions=await readFile(path.join(h.session,'CONNECT.md'),'utf8');
    await disconnect(page);
    await expect.poll(async()=> (await h.read('editor.json')).connected).toBe(false);
    await writeFile(path.join(h.session,'folder-agent.py'),'# Old helper preserved until an authorized resume');
    await page.evaluate(name=>window.resumeFolder=name,path.basename(h.session));
    await writeFile(path.join(h.session,'editor.json'),JSON.stringify({...before,connected:true,at:Date.now()}));
    await resumeFolder(page);
    await expect(page.locator('#folder-agent-status')).toContainText('still connected to another editor');
    expect(await readFile(path.join(h.session,'CONNECT.md'),'utf8')).toBe(instructions);
    expect(await readFile(path.join(h.session,'folder-agent.py'),'utf8')).toContain('# Old helper preserved');
    expect((await h.read('editor.json')).connected).toBe(true);
    expect((await h.read('session.json')).connectionId).toBe(before.connectionId);
    await writeFile(path.join(h.session,'editor.json'),JSON.stringify({...before,connected:false,at:Date.now()}));
    await resumeFolder(page);
    await expect(page.locator('#folder-agent-instructions')).toHaveValue(/selected exchange folder/);
    const after=await h.read('session.json');expect(after.sessionId).toBe(before.sessionId);expect(after.connectionId).not.toBe(before.connectionId);
    expect(await page.locator('#folder-agent-instructions').inputValue()).toContain(after.connectionId);
    expect(await readFile(path.join(h.session,'folder-agent.py'),'utf8')).toBe(await readFile(path.join(root,'tools/folder-agent.py'),'utf8'));
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

test('measure 50 file-only exchanges separately from model work',async({page},info)=>{
  test.setTimeout(90000);
  const h=await setup(page);let watcher;
  try{
    await page.locator('#welcome-agent').click();
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
    await page.locator('#welcome-paste').click();await page.locator('#welcome-json').fill(source);await page.locator('#welcome-paste-form button[type=submit]').click();
    await page.locator('#workspace-panels').click();await page.locator('#workspace-fit').click();
    const canvas=page.locator('.workspace-active-section .explore-board');
    expect(await canvas.boundingBox()).toEqual({x:0,y:0,...page.viewportSize()});
    await expect(page.locator('#docview .doc-title')).toBeHidden();
    const position=()=>canvas.evaluate(el=>({x:el.scrollLeft,y:el.scrollTop}));
    const before=await position(),node=page.locator('[data-dv-node="a"]').first(),n=await node.boundingBox();
    await page.locator('#workspace-pan').click();await page.mouse.move(n.x+10,n.y+10);await page.mouse.down();await page.mouse.move(n.x+90,n.y+70,{steps:5});await page.mouse.up();
    expect((await position()).x).toBeCloseTo(before.x-80,0);expect((await position()).y).toBeCloseTo(before.y-60,0);
    const z=await page.locator('#workspace-zoom').textContent();await page.locator('#workspace-zoom-in').click();expect(await page.locator('#workspace-zoom').textContent()).not.toBe(z);
    await page.locator('#workspace-fit').click();await expect(node).toBeInViewport();await expect(page.locator('#src')).toHaveValue(source);
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
    const request=await h.read('request.json');expect(request.selection[0].label).toBe('Doorbell');
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
    d.layouts.push({...structuredClone(d.layouts[0]),id:'technical',name:'Technical',steps:undefined});
    raw.page.blocks.push({tabs:[{label:'More',sections:[{id:'other',heading:'Other story',text:['Page preview prose'],diagram:{view:'step',nodes:{customer:{title:'Customer'},team:{title:'Team'}},rows:[['customer','team']],edges:[{from:'customer',to:'team'}],steps:[{edge:'customer->team',text:'Contact the team'}]}}]}]});
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
    await page.locator('#workspace-appearance>summary').click();await page.locator('#workspace-view').selectOption('page');
    await expect(page.locator('#docview .doc-title')).toBeVisible();
    await expect(page.locator('.workbench-diagram-canvas')).toHaveCount(0);
    await expect(page.getByRole('button',{name:'Arrange section',exact:true}).first()).toBeVisible();
    await page.locator('#workspace-view').selectOption('diagram');await page.locator('#workspace-appearance>summary').click();
    expect(await camera()).toEqual(prior);
    await expect(page.locator('#src')).toHaveValue(input.replace('"Backend"','"Customer support"'));
    await page.screenshot({path:info.outputPath('full-diagram-canvas.png')});
    expect(h.errors).toEqual([]);
  }finally{await page.close();await h.cleanup();}
});
