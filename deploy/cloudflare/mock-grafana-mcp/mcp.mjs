// Pure JSON-RPC handler: no network, filesystem, clock or Cloudflare APIs.
// Tool names, parameter names and result shapes follow grafana/mcp-grafana's source
// (tools/*.go, read 2026-11-04), not a captured tools/list. The data is the doorbell
// story's fixture telemetry from ./story.mjs on the shared 12-day timeline.
import { HOUR, DAY, STORY_START, SERIES, ANNOTATIONS, createStory, storyNow, hourOf, traceFor, hash } from './story.mjs';

const EPOCH = Date.parse('2026-10-20T09:00:00Z');
const GRAFANA = 'https://acme.grafana.net';
const MAX_POINTS = 11000;
const DATASOURCES = [
  { id: 1, uid: 'prom-main', name: 'Prometheus (mock)', type: 'prometheus', isDefault: true },
  { id: 2, uid: 'loki-main', name: 'Loki (mock)', type: 'loki', isDefault: false },
  { id: 3, uid: 'tempo-main', name: 'Tempo (mock)', type: 'tempo', isDefault: false }
];
const str = description => ({ type: 'string', description });
const int = description => ({ type: 'integer', description });
const TIME = 'RFC3339 or relative to now (e.g. now, now-1h, now-2h45m); read on the story clock';
const TOOL_INPUTS = {
  list_datasources: { title: 'List datasources', required: [],
    properties: { type: str('Datasource type, e.g. prometheus, loki, tempo'), name: str('Case-insensitive substring of the name'),
      limit: int('Maximum datasources to return (default 50, max 100)'), offset: int('Datasources to skip') } },
  query_prometheus: { title: 'Query Prometheus', required: ['datasourceUid', 'expr', 'endTime'],
    properties: { datasourceUid: str('The UID of the datasource to query'), expr: str('The PromQL expression to query'),
      startTime: str('The start time, required for range queries; ' + TIME), endTime: str('The end time; ' + TIME),
      stepSeconds: int('Step size in seconds, required for range queries'),
      queryType: { type: 'string', enum: ['range', 'instant'], description: 'range (default) or instant' },
      projectName: str('Ignored by the mock (Cloud Monitoring only)') } },
  query_loki_logs: { title: 'Query Loki logs', required: ['datasourceUid', 'logql'],
    properties: { datasourceUid: str('The UID of the datasource to query'), logql: str('The LogQL query; metric queries return samples'),
      startRfc3339: str('Optional start; ' + TIME + ' (default now-1h)'), endRfc3339: str('Optional end; ' + TIME + ' (default now)'),
      limit: int('Maximum log lines (default 10, max 100)'),
      direction: { type: 'string', enum: ['forward', 'backward'], description: 'forward (oldest first) or backward (newest first, default)' },
      queryType: { type: 'string', enum: ['range', 'instant'], description: 'range (default) or instant' },
      stepSeconds: int('Resolution step for range metric queries'),
      format: { type: 'string', enum: ['full', 'compact'], description: 'Only full is served by the mock' } } },
  search_tempo_traces: { title: 'Search Tempo traces', required: ['datasourceUid', 'query'],
    properties: { datasourceUid: str('UID of the tempo datasource to query'), query: str('TraceQL query string'),
      start: str('Start time (RFC3339); default the past hour'), end: str('End time (RFC3339); default now'),
      limit: int('Maximum number of traces (default 20)'), spss: int('Maximum matching spans per span set (default 3)') } },
  get_tempo_trace: { title: 'Get Tempo trace', required: ['datasourceUid', 'trace_id'],
    properties: { datasourceUid: str('UID of the tempo datasource to query'), trace_id: str('Trace ID to retrieve'),
      start: str('Optional start of the search range (RFC3339), with end'), end: str('Optional end of the search range (RFC3339), with start'),
      focus_span_id: str('Optional 16-character hexadecimal span ID') } },
  get_annotations: { title: 'Get Annotations', required: [],
    properties: { from: int('Epoch ms start time'), to: int('Epoch ms end time'), limit: int('Max results, default 100'),
      alertUid: str('Filter by alert UID'), dashboardUid: str('Filter by dashboard UID'), panelId: int('Filter by panel ID'),
      userId: int('Filter by creator user ID'), type: str('annotation or alert'),
      tags: { type: 'array', items: { type: 'string' }, description: 'Filter by tags (all must match unless matchAny)' },
      matchAny: { type: 'boolean', description: 'Match any tag instead of all' } } },
  generate_deeplink: { title: 'Generate navigation deeplink', required: ['resourceType'],
    properties: { resourceType: str('dashboard, panel or explore'), dashboardUid: str('Dashboard UID'),
      provisioningPreview: { type: 'object', description: 'Not served by the mock' }, datasourceUid: str('Datasource UID (explore)'),
      panelId: int('Panel ID (panel)'), queries: { type: 'array', items: { type: 'object' }, description: 'Explore query objects' },
      queryParams: { type: 'object', description: 'Additional URL query parameters (dashboard and panel)' },
      timeRange: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' } }, description: 'Time range for the link' },
      shorten: { type: 'boolean', description: 'Accepted and ignored: the mock always returns the full URL' } } }
};

