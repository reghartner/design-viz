/* Venue map: a bowl (or imported chart) of seating sections coloured by
   sell-through, holds, price, tier or revenue, step by step. Every number is
   authored in the spec; nothing is forecast and no ticketing system is read.
   Shared formatting and bowl geometry live in ../sports.js. */
var SEATMAP_MODES = ['sold', 'held', 'price', 'tier', 'revenue'];
var SEATMAP_MIN_SECTIONS = 4, SEATMAP_MAX_SECTIONS = 160, SEATMAP_MAX_RINGS = 4;
var SEATMAP_MAX_TIERS = 8, SEATMAP_MAX_LANDMARKS = 8, SEATMAP_MAX_HIGHLIGHT = 8;
var SEATMAP_ZONE_CHARS = 24, SEATMAP_LABEL_CHARS = 40;
var SEATMAP_DIRECTIONS = ['clockwise', 'counterclockwise'], SEATMAP_STARTS = ['end', 'sideline'];
var SEATMAP_CENTRE = [500, SPM_VIEW_HEIGHT / 2];
function seatmapBowl(panel) {
  return SPM_BOWLS.indexOf(panel.bowl) >= 0 ? panel.bowl : 'rink';
}
function seatmapMirror(panel) {
  return panel.direction === 'counterclockwise';
}
function seatmapStartRegion(panel) {
  return panel.startAt === 'sideline' ? 2 : 0;
}
function seatmapCount(v) {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
}
function seatmapText(v, max) {
  return typeof v === 'string' && v.length <= max && !/[\u0000-\u001f\u007f]/.test(v);
}
function seatmapColor(v) {
  return typeof v === 'string' && /^#[0-9A-Fa-f]{6}$/.test(v);
}
function seatmapGeometry(panel) {
  return panel.geometry === 'paths' ? 'paths' : 'bowl';
}
function seatmapRingSlots(panel) {
  return isFiniteNum(panel.ringSlots) && panel.ringSlots >= 8 && panel.ringSlots <= 32 ? panel.ringSlots : 16;
}
function seatmapRings(panel) {
  return panelCollectionItems(panel, 'rings', SEATMAP_MAX_RINGS).filter(function (ring) {
    return spmSafeId(ring.id);
  }).map(function (ring) {
    return { id: ring.id, label: seatmapText(ring.label, SEATMAP_LABEL_CHARS) && ring.label.trim() ? ring.label : ring.id };
  });
}
function seatmapTiers(panel) {
  return panelCollectionItems(panel, 'tiers', SEATMAP_MAX_TIERS).filter(function (tier) {
    return spmSafeId(tier.id);
  }).map(function (tier) {
    return {
      id: tier.id,
      label: seatmapText(tier.label, SEATMAP_LABEL_CHARS) && tier.label.trim() ? tier.label : tier.id,
      color: seatmapColor(tier.color) ? tier.color.toUpperCase() : null,
    };
  });
}
function seatmapViewBox(panel) {
  var box = panelObject(panel.viewBox) ? panel.viewBox : {};
  var ok = function (v) { return isFiniteNum(v) && v >= 100 && v <= 4000; };
  return { width: ok(box.width) ? box.width : SPM_VIEW, height: ok(box.height) ? box.height : SPM_VIEW };
}
function seatmapPathOk(d) {
  return !spmParsePath(d, { range: [0, SPM_VIEW] }).error;
}
/* Usable sections only: safe unique ids, a declared ring, a capacity and (for
   paths geometry) a strict path. `slot` stays null unless authored; bowl
   placement then follows zones (see seatmapPlacement). */
function seatmapSections(panel) {
  var rings = seatmapRings(panel), tiers = seatmapTiers(panel), geometry = seatmapGeometry(panel), slots = seatmapRingSlots(panel);
  var out = [];
  panelCollectionItems(panel, 'sections', SEATMAP_MAX_SECTIONS).forEach(function (s) {
    if (!spmSafeId(s.id) || !seatmapCount(s.capacity) || s.capacity < 1) return;
    var ringIndex = -1;
    rings.forEach(function (ring, i) { if (ring.id === s.ring) ringIndex = i; });
    if (ringIndex < 0) return;
    if (geometry === 'paths' && !seatmapPathOk(s.path)) return;
    var span = isFiniteNum(s.span) && s.span > 0 && s.span <= slots ? s.span : 1;
    var slot = isFiniteNum(s.slot) && s.slot >= 0 && s.slot < slots ? s.slot : null;
    if (slot !== null && slot + span > slots) span = Math.max(0.25, slots - slot);
    out.push({
      id: s.id, label: seatmapText(s.label, SEATMAP_LABEL_CHARS) && s.label.trim() ? s.label : s.id,
      ring: ringIndex, ringId: s.ring, slot: slot, span: span, capacity: s.capacity,
      path: geometry === 'paths' ? s.path : null,
      zone: seatmapText(s.zone, SEATMAP_ZONE_CHARS) && s.zone.trim() ? s.zone.trim() : '',
      kind: spmZoneKind(s.zone),
      tier: tiers.some(function (tier) { return tier.id === s.tier; }) ? s.tier : null,
    });
  });
  return out;
}
/* Per-ring arc ranges on the inner outline. A ring with any authored slot
   uses slots (slot 0 centred on the left end); otherwise zones drive the
   walk from the start region, and a ring without recognised zones splits
   evenly. Returns {sectionId: [u0, u1]}. */
function seatmapPlacement(panel, sections, bowl) {
  var slots = seatmapRingSlots(panel), start = seatmapStartRegion(panel), out = {};
  var leftMiddle = bowl.marks[1] / 2;
  var byRing = {};
  sections.forEach(function (s) { (byRing[s.ring] = byRing[s.ring] || []).push(s); });
  Object.keys(byRing).forEach(function (ring) {
    var list = byRing[ring];
    if (list.some(function (s) { return s.slot !== null; })) {
      var cursor = 0;
      list.forEach(function (s) {
        var slot = s.slot !== null ? s.slot : cursor;
        cursor = slot + s.span;
        out[s.id] = [leftMiddle + (slot - 0.5) / slots, leftMiddle + (slot - 0.5 + s.span) / slots];
      });
    } else {
      var ranges = spmBowlAllocate(list.map(function (s) { return s.kind; }), bowl.marks, start);
      list.forEach(function (s, i) { out[s.id] = ranges[i]; });
    }
  });
  return out;
}
/* Landmarks are authored points; a pill that would sit on a section label
   at the default size slides toward the field centre until it is clear. */
