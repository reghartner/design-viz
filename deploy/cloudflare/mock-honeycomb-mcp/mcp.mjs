// Pure JSON-RPC handler for the fictional Flowview Honeycomb dataset. It uses
// the same story reader and trace builder as mock-grafana-mcp; it never contacts
// Honeycomb, Cloudflare, the filesystem or the system clock.
import {
  HOUR, DAY, STORY_START, createStory, storyNow, traceFor
} from '../mock-grafana-mcp/story.mjs';

const EPOCH = Date.parse('2026-10-20T09:00:00Z');
const ENVIRONMENT = 'flowview-demo';
const DATASET = 'doorbell';
const MAX_HOURS = 12 * 24;
const VALUE_COLUMN = 'flowview.value';
const CARRIER_COLUMN = 'flowview.carrier';
const SIGNAL_COLUMN = 'flowview.signal';
const QUERY_KEYS = new Set(['calculations', 'filters', 'from', 'to', 'granularity', 'breakdowns']);
const CALCULATION_OPS = new Set(['AVG', 'SUM', 'MIN', 'MAX', 'COUNT']);
const TRACE_VIEW_MODES = new Set(['auto', 'full']);

const string = description => ({ type: 'string', description });
const TOOL_INPUTS = {
  run_query: {
    title: 'Run query (Flowview mock)',
    required: ['environment_slug', 'dataset_slug', 'query_spec'],
    properties: {
      environment_slug: string(`Mock environment slug; must be ${ENVIRONMENT}`),
      dataset_slug: string(`Mock dataset slug; must be ${DATASET}`),
      query_spec: {
        type: 'object',
        description: 'Native Honeycomb query object; this mock serves a documented aggregation/filter/time subset'
      }
    }
  },
  // Honeycomb documents the accepted reference kinds, but its public tool page and
  // the pinned public CI evidence do not publish the current input field names.
  // Keep the tool discoverable for connector selection and fail every call closed.
  get_query_results: {
    title: 'Get query results (not served by mock)',
    required: [],
    properties: {},
    additionalProperties: true
  },
  get_trace: {
    title: 'Get trace (Flowview mock)',
    required: ['environment_slug', 'trace_id', 'from'],
    properties: {
      environment_slug: string(`Mock environment slug; must be ${ENVIRONMENT}`),
      trace_id: string('Specific 32-character lowercase hexadecimal trace ID'),
      from: string('Relative duration such as 24h, now-24h, or an RFC3339 instant'),
      view_mode: { type: 'string', enum: [...TRACE_VIEW_MODES], description: 'auto (default) or full' }
    }
  }
};

function dayIndex(env, days) {
  if (env.day !== undefined && env.day !== null && Number.isFinite(Number(env.day))) {
    return Math.max(0, Math.min(days.length - 1, Math.floor(Number(env.day))));
  }
  const deployed = Date.parse(env.DEPLOYED_AT);
  const elapsed = Math.floor(((env.now ?? EPOCH) - (Number.isFinite(deployed) ? deployed : EPOCH)) / 60000);
  return ((elapsed % days.length) + days.length) % days.length;
}

function worldFor(env) {
  const model = createStory(env.timeline || undefined);
  const index = dayIndex(env, model.days);
  return {
    model,
    index,
    now: storyNow(index),
    silent: (env.scenario ?? 'story') !== 'story'
  };
}

const iso = value => new Date(value).toISOString().replace('.000Z', 'Z');
const DURATION = /^(\d+(?:\.\d+)?)(m|h|d)$/;
const DURATION_MS = { m: 60000, h: HOUR, d: DAY };
function parseInstant(value, now, relativeFrom = false) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (relativeFrom) {
    const duration = DURATION.exec(text);
    if (duration) return now - Number(duration[1]) * DURATION_MS[duration[2]];
  }
  if (text === 'now') return now;
  const relative = /^now-(\d+(?:\.\d+)?)(m|h|d)$/.exec(text);
  if (relative) return now - Number(relative[1]) * DURATION_MS[relative[2]];
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i.test(text)) return null;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function ownKeys(value, allowed, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return `${label} must be an object`;
  const unknown = Object.keys(value).filter(key => !allowed.has(key));
  return unknown.length ? `${label} has unsupported field ${JSON.stringify(unknown[0])}` : null;
}

