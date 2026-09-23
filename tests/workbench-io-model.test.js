'use strict';
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {readSource}=require('../tools/source-loader.cjs');
const ROOT=path.join(__dirname,'..'),B={};
for(const name of ['document','window','navigator','FileReader','fetch'])
  Object.defineProperty(B,name,{get(){throw new Error('Pure I/O model accessed '+name);}});
vm.runInNewContext(readSource('workbench/io-model.js'),B);
const V={};vm.runInNewContext(readSource('validator.js'),V);
const plain=v=>JSON.parse(JSON.stringify(v));
const MERMAID_SEQ='sequenceDiagram\nparticipant A as Alpha Svc\nparticipant B\n'+
  'A->>B: POST /things\nB-->>A: created\n';

test('specFileName slugs the page title and falls back cleanly', () => {
  assert.strictEqual(B.specFileName({page: {title: 'Cumulus IoT — device messaging'}}),
    'cumulus-iot-device-messaging.spec.json');
  assert.strictEqual(B.specFileName({title: 'No wrapper'}), 'no-wrapper.spec.json');
  assert.strictEqual(B.specFileName({page: {title: '***'}}), 'flowspec.spec.json');
  assert.strictEqual(B.specFileName(null), 'flowspec.spec.json');
  assert.strictEqual(B.specFileName({nodes: {}, rows: []}), 'flowspec.spec.json');
});

function mermaidDiagram(text){ return B.mermaidToSpec(text).page.sections[0].diagram; }

test('mermaidToSpec makes a bland two-participant page with solid and return edges', () => {
  const spec = plain(B.mermaidToSpec(MERMAID_SEQ));
  assert.strictEqual(spec.page.title, 'Converted sequence');
  assert.strictEqual(spec.page.sections[0].heading, spec.page.title);
  const d = spec.page.sections[0].diagram;
  assert.strictEqual(d.view, 'ambient');
  assert.deepStrictEqual(d.nodes, {
    a: {title: 'Alpha Svc', sub: '', icon: 'gear', tint: 'cmd'},
    b: {title: 'B', sub: '', icon: 'gear', tint: 'cmd'}
  });
  assert.deepStrictEqual(d.rows, [['a'], ['b']]);
  assert.deepStrictEqual(d.edges, [
    {from: 'a', to: 'b', kind: 'https', label: 'POST /things'},
    {from: 'b', to: 'a', kind: 'int', label: 'created', ret: true}
  ]);
  assert.deepStrictEqual(d.steps, [
    {edge: 'a->b', text: 'POST /things'}, {edge: 'b->a', text: 'created'}
  ]);
  assert.deepStrictEqual(spec.todos, []);
});

test('mermaidToSpec slugs implicit participants and honors later aliases without reordering', () => {
  const d = mermaidDiagram('sequenceDiagram\nFoo-Bar->>constructor: hi\n' +
    'participant Foo_Bar as New label\nparticipant Foo-Bar\n');
  assert.deepStrictEqual(Object.keys(d.nodes), ['foobar', 'constructor']);
  assert.strictEqual(d.nodes.foobar.title, 'New label');
  assert.strictEqual(d.nodes.constructor.title, 'constructor');
});

test('mermaidToSpec extracts the first markdown mermaid fence as the Python oracle does', () => {
  assert.deepStrictEqual(plain(B.mermaidToSpec('# Intro\n\n```mermaid\n' + MERMAID_SEQ +
    '```\nprose\n```mermaid\nsequenceDiagram\nX->>Y: later\n```')), plain(B.mermaidToSpec(MERMAID_SEQ)));
  assert.throws(() => B.mermaidToSpec('```mermaid\nflowchart TD\n```\n```mermaid\n' +
    MERMAID_SEQ + '```'), /line 1: not a sequenceDiagram/);
});

