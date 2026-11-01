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
