/* Proof verdicts: a carrier's Jira state combined with its telemetry signals
   (PROVEN vs DONE). Pure and DOM-free: no timers, no clock, no page reading.
   A wrapper that reads the page (carrier `telemetry` bindings, local and
   imported carriers, step selections, the provider maps) builds the input;
   this module only judges it. See docs/live-status.md#proof-verdicts.

   Input: proofVerdicts(input, options)

   input.carriers  Every carrier on the page, local and imported, bound or not:
       [{id, tickets, kind, signals, proof}]
     id       Unique per call: a node id ('ingest'), an edge identity
              ('mcu->ingest') or a resolved imported identity
              ('canon::api->canon::store'). A repeated id keeps its first entry.
     tickets  Jira keys on the carrier (trackingRefs(value).tickets).
     kind     'call' | 'queue' | 'service' | 'log-event' | 'device'; not judged.
     signals  {name: {source, query, unit}}, source one of 'grafana', 'loki',
              'tempo', 'sql', 'honeycomb'. A carrier with at least one signal
              is bound. Without signals it is unbound: counted, never judged.
     proof    {name: {min, max, maxRatioOf}}, the limits below. Optional.

   input.jiraMap  The live-status runtime map, one entry per ticket key, as
       createLiveStatus().apply() keeps it:
       {KEY: {state: 'todo'|'active'|'done'|'blocked'|'missing', updatedAt, ...}}

   input.telemetryMap  One sample per bound carrier id:
       {id: {signals: {name: {value, series: [[t, v], ...], unit}}, sampledAt}}
     value    The adapter's headline number for the window. Without it the
              last finite series point stands in.
     series   Points across the window in ascending time; t is epoch
              milliseconds or an ISO string.
     A query that ran and matched nothing is reported by the adapter as 0. A
     signal with neither a finite value nor a finite point is unobserved.

   input.steps  [{id, carriers: [carrier id, ...]}]: each step's directly
       selected carriers (liveStatusStepCarriers(diagram, step, true)).

   options  Reserved for page-level telemetry settings; nothing is read today.

   Output
     {carriers: {id: {bound, jira, telemetry, verdict, label, failing, since: {doneAt, firstTrafficAt}}},
      rollups: {bound, unbound, proven, degraded, unproven, liveEarly},
      steps: {id: {verdict, label}}}
     verdict is a token such as 'proven' or 'done-unproven'; label is its display
     text ('PROVEN', 'DONE · UNPROVEN'); both are null when there is no verdict.
     proofVerdicts is the module's only global; everything else is private.

   Limits, per signal: `min` holds when value >= min. `max` holds when
   value <= max, or, with `maxRatioOf: other`, when value / other <= max (a
   zero denominator holds only for a zero numerator). A limit whose data has
   not arrived, or whose ratio names a signal the carrier does not bind, is
   pending. `failing` lists the limits that do not hold, in authored order.

   Rate-like signals carry traffic: a signal with a `min` limit, either side of
   a `maxRatioOf` ratio, or a per-time unit ('req/h', 'msg/s', 'events/min').

   Telemetry state, first match wins:
     unobserved  nothing observed yet
     silent      every rate-like signal observed and 0 across the window
     unobserved  rate-like signals exist but none shows traffic yet
     degraded    a limit does not hold
     unobserved  a limit is pending
     flowing     every limit holds */

