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
test('both registered routes edit seeded request candidates and keep the legacy fallback',()=>{
  for(const workflow of ['external','embedded']){
    const prompt=context.folderAgentInstructions('Doorbell','mixed',false,identity,workflow);
    assert.match(prompt,/prepare\. Read \.flowview-agent\/authoring\/\.claude\/skills\/hld-to-page\/SKILL\.md/);
    assert.match(prompt,/verify both connection identities, the request id, editor\.connected and a heartbeat less than 15 seconds old/);
    assert.match(prompt,/request\.candidate names them/);assert.match(prompt,/Edit those copies instead of regenerating unrelated source/);
    assert.match(prompt,/inherited state, neighboring steps and supporting ledger evidence/);
    assert.match(prompt,/do not open the accepted files just to recreate them/);
    assert.doesNotMatch(prompt,/Open and preserve|read request\.json, state\.json and editor\.json|^Read the latest state\.json/m);
    assert.match(prompt,/If request\.json has no candidate, read the latest state\.json before planning/);
    assert.match(prompt,/If rejected, stale or conflicting, reread state\.json for the current pair and revision/);
    assert.match(prompt,/propose --request <request id> --revision <base revision> --file <candidate spec> --ledger <candidate ledger>/);
    assert.match(prompt,/Commit update/);assert.match(prompt,/reply --request <request id>/);
    assert.doesNotMatch(prompt,/--operations|assemble|fragment|extract/i);
  }
});
