// Doorbell telemetry fixture: pure functions of the shared timeline, no network,
// filesystem, clock or Cloudflare APIs. Done times come from the timeline that the
// Jira and GitHub mocks serve, so all three mocks agree on "today". A later PR moves
// the per-day series into that timeline's `telemetry` block (#944 PR 2).
import story from '../../../examples/live-status/live-status.timeline.json' with { type: 'json' };

export const HOUR = 3600000;
export const DAY = 24 * HOUR;
// Story day index i is the calendar day 2026-10-20 + i (label "Day i+1"); its "now"
// is the following midnight UTC, so a 24 h window on day i is exactly that day.
export const STORY_START = Date.parse('2026-10-20T00:00:00Z');
export const storyNow = index => STORY_START + (index + 1) * DAY;
// Traffic on a carrier starts this long after its last ticket turns Done (merge 09:00, deploy 10:00, traffic 11:00).
export const TRAFFIC_DELAY = 2 * HOUR;
// Annotation 5 (firmware 2.4.1) degrades the event edge; the route queue lags across the Day 11 evening.
export const DEGRADE_AT = Date.parse('2026-10-29T16:00:00Z');
export const LAG_FROM = Date.parse('2026-10-30T18:00:00Z');
export const LAG_TO = Date.parse('2026-10-31T03:00:00Z');

// Carrier ids follow the provider map of the design memo: node:<id> and edge:<from>-><to>.
// Tickets must equal the carrier's tickets in examples/live-status/live-status.spec.json.
export const CARRIERS = {
  'edge:button->mcu': { label: 'press', tickets: ['HW-124'] },
  'edge:mcu->chime': { label: 'ring', tickets: ['HW-124'] },
  'edge:mcu->ingest': { label: 'event', tickets: ['FW-45'] },
  'edge:ingest->notify': { label: 'route', tickets: ['BE-67'] },
  'edge:notify->app': { label: 'push', tickets: ['BE-68', 'UX-89'] },
  'node:ingest': { label: 'Event ingest', tickets: ['BE-67'] },
  'node:notify': { label: 'Notification service', tickets: ['BE-68'] }
};

export const ANNOTATIONS = [
  { id: 1, time: Date.parse('2026-10-28T10:00:00Z'), text: 'doorbell hardware rev B fleet rollout', tags: ['deploy', 'hardware'] },
  { id: 2, time: Date.parse('2026-10-29T10:00:00Z'), text: 'firmware 2.4.0 rollout', tags: ['deploy', 'firmware'] },
  { id: 3, time: Date.parse('2026-10-29T10:00:00Z'), text: 'event-ingest 1.4.0', tags: ['deploy', 'backend'] },
  { id: 4, time: Date.parse('2026-10-29T10:05:00Z'), text: 'notify 2.0.0', tags: ['deploy', 'backend'] },
  { id: 5, time: DEGRADE_AT, text: 'firmware 2.4.1 rollout', tags: ['deploy', 'firmware'] },
  { id: 6, time: LAG_FROM, text: 'notify-consumers rebalance', tags: ['incident', 'kafka'] }
];

// Deterministic 32-bit hash: FNV-1a with the murmur3 finalizer, so near-identical seeds spread out.
export function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
// Deterministic jitter in [1 - spread, 1 + spread] per (series, hour).
const jitter = (id, hour, spread = 0.08) => 1 - spread + (hash(id + ':' + hour) / 0xffffffff) * 2 * spread;
// Fleet-wide presses peak at 16:00 UTC and bottom out at 04:00 UTC.
const diurnal = hourStart => 0.55 + 0.45 * Math.sin(2 * Math.PI * (new Date(hourStart).getUTCHours() - 10) / 24);
const round = (value, places = 1) => Math.round(value * 10 ** places) / 10 ** places;
const lagging = hourStart => hourStart >= LAG_FROM && hourStart < LAG_TO;
const errorRatio = (hourStart, hour) => hourStart >= DEGRADE_AT ? 0.042 * jitter('ratio', hour, 0.06) : 0.002;
const eventTotal = (of, hour) => of('press') === null ? null : of('press') * 0.97;

