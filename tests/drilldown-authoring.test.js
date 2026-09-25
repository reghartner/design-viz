'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readSource}=require('../tools/source-loader.cjs');
const B=require('./workbench-command-context.cjs')(['graph','document','narrative','layout']);
vm.runInContext(readSource('workbench/session.js'),B);
const plain=value=>JSON.parse(JSON.stringify(value));
function fixture(){
  return {page:{title:'Domain map',blocks:[
    {id:'overview',heading:'Overview',diagram:{nodes:{client:{title:'Client'},domain:{title:'Orders'},other:{title:'External',detail:{spec:'approved',section:'inside',mode:'link'}}},
      rows:[['client','domain','other']],edges:[{from:'client',to:'domain'}],steps:[{id:'request',text:'Order',edge:'client->domain'},{id:'done',text:'Done'}]}},
    {tabs:[{label:'Details',sections:[{id:'inside',heading:'Order internals',detailOnly:true,
      diagram:{nodes:{entry:{title:'Entry'},exit:{title:'Exit'}},rows:[['entry','exit']],edges:[{from:'entry',to:'exit'}],
        steps:[{id:'accept',text:'Accept',nodes:['entry']},{id:'finish',text:'Finish',nodes:['exit']}],
        paths:[{id:'happy',label:'Happy',color:'#38bdf8',steps:['accept','finish']},{id:'alternate',label:'Alternate',color:'#fb923c',steps:['accept']}]}}]},
      {label:'Notes',sections:[{heading:'Notes',text:'Preserve this section.'}]}]}
  ]}};
}
const parent=raw=>raw.page.blocks[0].diagram;
const child=raw=>raw.page.blocks[1].tabs[0].sections[0].diagram;
function detail(){return {section:'inside',mode:'focus',path:'happy',step:'accept',ports:{in:'entry',out:'exit'},stepMap:{request:{step:'accept',path:'happy'},done:{step:'finish'}}};}
function linked(){const raw=fixture();parent(raw).nodes.domain.detail=detail();return raw;}
function run(name,raw,...args){const before=JSON.stringify(raw),plan=B[name](JSON.stringify(raw,null,2),raw,...args);assert.equal(plan.error,undefined);assert.equal(JSON.stringify(raw),before,'planner must not mutate input');return {plan,raw:JSON.parse(plan.text)};}
function validDetails(raw){const errors=[];B.validateDetails(B.normalize(raw),errors,[]);assert.deepEqual(errors,[]);}
function sessionFor(initial){let text=initial,renders=0;const session=B.createBuilderSession({source:{read:()=>text,write:v=>text=v},render(){renders++;},persistence:{read:()=>({}),save(){}}});return {session,get text(){return text;},get renders(){return renders;}};}

test('handoff assignment and removal preserve source documentation and unrelated bytes as single Undo/Redo actions',()=>{
  const raw=fixture();parent(raw).nodes.domain.link='https://example.com/source';parent(raw).nodes.domain.codeRefs=[{file:'orders.ts',line:8}];
  const text=' \n'+JSON.stringify(raw,null,3).replace('Domain map','Domain \\u006dap')+'\n ';
  const value={spec:'orders-flow',revision:'abc123',section:'process',url:'https://example.com/orders#process'},before=JSON.stringify(raw),given=JSON.stringify(value);
  const plan=B.planSetNodeHandoff(text,raw,0,'domain',value);assert.equal(plan.error,undefined);
  assert.equal(JSON.stringify(raw),before);assert.equal(JSON.stringify(value),given);
  const next=JSON.parse(plan.text),node=parent(next).nodes.domain;
  assert.deepEqual(node,{...parent(raw).nodes.domain,handoff:value});
  assert.ok(plan.text.startsWith(' \n'));assert.ok(plan.text.endsWith('\n '));assert.match(plan.text,/Domain \\u006dap/);
  for(const path of [['page','blocks',1],['page','blocks',0,'diagram','nodes','other'],['page','blocks',0,'diagram','nodes','domain','link']]){
    const a=B.jsonLocate(text,path),b=B.jsonLocate(plan.text,path);assert.equal(text.slice(a.start,a.end),plan.text.slice(b.start,b.end));
  }
  const h=sessionFor(text);assert.equal(h.session.accept(plan),true);assert.equal(h.renders,1);
  assert.equal(h.session.undo(),true);assert.equal(h.text,text);assert.equal(h.session.canUndo(),false);
  assert.equal(h.session.redo(),true);assert.equal(h.text,plan.text);
  const removed=B.planSetNodeHandoff(plan.text,next,0,'domain',null);assert.equal(removed.error,undefined);
  assert.deepEqual(parent(JSON.parse(removed.text)).nodes.domain,parent(raw).nodes.domain);
  assert.equal(h.session.accept(removed),true);assert.equal(h.session.undo(),true);assert.equal(h.text,plan.text);
  assert.equal(h.session.redo(),true);assert.equal(h.text,removed.text);
});