function seatmapPlaceLandmarks(landmarks, sections, centre) {
  function box(x, y, w, h) { return { x0: x - w / 2, y0: y - h / 2, x1: x + w / 2, y1: y + h / 2 }; }
  function hits(a, b) { return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0; }
  var labels = sections.filter(function (s) { return s.font; }).map(function (s) {
    return box(s.x, s.y, Math.max(1, s.label.length) * 0.62 * s.font + 6, s.font + 6);
  });
  return landmarks.map(function (mark) {
    var width = Math.round(mark.label.length * 8.6 + 20), height = 26, x = mark.x, y = mark.y, moved = 0;
    for (var i = 0; i < 40; i++) {
      var pill = box(x, y, width, height);
      if (!labels.some(function (label) { return hits(label, pill); })) break;
      var dx = centre[0] - x, dy = centre[1] - y, dist = Math.hypot(dx, dy) || 1;
      x += (dx / dist) * 10; y += (dy / dist) * 10; moved++;
    }
    return { id: mark.id, label: mark.label, x: spmRound(x), y: spmRound(y), width: width, height: height, nudged: moved > 0 };
  });
}
function seatmapSectionIds(panel) {
  return seatmapSections(panel).map(function (s) { return s.id; });
}
function seatmapLandmarks(panel) {
  var view = seatmapGeometry(panel) === 'bowl' ? { width: SPM_VIEW, height: 770 } : seatmapViewBox(panel);
  return panelCollectionItems(panel, 'landmarks', SEATMAP_MAX_LANDMARKS).filter(function (mark) {
    return spmSafeId(mark.id) && seatmapText(mark.label, SEATMAP_LABEL_CHARS) && mark.label.trim() &&
      isFiniteNum(mark.x) && isFiniteNum(mark.y) && mark.x >= 0 && mark.x <= view.width && mark.y >= 0 && mark.y <= view.height;
  }).map(function (mark) { return { id: mark.id, label: mark.label, x: mark.x, y: mark.y }; });
}
function seatmapDeclarationWarnings(panel, path, warnings) {
  var geometry = seatmapGeometry(panel), slots = seatmapRingSlots(panel);
  if (panel.geometry !== undefined && panel.geometry !== 'bowl' && panel.geometry !== 'paths')
    warnings.push(path + '.geometry: expected bowl or paths — using bowl');
  if (panel.bowl !== undefined && SPM_BOWLS.indexOf(panel.bowl) < 0)
    warnings.push(path + '.bowl: expected ' + SPM_BOWLS.join('|') + ' — using rink');
  if (panel.direction !== undefined && SEATMAP_DIRECTIONS.indexOf(panel.direction) < 0)
    warnings.push(path + '.direction: expected clockwise or counterclockwise — using clockwise');
  if (panel.startAt !== undefined && SEATMAP_STARTS.indexOf(panel.startAt) < 0)
    warnings.push(path + '.startAt: expected end or sideline — using end');
  if (panel.ringSlots !== undefined && !(isFiniteNum(panel.ringSlots) && panel.ringSlots >= 8 && panel.ringSlots <= 32))
    warnings.push(path + '.ringSlots: expected a number 8–32 — using 16');
  if (panel.currency !== undefined && !/^[A-Z]{3}$/.test(String(panel.currency)))
    warnings.push(path + '.currency: expected a three-letter ISO code such as USD — using USD');
  if (panel.showTotals !== undefined && typeof panel.showTotals !== 'boolean')
    warnings.push(path + '.showTotals: expected true or false — using true');
  if (panel.viewBox !== undefined) {
    if (geometry !== 'paths') warnings.push(path + '.viewBox: only used by geometry "paths" — ignored');
    else if (!panelObject(panel.viewBox) || !isFiniteNum(panel.viewBox.width) || !isFiniteNum(panel.viewBox.height) ||
      panel.viewBox.width < 100 || panel.viewBox.width > 4000 || panel.viewBox.height < 100 || panel.viewBox.height > 4000)
      warnings.push(path + '.viewBox: expected {width,height} numbers 100–4000 — using 1000×1000');
  }
  var ringIds = Object.create(null);
  if (!Array.isArray(panel.rings) || !panel.rings.length || panel.rings.length > SEATMAP_MAX_RINGS)
    warnings.push(path + '.rings: declare 1–' + SEATMAP_MAX_RINGS + ' rings [{id,label}] from the inside out');
  (Array.isArray(panel.rings) ? panel.rings.slice(0, SEATMAP_MAX_RINGS) : []).forEach(function (ring, i) {
    var at = path + '.rings[' + i + ']';
    if (!panelObject(ring) || !spmSafeId(ring.id)) { warnings.push(at + '.id: needs a letter-or-digit-led id of up to 32 characters — ring skipped'); return; }
    if (ringIds[ring.id]) { warnings.push(at + '.id: duplicate id "' + ring.id + '" — later ring skipped'); return; }
    ringIds[ring.id] = true;
    if (ring.label !== undefined && !(seatmapText(ring.label, SEATMAP_LABEL_CHARS) && ring.label.trim()))
      warnings.push(at + '.label: expected text of up to ' + SEATMAP_LABEL_CHARS + ' characters — using the id');
  });
  var tierIds = Object.create(null);
  if (panel.tiers !== undefined && (!Array.isArray(panel.tiers) || panel.tiers.length > SEATMAP_MAX_TIERS))
    warnings.push(path + '.tiers: expected up to ' + SEATMAP_MAX_TIERS + ' tiers [{id,label,color?}]');
  (Array.isArray(panel.tiers) ? panel.tiers.slice(0, SEATMAP_MAX_TIERS) : []).forEach(function (tier, i) {
    var at = path + '.tiers[' + i + ']';
    if (!panelObject(tier) || !spmSafeId(tier.id)) { warnings.push(at + '.id: needs a letter-or-digit-led id — tier skipped'); return; }
    if (tierIds[tier.id]) { warnings.push(at + '.id: duplicate id "' + tier.id + '" — later tier skipped'); return; }
    tierIds[tier.id] = true;
    if (tier.label !== undefined && !(seatmapText(tier.label, SEATMAP_LABEL_CHARS) && tier.label.trim()))
      warnings.push(at + '.label: expected short text — using the id');
    if (tier.color !== undefined && !seatmapColor(tier.color))
      warnings.push(at + '.color: expected #RRGGBB — using the default tier colour');
  });
  var sectionIds = Object.create(null), usable = 0;
  if (!Array.isArray(panel.sections) || panel.sections.length < SEATMAP_MIN_SECTIONS || panel.sections.length > SEATMAP_MAX_SECTIONS)
    warnings.push(path + '.sections: declare ' + SEATMAP_MIN_SECTIONS + '–' + SEATMAP_MAX_SECTIONS + ' sections [{id,ring,capacity,…}]');
  (Array.isArray(panel.sections) ? panel.sections.slice(0, SEATMAP_MAX_SECTIONS) : []).forEach(function (s, i) {
    var at = path + '.sections[' + i + ']';
    if (!panelObject(s) || !spmSafeId(s.id)) { warnings.push(at + '.id: needs a letter-or-digit-led id of up to 32 characters — section skipped'); return; }
    if (sectionIds[s.id]) { warnings.push(at + '.id: duplicate id "' + s.id + '" — later section skipped'); return; }
    sectionIds[s.id] = true;
    var ok = true;
    if (!ringIds[s.ring]) { warnings.push(at + '.ring: expected a declared ring id — section skipped'); ok = false; }
    if (!(seatmapCount(s.capacity) && s.capacity >= 1)) { warnings.push(at + '.capacity: expected a whole number of seats ≥ 1 — section skipped'); ok = false; }
    if (geometry === 'paths') {
      var parsed = spmParsePath(s.path, { range: [0, SPM_VIEW] });
      if (parsed.error) { warnings.push(at + '.path: ' + parsed.error + ' — section skipped'); ok = false; }
    } else {
      if (s.slot !== undefined && !(isFiniteNum(s.slot) && s.slot >= 0 && s.slot < slots))
        warnings.push(at + '.slot: expected a number from 0 to below ringSlots (' + slots + ') — placed by zone instead');
      if (s.zone !== undefined && seatmapText(s.zone, SEATMAP_ZONE_CHARS) && s.zone.trim() && !spmZoneKind(s.zone))
        warnings.push(at + '.zone: "' + s.zone.trim() + '" is not recognised as sideline, corner, end or club — placed in the walk order without a zone');
      if (s.span !== undefined && !(isFiniteNum(s.span) && s.span > 0 && s.span <= slots))
        warnings.push(at + '.span: expected a positive number of slots — using 1');
      else if (isFiniteNum(s.slot) && isFiniteNum(s.span) && s.slot + s.span > slots)
        warnings.push(at + '.span: runs past the ring — trimmed to the ring');
      if (s.path !== undefined) warnings.push(at + '.path: only used by geometry "paths" — ignored');
    }
    if (s.label !== undefined && !(seatmapText(s.label, SEATMAP_LABEL_CHARS) && s.label.trim()))
      warnings.push(at + '.label: expected text of up to ' + SEATMAP_LABEL_CHARS + ' characters — using the id');
    if (s.zone !== undefined && !seatmapText(s.zone, SEATMAP_ZONE_CHARS))
      warnings.push(at + '.zone: expected text of up to ' + SEATMAP_ZONE_CHARS + ' characters — omitted');
    if (s.tier !== undefined && !tierIds[s.tier]) warnings.push(at + '.tier: expected a declared tier id — no tier');
    if (ok) usable++;
  });
  if (Array.isArray(panel.sections) && panel.sections.length >= SEATMAP_MIN_SECTIONS && usable < SEATMAP_MIN_SECTIONS)
    warnings.push(path + '.sections: fewer than ' + SEATMAP_MIN_SECTIONS + ' usable sections — the map renders empty');
  var view = geometry === 'bowl' ? { width: SPM_VIEW, height: 770 } : seatmapViewBox(panel), marks = Object.create(null);
  if (panel.landmarks !== undefined && (!Array.isArray(panel.landmarks) || panel.landmarks.length > SEATMAP_MAX_LANDMARKS))
    warnings.push(path + '.landmarks: expected up to ' + SEATMAP_MAX_LANDMARKS + ' labels [{id,label,x,y}]');
  (Array.isArray(panel.landmarks) ? panel.landmarks.slice(0, SEATMAP_MAX_LANDMARKS) : []).forEach(function (mark, i) {
    var at = path + '.landmarks[' + i + ']';
    if (!panelObject(mark) || !spmSafeId(mark.id)) { warnings.push(at + '.id: needs a letter-or-digit-led id — landmark skipped'); return; }
    if (marks[mark.id]) { warnings.push(at + '.id: duplicate id "' + mark.id + '" — later landmark skipped'); return; }
    marks[mark.id] = true;
    if (!(seatmapText(mark.label, SEATMAP_LABEL_CHARS) && mark.label.trim())) warnings.push(at + '.label: expected short text — landmark skipped');
    if (!(isFiniteNum(mark.x) && mark.x >= 0 && mark.x <= view.width) || !(isFiniteNum(mark.y) && mark.y >= 0 && mark.y <= view.height))
      warnings.push(at + ': x and y must lie inside the ' + view.width + '×' + view.height + ' viewBox — landmark skipped');
  });
  seatmapPatchWarnings(panel.initial, path + '.initial', panel, warnings);
}
function seatmapCapacities(panel) {
  var out = Object.create(null);
  seatmapSections(panel).forEach(function (s) { out[s.id] = s.capacity; });
  return out;
}
function seatmapHeldOk(value, capacity) {
  return panelObject(value) && seatmapCount(value.count) && value.count <= capacity &&
    (value.label === undefined || seatmapText(value.label, SEATMAP_LABEL_CHARS)) &&
    (value.until === undefined || seatmapText(value.until, SEATMAP_ZONE_CHARS));
}
function seatmapMapWarnings(map, at, capacities, warnings, describe, ok) {
  if (map === null) return;
  if (!panelObject(map)) { warnings.push(at + ': expected an object keyed by section id (or null to clear) — ignored'); return; }
  Object.keys(map).forEach(function (id) {
    var value = map[id], where = at + '.' + id;
    if (!(id in capacities)) warnings.push(where + ': unknown section id — ignored');
    else if (value !== null && !ok(value, capacities[id])) warnings.push(where + ': expected ' + describe + ' or null — ignored');
  });
}
function seatmapHighlightOk(value, capacities) {
  if (value === null) return true;
  if (typeof value === 'string') return value in capacities;
  return Array.isArray(value) && value.length <= SEATMAP_MAX_HIGHLIGHT && value.every(function (id) { return typeof id === 'string' && id in capacities; });
}
function seatmapPatchWarnings(state, path, panel, warnings) {
  softwarePanelPatchWarnings(state, path, panel, warnings, function (state, path, panel, warnings) {
    var capacities = seatmapCapacities(panel), tiers = seatmapTiers(panel);
    Object.keys(state).forEach(function (key) {
      var value = state[key], at = path + '.' + key;
      if (key === 'enterOnce') return;
      if (key === 'sold') seatmapMapWarnings(value, at, capacities, warnings, 'a whole number from 0 to that section’s capacity', function (v, cap) { return seatmapCount(v) && v <= cap; });
      else if (key === 'held') seatmapMapWarnings(value, at, capacities, warnings, '{count,label?,until?} with count from 0 to that section’s capacity', seatmapHeldOk);
      else if (key === 'price') seatmapMapWarnings(value, at, capacities, warnings, 'a finite price ≥ 0', function (v) { return isFiniteNum(v) && v >= 0; });
      else if (key === 'tierOf') seatmapMapWarnings(value, at, capacities, warnings, 'a declared tier id', function (v) { return tiers.some(function (tier) { return tier.id === v; }); });
      else if (key === 'mode') {
        if (value !== null && SEATMAP_MODES.indexOf(value) < 0) warnings.push(at + ': expected ' + SEATMAP_MODES.join('|') + ' — ignored');
      } else if (key === 'highlight') {
        if (!seatmapHighlightOk(value, capacities)) warnings.push(at + ': expected a declared section id, an array of up to ' + SEATMAP_MAX_HIGHLIGHT + ' ids, or null — ignored');
      } else if (key === 'note') {
        if (value !== null && typeof value !== 'string') warnings.push(at + ': expected text or null — ignored');
      } else warnings.push(at + ': unknown field — ignored');
    });
  });
}
/* Pure sparse merge for the per-section maps. `patch === null` clears the
   map; a key set to null forgets that section; entries keep their authored
   value when the key is a safe id and the value has the right shape. The
   fold knows nothing about the declaration: capacities and tiers are checked
   when the model is given the declaration a step actually shows, so an
   engine-merged declaration change between steps just works. Never mutates. */
