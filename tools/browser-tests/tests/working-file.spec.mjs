import {test,expect,paste,closeTools} from '../helpers/test.mjs';
import {source} from '../fixtures/editor-spec.mjs';

async function setup(page){
  await page.addInitScript(({source})=>{
    window.showOpenFilePicker=async()=>{
      const root=await navigator.storage.getDirectory(),handle=await root.getFileHandle('chosen.spec.json',{create:true});
      if(!(await handle.getFile()).size){const stream=await handle.createWritable();await stream.write(source);await stream.close();}
      return [handle];
    };
    window.showDirectoryPicker=async()=>navigator.storage.getDirectory();
  },{source});
}
async function disk(page,name='chosen.spec.json'){
  // OPFS may invalidate a File snapshot when the native buffered close replaces it.
  return page.evaluate(async name=>{try{const root=await navigator.storage.getDirectory();return await(await(await root.getFileHandle(name)).getFile()).text();}catch(error){if(error.name==='NotFoundError' || error.name==='NotReadableError')return null;throw error;}},name);
}
async function edit(page,text){await page.locator('#editor-tab-json').click();await page.locator('#src').fill(text);}
async function filePanel(page){await closeTools(page);await page.locator('#editor-tab-file').click();}

test('native chosen file saves handwritten and structured edits plus Undo/Redo, recovery and Home',async({page,server},info)=>{
  await page.setViewportSize({width:1440,height:900});await setup(page);await page.goto(server.origin+'/workbench.html');await page.locator('#welcome-open').click();await expect(page.locator('#src')).toHaveValue(source);
  await filePanel(page);await expect(page.locator('#workbench-working-status')).toContainText('Saved to chosen.spec.json');
  const handwritten=source.replace('Browser contract','Handwritten disk edit');await edit(page,handwritten);
  await expect.poll(()=>disk(page)).toBe(handwritten);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('dv-workbench-draft')).text)).toBe(handwritten);
  await filePanel(page);await page.screenshot({path:info.outputPath('working-file-saved.png')});
  // The real Add action publishes through session.accept, then both history actions save.
  await page.locator('#diagram-add').click();await page.locator('#add-node').click();await page.locator('#diagram-add-presets').getByRole('button',{name:'Phone',exact:true}).click();
  const structured=await page.locator('#src').inputValue();expect(structured).not.toBe(handwritten);await expect.poll(()=>disk(page)).toBe(structured);
  await page.locator('#undo-builder').click();await expect.poll(()=>disk(page)).toBe(handwritten);
  await page.locator('#redo-builder').click();await expect.poll(()=>disk(page)).toBe(structured);
  await page.locator('#workspace-home').click();await page.goBack();await expect(page.locator('#src')).toHaveValue(structured);
  const returned=structured.replace('Handwritten disk edit','After Home');await edit(page,returned);await expect.poll(()=>disk(page)).toBe(returned);
  await page.reload();await expect(page.locator('#workspace-provenance')).toHaveText('Browser only');await filePanel(page);await page.locator('#working-file-open').click();await expect(page.locator('#src')).toHaveValue(returned);
});

test('native snapshot invalidation retries exact disk bytes while persistent unreadability still fails',async({page,server})=>{
  await setup(page);await page.goto(server.origin+'/workbench.html');await page.locator('#welcome-open').click();await expect(page.locator('#src')).toHaveValue(source);
  await page.evaluate(()=>{
    const text=File.prototype.text;window.diskReadFailure='once';
    File.prototype.text=function(...args){
      if(this.name==='chosen.spec.json' && window.diskReadFailure){const mode=window.diskReadFailure;if(mode==='once')window.diskReadFailure='';return Promise.reject(new DOMException('Injected invalidated snapshot','NotReadableError'));}
      return text.apply(this,args);
    };
  });
  await expect.poll(()=>disk(page)).toBe(source);expect(await page.evaluate(()=>window.diskReadFailure)).toBe('');
  await page.evaluate(()=>{window.diskReadFailure='persistent';});let failure;
  try{await expect.poll(()=>disk(page),{timeout:500,intervals:[50]}).toBe(source);}catch(error){failure=error;}
  expect(failure).toBeTruthy();expect(String(failure)).toContain('Timeout 500ms exceeded');
  await page.evaluate(()=>{window.diskReadFailure='';});expect(await disk(page)).toBe(source);
});

