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

/* ---- review cycle 1: every attachment kind, in every layout that shows it ---- */

// Layout-only fields: geometry, ports, sizes, colours and icons. They are the only
// authored leaves the text view leaves out. Keep this list equal to TEXT_VIEW_LAYOUT.
const LAYOUT_ONLY = ['fromPort', 'toPort', 'curveControls', 'curvePoints', 'coinOffsets', 'labelOffset', 'labelPosition',
  'x', 'y', 'w', 'h', 'width', 'height', 'position', 'color', 'tint', 'icon', 'textStyle'];
const IMPORT_LAYOUT_ONLY = ['position', 'nodePositions'];
const flatEscape = v => String(v).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
// Which flat key a leaf of each authored field lands on.
const FIELD_KEYS = {tickets: k => k === 'ticket', prs: k => k === 'pr', telemetry: k => /^(metric|telemetry)\./.test(k),
  binding: k => k.startsWith('binding.'), codeRefs: k => k.startsWith('code.'), deltaText: k => k === 'delta.text', deltaLinks: k => k === 'delta.link',
  edge: k => k === 'touches', edges: k => k === 'touches', nodes: k => k === 'touches', failures: k => k === 'failure',
  panels: k => k.startsWith('panel.'), patch: k => k.startsWith('panel.'), panelVisibility: k => k.startsWith('panelVisibility.'),
  traceMatch: k => k === 'trace', conditions: k => k === 'condition', tone: k => k.startsWith('tone.')};
const keyFor = field => FIELD_KEYS[field] || (k => k === field || k.startsWith(field + '.') || k.startsWith(field + '['));
function parseFlat(text){
  return lines(text).map(line => {
    const parts = line.split(' ');
    return parts[0] === 'page' ? {kind: 'page', owner: null, key: parts[1], value: parts.slice(2).join(' ')}
      : {kind: parts[0], owner: parts[1], key: parts[2], value: parts.slice(3).join(' ')};
  });
}
/* Every string, number and boolean leaf of the authored nodes, edges, steps, imports and tracking,
   with the flat owner and key it must appear under. */
function authoredLeaves(page, model){
  const out = [], skip = new Set(LAYOUT_ONLY.concat(IMPORT_LAYOUT_ONLY));
  const walk = (v, at, place) => {
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, at + '[' + i + ']', place));
    else if (v && typeof v === 'object') Object.keys(v).forEach(k => { if (!skip.has(k)) walk(v[k], at + '.' + k, place); });
    else if ((typeof v === 'string' && v) || typeof v === 'number' || typeof v === 'boolean') out.push(Object.assign({at, value: v}, place));
  };
  C.sectionRecords(page).forEach(r => {
    const d = r.section && r.section.diagram;
    if (!d) return;
    const prefix = model.multi ? r.reference + '/' : '';
    const diagram = model.sections.find(sec => sec.reference === r.reference).diagrams[0];
    Object.keys(d.nodes || {}).forEach(id => Object.keys(d.nodes[id]).forEach(field => {
      if (!skip.has(field)) walk(d.nodes[id][field], r.reference + '.nodes.' + id + '.' + field, {kind: 'node', owners: [prefix + id], key: keyFor(field)});
    }));
    (d.edges || []).forEach((e, i) => Object.keys(e).forEach(field => {
      const owner = prefix + e.from + '->' + e.to;
      if (field === 'from' || field === 'to') out.push({at: r.reference + '.edges[' + i + '].' + field, value: e[field], kind: 'edge', owners: [owner], key: () => true, inOwner: true});
      else if (!skip.has(field)) walk(e[field], r.reference + '.edges[' + i + '].' + field, {kind: 'edge', owners: [owner], key: keyFor(field)});
    }));
    (d.steps || []).forEach((st, i) => {
      const owners = diagram.paths.flatMap(p => p.steps.filter(x => x.id === st.id).map(x => prefix + p.id + '/' + x.n));
      Object.keys(st).forEach(field => { if (!skip.has(field)) walk(st[field], r.reference + '.steps[' + i + '].' + field, {kind: 'step', owners, key: keyFor(field)}); });
    });
    (d.topologyImports || []).forEach((imp, i) => Object.keys(imp).forEach(field => {
      const resolved = diagram.imports.find(x => x.as === imp.as).resolved;
      // A resolved import's overlays are checked on the carriers they resolve into.
      if (resolved && !['spec', 'export', 'as'].includes(field)) return;
      if (!skip.has(field)) walk(imp[field], r.reference + '.imports[' + i + '].' + field, {kind: 'section', owners: [r.reference],
        key: ['spec', 'export', 'as'].includes(field) ? (k => k === 'import') : (k => k.startsWith('import.' + imp.as + '.' + field))});
    }));
  });
  const tracking = page.tracking || {};
  Object.keys(tracking).forEach(field => {
    if (field === 'dependencies') walk(tracking.dependencies, 'tracking.dependencies', {kind: 'page', owners: [null], key: k => k === 'dependency'});
    else if (field === 'telemetry') Object.keys(tracking.telemetry).forEach(t => {
      if (t === 'lookups') Object.keys(tracking.telemetry.lookups).forEach(id => walk(tracking.telemetry.lookups[id], 'tracking.telemetry.lookups.' + id, {kind: 'page', owners: [null], key: k => k.startsWith('logsearch.' + id + '.')}));
      else walk(tracking.telemetry[t], 'tracking.telemetry.' + t, {kind: 'page', owners: [null], key: k => k.startsWith('tracking.telemetry.' + t)});
    });
    else walk(tracking[field], 'tracking.' + field, {kind: 'page', owners: [null], key: k => k.startsWith('tracking.' + field)});
  });
  return out;
}

