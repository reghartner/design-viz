'use strict';
/* #1322: the text view of a step diagram (src/core/text-view.js). Pure model and
   three renderers over the resolved page: imported carriers included, templates
   expanded, ${variables} as written, flat lines sorted and stable. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {composeSources} = require('../tools/source-loader.cjs');

const FIXTURE = path.join(__dirname, 'fixtures/text-view');
const read = name => JSON.parse(fs.readFileSync(path.join(FIXTURE, name), 'utf8'));
const plain = value => JSON.parse(JSON.stringify(value));

function context(){
  const C = {URL, TextEncoder};
  vm.createContext(C);
  vm.runInContext(composeSources(['canon.js', 'validator.js', 'core/text-view.js']), C);
  return C;
}
const C = context();
// The reader's page: imports resolved against the provider, then normalized.
function resolvedPage(board = read('board.json')){
  return C.normalize(C.FlowTopology.materialize([board, read('platform.json')])[0]);
}
const lines = text => text.split('\n').filter(Boolean);
const delivery = model => model.sections.find(s => s.reference === 'delivery').diagrams[0];
const element = (model, kind, id) => delivery(model).elements.find(e => e.kind === kind && e.id === id);

test('the model lists every node and edge, imported ones with their origin and consumer overlays', () => {
  const model = plain(C.textViewModel(resolvedPage()));
  assert.deepEqual(model.sections.map(s => s.reference), ['delivery', 'ops']);
  const api = element(model, 'node', 'platform::api');
  assert.deepEqual(api.origin, {spec: 'tv-platform', export: 'core', as: 'platform'});
  assert.deepEqual(api.tickets, ['PLAT-5', 'PLAT-7'], 'provider ticket plus nodeTracking ticket');
  assert.deepEqual(api.signals.map(s => s.name).sort(), ['errors', 'rate'], 'extends overlay adds a signal');
  assert.deepEqual(api.signals.find(s => s.name === 'errors').pass, {max: 0.02, maxRatioOf: 'rate'});
  assert.deepEqual(api.codeRefs.map(r => r.id), ['orders-api.create'], 'nodeCodeRefs overlay');
  assert.equal(api.binding.entityRef, 'component:default/orders-api');
  const edge = element(model, 'edge', 'platform::api->platform::store');
  assert.deepEqual(edge.origin, {spec: 'tv-platform', export: 'core', as: 'platform'});
  assert.equal(edge.label, 'Persist order', 'edgeOverrides overlay');
  assert.deepEqual(edge.tickets, ['PLAT-8'], 'edgeTracking overlay');
  assert.deepEqual(edge.signals.map(s => s.name), ['writes']);
  assert.equal(element(model, 'node', 'ingest').origin, null);
  assert.deepEqual(element(model, 'node', 'ingest').tickets, ['BE-67', 'BE-70']);
  assert.deepEqual(element(model, 'node', 'ingest').edgesOut.sort(), ['ingest->notify', 'ingest->platform::api']);
  assert.deepEqual(element(model, 'node', 'platform::api').edgesIn, ['ingest->platform::api']);
});

test('telemetry templates appear expanded and ${variables} stay as written', () => {
  const model = plain(C.textViewModel(resolvedPage()));
  const notify = element(model, 'node', 'notify'), route = element(model, 'edge', 'ingest->notify');
  for (const carrier of [notify, route]){
    assert.equal(carrier.use, 'kafka-topic');
    const lag = carrier.signals.find(s => s.name === 'lag');
    assert.equal(lag.query, 'max(kafka_consumergroup_lag{topic="device-events",group="notify-consumers"}) or vector(0)');
    assert.deepEqual(lag.pass, {max: 500});
  }
  const sent = element(model, 'node', 'queue').signals[0];
  assert.equal(sent.source, 'cloudwatch');
  assert.equal(sent.query.dimensions.QueueName, 'camera_message_power_state_${env}');
  assert.equal(sent.query.accountId, '${queueAccount}');
  const refused = element(model, 'node', 'iot').signals[0];
  assert.equal(refused.source, 'cloudwatchLogs');
  assert.deepEqual(refused.query.logGroups, ['arn:aws:logs:us-east-1:${iotAccount}:log-group:AWSIotLogsV2']);
  assert.match(refused.query.breakdown.query, /by clientId \| sort n desc \| limit 20$/);
  assert.deepEqual(model.logSearches.map(s => s.id), ['camera-model']);
  assert.match(model.logSearches[0].query, /camera_model="\$value"$/);
});

test('paths list their steps with touches, trace rules, code references, panel changes, failures and time', () => {
  const model = plain(C.textViewModel(resolvedPage()));
  const paths = delivery(model).paths;
  assert.deepEqual(paths.map(p => [p.id, p.label, p.steps.map(s => s.id)]),
    [['happy', 'Connected', ['press', 'publish', 'route', 'persist']], ['refused', 'Refused publish', ['press', 'refused']]]);
  const publish = paths[0].steps[1];
  assert.equal(publish.n, 2);
  assert.equal(publish.time, '+1m');
  assert.deepEqual(publish.touches, [{kind: 'edge', id: 'device->ingest'}, {kind: 'node', id: 'device'}, {kind: 'node', id: 'ingest'}]);
  assert.deepEqual(publish.traceRules, [{serviceName: 'event-ingest', operation: 'POST /v1/events', maxDurationMs: 500, nodeId: 'ingest'}]);
  assert.deepEqual(publish.codeRefs.map(r => r.id), ['ingest.route']);
  assert.deepEqual(publish.panels, [{id: 'outcome', patch: {state: 'Pressed'}}]);
  assert.equal(paths[0].steps[2].traceRules.length, 2, 'alternatives are listed one by one');
  const refused = paths[1].steps[1];
  assert.deepEqual(refused.failures, [{edge: 'iot->queue', mode: 'dropped'}]);
  assert.ok(refused.touches.some(t => t.kind === 'edge' && t.id === 'iot->queue'), 'a failed hop is touched');
  assert.equal(refused.delta.marked, true);
  const persist = paths[0].steps[3];
  assert.deepEqual(persist.touches.filter(t => t.kind === 'edge').map(t => t.id), ['ingest->platform::api', 'platform::api->platform::store']);
  assert.deepEqual(element(model, 'node', 'platform::api').steps, ['happy/4']);
  assert.deepEqual(element(model, 'node', 'device').steps, ['happy/1', 'happy/2', 'refused/1', 'refused/2']);
});

test('flat lines are one fact per line, sorted, section-qualified and identical across runs and source order', () => {
  const page = resolvedPage(), text = C.textViewFlat(C.textViewModel(page));
  assert.equal(text, C.textViewFlat(C.textViewModel(resolvedPage())));
  const all = lines(text);
  assert.deepEqual(all, [...all].sort(), 'code-unit sorted');
  assert.equal(new Set(all).size, all.length, 'no duplicate facts');
  for (const line of all) assert.match(line, /^(?:page \S+ \S|(?:section|node|edge|path|step) \S+ \S+ \S)/);
  // Reordering the authored nodes and edges changes nothing.
  const board = read('board.json'), d = board.page.blocks[0].diagram;
  d.edges.reverse();
  d.nodes = Object.fromEntries(Object.entries(d.nodes).reverse());
  assert.equal(C.textViewFlat(C.textViewModel(resolvedPage(board))), text);
  const has = expected => assert.ok(all.includes(expected), 'missing: ' + expected + '\n' + text);
  has('node delivery/ingest metric.errors.query grafana sum(rate(http_server_requests_total{service="event-ingest",route="/v1/events",code=~"5.."}[5m]))*3600');
  has('node delivery/ingest metric.errors.pass max 0.01 ratio of rate');
  has('node delivery/platform::api origin imported tv-platform core as platform');
  has('edge delivery/platform::api->platform::store origin imported tv-platform core as platform');
  has('edge delivery/platform::api->platform::store ticket PLAT-8');
  has('node delivery/notify telemetry.use kafka-topic');
  has('node delivery/iot metric.refused.query.logGroups arn:aws:logs:us-east-1:${iotAccount}:log-group:AWSIotLogsV2');
  has('node delivery/queue metric.sent.query.dimensions.QueueName camera_message_power_state_${env}');
  has('step delivery/happy/2 touches node ingest');
  has('step delivery/happy/2 text Firmware publishes the press event.\\nIngest validates it.');
  has('step delivery/refused/2 failure iot->queue dropped');
  has('node ops/pager ticket OPS-1');
  has('page logsearch.camera-model.query loki-main {app="device-gateway",env="${env}"} |= "camera_model" | json | camera_model="$value"');
});

test('changing one query changes exactly one flat line', () => {
  const before = lines(C.textViewFlat(C.textViewModel(resolvedPage())));
  const board = read('board.json');
  board.page.blocks[0].diagram.nodes.ingest.telemetry.signals.errors.grafana =
    'sum(rate(http_server_requests_total{service="event-ingest",route="/v1/events",code=~"5.."}[10m]))*3600';
  const after = lines(C.textViewFlat(C.textViewModel(resolvedPage(board))));
  const removed = before.filter(line => !after.includes(line)), added = after.filter(line => !before.includes(line));
  assert.deepEqual(removed, ['node delivery/ingest metric.errors.query grafana sum(rate(http_server_requests_total{service="event-ingest",route="/v1/events",code=~"5.."}[5m]))*3600']);
  assert.deepEqual(added, ['node delivery/ingest metric.errors.query grafana sum(rate(http_server_requests_total{service="event-ingest",route="/v1/events",code=~"5.."}[10m]))*3600']);
});

test('a single-diagram page has no section prefixes', () => {
  const page = C.normalize(read('platform.json'));
  const all = lines(C.textViewFlat(C.textViewModel(page)));
  assert.ok(all.includes('node api ticket PLAT-5'), all.join('\n'));
  assert.ok(all.includes('edge api->store label Persist'));
  assert.ok(!all.some(line => / services\//.test(line)));
});

test('the Steps renderer shows names by default and full queries on request, per path', () => {
  const model = C.textViewModel(resolvedPage());
  const names = C.textViewSteps(model), full = C.textViewSteps(model, {queries: 'full'});
  assert.match(names, /errors \(grafana\) unit req\/h/);
  assert.ok(!names.includes('code=~"5.."'), 'names hides query text');
  assert.ok(full.includes('sum(rate(http_server_requests_total{service="event-ingest",route="/v1/events",code=~"5.."}[5m]))*3600'));
  // The IoT log signal sits on the refused path only.
  const refusedFull = C.textViewSteps(model, {queries: 'full', pathId: 'refused'});
  assert.ok(refusedFull.includes('arn:aws:logs:us-east-1:${iotAccount}:log-group:AWSIotLogsV2'), 'log signal fields in full');
  assert.ok(refusedFull.includes('by clientId | sort n desc | limit 20'), 'breakdown query in full');
  assert.ok(!C.textViewSteps(model, {pathId: 'refused'}).includes('AWSIotLogsV2'), 'names hides log fields');
  assert.match(names, /Press to notification/);
  assert.match(names, /On-call check/, 'every section appears');
  assert.match(names, /platform::api.*imported/);
  assert.match(names, /Log searches/);
  assert.ok(names.indexOf('Log searches') > names.lastIndexOf('step'), 'page log searches come last');
  const refused = C.textViewSteps(model, {pathId: 'refused'});
  assert.match(refused, /IoT refuses the publish/);
  assert.ok(!refused.includes('The order is stored.'), 'only the selected path');
  assert.match(refused, /iot->queue.*dropped/);
  assert.equal(C.textViewSteps(model), names, 'deterministic');
});

test('the Elements renderer has an index table and one sheet per element with every query once', () => {
  const model = C.textViewModel(resolvedPage());
  const text = C.textViewElements(model);
  assert.match(text, /\| Element \| Kind \|/);
  assert.match(text, /\| platform::api \| node · imported \|/);
  assert.match(text, /\| platform::api->platform::store \| edge · imported \|/);
  const query = 'sum(rate(http_server_requests_total{service="event-ingest",route="/v1/events",code=~"5.."}[5m]))*3600';
  assert.equal(text.split(query).length - 1, 1, 'each query written once');
  assert.ok(text.includes('arn:aws:logs:us-east-1:${iotAccount}:log-group:AWSIotLogsV2'));
  assert.ok(text.includes('Latest reason'), 'breakdown columns');
  assert.ok(text.includes('src/orders-api.js'), 'imported code reference');
  assert.match(text, /POST \/v1\/events/, 'trace rules on the element they point at');
  assert.equal(C.textViewElements(model), text);
});
