'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readSource}=require('../tools/source-loader.cjs');
const c={TextEncoder};vm.createContext(c);
for(const name of ['validator.js','workbench/io-model.js','workbench/drawio-import.js'])vm.runInContext(readSource(name),c);
const plain=v=>JSON.parse(JSON.stringify(v));
const node=(id,parent='1',extra={})=>({id,parent,vertex:'1',label:id,geometry:{x:'10',y:'20',width:'120',height:'60'},...extra});
const edge=(id,source,target,extra={})=>({id,parent:'1',edge:'1',source,target,label:'Next',...extra});
const base=()=>[{id:'0',label:''},{id:'1',parent:'0',label:''}];
function convert(cells){const result=c.drawioConvertPages([{name:'Test',cells}]);assert.deepEqual(plain(c.validate(c.normalize(result)).errors),[]);return result;}
test('pure cell conversion preserves parent-relative centers, nested groups, labels, locks and reversed arrows',()=>{
  const cells=[...base(),node('outer','1',{label:'Outer',style:'group',geometry:{x:'200',y:'100',width:'600',height:'400'}}),node('inner','outer',{label:'Inner',style:'group;locked=1',geometry:{x:'40',y:'80',width:'300',height:'200'}}),node('a','inner',{label:'Alpha'}),node('b','1',{label:'Beta'}),edge('e','b','a',{style:'startArrow=block;endArrow=none',label:'Reverse'})];
  const before=JSON.stringify(cells),spec=convert(cells),d=spec.page.sections[0].diagram;
  assert.equal(JSON.stringify(cells),before);assert.equal(d.nodes['drawio-node-1'].title,'Alpha');assert.equal(d.nodes['drawio-node-1'].group,'drawio-group-2');assert.equal(d.groups['drawio-group-2'].parent,'drawio-group-1');
  assert.deepEqual(plain(d.floats[0]),{id:'drawio-node-1',side:'below',x:310,y:230,noSpread:true,locked:true});
  assert.deepEqual(plain(d.edges),[{from:'drawio-node-1',to:'drawio-node-2',kind:'drawio',label:'Reverse'}]);assert.deepEqual(plain(d.steps),[]);assert.equal(spec.page.protocols.drawio.label,'Connection');
});
test('visible multiple layers preserve membership and repeated page-local IDs stay independent',()=>{
  const cells=[...base(),{id:'layer',parent:'0',label:'Second layer'},node('a'),node('b','layer'),edge('edge','a','b')];
  const spec=c.drawioConvertPages([{name:'One',cells},{name:'Two',cells}]);assert.deepEqual(plain(c.validate(c.normalize(spec)).errors),[]);
  const d=spec.page.sections[0].diagram;assert.equal(Object.keys(d.groups).length,2);assert.equal(d.nodes['drawio-node-2'].group,'drawio-group-2');assert.equal(d.groups['drawio-group-2'].title,'Second layer');assert.equal(spec.page.sections.length,2);
});
test('unsupported or ambiguous cells reject the complete conversion',()=>{
  const cases=[
    [cells=>cells.push(node('a')),/duplicate cell/],[cells=>cells[2].parent='missing',/unknown parent/],
    [cells=>{cells[2].parent='b';cells[3].parent='a';},/cycle/],[cells=>cells[2].visible='0',/hidden/],
    [cells=>cells[1].visible='0',/hidden/],[cells=>cells[2].collapsed='1',/collapsed/],
    [cells=>cells[2].geometry.relative='1',/relative/],[cells=>cells[2].geometry.width='NaN',/finite/],
    [cells=>cells[2].geometry.width='0',/positive/],[cells=>cells[2].geometry.x='100001',/finite/],
    [cells=>cells[2].style='shape=image;image=https://example.com/a.png',/images/],
    [cells=>cells[2].style='shape=mxgraph.custom.shape',/stencils/],[cells=>cells[2].style='shape=cloud',/unsupported shape/],
    [cells=>cells[4].target='missing',/terminals/],[cells=>cells[4].target='e',/terminals/],
    [cells=>cells[4].style='endArrow=none',/exactly one/],[cells=>cells[4].style='startArrow=classic',/exactly one/],
    [cells=>cells[4].style='endArrow=ERmany',/semantic arrow/],[cells=>cells[4].style='endArrow=diamond',/semantic arrow/],
    [cells=>cells[4].style='sourcePort=p',/port/],[cells=>cells.push(edge('e2','a','b')),/parallel/],
    [cells=>cells.push(node('label','e',{geometry:{relative:'1'}})),/edge-label/],
    [cells=>cells.push(node('child','a')),/complex containers/],[cells=>cells[2].style='rotation=90',/rotated/]
  ];
  for(const [mutate,error] of cases){const cells=[...base(),node('a'),node('b'),edge('e','a','b')];mutate(cells);assert.throws(()=>c.drawioConvertPages([{name:'Invalid',cells}]),error);}
});
test('opacity validates numeric bounds and rejects every fully transparent spelling',()=>{
  function cells(value){return [...base(),node('a','1',{style:'opacity='+value})];}
  for(const value of ['0','0.0','00','-0','.0','0e2','1e-999'])assert.throws(()=>convert(cells(value)),/fully transparent/);
  for(const value of ['','NaN','Infinity','-1','100.1','101','1e999','0px',' 0','0x10'])assert.throws(()=>convert(cells(value)),/opacity must be a number from 0 to 100/);
  for(const value of ['0.1','01','50.0','100','1e2'])assert.equal(Object.keys(convert(cells(value)).page.sections[0].diagram.nodes).length,1);
  for(const index of [0,1,2,4]){
    const records=[...base(),node('g','1',{style:'group'}),node('a','g'),edge('e','a','a')];records[index].style=(records[index].style || '')+';opacity=0.0';
    assert.throws(()=>convert(records),/fully transparent/);
  }
});
test('limits cover aggregate pages, cells, nodes, groups, parent depth and coordinates',()=>{
  assert.throws(()=>c.drawioConvertPages(Array.from({length:21},()=>({name:'Page',cells:base()}))),/1–20 pages/);
  assert.throws(()=>c.drawioConvertPages([{name:'Many',cells:[...base(),...Array.from({length:1000},(_,i)=>node('n'+i))]}]),/1000 cells/);
  assert.throws(()=>c.drawioConvertPages([{name:'Many',cells:[...base(),...Array.from({length:501},(_,i)=>node('n'+i))]}]),/500 nodes/);
  const groups=[...base()];for(let i=0;i<65;i++)groups.push(node('g'+i,'1',{style:'group'}),node('n'+i,'g'+i));assert.throws(()=>convert(groups),/64 groups/);
  const deep=[...base()];for(let i=0;i<32;i++)deep.push(node('g'+i,i?'g'+(i-1):'1',{style:'group'}));assert.throws(()=>convert(deep),/depth exceeds/);
  assert.throws(()=>convert([...base(),node('g','1',{style:'group',geometry:{x:'99999',width:'1',height:'1'}}),node('n','g')]),/accumulated/);
});
test('XML recognition is bounded deterministic scanning and synchronous Mermaid/JSON contracts remain intact',async()=>{
  assert.equal(c.drawioImportRecognized(' \n<?xml version="1.0"?>\n<!--test-->\n<mxfile/>'),true);
  assert.equal(c.drawioImportRecognized('<!--x-->'.repeat(10000)+'<no/>'),false);
  assert.equal(c.drawioImportRecognized('<!DOCTYPE mxfile><mxfile/>'),true);
  assert.equal(c.drawioImportRecognized('<svg/>'),false);
  const seq='sequenceDiagram\nA->>B: next';assert.equal((await c.prepareFlowviewFileImportAsync({name:'sequence.mmd'},seq)).type,'Mermaid sequence');
});
