import {test,expect,paste,closeTools} from '../helpers/test.mjs';
import {cloudFolder} from '../helpers/cloud-folder.mjs';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {source as starter} from '../fixtures/editor-spec.mjs';
const make=(title,diagram)=>({page:{title,sections:[{id:'main',diagram}]}});
const specs={
  base:make('Base',{nodes:{api:{title:'Local shared API'},store:{title:'Local shared store'}},rows:[['api','store']],edges:[{from:'api',to:'store',label:'Persist'}],topologyExports:{core:{nodes:['api'],edges:[]},storage:{nodes:['api','store'],edges:[]}}}),
  middle:make('Middle',{topologyImports:[{spec:'base',export:['core','storage'],as:'base',nodeOverrides:{api:{style:'moss'}},edgeOverrides:{'api->store':{label:'Local persistence'}}}],topologyExports:{core:{nodes:['base::api','base::store'],edges:['base::api->base::store']}}}),
  consumer:make('Local consumer',{nodes:{local:{title:'Editable local'}},rows:[['local']],topologyImports:[{spec:'middle',export:'core',as:'shared',position:{x:450,y:150}}]})
};
const consumer=JSON.stringify(specs.consumer,null,2);
const node=page=>page.locator('#docview g.node[data-dv-node="shared::base::api"]');
async function setup(page,server){
  await page.addInitScript(()=>{window.showDirectoryPicker=async()=>{
    let root=await navigator.storage.getDirectory();
    if(window.pickNested)for(const segment of ['diagrams','team','consumer'])root=await root.getDirectoryHandle(segment);
    return root;
  };});
  await page.goto(server.origin+'/workbench.html');await paste(page,starter);
  await page.evaluate(async specs=>{
    const root=await navigator.storage.getDirectory();
    async function write(dir,name,text){const file=await dir.getFileHandle(name,{create:true}),stream=await file.createWritable();await stream.write(text);await stream.close();}
    await write(root,'canon.json',JSON.stringify({version:1,diagrams:Object.keys(specs).map(id=>({folder:'diagrams/team/'+id,owner:'group:default/local'}))}));
    for(const [id,spec] of Object.entries(specs)){let dir=root;for(const segment of ['diagrams','team',id])dir=await dir.getDirectoryHandle(segment,{create:true});await write(dir,id+'.spec.json',JSON.stringify(spec,null,2));}
  },specs);
}
async function filePanel(page){await closeTools(page);await page.locator('#editor-tab-file').click();}
async function choose(page){await filePanel(page);await page.locator('#working-folder-open').click();await page.locator('dialog[open] select').selectOption('diagrams/team/consumer/consumer.spec.json');await page.locator('dialog[open]').getByRole('button',{name:'Open',exact:true}).click();}
async function disk(page,id='consumer'){return page.evaluate(async id=>{let dir=await navigator.storage.getDirectory();for(const segment of ['diagrams','team',id])dir=await dir.getDirectoryHandle(segment);return (await(await dir.getFileHandle(id+'.spec.json')).getFile()).text();},id);}

