/* validator.js — constants, helpers, normalize/validate, panel-state folding.
   Browser-pure fragment: build.py wraps it (with engine.js + a boot file) in one
   IIFE. Contains no DOM access, so tests load it under Node via vm. */

var W = 1180, CARD_H = 54, FLOAT_H = 44, ROW_GAP = 140, STACK_GAP = 46;
var LEFT_X = 110, RIGHT_X = 885;
var ICON_SET = ['terminal','cloud','shield','gear','db','antenna','thermo','pump','router','package','key','server','chip','phone','house','camera','doorbell','lock','bulb','car'];
var TINT_SET = ['cmd','auth','data','mqtt','dev'];
/* Per-step node state is semantic narrative state, never an authored color.
   `base` is the explicit clearing token; null clears too. */
var TONE_SET = ['alert','warn','ok','dim','base'];
var VIEW_SET = ['ambient','step','ambient-only'];
var PANEL_TYPES = ['state','leds','gauge','log','screen','waterfall','orbit','zoneframe','xray','queue','pir','thermo','battery','buffer','radar','homemap','signal','tiles','inflight','phone','timeline','table','checks','budget','trace','replicas'];
var TABLE_STATUSES = ['neutral','added','changed','removed'];
var CHECK_STATUSES = ['pending','pass','fail','warn','skip'];

/* Shared, pure parent-link tolerance for layout, validation and the inspector.
   Inspect all chains before dropping cyclic links so declaration order cannot
   decide which cycle member becomes the outer box. Incoming links survive. */
function sanitizedGroupParents(groups, ignored){
  groups = groups && typeof groups === 'object' ? groups : {};
  var parents = Object.create(null), cyclic = [];
  Object.keys(groups).forEach(function(key){
    var meta = groups[key], reason;
    if (!meta || !Object.prototype.hasOwnProperty.call(meta, 'parent')) return;
    var parent = meta.parent;
    if (typeof parent !== 'string') reason = 'must be a string — parent ignored';
    else if (parent === key) reason = 'a group cannot contain itself — parent ignored';
    else if (!Object.prototype.hasOwnProperty.call(groups, parent))
      reason = 'unknown group "' + parent + '" — parent ignored';
    if (reason){ if (ignored) ignored(key, reason); }
    else parents[key] = parent;
  });
  Object.keys(parents).forEach(function(key){
    var seen = Object.create(null), cursor = key;
    while (cursor !== undefined && !seen[cursor]){
      seen[cursor] = true;
      cursor = parents[cursor];
    }
    if (cursor === key) cyclic.push(key);
  });
  cyclic.forEach(function(key){
    delete parents[key];
    if (ignored) ignored(key, 'parent chain loops — parent ignored');
  });
  return parents;
}

/* Never calculate an apparently precise trace breakdown from malformed or
   cyclic data. Partial, structurally sound traces remain inspectable. */
function tracePanelData(p){
  var spans=Array.isArray(p.spans)?p.spans:[], errors=[], notices=[], byId=new Map();
  if (!spans.length || spans.length>200) return {spans:[],errors:['spans: expected 1–200 spans; timing unavailable'],notices:[]};
  spans.forEach(function(s,i){
    var at='spans['+i+']';
    if (!s || typeof s!=='object'){ errors.push(at+': expected a span object'); return; }
    ['id','service','name'].forEach(function(k){
      if (typeof s[k]!=='string' || !s[k].trim()) errors.push(at+'.'+k+': expected a non-empty string');
    });
    if (byId.has(s.id)) errors.push(at+'.id: duplicate span id');
    byId.set(s.id,s);
    if (s.parentId!=null && typeof s.parentId!=='string') errors.push(at+'.parentId: expected a string or null');
    if (!isFiniteNum(s.ms) || s.ms<0) errors.push(at+'.ms: expected a finite non-negative duration');
    if (!isFiniteNum(s.startMs) || s.startMs<0 || !isFiniteNum(s.startMs+s.ms)) errors.push(at+'.startMs: expected a finite non-negative offset and end');
  });
  if (errors.length) return {spans:[],errors:errors,notices:[]};
  var missing=0, skew=0;
  spans.forEach(function(s){
    var seen=new Set([s.id]), parent=s.parentId;
    while (parent && byId.has(parent)){
      if (seen.has(parent)){ errors.push('spans: parent cycle at '+s.id); break; }
      seen.add(parent); parent=byId.get(parent).parentId;
    }
    var p=byId.get(s.parentId);
    if (s.parentId && !p) missing++;
    if (p && (s.startMs<p.startMs || s.startMs+s.ms>p.startMs+p.ms+.001)) skew++;
  });
  if (missing) notices.push(missing+' span(s) have missing parents; coverage is partial.');
  if (skew) notices.push(skew+' child span(s) extend beyond their parent; coverage clips these intervals, while timing rows retain the original offsets.');
  return {spans:errors.length?[]:spans.slice(),errors:errors,notices:notices};
}
function tracePanelPatchWarnings(state,path,p,warnings){
  if (state==null) return;
  if (!panelObject(state)){ warnings.push(path+': expected a state object'); return; }
  if (state.selected!=null && !(Array.isArray(p.spans) && p.spans.some(function(s){ return s && s.id===state.selected; })))
    warnings.push(path+'.selected: no matching span; timing unavailable');
  if (state.enterOnce!=null){
    if (!panelObject(state.enterOnce)) warnings.push(path+'.enterOnce: expected an object');
    else {
      var once=Object.assign({},state.enterOnce); delete once.enterOnce;
      tracePanelPatchWarnings(once,path+'.enterOnce',p,warnings);
    }
  }
}

/* Software panels carry authored snapshots, not executable rules or live
   telemetry. These helpers are shared with their defensive render models. */
function panelObject(v){ return !!v && typeof v === 'object' && !Array.isArray(v); }
function panelOwn(obj, key){ return panelObject(obj) && Object.prototype.hasOwnProperty.call(obj, key); }
var REPLICA_STATUSES = ['online','offline','unknown'];
function replicaPosition(v){ return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null; }
function replicaSeries(v){ return typeof v === 'string' && v.trim() ? v : null; }
function replicaCursor(v){
  return panelObject(v) && replicaSeries(v.series) !== null && replicaPosition(v.position) !== null
    ? {series:v.series, position:v.position} : null;
}
function replicaPanelItems(p){
  var seen = Object.create(null);
  return (Array.isArray(p.replicas) ? p.replicas : []).slice(0,8).filter(function(r){
    if (!panelObject(r) || typeof r.id !== 'string' || !r.id.trim() || seen[r.id]) return false;
    seen[r.id] = true; return true;
  });
}
function replicaPatchWarnings(state, path, p, warnings){
  if (state == null) return;
  if (!panelObject(state)){ warnings.push(path+': expected a state object'); return; }
  function cursor(v, at){
    if (v == null) return;
    if (!panelObject(v)){ warnings.push(at+': expected an object or null — position unknown'); return; }
    if (v.position != null && replicaPosition(v.position) === null)
      warnings.push(at+'.position: expected a non-negative safe integer or null — position unknown');
    if (v.series != null && replicaSeries(v.series) === null)
      warnings.push(at+'.series: expected a non-empty sequence identity or null — comparison unavailable');
  }
  cursor(state.reference, path+'.reference');
  if (state.replicas != null){
    if (!panelObject(state.replicas)) warnings.push(path+'.replicas: expected a snapshot keyed by replica id');
    else {
      var ids = replicaPanelItems(p).map(function(r){ return r.id; });
      Object.keys(state.replicas).forEach(function(id){
        var at = path+'.replicas.'+id, r = state.replicas[id];
        if (ids.indexOf(id) < 0){ warnings.push(at+': unknown replica — ignored'); return; }
        cursor(r,at);
        if (!panelObject(r)) return;
        if (r.status != null && REPLICA_STATUSES.indexOf(r.status) < 0)
          warnings.push(at+'.status: expected online|offline|unknown — using unknown');
        if (r.lagMs != null && (!isFiniteNum(r.lagMs) || r.lagMs < 0))
          warnings.push(at+'.lagMs: expected finite non-negative milliseconds or null — reported lag unknown');
        ['role','observedAt'].forEach(function(k){
          if (r[k] != null && typeof r[k] !== 'string') warnings.push(at+'.'+k+': expected a string or null — ignored');
        });
      });
    }
  }
  if (state.note != null && typeof state.note !== 'string') warnings.push(path+'.note: expected a string or null — ignored');
  if (state.enterOnce != null){
    if (!panelObject(state.enterOnce)) warnings.push(path+'.enterOnce: expected an object');
    else { var once = Object.assign({},state.enterOnce); delete once.enterOnce; replicaPatchWarnings(once,path+'.enterOnce',p,warnings); }
  }
}
function replicaPanelWarnings(p,path,warnings){
  if (!Array.isArray(p.replicas) || !p.replicas.length) warnings.push(path+'.replicas: declare 1–8 replicas with unique string ids');
  else {
    if (p.replicas.length > 8) warnings.push(path+'.replicas: only the first 8 entries render');
    var seen = Object.create(null);
    p.replicas.forEach(function(r,i){
      var at = path+'.replicas['+i+']';
      if (!panelObject(r) || typeof r.id !== 'string' || !r.id.trim()){ warnings.push(at+'.id: expected a non-empty string — skipped'); return; }
      if (seen[r.id]) warnings.push(at+'.id: duplicate replica id — later entry skipped');
      seen[r.id] = true;
      if (r.label != null && typeof r.label !== 'string') warnings.push(at+'.label: expected a string — using id');
    });
  }
  if (p.unit != null && (typeof p.unit !== 'string' || !p.unit.trim())) warnings.push(path+'.unit: expected a non-empty string — using positions');
  replicaPatchWarnings(p.initial,path+'.initial',p,warnings);
}
function softwarePanelItems(p){
  var key = p.type === 'table' ? 'columns' : p.type === 'checks' ? 'checks' : 'metrics';
  var max = p.type === 'table' ? 4 : p.type === 'checks' ? 12 : 6;
  var seen = Object.create(null);
  return (Array.isArray(p[key]) ? p[key] : []).slice(0, max).filter(function(item){
    if (!panelObject(item) || typeof item.id !== 'string' || !item.id || seen[item.id]) return false;
    seen[item.id] = true;
    return true;
  });
}
function softwarePanelWarnings(p, path, warnings){
  var key = p.type === 'table' ? 'columns' : p.type === 'checks' ? 'checks' : 'metrics';
  var max = p.type === 'table' ? 4 : p.type === 'checks' ? 12 : 6;
  var seen = Object.create(null);
  if (!Array.isArray(p[key]) || !p[key].length)
    warnings.push(path + '.' + key + ': needs 1–' + max + ' entries with unique string ids');
  else {
    if (p[key].length > max) warnings.push(path + '.' + key + ': only the first ' + max + ' entries render');
    p[key].forEach(function(item, i){
      var at = path + '.' + key + '[' + i + ']';
      if (!panelObject(item) || typeof item.id !== 'string' || !item.id){
        warnings.push(at + '.id: needs a non-empty string — entry skipped'); return;
      }
      if (seen[item.id]) warnings.push(at + '.id: duplicate id "' + item.id + '" — later entry skipped');
      seen[item.id] = true;
      if (p.type === 'budget'){
        if (!isFiniteNum(item.max) || item.max <= 0)
          warnings.push(at + '.max: needs a finite positive upper limit — rendered as NO LIMIT');
        if (item.warn != null && (!isFiniteNum(item.warn) || item.warn < 0 || item.warn > item.max))
          warnings.push(at + '.warn: expected a number from 0 to max — warning threshold ignored');
      }
    });
  }
  softwarePanelPatchWarnings(p.initial, path + '.initial', p, warnings);
}
function softwarePanelPatchWarnings(state, path, p, warnings){
  if (state == null) return;
  if (!panelObject(state)){ warnings.push(path + ': expected a state object — ignored'); return; }
  var items = softwarePanelItems(p), ids = items.map(function(item){ return item.id; });
  if (p.type === 'table' && state.rows != null){
    if (!Array.isArray(state.rows)) warnings.push(path + '.rows: expected an array — rendered empty');
    else {
      if (state.rows.length > 12) warnings.push(path + '.rows: only the first 12 rows render');
      var seen = Object.create(null);
      state.rows.forEach(function(row, i){
        var at = path + '.rows[' + i + ']';
        if (!panelObject(row) || typeof row.id !== 'string' || !row.id){
          warnings.push(at + '.id: needs a non-empty string — row skipped'); return;
        }
        if (seen[row.id]) warnings.push(at + '.id: duplicate row id — later row skipped');
        seen[row.id] = true;
        if (!panelObject(row.cells)) warnings.push(at + '.cells: expected an object keyed by column id');
        else Object.keys(row.cells).forEach(function(id){
          if (ids.indexOf(id) < 0) warnings.push(at + '.cells.' + id + ': unknown column — ignored');
          else if (row.cells[id] != null && typeof row.cells[id] === 'object')
            warnings.push(at + '.cells.' + id + ': use a string, number, boolean, or null — object rendered as JSON');
        });
        if (row.status != null && TABLE_STATUSES.indexOf(row.status) < 0)
          warnings.push(at + '.status: expected ' + TABLE_STATUSES.join('|') + ' — using neutral');
      });
    }
  }
  var key = p.type === 'checks' ? 'results' : p.type === 'budget' ? 'values' : null;
  if (key && state[key] != null){
    if (!panelObject(state[key])) warnings.push(path + '.' + key + ': expected an object keyed by declared id');
    else Object.keys(state[key]).forEach(function(id){
      var at = path + '.' + key + '.' + id, v = state[key][id];
      if (ids.indexOf(id) < 0){ warnings.push(at + ': unknown declared id — ignored'); return; }
      if (p.type === 'checks' && (!panelObject(v) || (v.status != null && CHECK_STATUSES.indexOf(v.status) < 0)))
        warnings.push(at + ': expected {status: pending|pass|fail|warn|skip, detail?} — using pending');
      if (p.type === 'budget' && v !== null && (!isFiniteNum(v) || v < 0))
        warnings.push(at + ': expected a finite non-negative number or null — rendered as NO DATA');
    });
  }
  if (panelObject(state.enterOnce)){
    var once = Object.assign({}, state.enterOnce);
    delete once.enterOnce;
    softwarePanelPatchWarnings(once, path + '.enterOnce', p, warnings);
  }
}
var SCENE_NAMES = ['person-at-door-night','package-drop','static-noise'];
var QUEUE_STATES = ['empty','enqueue','held','dequeue'];
var QUEUE_CTX_FIELDS = ['from','to','reason'];
var BUFFER_STATES = ['empty','buffered','protected','uploading','uploaded','dropped'];
/* wall-clock durations for the timeline widget: "2h", "90m", "1h30m",
   "45s", "1h 30m", or a bare number (minutes) -> seconds; null on junk.
   Shared by the validator, the fold, and the engine model. */