test('mermaidToSpec infers protocols in Python priority order and splits long flows into rows', () => {
  const d = mermaidDiagram('sequenceDiagram\nautonumber\nA->>B: GET mqtt status\n' +
    'B->>C: PUBLISH topic (QoS 1)\nC->>D: plain call\nD->>E: subscribe\n');
  assert.deepStrictEqual(plain(d.edges.map(e => e.kind)), ['https', 'mqtt', 'int', 'mqtt']);
  assert.deepStrictEqual(plain(d.rows), [['a', 'b', 'c'], ['d', 'e']]);
  assert.deepStrictEqual(plain(mermaidDiagram('sequenceDiagram\nA->>A: self').rows), [['a']]);
});

test('mermaidToSpec folds repeated pairs with first label kind and arrow winning but keeps every step', () => {
  for (const arrow of ['->>', '-->>']){
    const d = mermaidDiagram('sequenceDiagram\nA' + arrow + 'B: first\n' +
      'A-->>B: GET second\nA->>B: PUBLISH third');
    assert.strictEqual(d.edges.length, 1);
    assert.strictEqual(d.edges[0].label, 'first');
    assert.strictEqual(d.edges[0].kind, 'int');
    assert.strictEqual(d.edges[0].ret, arrow === '-->>' ? true : undefined);
    assert.deepStrictEqual(plain(d.steps), [
      {edge: 'a->b', text: 'first'}, {edge: 'a->b', text: 'GET second'},
      {edge: 'a->b', text: 'PUBLISH third'}
    ]);
  }
});

test('mermaidToSpec records alt opt loop and par todos and skips their messages and participants', () => {
  for (const block of ['alt', 'opt', 'loop', 'par']){
    const spec = B.mermaidToSpec('sequenceDiagram\nA->>B: outside\n' + block + ' condition\n' +
      'participant C as Hidden\nB->>C: skipped\nelse other\nC-->>A: also skipped\nend');
    assert.deepStrictEqual(plain(spec.todos), [block + ' condition block not converted (2 message(s) inside) — add by hand']);
    const d = spec.page.sections[0].diagram;
    assert.deepStrictEqual(Object.keys(d.nodes), ['a', 'b']);
    assert.deepStrictEqual(plain(d.steps), [{edge: 'a->b', text: 'outside'}]);
  }
});

test('mermaidToSpec counts nested blocks once and preserves notes in encounter order', () => {
  const spec = B.mermaidToSpec('sequenceDiagram\nNote over A: before\nA->>B: outside\n' +
    'alt outer\nA->>B: one\nloop inner\nnote over B: inside\nB-->>A: two\nend\nend\nopt empty\nend');
  assert.deepStrictEqual(plain(spec.todos), [
    'note not converted: Note over A: before', 'note not converted: note over B: inside',
    'alt outer block not converted (2 message(s) inside) — add by hand',
    'opt empty block not converted (0 message(s) inside) — add by hand'
  ]);
  assert.strictEqual(spec.page.sections[0].diagram.steps.length, 1);
});

test('mermaidToSpec rejects garbage and malformed or message-free input with line information', () => {
  const cases = [
    ['', /line 1: not a sequenceDiagram/],
    ['flowchart TD\nA-->B', /line 1: not a sequenceDiagram/],
    ['sequenceDiagram\n\nA-xB: dies', /line 2: unsupported syntax.*A-xB/],
    ['sequenceDiagram\nelse ok', /line 2: 'else' outside/],
    ['sequenceDiagram\nend', /line 2: 'end' without/],
    ['sequenceDiagram\nalt x\nA->>B: inside', /line 2: unclosed/],
    ['sequenceDiagram\nparticipant A', /line 2: no messages/],
    ['sequenceDiagram\nopt x\nA->>B: inside\nend', /line 4: no messages/],
    ['sequenceDiagram\nA->>!!!: hi', /line 2: participant id.*slugs to nothing/],
    ['sequenceDiagram\nA->>B:', /line 2: unsupported syntax/],
    ['sequenceDiagram\nA->>B: hi\nalt x\nactivate B\nend', /line 4: unsupported syntax/]
  ];
  for (const [input, error] of cases) assert.throws(() => B.mermaidToSpec(input), error);
  assert.throws(() => B.mermaidToSpec(null), /line 1: expected mermaid text/);
});