test('handoff authoring accepts URL-only or spec-only destinations and rejects invalid drafts atomically',()=>{
  for(const value of [{url:'https://example.com/orders'},{spec:'orders-flow'},{spec:'orders-flow',revision:'v2',section:'process'}]){
    const next=run('planSetNodeHandoff',fixture(),0,'domain',value).raw;
    assert.deepEqual(parent(next).nodes.domain.handoff,value);
  }
  const raw=fixture(),text=JSON.stringify(raw),h=sessionFor(text);
  for(const value of [{},[],true,{spec:''},{spec:' '},{spec:123},{revision:'v2'},{section:'process'},
    {url:'https://example.com/orders',revision:'v2'},{url:'https://example.com/orders',section:'process'},
    {url:'/orders'},{url:'//example.com/orders'},{url:'javascript:alert(1)'},{url:'https://user:pass@example.com/orders'},
    {spec:'orders-flow',revision:''},{spec:'orders-flow',section:''}]){
    const plan=B.planSetNodeHandoff(text,raw,0,'domain',value);assert.ok(plan.error,JSON.stringify(value));assert.equal(plan.text,undefined);
    assert.equal(h.session.accept(plan),false);assert.equal(h.text,text);assert.equal(h.session.canUndo(),false);
  }
  assert.equal(JSON.stringify(raw),text);assert.equal(h.renders,0);
  assert.match(B.planSetNodeHandoff(text,raw,0,'missing',{spec:'orders-flow'}).error,/node not found/);
});

test('handoffs and domain details require explicit removal before replacement in either direction',()=>{
  const raw=linked(),text=JSON.stringify(raw),value={spec:'orders-flow'};
  const conflict=B.planSetNodeHandoff(text,raw,0,'domain',value);assert.match(conflict.error,/Remove.*domain detail/);assert.equal(conflict.text,undefined);
  const withoutDetail=run('planSetNodeDetail',raw,0,'domain',null).raw;
  const assigned=run('planSetNodeHandoff',withoutDetail,0,'domain',value);
  for(const plan of [B.planSetNodeDetail(assigned.plan.text,assigned.raw,0,'domain',detail()),B.planCreateNodeDetail(assigned.plan.text,assigned.raw,0,'domain')]){
    assert.match(plan.error,/Remove.*diagram handoff/);assert.equal(plan.text,undefined);
  }
  const removed=run('planSetNodeHandoff',assigned.raw,0,'domain',null).raw;
  assert.equal(run('planCreateNodeDetail',removed,0,'domain').raw.page.blocks.at(-1).id,'domain-detail');
  assert.equal(JSON.stringify(raw),text);
});

test('creating a detail flow preserves exact unrelated source and is one Undo/Redo action',()=>{
  const raw=fixture(),text=' \n'+JSON.stringify(raw,null,3).replace('Domain map','Domain \\u006dap')+'\n ';
  const plan=B.planCreateNodeDetail(text,JSON.parse(text),0,'domain');assert.equal(plan.error,undefined);
  const next=JSON.parse(plan.text),section=next.page.blocks.at(-1);
  assert.equal(plan.index,3);assert.equal(section.id,'domain-detail');assert.equal(section.detailOnly,true);
  assert.equal(Object.keys(section.diagram.nodes).length,1);
  assert.deepEqual(parent(next).nodes.domain.detail,{section:'domain-detail',mode:'focus'});
  assert.equal(JSON.parse(plan.text.slice(plan.start,plan.end)).id,section.id);
  assert.ok(plan.text.startsWith(' \n'));assert.ok(plan.text.endsWith('\n '));assert.match(plan.text,/Domain \\u006dap/);
  const oldOther=B.jsonLocate(text,['page','blocks',1]),newOther=B.jsonLocate(plan.text,['page','blocks',1]);
  assert.equal(text.slice(oldOther.start,oldOther.end),plan.text.slice(newOther.start,newOther.end));
  validDetails(next);
  const h=sessionFor(text);assert.equal(h.session.accept(plan),true);assert.equal(h.renders,1);
  assert.equal(h.session.undo(),true);assert.equal(h.text,text);assert.equal(h.session.canUndo(),false);
  assert.equal(h.session.redo(),true);assert.equal(h.text,plan.text);
});

test('detail creation chooses a unique stable ID across all tabs and rejects incomplete targets atomically',()=>{
  const raw=fixture();raw.page.blocks[1].tabs[1].sections[0].id='domain-detail';
  const result=run('planCreateNodeDetail',raw,0,'domain');assert.equal(result.plan.sectionId,'domain-detail-1');
  for(const plan of [B.planCreateNodeDetail(result.plan.text,result.raw,0,'domain'),B.planCreateNodeDetail('{}',{},0,'gone'),
    B.planCreateNodeDetail(JSON.stringify(parent(raw)),parent(raw),0,'domain')]){
    assert.ok(plan.error);assert.equal(plan.text,undefined);
  }
});

test('local picker plan saves ports and step mapping together and canonicalizes numeric references',()=>{
  const raw=fixture(),value=detail();value.section='2';
  const next=run('planSetNodeDetail',raw,0,'domain',value).raw;
  assert.deepEqual(parent(next).nodes.domain.detail,detail());assert.equal(value.section,'2');validDetails(next);
  assert.equal(run('planSetNodeDetail',next,0,'domain',null).raw.page.blocks[0].diagram.nodes.domain.detail,undefined);
});

test('detail assignment rejects invalid child refs, boundary ports, mappings and unsafe external URLs without partial text',()=>{
  const raw=fixture(),text=JSON.stringify(raw);
  const bad=[{section:'gone',mode:'focus'},{...detail(),ports:{in:'gone'}},{...detail(),stepMap:{missing:{step:'accept'}}},
    {...detail(),stepMap:{request:{step:'gone'}}},{...detail(),stepMap:[]},{...detail(),mode:'expand'},
    {url:'javascript:alert(1)',mode:'link'},{spec:'approved',mode:'link'},{url:'https://example.com',mode:'expand'}];
  for(const value of bad){const plan=B.planSetNodeDetail(text,raw,0,'domain',value);assert.ok(plan.error,JSON.stringify(value));assert.equal(plan.text,undefined);}
  assert.equal(JSON.stringify(raw),text);
});

