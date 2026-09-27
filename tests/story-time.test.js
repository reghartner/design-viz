'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {readSource} = require('../tools/source-loader.cjs');
const C = {URL}; vm.createContext(C);
for (const name of ['compatibility', 'validator', 'workbench/source-edit', 'workbench/targets', 'workbench/commands/common', 'workbench/commands/graph', 'workbench/inspector-model'])
  vm.runInContext(readSource(name + '.js'), C);
const plain = value => JSON.parse(JSON.stringify(value));
const step = (extra = {}) => ({nodes: ['a'], ...extra});
const diagram = (extra = {}) => ({nodes: {a: {}}, rows: [['a']], storyTime: {start: '2026-09-24T22:30'}, ...extra});
const warnings = d => C.validate(C.normalize(d)).warnings;
const pick = (d, id, key, pathId) => plain(C.foldPanelStates(pathId ? C.diagramForPath(d, pathId) : d)[id]).map(s => s[key]);

test('parsing: absolute, relative and time-of-day forms; invalid values are null', () => {
  const start = C.storyTimeAbsolute('2026-09-24T22:30');
  assert.equal(new Date(start).toISOString(), '2026-09-24T22:30:00.000Z');
  assert.equal(C.storyTimeAbsolute('2026-09-24 22:30:15'), start + 15000);
  for (const bad of ['2026-02-30T10:00', '2026-09-24T24:00', '2026-9-24T10:00', 'tomorrow', 42, null])
    assert.equal(C.storyTimeAbsolute(bad), null, String(bad));
  assert.equal(C.storyTimeResolve('+3h19m', start) - start, (3 * 60 + 19) * 60000);
  assert.equal(C.storyTimeResolve('+1d2h', start) - start, 26 * 3600000);
  assert.equal(C.storyTimeResolve('+90s', start) - start, 90000);
  assert.equal(new Date(C.storyTimeResolve('06:50', start)).toISOString(), '2026-09-25T06:50:00.000Z', 'rolls over midnight');
  assert.equal(new Date(C.storyTimeResolve('23:10', start)).toISOString(), '2026-09-24T23:10:00.000Z', 'same day when still ahead');
  assert.equal(C.storyTimeResolve('22:30', start), start, 'the current time of day does not advance');
  for (const bad of ['+', '+3m2h', '-5m', '3h', '+1.5h', '25:00', '', {}])
    assert.equal(C.storyTimeResolve(bad, start), null, JSON.stringify(bad));
  assert.equal(C.storyTimeDuration('1d2h30m', false), (26 * 60 + 30) * 60000);
});

test('formatting follows the diagram clock and date options', () => {
  const t = C.storyTimeAbsolute('2026-09-24T22:05');
  assert.equal(C.storyTimeClock(t, '12h'), '10:05');
  assert.equal(C.storyTimeClock(t, '24h'), '22:05');
  assert.equal(C.storyTimeClock(C.storyTimeAbsolute('2026-09-25T00:07'), '12h'), '12:07');
  assert.equal(C.storyTimeClock(C.storyTimeAbsolute('2026-09-25T07:00'), '24h'), '07:00');
  assert.equal(C.storyTimeDate(t, 'short'), 'Thu, Sep 24');
  assert.equal(C.storyTimeDate(t, 'long'), 'Thursday, September 24');
  assert.equal(C.storyTimeDate(t, 'iso'), '2026-09-24');
  assert.equal(C.storyTimeDate(t, 'none'), null);
  assert.equal(C.storyTimeLabel(t, {clock: '12h'}), 'Thu, Sep 24 · 10:05 PM');
  assert.equal(C.storyTimeLabel(t, {clock: '24h', date: 'iso'}), '2026-09-24 · 22:05');
});