test('mermaidToSpec converts the cumulus HLD and validates skeletons with zero errors', () => {
  const hld = fs.readFileSync(path.join(ROOT, 'examples/cumulus/cumulus-hld.md'), 'utf8');
  const converted = B.mermaidToSpec(hld);
  const d = converted.page.sections[0].diagram;
  assert.strictEqual(Object.keys(d.nodes).length, 8);
  assert.ok(d.edges.length >= 10);
  assert.strictEqual(d.steps.length, 12);
  for (const spec of [converted, B.mermaidToSpec(MERMAID_SEQ),
    B.mermaidToSpec('sequenceDiagram\nA->>B: first\nA->>B: second')]){
    assert.deepStrictEqual(plain(V.validate(V.normalize(spec)).errors), []);
  }
});

const TPL_OPEN = '<scr' + 'ipt type="application/json" id="flowspec">';

const TPL_CLOSE = '</scr' + 'ipt>';

function miniTemplate(){
  return ['<!doctype html>', '<title>Old Title</title>',
          TPL_OPEN, '{"old": true}', TPL_CLOSE, '<main></main>'].join('\n');
}

test('buildExportHtml swaps the spec block and retitles the page', () => {
  const spec = JSON.stringify({page: {title: 'Cats & <Dogs>', blocks: []}});
  const out = B.buildExportHtml(miniTemplate(), spec);
  assert.ok(!out.error);
  assert.ok(out.html.includes(TPL_OPEN + '\n' + spec + '\n' + TPL_CLOSE));
  assert.ok(!out.html.includes('"old"'));
  assert.ok(out.html.includes('<title>Cats &amp; &lt;Dogs&gt;</title>'));
});

test('buildExportHtml refuses bad templates and bad specs', () => {
  const spec = '{"page": {"title": "T"}}';
  assert.match(B.buildExportHtml('<main>no block</main>', spec).error, /exactly one flowspec/);
  const twice = miniTemplate() + '\n' + miniTemplate();
  assert.match(B.buildExportHtml(twice, spec).error, /found 2/);
  assert.match(B.buildExportHtml(miniTemplate(), '{nope').error, /not valid JSON/);
  assert.match(B.buildExportHtml(miniTemplate(), '{"a": "x</scr' + 'ipt>"}').error, /escape it/);
  /* HTML tag names are case-insensitive — an uppercase close must be caught too */
  assert.match(B.buildExportHtml(miniTemplate(), '{"a": "x</SCR' + 'IPT><img>"}').error, /escape it/);
  assert.match(B.buildExportHtml(miniTemplate(), '{"a": "x</ScR' + 'iPt>"}').error, /escape it/);
  /* a prose mention of the opener mid-line is NOT a block (line-anchored) */
  const prose = miniTemplate().replace('<main></main>', '<p>about ' + TPL_OPEN + ' tags</p>');
  const out = B.buildExportHtml(prose, spec);
  assert.ok(!out.error);
});

test('buildExportHtml accepts a CRLF template', () => {
  const crlf = miniTemplate().replace(/\n/g, '\r\n');
  const spec = '{"page": {"title": "T"}}';
  const out = B.buildExportHtml(crlf, spec);
  assert.ok(!out.error, out.error);
  assert.ok(out.html.includes(spec));
  assert.ok(out.html.includes('<title>T</title>'));
});

test('buildExportHtml leaves the title alone when the spec has none', () => {
  const out = B.buildExportHtml(miniTemplate(), '{"nodes": {"a": {}}, "rows": [["a"]]}');
  assert.ok(!out.error);
  assert.ok(out.html.includes('<title>Old Title</title>'));
});
