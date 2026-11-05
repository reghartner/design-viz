'use strict';
/*
Contract matrix — focused Honeycomb story Worker (#946 / epic #948)

| Row | Contract | Fixture / scoped assertion | Rejects |
| H1 | Reviewed dependency-free Worker identity and unique rate-limit binding | tracked source allowlist + wrangler config | account data, local caches, reused namespace |
| H2 | Native verified discovery surface | initialize + tools/list schemas and annotations | renamed tools/arguments, write-capable tools |
| H3 | run_query returns the documented exact raw-result fields in a labelled mock transport | Day 12 event rate, all five supported calculations | rounded Markdown parsing, fabricated signed URL, fake percentile |
| H4 | Missing is not zero and COUNT counts hourly rows | Day 12 push zeros vs Day 8 nulls; planted zero→null negative control then restore | null coercion, COUNT-as-requests |
| H5 | Shared 12-day clock is bounded and has no future borrowing | every pinned day, deployed epoch rotation, future-only window | private timeline, unclamped day, future samples |
| H6 | Query subset fails closed | unsupported calc/filter/breakdown/time/unknown signal and dataset | arbitrary query interpretation |
| H7 | One shared-timeline carrier change affects only its own answer | injected copy changes mcu->ingest.rate only | hardcoded duplicate fixture or cross-carrier leakage |
| H8 | Known shared-story traces use the native table header and bounded metadata | Day 10 healthy/failing and Day 12 traces | invented unknown trace, push span, imprecise ns |
| H9 | JSON-RPC HTTP behavior uses real Request/Response | health, CORS, batch, notifications, parse/method errors, 429 | handler-only illusion or outbound requirement |
| H10 | README states mock/native boundary and manual deployment | required vocabulary and links | live-account claim, hidden polling/signed URL assumption |
*/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const DIR = 'deploy/cloudflare/mock-honeycomb-mcp';
const DAY10 = 9;
const DAY12 = 11;
const HOUR = 3600000;
const STORY_START = Date.parse('2026-10-20T00:00:00Z');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const json = relative => JSON.parse(read(relative));
const timeline = () => json('examples/live-status/live-status.timeline.json');
const url = relative => pathToFileURL(path.join(ROOT, relative)).href;
const load = () => import(url(DIR + '/mcp.mjs'));
const loadWorker = () => import(url(DIR + '/worker.mjs'));
const loadStory = () => import(url('deploy/cloudflare/mock-grafana-mcp/story.mjs'));
const rpc = (method, params, id = 1) => ({ jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) });
const ctx = (day = DAY12, extra = {}) => ({ scenario: 'story', day, ...extra });

async function call(name, args = {}, context = ctx()) {
  const { handleMcp } = await load();
  return handleMcp(rpc('tools/call', { name, arguments: args }), context);
}
function value(response) {
  assert.ok(response.result && !response.result.isError, response.result?.content?.[0]?.text || JSON.stringify(response));
  return response.result.structuredContent;
}
function error(response) {
  assert.equal(response.result?.isError, true, JSON.stringify(response));
  return response.result.content[0].text;
}
function queryArgs(carrier, signal, calculations = [{ op: 'AVG', column: 'flowview.value' }], extra = {}) {
  return {
    environment_slug: 'flowview-demo',
    dataset_slug: 'doorbell',
    query_spec: {
      calculations,
      filters: [
        { column: 'flowview.carrier', op: '=', value: carrier },
        { column: 'flowview.signal', op: '=', value: signal }
      ],
      from: '-24h',
      ...extra
    }
  };
}
async function query(carrier, signal, calculations, context, extra) {
  return value(await call('run_query', queryArgs(carrier, signal, calculations, extra), context));
}
const post = body => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
async function fetchMock(pathname, init = {}, env = {}) {
  const worker = (await loadWorker()).default;
  return worker.fetch(new Request('https://mock.invalid' + pathname, init), env);
}

