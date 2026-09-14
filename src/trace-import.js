/* trace-import.js — pure Honeycomb event JSON → Flow Spec conversion.
   Shared by the workbench and tools/trace2spec.js. No network or secrets. */
var TRACE_FIELDS = {
  traceId: 'trace.trace_id', spanId: 'trace.span_id', parentId: 'trace.parent_id',
  service: 'service.name', name: 'name', timestamp: 'timestamp', duration: 'duration_ms', error: 'error'
};

/* Collapse service cycles before ranking, then order each level by its
   neighbours. Output is ordinary editable serpentine rows, not stored XYs. */
function traceRows(ids, edges){
  var next = new Map(), prev = new Map(), index = new Map(), low = new Map();
  var stack = [], active = new Set(), components = [], serial = 0;
  ids.forEach(function(id){ next.set(id, []); prev.set(id, []); });
  edges.forEach(function(e){
    if (!next.has(e.from) || !next.has(e.to)) return;
    next.get(e.from).push(e.to); prev.get(e.to).push(e.from);
  });
  function visit(id){
    index.set(id, serial); low.set(id, serial++); stack.push(id); active.add(id);
    next.get(id).forEach(function(to){
      if (!index.has(to)){ visit(to); low.set(id, Math.min(low.get(id), low.get(to))); }
      else if (active.has(to)) low.set(id, Math.min(low.get(id), index.get(to)));
    });
    if (low.get(id) !== index.get(id)) return;
    var members = [], last;
    do { last = stack.pop(); active.delete(last); members.push(last); } while (last !== id);
    components.push(members.sort(function(a,b){ return ids.indexOf(a) - ids.indexOf(b); }));
  }
  ids.forEach(function(id){ if (!index.has(id)) visit(id); });
  var component = new Map(), ranks = [];
  components.forEach(function(m, i){ m.forEach(function(id){ component.set(id, i); }); });
  function rank(i){
    if (ranks[i] != null) return ranks[i];
    var n = 0;
    components[i].forEach(function(id){ prev.get(id).forEach(function(from){
      var p = component.get(from); if (p !== i) n = Math.max(n, rank(p) + 1);
    }); });
    return ranks[i] = n;
  }
  var levels = [];
  ids.forEach(function(id){ var r = rank(component.get(id)); (levels[r] || (levels[r] = [])).push(id); });
  var positions = new Map();
  function refresh(){ levels.forEach(function(row){ row.forEach(function(id,i){ positions.set(id, (i+.5)/row.length); }); }); }
  refresh();
  for (var pass = 0; pass < 6; pass++){
    var order = levels.map(function(_, i){ return i; });
    if (pass % 2) order.reverse();
    order.forEach(function(r){
      var scores = new Map(), neighbors = pass % 2 ? next : prev;
      levels[r].forEach(function(id){
        var ns = neighbors.get(id).filter(function(n){ return rank(component.get(n)) !== r; });
        scores.set(id, ns.length ? ns.reduce(function(sum,n){ return sum + positions.get(n); },0)/ns.length : positions.get(id));
      });
      levels[r].sort(function(a,b){ return scores.get(a)-scores.get(b) || positions.get(a)-positions.get(b) || ids.indexOf(a)-ids.indexOf(b); });
      refresh();
    });
  }
  var rows = [];
  levels.forEach(function(level){ for (var i=0; i<level.length; i+=4) rows.push(level.slice(i,i+4)); });
  return rows.map(function(row,i){ return i%2 ? row.reverse() : row; });
}

function traceSpanStats(spans, traceId){
  var extent=0, services=new Set();
  spans.forEach(function(s){ services.add(s.service); extent=Math.max(extent,s.startMs+s.ms); });
  return {traceId:traceId,spans:spans.length,services:services.size,elapsedMs:Math.round(extent*1000)/1000};
}

function traceSubtreeSizes(spans){
  var sizes=new Map(), pending=new Map(), parents=new Map(), queue=[];
  spans.forEach(function(s){ sizes.set(s.id,1); pending.set(s.id,0); parents.set(s.id,s.parentId); });
  spans.forEach(function(s){ if (pending.has(s.parentId)) pending.set(s.parentId,pending.get(s.parentId)+1); });
  pending.forEach(function(count,id){ if (!count) queue.push(id); });
  for (var i=0;i<queue.length;i++){
    var id=queue[i], parent=parents.get(id);
    if (!sizes.has(parent)) continue;
    sizes.set(parent,sizes.get(parent)+sizes.get(id));
    pending.set(parent,pending.get(parent)-1); if (!pending.get(parent)) queue.push(parent);
  }
  return sizes;
}

