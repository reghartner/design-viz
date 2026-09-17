const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const spec = JSON.parse(fs.readFileSync(path.join(root,
  'docs/diagrams/doorbell-perspectives/doorbell-perspectives.spec.json'), 'utf8'));
const c = vm.createContext({});
for (const file of ['validator.js', 'engine.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, 'src', file), 'utf8'), c);
}
const diagram = spec.page.sections[0].diagram;
function at(pathId, stepId) {
  const d = c.diagramForPath(diagram, pathId);
  const i = stepId ? d.steps.findIndex(s => s.id === stepId) : d.steps.length - 1;
  assert.ok(i >= 0, `Missing ${stepId}`);
  const folded = c.foldPanelStates(d);
  return Object.fromEntries(Object.entries(folded).map(([id, states]) => [id, states[i]]));
}
const phoneCount = state => c.phoneModel(state['resident-phone']).notifications.length;

test('the two-perspective teaching seed builds a clean shared story', () => {
  const result = c.validate(c.normalize(spec));
  assert.equal(result.errors.length, 0, result.errors.join('\n'));
  assert.equal(result.warnings.length, 0, result.warnings.join('\n'));
  assert.equal(spec.page.sections.length, 1);
  assert.ok(diagram.sectionLayout.default.some(tile => !tile.panel && !tile.controls));
  assert.ok(diagram.sectionLayout.default.some(tile => tile.panel === 'home'));
  assert.equal(diagram.autoplay, false);
});

test('quiet recording precedes physical motion and stops only at local clip retention', () => {
  const ready = at('happy', 'ready'), arm = at('happy', 'arm');
  assert.equal(ready.clip.mode, 'active');
  assert.equal(arm.clip.mode, 'rec');
  assert.equal(arm.clip.scenePlayback, 'waiting');
  assert.equal(arm.home.visitor, null);
  assert.equal(at('happy', 'approach').clip.scenePlayback, 'playing');
  assert.equal(at('happy', 'consume').clip.mode, 'rec');
  assert.equal(at('happy', 'local-clip').clip.mode, 'save');
  const camera = diagram.panels[0].devices.find(d => d.id === 'cam');
  for (const id of ['approach', 'ring']) {
    const person = at('happy', id).home.visitor;
    const dx = person.x - camera.x, dy = person.y - camera.y;
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    const difference = Math.abs(((angle - camera.facing + 540) % 360) - 180);
    assert.ok(Math.hypot(dx, dy) <= camera.range, `${id} is in the illustrated recording range`);
    assert.ok(difference <= camera.spread / 2, `${id} is inside the illustrated camera sector`);
  }
});

test('a notification follows persistence and delivery, then the same visitor enters', () => {
  assert.equal(phoneCount(at('happy', 'push-request')), 0);
  const notified = at('happy', 'notify-resident');
  assert.equal(phoneCount(notified), 1);
  assert.equal(notified.checkpoints.results.cloud.status, 'pass');
  assert.equal(at('happy', 'fetch-clip').checkpoints.results.viewed.status, 'pending');
  const end = at('happy');
  assert.equal(phoneCount(end), 1);
  assert.equal(end.home.door, 'closed');
  const outline = diagram.panels.find(p => p.id === 'home').outline;
  const welcome = at('happy', 'welcome');
  assert.equal(welcome.home.door, 'open');
  for (const state of [welcome, end]) {
    assert.ok(state.home.visitor.x > outline.x && state.home.visitor.x < outline.x + outline.w);
    assert.ok(state.home.visitor.y > outline.y && state.home.visitor.y < outline.y + outline.h);
  }
  for (const result of Object.values(end.checkpoints.results)) assert.equal(result.status, 'pass');
});

test('storage rejection preserves local media without inventing notification or welcome', () => {
  at('happy'); // Revisit an alternate after success; no success patches may leak.
  const state = at('storage-rejected');
  assert.equal(state.clip.mode, 'save');
  assert.equal(state.checkpoints.results.local.status, 'pass');
  assert.equal(state.checkpoints.results.cloud.status, 'fail');
  assert.equal(phoneCount(state), 0);
  assert.equal(state.home.door, 'closed');
  assert.equal(state.home.resident.x, diagram.panels[0].initial.resident.x);
  assert.ok(state.home.visitor.x < diagram.panels[0].outline.x);
});

test('push rate limiting leaves a stored clip and pending delivery, not an invented retry', () => {
  assert.equal(at('push-delayed', 'push-delayed').outbox.state, 'empty',
    'The provider error is received after dequeue, before requeue');
  const state = at('push-delayed');
  assert.equal(state.checkpoints.results.local.status, 'pass');
  assert.equal(state.checkpoints.results.cloud.status, 'pass');
  assert.equal(state.checkpoints.results.notified.status, 'warn');
  assert.equal(state.outbox.state, 'held');
  assert.equal(phoneCount(state), 0);
  assert.equal(state.home.door, 'closed');
  assert.ok(state.home.visitor.x < diagram.panels[0].outline.x);
  for (const id of ['store-rejected', 'push-delayed']) {
    const step = diagram.steps.find(s => s.id === id);
    assert.ok(step.edge || step.edges, 'HTTP error response must be delivered');
    assert.equal(step.failures, undefined, 'HTTP error does not establish lost communication');
  }
  const rejected = diagram.steps.find(s => s.id === 'store-rejected');
  assert.deepEqual(rejected.edges, ['worker->store', 'store->worker'],
    'The rejected path must show the attempted request before its error response');
});
