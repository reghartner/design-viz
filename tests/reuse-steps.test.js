const {readSource} = require('../tools/source-loader.cjs');
const test=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'), path=require('node:path'), vm=require('node:vm');
const c={};vm.createContext(c);
for(const name of ['validator','engine','builder.workbench','reuse.workbench'])
  vm.runInContext(readSource(name+'.js'),c);
const plain=x=>JSON.parse(JSON.stringify(x));
function fixture(){return {view:'step',nodes:{hub:{}},rows:[['hub']],panels:[
  {id:'state',type:'state',states:['ready','sent','lost'],initial:{state:'ready'}},
  {id:'log',type:'log'}],steps:[
  {id:'start',text:'Start',nodes:['hub']},
  {id:'send',text:'Send',panels:{state:{state:'sent'}}},
  {id:'record',text:'Record',panels:{log:{log:[{text:'recorded'}]},state:{enterOnce:{note:'once'}}},tone:{hub:'ok'},custom:{keep:[1,2]}},
  {id:'done',text:'Done',nodes:['hub']},
  {id:'lost',text:'Lost',panels:{state:{state:'lost'},log:{log:[{text:'offline'}]}}}
],paths:[{id:'happy',label:'Happy path',steps:['start','send','record','done']},
  {id:'offline',label:'Offline',steps:['start','lost']}]};}
function reuse(d, opts={}, index=4, destination='offline'){
  return c.planReuseSteps(JSON.stringify(d,null,2),d,0,destination,index,
    {sourcePath:'happy',stepIds:['record','done'],mode:'copy',placement:'after',...opts});
}
function check(plan){assert.equal(plan.error,undefined); const d=JSON.parse(plan.text);assert.deepEqual(plain(c.validate(c.normalize(d)).errors),[]);return d;}

