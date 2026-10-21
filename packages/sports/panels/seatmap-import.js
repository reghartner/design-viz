/* Seating-chart import shared by tools/seatmap-import.mjs and the workbench's
   Venue map inspector (Import seating chart…). Turns a CSV of sections into a
   generic rink bowl, or an SVG seating chart into paths geometry, with a
   report of everything it skipped. Pure text in, plain data out: nothing is
   fetched, no markup is kept and no script runs. The strict path tokenizer
   and normaliser are the panel's own (packages/sports/panels/sports.js); venue entries
   follow packages/sports/panels/venue-library.js. Loaded after both, in the workbench
   bundle only; the CLI evaluates the same three files headlessly. */
var SeatmapImport = (function () {
'use strict';
var SECTION_ID = /^[A-Za-z]{0,3}\d{1,4}[A-Za-z]?$/;
var MAX_SECTIONS = 160;
var RINK_ID = 'rink-outline';
/* The sports helpers by name, read at call time. */
function helpers() {
  return {
    spmSafeId: spmSafeId, spmZoneKind: spmZoneKind, spmParsePath: spmParsePath, spmAbsolutePath: spmAbsolutePath,
    spmTransformPath: spmTransformPath, spmPathBBox: spmPathBBox, spmNormalizePath: spmNormalizePath, spmPathText: spmPathText,
    SPM_PATH_MAX_CHARS: SPM_PATH_MAX_CHARS, SPM_VIEW: SPM_VIEW,
  };
}
function orZero(v) { return v === null ? 0 : v; }
function slug(text) {
  const out = String(text).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return /^[a-z0-9]/.test(out) ? out.slice(0, 32) : 'ring-' + out.slice(0, 27);
}
function positiveInt(text) {
  if (!/^\d{1,9}$/.test(String(text).trim())) return null;
  const n = Number(text);
  return n >= 1 ? n : null;
}
function zoneKind(zone) {
  return helpers().spmZoneKind(zone);
}
/* Even split of `total` over `count` blank rows, remainder on the first rows. */
function evenSplit(total, count) {
  if (!Number.isSafeInteger(total) || total < count) throw new Error('--capacity-total must be a whole number of at least ' + count + ' (one seat per blank row)');
  const base = Math.floor(total / count), rem = total - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < rem ? 1 : 0));
}
function capacityNote(blank, total, totalGiven) {
  if (!blank) return null;
  return totalGiven ? 'illustrative even split' : 'capacities defaulted to 1 (no --capacity-total given)';
}