test('every time-bearing panel inherits the step time; steps without time keep it', () => {
  const d = diagram({
    storyTime: {start: '2026-09-24T22:30', clock: '24h', date: 'iso'},
    panels: [{id: 'ph', type: 'phone'}, {id: 'da', type: 'deviceapp', fields: [{id: 'battery', kind: 'battery'}]}, {id: 'as', type: 'appscreens', screens: []}],
    steps: [step(), step({time: '+45m'}), step(), step({time: '06:50'}), step({time: '2026-09-26T12:00'})]
  });
  for (const id of ['ph', 'da', 'as']) {
    assert.deepEqual(pick(d, id, 'clock'), ['22:30', '23:15', '23:15', '06:50', '12:00'], id);
    assert.deepEqual(pick(d, id, 'date'), ['2026-09-24', '2026-09-24', '2026-09-24', '2026-09-25', '2026-09-26'], id);
  }
  d.storyTime.date = 'none';
  assert.deepEqual(pick(d, 'ph', 'date'), [undefined, undefined, undefined, undefined, undefined]);
  assert.deepEqual(plain(warnings(d)), []);
});

test('explicit panel clock/date pins until story time moves; enterOnce lasts one step', () => {
  const d = diagram({
    panels: [{id: 'ph', type: 'phone', initial: {clock: '9:41'}}, {id: 'as', type: 'appscreens', screens: []}],
    steps: [
      step(),
      step({time: '+1h', panels: {ph: {clock: 'LOCKED', date: ''}}}),
      step(),
      step({time: '+1m'}),
      step({panels: {as: {enterOnce: {clock: 'ONCE'}}}}),
      step()
    ]
  });
  assert.deepEqual(pick(d, 'ph', 'clock'), ['9:41', 'LOCKED', 'LOCKED', '11:31', '11:31', '11:31']);
  assert.deepEqual(pick(d, 'ph', 'date'), ['Thu, Sep 24', '', '', 'Thu, Sep 24', 'Thu, Sep 24', 'Thu, Sep 24']);
  assert.deepEqual(pick(d, 'as', 'clock'), ['10:30', '11:30', '11:30', '11:31', 'ONCE', '11:31']);
});

test('paths fold separately: a shared relative step resolves against each path', () => {
  const d = diagram({
    panels: [{id: 'ph', type: 'phone'}, {id: 'b', type: 'battery', drainPerHour: 2, initial: {charge: 50}}],
    steps: [step({id: 'start'}), step({id: 'quick', time: '+10m'}), step({id: 'slow', time: '+5h'}), step({id: 'end', time: '+1h'})],
    paths: [{id: 'quick', steps: ['start', 'quick', 'end']}, {id: 'slow', steps: ['start', 'slow', 'end']}]
  });
  assert.deepEqual(pick(d, 'ph', 'clock', 'quick'), ['10:30', '10:40', '11:40']);
  assert.deepEqual(pick(d, 'ph', 'clock', 'slow'), ['10:30', '3:30', '4:30']);
  assert.deepEqual(pick(d, 'b', 'charge', 'quick'), [50, 49.67, 47.67]);
  assert.deepEqual(pick(d, 'b', 'charge', 'slow'), [50, 40, 38]);
});

