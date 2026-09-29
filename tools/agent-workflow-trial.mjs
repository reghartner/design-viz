#!/usr/bin/env node
/** Opt-in live Claude pressure trial. Uses real UI/files; substitutes only the native folder grant.
 * node tools/agent-workflow-trial.mjs --output NEW_DIRECTORY [--native-only]
 * Never runs in the default test suite. Model calls use the machine's existing Claude login.
 */
import assert from 'node:assert/strict';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {createRequire} from 'node:module';
import {setTimeout as delay} from 'node:timers/promises';
import {createSession} from './agent-authoring-workbench.mjs';
import {editorSpec} from './browser-tests/fixtures/editor-spec.mjs';

const require = createRequire(new URL('./browser-tests/package.json', import.meta.url));
const {chromium, expect} = require('@playwright/test');
const model = 'claude-opus-5-5';
const args = process.argv.slice(2);
if (![2,3].includes(args.length) || args[0] !== '--output' || args.length===3 && args[2]!=='--native-only') throw Error('Usage: node tools/agent-workflow-trial.mjs --output NEW_DIRECTORY [--native-only]');
const output = path.resolve(args[1]);
await mkdir(output);
const report = {model, startedAt: new Date().toISOString(), nativePicker: 'disk-backed adapter', cases: [], agents: []};
const save = () => writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
async function readJSON(file) {try {return JSON.parse(await readFile(file, 'utf8'));} catch(error) {if(error.code==='ENOENT')return null;throw error;}}
async function waitFor(check, label, timeout=300000) {
  const start=Date.now();
  while(Date.now()-start<timeout) {const value=await check();if(value)return value;await delay(250);}
  throw Error('Timed out: '+label);
}
async function passed(name, details={}) {report.cases.push({name,status:'passed',...details});await save();process.stdout.write(JSON.stringify({case:name,status:'passed'})+'\n');}

class Claude {
  constructor(session) {
    this.events=[];this.results=[];this.buffer='';this.exited=false;this.session=session;this.pending=Promise.resolve();
    const folder=session.sessionPath, relative='./'+path.basename(folder);
    const allowed=['Read(./**)','Glob(./**)','Grep(./**)','Monitor'];
    for(const name of ['candidate.spec.json','story.ledger.md','answer.txt','progress.txt','baseline.json']) {
      allowed.push('Write('+relative+'/'+name+')','Edit('+relative+'/'+name+')');
    }
    for(const location of [folder,relative,relative.slice(2)])for(const quote of ['', '"', "'"])allowed.push(
      'Bash(python3 '+quote+location+'/folder-agent.py'+quote+' *)',
      'Bash(node '+quote+location+'/authoring/tools/validate.js'+quote+' *)',
      'Bash(python3 '+quote+location+'/authoring/.claude/skills/hld-to-page/scripts/spec_walk.py'+quote+' *)');
    allowed.push('Bash(python3 --version)','Bash(node --version)');
    this.process=spawn('claude',['--model',model,'--safe-mode','--restricted','--no-chrome',
      '--strict-mcp-config','--mcp-config','{"mcpServers":{}}','--tools','Read,Write,Edit,Glob,Grep,Bash,Monitor',
      '--allowedTools',...allowed,'--permission-mode','dontAsk','--permission-prompts','none',
      '--append-system-prompt','Keep trial responses concise. Use Read/Write/Edit for files. The permitted Bash commands are the local folder-agent.py helper, bundled validate.js, bundled spec_walk.py, and Python/Node version checks. Run these commands individually with literal paths, without shell variables or compound commands. Other Bash commands are not pre-approved. Do not work around a permission denial.',
      '--no-session-persistence','--print','--verbose','--input-format','stream-json','--output-format','stream-json'],
      {cwd:session.projectPath,stdio:['pipe','pipe','pipe']});
    this.stderr='';this.process.stderr.on('data',data=>this.stderr+=data);
    this.process.stdout.on('data',data=>{
      this.buffer+=data;
      while(this.buffer.includes('\n')) {
        const index=this.buffer.indexOf('\n'),line=this.buffer.slice(0,index);this.buffer=this.buffer.slice(index+1);
        try {
          const event=JSON.parse(line);this.events.push(event);
          if(event.type==='system' && event.subtype==='init') {
            this.init=event;
            process.stdout.write(JSON.stringify({agent:session.runId,model:event.model,tools:event.tools})+'\n');
          }
          if(event.type==='result')this.results.push(event);
          if(event.type==='assistant')for(const block of event.message?.content??[]) {
            if(block.type==='tool_use')process.stdout.write(JSON.stringify({agent:session.runId,tool:block.name,input:block.input})+'\n');
            if(block.type==='text')process.stdout.write(JSON.stringify({agent:session.runId,text:block.text})+'\n');
          }
        } catch {}
      }
    });
    this.process.on('error',error=>{this.error=error.message;this.exited=true;});
    this.process.on('close',code=>{this.code=code;this.exited=true;});
  }
  send(text) {
    // Sending another input during an active print-mode turn may coalesce it
    // with that turn. Finish the previous turn before sending the next one.
    this.pending=this.pending.then(async()=>{
      assert(!this.exited,'Claude exited: '+this.stderr);
      const before=this.results.length;
      this.process.stdin.write(JSON.stringify({type:'user',message:{role:'user',content:text}})+'\n');
      await waitFor(()=>{
        if(this.exited)throw Error('Claude exited: '+this.stderr);
        return this.results.length>before;
      },'Claude turn');
      assert.equal(this.init.model,model);
      const result=this.results.at(-1);assert.equal(result.is_error,false,result.result);
      return result;
    });
    this.pending.catch(()=>{});
    return this.pending;
  }
  async turn(text) {
    const result=await this.send(text);
    await this.capture();
    return result;
  }
  async capture() {
    await writeFile(path.join(this.session.outDir,'claude-events.jsonl'),this.events.map(event=>JSON.stringify(event)).join('\n')+'\n');
    await writeFile(path.join(this.session.outDir,'claude-stderr.txt'),this.stderr);
  }
  async stop() {
    this.process.kill('SIGTERM');await delay(300);if(!this.exited)this.process.kill('SIGKILL');
    await this.capture();
    report.agents.push({runId:this.session.runId,model:this.init?.model,tools:this.init?.tools,
      results:this.results.map(result=>({subtype:result.subtype,usage:result.modelUsage,denials:result.permission_denials}))});
  }
}