// Every fixture series: where it is served (Prometheus metric + labels, or a Loki stream +
// line phrase), the carriers whose Done gates it, the upstream series it needs, and its
// value for one story hour. `quantile` marks a histogram served as its p95 in ms.
export const SERIES = [
  { id: 'press', metric: 'button_press_total', labels: { device: 'doorbell' }, requires: ['edge:button->mcu'],
    value: (h, t) => round(1200 * diurnal(t) * jitter('press', h)) },
  { id: 'ring', metric: 'chime_ring_total', labels: { device: 'doorbell' }, requires: ['edge:mcu->chime'], after: 'press',
    value: (h, t, of) => round(of('press') * 0.99) },
  { id: 'event-ok', metric: 'http_server_requests_total', labels: { service: 'event-ingest', route: '/v1/events', code: '200' },
    requires: ['edge:mcu->ingest', 'node:ingest'], after: 'press',
    value: (h, t, of) => round(eventTotal(of, h) * (1 - errorRatio(t, h))) },
  { id: 'event-err', metric: 'http_server_requests_total', labels: { service: 'event-ingest', route: '/v1/events', code: '503' },
    requires: ['edge:mcu->ingest', 'node:ingest'], after: 'press',
    value: (h, t, of) => round(eventTotal(of, h) * errorRatio(t, h)) },
  { id: 'event-p95', metric: 'http_server_request_duration_seconds_bucket', quantile: 0.95,
    labels: { service: 'event-ingest', route: '/v1/events' }, requires: ['edge:mcu->ingest', 'node:ingest'], after: 'press',
    value: (h, t) => Math.round((t >= DEGRADE_AT ? 410 : 180) * jitter('p95', h, 0.06)) },
  { id: 'route-in', metric: 'kafka_server_brokertopicmetrics_messagesin_total', labels: { topic: 'device-events' },
    requires: ['edge:ingest->notify'], after: 'event-ok', value: (h, t, of) => of('event-ok') },
  { id: 'route-lag', metric: 'kafka_consumergroup_lag', labels: { topic: 'device-events', group: 'notify-consumers' },
    requires: ['edge:ingest->notify', 'node:notify'], after: 'route-in',
    value: (h, t) => Math.round(lagging(t) ? 600 + 1800 * Math.min(1, (t - LAG_FROM) / (3 * HOUR)) : 40 * jitter('lag', h, 0.25)) },
  { id: 'route-age', metric: 'kafka_consumergroup_lag_seconds', labels: { topic: 'device-events', group: 'notify-consumers' },
    requires: ['edge:ingest->notify', 'node:notify'], after: 'route-in',
    value: (h, t, of) => round(lagging(t) ? 30 + of('route-lag') / 10 : 3 * jitter('age', h, 0.25)) },
  { id: 'notify-consumed', stream: { app: 'notify', level: 'info' }, line: 'event consumed',
    requires: ['node:notify'], after: 'route-in', value: (h, t, of) => round(of('route-in') * (lagging(t) ? 0.6 : 1)) },
  // The push edge never carries traffic: Done in Jira, silent in production.
  { id: 'push-sent', stream: { app: 'notify', level: 'info' }, line: 'push sent', requires: ['edge:notify->app'], value: () => null },
  { id: 'push-failed', stream: { app: 'notify', level: 'error' }, line: 'push failed', requires: ['edge:notify->app'], value: () => null },
  { id: 'push-p95', metric: 'push_latency_seconds_bucket', quantile: 0.95, labels: { app: 'notify' },
    requires: ['edge:notify->app'], value: () => null }
];
const BY_ID = Object.fromEntries(SERIES.map(series => [series.id, series]));

const normalize = stamp => String(stamp).replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
// Done = the latest ticket stamp on the first day every ticket of the carrier is done.
export function doneAt(tickets, timeline = story) {
  for (const day of timeline.days) {
    const issues = day.issues || {};
    if (tickets.every(key => issues[key]?.state === 'done')) {
      const stamps = tickets.map(key => Date.parse(normalize(issues[key].updated)));
      return stamps.every(Number.isFinite) ? Math.max(...stamps) : null;
    }
  }
  return null;
}

// One evaluation context per request: memoized carrier starts and series values.
export function createStory(timeline = story) {
  const starts = new Map(), values = new Map();
  const carrierStart = id => {
    if (!starts.has(id)) {
      const done = doneAt(CARRIERS[id].tickets, timeline);
      starts.set(id, done === null ? null : done + TRAFFIC_DELAY);
    }
    return starts.get(id);
  };
  // Value of a series for global story hour `hour` = the interval (STORY_START + hour h, + 1 h].
  function valueAt(id, hour) {
    const key = id + '@' + hour;
    if (values.has(key)) return values.get(key);
    const series = BY_ID[id], hourStart = STORY_START + hour * HOUR;
    let value = null;
    const gates = series.requires.map(carrierStart);
    if (hour >= 0 && gates.every(start => start !== null && hourStart >= start) &&
        (!series.after || valueAt(series.after, hour) !== null)) {
      value = series.value(hour, hourStart, other => valueAt(other, hour));
    }
    values.set(key, value);
    return value;
  }
  return { valueAt, carrierStart, days: timeline.days };
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
// Before the firmware 2.4.1 deploy the exemplar reaches the notification consumer (after the
// queue age); afterwards it is a failing 503 that stops at ingest. No trace has a push span.
export function traceFor(world, hour) {
  if (world.valueAt('event-ok', hour) === null) return null;
  const hourStart = STORY_START + hour * HOUR, start = hourStart + 17 * 60000;
  const failed = hourStart >= DEGRADE_AT;
  const root = { spanId: hexId('root:' + hour, 16), name: 'POST /v1/events', kind: 'server', startTimeMs: start,
    durationMs: world.valueAt('event-p95', hour), status: failed ? 'error' : 'ok',
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