function dayIndex(env, days) {
  if (env.day !== undefined && env.day !== null && Number.isFinite(Number(env.day))) {
    return Math.max(0, Math.min(days.length - 1, Math.floor(Number(env.day))));
  }
  const deployed = Date.parse(env.DEPLOYED_AT);
  const elapsed = Math.floor(((env.now ?? EPOCH) - (Number.isFinite(deployed) ? deployed : EPOCH)) / 60000);
  // Positive modulo keeps future deployment epochs safe too.
  return ((elapsed % days.length) + days.length) % days.length;
}

// The request's view of the story: "now" is the selected day's midnight; nothing later exists.
function worldFor(env) {
  const model = createStory(env.timeline || undefined);
  const index = dayIndex(env, model.days);
  const now = storyNow(index);
  const silent = (env.scenario ?? 'story') !== 'story';
  return { now, silent, valueAt: model.valueAt,
    at(series, t) { const hour = hourOf(t, now); return silent || hour === null ? null : model.valueAt(series.id, hour); } };
}

const DURATION = /(\d+(?:\.\d+)?)(ns|us|µs|ms|s|m|h|d|w)/g;
const UNIT = { ns: 1e-6, us: 1e-3, 'µs': 1e-3, ms: 1, s: 1000, m: 60000, h: HOUR, d: DAY, w: 7 * DAY };
// RFC3339 instants are story times; now and now±duration resolve on the story clock.
export function parseTime(value, now) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  const relative = /^now(?:([+-])((?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+))?$/.exec(text);
  if (relative) {
    let total = 0;
    for (const [, amount, unit] of (relative[2] || '').matchAll(DURATION)) total += Number(amount) * UNIT[unit];
    return Math.round(relative[1] === '-' ? now - total : now + total);
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i.test(text)) return null;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : null;
}
const isoTime = ms => new Date(ms).toISOString().replace('.000Z', 'Z');
const integer = value => typeof value === 'string' && /^-?\d+$/.test(value) ? Number(value) : value;
const number = value => String(Math.round(value * 1000) / 1000);