test('every authored leaf reaches a flat line of its own owner and field', () => {
  assert.deepEqual(plain(C.TEXT_VIEW_LAYOUT), LAYOUT_ONLY, 'the module and this test share one layout-only list');
  for (const [name, page] of [['resolved', resolvedPage()], ['unresolved', C.normalize(read('board.json'))], ['provider', C.normalize(read('platform.json'))]]){
    const model = C.textViewModel(page), facts = parseFlat(C.textViewFlat(model)), leaves = authoredLeaves(page, model);
    assert.ok(leaves.length > (name === 'provider' ? 15 : 150), name + ' fixture is rich');
    const missing = leaves.filter(leaf => !facts.some(f => f.kind === leaf.kind && leaf.owners.includes(f.owner) && leaf.key(f.key) &&
      (leaf.inOwner ? f.owner.includes(String(leaf.value)) : (' ' + f.value + ' ').includes(flatEscape(leaf.value)))));
    assert.deepEqual(missing.map(l => l.at + ' = ' + l.value), [], name + ': authored data missing from its owner and field');
  }
});

test('each attachment kind appears in each layout that shows it', () => {
  const model = C.textViewModel(resolvedPage());
  const flat = C.textViewFlat(model), elements = C.textViewElements(model);
  const steps = {happy: C.textViewSteps(model, {queries: 'full'}), refused: C.textViewSteps(model, {queries: 'full', pathId: 'refused'})};
  const cases = [
    // [what, flat line, steps text (path, substring), elements substring]
    ['element code ref', 'node delivery/ingest code.ingest.accept.path src/ingest.js', ['happy', '  - code ingest.accept src/ingest.js:40-72 @222222222222 — Validates the device event.'],
      '- Code ingest.accept: https://github.com/fictional-home/doorbell-services · src/ingest.js · lines 40-72 · revision 2222222222222222222222222222222222222222'],
    ['code ref anchor', 'node delivery/ingest code.ingest.accept.anchor.start // flow:acceptEvent:start', null, 'anchor // flow:acceptEvent:start … // flow:acceptEvent:end'],
    ['imported code ref', 'node delivery/platform::api code.orders-api.create.lines 10-24', ['happy', '  - code orders-api.create src/orders-api.js:10-24'], '- Code orders-api.create:'],
    ['step code ref', 'step delivery/happy/2 code.ingest.route.path src/ingest.js', ['happy', '- code ingest.route src/ingest.js:80-96 @222222222222 — Routes the validated event.'], null],
    ['trace rule', 'step delivery/happy/2 trace event-ingest POST /v1/events · maxDurationMs 500 · nodeId ingest',
      ['happy', '- trace match: event-ingest POST /v1/events · maxDurationMs 500 · nodeId ingest'], '- Trace rule (step happy/2): event-ingest POST /v1/events'],
    ['trace alternatives', 'step delivery/happy/3 trace notify retry device-events · parentStepId publish', ['happy', '- trace match: notify retry device-events · parentStepId publish'], null],
    ['panel patch', 'step delivery/happy/2 panel.outcome {"state":"Pressed"}', ['happy', '- panel outcome: `{"state":"Pressed"}`'], null],
    ['binding', 'node delivery/ingest binding.entityRef component:default/event-ingest', ['happy', '  - binding component:default/event-ingest'],
      '- Binding: catalogUrl https://backstage.example.test/catalog/default/component/event-ingest · entityRef component:default/event-ingest'],
    ['element delta', 'node delivery/device delta.text Debounce moved to firmware.', ['happy', '  - delta Debounce moved to firmware.'], '- Delta (marked): Debounce moved to firmware.'],
    ['element delta flag', 'node delivery/device delta true', ['happy', '- node `device` Doorbell device · tickets FW-45 · changed'], null],
    ['element delta link', 'node delivery/device delta.link https://github.com/fictional-home/firmware/pull/12 Firmware change', null, '  - Firmware change: https://github.com/fictional-home/firmware/pull/12'],
    ['step delta', 'step delivery/happy/2 delta true', ['happy', '### 2. `publish` · +1m (2026-09-24 · 22:31) · changed'], null],
    ['step delta link', 'step delivery/happy/2 delta.link https://wiki.example.test/doorbell/publish-v2 Publish design', ['happy', '- delta link Publish design: https://wiki.example.test/doorbell/publish-v2'], null],
    ['step time', 'step delivery/happy/2 time +1m', ['happy', '· +1m (2026-09-24 · 22:31)'], null],
    ['story clock', 'step delivery/refused/2 at 2026-09-24 · 23:00', ['refused', '· 23:00 (2026-09-24 · 23:00)'], null],
    ['pull request', 'node delivery/ingest pr https://github.com/fictional-home/doorbell-services/pull/91', null, '- Pull requests: https://github.com/fictional-home/doorbell-services/pull/91'],
    ['ticket browse link', 'node delivery/ingest ticket BE-70 https://acme.atlassian.net/browse/BE-70', ['happy', 'tickets BE-67, BE-70'], 'BE-70 (https://acme.atlassian.net/browse/BE-70)'],
    ['edge ticket', 'edge delivery/ingest->notify ticket BE-69', ['happy', '- edge `ingest->notify` route · tickets BE-68, BE-69'], '| ingest->notify | edge | in, lag | 0 | BE-68, BE-69 |'],
    ['prometheus', 'node delivery/ingest metric.p95.query grafana histogram_quantile(0.95, sum by (le)(rate(http_server_request_duration_seconds_bucket{service="event-ingest"}[5m])))',
      ['happy', '- query: `histogram_quantile(0.95, sum by (le)(rate(http_server_request_duration_seconds_bucket{service="event-ingest"}[5m])))`'], '| p95 | grafana | s | max 0.5 |'],
    ['tempo', 'node delivery/ingest metric.traces.query tempo { resource.service.name = "event-ingest" && span.http.route = "/v1/events" && status = error }',
      ['happy', '- query: `{ resource.service.name = "event-ingest" && span.http.route = "/v1/events" && status = error }`'], '| traces | tempo | spans |  |'],
    ['signal label, role, window', 'node delivery/ingest metric.traces.window 1h', ['happy', 'metric traces (tempo) unit spans · label Error spans · role error · window 1h'], '- `traces` · label Error spans · role error · window 1h'],
    ['sql', 'node delivery/ingest metric.backlog.query sql select count(*) as n\\nfrom device_events\\nwhere status = \'pending\' and received_at > now() - interval \'1 hour\'',
      ['happy', 'metric backlog (sql) unit rows'], '| backlog | sql | rows |  |'],
    ['showOnCard', 'node delivery/ingest metric.backlog.showOnCard false', ['happy', 'metric backlog (sql) unit rows · showOnCard false'], '- `backlog` · showOnCard false'],
    ['honeycomb', 'node delivery/ingest metric.spans.query.filters[0].value event-ingest', ['happy', '- filters[0].value: `event-ingest`'], '- calculations[0].op: `COUNT`'],
    ['loki', 'node delivery/notify metric.consumed.query loki sum(count_over_time({app="notify",env="${env}"} |= "event consumed" [5m]))',
      ['happy', '- query: `sum(count_over_time({app="notify",env="${env}"} |= "event consumed" [5m]))`'], '| consumed | loki | events |  |'],
    ['missingMeansZero and query link', 'node delivery/notify metric.consumed.links.query https://grafana.example.test/explore?notify',
      ['happy', 'metric consumed (loki) unit events · missingMeansZero true · link query https://grafana.example.test/explore?notify'], '- `consumed` · missingMeansZero true · link query https://grafana.example.test/explore?notify'],
    ['cloudwatch logs', 'node delivery/iot metric.refused.query.breakdown.columns[0].label Latest reason', ['refused', '- breakdown.columns[0].label: `Latest reason`'], '- breakdown.columns[0].label: `Latest reason`'],
    ['cloudwatch metric', 'node delivery/queue metric.sent.query.namespace AWS/SQS', ['refused', '- namespace: `AWS/SQS`'], '- namespace: `AWS/SQS`'],
    ['telemetry link', 'node delivery/ingest telemetry.link.dashboard https://grafana.example.test/d/event-ingest', null, '- Telemetry link dashboard: https://grafana.example.test/d/event-ingest'],
    ['telemetry card', 'edge delivery/device->ingest telemetry.card.title Event intake', null, '- Card: side below · title Event intake'],
    ['template use', 'edge delivery/ingest->notify telemetry.use kafka-topic', null, '- Telemetry: queue · template kafka-topic'],
    ['existsWhen', 'node delivery/ingest existsWhen tickets-done', ['happy', 'tickets BE-67, BE-70 · exists when tickets-done'], '- Exists when: tickets-done'],
    ['imported edge existsWhen', 'edge delivery/platform::api->platform::store existsWhen tickets-done', ['happy', 'tickets PLAT-8 · exists when tickets-done'], null],
    ['missingWork', 'node delivery/notify missingWork true', ['happy', 'tickets BE-68 · missing work'], '- Missing work: yes'],
    ['node link', 'node delivery/device link https://github.com/fictional-home/firmware/blob/main/press.c#L3', ['happy', '  - link https://github.com/fictional-home/firmware/blob/main/press.c#L3'],
      '- Link: https://github.com/fictional-home/firmware/blob/main/press.c#L3'],
    ['step link', 'step delivery/happy/2 link https://wiki.example.test/doorbell/publish', ['happy', '- link https://wiki.example.test/doorbell/publish'], null],
    ['ticket filter', 'step delivery/happy/3 ticketFilter BE-69', ['happy', '- ticket filter: BE-69'], null],
    ['condition', 'step delivery/refused/2 condition service-error IoT authorization refused · nodeId iot', ['refused', '- condition: service-error IoT authorization refused · nodeId iot'], null],
    ['failure', 'step delivery/refused/2 failure iot->queue dropped', ['refused', '- failure `iot->queue` dropped'], null],
    ['other step field', 'step delivery/happy/2 lane FW', ['happy', '- lane: `FW`'], null],
    ['other node field', 'node delivery/device group hardware', null, '- group: `hardware`'],
    ['touches', 'step delivery/happy/4 touches node platform::store', ['happy', '- node `platform::store` Order store · imported (tv-platform core as platform)'], '- Steps: happy/4'],
    ['edges in and out', null, null, '- Edges in: `ingest->platform::api`'],
    ['dependency', 'page dependency BE-68 on BE-67 — needs the validated event contract', ['happy', '- dependency BE-68 on BE-67 — needs the validated event contract'], '- dependency BE-68 on BE-67 — needs the validated event contract'],
    ['jira settings', 'page tracking.jira.epic DOOR-100', ['happy', '- tracking.jira.epic: `DOOR-100`'], '- tracking.jira.site: `https://acme.atlassian.net`'],
    ['telemetry settings', 'page tracking.telemetry.refreshMs 300000', ['happy', '- tracking.telemetry.variables.region: `us-east-1`'], '- tracking.telemetry.honeycomb.dataset: `doorbell`'],
    ['environment profile override', 'page tracking.telemetry.environments.prd.grafana.prometheus prom-prd', ['happy', '- tracking.telemetry.environments.prd.grafana.prometheus: `prom-prd`'], null],
    ['template definition', 'page tracking.telemetry.templates.kafka-topic.params group', null, '- tracking.telemetry.templates.kafka-topic.params: `topic`'],
    ['log search', 'page logsearch.camera-model.value[1] DB-300', ['happy', '  - query: `{app="device-gateway",env="${env}"} |= "camera_model" | json | camera_model="$value"`'], '  - fields.traceId: trace_id'],
    ['page title', 'page title Doorbell delivery as text', ['happy', '# Doorbell delivery as text — steps'], '# Doorbell delivery as text — elements'],
    ['section heading', 'section delivery heading Press to notification', ['happy', '## Press to notification (section delivery)'], '## Press to notification (section delivery)'],
    ['path label', 'path delivery/happy label Connected', ['happy', 'Path: Connected (`happy`)'], null],
    ['log search fields', 'page logsearch.camera-model.fields.spanId span_id', ['happy', '  - fields.spanId: span_id'], '  - fields.spanId: span_id'],
    ['page settings heading', null, ['happy', '\n## Page settings\n\n- '], '\n## Page settings\n\n- '],
    ['section tab', 'section ops tab Ops', ['happy', '## On-call check (section ops, tab Ops)'], '## On-call check (section ops, tab Ops)'],
    ['path basedOn', 'path delivery/refused basedOn happy', ['refused', 'Path: Refused publish (`refused`) · based on `happy` · other paths: Connected (`happy`)'], null],
    ['panel visibility', 'step delivery/refused/2 panelVisibility.proof false', ['refused', '- panel proof visibility: `false`'], null],
    ['step tone', 'step delivery/refused/2 tone.iot alert', ['refused', '- tone `iot`: alert'], null],
    ['node presentation', 'node delivery/queue presentation baseline', ['refused', '- node `queue` Staging SQS · presentation baseline'], '- Presentation: baseline'],
    ['edge presentation', 'edge delivery/iot->queue presentation baseline', ['refused', '- edge `iot->queue` rule · tickets IOT-3 · presentation baseline'], null],
    ['log search entry', 'page logsearch.camera-model.label Camera model logs', ['happy', '- `camera-model` Camera model logs (loki-main) · values DB-200, DB-300'], '- `camera-model` Camera model logs (loki-main) · values DB-200, DB-300'],
    ['subtitle', 'node delivery/device sub Firmware', null, '- Subtitle: Firmware'],
    ['edge title and label', 'edge delivery/device->ingest title Event intake call', ['happy', '- edge `device->ingest` Event intake call'], '### edge `device->ingest` Event intake call\n\n- Label: event\n- Kind: https'],
    ['edges out', null, null, '- Edges out: `device->ingest`, `device->iot`'],
    ['import', 'section delivery import platform tv-platform core', ['happy', 'Imports: `platform` from tv-platform export core'], 'Imports: `platform` from tv-platform export core'],
  ];
  const all = lines(flat);
  for (const [what, line, step, sheet] of cases){
    if (line) assert.ok(all.includes(line), what + ' flat: ' + line);
    if (step) assert.ok(steps[step[0]].includes(step[1]), what + ' steps: ' + step[1]);
    if (sheet) assert.ok(elements.includes(sheet), what + ' elements: ' + sheet);
  }
});

