import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

// Only jsdom comes from the upstream test toolchain. All product and React
// imports below resolve from this independent, tarball-installed consumer.
const { JSDOM } = await import(process.env.FLOWVIEW_CONSUMER_JSDOM);
const dom = new JSDOM('<!doctype html><div id="company-tab"></div>', {
  url: 'https://catalog.company.test/catalog/default/component/recording',
  pretendToBeVisual: true,
});
for (const name of [
  'window', 'document', 'navigator', 'HTMLElement', 'Element', 'SVGElement',
  'Node', 'MutationObserver', 'MouseEvent', 'Event', 'ShadowRoot',
]) Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name] });
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
globalThis.FontFace = dom.window.FontFace = class { load() { return Promise.resolve(this); } };
globalThis.ResizeObserver = dom.window.ResizeObserver = class { observe() {} disconnect() {} };
globalThis.matchMedia = dom.window.matchMedia = () => ({ matches: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(document, 'fonts', { configurable: true, value: new Set() });
Element.prototype.getAnimations = () => [];
Element.prototype.scrollIntoView = () => {};
SVGElement.prototype.getTotalLength = () => 100;
SVGElement.prototype.getPointAtLength = x => ({ x, y: 0 });

const React = await import('react');
const { createRoot } = await import('react-dom/client');
const plugin = await import('@flowview/backstage-plugin');
const cjs = createRequire(import.meta.url)('@flowview/backstage-plugin');
const { FlowviewEntityDiagrams, mountNativeViewer, parseEntityDiagrams, SPEC_MAX_BYTES } = plugin;
const spec = JSON.parse(await readFile(new URL('./spec.json', import.meta.url), 'utf8'));
const ref = 'component:default/recording';
const result = {
  version: 1, entityRef: ref, revision: 'company-index',
  diagrams: [{
    id: spec.page.canon.id, title: spec.page.title, revision: 'company-revision',
    kind: 'canonical', owner: spec.page.canon.owner,
    viewerUrl: 'https://diagrams.company.test/recording.html',
    editUrl: 'https://github.company.test/flows/edit/main/recording.json',
    sections: [{
      reference: 'recording', title: 'Recording', url: 'https://diagrams.company.test/recording.html#d=recording',
      nodes: [{ id: 'cloud', title: 'Recording service', relationship: 'service' }],
      paths: [{ id: 'failed', label: 'Unavailable', steps: [{
        id: 'failure', position: 1, title: 'Recording unavailable',
        url: 'https://diagrams.company.test/recording.html#d=recording&p=failed&s=failure',
      }] }],
    }],
  }],
};
assert.equal(SPEC_MAX_BYTES, 2 * 1024 * 1024);
assert.equal(cjs.SPEC_MAX_BYTES, SPEC_MAX_BYTES);
assert.equal(typeof cjs.FlowviewEntityDiagrams, 'function');
assert.deepEqual(Object.keys(cjs).sort(), Object.keys(plugin).sort());
assert.equal(parseEntityDiagrams(result, ref), result);
assert.throws(() => parseEntityDiagrams(result, 'component:default/other'));
for (const name of ['default', 'flowviewPlugin', 'EntityFlowviewContent', 'createDiagramLoader', 'createSpecLoader']) {
  assert.equal(name in plugin, false, 'Optional Backstage adapter leaked into root: ' + name);
}

const listCalls = [], specCalls = [];
const loadDiagrams = async (entityRef, signal) => {
  listCalls.push({ entityRef, signal });
  return parseEntityDiagrams(result, entityRef);
};
const loadSpec = async (diagram, signal) => {
  specCalls.push({ diagram, signal });
  return spec;
};
const root = createRoot(document.getElementById('company-tab'));
let direct;
try {
  await React.act(async () => {
    root.render(React.createElement(FlowviewEntityDiagrams, {
      entityRef: ref, loadDiagrams, loadSpec, refreshMs: 60_000,
    }));
  });
  assert.equal(listCalls.length, 1);
  assert.equal(listCalls[0].entityRef, ref);
  assert.deepEqual(specCalls[0].diagram, { id: 'consumer-recording', revision: 'company-revision' });
  assert.equal(listCalls[0].signal.aborted, false);
  assert.equal(document.querySelector('[role="alert"]')?.textContent, undefined,
    'The real viewer reported an error while rendering the installed package.');
  const nativeHost = document.querySelector('[data-flowview-native]');
  assert.ok(nativeHost?.shadowRoot, 'The published React component must mount the real native shadow viewer.');
  assert.ok(nativeHost.shadowRoot.querySelector('.docview'));
  assert.ok(nativeHost.shadowRoot.getElementById('i-cloud'));
  assert.match(nativeHost.shadowRoot.textContent, /Recording service/);
  assert.equal(document.getElementById('i-cloud'), null, 'Viewer content must remain inside its shadow root.');
  assert.equal(document.querySelector('iframe'), null);
  assert.equal(document.querySelector('[role="alert"]'), null);
  const jump = [...document.querySelectorAll('button')].find(button => button.textContent.includes('Recording unavailable'));
  assert.ok(jump);
  await React.act(async () => jump.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  assert.equal(nativeHost.shadowRoot.querySelector('.stepid')?.textContent, 'failure');
  assert.match(nativeHost.shadowRoot.querySelector('.stepline')?.textContent, /Recording unavailable/);
  await React.act(async () => root.unmount());
  assert.equal(listCalls[0].signal.aborted, true);
  assert.equal(specCalls[0].signal.aborted, true);
  assert.equal(nativeHost.shadowRoot.childNodes.length, 0);

  const host = document.createElement('div');
  document.body.append(host);
  direct = mountNativeViewer(host, spec, { scrollIntoView: false });
  direct.navigate({ section: 'recording', path: 'happy', step: 'save' });
  assert.equal(direct.root.querySelector('.stepid')?.textContent, 'save');
  direct.destroy();
  assert.equal(host.shadowRoot.childNodes.length, 0);

  console.log('Packed ESM/CJS root, custom React loaders, and real native viewer passed without Backstage.');
} finally {
  await React.act(async () => root.unmount());
  direct?.destroy();
  dom.window.close();
}
