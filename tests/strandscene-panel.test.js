'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {readSource, readStyles, panelAssets} = require('../tools/source-loader.cjs');
const C = {URL, TextEncoder, console};
vm.createContext(C);
for (const file of ['validator.js','engine.js','builder.workbench.js','panel-picker.workbench.js','clipboard.workbench.js'])
  vm.runInContext(readSource(file), C);
const plain = value => JSON.parse(JSON.stringify(value));
const validate = d => plain(C.validate(C.normalize(d)));
const HOSTILE = '<img src=x onerror=bad()>';
const SEQ = 'ACGTTGCAGAATTCTAGGCATCGA';
const panel = extra => ({id:'cut', type:'strandscene', title:'Strand scene', label:'restriction cut', sequence:SEQ, strands:2,
  sites:[{id:'s1', from:9, to:14, label:'cleavage site', cutAfter:{upper:9, lower:13}}],
  actors:[{id:'enz', role:'enzyme', label:'enzyme', start:{at:{x:470, y:60}, state:'free'}}],
  initial:{caption:'Recognition site marked.'}, ...extra});
const story = () => [
  {id:'scan', panels:{cut:{actors:{enz:{at:11, state:'scanning'}}, caption:'The enzyme scans the strand.'}}},
  {id:'bind', panels:{cut:{actors:{enz:{state:'bound'}}, highlight:'s1', caption:'It binds at the site.'}}},
  {id:'cut', panels:{cut:{events:[{kind:'cut', site:'s1'}], actors:{enz:{state:'active'}}, caption:'It cuts both backbones.'}}},
  {id:'apart', panels:{cut:{actors:{enz:{at:{x:470, y:60}, state:'released'}}, labels:[{at:4, text:'product A · 1–9 / 1–13'}, {at:19, text:'product B · 10–24 / 14–24'}], caption:'The products separate.'}}},
];
const diagram = (p, steps, paths) => ({nodes:{n:{}}, rows:[['n']], panels:[p], steps:steps || [], paths});
const fold = (d, pathId) => C.foldPanelStates(pathId ? C.diagramForPath(d, pathId) : d).cut;
const render = (host, p, state, animate, states, index) => C.PanelRegistry.get('strandscene').render(host, p, state, 'aurora', states || [], index || 0, animate);
const html = (p, state) => C.strandsceneHTML(p, state);

test('strandscene template, picker example, feature label, styles and sizing use ordinary discovery', () => {
  assert.deepEqual(validate(diagram({...plain(C.PANEL_TEMPLATES.strandscene), id:'cut', type:'strandscene'})), {errors:[], warnings:[]});
  const entry = C.PANEL_CATALOG.find(item => item.type === 'strandscene');
  assert.equal(entry.category, 'Science & sequencing'); assert.equal(entry.order, 46); assert.equal(entry.name, 'Strand scene'); assert.equal(entry.tagline, 'Molecules act on a strand');
  const sample = C.panelPickerExample('strandscene');
  assert.equal(sample.panel.type, 'strandscene'); assert.equal(sample.state.actors.enz.state, 'bound'); assert.equal(sample.state.highlight, 's1');
  assert.deepEqual(validate(diagram({...plain(sample.panel), id:'cut'})), {errors:[], warnings:[]});
  assert.equal(C.strandsceneModel(sample.panel, sample.state).actors[0].at, 11);
  assert.deepEqual(plain(panelAssets().features['panel.strandscene']), {label:'Strand scene panel', since:'0.2.0'});
  const def = C.PanelRegistry.get('strandscene');
  assert.equal(def.order, 46); assert.equal(def.overridable, undefined, 'declaration changes per step belong to the engine, not the panel');
  assert.deepEqual(plain(C.panelPatchFields(panel())).map(f => f[0]).filter(k => k !== 'declare'), ['actors', 'events', 'caption', 'highlight', 'labels', 'camera', 'paired', 'note'], 'patch fields are state only');
  assert.deepEqual(plain(C.PANEL_SETUP_FIELDS.strandscene).map(f => f[0]), ['label', 'sequence', 'alphabet', 'strands', 'lower', 'start', 'beads', 'sites', 'actors', 'initial']);
  assert.deepEqual(plain(def.layout.canvasSizing), {mode:'fixed-aspect', aspect:560 / 315, resizeAxis:'width'});
  assert.deepEqual(plain(def.layout.sectionSizing), {minWidth:320, preferredWidth:560, maxWidth:900, aspectPolicy:'fixed', bodyAspect:16 / 9, grow:1, contentSelector:'.mech-frame', ancillarySelector:'.mech-legend,.swnote'});
  const css = readStyles('style.core.css');
  for (const rule of ['.mech-frame', '.mech-move{transition:transform .7s', '@keyframes mechRipple', '@keyframes mechFlash', '@keyframes mechAppear', '.mech-legend', '.mech-chip', '.mech-t-label', '.mech-t-tag', '.mech-t-actor', '.mech-site', '.bio-b-a'])
    assert.ok(css.includes(rule), rule);
  assert.match(css, /prefers-reduced-motion: reduce\)\{\.mech-move[^}]*transition:none\}\.mech-transient\{display:none\}/);
  assert.match(css, /@media print\{\.mech-transient\{display:none\}/);
  assert.ok(def.styles.indexOf('.bio-b-') < 0 && def.styles.indexOf('.bio-tone-') < 0 && def.styles.indexOf('--bio-letter:#') < 0, 'letter and tone palettes are reused, not redefined');
  for (const file of ['src/panels/types/strandscene.js', 'src/panels/mech.js'])
    assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), /requestAnimationFrame|setTimeout|setInterval/, file);
});

