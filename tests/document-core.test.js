'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {readSource, sourceFiles} = require('../tools/source-loader.cjs');
const C = require('../tools/canon/core.cjs');
const plain = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

function headless() {
  const context = {URL};
  for (const name of ['window', 'document'])
    Object.defineProperty(context, name, {get() { throw new Error('Unexpected DOM access: ' + name); }});
  return vm.createContext(context);
}
function sourceCore() {
  const context = headless();
  vm.runInContext(readSource('validator.js'), context);
  return context;
}
function diagram() {
  return {nodes: {a: {}}, rows: [['a']], panels: [{id: 'log', type: 'log'}],
    steps: [{id: '2', nodes: ['a']},
      {id: 'done', nodes: ['a'], tone: {a: 'ok'}, panels: {log: {log: [{text: 'saved'}]}}},
      {id: 'failed', nodes: ['a'], tone: {a: 'warn'}, panels: {log: {log: [{text: 'lost'}]}}}],
    paths: [{id: 'happy', steps: ['2', 'done']}, {id: 'failed', steps: ['failed']}],
    layouts: [{id: 'business', name: 'Business', steps: ['done'],
      sectionLayout: {default: [{x: 0, y: 0, w: 12, h: 12}]}}], defaultLayout: 'business'};
}
function page() {
  return {blocks: [{heading: 'Delivery Flow', text: ['Prose counts.']},
    {tabs: [{label: 'Same', sections: [{heading: 'Delivery Flow', diagram: diagram()}, {text: ['No heading.']}]},
      {label: 'Same', sections: [{heading: 'Delivery Flow', diagram: diagram()}]}]},
    {heading: '123', diagram: diagram()},
    {tabs: []},
    {tabs: [{label: '2', sections: [{heading: '!!!', diagram: diagram()}]},
      {sections: [{heading: '!!!', text: ['Hidden prose counts too.']}]}]}]};
}

test('document records preserve every section, source address, canonical reference and tab route', () => {
  const source = sourceCore(), input = page(), before = JSON.stringify(input);
  const expected = [
    ['blocks[0]', 0, 1, null, null, null, 'delivery-flow'],
    ['blocks[1].tabs[0].sections[0]', 1, 2, 1, 0, 'Same', 'delivery-flow-2'],
    ['blocks[1].tabs[0].sections[1]', 1, 3, 1, 0, 'Same', '3'],
    ['blocks[1].tabs[1].sections[0]', 1, 4, 1, 1, 'Same', 'delivery-flow-3'],
    ['blocks[2]', 2, 5, null, null, null, 'section-123'],
    ['blocks[4].tabs[0].sections[0]', 4, 6, 3, 0, '2', 'section'],
    ['blocks[4].tabs[1].sections[0]', 4, 7, 3, 1, 'Tab 2', 'section-2'],
  ];
  for (const core of [source, C.viewerRouting()]) {
    const records = core.sectionRecords(input);
    assert.deepEqual(plain(records.map(r => [r.path, r.blockIndex, r.number, r.tabBlock, r.tab, r.tabLabel, r.reference])), expected);
    for (const record of records) {
      const keys = record.path.replace(/\[(\d+)\]/g, '.$1').split('.');
      assert.equal(record.section, keys.reduce((value, key) => value[key], input), 'record retains the original section');
    }
    assert.equal(core.normalize({page: input}), input);
    assert.equal(core.normalize(input), input);
    assert.equal(core.normalize([]), null);
    const legacy = {sections: [{heading: 'Legacy', diagram: diagram()}]};
    assert.equal(core.sectionRecords(legacy)[0].path, 'sections[0]');
    const bare = diagram();
    assert.equal(core.sectionRecords(core.normalize(bare))[0].section.diagram, bare);
  }
  assert.deepEqual(C.sections(input), [input.blocks[1].tabs[0].sections[0], input.blocks[1].tabs[1].sections[0],
    input.blocks[2], input.blocks[4].tabs[0].sections[0]], 'Canon retains diagram-only ordering');
  assert.equal(JSON.stringify(input), before);
});