/* Analyze first, without building any board or silently trimming the source.
   Every focused span retains all exported descendants, so filtering cannot
   remove an included span's direct children from its timing calculation. */
function tracePreview(input, options){
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
  var checked = new Set();
  spans.forEach(function(s){
    if (checked.has(s.id)) return;
    var seen = new Set([s.id]), parent = s.parentId;
    while (parent && byId.has(parent)){
      if (seen.has(parent)) throw new Error('Parent cycle at span ' + s.id);
      if (checked.has(parent)) break;
      seen.add(parent); parent = byId.get(parent).parentId;
    }
    seen.forEach(function(id){ checked.add(id); });
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
  var sourceSpans=spans, sourceStats=traceSpanStats(spans,selected), focus=null;
  var rootId=options.rootSpanId, service=options.service;
  if (rootId != null && (typeof rootId!=='string' || !rootId.trim())) throw new Error('Subtree focus needs a non-empty span ID.');
  if (service != null && (typeof service!=='string' || !service.trim())) throw new Error('Service focus needs a non-empty service name.');
  if (rootId != null && service != null) throw new Error('Choose either a subtree or a service focus, not both.');
  if (rootId != null || service != null){
    var seeds=rootId != null ? spans.filter(function(s){ return s.id===rootId; }) : spans.filter(function(s){ return s.service===service; });
    if (!seeds.length) throw new Error(rootId != null ? 'No span matches subtree ID: '+rootId : 'No spans match service: '+service);
    var children=new Map(), included=new Set(), queue=seeds.slice();
    spans.forEach(function(s){ if (!children.has(s.parentId)) children.set(s.parentId,[]); children.get(s.parentId).push(s); });
    for (var qi=0; qi<queue.length; qi++){
      var s=queue[qi]; if (included.has(s.id)) continue;
      included.add(s.id); (children.get(s.id)||[]).forEach(function(c){ queue.push(c); });
    }
    spans=spans.filter(function(s){ return included.has(s.id); });
    var offset=spans[0].startMs, boundary=spans.filter(function(s){ return s.parentId && byId.has(s.parentId) && !included.has(s.parentId); });
    var ancestors=[], parent=rootId != null ? byId.get(rootId).parentId : null;
    while (parent && byId.has(parent)){
      var ancestor=byId.get(parent); ancestors.push({id:ancestor.id,service:ancestor.service,name:ancestor.name}); parent=ancestor.parentId;
    }
    ancestors.reverse();
    focus={kind:rootId != null?'subtree':'service',value:rootId != null?rootId:service,
      omittedSpans:sourceSpans.length-spans.length,boundarySpans:boundary.length,viewOffsetMs:offset,
      ancestors:ancestors.slice(-8),omittedAncestors:Math.max(0,ancestors.length-8)};
    warnings=warnings.map(function(w){ return 'Source export: '+w; });
    warnings.unshift('Focused '+focus.kind+' '+focus.value+': '+spans.length+' of '+sourceSpans.length+' source spans included; '+focus.omittedSpans+' omitted. All exported descendants of included spans are retained.');
    if (boundary.length) warnings.push(boundary.length+' included span(s) have parents outside this focus. Original parent IDs are retained; no replacement parent or service arrow was invented.');
    warnings.push('Timing origin is +'+offset+' ms from the earliest source span. Durations and relative timing are unchanged.');
    spans=spans.map(function(s){ return Object.assign({},s,{traceStartMs:s.startMs,startMs:round(s.startMs-offset)}); });
  }
  var stats=traceSpanStats(spans,selected);
  if (focus) focus.omittedServices=sourceStats.services-stats.services;
  var blocked=stats.spans>200 ? 'This selection has '+stats.spans+' spans; diagrams support up to 200. Choose a narrower subtree or service (nothing was truncated).' :
    stats.services>30 ? 'This selection spans '+stats.services+' services; choose a focus with at most 30 services (nothing was truncated).' : null;
  return {spans:spans,sourceSpans:sourceSpans,sourceStats:sourceStats,stats:stats,traceId:selected,source:source,
    roots:roots,warnings:warnings,focus:focus,canBuild:!blocked,blocked:blocked,subtreeSizes:traceSubtreeSizes(sourceSpans)};
}

function traceToSpec(input, options){
  options=options||{};
  var plan=tracePreview(input,options);
  if (!plan.canBuild) throw new Error(plan.blocked);
  var spans=plan.spans, warnings=plan.warnings, source=plan.source, selected=plan.traceId, roots=plan.roots;
  var byId=new Map(), allServices=new Map();
  spans.forEach(function(s){ byId.set(s.id,s); });
  plan.sourceSpans.forEach(function(s){ if (!allServices.has(s.service)) allServices.set(s.service,'svc'+(allServices.size+1)); });
  var services = new Map();
  spans.forEach(function(s){ if (!services.has(s.service)) services.set(s.service,allServices.get(s.service)); });
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
  var elapsed = plan.stats.elapsedMs;
  var timing = {id: 'timing', type: 'waterfall', title: 'Observed span timing',
    spans: spans.map(function(s){ return {id: s.id, label: s.service + ' · ' + s.name, ms: s.ms, startMs: s.startMs, error: s.error}; })};
  var details = {id: 'span', type: 'table', title: 'Selected span', columns: [{id: 'field', label: 'Field'}, {id: 'value', label: 'Observed value'}]};
  var internal = {id:'internal',type:'trace',title:'Inside the service',spans:spans.map(function(s){
    return {id:s.id,parentId:s.parentId,service:s.service,name:s.name,startMs:s.startMs,ms:s.ms,error:s.error};
  })};
  var steps = spans.map(function(s){
    var facts = [['span_id', s.id], ['parent_id', s.parentId], ['service', s.service], ['operation', s.name],
      ['start_ms', s.startMs], ['duration_ms', s.ms], ['error', s.error ? 'recorded error' : 'not flagged']];
    if (plan.focus) facts.splice(5,0,['trace_start_ms',s.traceStartMs]);
    var st = {id: s.id, nodes: [services.get(s.service)],
      text: '+' + s.startMs + ' ms · ' + s.service + ' · ' + s.name + ' · duration ' + s.ms + ' ms' + (s.error ? ' · recorded error' : ''),
      panels: {timing: {highlight: s.id}, internal:{selected:s.id}, span: {rows: facts.map(function(f){ return {id: f[0], cells: {field: f[0], value: f[1]}}; })}}};
    var parent = byId.get(s.parentId);
    if (parent && parent.service !== s.service) st.edge = services.get(parent.service) + '->' + services.get(s.service);
    if (source) st.link = source;
    return st;
  });
  var rows = traceRows(ids, edges);
  var section = {heading: 'Observed request', accent: 'cyan', text: [
    'Imported trace ' + selected + ': ' + spans.length + ' spans across ' + services.size + ' services; observed extent ' + elapsed + ' ms.',
    'Inspect spans in start-time order. Overlapping bars retain their original offsets; parent spans include child time. The total is elapsed extent, not a sum of durations. Arrows mean span parent relationships, not a verified network protocol.',
    'This is one recorded execution, not an HLD or a complete service inventory. Unflagged spans are not proof of success.'],
    bullets: warnings.slice(), diagram: {view: 'step', routing: 'lanes', nodes: nodes, rows: rows, edges: edges, panels: [timing, internal, details], steps: steps}};
  if (source) section.source = source;
  var result={spec: {page: {title: options.title || 'Trace → design · ' + (roots[0] || spans[0]).name, skin: 'aurora',
    protocols: edges.length ? {trace: {label: 'Span parent relationship', color: '#38BDF8'}} : {}, blocks: [section]}},
    warnings: warnings, stats: plan.stats};
  if (plan.focus){
    result.spec.page.traceImport={traceId:selected,sourceSpans:plan.sourceStats.spans,includedSpans:spans.length,focus:plan.focus};
    section.heading='Observed request · '+plan.focus.kind+' '+plan.focus.value;
  }
  return result;
}
