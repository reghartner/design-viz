'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readSource}=require('../tools/source-loader.cjs');
const plain=value=>JSON.parse(JSON.stringify(value));
function modelContext(){
  const c={};vm.createContext(c);vm.runInContext(readSource('core/navigation.js'),c);vm.runInContext(readSource('core/document.js'),c);vm.runInContext(readSource('workbench/agent-review.js'),c);return c;
}
function section(id,heading,diagram,extra={}){return {id,heading,diagram,...extra};}
test('review change model uses stable identities across section and item insertion/reordering without mutating specs',()=>{
  const c=modelContext();
  const current={sections:[
    section('alpha','Alpha',{nodes:{a:{title:'A'},old:{title:'Old'}},edges:[{id:'flow',from:'a',to:'old',label:'before'}],panels:[{id:'phone',type:'deviceapp',title:'Before'}],steps:[{id:'start',title:'Start'},{id:'finish',title:'Before'}],rows:[['a','old']]}),
    section('beta','Beta',{nodes:{b:{title:'B'}},edges:[],panels:[],steps:[],rows:[['b']]})]};
  const proposed={sections:[
    section('new','New',{nodes:{n:{title:'New'}},rows:[['n']]}),
    section('beta','Beta',{nodes:{b:{title:'B'}},edges:[],panels:[],steps:[],rows:[['b']]}),
    section('alpha','Alpha',{nodes:{fresh:{title:'Fresh'},a:{title:'A changed'}},edges:[{id:'flow',from:'a',to:'fresh',label:'after'}],panels:[{id:'phone',type:'deviceapp',title:'After'},{id:'log',type:'log'}],steps:[{id:'finish',title:'After'},{id:'inserted',title:'Inserted'},{id:'start',title:'Start'}],rows:[['a','fresh']]})]};
  const beforeCurrent=JSON.stringify(current),beforeProposed=JSON.stringify(proposed),changes=plain(c.workbenchAgentReviewChanges(current,proposed));
  assert.equal(JSON.stringify(current),beforeCurrent);assert.equal(JSON.stringify(proposed),beforeProposed);
  assert.equal(changes.proposed.sections[0].status,'added');assert.equal(changes.current.sections[1],undefined,'stable section reorder is unchanged');
  const before=changes.current.sections[0],after=changes.proposed.sections[2];
  assert.deepEqual(before.nodes,{a:'modified',old:'removed'});assert.deepEqual(after.nodes,{a:'modified',fresh:'added'});
  assert.deepEqual(before.edges,{0:'modified'});assert.deepEqual(after.edges,{0:'modified'});
  assert.deepEqual(before.panels,{0:'modified'});assert.deepEqual(after.panels,{0:'modified',1:'added'});
  assert.deepEqual(before.steps,{1:'modified'});assert.deepEqual(after.steps,{0:'modified',1:'added'});
  assert.equal(before.status,'modified','rows use the section fallback');assert.equal(after.status,'modified');
  assert.deepEqual(changes.current.counts,{added:0,removed:1,modified:5});
  assert.deepEqual(changes.proposed.counts,{added:4,removed:0,modified:5});
});
test('un-IDed exact items survive insertion and reorder while natural edge counterparts are modified',()=>{
  const c=modelContext(),current={sections:[section(null,'Only',{nodes:{a:{},b:{}},edges:[{from:'a',to:'b',label:'old'}],panels:[],steps:[{title:'One'},{title:'One'},{title:'Two'}],rows:[['a','b']]})]};
  const proposed={sections:[section(null,'Only',{nodes:{a:{},b:{}},edges:[{from:'a',to:'b',label:'new'}],panels:[],steps:[{title:'Two'},{title:'Inserted'},{title:'One'},{title:'One'}],rows:[['a','b']]})]};
  const changes=plain(c.workbenchAgentReviewChanges(current,proposed));
  assert.deepEqual(changes.current.sections[0].steps,{});assert.deepEqual(changes.proposed.sections[0].steps,{1:'added'});
  assert.deepEqual(changes.current.sections[0].edges,{0:'modified'});assert.deepEqual(changes.proposed.sections[0].edges,{0:'modified'});
});
test('page and diagram properties without one rendered target use document and section fallbacks',()=>{
  const c=modelContext(),current={title:'Before',sections:[section('one','One',{nodes:{a:{}},rows:[['a']],view:'ambient'})]};
  const proposed={title:'After',sections:[section('one','One',{nodes:{a:{}},rows:[['a']],view:'step'})]};
  const changes=plain(c.workbenchAgentReviewChanges(current,proposed));
  assert.equal(changes.current.document,'modified');assert.equal(changes.proposed.document,'modified');
  assert.equal(changes.current.sections[0].status,'modified');assert.equal(changes.proposed.sections[0].status,'modified');
  assert.deepEqual(changes.current.counts,{added:0,removed:0,modified:2});assert.deepEqual(changes.proposed.counts,{added:0,removed:0,modified:2});
});
function fakeNode(attrs={},parent=null){
  return {attrs:{...attrs},parent,children:[],setAttribute(k,v){this.attrs[k]=String(v);},getAttribute(k){return this.attrs[k]??null;},removeAttribute(k){delete this.attrs[k];},
    toggleAttribute(k,on){if(on)this.attrs[k]='';else delete this.attrs[k];},closest(selector){if(selector==='[data-dv-section]'){let n=this;while(n){if(n.attrs['data-dv-section']!=null)return n;n=n.parent;}}return null;}};
}
test('review decoration can be disabled and reapplied after rendered content is reparented',()=>{
  const c=modelContext(),root=fakeNode(),sectionNode=fakeNode({'data-dv-section':'0'},root),otherSection=fakeNode({'data-dv-section':'1'},root);
  const node=fakeNode({'data-dv-node':'camera'},sectionNode),edge=fakeNode({'data-dv-edge':'0'},sectionNode),step=fakeNode({'data-step-source':'2'},sectionNode);
  const all=[sectionNode,otherSection,node,edge,step];root.querySelectorAll=selector=>selector==='[data-agent-change]'?all.filter(n=>n.attrs['data-agent-change']):all.filter(n=>{
    const key=selector.slice(1,-1);return n.attrs[key]!=null;
  });
  const side={sections:{0:{status:'modified',nodes:{camera:'added'},edges:{0:'modified'},panels:{},steps:{2:'added'}}}};
  c.workbenchAgentReviewDecorate(root,side,true);assert.equal(root.attrs['data-agent-highlights'],'');assert.equal(node.attrs['data-agent-change'],'added');assert.equal(edge.attrs['data-agent-change'],'modified');
  c.workbenchAgentReviewDecorate(root,side,false);assert.equal(root.attrs['data-agent-highlights'],undefined);assert.equal(node.attrs['data-agent-change'],undefined);
  node.parent=otherSection;c.workbenchAgentReviewDecorate(root,side,true);assert.equal(node.attrs['data-agent-change'],undefined,'a contained navigation reparent cannot borrow another section change');
  node.parent=sectionNode;c.workbenchAgentReviewDecorate(root,side,true);assert.equal(node.attrs['data-agent-change'],'added');
});
function uiHarness(options={}){
  const ids=['banner','dialog','view','scroll','commit','current','proposed','source','ledger','ledger-summary','summary','note','issues','feedback','ledger-panel','close','open','banner-title','banner-summary','discard','copy-feedback','return','highlights','immersive','change-added','change-removed','change-modified','change-status'];
  function element(id){
    const listeners={},classes=new Set(),attrs={};return {id,hidden:false,open:false,textContent:'',value:'',disabled:false,attrs,listeners,
      classList:{toggle(name,on){if(on)classes.add(name);else classes.delete(name);},contains:name=>classes.has(name)},
      addEventListener(type,fn){(listeners[type]||(listeners[type]=[])).push(fn);},removeEventListener(type,fn){listeners[type]=(listeners[type]||[]).filter(v=>v!==fn);},
      fire(type,event={preventDefault(){}}){(listeners[type]||[]).slice().forEach(fn=>fn.call(this,event));},setAttribute(k,v){attrs[k]=String(v);},getAttribute(k){return attrs[k]??null;},
      toggleAttribute(k,on){if(on)attrs[k]='';else delete attrs[k];},removeAttribute(k){delete attrs[k];},replaceChildren(){},querySelectorAll(){return [];},focus(){},
      showModal(){this.open=true;},close(){this.open=false;}};
  }
  const elements={};ids.forEach(id=>elements['agent-update-'+id]=element(id));
  const observers=[];class Observer{constructor(callback){this.callback=callback;this.disconnected=false;observers.push(this);}observe(){this.observed=true;}disconnect(){this.disconnected=true;}}
  const doc={defaultView:{MutationObserver:Observer},getElementById:id=>elements[id]};let snapshot,rendered=0,destroyed=0,canvasDestroyed=0;
  const pages=[],accepted=[];
  const c={document:doc,navigator:{clipboard:{}},normalize:raw=>raw.page || raw,validate:()=>({errors:[]}),renderPage(root,page){rendered++;pages.push(plain(page));return {destroy(){destroyed++;}};},
    initViewerExploreCanvas(){return {destroy(){canvasDestroyed++;}};}};
  vm.createContext(c);vm.runInContext(readSource('core/navigation.js'),c);vm.runInContext(readSource('core/document.js'),c);vm.runInContext(readSource('workbench/lifetime.js'),c);vm.runInContext(readSource('workbench/agent-review.js'),c);
  let session;
  if(options.topology){
    vm.runInContext(readSource('canon.js'),c);vm.runInContext(readSource('validator.js'),c);vm.runInContext(readSource('workbench/session.js'),c);
    let text=options.current;
    session=c.createBuilderSession({source:{read:()=>text,write:value=>text=value},persistence:{read:()=>({}),preserve(){},cancel(){},save(){}},render(){}});
    session.replaceProject(text,null,{topologyContext:options.context});
  }
  const current=JSON.stringify({sections:[section('one','One',{nodes:{a:{title:'A'}},rows:[['a']]})]}),source=JSON.stringify({sections:[section('one','One',{nodes:{a:{title:'Changed'}},rows:[['a']]})]});
  snapshot={current,source,currentLedger:'old',ledger:'new',review:{version:1,id:'p',requestId:'r',ok:true,summary:'Changed A',conflicts:[]}};
  if(options.current)snapshot.current=options.current;if(options.source)snapshot.source=options.source;
  if(options.ok===false)snapshot.review.ok=false;
  const ui=c.initWorkbenchAgentReview({document:doc,resolve:session && !options.omitResolver?session.resolve:undefined,snapshot:()=>snapshot,accept:async version=>accepted.push({version,source:snapshot.source}),reject:async()=>{}});
  return {c,ui,elements,observers,pages,accepted,snapshot,session,counts:()=>({rendered,destroyed,canvasDestroyed}),review:snapshot.review};
}
test('review UI keeps highlight state through redraws, resets on reopen, and retires observers and renderers',()=>{
  const h=uiHarness(),e=h.elements;h.ui.update(h.review);e['agent-update-open'].fire('click');
  assert.equal(h.counts().rendered,1);assert.equal(e['agent-update-highlights'].getAttribute('aria-pressed'),'true');assert.equal(e['agent-update-commit'].disabled,false);
  e['agent-update-immersive'].fire('click');assert.equal(e['agent-update-dialog'].classList.contains('agent-update-immersive'),true);
  e['agent-update-highlights'].fire('click');assert.equal(e['agent-update-highlights'].getAttribute('aria-pressed'),'false');
  const firstObserver=h.observers[0];e['agent-update-current'].fire('click');assert.equal(firstObserver.disconnected,true);assert.equal(h.counts().rendered,2);
  assert.equal(e['agent-update-highlights'].getAttribute('aria-pressed'),'false','redraw preserves the user toggle');assert.equal(e['agent-update-commit'].disabled,true);
  e['agent-update-close'].fire('click');assert.equal(h.observers.at(-1).disconnected,true);assert.equal(e['agent-update-dialog'].classList.contains('agent-update-immersive'),false);
  e['agent-update-open'].fire('click');assert.equal(e['agent-update-highlights'].getAttribute('aria-pressed'),'true','each review opens with useful highlights');
  h.ui.destroy();assert.equal(h.observers.at(-1).disconnected,true);assert.ok(h.counts().destroyed>=3);assert.ok(h.counts().canvasDestroyed>=3);
});
function topologySpec(id,diagram){return {page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},sections:[section('main','Main',diagram)]}};}
function topologyFixture(){
  const provider=topologySpec('provider',{nodes:{a:{title:'Frozen A'},b:{title:'B'}},rows:[['a','b']],edges:[{from:'a',to:'b'}],topologyExports:{public:{nodes:['a','b'],edges:['a->b']}}});
  const current=topologySpec('consumer',{nodes:{local:{title:'Before'}},rows:[['local']],topologyImports:[{spec:'provider',export:'public',as:'child'}],topologyExports:{nested:{nodes:['child::a','child::b'],edges:['child::a->child::b']}}});
  const proposed=plain(current);proposed.page.sections[0].diagram.nodes.local.title='After';
  return {provider,current,proposed,context:{version:1,id:'consumer',specs:[provider,current]}};
}
test('review resolves imports and re-exports with the frozen session while preserving authored source and change model',()=>{
  const f=topologyFixture(),current=JSON.stringify(f.current,null,4)+'\n',source=JSON.stringify(f.proposed,null,2)+'\n';
  const h=uiHarness({topology:true,current,source,context:f.context}),e=h.elements;
  f.provider.page.sections[0].diagram.nodes.a.title='Later provider edit';
  const modelInputs=[],changes=h.c.workbenchAgentReviewChanges;
  h.c.workbenchAgentReviewChanges=(a,b)=>{modelInputs.push(plain([a,b]));return changes(a,b);};
  h.ui.update(h.review);e['agent-update-open'].fire('click');
  assert.equal(h.counts().rendered,1);assert.equal(e['agent-update-commit'].disabled,false);
  assert.equal(h.pages[0].sections[0].diagram.nodes['child::a'].title,'Frozen A');
  assert.equal(e['agent-update-source'].value,source);
  assert.deepEqual(modelInputs[0][1].sections[0].diagram.topologyImports,f.proposed.page.sections[0].diagram.topologyImports);
  assert.equal(modelInputs[0][1].sections[0].diagram.nodes['child::a'],undefined,'change model compares authored nodes');
  e['agent-update-current'].fire('click');assert.equal(e['agent-update-commit'].disabled,true);assert.equal(e['agent-update-source'].value,current);
  assert.equal(h.pages[1].sections[0].diagram.nodes.local.title,'Before');assert.equal(h.pages[1].sections[0].diagram.nodes['child::a'].title,'Frozen A');
  e['agent-update-proposed'].fire('click');assert.equal(e['agent-update-commit'].disabled,false);assert.equal(h.pages[2].sections[0].diagram.nodes.local.title,'After');
  e['agent-update-commit'].fire('click');assert.deepEqual(h.accepted,[{version:1,source}]);
  assert.equal(h.snapshot.current,current);assert.equal(h.snapshot.source,source);assert.equal(h.session.text(),current);h.ui.destroy();
});
test('review resolves local exports without a Canon context and still requires an approved review',()=>{
  const f=topologyFixture(),source=JSON.stringify(f.provider);
  for(const ok of [true,false]){
    const h=uiHarness({topology:true,current:source,source,ok});h.ui.update(h.review);h.ui.open();
    assert.equal(h.counts().rendered,1);assert.equal(h.elements['agent-update-commit'].disabled,!ok);
    assert.equal(h.elements['agent-update-source'].value,source);h.ui.destroy();
  }
});
test('invalid topology, missing frozen context and missing resolver fail visibly without enabling Commit',()=>{
  const f=topologyFixture(),invalid=plain(f.provider);invalid.page.sections[0].diagram.topologyExports.public.nodes.push('missing');
  for(const options of [
    {current:JSON.stringify(invalid),source:JSON.stringify(invalid)},
    {current:JSON.stringify(f.current),source:JSON.stringify(f.proposed)},
    {current:JSON.stringify(f.provider),source:JSON.stringify(f.provider),omitResolver:true}
  ]){
    const h=uiHarness({topology:true,...options}),e=h.elements;h.ui.update(h.review);h.ui.open();
    for(const side of ['proposed','current']){
      e['agent-update-'+side].fire('click');assert.match(e['agent-update-view'].textContent,/Could not render this preview: .+/);
      assert.equal(e['agent-update-commit'].disabled,true);e['agent-update-commit'].fire('click');
    }
    assert.equal(h.counts().rendered,0);assert.deepEqual(h.accepted,[]);h.ui.destroy();
  }
});
