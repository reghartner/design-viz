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
  const legacy={sessionId:'session',connectionId:'connection'},stampNote=/Commit does not itself refresh compatibility metadata;[^\n]*verify the actual accepted metadata before claiming it was stamped\./;
  for(const workflow of ['external','embedded'])for(const resume of [false,true]){
    const prompt=context.folderAgentInstructions('Doorbell','mixed',resume,identity,workflow);
    assert.ok(prompt.includes('Read .flowview-agent/CONNECT.md and folder-agent.py before running anything.'),workflow);
    assert.ok(prompt.includes('Run python3 "<diagram folder>/.flowview-agent/folder-agent.py" prepare. Read .flowview-agent/authoring/docs/folder-agent-existing-edit.md first'),workflow);
    assert.doesNotMatch(prompt,/hld-to-page\/SKILL\.md|docs\/folder-agent-session\.md/);
    assert.match(prompt,stampNote,workflow);
    const old=context.folderAgentInstructions('Doorbell','mixed',resume,legacy,workflow);
    assert.match(old,/prepare\. Read \S*authoring\/docs\/folder-agent-existing-edit\.md first/,'legacy '+workflow);
    assert.doesNotMatch(old,/hld-to-page\/SKILL\.md|docs\/folder-agent-session\.md/);
    assert.match(old,stampNote,'legacy '+workflow);
  }
});
test('the existing-edit guide escalates to the full skill and widget_doc, where the clip cue lives',()=>{
  // The clip-evidence cue reaches connected agents only through SKILL.md (new diagrams, via escalation)
  // and widget_doc.py deviceapp/screen (positional lookups); tests/test_folder_agent.py checks both texts.
  const guide=require('node:fs').readFileSync(require('node:path').join(__dirname,'../docs/folder-agent-existing-edit.md'),'utf8'),escalate=guide.split('## Escalate')[1].split('## Protocol')[0];
  assert.match(escalate,/\(\.\.\/\.claude\/skills\/hld-to-page\/SKILL\.md\)/);
  assert.match(escalate,/a new diagram/);
  assert.match(guide,/python3 tools\/widget_doc\.py <type>/);
});
