// Doorbell telemetry from the shared timeline: pure functions, no network, filesystem,
// clock or Cloudflare APIs. Each story day's `telemetry` block in
// examples/live-status/live-status.timeline.json holds hourly values per carrier signal
// and that day's annotations; the #live=demo replay reads the same block, and the Jira
// and GitHub mocks read the same days, so all of them agree on "today".
import story from '../../../examples/live-status/live-status.timeline.json' with { type: 'json' };

export const HOUR = 3600000;
export const DAY = 24 * HOUR;
// Story day index i is the calendar day 2026-10-20 + i (label "Day i+1"); its "now"
// is the following midnight UTC, so a 24 h window on day i is exactly that day.
export const STORY_START = Date.parse('2026-10-20T00:00:00Z');
export const storyNow = index => STORY_START + (index + 1) * DAY;

// Every metric series the mock serves (a Prometheus metric with labels, or a Loki stream
// with a line phrase) and the timeline signals it reads, as `carrier.signal` with carriers
// keyed like the proof engine: a node id, or from->to for an edge. Most series read one
// signal. `terms` makes a series a signed sum of signals, so that every query a binding
// sends sums back to exactly that carrier's own timeline values:
//   route="/v1/events" code="200"  event edge rate - errors
//   route="other"      code="200"  (ingest rate - errors) - (event rate - errors)
//   route="other"      code="503"  ingest errors - event errors
// The event edge's queries match route="/v1/events" only and return the edge's signals;
// the ingest node's queries match every route and return the node's own signals. The
// first term decides presence: when it is null the series has no sample that hour.
// `quantile` marks a histogram served as its p95 in ms.
export const SERIES = [
  { id: 'press', metric: 'button_press_total', labels: { device: 'doorbell' }, carrier: 'button->mcu', signal: 'rate' },
  { id: 'ring', metric: 'chime_ring_total', labels: { device: 'doorbell' }, carrier: 'mcu->chime', signal: 'rate' },
  { id: 'event-ok', metric: 'http_server_requests_total', labels: { service: 'event-ingest', route: '/v1/events', code: '200' },
    terms: [[1, 'mcu->ingest', 'rate'], [-1, 'mcu->ingest', 'errors']] },
  { id: 'event-err', metric: 'http_server_requests_total', labels: { service: 'event-ingest', route: '/v1/events', code: '503' },
    carrier: 'mcu->ingest', signal: 'errors' },
  { id: 'ingest-other-ok', metric: 'http_server_requests_total', labels: { service: 'event-ingest', route: 'other', code: '200' },
    terms: [[1, 'ingest', 'rate'], [-1, 'ingest', 'errors'], [-1, 'mcu->ingest', 'rate'], [1, 'mcu->ingest', 'errors']] },
  { id: 'ingest-other-err', metric: 'http_server_requests_total', labels: { service: 'event-ingest', route: 'other', code: '503' },
    terms: [[1, 'ingest', 'errors'], [-1, 'mcu->ingest', 'errors']] },
  { id: 'event-p95', metric: 'http_server_request_duration_seconds_bucket', quantile: 0.95,
    labels: { service: 'event-ingest', route: '/v1/events' }, carrier: 'mcu->ingest', signal: 'p95' },
  { id: 'route-in', metric: 'kafka_server_brokertopicmetrics_messagesin_total', labels: { topic: 'device-events' },
    carrier: 'ingest->notify', signal: 'in' },
  { id: 'route-lag', metric: 'kafka_consumergroup_lag', labels: { topic: 'device-events', group: 'notify-consumers' },
    carrier: 'ingest->notify', signal: 'lag' },
  { id: 'route-age', metric: 'kafka_consumergroup_lag_seconds', labels: { topic: 'device-events', group: 'notify-consumers' },
    carrier: 'ingest->notify', signal: 'age' },
  { id: 'notify-consumed', stream: { app: 'notify', level: 'info' }, line: 'event consumed', carrier: 'notify', signal: 'rate' },
  { id: 'push-sent', stream: { app: 'notify', level: 'info' }, line: 'push sent', carrier: 'notify->app', signal: 'rate' },
  { id: 'push-failed', stream: { app: 'notify', level: 'error' }, line: 'push failed', carrier: 'notify->app', signal: 'errors' },
  { id: 'push-p95', metric: 'push_latency_seconds_bucket', quantile: 0.95, labels: { app: 'notify' }, carrier: 'notify->app', signal: 'p95' }
];
const BY_ID = Object.fromEntries(SERIES.map(series => [series.id, series]));

// Deterministic 32-bit hash: FNV-1a with the murmur3 finalizer, so near-identical seeds spread out.
export function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
const round = value => Math.round(value * 10) / 10;