function parseClock(text){
  /* every return is finite or null — absurd magnitudes (enough digits
     to overflow a double) must never reach the render loops */
  function fin(v){ return isFinite(v) ? v : null; }
  if (typeof text === 'number' && isFinite(text) && text >= 0) return fin(text * 60);
  if (typeof text !== 'string') return null;
  var s = text.trim().toLowerCase();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return fin(parseFloat(s) * 60);
  var m, total = 0, any = false;
  var re = /(\d+(?:\.\d+)?)\s*(d|h|m|s)/g;
  while ((m = re.exec(s))){
    any = true;
    total += parseFloat(m[1]) * (m[2] === 'd' ? 86400 : m[2] === 'h' ? 3600 : m[2] === 'm' ? 60 : 1);
  }
  if (!any) return null;
  if (s.replace(/(\d+(?:\.\d+)?)\s*(d|h|m|s)/g, '').replace(/\s/g, '') !== '') return null;
  return fin(total);
}
/* the widget is a 320-unit-wide strip; a week is the largest span it can
   present legibly. Longer declared spans clamp here (validator warns). */
var TIMELINE_MAX_SPAN = 7 * 86400;
function formatClock(seconds){
  /* 5400 -> "1h30m", 3600 -> "1h", 90 -> "1m30s", 45 -> "45s",
     90000 -> "1d1h", 604800 -> "7d", 0 -> "0". Two largest units. */
  var d = Math.floor(seconds / 86400);
  var rem = seconds - d * 86400;
  var h = Math.floor(rem / 3600);
  rem -= h * 3600;
  var mn = Math.floor(rem / 60);
  var sc = Math.round(rem - mn * 60);
  if (sc === 60){ sc = 0; mn += 1; } /* 59.6s must not read "60s" */
  if (mn === 60){ mn = 0; h += 1; }
  if (h === 24){ h = 0; d += 1; }
  var out = '';
  if (d) out += d + 'd';
  if (h) out += h + 'h';
  if (mn && !d) out += mn + 'm';
  if (sc && !h && !d) out += sc + 's';
  return out || '0';
}
var TIMELINE_EVENT_KINDS = ['ok', 'alert', 'info'];
/* beat dots stop being drawable well before this; beyond it the renderer
   omits the dots and says so in the meta line, and the validator warns */
var TIMELINE_MAX_BEATS = 120;
function timelineEventWarnings(list, path, warnings){
  (Array.isArray(list) ? list : []).forEach(function(e, i){
    var EP = path + '[' + i + ']';
    if (!e || typeof e !== 'object'){ warnings.push(EP + ': needs {at, label?, kind?} — skipped'); return; }
    if (parseClock(e.at) == null)
      warnings.push(EP + '.at: unreadable time "' + e.at + '" (use "1d" / "1h30m" / "45m" / "90s") — skipped');
    if (e.kind != null && TIMELINE_EVENT_KINDS.indexOf(e.kind) < 0)
      warnings.push(EP + '.kind: unknown kind "' + e.kind + '" — using "info" (valid: ' + TIMELINE_EVENT_KINDS.join(' ') + ')');
  });
}
function timelineLaneIds(decl){
  /* mirrors the model's acceptance rules exactly — a lane the renderer
     skips (missing id, duplicate, unreadable interval, over the 4-lane
     cap) is NOT a known target, so misses/events naming it warn */
  var ids = [];
  var seen = {};
  ((decl && Array.isArray(decl.lanes)) ? decl.lanes : []).forEach(function(l){
    if (ids.length >= 4) return;
    if (!l || typeof l !== 'object' || l.id == null) return;
    var id = String(l.id);
    if (seen[id]) return;
    var every = parseClock(l.every);
    if (every == null || every <= 0) return;
    seen[id] = true;
    ids.push(id);
  });
  return ids;
}
function timelineEventLaneWarnings(list, path, laneIds, warnings){
  (Array.isArray(list) ? list : []).forEach(function(e, i){
    if (e && e.lane != null && laneIds.indexOf(String(e.lane)) < 0)
      warnings.push(path + '[' + i + '].lane: unknown lane "' + e.lane + '" — drawn on the axis row');
  });
}
function timelinePatchWarnings(obj, path, decl, warnings){
  if (!obj || typeof obj !== 'object') return;
  var laneIds = timelineLaneIds(decl);
  if (obj.now != null && parseClock(obj.now) == null)
    warnings.push(path + '.now: unreadable time "' + obj.now + '" (use "1d" / "1h30m" / "45m" / "90s") — cursor unchanged');
  if (obj.events != null && !Array.isArray(obj.events))
    warnings.push(path + '.events: expected an array of {at, label?, kind?} — ignored');
  else {
    timelineEventWarnings(obj.events, path + '.events', warnings);
    timelineEventLaneWarnings(obj.events, path + '.events', laneIds, warnings);
  }
  if (obj.miss != null){
    if (!Array.isArray(obj.miss))
      warnings.push(path + '.miss: expected an array of {lane, at} — ignored');
    else obj.miss.forEach(function(m, i){
      var MP = path + '.miss[' + i + ']';
      if (!m || typeof m !== 'object'){ warnings.push(MP + ': needs {lane, at} — skipped'); return; }
      if (m.lane == null || laneIds.indexOf(String(m.lane)) < 0)
        warnings.push(MP + '.lane: unknown lane "' + m.lane + '" — skipped' +
          (laneIds.length ? '' : ' (this timeline has no usable lanes)'));
      if (parseClock(m.at) == null)
        warnings.push(MP + '.at: unreadable time "' + m.at + '" — skipped');
    });
  }
}

/* shared by bufferModel and the fold compactor */
function bufferSegCount(decl){
  return (decl && typeof decl.segments === 'number' && isFinite(decl.segments))
    ? Math.round(Math.max(2, Math.min(48, decl.segments))) : 12;
}
function bufferPaint(n, baseCells, marks){
  var cells = [];
  for (var i = 0; i < n; i++){
    var t = Array.isArray(baseCells) ? baseCells[i] : undefined;
    cells.push(BUFFER_STATES.indexOf(t) >= 0 ? t : 'empty');
  }
  (Array.isArray(marks) ? marks : []).forEach(function(op){
    if (!Array.isArray(op) || op.length < 3) return;
    var a = op[0], b = op[1], tok = op[2];
    if (typeof a !== 'number' || !isFinite(a) || typeof b !== 'number' || !isFinite(b)) return;
    if (BUFFER_STATES.indexOf(tok) < 0) return;
    a = Math.max(0, Math.round(a)); b = Math.min(n - 1, Math.round(b));
    for (var mi = a; mi <= b; mi++) cells[mi] = tok;
  });
  return cells;
}
var SIGNAL_STATES_V = ['ok','weak','retrying','lost','jammed'];
var SIGNAL_TRANSPORTS_V = ['wifi','subghz','thread','zigbee','zwave','cellular','poe','ethernet','ble'];
var INFLIGHT_STATES = ['ok','retry','failed'];

/* queue directional-context fields must be strings; anything else is ignored
   at render, so warn with the field path (shared by initial + step patches) */
/* buffer cells/head checks shared by initial and step patches; decl gives
   the segment count for the head-range check */
function bufferCellWarnings(obj, path, decl, warnings){
  if (!obj || typeof obj !== 'object') return;
  var n = (decl && typeof decl.segments === 'number' && isFinite(decl.segments) &&
           decl.segments >= 2 && decl.segments <= 48) ? Math.round(decl.segments) : 12;
  if (obj.cells != null){
    if (!Array.isArray(obj.cells)){
      warnings.push(path + '.cells: must be an array of state tokens — ignored');
    } else obj.cells.forEach(function(c, ci){
      if (BUFFER_STATES.indexOf(c) < 0)
        warnings.push(path + '.cells[' + ci + ']: unknown state "' + c + '" — rendered empty (valid: ' + BUFFER_STATES.join(' ') + ')');
    });
  }
  if (obj.head != null && !(typeof obj.head === 'number' && isFinite(obj.head) && obj.head >= 0 && obj.head < n))
    warnings.push(path + '.head: expected an index 0–' + (n - 1) + ' — marker hidden');
  if (obj.mark != null){
    if (!Array.isArray(obj.mark)){
      warnings.push(path + '.mark: must be an array of [i0, i1, "state"] paints — ignored');
    } else obj.mark.forEach(function(op, oi){
      var okShape = Array.isArray(op) && op.length >= 3 &&
        typeof op[0] === 'number' && isFinite(op[0]) &&
        typeof op[1] === 'number' && isFinite(op[1]);
      if (!okShape)
        warnings.push(path + '.mark[' + oi + ']: expected [i0, i1, "state"] — paint skipped');
      else if (BUFFER_STATES.indexOf(op[2]) < 0)
        warnings.push(path + '.mark[' + oi + ']: unknown state "' + op[2] + '" — paint skipped (valid: ' + BUFFER_STATES.join(' ') + ')');
    });
  }
}

/* signal per-link status checks shared by initial and step patches: each
   key is a link id whose value is {state, bars, note} */
function signalLinkWarnings(obj, path, warnings){
  if (!obj || typeof obj !== 'object') return;
  Object.keys(obj).forEach(function(k){
    var v = obj[k];
    if (!v || typeof v !== 'object') return;
    if (v.state != null && SIGNAL_STATES_V.indexOf(v.state) < 0)
      warnings.push(path + '.' + k + '.state: unknown link state "' + v.state +
        '" — using "ok" (valid: ' + SIGNAL_STATES_V.join(' ') + ')');
    if (v.bars != null && !(typeof v.bars === 'number' && isFinite(v.bars) && v.bars >= 0 && v.bars <= 4))
      warnings.push(path + '.' + k + '.bars: expected 0–4 — bars hidden');
    Object.keys(v).forEach(function(f){
      if (['state', 'bars', 'note'].indexOf(f) < 0)
        warnings.push(path + '.' + k + '.' + f + ': not a signal field — ignored (valid: state, bars, note; put dBm figures in note)');
    });
  });
}

