import {test,expect} from '@playwright/test';
import {readFile,writeFile,mkdir,mkdtemp,rm,rename,stat} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {source} from '../fixtures/editor-spec.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const origin='https://flowview-operation-pressure.test';

// Only native directory picking/handles are substituted. The built editor,
// folder client, exchange, operation planner, renderer, history and Python
// helper are real. No model, native permission grant or watcher is claimed.
async function folderSession(page){
  const folder=await mkdtemp(path.join(tmpdir(),'flowview-operation-pressure-'));
  let session,writeId=0;const errors=[],unexpectedRequests=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.exposeBinding('operationDisk',async(_,operation,name,value)=>{
    const target=path.resolve(folder,'.'+name);
    if(target!==folder && !target.startsWith(folder+path.sep))throw Error('Outside test folder');
    if(operation==='mkdir'){await mkdir(target,{recursive:true});session=target;return;}
    if(operation==='exists'){try{await stat(target);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}}
    if(operation==='read')return readFile(target,'utf8');
    if(operation==='write'){
      const temporary=path.join(path.dirname(target),'.browser-write-'+(++writeId));
      try{await writeFile(temporary,value,{flag:'wx'});await rename(temporary,target);}finally{await rm(temporary,{force:true});}
    }
  });
  await page.addInitScript(()=>{
    localStorage.setItem('dv_tour_v1','done');
    function directory(name){return {name:name.split('/').pop() || 'Operation test folder',
      async getDirectoryHandle(child){await window.operationDisk('mkdir',name+'/'+child);return directory(name+'/'+child);},
      async getFileHandle(child,options){
        const file=name+'/'+child;
        if(!options?.create && !await window.operationDisk('exists',file))throw new DOMException('Missing','NotFoundError');
        return {async getFile(){return new File([await window.operationDisk('read',file)],child);},
          async createWritable(){let value;return {async write(text){value=text;},async close(){await window.operationDisk('write',file,value);},async abort(){}};}};
      }};}
    window.showDirectoryPicker=async()=>directory('');
  });
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin!==origin || !['/index.html','/catalog.json','/starters.json'].includes(url.pathname)){
      unexpectedRequests.push(url.href);return route.abort();
    }
    return route.fulfill({contentType:url.pathname==='/index.html'?'text/html':'application/json',
      body:url.pathname==='/index.html'?await readFile(path.join(root,'workbench/flowspec.html'),'utf8'):'[]'});
  });
  await page.goto(origin+'/index.html');
  return {errors,unexpectedRequests,read:async name=>JSON.parse(await readFile(path.join(session,name),'utf8')),
    async write(name,value){
      const temporary=path.join(session,'.agent-write-'+(++writeId));
      try{await writeFile(temporary,JSON.stringify(value),{flag:'wx'});await rename(temporary,path.join(session,name));}finally{await rm(temporary,{force:true});}
    },
    run:(...args)=>JSON.parse(execFileSync('python3',[path.join(session,'folder-agent.py'),...args],{cwd:session,encoding:'utf8'})),
    cleanup:()=>rm(folder,{recursive:true,force:true})};
}

