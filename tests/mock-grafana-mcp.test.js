'use strict';
// Mock Grafana MCP (#944 PR 1): the third story mock beside mock-atlassian-mcp and
// mock-github-mcp. It answers the Grafana MCP tools the telemetry adapter uses with
// fixture telemetry computed from the shared 12-day doorbell timeline.
// G1  layout, dependency-free imports, placeholder config with the RL binding.
// G2  JSON-RPC discovery: exactly the seven read-only tools with Grafana parameter names.
// G3  list_datasources: the Prometheus, Loki and Tempo UIDs the example binds.
// G4  traffic starts two hours after the carrier's tickets turn Done on the timeline.
// G5  event edge degrades after the Day 10 deploy annotation and stays degraded on Day 12.
// G6  route queue lags on Day 11 and recovers by Day 12.
// G7  push edge is silent on Day 12 although its tickets are Done.
// G8  query_prometheus result shapes, empty-result hints and tool-level errors.
// G9  query_loki_logs metric (matrix/vector) and log-line shapes, limits and silence.
// G10 search_tempo_traces / get_tempo_trace exemplars on the event path; never a push span.
// G11 get_annotations filters; generate_deeplink URLs as plain text.
// G12 story clock: pinned/clamped days, DEPLOYED_AT rotation, non-story scenarios.
// G13 worker routes, batches, notifications, CORS and the per-IP rate limit (429).
// G14 identity regexes and ignore rules (only the committed placeholder Worker name).
// G15 fixture carriers exist in the example spec with the same tickets; README contract.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..');
const DIR = 'deploy/cloudflare/mock-grafana-mcp';
const read = rel => {
  assert.ok(fs.existsSync(path.join(ROOT, rel)), rel + ' must exist');
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
};
const json = rel => JSON.parse(read(rel));
const load = () => { read(DIR + '/mcp.mjs'); return import(pathToFileURL(path.join(ROOT, DIR, 'mcp.mjs')).href); };
const loadStory = () => { read(DIR + '/story.mjs'); return import(pathToFileURL(path.join(ROOT, DIR, 'story.mjs')).href); };
const worker = async () => {
  read(DIR + '/worker.mjs');
  return (await import(pathToFileURL(path.join(ROOT, DIR, 'worker.mjs')).href)).default;
};
const timeline = () => json('examples/live-status/live-status.timeline.json');

const HOUR = 3600000;
const DAY = 24 * HOUR;
const EPOCH = Date.parse('2026-10-20T09:00:00Z');
// Story day index i (label "Day i+1") is the calendar day 2026-10-20 + i; its "now" is the following midnight.
const STORY_START = Date.parse('2026-10-20T00:00:00Z');
const nowOf = index => STORY_START + (index + 1) * DAY;
const ctx = (index, extra = {}) => ({ scenario: 'story', day: index, now: EPOCH, ...extra });
const DAY9 = 8, DAY10 = 9, DAY11 = 10, DAY12 = 11;
const PROM = 'prom-main', LOKI = 'loki-main', TEMPO = 'tempo-main';
// Canonical signal expressions; the README documents these names for the spec authors.
const Q = {
  press: 'sum(rate(button_press_total{device="doorbell"}[5m]))*3600',
  ring: 'sum(rate(chime_ring_total{device="doorbell"}[5m]))*3600',
  eventRate: 'sum(rate(http_server_requests_total{service="event-ingest",route="/v1/events"}[5m]))*3600',
  eventErrors: 'sum(rate(http_server_requests_total{service="event-ingest",route="/v1/events",code=~"5.."}[5m]))*3600',
  eventP95: 'histogram_quantile(0.95, sum by (le)(rate(http_server_request_duration_seconds_bucket{service="event-ingest",route="/v1/events"}[5m])))*1000',
  routeIn: 'sum(rate(kafka_server_brokertopicmetrics_messagesin_total{topic="device-events"}[5m]))*3600',
  routeLag: 'max(kafka_consumergroup_lag{topic="device-events",group="notify-consumers"})',
  routeAge: 'max(kafka_consumergroup_lag_seconds{topic="device-events",group="notify-consumers"})',
  pushP95: 'histogram_quantile(0.95, sum by (le)(rate(push_latency_seconds_bucket{app="notify"}[5m])))*1000',
  ingestRate: 'sum(rate(http_server_requests_total{service="event-ingest"}[5m]))*3600'
};
const L = {
  pushSent: 'sum(rate({app="notify"} |= "push sent" [5m]))*3600',
  pushFailed: 'sum(rate({app="notify"} |= "push failed" [5m]))*3600',
  consumed: 'sum(rate({app="notify"} |= "event consumed" [5m]))*3600'
};
const TOOLS = ['generate_deeplink', 'get_annotations', 'get_tempo_trace', 'list_datasources', 'query_loki_logs',
  'query_prometheus', 'search_tempo_traces'];

