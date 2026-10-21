'use strict';
process.env.FLOWVIEW_PACKAGES = 'science';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {readSource, sourceFiles} = require('../tools/source-loader.cjs');
const C = {URL, TextEncoder, console};
vm.createContext(C);
vm.runInContext(readSource('validator.js'), C);
const plain = value => JSON.parse(JSON.stringify(value));
const HOSTILE = '<img src=x onerror=bad()>';

test('mech.js is a pure shared helper bundled after bio.js with no DOM, timers or fetch', () => {
  const files = sourceFiles('validator.js');
  assert.ok(files.indexOf('@package/science/panels/bio.js') >= 0);
  assert.ok(files.indexOf('@package/science/panels/mech.js') > files.indexOf('@package/science/panels/bio.js'));
  assert.ok(files.indexOf('@package/science/panels/mech.js') < files.indexOf('@package/science/panels/types/rnacopy.js'));
  assert.ok(files.indexOf('@package/science/panels/mech.js') < files.findIndex(name => name.startsWith('panels/types/')));
  const source = fs.readFileSync(path.join(__dirname, '../packages/science/panels/mech.js'), 'utf8');
  assert.doesNotMatch(source, /requestAnimationFrame|setTimeout|setInterval|document\.|window\.|fetch\(/);
  assert.equal(C.MECH_SCENE.w, 560); assert.equal(C.MECH_SCENE.h, 315);
});

test('roles carry fill, edge, ink and a default shape; unknown roles, shapes and sizes fall back', () => {
  for (const role of ['enzyme', 'polymerase', 'ribosome', 'primer', 'cap', 'protein', 'particle', 'cargo', 'vesicle', 'virus', 'ion'])
    for (const key of ['fill', 'edge', 'ink', 'shape']) assert.ok(C.MECH_ROLES[role][key], role + '.' + key);
  assert.deepEqual([C.MECH_ROLES.enzyme.fill, C.MECH_ROLES.polymerase.fill, C.MECH_ROLES.ribosome.fill, C.MECH_ROLES.primer.fill, C.MECH_ROLES.cap.fill,
    C.MECH_ROLES.protein.fill, C.MECH_ROLES.particle.fill, C.MECH_ROLES.cargo.fill, C.MECH_ROLES.virus.fill],
    ['#FFB454', '#B99CFF', '#7ED9A0', '#FF8E5A', '#8AA0C2', '#6E8FC7', '#38E1FF', '#F08BD0', '#B9C46A']);
  assert.equal(C.MECH_ROLES.vesicle.dashed, true);
  assert.equal(C.mechRole('enzyme'), 'enzyme'); assert.equal(C.mechRole('membrane'), 'protein', 'compartment fills are not actor roles');
  for (const value of [undefined, null, 7, HOSTILE, '__proto__']) assert.equal(C.mechRole(value, 'particle'), 'particle');
  assert.equal(C.mechRole(HOSTILE), 'protein');
  assert.deepEqual(['enzyme', 'polymerase', 'ribosome', 'primer', 'cap', 'particle', 'ion', 'cargo', 'virus', 'protein'].map(role => C.mechShape(undefined, role)),
    ['blob', 'clamp', 'lobes', 'wedge', 'cap', 'dot', 'dot', 'dot', 'spiky', 'box']);
  assert.equal(C.mechShape('pill', 'enzyme'), 'pill'); assert.equal(C.mechShape(HOSTILE, 'enzyme'), 'blob');
  assert.deepEqual(['s', 'm', 'l', 'xl', undefined, 3].map(C.mechSize), ['s', 'm', 'l', 'm', 'm', 'm']);
  assert.deepEqual([C.mechSizeScale('s'), C.mechSizeScale('m'), C.mechSizeScale('l')], [0.72, 1, 1.3]);
  assert.deepEqual(['enz', 'a1', 'A_b-c', '1x', '', 'bad id', '__proto__', 'constructor', 'enterOnce', 7].map(C.mechId), [true, true, true, false, false, false, false, false, false, false]);
});

test('every shape generator returns a closed path centred on the origin whose extent matches w and h', () => {
  const nums = d => Array.from(d.matchAll(/-?\d+(?:\.\d+)?/g), m => Number(m[0]));
  for (const shape of ['blob', 'clamp', 'lobes', 'wedge', 'cap', 'dot', 'pill', 'spiky', 'box']) {
    const d = C.MECH_SHAPES[shape](40, 20);
    assert.match(d, /^M/); assert.match(d, /Z$/); assert.doesNotMatch(d, /NaN|Infinity|undefined/);
    const values = nums(d), xs = [], ys = [];
    if (shape === 'dot' || shape === 'lobes' || shape === 'clamp' || shape === 'pill') continue;
    for (const pair of d.match(/-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?/g)) { const [x, y] = pair.split(',').map(Number); xs.push(x); ys.push(y); }
    assert.ok(Math.min(...xs) <= -19 && Math.max(...xs) >= 19, shape + ' spans w'); assert.ok(values.length > 4);
    assert.ok(Math.min(...ys) <= -9 && Math.max(...ys) >= 9, shape + ' spans h');
  }
  assert.match(C.MECH_SHAPES.blob(72, 44), /L9,22 L9,13\.2 L-9,13\.2 L-9,22/, 'the enzyme slot sits under the blob');
  assert.match(C.MECH_SHAPES.clamp(48, 44), /A24,22 0 1,1/, 'the clamp ring is open at the bottom');
  assert.equal((C.MECH_SHAPES.lobes(40, 40).match(/Z/g) || []).length, 2);
  assert.equal((C.MECH_SHAPES.spiky(30, 30).match(/L/g) || []).length, 23);
  assert.deepEqual(plain(C.mechShapeBox('blob', 'm')), {w:72, h:44}); assert.deepEqual(plain(C.mechShapeBox('dot', 'l')), {w:23.4, h:23.4});
  assert.deepEqual(plain(C.mechShapeBox(HOSTILE, 's')), {w:24.5, h:15.8});
});

test('clusters are deterministic golden-angle spirals clamped to 0–50 dots', () => {
  const six = C.mechCluster(6), again = C.mechCluster(6);
  assert.deepEqual(plain(six), plain(again));
  assert.equal(six.length, 6); assert.deepEqual(plain(six[0]), {dx:0, dy:0});
  assert.ok(Math.abs(Math.hypot(six[1].dx, six[1].dy / 0.8) - 7.2) < 0.1, 'dot 1 sits 4.2·√1 + 3 units out');
  assert.ok(Math.abs(Math.hypot(six[4].dx, six[4].dy / 0.8) - (4.2 * 2 + 3)) < 0.1);
  assert.equal(C.mechCluster(80).length, 50); assert.equal(C.mechCluster(-3).length, 0);
  assert.equal(C.mechCluster(NaN).length, 0); assert.equal(C.mechCluster('9').length, 0);
  assert.ok(Math.hypot(C.mechCluster(3, 9)[2].dx, C.mechCluster(3, 9)[2].dy) > Math.hypot(six[2].dx, six[2].dy), 'bigger dots spread wider');
  const all = C.mechCluster(50);
  for (const p of all) { assert.ok(Math.abs(p.dx) < 40 && Math.abs(p.dy) < 32); assert.ok(Number.isFinite(p.dx) && Number.isFinite(p.dy)); }
});

test('the cell outline is a closed 96-point path whose waist narrows with pinch', () => {
  const rest = C.mechCellOutline(312, 160, 150, 102, 0), pinched = C.mechCellOutline(312, 160, 150, 102, 0.8);
  for (const d of [rest, pinched]) { assert.match(d, /^M/); assert.match(d, /Z$/); assert.equal(d.split('L').length, 96); assert.doesNotMatch(d, /NaN/); }
  const waist = d => { const pts = d.slice(1, -1).split('L').map(p => p.split(',').map(Number)); return Math.max(...pts.filter(p => Math.abs(p[0] - 312) < 4).map(p => p[1])); };
  assert.ok(waist(rest) > 255 && waist(rest) <= 262);
  assert.ok(waist(pinched) < 200, 'pinch narrows the waist');
  const width = d => { const xs = d.slice(1, -1).split('L').map(p => Number(p.split(',')[0])); return Math.max(...xs) - Math.min(...xs); };
  assert.ok(width(pinched) > width(rest) * 1.1, 'pinch stretches x');
  assert.equal(C.mechCellOutline(0, 0, 10, 10, 4), C.mechCellOutline(0, 0, 10, 10, 1), 'pinch clamps to 1');
  assert.equal(C.mechCellOutline(0, 0, 10, 10, 'x'), rest.replace(/.*/, C.mechCellOutline(0, 0, 10, 10, 0)));
});

test('positions, text, glide styles and ripples are validated, clamped and escaped', () => {
  const warnings = [];
  assert.deepEqual(plain(C.mechXY({x:470, y:60}, 'p', warnings)), {x:470, y:60});
  assert.deepEqual(plain(C.mechXY({x:-20, y:900.26}, 'p', warnings)), {x:0, y:315});
  assert.equal(warnings.length, 0);
  for (const value of [null, 7, 'x', {x:1}, {x:NaN, y:2}, {x:Infinity, y:2}, {x:'1', y:2}, []]) assert.equal(C.mechXY(value, 'steps[1].panels.cut.actors.enz.at', warnings), null);
  assert.equal(warnings.length, 8); assert.match(warnings[0], /^steps\[1\]\.panels\.cut\.actors\.enz\.at: expected \{x, y\}/);
  assert.equal(C.mechText('cleavage site', 8), 'cleavage'); assert.equal(C.mechText(7, 8), ''); assert.equal(C.mechText(null, 8), '');
  assert.equal(C.mechGlideStyle({x:470, y:60}, {x:118, y:118}), ' style="transform:translate(352px,-58px)"');
  assert.equal(C.mechGlideStyle({x:1, y:1}, {x:1.4, y:1.3}), ''); assert.equal(C.mechGlideStyle(null, {x:1, y:1}), '');
  assert.equal(C.mechGlideStyle({x:NaN, y:1}, {x:1, y:1}), '');
  const ripple = C.mechRipple(118.26, 170, 'bind', 250);
  assert.match(ripple, /^<g class="mech-transient mech-ripple k-bind" style="--mx:118\.3px;--my:170px;animation-delay:250ms" aria-hidden="true">/);
  assert.match(ripple, /<circle class="mech-rip-a" cx="118\.3" cy="170" r="12"\/>/);
  assert.match(C.mechRipple(1, 2, HOSTILE), /k-flash/); assert.doesNotMatch(C.mechRipple(1, 2, HOSTILE, 'x'), /<img|NaN|undefined/);
  assert.match(C.mechRipple(1, 2, 'cut', -40), /animation-delay:0ms/); assert.match(C.mechRipple(1, 2, 'cut'), /mech-rip-fill/);
  const actor = C.mechActorMarkup({id:'e', role:'enzyme', label:HOSTILE, size:'l'});
  assert.match(actor, /^<g class="mech-actor mech-shape-blob" style="--mf:#FFB454;--me:#C9842B;--mi:#1A1206">/);
  assert.match(actor, /<text class="mech-t-actor mech-t-inside" y="-5\.7" aria-hidden="true">&lt;img src=x onerr<\/text>/, 'labels are escaped and capped at 16 characters');
  assert.doesNotMatch(actor, /<img/);
  assert.match(C.mechActorMarkup({role:'vesicle'}), /stroke-dasharray="3 3"/);
  assert.doesNotMatch(C.mechActorMarkup({role:'particle'}), /<text/);
  const tag = C.mechTagMarkup(100, 230, HOSTILE, 'hot');
  assert.match(tag, /^<g class="mech-tag hot"><rect x="/); assert.doesNotMatch(tag, /<img/); assert.match(tag, /&lt;img/);
  const legend = C.mechLegendHTML([{id:'enz', role:'enzyme', name:HOSTILE, state:'bound', hot:true}, {id:'site', role:'particle', name:'site', dashed:true}]);
  assert.match(legend, /<li class="mech-chip" data-id="enz"><i class="mech-sw" style="--mf:#FFB454;--me:#C9842B" aria-hidden="true"><\/i>&lt;img src=x onerror=bad\(\)&gt; <small class="mech-st hot">bound<\/small><\/li>/);
  assert.match(legend, /mech-sw mech-sw-dashed/); assert.equal(C.mechLegendHTML([]), '');
});
