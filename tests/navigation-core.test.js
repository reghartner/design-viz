'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {readSource, sourceFiles} = require('../tools/source-loader.cjs');
const packaged = require('../tools/canon/core.cjs');
const plain = value => JSON.parse(JSON.stringify(value));
const headings = ['Delivery Flow', 'Delivery Flow', '', 'Delivery Flow', '123', '!!!', '!!!'];
const references = ['delivery-flow', 'delivery-flow-2', '3', 'delivery-flow-3', 'section-123', 'section', 'section-2'];
const stepIds = ['2', null, 'repeat', 'repeat'];

function withoutDOM(extra = {}) {
  const context = {URL, ...extra};
  for (const name of ['window', 'document'])
    context[name] = new Proxy({}, {get(target, key) { throw new Error('Unexpected DOM initialization: ' + name + '.' + String(key)); }});
  return vm.createContext(context);
}

test('the standalone navigation leaf preserves collision-safe references and URL handling without DOM globals', () => {
  const leaf = withoutDOM();
  vm.runInContext(readSource('core/navigation.js'), leaf);
  assert.deepEqual(plain(leaf.sectionReferences(headings)), references);
  const slugs = ['same', 'same', '2'];
  assert.equal(leaf.tabReference(slugs, 1), '02');
  assert.equal(leaf.tabIndexOf('02', slugs, slugs.length), 1);
  const stepRefs = stepIds.map((id, index) => leaf.stepReference(stepIds, index));
  assert.deepEqual(stepRefs, ['2', '02', '3', '4']);
  assert.deepEqual(stepRefs.map(ref => leaf.stepIndexOf(stepIds, ref)), [0, 1, 2, 3]);
  assert.equal(leaf.canonicalLinkBase('https://EXAMPLE.test:443/docs'), 'https://example.test/docs');
  assert.equal(leaf.isValidLinkBase('javascript:alert(1)'), false);
  assert.equal(leaf.isValidLinkBase('https://example.test/has space'), false);
  assert.equal(leaf.composeLinkURL('https://example.test/docs#host=1', '#d=delivery-2&m=step'),
    'https://example.test/docs#host=1&d=delivery-2&m=step');
});

test('leaf and assembled viewer retain composed diagram/card routing and malformed-escape behavior', () => {
  const leaf = vm.createContext({URL}), viewer = vm.createContext({URL});
  vm.runInContext(readSource('core/navigation.js'), leaf);
  vm.runInContext(readSource('validator.js') + '\n' + readSource('engine.js'), viewer);
  const manifest = {tabBlocks: [{index: 1, count: 2, slugs: ['same', 'same']},
    {index: 2, count: 3, slugs: ['same', 'same', '2']}], sections: [
    {number: 1, reference: 'delivery', stepIds: null, hasCard: false, rowCount: 0},
    {number: 2, reference: 'delivery-2', tabBlock: 1, tab: 0, stepIds, hasCard: false, rowCount: 0},
    {number: 3, reference: 'section-123', tabBlock: 2, tab: 1, stepIds: ['start', 'end'], hasCard: true, rowCount: 3},
  ]};
  const hash = '#b=2&t=02&d=delivery-2&m=step&p=failed%20path&s=02&c=section-123&r=2&x=delivery-2,section-123&e=section%20%26%20one';
  const state = {b: 2, t: '02', d: 'delivery-2', m: 'step', p: 'failed path', s: '02',
    c: 'section-123', r: 2, x: 'delivery-2,section-123', e: 'section & one'};
  for (const core of [leaf, viewer]) {
    assert.equal(core.buildHash(state), hash);
    assert.deepEqual(plain(core.resolveHashTarget(core.parseHash(hash), manifest)), {
      kind: 'row', section: 3, row: 1, tabBlock: 2, tab: 1,
      diagram: {kind: 'diagram', section: 2, mode: 'step', step: 1, legacy: false, tabBlock: 1, tab: 0},
      card: {kind: 'row', section: 3, row: 1, tabBlock: 2, tab: 1},
      explicitTab: {kind: 'tab', tabBlock: 2, tab: 1},
    });
    const legacy = core.parseHash('#m=step&s=2&p=%E0%A4%A');
    assert.equal(Object.hasOwn(legacy, 'p'), false);
    assert.equal(core.resolveHashTarget(legacy, manifest).diagram.step, 0);
    assert.equal(core.buildHash(legacy), '#m=step&s=2');
  }
  assert.equal(sourceFiles('validator.js').filter(file => file === 'core/navigation.js').length, 1);
  assert.equal(sourceFiles('engine.js').includes('core/navigation.js'), false);
});

