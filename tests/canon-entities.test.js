const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const C=require('../tools/canon/core.cjs');
const vm=require('node:vm');
const ref='component:home/recording',apiRef='api:home/recording';
function diagram(){return {nodes:{hub:{title:'Caller'},cloud:{title:'Recording',binding:{entityRef:ref,api:{entityRef:apiRef}}},db:{title:'Store'}},rows:[['hub','cloud','db']],edges:[{from:'hub',to:'cloud',kind:'https'},{from:'cloud',to:'db',kind:'https'}],steps:[{id:'request',title:'Request',edge:'hub->cloud'},{id:'save',title:'Save',edge:'cloud->db'},{id:'failure',title:'Cannot deliver',failures:{'hub->cloud':'dropped'}}],paths:[{id:'happy',label:'Happy path',steps:['request','save']},{id:'failed',label:'Dropped signal',steps:['request','failure']}]};}
function spec(id='flow'){
  return {page:{title:'Flow '+id,canon:{version:1,id,kind:'canonical',owner:'group:home/team'},blocks:[
    {heading:'Delivery',text:['Prose before the diagram.']},
    {tabs:[{label:'Flow',sections:[{heading:'Delivery',diagram:diagram()}]},{label:'Second',sections:[{heading:'123',diagram:diagram()}]}]}
  ]}};
}

test('entity index derives exact service/API associations across tabs and duplicate headings without duplicate diagrams',async()=>{
  const {buildEntityDiagramIndex,diagramsForEntity}=await import('../tools/canon/entity-diagrams.mjs');
  const raw=spec(),design=spec('design');design.page.canon.kind='design';
  raw.page.blocks[1].tabs[0].sections[0].diagram.nodes.hub.binding={entityRef:'COMPONENT:HOME/RECORDING'};
  const index=buildEntityDiagramIndex([raw,design],{publicBaseUrl:'https://flows.example.test/view'});
  const result=diagramsForEntity(index,'Component:Home/Recording');
  assert.equal(result.entityRef,ref);assert.equal(result.diagrams.length,2);
  const flow=result.diagrams.find(d=>d.id==='flow');assert.equal(flow.sections.length,2);assert.equal(flow.sections[0].nodes.length,2);
  assert.equal(flow.sections[0].reference,'delivery-2');assert.equal(flow.sections[1].reference,'section-123');
  assert.equal(diagramsForEntity(index,apiRef).diagrams.length,2);
  assert.equal(diagramsForEntity(index,'component:default/recording').diagrams.length,0);
  assert.equal(diagramsForEntity(index,'component:home/Recording-other').diagrams.length,0);
  assert.throws(()=>diagramsForEntity(index,'recording'),/full entity reference/);
  assert.throws(()=>buildEntityDiagramIndex([raw],{publicBaseUrl:'https://user:pass@example.test'}),/base URL/);
  assert.deepEqual(raw.page.blocks[1].tabs[0].sections[0].diagram.paths[1].steps,['request','failure'],'indexing does not mutate authored paths');
});

test('service step links select the correct alternate and include both ends of failed communications',async()=>{
  const {buildEntityDiagramIndex,diagramsForEntity}=await import('../tools/canon/entity-diagrams.mjs');
  const section=diagramsForEntity(buildEntityDiagramIndex([spec()],{publicBaseUrl:'https://flows.example.test'}),ref).diagrams[0].sections[0];
  assert.deepEqual(section.paths.map(p=>p.id),['happy','failed']);
  assert.deepEqual(section.paths[1].steps.map(s=>s.id),['request','failure']);
  const url=new URL(section.paths[1].steps[1].url),hash=new URLSearchParams(url.hash.slice(1));
  assert.equal(hash.get('d'),'delivery-2');assert.equal(hash.get('p'),'failed');assert.equal(hash.get('s'),'failure');assert.equal(hash.get('m'),'step');
  assert.equal(new URL(url.searchParams.get('spec')).pathname,'/api/canon/specs/flow');
  assert.equal(section.paths[1].steps[1].position,2);
});

test('a real entity link passes through shared core and the native mount to a wholly hidden alternate',async()=>{
  const {buildEntityDiagramIndex,diagramsForEntity}=await import('../tools/canon/entity-diagrams.mjs');
  const raw=spec(),d=raw.page.blocks[1].tabs[0].sections[0].diagram;
  d.paths[1].steps=['failure'];
  d.layouts=[{id:'business',name:'Business',steps:['save'],sectionLayout:{default:[{x:0,y:0,w:12,h:12}]}}];
  d.defaultLayout='business';
  const core=C.viewerRouting(),before=JSON.stringify(raw);
  const section=diagramsForEntity(buildEntityDiagramIndex([raw],{publicBaseUrl:'https://flows.example.test'}),ref).diagrams[0].sections[0];
  const alternate=section.paths.find(p=>p.id==='failed');
  const target=core.parseHash(new URL(alternate.steps[0].url).hash);
  assert.equal(target.d,'delivery-2');
  assert.deepEqual(core.diagramLayoutViews(d)[0].steps,['save']);
  const jumps=[],pathSelections=[],tabSelections=[];
  const stepper={path:()=> 'happy',jumpSource(index,path){jumps.push([index,path]);return true;},
    selectPath(path){pathSelections.push(path);return false;}};
  let destroyed=false,scrolled=0;
  const controller={sections:core.sectionRecords(raw.page).map(record=>({...record,
      stepper:record.section.diagram?stepper:null,sectionEl:{scrollIntoView(){scrolled++;}}})),
    tabBlocks:[{select(...args){tabSelections.push(args);}}],steppers:[],destroy(){destroyed=true;}};
  const view={querySelectorAll:()=>[]};
  const environment={body:{appendChild(){}},root:{},fontsReady:Promise.resolve(),listen(){},resources(){},destroy(){this.disposed=true;}};
  const context={document:{createElement:()=>view},ResizeObserver:class {observe(){}},
    normalize:core.normalize,validate:C.validateSpec,sectionRecords:core.sectionRecords,
    resolveSourceStep:core.resolveSourceStep,resolveSkin:()=> 'pastel',
    applySkinClasses(){},FlowCanon:C,renderPage:()=>controller};
  vm.runInNewContext(await fs.readFile(path.join(__dirname,'../src/native/mount.js'),'utf8'),context);
  const viewer=context.mountNativeSpec(environment,raw,{});
  viewer.navigate({section:target.d,path:target.p,step:target.s});
  assert.deepEqual(jumps,[[2,'failed']],'host jumps to the original source index, not the path position or visible stop');
  assert.deepEqual(pathSelections,[],'a hidden alternate must not be selected before the exact preview');
  assert.deepEqual(tabSelections,[[0,false,false]]);
  assert.equal(scrolled,1);
  assert.throws(()=>viewer.navigate({section:target.d,path:'failed'}),/no visible steps/);
  assert.deepEqual(pathSelections,['failed']);
  assert.equal(destroyed,false);
  assert.equal(JSON.stringify(raw),before,'exact preview preserves the authored view and source');
});

