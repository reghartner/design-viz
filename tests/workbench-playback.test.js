const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const code = ['validator.js','engine.js','workspace.workbench.js']
  .map(name => fs.readFileSync(path.join(__dirname, '../src', name), 'utf8')).join('\n');
const copy = value => JSON.parse(JSON.stringify(value));

function element(){
  const attrs = {}, events = {}, classes = new Set();
  return {attrs, events, style:{setProperty(){}}, children:[],
    classList:{add:k=>classes.add(k), remove:k=>classes.delete(k), contains:k=>classes.has(k),
      toggle(k,on){if(on) classes.add(k);else classes.delete(k);}},
    appendChild(el){ if(el.parentNode) el.parentNode.removeChild(el); this.children.push(el); el.parentNode=this; return el; },
    insertBefore(el,before){ if(el.parentNode) el.parentNode.removeChild(el); this.children.splice(this.children.indexOf(before),0,el); el.parentNode=this; return el; },
    removeChild(el){ this.children=this.children.filter(child=>child!==el); el.parentNode=null; },
    setAttribute(k,v){ attrs[k]=String(v); }, getAttribute:k=>attrs[k] ?? null,
    querySelectorAll(){ return []; }, getBoundingClientRect(){ return {left:0,top:0,width:100,height:20}; },
    cloneNode(){ return element(); },
    dispatchEvent(){},
    addEventListener(k,fn){ (events[k] ||= []).push(fn); },
    fire(k){ for(const fn of events[k] || []) fn({}); }
  };
}
function stepperHarness(options, reducedMotion=false, diagramSettings={}){
  let sequence=0;
  const intervals=new Map(), timeouts=new Map(), ids={}, paints=[];
  const visibilityListeners=new Set();
  const context={CustomEvent:class {constructor(type){this.type=type;}},document:{createElement:element, getElementById:id=>ids[id] || null,
      addEventListener(type,fn){ if(type==='visibilitychange') visibilityListeners.add(fn); },
      removeEventListener(type,fn){ if(type==='visibilitychange') visibilityListeners.delete(fn); }},
    window:{matchMedia:()=>({matches:reducedMotion}),
      setInterval(fn){ const id=++sequence; intervals.set(id,fn); return id; },
      clearInterval:id=>intervals.delete(id)},
    setTimeout(fn){ const id=++sequence; timeouts.set(id,fn); return id; },
    clearTimeout:id=>timeouts.delete(id)};
  vm.createContext(context); vm.runInContext(code,context);
  const sec=element(), boardDiv=element(), board={svg:element(),nodeEls:{},edgeIds:{}};
  const term=Object.fromEntries(['bar','chips','stepN','stepText','srcA','lanePill','stepIdEl',
    'btnPrev','btnPlay','btnNext','btnAmb','btnStep','playbackStatus'].map(k=>[k,element()]));
  term.bar.appendChild(element()).appendChild(term.stepN);
  const edge='a->b(int)', animation=element(); animation.parentNode=element();
  animation.beginElement=()=>{ animation.starts=(animation.starts || 0)+1; };
  ids['fs0-am-0']=animation;
  board.edgeIds[edge]={idx:0,domId:'edge0',e:{from:'a',to:'b'}};
  ids.edge0=element();
  const diagram={nodes:{a:{},b:{}},steps:[
    {id:'first',text:'First'},
    {id:'second',text:'Second',edges:[edge],packets:[{edge,delay:1}]},
    {id:'third',text:'Third'}],...diagramSettings};
  const stepper=context.attachStepper(sec,boardDiv,term,diagram,'fs0',board,{},
    {setStep:(index,tween)=>paints.push({index,tween})},null,options);
  return {context,stepper,term,intervals,timeouts,paints,animation,boardDiv,
    visibilityListeners,
    visibility(hidden){ context.document.hidden=hidden; visibilityListeners.forEach(fn=>fn()); },
    tick(){ for(const fn of [...intervals.values()]) fn(); }};
}

