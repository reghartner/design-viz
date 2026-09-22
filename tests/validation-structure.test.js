'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {readSource} = require('../tools/source-loader.cjs');
const packaged = require('../tools/canon/generated-runtime.cjs');

const source = vm.createContext({URL, TextEncoder});
for (const file of ['compatibility.js', 'canon.js', 'validator.js', 'engine.js', 'confluence.js'])
  vm.runInContext(readSource(file), source);
const plain = value => JSON.parse(JSON.stringify(value));
const diagram = patch => ({nodes: {a: {}}, rows: [['a']], ...patch});
const wrapped = value => ({page: {sections: [{diagram: value}]}});

function validateBoth(raw) {
  const before = JSON.stringify(raw);
  const result = plain(source.validate(source.normalize(raw)));
  assert.deepEqual(packaged.validateSpec(raw), result, 'packaged/source findings agree');
  assert.deepEqual(plain(source.validate(source.normalize(raw))), result, 'findings are deterministic');
  assert.equal(JSON.stringify(raw), before, 'validation preserves authored input');
  return result;
}

const repros = [
  [{page: {blocks: {}}}, 'page.blocks: must be an array'],
  [{page: {sections: 'oops'}}, 'page.sections: must be an array'],
  [wrapped(diagram({steps: {}})), 'sections[0].diagram.steps: must be an array'],
  [{page: {blocks: [{tabs: [null]}]}}, 'blocks[0].tabs[0]: must be an object'],
];

test('the reported structural failures return exact findings in source, package and host export', () => {
  for (const [raw, error] of repros) {
    assert.deepEqual(validateBoth(raw), {errors: [error], warnings: []});
    assert.deepEqual(plain(source.buildConfluenceExport(JSON.stringify(raw))), {error});
  }
});

test('malformed page and tab containers are rejected before normalization can hide them', () => {
  for (const value of [null, false, 0, 'oops', {}]) {
    for (const key of ['blocks', 'sections']) {
      const raw = {[key]: value};
      assert.equal(source.normalize(raw), raw);
      assert.deepEqual(validateBoth(raw).errors, ['page.' + key + ': must be an array']);
    }
    assert.deepEqual(validateBoth({page: {blocks: [{tabs: value}]}}).errors, ['blocks[0].tabs: must be an array']);
    assert.deepEqual(validateBoth({page: {blocks: [{tabs: [{sections: value}]}]}}).errors,
      ['blocks[0].tabs[0].sections: must be an array']);
  }
  for (const value of [null, false, 0, 'oops', []]) {
    for (const raw of [value, {page: value, sections: [{heading: 'Do not use this fallback'}]}])
      assert.match(validateBoth(raw).errors[0], /^top level: expected/);
  }
});

test('diagram containers and entries fail before dependent paths, layouts, routing or panel callbacks', () => {
  for (const key of ['edges', 'floats', 'panels', 'steps']) {
    for (const value of [false, 0, 'oops', {}]) {
      const d = diagram({routing: 'lanes', layouts: [{id: 'main', name: 'Main', steps: ['start']}], [key]: value});
      assert.deepEqual(validateBoth(wrapped(d)).errors, ['sections[0].diagram.' + key + ': must be an array']);
    }
    for (const value of [null, false, 0, 'oops', []]) {
      const d = diagram({routing: 'lanes', paths: [{id: 'happy', steps: ['start']}], [key]: [value]});
      assert.deepEqual(validateBoth(wrapped(d)).errors, ['sections[0].diagram.' + key + '[0]: must be an object']);
    }
  }
  for (const value of [false, 0, 'oops', []]) {
    assert.deepEqual(validateBoth(wrapped(value)).errors, ['sections[0].diagram: must be an object']);
    assert.deepEqual(validateBoth(wrapped(diagram({nodes: value}))).errors, ['sections[0].diagram.nodes: must be an object']);
  }
  for (const value of [null, false, 0, 'oops', []]) {
    assert.deepEqual(validateBoth(wrapped(diagram({nodes: {a: value}}))).errors, ['sections[0].diagram.nodes.a: must be an object']);
    assert.match(validateBoth({page: {sections: [value]}}).errors[0], /sections\[0\]: must be an object$/);
    assert.deepEqual(validateBoth({page: {blocks: [{tabs: [{sections: [value]}]}]}}).errors,
      ['blocks[0].tabs[0].sections[0]: must be an object']);
  }
});

