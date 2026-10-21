'use strict';
process.env.FLOWVIEW_PACKAGES = 'science';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {readSource, readStyles, panelAssets} = require('../tools/source-loader.cjs');
const C = {URL, TextEncoder, console};
vm.createContext(C);
for (const file of ['validator.js','engine.js','builder.workbench.js','panel-picker.workbench.js','clipboard.workbench.js'])
  vm.runInContext(readSource(file), C);
const plain = value => JSON.parse(JSON.stringify(value));
const validate = d => plain(C.validate(C.normalize(d)));
const SEQ = 'ATGGCCATTGTAATGGGCCGCTGAAAGGGTGCCCGATAGCCTTAGGCA'; // 48 letters
const panel = (extra) => ({id:'seq', type:'sequence', label:'Reference', sequence:SEQ, ...extra});
const diagram = (p, steps, paths) => ({nodes:{n:{}}, rows:[['n']], panels:[p], steps:steps || [], paths});
const html = (p, state) => C.sequenceHTML(p, state);
const HOSTILE = '<img src=x onerror=bad()>';

test('sequence template, picker example, feature label and styles use ordinary discovery', () => {
  assert.deepEqual(validate(diagram({...plain(C.PANEL_TEMPLATES.sequence), id:'seq', type:'sequence'})), {errors:[], warnings:[]});
  const entry = C.PANEL_CATALOG.find(item => item.type === 'sequence');
  assert.equal(entry.category, 'Science & sequencing'); assert.equal(entry.order, 40); assert.equal(entry.name, 'Sequence track');
  const sample = C.panelPickerExample('sequence');
  assert.equal(sample.panel.type, 'sequence'); assert.equal(sample.state.marks.length, 2); assert.equal(sample.state.cursor, 17);
  assert.deepEqual(validate(diagram({...plain(sample.panel), id:'seq'})), {errors:[], warnings:[]});
  assert.equal(panelAssets().features['panel.sequence'].label, 'Sequence track panel');
  assert.equal(panelAssets().features['panel.sequence'].since, '0.2.0');
  assert.equal(C.PanelRegistry.get('sequence').order, 40);
  assert.deepEqual(plain(C.PanelRegistry.get('sequence').layout.sectionSizing), {minWidth:320, preferredWidth:520, maxWidth:1000, aspectPolicy:'content', grow:1});
  const css = readStyles('style.core.css');
  for (const rule of ['.seq-cur', '.seq-band', '.bio-b-a', '.bio-tone-good', '.bio-protein .bio-b-k', '.bio-legend']) assert.ok(css.includes(rule), rule);
  assert.match(css, /prefers-reduced-motion[^}]*\.seq-cur/);
});

test('model places letters by coordinate, clips to the window and layers later marks on top', () => {
  const p = panel({start:101, wrap:20});
  const m = C.sequenceModel(p, {
    marks:[{id:'a', from:101, to:110, tone:'good', label:'A'}, {id:'b', from:108, to:112, tone:'cut'}, {id:'c', from:1, to:5}, {id:'d', from:140, to:200, tone:'bad', label:'D'}],
    cursor:117, window:{from:105, to:130}, reveal:20});
  assert.equal(m.first, 101); assert.equal(m.last, 148); assert.equal(m.length, 48);
  assert.deepEqual(plain([m.from, m.to, m.hiddenBefore, m.hiddenAfter]), [105, 130, 4, 18]);
  assert.deepEqual(plain(m.rows.map(row => row.letters.length)), [20, 6]);
  assert.deepEqual(plain(m.rows.map(row => [row.from, row.to])), [[105, 124], [125, 130]]);
  const at = coord => m.rows.flatMap(row => row.letters).find(letter => letter.coord === coord);
  assert.equal(at(105).tone, 'good'); assert.equal(at(108).tone, 'cut'); assert.equal(at(110).tone, 'cut'); assert.equal(at(113).tone, null);
  assert.equal(at(105).ch, 'C'); assert.equal(at(105).cls, 'bio-b bio-b-c');
  assert.equal(m.cursor, 117); assert.equal(m.rows[0].cursorAt, 12); assert.equal(m.rows[1].cursorAt, -1);
  assert.equal(at(120).revealed, true); assert.equal(at(121).revealed, false);
  assert.deepEqual(plain(m.marks.map(mark => mark.id)), ['a', 'b', 'd']);
  assert.deepEqual(plain(m.marks[2]), {id:'d', from:140, to:148, tone:'bad', label:'D'});
  assert.deepEqual(plain(m.legend.map(mark => mark.label)), ['A', 'D']);
  assert.ok(m.rows[0].letters.find(letter => letter.coord === 110).tick);
  const whole = C.sequenceModel(panel({}), {});
  assert.equal(whole.window, null); assert.equal(whole.cursor, null); assert.equal(whole.reveal, null);
  assert.deepEqual(plain([whole.hiddenBefore, whole.hiddenAfter, whole.rows.length, whole.strand, whole.wrap]), [0, 0, 1, '+', 60]);
});

