/* validator.js — constants, helpers, normalize/validate, panel-state folding.
   Browser-pure fragment: build.py wraps it (with engine.js + a boot file) in one
   IIFE. Contains no DOM access, so tests load it under Node via vm. */

var W = 1180, CARD_H = 54, FLOAT_H = 44, ROW_GAP = 140, STACK_GAP = 46;
var LEFT_X = 110, RIGHT_X = 885;
var ICON_SET = ['terminal','cloud','shield','gear','db','antenna','thermo','pump','router','package','key','server','chip','phone'];
var TINT_SET = ['cmd','auth','data','mqtt','dev'];
/* Per-step node state is semantic narrative state, never an authored color.
   `base` is the explicit clearing token; null clears too. */
var TONE_SET = ['alert','warn','ok','dim','base'];
var VIEW_SET = ['ambient','step','ambient-only'];
var PANEL_TYPES = ['state','leds','gauge','log','screen','waterfall','orbit','zoneframe','xray','queue','pir','thermo','battery','buffer','radar','signal','tiles','inflight','phone','timeline'];
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
  var ids = [];
  ((decl && Array.isArray(decl.lanes)) ? decl.lanes : []).forEach(function(l){
    if (l && l.id != null) ids.push(String(l.id));
  });
  return ids;
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
    (Array.isArray(obj.events) ? obj.events : []).forEach(function(e, i){
      if (e && e.lane != null && laneIds.indexOf(String(e.lane)) < 0)
        warnings.push(path + '.events[' + i + '].lane: unknown lane "' + e.lane + '" — drawn on the axis row');
    });
  }
  if (obj.miss != null){
    if (!Array.isArray(obj.miss))
      warnings.push(path + '.miss: expected an array of {lane, at} — ignored');
    else obj.miss.forEach(function(m, i){
      var MP = path + '.miss[' + i + ']';
      if (!m || typeof m !== 'object'){ warnings.push(MP + ': needs {lane, at} — skipped'); return; }
      if (laneIds.length && (m.lane == null || laneIds.indexOf(String(m.lane)) < 0))
        warnings.push(MP + '.lane: unknown lane "' + m.lane + '" — skipped');
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

/* phone patches are operations, not ordinary shallow-carried fields. Keep
   their accepted shape in one validator used for both initial and steps. */
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
  if (d.view && VIEW_SET.indexOf(d.view) < 0)
    warnings.push(DP + '.view: unknown view "' + d.view + '" — using "ambient" (valid: ' + VIEW_SET.join(', ') + ')');
  if (!d.nodes || typeof d.nodes !== 'object'){ errors.push(DP + '.nodes: required — map of node id to {title, sub, icon, tint}'); return; }
  if (!Array.isArray(d.rows) || d.rows.length === 0){ errors.push(DP + '.rows: required — array of rows, each an array of node ids (nested array = stack)'); return; }

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
  Object.keys(d.nodes).forEach(function(id){
    if (!placed[id]) warnings.push(DP + '.nodes.' + id + ': defined but not placed in rows or floats — it will not be drawn');
    var n = d.nodes[id] || {};
    if (n.icon && ICON_SET.indexOf(n.icon) < 0) warnings.push(DP + '.nodes.' + id + '.icon: unknown icon "' + n.icon + '" — using "gear" (valid: ' + ICON_SET.join(' ') + ')');
    if (n.tint && TINT_SET.indexOf(n.tint) < 0) warnings.push(DP + '.nodes.' + id + '.tint: unknown tint "' + n.tint + '" — using "cmd" (valid: ' + TINT_SET.join(' ') + ')');
    if (n.link && typeof n.link !== 'string') warnings.push(DP + '.nodes.' + id + '.link: must be a URL string — link ignored');
    if (n.group && !groups[n.group]) warnings.push(DP + '.nodes.' + id + '.group: group "' + n.group + '" not declared in diagram.groups — drawing an untitled boundary');
  });
  var edgeKeys = {};
  (d.edges || []).forEach(function(e, ei){
    var EP = DP + '.edges[' + ei + ']';
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
              Math.floor(tlSpanS / parseClock(p.cadence.every)) > TIMELINE_MAX_BEATS)
            warnings.push(PP + '.cadence: ' + Math.floor(tlSpanS / parseClock(p.cadence.every)) +
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
      timelinePatchWarnings(p.initial, PP + '.initial', p, warnings);
    }
    if (PANEL_TYPES.indexOf(p.type) < 0)
      warnings.push(PP + '.type: unknown panel type "' + p.type + '" — rendering a placeholder (valid: ' + PANEL_TYPES.join(' ') + ')');
    if (p.type === 'screen' && p.scene && SCENE_NAMES.indexOf(p.scene) < 0)
      warnings.push(PP + '.scene: unknown scene "' + p.scene + '" — using "static-noise" (valid: ' + SCENE_NAMES.join(' ') + ')');
    if (p.type === 'waterfall' && !(Array.isArray(p.spans) && p.spans.length))
      warnings.push(PP + '.spans: waterfall needs spans:[{id, label, ms}] — panel renders empty');
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
    var keys = stepKeys(st);
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
    if (!keys.length && !nds.length && !patch && !tonePatch)
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
      } else if (radarPanels[pid] && patch[pid]){
        radarPatchWarnings(patch[pid], DP + '.steps[' + ti + '].panels.' + pid, warnings);
      } else if (inflightPanels[pid] && patch[pid]){
        inflightPatchWarnings(patch[pid], DP + '.steps[' + ti + '].panels.' + pid,
          inflightPanels[pid], warnings);
      } else if (phonePanels[pid] && patch[pid]){
        phonePatchWarnings(patch[pid], DP + '.steps[' + ti + '].panels.' + pid, warnings);
      } else if (timelinePanels[pid] && patch[pid]){
        timelinePatchWarnings(patch[pid], DP + '.steps[' + ti + '].panels.' + pid, panelDeclById[pid], warnings);
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

function foldPanelStates(d){
  var panels = d.panels || [];
  var steps = d.steps || [];
  var out = {};
  panels.forEach(function(p){
    if (!p || !p.id) return;
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
    var k = stepKeys(st)[0];
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
