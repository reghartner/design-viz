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
},{scope:'worker'}]});
const read=(server,name)=>readFile(path.join(server.scratch,name+'.json'),'utf8').then(JSON.parse);
async function state(server,predicate){let value;await expect.poll(async()=>{value=await read(server,'state');return predicate(value);}).toBe(true);return value;}
async function propose(server,value){const temp=path.join(server.scratch,'proposal.tmp');await writeFile(temp,JSON.stringify(value));await rename(temp,path.join(server.scratch,'proposal.json'));}
async function result(server,id,status){await expect.poll(async()=>{try{const r=await read(server,'result');return [r.id,r.status];}catch{return null;}}).toEqual([id,status]);}

test('files exchange selected nodes and live edits with one Undo, preserved view and no browser-agent calls',async({page,server})=>{
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
  await page.locator('#local-agent-toggle').click();await state(server,s=>!s.connected);
});

test('stale and invalid edits are rejected, focused typing waits, disconnect stops file updates',async({page,server})=>{
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
  await page.locator('#local-agent-toggle').click();const stopped=await state(server,s=>!s.connected);
  await propose(server,{id:'paused',baseRevision:stopped.revision,source});
  await page.locator('#editor-tab-json').click();await page.locator('#src').fill(next+'\n');
  expect((await read(server,'state')).source).toBe(next);
  await page.locator('#local-agent-toggle').click();await result(server,'paused','rejected');
  await expect(page.locator('#src')).toHaveValue(next+'\n');
  await page.locator('#local-agent-toggle').click();await state(server,s=>!s.connected);
});
