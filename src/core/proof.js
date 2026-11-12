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
              'tempo', 'sql', 'honeycomb', 'cloudwatch', 'cloudwatchLogs'. A carrier
              with at least one numeric signal is bound. Trace signals are
              excluded; without numeric signals it is counted, never judged.
     proof    {name: {min, max, maxRatioOf}}, the limits below. Optional.

   input.jiraMap  The live-status runtime map, one entry per ticket key, as
       createLiveStatus().apply() keeps it:
       {KEY: {state: 'todo'|'active'|'testing'|'done'|'blocked'|'missing', updatedAt, ...}}

   input.telemetryMap  One sample per bound carrier id:
       {id: {signals: {name: {value, series: [[t, v], ...], unit}}, observedAt}}
     value    The adapter's headline number for the window. Without it the
              last finite series point stands in.
     series   Points across the window in ascending time; t is epoch
              milliseconds or an ISO string.
     Adapters distinguish successful empty counts from unobserved results. A
     signal with neither a finite value nor a finite point is unobserved.
     empty    true when the query succeeded but returned no data (#1404). Only
              end-to-end metrics reads it, as a measured 0; otherwise such a
              signal stays unobserved.

   input.steps  [{id, carriers: [carrier id, ...], tickets?}]: each step's
       directly selected carriers (liveStatusStepCarriers(diagram, step, true)).
       tickets, from a step ticketFilter, maps a carrier id to the tickets this
       step judges it by (trackingStepProofTickets); carrier verdicts keep their own.

   options  {endToEndMetrics}: page-level `tracking.endToEndMetrics` (#1404). Only
            the boolean true changes anything; see End-to-end metrics below.

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
     unmeasured  no observed signal has an authored finite minimum
     flowing     an observed finite minimum exists and every limit holds

   End-to-end metrics (options.endToEndMetrics === true, #1404): Jira is not an
   input. A signal sample {empty: true} without a value reads as 0; when that
   signal has a limit and is neither rate-like nor role "error", the carrier
   is unproven. jira is null, since.doneAt is null and step ticket narrowing is not
   used. A bound carrier is counted when at least one signal has a finite min or
   max limit; it then gets one verdict, first match wins:
     null       nothing observed yet, or a limit or rate-like signal is pending
     error      a signal with role "error" is outside its limit
     unproven   silent (0 across the window), or no traffic: a min not met or
                no observed authored minimum
     degraded   a max limit is breached while traffic flows (or no rate-like
                signal exists to say otherwise)
     proven     an observed minimum is met and every limit holds
   Order: null (nothing observed), error, unproven (silent), null (a rate-like
   signal pending), degraded, unproven (min not met, or an empty non-rate
   signal), null (a limit pending),
   unproven (no observed minimum), proven. Uncounted carriers have no verdict.
   Each carrier gains counted: true|false; the output gains
     endToEnd {counted, proven, complete, headline, degraded, error, unproven,
               unmeasured, uncounted}
   where the lists hold carrier ids, complete is true only when every counted
   carrier is proven (counted > 0), and headline is 'End to end proven', 'N of M
   proven', or null when no carrier is counted (nothing is claimed). rollups
   count proven, degraded and unproven verdicts; error carriers are left to the
   presentation's error count (#1201). A step takes the worst of its counted
   carriers: error, degraded, unproven, then null if any is pending, else
   proven. */

var proofVerdicts = (function(){
  function isTraceSignal(s){ return !!s && (s.source === 'tempo' || s.source === 'honeycomb' && proofObject(s.query) && Object.prototype.hasOwnProperty.call(s.query, 'query_spec')); }
  var PROOF_JIRA_STATES = ['todo', 'active', 'testing', 'done', 'blocked', 'missing'];
  /* Rows: the carrier's Jira state; `none` is a carrier without tickets.
     Blocked and missing keep their Jira state; the overlay adds traffic cues. */
  var PROOF_MATRIX = {
    done: {silent: 'done-unproven', flowing: 'proven', degraded: 'done-degraded', unobserved: 'done'},
    active: {silent: 'active', flowing: 'active-live-early', degraded: 'active-failing', unobserved: 'active'},
    testing: {silent: 'testing', flowing: 'testing-live-early', degraded: 'testing-failing', unobserved: 'testing'},
    todo: {silent: 'todo', flowing: 'todo-already-live', degraded: 'todo-failing', unobserved: 'todo'},
    blocked: {silent: 'blocked', flowing: 'blocked', degraded: 'blocked', unobserved: 'blocked'},
    missing: {silent: 'missing', flowing: 'missing', degraded: 'missing', unobserved: 'missing'},
    none: {silent: 'unobserved', flowing: 'healthy', degraded: 'degraded', unobserved: null}
  };
  var PROOF_VERDICT_LABELS = {
    proven: 'PROVEN', 'done-unproven': 'DONE · UNPROVEN', 'done-degraded': 'DONE · DEGRADED', done: 'DONE',
    active: 'IN PROGRESS', 'active-live-early': 'IN PROGRESS · LIVE EARLY', 'active-failing': 'IN PROGRESS · FAILING',
    testing: 'TESTING', 'testing-live-early': 'TESTING · LIVE EARLY', 'testing-failing': 'TESTING · FAILING',
    todo: 'TODO', 'todo-already-live': 'TODO · ALREADY LIVE?', 'todo-failing': 'TODO · FAILING',
    blocked: 'BLOCKED', missing: 'MISSING', unobserved: 'UNOBSERVED', healthy: 'HEALTHY', degraded: 'DEGRADED'
  };
  /* Rollup buckets are disjoint verdict sets; blocked, missing, pending and
     no-ticket healthy carriers count as bound only. */
  var PROOF_COUNTS = {
    proven: ['proven'],
    degraded: ['done-degraded', 'active-failing', 'testing-failing', 'todo-failing', 'degraded'],
    unproven: ['done-unproven'],
    liveEarly: ['active-live-early', 'testing-live-early', 'todo-already-live']
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
    for (var i = 0; i < 4; i++){ var state = ['blocked', 'missing', 'active', 'testing'][i]; if (states.indexOf(state) >= 0) return state; }
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

  PROOF_VERDICT_LABELS.unproven = 'UNPROVEN';
  PROOF_VERDICT_LABELS.error = 'ERROR';
  var PROOF_END_TO_END_COUNTS = {proven: ['proven'], degraded: ['degraded'], unproven: ['unproven']};

  Object.keys(PROOF_MATRIX).forEach(function(jira){ PROOF_MATRIX[jira].unmeasured = jira === 'done' ? 'done-traffic-unmeasured' : jira === 'none' ? null : jira; });
  PROOF_VERDICT_LABELS['done-traffic-unmeasured'] = 'DONE · traffic not measured';
  PROOF_TELEMETRY_ORDER.splice(2, 0, 'unmeasured');

  function proofLabel(verdict){ return verdict === null ? null : PROOF_VERDICT_LABELS[verdict]; }
  function proofCell(jira, telemetry){
    var row = jira === null ? PROOF_MATRIX.none : proofOwn(PROOF_MATRIX, jira);
    var verdict = proofObject(row) ? proofOwn(row, telemetry) : undefined;
    return typeof verdict === 'string' ? verdict : null;
  }

  function proofSignals(carrier){
    var signals = proofObject(carrier) && proofObject(carrier.signals) ? carrier.signals : {};
    return Object.keys(signals).filter(function(name){ return proofObject(signals[name]) && !isTraceSignal(signals[name]); });
  }
  function proofReading(sample, name, unit, emptyIsZero){
    var entry = proofObject(sample) ? proofOwn(sample.signals, name) : undefined;
    if (!proofObject(entry)) return null;
    var points = (Array.isArray(entry.series) ? entry.series : []).filter(function(point){
      return Array.isArray(point) && proofNumber(point[1]) !== null;
    });
    var value = proofNumber(entry.value);
    if (value === null && points.length) value = points[points.length - 1][1];
    var empty = value === null && emptyIsZero === true && entry.empty === true;
    if (empty) value = 0;
    if (value === null) return null;
    return {value: value, points: points, unit: unit || (typeof entry.unit === 'string' ? entry.unit : ''),
      zero: value === 0 && points.every(function(point){ return point[1] === 0; }), empty: empty};
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
  function proofTelemetry(carrier, sample, emptyIsZero){
    var names = proofSignals(carrier);
    if (!names.length) return null;
    var proof = {}, authored = proofObject(carrier.proof) ? carrier.proof : {}, readings = Object.create(null), observed = 0;
    Object.keys(authored).forEach(function(name){var limit=authored[name];if(!isTraceSignal(carrier.signals[name]) && !(proofObject(limit) && isTraceSignal(carrier.signals[limit.maxRatioOf])))proof[name]=limit;});
    var rateLike = [], failing = [], pending = false;
    names.forEach(function(name){
      var declared = typeof carrier.signals[name].unit === 'string' ? carrier.signals[name].unit : '';
      var reading = proofReading(sample, name, declared, emptyIsZero);
      if (reading){ readings[name] = reading; observed++; }
      if (proofRateLike(name, proof, reading ? reading.unit : declared)) rateLike.push(name);
    });
    Object.keys(proof).forEach(function(name){
      if (!proofObject(proof[name]) || isTraceSignal(carrier.signals[name])) return;
      var held = proofLimit(proof[name], names.indexOf(name) >= 0 ? readings[name] : null, readings);
      if (held === false) failing.push(name); else if (held === null) pending = true;
    });
    var traffic = rateLike.some(function(name){ return readings[name] && !readings[name].zero; });
    var silent = rateLike.length > 0 && rateLike.every(function(name){ return readings[name] && readings[name].zero; });
    var minimumObserved = rateLike.some(function(name){ return readings[name] && proofObject(proof[name]) && proofNumber(proof[name].min) !== null; });
    var state = !observed ? 'unobserved' : silent ? 'silent' : rateLike.length && !traffic ? 'unobserved' :
      failing.length ? 'degraded' : pending ? 'unobserved' : !minimumObserved ? 'unmeasured' : 'flowing';
    // #1404: an empty answer is a measured 0 only for traffic (rate-like) and error-role signals; any
    // other limited signal that came back empty (a latency) proves nothing, so the carrier is unproven.
    // A signal without a proof limit (a display-only gauge) never affects Proof.
    var emptyEvidence = names.some(function(name){
      return readings[name] && readings[name].empty && proofObject(proof[name]) && rateLike.indexOf(name) < 0 && carrier.signals[name].role !== 'error';
    });
    return {state: state, minimumObserved: minimumObserved, failing: failing, readings: readings, rateLike: rateLike,
      proof: proof, observed: observed, pending: pending, traffic: traffic, emptyEvidence: emptyEvidence};
  }
  /* #1404: a max limit (plain or ratio) that does not hold; min failures are not breaches. */
  function proofMaxBreached(limit, reading, readings){
    var max = proofNumber(limit.max);
    if (max === null || !reading) return false;
    if (typeof limit.maxRatioOf !== 'string') return reading.value > max;
    var base = proofOwn(readings, limit.maxRatioOf);
    return !!base && (base.value === 0 ? reading.value !== 0 : reading.value / base.value > max);
  }
  function proofCounted(judged){
    return !!judged && Object.keys(judged.proof).some(function(name){
      var limit = judged.proof[name];
      return proofObject(limit) && (proofNumber(limit.min) !== null || proofNumber(limit.max) !== null);
    });
  }
  function proofEndToEndVerdict(carrier, judged){
    if (!judged.observed) return null;
    if (judged.failing.some(function(name){ return proofObject(carrier.signals[name]) && carrier.signals[name].role === 'error'; })) return 'error';
    if (judged.state === 'silent') return 'unproven';
    if (judged.rateLike.length && !judged.traffic) return null;
    if (judged.failing.some(function(name){ return proofMaxBreached(judged.proof[name], judged.readings[name], judged.readings); })) return 'degraded';
    if (judged.failing.length || judged.emptyEvidence) return 'unproven';
    if (judged.pending) return null;
    return judged.minimumObserved ? 'proven' : 'unproven';
  }
  function proofEndToEndStep(results){
    var counted = results.filter(function(result){ return proofObject(result) && result.counted === true; });
    if (!counted.length) return null;
    var worst = ['error', 'degraded', 'unproven'].filter(function(verdict){
      return counted.some(function(result){ return result.verdict === verdict; });
    })[0];
    if (worst) return worst;
    return counted.every(function(result){ return result.verdict === 'proven'; }) ? 'proven' : null;
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
      if (bound.some(function(result){ return result.telemetry === state; })){
        if(jira === 'done' && state === 'unobserved' && bound.some(function(result){return result.verdict === 'done-traffic-unmeasured';}))return 'done-traffic-unmeasured';
        return proofCell(jira, state);
      }
    }
    return null;
  }

  function proofVerdicts(input, options){
    var page = proofObject(input) ? input : {};
    var jiraMap = proofObject(page.jiraMap) ? page.jiraMap : {}, telemetryMap = proofObject(page.telemetryMap) ? page.telemetryMap : {};
    var carriers = Object.create(null), steps = Object.create(null);
    var rollups = {bound: 0, unbound: 0, proven: 0, degraded: 0, unproven: 0, liveEarly: 0};
    var inputs = Object.create(null), endToEnd = proofObject(options) && options.endToEndMetrics === true;
    function judgeEndToEnd(carrier){
      var judged = proofTelemetry(carrier, proofOwn(telemetryMap, carrier.id), true), counted = proofCounted(judged);
      var verdict = counted ? proofEndToEndVerdict(carrier, judged) : null;
      return {bound: !!judged, jira: null, telemetry: judged ? judged.state : null,
        verdict: verdict, label: proofLabel(verdict), failing: judged ? judged.failing : [], counted: counted,
        since: {doneAt: null, firstTrafficAt: judged ? proofISO(proofFirstTraffic(judged, null)) : null}};
    }
    function judge(carrier, list){
      if (endToEnd) return judgeEndToEnd(carrier);
      var tickets = (Array.isArray(list) ? list : []).filter(function(key){ return typeof key === 'string'; });
      var jira = proofJira(tickets, jiraMap), doneAt = jira === 'done' ? proofDoneAt(tickets, jiraMap) : null;
      var judged = proofTelemetry(carrier, proofOwn(telemetryMap, carrier.id));
      var verdict = judged ? proofCell(jira, judged.state) : null;
      if(verdict === 'done' && !judged.minimumObserved)verdict = 'done-traffic-unmeasured';
      return {bound: !!judged, jira: jira, telemetry: judged ? judged.state : null,
        verdict: verdict, label: proofLabel(verdict), failing: judged ? judged.failing : [],
        since: {doneAt: proofISO(doneAt), firstTrafficAt: judged ? proofISO(proofFirstTraffic(judged, doneAt)) : null}};
    }
    (Array.isArray(page.carriers) ? page.carriers : []).forEach(function(carrier){
      if (!proofObject(carrier) || typeof carrier.id !== 'string' || !carrier.id || Object.prototype.hasOwnProperty.call(carriers, carrier.id)) return;
      var result = judge(carrier, carrier.tickets);
      carriers[carrier.id] = result;inputs[carrier.id] = carrier;
      rollups[result.bound ? 'bound' : 'unbound']++;
      var buckets = endToEnd ? PROOF_END_TO_END_COUNTS : PROOF_COUNTS;
      Object.keys(buckets).forEach(function(bucket){ if (buckets[bucket].indexOf(result.verdict) >= 0) rollups[bucket]++; });
    });
    (Array.isArray(page.steps) ? page.steps : []).forEach(function(step){
      if (!proofObject(step) || typeof step.id !== 'string' || Object.prototype.hasOwnProperty.call(steps, step.id)) return;
      var ids = (Array.isArray(step.carriers) ? step.carriers : []).filter(function(id, index, all){
        return typeof id === 'string' && all.indexOf(id) === index && Object.prototype.hasOwnProperty.call(carriers, id);
      });
      var narrowed = !endToEnd && proofObject(step.tickets) ? step.tickets : null;
      var results = ids.map(function(id){
        return narrowed && Object.prototype.hasOwnProperty.call(narrowed, id) ? judge(inputs[id], narrowed[id]) : carriers[id];
      });
      var verdict = endToEnd ? proofEndToEndStep(results) : proofStepVerdict(results);
      steps[step.id] = {verdict: verdict, label: proofLabel(verdict)};
    });
    var output = {carriers: carriers, rollups: rollups, steps: steps};
    if (endToEnd) output.endToEnd = proofEndToEndSummary(carriers);
    return output;
  }
  function proofEndToEndSummary(carriers){
    var summary = {counted: 0, proven: 0, complete: false, headline: null, degraded: [], error: [], unproven: [], unmeasured: [], uncounted: []};
    Object.keys(carriers).forEach(function(id){
      var result = carriers[id];
      if (!result.bound) return;
      if (!result.counted){ summary.uncounted.push(id); return; }
      summary.counted++;
      if (result.verdict === 'proven') summary.proven++;
      else if (result.verdict === null) summary.unmeasured.push(id);
      else summary[result.verdict].push(id);
    });
    summary.complete = summary.counted > 0 && summary.proven === summary.counted;
    summary.headline = !summary.counted ? null : summary.complete ? 'End to end proven' : summary.proven + ' of ' + summary.counted + ' proven';
    return summary;
  }
  proofVerdicts.isTraceSignal = isTraceSignal;
  proofVerdicts.counts = JSON.parse(JSON.stringify(PROOF_COUNTS));
  return proofVerdicts;
})();