test('workbench step entry and tab reveal stay paused; explicit Play advances and wraps',()=>{
  const h=stepperHarness({autoplay:false}), s=h.stepper;
  s.enterStep(true); assert.equal(h.intervals.size,0);
  h.term.btnStep.fire('click'); assert.equal(h.intervals.size,0);
  h.term.btnPlay.fire('click'); assert.equal(h.intervals.size,1);
  h.tick(); assert.equal(s.current().id,'second');
  h.tick(); h.tick(); assert.equal(s.current().id,'first');
  s.onHide(); s.onShow(); assert.equal(h.intervals.size,0);
  assert.equal(h.term.btnPlay.attrs['aria-label'],'Play');
});

test('autoplay is opt-in, manual navigation stays paused across tabs, and reduced motion is a hard gate',()=>{
  for (const autoplay of [undefined,false,'true',1,null]){
    const h=stepperHarness(undefined,false,{autoplay}); h.stepper.enterStep(true);
    assert.equal(h.intervals.size,0); assert.equal(h.term.playbackStatus.textContent,'Paused');
    assert.match(h.term.btnPlay.innerHTML,/Play/);
  }
  const h=stepperHarness(undefined,false,{autoplay:true}), s=h.stepper;
  s.enterStep(true); assert.equal(h.intervals.size,1);
  assert.equal(h.term.playbackStatus.textContent,'Playing · 3s / step');
  assert.equal(h.term.bar.attrs['data-playback'],'playing');
  assert.match(h.term.btnPlay.innerHTML,/Pause/);
  h.term.btnNext.fire('click'); assert.equal(s.current().n,1); assert.equal(h.intervals.size,0);
  s.onHide(); s.onShow(); assert.equal(h.intervals.size,0);
  s.enterStep(false); assert.equal(h.intervals.size,0);
  const quiet=stepperHarness(undefined,true,{autoplay:true});
  quiet.stepper.enterStep(true); quiet.term.btnPlay.fire('click');
  assert.equal(quiet.intervals.size,0);
  assert.equal(quiet.term.btnPlay.disabled,true);
  assert.equal(quiet.term.playbackStatus.textContent,'Paused · reduced motion');
  const editor=stepperHarness({autoplay:false},false,{autoplay:true});
  editor.stepper.enterStep(true); assert.equal(editor.intervals.size,0);
});

test('tab re-entry resumes only an already playing sequence, and explicit pause cancels pending resume',()=>{
  const h=stepperHarness();h.stepper.enterStep(true);h.term.btnPlay.fire('click');h.tick();
  h.stepper.onHide();h.stepper.onHide();assert.equal(h.intervals.size,0);
  h.stepper.onShow();assert.equal(h.intervals.size,1);assert.equal(h.stepper.current().n,1);
  h.stepper.onHide();h.stepper.pause();h.stepper.onShow();assert.equal(h.intervals.size,0);
  assert.equal(h.term.playbackStatus.textContent,'Paused');
});

test('leaving the browser pauses at the current step; returning does not silently restart',()=>{
  const h=stepperHarness(undefined,false,{autoplay:true});h.stepper.enterStep(true);h.tick();
  h.visibility(true);assert.equal(h.intervals.size,0);h.term.btnPlay.fire('click');assert.equal(h.intervals.size,0);
  h.visibility(false);assert.equal(h.intervals.size,0);assert.equal(h.stepper.current().n,1);
  h.term.btnPlay.fire('click');assert.equal(h.intervals.size,1);
  h.stepper.destroy();assert.equal(h.visibilityListeners.size,0);
  const ambient=stepperHarness();ambient.stepper.enterAmbient();const paints=ambient.paints.length;
  ambient.visibility(true);ambient.visibility(false);assert.equal(ambient.paints.length,paints);
});

test('single-step stories have an explained disabled Play; ambient mode cannot start hidden playback',()=>{
  const h=stepperHarness(undefined,false,{autoplay:true,steps:[{id:'only',text:'Only'}]});
  h.stepper.enterStep(true);h.stepper.toggleAuto();assert.equal(h.intervals.size,0);
  assert.equal(h.term.btnPlay.disabled,true);assert.equal(h.term.playbackStatus.textContent,'Single step');
  const ambient=stepperHarness();ambient.stepper.toggleAuto();assert.equal(ambient.intervals.size,0);
});

