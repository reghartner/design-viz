const test=require('node:test'),assert=require('node:assert/strict');
const C=require('./workbench-command-context.cjs')(['narrative','panel-duration']);
const plain=x=>JSON.parse(JSON.stringify(x)),target={kind:'step',section:0,index:1};
const fixture=(type='screen')=>({nodes:{a:{}},rows:[['a']],panels:[{id:'p',type,initial:{audio:{connection:'connected',output:'silent'},banner:'INITIAL'}}],steps:[{id:'before',panels:{p:{banner:'BASE',audio:{output:'chime'}}}},{id:'now',panels:{p:{banner:'LATER',enterOnce:{banner:'FLASH',audio:{microphone:'capturing'},future:{keep:true}},future:true}}},{id:'after'}]});
function plan(raw,key,duration){return C.planPanelFieldDuration(JSON.stringify(raw),raw,target,'p',key,duration);}
test('supported camera fields move whole authored snapshots between storage locations',()=>{
 const values={mode:'live',scenePlayback:'playing',banner:'FLASH',reason:'Reason',audio:{output:'chime',future:true},spotlight:'on'};
 for(const [key,value] of Object.entries(values)){
  const raw=fixture();raw.steps[1].panels.p={[key]:value,enterOnce:{future:{keep:true}},other:9};
  const once=JSON.parse(plan(raw,key,'once').text).steps[1].panels.p;assert.equal(once[key],undefined);assert.deepEqual(once.enterOnce[key],value);assert.deepEqual(once.enterOnce.future,{keep:true});assert.equal(once.other,9);
  const modified=structuredClone(raw);modified.steps[1].panels.p=once;
  assert.deepEqual(JSON.parse(plan(modified,key,'carry').text).steps[1].panels.p,raw.steps[1].panels.p);
 }
});
test('duration chooses the current override explicitly; inherit clears only the selected field',()=>{
 const raw=fixture(),before=JSON.stringify(raw),temporary=JSON.parse(plan(raw,'banner','once').text),carried=JSON.parse(plan(raw,'banner','carry').text);
 assert.deepEqual(plain(C.foldPanelStates(temporary).p.map(s=>s.banner)),['BASE','FLASH','BASE']);
 assert.deepEqual(plain(C.foldPanelStates(carried).p.map(s=>s.banner)),['BASE','FLASH','FLASH']);
 const inherited=JSON.parse(plan(raw,'banner','inherit').text);assert.deepEqual(plain(C.foldPanelStates(inherited).p.map(s=>s.banner)),['BASE','BASE','BASE']);
 assert.deepEqual(inherited.steps[1].panels.p.enterOnce.audio,{microphone:'capturing'});assert.equal(JSON.stringify(raw),before);
});
test('Phone allows only audio; audio null, empty snapshots, unsupported siblings and malformed data are preserved',()=>{
 const raw=fixture('phone');raw.steps[1].panels.p={audio:{output:'chime'},enterOnce:{audio:null,future:'keep'}};
 assert.equal(JSON.parse(plan(raw,'audio','carry').text).steps[1].panels.p.audio,null);
 raw.steps[1].panels.p.enterOnce.audio={};assert.deepEqual(JSON.parse(plan(raw,'audio','carry').text).steps[1].panels.p.audio,{});
 for(const key of ['clock','notify','clear','banner'])assert.ok(plan(raw,key,'once').error);
 for(const malformed of [null,[],true,'bad']){raw.steps[1].panels.p.enterOnce=malformed;const text=JSON.stringify(raw);assert.ok(plan(raw,'audio','once').error);assert.equal(JSON.stringify(raw),text);}
 delete raw.steps[1].panels.p.enterOnce;delete raw.steps[1].panels.p.audio;assert.ok(plan(raw,'audio','once').error);
 assert.ok(C.planPanelFieldDuration(JSON.stringify(raw),raw,target,'p','audio','inherit','stale').error);
});
test('a shared one-step audio override replaces fields and resumes each path’s own history',()=>{
 for(const type of ['screen','phone']){
  const raw=fixture(type);raw.steps=[{id:'a',panels:{p:{audio:{output:'chime',connection:'connected'}}}},{id:'b',panels:{p:{audio:{output:'speech'}}}},{id:'shared',panels:{p:{enterOnce:{audio:{microphone:'capturing'}}}}},{id:'after'}];
  raw.paths=[{id:'one',steps:['a','shared','after']},{id:'two',steps:['b','shared','after']}];
  for(const [path,output] of [['one','chime'],['two','speech']]){
   const states=plain(C.foldPanelStates(C.diagramForPath(raw,path)).p);
   assert.deepEqual(states[1].audio,{microphone:'capturing'});assert.equal(states[2].audio.output,output);assert.equal(states[2].audio.microphone,undefined);
  }
 }
});
