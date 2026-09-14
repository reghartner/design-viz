/* trace-import.js — pure Honeycomb event JSON → Flow Spec conversion.
   Shared by the workbench and tools/trace2spec.js. No network or secrets. */
var TRACE_FIELDS = {
  traceId: 'trace.trace_id', spanId: 'trace.span_id', parentId: 'trace.parent_id',
  service: 'service.name', name: 'name', timestamp: 'timestamp', duration: 'duration_ms', error: 'error'
};

function traceToSpec(input, options){
  options = options || {};
  var warnings = [], own = function(o, k){ return o && Object.prototype.hasOwnProperty.call(o, k); };
  var object = function(o){ return !!o && typeof o === 'object' && !Array.isArray(o); };
  if (typeof input === 'string'){
    try { input = JSON.parse(input); } catch (ex){ throw new Error('Trace input is not valid JSON: ' + ex.message); }
  }
  var events = Array.isArray(input) ? input : input && (input.events || input.spans);
  if (!Array.isArray(events) || !events.length)
    throw new Error('Expected a non-empty event array, {events: [...]}, or {spans: [...]}; aggregated query results are not trace events.');
  if (events.length > 10000) throw new Error('Input exceeds 10,000 events. Export one trace or a focused subtree.');
  var fields = Object.assign({}, TRACE_FIELDS);
  if (options.fields != null){
    if (!object(options.fields)) throw new Error('Field mapping must be an object.');
    Object.keys(options.fields).forEach(function(k){
      if (!own(fields, k) || typeof options.fields[k] !== 'string' || !options.fields[k])
        throw new Error('Unknown or empty field mapping: ' + k);
      fields[k] = options.fields[k];
    });
  }
  var source = options.sourceUrl || '';
  if (source){
    try {
      var url = new URL(source);
      if (!/^https?:$/.test(url.protocol) || url.username || url.password) throw new Error();
    } catch (ex){ throw new Error('Source URL must be an HTTP(S) link without embedded credentials.'); }
  }
  function value(event, key){
    var data = object(event.data) ? event.data : event;
    if (own(data, fields[key])) return data[fields[key]];
    if (own(event, fields[key])) return event[fields[key]];
    // Honeycomb ingestion envelopes put the timestamp outside data as time.
    if (key === 'timestamp' && fields[key] === TRACE_FIELDS.timestamp && own(event, 'time')) return event.time;
    return undefined;
  }
  function requiredString(v, field, index){
    if (typeof v !== 'string' || !v.trim()) throw new Error('Event ' + (index + 1) + ': missing string field ' + field + '. Adjust the field mapping if your dataset uses different names.');
    return v;
  }
  function timestamp(v, index){
    var n = NaN;
    if (typeof v === 'number' && Number.isFinite(v)) n = v * 1000; // Unix seconds
    else if (typeof v === 'string' && /^\d{4}-\d\d-\d\dT.+(?:Z|[+-]\d\d:\d\d)$/i.test(v)){
      n = Date.parse(v);
      var fraction = /\.(\d+)(?:Z|[+-]\d\d:\d\d)$/i.exec(v);
      if (fraction) n += Number('0.' + fraction[1]) * 1000 - Number((fraction[1] + '000').slice(0, 3));
    }
    if (!Number.isFinite(n)) throw new Error('Event ' + (index + 1) + ': ' + fields.timestamp + ' needs an ISO timestamp with timezone or Unix seconds.');
    return n;
  }
  var traceIds = new Set(), ignored = 0, candidates = [];
  events.forEach(function(event, index){
    if (!object(event)) throw new Error('Event ' + (index + 1) + ' must be an object.');
    var data = object(event.data) ? event.data : event;
    if (['span_event','link','log'].indexOf(data['meta.annotation_type']) >= 0){ ignored++; return; }
    var id = requiredString(value(event, 'traceId'), fields.traceId, index);
    traceIds.add(id); candidates.push({event: event, index: index, traceId: id});
  });
  var selected = options.traceId;
  if (!selected && traceIds.size > 1) throw new Error('Input contains ' + traceIds.size + ' traces. Enter a trace ID to import exactly one.');
  if (!selected) selected = Array.from(traceIds)[0];
  candidates = candidates.filter(function(c){ return c.traceId === selected; });
  if (!candidates.length) throw new Error('No spans found for the selected trace.');
  if (candidates.length > 200) throw new Error('This trace has ' + candidates.length + ' spans; the first version supports up to 200. Export a focused subtree (nothing was truncated).');
  if (ignored) warnings.push(ignored + ' non-span annotation(s) excluded.');
  if (traceIds.size > 1) warnings.push('Imported only trace ' + selected + '; other traces excluded.');
  var spans = candidates.map(function(c){
    var e = c.event, index = c.index, data = object(e.data) ? e.data : e;
    var id = requiredString(value(e, 'spanId'), fields.spanId, index);
    var parent = value(e, 'parentId');
    if (parent != null && typeof parent !== 'string') throw new Error('Event ' + (index + 1) + ': parent span ID must be a string.');
    if (!parent || /^0+$/.test(parent)) parent = null;
    var ms = value(e, 'duration');
    if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0)
      throw new Error('Event ' + (index + 1) + ': ' + fields.duration + ' needs a finite, non-negative number of milliseconds.');
    var error = value(e, 'error'), status = data['otel.status_code'];
    return {id: id, parentId: parent, service: requiredString(value(e, 'service'), fields.service, index),
      name: requiredString(value(e, 'name'), fields.name, index), time: timestamp(value(e, 'timestamp'), index), ms: ms,
      error: error === true || error === 'true' || status === 2 || status === 'ERROR' || status === 'STATUS_CODE_ERROR'};
  });
  var byId = new Map();
  spans.forEach(function(s){
    if (byId.has(s.id)) throw new Error('Duplicate span ID: ' + s.id);
    byId.set(s.id, s);
  });
  spans.forEach(function(s){
    var seen = new Set([s.id]), parent = s.parentId;
    while (parent && byId.has(parent)){
      if (seen.has(parent)) throw new Error('Parent cycle at span ' + s.id);
      seen.add(parent); parent = byId.get(parent).parentId;
    }
  });
  spans.sort(function(a, b){ return a.time - b.time || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0); });
  var start = spans[0].time, round = function(n){ return Math.round(n * 1000) / 1000; };
  spans.forEach(function(s){
    s.startMs = round(s.time - start);
    if (!Number.isFinite(s.startMs + s.ms)) throw new Error('Span timing exceeds the supported numeric range.');
  });
  var missing = spans.filter(function(s){ return s.parentId && !byId.has(s.parentId); });
  if (missing.length) warnings.push(missing.length + ' span(s) have missing parents; the trace is partial. No missing service or call was invented.');
  var roots = spans.filter(function(s){ return !s.parentId; });
  if (roots.length !== 1) warnings.push('Found ' + roots.length + ' root spans; review trace completeness.');
  var skew = spans.filter(function(s){
    var parent = byId.get(s.parentId);
    return parent && (s.time < parent.time || s.time + s.ms > parent.time + parent.ms + 0.001);
  });
  if (skew.length) warnings.push(skew.length + ' child span(s) extend outside their parent interval (async work or clock skew); original timing retained.');
  var services = new Map();
  spans.forEach(function(s){ if (!services.has(s.service)) services.set(s.service, 'svc' + (services.size + 1)); });
  if (services.size > 10) throw new Error('This trace spans ' + services.size + ' services; focus the export to at most 10 services for a readable board.');
  var nodes = {}, ids = [], edges = [], pairs = new Set();
  services.forEach(function(id, service){
    ids.push(id); nodes[id] = {title: service, sub: 'observed service', icon: 'server', tint: 'cmd'};
    if (source) nodes[id].link = source;
  });
  spans.forEach(function(s){
    var parent = byId.get(s.parentId);
    if (!parent || parent.service === s.service) return;
    var from = services.get(parent.service), to = services.get(s.service), key = from + '->' + to;
    if (!pairs.has(key)){ pairs.add(key); edges.push({from: from, to: to, kind: 'trace'}); }
  });
  var elapsed = round(Math.max.apply(null, spans.map(function(s){ return s.startMs + s.ms; })));
  var timing = {id: 'timing', type: 'waterfall', title: 'Observed span timing',
    spans: spans.map(function(s){ return {id: s.id, label: s.service + ' · ' + s.name, ms: s.ms, startMs: s.startMs, error: s.error}; })};
  var details = {id: 'span', type: 'table', title: 'Selected span', columns: [{id: 'field', label: 'Field'}, {id: 'value', label: 'Observed value'}]};
  var steps = spans.map(function(s){
    var facts = [['span_id', s.id], ['parent_id', s.parentId], ['service', s.service], ['operation', s.name],
      ['start_ms', s.startMs], ['duration_ms', s.ms], ['error', s.error ? 'recorded error' : 'not flagged']];
    var st = {id: s.id, nodes: [services.get(s.service)],
      text: '+' + s.startMs + ' ms · ' + s.service + ' · ' + s.name + ' · duration ' + s.ms + ' ms' + (s.error ? ' · recorded error' : ''),
      panels: {timing: {highlight: s.id}, span: {rows: facts.map(function(f){ return {id: f[0], cells: {field: f[0], value: f[1]}}; })}}};
    var parent = byId.get(s.parentId);
    if (parent && parent.service !== s.service) st.edge = services.get(parent.service) + '->' + services.get(s.service);
    if (source) st.link = source;
    return st;
  });
  var half = Math.ceil(ids.length / 2), rows = ids.length <= 5 ? [ids] : [ids.slice(0, half), ids.slice(half)];
  var section = {heading: 'Observed request', accent: 'cyan', text: [
    'Imported trace ' + selected + ': ' + spans.length + ' spans across ' + services.size + ' services; observed extent ' + elapsed + ' ms.',
    'Inspect spans in start-time order. Overlapping bars retain their original offsets; parent spans include child time. The total is elapsed extent, not a sum of durations. Arrows mean span parent relationships, not a verified network protocol.',
    'This is one recorded execution, not an HLD or a complete service inventory. Unflagged spans are not proof of success.'],
    bullets: warnings.slice(), diagram: {view: 'step', nodes: nodes, rows: rows, edges: edges, panels: [timing, details], steps: steps}};
  if (source) section.source = source;
  return {spec: {page: {title: options.title || 'Trace → design · ' + (roots[0] || spans[0]).name, skin: 'aurora',
    protocols: edges.length ? {trace: {label: 'Span parent relationship', color: '#38BDF8'}} : {}, blocks: [section]}},
    warnings: warnings, stats: {traceId: selected, spans: spans.length, services: services.size, elapsedMs: elapsed}};
}