test('the model resolves pieces, overhangs, actor coordinates, camera and the narration', () => {
  const p = panel(), states = fold(diagram(p, story()));
  const whole = C.strandsceneModel(p, states[1]);
  assert.equal(whole.strands, 2); assert.equal(whole.pieces.length, 1); assert.equal(whole.layout.pitch, 19); assert.equal(whole.letters.length, 24); assert.equal(whole.lowerLetters.length, 24);
  assert.equal(whole.lowerText, 'TCGATGCCTAGAATTCTGCAACGT'); assert.equal(whole.rungs.length, 24);
  assert.equal(whole.letters[0].x, 61.5); assert.equal(whole.letters[23].x, 498.5); assert.equal(whole.letters[11].x, 270.5);
  const enz = whole.actors[0];
  assert.equal(enz.at, 11); assert.equal(enz.x, whole.letters[10].x); assert.equal(enz.y, 150 - 5 - 22); assert.equal(enz.state, 'bound'); assert.equal(enz.piece, 0);
  assert.deepEqual(plain(whole.letters.filter(l => l.hot).map(l => l.coord)), [9, 10, 11, 12, 13, 14]);
  assert.equal(whole.sites[0].hot, true); assert.equal(whole.sites[0].cut, false); assert.equal(whole.sites[0].x1, 204); assert.equal(whole.sites[0].x2, 318);
  assert.equal(whole.aria, 'Double strand 1 to 24; cleavage site 9 to 14; enzyme bound at 11.');
  const scanning = C.strandsceneModel(p, states[0]);
  assert.equal(scanning.actors[0].y, 150 - 5 - 22 - 20); assert.deepEqual(plain(scanning.letters.filter(l => l.passed).map(l => l.coord)), [1, 2, 3, 4, 5, 6, 7, 8]);
  const cut = C.strandsceneModel(p, states[2]);
  assert.deepEqual(plain(cut.pieces), [
    {index:0, upperFrom:1, upperTo:9, lowerFrom:1, lowerTo:13, dx:-28, dy:22},
    {index:1, upperFrom:10, upperTo:24, lowerFrom:14, lowerTo:24, dx:28, dy:-22}]);
  assert.equal(cut.letters.filter(l => l.piece === 0).map(l => l.ch).join(''), 'ACGTTGCAG');
  assert.equal(cut.lowerLetters.filter(l => l.piece === 0).map(l => l.ch).join(''), 'TCGATGCCTAGAA', 'product A keeps a four-letter overhang');
  assert.equal(cut.lowerLetters.filter(l => l.piece === 1).map(l => l.ch).join(''), 'TTCTGCAACGT');
  assert.equal(cut.rungs.length, 20); assert.equal(cut.sites[0].cut, true); assert.equal(cut.sites[0].hidden, true);
  assert.equal(cut.actors[0].piece, 1); assert.equal(cut.actors[0].x, 251.5 + 28); assert.equal(cut.actors[0].y, 150 - 22 - 5 - 22);
  assert.match(cut.aria, /enzyme active at 11; cut after 9 and 13\.$/);
  const apart = C.strandsceneModel(p, states[3]);
  assert.deepEqual(plain(apart.labels.map(l => [l.x, l.y, l.text])), [[118.5 - 28, 190 + 46 + 22, 'product A · 1–9 / 1–13'], [403.5 + 28, 150 - 36 - 22, 'product B · 10–24 / 14–24']]);
  assert.equal(apart.actors[0].at, null); assert.equal(apart.actors[0].x, 470); assert.equal(apart.actors[0].state, 'released');
  assert.match(apart.aria, /enzyme released in free space; cut after 9 and 13; product A · 1–9 \/ 1–13; product B · 10–24 \/ 14–24\.$/);
  assert.deepEqual(plain(apart.legend), [{id:'enz', role:'enzyme', name:'enzyme', state:'released', hot:true}, {id:'site:s1', role:'particle', tone:'accent', dashed:true, name:'cleavage site', state:'cut', hot:true}]);
  const cam = C.strandsceneModel(p, {camera:{from:6, to:18}});
  assert.deepEqual(plain(cam.letters.filter(l => !l.hidden).map(l => l.coord)), [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]);
  assert.equal(cam.letters[11].x, 280, 'the camera window centres on the strand'); assert.equal(cam.layout.pitch, 19); assert.match(cam.aria, /showing 6 to 18\.$/);
  assert.doesNotMatch(html(p, {camera:{from:6, to:18}}), />A<\/text>[^]*>C<\/text>[^]*>G<\/text>[^]*>T<\/text>[^]*>T<\/text>[^]*>G<\/text>[^]*>C<\/text>[^]*>A<\/text>[^]*>G<\/text>[^]*>A<\/text>[^]*>A<\/text>[^]*>T<\/text>[^]*>T<\/text>[^]*>C<\/text>[^]*>T<\/text>[^]*>A<\/text>[^]*>G<\/text>[^]*>G<\/text>[^]*>C<\/text>[^]*>A<\/text>/);
  const long = C.strandsceneModel(panel({sequence:'A'.repeat(60)}), {});
  assert.equal(long.layout.pitch, 8); assert.equal(long.fontSize, 5.6); assert.equal(long.letters[59].x - long.letters[0].x, 472);
  const single = C.strandsceneModel(panel({strands:1}), {events:[{kind:'cut', site:'s1'}], cuts:[{site:'s1', upper:9, lower:9}]});
  assert.equal(single.lowerLetters.length, 0); assert.equal(single.yUpper, 170); assert.equal(single.pieces.length, 2); assert.match(single.aria, /^Single strand 1 to 24;[^]*cut after 9\.$/);
  const beads = C.strandsceneModel(panel({beads:true, alphabet:'protein', sequence:'MKTAYIAKQRQISFVKSHFSRQ', strands:1}), {});
  assert.equal(beads.beads, true); assert.equal(beads.alphabet, 'protein'); assert.match(html(beads && panel({beads:true, alphabet:'protein', sequence:'MKTAYIAKQRQISFVKSHFSRQ', strands:1}), {}), /<circle class="mech-nt bio-b-m mech-bead"/);
  const extended = C.strandsceneModel(p, {extended:{upper:'GGTACC', lower:''}});
  assert.equal(extended.letters.length, 30); assert.equal(extended.lastMax, 30); assert.equal(extended.letters[29].extended, true); assert.equal(extended.rungs.length, 24);
  assert.equal(extended.layout.pitch, 16); assert.match(extended.title, /1–30/);
  const unwound = C.strandsceneModel(p, {unwound:{from:5, to:8}});
  assert.deepEqual(plain(unwound.lowerLetters.filter(l => l.open).map(l => l.coord)), [5, 6, 7, 8]); assert.equal(unwound.rungs.length, 20); assert.equal(unwound.lowerLetters[4].y, 204);
  assert.equal(C.strandsceneModel(p, {paired:false}).lowerLetters.length, 0);
  assert.equal(C.strandsceneModel({id:'x', type:'strandscene'}, {}).length, 0); assert.match(html({id:'x', type:'strandscene'}, {}), /aria-label="No strand declared\."/);
});