test('invalid drafts remain in recovery, disk pauses and resumes; external modification produces a visible failure',async({page,server},info)=>{
  await page.setViewportSize({width:1440,height:900});await setup(page);await page.goto(server.origin+'/workbench.html');await page.locator('#welcome-open').click();
  await edit(page,'{ unfinished');await filePanel(page);await expect(page.locator('#workbench-working-status')).toHaveAttribute('data-state','paused');
  expect(await disk(page)).toBe(source);expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('dv-workbench-draft')).text)).toBe('{ unfinished');
  const valid=source.replace('Browser contract','Repaired');await edit(page,valid);await expect.poll(()=>disk(page)).toBe(valid);
  await page.evaluate(async()=>{const root=await navigator.storage.getDirectory(),handle=await root.getFileHandle('chosen.spec.json'),stream=await handle.createWritable();await stream.write('{"outside":true}');await stream.close();});
  const local=valid.replace('Repaired','Local after conflict');await edit(page,local);await filePanel(page);
  await expect(page.locator('#workbench-working-status')).toContainText('changed outside Flowview');expect(await disk(page)).toBe('{"outside":true}');
  await expect(page.locator('#workbench-recovery-status')).toContainText('saved in this browser');
  await page.screenshot({path:info.outputPath('working-file-failed.png')});
});

for(const heldStartup of [false,true])test('standalone folder preserves an unknown ledger and renews the existing lease without agent setup'+(heldStartup?' with autosave queued during startup':''),async({page,server})=>{
  if(heldStartup)await page.route('**/workbench.html',async route=>{
    // Expose only the mounted binding in this test response, never in shipped
    // code. Its real flush gives an observable completion for the held save.
    const response=await route.fetch(),html=await response.text();
    const marker="workingStatus({state:'browser',detail:workingBrowser.pickFile?";
    expect(html.split(marker)).toHaveLength(2);
    await route.fulfill({response,body:html.replace(marker,'window.workingFileTest={flush:function(){return workingFile.attached().flush();}};'+marker)});
  });
  await page.setViewportSize({width:1440,height:900});await setup(page);await page.goto(server.origin+'/workbench.html');await paste(page,source);
  const ledger='\ufeff# Handwritten coverage\r\nKeep unknown content exactly.\r\n';
  await page.evaluate(async({source,ledger})=>{const root=await navigator.storage.getDirectory();for(const [name,text] of [['actual.spec.json',source],['actual.ledger.md',ledger]]){const handle=await root.getFileHandle(name,{create:true}),stream=await handle.createWritable();await stream.write(text);await stream.close();}},{source,ledger});
  await filePanel(page);await page.locator('#working-folder-open').click();await expect(page.locator('#workbench-working-status')).toContainText('Saved to /actual.spec.json + coverage ledger');
  const changed=source.replace('Browser contract','Folder edit');await edit(page,changed);await expect.poll(()=>disk(page,'actual.spec.json')).toBe(changed);
  const bytes=await page.evaluate(async()=>{const root=await navigator.storage.getDirectory(),file=await(await root.getFileHandle('actual.ledger.md')).getFile();return Array.from(new Uint8Array(await file.arrayBuffer()));});
  expect(bytes).toEqual([...Buffer.from(ledger)]);
  const lease=await page.evaluate(async()=>{const root=await navigator.storage.getDirectory(),meta=await root.getDirectoryHandle('.flowview-agent');return JSON.parse(await(await(await meta.getFileHandle('editor.json')).getFile()).text());});expect(lease.connected).toBe(true);
  await page.locator('#editor-tab-agent').click();await expect(page.locator('#folder-agent-input')).toBeHidden();
  // Ownership moves from the standalone lease client to the agent client.
  await page.locator('#folder-agent-open-setup').click();await page.locator('#folder-agent-start-adopt').click();await page.locator('#folder-agent-connect').click();
  await expect(page.locator('#folder-agent-copy')).toBeEnabled();await expect(page.locator('#src')).toHaveValue(changed);
  await page.locator('#folder-agent-close-guide').click();await page.locator('#folder-agent-pairing>summary').click();await page.locator('#folder-agent-disconnect').click();
  await filePanel(page);await expect(page.locator('#workbench-working-status')).toContainText('Browser-only');
  if(heldStartup)await page.evaluate(()=>{
    const read=FileSystemFileHandle.prototype.getFile;
    FileSystemFileHandle.prototype.getFile=async function(...args){
      // Earlier project inspection precedes association publication. Hold only
      // the client's first session read after the destination reports Saving.
      if(this.name==='session.json' && !window.startupHeld && document.getElementById('workbench-working-status').dataset.state==='saving'){
        window.startupHeld=true;await new Promise(resolve=>window.releaseStartup=resolve);
      }
      return read.apply(this,args);
    };
  });
  await page.locator('#working-folder-open').click();
  if(heldStartup){
    await expect.poll(()=>page.evaluate(()=>window.startupHeld)).toBe(true);
    // Exercise the same save boundary used by autosave and lease renewal,
    // while retaining startup's exact source snapshot.
    await page.evaluate(()=>{window.queuedStartupSave=window.workingFileTest.flush().then(()=>({ok:true}),error=>({error:error.message}));});
    await page.evaluate(()=>window.releaseStartup());
    expect(await page.evaluate(()=>window.queuedStartupSave)).toEqual({ok:true});
  }
  await expect(page.locator('#workbench-working-status')).toContainText('Saved to');
  const reconnected=await page.evaluate(async()=>{const root=await navigator.storage.getDirectory(),meta=await root.getDirectoryHandle('.flowview-agent');return JSON.parse(await(await(await meta.getFileHandle('editor.json')).getFile()).text());});expect(reconnected.connected).toBe(true);
  // Verify the queued flush did not poison the otherwise connected lease.
  await expect(page.locator('#workbench-working-status')).toContainText('Saved to');
  const afterHandoff=changed.replace('Folder edit','After handoff');await edit(page,afterHandoff);await expect.poll(()=>disk(page,'actual.spec.json')).toBe(afterHandoff);
});