/* tiles per-tile status checks shared by initial and step patches: each key
   is a tile id whose value is {state, sub}; a state outside the declared
   vocabulary renders the tile dimmed */
function tileStateWarnings(obj, path, decl, warnings){
  if (!obj || typeof obj !== 'object') return;
  var vocab = (decl && Array.isArray(decl.states)) ? decl.states.map(String) : [];
  if (!vocab.length) return;
  Object.keys(obj).forEach(function(k){
    var v = obj[k];
    if (v && typeof v === 'object' && v.state != null && vocab.indexOf(String(v.state)) < 0)
      warnings.push(path + '.' + k + '.state: "' + v.state +
        '" is not in the declared states — tile renders dimmed (valid: ' + vocab.join(' ') + ')');
  });
}

/* Homemap vocabularies are shared by validation and the pure engine model.
   First token is the fallback. Only signals is reserved: this panel has its
   own fold so log/mark/enterOnce remain ordinary device ids. */
var HOMEMAP_STATES = {
  camera: ['scan', 'sleep', 'detect', 'rec', 'off'], entry: ['closed', 'open', 'alert'],
  sensor: ['ok', 'warn', 'alert', 'off'], hub: ['idle', 'rx', 'tx', 'alert']
};
function homemapDeviceValid(d){
  return d && typeof d.id === 'string' && d.id !== '' && d.id !== 'signals' &&
    typeof d.kind === 'string' && Object.prototype.hasOwnProperty.call(HOMEMAP_STATES, d.kind) &&
    isFiniteNum(d.x) && isFiniteNum(d.y);
}
function homemapSubjectPosition(v){
  return v && typeof v === 'object' && !Array.isArray(v) && isFiniteNum(v.x) && isFiniteNum(v.y);
}
/* Shared declaration filtering keeps model, fold and warnings in agreement. */
function homemapSubjects(panel, path, warnings){
  var devices = Object.create(null), seen = Object.create(null), subjects = [];
  function warn(message){ if (warnings) warnings.push(path + message); }
  (Array.isArray(panel.devices) ? panel.devices : []).forEach(function(d){
    if (d && typeof d.id === 'string') devices[d.id] = true;
  });
  if (panel.subjects !== undefined && !Array.isArray(panel.subjects))
    warn('.subjects: expected an array — ignored');
  (Array.isArray(panel.subjects) ? panel.subjects : []).forEach(function(sub, i){
    var sp = '.subjects[' + i + ']', valid = true;
    if (!sub || typeof sub.id !== 'string' || !sub.id){
      warn(sp + '.id: needs a nonempty string — subject ignored');
      return;
    }
    if (seen[sub.id]){ warn(sp + '.id: duplicate subject id "' + sub.id + '" — duplicate ignored'); valid = false; }
    seen[sub.id] = true;
    if (devices[sub.id]){ warn(sp + '.id: collides with a device id — subject ignored'); valid = false; }
    if (sub.id === 'signals'){ warn(sp + '.id: "signals" is reserved — subject ignored'); valid = false; }
    ['x', 'y'].forEach(function(k){
      if (!isFiniteNum(sub[k])){ warn(sp + '.' + k + ': must be finite — subject ignored'); valid = false; }
    });
    if (sub.icon !== undefined && ICON_SET.indexOf(sub.icon) < 0)
      warn(sp + '.icon: unknown icon "' + sub.icon + '" — using "gear"');
    if (valid) subjects.push(sub);
  });
  return subjects;
}
function homemapPatchWarnings(obj, path, declaration, warnings){
  var devices = declaration.devices, subjects = declaration.subjects;
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
  Object.keys(obj).forEach(function(k){
    if (k === 'signals'){
      if (!Array.isArray(obj.signals)){
        warnings.push(path + '.signals: expected an array of {from, to} — ignored');
        return;
      }
      obj.signals.forEach(function(sig, i){
        if (!sig || typeof sig !== 'object' || Array.isArray(sig) ||
            typeof sig.from !== 'string' || typeof sig.to !== 'string' ||
            !devices[sig.from] || !devices[sig.to])
          warnings.push(path + '.signals[' + i + ']: needs from/to referencing declared device ids — entry ignored');
      });
    } else if (subjects[k]){
      if (obj[k] !== null && !homemapSubjectPosition(obj[k]))
        warnings.push(path + '.' + k + ': expected an object with finite x/y or null — subject patch ignored');
    } else if (!devices[k]){
      warnings.push(path + '.' + k + ': undeclared device or subject id — patch ignored');
    } else {
      var vocab = HOMEMAP_STATES[devices[k].kind];
      if (vocab.indexOf(obj[k]) < 0)
        warnings.push(path + '.' + k + ': unknown ' + devices[k].kind + ' state "' + obj[k] +
          '" — using "' + vocab[0] + '" (valid: ' + vocab.join(' ') + ')');
    }
  });
}
function homemapRooms(panel, path, warnings){
  var rooms = panel.rooms;
  if (rooms == null) return [];
  if (!Array.isArray(rooms)){
    if (warnings) warnings.push(path + '.rooms: expected an array of {label, x, y, w, h} — ignored');
    return [];
  }
  return rooms.filter(function(r, i){
    var valid = r && ['x','y','w','h'].every(function(k){ return isFiniteNum(r[k]); }) &&
      r.x >= 0 && r.y >= 0 && r.w > 0 && r.h > 0 && r.x + r.w <= 320 && r.y + r.h <= 180;
    if (!valid && warnings) warnings.push(path + '.rooms[' + i + ']: use a positive rectangle inside the 320×180 map — ignored');
    return valid;
  });
}

function homemapDeclarationWarnings(panel, path, warnings){
  homemapRooms(panel, path, warnings);
  var devices = Object.create(null), seen = Object.create(null);
  if (!(Array.isArray(panel.devices) && panel.devices.length))
    warnings.push(path + '.devices: homemap needs a devices array — rendering a placeholder');
  (Array.isArray(panel.devices) ? panel.devices : []).forEach(function(d, i){
    var dp = path + '.devices[' + i + ']';
    if (!d || typeof d.id !== 'string' || !d.id){
      warnings.push(dp + '.id: needs a nonempty string — device ignored');
      return;
    }
    if (d.id === 'signals') warnings.push(dp + '.id: "signals" is reserved — device ignored');
    if (seen[d.id]) warnings.push(dp + '.id: duplicate device id "' + d.id + '" — duplicate ignored');
    var duplicate = !!seen[d.id];
    seen[d.id] = true;
    if (typeof d.kind !== 'string' || !Object.prototype.hasOwnProperty.call(HOMEMAP_STATES, d.kind))
      warnings.push(dp + '.kind: unknown kind "' + d.kind + '" — device ignored (valid: camera entry sensor hub)');
    ['x', 'y'].forEach(function(k){
      if (!isFiniteNum(d[k])) warnings.push(dp + '.' + k + ': must be finite — device ignored');
    });
    if (d.kind === 'camera') ['facing', 'spread', 'range'].forEach(function(k){
      if (d[k] !== undefined && !isFiniteNum(d[k]))
        warnings.push(dp + '.' + k + ': must be finite — default used');
    });
    if (d.kind === 'sensor' && d.icon !== undefined && ICON_SET.indexOf(d.icon) < 0)
      warnings.push(dp + '.icon: unknown icon "' + d.icon + '" — using "gear"');
    if (!duplicate && homemapDeviceValid(d)) devices[d.id] = d;
  });
  var subjects = Object.create(null);
  homemapSubjects(panel, path, warnings).forEach(function(sub){ subjects[sub.id] = sub; });
  var declaration = {devices: devices, subjects: subjects};
  homemapPatchWarnings(panel.initial, path + '.initial', declaration, warnings);
  return declaration;
}

/* radar per-step patch checks shared by initial and step patches */
function radarPatchWarnings(obj, path, warnings){
  if (!obj || typeof obj !== 'object') return;
  if (obj.subject != null){
    var cart = isFiniteNum(obj.subject.x) && isFiniteNum(obj.subject.y);
    var polar = isFiniteNum(obj.subject.r) && isFiniteNum(obj.subject.deg);
    if (!cart && !polar)
      warnings.push(path + '.subject: expected {x, y} (frame px) or {r, deg} (declared units) — subject not drawn');
  }
  if (obj.threshold != null && !(isFiniteNum(obj.threshold) && obj.threshold > 0))
    warnings.push(path + '.threshold: must be a positive finite distance — re-tune ignored');
  if (obj.alert != null && typeof obj.alert !== 'boolean')
    warnings.push(path + '.alert: must be true or false — override ignored');
}

function queueContextWarnings(obj, path, warnings){
  if (!obj || typeof obj !== 'object') return;
  QUEUE_CTX_FIELDS.forEach(function(f){
    if (obj[f] != null && typeof obj[f] !== 'string')
      warnings.push(path + '.' + f + ': must be a string — ignored');
  });
}

/* Shared with the phone renderer; also accepts plain objects from another realm. */
function phoneBrandIsPlainObject(obj){
  if (!obj || Object.prototype.toString.call(obj) !== '[object Object]') return false;
  var proto = Object.getPrototypeOf(obj);
  return proto === null || (Object.prototype.hasOwnProperty.call(proto, 'constructor') &&
    typeof proto.constructor === 'function' &&
    Function.prototype.toString.call(proto.constructor) === Function.prototype.toString.call(Object));
}

function phoneBrandWarnings(panel, path, warnings){
  if (!Object.prototype.hasOwnProperty.call(panel, 'brand')) return;
  var brand = panel.brand;
  path += '.brand';
  if (!phoneBrandIsPlainObject(brand)){
    warnings.push(path + ': must be a plain object — ignored');
    return;
  }
  ['accent', 'bg', 'fg'].forEach(function(k){
    if (Object.prototype.hasOwnProperty.call(brand, k) &&
        (typeof brand[k] !== 'string' || (brand[k].length !== 4 && brand[k].length !== 7) ||
         !/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(brand[k])))
      warnings.push(path + '.' + k + ': must be #RGB or #RRGGBB hex — ignored');
  });
  if (Object.prototype.hasOwnProperty.call(brand, 'logo') &&
      (typeof brand.logo !== 'string' || brand.logo.length < 1 || brand.logo.length > 4))
    warnings.push(path + '.logo: must be a string of 1-4 characters — ignored');
  if (Object.prototype.hasOwnProperty.call(brand, 'app') && typeof brand.app !== 'string')
    warnings.push(path + '.app: must be a string — ignored');
}