test('risky operation envelopes reject atomically; an exact rename applies as one undoable change',async({page})=>{
  const h=await folderSession(page);
  try{
    const raw=JSON.parse(source);raw.page.blocks[0].id='delivery';
    const original=JSON.stringify(raw,null,2).replace('"title": "Browser contract"','"title"  :  "Browser contract"');
    await page.locator('#welcome-paste').click();await page.locator('#welcome-json').fill(original);
    await page.locator('#welcome-paste-form button[type=submit]').click();
    // Pasting itself is undoable. Record that earlier history entry rather
    // than assuming a newly opened story has an empty Undo stack.
    await page.locator('#undo-builder').click();const previous=await page.locator('#src').inputValue();expect(previous).not.toBe(original);
    await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(original);
    await expect(page.locator('#undo-builder')).toBeEnabled();await expect(page.locator('#redo-builder')).toBeDisabled();
    await page.locator('#editor-tab-agent').click();
    if(!await page.locator('#folder-agent-guide').isVisible())await page.locator('#folder-agent-open-setup').click();
    await page.locator('#folder-agent-connect').click();await expect(page.locator('#folder-agent-send')).toBeEnabled();
    await page.locator('#folder-agent-close-guide').click();
    const text='Rename node b in section delivery to Delivery service. Preserve every other authored field.';
    await page.locator('#folder-agent-input').fill(text);await page.locator('#folder-agent-send').click();
    await expect.poll(async()=>{try{return (await h.read('request.json')).text;}catch(error){if(error.code==='ENOENT')return null;throw error;}}).toBe(text);
    const request=await h.read('request.json'),state=await h.read('state.json'),manifest=await h.read('session.json');
    const renameOperation={op:'updateNode',sectionId:'delivery',nodeId:'b',patch:{title:'Delivery service'}};
    async function result(id){
      await expect.poll(async()=>{try{return (await h.read('result.json')).id;}catch(error){if(error.code==='ENOENT')return null;throw error;}}).toBe(id);
      return h.read('result.json');
    }
    async function unchanged(){
      await expect(page.locator('#src')).toHaveValue(original);
      await expect(page.locator('#undo-builder')).toBeEnabled();await expect(page.locator('#redo-builder')).toBeDisabled();
      expect((await h.read('state.json')).revision).toBe(state.revision);
      await expect(page.locator('[data-dv-node="b"]')).toContainText('Backend');
    }
    // Deliberately bypass helper input validation: the editor boundary must
    // reject a string flag instead of interpreting it as permission to apply.
    await h.write('proposal.json',{...manifest,id:'malformed-dry-run',requestId:request.id,baseRevision:state.revision,operations:[renameOperation],dryRun:'true'});
    expect(await result('malformed-dry-run')).toMatchObject({status:'rejected',revision:state.revision,message:expect.stringMatching(/dryRun.*true or false/i)});
    await unchanged();
    // The first operation is valid; a later dangling reference must reject
    // the entire transaction without publishing that otherwise valid rename.
    await h.write('operations.json',[renameOperation,{op:'insertStep',sectionId:'delivery',afterStepId:'done',step:{id:'missing-node-step',text:'Unspecified service completes the work',nodes:['not-authored']}}]);
    const rejected=h.run('propose','--request',request.id,'--revision',state.revision,'--operations','operations.json','--summary','Invalid reference pressure test');
    expect(await result(rejected.id)).toMatchObject({status:'rejected',revision:state.revision,message:expect.stringContaining('not-authored')});
    await unchanged();
    await h.write('operations.json',[renameOperation]);
    const accepted=h.run('propose','--request',request.id,'--revision',state.revision,'--operations','operations.json','--summary','Rename exactly one service');
    expect(await result(accepted.id)).toMatchObject({status:'applied'});
    const expected=structuredClone(raw);expected.page.blocks[0].diagram.nodes.b.title='Delivery service';
    await expect.poll(async()=>JSON.parse(await page.locator('#src').inputValue())).toEqual(expected);
    const changed=await page.locator('#src').inputValue();
    await expect(page.locator('[data-dv-node="b"]')).toContainText('Delivery service');
    h.run('reply','--request',request.id,'--text','Renamed exactly one service.');await expect(page.locator('#folder-agent-send')).toBeEnabled();
    await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);
    await expect(page.locator('#undo-builder')).toBeEnabled();await expect(page.locator('#redo-builder')).toBeEnabled();
    await expect(page.locator('[data-dv-node="b"]')).toContainText('Backend');
    // The next Undo must be the original paste, proving the rejected batch
    // and accepted transaction introduced no hidden or duplicate entries.
    await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(previous);
    await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(original);
    await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(changed);
    await expect(page.locator('#redo-builder')).toBeDisabled();
    expect(h.errors).toEqual([]);expect(h.unexpectedRequests).toEqual([]);
  }finally{await page.close();await h.cleanup();}
});
