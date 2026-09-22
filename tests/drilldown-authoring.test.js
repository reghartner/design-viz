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
function ui(){
  const doc={activeElement:null};
  function element(tag='div'){
    const attrs={},events={},el={tagName:tag.toUpperCase(),children:[],className:'',value:'',textContent:'',style:{},scrollTop:0,scrollLeft:0,
      addEventListener(type,fn){(events[type] ||= []).push(fn);},removeEventListener(type,fn){events[type]=(events[type] || []).filter(f=>f!==fn);},
      fire(type,extra={}){const ev={target:this,preventDefault(){this.defaultPrevented=true;},stopPropagation(){this.stopped=true;},...extra};(events[type] || []).slice().forEach(fn=>fn(ev));return ev;},
      appendChild(child){child.parentNode=this;this.children.push(child);return child;},
      setAttribute(k,v){attrs[k]=String(v);},getAttribute(k){return attrs[k] ?? null;},hasAttribute(k){return Object.hasOwn(attrs,k);},removeAttribute(k){delete attrs[k];},
      matches(selector){return selector.split(',').some(s=>{s=s.trim();if(s[0]==='#')return this.id===s.slice(1);const tag=s.match(/^[a-z]+/i);return (!tag || this.tagName===tag[0].toUpperCase()) &&
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
  for(const name of ['validator','workbench/source-edit','workbench/targets','workbench/commands/common','workbench/commands/graph','workbench/commands/document','workbench/commands/narrative','workbench/commands/layout',
    'workbench/session','workbench/field-values','workbench/inspector-model','workbench/controls','workbench/lifetime','workbench/inspector','workbench/interactions'])vm.runInContext(readSource(name+'.js'),C);
  const guide=doc.body.appendChild(element()),view=doc.body.appendChild(element()),src=element('textarea'),win=element('window');
  let text=JSON.stringify(fixture(),null,2),renders=0;
  const session=C.createBuilderSession({source:{read:()=>text,write:v=>text=v},render(){renders++;},persistence:{read:()=>({}),save(){}}});
  session.target={kind:'node',section:0,id:'domain'};
  const inspector=C.createBuilderInspector({document:doc,guide,session,schedule:()=>1,cancel(){},surface:{reveal(){},hideDiff(){},retire(){}},
    apply(plan,opt,snapshot){if(plan.error){inspector.error(plan.error);return false;}return session.accept(plan,{snapshot,afterRender(){if(opt && opt.after)opt.after(plan);}});},
    preview:{stepper:()=>null,targetElement:()=>null},selection:{rehighlight(){},range(){}},modes:{adding:()=>null,connecting:()=>null},clipboard:{current:()=>null}});
  function field(label){const row=guide.querySelectorAll('.frow').find(row=>row.querySelector('.flab').textContent===label);return row && row.querySelector('input,select,textarea');}
  function button(label){return guide.querySelectorAll('button').find(button=>button.textContent===label);}
  return {C,doc,element,guide,view,src,win,session,inspector,field,button,get text(){return text;},get renders(){return renders;}};
}

test('node inspector stages a complete local detail and applies it with one Undo',()=>{
  const h=ui(),initial=h.text;h.inspector.render();
  h.field('Local section').value='inside';h.field('Local section').fire('change');
  assert.equal(h.field('Open mode'),undefined);assert.equal(h.field('Boundary input node'),undefined);assert.equal(h.field('Boundary output node'),undefined);
  h.field('Parent → child steps JSON').value='{"request":{"step":"accept"}}';
  assert.equal(h.text,initial,'draft controls must not publish half a detail');h.button('Apply detail').fire('click');
  assert.deepEqual(parent(JSON.parse(h.text)).nodes.domain.detail,{section:'inside',mode:'focus',stepMap:{request:{step:'accept'}}});
  assert.equal(h.renders,1);h.session.undo();assert.equal(h.text,initial);
});

test('external inspector fields save approved references and reject unsafe URLs',()=>{
  const h=ui();h.inspector.render();h.field('Detail target').value='Approved spec';h.field('Detail target').fire('change');
  h.field('Approved spec ID').value='approved-orders';h.field('External section').value='order-flow';h.field('Revision (optional)').value='v2';h.field('Fallback URL (optional)').value='https://example.com/orders';
  h.button('Apply detail').fire('click');assert.deepEqual(parent(JSON.parse(h.text)).nodes.domain.detail,{mode:'link',section:'order-flow',spec:'approved-orders',revision:'v2',url:'https://example.com/orders'});
  const saved=h.text;h.field('Fallback URL (optional)').value='javascript:alert(1)';h.button('Apply detail').fire('click');assert.equal(h.text,saved);assert.match(h.guide.querySelector('.ierr').textContent,/URL/);
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

test('extraction preserves identities and timeline evidence, creates focus without ports, and is reversible',()=>{
  const raw=extractionFixture(),text=JSON.stringify(raw,null,3).replace('"title": "Keep formatting"','"title"   : "Keep formatting"'),before=JSON.stringify(raw);
  const plan=B.planExtractNodeDetail(text,raw,0,['a','b'],'Orders');assert.equal(plan.error,undefined);assert.equal(JSON.stringify(raw),before);
  const next=JSON.parse(plan.text),outer=next.page.sections[0].diagram,inner=next.page.sections[2].diagram,domain=outer.nodes[plan.id];
  assert.deepEqual(Object.keys(inner.nodes),['a','b']);assert.deepEqual(inner.nodes.a,raw.page.sections[0].diagram.nodes.a);
  assert.deepEqual(outer.rows,[['outside','domain1'],['end','idle']]);assert.deepEqual(inner.rows,[[['a','b']]]);
  assert.deepEqual(outer.edges.map(edge=>[edge.from,edge.to]),[['outside','domain1'],['domain1','end'],['outside','idle']]);
  assert.deepEqual(inner.edges,[raw.page.sections[0].diagram.edges[1]]);assert.deepEqual(inner.groups,raw.page.sections[0].diagram.groups);
  assert.equal(domain.detail.ports,undefined);assert.equal(next.page.sections[2].detailOnly,true);
  assert.equal(domain.group,'inner');
  assert.deepEqual(outer.steps[1].nodes,['idle','domain1']);assert.equal(outer.steps[1].edge,'outside->idle');
  assert.deepEqual(outer.steps[1].tone,{idle:'warn'});assert.deepEqual(inner.steps[1].tone,{b:'ok'});
  assert.deepEqual(inner.steps[1].packets,[{edge:'a->b',label:'payload'}]);assert.deepEqual(outer.steps[1].packets,[{edge:'outside->idle',label:'observe'}]);
  assert.deepEqual(inner.steps[1].codeRefs,raw.page.sections[0].diagram.steps[1].codeRefs);assert.deepEqual(outer.steps[1].codeRefs,inner.steps[1].codeRefs);
  assert.deepEqual(inner.steps[2].failures,{'a->b':'dropped'});assert.equal(inner.steps[2].edge,undefined,'failure-only steps stay failure-only');assert.deepEqual(outer.steps[2].failures,{'outside->idle':'blocked'});
  assert.deepEqual(outer.steps[4],raw.page.sections[0].diagram.steps[4]);assert.equal(inner.steps.length,4);
  inner.steps.forEach(step=>assert.deepEqual(domain.detail.stepMap[step.id],{step:step.id}));
  assert.match(plan.text,/"title"   : "Keep formatting"/);
  for(const path of [['page','sections',0,'text'],['page','sections',1]]){const a=B.jsonLocate(text,path),b=B.jsonLocate(plan.text,path);assert.equal(text.slice(a.start,a.end),plan.text.slice(b.start,b.end));}
  assert.deepEqual(plain(B.validate(B.normalize(next)).errors),[]);validDetails(next);
  const h=sessionFor(text);h.session.accept(plan);assert.equal(h.renders,1);h.session.undo();assert.equal(h.text,text);assert.equal(h.session.canUndo(),false);h.session.redo();assert.equal(h.text,plan.text);
});

test('extracting all selected rows leaves one domain and does not require edges or steps',()=>{
  const raw={sections:[{diagram:{nodes:{a:{title:'A'},b:{title:'B'}},rows:[['a'],['b']]}}]};
  const result=run('planExtractNodeDetail',raw,0,['a','b']).raw;
  assert.deepEqual(result.sections[0].diagram.rows,[['domain1']]);assert.deepEqual(result.sections[1].diagram.rows,[['a'],['b']]);
  assert.deepEqual(result.sections[0].diagram.nodes.domain1.detail,{section:'domain1-detail',mode:'focus'});validDetails(result);
});

test('extraction refuses ambiguous boundaries and unsupported reference scenarios without publishing or mutating source',()=>{
  const cases=[
    [d=>d.edges.push({from:'idle',to:'b'}),/multiple different input/],
    [d=>d.edges.push({from:'a',to:'idle'}),/multiple different output/],
    [d=>d.panels=[{id:'state',type:'state'}],/panel patches/],
    [d=>d.steps[0].panels={state:{value:'x'}},/panel patches/],
    [d=>d.steps[0].conditions=[{nodeId:'a'}],/runtime conditions/],
    [d=>d.paths=[{id:'happy',steps:['enter']}],/linear timelines/],
    [d=>d.layouts=[{id:'main'}],/authored layouts/],
    [d=>d.routing={},/routing/],
    [d=>d.edges[1].revealAt=2,/timeline rebasing/],
    [d=>d.steps[0].failures={'outside->a':'blocked'},/boundary failure/],
    [d=>d.nodes.a.detail={section:'top',mode:'focus'},/existing details/],
    [d=>d.floats=[{id:'a',side:'above'}],/floated nodes/],
    [d=>d.nodes.outside.detail={section:'top',mode:'focus',ports:{in:'a'}},/Reassign that port/],
    [d=>d.steps[1].id='enter',/unique string ID/]
  ];
  for(const [mutate,message] of cases){const raw=extractionFixture();mutate(raw.page.sections[0].diagram);const text=JSON.stringify(raw),plan=B.planExtractNodeDetail(text,raw,0,['a','b']);assert.match(plan.error,message);assert.equal(plan.text,undefined);assert.equal(JSON.stringify(raw),text);}
});

test('multiselect inspector extracts the chosen nodes and lands on the new domain',()=>{
  const h=ui(),initial=h.text,targets=[{kind:'node',section:0,id:'client'},{kind:'node',section:0,id:'domain'}];
  h.inspector.renderMulti(targets);h.button('Create domain from selected nodes').fire('click');
  assert.equal(h.session.target.id,'domain1');assert.equal(h.session.target.kind,'node');assert.equal(h.renders,1);
  const next=JSON.parse(h.text);assert.deepEqual(Object.keys(next.page.blocks.at(-1).diagram.nodes),['client','domain']);
  h.session.undo();assert.equal(h.text,initial);assert.equal(h.session.canUndo(),false);
});