test('alphabets, unknown letters, length cap and wrap follow the declaration', () => {
  const protein = C.sequenceModel({id:'s', type:'sequence', alphabet:'protein', sequence:'mkr*'}, {});
  assert.deepEqual(plain(protein.rows[0].letters.map(letter => letter.cls)), ['bio-b bio-b-m', 'bio-b bio-b-k', 'bio-b bio-b-r', 'bio-b bio-b-stop']);
  assert.match(html({id:'s', type:'sequence', alphabet:'protein', sequence:'MK'}, {}), /seq-track bio-protein/);
  const rna = C.sequenceModel({id:'s', type:'sequence', alphabet:'rna', sequence:'acg u\n t'}, {});
  assert.deepEqual(plain(rna.rows[0].letters.map(letter => letter.ch + ':' + letter.unknown)), ['A:false', 'C:false', 'G:false', 'U:false', 'T:true']);
  assert.equal(rna.rows[0].letters[4].cls, 'bio-b bio-b-x'); assert.equal(rna.invalid, 1);
  const long = C.sequenceModel({id:'s', type:'sequence', sequence:'A'.repeat(300), wrap:120}, {reveal:250});
  assert.equal(long.length, 240); assert.deepEqual(plain(long.rows.map(row => row.letters.length)), [120, 120]); assert.equal(long.reveal, null);
  for (const wrap of [19, 121, 1.5, 'sixty', NaN, Infinity]) assert.equal(C.sequenceModel(panel({wrap}), {}).wrap, 60);
  for (const start of [0, -1, 1.5, '1', Number.MAX_SAFE_INTEGER, Infinity]) assert.equal(C.sequenceModel(panel({start}), {}).start, 1);
  const empty = C.sequenceModel({id:'s', type:'sequence'}, {marks:[{id:'a', from:1, to:2}], cursor:1});
  assert.equal(empty.length, 0); assert.deepEqual(plain(empty.marks), []); assert.equal(empty.cursor, null);
  assert.match(html({id:'s', type:'sequence'}, {}), /No sequence declared/);
});

