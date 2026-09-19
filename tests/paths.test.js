const {readSource} = require('../tools/source-loader.cjs');
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const code=['validator.js','engine.js','builder.workbench.js','steps.workbench.js','workspace.workbench.js']
  .map(n=>readSource(n)).join('\n');
const plain=v=>JSON.parse(JSON.stringify(v));
function load(extra={}){const c={...extra};vm.createContext(c);vm.runInContext(code,c);return c;}
function fixture(){return {view:'step',nodes:{api:{},device:{}},rows:[['api','device']],edges:[{from:'api',to:'device'}],
  panels:[{id:'state',type:'state',states:['pending','sent','applied','lost'],initial:{state:'pending'}},{id:'log',type:'log'}],
  steps:[
    {id:'one',text:'Accept',nodes:['api'],panels:{log:{log:[{text:'accepted'}]}}},
    {id:'two',text:'Authorize',nodes:['api']},
    {id:'three',text:'Send',edge:'api->device',panels:{state:{state:'sent',enterOnce:{note:'sending'}}}},
    {id:'four',text:'Apply',nodes:['device'],tone:{device:'ok'},panels:{state:{state:'applied'},log:{log:[{text:'applied'}]}}},
    {id:'five',text:'Ack',nodes:['api']},
    {id:'drop',text:'Dropped signal',nodes:['api'],tone:{device:'warn'},panels:{state:{state:'lost'},log:{log:[{text:'lost'}]}}}
  ],paths:[{id:'happy',label:'Happy path',color:'#38bdf8',steps:['one','two','three','four','five']},
    {id:'dropped',label:'Dropped signal',color:'#fb923c',steps:['one','two','three','drop']}]};}

