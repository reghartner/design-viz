const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const code = ['validator.js','engine.js','builder.workbench.js'].map(n =>
  fs.readFileSync(path.join(__dirname,'../src',n),'utf8')).join('\n');
const plain = v => JSON.parse(JSON.stringify(v));
function load(extra = {}){ const c = {...extra}; vm.createContext(c); vm.runInContext(code,c); return c; }
function fixture(){ return {view:'step',nodes:{a:{title:'API'},b:{title:'Device'},c:{title:'Audit'}},
  rows:[['a','b','c']],edges:[{from:'a',to:'b'},{from:'a',to:'c'}],steps:[
    {id:'send',edge:'a->b',text:'Delivered'},
    {id:'fail',edges:['a->b','a->c'],failures:{'a->b':'dropped'},
      packets:[{edge:'a->b'},{edge:'a->c'}],text:'Device never receives; audit does'},
    {id:'wait',nodes:['a'],text:'Wait'}]}; }

test('failure-only steps are meaningful; invalid maps, modes and missing edges report their source',()=>{
  const c=load(),d=fixture();d.steps=[{failures:{'a->b':'dropped','a->c':'blocked'},text:'Neither arrives'}];
  assert.deepEqual(plain(c.validate(c.normalize(d))),{errors:[],warnings:[]});
  for (const failures of [[],true,'dropped',{'a->b':'timeout'},{'b->c':'blocked'},JSON.parse('{"__proto__":"dropped"}')]){
    d.steps[0].failures=failures;
    assert.ok(c.validate(c.normalize(d)).errors.some(e=>e.includes('.steps[0].failures')));
  }
});
test('failure precedence removes only failed deliveries without mutating authored steps',()=>{
  const c=load(),d=fixture(),before=JSON.stringify(d),st=d.steps[1];
  assert.deepEqual(plain(c.stepDeliveredKeys(st)),['a->c']);
  assert.deepEqual(plain(c.builderStepHops(st)),['a->b','a->c']);
  assert.equal(c.communicationFailureText(d,c.stepFailures(st)),'Dropped: API → Device');
  assert.equal(JSON.stringify(d),before);
  assert.deepEqual(plain(c.stepDeliveredKeys({edge:'a->b',failures:{'a->b':'unknown'}})),['a->b']);
});

