const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readSource}=require('../tools/source-loader.cjs');
const context=vm.createContext({});for(const file of ['workbench/focused-panel.js','workbench/agent-chat.js'])vm.runInContext(readSource(file),context);
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
const custom={...identity,artifacts:{spec:'payments flow.spec.json',ledger:'payments flow.ledger.md',metadata:'.agent meta'}};
function routes(prompt){
  const parts=prompt.split('\n\n'),full=parts.findIndex(part=>part.startsWith('Full route.'));
  assert.ok(full>0,'the full route follows the common setup');
  return {setup:parts.slice(0,full).join('\n\n'),full:parts.filter(part=>part.startsWith('Full route')).join('\n\n'),
    focused:parts.filter(part=>part.startsWith('Focused route')).join('\n\n'),after:parts.slice(full).filter(part=>!/^(Full|Focused) route/.test(part)).join('\n\n')};
}
test('setup keeps the main helper and kit steps but defers diagram reads and authoring guidance to the request route',()=>{
  for(const workflow of ['external','embedded']){
    const prompt=context.folderAgentInstructions('Payments','story',false,custom,workflow),{setup}=routes(prompt);
    assert.match(setup,/sessionId "session" and connectionId "connection"/);
    assert.ok(setup.includes('Read .agent meta/CONNECT.md and folder-agent.py before running anything.'));
    assert.ok(setup.includes('Run python3 "<diagram folder>/.agent meta/folder-agent.py" prepare to set up the authoring kit.'));
    assert.ok(setup.includes('VIZ is .agent meta/authoring/'));
    assert.ok(setup.includes('"payments flow.spec.json"') && setup.includes('"payments flow.ledger.md"'));
    assert.match(setup,/Python 3 and Node/);assert.match(setup,/without installing anything/);
    assert.match(setup,/Do not open either one during setup/);
    assert.doesNotMatch(setup,/state\.json|SKILL\.md|spec_walk|reread|Open and preserve/,'setup reads no full pair or skill');
    assert.match(setup,/Copy for agent action copies selection context only/);
    assert.match(setup,/the focused route when request\.mode is "focused-deviceapp", otherwise the full route/);
  }
});
test('the default route carries no compact-entrypoint, catalog or guide-map treatment',()=>{
  for(const workflow of ['external','embedded']){
    const prompt=context.folderAgentInstructions('Payments','story',false,custom,workflow);
    assert.doesNotMatch(prompt,/--catalog|--guide|--section|authoring entrypoint|compact entrypoint|you do not need to read/);
    // The device-app schema uses the existing positional widget_doc.py form.
    assert.ok(prompt.includes('python3 "<diagram folder>/.agent meta/authoring/tools/widget_doc.py" deviceapp'));
  }
});
test('every registered request runs the request-aware prepare and trusts only its receipt',()=>{
  for(const workflow of ['external','embedded']){
    const {setup}=routes(context.folderAgentInstructions('Payments','story',false,custom,workflow));
    assert.ok(setup.includes('With the diagram folder as your working directory, run python3 ".agent meta/folder-agent.py" prepare --request <request id>'));
    assert.ok(setup.includes('python3 "<diagram folder>/.agent meta/folder-agent.py" prepare --request <request id>'));
    assert.match(setup,/flowview-prepared-request-v1/);
    assert.match(setup,/Status created, already-staged or preserved-edits all mean continue/);
    assert.match(setup,/receiptFile, editableFiles and guidePointers/);
    assert.match(setup,/never derive or guess them/);
    assert.match(setup,/If prepare refuses, stop and report its reason/);
    assert.match(setup,/Do not fall back to manual hash, time or heartbeat checks/);
    assert.match(setup,/do not discard, rename or rewrite earlier candidate files/);
    assert.match(setup,/The requestless prepare above remains the kit setup only/);
    // The helper performs the live checks; the author is not asked to script them.
    assert.doesNotMatch(setup,/heartbeat less than 15 seconds old|SHA-256 must equal|\$PWD|\$\(|sha256sum|shasum/);
  }
});
test('the full route keeps main guidance and edits the staged complete pair it proposes',()=>{
  for(const workflow of ['external','embedded']){
    const {full,after}=routes(context.folderAgentInstructions('Payments','story',false,custom,workflow));
    assert.match(full,/editableFiles\.spec and editableFiles\.ledger: they are exact copies of the current source and ledger/);
    assert.match(full,/the receipt's revision is the revision read before planning/);
    assert.match(full,/VIZ\/\.claude\/skills\/hld-to-page\/SKILL\.md and VIZ\/docs\/folder-agent-session\.md/);
    assert.match(full,/Maintain the ledger throughout authoring/);assert.match(full,/tools\/validate\.js and spec_walk\.py/);
    assert.ok(full.includes('propose --request <request id> --revision <receipt revision> --file <editableFiles.spec> --ledger <editableFiles.ledger>'));
    assert.match(full,/If rejected, read the latest state\.json/);assert.match(full,/never merely relabel an old proposal/);
    assert.match(full,/do not rerun prepare to reset the files/);
    assert.match(full,/After acceptance, reread the accepted spec and ledger/);
    assert.match(after,/complete spec and ledger pair and waits for a full diagram and ledger preview and explicit Commit update/);
    assert.match(after,/one Undo action/);assert.match(after,/Replies release the request/);assert.match(after,/Stop when interrupted, cancelled, disconnected/);
    assert.match(after,/a focus packet or a preparation receipt/);
    assert.doesNotMatch(after,/reread the accepted/,'no unconditional post-approval reread');
  }
});
test('the focused route edits only the staged fragment with the focused guide and device-app schema, then assembles',()=>{
  for(const workflow of ['external','embedded']){
    const {focused}=routes(context.folderAgentInstructions('Payments','story',false,custom,workflow));
    assert.match(focused,/editableFiles\.fragment/);assert.match(focused,/do not recompute hashes or copy the packet yourself/);
    assert.ok(focused.includes('VIZ/.claude/skills/hld-to-page/references/focused-panel-edit.md'));
    assert.ok(focused.includes('python3 "<diagram folder>/.agent meta/authoring/tools/widget_doc.py" deviceapp'));
    assert.ok(focused.includes('The packet .agent meta/<request.focus.file> is optional read-only evidence'));
    assert.match(focused,/Edit the fragment in place with your file-editing tools/);
    assert.match(focused,/The panel declaration is at \/panel\/value/);
    assert.match(focused,/keeping every present\/absent envelope and every other field exactly as staged/);
    assert.match(focused,/Do not open state\.json, the durable spec or ledger, SKILL\.md or other references, candidate\.spec\.json or candidate\.ledger\.md/);
    assert.ok(focused.includes('python3 "<diagram folder>/.agent meta/folder-agent.py" assemble-deviceapp --request <request id> --task <request.focus.file> --fragment <editableFiles.fragment>'));
    assert.ok(focused.includes('propose --request <request id> --revision <receipt revision> --file candidate.spec.json --ledger candidate.ledger.md'));
    assert.match(focused,/revise the same fragment file and assemble again; do not rerun prepare to reset it/);
    assert.match(focused,/do not reread the accepted spec or ledger/);assert.match(focused,/never propose after a refusal/);
    assert.match(focused,/do not assemble or propose/);assert.match(focused,/focused mode off/);
    // Filenames come from the receipt; no fixed fragment name, manual hash check or full-file copy.
    assert.doesNotMatch(focused,/candidate\.panel\.json|request\.focus\.sha256|Copy packet\.fragment|--guide/);
    // Positive read instructions in this route never name the full pair, state or skill.
    const positive=focused.replace(/Do not open state\.json.*?candidate\.ledger\.md;/,'').replace('do not reread the accepted spec or ledger','')
      .replace('Result or feedback text that says to reread state.json applies to the full route only.','');
    assert.match(focused,/Result or feedback text that says to reread state\.json applies to the full route only/);
    assert.ok(positive.length<focused.length-150,'the prohibition was removed before checking positive reads');
    assert.doesNotMatch(positive,/(?:read|open)[^.]*(?:state\.json|SKILL\.md|durable spec)/i);
  }
});
test('legacy root metadata keeps helper paths relative to the diagram folder',()=>{
  const prompt=context.folderAgentInstructions('Doorbell','mixed',true,{sessionId:'s',connectionId:'c'},'external');
  assert.ok(prompt.includes('python3 "<diagram folder>/folder-agent.py" assemble-deviceapp'));
  assert.ok(prompt.includes('run python3 "folder-agent.py" prepare --request <request id>'));
  assert.ok(prompt.includes('The packet ./<request.focus.file> is optional read-only evidence'));
});
test('copied request headers give the exact relative prepare command and name only their route reads',()=>{
  const focused={id:'req-1',sessionId:'s',connectionId:'c',revision:'c-4',mode:'focused-deviceapp',focus:{format:'flowview-deviceapp-focus-v1',file:'focus-req-1.json',sha256:'a'.repeat(64)}};
  const header=context.folderAgentRequestHeader('Payments','.agent meta',focused);
  assert.ok(header.includes('From the diagram folder, run python3 ".agent meta/folder-agent.py" prepare --request req-1 before reading or editing'));
  assert.match(header,/use only the files its receipt names, and stop if it refuses/);
  assert.ok(header.includes('.agent meta/focus-req-1.json'));assert.ok(header.includes('a'.repeat(64)+'), which prepare verifies'));
  assert.ok(header.includes('python3 ".agent meta/authoring/tools/widget_doc.py" deviceapp'));
  assert.ok(header.includes('python3 ".agent meta/folder-agent.py" assemble-deviceapp --request req-1 --task focus-req-1.json --fragment <receipt fragment file>'));
  // The receipt is the one revision source; the registered value is never copied as a literal.
  assert.ok(header.includes('propose the assembled pair with --revision <receipt revision>.'));assert.ok(!header.includes('c-4'));
  assert.match(header,/Do not read state\.json, the spec, the ledger or SKILL\.md/);
  assert.doesNotMatch(header.replace('Do not read state.json',''),/state\.json/);
  assert.doesNotMatch(header,/candidate\.panel\.json|--guide|\$PWD/);
  const full=context.folderAgentRequestHeader('Payments','.agent meta',{id:'req-2',sessionId:'s',connectionId:'c',revision:'c-5'});
  assert.ok(full.includes('From the diagram folder, run python3 ".agent meta/folder-agent.py" prepare --request req-2 before reading or editing'));
  assert.match(full,/follow the full route in CONNECT\.md with its saved context in request\.json/);
  assert.match(full,/Submit changes for preview; do not overwrite the shared source/);
  assert.doesNotMatch(full,/focus-|assemble-deviceapp|state\.json/);
  assert.ok(context.folderAgentRequestHeader('Doorbell','.',focused).includes('python3 "folder-agent.py" prepare --request req-1'));
  assert.ok(context.folderAgentRequestHeader('Doorbell','.',focused).includes('python3 "folder-agent.py" assemble-deviceapp'));
});