test('path rows align their fork and end positions without changing the registry',()=>{
  const c=load(),d=fixture(),before=JSON.stringify(d),paths=c.diagramPathList(d);
  assert.deepEqual(plain(paths.map(p=>p.indices)),[[0,1,2,3,4],[0,1,2,5]]);
  assert.deepEqual(plain(c.pathStepRows(paths).map(row=>[row.path.id,row.start,row.end])),[['happy',0,4],['dropped',3,3]]);
  assert.equal(c.diagramForPath(d,'dropped').steps[3],d.steps[5]);
  assert.equal(JSON.stringify(d),before);
});
test('nested forks use their closest earlier prefix; disjoint paths begin in column one',()=>{
  const c=load(),d=fixture();
  d.paths.push({id:'nested',steps:['one','two','three','drop','five']},
    {id:'early',steps:['one','drop']},{id:'separate',steps:['drop']});
  assert.deepEqual(plain(c.pathStepRows(c.diagramPathList(d)).map(row=>[row.start,row.end])),[[0,4],[3,3],[4,4],[1,1],[0,0]]);
});
test('selected sequences fold append operations, transient state and node tones without success leaking into failure',()=>{
  const c=load(),d=fixture(),happy=c.diagramForPath(d,'happy'),drop=c.diagramForPath(d,'dropped');
  assert.deepEqual(plain(c.foldPanelStates(happy).log[4].log.map(l=>l.text)),['accepted','applied']);
  const state=c.foldPanelStates(drop);
  assert.deepEqual(plain(state.log[3].log.map(l=>l.text)),['accepted','lost']);
  assert.equal(state.state[2].note,'sending');assert.equal(state.state[3].note,undefined);
  assert.equal(state.state[3].state,'lost');
  assert.equal(c.foldNodeTones(drop)[3].device,'warn');
});
test('invalid path references, duplicate identities, empty paths and unsafe colors are rejected with source locations',()=>{
  const c=load();assert.deepEqual(plain(c.validate(c.normalize(fixture())).errors),[]);
  const cases=[d=>d.paths[1].steps.push('missing'),d=>d.paths[1].steps.push('one'),
    d=>d.paths[1].id='happy',d=>d.paths[0].steps=[],d=>d.paths[1].color='url(x)',
    d=>d.steps[5].id='one',d=>d.paths='broken'];
  for(const mutate of cases){const d=fixture();mutate(d);const errors=c.validate(c.normalize(d)).errors;assert.ok(errors.some(e=>e.includes('.paths')),errors.join('\n'));}
});
test('creating an alternate assigns legacy IDs once and preserves the shared prefix in one edit',()=>{
  const c=load(),d=fixture();delete d.paths;d.steps=d.steps.slice(0,5);d.steps.forEach(s=>delete s.id);
  const before=JSON.stringify(d),p=c.planPathStepEdit(JSON.stringify(d,null,2),d,0,'happy',2,'fork');
  assert.equal(p.error,undefined);const next=JSON.parse(p.text);
  assert.equal(next.paths[0].label,'Happy path');assert.equal(next.paths[1].label,'Dropped signal');
  assert.deepEqual(next.paths[1].steps.slice(0,3),next.paths[0].steps.slice(0,3));
  assert.equal(next.paths[0].steps.length,5);assert.equal(next.paths[1].steps.length,4);
  assert.deepEqual(JSON.parse(p.text.slice(p.start,p.end)),next.steps[p.index]);
  assert.deepEqual(plain(c.validate(c.normalize(next)).errors),[]);assert.equal(JSON.stringify(d),before);
});
test('append, duplicate and reorder affect only the selected path, while deleting a shared step prunes all references',()=>{
  const c=load(),d=fixture(),text=JSON.stringify(d);
  let p=c.planDuplicateStep(text,d,0,2,'dropped'),next=JSON.parse(p.text);
  assert.deepEqual(next.paths[0],d.paths[0]);assert.equal(next.paths[1].steps[3],'three-copy1');
  assert.deepEqual({...next.steps[p.index],id:'three'},d.steps[2]);
  p=c.planMoveStep(text,d,0,5,-1,'dropped');next=JSON.parse(p.text);
  assert.deepEqual(next.paths[1].steps,['one','two','drop','three']);assert.deepEqual(next.steps,d.steps);
  p=c.planAddStep(text,d,0,'dropped');next=JSON.parse(p.text);
  assert.equal(next.paths[1].steps.at(-1),next.steps[p.index].id);assert.deepEqual(next.paths[0],d.paths[0]);
  p=c.planDeleteStep(text,d,0,2);next=JSON.parse(p.text);
  assert.ok(next.paths.every(p=>!p.steps.includes('three')));assert.deepEqual(plain(c.validate(c.normalize(next)).errors),[]);
});
test('removing the last alternate retains an explicit primary sequence so orphan outcomes never play',()=>{
  const c=load(),d=fixture(),p=c.planPathStepEdit(JSON.stringify(d),d,0,'dropped',5,'remove');
  const next=JSON.parse(p.text);assert.equal(next.paths.length,1);
  assert.deepEqual(plain(c.diagramForPath(next).steps.map(s=>s.id)),['one','two','three','four','five']);
  assert.equal(next.steps.length,6);
  next.paths[0].steps=['one'];assert.ok(c.planDeleteStep(JSON.stringify(next),next,0,0).error);
});
test('story and effective-state inspection use source indices with selected-path ordering',()=>{
  const c=load(),d=fixture(),sec=c.builderStorySections(d)[0],entries=c.builderStorySteps(sec,'','dropped');
  assert.equal(entries[3].position,3);assert.equal(entries[3].index,5);
  assert.equal(c.builderStorySteps(sec,'4','dropped')[0].id,'drop');
  assert.equal(c.builderPositionLine(d,{kind:'step',section:0,index:5,pathId:'dropped'}),'step 4 of 4 · Dropped signal');
  assert.deepEqual(plain(entries[3].path),['steps',5]);
  const model=c.builderEffectivePanelStates(d,5,'dropped');
  assert.equal(model.panels[0].state.state,'lost');assert.equal(model.panels[0].state.note,undefined);
  const field=model.panels[0].fields.find(f=>f.key==='state');
  assert.deepEqual(plain(field.origin.inputs[0].path),['steps',5,'panels','state','state']);
});