test('battery drift: drain, charging, anchors, additional drain, clamping and rounding', () => {
  const d = diagram({
    deviceDefaults: {battery: {drainPerHour: 0.5, chargePerHour: 10}},
    panels: [{id: 'b', type: 'battery', initial: {charge: 10, trend: 'idle'}}],
    steps: [
      step(),                                                   // 10 (no time moved)
      step({time: '+3h', panels: {b: {drain: 1}}}),             // 10 - 1.5 - 1 = 7.5
      step({time: '+30m', panels: {b: {trend: 'charging'}}}),   // interval was idle: 7.25
      step({time: '+2h'}),                                      // charging: 27.25
      step({time: '+10h'}),                                     // clamps at 100
      step({panels: {b: {charge: 40, trend: 'draining'}}}),     // anchor exactly
      step({time: '+20m', panels: {b: {drain: 100}}}),          // 40 - 0.1667 - 100 → 0
      step({time: '+1h'})                                       // stays at 0
    ]
  });
  assert.deepEqual(pick(d, 'b', 'charge'), [10, 7.5, 7.25, 27.25, 100, 40, 0, 0]);
  assert.ok(pick(d, 'b', 'drain').every(v => v === undefined), 'drain is an operation, never carried');
  d.panels[0].drainPerHour = 3;  // panel constant beats the diagram default
  assert.equal(pick(d, 'b', 'charge')[1], 0);
  d.panels[0].drainPerHour = 0; d.panels[0].chargePerHour = 0;
  assert.deepEqual(pick(d, 'b', 'charge'), [10, 9, 9, 9, 9, 40, 0, 0]);
  delete d.deviceDefaults;  // built-in constants: drain 1, charge 20
  delete d.panels[0].drainPerHour; delete d.panels[0].chargePerHour;
  assert.deepEqual(plain(C.storyBatteryConstants(d.panels[0], d)), {drainPerHour: 1, chargePerHour: 20});
  assert.equal(pick(d, 'b', 'charge')[1], 6);
  const frac = diagram({panels: [{id: 'b', type: 'battery', initial: {charge: 50}}], steps: [step({time: '+10m'})]});
  assert.deepEqual(pick(frac, 'b', 'charge'), [49.83], 'kept to two decimals');
  const nodata = diagram({panels: [{id: 'b', type: 'battery'}], steps: [step({time: '+1h', panels: {b: {drain: 3}}}), step({time: '+1h', panels: {b: {charge: 30}}}), step({time: '+1h'})]});
  assert.deepEqual(pick(nodata, 'b', 'charge'), [undefined, 30, 29], 'no data stays unknown until an anchor');
});

test('drain works without story time; without story time and drain nothing changes', () => {
  const d = {nodes: {a: {}}, rows: [['a']], panels: [{id: 'b', type: 'battery', initial: {charge: 80}}],
    steps: [step({time: '+5h'}), step({panels: {b: {drain: 2.5}}}), step({panels: {b: {charge: 60}}}), step()]};
  assert.deepEqual(pick(d, 'b', 'charge'), [80, 77.5, 60, 60]);
  assert.match(warnings(d).join('\n'), /steps\[0\]\.time: ignored — declare diagram\.storyTime\.start/);
  d.steps[1].panels.b = {note: 'x'};
  const legacy = plain(C.foldCommonPanelStates(d.panels[0], d.steps));
  assert.deepEqual(plain(C.foldPanelStates(d).b), legacy);
});

test('existing specs fold exactly like the legacy per-panel folds (no story time)', () => {
  const root = path.join(__dirname, '..');
  const files = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p); else if (e.name.endsWith('.spec.json')) files.push(p);
    }
  })(path.join(root, 'examples'));
  const diagrams = (v, out = []) => {
    if (Array.isArray(v)) v.forEach(x => diagrams(x, out));
    else if (v && typeof v === 'object') { if (v.nodes && v.rows) out.push(v); Object.values(v).forEach(x => diagrams(x, out)); }
    return out;
  };
  let compared = 0;
  for (const file of files) for (const d of diagrams(JSON.parse(fs.readFileSync(file, 'utf8')))) {
    if (d.storyTime) continue;
    for (const route of C.diagramPathList(d)) {
      const x = C.diagramForPath(d, route.id), folded = plain(C.foldPanelStates(x));
      for (const p of d.panels || []) {
        if (!p || !p.id) continue;
        const def = C.PanelRegistry.get(p.type), fold = def && def.fold || C.foldCommonPanelStates;
        assert.deepEqual(folded[p.id], plain(fold(p, x.steps)), path.relative(root, file) + ' ' + route.id + ' ' + p.id);
        compared++;
      }
    }
  }
  assert.ok(compared > 50, 'compared ' + compared + ' panels');
});

