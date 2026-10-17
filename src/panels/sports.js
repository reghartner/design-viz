/* Pure helpers shared by the sports & events marketing panel family. This
   file has no dependency on the renderer or other panel helpers so headless
   tools (tools/seatmap-import.mjs) can evaluate it on its own. Nothing here
   forecasts: every number is formatting or geometry over authored values. */
var SPM_STATUS = ['planned', 'confirmed', 'live', 'done', 'cancelled', 'late'];
var SPM_TONES = ['neutral', 'accent', 'good', 'warn', 'bad'];
var SPM_BOWLS = ['rink', 'oval', 'rectangle', 'pitch'];
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
/* Relative luminance of #RRGGBB, 0 (black) to 1 (white); invalid → 0.5. */
function spmHexLuma(hex) {
  if (typeof hex !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(hex)) return 0.5;
  var r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/* Bowl geometry. The field sits in a 1000×770 viewBox; each ring is a closed
   outline offset outward from it with a small gutter. `rink` is a racetrack
   (two straight sidelines joined by flattened ends, 2:1 inside); `oval`,
   `rectangle` and `pitch` are superellipses. Every outline is traced once as
   a polyline with cumulative arc length and eight region marks, clockwise
   from the start of the left end: end-left, corner-tl, side-top, corner-tr,
   end-right, corner-br, side-bottom, corner-bl. Sections are placed by arc
   fraction on the ring's inner outline and mapped region-by-region onto the
   outer outline, so a sideline section keeps straight edges on a rink. */
var SPM_REGIONS = ['end-left', 'corner-tl', 'side-top', 'corner-tr', 'end-right', 'corner-br', 'side-bottom', 'corner-bl'];
var SPM_REGION_KIND = ['end', 'corner', 'sideline', 'corner', 'end', 'corner', 'sideline', 'corner'];
var SPM_VIEW_HEIGHT = 770;
/* Free-text zones map onto three placement kinds; club counts as sideline. */
function spmZoneKind(zone) {
  if (typeof zone !== 'string') return null;
  var z = zone.toLowerCase();
  if (/corner/.test(z)) return 'corner';
  if (/\bend|goal|baseline/.test(z)) return 'end';
  if (/side|club|bench|centre|center/.test(z)) return 'sideline';
  return null;
}
function spmBowlShape(bowl) {
  switch (bowl) {
    case 'oval': return { kind: 'super', n: 2, a: 190, b: 140, endHalf: 32, corner: 36 };
    case 'rectangle': return { kind: 'super', n: 4, a: 200, b: 130, endHalf: 34, corner: 34 };
    case 'pitch': return { kind: 'super', n: 5, a: 240, b: 150, endHalf: 30, corner: 30 };
    default: return { kind: 'rink', h: 90, r: 90, corner: 45 };
  }
}
function spmSuperPoint(a, b, n, t) {
  var c = Math.cos(t), s = Math.sin(t), e = 2 / n;
  return [
    a * (c < 0 ? -1 : 1) * Math.pow(Math.abs(c), e),
    b * (s < 0 ? -1 : 1) * Math.pow(Math.abs(s), e),
  ];
}
var SPM_RAD = Math.PI / 180;
/* Trace one outline at offset t from the field edge. Returns points (viewBox
   units, centred), cumulative lengths and the nine region boundaries as
   fractions of the perimeter (marks[0] = 0, marks[8] = 1). */
function spmTrace(shape, t) {
  var pts = [], markIdx = [], cx = 500, cy = SPM_VIEW_HEIGHT / 2;
  function push(p) { pts.push([cx + p[0], cy + p[1]]); }
  function mark() { markIdx.push(pts.length); }
  if (shape.kind === 'rink') {
    var h = shape.h + 0.45 * t, rx = shape.r + 0.55 * t, ry = shape.r + t, phi = shape.corner * SPM_RAD;
    var step = SPM_RAD; // one degree
    function arc(ex, from, to) {
      var n = Math.max(1, Math.round((to - from) / step));
      for (var i = 0; i <= n; i++) {
        var th = from + ((to - from) * i) / n;
        push([ex + rx * Math.cos(th), ry * Math.sin(th)]);
      }
    }
    function line(x0, y0, x1, y1) {
      for (var i = 0; i <= 24; i++) push([x0 + ((x1 - x0) * i) / 24, y0 + ((y1 - y0) * i) / 24]);
    }
    mark(); arc(-h, Math.PI / 2 + phi, Math.PI * 1.5 - phi);      // end-left
    mark(); arc(-h, Math.PI * 1.5 - phi, Math.PI * 1.5);          // corner-tl
    mark(); line(-h, -ry, h, -ry);                                 // side-top
    mark(); arc(h, -Math.PI / 2, -Math.PI / 2 + phi);              // corner-tr
    mark(); arc(h, -Math.PI / 2 + phi, Math.PI / 2 - phi);         // end-right
    mark(); arc(h, Math.PI / 2 - phi, Math.PI / 2);                // corner-br
    mark(); line(h, ry, -h, ry);                                   // side-bottom
    mark(); arc(-h, Math.PI / 2, Math.PI / 2 + phi);               // corner-bl
    mark();
  } else {
    var a = shape.a + shape.ka * t, b = shape.b + t, e = shape.endHalf, c = shape.corner;
    var bounds = [180 - e, 180 + e, 180 + e + c, 360 - e - c, 360 - e, 360 + e, 360 + e + c, 540 - e - c, 540 - e];
    for (var r = 0; r < 8; r++) {
      mark();
      var from = bounds[r], to = bounds[r + 1], n = Math.max(2, Math.round((to - from) * 2));
      for (var i = 0; i <= n; i++) push(spmSuperPoint(a, b, shape.n, (from + ((to - from) * i) / n) * SPM_RAD));
    }
    mark();
  }
  var cum = [0];
  for (var k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
  var total = cum[cum.length - 1];
  var marks = markIdx.map(function (idx) { return cum[Math.min(idx, cum.length - 1)] / total; });
  marks[0] = 0; marks[8] = 1;
  return { points: pts, cum: cum, total: total, marks: marks };
}
function spmTracePoint(trace, u) {
  u = u - Math.floor(u);
  var target = u * trace.total, lo = 1, hi = trace.cum.length - 1;
  while (lo < hi) {
    var mid = (lo + hi) >> 1;
    if (trace.cum[mid] < target) lo = mid + 1; else hi = mid;
  }
  var p0 = trace.points[lo - 1], p1 = trace.points[lo], l0 = trace.cum[lo - 1], l1 = trace.cum[lo];
  var f = l1 > l0 ? (target - l0) / (l1 - l0) : 0;
  return [p0[0] + (p1[0] - p0[0]) * f, p0[1] + (p1[1] - p0[1]) * f];
}
/* Map a fraction of one outline onto another region by region, so wedge
   sides meet both outlines at the same place within the same region. */
function spmMapFraction(u, from, to) {
  var wrap = Math.floor(u);
  u -= wrap;
  var i = 0;
  while (i < 7 && u >= from.marks[i + 1]) i++;
  var span = from.marks[i + 1] - from.marks[i];
  var f = span > 0 ? (u - from.marks[i]) / span : 0;
  return wrap + to.marks[i] + f * (to.marks[i + 1] - to.marks[i]);
}
function spmBowl(bowl, rings, options) {
  options = options || {};
  var shape = spmBowlShape(SPM_BOWLS.indexOf(bowl) >= 0 ? bowl : 'rink');
  var count = Math.max(1, Math.min(4, Array.isArray(rings) ? rings.length : 1));
  var height = SPM_VIEW_HEIGHT, mirror = !!options.mirror;
  var budget = (shape.kind === 'rink' ? 375 - shape.r : 375 - shape.b) - 4;
  if (shape.kind === 'super') shape.ka = (488 - shape.a) / budget;
  var gutter = budget * 0.03, thick = (budget - gutter * (count - 1)) / count, ringList = [];
  for (var r = 0; r < count; r++) {
    var t0 = 4 + r * (thick + gutter);
    ringList.push({ inner: spmTrace(shape, t0), outer: spmTrace(shape, t0 + thick) });
  }
  function fix(p) { return [spmRound(p[0]), spmRound(mirror ? height - p[1] : p[1])]; }
  function pathOf(points) {
    return points.map(function (p, i) { var q = fix(p); return (i ? 'L' : 'M') + q[0] + ',' + q[1]; }).join('') + 'Z';
  }
  var fieldTrace = spmTrace(shape, -6);
  var field = pathOf(fieldTrace.points.filter(function (p, i) { return i % 2 === 0; }));
  var fieldLines = '';
  if (shape.kind === 'rink') {
    var c = fix([500, height / 2 - shape.r + 6]), d = fix([500, height / 2 + shape.r - 6]);
    fieldLines = 'M' + c[0] + ',' + c[1] + 'L' + d[0] + ',' + d[1];
  }
  /* Wedge between inner fractions u0 < u1 on ring r. */
  function wedge(ringIndex, u0, u1) {
    var ring = ringList[Math.max(0, Math.min(count - 1, ringIndex | 0))];
    if (!(u1 > u0)) u1 = u0 + 0.01;
    var o0 = spmMapFraction(u0, ring.inner, ring.outer), o1 = spmMapFraction(u1, ring.inner, ring.outer);
    var steps = Math.max(3, Math.ceil((u1 - u0) * 160)), pts = [], j;
    for (j = 0; j <= steps; j++) pts.push(spmTracePoint(ring.inner, u0 + ((u1 - u0) * j) / steps));
    for (j = steps; j >= 0; j--) pts.push(spmTracePoint(ring.outer, o0 + ((o1 - o0) * j) / steps));
    var um = (u0 + u1) / 2, om = (o0 + o1) / 2, pi = spmTracePoint(ring.inner, um), po = spmTracePoint(ring.outer, om);
    var centre = fix([(pi[0] + po[0]) / 2, (pi[1] + po[1]) / 2]);
    return {
      d: pathOf(pts), x: centre[0], y: centre[1],
      arc: ((u1 - u0) * ring.inner.total + (o1 - o0) * ring.outer.total) / 2,
      depth: Math.hypot(po[0] - pi[0], po[1] - pi[1]),
      outerPoints: pts.slice(steps + 1).map(fix), innerPoints: pts.slice(0, steps + 1).map(fix),
    };
  }
  return { bowl: shape.kind === 'rink' ? 'rink' : bowl, width: SPM_VIEW, height: height, mirror: mirror, rings: ringList,
    marks: ringList[0].inner.marks, field: field, fieldLines: fieldLines, wedge: wedge, point: function (ringIndex, u, outer) {
      var ring = ringList[Math.max(0, Math.min(count - 1, ringIndex | 0))];
      return fix(spmTracePoint(outer ? ring.outer : ring.inner, outer ? spmMapFraction(u, ring.inner, ring.outer) : u));
    } };
}
/* Zone-driven placement for one ring. `kinds` is the per-section placement
   kind in authoring order ('end' | 'corner' | 'sideline' | null); `marks` are
   the ring's inner region boundaries; `startRegion` is the region the walk
   begins in (0 = end-left, 2 = side-top). Returns [u0, u1] per section as
   fractions of the inner outline (values may exceed 1 when the walk wraps).
   Without any kind the ring is split evenly from the start region. Regions
   that receive no section give half their arc to each neighbour. */
function spmBowlAllocate(kinds, marks, startRegion) {
  var n = kinds.length, origin = marks[startRegion] || 0, out = [], i;
  if (!n) return out;
  if (!kinds.some(function (k) { return k; })) {
    for (i = 0; i < n; i++) out.push([origin + i / n, origin + (i + 1) / n]);
    return out;
  }
  var order = [], r;
  for (r = 0; r < 8; r++) order.push((startRegion + r) % 8);
  var members = order.map(function () { return []; }), head = [], tail = [], pointer = 0, wrapped = false;
  for (i = 0; i < n; i++) {
    var kind = kinds[i] || SPM_REGION_KIND[order[pointer]], q = -1;
    for (r = pointer; r < 8 && q < 0; r++) if (SPM_REGION_KIND[order[r]] === kind) q = r;
    if (q < 0) {
      if (SPM_REGION_KIND[order[0]] === kind && (pointer > 0 || wrapped)) { wrapped = true; tail.push(i); continue; }
      q = pointer;
    }
    pointer = q;
    if (q === 0 && !wrapped) head.push(i); else if (q === 0) tail.push(i); else members[q].push(i);
  }
  members[0] = tail.concat(head);
  /* Region arcs: straights keep their traced length; each curved end is
     shared by its two corner groups and its end group in proportion to
     their section counts, corners staying at the junctions. Positions are
     measured from the start of the left curve (corner-bl), which never
     moves, and may run below zero or above one; the outline wraps. */
  var lens = [], r2;
  for (r2 = 0; r2 < 8; r2++) lens.push(marks[r2 + 1] - marks[r2]);
  var countOf = [];
  for (r2 = 0; r2 < 8; r2++) countOf.push(members[order.indexOf(r2)].length);
  [[7, 0, 1], [3, 4, 5]].forEach(function (curve) {
    var total = lens[curve[0]] + lens[curve[1]] + lens[curve[2]];
    var sum = countOf[curve[0]] + countOf[curve[1]] + countOf[curve[2]];
    if (sum > 0) curve.forEach(function (idx) { lens[idx] = (total * countOf[idx]) / sum; });
  });
  var cycle = [7, 0, 1, 2, 3, 4, 5, 6], absStart = {}, cursor = marks[7] - 1;
  cycle.forEach(function (idx) { absStart[idx] = cursor; cursor += lens[idx]; });
  var filled = [];
  cycle.forEach(function (idx) { if (countOf[idx]) filled.push(idx); });
  var adjusted = {};
  if (filled.length === 1) adjusted[filled[0]] = [absStart[filled[0]], absStart[filled[0]] + 1];
  else filled.forEach(function (idx, k) {
    var prev = filled[(k + filled.length - 1) % filled.length], next = filled[(k + 1) % filled.length];
    var gapBefore = 0, gapAfter = 0, j;
    for (j = (cycle.indexOf(prev) + 1) % 8; cycle[j] !== idx; j = (j + 1) % 8) gapBefore += lens[cycle[j]];
    for (j = (cycle.indexOf(idx) + 1) % 8; cycle[j] !== next; j = (j + 1) % 8) gapAfter += lens[cycle[j]];
    adjusted[idx] = [absStart[idx] - gapBefore / 2, absStart[idx] + lens[idx] + gapAfter / 2];
  });
  var ranges = new Array(n);
  for (r = 0; r < 8; r++) {
    if (!members[r].length) continue;
    var span = adjusted[order[r]], m = members[r].length;
    members[r].forEach(function (sectionIndex, k) {
      var from = span[0] + ((span[1] - span[0]) * k) / m, to = span[0] + ((span[1] - span[0]) * (k + 1)) / m;
      ranges[sectionIndex] = [from, to];
    });
  }
  return ranges;
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
