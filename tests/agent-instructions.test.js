const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readSource}=require('../tools/source-loader.cjs');
const context=vm.createContext({});vm.runInContext(readSource('workbench/agent-chat.js'),context);
const identity={sessionId:'session',connectionId:'connection',artifacts:{spec:'story.spec.json',ledger:'story.ledger.md',metadata:'.flowview-agent'}};
test('recommended copy/paste setup never instructs starting or renewing a monitor',()=>{
  for(const resume of [false,true]){
    const prompt=context.folderAgentInstructions('Doorbell','mixed',resume,identity,'external');
    assert.match(prompt,/Do not start Monitor, a watcher, a polling loop, or a background listener/);
    assert.doesNotMatch(prompt,/watch --minutes|Renew Monitor|Start Monitor|preflight --monitor/);
    assert.doesNotMatch(prompt,/progress --request|every 20 seconds/);
    assert.match(prompt,/prepare/);assert.match(prompt,/propose --request/);assert.match(prompt,/Commit update/);
  }
});
test('explicit Beta setup retains its bounded Monitor instructions',()=>{
  const prompt=context.folderAgentInstructions('Doorbell','mixed',false,identity,'embedded');
  assert.match(prompt,/Start Monitor/);assert.match(prompt,/watch --minutes 25/);assert.match(prompt,/Renew Monitor only while editor.json is connected/);
  assert.match(prompt,/progress --request/);
});
test('both setups load the existing-edit guide first instead of the full skill and session guide',()=>{
  for(const workflow of ['external','embedded']){
    const prompt=context.folderAgentInstructions('Doorbell','mixed',false,identity,workflow);
    assert.ok(prompt.includes('Read .flowview-agent/CONNECT.md and folder-agent.py before running anything.'));
    assert.ok(prompt.includes('prepare. Read .flowview-agent/authoring/docs/folder-agent-existing-edit.md first'));
    assert.doesNotMatch(prompt,/hld-to-page\/SKILL\.md|docs\/folder-agent-session\.md/);
  }
});
