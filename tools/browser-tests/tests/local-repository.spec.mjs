import {test,expect,paste,closeTools} from '../helpers/test.mjs';
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
  await page.screenshot({path:info.outputPath('local-repository-edit.png')});
  // Later disk revisions cannot silently refresh the frozen recovered context.
  await page.evaluate(async()=>{let dir=await navigator.storage.getDirectory();for(const part of ['diagrams','team','base'])dir=await dir.getDirectoryHandle(part);const stream=await(await dir.getFileHandle('base.spec.json')).createWritable();await stream.write('{}');await stream.close();});
  await page.reload();await expect(page.locator('#src')).toHaveValue(edited);await expect(node(page)).toContainText('Local shared API');
});

test('nested folder diagnostics and late local provider reads preserve the current document',async({page,server})=>{
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
});

test('empty registry preserves an ordinary folder and nested imports reuse the existing frozen providers',async({page,server})=>{
  await setup(page,server);await choose(page);await expect(node(page)).toBeVisible();
  await expect(page.locator('#workbench-working-status')).toContainText('Saved to consumer/consumer.spec.json');
  const requests=[];page.on('request',request=>requests.push(request.url()));
  await page.evaluate(()=>{window.pickNested=true;});await filePanel(page);await page.locator('#working-folder-open').click();
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('dv-workbench-draft')).topologyContext?.ephemeral)).toBe(true);
  await expect(page.locator('#workbench-working-status')).toContainText('Saved to consumer/consumer.spec.json');await expect(node(page)).toBeVisible();
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