test('presenter Space is an explicit Play command even when automatic step entry is off',()=>{
  const h=stepperHarness(), handlers={}, view=element();
  const doc={body:element(),documentElement:{},createElement:element,addEventListener:(name,fn)=>handlers[name]=fn};
  h.context.wirePresenter({activeStepper:()=>h.stepper},view,{document:doc});
  view.children[0].fire('click');
  let prevented=0;const space=()=>handlers.keydown({key:' ',preventDefault(){prevented++;}});
  space();assert.equal(h.stepper.mode(),'step');assert.equal(h.intervals.size,1);
  assert.equal(h.term.playbackStatus.textContent,'Playing · 3s / step');
  space();assert.equal(h.intervals.size,0);assert.equal(h.term.playbackStatus.textContent,'Paused');
  assert.equal(prevented,2);
});

test('step picks tween like the arrows; restore jumps and the autoplay wrap stay settled',()=>{
  const h=stepperHarness({autoplay:false}), s=h.stepper;
  s.enterStep(false);
  assert.equal(h.paints.at(-1).tween,false,'first paint is settled');
  s.jumpSource(2);
  assert.deepEqual({index:h.paints.at(-1).index,tween:h.paints.at(-1).tween},{index:2,tween:true},
    'a distant step pick animates');
  s.jump(0);
  assert.equal(h.paints.at(-1).tween,false,'the restore/deep-link path stays settled');
  h.term.btnPlay.fire('click');
  h.tick();
  assert.deepEqual({index:h.paints.at(-1).index,tween:h.paints.at(-1).tween},{index:1,tween:true});
  h.tick(); h.tick();
  assert.deepEqual({index:h.paints.at(-1).index,tween:h.paints.at(-1).tween},{index:0,tween:false},
    'the autoplay wrap back to step 0 is a settled jump');
});

test('pause never repaints a focused panel and a queued old tick cannot advance it',()=>{
  const h=stepperHarness({autoplay:false});
  h.stepper.enterStep(false); h.term.btnPlay.fire('click');
  const stale=[...h.intervals.values()][0], before=h.paints.length;
  h.stepper.pause(); stale();
  assert.equal(h.paints.length,before); assert.equal(h.stepper.current().n,0);
  h.term.btnPlay.fire('click'); stale();
  assert.equal(h.stepper.current().n,0); // old generation remains cancelled after a fresh Play
});

test('destroy cancels autoplay, packet delays and caption ghosts, and rejects stale callbacks',()=>{
  const h=stepperHarness(undefined,false,{autoplay:true}); h.stepper.enterStep(true);
  const staleTick=[...h.intervals.values()][0]; h.tick();
  assert.equal(h.stepper.current().n,1); assert.equal(h.timeouts.size,2);
  const staleTimeouts=[...h.timeouts.values()], before=h.paints.length;
  assert.equal(h.term.bar.children.length,2); // live caption + outgoing ghost
  h.stepper.destroy(); h.stepper.destroy();
  assert.equal(h.intervals.size,0); assert.equal(h.timeouts.size,0);
  assert.equal(h.term.bar.children.length,1);
  staleTick(); staleTimeouts.forEach(fn=>fn());
  h.stepper.onShow(); h.stepper.enterStep(true); h.stepper.toggleAuto(); h.stepper.jump(2);
  assert.equal(h.intervals.size,0); assert.equal(h.paints.length,before);
  assert.equal(h.animation.starts,undefined);
});

