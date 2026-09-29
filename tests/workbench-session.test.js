'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const context={};
for(const name of ['document','window','localStorage'])Object.defineProperty(context,name,{get(){throw new Error('Session accessed '+name);}});
vm.createContext(context);
for(const name of ['persistence','session'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/workbench/'+name+'.js'),'utf8'),context);
const plain=value=>JSON.parse(JSON.stringify(value));
test('recovery status reports actual persistence success and failure independently of editing',()=>{
  const states=[];let blocked=false,pending;
  const persistence=context.createBuilderPersistence({storage:()=>({setItem(){if(blocked)throw Error('quota');}}),
    status:state=>states.push(state),now:()=>1,schedule:fn=>{pending=fn;return 1;},cancel(){}});
  persistence.schedule(()=>persistence.save('story','baseline'));
  assert.equal(states.at(-1),'pending');pending();assert.equal(states.at(-1),'saved');
  blocked=true;persistence.save('new story','baseline');assert.equal(states.at(-1),'unavailable');
  blocked=false;persistence.save('new story','baseline');assert.equal(states.at(-1),'saved');
  persistence.destroy();const count=states.length;persistence.save('later','baseline');assert.equal(states.length,count);
});
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
test('project replacement archives a pending recovered draft and starts separate history without UI hooks',()=>{
  const saved={text:' \n{ unfinished',at:9},storage=new Map([['dv-workbench-draft',JSON.stringify(saved)]]);
  const h=harness({storage,deferInitialSave:true}),s=h.session;
  s.target={kind:'node',section:7,id:'old'};s.insertSection=7;
  const next='  {"title":"next"}\n';s.replaceProject(next);
  assert.equal(s.target,null);assert.equal(s.insertSection,0);assert.equal(h.invalidations,1);
  assert.deepEqual(h.writes,[next],'the boot demo is not briefly replaced with the recovered draft');
  assert.equal(s.baseline(),next);assert.equal(s.draft(),null);assert.equal(s.canUndo(),false);assert.equal(s.canRedo(),false);
  assert.equal(s.earlierDrafts()[0].text,saved.text);
  assert.equal(s.undo(),false);assert.equal(s.redo(),false);assert.equal(h.text,next);
  s.target={kind:'step',section:0,index:0};s.invalidateProject();assert.equal(s.target,null);
});
test('direct handoffs preserve exact earlier drafts and baselines across reload and restore',()=>{
  const draft=' \n{ unfinished',baseline='{"title":"Before"}',storage=new Map([
    ['dv-workbench-draft',JSON.stringify({text:draft,at:1})],['dv-workbench-baseline',JSON.stringify({text:baseline,draftText:draft})]
  ]);
  const h=harness({storage,deferInitialSave:true});h.session.preserveDraft();h.session.preserveDraft();
  assert.equal(h.session.earlierDrafts().length,1);
  h.session.replaceProject('{"title":"Backstage story"}');
  const next=harness({storage,deferInitialSave:true});
  next.session.restoreEarlierDraft(next.session.earlierDrafts()[0]);
  assert.equal(next.text,draft);assert.equal(next.session.baseline(),baseline);
  assert.equal(next.session.canUndo(),false);assert.equal(next.session.canRedo(),false);
  assert.equal(next.session.earlierDrafts().length,2,'the replaced story is also recoverable');
  const blocked=harness({blocked:true});
  assert.throws(()=>blocked.session.preserveDraft(),/earlier draft could not be saved/);
  assert.equal(blocked.writes.length,0);
});
test('replacement cancels old saves, typing wins over pending recovery, and destroy neutralizes queued callbacks',()=>{
  const h=harness({deferInitialSave:true,storage:new Map([['dv-workbench-draft',JSON.stringify({text:'old recovery'})]])}),s=h.session;
  h.type(' typed invalid');s.noteInput();const retired=[...h.timers.values()][0];
  s.replaceProject('{"new":true}');const current=h.storage.get('dv-workbench-draft');
  retired();assert.equal(h.storage.get('dv-workbench-draft'),current);assert.equal(h.timers.size,0);
  assert.equal(s.undo(),false);assert.equal(s.redo(),false);assert.equal(h.text,'{"new":true}');
  assert.equal(s.earlierDrafts()[0].text,' typed invalid');
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
  assert.equal(s.canUndo(),false);assert.equal(s.canRedo(),false);
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
test('view geometry interleaves with source history without writes, renders, saves or selection changes',()=>{
  const h=harness(),s=h.session,initial=h.text;
  let rect={x:10,w:300};const before=rect,after={x:90,w:420};rect=after;
  s.target={kind:'node',id:'a'};
  assert.equal(s.rememberView({before,after,restore(value){rect=value;}}),true);
  assert.deepEqual(h.events,['history']);assert.equal(s.historyType(),'view');
  s.accept({text:'{"title":"edited"}'});assert.equal(s.historyType(),'source');
  s.undo();assert.equal(h.text,initial);assert.deepEqual(rect,after);
  s.target={kind:'node',id:'a'};const renders=h.renders,writes=h.writes.length,saved=h.storage.get('dv-workbench-draft');
  s.undo();assert.deepEqual(rect,before);assert.equal(h.text,initial);assert.equal(s.target.id,'a');
  assert.equal(h.renders,renders);assert.equal(h.writes.length,writes);assert.equal(h.storage.get('dv-workbench-draft'),saved);
  s.redo();assert.deepEqual(rect,after);assert.equal(h.text,initial);
  s.redo();assert.equal(h.text,'{"title":"edited"}');
});
test('view no-ops preserve Redo; rejected restores and retired owners do not advance history',()=>{
  const h=harness(),s=h.session;
  s.accept({text:'{}'});s.undo();
  assert.equal(s.rememberView({before:{x:1},after:{x:1},restore(){throw Error('noop');}}),false);assert.equal(s.canRedo(),true);
  let allowed=false,restores=0;
  s.rememberView({before:{x:1},after:{x:2},restore(){restores++;return allowed;}});assert.equal(s.canRedo(),false);
  assert.equal(s.undo(),false);assert.equal(s.historyType(),'view');assert.equal(s.canRedo(),false);
  allowed=true;assert.equal(s.undo(),true);assert.equal(s.historyType(true),'view');
  s.invalidateProject();assert.notEqual(s.historyType(true),'view');assert.equal(s.redo(),false);
  s.destroy();assert.equal(s.rememberView({before:1,after:2,restore(){}}),false);assert.equal(s.undo(),false);assert.equal(restores,2);
});

test('removed view targets retire their entry without blocking earlier source history',()=>{
  const h=harness(),s=h.session,initial=h.text;
  s.accept({text:'{"title":"edited"}'});
  s.rememberView({before:{x:1},after:{x:2},restore(){return 'expired';}});
  assert.equal(s.undo(),true);assert.equal(h.text,initial);assert.equal(s.canUndo(),false);
  assert.equal(s.historyType(true),'source');assert.equal(s.redo(),true);assert.equal(h.text,'{"title":"edited"}');assert.equal(s.canRedo(),false);
});

test('loading another file clears mixed source and panel Undo and Redo; later edits stay in the new file',()=>{
  const h=harness({initial:'{"file":"A"}'}),s=h.session;
  const aProject=s.snapshot().project;let geometry={x:0},restores=0;
  s.accept({text:'{"file":"A","edited":true}'});
  const aEdited=h.text;
  s.rememberView({before:{x:0},after:{x:40},restore(value){geometry=value;restores++;}});
  s.accept({text:'{"file":"A","edited":"again"}'});
  s.undo();assert.equal(h.text,aEdited);assert.equal(s.canUndo(),true);assert.equal(s.canRedo(),true);
  const b='  {"file":"B"}\n';s.replaceProject(b);
  assert.equal(s.snapshot().project,aProject+1);assert.equal(s.canUndo(),false);assert.equal(s.canRedo(),false);
  assert.equal(s.undo(),false);assert.equal(s.redo(),false);assert.equal(h.text,b);assert.equal(restores,0);
  assert.equal(s.earlierDrafts()[0].text,aEdited);assert.equal(s.earlierDrafts()[0].baseline,'{"file":"A"}');
  s.rememberView({before:{x:1},after:{x:50},restore(value){geometry=value;restores++;}});
  const bEdited='{"file":"B","edited":true}';s.accept({text:bEdited});
  s.undo();assert.equal(h.text,b);s.undo();assert.deepEqual(geometry,{x:1});assert.equal(h.text,b);
  assert.equal(s.undo(),false);s.redo();assert.deepEqual(geometry,{x:50});s.redo();assert.equal(h.text,bEdited);
  assert.equal(s.redo(),false);assert.equal(restores,2);
});

test('Home invalidation retires async selection while preserving the current file source and panel history',()=>{
  const h=harness(),s=h.session,original=h.text;
  s.accept({text:'{"title":"edited"}'});const edited=h.text;
  let x=40;s.rememberView({before:0,after:40,restore(value){x=value;}});s.undo();assert.equal(x,0);
  const snapshot=s.snapshot(),version=s.historyVersion(),renders=h.renders;
  s.target={kind:'node',id:'old'};s.invalidateProject({preserveHistory:true});
  assert.equal(s.target,null);assert.equal(s.snapshot().project,snapshot.project+1);assert.equal(h.invalidations,1);
  assert.equal(s.historyVersion(),version);assert.equal(h.renders,renders);assert.equal(h.text,edited);
  assert.equal(s.accept({text:'stale'},{snapshot}),false);
  assert.equal(s.historyType(),'source');assert.equal(s.historyType(true),'view');
  s.undo();assert.equal(h.text,original);s.redo();assert.equal(h.text,edited);s.redo();assert.equal(x,40);
  assert.equal(s.historyType(),'view');assert.equal(s.canRedo(),false);
});

test('replacement refuses to lose the current draft when its archive cannot be saved',()=>{
  const h=harness({blocked:true}),s=h.session,before=h.text;
  s.accept({text:'{"title":"valuable draft"}'});const edited=h.text,snapshot=s.snapshot(),version=s.historyVersion();
  assert.throws(()=>s.replaceProject('{"title":"different file"}'),/earlier draft could not be saved/);
  assert.equal(h.text,edited);assert.equal(s.snapshot().project,snapshot.project);assert.equal(s.historyVersion(),version);
  assert.equal(h.invalidations,0);assert.equal(s.undo(),true);assert.equal(h.text,before);
});

test('restoring a recovery draft establishes a fresh project boundary even when the boot editor has history',()=>{
  const draft=' {"title":"recovered"} ',baseline='{"title":"saved"}',storage=new Map([
    ['dv-workbench-draft',JSON.stringify({text:draft})],['dv-workbench-baseline',JSON.stringify({text:baseline,draftText:draft})]
  ]);
  const h=harness({storage,deferInitialSave:true}),s=h.session;
  s.accept({text:'{"title":"temporary editor"}'});s.rememberView({before:1,after:2,restore(){throw Error('Old panel must not restore');}});
  const project=s.snapshot().project;
  s.restoreDraft();assert.equal(s.snapshot().project,project+1);assert.equal(h.text,draft);assert.equal(s.baseline(),baseline);
  assert.equal(s.undo(),false);assert.equal(s.redo(),false);assert.equal(s.earlierDrafts()[0].text,'{"title":"temporary editor"}');
  s.accept({text:'{"title":"recovered edited"}'});s.undo();assert.equal(h.text,draft);assert.equal(s.undo(),false);
});
