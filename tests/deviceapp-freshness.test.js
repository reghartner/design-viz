'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {readSource} = require('../tools/source-loader.cjs');
const C = {URL}; vm.createContext(C);
for (const name of ['compatibility', 'validator', 'workbench/source-edit', 'workbench/targets', 'workbench/commands/common', 'workbench/commands/graph', 'workbench/inspector-model', 'workbench/field-values'])
  vm.runInContext(readSource(name + '.js'), C);
const plain = value => JSON.parse(JSON.stringify(value));
const step = (extra = {}) => ({nodes: ['a'], ...extra});
const app = (fields, initial) => ({id: 'app', type: 'deviceapp', fields: fields || [{id: 'battery', label: 'Battery', kind: 'battery'}], ...(initial ? {initial} : {})});
const diagram = (extra = {}) => ({nodes: {a: {}}, rows: [['a']], storyTime: {start: '2026-09-24T22:30'}, ...extra});
const warnings = d => C.validate(C.normalize(d)).warnings;
const fold = (d, pathId) => plain(C.foldPanelStates(pathId ? C.diagramForPath(d, pathId) : d).app);
const details = (d, field = 'battery', pathId) => fold(d, pathId).map(s => s[field] && s[field].detail);
const at = text => C.storyTimeAbsolute(text);
const iso = ms => new Date(ms).toISOString().slice(0, 16);

test('report times: now, before this step, after the previous step, latest time of day, absolute', () => {
  const now = at('2026-09-25T06:30'), previous = at('2026-09-25T06:00');
  assert.equal(C.storyTimeReportResolve('now', now, previous), now);
  assert.equal(C.storyTimeReportResolve(' now ', now, previous), now);
  assert.equal(iso(C.storyTimeReportResolve('-15m', now, previous)), '2026-09-25T06:15');
  assert.equal(iso(C.storyTimeReportResolve('-1d2h', now, previous)), '2026-09-24T04:30');
  assert.equal(iso(C.storyTimeReportResolve('+5m', now, previous)), '2026-09-25T06:05', 'relative to the previous step, like step.time');
  assert.equal(iso(C.storyTimeReportResolve('06:05', now, previous)), '2026-09-25T06:05');
  assert.equal(iso(C.storyTimeReportResolve('18:05', now, previous)), '2026-09-24T18:05', 'time of day rolls back to the latest occurrence');
  assert.equal(C.storyTimeReportResolve('06:30', now, previous), now, 'the current time of day is now');
  assert.equal(iso(C.storyTimeReportResolve('2026-09-25T07:00', now, previous)), '2026-09-25T07:00', 'absolute may be in the future (the validator warns)');
  for (const bad of ['', 'soon', '-', '-5', '+3m2h', '-1.5h', '25:00', '2026-02-30T10:00', 42, null, {}, true]) {
    assert.equal(C.storyTimeReportResolve(bad, now, previous), null, JSON.stringify(bad));
    assert.equal(C.storyTimeReportParsable(bad), false, JSON.stringify(bad));
  }
  for (const good of ['now', '-15m', '+5m', '06:05', '2026-09-25T06:05', '-90s']) assert.equal(C.storyTimeReportParsable(good), true, good);
  assert.equal(C.storyTimeReportResolve('-' + '9'.repeat(400) + 'h', now, previous), null, 'hostile durations never throw');
  assert.equal(C.storyTimeReportResolve('-999999999d', now, previous), null, 'before year 100');
  assert.equal(C.storyTimeIso(at('2026-09-25T06:05')), '2026-09-25T06:05');
  assert.equal(C.storyTimeIso(at('2026-09-25T06:05') + 30000), '2026-09-25T06:05:30');
});