test('validator: story time declaration, unparsable and backward times per path, end, constants and drain', () => {
  const d = diagram({
    storyTime: {start: '2026-09-24T22:30', end: '2026-09-25T02:00', clock: '13h', date: 'weird', zone: 'UTC'},
    deviceDefaults: {battery: {drainPerHour: -1, speed: 2}, phone: {}},
    panels: [{id: 'b', type: 'battery', chargePerHour: 'fast', initial: {charge: 50, drain: 2}}],
    steps: [step({id: 's0'}), step({id: 's1', time: 'soon'}), step({id: 's2', time: '2026-09-24T21:00'}), step({id: 's3', time: '+6h', panels: {b: {drain: -2}}}), step({id: 's4', panels: {b: {drain: 1, charge: 20}}})],
    paths: [{id: 'main', steps: ['s0', 's1', 's2', 's3', 's4']}, {id: 'alt', steps: ['s0', 's2']}]
  });
  const text = warnings(d).join('\n');
  for (const re of [/storyTime\.clock: unknown clock "13h"/, /storyTime\.date: unknown date format "weird"/, /storyTime\.zone: unknown story time field/,
    /deviceDefaults\.battery\.drainPerHour: expected a number ≥ 0/, /deviceDefaults\.battery\.speed: unknown battery constant/, /deviceDefaults\.phone: unknown device kind/,
    /panels\[0\]\.chargePerHour: expected a number ≥ 0/, /panels\[0\]\.initial\.drain: drain is a step operation/,
    /steps\[1\]\.time: "soon" is not a time/, /steps\[2\]\.time: time goes backward on path "main"/, /steps\[2\]\.time: time goes backward on path "alt"/,
    /steps\[3\]\.time: .* is after the story end/, /steps\[3\]\.panels\.b\.drain: expected additional drain as a number ≥ 0/,
    /steps\[4\]\.panels\.b\.drain: ignored because charge sets the value/])
    assert.match(text, re);
  assert.match(warnings(diagram({storyTime: {start: 'tonight'}, steps: [step()]})).join(), /storyTime\.start: expected a date-time/);
  assert.match(warnings(diagram({storyTime: {start: '2026-09-24T22:30', end: '2026-09-24T20:00'}, steps: [step()]})).join(), /storyTime\.end: must be after start/);
  assert.match(warnings(diagram({storyTime: {start: '2026-09-24T22:30', span: 'long'}, steps: [step()]})).join(), /storyTime\.span: expected a duration/);
  const spanned = diagram({storyTime: {start: '2026-09-24T22:30', span: '1h'}, steps: [step({time: '+2h'})]});
  assert.match(warnings(spanned).join(), /after the story end/);
  assert.deepEqual(plain(warnings(diagram({steps: [step({time: '+1h'})]}))), [], 'a time-only step is something to show');
  // backward time renders as authored; drift never runs backward
  const back = diagram({panels: [{id: 'b', type: 'battery', initial: {charge: 50}}, {id: 'ph', type: 'phone'}], steps: [step({time: '+2h'}), step({time: '2026-09-24T20:00'})]});
  assert.deepEqual(pick(back, 'ph', 'clock'), ['12:30', '8:00']);
  assert.deepEqual(pick(back, 'b', 'charge'), [48, 48]);
});

test('compatibility: story time and battery drain declare flow.story-time', () => {
  const F = C.FlowviewCompatibility;
  const page = d => ({page: {sections: [{diagram: d}]}});
  assert.ok(F.detect(page(diagram({steps: [step()]}))).includes('flow.story-time'));
  const drainOnly = {nodes: {a: {}}, rows: [['a']], panels: [{id: 'b', type: 'battery'}], steps: [step({panels: {b: {drain: 1}}})]};
  assert.ok(F.detect(page(drainOnly)).includes('flow.story-time'));
  drainOnly.steps[0].panels.b = {charge: 3};
  assert.ok(!F.detect(page(drainOnly)).includes('flow.story-time'));
  const older = {...F.features}; delete older['flow.story-time'];
  const report = F.check(F.stamp(page(diagram({steps: [step()]}))), {features: older, version: F.version, contract: '1'});
  assert.deepEqual(plain(report.missingFeatures), ['flow.story-time']);
});