function seatmapMergeMap(base, patch, ok) {
  var out = {};
  if (patch === null) return out;
  Object.keys(panelObject(base) ? base : {}).forEach(function (id) { out[id] = base[id]; });
  if (!panelObject(patch)) return out;
  Object.keys(patch).forEach(function (id) {
    if (!spmSafeId(id)) return;
    var value = patch[id];
    if (value === null) delete out[id];
    else if (ok(value)) out[id] = value;
  });
  return out;
}
var SEATMAP_MAP_SHAPES = {
  sold: seatmapCount,
  held: function (v) { return seatmapHeldOk(v, Number.MAX_SAFE_INTEGER); },
  price: function (v) { return isFiniteNum(v) && v >= 0; },
  tierOf: function (v) { return typeof v === 'string' && spmSafeId(v); },
};
/* Highlight ids are resolved against the declaration at model time (and
   warned by the validator), so the fold only checks shapes. */
function seatmapCleanState(raw, allowOnce) {
  var out = {};
  if (!panelObject(raw)) return out;
  if (panelOwn(raw, 'mode') && (raw.mode === null || SEATMAP_MODES.indexOf(raw.mode) >= 0)) out.mode = raw.mode;
  if (panelOwn(raw, 'highlight') && (raw.highlight === null || typeof raw.highlight === 'string' ||
      (Array.isArray(raw.highlight) && raw.highlight.length <= SEATMAP_MAX_HIGHLIGHT && raw.highlight.every(function (id) { return typeof id === 'string'; }))))
    out.highlight = Array.isArray(raw.highlight) ? raw.highlight.slice() : raw.highlight;
  if (panelOwn(raw, 'note') && (raw.note === null || typeof raw.note === 'string')) out.note = raw.note;
  if (allowOnce && panelObject(raw.enterOnce)) out.enterOnce = seatmapCleanState(raw.enterOnce, false);
  return out;
}
function seatmapFold(panel, steps) {
  var keys = Object.keys(SEATMAP_MAP_SHAPES);
  var states = foldSanitizedPanelStates(panel, steps, function (raw, once) { return seatmapCleanState(raw, once); });
  var carried = {}, initial = panelObject(panel.initial) ? panel.initial : {};
  keys.forEach(function (key) { carried[key] = seatmapMergeMap({}, panelOwn(initial, key) ? initial[key] : undefined, SEATMAP_MAP_SHAPES[key]); });
  function apply(base, patch) {
    var next = {};
    keys.forEach(function (key) {
      next[key] = panelObject(patch) && panelOwn(patch, key) ? seatmapMergeMap(base[key], patch[key], SEATMAP_MAP_SHAPES[key]) : base[key];
    });
    return next;
  }
  steps.forEach(function (step, i) {
    var source = stepPanelPatch(step), patch = source && panelOwn(source, panel.id) ? source[panel.id] : null;
    carried = apply(carried, patch);
    var shown = panelObject(patch) && panelObject(patch.enterOnce) ? apply(carried, patch.enterOnce) : carried;
    keys.forEach(function (key) { states[i][key] = shown[key]; });
  });
  if (!steps.length) keys.forEach(function (key) { states[0][key] = carried[key]; });
  return states;
}
function seatmapPathGeometry(d) {
  var parsed = spmParsePath(d, { range: [0, SPM_VIEW] });
  var box = parsed.error ? null : spmPathBBox(parsed.commands);
  if (!box) return { d: 'M0,0Z', x: 0, y: 0, arc: 0, depth: 0 };
  return { d: spmPathText(parsed.commands), x: spmRound(box.x + box.width / 2), y: spmRound(box.y + box.height / 2), arc: box.width, depth: box.height };
}
/* Label size from the wedge: up to 22 units, hidden below 9 (the tooltip
   still carries the id). A short id with a trailing letter (201A) stacks the
   letter on a second line when that renders larger. Returns {font, lines}. */
