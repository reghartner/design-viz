import {test,expect,paste} from '../helpers/test.mjs';
import {source} from '../fixtures/editor-spec.mjs';

// Real Chromium FileSystemDirectoryHandle/FileSystemFileHandle semantics in OPFS.
// Only the user folder picker is substituted. This does not prove native picker consent.
test('a new connection and explicit resume use native buffered filesystem handles',async({page,server})=>{
  await page.addInitScript(()=>{
    window.showDirectoryPicker=async()=>{
      const root=await navigator.storage.getDirectory();
      return root;
    };
  });
  await page.goto(server.origin+'/workbench.html');await paste(page,source);await page.locator('#editor-tab-agent').click();await page.locator('#folder-agent-open-setup').click();await page.locator('#folder-agent-setup-mode-embedded').click();await page.locator('#folder-agent-connect').click();
  await expect(page.locator('#folder-agent-connection')).toHaveText('Waiting for Claude listener');
  const first=await page.evaluate(async()=>{
    const root=await navigator.storage.getDirectory(),directory=await root.getDirectoryHandle('.flowview-agent');
    const read=async name=>JSON.parse(await(await directory.getFileHandle(name)).getFile().then(file=>file.text()));
    return {manifest:await read('session.json'),state:await read('state.json')};
  });
  expect(first.state.connectionId).toBe(first.manifest.connectionId);expect(first.state.source).toBe(source);
  await page.locator('#folder-agent-close-guide').click();await page.locator('#folder-agent-pairing>summary').click();await page.locator('#folder-agent-disconnect').click();
  await page.locator('#folder-agent-open-setup').click();await page.locator('#folder-agent-start-resume').click();await expect(page.locator('#folder-agent-connect')).toBeVisible();await page.locator('#folder-agent-connect').click();
  await expect(page.locator('#folder-agent-connection')).toHaveText('Waiting for Claude listener');
  const next=await page.evaluate(async()=>{const root=await navigator.storage.getDirectory(),directory=await root.getDirectoryHandle('.flowview-agent');return JSON.parse(await(await directory.getFileHandle('session.json')).getFile().then(file=>file.text()));});
  expect(next.sessionId).toBe(first.manifest.sessionId);expect(next.connectionId).not.toBe(first.manifest.connectionId);
});

async function sessionFile(page,name){
  return page.evaluate(async name=>{
    try{const root=await navigator.storage.getDirectory(),directory=await root.getDirectoryHandle('.flowview-agent');return JSON.parse(await(await(await directory.getFileHandle(name)).getFile()).text());}
    catch(error){if(error.name==='NotFoundError' || error.name==='NotReadableError')return null;throw error;}
  },name);
}

test('desktop heartbeat and resume events stay live during a held native artifact save and retire on disconnect',async({page,server})=>{
  await page.setViewportSize({width:1440,height:900});await page.clock.install();
  await page.addInitScript(()=>{window.showDirectoryPicker=async()=>navigator.storage.getDirectory();});
  await page.goto(server.origin+'/workbench.html');await paste(page,source);
  await page.locator('#editor-tab-agent').click();await page.locator('#folder-agent-open-setup').click();await page.locator('#folder-agent-connect').click();
  await expect(page.locator('#folder-agent-copy')).toBeEnabled();await page.locator('#folder-agent-close-guide').click();
  const manifest=await sessionFile(page,'session.json');
  await page.evaluate(async owner=>{
    const root=await navigator.storage.getDirectory(),meta=await root.getDirectoryHandle('.flowview-agent'),handle=await meta.getFileHandle('agent-request.json',{create:true}),writer=await handle.createWritable();
    await writer.write(JSON.stringify({...owner,id:'background-request',text:'Keep this request while saving',expiresAt:Date.now()+90000}));await writer.close();
  },manifest);
  await expect.poll(async()=>(await sessionFile(page,'request.json'))?.id).toBe('background-request');
  await expect.poll(async()=>(await sessionFile(page,'transcript.json'))?.messages.at(-1)?.requestId).toBe('background-request');
  await page.evaluate(()=>{
    const create=FileSystemFileHandle.prototype.createWritable;
    FileSystemFileHandle.prototype.createWritable=async function(...args){
      const stream=await create.apply(this,args);
      if(this.name.endsWith('.spec.json') && !this.name.startsWith('candidate-')){
        const write=stream.write.bind(stream);stream.write=async function(value){window.saveHeld=true;await new Promise(resolve=>window.releaseSave=resolve);return write(value);};
      }
      return stream;
    };
    window.restoreFileWriter=()=>{FileSystemFileHandle.prototype.createWritable=create;};
  });
  await page.locator('#editor-tab-json').click();await page.locator('#src').fill(source.replace('Browser contract','Held background save'));
  await expect.poll(()=>page.evaluate(()=>window.saveHeld)).toBe(true);
  const initial=await sessionFile(page,'editor.json');
  await page.clock.pauseAt(new Date(await page.evaluate(()=>Date.now()+1000)));
  // Native close finishes outside the fake timer queue. Let that heartbeat
  // commit and schedule its next timer before advancing the paused clock.
  await expect.poll(async()=>(await sessionFile(page,'editor.json'))?.at).toBeGreaterThan(initial.at);
  const committed=await sessionFile(page,'editor.json');await page.clock.fastForward(20000);
  await expect.poll(async()=>(await sessionFile(page,'editor.json'))?.at).toBeGreaterThan(committed.at+15000);
  for(const event of ['focus','visibilitychange']){
    const previous=await sessionFile(page,'editor.json');await page.clock.setSystemTime(new Date(previous.at+20000));
    await page.evaluate(event=>{for(let i=0;i<5;i++)(event==='focus'?window:document).dispatchEvent(new Event(event));},event);
    await expect.poll(async()=>(await sessionFile(page,'editor.json'))?.at).toBeGreaterThan(previous.at+15000);
    const live=await sessionFile(page,'editor.json');expect(live.connected).toBe(true);expect(live.sessionId).toBe(manifest.sessionId);expect(live.connectionId).toBe(manifest.connectionId);
  }
  expect((await sessionFile(page,'request.json')).id).toBe('background-request');
  await page.evaluate(()=>{window.restoreFileWriter();window.releaseSave();});
  await page.locator('#editor-tab-agent').click();await page.locator('#folder-agent-pairing>summary').click();await page.locator('#folder-agent-disconnect').click();
  await expect.poll(async()=>(await sessionFile(page,'editor.json'))?.connected).toBe(false);
  const closed=await sessionFile(page,'editor.json');await page.clock.fastForward(20000);
  await page.evaluate(()=>{window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'));});
  expect(await sessionFile(page,'editor.json')).toEqual(closed);
});