function parseCalculation(value, index) {
  const problem = ownKeys(value, new Set(['op', 'column']), `query_spec.calculations[${index}]`);
  if (problem) return { error: problem };
  const op = typeof value.op === 'string' ? value.op.toUpperCase() : '';
  if (!CALCULATION_OPS.has(op)) {
    return { error: `unsupported calculation ${JSON.stringify(value.op)}; use AVG, SUM, MIN, MAX, or COUNT` };
  }
  if (op !== 'COUNT' && value.column !== VALUE_COLUMN) {
    return { error: `${op} requires column ${JSON.stringify(VALUE_COLUMN)}` };
  }
  if (op === 'COUNT' && value.column !== undefined && value.column !== VALUE_COLUMN) {
    return { error: `COUNT accepts no column or ${JSON.stringify(VALUE_COLUMN)}` };
  }
  return { op, key: op === 'COUNT' ? 'COUNT' : `${op}(${VALUE_COLUMN})` };
}

function parseFilters(filters) {
  if (!Array.isArray(filters)) return { error: 'query_spec.filters must be an array' };
  const selected = {};
  for (let index = 0; index < filters.length; index++) {
    const filter = filters[index];
    const problem = ownKeys(filter, new Set(['column', 'op', 'value']), `query_spec.filters[${index}]`);
    if (problem) return { error: problem };
    if (filter.op !== '=') return { error: `query_spec.filters[${index}] supports only the = operator` };
    if (filter.column !== CARRIER_COLUMN && filter.column !== SIGNAL_COLUMN) {
      return { error: `unsupported filter column ${JSON.stringify(filter.column)}` };
    }
    if (typeof filter.value !== 'string' || !filter.value) {
      return { error: `query_spec.filters[${index}].value must be a non-empty string` };
    }
    if (selected[filter.column] !== undefined) return { error: `duplicate filter for ${filter.column}` };
    selected[filter.column] = filter.value;
  }
  if (filters.length !== 2 || !selected[CARRIER_COLUMN] || !selected[SIGNAL_COLUMN]) {
    return { error: `query_spec.filters must contain exactly ${CARRIER_COLUMN} = ... and ${SIGNAL_COLUMN} = ...` };
  }
  return { carrier: selected[CARRIER_COLUMN], signal: selected[SIGNAL_COLUMN] };
}

function calculationValue(op, values) {
  if (op === 'COUNT') return values.length;
  if (op === 'MIN') return Math.min(...values);
  if (op === 'MAX') return Math.max(...values);
  const total = values.reduce((sum, value) => sum + value, 0);
  return op === 'AVG' ? total / values.length : total;
}

function knownSignal(model, carrier, signal) {
  return model.days.some(day => Array.isArray(day?.telemetry?.carriers?.[carrier]?.[signal]?.values));
}

function measurements(model, carrier, signal, start, end, horizon) {
  if (end <= start || start >= horizon) return [];
  const effectiveEnd = Math.min(end, horizon);
  const first = Math.max(0, Math.ceil((start - STORY_START) / HOUR));
  const last = Math.min(MAX_HOURS - 1, Math.floor((effectiveEnd - STORY_START) / HOUR) - 1);
  const rows = [];
  for (let hour = first; hour <= last; hour++) {
    const value = model.sample(carrier, signal, hour);
    if (value !== null) rows.push({ hour, time: STORY_START + hour * HOUR, value });
  }
  return rows;
}

function queryError(args, world) {
  if (args.environment_slug !== ENVIRONMENT) return `unknown mock environment ${JSON.stringify(args.environment_slug)}`;
  if (args.dataset_slug !== DATASET) return `unknown mock dataset ${JSON.stringify(args.dataset_slug)}`;
  const specProblem = ownKeys(args.query_spec, QUERY_KEYS, 'query_spec');
  if (specProblem) return specProblem;
  const spec = args.query_spec;
  if (!Array.isArray(spec.calculations) || spec.calculations.length < 1 || spec.calculations.length > 5) {
    return 'query_spec.calculations must contain 1 to 5 calculations';
  }
  if (spec.breakdowns !== undefined && (!Array.isArray(spec.breakdowns) || spec.breakdowns.length)) {
    return 'query_spec.breakdowns must be omitted or empty; the mock serves one carrier signal at a time';
  }
  if (spec.granularity !== undefined && spec.granularity !== 3600) return 'query_spec.granularity must be 3600 seconds';
  const calculations = spec.calculations.map(parseCalculation);
  const calculationProblem = calculations.find(entry => entry.error);
  if (calculationProblem) return calculationProblem.error;
  if (new Set(calculations.map(entry => entry.key)).size !== calculations.length) return 'duplicate calculations are not supported';
  const filters = parseFilters(spec.filters);
  if (filters.error) return filters.error;
  if (!knownSignal(world.model, filters.carrier, filters.signal)) {
    return `unknown mock carrier signal ${filters.carrier}.${filters.signal}`;
  }
  const start = parseInstant(spec.from, world.now, true);
  if (start === null) return 'query_spec.from must be a duration such as 24h, now-24h, or an RFC3339 instant';
  const end = spec.to === undefined ? world.now : parseInstant(spec.to, world.now);
  if (end === null) return 'query_spec.to must be now, now-24h, or an RFC3339 instant';
  if (end < start) return 'query_spec.to must not be before query_spec.from';
  if (end - start > MAX_HOURS * HOUR) return `mock query window is limited to ${MAX_HOURS} hours`;
  return { spec, calculations, filters, start, end };
}

