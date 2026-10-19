/* locus panel: a linear map of a genome, chromosome or gene region. A
   horizontal bar carries authored features on up to four rows, point markers
   above it, arcs that connect two positions, and a ruler with nice ticks. All
   positions are 1-based bases typed in the spec; nothing is computed from
   real data. Shared range and tone helpers live in ../bio.js; the sequence
   panel owns the `.bio-tone-*` colours this file reuses on HTML blocks. */
var LOCUS_MAX_LENGTH = 10000000000;
var LOCUS_MAX_FEATURES = 48;
var LOCUS_MAX_MARKERS = 24;
var LOCUS_MAX_ARCS = 12;
var LOCUS_ROWS = 4;
var LOCUS_UNITS = { bp: 1, kb: 1000, Mb: 1000000 };
var LOCUS_UNIT_DECIMALS = { bp: 0, kb: 2, Mb: 3 };
var LOCUS_STATE_KEYS = ['markers', 'arcs', 'window', 'highlight'];
/* Tone colours come from the sequence panel's `.bio-tone-*` classes, which set
   `--bio-tone`; SVG strokes read that variable with the neutral ink as fallback.
   Vertical geometry in CSS pixels; the SVG is 1000 units wide and stretched
   horizontally, so x coordinates are percentages × 10 and y is in pixels. */
var LOCUS_WIDTH = 1000;
var LOCUS_ARC_H = 56;
var LOCUS_MARK_H = 26;
var LOCUS_ROW_H = 16;
var LOCUS_ROW_GAP = 2;
var LOCUS_TRACK_PAD = 3;
var LOCUS_RULER_H = 26;
/* When no step ever draws an arc, the arc band shrinks to this sliver so the
   map does not reserve empty space above the markers. */
var LOCUS_ARC_H_COMPACT = 2;
/* When some step zooms in, a thin overview strip of the whole length sits on
   top (an ideogram) with the window bracketed and zoom guides fanning down to
   the track, so "x of y · zoomed" reads at a glance. Reserved for every step
   of such a panel, so the map keeps one height while it zooms. */
var LOCUS_IDEO_H = 10;
var LOCUS_IDEO_STRIP = { top: 2, height: 6 };
var LOCUS_IDEO_WIN = { top: 0, height: 10 };
/* Such a panel gives the strip back in the marker band and ruler, so the
   ideogram costs at most 4 px of height overall. */
var LOCUS_IDEO_MARK_H = 24;
var LOCUS_IDEO_RULER_H = 22;
/* True when the declaration or any folded step shows less than the whole length. */
function locusHasZoom(panel, states) {
  var length = locusLength(panel);
  if (length === null) return false;
  return [panel && panel.initial].concat(Array.isArray(states) ? states : []).some(function (state) {
    if (!panelObject(state) || !panelObject(state.window)) return false;
    var win = locusWindow(state, length);
    return win.from !== 1 || win.to !== length;
  });
}
/* True when the declaration or any folded step carries at least one arc. */
function locusHasArcs(panel, states) {
  return [panel && panel.initial].concat(Array.isArray(states) ? states : []).some(function (state) {
    return panelObject(state) && Array.isArray(state.arcs) && state.arcs.length > 0;
  });
}

function locusLength(panel) {
  var value = panel && panel.length;
  return Number.isSafeInteger(value) && value >= 1 && value <= LOCUS_MAX_LENGTH ? value : null;
}
function locusUnit(panel) {
  return panel && Object.prototype.hasOwnProperty.call(LOCUS_UNITS, panel.unit) ? panel.unit : 'bp';
}
/* Formats a base count in the declared unit: "1,200 bp", "1.2 kb", "0.012 Mb". */
function locusFormat(value, unit) {
  unit = Object.prototype.hasOwnProperty.call(LOCUS_UNITS, unit) ? unit : 'bp';
  if (!isFiniteNum(value)) return '—';
  return (value / LOCUS_UNITS[unit]).toLocaleString('en-US', { maximumFractionDigits: LOCUS_UNIT_DECIMALS[unit] }) + ' ' + unit;
}
function locusRow(value) {
  return Number.isInteger(value) && value >= 0 && value < LOCUS_ROWS ? value : null;
}
/* Clean declared features in authored order (unique ids, valid ranges). */
function locusFeatures(panel) {
  var length = locusLength(panel), seen = Object.create(null), out = [];
  (Array.isArray(panel && panel.features) ? panel.features : []).slice(0, LOCUS_MAX_FEATURES).forEach(function (feature) {
    if (!panelObject(feature) || typeof feature.id !== 'string' || !feature.id || seen[feature.id]) return;
    var range = bioRange(feature, '', null, 1, length || undefined);
    if (!range) return;
    seen[feature.id] = true;
    out.push({ id: feature.id, label: typeof feature.label === 'string' && feature.label ? feature.label : feature.id,
      from: range.from, to: length ? Math.min(range.to, length) : range.to, tone: bioTone(feature.tone, 'feature'),
      strand: feature.strand === '-' ? '-' : feature.strand === '+' ? '+' : '', row: locusRow(feature.row) });
  });
  return out;
}
/* Explicit rows are honoured first; the rest take the first of four rows with
   no overlap so far. When all four overlap, the feature shares the last row
   and is flagged crowded. Returns [{row, crowded}] aligned with the input. */
function locusAssignRows(features) {
  var placed = [], out = [];
  for (var r = 0; r < LOCUS_ROWS; r++) placed.push([]);
  function overlaps(row, feature) {
    return row.some(function (other) { return other.from <= feature.to && feature.from <= other.to; });
  }
  features.forEach(function (feature, i) {
    if (feature.row === null) return;
    out[i] = { row: feature.row, crowded: overlaps(placed[feature.row], feature) };
    placed[feature.row].push(feature);
  });
  features.forEach(function (feature, i) {
    if (feature.row !== null) return;
    var row = -1;
    for (var r = 0; r < LOCUS_ROWS && row < 0; r++) if (!overlaps(placed[r], feature)) row = r;
    out[i] = { row: row < 0 ? LOCUS_ROWS - 1 : row, crowded: row < 0 };
    placed[out[i].row].push(feature);
  });
  return out;
}
/* Nice ruler ticks (1, 2, 2.5 or 5 × 10^k) for the inclusive window. Prefers
   5–10 ticks, nearest seven; never more than ten. Very short windows yield
   fewer. Returns ascending integer positions. */
function locusTicks(from, to) {
  if (!bioPosition(from) || !bioPosition(to) || to < from) return [];
  var span = to - from + 1, magnitude = Math.floor(Math.log10(span) + 1e-9);
  var best = null;
  for (var k = -1; k <= 2; k++) {
    var exponent = magnitude + k;
    if (exponent < 0) continue;
    [1, 2, 2.5, 5].forEach(function (m) {
      var step = m * Math.pow(10, exponent);
      if (!Number.isInteger(step) || step < 1) return;
      var first = Math.ceil(from / step) * step, last = Math.floor(to / step) * step;
      var count = last >= first ? Math.round((last - first) / step) + 1 : 0;
      if (count < 1 || count > 10) return;
      var ideal = count >= 5 ? 0 : 1, distance = Math.abs(count - 7);
      if (!best || ideal < best.ideal || (ideal === best.ideal && (distance < best.distance || (distance === best.distance && step > best.step))))
        best = { step: step, first: first, count: count, ideal: ideal, distance: distance };
    });
  }
  var ticks = [];
  if (best) for (var i = 0; i < best.count; i++) ticks.push(best.first + i * best.step);
  return ticks;
}
/* Tick labels are centred on their tick except near the map edges, where a
   centred label would be clipped: within LOCUS_EDGE percent of either edge the
   label hangs inward from the tick instead. */
