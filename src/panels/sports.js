/* Pure helpers shared by the sports & events marketing panel family. This
   file has no dependency on the renderer or other panel helpers so headless
   tools (tools/seatmap-import.mjs) can evaluate it on its own. Nothing here
   forecasts: every number is formatting or geometry over authored values. */
var SPM_STATUS = ['planned', 'confirmed', 'live', 'done', 'cancelled', 'late'];
var SPM_TONES = ['neutral', 'accent', 'good', 'warn', 'bad'];
var SPM_BOWLS = ['oval', 'horseshoe', 'rectangle', 'pitch'];
var SPM_PATH_COMMANDS = 'MLHVCSQTAZ';
var SPM_PATH_ARITY = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
var SPM_PATH_MAX_CHARS = 2000;
var SPM_VIEW = 1000;
function spmFinite(v) {
  return typeof v === 'number' && isFinite(v);
}
function spmTone(tone) {
  return SPM_TONES.indexOf(tone) >= 0 ? tone : 'neutral';
}
function spmStatus(status) {
  return SPM_STATUS.indexOf(status) >= 0 ? status : 'planned';
}
/* Ids become object keys of authored maps, so they are letter-or-digit led
   identifiers (never `__proto__`) and never a prototype property name. */
function spmSafeId(id) {
  return typeof id === 'string' && id.length <= 32 && /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id) &&
    ['constructor', 'prototype', 'toString', 'valueOf', 'hasOwnProperty'].indexOf(id) < 0;
}
function spmCurrency(code) {
  return typeof code === 'string' && /^[A-Z]{3}$/.test(code) ? code : 'USD';
}
/* "USD 1,234" for whole amounts, "USD 12.50" otherwise; never NaN text. */
function spmMoney(value, currency) {
  if (!spmFinite(value)) return '—';
  var whole = Math.abs(value - Math.round(value)) < 1e-9;
  return spmCurrency(currency) + ' ' + value.toLocaleString('en-US', {
    minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2,
  });
}
/* 950 → "950", 12400 → "12.4k", 1250000 → "1.25M". */
function spmCompact(n) {
  if (!spmFinite(n)) return '—';
  var abs = Math.abs(n), sign = n < 0 ? '-' : '';
  function trim(x, digits) {
    var text = x.toFixed(digits);
    return text.indexOf('.') >= 0 ? text.replace(/\.?0+$/, '') : text;
  }
  if (abs < 1000) return sign + trim(abs, abs < 10 ? 1 : 0);
  if (abs < 1e6) return sign + trim(abs / 1000, abs < 1e4 ? 2 : 1) + 'k';
  if (abs < 1e9) return sign + trim(abs / 1e6, abs < 1e7 ? 2 : 1) + 'M';
  return sign + trim(abs / 1e9, 1) + 'B';
}
/* Percent of den, clamped to 0–100; a zero or invalid denominator gives 0. */
function spmPercent(num, den) {
  if (!spmFinite(num) || !spmFinite(den) || den <= 0) return 0;
  return Math.max(0, Math.min(100, (num / den) * 100));
}
function spmRound(v) {
  return Math.round(v * 10) / 10;
}

/* Bowl geometry. Rings are similar superellipses from the field edge to the
   outer edge of a 1000×770 viewBox; slots run clockwise by equal arc length so
   corner and sideline sections are evenly sized. Slot 0 is centred on the left
   end for closed bowls; a horseshoe opens on the right and slot 0 starts just
   after the opening. Returned wedges are plain M/L/Z paths in viewBox units. */
