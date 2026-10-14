'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readSource}=require('../tools/source-loader.cjs');
const c={TextEncoder};vm.createContext(c);
for(const name of ['validator.js','workbench/io-model.js'])vm.runInContext(readSource(name),c);
const plain=value=>JSON.parse(JSON.stringify(value));
function parse(text){const spec=c.mermaidToSpec(text);assert.deepEqual(plain(c.validate(c.normalize(spec)).errors),[]);return spec;}
const diagram=spec=>spec.page.sections[0].diagram;

test('each direction places a three-node chain along its declared axis with static neutral connections',()=>{
  for(const direction of ['TD','TB','BT','LR','RL']){
    const spec=parse('graph '+direction+'; A[Start] -->|next| B --> C[End]'),d=diagram(spec),p=c.layout(d).pos;
    const axis=['LR','RL'].includes(direction)?'cx':'cy',other=axis==='cx'?'cy':'cx',sign=['RL','BT'].includes(direction)?-1:1;
    assert.ok(sign*(p.B[axis]-p.A[axis])>0);assert.ok(sign*(p.C[axis]-p.B[axis])>0);
    assert.equal(p.A[other],p.B[other]);assert.equal(p.B[other],p.C[other]);
    assert.deepEqual(plain(d.steps),[]);assert.deepEqual(plain(d.edges.map(e=>e.kind)),['mermaid','mermaid']);
    assert.equal(spec.page.protocols.mermaid.label,'Connection');assert.equal(d.edges[0].label,'next');
  }
});
test('labels, native ID identity, comments, chains and branch products retain the complete graph',()=>{
  const d=diagram(parse('%% comment\nflowchart LR\nA["One; two | three"] & Foo_Bar -->|"yes"| Foo-Bar & a\nFoo_Bar -- next step --> Z\nA[Latest]\nA --> End'));
  assert.deepEqual(Object.keys(d.nodes),['A','Foo_Bar','Foo-Bar','a','Z','End']);assert.equal(d.nodes.A.title,'Latest');
  assert.equal(d.edges.length,6);assert.deepEqual(plain(d.edges.slice(0,4).map(e=>[e.from,e.to,e.label])),[['A','Foo-Bar','yes'],['A','a','yes'],['Foo_Bar','Foo-Bar','yes'],['Foo_Bar','a','yes']]);
  assert.equal(d.edges[4].label,'next step');
  assert.equal(diagram(parse('flowchart TD\nconstructor --> __proto__')).nodes.__proto__.title,'__proto__');
});
test('common shapes normalize with explicit warnings; style declarations do not execute',()=>{
  for(const shape of ['[Box]','(Round)','([Stadium])','[[Subroutine]]','[(Database)]','((Circle))','(((Double)))','{Decision}','{{Hexagon}}','[/Input/]','[\\Output\\]','[/Trap\\]','[\\Other/]']){
    const spec=parse('flowchart TD\nA'+shape+' --> B');assert.equal(Object.keys(diagram(spec).nodes).length,2);
    assert.equal(spec.todos.length,shape==='[Box]'?1:2);
  }
  const spec=parse('flowchart TD\nA:::red --> B\nclassDef red fill:#f00,color:#fff\nclass A red\nstyle B fill:#eee\nlinkStyle 0 stroke:red');
  assert.deepEqual(plain(spec.todos),['Mermaid layout and arrow appearance use native Flowview rendering.','Mermaid styles and classes are not imported.']);
});
test('nested subgraphs keep every membership, parent and cross-group connection',()=>{
  const d=diagram(parse('flowchart LR\nsubgraph outer [Outer team]\nsubgraph inner ["Inner team"]\nA --> B\nend\nC\nend\nsubgraph other\nD\nend\nB --> D\nC --> D'));
  assert.deepEqual(plain(d.groups),{outer:{title:'Outer team'},inner:{title:'Inner team',parent:'outer'},other:{title:'other'}});
  assert.deepEqual(plain(Object.fromEntries(Object.entries(d.nodes).map(([id,n])=>[id,n.group]))),{A:'inner',B:'inner',C:'outer',D:'other'});
  assert.equal(d.edges.length,3);
});
test('cycles, self-loops and disconnected nodes terminate with a unique valid placement for each node',()=>{
  const d=diagram(parse('flowchart BT\nA --> B --> C --> A\nC --> C\nC --> D\nE'));
  assert.equal(d.edges.length,5);assert.equal(d.floats.length,5);assert.equal(new Set(d.floats.map(f=>f.x+','+f.y)).size,5);
  assert.ok(d.floats.find(f=>f.id==='D').y<d.floats.find(f=>f.id==='C').y);
});
test('unsupported semantic constructs and malformed sources fail before returning a partial graph',()=>{
  const cases=[
    ['flowchart XX\nA-->B',/expected flowchart/],['flowchart TD',/no flowchart nodes/],
    ['flowchart TD\nA-->',/expected a node/],['flowchart TD\nA---B',/directed/],['flowchart TD\nA<-->B',/unsupported/],
    ['flowchart TD\nA-.->B',/unsupported/],['flowchart TD\nA==>B',/unsupported/],['flowchart TD\nA --> B\nA --> B',/parallel/],
    ['flowchart TD\nA[open',/unclosed/],['flowchart TD\nA[bad)',/mismatched/],['flowchart TD\nA-->||B',/plain-text/],
    ['flowchart TD\nA@{shape: rect}',/unsupported/],['flowchart TD\nA["<img src=x onerror=alert(1)>"]',/HTML/],
    ['flowchart TD\nA["`rich`"]',/Markdown/],['flowchart TD\nclick A "https://example.com"',/unsupported/],
    ['flowchart TD\n%%{init: {}}%%\nA',/directives/],['---\nconfig: {}\n---\nflowchart TD\nA',/not a sequenceDiagram/],
    ['flowchart TD\nsubgraph G\nA\nend\nG --> B',/subgraph endpoints/],
    ['flowchart TD\nA --> G\nsubgraph G\nB\nend',/colliding/],
    ['flowchart TD\nsubgraph G\nA\nend\nsubgraph H\nA\nend',/multiple subgraphs/],
    ['flowchart TD\nsubgraph G\nA',/unclosed subgraph/],['flowchart TD\nend',/without/],
    ['flowchart TD\nsubgraph G\ndirection LR\nA\nend',/unsupported/]
  ];
  for(const [text,expected] of cases)assert.throws(()=>c.mermaidToSpec(text),expected,text);
});
test('input, graph, nesting and statement bounds refuse excessive work',()=>{
  assert.throws(()=>c.mermaidToSpec('flowchart TD\n'+Array.from({length:201},(_,i)=>'N'+i).join('\n')),/200 nodes/);
  const ids=Array.from({length:23},(_,i)=>'N'+i).join(' & ');
  assert.throws(()=>c.mermaidToSpec('flowchart TD\n'+ids+' --> '+ids),/500 connections/);
  assert.throws(()=>c.mermaidToSpec('flowchart TD\n'+Array.from({length:33},(_,i)=>'subgraph G'+i+'\nend').join('\n')+'\nA'),/32 subgraphs/);
  assert.throws(()=>c.mermaidToSpec('flowchart TD\n'+Array.from({length:17},(_,i)=>'subgraph G'+i).join('\n')),/16 nesting/);
  assert.throws(()=>c.mermaidToSpec('flowchart TD\n'+'A;'.repeat(2000)),/2000 statements/);
  assert.throws(()=>c.mermaidToSpec('flowchart TD\nA['+'x'.repeat(501)+']'),/500 characters/);
  assert.throws(()=>c.mermaidToSpec('x'.repeat(4*1024*1024+1)),/4 MiB/);
});
test('whole-file classification, first fence, summaries and JSON reopen preserve the diagram',()=>{
  const markdown='# Intro\n```mermaid\nflowchart RL\nA{Ready} -->|yes| B\n```\n```mermaid\nsequenceDiagram\nX->>Y: later\n```';
  for(const name of ['chart.mmd','chart.mermaid','chart.md','chart.txt']){
    const result=c.prepareFlowviewFileImport({name},markdown);assert.match(result.type,/Mermaid flowchart/);
    assert.equal(result.summary.nodes,2);assert.equal(result.summary.connections,1);assert.equal(result.todos.length,2);
    const reopened=c.prepareFlowviewFileImport({name:'saved.spec.json'},result.text);assert.deepEqual(plain(reopened.raw),plain(result.raw));
  }
  assert.throws(()=>c.mermaidToSpec('```mermaid\nstateDiagram-v2\n```\n```mermaid\nflowchart TD\nA\n```'),/not a sequenceDiagram/);
});
