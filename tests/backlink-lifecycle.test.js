'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {readSource} = require('../tools/source-loader.cjs');
const code = ['canon.js', 'validator.js', 'engine.js'].map(file => readSource(file)).join('\n');
const backlinks = {Relay: [{href: 'other.html', title: 'Other page'}]};
const diagram = {nodes: {relay: {title: 'Relay', link: 'https://example.test/source'}}, rows: [['relay']]};

function harness() {
  const timers = new Map();
  let nextTimer = 0, document;
  function element(tag = 'div') {
    const events = new Map(), attrs = {}, classes = new Set();
    const node = {tag, events, children: [], parentNode: null, hidden: false, style: {setProperty() {}},
      className: '', offsetWidth: 260, offsetHeight: 40, focusCount: 0,
      classList: {add: name => classes.add(name), remove: name => classes.delete(name),
        contains: name => classes.has(name), toggle(name, on) { if (on) classes.add(name); else classes.delete(name); }},
      addEventListener(type, fn) { if (!events.has(type)) events.set(type, new Set()); events.get(type).add(fn); },
      removeEventListener(type, fn) { events.get(type)?.delete(fn); },
      count(type) { return type ? (events.get(type)?.size || 0) : [...events.values()].reduce((sum, set) => sum + set.size, 0); },
      emit(type, fields = {}) {
        const ev = {type, target: node, relatedTarget: null, preventDefault() {}, stopPropagation() {}, ...fields};
        for (const fn of [...(events.get(type) || [])]) fn(ev);
      },
      setAttribute(name, value) { attrs[name] = String(value); }, getAttribute(name) { return attrs[name] ?? null; },
      removeAttribute(name) { delete attrs[name]; },
      appendChild(child) { child.remove(); child.parentNode = node; node.children.push(child); return child; },
      remove() { if (node.parentNode) node.parentNode.children = node.parentNode.children.filter(child => child !== node); node.parentNode = null; },
      replaceChildren() { for (const child of [...node.children]) child.remove(); },
      contains(target) { return target === node || node.children.some(child => child.contains(target)); },
      querySelectorAll(selector) {
        const matches = candidate => selector[0] === '.' ? candidate.className.split(' ').includes(selector.slice(1)) : candidate.tag === selector;
        return node.children.flatMap(child => [...(matches(child) ? [child] : []), ...child.querySelectorAll(selector)]);
      },
      querySelector(selector) { return node.querySelectorAll(selector)[0] || null; },
      focus() { node.focusCount++; document.activeElement = node; node.emit('focus'); },
      getBoundingClientRect() { return {left: 100, top: 40, bottom: 60, width: 20}; },
    };
    Object.defineProperties(node, {
      firstChild: {get: () => node.children[0]}, parentElement: {get: () => node.parentNode},
      isConnected: {get: () => !!node.parentNode},
      innerHTML: {set(html) {
        node.replaceChildren();
        if (!html.startsWith('<svg ')) return;
        const svg = node.appendChild(element('svg'));
        // Only the link triggers need DOM nodes in these layout-free boards.
        for (const match of html.matchAll(/<g class="([^"]*)"[^>]*data-dv-node-id="([^"]*)"[^>]*>/g)) {
          const trigger = svg.appendChild(element('g')); trigger.className = match[1];
          trigger.setAttribute('data-dv-node-id', match[2]);
        }
      }},
    });
    return node;
  }
  document = element('document');
  document.documentElement = {clientWidth: 1200, clientHeight: 800};
  document.createElement = element;
  document.getElementById = () => null;
  const window = Object.assign(element('window'), {innerWidth: 1200, innerHeight: 800});
  const c = vm.createContext({document, window, URL,
    setTimeout(fn, delay) { const id = nextTimer++; timers.set(id, {fn, delay}); return id; },
    clearTimeout: id => timers.delete(id),
  });
  vm.runInContext(code, c);
  function mount() {
    const scroll = element(), host = scroll.appendChild(element()), svg = host.appendChild(element('svg'));
    const trigger = svg.appendChild(element('g')); trigger.className = 'nbackref';
    trigger.setAttribute('data-dv-node-id', 'relay');
    const ctl = c.wireNodeBacklinks(host, svg, diagram, 'flow', backlinks);
    return {scroll, host, svg, trigger, ctl, pop: host.children[1]};
  }
  return {c, document, window, element, timers, mount,
    flush() { const pending = [...timers.values()]; timers.clear(); for (const timer of pending) timer.fn(); }};
}

