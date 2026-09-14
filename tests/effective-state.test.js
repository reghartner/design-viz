'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'), path=require('node:path'), vm=require('node:vm');
const C={URL};vm.createContext(C);
for(const name of ['validator','engine','trace-import','builder.workbench'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/'+name+'.js'),'utf8'),C);
const plain=x=>JSON.parse(JSON.stringify(x));
const inspect=(d,i,pid)=>C.builderEffectivePanelStates(d,i).panels.find(p=>p.id===pid);
const field=(p,key)=>p.fields.find(f=>f.key===key);

test('all panels appear on an unpatched step, with actual folded values and exact origins',()=>{
  const d={panels:[{id:'a',type:'state',initial:{state:'OFF',enabled:false,n:0,nil:null}},{id:'b',type:'budget',initial:{values:{ram:1}}}],steps:[{panels:{a:{state:'ON'}}},{}]};
  const before=JSON.stringify(d), list=C.builderEffectivePanelStates(d,1).panels;
  assert.equal(list.length,2);assert.equal(JSON.stringify(d),before);
  const a=list[0], b=list[1];
  assert.deepEqual(plain(a.state),plain(C.foldPanelStates(d).a[1]));
  assert.equal(field(a,'state').origin.label,'Inherited from step 1');
  assert.deepEqual(plain(field(a,'state').origin.inputs[0].path),['steps',0,'panels','a','state']);
  assert.equal(field(a,'enabled').value,false);assert.equal(field(a,'n').value,0);assert.equal(field(a,'nil').value,null);
  assert.equal(field(b,'values').origin.kind,'initial');
  assert.deepEqual(plain(field(b,'values').origin.inputs[0].path),['panels',1,'initial','values']);
});
test('current assignments and same-valued explicit patches are still attributed to the current step',()=>{
  const d={panels:[{id:'p',type:'gauge',initial:{value:2}}],steps:[{panels:{p:{value:2}}}]};
  assert.equal(field(inspect(d,0,'p'),'value').origin.kind,'step');
});
test('enterOnce takes precedence only at its own step, then returns to carried history',()=>{
  const d={panels:[{id:'p',type:'state',initial:{state:'OFF'}}],steps:[{panels:{p:{state:'ON'}}},{panels:{p:{enterOnce:{state:'TEMP'}}}},{}]};
  const once=field(inspect(d,1,'p'),'state'), later=field(inspect(d,2,'p'),'state');
  assert.equal(once.value,'TEMP');assert.equal(once.origin.kind,'transient');
  assert.deepEqual(plain(once.origin.inputs[0].path),['steps',1,'panels','p','enterOnce','state']);
  assert.equal(later.value,'ON');assert.equal(later.origin.label,'Inherited from step 1');
});
test('nested maps retain whole-map replacement semantics instead of inventing field merges',()=>{
  const d={panels:[{id:'p',type:'budget',initial:{values:{ram:2,power:3}}}],steps:[{panels:{p:{values:{ram:9}}}},{}]};
  const p=inspect(d,1,'p');assert.deepEqual(plain(field(p,'values').value),{ram:9});
  assert.equal(field(p,'values').origin.kind,'inherited');
});
test('logs and timeline arrays show accumulated history; their enterOnce values are not claimed as effective',()=>{
  const d={panels:[{id:'p',type:'timeline',initial:{events:[{at:'0s'}],log:['first'],miss:[]}}],steps:[{panels:{p:{events:[{at:'1s'}],log:['second'],enterOnce:{events:[],log:['ignored']}}}}]};
  const p=inspect(d,0,'p');
  assert.equal(field(p,'events').value.length,2);assert.deepEqual(plain(field(p,'log').value),['first','second']);
  for(const key of ['events','log']){
    assert.equal(field(p,key).origin.kind,'history');assert.equal(field(p,key).origin.inputs.length,2);
    assert.ok(field(p,key).origin.inputs.every(i=>!i.path.includes('enterOnce')));
  }
});
test('invalid timeline cursor patches retain the real earlier source; initial values reflect the engine unchanged',()=>{
  const d={panels:[{id:'p',type:'timeline',initial:{now:'0s'}}],steps:[{panels:{p:{now:'2s'}}},{panels:{p:{now:'nonsense'}}}]};
  const f=field(inspect(d,1,'p'),'now');assert.equal(f.value,'2s');assert.equal(f.origin.label,'Inherited from step 1');
  d.panels[0].initial.now='bad initial';d.steps=[{}];
  const initial=field(inspect(d,0,'p'),'now');assert.equal(initial.value,'bad initial');assert.equal(initial.origin.kind,'initial');
});
test('buffer compaction, resets and transient paints use canonical states with operation history',()=>{
  const d={panels:[{id:'p',type:'buffer',segments:10,initial:{cells:['free']}}],steps:Array.from({length:66},(_,i)=>({panels:{p:{mark:[{from:0,to:1,state:i%2?'used':'free'}]}}}))};
  const p=inspect(d,65,'p');assert.deepEqual(plain(p.state),plain(C.foldPanelStates(d).p[65]));
  assert.equal(field(p,'cells').origin.kind,'history');assert.equal(field(p,'mark').origin.inputs.length,67);
  d.steps.push({panels:{p:{cells:['free'],enterOnce:{mark:[]}}}});
  assert.equal(field(inspect(d,66,'p'),'mark').origin.kind,'transient');
});
test('phone operations use notification history and validate clock assignments; ignored enterOnce is not attributed',()=>{
  const d={panels:[{id:'p',type:'phone',initial:{clock:'9:00',notify:{app:'Mail',text:'one'}}}],steps:[{panels:{p:{notify:{app:'Chat'},clock:'9:01'}}},{panels:{p:{clear:true,clock:42,enterOnce:{clock:'ignored'}}}}]};
  const p=inspect(d,1,'p');assert.deepEqual(plain(field(p,'notifications').value),[]);
  assert.equal(field(p,'notifications').origin.kind,'history');assert.equal(field(p,'notifications').origin.inputs.length,3);
  assert.equal(field(p,'clock').value,'9:01');assert.equal(field(p,'clock').origin.label,'Inherited from step 1');
  assert.equal(field(p,'_phoneAdded').origin.kind,'engine');
});
test('inflight bars use start/end/mark history while step metadata comes from the engine',()=>{
  const d={panels:[{id:'p',type:'inflight',lanes:[{id:'a'}]}],steps:[{panels:{p:{start:[{lane:'a',label:'job'}]}}},{panels:{p:{mark:[{lane:'a',state:'retry'}]}}},{panels:{p:{end:['a']}}}]};
  const p=inspect(d,1,'p');assert.equal(field(p,'bars').origin.inputs.length,2);assert.equal(field(p,'bars').value[0].state,'retry');
  assert.equal(field(p,'stepCount').value,3);assert.equal(field(p,'currentStep').value,1);
  assert.equal(field(p,'stepCount').origin.kind,'engine');
});
test('legacy patch aliases and unusual panel IDs resolve exact JSON source ranges',()=>{
  const id='p."quoted', d={panels:[{id,type:'state'}],steps:[{patch:{[id]:{state:'ON'}}},{}]};
  const f=field(inspect(d,1,id),'state');assert.deepEqual(plain(f.origin.inputs[0].path),['steps',0,'patch',id,'state']);
  const text=JSON.stringify(d,null,2), loc=C.jsonLocate(text,f.origin.inputs[0].path);
  assert.equal(text.slice(loc.start,loc.end),'"ON"');
});
test('earlier step snapshots exclude future inputs and invalid selections fail without stale state',()=>{
  const d={panels:[{id:'p',type:'state',initial:{state:'OFF'}}],steps:[{}, {panels:{p:{state:'ON'}}}]};
  assert.equal(field(inspect(d,0,'p'),'state').origin.kind,'initial');
  assert.ok(C.builderEffectivePanelStates(d,2).error);assert.ok(C.builderEffectivePanelStates(d,-1).error);
  d.panels.push(d.panels[0]);assert.match(C.builderEffectivePanelStates(d,0).error,/duplicate/);
});

test('source locations compose correctly inside a page with hidden-tab sections',()=>{
  const d={nodes:{n:{}},rows:[['n']],panels:[{id:'p',type:'state',initial:{state:'OFF'}}],steps:[{panels:{p:{state:'ON'}}},{}]};
  const raw={page:{blocks:[{heading:'intro',text:'Intro'},{tabs:[{label:'A',sections:[{heading:'A',diagram:d}]},{label:'B',sections:[{heading:'B',diagram:d}]}]}]}};
  const refs=C.specSectionPaths(raw), f=field(inspect(C.specValueAt(raw,refs[2].diagram),1,'p'),'state');
  const sourcePath=refs[2].diagram.concat(f.origin.inputs[0].path);
  assert.deepEqual(plain(sourcePath),['page','blocks',1,'tabs',1,'sections',0,'diagram','steps',0,'panels','p','state']);
  const text=JSON.stringify(raw), loc=C.jsonLocate(text,sourcePath); assert.equal(text.slice(loc.start,loc.end),'"ON"');
});

test('non-finite authored values cannot be misrepresented as null in snapshot JSON',()=>{
  const d=JSON.parse('{"panels":[{"id":"p","type":"gauge","initial":{"value":1e400}}],"steps":[{}]}');
  assert.match(C.builderEffectivePanelStates(d,0).error,/non-finite/);
});
