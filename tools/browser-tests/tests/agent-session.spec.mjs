import {test as base,expect,paste} from '../helpers/test.mjs';
import {readFile,writeFile,rename,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {startAgentSession} from '../../agent-session.mjs';
import {source} from '../fixtures/editor-spec.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const test=base.extend({server:[async({},use)=>{
  const session=await startAgentSession({root});
  try{await use({...session,root});}finally{await session.close();await rm(session.scratch,{recursive:true,force:true});}
},{scope:'worker'}],disconnect:async({page,server,audit},use)=>{
  const pending=new Set();let disconnecting=false;
  const started=request=>{if(request.url()!==server.origin+'/__flowview_agent/sync' || request.postDataJSON()?.disconnect)return;pending.add(request);if(disconnecting)audit.allowAbort(request);};
  const ended=request=>pending.delete(request);
  page.on('request',started);page.on('requestfinished',ended);page.on('requestfailed',ended);
  try{await use(async()=>{
    disconnecting=true;pending.forEach(request=>audit.allowAbort(request));
    try{await page.locator('#local-agent-toggle').click();return await state(server,s=>!s.connected);}
    finally{disconnecting=false;}
  });}finally{page.off('request',started);page.off('requestfinished',ended);page.off('requestfailed',ended);}
}});
const read=(server,name)=>readFile(path.join(server.scratch,name+'.json'),'utf8').then(JSON.parse);
async function state(server,predicate){let value;await expect.poll(async()=>{value=await read(server,'state');return predicate(value);}).toBe(true);return value;}
async function propose(server,value){const temp=path.join(server.scratch,'proposal.tmp');await writeFile(temp,JSON.stringify(value));await rename(temp,path.join(server.scratch,'proposal.json'));}
async function result(server,id,status){await expect.poll(async()=>{try{const r=await read(server,'result');return [r.id,r.status];}catch{return null;}}).toEqual([id,status]);}

test('files exchange selected nodes and live edits with one Undo, preserved view and no browser-agent calls',async({page,server,disconnect})=>{
  await page.goto(server.origin+'/workbench/flowspec.html');await paste(page,source);
  await page.locator('[data-dv-node="a"]').click();
  const current=await state(server,s=>s.open && s.selection.some(t=>t.id==='a'));
  expect(current.views[0].view).toBe('brief');
  const edited=source.replace('"title": "Doorbell"','"title": "Agent camera"');
  await propose(server,{id:'rename',baseRevision:current.revision,source:edited,summary:'Renamed the camera'});
  await result(server,'rename','applied');await expect(page.locator('#src')).toHaveValue(edited);
  await expect(page.locator('[data-dv-node="a"]')).toContainText('Agent camera');
  const after=await state(server,s=>s.source===edited);expect(after.views[0].view).toBe(current.views[0].view);
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(source);
  await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(edited);
  let release,arrived;const held=new Promise(resolve=>{release=resolve;}),pending=new Promise(resolve=>{arrived=resolve;});
  await page.route(server.origin+'/__flowview_agent/sync',async route=>{
    if(route.request().postDataJSON()?.disconnect){await route.continue();return;}
    const response=await route.fetch();arrived();await held;await route.fulfill({response});
  });
  await pending;await disconnect();release();
  await expect(page.locator('#src')).toHaveValue(edited);
});

test('stale and invalid edits are rejected, focused typing waits, disconnect stops file updates',async({page,server,disconnect})=>{
  await page.goto(server.origin+'/workbench/flowspec.html');await paste(page,source);
  const current=await state(server,s=>s.open && s.source===source);
  await page.locator('[data-dv-node="a"]').click();
  const title=page.locator('#guide').getByLabel('title',{exact:true});await title.fill('Human camera');await title.press('Enter');
  const human=source.replace('"title": "Doorbell"','"title": "Human camera"');
  await expect(page.locator('#src')).toHaveValue(human);
  await propose(server,{id:'stale',baseRevision:current.revision,source});await result(server,'stale','rejected');
  await expect(page.locator('#src')).toHaveValue(human);
  await page.locator('[data-dv-node="b"]').click();
  const fresh=await state(server,s=>s.source===human);
  await propose(server,{id:'invalid',baseRevision:fresh.revision,source:'{broken'});await result(server,'invalid','rejected');
  await expect(page.locator('#src')).toHaveValue(human);
  const next=human.replace('Human camera','Agent camera');
  await page.locator('#guide').getByLabel('title',{exact:true}).focus();
  await propose(server,{id:'wait',baseRevision:fresh.revision,source:next});
  await expect(page.locator('#local-agent-toggle')).toHaveAttribute('title',/waiting/);
  await expect(page.locator('#src')).toHaveValue(human);
  await page.locator('[data-dv-node="a"]').click();await result(server,'wait','applied');
  const stopped=await disconnect();
  await propose(server,{id:'paused',baseRevision:stopped.revision,source});
  await page.locator('#editor-tab-json').click();await page.locator('#src').fill(next+'\n');
  expect((await read(server,'state')).source).toBe(next);
  await page.locator('#local-agent-toggle').click();await result(server,'paused','rejected');
  await expect(page.locator('#src')).toHaveValue(next+'\n');
  await disconnect();
});

test('local helper automatically acquires an unloaded pinned topology provider with one Undo and no materialized source',async({page,server,disconnect})=>{
  const {digest}=await import('../../../tools/canon/drift.mjs');
  const providers=['browsed','submitted'].map(id=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},sections:[{diagram:{nodes:{api:{title:id+' API'}},rows:[['api']],topologyExports:{public:{nodes:['api'],edges:[]}}}}]}}));
  const catalog={version:3,diagrams:providers.map(spec=>({id:spec.page.canon.id,title:spec.page.title,canon:spec.page.canon,counts:{nodes:1,steps:0,panels:0},revision:digest(spec),specUrl:spec.page.canon.id+'.json'}))},hits=[];
  await page.route('**/diagrams.json',route=>route.fulfill({json:catalog}));
  for(const spec of providers)await page.route('**/'+spec.page.canon.id+'.json',route=>{hits.push(spec.page.canon.id);return route.fulfill({json:spec});});
  await page.goto(server.origin+'/workbench/flowspec.html');await paste(page,source);
  await page.locator('#diagram-add').click();await page.locator('#add-topology').click();await page.locator('#topology-connect').click();
  await expect(page.locator('#topology-add')).toBeEnabled();await page.locator('#topology-cancel').click();
  const current=await state(server,s=>s.open && s.source===source && s.topologyRevision>1);
  const raw=JSON.parse(source);raw.page.blocks[0].diagram.topologyImports=[{spec:'submitted',export:'public',as:'shared'}];const edited=JSON.stringify(raw,null,2);
  await propose(server,{id:'topology',baseRevision:current.revision,source:edited,topologyContext:{catalogURL:'https://untrusted.invalid/diagrams.json'}});
  await result(server,'topology','applied');await expect(page.locator('#src')).toHaveValue(edited);
  await expect(page.locator('#docview [data-dv-node="shared::api"]')).toBeVisible();expect(hits).toEqual(['browsed','submitted']);
  expect(edited).not.toContain('shared::api');expect(edited).not.toContain('topologyProvenance');
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(source);await expect(page.locator('#undo-builder')).toBeDisabled();
  await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(edited);await disconnect();
});