test('formatting thresholds: just now, minutes, hours, then the absolute last report', () => {
  const t = at('2026-09-24T18:05'), m = 60000, h = 60 * m, twelve = {clock: '12h'};
  const cases = [[0, 'Updated just now'], [59 * 1000, 'Updated just now'], [m, 'Updated 1 min ago'], [59 * m + 59000, 'Updated 59 min ago'],
    [h, 'Updated 1 h ago'], [h + 59 * m, 'Updated 1 h ago'], [23 * h + 59 * m, 'Updated 23 h ago'], [24 * h, 'Last report Thu, Sep 24, 6:05 PM'],
    [-5 * m, 'Updated just now']];
  for (const [elapsed, text] of cases) assert.equal(C.storyTimeFreshness(t, t + elapsed, twelve, 'relative'), text, String(elapsed));
  assert.equal(C.storyTimeFreshness(t, t + 3 * h, twelve, 'absolute'), 'Last report 6:05 PM');
  assert.equal(C.storyTimeFreshness(t, t + 3 * h, {clock: '24h'}, 'absolute'), 'Last report 18:05');
  assert.equal(C.storyTimeFreshness(t, t + 6 * h, twelve, 'absolute'), 'Last report Thu, Sep 24, 6:05 PM', 'another calendar day adds the date');
  assert.equal(C.storyTimeFreshness(at('2026-09-25T00:07'), at('2026-09-25T01:00'), twelve, 'absolute'), 'Last report 12:07 AM');
  assert.equal(C.storyTimeFreshness(t, t + 2 * 24 * h, {clock: '24h'}, 'relative'), 'Last report Thu, Sep 24, 18:05');
});

test('freshness carries forward and updates on every step as story time moves', () => {
  const d = diagram({
    panels: [app(null, {battery: {value: 60, status: 'ready', reportedAt: 'now'}})],
    steps: [step(), step({time: '+30s'}), step({time: '+5m'}), step({time: '+3h'}), step(),
      step({time: '+1m', panels: {app: {battery: {value: 55, reportedAt: 'now'}}}}), step({time: '+20m'}), step({time: '+1d'})]
  });
  assert.deepEqual(details(d), ['Updated just now', 'Updated just now', 'Updated 5 min ago', 'Updated 3 h ago', 'Updated 3 h ago',
    'Updated just now', 'Updated 20 min ago', 'Last report Fri, Sep 25, 1:36 AM']);
  const states = fold(d);
  assert.deepEqual(states.map(s => s.battery.reportedAt), Array(5).fill('2026-09-24T22:30').concat(Array(3).fill('2026-09-25T01:36:30')));
  assert.deepEqual(states.map(s => s.battery.value), [60, 60, 60, 60, 60, 55, 55, 55]);
  assert.deepEqual(states.map(s => s._updated.includes('battery')), [false, false, false, false, false, true, false, false]);
  // A report with the same value still marks the card updated at its step.
  const same = diagram({panels: [app(null, {battery: {value: 60}})], steps: [step({time: '+1h'}), step({time: '+1h', panels: {app: {battery: {reportedAt: 'now'}}}})]});
  assert.deepEqual(fold(same).map(s => s._updated), [[], ['battery']]);
  assert.deepEqual(details(same), [undefined, 'Updated just now']);
});

test('explicit detail wins until a newer report; null resets; freshness off and absolute modes', () => {
  const d = diagram({
    panels: [app([{id: 'battery', kind: 'battery'}, {id: 'clip'}, {id: 'off', freshness: 'off'}, {id: 'abs', freshness: 'absolute'}],
      {battery: {value: 60, reportedAt: 'now', detail: 'Battery saver on'}, off: {value: 'x', reportedAt: 'now', detail: 'Mine'}, abs: {value: 'y', reportedAt: '-2h'}})],
    steps: [
      step(),
      step({time: '+10m'}),
      step({time: '+10m', panels: {app: {battery: {reportedAt: 'now'}}}}),            // newer report releases the old detail
      step({time: '+10m', panels: {app: {battery: {detail: 'Pinned', reportedAt: 'now'}}}}), // detail in the same patch wins
      step({time: '+10m'}),
      step({time: '+10m', panels: {app: {battery: {detail: null}}}}),                 // clearing detail restores freshness
      step({time: '+10m', panels: {app: {battery: {reportedAt: null}}}}),             // clearing the report time stops it
      step({time: '+10m', panels: {app: {battery: {reportedAt: '-5m'}}}}),
      step({time: '+10m', panels: {app: {battery: null}}})                            // a null field resets everything
    ]
  });
  assert.deepEqual(details(d), ['Battery saver on', 'Battery saver on', 'Updated just now', 'Pinned', 'Pinned', 'Updated 20 min ago', '', 'Updated 5 min ago', '']);
  assert.equal(fold(d)[6].battery.reportedAt, undefined);
  assert.equal(fold(d)[8].battery.reportedAt, undefined);
  assert.deepEqual(details(d, 'off'), Array(9).fill('Mine'), 'freshness off keeps authored detail');
  assert.equal(fold(d)[0].off.reportedAt, '2026-09-24T22:30', 'the report time is still recorded');
  assert.deepEqual(details(d, 'abs').slice(0, 2), ['Last report 8:30 PM', 'Last report 8:30 PM']);
  const clip = diagram({panels: [app([{id: 'clip'}])], steps: [step({time: '+1h', panels: {app: {clip: {value: 'Fox', detail: 'Clip saved'}}}}), step({time: '+1h', panels: {app: {clip: {reportedAt: '-30m'}}}})]});
  assert.deepEqual(details(clip, 'clip'), ['Clip saved', 'Updated 30 min ago']);
});

