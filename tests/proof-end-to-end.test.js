'use strict';
/* #1404: end-to-end proof from metrics (page `tracking.endToEndMetrics: true`).
   With the flag on, proofVerdicts judges each carrier that has a proof limit
   from its limits and traffic only (Jira ignored); the Proof presentation shows
   the headline and drops ticket wording. With the flag off nothing changes. */
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {readSource, entrypoint} = require('../tools/source-loader.cjs');

const P = {}; vm.createContext(P); vm.runInContext(readSource('core/proof.js'), P, {filename: 'core/proof.js'});
const C = {URL, AbortController, document: {addEventListener(){}, removeEventListener(){}}, setTimeout, clearTimeout};
vm.runInNewContext(entrypoint('native').source, C);
const plain = value => JSON.parse(JSON.stringify(value));
const judge = (input, options, engine = P) => plain(engine.proofVerdicts(input, options));
const ON = {endToEndMetrics: true};

const T0 = Date.parse('2026-11-03T09:00:00.000Z'), H = 3600000;
const at = hours => new Date(T0 + hours * H).toISOString();
const CALL = {kind: 'call',
  signals: {
    rate: {source: 'grafana', query: 'rate', unit: 'req/h'},
    errors: {source: 'grafana', query: 'errors', unit: 'req/h'},
    p95: {source: 'grafana', query: 'p95', unit: 'ms'}},
  proof: {rate: {min: 10}, errors: {maxRatioOf: 'rate', max: 0.01}, p95: {max: 500}}};
const ERROR_CALL = {...CALL, signals: {...CALL.signals, errors: {...CALL.signals.errors, role: 'error'}}};
const NO_LIMIT = {kind: 'log-event', signals: {count: {source: 'loki', query: 'count', unit: 'events/h'}}, proof: {}};
const MAX_ONLY = {kind: 'queue', signals: {lag: {source: 'grafana', query: 'lag', unit: 'msgs'}}, proof: {lag: {max: 500}}};
const S = {
  flowing: {signals: {rate: {value: 1300, series: [[at(0), 1200], [at(1), 1300]]}, errors: {value: 5}, p95: {value: 410}}, observedAt: at(1)},
  silent: {signals: {rate: {value: 0, series: [[at(0), 0], [at(1), 0]]}, errors: {value: 0, series: [[at(0), 0], [at(1), 0]]}, p95: {value: 0}}, observedAt: at(1)},
  belowMin: {signals: {rate: {value: 5}, errors: {value: 0}, p95: {value: 100}}, observedAt: at(1)},
  errorRatio: {signals: {rate: {value: 1300}, errors: {value: 60}, p95: {value: 410}}, observedAt: at(1)},
  slow: {signals: {rate: {value: 1300}, errors: {value: 0}, p95: {value: 900}}, observedAt: at(1)},
  rateOnly: {signals: {rate: {value: 30}}, observedAt: at(1)},
  count: {signals: {count: {value: 40}}, observedAt: at(1)},
  lagOk: {signals: {lag: {value: 10}}, observedAt: at(1)},
  lagHigh: {signals: {lag: {value: 900}}, observedAt: at(1)},
};
const JIRA = {
  'BE-1': {state: 'done', updatedAt: at(0)}, 'BE-2': {state: 'active', updatedAt: at(-1)}, 'BE-3': {state: 'todo'},
  'BE-4': {state: 'blocked'}, 'BE-5': {state: 'missing'}, 'BE-8': {state: 'testing'},
};
/* id, binding, tickets, sample, expected verdict, counted */
const CASES = [
  ['no-ticket-flowing', CALL, [], 'flowing', 'proven', true],
  ['active-flowing', CALL, ['BE-2'], 'flowing', 'proven', true],
  ['todo-flowing', CALL, ['BE-3'], 'flowing', 'proven', true],
  ['blocked-flowing', CALL, ['BE-4'], 'flowing', 'proven', true],
  ['missing-flowing', CALL, ['BE-5'], 'flowing', 'proven', true],
  ['unknown-ticket-flowing', CALL, ['BE-404'], 'flowing', 'proven', true],
  ['done-silent', CALL, ['BE-1'], 'silent', 'unproven', true],
  ['no-ticket-silent', CALL, [], 'silent', 'unproven', true],
  ['below-min', CALL, ['BE-1'], 'belowMin', 'unproven', true],
  ['done-error-ratio', CALL, ['BE-1'], 'errorRatio', 'degraded', true],
  ['testing-slow', CALL, ['BE-8'], 'slow', 'degraded', true],
  ['error-role', ERROR_CALL, [], 'errorRatio', 'error', true],
  ['no-sample', CALL, ['BE-1'], null, null, true],
  ['limit-pending', CALL, [], 'rateOnly', null, true],
  ['max-only-held', MAX_ONLY, [], 'lagOk', 'unproven', true],
  ['max-only-breached', MAX_ONLY, [], 'lagHigh', 'degraded', true],
  ['no-limit', NO_LIMIT, ['BE-1'], 'count', null, false],
];
const LABELS = {proven: 'PROVEN', degraded: 'DEGRADED', error: 'ERROR', unproven: 'UNPROVEN'};
function page(cases = CASES, steps = []){
  const carriers = cases.map(([id, binding, tickets]) => ({id, tickets, ...binding}));
  carriers.push({id: 'unbound', tickets: ['BE-1'], kind: 'call', signals: {}, proof: {}});
  const telemetryMap = Object.fromEntries(cases.filter(c => c[3]).map(([id, , , sample]) => [id, S[sample]]));
  telemetryMap.unbound = S.flowing;
  return {carriers, jiraMap: JIRA, telemetryMap, steps};
}