/* ---------- CSV ---------- */
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(cell => cell.trim() !== ''));
}
function importCsv(text, options = {}) {
  const S = helpers();
  const rows = parseCsv(text.replace(/^﻿/, ''));
  if (!rows.length) throw new Error('CSV is empty');
  const header = rows[0].map(h => h.trim().toLowerCase());
  const col = {};
  ['id', 'level', 'zone', 'capacity', 'label'].forEach(name => { col[name] = header.indexOf(name); });
  for (const name of ['id', 'level', 'zone', 'capacity'])
    if (col[name] < 0) throw new Error('CSV header needs id,level,zone,capacity[,label]; missing "' + name + '"');
  const report = { input: 'csv', rows: rows.length - 1, skipped: [], extraColumns: header.filter(h => !(h in col)) };
  const levels = [], byLevel = new Map(), seen = new Set(), entries = [];
  rows.slice(1).forEach((cells, i) => {
    const line = i + 2, get = name => (col[name] >= 0 ? (cells[col[name]] || '').trim() : '');
    const id = get('id'), level = get('level'), zone = get('zone'), capacity = get('capacity'), label = get('label');
    if (!S.spmSafeId(id)) { report.skipped.push({ line, id, reason: 'id must be letters/digits/-/_ starting with a letter or digit' }); return; }
    if (seen.has(id)) { report.skipped.push({ line, id, reason: 'duplicate id' }); return; }
    if (!level) { report.skipped.push({ line, id, reason: 'blank level' }); return; }
    let cap = null;
    if (capacity !== '') {
      cap = positiveInt(capacity);
      if (cap === null) { report.skipped.push({ line, id, reason: 'capacity must be a whole number ≥ 1 or blank' }); return; }
    }
    seen.add(id);
    if (!byLevel.has(level)) { byLevel.set(level, []); levels.push(level); }
    const entry = { id, level, zone: zone.slice(0, 24), capacity: cap, label: label.slice(0, 40) };
    if (zone.length > 24) report.skipped.push({ line, id, reason: 'zone longer than 24 characters — truncated' });
    byLevel.get(level).push(entry);
    entries.push(entry);
  });
  if (!entries.length) throw new Error('no usable rows');
  if (levels.length > 4) throw new Error('more than 4 distinct levels (' + levels.join(', ') + '); a seatmap has 1–4 rings');
  if (entries.length > MAX_SECTIONS) throw new Error('more than ' + MAX_SECTIONS + ' sections');
  const blank = entries.filter(e => e.capacity === null);
  if (blank.length) {
    const split = options.capacityTotal != null ? evenSplit(options.capacityTotal, blank.length) : blank.map(() => 1);
    blank.forEach((e, i) => { e.capacity = split[i]; });
  }
  const ringIds = new Map();
  const rings = levels.map(level => {
    let id = slug(level), n = 2;
    while ([...ringIds.values()].includes(id)) id = slug(level) + '-' + n++;
    ringIds.set(level, id);
    return { id, label: level };
  });
  /* Sections keep CSV order; the panel places them by zone (sideline, corner,
     end, club) walking each ring from the left end, so no slots are emitted. */
  const sections = [], zoneless = [];
  levels.forEach(level => {
    byLevel.get(level).forEach(e => {
      const section = { id: e.id, ring: ringIds.get(level), capacity: e.capacity };
      if (e.zone) section.zone = e.zone;
      if (e.label) section.label = e.label;
      if (!zoneKind(e.zone)) zoneless.push(e.id);
      sections.push(section);
    });
  });
  const fragment = { geometry: 'bowl', bowl: 'rink', rings, sections };
  const note = capacityNote(blank.length, options.capacityTotal, options.capacityTotal != null);
  if (note) fragment.capacityNote = note;
  Object.assign(report, {
    rings: rings.map(r => ({ id: r.id, label: r.label, sections: byLevel.get(r.label).length })),
    sections: sections.length, zoneless,
    capacities: { given: entries.length - blank.length, filled: blank.length, total: (options.capacityTotal != null ? options.capacityTotal : null), note },
  });
  return { fragment, report };
}