var LOCUS_EDGE = 6;
function locusTickAnchor(x) {
  return x < LOCUS_EDGE ? 'start' : x > 100 - LOCUS_EDGE ? 'end' : 'middle';
}
/* 0–100 % of the window width for the centre of base `pos`. */
function locusX(pos, win) {
  return (pos - win.from + 0.5) / win.span * 100;
}
/* Left edge and width (%) of the visible part of an inclusive base range. */
function locusSpanX(from, to, win) {
  var left = Math.max(from, win.from), right = Math.min(to, win.to);
  return { x: (left - win.from) / win.span * 100, width: (right - left + 1) / win.span * 100 };
}
/* Arc geometry in SVG units: a quadratic curve from x1 to x2 on `baseY`
   whose apex rises 30–100 % of `areaHeight` with the visible fraction. */
function locusArcGeometry(x1, x2, frac, baseY, areaHeight) {
  var peak = areaHeight * (0.3 + 0.7 * clamp(isFiniteNum(frac) ? frac : 0, 0, 1));
  var apexX = (x1 + x2) / 2, apexY = baseY - peak;
  return { x1: x1, x2: x2, apexX: apexX, apexY: apexY,
    path: 'M' + x1.toFixed(2) + ' ' + baseY + ' Q' + apexX.toFixed(2) + ' ' + (baseY - 2 * peak).toFixed(2) + ' ' + x2.toFixed(2) + ' ' + baseY };
}
function locusWindow(state, length) {
  var win = { from: 1, to: length };
  if (panelObject(state && state.window)) {
    var range = bioRange(state.window, '', null, 1, length);
    if (range) win = { from: Math.max(1, range.from), to: Math.min(length, range.to) };
  }
  win.span = win.to - win.from + 1;
  return win;
}
function locusDeclarationWarnings(panel, path, warnings) {
  var length = locusLength(panel);
  if (length === null)
    warnings.push(path + '.length: expected a whole number of bases from 1 to ' + LOCUS_MAX_LENGTH.toLocaleString('en-US') + ' — panel renders empty');
  if (panel.unit !== undefined && !Object.prototype.hasOwnProperty.call(LOCUS_UNITS, panel.unit))
    warnings.push(path + '.unit: expected bp, kb or Mb — using bp');
  if (panel.label !== undefined && typeof panel.label !== 'string')
    warnings.push(path + '.label: expected text — ignored');
  if (panel.features !== undefined) {
    if (!Array.isArray(panel.features)) warnings.push(path + '.features: expected an array of {id, label, from, to} — ignored');
    else {
      if (panel.features.length > LOCUS_MAX_FEATURES) warnings.push(path + '.features: only the first ' + LOCUS_MAX_FEATURES + ' features render');
      var seen = Object.create(null);
      panel.features.slice(0, LOCUS_MAX_FEATURES).forEach(function (feature, i) {
        var at = path + '.features[' + i + ']';
        if (!panelObject(feature)) { warnings.push(at + ': expected {id, label, from, to} — feature skipped'); return; }
        if (typeof feature.id !== 'string' || !feature.id) { warnings.push(at + '.id: needs a non-empty string — feature skipped'); return; }
        if (seen[feature.id]) { warnings.push(at + '.id: duplicate feature id "' + feature.id + '" — later feature skipped'); return; }
        seen[feature.id] = true;
        var range = bioRange(feature, at, warnings, 1, length || undefined);
        if (range && length && range.to > length) warnings.push(at + '.to: ' + range.to + ' is beyond length ' + length + ' — clipped');
        if (feature.label !== undefined && typeof feature.label !== 'string') warnings.push(at + '.label: expected text — using the id');
        if (feature.tone !== undefined && BIO_TONES.indexOf(feature.tone) < 0) warnings.push(at + '.tone: expected ' + BIO_TONES.join('|') + ' — using feature');
        if (feature.strand !== undefined && feature.strand !== '+' && feature.strand !== '-') warnings.push(at + '.strand: expected "+" or "-" — ignored');
        if (feature.row !== undefined && locusRow(feature.row) === null) warnings.push(at + '.row: expected an integer 0–3 — row assigned automatically');
      });
    }
  }
  locusPatchWarnings(panel.initial, path + '.initial', panel, warnings);
}
function locusStateWarnings(state, path, panel, warnings) {
  var length = locusLength(panel), total = length || LOCUS_MAX_LENGTH, features = locusFeatures(panel);
  Object.keys(state).forEach(function (key) {
    if (LOCUS_STATE_KEYS.indexOf(key) < 0 && !bioCommonStateKey(key))
      warnings.push(path + '.' + key + ': unknown field — ignored');
  });
  if (panelOwn(state, 'note') && state.note !== null && typeof state.note !== 'string')
    warnings.push(path + '.note: expected text — ignored');
  function position(value, at, what) {
    if (!bioPosition(value)) { warnings.push(at + ': expected a 1-based base position — ' + what + ' skipped'); return false; }
    if (value > total) { warnings.push(at + ': position ' + value + ' is beyond length ' + total + ' — ' + what + ' skipped'); return false; }
    return true;
  }
  if (panelOwn(state, 'markers') && state.markers !== null) {
    if (!Array.isArray(state.markers)) warnings.push(path + '.markers: expected an array of {id, at} — ignored');
    else {
      if (state.markers.length > LOCUS_MAX_MARKERS) warnings.push(path + '.markers: only the first ' + LOCUS_MAX_MARKERS + ' markers render');
      var seen = Object.create(null);
      state.markers.slice(0, LOCUS_MAX_MARKERS).forEach(function (marker, i) {
        var at = path + '.markers[' + i + ']';
        if (!panelObject(marker)) { warnings.push(at + ': expected {id, at} — marker skipped'); return; }
        if (typeof marker.id !== 'string' || !marker.id) { warnings.push(at + '.id: needs a non-empty string — marker skipped'); return; }
        if (seen[marker.id]) { warnings.push(at + '.id: duplicate marker id "' + marker.id + '" — later marker skipped'); return; }
        seen[marker.id] = true;
        position(marker.at, at + '.at', 'marker');
        if (marker.label !== undefined && typeof marker.label !== 'string') warnings.push(at + '.label: expected text — using the id');
        if (marker.tone !== undefined && BIO_TONES.indexOf(marker.tone) < 0) warnings.push(at + '.tone: expected ' + BIO_TONES.join('|') + ' — using accent');
      });
    }
  }
  if (panelOwn(state, 'arcs') && state.arcs !== null) {
    if (!Array.isArray(state.arcs)) warnings.push(path + '.arcs: expected an array of {id, from, to} — ignored');
    else {
      if (state.arcs.length > LOCUS_MAX_ARCS) warnings.push(path + '.arcs: only the first ' + LOCUS_MAX_ARCS + ' arcs render');
      var ids = Object.create(null);
      state.arcs.slice(0, LOCUS_MAX_ARCS).forEach(function (arc, i) {
        var at = path + '.arcs[' + i + ']';
        if (!panelObject(arc)) { warnings.push(at + ': expected {id, from, to} — arc skipped'); return; }
        if (typeof arc.id !== 'string' || !arc.id) { warnings.push(at + '.id: needs a non-empty string — arc skipped'); return; }
        if (ids[arc.id]) { warnings.push(at + '.id: duplicate arc id "' + arc.id + '" — later arc skipped'); return; }
        ids[arc.id] = true;
        if (position(arc.from, at + '.from', 'arc') && position(arc.to, at + '.to', 'arc') && arc.from === arc.to)
          warnings.push(at + ': from and to are the same position — arc skipped (use a marker)');
        if (arc.label !== undefined && typeof arc.label !== 'string') warnings.push(at + '.label: expected text — showing the distance');
        if (arc.tone !== undefined && BIO_TONES.indexOf(arc.tone) < 0) warnings.push(at + '.tone: expected ' + BIO_TONES.join('|') + ' — using accent');
      });
    }
  }
  if (panelOwn(state, 'window') && state.window !== null) {
    var range = bioRange(state.window, path + '.window', warnings, 1, total);
    if (range && range.to > total) warnings.push(path + '.window.to: ' + range.to + ' is beyond length ' + total + ' — clipped');
  }
  if (panelOwn(state, 'highlight') && state.highlight !== null) {
    if (typeof state.highlight !== 'string') warnings.push(path + '.highlight: expected a feature id or null — ignored');
    else if (state.highlight && !features.some(function (feature) { return feature.id === state.highlight; }))
      warnings.push(path + '.highlight: unknown feature id "' + state.highlight + '" — nothing highlighted');
  }
}
function locusPatchWarnings(state, path, panel, warnings) {
  softwarePanelPatchWarnings(state, path, panel, warnings, locusStateWarnings);
}
/* Marker labels centre on their pins. Each label is sized roughly (6.4 px a
   character at 10.5 px, plus its pill) on a narrow 320 px map. Neighbours
   that would touch hang apart: the left label ends at its pin and the right
   one starts at its pin. A label that still has no room rises one tier when
   the arc band above is free. Pins near an edge hang their label inward. */
