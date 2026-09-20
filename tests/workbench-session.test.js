'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const context={};
for(const name of ['document','window','localStorage'])Object.defineProperty(context,name,{get(){throw new Error('Session accessed '+name);}});
vm.createContext(context);
for(const name of ['persistence','session'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/workbench/'+name+'.js'),'utf8'),context);
const plain=value=>JSON.parse(JSON.stringify(value));
function harness({initial='{"title":"initial"}',storage=new Map(),deferInitialSave=false,blocked=false}={}){
  let text=initial,renderedText=initial,renders=0,next=0,invalidations=0;
  const writes=[],events=[],timers=new Map(),history=[];
  const persistence=context.createBuilderPersistence({
    storage(){if(blocked)throw new Error('blocked');return {
      getItem:key=>storage.get(key)||null,setItem(key,value){events.push('save:'+key);storage.set(key,value);},removeItem:key=>storage.delete(key)
    };},
    schedule(fn,ms){assert.equal(ms,800);timers.set(++next,fn);return next;},cancel:id=>timers.delete(id),now:()=>123
  });
  const session=context.createBuilderSession({
    source:{read:()=>text,write(value){events.push('write');writes.push(value);text=value;}},persistence,deferInitialSave,
    render(){events.push('render');renders++;try{JSON.parse(text);renderedText=text;}catch(_){}},renderedText:()=>renderedText,
    historyChanged(undo,redo){events.push('history');history.push([undo,redo]);},
    afterHistory(message){events.push(message.startsWith('undid')?'undo-ui':'redo-ui');},
    invalidateProject(){invalidations++;}
  });
  return {session,persistence,storage,writes,events,timers,history,
    get text(){return text;},type(value){text=value;},get renders(){return renders;},get invalidations(){return invalidations;},
    flush(){const pending=[...timers.values()];timers.clear();pending.forEach(fn=>fn());}};
}
test('session snapshots exact source, accepts one action and captures intervening invalid handwriting on Redo',()=>{
  const h=harness(),s=h.session,before=h.text;
  s.target={kind:'node',section:0,id:'a'};s.insertSection=2;
  const captured=s.snapshot();assert.equal(captured.text,before);assert.deepEqual(plain(captured.raw),{title:'initial'});
  assert.equal(s.accept({text:'{ "title": "edited" }',start:2},{snapshot:captured,
    beforePublish(){h.events.push('before');},afterRender(){h.events.push('after');}}),true);
  assert.deepEqual(h.events,['history','before','write','render','save:dv-workbench-baseline','save:dv-workbench-draft','after']);
  assert.equal(h.renders,1);assert.equal(s.target.id,'a');assert.equal(s.insertSection,2);
  h.type(' \r\n{ unfinished handwritten JSON');s.noteInput();
  assert.equal(s.canUndo(),true);assert.equal(s.undo(),true);assert.equal(h.text,before);assert.equal(s.target,null);
  assert.equal(s.redo(),true);assert.equal(h.text,' \r\n{ unfinished handwritten JSON');
  assert.match(s.parse().error,/JSON in the editor does not parse/);
  assert.equal(s.snapshot().renderedText,before,'invalid renders retain the last successful identity');
});
test('failed, stale and retired accepts publish nothing; successful unchanged text keeps its existing history policy',()=>{
  const h=harness(),s=h.session,snapshot=s.snapshot();
  assert.equal(s.accept({error:'rejected'}),false);assert.equal(s.accept(null),false);
  h.type(h.text+' ');assert.equal(s.accept({text:'{}'},{snapshot}),false,'whitespace invalidates offsets');
  h.type(snapshot.text);s.invalidateProject();assert.equal(s.accept({text:'{}'},{snapshot}),false,'same text in another project is stale');
  assert.equal(h.writes.length,0);assert.equal(h.renders,0);assert.equal(s.canUndo(),false);
  assert.equal(s.accept({text:h.text}),true);assert.equal(s.canUndo(),true);assert.equal(h.renders,1);
  s.destroy();assert.equal(s.accept({text:'{}'}),false);assert.equal(s.undo(),false);assert.equal(h.renders,1);
});
test('typing is immediately live, preserves invalid bytes and debounces storage without adding builder history',()=>{
  const h=harness({deferInitialSave:true}),s=h.session;
  s.saveInitial();assert.equal(h.storage.size,0);assert.equal(s.isProjectOpen(),false);
  h.type('{');s.noteInput();const retired=[...h.timers.values()][0];
  h.type(' \r\n{ invalid');s.noteInput();assert.equal(s.isProjectOpen(),true);assert.equal(s.canUndo(),false);
  assert.equal(h.timers.size,1);retired();assert.equal(h.storage.size,0,'already queued replaced callbacks are inert');
  h.flush();assert.equal(JSON.parse(h.storage.get('dv-workbench-draft')).text,h.text);
  assert.equal(JSON.parse(h.storage.get('dv-workbench-baseline')).text,'{"title":"initial"}');
  assert.equal(h.writes.length,0);assert.equal(h.renders,0);
});
test('project replacement owns selection invalidation and pending recovered draft first Undo without UI hooks',()=>{
  const saved={text:' \n{ unfinished',at:9},storage=new Map([['dv-workbench-draft',JSON.stringify(saved)]]);
  const h=harness({storage,deferInitialSave:true}),s=h.session;
  s.target={kind:'node',section:7,id:'old'};s.insertSection=7;
  const next='  {"title":"next"}\n';s.replaceProject(next);
  assert.equal(s.target,null);assert.equal(s.insertSection,0);assert.equal(h.invalidations,1);
  assert.deepEqual(h.writes,[next],'the boot demo is not briefly replaced with the recovered draft');
  assert.equal(s.baseline(),next);assert.equal(s.draft(),null);assert.equal(s.canUndoProject(),true);
  s.undo();assert.equal(h.text,saved.text);s.redo();assert.equal(h.text,next);
  s.target={kind:'step',section:0,index:0};s.invalidateProject();assert.equal(s.target,null);
});
test('replacement cancels old saves, typing wins over pending recovery, and destroy neutralizes queued callbacks',()=>{
  const h=harness({deferInitialSave:true,storage:new Map([['dv-workbench-draft',JSON.stringify({text:'old recovery'})]])}),s=h.session;
  h.type(' typed invalid');s.noteInput();const retired=[...h.timers.values()][0];
  s.replaceProject('{"new":true}');const current=h.storage.get('dv-workbench-draft');
  retired();assert.equal(h.storage.get('dv-workbench-draft'),current);assert.equal(h.timers.size,0);
  s.undo();assert.equal(h.text,' typed invalid');
  h.type('never persisted');s.noteInput();const pending=[...h.timers.values()][0],saved=h.storage.get('dv-workbench-draft');
  s.destroy();s.destroy();pending();s.noteInput();s.save();s.replaceProject('{}');
  assert.equal(h.storage.get('dv-workbench-draft'),saved);assert.equal(h.timers.size,0);
});
test('recovery retains paired baselines, import policies stay distinct and a normal action invalidates imported-text shortcut',()=>{
  const initial='{"title":"baseline"}',draft='{"title":"draft"}',storage=new Map([
    ['dv-workbench-draft',JSON.stringify({text:draft,at:1})],['dv-workbench-baseline',JSON.stringify({text:initial,draftText:draft})]
  ]);
  const h=harness({storage,deferInitialSave:true}),s=h.session;
  assert.deepEqual(plain(s.restoreDraft()),{missingBaseline:false});assert.equal(h.text,draft);assert.equal(s.baseline(),initial);
  s.importText('{"mermaid":true}',{rememberImport:true});assert.equal(s.imported(),true);assert.equal(s.baseline(),initial);
  s.accept({text:h.text});assert.equal(s.imported(),false);
  s.importText('{"trace":true}');assert.equal(s.imported(),false);assert.equal(s.baseline(),initial);
  s.markSaved();assert.equal(s.baseline(),h.text);
  const legacy=harness({storage:new Map([['dv-workbench-draft',JSON.stringify({text:draft})]])});
  assert.deepEqual(plain(legacy.session.restoreDraft()),{missingBaseline:true});assert.equal(legacy.session.baseline(),draft);
  const blocked=harness({blocked:true});assert.equal(blocked.session.accept({text:'{}'}),true);blocked.session.noteInput();blocked.flush();
});
test('builder history caps new actions at thirty while keeping current handwritten text for the opposite stack',()=>{
  const h=harness(),s=h.session;
  for(let i=0;i<35;i++)s.accept({text:JSON.stringify({i})});
  let undone=0;while(s.undo())undone++;
  assert.equal(undone,30);assert.equal(h.text,JSON.stringify({i:4}));
  h.type('{ handwritten');s.redo();s.undo();assert.equal(h.text,'{ handwritten');
});
