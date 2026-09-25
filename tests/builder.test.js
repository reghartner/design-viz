'use strict';
const {readSource, entrypoint} = require('../tools/source-loader.cjs');

/* Tests for assembled editor behavior and inspector/read-model helpers. Pure
   command and source suites load only their corresponding workbench leaves.
   Run: node --test tests/   (zero npm dependencies) */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function loadBuilder(extraGlobals){
  const code = entrypoint('workbench').body;
  const sandbox = {console};
  vm.runInNewContext(code, sandbox);
  // This utility harness deliberately tests the no-clock-parser fallback.
  sandbox.parseClock = undefined;
  if (extraGlobals) Object.assign(sandbox, extraGlobals);
  return sandbox;
}
const B = loadBuilder();

/* vm-created arrays/objects have foreign prototypes; normalize before
   deepStrictEqual (same pattern as tests/engine.test.js) */
function plain(v){ return JSON.parse(JSON.stringify(v)); }

/* a small page spec used across the locator and planner tests */
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

test('service binding seeds only a blank title with one surgical plan', () => {
  const binding = {entityRef:'component:default/recording',label:'Recording service'};
  for (const title of [undefined,null,'','  \n ', 'Authored title']){
    const raw = structuredClone(SPEC), node = raw.page.blocks[0].diagram.nodes.a;
    if (title === undefined) delete node.title; else node.title = title;
    const text = JSON.stringify(raw,null,2).replace('"title": "T"','"title"  :  "T"');
    const before = JSON.stringify(raw);
    const plan = B.planBindNodeService(text,raw,0,'a',binding);
    assert.ok(!plan.error,plan.error);
    const next = JSON.parse(plan.text).page.blocks[0].diagram.nodes.a;
    assert.deepStrictEqual(next.binding,binding);
    assert.equal(next.title,title === 'Authored title' ? title : binding.label);
    assert.ok(plan.text.includes('"title"  :  "T"'),'unrelated source formatting stays intact');
    assert.equal(JSON.stringify(raw),before,'raw input is immutable');
    const cleared = B.planBindNodeService(plan.text,JSON.parse(plan.text),0,'a',null);
    const unbound = JSON.parse(cleared.text).page.blocks[0].diagram.nodes.a;
    assert.equal(unbound.title,next.title);assert.ok(!('binding' in unbound));
  }
  const raw = structuredClone(SPEC);delete raw.page.blocks[0].diagram.nodes.a.title;
  const noLabel = {entityRef:binding.entityRef};
  const fallback = B.planBindNodeService(JSON.stringify(raw),raw,0,'a',noLabel);
  assert.equal(JSON.parse(fallback.text).page.blocks[0].diagram.nodes.a.title,binding.entityRef);
  assert.ok(B.planBindNodeService(TEXT,SPEC,0,'missing',binding).error);
});

test('every insert result and every guide entry stays render-ready', () => {
  /* all planner outputs must parse — a splice that corrupts the editor text
     would be worse than no builder at all */
  for (const plan of [B.planAddNode(TEXT, SPEC, 0), B.planAddEdge(TEXT, SPEC, 0),
                      B.planAddStep(TEXT, SPEC, 0), B.planAddPanel(TEXT, SPEC, 1),
                      B.planAddSection(TEXT, SPEC)]){
    assert.ok(!plan.error, plan.error);
    JSON.parse(plan.text);
    assert.ok(plan.end > plan.start);
  }
  for (const kind of ['group', 'node', 'edge', 'step', 'panel', 'section']){
    const g = B.BUILDER_GUIDES[kind];
    assert.ok(g.title && g.how && g.fields.length >= (kind === 'group' ? 3 : 4),
      kind + ' guide is filled in');
  }
});

/* ================= pass 2: field edits, renames, deletes, reorders ======= */

/* a richer section for the cascade tests: stack rows, a float, a group of
   edges sharing a node, multi-edge steps, panel patches */
const RICH = {
  page: {
    blocks: [
      {heading: 'Rich',
       diagram: {
         nodes: {a: {title: 'A'}, b: {title: 'B'}, c: {title: 'C'}, f: {title: 'F'}},
         rows: [['a', ['b', 'c']]],
         floats: [{id: 'f', side: 'above'}],
         edges: [
           {from: 'a', to: 'b', kind: 'int', label: 'one'},
           {from: 'a', to: 'c', kind: 'mqtt'},
           {from: 'b', to: 'a', kind: 'int', ret: true},
           {from: 'a', to: 'f', kind: 'int'}
         ],
         panels: [{id: 'q', type: 'queue', initial: {state: 'empty'}},
                  {id: 'g', type: 'gauge', unit: 'mA', max: 10, initial: {value: 1}}],
         steps: [
           {edge: 'a->b', text: 's1', panels: {q: {state: 'enqueue', label: 'm'}}},
           {edges: ['a->c', 'b->a'], text: 's2', nodes: ['f'],
            panels: {q: {state: 'empty'}, g: {value: 5}}},
           {edge: 'a->f', text: 's3'}
         ]
       }}
    ]
  }
};
const RICH_TEXT = JSON.stringify(RICH, null, 2);

const GROUPED = {
  page: {blocks: [{heading: 'Groups', diagram: {
    nodes: {
      a: {title: 'A', group: 'dev'},
      b: {title: 'B', group: 'dev'},
      c: {title: 'C', group: 'orphan'},
      d: {title: 'D'}
    },
    rows: [['a', 'b', 'c', 'd']],
    groups: {dev: {title: 'Device'}, spare: {title: 'Spare'}}
  }}]}
};
const GROUPED_TEXT = JSON.stringify(GROUPED, null, 2);

/* ================= pass 3: direct manipulation ================= */

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
const PROSE_TEXT = JSON.stringify(PROSE, null, 2);

/* ================= pass 4: insert palettes ================= */

function loadValidator(){
  const code = readSource('validator.js');
  const sandbox = {console};
  vm.runInNewContext(code, sandbox);
  return sandbox;
}
const V = loadValidator();

test('starter specs parse and validate with zero errors and warnings', () => {
  for (const source of ['starters/minimal.json', 'starters/panels-tour.json', 'flowview.demo.json']){
    const spec = JSON.parse(readSource(source));
    const result = V.validate(V.normalize(spec));
    assert.deepStrictEqual(plain(result.errors), [], source);
    assert.deepStrictEqual(plain(result.warnings), [], source);
  }
});

test('starterCountLine totals all sections and tabs, skipping prose-only sections', () => {
  assert.strictEqual(B.starterCountLine(SPEC), '4 nodes · 1 step · 1 panel');
  assert.strictEqual(B.starterCountLine({sections: SPEC.page.blocks}), '4 nodes · 1 step · 1 panel');
  assert.strictEqual(B.starterCountLine(SPEC.page.blocks[0].diagram), '2 nodes · 1 step · 0 panels');
  assert.strictEqual(B.starterCountLine({}), '0 nodes · 0 steps · 0 panels');
});

test('starter scaffolds have the promised nodes, steps, panels and timeline lanes', () => {
  const minimal = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/starters/minimal.json'), 'utf8'));
  assert.strictEqual(B.starterCountLine(minimal), '3 nodes · 2 steps · 0 panels');
  assert.strictEqual(minimal.page.sections.length, 1);
  assert.strictEqual(minimal.page.sections[0].diagram.rows.length, 1);
  assert.strictEqual(minimal.page.sections[0].diagram.edges.length, 2);
  const tour = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/starters/panels-tour.json'), 'utf8'));
  assert.strictEqual(B.starterCountLine(tour), '3 nodes · 4 steps · 5 panels');
  const d = tour.page.sections[0].diagram;
  assert.deepStrictEqual(d.panels.map(p => p.type), ['state', 'leds', 'gauge', 'log', 'timeline']);
  for (const panel of d.panels){
    assert.ok(panel.initial, panel.id);
    assert.ok(d.steps.some(step => step.panels && step.panels[panel.id]), panel.id);
  }
  assert.strictEqual(d.panels[4].lanes.length, 2);
  assert.ok(d.panels[4].lanes.every(lane => lane.id && lane.label && lane.every));
});

/* ================= pass 5: durability ================= */


/* ================= pass 6: clickable validation findings ================= */

test('parseValidationPath reads validator field paths and rejects pathless prose', () => {
  assert.deepStrictEqual(plain(B.parseValidationPath(
    'blocks[0].tabs[1].sections[0].diagram.edges[3].kind: unknown kind "x"')),
    ['blocks', 0, 'tabs', 1, 'sections', 0, 'diagram', 'edges', 3, 'kind']);
  assert.deepStrictEqual(plain(B.parseValidationPath('warn sections[2].heading: too long')),
    ['sections', 2, 'heading']);
  assert.deepStrictEqual(plain(B.parseValidationPath('ERROR page: must be an object')), ['page']);
  assert.deepStrictEqual(plain(B.parseValidationPath('blocks[0].diagram.nodes.d2.icon: bad')),
    ['blocks', 0, 'diagram', 'nodes', 'd2', 'icon']);
  assert.strictEqual(B.parseValidationPath('JSON parse: Unexpected token'), null);
  assert.strictEqual(B.parseValidationPath('no colon here'), null);
});

test('findingLocation maps page-prefixed findings onto the wrapped page, not page.page', () => {
  /* validator messages like "page.skin: unknown skin" address the page
     object itself (Codex cycle-1 MAJOR: the old mapping doubled the
     wrapper and selected the whole page object for wrapped specs) */
  const spec = {page: {title: 'T', skin: 'bogus', blocks: [{heading: 'H'}]}};
  const text = JSON.stringify(spec, null, 2);
  const skin = B.findingLocation(text, spec, 'page.skin: unknown skin "bogus"');
  assert.ok(skin.exact);
  assert.strictEqual(JSON.parse(text.slice(skin.start, skin.end)), 'bogus');
  /* page.blocks missing entirely: selects the page object, not exact */
  const noBlocks = {page: {title: 'T'}};
  const nbText = JSON.stringify(noBlocks, null, 2);
  const nb = B.findingLocation(nbText, noBlocks, 'page.blocks: required');
  assert.ok(!nb.exact);
  assert.deepStrictEqual(JSON.parse(nbText.slice(nb.start, nb.end)), {title: 'T'});
  /* unwrapped alias page: page-prefixed finding lands on the field */
  const alias = {skin: 'bogus', sections: [{heading: 'H'}]};
  const aText = JSON.stringify(alias, null, 2);
  const a = B.findingLocation(aText, alias, 'page.skin: unknown skin "bogus"');
  assert.strictEqual(JSON.parse(aText.slice(a.start, a.end)), 'bogus');
});