test('multi-copy preserves source order, complete authored content and other paths without mutating input',()=>{
  const d=fixture(),before=JSON.stringify(d),plan=reuse(d,{stepIds:['done','record']}),next=check(plan);
  assert.equal(JSON.stringify(d),before);
  assert.deepEqual(next.paths[0],d.paths[0]);assert.deepEqual(next.steps.slice(0,5),d.steps);
  assert.deepEqual(next.paths[1].steps,['start','lost','record-copy1','done-copy1']);
  assert.deepEqual({...next.steps[5],id:'record'},d.steps[2]);
  assert.equal(plan.index,5);assert.equal(plan.position,2);assert.equal(plan.pathId,'offline');
  assert.deepEqual(JSON.parse(plan.text.slice(plan.start,plan.end)),next.steps[5]);
});
test('copy names are unique across the registry, including unused bodies and unusual IDs',()=>{
  const d=fixture();d.steps.push({id:'record-copy1',text:'Unused'});
  let plan=reuse(d),next=check(plan);assert.equal(next.steps[6].id,'record-copy2');
  d.steps[2].id='__proto__';d.paths[0].steps[2]='__proto__';
  next=check(reuse(d,{stepIds:['__proto__']}));assert.equal(next.steps[6].id,'__proto__-copy1');
});
test('replacement swaps only one occurrence, keeping removed bodies and the source path intact',()=>{
  const d=fixture(),plan=reuse(d,{placement:'replace'}),next=check(plan);
  assert.deepEqual(next.paths[1].steps,['start','record-copy1','done-copy1']);
  assert.deepEqual(next.steps[4],d.steps[4]);assert.deepEqual(next.paths[0],d.paths[0]);
  assert.equal(plan.position,1);
});
test('continuation replaces only the destination suffix and can reuse references from that removed suffix',()=>{
  const d=fixture();d.paths[1].steps.push('done','record');
  const plan=reuse(d,{placement:'rest',mode:'share'}),next=check(plan);
  assert.deepEqual(next.paths[1].steps,['start','lost','record','done']);
  assert.deepEqual(next.steps,d.steps);assert.deepEqual(next.paths[0],d.paths[0]);
  assert.equal(plan.index,2);assert.equal(plan.position,2);
});
test('shared insertion links the original bodies and refuses duplicates in the retained path',()=>{
  const d=fixture(),next=check(reuse(d,{mode:'share'}));
  assert.deepEqual(next.steps,d.steps);assert.deepEqual(next.paths[1].steps,['start','lost','record','done']);
  next.steps[2].text='Shared edit';
  assert.equal(c.diagramForPath(next,'offline').steps[2].text,'Shared edit');
  assert.equal(c.diagramForPath(next,'happy').steps[2].text,'Shared edit');
  assert.match(reuse(d,{mode:'share',stepIds:['start']}).error,/Already used/);
  assert.match(reuse(d,{mode:'share',stepIds:['start'],placement:'replace'},0).error,/already in that position/);
});
test('same-path copies repeat operations under fresh IDs without silently moving the original',()=>{
  const d=fixture(),next=check(reuse(d,{sourcePath:'offline',stepIds:['lost']},4));
  assert.deepEqual(next.paths[1].steps,['start','lost','lost-copy1']);
  assert.equal(c.foldPanelStates(c.diagramForPath(next,'offline')).log[2].log.length,2);
});
test('making a shared step independent replaces its reference in place and keeps every path state',()=>{
  const d=fixture(),plan=c.planPathOccurrenceEdit(JSON.stringify(d),d,0,'offline',0,'independent'),next=check(plan);
  assert.deepEqual(next.paths[1].steps,['start-copy1','lost']);assert.deepEqual(next.paths[0],d.paths[0]);
  assert.equal(plan.index,5);assert.equal(plan.position,0);assert.deepEqual(next.steps.slice(0,5),d.steps);
  for(const p of d.paths)assert.deepEqual(plain(c.foldPanelStates(c.diagramForPath(next,p.id))),plain(c.foldPanelStates(c.diagramForPath(d,p.id))));
  next.steps[5].text='Local caption';assert.equal(next.steps[0].text,'Start');
  assert.match(c.planPathOccurrenceEdit(JSON.stringify(d),d,0,'offline',4,'independent').error,/already independent/);
});
test('removing an occurrence leaves registry bodies and other paths alone and selects a remaining neighbor',()=>{
  const d=fixture(),text=JSON.stringify(d);
  let plan=c.planPathOccurrenceEdit(text,d,0,'offline',0,'remove'),next=check(plan);
  assert.deepEqual(next.paths[1].steps,['lost']);assert.deepEqual(next.steps,d.steps);assert.deepEqual(next.paths[0],d.paths[0]);
  assert.equal(plan.index,4);assert.equal(plan.position,0);
  assert.match(c.planPathOccurrenceEdit(plan.text,next,0,'offline',4,'remove').error,/at least one/);
  plan=c.planPathOccurrenceEdit(text,d,0,'offline',4,'remove');next=check(plan);
  assert.equal(plan.index,0);assert.deepEqual(next.paths[1].steps,['start']);
});
test('preview folds the destination history, including inherited values, repeated logs and transient expiry',()=>{
  const d=fixture(),plan=reuse(d),next=check(plan),preview=c.builderReusePreview(next,0,'offline');
  assert.equal(preview.error,undefined);
  assert.equal(preview.states.state[2].state,'lost');
  assert.equal(c.foldPanelStates(c.diagramForPath(d,'happy')).state[2].state,'sent');
  assert.equal(preview.states.state[2].note,'once');assert.equal(preview.states.state[3].note,undefined);
  assert.deepEqual(plain(preview.states.log[3].log),[{text:'offline'},{text:'recorded'}]);
  assert.deepEqual(plain(preview.states),plain(c.foldPanelStates(c.diagramForPath(next,'offline'))));
  assert.match(c.builderReusePreview(next,0,'missing').error,/no longer exists/);
});
test('planners reject invalid modes, stale references, empty selections and malformed paths without an edit',()=>{
  const d=fixture();
  for(const options of [{mode:'move'},{placement:'before'},{sourcePath:'missing'},{stepIds:[]},{stepIds:['missing']},{stepIds:['send','send']},{stepIds:['lost']}])
    assert.ok(reuse(d,options).error,JSON.stringify(options));
  for(const index of [-1,1.5,'4',99,1]) assert.ok(reuse(d,{},index).error,String(index));
  assert.ok(reuse(d,{},4,'missing').error);delete d.paths;assert.ok(reuse(d).error);
  d.paths=[{id:'oops',steps:['missing']}];assert.ok(reuse(d).error);
});
test('nested sections preserve unrelated source text and every other diagram',()=>{
  const d=fixture(),raw={page:{title:'Keep',blocks:[{heading:'Intro',text:'Spacing matters'},
    {tabs:[{label:'Hidden',sections:[{heading:'Target',diagram:d},{heading:'Other',diagram:fixture()}]}]}]}};
  const text=JSON.stringify(raw,null,3),pathToD=['page','blocks',1,'tabs',0,'sections',0,'diagram'];
  const loc=c.jsonLocate(text,pathToD),plan=c.planReuseSteps(text,raw,1,'offline',4,
    {sourcePath:'happy',stepIds:['done'],mode:'copy',placement:'after'});
  assert.equal(plan.error,undefined);const afterLoc=c.jsonLocate(plan.text,pathToD);
  assert.equal(plan.text.slice(0,afterLoc.start),text.slice(0,loc.start));assert.equal(plan.text.slice(afterLoc.end),text.slice(loc.end));
  assert.deepEqual(JSON.parse(plan.text).page.blocks[1].tabs[0].sections[1].diagram,d);
});

