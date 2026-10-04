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
test('the existing-edit guide prefers seeded request candidates and keeps the no-seed fallback',()=>{
  const guide=require('node:fs').readFileSync(require('node:path').join(__dirname,'../docs/folder-agent-existing-edit.md'),'utf8').replace(/\s+/g,' ');
  assert.match(guide,/If `request\.json` has `candidate`, confirm its `baseRevision` equals `request\.revision`/);
  assert.match(guide,/edit those complete seeded copies/);assert.match(guide,/Never write another request's candidates/);
  assert.match(guide,/Without `candidate`, read `state\.json` immediately before planning, keep its revision as the base, and write complete `candidate\.spec\.json` and `candidate\.ledger\.md`/);
  assert.match(guide,/long `source`\/`ledger` lines are unreadable, use the `project\.json` pair only per the checked fallback in the \[folder session\]\(folder-agent-session\.md\); never an older candidate/);
  assert.match(guide,/On rejection, stale revision or conflict, reread `state\.json` for the current pair and revision and reconcile them and any feedback into your candidates without discarding their edits; never relabel an old proposal/);
  assert.match(guide,/propose` with your candidate pair and base revision/);
});
test('both registered routes edit seeded request candidates and keep the legacy fallback',()=>{
  for(const workflow of ['external','embedded']){
    const prompt=context.folderAgentInstructions('Doorbell','mixed',false,identity,workflow);
    assert.match(prompt,/prepare\. Read \.flowview-agent\/authoring\/docs\/folder-agent-existing-edit\.md first/);
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
test('both setup routes give browserless agents one truthful layout policy',()=>{
  for(const workflow of ['external','embedded']){
    const paragraphs=context.folderAgentInstructions('Doorbell','mixed',false,identity,workflow).split('\n\n');
    const policies=paragraphs.filter(paragraph=>paragraph.startsWith('Layout policy:'));
    assert.equal(policies.length,1,workflow);
    const policy=policies[0];
    assert.ok(policy.includes('no browser control'));
    assert.ok(policy.includes('node tools/auto-arrange-spec.cjs --section <zero-based section> <draft spec> <different arranged spec>'));
    assert.ok(policy.includes('wholly new diagram'));
    assert.ok(policy.includes('When adding a node, add only an unpositioned float'));
    assert.ok(policy.includes('preserve all rows, floats, coordinates, ports, bends, curve controls/points and label nudges'));
    assert.ok(policy.includes('press Auto arrange'));
  }
});