function spmBowlShape(bowl) {
  switch (bowl) {
    case 'horseshoe': return { n: 2, a: 190, b: 140, gap: Math.PI * 0.42 };
    case 'rectangle': return { n: 4, a: 200, b: 130, gap: 0 };
    case 'pitch': return { n: 5, a: 240, b: 150, gap: 0 };
    default: return { n: 2, a: 190, b: 140, gap: 0 };
  }
}
function spmSuperPoint(a, b, n, t) {
  var c = Math.cos(t), s = Math.sin(t), e = 2 / n;
  return [
    a * (c < 0 ? -1 : 1) * Math.pow(Math.abs(c), e),
    b * (s < 0 ? -1 : 1) * Math.pow(Math.abs(s), e),
  ];
}
function spmBowl(bowl, rings, ringSlots) {
  var shape = spmBowlShape(SPM_BOWLS.indexOf(bowl) >= 0 ? bowl : 'oval');
  var count = Math.max(1, Math.min(4, Array.isArray(rings) ? rings.length : 1));
  var slots = spmFinite(ringSlots) ? Math.max(8, Math.min(32, ringSlots)) : 16;
  var width = SPM_VIEW, height = 770, cx = 500, cy = 385;
  var outerA = 488, outerB = 372;
  var span = 2 * Math.PI - shape.gap;
  var t0 = shape.gap ? shape.gap / 2 : Math.PI;
  /* Arc-length table on the middle of the radial range, shared by all rings. */
  var midA = (shape.a + outerA) / 2, midB = (shape.b + outerB) / 2, samples = 1440, lengths = [0], prev = null;
  for (var i = 0; i <= samples; i++) {
    var p = spmSuperPoint(midA, midB, shape.n, t0 + (span * i) / samples);
    if (prev) lengths.push(lengths[lengths.length - 1] + Math.hypot(p[0] - prev[0], p[1] - prev[1]));
    prev = p;
  }
  var total = lengths[lengths.length - 1];
  function angleAt(u) {
    if (!shape.gap) u = u - Math.floor(u);
    u = Math.max(0, Math.min(1, u));
    var target = u * total, lo = 0, hi = samples;
    while (lo < hi) {
      var mid = (lo + hi) >> 1;
      if (lengths[mid] < target) lo = mid + 1; else hi = mid;
    }
    var k = Math.max(1, lo), frac = lengths[k] === lengths[k - 1] ? 0 : (target - lengths[k - 1]) / (lengths[k] - lengths[k - 1]);
    return t0 + (span * (k - 1 + frac)) / samples;
  }
  var gutter = 0.03, ringList = [];
  for (var r = 0; r < count; r++) {
    var f0 = r / count + (r ? gutter / 2 : 0), f1 = (r + 1) / count - (r + 1 < count ? gutter / 2 : 0);
    ringList.push({
      inner: [shape.a + (outerA - shape.a) * f0, shape.b + (outerB - shape.b) * f0],
      outer: [shape.a + (outerA - shape.a) * f1, shape.b + (outerB - shape.b) * f1],
    });
  }
  function point(radii, u) {
    var t = angleAt(u), p = spmSuperPoint(radii[0], radii[1], shape.n, t);
    return [cx + p[0], cy + p[1]];
  }
  function fieldPath() {
    var d = '';
    for (var i = 0; i < 180; i++) {
      var p = spmSuperPoint(shape.a - 6, shape.b - 6, shape.n, (2 * Math.PI * i) / 180);
      d += (i ? 'L' : 'M') + spmRound(cx + p[0]) + ',' + spmRound(cy + p[1]);
    }
    return d + 'Z';
  }
  function wedge(ringIndex, slot, slotSpan) {
    var ring = ringList[Math.max(0, Math.min(count - 1, ringIndex | 0))];
    var s = spmFinite(slot) ? slot : 0, w = spmFinite(slotSpan) && slotSpan > 0 ? slotSpan : 1;
    var u0 = (shape.gap ? s : s - 0.5) / slots, u1 = u0 + w / slots;
    if (shape.gap) u1 = Math.min(1, u1);
    var steps = Math.max(3, Math.ceil((u1 - u0) * 120)), pts = [], j;
    for (j = 0; j <= steps; j++) pts.push(point(ring.inner, u0 + ((u1 - u0) * j) / steps));
    for (j = steps; j >= 0; j--) pts.push(point(ring.outer, u0 + ((u1 - u0) * j) / steps));
    var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + spmRound(p[0]) + ',' + spmRound(p[1]); }).join('') + 'Z';
    var um = (u0 + u1) / 2, pi = point(ring.inner, um), po = point(ring.outer, um);
    var arc = (u1 - u0) * total * ((ring.inner[0] + ring.outer[0]) / (2 * midA));
    var depth = Math.hypot(po[0] - pi[0], po[1] - pi[1]);
    return { d: d, x: spmRound((pi[0] + po[0]) / 2), y: spmRound((pi[1] + po[1]) / 2), arc: arc, depth: depth };
  }
  return { bowl: bowl, width: width, height: height, slots: slots, rings: ringList, field: fieldPath(), wedge: wedge, point: point };
}