test('missing rows remain an error and optional null containers keep their absent semantics', () => {
  assert.deepEqual(validateBoth(wrapped({nodes: {a: {}}})).errors,
    ['sections[0].diagram.rows: required — array of rows, each an array of node ids (nested array = stack)']);
  assert.deepEqual(validateBoth(diagram({edges: null, floats: null, panels: null, steps: null})), {errors: [], warnings: []});
  assert.deepEqual(validateBoth({sections: [{heading: 'Prose', diagram: null}]}), {errors: [], warnings: []});
});

test('Canon traversal tolerates malformed tabs and null trace-match panels before core validation', () => {
  for (const value of [null, false, 0, 'oops', [], {}]) {
    const raw = {page: {blocks: [{tabs: [value]}, {diagram: value}]}};
    assert.doesNotThrow(() => source.FlowCanon.sections(raw));
    assert.deepEqual(Array.from(source.FlowCanon.validate(raw)), []);
  }
  const raw = wrapped(diagram({panels: [null], steps: [{id: 'start', traceMatch: {
    serviceName: 'service', operation: 'consume', panelId: 'queue',
  }}]}));
  assert.deepEqual(Array.from(source.FlowCanon.validate(raw)), ['traceMatch.panelId: expected a declared queue panel']);
  assert.deepEqual(validateBoth(raw).errors, ['sections[0].diagram.panels[0]: must be an object']);
});

test('valid starters retain input values and only the known legacy expansion warning', () => {
  const directory = path.join(__dirname, '../src/starters');
  for (const file of fs.readdirSync(directory).filter(file => file.endsWith('.json'))) {
    const raw = JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8'));
    const warnings = file === 'domain-drilldown.json'
      ? ['sections[0].diagram.nodes.recording.detail.mode: inline expansion was removed; opens as a focused drilldown. Use focus for new diagrams.']
      : [];
    assert.deepEqual(validateBoth(raw), {errors: [], warnings}, file);
  }
  const d = diagram(), section = {diagram: d}, page = {sections: [section]};
  assert.equal(source.normalize({page}), page);
  assert.equal(source.normalize(page), page);
  assert.equal(source.normalize(d).sections[0].diagram, d);
  for (const raw of [d, page, {page}, {blocks: [section]}, {blocks: [{tabs: [{sections: [section]}]}]}])
    assert.deepEqual(validateBoth(raw), {errors: [], warnings: []});
});

test('recoverable panel and presentation mistakes keep warning severity', () => {
  const raw = wrapped(diagram({panels: [{id: 'p', type: 'waterfall', spans: {}}],
    layouts: [null], steps: [{panels: {p: []}}]}));
  const result = validateBoth(raw);
  assert.deepEqual(result.errors, []);
  assert.equal(result.warnings.length, 3);
  assert.match(result.warnings[0], /layouts\[0\]: expected a named layout/);
  assert.match(result.warnings[1], /panels\[0\].spans: waterfall needs spans/);
  assert.match(result.warnings[2], /panels.p: patch must be an object/);
});

test('unexpected programming errors are not converted into spec diagnostics', () => {
  source.PanelRegistry.define('broken-validator-test', {validateDeclaration() { throw new Error('programming defect'); }});
  assert.throws(() => source.validate(source.normalize(diagram({panels: [{id: 'p', type: 'broken-validator-test'}]}))),
    /programming defect/);
});
