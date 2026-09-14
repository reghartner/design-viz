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
  return {attrs, events, style:{}, children:[],
    classList:{add:k=>classes.add(k), remove:k=>classes.delete(k), contains:k=>classes.has(k)},
    appendChild(el){ this.children.push(el); el.parentNode=this; return el; },
    removeChild(el){ this.children=this.children.filter(child=>child!==el); el.parentNode=null; },
    setAttribute(k,v){ attrs[k]=String(v); }, getAttribute:k=>attrs[k] ?? null,
    querySelectorAll(){ return []; }, getBoundingClientRect(){ return {left:0,top:0,width:100,height:20}; },
    cloneNode(){ return element(); },
    addEventListener(k,fn){ (events[k] ||= []).push(fn); },
    fire(k){ for(const fn of events[k] || []) fn({}); }
  };
}
function stepperHarness(options, reducedMotion=false){
  let sequence=0;
  const intervals=new Map(), timeouts=new Map(), ids={}, paints=[];
  const context={document:{createElement:element, getElementById:id=>ids[id] || null},
    window:{matchMedia:()=>({matches:reducedMotion}),
      setInterval(fn){ const id=++sequence; intervals.set(id,fn); return id; },
      clearInterval:id=>intervals.delete(id)},
    setTimeout(fn){ const id=++sequence; timeouts.set(id,fn); return id; },
    clearTimeout:id=>timeouts.delete(id)};
  vm.createContext(context); vm.runInContext(code,context);
  const sec=element(), boardDiv=element(), board={svg:element(),nodeEls:{},edgeIds:{}};
  const term=Object.fromEntries(['bar','chips','stepN','stepText','srcA','lanePill','stepIdEl',
    'btnPrev','btnPlay','btnNext','btnAmb','btnStep'].map(k=>[k,element()]));
  term.bar.appendChild(element()).appendChild(term.stepN);
  const edge='a->b(int)', animation=element(); animation.parentNode=element();
  animation.beginElement=()=>{ animation.starts=(animation.starts || 0)+1; };
  ids['fs0-am-0']=animation;
  board.edgeIds[edge]={idx:0,domId:'edge0',e:{from:'a',to:'b'}};
  ids.edge0=element();
  const diagram={nodes:{a:{},b:{}},steps:[
    {id:'first',text:'First'},
    {id:'second',text:'Second',edges:[edge],packets:[{edge,delay:1}]},
    {id:'third',text:'Third'}]};
  const stepper=context.attachStepper(sec,boardDiv,term,diagram,'fs0',board,{},
    {setStep:(index,tween)=>paints.push({index,tween})},null,options);
  return {context,stepper,term,intervals,timeouts,paints,animation,
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

test('standalone retains autoplay, manual navigation pauses, and reduced motion remains a hard gate',()=>{
  const h=stepperHarness(), s=h.stepper;
  s.enterStep(true); assert.equal(h.intervals.size,1);
  h.term.btnNext.fire('click'); assert.equal(s.current().n,1); assert.equal(h.intervals.size,0);
  s.onHide(); s.onShow(); assert.equal(h.intervals.size,1);
  s.enterStep(false); assert.equal(h.intervals.size,0);
  const quiet=stepperHarness(undefined,true);
  quiet.stepper.enterStep(true); quiet.term.btnPlay.fire('click');
  assert.equal(quiet.intervals.size,0);
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
  const h=stepperHarness(); h.stepper.enterStep(true);
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
