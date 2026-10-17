'use strict';
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
const SEQ = 'ATGGCCATTGTAATGGGCCGCTGAAAGGGTGCCCGATAG'; // 39 letters: MAIVMGR*KGAR* in frame 1
const panel = (extra) => ({id:'orf', type:'frames', label:'ORF candidate', sequence:SEQ, ...extra});
const diagram = (p, steps, paths) => ({nodes:{n:{}}, rows:[['n']], panels:[p], steps:steps || [], paths});
const html = (p, state) => C.framesHTML(p, state);
const aa = frame => frame.codons.map(codon => codon.aa).join('');
const HOSTILE = '<img src=x onerror=bad()>';

test('frames template, picker example, feature label and styles use ordinary discovery', () => {
  assert.deepEqual(validate(diagram({...plain(C.PANEL_TEMPLATES.frames), id:'orf', type:'frames'})), {errors:[], warnings:[]});
  const entry = C.PANEL_CATALOG.find(item => item.type === 'frames');
  assert.equal(entry.category, 'Science & sequencing'); assert.equal(entry.order, 42); assert.equal(entry.name, 'Reading frames');
  const sample = C.panelPickerExample('frames');
  assert.equal(sample.panel.type, 'frames'); assert.equal(sample.state.motif, 'MXXV'); assert.equal(sample.state.frame, '1');
  assert.deepEqual(validate(diagram({...plain(sample.panel), id:'orf'})), {errors:[], warnings:[]});
  assert.equal(C.framesModel(sample.panel, sample.state).motifMatches.length, 1);
  assert.equal(panelAssets().features['panel.frames'].label, 'Reading frames panel');
  assert.equal(panelAssets().features['panel.frames'].since, '0.2.0');
  assert.equal(C.PanelRegistry.get('frames').order, 42);
  assert.deepEqual(plain(C.PanelRegistry.get('frames').layout.sectionSizing), {minWidth:320, preferredWidth:520, maxWidth:1000, aspectPolicy:'content', grow:1});
  const css = readStyles('style.core.css');
  for (const rule of ['.frm-grid', '.frm-codon', '.frm-dim', '.bio-tone-motif', '.bio-tone-bad']) assert.ok(css.includes(rule), rule);
  assert.match(css, /prefers-reduced-motion[^}]*\.frm-codon/);
  assert.ok(C.PanelRegistry.get('frames').styles.indexOf('.bio-tone-') < 0, 'frames reuses the shared tone classes without redefining them');
});

test('three forward frames translate with the standard code, omit partial codons and flag stops', () => {
  const m = C.framesModel(panel({start:201}), {});
  assert.deepEqual(plain(m.frames.map(aa)), ['MAIVMGR*KGAR*', 'WPL*WAAERVPD', 'GHCNGPLKGCPI']);
  assert.deepEqual(plain(m.frames.map(frame => frame.codons.length)), [13, 12, 12]);
  assert.deepEqual(plain(m.frames.map(frame => [frame.index, frame.offset, frame.trailing, frame.active])), [[1, 0, 0, true], [2, 1, 2, true], [3, 2, 1, true]]);
  assert.deepEqual(plain(m.frames[0].codons[7]), {at:21, coord:222, codon:'TGA', aa:'*', stop:true, motif:false});
  assert.deepEqual(plain(m.frames[1].codons[0]), {at:1, coord:202, codon:'TGG', aa:'W', stop:false, motif:false});
  assert.equal(m.stops, 3); assert.equal(m.frame, 'all'); assert.equal(m.showStops, true); assert.equal(m.motif, null);
  assert.deepEqual(plain([m.first, m.last, m.length, m.letters.length, m.letters[0].coord, m.letters[38].coord]), [201, 239, 39, 39, 201, 239]);
  assert.ok(m.letters[9].tick && !m.letters[8].tick, 'ruler numbers fall on multiples of ten');
  const rna = C.framesModel({id:'f', type:'frames', alphabet:'rna', sequence:'AUG UUU UAA'}, {});
  assert.deepEqual(plain(rna.frames.map(aa)), ['MF*', 'CF', 'VL']);
  assert.equal(rna.frames[0].codons[0].codon, 'AUG');
  const unknown = C.framesModel({id:'f', type:'frames', sequence:'ATGNNNQQQTAG'}, {});
  assert.equal(aa(unknown.frames[0]), 'MXX*'); assert.equal(unknown.invalid, 3); assert.equal(unknown.letters[6].cls, 'bio-b bio-b-x');
  const short = C.framesModel({id:'f', type:'frames', sequence:'AT'}, {});
  assert.deepEqual(plain(short.frames.map(frame => frame.codons.length)), [0, 0, 0]); assert.equal(short.length, 2);
  assert.equal(C.framesModel({id:'f', type:'frames', sequence:'A'.repeat(150)}, {}).length, 120);
  assert.equal(C.framesModel({id:'f', type:'frames'}, {}).length, 0);
  assert.match(html({id:'f', type:'frames'}, {}), /No sequence declared/);
});