test('findingLocation resolves author ids that contain dots via longest-key match', () => {
  const spec = {page: {blocks: [{heading: 'H', diagram: {
    nodes: {'svc.api.v2': {title: 'A', icon: 'gear'}, plain: {title: 'P'}},
    rows: [['svc.api.v2', 'plain']],
    edges: [{from: 'svc.api.v2', to: 'plain'}]}}]}};
  const text = JSON.stringify(spec, null, 2);
  const hit = B.findingLocation(text, spec,
    'blocks[0].diagram.nodes.svc.api.v2.icon: unknown icon "x"');
  assert.ok(hit.exact);
  assert.strictEqual(JSON.parse(text.slice(hit.start, hit.end)), 'gear');
});

test('findingLocation selects the exact field and falls back to the nearest parent', () => {
  const exact = B.findingLocation(TEXT, SPEC,
    'blocks[0].diagram.edges[0].kind: unknown kind "x"');
  assert.ok(exact.exact);
  assert.strictEqual(JSON.parse(TEXT.slice(exact.start, exact.end)), 'int');

  /* leaf absent in the text (validator warns about a default) -> parent */
  const parent = B.findingLocation(TEXT, SPEC,
    'blocks[0].diagram.edges[0].bend: must be a number');
  assert.ok(!parent.exact);
  assert.deepStrictEqual(JSON.parse(TEXT.slice(parent.start, parent.end)),
    SPEC.page.blocks[0].diagram.edges[0]);

  const bare = {nodes: {a: {title: 'A'}}, rows: [['a']]};
  const bareText = JSON.stringify(bare, null, 2);
  const b = B.findingLocation(bareText, bare, 'sections[0].diagram.nodes.a.icon: unknown icon');
  assert.ok(!b.exact); /* icon absent -> node object */
  assert.deepStrictEqual(JSON.parse(bareText.slice(b.start, b.end)), {title: 'A'});

  assert.strictEqual(B.findingLocation(TEXT, SPEC, 'JSON parse: nope'), null);
});

/* ================= tab management ================= */

/* ================= step contract editing ================= */

/* ================= panel setup field table ================= */


test('PANEL_PATCH_FIELDS covers all 20 panel types with supported kinds and nonempty enums', () => {
  assert.deepStrictEqual(Object.keys(B.PANEL_PATCH_FIELDS).sort(), [...V.PANEL_TYPES].sort());
  const kinds = new Set(['text', 'num', 'bool', 'enum', 'clock', 'json', 'jsonArr', 'jsonAny', 'objf']);
  for (const fields of Object.values(B.PANEL_PATCH_FIELDS)){
    for (const [key, kind, extra] of fields){
      assert.ok(typeof key === 'string' && key.length);
      assert.ok(kinds.has(kind), kind);
      if (kind === 'enum') assert.ok(Array.isArray(extra) && extra.length > 0);
    }
  }
  const expected = {
    state: ['state'], leds: [], gauge: ['value'], log: ['log'], screen: ['mode', 'scenePlayback', 'banner', 'reason', 'audio', 'spotlight'],
    waterfall: ['reveal', 'highlight', 'total'], orbit: ['state', 'via'],
    zoneframe: ['zones', 'subject', 'verdict'], xray: ['layers', 'hop'],
    queue: ['state', 'label', 'from', 'to', 'reason'],
    thermo: ['value', 'label'], battery: ['charge', 'trend', 'source', 'cold', 'note', 'label'],
    buffer: ['cells', 'mark', 'head', 'note', 'label'], radar: ['subject', 'threshold', 'alert', 'status', 'banner'],
    signal: [], tiles: [], inflight: ['start', 'end', 'mark'], phone: ['clock', 'date', 'notify', 'clear', 'audio'],
    timeline: ['now', 'events', 'miss']
  };
  for (const [type, keys] of Object.entries(expected))
    assert.deepStrictEqual(plain(B.PANEL_PATCH_FIELDS[type].map(f => f[0])), keys);
});


test('PANEL_SETUP_FIELDS covers exactly the engine panel types with known control kinds', () => {
  assert.deepStrictEqual(Object.keys(B.PANEL_SETUP_FIELDS).sort(), [...V.PANEL_TYPES].sort());
  const kinds = new Set(['text', 'num', 'csv', 'scene', 'image', 'json', 'jsonArr', 'jsonAny',
                         'clock', 'rows', 'map', 'objf']);
  for (const [type, fields] of Object.entries(B.PANEL_SETUP_FIELDS)){
    assert.ok(fields.length >= 1, type);
    for (const [key, kind] of fields){
      assert.ok(typeof key === 'string' && key.length, type + '.' + key);
      assert.ok(kinds.has(kind), type + '.' + key + ' kind ' + kind);
    }
    /* Static reference images have no time-varying state. */
    if (type !== 'image') assert.ok(fields.some(f => f[0] === 'initial'), type + ' exposes initial');
  }
});

test('every key the palette starter templates carry has a setup control', () => {
  for (const [type, tpl] of Object.entries(B.PANEL_TEMPLATES)){
    const declared = new Set((B.PANEL_SETUP_FIELDS[type] || []).map(f => f[0]));
    for (const key of Object.keys(tpl)){
      if (key === 'title') continue; /* title has its own fixed row */
      assert.ok(declared.has(key), type + ' template key "' + key + '" lacks a setup control');
    }
  }
});

test('the timeline palette starter renders a validator-clean heartbeat setup', () => {
  const plan = B.planAddPanel(TEXT, SPEC, 0, 'timeline');
  const d = JSON.parse(plan.text).page.blocks[0].diagram;
  assert.strictEqual(d.panels[0].type, 'timeline');
  assert.strictEqual(d.panels[0].span, '6h');
  assert.deepStrictEqual(d.panels[0].cadence, {every: '30m', label: 'heartbeat'});
  const v = V.validate(V.normalize(plain(JSON.parse(plan.text))));
  assert.deepStrictEqual(plain(v.errors), []);
  assert.deepStrictEqual(plain(v.warnings), []);
});

/* ---------------- collapsible editor sections: persisted prefs ---------------- */

test('builderSectionPrefs defaults to everything open on missing/garbage input', () => {
  for (const raw of [null, undefined, '', 'not json', '42', '"str"', '[]']){
    assert.deepStrictEqual(plain(B.builderSectionPrefs(raw)), {insert: true, source: true});
  }
});

test('builderSectionPrefs honors stored booleans and ignores everything else', () => {
  assert.deepStrictEqual(plain(B.builderSectionPrefs('{"insert":false,"source":false}')),
    {insert: false, source: false});
  assert.deepStrictEqual(plain(B.builderSectionPrefs('{"source":false}')),
    {insert: true, source: false});
  /* non-boolean values and unknown keys fall back to open */
  assert.deepStrictEqual(plain(B.builderSectionPrefs('{"insert":"no","source":1,"extra":true}')),
    {insert: true, source: true});
});

/* ---------------- typed panel setup editors: pure collectors ---------------- */


test('every PANEL_SETUP_FIELDS entry uses a known control kind with a sane shape', () => {
  const known = ['text', 'num', 'csv', 'scene', 'image', 'json', 'jsonArr', 'jsonAny',
                 'clock', 'rows', 'map', 'objf'];
  Object.keys(B.PANEL_SETUP_FIELDS).forEach(type => {
    B.PANEL_SETUP_FIELDS[type].forEach(f => {
      assert.ok(known.includes(f[1]), type + '.' + f[0] + ' kind ' + f[1]);
      if (f[1] === 'rows' || f[1] === 'objf'){
        assert.ok(Array.isArray(f[2].cols) && f[2].cols.length, type + '.' + f[0] + ' needs cols');
        f[2].cols.forEach(c => assert.ok(typeof c.k === 'string' && c.k, type + '.' + f[0] + ' col key'));
      }
    });
    const last = B.PANEL_SETUP_FIELDS[type][B.PANEL_SETUP_FIELDS[type].length - 1];
    if (type !== 'image') assert.strictEqual(last[0], 'initial', type + ' ends with initial');
  });
});

/* ---------------- reordering: swap planners ---------------- */

/* ================= Mermaid import ================= */
const MERMAID_SEQ = 'sequenceDiagram\nparticipant A as Alpha Svc\nparticipant B\n' +
  'A->>B: POST /things\nB-->>A: created\n';