async function writeDisk(page,id,text){await page.evaluate(async({id,text})=>{let dir=await navigator.storage.getDirectory();for(const segment of ['diagrams','team',id])dir=await dir.getDirectoryHandle(segment);const stream=await(await dir.getFileHandle(id+'.spec.json')).createWritable();await stream.write(text);await stream.close();},{id,text});}
async function refresh(page){await filePanel(page);await page.locator('#local-sources-refresh').click();}
test('local repository imports render offline and retain editable positions, source, Undo and recovered frozen providers',async({page,server},info)=>{
  await page.setViewportSize({width:1440,height:900});await setup(page,server);
  const provider=await disk(page,'base'),middle=await disk(page,'middle');const requests=[];page.on('request',request=>requests.push(request.url()));
  await choose(page);await expect(node(page)).toBeVisible();await expect(page.locator('#src')).toHaveValue(consumer);
  await expect(page.locator('#docview g.node[data-dv-node="shared::base::store"]')).toBeVisible();
  await expect(page.locator('#docview path.edge')).toHaveCount(1);
  expect(await disk(page,'middle')).toBe(middle);
  await expect(page.locator('#workbench-working-status')).toContainText('Saved to consumer/consumer.spec.json');expect(requests).toEqual([]);
  await closeTools(page);const card=node(page).locator('.card');await node(page).hover();const box=await card.boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+65,box.y+box.height/2+50,{steps:10});await page.mouse.up();
  const edited=await page.locator('#src').inputValue();expect(edited).not.toBe(consumer);
  const diagram=JSON.parse(edited).page.sections[0].diagram;expect(diagram.topologyImports[0].nodePositions['base::api']).toBeDefined();expect(diagram.topologyProvenance).toBeUndefined();
  await expect.poll(()=>disk(page)).toBe(edited);expect(await disk(page,'base')).toBe(provider);
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(consumer);await expect.poll(()=>disk(page)).toBe(consumer);
  await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(edited);await expect.poll(()=>disk(page)).toBe(edited);
  const snapshot=await page.evaluate(()=>JSON.parse(localStorage.getItem('dv-workbench-draft')).topologyContext);
  expect(snapshot.local).toBe(true);expect(snapshot.specs.map(spec=>spec.page.canon.id)).toEqual(['base','middle','consumer']);
  const providerChanged=JSON.parse(provider);providerChanged.page.sections[0].diagram.nodes.api.title='Saved provider update';
  await writeDisk(page,'base',JSON.stringify(providerChanged));await refresh(page);
  await expect(page.locator('#local-sources-status')).toContainText('Local sources refreshed');await expect(node(page)).toContainText('Saved provider update');await expect(page.locator('#src')).toHaveValue(edited);
  const accepted=await page.evaluate(()=>JSON.parse(localStorage.getItem('dv-workbench-draft')).topologyContext);
  expect(accepted.specs[0].page.sections[0].diagram.nodes.api.title).toBe('Saved provider update');
  const rendered=await node(page).elementHandle();await refresh(page);await expect(page.locator('#local-sources-status')).toContainText('No provider changes');expect(await rendered.evaluate(el=>el.isConnected)).toBe(true);
  // Undo/Redo uses captured snapshots even when provider files change again.
  await writeDisk(page,'base','{}');await page.locator('#undo-builder').click();await expect(node(page)).toContainText('Local shared API');await expect(page.locator('#src')).toHaveValue(edited);
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(consumer);
  await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(edited);await page.locator('#redo-builder').click();await expect(node(page)).toContainText('Saved provider update');
  await page.screenshot({path:info.outputPath('local-repository-edit.png')});
  // Later disk revisions cannot silently refresh the frozen recovered context.
  await page.evaluate(async()=>{let dir=await navigator.storage.getDirectory();for(const part of ['diagrams','team','base'])dir=await dir.getDirectoryHandle(part);const stream=await(await dir.getFileHandle('base.spec.json')).createWritable();await stream.write('{}');await stream.close();});
  await page.reload();await expect(page.locator('#src')).toHaveValue(edited);await expect(node(page)).toContainText('Saved provider update');
  await filePanel(page);await expect(page.locator('#local-sources-refresh')).toHaveText('Reconnect local sources…');await expect(page.locator('#local-sources-status')).toContainText('snapshot works offline');
  await page.locator('#local-sources-refresh').click();await expect(page.locator('#local-sources-status')).toContainText('Refresh failed:');await expect(node(page)).toContainText('Saved provider update');
  await expect(page.locator('#local-sources-refresh')).toHaveText('Reconnect local sources…');providerChanged.page.sections[0].diagram.nodes.api.title='Reconnected provider';await writeDisk(page,'base',JSON.stringify(providerChanged));await page.locator('#local-sources-refresh').click();await expect(node(page)).toContainText('Reconnected provider');await expect(page.locator('#src')).toHaveValue(edited);await expect(page.locator('#local-sources-refresh')).toHaveText('Refresh local sources');
});