var LOCUS_MARK_MAP_PX = 320;
var LOCUS_MARK_GAP_PX = 6;
function locusMarkerExtent(marker) {
  var w = String(marker.label).length * 6.4 + 10, x = marker.x / 100 * LOCUS_MARK_MAP_PX;
  if (marker.anchor === 'end') return [x - w + 6, x + 6];
  if (marker.anchor === 'start') return [x - 6, x - 6 + w];
  return [x - w / 2, x + w / 2];
}
function locusMarkerLayout(markers, canRise) {
  var shown = markers.filter(function (marker) { return marker.visible; }).sort(function (a, b) { return a.x - b.x; });
  var touch = function (a, b) { return !!a && locusMarkerExtent(a)[1] + LOCUS_MARK_GAP_PX > locusMarkerExtent(b)[0]; };
  markers.forEach(function (marker) { marker.anchor = 'middle'; marker.tier = 0; });
  shown.forEach(function (marker) {
    var half = (String(marker.label).length * 3.2 + 5) / LOCUS_MARK_MAP_PX * 100;
    if (marker.x < half) marker.anchor = 'start';
    else if (marker.x > 100 - half) marker.anchor = 'end';
  });
  var last = [null, null], before = null;
  shown.forEach(function (marker) {
    var prev = last[0];
    if (touch(prev, marker)) {
      if (prev.anchor === 'middle') { prev.anchor = 'end'; if (touch(before, prev)) prev.anchor = 'middle'; }
      if (marker.anchor === 'middle') marker.anchor = 'start';
      if (touch(prev, marker) && canRise && !touch(last[1], marker)) marker.tier = 1;
    }
    if (marker.tier) last[1] = marker; else { before = prev; last[0] = marker; }
  });
}
/* Pure presentation model: everything the renderer draws, in window percent
   (x, width) and pixel geometry, with visibility and clipping decided here. */
