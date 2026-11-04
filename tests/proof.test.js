'use strict';
/* #938: the pure proof verdict engine, src/core/proof.js. One carrier per
   verdict-matrix cell, limit edges, silent vs unobserved vs unbound, rollups
   and step rollups. Swapping any matrix cell, limit comparison or precedence
   entry fails a named row below. */
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
  silent: {signals: {rate: {value: 0, series: [[T0, 0], [T0 + H, 0]]}, errors: {value: 0, series: [[T0, 0], [T0 + H, 0]]}}, sampledAt: at(1)},
  flowing: {signals: {rate: {value: 1300, series: [[T0, 1200], [T0 + H, 1300]]}, errors: {value: 5}, p95: {value: 410}}, sampledAt: at(1)},
  degraded: {signals: {rate: {value: 1300}, errors: {value: 60}, p95: {value: 410}}, sampledAt: at(1)},
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
const TICKET = {done: 'BE-1', active: 'BE-2', todo: 'BE-3', blocked: 'BE-4', missing: 'BE-5', unknown: 'BE-404'};

/* Rows are the carrier's Jira state ('unknown' = tickets without evidence,
   null = no tickets); columns are the telemetry state its sample produces. */
const COLUMNS = ['silent', 'flowing', 'degraded', 'unobserved'];
const MATRIX = [
  ['done', 'done-unproven', 'proven', 'done-degraded', 'done'],
  ['active', 'active', 'active-live-early', 'active-failing', 'active'],
  ['todo', 'todo', 'todo-already-live', 'todo-failing', 'todo'],
  ['blocked', 'blocked', 'blocked', 'blocked', 'blocked'],
  ['missing', 'missing', 'missing', 'missing', 'missing'],
  [null, 'silent', 'healthy', 'degraded', null],
  ['unknown', null, null, null, null],
];
const FAILING = {silent: ['rate'], flowing: [], degraded: ['errors'], unobserved: []};
const LABELS = {
  proven: 'PROVEN', 'done-unproven': 'DONE · UNPROVEN', 'done-degraded': 'DONE · DEGRADED', done: 'DONE',
  active: 'IN PROGRESS', 'active-live-early': 'IN PROGRESS · LIVE EARLY', 'active-failing': 'IN PROGRESS · FAILING',
  todo: 'TODO', 'todo-already-live': 'TODO · ALREADY LIVE', 'todo-failing': 'TODO · FAILING',
  blocked: 'BLOCKED', missing: 'MISSING', healthy: 'HEALTHY', degraded: 'DEGRADED', silent: 'SILENT',
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
    assert.equal(P.proofCell(jira, column), verdicts[index], cell + ': proofCell');
  });
});

test('verdict labels name every matrix verdict', () => {
  assert.equal(typeof P.PROOF_VERDICT_LABELS, 'object', 'PROOF_VERDICT_LABELS is exported');
  assert.deepEqual(plain(P.PROOF_VERDICT_LABELS), LABELS);
  for (const [, ...verdicts] of MATRIX) for (const verdict of verdicts)
    if (verdict !== null) assert.equal(typeof LABELS[verdict], 'string', verdict + ' has a label');
});

test('a carrier\'s Jira state rolls up its tickets like liveStatusEvidence', () => {
  assert.equal(typeof P.proofJira, 'function', 'proofJira(tickets, jiraMap) is exported');
  const rows = [
    [[], null], [['BE-1'], 'done'], [['BE-1', 'BE-6'], 'done'], [['BE-3'], 'todo'],
    [['BE-1', 'BE-3'], 'active'], [['BE-1', 'BE-2'], 'active'], [['BE-1', 'BE-5'], 'missing'],
    [['BE-5', 'BE-4', 'BE-2'], 'blocked'], [['BE-1', 'BE-404'], 'unknown'], [['BE-2', 'BE-404'], 'active'],
    [['BE-404'], 'unknown'],
  ];
  for (const [tickets, expected] of rows) assert.equal(P.proofJira(tickets, JIRA), expected, tickets.join(',') || 'no tickets');
  assert.equal(P.proofJira(['BE-9'], {'BE-9': {state: 'shipped'}}), 'unknown', 'an unrecognised state is not evidence');
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
const DONE_VERDICT = {flowing: 'proven', degraded: 'done-degraded', unobserved: 'done', silent: 'done-unproven'};

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
const UNBOUND = {bound: false, jira: 'done', telemetry: null, verdict: null, failing: [], since: {doneAt: at(0), firstTrafficAt: null}};
const PRESENCE = [
  ['no sample at all', CALL, undefined, 'unobserved'],
  ['a sample without signals', CALL, {signals: {}}, 'unobserved'],
  ['readings that are not finite numbers', CALL, {signals: {rate: {value: 'n/a'}, errors: {value: null}, p95: {series: [[T0, NaN]]}}}, 'unobserved'],
  ['every rate-like signal zero over the window is silent', LOG, {signals: {count: {value: 0, series: [[T0, 0], [T0 + H, 0]]}}}, 'silent'],
  ['zero now but traffic earlier in the window is not silent', LOG, {signals: {count: {value: 0, series: [[T0, 4], [T0 + H, 0]]}}}, 'flowing'],
  ['one rate-like signal pending and the rest zero is not yet silent', CALL, {signals: {rate: {value: 0}}}, 'unobserved'],
  ['a maxRatioOf numerator is rate-like without a per-time unit: errors at zero rate are not silent', COUNTS, {signals: {rate: {value: 0}, errors: {value: 3}}}, 'degraded'],
  ['a maxRatioOf denominator is rate-like without a limit or unit: pending total is not yet silent', RATIO_ONLY, {signals: {fails: {value: 0}}}, 'unobserved'],
  ['a per-time unit makes a signal rate-like without any limit', {kind: 'device', signals: {presses: {source: 'grafana', query: 'sum(rate(button_press_total[5m]))*3600', unit: 'presses/h'}, battery: {source: 'grafana', query: 'min(battery_percent)', unit: '%'}}},
    {signals: {presses: {value: 0}, battery: {value: 80}}}, 'silent'],
  ['without rate-like signals a carrier is never silent', {kind: 'queue', signals: {lag: QUEUE.signals.lag}, proof: {lag: {max: 500}}}, {signals: {lag: {value: 0}}}, 'flowing'],
];

test('silent vs unobserved vs unbound', () => {
  for (const [name, binding, sample, telemetry] of PRESENCE) {
    const got = judge({carriers: [{id: 'c', tickets: ['BE-1'], ...binding}], jiraMap: JIRA, telemetryMap: sample ? {c: sample} : {}}).carriers.c;
    assert.deepEqual({bound: got.bound, telemetry: got.telemetry, verdict: got.verdict}, {bound: true, telemetry, verdict: DONE_VERDICT[telemetry]}, name);
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
  ['pending telemetry keeps the Jira state', ['proven-a', 'done-unobserved'], 'done'],
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
  for (const [id, , expected] of STEPS) assert.equal(out.steps[id], expected, id);
  assert.equal(typeof P.proofStepVerdict, 'function', 'proofStepVerdict(results) is exported');
  assert.equal(P.proofStepVerdict([out.carriers['proven-a'], out.carriers['done-degraded']]), 'done-degraded', 'proofStepVerdict matches the step map');
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
