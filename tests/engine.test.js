'use strict';
/* Unit tests for the pure engine core (src/validator.js + src/engine.js),
   loaded via vm so the browser fragments run without a DOM.
   Run: node --test tests/   (zero npm dependencies) */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function loadCore(overrides = {}){
  const code =
    fs.readFileSync(path.join(ROOT, 'src', 'validator.js'), 'utf8') + '\n' +
    fs.readFileSync(path.join(ROOT, 'src', 'engine.js'), 'utf8') + '\n' +
    ';__exports = {validate, normalize, blocksOf, resolveProtocols, resolveLanes,' +
    ' kindColor, stepKeys, stepTonePatch, foldPanelStates, foldNodeTones, layout, isWrap, edgePath, SKINS,' +
    ' BUILTIN_PROTOCOLS, SCENES, spreadPositions, resolveLabelCollisions,' +
    ' edgeAutoAdjust, parseHash, buildHash, isValidLinkBase, composeLinkURL, slugify, sectionSlugify, sectionReferences, oneBasedIndex, tabIndexOf, tabReference,' +
    ' stepIndexOf, stepReference, resolveHashTarget, rectsOverlap, overlapArea,' +
    ' waterfallModel, orbitPositions, zoneModel, xrayModel, pirModel, thermoModel, batteryModel, bufferModel, radarModel, pointInPoly, signalModel, tilesModel, lintPage, CONTRACT_VERSION,' +
    ' queueModel, queuePanelHTML, contractCardHTML, inlineMarkup, generatedFromHTML, bulletsHTML, renderPanelBody, panelOrder,' +
    ' fragmentVisible, fragmentAttrs, shouldTweenStep, nodeTonesAt, tonePulseNodes, applyNodeTones, applyStepNodeFocus, foldInflightStates, inflightModel, inflightPanelHTML,' +
    ' foldPhoneStates, phoneModel, phonePanelHTML, PANEL_TYPES,' +
    ' samplePathD, countPathRectHits, resolveEdgeAvoidance, resolveSkin, skinBase, skinClasses, applySkinClasses, fallbackCopy,' +
    ' activeTabReferences, restoreActiveTabs, embedRequestFromHash, embedTargetSection, parseClock, formatClock, timelineModel,' +
    ' bindCopyControl, wireDeepLinks, COPY_ICON, COPY_OK_ICON, COPY_FAIL_ICON,' +
    ' sectionHasProse, sectionIntroHTML, setProseCollapsed, createProseController, TONE_SET,' +
    ' safeBacklinkHref, parseBacklinks, wireNodeBacklinks, createBoardGrid, SKIN_NAMES};';
  const sandbox = {console, URL, ...overrides};
  vm.runInNewContext(code, sandbox);
  return sandbox.__exports;
}
const C = loadCore();

function layoutNode(tag){
  return {
    tag, className:'', children:[], parentNode:null,
    appendChild(child){ child.parentNode = this; this.children.push(child); return child; }
  };
}

