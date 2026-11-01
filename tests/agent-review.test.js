'use strict';
/* Agent-update preview dialog (src/workbench/agent-review.js). Since #848 the
   dialog mounts the shared side-by-side compare view (src/viewer/compare-view.js)
   with both resolved documents and the shared engine's change list (#847). The
   component's own rendering, rail, navigation and framing are covered in the
   browser by tools/browser-tests/tests/compare-view.spec.mjs; here a recording
   stand-in proves what the dialog hands it and that the dialog's own controls
   (Accept, Decline, refresh/stale gating, Details, skins, clipboard) behave. */
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readSource}=require('../tools/source-loader.cjs');
const plain=value=>JSON.parse(JSON.stringify(value));
function section(id,heading,diagram,extra={}){return {id,heading,diagram,...extra};}
function mounted(h,i=0){if(i<0)i=h.mounts.length+i;assert.ok(h.mounts[i],'the dialog mounts the shared compare view (#848)');return h.mounts[i];}
function uiHarness(options={}){
  /* The trailing ids are the pre-#848 single-pane controls: present so the
     dialog code from before #848 initializes and every test fails on its own
     assertion rather than on setup. */
  const ids=['position','previous','next','banner','dialog','compare','commit','source','source-before','ledger','ledger-summary','ledger-before','ledger-before-summary','summary','note','note-text','issues','feedback','ledger-panel','close','open','banner-title','banner-summary','discard','copy-feedback','return','details','details-panel','details-close','review-refresh','change-added','change-removed','change-modified','change-status','changes-panel','changes','changes-close','change-list','view','scroll','current','proposed','highlights'];
  function element(id){
    const listeners={},classes=new Set(),attrs={};return {id,children:[],hidden:false,open:false,textContent:'',value:'',disabled:false,attrs,listeners,
      classList:{toggle(name,on){if(on)classes.add(name);else classes.delete(name);},contains:name=>classes.has(name)},
      addEventListener(type,fn){(listeners[type]||(listeners[type]=[])).push(fn);},removeEventListener(type,fn){listeners[type]=(listeners[type]||[]).filter(v=>v!==fn);},
      fire(type,event={preventDefault(){}}){(listeners[type]||[]).slice().forEach(fn=>fn.call(this,event));},setAttribute(k,v){attrs[k]=String(v);},getAttribute(k){return attrs[k]??null;},
      toggleAttribute(k,on){if(on)attrs[k]='';else delete attrs[k];},removeAttribute(k){delete attrs[k];},appendChild(node){this.children.push(node);},replaceChildren(){this.children=[];},querySelectorAll(){return [];},focus(){this.focused=true;},select(){},
      closest(){return null;},showModal(){this.open=true;},close(){this.open=false;}};
  }
  const elements={};ids.forEach(id=>elements['agent-update-'+id]=element(id));
  const doc={body:element('body'),createElement:element,defaultView:{},getElementById:id=>elements[id]};let snapshot;
  const mounts=[],accepted=[],rejected=[];
  const c={document:doc,navigator:{clipboard:options.clipboard || {}},
    workbenchReaderPreviewSnapshot:()=>({}),restoreWorkbenchReaderPreviewSnapshot:()=>({matches:new Map()}),restoreWorkbenchReaderCameras:()=>{},
    applySkinClasses:()=>true,initViewerExploreCanvas:()=>({destroy(){}}),renderPage:()=>({sections:[],destroy(){}}),
    /* Recording stand-in for the shared component. */
    mountCompareView(host,opts){
      const m={host,opts:plain({before:opts.before,after:opts.after,entries:opts.entries,ids:opts.ids}),live:opts,destroyed:false,skins:[],selected:opts.entries.length?0:-1};/* like the real view: first change selected */
      mounts.push(m);
      return {select(i){m.selected=i;if(opts.onSelect)opts.onSelect(opts.entries[i],i,{before:{shown:true},after:{shown:true}});return {};},
        next(){return this.select(m.selected+1);},previous(){return this.select(m.selected-1);},selected:()=>m.selected,count:()=>opts.entries.length,
        label:i=>'label '+i,errors:()=>(options.renderErrors || []).slice(),setSkin(name){m.skins.push(name);return true;},destroy(){m.destroyed=true;host.replaceChildren();}};
    }};
  vm.createContext(c);
  for(const file of ['validator.js','workbench/lifetime.js','workbench/agent-review.js'])vm.runInContext(readSource(file),c);
  let session;
  if(options.topology){
    vm.runInContext(readSource('canon.js'),c);vm.runInContext(readSource('workbench/session.js'),c);
    let text=options.current;
    session=c.createBuilderSession({source:{read:()=>text,write:value=>text=value},persistence:{read:()=>({}),preserve(){},cancel(){},save(){}},render(){}});
    session.replaceProject(text,null,{topologyContext:options.context});
  }
  const current=JSON.stringify({sections:[section('one','One',{nodes:{a:{title:'A'}},rows:[['a']]})]}),source=JSON.stringify({sections:[section('one','One',{nodes:{a:{title:'Changed'}},rows:[['a']]})]});
  snapshot={current,source,currentLedger:'old',ledger:'new',review:{version:1,id:'p',requestId:'r',ok:true,summary:'Changed A',conflicts:[]}};
  if(options.current)snapshot.current=options.current;if(options.source)snapshot.source=options.source;
  if(options.ok===false)snapshot.review.ok=false;
  if(options.ledgers){snapshot.currentLedger=options.ledgers[0];snapshot.ledger=options.ledgers[1];}
  const ui=c.initWorkbenchAgentReview({document:doc,resolve:session && !options.omitResolver?session.resolve:(options.topology?undefined:raw=>raw),skin:options.skin,snapshot:()=>snapshot,accept:async version=>accepted.push({version,source:snapshot.source}),reject:async(message,version)=>rejected.push({message,version})});
  return {c,ui,elements,mounts,accepted,rejected,get snapshot(){return snapshot;},replaceSnapshot(next){snapshot=next;},session,review:snapshot.review};
}