test('unsupported writable access and recovered drafts explicitly remain browser-only',async({page,server},info)=>{
  await page.addInitScript(()=>{window.showOpenFilePicker=undefined;window.showDirectoryPicker=undefined;});
  await page.goto(server.origin+'/workbench.html');await paste(page,source);await filePanel(page);
  await expect(page.locator('#workbench-working-status')).toContainText('Browser-only');await expect(page.locator('#workbench-working-status')).toContainText('Writable file access is unavailable');
  await page.screenshot({path:info.outputPath('working-file-browser-only.png')});
});


test('native file permission failure stays visible until Retry, and Saving waits for the real write',async({page,server},info)=>{
  await page.setViewportSize({width:1440,height:900});await setup(page);await page.goto(server.origin+'/workbench.html');await page.locator('#welcome-open').click();await expect(page.locator('#src')).toHaveValue(source);
  await page.evaluate(()=>{
    const create=FileSystemFileHandle.prototype.createWritable,getFile=FileSystemFileHandle.prototype.getFile;
    window.denyWorking=true;
    FileSystemFileHandle.prototype.createWritable=function(...args){
      if(this.name==='chosen.spec.json' && window.denyWorking)return Promise.reject(new DOMException('Permission revoked','NotAllowedError'));
      return create.apply(this,args);
    };
    FileSystemFileHandle.prototype.getFile=async function(...args){
      if(this.name==='chosen.spec.json' && window.holdWorking)await new Promise(resolve=>window.releaseWorkingRead=resolve);
      return getFile.apply(this,args);
    };
  });
  const changed=source.replace('Browser contract','Permission retry');await edit(page,changed);await filePanel(page);
  await expect(page.locator('#workbench-working-status')).toContainText('Permission revoked');expect(await disk(page)).toBe(source);
  await page.evaluate(()=>{window.denyWorking=false;window.holdWorking=true;});await page.locator('#working-file-retry').click();
  await expect(page.locator('#workbench-working-status')).toHaveAttribute('data-state','saving');
  await page.screenshot({path:info.outputPath('working-file-saving.png')});
  await page.evaluate(()=>{window.holdWorking=false;window.releaseWorkingRead();});
  await expect(page.locator('#workbench-working-status')).toHaveAttribute('data-state','saved');expect(await disk(page)).toBe(changed);
});