function harness(d=fixture()){
  const intervals=new Map(),paints=[],rendered=[];let seq=0,folded;
  function el(){
    const attrs={},events={},classes=new Set();
    const e={children:[],style:{setProperty(k,v){this[k]=v;}},
      classList:{add:k=>classes.add(k),remove:k=>classes.delete(k),contains:k=>classes.has(k)},
      appendChild(n){this.children.push(n);n.parentNode=this;return n;},removeChild(n){this.children.splice(this.children.indexOf(n),1);},
      setAttribute(k,v){attrs[k]=String(v);},getAttribute:k=>attrs[k]??null,
      addEventListener(k,fn){(events[k]??=[]).push(fn);},fire(k){(events[k]||[]).forEach(fn=>fn({stopPropagation(){}}));},
      dispatchEvent(){},querySelectorAll(){return [];},getBoundingClientRect(){return {left:0,top:0,width:100,height:20};},cloneNode:()=>el()};
    Object.defineProperty(e,'firstChild',{get(){return this.children[0];}});return e;
  }
  const c=load({CustomEvent:function(type){this.type=type;},document:{createElement:el,getElementById:()=>null},window:{matchMedia:()=>({matches:true}),
    setInterval(fn){intervals.set(++seq,fn);return seq;},clearInterval:id=>intervals.delete(id)},
    setTimeout:()=>1,clearTimeout(){}});
  // Enable timer logic but keep geometry/animation irrelevant to the test.
  c.RM=false;
  const board=()=>({svg:el(),nodeEls:{},edgeIds:{}}),term={};
  ['bar','chips','stepN','stepText','srcA','lanePill','stepIdEl','btnPrev','btnPlay','btnNext','btnAmb','btnStep','playbackStatus'].forEach(k=>term[k]=el());
  term.bar.appendChild(el()).appendChild(term.stepN);
  folded=c.foldPanelStates(c.diagramForPath(d));
  const sp=c.attachStepper(el(),el(),term,d,'test',board(),{},
    {setDiagram(d){folded=c.foldPanelStates(d);},setStep(i){paints.push(plain(folded.state[i]));}},null,
    {autoplay:false,renderPath(d){rendered.push(d.steps.map(s=>s.id));return board();}});
  sp.enterStep(false);
  return {c,sp,term,paints,rendered,intervals,tick(){[...intervals.values()].forEach(fn=>fn());}};
}
test('switching paths pauses, rebuilds the chosen sequence, and stops at its own terminal step',()=>{
  const h=harness();h.term.btnPlay.fire('click');h.tick();assert.equal(h.sp.current().n,1);
  h.sp.selectPath('dropped',2);assert.equal(h.intervals.size,0);assert.equal(h.sp.path(),'dropped');
  assert.deepEqual(plain(h.rendered.at(-1)),['one','two','three','drop']);assert.equal(h.sp.sourceIndex(3),5);
  h.term.btnPlay.fire('click');h.tick();assert.equal(h.sp.current().id,'drop');assert.equal(h.intervals.size,0);
  assert.equal(h.term.playbackStatus.textContent,'Finished');assert.equal(h.term.btnPlay.getAttribute('aria-label'),'Replay');
  h.term.btnPlay.fire('click');assert.equal(h.sp.current().n,0);assert.equal(h.intervals.size,1);
  h.sp.jump(3);assert.equal(h.intervals.size,0);
  assert.equal(h.term.btnNext.disabled,true);h.sp.advance(10);assert.equal(h.sp.current().id,'drop');
  assert.equal(h.paints.at(-1).state,'lost');
  h.sp.selectPath('happy',4);assert.equal(h.sp.current().id,'five');assert.equal(h.paints.at(-1).state,'applied');
  h.sp.jumpSource(5);assert.equal(h.sp.path(),'dropped');assert.equal(h.sp.current().n,3);
  h.sp.destroy();assert.equal(h.sp.selectPath('happy'),false);
});
test('pathless diagrams keep unlabeled legacy navigation; a single explicit path has no path label',()=>{
  const d=fixture();delete d.paths;const h=harness(d);
  assert.ok(h.term.chips.children.every(b=>b.className.startsWith('schip')));h.sp.jump(-1);assert.equal(h.sp.current().id,'drop');
  const one=fixture();one.paths.pop();assert.ok(harness(one).term.chips.children.every(b=>b.className.startsWith('schip')));
});
test('selecting the existing path keeps the board, and a one-step path never starts an autoplay timer',()=>{
  const h=harness();h.sp.selectPath('happy',2);assert.equal(h.rendered.length,0);assert.equal(h.sp.current().id,'three');
  const d=fixture();d.paths=[{id:'one',steps:['one']}];const single=harness(d);
  single.term.btnPlay.fire('click');assert.equal(single.intervals.size,0);assert.equal(single.term.btnNext.disabled,true);
});
test('ordinary edits restore the selected alternate by path and step IDs',()=>{
  const h=harness(),page={title:'Paths',sections:[{heading:'Test',diagram:fixture()}]};
  h.sp.selectPath('dropped',3);
  const saved=h.c.workbenchPreviewSnapshot(page,{sections:[{number:1,stepper:h.sp}]});
  assert.equal(saved.sections[0].path,'dropped');assert.equal(saved.sections[0].id,'drop');
  page.sections[0].diagram.steps[5].text='Edited failure caption';
  const next=harness(page.sections[0].diagram);
  h.c.restoreWorkbenchPreview(page,{sections:[{number:1,stepper:next.sp}]},saved);
  assert.equal(next.sp.path(),'dropped');assert.equal(next.sp.current().n,3);assert.equal(next.paints.at(-1).state,'lost');
});
test('path references round-trip through copied hashes without changing old hash shapes',()=>{
  const c=load(),hash=c.buildHash({d:'signal',p:'drop signal',m:'step',s:'drop'});
  assert.equal(c.parseHash(hash).p,'drop signal');assert.equal(c.parseHash('#d=signal&s=three').p,undefined);
});