test('flag on: each counted carrier is proven, degraded, error or unproven from limits and traffic only; Jira is ignored', () => {
  const out = judge(page(), ON);
  for (const [id, , , , verdict, counted] of CASES){
    const got = out.carriers[id];
    assert.deepEqual({verdict: got.verdict, label: got.label, counted: got.counted, jira: got.jira, doneAt: got.since.doneAt},
      {verdict, label: verdict === null ? null : LABELS[verdict], counted, jira: null, doneAt: null}, id);
  }
  assert.deepEqual(out.carriers.unbound, {bound: false, jira: null, telemetry: null, verdict: null, label: null, failing: [], counted: false,
    since: {doneAt: null, firstTrafficAt: null}});
  assert.deepEqual(out.carriers['below-min'].failing, ['rate']);
  assert.equal(out.carriers['active-flowing'].since.firstTrafficAt, at(0), 'first traffic is measured without a Done time');
  assert.deepEqual(out.rollups, {bound: 17, unbound: 1, proven: 6, degraded: 3, unproven: 4, liveEarly: 0},
    'error carriers are counted by the presentation (#1201), not in a core bucket');
});

test('flag on: headline "N of M proven" lists degraded, error, unproven and not-measured carriers; no-limit carriers are not counted', () => {
  assert.deepEqual(judge(page(), ON).endToEnd, {
    counted: 16, proven: 6, complete: false, headline: '6 of 16 proven',
    degraded: ['done-error-ratio', 'testing-slow', 'max-only-breached'], error: ['error-role'],
    unproven: ['done-silent', 'no-ticket-silent', 'below-min', 'max-only-held'],
    unmeasured: ['no-sample', 'limit-pending'], uncounted: ['no-limit']});
});