test('approved spec and standalone URL details preserve external identities',()=>{
  const external={spec:'service-spec',revision:'abc123',section:'inside',url:'https://example.com/flow',mode:'link'};
  const first=run('planSetNodeDetail',fixture(),0,'domain',external);assert.deepEqual(parent(first.raw).nodes.domain.detail,external);
  const next=run('planSetNodeDetail',first.raw,0,'domain',{url:'https://example.com/flow#d=inside',mode:'link'});
  assert.deepEqual(parent(next.raw).nodes.domain.detail,{url:'https://example.com/flow#d=inside',mode:'link'});validDetails(next.raw);
});
test('local link authoring canonicalizes to focus without mutating its input',()=>{
  const value={section:'inside',mode:'link'};
  const next=run('planSetNodeDetail',fixture(),0,'domain',value).raw;
  assert.deepEqual(parent(next).nodes.domain.detail,{section:'inside',mode:'focus'});
  assert.equal(value.mode,'link');validDetails(next);
});

test('node rename and deletion maintain legacy incoming port references',()=>{
  const raw=linked(),renamed=run('planRenameNode',raw,1,'entry','inbox').raw;
  assert.equal(parent(renamed).nodes.domain.detail.ports.in,'inbox');validDetails(renamed);
  const removed=run('planDeleteNode',renamed,1,'inbox').raw;
  assert.equal(parent(removed).nodes.domain.detail.ports.in,undefined);assert.equal(parent(removed).nodes.domain.detail.mode,'focus');
  assert.equal(parent(removed).nodes.domain.detail.ports.out,'exit');assert.deepEqual(parent(removed).nodes.other.detail,parent(raw).nodes.other.detail);validDetails(removed);
});

test('step rename cascades path bodies, views, parent map keys and child targets',()=>{
  const raw=linked();child(raw).layouts=[{id:'view',steps:['accept']}];
  let next=run('planRenameStep',raw,1,0,'receive').raw;
  assert.equal(parent(next).nodes.domain.detail.step,'receive');assert.equal(parent(next).nodes.domain.detail.stepMap.request.step,'receive');
  assert.deepEqual(child(next).paths[0].steps,['receive','finish']);assert.deepEqual(child(next).layouts[0].steps,['receive']);
  next=run('planRenameStep',next,0,0,'submit').raw;
  assert.equal(parent(next).nodes.domain.detail.stepMap.request,undefined);assert.equal(parent(next).nodes.domain.detail.stepMap.submit.step,'receive');validDetails(next);
});

test('step deletion removes parent mapping keys or child targets in the same edit',()=>{
  const raw=linked();delete child(raw).paths;
  const gone=run('planDeleteStep',raw,1,0).raw;
  assert.equal(parent(gone).nodes.domain.detail.step,undefined);assert.equal(parent(gone).nodes.domain.detail.stepMap.request,undefined);
  assert.equal(parent(gone).nodes.domain.detail.stepMap.done.step,'finish');validDetails(gone);
  const parentGone=run('planDeleteStep',gone,0,1).raw;assert.equal(parent(parentGone).nodes.domain.detail.stepMap,undefined);validDetails(parentGone);
});

test('path removal clears only the child positions that depended on that path',()=>{
  const raw=linked();parent(raw).nodes.domain.detail.path='alternate';parent(raw).nodes.domain.detail.stepMap={request:{step:'accept',path:'alternate'},done:{step:'finish',path:'happy'}};
  const next=run('planPathStepEdit',raw,1,'alternate',0,'remove').raw;
  assert.equal(parent(next).nodes.domain.detail.path,undefined);assert.equal(parent(next).nodes.domain.detail.step,undefined);
  assert.deepEqual(parent(next).nodes.domain.detail.stepMap,{done:{step:'finish',path:'happy'}});validDetails(next);
});

test('section identity changes retarget local references while leaving approved spec references intact',()=>{
  let raw=linked();const external=plain(parent(raw).nodes.other.detail);
  raw=run('planSetSectionIdentity',raw,1,'id','order.internals').raw;
  assert.equal(parent(raw).nodes.domain.detail.section,'order.internals');assert.deepEqual(parent(raw).nodes.other.detail,external);
  raw=run('planSetSectionIdentity',raw,1,'id',null).raw;assert.equal(parent(raw).nodes.domain.detail.section,'order-internals');
  raw=run('planSetSectionIdentity',raw,1,'heading','Order processing').raw;assert.equal(parent(raw).nodes.domain.detail.section,'order-processing');validDetails(raw);
  for(const id of ['overview','123','bad id','_private']){const plan=B.planSetSectionIdentity(JSON.stringify(raw),raw,1,'id',id);assert.ok(plan.error);assert.equal(plan.text,undefined);}
});

test('legacy heading aliases resolve in assignment and incoming reference cascades',()=>{
  const raw=linked();parent(raw).nodes.domain.detail.section='order-internals';
  const renamed=run('planRenameNode',raw,1,'entry','inbox').raw;
  assert.equal(parent(renamed).nodes.domain.detail.ports.in,'inbox');
  const canonical=run('planSetNodeDetail',raw,0,'domain',parent(raw).nodes.domain.detail).raw;
  assert.equal(parent(canonical).nodes.domain.detail.section,'inside');validDetails(canonical);
});

