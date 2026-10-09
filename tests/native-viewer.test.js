'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');

test('native mount forwards host diagram routing independently of detail loading',()=>{
  let pageOptions, detailReads=0;
  const reference={spec:'recording',revision:'approved-r1',section:'storage'},
    resolveDiagramLink=value=>'https://designs.test/diagrams/'+value.spec,
    loadDetail=()=>{detailReads++;return Promise.resolve({});};
  const view={querySelectorAll:()=>[],classList:{add(){},remove(){},toggle(){}}};
  const context={
    normalize:value=>value,validate:()=>({errors:[],warnings:[]}),resolveSkin:()=>({}),
    document:{createElement:()=>view},applySkinClasses:()=>{},sectionRecords:()=>[],
    createExploreNavigation:()=>({mount(){},destroy(){}}),renderPage:(_view,_page,_skin,_backlinks,options)=>{pageOptions=options;return {sections:[]};},
    ResizeObserver:class {observe(){}},
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/native/mount.js'),'utf8')+'\nthis.mount=mountNativeSpec;',context);
  context.mount({body:{appendChild(){},classList:{toggle(){}}},listen(){},fontsReady:Promise.resolve()}, {},
    {resolveDiagramLink,loadDetail});
  assert.equal(pageOptions.resolveDiagramLink,resolveDiagramLink);
  assert.equal(pageOptions.loadDetail,loadDetail);
  assert.equal(pageOptions.resolveDiagramLink(reference),'https://designs.test/diagrams/recording');
  assert.equal(detailReads,0);
});

test('native targets select views before exact source jumps and publish the final canonical address',()=>{
  const events=[], changes=[];
  let selectedView='business',selectedPath='happy',selectedStep='persist';
  const source={steps:[{id:'2'},{id:'persist'},{id:'failure'}]};
  const section={number:1,reference:'recording',hasDiagram:true,sectionEl:{scrollIntoView(){}},
    presentation:{viewId:()=>selectedView,setView(id){events.push(['view',id]);if(!['business','operations'].includes(id))return false;selectedView=id;controller.onChange();return true;}},
    stepper:{mode:()=> 'step',path:()=>selectedPath,current:()=>({id:selectedStep,n:0}),
      selectPath(id){events.push(['path',id]);if(id==='failed' && selectedView==='business')return false;selectedPath=id;return true;},
      jumpSource(index,path){events.push(['source',index,path]);selectedPath=path;selectedStep=source.steps[index].id;controller.onChange();return true;}}};
  const controller={sections:[section],activeTarget:{kind:'page'}};
  const view={querySelectorAll:()=>[],classList:{add(){},remove(){},toggle(){}}};
  const context={normalize:value=>value,validate:()=>({errors:[],warnings:[]}),resolveSkin:()=>({}),
    document:{createElement:()=>view},applySkinClasses(){},
    sectionRecords:()=>[{reference:'recording',aliases:['old-recording'],section:{diagram:source}}],
    createExploreNavigation:()=>({mount(){},destroy(){}}),renderPage:()=>controller,ResizeObserver:class{observe(){}},
    resolveSourceStep(_source,path,step){events.push(['resolve',path,step]);return {path:{id:path},sourceIndex:source.steps.findIndex(s=>s.id===step)};}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/native/mount.js'),'utf8')+'\nthis.mount=mountNativeSpec;',context);
  const viewer=context.mount({body:{appendChild(){},classList:{toggle(){}}},listen(){},fontsReady:Promise.resolve()}, {},
    {scrollIntoView:false,onChange:value=>changes.push(JSON.parse(JSON.stringify(value)))});
  viewer.navigate({section:'old-recording',view:'operations',path:'failed',step:'failure'});
  assert.deepEqual(events,[['view','operations'],['resolve','failed','failure'],['source',2,'failed']]);
  assert.deepEqual(changes,[{section:'recording',view:'operations',path:'failed',step:'failure'}]);
  events.length=0;
  viewer.navigate({section:'recording',view:'business',path:'failed',step:'failure'});
  assert.deepEqual(events,[['view','business'],['resolve','failed','failure'],['source',2,'failed']],'hidden exact targets never preselect an empty path');
  assert.throws(()=>viewer.navigate({section:'recording',path:'failed'}),/no visible steps/);
  assert.throws(()=>viewer.navigate({section:'recording',view:'removed'}),/view is no longer/);
  viewer.navigate({section:'recording',path:'happy',step:'2'});
  assert.deepEqual(changes.at(-1),{section:'recording',view:'business',path:'happy',step:'2'});
  delete section.presentation;
  viewer.navigate({section:'recording',view:'flow',path:'happy',step:'persist'});
  assert.deepEqual(changes.at(-1),{section:'recording',view:'flow',path:'happy',step:'persist'});
  assert.throws(()=>viewer.navigate({section:'recording',view:'business'}),/view is no longer/);
});

test('native CSS maps root type selectors without altering panel names, attributes, strings or keyframes',async()=>{
  const {scopeNativeCss}=await import('../tools/native-viewer-styles.mjs');
  const css='/* body html :root { } */\n:root{--label:"body { :root }";}\n'+
    'html,body.sk-editorial .widget-body [data-body="html"]:is(body, .body){content:"body";}\n'+
    '@media(min-width:1px){body .html,#body,[body=html]{color:red}}\n'+
    '@keyframes body{from{opacity:0}to{opacity:1}}';
  assert.equal(scopeNativeCss(css),'/* body html :root { } */\n.flowview-root{--label:"body { :root }";}\n'+
    'flowview-root,flowview-root.sk-editorial .widget-body [data-body="html"]:is(flowview-root, .body){content:"body";}\n'+
    '@media(min-width:1px){flowview-root .html,#body,[body=html]{color:red}}\n'+
    '@keyframes body{from{opacity:0}to{opacity:1}}');
});

test('native instance owns delayed callbacks, observers, shared fonts and normalized listener lifetimes',async()=>{
  let next=0;const pending=new Map(),fonts=new Set(),events=new Map(),observed=new Set(),loaded=[];
  function surface(){return {childNodes:[],append(...children){this.childNodes.push(...children);},replaceChildren(){this.childNodes=[];},getElementById(){return null;},querySelectorAll(){return [];},
    addEventListener(type,fn,options){const capture=typeof options==='boolean'?options:!!options?.capture;const list=events.get(this)||[];list.push({type,fn,capture});events.set(this,list);},
    removeEventListener(type,fn,options){const capture=typeof options==='boolean'?options:!!options?.capture;events.set(this,(events.get(this)||[]).filter(e=>e.type!==type||e.fn!==fn||e.capture!==capture));}};}
  const schedule=fn=>{pending.set(++next,fn);return next;},cancel=id=>pending.delete(id);
  class Observer{constructor(fn){this.fn=fn;observed.add(this);}observe(){}disconnect(){observed.delete(this);}}
  const win=Object.assign(surface(),{setTimeout:schedule,clearTimeout:cancel,setInterval:schedule,clearInterval:cancel,requestAnimationFrame:schedule,cancelAnimationFrame:cancel,
    matchMedia(){return {matches:false};},ResizeObserver:Observer,MutationObserver:Observer,
    FontFace:class{load(){return new Promise(resolve=>loaded.push(()=>resolve(this)));}},CustomEvent:class{}});
  const doc=Object.assign(surface(),{defaultView:win,fonts:{add:font=>fonts.add(font),delete:font=>fonts.delete(font)},createElement:surface,createElementNS:surface,createComment:surface});
  const host=()=>({ownerDocument:doc,attachShadow(){return this.shadowRoot=surface();}});
  const context={};vm.runInNewContext(fs.readFileSync(require.resolve('../src/native/environment.js'),'utf8')+'\nthis.create=createNativeEnvironment;',context);
  const assets={css:'',icons:'',fonts:[{family:'Private',source:'data:',weight:400}]};
  const a=context.create(host(),assets),b=context.create(host(),assets);assert.equal(fonts.size,1);
  let calls=0;const listener=()=>calls++;
  a.window.addEventListener('resize',listener,{capture:true});a.window.addEventListener('resize',listener,true);
  assert.equal(a.resources().listeners,1);a.window.removeEventListener('resize',listener,{capture:true});assert.equal(a.resources().listeners,0);
  a.setTimeout(listener,10);a.setInterval(listener,10);a.requestAnimationFrame(listener);new a.ResizeObserver(listener).observe({});
  a.document.addEventListener('keydown',listener,true);const retiredCallbacks=[...pending.values(),...[...observed].map(o=>o.fn),...events.get(a.root).map(e=>e.fn)];
  a.destroy();a.destroy();assert.equal(fonts.size,1);assert.equal(a.root.childNodes.length,0);
  retiredCallbacks.forEach(fn=>fn({}));assert.equal(calls,0);assert.equal(pending.size,0);assert.equal(observed.size,0);
  assert.deepEqual(JSON.parse(JSON.stringify(a.resources())),{disposed:true,timeouts:0,intervals:0,frames:0,observers:0,listeners:0});
  b.destroy();assert.equal(fonts.size,0);loaded.forEach(done=>done());await b.fontsReady;assert.equal(fonts.size,0);
  a.setTimeout(listener,10);a.requestAnimationFrame(listener);assert.equal(pending.size,0);
});