// Label matchers of one selector body: name="v", name!="v", name=~"re", name!~"re".
function parseMatchers(body) {
  return [...body.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*(=~|!~|!=|=)\s*"((?:[^"\\]|\\.)*)"/g)]
    .map(([, name, op, value]) => ({ name, op, value: value.replace(/\\(.)/g, '$1') }));
}
function matchesLabels(labels, matchers) {
  return matchers.every(({ name, op, value }) => {
    const actual = labels[name] ?? '';
    if (op === '=') return actual === value;
    if (op === '!=') return actual !== value;
    let pattern;
    try { pattern = new RegExp('^(?:' + value + ')$'); } catch { return false; }
    return op === '=~' ? pattern.test(actual) : !pattern.test(actual);
  });
}
const KEYWORDS = new Set(['by', 'without', 'on', 'ignoring', 'group_left', 'group_right', 'bool', 'and', 'or', 'unless', 'offset', 'inf', 'nan']);
// Metric selectors of a PromQL expression; function names, keywords, groupings and ranges are skipped.
function promSelectors(expr) {
  const selectors = [];
  let text = expr.replace(/\b(?:by|without|on|ignoring|group_left|group_right)\s*\([^)]*\)/g, ' ');
  text = text.replace(/([A-Za-z_:][A-Za-z0-9_:]*)?\s*\{([^}]*)\}/g, (all, name, body) => {
    const matchers = parseMatchers(body);
    const named = matchers.find(m => m.name === '__name__' && m.op === '=');
    selectors.push({ metric: name || named?.value || null, matchers: matchers.filter(m => m.name !== '__name__') });
    return ' ';
  });
  text = text.replace(/\[[^\]]*\]/g, ' ').replace(/"(?:[^"\\]|\\.)*"/g, ' ');
  for (const [, name, call] of text.matchAll(/(?<![\w.])([A-Za-z_:][A-Za-z0-9_:]*)\s*(\()?/g)) {
    if (!call && !KEYWORDS.has(name.toLowerCase())) selectors.push({ metric: name, matchers: [] });
  }
  return selectors;
}
const outerAggregate = expr => /^\s*\(*\s*(sum|max|min|avg|count)\b/i.exec(expr)?.[1].toLowerCase() || null;
function combine(aggregate, values) {
  if (aggregate === 'max') return Math.max(...values);
  if (aggregate === 'min') return Math.min(...values);
  if (aggregate === 'count') return values.length;
  const total = values.reduce((sum, value) => sum + value, 0);
  return aggregate === 'avg' ? total / values.length : total;
}
// Recognize, do not evaluate: the selector picks fixture series; the outer aggregation combines them.
function promPlan(expr) {
  const selectors = promSelectors(expr);
  if (selectors.length !== 1) {
    return { series: [], warning: selectors.length ? 'mock-grafana-mcp recognizes one metric selector per expression; this one has ' + selectors.length : null };
  }
  const [{ metric, matchers }] = selectors;
  const quantile = /histogram_quantile\s*\(\s*([0-9.]+)/.exec(expr);
  if (quantile || /_bucket$/.test(metric || '')) {
    if (!quantile || Number(quantile[1]) !== 0.95) return { series: [], warning: 'mock-grafana-mcp serves histograms only as histogram_quantile(0.95, ...)' };
    return { series: SERIES.filter(s => s.quantile === 0.95 && s.metric === metric && matchesLabels(s.labels, matchers)).slice(0, 1), aggregate: 'max' };
  }
  const series = SERIES.filter(s => s.metric === metric && !s.quantile && matchesLabels(s.labels, matchers));
  const aggregate = outerAggregate(expr);
  const bare = new RegExp('^\\s*' + metric + '\\b').test(expr);
  return { series, aggregate, labels: s => bare ? { __name__: s.metric, ...s.labels } : { ...s.labels } };
}
function evaluate(plan, times, world) {
  if (plan.aggregate) {
    const points = [];
    for (const t of times) {
      const values = plan.series.map(s => world.at(s, t)).filter(value => value !== null);
      if (values.length) points.push([t, combine(plan.aggregate, values)]);
    }
    return points.length ? [{ labels: {}, points }] : [];
  }
  return plan.series.map(s => ({ labels: plan.labels(s), points: times.flatMap(t => {
    const value = world.at(s, t);
    return value === null ? [] : [[t, value]];
  }) })).filter(entry => entry.points.length);
}
function evaluationTimes(start, end, stepSeconds) {
  if (end < start) return 'end timestamp must not be before start time';
  const count = Math.floor((end - start) / (stepSeconds * 1000)) + 1;
  if (count > MAX_POINTS) return 'exceeded maximum resolution of 11,000 points per timeseries. Try decreasing the query resolution (?step=XX)';
  return Array.from({ length: count }, (_, k) => start + k * stepSeconds * 1000);
}
const HINTS = {
  summary: 'The query returned no data for the requested time range.',
  possibleCauses: ['The carrier is silent, not yet Done on the story timeline, or outside this story day.',
    'The expression names a metric, stream or label the mock does not recognize (see the mock README).'],
  suggestedActions: ['Check the expression against the recognized names in deploy/cloudflare/mock-grafana-mcp/README.md.']
};

function datasourceProblem(uid, type) {
  const ds = DATASOURCES.find(entry => entry.uid === uid);
  if (!ds) return 'datasource ' + JSON.stringify(uid) + ' not found';
  return ds.type === type ? null : 'datasource ' + uid + ' is a ' + ds.type + ' datasource, not ' + type;
}

// Go's url.Values.Encode: keys sorted, QueryEscape spelling (space as +).
const queryEscape = value => encodeURIComponent(value).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase()).replace(/%20/g, '+');
const encode = params => Object.keys(params).sort().map(key => queryEscape(key) + '=' + queryEscape(params[key])).join('&');
// Go's json.Marshal of maps sorts keys.
const sorted = value => Array.isArray(value) ? value.map(sorted)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])])) : value;
function grafanaTime(value) {
  value = String(value);
  if (/^-?\d+$/.test(value) || value.startsWith('now')) return value;
  const parsed = parseTime(value, 0);
  return parsed === null ? value : String(parsed);
}
function deeplink(args) {
  const type = String(args.resourceType).toLowerCase();
  let link;
  if (type === 'dashboard' || type === 'panel') {
    if (args.provisioningPreview) return { error: 'provisioningPreview is not served by mock-grafana-mcp' };
    if (!args.dashboardUid) return { error: 'either dashboardUid or provisioningPreview must be set' };
    link = GRAFANA + '/d/' + args.dashboardUid;
    if (type === 'panel') {
      if (args.panelId === undefined || args.panelId === null) return { error: 'panelId is required for panel links' };
      link += '?viewPanel=' + integer(args.panelId);
    }
  } else if (type === 'explore') {
    if (!args.datasourceUid) return { error: 'datasourceUid is required for explore links' };
    const pane = { datasource: args.datasourceUid };
    if ((args.queries || []).some(query => !query || typeof query !== 'object' || Array.isArray(query))) {
      return { error: 'invalid arguments: queries must be an array of objects' };
    }
    if (Array.isArray(args.queries) && args.queries.length) {
      pane.queries = args.queries.map(query => ({ ...query,
        ...(query.datasource === undefined || query.datasource === null || query.datasource === '' ? { datasource: { uid: args.datasourceUid } } : {}) }));
    }
    if (args.timeRange) pane.range = Object.fromEntries(['from', 'to'].filter(key => args.timeRange[key]).map(key => [key, grafanaTime(args.timeRange[key])]));
    return { url: GRAFANA + '/explore?' + encode({ panes: JSON.stringify(sorted({ a: pane })), schemaVersion: '1' }) };
  } else {
    return { error: 'unsupported resource type: ' + args.resourceType + '. Supported types are: dashboard, panel, explore' };
  }
  const extra = {};
  for (const key of ['from', 'to']) if (args.timeRange?.[key]) extra[key] = grafanaTime(args.timeRange[key]);
  for (const [key, value] of Object.entries(args.queryParams || {})) extra[key] = String(value);
  if (Object.keys(extra).length) link += (link.includes('?') ? '&' : '?') + encode(extra);
  return { url: link };
}