function pickerHarness(diagram=fixture(),index=4){
  const elements={},doc={activeElement:null},history=[],painted=[];
  function node(tag='div'){
    const handlers={},attrs={},n={tagName:tag.toUpperCase(),children:[],value:'',textContent:'',disabled:false,hidden:false,open:false,
      appendChild(child){this.children.push(child);return child;},
      addEventListener(type,fn){(handlers[type]||=[]).push(fn);},
      setAttribute(k,v){attrs[k]=v;},getAttribute(k){return attrs[k];},
      focus(){doc.activeElement=this;},showModal(){this.open=true;},close(){this.open=false;},
      fire(type,extra={}){const ev={preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;},...extra};for(const fn of handlers[type]||[])fn(ev);return ev;}};
    Object.defineProperty(n,'innerHTML',{set(){this.children=[];}});return n;
  }
  for(const id of ['source','mode','placement','list','search','feedback','apply','preview','beat','panel','panel-body','state','selection',
    'mode-note','result','page','previous','next','paging','cancel','clear','destination']) elements['reuse-'+id]=node();
  elements['step-reuse']=node('dialog');const src=node('textarea');src.value=JSON.stringify(diagram,null,2);
  doc.activeElement=node('button');const opener=doc.activeElement;
  doc.getElementById=id=>elements[id];doc.createElement=node;
  const ctx={document:doc};vm.createContext(ctx);
  for(const name of ['validator','engine','builder.workbench','reuse.workbench'])vm.runInContext(readSource(name+'.js'),ctx);
  ctx.renderPanelBody=(host,p,value)=>painted.push({id:p.id,value:plain(value)});
  let locked=false,rendered=src.value;
  const ui=ctx.initWorkbenchStepReuse({src,context(){
    if(locked||src.value!==rendered)return null;
    const raw=JSON.parse(src.value),destination=raw.paths[1];
    return {text:src.value,raw,diagram:raw,section:0,pathId:destination.id,label:destination.label||destination.id,
      index,position:destination.steps.indexOf(raw.steps[index].id),destination};
  },apply(plan){history.push(src.value);src.value=plan.text;rendered=src.value;return true;}});
  const e=Object.fromEntries(Object.entries(elements).map(([id,v])=>[id.replace('reuse-',''),v]));
  return {e,ui,src,history,painted,doc,opener,
    check(i,shift=false){const box=e.list.children[i].children[0].children[0];box.checked=!box.checked;box.fire('click',{shiftKey:shift});},
    lock(){locked=true;},undo(){src.value=history.pop();rendered=src.value;}};
}

