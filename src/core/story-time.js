/* Story time: a diagram-level clock that steps move and time-bearing panels
   inherit. Pure and DOM-free. Times are floating local wall-clock values kept
   as UTC milliseconds so calendar arithmetic never sees time zones or DST.
   Uses specObject() and diagramPathList() at call time. See docs/step-time.md. */

var STORY_CLOCK_FORMATS = ['12h', '24h'];
var STORY_DATE_FORMATS = ['short', 'long', 'iso', 'none'];
var STORY_BATTERY_DEFAULTS = {drainPerHour: 1, chargePerHour: 20};
var STORY_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
var STORY_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

function storyTimeAbsolute(value){
  if (typeof value !== 'string') return null;
  var m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!m) return null;
  var y = +m[1], mo = +m[2], d = +m[3], h = +m[4], mi = +m[5], s = m[6] == null ? 0 : +m[6];
  if (mo < 1 || mo > 12 || d < 1 || h > 23 || mi > 59 || s > 59) return null;
  var ms = Date.UTC(y, mo - 1, d, h, mi, s);
  return new Date(ms).getUTCDate() === d ? ms : null;
}
/* "+1d2h30m15s": ordered units, at least one, whole numbers. */
function storyTimeDuration(value, signed){
  if (typeof value !== 'string') return null;
  var m = (signed ? /^\+(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/ : /^(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/).exec(value.trim());
  if (!m || (m[1] == null && m[2] == null && m[3] == null && m[4] == null)) return null;
  return (((+(m[1] || 0) * 24 + +(m[2] || 0)) * 60 + +(m[3] || 0)) * 60 + +(m[4] || 0)) * 1000;
}
/* Resolve one step's time against the previous time. Returns null when the
   value is not a recognized form (the caller keeps the previous time). */
function storyTimeResolve(value, previous){
  if (typeof value !== 'string') return null;
  var rel = storyTimeDuration(value, true);
  if (rel != null) return previous + rel;
  var abs = storyTimeAbsolute(value);
  if (abs != null) return abs;
  var m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!m || +m[1] > 23 || +m[2] > 59 || (m[3] != null && +m[3] > 59)) return null;
  var day = 86400000, of = ((+m[1] * 60 + +m[2]) * 60 + +(m[3] || 0)) * 1000;
  var base = Math.floor(previous / day) * day + of;
  return base >= previous ? base : base + day;
}

/* The normalized diagram-level declaration, or null when story time is off. */
function storyTimeConfig(d){
  var raw = d && d.storyTime;
  if (!specObject(raw)) return null;
  var start = storyTimeAbsolute(raw.start);
  if (start == null) return null;
  var end = storyTimeAbsolute(raw.end), span = storyTimeDuration(raw.span, false);
  if (end == null && span != null) end = start + span;
  if (end != null && end <= start) end = null;
  return {
    start: start, end: end,
    clock: STORY_CLOCK_FORMATS.indexOf(raw.clock) >= 0 ? raw.clock : '12h',
    date: STORY_DATE_FORMATS.indexOf(raw.date) >= 0 ? raw.date : 'short'
  };
}

/* Per-step times for the (already path-projected) steps. `times[i]` is the
   story time at step i; `previous[i]` the time before it (start for step 0). */
function storyTimeSequence(d, config){
  config = config || storyTimeConfig(d);
  if (!config) return null;
  var now = config.start, times = [], previous = [];
  (Array.isArray(d.steps) ? d.steps : []).forEach(function(st){
    previous.push(now);
    var next = st && st.time != null ? storyTimeResolve(st.time, now) : null;
    if (next != null) now = next;
    times.push(now);
  });
  return {config: config, times: times, previous: previous};
}

function storyTimeParts(ms){
  var t = new Date(ms);
  return {y: t.getUTCFullYear(), mo: t.getUTCMonth(), d: t.getUTCDate(), wd: t.getUTCDay(),
    h: t.getUTCHours(), mi: t.getUTCMinutes()};
}
function storyTimePad(n){ return (n < 10 ? '0' : '') + n; }
function storyTimeClock(ms, format){
  var p = storyTimeParts(ms);
  return (format === '24h' ? storyTimePad(p.h) : String(p.h % 12 || 12)) + ':' + storyTimePad(p.mi);
}
function storyTimeDate(ms, format){
  var p = storyTimeParts(ms);
  if (format === 'none') return null;
  if (format === 'iso') return p.y + '-' + storyTimePad(p.mo + 1) + '-' + storyTimePad(p.d);
  if (format === 'long') return STORY_DAYS[p.wd] + ', ' + STORY_MONTHS[p.mo] + ' ' + p.d;
  return STORY_DAYS[p.wd].slice(0, 3) + ', ' + STORY_MONTHS[p.mo].slice(0, 3) + ' ' + p.d;
}
/* An empty story still previews one snapshot: the start. */
function storyTimeAt(story, i){
  return i < story.times.length ? {time: story.times[i], previous: story.previous[i]}
    : {time: story.config.start, previous: story.config.start};
}
/* Author-facing summary, e.g. "Thu, Sep 24 · 22:30". */
function storyTimeLabel(ms, config){
  config = config || {};
  var date = storyTimeDate(ms, config.date === 'none' || config.date == null ? 'short' : config.date);
  return date + ' · ' + storyTimeClock(ms, config.clock || '12h') + (config.clock === '24h' ? '' : (storyTimeParts(ms).h < 12 ? ' AM' : ' PM'));
}

/* Derived-field provenance for inspectors. Snapshots are fresh per fold, so a
   WeakMap attaches metadata without changing any snapshot's shape. */
var STORY_TIME_DERIVED = typeof WeakMap === 'function' ? new WeakMap() : null;
function storyTimeMark(snapshot, key, kind){
  if (!STORY_TIME_DERIVED || !snapshot || typeof snapshot !== 'object') return;
  var marks = STORY_TIME_DERIVED.get(snapshot);
  if (!marks){ marks = Object.create(null); STORY_TIME_DERIVED.set(snapshot, marks); }
  marks[key] = kind;
}
function storyTimeDerived(snapshot, key){
  var marks = STORY_TIME_DERIVED && snapshot && typeof snapshot === 'object' ? STORY_TIME_DERIVED.get(snapshot) : null;
  return marks && marks[key] || null;
}

/* Shared clock/date overlay for time-bearing panels. Explicit values pin a
   field until a later step moves story time; enterOnce values last one step. */
function storyTimeClockOverlay(panel, states, steps, story){
  var own = function(o, k){ return specObject(o) && Object.prototype.hasOwnProperty.call(o, k) && typeof o[k] === 'string'; };
  var pinned = {clock: false, date: false};
  ['clock', 'date'].forEach(function(key){ if (own(panel.initial, key)) pinned[key] = true; });
  states.forEach(function(state, i){
    if (!state) return;
    var at = storyTimeAt(story, i);
    var patch = (stepPanelPatch(steps[i]) || {})[panel.id], once = specObject(patch) ? patch.enterOnce : null;
    if (at.time !== at.previous) pinned = {clock: false, date: false};
    ['clock', 'date'].forEach(function(key){
      if (own(patch, key)) pinned[key] = true;
      if (pinned[key] || own(once, key)) return;
      var value = key === 'clock' ? storyTimeClock(at.time, story.config.clock) : storyTimeDate(at.time, story.config.date);
      if (value == null) delete state[key];
      else { state[key] = value; storyTimeMark(state, key, 'story'); }
    });
  });
  return states;
}

function storyTimeRate(value){ return typeof value === 'number' && isFinite(value) && value >= 0 ? value : null; }
/* Panel → diagram → built-in, per constant. */
function storyBatteryConstants(panel, d){
  var shared = d && specObject(d.deviceDefaults) && specObject(d.deviceDefaults.battery) ? d.deviceDefaults.battery : {};
  var out = {};
  Object.keys(STORY_BATTERY_DEFAULTS).forEach(function(key){
    var own = storyTimeRate(panel && panel[key]), diagram = storyTimeRate(shared[key]);
    out[key] = own != null ? own : diagram != null ? diagram : STORY_BATTERY_DEFAULTS[key];
  });
  return out;
}

/* Diagram-level warnings; `d.steps` is the complete source registry. */
function storyTimeWarnings(d, DP, warnings){
  var raw = d.storyTime, steps = Array.isArray(d.steps) ? d.steps : [];
  var config = null;
  if (raw != null){
    var SP = DP + '.storyTime';
    if (!specObject(raw)) warnings.push(SP + ': expected {start, end?, span?, clock?, date?} — story time is off');
    else {
      if (storyTimeAbsolute(raw.start) == null)
        warnings.push(SP + '.start: expected a date-time such as "2026-09-24T22:30" — story time is off');
      if (raw.end != null && storyTimeAbsolute(raw.end) == null)
        warnings.push(SP + '.end: expected a date-time such as "2026-09-25T07:00" — ignored');
      else if (raw.end != null && storyTimeAbsolute(raw.start) != null && storyTimeAbsolute(raw.end) <= storyTimeAbsolute(raw.start))
        warnings.push(SP + '.end: must be after start — ignored');
      if (raw.span != null && storyTimeDuration(raw.span, false) == null)
        warnings.push(SP + '.span: expected a duration such as "9h" or "1d2h30m" — ignored');
      if (raw.clock != null && STORY_CLOCK_FORMATS.indexOf(raw.clock) < 0)
        warnings.push(SP + '.clock: unknown clock "' + raw.clock + '" — using 12h (valid: ' + STORY_CLOCK_FORMATS.join(' ') + ')');
      if (raw.date != null && STORY_DATE_FORMATS.indexOf(raw.date) < 0)
        warnings.push(SP + '.date: unknown date format "' + raw.date + '" — using short (valid: ' + STORY_DATE_FORMATS.join(' ') + ')');
      Object.keys(raw).forEach(function(key){
        if (['start', 'end', 'span', 'clock', 'date'].indexOf(key) < 0)
          warnings.push(SP + '.' + key + ': unknown story time field — ignored (valid: start end span clock date)');
      });
      config = storyTimeConfig(d);
    }
  }
  var defaults = d.deviceDefaults;
  if (defaults != null){
    if (!specObject(defaults)) warnings.push(DP + '.deviceDefaults: expected {battery: {drainPerHour?, chargePerHour?}} — ignored');
    else Object.keys(defaults).forEach(function(kind){
      var KP = DP + '.deviceDefaults.' + kind;
      if (kind !== 'battery'){ warnings.push(KP + ': unknown device kind — ignored (valid: battery)'); return; }
      if (!specObject(defaults.battery)){ warnings.push(KP + ': expected {drainPerHour?, chargePerHour?} — ignored'); return; }
      Object.keys(defaults.battery).forEach(function(key){
        if (!Object.prototype.hasOwnProperty.call(STORY_BATTERY_DEFAULTS, key))
          warnings.push(KP + '.' + key + ': unknown battery constant — ignored (valid: drainPerHour chargePerHour)');
        else if (storyTimeRate(defaults.battery[key]) == null)
          warnings.push(KP + '.' + key + ': expected a number ≥ 0 (percent per hour) — using ' + STORY_BATTERY_DEFAULTS[key]);
      });
    });
  }
  steps.forEach(function(st, i){
    if (!st || st.time == null) return;
    var TP = DP + '.steps[' + i + '].time';
    if (!config) warnings.push(TP + ': ignored — declare diagram.storyTime.start to give steps a time');
    else if (storyTimeResolve(st.time, config.start) == null)
      warnings.push(TP + ': "' + String(st.time) + '" is not a time — use "+3h19m", "23:10" or "2026-09-24T23:10"; the previous time is kept');
  });
  if (!config) return;
  /* Paths fold separately, so ordering is checked per path; a shared step
     reports each path once, and an unlisted registry step not at all. */
  var paths = diagramPathList(d), reported = Object.create(null);
  paths.forEach(function(path){
    var story = storyTimeSequence({steps: path.indices.map(function(i){ return steps[i]; })}, config);
    story.times.forEach(function(t, n){
      var i = path.indices[n], label = paths.length > 1 ? ' on path "' + path.id + '"' : '';
      if (t < story.previous[n] && !reported['back:' + i + label]){
        reported['back:' + i + label] = true;
        warnings.push(DP + '.steps[' + i + '].time: time goes backward' + label + ' (' + storyTimeLabel(story.previous[n], config) + ' → ' + storyTimeLabel(t, config) + ')');
      }
      if (config.end != null && t > config.end && !reported['end:' + i]){
        reported['end:' + i] = true;
        warnings.push(DP + '.steps[' + i + '].time: ' + storyTimeLabel(t, config) + ' is after the story end (' + storyTimeLabel(config.end, config) + ')');
      }
    });
  });
}
