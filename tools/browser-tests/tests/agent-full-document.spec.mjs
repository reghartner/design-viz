import {test,expect} from '@playwright/test';
import {readFile,writeFile,mkdir,mkdtemp,rm,rename,stat} from 'node:fs/promises';
import {execFileSync,spawn} from 'node:child_process';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {source} from '../fixtures/editor-spec.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const origin='https://flowview-full-source-pressure.test';

// Only native directory picking/handles are substituted. The built editor,
// folder client, exchange, renderer, history and Python
// helper and watcher are real. No model or native permission grant is claimed.
async function folderSession(page){
  const folder=await mkdtemp(path.join(tmpdir(),'flowview-full-source-pressure-'));
  let session,writeId=0,listener;const errors=[],unexpectedRequests=[];
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
      try{await writeFile(temporary,typeof value==='string'?value:JSON.stringify(value),{flag:'wx'});await rename(temporary,path.join(session,name));}finally{await rm(temporary,{force:true});}
    },
    run:(...args)=>JSON.parse(execFileSync('python3',[path.join(session,'folder-agent.py'),...args],{cwd:session,encoding:'utf8'})),
    listen:async()=>{
      listener=spawn('python3',[path.join(session,'folder-agent.py'),'watch','--minutes','2'],{stdio:'ignore'});
      await expect(page.locator('#folder-agent-connection')).toHaveText('Claude listener active');
    },
    cleanup:async()=>{listener?.kill();if(listener && listener.exitCode===null)await new Promise(resolve=>listener.once('close',resolve));await rm(folder,{recursive:true,force:true});}};
}

test('retired API and invalid full source preserve exact history; a reviewed document and ledger apply once',async({page})=>{
  const h=await folderSession(page);
  try{
    const raw=JSON.parse(source);raw.page.blocks[0].id='delivery';
    const original=JSON.stringify(raw,null,2).replace('"title": "Browser contract"','"title"  :  "Browser contract"');
    await page.locator('#welcome-paste').click();await page.locator('#welcome-json').fill(original);
    await page.locator('#welcome-paste-form button[type=submit]').click();
    // Opening a story starts its own history. Rejected proposals must leave
    // that empty stack untouched, and an accepted document adds one entry.
    await expect(page.locator('#src')).toHaveValue(original);
    await expect(page.locator('#undo-builder')).toBeDisabled();await expect(page.locator('#redo-builder')).toBeDisabled();
    await page.locator('#editor-tab-agent').click();
    if(!await page.locator('#folder-agent-guide').isVisible())await page.locator('#folder-agent-open-setup').click();
    await page.locator('#folder-agent-workflow').selectOption('embedded');await page.locator('#folder-agent-connect').click();await expect(page.locator('#folder-agent-copy')).toBeEnabled();
    await page.locator('#folder-agent-close-guide').click();await h.listen();await expect(page.locator('#folder-agent-send')).toBeEnabled();
    const text='Rename node b in section delivery to Delivery service. Preserve every other authored field.';
    await page.locator('#folder-agent-input').fill(text);await page.locator('#folder-agent-send').click();
    await expect.poll(async()=>{try{return (await h.read('request.json')).text;}catch(error){if(error.code==='ENOENT')return null;throw error;}}).toBe(text);
    const request=await h.read('request.json'),state=await h.read('state.json'),manifest=await h.read('session.json');
    const renameOperation={op:'updateNode',sectionId:'delivery',nodeId:'b',patch:{title:'Delivery service'}};
    async function result(id){
      await expect.poll(async()=>{try{return (await h.read('result.json')).id;}catch(error){if(error.code==='ENOENT')return null;throw error;}}).toBe(id);
      return h.read('result.json');
    }
    async function reject(){
      await page.locator('#agent-update-open').click();
      await expect(page.locator('#agent-update-commit')).toBeDisabled();
      await page.locator('#agent-update-return').click();
    }
    async function unchanged(){
      await expect(page.locator('#src')).toHaveValue(original);
      await expect(page.locator('#undo-builder')).toBeDisabled();await expect(page.locator('#redo-builder')).toBeDisabled();
      expect((await h.read('state.json')).revision).toBe(state.revision);
      await expect(page.locator('#docview [data-dv-node="b"]')).toContainText('Backend');
    }
    // A stale helper must not apply operations, or silently apply accompanying source.
    const expected=structuredClone(raw);expected.page.blocks[0].diagram.nodes.b.title='Delivery service';
    for(const [id,extra] of [['retired-operations',{operations:[renameOperation]}],['retired-dry-run',{dryRun:'true',source:JSON.stringify(expected)}]]){
      await h.write('proposal.json',{...manifest,id,requestId:request.id,baseRevision:state.revision,...extra});
      await page.locator('#agent-update-open').click();
      await expect(page.locator('#agent-update-feedback')).toHaveValue(/complete updated document/);
      await expect(page.locator('#agent-update-commit')).toBeDisabled();
      await page.locator('#agent-update-return').click();
      expect(await result(id)).toMatchObject({status:'rejected',revision:state.revision});
      await unchanged();
    }
    // The complete document still passes through the editor validator.
    await h.write('proposal.json',{...manifest,id:'invalid-document',requestId:request.id,baseRevision:state.revision,source:'{"page":{"blocks":[{"diagram":{"nodes":{}}}]}}'});
    await reject();
    expect(await result('invalid-document')).toMatchObject({status:'rejected',revision:state.revision});
    await unchanged();
    await h.write('candidate.spec.json',expected);
    const ledger='# Coverage\n\nNode b in section delivery is named Delivery service. Other fields are preserved.\n';
    await h.write('candidate.ledger.md',ledger);
    const accepted=h.run('propose','--request',request.id,'--revision',state.revision,'--file','candidate.spec.json','--ledger','candidate.ledger.md','--summary','Rename exactly one service');
    await page.locator('#agent-update-open').click();
    await expect(page.locator('#agent-update-ledger')).toHaveText(ledger);
    await unchanged();
    await page.locator('#agent-update-commit').click();
    expect(await result(accepted.id)).toMatchObject({status:'applied'});
    await expect.poll(async()=>JSON.parse(await page.locator('#src').inputValue())).toEqual(expected);
    const changed=await page.locator('#src').inputValue();
    await expect(page.locator('#docview [data-dv-node="b"]')).toContainText('Delivery service');
    h.run('reply','--request',request.id,'--text','Renamed exactly one service.');await expect(page.locator('#folder-agent-send')).toBeEnabled();
    await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);
    await expect(page.locator('#undo-builder')).toBeDisabled();await expect(page.locator('#redo-builder')).toBeEnabled();
    await expect(page.locator('#docview [data-dv-node="b"]')).toContainText('Backend');
    // No earlier or duplicate action remains, including a different project.
    await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(changed);
    await expect(page.locator('#redo-builder')).toBeDisabled();
    expect(h.errors).toEqual([]);expect(h.unexpectedRequests).toEqual([]);
  }finally{await page.close();await h.cleanup();}
});