test('nested folder diagnostics and late local provider reads preserve the current document',async({page,server})=>{
  // No local root has been granted yet, so ordinary-folder adoption may consult
  // the deployed catalog. It has no copy of these local providers.
  await page.route('**/diagrams.json',route=>route.fulfill({json:{version:3,diagrams:[]}}));
  await setup(page,server);await page.evaluate(()=>{window.pickNested=true;});await filePanel(page);await page.locator('#working-folder-open').click();
  await expect(page.locator('#guide')).toContainText('Choose the repository root containing canon.json');await expect(page.locator('#src')).toHaveValue(starter);
  await page.evaluate(()=>{
    window.pickNested=false;
    const read=FileSystemFileHandle.prototype.getFile;
    FileSystemFileHandle.prototype.getFile=async function(...args){if(this.name==='base.spec.json' && !window.providerHeld){window.providerHeld=true;await new Promise(resolve=>window.releaseProvider=resolve);}return read.apply(this,args);};
  });
  await choose(page);await expect.poll(()=>page.evaluate(()=>window.providerHeld)).toBe(true);
  await page.locator('#workspace-home').click();await page.evaluate(()=>window.releaseProvider());
  await expect(page.locator('#welcome-home')).toBeVisible();await expect(page.locator('#src')).toHaveValue(starter);
  expect(await page.evaluate(async()=>{let root=await navigator.storage.getDirectory();for(const part of ['diagrams','team','consumer'])root=await root.getDirectoryHandle(part);try{await root.getDirectoryHandle('.flowview-agent');return true;}catch{return false;}})).toBe(false);
  expect(await disk(page)).toBe(consumer);
});

test('agent folder connection retains the granted repository root and writes the selected diagram folder',async({page,server})=>{
  await setup(page,server);await page.locator('#editor-tab-agent').click();await page.locator('#folder-agent-open-setup').click();await page.locator('#folder-agent-start-adopt').click();await page.locator('#folder-agent-connect').click();
  await page.locator('#folder-agent-file-picker').selectOption('diagrams/team/consumer/consumer.spec.json');await page.locator('#folder-agent-file-confirm').click();
  await expect(page.locator('#folder-agent-copy')).toBeEnabled();await expect(page.locator('#src')).toHaveValue(consumer);await expect(node(page)).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>new Promise(resolve=>{
    const request=indexedDB.open('flowview-folder-recovery',1);request.onerror=()=>resolve(false);
    request.onsuccess=()=>{const db=request.result,read=db.transaction('handles').objectStore('handles').get('last');read.onsuccess=async()=>{db.close();try{await read.result.handle.getFileHandle('canon.json');resolve(true);}catch{resolve(false);}};};
  }))).toBe(true);
  expect(await disk(page)).toBe(consumer);
  const changed=structuredClone(specs.base);changed.page.sections[0].diagram.nodes.api.title='Agent root refresh';await writeDisk(page,'base',JSON.stringify(changed));await page.locator('#folder-agent-guide').evaluate(el=>el.close());await refresh(page);await expect(node(page)).toContainText('Agent root refresh');
});

test('empty registry preserves an ordinary folder and nested imports reuse the existing frozen providers',async({page,server})=>{
  await setup(page,server);await choose(page);await expect(node(page)).toBeVisible();
  await expect(page.locator('#workbench-working-status')).toContainText('Saved to consumer/consumer.spec.json');
  const requests=[];page.on('request',request=>requests.push(request.url()));
  await page.evaluate(()=>{window.pickNested=true;});await filePanel(page);await page.locator('#working-folder-open').click();
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('dv-workbench-draft')).topologyContext?.ephemeral)).toBe(true);
  await expect(page.locator('#workbench-working-status')).toContainText('Saved to consumer/consumer.spec.json');await expect(node(page)).toBeVisible();
  await expect(page.locator('#src')).toHaveValue(consumer);expect(requests).toEqual([]);
  // A newly requested provider cannot be filled from the deployed library when
  // the current document owns a frozen local context.
  await page.evaluate(async()=>{
    let dir=await navigator.storage.getDirectory();for(const segment of ['diagrams','team','consumer'])dir=await dir.getDirectoryHandle(segment);
    const handle=await dir.getFileHandle('consumer.spec.json'),raw=JSON.parse(await(await handle.getFile()).text());
    raw.page.sections[0].diagram.topologyImports[0].spec='outside-frozen-closure';
    const stream=await handle.createWritable();await stream.write(JSON.stringify(raw));await stream.close();
  });
  await filePanel(page);await page.locator('#working-folder-open').click();
  await expect(page.locator('#guide')).toContainText('frozen local repository snapshot is missing');
  await expect(page.locator('#src')).toHaveValue(consumer);expect(requests).toEqual([]);
  await page.evaluate(async source=>{
    const root=await navigator.storage.getDirectory();window.pickNested=false;
    for(const [name,text] of [['canon.json','{"version":1,"diagrams":[]}'],['ordinary.spec.json',source]]){
      const stream=await(await root.getFileHandle(name,{create:true})).createWritable();await stream.write(text);await stream.close();
    }
  },starter);
  await filePanel(page);await page.locator('#working-folder-open').click();
  await expect(page.locator('#workbench-working-status')).toContainText('Saved to /ordinary.spec.json');await expect(page.locator('#src')).toHaveValue(starter);
});