function queryPrometheus(args, world) {
  const queryType = args.queryType || 'range';
  if (queryType !== 'range' && queryType !== 'instant') return { error: "invalid queryType: use 'range' or 'instant'" };
  const end = parseTime(args.endTime, world.now);
  if (end === null) return { error: 'invalid endTime ' + JSON.stringify(args.endTime) + ': use ' + TIME };
  let times;
  if (queryType === 'instant') {
    times = [end];
  } else {
    const step = integer(args.stepSeconds);
    if (!step || step <= 0) return { error: "stepSeconds must be provided when queryType is 'range'" };
    if (!args.startTime) return { error: "startTime must be provided when queryType is 'range'" };
    const start = parseTime(args.startTime, world.now);
    if (start === null) return { error: 'invalid startTime ' + JSON.stringify(args.startTime) + ': use ' + TIME };
    times = evaluationTimes(start, end, step);
    if (typeof times === 'string') return { error: times };
  }
  const plan = promPlan(args.expr);
  const data = evaluate(plan, times, world).map(({ labels, points }) => queryType === 'instant'
    ? { metric: labels, value: [points[0][0] / 1000, number(points[0][1])] }
    : { metric: labels, values: points.map(([t, v]) => [t / 1000, number(v)]) });
  const query = { refId: 'A', expr: args.expr, ...(queryType === 'instant' ? { instant: true } : { range: true, interval: integer(args.stepSeconds) + 's' }) };
  const explore = deeplink({ resourceType: 'explore', datasourceUid: args.datasourceUid, queries: [query],
    timeRange: { from: args.startTime || 'now-1h', to: args.endTime } });
  return { value: { data, ...(data.length ? {} : { hints: HINTS }), ...(plan.warning ? { warnings: [plan.warning] } : {}), exploreUrl: explore.url }, structured: true };
}