test('paths fold separately: a shared relative report resolves against each path', () => {
  const d = diagram({
    panels: [app(null, {battery: {value: 50}})],
    steps: [step({id: 'start'}), step({id: 'quick', time: '+10m'}), step({id: 'slow', time: '+5h'}),
      step({id: 'report', time: '+1h', panels: {app: {battery: {value: 40, reportedAt: '+30m'}}}}), step({id: 'later', time: '+2h'})],
    paths: [{id: 'quick', steps: ['start', 'quick', 'report', 'later']}, {id: 'slow', steps: ['start', 'slow', 'report', 'later']}]
  });
  assert.deepEqual(details(d, 'battery', 'quick'), [undefined, undefined, 'Updated 30 min ago', 'Updated 2 h ago']);
  assert.deepEqual(fold(d, 'quick').map(s => s.battery.reportedAt), [undefined, undefined, '2026-09-24T23:10', '2026-09-24T23:10']);
  assert.deepEqual(fold(d, 'slow').map(s => s.battery.reportedAt), [undefined, undefined, '2026-09-25T04:00', '2026-09-25T04:00']);
  assert.deepEqual(plain(warnings(d)), []);
});

test('backward compatibility: without story time or without a report time nothing changes', () => {
  const base = (panel, steps) => plain(C.foldDeviceAppStates(panel, steps));
  const noStory = {nodes: {a: {}}, rows: [['a']], panels: [app(null, {battery: {value: 60, detail: 'Updated just now', reportedAt: 'now'}})],
    steps: [step({time: '+2h'}), step({panels: {app: {battery: {reportedAt: '-5m', value: 50}}}})]};
  assert.deepEqual(fold(noStory), base(noStory.panels[0], noStory.steps));
  assert.deepEqual(details(noStory), ['Updated just now', 'Updated just now'], 'hand-written text stays');
  assert.equal(fold(noStory)[1].battery.reportedAt, undefined);
  const text = warnings(noStory).join('\n');
  assert.match(text, /panels\[0\]\.initial\.battery\.reportedAt: ignored — declare diagram\.storyTime\.start/);
  assert.match(text, /steps\[1\]\.panels\.app\.battery\.reportedAt: ignored — declare diagram\.storyTime\.start/);
  // With story time but no report times, only the clock/date overlay applies.
  const story = diagram({panels: [app(null, {battery: {value: 60, detail: 'Reported 10:30 PM'}})], steps: [step({time: '+2h'}), step({panels: {app: {battery: {value: 50}}}})]});
  const legacy = base(story.panels[0], story.steps).map(s => { delete s.clock; delete s.date; return s; });
  assert.deepEqual(fold(story).map(s => { delete s.clock; delete s.date; return s; }), legacy);
});