test('picker previews the destination, commits one undoable change and resets to independent copies on reopening',()=>{
  const h=pickerHarness(),e=h.e,original=h.src.value;h.ui.open();
  assert.equal(e['step-reuse'].open,true);assert.equal(e.mode.value,'copy');assert.equal(e.apply.disabled,true);
  h.check(2);assert.equal(e.apply.disabled,false);assert.equal(e.beat.children.length,3);
  assert.equal(h.painted.at(-1).value.state,'lost','preview retains destination history');
  assert.equal(h.history.length,0);e.apply.fire('click');
  assert.equal(h.history.length,1);assert.equal(e['step-reuse'].open,false);assert.equal(h.doc.activeElement,h.opener);
  assert.deepEqual(JSON.parse(h.src.value).paths[1].steps,['start','lost','record-copy1']);
  e.apply.fire('click');assert.equal(h.history.length,1,'a second activation cannot reapply the cached plan');
  h.undo();assert.equal(h.src.value,original);h.ui.open();assert.equal(e.mode.value,'copy');assert.equal(e.apply.disabled,true);
});
test('picker invalidates cached plans after raw edits, selection locks and source input events',()=>{
  for(const reason of ['edit','lock','input']){
    const h=pickerHarness(),e=h.e;h.ui.open();h.check(2);
    if(reason==='lock')h.lock();else h.src.value+=' ';
    if(reason==='input')h.src.fire('input');else h.ui.refresh();
    const text=h.src.value;assert.equal(e.apply.disabled,true);assert.equal(e.preview.hidden,true);
    e.apply.fire('click');assert.equal(h.src.value,text);assert.equal(h.history.length,0);
  }
});
test('picker cancel restores focus without an edit and keeps background shortcuts out',()=>{
  const h=pickerHarness(),e=h.e;h.ui.open();h.check(1);
  assert.equal(e['step-reuse'].fire('keydown',{key:'Delete'}).stopped,true);
  assert.equal(e['step-reuse'].fire('cancel').prevented,true);
  assert.equal(e['step-reuse'].open,false);assert.equal(h.history.length,0);assert.equal(h.doc.activeElement,h.opener);
});
test('filtered range selection follows matches while Continue includes the full source ending',()=>{
  const h=pickerHarness(),e=h.e;h.ui.open();e.search.value='d';e.search.fire('input');
  // Send, Record, Done: source-order matches only, excluding Start.
  assert.equal(e.list.children.length,3);h.check(0);h.check(2,true);
  assert.equal(e.selection.textContent,'3 selected');
  e.clear.fire('click');e.search.value='record';e.search.fire('input');
  e.list.children[0].children[1].fire('click');
  assert.equal(e.selection.textContent,'2 selected');assert.equal(e.placement.value,'rest');
  e.apply.fire('click');assert.deepEqual(JSON.parse(h.src.value).paths[1].steps,['start','lost','record-copy1','done-copy1']);
});
test('large source paths use bounded pages and retain selection across pages',()=>{
  const d=fixture();d.steps=Array.from({length:250},(_,i)=>({id:'s'+i,text:'Beat '+i})).concat({id:'lost',text:'Lost'});
  d.paths[0].steps=d.steps.slice(0,250).map(s=>s.id);d.paths[1].steps=['lost'];
  const h=pickerHarness(d,250),e=h.e;h.ui.open();assert.equal(e.list.children.length,100);
  h.check(0);e.next.fire('click');assert.equal(e.list.children.length,100);h.check(0,true);
  assert.equal(e.selection.textContent,'101 selected');e.apply.fire('click');
  const next=JSON.parse(h.src.value);assert.equal(next.paths[1].steps.length,102);
  assert.equal(next.paths[1].steps[1],'s0-copy1');assert.equal(next.paths[1].steps.at(-1),'s100-copy1');
});

test('making a shared step independent carries view membership, and path removal cannot strand a view',()=>{
  const d=fixture();d.layouts=[{id:'brief',name:'Brief',steps:['start'],sectionLayout:{default:[{x:0,y:0,w:12,h:12}]}}];
  const independent=c.planPathOccurrenceEdit(JSON.stringify(d),d,0,'offline',0,'independent');const next=check(independent);
  assert.deepEqual(next.layouts[0].steps,['start',next.paths[1].steps[0]]);
  d.layouts[0].steps=['lost'];
  assert.match(c.planPathStepEdit(JSON.stringify(d),d,0,'offline',4,'remove').error,/view/);
  assert.match(c.planPathOccurrenceEdit(JSON.stringify(d),d,0,'offline',4,'remove').error,/view/);
});