/* Phone patches are operations, validated for both initial and steps. */
function phonePatchWarnings(obj, path, warnings){
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
  Object.keys(obj).forEach(function(k){
    if (['clock', 'notify', 'clear'].indexOf(k) < 0)
      warnings.push(path + '.' + k + ': not a phone field — ignored (valid: clock, notify, clear)');
  });
  if (Object.prototype.hasOwnProperty.call(obj, 'clock') && typeof obj.clock !== 'string')
    warnings.push(path + '.clock: must be a string — ignored');
  if (Object.prototype.hasOwnProperty.call(obj, 'clear') && obj.clear !== true)
    warnings.push(path + '.clear: must be true — ignored');
  if (!Object.prototype.hasOwnProperty.call(obj, 'notify')) return;
  var entries = Array.isArray(obj.notify) ? obj.notify : [obj.notify];
  entries.forEach(function(n, i){
    var np = path + '.notify' + (Array.isArray(obj.notify) ? '[' + i + ']' : '');
    if (!n || typeof n !== 'object' || Array.isArray(n)){
      warnings.push(np + ': expected {app, title?, text?} — notification ignored');
      return;
    }
    if (typeof n.app !== 'string' || !n.app)
      warnings.push(np + '.app: required non-empty string — notification ignored');
    ['title', 'text'].forEach(function(k){
      if (Object.prototype.hasOwnProperty.call(n, k) && typeof n[k] !== 'string')
        warnings.push(np + '.' + k + ': must be a string — ignored');
    });
    Object.keys(n).forEach(function(k){
      if (['app', 'title', 'text'].indexOf(k) < 0)
        warnings.push(np + '.' + k + ': not a notification field — ignored (valid: app, title, text)');
    });
  });
}
var SKIN_NAMES = ['aurora','daylight','editorial','terminal','pastel','blueprint'];
var SKINS = {
  aurora:   {bg:'#0B1220', grid:'#16233C', halos:true,  glow:true,  retNeutral:'#93A7C9'},
  daylight: {bg:'#FBFAF6', grid:'',        halos:false, glow:false, retNeutral:'#6B6F7A'},
  /* The four showcase skins are CSS overlays authored on the Aurora palette. */
  editorial:{bg:'#0B1220', grid:'#16233C', halos:true,  glow:true,  retNeutral:'#93A7C9'},
  terminal: {bg:'#0B1220', grid:'#16233C', halos:true,  glow:true,  retNeutral:'#93A7C9'},
  pastel:   {bg:'#0B1220', grid:'#16233C', halos:true,  glow:true,  retNeutral:'#93A7C9'},
  blueprint:{bg:'#0B1220', grid:'#16233C', halos:true,  glow:true,  retNeutral:'#93A7C9'}
};
/* ONE kind->style table: edges, packets, arrowheads, and the legend all read it. */
var BUILTIN_PROTOCOLS = {
  https:  {label:'HTTPS',        color:{aurora:'#38E1FF', daylight:'#4956C9'}},
  int:    {label:'service call', color:{aurora:'#A78BFA', daylight:'#7C5CC4'}},
  mqtt:   {label:'MQTT',         color:{aurora:'#F471B5', daylight:'#C2417E'}},
  sqs:    {label:'SQS',          color:{aurora:'#FFB454', daylight:'#B45309'}},
  rmq:    {label:'RabbitMQ',     color:{aurora:'#FF8A65', daylight:'#C0392B'}},
  pulsar: {label:'Pulsar',       color:{aurora:'#2DD4BF', daylight:'#0F766E'}},
  tls:    {label:'TLS',          color:{aurora:'#FACC15', daylight:'#A16207'}},
  ws:     {label:'WebSocket',    color:{aurora:'#60A5FA', daylight:'#2563EB'}}
};
var ACCENTS = {green:'#4ADE80', blue:'#38BDF8', violet:'#A78BFA', amber:'#FFB454',
               pink:'#F471B5', cyan:'#38E1FF', red:'#F87171', slate:'#94A3B8'};
var ACCENT_CYCLE = ['green','blue','violet','amber'];
var DASH_MAIN = '9 7', DASH_RET = '4 6';
var LANE_FALLBACK = '#94A3B8';
var CONTRACT_VERSION = '1';

function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }
/* finite-only numeric check: a JSON overflow literal (1e400) parses to
   Infinity, which is typeof 'number' but poisons percentage math into NaN */
function isFiniteNum(v){ return typeof v === 'number' && isFinite(v); }
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function isHex(s){ return typeof s === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(s); }
function stepKeys(st){
  if (!st) return [];
  if (Array.isArray(st.edges)) return st.edges;
  if (st.edge) return [st.edge];
  return [];
}
var COMM_FAILURE_MODES = ['dropped','blocked'];
function stepFailures(st){
  var raw = st && st.failures, out = Object.create(null);
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) Object.keys(raw).forEach(function(key){
    if (COMM_FAILURE_MODES.indexOf(raw[key]) >= 0) out[key] = raw[key];
  });
  return out;
}
function stepDeliveredKeys(st){
  var failures = stepFailures(st);
  return stepKeys(st).filter(function(key){return !Object.prototype.hasOwnProperty.call(failures,key);});
}
function stepNodes(st){
  return (st && Array.isArray(st.nodes)) ? st.nodes : [];
}
function stepPanelPatch(st){
  if (!st) return null;
  if (st.panels && typeof st.panels === 'object' && !Array.isArray(st.panels)) return st.panels;
  if (st.patch && typeof st.patch === 'object' && !Array.isArray(st.patch)) return st.patch;
  return null;
}
function stepTonePatch(st){
  if (!st || !st.tone || typeof st.tone !== 'object' || Array.isArray(st.tone)) return null;
  return st.tone;
}

function resolveProtocols(page){
  var out = {};
  Object.keys(BUILTIN_PROTOCOLS).forEach(function(k){ out[k] = BUILTIN_PROTOCOLS[k]; });
  var extra = page.protocols || {};
  Object.keys(extra).forEach(function(k){
    var p = extra[k] || {};
    out[k] = {label: p.label || k, color: p.color || '#9AA4B2'};
  });
  return out;
}
function kindColor(protos, kind, skin){
  var p = protos[kind] || protos['int'];
  var c = p.color;
  if (typeof c === 'string') return c;
  return c[skin] || c.aurora || '#9AA4B2';
}
function resolveLanes(page){
  var out = {};
  var raw = page.lanes || {};
  Object.keys(raw).forEach(function(k){
    var l = raw[k] || {};
    out[k] = {label: l.label || k, color: isHex(l.color) ? l.color : LANE_FALLBACK};
  });
  return out;
}

/* Fragment-level reveal fields are shared by section bullet objects,
   contract-card rows, and diagram edges. Indices are zero-based. Invalid
   values are ignored by the renderer, but every bad authoring shape gets a
   precise warning here. */
function revealFieldWarnings(obj, path, stepCount, warnings){
  if (!obj || typeof obj !== 'object') return;
  var valid = {};
  ['revealAt', 'hideAt'].forEach(function(k){
    if (!Object.prototype.hasOwnProperty.call(obj, k)) return;
    if (!stepCount)
      warnings.push(path + '.' + k + ': reveal fields require diagram.steps in this section — ambient rendering stays visible');
    if (!(typeof obj[k] === 'number' && isFinite(obj[k]) &&
          Math.floor(obj[k]) === obj[k] && obj[k] >= 0)){
      warnings.push(path + '.' + k + ': must be a non-negative integer step index — ignored');
    } else {
      valid[k] = true;
    }
  });
  if (valid.revealAt && stepCount && obj.revealAt >= stepCount)
    warnings.push(path + '.revealAt: step index ' + obj.revealAt +
      ' is beyond the diagram step count (' + stepCount + ') — fragment never reveals');
  if (valid.revealAt && valid.hideAt && obj.hideAt <= obj.revealAt)
    warnings.push(path + '.hideAt: must be greater than revealAt (' + obj.revealAt + ') — fragment has no visible step');
}

function bulletRevealWarnings(items, path, stepCount, warnings){
  if (!Array.isArray(items)) return;
  items.forEach(function(item, i){
    if (!item || typeof item !== 'object' || Array.isArray(item)) return;
    revealFieldWarnings(item, path + '[' + i + ']', stepCount, warnings);
    bulletRevealWarnings(item.sub, path + '[' + i + '].sub', stepCount, warnings);
  });
}

/* Validate + simulate one inflight patch in the same deterministic order as
   the fold: start, then end, then mark. `open` is lane-id -> true and is
   intentionally carried across steps so impossible histories warn where
   they occur. */
function inflightPatchWarnings(patch, path, info, warnings){
  var lanes = info.lanes, open = info.open;
  function known(lane, p){
    if (typeof lane !== 'string' || !lanes[lane]){
      warnings.push(p + ': unknown inflight lane id "' + lane + '" — operation ignored');
      return false;
    }
    return true;
  }
  if (patch.start != null && !Array.isArray(patch.start)){
    warnings.push(path + '.start: must be an array of {lane, label?} — ignored');
  } else (patch.start || []).forEach(function(op, i){
    var p = path + '.start[' + i + ']';
    if (!op || typeof op !== 'object' || Array.isArray(op)){
      warnings.push(p + ': expected {lane, label?} — start ignored');
      return;
    }
    if (!known(op.lane, p + '.lane')) return;
    if (open[op.lane])
      warnings.push(p + ': lane "' + op.lane + '" is already open — current bar closes and restarts here');
    open[op.lane] = true;
  });
  if (patch.end != null && !Array.isArray(patch.end)){
    warnings.push(path + '.end: must be an array of lane ids — ignored');
  } else (patch.end || []).forEach(function(lane, i){
    var p = path + '.end[' + i + ']';
    if (!known(lane, p)) return;
    if (!open[lane]) warnings.push(p + ': lane "' + lane + '" has no open bar — end ignored');
    else delete open[lane];
  });
  if (patch.mark != null && !Array.isArray(patch.mark)){
    warnings.push(path + '.mark: must be an array of {lane, state} — ignored');
  } else (patch.mark || []).forEach(function(op, i){
    var p = path + '.mark[' + i + ']';
    if (!op || typeof op !== 'object' || Array.isArray(op)){
      warnings.push(p + ': expected {lane, state} — mark ignored');
      return;
    }
    known(op.lane, p + '.lane');
    if (op.state != null && INFLIGHT_STATES.indexOf(op.state) < 0)
      warnings.push(p + '.state: unknown inflight state "' + op.state +
        '" — using "ok" (valid: ' + INFLIGHT_STATES.join(' ') + ')');
  });
}

/* ---------------- normalize + validate ---------------- */
/* Paths reference a shared step registry. Folding always receives just the
   selected sequence, so another outcome cannot leak state into this one. */
function diagramPathList(d){
  var steps = Array.isArray(d.steps) ? d.steps : [], byId = new Map();
  steps.forEach(function(s,i){ if (s && typeof s.id === 'string') byId.set(s.id,i); });
  var colors = ['#38bdf8','#fb923c','#c084fc','#f472b6','#4ade80'];
  var paths = Array.isArray(d.paths) ? d.paths.filter(function(p){
    return p && typeof p.id === 'string' && p.id && Array.isArray(p.steps) && p.steps.length &&
      p.steps.every(function(id){ return byId.has(id); });
  }).map(function(p,i){
    return {id:p.id, label:p.label || (i ? p.id : 'Happy path'), color:isHex(p.color) ? p.color : colors[i % colors.length],
      indices:p.steps.map(function(id){ return byId.get(id); })};
  }) : [];
  return paths.length ? paths : [{id:'happy',label:'Happy path',color:colors[0],indices:steps.map(function(s,i){return i;})}];
}
function diagramForPath(d, id){
  var paths = diagramPathList(d), path = paths.find(function(p){ return p.id === id; }) || paths[0];
  return Object.assign({}, d, {steps:path.indices.map(function(i){ return d.steps[i]; }),
    _sourceIndices:path.indices, _pathId:path.id});
}
/* Each row starts at its fork beat and ends at its final step. Compare
   earlier declarations so nested alternatives keep stable rows too. */
function pathStepRows(paths){
  return paths.map(function(path,i){
    var shared = 0;
    paths.slice(0,i).forEach(function(prior){
      var n = 0;
      while (n < path.indices.length && n < prior.indices.length && path.indices[n] === prior.indices[n]) n++;
      shared = Math.max(shared,n);
    });
    return {path:path, start:i ? Math.max(0,shared - 1) : 0, end:path.indices.length - 1};
  });
}
function validatePaths(d, path, errors){
  if (d.paths == null) return;
  if (!Array.isArray(d.paths) || !d.paths.length){ errors.push(path + '.paths: expected a nonempty array of paths'); return; }
  var ids = new Map(), pathIds = new Set();
  (Array.isArray(d.steps) ? d.steps : []).forEach(function(s){
    if (s && typeof s.id === 'string' && s.id) ids.set(s.id,(ids.get(s.id) || 0) + 1);
  });
  d.paths.forEach(function(p,i){
    var at = path + '.paths[' + i + ']';
    if (!p || typeof p !== 'object' || Array.isArray(p)){ errors.push(at + ': expected a path object'); return; }
    if (typeof p.id !== 'string' || !p.id.trim() || pathIds.has(p.id)) errors.push(at + '.id: required unique nonempty string');
    pathIds.add(p.id);
    if (p.label != null && (typeof p.label !== 'string' || !p.label.trim())) errors.push(at + '.label: expected a nonempty string');
    if (p.color != null && !isHex(p.color)) errors.push(at + '.color: expected a hex color');
    if (!Array.isArray(p.steps) || !p.steps.length){ errors.push(at + '.steps: expected one or more step IDs'); return; }
    var seen = new Set();
    p.steps.forEach(function(id,j){
      if (typeof id !== 'string' || ids.get(id) !== 1) errors.push(at + '.steps[' + j + ']: must reference a unique existing step ID');
      if (seen.has(id)) errors.push(at + '.steps[' + j + ']: repeated step ID; create a distinct step for a repeated operation');
      seen.add(id);
    });
  });
}

