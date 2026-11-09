'use strict';
// #1215: each tab gets its own panel. The validator warns (never errors) when two or more
// tabs declare an identical panel: the same type and the same content after normalising key
// order (the panel id is identity, not content). Panels that only share a type are not identical.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const C=require('../tools/canon/core.cjs');
const table=(plus='30')=>({id:'ref',type:'table',title:'Retention by tier',columns:[{id:'tier',label:'Tier'},{id:'days',label:'Days'}],initial:{rows:[{id:'basic',cells:{tier:'Basic',days:'7'}},{id:'plus',cells:{tier:'Plus',days:plus}}]}});
const diagram=panels=>({nodes:{a:{title:'A'}},rows:[['a']],panels});
const page=(...tabs)=>({page:{title:'Tabs',blocks:[{tabs:tabs.map((panels,i)=>({label:'Tab '+(i+1),sections:[{id:'s'+i,heading:'Section '+(i+1),diagram:diagram(panels)}]}))}]}});
const repeated=result=>result.warnings.filter(w=>/declared on more than one tab/.test(w));

test('two tabs with an identical panel warn once, naming the tabs and the panel; key order and id do not matter',()=>{
  const second={...table(),id:'ref-2'},reordered=Object.fromEntries(Object.entries(second).reverse());
  const result=C.validateSpec(page([table()],[reordered]));
  assert.deepEqual(result.errors,[]);
  const found=repeated(result);
  assert.equal(found.length,1,JSON.stringify(result.warnings));
  assert.match(found[0],/table panel "Retention by tier"/);
  assert.match(found[0],/"Tab 1", "Tab 2"/);
  assert.match(found[0],/give each tab its own panel/);
  const three=repeated(C.validateSpec(page([table()],[table()],[table()])));
  assert.equal(three.length,1);assert.match(three[0],/"Tab 1", "Tab 2", "Tab 3"/);
});
test('the same panel type with different content, one tab, or two sections of one tab do not warn',()=>{
  const other=table('60');
  assert.deepEqual(repeated(C.validateSpec(page([table()],[other]))),[],'same type, different content');
  assert.deepEqual(repeated(C.validateSpec(page([table()]))),[],'one tab');
  const oneTab={page:{title:'Tabs',blocks:[{tabs:[{label:'Only',sections:[{id:'x',diagram:diagram([table()])},{id:'y',diagram:diagram([table()])}]}]}]}};
  assert.deepEqual(repeated(C.validateSpec(oneTab)),[],'two sections of one tab are not two tabs');
  // A log panel each tab's steps fill differently shows different content on each tab. Patches are read the
  // way the engine reads them: steps[].panels, or the legacy steps[].patch alias.
  const log=()=>({id:'log',type:'log',title:'Event log'});
  const stepped=(entry,{alias=false,at=0}={})=>({nodes:{a:{title:'A'}},rows:[['a']],panels:[log()],
    steps:[{id:'s0',nodes:['a']},{id:'s1',nodes:['a']}].map((st,i)=>i===at?{...st,[alias?'patch':'panels']:{log:{log:[entry]}}}:st)});
  const two=(a,b)=>({page:{title:'Tabs',blocks:[{tabs:[{label:'A',sections:[{id:'x',diagram:a}]},{label:'B',sections:[{id:'y',diagram:b}]}]}]}});
  for(const alias of [false,true]){
    const how=alias?'patch alias':'panels';
    assert.deepEqual(repeated(C.validateSpec(two(stepped('armed',{alias}),stepped('fired',{alias})))),[],how+': the same declaration filled differently by each tab\'s steps');
    assert.equal(repeated(C.validateSpec(two(stepped('armed',{alias}),stepped('armed',{alias})))).length,1,how+': the same declaration and the same step patches on two tabs');
  }
  assert.deepEqual(repeated(C.validateSpec(two(stepped('armed'),stepped('fired',{alias:true})))),[],'one tab through panels, the other through the alias, filled differently');
  // Coordinator ruling: patches are compared as a list, independent of the step that applies them.
  assert.equal(repeated(C.validateSpec(two(stepped('armed',{at:0}),stepped('armed',{at:1})))).length,1,'the same patch list at different steps is repeated');
  const plain={page:{title:'No tabs',sections:[{id:'x',diagram:diagram([table()])},{id:'y',diagram:diagram([table()])}]}};
  assert.deepEqual(repeated(C.validateSpec(plain)),[],'a page without tabs');
});
test('tabs with the same label in two tab blocks name their tab paths; a non-string title falls back to the id',()=>{
  const block=panels=>({tabs:[{label:'Overview',sections:[{id:'o'+Math.random().toString(36).slice(2,7),diagram:diagram(panels)}]}]});
  const found=repeated(C.validateSpec({page:{title:'Two blocks',blocks:[block([table()]),block([table()])]}}));
  assert.equal(found.length,1);
  assert.match(found[0],/\("Overview" \(blocks\[0\]\.tabs\[0\]\), "Overview" \(blocks\[1\]\.tabs\[0\]\)\)/,found[0]);
  const titled={...table(),title:{text:'Retention'}};
  const named=repeated(C.validateSpec(page([titled],[{...titled}])));
  assert.equal(named.length,1);assert.match(named[0],/table panel "ref"/);assert.doesNotMatch(named[0],/object Object/);
});
test('node tools/validate.js prints the warning and exits 0',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'panel-per-tab-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const file=path.join(dir,'board.json');fs.writeFileSync(file,JSON.stringify(page([table()],[table()])));
  const run=spawnSync(process.execPath,[path.join(__dirname,'../tools/validate.js'),file],{encoding:'utf8'});
  assert.equal(run.status,0,run.stdout+run.stderr);
  assert.match(run.stdout,/warn .*table panel "Retention by tier" is declared on more than one tab/,run.stdout);
});