test('opening mounts one side-by-side compare view with both documents, the engine entries and the dialog pane ids',()=>{
  const h=uiHarness(),e=h.elements;h.ui.update(h.review);e['agent-update-open'].fire('click');
  const m=mounted(h);assert.equal(h.mounts.length,1);
  assert.equal(m.host,e['agent-update-compare'],'mounted into #agent-update-compare');
  assert.equal(m.opts.before.sections[0].diagram.nodes.a.title,'A');assert.equal(m.opts.after.sections[0].diagram.nodes.a.title,'Changed');
  const side=text=>({authored:h.c.normalize(JSON.parse(text)),resolved:h.c.normalize(JSON.parse(text))});
  assert.deepEqual(m.opts.entries,plain(h.c.compareDocuments({...side(h.snapshot.current),ledger:'old'},{...side(h.snapshot.source),ledger:'new'})),'entries are exactly the shared engine output');
  assert.deepEqual(m.opts.ids,{before:{scroll:'agent-update-scroll-before',view:'agent-update-view-before'},after:{scroll:'agent-update-scroll',view:'agent-update-view'}});
  assert.equal(e['agent-update-commit'].disabled,false,'Accept needs no side selection');
  assert.equal(e['agent-update-source'].value,h.snapshot.source);assert.equal(e['agent-update-source-before'].value,h.snapshot.current);
  assert.equal(e['agent-update-ledger'].textContent,'new');assert.equal(e['agent-update-ledger-before'].textContent,'old');
  assert.equal(e['agent-update-ledger-before-summary'].textContent,'Coverage ledger · Current state');assert.equal(e['agent-update-ledger-summary'].textContent,'Coverage ledger · Changed in this update');
  e['agent-update-close'].fire('click');assert.equal(m.destroyed,true,'closing destroys the compare view');
  e['agent-update-open'].fire('click');assert.equal(h.mounts.length,2,'each opening mounts a fresh view');
  h.ui.destroy();assert.equal(mounted(h,1).destroyed,true);
});
test('change counts and Prev/Next drive the mounted view; Details and Escape keep the view mounted',()=>{
  const h=uiHarness(),e=h.elements;h.ui.update(h.review);h.ui.open();
  const side=(text,ledger)=>({authored:h.c.normalize(JSON.parse(text)),resolved:h.c.normalize(JSON.parse(text)),ledger});
  const expected=h.c.compareDocuments(side(h.snapshot.current,'old'),side(h.snapshot.source,'new'));assert.ok(expected.length>=2,'precondition: node and ledger changes');
  const counts={added:0,removed:0,modified:0};expected.forEach(x=>counts[x.status]++);
  assert.equal(e['agent-update-change-modified'].textContent,counts.modified+' modified');assert.equal(e['agent-update-change-added'].textContent,counts.added+' added');assert.equal(e['agent-update-change-removed'].textContent,counts.removed+' removed');
  assert.equal(e['agent-update-details-panel'].hidden,true);e['agent-update-details'].fire('click');assert.equal(e['agent-update-details-panel'].hidden,false);
  e['agent-update-dialog'].fire('cancel');assert.equal(e['agent-update-details-panel'].hidden,true);assert.equal(e['agent-update-dialog'].open,true,'Escape dismisses Details first');
  e['agent-update-next'].fire('click');assert.equal(h.mounts[0]?.selected,1,'Next moves the mounted view to the second change');
  e['agent-update-previous'].fire('click');assert.equal(h.mounts[0]?.selected,0,'Previous moves it back');
  assert.equal(h.mounts.length,1,'Details never remounts the view');h.ui.destroy();
});
test('selecting a ledger or document change opens Details on the matching field; a non-rendered target says so',()=>{
  const h=uiHarness(),e=h.elements;h.ui.update(h.review);h.ui.open();
  assert.equal(typeof h.mounts[0]?.live.onSelect,'function','the dialog hands the compare view a selection callback');const live=h.mounts[0].live;
  const ledger=live.entries.findIndex(x=>x.kind==='ledger');assert.ok(ledger>=0,'precondition: ledger change');
  live.onSelect(live.entries[ledger],ledger,{before:{shown:false},after:{shown:false}});
  assert.equal(e['agent-update-details-panel'].hidden,false);assert.equal(e['agent-update-ledger'].focused,true);assert.match(e['agent-update-position'].textContent,/Coverage ledger/);
  const node=live.entries.findIndex(x=>x.kind==='node');
  live.onSelect(live.entries[node],node,{before:{shown:false,reason:'view'},after:{shown:false,reason:'view'}});
  assert.match(e['agent-update-position'].textContent,/not included in a View/);assert.equal(e['agent-update-source'].focused,true);
  live.onSelect({...live.entries[node],status:'removed',afterPath:null},node,{before:{shown:true},after:{shown:false}});assert.match(e['agent-update-position'].textContent,/not in the proposal/);
  live.onSelect({...live.entries[node],status:'added',beforePath:null},node,{before:{shown:false},after:{shown:true}});assert.match(e['agent-update-position'].textContent,/not in the current document/);
  h.ui.destroy();
});
test('the review uses the selected site skin and updates it live without remounting',()=>{
  const h=uiHarness({skin:()=> 'terminal'});h.ui.update(h.review);h.ui.open();
  assert.equal(typeof h.mounts[0]?.live.skin,'function','the site skin is handed to the compare view');assert.equal(h.mounts[0].live.skin(h.mounts[0].live.after),'terminal');
  assert.equal(h.ui.setSkin('rose'),true);assert.deepEqual(h.mounts[0].skins,['rose'],'a live skin change reaches the compare view');assert.equal(h.mounts.length,1);h.ui.destroy();
});
test('close and Escape keep a proposal pending, decline rejects it, and a refreshed version needs fresh review',()=>{
  const h=uiHarness(),e=h.elements;h.ui.update(h.review);h.ui.open();
  e['agent-update-close'].fire('click');assert.deepEqual(h.rejected,[]);h.ui.open();
  e['agent-update-dialog'].fire('cancel');assert.deepEqual(h.rejected,[]);h.ui.open();
  e['agent-update-details'].fire('click');h.replaceSnapshot({...h.snapshot,review:{...h.snapshot.review,version:2},source:h.snapshot.source.replace('Changed','Refreshed')});h.ui.update(h.snapshot.review);
  assert.equal(e['agent-update-details-panel'].hidden,false,'refresh preserves the open details drawer');
  assert.equal(h.mounts.at(-1)?.opts.after.sections[0].diagram.nodes.a.title,'Refreshed','the refreshed proposal is remounted');
  assert.equal(e['agent-update-review-refresh'].hidden,false);assert.equal(e['agent-update-commit'].disabled,true);
  e['agent-update-commit'].fire('click');assert.deepEqual(h.accepted,[],'the newly refreshed version cannot be accepted as the old review');
  e['agent-update-review-refresh'].fire('click');assert.equal(e['agent-update-commit'].disabled,false);e['agent-update-commit'].fire('click');
  assert.deepEqual(h.accepted,[{version:2,source:h.snapshot.source}]);h.ui.destroy();
  const decline=uiHarness();decline.ui.update(decline.review);decline.ui.open();decline.elements['agent-update-discard'].fire('click');
  assert.deepEqual(decline.rejected,[{message:null,version:1}]);decline.ui.destroy();
});
test('clipboard denial keeps conflict revision actions mounted and exposes manual-copy help',async()=>{
  const h=uiHarness({ok:false,clipboard:{writeText:()=>Promise.reject(Error('denied'))}}),e=h.elements;h.ui.update(h.review);h.ui.open();
  e['agent-update-copy-feedback'].fire('click');await new Promise(resolve=>setImmediate(resolve));
  assert.equal(e['agent-update-note'].hidden,false);assert.match(e['agent-update-note-text'].textContent,/Press .*C .* to copy the feedback/);
  assert.equal(e['agent-update-review-refresh'].hidden,true);assert.deepEqual(h.rejected,[]);h.ui.destroy();
});
function topologySpec(id,diagram){return {page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},sections:[section('main','Main',diagram)]}};}
function topologyFixture(){
  const provider=topologySpec('provider',{nodes:{a:{title:'Frozen A'},b:{title:'B'}},rows:[['a','b']],edges:[{from:'a',to:'b'}],topologyExports:{public:{nodes:['a','b'],edges:['a->b']}}});
  const current=topologySpec('consumer',{nodes:{local:{title:'Before'}},rows:[['local']],topologyImports:[{spec:'provider',export:'public',as:'child'}],topologyExports:{nested:{nodes:['child::a','child::b'],edges:['child::a->child::b']}}});
  const proposed=plain(current);proposed.page.sections[0].diagram.nodes.local.title='After';
  return {provider,current,proposed,context:{version:1,id:'consumer',specs:[provider,current]}};
}
test('both sides are resolved with the frozen session; the mounted entries are the engine result, including imported changes',()=>{
  const f=topologyFixture(),current=JSON.stringify(f.current,null,4)+'\n',source=JSON.stringify(f.proposed,null,2)+'\n';
  const h=uiHarness({topology:true,current,source,context:f.context}),e=h.elements;
  f.provider.page.sections[0].diagram.nodes.a.title='Later provider edit';
  const modelInputs=[],changes=h.c.compareDocuments;
  const sentinel={kind:'node',status:'modified',origin:'imported',cause:'provider',beforePath:'sections[0].diagram.topologyImports[0]',afterPath:'sections[0].diagram.topologyImports[0]',
    section:{before:0,after:0},key:{before:'child::b',after:'child::b'},
    fields:[{beforePath:'resolved:sections[0].diagram.nodes["child::b"].title',afterPath:'resolved:sections[0].diagram.nodes["child::b"].title',before:'B',after:'Sentinel B'}],effects:[]};
  h.c.compareDocuments=(a,b)=>{modelInputs.push(plain([a,b]));return changes(a,b).concat([sentinel]);};
  h.ui.update(h.review);e['agent-update-open'].fire('click');
  assert.equal(h.mounts[0]?.opts.before.sections[0].diagram.nodes['child::a']?.title,'Frozen A','the Before side is resolved with the frozen session');const m=h.mounts[0];assert.equal(e['agent-update-commit'].disabled,false);assert.equal(m.opts.before.sections[0].diagram.nodes.local.title,'Before');
  assert.equal(m.opts.after.sections[0].diagram.nodes['child::a'].title,'Frozen A');assert.equal(m.opts.after.sections[0].diagram.nodes.local.title,'After');
  assert.deepEqual(modelInputs[0][1].authored.sections[0].diagram.topologyImports,f.proposed.page.sections[0].diagram.topologyImports,'authored side keeps import declarations');
  assert.equal(modelInputs[0][1].resolved.sections[0].diagram.nodes['child::a'].title,'Frozen A');assert.equal(modelInputs[0][0].resolved.sections[0].diagram.nodes['child::a'].title,'Frozen A');
  assert.deepEqual(m.opts.entries.at(-1),plain(sentinel),'the mounted list is the engine result');
  e['agent-update-commit'].fire('click');assert.deepEqual(h.accepted,[{version:1,source}]);
  assert.equal(h.snapshot.current,current);assert.equal(h.session.text(),current);h.ui.destroy();
});
test('local exports resolve without a Canon context and Accept still requires an approved review',()=>{
  const f=topologyFixture(),source=JSON.stringify(f.provider);
  for(const ok of [true,false]){
    const h=uiHarness({topology:true,current:source,source,ok});h.ui.update(h.review);h.ui.open();
    assert.equal(h.mounts.length,1);assert.equal(h.elements['agent-update-commit'].disabled,!ok);
    assert.equal(h.elements['agent-update-source'].value,source);h.ui.destroy();
  }
});
test('invalid topology, missing frozen context and missing resolver fail visibly without mounting or enabling Accept',()=>{
  const f=topologyFixture(),invalid=plain(f.provider);invalid.page.sections[0].diagram.topologyExports.public.nodes.push('missing');
  for(const options of [
    {current:JSON.stringify(invalid),source:JSON.stringify(invalid)},
    {current:JSON.stringify(f.current),source:JSON.stringify(f.proposed)},
    {current:JSON.stringify(f.provider),source:JSON.stringify(f.provider),omitResolver:true}
  ]){
    const h=uiHarness({topology:true,...options}),e=h.elements;h.ui.update(h.review);h.ui.open();
    assert.match(e['agent-update-compare'].textContent,/Could not render this preview: .+/);assert.equal(h.mounts.length,0);
    assert.equal(e['agent-update-commit'].disabled,true);e['agent-update-commit'].fire('click');assert.deepEqual(h.accepted,[]);h.ui.destroy();
  }
});
test('a ledger-only proposal lists one change; stale replacement remounts with no changes and gates Accept',()=>{
  const h=uiHarness({source:JSON.stringify({sections:[section('one','One',{nodes:{a:{title:'A'}},rows:[['a']]})]})}),e=h.elements;
  h.ui.update(h.review);h.ui.open();assert.deepEqual(h.mounts[0]?.opts.entries.map(x=>x.kind),['ledger'],'one ledger change is handed to the compare view');assert.equal(e['agent-update-next'].disabled,false);
  h.replaceSnapshot({...h.snapshot,ledger:h.snapshot.currentLedger,review:{...h.review,version:2}});h.ui.update(h.snapshot.review);
  assert.deepEqual(h.mounts.at(-1)?.opts.entries,[],'the stale replacement remounts with no changes');assert.equal(h.mounts[0].destroyed,true);
  assert.equal(e['agent-update-next'].disabled,true);assert.equal(e['agent-update-commit'].disabled,true);assert.deepEqual(h.accepted,[]);h.ui.destroy();
});

test('a pane that fails to render keeps Accept disabled and says which side failed (#848 diff review 2)',()=>{
  const h=uiHarness({renderErrors:[{side:'before',message:'boom'}]}),e=h.elements;h.ui.update(h.review);e['agent-update-open'].fire('click');
  mounted(h);
  assert.equal(e['agent-update-commit'].disabled,true,'Accept stays disabled while a side cannot be reviewed');
  assert.match(e['agent-update-position'].textContent,/Before could not be rendered: boom/);
  const ok=uiHarness(),o=ok.elements;ok.ui.update(ok.review);o['agent-update-open'].fire('click');
  assert.equal(o['agent-update-commit'].disabled,false,'precondition: without a render error Accept is enabled');
});