// One read of a timeline per request. A value is the signal for the story hour
// (STORY_START + hour h, + 1 h]; null (or a day without a block) means no sample.
export function createStory(timeline = story) {
  const days = Array.isArray(timeline?.days) ? timeline.days : [];
  const blocks = days.map(day => {
    const block = day?.telemetry;
    const start = Date.parse(block?.start), step = Number(block?.stepSeconds) * 1000;
    return block && Number.isFinite(start) && step > 0 ? { start, step, carriers: block.carriers || {} } : null;
  });
  function sample(carrier, signal, hour) {
    const t = STORY_START + hour * HOUR, block = blocks[Math.floor(hour / 24)];
    if (!block || hour < 0) return null;
    const k = (t - block.start) / block.step, values = block.carriers[carrier]?.[signal]?.values;
    if (!Array.isArray(values) || !Number.isInteger(k) || k < 0 || k >= values.length) return null;
    const value = values[k];
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }
  function valueAt(id, hour) {
    const series = BY_ID[id];
    if (!series.terms) return sample(series.carrier, series.signal, hour);
    const [[, carrier, signal]] = series.terms;
    if (sample(carrier, signal, hour) === null) return null;
    return round(series.terms.reduce((sum, [sign, c, s]) => sum + sign * (sample(c, s, hour) ?? 0), 0));
  }
  const annotations = days.flatMap(day => Array.isArray(day?.telemetry?.annotations) ? day.telemetry.annotations : [])
    .map(a => ({ id: a.id, time: Date.parse(a.time), text: a.text, tags: Array.isArray(a.tags) ? a.tags : [] }))
    .filter(a => Number.isFinite(a.time) && typeof a.text === 'string');
  return { valueAt, sample, annotations, days };
}

// The story hour containing instant t (left-open hours), or null outside the story so far.
export function hourOf(t, horizon) {
  if (!Number.isFinite(t) || t <= STORY_START || t > horizon) return null;
  return Math.ceil((t - STORY_START) / HOUR) - 1;
}

// Lowercase hex ids derived from the hash, so trace and span ids are stable per story hour.
export function hexId(seed, length) {
  let out = '';
  for (let i = 0; out.length < length; i++) out += hash(seed + '#' + i).toString(16).padStart(8, '0');
  return out.slice(0, length);
}

// One exemplar trace per story hour in which events reach ingest, 17 minutes into the hour.
// While the hour's event error ratio is at most 1 % the exemplar reaches the notification
// consumer (after the queue age); above it the exemplar is a failing 503 that stops at
// ingest. No trace has a push span.
export function traceFor(world, hour) {
  if (world.valueAt('event-ok', hour) === null) return null;
  const hourStart = STORY_START + hour * HOUR, start = hourStart + 17 * 60000;
  const rate = world.sample('mcu->ingest', 'rate', hour), errors = world.sample('mcu->ingest', 'errors', hour) ?? 0;
  const failed = rate > 0 && errors / rate > 0.01;
  const root = { spanId: hexId('root:' + hour, 16), name: 'POST /v1/events', kind: 'server', startTimeMs: start,
    durationMs: world.valueAt('event-p95', hour) ?? 0, status: failed ? 'error' : 'ok',
    attributes: { 'http.request.method': 'POST', 'http.route': '/v1/events', 'http.response.status_code': failed ? 503 : 200 } };
  const services = [{ serviceName: 'event-ingest', resource: { 'service.name': 'event-ingest', 'service.version': '1.4.0' }, spans: [root] }];
  if (!failed && world.valueAt('route-in', hour) !== null) {
    const produce = { spanId: hexId('produce:' + hour, 16), parentSpanId: root.spanId, name: 'device-events publish', kind: 'producer',
      startTimeMs: start + 2, durationMs: 4, status: 'ok',
      attributes: { 'messaging.system': 'kafka', 'messaging.destination.name': 'device-events' } };
    services[0].spans.push(produce);
    if (world.valueAt('notify-consumed', hour) !== null) {
      const age = world.valueAt('route-age', hour) ?? 0;
      services.push({ serviceName: 'notify', resource: { 'service.name': 'notify', 'service.version': '2.0.0' }, spans: [{
        spanId: hexId('consume:' + hour, 16), parentSpanId: produce.spanId, name: 'device-events process', kind: 'consumer',
        startTimeMs: start + 6 + Math.round(age * 1000), durationMs: 12, status: 'ok',
        attributes: { 'messaging.system': 'kafka', 'messaging.destination.name': 'device-events', 'messaging.consumer.group.name': 'notify-consumers' } }] });
    }
  }
  const spans = services.flatMap(service => service.spans.map(span => ({ ...span, service: service.serviceName })));
  const end = Math.max(...spans.map(span => span.startTimeMs + span.durationMs));
  return { traceId: hexId('trace:' + hour, 32), hour, startTimeMs: start, durationMs: end - start, services, spans };
}