const LOKI_METRIC = /\b(?:rate|rate_counter|count_over_time|bytes_rate|bytes_over_time|sum_over_time|avg_over_time|max_over_time|min_over_time|first_over_time|last_over_time|stddev_over_time|stdvar_over_time|quantile_over_time|absent_over_time)\s*\(/;
function parseLogql(logql) {
  const open = logql.indexOf('{'), close = logql.indexOf('}', open + 1);
  if (open < 0 || close < 0) return null;
  const matchers = parseMatchers(logql.slice(open + 1, close));
  const selective = m => {
    if (m.op === '=') return m.value !== '';
    if (m.op !== '=~') return false;
    try { return !new RegExp('^(?:' + m.value + ')$').test(''); } catch { return false; }
  };
  if (!matchers.some(selective)) return null;
  const filters = [...logql.slice(close + 1).matchAll(/(\|=|!=|\|~|!~)\s*"((?:[^"\\]|\\.)*)"/g)]
    .map(([, op, value]) => ({ op, value: value.replace(/\\(.)/g, '$1') }));
  const series = SERIES.filter(s => s.stream && matchesLabels(s.stream, matchers) && filters.every(({ op, value }) => {
    const text = s.line + ' ' + lineDetail(s);
    if (op === '|=') return text.includes(value);
    if (op === '!=') return !text.includes(value);
    let pattern;
    try { pattern = new RegExp(value); } catch { return false; }
    return op === '|~' ? pattern.test(text) : !pattern.test(text);
  }));
  return { series, metric: LOKI_METRIC.test(logql.slice(0, open)), aggregate: outerAggregate(logql) ? 'sum' : null };
}
const lineDetail = series => series.id === 'notify-consumed' ? 'topic=device-events group=notify-consumers' : 'channel=apns';
// Log lines of the matched series inside [start, end], spread evenly through each story hour.
function logLines(plan, start, end, limit, direction, world) {
  const lines = [];
  const last = hourOf(Math.min(end, world.now), world.now), first = Math.max(0, Math.ceil((start - STORY_START) / HOUR) - 1);
  if (last === null || world.silent) return lines;
  for (let k = 0; k <= last - first && lines.length <= limit; k++) {
    const hour = direction === 'forward' ? first + k : last - k;
    const hourLines = [];
    for (const series of plan.series) {
      const count = Math.round(world.valueAt(series.id, hour) ?? 0);
      for (let n = 0; n < count; n++) {
        const t = STORY_START + hour * HOUR + Math.floor((n + 0.5) * HOUR / count);
        if (t < start || t > end) continue;
        const device = 'db-' + (1000 + hash(series.id + ':' + hour + ':' + n) % 9000);
        hourLines.push({ t, entry: { timestamp: (BigInt(t) * 1000000n).toString(),
          line: series.line + ' ' + lineDetail(series) + ' device=' + device + ' offset=' + (hour * 10000 + n), labels: { ...series.stream } } });
      }
    }
    hourLines.sort((a, b) => direction === 'forward' ? a.t - b.t : b.t - a.t);
    for (const { entry } of hourLines) { if (lines.length > limit) break; lines.push(entry); }
  }
  return lines;
}
function queryLoki(args, world) {
  if (args.format === 'compact') return { error: "format 'compact' is not served by mock-grafana-mcp; omit format or use 'full'" };
  const queryType = args.queryType || 'range';
  if (queryType !== 'range' && queryType !== 'instant') return { error: "invalid queryType: use 'range' or 'instant'" };
  const plan = parseLogql(args.logql);
  if (!plan) return { error: 'parse error: queries require a stream selector with at least one non-empty equality or regexp matcher' };
  const end = args.endRfc3339 ? parseTime(args.endRfc3339, world.now) : world.now;
  const start = args.startRfc3339 ? parseTime(args.startRfc3339, world.now) : end - HOUR;
  if (end === null || start === null) return { error: 'invalid time: use ' + TIME };
  const requested = integer(args.limit);
  const limit = !requested || requested <= 0 ? 10 : Math.min(100, requested);
  let data, truncated = false;
  if (plan.metric) {
    const range = (end - start) / 1000;
    const step = integer(args.stepSeconds) > 0 ? integer(args.stepSeconds) : Math.max(1, Math.ceil(range / 250));
    const times = queryType === 'instant' ? [end] : evaluationTimes(start, end, step);
    if (typeof times === 'string') return { error: times };
    data = evaluate({ ...plan, labels: s => ({ ...s.stream }) }, times, world).map(({ labels, points }) => queryType === 'instant'
      ? { timestamp: (points.at(-1)[0] / 1000).toFixed(3), value: points.at(-1)[1], labels }
      : { values: points.map(([t, v]) => ({ timestamp: (t / 1000).toFixed(3), value: v })), labels });
  } else {
    data = logLines(plan, start, end, limit, args.direction === 'forward' ? 'forward' : 'backward', world);
    truncated = data.length > limit;
    data = data.slice(0, limit);
  }
  const defaulted = queryType !== 'instant' && !args.startRfc3339 && !args.endRfc3339;
  const hints = !data.length ? HINTS : defaulted ? { summary: 'This query used the default 1-hour lookback window because startRfc3339 and endRfc3339 were not provided.',
    possibleCauses: [], suggestedActions: ['If results seem incomplete or you need data from a wider time range, provide explicit startRfc3339 and endRfc3339 parameters.'] } : null;
  return { value: { data, ...(hints ? { hints } : {}), metadata: { linesReturned: data.length, maxLinesAllowed: limit, resultsTruncated: truncated,
    totalLinesScanned: null, startTime: isoTime(start), endTime: isoTime(end) } } };
}