test('markdown keeps a multi-line query exact in a fenced block', () => {
  const model = C.textViewModel(resolvedPage());
  const query = read('board.json').page.blocks[0].diagram.nodes.ingest.telemetry.signals.backlog.sql;
  for (const text of [C.textViewElements(model), C.textViewSteps(model, {queries: 'full'})]){
    const at = text.indexOf('select count(*) as n');
    assert.ok(at > 0);
    const block = text.slice(text.lastIndexOf('```', at), text.indexOf('```', at) + 3).split('\n');
    assert.deepEqual(block.slice(1, -1).map(line => line.trim()), query.split('\n'));
  }
  assert.ok(!C.textViewSteps(model).includes('from device_events'), 'names mode hides it');
});

test('an unresolved page lists its imports and overlays, and names step targets it does not hold', () => {
  const model = C.textViewModel(C.normalize(read('board.json')));
  const all = lines(C.textViewFlat(model));
  assert.ok(all.includes('section delivery import platform tv-platform core unresolved'));
  assert.ok(all.includes('section delivery import.platform.nodeTracking.api.tickets PLAT-7'));
  assert.ok(all.includes('section delivery import.platform.edgeOverrides.api->store.label Persist order'));
  assert.ok(all.includes('step delivery/happy/4 touches edge platform::api->platform::store (not in this diagram)'));
  assert.match(C.textViewSteps(model), /Imports: `platform` from tv-platform export core \(not resolved\)/);
  assert.match(C.textViewSteps(model), /- edge `platform::api->platform::store` \(not in this diagram\)/);
});