test('inspector provenance labels derived fields and new panels start with the constants', () => {
  const d = diagram({
    deviceDefaults: {battery: {drainPerHour: 0.5}},
    panels: [{id: 'ph', type: 'phone'}, {id: 'b', type: 'battery', initial: {charge: 50}}],
    steps: [step(), step({time: '+2h', panels: {b: {drain: 1}}})]
  });
  const model = C.builderEffectivePanelStates(d, 1).panels;
  const field = (id, key) => model.find(p => p.id === id).fields.find(f => f.key === key);
  assert.equal(field('ph', 'clock').origin.label, 'Story time');
  assert.deepEqual(plain(field('ph', 'clock').origin.inputs[0].path), ['steps', 1, 'time']);
  assert.equal(field('b', 'charge').origin.label, 'Story time · battery drift · built-in default rate', 'charge rate is the built-in placeholder');
  const authored = {...d, deviceDefaults: {battery: {drainPerHour: 0.5, chargePerHour: 8}}};
  assert.equal(C.builderEffectivePanelStates(authored, 1).panels[1].fields.find(f => f.key === 'charge').origin.label, 'Story time · battery drift');
  assert.equal(field('b', 'charge').value, 48);
  assert.deepEqual(plain(C.builderEffectivePanelStates(d, 0).panels[0].fields.find(f => f.key === 'clock').origin.inputs[0].path), ['storyTime', 'start']);
  const add = (raw, type) => JSON.parse(C.planAddPanel(JSON.stringify(raw), raw, 0, type).text).panels.at(-1);
  const bat = add(d, 'battery');
  assert.equal(bat.drainPerHour, 0.5, 'diagram rate copied');
  assert.equal('chargePerHour' in bat, false, 'built-in placeholder is not copied as a device fact');
  assert.equal(add(d, 'phone').initial && add(d, 'phone').initial.clock, undefined);
  const legacy = {nodes: {a: {}}, rows: [['a']]};
  assert.equal(add(legacy, 'phone').initial.clock, '9:41');
  assert.equal('drainPerHour' in add(legacy, 'battery'), false);
});

test('the story-time example builds cleanly and shows clocks and drift', () => {
  const file = path.join(__dirname, '..', 'examples', 'story-time', 'story-time.spec.json');
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const result = C.validate(C.normalize(raw));
  assert.deepEqual(plain(result.errors), []);
  assert.deepEqual(plain(result.warnings), []);
});

