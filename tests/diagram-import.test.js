'use strict';
const {readSource}=require('../tools/source-loader.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const c={URL,TextEncoder};vm.createContext(c);
for(const name of ['canon.js','validator.js','workbench/source-edit.js','workbench/targets.js','workbench/commands/common.js','workbench/commands/clipboard.js','workbench/io-model.js','workbench/commands/diagram-import.js'])vm.runInContext(readSource(name),c);
const plain=v=>JSON.parse(JSON.stringify(v));
const source=()=>({page:{protocols:{https:{label:'Source API',color:'#123456'}},sections:[{heading:'Incoming',text:['Not merged'],diagram:{nodes:{a:{title:'A',group:'team'},b:{title:'B'},c:{title:'Floating'}},groups:{team:{title:'Team',parent:'org'},org:{title:'Org'},unused:{title:'Unused'}},rows:[[['a','b']]],floats:[{id:'c',side:'above',x:400,y:20,locked:true}],edges:[{from:'a',to:'b',kind:'https'}],steps:[{edge:'a->b',text:'Not merged'}]}}]}});
const destination=()=>({page:{title:'Retained',protocols:{https:{label:'Destination API',color:'#654321'}},sections:[{heading:'Current',text:['Exact prose'],diagram:{nodes:{a:{title:'Existing'},pin:{title:'Pin'}},rows:[['a']],floats:[{id:'pin',side:'below',x:70,y:420,locked:true}],edges:[],steps:[],panels:[]}}]}});
test('graph-only merge retains source bytes outside graph, complete groups, meanings, geometry, pins and selection',()=>{
  const raw=destination(),input=source(),text=JSON.stringify(raw,null,2).replace('"text": [','"text"    : ['),before=JSON.stringify(raw),original=JSON.stringify(input);
  const out=c.planAddBuilderDiagram(text,raw,input,0,0);assert.equal(out.error,undefined);
  const d=JSON.parse(out.text).page.sections[0].diagram;
  assert.ok(out.text.includes('"text"    : ['));assert.deepEqual(d.steps,[]);assert.deepEqual(d.panels,[]);
  assert.deepEqual(d.rows,raw.page.sections[0].diagram.rows);assert.deepEqual(d.floats[0],raw.page.sections[0].diagram.floats[0]);
  assert.equal(d.nodes['a-copy'].group,'team-copy');assert.equal(d.groups['team-copy'].parent,'org-copy');assert.ok(d.groups['unused-copy']);
  assert.equal(d.edges[0].kind,'https-copy');assert.equal(JSON.parse(out.text).page.protocols['https-copy'].label,'Source API');
  assert.equal(out.targets.length,3);assert.ok(d.floats.slice(1).every(f=>f.noSpread));assert.equal(d.floats.at(-1).locked,true);
  const prior=c.layout(raw.page.sections[0].diagram).pos,after=c.layout(d).pos;assert.deepEqual(plain(after.a),plain(prior.a));assert.deepEqual(plain(after.pin),plain(prior.pin));
  assert.equal(JSON.stringify(raw),before);assert.equal(JSON.stringify(input),original);
});
test('source chooser and Mermaid fenced sequences validate and refuse lossy blocks',()=>{
  const raw=source();raw.page.sections.unshift({heading:'Prose',text:['Only prose']});raw.page.sections.push({heading:'Other',diagram:{nodes:{z:{title:'Z'}},rows:[['z']]}});
  const result=c.prepareBuilderDiagramImport(JSON.stringify(raw));assert.deepEqual(plain(result.sections),[{index:1,label:'Incoming'},{index:2,label:'Other'}]);
  assert.equal(c.prepareBuilderDiagramImport('```mermaid\nsequenceDiagram\nA->>B: hello\n```').error,undefined);
  assert.match(c.prepareBuilderDiagramImport('sequenceDiagram\nA->>B: hello\nloop twice\nB->>C: lost\nend').error,/without losing connections/);
  assert.match(c.prepareBuilderDiagramImport('sequenceDiagram\nFoo_Bar->>Foo-Bar: distinct participants').error,/same node/);
  for(const text of ['{}','not a diagram','{broken','x'.repeat(2*1024*1024+1)])assert.ok(c.prepareBuilderDiagramImport(text).error);
  assert.equal(c.builderDiagramImportRecognized('ordinary text'),false);assert.equal(c.builderDiagramImportRecognized('{"key":12}'),false);
  assert.equal(c.builderDiagramImportRecognized('{"page":"ordinary data"}'),false);assert.equal(c.builderDiagramImportRecognized('{"sections":[{"title":"ordinary data"}]}'),false);
});
test('prototype names and generated protocol collisions retain independent meanings',()=>{
  const raw=destination(),input=JSON.parse('{"page":{"protocols":{"__proto__":{"label":"Proto API","color":"#123456"},"https":{"label":"New","color":"#223344"},"https-copy":{"label":"Separate","color":"#445566"}},"sections":[{"diagram":{"nodes":{"__proto__":{"title":"Proto","group":"constructor"},"constructor":{"title":"Constructor"}},"groups":{"constructor":{"title":"Group"}},"rows":[["__proto__","constructor"]],"edges":[{"from":"__proto__","to":"constructor","kind":"__proto__"},{"from":"constructor","to":"__proto__","kind":"https"}]}}]}}');
  input.page.sections[0].diagram.edges.push({from:'constructor',to:'constructor',kind:'https-copy'});
  const result=c.planAddBuilderDiagram(JSON.stringify(raw),raw,input,0,0);assert.equal(result.error,undefined);
  const out=JSON.parse(result.text),d=out.page.sections[0].diagram;
  assert.equal(d.nodes['__proto__-copy'].group,'constructor-copy');assert.equal(d.edges[0].from,'__proto__-copy');
  assert.equal(out.page.protocols.__proto__.label,'Proto API');assert.equal(d.edges[1].kind,'https-copy-2');assert.equal(d.edges[2].kind,'https-copy');
});
test('unsupported topology, refs, broken graph, invalid placements and excessive coordinates cannot partially edit',()=>{
  const raw=destination(),text=JSON.stringify(raw),changes=[d=>d.topologyImports=[{}],d=>d.nodes.a.$ref='#/missing',d=>d.edges[0].to='missing',d=>d.nodes.a.group='missing',d=>d.groups.org.parent='team',d=>d.rows=[['missing']],d=>d.edges[0].kind='missing',d=>d.nodes.a.handoff={localSection:'current'},d=>d.nodes.a.detail={section:'current'},d=>d.nodes.a.link='#current',d=>d.edges[0].revealAt=1,d=>d.rows=null,d=>d.rows=[],d=>d.edges=null,d=>d.floats=null,d=>d.rows=[['a','a','b']]];
  for(const change of changes){const input=source();change(input.page.sections[0].diagram);assert.ok(c.planAddBuilderDiagram(text,raw,input,0,0).error);assert.equal(JSON.stringify(raw),text);}
  assert.match(c.planAddBuilderDiagram(text,raw,source(),0,0,{x:100000,y:100000}).error,/coordinate limits/);
});
test('bare diagram destination wraps only when protocol definitions require it',()=>{
  const raw={nodes:{keep:{title:'Keep'}},rows:[['keep']]},out=c.planAddBuilderDiagram(JSON.stringify(raw),raw,source(),0,0);
  assert.equal(out.error,undefined);const result=JSON.parse(out.text);assert.ok(result.page.sections[0].diagram.nodes.keep);assert.ok(result.page.protocols['https-copy']);
});