const rpc = (method, params = {}, id = 1) => ({ jsonrpc: '2.0', id, method, params });
async function call(name, args = {}, context = ctx(DAY12)) {
  const { handleMcp } = await load();
  return handleMcp(rpc('tools/call', { name, arguments: args }), context);
}
// Successful tool result: one text block; JSON tools carry JSON text, and structuredContent
// (query_prometheus only, as the real server sends it) must equal the parsed text.
function payload(response, { text = false } = {}) {
  assert.equal(response.jsonrpc, '2.0');
  assert.equal(response.error, undefined, JSON.stringify(response.error));
  assert.notEqual(response.result.isError, true, response.result.content?.[0]?.text);
  assert.equal(response.result.content.length, 1);
  assert.equal(response.result.content[0].type, 'text');
  if (text) return response.result.content[0].text;
  const value = JSON.parse(response.result.content[0].text);
  if (response.result.structuredContent !== undefined) assert.deepEqual(response.result.structuredContent, value);
  return value;
}
// Tool-level failure: the real server answers isError results, not JSON-RPC errors.
function toolError(response) {
  assert.equal(response.error, undefined);
  assert.equal(response.result.isError, true);
  assert.equal(response.result.content[0].type, 'text');
  return response.result.content[0].text;
}
const iso = ms => new Date(ms).toISOString().replace('.000Z', 'Z');
async function prom(expr, context, extra = {}) {
  return payload(await call('query_prometheus', { datasourceUid: PROM, expr, endTime: 'now', queryType: 'instant', ...extra }, context));
}
async function instant(expr, context) {
  const data = (await prom(expr, context)).data;
  if (!data.length) return null;
  assert.equal(data.length, 1, expr);
  return Number(data[0].value[1]);
}
async function range(expr, context, startMs, endMs, stepSeconds) {
  const data = (await prom(expr, context, { queryType: 'range', startTime: iso(startMs), endTime: iso(endMs), stepSeconds })).data;
  const points = new Map();
  for (const series of data) for (const [t, v] of series.values) points.set(Math.round(t * 1000), (points.get(Math.round(t * 1000)) || 0) + Number(v));
  return points;
}
const normalize = stamp => stamp.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
// Done = the stamp of the last ticket on the first timeline day where all the carrier's tickets are done.
function doneAt(keys) {
  const days = timeline().days;
  for (const day of days) {
    if (keys.every(key => day.issues[key]?.state === 'done')) return Math.max(...keys.map(key => Date.parse(normalize(day.issues[key].updated))));
  }
  return null;
}
async function fetchMock(url, init = {}, env = {}) {
  return (await worker()).fetch(new Request('https://example.test' + url, init), env);
}
const post = body => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('G1: module exports, layout and placeholder config with the rate limit binding', async () => {
  const mod = await load();
  assert.equal(typeof mod.handleMcp, 'function');
  const story = await loadStory();
  assert.equal(typeof story.storyNow, 'function');
  assert.equal(typeof story.CARRIERS, 'object');
  assert.equal(typeof (await worker()).fetch, 'function');
  for (const file of ['worker.mjs', 'mcp.mjs', 'story.mjs', 'README.md', 'wrangler.jsonc']) assert.ok(fs.existsSync(path.join(ROOT, DIR, file)), file);
  const config = json(DIR + '/wrangler.jsonc');
  assert.equal(config.name, 'mock-grafana-mcp');
  assert.equal(config.main, 'worker.mjs');
  assert.ok(config.compatibility_date);
  const limiter = (config.ratelimits || []).find(binding => binding.name === 'RL');
  assert.ok(limiter, 'ratelimits binding named RL');
  assert.match(String(limiter.namespace_id), /^\d+$/);
  assert.notEqual(String(limiter.namespace_id), String(json('deploy/cloudflare/mock-atlassian-mcp/wrangler.jsonc').ratelimits[0].namespace_id),
    'a separate rate limit namespace from the Jira mock');
  assert.equal(limiter.simple.limit, 60);
  assert.equal(limiter.simple.period, 60);
  assert.ok(!fs.existsSync(path.join(ROOT, DIR, 'node_modules')));
  for (const file of ['mcp.mjs', 'worker.mjs', 'story.mjs']) {
    const source = read(DIR + '/' + file);
    assert.doesNotMatch(source, /from\s+["'](?:node:|@|https?:)/);
    for (const match of source.matchAll(/from\s+["']([^"']+)["']/g)) assert.ok(match[1].startsWith('.'), match[1]);
  }
});

test('G2: initialize, tools/list with Grafana parameter names and read-only annotations, protocol errors', async () => {
  const { handleMcp } = await load();
  for (const protocolVersion of [undefined, '2025-03-26']) {
    assert.deepEqual(handleMcp(rpc('initialize', { protocolVersion }), ctx(DAY12)), {
      jsonrpc: '2.0', id: 1, result: { protocolVersion: protocolVersion || '2025-06-18',
        capabilities: { tools: {} }, serverInfo: { name: 'mock-grafana-mcp', version: '0.1.0' } }
    });
  }
  const tools = handleMcp(rpc('tools/list'), ctx(DAY12)).result.tools;
  assert.deepEqual(tools.map(t => t.name).sort(), TOOLS);
  const inputs = {
    list_datasources: [[], ['type', 'name', 'limit', 'offset']],
    query_prometheus: [['datasourceUid', 'expr', 'endTime'], ['startTime', 'stepSeconds', 'queryType']],
    query_loki_logs: [['datasourceUid', 'logql'], ['startRfc3339', 'endRfc3339', 'limit', 'direction', 'queryType', 'stepSeconds']],
    search_tempo_traces: [['datasourceUid', 'query'], ['start', 'end', 'limit', 'spss']],
    get_tempo_trace: [['datasourceUid', 'trace_id'], ['start', 'end']],
    get_annotations: [[], ['from', 'to', 'limit', 'dashboardUid', 'type', 'tags', 'matchAny']],
    generate_deeplink: [['resourceType'], ['dashboardUid', 'datasourceUid', 'panelId', 'queries', 'timeRange']]
  };
  for (const tool of tools) {
    const [required, optional] = inputs[tool.name];
    assert.equal(tool.inputSchema.type, 'object');
    assert.deepEqual([...(tool.inputSchema.required || [])].sort(), [...required].sort(), tool.name);
    for (const name of required.concat(optional)) assert.ok(tool.inputSchema.properties[name], tool.name + '.' + name);
    assert.deepEqual(tool.annotations, { readOnlyHint: true, destructiveHint: false, title: tool.annotations.title });
    assert.ok(tool.annotations.title.length > 0);
    assert.match(tool.description, /mock/i);
  }
  assert.equal(handleMcp(rpc('not/a/method'), ctx(DAY12)).error.code, -32601);
  assert.equal((await call('query_sql')).error.code, -32602, 'unserved tools are unknown, as on a server without the SQL category');
  assert.equal(handleMcp({ jsonrpc: '2.0', method: 'notifications/initialized' }, ctx(DAY12)), null);
  assert.equal(handleMcp({ jsonrpc: '1.0', id: 1, method: 'tools/list' }, ctx(DAY12)).error.code, -32600);
});

test('G3: list_datasources serves the three example datasources with type and name filters', async () => {
  const all = payload(await call('list_datasources'));
  assert.deepEqual(all.datasources.map(ds => [ds.uid, ds.type]), [[PROM, 'prometheus'], [LOKI, 'loki'], [TEMPO, 'tempo']]);
  assert.equal(all.total, 3);
  assert.equal(all.hasMore, false);
  for (const ds of all.datasources) {
    assert.equal(typeof ds.id, 'number');
    assert.equal(typeof ds.name, 'string');
    assert.equal(typeof ds.isDefault, 'boolean');
  }
  assert.deepEqual(payload(await call('list_datasources', { type: 'loki' })).datasources.map(ds => ds.uid), [LOKI]);
  assert.deepEqual(payload(await call('list_datasources', { name: 'TEMPO' })).datasources.map(ds => ds.uid), [TEMPO]);
  const paged = payload(await call('list_datasources', { limit: 1, offset: 1 }));
  assert.deepEqual([paged.datasources.map(ds => ds.uid), paged.total, paged.hasMore], [[LOKI], 3, true]);
});

test('G4: each carrier starts carrying traffic two hours after its tickets turn Done', async () => {
  const story = await loadStory();
  const step = 300;
  for (const [expr, carrier] of [[Q.press, 'edge:button->mcu'], [Q.ring, 'edge:mcu->chime'], [Q.eventRate, 'edge:mcu->ingest'],
    [Q.routeIn, 'edge:ingest->notify'], [Q.ingestRate, 'node:ingest']]) {
    const done = doneAt(story.CARRIERS[carrier].tickets);
    assert.ok(done, carrier + ' turns Done on the timeline');
    const points = await range(expr, ctx(DAY12), done - HOUR, done + 4 * HOUR, step);
    const flowing = [...points.keys()].sort((a, b) => a - b);
    assert.ok(flowing.length > 0, carrier + ' carries traffic on Day 12');
    // The first evaluation whose 5m window lies after Done + 2 h is the first sample.
    assert.equal(iso(flowing[0]), iso(done + 2 * HOUR + step * 1000), carrier);
    assert.ok(points.get(flowing[0]) >= 10, carrier + ' rate clears the 10 per hour proof floor');
  }
  // Before the hardware Done day nothing flows; on Day 9 hardware flows but the event edge is still silent.
  assert.equal(await instant(Q.press, ctx(DAY9 - 1)), null);
  assert.ok((await instant(Q.press, ctx(DAY9))) >= 10);
  assert.equal(await instant(Q.eventRate, ctx(DAY9)), null);
  // A timeline on which FW-45 never finishes keeps the event edge and everything downstream of it silent.
  const custom = structuredClone(timeline());
  for (const day of custom.days) if (day.issues['FW-45']) day.issues['FW-45'].state = 'active';
  const stalled = ctx(DAY12, { timeline: custom });
  assert.ok((await instant(Q.press, stalled)) >= 10);
  for (const expr of [Q.eventRate, Q.routeIn]) assert.equal(await instant(expr, stalled), null, expr);
});

test('G5: the event edge degrades after the Day 10 deploy annotation and stays degraded on Day 12', async () => {
  const annotations = payload(await call('get_annotations', { tags: ['deploy'] }, ctx(DAY10))).Payload;
  const deploy = annotations.find(a => /firmware 2\.4\.1/.test(a.text));
  assert.ok(deploy, 'Day 10 carries the firmware 2.4.1 deploy annotation');
  assert.ok(deploy.tags.includes('firmware'));
  assert.equal(new Date(deploy.time).toISOString().slice(0, 10), '2026-10-29', 'annotation lies on Day 10');
  assert.ok(!payload(await call('get_annotations', {}, ctx(DAY9))).Payload.some(a => a.id === deploy.id), 'not known on Day 9');
  const start = STORY_START + DAY10 * DAY, end = nowOf(DAY10);
  const rate = await range(Q.eventRate, ctx(DAY10), start, end, 3600);
  const errors = await range(Q.eventErrors, ctx(DAY10), start, end, 3600);
  const p95 = await range(Q.eventP95, ctx(DAY10), start, end, 3600);
  const before = [...rate.keys()].filter(t => t <= deploy.time), after = [...rate.keys()].filter(t => t > deploy.time);
  assert.ok(before.length >= 2 && after.length >= 2, 'traffic on both sides of the deploy');
  for (const t of before) {
    assert.ok(errors.get(t) / rate.get(t) <= 0.01, 'healthy before the deploy at ' + iso(t));
    assert.ok(p95.get(t) <= 300, 'fast before the deploy at ' + iso(t));
  }
  for (const t of after.filter(t => t >= deploy.time + HOUR)) {
    assert.ok(errors.get(t) / rate.get(t) > 0.01, 'errors above 1 % after the deploy at ' + iso(t));
    assert.ok(p95.get(t) > 300, 'slow after the deploy at ' + iso(t));
  }
  const day12 = ctx(DAY12);
  assert.ok((await instant(Q.eventErrors, day12)) / (await instant(Q.eventRate, day12)) > 0.01, 'still degraded on Day 12');
  assert.ok((await instant(Q.eventP95, day12)) > 300);
  // The ingest node aggregates the same request series, so it degrades with its edge.
  assert.ok((await instant(Q.ingestRate, day12)) >= (await instant(Q.eventRate, day12)));
});

test('G6: the route queue lags on Day 11 and recovers by Day 12', async () => {
  for (const [index, lagging] of [[DAY10, false], [DAY11, true], [DAY12, false]]) {
    const lag = await instant(Q.routeLag, ctx(index)), age = await instant(Q.routeAge, ctx(index)), inRate = await instant(Q.routeIn, ctx(index));
    assert.ok(inRate >= 10, 'messages flow in on day index ' + index);
    assert.equal(lag > 500, lagging, 'lag ' + lag + ' on day index ' + index);
    assert.equal(age > 60, lagging, 'age ' + age + ' on day index ' + index);
  }
});

test('G7: the push edge is silent on Day 12 although both of its tickets are Done', async () => {
  const story = await loadStory();
  const day12 = timeline().days[DAY12].issues;
  for (const key of story.CARRIERS['edge:notify->app'].tickets) assert.equal(day12[key].state, 'done', key);
  for (const logql of [L.pushSent, L.pushFailed]) {
    const result = payload(await call('query_loki_logs', { datasourceUid: LOKI, logql, startRfc3339: 'now-24h', endRfc3339: 'now', stepSeconds: 3600 }));
    assert.deepEqual(result.data, [], logql);
    assert.equal(typeof result.hints.summary, 'string');
  }
  assert.deepEqual((await prom(Q.pushP95, ctx(DAY12), { queryType: 'range', startTime: 'now-24h', stepSeconds: 3600 })).data, []);
  // The notification service itself is busy: it consumes events but never pushes.
  const consumed = payload(await call('query_loki_logs', { datasourceUid: LOKI, logql: L.consumed, queryType: 'instant', endRfc3339: 'now' }));
  assert.ok(consumed.data[0].value >= 10);
});

test('G8: query_prometheus shapes, hints and tool-level errors', async () => {
  const end = nowOf(DAY12);
  const matrix = await prom(Q.eventRate, ctx(DAY12), { queryType: 'range', startTime: 'now-1h', stepSeconds: 600 });
  assert.equal(matrix.data.length, 1);
  assert.deepEqual(matrix.data[0].metric, {});
  assert.deepEqual(matrix.data[0].values.map(([t]) => t * 1000), [0, 1, 2, 3, 4, 5, 6].map(k => end - HOUR + k * 600000));
  for (const [t, v] of matrix.data[0].values) { assert.equal(typeof t, 'number'); assert.equal(typeof v, 'string'); assert.ok(Number.isFinite(Number(v))); }
  assert.match(matrix.exploreUrl, /^https:\/\/acme\.grafana\.net\/explore\?/);
  const response = await call('query_prometheus', { datasourceUid: PROM, expr: Q.eventRate, endTime: 'now', queryType: 'instant' });
  assert.ok(response.result.structuredContent, 'query_prometheus carries structuredContent like the real server');
  const vector = payload(response).data;
  assert.equal(vector.length, 1);
  assert.equal(vector[0].value[0] * 1000, end);
  // Absolute RFC3339 times are story times; unknown metrics are empty with hints, as on a real server.
  assert.equal((await prom(Q.eventRate, ctx(DAY12), { endTime: iso(end - DAY) })).data[0].value[0] * 1000, end - DAY);
  const unknown = await prom('sum(rate(no_such_metric_total[5m]))', ctx(DAY12));
  assert.deepEqual(unknown.data, []);
  assert.equal(typeof unknown.hints.summary, 'string');
  assert.deepEqual((await prom(Q.eventRate, ctx(DAY12), { endTime: iso(end + HOUR) })).data, [], 'the future is unknown');
  // Errors are isError tool results naming the problem.
  const base = { datasourceUid: PROM, expr: Q.eventRate, endTime: 'now' };
  assert.match(toolError(await call('query_prometheus', { ...base, startTime: 'now-1h' })), /stepSeconds/);
  assert.match(toolError(await call('query_prometheus', { ...base, queryType: 'range', stepSeconds: 60 })), /startTime/);
  assert.match(toolError(await call('query_prometheus', { ...base, start: 'now-1h', queryType: 'instant' })), /unknown argument.*start/i);
  assert.match(toolError(await call('query_prometheus', { ...base, datasourceUid: LOKI, queryType: 'instant' })), /loki-main/);
  assert.match(toolError(await call('query_prometheus', { ...base, endTime: 'yesterday', queryType: 'instant' })), /time/i);
  assert.match(toolError(await call('query_prometheus', { ...base, startTime: 'now-30d', stepSeconds: 60 })), /11,?000/);
  assert.match(toolError(await call('query_prometheus', { datasourceUid: PROM, endTime: 'now', queryType: 'instant' })), /expr/);
});

test('G9: query_loki_logs metric and log shapes, limits and direction', async () => {
  const end = nowOf(DAY12);
  const matrix = payload(await call('query_loki_logs', { datasourceUid: LOKI, logql: L.consumed, startRfc3339: 'now-1h', endRfc3339: 'now', stepSeconds: 900 }));
  assert.equal(matrix.data.length, 1);
  assert.deepEqual(matrix.data[0].labels, {});
  assert.equal(matrix.data[0].values.length, 5);
  for (const sample of matrix.data[0].values) {
    assert.match(sample.timestamp, /^\d+\.\d{3}$/);
    assert.equal(typeof sample.value, 'number');
  }
  assert.equal(Number(matrix.data[0].values.at(-1).timestamp) * 1000, end);
  const vector = payload(await call('query_loki_logs', { datasourceUid: LOKI, logql: L.consumed, queryType: 'instant', endRfc3339: 'now' })).data;
  assert.equal(vector.length, 1);
  assert.match(vector[0].timestamp, /^\d+\.\d{3}$/);
  assert.deepEqual(Object.keys(vector[0]).sort(), ['labels', 'timestamp', 'value']);
  // Log lines: newest first by default, default limit 10, capped at 100, nanosecond timestamps.
  const logs = payload(await call('query_loki_logs', { datasourceUid: LOKI, logql: '{app="notify"} |= "event consumed"' }));
  assert.equal(logs.data.length, 10);
  assert.deepEqual(logs.metadata.linesReturned, 10);
  assert.equal(logs.metadata.resultsTruncated, true);
  const stamps = logs.data.map(entry => BigInt(entry.timestamp));
  for (let i = 1; i < stamps.length; i++) assert.ok(stamps[i - 1] >= stamps[i], 'backward order');
  assert.ok(stamps[0] <= BigInt(end) * 1000000n);
  for (const entry of logs.data) { assert.match(entry.line, /event consumed/); assert.equal(entry.labels.app, 'notify'); }
  const forward = payload(await call('query_loki_logs', { datasourceUid: LOKI, logql: '{app="notify"}', limit: 3, direction: 'forward' })).data;
  assert.equal(forward.length, 3);
  assert.ok(BigInt(forward[0].timestamp) <= BigInt(forward[2].timestamp), 'forward order');
  assert.equal(payload(await call('query_loki_logs', { datasourceUid: LOKI, logql: '{app="notify"}', limit: 500 })).data.length, 100);
  assert.deepEqual(payload(await call('query_loki_logs', { datasourceUid: LOKI, logql: '{app="notify"} |= "push"' })).data, []);
  assert.match(toolError(await call('query_loki_logs', { datasourceUid: PROM, logql: L.consumed })), /prom-main/);
  assert.match(toolError(await call('query_loki_logs', { datasourceUid: LOKI, logql: L.consumed, start: 'now-1h' })), /unknown argument/i);
});

test('G10: Tempo exemplar traces follow the event path and never contain a push span', async () => {
  const day12 = ctx(DAY12);
  const failing = payload(await call('search_tempo_traces', { datasourceUid: TEMPO, query: '{ resource.service.name = "event-ingest" && status = error }' }, day12));
  assert.ok(failing.traces.length >= 1, 'a failing exemplar in the last hour of Day 12');
  for (const trace of failing.traces) {
    assert.match(trace.traceID, /^[0-9a-f]{32}$/);
    assert.equal(trace.rootServiceName, 'event-ingest');
    assert.equal(typeof trace.startTimeMs, 'number');
    assert.ok(trace.startTimeMs <= nowOf(DAY12) && trace.startTimeMs > nowOf(DAY12) - HOUR);
    assert.ok(trace.spanSets[0].spans.length >= 1);
  }
  const full = payload(await call('get_tempo_trace', { datasourceUid: TEMPO, trace_id: failing.traces[0].traceID }, day12));
  assert.equal(full.traceId, failing.traces[0].traceID);
  const spans = full.services.flatMap(service => service.spans.map(span => ({ ...span, service: service.serviceName })));
  assert.ok(spans.some(span => span.service === 'event-ingest' && span.status === 'error'));
  assert.ok(!spans.some(span => /push/i.test(span.name)), 'no push span ever');
  // Before the deploy a healthy exemplar reaches the notification consumer.
  const healthy = payload(await call('search_tempo_traces', { datasourceUid: TEMPO, query: '{ resource.service.name = "notify" }',
    start: '2026-10-29T12:00:00Z', end: '2026-10-29T15:00:00Z' }, ctx(DAY10)));
  assert.ok(healthy.traces.length >= 1);
  const trace = payload(await call('get_tempo_trace', { datasourceUid: TEMPO, trace_id: healthy.traces[0].traceID }, ctx(DAY10)));
  assert.deepEqual(trace.services.map(s => s.serviceName).sort(), ['event-ingest', 'notify']);
  assert.ok(!trace.services.flatMap(s => s.spans).some(span => /push/i.test(span.name)));
  // Nothing before FW-45 is Done; unknown traces and metrics queries are tool errors.
  assert.deepEqual(payload(await call('search_tempo_traces', { datasourceUid: TEMPO, query: '{ resource.service.name = "event-ingest" }' }, ctx(DAY9))).traces, []);
  assert.match(toolError(await call('get_tempo_trace', { datasourceUid: TEMPO, trace_id: '0'.repeat(32) }, day12)), /not found/i);
  assert.ok(toolError(await call('get_tempo_trace', { datasourceUid: TEMPO, trace_id: failing.traces[0].traceID }, ctx(DAY9))), 'not yet recorded on Day 9');
  assert.match(toolError(await call('search_tempo_traces', { datasourceUid: TEMPO, query: '{ } | rate()' }, day12)), /metrics/i);
});

test('G11: get_annotations filters and generate_deeplink returns plain URLs', async () => {
  const day12 = payload(await call('get_annotations')).Payload;
  assert.ok(day12.length >= 2);
  for (let i = 1; i < day12.length; i++) assert.ok(day12[i - 1].time >= day12[i].time, 'newest first');
  for (const a of day12) {
    assert.equal(typeof a.id, 'number'); assert.equal(typeof a.text, 'string'); assert.ok(Array.isArray(a.tags));
    assert.ok(a.time <= nowOf(DAY12));
  }
  const firmware = payload(await call('get_annotations', { tags: ['deploy', 'firmware'] })).Payload;
  assert.ok(firmware.length >= 1 && firmware.every(a => a.tags.includes('deploy') && a.tags.includes('firmware')));
  const any = payload(await call('get_annotations', { tags: ['firmware', 'backend'], matchAny: true })).Payload;
  assert.ok(any.length > firmware.length);
  const from = Date.parse('2026-10-29T12:00:00Z'), to = Date.parse('2026-10-29T20:00:00Z');
  const windowed = payload(await call('get_annotations', { from, to })).Payload;
  assert.ok(windowed.length >= 1 && windowed.every(a => a.time >= from && a.time <= to));
  assert.equal(payload(await call('get_annotations', { limit: 1 })).Payload.length, 1);
  assert.deepEqual(payload(await call('get_annotations', { type: 'alert' })).Payload, []);
  assert.deepEqual(payload(await call('get_annotations', {}, ctx(0))).Payload, []);

  const explore = payload(await call('generate_deeplink', { resourceType: 'explore', datasourceUid: PROM,
    queries: [{ refId: 'A', expr: Q.eventRate }], timeRange: { from: 'now-1h', to: 'now' } }), { text: true });
  assert.match(explore, /^https:\/\/acme\.grafana\.net\/explore\?/);
  const params = new URL(explore).searchParams;
  assert.equal(params.get('schemaVersion'), '1');
  const pane = Object.values(JSON.parse(params.get('panes')))[0];
  assert.equal(pane.datasource, PROM);
  assert.deepEqual(pane.queries, [{ refId: 'A', expr: Q.eventRate, datasource: { uid: PROM } }]);
  assert.deepEqual(pane.range, { from: 'now-1h', to: 'now' });
  const dashboard = payload(await call('generate_deeplink', { resourceType: 'dashboard', dashboardUid: 'kafka',
    timeRange: { from: 'now-6h', to: 'now' } }), { text: true });
  assert.equal(dashboard, 'https://acme.grafana.net/d/kafka?from=now-6h&to=now');
  assert.equal(payload(await call('generate_deeplink', { resourceType: 'panel', dashboardUid: 'kafka', panelId: 4 }), { text: true }),
    'https://acme.grafana.net/d/kafka?viewPanel=4');
  assert.match(toolError(await call('generate_deeplink', { resourceType: 'explore' })), /datasourceUid/);
  assert.match(toolError(await call('generate_deeplink', { resourceType: 'panel', dashboardUid: 'kafka' })), /panelId/);
  assert.match(toolError(await call('generate_deeplink', { resourceType: 'alert' })), /unsupported/i);
});

test('G12: pinned and clamped days, DEPLOYED_AT rotation and silent non-story scenarios', async () => {
  const { handleMcp } = await load();
  const days = timeline().days.length;
  assert.equal(days, 12);
  const ask = rpc('tools/call', { name: 'query_prometheus', arguments: { datasourceUid: PROM, expr: Q.routeLag, endTime: 'now', queryType: 'instant' } });
  const at = index => handleMcp(ask, ctx(index));
  assert.deepEqual(handleMcp(ask, ctx(99)), at(DAY12));
  assert.deepEqual(handleMcp(ask, ctx(-4)), at(0));
  assert.deepEqual(handleMcp(ask, ctx('10')), at(DAY11));
  const deployed = '2026-11-04T12:00:00Z';
  const timed = { scenario: 'story', DEPLOYED_AT: deployed, now: Date.parse(deployed) + (days + DAY11) * 60000 + 30000 };
  assert.deepEqual(handleMcp(ask, timed), at(DAY11), 'one story day per minute, looping after twelve');
  assert.deepEqual(handleMcp(ask, { now: EPOCH }), handleMcp(ask, { now: EPOCH, DEPLOYED_AT: 'bad-date' }));
  assert.deepEqual(handleMcp(ask, { now: EPOCH }), at(0), 'the fixed epoch is Day 1');
  const story = await loadStory();
  assert.equal(story.storyNow(DAY12), nowOf(DAY12));
  for (const scenario of ['all-todo', 'all-done', 'unknown']) {
    assert.equal(await instant(Q.press, ctx(DAY12, { scenario })), null, scenario);
    assert.deepEqual(payload(await call('get_annotations', {}, ctx(DAY12, { scenario }))).Payload, [], scenario);
    assert.equal(payload(await call('list_datasources', {}, ctx(DAY12, { scenario }))).total, 3, scenario);
  }
});

test('G13: worker routes, batches, notifications, CORS and the per-IP rate limit', async () => {
  assert.equal(await (await fetchMock('/healthz')).text(), 'ok');
  const home = await (await fetchMock('/')).text();
  assert.match(home, /Mock Grafana MCP/);
  for (const scenario of ['story', 'all-todo', 'all-done', 'day=']) assert.ok(home.includes(scenario), scenario);
  assert.equal((await fetchMock('/mcp')).status, 405);
  assert.equal((await fetchMock('/other', post(rpc('initialize')))).status, 404);
  const preflight = await fetchMock('/mcp', { method: 'OPTIONS' });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), '*');
  for (const name of ['content-type', 'mcp-session-id', 'mcp-protocol-version']) {
    assert.ok(preflight.headers.get('access-control-allow-headers').toLowerCase().split(/,\s*/).includes(name), name);
  }
  const init = await fetchMock('/mcp', post(rpc('initialize')));
  assert.equal(init.headers.get('access-control-allow-origin'), '*');
  assert.match(init.headers.get('content-type'), /^application\/json/);
  assert.equal((await init.json()).result.serverInfo.name, 'mock-grafana-mcp');
  assert.equal((await fetchMock('/mcp', post({ jsonrpc: '2.0', method: 'notifications/initialized' }))).status, 202);
  assert.equal((await (await fetchMock('/mcp', { method: 'POST', body: '{' })).json()).error.code, -32700);
  assert.equal((await (await fetchMock('/mcp', post([]))).json()).error.code, -32600);
  const lag = { name: 'query_prometheus', arguments: { datasourceUid: PROM, expr: Q.routeLag, endTime: 'now', queryType: 'instant' } };
  const batch = await (await fetchMock('/mcp?scenario=story&day=10', post([rpc('tools/list'), rpc('tools/call', lag, 2)]))).json();
  assert.equal(batch.length, 2);
  assert.ok(Number(payload(batch[1]).data[0].value[1]) > 500, 'URL day pin reaches the handler');
  const silent = await (await fetchMock('/mcp?scenario=all-done', post(rpc('tools/call', lag)))).json();
  assert.deepEqual(payload(silent).data, []);

  const keys = [];
  const limited = { RL: { limit: async ({ key }) => { keys.push(key); return { success: false }; } } };
  const headers = { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.9' };
  let response = await fetchMock('/mcp', { ...post(rpc('tools/list')), headers }, limited);
  assert.equal(response.status, 429);
  assert.match(response.headers.get('retry-after'), /^\d+$/);
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
  const body = await response.json();
  assert.deepEqual([body.jsonrpc, body.id, body.error.code], ['2.0', null, -32000]);
  assert.match(body.error.message, /rate limit/i);
  assert.deepEqual(keys, ['203.0.113.9']);
  response = await fetchMock('/mcp', post(rpc('tools/list')), limited);
  assert.equal(response.status, 429);
  assert.ok(typeof keys[1] === 'string' && keys[1].length > 0, 'a key without a client IP');
  for (const [url, init] of [['/healthz', {}], ['/', {}], ['/mcp', { method: 'OPTIONS' }]]) {
    assert.ok((await fetchMock(url, init, limited)).status < 300, url);
  }
  assert.equal(keys.length, 2, 'only MCP posts are counted');
  const allowed = { RL: { limit: async () => ({ success: true }) } };
  assert.equal((await (await fetchMock('/mcp', post(rpc('tools/list')), allowed)).json()).result.tools.length, TOOLS.length);
  assert.equal((await fetchMock('/mcp', post(rpc('tools/list')), {})).status, 200, 'works without the binding');
});

const IDENTITY = [
  /[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev/i,
  /[a-z0-9-]+\.cloudflareaccess\.com/i,
  /\b[0-9a-f]{32}\b/i,
  /FLOWVIEW_CF_WORKER[ \t]*:?[=-][ \t]*["']?[A-Za-z0-9-]/,
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/,
  /"name"\s*:\s*"[a-z0-9-]+"/,
  /^\s*name\s*=\s*["'][a-z0-9-]+["']/m,
  /--name[=\s]+["']?[a-z0-9-]+/,
  /\baccount_id\b\s*[:=]/i,
];
test('G14: identity and recursive ignore rules protect the new deploy folder', () => {
  assert.ok(fs.existsSync(path.join(ROOT, DIR)), DIR + ' must exist');
  // Scan only files git would track; ignored local state must not fail this test.
  const files = fs.readdirSync(path.join(ROOT, DIR), { recursive: true })
    .filter(f => fs.statSync(path.join(ROOT, DIR, f)).isFile())
    .filter(f => spawnSync('git', ['-C', ROOT, 'check-ignore', '--no-index', '-q', DIR + '/' + f]).status === 1);
  assert.ok(files.length >= 5, 'the reviewed sources are trackable');
  for (const file of files) {
    // The contract permits only the committed placeholder Worker name.
    const source = read(DIR + '/' + file).replace(/"name"\s*:\s*"mock-grafana-mcp"/g, '"name": "$PLACEHOLDER"');
    for (const pattern of IDENTITY) assert.doesNotMatch(source, pattern, file);
  }
  for (const file of ['worker.mjs', 'mcp.mjs', 'story.mjs', 'wrangler.jsonc', 'README.md']) {
    assert.equal(spawnSync('git', ['-C', ROOT, 'check-ignore', '--no-index', '-q', DIR + '/' + file]).status, 1, file);
  }
  for (const file of ['.wrangler/state', 'local.env', 'nested/local.env', 'nested/.wrangler/state', '.dev.vars', '.cloudflare/cache/account.json', 'other.mjs']) {
    assert.equal(spawnSync('git', ['-C', ROOT, 'check-ignore', '--no-index', '-q', DIR + '/' + file]).status, 0, file);
  }
});

test('G15: fixture carriers match the example spec, and the README documents the contract', async () => {
  const story = await loadStory();
  const diagram = json('examples/live-status/live-status.spec.json').page.sections[0].diagram;
  const carriers = Object.entries(story.CARRIERS);
  assert.ok(carriers.length >= 5);
  for (const [id, carrier] of carriers) {
    const [, kind, rest] = /^(node|edge):(.+)$/.exec(id) || [];
    const authored = kind === 'node' ? diagram.nodes[rest]
      : diagram.edges.find(edge => edge.from + '->' + edge.to === rest);
    assert.ok(authored, id + ' exists in the example spec');
    assert.deepEqual([...carrier.tickets].sort(), [...authored.tickets].sort(), id + ' tickets');
  }
  const readme = read(DIR + '/README.md');
  for (const text of ['npx -y wrangler@4 deploy -c deploy/cloudflare/mock-grafana-mcp/wrangler.jsonc', 'https://<worker>.<subdomain>.workers.dev/mcp',
    'Settings → Connectors → Add custom connector', 'No sign-in', 'DEPLOYED_AT', '?scenario=story&day=', 'ratelimits', '429', 'cf-connecting-ip',
    'placeholder', 'grafana/mcp-grafana', 'not a captured `tools/list`', 'prom-main', 'loki-main', 'tempo-main',
    'button_press_total', 'chime_ring_total', 'http_server_requests_total', 'http_server_request_duration_seconds_bucket',
    'kafka_server_brokertopicmetrics_messagesin_total', 'kafka_consumergroup_lag', 'kafka_consumergroup_lag_seconds',
    'push_latency_seconds_bucket', '{app="notify"}', 'push sent', 'push failed', 'event consumed', 'firmware 2.4.1',
    'isError', 'structuredContent', 'now-1h'].concat(TOOLS)) assert.ok(readme.includes(text), text);
  assert.match(read('docs/live-status.md'), /mock-grafana-mcp\/README\.md/);
  assert.match(read('deploy/cloudflare/README.md'), /mock-grafana-mcp/);
});