test('backlinks without triggers allocate no popover, listeners or timer', () => {
  const h = harness(), host = h.element(), svg = h.element('svg');
  assert.equal(h.c.wireNodeBacklinks(host, svg, diagram, 'flow', backlinks), null);
  assert.equal(host.children.length, 0); assert.equal(h.document.count(), 0); assert.equal(h.timers.size, 0);
});

test('hover delay, focus, pin, Escape, click-away and scroll dismissal stay functional', () => {
  const h = harness(), {trigger, pop, scroll, ctl} = h.mount();
  trigger.emit('mouseenter'); assert.equal(pop.hidden, false);
  assert.equal(pop.children[1].href, 'other.html');
  trigger.emit('mouseleave'); assert.equal([...h.timers.values()][0].delay, 140);
  pop.emit('mouseenter'); assert.equal(h.timers.size, 0);
  pop.emit('mouseleave'); h.flush(); assert.equal(pop.hidden, true);
  trigger.focus(); trigger.emit('mouseleave'); assert.equal(h.timers.size, 0);
  h.document.activeElement = pop.children[1];
  pop.emit('keydown', {key: 'Escape'});
  assert.equal(pop.hidden, true); assert.equal(h.document.activeElement, trigger);
  trigger.emit('keydown', {key: 'Enter'}); assert.equal(pop.hidden, false);
  h.document.activeElement = null; trigger.emit('mouseleave'); assert.equal(h.timers.size, 0);
  trigger.emit('click'); assert.equal(pop.hidden, true);
  trigger.emit('click'); h.document.emit('click', {target: h.element()}); assert.equal(pop.hidden, true);
  trigger.emit('click'); scroll.emit('scroll'); assert.equal(pop.hidden, true);
  ctl.destroy();
});

test('destroy cancels pending work, releases every owned listener and stays idempotent', () => {
  const h = harness(), external = () => {};
  h.document.addEventListener('click', external);
  for (let i = 0; i < 5; i++) {
    const {trigger, pop, scroll, host, ctl} = h.mount();
    assert.equal(h.document.count('click'), 2); assert.equal(scroll.count('scroll'), 1);
    trigger.emit('mouseenter'); trigger.emit('mouseleave');
    const staleShow = [...trigger.events.get('mouseenter')][0], staleLeave = [...trigger.events.get('mouseleave')][0];
    const staleClose = [...h.timers.values()][0].fn;
    assert.equal(h.timers.size, 1); const focusBefore = trigger.focusCount;
    ctl.destroy(); ctl.destroy();
    assert.equal(h.timers.size, 0); assert.equal(h.document.count('click'), 1);
    assert.equal(scroll.count(), 0); assert.equal(trigger.count(), 0); assert.equal(pop.count(), 0);
    assert.equal(trigger.getAttribute('aria-expanded'), 'false'); assert.equal(trigger.getAttribute('aria-controls'), null);
    assert.equal(trigger.focusCount, focusBefore); assert.equal(pop.parentNode, null); assert.equal(host.children.length, 1);
    staleShow(); staleLeave(); staleClose();
    assert.equal(pop.hidden, true); assert.equal(h.timers.size, 0); assert.equal(trigger.focusCount, focusBefore);
  }
  assert.equal(h.document.events.get('click').has(external), true);
});

