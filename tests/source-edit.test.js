'use strict';
/* Pure source operations load no validator, panel registry or inspector. */
const test = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const {readSource} = require('../tools/source-loader.cjs');
const context = {};
for (const name of ['document', 'window', 'PanelRegistry'])
  Object.defineProperty(context, name, {get(){ throw new Error('Unexpected dependency: ' + name); }});
vm.createContext(context);
for (const name of ['workbench/source-edit.js', 'workbench/targets.js'])
  vm.runInContext(readSource(name), context);
const B = context;
const plain = value => JSON.parse(JSON.stringify(value));

const SPEC = {
  page: {
    title: 'T',
    blocks: [
      {heading: 'Plain', accent: 'green',
       diagram: {
         nodes: {a: {title: 'A'}, b: {title: 'B "quoted" }brace{'}},
         rows: [['a', 'b']],
         edges: [{from: 'a', to: 'b', kind: 'int', label: 'call'}],
         steps: [{edge: 'a->b', text: 'first'}]
       }},
      {tabs: [
        {label: 'One', sections: [
          {heading: 'InTab',
           diagram: {nodes: {x: {title: 'X'}, y: {title: 'Y'}},
                     rows: [['x', 'y']],
                     edges: [{from: 'x', to: 'y'}],
                     panels: [{id: 'p', type: 'queue', initial: {state: 'empty'}}]}}
        ]},
        {label: 'Two', sections: [{heading: 'Second tab'}]}
      ]}
    ]
  }
};
const TEXT = JSON.stringify(SPEC, null, 2);

const PROSE = {
  page: {
    blocks: [
      {heading: 'P', text: ['first paragraph', 'second paragraph'],
       bullets: ['plain point', {text: 'fancy point', sub: ['child'], revealAt: 1}],
       contract: {title: 'Wire', fields: [
         {k: 'topic', v: 'a/b', g: 'where'},
         {k: 'ttl', v: '30s'}
       ]},
       diagram: {nodes: {a: {title: 'A'}, b: {title: 'B'}, c: {title: 'C'}},
                 rows: [['a', ['b', 'c']]],
                 edges: [{from: 'a', to: 'b', labelDx: -40}],
                 steps: [{edge: 'a->b', text: 's1'}]}}
    ]
  }
};

test('jsonLocate finds nested values and the ranges parse back to them', () => {
  const cases = [
    [['page', 'title'], SPEC.page.title],
    [['page', 'blocks', 0, 'diagram', 'nodes', 'a'], SPEC.page.blocks[0].diagram.nodes.a],
    [['page', 'blocks', 0, 'diagram', 'edges', 0], SPEC.page.blocks[0].diagram.edges[0]],
    [['page', 'blocks', 1, 'tabs', 1, 'sections', 0], {heading: 'Second tab'}],
    [['page', 'blocks', 0, 'diagram', 'nodes', 'b'], SPEC.page.blocks[0].diagram.nodes.b]
  ];
  for (const [p, want] of cases){
    const loc = B.jsonLocate(TEXT, p);
    assert.ok(loc, 'locates ' + JSON.stringify(p));
    assert.deepStrictEqual(JSON.parse(TEXT.slice(loc.start, loc.end)), want);
  }
});

test('jsonLocate returns the whole document for the empty path and null for misses', () => {
  const whole = B.jsonLocate(TEXT, []);
  assert.deepStrictEqual(JSON.parse(TEXT.slice(whole.start, whole.end)), SPEC);
  assert.strictEqual(B.jsonLocate(TEXT, ['page', 'missing']), null);
  assert.strictEqual(B.jsonLocate(TEXT, ['page', 'blocks', 9]), null);
  assert.strictEqual(B.jsonLocate(TEXT, ['page', 'title', 'deeper']), null);
  assert.strictEqual(B.jsonLocate('   ', []), null);
});

test('jsonLocate survives strings holding braces, brackets, and escaped quotes', () => {
  const tricky = '{"a": "}]\\"{[", "b": [1, "x,y", {"c": "\\\\"}], "d": 2}';
  const d = B.jsonLocate(tricky, ['d']);
  assert.strictEqual(tricky.slice(d.start, d.end), '2');
  const c = B.jsonLocate(tricky, ['b', 2, 'c']);
  assert.strictEqual(JSON.parse(tricky.slice(c.start, c.end)), '\\');
});