var proofVerdicts = (function(){
  var PROOF_JIRA_STATES = ['todo', 'active', 'done', 'blocked', 'missing'];
  /* Rows: the carrier's Jira state; `none` is a carrier without tickets.
     Blocked and missing keep their Jira state; the overlay adds traffic cues. */
  var PROOF_MATRIX = {
    done: {silent: 'done-unproven', flowing: 'proven', degraded: 'done-degraded', unobserved: 'done'},
    active: {silent: 'active', flowing: 'active-live-early', degraded: 'active-failing', unobserved: 'active'},
    todo: {silent: 'todo', flowing: 'todo-already-live', degraded: 'todo-failing', unobserved: 'todo'},
    blocked: {silent: 'blocked', flowing: 'blocked', degraded: 'blocked', unobserved: 'blocked'},
    missing: {silent: 'missing', flowing: 'missing', degraded: 'missing', unobserved: 'missing'},
    none: {silent: 'unobserved', flowing: 'healthy', degraded: 'degraded', unobserved: null}
  };
  var PROOF_VERDICT_LABELS = {
    proven: 'PROVEN', 'done-unproven': 'DONE · UNPROVEN', 'done-degraded': 'DONE · DEGRADED', done: 'DONE',
    active: 'IN PROGRESS', 'active-live-early': 'IN PROGRESS · LIVE EARLY', 'active-failing': 'IN PROGRESS · FAILING',
    todo: 'TODO', 'todo-already-live': 'TODO · ALREADY LIVE?', 'todo-failing': 'TODO · FAILING',
    blocked: 'BLOCKED', missing: 'MISSING', unobserved: 'UNOBSERVED', healthy: 'HEALTHY', degraded: 'DEGRADED'
  };
  /* Rollup buckets are disjoint verdict sets; blocked, missing, pending and
     no-ticket healthy carriers count as bound only. */
  var PROOF_COUNTS = {
    proven: ['proven'],
    degraded: ['done-degraded', 'active-failing', 'todo-failing', 'degraded'],
    unproven: ['done-unproven'],
    liveEarly: ['active-live-early', 'todo-already-live']
  };
  /* Worst first: a step reads as degraded if any carrier is, then silent. */
  var PROOF_TELEMETRY_ORDER = ['degraded', 'silent', 'unobserved', 'flowing'];
  var PROOF_RATE_UNIT = /\/\s*(s|sec|second|m|min|minute|h|hr|hour|d|day)s?$/i;

  function proofObject(value){ return !!value && typeof value === 'object' && !Array.isArray(value); }
  function proofOwn(map, key){
    return proofObject(map) && typeof key === 'string' && Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined;
  }
  function proofNumber(value){ return typeof value === 'number' && isFinite(value) ? value : null; }
  function proofTime(value){
    var ms = typeof value === 'number' ? value : typeof value === 'string' ? Date.parse(value) : NaN;
    return isFinite(ms) ? ms : null;
  }
  function proofISO(ms){ return ms === null ? null : new Date(ms).toISOString(); }

  /* Same order as liveStatusRollup, with liveStatusPresentationRollup's rule
     that missing evidence ('unknown') never implies done or todo. */
  function proofJiraRollup(states){
    for (var i = 0; i < 3; i++){ var state = ['blocked', 'missing', 'active'][i]; if (states.indexOf(state) >= 0) return state; }
    if (states.indexOf('unknown') >= 0) return 'unknown';
    if (!states.length) return null;
    if (states.every(function(s){ return s === 'done'; })) return 'done';
    if (states.every(function(s){ return s === 'todo'; })) return 'todo';
    return 'active';
  }
  /* null without tickets; 'unknown' while a ticket has no recognised state. */
  function proofJira(tickets, jiraMap){
    var keys = (Array.isArray(tickets) ? tickets : []).filter(function(key){ return typeof key === 'string'; });
    return proofJiraRollup(keys.map(function(key){
      var entry = proofOwn(jiraMap, key);
      return proofObject(entry) && PROOF_JIRA_STATES.indexOf(entry.state) >= 0 ? entry.state : 'unknown';
    }));
  }
  /* The latest Done ticket starts the clock; unknown if any lacks updatedAt. */
  function proofDoneAt(tickets, jiraMap){
    var latest = null;
    for (var i = 0; i < tickets.length; i++){
      var entry = proofOwn(jiraMap, tickets[i]), at = proofObject(entry) && typeof entry.updatedAt === 'string' ? proofTime(entry.updatedAt) : null;
      if (at === null) return null;
      if (latest === null || at > latest) latest = at;
    }
    return latest;
  }

  function proofLabel(verdict){ return verdict === null ? null : PROOF_VERDICT_LABELS[verdict]; }
  function proofCell(jira, telemetry){
    var row = jira === null ? PROOF_MATRIX.none : proofOwn(PROOF_MATRIX, jira);
    var verdict = proofObject(row) ? proofOwn(row, telemetry) : undefined;
    return typeof verdict === 'string' ? verdict : null;
  }

  function proofSignals(carrier){
    var signals = proofObject(carrier) && proofObject(carrier.signals) ? carrier.signals : {};
    return Object.keys(signals).filter(function(name){ return proofObject(signals[name]); });
  }
  function proofReading(sample, name, unit){
    var entry = proofObject(sample) ? proofOwn(sample.signals, name) : undefined;
    if (!proofObject(entry)) return null;
    var points = (Array.isArray(entry.series) ? entry.series : []).filter(function(point){
      return Array.isArray(point) && proofNumber(point[1]) !== null;
    });
    var value = proofNumber(entry.value);
    if (value === null && points.length) value = points[points.length - 1][1];
    if (value === null) return null;
    return {value: value, points: points, unit: unit || (typeof entry.unit === 'string' ? entry.unit : ''),
      zero: value === 0 && points.every(function(point){ return point[1] === 0; })};
  }
  function proofRateLike(name, proof, unit){
    var limit = proofOwn(proof, name);
    if (proofObject(limit) && (proofNumber(limit.min) !== null || typeof limit.maxRatioOf === 'string')) return true;
    if (Object.keys(proof).some(function(other){ return proofObject(proof[other]) && proof[other].maxRatioOf === name; })) return true;
    return PROOF_RATE_UNIT.test(unit || '');
  }
  /* true, false, or null while its data is pending. */
  function proofLimit(limit, reading, readings){
    if (!reading) return null;
    var checks = [], min = proofNumber(limit.min), max = proofNumber(limit.max);
    if (min !== null) checks.push(reading.value >= min);
    if (typeof limit.maxRatioOf === 'string'){
      var base = proofOwn(readings, limit.maxRatioOf);
      if (max !== null) checks.push(!base ? null : base.value === 0 ? reading.value === 0 : reading.value / base.value <= max);
    } else if (max !== null) checks.push(reading.value <= max);
    if (checks.indexOf(false) >= 0) return false;
    return checks.indexOf(null) >= 0 ? null : true;
  }
  /* {state, failing, readings, rateLike} for a bound carrier; null when unbound. */
  function proofTelemetry(carrier, sample){
    var names = proofSignals(carrier);
    if (!names.length) return null;
    var proof = proofObject(carrier.proof) ? carrier.proof : {}, readings = Object.create(null), observed = 0;
    var rateLike = [], failing = [], pending = false;
    names.forEach(function(name){
      var declared = typeof carrier.signals[name].unit === 'string' ? carrier.signals[name].unit : '';
      var reading = proofReading(sample, name, declared);
      if (reading){ readings[name] = reading; observed++; }
      if (proofRateLike(name, proof, reading ? reading.unit : declared)) rateLike.push(name);
    });
    Object.keys(proof).forEach(function(name){
      if (!proofObject(proof[name])) return;
      var held = proofLimit(proof[name], names.indexOf(name) >= 0 ? readings[name] : null, readings);
      if (held === false) failing.push(name); else if (held === null) pending = true;
    });
    var traffic = rateLike.some(function(name){ return readings[name] && !readings[name].zero; });
    var silent = rateLike.length > 0 && rateLike.every(function(name){ return readings[name] && readings[name].zero; });
    var state = !observed ? 'unobserved' : silent ? 'silent' : rateLike.length && !traffic ? 'unobserved' :
      failing.length ? 'degraded' : pending ? 'unobserved' : 'flowing';
    return {state: state, failing: failing, readings: readings, rateLike: rateLike};
  }
  function proofFirstTraffic(judged, doneAt){
    var first = null;
    judged.rateLike.forEach(function(name){
      var reading = judged.readings[name];
      (reading ? reading.points : []).forEach(function(point){
        var at = proofTime(point[0]);
        if (at === null || !(point[1] > 0) || (doneAt !== null && at < doneAt)) return;
        if (first === null || at < first) first = at;
      });
    });
    return first;
  }

  /* Mirrors liveStatusStep: Jira axis by the live-status rollup over carriers
     with tickets, telemetry axis by the worst state, joined by the matrix.
     Unbound carriers do not vote; awaiting Jira evidence gives no verdict. */
  function proofStepVerdict(results){
    var bound = (Array.isArray(results) ? results : []).filter(function(result){ return proofObject(result) && result.bound === true; });
    if (!bound.length) return null;
    var jira = proofJiraRollup(bound.map(function(result){ return result.jira; }).filter(function(state){ return state !== null; }));
    if (jira === 'unknown') return null;
    for (var i = 0; i < PROOF_TELEMETRY_ORDER.length; i++){
      var state = PROOF_TELEMETRY_ORDER[i];
      if (bound.some(function(result){ return result.telemetry === state; })) return proofCell(jira, state);
    }
    return null;
  }

  function proofVerdicts(input, options){
    var page = proofObject(input) ? input : {};
    var jiraMap = proofObject(page.jiraMap) ? page.jiraMap : {}, telemetryMap = proofObject(page.telemetryMap) ? page.telemetryMap : {};
    var carriers = Object.create(null), steps = Object.create(null);
    var rollups = {bound: 0, unbound: 0, proven: 0, degraded: 0, unproven: 0, liveEarly: 0};
    (Array.isArray(page.carriers) ? page.carriers : []).forEach(function(carrier){
      if (!proofObject(carrier) || typeof carrier.id !== 'string' || !carrier.id || Object.prototype.hasOwnProperty.call(carriers, carrier.id)) return;
      var tickets = (Array.isArray(carrier.tickets) ? carrier.tickets : []).filter(function(key){ return typeof key === 'string'; });
      var jira = proofJira(tickets, jiraMap), doneAt = jira === 'done' ? proofDoneAt(tickets, jiraMap) : null;
      var judged = proofTelemetry(carrier, proofOwn(telemetryMap, carrier.id));
      var verdict = judged ? proofCell(jira, judged.state) : null;
      var result = {bound: !!judged, jira: jira, telemetry: judged ? judged.state : null,
        verdict: verdict, label: proofLabel(verdict), failing: judged ? judged.failing : [],
        since: {doneAt: proofISO(doneAt), firstTrafficAt: judged ? proofISO(proofFirstTraffic(judged, doneAt)) : null}};
      carriers[carrier.id] = result;
      rollups[result.bound ? 'bound' : 'unbound']++;
      Object.keys(PROOF_COUNTS).forEach(function(bucket){ if (PROOF_COUNTS[bucket].indexOf(result.verdict) >= 0) rollups[bucket]++; });
    });
    (Array.isArray(page.steps) ? page.steps : []).forEach(function(step){
      if (!proofObject(step) || typeof step.id !== 'string' || Object.prototype.hasOwnProperty.call(steps, step.id)) return;
      var ids = (Array.isArray(step.carriers) ? step.carriers : []).filter(function(id, index, all){
        return typeof id === 'string' && all.indexOf(id) === index && Object.prototype.hasOwnProperty.call(carriers, id);
      });
      var verdict = proofStepVerdict(ids.map(function(id){ return carriers[id]; }));
      steps[step.id] = {verdict: verdict, label: proofLabel(verdict)};
    });
    return {carriers: carriers, rollups: rollups, steps: steps};
  }
  return proofVerdicts;
})();