test('section heading changes reject alias collisions atomically even when the section has a stable ID',()=>{
  const raw=linked();raw.page.blocks[0].id='foo';raw.page.blocks[0].heading='Alpha';
  const section=raw.page.blocks[1].tabs[0].sections[0];section.id='bar';section.heading='Beta';parent(raw).nodes.domain.detail.section='bar';
  validDetails(raw);
  const text=JSON.stringify(raw,null,3),h=sessionFor(text),plan=B.planSetSectionIdentity(text,raw,0,'heading','Bar');
  assert.match(plan.error,/conflicts with a legacy heading reference bar/);assert.equal(plan.text,undefined);
  assert.equal(JSON.stringify(raw,null,3),text,'rejection must not mutate the parsed source');
  assert.equal(h.session.accept(plan),false);assert.equal(h.text,text);assert.equal(h.renders,0);assert.equal(h.session.canUndo(),false);
});

test('section and tab deletion prune incoming details and preserve surviving numeric destinations',()=>{
  const raw=linked();delete raw.page.blocks[1].tabs[0].sections[0].id;delete raw.page.blocks[1].tabs[0].sections[0].heading;
  parent(raw).nodes.domain.detail.section='2';parent(raw).nodes.client.detail={section:'3',mode:'link'};
  raw.page.blocks[1].tabs[1].sections[0]={diagram:{nodes:{n:{title:'N'}},rows:[['n']]}};
  for(const [name,args] of [['planDeleteSection',[1]],['planDeleteTab',[1,0]]]){
    const next=run(name,raw,...args).raw;
    assert.equal(parent(next).nodes.domain.detail,undefined);assert.equal(parent(next).nodes.client.detail.section,'2');validDetails(next);
  }
});

test('duplicate section assigns a fresh stable ID; moves retain each numeric target through tabs',()=>{
  const raw=linked(),copy=run('planDuplicateSection',raw,1).raw;
  assert.equal(copy.page.blocks[1].tabs[0].sections[1].id,'inside-copy1');assert.equal(parent(copy).nodes.domain.detail.section,'inside');validDetails(copy);
  delete raw.page.blocks[1].tabs[0].sections[0].id;delete raw.page.blocks[1].tabs[0].sections[0].heading;
  parent(raw).nodes.domain.detail.section='2';
  const moved=run('planMoveSection',raw,0,1).raw;
  assert.equal(moved.page.blocks[1].diagram.nodes.domain.detail.section,'1');validDetails(moved);
  const tab=run('planMoveTab',raw,1,0,1).raw;
  assert.equal(parent(tab).nodes.domain.detail.section,'3');validDetails(tab);
  const added=run('planAddTab',raw,1,0).raw;
  assert.equal(parent(added).nodes.domain.detail.section,'2');validDetails(added);
});

/* The inspector and interaction owners receive a tiny injected DOM. This
   exercises actual form events/session publication without loading a viewer. */