test('association revisions change after binding removal, and unbound ambient diagrams do not match by title or code',async()=>{
  const {buildEntityDiagramIndex,diagramsForEntity}=await import('../tools/canon/entity-diagrams.mjs');
  const raw=spec(),before=diagramsForEntity(buildEntityDiagramIndex([raw]),ref);
  for(const section of C.sections(raw)){delete section.diagram.nodes.cloud.binding;section.diagram.nodes.cloud.title=ref;}
  const after=diagramsForEntity(buildEntityDiagramIndex([raw]),ref);
  assert.equal(after.diagrams.length,0);assert.notEqual(before.revision,after.revision);
  const ambient=spec('ambient');for(const section of C.sections(ambient)){delete section.diagram.steps;delete section.diagram.paths;}
  const found=diagramsForEntity(buildEntityDiagramIndex([ambient]),ref);
  assert.equal(found.diagrams.length,1);assert.equal(found.diagrams[0].sections[0].paths.length,0);
});

test('portal entity lists reflect approved changes and registry additions/removals without restart',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'entity-canon-'));
  await fs.cp('examples/canon',dir,{recursive:true});
  const {createCanonServer}=await import('../apps/backstage-mock/server.mjs');
  const server=await createCanonServer({registryPath:path.join(dir,'registry.json'),statePath:path.join(dir,'state.json')});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+server.address().port+'/api/canon/';
  const get=async p=>{const r=await fetch(base+p);assert.equal(r.status,200);return r.json();};
  const post=async(p,data)=>{const r=await fetch(base+p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});assert.equal(r.status,200,await r.clone().text());return r.json();};
  const lookup='entity-diagrams?entityRef='+encodeURIComponent('component:default/recording-service');
  try{
    const first=await get(lookup);assert.equal(first.diagrams.length,1);assert.equal((await get('services')).services.find(s=>s.entityRef==='component:default/recording-service').diagramCount,1);
    assert.equal((await get('specs/doorbell?revision='+first.diagrams[0].revision)).page.canon.id,'doorbell');
    assert.equal((await fetch(base+'specs/doorbell?revision=stale')).status,409);
    assert.equal((await fetch(base+'entity-diagrams?entityRef=recording-service')).status,400);
    const current=await get('context?id=doorbell'),draft=C.clone(current.spec);
    delete draft.page.sections[0].diagram.nodes.cloud.binding;
    const proposal=await post('proposals',{id:'doorbell',spec:draft,baseRevision:current.revision});
    assert.equal((await get(lookup)).diagrams.length,1,'unapproved proposals are not indexed');
    await post('decisions',{id:proposal.id,disposition:'update',reason:'Approve rebinding test'});
    assert.equal((await get(lookup)).diagrams.length,0);
    const extra=C.clone(current.spec);extra.page.canon.id='extra';extra.page.canon.kind='design';
    await fs.writeFile(path.join(dir,'specs/extra.json'),JSON.stringify(extra));
    const manifest=JSON.parse(await fs.readFile(path.join(dir,'registry.json')));manifest.diagrams.push({id:'extra',path:'specs/extra.json'});
    await fs.writeFile(path.join(dir,'registry.json'),JSON.stringify(manifest));
    const added=await get(lookup);assert.equal(added.diagrams.length,1);assert.equal(added.diagrams[0].id,'extra');assert.equal(added.diagrams[0].kind,'design');
    const viewer=new URL(added.diagrams[0].viewerUrl);assert.equal(viewer.searchParams.get('layout'),'backstage');assert.equal(new URL(added.diagrams[0].editUrl).searchParams.get('layout'),'backstage');assert.equal((await (await fetch(viewer.searchParams.get('spec'))).json()).page.canon.id,'extra');
    manifest.diagrams.pop();await fs.writeFile(path.join(dir,'registry.json'),JSON.stringify(manifest));
    assert.equal((await get(lookup)).diagrams.length,0);
    await fs.writeFile(path.join(dir,'registry.json'),'broken json');
    assert.equal((await fetch(base+lookup)).status,400,'a broken index is an error, not an empty service');
  }finally{await new Promise(r=>server.close(r));await fs.rm(dir,{recursive:true,force:true});}
});