test('board replacement disposes both link menus before mounting their replacements', () => {
  const h = harness(), scroll = h.element(), host = scroll.appendChild(h.element());
  let prior;
  for (let i = 0; i < 5; i++) {
    h.c.renderBoard(host, diagram, 'flow', 'aurora', h.c.resolveProtocols({}), backlinks);
    if (prior) {
      assert.equal(prior.pop.parentNode, null); assert.equal(prior.refs.parentNode, null);
      assert.equal(prior.trigger.count(), 0); assert.equal(h.timers.size, 0);
    }
    const trigger = host.querySelector('.nbackref'), pop = host.querySelector('.nbackpop');
    const refTrigger = host.querySelector('.nrefs-trigger'), refs = host.querySelector('.node-link-menu');
    assert.ok(host._nodeBacklinks); assert.ok(host._nodeLinks);
    assert.equal(h.document.count(), 1); assert.equal(scroll.count(), 1); assert.equal(h.window.count(), 0);
    trigger.emit('mouseenter'); h.document.activeElement = null; trigger.emit('mouseleave');
    refTrigger.emit('click'); assert.equal(refs.hidden, false); assert.equal(h.document.count(), 5);
    assert.equal(h.window.count(), 1); prior = {trigger, pop, refs};
  }
  h.c.renderBoard(host, {nodes: {}, rows: [[]]}, 'empty', 'aurora', h.c.resolveProtocols({}), {});
  assert.equal(host._nodeBacklinks, null); assert.equal(host._nodeLinks, null);
  assert.equal(h.document.count(), 0); assert.equal(scroll.count(), 0); assert.equal(h.window.count(), 0); assert.equal(h.timers.size, 0);
});

test('section and page destruction release link menus even without a stepper', () => {
  for (const destroySection of [true, false]) {
    const h = harness(), view = h.element();
    const page = h.c.renderPage(view, {sections: [{diagram}]}, 'aurora', backlinks);
    const host = view.querySelector('.boardcanvas'), trigger = host.querySelector('.nbackref');
    const pop = host.querySelector('.nbackpop'), refs = host.querySelector('.node-link-menu');
    trigger.emit('mouseenter'); trigger.emit('mouseleave'); host.querySelector('.nrefs-trigger').emit('click');
    assert.equal(page.steppers.length, 0); assert.equal(h.timers.size, 1); assert.equal(h.document.count(), 5);
    if (destroySection) page.sections[0].destroy(); else page.destroy();
    page.destroy();
    assert.equal(h.document.count(), 0); assert.equal(h.window.count(), 0); assert.equal(h.timers.size, 0);
    assert.equal(host.parentNode.count('scroll'), 0); assert.equal(trigger.count(), 0);
    assert.equal(pop.parentNode, null); assert.equal(refs.parentNode, null);
    assert.equal(host._nodeBacklinks, null); assert.equal(host._nodeLinks, null);
  }
});

test('authored menus track moved scroll ancestors across a native shadow boundary', () => {
  const h = harness(), scroller = h.element(), mountHost = scroller.appendChild(h.element());
  scroller.scrollTop = 0; scroller.scrollLeft = 0;
  const shadowBody = h.element(), host = shadowBody.appendChild(h.element());
  shadowBody.getRootNode = () => ({host: mountHost});
  h.document.scrollingElement = scroller;
  h.c.renderBoard(host, diagram, 'flow', 'aurora', h.c.resolveProtocols({}), {});
  const trigger = host.querySelector('.nrefs-trigger'), pop = host.querySelector('.node-link-menu');
  trigger.emit('click'); assert.equal(pop.hidden, false);
  const nativeDocument = {nodeType: 9};
  h.document.emit('scroll', {target: nativeDocument});
  assert.equal(pop.hidden, false, 'queued scroll without movement does not dismiss');
  scroller.scrollTop = 20; h.document.emit('scroll', {target: nativeDocument});
  assert.equal(pop.hidden, true, 'host document movement dismisses the anchored menu');
  trigger.emit('click'); scroller.scrollTop = 40; h.document.emit('scroll', {target: scroller});
  assert.equal(pop.hidden, true, 'an outer element scroll container is tracked too');
  host._nodeLinks.destroy(); assert.equal(h.document.count(), 0); assert.equal(h.window.count(), 0);
});
