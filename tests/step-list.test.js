const commandContext = require('./workbench-command-context.cjs');
const {readSource} = require('../tools/source-loader.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const code = ['validator.js','engine.js','builder.workbench.js','steps.workbench.js','reuse.workbench.js']
  .map(name=>readSource(name)).join('\n');
const plain = value=>JSON.parse(JSON.stringify(value));
function load(globals={}){ const c={...globals}; vm.createContext(c); vm.runInContext(code,c); return c; }
function fixture(){
  return {page:{title:'Story',blocks:[{heading:'Prose'}, {tabs:[{label:'Recovery',sections:[
    {heading:'Replica read',diagram:{nodes:{api:{},db:{}},rows:[['api','db']],steps:[
      {id:'one',text:'First',nodes:['api']},
      {id:'two',text:'Second',edge:'api->db',lane:'RPC',panels:{log:{log:[{text:'retry'}],enterOnce:{note:'once'}}}},
      {id:'three',text:'Third'}],panels:[{id:'log',type:'log'}]}}
  ]}]}]}};
}
const dOf = raw=>raw.page.blocks[1].tabs[0].sections[0].diagram;

test('story model keeps raw section ordinals, tab paths, original indices and multi-term metadata search',()=>{
  const c=load(), raw=fixture(), before=JSON.stringify(raw), sections=c.builderStorySections(raw);
  assert.equal(sections.length,1); assert.equal(sections[0].section,1);
  assert.equal(sections[0].label,'Recovery / Replica read');
  const entries=c.builderStorySteps(sections[0],'rpc log second');
  assert.equal(entries.length,1); assert.equal(entries[0].index,1);
  assert.deepEqual(plain(entries[0].tab),{block:1,tab:0});
  assert.deepEqual(plain(entries[0].path),['page','blocks',1,'tabs',0,'sections',0,'diagram','steps',1]);
  assert.equal(entries[0].summary,'RPC · 1 hop · 0 nodes · 1 panel');
  assert.equal(c.builderStorySteps(sections[0],'two api->db').length,1);
  assert.equal(c.builderStorySteps(sections[0],'unknown').length,0);
  assert.equal(JSON.stringify(raw),before);
  assert.equal(c.builderStorySections({nodes:{n:{}},rows:[['n']]}).length,1);
  assert.equal(c.builderStorySections({sections:[{heading:'No diagram'}]}).length,0);
});

test('duplicate preserves complete patches, avoids ID collisions, returns the exact inserted range, and leaves surrounding text intact',()=>{
  const c=commandContext(['graph','narrative']), raw=fixture(); dOf(raw).steps.push({id:'two-copy1',text:'Existing copy'});
  const text=JSON.stringify(raw,null,2), before=JSON.stringify(raw);
  const plan=c.planDuplicateStep(text,raw,1,1), next=JSON.parse(plan.text), d=dOf(next);
  assert.equal(plan.index,2); assert.equal(d.steps[2].id,'two-copy2');
  assert.deepEqual({...d.steps[2],id:'two'},dOf(raw).steps[1]);
  assert.deepEqual(JSON.parse(plan.text.slice(plan.start,plan.end)),d.steps[2]);
  assert.deepEqual(next.page.blocks[0],raw.page.blocks[0]);
  const oldEnd=c.jsonLocate(text,['page','blocks',1,'tabs',0,'sections',0,'diagram','steps',1]).end;
  assert.equal(plan.text.slice(0,oldEnd),text.slice(0,oldEnd));
  assert.equal(JSON.stringify(raw),before);
  const folded=c.foldPanelStates(d).log;
  assert.equal(folded[2].log.length,2); // copying a beat repeats append operations
  assert.equal(folded[2].note,'once'); assert.equal(folded[3].note,undefined);
});

test('ID-less and unusual-ID duplication works for bare diagrams and invalid selections do not produce edits',()=>{
  const c=commandContext(['narrative']), raw={nodes:{n:{}},rows:[['n']],steps:[{text:'Only',panels:{p:{value:0}}}]};
  let plan=c.planDuplicateStep(JSON.stringify(raw),raw,0,0);
  assert.deepEqual(JSON.parse(plan.text).steps,[raw.steps[0],raw.steps[0]]);
  raw.steps[0].id='__proto__';
  plan=c.planDuplicateStep(JSON.stringify(raw),raw,0,0);
  assert.equal(JSON.parse(plan.text).steps[1].id,'__proto__-copy1');
  for(const index of [-1,99,0.5,'0']) assert.ok(c.planDuplicateStep(JSON.stringify(raw),raw,0,index).error);
});

test('append supports an edgeless state story and creates its steps array without inventing a hop',()=>{
  const c=commandContext(['narrative']), raw={nodes:{n:{}},rows:[['n']],panels:[{id:'p',type:'state',states:['ready']}]};
  const plan=c.planAddStep(JSON.stringify(raw),raw,0), next=JSON.parse(plan.text);
  assert.equal(plan.index,0); assert.equal(next.steps.length,1);
  assert.equal(next.steps[0].edge,undefined);
  assert.deepEqual(plain(c.validate(c.normalize(next)).errors),[]);
});

function harness(raw=fixture()){
  const doc={activeElement:null}, elements={}, observers=[], history=[], navigation=[], inspections=[], timers=[];
  function el(tag='div',id=''){
    const attrs={}, handlers={};
    const node={tagName:tag.toUpperCase(),id,children:[],value:'',disabled:false,hidden:false,open:true,handlers,
      appendChild(child){ this.children.push(child); child.parentNode=this; return child; },
      setAttribute(k,v){ attrs[k]=String(v); },getAttribute:k=>attrs[k] ?? null,
      addEventListener(k,fn){ (handlers[k] ||= []).push(fn); },
      querySelector(selector){ return this.children.find(child=>selector==='[aria-current="step"]' && child.getAttribute('aria-current')==='step') || null; },
      closest(selector){ return selector==='.story-step' && this.className==='story-step' ? this : null; },
      focus(){ doc.activeElement=this; },scrollIntoView(){ this.scrolled=true; },
      fire(type,props={}){
        const ev={target:this,preventDefault(){ this.prevented=true; },...props};
        for(let at=this;at;at=at.parentNode) for(const fn of at.handlers[type] || []) fn(ev);
        return ev;
      }};
    Object.defineProperty(node,'innerHTML',{set(){ this.children=[]; }});
    Object.defineProperty(node,'firstChild',{get(){ return this.children[0]; }});
    if(id) elements[id]=node; return node;
  }
  const root=el(); doc.addEventListener=root.addEventListener.bind(root);
  doc.createElement=el; doc.getElementById=id=>elements[id] || null;
  for(const id of ['sec-steps','steps-section','steps-search','steps-list','steps-status','steps-paging',
    'steps-add','steps-duplicate','steps-earlier','steps-later','steps-previous','steps-next','steps-inspect',
    'steps-path','steps-path-tools','steps-path-label','steps-path-color','steps-fork','steps-path-save','steps-path-remove',
    'steps-reuse','steps-independent','steps-remove-occurrence','steps-sharing','steps-shared-with',
    'steps-autoplay','steps-opening-view','src','view']) root.appendChild(el('div',id));
  const src=elements.src; src.value=JSON.stringify(raw,null,2);
  let rendered=src.value, target=null, locked=false, activePath=null, ui;
  const c=load({document:doc,setTimeout:fn=>timers.push(fn),MutationObserver:class {constructor(fn){ observers.push(fn); } observe(){}}});
  ui=c.initWorkbenchStepList({src,view:elements.view,renderedText:()=>rendered,selection:()=>target,locked:()=>locked,
    path:()=>activePath,selectPath(section,id){activePath=id;target=null;},
    inspect(){ inspections.push(target); },
    configure(plan,section){
      if(target && target.section!==section) target=null;
      history.push(src.value); src.value=plan.text; rendered=src.value; return true;
    },
    navigate(entry){ navigation.push(entry); target=entry.target; ui.sync(); },
    apply(plan,section){ history.push(src.value); src.value=plan.text; rendered=src.value;
      if(plan.pathId) activePath=plan.pathId;
      target={kind:'step',section,index:plan.index}; return true; }});
  return {c,ui,doc,e:elements,src,history,navigation,inspections,root,
    render(){ rendered=src.value; observers.forEach(fn=>fn()); },
    select(index,section=1){ target={kind:'step',section,index}; ui.sync(); },
    selectPath(id){activePath=id;ui.sync();},
    lock(value){ locked=value; root.fire('click'); },
    unlockOnEscape(){ root.addEventListener('keydown',()=>{ locked=false; }); },
    flushTimers(){ timers.splice(0).forEach(fn=>fn()); },
    undo(){ src.value=history.pop(); target=null; this.render(); },
    get target(){ return target; }};
}

test('playback settings save per diagram, preserve selection and content, and use normal undo',()=>{
  const h=harness();h.select(1);
  const auto=h.e['steps-autoplay'], opening=h.e['steps-opening-view'];
  assert.equal(auto.checked,false);assert.equal(opening.value,'ambient');
  auto.checked=true;auto.fire('click');assert.equal(auto.checked,true,'document click must not reset a pending change');
  auto.fire('change');
  assert.equal(dOf(JSON.parse(h.src.value)).autoplay,true);assert.equal(h.history.length,1);assert.equal(h.target.index,1);
  assert.deepEqual(dOf(JSON.parse(h.src.value)).steps,dOf(fixture()).steps);
  opening.value='step';opening.fire('change');assert.equal(dOf(JSON.parse(h.src.value)).view,'step');
  h.undo();assert.equal(opening.value,'ambient');assert.equal(auto.checked,true);
  h.undo();assert.equal(auto.checked,false);assert.deepEqual(JSON.parse(h.src.value),fixture());
});

test('playback settings refuse stale source and locked edits, and ambient-only disables autoplay',()=>{
  const h=harness(),auto=h.e['steps-autoplay'],opening=h.e['steps-opening-view'];
  h.lock(true);assert.equal(auto.disabled,true);auto.checked=true;auto.fire('change');assert.equal(h.history.length,0);
  h.lock(false);h.src.value+=' ';auto.checked=true;auto.fire('change');assert.equal(h.history.length,0);assert.equal(auto.checked,false);
  h.render();opening.value='ambient-only';opening.fire('change');assert.equal(auto.disabled,true);
  opening.value='step';opening.fire('change');assert.equal(auto.disabled,false);
});

test('playback settings stay on the chosen section when the last inspected step belongs elsewhere',()=>{
  const raw=fixture();raw.page.blocks[0].diagram={nodes:{n:{}},rows:[['n']],steps:[{text:'Introduction'}]};
  const h=harness(raw);h.select(1);
  h.e['steps-section'].value='0';h.e['steps-section'].fire('change');
  h.e['steps-autoplay'].checked=true;h.e['steps-autoplay'].fire('change');
  assert.equal(h.e['steps-section'].value,'0');assert.equal(h.target,null);
  const saved=JSON.parse(h.src.value);
  assert.equal(saved.page.blocks[0].diagram.autoplay,true);assert.equal(dOf(saved).autoplay,undefined);
});

test('Inspect requires a current selected step and refuses stale source or unfinished builder actions',()=>{
  const h=harness(),button=h.e['steps-inspect'];
  assert.equal(button.disabled,true);button.fire('click');assert.equal(h.inspections.length,0);
  h.select(1);assert.equal(button.disabled,false);button.fire('click');
  assert.deepEqual(h.inspections,[{kind:'step',section:1,index:1}]);
  h.lock(true);assert.equal(button.disabled,true);button.fire('click');assert.equal(h.inspections.length,1);
  h.lock(false);h.src.value+=' ';button.fire('click');assert.equal(h.inspections.length,1);
  assert.equal(button.disabled,true);
});

test('path occurrence actions select their result, use one undo each and preserve other paths',()=>{
  const raw=fixture();dOf(raw).paths=[{id:'happy',steps:['one','two','three']},{id:'offline',steps:['one','three']}];
  const h=harness(raw),e=h.e;h.selectPath('offline');h.select(0);
  assert.equal(e['steps-reuse'].disabled,false);assert.equal(e['steps-independent'].hidden,false);
  assert.match(e['steps-shared-with'].textContent,/Happy path/);
  e['steps-independent'].fire('click');
  assert.equal(h.history.length,1);assert.equal(h.target.index,3);
  assert.deepEqual(dOf(JSON.parse(h.src.value)).paths[1].steps,['one-copy1','three']);
  assert.deepEqual(dOf(JSON.parse(h.src.value)).paths[0],dOf(raw).paths[0]);
  assert.equal(e['steps-independent'].hidden,true);h.undo();h.select(0);
  e['steps-remove-occurrence'].fire('click');
  assert.equal(h.history.length,1);assert.equal(h.target.index,2);
  assert.deepEqual(dOf(JSON.parse(h.src.value)).steps,dOf(raw).steps);
  assert.deepEqual(dOf(JSON.parse(h.src.value)).paths[1].steps,['three']);
  assert.equal(e['steps-remove-occurrence'].disabled,true);
  e['steps-remove-occurrence'].fire('click');assert.equal(h.history.length,1);
  h.undo();assert.equal(h.src.value,JSON.stringify(raw,null,2));
});

test('reuse and occurrence controls refuse stale source and active builder gestures',()=>{
  const raw=fixture();dOf(raw).paths=[{id:'happy',steps:['one','two','three']},{id:'offline',steps:['one','three']}];
  const h=harness(raw),e=h.e;h.selectPath('offline');h.select(0);h.lock(true);
  assert.equal(e['steps-reuse'].disabled,true);assert.equal(e['steps-independent'].disabled,true);
  e['steps-independent'].fire('click');assert.equal(h.history.length,0);
  h.lock(false);h.src.value+=' ';e['steps-remove-occurrence'].fire('click');
  assert.equal(h.history.length,0);assert.equal(e['steps-reuse'].disabled,true);
  const pathless=harness();assert.equal(pathless.e['steps-reuse'].hidden,true);
});

test('filtered navigation and reorder act on original story indices and keep the same selected beat',()=>{
  const h=harness(),e=h.e;
  e['steps-search'].value='Second'; e['steps-search'].fire('input');
  assert.equal(e['steps-list'].children.length,1);
  e['steps-list'].firstChild.fire('click');
  assert.equal(h.navigation[0].index,1); assert.equal(e['steps-earlier'].disabled,false);
  assert.equal(h.doc.activeElement,e['steps-list'].firstChild);
  e['steps-earlier'].fire('click');
  assert.equal(dOf(JSON.parse(h.src.value)).steps[0].id,'two'); assert.equal(h.target.index,0);
  assert.equal(e['steps-search'].value,''); assert.equal(e['steps-earlier'].disabled,true);
  assert.equal(h.doc.activeElement,e['steps-list'].firstChild);
  assert.equal(h.history.length,1); h.undo();
  assert.equal(dOf(JSON.parse(h.src.value)).steps[1].id,'two');
  assert.equal(e['steps-duplicate'].disabled,true);
});

test('duplicate and append each apply once, select their result, and preserve ordinary button focus',()=>{
  const h=harness(),e=h.e; h.select(1);
  e['steps-duplicate'].fire('click');
  assert.equal(h.history.length,1); assert.equal(h.target.index,2);
  assert.equal(dOf(JSON.parse(h.src.value)).steps[2].id,'two-copy1');
  assert.equal(h.doc.activeElement,e['steps-duplicate']);
  e['steps-add'].fire('click');
  assert.equal(h.history.length,2); assert.equal(h.target.index,4);
  assert.equal(e['steps-later'].disabled,true);
});

test('a move pulses the selected row so the reorder is visible, and the pulse clears on its timer',()=>{
  const h=harness(),e=h.e; h.select(1);
  e['steps-later'].fire('click');
  assert.equal(h.target.index,2);
  const selected=e['steps-list'].querySelector('[aria-current="step"]');
  assert.equal(selected.className,'story-step story-moved');
  h.flushTimers();
  assert.equal(selected.className,'story-step');
});

test('source typing immediately disables stale controls and held row callbacks cannot edit changed JSON',()=>{
  const h=harness(),e=h.e; h.select(1);
  const held=e['steps-list'].children[1], original=h.src.value;
  h.src.value='{'; e.src.fire('input');
  assert.equal(e['steps-list'].children.length,0); assert.equal(e['steps-add'].disabled,true);
  held.fire('click'); e['steps-duplicate'].fire('click');
  assert.equal(h.history.length,0); assert.equal(h.navigation.length,0);
  h.src.value=original; h.render();
  assert.equal(e['steps-add'].disabled,false);
  const newer=e['steps-list'].firstChild; h.src.value+=' ';
  newer.fire('click'); assert.equal(h.navigation.length,0);
  h.render(); assert.equal(e['steps-list'].children.length,3);
});

test('armed modes disable structural controls and navigation, and Escape refreshes after the later builder handler',()=>{
  const h=harness(),e=h.e; h.select(1); h.lock(true);
  assert.equal(e['steps-duplicate'].disabled,true); assert.equal(e['steps-section'].disabled,true);
  e['steps-list'].children[1].fire('click'); assert.equal(h.navigation.length,0);
  assert.match(e['steps-status'].textContent,/Finish ADD TO STEP/);
  h.unlockOnEscape(); h.root.fire('keydown',{key:'Escape'});
  h.flushTimers();
  assert.equal(e['steps-duplicate'].disabled,false);
  assert.equal(e['steps-section'].disabled,false);
});

test('large stories render bounded pages, navigate to the final original index and show a duplicated final beat',()=>{
  const raw=fixture(); dOf(raw).steps=Array.from({length:401},(_,i)=>({id:'s'+i,text:'Beat '+i}));
  const h=harness(raw),e=h.e;
  assert.equal(e['steps-list'].children.length,200); assert.equal(e['steps-paging'].hidden,false);
  e['steps-next'].fire('click'); assert.equal(e['steps-list'].firstChild.getAttribute('data-step-index'),'200');
  e['steps-next'].fire('click'); assert.equal(e['steps-list'].children.length,1);
  e['steps-list'].firstChild.fire('click'); assert.equal(h.target.index,400);
  e['steps-duplicate'].fire('click'); assert.equal(h.target.index,401);
  assert.equal(e['steps-list'].children.length,2);
  assert.equal(e['steps-list'].children[1].getAttribute('aria-current'),'step');
  e['steps-search'].value='s399'; e['steps-search'].fire('input');
  assert.equal(e['steps-list'].firstChild.getAttribute('data-step-index'),'399');
});

test('keyboard list navigation moves focus without edits; search keeps native editing and markup stays literal',()=>{
  const raw=fixture(); dOf(raw).steps[0].text='<img src=x onerror=alert(1)>';
  const h=harness(raw),e=h.e,rows=e['steps-list'].children;
  assert.equal(rows[0].children[1].children[0].textContent,'<img src=x onerror=alert(1)>');
  e['steps-search'].fire('keydown',{key:'ArrowDown'}); assert.equal(h.doc.activeElement,rows[0]);
  rows[0].fire('keydown',{key:'End'}); assert.equal(h.doc.activeElement,rows[2]);
  rows[2].fire('keydown',{key:'ArrowUp'}); assert.equal(h.doc.activeElement,rows[1]);
  assert.equal(e['steps-search'].fire('keydown',{key:'ArrowLeft'}).prevented,undefined);
  assert.equal(rows[1].fire('keydown',{key:'Home',metaKey:true}).prevented,undefined);
  assert.equal(h.history.length,0); assert.equal(h.navigation.length,0);
});