function runQuery(args, world) {
  const parsed = queryError(args, world);
  if (typeof parsed === 'string') return { error: parsed };
  const rows = world.silent ? [] : measurements(
    world.model, parsed.filters.carrier, parsed.filters.signal, parsed.start, parsed.end, world.now
  );
  const aggregate = {};
  if (rows.length) {
    for (const calculation of parsed.calculations) {
      aggregate[calculation.key] = calculationValue(calculation.op, rows.map(row => row.value));
    }
  }
  const points = rows.map(row => ({
    data: Object.fromEntries([
      ['time', iso(row.time)],
      ...parsed.calculations.map(calculation => [calculation.key, calculationValue(calculation.op, [row.value])])
    ])
  }));
  const header = [
    { alias: 'time', key_name: 'time', type: 'string', derived: false },
    ...parsed.calculations.map(calculation => ({
      alias: calculation.key, key_name: calculation.key,
      type: calculation.op === 'COUNT' ? 'integer' : 'float', derived: true
    }))
  ];
  const raw = {
    results: rows.length ? [{ data: aggregate }] : [],
    series: points,
    header,
    info: { granularity_seconds: 3600, rows_examined: rows.length, mean_sample_rate: 1 },
    template: {
      calculations: parsed.spec.calculations,
      filters: parsed.spec.filters,
      from: parsed.spec.from,
      ...(parsed.spec.to === undefined ? {} : { to: parsed.spec.to }),
      granularity: 3600
    },
    total_by_aggregate: rows.length ? { data: aggregate } : null,
    other_by_aggregate: null,
    total_by_aggregate_series: points
  };
  return { value: raw, label: 'MOCK Honeycomb raw query result JSON (not a live or signed result)' };
}

function findTrace(world, traceId, from) {
  if (world.silent) return null;
  const first = parseInstant(from, world.now, true);
  if (first === null) return { error: 'from must be a duration such as 24h, now-24h, or an RFC3339 instant' };
  const lastHour = Math.min(MAX_HOURS - 1, Math.floor((world.now - STORY_START) / HOUR) - 1);
  for (let hour = 0; hour <= lastHour; hour++) {
    const trace = traceFor(world.model, hour);
    if (trace?.traceId === traceId) return trace.startTimeMs >= first ? trace : null;
  }
  return null;
}

function traceRow(span) {
  const route = span.attributes?.['http.route'] || '';
  const http = span.attributes?.['http.response.status_code'] ?? '';
  return {
    span_id: span.spanId,
    parent_id: span.parentSpanId || '',
    start_unix_ns: (BigInt(Math.round(span.startTimeMs)) * 1000000n).toString(),
    duration_ns: (BigInt(Math.round(span.durationMs * 1000000))).toString(),
    kind: span.kind,
    status_code: span.status === 'error' ? 'ERROR' : 'UNSET',
    error: span.status === 'error',
    http_status: http,
    service: span.service,
    route,
    name: span.name
  };
}

const TRACE_COLUMNS = [
  'span_id', 'parent_id', 'start_unix_ns', 'duration_ns', 'kind', 'status_code',
  'error', 'http_status', 'service', 'route', 'name'
];
const cell = value => String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
function traceText(trace, viewMode) {
  const rows = trace.spans.map(traceRow);
  const metadata = {
    total_spans: rows.length,
    visible_spans: rows.length,
    collapsed_nodes: 0,
    trace_id: trace.traceId,
    trace_link: null,
    view_mode: viewMode,
    mean_sample_rate: 1
  };
  return [
    'MOCK Honeycomb trace table (fictional shared-timeline evidence; no live account)',
    '',
    `| ${TRACE_COLUMNS.join(' | ')} |`,
    `| ${TRACE_COLUMNS.map(() => '---').join(' | ')} |`,
    ...rows.map(row => `| ${TRACE_COLUMNS.map(column => cell(row[column])).join(' | ')} |`),
    '',
    '---',
    'Metadata:',
    JSON.stringify(metadata)
  ].join('\n');
}