test('frame emphasis, motifs with wildcards and overlapping matches, stops and marks compose per step', () => {
  const m = C.framesModel(panel({}), {frame:'2', motif:'rxxr', showStops:false, marks:[{id:'ins', from:13, to:15, tone:'insert', label:'Second ATG'}]});
  assert.deepEqual(plain(m.frames.map(frame => frame.active)), [false, true, false]);
  assert.equal(m.frame, 2); assert.equal(m.motif, 'RXXR'); assert.equal(m.showStops, false);
  assert.deepEqual(plain(m.motifMatches), []);
  assert.equal(m.letters[12].tone, 'insert'); assert.equal(m.letters[15].tone, null);
  for (const value of [1, 2, 3]) assert.equal(C.framesModel(panel({}), {frame:value}).frame, value);
  for (const value of ['all', null, undefined, 4, '0', 'x', {}, NaN]) assert.equal(C.framesModel(panel({}), {frame:value}).frame, 'all');
  const motif = C.framesModel(panel({}), {motif:'MXXV'});
  assert.deepEqual(plain(motif.motifMatches), [{frame:1, at:0, length:4}]);
  assert.deepEqual(plain(motif.frames[0].codons.slice(0, 5).map(codon => codon.motif)), [true, true, true, true, false]);
  const overlapping = C.framesModel({id:'f', type:'frames', sequence:'GCTGCTGCTGCT'}, {motif:'AA'});
  assert.deepEqual(plain(overlapping.motifMatches), [{frame:1, at:0, length:2}, {frame:1, at:3, length:2}, {frame:1, at:6, length:2}]);
  const wildcardStops = C.framesModel(panel({}), {motif:'GRX'});
  assert.deepEqual(plain(wildcardStops.motifMatches), [], 'X never matches a stop codon');
  assert.deepEqual(plain(C.framesModel(panel({}), {motif:'GR*'}).motifMatches), [{frame:1, at:15, length:3}], 'an explicit * matches a stop');
  for (const value of ['', 'RXXR!', 'B', 'A'.repeat(13), 7, {}, ['R']]) assert.equal(C.framesModel(panel({}), {motif:value}).motif, null);
  assert.deepEqual(plain(C.framesModel(panel({}), {showStops:'yes'}).showStops), true);
  assert.deepEqual(plain(C.framesModel(panel({}), {showStops:null}).showStops), true);
});

