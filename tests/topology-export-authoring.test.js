'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const loader=require('../tools/source-loader.cjs');
function harness(){const c={};vm.createContext(c);vm.runInContext(loader.composeSources(['canon.js','validator.js','workbench/source-edit.js','workbench/targets.js','workbench/commands/common.js','workbench/commands/graph.js','workbench/commands/topology.js','workbench/session.js']),c);return c;}
const clone=value=>JSON.parse(JSON.stringify(value));
const fixture=()=>({page:{title:'Local',sections:[{id:'main',heading:'Main',diagram:{nodes:{a:{title:'A'},b:{title:'B'},c:{title:'C'}},rows:[['a','b','c']],edges:[{from:'a',to:'b'},{from:'b',to:'c'}]}}]}});
const diagram=raw=>raw.page.sections[0].diagram;
const node=id=>({section:0,kind:'node',id}),edge=key=>({section:0,kind:'edge',key});
const pair=[node('a'),node('b')],closed=[...pair,edge('a->b')];
test('local export create/update/rename/remove are surgical plans with exact atomic Undo/Redo',()=>{
  const c=harness(),raw=fixture(),before=JSON.stringify(raw,null,4).replace('"title": "Local"','"title"  : "Local"')+'\n';
  let text=before;const session=c.createBuilderSession({source:{read:()=>text,write:v=>text=v},persistence:{read:()=>({}),preserve(){},cancel(){},save(){}},render(){session.resolve(JSON.parse(text));}});
  session.replaceProject(before);const states=[before];
  for(const [targets,options] of [[pair,{name:'public'}],[closed,{action:'update',existingName:'public',name:'renamed'}],[closed,{action:'remove',existingName:'renamed'}]]){
    const snap=session.snapshot(),plan=c.planTopologyExport(text,snap.raw,targets,options);
    assert.equal(plan.error,undefined);assert.ok(plan.text.includes('"title"  : "Local"'));assert.ok(plan.text.endsWith('\n'));
    const next=JSON.parse(plan.text);delete diagram(next).topologyExports;assert.deepEqual(next,raw);
    assert.ok(!plan.text.includes('topologyProvenance'));assert.ok(!plan.text.includes('page.canon'));assert.equal(session.accept(plan,{snapshot:snap}),true);states.push(text);
  }
  for(let i=states.length-2;i>=0;i--){assert.equal(session.undo(),true);assert.equal(text,states[i]);}
  assert.equal(session.canUndo(),false);
  for(let i=1;i<states.length;i++){assert.equal(session.redo(),true);assert.equal(text,states[i]);}
});
test('invalid identities, closure, names, placements, source and sections never yield an edit',()=>{
  const c=harness(),raw=fixture(),text=JSON.stringify(raw);
  for(const [targets,options,pattern] of [
    [[node('a')],{name:'one'},/at least two/],
    [[edge('a->b'),edge('b->c')],{name:'edges'},/at least one/],
    [[node('a'),edge('a->b')],{name:'open'},/both endpoint/],
    [[node('a'),node('absent')],{name:'missing'},/no longer exists/],
    [[...pair,{...edge('a->b'),index:1}],{name:'moved'},/ambiguous/],
    [[node('a'),node('a')],{name:'repeat'},/unique/],
    [[node('a'),{...node('b'),section:1}],{name:'cross'},/one diagram/],
    [pair,{name:'bad name'},/Export names/],
    [pair,{name:'-bad'},/Export names/],
    [pair,{action:'update',existingName:'gone',name:'ok'},/no longer exists/]
  ]){const result=c.planTopologyExport(text,raw,targets,options);assert.match(result.error,pattern);assert.equal(result.text,undefined);}
  assert.match(c.planTopologyExport('{',raw,pair,{name:'x'}).error,/valid JSON/);
  assert.match(c.planTopologyExport(text,{...raw,extra:true},pair,{name:'x'}).error,/source changed/);
  const unplaced=clone(raw);diagram(unplaced).rows=[['a','c']];assert.match(c.planTopologyExport(JSON.stringify(unplaced),unplaced,pair,{name:'x'}).error,/placement/);
  for(const edges of [{},[null],[{from:'a'}]]){const broken=clone(raw);diagram(broken).edges=edges;assert.match(c.planTopologyExport(JSON.stringify(broken),broken,closed,{name:'x'}).error,/Connections must/);}
  assert.match(c.planBulkDelete(text,closed).error,/Mixed topology/);assert.match(c.planBulkSetField(text,closed,'delta','true').error,/Mixed topology/);
});
test('names are unique across sections and prototype-like tokens remain ordinary declarations',()=>{
  const c=harness(),raw=fixture();raw.page.sections.push({id:'other',diagram:{nodes:{z:{title:'Z'}},rows:[['z']],topologyExports:{taken:{nodes:['z'],edges:[]}}}});
  raw.page.sections.push({heading:'Notes',text:['No diagram here.']});
  assert.match(c.planTopologyExport(JSON.stringify(raw),raw,pair,{name:'taken'}).error,/already exists/);
  for(const name of ['constructor','toString','A.1-b_c']){
    const result=c.planTopologyExport(JSON.stringify(raw),raw,pair,{name});assert.equal(result.error,undefined);assert.deepEqual(diagram(JSON.parse(result.text)).topologyExports[name],{nodes:['a','b'],edges:[]});
  }
});
test('bare diagrams and unwrapped pages validate local declarations without wrapping source',()=>{
  const c=harness();
  for(const raw of [fixture().page,diagram(fixture())]){
    const result=c.planTopologyExport(JSON.stringify(raw),raw,closed,{name:'public'});assert.equal(result.error,undefined);
    const authored=JSON.parse(result.text);assert.equal(authored.page,undefined);
    const d=authored.sections?authored.sections[0].diagram:authored;assert.deepEqual(d.topologyExports.public,{nodes:['a','b'],edges:['a->b']});
    d.rows=[['a','c']];assert.throws(()=>c.FlowTopology.resolveSource(authored),/placement/);
  }
});
test('nested exports need frozen context, preserve imports, and validate dependent consumers',()=>{
  const c=harness(),provider=fixture();provider.page.canon={version:1,id:'provider',kind:'canonical',owner:'group:default/test'};
  diagram(provider).topologyExports={public:{nodes:['a','b'],edges:['a->b']}};
  const consumer=fixture();consumer.page.canon={...provider.page.canon,id:'consumer'};
  diagram(consumer).topologyImports=[{spec:'provider',export:'public',as:'child'}];
  const context={version:1,id:'consumer',specs:[provider,consumer]},text=JSON.stringify(consumer),targets=[node('child::a'),node('child::b'),{...edge('child::a->child::b'),index:2}];
  assert.match(c.planTopologyExport(text,consumer,targets,{name:'nested'}).error,/Canon/);
  const result=c.planTopologyExport(text,consumer,targets,{name:'nested'},context);assert.equal(result.error,undefined);
  const next=JSON.parse(result.text);assert.deepEqual(diagram(next).topologyExports.nested,{nodes:['child::a','child::b'],edges:['child::a->child::b']});
  delete diagram(next).topologyExports;assert.deepEqual(next,consumer);
  const upstream={...context,id:'provider'};
  for(const options of [{action:'update',existingName:'public',name:'renamed'},{action:'remove',existingName:'public'}])assert.match(c.planTopologyExport(JSON.stringify(provider),provider,closed,options,upstream).error,/missing export/);
});
test('stale project/source transactions cannot commit local export plans',()=>{
  const c=harness(),raw=fixture();let text=JSON.stringify(raw);const session=c.createBuilderSession({source:{read:()=>text,write:v=>text=v},persistence:{read:()=>({}),preserve(){},cancel(){},save(){}},render(){}});
  session.replaceProject(text);const snapshot=session.snapshot(),plan=c.planTopologyExport(text,raw,pair,{name:'public'});
  text+='\n';assert.equal(session.accept(plan,{snapshot}),false);assert.equal(session.canUndo(),false);
  session.replaceProject(snapshot.text);assert.equal(session.accept(plan,{snapshot}),false);assert.equal(session.canUndo(),false);
});