test('an alternate diverging at four occupies the same columns and keeps its row on selection',()=>{
  const d=fixture();d.paths[1].steps.push('five');const h=harness(d);
  const matrix=h.term.chips.children[0],happy=matrix.children[0],drop=matrix.children[1];
  assert.equal(happy.children[0].textContent,'Happy path');assert.equal(drop.children[0].textContent,'Dropped signal');
  assert.deepEqual(drop.children.slice(1).map(b=>b.textContent),[1,2,3,4,5]);
  assert.deepEqual(drop.children.slice(1).map(b=>b.style.gridColumn),happy.children.slice(1).map(b=>b.style.gridColumn));
  assert.deepEqual(drop.children.slice(1).map(b=>b.className.includes('shared-step-shadow')),[true,true,true,false,false]);
  assert.equal(drop.children[1].style['--path-color'],d.paths[0].color);
  assert.match(drop.children[1].getAttribute('aria-label'),/shared with Happy path/);
  assert.equal(matrix.style['--path-step-count'],5);
  drop.children[4].fire('click');
  assert.equal(h.sp.path(),'dropped');assert.equal(h.sp.current().id,'drop');
  assert.equal(h.term.chips.children[0],matrix);assert.equal(drop.children[4].getAttribute('aria-current'),'true');
  assert.equal(drop.children[0].getAttribute('aria-pressed'),'true');assert.equal(happy.children[0].getAttribute('aria-pressed'),'false');
  drop.children[1].fire('click');assert.equal(h.sp.path(),'dropped');assert.equal(h.sp.current().id,'one');
  assert.equal(drop.children[1].getAttribute('aria-current'),'true');
  assert.equal(happy.children[1].getAttribute('aria-current'),'false');
  assert.equal(drop.children[4].getAttribute('aria-current'),'false');
  happy.children[0].fire('click');assert.equal(h.sp.path(),'happy');assert.equal(h.sp.current().n,0);
  drop.children[0].fire('click');assert.equal(h.sp.path(),'dropped');assert.equal(h.sp.current().n,0);
  assert.equal(h.sp.current().id,'one');assert.equal(drop.children[1].getAttribute('aria-current'),'true');
  assert.equal(h.paints.at(-1).state,'pending');assert.equal(h.intervals.size,0);
  drop.children[4].fire('click');assert.equal(h.sp.current().id,'drop');
  drop.children[0].fire('click');assert.equal(h.sp.current().id,'one','clicking the selected path restarts at its shared first beat');
});

test('shared shadows end with their own path and use the correct ancestor for nested forks',()=>{
  const d=fixture();d.paths.push({id:'nested',label:'Retry',steps:['one','two','three','drop','five']},
    {id:'separate',steps:['drop']});
  const h=harness(d),rows=h.term.chips.children[0].children,drop=rows[1],nested=rows[2],separate=rows[3];
  assert.deepEqual(drop.children.slice(1).map(b=>b.textContent),[1,2,3,4],'no ghost after the failure ending');
  assert.deepEqual(nested.children.slice(1).map(b=>b.className.includes('shared-step-shadow')),[true,true,true,true,false]);
  assert.equal(nested.children[1].style['--path-color'],d.paths[0].color);
  assert.equal(separate.children.length,2);assert.equal(separate.children[1].className,'schip');
  d.paths.push({id:'nested-again',steps:['one','two','three','drop','five','four']});
  const deep=harness(d).term.chips.children[0].children[4];
  assert.equal(deep.children[4].style['--path-color'],d.paths[1].color);
  assert.match(deep.children[4].getAttribute('aria-label'),/shared with Dropped signal/);
});