async function workingExport(page,server,single=false){
  await setup(page);await page.goto(server.origin+'/workbench.html');await paste(page,source);
  await page.evaluate(async({source,single})=>{
    const root=await navigator.storage.getDirectory();
    for(const [name,text] of [['browser-contract.spec.json',source],['browser-contract.ledger.md','\ufeff# Original ledger\r\nKeep these bytes.\r\n']]){
      const handle=await root.getFileHandle(name,{create:true}),writer=await handle.createWritable();await writer.write(text);await writer.close();
    }
    if(single)window.showOpenFilePicker=async()=>[await root.getFileHandle('browser-contract.spec.json')];
  },{source,single});
  await filePanel(page);await page.locator(single?'#working-file-open':'#working-folder-open').click();await expect(page.locator('#workbench-working-status')).toHaveAttribute('data-state','saved');
}
async function exportCurrent(page){await filePanel(page);await page.locator('#file-export').click();}
async function exported(page){await expect(page.locator('#guide')).toContainText('working artifacts verified; HTML and README exported');}

test('same working folder exports four files without rewriting raw source or its ledger, and waits for autosave',async({page,server})=>{
  await workingExport(page,server);await exportCurrent(page);await exported(page);
  expect(await disk(page,'browser-contract.spec.json')).toBe(source);expect(await disk(page,'browser-contract.html')).toContain('Browser contract');expect(await disk(page,'README.md')).toContain('Flowview project');
  await page.evaluate(()=>{
    const read=FileSystemFileHandle.prototype.getFile;
    window.holdAutosave=true;window.autosaveHeld=false;
    FileSystemFileHandle.prototype.getFile=async function(...args){if(this.name==='browser-contract.spec.json' && window.holdAutosave){window.holdAutosave=false;window.autosaveHeld=true;await new Promise(resolve=>window.releaseAutosave=resolve);}return read.apply(this,args);};
  });
  const changed=source.replace('Doorbell','Edited device');await edit(page,changed);await expect.poll(()=>page.evaluate(()=>window.autosaveHeld)).toBe(true);
  await exportCurrent(page);await page.evaluate(()=>window.releaseAutosave());await exported(page);expect(await disk(page,'browser-contract.spec.json')).toBe(changed);expect(await disk(page,'browser-contract.html')).toContain('Edited device');
});

test('active single-file export preserves unknown ledger and refuses a dirty frozen snapshot',async({page,server})=>{
  await workingExport(page,server,true);await exportCurrent(page);await exported(page);
  const bytes=await page.evaluate(async()=>{const root=await navigator.storage.getDirectory();return [...new Uint8Array(await(await(await root.getFileHandle('browser-contract.ledger.md')).getFile()).arrayBuffer())];});
  expect(bytes).toEqual([...Buffer.from('\ufeff# Original ledger\r\nKeep these bytes.\r\n')]);expect(await disk(page,'browser-contract.spec.json')).toBe(source);
  let release,entered;const held=new Promise(resolve=>entered=resolve);
  await page.route('**/template/flowview.html',async route=>{entered();await new Promise(resolve=>release=resolve);await route.continue();});
  await exportCurrent(page);await held;
  const changed=source.replace('Doorbell','Changed after export');await edit(page,changed);await expect.poll(()=>disk(page,'browser-contract.spec.json')).toBe(changed);release();
  await expect(page.locator('#guide')).toContainText('changed after Export started');expect(await disk(page,'browser-contract.spec.json')).toBe(changed);
});