function seatmapLabelFont(label, geom) {
  function fit(text, cap) {
    return Math.min(22, cap, geom.depth * 0.45, (geom.arc * 0.96) / (Math.max(1, text.length) * 0.62));
  }
  var single = fit(label, geom.arc * 0.34), stacked = /^(\d{1,4})([A-Za-z])$/.exec(label);
  if (stacked && single < 17) {
    var two = Math.min(fit(stacked[1], geom.arc * 0.55), geom.depth * 0.22);
    if (two > single && two >= 9) return { font: Math.round(two * 2) / 2, lines: [stacked[1], stacked[2]] };
  }
  return { font: single >= 9 ? Math.round(single * 2) / 2 : 0, lines: [label] };
}
/* Per-section fill intensity for the mode, totals, legend entries and the
   highlight set. Prices and revenue are "where price known": a section without
   a price contributes nothing and is listed as unpriced. */
function seatmapModel(panel, state) {
  state = panelObject(state) ? state : {};
  var geometry = seatmapGeometry(panel), rings = seatmapRings(panel), tiers = seatmapTiers(panel), decl = seatmapSections(panel);
  var bowl = geometry === 'bowl' ? spmBowl(seatmapBowl(panel), rings, { mirror: seatmapMirror(panel) }) : null;
  var placement = bowl ? seatmapPlacement(panel, decl, bowl) : null;
  var view = bowl ? { width: bowl.width, height: bowl.height } : seatmapViewBox(panel);
  var mode = SEATMAP_MODES.indexOf(state.mode) >= 0 ? state.mode : 'sold';
  var sold = panelObject(state.sold) ? state.sold : {}, held = panelObject(state.held) ? state.held : {};
  var price = panelObject(state.price) ? state.price : {}, tierOf = panelObject(state.tierOf) ? state.tierOf : {};
  var currency = spmCurrency(panel.currency), capacities = Object.create(null);
  decl.forEach(function (s) { capacities[s.id] = s.capacity; });
  var highlight = [];
  (typeof state.highlight === 'string' ? [state.highlight] : Array.isArray(state.highlight) ? state.highlight : []).forEach(function (id) {
    if (typeof id === 'string' && id in capacities && highlight.indexOf(id) < 0 && highlight.length < SEATMAP_MAX_HIGHLIGHT) highlight.push(id);
  });
  var maxPrice = 0, maxRevenue = 0, zones = {}, zoneOrder = [];
  var sections = decl.map(function (s) {
    /* Maps may carry ids and counts from an earlier declaration: ids absent
       here are simply not drawn and counts clamp to this capacity. */
    var soldN = seatmapCount(sold[s.id]) ? Math.min(sold[s.id], s.capacity) : 0;
    var hold = seatmapHeldOk(held[s.id], Number.MAX_SAFE_INTEGER) ? {
      count: Math.min(held[s.id].count, s.capacity), label: typeof held[s.id].label === 'string' ? held[s.id].label : '', until: typeof held[s.id].until === 'string' ? held[s.id].until : '',
    } : null;
    var p = isFiniteNum(price[s.id]) && price[s.id] >= 0 ? price[s.id] : null;
    var tierId = typeof tierOf[s.id] === 'string' && tiers.some(function (t) { return t.id === tierOf[s.id]; }) ? tierOf[s.id] : s.tier;
    var tier = tierId ? tiers.filter(function (t) { return t.id === tierId; })[0] : null;
    /* sold × price can overflow for a valid finite price; an overflowing
       product makes that section's revenue unavailable rather than Infinity. */
    var revenue = p === null ? null : soldN * p;
    if (revenue !== null && !isFiniteNum(revenue)) revenue = null;
    if (p !== null) maxPrice = Math.max(maxPrice, p);
    if (revenue !== null) maxRevenue = Math.max(maxRevenue, revenue);
    if (s.zone) { if (!panelOwn(zones, s.zone)) { zones[s.zone] = 0; zoneOrder.push(s.zone); } zones[s.zone]++; }
    var geom = bowl ? bowl.wedge(s.ring, placement[s.id][0], placement[s.id][1]) : seatmapPathGeometry(s.path);
    return {
      id: s.id, label: s.label, ring: s.ring, ringId: s.ringId, ringLabel: rings[s.ring].label, zone: s.zone, capacity: s.capacity,
      sold: soldN, held: hold, price: p, revenue: revenue, revenueOverflow: p !== null && revenue === null, tier: tier, tierId: tierId,
      pct: spmPercent(soldN, s.capacity), highlighted: highlight.indexOf(s.id) >= 0,
      d: geom.d, x: geom.x, y: geom.y, font: seatmapLabelFont(s.label, geom).font, lines: seatmapLabelFont(s.label, geom).lines, intensity: 0, known: true,
      kind: s.kind, range: bowl ? placement[s.id] : null,
    };
  });
  var tierIndex = {};
  tiers.forEach(function (tier, i) { tierIndex[tier.id] = i; });
  sections.forEach(function (s) {
    if (mode === 'sold') s.intensity = s.capacity ? s.sold / s.capacity : 0;
    else if (mode === 'held') s.intensity = s.held ? s.held.count / s.capacity : 0;
    else if (mode === 'price') { s.known = s.price !== null; s.intensity = s.known && maxPrice > 0 ? s.price / maxPrice : s.known ? 1 : 0; }
    else if (mode === 'revenue') { s.known = s.revenue !== null; s.intensity = s.known && maxRevenue > 0 ? s.revenue / maxRevenue : 0; }
    else if (mode === 'tier') { s.known = !!s.tier; s.intensity = s.tier ? 0.85 : 0; }
    if (!isFiniteNum(s.intensity)) s.intensity = 0;
    s.intensity = Math.max(0, Math.min(1, s.intensity));
    s.color = mode === 'tier' && s.tier ? (s.tier.color || seatmapTierPalette(tierIndex[s.tier.id])) : null;
    /* Label colour: accent fills switch at a threshold per skin; tier fills
       use the tier colour's own luminance. */
    s.labelTone = s.color ? (spmHexLuma(s.color) > 0.5 ? 'dark' : 'light') : (s.intensity >= 0.55 && s.known ? 'on' : '');
  });
  var totals = { sold: 0, capacity: 0, held: 0, revenue: 0, priced: 0, pricedSold: 0 };
  var ringTotals = rings.map(function (ring) { return { id: ring.id, label: ring.label, sold: 0, capacity: 0, held: 0, sections: 0 }; });
  sections.forEach(function (s) {
    totals.sold += s.sold; totals.capacity += s.capacity;
    if (s.held) totals.held += s.held.count;
    if (s.price !== null) { totals.priced++; totals.pricedSold += s.sold; }
    if (s.revenue !== null && totals.revenue !== null) { totals.revenue += s.revenue; if (!isFiniteNum(totals.revenue)) totals.revenue = null; }
    else if (s.revenueOverflow) totals.revenue = null;
    var ring = ringTotals[s.ring];
    ring.sold += s.sold; ring.capacity += s.capacity; ring.sections++;
    if (s.held) ring.held += s.held.count;
  });
  totals.pct = spmPercent(totals.sold, totals.capacity);
  /* Revenue is unavailable when any priced section's product, or the sum,
     overflowed; the totals strip then shows a dash instead of Infinity. */
  totals.revenueOverflow = totals.revenue === null;
  if (totals.revenue === null) totals.revenue = 0;
  totals.revenueKnown = totals.priced > 0 && !totals.revenueOverflow;
  totals.allPriced = totals.priced === sections.length && sections.length > 0;
  ringTotals.forEach(function (ring) { ring.pct = spmPercent(ring.sold, ring.capacity); });
  var tierCounts = tiers.map(function (tier, i) {
    return { id: tier.id, label: tier.label, color: tier.color || seatmapTierPalette(i), sections: sections.filter(function (s) { return s.tierId === tier.id; }).length };
  });
  var prices = sections.filter(function (s) { return s.price !== null; }).map(function (s) { return s.price; });
  return {
    geometry: geometry, bowl: bowl ? bowl.bowl : null, view: view, field: bowl ? bowl.field : null, fieldLines: bowl ? bowl.fieldLines : '', mode: mode, currency: currency,
    sections: sections, rings: ringTotals, tiers: tierCounts, zones: zoneOrder.map(function (z) { return { zone: z, sections: zones[z] }; }),
    landmarks: seatmapPlaceLandmarks(seatmapLandmarks(panel), sections, bowl ? SEATMAP_CENTRE : [view.width / 2, view.height / 2]),
    highlight: highlight, totals: totals, showTotals: panel.showTotals !== false,
    priceRange: prices.length ? { min: Math.min.apply(null, prices), max: Math.max.apply(null, prices) } : null,
    complete: sections.length >= SEATMAP_MIN_SECTIONS, hasHolds: totals.held > 0,
    /* Everything the in-place patch would otherwise keep stale: ids, path
       data, label text and lines, landmarks and tier definitions. */
    geometryKey: spmHash(geometry + ':' + view.width + 'x' + view.height + ':' + sections.map(function (s) {
      return s.id + '@' + s.x + ',' + s.y + '|' + s.d + '|' + s.lines.join('/') + '|' + s.font;
    }).join(',') + ';' + JSON.stringify(seatmapLandmarks(panel)) + ';' + JSON.stringify(tiers) + ';' + (bowl ? bowl.field : '')),
  };
}
function seatmapTierPalette(i) {
  return ['#7D9BC6', '#8B7FD5', '#55A896', '#D7A34F', '#D67E82', '#839C60', '#5FB3C9', '#B089B8'][(i || 0) % 8];
}
function seatmapInt(n) {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}
function seatmapRevenueText(model) {
  var totals = model.totals;
  if (!totals.revenueKnown) return '—';
  return totals.revenue >= 10000 ? model.currency + ' ' + spmCompact(totals.revenue) : spmMoney(totals.revenue, model.currency);
}
function seatmapSectionTitle(s, model) {
  var parts = [s.label + (s.label !== s.id ? ' (' + s.id + ')' : ''), s.ringLabel];
  if (s.zone) parts.push(s.zone);
  parts.push(seatmapInt(s.sold) + ' / ' + seatmapInt(s.capacity) + ' sold · ' + Math.round(s.pct) + '%');
  if (s.held) parts.push('held ' + seatmapInt(s.held.count) + (s.held.label ? ' · ' + s.held.label : '') + (s.held.until ? ' · until ' + s.held.until : ''));
  parts.push(s.price !== null ? spmMoney(s.price, model.currency) : 'unpriced');
  if (s.tier) parts.push('tier ' + s.tier.label);
  return parts.join(' · ');
}
function seatmapAria(model) {
  var t = model.totals, text = 'Venue map, ' + model.mode + ' view: ' + seatmapInt(t.sold) + ' of ' + seatmapInt(t.capacity) + ' seats sold (' + Math.round(t.pct) + '%)';
  if (t.held) text += ', ' + seatmapInt(t.held) + ' held';
  if (t.revenueKnown) text += ', revenue ' + seatmapRevenueText(model) + (t.allPriced ? '' : ' where price known');
  if (model.highlight.length) text += '. Highlighted: ' + model.highlight.join(', ');
  return text + '.';
}
function seatmapSectionMarkup(s, model, hid) {
  var fill = s.color ? s.color : 'var(--seatmap-accent)';
  var opacity = s.known ? 0.1 + 0.9 * s.intensity : 0.04;
  var cls = 'seatmap-sec' + (s.highlighted ? ' seatmap-hi' : '') + (s.known ? '' : ' seatmap-unknown') + (s.held ? ' seatmap-held' : '');
  var h = '<g class="' + cls + '" data-sec="' + esc(s.id) + '">' +
    '<path class="seatmap-fill" d="' + s.d + '" fill="' + fill + '" fill-opacity="' + opacity.toFixed(3) + '"><title>' + esc(seatmapSectionTitle(s, model)) + '</title></path>';
  if (s.held) h += '<path class="seatmap-hold" d="' + s.d + '" fill="url(#' + hid + ')"/>';
  if (s.font) {
    h += '<text class="seatmap-lbl' + (s.labelTone ? ' seatmap-lbl-' + s.labelTone : '') + '" x="' + s.x + '" y="' + s.y + '" font-size="' + s.font + '" dy="' + (s.lines.length > 1 ? '-0.2em' : '0.35em') + '">';
    if (s.lines.length > 1) h += esc(s.lines[0]) + '<tspan x="' + s.x + '" dy="1.05em">' + esc(s.lines[1]) + '</tspan>'; else h += esc(s.lines[0]);
    h += '</text>';
  }
  return h + '</g>';
}
function seatmapLegend(model) {
  var h = '<div class="seatmap-legend">', mode = model.mode, cur = model.currency;
  var rule = { sold: 'fill = sold ÷ capacity', held: 'fill = held ÷ capacity', price: 'fill = price ÷ top price', tier: 'colour = price tier', revenue: 'fill = sold × price ÷ top section' }[mode];
  h += '<span class="seatmap-mode"><b>' + mode + '</b> · ' + rule + '</span>';
  if (mode === 'tier') model.tiers.forEach(function (tier) {
    h += '<span><i class="seatmap-sw" style="background:' + tier.color + '"></i>' + esc(tier.label) + ' <small>' + tier.sections + '</small></span>';
  });
  else {
    h += '<span><i class="seatmap-sw seatmap-sw-low"></i>low</span><span><i class="seatmap-sw seatmap-sw-high"></i>high</span>';
    if (mode === 'price' && model.priceRange) h += '<span>' + esc(spmMoney(model.priceRange.min, cur)) + ' – ' + esc(spmMoney(model.priceRange.max, cur)) + '</span>';
  }
  if (model.hasHolds) h += '<span><i class="seatmap-sw seatmap-sw-hold"></i>held block</span>';
  if ((mode === 'price' || mode === 'revenue') && !model.totals.allPriced) h += '<span><i class="seatmap-sw seatmap-sw-unknown"></i>unpriced</span>';
  h += '</div><div class="seatmap-rings">';
  model.rings.forEach(function (ring) {
    if (!ring.sections) return;
    h += '<span><b>' + esc(ring.label) + '</b> ' + seatmapInt(ring.sold) + ' / ' + seatmapInt(ring.capacity) + ' · ' + Math.round(ring.pct) + '%' + (ring.held ? ' · ' + seatmapInt(ring.held) + ' held' : '') + '</span>';
  });
  if (model.zones.length) h += '<span class="seatmap-zones">' + model.zones.map(function (z) { return esc(z.zone) + ' <small>' + z.sections + '</small>'; }).join(' · ') + '</span>';
  return h + '</div>';
}
function seatmapTotals(model) {
  var t = model.totals;
  return '<div class="seatmap-totals">' +
    '<div class="seatmap-stat"><b>' + seatmapInt(t.sold) + ' / ' + seatmapInt(t.capacity) + '</b><span>sold / capacity</span></div>' +
    '<div class="seatmap-stat"><b>' + Math.round(t.pct) + '%</b><span>sell-through</span></div>' +
    '<div class="seatmap-stat' + (t.held ? ' seatmap-stat-warn' : '') + '"><b>' + seatmapInt(t.held) + '</b><span>held</span></div>' +
    '<div class="seatmap-stat"><b>' + esc(seatmapRevenueText(model)) + '</b><span>revenue' + (t.revenueKnown && !t.allPriced ? ' · where price known' : '') + '</span></div></div>';
}
function seatmapHTML(panel, state, model, hid, pulse) {
  model = model || seatmapModel(panel, state);
  hid = hid || 'spm-static';
  var h = '<div class="seatmap seatmap-mode-' + model.mode + (pulse ? ' seatmap-pulse' : '') + '">';
  if (model.showTotals) h += seatmapTotals(model);
  h += '<svg class="seatmap-svg" viewBox="0 0 ' + model.view.width + ' ' + model.view.height + '" role="img" aria-label="' + esc(seatmapAria(model)) + '">' +
    '<defs><pattern id="' + hid + '" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
    '<rect width="9" height="9" class="seatmap-hatch-bg"/><rect width="3.5" height="9" class="seatmap-hatch-bar"/></pattern></defs>';
  if (!model.complete) h += '<text class="seatmap-empty" x="' + model.view.width / 2 + '" y="' + model.view.height / 2 + '">Declare ' + SEATMAP_MIN_SECTIONS + '–' + SEATMAP_MAX_SECTIONS + ' sections to draw the map.</text>';
  if (model.field) h += '<path class="seatmap-field" d="' + model.field + '"/>';
  if (model.fieldLines) h += '<path class="seatmap-field-line" d="' + model.fieldLines + '"/>';
  h += '<g class="seatmap-sections">';
  model.sections.forEach(function (s) { h += seatmapSectionMarkup(s, model, hid); });
  h += '</g><g class="seatmap-outlines">';
  model.sections.forEach(function (s) { if (s.highlighted) h += '<path class="seatmap-outline" d="' + s.d + '"/>'; });
  h += '</g><g class="seatmap-landmarks">';
  model.landmarks.forEach(function (mark) {
    h += '<g class="seatmap-landmark"><rect x="' + spmRound(mark.x - mark.width / 2) + '" y="' + spmRound(mark.y - mark.height / 2) + '" width="' + mark.width + '" height="' + mark.height + '" rx="13"/>' +
      '<text x="' + mark.x + '" y="' + mark.y + '" dy="0.35em">' + esc(mark.label) + '</text></g>';
  });
  h += '</g></svg>' + seatmapLegend(model) + '</div>';
  return softwarePanelShell(h, state || {});
}
/* In-place update so section fills transition between steps instead of being
   rebuilt. Only the SVG section attributes change; the totals, legend, outline
   layer and note are replaced wholesale. Returns false when it cannot apply. */