/* ---------- SVG ---------- */
function decodeEntities(text) {
  return text.replace(/&(amp|lt|gt|quot|apos|#x[0-9a-fA-F]+|#\d+);/g, (m, name) => {
    if (name === 'amp') return '&';
    if (name === 'lt') return '<';
    if (name === 'gt') return '>';
    if (name === 'quot') return '"';
    if (name === 'apos') return "'";
    const code = name[1] === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
    return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : '';
  });
}
function parseAttributes(text) {
  const attrs = {};
  const re = /([^\s=\/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let m;
  while ((m = re.exec(text))) attrs[m[1].toLowerCase()] = decodeEntities(m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : '');
  return attrs;
}
function multiply(a, b) {
  return [
    a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}
/* translate / scale / matrix compose; anything else returns {error}. */
function parseTransform(text) {
  let m = [1, 0, 0, 1, 0, 0];
  const re = /\s*([A-Za-z]+)\s*\(([^)]*)\)\s*,?/g;
  let consumed = 0, match;
  while ((match = re.exec(text))) {
    consumed = re.lastIndex;
    const name = match[1], args = match[2].trim().split(/[\s,]+/).filter(Boolean).map(Number);
    if (args.some(n => !Number.isFinite(n))) return { error: 'non-finite number in transform ' + name };
    let t;
    if (name === 'translate' && (args.length === 1 || args.length === 2)) t = [1, 0, 0, 1, args[0], args[1] || 0];
    else if (name === 'scale' && (args.length === 1 || args.length === 2)) t = [args[0], 0, 0, args.length === 2 ? args[1] : args[0], 0, 0];
    else if (name === 'matrix' && args.length === 6) t = args;
    else return { error: 'unsupported transform ' + name + '(' + match[2].trim() + ')' };
    m = multiply(m, t);
  }
  if (consumed !== text.length && text.trim()) return { error: 'unreadable transform "' + text.trim() + '"' };
  return { matrix: m };
}
function num(value) {
  const n = Number(value);
  return value !== undefined && value !== '' && Number.isFinite(n) ? n : null;
}
function elementPath(name, attrs, S) {
  if (name === 'path') {
    const parsed = S.spmParsePath(attrs.d, { relative: true, maxChars: 65536 });
    if (parsed.error) return { error: 'path ' + parsed.error };
    return { commands: S.spmAbsolutePath(parsed.commands) };
  }
  if (name === 'polygon') {
    const nums = (attrs.points || '').trim().split(/[\s,]+/).filter(Boolean).map(Number);
    if (nums.length < 6 || nums.length % 2 || nums.some(n => !Number.isFinite(n))) return { error: 'polygon needs at least three finite x,y pairs' };
    const commands = [];
    for (let i = 0; i < nums.length; i += 2) commands.push({ cmd: i ? 'L' : 'M', args: [nums[i], nums[i + 1]] });
    commands.push({ cmd: 'Z', args: [] });
    return { commands };
  }
  if (name === 'rect') {
    const x = orZero(num(attrs.x)), y = orZero(num(attrs.y)), w = num(attrs.width), h = num(attrs.height);
    if (w === null || h === null || w <= 0 || h <= 0) return { error: 'rect needs positive width and height' };
    return { commands: [{ cmd: 'M', args: [x, y] }, { cmd: 'L', args: [x + w, y] }, { cmd: 'L', args: [x + w, y + h] }, { cmd: 'L', args: [x, y + h] }, { cmd: 'Z', args: [] }] };
  }
  if (name === 'circle') {
    const cx = orZero(num(attrs.cx)), cy = orZero(num(attrs.cy)), r = num(attrs.r);
    if (r === null || r <= 0) return { error: 'circle needs a positive r' };
    return { commands: [{ cmd: 'M', args: [cx - r, cy] }, { cmd: 'A', args: [r, r, 0, 1, 0, cx + r, cy] }, { cmd: 'A', args: [r, r, 0, 1, 0, cx - r, cy] }, { cmd: 'Z', args: [] }] };
  }
  return null;
}
/* Simplify an overlong M/L/Z path to fit the panel limit by dropping the
   smallest-area vertex across all of its subpaths, one at a time. Every M
   and Z is kept, so compound sections (an outer ring with a hole, a split
   section) keep their subpath count and closures; a closed subpath never
   drops below three points and an open one below two. Curves return null;
   so does a path that still does not fit at that minimum. */
function fitPolyline(commands, S) {
  if (!commands.length || !commands.every(c => c.cmd === 'M' || c.cmd === 'L' || c.cmd === 'Z')) return null;
  const subs = [];
  let cur = null, start = null;
  commands.forEach(c => {
    if (c.cmd === 'M') { start = [c.args[0], c.args[1]]; cur = { pts: [start.slice()], closed: false }; subs.push(cur); }
    else if (c.cmd === 'L') {
      if (!cur) { cur = { pts: [start ? start.slice() : [c.args[0], c.args[1]]], closed: false }; subs.push(cur); }
      cur.pts.push([c.args[0], c.args[1]]);
    } else if (cur) { cur.closed = true; cur = null; }
  });
  const text = () => S.spmPathText([].concat(...subs.map(sub =>
    sub.pts.map((p, i) => ({ cmd: i ? 'L' : 'M', args: p })).concat(sub.closed ? [{ cmd: 'Z', args: [] }] : []))));
  const area = (a, b, c) => Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]));
  let removed = 0, d = text();
  while (d.length > S.SPM_PATH_MAX_CHARS) {
    let best = null, bestArea = Infinity;
    subs.forEach(sub => {
      const n = sub.pts.length;
      if (sub.closed ? n <= 3 : n <= 2) return;
      for (let i = sub.closed ? 0 : 1; i < (sub.closed ? n : n - 1); i++) {
        const a = sub.pts[(i + n - 1) % n], b = sub.pts[i], c = sub.pts[(i + 1) % n], v = area(a, b, c);
        if (v < bestArea) { bestArea = v; best = { sub, i }; }
      }
    });
    if (!best) return null;
    best.sub.pts.splice(best.i, 1); removed++;
    d = text();
  }
  return { d, removed, subpaths: subs.length };
}
function inferRing(id) {
  const digits = (id.match(/\d+/) || [''])[0];
  if (!digits) return null;
  return digits.length >= 3 ? digits.slice(0, -2).replace(/^0+(?=\d)/, '') : digits[0];
}
function parseLevelMap(text) {
  const map = new Map();
  if (!text) return map;
  text.split(',').forEach(pair => {
    const at = pair.indexOf(':');
    if (at < 0) throw new Error('--level-map entries are key:label, got "' + pair + '"');
    const key = pair.slice(0, at).trim(), label = pair.slice(at + 1).trim();
    if (!key || !label) throw new Error('--level-map entries are key:label, got "' + pair + '"');
    map.set(key, label);
  });
  return map;
}
function importSvg(text, options = {}) {
  const S = helpers();
  const levelMap = options.levelMap && typeof options.levelMap.get === 'function' ? options.levelMap : parseLevelMap(options.levelMap);
  const report = { input: 'svg', found: 0, kinds: {}, skipped: [], ignored: [], simplified: [], capacities: { given: 0, defaulted: 0 } };
  /* Drop everything that is not element markup; nothing here is executed. */
  let src = text.replace(/<!--[\s\S]*?-->/g, '').replace(/<\?[\s\S]*?\?>/g, '').replace(/<!DOCTYPE[^>[]*(\[[\s\S]*?\])?\s*>/gi, '').replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '');
  const tagRe = /<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[^\s=\/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*(\/?)>/g;
  const stack = [{ name: '#root', matrix: [1, 0, 0, 1, 0, 0], bad: null, id: null, defs: false }];
  const candidates = [];
  let m, rink = null;
  while ((m = tagRe.exec(src))) {
    const closing = m[1] === '/', name = m[2].toLowerCase(), selfClosing = m[4] === '/';
    if (closing) { if (stack.length > 1) stack.pop(); continue; }
    if (name === 'style' || name === 'script') {
      /* Skip the whole subtree including its closing tag, so the ancestor
         stack (transforms, level-map groups) is left exactly as it was. */
      report.ignored.push('<' + name + '>');
      if (!selfClosing) {
        const lower = src.toLowerCase(), close = lower.indexOf('</' + name, tagRe.lastIndex);
        const end = close < 0 ? -1 : src.indexOf('>', close);
        tagRe.lastIndex = end < 0 ? src.length : end + 1;
      }
      continue;
    }
    const attrs = parseAttributes(m[3]);
    const parent = stack[stack.length - 1];
    let matrix = parent.matrix, bad = parent.bad;
    if (attrs.transform !== undefined && !bad) {
      const t = parseTransform(attrs.transform);
      if (t.error) bad = t.error + ' on <' + name + (attrs.id ? ' id="' + attrs.id + '"' : '') + '>';
      else matrix = multiply(parent.matrix, t.matrix);
    }
    const frame = { name, matrix, bad, id: attrs.id || null, defs: parent.defs || name === 'defs' };
    const sectionId = attrs['data-section'] || attrs.id || '';
    /* The rink outline: a <rect id="rink-outline"> (or data-field="rink")
       becomes the panel's `field`, drawn under the sections. */
    if (name === 'rect' && (attrs.id === RINK_ID || attrs['data-field'] === 'rink')) {
      const where = { id: attrs.id || RINK_ID, element: 'rect' };
      const x = orZero(num(attrs.x)), y = orZero(num(attrs.y)), w = num(attrs.width), h = num(attrs.height);
      if (frame.defs) report.skipped.push(Object.assign(where, { reason: 'rink outline inside <defs>; templates are never placed' }));
      else if (bad) report.skipped.push(Object.assign(where, { reason: bad }));
      else if (matrix[1] !== 0 || matrix[2] !== 0) report.skipped.push(Object.assign(where, { reason: 'rink outline under a rotating or skewing transform' }));
      else if (w === null || h === null || w <= 0 || h <= 0) report.skipped.push(Object.assign(where, { reason: 'rink outline needs positive width and height' }));
      else if (rink) report.skipped.push(Object.assign(where, { reason: 'second rink outline — the first one is kept' }));
      else {
        const xs = [matrix[0] * x + matrix[4], matrix[0] * (x + w) + matrix[4]], ys = [matrix[3] * y + matrix[5], matrix[3] * (y + h) + matrix[5]];
        rink = { x: Math.min(xs[0], xs[1]), y: Math.min(ys[0], ys[1]), width: Math.abs(xs[1] - xs[0]), height: Math.abs(ys[1] - ys[0]) };
      }
      if (!selfClosing) stack.push(frame);
      continue;
    }
    if (['path', 'polygon', 'rect', 'circle'].includes(name) && sectionId) {
      if (!SECTION_ID.test(sectionId) || !S.spmSafeId(sectionId)) report.skipped.push({ id: sectionId, element: name, reason: 'id does not look like a section id (letters? digits letter?)' });
      else if (frame.defs) report.skipped.push({ id: sectionId, element: name, reason: 'inside <defs>; templates are never placed' });
      else if (bad) report.skipped.push({ id: sectionId, element: name, reason: bad });
      else {
        const shape = elementPath(name, attrs, S);
        if (shape.error) report.skipped.push({ id: sectionId, element: name, reason: shape.error });
        else {
          const moved = S.spmTransformPath(shape.commands, matrix);
          if (moved.error) report.skipped.push({ id: sectionId, element: name, reason: moved.error });
          else {
            let ring = null;
            for (let i = stack.length - 1; i >= 1 && !ring; i--) if (stack[i].id && levelMap.has(stack[i].id)) ring = stack[i].id;
            if (!ring) ring = inferRing(sectionId);
            if (!ring) report.skipped.push({ id: sectionId, element: name, reason: 'no ring: the id has no digits and no --level-map group contains it' });
            else {
              const capacity = positiveInt(attrs['data-capacity'] || '');
              if (attrs['data-capacity'] !== undefined && capacity === null)
                report.skipped.push({ id: sectionId, element: name, reason: 'data-capacity "' + attrs['data-capacity'] + '" is not a whole number ≥ 1 — capacity defaulted' });
              candidates.push({ id: sectionId, element: name, commands: moved.commands, ring, capacity, zone: (attrs['data-zone'] || '').trim().slice(0, 24), label: (attrs['data-label'] || '').trim().slice(0, 40) });
            }
          }
        }
      }
    }
    if (!selfClosing) stack.push(frame);
  }
  const seen = new Set(), sections = [];
  candidates.forEach(c => {
    if (seen.has(c.id)) { report.skipped.push({ id: c.id, element: c.element, reason: 'duplicate id' }); return; }
    seen.add(c.id);
    sections.push(c);
  });
  if (!sections.length) throw new Error('no section elements found (path/polygon/rect/circle with an id or data-section like 101 or 201A)');
  if (sections.length > MAX_SECTIONS) throw new Error('more than ' + MAX_SECTIONS + ' sections');
  const all = [].concat(...sections.map(s => s.commands));
  const bbox = S.spmPathBBox(all);
  if (!bbox || bbox.width <= 0 || bbox.height <= 0) throw new Error('sections have no area');
  /* Scale by the longer side so BOTH axes land inside the tokenizer's 0–1000
     range while preserving aspect; the viewBox takes the scaled dimensions,
     each clamped to the panel's 100–4000 range. Clamping only ever enlarges
     a side, so coordinates stay inside the box. */
  const scale = S.SPM_VIEW / Math.max(bbox.width, bbox.height);
  /* Round up (never down) so the box always contains the scaled geometry. */
  const side = v => Math.min(4000, Math.max(100, Math.ceil(v * scale - 1e-9)));
  const viewBox = { width: side(bbox.width), height: side(bbox.height) };
  /* Numeric ring keys sort inside → out; named groups keep first-seen order after them. */
  const seenKeys = [...new Set(sections.map(s => s.ring))];
  const ringKeys = seenKeys.filter(k => /^\d+$/.test(k)).sort((a, b) => Number(a) - Number(b)).concat(seenKeys.filter(k => !/^\d+$/.test(k)));
  if (ringKeys.length > 4) throw new Error('more than 4 rings inferred (' + ringKeys.join(', ') + '); pass --level-map or edit the ids');
  const rings = ringKeys.map(key => ({ id: slug(key), label: levelMap.get(key) || 'Level ' + key }));
  const blank = sections.filter(s => s.capacity === null);
  if (blank.length) {
    const split = options.capacityTotal != null ? evenSplit(options.capacityTotal, blank.length) : blank.map(() => 1);
    blank.forEach((s, i) => { s.capacity = split[i]; });
  }
  /* Never emit a path the panel would reject: simplify long polylines
     (Visvalingam, smallest-area vertex first) to fit the 2,000-character
     limit, and skip anything else that fails the panel's own tokenizer. */
  const out = [];
  sections.forEach(s => {
    const normalised = S.spmNormalizePath(s.commands, bbox, { scale });
    let d = normalised.d, simplified = 0;
    if (d.length > S.SPM_PATH_MAX_CHARS) {
      const fitted = fitPolyline(S.spmAbsolutePath(S.spmParsePath(d, { relative: true, maxChars: 1 << 20 }).commands), S);
      if (!fitted) {
        const curved = /[CSQTAcsqta]/.test(d);
        report.skipped.push({ id: s.id, element: s.element, reason: 'path is ' + d.length + ' characters after normalisation (limit ' + S.SPM_PATH_MAX_CHARS + ') and ' +
          (curved ? 'uses curves that cannot be simplified' : 'stays over the limit even at the minimum points per subpath') + ' — redraw it with fewer commands' });
        return;
      }
      simplified = fitted.removed; d = fitted.d;
    }
    const check = S.spmParsePath(d, { range: [0, S.SPM_VIEW] });
    if (check.error) { report.skipped.push({ id: s.id, element: s.element, reason: 'normalised path rejected by the panel: ' + check.error }); return; }
    const section = { id: s.id, ring: slug(s.ring), path: d, capacity: s.capacity };
    if (s.zone) section.zone = s.zone;
    if (s.label) section.label = s.label;
    report.kinds[s.element] = (report.kinds[s.element] || 0) + 1;
    if (simplified) report.simplified.push({ id: s.id, removed: simplified, length: d.length });
    out.push(section);
  });
  if (!out.length) throw new Error('every section was skipped; see the report');
  const fragment = { geometry: 'paths', viewBox, rings, sections: out };
  let field = null;
  if (rink) {
    const r1 = v => Math.round(v * 10) / 10;
    field = { shape: 'rink', x: r1((rink.x - bbox.x) * scale), y: r1((rink.y - bbox.y) * scale), width: r1(rink.width * scale), height: r1(rink.height * scale) };
    if (field.x < 0 || field.y < 0 || field.x + field.width > viewBox.width || field.y + field.height > viewBox.height || field.width < 10 || field.height < 10) {
      report.skipped.push({ id: RINK_ID, element: 'rect', reason: 'rink outline falls outside the sections\' bounding box or is under 10 units — omitted' });
      field = null;
    } else fragment.field = field;
  }
  const note = capacityNote(blank.length, options.capacityTotal, options.capacityTotal != null);
  if (note) fragment.capacityNote = note;
  Object.assign(report, {
    found: out.length, viewBox, field, ringSource: levelMap.size ? 'level-map groups, else leading digits' : 'leading digits of each section id',
    rings: rings.map(r => ({ id: r.id, label: r.label, sections: out.filter(s => s.ring === r.id).length })),
    capacities: { given: sections.length - blank.length, defaulted: blank.length, total: (options.capacityTotal != null ? options.capacityTotal : null), note },
  });
  return { fragment, report };
}

function formatReport(report, inputName) {
  const lines = ['seatmap-import: ' + report.input.toUpperCase() + ' ' + inputName];
  if (report.input === 'csv') {
    lines.push('  rings: ' + report.rings.length + ' (' + report.rings.map(r => r.label + ': ' + r.sections).join(', ') + ')');
    lines.push('  sections: ' + report.sections + ' of ' + report.rows + ' rows · placed by zone' +
      (report.zoneless.length ? '; ' + report.zoneless.length + ' without a recognised zone (sideline/corner/end/club): ' + report.zoneless.slice(0, 8).join(', ') + (report.zoneless.length > 8 ? ', …' : '') : ''));
    const c = report.capacities;
    lines.push('  capacities: ' + c.given + ' given, ' + c.filled + (c.filled ? (c.total != null ? ' filled as an illustrative even split of ' + c.total : ' defaulted to 1 (no --capacity-total)') : ' blank'));
    if (report.extraColumns.length) lines.push('  ignored columns: ' + report.extraColumns.join(', '));
  } else {
    lines.push('  sections found: ' + report.found + ' (' + Object.entries(report.kinds).map(([k, v]) => k + ' ' + v).join(', ') + ')');
    lines.push('  rings: ' + report.rings.map(r => r.id + ' "' + r.label + '": ' + r.sections).join(', ') + ' · from ' + report.ringSource);
    lines.push('  viewBox: ' + report.viewBox.width + '×' + report.viewBox.height + ' (aspect preserved; the longer side is 1000 units)');
    lines.push('  field: ' + (report.field ? 'rink outline ' + report.field.width + '×' + report.field.height + ' at ' + report.field.x + ',' + report.field.y : 'none (add <rect id="' + RINK_ID + '"> to draw the rink)'));
    const c = report.capacities;
    lines.push('  capacities: ' + c.given + ' from data-capacity, ' + c.defaulted + (c.defaulted ? (c.total != null ? ' filled as an illustrative even split of ' + c.total : ' defaulted to 1 (no --capacity-total)') : ' defaulted'));
    if (report.ignored.length) lines.push('  ignored: ' + [...new Set(report.ignored)].join(', '));
    if (report.simplified.length) lines.push('  simplified to fit the 2,000-character path limit: ' + report.simplified.map(s => s.id + ' (−' + s.removed + ' points, ' + s.length + ' chars)').join(', '));
  }
  lines.push('  skipped: ' + (report.skipped.length ? report.skipped.length + ' element' + (report.skipped.length === 1 ? '' : 's') : 'none'));
  report.skipped.forEach(s => lines.push('    - ' + (s.line ? 'line ' + s.line + ' ' : '') + (s.element ? '<' + s.element + '> ' : '') + (s.id ? '"' + s.id + '" ' : '') + '— ' + s.reason));
  return lines.join('\n');
}

/* One entry point for a file of either kind, as the CLI and the workbench
   receive it: SVG by extension or by an <svg> tag near the start. */
function isSvgText(text, name) {
  return /\.svg$/i.test(name || '') || /<svg[\s>]/i.test(String(text).slice(0, 4096));
}
function importText(text, name, options) {
  return isSvgText(text, name) ? importSvg(text, options || {}) : importCsv(text, options || {});
}
/* A venue library entry from an import fragment: {id, name, location?,
   note?, capacityNote?, seatmap}. `meta.landmarks` ([{id,label,x,y}]) are
   kept as authored; the panel validator checks them against the viewBox. */
function venueEntry(fragment, meta) {
  meta = meta || {};
  if (!helpers().spmSafeId(meta.id)) throw new Error('--venue needs a letter-or-digit-led id of up to 32 characters, such as ubs-arena');
  if (typeof meta.name !== 'string' || !meta.name.trim()) throw new Error('--venue-name is required with --venue');
  var entry = { id: meta.id, name: meta.name.trim() };
  if (meta.location) entry.location = String(meta.location).trim();
  if (meta.note) entry.note = String(meta.note).trim();
  if (fragment.capacityNote) entry.capacityNote = fragment.capacityNote;
  var seatmap = {};
  Object.keys(fragment).forEach(function (key) { if (key !== 'capacityNote') seatmap[key] = fragment[key]; });
  if (meta.landmarks && meta.landmarks.length) seatmap.landmarks = meta.landmarks;
  entry.seatmap = seatmap;
  return entry;
}
/* The text of a venue file: one SeatmapVenues.define call with a JSON
   literal, `<` escaped so the file is safe inside an inline script. */
function venueSource(entry, inputName) {
  /* Comment text is reduced to plain characters: no `<`, `>`, `*`, `/` or
     line breaks can close the comment or an inline <script>. */
  var comment = function (text) { return String(text).slice(0, 120).replace(/[^A-Za-z0-9 _.,:;()'&+-]/g, '_'); };
  return '/* Seatmap venue: ' + comment(entry.name + (entry.location ? ', ' + entry.location : '')) + '. Data only: generated by\n' +
    '   tools/seatmap-import.mjs from ' + comment(inputName) + '; regenerate it rather than editing it.\n' +
    '   See packages/sports/panels/venue-library.js and packages/sports/cookbook/venue-map.md. */\n' +
    'SeatmapVenues.define(' + JSON.stringify(entry, null, 2).replace(/</g, '\\u003c') + ');\n';
}

return {
  importCsv: importCsv, importSvg: importSvg, importText: importText, parseTransform: parseTransform, parseLevelMap: parseLevelMap,
  evenSplit: evenSplit, fitPolyline: fitPolyline, formatReport: formatReport, venueEntry: venueEntry, venueSource: venueSource,
  isSvg: isSvgText,
};
})();