test('exact lookup distinguishes source indices, path positions, view stops and collision-safe IDs', () => {
  for (const core of [sourceCore(), C.viewerRouting()]) {
    const d = diagram(), before = JSON.stringify(d);
    const target = core.resolveSourceStep(d, 'failed', 'failed');
    assert.equal(target.sourceIndex, 2);
    assert.equal(target.pathIndex, 0);
    assert.equal(target.path.id, 'failed');
    assert.deepEqual(plain(core.diagramLayoutViews(d)[0].steps), ['done'], 'hidden alternate is not a view stop');
    assert.equal(core.resolveSourceStep(d, 'happy', '2').sourceIndex, 0, 'numeric authored ID wins over a positional reference');
    assert.equal(core.resolveSourceStep(d, 'gone', 'done'), null);
    assert.equal(core.resolveSourceStep(d, 'happy', 'gone').sourceIndex, -1);
    assert.equal(core.resolveSourceStep(d, 'happy', 'gone').pathIndex, -1);
    assert.equal(core.resolveSourceStep(d, 'failed', undefined).path.id, 'failed', 'path-only lookup preserves the path');
    const steps = [{id: '2'}, {}, {id: 'repeat'}, {id: 'repeat'}];
    const refs = steps.map((step, index) => core.stepReference(steps.map(s => s.id), index));
    assert.deepEqual(refs, ['2', '02', '3', '4']);
    refs.forEach((ref, index) => assert.equal(core.resolveSourceStep({steps}, 'happy', ref).sourceIndex, index));
    assert.equal(JSON.stringify(d), before);
  }
});

test('static pure facade shares outer navigation scope and preserves layout and path-local panel dispatch', () => {
  const source = sourceCore(), deployed = headless();
  deployed.module = {exports: {}};
  const runtime = fs.readFileSync(path.join(__dirname, '../tools/canon/generated-runtime.cjs'), 'utf8');
  vm.runInContext(runtime, deployed); // No require, filesystem or DOM is available inside the module.
  const backend = deployed.module.exports.viewerRouting();
  assert.deepEqual(plain(backend.sectionRecords(page())), plain(source.sectionRecords(page())), 'outer document helpers see canonical navigation');
  for (const leaf of ['navigation', 'document', 'paths', 'section-layout', 'state', 'geometry']) {
    assert.equal(sourceFiles('validator.js').filter(file => file === 'core/' + leaf + '.js').length, 1);
    assert.equal(sourceFiles('engine.js').includes('core/' + leaf + '.js'), false);
  }
  assert.equal((runtime.match(/function sectionReferences\(/g) || []).length, 1);
  assert.equal(typeof deployed.renderPage, 'undefined');
  assert.equal(typeof deployed.attachStepper, 'undefined');
  for (const core of [source, backend]) {
    const d = diagram(), happy = core.diagramForPath(d, 'happy'), failed = core.diagramForPath(d, 'failed');
    assert.deepEqual(plain(happy._sourceIndices), [0, 1]);
    assert.deepEqual(plain(failed._sourceIndices), [2]);
    assert.deepEqual(plain(core.foldNodeTones(happy)), [{}, {a: 'ok'}]);
    assert.deepEqual(plain(core.foldNodeTones(failed)), [{a: 'warn'}]);
    assert.deepEqual(plain(core.foldPanelStates(happy).log[1].log.map(line => line.text)), ['saved']);
    assert.deepEqual(plain(core.foldPanelStates(failed).log[0].log.map(line => line.text)), ['lost']);
  }
  for (const file of ['src/starters/homemap-story.json', 'src/starters/complex-trace.json', 'src/starters/whole-home-outdoors.json']) {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '..', file), 'utf8')), before = JSON.stringify(raw);
    const page = backend.normalize(raw);
    assert.deepEqual(plain(backend.lintPage(page)), plain(source.lintPage(page)));
    for (const {section} of backend.sectionRecords(page)) {
      const d = section.diagram;
      if (!d) continue;
      for (const name of ['diagramLayoutViews', 'layout'])
        assert.deepEqual(plain(backend[name](d)), plain(source[name](d)), file + ' ' + name);
      for (const host of ['default', 'backstage', 'confluence'])
        assert.deepEqual(plain(backend.sectionLayoutItems(d, host)), plain(source.sectionLayoutItems(d, host)), file + ' ' + host);
      for (const route of backend.diagramPathList(d)) {
        const projected = backend.diagramForPath(d, route.id);
        for (const name of ['foldNodeTones', 'foldPanelStates'])
          assert.deepEqual(plain(backend[name](projected)), plain(source[name](projected)), file + ' ' + name);
      }
    }
    assert.equal(JSON.stringify(raw), before, file + ' remains authored');
  }
});
