'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readSource}=require('../tools/source-loader.cjs');
const c=vm.createContext({});vm.runInContext(readSource('workbench/agent-review.js'),c);
const conflicts=[{path:'/',reason:'The combined story failed validation: blocks[0].diagram: broken'}];
function review(metadata,extra={}){
  return {id:'proposal-1',requestId:'req-1',baseRevision:'c-3',revision:'c-4',conflicts,
    artifacts:metadata===undefined?undefined:{spec:'payments flow.spec.json',ledger:'payments flow.ledger.md',metadata},...extra};
}
const layouts=[['default','.flowview-agent','.flowview-agent/'],['custom','.agent meta','.agent meta/'],['legacy root','.',''],['no artifacts',undefined,'']];

test('full-route repair feedback keeps full-pair reconciliation with the session\'s own metadata paths',()=>{
  for(const [name,metadata,prefix] of layouts){
    const text=c.workbenchAgentConflictFeedback(review(metadata));
    assert.ok(text.includes('- /: The combined story failed validation'),name);
    assert.ok(text.includes('Reread '+prefix+'state.json and the accepted spec and ledger named in '+prefix+'project.json.'),name);
    assert.ok(text.endsWith('\n\nReread '+prefix+'state.json and the accepted spec and ledger named in '+prefix+'project.json. Reconcile your intended changes with my latest edits, preserve unrelated work, reconcile the ledger with the complete story, validate it, and submit both artifacts in a new proposal with the revision you actually read. Do not just relabel the old proposal with a newer revision.'),name+' keeps the full-route text unchanged');
    assert.doesNotMatch(text,/editableFiles|prepare/,name);
    if(metadata!=='.flowview-agent')assert.doesNotMatch(text,/\.flowview-agent/,name+' never borrows the default folder');
  }
});

test('focused repair feedback keeps the focused route and never routes the author to the full pair',()=>{
  for(const [name,metadata,prefix] of layouts){
    const text=c.workbenchAgentConflictFeedback(review(metadata,{mode:'focused-deviceapp',task:'focus-req-1.json'}));
    assert.ok(text.includes('- /: The combined story failed validation'),name);
    assert.ok(text.includes('focused route in '+prefix+'CONNECT.md'),name);
    // The fragment is the one the preparation receipt named; edits are kept, never reset.
    assert.match(text,/Keep your edits in the fragment file your preparation receipt named as editableFiles\.fragment; do not run prepare again to reset it\./,name);
    assert.ok(text.includes('python3 "'+prefix+'folder-agent.py" assemble-deviceapp --request req-1 --task focus-req-1.json --fragment <editableFiles.fragment>'),name);
    assert.doesNotMatch(text,/candidate\.panel\.json|req-1\.panel\.json|prepare --request/,name+' names no fixed or derived fragment file');
    assert.match(text,/If the assembler reports that the story changed, or the fix needs anything beyond presentation, stop and ask me for a new request/);
    assert.doesNotMatch(text,/state\.json|project\.json|accepted spec|ledger named|SKILL\.md|[Rr]eread/,name);
    if(metadata!=='.flowview-agent')assert.doesNotMatch(text,/\.flowview-agent/,name);
  }
  // A review without the recorded packet name still points at the request's own field.
  assert.ok(c.workbenchAgentConflictFeedback(review('.agent meta',{mode:'focused-deviceapp'})).includes('--task <request.focus.file>'));
});

test('unknown or absent modes fall back to the full route',()=>{
  for(const mode of [undefined,null,'fragment'])
    assert.match(c.workbenchAgentConflictFeedback(review('.flowview-agent',{mode})),/Reread \.flowview-agent\/state\.json/);
});
