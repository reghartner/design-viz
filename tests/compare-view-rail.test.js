'use strict';
/* Change-list grouping in the shared compare view (src/viewer/compare-view.js,
   #848 diff review cycle 1): rail groups follow section IDENTITY, not the
   visible heading, so two sections with the same heading stay separate and
   changes in an intervening section are not reordered across them. */
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readSource}=require('../tools/source-loader.cjs');
function load(){const c={console};vm.createContext(c);for(const f of ['validator.js','viewer/compare-view.js'])vm.runInContext(readSource(f),c);return c;}
const node=t=>({nodes:{a:{title:t}},rows:[['a']]});
test('sections sharing a heading form separate rail groups in document order',()=>{
  const c=load();
  const page=t=>c.normalize({page:{title:'T',blocks:[{id:'x',heading:'Same',diagram:node('X'+t)},{id:'m',heading:'Middle',diagram:node('M'+t)},{id:'y',heading:'Same',diagram:node('Y'+t)}]}});
  const before=page(''),after=page('!');
  const entries=c.compareDocuments({authored:before,resolved:before,ledger:null},{authored:after,resolved:after,ledger:null});
  assert.equal(typeof c.compareRailGroups,'function','compare-view.js defines compareRailGroups(entries, pages)');
  const groups=JSON.parse(JSON.stringify(c.compareRailGroups(entries,{before,after})));/* copy out of the vm realm */
  assert.deepEqual(groups.map(g=>g.name),['Same','Middle','Same']);
  const order=groups.flatMap(g=>g.items);
  assert.deepEqual(order,[...order].sort((a,b)=>a-b),'rail order equals entry (document) order');
  assert.equal(order.length,entries.length);
});

/* #848 diff review cycle 3: an added or removed object has a section index only on the side that
   holds it. The other side's section is found through another entry that pairs the same section
   (a heading change of an id-less section changes its reference), else by reference. */
test('the side without an added object finds the paired section even when an id-less heading changed',()=>{
  const c=load();
  const page=(heading,extra)=>c.normalize({page:{title:'T',sections:[{heading:'Flow',diagram:node('F')},{heading,diagram:{nodes:Object.assign({x:{title:'X'}},extra||{}),rows:[['x'].concat(Object.keys(extra||{}))]}}]}});
  const before=page('Notes'),after=page('Notes renamed',{y:{title:'Y'}});
  const entries=c.compareDocuments({authored:before,resolved:before,ledger:null},{authored:after,resolved:after,ledger:null});
  const added=entries.find(e=>e.kind==='node' && e.status==='added');
  assert.ok(added && added.section.before==null && added.section.after===1,'precondition: the engine records only the After section of the added node');
  assert.equal(typeof c.compareSectionOnSide,'function','compare-view.js defines compareSectionOnSide(entries, pages, entry, side)');
  assert.equal(c.compareSectionOnSide(entries,{before,after},added,'before'),1,'Before shows the renamed section');
  const unpaired=page('Other',{}),again=c.compareDocuments({authored:unpaired,resolved:unpaired,ledger:null},{authored:after,resolved:after,ledger:null});
  const a2=again.find(e=>e.kind==='node' && e.status==='added');
  assert.equal(c.compareSectionOnSide(again,{before:unpaired,after},a2,'before'),1,'paired through the section entry of the renamed heading');
});

/* #848 diff review cycle 5: removed and added objects of one paired section form one rail group
   (the engine records a removed object only on Before and an added one only on After). */
test('removed and added objects of one paired section are one rail group',()=>{
  const c=load();
  const page=nodes=>c.normalize({page:{title:'T',sections:[{id:'flow',heading:'Flow',diagram:node('F')},{id:'notes',heading:'Notes',diagram:{nodes:Object.fromEntries(nodes.map(n=>[n,{title:n.toUpperCase()}])),rows:[nodes]}}]}});
  const before=page(['x','gone']),after=page(['x','fresh']);
  const entries=c.compareDocuments({authored:before,resolved:before,ledger:null},{authored:after,resolved:after,ledger:null});
  const kinds=JSON.parse(JSON.stringify(entries.filter(e=>e.kind==='node').map(e=>e.status).sort()));
  assert.deepEqual(kinds,['added','removed'],'precondition: one removed and one added node');
  const groups=JSON.parse(JSON.stringify(c.compareRailGroups(entries,{before,after})));
  assert.deepEqual(groups.map(g=>g.name),['Notes'],'one Notes group, not one per side');
  assert.equal(groups[0].items.length,entries.filter(e=>(e.section||{}).before===1 || (e.section||{}).after===1).length);
});
