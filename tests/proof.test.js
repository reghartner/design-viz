'use strict';
/* #938: the pure proof verdict engine, src/core/proof.js. Every row goes
   through the public API, proofVerdicts({carriers, jiraMap, telemetryMap,
   steps}, options), and asserts on its output only.

| Row | Fixture | Structurally scoped assertion | Broken implementation it rejects |
| --- | --- | --- | --- |
| M1 matrix cells | matrixPage(): one CALL carrier per Jira row (done, active, todo, blocked, missing, no tickets, unknown) x sample (silent, flowing, degraded, none) | carriers[id] {bound, jira, telemetry, verdict, label} and failing, per cell | any swapped cell, e.g. done x silent read as proven, todo x flowing kept as todo, blocked x flowing read as live early |
| M2 labels | matrixPage() | each cell's label is LABELS[verdict] (null without a verdict); the matrix reaches every label | a renamed or missing label; a label on a null verdict |
| J1 carrier Jira | unbound carriers with eleven ticket combinations, plus an unrecognised state | carriers[id].jira | missing ranked before blocked; unknown evidence read as done; done plus todo read as todo |
| L1 min | QUEUE in at 10 and 9 | telemetry, failing, verdict | strict > |
| L2 max | QUEUE lag 500/501 and age 60/61 | flowing; failing ['lag', 'age'] | strict < |
| L3 maxRatioOf | CALL errors 13 and 14 of 1300; 3 errors of 0 traffic | flowing; ['errors']; ['rate', 'errors'] | a ratio that ignores a zero denominator |
| L4 min and max together | BAND in at 4000 and 6000 | flowing; ['in'] | only one bound checked |
| L5 pending vs failure | CALL with p95 missing, with and without an errors failure | degraded; unobserved with verdict done | a pending limit ignored, which would claim proven |
| L6 ratio typo | TYPO maxRatioOf 'requests' | unobserved | a ratio over an unbound signal silently skipped |
| L7 headline value | series only; value plus series | last point, or value, is the headline | first point used; series preferred over value |
| S1 unobserved | no sample, empty sample, non-finite readings | unobserved, verdict done | unobserved counted as done-unproven |
| S2 silent across the window | LOG count 0 now with traffic earlier; all zeros | flowing vs silent | silence judged from the value alone |
| S3 rate-like clauses | COUNTS numerator without a unit; RATIO_ONLY denominator without limit or unit; per-time unit; no rate-like signal | degraded; unobserved; silent; flowing | each rate-like clause dropped |
| S4 unbound | empty signals and no binding, both with a sample present | exact UNBOUND result; rollups bound 0, unbound 2 | unbound carriers judged or put in the denominator |
| T1 since | two Done tickets, active, unstamped Done, silent | exact {doneAt, firstTrafficAt} | earliest Done time; traffic before Done counted |
| R1 rollups | rolePage(): sixteen bound carriers incl. imported node and edge, two unbound incl. one imported | exact rollups | degraded counting only done-degraded; liveEarly missing todo-already-live; blocked degraded counted |
| P1 step rollup | rolePage() with twenty-two steps | steps[id] {verdict, label} per step | swapped worst order; done plus todo read as todo; unbound carriers voting |
| U1 purity | source with comments stripped, input snapshot, bad inputs | no DOM, clock or timer tokens; input unchanged; empty result, no throw | Date.now or timers; input mutation; throwing on bad input |
| B1 bundle | sourceFiles('validator.js'), whole bundle run in a VM | module listed; same output as standalone | module never shipped; a global name collision |
*/
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {readSource, sourceFiles} = require('../tools/source-loader.cjs');

