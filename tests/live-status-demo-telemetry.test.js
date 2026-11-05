'use strict';
// #944 PR 2: the #live=demo provider replays production telemetry beside Jira.
// D1 the example timeline carries a per-day `telemetry` block for the bound carriers.
// D2 liveStatusDemoTelemetry(day) returns the proof engine's input shape
//    {carrierId: {signals: {name: {value, series: [[t, v], ...], unit}}, observedAt}} (#938).
// D3 the example spec binds exactly those carriers, with the same signal names and units,
//    and validates with no warnings.
// D4 the story: Day 12 push edge silent (rate series all zero), event edge error ratio above
//    its authored limit, route queue lag above its limit on Day 11 only.
// D5 the panel's demo day controls drive the Jira map and the telemetry map together.
// -- Playwright demo spec (ticket #944 "Test + flip": on Day 12 the push edge is silent and the event edge degraded):
//    excluded — orchestrator ruling: no visible surface until #939 PR 2; moved to #939.
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { entrypoint } = require('../tools/source-loader.cjs');
const ROOT = path.resolve(__dirname, '..');
const readJson = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const timeline = () => readJson('examples/live-status/live-status.timeline.json');
const spec = () => readJson('examples/live-status/live-status.spec.json');
const plain = value => JSON.parse(JSON.stringify(value));
const HOUR = 3600000, DAY = 24 * HOUR;
const STORY_START = Date.parse('2026-10-20T00:00:00Z');
const nowOf = index => STORY_START + (index + 1) * DAY;
const DAY9 = 8, DAY10 = 9, DAY11 = 10, DAY12 = 11;
const BOUND = ['button->mcu', 'ingest', 'ingest->notify', 'mcu->chime', 'mcu->ingest', 'notify', 'notify->app'];

function context() {
  const C = { URL, TextEncoder, window: { matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) },
    setTimeout: () => 1, clearTimeout() {} };
  vm.createContext(C);
  vm.runInContext(entrypoint('standalone').body, C);
  return C;
}
// The example's bindings, parsed by the shared #937 parser: {carrierId: {kind, signals, proof}}.
function bindings(C) {
  const page = spec().page, diagram = page.sections[0].diagram;
  const templates = C.trackingTelemetry(page).templates, out = {};
  for (const [id, node] of Object.entries(diagram.nodes)) { const b = C.carrierTelemetry(node, templates); if (b) out[id] = plain(b); }
  for (const edge of diagram.edges) { const b = C.carrierTelemetry(edge, templates); if (b) out[edge.from + '->' + edge.to] = plain(b); }
  return out;
}
const ratio = (entry, name, of) => entry.signals[name].value / entry.signals[of].value;

test('D1: every story day carries a telemetry block for the bound carriers, with the Day 10 deploy annotation', () => {
  const days = timeline().days;
  assert.equal(days.length, 12);
  days.forEach((day, index) => {
    assert.ok(day.telemetry && typeof day.telemetry === 'object', 'days[' + index + '].telemetry');
    assert.equal(Date.parse(day.telemetry.start), STORY_START + index * DAY, 'days[' + index + '].telemetry.start is that day\'s midnight');
    assert.equal(day.telemetry.stepSeconds, 3600);
    assert.deepEqual(Object.keys(day.telemetry.carriers).sort(), BOUND, 'days[' + index + '] carriers');
    for (const [id, signals] of Object.entries(day.telemetry.carriers)) {
      for (const [name, signal] of Object.entries(signals)) {
        assert.equal(signal.values.length, 24, id + '.' + name + ' on day index ' + index);
        assert.ok(signal.values.every(v => v === null || (typeof v === 'number' && Number.isFinite(v))), id + '.' + name);
        assert.equal(typeof signal.unit, 'string');
      }
    }
  });
  const deploy = days[DAY10].telemetry.annotations.find(a => /firmware 2\.4\.1/.test(a.text));
  assert.ok(deploy, 'Day 10 carries the firmware 2.4.1 deploy annotation');
  assert.ok(deploy.tags.includes('deploy') && deploy.tags.includes('firmware'));
  assert.equal(deploy.time.slice(0, 10), '2026-10-29');
  for (const [index, day] of days.entries()) {
    for (const a of day.telemetry.annotations) {
      const t = Date.parse(a.time);
      assert.ok(t >= STORY_START + index * DAY && t < nowOf(index), a.text + ' lies on its day');
    }
  }
});