test('flag on: "End to end proven" only when every counted carrier is proven; nothing is claimed without limits', () => {
  const proven = CASES.filter(c => c[4] === 'proven' || !c[5]);
  const all = judge(page(proven), ON).endToEnd;
  assert.deepEqual(all, {counted: 6, proven: 6, complete: true, headline: 'End to end proven',
    degraded: [], error: [], unproven: [], unmeasured: [], uncounted: ['no-limit']});
  for (const extra of ['error-role', 'done-error-ratio', 'below-min', 'no-sample']){
    const one = judge(page(proven.concat(CASES.filter(c => c[0] === extra))), ON).endToEnd;
    assert.equal(one.complete, false, extra);
    assert.equal(one.headline, '6 of 7 proven', extra);
  }
  const none = judge(page(CASES.filter(c => !c[5])), ON);
  assert.deepEqual(none.endToEnd, {counted: 0, proven: 0, complete: false, headline: null,
    degraded: [], error: [], unproven: [], unmeasured: [], uncounted: ['no-limit']});
  assert.deepEqual(judge({carriers: []}, ON).endToEnd.headline, null);
});

test('flag on: a step takes the worst counted carrier; ticket narrowing and no-limit carriers do not vote', () => {
  const STEPS = [
    ['all proven', ['no-ticket-flowing', 'active-flowing'], 'proven'],
    ['error outranks degraded', ['done-error-ratio', 'error-role'], 'error'],
    ['degraded outranks unproven', ['done-silent', 'testing-slow'], 'degraded'],
    ['unproven outranks pending', ['no-sample', 'below-min'], 'unproven'],
    ['pending gives no verdict', ['no-ticket-flowing', 'no-sample'], null],
    ['no-limit carrier does not vote', ['no-ticket-flowing', 'no-limit'], 'proven'],
    ['only no-limit carriers', ['no-limit'], null],
    ['only unbound', ['unbound'], null],
  ];
  const steps = STEPS.map(([id, carriers]) => ({id, carriers}));
  steps.push({id: 'narrowed', carriers: ['active-flowing'], tickets: {'active-flowing': ['BE-1']}});
  const out = judge(page(CASES, steps), ON);
  for (const [id, , verdict] of STEPS) assert.deepEqual(out.steps[id], {verdict, label: verdict === null ? null : LABELS[verdict]}, id);
  assert.deepEqual(out.steps.narrowed, {verdict: 'proven', label: 'PROVEN'});
});

test('flag off, false or not the boolean true: results are identical to today', () => {
  const steps = [{id: 's', carriers: CASES.map(c => c[0])}, {id: 'n', carriers: ['active-flowing'], tickets: {'active-flowing': ['BE-1']}}];
  const today = judge(page(CASES, steps));
  assert.equal('endToEnd' in today, false);
  assert.equal('counted' in today.carriers['no-ticket-flowing'], false);
  assert.equal(today.carriers['active-flowing'].verdict, 'active-live-early');
  for (const options of [undefined, {}, {endToEndMetrics: false}, {endToEndMetrics: 'true'}, {endToEndMetrics: 1}, null])
    assert.deepEqual(judge(page(CASES, steps), options), today, JSON.stringify(options));
});

/* Presentation: the Proof box and table model the panel renders. */
function snapshot(cases, options){
  const input = page(cases);
  const carriers = input.carriers.map(c => ({...c, title: 'Title ' + c.id, links: {}}));
  return {carriers, map: input.telemetryMap, pending: {}, verdicts: plain(C.proofVerdicts({carriers, jiraMap: JIRA, telemetryMap: input.telemetryMap}, options))};
}
const TICKET_WORDS = /DONE|IN PROGRESS|TESTING|TODO|LIVE EARLY|ALREADY LIVE|BLOCKED|MISSING|Jira|Done/;