function normalize(raw){
  if (raw && raw.page) return raw.page;
  if (raw && (raw.blocks || raw.sections)) return raw;
  if (raw && raw.nodes && raw.rows) return {title:'', sections:[{diagram: raw}]};
  return null;
}

function blocksOf(page){
  var raw = page.blocks || page.sections || [];
  var pfx = page.blocks ? 'blocks' : 'sections';
  var out = [];
  raw.forEach(function(b, i){
    if (b && Array.isArray(b.tabs)){
      out.push({type:'tabs', path:pfx + '[' + i + ']', tabs:b.tabs.map(function(t, j){
        return {label:(t && t.label) || ('Tab ' + (j + 1)),
                highlight:(t && t.highlight != null) ? t.highlight : undefined,
                sections:(t && Array.isArray(t.sections)) ? t.sections : [],
                path:pfx + '[' + i + '].tabs[' + j + ']'};
      })});
    } else {
      out.push({type:'section', sec:b, path:pfx + '[' + i + ']'});
    }
  });
  return out;
}

function validateSection(sec, P, protos, lanes, errors, warnings){
  if (!sec || typeof sec !== 'object'){ errors.push(P + ': must be an object'); return; }
  var sectionStepCount = sec.diagram && Array.isArray(sec.diagram.steps) ? sec.diagram.steps.length : 0;
  bulletRevealWarnings(sec.bullets, P + '.bullets', sectionStepCount, warnings);
  if (sec.accent && !ACCENTS[sec.accent] && !isHex(sec.accent))
    warnings.push(P + '.accent: unknown accent "' + sec.accent + '" — using the default cycle (valid: ' + Object.keys(ACCENTS).join(' ') + ', or "#RRGGBB")');
  if (sec.source && typeof sec.source !== 'string')
    warnings.push(P + '.source: must be a URL string — source chip skipped');
  if (Object.prototype.hasOwnProperty.call(sec, 'collapsed') && typeof sec.collapsed !== 'boolean')
    warnings.push(P + '.collapsed: must be a boolean — using the expanded default');
  if (sec.contract != null){
    var CP = P + '.contract';
    if (typeof sec.contract !== 'object' || Array.isArray(sec.contract)){
      warnings.push(CP + ': must be an object {title?, source?, fields:[...], note?} — card skipped');
    } else {
      var ct = sec.contract;
      if (ct.source && typeof ct.source !== 'string')
        warnings.push(CP + '.source: must be a URL string — source chip skipped');
      if (!Array.isArray(ct.fields) || !ct.fields.length){
        warnings.push(CP + '.fields: required — array of {k, v?, g?, hot?, link?, delta?, revealAt?, hideAt?}; card renders without rows');
      } else ct.fields.forEach(function(f, fi){
        if (!f || typeof f !== 'object'){
          warnings.push(CP + '.fields[' + fi + ']: must be an object with a "k" — row skipped');
          return;
        }
        if (!f.k) warnings.push(CP + '.fields[' + fi + '].k: required — row skipped');
        if (f.link && typeof f.link !== 'string')
          warnings.push(CP + '.fields[' + fi + '].link: must be a URL string — link ignored');
        if (f.delta != null && ['added','removed','changed'].indexOf(f.delta) < 0)
          warnings.push(CP + '.fields[' + fi + '].delta: unknown token "' + f.delta +
            '" — badge omitted (valid: added removed changed)');
        revealFieldWarnings(f, CP + '.fields[' + fi + ']', sectionStepCount, warnings);
      });
    }
  }
  if (!sec.diagram && !sec.text && !sec.bullets && !sec.heading && !sec.contract)
    warnings.push(P + ': empty section — add heading, text, bullets, contract, or diagram');
  var d = sec.diagram;
  if (!d) return;
  var DP = P + '.diagram';
  validatePaths(d, DP, errors);
  if (d.primaryPanel != null && (typeof d.primaryPanel !== 'string' ||
      !(Array.isArray(d.panels) && d.panels.some(function(p){ return p && p.id === d.primaryPanel; }))))
    warnings.push(DP + '.primaryPanel: must name an existing panel — using the standard flow layout');
  if (d.view && VIEW_SET.indexOf(d.view) < 0)
    warnings.push(DP + '.view: unknown view "' + d.view + '" — using "ambient" (valid: ' + VIEW_SET.join(', ') + ')');
  if (!d.nodes || typeof d.nodes !== 'object'){ errors.push(DP + '.nodes: required — map of node id to {title, sub, icon, tint}'); return; }
  if (!Array.isArray(d.rows) || d.rows.length === 0){ errors.push(DP + '.rows: required — array of rows, each an array of node ids (nested array = stack)'); return; }
  if (d.routing != null && d.routing !== 'lanes' && d.routing !== 'curves')
    warnings.push(DP + '.routing: expected "lanes" or "curves" — using curves');
  if (d.routing === 'lanes'){
    if ((d.floats || []).length || d.rows.some(function(row){ return !Array.isArray(row) || !row.length || row.length>5 || row.some(Array.isArray); }) ||
        (d.edges || []).some(function(e){ return e.from === e.to; }))
      warnings.push(DP + '.routing: lanes requires 1–5 unstacked cards per row, no floats or self-loops — using curves');
    else if ((d.edges || []).some(function(e){ return e.bend; }))
      warnings.push(DP + '.routing: lanes computes its own routes; authored edge bends are ignored');
  }

  var placed = {};
  d.rows.forEach(function(slots, r){
    if (!Array.isArray(slots)){ errors.push(DP + '.rows[' + r + ']: must be an array of slots'); return; }
    slots.forEach(function(s){
      (Array.isArray(s) ? s : [s]).forEach(function(id){
        if (!d.nodes[id]) errors.push(DP + '.rows[' + r + ']: unknown node id "' + id + '" — define it in nodes or remove it');
        else placed[id] = true;
      });
    });
  });
  (d.floats || []).forEach(function(f, fi){
    if (!f || !d.nodes[f.id]) errors.push(DP + '.floats[' + fi + ']: unknown node id "' + (f && f.id) + '"');
    else placed[f.id] = true;
    if (f && f.side && f.side !== 'above' && f.side !== 'below')
      warnings.push(DP + '.floats[' + fi + '].side: unknown side "' + f.side + '" — using "above" (valid: above, below)');
  });
  var groups = (d.groups && typeof d.groups === 'object') ? d.groups : {};
  sanitizedGroupParents(groups, function(key, reason){
    warnings.push(DP + '.groups.' + key + '.parent: ' + reason);
  });
  Object.keys(groups).forEach(function(key){
    var meta = groups[key];
    if (!meta || !Object.prototype.hasOwnProperty.call(meta, 'icon')) return;
    if (typeof meta.icon !== 'string')
      warnings.push(DP + '.groups.' + key + '.icon: must be a string — icon ignored');
    else if (ICON_SET.indexOf(meta.icon) < 0)
      warnings.push(DP + '.groups.' + key + '.icon: unknown icon "' + meta.icon + '" — using "gear" (valid: ' + ICON_SET.join(' ') + ')');
  });
  Object.keys(d.nodes).forEach(function(id){
    if (!placed[id]) warnings.push(DP + '.nodes.' + id + ': defined but not placed in rows or floats — it will not be drawn');
    var n = d.nodes[id] || {};
    if (Object.prototype.hasOwnProperty.call(n, 'delta') && typeof n.delta !== 'boolean')
      warnings.push(DP + '.nodes.' + id + '.delta: must be true or false — ignored');
    if (n.icon && ICON_SET.indexOf(n.icon) < 0) warnings.push(DP + '.nodes.' + id + '.icon: unknown icon "' + n.icon + '" — using "gear" (valid: ' + ICON_SET.join(' ') + ')');
    if (n.tint && TINT_SET.indexOf(n.tint) < 0) warnings.push(DP + '.nodes.' + id + '.tint: unknown tint "' + n.tint + '" — using "cmd" (valid: ' + TINT_SET.join(' ') + ')');
    if (n.link && typeof n.link !== 'string') warnings.push(DP + '.nodes.' + id + '.link: must be a URL string — link ignored');
    if (n.group && !groups[n.group]) warnings.push(DP + '.nodes.' + id + '.group: group "' + n.group + '" not declared in diagram.groups — drawing an untitled boundary');
  });
  var edgeKeys = {};
  (d.edges || []).forEach(function(e, ei){
    var EP = DP + '.edges[' + ei + ']';
    if (e && Object.prototype.hasOwnProperty.call(e, 'delta') && typeof e.delta !== 'boolean')
      warnings.push(EP + '.delta: must be true or false — ignored');
    if (!e || !placed[e.from]) errors.push(EP + '.from: "' + (e && e.from) + '" is not a placed node');
    if (!e || !placed[e.to]) errors.push(EP + '.to: "' + (e && e.to) + '" is not a placed node');
    if (e && e.kind && !protos[e.kind]) warnings.push(EP + '.kind: unknown kind "' + e.kind + '" — using "int"; declare it in page.protocols to style it');
    revealFieldWarnings(e, EP, sectionStepCount, warnings);
    if (e){
      var ek = e.from + '->' + e.to;
      if (edgeKeys[ek])
        warnings.push(EP + ': duplicate edge "' + ek + '" — the engine keys edges by from->to, so the second declaration overrides the first\'s animation and coin anchors; merge them into one edge or make one a return (swap from/to with ret:true)');
      edgeKeys[ek] = true;
    }
  });
  var panelIds = {};
  var panelDeclById = {};
  var queuePanels = {};
  var thermoPanels = {};
  var batteryPanels = {};
  var bufferPanels = {};
  var signalPanels = {};
  var tilesPanels = {};
  var radarPanels = {};
  var homemapPanels = {};
  var inflightPanels = {};
  var phonePanels = {};
  var timelinePanels = {};
  (d.panels || []).forEach(function(p, pi){
    var PP = DP + '.panels[' + pi + ']';
    if (!p || typeof p !== 'object'){ errors.push(PP + ': must be an object {id, type, ...}'); return; }
    if (!p.id){ errors.push(PP + '.id: required'); return; }
    if (panelIds[p.id]) errors.push(PP + '.id: duplicate panel id "' + p.id + '"');
    panelIds[p.id] = true;
    panelDeclById[p.id] = p;
    if (p.type === 'trace'){
      var traceData=tracePanelData(p);
      traceData.errors.concat(traceData.notices).forEach(function(message){ warnings.push(PP+'.'+message); });
      tracePanelPatchWarnings(p.initial,PP+'.initial',p,warnings);
    }
    if (['table','checks','budget'].indexOf(p.type) >= 0)
      softwarePanelWarnings(p, PP, warnings);
    if (p.type === 'replicas') replicaPanelWarnings(p,PP,warnings);
    if (p.type === 'inflight'){
      var laneMap = {};
      inflightPanels[p.id] = {decl:p, lanes:laneMap, open:{}};
      if (!(Array.isArray(p.lanes) && p.lanes.length)){
        warnings.push(PP + '.lanes: inflight needs 1–8 lanes [{id, label}] — panel renders empty');
      } else {
        if (p.lanes.length > 8)
          warnings.push(PP + '.lanes: more than 8 lanes — extra lanes are not rendered');
        p.lanes.slice(0, 8).forEach(function(l, li){
          var LP = PP + '.lanes[' + li + ']';
          if (!l || typeof l !== 'object' || Array.isArray(l) || !l.id){
            warnings.push(LP + ': needs {id, label?} — lane skipped');
          } else if (laneMap[l.id]){
            warnings.push(LP + '.id: duplicate inflight lane id "' + l.id + '" — later lane skipped');
          } else {
            laneMap[l.id] = true;
          }
        });
      }
    }
    if (p.type === 'queue'){
      queuePanels[p.id] = true;
      if (p.initial && p.initial.state != null && QUEUE_STATES.indexOf(String(p.initial.state)) < 0)
        warnings.push(PP + '.initial.state: unknown queue state "' + p.initial.state +
          '" — using "empty" (valid: ' + QUEUE_STATES.join(' ') + ')');
      queueContextWarnings(p.initial, PP + '.initial', warnings);
    }
    if (p.type === 'phone'){
      phonePanels[p.id] = true;
      phoneBrandWarnings(p, PP, warnings);
      phonePatchWarnings(p.initial, PP + '.initial', warnings);
    }
    if (p.type === 'timeline'){
      timelinePanels[p.id] = true;
      if (p.span == null)
        warnings.push(PP + '.span: timeline needs a span ("6h", "90m") — using 1h');
      else if (parseClock(p.span) == null || parseClock(p.span) <= 0)
        warnings.push(PP + '.span: unreadable span "' + p.span + '" (use "6h" / "90m") — using 1h');
      else if (parseClock(p.span) > TIMELINE_MAX_SPAN)
        warnings.push(PP + '.span: longer than the drawable maximum (7d) — clamped to 7d');
      if (p.cadence != null){
        if (typeof p.cadence !== 'object' || parseClock(p.cadence.every) == null || parseClock(p.cadence.every) <= 0)
          warnings.push(PP + '.cadence: expected {every:"30m", label?} with a readable interval — no periodic beats drawn');
        else {
          /* density is judged on the span the model actually DRAWS —
             the clamped one — or a legally long span would warn about
             beats the render happily shows */
          var tlSpanS = parseClock(p.span);
          if (tlSpanS != null) tlSpanS = Math.min(tlSpanS, TIMELINE_MAX_SPAN);
          if (tlSpanS != null && tlSpanS > 0 &&
              Math.floor((tlSpanS + 1e-6) / parseClock(p.cadence.every)) > TIMELINE_MAX_BEATS)
            warnings.push(PP + '.cadence: ' + Math.floor((tlSpanS + 1e-6) / parseClock(p.cadence.every)) +
              ' beats over this span cannot be drawn individually (max ' + TIMELINE_MAX_BEATS +
              ') — the axis renders without beat dots and the meta line reports the count');
        }
      }
      if (p.lanes != null){
        if (!Array.isArray(p.lanes) || !p.lanes.length)
          warnings.push(PP + '.lanes: expected a non-empty array of {id, label?, every} — lanes ignored');
        else {
          if (p.cadence != null)
            warnings.push(PP + '.cadence: ignored when lanes are declared — each lane carries its own every');
          if (p.lanes.length > 4)
            warnings.push(PP + '.lanes: more than 4 lanes — extra lanes are not rendered');
          var laneSeen = {};
          p.lanes.forEach(function(l, li){
            var LP = PP + '.lanes[' + li + ']';
            if (!l || typeof l !== 'object' || l.id == null){
              warnings.push(LP + ': needs {id, label?, every} — lane skipped'); return;
            }
            if (laneSeen[String(l.id)])
              warnings.push(LP + '.id: duplicate lane id "' + l.id + '" — later lane skipped');
            laneSeen[String(l.id)] = true;
            if (parseClock(l.every) == null || parseClock(l.every) <= 0)
              warnings.push(LP + '.every: unreadable interval "' + l.every + '" (use "30s" / "5m" / "2h") — lane skipped');
          });
        }
      }
      timelineEventWarnings(p.events, PP + '.events', warnings);
      timelineEventLaneWarnings(p.events, PP + '.events', timelineLaneIds(p), warnings);
      timelinePatchWarnings(p.initial, PP + '.initial', p, warnings);
    }
    if (PANEL_TYPES.indexOf(p.type) < 0)
      warnings.push(PP + '.type: unknown panel type "' + p.type + '" — rendering a placeholder (valid: ' + PANEL_TYPES.join(' ') + ')');
    if (p.type === 'screen' && p.scene && SCENE_NAMES.indexOf(p.scene) < 0)
      warnings.push(PP + '.scene: unknown scene "' + p.scene + '" — using "static-noise" (valid: ' + SCENE_NAMES.join(' ') + ')');
    if (p.type === 'waterfall' && !(Array.isArray(p.spans) && p.spans.length))
      warnings.push(PP + '.spans: waterfall needs spans:[{id, label, ms}] — panel renders empty');
    if (p.type === 'waterfall' && Array.isArray(p.spans)) p.spans.forEach(function(span, si){
      if (!span || !isFiniteNum(span.ms) || span.ms < 0)
        warnings.push(PP + '.spans[' + si + '].ms: expected a finite non-negative duration');
      if (span && span.startMs != null && (!isFiniteNum(span.startMs) || span.startMs < 0))
        warnings.push(PP + '.spans[' + si + '].startMs: expected a finite non-negative offset — using the previous span end');
    });
    if (p.type === 'orbit' && !(Array.isArray(p.states) && p.states.length))
      warnings.push(PP + '.states: orbit needs states:[...] — panel renders empty');
    if (p.type === 'zoneframe'){
      if (!(Array.isArray(p.zones) && p.zones.length))
        warnings.push(PP + '.zones: zoneframe needs zones:[{id, points}] — panel renders empty');
      else p.zones.forEach(function(z, zi){
        if (!z || !z.id || !Array.isArray(z.points) || z.points.length < 3)
          warnings.push(PP + '.zones[' + zi + ']: needs {id, points:[[x,y]…]} with 3+ points in the 320×180 frame');
      });
    }
    if (p.type === 'xray' && !(Array.isArray(p.layers) && p.layers.length))
      warnings.push(PP + '.layers: xray needs layers:[{id, label, holder}], outermost first — panel renders empty');
    if (p.type === 'pir'){
      var pc = p.cone || {};
      if (typeof pc.spread === 'number' && (pc.spread <= 0 || pc.spread >= 360))
        warnings.push(PP + '.cone.spread: expected degrees in (0,360) — clamped');
      if (typeof pc.range === 'number' && pc.range <= 0)
        warnings.push(PP + '.cone.range: must be a positive reach in the 320×180 frame — using default');
      if (p.sensor && (typeof p.sensor.x !== 'number' || typeof p.sensor.y !== 'number'))
        warnings.push(PP + '.sensor: expected {x, y} in the 320×180 frame — using default (right-mid)');
      if (p.path != null && !(Array.isArray(p.path) && p.path.length >= 2))
        warnings.push(PP + '.path: expected [[x,y]…] with 2+ points — path not drawn');
    }
    if (p.type === 'thermo'){
      thermoPanels[p.id] = true;
      ['min','max','warn','crit'].forEach(function(tk){
        if (p[tk] != null && !isFiniteNum(p[tk]))
          warnings.push(PP + '.' + tk + ': must be a finite number — ignored');
      });
      var tmin = isFiniteNum(p.min) ? p.min : 0;
      if (isFiniteNum(p.max) && p.max <= tmin)
        warnings.push(PP + '.max: must exceed min — using min+100');
      if (isFiniteNum(p.warn) && isFiniteNum(p.crit) && p.warn > p.crit)
        warnings.push(PP + ': warn exceeds crit — thresholds swapped at render');
      if (p.initial && p.initial.value != null && !isFiniteNum(p.initial.value))
        warnings.push(PP + '.initial.value: must be a finite number — rendered as NO DATA');
    }
    if (p.type === 'battery'){
      batteryPanels[p.id] = true;
      ['low','crit'].forEach(function(bk){
        if (p[bk] != null && !isFiniteNum(p[bk]))
          warnings.push(PP + '.' + bk + ': must be a finite number — ignored');
      });
      if (isFiniteNum(p.low) && isFiniteNum(p.crit) && p.crit > p.low)
        warnings.push(PP + ': crit exceeds low — thresholds swapped at render (battery zones are at-or-below)');
      if (p.initial && p.initial.charge != null && !isFiniteNum(p.initial.charge))
        warnings.push(PP + '.initial.charge: must be a finite number — rendered as NO DATA');
    }
    if (p.type === 'tiles'){
      tilesPanels[p.id] = p;
      if (!(Array.isArray(p.tiles) && p.tiles.length))
        warnings.push(PP + '.tiles: tiles needs tiles:[{id, label}] — panel renders empty');
      else {
        if (p.tiles.length > 12)
          warnings.push(PP + '.tiles: more than 12 tiles — extra tiles are not rendered');
        p.tiles.forEach(function(t, tj){
          if (!t || !t.id) warnings.push(PP + '.tiles[' + tj + ']: needs an id — tile skipped');
        });
      }
      tileStateWarnings(p.initial, PP + '.initial', p, warnings);
    }
    if (p.type === 'signal'){
      signalPanels[p.id] = true;
      if (!(Array.isArray(p.links) && p.links.length))
        warnings.push(PP + '.links: signal needs links:[{id, label, transport}] — panel renders empty');
      else {
        if (p.links.length > 6)
          warnings.push(PP + '.links: more than 6 links — extra links are not rendered');
        p.links.forEach(function(l, li){
          if (!l || !l.id)
            warnings.push(PP + '.links[' + li + ']: needs an id — link skipped');
          else if (l.transport != null && SIGNAL_TRANSPORTS_V.indexOf(l.transport) < 0)
            warnings.push(PP + '.links[' + li + '].transport: unknown transport "' + l.transport +
              '" — tag hidden (valid: ' + SIGNAL_TRANSPORTS_V.join(' ') + ')');
        });
      }
      signalLinkWarnings(p.initial, PP + '.initial', warnings);
    }
    if (p.type === 'homemap') homemapPanels[p.id] = homemapDeclarationWarnings(p, PP, warnings);
    if (p.type === 'radar'){
      radarPanels[p.id] = true;
      radarPatchWarnings(p.initial, PP + '.initial', warnings);
      if (p.sensor && !(isFiniteNum(p.sensor.x) && isFiniteNum(p.sensor.y)))
        warnings.push(PP + '.sensor: expected {x, y} in the 320×180 frame — using default (bottom-mid)');
      if (p.spread != null && !(isFiniteNum(p.spread) && p.spread >= 10 && p.spread <= 360))
        warnings.push(PP + '.spread: expected degrees in [10,360] — clamped');
      if (p.range != null && !(isFiniteNum(p.range) && p.range > 0))
        warnings.push(PP + '.range: must be a positive reach in the 320×180 frame — using default');
      if (p.threshold != null && !(isFiniteNum(p.threshold) && p.threshold > 0))
        warnings.push(PP + '.threshold: must be a positive distance — no alert arc drawn');
      if (p.rings != null){
        if (Array.isArray(p.rings)){
          if (!p.rings.some(function(v){ return isFiniteNum(v) && v > 0; }))
            warnings.push(PP + '.rings: array has no positive finite distances — using 3 rings');
        } else if (!isFiniteNum(p.rings)){
          warnings.push(PP + '.rings: expected a count 1–6 or an array of distances — using 3');
        } else if (p.rings < 1 || p.rings > 6){
          warnings.push(PP + '.rings: count out of range — clamped to 1–6');
        }
      }
      if (p.scale != null && !(p.scale && isFiniteNum(p.scale.pxPerUnit) && p.scale.pxPerUnit > 0))
        warnings.push(PP + '.scale: expected {pxPerUnit: <positive number>, unit: "<name>"} — scaling disabled; polar r values render as raw pixels');
      if (p.zones != null){
        if (!Array.isArray(p.zones))
          warnings.push(PP + '.zones: must be an array of {id, label, points} — ignored');
        else p.zones.forEach(function(z, zi){
          var poly = z && Array.isArray(z.points) && z.points.length >= 3;
          var sector = z && Array.isArray(z.r) && z.r.length === 2 &&
                       Array.isArray(z.deg) && z.deg.length === 2;
          if (!z || !z.id || (!poly && !sector)){
            warnings.push(PP + '.zones[' + zi + ']: needs {id, points:[[x,y]…] with 3+ points} or {id, r:[r0,r1], deg:[d0,d1]} — zone skipped');
          } else if (sector && !poly){
            var secOk = isFiniteNum(z.r[0]) && isFiniteNum(z.r[1]) && z.r[0] >= 0 && z.r[1] > z.r[0] &&
                        isFiniteNum(z.deg[0]) && isFiniteNum(z.deg[1]);
            if (!secOk)
              warnings.push(PP + '.zones[' + zi + ']: sector needs finite 0 <= r0 < r1 and finite degrees — zone skipped');
            else if (z.deg[0] === z.deg[1])
              warnings.push(PP + '.zones[' + zi + ']: sector with equal start and end degrees is degenerate — zone skipped (a full circle is deg:[0,360])');
          }
        });
      }
    }
    if (p.type === 'buffer'){
      bufferPanels[p.id] = true;
      if (p.segments != null){
        if (!isFiniteNum(p.segments))
          warnings.push(PP + '.segments: expected a number 2–48 — using 12');
        else if (p.segments < 2 || p.segments > 48)
          warnings.push(PP + '.segments: out of range — clamped to 2–48');
      }
      bufferCellWarnings(p.initial, PP + '.initial', p, warnings);
    }
  });
  var stepIds = {};
  (d.steps || []).forEach(function(st, ti){
    if (st && Object.prototype.hasOwnProperty.call(st, 'delta') && typeof st.delta !== 'boolean')
      warnings.push(DP + '.steps[' + ti + '].delta: must be true or false — ignored');
    var keys = stepKeys(st);
    var failures = stepFailures(st);
    if (st && st.failures != null){
      var FP = DP + '.steps[' + ti + '].failures';
      if (typeof st.failures !== 'object' || Array.isArray(st.failures)) errors.push(FP + ': expected an object mapping edge keys to dropped or blocked');
      else Object.keys(st.failures).forEach(function(key){
        if (!Object.prototype.hasOwnProperty.call(edgeKeys,key)) errors.push(FP + ': unknown edge \"' + key + '\" (format from->to)');
        if (COMM_FAILURE_MODES.indexOf(st.failures[key]) < 0) errors.push(FP + '.' + key + ': expected dropped or blocked');
      });
    }
    var nds = stepNodes(st);
    var patch = stepPanelPatch(st);
    var tonePatch = stepTonePatch(st);
    var hasToneField = !!(st && Object.prototype.hasOwnProperty.call(st, 'tone'));
    if (st && st.id != null){
      if (typeof st.id !== 'string')
        warnings.push(DP + '.steps[' + ti + '].id: must be a string — ignored');
      else if (stepIds[st.id])
        warnings.push(DP + '.steps[' + ti + '].id: duplicate step id "' + st.id + '" — deep links resolve to the first');
      else stepIds[st.id] = true;
    }
    if (!keys.length && !Object.keys(failures).length && !nds.length && !patch && !tonePatch)
      warnings.push(DP + '.steps[' + ti + ']: no edge/edges, nodes, or panels, or tone — give it something to show');
    keys.forEach(function(k){
      if (!edgeKeys[k]) warnings.push(DP + '.steps[' + ti + ']: "' + k + '" matches no edge (format "from->to") — skipped');
    });
    nds.forEach(function(id){
      if (!placed[id]) warnings.push(DP + '.steps[' + ti + '].nodes: "' + id + '" is not a placed node — skipped');
    });
    if (hasToneField && !tonePatch){
      warnings.push(DP + '.steps[' + ti + '].tone: must be an object mapping node ids to tone tokens — ignored (valid: ' +
        TONE_SET.join(' ') + '; null also clears)');
    } else if (tonePatch){
      Object.keys(tonePatch).forEach(function(id){
        var tone = tonePatch[id];
        if (!d.nodes[id]){
          warnings.push(DP + '.steps[' + ti + '].tone: unknown node id "' + id + '" — tone ignored');
        } else if (tone !== null && TONE_SET.indexOf(tone) < 0){
          warnings.push(DP + '.steps[' + ti + '].tone.' + id + ': unknown tone token "' +
            String(tone) + '" — ignored (valid: ' + TONE_SET.join(' ') + '; null also clears)');
        }
      });
    }
    if (patch) Object.keys(patch).forEach(function(pid){
      if (!panelIds[pid]){
        warnings.push(DP + '.steps[' + ti + '].panels: "' + pid + '" is not a declared panel id — patch ignored');
      } else if (patch[pid] == null || typeof patch[pid] !== 'object' || Array.isArray(patch[pid])){
        // a patch must be an object of widget fields — a bare array/scalar is
        // silently ignored by the engine (classic slip: log lines given as
        // panels.<id>: [...] instead of panels.<id>: {"log": [...]})
        warnings.push(DP + '.steps[' + ti + '].panels.' + pid + ': patch must be an object of widget fields — ' +
          (Array.isArray(patch[pid]) ? 'got an array (log lines go in {"log": [...]})' : 'got ' + typeof patch[pid]) +
          '; the engine ignores this patch');
      } else if (queuePanels[pid] && patch[pid]){
        if (patch[pid].state != null && QUEUE_STATES.indexOf(String(patch[pid].state)) < 0)
          warnings.push(DP + '.steps[' + ti + '].panels.' + pid + '.state: unknown queue state "' +
            patch[pid].state + '" — using "empty" (valid: ' + QUEUE_STATES.join(' ') + ')');
        queueContextWarnings(patch[pid], DP + '.steps[' + ti + '].panels.' + pid, warnings);
      } else if (thermoPanels[pid] && patch[pid] && patch[pid].value != null && !isFiniteNum(patch[pid].value)){
        warnings.push(DP + '.steps[' + ti + '].panels.' + pid +
          '.value: must be a finite number — rendered as NO DATA');
      } else if (batteryPanels[pid] && patch[pid] && patch[pid].charge != null && !isFiniteNum(patch[pid].charge)){
        warnings.push(DP + '.steps[' + ti + '].panels.' + pid +
          '.charge: must be a finite number — rendered as NO DATA');
      } else if (bufferPanels[pid] && patch[pid]){
        bufferCellWarnings(patch[pid], DP + '.steps[' + ti + '].panels.' + pid, panelDeclById[pid], warnings);
      } else if (signalPanels[pid] && patch[pid]){
        signalLinkWarnings(patch[pid], DP + '.steps[' + ti + '].panels.' + pid, warnings);
      } else if (tilesPanels[pid] && patch[pid]){
        tileStateWarnings(patch[pid], DP + '.steps[' + ti + '].panels.' + pid, tilesPanels[pid], warnings);
      } else if (homemapPanels[pid] && patch[pid]){
        homemapPatchWarnings(patch[pid], DP + '.steps[' + ti + '].panels.' + pid, homemapPanels[pid], warnings);
      } else if (radarPanels[pid] && patch[pid]){
        radarPatchWarnings(patch[pid], DP + '.steps[' + ti + '].panels.' + pid, warnings);
      } else if (inflightPanels[pid] && patch[pid]){
        inflightPatchWarnings(patch[pid], DP + '.steps[' + ti + '].panels.' + pid,
          inflightPanels[pid], warnings);
      } else if (phonePanels[pid] && patch[pid]){
        phonePatchWarnings(patch[pid], DP + '.steps[' + ti + '].panels.' + pid, warnings);
      } else if (timelinePanels[pid] && patch[pid]){
        timelinePatchWarnings(patch[pid], DP + '.steps[' + ti + '].panels.' + pid, panelDeclById[pid], warnings);
      } else if (panelDeclById[pid].type === 'trace'){
        tracePanelPatchWarnings(patch[pid],DP+'.steps['+ti+'].panels.'+pid,panelDeclById[pid],warnings);
      } else if (panelDeclById[pid].type === 'replicas'){
        replicaPatchWarnings(patch[pid],DP+'.steps['+ti+'].panels.'+pid,panelDeclById[pid],warnings);
      } else if (['table','checks','budget'].indexOf(panelDeclById[pid].type) >= 0){
        softwarePanelPatchWarnings(patch[pid], DP + '.steps[' + ti + '].panels.' + pid, panelDeclById[pid], warnings);
      }
    });
    if (st && st.lane && !lanes[st.lane])
      warnings.push(DP + '.steps[' + ti + '].lane: lane "' + st.lane + '" not declared in page.lanes — neutral pill');
    if (st && st.link && typeof st.link !== 'string') warnings.push(DP + '.steps[' + ti + '].link: must be a URL string — link ignored');
    if (st && Array.isArray(st.packets)) st.packets.forEach(function(pk, ki){
      if (!pk || !edgeKeys[pk.edge]) warnings.push(DP + '.steps[' + ti + '].packets[' + ki + ']: "' + (pk && pk.edge) + '" matches no edge — skipped');
    });
  });
}