function readSpec(rel){
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

test('derived backlink parser keeps exact-title safe links and rejects unsafe data', () => {
  const parsed = C.parseBacklinks(JSON.stringify({services: {
    Relay: [
      {href: '../doorbell/doorbell.html', title: 'Doorbell'},
      {href: '../doorbell/doorbell.html', title: 'duplicate'},
      {href: 'sibling.html', title: 'Same family'},
      {href: 'javascript:alert(1)', title: 'Hostile'}
    ],
    relay: [{href: '../other/page.html', title: 'Case-sensitive peer'}],
    Broken: 'not a list'
  }}));
  assert.deepStrictEqual(Array.from(parsed.Relay, x => x.href),
    ['../doorbell/doorbell.html', 'sibling.html']);
  assert.strictEqual(parsed.Relay[0].title, 'Doorbell');
  assert.strictEqual(parsed.relay[0].title, 'Case-sensitive peer');
  assert.strictEqual(parsed.Broken, undefined);
  assert.strictEqual(C.safeBacklinkHref('/absolute/page.html'), false);
  assert.strictEqual(C.safeBacklinkHref('../../escape.html'), false);
});

test('derived backlink parser degrades malformed or absent data to no affordances', () => {
  assert.strictEqual(Object.keys(C.parseBacklinks('{not json')).length, 0);
  assert.strictEqual(Object.keys(C.parseBacklinks(null)).length, 0);
  assert.strictEqual(Object.keys(C.parseBacklinks({services: []})).length, 0);
});

test('derived backlink affordances are themed for six skins and hidden in print', () => {
  const css = fs.readFileSync(path.join(ROOT, 'src', 'style.core.css'), 'utf8');
  ['.sk-aurora .nbackpop', '.sk-daylight .nbackpop',
   'body.sk-editorial .nbackpop', 'body.sk-terminal .nbackpop',
   'body.sk-pastel .nbackpop', 'body.sk-blueprint .nbackpop'].forEach(selector => {
    assert.ok(css.includes(selector), selector);
  });
  assert.match(css, /@media print\{[\s\S]*?\.nbackref, \.nbackpop[\s\S]*?display:none !important;/);
});

test('panel boards keep the step bar in the diagram cell before the top-aligned panel column', () => {
  const local = loadCore({document:{createElement:layoutNode}});
  const section = layoutNode('section');
  const layout = local.createBoardGrid(section, true);
  const board = layoutNode('div'); board.className = 'board';
  const bar = layoutNode('div'); bar.className = 'termbar';
  const panels = layoutNode('div'); panels.className = 'panelcol';
  layout.diagramHost.appendChild(board);
  layout.grid.appendChild(panels);
  layout.controlsHost.appendChild(bar);

  assert.strictEqual(section.children[0], layout.grid);
  assert.deepStrictEqual(layout.grid.children, [layout.diagramCol, panels]);
  assert.deepStrictEqual(layout.diagramCol.children, [board, bar]);
  assert.strictEqual(bar.parentNode, layout.diagramCol);
  assert.ok(layout.grid.children.indexOf(layout.diagramCol) < layout.grid.children.indexOf(panels),
    'DOM order drives the collapsed mobile order: diagram, controls, widgets');

  const css = fs.readFileSync(path.join(ROOT, 'src', 'style.core.css'), 'utf8');
  assert.match(css, /\.boardgrid\.haspanels\{[^}]*align-items:start;/);
  assert.match(css, /\.boardgrid\.haspanels > \.panelcol\{align-self:start;\}/);
  ['editorial', 'terminal', 'pastel', 'blueprint'].forEach(skin => {
    assert.match(css, new RegExp('body\\.sk-' + skin +
      ' \\.boardgrid\\.haspanels\\s*\\{\\s*grid-template-columns:1fr;'));
  });
});

test('boards without panels retain the original grid and section-sibling step bar structure', () => {
  const local = loadCore({document:{createElement:layoutNode}});
  const section = layoutNode('section');
  const layout = local.createBoardGrid(section, false);
  const board = layoutNode('div'); board.className = 'board';
  const bar = layoutNode('div'); bar.className = 'termbar';
  layout.diagramHost.appendChild(board);
  layout.controlsHost.appendChild(bar);

  assert.strictEqual(layout.diagramCol, null);
  assert.strictEqual(layout.grid.className, 'boardgrid');
  assert.deepStrictEqual(layout.grid.children, [board]);
  assert.deepStrictEqual(section.children, [layout.grid, bar]);
});

test('derived backlink popover supports the complete keyboard focus walk-through', async () => {
  function eventNode(tag = 'div'){
    const listeners = Object.create(null);
    const node = {
      tag, children: [], parentNode: null, hidden: false, attributes: Object.create(null),
      style: {}, offsetWidth: 260, offsetHeight: 40, focusCount: 0,
      addEventListener(type, fn){ (listeners[type] ||= []).push(fn); },
      appendChild(child){ child.parentNode = this; this.children.push(child); return child; },
      setAttribute(name, value){ this.attributes[name] = String(value); },
      getAttribute(name){ return this.attributes[name] ?? null; },
      contains(target){
        return target === this || this.children.some(child => child.contains(target));
      },
      emit(type, fields = {}){
        const ev = {type, target: this, currentTarget: this, relatedTarget: null,
          key: undefined, preventDefault(){ this.defaultPrevented = true; },
          stopPropagation(){ this.propagationStopped = true; }, ...fields};
        (listeners[type] || []).forEach(fn => fn(ev));
        return ev;
      },
      focus(){ this.focusCount++; document.activeElement = this; this.emit('focus'); },
      getBoundingClientRect(){ return {left: 100, top: 40, bottom: 60, width: 20}; }
    };
    Object.defineProperty(node, 'innerHTML', {
      get(){ return ''; },
      set(){ node.children = []; }
    });
    return node;
  }

  const document = eventNode('document');
  document.documentElement = {clientWidth: 1200, clientHeight: 800};
  document.createElement = tag => eventNode(tag);
  const trigger = eventNode('g');
  trigger.setAttribute('data-dv-node-id', 'relay');
  const svg = eventNode('svg');
  svg.querySelectorAll = selector => selector === '.nbackref' ? [trigger] : [];
  const scrollHost = eventNode('scroll-host');
  const host = eventNode('host');
  host.parentNode = scrollHost;
  const local = loadCore({document, window: {innerWidth: 1200, innerHeight: 800},
    setTimeout, clearTimeout});
  local.wireNodeBacklinks(host, svg, {
    nodes: {relay: {title: 'Relay'}}
  }, 'flow', {Relay: [
    {href: '../alpha/a.html', title: 'Alpha'},
    {href: '../beta/b.html', title: 'Beta'}
  ]});

  const pop = host.children[0];
  trigger.focus();
  assert.strictEqual(pop.hidden, false);
  assert.strictEqual(trigger.getAttribute('aria-expanded'), 'true');
  const first = pop.children[1], second = pop.children[2];

  // Tab from the unpinned SVG trigger into the first link.  The trigger's
  // mouse-leave timer must not be allowed to hide a keyboard-focused popover.
  document.activeElement = null;
  trigger.emit('mouseleave');
  trigger.emit('focusout', {relatedTarget: first});
  document.activeElement = first;
  pop.emit('focusin', {target: first, relatedTarget: trigger});
  await new Promise(resolve => setTimeout(resolve, 170));
  assert.strictEqual(pop.hidden, false);

  // Tabbing between links remains inside; tabbing past the last link closes.
  pop.emit('focusout', {target: first, relatedTarget: second});
  document.activeElement = second;
  pop.emit('focusin', {target: second, relatedTarget: first});
  assert.strictEqual(pop.hidden, false);
  const outside = eventNode('button');
  pop.emit('focusout', {target: second, relatedTarget: outside});
  assert.strictEqual(pop.hidden, true);

  // Escape closes and restores the trigger without its focus handler reopening;
  // a pinned mouse/keyboard activation still closes on click-away.
  trigger.focus();
  document.activeElement = first;
  pop.emit('keydown', {target: first, key: 'Escape'});
  assert.strictEqual(pop.hidden, true);
  assert.strictEqual(document.activeElement, trigger);
  trigger.emit('click');
  assert.strictEqual(pop.hidden, false);
  document.emit('click', {target: outside});
  assert.strictEqual(pop.hidden, true);
});

test('step tween decision: only adjacent forward/back narrative steps animate', () => {
  assert.strictEqual(C.shouldTweenStep(2, 3, false, true), true);
  assert.strictEqual(C.shouldTweenStep(3, 2, false, true), true);
  assert.strictEqual(C.shouldTweenStep(2, 2, false, true), false, 'same step is not a transition');
  assert.strictEqual(C.shouldTweenStep(1, 4, false, true), false, 'distant jump is immediate');
  assert.strictEqual(C.shouldTweenStep(4, 0, false, true), false, 'autoplay wrap is a jump');
  assert.strictEqual(C.shouldTweenStep(null, 0, false, true), false, 'first paint is immediate');
  assert.strictEqual(C.shouldTweenStep(0.5, 1, false, true), false, 'indices must be valid integers');
});

test('step tween decision: reduced motion and explicit jump paths are hard gates', () => {
  assert.strictEqual(C.shouldTweenStep(2, 3, true, true), false, 'reduced motion disables adjacency tween');
  assert.strictEqual(C.shouldTweenStep(2, 3, false, false), false, 'deep-link/restore jump is immediate');
  assert.strictEqual(C.shouldTweenStep(2, 3, false), true, 'ordinary narrative path is the default');
});

test('node tones fold set/change/null clear/base clear and ignore unknown data', () => {
  const d = {
    nodes: {gateway: {}, relay: {}, offrow: {}},
    rows: [['gateway', 'relay']],
    floats: [{id: 'offrow'}],
    steps: [
      {tone: {gateway: 'alert', ghost: 'warn'}},
      {},
      {tone: {gateway: 'warn', relay: 'dim', offrow: 'ok'}},
      {tone: {gateway: null, relay: '#ff0000'}},
      {tone: {relay: 'ok'}},
      {tone: {relay: 'base', offrow: null}},
    ],
  };
  const states = C.foldNodeTones(d);
  assert.strictEqual(states.length, 6);
  assert.deepStrictEqual({...states[0]}, {gateway: 'alert'});
  assert.deepStrictEqual({...states[1]}, {gateway: 'alert'}, 'sparse state carries');
  assert.deepStrictEqual({...states[2]}, {gateway: 'warn', relay: 'dim', offrow: 'ok'});
  assert.deepStrictEqual({...states[3]}, {relay: 'dim', offrow: 'ok'},
    'null clears while an unknown token leaves prior state unchanged');
  assert.deepStrictEqual({...states[4]}, {relay: 'ok', offrow: 'ok'},
    'a non-adjacent jump reads the complete folded snapshot');
  assert.deepStrictEqual({...states[5]}, {}, 'base and null both clear');
  assert.ok(!Object.hasOwn(states[0], 'ghost'), 'unknown node ids never enter folded state');
});

test('node tones are step-player state: ambient always resolves to base appearance', () => {
  const states = C.foldNodeTones({nodes: {gateway: {}}, steps: [
    {tone: {gateway: 'alert'}}, {}, {tone: {gateway: 'ok'}},
  ]});
  assert.deepStrictEqual({...C.nodeTonesAt(states, 2, true)}, {gateway: 'ok'});
  assert.deepStrictEqual({...C.nodeTonesAt(states, 2, false)}, {},
    'ambient ignores even a folded non-adjacent target');
});

test('node tone pulse is one-shot only for an adjacent forward tone change', () => {
  const states = C.foldNodeTones({nodes: {gateway: {}, relay: {}}, steps: [
    {tone: {gateway: 'alert'}},
    {tone: {relay: 'dim'}},
    {tone: {gateway: 'warn'}},
    {tone: {gateway: null}},
  ]});
  assert.deepStrictEqual(Array.from(C.tonePulseNodes(states, null, 0, false, true)), [],
    'first paint is settled');
  assert.deepStrictEqual(Array.from(C.tonePulseNodes(states, 0, 1, false, true)), ['relay'],
    'only the node whose tone changed pulses');
  assert.deepStrictEqual(Array.from(C.tonePulseNodes(states, 1, 2, false, true)), ['gateway']);
  assert.deepStrictEqual(Array.from(C.tonePulseNodes(states, 2, 3, false, true)), ['gateway'],
    'clearing a tone is a change');
  assert.deepStrictEqual(Array.from(C.tonePulseNodes(states, 3, 2, false, true)), [],
    'backward adjacency is settled');
  assert.deepStrictEqual(Array.from(C.tonePulseNodes(states, 0, 2, false, true)), [],
    'non-adjacent jump is settled');
  assert.deepStrictEqual(Array.from(C.tonePulseNodes(states, 1, 2, true, true)), [],
    'reduced motion disables the pulse');
  assert.deepStrictEqual(Array.from(C.tonePulseNodes(states, 1, 2, false, false)), [],
    'explicit jump/restore paths are settled');
  assert.strictEqual(C.shouldTweenStep(2, 1, false, true), true,
    'the existing bidirectional tween classifier remains independent');
});

test('equal node-tone rewrite neither pulses nor rewrites unchanged class markup', () => {
  const states = C.foldNodeTones({nodes: {gateway: {}}, steps: [
    {tone: {gateway: 'alert'}},
    {tone: {gateway: 'alert'}},
  ]});
  const pulses = Array.from(C.tonePulseNodes(states, 0, 1, false, true));
  assert.deepStrictEqual(pulses, [], 'alert to alert is not a semantic tone change');

  const values = new Set();
  let writes = 0;
  const gateway = {classList: {
    add(name){ writes++; values.add(name); },
    remove(name){ writes++; values.delete(name); },
    contains(name){ return values.has(name); },
  }, getBoundingClientRect(){ return {width: 100}; }};
  C.applyNodeTones({gateway}, states[0], []);
  assert.deepStrictEqual(Array.from(values), ['tone-alert']);
  writes = 0;
  C.applyNodeTones({gateway}, states[1], pulses);
  assert.strictEqual(writes, 0, 'unchanged tone class markup is left untouched');
  assert.deepStrictEqual(Array.from(values), ['tone-alert']);
});

test('node tone and step focus remain independent and compose in class markup', () => {
  function fakeNode(initial){
    const values = new Set(initial || []);
    return {values, classList: {
      add(name){ values.add(name); },
      remove(name){ values.delete(name); },
      contains(name){ return values.has(name); },
    }};
  }
  const litOnly = fakeNode(['lit']);
  const tonedOnly = fakeNode();
  const tonedAndLit = fakeNode(['lit']);
  C.applyNodeTones({litOnly, tonedOnly, tonedAndLit}, {
    tonedOnly: 'alert', tonedAndLit: 'alert',
  }, []);

  /* Even if normalized step data were to retain tone patch targets, focus
     consumes only authored nodes and active-edge endpoints. */
  litOnly.values.delete('lit');
  tonedAndLit.values.delete('lit');
  C.applyStepNodeFocus({litOnly, tonedOnly, tonedAndLit}, {
    keys: ['active-edge'], nodes: ['tonedAndLit'], toneNodes: ['tonedOnly', 'tonedAndLit'],
  }, {'active-edge': {e: {from: 'litOnly', to: 'missing'}}});

  assert.deepStrictEqual(Array.from(litOnly.values).sort(), ['lit'], 'focus alone is lit only');
  assert.deepStrictEqual(Array.from(tonedOnly.values).sort(), ['tone-alert'],
    'a tone patch does not imply focus');
  assert.deepStrictEqual(Array.from(tonedAndLit.values).sort(), ['lit', 'tone-alert'],
    'an independently focused toned node carries both dimensions');
});

test('node tone renderer keeps a steady baseline and clears all state for ambient', () => {
  function fakeNode(){
    const values = new Set();
    return {values, classList: {
      add(name){ values.add(name); },
      remove(name){ values.delete(name); },
      contains(name){ return values.has(name); },
    }, getBoundingClientRect(){ return {width: 100}; }};
  }
  const gateway = fakeNode(), relay = fakeNode();
  const nodes = {gateway, relay};
  C.applyNodeTones(nodes, {gateway: 'alert', relay: 'dim'}, ['gateway']);
  assert.ok(gateway.values.has('tone-alert') && gateway.values.has('tone-pulse'));
  assert.ok(relay.values.has('tone-dim') && !relay.values.has('tone-pulse'));
  C.applyNodeTones(nodes, {gateway: 'alert', relay: 'dim'}, []);
  assert.ok(gateway.values.has('tone-alert') && !gateway.values.has('tone-pulse'),
    'settle pass removes presentation metadata but keeps absolute state');
  C.applyNodeTones(nodes, {}, []);
  assert.deepStrictEqual(Array.from(gateway.values), []);
  assert.deepStrictEqual(Array.from(relay.values), []);
});

test('validator warns, never errors, for bad node-tone shapes, ids, and tokens', () => {
  const page = C.normalize({
    nodes: {gateway: {}, offrow: {}}, rows: [['gateway']], floats: [{id: 'offrow'}],
    steps: [
      {nodes: ['gateway'], tone: 'alert', text: 'scalar'},
      {nodes: ['gateway'], tone: ['alert'], text: 'array'},
      {nodes: ['gateway'], tone: null, text: 'null shape'},
      {tone: {gateway: '#ff0000'}, text: 'raw color'},
      {tone: {ghost: 'alert'}, text: 'unknown id'},
      {tone: {offrow: 'warn'}, text: 'float is valid'},
    ],
  });
  const result = C.validate(page);
  assert.strictEqual(result.errors.length, 0, result.errors.join('; '));
  const toneWarnings = result.warnings.filter(w => w.includes('.tone'));
  assert.ok(toneWarnings.filter(w => w.includes('must be an object')).length === 3,
    toneWarnings.join('; '));
  assert.ok(toneWarnings.some(w => w.includes('#ff0000') &&
    w.includes('valid: alert warn ok dim base')), toneWarnings.join('; '));
  assert.ok(toneWarnings.some(w => w.includes('unknown node id "ghost"')), toneWarnings.join('; '));
  assert.ok(!toneWarnings.some(w => w.includes('offrow')), 'floats support tones without warnings');
});

test('node tone CSS has complete, accessible card/title colors for all six skins and four tones', () => {
  const css = fs.readFileSync(path.join(ROOT, 'src', 'style.core.css'), 'utf8');
  const uncommented = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = Array.from(uncommented.matchAll(/([^{}]+)\{([^{}]*)\}/g), match => {
    const declarations = Object.create(null);
    match[2].split(';').forEach(part => {
      const colon = part.indexOf(':');
      if (colon < 0) return;
      declarations[part.slice(0, colon).trim()] = part.slice(colon + 1).trim();
    });
    return {selectors: match[1].split(',').map(selector => selector.trim()), declarations};
  });
  function declarationsFor(selector){
    return rules.filter(rule => rule.selectors.includes(selector)).reduce(
      (all, rule) => Object.assign(all, rule.declarations), Object.create(null));
  }
  function parsedHex(value){
    const m = /^#([0-9a-f]{6})$/i.exec(value || '');
    return m ? [0, 2, 4].map(i => Number.parseInt(m[1].slice(i, i + 2), 16)) : null;
  }
  function relativeLuminance(rgb){
    const channels = rgb.map(value => {
      const srgb = value / 255;
      return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  }
  function contrastRatio(a, b){
    const aLum = relativeLuminance(a), bLum = relativeLuminance(b);
    return (Math.max(aLum, bLum) + 0.05) / (Math.min(aLum, bLum) + 0.05);
  }
  const skinPrefixes = [
    '.sk-aurora', '.sk-daylight',
    'body.sk-editorial .sk-aurora', 'body.sk-terminal .sk-aurora',
    'body.sk-pastel .sk-aurora', 'body.sk-blueprint .sk-aurora',
  ];
  ['alert', 'warn', 'ok', 'dim'].forEach(tone => {
    skinPrefixes.forEach(prefix => {
      const cardSelector = `${prefix} .node.tone-${tone} .card`;
      const titleSelector = `${prefix} .node.tone-${tone} .t1`;
      const card = declarationsFor(cardSelector);
      const title = declarationsFor(titleSelector);
      assert.ok(card.fill, `${cardSelector} needs a fill color`);
      assert.ok(card.stroke, `${cardSelector} needs a stroke color`);
      assert.ok(Object.hasOwn(card, 'filter'), `${cardSelector} needs an explicit glow/filter treatment`);
      assert.ok(title.fill, `${titleSelector} needs a title color`);
      const backgroundRgb = parsedHex(card.fill);
      const titleRgb = parsedHex(title.fill);
      if (backgroundRgb && titleRgb){
        const ratio = contrastRatio(titleRgb, backgroundRgb);
        assert.ok(ratio >= 4.5,
          `${titleSelector} contrast ${ratio.toFixed(3)} must be at least 4.5:1 against ${card.fill}`);
      }
      const litCard = declarationsFor(`${prefix} .stepmode .node.lit.tone-${tone} .card`);
      assert.strictEqual(litCard['stroke-width'], '2.4',
        `${prefix} ${tone} focus needs independent stroke emphasis`);
      assert.match(litCard.filter || '', /var\(--dv-tone-lit-glow\).*brightness\(1\.06\)/,
        `${prefix} ${tone} focus needs the composed tone halo`);
    });
  });
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\{[\s\S]*?\.node\.tone-pulse \.card,[\s\S]*?animation:none !important;/);
});

test('print resets node tones to the structural base card and disables their pulse', () => {
  const css = fs.readFileSync(path.join(ROOT, 'src', 'style.core.css'), 'utf8');
  assert.match(css, /@media print\{[\s\S]*?\.node\.tone-alert \.card,\.node\.tone-warn \.card,[\s\S]*?fill:#FFFFFF !important;stroke:#999999 !important;filter:none !important;animation:none !important;/);
  assert.match(css, /@media print\{[\s\S]*?\.node\.tone-alert \.t1,\.node\.tone-warn \.t1,[\s\S]*?fill:#111111 !important;/);
  assert.match(css, /@media print\{[\s\S]*?\.node\.tone-pulse \.card\{animation:none !important;\}/);
});

test('validator: generatedFrom warns on wrong shapes and unsafe URLs', () => {
  const page = generatedFrom => ({blocks: [{heading: 'Only section'}], generatedFrom});
  assert.ok(C.validate(page('not an object')).warnings.some(w => w.includes('page.generatedFrom: must be an object')));
  assert.ok(C.validate(page([])).warnings.some(w => w.includes('page.generatedFrom: must be an object')));
  assert.ok(C.validate(page(null)).warnings.some(w => w.includes('page.generatedFrom: must be an object')));

  const bad = C.validate(page({url: 42, label: false, version: {}, at: null})).warnings;
  ['url', 'label', 'version', 'at'].forEach(k => {
    assert.ok(bad.some(w => w.includes('page.generatedFrom.' + k + ': must be a string')), bad.join('; '));
  });
  assert.ok(C.validate(page({label: 'Brief'})).warnings.some(w => w.includes('page.generatedFrom.url: required')));
  assert.ok(C.validate(page({url: 'confluence:doorbell', label: 'Brief'})).warnings.some(w =>
    w.includes('page.generatedFrom.url: only http(s) URLs become links')));
  assert.strictEqual(C.validate(page({url: 'https://example.com/hld', at: '09-07-2026 15:05'})).warnings.length, 0);
});

test('generatedFromHTML: renders the complete standard line with a safe link', () => {
  const html = C.generatedFromHTML({
    url: 'https://example.com/hld?a=1&b=2', label: 'Doorbell <HLD>', version: 'v12', at: '09-07-2026 14:30'
  });
  assert.strictEqual(html,
    '<p class="generated-from">Generated from <a href="https://example.com/hld?a=1&amp;b=2" target="_blank" rel="noopener">Doorbell &lt;HLD&gt;</a> · v12 · 09-07-2026 14:30</p>');
});

test('generatedFromHTML: non-http(s) URL renders escaped label text, not a link', () => {
  const html = C.generatedFromHTML({url: 'javascript:alert(1)', label: 'Doorbell <HLD>'});
  assert.strictEqual(html,
    '<p class="generated-from">Generated from Doorbell &lt;HLD&gt;</p>');
  assert.ok(!html.includes('<a '), html);
});

test('generatedFromHTML: absent optional parts omit their separators', () => {
  assert.strictEqual(C.generatedFromHTML({url: 'http://example.com/hld'}),
    '<p class="generated-from">Generated from <a href="http://example.com/hld" target="_blank" rel="noopener">source document</a></p>');
  assert.strictEqual(C.generatedFromHTML({url: 'https://example.com/hld', at: '09-07-2026 14:30'}),
    '<p class="generated-from">Generated from <a href="https://example.com/hld" target="_blank" rel="noopener">source document</a> · 09-07-2026 14:30</p>');
  assert.strictEqual(C.generatedFromHTML({label: 'No URL'}), '');
});

/* ---------------- validation ---------------- */

test('cumulus example spec v1 validates with 0 errors', () => {
  const page = C.normalize(readSpec('examples/cumulus/cumulus-page.spec.json'));
  const v = C.validate(page);
  assert.strictEqual(v.errors.length, 0, v.errors.join('; '));
});

test('cumulus example spec v2 validates with 0 errors', () => {
  const page = C.normalize(readSpec('examples/cumulus/cumulus-page.spec.v2.json'));
  const v = C.validate(page);
  assert.strictEqual(v.errors.length, 0, v.errors.join('; '));
});

test('doorbell example spec validates with 0 errors', () => {
  const page = C.normalize(readSpec('examples/doorbell/doorbell.spec.json'));
  const v = C.validate(page);
  assert.strictEqual(v.errors.length, 0, v.errors.join('; '));
});

test('unknown edge endpoint produces a field-path error', () => {
  const page = C.normalize({nodes: {a: {}}, rows: [['a']],
                            edges: [{from: 'a', to: 'ghost'}]});
  const v = C.validate(page);
  assert.ok(v.errors.some(e => e.includes('edges[0].to') && e.includes('ghost')), v.errors.join('; '));
});

test('missing rows produces a field-path error', () => {
  const page = C.normalize({page: {blocks: [{diagram: {nodes: {a: {}}}}]}});
  const v = C.validate(page);
  assert.ok(v.errors.some(e => e.includes('diagram.rows')), v.errors.join('; '));
});

test('row referencing an undefined node produces a field-path error', () => {
  const page = C.normalize({nodes: {a: {}}, rows: [['a', 'missing']]});
  const v = C.validate(page);
  assert.ok(v.errors.some(e => e.includes('rows[0]') && e.includes('missing')), v.errors.join('; '));
});

test('duplicate panel id produces an error; unknown panel type warns', () => {
  const page = C.normalize({nodes: {a: {}}, rows: [['a']],
    panels: [{id: 'p', type: 'state'}, {id: 'p', type: 'sparkline'}]});
  const v = C.validate(page);
  assert.ok(v.errors.some(e => e.includes('panels[1].id') && e.includes('duplicate')), v.errors.join('; '));
  assert.ok(v.warnings.some(w => w.includes('panels[1].type') && w.includes('sparkline')), v.warnings.join('; '));
});

test('edgeless step with nodes/panels is legal; a step with nothing warns', () => {
  const page = C.normalize({nodes: {a: {}}, rows: [['a']],
    panels: [{id: 'hw', type: 'state', states: ['A']}],
    steps: [{nodes: ['a'], text: 'boot'},
            {panels: {hw: {state: 'A'}}, text: 'patch only'},
            {text: 'nothing at all'}]});
  const v = C.validate(page);
  assert.strictEqual(v.errors.length, 0, v.errors.join('; '));
  const empties = v.warnings.filter(w => w.includes('no edge/edges, nodes, or panels'));
  assert.strictEqual(empties.length, 1);
  assert.ok(empties[0].includes('steps[2]'));
});

test('step patch on undeclared panel id warns with path', () => {
  const page = C.normalize({nodes: {a: {}}, rows: [['a']],
    panels: [{id: 'hw', type: 'state'}],
    steps: [{nodes: ['a'], panels: {nope: {state: 'X'}}, text: 't'}]});
  const v = C.validate(page);
  assert.ok(v.warnings.some(w => w.includes('steps[0].panels') && w.includes('nope')), v.warnings.join('; '));
});

test('undeclared lane warns; declared lane does not', () => {
  const page = C.normalize({page: {lanes: {NET: {color: '#38E1FF'}},
    blocks: [{diagram: {nodes: {a: {}, b: {}}, rows: [['a', 'b']],
      edges: [{from: 'a', to: 'b'}],
      steps: [{edge: 'a->b', lane: 'NET', text: 'ok'},
              {edge: 'a->b', lane: 'CAM', text: 'undeclared'}]}}]}});
  const v = C.validate(page);
  const laneWarns = v.warnings.filter(w => w.includes('.lane'));
  assert.strictEqual(laneWarns.length, 1);
  assert.ok(laneWarns[0].includes('CAM'));
});

/* ---------------- lint + contract version ---------------- */

test('lint: crowded fixture fires corridor, label-length, coin-collision, and unused-protocol warnings', () => {
  const raw = readSpec('tests/fixtures/lint-crowded.json');
  const page = C.normalize(raw);
  const v = C.validate(page);
  assert.strictEqual(v.errors.length, 0, v.errors.join('; '));
  const lint = C.lintPage(page);
  assert.ok(lint.some(w => w.includes('cross the corridor between rows 1 and 2')), lint.join('; '));
  assert.ok(lint.some(w => w.includes('edges[0].label') && w.includes('longer than its edge')), lint.join('; '));
  assert.ok(lint.some(w => w.includes('steps[1]') && w.includes('shares first edge "a->g"') && w.includes('steps[0]')), lint.join('; '));
  assert.ok(!lint.some(w => w.includes('rows —')),
    'row count alone is not a lint finding (operator ruling: three rows is often the best shape): ' + lint.join('; '));
  assert.ok(lint.some(w => w.includes('page.protocols.unusedproto') && w.includes('no edge uses')), lint.join('; '));
});

test('lint: a clean small spec produces no lint warnings', () => {
  const page = C.normalize({nodes: {a: {title: 'A'}, b: {title: 'B'}}, rows: [['a', 'b']],
    edges: [{from: 'a', to: 'b', kind: 'int', label: 'ok'}],
    steps: [{edge: 'a->b', text: 't'}]});
  assert.deepStrictEqual(C.lintPage(page).length, 0);
});

test('lint: never throws on the broken fixtures', () => {
  for (const f of ['broken-edge-endpoint', 'broken-missing-rows', 'broken-unknown-node-in-row',
                   'broken-duplicate-panel-id', 'broken-not-a-page']){
    const page = C.normalize(readSpec('tests/fixtures/' + f + '.json'));
    const lint = C.lintPage(page);
    assert.ok(Array.isArray(lint), f);
  }
});

test('lint: runs clean-typed (array) on all example specs', () => {
  for (const rel of ['examples/cumulus/cumulus-page.spec.json',
                     'examples/cumulus/cumulus-page.spec.v2.json',
                     'examples/doorbell/doorbell.spec.json',
                     'examples/doorbell-atlas/atlas.spec.json']){
    const lint = C.lintPage(C.normalize(readSpec(rel)));
    assert.ok(Array.isArray(lint), rel + ': ' + lint);
  }
});

test('contract version: mismatch warns, match and absence do not', () => {
  const mk = c => C.normalize({page: {contract: c,
    blocks: [{diagram: {nodes: {a: {}}, rows: [['a']]}}]}});
  const warnOf = page => C.validate(page).warnings.filter(w => w.includes('page.contract'));
  assert.strictEqual(warnOf(mk('2')).length, 1);
  assert.ok(warnOf(mk('2'))[0].includes('implements contract ' + C.CONTRACT_VERSION));
  assert.strictEqual(warnOf(mk('1')).length, 0);
  assert.strictEqual(warnOf(mk('1.3')).length, 0);
  const noField = C.normalize({page: {blocks: [{diagram: {nodes: {a: {}}, rows: [['a']]}}]}});
  assert.strictEqual(warnOf(noField).length, 0);
});

test('all six skin tokens validate; an unknown skin keeps the existing Aurora warning fallback', () => {
  const mk = skin => C.normalize({page: {skin,
    blocks: [{diagram: {nodes: {a: {}}, rows: [['a']]}}]}});
  assert.deepStrictEqual(Array.from(C.SKIN_NAMES),
    ['aurora', 'daylight', 'editorial', 'terminal', 'pastel', 'blueprint']);
  for (const skin of C.SKIN_NAMES){
    assert.strictEqual(C.validate(mk(skin)).warnings.filter(w => w.includes('page.skin')).length, 0, skin);
  }
  const warnings = C.validate(mk('sepia')).warnings.filter(w => w.includes('page.skin'));
  assert.strictEqual(warnings.length, 1);
  assert.ok(warnings[0].includes('using "aurora"'));
});

test('resolveSkin gives a plain dv_skin cookie precedence over the spec default', () => {
  assert.strictEqual(C.resolveSkin('session=x; dv_skin=terminal; mode=y', 'pastel'), 'terminal');
  assert.strictEqual(C.resolveSkin('dv_skin=blueprint', 'daylight'), 'blueprint');
});

test('resolveSkin URL-decodes an encoded valid dv_skin cookie token', () => {
  assert.strictEqual(C.resolveSkin('session=x; dv_skin=%65ditorial; mode=y', 'pastel'), 'editorial');
});

test('resolveSkin leaves malformed cookie encoding to normal invalid-token fallback', () => {
  assert.strictEqual(C.resolveSkin('dv_skin=%E0%A4%A', 'terminal'), 'terminal');
  assert.strictEqual(C.resolveSkin('dv_skin=%', undefined), 'aurora');
});

test('resolveSkin ignores invalid cookie tokens, then uses a valid spec default or Aurora', () => {
  assert.strictEqual(C.resolveSkin('dv_skin=sepia; session=x', 'editorial'), 'editorial');
  assert.strictEqual(C.resolveSkin('dv_skin=sepia', 'sepia'), 'aurora');
  assert.strictEqual(C.resolveSkin('', undefined), 'aurora');
});

test('applySkinClasses layers overlays on Aurora and rejects unknown tokens without a change', () => {
  const classList = (...initial) => {
    const values = new Set(initial);
    return {values, add: value => values.add(value), remove: value => values.delete(value)};
  };
  const body = {classList: classList('host-shell', 'sk-daylight')};
  const label = {textContent: ''};
  const view = {classList: classList('docview', 'sk-daylight'), querySelector: () => label};
  assert.strictEqual(C.applySkinClasses(body, view, 'editorial'), true);
  assert.deepStrictEqual(Array.from(body.classList.values).sort(), ['host-shell', 'sk-aurora', 'sk-editorial']);
  assert.deepStrictEqual(Array.from(view.classList.values).sort(), ['docview', 'sk-aurora', 'sk-editorial']);
  assert.strictEqual(label.textContent, 'generated from spec · skin: editorial');
  const before = Array.from(body.classList.values).sort();
  assert.strictEqual(C.applySkinClasses(body, view, 'sepia'), false);
  assert.deepStrictEqual(Array.from(body.classList.values).sort(), before);
});


/* ---------------- tab restore across re-render ---------------- */

function tabBlockMock(slugs, active){
  return {
    slugs, count: slugs.length, _active: active, selectCalls: [],
    active(){ return this._active; },
    select(i, focus){ this._active = i; this.selectCalls.push([i, focus]); }
  };
}

test('activeTabReferences captures slug and position per tabs block', () => {
  const ctl = {tabBlocks: [tabBlockMock(['flow', 'ota', 'guide'], 1), tabBlockMock(['x', 'y'], 0)]};
  assert.deepStrictEqual(JSON.parse(JSON.stringify(C.activeTabReferences(ctl))),
    [{slug: 'ota', index: 1}, {slug: 'x', index: 0}]);
  assert.strictEqual(C.activeTabReferences(null), null);
  assert.strictEqual(C.activeTabReferences({tabBlocks: []}), null);
});

test('restoreActiveTabs re-selects a surviving slug without focusing it', () => {
  const tb = tabBlockMock(['flow', 'ota', 'guide'], 0);
  C.restoreActiveTabs({tabBlocks: [tb]}, [{slug: 'ota', index: 1}]);
  assert.strictEqual(tb._active, 1);
  assert.deepStrictEqual(tb.selectCalls, [[1, false]]);
  /* the slug moved: it is found at its new position */
  const moved = tabBlockMock(['ota', 'flow', 'guide'], 0);
  C.restoreActiveTabs({tabBlocks: [moved]}, [{slug: 'ota', index: 1}]);
  assert.strictEqual(moved._active, 0);
  assert.deepStrictEqual(moved.selectCalls, []); /* index 0 needs no select */
});

test('restoreActiveTabs keeps the default first tab when the slug is gone', () => {
  const tb = tabBlockMock(['flow', 'guide'], 0);
  C.restoreActiveTabs({tabBlocks: [tb]}, [{slug: 'ota', index: 1}]);
  assert.strictEqual(tb._active, 0);
  assert.deepStrictEqual(tb.selectCalls, []);
});

test('a vanished numeric label never falls back to a positional pick', () => {
  /* a tab labeled "2" has the unique slug '2'; when that tab is removed the
     restore must default, not select whatever now sits second */
  const before = tabBlockMock(['flow', 'ota', '2'], 2);
  const saved = C.activeTabReferences({tabBlocks: [before]});
  assert.deepStrictEqual(JSON.parse(JSON.stringify(saved)), [{slug: '2', index: 2}]);
  const after = tabBlockMock(['flow', 'ota', 'guide'], 0);
  C.restoreActiveTabs({tabBlocks: [after]}, saved);
  assert.strictEqual(after._active, 0);
  assert.deepStrictEqual(after.selectCalls, []);
});

test('a duplicate tab label is restored to the same occurrence by position', () => {
  const before = tabBlockMock(['same', 'same', 'other'], 1);
  const saved = C.activeTabReferences({tabBlocks: [before]});
  assert.deepStrictEqual(JSON.parse(JSON.stringify(saved)), [{slug: 'same', index: 1}]);
  const after = tabBlockMock(['same', 'same', 'other'], 0);
  C.restoreActiveTabs({tabBlocks: [after]}, saved);
  assert.strictEqual(after._active, 1);
});

test('restoreActiveTabs matches blocks by position and tolerates count changes', () => {
  const first = tabBlockMock(['a', 'b'], 0);
  const second = tabBlockMock(['c', 'd'], 0);
  /* saved list came from a render with three blocks; block 2 keeps its tab,
     block 1's old slug now only exists in block 2 and must not cross over */
  C.restoreActiveTabs({tabBlocks: [first, second]},
    [{slug: 'd', index: 1}, {slug: 'd', index: 1}, {slug: 'gone', index: 0}]);
  assert.strictEqual(first._active, 0);
  assert.strictEqual(second._active, 1);
  C.restoreActiveTabs({tabBlocks: [first, second]}, null);
  assert.strictEqual(first._active, 0);
});


/* ---------------- layout math ---------------- */

const LAY_SPEC = {
  nodes: {a: {}, b: {}, c: {}, d: {}, e: {}, f: {}, g: {}},
  rows: [['a', 'b', 'c'], ['d', ['e', 'f'], 'g']],
  edges: [{from: 'c', to: 'd'}, {from: 'a', to: 'b'}]
};

test('serpentine: odd rows reverse x order', () => {
  const L = C.layout(LAY_SPEC);
  // row 0 left->right
  assert.ok(L.pos.a.cx < L.pos.b.cx && L.pos.b.cx < L.pos.c.cx);
  // row 1 right->left: first slot (d) has the LARGEST x
  assert.ok(L.pos.d.cx > L.pos.e.cx && L.pos.e.cx > L.pos.g.cx);
});

test('stack members share a column and distribute vertically', () => {
  const L = C.layout(LAY_SPEC);
  assert.strictEqual(L.pos.e.cx, L.pos.f.cx);
  assert.ok(L.pos.f.cy > L.pos.e.cy);
  assert.ok(L.pos.e.stack && L.pos.f.stack);
});

test('wrap edge detected between last slot of row N and first of row N+1', () => {
  const L = C.layout(LAY_SPEC);
  assert.strictEqual(C.isWrap({from: 'c', to: 'd'}, L), true);
  assert.strictEqual(C.isWrap({from: 'a', to: 'b'}, L), false);
});

test('vertical interconnect between stack members is a straight vertical path', () => {
  const L = C.layout(LAY_SPEC);
  const p = C.edgePath({from: 'e', to: 'f'}, L);
  const m = p.match(/^M (\S+) (\S+) L (\S+) (\S+)$/);
  assert.ok(m, 'expected a straight line path, got: ' + p);
  assert.strictEqual(m[1], m[3]); // same x
});

test('group bounding box covers member nodes with padding', () => {
  const spec = {nodes: {a: {group: 'dev'}, b: {group: 'dev'}, c: {}},
                rows: [[['a', 'b'], 'c']], groups: {dev: {title: 'Device'}}};
  const L = C.layout(spec);
  const g = L.groups.dev;
  assert.ok(g, 'group box missing');
  assert.ok(g.x < L.pos.a.cx - L.pos.a.w / 2);
  assert.ok(g.y < L.pos.a.cy - L.pos.a.h / 2);
  assert.ok(g.x + g.w > L.pos.b.cx + L.pos.b.w / 2);
  assert.ok(g.y + g.h > L.pos.b.cy + L.pos.b.h / 2);
});

/* ---------------- panel-state folding ---------------- */

test('foldPanelStates: sparse patches fold to complete per-step state', () => {
  const d = {
    panels: [{id: 'hw', type: 'state', initial: {state: 'OFF', extra: 1}}],
    steps: [
      {text: 's1'},
      {text: 's2', panels: {hw: {state: 'BOOT'}}},
      {text: 's3'},
      {text: 's4', panels: {hw: {state: 'RUN'}}}
    ]
  };
  const f = C.foldPanelStates(d).hw;
  assert.strictEqual(f.length, 4);
  assert.strictEqual(f[0].state, 'OFF');
  assert.strictEqual(f[1].state, 'BOOT');
  assert.strictEqual(f[2].state, 'BOOT'); // carried, not reset
  assert.strictEqual(f[3].state, 'RUN');
  assert.strictEqual(f[2].extra, 1); // initial keys carried
});

test('foldPanelStates: log patches append cumulatively', () => {
  const d = {
    panels: [{id: 'log', type: 'log'}],
    steps: [
      {text: 's1', panels: {log: {log: [{tag: 'NET', text: 'one'}]}}},
      {text: 's2'},
      {text: 's3', panels: {log: {log: [{tag: 'DEV', text: 'two'}]}}}
    ]
  };
  const f = C.foldPanelStates(d).log;
  assert.strictEqual(f[0].log.length, 1);
  assert.strictEqual(f[1].log.length, 1); // unchanged step keeps the history
  assert.strictEqual(f[2].log.length, 2);
  assert.strictEqual(f[2].log[1].text, 'two');
});

test('foldPanelStates: enterOnce applies only at its own step', () => {
  const d = {
    panels: [{id: 'cam', type: 'screen', initial: {mode: 'off'}}],
    steps: [
      {text: 's1', panels: {cam: {mode: 'live', enterOnce: {banner: 'FLASH'}}}},
      {text: 's2'}
    ]
  };
  const f = C.foldPanelStates(d).cam;
  assert.strictEqual(f[0].banner, 'FLASH');
  assert.strictEqual(f[1].banner, undefined);
  assert.strictEqual(f[1].mode, 'live'); // regular keys carry
});

test('inflight fold: full start/end/mark history yields jump-stable overlapping bars', () => {
  const d = {
    panels: [{id: 'ops', type: 'inflight', lanes: [
      {id: 'a', label: 'plan upload'}, {id: 'b', label: 'device ack'},
    ]}],
    steps: [
      {panels: {ops: {start: [{lane: 'a', label: 'seq 4182'}]}}},
      {panels: {ops: {start: [{lane: 'b', label: 'ack wait'}]}}},
      {panels: {ops: {end: ['b'], mark: [{lane: 'a', state: 'retry'}]}}},
      {panels: {ops: {end: ['a']}}},
      {panels: {ops: {start: [{lane: 'b', label: 'push receipt'}]}}},
    ],
  };
  const f = C.foldPanelStates(d).ops;
  assert.strictEqual(f.length, 5);
  assert.strictEqual(f[1].bars.length, 2, 'both lanes are open together at step 1');
  assert.strictEqual(f[1].bars[0].end, null);
  assert.strictEqual(f[1].bars[0].state, 'ok', 'later marks do not mutate an earlier snapshot');
  assert.strictEqual(f[2].bars[0].state, 'retry');
  assert.strictEqual(f[2].bars[1].end, 2);
  assert.strictEqual(f[3].bars[0].end, 3);
  assert.strictEqual(f[4].bars[2].end, null, 'last-step bar remains open-ended');

  const m = C.inflightModel(d.panels[0], f[1], f.length, 1);
  assert.strictEqual(m.lanes.map(l => l.bars.length).join(','), '1,1');
  const h = C.inflightPanelHTML(d.panels[0], f[4], f.length, 4);
  assert.ok(h.includes('iftick cur') && h.includes('>4</span>'), h);
  assert.ok(h.includes('ifbar s-retry') && h.includes('ifbar s-ok open'), h);
  assert.ok(h.includes('push receipt'), h);
});

test('inflight fold: restarting an open lane closes the old bar at the restart step', () => {
  const panel = {id: 'ops', type: 'inflight', lanes: [{id: 'a', label: 'A'}]};
  const states = C.foldInflightStates(panel, [
    {panels: {ops: {start: [{lane: 'a', label: 'first'}]}}},
    {panels: {ops: {start: [{lane: 'a', label: 'second'}]}}},
  ]);
  assert.strictEqual(states[1].bars.length, 2);
  assert.strictEqual(states[1].bars[0].end, 1);
  assert.strictEqual(states[1].bars[1].end, null);
});

test('inflight validator: declaration limits, unknown lanes, restarts, empty ends, and states warn', () => {
  const tooMany = Array.from({length: 9}, (_, i) => ({id: 'l' + i, label: 'L' + i}));
  const page = C.normalize({nodes: {a: {}}, rows: [['a']],
    panels: [{id: 'ops', type: 'inflight', lanes: tooMany}],
    steps: [
      {nodes: ['a'], panels: {ops: {start: [{lane: 'l0', label: 'one'}]}}},
      {nodes: ['a'], panels: {ops: {start: [{lane: 'l0', label: 'two'}]}}},
      {nodes: ['a'], panels: {ops: {end: ['l1', 'ghost'], mark: [{lane: 'l0', state: 'stuck'}]}}},
    ]});
  const w = C.validate(page).warnings;
  assert.ok(w.some(x => x.includes('.lanes: more than 8 lanes')), w.join('; '));
  assert.ok(w.some(x => x.includes('already open') && x.includes('restarts')), w.join('; '));
  assert.ok(w.some(x => x.includes('.end[0]') && x.includes('no open bar')), w.join('; '));
  assert.ok(w.some(x => x.includes('.end[1]') && x.includes('unknown inflight lane')), w.join('; '));
  assert.ok(w.some(x => x.includes('.mark[0].state') && x.includes('ok retry failed')), w.join('; '));
  assert.ok(!w.some(x => x.includes('unknown panel type')), w.join('; '));
});

test('phone fold accumulates object and array pushes newest-first, then clears', () => {
  const panel = {id: 'resident', type: 'phone', initial: {clock: '9:41'}};
  const steps = [
    {panels: {resident: {notify: {app: 'Homestead', title: 'First'}}}},
    {panels: {resident: {notify: [
      {app: 'Homestead', title: 'Second'},
      {app: 'Porchlight', text: 'Third'},
      {app: 'Hearthline', title: 'Fourth'},
    ]}}},
    {nodes: ['unused']},
    {panels: {resident: {clear: true}}},
    {panels: {resident: {notify: {app: 'Homestead', title: 'After clear'}}}},
  ];
  const f = C.foldPhoneStates(panel, steps);
  assert.strictEqual(f[0].clock, '9:41');
  assert.deepStrictEqual(Array.from(f[1].notifications, n => n.title || n.text),
    ['Second', 'Third', 'Fourth', 'First']);
  assert.strictEqual(f[1]._phoneAdded, 3);
  assert.strictEqual(f[2]._phoneAdded, 0, 'one-shot entry metadata is not carried');
  assert.strictEqual(f[2].notifications.length, 4, 'unchanged step keeps the folded stack');
  assert.strictEqual(f[3].notifications.length, 0);
  assert.deepStrictEqual(Array.from(f[4].notifications, n => n.title), ['After clear'],
    'a later notification starts a new stack after clear');

  const viaAllPanels = C.foldPanelStates({panels: [panel], steps}).resident;
  assert.strictEqual(viaAllPanels[1].notifications.length, 4);
  assert.strictEqual(viaAllPanels[3].notifications.length, 0);
  assert.strictEqual(viaAllPanels[4].notifications.length, 1);

  const directModel = C.phoneModel(panel, steps, 1);
  assert.strictEqual(directModel.count, 4);
  assert.strictEqual(directModel.overflow, 1);
  assert.strictEqual(directModel.badge, 4);

  const oneObject = C.foldPhoneStates(panel, [
    {panels: {resident: {notify: {app: 'Homestead', title: 'Same'}}}},
  ]);
  const oneElementArray = C.foldPhoneStates(panel, [
    {panels: {resident: {notify: [{app: 'Homestead', title: 'Same'}]}}},
  ]);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(oneObject)),
    JSON.parse(JSON.stringify(oneElementArray)),
    'single-object notify folds exactly like a one-element array');
});

test('phone model caps visible cards and computes overflow and unread badge', () => {
  const m = C.phoneModel({clock: '07:05', notifications: [
    {app: 'A', title: 'one'}, {app: 'B', title: 'two'},
    {app: 'C', title: 'three'}, {app: 'D', title: 'four'},
  ]});
  assert.strictEqual(m.clock, '07:05');
  assert.strictEqual(m.notifications.length, 4);
  assert.strictEqual(m.cards.length, 3);
  assert.strictEqual(m.overflow, 1);
  assert.strictEqual(m.badge, 4);
});

test('phone markup escapes all authored notification text and renders empty/static affordances', () => {
  const h = C.phonePanelHTML({title: 'Resident phone'}, {clock: '<9&41>', notifications: [
    {app: '<App & Co>', title: 'Door "open"', text: '<script>alert(1)</script>'},
    {app: 'Two'}, {app: 'Three'}, {app: 'Four'},
  ]}, true);
  assert.ok(h.includes('&lt;9&amp;41&gt;'), h);
  assert.ok(h.includes('&lt;App &amp; Co&gt;'), h);
  assert.ok(h.includes('Door &quot;open&quot;'), h);
  assert.ok(h.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), h);
  assert.ok(!h.includes('<script>'), h);
  assert.strictEqual((h.match(/class="phonecard(?: fresh)?"/g) || []).length, 3, h);
  assert.ok(h.includes('class="phonecard fresh"'), h);
  assert.ok(h.includes('class="phonebadge"') && h.includes('>4</span>'), h);
  assert.ok(h.includes('+1 more'), h);

  const empty = C.phonePanelHTML({}, {notifications: []});
  assert.ok(empty.includes('phoneframe') && empty.includes('no notifications'), empty);
  assert.ok(!empty.includes('phonebadge'), empty);
  assert.ok(empty.includes('<span class="phoneclock"></span>'), empty);
});

test('phone newest-card entry uses a steady baseline and skips the unchanged rebuild', () => {
  let writes = 0;
  const host = {
    _html: '', style: {},
    querySelector(){ return null; },
    querySelectorAll(){ return []; },
  };
  Object.defineProperty(host, 'innerHTML', {
    get(){ return host._html; },
    set(v){ writes++; host._html = v; },
  });
  const panel = {id: 'resident', type: 'phone'};
  const empty = {clock: '9:41', notifications: [], _phoneAdded: 0};
  const pushed = {clock: '9:41', notifications: [{app: 'Homestead', title: 'Motion'}], _phoneAdded: 1};
  const steady = {clock: '9:41', notifications: [{app: 'Homestead', title: 'Motion'}], _phoneAdded: 0};

  C.renderPanelBody(host, panel, empty, 'aurora', [empty, pushed, steady], 0, false);
  C.renderPanelBody(host, panel, pushed, 'aurora', [empty, pushed, steady], 1, true);
  assert.ok(host._html.includes('phonecard fresh'), host._html);
  assert.ok(!host._lastHTML.includes('phonecard fresh'), host._lastHTML);
  assert.strictEqual(writes, 2);
  C.renderPanelBody(host, panel, steady, 'aurora', [empty, pushed, steady], 2, true);
  assert.strictEqual(writes, 2, 'steady markup matches the baseline and skips rebuilding');

  const jumpHost = {...host, _lastHTML: null, _html: ''};
  Object.defineProperty(jumpHost, 'innerHTML', {
    get(){ return jumpHost._html; },
    set(v){ jumpHost._html = v; },
  });
  C.renderPanelBody(jumpHost, panel, pushed, 'aurora', [empty, pushed, steady], 1, false);
  assert.ok(!jumpHost._html.includes('phonecard fresh'), jumpHost._html);

  let backwardWrites = 0;
  const backwardHost = {
    _html: '', style: {},
    querySelector(){ return null; },
    querySelectorAll(){ return []; },
  };
  Object.defineProperty(backwardHost, 'innerHTML', {
    get(){ return backwardHost._html; },
    set(v){ backwardWrites++; backwardHost._html = v; },
  });
  C.renderPanelBody(backwardHost, panel, steady, 'aurora', [empty, pushed, steady], 2, false);
  const backwardBaseline = backwardHost._html;
  C.renderPanelBody(backwardHost, panel, pushed, 'aurora', [empty, pushed, steady], 1, true);
  assert.strictEqual(backwardWrites, 1,
    'backward adjacency onto the notify step matches steady markup and skips rebuilding');
  assert.strictEqual(backwardHost._html, backwardBaseline);
  assert.ok(!backwardHost._html.includes('phonecard fresh'), backwardHost._html);

  let settledWrites = 0;
  const settledHost = {
    _html: '', style: {},
    querySelector(){ return null; },
    querySelectorAll(selector){
      if (selector !== '.fresh' || !settledHost._html.includes(' fresh')) return [];
      return [{classList: {remove(name){
        if (name === 'fresh') settledHost._html = settledHost._html.replace(' fresh', '');
      }}}];
    },
  };
  Object.defineProperty(settledHost, 'innerHTML', {
    get(){ return settledHost._html; },
    set(v){ settledWrites++; settledHost._html = v; },
  });
  C.renderPanelBody(settledHost, panel, empty, 'aurora', [empty, pushed, steady], 0, false);
  C.renderPanelBody(settledHost, panel, pushed, 'aurora', [empty, pushed, steady], 1, true);
  assert.ok(settledHost._html.includes('phonecard fresh'), settledHost._html);
  C.renderPanelBody(settledHost, panel, pushed, 'aurora', [empty, pushed, steady], 1, false);
  assert.strictEqual(settledWrites, 2,
    'the non-animated GIF/export settle pass reuses the stored steady baseline');
  assert.ok(!settledHost._html.includes('phonecard fresh'), settledHost._html);
});

test('phone validator warns on bad fields and notification shapes without errors', () => {
  const page = C.normalize({nodes: {a: {}}, rows: [['a']],
    panels: [{id: 'resident', type: 'phone', initial: {
      clock: 941, clear: false, notify: 'bad', count: 4,
    }}],
    steps: [{nodes: ['a'], panels: {resident: {
      clock: true, clear: 'yes', mystery: 1, notify: [
        null, {}, {app: 42}, {app: 'Homestead', title: 7, extra: true},
      ],
    }}}],
  });
  const result = C.validate(page);
  const w = result.warnings;
  assert.strictEqual(result.errors.length, 0, result.errors.join('; '));
  assert.ok(w.some(x => x.includes('.initial.clock') && x.includes('must be a string')), w.join('; '));
  assert.ok(w.some(x => x.includes('.initial.clear') && x.includes('must be true')), w.join('; '));
  assert.ok(w.some(x => x.includes('.initial.notify') && x.includes('notification ignored')), w.join('; '));
  assert.ok(w.some(x => x.includes('.notify[0]') && x.includes('expected')), w.join('; '));
  assert.ok(w.some(x => x.includes('.notify[1].app') && x.includes('required')), w.join('; '));
  assert.ok(w.some(x => x.includes('.notify[3].title') && x.includes('must be a string')), w.join('; '));
  assert.ok(w.some(x => x.includes('.mystery') && x.includes('not a phone field')), w.join('; '));
  assert.ok(w.some(x => x.includes('.extra') && x.includes('not a notification field')), w.join('; '));
  assert.ok(!w.some(x => x.includes('unknown panel type')), w.join('; '));
});

test('phone styles cover base/overlay skins, reduced motion, and static print', () => {
  const css = fs.readFileSync(path.join(ROOT, 'src', 'style.core.css'), 'utf8');
  const uncommented = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = Array.from(uncommented.matchAll(/([^{}]+)\{([^{}]*)\}/g), match => {
    const declarations = Object.create(null);
    match[2].split(';').forEach(part => {
      const colon = part.indexOf(':');
      if (colon < 0) return;
      declarations[part.slice(0, colon).trim()] = part.slice(colon + 1).trim();
    });
    return {selectors: match[1].split(',').map(selector => selector.trim()), declarations};
  });
  function declarationsFor(selector){
    return rules.filter(rule => rule.selectors.includes(selector)).reduce(
      (all, rule) => Object.assign(all, rule.declarations), Object.create(null));
  }
  ['.sk-aurora .phoneframe', '.sk-daylight .phoneframe',
   'body.sk-editorial .sk-aurora .phoneframe', 'body.sk-editorial .sk-daylight .phoneframe',
   'body.sk-terminal .sk-aurora .phoneframe', 'body.sk-terminal .sk-daylight .phoneframe',
   'body.sk-pastel .sk-aurora .phoneframe', 'body.sk-pastel .sk-daylight .phoneframe',
   'body.sk-blueprint .sk-aurora .phoneframe', 'body.sk-blueprint .sk-daylight .phoneframe'].forEach(selector => {
    assert.ok(css.includes(selector), selector);
  });
  ['.sk-aurora .phonecard', '.sk-daylight .phonecard',
   'body.sk-editorial .sk-aurora .phonecard', 'body.sk-terminal .sk-aurora .phonecard',
   'body.sk-pastel .sk-aurora .phonecard', 'body.sk-blueprint .sk-aurora .phonecard'].forEach(selector => {
    const declarations = declarationsFor(selector);
    assert.ok(Object.hasOwn(declarations, 'color') && declarations.color,
      selector + ' must explicitly declare notification-card text color');
    assert.ok(Object.hasOwn(declarations, 'background') && declarations.background,
      selector + ' must explicitly declare notification-card background');
  });

  const frameWidth = Number.parseFloat(declarationsFor('.phoneframe').width);
  const panelPadding = declarationsFor('.pwidget').padding.split(/\s+/).map(Number.parseFloat);
  const horizontalPadding = panelPadding.length > 1 ? panelPadding[1] * 2 : panelPadding[0] * 2;
  const panelColumnWidths = rules.filter(rule =>
    rule.selectors.some(selector => selector.includes('.panelcol') || selector.includes('.boardgrid.haspanels')) &&
    rule.declarations['grid-template-columns']
  ).flatMap(rule => Array.from(rule.declarations['grid-template-columns'].matchAll(/(\d+(?:\.\d+)?)px/g),
    match => Number(match[1])));
  assert.ok(Number.isFinite(frameWidth) && Number.isFinite(horizontalPadding));
  assert.ok(panelColumnWidths.length > 0, 'panel column widths must be extractable from grid rules');
  const narrowestPanelColumn = Math.min(...panelColumnWidths);
  assert.ok(frameWidth + horizontalPadding <= narrowestPanelColumn,
    `phone frame plus panel padding (${frameWidth + horizontalPadding}px) must fit ${narrowestPanelColumn}px panel column`);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\{[\s\S]*?\.phonecard\.fresh\{animation:none !important;\}/);
  assert.match(css, /@media print\{[\s\S]*?\.pwidget\.pt-phone\{display:block !important;[\s\S]*?\.phonecard\.fresh\{animation:none !important;\}/);
});

/* ---------------- protocols / lanes ---------------- */

test('declared protocols extend built-ins and feed kindColor per skin', () => {
  const protos = C.resolveProtocols({protocols: {rtp: {label: 'RTP video', color: '#FFB454'}}});
  assert.strictEqual(protos.rtp.label, 'RTP video');
  assert.strictEqual(C.kindColor(protos, 'rtp', 'aurora'), '#FFB454');
  assert.strictEqual(C.kindColor(protos, 'https', 'daylight'), '#4956C9');
  assert.strictEqual(C.kindColor(protos, 'nope', 'aurora'),
                     C.kindColor(protos, 'int', 'aurora')); // unknown falls back to int
});

test('resolveLanes defaults label to the lane key and rejects bad colors', () => {
  const lanes = C.resolveLanes({lanes: {NET: {color: '#38E1FF'}, DEV: {color: 'red'}}});
  assert.strictEqual(lanes.NET.label, 'NET');
  assert.strictEqual(lanes.NET.color, '#38E1FF');
  assert.notStrictEqual(lanes.DEV.color, 'red'); // non-hex falls back
});

test('stock scenes exist for every documented name', () => {
  ['person-at-door-night', 'package-drop', 'static-noise'].forEach(n => {
    assert.ok(C.SCENES[n] && C.SCENES[n].includes('<svg'), n);
  });
});

/* ---------------- wave 2: layout auto-cleanup + deep links ---------------- */

test('spreadPositions separates crowded centers, keeps order and bounds', () => {
  const out = C.spreadPositions([400, 402, 398], 170, 85, 1095);
  const sorted = [...out].sort((a, b) => a - b);
  assert.ok(sorted[1] - sorted[0] >= 170 - 1e-9);
  assert.ok(sorted[2] - sorted[1] >= 170 - 1e-9);
  assert.ok(sorted[0] >= 85 && sorted[2] <= 1095);
  // input order 398 < 400 < 402 must map to increasing outputs
  assert.ok(out[2] < out[0] && out[0] < out[1]);
});

test('spreadPositions leaves already-separated positions alone', () => {
  const out = C.spreadPositions([200, 600, 1000], 170, 85, 1095);
  assert.strictEqual(out[0], 200);
  assert.strictEqual(out[1], 600);
  assert.strictEqual(out[2], 1000);
});

test('two floats in one gap no longer overlap; side:below sits under the last row', () => {
  const spec = {
    nodes: {a: {}, b: {}, f1: {}, f2: {}, g: {}},
    rows: [['a', 'b']],
    floats: [{id: 'f1'}, {id: 'f2'}, {id: 'g', side: 'below'}],
    edges: [{from: 'a', to: 'f1'}, {from: 'a', to: 'f2'}, {from: 'b', to: 'g'}]
  };
  const L = C.layout(spec);
  const gap = Math.abs(L.pos.f1.cx - L.pos.f2.cx);
  assert.ok(gap >= 150, 'floats anchored to the same node must spread: gap=' + gap);
  const rowBottom = L.rows[0].top + L.rows[0].height;
  assert.ok(L.pos.g.cy > rowBottom, 'below float renders under the row');
  assert.ok(L.H > L.pos.g.cy, 'board height covers the below float');
});

test('edgeAutoAdjust fans apart edges sharing a node side', () => {
  const spec = {
    nodes: {hub: {}, z: {}, x: {}, y: {}},
    rows: [['hub', 'z'], ['x', 'y']],
    edges: [{from: 'hub', to: 'x'}, {from: 'hub', to: 'y'}]
  };
  const L = C.layout(spec);
  const adj = C.edgeAutoAdjust(spec.edges, L);
  assert.notStrictEqual(adj[0].fromDx, adj[1].fromDx,
    'both edges leave hub bottom; their attach x must differ');
});

test('edgeAutoAdjust bows reverse pairs apart and respects an author bend', () => {
  const spec = {
    nodes: {a: {}, b: {}},
    rows: [['a', 'b']],
    edges: [{from: 'a', to: 'b'}, {from: 'b', to: 'a'}]
  };
  const L = C.layout(spec);
  const adj = C.edgeAutoAdjust(spec.edges, L);
  assert.ok(adj[0].bend * adj[1].bend < 0, 'opposite bends expected');
  const authored = [{from: 'a', to: 'b', bend: 30}, {from: 'b', to: 'a'}];
  const adj2 = C.edgeAutoAdjust(authored, L);
  assert.strictEqual(adj2[0].bend, 0, 'author bend wins: no auto bend added');
});

test('edgeAutoAdjust arcs same-row edges that skip over intermediate slots', () => {
  const spec = {
    nodes: {a: {}, b: {}, c: {}},
    rows: [['a', 'b', 'c']],
    edges: [{from: 'a', to: 'c'}]
  };
  const L = C.layout(spec);
  const adj = C.edgeAutoAdjust(spec.edges, L);
  assert.ok(adj[0].bend < 0, 'skip-over edge arcs above the row');
});

test('edge into a float lands at the center of its facing edge', () => {
  const spec = {nodes: {a: {}, f: {}}, rows: [['a']],
    floats: [{id: 'f', side: 'below'}], edges: [{from: 'a', to: 'f'}]};
  const L = C.layout(spec);
  const adj = C.edgeAutoAdjust(spec.edges, L);
  C.resolveEdgeAvoidance(spec.edges, L, adj);
  const pts = C.samplePathD(C.edgePath(spec.edges[0], L, adj[0]));
  const end = pts[pts.length - 1];
  assert.ok(Math.abs(end.x - L.pos.f.cx) < 0.001, 'lands at float center x, got ' + end.x);
  assert.ok(Math.abs(end.y - (L.pos.f.cy - L.pos.f.h/2)) < 0.001, 'lands on float top edge');
});

test('blocked center landing on a float falls back to the corner attach', () => {
  /* c sits directly between b (source, row 1) and the float above row 0 —
     the same-column layout the cumulus "frozen" float exercises */
  const spec = {
    nodes: {x: {}, c: {}, y: {}, x2: {}, b: {}, y2: {}, f: {}},
    rows: [['x', 'c', 'y'], ['x2', 'b', 'y2']],
    floats: [{id: 'f'}],
    edges: [{from: 'b', to: 'f'}]};
  const L = C.layout(spec);
  const adj = C.edgeAutoAdjust(spec.edges, L);
  C.resolveEdgeAvoidance(spec.edges, L, adj);
  const pts = C.samplePathD(C.edgePath(spec.edges[0], L, adj[0]));
  const end = pts[pts.length - 1];
  assert.ok(Math.abs(end.x - L.pos.f.cx) >= L.pos.f.w/2 - 0.001,
    'blocked edge attaches at the float corner, got x=' + end.x + ' vs cx=' + L.pos.f.cx);
  const cRect = {x: L.pos.c.cx - L.pos.c.w/2 - 3, y: L.pos.c.cy - L.pos.c.h/2 - 3,
                 w: L.pos.c.w + 6, h: L.pos.c.h + 6};
  assert.strictEqual(C.countPathRectHits(pts, [cRect]), 0, 'fallback path clears the blocking card');
});

test('float dx/dy nudge shifts a below float from its auto position', () => {
  const base = {nodes: {a: {}, b: {}, f: {}}, rows: [['a', 'b']],
    floats: [{id: 'f', side: 'below'}], edges: [{from: 'a', to: 'f'}]};
  const L0 = C.layout(base);
  const nudged = {nodes: {a: {}, b: {}, f: {}}, rows: [['a', 'b']],
    floats: [{id: 'f', side: 'below', dx: 40, dy: -120}], edges: [{from: 'a', to: 'f'}]};
  const L1 = C.layout(nudged);
  assert.ok(Math.abs((L1.pos.f.cx - L0.pos.f.cx) - 40) < 0.001, 'dx shifts cx right by 40');
  assert.ok(Math.abs((L1.pos.f.cy - L0.pos.f.cy) - (-120)) < 0.001, 'dy raises cy by 120');
});

test('edgePath applies fan offsets to same-row edge endpoints', () => {
  const spec = {nodes: {a: {}, b: {}}, rows: [['a', 'b']],
                edges: [{from: 'a', to: 'b'}]};
  const L = C.layout(spec);
  const plain = C.edgePath(spec.edges[0], L);
  const shifted = C.edgePath(spec.edges[0], L, {fromDx: 0, fromDy: 14, toDx: 0, toDy: 14, bend: 0});
  assert.notStrictEqual(plain, shifted);
  const wantY = L.pos.a.cy + 14;
  assert.ok(shifted.indexOf(' ' + wantY + ' ') > 0,
    'start y shifted by +14 from row center ' + L.pos.a.cy + ': ' + shifted);
});

test('resolveLabelCollisions separates overlapping labels and avoids obstacles', () => {
  const labels = [
    {x: 100, y: 100, w: 80, h: 13, fixed: false},
    {x: 110, y: 104, w: 80, h: 13, fixed: false}
  ];
  const obstacles = [{x: 60, y: 60, w: 30, h: 30}];
  const n = C.resolveLabelCollisions(labels, obstacles);
  const r0 = {x: labels[0].x + n[0].dx, y: labels[0].y + n[0].dy, w: 80, h: 13};
  const r1 = {x: labels[1].x + n[1].dx, y: labels[1].y + n[1].dy, w: 80, h: 13};
  assert.ok(!C.rectsOverlap(r0, r1), 'labels must not overlap after nudging');
});

test('resolveLabelCollisions leaves clean labels and fixed labels untouched', () => {
  const labels = [
    {x: 100, y: 100, w: 60, h: 13, fixed: false},
    {x: 400, y: 100, w: 60, h: 13, fixed: false},
    {x: 402, y: 104, w: 60, h: 13, fixed: true}
  ];
  const n = C.resolveLabelCollisions(labels, []);
  assert.deepStrictEqual([n[0].dx, n[0].dy], [0, 0]);
  assert.deepStrictEqual([n[2].dx, n[2].dy], [0, 0], 'fixed label never moves');
});

test('parseHash/buildHash round-trip every legacy shape and the composed canonical grammar', () => {
  const legacy = [
    [{}, ''],
    [{t: 'command-flow'}, '#t=command-flow'],
    [{m: 'step', s: '2'}, '#m=step&s=2'],
    [{t: 'ota-rollout', m: 'step', s: 'ota.3'}, '#t=ota-rollout&m=step&s=ota.3'],
    [{m: 'ambient'}, '#m=ambient'],
    [{t: '2', m: 'ambient'}, '#t=2&m=ambient'],
    [{s: 'await ack'}, '#s=await%20ack'],
    [{t: 'guided', s: '04'}, '#t=guided&s=04']
  ];
  legacy.forEach(([state, hash]) => {
    assert.strictEqual(C.buildHash(state), hash);
    const parsed = C.parseHash(hash);
    ['t', 'm', 's'].forEach(k => assert.strictEqual(parsed[k], state[k] == null ? null : state[k], hash));
  });
  const canonical = {b: '2', t: 'failure modes', d: 'delivery-flow', c: 'wire-contract',
    m: 'step', s: 'ack/ok', r: '3', x: 'background,4', e: 'appendix,2'};
  const hash = C.buildHash(canonical);
  assert.strictEqual(hash, '#b=2&t=failure%20modes&d=delivery-flow&m=step&s=ack%2Fok&c=wire-contract&r=3&x=background,4&e=appendix,2');
  const parsed = C.parseHash(hash);
  Object.keys(canonical).forEach(k => assert.strictEqual(parsed[k], canonical[k]));
  assert.strictEqual(C.parseHash('#m=bogus').m, null);
  assert.strictEqual(C.parseHash('#s=%E0%A4%A').s, null, 'malformed encoded pairs are ignored');
  assert.strictEqual(C.slugify('Your Data’s Journey'), 'your-data-s-journey');
  assert.strictEqual(C.slugify('!!!'), 'tab');
});

test('section prose markup adds an accessible toggle only for text or bullets', () => {
  const expanded = C.sectionIntroHTML({heading:'Context', text:['One'], bullets:['Two']}, 0, 'context');
  assert.strictEqual(expanded.hasProse, true);
  assert.ok(expanded.html.includes('type="button" class="prosetoggle"'), expanded.html);
  assert.ok(expanded.html.includes('aria-controls="section-context-prose"'), expanded.html);
  assert.ok(expanded.html.includes('aria-expanded="true"'), expanded.html);
  assert.ok(expanded.html.includes('<div class="sec-prose" id="section-context-prose">'), expanded.html);

  const authored = C.sectionIntroHTML({heading:'Boilerplate', text:'Terms', collapsed:true}, 1, 'boilerplate');
  assert.strictEqual(authored.defaultCollapsed, true);
  assert.ok(authored.html.includes('aria-expanded="false"'), authored.html);
  assert.ok(authored.html.includes('id="section-boilerplate-prose" hidden'), authored.html);

  const noProse = C.sectionIntroHTML({heading:'Diagram only', diagram:{}}, 2, 'diagram-only');
  assert.strictEqual(noProse.hasProse, false);
  assert.ok(!noProse.html.includes('prosetoggle'), noProse.html);
  assert.ok(!noProse.html.includes('sec-prose'), noProse.html);
});

test('section collapsed authoring values warn only when non-boolean', () => {
  const page = C.normalize({sections:[
    {heading:'Bad', text:'One', collapsed:'yes'},
    {heading:'Collapsed', text:'Two', collapsed:true},
    {heading:'Expanded', bullets:['Three'], collapsed:false},
    {heading:'Default', text:'Four'}
  ]});
  const result = C.validate(page);
  const warnings = result.warnings.filter(w => w.includes('.collapsed'));
  assert.strictEqual(result.errors.length, 0, result.errors.join('; '));
  assert.strictEqual(warnings.length, 1, warnings.join('; '));
  assert.ok(warnings[0].includes('sections[0].collapsed') && warnings[0].includes('boolean'));
});

test('prose collapse controls have print expansion and explicit six-skin styling', () => {
  const css = fs.readFileSync(path.join(ROOT, 'src', 'style.core.css'), 'utf8');
  ['.sk-aurora .prosetoggle', '.sk-daylight .prosetoggle',
   'body.sk-editorial .prosetoggle', 'body.sk-terminal .prosetoggle',
   'body.sk-pastel .prosetoggle', 'body.sk-blueprint .prosetoggle'].forEach(selector => {
    assert.ok(css.includes(selector), selector);
  });
  assert.match(css, /@media print\{[\s\S]*?\.sec-prose\[hidden\]\{display:block !important;\}/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\{[\s\S]*?\.prosechev\{transition:none !important;\}/);
});

function deepLinkHarness(activeTarget){
  const pageBase = 'https://pages.example.test/page.html?mode=view';
  const historyWrites = [], historyCalls = [], posts = [], copied = [], windowListeners = {};
  const button = {
    innerHTML: '', parentNode: null, listeners: {},
    classList: {add(){}, remove(){}},
    addEventListener(type, fn){ this.listeners[type] = fn; }
  };
  const location = {
    href: pageBase,
    hash: '',
    pathname: '/page.html',
    search: '?mode=view',
    origin: 'https://pages.example.test'
  };
  const win = {
    location,
    history: {replaceState(state, title, value){
      historyCalls.push([state, title, value]);
      historyWrites.push(value);
      if (value.charAt(0) === '#'){
        location.hash = value;
        location.href = pageBase + value;
      } else {
        location.hash = '';
        location.href = location.origin + value;
      }
    }},
    parent: {postMessage(message, targetOrigin){ posts.push({message, targetOrigin}); }},
    document: {activeElement:null},
    navigator: {clipboard: {writeText(value){ copied.push(value); return Promise.resolve(); }}},
    setTimeout(){ return 1; },
    clearTimeout(){},
    addEventListener(type, fn){ windowListeners[type] = fn; }
  };
  const tabBlock = {
    index:1, count:1, slugs:['overview'], copyButtons:[button], buttons:[],
    active(){ return 0; },
    select(){}
  };
  const ctl = {
    view:{querySelectorAll(){ return []; }},
    sections:[], steppers:[], tabBlocks:[tabBlock],
    manifest:{
      tabBlocks:[{index:1, count:1, slugs:['overview']}],
      sections:[]
    },
    activeTarget:activeTarget || {kind:'tab', tabBlock:1, tab:0}
  };
  const channel = C.wireDeepLinks(ctl, win);
  return {button, channel, copied, ctl, historyCalls, historyWrites, posts, win, windowListeners};
}

function fakeProseControl(defaultCollapsed, onChange, events){
  const attributes = {}, listeners = {};
  const toggle = {
    attributes, listeners,
    setAttribute(name, value){ attributes[name] = String(value); },
    addEventListener(type, fn){ listeners[type] = fn; }
  };
  let hidden = false;
  const prose = {scrollHeight:80};
  Object.defineProperty(prose, 'hidden', {
    get(){ return hidden; },
    set(value){ hidden = !!value; if (events) events.push('hidden:' + hidden); }
  });
  const control = C.createProseController(
    prose, toggle, defaultCollapsed, onChange, {matchMedia(){ return {matches:true}; }}, 'Test section');
  return {control, prose, toggle};
}

test('prose toggle clicks serialize only deviations and copy links keep the collapse view', async () => {
  const h = deepLinkHarness({kind:'page'});
  const expanded = fakeProseControl(false, () => h.ctl.onChange());
  const authoredCollapsed = fakeProseControl(true, () => h.ctl.onChange());
  h.ctl.sections.push(
    {number:1, reference:'background', prose:expanded.control, stepper:null,
     contractCard:null, contractRows:[]},
    {number:2, reference:'boilerplate', prose:authoredCollapsed.control, stepper:null,
     contractCard:null, contractRows:[]}
  );
  h.ctl.manifest.sections.push(
    {number:1, reference:'background', stepIds:null, hasCard:false, rowCount:0},
    {number:2, reference:'boilerplate', stepIds:null, hasCard:false, rowCount:0}
  );

  expanded.toggle.listeners.click();
  assert.strictEqual(expanded.toggle.attributes['aria-expanded'], 'false');
  assert.strictEqual(h.historyWrites.at(-1), '#x=background',
    'the untouched authored-collapsed section is absent');
  h.button.listeners.click();
  await Promise.resolve();
  assert.strictEqual(h.copied.at(-1),
    'https://pages.example.test/page.html?mode=view#t=overview&x=background');

  h.channel.receiveLinkBaseMessage({
    data:{type:'dv_linkbase', base:'https://host.example.test/#p=page.html'},
    origin:'https://host.example.test', source:h.win.parent
  });
  authoredCollapsed.toggle.listeners.click();
  assert.strictEqual(authoredCollapsed.toggle.attributes['aria-expanded'], 'true');
  assert.strictEqual(h.historyWrites.at(-1), '#x=background&e=boilerplate',
    'expanding an authored collapsed section uses e, never x');
  assert.strictEqual(h.posts.at(-1).message.fragment, 'x=background&e=boilerplate',
    'the existing host fragment channel receives collapse deviations');
});

test('contradictory x and e on the same section: e wins for both authored defaults', () => {
  for (const authoredCollapsed of [false, true]) {
    const h = deepLinkHarness({kind:'page'});
    const events = [];
    const prose = fakeProseControl(authoredCollapsed, () => h.ctl.onChange(), events);
    h.ctl.sections.push(
      {number:1, reference:'background', prose:prose.control, stepper:null,
       sectionEl:{}, contractCard:null, contractRows:[]});
    h.ctl.manifest.sections.push(
      {number:1, reference:'background', tabBlock:null, tab:null,
       stepIds:null, hasCard:false, rowCount:0});
    h.win.location.hash = '#x=background&e=background';
    h.win.location.href += h.win.location.hash;
    h.windowListeners.hashchange();
    assert.strictEqual(prose.prose.hidden, false,
      'e beats x on the same ref (authored collapsed=' + authoredCollapsed + ')');
  }
});

test('deep-link restore applies numeric collapse refs before scrolling and rewrites canonical refs', () => {
  const h = deepLinkHarness({kind:'page'});
  const events = [];
  const prose = fakeProseControl(false, () => h.ctl.onChange(), events);
  const appendix = fakeProseControl(true, () => h.ctl.onChange(), events);
  events.length = 0;
  const scrollTarget = {scrollIntoView(){
    events.push('scroll:hidden=' + prose.prose.hidden + ',appendix=' + appendix.prose.hidden);
  }};
  const stepper = {
    copyButton:null, scrollTargetEl:scrollTarget, sectionEl:scrollTarget,
    ids(){ return ['first']; }, mode(){ return 'ambient'; },
    enterAmbient(){ events.push('ambient'); }
  };
  h.ctl.sections.push(
    {number:1, reference:'delivery-flow', prose:prose.control, stepper,
     sectionEl:scrollTarget, contractCard:null, contractRows:[]},
    {number:2, reference:'appendix', prose:appendix.control, stepper:null,
     sectionEl:{}, contractCard:null, contractRows:[]}
  );
  h.ctl.steppers.push(h.ctl.sections[0]);
  h.ctl.manifest.sections.push(
    {number:1, reference:'delivery-flow', tabBlock:null, tab:null,
     stepIds:['first'], hasCard:false, rowCount:0},
    {number:2, reference:'appendix', tabBlock:null, tab:null,
     stepIds:null, hasCard:false, rowCount:0}
  );
  h.win.location.hash = '#d=delivery-flow&m=ambient&x=1&e=2';
  h.win.location.href += h.win.location.hash;

  h.windowListeners.hashchange();

  assert.strictEqual(prose.prose.hidden, true);
  assert.strictEqual(appendix.prose.hidden, false);
  assert.ok(events.lastIndexOf('hidden:true') <
    events.indexOf('scroll:hidden=true,appendix=false'), events.join(', '));
  assert.strictEqual(h.historyWrites.at(-1),
    '#d=delivery-flow&m=ambient&x=delivery-flow&e=appendix');

  h.win.location.hash = '#d=delivery-flow&m=ambient&x=missing';
  h.windowListeners.hashchange();
  assert.strictEqual(prose.prose.hidden, false, 'bad collapse refs silently fall back to authored state');
  assert.strictEqual(appendix.prose.hidden, true);
  assert.strictEqual(h.historyWrites.at(-1), '#d=delivery-flow&m=ambient');
});

test('host link-base composition joins fragments with # or & and leaves an empty fragment off', () => {
  assert.strictEqual(
    C.composeLinkURL('https://example.test/view', '#d=motion&s=3'),
    'https://example.test/view#d=motion&s=3');
  assert.strictEqual(
    C.composeLinkURL('https://example.test/#p=page.html', '#d=motion&s=3'),
    'https://example.test/#p=page.html&d=motion&s=3');
  assert.strictEqual(
    C.composeLinkURL('https://example.test/#p=page.html&', '#d=motion&s=3'),
    'https://example.test/#p=page.html&d=motion&s=3');
  assert.strictEqual(
    C.composeLinkURL('https://example.test/#', '#d=motion&s=3'),
    'https://example.test/#d=motion&s=3');
  assert.strictEqual(C.composeLinkURL('https://example.test/view', ''),
    'https://example.test/view');
  assert.strictEqual(C.composeLinkURL('https://example.test/#p=page.html', ''),
    'https://example.test/#p=page.html');
  assert.strictEqual(C.composeLinkURL('https://example.test/#p=page.html&', ''),
    'https://example.test/#p=page.html&');
  assert.strictEqual(C.composeLinkURL('https://example.test/#', ''),
    'https://example.test/#');
});

test('invalid link bases are ignored by both inbound paths', () => {
  const h = deepLinkHarness();
  ['javascript:alert(1)', 'data:text/html,hello', 'relative/page.html',
   '"https://example.test/"', 'https://example.test/a b',
   ' https://example.test/path', 'https://example.test/path\n', 42].forEach(base => {
    assert.strictEqual(C.isValidLinkBase(base), false);
    assert.strictEqual(h.win.dvSetLinkBase(base), false);
    assert.strictEqual(h.channel.receiveLinkBaseMessage({
      data:{type:'dv_linkbase', base},
      origin:'https://host.example.test', source:h.win.parent
    }), false);
  });
  h.ctl.onChange();
  assert.strictEqual(h.posts.length, 0, 'an invalid base must not enable mirroring');
});

test('copy buttons use the normalized shell URL after a valid dv_linkbase message', () => {
  const h = deepLinkHarness();
  assert.strictEqual(h.channel.receiveLinkBaseMessage({
    data:{type:'dv_linkbase', base:'HTTPS://EXAMPLE.TEST:443/a/../#p=page.html'},
    origin:'https://example.test', source:h.win.parent
  }), true);
  h.button.listeners.click();
  assert.strictEqual(h.copied[0], 'https://example.test/#p=page.html&t=overview');
});

test('fragment writes never post to an embedder before the link-base handshake', () => {
  const h = deepLinkHarness();
  assert.strictEqual(h.posts.length, 0, 'the initial fragment write stays private');
  h.ctl.onChange();
  assert.strictEqual(h.posts.length, 0, 'later navigation also stays private');
});

test('fragment writes mirror after the handshake only to its message origin', () => {
  const h = deepLinkHarness();
  h.channel.receiveLinkBaseMessage({
    data:{type:'dv_linkbase', base:'https://example.test/#p=page.html'},
    origin:'https://example.test', source:h.win.parent
  });
  h.ctl.onChange();
  const write = h.historyWrites.at(-1);
  assert.strictEqual(write, '#t=overview');
  assert.strictEqual(h.posts.at(-1).message.type, 'dv_fragment');
  assert.strictEqual(h.posts.at(-1).message.fragment, write.slice(1));
  assert.strictEqual(h.posts.at(-1).targetOrigin, 'https://example.test');
});

test('the first parent registration pins source and origin for copies and mirroring', () => {
  const h = deepLinkHarness();
  const pinnedParent = h.win.parent;
  const replacementPosts = [];
  const replacementParent = {
    postMessage(message, targetOrigin){ replacementPosts.push({message, targetOrigin}); }
  };
  assert.strictEqual(h.channel.receiveLinkBaseMessage({
    data:{type:'dv_linkbase', base:'https://pinned.example/#p=first'},
    origin:'https://pinned.example', source:pinnedParent
  }), true);
  assert.strictEqual(h.channel.receiveLinkBaseMessage({
    data:{type:'dv_linkbase', base:'https://evil.example/#p=origin'},
    origin:'https://evil.example', source:pinnedParent
  }), false, 'the pinned parent cannot switch origins');
  assert.strictEqual(h.channel.receiveLinkBaseMessage({
    data:{type:'dv_linkbase', base:'https://evil.example/#p=source'},
    origin:'https://pinned.example', source:replacementParent
  }), false, 'a non-parent source cannot register');
  h.win.parent = replacementParent;
  h.ctl.onChange();
  h.button.listeners.click();
  assert.strictEqual(h.copied[0], 'https://pinned.example/#p=first&t=overview');
  assert.strictEqual(h.posts.at(-1).targetOrigin, 'https://pinned.example');
  assert.strictEqual(h.posts.at(-1).message.fragment, 't=overview');
  assert.strictEqual(replacementPosts.length, 0, 'mirroring uses the pinned WindowProxy');
});

test('the pinned parent and origin may update their canonical link base', () => {
  const h = deepLinkHarness();
  const event = {origin:'https://host.example', source:h.win.parent};
  assert.strictEqual(h.channel.receiveLinkBaseMessage({
    ...event, data:{type:'dv_linkbase', base:'https://host.example/#p=first'}
  }), true);
  assert.strictEqual(h.channel.receiveLinkBaseMessage({
    ...event, data:{type:'dv_linkbase', base:'https://host.example/a/../#p=second'}
  }), true);
  h.button.listeners.click();
  assert.strictEqual(h.copied[0], 'https://host.example/#p=second&t=overview');
});

test('the same-origin setter takes precedence and locks out later messages', () => {
  const h = deepLinkHarness();
  assert.strictEqual(h.channel.receiveLinkBaseMessage({
    data:{type:'dv_linkbase', base:'https://host.example/#p=message'},
    origin:'https://host.example', source:h.win.parent
  }), true);
  assert.strictEqual(h.win.dvSetLinkBase('https://pages.example.test/#p=direct'), true);
  assert.strictEqual(h.channel.receiveLinkBaseMessage({
    data:{type:'dv_linkbase', base:'https://host.example/#p=later'},
    origin:'https://host.example', source:h.win.parent
  }), false);
  h.button.listeners.click();
  assert.strictEqual(h.copied[0], 'https://pages.example.test/#p=direct&t=overview');
});

test('dvSetLinkBase enables shell links and mirroring to the page own origin', () => {
  const h = deepLinkHarness();
  assert.strictEqual(h.win.dvSetLinkBase('https://pages.example.test/shell'), true);
  h.ctl.onChange();
  assert.strictEqual(h.posts.at(-1).targetOrigin, 'https://pages.example.test');
  assert.strictEqual(h.posts.at(-1).message.type, 'dv_fragment');
  assert.strictEqual(h.posts.at(-1).message.fragment, 't=overview');
  h.button.listeners.click();
  assert.strictEqual(h.copied[0], 'https://pages.example.test/shell#t=overview');
});

test('standalone copy links retain the page URL behavior when no base is registered', () => {
  const h = deepLinkHarness();
  h.button.listeners.click();
  assert.strictEqual(h.copied[0],
    'https://pages.example.test/page.html?mode=view#t=overview');
  assert.strictEqual(h.posts.length, 0);
});

test('standalone history writes retain every replaceState argument', () => {
  const nonempty = deepLinkHarness();
  const empty = deepLinkHarness({kind:'page'});
  assert.deepStrictEqual(nonempty.historyCalls[0], [null, '', '#t=overview']);
  assert.deepStrictEqual(empty.historyCalls[0],
    [null, '', '/page.html?mode=view']);
});

test('section references are heading-slug primary, unique, and positional only without headings', () => {
  const refs = C.sectionReferences([
    'Delivery Flow', 'Delivery Flow', '', 'Delivery Flow', '123', '!!!', '!!!'
  ]);
  assert.strictEqual(refs.join(','),
    'delivery-flow,delivery-flow-2,3,delivery-flow-3,section-123,section,section-2');
  assert.strictEqual(C.sectionSlugify('Later Diagram'), 'later-diagram');
});

test('canonical tab and step references remain addressable through collisions', () => {
  assert.strictEqual(C.tabReference(['same', 'same', '2'], 0), 'same');
  assert.strictEqual(C.tabReference(['same', 'same', '2'], 1), '02');
  assert.strictEqual(C.tabIndexOf('02', ['same', 'same', '2'], 3), 1);
  const ids = ['2', null, 'repeat', 'repeat'];
  const refs = ids.map((_, i) => C.stepReference(ids, i));
  assert.deepStrictEqual(refs, ['2', '02', '3', '4']);
  refs.forEach((ref, i) => assert.strictEqual(C.stepIndexOf(ids, ref), i));
});

test('resolveHashTarget routes every diagram, tab block, contract card, and legacy first stepper', () => {
  const manifest = {
    tabBlocks: [
      {index: 1, count: 2, slugs: ['overview', 'guided']},
      {index: 2, count: 2, slugs: ['before', 'after']}
    ],
    sections: [
      {number: 1, reference: 'wire-overview', tabBlock: null, tab: null, stepIds: null, hasCard: true, rowCount: 2},
      {number: 2, reference: 'first-flow', tabBlock: 1, tab: 0, stepIds: ['first', null], hasCard: false, rowCount: 0},
      {number: 3, reference: 'later-flow', tabBlock: 1, tab: 0, stepIds: ['later', 'done'], hasCard: true, rowCount: 3},
      {number: 4, reference: 'guided-flow', tabBlock: 1, tab: 1, stepIds: ['guide'], hasCard: false, rowCount: 0},
      {number: 5, reference: 'new-flow', tabBlock: 2, tab: 1, stepIds: ['new'], hasCard: true, rowCount: 1}
    ]
  };
  let target = C.resolveHashTarget(C.parseHash('#t=overview&m=step&s=2'), manifest);
  assert.deepStrictEqual(
    [target.kind, target.section, target.step, target.tabBlock, target.tab, target.legacy],
    ['diagram', 2, 1, 1, 0, true],
    'legacy t/m/s still means the first stepper in the selected tab');
  target = C.resolveHashTarget(C.parseHash('#d=later-flow&m=step&s=done'), manifest);
  assert.deepStrictEqual([target.kind, target.section, target.step, target.tab], ['diagram', 3, 1, 0]);
  target = C.resolveHashTarget(C.parseHash('#d=4&m=ambient'), manifest);
  assert.deepStrictEqual([target.kind, target.section, target.mode, target.tab], ['diagram', 4, 'ambient', 1]);
  target = C.resolveHashTarget(C.parseHash('#c=later-flow&r=2'), manifest);
  assert.deepStrictEqual([target.kind, target.section, target.row, target.tab], ['row', 3, 1, 0]);
  target = C.resolveHashTarget(C.parseHash('#c=1'), manifest);
  assert.deepStrictEqual([target.kind, target.section], ['card', 1]);
  target = C.resolveHashTarget(C.parseHash('#b=2&t=after'), manifest);
  assert.deepStrictEqual([target.kind, target.tabBlock, target.tab], ['tab', 2, 1]);
  target = C.resolveHashTarget(C.parseHash(
    '#t=overview&d=later-flow&m=step&s=done&c=later-flow&r=2'), manifest);
  assert.deepStrictEqual(
    [target.kind, target.section, target.row, target.diagram.section,
     target.diagram.step, target.explicitTab.tabBlock, target.explicitTab.tab],
    ['row', 3, 1, 3, 1, 1, 0],
    'tab, later diagram step, and highlighted row resolve as one composed state');
  assert.strictEqual(C.resolveHashTarget(C.parseHash('#d=3&m=step&s=done'), manifest).section, 3,
    'numeric section indices remain accepted as legacy input');
  assert.strictEqual(C.resolveHashTarget(C.parseHash('#d=99&m=step&s=1'), manifest).kind, 'invalid');
});

test('duplicate step ids warn with field path', () => {
  const page = C.normalize({nodes: {a: {}, b: {}}, rows: [['a', 'b']],
    edges: [{from: 'a', to: 'b'}],
    steps: [{edge: 'a->b', id: 's1', text: 'x'}, {edge: 'a->b', id: 's1', text: 'y'}]});
  const v = C.validate(page);
  assert.ok(v.warnings.some(w => w.includes('steps[1].id') && w.includes('duplicate')),
    v.warnings.join('; '));
});

/* Acceptance gate: with every author nudge stripped from the doorbell spec and
   none present in cumulus v2, auto-layout alone must produce non-colliding
   labels. Node has no getBBox, so label boxes are estimated from the 10.5px
   mono metrics and path midpoints from the path-string geometry. */
function bezPoint(p0, p1, p2, p3, t){
  const u = 1 - t;
  return {
    x: u*u*u*p0.x + 3*u*u*t*p1.x + 3*u*t*t*p2.x + t*t*t*p3.x,
    y: u*u*u*p0.y + 3*u*u*t*p1.y + 3*u*t*t*p2.y + t*t*t*p3.y
  };
}
function pathPoints(d){
  // parses 'M x y' + ('L x y' | one or two 'C x1 y1 x2 y2 x y') into samples
  const nums = d.match(/-?\d+(\.\d+)?/g).map(Number);
  const pts = [];
  if (d.includes(' L ')){
    const [x0, y0, x1, y1] = nums;
    for (let t = 0; t <= 1.0001; t += 0.1)
      pts.push({x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t});
    return pts;
  }
  const segs = [];
  let start = {x: nums[0], y: nums[1]};
  for (let i = 2; i + 5 < nums.length; i += 6){
    const seg = [start,
      {x: nums[i], y: nums[i+1]}, {x: nums[i+2], y: nums[i+3]},
      {x: nums[i+4], y: nums[i+5]}];
    segs.push(seg);
    start = seg[3];
  }
  segs.forEach(seg => {
    for (let t = 0; t <= 1.0001; t += 0.1) pts.push(bezPoint(...seg, t));
  });
  return pts;
}
function geometryCheck(specPath){
  const spec = readSpec(specPath);
  const page = C.normalize(spec);
  const diagrams = [];
  C.blocksOf(page).forEach(b => {
    if (b.type === 'section'){ if (b.sec && b.sec.diagram) diagrams.push(b.sec.diagram); }
    else b.tabs.forEach(t => t.sections.forEach(s => { if (s.diagram) diagrams.push(s.diagram); }));
  });
  let residual = 0;
  diagrams.forEach(d => {
    const L = C.layout(d);
    const adj = C.edgeAutoAdjust(d.edges || [], L);
    C.resolveEdgeAvoidance(d.edges || [], L, adj);  // labels place off the FINAL routed paths
    const nodeRects = Object.keys(d.nodes)
      .map(id => L.pos[id])
      .filter(Boolean)
      .map(p => ({x: p.cx - p.w/2 - 2, y: p.cy - p.h/2 - 2, w: p.w + 4, h: p.h + 4}));
    const labels = [];
    (d.edges || []).forEach((e, i) => {
      if (!e.label) return;
      const pts = pathPoints(C.edgePath(e, L, adj[i]));
      const mid = pts[Math.floor(pts.length / 2)];
      const w = String(e.label).length * 6.35, h = 13;
      const fixed = !!(e.labelDx || e.labelDy);
      labels.push({x: mid.x - w/2, y: mid.y - 16 - h + 3, w, h, fixed});
    });
    const nudges = C.resolveLabelCollisions(labels, nodeRects);
    const placed = labels.map((lb, i) =>
      ({x: lb.x + nudges[i].dx, y: lb.y + nudges[i].dy, w: lb.w, h: lb.h}));
    for (let i = 0; i < placed.length; i++){
      for (let j = i + 1; j < placed.length; j++)
        residual += C.overlapArea(placed[i], placed[j]);
      nodeRects.forEach(nr => { residual += C.overlapArea(placed[i], nr); });
    }
  });
  return residual;
}

test('acceptance: doorbell spec has no nudge fields left', () => {
  const raw = fs.readFileSync(path.join(ROOT, 'examples/doorbell/doorbell.spec.json'), 'utf8');
  assert.ok(!/"(bend|labelDx|labelDy)"/.test(raw), 'nudge fields must be gone');
});

test('acceptance: nudge-free doorbell labels resolve without collisions (estimated metrics)', () => {
  const residual = geometryCheck('examples/doorbell/doorbell.spec.json');
  assert.ok(residual < 1, 'residual label overlap area: ' + residual.toFixed(1));
});

test('acceptance: cumulus v2 labels resolve without collisions (estimated metrics)', () => {
  const residual = geometryCheck('examples/cumulus/cumulus-page.spec.v2.json');
  assert.ok(residual < 1, 'residual label overlap area: ' + residual.toFixed(1));
});

test('acceptance: atlas labels resolve without collisions (estimated metrics)', () => {
  const residual = geometryCheck('examples/doorbell-atlas/atlas.spec.json');
  assert.ok(residual < 1, 'residual label overlap area: ' + residual.toFixed(1));
});

/* ---------------- widgets wave: pure widget models ---------------- */

const WF_SPANS = [
  {id: 'a', label: 'hop a', ms: 100},
  {id: 'b', label: 'hop b', ms: 300},
  {id: 'c', label: 'hop c', ms: 100},
];

test('waterfallModel computes offsets, widths, and reveal on one shared scale', () => {
  const m = C.waterfallModel(WF_SPANS, {reveal: 2, highlight: 'b'});
  assert.strictEqual(m.totalMs, 500);
  assert.strictEqual(m.shownMs, 400);
  assert.strictEqual(m.rows.length, 3);
  assert.strictEqual(m.rows[0].offsetPct, 0);
  assert.strictEqual(m.rows[1].offsetPct, 20);
  assert.strictEqual(m.rows[1].widthPct, 60);
  assert.strictEqual(m.rows[2].offsetPct, 80);
  assert.ok(m.rows[0].revealed && m.rows[1].revealed && !m.rows[2].revealed);
  assert.ok(!m.rows[0].highlight && m.rows[1].highlight);
  assert.strictEqual(m.totalLabel, '400 ms');
});

test('waterfallModel: explicit total label wins; reveal clamps; empty spans safe', () => {
  const m = C.waterfallModel(WF_SPANS, {reveal: 99, total: '640 ms p95'});
  assert.strictEqual(m.shownMs, 500);
  assert.strictEqual(m.totalLabel, '640 ms p95');
  const empty = C.waterfallModel([], {reveal: 3});
  assert.strictEqual(empty.rows.length, 0);
  assert.strictEqual(empty.totalMs, 0);
  const noState = C.waterfallModel(WF_SPANS, null);
  assert.ok(noState.rows.every(r => r.revealed), 'no state means fully revealed');
});

test('orbitPositions places n states on the ring starting at the top', () => {
  const pos = C.orbitPositions(4, 100, 80, 50);
  assert.strictEqual(pos.length, 4);
  assert.ok(Math.abs(pos[0].x - 100) < 1e-9 && Math.abs(pos[0].y - 30) < 1e-9, 'first state at 12 o\'clock');
  for (const p of pos){
    const d = Math.hypot(p.x - 100, p.y - 80);
    assert.ok(Math.abs(d - 50) < 1e-9, 'every state sits on the radius');
  }
  assert.ok(pos[1].x > 100, 'second state clockwise (right side)');
});

test('zoneModel merges state onto declared zones and coerces bad states', () => {
  const decl = [
    {id: 'w', label: 'walk', state: 'armed', points: [[0,0],[1,0],[1,1]]},
    {id: 's', state: 'ignored', points: [[0,0],[2,0],[2,2]]},
    {id: 'm', state: 'masked', points: [[3,3],[4,3],[4,4]]},
  ];
  const zm = C.zoneModel(decl, [{id: 'w', state: 'ignored'}, {id: 'm', state: 'nonsense'}]);
  assert.strictEqual(zm[0].state, 'ignored', 'patched state applies');
  assert.strictEqual(zm[1].state, 'ignored', 'undeclared-in-patch keeps declared state');
  assert.strictEqual(zm[2].state, 'armed', 'invalid state coerces to armed');
  assert.strictEqual(zm[1].label, 's', 'label falls back to id');
});

test('xrayModel: layers default sealed, patch opens by id', () => {
  const decl = [
    {id: 'tls', label: 'TLS', holder: 'hop'},
    {id: 'e2ee', label: 'E2EE', holder: 'owner'},
  ];
  const closed = C.xrayModel(decl, null);
  assert.ok(closed.every(l => !l.open), 'no state means all sealed');
  const xm = C.xrayModel(decl, [{id: 'tls', open: true}, {id: 'e2ee', open: 'yes'}]);
  assert.strictEqual(xm[0].open, true);
  assert.strictEqual(xm[1].open, false, 'non-boolean open does not open a layer');
});

test('pirModel: subject inside the cone trips it; outside stays clear', () => {
  const panel = {sensor: {x: 298, y: 78}, cone: {facing: 175, spread: 66, range: 250}};
  // a point out along the facing direction (to the left, roughly level) is inside
  const inside = C.pirModel(panel, {subject: {x: 120, y: 90}});
  assert.strictEqual(inside.tripped, true, 'straight-ahead subject trips the cone');
  // a point hugging the wall directly below the sensor (steep angle) is outside
  const outside = C.pirModel(panel, {subject: {x: 285, y: 150}});
  assert.strictEqual(outside.tripped, false, 'side/blind-spot subject does not trip');
});

test('pirModel: beyond range is clear; explicit tripped overrides geometry', () => {
  const panel = {sensor: {x: 298, y: 78}, cone: {facing: 180, spread: 90, range: 100}};
  const farAway = C.pirModel(panel, {subject: {x: 10, y: 78}});
  assert.strictEqual(farAway.tripped, false, 'subject beyond range does not trip');
  const forced = C.pirModel(panel, {subject: {x: 10, y: 78}, tripped: true});
  assert.strictEqual(forced.tripped, true, 'explicit tripped:true overrides');
  const suppressed = C.pirModel(panel, {subject: {x: 120, y: 78}, tripped: false});
  assert.strictEqual(suppressed.tripped, false, 'explicit tripped:false overrides');
});

test('pirModel: cone polygon starts at sensor and defaults apply', () => {
  const m = C.pirModel({}, {});
  assert.strictEqual(m.conePoints[0][0], m.sensor.x, 'first cone point x is the sensor apex');
  assert.strictEqual(m.conePoints[0][1], m.sensor.y, 'first cone point y is the sensor apex');
  assert.ok(m.conePoints.length >= 3, 'cone has an apex plus an arc');
  assert.strictEqual(m.subject, null, 'no subject when unset');
  assert.strictEqual(m.tripped, false);
  assert.strictEqual(m.cone.range > 0, true, 'default range is positive');
});

test('thermoModel: zone is computed from thresholds; label overrides the caption only', () => {
  const panel = {min: 20, max: 110, warn: 75, crit: 95};
  assert.strictEqual(C.thermoModel(panel, {value: 40}).zone, 'ok');
  assert.strictEqual(C.thermoModel(panel, {value: 40}).label, 'NOMINAL');
  assert.strictEqual(C.thermoModel(panel, {value: 75}).zone, 'warn', 'warn threshold is inclusive');
  assert.strictEqual(C.thermoModel(panel, {value: 95}).zone, 'crit', 'crit threshold is inclusive');
  assert.strictEqual(C.thermoModel(panel, {value: 96, label: 'HP CORE OFF'}).label, 'HP CORE OFF');
  assert.strictEqual(C.thermoModel(panel, {value: 96, label: 'HP CORE OFF'}).zone, 'crit',
    'label override does not change the computed zone');
});

test('thermoModel: defaults, missing value, clamping, reversed thresholds', () => {
  const dflt = C.thermoModel({}, {value: 50});
  assert.strictEqual(dflt.min, 0);
  assert.strictEqual(dflt.max, 100);
  assert.strictEqual(dflt.pct, 50);
  assert.strictEqual(dflt.zone, 'ok', 'no thresholds declared means never warn/crit');
  const na = C.thermoModel({warn: 75}, {});
  assert.strictEqual(na.value, null);
  assert.strictEqual(na.zone, 'na');
  assert.strictEqual(na.label, 'NO DATA');
  const over = C.thermoModel({min: 20, max: 110}, {value: 400});
  assert.strictEqual(over.pct, 100, 'value beyond max clamps the fill');
  const under = C.thermoModel({min: 20, max: 110}, {value: -40});
  assert.strictEqual(under.pct, 0, 'value below min clamps the fill');
  const swapped = C.thermoModel({min: 0, max: 100, warn: 90, crit: 70}, {value: 80});
  assert.strictEqual(swapped.warn, 70, 'reversed thresholds are swapped');
  assert.strictEqual(swapped.crit, 90);
  assert.strictEqual(swapped.zone, 'warn');
  const badMax = C.thermoModel({min: 50, max: 10}, {value: 60});
  assert.strictEqual(badMax.max, 150, 'max<=min falls back to min+100');
  /* JSON overflow literals (1e400) parse to Infinity — non-finite numbers
     must be treated as absent, never poison percentages into NaN */
  const inf = C.thermoModel({min: 1e400, max: 110, warn: 1e400, crit: 95}, {value: 50});
  assert.strictEqual(inf.min, 0, 'non-finite min falls back to default');
  assert.strictEqual(inf.warn, null, 'non-finite warn is treated as absent');
  assert.ok(isFinite(inf.pct), 'pct stays finite');
  const infVal = C.thermoModel({min: 20, max: 110}, {value: 1e400});
  assert.strictEqual(infVal.value, null, 'non-finite value renders as no data');
  assert.strictEqual(infVal.zone, 'na');
});

test('validator: thermo threshold warnings (non-number, max<=min, warn>crit)', () => {
  const page = C.normalize({nodes: {a: {}}, rows: [['a']], edges: [],
    panels: [{id: 't', type: 'thermo', min: 20, max: 10, warn: '75', crit: 60}],
    steps: [{nodes: ['a'], text: 'x'}]});
  const {errors, warnings} = C.validate(page);
  assert.strictEqual(errors.length, 0);
  assert.ok(warnings.some(w => w.includes('.max: must exceed min')), 'max<=min warns');
  assert.ok(warnings.some(w => w.includes('.warn: must be a finite number')), 'non-number warn warns');
  const infPage = C.normalize({nodes: {a: {}}, rows: [['a']], edges: [],
    panels: [{id: 't', type: 'thermo', min: 1e400, max: 110, initial: {value: 1e400}}],
    steps: [{nodes: ['a'], text: 'x', panels: {t: {value: 1e400}}}]});
  const infWarnings = C.validate(infPage).warnings;
  assert.ok(infWarnings.some(w => w.includes('.min: must be a finite number')),
    'Infinity (JSON 1e400) threshold warns as non-finite');
  assert.ok(infWarnings.some(w => w.includes('.initial.value: must be a finite number')),
    'non-finite initial value warns');
  assert.ok(infWarnings.some(w => w.includes('.panels.t.value: must be a finite number')),
    'non-finite step-patch value warns');
  const ok = C.normalize({nodes: {a: {}}, rows: [['a']], edges: [],
    panels: [{id: 't', type: 'thermo', min: 20, max: 110, warn: 75, crit: 95, initial: {value: 28}}],
    steps: [{nodes: ['a'], text: 'x'}]});
  const clean = C.validate(ok);
  assert.strictEqual(clean.warnings.filter(w => w.includes('panels[')).length, 0,
    'well-formed thermo panel raises no panel warnings');
  const rev = C.normalize({nodes: {a: {}}, rows: [['a']], edges: [],
    panels: [{id: 't', type: 'thermo', warn: 95, crit: 75}],
    steps: [{nodes: ['a'], text: 'x'}]});
  assert.ok(C.validate(rev).warnings.some(w => w.includes('warn exceeds crit')));
});

test('thermo sparkline: a no-data step breaks the line into segments (no bridge)', () => {
  /* renderPanelBody needs only innerHTML + querySelector on the host, so a
     stub object suffices — no DOM. History: finite, finite, NO DATA (1e400),
     finite, finite → the line must be two 2-point segments, never one
     4-point line bridging the gap; the gap step gets no dot. */
  const host = {innerHTML: '', querySelector: () => null};
  const panel = {id: 't', type: 'thermo', min: 0, max: 100};
  const states = [{value: 10}, {value: 20}, {value: 1e400}, {value: 30}, {value: 40}];
  C.renderPanelBody(host, panel, states[4], 'aurora', states, 4);
  const h = host.innerHTML;
  const lit = [...h.matchAll(/<polyline class="thline" points="([^"]*)"/g)].map(m => m[1]);
  assert.strictEqual(lit.length, 2, 'two bright segments, split at the no-data step');
  assert.ok(lit.every(pts => pts.split(' ').length === 2), 'each segment spans 2 points');
  const dots = [...h.matchAll(/<circle class="thdot/g)];
  assert.strictEqual(dots.length, 4, 'no dot for the no-data step');
});

test('batteryModel: zones inclusive at-or-below; label override; clamping; defaults', () => {
  const panel = {low: 20, crit: 10};
  assert.strictEqual(C.batteryModel(panel, {charge: 55}).zone, 'ok');
  assert.strictEqual(C.batteryModel(panel, {charge: 20}).zone, 'low', 'low threshold inclusive');
  assert.strictEqual(C.batteryModel(panel, {charge: 10}).zone, 'crit', 'crit threshold inclusive');
  assert.strictEqual(C.batteryModel(panel, {charge: 5, label: 'PRESERVE'}).label, 'PRESERVE');
  assert.strictEqual(C.batteryModel(panel, {charge: 5, label: 'PRESERVE'}).zone, 'crit',
    'label override does not change the computed zone');
  assert.strictEqual(C.batteryModel(panel, {charge: 140}).charge, 100, 'charge clamps to 100');
  assert.strictEqual(C.batteryModel(panel, {charge: -3}).charge, 0, 'charge clamps to 0');
  const na = C.batteryModel(panel, {});
  assert.strictEqual(na.zone, 'na');
  assert.strictEqual(na.label, 'NO DATA');
  const none = C.batteryModel({}, {charge: 1});
  assert.strictEqual(none.zone, 'ok', 'no thresholds declared means never low/crit');
});

test('batteryModel: reversed thresholds swap; non-finite treated as absent; trend/source vetted', () => {
  const swapped = C.batteryModel({low: 10, crit: 30}, {charge: 20});
  assert.strictEqual(swapped.low, 30, 'reversed thresholds are swapped');
  assert.strictEqual(swapped.crit, 10);
  assert.strictEqual(swapped.zone, 'low');
  const inf = C.batteryModel({low: 1e400, crit: 10}, {charge: 1e400});
  assert.strictEqual(inf.low, null, 'non-finite low is treated as absent');
  assert.strictEqual(inf.charge, null, 'non-finite charge renders as no data');
  assert.strictEqual(inf.zone, 'na');
  const m = C.batteryModel({}, {charge: 50, trend: 'charging', source: 'solar', cold: true, note: '3 days left'});
  assert.strictEqual(m.trend, 'charging');
  assert.strictEqual(m.source, 'solar');
  assert.strictEqual(m.cold, true);
  assert.strictEqual(m.note, '3 days left');
  const bad = C.batteryModel({}, {charge: 50, trend: 'zooming', source: 'hamster', cold: 'yes'});
  assert.strictEqual(bad.trend, null, 'unknown trend dropped');
  assert.strictEqual(bad.source, null, 'unknown source dropped');
  assert.strictEqual(bad.cold, false, 'non-boolean cold dropped');
});

test('validator: battery threshold and finite-charge warnings', () => {
  const page = C.normalize({nodes: {a: {}}, rows: [['a']], edges: [],
    panels: [{id: 'b', type: 'battery', low: 10, crit: 30, initial: {charge: 1e400}}],
    steps: [{nodes: ['a'], text: 'x', panels: {b: {charge: 1e400}}}]});
  const {errors, warnings} = C.validate(page);
  assert.strictEqual(errors.length, 0);
  assert.ok(warnings.some(w => w.includes('crit exceeds low')), 'reversed thresholds warn');
  assert.ok(warnings.some(w => w.includes('.initial.charge: must be a finite number')),
    'non-finite initial charge warns');
  assert.ok(warnings.some(w => w.includes('.panels.b.charge: must be a finite number')),
    'non-finite step-patch charge warns');
  const clean = C.normalize({nodes: {a: {}}, rows: [['a']], edges: [],
    panels: [{id: 'b', type: 'battery', low: 20, crit: 10, initial: {charge: 86}}],
    steps: [{nodes: ['a'], text: 'x', panels: {b: {charge: 55}}}]});
  assert.strictEqual(C.validate(clean).warnings.filter(w => w.includes('panels[')).length, 0,
    'well-formed battery panel raises no panel warnings');
});

test('battery render: glyph, sparkline gap-breaking, and unchanged-skip all hold', () => {
  const host = {innerHTML: '', querySelector: () => null};
  const panel = {id: 'b', type: 'battery', low: 20, crit: 10};
  const states = [{charge: 80}, {charge: 1e400}, {charge: 40}, {charge: 15}];
  C.renderPanelBody(host, panel, states[3], 'aurora', states, 3);
  const h = host.innerHTML;
  assert.ok(h.includes('btzone z-low'), 'zone chip carries the computed zone');
  assert.ok(h.includes('btfill z-low'), 'fill carries the zone');
  assert.ok(h.includes('bttick low') && h.includes('bttick crit'), 'threshold ticks render');
  const lit = [...h.matchAll(/<polyline class="btline" points="([^"]*)"/g)].map(m => m[1]);
  assert.strictEqual(lit.length, 1, 'single-point run before the gap draws no line; one segment after it');
  assert.strictEqual(lit[0].split(' ').length, 2, 'the surviving segment spans the two post-gap steps');
  assert.strictEqual([...h.matchAll(/<circle class="btdot/g)].length, 3,
    'three dots: the pre-gap point keeps its dot, the gap step has none');
  host.innerHTML = 'SENTINEL';
  C.renderPanelBody(host, panel, states[3], 'aurora', states, 3);
  assert.strictEqual(host.innerHTML, 'SENTINEL', 'unchanged battery state skips the rebuild');
});

test('bufferModel: cell normalization, head range, computed summary', () => {
  const m = C.bufferModel({segments: 6, capacity: '6 s'}, {
    cells: ['buffered', 'buffered', 'protected', 'nonsense'], head: 4, note: 'rolling'});
  assert.strictEqual(m.n, 6);
  assert.strictEqual(m.cells.join(','),
    'buffered,buffered,protected,empty,empty,empty',
    'unknown token falls to empty; missing tail cells are empty');
  assert.strictEqual(m.head, 4);
  assert.strictEqual(m.summary, '2 buffered · 1 protected');
  assert.strictEqual(m.capacity, '6 s');
  const bad = C.bufferModel({segments: 4}, {head: 9});
  assert.strictEqual(bad.head, null, 'out-of-range head hidden');
  assert.strictEqual(bad.summary, 'empty');
  const dflt = C.bufferModel({}, {});
  assert.strictEqual(dflt.n, 12, 'default segment count');
  const clampN = C.bufferModel({segments: 500}, {});
  assert.strictEqual(clampN.n, 48, 'segment count clamps to 48');
});

test('validator: buffer warnings on segments, unknown cell tokens, bad head', () => {
  const page = C.normalize({nodes: {a: {}}, rows: [['a']], edges: [],
    panels: [{id: 'bf', type: 'buffer', segments: 99,
              initial: {cells: ['buffered', 'zzz'], head: 50}}],
    steps: [{nodes: ['a'], text: 'x', panels: {bf: {cells: 'notarray'}}}]});
  const {errors, warnings} = C.validate(page);
  assert.strictEqual(errors.length, 0);
  assert.ok(warnings.some(w => w.includes('.segments: out of range — clamped to 2–48')));
  assert.ok(warnings.some(w => w.includes(".cells[1]: unknown state \"zzz\"")));
  assert.ok(warnings.some(w => w.includes('.head: expected an index')));
  assert.ok(warnings.some(w => w.includes('.cells: must be an array')));
  const clean = C.normalize({nodes: {a: {}}, rows: [['a']], edges: [],
    panels: [{id: 'bf', type: 'buffer', segments: 8, capacity: '1 h',
              initial: {cells: ['buffered'], head: 1}}],
    steps: [{nodes: ['a'], text: 'x',
             panels: {bf: {cells: ['buffered', 'uploading'], head: 2}}}]});
  assert.strictEqual(C.validate(clean).warnings.filter(w => w.includes('panels[')).length, 0,
    'well-formed buffer panel raises no panel warnings');
});

test('buffer render: head marker, cell states, summary; unchanged-skip holds', () => {
  const host = {innerHTML: '', querySelector: () => null};
  const panel = {id: 'bf', type: 'buffer', segments: 5, capacity: '1 h'};
  const st = {cells: ['uploaded', 'buffered', 'buffered', 'uploading'], head: 3, note: 'back-fill'};
  C.renderPanelBody(host, panel, st, 'aurora');
  const h = host.innerHTML;
  assert.strictEqual([...h.matchAll(/bfcell s-/g)].length, 5, 'one cell per declared segment');
  assert.ok(h.includes('s-uploading') && h.includes('s-uploaded'), 'states render');
  assert.ok(h.includes('bfmark on'), 'head marker present');
  assert.ok(h.includes('2 buffered · 1 uploading · 1 uploaded'), 'computed summary');
  assert.ok(h.includes('back-fill') && h.includes('1 h'), 'note and capacity render');
  host.innerHTML = 'SENTINEL';
  C.renderPanelBody(host, panel, st, 'aurora');
  assert.strictEqual(host.innerHTML, 'SENTINEL', 'unchanged buffer state skips the rebuild');
});

test('pointInPoly: containment, exterior, non-convex', () => {
  const sq = [[0, 0], [10, 0], [10, 10], [0, 10]];
  assert.strictEqual(C.pointInPoly(5, 5, sq), true);
  assert.strictEqual(C.pointInPoly(15, 5, sq), false);
  const ell = [[0, 0], [10, 0], [10, 4], [4, 4], [4, 10], [0, 10]];
  assert.strictEqual(C.pointInPoly(2, 8, ell), true, 'inside the L arm');
  assert.strictEqual(C.pointInPoly(8, 8, ell), false, 'inside the L notch is outside');
});

test('radarModel: distance/threshold alert, zone occupancy, overrides, defaults', () => {
  const panel = {sensor: {x: 160, y: 168}, facing: 270, spread: 120, range: 150,
                 threshold: 80,
                 zones: [{id: 'porch', label: 'porch', points: [[120, 100], [200, 100], [200, 160], [120, 160]]},
                         {id: 'walk', points: [[20, 20], [80, 20], [80, 60], [20, 60]]},
                         {id: 'bad', points: [[0, 0]]}]};
  const far = C.radarModel(panel, {subject: {x: 160, y: 40}});
  assert.strictEqual(far.alert, false, 'beyond threshold is clear');
  assert.strictEqual(Math.round(far.dist), 128);
  const near = C.radarModel(panel, {subject: {x: 160, y: 110}});
  assert.strictEqual(near.alert, true, 'inside threshold alerts');
  assert.strictEqual(near.occupied.join(','), 'porch', 'zone occupancy computed');
  assert.strictEqual(near.zones.length, 2, 'a zone with <3 points is dropped');
  const forced = C.radarModel(panel, {subject: {x: 160, y: 40}, alert: true});
  assert.strictEqual(forced.alert, true, 'explicit alert:true overrides');
  const off = C.radarModel(panel, {subject: {x: 160, y: 110}, alert: false});
  assert.strictEqual(off.alert, false, 'explicit alert:false overrides');
  const d = C.radarModel({}, {});
  assert.strictEqual(d.sensor.x, 160);
  assert.strictEqual(d.rings, 3);
  assert.strictEqual(d.threshold, null, 'no threshold means no alert arc');
  assert.strictEqual(d.subject, null);
  const capped = C.radarModel({range: 100, threshold: 500}, {});
  assert.strictEqual(capped.threshold, 100, 'threshold caps at range');
});

test('radar render: rings/threshold/track; move+alert one-shots skip next step', () => {
  const host = {innerHTML: '', querySelector: () => null};
  const panel = {id: 'r', type: 'radar', sensor: {x: 160, y: 168}, facing: 270,
                 spread: 120, range: 150, threshold: 80};
  const states = [{subject: {x: 40, y: 40}}, {subject: {x: 160, y: 110}}, {subject: {x: 160, y: 110}}];
  C.renderPanelBody(host, panel, states[0], 'aurora', states, 0);
  assert.ok(host.innerHTML.includes('rdthresh'), 'threshold arc renders');
  assert.strictEqual([...host.innerHTML.matchAll(/rdring/g)].length, 3, 'three rings by default');
  C.renderPanelBody(host, panel, states[1], 'aurora', states, 1);
  const h2 = host.innerHTML;
  assert.ok(h2.includes('rdripple'), 'clear->alert fires the one-shot ripple');
  assert.ok(h2.includes('rdsubject alert'), 'subject carries the alert class');
  assert.ok(h2.includes('rdtrack'), 'track polyline drawn from folded history');
  assert.ok(h2.includes('style="transform:translate('), 'subject glides from previous position');
  host.innerHTML = 'SENTINEL';
  C.renderPanelBody(host, panel, states[2], 'aurora', states, 2);
  assert.strictEqual(host.innerHTML, 'SENTINEL',
    'unchanged alert step matches the steady baseline and skips');
});

test('validator: radar declaration warnings', () => {
  const page = C.normalize({nodes: {a: {}}, rows: [['a']], edges: [],
    panels: [{id: 'r', type: 'radar', sensor: {x: 'left'}, spread: 5, range: -1,
              threshold: 0, rings: 9, zones: [{id: 'z', points: [[0, 0]]}]}],
    steps: [{nodes: ['a'], text: 'x'}]});
  const {errors, warnings} = C.validate(page);
  assert.strictEqual(errors.length, 0);
  assert.ok(warnings.some(w => w.includes('.sensor: expected {x, y}')));
  assert.ok(warnings.some(w => w.includes('.spread: expected degrees')));
  assert.ok(warnings.some(w => w.includes('.range: must be a positive reach')));
  assert.ok(warnings.some(w => w.includes('.threshold: must be a positive distance')));
  assert.ok(warnings.some(w => w.includes('.rings: count out of range — clamped to 1–6')));
  assert.ok(warnings.some(w => w.includes('.zones[0]: needs')));
  const clean = C.normalize({nodes: {a: {}}, rows: [['a']], edges: [],
    panels: [{id: 'r', type: 'radar', sensor: {x: 160, y: 168}, spread: 120,
              range: 150, threshold: 80, rings: 3,
              zones: [{id: 'z', points: [[0, 0], [10, 0], [10, 10]]}],
              initial: {subject: {x: 40, y: 40}}}],
    steps: [{nodes: ['a'], text: 'x'}]});
  assert.strictEqual(C.validate(clean).warnings.filter(w => w.includes('panels[')).length, 0,
    'well-formed radar panel raises no panel warnings');
});

test('signalModel: per-link status, defaults, vetting, cap at 6', () => {
  const panel = {links: [
    {id: 'wifi', label: 'WiFi', transport: 'wifi'},
    {id: 'cell', label: 'Cellular', transport: 'cellular'},
    {id: 'mesh', transport: 'carrier-pigeon'},
    {noid: true}]};
  const m = C.signalModel(panel, {
    wifi: {state: 'lost', bars: 0, note: 'AP down'},
    cell: {state: 'ok', bars: 3, note: '-97 dBm'},
    mesh: {state: 'zzz', bars: 99}});
  assert.strictEqual(m.length, 3, 'link without an id is dropped');
  assert.strictEqual(m[0].state, 'lost');
  assert.strictEqual(m[0].bars, 0);
  assert.strictEqual(m[1].note, '-97 dBm');
  assert.strictEqual(m[2].state, 'ok', 'unknown state falls back to ok');
  assert.strictEqual(m[2].bars, 4, 'bars clamp to 4');
  assert.strictEqual(m[2].transport, null, 'unknown transport hidden');
  assert.strictEqual(m[2].label, 'mesh', 'label defaults to id');
  const unpatched = C.signalModel(panel, {});
  assert.strictEqual(unpatched[0].state, 'ok', 'unpatched link reads ok');
  assert.strictEqual(unpatched[0].bars, null, 'no bars until patched');
  const many = C.signalModel({links: Array.from({length: 9}, (_, i) => ({id: 'l' + i}))}, {});
  assert.strictEqual(many.length, 6, 'links cap at 6');
});

test('validator: signal declaration and per-link patch warnings', () => {
  const page = C.normalize({nodes: {a: {}}, rows: [['a']], edges: [],
    panels: [{id: 's', type: 'signal',
              links: [{id: 'wifi', transport: 'smoke-signals'}, {nolink: 1}],
              initial: {wifi: {state: 'meh', bars: 9}}}],
    steps: [{nodes: ['a'], text: 'x', panels: {s: {wifi: {state: 'sideways'}}}}]});
  const {errors, warnings} = C.validate(page);
  assert.strictEqual(errors.length, 0);
  assert.ok(warnings.some(w => w.includes(".links[0].transport: unknown transport")));
  assert.ok(warnings.some(w => w.includes('.links[1]: needs an id')));
  assert.ok(warnings.some(w => w.includes('.initial.wifi.state: unknown link state "meh"')));
  assert.ok(warnings.some(w => w.includes('.initial.wifi.bars: expected 0–4')));
  assert.ok(warnings.some(w => w.includes('.panels.s.wifi.state: unknown link state "sideways"')));
  const stray = C.normalize({nodes: {a: {}}, rows: [['a']], edges: [],
    panels: [{id: 's', type: 'signal', links: [{id: 'wifi'}],
              initial: {wifi: {state: 'ok', rssi: -52}}}],
    steps: [{nodes: ['a'], text: 'x'}]});
  assert.ok(C.validate(stray).warnings.some(w => w.includes('.initial.wifi.rssi: not a signal field')),
    'unknown per-link fields (like rssi) warn instead of dropping silently');
  const empty = C.normalize({nodes: {a: {}}, rows: [['a']], edges: [],
    panels: [{id: 's', type: 'signal'}], steps: [{nodes: ['a'], text: 'x'}]});
  assert.ok(C.validate(empty).warnings.some(w => w.includes('.links: signal needs links')));
  const clean = C.normalize({nodes: {a: {}}, rows: [['a']], edges: [],
    panels: [{id: 's', type: 'signal',
              links: [{id: 'wifi', label: 'WiFi', transport: 'wifi'}],
              initial: {wifi: {state: 'ok', bars: 4}}}],
    steps: [{nodes: ['a'], text: 'x', panels: {s: {wifi: {state: 'weak', bars: 1, note: '-79 dBm'}}}}]});
  assert.strictEqual(C.validate(clean).warnings.filter(w => w.includes('panels[')).length, 0,
    'well-formed signal panel raises no panel warnings');
});

test('signal render: rows, bars, state chips; unchanged-skip holds', () => {
  const host = {innerHTML: '', querySelector: () => null};
  const panel = {id: 's', type: 'signal', links: [
    {id: 'wifi', label: 'WiFi', transport: 'wifi'},
    {id: 'cell', label: 'Cellular', transport: 'cellular'}]};
  const st = {wifi: {state: 'lost', bars: 0, note: 'AP down'},
              cell: {state: 'retrying', bars: 2, note: 'failing over'}};
  C.renderPanelBody(host, panel, st, 'aurora');
  const h = host.innerHTML;
  assert.strictEqual([...h.matchAll(/sgrow s-/g)].length, 2, 'one row per link');
  assert.ok(h.includes('sgrow s-lost') && h.includes('sgrow s-retrying'));
  assert.ok(h.includes('>LOST<') && h.includes('>RETRYING<'), 'state chips');
  assert.ok(h.includes('WIFI') && h.includes('CELLULAR'), 'transport tags');
  assert.strictEqual([...h.matchAll(/sgbar b\d on/g)].length, 2, 'bars: 0 on wifi + 2 on cell');
  host.innerHTML = 'SENTINEL';
  C.renderPanelBody(host, panel, st, 'aurora');
  assert.strictEqual(host.innerHTML, 'SENTINEL', 'unchanged signal state skips the rebuild');
});

test('tilesModel: vocabulary enforcement, colors, defaults, cap at 12', () => {
  const panel = {tiles: [{id: 'front', label: 'Front Door'}, {id: 'yard'}, {bad: 1}],
                 states: ['ONLINE', 'OFFLINE', 'UPDATING'],
                 colors: {ONLINE: '#4ADE80', UPDATING: '#A78BFA'}};
  const m = C.tilesModel(panel, {
    front: {state: 'UPDATING', sub: 'fw 2.1 → 2.2'},
    yard: {state: 'REBOOTING'}});
  assert.strictEqual(m.length, 2, 'tile without an id dropped');
  assert.strictEqual(m[0].state, 'UPDATING');
  assert.strictEqual(m[0].color, '#A78BFA');
  assert.strictEqual(m[0].sub, 'fw 2.1 → 2.2');
  assert.strictEqual(m[1].state, null, 'state outside vocabulary renders dimmed');
  assert.strictEqual(m[1].label, 'yard', 'label defaults to id');
  const unpatched = C.tilesModel(panel, {});
  assert.strictEqual(unpatched[0].state, null, 'unpatched tile is dimmed');
  const noVocab = C.tilesModel({tiles: [{id: 'a'}]}, {a: {state: 'ANYTHING'}});
  assert.strictEqual(noVocab[0].state, 'ANYTHING', 'no declared vocabulary accepts any state');
  const many = C.tilesModel({tiles: Array.from({length: 20}, (_, i) => ({id: 't' + i}))}, {});
  assert.strictEqual(many.length, 12, 'tiles cap at 12');
});

test('validator: tiles declaration and vocabulary warnings', () => {
  const page = C.normalize({nodes: {a: {}}, rows: [['a']], edges: [],
    panels: [{id: 't', type: 'tiles',
              tiles: [{id: 'cam1'}, {noid: true}],
              states: ['ONLINE', 'OFFLINE'],
              initial: {cam1: {state: 'SIDEWAYS'}}}],
    steps: [{nodes: ['a'], text: 'x', panels: {t: {cam1: {state: 'DIAGONAL'}}}}]});
  const {errors, warnings} = C.validate(page);
  assert.strictEqual(errors.length, 0);
  assert.ok(warnings.some(w => w.includes('.tiles[1]: needs an id')));
  assert.ok(warnings.some(w => w.includes('.initial.cam1.state: "SIDEWAYS" is not in the declared states')));
  assert.ok(warnings.some(w => w.includes('.panels.t.cam1.state: "DIAGONAL" is not in the declared states')));
  const empty = C.normalize({nodes: {a: {}}, rows: [['a']], edges: [],
    panels: [{id: 't', type: 'tiles'}], steps: [{nodes: ['a'], text: 'x'}]});
  assert.ok(C.validate(empty).warnings.some(w => w.includes('.tiles: tiles needs tiles')));
  const clean = C.normalize({nodes: {a: {}}, rows: [['a']], edges: [],
    panels: [{id: 't', type: 'tiles', tiles: [{id: 'cam1', label: 'Front'}],
              states: ['ONLINE'], colors: {ONLINE: '#4ADE80'},
              initial: {cam1: {state: 'ONLINE', sub: 'fw 2.1'}}}],
    steps: [{nodes: ['a'], text: 'x', panels: {t: {cam1: {sub: 'fw 2.2'}}}}]});
  assert.strictEqual(C.validate(clean).warnings.filter(w => w.includes('panels[')).length, 0,
    'well-formed tiles panel raises no panel warnings');
});

test('tiles render: grid, chips, dimming; unchanged-skip holds', () => {
  const host = {innerHTML: '', querySelector: () => null};
  const panel = {id: 't', type: 'tiles',
                 tiles: [{id: 'front', label: 'Front'}, {id: 'yard', label: 'Yard'}],
                 states: ['ONLINE', 'UPDATING'], colors: {UPDATING: '#A78BFA'}};
  const st = {front: {state: 'UPDATING', sub: 'wave 2'}, yard: {state: 'ONLINE'}};
  C.renderPanelBody(host, panel, st, 'aurora');
  const h = host.innerHTML;
  assert.strictEqual([...h.matchAll(/tltile/g)].length, 2, 'one tile per declaration');
  assert.ok(h.includes('UPDATING') && h.includes('color:#A78BFA'), 'colored state chip');
  assert.ok(h.includes('wave 2'), 'sub-line renders');
  assert.ok(!h.includes('tltile dim'), 'no dimmed tiles when all states known');
  host.innerHTML = 'SENTINEL';
  C.renderPanelBody(host, panel, st, 'aurora');
  assert.strictEqual(host.innerHTML, 'SENTINEL', 'unchanged tiles state skips the rebuild');
});

test('radarModel polar layer: scale converts units; sector zones; polar subject', () => {
  const panel = {sensor: {x: 160, y: 90}, spread: 360, range: 4,
                 scale: {pxPerUnit: 18, unit: 'm'},
                 rings: [1, 2, 3, 4], threshold: 2,
                 zones: [{id: 'desk', label: 'Desk', r: [1.0, 2.4], deg: [190, 230]}]};
  const m = C.radarModel(panel, {subject: {r: 1.8, deg: 210}});
  assert.strictEqual(m.range, 72, 'range 4 m × 18 px/m');
  assert.strictEqual(m.threshold, 36, 'threshold in units too');
  assert.strictEqual(m.rings, 4, 'ring array length wins');
  assert.strictEqual(m.zones.length, 1, 'sector zone converted to a polygon');
  assert.ok(m.zones[0].points.length >= 12, 'sector sampled into arc points');
  assert.ok(m.subject && isFinite(m.subject.x) && isFinite(m.subject.y),
    'polar subject converted to frame coordinates');
  assert.strictEqual(m.alert, true, '1.8 m is inside the 2 m threshold');
  assert.strictEqual(m.occupied.join(','), 'desk', 'occupancy computed in the converted space');
  const noScale = C.radarModel({range: 150}, {subject: {r: 50, deg: 270}});
  assert.ok(noScale.subject, 'polar subject still converts without scale (r read as px)');
  const cart = C.radarModel({range: 150, scale: {pxPerUnit: 18}}, {subject: {x: 10, y: 10}});
  assert.strictEqual(cart.subject.x, 10, 'cartesian subject passes through untouched');
});

test('radar/zoneframe/pir: non-finite author points are dropped, never interpolated', () => {
  const rm = C.radarModel({zones: [{id: 'z', points: [[0, 0], ['x"><script>', 5], [10, 0], [10, 10]]}]}, {});
  assert.strictEqual(rm.zones[0].points.length, 3, 'poisoned point dropped, zone survives');
  const zm = C.zoneModel([{id: 'z', points: [[0, 0], ['"><img>', 1], [5, 5], [9, 0]]}], null);
  assert.strictEqual(zm[0].points.length, 3, 'zoneframe drops the poisoned point');
  const pm = C.pirModel({path: [[0, 0], ['evil', 2], [5, 5]]}, {});
  assert.strictEqual(pm.path.length, 2, 'pir path drops the poisoned point');
  const pm2 = C.pirModel({path: [[0, 0], ['evil', 2]]}, {});
  assert.strictEqual(pm2.path, null, 'a path left with <2 clean points is not drawn');
});

test('buffer mark paints: ranges over the cells base; fold accumulates them', () => {
  const m = C.bufferModel({segments: 8}, {
    cells: ['uploaded'], head: 6,
    mark: [[1, 3, 'buffered'], [2, 2, 'protected'], [90, 99, 'buffered'], ['x', 1, 'buffered'], [4, 5, 'zzz']]});
  assert.strictEqual(m.cells.join(','),
    'uploaded,buffered,protected,buffered,empty,empty,empty,empty',
    'paints apply in order; bad indices clamp/skip; bad tokens skip');
  const lbl = C.bufferModel({}, {label: '43 fixes'});
  assert.strictEqual(lbl.note, '43 fixes', 'label is an alias for note');
  const folded = C.foldPanelStates({
    panels: [{id: 'b', type: 'buffer', segments: 6, initial: {head: 0}}],
    steps: [
      {panels: {b: {mark: [[0, 2, 'buffered']], head: 3}}},
      {panels: {b: {mark: [[0, 1, 'protected']]}}},
      {}],
  });
  assert.strictEqual(folded.b[1].mark.length, 2, 'fold appends mark ops like log lines');
  const replay = C.bufferModel({segments: 6}, folded.b[2]);
  assert.strictEqual(replay.cells.join(','),
    'protected,protected,buffered,empty,empty,empty',
    'a jump replays the full paint history');
  const reset = C.foldPanelStates({
    panels: [{id: 'b', type: 'buffer', segments: 4, initial: {}}],
    steps: [
      {panels: {b: {mark: [[0, 3, 'buffered']]}}},
      {panels: {b: {cells: ['uploaded'], mark: [[1, 1, 'protected']]}}},
      {}],
  });
  const afterReset = C.bufferModel({segments: 4}, reset.b[2]);
  assert.strictEqual(afterReset.cells.join(','),
    'uploaded,protected,empty,empty',
    'a wholesale cells patch clears earlier marks; same-patch marks apply on top');
});

test('radar: a step patch re-tunes the threshold in declared units', () => {
  const panel = {sensor: {x: 160, y: 168}, facing: 270, spread: 150,
                 range: 28, threshold: 15, scale: {pxPerUnit: 5, unit: 'ft'}};
  const before = C.radarModel(panel, {subject: {r: 13, deg: 270}});
  assert.strictEqual(before.alert, true, '13 ft inside the 15 ft line');
  const tuned = C.radarModel(panel, {subject: {r: 13, deg: 270}, threshold: 11});
  assert.strictEqual(tuned.threshold, 55, '11 ft × 5 px/ft');
  assert.strictEqual(tuned.alert, false, 'same subject clear after tuning to 11 ft');
});

test('radar review-cycle-2 fixes: declared radii, polar track, wrapped sectors, compaction', () => {
  // (1) declared ring distances render at their true radii
  const host = {innerHTML: '', querySelector: () => null};
  const panel = {id: 'r', type: 'radar', sensor: {x: 160, y: 90}, spread: 360,
                 range: 4, scale: {pxPerUnit: 18, unit: 'm'}, rings: [1, 2, 4]};
  const m = C.radarModel(panel, {});
  assert.strictEqual(m.ringRadii.join(','), '18,36,72', 'unit distances × scale, not even spacing');
  C.renderPanelBody(host, panel, {}, 'aurora');
  assert.ok(host.innerHTML.includes('r="18.0"') && host.innerHTML.includes('r="36.0"'),
    'renderer draws the declared radii');
  // (2) polar subjects reach the track
  const states = [{subject: {r: 3, deg: 0}}, {subject: {r: 1, deg: 90}}];
  const host2 = {innerHTML: '', querySelector: () => null};
  C.renderPanelBody(host2, panel, states[1], 'aurora', states, 1);
  assert.ok(host2.innerHTML.includes('rdtrack'), 'polar history draws the dotted track');
  // (4) wrapped sector takes the short span; adaptive sampling for wide sectors
  const wrap = C.radarModel({sensor: {x: 160, y: 90}, spread: 360, range: 100,
    zones: [{id: 'w', r: [10, 60], deg: [350, 10]}]},
    {subject: {x: 160 + 40, y: 90}});
  assert.strictEqual(wrap.occupied.join(','), 'w', '[350,10] spans 20° through 0°, containing deg=0');
  const wide = C.radarModel({sensor: {x: 160, y: 90}, spread: 360, range: 80,
    zones: [{id: 'a', r: [10, 70], deg: [0, 360]}]},
    {subject: {x: 160, y: 90 - 69}});
  assert.strictEqual(wide.occupied.join(','), 'a', 'near-outer-edge point stays inside a full annulus');
  const badSector = C.radarModel({zones: [{id: 'b', r: [5, 2], deg: [0, 90]}]}, {});
  assert.strictEqual(badSector.zones.length, 0, 'reversed radii skip the zone');
  // full-turn writings are order-independent; equal endpoints are degenerate
  [[360, 0], [10, -350], [0, 360]].forEach(dd => {
    const full = C.radarModel({sensor: {x: 160, y: 90}, spread: 360, range: 80,
      zones: [{id: 'f', r: [10, 70], deg: dd}]}, {subject: {x: 200, y: 90}});
    assert.strictEqual(full.occupied.join(','), 'f',
      `deg:[${dd}] is a full annulus and contains the subject`);
  });
  const degen = C.radarModel({zones: [{id: 'd', r: [10, 70], deg: [45, 45]}]}, {});
  assert.strictEqual(degen.zones.length, 0, 'equal endpoints skip the zone');
  // (6) fold compaction: >64 marks bake into cells; render identical
  const manySteps = [];
  for (let i = 0; i < 70; i++)
    manySteps.push({panels: {b: {mark: [[i % 8, i % 8, 'buffered']]}}});
  manySteps.push({panels: {b: {mark: [[0, 1, 'protected']]}}});
  const folded = C.foldPanelStates({
    panels: [{id: 'b', type: 'buffer', segments: 8, initial: {}}], steps: manySteps});
  const lastState = folded.b[manySteps.length - 1];
  assert.ok(lastState.mark.length <= 64, 'accumulated ops stay bounded');
  const baked = C.bufferModel({segments: 8}, lastState);
  assert.strictEqual(baked.cells.join(','),
    'protected,protected,buffered,buffered,buffered,buffered,buffered,buffered',
    'compacted history renders identically to full replay');
});

test('validator: radar step-patch checks (subject shape, threshold, alert)', () => {
  const page = C.normalize({nodes: {a: {}}, rows: [['a']], edges: [],
    panels: [{id: 'r', type: 'radar', initial: {subject: {q: 1}}}],
    steps: [{nodes: ['a'], text: 'x',
             panels: {r: {threshold: 'bad', alert: 'yes', subject: {r: 'x', deg: 1}}}}]});
  const {warnings} = C.validate(page);
  assert.ok(warnings.some(w => w.includes('.initial.subject: expected {x, y}')));
  assert.ok(warnings.some(w => w.includes('.panels.r.threshold: must be a positive finite distance')));
  assert.ok(warnings.some(w => w.includes('.panels.r.alert: must be true or false')));
  assert.ok(warnings.some(w => w.includes('.panels.r.subject: expected {x, y}')));
});

test('validator: duplicate from->to edge pairs warn (engine keys by that string)', () => {
  const page = C.normalize({nodes: {a: {}, b: {}}, rows: [['a', 'b']],
    edges: [{from: 'a', to: 'b', label: 'offer'}, {from: 'a', to: 'b', label: 'boot'}],
    steps: [{edge: 'a->b', text: 'x'}]});
  const {warnings} = C.validate(page);
  assert.ok(warnings.some(w => w.includes('duplicate edge "a->b"')),
    'second identical pair warns about the override');
  const ok = C.normalize({nodes: {a: {}, b: {}}, rows: [['a', 'b']],
    edges: [{from: 'a', to: 'b'}, {from: 'b', to: 'a', ret: true}],
    steps: [{edge: 'a->b', text: 'x'}]});
  assert.ok(!C.validate(ok).warnings.some(w => w.includes('duplicate edge')),
    'a return pair in the opposite direction is fine');
});

test('panelOrder: log panels sink to the bottom, relative order preserved', () => {
  const ordered = C.panelOrder([
    {id: 'a', type: 'log'}, {id: 'b', type: 'state'}, {id: 'c', type: 'log'},
    {id: 'd', type: 'gauge'}]);
  assert.strictEqual(ordered.map(p => p.id).join(','), 'b,d,a,c',
    'growing log widgets render last so nothing below them shifts');
  assert.strictEqual(C.panelOrder([]).length, 0);
  assert.strictEqual(C.panelOrder(undefined).length, 0);
});

test('log render: fixed-height body auto-scrolls to the newest lines', () => {
  const plog = {scrollTop: 0, scrollHeight: 400};
  const host = {innerHTML: '', querySelector: sel => sel === '.plog' ? plog : null};
  C.renderPanelBody(host, {id: 'l', type: 'log', tags: {}},
    {log: [{tag: 'A', text: 'one'}, {tag: 'A', text: 'two'}]}, 'aurora');
  assert.strictEqual(plog.scrollTop, 400, 'scrolled to the bottom after rebuild');
});

test('package-drop scene carries courier and package animation anchors', () => {
  assert.ok(C.SCENES['package-drop'].includes('class="courier"'), 'courier group present');
  assert.ok(C.SCENES['package-drop'].includes('class="pkg"'), 'package group present');
  assert.ok(C.SCENES['package-drop'].includes('class="carried"'), 'carried box present');
  assert.ok(C.SCENES['person-at-door-night'].includes('class="walker"'), 'walker untouched');
});

test('renderPanelBody: unchanged state leaves the DOM alone (animations survive steps)', () => {
  const host = {innerHTML: '', querySelector: () => null};
  const panel = {id: 's', type: 'state', states: ['OFF', 'ON'], initial: {}};
  C.renderPanelBody(host, panel, {state: 'ON'}, 'aurora');
  assert.ok(host.innerHTML.includes('ON'), 'first render fills the host');
  host.innerHTML = 'SENTINEL';
  C.renderPanelBody(host, panel, {state: 'ON'}, 'aurora');
  assert.strictEqual(host.innerHTML, 'SENTINEL',
    'identical markup skips the rebuild entirely');
  C.renderPanelBody(host, panel, {state: 'OFF'}, 'aurora');
  assert.ok(host.innerHTML.includes('OFF'), 'changed state still re-renders');
});

test('pir: the step after a trip skips the rebuild (ambient sweep survives)', () => {
  const host = {innerHTML: '', querySelector: () => null};
  const panel = {id: 'p', type: 'pir', sensor: {x: 160, y: 146},
                 cone: {facing: 270, spread: 66, range: 130}};
  C.renderPanelBody(host, panel, {subject: {x: 60, y: 40}}, 'aurora');
  C.renderPanelBody(host, panel, {subject: {x: 135, y: 70}}, 'aurora');
  assert.ok(host.innerHTML.includes('pirripple'), 'trip render carries the one-shot cues');
  assert.ok(host.innerHTML.includes('pirghost'), 'move render carries the ghost');
  host.innerHTML = 'SENTINEL';
  C.renderPanelBody(host, panel, {subject: {x: 135, y: 70}}, 'aurora');
  assert.strictEqual(host.innerHTML, 'SENTINEL',
    'the unchanged step AFTER the trip matches the steady baseline and skips');
});

test('screen widget: live→rec swaps overlays surgically; boot→live rebuilds', () => {
  const box = {
    className: '', _added: '',
    querySelectorAll: () => [],
    insertAdjacentHTML(pos, html){ this._added += html; },
  };
  const host = {innerHTML: '', querySelector: sel => sel === '.screenbox' ? box : null};
  const panel = {id: 'cam', type: 'screen', scene: 'person-at-door-night'};
  C.renderPanelBody(host, panel, {mode: 'boot'}, 'aurora');
  assert.ok(host.innerHTML.includes('m-boot'));
  C.renderPanelBody(host, panel, {mode: 'live'}, 'aurora');
  assert.ok(host.innerHTML.includes('m-live'),
    'boot→live rebuilds (different scene subtree)');
  const liveHTML = host.innerHTML;
  C.renderPanelBody(host, panel, {mode: 'rec'}, 'aurora');
  assert.strictEqual(host.innerHTML, liveHTML,
    'live→rec does NOT reassign innerHTML — the scene subtree survives');
  assert.strictEqual(box.className, 'screenbox m-rec', 'mode class swapped in place');
  assert.ok(box._added.includes('recchip'), 'new overlay inserted surgically');
});

test('foldPanelStates carries thermo values so the sparkline sees every step', () => {
  const d = {
    panels: [{id: 't', type: 'thermo', warn: 75, crit: 95, initial: {value: 28}}],
    steps: [
      {panels: {t: {value: 40}}},
      {}, /* no patch: value carries */
      {panels: {t: {value: 96, label: 'SHUTDOWN'}}},
    ],
  };
  const f = C.foldPanelStates(d);
  assert.strictEqual(f.t[0].value, 40);
  assert.strictEqual(f.t[1].value, 40, 'unpatched step carries the value');
  assert.strictEqual(f.t[2].value, 96);
  assert.strictEqual(f.t[2].label, 'SHUTDOWN');
});

test('foldPanelStates replaces zones/layers arrays wholesale (documented semantics)', () => {
  const d = {
    panels: [{id: 'p', type: 'zoneframe', zones: [], initial: {zones: [{id: 'a', state: 'armed'}]}}],
    steps: [
      {panels: {p: {zones: [{id: 'a', state: 'masked'}]}}},
      {panels: {p: {subject: {x: 1, y: 2}}}},
    ],
  };
  const f = C.foldPanelStates(d);
  assert.strictEqual(f.p[0].zones[0].state, 'masked', 'step patch replaced the array');
  assert.strictEqual(f.p[1].zones[0].state, 'masked', 'array carries forward unchanged');
  assert.deepEqual !== undefined;
  assert.strictEqual(f.p[1].subject.x, 1);
});

test('validator accepts the four new panel types without unknown-type warnings', () => {
  const page = C.normalize({nodes: {a: {}}, rows: [['a']], edges: [],
    panels: [
      {id: 'w', type: 'waterfall', spans: [{id: 's1', label: 'x', ms: 10}]},
      {id: 'o', type: 'orbit', states: ['A', 'B']},
      {id: 'z', type: 'zoneframe', zones: [{id: 'z1', points: [[0,0],[1,0],[1,1]]}]},
      {id: 'x', type: 'xray', layers: [{id: 'l1', label: 'L', holder: 'h'}]},
    ]});
  const v = C.validate(page);
  assert.strictEqual(v.errors.length, 0, v.errors.join('; '));
  assert.ok(!v.warnings.some(w => w.includes('unknown panel type')), v.warnings.join('; '));
});

test('validator warns on waterfall without spans and xray without layers', () => {
  const page = C.normalize({nodes: {a: {}}, rows: [['a']],
    panels: [{id: 'w', type: 'waterfall'}, {id: 'x', type: 'xray'}]});
  const v = C.validate(page);
  assert.ok(v.warnings.some(w => w.includes('panels[0].spans')), v.warnings.join('; '));
  assert.ok(v.warnings.some(w => w.includes('panels[1].layers')), v.warnings.join('; '));
});

test('validator warns on zoneframe zones with too few points, names the index', () => {
  const page = C.normalize({nodes: {a: {}}, rows: [['a']],
    panels: [{id: 'z', type: 'zoneframe', zones: [
      {id: 'ok', points: [[0,0],[1,0],[1,1]]},
      {id: 'bad', points: [[0,0],[1,1]]},
    ]}]});
  const v = C.validate(page);
  assert.ok(v.warnings.some(w => w.includes('zones[1]')), v.warnings.join('; '));
  assert.ok(!v.warnings.some(w => w.includes('zones[0]')), v.warnings.join('; '));
});

test('atlas v2 spec validates with 0 errors and no widget warnings', () => {
  const page = C.normalize(readSpec('examples/doorbell-atlas/atlas.spec.json'));
  const v = C.validate(page);
  assert.strictEqual(v.errors.length, 0, v.errors.join('; '));
  assert.ok(!v.warnings.some(w => w.includes('panel')), v.warnings.join('; '));
  assert.ok(!v.warnings.some(w => w.includes('lane')), v.warnings.join('; '));
});

test('atlas v2 waterfall spans sum to the stated 640 ms budget', () => {
  const page = C.normalize(readSpec('examples/doorbell-atlas/atlas.spec.json'));
  let spans = null;
  const walk = secs => secs.forEach(s => {
    const d = s.diagram;
    (d && d.panels || []).forEach(p => { if (p.type === 'waterfall') spans = p.spans; });
  });
  C.blocksOf(page).forEach(b => b.type === 'tabs' ? b.tabs.forEach(t => walk(t.sections)) : walk([b.sec]));
  assert.ok(spans, 'atlas declares a waterfall');
  assert.strictEqual(C.waterfallModel(spans, null).totalMs, 640);
});

/* ---------------- inline markup + nested bullets ---------------- */

test('inlineMarkup: markdown http(s) links become underlined anchors', () => {
  const out = C.inlineMarkup('see [ssRFMsg_Receive](https://github.com/x/y#L1357) here');
  assert.ok(out.includes('<a class="ilink" href="https://github.com/x/y#L1357" target="_blank" rel="noopener">ssRFMsg_Receive</a>'), out);
  assert.ok(out.startsWith('see ') && out.endsWith(' here'), out);
});

test('inlineMarkup: bold, italic, and code render; snake_case is untouched', () => {
  assert.ok(C.inlineMarkup('a **strong** b').includes('<strong>strong</strong>'));
  assert.ok(C.inlineMarkup('a *soft* b').includes('<em>soft</em>'));
  assert.ok(C.inlineMarkup('call `eventId` now').includes('<code>eventId</code>'));
  // underscores in identifiers must NOT become italics (italic uses *, not _)
  const snake = C.inlineMarkup('SOC_EVENT_TYPE_RECORD and routingPreference');
  assert.ok(!snake.includes('<em>') && snake.includes('SOC_EVENT_TYPE_RECORD'), snake);
});

test('inlineMarkup: plain prose is just escaped, and is XSS-safe', () => {
  assert.strictEqual(C.inlineMarkup('a < b & c > d'), 'a &lt; b &amp; c &gt; d');
  const js = C.inlineMarkup('[click](javascript:alert(1))');           // non-http scheme
  assert.ok(!js.includes('<a '), js);
  const evil = C.inlineMarkup('[<img src=x onerror=alert(1)>](https://ok.example/z)');
  assert.ok(evil.includes('href="https://ok.example/z"'), evil);
  assert.ok(evil.includes('&lt;img') && !evil.includes('<img'), evil);
});

test('bulletsHTML: strings and nested {text, sub} render as nested lists', () => {
  const html = C.bulletsHTML(['flat one', {text: 'parent **bold**', sub: ['child a', 'child b']}]);
  assert.ok(html.includes('<li>flat one</li>'), html);
  assert.ok(html.includes('parent <strong>bold</strong>'), html);
  // nested list appears inside the parent <li>, before its close
  assert.ok(/<li>parent <strong>bold<\/strong><ul class="sec-bullets"><li>child a<\/li><li>child b<\/li><\/ul><\/li>/.test(html), html);
});

test('fragment reveals: visibility is a pure function of mode and target step', () => {
  const f = {revealAt: 2, hideAt: 4};
  assert.strictEqual(C.fragmentVisible(f, 0, false), true, 'ambient always shows fragments');
  assert.strictEqual(C.fragmentVisible(f, 0, true), false);
  assert.strictEqual(C.fragmentVisible(f, 1, true), false);
  assert.strictEqual(C.fragmentVisible(f, 2, true), true, 'revealAt is inclusive');
  assert.strictEqual(C.fragmentVisible(f, 3, true), true);
  assert.strictEqual(C.fragmentVisible(f, 4, true), false, 'hideAt is inclusive');
  assert.strictEqual(C.fragmentVisible({hideAt: 1}, 0, true), true);
  assert.strictEqual(C.fragmentVisible({hideAt: 1}, 1, true), false);
  assert.strictEqual(C.fragmentVisible({revealAt: -1}, 0, true), true, 'invalid indices are ignored');
});

test('fragment reveals: pure HTML builders attach metadata to object bullets and contract rows', () => {
  assert.strictEqual(C.fragmentAttrs({revealAt: 1, hideAt: 3}),
    ' data-dv-fragment="" data-dv-reveal-at="1" data-dv-hide-at="3"');
  assert.strictEqual(C.fragmentAttrs({revealAt: 1.5}), '');
  const bullets = C.bulletsHTML([{text: 'later', revealAt: 1, hideAt: 3}]);
  assert.ok(bullets.includes('<li data-dv-fragment="" data-dv-reveal-at="1" data-dv-hide-at="3">later</li>'), bullets);
  const card = C.contractCardHTML({fields: [{k: 'ttl', revealAt: 2}]});
  assert.ok(card.includes('<tr class="ctrow" data-dv-crow="0" data-dv-fragment="" data-dv-reveal-at="2">'), card);
});

test('fragment reveals: validator covers bad indices, empty intervals, range, and sections without steps', () => {
  const withSteps = C.normalize({sections: [{
    bullets: [{text: 'bad', revealAt: -1}, {text: 'empty', revealAt: 1, hideAt: 1}],
    contract: {fields: [{k: 'x', hideAt: 1.2}]},
    diagram: {nodes: {a: {}, b: {}}, rows: [['a', 'b']],
      edges: [{from: 'a', to: 'b', revealAt: 2}],
      steps: [{edge: 'a->b'}, {edge: 'a->b'}]}
  }]});
  const w = C.validate(withSteps).warnings;
  assert.ok(w.some(x => x.includes('bullets[0].revealAt') && x.includes('non-negative integer')), w.join('; '));
  assert.ok(w.some(x => x.includes('bullets[1].hideAt') && x.includes('greater than revealAt')), w.join('; '));
  assert.ok(w.some(x => x.includes('contract.fields[0].hideAt') && x.includes('non-negative integer')), w.join('; '));
  assert.ok(w.some(x => x.includes('edges[0].revealAt') && x.includes('beyond the diagram step count')), w.join('; '));

  const noSteps = C.normalize({sections: [{bullets: [{text: 'later', revealAt: 0}],
    diagram: {nodes: {a: {}}, rows: [['a']]}}]});
  assert.ok(C.validate(noSteps).warnings.some(x => x.includes('bullets[0].revealAt') && x.includes('require diagram.steps')));
});

/* ---------------- queue panel + message-contract card ---------------- */

test('queue: sparse patches fold to complete state; label carries through held steps', () => {
  const d = {panels: [{id: 'mbx', type: 'queue', initial: {state: 'empty'}}],
             steps: [{panels: {mbx: {state: 'enqueue', label: 'STREAM cmd'}}},
                     {panels: {mbx: {state: 'held'}}},
                     {},
                     {panels: {mbx: {state: 'dequeue'}}},
                     {panels: {mbx: {state: 'empty'}}}]};
  const f = C.foldPanelStates(d).mbx;
  /* joined-string compare: vm-realm arrays fail cross-realm deepStrictEqual */
  assert.strictEqual(f.map(s => s.state).join(','), 'enqueue,held,held,dequeue,empty');
  assert.strictEqual(f[2].label, 'STREAM cmd'); // unpatched step carries both state and label
});

test('queue: model normalizes unknown state tokens to empty', () => {
  assert.strictEqual(C.queueModel({state: 'warp'}).state, 'empty');
  assert.strictEqual(C.queueModel(null).state, 'empty');
  assert.strictEqual(C.queueModel({state: 'held', label: 7}).label, '7');
});

test('queue: render markup reflects state and escapes the label', () => {
  const held = C.queuePanelHTML({}, {state: 'held', label: 'STREAM <cmd>'});
  assert.ok(held.includes('s-held'), held);
  assert.ok(held.includes('STREAM &lt;cmd&gt;'), held);
  const empty = C.queuePanelHTML({}, {state: 'empty'});
  assert.ok(empty.includes('s-empty') && empty.includes('qempty'), empty);
  const deq = C.queuePanelHTML({}, {state: 'dequeue', label: 'x'});
  assert.ok(deq.includes('s-dequeue') && deq.includes('qarr-out'), deq);
});

test('queue: validator knows the type; bad state tokens warn with field paths', () => {
  const page = C.normalize({sections: [{diagram: {
    nodes: {a: {title: 'A'}}, rows: [['a']],
    panels: [{id: 'mbx', type: 'queue', initial: {state: 'weird'}}],
    steps: [{nodes: ['a'], panels: {mbx: {state: 'warp'}}}]}}]});
  const v = C.validate(page);
  assert.strictEqual(v.errors.length, 0, v.errors.join('; '));
  assert.ok(!v.warnings.some(w => w.includes('unknown panel type')), v.warnings.join('; '));
  assert.ok(v.warnings.some(w => w.includes('initial.state') && w.includes('weird')), v.warnings.join('; '));
  assert.ok(v.warnings.some(w => w.includes('steps[0].panels.mbx.state') && w.includes('warp')), v.warnings.join('; '));
});

test('contract card: renders k/v/gloss rows, hot emphasis, permalinks, escaping', () => {
  const h = C.contractCardHTML({title: 'On the wire', source: 'https://x.example/wire',
    fields: [{k: 'type', v: '"motion"', g: 'logical <type>'},
             {k: 'eventId', v: '0x1A2B', hot: true, link: 'https://x.example/f#L1'}],
    note: 'dedup key note'});
  assert.ok(h.includes('cttitle') && h.includes('srcchip') && h.includes('https://x.example/wire'), h);
  assert.ok(h.includes('class="ctrow hot"'), h);
  assert.ok(h.includes('ctlink') && h.includes('https://x.example/f#L1') && h.includes('rel="noopener"'), h);
  assert.ok(h.includes('logical &lt;type&gt;'), h);
  assert.ok(h.includes('ctnote'), h);
});

test('contract card: addressed markup exposes a copy chip and focusable row anchors', () => {
  const h = C.contractCardHTML({fields: [{k: 'event/id'}, {k: 'ttl'}]}, 7);
  assert.ok(h.includes('<div class="ctcard" id="contract-7">'), h);
  assert.ok(h.includes('class="copychip contractcopy"'), h);
  assert.ok(h.includes('class="copyglyph"'), 'chip carries the link glyph, not text: ' + h);
  assert.ok(!h.includes('copy link<'), 'no visible chip text: ' + h);
  assert.ok(h.includes('id="contract-7-row-1" tabindex="-1" aria-label="Contract field event/id"'), h);
  assert.ok(h.includes('id="contract-7-row-2" tabindex="-1" aria-label="Contract field ttl"'), h);
});

test('contract card: heading-slug address is used in card and row anchors', () => {
  const h = C.contractCardHTML({fields: [{k: 'event/id'}]}, 'delivery-contract');
  assert.ok(h.includes('id="contract-delivery-contract"'), h);
  assert.ok(h.includes('id="contract-delivery-contract-row-1"'), h);
});

test('copy control: success swaps to the check glyph, restores, and ignores stale clipboard results', async () => {
  const writes = [], timeouts = [];
  const win = {
    setTimeout(fn, ms){ timeouts.push({fn, ms, cleared: false}); return timeouts.length; },
    clearTimeout(id){ if (timeouts[id - 1]) timeouts[id - 1].cleared = true; },
    navigator: {clipboard: {writeText(text){
      const d = {text};
      d.promise = new Promise((res, rej) => { d.resolve = res; d.reject = rej; });
      writes.push(d);
      return d.promise;
    }}}
  };
  const classes = new Set();
  const button = {
    innerHTML: C.COPY_ICON, parentNode: null, nextSibling: null, listeners: {},
    classList: {
      add(c){ classes.add(c); },
      remove(...cs){ cs.forEach(c => classes.delete(c)); },
      contains(c){ return classes.has(c); }
    },
    addEventListener(type, fn){ this.listeners[type] = fn; }
  };
  C.bindCopyControl(win, button, () => 'https://example.test/#d=flow');

  button.listeners.click();
  assert.strictEqual(writes[0].text, 'https://example.test/#d=flow');
  writes[0].resolve();
  await writes[0].promise;
  assert.strictEqual(button.innerHTML, C.COPY_OK_ICON, 'success shows the check glyph');
  assert.ok(classes.has('ok'));
  assert.strictEqual(timeouts.at(-1).ms, 1200);
  timeouts.at(-1).fn();
  assert.strictEqual(button.innerHTML, C.COPY_ICON, 'feedback restores the link glyph');
  assert.ok(!classes.has('ok') && !classes.has('err'));

  /* two rapid clicks: the older clipboard promise resolving late must not
     overwrite the newer click's feedback or restart its timeout */
  button.listeners.click();
  button.listeners.click();
  writes[2].resolve();
  await writes[2].promise;
  const feedbackTimer = button._dvFeedback;
  assert.strictEqual(button.innerHTML, C.COPY_OK_ICON);
  writes[1].resolve();
  await writes[1].promise;
  assert.strictEqual(button._dvFeedback, feedbackTimer,
    'a stale clipboard result neither re-renders nor restarts the timeout');
});

test('copy control: clipboard denial falls back, and a dead fallback shows the cross glyph', async () => {
  const timeouts = [];
  function parent(){
    return {
      children: [],
      appendChild(el){ this.children.push(el); el.parentNode = this; },
      removeChild(el){ this.children.splice(this.children.indexOf(el), 1); el.parentNode = null; },
      insertBefore(el, next){
        const index = next ? this.children.indexOf(next) : -1;
        if (index < 0) this.children.push(el); else this.children.splice(index, 0, el);
        el.parentNode = this;
      }
    };
  }
  const body = parent(), holder = parent();
  const win = {
    setTimeout(fn, ms){ timeouts.push({fn, ms}); return timeouts.length; },
    clearTimeout(){},
    navigator: {clipboard: {writeText(){ return Promise.reject(new Error('denied')); }}},
    document: {
      body,
      execCommand(){ return false; },
      createElement(tag){
        return {tag, style: {}, parentNode: null,
          setAttribute(){}, focus(){}, select(){}};
      }
    }
  };
  const classes = new Set();
  const button = {
    innerHTML: C.COPY_ICON, parentNode: holder, nextSibling: null, listeners: {},
    classList: {
      add(c){ classes.add(c); },
      remove(...cs){ cs.forEach(c => classes.delete(c)); },
      contains(c){ return classes.has(c); }
    },
    addEventListener(type, fn){ this.listeners[type] = fn; }
  };
  holder.appendChild(button);
  C.bindCopyControl(win, button, () => 'https://example.test/#t=alpha');
  button.listeners.click();
  await new Promise(resolve => setImmediate(resolve));
  assert.strictEqual(button.innerHTML, C.COPY_FAIL_ICON, 'failure shows the cross glyph');
  assert.ok(classes.has('err'));
  assert.strictEqual(timeouts.at(-1).ms, 2400);
  const field = holder.children.find(el => el.tag === 'input');
  assert.ok(field, 'manual copy field appears beside the icon');
  const region = holder.children.find(el => el.tag === 'span');
  assert.ok(region, 'a status live region appears beside the icon');
  assert.strictEqual(region.textContent, 'Copy failed',
    'failure is announced to assistive tech');
  timeouts.at(-1).fn();
  assert.strictEqual(button.innerHTML, C.COPY_ICON);
  assert.ok(!classes.has('err'));
  assert.strictEqual(region.textContent, '', 'announcement clears on restore');
});

test('clipboard fallback reports a false execCommand result and keeps a selected inline URL', () => {
  function parent(){
    return {
      children: [],
      appendChild(el){ this.children.push(el); el.parentNode = this; },
      removeChild(el){ this.children.splice(this.children.indexOf(el), 1); el.parentNode = null; },
      insertBefore(el, next){
        const index = next ? this.children.indexOf(next) : -1;
        if (index < 0) this.children.push(el); else this.children.splice(index, 0, el);
        el.parentNode = this;
      }
    };
  }
  const body = parent(), holder = parent();
  const button = {parentNode: holder, nextSibling: null};
  holder.appendChild(button);
  const made = [];
  const doc = {
    body,
    execCommand(command){ assert.strictEqual(command, 'copy'); return false; },
    createElement(tag){
      const el = {tag, style: {}, parentNode: null, selected: false,
        setAttribute(){}, focus(){ this.focused = true; }, select(){ this.selected = true; }};
      made.push(el);
      return el;
    }
  };
  const copied = C.fallbackCopy({document: doc}, 'https://example.test/#d=flow', button);
  assert.strictEqual(copied, false);
  assert.strictEqual(body.children.length, 0, 'temporary offscreen textarea is removed');
  assert.strictEqual(holder.children.length, 2, 'manual copy field remains beside the chip');
  const field = holder.children[1];
  assert.strictEqual(field.tag, 'input');
  assert.strictEqual(field.value, 'https://example.test/#d=flow');
  assert.strictEqual(field.readOnly, true);
  assert.strictEqual(field.selected, true);
});

test('contract card: rows without k are skipped; absent/invalid contract renders nothing', () => {
  const noK = C.contractCardHTML({fields: [{v: 'orphan-value'}]});
  assert.ok(!noK.includes('orphan-value'), noK);
  assert.strictEqual(C.contractCardHTML(null), '');
  assert.strictEqual(C.contractCardHTML('nope'), '');
  const badLink = C.contractCardHTML({fields: [{k: 'ttl', link: 42}]});
  assert.ok(badLink.includes('ttl') && !badLink.includes('ctlink'), badLink);
});

test('contract card: validator warns on malformed shapes, never errors', () => {
  const page = C.normalize({sections: [
    {heading: 'x', contract: {fields: [{v: 'no-k'}, {k: 'ok', link: 42}]}},
    {heading: 'y', contract: 'nope'},
    {heading: 'z', contract: {title: 'empty'}}]});
  const v = C.validate(page);
  assert.strictEqual(v.errors.length, 0, v.errors.join('; '));
  assert.ok(v.warnings.some(w => w.includes('contract.fields[0].k: required')), v.warnings.join('; '));
  assert.ok(v.warnings.some(w => w.includes('contract.fields[1].link')), v.warnings.join('; '));
  assert.ok(v.warnings.some(w => w.includes('.contract: must be an object')), v.warnings.join('; '));
  assert.ok(v.warnings.some(w => w.includes('contract.fields: required')), v.warnings.join('; '));
});

test('contract card deltas: badges render with semantic row classes and removed text strikes independently', () => {
  const h = C.contractCardHTML({fields: [
    {k: 'newField', delta: 'added'},
    {k: 'oldField', v: 'legacy', delta: 'removed'},
    {k: 'ttl', delta: 'changed'},
  ]});
  assert.ok(h.includes('class="ctrow delta-added"') && h.includes('>added</span>'), h);
  assert.ok(h.includes('class="ctrow delta-removed"') && h.includes('class="ctkey">oldField'), h);
  assert.ok(h.includes('class="ctrow delta-changed"') && h.includes('>changed</span>'), h);
  const css = fs.readFileSync(path.join(ROOT, 'src', 'style.core.css'), 'utf8');
  assert.ok(css.includes('.ctrow.delta-removed .ctkey') && css.includes('text-decoration:line-through'));
});

test('contract card deltas: validator warns on unknown tokens only', () => {
  const page = C.normalize({sections: [{contract: {fields: [
    {k: 'a', delta: 'added'}, {k: 'b', delta: 'changed'},
    {k: 'c', delta: 'removed'}, {k: 'd', delta: 'moved'},
  ]}}]});
  const warnings = C.validate(page).warnings.filter(w => w.includes('.delta'));
  assert.strictEqual(warnings.length, 1, warnings.join('; '));
  assert.ok(warnings[0].includes('moved') && warnings[0].includes('added removed changed'));
});

/* ---------------- edge routing: straight-drop + node avoidance ---------------- */

test('samplePathD: line and cubic samples hit both endpoints', () => {
  const line = C.samplePathD('M 10 20 L 10 120');
  assert.ok(Math.abs(line[0].x - 10) < 0.01 && Math.abs(line[0].y - 20) < 0.01);
  const last = line[line.length - 1];
  assert.ok(Math.abs(last.x - 10) < 0.5 && Math.abs(last.y - 120) < 0.5);
  const cub = C.samplePathD('M 0 0 C 0 50 100 50 100 100');
  assert.ok(Math.abs(cub[0].x) < 0.01);
  const clast = cub[cub.length - 1];
  assert.ok(Math.abs(clast.x - 100) < 0.5 && Math.abs(clast.y - 100) < 0.5);
});

test('straight-drop: x-aligned cross-row pair renders as a vertical line', () => {
  const spec = {nodes: {a: {}, b: {}}, rows: [['a'], ['b']]};
  const L = C.layout(spec);
  const p = C.edgePath({from: 'a', to: 'b'}, L);
  const m = p.match(/^M (\S+) (\S+) L (\S+) (\S+)$/);
  assert.ok(m, 'expected straight line, got: ' + p);
  assert.ok(Math.abs(parseFloat(m[1]) - parseFloat(m[3])) <= 2, p);
});

test('straight-drop intercepts an x-aligned wrap edge (no margin loop)', () => {
  const L = C.layout(LAY_SPEC);          // c = last slot row 0, d = first slot row 1, aligned
  assert.strictEqual(C.isWrap({from: 'c', to: 'd'}, L), true);
  const p = C.edgePath({from: 'c', to: 'd'}, L);
  assert.ok(/^M \S+ \S+ L \S+ \S+$/.test(p), 'aligned wrap should drop straight, got: ' + p);
  const m = p.match(/^M (\S+) \S+ L (\S+) \S+$/);
  assert.ok(Math.abs(parseFloat(m[1]) - parseFloat(m[2])) <= 2, p);
});

test('near-aligned cross-row pair gets a vertical-tangent S, not the wide route', () => {
  // two columns per row, slight misalignment via unequal row widths
  const spec = {nodes: {a: {}, b: {}, c: {}, d: {}, e: {}},
                rows: [['a', 'b', 'c'], ['d', 'e']]};
  const L = C.layout(spec);
  // find a cross-row non-wrap pair within (STRAIGHT_TOL, NEAR_TOL]
  let found = null;
  ['a', 'b', 'c'].forEach(f => ['d', 'e'].forEach(t => {
    const dx = Math.abs(L.pos[f].cx - L.pos[t].cx);
    if (!found && dx > 40 && dx <= 96 && !C.isWrap({from: f, to: t}, L)) found = {f, t};
  }));
  if (!found) return; // layout did not produce such a pair; covered by acceptance tests
  const p = C.edgePath({from: found.f, to: found.t}, L);
  const nums = p.match(/-?\d+(\.\d+)?/g).map(Number);
  // M x0 y0 C c1x c1y c2x c2y x1 y1 — vertical tangents: c1x == x0, c2x == x1
  assert.ok(Math.abs(nums[2] - nums[0]) < 0.01 && Math.abs(nums[4] - nums[6]) < 0.01,
            'expected vertical-tangent S, got: ' + p);
});

test('avoidance: straight drop through a middle card detours around it, leftward preferred', () => {
  const spec = {nodes: {a: {}, m: {}, b: {}}, rows: [['a'], ['m'], ['b']],
                edges: [{from: 'a', to: 'b'}]};
  const L = C.layout(spec);
  const adj = C.edgeAutoAdjust(spec.edges, L);
  const before = C.countPathRectHits(
    C.samplePathD(C.edgePath(spec.edges[0], L, adj[0])),
    [{x: L.pos.m.cx - L.pos.m.w/2 - 3, y: L.pos.m.cy - L.pos.m.h/2 - 3, w: L.pos.m.w + 6, h: L.pos.m.h + 6}]);
  assert.ok(before > 0, 'test premise: undetoured path must cross the middle card');
  C.resolveEdgeAvoidance(spec.edges, L, adj);
  assert.ok(adj[0].avoidMx < 0, 'leftward candidate should win when both sides are clear: ' + adj[0].avoidMx);
  const after = C.countPathRectHits(
    C.samplePathD(C.edgePath(spec.edges[0], L, adj[0])),
    [{x: L.pos.m.cx - L.pos.m.w/2 - 3, y: L.pos.m.cy - L.pos.m.h/2 - 3, w: L.pos.m.w + 6, h: L.pos.m.h + 6}]);
  assert.strictEqual(after, 0);
});

test('avoidance is deterministic: identical inputs give identical adjustments', () => {
  const spec = {nodes: {a: {}, m: {}, b: {}}, rows: [['a'], ['m'], ['b']],
                edges: [{from: 'a', to: 'b'}]};
  const run = () => {
    const L = C.layout(spec);
    const adj = C.edgeAutoAdjust(spec.edges, L);
    C.resolveEdgeAvoidance(spec.edges, L, adj);
    return JSON.stringify(adj);
  };
  assert.strictEqual(run(), run());
});

test('acceptance: atlas Doorbell Moment pulse->herald edge is a straight vertical drop', () => {
  const page = C.normalize(readSpec('examples/doorbell-atlas/atlas.spec.json'));
  let checked = false;
  C.blocksOf(page).forEach(b => {
    if (b.type !== 'tabs') return;
    b.tabs.forEach(t => {
      if (!/doorbell moment/i.test(t.label)) return;
      t.sections.forEach(sec => {
        const d = sec.diagram;
        if (!d) return;
        (d.edges || []).forEach((e, i) => {
          if (!(e.from === 'pulse' && e.to === 'herald')) return;
          const L = C.layout(d);
          const adj = C.edgeAutoAdjust(d.edges, L);
          C.resolveEdgeAvoidance(d.edges, L, adj);
          const p = C.edgePath(e, L, adj[i]);
          const pts = C.samplePathD(p);
          const xs = pts.map(q => q.x);
          const spread = Math.max(...xs) - Math.min(...xs);
          assert.ok(spread <= 8, 'pulse->herald should be vertical, x-spread ' + spread.toFixed(1) + ' path ' + p);
          checked = true;
        });
      });
    });
  });
  assert.ok(checked, 'pulse->herald edge not found on the Doorbell Moment tab');
});

test('acceptance: no edge crosses a foreign node card in any example board', () => {
  ['examples/cumulus/cumulus-page.spec.v2.json',
   'examples/doorbell/doorbell.spec.json',
   'examples/doorbell-atlas/atlas.spec.json'].forEach(specPath => {
    const page = C.normalize(readSpec(specPath));
    const diagrams = [];
    C.blocksOf(page).forEach(b => {
      if (b.type === 'section'){ if (b.sec && b.sec.diagram) diagrams.push(b.sec.diagram); }
      else b.tabs.forEach(t => t.sections.forEach(s => { if (s.diagram) diagrams.push(s.diagram); }));
    });
    diagrams.forEach(d => {
      const L = C.layout(d);
      const adj = C.edgeAutoAdjust(d.edges || [], L);
      C.resolveEdgeAvoidance(d.edges || [], L, adj);
      (d.edges || []).forEach((e, i) => {
        const rects = [];
        Object.keys(L.pos).forEach(id => {
          if (id === e.from || id === e.to) return;
          const p = L.pos[id];
          rects.push({x: p.cx - p.w/2 - 3, y: p.cy - p.h/2 - 3, w: p.w + 6, h: p.h + 6});
        });
        const hits = C.countPathRectHits(C.samplePathD(C.edgePath(e, L, adj[i])), rects);
        assert.strictEqual(hits, 0,
          specPath + ': ' + e.from + '->' + e.to + ' crosses ' + hits + ' foreign card(s)');
      });
    });
  });
});

/* ---------------- queue directional context (from / to / reason) ---------------- */

test('queue context: model passes strings through and drops non-strings', () => {
  const m = C.queueModel({state: 'enqueue', from: 'Relay · MQTT', to: 7, reason: null});
  assert.strictEqual(m.from, 'Relay · MQTT');
  assert.strictEqual(m.to, '');
  assert.strictEqual(m.reason, '');
});

test('queue context: folding carries from/to/reason; reason re-patches alone', () => {
  const d = {panels: [{id: 'mbx', type: 'queue', initial: {state: 'empty'}}],
             steps: [{panels: {mbx: {state: 'enqueue', label: 'STREAM cmd', from: 'Relay · MQTT'}}},
                     {panels: {mbx: {state: 'held', reason: 'wake IRQ raised'}}},
                     {panels: {mbx: {reason: 'booting'}}},
                     {panels: {mbx: {state: 'dequeue', to: '→ Vision HP'}}}]};
  const f = C.foldPanelStates(d).mbx;
  assert.strictEqual(f[1].state, 'held');
  assert.strictEqual(f[2].state, 'held');            // state carries while reason updates
  assert.strictEqual(f[1].reason, 'wake IRQ raised');
  assert.strictEqual(f[2].reason, 'booting');
  assert.strictEqual(f[3].from, 'Relay · MQTT');     // carried, but not rendered at dequeue
});

test('queue context: containers are always reserved; only the state-relevant text renders', () => {
  // Distinctive tokens so a substring match cannot collide with markup/classes.
  const all = {label: 'MSGX', from: 'FROMX <in>', to: 'TOX', reason: 'REASONX'};
  // The qside-in, qside-out, and qreason containers must be present in EVERY
  // state (they reserve fixed height so the panel cannot reflow between steps).
  ['empty', 'enqueue', 'held', 'dequeue'].forEach(function(s){
    const html = C.queuePanelHTML({}, Object.assign({state: s}, all));
    assert.ok(html.includes('qside-in') && html.includes('qside-out') && html.includes('qreason'),
      'reserved containers missing in state ' + s + ': ' + html);
  });
  const enq = C.queuePanelHTML({}, Object.assign({state: 'enqueue'}, all));
  assert.ok(enq.includes('FROMX &lt;in&gt;'), enq);              // from rendered + escaped
  assert.ok(!enq.includes('TOX') && !enq.includes('REASONX'), enq);
  const held = C.queuePanelHTML({}, Object.assign({state: 'held'}, all));
  assert.ok(held.includes('REASONX'), held);                    // reason rendered
  assert.ok(!held.includes('FROMX') && !held.includes('TOX'), held);
  const deq = C.queuePanelHTML({}, Object.assign({state: 'dequeue'}, all));
  assert.ok(deq.includes('TOX'), deq);                          // to rendered
  assert.ok(!deq.includes('FROMX') && !deq.includes('REASONX'), deq);
  const empty = C.queuePanelHTML({}, Object.assign({state: 'empty'}, all));
  assert.ok(!empty.includes('FROMX') && !empty.includes('TOX') && !empty.includes('REASONX'), empty);
});

test('queue context: validator warns on non-string from/to/reason in initial and patches', () => {
  const page = C.normalize({sections: [{diagram: {
    nodes: {a: {title: 'A'}}, rows: [['a']],
    panels: [{id: 'mbx', type: 'queue', initial: {state: 'empty', from: 9}}],
    steps: [{nodes: ['a'], panels: {mbx: {state: 'held', reason: ['not', 'a', 'string'], to: 3}}}]}}]});
  const v = C.validate(page);
  assert.strictEqual(v.errors.length, 0, v.errors.join('; '));
  assert.ok(v.warnings.some(w => w.includes('initial.from: must be a string')), v.warnings.join('; '));
  assert.ok(v.warnings.some(w => w.includes('panels.mbx.reason: must be a string')), v.warnings.join('; '));
  assert.ok(v.warnings.some(w => w.includes('panels.mbx.to: must be a string')), v.warnings.join('; '));
});

test('embed mode: hash parsing reads embed and sk, tolerating other deep-link fields', () => {
  assert.deepStrictEqual(JSON.parse(JSON.stringify(C.embedRequestFromHash('#embed=motion-detection'))),
    {section: 'motion-detection', skin: null});
  assert.deepStrictEqual(JSON.parse(JSON.stringify(C.embedRequestFromHash('embed=2&sk=daylight&m=step&s=3'))),
    {section: '2', skin: 'daylight'});
  assert.strictEqual(C.embedRequestFromHash('#d=motion&m=step'), null);
  assert.strictEqual(C.embedRequestFromHash(''), null);
  assert.strictEqual(C.embedRequestFromHash('#embed='), null);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(C.embedRequestFromHash('#embed=a%20b'))),
    {section: 'a b', skin: null});
  /* malformed escapes in one pair do not kill the request in another */
  assert.deepStrictEqual(JSON.parse(JSON.stringify(C.embedRequestFromHash('#sk=%E0%A4%A&embed=ok'))),
    {section: 'ok', skin: null});
});

test('embed mode: the target resolves by reference slug or 1-based number', () => {
  const ctl = {sections: [
    {number: 1, reference: 'command-delivery'},
    {number: 2, reference: 'motion-detection'},
    {number: 3, reference: 3}
  ]};
  assert.strictEqual(C.embedTargetSection(ctl, 'motion-detection').number, 2);
  assert.strictEqual(C.embedTargetSection(ctl, '1').number, 1);
  assert.strictEqual(C.embedTargetSection(ctl, '3').number, 3); /* heading-less section: numeric ref */
  assert.strictEqual(C.embedTargetSection(ctl, 'nope'), null);
  assert.strictEqual(C.embedTargetSection(null, 'x'), null);
});

test('embed mode: parseHash still ignores the embed and sk keys', () => {
  const st = C.parseHash('#embed=motion&sk=daylight&m=step&s=2');
  assert.strictEqual(st.m, 'step');
  assert.strictEqual(st.s, '2');
  assert.strictEqual('embed' in st, false);
});

test('embed-link chip: diagram sections get it, prose-only sections do not', () => {
  const withDiagram = C.sectionIntroHTML({heading: 'Motion', diagram: {nodes: {}, rows: []}}, 1, 'motion');
  assert.ok(withDiagram.html.includes('embedcopy'), withDiagram.html);
  assert.ok(withDiagram.html.includes('Copy embed link'), 'title present');
  const proseOnly = C.sectionIntroHTML({heading: 'Notes', text: ['x']}, 2, 'notes');
  assert.strictEqual(proseOnly.html.includes('embedcopy'), false);
  /* heading-less diagram sections carry it on the eyebrow row */
  const headless = C.sectionIntroHTML({diagram: {nodes: {}, rows: []}}, 0, 1);
  assert.ok(headless.html.includes('embedcopy'));
});

test('copy control: a chip with a different glyph gets ITS glyph back after feedback', () => {
  /* the embed chip carries a frame glyph — feedback must not swap it
     for the link glyph (regression: restore was hard-coded) */
  const timeouts = [];
  const win = {
    setTimeout(fn, ms){ timeouts.push(fn); return timeouts.length; },
    clearTimeout(){},
    navigator: {clipboard: {writeText(){ return Promise.resolve(); }}}
  };
  const button = {
    innerHTML: '<svg data-glyph="embed"></svg>', parentNode: null, nextSibling: null, listeners: {},
    classList: {add(){}, remove(){}},
    addEventListener(type, fn){ this.listeners[type] = fn; }
  };
  C.bindCopyControl(win, button, () => 'x#embed=y');
  button.listeners.click();
  return Promise.resolve().then(() => {
    assert.strictEqual(button.innerHTML, C.COPY_OK_ICON);
    timeouts.forEach(fn => fn());
    assert.strictEqual(button.innerHTML, '<svg data-glyph="embed"></svg>');
  });
});

test('timeline: parseClock reads every documented duration form and rejects junk', () => {
  assert.strictEqual(C.parseClock('2h'), 7200);
  assert.strictEqual(C.parseClock('1h30m'), 5400);
  assert.strictEqual(C.parseClock('1h 30m'), 5400);
  assert.strictEqual(C.parseClock('90m'), 5400);
  assert.strictEqual(C.parseClock('45s'), 45);
  assert.strictEqual(C.parseClock(90), 5400);      /* bare number = minutes */
  assert.strictEqual(C.parseClock('90'), 5400);
  assert.strictEqual(C.parseClock('soon'), null);
  assert.strictEqual(C.parseClock('1h30x'), null);
  assert.strictEqual(C.parseClock(''), null);
  assert.strictEqual(C.parseClock(null), null);
  assert.strictEqual(C.formatClock(5400), '1h30m');
  assert.strictEqual(C.formatClock(3600), '1h');
  assert.strictEqual(C.formatClock(90), '1m30s');
  assert.strictEqual(C.formatClock(45), '45s');
  assert.strictEqual(C.formatClock(0), '0');
});

test('timeline model: ticks fit the span, beats follow the cadence, now clamps', () => {
  const m = C.timelineModel(
    {span: '6h', cadence: {every: '30m', label: 'heartbeat'},
     events: [{at: '1h30m', label: 'missed', kind: 'alert'}]},
    {now: '2h', events: [{at: '2h', kind: 'ok'}]});
  assert.strictEqual(m.span, 21600);
  assert.strictEqual(m.unit, 3600);              /* 6 hour ticks <= 8 */
  assert.strictEqual(m.ticks.length, 7);         /* 0h .. 6h */
  assert.strictEqual(m.ticks[1].label, '1h');
  assert.strictEqual(m.beats.length, 12);        /* every 30m over 6h */
  assert.strictEqual(m.events.length, 2);        /* declared + state, merged */
  assert.strictEqual(m.events[0].kind, 'alert');
  assert.strictEqual(m.now.label, '2h');
  /* clamp + defaults */
  const c = C.timelineModel({span: '1h'}, {now: '90m'});
  assert.strictEqual(c.now.s, 3600);
  assert.strictEqual(c.beats.length, 0);
  const d = C.timelineModel({}, {});
  assert.strictEqual(d.span, 3600);              /* junk span -> 1h default */
  assert.strictEqual(d.now, null);
  /* junk events skipped, unknown kind -> info */
  const e = C.timelineModel({span: '1h', events: [{at: 'zzz'}, {at: '10m', kind: 'wild'}]}, {});
  assert.strictEqual(e.events.length, 1);
  assert.strictEqual(e.events[0].kind, 'info');
});

test('timeline fold: now replaces per step, events append like log lines', () => {
  const folded = C.foldPanelStates({
    panels: [{id: 'hb', type: 'timeline', span: '3h',
              initial: {now: '0m', events: [{at: '5m', kind: 'ok'}]}}],
    steps: [
      {panels: {hb: {now: '1h'}}},
      {panels: {hb: {now: '2h', events: [{at: '1h30m', label: 'missed', kind: 'alert'}]}}},
      {panels: {hb: {now: '3h'}}}
    ]
  });
  const states = folded.hb;
  assert.strictEqual(states[0].now, '1h');
  assert.strictEqual(JSON.parse(JSON.stringify(states[0].events)).length, 1);
  assert.strictEqual(states[1].now, '2h');
  assert.strictEqual(states[1].events.length, 2);   /* appended */
  assert.strictEqual(states[2].events.length, 2);   /* carried forward */
  assert.strictEqual(states[2].now, '3h');
});

test('timeline renderer: overview strip plus the magnified current interval', () => {
  const host = {innerHTML: '', querySelector: () => null};
  C.renderPanelBody(host, {id: 'hb', type: 'timeline', span: '2h',
    cadence: {every: '30m', label: 'heartbeat'}},
    {now: '1h', events: [{at: '30m', label: 'ok', kind: 'ok'}]}, 'aurora', [], 0, false);
  const h = host.innerHTML;
  assert.ok(h.includes('tlaxis'), 'axis');
  /* 4 overview cadence beats + the 2 detail end beats */
  assert.strictEqual((h.match(/tlbeat/g) || []).length, 6);
  assert.ok(h.includes('tlbeat past'), 'passed beats fill');
  assert.ok(h.includes('tlband'), 'interval band on the overview');
  assert.ok(h.includes('tlzoom'), 'zoom connectors');
  assert.ok(h.includes('tl-ok'), 'event kind class');
  assert.ok(h.includes('tlnow'), 'now cursor');
  assert.ok(h.includes('heartbeat every 30m'), 'meta line');
  assert.ok(h.includes('window 1h–1h30m'), 'window meta: now sits on the 1h beat');
  assert.ok(h.includes('now 1h'), 'meta now');
  /* no cadence -> the single-axis fallback, no detail markup */
  const flat = {innerHTML: '', querySelector: () => null};
  C.renderPanelBody(flat, {id: 'hb', type: 'timeline', span: '2h'},
    {now: '1h'}, 'aurora', [], 0, false);
  assert.ok(!flat.innerHTML.includes('tlband'));
  assert.ok(flat.innerHTML.includes('tltick'), 'fallback keeps tick labels');
});

test('timeline detail window: events BETWEEN long-running beats spread out magnified', () => {
  const m = C.timelineModel(
    {span: '4h', cadence: {every: '1h', label: 'heartbeat'},
     events: [{at: '1h5m', label: 'motion', kind: 'info'},
              {at: '1h40m', label: 'clip up', kind: 'ok'},
              {at: '2h30m', kind: 'ok'}]},
    {now: '1h20m'});
  const d = JSON.parse(JSON.stringify(m.detail));
  assert.strictEqual(d.start, 3600);
  assert.strictEqual(d.end, 7200);
  assert.strictEqual(d.startLabel, '1h');
  assert.strictEqual(d.endLabel, '2h');
  /* only the two between-beat events, repositioned inside the window */
  assert.strictEqual(d.events.length, 2);
  assert.ok(Math.abs(d.events[0].pct - (5 / 60) * 100) < 0.01, 'motion at 5m into the hour');
  assert.ok(Math.abs(d.events[1].pct - (40 / 60) * 100) < 0.01, 'clip at 40m into the hour');
  assert.ok(Math.abs(d.nowPct - (20 / 60) * 100) < 0.01);
  assert.strictEqual(d.startPast, true);
  assert.strictEqual(d.endPast, false);
  assert.ok(d.ticks.length >= 3 && d.ticks.length <= 8, 'interior minor ticks');
  /* no cadence or no now -> no detail */
  assert.strictEqual(C.timelineModel({span: '4h'}, {now: '1h'}).detail, null);
  assert.strictEqual(C.timelineModel({span: '4h', cadence: {every: '1h'}}, {}).detail, null);
  /* now past the last full interval clamps the window to the tail */
  const tail = JSON.parse(JSON.stringify(C.timelineModel(
    {span: '4h', cadence: {every: '1h'}}, {now: '4h'}).detail));
  assert.strictEqual(tail.start, 3 * 3600);
  assert.strictEqual(tail.end, 4 * 3600);
});

test('timeline validator: bad span/cadence/event/patch fields warn with paths', () => {
  const v = C.validate(C.normalize({sections: [{diagram: {
    nodes: {a: {}, b: {}}, rows: [['a', 'b']],
    edges: [{from: 'a', to: 'b'}],
    panels: [{id: 'hb', type: 'timeline', span: 'whenever',
              cadence: {every: 'sometimes'},
              events: [{at: 'later'}, {at: '5m', kind: 'odd'}]}],
    steps: [{edge: 'a->b', panels: {hb: {now: 'nope', events: 'not-a-list'}}}]
  }}]}));
  const w = JSON.parse(JSON.stringify(v.warnings)).join('\n');
  assert.match(w, /span: unreadable span "whenever"/);
  assert.match(w, /cadence: expected \{every/);
  assert.match(w, /events\[0\]\.at: unreadable time/);
  assert.match(w, /events\[1\]\.kind: unknown kind "odd"/);
  assert.match(w, /now: unreadable time "nope"/);
  assert.match(w, /events: expected an array/);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(v.errors)), []);
});

test('timeline regressions: seeded events survive step-less specs, junk now keeps the cursor, dense cadences report instead of truncating', () => {
  /* M1: no steps — initial.events must reach the only snapshot */
  const still = C.foldPanelStates({
    panels: [{id: 'hb', type: 'timeline', span: '2h',
              initial: {now: '30m', events: [{at: '15m', kind: 'ok'}]}}],
    steps: []
  });
  assert.strictEqual(still.hb.length, 1);
  assert.strictEqual(JSON.parse(JSON.stringify(still.hb[0].events)).length, 1);
  assert.strictEqual(still.hb[0].now, '30m');

  /* M2: an unreadable now patch leaves the carried cursor unchanged */
  const kept = C.foldPanelStates({
    panels: [{id: 'hb', type: 'timeline', span: '2h', initial: {now: '30m'}}],
    steps: [{panels: {hb: {now: 'garbage'}}}, {panels: {hb: {now: '1h'}}}]
  });
  assert.strictEqual(kept.hb[0].now, '30m');
  assert.strictEqual(kept.hb[1].now, '1h');

  /* M3: 48h at 1m = 2880 beats — none drawn, count reported */
  const dense = C.timelineModel({span: '48h', cadence: {every: '1m'}}, {});
  assert.strictEqual(dense.beats.length, 0);
  assert.strictEqual(dense.beatsOmitted, 2880);
  const host = {innerHTML: '', querySelector: () => null};
  C.renderPanelBody(host, {id: 'hb', type: 'timeline', span: '48h',
    cadence: {every: '1m', label: 'tick'}}, {}, 'aurora', [], 0, false);
  assert.ok(host.innerHTML.includes('2880 beats — too dense to draw'));
  /* and the validator warns at declaration time */
  const v = C.validate(C.normalize({sections: [{diagram: {
    nodes: {a: {}, b: {}}, rows: [['a', 'b']], edges: [{from: 'a', to: 'b'}],
    panels: [{id: 'hb', type: 'timeline', span: '48h', cadence: {every: '1m'}}],
    steps: [{edge: 'a->b'}]
  }}]}));
  assert.match(JSON.parse(JSON.stringify(v.warnings)).join('\n'),
    /2880 beats over this span cannot be drawn individually/);

  /* MINOR: rounding must carry, never print 60s */
  assert.strictEqual(C.formatClock(59.6), '1m');
  assert.strictEqual(C.formatClock(3599.7), '1h');
});

test('timeline bounds: overflowing durations parse to null; absurd spans clamp and terminate', () => {
  /* 320 digits of hours overflows a double to Infinity — must be null,
     never an infinite tick loop */
  assert.strictEqual(C.parseClock('1'.repeat(320) + 'h'), null);
  assert.strictEqual(C.parseClock(Number.MAX_VALUE), null);       /* *60 overflows */
  const big = C.timelineModel({span: '99999h'}, {now: '1h'});      /* ~11 years */
  assert.strictEqual(big.span, 7 * 86400);                        /* clamped to 7d */
  assert.ok(big.ticks.length <= 12, 'tick array bounded');
  assert.strictEqual(big.ticks[big.ticks.length - 1].label, '7d'.replace('7d', C.formatClock(7 * 86400)));
  const v = C.validate(C.normalize({sections: [{diagram: {
    nodes: {a: {}, b: {}}, rows: [['a', 'b']], edges: [{from: 'a', to: 'b'}],
    panels: [{id: 'hb', type: 'timeline', span: '99999h'}],
    steps: [{edge: 'a->b'}]
  }}]}));
  assert.match(JSON.parse(JSON.stringify(v.warnings)).join('\n'),
    /span: longer than the drawable maximum \(7d\) — clamped to 7d/);
});

test('timeline density warning judges the CLAMPED span the model draws', () => {
  /* 30d at 3h: unclamped 240 beats would warn, but the model clamps to
     7d = 56 beats and draws them — no warning is correct */
  const v = C.validate(C.normalize({sections: [{diagram: {
    nodes: {a: {}, b: {}}, rows: [['a', 'b']], edges: [{from: 'a', to: 'b'}],
    panels: [{id: 'hb', type: 'timeline', span: '720h', cadence: {every: '3h'}}],
    steps: [{edge: 'a->b'}]
  }}]}));
  const w = JSON.parse(JSON.stringify(v.warnings)).join('\n');
  assert.ok(!/cannot be drawn individually/.test(w), w);
  assert.match(w, /clamped to 7d/);
  assert.strictEqual(C.timelineModel({span: '720h', cadence: {every: '3h'}}, {}).beats.length, 56);
});

test('timeline labels: close events stagger to a second row, a third collision drops to hover-only', () => {
  const m = C.timelineModel(
    {span: '4h', cadence: {every: '1h'},
     events: [{at: '1h12m', label: 'motion', kind: 'info'},
              {at: '1h14m', label: 'clip up', kind: 'ok'},
              {at: '1h15m', label: 'third here', kind: 'info'},
              {at: '1h50m', label: 'late', kind: 'ok'}]},
    {now: '1h20m'});
  const d = JSON.parse(JSON.stringify(m.detail.events));
  assert.strictEqual(d[0].labelRow, 0, 'first label on the near row');
  assert.strictEqual(d[1].labelRow, 1, 'overlapping neighbor staggers up');
  assert.strictEqual(d[2].labelRow, null, 'third collision keeps only the hover title');
  assert.strictEqual(d[3].labelRow, 0, 'a distant label returns to the near row');
  /* renderer: staggered baselines present, dropped label absent */
  const host = {innerHTML: '', querySelector: () => null};
  C.renderPanelBody(host, {id: 'tl', type: 'timeline', span: '4h',
    cadence: {every: '1h'},
    events: [{at: '1h12m', label: 'motion', kind: 'info'},
             {at: '1h14m', label: 'clip up', kind: 'ok'},
             {at: '1h15m', label: 'third here', kind: 'info'}]},
    {now: '1h20m'}, 'aurora', [], 0, false);
  const h = host.innerHTML;
  assert.ok(h.includes('y="43"') && h.includes('y="32"'), 'two label baselines');
  assert.ok(!h.includes('>third here<'), 'collided label not drawn');
  assert.ok(h.includes('third here'), 'its hover title remains');
});

test('timeline labels: the drawn text matches the measured text — long labels truncate', () => {
  const m = C.timelineModel(
    {span: '2h', cadence: {every: '1h'},
     events: [{at: '20m', label: 'a very long label that keeps going on', kind: 'info'},
              {at: '40m', label: 'neighbor', kind: 'ok'}]},
    {now: '30m'});
  const evs = JSON.parse(JSON.stringify(m.detail.events));
  assert.strictEqual(evs[0].labelText, 'a very long label tha…');
  assert.strictEqual(evs[0].labelText.length, 22);
  /* the truncated (not the full) width drives collision: the neighbor
     at 40m clears row 0's real occupied end and stays measurable */
  assert.strictEqual(typeof evs[1].labelRow, 'number');
  const host = {innerHTML: '', querySelector: () => null};
  C.renderPanelBody(host, {id: 'tl', type: 'timeline', span: '2h',
    cadence: {every: '1h'},
    events: [{at: '20m', label: 'a very long label that keeps going on', kind: 'info'}]},
    {now: '30m'}, 'aurora', [], 0, false);
  const h = host.innerHTML;
  assert.ok(h.includes('a very long label tha…</text>'), 'truncated text drawn');
  assert.ok(h.includes('a very long label that keeps going on</title>'), 'full text in the hover title');
  assert.ok(!h.includes('keeps going on</text>'), 'full text never drawn as a label');
});