test('jsonInsertMember appends to populated and empty containers with sane indentation', () => {
  const objText = '{\n  "nodes": {\n    "a": {"title": "A"}\n  }\n}';
  const r1 = B.jsonInsertMember(objText, ['nodes'], 'b', '{"title": "B"}');
  const parsed1 = JSON.parse(r1.text);
  assert.deepStrictEqual(parsed1.nodes.b, {title: 'B'});
  assert.strictEqual(r1.text.slice(r1.start, r1.end), '{"title": "B"}');
  assert.ok(r1.text.includes('\n    "b": {"title": "B"}'), 'matches the sibling indent');

  const emptyText = '{\n  "edges": []\n}';
  const r2 = B.jsonInsertMember(emptyText, ['edges'], null, '{"from": "a", "to": "b"}');
  assert.deepStrictEqual(JSON.parse(r2.text).edges, [{from: 'a', to: 'b'}]);
  assert.strictEqual(r2.text.slice(r2.start, r2.end), '{"from": "a", "to": "b"}');
});

test('jsonInsertMember refuses a key/container mismatch', () => {
  assert.strictEqual(B.jsonInsertMember('{"a": []}', ['a'], 'key', '1'), null);
  assert.strictEqual(B.jsonInsertMember('{"a": {}}', ['a'], null, '1'), null);
  assert.strictEqual(B.jsonInsertMember('{"a": 1}', ['a'], null, '1'), null);
});

test('jsonInsertMember re-indents multi-line snippets to the container depth', () => {
  const text = '{\n  "blocks": [\n    {"heading": "old"}\n  ]\n}';
  const r = B.jsonInsertMember(text, ['blocks'], null, '{\n  "heading": "new"\n}');
  assert.deepStrictEqual(JSON.parse(r.text).blocks[1], {heading: 'new'});
  assert.ok(r.text.includes('\n    {\n      "heading": "new"\n    }'), 'nested lines pick up the member indent');
});

test('jsonInsertListItemOrCreate creates the list when absent and appends when present', () => {
  const noList = '{\n  "diagram": {\n    "nodes": {}\n  }\n}';
  const made = B.jsonInsertListItemOrCreate(noList, ['diagram'], 'edges', '{"from": "a", "to": "b"}');
  assert.deepStrictEqual(JSON.parse(made.text).diagram.edges, [{from: 'a', to: 'b'}]);
  const appended = B.jsonInsertListItemOrCreate(made.text, ['diagram'], 'edges', '{"from": "b", "to": "a"}');
  assert.strictEqual(JSON.parse(appended.text).diagram.edges.length, 2);
});

test('specSectionPaths mirrors render order across blocks, tabs, aliases, and bare diagrams', () => {
  const paths = B.specSectionPaths(SPEC).map(r => r.section);
  assert.deepStrictEqual(plain(paths), [
    ['page', 'blocks', 0],
    ['page', 'blocks', 1, 'tabs', 0, 'sections', 0],
    ['page', 'blocks', 1, 'tabs', 1, 'sections', 0]
  ]);
  const alias = B.specSectionPaths({sections: [{heading: 'a'}, {heading: 'b'}]});
  assert.deepStrictEqual(plain(alias.map(r => r.section)), [['sections', 0], ['sections', 1]]);
  const bare = B.specSectionPaths({nodes: {a: {}}, rows: [['a']]});
  assert.deepStrictEqual(plain(bare), [{section: [], diagram: []}]);
  assert.deepStrictEqual(plain(B.specSectionPaths(null)), []);
  assert.deepStrictEqual(plain(B.specSectionPaths({page: {}})), []);
});