function locusModel(panel, state, options) {
  panel = panelObject(panel) ? panel : {};
  state = panelObject(state) ? state : {};
  var length = locusLength(panel), unit = locusUnit(panel), valid = length !== null, total = length || 1;
  var win = locusWindow(state, total);
  var declared = locusFeatures(panel), rows = locusAssignRows(declared);
  var highlight = typeof state.highlight === 'string' && state.highlight ? state.highlight : null;
  var highlightFound = highlight !== null && declared.some(function (feature) { return feature.id === highlight; });
  var rowCount = 1;
  var features = declared.map(function (feature, i) {
    var span = locusSpanX(feature.from, feature.to, win);
    rowCount = Math.max(rowCount, rows[i].row + 1);
    var visible = feature.to >= win.from && feature.from <= win.to;
    return { id: feature.id, label: feature.label, from: feature.from, to: feature.to, tone: feature.tone, strand: feature.strand,
      row: rows[i].row, crowded: rows[i].crowded, visible: visible,
      x: span.x, width: span.width, clippedLeft: visible && feature.from < win.from, clippedRight: visible && feature.to > win.to,
      highlight: highlightFound && feature.id === highlight, dim: highlightFound && feature.id !== highlight };
  });
  var trackHeight = rowCount * LOCUS_ROW_H + (rowCount - 1) * LOCUS_ROW_GAP + 2 * LOCUS_TRACK_PAD;
  var arcHeight = options && options.compactArcs ? LOCUS_ARC_H_COMPACT : LOCUS_ARC_H;
  var ideoHeight = options && options.ideogram && valid ? LOCUS_IDEO_H : 0;
  var barTop = ideoHeight + arcHeight + (ideoHeight ? LOCUS_IDEO_MARK_H : LOCUS_MARK_H), barBottom = barTop + trackHeight;
  var geometry = { width: LOCUS_WIDTH, ideoHeight: ideoHeight, arcHeight: arcHeight, markerTop: ideoHeight + arcHeight, barTop: barTop, trackHeight: trackHeight,
    rowHeight: LOCUS_ROW_H, rowGap: LOCUS_ROW_GAP, trackPad: LOCUS_TRACK_PAD, barBottom: barBottom, height: barBottom + (ideoHeight ? LOCUS_IDEO_RULER_H : LOCUS_RULER_H) };
  var seen = Object.create(null), markers = [];
  (Array.isArray(state.markers) ? state.markers : []).slice(0, LOCUS_MAX_MARKERS).forEach(function (marker) {
    if (!panelObject(marker) || typeof marker.id !== 'string' || !marker.id || seen[marker.id] || !bioPosition(marker.at) || marker.at > total) return;
    seen[marker.id] = true;
    markers.push({ id: marker.id, at: marker.at, label: typeof marker.label === 'string' && marker.label ? marker.label : marker.id,
      tone: bioTone(marker.tone, 'accent'), visible: marker.at >= win.from && marker.at <= win.to, x: locusX(marker.at, win) });
  });
  locusMarkerLayout(markers, arcHeight > LOCUS_ARC_H_COMPACT);
  var arcIds = Object.create(null), arcs = [];
  (Array.isArray(state.arcs) ? state.arcs : []).slice(0, LOCUS_MAX_ARCS).forEach(function (arc) {
    if (!panelObject(arc) || typeof arc.id !== 'string' || !arc.id || arcIds[arc.id] || !bioPosition(arc.from) || !bioPosition(arc.to) ||
        arc.from > total || arc.to > total || arc.from === arc.to) return;
    arcIds[arc.id] = true;
    var left = Math.min(arc.from, arc.to), right = Math.max(arc.from, arc.to), visible = right >= win.from && left <= win.to;
    var x1 = clamp(locusX(left, win), 0, 100), x2 = clamp(locusX(right, win), 0, 100);
    var shape = locusArcGeometry(x1 * 10, x2 * 10, (x2 - x1) / 100, barTop, Math.max(arcHeight - 10, 0));
    arcs.push({ id: arc.id, from: arc.from, to: arc.to, left: left, right: right, reversed: arc.from > arc.to, distance: right - left,
      label: typeof arc.label === 'string' && arc.label ? arc.label : locusFormat(right - left, unit), custom: typeof arc.label === 'string' && !!arc.label,
      tone: bioTone(arc.tone, 'accent'), visible: visible, x1: x1, x2: x2,
      clippedLeft: visible && left < win.from, clippedRight: visible && right > win.to, apexX: shape.apexX / 10, apexY: shape.apexY, path: shape.path });
  });
  /* Every tick gets a line; with more than six, every other one is labelled
     so labels stay apart in a narrow card. */
  var positions = locusTicks(win.from, win.to), labelEvery = positions.length > 6 ? 2 : 1;
  var ticks = positions.map(function (at, i) {
    var x = locusX(at, win);
    return { at: at, x: x, label: locusFormat(at, unit), labelled: i % labelEvery === 0, anchor: locusTickAnchor(x) };
  });
  /* Overview strip in percent of the whole length (not the window). */
  var ideogram = ideoHeight ? {
    features: declared.map(function (feature, i) {
      return { id: feature.id, tone: feature.tone, x: (feature.from - 1) / total * 100, width: (feature.to - feature.from + 1) / total * 100,
        highlight: features[i].highlight };
    }),
    win: { x: (win.from - 1) / total * 100, width: win.span / total * 100 } } : null;
  return { valid: valid, length: length, unit: unit, label: typeof panel.label === 'string' ? panel.label : '', window: win, ideogram: ideogram,
    zoomed: win.from !== 1 || win.to !== total, features: features, rowCount: rowCount, markers: markers, arcs: arcs, ticks: ticks,
    highlight: highlight, highlightFound: highlightFound, geometry: geometry };
}
function locusHTML(panel, state, options) {
  state = panelObject(state) ? state : {};
  var model = locusModel(panel, state, options), g = model.geometry, h = '';
  var pct = function (value) { return clamp(value, 0, 100).toFixed(3) + '%'; };
  var span = locusFormat(model.window.from, model.unit).replace(/ \w+$/, '') + '–' + locusFormat(model.window.to, model.unit);
  var visibleFeatures = model.features.filter(function (feature) { return feature.visible; });
  var summary = (model.label ? model.label + ': ' : '') + (model.zoomed ? 'window ' + span + ' of ' : '') + locusFormat(model.length || 0, model.unit) +
    ', ' + visibleFeatures.length + (visibleFeatures.length === 1 ? ' feature' : ' features') +
    (model.markers.length ? ', ' + model.markers.length + (model.markers.length === 1 ? ' marker' : ' markers') : '') +
    (model.arcs.length ? ', ' + model.arcs.length + (model.arcs.length === 1 ? ' arc' : ' arcs') : '') +
    (model.highlightFound ? ', highlighting ' + model.highlight : '');
  h += '<div class="locus-panel"><div class="locus-head' + (model.ideogram ? ' locus-head-ideo' : '') + '"><span class="locus-title">' + esc(model.label || 'Genome map') + '</span><span class="locus-meta">' +
    esc((model.zoomed ? span + ' of ' : '') + locusFormat(model.length || 0, model.unit) + (model.zoomed ? ' · zoomed' : '')) + '</span></div>';
  if (!model.valid) return softwarePanelShell(h + '<p class="locus-empty">Declare a length in bases to draw the map.</p></div>', state);
  h += '<div class="locus-map" role="img" aria-label="' + esc('Genome map: ' + summary) + '" style="height:' + g.height + 'px">';
  h += '<svg class="locus-svg" viewBox="0 0 ' + g.width + ' ' + g.height + '" preserveAspectRatio="none" aria-hidden="true" focusable="false">';
  if (model.ideogram && model.zoomed) {
    /* Zoom guides: a faint trapezoid from the bracketed window on the strip
       down to the full width of the track. */
    var wl = (model.ideogram.win.x * 10).toFixed(2), wr = ((model.ideogram.win.x + model.ideogram.win.width) * 10).toFixed(2),
      wy = LOCUS_IDEO_WIN.top + LOCUS_IDEO_WIN.height;
    h += '<polygon class="locus-zoom" points="' + wl + ',' + wy + ' ' + wr + ',' + wy + ' ' + g.width + ',' + g.barTop + ' 0,' + g.barTop + '"/>';
    h += '<line class="locus-zoomline" x1="' + wl + '" y1="' + wy + '" x2="0" y2="' + g.barTop + '" vector-effect="non-scaling-stroke"/>';
    h += '<line class="locus-zoomline" x1="' + wr + '" y1="' + wy + '" x2="' + g.width + '" y2="' + g.barTop + '" vector-effect="non-scaling-stroke"/>';
  }
  h += '<rect class="locus-track" x="0" y="' + g.barTop + '" width="' + g.width + '" height="' + g.trackHeight + '"/>';
  for (var r = 0; r < model.rowCount; r++) {
    var mid = (g.barTop + g.trackPad + r * (g.rowHeight + g.rowGap) + g.rowHeight / 2).toFixed(1);
    h += '<line class="locus-backbone" x1="0" y1="' + mid + '" x2="' + g.width + '" y2="' + mid + '" vector-effect="non-scaling-stroke"/>';
  }
  h += '<line class="locus-base" x1="0" y1="' + g.barBottom + '" x2="' + g.width + '" y2="' + g.barBottom + '" vector-effect="non-scaling-stroke"/>';
  model.ticks.forEach(function (tick) {
    var x = (tick.x * 10).toFixed(2);
    h += '<line class="locus-tickline" x1="' + x + '" y1="' + g.barBottom + '" x2="' + x + '" y2="' + (g.barBottom + 6) + '" vector-effect="non-scaling-stroke"/>';
  });
  model.markers.forEach(function (marker) {
    if (!marker.visible) return;
    var x = (marker.x * 10).toFixed(2);
    h += '<line class="locus-pin bio-tone-' + marker.tone + '" x1="' + x + '" y1="' + (g.markerTop + 12) + '" x2="' + x + '" y2="' + g.barTop + '" vector-effect="non-scaling-stroke"/>';
    h += '<line class="locus-guide bio-tone-' + marker.tone + '" x1="' + x + '" y1="' + g.barTop + '" x2="' + x + '" y2="' + (g.barBottom + 6) + '" vector-effect="non-scaling-stroke"/>';
  });
  model.arcs.forEach(function (arc) {
    if (!arc.visible) return;
    h += '<path class="locus-arc' + (arc.reversed ? ' locus-arc-reversed' : '') + ' bio-tone-' + arc.tone + '" d="' + arc.path + '" vector-effect="non-scaling-stroke"/>';
  });
  h += '</svg><div class="locus-layer">';
  if (model.ideogram) {
    h += '<span class="locus-ideo" aria-hidden="true" style="top:' + LOCUS_IDEO_STRIP.top + 'px;height:' + LOCUS_IDEO_STRIP.height + 'px">';
    model.ideogram.features.forEach(function (feature) {
      h += '<i class="bio-tone-' + feature.tone + (feature.highlight ? ' locus-hl' : '') + '" style="left:' + pct(feature.x) + ';width:' + pct(feature.width) + '"></i>';
    });
    h += '</span><b class="locus-ideo-win' + (model.zoomed ? '' : ' locus-ideo-all') + '" aria-hidden="true" style="left:' + pct(model.ideogram.win.x + model.ideogram.win.width / 2) + ';width:' + pct(model.ideogram.win.width) +
      ';top:' + LOCUS_IDEO_WIN.top + 'px;height:' + LOCUS_IDEO_WIN.height + 'px"></b>';
  }
  model.features.forEach(function (feature) {
    if (!feature.visible) return;
    var top = g.barTop + g.trackPad + feature.row * (g.rowHeight + g.rowGap);
    var title = feature.label + ' ' + locusFormat(feature.from, model.unit) + '–' + locusFormat(feature.to, model.unit) + (feature.strand ? ' (' + feature.strand + ')' : '') +
      (feature.clippedLeft || feature.clippedRight ? ' · continues outside the window' : '') + (feature.crowded ? ' · overlaps another feature on this row' : '');
    h += '<span class="locus-feature bio-tone-' + feature.tone + (feature.highlight ? ' locus-hl' : '') + (feature.dim ? ' locus-dim' : '') +
      (feature.strand === '-' ? ' locus-minus' : feature.strand === '+' ? ' locus-plus' : '') + (feature.width < 8 && !feature.highlight ? ' locus-narrow' : '') +
      (feature.clippedLeft ? ' locus-clip-l' : '') + (feature.clippedRight ? ' locus-clip-r' : '') +
      '" style="left:' + pct(feature.x) + ';width:' + pct(feature.width) + ';top:' + top + 'px;height:' + g.rowHeight + 'px" title="' + esc(title) + '"><i>' + esc(feature.label) + '</i></span>';
  });
  model.markers.forEach(function (marker) {
    if (!marker.visible) return;
    h += '<span class="locus-marker' + (marker.anchor !== 'middle' ? ' locus-mk-' + marker.anchor : '') + (marker.tier ? ' locus-mk-up' : '') + '" style="left:' + pct(marker.x) + ';top:' + g.markerTop + 'px" title="' + esc(marker.label + ' at ' + locusFormat(marker.at, model.unit)) + '">' +
      '<b>' + esc(marker.label) + '</b><span class="locus-marker-dot bio-tone-' + marker.tone + '"></span></span>';
  });
  model.arcs.forEach(function (arc) {
    if (!arc.visible) return;
    h += '<span class="locus-arclabel bio-tone-' + arc.tone + '" style="left:' + pct(arc.apexX) + ';top:' + Math.max(0, arc.apexY - 16).toFixed(1) + 'px" title="' +
      esc(arc.label + (arc.custom ? ' · ' : ': ') + locusFormat(arc.from, model.unit) + (arc.reversed ? ' ← ' : ' → ') + locusFormat(arc.to, model.unit) +
        (arc.custom ? ' · ' + locusFormat(arc.distance, model.unit) : '')) + '">' + esc(arc.label) + '</span>';
  });
  model.ticks.forEach(function (tick) {
    if (!tick.labelled) return;
    h += '<span class="locus-ticklabel locus-anchor-' + tick.anchor + '" style="left:' + pct(tick.x) + ';top:' + (g.barBottom + 8) + 'px">' + esc(tick.label) + '</span>';
  });
  h += '</div></div>';
  if (visibleFeatures.length) {
    h += '<ul class="locus-legend">';
    visibleFeatures.forEach(function (feature) {
      h += '<li' + (feature.highlight ? ' class="locus-hl"' : '') + '><span class="locus-key bio-tone-' + feature.tone + '"></span>' +
        esc(feature.label + (feature.strand ? ' ' + feature.strand : '') + ' · ' + locusFormat(feature.from, model.unit) + '–' + locusFormat(feature.to, model.unit)) + '</li>';
    });
    h += '</ul>';
  } else h += '<p class="locus-empty">' + (model.features.length ? 'No features inside this window.' : 'No features declared.') + '</p>';
  return softwarePanelShell(h + '</div>', state);
}
PanelRegistry.define('locus', {
  label: 'Genome map', since: '0.2.0', order: 43,
  validateDeclaration: locusDeclarationWarnings, validatePatch: locusPatchWarnings,
  fold: function (panel, steps) {
    var arrayOrNull = function (value) { return value === null || Array.isArray(value); };
    return foldCommonPanelStates(panel, steps, { accept: {
      markers: arrayOrNull, arcs: arrayOrNull,
      window: function (value) { return value === null || panelObject(value); },
      highlight: function (value) { return value === null || typeof value === 'string'; } } });
  },
  render: function (host, panel, state, skin, states) {
    var all = [state].concat(states || []);
    return { html: locusHTML(panel, state, { compactArcs: !locusHasArcs(panel, all), ideogram: locusHasZoom(panel, all) }) };
  },
  presentation: { ambientInitial: true },
  layout: { sectionSizing: { minWidth: 360, preferredWidth: 600, maxWidth: 1000, aspectPolicy: 'content', grow: 1 } },
  styles: String.raw`
.locus-panel{font-size:12px;line-height:1.4;color:var(--sq-text,var(--dtext));min-width:0}
/* Head plate (shared rhythm with sequence and reads): ink title, the window
   as a quiet tabular chip, a hairline beneath. */
.locus-head{display:flex;justify-content:space-between;align-items:center;gap:2px 10px;flex-wrap:wrap;margin-bottom:4px;padding-bottom:5px;border-bottom:1px solid var(--sq-line,color-mix(in srgb,var(--dtext) 14%,transparent));line-height:18px}
/* With an ideogram, the overview strip itself rules off the head. */
.locus-head-ideo{row-gap:0;margin-bottom:3px;padding-bottom:0;border-bottom:0}
.locus-title{font-size:13px;font-weight:600;letter-spacing:-.005em;color:var(--sq-ink,var(--dink))}
.locus-meta{font:500 10.5px/16px 'IBM Plex Mono',monospace;color:var(--sq-muted,var(--dfaint));font-variant-numeric:tabular-nums lining-nums;white-space:nowrap}
:is(.sk-aurora,.sk-pastel,.sk-blueprint) .locus-meta{padding:0 8px;border-radius:999px;background:var(--sq-well);box-shadow:inset 0 0 0 1px var(--sq-well-line)}
body.sk-blueprint .locus-meta{border-radius:2px}
.locus-map{position:relative;width:100%;overflow:hidden}
.locus-svg{position:absolute;inset:0;width:100%;height:100%;display:block;color:var(--sq-text,var(--dtext))}
.locus-track{fill:var(--sq-well,color-mix(in srgb,var(--dtext) 7%,transparent))}
/* A thin backbone runs through each feature row, like a chromosome line. */
.locus-backbone{stroke:var(--sq-line-strong,color-mix(in srgb,var(--dtext) 22%,transparent));stroke-width:1.5;stroke-linecap:round}
.locus-base{stroke:var(--sq-muted,color-mix(in srgb,var(--dtext) 45%,transparent));stroke-width:1.5}
.locus-tickline{stroke:var(--sq-muted,color-mix(in srgb,var(--dtext) 45%,transparent));stroke-width:1}
.locus-pin{stroke:var(--bio-tone,color-mix(in srgb,var(--dink) 70%,transparent));stroke-width:1.5;stroke-linecap:round}
.locus-arc{fill:none;stroke:var(--bio-tone,color-mix(in srgb,var(--dink) 75%,transparent));stroke-width:2;stroke-linecap:round}
.locus-arc-reversed{stroke-dasharray:4 3}
/* A marker drops a dashed guide through the track to the axis (it shows in
   the gaps between features, which draw above it). */
.locus-guide{stroke:var(--bio-tone,currentColor);stroke-width:1;stroke-dasharray:2 3;opacity:.55}
/* Ideogram zoom guides. */
.locus-zoom{fill:var(--sq-accent,currentColor);opacity:.06}
.locus-zoomline{stroke:var(--sq-accent,currentColor);stroke-width:1;stroke-dasharray:2 3;opacity:.6}
.locus-layer{position:absolute;inset:0;pointer-events:none}
.locus-layer>*{pointer-events:auto}
/* Zero-specificity fallbacks: the shared .bio-tone-* classes (owned by the sequence panel) win whenever present. */
:where(.locus-feature,.locus-key,.locus-marker-dot){background:color-mix(in srgb,var(--dtext) 24%,transparent)}
:where(.locus-arclabel){background:color-mix(in srgb,var(--dtext) 12%,transparent)}
/* Features: a rounded bar drawn by two clipped layers (a tone edge and a
   soft fill 1 px inside), with a chevron end that points along the strand.
   The span itself stays a plain box so its shadow follows the shape. */
.locus-feature{position:absolute;box-sizing:border-box;min-width:2px;overflow:visible;display:flex;align-items:center;padding:0 5px;font:600 10.5px/1 'IBM Plex Sans',sans-serif;white-space:nowrap;
  --lf-edge:color-mix(in srgb,var(--bio-tone,var(--dtext)) 72%,var(--sq-edge-mix,var(--dink)));
  --lf-fill:color-mix(in srgb,var(--bio-tone,var(--dtext)) 22%,var(--sq-surface,transparent));
  --lf-ink:color-mix(in srgb,var(--bio-tone,var(--dtext)) 50%,var(--sq-ink,var(--dink)));
  color:var(--lf-ink);transition:filter .24s ease}
.locus-layer .locus-feature{background:none}
.locus-feature::before,.locus-feature::after{content:'';position:absolute;inset:0;border-radius:4px;clip-path:var(--lf-shape,none);background:transparent;transition:background-color .24s ease}
:is(.sk-aurora,.sk-pastel,.sk-blueprint) .locus-feature::before{background:var(--lf-edge)}
.locus-feature::after{background:var(--lf-fill)}
:is(.sk-aurora,.sk-pastel,.sk-blueprint) .locus-feature::after{inset:1px}
.locus-plus{--lf-shape:polygon(0 0,calc(100% - min(7px,45%)) 0,100% 50%,calc(100% - min(7px,45%)) 100%,0 100%);border-radius:4px 0 0 4px}
.locus-minus{--lf-shape:polygon(min(7px,45%) 0,100% 0,100% 100%,min(7px,45%) 100%,0 50%);border-radius:0 4px 4px 0;padding-left:9px}
.locus-plus::before,.locus-plus::after{border-radius:4px 0 0 4px}
.locus-minus::before,.locus-minus::after{border-radius:0 4px 4px 0}
.locus-feature::after{border-radius:3px}.locus-plus::after{border-radius:3px 0 0 3px}.locus-minus::after{border-radius:0 3px 3px 0}
/* A feature that runs past the window edge has no end there: the bar runs
   square to the frame and fades out over its last 18 px (a cartographer's
   "continues"), so no chevron claims the gene stops. */
.locus-clip-r.locus-plus,.locus-clip-l.locus-minus{--lf-shape:none}
.locus-clip-r::before,.locus-clip-r::after{border-top-right-radius:0!important;border-bottom-right-radius:0!important}
.locus-clip-l::before,.locus-clip-l::after{border-top-left-radius:0!important;border-bottom-left-radius:0!important}
.locus-layer .locus-feature.locus-clip-r{-webkit-mask-image:linear-gradient(90deg,#000 calc(100% - 18px),transparent);mask-image:linear-gradient(90deg,#000 calc(100% - 18px),transparent)}
.locus-layer .locus-feature.locus-clip-l{-webkit-mask-image:linear-gradient(270deg,#000 calc(100% - 18px),transparent);mask-image:linear-gradient(270deg,#000 calc(100% - 18px),transparent)}
.locus-layer .locus-feature.locus-clip-l.locus-clip-r{-webkit-mask-image:linear-gradient(90deg,transparent,#000 18px,#000 calc(100% - 18px),transparent);mask-image:linear-gradient(90deg,transparent,#000 18px,#000 calc(100% - 18px),transparent)}
.locus-plus{padding-right:9px}
.locus-clip-r{padding-right:14px}.locus-clip-l{padding-left:18px}
.locus-feature i{position:relative;z-index:1;font-style:normal;overflow:hidden;text-overflow:ellipsis}
.locus-plus i::after{content:' ›'}.locus-minus i::before{content:'‹ '}
/* The chevron end already shows the strand (and the title names it), so the
   text arrows step aside where the shaped bars render. */
:is(.sk-aurora,.sk-pastel,.sk-blueprint) .locus-feature i::after,:is(.sk-aurora,.sk-pastel,.sk-blueprint) .locus-feature i::before{content:none}
/* Strand chevrons (IGV-style): faint › or ‹ marks every 24 px inside the bar
   in the tone's edge ink, drawn with two short gradient strokes per tile, so
   clipped and whole genes show their strand the same way. The label sits on
   its own patch of fill so no chevron runs through the text. */
:is(.sk-aurora,.sk-pastel,.sk-blueprint) .locus-feature{--lf-chevc:color-mix(in srgb,var(--lf-edge) 58%,transparent);--lf-chev:linear-gradient(transparent,transparent)}
:is(.sk-aurora,.sk-pastel,.sk-blueprint) .locus-feature.locus-plus{--lf-chev:linear-gradient(45deg,transparent 2.1px,var(--lf-chevc) 2.1px 3.5px,transparent 3.5px) 8px 4px/24px 4px repeat-x,linear-gradient(135deg,transparent 2.1px,var(--lf-chevc) 2.1px 3.5px,transparent 3.5px) 8px 8px/24px 4px repeat-x}
:is(.sk-aurora,.sk-pastel,.sk-blueprint) .locus-feature.locus-minus{--lf-chev:linear-gradient(135deg,transparent 2.1px,var(--lf-chevc) 2.1px 3.5px,transparent 3.5px) 8px 4px/24px 4px repeat-x,linear-gradient(45deg,transparent 2.1px,var(--lf-chevc) 2.1px 3.5px,transparent 3.5px) 8px 8px/24px 4px repeat-x}
:is(.sk-aurora,.sk-pastel,.sk-blueprint) .locus-feature::after{background:var(--lf-chev),var(--lf-fill)}
:is(.sk-aurora,.sk-pastel,.sk-blueprint) .locus-feature.locus-hl{--lf-chevc:color-mix(in srgb,var(--lf-ink) 48%,transparent)}
:is(.sk-aurora,.sk-pastel,.sk-blueprint) .locus-feature i{display:block;height:14px;line-height:14px;margin:0 -3px 0 -4px;padding:0 3px 0 4px;background:var(--lf-fill)}
/* Pastel idle genes are lit from above, like clay. */
body.sk-pastel .locus-feature:not(.locus-hl):not(.locus-dim){--lf-fill:linear-gradient(180deg,color-mix(in srgb,var(--bio-tone,#5263B9) 12%,#FFFFFF),color-mix(in srgb,var(--bio-tone,#5263B9) 27%,#FFFFFF))}
.locus-narrow i{display:none}
/* The highlighted feature is the one solid, raised thing on the map. */
.locus-feature.locus-hl{z-index:2;--lf-edge:var(--sq-accent-ink,var(--dink));--lf-fill:var(--sq-accent,color-mix(in srgb,var(--dink) 30%,transparent));--lf-ink:var(--sq-on-accent,var(--dink));
  filter:drop-shadow(0 3px 4px rgba(36,50,74,.24))}
.sk-aurora .locus-feature.locus-hl{--lf-fill:linear-gradient(180deg,#5FE3FF,#2CB5D2);--lf-edge:#5FE3FF;filter:drop-shadow(0 0 5px rgba(56,225,255,.35))}
body.sk-pastel .locus-feature.locus-hl{--lf-fill:linear-gradient(180deg,color-mix(in srgb,#5263B9 92%,#FFFFFF),#5263B9 70%);--lf-edge:#3D4C9E;filter:drop-shadow(0 0 1.5px rgba(82,99,185,.55)) drop-shadow(0 3px 5px rgba(61,76,158,.3))}
body.sk-blueprint .locus-feature.locus-hl{filter:none;--lf-fill:color-mix(in srgb,#7FE3FF 34%,#052956);--lf-edge:var(--sq-accent);--lf-ink:var(--sq-ink)}
.locus-feature.locus-hl i{overflow:visible}
.locus-feature.locus-dim{--lf-edge:var(--sq-line-strong,color-mix(in srgb,var(--dtext) 30%,transparent));--lf-fill:var(--sq-well,color-mix(in srgb,var(--dtext) 8%,transparent));--lf-ink:var(--sq-muted,var(--dfaint))}
:is(.sk-aurora,.sk-pastel,.sk-blueprint) .locus-feature.locus-dim{opacity:1}
.locus-feature.locus-dim{opacity:.9}
body.sk-blueprint .locus-feature,body.sk-blueprint .locus-feature::before,body.sk-blueprint .locus-feature::after{border-radius:0}
body.sk-blueprint .locus-feature{--lf-fill:color-mix(in srgb,var(--bio-tone,#7FE3FF) 24%,var(--sq-surface));--lf-edge:var(--bio-tone,#7FE3FF);--lf-ink:var(--sq-ink);font-family:'Barlow Condensed','IBM Plex Sans',sans-serif;letter-spacing:.06em;text-transform:uppercase}
/* Markers: a teardrop pin with a light core above a 1.5 px stem. */
.locus-marker{position:absolute;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:1px;font:600 10.5px/12px 'IBM Plex Sans',sans-serif;color:var(--sq-ink,var(--dink));white-space:nowrap}
.locus-marker b{position:relative;font-weight:600;padding:0 3px;border-radius:3px;text-shadow:0 0 3px var(--sq-surface,transparent),0 0 2px var(--sq-surface,transparent)}
/* In the shaped skins a label is a solid surface pill, so zoom guides and
   pin stems never run through its text. Crowded neighbours hang apart
   (anchor end / start) and a last resort rises one tier on a hairline. */
:is(.sk-aurora,.sk-pastel,.sk-blueprint) .locus-marker b{padding:0 4px;border-radius:999px;background:var(--sq-surface);text-shadow:none}
body.sk-blueprint .locus-marker b{border-radius:0}
.locus-mk-end b{transform:translateX(calc(-50% + 6px))}
.locus-mk-start b{transform:translateX(calc(50% - 6px))}
.locus-mk-up b{translate:0 -12px}
.locus-mk-up b::after{content:'';position:absolute;top:100%;left:50%;width:1px;height:12px;background:var(--sq-line-strong,currentColor)}
.locus-mk-up.locus-mk-end b::after{left:auto;right:6px}
.locus-mk-up.locus-mk-start b::after{left:6px}
.locus-marker-dot{width:8px;height:8px;border-radius:50%;border:1px solid color-mix(in srgb,var(--dtext) 40%,transparent)}
.sk-aurora .locus-marker-dot,body.sk-pastel .locus-marker-dot,body.sk-blueprint .locus-marker-dot{box-sizing:border-box;width:10px;height:10px;margin-top:1px;border:0;border-radius:50% 50% 50% 0;transform:rotate(-45deg);
  background:radial-gradient(circle at 50% 50%,var(--sq-surface) 0 1.6px,transparent 2.1px),var(--bio-tone,var(--sq-accent));
  box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--bio-tone,var(--sq-accent)) 70%,var(--sq-edge-mix)),-1px 1px 2px rgba(36,50,74,.22)}
.sk-aurora .locus-marker-dot{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--bio-tone,var(--sq-accent)) 70%,var(--sq-edge-mix)),0 0 6px color-mix(in srgb,var(--bio-tone,var(--sq-accent)) 55%,transparent)}
body.sk-pastel .locus-marker-dot{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--bio-tone,var(--sq-accent)) 70%,var(--sq-edge-mix)),-1px 1px 2px rgba(36,50,74,.22)}
body.sk-blueprint .locus-marker-dot{border-radius:0 0 0 0;transform:rotate(45deg) scale(.8);box-shadow:none}
@media screen{body.sk-pastel :is(.locus-marker-dot,.locus-pin).bio-tone-accent{--bio-tone:#5263B9}}
/* Arc labels: soft tone pills with a hairline edge. */
.locus-arclabel{position:absolute;transform:translateX(-50%);padding:0 7px;border-radius:999px;font:600 10.5px/16px 'IBM Plex Sans',sans-serif;color:var(--sq-ink,var(--dink));white-space:nowrap;font-variant-numeric:tabular-nums lining-nums}
.locus-arclabel[class*="bio-tone-"]{background:color-mix(in srgb,var(--bio-tone) 16%,var(--sq-surface,transparent));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--bio-tone) 55%,transparent);color:color-mix(in srgb,var(--bio-tone) 50%,var(--sq-ink,var(--dink)))}
body.sk-blueprint .locus-arclabel{border-radius:2px}
/* Ideogram: the whole length as a slim rounded strip with every feature as a
   tick of its tone; the window is an accent bracket. */
.locus-layer>.locus-ideo,.locus-layer>.locus-ideo-win{pointer-events:none}
.locus-ideo{position:absolute;left:0;right:0;box-sizing:border-box;border-radius:999px;overflow:hidden;background:var(--sq-well,color-mix(in srgb,var(--dtext) 8%,transparent));box-shadow:inset 0 0 0 1px var(--sq-line-strong,color-mix(in srgb,var(--dtext) 22%,transparent))}
.locus-ideo i{position:absolute;top:1px;bottom:1px;min-width:2px}
.locus-ideo i[class*="bio-tone-"]{background:color-mix(in srgb,var(--bio-tone) 55%,var(--sq-surface,transparent))}
.locus-ideo i.locus-hl{background:var(--sq-accent,var(--bio-tone))}
.locus-ideo-win{position:absolute;box-sizing:border-box;min-width:7px;transform:translateX(-50%);border:1.5px solid var(--sq-accent,var(--dink));border-radius:3px;background:var(--sq-accent-soft,transparent);transition:left .42s cubic-bezier(.2,.7,.2,1),width .42s cubic-bezier(.2,.7,.2,1)}
.locus-ideo-all{border-width:1px;opacity:.6}
body.sk-blueprint .locus-ideo,body.sk-blueprint .locus-ideo-win{border-radius:0}
.locus-ticklabel{position:absolute;transform:translateX(-50%);font:500 10px/1.2 'IBM Plex Sans',sans-serif;color:var(--sq-muted,var(--dfaint));white-space:nowrap;font-variant-numeric:tabular-nums lining-nums}
.locus-ticklabel.locus-anchor-start{transform:none;margin-left:2px}
.locus-ticklabel.locus-anchor-end{transform:translateX(-100%);margin-left:-2px}
.locus-legend{list-style:none;display:flex;flex-wrap:wrap;gap:4px 14px;margin:4px 0 0;padding:0;font-size:11.5px;line-height:15px;color:var(--sq-text,var(--dfaint));font-variant-numeric:tabular-nums lining-nums}
.locus-legend li{display:flex;align-items:center;gap:6px}
.locus-legend li.locus-hl{color:var(--sq-accent-ink,var(--dink));font-weight:600}
.locus-key{flex:none;display:inline-block;width:10px;height:10px;border-radius:3px;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--bio-tone,currentColor) var(--sq-edge-k,70%),var(--sq-edge-mix,var(--dink)))}
.locus-key[class*="bio-tone-"]{background:color-mix(in srgb,var(--bio-tone) var(--sq-tint,26%),var(--sq-surface,transparent))}
.locus-legend li.locus-hl .locus-key{background:var(--sq-accent,var(--bio-tone));box-shadow:0 0 0 2px var(--sq-accent-soft,transparent)}
body.sk-blueprint .locus-key{border-radius:0}
.locus-empty{margin:6px 0 0;font-size:11.5px;color:var(--sq-muted,var(--dfaint))}
@media (prefers-reduced-motion:reduce){.locus-feature,.locus-feature::before,.locus-feature::after,.locus-ideo-win{transition:none}}
@media print{.locus-feature,.locus-feature::before,.locus-feature::after,.locus-key,.locus-marker-dot,.locus-arclabel,.locus-ideo,.locus-ideo i,.locus-ideo-win{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
`,
  authoring: {
    initialFields: true,
    transientFields: ['highlight', 'window'],
    template: {
      title: 'Genome map', length: 12000, unit: 'bp', label: 'Plasmid pTEACH-1',
      features: [
        { id: 'geneA', label: 'gene A', from: 1200, to: 4800, strand: '+', tone: 'feature' },
        { id: 'geneB', label: 'gene B', from: 6200, to: 9900, strand: '-', tone: 'feature' },
        { id: 'ori', label: 'origin', from: 10400, to: 10700, tone: 'accent' } ],
      initial: { markers: [{ id: 'cut1', at: 5400, label: 'EcoRI', tone: 'cut' }] }
    },
    setupFields: [['length', 'num'], ['unit', 'text'], ['label', 'text'],
      ['features', 'rows', { wide: true, max: LOCUS_MAX_FEATURES, cols: [{ k: 'id', req: true }, { k: 'label' }, { k: 'from', kind: 'num', req: true }, { k: 'to', kind: 'num', req: true },
        { k: 'tone', kind: 'enum', options: BIO_TONES }, { k: 'strand', kind: 'enum', options: ['+', '-'] }, { k: 'row', kind: 'num', label: 'Row (0–3)' }] }],
      ['initial', 'json']],
    patchFields: [['markers', 'jsonArr'], ['arcs', 'jsonArr'], ['window', 'json', { nullable: true }], ['highlight', 'text'], ['note', 'text']],
    expandPatchFields: function (panel) {
      return [['markers', 'jsonArr'], ['arcs', 'jsonArr'], ['window', 'json', { nullable: true }],
        ['highlight', 'enum', locusFeatures(panel).map(function (feature) { return feature.id; })], ['note', 'text']];
    },
    fieldMeta: {
      length: { label: 'Length (bases)', help: 'Total length of the genome, chromosome or region in bp: a whole number from 1 to 10,000,000,000. All positions are 1-based bases.' },
      unit: { label: 'Ruler unit', help: 'bp, kb or Mb for ruler and distance labels. Positions are always authored in bp.' },
      label: { label: 'Map label' },
      features: { label: 'Features', help: 'Up to 48 blocks {id, label, from, to, tone?, strand?, row?}. Rows 0–3 are assigned first-fit without overlap unless set explicitly.' },
      markers: { label: 'Markers', help: 'A complete snapshot: [{id, at, label?, tone?}] pins above the bar.', nullLabel: 'No markers' },
      arcs: { label: 'Arcs', help: '[{id, from, to, label?, tone?}] connectors drawn above the bar; the apex shows the label or the distance between the two positions. from greater than to draws a dashed arc.', nullLabel: 'No arcs' },
      window: { label: 'Zoom window', help: '{from, to} in bases: only that span renders and the ruler re-labels. Null shows the whole length.', nullLabel: 'Whole length' },
      highlight: { label: 'Highlighted feature', help: 'Feature id to emphasise; other features dim.', nullLabel: 'No highlight' },
      note: { label: 'Explanation' }
    },
    /* The unit is a fixed choice, so the inspector shows a select. */
    editor: function (context) {
      return { setupField: function (field, panel) {
        if (field[0] !== 'unit') return;
        var el = context.document.createElement('select');
        el.className = 'fctl'; el.setAttribute('aria-label', 'Ruler unit');
        [['bp', 'bp · bases'], ['kb', 'kb · kilobases'], ['Mb', 'Mb · megabases']].forEach(function (pair) {
          var option = context.document.createElement('option'); option.value = pair[0]; option.textContent = pair[1]; el.appendChild(option);
        });
        el.value = locusUnit(panel);
        context.listen(el, 'change', function () { context.commit('unit', JSON.stringify(el.value)); });
        return context.controls.row('Ruler unit', el);
      } };
    },
    picker: { order: 43, name: 'Genome map', category: 'Science & sequencing', tagline: 'Where in the genome.',
      description: 'A linear map of a genome, chromosome or gene region with annotated features on stacked rows, point markers, arcs that connect two positions with their distance, and a zoomable ruler.' },
    example: function (sample) {
      sample.panel.length = 48000;
      sample.panel.unit = 'kb';
      sample.panel.label = 'Region chr2:1–48 kb (illustrative)';
      sample.panel.features = [
        { id: 'enh', label: 'enhancer', from: 1800, to: 2600, tone: 'motif' },
        { id: 'prom', label: 'promoter', from: 9400, to: 10200, tone: 'primer' },
        { id: 'geneA', label: 'gene A', from: 10300, to: 23800, strand: '+', tone: 'feature' },
        { id: 'ex1', label: 'exon 1', from: 10300, to: 10900, strand: '+', tone: 'accent' },
        { id: 'ex2', label: 'exon 2', from: 16300, to: 17100, strand: '+', tone: 'accent' },
        { id: 'ex3', label: 'exon 3', from: 22600, to: 23800, strand: '+', tone: 'accent' },
        { id: 'geneB', label: 'gene B', from: 29000, to: 41500, strand: '-', tone: 'feature' },
        { id: 'rep', label: 'repeat', from: 44000, to: 46500, tone: 'neutral' } ];
      sample.state = {
        markers: [
          { id: 'snp', at: 16640, label: 'SNP', tone: 'mismatch' },
          { id: 'cut', at: 27500, label: 'cut site', tone: 'cut' } ],
        arcs: [{ id: 'loop', from: 2200, to: 9800, tone: 'motif' }],
        highlight: 'geneA',
        note: 'The enhancer loops to the promoter; a SNP sits in exon 2 of gene A.' };
      sample.panel.initial = JSON.parse(JSON.stringify(sample.state));
      return sample;
    }
  }
});