function seatmapPatch(host, model, html, hid) {
  if (typeof host.querySelector !== 'function' || !host.ownerDocument) return false;
  var shell = host.querySelector('.swpanel'), wrapper = host.querySelector('.seatmap'), svg = host.querySelector('.seatmap-svg');
  if (!shell || !wrapper || !svg) return false;
  var probe = host.ownerDocument.createElement('div');
  probe.innerHTML = html;
  var nextShell = probe.querySelector('.swpanel'), nextWrapper = probe.querySelector('.seatmap'), nextSvg = probe.querySelector('.seatmap-svg');
  if (!nextShell || !nextWrapper || !nextSvg) return false;
  var groups = {}, old = svg.querySelectorAll('g.seatmap-sec');
  for (var i = 0; i < old.length; i++) groups[old[i].getAttribute('data-sec')] = old[i];
  var fresh = nextSvg.querySelectorAll('g.seatmap-sec');
  if (fresh.length !== old.length) return false;
  for (var j = 0; j < fresh.length; j++) {
    var next = fresh[j], g = groups[next.getAttribute('data-sec')];
    if (!g) return false;
    g.setAttribute('class', next.getAttribute('class'));
    var fill = g.querySelector('.seatmap-fill'), nextFill = next.querySelector('.seatmap-fill');
    fill.setAttribute('fill', nextFill.getAttribute('fill'));
    fill.setAttribute('fill-opacity', nextFill.getAttribute('fill-opacity'));
    var title = fill.querySelector('title'), nextTitle = nextFill.querySelector('title');
    if (title && nextTitle) title.textContent = nextTitle.textContent;
    var hold = g.querySelector('.seatmap-hold'), nextHold = next.querySelector('.seatmap-hold');
    if (hold && !nextHold) g.removeChild(hold);
    else if (!hold && nextHold) g.insertBefore(nextHold, fill.nextSibling);
    var lbl = g.querySelector('.seatmap-lbl'), nextLbl = next.querySelector('.seatmap-lbl');
    if (lbl && nextLbl) lbl.setAttribute('class', nextLbl.getAttribute('class'));
    else if (lbl && !nextLbl) g.removeChild(lbl);
    else if (!lbl && nextLbl) g.appendChild(nextLbl);
  }
  svg.setAttribute('aria-label', nextSvg.getAttribute('aria-label'));
  var outlines = svg.querySelector('.seatmap-outlines'), nextOutlines = nextSvg.querySelector('.seatmap-outlines');
  if (outlines && nextOutlines) svg.replaceChild(nextOutlines, outlines);
  wrapper.setAttribute('class', nextWrapper.getAttribute('class'));
  var children = Array.prototype.slice.call(wrapper.childNodes);
  children.forEach(function (child) { if (child !== svg) wrapper.removeChild(child); });
  var before = true;
  Array.prototype.slice.call(nextWrapper.childNodes).forEach(function (child) {
    if (child === nextSvg) { before = false; return; }
    if (before) wrapper.insertBefore(child, svg); else wrapper.appendChild(child);
  });
  var note = shell.querySelector('.swnote'), nextNote = nextShell.querySelector('.swnote');
  if (note) shell.removeChild(note);
  if (nextNote) shell.appendChild(nextNote);
  return true;
}
function seatmapTemplateSections() {
  var zones = ['end', 'corner', 'sideline', 'corner', 'end', 'corner', 'sideline', 'corner'], out = [];
  zones.forEach(function (zone, i) { out.push({ id: '10' + (i + 1), ring: 'lower', capacity: 420, zone: zone }); });
  zones.forEach(function (zone, i) { out.push({ id: '20' + (i + 1), ring: 'upper', capacity: 640, zone: zone }); });
  return out;
}
PanelRegistry.define('seatmap', {
  label: 'Venue map', since: '0.2.0', order: 50,
  validateDeclaration: seatmapDeclarationWarnings, validatePatch: seatmapPatchWarnings, fold: seatmapFold,
  render: function (host, panel, state, skin, states, stepIdx, animate) {
    var model = seatmapModel(panel, state);
    /* Pattern id and highlight history are per host: presentation only. */
    var hid = host._spmId || (host._spmId = 'spmh' + ++ZF_SEQ);
    var key = model.highlight.join('|');
    var pulse = !!animate && host._spmHi !== undefined && host._spmHi !== key && model.highlight.length > 0;
    host._spmHi = key;
    var html = seatmapHTML(panel, state, model, hid, pulse);
    var patchable = !!animate && host._spmGeom === model.geometryKey;
    host._spmGeom = model.geometryKey;
    return { html: html, patch: patchable ? function () { return seatmapPatch(host, model, html, hid); } : null };
  },
  presentation: { ambientInitial: true },
  layout: {
    sectionSizing: { minWidth: 360, preferredWidth: 560, maxWidth: 900, aspectPolicy: 'fixed', bodyAspect: 1.3, grow: 1, contentSelector: '.seatmap-svg' },
    canvasSizing: { mode: 'fixed-aspect', aspect: 1.3, resizeAxis: 'width' },
    large: true, height: 16, fallbackHeight: 16,
  },
  styles: String.raw`
.seatmap{font-size:11px;color:var(--dtext);min-width:0;--seatmap-accent:#38E1FF;--seatmap-label-on:#06202A}
.sk-daylight .seatmap{--seatmap-accent:#4956C9;--seatmap-label-on:#FFFFFF}
.seatmap-totals{display:flex;flex-wrap:wrap;gap:6px 16px;margin:0 0 8px}
.seatmap-stat b{display:block;font:700 15px/1.2 'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;color:var(--dink)}
.seatmap-stat span{font:500 9px 'IBM Plex Mono',monospace;letter-spacing:.06em;text-transform:uppercase;color:var(--dfaint)}
.seatmap-stat-warn b{color:#D7A34F}
.seatmap-svg{display:block;width:100%;height:auto}
.seatmap-field{fill:color-mix(in srgb,var(--dtext) 7%,transparent);stroke:color-mix(in srgb,var(--dtext) 22%,transparent);stroke-width:1.5}
.seatmap-field-line{fill:none;stroke:color-mix(in srgb,var(--dtext) 18%,transparent);stroke-width:2}
.seatmap-fill{stroke:color-mix(in srgb,var(--dtext) 30%,transparent);stroke-width:1.5;transition:fill-opacity .3s ease,fill .3s ease}
.seatmap-unknown .seatmap-fill{stroke-dasharray:6 5}
.seatmap-hold{pointer-events:none;opacity:.9}
.seatmap-hatch-bg{fill:#D7A34F;fill-opacity:.18}.seatmap-hatch-bar{fill:#D7A34F;fill-opacity:.85}
.seatmap-lbl{font-family:'IBM Plex Mono',monospace;font-weight:600;text-anchor:middle;fill:var(--dink);pointer-events:none;transition:fill .3s ease}
.seatmap-lbl-on{fill:var(--seatmap-label-on)}.seatmap-lbl-dark{fill:#0B1220}.seatmap-lbl-light{fill:#FFFFFF}
.seatmap-hi .seatmap-fill{stroke:var(--dink);stroke-width:3}
.seatmap-outline{fill:none;stroke:var(--dink);stroke-width:4;stroke-linejoin:round;pointer-events:none}
.seatmap-pulse .seatmap-outline{animation:seatmap-pulse .6s ease-out}
@keyframes seatmap-pulse{0%{stroke-width:4;opacity:1}40%{stroke-width:14;opacity:.55}100%{stroke-width:4;opacity:1}}
.seatmap-landmark{pointer-events:none}
.seatmap-landmark rect{fill:color-mix(in srgb,var(--dtext) 14%,transparent);stroke:color-mix(in srgb,var(--dtext) 35%,transparent);stroke-width:1.5}
.seatmap-landmark text{font:600 14px 'IBM Plex Sans',sans-serif;fill:var(--dtext);text-anchor:middle;letter-spacing:.06em;text-transform:uppercase}
.seatmap-empty{font:500 24px 'IBM Plex Sans',sans-serif;fill:var(--dfaint);text-anchor:middle}
.seatmap-legend,.seatmap-rings{display:flex;flex-wrap:wrap;gap:4px 12px;margin-top:6px;font:500 10px 'IBM Plex Mono',monospace;color:var(--dfaint)}
.seatmap-legend b,.seatmap-rings b{color:var(--dtext);font-weight:600}
.seatmap-legend small,.seatmap-rings small{font-size:9px;opacity:.8}
.seatmap-sw{display:inline-block;width:10px;height:10px;border-radius:2px;vertical-align:-1px;margin-right:4px;background:var(--seatmap-accent)}
.seatmap-sw-low{background:color-mix(in srgb,var(--seatmap-accent) 18%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--dtext) 30%,transparent)}
.seatmap-sw-high{background:var(--seatmap-accent)}
.seatmap-sw-hold{background:repeating-linear-gradient(45deg,#D7A34F 0 2px,rgba(215,163,79,.2) 2px 6px)}
.seatmap-sw-unknown{background:transparent;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--dtext) 50%,transparent);border-style:dashed}
.seatmap-zones{flex-basis:100%}
@media (prefers-reduced-motion:reduce){.seatmap-fill,.seatmap-lbl{transition:none}.seatmap-pulse .seatmap-outline{animation:none}}
@media print{.seatmap-fill,.seatmap-lbl{transition:none}.seatmap-pulse .seatmap-outline{animation:none}.seatmap-svg{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
`,
  authoring: {
    initialFields: true,
    transientFields: ['sold', 'held', 'price', 'tierOf', 'mode', 'highlight', 'note'],
    template: {
      title: 'Venue map', bowl: 'rink', currency: 'USD',
      rings: [{ id: 'lower', label: 'Lower bowl' }, { id: 'upper', label: 'Upper bowl' }],
      sections: seatmapTemplateSections(),
      initial: { sold: { 101: 380, 102: 300, 103: 410, 104: 405, 105: 290, 106: 240, 107: 400, 108: 395, 201: 320, 202: 180, 203: 420, 204: 390, 205: 150, 206: 120, 207: 260, 208: 200 } },
    },
    setupFields: [
      ['geometry', 'text'], ['bowl', 'text'], ['direction', 'text'], ['startAt', 'text'], ['ringSlots', 'num'], ['currency', 'text'], ['showTotals', 'jsonAny'],
      ['rings', 'rows', { max: SEATMAP_MAX_RINGS, cols: [{ k: 'id', req: true }, { k: 'label' }] }],
      ['sections', 'rows', { wide: true, max: SEATMAP_MAX_SECTIONS, cols: [{ k: 'id', req: true }, { k: 'label' }, { k: 'ring', req: true }, { k: 'slot', kind: 'num' }, { k: 'span', kind: 'num' }, { k: 'capacity', kind: 'num', req: true }, { k: 'zone' }, { k: 'tier' }, { k: 'path' }] }],
      ['tiers', 'rows', { max: SEATMAP_MAX_TIERS, cols: [{ k: 'id', req: true }, { k: 'label' }, { k: 'color' }] }],
      ['landmarks', 'rows', { max: SEATMAP_MAX_LANDMARKS, cols: [{ k: 'id', req: true }, { k: 'label' }, { k: 'x', kind: 'num' }, { k: 'y', kind: 'num' }] }],
      ['viewBox', 'json'], ['initial', 'json'],
    ],
    patchFields: [
      ['sold', 'json', { nullable: true }], ['held', 'json', { nullable: true }], ['price', 'json', { nullable: true }], ['tierOf', 'json', { nullable: true }],
      ['mode', 'enum', SEATMAP_MODES], ['highlight', 'jsonAny', { nullable: true }], ['note', 'text'],
    ],
    fieldMeta: {
      geometry: { label: 'Geometry', help: 'bowl draws generic rings from bowl, rings and each section’s zone. paths uses each section’s own SVG path (imported with tools/seatmap-import.mjs).' },
      bowl: { label: 'Bowl shape', help: 'rink (default: two straight sidelines joined by rounded ends), oval, rectangle or pitch. Generic shapes only; no real venue is drawn.' },
      direction: { label: 'Numbering direction', help: 'clockwise (default) or counterclockwise: the order sections walk around the bowl from the left end.' },
      startAt: { label: 'Walk starts at', help: 'end (default): the first sections sit on the left end; sideline: the walk starts on the top sideline.' },
      ringSlots: { label: 'Slots per ring', help: 'Only for rings whose sections carry an explicit slot: 8–32 equal arc-length slots, default 16. Rings without slots are placed by zone.' },
      currency: { label: 'Currency', help: 'Three-letter ISO code used for prices and revenue; default USD. No conversion.' },
      showTotals: { label: 'Show totals strip', help: 'Sold / capacity, sell-through, held seats and revenue where price is known. Default on.' },
      rings: { label: 'Rings', help: '1–4 rings from the inside out, e.g. 100 level, 200 level, 300 level. Ring ids group sections in the legend.' },
      sections: { label: 'Sections', help: '4–160 sections in numbering order. ring is a ring id; zone (sideline, corner, end or club) decides where the wedge sits; optional slot/span place a ring by slots instead; path is the SVG path for paths geometry; capacity is seats; tier is a tier id.' },
      tiers: { label: 'Price tiers', help: 'Up to 8 tiers with optional #RRGGBB colours, shown in tier mode.' },
      landmarks: { label: 'Landmarks', help: 'Up to 8 text labels inside the viewBox, e.g. home bench or stage.' },
      viewBox: { label: 'viewBox (paths)', help: '{"width","height"} for paths geometry; default 1000×1000. Aspect is preserved.' },
      sold: { label: 'Sold by section', help: 'Object keyed by section id → seats sold (0 to capacity). Keys merge into the carried map; a key set to null forgets that section; null clears every section.', nullLabel: 'Clear every sold count' },
      held: { label: 'Holds by section', help: 'Object keyed by section id → {"count", "label", "until"} or null. Held seats draw a hatch. Merges like sold.', nullLabel: 'Clear every hold' },
      price: { label: 'Price by section', help: 'Object keyed by section id → price in the panel currency. Revenue = sold × price where price is known. Merges like sold.', nullLabel: 'Clear every price' },
      tierOf: { label: 'Tier by section', help: 'Object keyed by section id → tier id, overriding the declared tier. Merges like sold.', nullLabel: 'Clear every tier override' },
      mode: { label: 'Colour mode', help: 'sold (default), held, price, tier or revenue chooses what the fill intensity means.' },
      highlight: { label: 'Highlight', help: 'One section id, an array of up to 8 ids, or null. Highlighted sections get a bold outline and pulse once when the set changes.', nullLabel: 'No highlight' },
      note: { label: 'Explanation' },
    },
    picker: {
      order: 50, name: 'Venue map', category: 'Sports & events marketing', tagline: 'Where the seats sold',
      description: 'A bowl of sections coloured by sell-through, holds, price, tier or revenue, so readers watch presales, group holds and promotions fill the building step by step.',
    },
    example: function (sample) {
      var panel = sample.panel, state = sample.state;
      panel.title = 'Venue map';
      panel.bowl = 'rink';
      panel.rings = [{ id: 'lower', label: 'Lower' }, { id: 'club', label: 'Club' }, { id: 'upper', label: 'Upper' }];
      panel.tiers = [{ id: 'p1', label: 'Premium', color: '#D7A34F' }, { id: 'p2', label: 'Plus', color: '#7D9BC6' }, { id: 'p3', label: 'Value', color: '#55A896' }];
      panel.sections = [];
      var zones = ['end', 'corner', 'sideline', 'sideline', 'corner', 'end', 'end', 'corner', 'sideline', 'sideline', 'corner', 'end'];
      var sold = {}, price = {};
      [['lower', 'L', 480, 'p1', 0.8], ['club', 'C', 320, 'p2', 0.6], ['upper', 'U', 720, 'p3', 0.35]].forEach(function (ring) {
        zones.forEach(function (zone, i) {
          var id = ring[1] + (101 + i);
          panel.sections.push({ id: id, ring: ring[0], capacity: ring[2], zone: zone, tier: ring[3] });
          sold[id] = Math.round(ring[2] * Math.min(1, ring[4] + ((i * 7) % 5) * 0.045));
          price[id] = ring[3] === 'p1' ? 145 : ring[3] === 'p2' ? 98 : 42;
        });
      });
      panel.landmarks = [{ id: 'bench', label: 'home bench', x: 420, y: 322 }];
      state.sold = sold;
      state.price = price;
      state.held = { U108: { count: 400, label: 'School night group', until: 'T-7d' } };
      state.highlight = 'U108';
      state.mode = 'sold';
      state.note = 'Illustrative numbers. A 400-seat group hold sits in U108 until seven days out.';
      panel.initial = builderClone(state);
      return sample;
    },
  },
});