function validate(page){
  var errors = [], warnings = [];
  if (!page){ errors.push('top level: expected {page:{blocks:[...]}} (or sections), or a bare diagram with nodes+rows'); return {errors:errors, warnings:warnings}; }
  var blocks = blocksOf(page);
  if (!blocks.length){
    errors.push('page.blocks: required — provide at least one section or tabs block');
    return {errors:errors, warnings:warnings};
  }
  if (page.skin && SKIN_NAMES.indexOf(page.skin) < 0)
    warnings.push('page.skin: unknown skin "' + page.skin + '" — using "aurora" (valid: ' + SKIN_NAMES.join(', ') + ')');
  if (Object.prototype.hasOwnProperty.call(page, 'generatedFrom')){
    var gf = page.generatedFrom;
    if (!gf || typeof gf !== 'object' || Array.isArray(gf)){
      warnings.push('page.generatedFrom: must be an object {url, label?, version?, at?} — provenance line skipped');
    } else {
      ['url', 'label', 'version', 'at'].forEach(function(k){
        if (Object.prototype.hasOwnProperty.call(gf, k) && typeof gf[k] !== 'string')
          warnings.push('page.generatedFrom.' + k + ': must be a string — ' +
            (k === 'url' ? 'provenance line skipped' : 'value ignored'));
      });
      if (!Object.prototype.hasOwnProperty.call(gf, 'url')){
        warnings.push('page.generatedFrom.url: required — provenance line skipped');
      } else if (typeof gf.url === 'string' && !/^https?:\/\//i.test(gf.url)){
        warnings.push('page.generatedFrom.url: only http(s) URLs become links — label rendered as text');
      }
    }
  }
  if (page.contract != null){
    var major = String(page.contract).split('.')[0];
    if (major !== CONTRACT_VERSION)
      warnings.push('page.contract: spec declares contract "' + page.contract +
        '" — this engine implements contract ' + CONTRACT_VERSION +
        '; rendering proceeds but re-check the spec against the current authoring contract');
  }
  var protos = resolveProtocols(page);
  var lanes = resolveLanes(page);
  blocks.forEach(function(b){
    if (b.type === 'section'){
      validateSection(b.sec, b.path, protos, lanes, errors, warnings);
    } else {
      if (!b.tabs.length) warnings.push(b.path + '.tabs: empty tabs block');
      b.tabs.forEach(function(t){
        if (!t.sections.length) warnings.push(t.path + '.sections: tab has no sections');
        t.sections.forEach(function(sec, k){
          validateSection(sec, t.path + '.sections[' + k + ']', protos, lanes, errors, warnings);
        });
      });
    }
  });
  return {errors:errors, warnings:warnings};
}