const TRACE_METRICS = /\|\s*(?:rate|count_over_time|quantile_over_time|histogram_over_time|avg_over_time|min_over_time|max_over_time|sum_over_time)\s*\(/;
const MS = { ns: 1e-6, us: 1e-3, 'µs': 1e-3, ms: 1, s: 1000, m: 60000, h: HOUR };
// TraceQL conditions the mock understands, applied to one span: service, span name, status, duration.
function parseTraceql(query) {
  const service = /(?:resource)?\.service\.name\s*=\s*"([^"]*)"|(?<![\w.])service\.name\s*=\s*"([^"]*)"/.exec(query);
  const name = /(?:^|[^.\w:])(?:span:)?name\s*=\s*"([^"]*)"/.exec(query);
  const status = /(?:span:)?status\s*(=|!=)\s*(error|ok|unset)\b/.exec(query);
  const duration = /(?:span:)?duration\s*(>=|>|<=|<)\s*(\d+(?:\.\d+)?)(ns|us|µs|ms|s|m|h)\b/.exec(query);
  return span => (!service || span.service === (service[1] ?? service[2])) && (!name || span.name === name[1]) &&
    (!status || (status[1] === '=') === (span.status === status[2])) &&
    (!duration || ({ '>': (a, b) => a > b, '>=': (a, b) => a >= b, '<': (a, b) => a < b, '<=': (a, b) => a <= b })[duration[1]](span.durationMs, Number(duration[2]) * MS[duration[3]]));
}
function searchTraces(args, world) {
  if (TRACE_METRICS.test(args.query)) return { error: "no trace search results: TraceQL metrics queries such as '{ } | rate()' return time series, not traces; run them as metrics queries instead" };
  const end = args.end ? parseTime(args.end, world.now) : world.now;
  const start = args.start ? parseTime(args.start, world.now) : end - HOUR;
  if (end === null || start === null) return { error: 'invalid time: use RFC3339' };
  if (start >= end) return { error: 'start must be before end' };
  const limit = integer(args.limit) > 0 ? integer(args.limit) : 20, spss = integer(args.spss) > 0 ? integer(args.spss) : 3;
  const matches = parseTraceql(args.query), traces = [];
  const last = hourOf(Math.min(end, world.now), world.now);
  for (let hour = last ?? -1; hour >= 0 && traces.length < limit && !world.silent; hour--) {
    if (STORY_START + (hour + 1) * HOUR < start) break;
    const trace = traceFor(world, hour);
    if (!trace || trace.startTimeMs < start || trace.startTimeMs > end) continue;
    const spans = trace.spans.filter(matches);
    if (!spans.length) continue;
    traces.push({ traceID: trace.traceId, rootServiceName: trace.spans[0].service, rootTraceName: trace.spans[0].name,
      startTimeMs: trace.startTimeMs, durationMs: trace.durationMs,
      spanSets: [{ spans: spans.slice(0, spss).map(span => ({ spanID: span.spanId, name: span.name, startTimeMs: span.startTimeMs,
        durationMs: span.durationMs, attributes: { 'resource.service.name': span.service } })) }] });
  }
  return { value: { traces } };
}
function getTrace(args, world) {
  if (args.focus_span_id !== undefined && !/^[0-9a-f]{16}$/i.test(args.focus_span_id)) return { error: 'focus_span_id must be 16 hexadecimal characters' };
  if (Boolean(args.start) !== Boolean(args.end)) return { error: 'start and end must be provided together' };
  const start = args.start ? parseTime(args.start, world.now) : -Infinity, end = args.end ? parseTime(args.end, world.now) : Infinity;
  if (start === null || end === null) return { error: 'invalid time: use RFC3339' };
  const id = String(args.trace_id).toLowerCase();
  const last = world.silent ? null : hourOf(world.now, world.now);
  for (let hour = last ?? -1; hour >= 0; hour--) {
    const trace = traceFor(world, hour);
    if (trace?.traceId === id && trace.startTimeMs >= start && trace.startTimeMs <= end) {
      return { value: { traceId: trace.traceId, services: trace.services } };
    }
  }
  return { error: 'trace ' + args.trace_id + ' not found' };
}

