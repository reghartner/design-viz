'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {readSource} = require('../tools/source-loader.cjs');
const plain = value => JSON.parse(JSON.stringify(value));
function core(){
  const context = {};
  Object.defineProperty(context, 'document', {get(){ throw new Error('DOM access during headless registration'); }});
  vm.runInNewContext(readSource('validator.js'), context);
  return context;
}
function diagram(panels, steps = []){
  return {nodes:{node:{}}, rows:[['node']], panels, steps};
}

test('headless validation dispatches a new panel contract and isolates declaration contexts', () => {
  const c = core(), seen = [];
  c.PanelRegistry.extend('state-contract-probe', {
    validateDeclaration(panel, path, warnings, errors, d){
      assert.equal(d.nodes.node != null, true);
      if (panel.invalid) errors.push(path + ': rejected by panel contract');
      return {patchCount:0};
    },
    validatePatch(patch, path, panel, warnings, context){
      seen.push([panel.id, ++context.patchCount]);
      if (patch.invalid) warnings.push(path + ': rejected patch');
    }
  });
  const d = diagram([{id:'first',type:'state-contract-probe'}, {id:'second',type:'state-contract-probe',invalid:true}], [
    {nodes:['node'],panels:{first:{},second:{invalid:true}}},
    {nodes:['node'],panels:{first:{}}}
  ]);
  const run = () => plain(c.validate(c.normalize(d)));
  const result = run();
  assert.deepEqual(seen, [['first',1],['second',1],['first',2]]);
  assert.deepEqual(result.errors, ['sections[0].diagram.panels[1]: rejected by panel contract']);
  assert.deepEqual(result.warnings, ['sections[0].diagram.steps[0].panels.second: rejected patch']);
  assert.deepEqual(run(), result);
  assert.deepEqual(seen.slice(3), seen.slice(0,3), 'a second validation gets new per-panel contexts');
});

test('unknown panels retain generic warnings and folding, and malformed patches stay generic', () => {
  const c = core();
  const d = diagram([{id:'p',type:'missing-contract',initial:{value:1,log:['initial']}}], [
    {nodes:['node'],panels:{p:{log:'append',enterOnce:{value:2}}}},
    {nodes:['node'],panels:{p:[],undeclared:{}}},
    {nodes:['node'],panels:{p:{value:3}}}
  ]);
  const result = c.validate(c.normalize(d));
  assert.equal(result.errors.length, 0);
  assert.equal(result.warnings.length, 3);
  assert.match(result.warnings[0], /unknown panel type "missing-contract"/);
  assert.match(result.warnings[1], /patch must be an object/);
  assert.match(result.warnings[2], /"undeclared" is not a declared panel id/);
  assert.deepEqual(plain(c.foldPanelStates(d).p), [
    {value:2,log:['initial','append']},
    {value:1,log:['initial','append']},
    {value:3,log:['initial','append']}
  ]);
  assert.deepEqual(plain(c.foldPanelStates(diagram(d.panels)).p), [{value:1,log:['initial']}]);
});

test('panel fold callbacks receive only the selected path and handle the ambient snapshot', () => {
  const c = core();
  c.PanelRegistry.extend('fold-contract-probe', {
    fold(panel, steps){
      let total = panel.initial.total;
      const states = steps.map(step => ({total:total += (step.panels[panel.id] || {}).add || 0}));
      return states.length ? states : [{total}];
    }
  });
  const d = diagram([{id:'p',type:'fold-contract-probe',initial:{total:10}}], [
    {id:'shared',panels:{p:{add:1}}},
    {id:'success',panels:{p:{add:100}}},
    {id:'failure',panels:{p:{add:-5}}}
  ]);
  d.paths = [{id:'happy',steps:['shared','success']},{id:'failed',steps:['shared','failure']}];
  const original = JSON.stringify(d);
  assert.deepEqual(plain(c.foldPanelStates(c.diagramForPath(d,'happy')).p), [{total:11},{total:111}]);
  assert.deepEqual(plain(c.foldPanelStates(c.diagramForPath(d,'failed')).p), [{total:11},{total:6}]);
  assert.deepEqual(plain(c.foldPanelStates({...d,steps:[]}).p), [{total:10}]);
  assert.equal(JSON.stringify(d), original);
});

test('common histories retain bounded range paints, resets and timeline overrides', () => {
  const c = core();
  const p = {id:'p',type:'buffer',segments:3,initial:{cells:['empty','empty','empty']}};
  const steps = Array.from({length:65}, () => ({panels:{p:{mark:[[0,1,'protected']]}}}));
  steps.push({panels:{p:{cells:['buffered','buffered','buffered'],mark:[[2,2,'uploaded']]}}});
  const states = c.foldPanelStates(diagram([p],steps)).p;
  assert.equal(states[63].mark.length,64);
  assert.deepEqual(plain(states[64].mark),[]);
  assert.deepEqual(plain(states[64].cells),['protected','protected','empty']);
  assert.deepEqual(plain(states[65].mark),[[2,2,'uploaded']]);
  assert.deepEqual(plain(c.bufferPaint(3,states[65].cells,states[65].mark)),['buffered','buffered','uploaded']);
  const timeline = {id:'t',type:'timeline',span:'1h',initial:{now:'5m',events:[{at:'1m'}],miss:[]}};
  const timelineStates = c.foldPanelStates(diagram([timeline], [
    {panels:{t:{now:'bad',hasOwnProperty:'authored',events:[{at:'2m'}],enterOnce:{note:'flash',events:[{at:'3m'}]}}}},
    {panels:{t:{now:'10m',miss:[{lane:'a',at:'4m'}]}}}
  ])).t;
  assert.deepEqual(plain(timelineStates[0]),{now:'5m',hasOwnProperty:'authored',note:'flash',events:[{at:'1m'},{at:'2m'}],miss:[],log:[]});
  assert.deepEqual(plain(timelineStates[1]),{now:'10m',hasOwnProperty:'authored',events:[{at:'1m'},{at:'2m'}],miss:[{lane:'a',at:'4m'}],log:[]});
});
