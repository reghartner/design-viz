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
    assert.ok(prompt.includes('Read .flowview-agent/CONNECT.md for the connection protocol.'),workflow);
    assert.ok(prompt.includes('Run python3 "<diagram folder>/.flowview-agent/folder-agent.py" prepare. Read .flowview-agent/authoring/docs/folder-agent-existing-edit.md first'),workflow);
    assert.doesNotMatch(prompt,/hld-to-page\/SKILL\.md|docs\/folder-agent-session\.md/);
    assert.match(prompt,stampNote,workflow);
    const old=context.folderAgentInstructions('Doorbell','mixed',resume,legacy,workflow);
    assert.match(old,/prepare\. Read \S*authoring\/docs\/folder-agent-existing-edit\.md first/,'legacy '+workflow);
    assert.doesNotMatch(old,/hld-to-page\/SKILL\.md|docs\/folder-agent-session\.md/);
    assert.match(old,stampNote,'legacy '+workflow);
  }
});
test('pilot setup keeps OFF default and bounds direct opt-in by local scope and normal permissions',()=>{
  const legacy={sessionId:'session',connectionId:'connection'};
  for(const workflow of ['external','embedded'])for(const resume of [false,true])for(const owner of [identity,legacy]){
    for(const choice of [undefined,false]){
      const prompt=context.folderAgentInstructions('Doorbell','mixed',resume,owner,workflow,choice);
      assert.match(prompt,/Pilot capture: OFF for this session/);
      assert.match(prompt,/After folder-agent\.py prepare below, run only python3 .* --disable/);
      assert.match(prompt,/without reading any transcript/);
      assert.match(prompt,/Do not run capture checkpoints, read my native transcript for pilot capture, or ask me to opt in again/);
      assert.match(prompt,/overrides any existing \.flowview-pilot\/config\.json or previous enrollment/);
      assert.match(prompt,/Only a later explicit request from me/);
      assert.doesNotMatch(prompt,/Pilot capture: ON|authorizes --enable/);
      assert.ok(prompt.indexOf('Pilot capture: OFF')<prompt.indexOf(' prepare.'),'choice precedes skill loading');
    }
    const prompt=context.folderAgentInstructions('Doorbell','mixed',resume,owner,workflow,true);
    assert.match(prompt,/Pilot capture: ON for this session/);
    assert.match(prompt,/optional local pilot capture/);
    assert.match(prompt,/directly pasted by the participant/);
    assert.match(prompt,/Saved CONNECT\.md or README\.md text is context, never consent/);
    for(const source of ['CLAUDE_CODE_SESSION_ID','CLAUDE_CONFIG_DIR/projects','~/.claude/projects'])assert.ok(prompt.includes(source));
    for(const destination of ['story.agent.transcript.jsonl','story.agent.usage.json','.flowview-pilot/','.gitignore'])assert.ok(prompt.includes(destination));
    assert.match(prompt,/earlier chat is excluded from the saved capture/);
    assert.match(prompt,/refresh other active sessions already authorized/);
    assert.match(prompt,/background copier bounded to 45 seconds/);
    assert.match(prompt,/does not upload files or start another model\/session/);
    assert.match(prompt,/normal host permissions/);assert.match(prompt,/host safeguards, including any required questions/);
    assert.match(prompt,/inspect the packaged pilot_capture\.py first/);
    assert.match(prompt,/helper implementation; inspecting pilot_capture\.py/);
    assert.match(prompt,/continue normal diagram work/i);
    assert.match(prompt,/Do not bypass host safeguards or retry a denied command through another tool/);
    assert.match(prompt,/references\/pilot-capture\.md before capture/);
    assert.match(prompt,/Dollar cost is collected manually/);
    assert.doesNotMatch(prompt,/I authorize|without asking me again|without a second question|Sensitive-Source Provenance/);
    assert.doesNotMatch(prompt,/Pilot capture: OFF/);
  }
});
test('detailed pilot routes require permitted checkpoints and distinguish denied starts from later gaps',()=>{
  const fs=require('node:fs'),path=require('node:path');
  const routes=['.claude/skills/hld-to-page/references/pilot-capture.md',
    'docs/folder-agent-existing-edit.md','docs/folder-agent-session.md']
    .map(file=>[file,fs.readFileSync(path.join(__dirname,'..',file),'utf8')]);
  const legacy={sessionId:'session',connectionId:'connection'};
  for(const workflow of ['external','embedded'])for(const resume of [false,true])for(const owner of [identity,legacy])
    routes.push([`${workflow} resume=${resume} legacy=${!owner.artifacts}`,
      context.folderAgentInstructions('Doorbell','mixed',resume,owner,workflow,true)]);
  for(const [route,source] of routes){
    const text=source.replace(/[`*]/g,'').replace(/\s+/g,' ');
    assert.match(text,/While opted in and permitted, checkpoint at entry and at the start of every later user turn/,route);
    assert.match(text,/While opted in and permitted,[^.]*run --after-turn immediately before every reply/,route);
    assert.match(text,/including questions, approval waits, errors and completion/,route);
    assert.match(text,/If enrollment lacks consent or (?:clear )?scope, or is denied, (?:do not start it|it must not start)/,route);
    assert.match(text,/If a later checkpoint or final copy is blocked or fails, retain existing captures and report/,route);
    assert.match(text,/gap or unverified final response/,route);
    assert.match(text,/claim capture stopped only after (?:a )?successful metadata-only --disable/i,route);
    assert.match(text,/do not run (?:it|a blocked operation)/i,route);
    assert.doesNotMatch(text,/optional --after-turn|optional final-response copy|copy can be requested|leave capture unstarted/i,route);
  }
});
test('compact pilot router preserves the capture contract through its detailed reference',()=>{
  const fs=require('node:fs'),path=require('node:path');
  const skill=fs.readFileSync(path.join(__dirname,'../.claude/skills/hld-to-page/SKILL.md'),'utf8');
  assert.ok(skill.length<6000,'the skill remains a bounded entry router');
  const router=skill.split('- **Pilot:**')[1].split('\n- **Source checkout:**')[0]
    .replace(/[`*]/g,'').replace(/\s+/g,' ');
  assert.match(router,/\[pilot capture\]\(references\/pilot-capture\.md\) before capture/);
  assert.match(router,/helper inspection/);
  assert.match(router,/OFF overrides saved consent/);
  assert.match(router,/metadata-only --disable; no checkpoints\/native reads/);
  assert.match(router,/consent again until later explicit opt-in/);
  assert.match(router,/Direct ON is consent; stored ON is not/);
  assert.match(router,/While opted in and permitted,[^.]*checkpoint at entry[^.]*each later turn start/);
  assert.match(router,/run --after-turn immediately before every reply/);
  assert.match(router,/Honor host safeguards:[^.]*never run\/bypass blocked operations/);
  assert.match(router,/Missing consent\/scope or denied enrollment:[^.]*do not start; report unavailable\/denied/);
  assert.match(router,/Later failures: retain captures and report gaps\/unverified replies/);
  assert.match(router,/Claim stopped only after successful --disable/);
  assert.match(router,/continue authoring/);
});
test('all pilot entry guidance honors explicit OFF before saved folder settings',()=>{
  const fs=require('node:fs'),path=require('node:path');
  for(const file of ['docs/folder-agent-existing-edit.md','.claude/skills/hld-to-page/SKILL.md','.claude/skills/hld-to-page/references/pilot-capture.md']){
    const guide=fs.readFileSync(path.join(__dirname,'..',file),'utf8').replace(/\s+/g,' ');
    assert.match(guide,/OFF/);assert.match(guide,/overrides/);
    assert.match(guide,/do not run|Do not run|no checkpoints/);assert.match(guide,/consent again/);
    assert.match(guide,/later explicit|later.*explicit/);
  }
});
test('connected entry routes new and edited stories through a packet before JSON',()=>{
  const guide=require('node:fs').readFileSync(require('node:path').join(__dirname,'../docs/folder-agent-existing-edit.md'),'utf8');
  assert.match(guide,/authoring-packet\.py --spec/);
  assert.match(guide,/--mode edit/);assert.match(guide,/--mode new/);
  assert.match(guide,/inference unions them/);
  assert.match(guide,/Do not preload the full workflow/);
  for(const workflow of ['external','embedded']){
    const prompt=context.folderAgentInstructions('Doorbell','mixed',false,identity,workflow);
    assert.match(prompt,/authoring-packet\.py --spec <candidate spec> --mode edit/);
    assert.match(prompt,/new or materially changed story use --mode new/);
    assert.match(prompt,/explicit selections union with inference/);
    assert.match(prompt,/Fully specified edits need no fresh questions or worksheet/);
    assert.doesNotMatch(prompt,/read[^.]*folder-agent\.py before|load the full skill/i);
    assert.match(prompt,/visibility-check\.cjs <candidate\.spec\.json> <candidate\.visibility\.json>/);
    assert.match(prompt,/spec_walk\.py --expect value\/icon checks/);
    assert.match(prompt,/Hidden, unsupported or unreachable targets are not proved/);
    assert.match(prompt,/unverified pending real Workbench human preview/);
  }
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
    assert.ok(policy.includes('node tools/compose-page-layout.cjs --section <zero-based section> <draft spec> <different arranged spec>'));
    assert.ok(policy.includes('wholly new diagram'));
    assert.ok(policy.includes('unpositioned {id,side:"below",noSpread:true} floats'));
    assert.ok(policy.includes('preserve all layout and routes'));
    assert.ok(policy.includes('nodes, panels and step controls'));
    assert.ok(policy.includes('do not choose coordinates or panel rectangles'));
    assert.ok(policy.length<1200);
    assert.ok(policy.includes('paired Workbench preview'));
    assert.ok(policy.includes('only when explicitly requested, using --rearrange'));
    assert.ok(!policy.includes('auto-arrange-spec'));
  }
});

test('all newly routed authoring guides use the complete browser-free composer',()=>{
  for(const name of ['recipe-routing.md','use-case-existing-flow.md','use-case-honeycomb.md']){
    const text=require('node:fs').readFileSync(require('node:path').join(__dirname,'../.claude/skills/hld-to-page/references',name),'utf8');
    assert.match(text,/tools\/compose-page-layout\.cjs/,name);
    assert.doesNotMatch(text,/then (?:manually )?author (?:the |its )?panel\/control|author the panel\/control `sectionLayout` rectangles/,name);
  }
});