function element(tag='div'){
  const attrs={},classes=new Set(),events={};
  const e={tag,children:[],style:{setProperty(k,v){this[k]=v;}},starts:0,
    classList:{add:k=>classes.add(k),remove:k=>classes.delete(k),contains:k=>classes.has(k)},
    setAttribute(k,v){attrs[k]=String(v);if(k==='class'){classes.clear();String(v).split(/\s+/).forEach(c=>classes.add(c));}},
    getAttribute:k=>attrs[k]??null,
    appendChild(n){this.children.push(n);n.parentNode=this;return n;},
    removeChild(n){this.children.splice(this.children.indexOf(n),1);n.parentNode=null;return n;},
    addEventListener(k,fn){events[k]=fn;},dispatchEvent(){},
    beginElement(){this.starts++;},getBoundingClientRect(){return {left:0,top:0,width:100,height:20};},
    cloneNode:()=>element(tag),
    querySelectorAll(selector){return descendants(this).filter(n=>selector[0]==='.' && n.classList.contains(selector.slice(1)));}};
  Object.defineProperty(e,'firstChild',{get(){return this.children[0];}});return e;
}
function descendants(e){return e.children.flatMap(n=>[n,...descendants(n)]);}
function boardFor(d){
  const svg=element('svg'),edgeIds={},nodeEls={};
  for(const id of Object.keys(d.nodes)) nodeEls[id]=svg.appendChild(element('g'));
  d.edges.forEach((e,idx)=>{
    const pathEl=svg.appendChild(element('path'));
    pathEl.getTotalLength=()=>200;
    pathEl.getPointAtLength=t=>({x:t,y:idx*80});
    edgeIds[e.from+'->'+e.to]={e,idx,domId:'test-e'+idx,pathEl,
      haloEl:svg.appendChild(element('path')),coinEl:svg.appendChild(element('g')),labelEl:svg.appendChild(element('text'))};
  });return {svg,edgeIds,nodeEls};
}
function domCore(){return load({document:{createElementNS:(_,tag)=>element(tag)}});}
test('mixed fan-out focuses the sender and successful receiver, never the failed receiver implicitly',()=>{
  const c=load(),d=fixture(),b=boardFor(d),st=d.steps[1];
  c.applyStepNodeFocus(b.nodeEls,{keys:c.stepDeliveredKeys(st),failures:c.stepFailures(st)},b.edgeIds);
  assert.equal(b.nodeEls.a.classList.contains('lit'),true);
  assert.equal(b.nodeEls.c.classList.contains('lit'),true);
  assert.equal(b.nodeEls.b.classList.contains('lit'),false);
  c.applyStepNodeFocus(b.nodeEls,{nodes:['b']},b.edgeIds);
  assert.equal(b.nodeEls.b.classList.contains('lit'),true,'explicit focus remains available for narration');
});
test('dropped packets stop inside the gap and fade without reaching the destination; static break survives settling',()=>{
  const c=domCore(),b=boardFor(fixture());
  c.showCommunicationFailures(b,{'a->b':'dropped'},true);
  const effect=b.failureEffects[0],nodes=descendants(effect.group);
  assert.equal(effect.group.getAttribute('aria-label'),'Dropped in transit: a → b');
  assert.ok(effect.hidden.every(e=>e.classList.contains('comm-hidden')));
  const motion=nodes.find(n=>n.tag==='animateMotion');
  assert.deepEqual(motion.getAttribute('keyPoints').split(';').map(Number),[0,.55,.55]);
  assert.equal(motion.starts,1);assert.equal(nodes.find(n=>n.tag==='animate').starts,1);
  assert.equal(nodes.find(n=>n.tag==='animate').getAttribute('values'),'1;1;0');
  const before=nodes.find(n=>n.classList.contains('comm-before')).getAttribute('d');
  const after=nodes.find(n=>n.classList.contains('comm-after')).getAttribute('d');
  assert.ok(before.endsWith('L100.00 0.00'));assert.ok(after.startsWith('M120.00 0.00'));
  const markerX=Number(nodes.find(n=>n.classList.contains('comm-break')).getAttribute('transform').match(/translate\((\S+)/)[1]);
  assert.ok(Math.abs(markerX-110)<.001);
  c.settleCommunicationFailures(b);assert.equal(effect.packet.parentNode,null);
  assert.equal(effect.group.parentNode,b.svg);
  c.clearCommunicationFailures(b);assert.equal(effect.group.parentNode,null);
  assert.ok(effect.hidden.every(e=>!e.classList.contains('comm-hidden')));
  assert.equal(effect.label.classList.contains('comm-label'),false);
});
test('blocked and reduced-motion outcomes retain a static marker with no packet; hidden fragments stay hidden',()=>{
  const c=domCore(),b=boardFor(fixture());
  c.showCommunicationFailures(b,{'a->b':'blocked','a->c':'dropped'},false);
  assert.ok(b.failureEffects.every(e=>e.packet===null));
  const marker=descendants(b.failureEffects[0].group).find(e=>e.classList.contains('comm-break'));
  assert.equal(marker.getAttribute('transform'),'translate(24 0)');
  assert.ok(marker.children.some(e=>e.tag==='circle'));
  c.clearCommunicationFailures(b);
  b.edgeIds['a->b'].pathEl.classList.add('dv-fragment-hidden');
  c.showCommunicationFailures(b,{'a->b':'dropped'},true);assert.equal(b.failureEffects.length,0);
  for(const length of [1,5,30,200,2000]){
    for(const mode of ['dropped','blocked']){
      const split=c.communicationBreak(length,mode);
      assert.ok(0<split.before && split.before<split.stop && split.stop<split.after && split.after<length);
    }
  }
});
test('playback suppresses explicit successful packets on failed hops and cleans up on later steps, paths, ambient and disposal',()=>{
  const d=fixture();d.paths=[{id:'happy',steps:['send','wait']},{id:'failed',steps:['fail','wait']}];
  const b=boardFor(d),ams=[element('animateMotion'),element('animateMotion')];
  ams.forEach(am=>b.svg.appendChild(element('circle')).appendChild(am));
  const term={};for(const k of ['bar','chips','stepN','stepText','failureStatus','srcA','lanePill','stepIdEl','btnPrev','btnPlay','btnNext','btnAmb','btnStep']) term[k]=element();
  term.bar.appendChild(element()).appendChild(term.stepN);
  const c=load({CustomEvent:function(){},document:{createElement:()=>element(),createElementNS:(_,tag)=>element(tag),
    getElementById:id=>id==='test-am-0'?ams[0]:id==='test-am-1'?ams[1]:null},
    window:{matchMedia:()=>({matches:true}),setInterval:()=>1,clearInterval(){}},setTimeout:()=>1,clearTimeout(){}});
  c.RM=false;
  const sp=c.attachStepper(element(),element(),term,d,'test',b,{},null,null,{autoplay:false});
  sp.enterStep(false);assert.equal(ams[0].starts,1);
  sp.selectPath('failed',0);assert.equal(ams[0].starts,1);assert.equal(ams[1].starts,1);
  assert.equal(b.failureEffects.length,1);assert.equal(term.failureStatus.textContent,'Dropped: API → Device');
  sp.jump(1);assert.equal(b.failureEffects.length,0);assert.equal(term.failureStatus.hidden,true);
  sp.jump(0);sp.onHide();assert.equal(b.failureEffects[0].packet.parentNode,null);
  sp.selectPath('happy',0);assert.equal(b.failureEffects.length,0);assert.equal(ams[0].starts,2);
  sp.selectPath('failed',0);sp.enterAmbient();assert.equal(b.failureEffects.length,0);
  sp.enterStep(false);sp.jump(0);sp.destroy();assert.equal(b.failureEffects.length,0);
});
test('delivery edits preserve the other fan-out branch and caption; removing a failed hop removes its outcome',()=>{
  const c=load(),d=fixture(),before=JSON.stringify(d);
  let p=c.planStepCommunication(before,d,0,1,'a->b','blocked'),next=JSON.parse(p.text);
  assert.deepEqual(next.steps[1].failures,{'a->b':'blocked'});assert.equal(next.steps[1].edge,'a->c');
  assert.equal(next.steps[1].text,d.steps[1].text);
  p=c.planStepCommunication(p.text,next,0,1,'a->b','delivered');next=JSON.parse(p.text);
  assert.equal(next.steps[1].failures,undefined);assert.deepEqual(next.steps[1].edges,['a->c','a->b']);
  p=c.planStepToggleHop(before,d,0,1,'a->b');next=JSON.parse(p.text);
  assert.equal(next.steps[1].failures,undefined);assert.equal(next.steps[1].edge,'a->c');
  assert.deepEqual(next.steps[1].packets,[{edge:'a->c'}]);
  p=c.planStepCommunication(before,d,0,2,'a->b','dropped');next=JSON.parse(p.text);
  assert.deepEqual(next.steps[2].failures,{'a->b':'dropped'});assert.equal(next.steps[2].edge,undefined);
  assert.ok(c.planStepCommunication(before,d,0,1,'b->c','dropped').error);
  assert.ok(c.planStepCommunication(before,d,0,1,'a->b','unknown').error);
  assert.equal(JSON.stringify(d),before);
});
test('node rename, edge retarget and deletions cascade through failure keys',()=>{
  const c=load(),d=fixture(),text=JSON.stringify(d);
  let next=JSON.parse(c.planRenameNode(text,d,0,'b','device').text);
  assert.deepEqual(next.steps[1].failures,{'a->device':'dropped'});
  next=JSON.parse(c.planSetEdgeEndpoint(text,d,0,0,'from','c').text);
  assert.deepEqual(next.steps[1].failures,{'c->b':'dropped'});
  next=JSON.parse(c.planDeleteEdge(text,d,0,0).text);assert.equal(next.steps[1].failures,undefined);
  next=JSON.parse(c.planDeleteNode(text,d,0,'b').text);assert.equal(next.steps[1].failures,undefined);
});