/* ---------------- node-tone folding ----------------
   Like panel patches, node tones are sparse authoring deltas folded into
   absolute per-step snapshots. Unknown ids/tokens are ignored here (the
   validator warns); `base` and null delete the carried tone. */
function foldNodeTones(d){
  d = d || {};
  var nodes = d.nodes || {};
  var steps = Array.isArray(d.steps) ? d.steps : [];
  var carried = {}, states = [];
  steps.forEach(function(st){
    var patch = stepTonePatch(st);
    if (patch) Object.keys(patch).forEach(function(id){
      if (!Object.prototype.hasOwnProperty.call(nodes, id)) return;
      var tone = patch[id];
      if (tone === null || tone === 'base'){
        delete carried[id];
      } else if (TONE_SET.indexOf(tone) >= 0 && tone !== 'base'){
        carried[id] = tone;
      }
    });
    var snap = {};
    Object.keys(carried).forEach(function(id){ snap[id] = carried[id]; });
    states.push(snap);
  });
  if (!steps.length) states.push({});
  return states;
}

/* ---------------- panel-state folding ----------------
   Authors emit sparse per-step patches; we fold them into COMPLETE state per
   step at load time, so any step jump renders from absolute state, never
   deltas. Rules:
   - state N = shallow merge of state N-1 and step N's patch for that panel;
   - a "log" patch key APPENDS (cumulative array of lines);
   - an "enterOnce" sub-object applies only at its own step (not carried). */