test('warnings name declaration, initial, step and transient source paths', () => {
  const p = panel({alphabet:'xna', start:0, strand:'x', wrap:5, label:5, sequence:'ATGZ', initial:{
    marks:[{id:'a', from:9, to:2}, {from:1, to:2}, {id:'b', from:'1', to:2, tone:'zz', label:3}, {id:'b', from:1, to:2}],
    cursor:99, window:'no', reveal:-1, note:{}, bogus:1}});
  const d = diagram(p, [{id:'s1', panels:{seq:{marks:'x', cursor:NaN, reveal:1.5, enterOnce:{window:{from:3, to:1}}}}}]);
  const w = validate(d).warnings.join('\n');
  for (const path of ['panels[0].alphabet', 'panels[0].start', 'panels[0].strand', 'panels[0].wrap', 'panels[0].label',
    'panels[0].sequence: 1 letter is not in the dna alphabet (letter 4)', 'panels[0].initial.marks[0]: from 9 must be ≤ to 2',
    'panels[0].initial.marks[1].id', 'panels[0].initial.marks[2].from', 'panels[0].initial.marks[2].tone', 'panels[0].initial.marks[2].label',
    'panels[0].initial.marks[3].id: duplicate id "b"', 'panels[0].initial.cursor', 'panels[0].initial.window', 'panels[0].initial.reveal',
    'panels[0].initial.note', 'panels[0].initial.bogus: unknown field', 'steps[0].panels.seq.marks', 'steps[0].panels.seq.cursor',
    'steps[0].panels.seq.reveal', 'steps[0].panels.seq.enterOnce.window: from 3 must be ≤ to 1']) assert.ok(w.includes(path), path);
  assert.deepEqual(validate(d).errors, []);
  const outside = validate(diagram(panel({}), [{id:'s1', panels:{seq:{marks:[{id:'far', from:90, to:99}], window:{from:60, to:70}}}}])).warnings;
  assert.match(outside.join('\n'), /steps\[0\]\.panels\.seq\.marks\[0\]: range 90–99 lies outside 1–48/);
  assert.match(outside.join('\n'), /steps\[0\]\.panels\.seq\.window: range 60–70 lies outside 1–48/);
  const many = validate(diagram(panel({}), [{id:'s1', panels:{seq:{marks:Array.from({length:25}, (_, i) => ({id:'m' + i, from:1, to:2}))}}}])).warnings;
  assert.match(many.join('\n'), /steps\[0\]\.panels\.seq\.marks: only the first 24 marks render/);
  for (const sequence of [undefined, 7, '', '   ', 'A'.repeat(241)]) {
    const warnings = validate(diagram(panel({sequence}))).warnings.join('\n');
    assert.match(warnings, /panels\[0\]\.sequence/);
  }
  assert.deepEqual(validate(diagram(panel({strand:'-', alphabet:'rna', sequence:'ACGU', start:7, wrap:20,
    initial:{marks:null, cursor:null, window:null, reveal:null, note:'ok'}}), [{id:'s1', panels:{seq:{cursor:8, window:{from:7, to:9}, reveal:0}}}])), {errors:[], warnings:[]});
});