test('D2: liveStatusDemoTelemetry returns the proof engine input shape for one story day', () => {
  const C = context();
  assert.equal(typeof C.liveStatusDemoTelemetry, 'function', 'liveStatusDemoTelemetry(day) is a standalone demo helper');
  const day = timeline().days[DAY12];
  const map = plain(C.liveStatusDemoTelemetry(day));
  assert.deepEqual(Object.keys(map).sort(), BOUND);
  for (const [id, entry] of Object.entries(map)) {
    assert.deepEqual(Object.keys(entry).sort(), ['observedAt', 'signals'], id);
    assert.equal(Date.parse(entry.observedAt), nowOf(DAY12), id + ' observedAt is the story day\'s now');
    assert.deepEqual(Object.keys(entry.signals).sort(), Object.keys(day.telemetry.carriers[id]).sort(), id);
    for (const [name, signal] of Object.entries(entry.signals)) {
      const authored = day.telemetry.carriers[id][name];
      assert.deepEqual(Object.keys(signal).sort(), ['series', 'unit', 'value'], id + '.' + name);
      assert.equal(signal.unit, authored.unit);
      assert.equal(signal.series.length, 24);
      signal.series.forEach(([t, v], k) => {
        assert.equal(t, STORY_START + DAY12 * DAY + (k + 1) * HOUR, 'points stamp the end of their hour');
        // A query that ran and matched nothing is reported as 0 (proof engine contract).
        assert.equal(v, authored.values[k] === null ? 0 : authored.values[k]);
      });
      assert.equal(signal.value, signal.series[23][1], id + '.' + name + ' value is the last hour');
    }
  }
  assert.deepEqual(plain(C.liveStatusDemoTelemetry({ issues: {} })), {}, 'a day without a block has no telemetry');
  assert.deepEqual(plain(C.liveStatusDemoTelemetry({ issues: {}, telemetry: { start: 'nope', stepSeconds: 3600, carriers: {} } })), {});
});

test('D3: the example spec binds exactly the timeline carriers with the same signals and units, and validates clean', () => {
  const C = context();
  const bound = bindings(C);
  assert.deepEqual(Object.keys(bound).sort(), BOUND);
  const carriers = timeline().days[DAY12].telemetry.carriers;
  for (const [id, binding] of Object.entries(bound)) {
    assert.deepEqual(Object.keys(binding.signals).sort(), Object.keys(carriers[id]).sort(), id + ' signals');
    for (const [name, signal] of Object.entries(binding.signals)) assert.equal(signal.unit, carriers[id][name].unit, id + '.' + name + ' unit');
    assert.ok(Object.keys(binding.proof).length > 0, id + ' has proof limits');
  }
  const page = spec().page;
  assert.deepEqual(plain(C.trackingTelemetry(page)).grafana, { prometheus: 'prom-main', loki: 'loki-main', tempo: 'tempo-main' });
  const result = C.validate(page);
  assert.deepEqual(plain(result.errors), []);
  assert.deepEqual(plain(result.warnings), []);
});