function foldInflightStates(panel, steps){
  panel = panel || {};
  steps = Array.isArray(steps) ? steps : [];
  var lanes = {};
  (Array.isArray(panel.lanes) ? panel.lanes : []).slice(0, 8).forEach(function(l){
    if (l && l.id && !lanes[l.id]) lanes[l.id] = true;
  });
  var bars = [], open = {}, states = [];
  function cloneBars(){
    return bars.map(function(b){
      return {lane:b.lane, label:b.label, start:b.start, end:b.end, state:b.state};
    });
  }
  steps.forEach(function(st, stepIdx){
    var all = stepPanelPatch(st) || {};
    var patch = all[panel.id];
    patch = patch && typeof patch === 'object' && !Array.isArray(patch) ? patch : {};
    (Array.isArray(patch.start) ? patch.start : []).forEach(function(op){
      if (!op || typeof op !== 'object' || !lanes[op.lane]) return;
      if (open[op.lane] != null) bars[open[op.lane]].end = stepIdx;
      var bar = {lane:op.lane,
                 label:op.label != null ? String(op.label) : '',
                 start:stepIdx, end:null, state:'ok'};
      bars.push(bar);
      open[op.lane] = bars.length - 1;
    });
    (Array.isArray(patch.end) ? patch.end : []).forEach(function(lane){
      if (!lanes[lane] || open[lane] == null) return;
      bars[open[lane]].end = stepIdx;
      delete open[lane];
    });
    (Array.isArray(patch.mark) ? patch.mark : []).forEach(function(op){
      if (!op || typeof op !== 'object' || !lanes[op.lane] || open[op.lane] == null) return;
      bars[open[op.lane]].state = INFLIGHT_STATES.indexOf(op.state) >= 0 ? op.state : 'ok';
    });
    states.push({bars:cloneBars(), currentStep:stepIdx, stepCount:steps.length});
  });
  if (!steps.length) states.push({bars:[], currentStep:0, stepCount:0});
  return states;
}

/* Fold phone operations into absolute snapshots. The complete unread stack
   is retained newest-step-first; a single step's array keeps authored order.
   `_phoneAdded` is presentation metadata for the one-shot newest-card cue and
   is recomputed per target step, never carried. */
function foldPhoneStates(panel, steps){
  panel = panel || {};
  steps = Array.isArray(steps) ? steps : [];
  var clock = '', notifications = [], states = [];
  function validNotification(n){
    return n && typeof n === 'object' && !Array.isArray(n) &&
      typeof n.app === 'string' && !!n.app;
  }
  function cleanNotification(n){
    return {app:n.app,
      title:typeof n.title === 'string' ? n.title : '',
      text:typeof n.text === 'string' ? n.text : ''};
  }
  function apply(patch){
    patch = patch && typeof patch === 'object' && !Array.isArray(patch) ? patch : {};
    if (typeof patch.clock === 'string') clock = patch.clock;
    if (patch.clear === true) notifications = [];
    if (!Object.prototype.hasOwnProperty.call(patch, 'notify')) return 0;
    var raw = Array.isArray(patch.notify) ? patch.notify : [patch.notify];
    var pushed = raw.filter(validNotification).map(cleanNotification);
    if (pushed.length) notifications = pushed.concat(notifications);
    return pushed.length;
  }
  apply(panel.initial);
  steps.forEach(function(st){
    var all = stepPanelPatch(st) || {};
    var added = apply(all[panel.id]);
    states.push({clock:clock, notifications:notifications.map(cleanNotification),
      _phoneAdded:added});
  });
  if (!steps.length)
    states.push({clock:clock, notifications:notifications.map(cleanNotification), _phoneAdded:0});
  return states;
}

/* Carry device states and subject positions; signals belong only to their authored step. */
function foldHomemapStates(panel, steps){
  var carried = Object.create(null), states = [], subjects = Object.create(null);
  homemapSubjects(panel).forEach(function(sub){ subjects[sub.id] = sub; });
  function apply(patch){
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return;
    Object.keys(patch).forEach(function(k){
      if (k === 'signals') return;
      if (subjects[k] && patch[k] !== null && !homemapSubjectPosition(patch[k])) return;
      carried[k] = patch[k];
    });
  }
  function snapshot(signals){
    var snap = Object.create(null);
    Object.keys(carried).forEach(function(k){ snap[k] = carried[k]; });
    snap.signals = Array.isArray(signals) ? signals.slice() : [];
    return snap;
  }
  apply(panel.initial);
  steps.forEach(function(st){
    var patch = (stepPanelPatch(st) || {})[panel.id];
    apply(patch);
    states.push(snapshot(patch && patch.signals));
  });
  if (!steps.length) states.push(snapshot(null));
  return states;
}

function foldPanelStates(d){
  var panels = d.panels || [];
  var steps = d.steps || [];
  var out = {};
  panels.forEach(function(p){
    if (!p || !p.id) return;
    if (p.type === 'homemap'){
      out[p.id] = foldHomemapStates(p, steps);
      return;
    }
    if (p.type === 'inflight'){
      out[p.id] = foldInflightStates(p, steps);
      return;
    }
    if (p.type === 'phone'){
      out[p.id] = foldPhoneStates(p, steps);
      return;
    }
    var carried = {};
    Object.keys(p.initial || {}).forEach(function(k){ carried[k] = p.initial[k]; });
    var logAcc = [];
    if (Array.isArray(carried.log)){ logAcc = carried.log.slice(); delete carried.log; }
    /* timeline events accumulate across steps like log lines */
    var eventAcc = null, missAcc = null;
    if (p.type === 'timeline'){
      eventAcc = Array.isArray(carried.events) ? carried.events.slice() : [];
      delete carried.events;
      missAcc = Array.isArray(carried.miss) ? carried.miss.slice() : [];
      delete carried.miss;
    }
    var states = [];
    steps.forEach(function(st){
      var patchAll = stepPanelPatch(st) || {};
      var patch = patchAll[p.id] || {};
      var once = null;
      /* a wholesale `cells` patch is a buffer RESET POINT: accumulated mark
         paints from earlier steps must not replay over it, so clear the
         accumulator first (marks in this same patch then apply on top) */
      if (patch.cells !== undefined) carried.mark = [];
      Object.keys(patch).forEach(function(k){
        if (k === 'enterOnce'){ once = patch[k]; return; }
        if (k === 'log'){
          var lines = Array.isArray(patch.log) ? patch.log : [patch.log];
          logAcc = logAcc.concat(lines);
          return;
        }
        if (k === 'events' && eventAcc !== null){
          var evs = Array.isArray(patch.events) ? patch.events : [patch.events];
          eventAcc = eventAcc.concat(evs);
          return;
        }
        if (k === 'miss' && missAcc !== null){
          var ms = Array.isArray(patch.miss) ? patch.miss : [patch.miss];
          missAcc = missAcc.concat(ms);
          return;
        }
        if (k === 'now' && eventAcc !== null){
          /* the validator promises "cursor unchanged" for unreadable
             times — honor it instead of wiping the carried cursor */
          if (parseClock(patch.now) != null) carried.now = patch.now;
          return;
        }
        if (k === 'mark'){
          /* buffer range-paints accumulate across steps (replayed in order
             at render), so any step jump repaints the full history. Long
             stories are COMPACTED: past 64 accumulated ops the paints are
             baked into a materialized cells array and the op list restarts,
             so retained size and replay work stay bounded. */
          var ops = Array.isArray(patch.mark) ? patch.mark : [];
          carried.mark = (Array.isArray(carried.mark) ? carried.mark : []).concat(ops);
          if (carried.mark.length > 64){
            var bn = bufferSegCount(p);
            carried.cells = bufferPaint(bn, carried.cells, carried.mark);
            carried.mark = [];
          }
          return;
        }
        carried[k] = patch[k];
      });
      var snap = {};
      Object.keys(carried).forEach(function(k){ snap[k] = carried[k]; });
      if (once) Object.keys(once).forEach(function(k){ snap[k] = once[k]; });
      if (eventAcc !== null) snap.events = eventAcc.slice();
      if (missAcc !== null) snap.miss = missAcc.slice();
      snap.log = logAcc.slice();
      states.push(snap);
    });
    if (!steps.length){
      var only = {};
      Object.keys(carried).forEach(function(k){ only[k] = carried[k]; });
      if (eventAcc !== null) only.events = eventAcc.slice();
      if (missAcc !== null) only.miss = missAcc.slice();
      only.log = logAcc.slice();
      states.push(only);
    }
    out[p.id] = states;
  });
  return out;
}

/* ---------------- lint (advisory warnings, never errors) ----------------
   Layout-aware heuristics for spec authors who cannot see the render — an
   authoring agent gets these from tools/validate.js before any browser is
   involved. Uses layout()/isWrap() from engine.js (same bundle; call time).
   Defensive: a diagram that fails basic validation is skipped, never thrown
   on. */
var LINT_CHAR_PX = 6.35;      /* mono label width estimate, px per char */
var LINT_CORRIDOR_MAX = 4;    /* cross-row edges per row gap before warning */

function lintDiagram(d, DP, usedKinds, warnings){
  if (!d || !d.nodes || typeof d.nodes !== 'object' ||
      !Array.isArray(d.rows) || !d.rows.length) return;
  (d.edges || []).forEach(function(e){
    if (e && e.kind) usedKinds[e.kind] = true;
  });
  var L;
  try { L = layout(d); } catch (ex){ return; }

  var corridor = {};
  (d.edges || []).forEach(function(e, ei){
    if (!e) return;
    var a = L.pos[e.from], b = L.pos[e.to];
    if (!a || !b) return;
    if (a.row >= 0 && b.row >= 0 && a.row !== b.row){
      var g = Math.min(a.row, b.row);
      corridor[g] = (corridor[g] || 0) + 1;
    }
    if (e.label){
      var chord = Math.sqrt(Math.pow(b.cx - a.cx, 2) + Math.pow(b.cy - a.cy, 2));
      var usable;
      if (isWrap(e, L)) usable = chord * 2.2;
      else if (a.row === b.row && a.row >= 0) usable = Math.max(30, chord - (a.w + b.w) / 2);
      else usable = chord * 1.25;
      var labelPx = String(e.label).length * LINT_CHAR_PX;
      if (labelPx > usable){
        var shown = String(e.label).length > 28 ? String(e.label).slice(0, 25) + '…' : String(e.label);
        warnings.push(DP + '.edges[' + ei + '].label: "' + shown + '" (~' + Math.round(labelPx) +
          'px) is longer than its edge can carry (~' + Math.round(usable) +
          'px) — shorten it, or the auto-layout will push it far off the line');
      }
    }
  });
  Object.keys(corridor).forEach(function(g){
    if (corridor[g] > LINT_CORRIDOR_MAX)
      warnings.push(DP + ': ' + corridor[g] + ' edges cross the corridor between rows ' +
        (Number(g) + 1) + ' and ' + (Number(g) + 2) +
        ' — expect crowding; consider fewer return edges or a second section');
  });

  var firstEdgeAt = {};
  (d.steps || []).forEach(function(st, ti){
    var k = stepDeliveredKeys(st)[0];
    if (!k) return;
    if (firstEdgeAt[k] != null)
      warnings.push(DP + '.steps[' + ti + ']: shares first edge "' + k + '" with steps[' +
        firstEdgeAt[k] + '] — both step coins land on the same midpoint; reorder the edges list of one step');
    else firstEdgeAt[k] = ti;
  });
}

function lintPage(page){
  var warnings = [];
  if (!page) return warnings;
  var usedKinds = {};
  blocksOf(page).forEach(function(b){
    if (b.type === 'section'){
      if (b.sec && b.sec.diagram) lintDiagram(b.sec.diagram, b.path + '.diagram', usedKinds, warnings);
    } else {
      b.tabs.forEach(function(t){
        t.sections.forEach(function(sec, k){
          if (sec && sec.diagram) lintDiagram(sec.diagram, t.path + '.sections[' + k + '].diagram', usedKinds, warnings);
        });
      });
    }
  });
  Object.keys(page.protocols || {}).forEach(function(k){
    if (!usedKinds[k])
      warnings.push('page.protocols.' + k + ': declared but no edge uses kind "' + k + '" — remove it or use it');
  });
  return warnings;
}