function getAnnotations(args, world) {
  if (world.silent || args.dashboardUid || args.panelId != null || args.alertUid || args.userId != null || args.type === 'alert') {
    return { value: { Payload: [] } };
  }
  const from = args.from == null ? -Infinity : Number(integer(args.from)), to = args.to == null ? Infinity : Number(integer(args.to));
  const tags = Array.isArray(args.tags) ? args.tags : [];
  const limit = integer(args.limit) > 0 ? integer(args.limit) : 100;
  const payload = ANNOTATIONS.filter(a => a.time <= world.now && a.time >= from && a.time <= to &&
    (!tags.length || (args.matchAny ? tags.some(tag => a.tags.includes(tag)) : tags.every(tag => a.tags.includes(tag)))))
    .sort((a, b) => b.time - a.time || b.id - a.id).slice(0, limit)
    .map(a => ({ created: a.time, id: a.id, login: 'deploy-bot', tags: [...a.tags], text: a.text, time: a.time, timeEnd: a.time, updated: a.time }));
  return { value: { Payload: payload } };
}

function listDatasources(args) {
  const type = typeof args.type === 'string' ? args.type.toLowerCase() : '';
  const name = typeof args.name === 'string' ? args.name.toLowerCase() : '';
  const matches = DATASOURCES.filter(ds => (!type || ds.type === type) && (!name || ds.name.toLowerCase().includes(name)));
  const limit = Math.min(100, integer(args.limit) > 0 ? integer(args.limit) : 50), offset = Math.max(0, integer(args.offset) || 0);
  const page = matches.slice(offset, offset + limit);
  return { value: { datasources: page.map(ds => ({ ...ds })), total: matches.length, hasMore: offset + page.length < matches.length } };
}