const browser=await chromium.launch({headless:true});
report.browser=browser.version();
const sessions=[],agents=[];
async function connect(name,workflow) {
  const context=await browser.newContext({viewport:{width:1800,height:1200},reducedMotion:'reduce'});
  await context.grantPermissions(['clipboard-read','clipboard-write']);
  const page=await context.newPage(), spec=editorSpec();
  spec.page.blocks[0].diagram.nodes.b.binding={entityRef:'component:default/backend'};
  const faults={delayNextRequest:0,delayAfterRequestWrite:0};
  const session=await createSession(page,path.join(output,name),{workflow,seedSource:JSON.stringify(spec,null,2),beforeWrite:async name=>{
    if(name==='request.json' && faults.delayNextRequest){const duration=faults.delayNextRequest;faults.delayNextRequest=0;await delay(duration);}
  },afterWrite:async name=>{
    if(name==='request.json' && faults.delayAfterRequestWrite){const duration=faults.delayAfterRequestWrite;faults.delayAfterRequestWrite=0;await delay(duration);}
  }});
  session.faults=faults;
  sessions.push(session);session.page=page;session.read=name=>readJSON(path.join(session.sessionPath,name));
  await mkdir(path.join(session.projectPath,'docs'));
  await writeFile(path.join(session.projectPath,'docs/backend.md'),'# Backend\nThe public name for node b is Delivery API. It accepts doorbell events and stores recordings.\n');
  await writeFile(path.join(session.outDir,'connection-prompt.txt'),session.instructions);
  const agent=new Claude(session);agents.push(agent);session.agent=agent;
  return session;
}
async function edit(session,modify) {
  const page=session.page,doc=JSON.parse(await page.locator('#src').inputValue());modify(doc);
  const source=JSON.stringify(doc,null,2);
  await page.locator('#editor-tab-json').click();await page.locator('#src').fill(source);await page.locator('#go').click();
  await waitFor(async()=>(await session.read('state.json')).source===source,'human edit publication',15000);
  return source;
}
async function preview(session,previous) {
  const proposal=await waitFor(async()=>{
    const value=await session.read('proposal.json');return value?.id!==previous?.id?value:null;
  },'real Claude proposal');
  await expect(session.page.locator('#agent-update-open')).toBeVisible({timeout:15000});
  await session.page.locator('#agent-update-open').click();
  return proposal;
}
async function commit(session,proposal,name) {
  await expect(session.page.locator('#agent-update-commit')).toBeEnabled();
  await session.page.screenshot({path:path.join(session.outDir,name+'.png')});
  await session.page.locator('#agent-update-commit').click();
  const result=await waitFor(async()=>{const r=await session.read('result.json');return r?.id===proposal.id?r:null;},'commit receipt',15000);
  assert.equal(result.status,'applied');return result;
}
async function finish(session) {
  await session.agent.pending;
  if((await session.read('reply.json'))?.requestId!==(await session.read('request.json'))?.id)
    await session.agent.turn('I committed the preview. Read the matching result.json and give the brief completion receipt through the helper, then wait for my next request here.');
  await waitFor(async()=>{const reply=await session.read('reply.json'),request=await session.read('request.json');return reply?.requestId===request?.id;},'helper completion receipt',15000);
}
const prepare='Prepare and validate the complete candidate and record the exact starting revision in story.ledger.md. Stop before proposing it and wait for me to say Submit. Keep this request active; do not send the final helper reply yet.';
try {
  if(args.includes('--native-only')){
    const session=await connect('native','external'),page=session.page,agent=session.agent;
    await agent.turn(session.instructions+'\n\nConnect for native conversation without Monitor, then wait.');
    session.faults.delayAfterRequestWrite=9000;
    await agent.turn('New native request: rename node c to Checked archive. '+prepare+' If begin fails, report the error and wait for me to retry. Do not work without acknowledgement.');
    await waitFor(async()=>(await session.read('agent-request.json'))?.withdrawn===true,'withdrawal after visible but unacknowledged request',15000);
    await delay(1500);
    await page.locator('#agent-message-open').click();await expect(page.locator('#agent-message-cancel-turn')).toBeHidden();await page.locator('#agent-message-close').click();
    const timedOut=(await session.read('agent-request.json')).id;
    assert.equal((await session.read('cancel.json')).requestId,timedOut);
    await passed('visible request file does not falsely acknowledge a paused browser; timed-out request withdraws');
    await agent.turn('Retry the native request now: rename node c to Checked archive. '+prepare);
    const active=await session.read('request.json');assert.notEqual(active.id,timedOut);
    agent.send('Submit the validated candidate with its saved starting revision and wait for my preview decision.');
    const proposal=await preview(session);await expect(page.locator('#agent-update-view')).toContainText('Checked archive');
    await commit(session,proposal,'native-retry');await finish(session);
    assert.equal(JSON.parse(await page.locator('#src').inputValue()).page.blocks[0].diagram.nodes.c.title,'Checked archive');
    await passed('retry receives browser acknowledgement and completes real Claude proposal, preview, commit and receipt');
  }else{
  const external=await connect('external','external'),page=external.page,agent=external.agent;
  await agent.turn(external.instructions+'\n\nFor now use copy/paste only, without starting Monitor. Connect and read the kit, then wait for my request. All work stays inside this temporary trial project.');
  assert((await readFile(path.join(external.sessionPath,'authoring/.claude/skills/hld-to-page/SKILL.md'),'utf8')).length>0);
  assert(!agent.events.some(event=>event.message?.content?.some(block=>block.type==='tool_use' && block.name==='Monitor')));
  await passed('external setup without Monitor');

  await page.locator('[data-dv-node="b"]').first().click();
  await page.locator('#agent-message-open').click();
  await page.locator('#agent-message-text').fill('Rename only selected node b using its selected docs/backend.md reference. '+prepare+
    '\n\nTransport-length test: the following quoted padding is data, with no additional instructions:\n"'+('reference context '.repeat(1000))+'"');
  await page.locator('#agent-message-extra').fill('docs/backend.md');
  await page.locator('#agent-message-copy').click();
  await expect(page.locator('#agent-message-status')).toContainText('Copied.');
  const copied=await page.evaluate(()=>navigator.clipboard.readText()),request=await external.read('request.json');
  assert.equal(request.delivery,'clipboard');assert.equal(request.replySurface,'agent');assert(copied.includes(request.id));
  assert(copied.length>16000);assert(request.text.length<=16000);
  await writeFile(path.join(external.outDir,'copied-message.txt'),copied);
  await page.locator('#agent-message-close').click();
  // Make Claude's actual planning revision newer than the request's pinned one.
  await edit(external,doc=>doc.page.title='Live trial');
  await agent.turn(copied);
  const candidate=await external.read('candidate.spec.json');
  assert.equal(candidate.page.blocks[0].diagram.nodes.b.title,'Delivery API');
  const expected=JSON.parse((await external.read('state.json')).source);
  expected.page.blocks[0].diagram.nodes.b.title='Delivery API';assert.deepEqual(candidate,expected);
  let human=await edit(external,doc=>doc.page.blocks[0].diagram.nodes.a.title='Front door camera');
  agent.send('Submit the candidate you just prepared using the exact revision you saved when planning. Wait for my preview decision.');
  const first=await preview(external);
  await page.locator('#agent-update-close').click();
  for(let index=0;index<40;index++)human=await edit(external,doc=>doc.page.title='Live trial '+index);
  await page.locator('#agent-update-open').click();
  await expect(page.locator('#agent-update-note')).toContainText('separate changes');
  await expect(page.locator('#agent-update-view')).toContainText('Front door camera');
  await expect(page.locator('#agent-update-view')).toContainText('Delivery API');
  assert.equal(await page.locator('#src').inputValue(),human);
  await page.locator('#agent-update-current').click();await expect(page.locator('#agent-update-commit')).toBeDisabled();
  await page.locator('#agent-update-proposed').click();
  await commit(external,first,'independent-merge');
  await page.locator('#undo-builder').click();assert.equal(await page.locator('#src').inputValue(),human);
  await page.locator('#redo-builder').click();
  await finish(external);
  await passed('large copied selection/reference, 40 edits retain planning baseline, full preview, commit, Undo/Redo');

  await agent.turn('New diagram request here in our native conversation: rename node b to Recording API. '+prepare);
  const native=await external.read('request.json');assert.notEqual(native.id,request.id);assert.equal(native.delivery,'native');
  const conflictHuman=await edit(external,doc=>doc.page.blocks[0].diagram.nodes.b.title='Customer recording service');
  agent.send('Submit the prepared candidate with its original saved revision and wait for my decision.');
  const conflict=await preview(external,first);
  await expect(page.locator('#agent-update-commit')).toBeDisabled();
  await expect(page.locator('#agent-update-feedback')).toHaveValue(/nodes\/b\/title/);
  assert.equal(await page.locator('#src').inputValue(),conflictHuman);
  await page.screenshot({path:path.join(external.outDir,'conflict.png')});
  await page.locator('#agent-update-copy-feedback').click();
  const feedback=await page.evaluate(()=>navigator.clipboard.readText());
  await writeFile(path.join(external.outDir,'conflict-feedback.txt'),feedback);
  await waitFor(async()=>(await external.read('result.json'))?.id===conflict.id,'conflict receipt',15000);
  agent.send(feedback+'\n\nKeep my title Customer recording service. Put your intended name Recording API in node b description. Read the latest source, validate, and propose that reconciliation.');
  const resolved=await preview(external,conflict);
  await expect(page.locator('#agent-update-view')).toContainText('Customer recording service');
  await expect(page.locator('#agent-update-view')).toContainText('Recording API');
  await commit(external,resolved,'reconciled');
  const merged=JSON.parse(await page.locator('#src').inputValue());
  assert.equal(merged.page.blocks[0].diagram.nodes.b.title,'Customer recording service');
  assert(JSON.stringify(merged.page.blocks[0].diagram.nodes.b).includes('Recording API'));
  await finish(external);
  await passed('native begin, same-field conflict, copy feedback, actual Claude reconciliation');

  await agent.turn('New diagram request: rename node c to Archive. '+prepare);
  const cancelled=await external.read('request.json'),beforeCancel=await page.locator('#src').inputValue();
  await page.locator('#agent-message-open').click();await page.locator('#agent-message-cancel-turn').click();await page.locator('#agent-message-close').click();
  await agent.turn('I stopped accepting that turn in the workbench. Check its cancellation through the helper before doing anything more. Do not submit it or attach it to another request.');
  assert.equal(await page.locator('#src').inputValue(),beforeCancel);
  await expect(page.locator('#agent-update-banner')).toBeHidden();
  await passed('stop accepting a real in-flight Claude request preserves source',{requestId:cancelled.id});

  external.faults.delayNextRequest=9000;
  await agent.turn('New native request: rename node c to Temporary archive. '+prepare+' If begin fails, report its error and wait for me to retry; do not submit without acknowledgement.');
  await waitFor(async()=>{const incoming=await external.read('agent-request.json');return incoming?.withdrawn===true;},'native timeout withdrawal',15000);
  await delay(1500);
  await page.locator('#agent-message-open').click();await expect(page.locator('#agent-message-cancel-turn')).toBeHidden();await page.locator('#agent-message-close').click();
  await agent.turn('Retry the native request now: rename node c to Temporary archive. '+prepare);
  await page.locator('#agent-message-open').click();await expect(page.locator('#agent-message-cancel-turn')).toBeVisible();await page.locator('#agent-message-cancel-turn').click();await page.locator('#agent-message-close').click();
  await agent.turn('Stop that retried turn; I cancelled it in the workbench. Confirm its cancellation and wait.');
  assert.equal(await page.locator('#src').inputValue(),beforeCancel);
  await passed('real native begin timeout withdraws a late disk publication and retry succeeds');

  await agent.turn('Now enable direct Send from the workbench using the optional Monitor described in our connection instructions. Keep our conversation in this native agent session. For this renewal trial, start the first watch with --minutes .1, then renew it with --minutes 25 when it expires while our editor remains connected. Deduplicate events. Start it and wait for a request.');
  await waitFor(async()=>{const listener=await external.read('listener.json');return listener?.at>Date.now()-15000;},'external optional Monitor',60000);
  await page.locator('#agent-message-open').click();
  await page.locator('#agent-message-text').fill('Rename node a to Entrance camera. Change only that title, validate, and propose for my preview.');
  await expect(page.locator('#agent-message-send')).toBeEnabled();await page.locator('#agent-message-send').click();
  if(await page.locator('#agent-message-dialog').isVisible())await page.locator('#agent-message-close').click();
  const optional=await preview(external,resolved);
  assert.equal((await external.read('request.json')).replySurface,'agent');
  await expect(page.locator('#agent-update-view')).toContainText('Entrance camera');
  await commit(external,optional,'external-monitor-preview');
  assert.equal(JSON.parse(await page.locator('#src').inputValue()).page.blocks[0].diagram.nodes.c.title,'Storage');
  await waitFor(async()=>(await external.read('reply.json'))?.requestId===optional.requestId,'external Monitor completion');
  assert(agent.events.filter(event=>event.message?.content?.some(block=>block.type==='tool_use'&&block.name==='Monitor')).length>=2);
  await passed('external workflow optional Monitor and direct Send');

  const embedded=await connect('monitor','embedded'),monitor=embedded.agent,mp=embedded.page;
  await monitor.turn(embedded.instructions+'\n\nConnect and keep Monitor active. No diagram request yet. All work stays inside this temporary trial project.');
  await waitFor(async()=>{const listener=await embedded.read('listener.json');return listener?.at>Date.now()-15000;},'Claude Monitor listener',60000);
  assert(monitor.events.some(event=>event.message?.content?.some(block=>block.type==='tool_use'&&block.name==='Monitor')));
  const sent=await embedded.sendControl({seq:1,text:'Before changing anything, ask me which name to use for node c. Send that question here in the workbench.',technicalLevel:'story'});
  await waitFor(async()=>(await embedded.read('reply.json'))?.requestId===sent.requestId,'Monitor question');
  await expect(mp.locator('#folder-agent-messages')).toContainText(/node c|Storage|name/i);
  const next=await embedded.sendControl({seq:2,text:'Use Evidence archive as the title for node c. Change only that title, validate, and propose the update for my preview.',technicalLevel:'story'});
  const direct=await preview(embedded);
  assert.equal(direct.requestId,next.requestId);
  await expect(mp.locator('#agent-update-view')).toContainText('Evidence archive');
  await commit(embedded,direct,'monitor-preview');
  await waitFor(async()=>(await embedded.read('reply.json'))?.requestId===next.requestId,'Monitor completion');
  await passed('real Monitor wake-up, embedded question/answer, proposal, commit result, completion');

  await mp.locator('#agent-message-open').click();
  await mp.locator('#agent-message-text').fill('Direct native-surface message: rename node a to Entrance camera, then validate and propose.');
  await expect(mp.locator('#agent-message-send')).toBeEnabled();await mp.locator('#agent-message-send').click();
  if(await mp.locator('#agent-message-dialog').isVisible())await mp.locator('#agent-message-close').click();
  const directNative=await preview(embedded,direct);
  assert.equal((await embedded.read('request.json')).replySurface,'agent');
  await expect(mp.locator('#agent-update-view')).toContainText('Entrance camera');
  await commit(embedded,directNative,'direct-native-preview');
  await waitFor(async()=>(await embedded.read('reply.json'))?.requestId===directNative.requestId,'direct native completion');
  await passed('Send message from workbench via actual Monitor with native reply surface');
  }
  for(const session of sessions) {
    assert.deepEqual(session.errors,[]);assert.deepEqual(session.unexpectedRequests,[]);
    await session.capture();
  }
  report.status='passed';
} catch(error) {
  report.status='failed';report.error=error.stack;process.stderr.write(error.stack+'\n');process.exitCode=1;
} finally {
  for(const agent of agents)await agent.stop();
  for(const session of sessions)try{await session.close();}catch(error){(report.cleanupErrors??=[]).push(error.message);}
  if(report.cleanupErrors?.length){report.status='failed';process.exitCode=1;}
  await browser.close();report.finishedAt=new Date().toISOString();await save();
}