test('the first colored alternate selects and edits its own caption and panel patch',()=>{
  const d=fixture(),h=harness(d),row=h.term.chips.children[0].children[1];
  const first=row.children.slice(1).find(b=>!b.className.includes('shared-step-shadow'));
  first.fire('click');
  assert.equal(h.sp.current().id,'drop');
  assert.equal(h.sp.sourceIndex(),5);
  assert.equal(h.paints.at(-1).state,'lost');
  const target={kind:'step',section:0,index:h.sp.sourceIndex(),pathId:h.sp.path()};
  const edit=h.c.planSetField(JSON.stringify(d),d,h.c.builderTargetPath(d,target),'text',JSON.stringify('Alternate edited'));
  assert.equal(edit.error,undefined);
  const edited=JSON.parse(edit.text);
  const patch=h.c.planStepSetPanelPatch(edit.text,edited,0,target.index,'state',JSON.stringify({state:'pending'}));
  assert.equal(patch.error,undefined);
  const next=JSON.parse(patch.text);
  assert.deepEqual(next.steps.slice(0,5),d.steps.slice(0,5),'happy-path bodies remain byte-for-byte equivalent');
  assert.deepEqual(next.paths,d.paths,'an edit must not shift either sequence');
  assert.equal(next.steps[5].text,'Alternate edited');
  assert.equal(h.c.foldPanelStates(h.c.diagramForPath(next,'dropped')).state[3].state,'pending');
  assert.equal(h.c.foldPanelStates(h.c.diagramForPath(next,'happy')).state[3].state,'applied');
  const baseEdit=h.c.planSetField(patch.text,next,['steps',3],'text',JSON.stringify('Happy path edited'));
  assert.deepEqual(JSON.parse(baseEdit.text).steps[5],next.steps[5],'editing the aligned base step leaves the alternate untouched');
});

test('new forks color their new outcome and leave the complete prefix shared',()=>{
  const c=load(),d=fixture(),plan=c.planPathStepEdit(JSON.stringify(d),d,0,'happy',2,'fork');
  assert.equal(plan.error,undefined);
  const next=JSON.parse(plan.text),h=harness(next),row=h.term.chips.children[0].children[2];
  assert.deepEqual(row.children.slice(1).map(b=>b.className.includes('shared-step-shadow')),[true,true,true,false]);
  row.children[4].fire('click');
  assert.equal(h.sp.path(),plan.pathId);assert.equal(h.sp.sourceIndex(),plan.index);
  assert.equal(h.sp.current().id,next.steps[plan.index].id);
});

test('paths ending inside a shared prefix show only shared shadows, without an invented branch',()=>{
  const d=fixture();d.paths.push({id:'short',steps:['one','two']},{id:'identical',steps:d.paths[0].steps.slice()});
  const h=harness(d),rows=h.term.chips.children[0].children;
  for(const row of rows.slice(2)){
    assert.ok(row.children.slice(1).every(b=>b.className.includes('shared-step-shadow')));
    assert.match(row.getAttribute('aria-label'),/all steps shared/);
    assert.doesNotMatch(row.getAttribute('aria-label'),/fork at/);
    row.children.at(-1).fire('click');
    assert.equal(h.term.btnNext.disabled,true);
  }
});


test('Radar alarms carry until explicitly cleared and stay isolated between paths',()=>{
  const c=load(),d={nodes:{sensor:{}},rows:[['sensor']],
    panels:[{id:'radar',type:'radar',threshold:80,initial:{subject:{x:160,y:110}}}],
    steps:[
      {id:'near',text:'Inside reference threshold'},
      {id:'alarm',text:'Sensor reports alarm',panels:{radar:{alert:true}}},
      {id:'depart',text:'Subject leaves',panels:{radar:{subject:null}}},
      {id:'reset',text:'Clear alarm',panels:{radar:{alert:false}}},
      {id:'quiet',text:'No alarm reported',panels:{radar:{}}}
    ],paths:[{id:'happy',steps:['near','alarm','depart','reset']},
      {id:'quiet',steps:['near','quiet','depart']}]};
  const before=JSON.stringify(d);
  const alerts=id=>c.foldPanelStates(c.diagramForPath(d,id)).radar.map(state=>c.radarModel(d.panels[0],state).alert);
  assert.deepEqual(plain(alerts('happy')),[false,true,true,false]);
  assert.deepEqual(plain(alerts('quiet')),[false,false,false]);
  assert.deepEqual(plain(alerts('happy')),[false,true,true,false], 'returning to a path is deterministic');
  assert.equal(JSON.stringify(d),before);
  const edit=c.planStepSetPanelPatch(JSON.stringify(d),d,0,4,'radar','{"alert":true}');
  assert.equal(edit.error,undefined);
  const edited=JSON.parse(edit.text);
  assert.equal(c.foldPanelStates(c.diagramForPath(edited,'quiet')).radar[1].alert,true);
  assert.equal(edited.steps[1].panels.radar.alert,true,'editing an alternate preserves the main step');
  const clear=c.planStepSetPanelPatch(edit.text,edited,0,4,'radar','{"alert":false}');
  assert.equal(c.foldPanelStates(c.diagramForPath(JSON.parse(clear.text),'quiet')).radar[1].alert,false);
});