function previewHarness(){
  const context={}; vm.createContext(context); vm.runInContext(code,context);
  function controller(page, selected=0, mode='step'){
    return {sections:context.workbenchPreviewSections(page).map((section,i)=>{
      let n=selected, currentMode=mode;
      return {number:i+1, stepper:{current:()=>({n}),mode:()=>currentMode,
        enterStep(auto){ assert.equal(auto,false); currentMode='step'; n=0; },
        enterAmbient(){ currentMode='ambient'; }, jump(index){ n=index; }}};
    })};
  }
  function restore(before,after,selected=1,mode='step'){
    const saved=context.workbenchPreviewSnapshot(before,controller(before,selected,mode));
    const next=controller(after,0,'ambient');
    context.restoreWorkbenchPreview(after,next,saved); return next;
  }
  return {context,controller,restore};
}
function pageFixture(){
  return {title:'Checkout',blocks:[{tabs:[{label:'Recovery',sections:[{heading:'Replica read',
    diagram:{view:'step',nodes:{a:{},b:{}},steps:[{id:'start',text:'Start'},
      {id:'read',text:'Read replica'},{id:'end',text:'Return'}],
      panels:[{id:'p',type:'state',initial:{value:'stale'}}]}}]}]}]};
}
const diagramOf=page=>page.blocks[0].tabs[0].sections[0].diagram;

test('preview restores a unique step ID after skin, panel and caption edits or reordering',()=>{
  const h=previewHarness(), before=pageFixture(), after=copy(before), d=diagramOf(after);
  after.skin='daylight'; d.panels[0].initial.value='fresh'; d.steps[1].text='Read the synced replica';
  d.steps.unshift({id:'new',text:'New opening'});
  const source=JSON.stringify(after), ctl=h.restore(before,after);
  assert.equal(ctl.sections[0].stepper.current().n,2);
  assert.equal(ctl.sections[0].stepper.mode(),'step');
  assert.equal(JSON.stringify(after),source);
});

test('steps without IDs require a unique complete match; no positional substitute for removed or duplicate beats',()=>{
  const h=previewHarness(), before=pageFixture();
  diagramOf(before).steps.forEach(s=>delete s.id);
  const after=copy(before); diagramOf(after).steps.unshift({text:'New'});
  assert.equal(h.restore(before,after).sections[0].stepper.current().n,2);
  for(const mutation of [d=>d.steps.splice(1,1), d=>d.steps.push(copy(d.steps[1]))]){
    const changed=copy(before); mutation(diagramOf(changed));
    assert.equal(h.restore(before,changed).sections[0].stepper.mode(),'ambient');
  }
  const duplicate=copy(before); diagramOf(duplicate).steps.push(copy(diagramOf(duplicate).steps[1]));
  assert.equal(h.restore(duplicate,before).sections[0].stepper.mode(),'ambient');
});

test('new documents, changed defaults/topology and ambiguous sections do not inherit a preview position',()=>{
  const h=previewHarness(), before=pageFixture();
  for(const mutation of [p=>p.title='Another page', p=>diagramOf(p).view='ambient',
    p=>diagramOf(p).nodes.c={}, p=>diagramOf(p).steps.push(copy(diagramOf(p).steps[1])),
    p=>p.blocks[0].tabs[0].sections.push(copy(p.blocks[0].tabs[0].sections[0]))]){
    const after=copy(before); mutation(after);
    assert.equal(h.restore(before,after).sections[0].stepper.mode(),'ambient');
  }
  const duplicate=copy(before); diagramOf(duplicate).steps.push(copy(diagramOf(duplicate).steps[1]));
  assert.equal(h.restore(duplicate,before).sections[0].stepper.mode(),'ambient');
});

test('all sections retain independent modes and step positions across tabs and section reorder',()=>{
  const h=previewHarness(), before=pageFixture();
  before.blocks.unshift({heading:'Introduction'});
  before.blocks[1].tabs.push({label:'Success',sections:[{heading:'Response',diagram:{
    view:'step',nodes:{a:{}},steps:[{text:'One'},{text:'Two'}]}}]});
  const old=h.controller(before,1,'step');
  old.sections[1].stepper.enterAmbient();
  const saved=h.context.workbenchPreviewSnapshot(before,old);
  const after=copy(before); after.blocks[1].tabs.reverse();
  const next=h.controller(after,0,'ambient'); h.context.restoreWorkbenchPreview(after,next,saved);
  assert.equal(next.sections[1].stepper.current().n,1);
  assert.equal(next.sections[1].stepper.mode(),'step');
  assert.equal(next.sections[2].stepper.mode(),'ambient');
  const ambient=h.context.workbenchPreviewSnapshot(before,h.controller(before,0,'ambient'));
  h.context.restoreWorkbenchPreview(after,next,ambient);
  assert.equal(next.sections[1].stepper.mode(),'ambient');
  assert.equal(next.sections[2].stepper.mode(),'ambient');
});

