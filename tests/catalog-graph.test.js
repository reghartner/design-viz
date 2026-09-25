'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {entrypoint}=require('../tools/source-loader.cjs');
const B={URL};vm.runInNewContext(entrypoint('workbench').body,B);
const plain=value=>JSON.parse(JSON.stringify(value));
const ref=name=>'component:default/'+name;
const catalog=()=>({version:1,services:[
  {entityRef:ref('camera'),title:'Camera',dependsOn:[ref('recording'),ref('outside')],consumesApis:['api:default/recording','api:default/notify'],apis:[]},
  {entityRef:ref('recording'),title:'Recording',apis:[{entityRef:'api:default/recording',title:'Recording API'}]},
  {entityRef:ref('notify'),title:'Notifications',apis:[{entityRef:'api:default/notify',title:'Notify API'}]},
  {entityRef:ref('outside'),title:'Outside scope',apis:[]}
]});

test('catalog seed scopes and deduplicates declared dependencies and API provider edges',()=>{
  const raw=catalog(),before=JSON.stringify(raw);
  const seed=plain(B.catalogGraphSeed(raw,[ref('camera'),ref('recording'),ref('notify')],true));
  assert.equal(seed.created,3);assert.equal(seed.edges,2);
  assert.equal(seed.diagram.routing,undefined);assert.notEqual(B.layout(seed.diagram).routing,'lanes');
  assert.deepEqual(seed.diagram.edges,[{from:'camera-1',to:'recording-1',kind:'catalog',label:'depends on'},{from:'camera-1',to:'notify-1',kind:'catalog',label:'uses Notify API'}]);
  assert.deepEqual(seed.diagram.rows,[['camera-1','recording-1','notify-1']]);
  assert.equal(seed.diagram.nodes['camera-1'].binding.entityRef,ref('camera'));
  assert.equal(seed.diagram.nodes['outside-1'],undefined);assert.deepEqual(seed.diagram.steps,[]);
  assert.deepEqual(plain(B.validate(B.normalize({page:{title:'Catalog',blocks:[{heading:'Services',diagram:seed.diagram}]}}))).errors,[]);
  assert.equal(JSON.stringify(raw),before);
  assert.equal(B.catalogGraphSeed(raw,[ref('camera'),ref('recording')],false).edges,0);
});

test('add reuses service identity, preserves authored data and formats only the target diagram',()=>{
  const existing={nodes:{existing:{title:'Authored',binding:{entityRef:ref('camera').toUpperCase()}},'recording-1':{title:'Something else'}},
    rows:[['existing','recording-1']],steps:[{text:'Keep this step',nodes:['existing']}],panels:[{id:'q',type:'queue'}]};
  const raw={page:{title:'Unchanged formatting',blocks:[{diagram:{nodes:{z:{}},rows:[['z']]}},{tabs:[{label:'Services',sections:[{diagram:existing}]}]}]}};
  const text=JSON.stringify(raw,null,2).replace('"title":','"title" :');
  const plan=B.planCatalogGraph(text,raw,1,catalog(),[ref('camera'),ref('recording')],true);
  assert.ok(!plan.error,plan.error);const d=JSON.parse(plan.text).page.blocks[1].tabs[0].sections[0].diagram;
  assert.equal(d.nodes.existing.title,'Authored');assert.deepEqual(d.steps,existing.steps);assert.deepEqual(d.panels,existing.panels);
  assert.equal(JSON.parse(plan.text).page.protocols.catalog.label,'Catalog relationship');
  assert.deepEqual(d.rows,[['existing','recording-1'],['recording-2']]);assert.equal(d.edges[0].from,'existing');
  assert.ok(plan.text.includes('"title" :'));assert.deepEqual(raw.page.blocks[1].tabs[0].sections[0].diagram,existing);
  assert.match(B.planCatalogGraph(plan.text,JSON.parse(plan.text),1,catalog(),[ref('camera'),ref('recording')],true).error,/already/);
});

test('cycle and disconnected nodes survive dependency ordering, with at most four cards per row',()=>{
  const services=Array.from({length:10},(_,i)=>({entityRef:ref('svc'+i),dependsOn:i<2?[ref('svc'+(1-i))]:[],apis:[]}));
  const seeded=B.catalogGraphSeed({version:1,services},services.map(s=>s.entityRef),true);
  assert.equal(seeded.edges,2);assert.equal(new Set(seeded.diagram.rows.flat()).size,10);
  assert.ok(seeded.diagram.rows.every(row=>row.length<=4));
});

test('invalid or stale selection refuses without a partial source edit',()=>{
  assert.throws(()=>B.catalogGraphSeed(catalog(),[ref('missing')],true),/no longer/);
  assert.throws(()=>B.catalogGraphSeed(catalog(),[],true),/Select/);
  const raw=catalog();raw.services[0].dependsOn=['recording'];assert.throws(()=>B.FlowCanon.catalog(raw),/fully qualified/);
  raw.services[0].dependsOn='recording';assert.throws(()=>B.FlowCanon.catalog(raw),/array/);
  const duplicate=catalog();duplicate.services.push({...duplicate.services[0],entityRef:ref('camera').toUpperCase()});
  assert.throws(()=>B.catalogGraphSeed(duplicate,[ref('camera')],true),/duplicate/);
});

test('catalog legend preserves custom protocols and works with a bare diagram',()=>{
  const d={nodes:{},rows:[[]],edges:[]},refs=[ref('camera'),ref('recording')];
  const raw={protocols:{catalog:{label:'Authored protocol',color:'#123456'}},sections:[{diagram:d}]};
  const plan=B.planCatalogGraph(JSON.stringify(raw),raw,0,catalog(),refs,true),after=JSON.parse(plan.text);
  assert.deepEqual(after.protocols.catalog,raw.protocols.catalog);assert.equal(after.sections[0].diagram.edges[0].kind,'catalog-1');
  assert.equal(after.protocols['catalog-1'].label,'Catalog relationship');
  const bare=B.planCatalogGraph(JSON.stringify(d),d,0,catalog(),refs,true),page=B.normalize(JSON.parse(bare.text));
  assert.equal(page.protocols.catalog.label,'Catalog relationship');assert.deepEqual(plain(B.validate(page)),{errors:[],warnings:[]});
});

test('adding catalog services retains explicitly authored routing',()=>{
  for(const routing of ['curves','lanes']){
    const existing={routing,nodes:{authored:{title:'Existing'}},rows:[['authored']]};
    const before=JSON.stringify(existing);
    const added=B.catalogGraphSeed(catalog(),[ref('camera'),ref('recording')],true,existing);
    assert.equal(added.diagram.routing,routing);assert.equal(JSON.stringify(existing),before);
  }
});