test('refresh preserves current handwritten imports, every overlay and ledger; invalid and removed identities retain last preview',async({page,server})=>{
 await page.setViewportSize({width:1440,height:900});await setup(page,server);
 await page.evaluate(async()=>{let dir=await navigator.storage.getDirectory();for(const part of ['diagrams','team','consumer'])dir=await dir.getDirectoryHandle(part);const stream=await(await dir.getFileHandle('consumer.ledger.md',{create:true})).createWritable();await stream.write('# Exact ledger\r\nKeep evidence.\n');await stream.close();});
 await choose(page);await expect(node(page)).toBeVisible();const previous=await page.evaluate(()=>JSON.parse(localStorage.getItem('dv-workbench-draft')));
 const draft=structuredClone(specs.consumer),imp=draft.page.sections[0].diagram.topologyImports[0];
 Object.assign(imp,{nodeTracking:{'base::api':{tickets:['API-10']}},edgeTracking:{'base::api->base::store':{tickets:['API-11']}},nodeOverrides:{'base::api':{style:'teal'}},edgeOverrides:{'base::api->base::store':{label:'My connection'}},nodePositions:{'base::api':{x:450,y:150}},nodeCodeRefs:{'base::api':[{id:'local',repository:'https://github.com/example/service',path:'src/api.js',revision:'a'.repeat(40),anchor:{start:'start',end:'end'}}]}});
 const exact=' \n'+JSON.stringify(draft,null,2)+'\n';await closeTools(page);await page.locator('#editor-tab-json').click();await page.locator('#src').fill(exact);
 const changed=structuredClone(specs.base);changed.page.sections[0].diagram.nodes.api.title='New provider with my overlays';await writeDisk(page,'base',JSON.stringify(changed));await refresh(page);
 await expect(page.locator('#local-sources-status')).toContainText('Local sources refreshed');await expect(node(page)).toContainText('New provider with my overlays');await expect(page.locator('#src')).toHaveValue(exact);
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('dv-workbench-draft')));expect(saved.ledger).toBe(previous.ledger);expect(saved.ledger).toBe('# Exact ledger\r\nKeep evidence.\n');
 const context=saved.topologyContext;await writeDisk(page,'base','{half-written');await refresh(page);await expect(page.locator('#local-sources-status')).toContainText('Refresh failed:');await expect(node(page)).toContainText('New provider with my overlays');await expect(page.locator('#src')).toHaveValue(exact);expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('dv-workbench-draft')).topologyContext)).toEqual(context);
 const removed=structuredClone(specs.middle);removed.page.sections[0].diagram.topologyExports.core.nodes=['base::store'];removed.page.sections[0].diagram.topologyExports.core.edges=[];await writeDisk(page,'base',JSON.stringify(changed));await writeDisk(page,'middle',JSON.stringify(removed));await refresh(page);await expect(page.locator('#local-sources-status')).toContainText('nodePositions identity is not selected/exported: base::api');await expect(node(page)).toContainText('New provider with my overlays');await expect(page.locator('#src')).toHaveValue(exact);
 await closeTools(page);await page.locator('#editor-tab-json').click();await page.locator('#src').fill('{ handwritten invalid');await refresh(page);await expect(page.locator('#local-sources-status')).toContainText('Repair the consumer JSON');await expect(page.locator('#src')).toHaveValue('{ handwritten invalid');await expect(node(page)).toContainText('New provider with my overlays');
});

test('refresh retires a delayed provider read after source changes or leaving the project',async({page,server})=>{
 await setup(page,server);await choose(page);await expect(node(page)).toBeVisible();
 await page.evaluate(()=>{const read=FileSystemFileHandle.prototype.getFile;FileSystemFileHandle.prototype.getFile=async function(...args){if(this.name==='base.spec.json' && !window.providerHeld){window.providerHeld=true;await new Promise(resolve=>window.releaseProvider=resolve);}return read.apply(this,args);};});
 await refresh(page);await expect.poll(()=>page.evaluate(()=>window.providerHeld)).toBe(true);
 await closeTools(page);await page.locator('#editor-tab-json').click();const exact=consumer+'\n';await page.locator('#src').fill(exact);await page.evaluate(()=>window.releaseProvider());await expect(page.locator('#local-sources-status')).toContainText('document or repository changed');await expect(page.locator('#src')).toHaveValue(exact);await expect(node(page)).toContainText('Local shared API');
 await page.evaluate(()=>{window.providerHeld=false;});await refresh(page);await expect.poll(()=>page.evaluate(()=>window.providerHeld)).toBe(true);await page.locator('#workspace-home').click();await page.evaluate(()=>window.releaseProvider());await expect(page.locator('#welcome-home')).toBeVisible();await expect(page.locator('#src')).toHaveValue(exact);
});