test('workbench replacement destroys the old controller before rendering paused and restores active tabs',()=>{
  const h=previewHarness(), page=pageFixture(), prior=h.controller(page,1), calls=[];
  prior.tabBlocks=[{active:()=>1,slugs:['other','recovery']}];
  prior.destroy=()=>calls.push('destroy');
  h.context.renderPage=(view,p,skin,backlinks,options)=>{
    assert.deepEqual(calls,['destroy']); assert.equal(options.autoplay,false);
    const next=h.controller(p,0);
    next.tabBlocks=[{slugs:['other','recovery'], select:i=>calls.push('tab '+i)}];
    return next;
  };
  const next=h.context.renderWorkbenchPreview({},page,'daylight',page,prior);
  assert.deepEqual(calls,['destroy','tab 1']);
  assert.equal(next.sections[0].stepper.current().n,1);
});

test('data flow disclosure stays open across scene edits without writing viewing state to the spec',()=>{
  const h=previewHarness(), before=pageFixture(), old=h.controller(before,1,'step');
  diagramOf(before).primaryPanel='p'; old.sections[0].flowDisclosure={open:true};
  const saved=h.context.workbenchPreviewSnapshot(before,old), after=copy(before);
  diagramOf(after).steps[1].text='Edited scene'; const source=JSON.stringify(after);
  const next=h.controller(after,0,'ambient'); next.sections[0].flowDisclosure={open:false};
  h.context.restoreWorkbenchPreview(after,next,saved);
  assert.equal(next.sections[0].flowDisclosure.open,true); assert.equal(JSON.stringify(after),source);
  after.title='Different story'; next.sections[0].flowDisclosure.open=false;
  h.context.restoreWorkbenchPreview(after,next,saved); assert.equal(next.sections[0].flowDisclosure.open,false);
});

test('switching live focus moves one board, panel and transport without repainting or interrupting playback',()=>{
  const h=stepperHarness({autoplay:false}), c=h.context, section=element(), panel={id:'home',type:'homemap'};
  const layout=c.createBoardGrid(section,true,panel), aside=element(), map=element();
  layout.primaryHost.appendChild(map);layout.grid.appendChild(aside);
  layout.diagramHost.appendChild(h.boardDiv);layout.controlsHost.appendChild(h.term.bar);
  const focus=c.createDiagramFocusControl(layout,panel,aside,h.term.bar,'panel',host=>h.stepper.scrollTargetEl=host);
  h.stepper.enterStep(false);h.stepper.jumpSource(1);h.term.btnPlay.fire('click');
  const paints=h.paints.length,timers=[...h.intervals.keys()],pending=[...h.timeouts.keys()];
  layout.flowDisclosure.open=true;
  const [homeButton,flowButton]=layout.viewChoicesHost.children;
  flowButton.fire('click');
  assert.equal(focus.mode(),'flow');assert.equal(flowButton.attrs['aria-pressed'],'true');
  assert.deepEqual(layout.grid.children,[layout.diagramCol,layout.primaryHost]);
  assert.deepEqual(layout.diagramCol.children,[h.boardDiv,h.term.bar]);
  assert.deepEqual(layout.primaryHost.children,[map,aside]);
  assert.equal(layout.flowDisclosure.hidden,true);
  assert.equal(h.stepper.scrollTargetEl,layout.diagramCol);
  assert.equal(h.stepper.current().id,'second');assert.equal(h.stepper.mode(),'step');
  assert.equal(h.paints.length,paints);assert.deepEqual([...h.intervals.keys()],timers);assert.deepEqual([...h.timeouts.keys()],pending);
  homeButton.fire('click');
  assert.deepEqual(layout.grid.children,[layout.primaryHost,aside]);
  assert.deepEqual(layout.primaryHost.children,[map,h.term.bar]);
  assert.equal(layout.diagramCol.parentNode,layout.flowDisclosure);
  assert.equal(layout.flowDisclosure.open,true,'the optional disclosure remembers its state');
  assert.equal(layout.flowDisclosure.hidden,false);assert.equal(h.stepper.scrollTargetEl,layout.primaryHost);
  h.tick();assert.equal(h.stepper.current().id,'third','the same playback clock keeps advancing');
  focus.destroy();flowButton.fire('click');assert.equal(focus.mode(),'panel');
});