test('builderTargetPath maps every selectable kind, including the bare-diagram page', () => {
  assert.deepStrictEqual(plain(B.builderTargetPath(SPEC, {section: 0, kind: 'node', id: 'a'})),
    ['page', 'blocks', 0, 'diagram', 'nodes', 'a']);
  assert.deepStrictEqual(plain(B.builderTargetPath(SPEC, {section: 1, kind: 'edge', index: 0})),
    ['page', 'blocks', 1, 'tabs', 0, 'sections', 0, 'diagram', 'edges', 0]);
  assert.deepStrictEqual(plain(B.builderTargetPath(SPEC, {section: 0, kind: 'step', index: 0})),
    ['page', 'blocks', 0, 'diagram', 'steps', 0]);
  assert.deepStrictEqual(plain(B.builderTargetPath(SPEC, {section: 1, kind: 'panel', index: 0})),
    ['page', 'blocks', 1, 'tabs', 0, 'sections', 0, 'diagram', 'panels', 0]);
  assert.deepStrictEqual(plain(B.builderTargetPath(SPEC, {section: 2, kind: 'section'})),
    ['page', 'blocks', 1, 'tabs', 1, 'sections', 0]);
  const grouped = JSON.parse(JSON.stringify(SPEC));
  grouped.page.blocks[0].diagram.groups = {dev: {title: 'Device'}};
  assert.deepStrictEqual(plain(B.builderTargetPath(grouped, {section: 0, kind: 'group', id: 'dev'})),
    ['page', 'blocks', 0, 'diagram', 'groups', 'dev']);
  assert.strictEqual(B.builderTargetPath(grouped, {section: 0, kind: 'group', id: 'undeclared'}), null);
  const bare = {nodes: {a: {}}, rows: [['a']]};
  assert.deepStrictEqual(plain(B.builderTargetPath(bare, {section: 0, kind: 'node', id: 'a'})), ['nodes', 'a']);
  assert.strictEqual(B.builderTargetPath(SPEC, {section: 9, kind: 'node', id: 'a'}), null);
});

test('builderPathString prints dotted paths with indexes and quotes odd keys', () => {
  assert.strictEqual(B.builderPathString(['page', 'blocks', 0, 'diagram', 'nodes', 'a']),
    'page.blocks[0].diagram.nodes.a');
  assert.strictEqual(B.builderPathString(['nodes', 'my node']), 'nodes."my node"');
  assert.strictEqual(B.builderPathString([]), '(whole document)');
});

test('jsonReplaceValue swaps a value in place and re-indents multi-line output', () => {
  const r = B.jsonReplaceValue(TEXT, ['page', 'title'], '"Renamed"');
  assert.strictEqual(JSON.parse(r.text).page.title, 'Renamed');
  assert.strictEqual(r.text.slice(r.start, r.end), '"Renamed"');
  const multi = B.jsonReplaceValue(TEXT, ['page', 'blocks', 0, 'diagram', 'edges'],
    '[\n  {"from": "b", "to": "a"}\n]');
  assert.deepStrictEqual(JSON.parse(multi.text).page.blocks[0].diagram.edges, [{from: 'b', to: 'a'}]);
  assert.strictEqual(B.jsonReplaceValue(TEXT, ['page', 'nope'], '1'), null);
});

test('jsonRemoveMember removes first, middle, last, and only members cleanly', () => {
  const obj = '{"a": 1, "b": 2, "c": 3}';
  assert.deepStrictEqual(JSON.parse(B.jsonRemoveMember(obj, [], 'a').text), {b: 2, c: 3});
  assert.deepStrictEqual(JSON.parse(B.jsonRemoveMember(obj, [], 'b').text), {a: 1, c: 3});
  assert.deepStrictEqual(JSON.parse(B.jsonRemoveMember(obj, [], 'c').text), {a: 1, b: 2});
  assert.deepStrictEqual(JSON.parse(B.jsonRemoveMember('{"only": 1}', [], 'only').text), {});
  const arr = '{"xs": [10, 20, 30]}';
  assert.deepStrictEqual(JSON.parse(B.jsonRemoveMember(arr, ['xs'], 1).text).xs, [10, 30]);
  assert.deepStrictEqual(JSON.parse(B.jsonRemoveMember(arr, ['xs'], 2).text).xs, [10, 20]);
  assert.strictEqual(B.jsonRemoveMember(obj, [], 'zz'), null);
});

test('jsonSetField replaces, inserts, and removes one field surgically', () => {
  const nodePath = ['page', 'blocks', 0, 'diagram', 'nodes', 'a'];
  const rep = B.jsonSetField(TEXT, nodePath, 'title', '"A2"');
  assert.strictEqual(JSON.parse(rep.text).page.blocks[0].diagram.nodes.a.title, 'A2');
  const ins = B.jsonSetField(TEXT, nodePath, 'icon', '"db"');
  assert.strictEqual(JSON.parse(ins.text).page.blocks[0].diagram.nodes.a.icon, 'db');
  const rem = B.jsonSetField(TEXT, nodePath, 'title', null);
  assert.deepStrictEqual(plain(JSON.parse(rem.text).page.blocks[0].diagram.nodes.a), {});
  const noop = B.jsonSetField(TEXT, nodePath, 'ghost', null);
  assert.strictEqual(noop.text, TEXT);
  /* the rest of the document is untouched by a surgical edit */
  assert.ok(rep.text.includes('"Second tab"'));
});

