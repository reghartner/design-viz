'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/icons/library.js'), 'utf8'), context);
const icons = context.FlowIcons;
const legacySprite = fs.readFileSync(path.join(__dirname, '../src/icons.svg'), 'utf8');
const symbolIds = markup => Array.from(markup.matchAll(/<symbol id="i-([a-z0-9-]+)"/g), match => match[1]);
const geometry = id => icons.glyph(id, {monochrome:true}).replace(/ data-icon(?:-tone)?="[^"]*"/g, '');

test('the standalone library exposes frozen metadata without touching page globals', () => {
  assert.deepEqual(Object.keys(context), ['FlowIcons']);
  assert.ok(Object.isFrozen(icons));
  assert.ok(Object.isFrozen(icons.ids));
  assert.ok(Object.isFrozen(icons.registry));
  assert.equal(Object.getPrototypeOf(icons.registry), null);
  assert.equal(new Set(icons.ids).size, icons.ids.length);
  assert.deepEqual(Object.keys(icons.registry), Array.from(icons.ids));
  for (const id of icons.ids) {
    const item = icons.registry[id];
    assert.ok(Object.isFrozen(item));
    assert.equal(item.id, id);
    assert.match(id, /^[a-z][a-z0-9-]*$/);
    assert.equal(typeof item.label, 'string');
    assert.ok(item.label.length > 0);
    assert.ok(item.category.length > 0);
    assert.match(item.primary, /^#[0-9A-F]{6}$/);
    assert.match(item.accent, /^#[0-9A-F]{6}$/);
    assert.notEqual(item.primary, item.accent);
  }
});

test('unknown and hostile IDs resolve to known artwork without coercion or markup injection', () => {
  const hostile = {toString() { throw new Error('must not coerce authored IDs'); }};
  for (const id of [undefined, null, '', 0, false, [], hostile, '__proto__', 'constructor', 'toString', '<script>alert(1)</script>', 'camera" onload="evil']) {
    assert.equal(icons.has(id), false);
    assert.equal(icons.resolve(id), 'gear');
    assert.equal(icons.resolve(id, 'camera'), 'camera');
    assert.equal(icons.render(id), icons.render('gear'));
    assert.equal(icons.glyph(id), icons.glyph('gear'));
  }
  assert.equal(icons.resolve('battery-full', 'camera'), 'battery-full');
  assert.equal(icons.resolve('unknown', '__proto__'), 'gear');
});

test('SVG labels and class names stay escaped and decorative icons stay silent', () => {
  const hostile = '\"><svg onload="bad"> & \'x';
  const svg = icons.render('camera', {label:hostile, className:hostile});
  assert.match(svg, /role="img"/);
  assert.match(svg, /aria-label="&quot;&gt;&lt;svg onload=&quot;bad&quot;&gt; &amp; &#39;x"/);
  assert.equal((svg.match(/<svg\b/g) || []).length, 1);
  assert.doesNotMatch(svg, / onload="bad"/);
  assert.match(svg, /focusable="false"/);
  assert.doesNotMatch(svg, /aria-hidden/);
  assert.match(icons.render('camera'), /aria-hidden="true"/);
  assert.doesNotMatch(icons.render('camera'), /aria-label|role="img"/);
});

test('every glyph is standalone code-owned SVG with no external references', () => {
  for (const id of icons.ids) {
    const svg = icons.render(id);
    assert.match(svg, /^<svg\b/);
    assert.match(svg, /viewBox="0 0 24 24"/);
    assert.doesNotMatch(svg, /https?:\/\//);
    assert.match(svg, /<(path|rect|circle|ellipse)\b/);
    assert.doesNotMatch(svg, /<use\b|href=|<image\b|<script\b|<foreignObject\b|\son[a-z]+=|\$primary|\$accent|\$wash/);
    assert.match(icons.glyph(id), /^<g\b/);
    assert.doesNotMatch(icons.glyph(id), /<svg\b/);
  }
});

test('power, temperature and alarm states differ in silhouette as well as semantic color', () => {
  for (const states of [
    ['battery', 'battery-full', 'battery-low', 'battery-charging'],
    ['temperature', 'hot', 'cold'],
    ['armed', 'disarmed', 'triggered'],
    ['camera', 'camera-off'],
    ['wifi', 'wifi-off'],
    ['microphone', 'microphone-muted'],
  ]) {
    assert.equal(new Set(states.map(geometry)).size, states.length);
  }
  for (const [id, tone] of [['battery-full','green'], ['battery-low','red'], ['battery-charging','green'], ['hot','red'], ['cold','blue'], ['armed','green'], ['disarmed','neutral'], ['triggered','red']]) {
    assert.equal(icons.registry[id].tone, tone);
    assert.match(icons.render(id), new RegExp('data-icon-tone="' + tone + '"'));
  }
});

test('only known palette overrides affect color and monochrome keeps interior bodies open', () => {
  for (const [alias, tone] of [['ok','green'], ['warn','amber'], ['alert','red'], ['cold','blue'], ['muted','neutral']]) {
    assert.equal(icons.render('camera', {tone:alias}), icons.render('camera', {tone}));
  }
  for (const tone of ['constructor', '__proto__', 'red;--x:url(evil)', '<script>', null, {}]) {
    assert.equal(icons.render('camera', {tone}), icons.render('camera'));
  }
  assert.notEqual(icons.render('camera', {tone:'alert'}), icons.render('camera'));
  const mono = icons.render('camera', {monochrome:true});
  assert.match(mono, /stroke="currentColor"/);
  assert.match(mono, /fill="none"/);
  assert.doesNotMatch(mono, /#[0-9a-f]{6}|var\(--fv-icon-/i);
});

test('sprite generation preserves all original IDs and appends each new ID exactly once', () => {
  const oldIds = symbolIds(legacySprite);
  const legacyIds = icons.ids.filter(id => icons.registry[id].legacy);
  const newIds = icons.ids.filter(id => !icons.registry[id].legacy);
  assert.deepEqual(Array.from(legacyIds), oldIds);
  assert.equal(oldIds.length, 21);
  assert.deepEqual(symbolIds(icons.symbols()), Array.from(newIds));
  assert.equal(icons.symbols(), icons.symbols({newOnly:true}));
  assert.deepEqual(symbolIds(icons.symbols({newOnly:false})), Array.from(icons.ids));
  const combined = symbolIds(legacySprite + icons.symbols());
  assert.equal(new Set(combined).size, combined.length);
  assert.deepEqual(combined, Array.from(icons.ids));
  for (const id of newIds) {
    assert.ok(icons.symbols().includes('<symbol id="i-' + id + '" viewBox="0 0 24 24">' + icons.glyph(id) + '</symbol>'));
  }
});