test('live focus works without steps and chooses an explicit centerpiece before the first homemap',()=>{
  const h=stepperHarness(),c=h.context;
  const home={id:'home',type:'homemap'},other={id:'status',type:'state',title:'Status'};
  const d={panels:[other,home]},before=JSON.stringify(d);
  assert.equal(c.diagramFocusPanel(d),home);assert.equal(JSON.stringify(d),before);
  assert.equal(c.diagramFocusPanel({...d,primaryPanel:'status'}),other);
  assert.equal(c.diagramFocusPanel({...d,primaryPanel:'missing'}),home);
  assert.equal(c.diagramFocusPanel({panels:[other]}),null);assert.equal(c.diagramFocusPanel({}),null);
  const layout=c.createBoardGrid(element(),true,home),aside=element();layout.grid.appendChild(aside);
  const focus=c.createDiagramFocusControl(layout,home,aside,null,'flow');
  assert.equal(focus.mode(),'flow');focus.setMode('panel');focus.setMode('invalid');
  assert.equal(focus.mode(),'panel');assert.equal(layout.primaryHost.parentNode,layout.grid);
});

test('live view focus survives edits but authored presentation changes and different panels take precedence',()=>{
  function presentation(panelId,initial){let value=initial;return {panelId,mode:()=>value,setMode:next=>{value=next;}};}
  const h=previewHarness(),before=pageFixture(),old=h.controller(before,1,'step');
  diagramOf(before).primaryPanel='p';old.sections[0].flowDisclosure={open:false};
  old.sections[0].presentation=presentation('p','flow');
  const saved=h.context.workbenchPreviewSnapshot(before,old),after=copy(before);
  diagramOf(after).steps[1].text='Edited while viewing the flow';const source=JSON.stringify(after);
  const next=h.controller(after,0,'ambient');next.sections[0].flowDisclosure={open:false};
  next.sections[0].presentation=presentation('p','panel');h.context.restoreWorkbenchPreview(after,next,saved);
  assert.equal(next.sections[0].presentation.mode(),'flow');assert.equal(next.sections[0].stepper.current().n,1);
  assert.equal(JSON.stringify(after),source);
  next.sections[0].presentation=presentation('different','panel');h.context.restoreWorkbenchPreview(after,next,saved);
  assert.equal(next.sections[0].presentation.mode(),'panel');
  delete diagramOf(after).primaryPanel;next.sections[0].presentation=presentation('p','panel');
  h.context.restoreWorkbenchPreview(after,next,saved);assert.equal(next.sections[0].presentation.mode(),'panel');
});


test('layout diagram visibility survives editor rerenders without writing a spec field',()=>{
  const h=previewHarness(),before=pageFixture(),old=h.controller(before,1,'step');
  old.sections[0].presentation={mode:()=> 'layout',diagramVisible:()=>false};
  const saved=h.context.workbenchPreviewSnapshot(before,old),after=copy(before),source=JSON.stringify(after);
  const next=h.controller(after,0,'ambient');let visible=true;
  next.sections[0].presentation={setMode:()=>{},setDiagramVisible:v=>{visible=v;}};
  h.context.restoreWorkbenchPreview(after,next,saved);assert.equal(visible,false);
  assert.equal(next.sections[0].stepper.current().n,1);assert.equal(JSON.stringify(after),source);
});