test('malformed entries are listed as problems and never print undefined', () => {
  const page = {title: 'Broken', sections: [{id: 'b', diagram: {nodes: {a: {title: 'A'}, n: null}, rows: [['a']],
    edges: [null, {from: 'a'}, {from: 'a', to: 'a', label: 'self'}], steps: [null, {text: 'ok', edge: 'a->a'}]}}]};
  const model = C.textViewModel(page);
  const outputs = [C.textViewFlat(model), C.textViewSteps(model, {queries: 'full'}), C.textViewElements(model)];
  for (const text of outputs) assert.ok(!text.includes('undefined'), text);
  const all = lines(outputs[0]);
  assert.ok(all.includes('section b problem edges[0]: expected an object with from and to null'), outputs[0]);
  assert.ok(all.includes('section b problem edges[1]: expected an object with from and to {"from":"a"}'));
  assert.ok(all.includes('section b problem nodes.n: expected an object null'));
  assert.ok(all.includes('section b problem steps[0]: expected an object null'));
  assert.ok(all.includes('edge a->a label self'));
  assert.ok(all.includes('step happy/1 touches edge a->a'));
});

test('a repeated from->to edge keeps its own attachments under a distinct owner', () => {
  const board = read('board.json'), d = board.page.blocks[0].diagram;
  d.edges.push({from: 'device', to: 'iot', label: 'retry publish', tickets: ['IOT-9']});
  const model = C.textViewModel(C.normalize(board)), all = lines(C.textViewFlat(model));
  assert.ok(all.includes('edge delivery/device->iot label publish'));
  assert.ok(all.includes('edge delivery/device->iot#2 label retry publish'));
  assert.ok(all.includes('edge delivery/device->iot#2 ticket IOT-9'));
  assert.ok(all.includes('step delivery/refused/2 touches edge device->iot#2'));
  assert.ok(all.includes('step delivery/refused/2 touches edge device->iot'));
  assert.match(C.textViewElements(model), /\| device->iot #2 \| edge \|/);
});

test('owner ids stay unambiguous when ids contain / or ->', () => {
  const page = {sections: [
    {id: 'a/b', diagram: {nodes: {'x->y': {title: 'Arrow id'}, z: {title: 'Z'}}, rows: [['x->y', 'z']], edges: [{from: 'x->y', to: 'z', label: 'go'}], steps: [{text: 'one', edge: 'x->y->z'}]}},
    {id: 'c', diagram: {nodes: {q: {title: 'Q'}}, rows: [['q']]}}]};
  const all = lines(C.textViewFlat(C.textViewModel(page)));
  assert.ok(all.includes('section a\\/b heading') || all.some(l => l.startsWith('node a\\/b/x->y ')), all.join('\n'));
  assert.ok(all.includes('node a\\/b/x->y title Arrow id'), all.join('\n'));
  assert.ok(all.includes('edge a\\/b/x-\\>y->z label go'));
});

test('flat keys of code references and trace rules survive an insertion before them', () => {
  const before = lines(C.textViewFlat(C.textViewModel(resolvedPage())));
  const board = read('board.json'), d = board.page.blocks[0].diagram, publish = d.steps.find(s => s.id === 'publish');
  publish.codeRefs.unshift(Object.assign({}, publish.codeRefs[0], {id: 'ingest.parse', label: 'parseEvent', startLine: 60, endLine: 70, anchor: {start: '// flow:parseEvent:start', end: '// flow:parseEvent:end'}, purpose: 'Parses the event.'}));
  publish.traceMatch = [{serviceName: 'gateway', operation: 'POST /v1/events'}, publish.traceMatch];
  const after = lines(C.textViewFlat(C.textViewModel(resolvedPage(board))));
  const removed = before.filter(line => !after.includes(line));
  assert.deepEqual(removed, [], 'existing facts keep their lines');
  assert.ok(after.includes('step delivery/happy/2 trace gateway POST /v1/events'));
  assert.ok(after.includes('step delivery/happy/2 code.ingest.parse.purpose Parses the event.'));
});

test('page settings are printed only when the spec sets them', () => {
  const all = lines(C.textViewFlat(C.textViewModel(C.normalize({sections: [{diagram: {nodes: {a: {title: 'A'}}, rows: [['a']]}}]}))));
  assert.ok(!all.some(line => line.startsWith('page ')), all.join('\n'));
});

test('markdown keeps its block shape: headings and tables stand apart, no doubled blank lines', () => {
  const model = C.textViewModel(resolvedPage());
  const empty = C.textViewModel({sections: [{id: 'a', diagram: {nodes: {n: {title: 'N'}}, rows: [['n']], edges: [null]}}, {id: 'b', diagram: {nodes: {}, rows: [[]]}}]});
  const texts = [C.textViewSteps(model), C.textViewSteps(model, {queries: 'full', pathId: 'refused'}), C.textViewElements(model), C.textViewSteps(empty), C.textViewElements(empty)];
  assert.ok(texts[3].includes('_No steps._') && texts[4].includes('_No elements._'));
  assert.ok(texts[3].includes('- problem: edges[0]: expected an object with from and to null\n\n'), 'a blank line follows the problems');
  for (const text of texts){
    const rows = text.split('\n');
    rows.forEach((row, i) => {
      if (/^#{1,3} /.test(row)){
        assert.equal(rows[i + 1], '', 'blank after: ' + row);
        if (i) assert.equal(rows[i - 1], '', 'blank before: ' + row);
      }
      if (row.startsWith('| ') && !(rows[i - 1] || '').startsWith('|')) assert.equal(rows[i - 1], '', 'blank before table: ' + row);
      if (row.startsWith('|') && rows[i + 1] !== undefined && !rows[i + 1].startsWith('|')) assert.equal(rows[i + 1], '', 'blank after table: ' + row);
      if (row === '' && i) assert.notEqual(rows[i - 1], '', 'doubled blank line at ' + i);
      if (row === '_No steps._' || row === '_No elements._' || /^(Path|Imports): /.test(row)) assert.equal(rows[i + 1], '', 'blank after: ' + row);
      if (/^\S/.test(row) && !/^(#|\||- |_|Path: |Imports: )/.test(row) && rows[i - 1] !== undefined) assert.ok(rows[i - 1] === '' || /^\S/.test(rows[i - 1]) && !/^(- |#|\|)/.test(rows[i - 1]), 'prose stands apart: ' + row);
    });
    assert.ok(text.endsWith('\n') && !text.endsWith('\n\n'), 'ends with one newline');
  }
});

test('wrong-typed known fields and skipped entries become problem lines', () => {
  const page = {sections: [{id: 's', diagram: {
    nodes: {a: {title: 'A', tickets: 'ABC-1', telemetry: 'x', binding: 'svc', delta: 'yes', codeRefs: [null]}, b: {title: 'B', tickets: ['ok', 'AB-2']}},
    rows: [['a', 'b']], edges: [{from: 'a', to: 'b', prs: 'nope'}],
    steps: [{id: 'one', text: 'One', time: 5, edges: [null, 'a->b'], ticketFilter: 'AB-2', traceMatch: [null]}]}}]};
  const model = C.textViewModel(page), all = lines(C.textViewFlat(model));
  for (const expected of [
    'node a problem tickets: expected an array "ABC-1"', 'node a problem telemetry: expected an object "x"', 'node a problem binding: expected an object "svc"',
    'node a problem delta: expected a boolean "yes"', 'node a problem codeRefs[0]: not shown null', 'node b problem tickets[0]: not a valid entry "ok"',
    'edge a->b problem prs: expected an array "nope"', 'step happy/1 problem time: expected a string 5', 'step happy/1 problem edges[0]: expected an id null',
    'step happy/1 problem ticketFilter: expected an array "AB-2"', 'step happy/1 problem traceMatch[0]: not shown null', 'step happy/1 touches edge a->b'])
    assert.ok(all.includes(expected), expected + '\n' + all.join('\n'));
  assert.ok(!all.some(line => line.includes('touches edge null')));
  assert.match(C.textViewElements(model), /- Problem: tickets: expected an array "ABC-1"/);
  assert.match(C.textViewSteps(model), /- problem: time: expected a string 5/);
  const arrays = lines(C.textViewFlat(C.textViewModel({sections: [{id: 's', diagram: {nodes: ['x'], rows: [[]]}}]})));
  assert.ok(arrays.includes('section s problem nodes: expected an object ["x"]'), arrays.join('\n'));
  const telemetry = lines(C.textViewFlat(C.textViewModel({sections: [{diagram: {nodes: {a: {telemetry: {kind: 'call', signals: {r: {grafana: ''}}}}}, rows: [['a']]}}]})));
  assert.ok(telemetry.some(line => line.startsWith('node a problem telemetry.signals.r: ')), telemetry.join('\n'));
});

test('repeated facts stay distinct lines and node ids escape like edge ends', () => {
  const page = {sections: [{diagram: {nodes: {'d\\ne': {title: 'Backslash', group: 'g', tags: ['x', 'x']}, 'd\ne': {title: 'Newline'}, 'tick`id': {title: 'Tick'}},
    rows: [['d\\ne', 'd\ne', 'tick`id']], edges: [{from: 'd\\ne', to: 'tick`id'}, {from: 'd\\ne', to: 'tick`id', label: 'again'}]}}]};
  const model = C.textViewModel(page), all = lines(C.textViewFlat(model));
  assert.ok(all.includes('node d\\\\ne title Backslash'), all.join('\n'));
  assert.ok(all.includes('node d\\ne title Newline'));
  assert.ok(all.includes('node d\\\\ne tags x') && all.includes('node d\\\\ne tags#2 x'), 'a repeated value is a second line');
  const once = lines(C.textViewFlat(C.textViewModel({sections: [{diagram: {nodes: {n: {tags: ['x']}}, rows: [['n']]}}]})));
  assert.ok(!once.some(line => line.includes('tags#2')));
  const elements = C.textViewElements(model);
  assert.ok(elements.includes('### node `` tick`id `` Tick'), elements);
  assert.ok(elements.includes('- Edges out: `` d\\ne->tick`id ``, `` d\\ne->tick`id #2 ``'), elements);
  assert.ok(elements.includes('- Edges in: `` d\\ne->tick`id ``, `` d\\ne->tick`id #2 ``'));
});

test('log searches and their suggested values keep authored order in the flat lines', () => {
  const before = lines(C.textViewFlat(C.textViewModel(resolvedPage())));
  assert.ok(before.includes('page logsearch.camera-model.order 1'));
  const board = read('board.json'), lookups = board.page.tracking.telemetry.lookups;
  lookups['camera-model'].values.reverse();
  const after = lines(C.textViewFlat(C.textViewModel(resolvedPage(board))));
  assert.deepEqual(before.filter(l => !after.includes(l)), ['page logsearch.camera-model.value[0] DB-200', 'page logsearch.camera-model.value[1] DB-300']);
  assert.deepEqual(after.filter(l => !before.includes(l)), ['page logsearch.camera-model.value[0] DB-300', 'page logsearch.camera-model.value[1] DB-200']);
  lookups.aaa = {label: 'First added', query: '{app="x"} |= "$value"'};
  const orders = lines(C.textViewFlat(C.textViewModel(resolvedPage(board)))).filter(l => / logsearch\.[^.]+\.order /.test(l));
  assert.deepEqual(orders, ['page logsearch.aaa.order 2', 'page logsearch.camera-model.order 1']);
  // Tickets stay a set: reordering them changes nothing.
  const tickets = read('board.json');tickets.page.blocks[0].diagram.nodes.ingest.tickets.reverse();
  assert.deepEqual(lines(C.textViewFlat(C.textViewModel(resolvedPage(tickets)))), before);
});