function getTrace(args, world) {
  if (args.environment_slug !== ENVIRONMENT) return { error: `unknown mock environment ${JSON.stringify(args.environment_slug)}` };
  if (typeof args.trace_id !== 'string' || !/^[0-9a-f]{32}$/.test(args.trace_id)) {
    return { error: 'trace_id must be 32 lowercase hexadecimal characters' };
  }
  const viewMode = args.view_mode || 'auto';
  if (!TRACE_VIEW_MODES.has(viewMode)) return { error: 'view_mode must be auto or full; focused mode is not served by this mock' };
  const trace = findTrace(world, args.trace_id, args.from);
  if (trace?.error) return trace;
  if (!trace) return { error: `trace ${args.trace_id} was not found in the selected story window` };
  return { text: traceText(trace, viewMode) };
}

function rpcError(id, code, message) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}
function toolError(id, message) {
  return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: message }], isError: true } };
}
function toolValue(id, value, label) {
  const text = `${label}\n${JSON.stringify(value)}`;
  return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }], structuredContent: value } };
}
function toolText(id, value) {
  return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: value }] } };
}

function tools() {
  return Object.entries(TOOL_INPUTS).map(([name, spec]) => ({
    name,
    description: name === 'get_query_results'
      ? 'Mock-only placeholder: public primary sources do not expose the current native inputSchema, so calls fail closed.'
      : `Read-only mock Honeycomb ${name.replaceAll('_', ' ')} over Flowview's fictional shared timeline.`,
    inputSchema: {
      type: 'object',
      properties: spec.properties,
      required: spec.required,
      ...(spec.additionalProperties ? { additionalProperties: true } : { additionalProperties: false })
    },
    annotations: { readOnlyHint: true, destructiveHint: false, title: spec.title }
  }));
}

export function handleMcp(request, env = {}) {
  if (!request || typeof request !== 'object' || Array.isArray(request) || request.jsonrpc !== '2.0' ||
      typeof request.method !== 'string' ||
      (Object.hasOwn(request, 'id') && request.id !== null && typeof request.id !== 'string' && typeof request.id !== 'number')) {
    return rpcError(null, -32600, 'Invalid Request');
  }
  const { id } = request;
  if (!Object.hasOwn(request, 'id')) return null;
  if (request.method === 'initialize') {
    return { jsonrpc: '2.0', id, result: {
      protocolVersion: request.params?.protocolVersion || '2025-06-18',
      capabilities: { tools: {} },
      serverInfo: { name: 'mock-honeycomb-mcp', version: '0.1.0' }
    } };
  }
  if (request.method === 'tools/list') return { jsonrpc: '2.0', id, result: { tools: tools() } };
  if (request.method !== 'tools/call') return rpcError(id, -32601, `Method not found: ${request.method}`);
  const name = request.params?.name;
  const args = request.params?.arguments ?? {};
  const spec = typeof name === 'string' && Object.hasOwn(TOOL_INPUTS, name) ? TOOL_INPUTS[name] : null;
  if (!spec) return rpcError(id, -32602, `Unknown tool ${JSON.stringify(name)}`);
  if (!args || typeof args !== 'object' || Array.isArray(args)) return toolError(id, 'arguments must be an object');
  for (const required of spec.required) if (args[required] === undefined) return toolError(id, `missing required argument ${required}`);
  if (!spec.additionalProperties) {
    const unknown = Object.keys(args).find(key => !(key in spec.properties));
    if (unknown) return toolError(id, `unknown argument ${unknown} for ${name}`);
  }
  if (name === 'get_query_results') {
    return toolError(id, 'get_query_results is not served: Honeycomb public primary sources do not publish its current input field names; use the completed run_query result directly in this mock');
  }
  const world = worldFor(env);
  const result = name === 'run_query' ? runQuery(args, world) : getTrace(args, world);
  if (result.error) return toolError(id, result.error);
  if (result.text !== undefined) return toolText(id, result.text);
  return toolValue(id, result.value, result.label);
}

// Test-only stable context helpers; they expose no data beyond the public mock contract.
export const MOCK_ENVIRONMENT = ENVIRONMENT;
export const MOCK_DATASET = DATASET;
export const MOCK_EPOCH = EPOCH;