test('hostile and out-of-range times are rejected with warnings, never thrown', () => {
  const huge = '+' + '9'.repeat(400) + 'h';
  assert.equal(C.storyTimeDuration(huge, true), null, 'overflow to Infinity');
  assert.equal(C.storyTimeDuration('+999999999d', true), null, 'finite but beyond the Date range');
  const start = C.storyTimeAbsolute('2026-09-24T22:30');
  assert.equal(C.storyTimeResolve(huge, start), null);
  assert.equal(C.storyTimeResolve('+3000000d', start), null, 'lands after year 9999');
  assert.equal(C.storyTimeResolve('+1h', NaN), null);
  for (const early of ['0000-01-01T00:00', '0099-12-31T23:59']) assert.equal(C.storyTimeAbsolute(early), null, early);
  assert.equal(new Date(C.storyTimeAbsolute('0100-03-01T10:00')).getUTCFullYear(), 100);
  assert.equal(C.storyTimeAbsolute('10000-01-01T00:00'), null);
  const d = diagram({
    panels: [{id: 'ph', type: 'phone'}, {id: 'b', type: 'battery', initial: {charge: 50}}],
    steps: [step({time: huge}), step({time: '+2000000d'}), step({time: '+2000000d'}), step({time: '+1h'})]
  });
  let result;
  assert.doesNotThrow(() => { result = C.validate(C.normalize(d)); });
  const text = result.warnings.join('\n');
  assert.match(text, /steps\[0\]\.time: "\+9{20,}.*is not a time/);
  assert.match(text, /steps\[2\]\.time: lands outside the supported range/, 'cumulative overflow on the path');
  assert.doesNotMatch(text, /steps\[1\]\.time: lands outside/);
  const clocks = pick(d, 'ph', 'clock'), charges = pick(d, 'b', 'charge');
  assert.equal(clocks[0], '10:30', 'unparsable keeps start');
  assert.equal(clocks[2], clocks[1], 'out-of-range keeps the previous time');
  assert.ok(charges.every(v => typeof v === 'number' && v >= 0 && v <= 100), JSON.stringify(charges));
  assert.doesNotThrow(() => C.validate(C.normalize(diagram({storyTime: {start: '2026-09-24T22:30', span: huge}, steps: [step()]}))));
});

test('span must be longer than zero; end warnings name the path; bad diagram rates say they are ignored', () => {
  for (const span of ['0h', '0d0m']) {
    assert.match(warnings(diagram({storyTime: {start: '2026-09-24T22:30', span}, steps: [step()]})).join(), /storyTime\.span: expected a duration longer than zero/);
    assert.equal(C.storyTimeConfig(diagram({storyTime: {start: '2026-09-24T22:30', span}})).end, null);
  }
  assert.match(warnings(diagram({storyTime: {start: '9999-12-31T20:00', span: '1d'}, steps: [step()]})).join(), /span: ends after the supported range/);
  const d = diagram({
    storyTime: {start: '2026-09-24T22:30', span: '1h'},
    steps: [step({id: 'a'}), step({id: 'shared', time: '+2h'}), step({id: 'b'})],
    paths: [{id: 'one', steps: ['a', 'shared']}, {id: 'two', steps: ['a', 'shared', 'b']}]
  });
  const text = warnings(d).join('\n');
  assert.match(text, /steps\[1\]\.time: .* is after the story end on path "one"/);
  assert.match(text, /steps\[1\]\.time: .* is after the story end on path "two"/);
  const bad = warnings(diagram({deviceDefaults: {battery: {drainPerHour: -1}}, panels: [{id: 'b', type: 'battery', drainPerHour: 2}], steps: [step()]})).join();
  assert.match(bad, /drainPerHour: expected a number ≥ 0 \(percent per hour\) — this default is ignored; each battery panel uses its own drainPerHour or the built-in placeholder 1/);
});

test('end warnings name only authored times; provenance skips rejected times', () => {
  const d = diagram({
    storyTime: {start: '2026-09-24T22:30', span: '1h'},
    steps: [step({time: '+2h'}), step(), step(), step({time: '+1m'}), step({time: 'soon'})]
  });
  const ends = warnings(d).filter(w => /after the story end/.test(w));
  assert.equal(ends.length, 2, ends.join('\n'));
  assert.match(ends[0], /steps\[0\]\.time/); assert.match(ends[1], /steps\[3\]\.time/);
  const far = diagram({panels: [{id: 'ph', type: 'phone'}], steps: [step({time: '+2000000d'}), step({time: '+2000000d'}), step()]});
  assert.match(warnings(far).join('\n'), /steps\[1\]\.time: lands outside the supported range/);
  const clock = C.builderEffectivePanelStates(far, 2).panels[0].fields.find(f => f.key === 'clock');
  assert.equal(clock.origin.label, 'Story time');
  assert.deepEqual(plain(clock.origin.inputs[0].path), ['steps', 0, 'time'], 'the rejected step 2 time is not the source');
});
