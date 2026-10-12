'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readSource}=require('../tools/source-loader.cjs');
const c={};vm.createContext(c);for(const file of ['workbench/persistence.js','workbench/session.js','workbench/checkpoints.js'])vm.runInContext(readSource(file),c);
const plain=value=>JSON.parse(JSON.stringify(value));
function harness(storage=new Map(),initial=' {"title":"original"}\n',deferInitialSave=false){
  let text=initial,renders=0,at=0,status;
  const persistence=c.createBuilderPersistence({storage:()=>({getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)}),now:()=>++at,cancel(){},status:value=>{status=value;}});
  const session=c.createBuilderSession({source:{read:()=>text,write:value=>{text=value;}},persistence,now:()=>++at,deferInitialSave,render:()=>{renders++;}});
  return {session,storage,get text(){return text;},type:value=>{text=value;},get renders(){return renders;},get status(){return status;}};
}
test('checkpoint operations preserve exact text, source history, and baseline; restore is one Undo action',()=>{
  const h=harness(),s=h.session,original=h.text,baseline=s.baseline();
  s.accept({text:'{"other":true}'});s.undo();const version=s.historyVersion();assert.equal(s.canRedo(),true);
  const saved=s.saveCheckpoint('  Before redesign  ');assert.ok(saved.id);assert.equal(s.checkpoints()[0].name,'Before redesign');
  assert.equal(s.historyVersion(),version);assert.equal(s.canRedo(),true);assert.equal(h.text,original);assert.equal(h.renders,2);
  assert.ok(s.saveCheckpoint('before redesign').error);assert.ok(s.saveCheckpoint(' ').error);assert.ok(s.saveCheckpoint('x'.repeat(81)).error);
  s.saveCheckpoint('Renamed',saved.id);assert.equal(s.historyVersion(),version);assert.equal(s.restoreCheckpoint(saved.id,s.snapshot()),false);assert.equal(s.canRedo(),true);
  h.type(' \r\n{ unfinished current');const replaced=h.text;
  assert.equal(s.restoreCheckpoint(saved.id,s.snapshot()),true);assert.equal(h.text,original);assert.equal(s.baseline(),baseline);assert.equal(s.canRedo(),false);
  assert.equal(s.undo(),true);assert.equal(h.text,replaced);assert.equal(s.redo(),true);assert.equal(h.text,original);
  const copy=s.checkpoints();copy[0].text='mutated';assert.equal(s.checkpoints()[0].text,original);
  assert.equal(s.deleteCheckpoint(saved.id),true);assert.equal(s.deleteCheckpoint(saved.id),false);assert.equal(s.restoreCheckpoint(saved.id,s.snapshot()),false);
});
test('invalid checkpoint bytes are restorable, and stale source/project/context and disposed owners refuse restore',()=>{
  const h=harness(),s=h.session;h.type(' \r\n{ invalid');const invalid=h.text,id=s.saveCheckpoint('Unfinished').id;
  h.type('{}');const snap=s.snapshot();h.type('{} ');assert.equal(s.restoreCheckpoint(id,snap),false);
  assert.equal(s.restoreCheckpoint(id,{...s.snapshot(),topologyRevision:7}),false);
  assert.equal(s.restoreCheckpoint(id,s.snapshot()),true);assert.equal(h.text,invalid);s.undo();assert.equal(h.text,'{} ');
  const stale=s.snapshot();s.invalidateProject({preserveHistory:true});assert.equal(s.restoreCheckpoint(id,stale),false);assert.equal(s.checkpoints().length,1);
  s.destroy();assert.ok(s.saveCheckpoint('Retired').error);assert.equal(s.deleteCheckpoint(id),false);assert.equal(s.restoreCheckpoint(id,s.snapshot()),false);
});
test('recovery and archived projects round-trip checkpoints separately from authored source',()=>{
  const h=harness(),s=h.session,original=h.text,id=s.saveCheckpoint('A').id;
  const draft=JSON.parse(h.storage.get('dv-workbench-draft'));assert.equal(draft.text,original);assert.equal(draft.checkpoints[0].id,id);
  const reloaded=harness(h.storage,'boot',true);assert.equal(reloaded.session.checkpoints().length,0);
  reloaded.session.restoreDraft();assert.equal(reloaded.text,original);assert.equal(reloaded.session.checkpoints()[0].id,id);
  reloaded.session.replaceProject('{"title":"B"}');assert.equal(reloaded.session.checkpoints().length,0);
  reloaded.session.saveCheckpoint('B');const archive=reloaded.session.earlierDrafts().find(entry=>entry.text===original);
  reloaded.session.restoreEarlierDraft(archive);assert.equal(reloaded.session.checkpoints()[0].name,'A');assert.equal(reloaded.session.canUndo(),false);
  assert.equal(reloaded.session.earlierDrafts()[0].checkpoints[0].name,'B');
  const direct=harness(h.storage,original);assert.equal(direct.session.checkpoints()[0].id,id);
  direct.session.deleteCheckpoint(id);assert.equal(JSON.parse(h.storage.get('dv-workbench-draft')).checkpoints,undefined);
});
test('archive deduplication includes checkpoints even when authored source has not changed',()=>{
  const h=harness(),s=h.session;s.preserveDraft();s.saveCheckpoint('Named');s.preserveDraft();
  assert.equal(s.earlierDrafts().length,2);assert.equal(s.earlierDrafts()[0].checkpoints[0].name,'Named');
});
test('bounds reject additions without silently evicting data and sanitization drops malformed records and foreign fields',()=>{
  const h=harness(),s=h.session;for(let i=0;i<20;i++)assert.ok(s.saveCheckpoint('Point '+i).id);
  const before=JSON.stringify(s.checkpoints());assert.ok(s.saveCheckpoint('One too many').error);assert.equal(JSON.stringify(s.checkpoints()),before);
  const large=harness();large.type('x'.repeat(c.BUILDER_CHECKPOINT_BYTES/2));assert.ok(large.session.saveCheckpoint('Too big').error);assert.equal(large.session.checkpoints().length,0);
  const entry={id:'id',name:' Valid ',at:1,text:'{ invalid',secret:'remove',topologyContext:{secret:'remove'}};
  const result=c.sanitizeBuilderCheckpoints([null,{},entry,{...entry,id:'second',name:'valid'},{...entry,id:'third',name:'Other',at:NaN},{...entry,id:'fourth',name:'Large',text:'x'.repeat(c.BUILDER_CHECKPOINT_BYTES)}]);
  assert.deepEqual(plain(result),[{id:'id',name:'Valid',at:1,text:'{ invalid'}]);assert.deepEqual(plain(c.sanitizeBuilderCheckpoints({entries:[entry]})),[]);
  const storage=new Map([['dv-workbench-draft',JSON.stringify({text:'saved',checkpoints:[entry,null]})]]),recovery=harness(storage,'boot',true);
  recovery.session.replaceProject('next');assert.deepEqual(plain(recovery.session.earlierDrafts()[0].checkpoints),plain(result));
});
test('a refused project switch retains checkpoints, current source, and history',()=>{
  const h=harness(),s=h.session,id=s.saveCheckpoint('Keep').id;s.accept({text:'edited'});
  h.storage.set('dv-workbench-earlier-drafts','{broken');const before=s.snapshot();assert.throws(()=>s.replaceProject('other'),/earlier draft/);
  assert.equal(s.checkpoints()[0].id,id);assert.equal(h.text,before.text);assert.equal(s.canUndo(),true);
});
test('comparison distinguishes exact equality, structural changes, formatting and invalid source',()=>{
  c.diffSpecTexts=(a,b)=>{try{JSON.parse(a);JSON.parse(b);}catch{return {error:'baseline JSON is unparseable'};}return {findings:a.includes('changed')?[{text:'title changed'}]:[]};};
  assert.match(c.builderCheckpointComparison('{','{').summary,/exactly/);
  assert.match(c.builderCheckpointComparison('{','{}').summary,/checkpoint JSON is unparseable/);
  assert.match(c.builderCheckpointComparison('{}','{} ').summary,/formatting/);
  assert.match(c.builderCheckpointComparison('{"changed":true}','{}').summary,/1 structural change/);
});