// Unknown or mistyped arguments are tool errors, as on the real server.
function argumentProblem(name, args) {
  const { properties, required } = TOOL_INPUTS[name];
  const unknown = Object.keys(args).filter(key => !Object.hasOwn(properties, key));
  if (unknown.length) return 'unknown arguments: ' + unknown.join(', ') + '. Valid arguments: ' + Object.keys(properties).join(', ');
  for (const key of required) if (args[key] === undefined || args[key] === null || args[key] === '') return 'invalid arguments: ' + key + ' is required';
  for (const [key, value] of Object.entries(args)) {
    if (value === undefined || value === null) continue;
    const type = properties[key].type;
    const fits = type === 'string' ? typeof value === 'string'
      : type === 'integer' ? Number.isInteger(integer(value))
      : type === 'boolean' ? typeof value === 'boolean'
      : type === 'array' ? Array.isArray(value)
      : typeof value === 'object' && !Array.isArray(value);
    if (!fits) return 'invalid arguments: ' + key + ' must be ' + (type === 'integer' ? 'an integer' : type === 'array' ? 'an array' : type === 'object' ? 'an object' : 'a ' + type);
  }
  for (const [key, value] of Object.entries(args)) {
    const allowed = properties[key].enum;
    if (allowed && value !== undefined && value !== null && !allowed.includes(value)) return 'invalid ' + key + ': use ' + allowed.map(v => "'" + v + "'").join(' or ');
  }
  return null;
}

function error(id, code, message) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

function callTool(name, args, env) {
  const problem = argumentProblem(name, args);
  if (problem) return { error: problem };
  const world = worldFor(env);
  if (name === 'list_datasources') return listDatasources(args);
  if (name === 'generate_deeplink') return deeplink(args);
  if (name === 'get_annotations') return getAnnotations(args, world);
  const type = { query_prometheus: 'prometheus', query_loki_logs: 'loki', search_tempo_traces: 'tempo', get_tempo_trace: 'tempo' }[name];
  const wrong = datasourceProblem(args.datasourceUid, type);
  if (wrong) return { error: wrong };
  if (name === 'query_prometheus') return queryPrometheus(args, world);
  if (name === 'query_loki_logs') return queryLoki(args, world);
  if (name === 'search_tempo_traces') return searchTraces(args, world);
  return getTrace(args, world);
}

// env.now is epoch milliseconds; the HTTP adapter supplies the clock. Optional
// env.scenario/day select URL state; env.timeline allows deterministic fixtures.
// No response (null) is returned for valid JSON-RPC notifications.
export function handleMcp(request, env = {}) {
  if (!request || typeof request !== 'object' || Array.isArray(request) || request.jsonrpc !== '2.0' ||
      typeof request.method !== 'string' ||
      (Object.hasOwn(request, 'id') && request.id !== null && typeof request.id !== 'string' && typeof request.id !== 'number')) {
    return error(null, -32600, 'Invalid Request');
  }
  const { id, method } = request;
  if (!Object.hasOwn(request, 'id')) return null;
  const params = request.params ?? {};
  if (typeof params !== 'object' || Array.isArray(params)) return error(id, -32602, 'Invalid params');
  let result;
  if (method === 'initialize') {
    result = { protocolVersion: params.protocolVersion || '2025-06-18', capabilities: { tools: {} },
      serverInfo: { name: 'mock-grafana-mcp', version: '0.1.0' } };
  } else if (method === 'tools/list') {
    result = { tools: Object.entries(TOOL_INPUTS).map(([name, input]) => ({
      name, description: input.title + ' (mock data)',
      inputSchema: { type: 'object', properties: input.properties, required: input.required },
      annotations: { readOnlyHint: true, destructiveHint: false, title: input.title }
    })) };
  } else if (method === 'tools/call') {
    const args = params.arguments ?? {};
    if (typeof args !== 'object' || Array.isArray(args)) return error(id, -32602, 'Invalid tool arguments');
    if (typeof params.name !== 'string' || !Object.hasOwn(TOOL_INPUTS, params.name)) return error(id, -32602, 'Unknown tool: ' + String(params.name));
    const outcome = callTool(params.name, args, env);
    if (outcome.error) {
      result = { content: [{ type: 'text', text: outcome.error }], isError: true };
    } else if (outcome.url) {
      result = { content: [{ type: 'text', text: outcome.url }] };
    } else {
      result = { content: [{ type: 'text', text: JSON.stringify(outcome.value) }], ...(outcome.structured ? { structuredContent: outcome.value } : {}) };
    }
  } else {
    return error(id, -32601, 'Method not found: ' + method);
  }
  return { jsonrpc: '2.0', id, result };
}