test('alternate paths fold independently, transient overrides last one step and the spec is never mutated', () => {
  const p = panel({initial:{marks:[{id:'a', from:1, to:3, tone:'good'}], cursor:2}});
  const d = diagram(p, [
    {id:'s1', panels:{seq:{cursor:5}}},
    {id:'s2', panels:{seq:{cursor:9, enterOnce:{reveal:3}}}},
    {id:'s3', panels:{seq:{window:{from:1, to:10}, cursor:'nine', marks:'none', reveal:Infinity}}},
    {id:'alt', panels:{seq:{cursor:null, marks:null, note:'cleared'}}},
  ], [{id:'happy', steps:['s1', 's2', 's3']}, {id:'alt', steps:['s1', 'alt']}]);
  const before = JSON.stringify(d);
  const happy = C.foldPanelStates(C.diagramForPath(d, 'happy')).seq, alt = C.foldPanelStates(C.diagramForPath(d, 'alt')).seq;
  assert.deepEqual(plain(happy.map(state => state.cursor)), [5, 9, 9]);
  assert.equal(happy[1].reveal, 3); assert.equal(happy[2].reveal, undefined);
  assert.deepEqual(plain(happy[2].window), {from:1, to:10});
  assert.equal(happy[2].marks.length, 1, 'an invalid marks patch keeps the carried snapshot');
  assert.equal(alt[1].cursor, null); assert.equal(alt[1].marks, null); assert.equal(alt[1].note, 'cleared');
  assert.equal(alt[1].window, undefined);
  C.sequenceHTML(p, happy[2]); C.sequenceModel(p, alt[1]);
  assert.equal(JSON.stringify(d), before);
  const rendered = html(p, alt[1]);
  assert.doesNotMatch(rendered, /seq-cur"/); assert.doesNotMatch(rendered, /bio-tone-good/); assert.match(rendered, /cleared/);
});

test('all authored text is escaped and hostile values never reach markup', () => {
  const p = {id:'s', type:'sequence', sequence:'ATG' + HOSTILE, label:HOSTILE, strand:HOSTILE, alphabet:HOSTILE, wrap:HOSTILE, start:HOSTILE};
  const out = html(p, {note:HOSTILE, marks:[{id:HOSTILE, from:1, to:3, label:HOSTILE, tone:HOSTILE}], cursor:Infinity, reveal:NaN, window:{from:NaN, to:Infinity}, extra:HOSTILE});
  assert.doesNotMatch(out, /<img|NaN|Infinity|undefined/);
  assert.match(out, /&lt;img src=x onerror=bad\(\)&gt;/);
  assert.match(out, /bio-tone-neutral/);
  assert.match(out, /aria-label="&lt;img src=x onerror=bad\(\)&gt;: DNA, \+ strand/);
  const quoted = html(panel({label:'"quoted" & <b>'}), {cursor:3});
  assert.match(quoted, /aria-label="&quot;quoted&quot; &amp; &lt;b&gt;: DNA/);
  const notes = html(panel({}), {note:{}});
  assert.doesNotMatch(notes, /object Object/); assert.doesNotMatch(notes, /swnote/);
  const letters = html(panel({}), {marks:[{id:'a', from:1, to:3, tone:'good', label:'Start'}, {id:'b', from:20, to:35, tone:'primer', label:'Primer'}], cursor:17, window:{from:10, to:40}, reveal:30});
  assert.match(letters, /… 9 more before 10/); assert.match(letters, /… 8 more after 40/);
  assert.match(letters, /class="seq-cur" style="--seq-at:7"/); assert.match(letters, /<i>17<\/i>/);
  assert.match(letters, /seq-bandcell bio-tone-primer seq-band-start/); assert.match(letters, /bio-tone-primer seq-band-end/);
  assert.doesNotMatch(letters, /seq-bandcell bio-tone-good/, 'marks outside the window draw no band');
  assert.match(letters, /bio-key"><i class="bio-tone-good"/, 'the legend still lists every mark');
  assert.equal((letters.match(/ seq-dim/g) || []).length, 10);
  assert.match(letters, /seq-tick-n"><i>10<\/i>/);
});

test('the cursor glides between cells in one row and settles without motion', () => {
  const render = C.PanelViews.get('sequence'), p = panel({});
  const host = {};
  const first = render(host, p, {cursor:5}, null, [], 0, true);
  assert.doesNotMatch(first.html, /translateX/); assert.equal(first.baseline, null);
  assert.deepEqual(plain(first.glide), {selector:'.seq-cur', multiple:false});
  const moved = render(host, p, {cursor:9}, null, [], 1, true);
  assert.match(moved.html, /class="seq-cur" style="--seq-at:8;transform:translateX\(-400%\)"/);
  assert.match(moved.baseline, /class="seq-cur" style="--seq-at:8"/); assert.doesNotMatch(moved.baseline, /translateX/);
  assert.equal(moved.baseline, html(p, {cursor:9}));
  const still = render({}, p, {cursor:9}, null, [], 1, false);
  assert.doesNotMatch(still.html, /translateX/);
  const otherRow = render(host, panel({wrap:20}), {cursor:25}, null, [], 2, true);
  assert.doesNotMatch(otherRow.html, /translateX/, 'cross-row moves appear in place');
  const hidden = render(host, p, {cursor:null}, null, [], 3, true);
  assert.doesNotMatch(hidden.html, /seq-cur"/);
  assert.match(render(host, p, {cursor:2}, null, [], 4, true).html, /--seq-at:1"/);
});


test('reveal animation only decorates newly shown letters and seeking returns settled markup', () => {
  const render = C.PanelViews.get('sequence'), p = panel({}), host = {};
  render(host, p, {reveal:3}, null, [], 0, false);
  const advanced = render(host, p, {reveal:8}, null, [], 1, true);
  assert.equal((advanced.html.match(/ seq-new/g) || []).length, 5);
  assert.equal(advanced.baseline, html(p, {reveal:8}));
  assert.doesNotMatch(advanced.baseline, /seq-new|--seq-k/);
  const sought = render(host, p, {reveal:12}, null, [], 2, false);
  assert.equal(sought.html, html(p, {reveal:12}));
  assert.equal(sought.baseline, null);
  const replaced = render(host, panel({sequence:'T'.repeat(48)}), {reveal:20}, null, [], 3, true);
  assert.doesNotMatch(replaced.html, /seq-new|--seq-k/);
  assert.equal(replaced.baseline, null);
  const backwards = render(host, p, {reveal:1}, null, [], 0, true);
  assert.doesNotMatch(backwards.html, /seq-new|--seq-k/);
});