function ui(spec=fixture(),options={}){
  const doc={activeElement:null};
  function element(tag='div'){
    const attrs={},events={},el={tagName:tag.toUpperCase(),children:[],className:'',value:'',textContent:'',style:{},scrollTop:0,scrollLeft:0,
      addEventListener(type,fn){(events[type] ||= []).push(fn);},removeEventListener(type,fn){events[type]=(events[type] || []).filter(f=>f!==fn);},
      fire(type,extra={}){const ev={target:this,preventDefault(){this.defaultPrevented=true;},stopPropagation(){this.stopped=true;},...extra};(events[type] || []).slice().forEach(fn=>fn(ev));return ev;},
      appendChild(child){child.parentNode=this;this.children.push(child);return child;},
      append(...children){children.forEach(child=>this.appendChild(child));},
      replaceChildren(...children){this.children.forEach(child=>child.parentNode=null);this.children=[];this.append(...children);},
      setAttribute(k,v){attrs[k]=String(v);},getAttribute(k){return attrs[k] ?? null;},hasAttribute(k){return Object.hasOwn(attrs,k);},removeAttribute(k){delete attrs[k];},
      matches(selector){if(selector===':disabled')return !!this.disabled;return selector.split(',').some(s=>{s=s.trim();if(s[0]==='#')return this.id===s.slice(1);const tag=s.match(/^[a-z]+/i);return (!tag || this.tagName===tag[0].toUpperCase()) &&
        [...s.matchAll(/\.([\w-]+)/g)].every(m=>this.className.split(' ').includes(m[1])) && [...s.matchAll(/\[([^=\]]+)(?:="([^"]*)")?\]/g)].every(m=>m[2]==null?this.hasAttribute(m[1]):this.getAttribute(m[1])===m[2]);});},
      closest(selector){for(let current=this;current;current=current.parentNode)if(current.matches(selector))return current;return null;},
      querySelectorAll(selector){return this.children.flatMap(child=>[...(child.matches(selector)?[child]:[]),...child.querySelectorAll(selector)]);},
      querySelector(selector){return this.querySelectorAll(selector)[0] || null;},contains(child){return child===this || this.children.some(c=>c.contains(child));},
      focus(){doc.activeElement=this;},remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(c=>c!==this);},
      get firstChild(){return this.children[0];},get options(){return this.children;},get childNodes(){return this.children;}};
    el.classList={add(c){el.className+=' '+c;},remove(c){el.className=el.className.split(' ').filter(x=>x!==c).join(' ');},contains(c){return el.className.split(' ').includes(c);},toggle(c,on){this[on?'add':'remove'](c);}};
    Object.defineProperty(el,'innerHTML',{set(){this.children.forEach(child=>child.parentNode=null);this.children=[];},get(){return '';}});
    return el;
  }
  Object.assign(doc,element('document'));doc.createElement=element;doc.body=doc.appendChild(element('body'));doc.createTextNode=text=>Object.assign(element('span'),{textContent:text});
  const C={document:doc,URL};vm.createContext(C);
  for(const name of ['validator','workbench/source-edit','workbench/targets','workbench/commands/common','workbench/commands/graph','workbench/commands/document','workbench/commands/narrative','workbench/commands/layout','workbench/commands/extraction','workbench/commands/detail-mapping',
    'workbench/session','workbench/field-values','workbench/inspector-model','workbench/controls','workbench/lifetime','workbench/detail-mapping','workbench/icon-picker','workbench/brand','workbench/inspector','workbench/io-model','workbench/interactions'])vm.runInContext(readSource(name+'.js'),C);
  const guide=doc.body.appendChild(element()),view=doc.body.appendChild(element()),src=element('textarea'),win=element('window');
  let text=JSON.stringify(spec,null,2),renders=0;
  const session=C.createBuilderSession({source:{read:()=>text,write:v=>text=v},render(){renders++;},persistence:{read:()=>({}),save(){},cancel(){}}});
  session.target={kind:'node',section:0,id:'domain'};
  const inspector=C.createBuilderInspector({document:doc,guide,session,schedule:()=>1,cancel(){},surface:{reveal(){},hideDiff(){},retire(){}},
    apply(plan,opt,snapshot){if(plan.error){inspector.error(plan.error);return false;}return session.accept(plan,{snapshot,afterRender(){if(opt && opt.after)opt.after(plan);}});},
    preview:{stepper:()=>null,targetElement:()=>null},selection:{rehighlight(){},range(){},...options.selection},modes:{adding:()=>null,connecting:()=>null},clipboard:{current:()=>null},download:options.download});
  function field(label,scope=guide){const row=scope.querySelectorAll('.frow').find(row=>row.querySelector('.flab').textContent===label);return row && row.querySelector('input,select,textarea');}
  function button(label){return guide.querySelectorAll('button').find(button=>button.textContent===label);}
  return {C,doc,element,guide,view,src,win,session,inspector,field,button,typeSource(value,notify=true){text=value;if(notify)inspector.sourceChanged();},get text(){return text;},get renders(){return renders;}};
}

test('node inspector stages a complete local detail and applies it with one Undo',()=>{
  const h=ui(),initial=h.text;h.inspector.render();
  h.field('Local section').value='inside';h.field('Local section').fire('change');
  assert.equal(h.field('Open mode'),undefined);assert.equal(h.field('Boundary input node'),undefined);assert.equal(h.field('Boundary output node'),undefined);
  assert.equal(h.field('Parent → child steps JSON'),undefined);
  assert.equal(h.text,initial,'draft controls must not publish half a detail');h.button('Apply detail').fire('click');
  assert.deepEqual(parent(JSON.parse(h.text)).nodes.domain.detail,{section:'inside',mode:'focus'});
  assert.equal(h.renders,1);h.session.undo();assert.equal(h.text,initial);
});

test('external inspector fields save approved references and reject unsafe URLs',()=>{
  const h=ui();h.inspector.render();h.field('Detail target').value='Approved spec';h.field('Detail target').fire('change');
  h.field('Approved spec ID').value='approved-orders';h.field('External section').value='order-flow';h.field('Revision (optional)',h.guide.querySelector('.node-detail-editor')).value='v2';h.field('Fallback URL (optional)').value='https://example.com/orders';
  h.button('Apply detail').fire('click');assert.deepEqual(parent(JSON.parse(h.text)).nodes.domain.detail,{mode:'link',section:'order-flow',spec:'approved-orders',revision:'v2',url:'https://example.com/orders'});
  const saved=h.text;h.field('Fallback URL (optional)').value='javascript:alert(1)';h.button('Apply detail').fire('click');assert.equal(h.text,saved);assert.match(h.guide.querySelector('.ierr').textContent,/URL/);
});

test('handoff inspector stages its destination fields, applies once and exposes an undoable removal',()=>{
  const raw=fixture();parent(raw).nodes.domain.link='https://example.com/source';
  const h=ui(raw),initial=h.text;h.inspector.render();
  const fold=h.guide.querySelector('.node-handoff-editor'),field=label=>h.field(label,fold);
  assert.equal(fold.querySelector('summary').textContent,'Diagram handoff');assert.equal(fold.open,false);
  field('Destination URL').value=' https://example.com/orders ';field('Destination URL').fire('change');
  field('Spec ID (optional)').value=' orders-flow ';field('Spec ID (optional)').fire('keydown',{key:'Enter'});
  field('Revision (optional)').value=' v2 ';field('Section (optional)').value=' process ';
  assert.equal(h.text,initial);assert.equal(h.renders,0);h.button('Apply handoff').fire('click');
  const saved=h.text;assert.deepEqual(parent(JSON.parse(saved)).nodes.domain.handoff,{url:'https://example.com/orders',spec:'orders-flow',revision:'v2',section:'process'});
  assert.equal(parent(JSON.parse(saved)).nodes.domain.link,'https://example.com/source');assert.equal(h.renders,1);
  assert.equal(h.session.undo(),true);assert.equal(h.text,initial);assert.equal(h.session.canUndo(),false);
  assert.equal(h.session.redo(),true);assert.equal(h.text,saved);h.session.target={kind:'node',section:0,id:'domain'};h.inspector.render();
  assert.equal(h.guide.querySelector('.node-handoff-editor').open,true);assert.equal(h.button('Create detail flow'),undefined);
  h.button('Remove handoff').fire('click');assert.deepEqual(parent(JSON.parse(h.text)).nodes.domain,parent(raw).nodes.domain);
  assert.equal(h.session.undo(),true);assert.equal(h.text,saved);assert.equal(h.session.redo(),true);
  assert.equal(parent(JSON.parse(h.text)).nodes.domain.handoff,undefined);
});

test('handoff inspector keeps invalid drafts and source intact with visible validation feedback',()=>{
  const raw=fixture();parent(raw).nodes.domain.handoff={url:'https://example.com/old'};
  const h=ui(raw),initial=h.text;h.inspector.render();
  const fold=h.guide.querySelector('.node-handoff-editor'),field=label=>h.field(label,fold);
  field('Destination URL').value='https://user:pass@example.com/orders';h.button('Apply handoff').fire('click');
  assert.equal(h.text,initial);assert.match(h.guide.querySelector('.ierr').textContent,/URL/);
  assert.equal(field('Destination URL').value,'https://user:pass@example.com/orders');assert.equal(h.renders,0);assert.equal(h.session.canUndo(),false);
  field('Destination URL').value='https://example.com/orders';field('Section (optional)').value='process';h.button('Apply handoff').fire('click');
  assert.equal(h.text,initial);assert.match(h.guide.querySelector('.ierr').textContent,/spec/i);assert.equal(h.session.canUndo(),false);
});

test('inspector conflict feedback preserves details until explicit removal and blocks applying details to handoffs',()=>{
  const h=ui(linked()),initial=h.text;h.inspector.render();h.field('Destination URL').value='https://example.com/orders';h.button('Apply handoff').fire('click');
  assert.equal(h.text,initial);assert.match(h.guide.querySelector('.ierr').textContent,/Remove.*domain detail/);assert.equal(h.session.canUndo(),false);
  h.button('Remove detail').fire('click');h.inspector.render();h.field('Destination URL').value='https://example.com/orders';h.button('Apply handoff').fire('click');
  const assigned=h.text;h.inspector.render();assert.equal(h.button('Create detail flow'),undefined);
  h.field('Local section').value='inside';h.field('Local section').fire('change');h.button('Apply detail').fire('click');
  assert.equal(h.text,assigned);assert.match(h.guide.querySelector('.ierr').textContent,/Remove.*diagram handoff/);
  assert.equal(h.session.undo(),true);assert.equal(parent(JSON.parse(h.text)).nodes.domain.detail,undefined);
  assert.equal(h.session.undo(),true);assert.equal(h.text,initial);assert.equal(h.session.canUndo(),false);
});

test('create action lands in the new section inspector, exposes stable ID/detail-only and undoes both edits',()=>{
  const h=ui(),initial=h.text;h.inspector.render();h.button('Create detail flow').fire('click');
  assert.equal(h.session.target.kind,'section');assert.equal(h.field('Stable section ID').value,'domain-detail');assert.equal(h.field('Detail only').checked,true);
  assert.equal(h.renders,1);assert.equal(h.session.undo(),true);assert.equal(h.text,initial);assert.equal(h.session.canUndo(),false);
});

test('transient detail frames cannot select, drag, decorate or delete authored entities',()=>{
  const h=ui(),preview=h.view.appendChild(h.element()),node=preview.appendChild(h.element('g')),panel=preview.appendChild(h.element());
  preview.className='doc-sec';preview.setAttribute('data-dv-detail-preview','');preview.setAttribute('data-dv-section','100001');node.className='node';node.setAttribute('data-dv-node','entry');panel.setAttribute('data-dv-panel','0');
  let errors=0,decorations=0,rendered=0;
  const interactions=h.C.createBuilderInteractions({document:h.doc,window:h.win,view:h.view,src:h.src,session:h.session,guide:h.guide,
    inspector:{render(){rendered++;},panelForCard(){decorations++;return {};},error(){errors++;}},refreshLayout(){},refreshInsertion(){},ctl:()=>({sections:[]})});
  const before=JSON.stringify(h.session.target),text=h.text;
  h.view.fire('click',{target:node});h.view.fire('mousedown',{target:node,button:0});h.view.fire('dv:pathchange',{target:node});
  h.doc.activeElement=node;h.doc.fire('keydown',{target:node,key:'Delete'});interactions.applyRowGrabs();
  interactions.toggleAdding({section:0,index:0});const afterArm=rendered;h.view.fire('click',{target:node});
  assert.equal(JSON.stringify(h.session.target),before);assert.equal(h.text,text);assert.equal(h.renders,0);assert.equal(errors,0);assert.equal(decorations,0);assert.equal(rendered,afterArm);
});

function extractionFixture(){
  return {page:{title:'Keep formatting',sections:[{id:'top',heading:'Overview',text:'Prose stays byte-for-byte.',diagram:{
    nodes:{outside:{title:'Caller'},a:{title:'Validate',group:'inner',codeRefs:[{file:'orders.ts',line:4}]},b:{title:'Store',group:'inner'},end:{title:'Receiver'},idle:{title:'Observer'}},
    groups:{inner:{title:'Orders',parent:'platform'},platform:{title:'Platform'}},rows:[['outside',['a','b']],['end','idle']],
    edges:[{from:'outside',to:'a',kind:'https',label:'POST'}, {from:'a',to:'b',kind:'int',label:'save'}, {from:'b',to:'end',kind:'int'}, {from:'outside',to:'idle',kind:'https'}],
    steps:[{id:'enter',edge:'outside->a',text:'Enter'},{edges:['a->b','outside->idle'],text:'Mixed activity',nodes:['a','idle'],tone:{b:'ok',idle:'warn'},packets:[{edge:'a->b',label:'payload'},{edge:'outside->idle',label:'observe'}],codeRefs:[{file:'orders.ts',line:10}]},
      {id:'failed',failures:{'a->b':'dropped','outside->idle':'blocked'},text:'Internal failure'}, {id:'leave',edge:'b->end',text:'Return'}, {id:'unrelated',edge:'outside->idle',text:'Observe'}]
  }},{heading:'Unrelated',text:'Keep this exact section.'}]}};
}

test('multiselect inspector previews independent extraction, applies once, and lands on the new domain',()=>{
  const h=ui(),initial=h.text,targets=[{kind:'node',section:0,id:'client'},{kind:'node',section:0,id:'domain'}];
  h.inspector.renderMulti(targets);h.button('Create domain from selected nodes').fire('click');
  assert.equal(h.text,initial);assert.equal(h.renders,0);assert.equal(h.session.canUndo(),false);
  assert.equal(h.field('Destination').value,'local');assert.equal(h.button('Apply extraction').disabled,false);
  h.button('Apply extraction').fire('click');
  assert.equal(h.session.target.id,'domain1');assert.equal(h.session.target.kind,'node');assert.equal(h.renders,1);
  const next=JSON.parse(h.text);assert.deepEqual(Object.keys(next.page.blocks.at(-1).diagram.nodes),['client','domain']);
  h.session.undo();assert.equal(h.text,initial);assert.equal(h.session.canUndo(),false);
});

function extractionUI(options={}){
  let selected=[{kind:'node',section:0,id:'a'},{kind:'node',section:0,id:'b'}];
  const downloads=[],released=[];
  const h=ui(extractionFixture(),{selection:{current:()=>selected,clear(){selected=[];}},
    download(name,text,mime){if(options.failDownload)throw new Error('Download denied');const item={name,text,mime};downloads.push(item);return ()=>released.push(item);}});
  h.inspector.renderMulti(selected);h.button('Create domain from selected nodes').fire('click');
  return Object.assign(h,{downloads,released,change(label,value){h.field(label).value=value;h.field(label).fire('input');h.field(label).fire('change');},
    select(value){selected=value;},external(){this.change('Destination','external');this.change('Destination URL','https://example.com/orders');}});
}

test('extraction preview displays every affected link, reference and note without publishing title edits',()=>{
  const h=extractionUI(),before=h.session.text();
  const plan=h.C.planExtractIndependentDiagram(before,JSON.parse(before),0,['a','b'],{mode:'local',title:'Orders'});
  h.change('Domain title','Orders');
  assert.equal(h.session.text(),before);assert.equal(h.session.canUndo(),false);
  assert.match(h.guide.querySelector('.extraction-summary').textContent,/2 nodes.*1 internal edge.*0 child steps/);
  const shown=h.guide.querySelector('.extraction-report').querySelectorAll('li').map(item=>item.textContent);
  assert.deepEqual(shown,[...plan.report.affectedSteps,...plan.report.boundaryEdges,...plan.report.references,...plan.report.notes]);
  h.field('Domain title').fire('keydown',{key:'Enter'});assert.equal(h.session.text(),before);
  h.button('Apply extraction').fire('click');
  const raw=JSON.parse(h.session.text()),parent=raw.page.sections[0].diagram,child=raw.page.sections.at(-1).diagram;
  assert.equal(parent.nodes[h.session.target.id].title,'Orders');assert.deepEqual(child.steps,[]);
  assert.equal(parent.nodes[h.session.target.id].detail.stepMap,undefined);assert.equal(child.initial,undefined);
  const after=h.session.text();assert.equal(h.session.undo(),true);assert.equal(h.session.text(),before);assert.equal(h.session.canUndo(),false);
  assert.equal(h.session.redo(),true);assert.equal(h.session.text(),after);
});

test('separate document requires a downloaded exact draft and changing settings requires another download',()=>{
  const h=extractionUI(),before=h.session.text();h.external();h.change('Spec ID','approved-orders');h.change('Section ID','orders');
  assert.equal(h.button('Apply extraction').disabled,true);h.button('Apply extraction').fire('click');assert.equal(h.session.text(),before);
  h.button('Download destination JSON').fire('click');h.button('Download destination JSON').fire('click');
  assert.equal(h.downloads.length,2);assert.equal(h.downloads[0].text,h.downloads[1].text);assert.equal(h.button('Apply extraction').disabled,false);
  assert.equal(h.session.text(),before);assert.equal(h.session.canUndo(),false);
  h.change('Domain title','Orders');assert.equal(h.button('Apply extraction').disabled,true);assert.equal(h.released.length,2);
  h.button('Apply extraction').fire('click');assert.equal(h.session.text(),before);
  h.button('Download destination JSON').fire('click');const child=JSON.parse(h.downloads.at(-1).text).page.sections[0];
  assert.equal(child.id,'orders');assert.deepEqual(child.diagram.steps,[]);assert.equal(child.diagram.initial,undefined);
  assert.equal(h.downloads.at(-1).name,'orders.spec.json');
  h.button('Apply extraction').fire('click');const raw=JSON.parse(h.session.text());
  assert.equal(raw.page.sections.length,2);assert.equal(raw.page.sections[0].diagram.nodes[h.session.target.id].handoff.section,'orders');
  assert.equal(h.released.length,3);assert.equal(h.session.undo(),true);assert.equal(h.session.text(),before);assert.equal(h.session.canUndo(),false);
});

test('external extraction accepts approved spec IDs, rejects unsafe URLs, and preserves a failed download draft',()=>{
  const settings={failDownload:true},h=extractionUI(settings),before=h.session.text();
  h.change('Destination','external');assert.equal(h.button('Download destination JSON').disabled,true);
  h.change('Spec ID','approved-orders');h.change('Revision','v3');assert.equal(h.button('Download destination JSON').disabled,false);
  h.change('Destination URL','javascript:alert(1)');assert.equal(h.button('Download destination JSON').disabled,true);
  h.button('Download destination JSON').fire('click');assert.equal(h.downloads.length,0);
  h.change('Destination URL','');h.button('Download destination JSON').fire('click');
  assert.match(h.guide.querySelector('.ierr').textContent,/Download denied/);assert.equal(h.button('Apply extraction').disabled,true);assert.equal(h.session.text(),before);
  settings.failDownload=false;h.button('Download destination JSON').fire('click');assert.equal(h.guide.querySelector('.ierr').hidden,true);
  const expected=JSON.parse(h.downloads[0].text).page.sections[0].id;h.button('Apply extraction').fire('click');
  assert.deepEqual(JSON.parse(h.session.text()).page.sections[0].diagram.nodes[h.session.target.id].handoff,{spec:'approved-orders',revision:'v3',section:expected});
});

test('stale source, selection, project, canceled and retired previews cannot download or publish held controls',()=>{
  for(const reason of ['source','unannounced-source','selection','project','cancel','escape','rerender','retire','destroy']){
    const h=extractionUI();h.external();h.button('Download destination JSON').fire('click');
    const apply=h.button('Apply extraction'),download=h.button('Download destination JSON');
    if(reason==='source')h.typeSource(h.session.text()+' ');
    if(reason==='unannounced-source')h.typeSource(h.session.text()+' ',false);
    if(reason==='selection')h.select([{kind:'node',section:0,id:'outside'},{kind:'node',section:0,id:'a'}]);
    if(reason==='project')h.session.replaceProject(h.session.text());
    if(reason==='cancel')h.button('Cancel').fire('click');
    if(reason==='escape'){const ev=h.guide.querySelector('.extraction-preview').fire('keydown',{key:'Escape'});assert.equal(ev.stopped,true);}
    if(reason==='rerender')h.inspector.renderMulti([{kind:'node',section:0,id:'outside'},{kind:'node',section:0,id:'a'}]);
    if(reason==='retire')h.inspector.retire();
    if(reason==='destroy')h.inspector.destroy();
    const before=h.session.text(),renders=h.renders;apply.fire('click');download.fire('click');
    assert.equal(h.session.text(),before,reason);assert.equal(h.renders,renders,reason);assert.equal(h.downloads.length,1,reason);assert.equal(h.released.length,1,reason);
  }
});

test('unannounced settings changes require reviewing the newly calculated preview before Apply',()=>{
  const h=extractionUI(),before=h.session.text();h.field('Domain title').value='New title without an input event';
  h.button('Apply extraction').fire('click');assert.equal(h.session.text(),before);
  assert.match(h.guide.querySelector('.ierr').textContent,/Review the updated preview/);
  h.button('Apply extraction').fire('click');assert.equal(JSON.parse(h.session.text()).page.sections[0].diagram.nodes[h.session.target.id].title,'New title without an input event');
});

test('retargeting a local detail resets child bindings while retaining unrelated metadata',()=>{
 for(const destination of ['URL','Approved spec','Local section']){
  const raw=linked();parent(raw).nodes.domain.detail.future={keep:true};
  raw.page.blocks.push({id:'other-child',heading:'Other child',detailOnly:true,diagram:{nodes:{z:{}},rows:[['z']],steps:[{id:'other-event',nodes:['z']}]}});
  const h=ui(raw),before=h.text;h.inspector.render();
  if(destination==='Local section'){h.field('Local section').value='other-child';h.field('Local section').fire('change');}
  else{
   h.field('Detail target').value=destination;h.field('Detail target').fire('change');
   if(destination==='URL')h.field('Detail URL').value='https://example.org/other';
   else{h.field('Approved spec ID').value='remote';h.field('External section').value='remote-child';}
  }
  assert.equal(h.text,before);h.button('Apply detail').fire('click');assert.notEqual(h.text,before);
  const saved=parent(JSON.parse(h.text)).nodes.domain.detail;
  for(const key of ['ports','path','step','stepMap'])assert.equal(saved[key],undefined,key);
  assert.deepEqual(saved.future,{keep:true});h.session.undo();assert.equal(h.text,before);
 }
});