test('rendering dims inactive frames, marks stops and motifs, spans codons and escapes text', () => {
  const out = html(panel({}), {frame:'1', motif:'MXXV', marks:[{id:'ins', from:13, to:15, tone:'insert', label:'Second ATG'}]});
  assert.match(out, /class="frm-grid" style="--frm-cols:39"/);
  assert.equal((out.match(/frm-gutter-frame frm-dim/g) || []).length, 2);
  assert.equal((out.match(/frm-codon bio-protein frm-dim/g) || []).length, 24);
  assert.equal((out.match(/bio-tone-bad frm-stop/g) || []).length, 3);
  assert.equal((out.match(/bio-tone-motif frm-motif/g) || []).length, 4);
  assert.match(out, /title="ATG → M at 1"><span class="bio-b bio-b-m">M<\/span>/);
  assert.match(out, /title="TGA → stop at 22"><span class="bio-b bio-b-stop">\*<\/span>/);
  assert.equal((out.match(/frm-blank/g) || []).length, 1 + 2 + 2 + 1, 'offset and trailing cells keep every frame row the same width');
  assert.match(out, /frm-bandcell bio-tone-insert/); assert.match(out, /bio-legend[^]*Second ATG <small>13–15<\/small>/);
  assert.match(out, /aria-label="ORF candidate: DNA, positions 1–39, frame 1 emphasised, 3 stop codons, motif MXXV matches 1 time, 1 mark"/);
  assert.match(out, /motif MXXV <small>1 match<\/small>/); assert.match(out, /stop codon<\/span>/);
  const quiet = html(panel({}), {showStops:false});
  assert.doesNotMatch(quiet, /frm-stop|bio-tone-bad/); assert.equal((quiet.match(/frm-quiet/g) || []).length, 3);
  assert.doesNotMatch(quiet, /frm-dim|frm-bandcell|bio-legend|frm-key/);
  const hostile = html({id:'f', type:'frames', sequence:'ATG' + HOSTILE, label:HOSTILE, alphabet:HOSTILE, start:HOSTILE},
    {motif:HOSTILE, note:HOSTILE, frame:HOSTILE, showStops:HOSTILE, marks:[{id:'a', from:1, to:2, label:HOSTILE, tone:HOSTILE}], extra:HOSTILE});
  assert.doesNotMatch(hostile, /<img|NaN|Infinity|undefined/);
  assert.match(hostile, /&lt;img src=x onerror=bad\(\)&gt;/);
  assert.match(hostile, /aria-label="&lt;img src=x onerror=bad\(\)&gt;: DNA, positions 1–\d+/);
  assert.doesNotMatch(html(panel({}), {note:{}}), /object Object|swnote/);
  assert.match(html(panel({}), {note:'Frame 2 is shifted by one base.'}), /swnote">Frame 2 is shifted by one base\./);
});

test('warnings name declaration, initial, step and transient source paths', () => {
  const p = panel({alphabet:'protein', start:1.5, label:[], sequence:'ATGZ', initial:{frame:4, motif:'RXXR!', showStops:'yes', note:5, marks:[{id:'a', from:9, to:2}], bogus:true}});
  const d = diagram(p, [{id:'s1', panels:{orf:{motif:'A'.repeat(13), frame:'x', marks:'none', enterOnce:{showStops:1, marks:[{id:'m', from:0, to:1}]}}}}]);
  const w = validate(d).warnings.join('\n');
  for (const path of ['panels[0].alphabet: expected dna or rna', 'panels[0].start', 'panels[0].label', 'panels[0].sequence: 1 letter is not in the dna alphabet (letter 4)',
    'panels[0].initial.frame', 'panels[0].initial.motif', 'panels[0].initial.showStops', 'panels[0].initial.note', 'panels[0].initial.marks[0]: from 9 must be ≤ to 2',
    'panels[0].initial.bogus: unknown field', 'steps[0].panels.orf.motif', 'steps[0].panels.orf.frame', 'steps[0].panels.orf.marks',
    'steps[0].panels.orf.enterOnce.showStops', 'steps[0].panels.orf.enterOnce.marks[0].from']) assert.ok(w.includes(path), path);
  assert.deepEqual(validate(d).errors, []);
  for (const sequence of [undefined, 7, '', 'AT', 'A'.repeat(121)]) assert.match(validate(diagram(panel({sequence}))).warnings.join('\n'), /panels\[0\]\.sequence/);
  assert.match(validate(diagram(panel({sequence:'AT'}))).warnings.join('\n'), /expected 3–120 letters — nothing to translate/);
  assert.match(validate(diagram(panel({sequence:'A'.repeat(121)}))).warnings.join('\n'), /only the first 120 of 121 letters render/);
  assert.deepEqual(validate(diagram(panel({alphabet:'rna', sequence:'AUGUUUUAA', start:50, initial:{frame:null, motif:null, showStops:null, marks:null}}),
    [{id:'s1', panels:{orf:{frame:3, motif:'MF', showStops:false, marks:[{id:'a', from:50, to:52, tone:'good'}], note:'ok'}}},
     {id:'s2', panels:{orf:{frame:'all', enterOnce:{frame:'2'}}}}])), {errors:[], warnings:[]});
});

test('alternate paths fold independently, transient overrides last one step and the spec is never mutated', () => {
  const p = panel({initial:{frame:'all', motif:'MXXV', marks:[{id:'ins', from:13, to:15, tone:'insert'}]}});
  const d = diagram(p, [
    {id:'s1', panels:{orf:{frame:'1'}}},
    {id:'s2', panels:{orf:{frame:2, enterOnce:{showStops:false}}}},
    {id:'s3', panels:{orf:{motif:'RXXR', frame:'nine', marks:'none', showStops:'maybe'}}},
    {id:'alt', panels:{orf:{motif:null, marks:null, frame:null, note:'cleared'}}},
  ], [{id:'happy', steps:['s1', 's2', 's3']}, {id:'alt', steps:['s1', 'alt']}]);
  const before = JSON.stringify(d);
  const happy = C.foldPanelStates(C.diagramForPath(d, 'happy')).orf, alt = C.foldPanelStates(C.diagramForPath(d, 'alt')).orf;
  assert.deepEqual(plain(happy.map(state => state.frame)), ['1', 2, 2]);
  assert.equal(happy[1].showStops, false); assert.equal(happy[2].showStops, undefined);
  assert.deepEqual(plain(happy.map(state => state.motif)), ['MXXV', 'MXXV', 'RXXR']);
  assert.equal(happy[2].marks.length, 1, 'an invalid marks patch keeps the carried snapshot');
  assert.equal(alt[1].motif, null); assert.equal(alt[1].marks, null); assert.equal(alt[1].frame, null); assert.equal(alt[1].note, 'cleared');
  assert.deepEqual(plain(C.framesModel(p, happy[1]).frames.map(frame => frame.active)), [false, true, false]);
  assert.equal(C.framesModel(p, happy[1]).showStops, false);
  assert.equal(C.framesModel(p, alt[1]).frame, 'all'); assert.equal(C.framesModel(p, alt[1]).motif, null);
  html(p, happy[2]); html(p, alt[1]);
  assert.equal(JSON.stringify(d), before);
  const rendered = html(p, alt[1]);
  assert.doesNotMatch(rendered, /frm-dim|frm-motif|bio-tone-insert/); assert.match(rendered, /cleared/);
});