test('jsonInsertArrayItemAfter splices directly after the anchor member', () => {
  const text = '{\n  "xs": [\n    10,\n    20\n  ]\n}';
  const r = B.jsonInsertArrayItemAfter(text, ['xs'], 0, '15');
  assert.deepStrictEqual(JSON.parse(r.text).xs, [10, 15, 20]);
  assert.strictEqual(r.text.slice(r.start, r.end), '15');
  const tail = B.jsonInsertArrayItemAfter(text, ['xs'], 1, '30');
  assert.deepStrictEqual(JSON.parse(tail.text).xs, [10, 20, 30]);
  assert.strictEqual(B.jsonInsertArrayItemAfter(text, ['xs'], 5, '1'), null);
  assert.strictEqual(B.jsonInsertArrayItemAfter('{"o": {}}', ['o'], 0, '1'), null);
});

test('builderTargetPath maps bullets, paragraphs (string and list), and contract rows', () => {
  assert.deepStrictEqual(plain(B.builderTargetPath(PROSE, {section: 0, kind: 'bullet', index: 1})),
    ['page', 'blocks', 0, 'bullets', 1]);
  assert.deepStrictEqual(plain(B.builderTargetPath(PROSE, {section: 0, kind: 'para', index: 1})),
    ['page', 'blocks', 0, 'text', 1]);
  const stringText = {page: {blocks: [{heading: 'S', text: 'one paragraph'}]}};
  assert.deepStrictEqual(plain(B.builderTargetPath(stringText, {section: 0, kind: 'para', index: 0})),
    ['page', 'blocks', 0, 'text']);
  assert.deepStrictEqual(plain(B.builderTargetPath(PROSE, {section: 0, kind: 'crow', index: 1})),
    ['page', 'blocks', 0, 'contract', 'fields', 1]);
});

test('builderTabPath addresses tabs by block index across page shapes', () => {
  assert.deepStrictEqual(plain(B.builderTabPath(SPEC, 1, 1)),
    ['page', 'blocks', 1, 'tabs', 1]);
  assert.strictEqual(B.builderTabPath(SPEC, 0, 0), null); /* plain section block */
  assert.strictEqual(B.builderTabPath(SPEC, 1, 9), null);
  const alias = {sections: [{tabs: [{label: 'A', sections: []}]}]};
  assert.deepStrictEqual(plain(B.builderTabPath(alias, 0, 0)), ['sections', 0, 'tabs', 0]);
  assert.strictEqual(B.builderTabPath({nodes: {}, rows: []}, 0, 0), null);
});

test('jsonSwapListItems trades two item spans and keeps each item formatting', () => {
  const text = '{\n  "list": [\n    {"a": 1},\n    "middle",\n    {"c":\n     3}\n  ]\n}';
  const swap = B.jsonSwapListItems(text, ['list'], 0, 2);
  assert.deepStrictEqual(JSON.parse(swap.text).list, [{c: 3}, 'middle', {a: 1}]);
  assert.ok(swap.text.includes('{"c":\n     3}'), 'multi-line item formatting survives');
  assert.strictEqual(swap.text.slice(swap.first.start, swap.first.end), '{"c":\n     3}');
  assert.strictEqual(swap.text.slice(swap.second.start, swap.second.end), '{"a": 1}');
  assert.strictEqual(B.jsonSwapListItems(text, ['list'], 1, 1), null);
  assert.strictEqual(B.jsonSwapListItems(text, ['list'], 0, 9), null);
});