test('presentation, flag on: headline sentence, ring over counted carriers, rows without ticket wording', () => {
  const model = C.liveStatusProofPresentation(snapshot(CASES, ON), '24h');
  assert.equal(model.endToEnd.headline, '6 of 16 proven');
  assert.equal(model.sentence, '6 of 16 proven · Degraded: Title done-error-ratio, Title testing-slow, Title max-only-breached · Error: Title error-role · ' +
    'Unproven: Title done-silent, Title no-ticket-silent, Title below-min, Title max-only-held · Not measured: Title no-sample, Title limit-pending · ' +
    '1 carrier without a limit not counted · 1 carrier unbound.');
  assert.deepEqual(plain(model.counts), {bound: 17, unbound: 1, proven: 6, degraded: 3, unproven: 4, liveEarly: 0, error: 1, counted: 16, unmeasured: 2, uncounted: 1, neutral: 3});
  assert.deepEqual(plain(model.arcs.map(a => [a.key, a.count, a.size])), [['proven', 6, 37.5], ['degraded', 3, 18.75], ['error', 1, 6.25], ['unproven', 4, 25]]);
  const byId = Object.fromEntries(model.rows.map(r => [r.id, r]));
  for (const [id, , , , verdict] of CASES) if (verdict) assert.equal(byId[id].label, LABELS[verdict], id);
  assert.equal(byId['no-limit'].label, 'OBSERVED · not counted, no limit');
  assert.equal(byId['no-sample'].label, 'UNOBSERVED');
  for (const row of model.rows){
    assert.doesNotMatch(row.label, TICKET_WORDS, row.id + ' label');
    assert.equal(row.chart.markers.some(m => m.kind === 'done'), false, row.id + ' has no Done marker');
  }
  assert.doesNotMatch(model.sentence, /Done carriers|bound carriers proven/);
});

test('presentation, flag on: "End to end proven" and nothing claimed without limits', () => {
  const proven = CASES.filter(c => c[4] === 'proven' || !c[5]);
  const all = C.liveStatusProofPresentation(snapshot(proven, ON), '24h');
  assert.equal(all.endToEnd.headline, 'End to end proven');
  assert.equal(all.sentence, 'End to end proven · 6 of 6 carriers with limits proven · 1 carrier without a limit not counted · 1 carrier unbound.');
  const none = C.liveStatusProofPresentation(snapshot(CASES.filter(c => !c[5]), ON), '24h');
  assert.equal(none.endToEnd.headline, null);
  assert.equal(none.sentence, 'No carrier has a proof limit, so nothing is claimed · 1 carrier without a limit not counted · 1 carrier unbound.');
  assert.deepEqual(plain(none.arcs.map(a => a.size)), [0, 0, 0]);
});

test('presentation, flag off: no end-to-end model and today\'s sentence', () => {
  const model = C.liveStatusProofPresentation(snapshot(CASES), '24h');
  assert.equal(model.endToEnd, null);
  assert.match(model.sentence, /^\d+ of 17 bound carriers proven · \d+ Done carriers unproven · /);
});

test('controller: tracking.endToEndMetrics true reaches the snapshot verdicts; other values do not', () => {
  const carrier = {title: 'API', tickets: ['AA-1'], telemetry: {kind: 'service', signals: {rate: {grafana: 'explicit', unit: 'req/h'}}, proof: {rate: {min: 1}}}};
  for (const [flag, on] of [[true, true], [false, false], ['true', false], [undefined, false]]){
    const pageSpec = {tracking: {telemetry: {window: '6h'}, ...(flag === undefined ? {} : {endToEndMetrics: flag})}};
    const api = C.createTelemetry(pageSpec, {provider: () => ({})}, {carriers: fn => fn(carrier, 'api', pageSpec), jira: () => ({'AA-1': {state: 'active'}})});
    api.apply({api: {signals: {rate: {value: 5}}}});
    const snap = api.snapshot();
    assert.equal(snap.verdicts.carriers.api.verdict, on ? 'proven' : 'active-live-early', String(flag));
    assert.equal(Boolean(snap.verdicts.endToEnd), on, String(flag));
    assert.equal(api.verdicts().carriers.api.verdict, on ? 'proven' : 'active-live-early', String(flag) + ' canvas verdicts');
    api.destroy();
  }
});