test('existing specs fold and render their device apps exactly as the per-panel fold', () => {
  const root = path.join(__dirname, '..'), files = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p); else if (e.name.endsWith('.json')) files.push(p);
    }
  })(path.join(root, 'examples'));
  const diagrams = (v, out = []) => {
    if (Array.isArray(v)) v.forEach(x => diagrams(x, out));
    else if (v && typeof v === 'object') { if (v.nodes && v.rows) out.push(v); Object.values(v).forEach(x => diagrams(x, out)); }
    return out;
  };
  let compared = 0;
  for (const file of files) {
    let raw; try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { continue; }
    for (const d of diagrams(raw)) for (const p of d.panels || []) {
      if (!p || p.type !== 'deviceapp' || JSON.stringify(d).includes('"reportedAt"')) continue;
      for (const route of C.diagramPathList(d)) {
        const x = C.diagramForPath(d, route.id), folded = plain(C.foldPanelStates(x)[p.id]);
        const legacy = plain(C.foldDeviceAppStates(p, x.steps));
        if (d.storyTime) for (const s of folded.concat(legacy)) { delete s.clock; delete s.date; }
        assert.deepEqual(folded, legacy, path.relative(root, file) + ' ' + route.id + ' ' + p.id);
        compared++;
      }
    }
  }
  assert.ok(compared >= 5, 'compared ' + compared + ' device apps');
});

test('validator: unparsable, future and unknown freshness; compatibility feature', () => {
  const d = diagram({
    panels: [app([{id: 'battery', kind: 'battery', freshness: 'sometimes'}], {battery: {value: 60, reportedAt: '+1h'}})],
    steps: [step({id: 's0', panels: {app: {battery: {reportedAt: 'soon'}}}}), step({id: 's1', time: '+1h', panels: {app: {battery: {reportedAt: '2026-09-25T08:00'}}}}),
      step({id: 's2', time: '+1h', panels: {app: {battery: {reportedAt: 42}}}})],
    paths: [{id: 'main', steps: ['s0', 's1', 's2']}, {id: 'short', steps: ['s0', 's1']}]
  });
  const text = warnings(d).join('\n');
  for (const re of [/panels\[0\]\.fields\[0\]\.freshness: expected relative, absolute, off — using relative/,
    /panels\[0\]\.initial\.battery\.reportedAt: Thu, Sep 24 · 11:30 PM is later than the step’s story time \(Thu, Sep 24 · 10:30 PM\)/,
    /steps\[0\]\.panels\.app\.battery\.reportedAt: "soon" is not a report time/,
    /steps\[1\]\.panels\.app\.battery\.reportedAt: Fri, Sep 25 · 8:00 AM is later than the step’s story time on path "main"/,
    /steps\[1\]\.panels\.app\.battery\.reportedAt: .* on path "short"/,
    /steps\[2\]\.panels\.app\.battery\.reportedAt: "42" is not a report time/])
    assert.match(text, re);
  assert.equal((text.match(/initial\.battery\.reportedAt: .*later/g) || []).length, 1, 'initial reports once');
  assert.equal(details(d)[1], 'Updated just now', 'a report from the future reads as just reported');
  assert.deepEqual(plain(warnings(diagram({panels: [app(null, {battery: {value: 1, reportedAt: null}})], steps: [step({panels: {app: {battery: {reportedAt: '-2m'}}}})]}))), []);

  const F = C.FlowviewCompatibility, page = x => ({page: {sections: [{diagram: x}]}});
  const plainApp = {nodes: {a: {}}, rows: [['a']], panels: [app(null, {battery: {value: 3}})], steps: [step()]};
  assert.ok(!F.detect(page(plainApp)).includes('content.deviceapp-freshness'));
  plainApp.steps[0].panels = {app: {battery: {reportedAt: 'now'}}};
  assert.ok(F.detect(page(plainApp)).includes('content.deviceapp-freshness'));
  delete plainApp.steps[0].panels; plainApp.panels[0].fields[0].freshness = 'absolute';
  assert.ok(F.detect(page(plainApp)).includes('content.deviceapp-freshness'));
  const older = {...F.features}; delete older['content.deviceapp-freshness'];
  const report = F.check(F.stamp(page(plainApp)), {features: older, version: F.version, contract: '1'});
  assert.deepEqual(plain(report.missingFeatures), ['content.deviceapp-freshness']);
});