/* Strict SVG path tokenizer. Authored and imported `d` strings are data, so
   anything but the listed commands, finite numbers and separators is refused
   with a reason instead of being passed through to markup. `options.relative`
   also accepts lowercase relative commands (importer input only); `options.range`
   bounds every number (the panel contract uses 0–1000). Returns
   {commands:[{cmd, args:[…]}]} or {error}. */
function spmParsePath(d, options) {
  options = options || {};
  if (typeof d !== 'string' || !d.trim()) return { error: 'expected a non-empty path string' };
  var max = options.maxChars || SPM_PATH_MAX_CHARS;
  if (d.length > max) return { error: 'path longer than ' + max + ' characters' };
  var allowed = options.relative ? SPM_PATH_COMMANDS + SPM_PATH_COMMANDS.toLowerCase() : SPM_PATH_COMMANDS;
  if (/[^\s,A-Za-z0-9.+\-]/.test(d)) return { error: 'unexpected characters in path' };
  var tokens = d.match(/[A-Za-z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) || [];
  var consumed = d.replace(/[\s,]+/g, '').length, seen = tokens.join('').length;
  if (consumed !== seen) return { error: 'unexpected characters in path' };
  var commands = [], cmd = null, args = [], i;
  function flush() {
    if (cmd === null) return null;
    var upper = cmd.toUpperCase(), arity = SPM_PATH_ARITY[upper];
    if (arity === 0) {
      if (args.length) return 'Z takes no numbers';
      commands.push({ cmd: cmd, args: [] });
      return null;
    }
    if (!args.length || args.length % arity) return 'command ' + cmd + ' needs multiples of ' + arity + ' numbers';
    for (var k = 0; k < args.length; k += arity) {
      var slice = args.slice(k, k + arity);
      if (upper === 'A' && (slice[3] !== 0 && slice[3] !== 1 || slice[4] !== 0 && slice[4] !== 1))
        return 'arc flags must be 0 or 1';
      /* Repeated M pairs become L per the SVG spec. */
      commands.push({ cmd: k && upper === 'M' ? (cmd === 'M' ? 'L' : 'l') : cmd, args: slice });
    }
    return null;
  }
  for (i = 0; i < tokens.length; i++) {
    var tok = tokens[i];
    if (/^[A-Za-z]$/.test(tok)) {
      if (allowed.indexOf(tok) < 0) return { error: 'unsupported path command "' + tok + '"' };
      var problem = flush();
      if (problem) return { error: problem };
      cmd = tok;
      args = [];
    } else {
      var num = Number(tok);
      if (!isFinite(num)) return { error: 'non-finite number in path' };
      if (options.range && (num < options.range[0] || num > options.range[1]))
        return { error: 'number ' + tok + ' outside ' + options.range[0] + '–' + options.range[1] };
      if (cmd === null) return { error: 'path must start with a command' };
      args.push(num);
    }
  }
  var tail = flush();
  if (tail) return { error: tail };
  if (!commands.length || commands[0].cmd.toUpperCase() !== 'M') return { error: 'path must start with M' };
  return { commands: commands };
}
/* Rebuild a `d` string from parsed commands with one-decimal numbers. */
function spmPathText(commands) {
  return commands.map(function (c) {
    return c.cmd + c.args.map(function (v) { return String(spmRound(v)); }).join(' ');
  }).join('');
}
/* Convert relative commands to absolute ones (importer input). */
function spmAbsolutePath(commands) {
  var x = 0, y = 0, sx = 0, sy = 0, out = [];
  commands.forEach(function (c) {
    var upper = c.cmd.toUpperCase(), rel = c.cmd !== upper, a = c.args.slice();
    if (rel) {
      if (upper === 'H') a[0] += x;
      else if (upper === 'V') a[0] += y;
      else if (upper === 'A') { a[5] += x; a[6] += y; }
      else for (var k = 0; k < a.length; k += 2) { a[k] += x; a[k + 1] += y; }
    }
    if (upper === 'H') { a = [a[0], y]; upper = 'L'; }
    else if (upper === 'V') { a = [x, a[0]]; upper = 'L'; }
    if (upper === 'M') { sx = a[0]; sy = a[1]; }
    if (upper === 'Z') { x = sx; y = sy; }
    else { x = a[a.length - 2]; y = a[a.length - 1]; }
    out.push({ cmd: upper, args: a });
  });
  return out;
}
/* Apply an affine matrix [a b c d e f] to absolute commands. Arcs survive
   only axis-aligned scaling (b = c = 0); a rotating or skewing matrix over an
   arc returns {error} so the importer can report that element. */
function spmTransformPath(commands, m) {
  var out = [];
  for (var i = 0; i < commands.length; i++) {
    var c = commands[i], a = c.args.slice();
    if (c.cmd === 'A') {
      if (m[1] !== 0 || m[2] !== 0) return { error: 'arc under a rotating or skewing transform' };
      a[0] = Math.abs(a[0] * m[0]);
      a[1] = Math.abs(a[1] * m[3]);
      if (m[0] * m[3] < 0) a[4] = a[4] ? 0 : 1;
      var px = m[0] * a[5] + m[2] * a[6] + m[4], py = m[1] * a[5] + m[3] * a[6] + m[5];
      a[5] = px; a[6] = py;
    } else {
      for (var k = 0; k < a.length; k += 2) {
        var x = a[k], y = a[k + 1];
        a[k] = m[0] * x + m[2] * y + m[4];
        a[k + 1] = m[1] * x + m[3] * y + m[5];
      }
    }
    out.push({ cmd: c.cmd, args: a });
  }
  return { commands: out };
}
/* Every coordinate pair of absolute commands (control points included). */
function spmPathPoints(commands) {
  var pts = [];
  commands.forEach(function (c) {
    if (c.cmd === 'A') pts.push([c.args[5], c.args[6]]);
    else for (var k = 0; k + 1 < c.args.length; k += 2) pts.push([c.args[k], c.args[k + 1]]);
  });
  return pts;
}
function spmPathBBox(commands) {
  var pts = spmPathPoints(commands), box = null;
  pts.forEach(function (p) {
    if (!box) box = { x: p[0], y: p[1], right: p[0], bottom: p[1] };
    box.x = Math.min(box.x, p[0]); box.y = Math.min(box.y, p[1]);
    box.right = Math.max(box.right, p[0]); box.bottom = Math.max(box.bottom, p[1]);
  });
  if (!box) return null;
  return { x: box.x, y: box.y, width: box.right - box.x, height: box.bottom - box.y };
}
/* Scale a chart's absolute path into the 1000-wide viewBox, preserving
   aspect: `bbox` is the bounding box of the WHOLE chart so every section
   shares one scale. Accepts a `d` string (absolute commands) or parsed
   commands; returns {d, scale} or {error}. */
function spmNormalizePath(d, bbox) {
  var parsed = typeof d === 'string' ? spmParsePath(d, { relative: true, maxChars: 65536 }) : { commands: d };
  if (parsed.error) return parsed;
  if (!bbox || !spmFinite(bbox.width) || !spmFinite(bbox.height) || bbox.width <= 0)
    return { error: 'chart bounding box must have a positive width' };
  var scale = SPM_VIEW / bbox.width;
  var moved = spmTransformPath(spmAbsolutePath(parsed.commands), [scale, 0, 0, scale, -bbox.x * scale, -bbox.y * scale]);
  if (moved.error) return moved;
  return { d: spmPathText(moved.commands), scale: scale };
}