test('D4: the demo story: push silent on Day 12, event degraded past its limit, route lag past its limit on Day 11 only', () => {
  const C = context(), bound = bindings(C), days = timeline().days;
  assert.equal(typeof C.liveStatusDemoTelemetry, 'function', 'liveStatusDemoTelemetry(day) is a standalone demo helper');
  const at = index => plain(C.liveStatusDemoTelemetry(days[index]));
  const day12 = at(DAY12);
  const push = day12['notify->app'];
  for (const name of Object.keys(push.signals)) {
    assert.ok(push.signals[name].series.every(([, v]) => v === 0), 'push ' + name + ' series all zero');
    assert.equal(push.signals[name].value, 0);
  }
  for (const key of ['BE-68', 'UX-89']) assert.equal(days[DAY12].issues[key].state, 'done', key + ' is Done on Day 12');
  const errorLimit = bound['mcu->ingest'].proof.errors;
  assert.equal(errorLimit.maxRatioOf, 'rate');
  assert.ok(ratio(day12['mcu->ingest'], 'errors', 'rate') > errorLimit.max, 'event errors above the authored ratio limit on Day 12');
  assert.ok(day12['mcu->ingest'].signals.rate.value >= bound['mcu->ingest'].proof.rate.min, 'the event edge still carries traffic');
  assert.ok(at(DAY9)['button->mcu'].signals.rate.value >= 10, 'press flows on Day 9');
  assert.equal(at(DAY9)['mcu->ingest'],undefined,'no observation before FW-45 is Done; never an implicit zero');
  for(const key of ['BE-68','UX-89'])assert.equal(days[DAY9].issues[key].state,'done','Day 9 push ticket is Done');
  assert.equal(at(DAY9)['notify->app'].signals.rate.value,0,'Day 9 push has explicit zero traffic');
  const lagLimit = bound['ingest->notify'].proof.lag.max, ageLimit = bound['ingest->notify'].proof.age.max;
  for (const [index, lagging] of [[DAY10, false], [DAY11, true], [DAY12, false]]) {
    const route = at(index)['ingest->notify'].signals;
    assert.equal(route.lag.value > lagLimit, lagging, 'lag on day index ' + index);
    assert.equal(route.age.value > ageLimit, lagging, 'age on day index ' + index);
  }
});

test('D5: the demo day controls drive the Jira map and the telemetry map together', () => {
  const C = context(), days = timeline().days;
  const doc = { getElementById: id => id === 'live-timeline' ? { textContent: JSON.stringify(timeline()) } : null,
    addEventListener() {}, removeEventListener() {}, hidden: false };
  const demo = C.createLiveStatusDemo(doc);
  assert.equal(typeof demo.telemetry?.provider, 'function', 'the demo exposes a telemetry provider beside the Jira provider');
  const jira = [], telemetry = [];
  let controls = null;
  const api = { refs: () => ({ tickets: ['HW-123', 'HW-124', 'FW-45', 'FW-46', 'UX-89', 'BE-67', 'BE-68'] }), apply: map => jira.push(plain(map)),
    note() {}, status() {}, setHistory() {}, setDemoControls: value => { controls = value; }, telemetry: { apply: map => telemetry.push(plain(map)) } };
  demo.demo.mount(api);
  assert.equal(jira.length, 1);
  assert.equal(telemetry.length, 1, 'mounting paints Day 1 telemetry with Day 1 Jira');
  for (let index = 1; index < days.length; index++) {
    controls.next();
    assert.equal(jira.length, index + 1);
    assert.equal(telemetry.length, index + 1, 'Next day repaints telemetry on day index ' + index);
    assert.equal(jira.at(-1)['FW-45'].state, days[index].issues['FW-45'].state);
    for (const entry of Object.values(telemetry.at(-1))) assert.equal(Date.parse(entry.observedAt), nowOf(index));
    assert.deepEqual(plain(demo.telemetry.provider()), telemetry.at(-1), 'the provider answers the current day');
  }
  assert.ok(ratio(telemetry.at(-1)['mcu->ingest'], 'errors', 'rate') > 0.01);
  // Hosts without a telemetry sink still play the Jira story.
  const quiet = C.createLiveStatusDemo(doc), seen = [];
  quiet.demo.mount({ ...api, apply: map => seen.push(map), telemetry: undefined });
  assert.equal(seen.length, 1);
});