test('H1: Worker sources are allowlisted, dependency-free, and use a unique placeholder binding', () => {
  for (const file of ['mcp.mjs', 'worker.mjs', 'wrangler.jsonc', 'README.md']) {
    assert.equal(spawnSync('git', ['-C', ROOT, 'check-ignore', '--no-index', '-q', `${DIR}/${file}`]).status, 1, file);
  }
  for (const file of ['local.env', '.dev.vars', '.wrangler/state', '.cloudflare/cache/account.json', 'nested/local.env']) {
    assert.equal(spawnSync('git', ['-C', ROOT, 'check-ignore', '--no-index', '-q', `${DIR}/${file}`]).status, 0, file);
  }
  const config = json(DIR + '/wrangler.jsonc');
  assert.equal(config.name, 'mock-honeycomb-mcp');
  assert.equal(config.main, 'worker.mjs');
  assert.ok(config.compatibility_date);
  const limiter = config.ratelimits.find(binding => binding.name === 'RL');
  assert.deepEqual(limiter.simple, { limit: 60, period: 60 });
  const siblings = ['mock-atlassian-mcp', 'mock-github-mcp', 'mock-grafana-mcp']
    .map(name => json(`deploy/cloudflare/${name}/wrangler.jsonc`).ratelimits?.[0]?.namespace_id)
    .filter(value => value !== undefined).map(String);
  assert.ok(/^\d+$/.test(String(limiter.namespace_id)));
  assert.ok(!siblings.includes(String(limiter.namespace_id)), 'separate rate-limit namespace');
  assert.ok(!fs.existsSync(path.join(ROOT, DIR, 'node_modules')));
  for (const file of ['mcp.mjs', 'worker.mjs']) {
    const source = read(DIR + '/' + file);
    assert.doesNotMatch(source, /from\s+["'](?:node:|@|https?:)/);
    if (file === 'mcp.mjs') assert.doesNotMatch(source, /\bfetch\s*\(/, 'pure handler makes no outbound fetch');
    for (const match of source.matchAll(/from\s+["']([^"']+)["']/g)) assert.ok(match[1].startsWith('.'), match[1]);
  }
});

test('H2: initialize and tools/list expose only verified Honeycomb names and mock/read-only annotations', async () => {
  const { handleMcp } = await load();
  for (const protocolVersion of [undefined, '2025-03-26']) {
    assert.deepEqual(handleMcp(rpc('initialize', { protocolVersion }), ctx()), {
      jsonrpc: '2.0', id: 1, result: {
        protocolVersion: protocolVersion || '2025-06-18', capabilities: { tools: {} },
        serverInfo: { name: 'mock-honeycomb-mcp', version: '0.1.0' }
      }
    });
  }
  const tools = handleMcp(rpc('tools/list'), ctx()).result.tools;
  assert.deepEqual(tools.map(tool => tool.name).sort(), ['get_query_results', 'get_trace', 'run_query']);
  const byName = Object.fromEntries(tools.map(tool => [tool.name, tool]));
  assert.deepEqual(Object.keys(byName.run_query.inputSchema.properties).sort(), ['dataset_slug', 'environment_slug', 'query_spec', 'raw_row_columns', 'results_limit']);
  assert.deepEqual(byName.run_query.inputSchema.required.sort(), ['dataset_slug', 'environment_slug', 'query_spec']);
  assert.equal(byName.run_query.inputSchema.properties.query_spec.type, 'object');
  assert.deepEqual(Object.keys(byName.get_trace.inputSchema.properties).sort(), ['environment_slug', 'from', 'trace_id', 'view_mode']);
  assert.deepEqual(byName.get_trace.inputSchema.required.sort(), ['environment_slug', 'from', 'trace_id']);
  assert.deepEqual(byName.get_query_results.inputSchema.properties, {});
  assert.equal(byName.get_query_results.inputSchema.additionalProperties, true);
  for (const tool of tools) {
    assert.deepEqual(tool.annotations, { readOnlyHint: true, destructiveHint: false, title: tool.annotations.title });
    assert.match(tool.description, /mock/i);
  }
  assert.match(error(await call('get_query_results', { query_run_pk: 'not-assumed' })), /not served.*input field names/i);
  assert.equal(handleMcp(rpc('other/method'), ctx()).error.code, -32601);
  assert.equal(handleMcp(rpc('tools/call', { name: 'find_queries', arguments: {} }), ctx()).error.code, -32602);
  for (const notification of [
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', method: 'initialize', params: {} },
    { jsonrpc: '2.0', method: 'tools/list' },
    { jsonrpc: '2.0', method: 'tools/call', params: { name: 'run_query', arguments: {} } }
  ]) assert.equal(handleMcp(notification, ctx()), null, notification.method);
  for (const invalidId of [true, false, {}, [], ['not-an-id']]) {
    assert.deepEqual(handleMcp(rpc('tools/list', undefined, invalidId), ctx()), {
      jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' }
    });
  }
  assert.equal(handleMcp(rpc('tools/list', undefined, null), ctx()).id, null, 'null remains a valid request id');
  for (const name of ['constructor', '__proto__', 'toString']) {
    const response = handleMcp(rpc('tools/call', { name, arguments: {} }), ctx());
    assert.equal(response.error.code, -32602, name);
    assert.equal(response.id, 1, name);
  }
  assert.equal(handleMcp({ jsonrpc: '1.0', id: 1, method: 'tools/list' }, ctx()).error.code, -32600);
});

test('H3: run_query returns exact raw fields and honest hourly calculations', async () => {
  const calculations = [
    { op: 'AVG', column: 'flowview.value' }, { op: 'SUM', column: 'flowview.value' },
    { op: 'MIN', column: 'flowview.value' }, { op: 'MAX', column: 'flowview.value' }, { op: 'COUNT' }
  ];
  const response = await call('run_query', queryArgs('mcu->ingest', 'rate', calculations), ctx());
  assert.match(response.result.content[0].text, /^MOCK Honeycomb raw query result JSON \(not a live or signed result\)\n/);
  assert.doesNotMatch(response.result.content[0].text, /query_result_json|query_url|https:\/\/mcp\.honeycomb\.io/);
  const raw = value(response);
  assert.deepEqual(Object.keys(raw).sort(), [
    'header', 'info', 'other_by_aggregate', 'results', 'series', 'template',
    'total_by_aggregate', 'total_by_aggregate_series'
  ]);
  assert.equal(raw.series.length, 24);
  assert.equal(raw.results.length, 1);
  assert.deepEqual(raw.info, { granularity_seconds: 3600, rows_examined: 24, mean_sample_rate: 1 });
  assert.deepEqual(raw.header.map(column => column.key_name), [
    'time', 'AVG(flowview.value)', 'SUM(flowview.value)', 'MIN(flowview.value)', 'MAX(flowview.value)', 'COUNT'
  ]);
  assert.equal(raw.results[0].data.COUNT, 24, 'COUNT is measurement rows');
  const values = timeline().days[DAY12].telemetry.carriers['mcu->ingest'].rate.values;
  const sum = values.reduce((total, item) => total + item, 0);
  assert.equal(raw.results[0].data['SUM(flowview.value)'], sum);
  assert.equal(raw.results[0].data['AVG(flowview.value)'], sum / values.length);
  assert.equal(raw.results[0].data['MIN(flowview.value)'], Math.min(...values));
  assert.equal(raw.results[0].data['MAX(flowview.value)'], Math.max(...values));
  assert.equal(raw.series[0].data.time, '2026-10-31T00:00:00Z');
  assert.equal(raw.series.at(-1).data.time, '2026-10-31T23:00:00Z');
  assert.equal(raw.series[0].data.COUNT, 1);
  assert.deepEqual(raw.total_by_aggregate, raw.results[0]);
  assert.deepEqual(raw.total_by_aggregate_series, raw.series);
  assert.equal(raw.other_by_aggregate, null);
  assert.deepEqual(JSON.parse(response.result.content[0].text.split('\n').slice(1).join('\n')), raw);
});

function assertMissingZeroContract(zero, missing) {
  assert.equal(zero.series.length, 24, 'measured zero keeps all 24 hourly rows');
  assert.deepEqual(zero.results[0].data, { 'AVG(flowview.value)': 0, COUNT: 24 });
  assert.deepEqual(missing.results, [], 'missing measurements have no aggregate result');
  assert.deepEqual(missing.series, [], 'missing measurements have no series rows');
  assert.equal(missing.info.rows_examined, 0);
}

test('H4: explicit zero stays data, null stays missing, and the negative control detects zero→missing', async () => {
  const calculations = [{ op: 'AVG', column: 'flowview.value' }, { op: 'COUNT' }];
  const zero = await query('notify->app', 'rate', calculations, ctx(DAY12));
  const missing = await query('notify->app', 'rate', calculations, ctx(7));
  assertMissingZeroContract(zero, missing);

  const planted = structuredClone(timeline());
  planted.days[DAY12].telemetry.carriers['notify->app'].rate.values[0] = null;
  const broken = await query('notify->app', 'rate', calculations, ctx(DAY12, { timeline: planted }));
  assert.throws(() => assertMissingZeroContract(broken, missing), /measured zero keeps all 24 hourly rows/,
    'negative control breaks the zero-vs-missing contract');
  assertMissingZeroContract(zero, missing, 'restored shared timeline still passes');
});

test('H5: all 12 pinned days, rotation, clamp, silent scenarios and future windows stay bounded', async () => {
  const counts = [];
  for (let day = 0; day < 12; day++) {
    const raw = await query('button->mcu', 'rate', [{ op: 'COUNT' }], ctx(day));
    counts.push(raw.info.rows_examined);
    assert.ok(raw.series.every(point => Date.parse(point.data.time) < STORY_START + (day + 1) * 24 * HOUR), `day ${day}`);
  }
  assert.deepEqual(counts.slice(0, 8), Array(8).fill(0));
  assert.ok(counts.slice(8).every(count => count > 0));
  assert.deepEqual(await query('button->mcu', 'rate', [{ op: 'COUNT' }], ctx(99)),
    await query('button->mcu', 'rate', [{ op: 'COUNT' }], ctx(DAY12)));
  assert.deepEqual(await query('button->mcu', 'rate', [{ op: 'COUNT' }], ctx(-8)),
    await query('button->mcu', 'rate', [{ op: 'COUNT' }], ctx(0)));

  const deployed = '2026-11-04T12:00:00Z';
  const rotated = { scenario: 'story', DEPLOYED_AT: deployed, now: Date.parse(deployed) + (12 + DAY10) * 60000 + 30000 };
  assert.deepEqual(await query('mcu->ingest', 'rate', [{ op: 'COUNT' }], rotated),
    await query('mcu->ingest', 'rate', [{ op: 'COUNT' }], ctx(DAY10)));
  const epoch = { scenario: 'story', now: Date.parse('2026-10-20T09:00:00Z') };
  assert.deepEqual(await query('button->mcu', 'rate', [{ op: 'COUNT' }], epoch),
    await query('button->mcu', 'rate', [{ op: 'COUNT' }], ctx(0)));

  for (const scenario of ['all-todo', 'all-done', 'unknown']) {
    assert.equal((await query('mcu->ingest', 'rate', [{ op: 'COUNT' }], ctx(DAY12, { scenario }))).info.rows_examined, 0);
  }
  const now = STORY_START + 12 * 24 * HOUR;
  const future = await query('mcu->ingest', 'rate', [{ op: 'COUNT' }], ctx(DAY12), {
    from: new Date(now + HOUR).toISOString(), to: new Date(now + 2 * HOUR).toISOString()
  });
  assert.equal(future.info.rows_examined, 0, 'a future-only window cannot borrow Day 13');
  const straddling = await query('mcu->ingest', 'rate', [{ op: 'COUNT' }], ctx(DAY12), { from: '-25h', to: new Date(now + HOUR).toISOString() });
  assert.equal(straddling.info.rows_examined, 25, 'future endpoint adds no bucket beyond the 25 requested story hours');
  assert.ok(straddling.series.every(point => Date.parse(point.data.time) < now));
});

test('H6: unsupported or ambiguous query shapes are explicit tool errors', async () => {
  const base = queryArgs('mcu->ingest', 'rate');
  const cases = [
    [{ ...base, dataset_slug: 'production' }, /dataset/],
    [{...base,query_spec:{...base.query_spec,from:'24h'}}, /signed duration/],
    [{ ...base, environment_slug: 'production' }, /environment/],
    [{ ...base, query_spec: { ...base.query_spec, calculations: [{ op: 'P95', column: 'flowview.value' }] } }, /unsupported calculation/],
    [{ ...base, query_spec: { ...base.query_spec, calculations: [{ op: 'AVG', column: 'duration_ms' }] } }, /flowview\.value/],
    [{ ...base, query_spec: { ...base.query_spec, filters: [{ column: 'flowview.carrier', op: '=', value: 'mcu->ingest' }] } }, /exactly/],
    [{ ...base, query_spec: { ...base.query_spec, filters: base.query_spec.filters.map((item, i) => i ? { ...item, op: '=~' } : item) } }, /only the = operator/],
    [{ ...base, query_spec: { ...base.query_spec, breakdowns: ['flowview.carrier'] } }, /breakdowns/],
    [{ ...base, query_spec: { ...base.query_spec, formula: 'A/B' } }, /unsupported field/],
    [{ ...base, query_spec: { ...base.query_spec, time_range: '24h' } }, /unsupported field/],
    [{ ...base, query_spec: { ...base.query_spec, from: '-13d' } }, /288 hours/],
    [queryArgs('mcu->ingest', 'unknown'), /unknown mock carrier signal/]
  ];
  for (const [args, pattern] of cases) assert.match(error(await call('run_query', args)), pattern);
  assert.match(error(await call('run_query', { ...base, start: '24h' })), /unknown argument start/);
  assert.match(error(await call('run_query', { environment_slug: 'flowview-demo', dataset_slug: 'doorbell' })), /query_spec/);
});

test('H7: changing one timeline carrier signal changes only its query response', async () => {
  const custom = structuredClone(timeline());
  custom.days[DAY12].telemetry.carriers['mcu->ingest'].rate.values = Array.from({ length: 24 }, (_, index) => 9000 + index);
  const targets = [
    ['mcu->ingest', 'rate'], ['mcu->ingest', 'errors'], ['ingest', 'rate'], ['notify->app', 'rate']
  ];
  for (const [carrier, signal] of targets) {
    const normal = await query(carrier, signal, [{ op: 'AVG', column: 'flowview.value' }], ctx(DAY12));
    const changed = await query(carrier, signal, [{ op: 'AVG', column: 'flowview.value' }], ctx(DAY12, { timeline: custom }));
    if (carrier === 'mcu->ingest' && signal === 'rate') {
      assert.notDeepEqual(changed, normal);
      assert.equal(changed.series.at(-1).data['AVG(flowview.value)'], 9023);
    } else {
      assert.deepEqual(changed, normal, `${carrier}.${signal} ignores another series`);
    }
  }
});

test('H8: get_trace returns only known shared-story traces in the exact bounded table shape', async () => {
  const story = await loadStory();
  const model = story.createStory();
  const healthy = story.traceFor(model, DAY10 * 24 + 14);
  const failing = story.traceFor(model, DAY10 * 24 + 23);
  assert.ok(healthy && failing);
  assert.equal(healthy.spans.some(span => span.service === 'notify'), true);
  assert.equal(failing.spans.some(span => span.status === 'error'), true);
  for (const trace of [healthy, failing, story.traceFor(model, DAY12 * 24 + 23)]) {
    const response = await call('get_trace', {
      environment_slug: 'flowview-demo', trace_id: trace.traceId, from: '-24h', view_mode: 'full'
    }, ctx(trace.hour < DAY12 * 24 ? DAY10 : DAY12));
    const text = response.result.content[0].text;
    assert.match(text, /^MOCK Honeycomb trace table/);
    assert.ok(!response.result.structuredContent, 'no invented raw trace envelope');
    const header = '| span_id | parent_id | start_unix_ns | duration_ns | kind | status_code | error | http_status | service | route | name |';
    assert.ok(text.includes(header));
    assert.doesNotMatch(text, /push/i, 'the story has no push exemplar span');
    const metadata = Object.fromEntries(text.split('Metadata:\n')[1].split('\n').map(line => { const [, key, value] = /^  ([a-z_]+): (.*)$/.exec(line); return [key, JSON.parse(value)]; }));
    assert.deepEqual(Object.keys(metadata).sort(), [
      'collapsed_nodes', 'mean_sample_rate', 'total_spans', 'trace_id', 'trace_link', 'view_mode', 'visible_spans'
    ]);
    assert.equal(metadata.trace_id, trace.traceId);
    assert.equal(metadata.trace_link, null);
    assert.equal(metadata.total_spans, trace.spans.length);
    for (const row of text.split('\n').filter(line => /^\| [0-9a-f]{16} \|/.test(line))) {
      const columns = row.split('|').slice(1, -1).map(item => item.trim());
      assert.match(columns[2], /^\d{19}$/);
      assert.match(columns[3], /^\d+$/);
    }
  }
  assert.match(error(await call('get_trace', {
    environment_slug: 'flowview-demo', trace_id: '0'.repeat(32), from: '-24h'
  })), /not found/);
  assert.match(error(await call('get_trace', {
    environment_slug: 'flowview-demo', trace_id: failing.traceId, from: '-24h', view_mode: 'focused'
  }, ctx(DAY10))), /focused mode is not served/);
  assert.match(error(await call('get_trace', {
    environment_slug: 'flowview-demo', trace_id: healthy.traceId, from: '-1h'
  }, ctx(DAY10))), /not found/, 'bounded from excludes an older known trace');
  assert.match(error(await call('get_trace', {
    environment_slug: 'flowview-demo', trace_id: failing.traceId, from: '-24h'
  }, ctx(DAY10, { scenario: 'all-done' }))), /not found/);
});

test('H9: Worker fetch covers health, CORS, JSON-RPC batches, notifications, errors and rate limiting', async () => {
  assert.equal(await (await fetchMock('/healthz')).text(), 'ok');
  const home = await (await fetchMock('/')).text();
  for (const phrase of ['Mock Honeycomb MCP', 'all-todo', 'all-done', 'day=0']) assert.ok(home.includes(phrase), phrase);
  assert.equal((await fetchMock('/mcp')).status, 405);
  assert.equal((await fetchMock('/other', post(rpc('initialize')))).status, 404);
  const preflight = await fetchMock('/mcp', { method: 'OPTIONS' });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), '*');
  for (const name of ['content-type', 'mcp-session-id', 'mcp-protocol-version']) {
    assert.ok(preflight.headers.get('access-control-allow-headers').toLowerCase().split(/,\s*/).includes(name));
  }
  const init = await fetchMock('/mcp', post(rpc('initialize')));
  assert.equal((await init.json()).result.serverInfo.name, 'mock-honeycomb-mcp');
  let notification = await fetchMock('/mcp', post({ jsonrpc: '2.0', method: 'tools/list' }));
  assert.equal(notification.status, 202);
  assert.equal(await notification.text(), '');
  notification = await fetchMock('/mcp', post([
    { jsonrpc: '2.0', method: 'initialize', params: {} },
    { jsonrpc: '2.0', method: 'tools/list' },
    { jsonrpc: '2.0', method: 'tools/call', params: { name: 'run_query', arguments: {} } }
  ]));
  assert.equal(notification.status, 202);
  assert.equal(await notification.text(), '', 'an all-notification batch has no response body');
  assert.equal((await (await fetchMock('/mcp', { method: 'POST', body: '{' })).json()).error.code, -32700);
  assert.equal((await (await fetchMock('/mcp', post([]))).json()).error.code, -32600);
  const batch = await (await fetchMock('/mcp?scenario=story&day=11', post([
    rpc('tools/list', undefined, 1), rpc('tools/call', { name: 'run_query', arguments: queryArgs('notify->app', 'rate') }, 2),
    { jsonrpc: '2.0', method: 'tools/list' }
  ]))).json();
  assert.equal(batch.length, 2);
  assert.deepEqual(batch.map(item => item.id), [1, 2], 'mixed-batch notifications are omitted');
  assert.equal(batch[1].result.structuredContent.info.rows_examined, 24);
  for (const invalidId of [true, false, {}, [], ['not-an-id']]) {
    const invalid = await fetchMock('/mcp', post(rpc('tools/list', undefined, invalidId)));
    assert.equal(invalid.status, 200);
    assert.deepEqual(await invalid.json(), {
      jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' }
    });
  }
  for (const name of ['constructor', '__proto__', 'toString']) {
    const inherited = await fetchMock('/mcp', post(rpc('tools/call', { name, arguments: {} })));
    assert.equal(inherited.status, 200, name);
    const payload = await inherited.json();
    assert.equal(payload.error.code, -32602, name);
    assert.equal(payload.id, 1, name);
  }

  const keys = [];
  const limited = { RL: { limit: async ({ key }) => { keys.push(key); return { success: false }; } } };
  const headers = { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.9' };
  let response = await fetchMock('/mcp', { ...post(rpc('tools/list')), headers }, limited);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '60');
  assert.equal((await response.json()).error.code, -32000);
  assert.deepEqual(keys, ['203.0.113.9']);
  response = await fetchMock('/mcp', post(rpc('tools/list')), limited);
  assert.equal(response.status, 429);
  assert.equal(keys.length, 2);
  for (const [pathname, request] of [['/', {}], ['/healthz', {}], ['/mcp', { method: 'OPTIONS' }]]) {
    assert.ok((await fetchMock(pathname, request, limited)).status < 300);
  }
  assert.equal(keys.length, 2, 'non-POST routes do not consume the limit');
  assert.equal((await fetchMock('/mcp', post(rpc('tools/list')), { RL: { limit: async () => ({ success: true }) } })).status, 200);
  assert.equal((await fetchMock('/mcp', post(rpc('tools/list')))).status, 200, 'binding is optional');
});

test('H10: docs state native/mock distinctions, query vocabulary, safe manual deployment and source limits', () => {
  const readme = read(DIR + '/README.md');
  for (const phrase of [
    'No live Honeycomb connector', 'no credentials', 'Honeycomb connection', 'shared 12-day',
    'npx -y wrangler@4 deploy -c deploy/cloudflare/mock-honeycomb-mcp/wrangler.jsonc',
    'https://<worker>.<subdomain>.workers.dev/mcp', 'Settings → Connectors → Add custom', 'No sign-in',
    'DEPLOYED_AT', '?scenario=story&day=', 'flowview-demo', 'doorbell', 'flowview.carrier', 'flowview.signal',
    'flowview.value', 'Missing is not zero', '`COUNT` is the number of hourly measurement rows',
    'AVG', 'SUM', 'MIN', 'MAX', 'COUNT', 'structuredContent', 'MOCK Honeycomb raw query result JSON',
    'signed, time-limited', 'does not fabricate one', 'get_query_results', 'fails closed',
    'span_id', 'parent_id', 'start_unix_ns', 'duration_ns', 'trace_link', 'null',
    'no invented', 'official `honeycombio/agent-skill`', 'public Honeycomb CI', 'not a live `tools/list`'
  ]) assert.ok(readme.includes(phrase), phrase);
  assert.match(read('deploy/cloudflare/README.md'), /mock-honeycomb-mcp\/README\.md/);
  assert.match(read('deploy/cloudflare/.gitignore'), /mock-honeycomb-mcp/);
  const identity = readme.replaceAll('mock-honeycomb-mcp', '$PLACEHOLDER');
  for (const pattern of [
    /[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev/i, /[a-z0-9-]+\.cloudflareaccess\.com/i,
    /\b[0-9a-f]{32}\b/i, /FLOWVIEW_CF_WORKER[ \t]*:?[=-][ \t]*["']?[A-Za-z0-9-]/,
    /\baccount_id\b\s*[:=]/i
  ]) assert.doesNotMatch(identity, pattern);
});

test('raw row wrapper returns only shared traceFor IDs and rejects unsupported sampling queries',async()=>{
 const args={environment_slug:'flowview-demo',dataset_slug:'doorbell',query_spec:{from:'-24h',filters:[{column:'service.name',op:'=',value:'event-ingest'}]},raw_row_columns:['trace.trace_id','error'],results_limit:5};
 const result=await call('run_query',args,ctx(DAY10));assert.ok(!result.result.isError);const text=result.result.content[0].text;
 const {createStory,traceFor}=await loadStory(),model=createStory();const ids=[...text.matchAll(/^\| [^|]+ \| ([0-9a-f]{32}) \|/gm)].map(m=>m[1]);assert.equal(ids.length,5);
 const known=Array.from({length:24},(_,i)=>traceFor(model,DAY10*24+i)).filter(Boolean).map(t=>t.traceId);assert.ok(ids.every(id=>known.includes(id)));assert.match(text,/next_cursor: MOCK_MORE_MATCHES/);
 for(const patch of [{raw_row_columns:['trace.trace_id','timestamp','error']},{results_limit:21},{raw_row_columns:['invented']},{query_spec:{...args.query_spec,raw_row_columns:args.raw_row_columns}},{query_spec:{...args.query_spec,filters:[{column:'service.name',op:'=',value:'invented'}]}},{query_spec:{...args.query_spec,calculations:[{op:'COUNT'}]}}])assert.ok(error(await call('run_query',{...args,...patch},ctx(DAY10))));
 const response=await call('get_trace',{environment_slug:args.environment_slug,trace_id:ids[0],from:'-24h',view_mode:'full'},ctx(DAY10));assert.ok(!response.result.isError);assert.match(response.result.content[0].text,new RegExp('trace_id: "'+ids[0]+'"'));
});