let source = '';
try { source = readSource('core/proof.js'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const P = {}; vm.createContext(P); vm.runInContext(source, P, {filename: 'core/proof.js'});
const plain = value => JSON.parse(JSON.stringify(value));
function judge(input, options, engine = P) {
  assert.equal(typeof engine.proofVerdicts, 'function', 'src/core/proof.js defines proofVerdicts(input, options)');
  return plain(engine.proofVerdicts(input, options));
}

const T0 = Date.parse('2026-11-03T09:00:00.000Z'), H = 3600000;
const at = hours => new Date(T0 + hours * H).toISOString();
const CALL = {kind: 'call',
  signals: {
    rate: {source: 'loki', query: 'sum(rate({app="notify"} |= "push sent" [5m]))*3600', unit: 'req/h'},
    errors: {source: 'loki', query: 'sum(rate({app="notify"} |= "push failed" [5m]))*3600', unit: 'req/h'},
    p95: {source: 'grafana', query: 'histogram_quantile(0.95, sum by (le)(rate(push_latency_seconds_bucket{app="notify"}[5m])))*1000', unit: 'ms'}},
  proof: {rate: {min: 10}, errors: {maxRatioOf: 'rate', max: 0.01}, p95: {max: 500}}};
const QUEUE = {kind: 'queue',
  signals: {
    in: {source: 'grafana', query: 'sum(rate(kafka_server_brokertopicmetrics_messagesin_total{topic="device-events"}[5m]))*3600', unit: 'msg/h'},
    lag: {source: 'grafana', query: 'max(kafka_consumergroup_lag{topic="device-events",group="notify-consumers"})', unit: 'msgs'},
    age: {source: 'grafana', query: 'max(kafka_consumergroup_lag_seconds{topic="device-events",group="notify-consumers"})', unit: 's'}},
  proof: {in: {min: 10}, lag: {max: 500}, age: {max: 60}}};
const LOG = {kind: 'log-event',
  signals: {count: {source: 'loki', query: 'sum(count_over_time({app="ingest"} |= "event stored" [5m]))', unit: 'events/h'}},
  proof: {}};
const SAMPLES = {
  silent: {signals: {rate: {value: 0, series: [[T0, 0], [T0 + H, 0]]}, errors: {value: 0, series: [[T0, 0], [T0 + H, 0]]}}, observedAt: at(1)},
  flowing: {signals: {rate: {value: 1300, series: [[T0, 1200], [T0 + H, 1300]]}, errors: {value: 5}, p95: {value: 410}}, observedAt: at(1)},
  degraded: {signals: {rate: {value: 1300}, errors: {value: 60}, p95: {value: 410}}, observedAt: at(1)},
  unobserved: undefined,
};
const JIRA = {
  'BE-1': {state: 'done', updatedAt: at(0), title: 'Ingest events'},
  'BE-2': {state: 'active', updatedAt: at(-24)},
  'BE-3': {state: 'todo'},
  'BE-4': {state: 'blocked', detail: 'waiting on vendor'},
  'BE-5': {state: 'missing'},
  'BE-6': {state: 'done', updatedAt: at(1)},
  'BE-7': {state: 'done'},
};
JIRA['BE-8'] = {state:'testing'};
const TICKET = {testing:'BE-8', done: 'BE-1', active: 'BE-2', todo: 'BE-3', blocked: 'BE-4', missing: 'BE-5', unknown: 'BE-404'};

/* Rows are the carrier's Jira state ('unknown' = tickets without evidence,
   null = no tickets); columns are the telemetry state its sample produces. */
const COLUMNS = ['silent', 'flowing', 'degraded', 'unobserved'];
const MATRIX = [
  ['done', 'done-unproven', 'proven', 'done-degraded', 'done-traffic-unmeasured'],
  ['active', 'active', 'active-live-early', 'active-failing', 'active'],
  ['testing', 'testing', 'testing-live-early', 'testing-failing', 'testing'],
  ['todo', 'todo', 'todo-already-live', 'todo-failing', 'todo'],
  ['blocked', 'blocked', 'blocked', 'blocked', 'blocked'],
  ['missing', 'missing', 'missing', 'missing', 'missing'],
  [null, 'unobserved', 'healthy', 'degraded', null],
  ['unknown', null, null, null, null],
];
const FAILING = {silent: ['rate'], flowing: [], degraded: ['errors'], unobserved: []};
const LABELS = {
  'done-traffic-unmeasured': 'DONE · traffic not measured', proven: 'PROVEN', 'done-unproven': 'DONE · UNPROVEN', 'done-degraded': 'DONE · DEGRADED', done: 'DONE',
  active: 'IN PROGRESS', 'active-live-early': 'IN PROGRESS · LIVE EARLY', 'active-failing': 'IN PROGRESS · FAILING',
  testing: 'TESTING', 'testing-live-early': 'TESTING · LIVE EARLY', 'testing-failing': 'TESTING · FAILING',
  todo: 'TODO', 'todo-already-live': 'TODO · ALREADY LIVE?', 'todo-failing': 'TODO · FAILING',
  blocked: 'BLOCKED', missing: 'MISSING', unobserved: 'UNOBSERVED', healthy: 'HEALTHY', degraded: 'DEGRADED',
};

function matrixPage() {
  const carriers = [], telemetryMap = {};
  for (const [jira] of MATRIX) for (const column of COLUMNS) {
    const id = (jira || 'none') + ':' + column;
    carriers.push({id, tickets: jira ? [TICKET[jira]] : [], ...CALL});
    if (SAMPLES[column]) telemetryMap[id] = SAMPLES[column];
  }
  return {carriers, jiraMap: JIRA, telemetryMap, steps: []};
}

test('every verdict-matrix cell: Jira state x telemetry state', () => {
  const out = judge(matrixPage());
  for (const [jira, ...verdicts] of MATRIX) COLUMNS.forEach((column, index) => {
    const cell = (jira || 'none') + ' x ' + column, got = out.carriers[(jira || 'none') + ':' + column];
    assert.ok(got, cell + ': carrier result exists');
    assert.deepEqual({bound: got.bound, jira: got.jira, telemetry: got.telemetry, verdict: got.verdict},
      {bound: true, jira, telemetry: column, verdict: verdicts[index]}, cell);
    assert.deepEqual(got.failing, FAILING[column], cell + ': failing limits');
  });
});

test('verdict labels name every matrix verdict', () => {
  const input=matrixPage();input.carriers.push({id:'pending-other',tickets:['BE-1'],...CALL});input.telemetryMap['pending-other']={signals:{rate:{value:30}}};
  const out = judge(input), seen = new Set(['done']);assert.equal(out.carriers['pending-other'].label,LABELS.done);
  for (const [jira, ...verdicts] of MATRIX) COLUMNS.forEach((column, index) => {
    const verdict = verdicts[index], got = out.carriers[(jira || 'none') + ':' + column];
    assert.equal(got.label, verdict === null ? null : LABELS[verdict], (jira || 'none') + ' x ' + column + ': label');
    if (verdict !== null) seen.add(verdict);
  });
  assert.deepEqual([...seen].sort(), Object.keys(LABELS).sort(), 'the matrix reaches every verdict label');
});

test('a carrier\'s Jira state rolls up its tickets like liveStatusEvidence', () => {
  const rows = [
    [[], null], [['BE-1'], 'done'], [['BE-1', 'BE-6'], 'done'], [['BE-3'], 'todo'],
    [['BE-1', 'BE-3'], 'active'], [['BE-1', 'BE-2'], 'active'], [['BE-1', 'BE-5'], 'missing'],
    [['BE-5', 'BE-4', 'BE-2'], 'blocked'], [['BE-1', 'BE-404'], 'unknown'], [['BE-2', 'BE-404'], 'active'],
    [['BE-404'], 'unknown'],
  ];
  const out = judge({carriers: rows.map(([tickets], index) => ({id: 'j' + index, tickets})), jiraMap: JIRA});
  rows.forEach(([tickets, expected], index) => assert.equal(out.carriers['j' + index].jira, expected, tickets.join(',') || 'no tickets'));
  const odd = judge({carriers: [{id: 'c', tickets: ['BE-9']}], jiraMap: {'BE-9': {state: 'shipped'}}});
  assert.equal(odd.carriers.c.jira, 'unknown', 'an unrecognised state is not evidence');
});

const BAND = {kind: 'queue', signals: {in: QUEUE.signals.in}, proof: {in: {min: 10, max: 5000}}};
const TYPO = {kind: 'call', signals: {rate: CALL.signals.rate, errors: CALL.signals.errors},
  proof: {rate: {min: 10}, errors: {maxRatioOf: 'requests', max: 0.01}}};
const reading = value => (typeof value === 'number' ? {value} : value);
const sampleOf = values => ({signals: Object.fromEntries(Object.entries(values).map(([name, value]) => [name, reading(value)]))});
const LIMITS = [
  ['min holds at the floor', QUEUE, {in: 10, lag: 0, age: 0}, 'flowing', []],
  ['min fails below the floor', QUEUE, {in: 9, lag: 0, age: 0}, 'degraded', ['in']],
  ['max holds at the ceiling', QUEUE, {in: 400, lag: 500, age: 60}, 'flowing', []],
  ['max fails above the ceiling', QUEUE, {in: 400, lag: 501, age: 61}, 'degraded', ['lag', 'age']],
  ['maxRatioOf holds at the ceiling', CALL, {rate: 1300, errors: 13, p95: 100}, 'flowing', []],
  ['maxRatioOf fails above the ceiling', CALL, {rate: 1300, errors: 14, p95: 100}, 'degraded', ['errors']],
  ['maxRatioOf over zero traffic fails when errors exist', CALL, {rate: 0, errors: 3, p95: 100}, 'degraded', ['rate', 'errors']],
  ['min and max on one signal: inside the band', BAND, {in: 4000}, 'flowing', []],
  ['min and max on one signal: above the band', BAND, {in: 6000}, 'degraded', ['in']],
  ['a known failure wins over a pending signal', CALL, {rate: 1300, errors: 60}, 'degraded', ['errors']],
  ['a pending limited signal blocks flowing', CALL, {rate: 1300, errors: 5}, 'unobserved', []],
  ['maxRatioOf naming a signal that is not bound never proves', TYPO, {rate: 1300, errors: 5}, 'unobserved', []],
  ['without value the last series point is the headline (holds)', QUEUE, {in: {series: [[T0, 2], [T0 + H, 40]]}, lag: 0, age: 0}, 'flowing', []],
  ['without value the last series point is the headline (fails)', QUEUE, {in: {series: [[T0, 40], [T0 + H, 2]]}, lag: 0, age: 0}, 'degraded', ['in']],
  ['value wins over the series tail', QUEUE, {in: {value: 40, series: [[T0, 2]]}, lag: 0, age: 0}, 'flowing', []],
];
const DONE_VERDICT = {unmeasured: 'done-traffic-unmeasured', flowing: 'proven', degraded: 'done-degraded', unobserved: 'done', silent: 'done-unproven'};

test('proof limits: min, max and maxRatioOf', () => {
  for (const [name, binding, values, telemetry, failing] of LIMITS) {
    const got = judge({carriers: [{id: 'c', tickets: ['BE-1'], ...binding}], jiraMap: JIRA, telemetryMap: {c: sampleOf(values)}}).carriers.c;
    assert.deepEqual({telemetry: got.telemetry, failing: got.failing, verdict: got.verdict},
      {telemetry, failing, verdict: DONE_VERDICT[telemetry]}, name);
  }
});

const COUNTS = {kind: 'service',
  signals: {rate: {source: 'honeycomb', query: {calc: 'COUNT', where: 'service.name = event-ingest'}}, errors: {source: 'honeycomb', query: {calc: 'COUNT', where: 'service.name = event-ingest AND error = true'}}},
  proof: {rate: {min: 10}, errors: {maxRatioOf: 'rate', max: 0.01}}};
const RATIO_ONLY = {kind: 'service',
  signals: {total: {source: 'honeycomb', query: {calc: 'COUNT'}}, fails: {source: 'honeycomb', query: {calc: 'COUNT', where: 'error = true'}}},
  proof: {fails: {maxRatioOf: 'total', max: 0.01}}};
const UNBOUND = {bound: false, jira: 'done', telemetry: null, verdict: null, label: null, failing: [], since: {doneAt: at(0), firstTrafficAt: null}};
const PRESENCE = [
  ['no sample at all', CALL, undefined, 'unobserved'],
  ['a sample without signals', CALL, {signals: {}}, 'unobserved'],
  ['readings that are not finite numbers', CALL, {signals: {rate: {value: 'n/a'}, errors: {value: null}, p95: {series: [[T0, NaN]]}}}, 'unobserved'],
  ['every rate-like signal zero over the window is silent', LOG, {signals: {count: {value: 0, series: [[T0, 0], [T0 + H, 0]]}}}, 'silent'],
  ['zero now but traffic earlier in the window is not silent', LOG, {signals: {count: {value: 0, series: [[T0, 4], [T0 + H, 0]]}}}, 'unmeasured'],
  ['one rate-like signal pending and the rest zero is not yet silent', CALL, {signals: {rate: {value: 0}}}, 'unobserved'],
  ['a maxRatioOf numerator is rate-like without a per-time unit: errors at zero rate are not silent', COUNTS, {signals: {rate: {value: 0}, errors: {value: 3}}}, 'degraded'],
  ['a maxRatioOf denominator is rate-like without a limit or unit: pending total is not yet silent', RATIO_ONLY, {signals: {fails: {value: 0}}}, 'unobserved'],
  ['a per-time unit makes a signal rate-like without any limit', {kind: 'device', signals: {presses: {source: 'grafana', query: 'sum(rate(button_press_total[5m]))*3600', unit: 'presses/h'}, battery: {source: 'grafana', query: 'min(battery_percent)', unit: '%'}}},
    {signals: {presses: {value: 0}, battery: {value: 80}}}, 'silent'],
  ['without rate-like signals a carrier is never silent', {kind: 'queue', signals: {lag: QUEUE.signals.lag}, proof: {lag: {max: 500}}}, {signals: {lag: {value: 0}}}, 'unmeasured'],
];

test('silent vs unobserved vs unbound', () => {
  for (const [name, binding, sample, telemetry] of PRESENCE) {
    const got = judge({carriers: [{id: 'c', tickets: ['BE-1'], ...binding}], jiraMap: JIRA, telemetryMap: sample ? {c: sample} : {}}).carriers.c;
    assert.deepEqual({bound: got.bound, telemetry: got.telemetry, verdict: got.verdict}, {bound: true, telemetry, verdict: telemetry==='unobserved' && !Number.isFinite(sample?.signals?.rate?.value) ? 'done-traffic-unmeasured' : DONE_VERDICT[telemetry]}, name);
  }
  const unbound = judge({carriers: [
    {id: 'empty-signals', tickets: ['BE-1'], kind: 'call', signals: {}, proof: {rate: {min: 10}}},
    {id: 'no-telemetry', tickets: ['BE-1']},
  ], jiraMap: JIRA, telemetryMap: {'empty-signals': SAMPLES.flowing, 'no-telemetry': SAMPLES.flowing}});
  assert.deepEqual(unbound.carriers['empty-signals'], UNBOUND, 'no signals is unbound even when a sample arrives');
  assert.deepEqual(unbound.carriers['no-telemetry'], UNBOUND, 'a carrier without a binding is unbound');
  assert.deepEqual(unbound.rollups, {bound: 0, unbound: 2, proven: 0, degraded: 0, unproven: 0, liveEarly: 0}, 'unbound carriers stay out of the denominator');
});

test('since: Done time from Jira and first traffic at or after it', () => {
  const series = [[at(0), 5], [T0 + H, 0], [T0 + 1.5 * H, 12], [T0 + 2 * H, 30]];
  const traffic = {signals: {rate: {value: 30, series}, errors: {value: 0}, p95: {value: 100}}};
  const out = judge({carriers: [
    {id: 'shipped', tickets: ['BE-1', 'BE-6'], ...CALL},
    {id: 'early', tickets: ['BE-2'], ...CALL},
    {id: 'unstamped', tickets: ['BE-1', 'BE-7'], ...CALL},
    {id: 'quiet', tickets: ['BE-1'], ...CALL},
  ], jiraMap: JIRA, telemetryMap: {shipped: traffic, early: traffic, unstamped: traffic, quiet: SAMPLES.silent}});
  assert.deepEqual(out.carriers.shipped.since, {doneAt: at(1), firstTrafficAt: at(1.5)}, 'latest Done ticket starts the clock; earlier traffic is not after Done');
  assert.deepEqual(out.carriers.early.since, {doneAt: null, firstTrafficAt: at(0)}, 'work not done has no Done time; first traffic in the window');
  assert.deepEqual(out.carriers.unstamped.since, {doneAt: null, firstTrafficAt: at(0)}, 'a Done ticket without updatedAt leaves the Done time unknown');
  assert.deepEqual(out.carriers.quiet.since, {doneAt: at(0), firstTrafficAt: null}, 'silent carriers have no first traffic');
});

/* One carrier per role; imported carriers arrive with the resolver's
   qualified identities and are judged like local ones. */
const ROLES = {
  'proven-a': ['BE-1', SAMPLES.flowing], 'canon::api': ['BE-6', SAMPLES.flowing],
  'done-unproven': ['BE-1', SAMPLES.silent], 'done-degraded': ['BE-1', SAMPLES.degraded], 'done-unobserved': ['BE-1', undefined],
  'active-silent': ['BE-2', SAMPLES.silent], 'active-live-early': ['BE-2', SAMPLES.flowing], 'active-failing': ['BE-2', SAMPLES.degraded],
  'todo-silent': ['BE-3', SAMPLES.silent], 'todo-already-live': ['BE-3', SAMPLES.flowing], 'canon::api->canon::store': ['BE-3', SAMPLES.flowing],
  blocked: ['BE-4', SAMPLES.degraded], missing: ['BE-5', SAMPLES.flowing], awaiting: ['BE-404', SAMPLES.flowing],
  'none-healthy': [null, SAMPLES.flowing], 'none-degraded': [null, SAMPLES.degraded],
};
function rolePage(steps) {
  const carriers = Object.entries(ROLES).map(([id, [ticket]]) => ({id, tickets: ticket ? [ticket] : [], ...CALL}));
  carriers.push({id: 'unbound', tickets: ['BE-1']}, {id: 'canon::store', tickets: ['BE-3'], kind: 'service', signals: {}});
  const telemetryMap = Object.fromEntries(Object.entries(ROLES).filter(([, [, sample]]) => sample).map(([id, [, sample]]) => [id, sample]));
  telemetryMap.unbound = SAMPLES.flowing;
  return {carriers, jiraMap: JIRA, telemetryMap, steps};
}

test('rollups count bound carriers by verdict; unbound carriers separately', () => {
  const out = judge(rolePage([]));
  assert.equal(out.carriers['canon::api'].verdict, 'proven', 'imported node is judged');
  assert.equal(out.carriers['canon::api->canon::store'].verdict, 'todo-already-live', 'imported edge is judged');
  assert.equal(out.carriers['canon::store'].bound, false, 'imported unbound carrier is counted as unbound');
  assert.deepEqual(out.rollups, {bound: 16, unbound: 2, proven: 2, degraded: 3, unproven: 1, liveEarly: 3},
    'proven: proven; degraded: done-degraded, active-failing, degraded; unproven: done-unproven; liveEarly: live early and already live; blocked, missing, pending and awaiting are bound but uncounted');
});

const STEPS = [
  ['all proven', ['proven-a', 'canon::api'], 'proven'],
  ['one silent carrier leaves a done step unproven', ['proven-a', 'done-unproven'], 'done-unproven'],
  ['degraded outranks silent', ['done-unproven', 'proven-a', 'done-degraded'], 'done-degraded'],
  ['pending minimum observation is not measured traffic', ['proven-a', 'done-unobserved'], 'done-traffic-unmeasured'],
  ['silent outranks pending', ['done-unobserved', 'done-unproven'], 'done-unproven'],
  ['active work wins the Jira axis', ['proven-a', 'active-silent'], 'active'],
  ['live early needs every carrier flowing', ['proven-a', 'active-live-early'], 'active-live-early'],
  ['done plus todo rolls up as in progress, like liveStatusRollup', ['proven-a', 'todo-silent'], 'active'],
  ['all todo and flowing, imported edge included', ['todo-already-live', 'canon::api->canon::store'], 'todo-already-live'],
  ['failing beside live early', ['active-live-early', 'active-failing'], 'active-failing'],
  ['blocked wins', ['proven-a', 'blocked'], 'blocked'],
  ['blocked outranks missing', ['missing', 'blocked'], 'blocked'],
  ['missing outranks failing', ['active-failing', 'missing'], 'missing'],
  ['awaiting Jira evidence gives no verdict', ['proven-a', 'awaiting'], null],
  ['active outranks awaiting, like liveStatusPresentationRollup', ['active-silent', 'awaiting'], 'active'],
  ['no-ticket carriers vote on telemetry only', ['proven-a', 'none-degraded'], 'done-degraded'],
  ['no-ticket healthy beside proven', ['none-healthy', 'proven-a'], 'proven'],
  ['only no-ticket carriers', ['none-healthy'], 'healthy'],
  ['unbound carriers are ignored', ['proven-a', 'unbound', 'canon::store'], 'proven'],
  ['only unbound carriers', ['unbound'], null],
  ['empty step', [], null],
  ['unknown carrier ids are ignored', ['proven-a', 'not-a-carrier'], 'proven'],
];

test('step rollup: worst verdict of the step\'s directly selected carriers', () => {
  const out = judge(rolePage(STEPS.map(([id, carriers]) => ({id, carriers}))));
  for (const [id, , expected] of STEPS)
    assert.deepEqual(out.steps[id], {verdict: expected, label: expected === null ? null : LABELS[expected]}, id);
});

test('pure: no DOM, no clock, no timers; input untouched; bad input is empty', () => {
  assert.ok(source.length, 'src/core/proof.js exists');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(code, /\b(document|window|setTimeout|setInterval|requestAnimationFrame|performance)\b|Date\.now/, 'no DOM, clock or timer access');
  const input = rolePage(STEPS.map(([id, carriers]) => ({id, carriers}))), before = JSON.stringify(input);
  judge(input, {});
  assert.equal(JSON.stringify(input), before, 'input is not mutated');
  const empty = {carriers: {}, rollups: {bound: 0, unbound: 0, proven: 0, degraded: 0, unproven: 0, liveEarly: 0}, steps: {}};
  for (const bad of [undefined, null, 42, 'page', [], {carriers: 'x', jiraMap: 3, telemetryMap: [], steps: {}}])
    assert.deepEqual(judge(bad), empty, JSON.stringify(bad) ?? 'undefined');
  const odd = judge({carriers: [null, {id: ''}, {id: 7}, {id: '__proto__', tickets: ['BE-1'], ...CALL}, {id: 'x', tickets: ['BE-1'], ...CALL}, {id: 'x', tickets: []}],
    jiraMap: JIRA, telemetryMap: {__proto__: null, x: SAMPLES.flowing}});
  assert.deepEqual(Object.keys(odd.carriers).sort(), ['__proto__', 'x'], 'only string ids; a repeated id keeps its first entry');
  assert.equal(odd.carriers.x.verdict, 'proven');
});

test('ships in the validator runtime bundle next to the other core modules', () => {
  assert.ok(sourceFiles('validator.js').includes('core/proof.js'), 'src/source-bundles.json lists core/proof.js in validator.js');
  const V = {URL}; vm.createContext(V); vm.runInContext(readSource('validator.js'), V);
  assert.deepEqual(judge(matrixPage(), {}, V), judge(matrixPage()), 'the bundled engine gives the same verdicts');
});

test('authored observed minimum gates proof for local/imported/nested/overlay/loaded numeric carriers',()=>{
 const cases=[
  ['errors-only',{}, {errors:{max:0}}, {errors:0},'unmeasured','done-traffic-unmeasured',[]],
  ['arbitrary event count and zero errors',{}, {errors:{max:0}}, {total:18,errors:0},'unmeasured','done-traffic-unmeasured',[]],
  ['no limits',{}, {}, {total:18},'unmeasured','done-traffic-unmeasured',[]],
  ['max only',{}, {total:{max:20}}, {total:18},'unmeasured','done-traffic-unmeasured',[]],
  ['max fails',{}, {total:{max:10}}, {total:18},'degraded','done-degraded',['total']],
  ['per-time without min',{total:'events/h'}, {}, {total:18},'unmeasured','done-traffic-unmeasured',[]],
  ['no minima or observations',{}, {}, {},'unobserved','done-traffic-unmeasured',[]],
  ['min read missing',{}, {total:{min:1}}, {errors:0},'unobserved','done-traffic-unmeasured',[]],
  ['min actual zero',{}, {total:{min:1}}, {total:0},'silent','done-unproven',['total']],
  ['zero floor silent',{}, {total:{min:0}}, {total:0},'silent','done-unproven',[]],
  ['positive pass',{}, {total:{min:1}}, {total:18},'flowing','proven',[]],
  ['positive fail',{}, {total:{min:20}}, {total:18},'degraded','done-degraded',['total']],
  ['ratio without minimum',{}, {errors:{max:.1,maxRatioOf:'total'}}, {total:18,errors:0},'unmeasured','done-traffic-unmeasured',[]],
  ['ratio pending',{}, {total:{min:1},errors:{max:.1,maxRatioOf:'total'}}, {total:18},'unobserved','done',[]],
  ['ratio fails',{}, {total:{min:1},errors:{max:.1,maxRatioOf:'total'}}, {total:18,errors:5},'degraded','done-degraded',['errors']],
 ];
 for(const [name,units,proof,values,state,verdict,failing] of cases)for(const id of ['local','direct::api','outer::inner::api','overlay::api','loaded::api']){
  const carrier={id,tickets:['BE-1'],signals:Object.fromEntries(['total','errors'].map(n=>[n,{source:'grafana',query:n,unit:units[n]}])),proof};
  const sample={signals:Object.fromEntries(Object.entries(values).map(([n,value])=>[n,{value}]))};
  const out=judge({carriers:[carrier],jiraMap:JIRA,telemetryMap:{[id]:sample},steps:[{id:'step',carriers:[id]}]});
  assert.deepEqual([out.carriers[id].telemetry,out.carriers[id].verdict,out.carriers[id].failing],[state,verdict,failing],id+' '+name);
  assert.equal(out.steps.step.verdict,verdict,id+' '+name+' step');
  if(verdict==='done-traffic-unmeasured')assert.equal(out.carriers[id].label,'DONE · traffic not measured');
  for(const jira of ['active','testing','todo']){
   carrier.tickets=[TICKET[jira]];const result=judge({carriers:[carrier],jiraMap:JIRA,telemetryMap:{[id]:sample}}).carriers[id];
   if(state==='unmeasured')assert.equal(result.verdict,jira,name+' cannot invent live early');
  }
 }
});

test('trace declarations never participate in numeric proof, including misleading names and samples',()=>{
 for(const trace of [{source:'tempo',query:'{}'},{source:'honeycomb',query:{query_spec:{}}}]){
  const carrier={id:'shared::api',tickets:['BE-1'],signals:{rate:trace},proof:{rate:{min:1}}};
  const telemetryMap={'shared::api':{signals:{rate:{value:500}}}};
  assert.equal(judge({carriers:[carrier],jiraMap:JIRA,telemetryMap}).carriers[carrier.id].bound,false);
  carrier.signals.count={source:'grafana',query:'count'};carrier.proof.count={min:1};telemetryMap[carrier.id].signals.count={value:2};
  const result=judge({carriers:[carrier],jiraMap:JIRA,telemetryMap}).carriers[carrier.id];
  assert.equal(result.verdict,'proven');assert.deepEqual(result.failing,[]);
 }
});

test('trace ratio targets do not participate in scalar limits or traffic classification',()=>{
 const carrier={id:'a',tickets:['BE-1'],signals:{events:{source:'grafana',query:'count'},trace:{source:'tempo',query:'{}'}},proof:{events:{min:1,max:1,maxRatioOf:'trace'}}};
 const result=judge({carriers:[carrier],jiraMap:JIRA,telemetryMap:{a:{signals:{events:{value:5}}}}}).carriers.a;
 assert.equal(result.telemetry,'unmeasured');assert.equal(result.verdict,'done-traffic-unmeasured');assert.deepEqual(result.failing,[]);
});