test('named layout selection survives a story edit but saved visibility edits take precedence over reader preferences',()=>{
  const h=previewHarness(),before=pageFixture(),old=h.controller(before,1,'step');
  diagramOf(before).layouts=[{id:'home',name:'Home',sectionLayout:{default:[{x:0,y:0,w:8,h:12,hidden:true}]}},{id:'flow',name:'Flow',sectionLayout:{default:[{x:0,y:0,w:8,h:12}]}}];
  old.sections[0].presentation={mode:()=> 'layout',layoutId:()=> 'flow',diagramVisible:()=>true};
  const saved=h.context.workbenchPreviewSnapshot(before,old),after=copy(before),next=h.controller(after,0,'ambient');
  let id='home',visible=false;
  next.sections[0].presentation={layoutId:()=>id,setLayout:v=>{id=v;},setMode:()=>{},setDiagramVisible:v=>{visible=v;}};
  h.context.restoreWorkbenchPreview(after,next,saved);assert.equal(id,'flow');assert.equal(visible,true);
  diagramOf(after).layouts[1].sectionLayout.default[0].hidden=true;visible=false;
  h.context.restoreWorkbenchPreview(after,next,saved);assert.equal(id,'flow');assert.equal(visible,false,'authored visibility wins');
});

test('view steps skip playback stops while keeping full-path indices for state, source editing and links',()=>{
  const h=stepperHarness({autoplay:false}),s=h.stepper;s.enterStep(false);
  s.setVisibleSteps(['first','third']);assert.equal(h.term.stepN.textContent,'STEP 1/2');
  h.term.btnNext.fire('click');assert.equal(s.current().id,'third');assert.equal(s.current().n,2);assert.equal(s.sourceIndex(),2);assert.equal(h.paints.at(-1).index,2);assert.equal(h.term.stepN.textContent,'STEP 2/2');
  h.term.btnPrev.fire('click');assert.equal(s.current().id,'first');
  s.toggleAuto();h.tick();assert.equal(s.current().id,'third');h.tick();assert.equal(s.current().id,'first');
  s.pause();s.setVisibleSteps(['third']);assert.equal(s.current().id,'third');assert.equal(h.term.btnPlay.disabled,true);assert.equal(h.term.stepN.textContent,'STEP 1/1');
  s.setVisibleSteps(null);assert.equal(s.current().id,'third');assert.equal(h.term.stepN.textContent,'STEP 3/3');assert.equal(h.term.btnPlay.disabled,false);
});
test('filtered alternates play only their own selected stops and empty paths cannot be selected',()=>{
  const h=stepperHarness({autoplay:false},false,{steps:[{id:'start',text:'Start'},{id:'middle',text:'Middle'},{id:'done',text:'Done'},{id:'failed',text:'Failed'}],paths:[{id:'happy',steps:['start','middle','done']},{id:'failed',steps:['start','failed']}]});
  const s=h.stepper;s.enterStep(false);s.setVisibleSteps(['start','done','failed']);
  h.term.btnNext.fire('click');assert.equal(s.current().id,'done');assert.equal(h.term.btnNext.disabled,true);
  assert.equal(s.selectPath('failed'),true);assert.equal(s.current().id,'start');h.term.btnNext.fire('click');assert.equal(s.current().id,'failed');assert.equal(s.sourceIndex(),3);
  s.setVisibleSteps(['done']);assert.equal(s.path(),'happy');assert.equal(s.current().id,'done');assert.equal(s.selectPath('failed'),false);
});
test('inspecting a hidden step previews the exact source without changing the view filter',()=>{
  const h=stepperHarness({autoplay:false}),s=h.stepper;s.enterStep(false);s.setVisibleSteps(['first','third']);
  s.jumpSource(1);assert.equal(s.sourceIndex(),1);assert.match(h.term.playbackStatus.textContent,/Previewing a hidden step/);
  s.setVisibleSteps(['first','third']);assert.equal(s.sourceIndex(),2);assert.equal(h.term.stepN.textContent,'STEP 2/2');
});

test('switching to a shorter view at its final stop finishes without replaying the path',()=>{
  const h=stepperHarness({autoplay:false},false,{paths:[{id:'happy',steps:['first','second','third']}]});
  h.stepper.enterStep(false);h.stepper.toggleAuto();h.tick();assert.equal(h.stepper.current().id,'second');
  h.stepper.setVisibleSteps(['first','second']);assert.equal(h.stepper.current().id,'second');assert.equal(h.intervals.size,0);assert.equal(h.term.playbackStatus.textContent,'Finished');
});