test('rendering escapes every authored string and never emits hostile attributes, NaN or undefined', () => {
  const p = panel({label:HOSTILE, sequence:'ACGT' + HOSTILE + 'ACGT', alphabet:HOSTILE, start:HOSTILE, strands:HOSTILE, lower:HOSTILE, beads:HOSTILE,
    sites:[{id:'s1', from:1, to:4, label:HOSTILE, tone:HOSTILE, cutAfter:HOSTILE}, HOSTILE],
    actors:[{id:'enz', role:HOSTILE, shape:HOSTILE, size:HOSTILE, label:HOSTILE, start:{at:HOSTILE, state:HOSTILE}}, {id:HOSTILE}]});
  const out = html(p, {caption:HOSTILE, note:HOSTILE, highlight:HOSTILE, camera:HOSTILE, actors:{enz:{at:HOSTILE, state:HOSTILE, label:HOSTILE}, zz:{}},
    events:[{kind:HOSTILE}, {kind:'flash', at:HOSTILE}], labels:[{at:2, text:HOSTILE}, HOSTILE], cuts:HOSTILE, extended:HOSTILE, paired:HOSTILE, unwound:HOSTILE, bogus:HOSTILE});
  assert.doesNotMatch(out, /<img|NaN|Infinity|undefined|object Object/);
  assert.match(out, /aria-label="Single strand 1 to 31; &lt;img src=x onerror=bad\(\)&gt; 1 to 4; &lt;img src=x onerr free; &lt;img src=x onerror=bad\(\)&gt;\."/);
  assert.match(out, /mech-t-caption" x="14" y="38">&lt;img src=x onerror=bad\(\)&gt;<\/text>/);
  assert.match(out, /swnote">&lt;img src=x onerror=bad\(\)&gt;<\/div>/);
  assert.match(out, /mech-t-actor mech-t-inside" y="[-\d.]+" aria-hidden="true">&lt;img src=x onerr<\/text>/);
  assert.match(out, /mech-chip" data-id="enz"/); assert.doesNotMatch(out, /data-id="&lt;/);
  assert.equal((out.match(/class="mech-tag/g) || []).length, 2, 'one site tag and one callout; the hostile callout is dropped');
  assert.match(html(panel(), {note:'The site is six letters long.'}), /swnote">The site is six letters long\./);
  assert.doesNotMatch(html(panel(), {note:{}}), /swnote/);
});

test('warnings name declaration, initial, step, actor, event, override and transient source paths', () => {
  const p = panel({alphabet:'protein', start:0, strands:3, lower:'ACGT', beads:'yes', label:7,
    sites:[{id:'s1', from:9, to:14, cutAfter:{upper:9, lower:13}}, {id:'s2', from:3, to:5, tone:'loud', label:4, cutAfter:{upper:24, lower:0}}, {id:'s1', from:1, to:2}],
    actors:[{id:'enz', role:'villain', shape:'star', size:'xl', label:9, start:{at:99, state:'asleep'}}, {id:'9bad'}],
    initial:{actors:{enz:{at:{x:'a'}, state:'x', colour:1}, zz:{state:'free'}}, caption:5, note:[], highlight:'nope', camera:{from:9, to:2}, labels:[{at:1}], events:[{kind:'cut', site:'s9'}], bogus:true}});
  const steps = story();
  steps[2].panels.cut.actors.zz = {state:'bound'};
  steps[2].panels.cut.events = [{kind:'cut', site:'missing'}, {kind:'extend', strand:'sideways', letters:'ACGT'}, {kind:'extend', strand:'upper', letters:'Z'.repeat(13)}, {kind:'unwind', from:30, to:40}, {kind:'flash', at:'x'}];
  steps[2].panels.cut.enterOnce = {caption:3, actors:{enz:{at:70}}, actors2:1};
  steps[3].panels.cut.sequence = 'ACGTACGT'; steps[3].panels.cut.actors = [{id:'cap', role:'cap'}];
  const w = validate(diagram(p, steps)).warnings;
  for (const expected of ['panels[0].alphabet: protein needs beads:true', 'panels[0].start', 'panels[0].strands', 'panels[0].lower: expected 24 letters', 'panels[0].beads', 'panels[0].label',
    'panels[0].sites[1].tone', 'panels[0].sites[1].label', 'panels[0].sites[1].cutAfter.upper: expected a coordinate between 1 and 23', 'panels[0].sites[1].cutAfter.lower',
    'panels[0].sites[2].id: duplicate id "s1"', 'panels[0].actors[0].role', 'panels[0].actors[0].shape', 'panels[0].actors[0].size', 'panels[0].actors[0].label',
    'panels[0].actors[0].start.at: coordinate 99 lies outside 1–24', 'panels[0].actors[0].start.state', 'panels[0].actors[1].id: needs a letter-led id',
    'panels[0].initial.actors.enz.at', 'panels[0].initial.actors.enz.state', 'panels[0].initial.actors.enz.colour: unknown actor property', 'panels[0].initial.actors.zz: unknown declared id',
    'panels[0].initial.caption', 'panels[0].initial.note', 'panels[0].initial.highlight', 'panels[0].initial.camera', 'panels[0].initial.labels[0].text', 'panels[0].initial.events[0].site: unknown site id',
    'panels[0].initial.bogus: unknown field',
    'steps[2].panels.cut.actors.zz: unknown declared id — ignored', 'steps[2].panels.cut.events[0].site: unknown site id — event ignored', 'steps[2].panels.cut.events[1].strand',
    'steps[2].panels.cut.events[2].letters: expected 1–12 letters', 'steps[2].panels.cut.events[3]: unwind needs strands:2', 'steps[2].panels.cut.events: only the first 4 events play',
    'steps[2].panels.cut.enterOnce.caption', 'steps[2].panels.cut.enterOnce.actors.enz.at: coordinate 70', 'steps[2].panels.cut.enterOnce.actors2: unknown field',
    'steps[3].panels.cut.sequence: unknown field — ignored', 'steps[3].panels.cut.actors: expected an object keyed by actor id — ignored'])
    assert.ok(w.some(message => message.includes(expected)), expected + '\n' + w.join('\n'));
  assert.deepEqual(validate(diagram(p, steps)).errors, []);
  for (const sequence of [undefined, 7, '', 'ACGT', 'A'.repeat(61)]) assert.match(validate(diagram(panel({sequence}))).warnings.join('\n'), /panels\[0\]\.sequence/);
  assert.equal(validate(diagram(panel({actors:[]}))).warnings.length, 0, 'an empty actor list is valid while authoring');
  assert.match(validate(diagram(panel({actors:undefined}))).warnings.join('\n'), /panels\[0\]\.actors: needs 1–6 entries/);
  assert.match(validate(diagram(panel({actors:Array.from({length:7}, (_, i) => ({id:'a' + i, role:'ion'}))}))).warnings.join('\n'), /only the first 6 actors/);
  assert.match(validate(diagram(panel(), [{id:'s', panels:{cut:{events:[{kind:'pair'}], actors:{enz:{at:4}}}}}])).warnings.join('\n'), /^$|pair/);
  assert.match(validate(diagram(panel({strands:1}), [{id:'s', panels:{cut:{events:[{kind:'pair'}, {kind:'extend', strand:'lower', letters:'AC'}]}}}])).warnings.join('\n'), /events\[0\]: pair needs strands:2[^]*events\[1\].strand: lower needs strands:2/);
  assert.deepEqual(validate(diagram(panel({strands:2, lower:'TCGATGCCTAGAATTCTGCAACGT', start:101, sites:[{id:'s1', from:109, to:114, tone:'cut', cutAfter:{upper:109, lower:113}}],
    initial:{actors:{enz:null}, caption:null, highlight:null, camera:null, labels:null, note:null, paired:false}}),
    [{id:'a', panels:{cut:{events:[{kind:'unwind', from:101, to:124}, {kind:'pair'}, {kind:'extend', strand:'lower', letters:'acgt'}, {kind:'flash', at:{x:10, y:10}}], actors:{enz:{at:111, state:'bound', label:'nuclease'}}, camera:{from:105, to:118}, highlight:'s1', labels:[{at:111, text:'here'}, {at:{x:1, y:1}, text:'there'}], caption:'ok', note:'ok'}}},
     {id:'b', panels:{cut:{events:[{kind:'join', site:'s1'}], actors:null, enterOnce:{caption:'once', actors:{enz:{state:'released'}}}}}}])), {errors:[], warnings:[]});
});

test('folding merges actors per id, keeps events step-local, appends cuts, removes them on join and isolates paths and enterOnce', () => {
  const p = panel(), steps = story().concat([
    {id:'join', panels:{cut:{events:[{kind:'join', site:'s1'}], labels:null, enterOnce:{caption:'Joined for one step', actors:{enz:{state:'binding'}}}}}},
    {id:'extend', panels:{cut:{events:[{kind:'extend', strand:'upper', letters:'ggtacc'}, {kind:'extend', strand:'lower', letters:'AC'}, {kind:'unwind', from:1, to:4}], actors:{enz:{label:'nuclease'}}}}},
    {id:'protected', panels:{cut:{actors:{enz:{at:11, state:'binding'}}, caption:'The cap blocks binding.'}}},
    {id:'off', panels:{cut:{actors:{enz:{state:'released'}, zz:{state:'bound'}}, events:'none', caption:'It lets go.'}}},
  ]);
  const d = diagram(p, steps, [{id:'cut', steps:['scan', 'bind', 'cut', 'apart', 'join', 'extend']}, {id:'protected', steps:['scan', 'protected', 'off']}]);
  Object.freeze(d); const before = JSON.stringify(d);
  const main = fold(d, 'cut'), alt = fold(d, 'protected');
  assert.deepEqual(plain(main.map(s => s.actors.enz)), [{at:11, state:'scanning'}, {at:11, state:'bound'}, {at:11, state:'active'}, {at:{x:470, y:60}, state:'released'}, {at:{x:470, y:60}, state:'binding'}, {at:{x:470, y:60}, state:'released', label:'nuclease'}]);
  assert.deepEqual(plain(main.map(s => s.events.length)), [0, 0, 1, 0, 1, 3], 'events belong to the step that authored them');
  assert.deepEqual(plain(main.map(s => s.cuts)), [[], [], [{site:'s1', upper:9, lower:13}], [{site:'s1', upper:9, lower:13}], [], []]);
  assert.deepEqual(plain(main.map(s => s.highlight)), [null, 's1', 's1', 's1', 's1', 's1']);
  assert.deepEqual(plain(main.map(s => s.caption)), ['The enzyme scans the strand.', 'It binds at the site.', 'It cuts both backbones.', 'The products separate.', 'Joined for one step', 'The products separate.']);
  assert.equal(main[3].labels.length, 2); assert.equal(main[4].labels, null);
  assert.deepEqual(plain(main[5].extended), {upper:'GGTACC', lower:'AC'}); assert.deepEqual(plain(main[5].unwound), {from:1, to:4}); assert.deepEqual(plain(main[4].extended), {upper:'', lower:''});
  assert.deepEqual(plain(alt.map(s => s.actors.enz)), [{at:11, state:'scanning'}, {at:11, state:'binding'}, {at:11, state:'released'}]);
  assert.deepEqual(plain(alt.map(s => s.cuts)), [[], [], []]); assert.equal(alt[2].events.length, 0, 'an invalid events patch is ignored'); assert.equal(alt[1].highlight, undefined);
  assert.equal(alt[2].actors.zz, undefined, 'unknown ids never enter the carried map');
  assert.equal(JSON.stringify(d), before, 'folding never mutates the spec');
  main[2].cuts.push({site:'x', upper:1, lower:1}); main[2].actors.enz.state = 'free';
  assert.equal(fold(d, 'cut')[2].actors.enz.state, 'active'); assert.equal(fold(d, 'cut')[3].cuts.length, 1);
  const twice = fold(diagram(p, [{id:'a', panels:{cut:{events:[{kind:'cut', site:'s1'}]}}}, {id:'b', panels:{cut:{events:[{kind:'cut', site:'s1'}]}}}]));
  assert.equal(twice[1].cuts.length, 1, 'a site is cut once');
  const reset = fold(diagram(p, [{id:'a', panels:{cut:{actors:{enz:{at:3, state:'bound'}}}}}, {id:'b', panels:{cut:{actors:{enz:null}}}}, {id:'c', panels:{cut:{actors:{enz:{at:'bad', state:'nope'}}}}}]));
  assert.deepEqual(plain(reset.map(s => s.actors)), [{enz:{at:3, state:'bound'}}, {}, {}], 'null resets an actor and an all-invalid patch keeps the carried map');
  assert.equal(C.strandsceneModel(p, reset[1]).actors[0].x, 470, 'a reset actor returns to its declared start');
  const empty = fold(diagram(p));
  assert.equal(empty.length, 1); assert.deepEqual(plain(empty[0].actors), {}); assert.deepEqual(plain(empty[0].events), []); assert.equal(empty[0].caption, 'Recognition site marked.');
});

test('a declaration change takes effect on the next call: nothing declaration-derived is cached by the fold, model or renderer', () => {
  const p = panel(), d = diagram(p, story()), states = fold(d);
  const host = {};
  render(host, p, states[1], false, states, 1);
  const changed = {...p, label:'host copy', sites:[{id:'s2', from:3, to:6, label:'other site', cutAfter:{upper:4}}], actors:p.actors.concat([{id:'cap', role:'cap', label:'cap', start:{at:11, state:'bound'}}])};
  const out = render(host, changed, states[1], false, states, 1).html;
  assert.match(out, /host copy · 1–24/); assert.match(out, /other site · 3–6/); assert.match(out, /mech-shape-cap/); assert.doesNotMatch(out, /cleavage site/);
  assert.equal(out, html(changed, states[1]));
  const m = C.strandsceneModel(changed, states[1]);
  assert.deepEqual(plain(m.actors.map(a => [a.id, a.at, a.state])), [['enz', 11, 'bound'], ['cap', 11, 'bound']]);
  assert.equal(C.strandsceneModel(changed, {actors:{cap:{state:'free'}, enz:{at:4}}}).actors[0].at, 4);
  const folded = fold(diagram(changed, [{id:'a', panels:{cut:{events:[{kind:'cut', site:'s2'}], actors:{cap:{state:'released'}}}}}]));
  assert.deepEqual(plain(folded[0].cuts), [{site:'s2', upper:4, lower:4}]); assert.equal(folded[0].actors.cap.state, 'released');
  assert.deepEqual(plain(fold(diagram(p, [{id:'a', panels:{cut:{events:[{kind:'cut', site:'s2'}], actors:{cap:{state:'released'}}}}}]))[0]), {actors:{}, events:[], cuts:[], extended:{upper:'', lower:''}, paired:null, unwound:null, caption:'Recognition site marked.', log:[]},
    'against the original declaration the same patch names an unknown site and actor, so nothing is applied');
  assert.deepEqual(Object.keys(host).sort(), ['_mechPrev', '_mechScene'], 'the host keeps only glide continuity and the last scene markup');
  assert.deepEqual(Object.keys(host._mechPrev).sort(), ['actors', 'extended', 'labels', 'paired', 'pieces', 'viewport']);
});

test('markup is the settled end state; motion is glide, transient, pulse, settle and patch work for the shared lifecycle', () => {
  const p = panel(), states = fold(diagram(p, story()));
  const host = {};
  const first = render(host, p, states[0], true, states, 0);
  assert.equal(first.baseline, null, 'nothing was on screen before, so nothing glides');
  assert.deepEqual(plain(first.glide), {selector:'.mech-move[style]', multiple:true}); assert.equal(first.transient, '.mech-transient');
  assert.doesNotMatch(first.html, /mech-transient|style="transform/); assert.match(first.html, /mech-st-scanning/); assert.match(first.html, /scanning →/);
  const bind = render(host, p, states[1], true, states, 1);
  assert.match(bind.html, /mech-transient mech-ripple k-bind" style="--mx:251\.5px;--my:175px;animation-delay:0ms"/);
  assert.match(bind.html, /mech-move mech-actor-move" style="transform:translate\(0px,-20px\)"/, 'the enzyme glides down from its hover position');
  assert.equal((bind.html.match(/mech-move[^>]*style="transform/g) || []).length, 1, 'only the moved actor glides');
  assert.doesNotMatch(bind.baseline, /mech-transient|style="transform/); assert.equal(bind.pulse.selector, '.mech-chip[data-id="enz"]'); assert.equal(bind.pulse.changed, true);
  assert.match(bind.html, /mech-site bio-tone-accent hot/);
  const cut = render(host, p, states[2], true, states, 2);
  assert.equal((cut.html.match(/class="mech-transient/g) || []).length, 2, 'a cut mark and a cut ripple');
  assert.match(cut.html, /mech-transient mech-cutmark" style="animation-delay:0ms"[^>]*><line x1="223" y1="130" x2="223" y2="174"\/><line x1="299" y1="166" x2="299" y2="210"\/>/);
  assert.match(cut.html, /mech-ripple k-cut" style="--mx:261px;--my:175px/);
  const glides = cut.html.match(/mech-move[^>]*style="transform:translate\([^)]*\)"/g);
  assert.deepEqual(glides.map(g => g.replace(/.*translate/, 'translate').replace(/"$/, '')), ['translate(28px,-22px)', 'translate(-28px,22px)', 'translate(-28px,22px)'], 'both pieces and the gripping enzyme glide out from the uncut position');
  assert.doesNotMatch(cut.baseline, /mech-transient|style="transform/); assert.equal(cut.pulse.selector, '.mech-chip[data-id="enz"]');
  assert.doesNotMatch(cut.html, /mech-ruler/, 'the ruler is gone once pieces drift');
  const apart = render(host, p, states[3], true, states, 3);
  assert.doesNotMatch(apart.html, /mech-transient/); assert.match(apart.html, /mech-actor-move" style="transform:translate\(-190\.5px,41px\)"/);
  assert.equal((apart.html.match(/mech-appear/g) || []).length, 2, 'new callouts enter'); assert.doesNotMatch(apart.baseline, /mech-appear/);
  assert.equal(apart.patch(), false, 'a moving step never takes the surgical path');
  const still = {};
  render(still, p, states[2], false, states, 2);
  const seek = render(still, p, states[3], false, states, 3);
  assert.doesNotMatch(seek.html, /mech-transient|style="transform|mech-appear/); assert.equal(seek.baseline, null); assert.equal(seek.pulse, null);
  assert.equal(seek.html, html(p, states[3]), 'animate=false renders exactly the settled markup');
  const extend = fold(diagram(p, [{id:'x', panels:{cut:{events:[{kind:'extend', strand:'upper', letters:'GGTACC'}]}}}, {id:'y', panels:{cut:{events:[{kind:'pair'}]}}}]));
  const grow = {}; render(grow, p, {}, false); const grown = render(grow, p, extend[0], true, extend, 0);
  assert.equal((grown.html.match(/mech-nt bio-b-[a-z]+ mech-appear" x="[\d.]+" y="155" style="animation-delay:(0|120|240|360|480|600)ms"/g) || []).length, 6, 'six new letters fade in with a 120 ms stagger');
  assert.doesNotMatch(grown.html, /mech-viewport" style=/, 'a pitch change re-lays the strand out without a pan');
  assert.doesNotMatch(grown.baseline, /mech-appear|style="transform/);
  const pan = {}; render(pan, p, {camera:{from:1, to:13}}, false);
  const panned = render(pan, p, {camera:{from:12, to:24}}, true);
  assert.match(panned.html, /mech-move mech-viewport" style="transform:translate\(209px,0px\)"/, 'a camera move at the same pitch pans the viewport');
  assert.doesNotMatch(panned.baseline, /style="transform/);
  const unpaired = {}; render(unpaired, p, {paired:false}, false);
  const paired = render(unpaired, p, {paired:true, events:[{kind:'pair'}]}, true);
  assert.match(paired.html, /mech-lower mech-appear/); assert.equal((paired.html.match(/mech-rung mech-appear" [^>]*style="animation-delay:40ms"/g) || []).length, 2);
  const removed = [];
  const node = cls => ({classList:{remove(name){ removed.push(cls + ':' + name); }}, style:{animationDelay:'120ms'}});
  const settleHost = {querySelectorAll(selector){ return selector === '.mech-appear' ? [node('a'), node('b')] : []; }};
  render(settleHost, p, extend[0], true, extend, 0).settle();
  assert.deepEqual(removed, ['a:mech-appear', 'b:mech-appear']);
  render({}, p, states[0], true).settle();
});

test('overlay-only changes patch the overlay, legend and aria-label without rebuilding the scene', () => {
  const p = panel(), states = fold(diagram(p, story()));
  const overlay = {innerHTML:''}, aside = {innerHTML:''}, attrs = {}, frame = {setAttribute(name, value){ attrs[name] = value; }};
  let writes = 0;
  const host = {querySelector(selector){ return selector === '.mech-frame' ? frame : selector === '.mech-overlay' ? overlay : selector === '.mech-aside' ? aside : null; },
    querySelectorAll(){ return []; }, set innerHTML(value){ this.html = value; writes++; }};
  C.renderPanelBody(host, p, states[1], 'aurora', states, 1, false);
  assert.equal(writes, 1);
  const next = {...states[1], caption:'Only the caption changed.', highlight:null, note:'A note appears.'};
  C.renderPanelBody(host, p, next, 'aurora', states, 1, true);
  assert.equal(writes, 1, 'the scene subtree was kept');
  assert.match(overlay.innerHTML, /Only the caption changed\./); assert.doesNotMatch(overlay.innerHTML, /mech-site bio-tone-accent hot/);
  assert.match(aside.innerHTML, /swnote">A note appears\./); assert.match(attrs['aria-label'], /enzyme bound at 11/);
  assert.equal(host._lastHTML, html(p, next));
  C.renderPanelBody(host, p, states[2], 'aurora', states, 2, true);
  assert.equal(writes, 2, 'a cut rebuilds the scene');
  const same = {}; const settled = render(same, p, states[1], false); render(same, p, states[1], false);
  assert.equal(render(same, p, states[1], false).html, settled.html, 'an unchanged state re-renders byte-identical markup');
});

test('declaration changes between renders: overlay text patches from the new declaration, scene changes rebuild', () => {
  const p = panel(), states = fold(diagram(p, story()));
  const overlay = {innerHTML:''}, aside = {innerHTML:''}, frame = {setAttribute(){}};
  let writes = 0;
  const host = {querySelector(selector){ return selector === '.mech-frame' ? frame : selector === '.mech-overlay' ? overlay : selector === '.mech-aside' ? aside : null; },
    querySelectorAll(){ return []; }, set innerHTML(value){ this.html = value; writes++; }};
  C.renderPanelBody(host, p, states[1], 'aurora', states, 1, false);
  assert.equal(writes, 1);
  C.renderPanelBody(host, panel({label:'a different cut'}), states[1], 'aurora', states, 1, true);
  assert.equal(writes, 1, 'a label-only declaration change patches the overlay');
  assert.match(overlay.innerHTML, /a different cut/i);
  const reseq = panel({label:'a different cut', sequence:SEQ.split('').reverse().join('')});
  C.renderPanelBody(host, reseq, states[1], 'aurora', states, 1, true);
  assert.equal(writes, 2, 'a changed sequence rebuilds the scene');
  assert.equal(host.html, html(reseq, states[1]));
});