test('surgical replacements retain CRLF, escapes and every byte outside the selected value', () => {
  const text = '{\r\n\t"outside" : "\\u0041",\r\n\t"list" : [ 1 , {"title" : "before", "raw":"\\\\path"} , 30 ],\r\n\t"tail": true\r\n}\r\n';
  const target = ['list', 1, 'title'], original = B.jsonLocate(text, target);
  const value = JSON.stringify('after "quoted" \\ path');
  const result = B.jsonReplaceValue(text, target, value);
  assert.strictEqual(result.text, text.slice(0, original.start) + value + text.slice(original.end));
  assert.strictEqual(result.start, original.start);
  assert.strictEqual(result.end, original.start + value.length);
  assert.strictEqual(result.text.slice(result.start, result.end), value);
  assert.strictEqual(JSON.parse(result.text).outside, 'A');
  assert.ok(result.text.includes('"outside" : "\\u0041"'), 'untouched string escaping is retained');
  assert.strictEqual((result.text.match(/\r\n/g) || []).length, 5);
  assert.strictEqual(B.jsonSetField(text, ['list', 1], 'missing', null).text, text, 'existing no-op contract stays verbatim');
});

test('insert/remove/swap keep authored CRLF and separators while reporting offsets in the result', () => {
  const text = '{\r\n\t"xs": [\r\n\t\t{"id":"a"},\r\n\t\t{"id" : "long-b"}\r\n\t],\r\n\t"keep": "\\u263a"\r\n}\r\n';
  const inserted = B.jsonInsertArrayItemAfter(text, ['xs'], 0, '{\n  "id": "new"\n}');
  const value = '{\n\t\t  "id": "new"\n\t\t}';
  const expected = text.replace('{"id":"a"}', '{"id":"a"},\n\t\t' + value);
  assert.strictEqual(inserted.text, expected, 'new snippet uses existing LF policy without rewriting surrounding CRLF');
  assert.strictEqual(inserted.start, expected.indexOf(value));
  assert.strictEqual(inserted.end, inserted.start + value.length);
  assert.strictEqual(inserted.text.slice(inserted.start, inserted.end), value);
  assert.strictEqual(B.jsonRemoveMember(inserted.text, ['xs'], 1).text,
    text.replace(',\r\n\t\t{"id"', ',\n\t\t{"id"'), 'removal retains the already-authored separator before the removed item');
  const swapped = B.jsonSwapListItems(text, ['xs'], 1, 0);
  assert.strictEqual(swapped.text, text.replace('{"id":"a"}', '{"id" : "long-b"}').replace(',\r\n\t\t{"id" : "long-b"}', ',\r\n\t\t{"id":"a"}'));
  assert.strictEqual(swapped.text.slice(swapped.first.start, swapped.first.end), '{"id" : "long-b"}');
  assert.strictEqual(swapped.text.slice(swapped.second.start, swapped.second.end), '{"id":"a"}');
  assert.strictEqual(swapped.first.start, B.jsonLocate(swapped.text, ['xs', 0]).start);
  assert.strictEqual(swapped.second.start, B.jsonLocate(swapped.text, ['xs', 1]).start);
});

test('raw diagram and tab addresses preserve wrappers and prose ordinals without viewer normalization', () => {
  const diagram = {nodes: {x: {title: 'Hidden'}}, rows: [['x']]};
  const raw = {page: {sections: [{text: 'Prose'}, {tabs: []},
    {tabs: [{label: 'Hidden', sections: [{diagram}]}]}]}};
  const text = JSON.stringify(raw), before = text;
  const target = {section: 1, kind: 'node', id: 'x'};
  const address = ['page', 'sections', 2, 'tabs', 0, 'sections', 0, 'diagram', 'nodes', 'x'];
  assert.deepStrictEqual(plain(B.builderTargetPath(raw, target)), address);
  assert.strictEqual(B.specValueAt(raw, address), diagram.nodes.x);
  assert.deepStrictEqual(plain(B.builderTargetPath(raw, {kind: 'tab', block: 2, tab: 0})), ['page', 'sections', 2, 'tabs', 0]);
  assert.deepStrictEqual(plain(B.builderTargetPath(raw.page, target)), address.slice(1));
  const located = B.builderDiagram(text, raw, 1);
  assert.deepStrictEqual(plain(located.path), address.slice(0, -2));
  assert.strictEqual(located.d, diagram);
  assert.match(B.builderDiagram(text, raw, 0).error, /no diagram yet/);
  assert.match(B.builderDiagram(text, raw, 9).error, /no section/);
  assert.deepStrictEqual(plain(B.builderDiagram(JSON.stringify(diagram), diagram, 0).path), []);
  assert.strictEqual(JSON.stringify(raw), before);
  assert.strictEqual(typeof B.initWorkbenchBuilder, 'undefined', 'pure addressing never loaded the inspector');
});