// Disk-backed native handles let the exact generated Python helper communicate
// with the production browser poller. No browser action performs the refresh.
async function connectedDiskRepository(page,server){
 const disk=await cloudFolder(page),folder=path.join(disk.folder,'diagrams/team/consumer'),support=path.join(folder,'.flowview-agent');
 await writeFile(path.join(disk.folder,'canon.json'),JSON.stringify({version:1,diagrams:Object.keys(specs).map(id=>({folder:'diagrams/team/'+id,owner:'group:default/local'}))}));
 for(const [id,spec] of Object.entries(specs)){const dir=path.join(disk.folder,'diagrams/team',id);await mkdir(dir,{recursive:true});await writeFile(path.join(dir,id+'.spec.json'),JSON.stringify(spec,null,2));}
 await writeFile(path.join(folder,'consumer.ledger.md'),'# Exact ledger\r\nKeep evidence.\n');
 await page.addInitScript(()=>{
   const picker=window.showDirectoryPicker;window.localPickerCount=0;
   function wrap(dir){const getDir=dir.getDirectoryHandle.bind(dir),getFile=dir.getFileHandle.bind(dir);
    dir.getDirectoryHandle=async(...args)=>wrap(await getDir(...args));
    dir.getFileHandle=async(name,...args)=>{const handle=await getFile(name,...args),read=handle.getFile.bind(handle);handle.getFile=async()=>{
      if(name==='base.spec.json'){
        if(window.localPermissionLost)throw new DOMException('Provider access was revoked','NotAllowedError');
        if(window.holdLocalProvider && !window.localProviderHeld){window.localProviderHeld=true;await new Promise(resolve=>window.releaseLocalProvider=resolve);}
      }return read();};return handle;};return dir;}
   window.showDirectoryPicker=async(...args)=>{window.localPickerCount++;return wrap(await picker(...args));};
 });
 await page.goto(server.origin+'/workbench.html');await paste(page,starter);await page.locator('#editor-tab-agent').click();await page.locator('#folder-agent-open-setup').click();await page.locator('#folder-agent-start-adopt').click();await page.locator('#folder-agent-connect').click();
 await page.locator('#folder-agent-file-picker').selectOption('diagrams/team/consumer/consumer.spec.json');await page.locator('#folder-agent-file-confirm').click();await expect(page.locator('#folder-agent-copy')).toBeEnabled();await expect(node(page)).toBeVisible();await page.locator('#folder-agent-guide').evaluate(el=>el.close());await closeTools(page);
 return {...disk,support,readState:async()=>JSON.parse(await readFile(path.join(support,'state.json'),'utf8')),
   provider:async text=>writeFile(path.join(disk.folder,'diagrams/team/base/base.spec.json'),text),
   command:()=>new Promise((resolve,reject)=>{const proc=spawn('python3',[path.join(support,'folder-agent.py'),'refresh-sources'],{cwd:disk.folder});let stdout='',stderr='';proc.stdout.on('data',d=>stdout+=d);proc.stderr.on('data',d=>stderr+=d);proc.on('error',reject);proc.on('close',code=>resolve({code,stdout,stderr}));})};
}
test('agent CLI refresh updates the open consumer without begin or menu, preserves draft/overlays/ledger and exact Undo snapshots',async({page,server},info)=>{
 const disk=await connectedDiskRepository(page,server);
 try{
  expect(await readFile(path.join(disk.support,'CONNECT.md'),'utf8')).toContain('refresh-sources');
  await expect.poll(async()=>(await disk.readState()).localSources?.available).toBe(true);
  const draft=structuredClone(specs.consumer),imp=draft.page.sections[0].diagram.topologyImports[0];Object.assign(imp,{nodeTracking:{'base::api':{tickets:['API-10']}},edgeTracking:{'base::api->base::store':{tickets:['API-11']}},nodeOverrides:{'base::api':{style:'teal'}},edgeOverrides:{'base::api->base::store':{label:'My connection'}},nodePositions:{'base::api':{x:450,y:150}}});
  const exact=' \n'+JSON.stringify(draft,null,2)+'\n';await page.locator('#editor-tab-json').click();await page.locator('#src').fill(exact);await closeTools(page);await expect.poll(async()=>(await disk.readState()).source).toBe(exact);
  const changed=structuredClone(specs.base);changed.page.sections[0].diagram.nodes.api.title='CLI refreshed saved provider';await disk.provider(JSON.stringify(changed));
  const result=await disk.command();expect(result.code,result.stderr).toBe(0);const receipt=JSON.parse(result.stdout);expect(receipt.status).toBe('applied');expect(receipt.currentRevision).toBe((await disk.readState()).revision);expect(receipt.localSources.consumerId).toBe('consumer');
  await expect(node(page)).toContainText('CLI refreshed saved provider');await expect(page.locator('#src')).toHaveValue(exact);expect((await disk.readState()).ledger).toBe('# Exact ledger\r\nKeep evidence.\n');
  await expect(readFile(path.join(disk.support,'request.json'))).rejects.toThrow(/ENOENT/);
  const rendered=await node(page).elementHandle(),unchanged=await disk.command();expect(unchanged.code,unchanged.stderr).toBe(0);expect(JSON.parse(unchanged.stdout).status).toBe('unchanged');expect(await rendered.evaluate(el=>el.isConnected)).toBe(true);
  await disk.provider('{unfinished nested provider');const invalid=await disk.command();expect(invalid.code).toBe(1);expect(JSON.parse(invalid.stdout).code).toBe('invalid_sources');expect(invalid.stderr).toContain('base');await expect(node(page)).toContainText('CLI refreshed saved provider');await expect(page.locator('#src')).toHaveValue(exact);
  await page.locator('#undo-builder').click();await expect(node(page)).toContainText('Local shared API');await expect(page.locator('#src')).toHaveValue(exact);await page.locator('#redo-builder').click();await expect(node(page)).toContainText('CLI refreshed saved provider');await expect(page.locator('#src')).toHaveValue(exact);
  await page.screenshot({path:info.outputPath('agent-cli-refreshed-consumer.png')});
  await expect.poll(async()=>(await disk.readState()).topologyRevision).toBe(receipt.topologyRevision+2);
  await disk.provider(JSON.stringify(changed));await page.evaluate(()=>{window.localPermissionLost=true;});const denied=await disk.command();expect(denied.code).toBe(1);expect(JSON.parse(denied.stdout).code).toBe('reconnect_required');
  const noGrant=await disk.command();expect(noGrant.code).toBe(1);expect(JSON.parse(noGrant.stdout).code).toBe('reconnect_required');expect(await page.evaluate(()=>window.localPickerCount)).toBe(1);await expect(node(page)).toContainText('CLI refreshed saved provider');
 }finally{await page.close();await disk.close();}
});
test('agent CLI held provider read cannot publish after disconnect even when manual root remains granted',async({page,server})=>{
 const disk=await connectedDiskRepository(page,server);
 try{
  const changed=structuredClone(specs.base);changed.page.sections[0].diagram.nodes.api.title='Must not appear';await disk.provider(JSON.stringify(changed));await page.evaluate(()=>{window.holdLocalProvider=true;});const command=disk.command();await expect.poll(()=>page.evaluate(()=>window.localProviderHeld)).toBe(true);
  await page.locator('#editor-tab-agent').click();if(!await page.locator('#folder-agent-disconnect').isVisible())await page.locator('#folder-agent-pairing>summary').click();await page.locator('#folder-agent-disconnect').click();
  await expect.poll(async()=>JSON.parse(await readFile(path.join(disk.support,'editor.json'),'utf8')).connected).toBe(false);await page.evaluate(()=>window.releaseLocalProvider());const result=await command;expect(result.code).not.toBe(0);await expect(node(page)).toContainText('Local shared API');await filePanel(page);await expect(page.locator('#local-sources-refresh')).toHaveText('Refresh local sources');await expect(page.locator('#src')).toHaveValue(consumer);
 }finally{await page.close();await disk.close();}
});