test('validator: report times that parse but land outside years 100–9999 warn per field and path', () => {
  const low = diagram({
    storyTime: {start: '0100-01-01T00:00'},
    panels: [app(null, {battery: {value: 60, reportedAt: '-1d'}})],
    steps: [step({id: 'a'}), step({id: 'b', panels: {app: {battery: {reportedAt: '-2h'}}}}), step({id: 'c', time: '+3h', panels: {app: {battery: {reportedAt: '-2h'}}}})],
    paths: [{id: 'one', steps: ['a', 'b', 'c']}, {id: 'two', steps: ['a', 'b']}]
  });
  const text = warnings(low).join('\n');
  assert.match(text, /panels\[0\]\.initial\.battery\.reportedAt: lands outside the supported range \(years 100–9999\) — ignored/);
  assert.equal((text.match(/initial\.battery\.reportedAt: lands outside/g) || []).length, 1, 'initial reports once');
  assert.match(text, /steps\[1\]\.panels\.app\.battery\.reportedAt: lands outside the supported range \(years 100–9999\) on path "one"/);
  assert.match(text, /steps\[1\]\.panels\.app\.battery\.reportedAt: lands outside the supported range \(years 100–9999\) on path "two"/);
  assert.doesNotMatch(text, /steps\[2\]\.panels\.app\.battery\.reportedAt/, '01:00 on day one is in range');
  assert.deepEqual(details(low, 'battery', 'one'), [undefined, undefined, 'Updated 2 h ago'], 'out-of-range times are ignored, never thrown');
  const high = diagram({
    storyTime: {start: '9999-12-31T22:00'},
    panels: [app(null, {battery: {value: 60, reportedAt: '+3h'}})],
    steps: [step({time: '+1h', panels: {app: {battery: {reportedAt: '+2h'}}}}), step({panels: {app: {battery: {reportedAt: 'now'}}}})]
  });
  const top = warnings(high).join('\n');
  assert.match(top, /panels\[0\]\.initial\.battery\.reportedAt: lands outside the supported range/);
  assert.match(top, /steps\[0\]\.panels\.app\.battery\.reportedAt: lands outside the supported range \(years 100–9999\) — ignored/);
  assert.doesNotMatch(top, /steps\[1\]/);
  assert.deepEqual(details(high), [undefined, 'Updated just now']);
});

test('the card renders the computed text; the inspector labels it as derived; the editor offers reportedAt', () => {
  const d = diagram({panels: [app(null, {battery: {value: 60, status: 'ready', reportedAt: 'now'}})], steps: [step(), step({time: '+12m'})]});
  const states = C.foldPanelStates(d).app;
  const html = C.deviceAppPanelHTML(d.panels[0], states[1], false, false, false);
  assert.match(html, /<span class="da-detail">Updated 12 min ago<\/span>/);
  const field = C.builderEffectivePanelStates(d, 1).panels[0].fields.find(f => f.key === 'battery');
  assert.equal(field.origin.kind, 'story');
  assert.equal(field.origin.label, 'Story time · derived freshness “Updated 12 min ago”');
  assert.deepEqual(plain(field.origin.inputs.map(i => i.path)), [['panels', 0, 'initial', 'battery'], ['steps', 1, 'time']]);
  const pinned = diagram({panels: [app(null, {battery: {value: 60, reportedAt: 'now', detail: 'Mine'}})], steps: [step({time: '+1m'})]});
  assert.equal(C.builderEffectivePanelStates(pinned, 0).panels[0].fields.find(f => f.key === 'battery').origin.label, 'Field value and source history');
  const fields = C.panelAuthoring('deviceapp').expandPatchFields(d.panels[0]);
  const battery = fields.find(f => f[0] === 'battery');
  assert.ok(battery[2].some(col => col[0] === 'reportedAt' && col[1] === 'text'));
  const setup = C.panelAuthoring('deviceapp').setupFields.find(f => f[0] === 'fields')[2].cols.find(c => c.k === 'freshness');
  assert.deepEqual(plain(setup.options), ['relative', 'absolute', 'off']);
});

test('the story-time example uses report times and builds without warnings', () => {
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'examples', 'story-time', 'story-time.spec.json'), 'utf8'));
  assert.deepEqual(plain(C.validate(C.normalize(raw))), {errors: [], warnings: []});
  const d = raw.page.sections[0].diagram;
  assert.deepEqual(details(d), ['Updated just now', 'Updated 2 h ago', 'Updated just now', 'Updated just now', 'Updated 3 h ago', 'Updated 6 h ago', 'Updated 7 h ago', 'Updated just now']);
  assert.ok(!JSON.stringify(d).match(/"detail":\s*"(Updated|Reported|Last report)/), 'no hand-written freshness');
});