/* Minimal event DOM: exercise the real import/history/mode handlers without a browser. */
function importHarness(ctl, boardSpec, extraGlobals){
  const scheduled = [], cancelled = [];
  const elements = {}, listeners = {}, windowListeners = {}, doc = {activeElement: null};
  function element(tag = 'div', id = ''){
    const attrs = {}, handlers = {};
    const el = {tagName: tag.toUpperCase(), id, className: '', children: [], style: {},
      value: '', hidden: false, disabled: false, textContent: '',
      addEventListener(type, fn){ (handlers[type] ||= []).push(fn); },
      removeEventListener(type,fn){handlers[type]=(handlers[type] || []).filter(f=>f!==fn);},
      appendChild(child){ this.children.push(child); child.parentNode = this; return child; },
      append(...children){ children.forEach(child=>this.appendChild(child)); },
      replaceChildren(...children){ this.children.forEach(child=>child.parentNode=null);this.children=[];this.append(...children); },
      setAttribute(k, v){ if (k === 'class') this.className = String(v); else attrs[k] = String(v); },
      removeAttribute(k){ delete attrs[k]; },
      get firstChild(){ return this.children[0] || null; },
      get options(){ return this.children; },
      removeChild(child){ child.remove(); child.parentNode = null; },
      cloneNode(deep){
        const clone = element(tag);
        clone.className = this.className;
        for (const [k, v] of Object.entries(attrs)) clone.setAttribute(k, v);
        if (deep) for (const child of this.children) clone.appendChild(child.cloneNode(true));
        return clone;
      },
      getAttribute(k){ return attrs[k] ?? null; },
      hasAttribute(k){ return Object.hasOwn(attrs, k); },
      remove(){ if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(c => c !== this); },
      focus(){ doc.activeElement = this; },
      setSelectionRange(start,end){ this.selectionStart=start; this.selectionEnd=end; },
      contains(child){ return child === this || this.children.some(c => c.contains(child)); },
      matches(selector){
        if (selector === ':disabled') return !!this.disabled;
        if (selector.includes(',')) return selector.split(',').some(s => this.matches(s.trim()));
        if (selector.startsWith('#')) return this.id === selector.slice(1);
        const tagMatch = selector.match(/^[a-z]+/i);
        if (tagMatch && this.tagName.toLowerCase() !== tagMatch[0]) return false;
        for (const [, cls] of selector.matchAll(/\.([a-zA-Z0-9_-]+)/g))
          if (!this.className.split(' ').includes(cls)) return false;
        for (const [, key, value] of selector.matchAll(/\[([^=\]]+)(?:="([^"]*)")?\]/g))
          if (value === undefined ? !this.hasAttribute(key) : this.getAttribute(key) !== value) return false;
        return true;
      },
      closest(selectors){
        for (let at = this; at; at = at.parentNode){
          if (selectors.split(',').some(s => at.matches(s.trim()))) return at;
        }
        return null;
      },
      querySelectorAll(selector){
        return this.children.flatMap(c => [...(c.matches(selector) ? [c] : []), ...c.querySelectorAll(selector)]);
      },
      querySelector(selector){ return this.querySelectorAll(selector)[0] || null; },
      fire(type, props = {}){
        const ev = {target: this, key: '', preventDefault(){ this.defaultPrevented = true; },
          stopPropagation(){ this.stopped = true; }, ...props};
        for (const rec of listeners[type] || []) if (rec.capture) rec.fn(ev);
        if (!ev.stopped){
          for (let at = this; at; at = at.parentNode) for (const fn of at.handlers[type] || []) fn(ev);
          for (const rec of listeners[type] || []) if (!rec.capture) rec.fn(ev);
        }
        return ev;
      }, handlers
    };
    el.classList = {
      add(...cs){ el.className += ' ' + cs.join(' '); },
      remove(...cs){ el.className = el.className.split(' ').filter(x => !cs.includes(x)).join(' '); },
      contains(c){ return el.className.split(' ').includes(c); },
      toggle(c,force){const on=force===undefined?!this.contains(c):!!force;this[on?'add':'remove'](c);return on;}
    };
    Object.defineProperty(el, 'innerHTML', {set(){ el.children = []; }, get(){ return ''; }});
    if (id) elements[id] = el;
    return el;
  }
  doc.body = element('body');
  doc.createElement = element;
  doc.createElementNS = (_ns, tag) => element(tag);
  doc.elementFromPoint = () => doc.over || null;
  doc.createTextNode = text => Object.assign(element('span'), {textContent: text});
  doc.getElementById = id => elements[id] || doc.body.querySelector('#' + id);
  doc.querySelector = () => null;
  doc.addEventListener = (type, fn, capture) => { (listeners[type] ||= []).push({fn, capture:!!capture}); };
  doc.removeEventListener=(type,fn,capture)=>{listeners[type]=(listeners[type] || []).filter(r=>r.fn!==fn || r.capture!==!!capture);};
  for (const id of ['docview', 'src', 'guide', 'btarget', 'msgs', 'importbox', 'import-mermaid-text',
    'import-mermaid', 'import-mermaid-convert', 'import-mermaid-cancel', 'undo-builder', 'redo-builder',
    'add-step', 'add-section', 'add-edge', 'add-tabs']){
    const tag = id === 'src' || id === 'import-mermaid-text' ? 'textarea' :
      id.includes('builder') || id.startsWith('import-mermaid') || id.startsWith('add-') ? 'button' : 'div';
    doc.body.appendChild(element(tag, id));
  }
  elements.importbox.hidden = true;
  elements['undo-builder'].disabled = true;
  elements.src.value = boardSpec ? JSON.stringify(boardSpec) : TEXT;
  let svg;
  const cards = {};
  if (boardSpec){
    const sec = elements.docview.appendChild(element());
    sec.className = 'doc-sec'; sec.setAttribute('data-dv-section', '0');
    svg = sec.appendChild(element('svg'));
    svg.getScreenCTM = () => ({inverse(){ return {}; }});
    svg.createSVGPoint = () => ({matrixTransform(){ return {x: this.x, y: this.y}; }});
    function card(id, x, y){
      const node = svg.appendChild(element('g'));
      node.className = 'node'; node.ownerSVGElement = svg;
      node.setAttribute('data-dv-node', id); node.setAttribute('transform', `translate(${x} ${y})`);
      const handoff=boardSpec.nodes[id].handoff,card = node.appendChild(element(handoff?'path':'rect'));
      card.className = 'card'; card.setAttribute(handoff?'data-node-width':'width', '100'); card.setAttribute(handoff?'data-node-height':'height', '60');
      cards[id] = node;
    }
    boardSpec.rows.forEach((row, r) => row.forEach((slot, i) => {
      (Array.isArray(slot) ? slot : [slot]).forEach((id, j) =>
        card(id, 100 + i * 300, 100 + r * 250 + j * 80));
    }));
    (boardSpec.floats || []).forEach((f, i) => card(f.id, 100 + i * 300, 0));
  }
  const saved = {};
  const sandbox = {console, document: doc,
    window: {addEventListener(type, fn){ (windowListeners[type] ||= []).push(fn); },removeEventListener(type,fn){windowListeners[type]=(windowListeners[type] || []).filter(f=>f!==fn);}},
    // Browser timers must be called through the UI adapter, not as leaf-option methods.
    setTimeout(fn,ms){ 'use strict'; assert.equal(this,undefined); scheduled.push({fn,ms}); return scheduled.length; },
    clearTimeout(id){ 'use strict'; assert.equal(this,undefined); cancelled.push(id); },
    getComputedStyle(){ return {}; },
    localStorage: {getItem(k){ return saved[k] || null; }, setItem(k, v){ saved[k] = v; }}};
  vm.runInNewContext(readSource('validator.js') + '\n' +
    readSource('builder.workbench.js')+'\n'+readSource('steps.workbench.js'), sandbox);
  if(extraGlobals)Object.assign(sandbox,extraGlobals);
  let renders = 0;
  let builder;
  function mount(){return builder=sandbox.initWorkbenchBuilder({view: elements.docview, src: elements.src, ctl:()=>ctl, render(request){
    builder.beforePreviewReplace(request);renders++;
    elements.msgs.innerHTML = '';
    const finding = element('li'); finding.textContent = 'existing validator warning';
    elements.msgs.appendChild(finding);
    const outcome={ok:true,replaced:true,text:elements.src.value,origin:request.origin};
    builder.previewRendered(outcome);return outcome;
  }});}
  mount();
  return {mount,get builder(){return builder;},listeners,windowListeners,elements, doc, element, saved, scheduled, cancelled, cards, svg, sandbox, get renders(){ return renders; },
    rerender(){builder.beforePreviewReplace({origin:'manual'});builder.previewRendered({ok:true,replaced:true,text:elements.src.value});},
    move(x, y, over = null){
      doc.over = over;
      for (const fn of windowListeners.mousemove || []) fn({clientX: x, clientY: y});
    },
    release(){ for (const fn of windowListeners.mouseup || []) fn({}); },
    click(id){ return elements[id].fire('click'); }};
}

test('editing source or focusing an inspector pauses every preview without rendering or changing history', () => {
  const pauses=[0,0], ctl={sections:[{stepper:{pause(){ pauses[0]++; }}},
    {stepper:null},{stepper:{pause(){ pauses[1]++; }}}]};
  const h=importHarness(ctl), before=h.elements.src.value;
  h.elements.src.fire('focusin');
  h.elements.guide.appendChild(h.element('input')).fire('focusin');
  h.elements.src.fire('input');
  assert.deepStrictEqual(pauses,[3,3]);
  assert.strictEqual(h.elements.src.value,before);
  assert.strictEqual(h.renders,0);
  assert.strictEqual(h.elements['undo-builder'].disabled,true);
});

test('source typing uses the browser timer adapter and replaces its 800 ms draft save', () => {
  const h=importHarness(), e=h.elements;
  e.src.value=' { broken'; e.src.fire('input'); e.src.fire('input');
  assert.deepEqual(h.scheduled.map(t=>t.ms),[800,800]);
  assert.deepEqual(h.cancelled,[1]);
  h.scheduled[0].fn();
  assert.notEqual(JSON.parse(h.saved['dv-workbench-draft']).text,e.src.value);
  h.scheduled[1].fn();
  assert.equal(JSON.parse(h.saved['dv-workbench-draft']).text,e.src.value);
  assert.equal(e['undo-builder'].disabled,true);
  assert.equal(h.renders,0);
});

function assertOneBuilderUndo(h,before){
  const changed=h.elements.src.value;
  assert.notEqual(changed,before);
  assert.equal(h.renders,1);
  assert.equal(JSON.parse(h.saved['dv-workbench-draft']).text,changed);
  h.click('undo-builder');
  assert.equal(h.elements.src.value,before);
  assert.equal(h.elements['undo-builder'].disabled,true);
  h.click('redo-builder');
  assert.equal(h.elements.src.value,changed);
  assert.equal(h.elements['redo-builder'].disabled,true);
}

test('actual connect commits once and focuses its source range; Escape cancels without history', () => {
  const spec={nodes:{a:{},b:{}},rows:[['a','b']],steps:[{nodes:['a'],text:'start'}]};
  const h=importHarness(null,spec), before='  '+JSON.stringify(spec,null,2)+'\r\n';
  h.elements.src.value=before;
  h.click('add-edge'); h.cards.a.fire('click');
  h.doc.body.fire('keydown',{key:'Escape'});
  assert.equal(h.elements.src.value,before);
  assert.equal(h.renders,0);
  assert.equal(h.elements['undo-builder'].disabled,true);
  h.click('add-edge'); h.cards.a.fire('click'); h.cards.b.fire('click');
  assert.deepEqual(JSON.parse(h.elements.src.value).edges,[{from:'a',to:'b',kind:'int',label:'describe the hop'}]);
  assert.equal(h.doc.activeElement,h.elements.src);
  assert.ok(h.elements.src.selectionEnd>h.elements.src.selectionStart);
  assertOneBuilderUndo(h,before);
});

test('actual step, section and tabs insertion keep their selected source ranges and one exact Undo', () => {
  for(const action of ['add-step','add-section','add-tabs']){
    const h=importHarness(), before=' \n'+JSON.stringify({page:{sections:[{heading:'First',diagram:{
      nodes:{a:{}},rows:[['a']],steps:[{nodes:['a'],text:'start'}]}}]}},null,2)+'\r\n';
    h.elements.src.value=before; h.click(action);
    const raw=JSON.parse(h.elements.src.value);
    if(action==='add-step')assert.equal(raw.page.sections[0].diagram.steps.length,2);
    if(action==='add-section')assert.equal(raw.page.sections.length,2);
    if(action==='add-tabs')assert.equal(raw.page.sections.at(-1).tabs.length,2);
    assert.equal(h.doc.activeElement,h.elements.src);
    assert.ok(h.elements.src.selectionEnd>h.elements.src.selectionStart);
    assertOneBuilderUndo(h,before);
  }
});

test('Mermaid import UI opens focuses cancels and preserves editor and history on failure', () => {
  const h = importHarness(), e = h.elements;
  h.click('import-mermaid');
  assert.strictEqual(e.importbox.hidden, false);
  assert.strictEqual(h.doc.activeElement, e['import-mermaid-text']);
  e['import-mermaid-text'].value = 'sequenceDiagram\nA-xB: <bad>';
  h.click('import-mermaid-convert');
  assert.strictEqual(e.src.value, TEXT);
  assert.strictEqual(h.renders, 0);
  assert.strictEqual(e['undo-builder'].disabled, true);
  assert.strictEqual(e.importbox.hidden, false);
  assert.strictEqual(e.msgs.children.length, 1);
  assert.strictEqual(e.msgs.children[0].className, 'e');
  assert.match(e.msgs.children[0].textContent, /line 2: unsupported syntax.*<bad>/);
  h.click('import-mermaid-cancel');
  assert.strictEqual(e.importbox.hidden, true);
  assert.strictEqual(h.doc.activeElement, e['import-mermaid']);
  assert.strictEqual(e.src.value, TEXT);
});

test('Mermaid import UI renders pretty JSON appends one todo warning and supports undo redo and Ctrl-Z', () => {
  const h = importHarness(), e = h.elements;
  const input = MERMAID_SEQ + 'Note over A: one\nopt two\nA->>B: skipped\nend';
  h.click('import-mermaid');
  e['import-mermaid-text'].value = input;
  h.click('import-mermaid-convert');
  const imported = JSON.stringify(B.mermaidToSpec(input), null, 2);
  assert.strictEqual(e.src.value, imported);
  assert.strictEqual(h.renders, 1);
  assert.strictEqual(e.importbox.hidden, true);
  assert.strictEqual(e.msgs.children.length, 2);
  assert.strictEqual(e.msgs.children[0].textContent, 'existing validator warning');
  assert.match(e.msgs.children[1].textContent, /warn 2 todo\(s\) added/);
  assert.strictEqual(JSON.parse(h.saved['dv-workbench-draft']).text, imported);
  h.click('undo-builder');
  assert.strictEqual(e.src.value, TEXT);
  h.click('redo-builder');
  assert.strictEqual(e.src.value, imported);
  e.src.focus();
  const key = e.src.fire('keydown', {key: 'z', ctrlKey: true});
  assert.strictEqual(key.defaultPrevented, true);
  assert.strictEqual(e.src.value, TEXT);
  assert.strictEqual(h.renders, 4);
});

test('Mermaid import UI leaves native text undo alone and adds no warning without todos', () => {
  const h = importHarness(), e = h.elements;
  h.click('import-mermaid');
  e['import-mermaid-text'].value = MERMAID_SEQ;
  h.click('import-mermaid-convert');
  assert.strictEqual(e.msgs.children.length, 1);
  e.src.focus();
  e.src.value += ' ';
  e.src.fire('input');
  const key = e.src.fire('keydown', {key: 'z', metaKey: true});
  assert.ok(!key.defaultPrevented);
  assert.strictEqual(h.renders, 1);
});

test('Mermaid import UI blocks opening and conversion while ADD TO STEP is armed', () => {
  const h = importHarness(), e = h.elements;
  h.click('import-mermaid');
  e['import-mermaid-text'].value = MERMAID_SEQ;
  const section = h.element(); section.className = 'doc-sec'; section.setAttribute('data-dv-section', '0');
  const coin = h.element(); coin.setAttribute('data-dv-step', '0');
  e.docview.appendChild(section); section.appendChild(coin);
  coin.fire('click');
  const arm = e.guide.querySelectorAll('button').find(b => b.textContent === 'ADD TO STEP');
  assert.ok(arm, 'the real step inspector exposes the mode');
  arm.fire('click');
  assert.match(e.btarget.textContent, /ADD TO STEP 1/);
  assert.strictEqual(h.click('import-mermaid-convert').defaultPrevented, true);
  assert.strictEqual(e.src.value, TEXT);
  assert.strictEqual(h.renders, 0);
  h.click('import-mermaid-cancel');
  assert.strictEqual(e.importbox.hidden, true);
  assert.strictEqual(h.click('import-mermaid').defaultPrevented, true);
  assert.strictEqual(e.importbox.hidden, true);
  e.src.fire('keydown', {key: 'Escape'});
  h.click('import-mermaid');
  assert.strictEqual(e.importbox.hidden, false);
  h.click('import-mermaid-convert');
  assert.strictEqual(h.renders, 1);
});

test('generated workbench validates imported skeletons and retains expected authoring lint', () => {
  const html = fs.readFileSync(path.join(ROOT, 'workbench/flowspec.html'), 'utf8');
  const sandbox = {console};
  const entry = entrypoint('workbench');
  assert.ok(html.includes(entry.source), 'the exact named composition is emitted in the committed workbench');
  vm.runInNewContext(entry.body, sandbox);
  const hld = fs.readFileSync(path.join(ROOT, 'examples/cumulus/cumulus-hld.md'), 'utf8');
  const page = sandbox.normalize(sandbox.mermaidToSpec(hld));
  assert.deepStrictEqual(plain(sandbox.validate(page)), {errors: [], warnings: []});
  const lint = sandbox.lintPage(page);
  // Full-width rows give the shorter imported labels enough space.
  assert.strictEqual(lint.filter(w => w.includes('longer than its edge can carry')).length, 1);
  assert.strictEqual(lint.filter(w => w.includes('shares first edge')).length, 2);
  assert.strictEqual(lint.length, 3);
  const simple = sandbox.normalize(sandbox.mermaidToSpec(MERMAID_SEQ));
  assert.deepStrictEqual(plain(sandbox.validate(simple)), {errors: [], warnings: []});
});

/* ================= baseline diff ================= */
function diffFixture(){
  return {page: {title: 'T', skin: 'aurora', blocks: [{heading: 'H', diagram: {
    nodes: {a: {title: 'A'}, b: {title: 'B'}}, rows: [['a', 'b']],
    edges: [{from: 'a', to: 'b', kind: 'int', label: 'call'}],
    steps: [{text: 'first'}], panels: [{id: 'p', type: 'state', title: 'Status'}]
  }, contract: {fields: [{k: 'version', v: '1'}]}}]}};
}

test('diffSpecs identical specs are empty and comparisons do not mutate inputs', () => {
  const spec = diffFixture(), before = JSON.stringify(spec);
  assert.deepStrictEqual(plain(B.diffSpecs(spec, plain(spec))), []);
  assert.strictEqual(JSON.stringify(spec), before);
});

test('diffSpecs reports exactly node added, edge removed, step text and contract v changes', () => {
  const old = diffFixture(), next = plain(old), section = next.page.blocks[0];
  section.diagram.nodes.c = {title: 'C'};
  section.diagram.edges = [];
  section.diagram.steps[0].text = 'next';
  section.contract.fields[0].v = '2';
  assert.deepStrictEqual(plain(B.diffSpecs(old, next)), [
    {path: 'page.blocks[0].diagram.nodes.c', kind: 'added', text: 'H: node c added'},
    {path: 'page.blocks[0].diagram.edges', kind: 'removed', text: 'H: edge a->b(int) removed'},
    {path: 'page.blocks[0].diagram.steps[0].text', kind: 'changed', text: 'H: step 1 text changed'},
    {path: 'page.blocks[0].contract.fields[0].v', kind: 'changed', text: 'H: contract field version v changed'}
  ]);
});

test('diffSpecs pairs sections by heading and orders added and removed sections around survivors', () => {
  const old = {sections: [{heading: 'Gone'}, {heading: 'Kept'}]};
  const next = {sections: [{heading: 'Kept'}, {heading: 'New'}]};
  assert.deepStrictEqual(plain(B.diffSpecs(old, next)), [
    {path: 'sections', kind: 'removed', text: 'section Gone removed'},
    {path: 'sections[1]', kind: 'added', text: 'section New added'}
  ]);
  assert.deepStrictEqual(plain(B.diffSpecs(old, {sections: [...old.sections].reverse()})), []);
});

test('diffSpecs is deterministic with repeated headings, reordered nodes, and parallel edges', () => {
  const old = diffFixture(), next = plain(old);
  old.page.blocks.push({heading: 'H', diagram: {nodes: {z: {title: 'Z'}}, rows: [['z']]}});
  next.page.blocks.unshift(plain(old.page.blocks[1]));
  next.page.blocks[1].diagram.nodes = {b: {title: 'updated'}, a: {title: 'also updated'}};
  const first = plain(B.diffSpecs(old, next));
  assert.deepStrictEqual(first, plain(B.diffSpecs(old, next)));
  assert.deepStrictEqual(first.map(f => f.path), [
    'page.blocks[1].diagram.nodes.b.title', 'page.blocks[1].diagram.nodes.a.title'
  ]);
  const before = {nodes: {}, rows: [], edges: [
    {from: 'a', to: 'b', kind: 'int', label: 'one'}, {from: 'a', to: 'b', kind: 'mqtt', label: 'two'}
  ]};
  const after = plain(before); after.edges.reverse();
  assert.deepStrictEqual(plain(B.diffSpecs(before, after)), []);
  after.edges[1].kind = 'https';
  assert.deepStrictEqual(plain(B.diffSpecs(before, after)), [
    {path: 'edges[1].kind', kind: 'changed', text: 'section 1: edge a->b(https) kind changed'}
  ]);
});

test('diffSpecs covers page, node, edge, step count, panel, field, and tab changes in document order', () => {
  const old = diffFixture(), next = plain(old), s = next.page.blocks[0], d = s.diagram;
  next.page.title = 'New'; next.page.skin = 'daylight';
  Object.assign(d.nodes.a, {title: 'AA', sub: 'sub', icon: 'db', tint: 'data'});
  delete d.nodes.b;
  d.edges[0].label = 'new'; d.edges.push({from: 'b', to: 'a'});
  d.steps.push({text: 'second'});
  Object.assign(d.panels[0], {title: 'New status', type: 'log'});
  d.panels.push({id: 'q'});
  s.contract.fields = [{k: 'new', v: '3'}];
  old.page.blocks.push({tabs: [{label: 'old', sections: []}]});
  next.page.blocks.push({tabs: [{label: 'new', sections: []}]});
  const findings = plain(B.diffSpecs(old, next));
  assert.deepStrictEqual(findings.map(f => [f.kind, f.path]), [
    ['changed', 'page.title'], ['changed', 'page.skin'],
    ...['title', 'sub', 'icon', 'tint'].map(k => ['changed', 'page.blocks[0].diagram.nodes.a.' + k]),
    ['removed', 'page.blocks[0].diagram.nodes'],
    ['changed', 'page.blocks[0].diagram.edges[0].label'], ['added', 'page.blocks[0].diagram.edges[1]'],
    ['changed', 'page.blocks[0].diagram.steps'],
    ['changed', 'page.blocks[0].diagram.panels[0].type'], ['changed', 'page.blocks[0].diagram.panels[0].title'],
    ['added', 'page.blocks[0].diagram.panels[1]'],
    ['added', 'page.blocks[0].contract.fields[0]'], ['removed', 'page.blocks[0].contract.fields'],
    ['added', 'page.blocks[1].tabs[0].label'], ['removed', 'page.blocks[1].tabs']
  ]);
  const text = JSON.stringify(next, null, 2);
  for (const f of findings){
    const loc = B.findingLocation(text, next, f.text, B.parseValidationPath(f.path + ':'));
    assert.ok(loc && loc.exact, f.path);
  }
  assert.strictEqual(B.diffSpecs(next, old).filter(f => /panel q removed/.test(f.text)).length, 1);
});

test('diffSpecs paths reuse findingLocation for quoted ids, bare diagrams, and missing containers', () => {
  const id = 'svc.api [0]: "quoted" \\';
  const old = {nodes: {[id]: {title: 'Old'}}, rows: [[id]]};
  const next = plain(old); next.nodes[id].title = 'New';
  const f = B.diffSpecs(old, next)[0], text = JSON.stringify(next, null, 2);
  const tokens = B.parseValidationPath(f.path + ': ' + f.text);
  assert.deepStrictEqual(plain(tokens), ['nodes', id, 'title']);
  const loc = B.findingLocation(text, next, f.text, tokens);
  assert.ok(loc.exact);
  assert.strictEqual(JSON.parse(text.slice(loc.start, loc.end)), 'New');
  for (const value of [null, 42, [], {}, {page: {blocks: 'invalid'}}, {sections: [null]}]){
    for (const f of B.diffSpecs(diffFixture(), value)){
      assert.ok(B.findingLocation(JSON.stringify(value), value, f.text, B.parseValidationPath(f.path + ':')));
    }
  }
});

test('diffSpecTexts reports only the first unparseable side and otherwise returns findings', () => {
  assert.deepStrictEqual(plain(B.diffSpecTexts('{', '{}')), {error: 'baseline JSON is unparseable'});
  assert.deepStrictEqual(plain(B.diffSpecTexts('{}', '{')), {error: 'current JSON is unparseable'});
  assert.deepStrictEqual(plain(B.diffSpecTexts('{', '{')), {error: 'baseline JSON is unparseable'});
  assert.deepStrictEqual(plain(B.diffSpecTexts('{}', '{}')), {findings: []});
});

function diffWorkbench(storage = new Map(), options = {}){
  const listeners = new Map(), timers = new Map();
  let timerId = 0, observer;
  const readers = [];
  function element(tag = 'div'){
    const events = new Map();
    return {tagName: tag.toUpperCase(), hidden: true, children: [], style: {}, attributes: {},
      value: '', clientWidth: 440, clientHeight: 300,
      classList: {add(){}, remove(){}, toggle(){}},
      addEventListener(type, fn){ if (!events.has(type)) events.set(type, []); events.get(type).push(fn); },
      fire(type, event = {}){ for (const fn of events.get(type) || []) fn.call(this, event); },
      click(){ this.fire('click', {target: this}); },
      appendChild(child){ this.children.push(child); return child; },
      set innerHTML(value){ this.children = []; },
      setAttribute(k, v){ this.attributes[k] = v; }, getAttribute(k){ return this.attributes[k]; },
      querySelector(){ return null; }, querySelectorAll(){ return []; },
      focus(){ document.activeElement = this; }, remove(){}, closest(){ return null; },
      setSelectionRange(start, end){ this.selectionStart = start; this.selectionEnd = end; }
    };
  }
  const ids = Object.fromEntries(['src', 'diffbox', 'spec-diff', 'draftbar', 'guide', 'go',
    'file-input', 'file-open', 'file-save', 'undo-builder', 'redo-builder'].map(id => [id, element()]));
  const document = {body: element(), activeElement: null,
    getElementById(id){ return ids[id] || null; }, querySelector(){ return null; },
    createElement: element, createTextNode: text => ({textContent: text}),
    addEventListener(type, fn, capture){
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push({fn, capture});
    }
  };
  const sandbox = {console, SCREEN_MODES: B.PANEL_PATCH_FIELDS.screen[0][2], document, window: {addEventListener(){}}, Blob,
    URL: {createObjectURL(){ return 'blob:test'; }, revokeObjectURL(){}},
    getComputedStyle(){ return {}; },
    setTimeout(fn){ timers.set(++timerId, fn); return timerId; }, clearTimeout(id){ timers.delete(id); },
    FileReader: class {readAsText(file){ this.result = file.text; readers.push(this); if(!options.deferredFileRead)this.onload(); }},
    localStorage: {
      getItem(k){ if (options.storageThrows) throw Error('blocked'); return storage.get(k) || null; },
      setItem(k, v){ if (options.storageThrows) throw Error('blocked'); storage.set(k, v); },
      removeItem(k){ if (options.storageThrows) throw Error('blocked'); storage.delete(k); }
    }
  };
  vm.runInNewContext(readSource('validator.js'), sandbox);
  vm.runInNewContext(readSource('builder.workbench.js'), sandbox);
  ids.src.value = JSON.stringify(diffFixture());
  const builder = sandbox.initWorkbenchBuilder({view: element(), src: ids.src,
    deferInitialSave: options.deferInitialSave, isActive:options.isActive, render(request){
      builder.beforePreviewReplace(request);const outcome={ok:true,replaced:true,text:ids.src.value};
      builder.previewRendered(outcome);return outcome;
    }});
  return {ids, storage, sandbox, builder, readers,
    lines(){ return ids.diffbox.children.map(c => c.textContent); },
    diff(){ ids['spec-diff'].click(); return this.lines(); },
    flush(){ const fns = [...timers.values()]; timers.clear(); fns.forEach(fn => fn()); },
    key(key){ for (const {fn} of listeners.get('keydown') || []) fn({key}); },
    render(){builder.beforePreviewReplace({origin:'manual'});builder.previewRendered({ok:true,replaced:true,text:ids.src.value});}
  };
}

test('diff UI toggles, selects JSON, and hides on Escape, input, and render attempts', () => {
  const w = diffWorkbench(), src = w.ids.src;
  assert.deepStrictEqual(w.diff(), ['no changes']);
  w.diff(); assert.ok(w.ids.diffbox.hidden);
  const spec = JSON.parse(src.value); spec.page.title = 'Changed'; src.value = JSON.stringify(spec);
  assert.deepStrictEqual(w.diff(), ['page title changed']);
  w.ids.diffbox.children[0].click();
  assert.strictEqual(JSON.parse(src.value.slice(src.selectionStart, src.selectionEnd)), 'Changed');
  w.key('Escape'); assert.ok(w.ids.diffbox.hidden);
  assert.strictEqual(w.ids['spec-diff'].attributes['aria-expanded'], 'false');
  w.diff(); src.fire('input'); assert.ok(w.ids.diffbox.hidden);
  src.value = '{';
  assert.deepStrictEqual(w.diff(), ['current JSON is unparseable']);
  w.ids.go.click(); assert.ok(w.ids.diffbox.hidden);
  w.diff(); w.render(); assert.ok(w.ids.diffbox.hidden);
});

test('baseline survives autosave and recovery, and open/save reset it without breaking undo', () => {
  const w = diffWorkbench(), next = diffFixture(); next.page.title = 'Draft';
  w.ids.src.value = JSON.stringify(next); w.ids.src.fire('input'); w.flush();
  const recovered = diffWorkbench(w.storage);
  assert.ok(!recovered.ids.draftbar.hidden);
  recovered.ids.draftbar.children[1].click();
  assert.deepStrictEqual(recovered.diff(), ['page title changed']);
  recovered.ids['file-save'].click();
  assert.deepStrictEqual(recovered.diff(), ['no changes']);
  assert.strictEqual(JSON.parse(w.storage.get('dv-workbench-baseline')).text, JSON.stringify(next));
  const file = plain(next); file.page.skin = 'daylight';
  recovered.ids['file-input'].files = [{text: JSON.stringify(file)}];
  recovered.ids['file-input'].fire('change');
  assert.deepStrictEqual(recovered.diff(), ['no changes']);
  recovered.ids['undo-builder'].click();
  assert.deepStrictEqual(recovered.diff(), ['page skin changed']);
  const reload = diffWorkbench(w.storage);
  reload.ids.draftbar.children[1].click();
  assert.deepStrictEqual(reload.diff(), ['page skin changed']);
});

test('legacy draft recovery falls back visibly, discard keeps demo baseline, and unavailable storage is safe', () => {
  const spec = diffFixture(); spec.page.title = 'Legacy';
  const storage = new Map([['dv-workbench-draft', JSON.stringify({text: JSON.stringify(spec), at: 1})]]);
  const legacy = diffWorkbench(storage);
  legacy.ids.draftbar.children[1].click();
  assert.match(legacy.ids.guide.children[0].textContent, /original baseline unavailable/);
  assert.deepStrictEqual(legacy.diff(), ['no changes']);
  const discard = diffWorkbench(storage);
  discard.ids.draftbar.children[2].click();
  assert.deepStrictEqual(discard.diff(), ['no changes']);
  assert.strictEqual(JSON.parse(storage.get('dv-workbench-baseline')).text, discard.ids.src.value);
  const blocked = diffWorkbench(new Map(), {storageThrows: true});
  assert.deepStrictEqual(blocked.diff(), ['no changes']);
  blocked.ids.src.fire('input'); blocked.flush();
  blocked.ids['file-save'].click();
});

test('welcome does not autosave a boot demo or replace an existing draft before a choice', () => {
  const empty = diffWorkbench(new Map(), {deferInitialSave:true});
  assert.strictEqual(empty.storage.has('dv-workbench-draft'), false);
  assert.strictEqual(empty.builder.isProjectOpen(), false);
  empty.builder.prepareWelcome();
  assert.strictEqual(empty.storage.has('dv-workbench-draft'), false);
  const saved = {text:'{ unfinished', at:123};
  const storage = new Map([['dv-workbench-draft', JSON.stringify(saved)]]);
  const w = diffWorkbench(storage, {deferInitialSave:true});
  w.builder.prepareWelcome();
  assert.deepStrictEqual(plain(w.builder.draft()), saved);
  assert.deepStrictEqual(plain(w.builder.draftInfo()), {title:'Unfinished diagram',savedAt:123});
  assert.strictEqual(storage.get('dv-workbench-draft'), JSON.stringify(saved));
  assert.strictEqual(w.builder.restoreDraft(), true);
  assert.strictEqual(w.ids.src.value, saved.text);
  assert.strictEqual(w.builder.isProjectOpen(), true);
  assert.strictEqual(w.builder.draft(), null);
});

test('leaving the editor flushes exact unfinished source before the autosave delay without changing undo', () => {
  const w = diffWorkbench(new Map(), {deferInitialSave:true});
  const initial = JSON.stringify(diffFixture());
  w.builder.loadText(initial);
  const replacement = diffFixture(); replacement.page.title = 'Edited title';
  w.builder.loadSpec(replacement);
  const unfinished = w.ids.src.value + '\r\n  { unfinished';
  w.ids.src.value = unfinished; w.ids.src.fire('input');
  w.builder.prepareWelcome();
  assert.strictEqual(JSON.parse(w.storage.get('dv-workbench-draft')).text, unfinished);
  w.ids['undo-builder'].click(); assert.strictEqual(w.ids.src.value, initial);
  w.ids['redo-builder'].click(); assert.strictEqual(w.ids.src.value, unfinished);
});

test('welcome imports validate before mutation and preserve the pending draft in one undo', () => {
  const saved = {text:'  { unfinished JSON\n', at:123};
  const storage = new Map([['dv-workbench-draft', JSON.stringify(saved)]]);
  const w = diffWorkbench(storage, {deferInitialSave:true});
  const source = w.ids.src.value;
  assert.throws(() => w.builder.loadText('{'), /JSON parse/);
  const invalid = diffFixture(); invalid.page.blocks[0].diagram.rows = [['missing-node']];
  assert.throws(() => w.builder.loadSpec(invalid), /missing-node/);
  assert.strictEqual(w.ids.src.value, source);
  assert.strictEqual(storage.get('dv-workbench-draft'), JSON.stringify(saved));
  const text = JSON.stringify(diffFixture(), null, 4) + '\n';
  w.builder.loadText(text);
  assert.strictEqual(w.ids.src.value, text);
  assert.strictEqual(w.ids.draftbar.hidden, true);
  assert.deepStrictEqual(w.diff(), ['no changes']);
  w.ids['undo-builder'].click();
  assert.strictEqual(w.ids.src.value, saved.text);
  w.ids['redo-builder'].click();
  assert.strictEqual(w.ids.src.value, text);
});

test('superseded editor file reads cannot replace the project selected from welcome', () => {
  const w = diffWorkbench(new Map(), {deferredFileRead:true});
  const first = diffFixture(); first.page.title = 'Slow old file';
  w.ids['file-input'].files = [{text:JSON.stringify(first)}];
  w.ids['file-input'].fire('change');
  w.builder.prepareWelcome();
  const current = diffFixture(); current.page.title = 'New template';
  w.builder.loadSpec(current);
  const saved = w.storage.get('dv-workbench-draft');
  w.readers[0].onload();w.readers[0].onerror();
  assert.equal(JSON.parse(w.ids.src.value).page.title, 'New template');
  assert.equal(w.storage.get('dv-workbench-draft'), saved);
  assert.equal(w.ids.guide.hidden, true);
});

test('typing before first autosave is preserved by undo when a canonical response arrives', () => {
  const saved = diffFixture(); saved.page.title = 'Saved old draft';
  const w = diffWorkbench(new Map([['dv-workbench-draft',JSON.stringify({text:JSON.stringify(saved),at:1})]]), {deferInitialSave:true});
  const typed = diffFixture(); typed.page.title = 'Typed while canonical link loads';
  w.ids.src.value = JSON.stringify(typed); w.ids.src.fire('input');
  const canonical = diffFixture(); canonical.page.title = 'Canonical response';
  w.builder.loadSpec(canonical);
  w.ids['undo-builder'].click();
  assert.equal(w.ids.src.value, JSON.stringify(typed));
});

test('new projects and pasted JSON are exact, independent undoable replacements', () => {
  const w = diffWorkbench(new Map(), {deferInitialSave:true});
  const first = diffFixture(); first.page.title = 'First project';
  const second = diffFixture(); second.page.title = 'Second project';
  w.builder.loadSpec(first);
  w.ids.src.value += '\n  ';
  const firstText = w.ids.src.value;
  w.builder.prepareWelcome();
  w.builder.loadSpec(second);
  assert.strictEqual(w.builder.isProjectOpen(), true);
  w.ids['undo-builder'].click();
  assert.strictEqual(w.ids.src.value, firstText);
  w.ids['redo-builder'].click();
  assert.strictEqual(JSON.parse(w.ids.src.value).page.title, 'Second project');
});

test('removed sections stay in their tab list across reordered tabs and page aliases', () => {
  const old = {page: {blocks: [{tabs: [
    {label: 'A', sections: [{heading: 'Gone'}]},
    {label: 'B', sections: [{heading: 'Kept', diagram: {nodes: {a: {title: 'A'}}, rows: [['a']]}}]}
  ]}]}};
  const next = {sections: plain(old.page.blocks)};
  next.sections[0].tabs[0].sections = [];
  next.sections[0].tabs[1].sections[0].diagram.nodes.a.title = 'New';
  let findings = plain(B.diffSpecs(old, next));
  assert.strictEqual(findings[0].text, 'section Gone removed');
  assert.strictEqual(findings[0].path, 'sections[0].tabs[0].sections');
  next.sections[0].tabs.reverse();
  findings = plain(B.diffSpecs(old, next));
  assert.strictEqual(findings[1].text, 'section Gone removed');
  assert.strictEqual(findings[1].path, 'sections[0].tabs[1].sections');
});

test('saved invalid JSON reports an unparseable baseline and mismatched storage falls back safely', () => {
  const w = diffWorkbench();
  w.ids.src.value = '{'; w.ids['file-save'].click();
  assert.deepStrictEqual(w.diff(), ['baseline JSON is unparseable']);
  w.ids.src.value = JSON.stringify(diffFixture()); w.ids.src.fire('input');
  assert.deepStrictEqual(w.diff(), ['baseline JSON is unparseable']);
  const storage = new Map([
    ['dv-workbench-draft', JSON.stringify({text: '{', at: 1})],
    ['dv-workbench-baseline', JSON.stringify({text: '{}', draftText: 'different draft'})]
  ]);
  const recovery = diffWorkbench(storage);
  recovery.ids.draftbar.children[1].click();
  assert.match(recovery.ids.guide.children[0].textContent, /original baseline unavailable/);
});

test('diffSpecs sees edits outside any whitelist: node link, panel initial, contract hot, step panels, edge ret', () => {
  const base = {page: {title: 'T', blocks: [{heading: 'S',
    contract: {fields: [{k: 'topic', v: 'a/b', hot: true}]},
    diagram: {
      nodes: {n1: {title: 'N', link: 'https://a'}, n2: {title: 'M'}},
      rows: [['n1', 'n2']],
      edges: [{from: 'n1', to: 'n2', kind: 'int', ret: false}],
      panels: [{id: 'p1', type: 'gauge', initial: {value: 1}}],
      steps: [{edge: 'n1->n2', text: 't', panels: {p1: {value: 2}}}]
    }}]}};
  const next = JSON.parse(JSON.stringify(base));
  next.page.blocks[0].diagram.nodes.n1.link = 'https://b';
  next.page.blocks[0].diagram.panels[0].initial = {value: 9};
  next.page.blocks[0].contract.fields[0].hot = false;
  next.page.blocks[0].diagram.steps[0].panels = {p1: {value: 3}};
  next.page.blocks[0].diagram.edges[0].ret = true;
  const found = plain(B.diffSpecs(base, next));
  assert.deepStrictEqual(found.map(f => f.text).sort(), [
    'S: contract field topic hot changed',
    'S: edge n1->n2(int) ret changed',
    'S: node n1 link changed',
    'S: panel p1 initial changed',
    'S: step 1 panels changed'
  ]);
  for (const f of found) assert.strictEqual(f.kind, 'changed');
  /* identical specs still yield nothing under the all-keys comparison */
  assert.deepStrictEqual(plain(B.diffSpecs(base, JSON.parse(JSON.stringify(base)))), []);
});

/* ---------------- multi-select: bulk planners ---------------- */

function bulkSpec(){
  return {page: {blocks: [{heading: 'S',
    bullets: ['first point', 'second point'],
    contract: {fields: [{k: 'topic', v: 'a/b'}, {k: 'ttl', v: '30s'}]},
    diagram: {
      nodes: {a: {title: 'A'}, b: {title: 'B', tint: 'dev'}, c: {title: 'C'}},
      rows: [['a', 'b', 'c']],
      edges: [{from: 'a', to: 'b'}, {from: 'b', to: 'c', kind: 'mqtt'}],
      panels: [{id: 'q', type: 'queue', initial: {state: 'empty'}}],
      steps: [{edge: 'a->b', text: 's1'}, {edge: 'b->c', text: 's2'}, {nodes: ['c'], text: 's3'}]
    }}]}};
}

/* ---- builderPositionLine: the "step 2 of 3" inspector ordinal ---- */

test('builderPositionLine: step/section/tab ordinals, null off the ends', () => {
  const spec = {page: {blocks: [
    {heading: 'A', diagram: {nodes: {x: {}}, rows: [['x']],
      steps: [{text: '1'}, {text: '2'}, {text: '3'}]}},
    {tabs: [{label: 'T1', sections: [{heading: 'B'}]},
            {label: 'T2', sections: [{heading: 'C'}]}]}
  ]}};
  assert.equal(B.builderPositionLine(spec, {kind: 'step', section: 0, index: 1}), 'step 2 of 3');
  assert.equal(B.builderPositionLine(spec, {kind: 'step', section: 0, index: 9}), null);
  assert.equal(B.builderPositionLine(spec, {kind: 'section', section: 0}), 'section 1 of 3');
  assert.equal(B.builderPositionLine(spec, {kind: 'section', section: 2}), 'section 3 of 3');
  assert.equal(B.builderPositionLine(spec, {kind: 'section', section: 3}), null);
  assert.equal(B.builderPositionLine(spec, {kind: 'tab', block: 1, tab: 0}), 'tab 1 of 2');
  assert.equal(B.builderPositionLine(spec, {kind: 'tab', block: 0, tab: 0}), null);
  assert.equal(B.builderPositionLine(spec, {kind: 'node', section: 0, id: 'x'}), null);
  assert.equal(B.builderPositionLine(spec, null), null);
});

test('builderPositionLine: bare-diagram and bare-page spec shapes', () => {
  const bare = {nodes: {x: {}}, rows: [['x']], steps: [{text: '1'}]};
  assert.equal(B.builderPositionLine(bare, {kind: 'step', section: 0, index: 0}), 'step 1 of 1');
  const barePage = {sections: [{heading: 'A'}, {heading: 'B'}]};
  assert.equal(B.builderPositionLine(barePage, {kind: 'section', section: 1}), 'section 2 of 2');
});

/* ---- planAddTabs: the "+ tabs" insert ---- */


/* ---- planMoveRow: whole layout rows move by index ---- */

/* ---- planMoveGroup: carry group slots while retaining target row identity ---- */

/* ---- node gap placement and float membership ---- */

function nodePlacementFixture(rows = [['a', 'b'], ['c', 'd']]){
  return {nodes: {a: {title: 'A'}, b: {}, c: {}, d: {}, e: {}, f: {}, u: {}}, rows,
    floats: [{id: 'f', side: 'above', dx: 12, dy: -8}],
    edges: [{from: 'a', to: 'f'}], steps: [{nodes: ['a', 'f'], text: 'Keep me'}]};
}

test('node gap drag shows left-to-right slot and row lines and commits with undo and selection', () => {
  for (const [id, x, y, lineClass, expected] of [
    ['a', 300, 375, 'dv-slotline', [['b'], ['c', 'a', 'd']]],
    ['a', 300, 250, 'dv-rowline', [['b'], ['a'], ['c', 'd']]]
  ]){
    const h = importHarness(null, nodePlacementFixture());
    const before='  '+JSON.stringify(nodePlacementFixture(),null,2)+'\r\n';
    h.elements.src.value=before;
    const focused=h.elements.guide.appendChild(h.element('input')); focused.focus();
    h.cards[id].fire('mousedown', {button: 0, clientX: 120, clientY: 120});
    h.move(x, y);
    const line = h.svg.querySelector('line.' + lineClass);
    assert.ok(line);
    assert.equal(line.getAttribute('visibility'), 'visible');
    h.release();
    assert.deepStrictEqual(JSON.parse(h.elements.src.value).rows, expected);
    assert.equal(h.svg.querySelector('line.' + lineClass), null);
    assert.equal(h.svg.querySelector('.dv-ghost'), null);
    assert.ok(h.cards[id].classList.contains('dv-sel'));
    assert.equal(h.renders, 1);
    assert.equal(h.doc.activeElement,focused);
    assertOneBuilderUndo(h,before);
  }
});

test('actual row, group and edge-label drags each preserve form focus and publish one exact Undo', () => {
  for(const kind of ['row','group','label']){
    const spec=nodePlacementFixture();
    spec.groups={pair:{title:'Pair'}}; spec.nodes.a.group='pair'; spec.nodes.b.group='pair';
    const h=importHarness(null,spec), before=' \n'+JSON.stringify(spec,null,2)+'\r\n';
    h.elements.src.value=before;
    const focused=h.elements.guide.appendChild(h.element('input')); focused.focus();
    let target;
    if(kind==='row')target=h.svg.querySelector('g.dv-rowgrab[data-dv-row="0"]');
    else{
      target=h.svg.appendChild(h.element(kind==='group'?'g':'text'));
      target.ownerSVGElement=h.svg;
      target.className=kind==='group'?'grp':'lbl';
      target.setAttribute(kind==='group'?'data-dv-group':'data-dv-edge',kind==='group'?'pair':'0');
    }
    assert.ok(target);
    target.fire('mousedown',{button:0,clientX:120,clientY:120});
    h.move(kind==='label'?140:300,kind==='label'?150:450); h.release();
    const result=JSON.parse(h.elements.src.value);
    if(kind==='label')assert.deepEqual([result.edges[0].labelDx,result.edges[0].labelDy],[20,30]);
    else assert.deepEqual(result.rows,[['c','d'],['a','b']]);
    assert.equal(h.doc.activeElement,focused);
    assertOneBuilderUndo(h,before);
  }
});

test('a row of handoff arrows keeps its measured row handle and moves with one exact Undo',()=>{
  const spec=nodePlacementFixture();spec.nodes.a.handoff={spec:'next-a'};spec.nodes.b.handoff={spec:'next-b'};
  const h=importHarness(null,spec),before=' \n'+JSON.stringify(spec,null,2)+'\r\n';h.elements.src.value=before;
  const handle=h.svg.querySelector('g.dv-rowgrab[data-dv-row="0"]');assert.ok(handle);
  assert.equal(handle.getAttribute('transform'),'translate(70 119)');
  handle.fire('mousedown',{button:0,clientX:80,clientY:130});h.move(300,450);h.release();
  const result=JSON.parse(h.elements.src.value);assert.deepEqual(result.rows,[['c','d'],['a','b']]);
  assert.deepEqual(result.nodes.a.handoff,spec.nodes.a.handoff);assert.deepEqual(result.nodes.b.handoff,spec.nodes.b.handoff);
  assertOneBuilderUndo(h,before);
});

test('node swap target takes precedence over gap lines and retains both ghost previews', () => {
  const h = importHarness(null, nodePlacementFixture());
  h.cards.a.fire('mousedown', {button: 0, clientX: 120, clientY: 120});
  h.move(300, 250);
  const line = h.svg.querySelector('.dv-rowline');
  h.move(120, 375, h.cards.c);
  assert.equal(line.getAttribute('visibility'), 'hidden');
  assert.ok(h.cards.c.classList.contains('dv-droptgt'));
  assert.equal(h.svg.querySelector('.dv-ghost').getAttribute('transform'), 'translate(100 350)');
  assert.equal(h.svg.querySelector('.dv-ghostback').getAttribute('transform'), 'translate(100 100)');
  h.release();
  assert.deepStrictEqual(JSON.parse(h.elements.src.value).rows, [['c', 'b'], ['a', 'd']]);
  assert.equal(h.svg.querySelector('.dv-rowline'), null);
  assert.equal(h.svg.querySelector('.dv-ghost'), null);
});

test('node drag cancels gap feedback on Escape, render and both kinds of row drift', () => {
  for (const exit of ['escape', 'render', 'drift-before-grab', 'drift-during-move', 'drift-before-drop']){
    const h = importHarness(null, nodePlacementFixture());
    function drift(){
      const d = JSON.parse(h.elements.src.value); d.rows.reverse(); h.elements.src.value = JSON.stringify(d);
    }
    if (exit === 'drift-before-grab') drift();
    h.cards.a.fire('mousedown', {button: 0, clientX: 120, clientY: 120});
    h.move(300, 250);
    if (exit === 'escape') h.doc.body.fire('keydown', {key: 'Escape'});
    if (exit === 'render') h.rerender();
    if (exit === 'drift-during-move'){ drift(); h.move(300, 260); }
    if (exit === 'drift-before-drop') drift();
    const before = h.elements.src.value;
    h.release();
    assert.equal(h.elements.src.value, before);
    assert.equal(h.svg.querySelector('.dv-rowline'), null);
    assert.equal(h.svg.querySelector('.dv-ghost'), null);
    assert.equal(h.renders, 0);
    if (exit.startsWith('drift'))
      assert.match(h.elements.guide.querySelector('.gerr').textContent, /JSON rows changed since the last render/);
  }
});

test('node drag threshold preserves click selection and no-op gaps show no line', () => {
  const h = importHarness(null, nodePlacementFixture());
  h.cards.a.fire('mousedown', {button: 0, clientX: 120, clientY: 120});
  h.move(123, 124);
  assert.equal(h.svg.querySelector('.dv-ghost'), null);
  h.release();
  h.cards.a.fire('click');
  assert.ok(h.cards.a.classList.contains('dv-sel'));
  h.cards.a.fire('mousedown', {button: 0, clientX: 120, clientY: 120});
  h.move(90, 125);
  assert.equal(h.svg.querySelector('.dv-slotline'), null);
  h.release();
  h.cards.b.fire('click');
  assert.ok(h.cards.a.classList.contains('dv-sel'), 'click after a real drag is suppressed');
  assert.equal(h.renders, 0);
});

test('node inspector float dropdown commits membership and refreshes its selected side', () => {
  const h = importHarness(null, nodePlacementFixture());
  function floatSelect(){
    return h.elements.guide.querySelectorAll('.frow').find(row => row.firstChild.textContent === 'float').children[1];
  }
  h.cards.a.fire('click');
  assert.equal(floatSelect().value, '');
  assert.equal(floatSelect().firstChild.textContent, 'in rows');
  floatSelect().value = 'below'; floatSelect().fire('change');
  assert.equal(floatSelect().value, 'below');
  assert.deepStrictEqual(JSON.parse(h.elements.src.value).rows, [['b'], ['c', 'd']]);
  floatSelect().value = ''; floatSelect().fire('change');
  assert.equal(floatSelect().value, '');
  assert.deepStrictEqual(JSON.parse(h.elements.src.value).rows, [['b'], ['c', 'd'], ['a']]);
  h.cards.f.fire('click');
  floatSelect().value = 'below'; floatSelect().fire('change');
  assert.deepStrictEqual(JSON.parse(h.elements.src.value).floats, [{id: 'f', side: 'below', dx: 12, dy: -8}]);
});

/* ---- parseStarterManifest: the hosted starters.json loader ---- */

test('parseStarterManifest accepts an array or a {starters:[...]} wrapper', () => {
  const spec = {page: {title: 'A', blocks: []}};
  const arr = B.parseStarterManifest(JSON.stringify([{name: 'One', spec: spec}]));
  assert.ok(!arr.error);
  assert.equal(arr.entries.length, 1);
  assert.equal(arr.entries[0].name, 'One');
  assert.equal(arr.entries[0].desc, 'from starters.json'); /* default */
  assert.equal(arr.skipped, 0);
  const wrapped = B.parseStarterManifest(JSON.stringify(
    {starters: [{name: 'Two', desc: 'd', spec: spec}]}));
  assert.equal(wrapped.entries[0].desc, 'd');
});

test('parseStarterManifest skips malformed entries and counts them', () => {
  const spec = {page: {title: 'A'}};
  const out = B.parseStarterManifest(JSON.stringify([
    {name: 'Good', spec: spec},
    {name: '', spec: spec},        /* no name */
    {name: 'NoSpec'},              /* no spec */
    {name: 'ArrSpec', spec: [1]},  /* spec must be an object */
    {spec: spec},                  /* no name key */
    'nonsense'
  ]));
  assert.ok(!out.error);
  assert.deepStrictEqual(plain(out.entries.map(e => e.name)), ['Good']);
  assert.equal(out.skipped, 5);
});

test('parseStarterManifest reports invalid JSON and wrong top-level shape', () => {
  assert.match(B.parseStarterManifest('{nope').error, /not valid JSON/);
  assert.match(B.parseStarterManifest('42').error, /must be an array/);
  assert.match(B.parseStarterManifest('{"other": 1}').error, /must be an array/);
});

/* ---- buildExportHtml: the client-side page injector ---- */


/* ---- planStackNodes: collect selected nodes into one vertical stack ---- */

/* ---- builderInsertTargetText: the insert-target descriptor ---- */

test('builderInsertTargetText names section, tab, and falls back for blank labels', () => {
  const spec = {page: {blocks: [
    {heading: 'First', diagram: {nodes: {a: {}}, rows: [['a']]}},
    {tabs: [
      {label: 'Ops', sections: [{heading: 'Runbook'}]},
      {label: '  ', sections: [{heading: 'Blankish'}]},
      {sections: [{heading: 'NoLabel'}]}
    ]}
  ]}};
  assert.equal(B.builderInsertTargetText(spec, 0), 'into section 1 · First');
  assert.equal(B.builderInsertTargetText(spec, 1), 'into tab “Ops” › section 2 · Runbook');
  /* whitespace-only label falls back to "tab N", not tab “” */
  assert.equal(B.builderInsertTargetText(spec, 2), 'into tab “tab 2” › section 3 · Blankish');
  assert.equal(B.builderInsertTargetText(spec, 3), 'into tab “tab 3” › section 4 · NoLabel');
  assert.equal(B.builderInsertTargetText(spec, 9), null);
});

test('builderInsertTargetText handles a headingless section and bare shapes', () => {
  const noHeading = {page: {blocks: [{diagram: {nodes: {a: {}}, rows: [['a']]}}]}};
  assert.equal(B.builderInsertTargetText(noHeading, 0), 'into section 1');
  const bare = {nodes: {a: {}}, rows: [['a']]};
  assert.equal(B.builderInsertTargetText(bare, 0), 'into section 1');
});

test('homemap setup and dynamic patch fields follow declared devices', () => {
  assert.deepStrictEqual(plain(B.PANEL_SETUP_FIELDS.homemap), [
    ['outline', 'objf', {cols:[{k:'w',kind:'num',label:'Width'}, {k:'h',kind:'num',label:'Height'}, {k:'x',kind:'num',label:'Left (auto)'}, {k:'y',kind:'num',label:'Top (auto)'}], hint:'Floor plan: width 20–320, height 20–180. Blank left/top centers the house. Rooms and devices keep their coordinates. Press Enter or leave a field to save.'}], ['rooms', 'rows', {cols: [
      {k:'label'}, {k:'kind',kind:'enum',options:['room','outdoor']}, {k:'x', kind:'num', req:true}, {k:'y', kind:'num', req:true},
      {k:'w', kind:'num', req:true}, {k:'h', kind:'num', req:true}]}], ['devices', 'rows', {cols: [
      {k: 'id', req: true}, {k: 'kind', kind: 'enum', options: ['camera', 'entry', 'sensor', 'hub']},
      {k: 'display', kind: 'enum', options: ['marker', 'door']},
      {k: 'label'}, {k: 'x', kind: 'num', req: true}, {k: 'y', kind: 'num', req: true},
      {k: 'facing', kind: 'num'}, {k: 'spread', kind: 'num'}, {k: 'range', kind: 'num'}, {k: 'icon', kind: 'icon'}, {k: 'doorWidth', kind: 'num'}, {k: 'doorSwing', kind: 'num'}
    ], max: 12}], ['subjects', 'rows', {cols: [
      {k: 'id', req: true}, {k: 'label'}, {k: 'x', kind: 'num', req: true},
      {k: 'y', kind: 'num', req: true}, {k: 'icon', kind: 'icon'}], max: 6}], ['initial', 'json']
  ]);
  const decl = {type: 'homemap', devices: ['camera', 'entry', 'sensor', 'hub'].map((kind, i) => ({id: 'd' + i, kind, x: 20, y: 40}))};
  assert.deepStrictEqual(plain(B.panelPatchFields(decl)), [
    ['d0', 'jsonAny'], ['d1', 'jsonAny'], ['d2', 'jsonAny'], ['d3', 'jsonAny'], ['signals', 'jsonArr']
  ]);
  decl.devices.push(null, {}, {...decl.devices[0]}, {id: 'signals', kind: 'camera', x: 1, y: 2},
    {id: 'bad', kind: 'dragon', x: 1, y: 2}, {id: 'nan', kind: 'camera', x: NaN, y: 1});
  assert.strictEqual(B.panelPatchFields(decl).length, 5);
  assert.deepStrictEqual(plain(B.panelPatchFields({type: 'homemap'})), [['signals', 'jsonArr']]);
});


test('homemap palette starter inserts all device kinds without warnings', () => {
  const plan = B.planAddPanel(TEXT, SPEC, 0, 'homemap');
  const spec = JSON.parse(plan.text), p = spec.page.blocks[0].diagram.panels[0];
  assert.strictEqual(p.type, 'homemap');
  assert.deepStrictEqual(p.devices.map(d => d.kind).sort(), ['camera', 'camera', 'entry', 'hub', 'sensor']);
  assert.ok(p.devices.find(d => d.kind === 'sensor').label);
  assert.deepStrictEqual(p.subjects, [{id: 'walker', label: 'Visitor', x: 20, y: 150}]);
  const result = V.validate(V.normalize(spec));
  assert.strictEqual(result.errors.length, 0);
  assert.strictEqual(result.warnings.length, 0);
});


test('a registered panel supplies custom inspectors through shared controls and one-step undo/redo', () => {
  const spec={nodes:{},rows:[[]],panels:[{id:'reading',type:'authoring-fixture',title:'Reading',value:4}],steps:[{text:'Measure',panels:{reading:{value:5}}}]};
  const h=importHarness(null,spec), C=h.sandbox;
  let factories=0;
  C.PanelRegistry.extend('authoring-fixture',{authoring:{
    template:{title:'Reading',value:4},setupFields:[['value','num']],patchFields:[['value','num']],
    editor(context){
      factories++;
      return {
        setupRows(panel,diagram,target,rows){
          rows.push(context.controls.action('Raise reading',()=>{
            if(context.commit('value',String(panel.value+1)))context.inspect();
          }));
        },
        stepControl(diagram,panel,target){
          return context.controls.row('Custom reading',context.controls.number(diagram.steps[target.index].panels[panel.id].value,value=>
            context.transact(raw=>C.planStepSetPanelPatch(context.source(),raw,target.section,target.index,panel.id,JSON.stringify({value})),{after:context.inspect})));
        }
      };
    }
  }});
  const section=h.elements.docview.querySelector('.doc-sec');
  const card=section.appendChild(h.element());card.setAttribute('data-dv-panel','0');
  card.fire('click');
  const raise=()=>h.elements.guide.querySelectorAll('button').find(button=>button.textContent==='Raise reading');
  assert.ok(raise(),'new panel hook is discovered after workbench initialization');
  raise().fire('click');
  assert.equal(JSON.parse(h.elements.src.value).panels[0].value,5);
  h.click('undo-builder');assert.equal(JSON.parse(h.elements.src.value).panels[0].value,4);
  assert.equal(h.elements['undo-builder'].disabled,true,'one custom action creates exactly one undo entry');
  h.click('redo-builder');assert.equal(JSON.parse(h.elements.src.value).panels[0].value,5);
  card.fire('click');
  const ordinary=h.elements.guide.querySelector('input.fnum');ordinary.value='8';ordinary.fire('change');
  assert.equal(JSON.parse(h.elements.src.value).panels[0].value,8,'metadata still uses the ordinary shared setup control');
  h.click('undo-builder');assert.equal(JSON.parse(h.elements.src.value).panels[0].value,5);
  const step=section.appendChild(h.element());step.setAttribute('data-dv-step','0');step.fire('click');
  const reading=h.elements.guide.querySelector('input.fnum');reading.value='9';reading.fire('change');
  assert.equal(JSON.parse(h.elements.src.value).steps[0].panels.reading.value,9);
  h.click('undo-builder');assert.equal(JSON.parse(h.elements.src.value).steps[0].panels.reading.value,5);
  h.click('redo-builder');assert.equal(JSON.parse(h.elements.src.value).steps[0].panels.reading.value,9);
  assert.equal(factories,1,'the panel owns one editor instance across rerenders and selections');
});


test('actual builder story callbacks select hidden alternate source indices without preselecting visible playback',()=>{
  const d={nodes:{a:{},b:{}},rows:[['a','b']],steps:[{id:'done',text:'Done'},{id:'start',text:'Start'},{id:'2',text:'Hidden failure'}],
    paths:[{id:'happy',steps:['start','done']},{id:'failed',steps:['2']}]};
  let story,path='happy',index=0;const jumps=[];
  const sp={pause(){},mode:()=> 'step',path:()=>path,current:()=>({n:index}),sourceIndex:()=>index,
    selectPath(){throw new Error('Hidden source selection must not require visible playback');},
    jumpSource(i,p){index=i;if(p)path=p;jumps.push([i,p]);return true;}};
  const h=importHarness({sections:[{number:1,stepper:sp}]},d,{
    initWorkbenchStepList(opts){story=opts;return {sync(){},refresh(){}};}
  });
  story.selectPath(0,'failed');assert.deepStrictEqual(jumps,[[2,'failed']]);
  const raw=JSON.parse(h.elements.src.value),entry=h.sandbox.builderStorySteps(h.sandbox.builderStorySections(raw)[0],'','failed')[0];
  story.navigate(entry);assert.equal(path,'failed');assert.equal(index,2);
  assert.deepStrictEqual(plain(story.selection()),{section:0,kind:'step',index:2,pathId:'failed'});
  assert.equal(h.renders,0,'authoring navigation does not publish a source edit');
});

test('destroy retires real builder controls, held graph release and draft callbacks; remount publishes one Undo',()=>{
  const spec={nodes:{a:{},b:{}},rows:[['a','b']],steps:[{nodes:['a'],text:'start'}]},h=importHarness(null,spec),e=h.elements;
  const before=e.src.value;
  e.src.fire('input');const draft=h.scheduled.at(-1).fn;
  h.cards.a.fire('mousedown',{button:0,clientX:100,clientY:100});h.move(410,110,h.cards.b);
  const releases=h.windowListeners.mouseup.slice(),old=h.builder,jump=h.sandbox.BUILDER_JUMP_TO_FINDING;
  e.src.focus();old.destroy();old.destroy();
  assert.equal(h.doc.activeElement,e.src);assert.equal(h.svg.querySelector('.dv-ghost'),null);
  assert.equal(Object.values(h.listeners).flat().length,0);assert.equal(Object.values(h.windowListeners).flat().length,0);
  releases.forEach(fn=>fn({}));draft();h.click('add-step');old.loadSpec(spec);old.refreshCatalog();old.previewRendered({ok:true,replaced:true});jump('old',[]);
  assert.equal(e.src.value,before);assert.equal(h.renders,0);assert.equal(old.loadText('{invalid'),false);
  assert.equal(h.sandbox.BUILDER_JUMP_TO_FINDING,null);
  for(let i=0;i<3;i++){
    const current=h.mount();assert.notEqual(h.sandbox.BUILDER_JUMP_TO_FINDING,jump);old.destroy();
    h.click('add-step');assert.notEqual(e.src.value,before);h.click('undo-builder');assert.equal(e.src.value,before);
    assert.equal(e['undo-builder'].disabled,true);current.destroy();
    assert.equal(Object.values(h.listeners).flat().length,0);assert.equal(Object.values(h.windowListeners).flat().length,0);
  }
});

test('a throwing satellite destroy does not strand other builder resources or the source session',()=>{
  const h=importHarness(null,null,{initPanelPicker:()=>({refresh(){},destroy(){throw Error('panel cleanup failed');}})}),old=h.builder,before=h.elements.src.value;
  assert.throws(()=>old.destroy(),/panel cleanup failed/);assert.equal(Object.values(h.listeners).flat().length,0);
  assert.equal(Object.values(h.windowListeners).flat().length,0);assert.equal(h.sandbox.BUILDER_JUMP_TO_FINDING,null);
  assert.equal(old.loadText('{}'),false);h.click('add-step');assert.equal(h.elements.src.value,before);old.destroy();
});

test('Outline finds nested prose by content and retains full source addresses',()=>{
 const raw={sections:[{heading:'Story',bullets:[{text:'Parent',sub:['Child',{text:'Nested',sub:['Deep evidence']}]}]}]};
 const entries=plain(B.builderOutline(raw,'deep evidence'));
 assert.strictEqual(entries.length,1);
 assert.deepStrictEqual(entries[0].target,{kind:'bullet',section:0,index:0,bulletPath:[0,1,0]});
 assert.deepStrictEqual(entries[0].path,['sections',0,'bullets',0,'sub',1,'sub',0]);
});