test('packaged routing preserves its public facade and matches assembled source data', () => {
  const source = vm.createContext({URL});
  vm.runInContext(readSource('validator.js') + '\n' + readSource('engine.js'), source);
  const routing = packaged.viewerRouting();
  for (const name of ['blocksOf', 'sectionReferences', 'buildHash', 'diagramPathList', 'stepKeys', 'stepFailures', 'stepReference'])
    assert.equal(typeof routing[name], 'function', 'compatible routing entrypoint: ' + name);
  assert.equal(packaged.viewerRouting(), routing, 'routing facade remains cached');
  const d = {steps: [{id: 'start'}, {id: 'hidden'}, {id: 'end'}],
    paths: [{id: 'happy', steps: ['start', 'end']}, {id: 'failed', steps: ['start', 'hidden']}]};
  const page = {blocks: [{heading: 'Prose'}, {tabs: [{label: 'Same', sections: [{diagram: d}]},
    {label: 'Same', sections: [{heading: '123', diagram: d}]}]}]};
  const calls = [
    ['blocksOf', [page]], ['sectionReferences', [headings]],
    ['buildHash', [{d: 'delivery-2', m: 'step', p: 'failed', s: 'hidden'}]],
    ['diagramPathList', [d]], ['stepKeys', [{edges: ['a->b', 'b->c']}]],
    ['stepFailures', [{failures: {'a->b': 'dropped', 'b->c': 'blocked', unknown: 'ignored'}}]],
    ...stepIds.map((id, index) => ['stepReference', [stepIds, index]]),
  ];
  for (const [name, args] of calls)
    assert.deepEqual(plain(routing[name](...args)), plain(source[name](...args)), name);
  assert.deepEqual(routing.diagramPathList(d).map(route => route.indices), [[0, 2], [0, 1]]);
  assert.equal(routing.buildHash({d: 'delivery-2', m: 'step', p: 'failed', s: 'hidden'}),
    '#d=delivery-2&m=step&p=failed&s=hidden');
});

test('static backend routing initializes without evaluating the DOM renderer or reading source files', () => {
  const context = withoutDOM({module: {exports: {}}});
  // No require, filesystem or source loader is available in the deployed scope.
  const runtime = fs.readFileSync(path.join(__dirname, '../tools/canon/generated-runtime.cjs'), 'utf8');
  vm.runInContext(runtime, context);
  const backend = context.module.exports, routing = backend.viewerRouting();
  assert.equal(backend.viewerRouting(), routing);
  assert.deepEqual(plain(routing.sectionReferences(headings)), references);
  assert.equal(routing.stepReference(stepIds, 1), '02');
  assert.deepEqual(plain(backend.validateSpec({nodes: {a: {}}, rows: [['a']]})), {errors: [], warnings: []});
});

test('view selectors round trip without conflating host profiles, playback or paths',()=>{
  const core=withoutDOM();vm.runInContext(readSource('core/navigation.js'),core);
  const hash=core.buildHash({d:'front-door',v:'home-story',m:'step',p:'offline',s:'held'});
  assert.equal(hash,'#d=front-door&v=home-story&m=step&p=offline&s=held');
  assert.equal(core.parseHash(hash).v,'home-story');
  assert.equal(core.parseHash('#d=front-door&v=%E0%A4%A').v,undefined);
  assert.equal(core.parseHash('#d=front-door&layout=confluence').v,undefined);
  assert.equal(core.parseHash(core.buildHash({v:'not a view & <id>'})).v,'not a view & <id>');
  const manifest={sections:[{number:1,reference:'prose'},
    {number:2,reference:'home',hasDiagram:true,stepIds:null}]};
  const target=core.resolveHashTarget(core.parseHash('#v=home'),manifest);
  assert.equal(target.diagram.section,2);assert.equal(target.diagram.mode,null);
});
