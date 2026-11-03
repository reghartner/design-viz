import {test,expect,paste,closeTools} from '../helpers/test.mjs';
import {cloudFolder} from '../helpers/cloud-folder.mjs';
import {mkdir,writeFile,readFile,cp,rm} from 'node:fs/promises';
import {publishLibrary} from '../../canon/library.mjs';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {source as starter} from '../fixtures/editor-spec.mjs';
import {COPY_REMEDY,copySummary,bundledValidate,expectCopyMatches,exportOpfsSession} from '../helpers/provider-copy.mjs';
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

test('ordinary unregistered folder can remain open with unresolved imports then select a separate source root',async({page,server})=>{
  await page.route('**/diagrams.json',route=>route.fulfill({json:{version:3,diagrams:[]}}));
  await setup(page,server);await page.evaluate(()=>{window.pickNested=true;});await filePanel(page);await page.locator('#working-folder-open').click();
  await expect(page.locator('#src')).toHaveValue(consumer);await expect(page.locator('#local-sources-status')).toContainText('Imports unresolved');
  await page.evaluate(()=>{window.pickNested=false;});await page.locator('#local-sources-select').click();await expect(node(page)).toContainText('Local shared API');await expect(page.locator('#src')).toHaveValue(consumer);await expect(page.locator('#workbench-working-status')).toContainText('consumer/consumer.spec.json');
});
test('late local provider reads preserve the current document during folder opening',async({page,server})=>{
  await setup(page,server);
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

/* #878 PR 2: the connected folder holds the Workbench's provider copy. Contract: ticket
   #878 "How it should look" (provider copy, when it is written, state.json
   providersSha256) and "Test + flip" tests 2-5; Chuck 2026-11-02 (coverage = the
   ticket's test plan; local repository + desktop Workbench first; desktop only).
   "Copy matches" (helpers/provider-copy.mjs): providers.json hash == recomputed hash ==
   state.json providersSha256; payload sourceKind is the source in use (local with
   snapshotSha256, or site-library without); payload consumerId is the frozen consumer
   identity ("consumer" when registered in canon.json, "workbench-draft" when
   independent), so the canon-less consumer file validates; payload specs are exactly base and middle
   (never the consumer) and base's api title is the text the page renders; the bundled
   validate.js run without flags on the consumer exits 0 with "0 errors".
   | row | fixture | assertion (scoped) | rejects |
   | T2 root connect writes the copy | :92 agent connect at a repository root (OPFS), before any refresh | copy matches: local, base api "Local shared API" | no copy; a copy written only on refresh |
   | T3a connected consumer at connect | connectedDiskRepository | copy matches: local, "Local shared API" | a copy holding the consumer or no snapshotSha256 |
   | T3b after refresh-sources applied | same, receipt applied | copy matches: "CLI refreshed saved provider" | a copy not rewritten when topologyRevision changes |
   | T3c after Undo / Redo | same | Undo: "Local shared API"; Redo: "CLI refreshed saved provider" | a copy that ignores history-driven context changes |
   | T4a unresolved imports before refresh | separateLocalSources (empty site library), before refresh-sources | copy is whole and named (hash checks), specs []; bundled validate.js exits 1 naming COPY_REMEDY | an impl that writes no copy for an unresolved context |
   | T4b after refresh-sources --source-repo first root | same | copy matches: local, "Unpublished API" | a copy left empty after the refresh |
   | T5-guard connected consumer resolves from a populated site library at open (passes today) | separateLocalSources with the site library, connected | node shared::base::api shows "Site published API"; state.json source is the consumer | (makes T5's start discriminating) a fixture that never reaches the site library |
   | T5 source switches with Undo/Redo | separateLocalSources with a populated site library (site "Site published API"), connected | start site-library/"Site published API" (no snapshotSha256); local first root "Unpublished API"; second root "Second root API"; Undo first; Redo second; edited second root after Refresh "Edited second root"; Use site library site; Undo edited; Redo site | a copy that tracks only refresh-sources; a sourceKind that does not follow the source |
   Excluded: phone/narrow-width editing (Chuck 2026-10-13); cloud Workbench (later ticket). */
test('agent folder connection retains the granted repository root and writes the selected diagram folder',async({page,server})=>{
  await setup(page,server);await page.locator('#editor-tab-agent').click();await page.locator('#folder-agent-open-setup').click();await page.locator('#folder-agent-start-adopt').click();await page.locator('#folder-agent-connect').click();
  await page.locator('#folder-agent-file-picker').selectOption('diagrams/team/consumer/consumer.spec.json');await page.locator('#folder-agent-file-confirm').click();
  await expect(page.locator('#folder-agent-copy')).toBeEnabled();await expect(page.locator('#src')).toHaveValue(consumer);await expect(node(page)).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>new Promise(resolve=>{
    const request=indexedDB.open('flowview-folder-recovery',1);request.onerror=()=>resolve(false);
    request.onsuccess=()=>{const db=request.result,read=db.transaction('handles').objectStore('handles').get('last');read.onsuccess=async()=>{db.close();try{await read.result.handle.getFileHandle('canon.json');resolve(true);}catch{resolve(false);}};};
  }))).toBe(true);
  expect(await disk(page)).toBe(consumer);
  // T2 (#878): right after connecting, before any refresh, the copy matches.
  const exported=[];
  try{
    await expect.poll(async()=>{const session=await exportOpfsSession(page,['diagrams','team','consumer'],'consumer.spec.json');exported.push(session.folder);return copySummary(session.support);},{message:'T2 copy matches',timeout:15000})
      .toEqual({whole:true,named:true,sourceKind:'local',snapshotSha256:true,consumerId:'consumer',specs:['base','middle'],baseApi:'Local shared API'});
    const session=await exportOpfsSession(page,['diagrams','team','consumer'],'consumer.spec.json');exported.push(session.folder);
    const result=bundledValidate(session.support,session.consumer);expect(result.status,result.stdout+result.stderr).toBe(0);expect(result.stdout).toContain(session.consumer+': 0 errors');
  }finally{for(const folder of exported)await rm(folder,{recursive:true,force:true});}
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
  await expect(page.locator('#local-sources-status')).toContainText('Imports unresolved');
  await expect(page.locator('#src')).toHaveValue(await disk(page));await expect(node(page)).toBeVisible();expect(requests).toEqual([]);
  const replacement=await page.evaluate(()=>JSON.parse(localStorage.getItem('dv-workbench-draft')));expect(replacement.topologyContext.specs).toHaveLength(1);
  expect(await page.evaluate(text=>JSON.parse(localStorage.getItem('dv-workbench-earlier-drafts')).some(d=>d.text===text && d.topologyContext?.specs.length===3),consumer)).toBe(true);
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
 const disk=await connectedDiskRepository(page,server),consumerFile=path.join(disk.folder,'diagrams/team/consumer/consumer.spec.json');
 try{
  await expectCopyMatches(disk.support,consumerFile,{sourceKind:'local',consumerId:'consumer',baseApi:'Local shared API'},'T3a at connect');
  expect(await readFile(path.join(disk.support,'CONNECT.md'),'utf8')).toContain('refresh-sources');
  await expect.poll(async()=>(await disk.readState()).localSources?.available).toBe(true);
  const draft=structuredClone(specs.consumer),imp=draft.page.sections[0].diagram.topologyImports[0];Object.assign(imp,{nodeTracking:{'base::api':{tickets:['API-10']}},edgeTracking:{'base::api->base::store':{tickets:['API-11']}},nodeOverrides:{'base::api':{style:'teal'}},edgeOverrides:{'base::api->base::store':{label:'My connection'}},nodePositions:{'base::api':{x:450,y:150}}});
  const exact=' \n'+JSON.stringify(draft,null,2)+'\n';await page.locator('#editor-tab-json').click();await page.locator('#src').fill(exact);await closeTools(page);await expect.poll(async()=>(await disk.readState()).source).toBe(exact);
  const changed=structuredClone(specs.base);changed.page.sections[0].diagram.nodes.api.title='CLI refreshed saved provider';await disk.provider(JSON.stringify(changed));
  const result=await disk.command();expect(result.code,result.stderr).toBe(0);const receipt=JSON.parse(result.stdout);expect(receipt.status).toBe('applied');expect(receipt.currentRevision).toBe((await disk.readState()).revision);expect(receipt.localSources.consumerId).toBe('consumer');
  await expect(node(page)).toContainText('CLI refreshed saved provider');await expect(page.locator('#src')).toHaveValue(exact);expect((await disk.readState()).ledger).toBe('# Exact ledger\r\nKeep evidence.\n');
  await expectCopyMatches(disk.support,consumerFile,{sourceKind:'local',consumerId:'consumer',baseApi:'CLI refreshed saved provider'},'T3b after applied');
  await expect(readFile(path.join(disk.support,'request.json'))).rejects.toThrow(/ENOENT/);
  const rendered=await node(page).elementHandle(),unchanged=await disk.command();expect(unchanged.code,unchanged.stderr).toBe(0);expect(JSON.parse(unchanged.stdout).status).toBe('unchanged');expect(await rendered.evaluate(el=>el.isConnected)).toBe(true);
  await disk.provider('{unfinished nested provider');const invalid=await disk.command();expect(invalid.code).toBe(1);expect(JSON.parse(invalid.stdout).code).toBe('invalid_sources');expect(invalid.stderr).toContain('base');await expect(node(page)).toContainText('CLI refreshed saved provider');await expect(page.locator('#src')).toHaveValue(exact);
  await page.locator('#undo-builder').click();await expect(node(page)).toContainText('Local shared API');await expect(page.locator('#src')).toHaveValue(exact);
  await expectCopyMatches(disk.support,consumerFile,{sourceKind:'local',consumerId:'consumer',baseApi:'Local shared API'},'T3c after Undo');
  await page.locator('#redo-builder').click();await expect(node(page)).toContainText('CLI refreshed saved provider');await expect(page.locator('#src')).toHaveValue(exact);
  await expectCopyMatches(disk.support,consumerFile,{sourceKind:'local',consumerId:'consumer',baseApi:'CLI refreshed saved provider'},'T3c after Redo');
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

test('ordinary file opens unpublished imports and separately selected provider roots switch atomically with Undo',async({page,server})=>{
 const {separateLocalSources,localSourceSpecs}=await import('../helpers/local-source-repository.mjs');const disk=await separateLocalSources(page,server,{connect:false});
 try{
  await expect(page.locator('#workbench-working-status')).toContainText('independent.spec.json');await filePanel(page);await page.locator('#local-sources-select').click();await expect(node(page)).toContainText('Unpublished API');await expect(page.locator('#src')).toHaveValue(disk.exact);
  const first=await page.evaluate(()=>JSON.parse(localStorage.getItem('dv-workbench-draft')).topologyContext);expect(first.ephemeral).toBe(true);expect(first.localSource.path).toBeUndefined();expect(first.localSource.providers).toHaveLength(2);
  await page.evaluate(()=>{window.providerPickerPath='/sources-b/worktree';});await page.locator('#local-sources-select').click();await expect.poll(async()=>page.evaluate(()=>JSON.parse(localStorage.getItem('dv-workbench-draft')).topologyContext.localSource.selectionId)).not.toBe(first.localSource.selectionId);
  await page.locator('#undo-builder').click();await expect(page.locator('#local-sources-refresh')).toHaveText('Reconnect local sources…');await expect(node(page)).toContainText('Unpublished API');
  await page.locator('#redo-builder').click();await expect(page.locator('#local-sources-refresh')).toHaveText('Refresh local sources');
  const changed=structuredClone(localSourceSpecs.base);changed.page.sections[0].diagram.nodes.api.title='Second worktree saved';await disk.provider(disk.roots[1],'base',JSON.stringify(changed));await refresh(page);await expect(node(page)).toContainText('Second worktree saved');await expect(page.locator('#src')).toHaveValue(disk.exact);
  expect(await readFile(path.join(disk.consumerFolder,'independent.spec.json'),'utf8')).toBe(disk.exact);await expect(page.locator('#workbench-working-status')).toContainText('independent.spec.json');
  const another=structuredClone(localSourceSpecs.consumer);another.page.sections[0].diagram.topologyImports=[{spec:'never-published',export:'core',as:'new'}];const pending=JSON.stringify(another,null,2);await writeFile(path.join(disk.consumerFolder,'another.spec.json'),pending);await page.evaluate(()=>{window.consumerFileName='another.spec.json';});await page.locator('#working-file-open').click();await expect(page.locator('#src')).toHaveValue(pending);await expect(page.locator('#local-sources-status')).toContainText('Imports unresolved');
 }finally{await page.close();await disk.close();}
});
test('generated consumer CLI selects separate unpublished providers, repeats, repairs and switches without begin or menu',async({page,server},info)=>{
 const {separateLocalSources,localSourceSpecs}=await import('../helpers/local-source-repository.mjs');const disk=await separateLocalSources(page,server);
 try{
  // T4a (#878): imports start unresolved; the copy is named but holds no providers.
  const independent=path.join(disk.consumerFolder,'independent.spec.json');
  await expect.poll(async()=>{const copy=await copySummary(disk.support);return copy.whole && copy.named?{specs:copy.specs}:copy;},{message:'T4a named copy without providers',timeout:15000}).toEqual({specs:[]});
  const unresolved=bundledValidate(disk.support,independent);expect(unresolved.status,unresolved.stdout+unresolved.stderr).toBe(1);expect(unresolved.stdout).toContain(COPY_REMEDY);
  const command=await disk.command('--source-repo',disk.roots[0]);expect(command.code,command.stderr).toBe(0);const first=JSON.parse(command.stdout);expect(first.status).toBe('applied');expect(first.localSources.available).toBe(true);expect(first.localSources.code).toBe('ready');expect(first.localSources.mode).toBe('agent-snapshot');expect(first.localSources.needsSnapshot).toBe(true);expect(first.localSources.snapshotSha256).toMatch(/^[a-f0-9]{64}$/);expect(first.localSources.providerCount).toBe(2);expect(first.localSources.capturedAt).toMatch(/Z$/);await expect(node(page)).toContainText('Unpublished API');expect((await disk.readState()).localSources.sourceSelectionId).toBeTruthy();
  await expectCopyMatches(disk.support,independent,{sourceKind:'local',consumerId:'workbench-draft',baseApi:'Unpublished API'},'T4b after refresh-sources');
  const extra=structuredClone(localSourceSpecs.base);extra.page.sections[0].diagram.nodes.api.title='New transitive dependency';await mkdir(path.join(disk.roots[0],'diagrams/extra'));await disk.provider(disk.roots[0],'extra',JSON.stringify(extra));
  const registry=JSON.parse(await readFile(path.join(disk.roots[0],'canon.json'),'utf8'));registry.diagrams.push({folder:'diagrams/extra',owner:'group:default/local'});await writeFile(path.join(disk.roots[0],'canon.json'),JSON.stringify(registry));
  const middle=structuredClone(localSourceSpecs.middle);middle.page.sections[0].diagram.topologyImports.push({spec:'extra',export:'core',as:'extra'});middle.page.sections[0].diagram.topologyExports.core.nodes.push('extra::api');await disk.provider(disk.roots[0],'middle',JSON.stringify(middle));const transitive=await disk.command();expect(transitive.code,transitive.stderr).toBe(0);await expect(page.locator('#docview g.node[data-dv-node="shared::extra::api"]')).toContainText('New transitive dependency');
  const draft=structuredClone(localSourceSpecs.consumer);draft.page.sections[0].diagram.nodes.local.title='Unsaved consumer edit';const exact=' \n'+JSON.stringify(draft,null,2)+'\n';await page.locator('#editor-tab-json').click();await page.locator('#src').fill(exact);await closeTools(page);await expect.poll(async()=>(await disk.readState()).source).toBe(exact);
  const changed=structuredClone(localSourceSpecs.base);changed.page.sections[0].diagram.nodes.api.title='External agent saved provider';await disk.provider(disk.roots[0],'base',JSON.stringify(changed));const update=await disk.command();expect(update.code,update.stderr).toBe(0);const accepted=JSON.parse(update.stdout);await expect(node(page)).toContainText('External agent saved provider');await expect(page.locator('#src')).toHaveValue(exact);expect((await disk.readState()).ledger).toContain('Preserve imported work.');
  const rendered=await node(page).elementHandle();const same=await disk.command();expect(same.code,same.stderr).toBe(0);expect(JSON.parse(same.stdout).status).toBe('unchanged');expect(await rendered.evaluate(el=>el.isConnected)).toBe(true);
  await disk.provider(disk.roots[0],'base','{half saved');const invalid=await disk.command();expect(invalid.code).not.toBe(0);await expect(node(page)).toContainText('External agent saved provider');await expect(page.locator('#src')).toHaveValue(exact);
  await page.locator('#undo-builder').click();await expect(node(page)).toContainText('Unpublished API');await page.locator('#redo-builder').click();await expect(node(page)).toContainText('External agent saved provider');await expect.poll(async()=>(await disk.readState()).topologyRevision).toBe(accepted.topologyRevision+2);
  await disk.provider(disk.roots[0],'base',JSON.stringify(changed));const switchResult=await disk.command('--source-repo',disk.roots[1]);expect(switchResult.code,switchResult.stderr).toBe(0);await expect(node(page)).toContainText('Unpublished API');
  await page.locator('#undo-builder').click();await expect(node(page)).toContainText('External agent saved provider');await expect.poll(async()=>(await disk.readState()).localSources.sourceSelectionId).toBe(first.localSources.sourceSelectionId);const afterUndo=await disk.command();expect(afterUndo.code).not.toBe(0);expect(afterUndo.stderr).toContain('Reselect');
  const reconnect=await disk.command('--source-repo',disk.roots[0]);expect(reconnect.code,reconnect.stderr).toBe(0);await expect(page.locator('#src')).toHaveValue(exact);
  const state=await disk.readState();expect(JSON.stringify(state)).not.toContain(disk.folder);expect(await readFile(path.join(disk.support,'local-sources-selection.json'),'utf8')).toContain(disk.roots[0]);await expect(readFile(path.join(disk.support,'request.json'))).rejects.toThrow(/ENOENT/);await page.screenshot({path:info.outputPath('independent-source-cli.png')});
 }finally{await page.close();await disk.close();}
});

/* #833 Use site library. Contract (issue #833 acceptance):
   | row | fixture | assertion (scoped) | rejects |
   | switch without clearing storage | draft on a selected local source repository | #local-sources-site click makes the imported node show the site provider title | an impl with no visible action |
   | picker lists the site library | same, after the switch | #topology-provider options are the site library's providers | an impl that keeps the local catalog |
   | saved draft keeps the site context | same | dv-workbench-draft.topologyContext is non-local with the site catalogURL | an impl that only changes memory |
   | Undo restores the local source; Redo the site | same | imported node title and saved context.local flip back and forth | an impl without history |
   | reload keeps the site context | reload after Redo | imported node still shows the site title | an impl that recovers the local snapshot */
async function siteLibrary(server){
 const root=path.join(server.root,'site-833-'+process.pid+'-'+Date.now()),workbench=path.join(root,'workbench');
 await mkdir(workbench,{recursive:true});
 for(const [from,to] of [['workbench.html','flowspec.html'],['catalog.json','catalog.json'],['starters.json','starters.json']])await cp(path.join(server.root,from),path.join(workbench,to));
 const {localSourceSpecs}=await import('../helpers/local-source-repository.mjs'),site=structuredClone(localSourceSpecs);
 site.base.page.title='Site provider';site.base.page.sections[0].diagram.nodes.api.title='Site published API';site.middle.page.title='Site middle';
 for(const id of ['base','middle']){await mkdir(path.join(root,'diagrams',id),{recursive:true});await writeFile(path.join(root,'diagrams',id,id+'.spec.json'),JSON.stringify(site[id]));await writeFile(path.join(root,'diagrams',id,id+'.html'),'<!doctype html>');}
 const registryPath=path.join(root,'canon.json');await writeFile(registryPath,JSON.stringify({version:1,diagrams:['base','middle'].map(id=>({folder:'diagrams/'+id,owner:'group:default/site'}))}));
 await publishLibrary({registryPath,output:path.join(workbench,'diagrams.json')});
 const base=server.origin+'/'+path.relative(server.root,root)+'/workbench/';
 return {url:base+'flowspec.html',catalogURL:base+'diagrams.json',close:()=>rm(root,{recursive:true,force:true})};
}
test('Use site library leaves a selected local source repository with Undo, and the importer lists the site library after reload',async({page,server})=>{
 const site=await siteLibrary(server),{separateLocalSources}=await import('../helpers/local-source-repository.mjs');
 const disk=await separateLocalSources(page,server,{connect:false,workbench:site.url,emptyLibrary:false});
 const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('dv-workbench-draft')).topologyContext);
 try{
  await filePanel(page);await page.locator('#local-sources-select').click();await expect(node(page)).toContainText('Unpublished API');
  expect((await saved()).local,'precondition: the draft uses the local source repository').toBe(true);
  const useSite=page.locator('#local-sources-site');await expect(useSite,'File panel offers Use site library (#833)').toHaveText('Use site library',{timeout:3000});await expect(useSite).toBeEnabled();
  await useSite.click();await expect(node(page)).toContainText('Site published API');
  const after=await saved();expect(!!after.local).toBe(false);expect(after.catalogURL).toBe(site.catalogURL);
  await closeTools(page);await page.locator('#diagram-add').click();await page.locator('#add-topology').click();
  await expect(page.locator('#topology-provider option')).toHaveText(['Site provider · base','Site middle · middle']);
  await page.locator('#topology-cancel').click();
  await page.locator('#undo-builder').click();await expect(node(page)).toContainText('Unpublished API');expect((await saved()).local).toBe(true);
  await page.locator('#redo-builder').click();await expect(node(page)).toContainText('Site published API');expect(!!(await saved()).local).toBe(false);
  await page.reload();await expect(node(page)).toContainText('Site published API');
 }finally{await page.close();await disk.close();await site.close();}
});
// T5-guard: today's behavior T5 starts from (the ticket marks it unverified), as its own
// row so T5's RED is provably the copy: passes at the baseline, before any copy exists.
test('#878 T5 guard: a connected consumer opened with a populated site library resolves its imports from it',async({page,server})=>{
 const site=await siteLibrary(server),{separateLocalSources}=await import('../helpers/local-source-repository.mjs');
 const disk=await separateLocalSources(page,server,{workbench:site.url,emptyLibrary:false});
 try{
  await expect(node(page)).toContainText('Site published API');
  await expect.poll(async()=>(await disk.readState()).source).toBe(disk.exact);
 }finally{await page.close();await disk.close();await site.close();}
});
test('#878 T5: the connected copy follows site library, local roots, Refresh, Use site library, Undo and Redo',async({page,server})=>{
 const site=await siteLibrary(server),{separateLocalSources,localSourceSpecs}=await import('../helpers/local-source-repository.mjs');
 const disk=await separateLocalSources(page,server,{workbench:site.url,emptyLibrary:false});
 const independent=path.join(disk.consumerFolder,'independent.spec.json'),local=baseApi=>({sourceKind:'local',consumerId:'workbench-draft',baseApi}),siteCopy={sourceKind:'site-library',consumerId:'workbench-draft',baseApi:'Site published API'};
 try{
  await expect(node(page),'precondition: the connected consumer resolves from the site library').toContainText('Site published API');
  const second=structuredClone(localSourceSpecs.base);second.page.sections[0].diagram.nodes.api.title='Second root API';await disk.provider(disk.roots[1],'base',JSON.stringify(second));
  await expectCopyMatches(disk.support,independent,siteCopy,'T5 start');
  await filePanel(page);await page.locator('#local-sources-select').click();await expect(node(page)).toContainText('Unpublished API');
  await expectCopyMatches(disk.support,independent,local('Unpublished API'),'T5 first root');
  await page.evaluate(()=>{window.providerPickerPath='/sources-b/worktree';});await filePanel(page);await page.locator('#local-sources-select').click();await expect(node(page)).toContainText('Second root API');
  await expectCopyMatches(disk.support,independent,local('Second root API'),'T5 second root');
  await page.locator('#undo-builder').click();await expect(node(page)).toContainText('Unpublished API');
  await expectCopyMatches(disk.support,independent,local('Unpublished API'),'T5 Undo to first root');
  await page.locator('#redo-builder').click();await expect(node(page)).toContainText('Second root API');
  await expectCopyMatches(disk.support,independent,local('Second root API'),'T5 Redo to second root');
  const edited=structuredClone(localSourceSpecs.base);edited.page.sections[0].diagram.nodes.api.title='Edited second root';await disk.provider(disk.roots[1],'base',JSON.stringify(edited));
  await refresh(page);await expect(node(page)).toContainText('Edited second root');
  await expectCopyMatches(disk.support,independent,local('Edited second root'),'T5 Refresh local sources');
  await filePanel(page);await page.locator('#local-sources-site').click();await expect(node(page)).toContainText('Site published API');
  await expectCopyMatches(disk.support,independent,siteCopy,'T5 Use site library');
  await page.locator('#undo-builder').click();await expect(node(page)).toContainText('Edited second root');
  await expectCopyMatches(disk.support,independent,local('Edited second root'),'T5 Undo to edited second root');
  await page.locator('#redo-builder').click();await expect(node(page)).toContainText('Site published API');
  await expectCopyMatches(disk.support,independent,siteCopy,'T5 Redo to site library');
 }finally{await page.close();await disk.close();await site.close();}
});

/* #874 Two desktop Workbench tabs on one local repository: an agent's provider edit,
   accepted in the provider tab, reaches the importing tab through the consumer
   helper's refresh-sources. Contract: issue #874 (behaviour steps 1-5; Test + flip
   cases 1 and 2); issue #883 (case 2 restored: design A, a local proposal acquires its
   own provider closure); docs/local-repository-authoring.md (agent-connected consumer);
   Chuck 2026-11-02 (local repository + desktop Workbench first; the agent writes a new
   provider's seed spec and canon.json entry; the Start new default is unchanged).
   Both tabs are pages of one browser context (one origin, one localStorage) bound to
   one disk repository through cloudFolder. The test acts as the agent: it runs the
   generated folder-agent.py helpers and writes only the files an agent writes.
   | row | fixture | assertion (scoped) | rejects |
   | P1 provider tab accepts the agent edit | provider tab connected at the repository root with base selected; begin + propose renaming base's api node | review previews [data-dv-node=api] with the new title, no issues; provider #src == proposed bytes | a review that cannot accept for a root-connected provider |
   | P2 acceptance saves the registered provider file | same | diagrams/team/base/base.spec.json bytes == proposed; base.ledger.md == proposed ledger; result.json for the request is applied | acceptance applied in the browser that skips the disk save (flip 2) |
   | C0 consumer unchanged until refresh (precondition) | consumer tab connected at the same root with consumer selected, before the edit | consumer g.node[shared::base::api] still reads "Local shared API" after P2 | (makes C1 discriminating) a consumer already showing the new title |
   | C1 refresh-sources renders the accepted provider text | consumer helper refresh-sources --source-repo <repository root> | consumer g.node[shared::base::api] contains "Provider tab accepted API" | a refresh that reports unchanged without applying (flip 1); a refresh that rereads the frozen snapshot |
   | C2 receipt is applied | same | helper exits 0; receipt.status == applied | an unchanged, rejected or busy receipt |
   | C3 consumer source kept | same | consumer #src == original bytes; consumer.spec.json on disk == original bytes (authored topologyImports only, no copied provider nodes) | a refresh that rewrites or materializes the consumer source |
   | C4 consumer ledger kept | same | state.json ledger and consumer.ledger.md == original ledger | a refresh that replaces the ledger |
   | C5 consumer Undo history kept | Undo, then Redo, in the consumer tab | Undo: node reads "Local shared API", #src unchanged; Redo: node contains the accepted text | a refresh recorded outside Undo history |
   | C6 consumer reload restores the consumer document | reload the consumer tab after C5 | #src == consumer bytes; #docview .doc-title == "Local consumer"; node contains the accepted text | the shared dv-workbench-draft key restoring the provider tab's document; a reload restoring the pre-refresh snapshot |
   | N1 an agent-seeded provider is selectable at the root | the test writes diagrams/team/billing/billing.spec.json and its canon.json entry after both tabs loaded | provider-tab file picker offers billing.spec.json; provider #src == seed bytes | a picker that misses canon.json entries added after page load |
   | N2 its accepted exports are saved | propose adding topologyExports and renaming gateway; accept | billing.spec.json bytes == proposed; result applied | acceptance that skips the disk save |
   | N3 consumer accepts an import of the new provider | consumer begin + propose adding a billing import; accept | review previews billing::gateway with no issues; result applied; saved consumer imports [middle, billing] and has no billing::gateway node; consumer billing::gateway contains the accepted title | a review blocked because the consumer's frozen snapshot lacks the new provider (#883: the review acquires the proposal closure through the consumer's browser grant) |
   | N4 refresh-sources renders the provider's later accepted change | provider tab accepts a second proposal renaming gateway; then consumer helper refresh-sources --source-repo <repository root> | before: consumer billing::gateway still contains "Accepted billing gateway"; after: helper exits 0, receipt applied, billing::gateway contains "Refreshed billing gateway" | a refresh-sources that does nothing (the first title already renders after N3); a refresh limited to the closure frozen before the import |
   Excluded: phone/narrow-width editing (Chuck 2026-10-13, desktop only); cloud Workbench (later ticket). */
const consumerLedger='# Consumer ledger\n\nImports the shared API through middle.\n';
const registry=ids=>JSON.stringify({version:1,diagrams:ids.map(id=>({folder:'diagrams/team/'+id,owner:'group:default/local'}))});
async function twoTabRepository(provider,importer){
 const disk=await cloudFolder(provider);await cloudFolder(importer,{folder:disk.folder});
 await writeFile(path.join(disk.folder,'canon.json'),registry(Object.keys(specs)));
 for(const [id,spec] of Object.entries(specs)){const dir=path.join(disk.folder,'diagrams/team',id);await mkdir(dir,{recursive:true});await writeFile(path.join(dir,id+'.spec.json'),JSON.stringify(spec,null,2));}
 await writeFile(path.join(disk.folder,'diagrams/team/consumer/consumer.ledger.md'),consumerLedger);
 const support=id=>path.join(disk.folder,'diagrams/team',id,'.flowview-agent');
 return {...disk,support,file:(id,name)=>readFile(path.join(disk.folder,'diagrams/team',id,name),'utf8'),
  state:async id=>JSON.parse(await readFile(path.join(support(id),'state.json'),'utf8'))};
}
// The generated helper, run as the agent would run it. Asynchronous, so the page's
// disk bindings keep serving the browser while a command waits for it.
function agent(support,...args){
 return new Promise((resolve,reject)=>{const child=spawn('python3',[path.join(support,'folder-agent.py'),...args]);let stdout='',stderr='';child.stdout.on('data',d=>stdout+=d);child.stderr.on('data',d=>stderr+=d);child.on('error',reject);child.on('close',code=>resolve({code,stdout,stderr}));});
}
async function connectTab(page,spec){
 await page.bringToFront();await closeTools(page);await page.locator('#editor-tab-agent').click();await page.locator('#folder-agent-open-setup').click();
 await page.locator('#folder-agent-setup-mode-external').click();await expect(page.locator('#folder-agent-setup-mode-external')).toHaveAttribute('aria-pressed','true');
 await page.locator('#folder-agent-start-adopt').click();await page.locator('#folder-agent-connect').click();
 await expect(page.locator('#folder-agent-file-picker option[value="'+spec+'"]')).toHaveCount(1);
 await page.locator('#folder-agent-file-picker').selectOption(spec);await page.locator('#folder-agent-file-confirm').click();
 await expect(page.locator('#folder-agent-copy')).toBeEnabled();await page.locator('#folder-agent-close-guide').click();await closeTools(page);
}
// begin registers the request; the agent edits the seeded candidate pair and proposes it.
async function propose(support,text,edit,ledger){
 const begun=await agent(support,'begin','--text',text);expect(begun.code,begun.stderr).toBe(0);
 const request=JSON.parse(await readFile(path.join(support,'request.json'),'utf8')),candidate=request.candidate;
 expect(request.id).toBe(JSON.parse(begun.stdout).id);expect(candidate.baseRevision).toBe(request.revision);
 const seeded=await readFile(path.join(support,candidate.spec),'utf8'),proposed=edit(seeded);expect(proposed).not.toBe(seeded);
 await writeFile(path.join(support,candidate.spec),proposed);await writeFile(path.join(support,candidate.ledger),ledger);
 const sent=await agent(support,'propose','--request',request.id,'--revision',candidate.baseRevision,'--file',candidate.spec,'--ledger',candidate.ledger,'--summary',text);
 expect(sent.code,sent.stderr).toBe(0);return {request,proposed};
}
async function acceptReview(page,changed){
 await page.locator('#agent-update-open').click();const issues=page.locator('#agent-update-issues');
 // A banner can announce a proposal before its review is blocked; judge the review
 // only once it previews the change, and keep a blocked review's reason in the failure.
 await expect.poll(async()=>await issues.isVisible()?'blocked: '+await page.locator('#agent-update-feedback').inputValue():await changed.first().isVisible(),{message:'the review previews the proposed change'}).toBe(true);
 await expect(issues).toBeHidden();await expect(page.locator('#agent-update-banner-title')).toHaveText('Agent updates are ready');
 await page.locator('#agent-update-commit').click();
}
async function outcome(support,id){try{const value=JSON.parse(await readFile(path.join(support,'result.json'),'utf8'));return value.requestId===id?value.status:null;}catch{return null;}}

test('two desktop tabs: an agent provider edit accepted in the provider tab reaches the importing tab after refresh-sources and its reload',async({page,context,server},info)=>{
 test.setTimeout(90000); // Two Workbench tabs, two folder connections and three helper round trips.
 const importer=await context.newPage(),repo=await twoTabRepository(page,importer),before=JSON.stringify(specs.base,null,2),title='Provider tab accepted API';
 const ledger='# Base ledger\n\nRenamed the shared API at the provider owner\'s request.\n';
 try{
  for(const tab of [page,importer]){await tab.goto(server.origin+'/workbench.html');await paste(tab,starter);}
  await connectTab(page,'diagrams/team/base/base.spec.json');await expect(page.locator('#src')).toHaveValue(before);
  await connectTab(importer,'diagrams/team/consumer/consumer.spec.json');await expect(importer.locator('#src')).toHaveValue(consumer);await expect(node(importer)).toContainText('Local shared API');
  // Provider tab: the agent proposes the rename and a person accepts it.
  await page.bringToFront();
  const {request,proposed}=await propose(repo.support('base'),'Rename the shared API',seeded=>{const raw=JSON.parse(seeded);raw.page.sections[0].diagram.nodes.api.title=title;return JSON.stringify(raw,null,2);},ledger);
  await acceptReview(page,page.locator('#agent-update-view [data-dv-node="api"]').filter({hasText:title}));
  await expect(page.locator('#src')).toHaveValue(proposed);
  await expect.poll(()=>repo.file('base','base.spec.json'),{message:'the accepted provider is saved to its registered file'}).toBe(proposed);
  await expect.poll(()=>repo.file('base','base.ledger.md'),{message:'the accepted provider ledger is saved after its spec'}).toBe(ledger);await expect.poll(()=>outcome(repo.support('base'),request.id)).toBe('applied');
  // Consumer tab: unchanged until the agent runs its helper's refresh-sources.
  await importer.bringToFront();await expect(node(importer)).toContainText('Local shared API');
  const refreshed=await agent(repo.support('consumer'),'refresh-sources','--source-repo',repo.folder);expect(refreshed.code,refreshed.stderr).toBe(0);
  await expect(node(importer),'the importing tab shows the accepted provider text').toContainText(title);
  expect(JSON.parse(refreshed.stdout).status).toBe('applied');
  await expect(importer.locator('#src')).toHaveValue(consumer);await expect.poll(()=>repo.file('consumer','consumer.spec.json'),{message:'refresh-sources keeps the consumer spec on disk'}).toBe(consumer);
  await expect.poll(async()=>(await repo.state('consumer')).ledger,{message:'the consumer state keeps its ledger'}).toBe(consumerLedger);await expect.poll(()=>repo.file('consumer','consumer.ledger.md'),{message:'refresh-sources keeps the consumer ledger on disk'}).toBe(consumerLedger);
  await importer.locator('#undo-builder').click();await expect(node(importer)).toContainText('Local shared API');await expect(importer.locator('#src')).toHaveValue(consumer);
  await importer.locator('#redo-builder').click();await expect(node(importer)).toContainText(title);
  await importer.screenshot({path:info.outputPath('two-tab-consumer-refreshed.png')});
  // Both tabs share this origin's browser recovery; reloading the consumer restores the consumer.
  await importer.reload();
  await expect(importer.locator('#src')).toHaveValue(consumer);await expect(importer.locator('#docview .doc-title')).toHaveText('Local consumer');await expect(node(importer)).toContainText(title);
 }finally{await importer.close();await page.close();await repo.close();}
});

test('two desktop tabs: an agent-seeded new provider gains exports in its tab and the consumer imports it through refresh-sources',async({page,context,server})=>{
 test.setTimeout(120000); // Two Workbench tabs, two folder connections and seven helper round trips.
 const importer=await context.newPage(),repo=await twoTabRepository(page,importer),title='Accepted billing gateway';
 try{
  for(const tab of [page,importer]){await tab.goto(server.origin+'/workbench.html');await paste(tab,starter);}
  await connectTab(importer,'diagrams/team/consumer/consumer.spec.json');await expect(node(importer)).toContainText('Local shared API');
  // The agent registers a new exporting diagram: a seed <id>.spec.json and its canon.json entry (#873).
  const seed=JSON.stringify(make('Billing',{nodes:{gateway:{title:'Billing gateway'}},rows:[['gateway']]}),null,2);
  await mkdir(path.join(repo.folder,'diagrams/team/billing'));await writeFile(path.join(repo.folder,'diagrams/team/billing/billing.spec.json'),seed);
  await writeFile(path.join(repo.folder,'canon.json'),registry([...Object.keys(specs),'billing']));
  await connectTab(page,'diagrams/team/billing/billing.spec.json');await expect(page.locator('#src')).toHaveValue(seed);
  const exported=await propose(repo.support('billing'),'Export the billing gateway',seeded=>{const raw=JSON.parse(seeded),diagram=raw.page.sections[0].diagram;diagram.nodes.gateway.title=title;diagram.topologyExports={public:{nodes:['gateway'],edges:[]}};return JSON.stringify(raw,null,2);},'# Billing ledger\n\nExports the gateway for importing diagrams.\n');
  await acceptReview(page,page.locator('#agent-update-view [data-dv-node="gateway"]').filter({hasText:title}));
  await expect.poll(()=>repo.file('billing','billing.spec.json'),{message:'the accepted new provider is saved to its registered file'}).toBe(exported.proposed);
  await expect.poll(()=>outcome(repo.support('billing'),exported.request.id)).toBe('applied');
  // Consumer tab: the agent adds the import, a person accepts it, then the helper refreshes.
  await importer.bringToFront();
  const imported=await propose(repo.support('consumer'),'Import the billing gateway',seeded=>{const raw=JSON.parse(seeded);raw.page.sections[0].diagram.topologyImports.push({spec:'billing',export:'public',as:'billing'});return JSON.stringify(raw,null,2);},consumerLedger+'\nImports the billing gateway.\n');
  await acceptReview(importer,importer.locator('#agent-update-view [data-dv-node="billing::gateway"]'));
  await expect.poll(()=>outcome(repo.support('consumer'),imported.request.id)).toBe('applied');
  await expect.poll(async()=>{const saved=JSON.parse(await repo.file('consumer','consumer.spec.json')).page.sections[0].diagram;return {imports:saved.topologyImports.map(item=>item.spec),gateway:saved.nodes['billing::gateway']};},
   {message:'the accepted consumer is saved with the billing import and no copied billing nodes'}).toEqual({imports:['middle','billing'],gateway:undefined});
  const gateway=importer.locator('#docview g.node[data-dv-node="billing::gateway"]');await expect(gateway,'the accepted import renders the new provider').toContainText(title);
  // Provider tab: the agent changes the new provider again and a person accepts it.
  await page.bringToFront();const renamed='Refreshed billing gateway';
  const updated=await propose(repo.support('billing'),'Rename the billing gateway',seeded=>{const raw=JSON.parse(seeded);raw.page.sections[0].diagram.nodes.gateway.title=renamed;return JSON.stringify(raw,null,2);},'# Billing ledger\n\nExports the gateway for importing diagrams.\nRenamed the gateway.\n');
  await acceptReview(page,page.locator('#agent-update-view [data-dv-node="gateway"]').filter({hasText:renamed}));
  await expect.poll(()=>repo.file('billing','billing.spec.json'),{message:'the renamed provider is saved to its registered file'}).toBe(updated.proposed);
  await expect.poll(()=>outcome(repo.support('billing'),updated.request.id)).toBe('applied');
  // Consumer tab: still the first accepted title until the helper refreshes it.
  await importer.bringToFront();await expect(gateway).toContainText(title);
  const refreshed=await agent(repo.support('consumer'),'refresh-sources','--source-repo',repo.folder);expect(refreshed.code,refreshed.stderr).toBe(0);
  await expect(gateway,'refresh-sources renders the provider\'s later accepted change').toContainText(renamed);
  expect(JSON.parse(refreshed.stdout).status).toBe('applied');
 }finally{await importer.close();await page.close();await repo.close();}
});