test('desktop long working filename stays readable by tooltip without crowding File actions',async({page,server},info)=>{
  await page.setViewportSize({width:1280,height:720});await setup(page);await page.goto(server.origin+'/workbench.html');
  await page.evaluate(source=>{window.showOpenFilePicker=async()=>{const root=await navigator.storage.getDirectory(),handle=await root.getFileHandle('customer-delivery-production-working-document-with-a-long-name.spec.json',{create:true}),writer=await handle.createWritable();await writer.write(source);await writer.close();return [handle];};},source);
  await page.locator('#welcome-open').click();await filePanel(page);await expect(page.locator('#workspace-provenance')).toBeVisible();
  expect(await page.locator('#workspace-provenance').evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(true);await expect(page.locator('#workspace-provenance')).toHaveAttribute('title',/customer-delivery-production-working-document-with-a-long-name/);
  await expect(page.locator('#working-file-open')).toBeInViewport();await expect(page.locator('#working-folder-open')).toBeInViewport();
  expect(await page.locator('.workbench-header').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await page.screenshot({path:info.outputPath('working-file-desktop-1280.png')});
});

test('a selected file changes during opening without publishing a stale working association',async({page,server})=>{
  await setup(page);await page.goto(server.origin+'/workbench.html');
  const outside=source.replace('Browser contract','Outside during open');
  await page.evaluate(({source,outside})=>{window.showOpenFilePicker=async()=>{
    const root=await navigator.storage.getDirectory(),handle=await root.getFileHandle('chosen.spec.json',{create:true});
    const seed=await handle.createWritable();await seed.write(source);await seed.close();let reads=0;
    return [{name:handle.name,createWritable:handle.createWritable.bind(handle),getFile:async()=>{
      if(++reads===2){const stream=await handle.createWritable();await stream.write(outside);await stream.close();}
      return handle.getFile();
    }}];
  };},{source,outside});
  await page.locator('#welcome-open').click();await expect(page.locator('#welcome-file-error')).toContainText('changed while opening');
  await expect(page.locator('#workbench-welcome')).toBeVisible();expect(await disk(page)).toBe(outside);
});

for(const paired of [false,true])test(`native exclusive ${paired?'paired-folder':'single-file'} autosave blocks a competing writer at close`,async({page,server})=>{
  if(paired)await workingExport(page,server);
  else{await setup(page);await page.goto(server.origin+'/workbench.html');await page.locator('#welcome-open').click();await expect(page.locator('#src')).toHaveValue(source);}
  const name=paired?'browser-contract.spec.json':'chosen.spec.json';
  await page.evaluate(name=>{
    const create=FileSystemFileHandle.prototype.createWritable;
    FileSystemFileHandle.prototype.createWritable=async function(...args){
      const stream=await create.apply(this,args);
      if(this.name===name){
        const close=stream.close.bind(stream);
        stream.close=async()=>{window.workingCloseHeld=true;await new Promise(resolve=>window.releaseWorkingClose=resolve);return close();};
      }
      return stream;
    };
  },name);
  const changed=source.replace('Browser contract','Exclusive writer');await edit(page,changed);
  await expect.poll(()=>page.evaluate(()=>window.workingCloseHeld)).toBe(true);
  await expect(page.locator('#workbench-working-status')).toHaveAttribute('data-state','saving');expect(await disk(page,name)).toBe(source);
  // Real native handles and streams: only the first close is held. The second
  // writer must fail in the browser, even using the default siloed mode.
  const contention=await page.evaluate(async name=>{
    const root=await navigator.storage.getDirectory(),other=await root.getFileHandle(name);
    try{const stream=await other.createWritable();await stream.abort();return 'opened';}catch(error){return error.name;}
  },name);
  expect(contention).toBe('NoModificationAllowedError');expect(await disk(page,name)).toBe(source);
  await page.evaluate(()=>window.releaseWorkingClose());
  await expect(page.locator('#workbench-working-status')).toHaveAttribute('data-state','saved');expect(await disk(page,name)).toBe(changed);
});

test('an already-open native writer makes autosave fail visibly; abort and Retry preserve the baseline',async({page,server})=>{
  await setup(page);await page.goto(server.origin+'/workbench.html');await page.locator('#welcome-open').click();await expect(page.locator('#src')).toHaveValue(source);
  await page.evaluate(async()=>{
    const root=await navigator.storage.getDirectory(),handle=await root.getFileHandle('chosen.spec.json');
    window.contendingWriter=await handle.createWritable();await window.contendingWriter.write('uncommitted outside bytes');
  });
  const changed=source.replace('Browser contract','Retry after contention');await edit(page,changed);await filePanel(page);
  await expect(page.locator('#workbench-working-status')).toHaveAttribute('data-state','failed');expect(await disk(page)).toBe(source);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('dv-workbench-draft')).text)).toBe(changed);
  await page.evaluate(()=>window.contendingWriter.abort());await page.locator('#working-file-retry').click();
  await expect(page.locator('#workbench-working-status')).toHaveAttribute('data-state','saved');expect(await disk(page)).toBe(changed);
});
