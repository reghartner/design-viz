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
/* Optional rink outline for paths geometry, in viewBox units:
   {shape:"rink", x, y, width, height}, drawn under the sections with the
   bowl's field style. Corners follow 200 × 85 ft proportions (28 ft radius). */
var SEATMAP_FIELD_SHAPES = ['rink'];
function seatmapFieldRect(panel) {
  var f = panel.field, view = seatmapViewBox(panel);
  if (seatmapGeometry(panel) !== 'paths' || !panelObject(f) || SEATMAP_FIELD_SHAPES.indexOf(f.shape) < 0) return null;
  if (![f.x, f.y, f.width, f.height].every(isFiniteNum) || f.x < 0 || f.y < 0 || f.width < 10 || f.height < 10 ||
    f.x + f.width > view.width || f.y + f.height > view.height) return null;
  return { x: f.x, y: f.y, width: f.width, height: f.height };
}
function seatmapFieldShape(rect) {
  var r = spmRound(Math.min(rect.height * 28 / 85, rect.width / 2, rect.height / 2));
  var x0 = spmRound(rect.x), y0 = spmRound(rect.y), x1 = spmRound(rect.x + rect.width), y1 = spmRound(rect.y + rect.height);
  var d = 'M' + spmRound(x0 + r) + ',' + y0 + 'L' + spmRound(x1 - r) + ',' + y0 + 'A' + r + ',' + r + ' 0 0 1 ' + x1 + ',' + spmRound(y0 + r) +
    'L' + x1 + ',' + spmRound(y1 - r) + 'A' + r + ',' + r + ' 0 0 1 ' + spmRound(x1 - r) + ',' + y1 + 'L' + spmRound(x0 + r) + ',' + y1 +
    'A' + r + ',' + r + ' 0 0 1 ' + x0 + ',' + spmRound(y1 - r) + 'L' + x0 + ',' + spmRound(y0 + r) + 'A' + r + ',' + r + ' 0 0 1 ' + spmRound(x0 + r) + ',' + y0 + 'Z';
  /* Centre line and the two blue lines, 25 ft either side of centre. */
  var lines = [0.375, 0.5, 0.625].map(function (f) {
    var x = spmRound(rect.x + rect.width * f);
    return 'M' + x + ',' + y0 + 'L' + x + ',' + y1;
  }).join('');
  return { field: d, fieldLines: lines };
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
/* `venue` names a SeatmapVenues entry (packages/sports/panels/venue-library.js); its
   fields fill every venue field the panel does not write. An unknown id
   warns with the available ids and the panel draws its own fields. */
function seatmapResolve(panel) {
  return SeatmapVenues.resolve(panel);
}
function seatmapVenueWarnings(panel, path, warnings) {
  if (!panelOwn(panel, 'venue') || SeatmapVenues.get(panel.venue)) return;
  var ids = SeatmapVenues.ids();
  warnings.push(path + '.venue: ' + (typeof panel.venue === 'string' ? 'unknown venue "' + panel.venue + '"' : 'expected a venue id') +
    ' — available: ' + (ids.length ? ids.join(', ') : 'none') + '; drawing the panel’s own sections');
}
function seatmapDeclarationWarnings(raw, path, warnings) {
  seatmapVenueWarnings(raw, path, warnings);
  var panel = seatmapResolve(raw);
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
  if (panel.field !== undefined) {
    if (geometry !== 'paths') warnings.push(path + '.field: only used by geometry "paths" — ignored');
    else if (!seatmapFieldRect(panel))
      warnings.push(path + '.field: expected {"shape":"rink","x","y","width","height"} with width and height ≥ 10 inside the viewBox — no field drawn');
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
  panel = seatmapResolve(panel);
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
/* Label size from the wedge: up to 24 units, hidden below 9 (the tooltip
   still carries the id). A short id with a trailing letter (201A) stacks the
   letter on a second line when that renders larger. Returns {font, lines}. */
function seatmapLabelFont(label, geom) {
  function fit(text, cap) {
    return Math.min(24, cap, geom.depth * 0.45, (geom.arc * 0.96) / (Math.max(1, text.length) * 0.62));
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
  panel = seatmapResolve(panel);
  state = panelObject(state) ? state : {};
  var geometry = seatmapGeometry(panel), rings = seatmapRings(panel), tiers = seatmapTiers(panel), decl = seatmapSections(panel);
  var bowl = geometry === 'bowl' ? spmBowl(seatmapBowl(panel), rings, { mirror: seatmapMirror(panel) }) : null;
  var placement = bowl ? seatmapPlacement(panel, decl, bowl) : null;
  var view = bowl ? { width: bowl.width, height: bowl.height } : seatmapViewBox(panel);
  var fieldRect = bowl ? null : seatmapFieldRect(panel), fieldShape = fieldRect ? seatmapFieldShape(fieldRect) : null;
  var field = bowl ? bowl.field : fieldShape ? fieldShape.field : null, fieldLines = bowl ? bowl.fieldLines : fieldShape ? fieldShape.fieldLines : '';
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
    s.labelTone = s.color ? seatmapTierTone(s.color) : (s.intensity >= SEATMAP_RAMP_SPLIT && s.known ? 'on' : '');
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
    geometry: geometry, bowl: bowl ? bowl.bowl : null, view: view, field: field, fieldLines: fieldLines, mode: mode, currency: currency,
    fieldBox: field ? (fieldRect || seatmapPointsBox(field)) : null,
    sections: sections, rings: ringTotals, tiers: tierCounts, zones: zoneOrder.map(function (z) { return { zone: z, sections: zones[z] }; }),
    landmarks: seatmapPlaceLandmarks(seatmapLandmarks(panel), sections, bowl ? SEATMAP_CENTRE : [view.width / 2, view.height / 2]),
    highlight: highlight, totals: totals, showTotals: panel.showTotals !== false,
    priceRange: prices.length ? { min: Math.min.apply(null, prices), max: Math.max.apply(null, prices) } : null,
    complete: sections.length >= SEATMAP_MIN_SECTIONS, hasHolds: totals.held > 0,
    /* Everything the in-place patch would otherwise keep stale: ids, path
       data, label text and lines, landmarks and tier definitions. */
    geometryKey: spmHash(geometry + ':' + view.width + 'x' + view.height + ':' + sections.map(function (s) {
      return s.id + '@' + s.x + ',' + s.y + '|' + s.d + '|' + s.lines.join('/') + '|' + s.font;
    }).join(',') + ';' + JSON.stringify(seatmapLandmarks(panel)) + ';' + JSON.stringify(tiers) + ';' + (field || '') + (fieldLines && !bowl ? '|' + fieldLines : '')),
  };
}
/* Default tier colours: the categorical series s1..s6, then two quiet extras. */
function seatmapTierPalette(i) {
  return ['#5B6CD6', '#2FA39A', '#E09A3E', '#D9617E', '#8F6FE0', '#3C93D9', '#5FB3C9', '#B089B8'][(i || 0) % 8];
}
/* Label tone on a tier fill: whichever of white or near-black text has the
   higher WCAG contrast on that colour. */
function seatmapTierTone(hex) {
  if (!seatmapColor(hex)) return 'light';
  var c = [1, 3, 5].map(function (i) {
    var v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  var l = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  return (l + 0.05) / 0.0566 >= 1.05 / (l + 0.05) ? 'dark' : 'light';
}
/* The sell-through ramp: five skin stops (--seatmap-r1..r5). Below the label
   split the fill walks r1→r3 (ink labels); from the split it walks r4→r5
   (inverse labels), so every label keeps AA contrast on its own fill. The
   split sits high so the common 30–80% range gets most of the ramp and the
   darkest fills mean nearly gone. */
var SEATMAP_RAMP_SPLIT = 0.8;
function seatmapRampFill(t) {
  t = isFiniteNum(t) ? Math.max(0, Math.min(1, t)) : 0;
  var stops, u;
  if (t < SEATMAP_RAMP_SPLIT) { stops = [1, 2, 3]; u = (t / SEATMAP_RAMP_SPLIT) * 2; }
  else { stops = [4, 5]; u = (t - SEATMAP_RAMP_SPLIT) / (1 - SEATMAP_RAMP_SPLIT); }
  var i = Math.min(stops.length - 2, Math.floor(u)), pct = Math.round((u - i) * 1000) / 10;
  var a = 'var(--seatmap-r' + stops[i] + ')', b = 'var(--seatmap-r' + stops[i + 1] + ')';
  return pct <= 0 ? a : pct >= 100 ? b : 'color-mix(in oklab, ' + b + ' ' + pct + '%, ' + a + ')';
}
/* Bounding box of an M/L polyline path (the traced bowl field). */
function seatmapPointsBox(d) {
  var re = /[ML](-?[\d.]+),(-?[\d.]+)/g, m, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  while ((m = re.exec(d))) {
    var x = +m[1], y = +m[2];
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : null;
}
/* Playing-surface markings, clipped to the field outline. A rink gets goal
   lines, creases and face-off circles (200 × 85 ft proportions); a pitch gets
   turf bands, a halfway line, centre circle and boxes; a rectangle (court)
   gets a halfway line, centre circle and keys. Returns {under, over}: `under`
   sits beneath the authored field lines, `over` above them. */
function seatmapFieldMarks(model, hid) {
  var b = model.fieldBox, kind = model.geometry === 'paths' ? 'rink' : model.bowl;
  if (!b) return { under: '', over: '' };
  var r = spmRound, x = b.x, y = b.y, w = b.width, ht = b.height, cx = x + w / 2, cy = y + ht / 2, clip = ' clip-path="url(#' + hid + '-f)"';
  function circle(cls, px, py, rad) { return '<circle class="' + cls + '" cx="' + r(px) + '" cy="' + r(py) + '" r="' + r(rad) + '"/>'; }
  function line(cls, x0, y0, x1, y1) { return '<path class="' + cls + '" d="M' + r(x0) + ',' + r(y0) + 'L' + r(x1) + ',' + r(y1) + '"/>'; }
  function rect(cls, px, py, rw, rh) { return '<rect class="' + cls + '" x="' + r(px) + '" y="' + r(py) + '" width="' + r(rw) + '" height="' + r(rh) + '"/>'; }
  var under = '<g class="seatmap-marks"' + clip + '>' + rect('seatmap-sheen', x, y, w, ht).replace('/>', ' fill="url(#' + hid + '-s)"/>'), over = '';
  if (kind === 'rink') {
    var ft = w / 200, fv = ht / 85, f = Math.min(ft, fv);
    [[x + 11 * ft, 1], [x + w - 11 * ft, 0]].forEach(function (g) {
      under += line('seatmap-rink-goal', g[0], y, g[0], y + ht);
      under += '<path class="seatmap-rink-crease" d="M' + r(g[0]) + ',' + r(cy - 6 * f) + 'A' + r(6 * f) + ',' + r(6 * f) + ' 0 0 ' + g[1] + ' ' + r(g[0]) + ',' + r(cy + 6 * f) + 'Z"/>';
    });
    under += circle('seatmap-rink-circle', cx, cy, 15 * f);
    [x + 31 * ft, x + w - 31 * ft].forEach(function (fx) {
      [-1, 1].forEach(function (sy) { under += circle('seatmap-rink-circle', fx, cy + sy * 22 * fv, 15 * f) + circle('seatmap-rink-dot', fx, cy + sy * 22 * fv, 1.2 * f); });
    });
    [x + 80 * ft, x + w - 80 * ft].forEach(function (fx) {
      [-1, 1].forEach(function (sy) { under += circle('seatmap-rink-dot', fx, cy + sy * 22 * fv, 1.2 * f); });
    });
    over = '<g class="seatmap-marks"' + clip + '>' + line('seatmap-rink-red', cx, y, cx, y + ht) + circle('seatmap-rink-centre', cx, cy, 1 * f) + '</g>';
  } else if (kind === 'pitch') {
    for (var i = 0; i < 12; i += 2) under += rect('seatmap-turf', x + (w * i) / 12, y, w / 12, ht);
    under += line('seatmap-pitch-line', cx, y, cx, y + ht) + circle('seatmap-pitch-line', cx, cy, 0.135 * ht) + circle('seatmap-pitch-spot', cx, cy, 0.012 * ht);
    [[x, 1], [x + w, -1]].forEach(function (e) {
      var pa = 0.157 * w, ga = 0.052 * w, px = e[1] > 0 ? e[0] : e[0] - pa, gx = e[1] > 0 ? e[0] : e[0] - ga;
      under += rect('seatmap-pitch-line', px, cy - 0.296 * ht, pa, 0.593 * ht) + rect('seatmap-pitch-line', gx, cy - 0.135 * ht, ga, 0.269 * ht);
      under += circle('seatmap-pitch-spot', e[0] + e[1] * 0.105 * w, cy, 0.012 * ht);
    });
  } else if (kind === 'rectangle') {
    under += line('seatmap-court-line', cx, y, cx, y + ht) + circle('seatmap-court-line', cx, cy, 0.12 * ht);
    [[x, 1], [x + w, -1]].forEach(function (e) {
      var kd = 0.207 * w, kx = e[1] > 0 ? e[0] : e[0] - kd;
      under += rect('seatmap-court-key', kx, cy - 0.163 * ht, kd, 0.327 * ht) + circle('seatmap-court-line', e[0] + e[1] * kd, cy, 0.12 * ht);
      under += circle('seatmap-court-line', e[0] + e[1] * 0.056 * w, cy, 0.241 * w);
    });
  }
  return { under: under + '</g>', over: over };
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
  var fill = s.color ? s.color : s.known ? seatmapRampFill(s.intensity) : 'var(--seatmap-unknown-fill)';
  var opacity = 1;
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
  h += '<span class="seatmap-mode"><b>' + mode + '</b><span class="seatmap-sep"> · </span>' + rule + '</span>';
  if (mode === 'tier') model.tiers.forEach(function (tier) {
    h += '<span><i class="seatmap-sw" style="background:' + tier.color + '"></i>' + esc(tier.label) + ' <small>' + tier.sections + '</small></span>';
  });
  else {
    h += '<span class="seatmap-key">low<i class="seatmap-ramp" aria-hidden="true"></i>high</span>';
    if (mode === 'price' && model.priceRange) h += '<span class="seatmap-range">' + esc(spmMoney(model.priceRange.min, cur)) + ' – ' + esc(spmMoney(model.priceRange.max, cur)) + '</span>';
  }
  if (model.hasHolds) h += '<span><i class="seatmap-sw seatmap-sw-hold"></i>held block</span>';
  if ((mode === 'price' || mode === 'revenue') && !model.totals.allPriced) h += '<span><i class="seatmap-sw seatmap-sw-unknown"></i>unpriced</span>';
  h += '</div><div class="seatmap-rings">';
  model.rings.forEach(function (ring) {
    if (!ring.sections) return;
    h += '<span class="seatmap-ring"><i class="seatmap-ring-dot" style="background:' + seatmapRampFill(ring.pct / 100) + '" aria-hidden="true"></i><b>' + esc(ring.label) + '</b> ' + seatmapInt(ring.sold) + ' / ' + seatmapInt(ring.capacity) + ' · ' + Math.round(ring.pct) + '%' + (ring.held ? ' · ' + seatmapInt(ring.held) + ' held' : '') + '</span>';
  });
  if (model.zones.length) h += '<span class="seatmap-zones">' + model.zones.map(function (z) { return esc(z.zone) + ' <small>' + z.sections + '</small>'; }).join(' · ') + '</span>';
  return h + '</div>';
}
function seatmapTotals(model) {
  var t = model.totals, revenue = seatmapRevenueText(model), unit = model.currency + ' ';
  /* Values are ink; denominators, units and the currency code are muted.
     The text of every <b> reads exactly as before ("14,760 / 17,250"). */
  var revenueHTML = revenue.indexOf(unit) === 0 ? '<small>' + esc(unit) + '</small>' + esc(revenue.slice(unit.length)) : esc(revenue);
  var pct = Math.max(0, Math.min(100, t.pct || 0));
  return '<div class="seatmap-totals">' +
    '<div class="seatmap-stat"><b>' + seatmapInt(t.sold) + '<small> / ' + seatmapInt(t.capacity) + '</small></b><span>sold / capacity</span></div>' +
    '<div class="seatmap-stat seatmap-stat-pct"><b>' + Math.round(t.pct) + '<small>%</small><i class="seatmap-meter" aria-hidden="true"><i style="width:' + spmRound(pct) + '%;background:' + seatmapRampFill(pct / 100) + '"></i></i></b><span>sell-through</span></div>' +
    '<div class="seatmap-stat' + (t.held ? ' seatmap-stat-warn' : '') + '"><b>' + seatmapInt(t.held) + '</b><span>held</span></div>' +
    '<div class="seatmap-stat"><b>' + revenueHTML + '</b><span>revenue' + (t.revenueKnown && !t.allPriced ? ' · where price known' : '') + '</span></div></div>';
}
function seatmapHTML(panel, state, model, hid, pulse) {
  panel = seatmapResolve(panel);
  model = model || seatmapModel(panel, state);
  hid = hid || 'spm-static';
  var h = '<div class="seatmap seatmap-mode-' + model.mode + (pulse ? ' seatmap-pulse' : '') + '">';
  if (model.showTotals) h += seatmapTotals(model);
  h += '<svg class="seatmap-svg" viewBox="0 0 ' + model.view.width + ' ' + model.view.height + '" role="img" aria-label="' + esc(seatmapAria(model)) + '">' +
    '<defs><pattern id="' + hid + '" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
    '<rect width="10" height="10" class="seatmap-hatch-bg"/><rect width="3.5" height="10" class="seatmap-hatch-bar"/></pattern>' +
    (model.field ? '<clipPath id="' + hid + '-f"><use href="#' + hid + '-fp"/></clipPath>' +
      '<radialGradient id="' + hid + '-s" cx="0.5" cy="0.38" r="0.7"><stop offset="0" class="seatmap-sheen-a"/><stop offset="1" class="seatmap-sheen-b"/></radialGradient>' : '') +
    '</defs>';
  if (!model.complete) h += '<text class="seatmap-empty" x="' + model.view.width / 2 + '" y="' + model.view.height / 2 + '">Declare ' + SEATMAP_MIN_SECTIONS + '–' + SEATMAP_MAX_SECTIONS + ' sections to draw the map.</text>';
  if (model.field) {
    var marks = seatmapFieldMarks(model, hid);
    h += '<path class="seatmap-field" d="' + model.field + '" id="' + hid + '-fp"/>' + marks.under;
    if (model.fieldLines) h += '<path class="seatmap-field-line" d="' + model.fieldLines + '"/>';
    h += marks.over;
  }
  h += '<g class="seatmap-sections">';
  model.sections.forEach(function (s) { h += seatmapSectionMarkup(s, model, hid); });
  h += '</g><g class="seatmap-outlines">';
  model.sections.forEach(function (s) { if (s.highlighted) h += '<path class="seatmap-outline-halo" d="' + s.d + '"/><path class="seatmap-outline" d="' + s.d + '"/>'; });
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
/* ---- Workbench (desktop authoring only) ----
   Venue picker and seating-chart import for the panel inspector. Each
   gesture is one context.transact, so one Undo restores the declaration.
   - Picking a venue writes `venue` and REMOVES the panel's own venue fields
     (geometry, bowl, rings, sections, landmarks, …): written fields override
     the venue, so keeping them would hide the pick.
   - None keeps a copy of the venue's seating in the panel and drops `venue`.
   - Import seating chart… parses CSV/SVG with the shared importer
     (packages/sports/panels/seatmap-import.js, the code behind tools/seatmap-import.mjs),
     drops `venue` and writes the imported fields inline, clearing any other
     venue field so nothing from the previous venue lingers.
   Planners are pure text edits (tests call them directly). */
var SEATMAP_IMPORT_MAX_BYTES = 2 * 1024 * 1024;
function seatmapPlanPickVenue(text, raw, path, panel, venueId) {
  var pairs = [];
  if (venueId) {
    if (!SeatmapVenues.get(venueId)) return { error: 'Unknown venue "' + venueId + '".' };
    pairs.push(['venue', JSON.stringify(venueId)]);
    SEATMAP_VENUE_FIELDS.forEach(function (key) { if (panelOwn(panel, key)) pairs.push([key, null]); });
  } else {
    var resolved = seatmapResolve(panel);
    SEATMAP_VENUE_FIELDS.forEach(function (key) {
      if (!panelOwn(panel, key) && panelOwn(resolved, key)) pairs.push([key, JSON.stringify(resolved[key])]);
    });
    pairs.push(['venue', null]);
  }
  return planSetFields(text, raw, path, pairs);
}
function seatmapPlanImport(text, raw, path, panel, fragment) {
  var pairs = [['venue', null]];
  SEATMAP_VENUE_FIELDS.forEach(function (key) {
    pairs.push([key, panelOwn(fragment, key) ? JSON.stringify(fragment[key]) : null]);
  });
  return planSetFields(text, raw, path, pairs);
}
function seatmapPlanCopyVenueField(text, raw, path, panel, key) {
  var resolved = seatmapResolve(panel);
  if (panelOwn(panel, key) || !panelOwn(resolved, key)) return { error: 'Nothing to copy: the panel already writes ' + key + '.' };
  return planSetField(text, raw, path, key, JSON.stringify(resolved[key]));
}
function seatmapVenueOptionLabel(v) {
  return v.name + (v.location ? ' — ' + v.location : '') + ' · ' + v.sections + ' sections';
}
function seatmapDescribe(value) {
  if (Array.isArray(value)) return value.length + (value.length === 1 ? ' item' : ' items');
  if (panelObject(value)) return JSON.stringify(value);
  return String(value);
}
function seatmapEditor(context) {
  var doc = context.document, lastReport = null;
  function el(tag, cls, text) {
    var node = doc.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function edit(planFor, message) {
    if (context.editingBlocked()) { context.error('Finish ADD TO STEP before changing the venue.'); return false; }
    return context.transact(function (raw) {
      var target = context.target(), path = target && builderTargetPath(raw, target), panel = path && specValueAt(raw, path);
      if (!panel || panel.type !== 'seatmap') return { error: 'Select the Venue map panel again.' };
      return planFor(raw, panel, path);
    }, { after: function () { lastReport = message ? { source: context.source(), text: message } : null; context.refresh(); } });
  }
  function importControls(box) {
    var retired = false;
    context.onFormRetire(function () { retired = true; });
    var file = el('input'), capacity = el('input', 'fctl'), levels = el('input', 'fctl');
    file.type = 'file';
    file.accept = '.csv,.svg,text/csv,image/svg+xml';
    file.setAttribute('aria-label', 'Import seating chart');
    capacity.type = 'number';
    capacity.min = '1';
    capacity.placeholder = 'e.g. 17250';
    capacity.setAttribute('aria-label', 'Total capacity for blank rows');
    levels.placeholder = '1:100 level,2:200 level';
    levels.setAttribute('aria-label', 'Level map');
    var group = el('div', 'seatmap-import');
    group.appendChild(el('p', 'fnote', 'Import seating chart… — a CSV (id,level,zone,capacity[,label]) or an SVG chart, the same formats as tools/seatmap-import.mjs. The imported rings and sections are written into this panel and replace the venue.'));
    [['Total capacity (optional)', capacity], ['Level map (SVG, optional)', levels], ['Chart file', file]].forEach(function (pair) {
      var label = el('label', 'obj-field', pair[0]);
      label.appendChild(pair[1]);
      group.appendChild(label);
    });
    context.listen(file, 'change', function () {
      var chosen = file.files && file.files[0];
      if (!chosen) return;
      file.value = '';
      if (chosen.size > SEATMAP_IMPORT_MAX_BYTES) { context.error('The chart is larger than 2 MiB. The panel is unchanged.'); return; }
      var total = String(capacity.value || '').trim(), capacityTotal = null;
      if (total) {
        capacityTotal = Number(total);
        if (!Number.isSafeInteger(capacityTotal) || capacityTotal < 1) { context.error('Total capacity must be a whole number of at least 1.'); return; }
      }
      var original = context.source(), selection = JSON.stringify(context.target());
      function current() { return !retired && context.source() === original && JSON.stringify(context.target()) === selection; }
      Promise.resolve().then(function () { return chosen.text(); }).then(function (text) {
        if (!current()) return;
        var result;
        try {
          result = SeatmapImport.importText(text, chosen.name, { capacityTotal: capacityTotal, levelMap: String(levels.value || '').trim() || null });
        } catch (error) {
          context.error('Import failed: ' + error.message + '. The panel is unchanged.');
          return;
        }
        var message = SeatmapImport.formatReport(result.report, chosen.name);
        if (result.fragment.capacityNote) message += '\nCapacities: ' + result.fragment.capacityNote + '. Say so on the page.';
        edit(function (raw, panel, path) { return seatmapPlanImport(context.source(), raw, path, panel, result.fragment); }, message);
      }, function () { if (current()) context.error('Could not read the chart file. The panel is unchanged.'); });
    });
    box.appendChild(group);
  }
  function venueControl(panel) {
    var box = el('div', 'seatmap-venue'), select = el('select', 'fctl');
    select.setAttribute('aria-label', 'Venue');
    var none = el('option', '', 'None — this panel’s own sections');
    none.value = '';
    select.appendChild(none);
    SeatmapVenues.list().forEach(function (v) {
      var option = el('option', '', seatmapVenueOptionLabel(v));
      option.value = v.id;
      select.appendChild(option);
    });
    var currentId = panelOwn(panel, 'venue') && typeof panel.venue === 'string' ? panel.venue : '';
    var venue = SeatmapVenues.get(currentId);
    if (currentId && !venue) {
      var unknown = el('option', '', currentId + ' (unknown)');
      unknown.value = currentId;
      select.appendChild(unknown);
    }
    select.value = currentId;
    context.listen(select, 'change', function () {
      var id = select.value;
      if (id === currentId) return;
      var replaced = SEATMAP_VENUE_FIELDS.filter(function (key) { return panelOwn(panel, key); }), message;
      if (id) message = 'Using ' + SeatmapVenues.get(id).name + (replaced.length ? '. Replaced this panel’s own ' + replaced.join(', ') + '; Undo restores them.' : '.');
      else message = venue ? 'Copied ' + venue.name + '’s seating into this panel; edit it freely.' : 'Removed the venue reference.';
      if (!edit(function (raw, live, path) { return seatmapPlanPickVenue(context.source(), raw, path, live, id); }, message)) select.value = currentId;
    });
    box.appendChild(select);
    if (venue) {
      box.appendChild(el('p', 'fnote', venue.note || ''));
      var own = SEATMAP_VENUE_FIELDS.filter(function (key) { return panelOwn(panel, key); });
      if (own.length) box.appendChild(el('p', 'fnote', 'This panel overrides the venue’s ' + own.join(', ') + '.'));
    } else if (currentId) box.appendChild(el('p', 'fnote', 'No venue "' + currentId + '" in the library; the panel draws its own sections.'));
    if (lastReport && lastReport.source === context.source()) box.appendChild(el('pre', 'fnote seatmap-import-report', lastReport.text));
    importControls(box);
    return context.controls.block('Venue', box);
  }
  function inheritedControl(key, panel) {
    var venue = SeatmapVenues.get(panel.venue), meta = SEATMAP_FIELD_META[key] || {};
    var box = el('div', 'seatmap-inherited');
    box.appendChild(el('p', 'fnote', 'From ' + venue.name + ': ' + seatmapDescribe(venue.seatmap[key]) + '. Writing this field on the panel overrides the venue’s value.'));
    box.appendChild(context.controls.action('Edit a copy here', function () {
      edit(function (raw, live, path) { return seatmapPlanCopyVenueField(context.source(), raw, path, live, key); },
        'Copied ' + venue.name + '’s ' + key + ' into this panel; it now overrides the venue.');
    }));
    return context.controls.block(meta.label || key, box);
  }
  return {
    setupField: function (field, panel) {
      var key = field[0];
      if (key === 'venue') return venueControl(panel);
      if (SEATMAP_VENUE_FIELDS.indexOf(key) >= 0 && !panelOwn(panel, key)) {
        var venue = SeatmapVenues.get(panel.venue);
        if (venue && panelOwn(venue.seatmap, key)) return inheritedControl(key, panel);
      }
      return null;
    },
  };
}
var SEATMAP_FIELD_META = {
  venue: { label: 'Venue', help: 'A venue from the library supplies geometry, rings, sections and landmarks. Any of those fields written on the panel overrides the venue’s value. Picking a venue replaces the panel’s own copies; Undo restores them.' },
  geometry: { label: 'Geometry', help: 'bowl draws generic rings from bowl, rings and each section’s zone. paths uses each section’s own SVG path (imported with tools/seatmap-import.mjs).' },
  bowl: { label: 'Bowl shape', help: 'rink (default: two straight sidelines joined by rounded ends), oval, rectangle or pitch. Generic shapes only; a library venue with traced sections uses paths geometry instead.' },
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
  field: { label: 'Rink outline (paths)', help: '{"shape":"rink","x","y","width","height"} in viewBox units for paths geometry: a rink drawn under the sections with centre and blue lines. The importer reads it from <rect id="rink-outline">.' },
};
PanelRegistry.define('seatmap', {
  label: 'Venue map', since: '0.2.0', order: 50,
  validateDeclaration: seatmapDeclarationWarnings, validatePatch: seatmapPatchWarnings, fold: seatmapFold,
  render: function (host, panel, state, skin, states, stepIdx, animate) {
    panel = seatmapResolve(panel);
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
.seatmap{font-size:11px;color:var(--dtext);min-width:0;--seatmap-accent:#38E1FF;--seatmap-label-on:#06202A;
  --seatmap-r1:#18345A;--seatmap-r2:#1C5A80;--seatmap-r3:#1A7896;--seatmap-r4:#2CB5D2;--seatmap-r5:#5FE3FF;
  --seatmap-gutter:var(--pv-surface,#0B1220);--seatmap-lbl:#FFFFFF;--seatmap-lbl-dark:#0B1220;--seatmap-hover:#8DA2C6;
  --seatmap-sel:#EAF2FF;--seatmap-sel-ring:rgba(56,225,255,.45);--seatmap-raise:rgba(0,0,0,.6);--seatmap-unknown:#2E4466;--seatmap-unknown-fill:rgba(16,26,44,.6);
  --seatmap-hold:#FFB454;--seatmap-hold-bg:rgba(255,180,84,.16);--seatmap-hold-lbl:#EAF2FF;--seatmap-hold-halo:#0B1220;--seatmap-warn-ink:#EEC16A;
  --seatmap-ice:#101A2C;--seatmap-sheen:rgba(56,225,255,.07);--seatmap-board:#2E4466;--seatmap-red:rgba(248,113,113,.62);--seatmap-blue:rgba(96,165,250,.62);--seatmap-crease:rgba(96,165,250,.16);
  --seatmap-turf:rgba(74,222,128,.07);--seatmap-turf-line:rgba(74,222,128,.42);--seatmap-court:rgba(255,180,84,.07);--seatmap-court-line:rgba(255,180,84,.45);
  --seatmap-lm-bg:#101A2C;--seatmap-lm-line:#2E4466;--seatmap-lm-text:#B9C7DD;
  --seatmap-ink:#EAF2FF;--seatmap-text:#B9C7DD;--seatmap-muted:#8DA2C6;--seatmap-chip-bg:rgba(56,225,255,.12);--seatmap-chip-ink:#8AE8FF;--seatmap-well:#101A2C;--seatmap-well-line:#1D2A40;
  --seatmap-num:'Sora','IBM Plex Sans',sans-serif;--seatmap-sans:'IBM Plex Sans',sans-serif;--seatmap-lbl-font:'IBM Plex Sans',sans-serif;--seatmap-radius:999px;--seatmap-sw-radius:3px}
.sk-daylight .seatmap{--seatmap-accent:#4956C9;--seatmap-label-on:#FFFFFF}
.sk-daylight .seatmap,.sk-pastel .seatmap,.sk-editorial .seatmap{--seatmap-label-on:#FFFFFF;
  --seatmap-r1:#D9DFF7;--seatmap-r2:#B4C0EF;--seatmap-r3:#8796E0;--seatmap-r4:#5566C8;--seatmap-r5:#3F4FAE;
  --seatmap-gutter:var(--pv-surface,#FFFFFF);--seatmap-lbl:#24324A;--seatmap-hover:#5F6C84;
  --seatmap-sel:#24324A;--seatmap-sel-ring:rgba(82,99,185,.32);--seatmap-raise:rgba(36,50,74,.32);--seatmap-unknown:#C9D2E1;--seatmap-unknown-fill:#F6F8FC;
  --seatmap-hold:#B07A2A;--seatmap-hold-bg:#FDF1DC;--seatmap-hold-lbl:#24324A;--seatmap-hold-halo:#FDF1DC;--seatmap-warn-ink:#865B06;
  --seatmap-ice:#F4F7FB;--seatmap-sheen:#FFFFFF;--seatmap-board:#C9D2E1;--seatmap-red:#E7B3BA;--seatmap-blue:#B8C6EE;--seatmap-crease:rgba(184,198,238,.45);
  --seatmap-turf:rgba(46,138,92,.06);--seatmap-turf-line:rgba(46,138,92,.38);--seatmap-court:rgba(209,154,77,.10);--seatmap-court-line:rgba(176,122,42,.55);
  --seatmap-lm-bg:#EEF1F5;--seatmap-lm-line:#C9D2E1;--seatmap-lm-text:#5F6C84;
  --seatmap-ink:#24324A;--seatmap-text:#526077;--seatmap-muted:#5F6C84;--seatmap-chip-bg:#EEF0FB;--seatmap-chip-ink:#3D4C9E;--seatmap-well:#F6F8FC;--seatmap-well-line:#E6EBF3;
  --seatmap-num:'IBM Plex Sans',sans-serif}
.sk-pastel .seatmap{--seatmap-num:'Plus Jakarta Sans',sans-serif;--seatmap-sans:'Source Sans 3','IBM Plex Sans',sans-serif}
/* Gutters take the card colour of skins whose card is not the token surface. */
body.sk-editorial .seatmap{--seatmap-gutter:#FFFDF8}
body.sk-terminal .seatmap{--seatmap-gutter:var(--tm-ground,#0B1220)}
body:is(.sk-rose,.sk-lavender,.sk-lilac) .seatmap{--seatmap-gutter:var(--fl-paper,#FFFFFF)}
.sk-blueprint .seatmap{--seatmap-label-on:#052956;
  --seatmap-r1:color-mix(in srgb,#7FE3FF 16%,#052956);--seatmap-r2:color-mix(in srgb,#7FE3FF 28%,#052956);--seatmap-r3:color-mix(in srgb,#7FE3FF 40%,#052956);--seatmap-r4:color-mix(in srgb,#7FE3FF 68%,#052956);--seatmap-r5:color-mix(in srgb,#7FE3FF 88%,#052956);
  --seatmap-gutter:var(--pv-surface,#052956);--seatmap-lbl:#F7FCFF;--seatmap-lbl-dark:#052956;--seatmap-hover:#7FE3FF;
  --seatmap-sel:#F7FCFF;--seatmap-sel-ring:rgba(127,227,255,.45);--seatmap-raise:rgba(0,0,0,.45);--seatmap-unknown:#4FA9C3;--seatmap-unknown-fill:transparent;
  --seatmap-hold:#FFD166;--seatmap-hold-bg:rgba(255,209,102,.16);--seatmap-hold-lbl:#F7FCFF;--seatmap-hold-halo:#052956;--seatmap-warn-ink:#FFD166;
  --seatmap-ice:rgba(127,227,255,.05);--seatmap-sheen:rgba(127,227,255,.06);--seatmap-board:#4FA9C3;--seatmap-red:rgba(255,138,147,.8);--seatmap-blue:rgba(127,227,255,.75);--seatmap-crease:rgba(127,227,255,.14);
  --seatmap-turf:rgba(71,245,144,.05);--seatmap-turf-line:rgba(71,245,144,.5);--seatmap-court:rgba(255,209,102,.05);--seatmap-court-line:rgba(255,209,102,.55);
  --seatmap-lm-bg:#062E61;--seatmap-lm-line:#4FA9C3;--seatmap-lm-text:#D5E9F7;
  --seatmap-ink:#F7FCFF;--seatmap-text:#D5E9F7;--seatmap-muted:#94BCD5;--seatmap-chip-bg:rgba(127,227,255,.14);--seatmap-chip-ink:#7FE3FF;--seatmap-well:#062E61;--seatmap-well-line:#4FA9C3;
  --seatmap-num:'Barlow Condensed','IBM Plex Sans',sans-serif;--seatmap-lbl-font:'Barlow Condensed','IBM Plex Sans',sans-serif;--seatmap-radius:2px;--seatmap-sw-radius:0}
.seatmap-totals{display:flex;flex-wrap:wrap;align-items:flex-end;gap:4px 22px;margin:0 0 3px}
.seatmap-stat{min-width:0}
.seatmap-stat b{display:flex;align-items:baseline;white-space:nowrap;font:800 17px/1.1 var(--seatmap-num);letter-spacing:-.015em;font-variant-numeric:tabular-nums lining-nums;color:var(--seatmap-ink)}
.seatmap-stat b small{font-size:.76em;font-weight:600;letter-spacing:0;color:var(--seatmap-muted);white-space:pre}
.seatmap-stat>span{display:block;margin-top:2px;font:700 10px/1.2 var(--seatmap-sans);letter-spacing:.08em;text-transform:uppercase;color:var(--seatmap-muted)}
.seatmap-stat-warn b{color:var(--seatmap-warn-ink)}
.seatmap-stat-warn>span::before{content:"";display:inline-block;width:8px;height:8px;margin-right:5px;vertical-align:-1px;border-radius:2px;background:repeating-linear-gradient(45deg,var(--seatmap-hold) 0 1.5px,var(--seatmap-hold-bg) 1.5px 4px);box-shadow:inset 0 0 0 1px var(--seatmap-hold)}
.seatmap-meter{position:relative;align-self:center;display:inline-block;width:40px;height:6px;margin-left:8px;border-radius:var(--seatmap-radius);background:var(--seatmap-r1);overflow:hidden;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--seatmap-r1) 70%,var(--seatmap-ink) 12%)}
.seatmap-meter>i{position:absolute;left:0;top:0;bottom:0;border-radius:inherit;transition:width .42s cubic-bezier(.2,.7,.2,1)}
.seatmap-svg{display:block;width:100%;height:auto;overflow:visible}
/* In a fixed-size layout tile the map letterboxes into the space left by the
   totals and legend instead of overflowing the tile (the bowl's aspect is
   taller than the tile's body aspect on several pages). */
.section-layout-tile>.pwidget.pt-seatmap{display:flex;flex-direction:column}
.section-layout-tile>.pwidget.pt-seatmap>.pbody,.section-layout-tile>.pwidget.pt-seatmap>.pbody>.swpanel,.section-layout-tile>.pwidget.pt-seatmap .seatmap{display:flex;flex-direction:column;flex:1 1 auto;min-height:0}
.section-layout-tile>.pwidget.pt-seatmap .seatmap>*{flex:none}
.section-layout-tile>.pwidget.pt-seatmap .seatmap>.seatmap-svg{flex:0 1 auto;min-height:120px}
.seatmap-field{fill:var(--seatmap-ice);stroke:var(--seatmap-board);stroke-width:1.5;vector-effect:non-scaling-stroke}
.seatmap-sheen-a{stop-color:var(--seatmap-sheen);stop-opacity:.95}.seatmap-sheen-b{stop-color:var(--seatmap-sheen);stop-opacity:0}
.seatmap-field-line{fill:none;stroke:var(--seatmap-blue);stroke-width:2.5;vector-effect:non-scaling-stroke}
.seatmap-rink-red{fill:none;stroke:var(--seatmap-red);stroke-width:2.5;vector-effect:non-scaling-stroke}
.seatmap-rink-goal{fill:none;stroke:var(--seatmap-red);stroke-width:1;vector-effect:non-scaling-stroke}
.seatmap-rink-crease{fill:var(--seatmap-crease);stroke:var(--seatmap-red);stroke-width:1;vector-effect:non-scaling-stroke}
.seatmap-rink-circle{fill:none;stroke:var(--seatmap-red);stroke-width:1;vector-effect:non-scaling-stroke}
.seatmap-rink-dot{fill:var(--seatmap-red)}.seatmap-rink-centre{fill:var(--seatmap-blue)}
.seatmap-turf{fill:var(--seatmap-turf)}
.seatmap-pitch-line,.seatmap-court-line,.seatmap-court-key{fill:none;stroke:var(--seatmap-turf-line);stroke-width:1.25;vector-effect:non-scaling-stroke}
.seatmap-pitch-spot{fill:var(--seatmap-turf-line)}
.seatmap-court-line,.seatmap-court-key{stroke:var(--seatmap-court-line)}.seatmap-court-key{fill:var(--seatmap-court)}
.seatmap-fill{stroke:var(--seatmap-gutter);stroke-width:1.5;stroke-linejoin:round;vector-effect:non-scaling-stroke;transition:fill .42s cubic-bezier(.2,.7,.2,1),stroke .12s ease}
.seatmap-sec:hover .seatmap-fill{stroke:var(--seatmap-hover)}
.seatmap-unknown .seatmap-fill{stroke:var(--seatmap-unknown);stroke-width:1;stroke-dasharray:4 3}
.seatmap-unknown .seatmap-lbl{fill:var(--seatmap-text)}
.seatmap-hold{pointer-events:none}
.seatmap-hatch-bg{fill:var(--seatmap-hold-bg)}.seatmap-hatch-bar{fill:var(--seatmap-hold);fill-opacity:.85}
.seatmap-lbl{font-family:var(--seatmap-lbl-font);font-weight:600;letter-spacing:.01em;font-variant-numeric:tabular-nums lining-nums;text-anchor:middle;fill:var(--seatmap-lbl);pointer-events:none;transition:fill .24s ease}
.seatmap-lbl-on{fill:var(--seatmap-label-on)}.seatmap-lbl-dark{fill:var(--seatmap-lbl-dark)}.seatmap-lbl-light{fill:#FFFFFF}
.seatmap-held .seatmap-lbl{fill:var(--seatmap-hold-lbl);paint-order:stroke;stroke:var(--seatmap-hold-halo);stroke-width:4px;stroke-linejoin:round}
.seatmap-outline-halo{fill:none;stroke:var(--seatmap-gutter);stroke-width:4.5;stroke-linejoin:round;vector-effect:non-scaling-stroke;pointer-events:none;filter:drop-shadow(0 3px 4px var(--seatmap-raise))}
.seatmap-outline{fill:none;stroke:var(--seatmap-sel);stroke-width:2.5;stroke-linejoin:round;vector-effect:non-scaling-stroke;pointer-events:none}
@media (prefers-reduced-motion:no-preference){.seatmap-pulse .seatmap-outline-halo{animation:seatmap-pulse .7s cubic-bezier(.16,1,.3,1)}}
@keyframes seatmap-pulse{0%{stroke:var(--seatmap-sel-ring);stroke-width:4.5}45%{stroke:var(--seatmap-sel-ring);stroke-width:16}100%{stroke:var(--seatmap-gutter);stroke-width:4.5}}
.seatmap-landmark{pointer-events:none}
.seatmap-landmark rect{fill:var(--seatmap-lm-bg);stroke:var(--seatmap-lm-line);stroke-width:1;vector-effect:non-scaling-stroke}
.seatmap-landmark text{font:700 14px var(--seatmap-lbl-font);fill:var(--seatmap-lm-text);text-anchor:middle;letter-spacing:.08em;text-transform:uppercase}
.seatmap-empty{font:500 24px var(--seatmap-sans);fill:var(--seatmap-muted);text-anchor:middle}
.seatmap-legend,.seatmap-rings{display:flex;flex-wrap:wrap;align-items:center;gap:3px 14px;margin-top:4px;font:500 11.5px/16px var(--seatmap-sans);color:var(--seatmap-muted);font-variant-numeric:tabular-nums lining-nums}
.seatmap-rings{margin-top:3px;gap:1px 14px}
.seatmap-legend>span,.seatmap-rings>span{display:inline-flex;align-items:center;white-space:nowrap}
.seatmap-legend b,.seatmap-rings b{color:var(--seatmap-text);font-weight:600;margin-right:4px}
.seatmap-mode{gap:0}
.seatmap-mode b{display:inline-flex;align-items:center;height:18px;padding:0 8px;margin-right:7px;border-radius:var(--seatmap-radius);background:var(--seatmap-chip-bg);color:var(--seatmap-chip-ink);font:700 10px/1 var(--seatmap-sans);letter-spacing:.08em;text-transform:uppercase}
.seatmap-sep{display:none}
.seatmap-legend small,.seatmap-rings small{font-size:10.5px;font-weight:600;color:var(--seatmap-muted);margin-left:4px}
.seatmap-sw{display:inline-block;flex:none;width:10px;height:10px;border-radius:var(--seatmap-sw-radius);margin-right:6px;background:var(--seatmap-r4);box-shadow:inset 0 0 0 1px rgba(36,50,74,.18)}
.seatmap-sw-low{background:var(--seatmap-r1)}
.seatmap-sw-high{background:var(--seatmap-r5)}
.seatmap-sw-hold{background:repeating-linear-gradient(45deg,var(--seatmap-hold) 0 1.5px,var(--seatmap-hold-bg) 1.5px 4px);box-shadow:inset 0 0 0 1px var(--seatmap-hold)}
.seatmap-sw-unknown{background:var(--seatmap-unknown-fill);box-shadow:none;border:1px dashed var(--seatmap-unknown);box-sizing:border-box}
.seatmap-key{gap:6px}
.seatmap-ramp{display:inline-block;width:72px;height:8px;border-radius:var(--seatmap-radius);background:linear-gradient(90deg,var(--seatmap-r1),var(--seatmap-r2) 40%,var(--seatmap-r3) 79.8%,var(--seatmap-r4) 80.2%,var(--seatmap-r5));box-shadow:inset 0 0 0 1px rgba(36,50,74,.12)}
.seatmap-range{color:var(--seatmap-text)}
.seatmap-ring-dot{display:inline-block;flex:none;width:8px;height:8px;margin-right:6px;border-radius:50%;box-shadow:inset 0 0 0 1px rgba(36,50,74,.18)}
.seatmap-legend>.seatmap-zones,.seatmap-rings>.seatmap-zones{display:inline;white-space:normal}
.seatmap-zones small{margin-left:0}
.sk-aurora:not(.sk-pastel):not(.sk-editorial) .seatmap-sw,.sk-aurora:not(.sk-pastel):not(.sk-editorial) .seatmap-ramp,.sk-aurora:not(.sk-pastel):not(.sk-editorial) .seatmap-ring-dot{box-shadow:inset 0 0 0 1px rgba(255,255,255,.12)}
.sk-blueprint .seatmap-stat>span,.sk-blueprint .seatmap-mode b,.sk-blueprint .seatmap-landmark text{font-family:'Barlow Condensed','IBM Plex Sans',sans-serif;letter-spacing:.12em}
.sk-blueprint .seatmap-stat b{font-weight:700;font-size:19px;letter-spacing:0}
.sk-blueprint .seatmap-mode b{background:transparent;box-shadow:inset 0 0 0 1px var(--seatmap-chip-ink)}
.sk-blueprint .seatmap-fill{stroke:color-mix(in srgb,#7FE3FF 45%,#052956);stroke-width:1}
.sk-blueprint .seatmap-unknown .seatmap-fill{stroke:var(--seatmap-unknown)}
@media (prefers-reduced-motion:reduce){.seatmap-fill,.seatmap-lbl,.seatmap-meter>i{transition:none}.seatmap-pulse .seatmap-outline,.seatmap-pulse .seatmap-outline-halo{animation:none}}
@media print{.seatmap-fill,.seatmap-lbl,.seatmap-meter>i{transition:none}.seatmap-pulse .seatmap-outline,.seatmap-pulse .seatmap-outline-halo{animation:none}.seatmap-outline-halo{filter:none}.seatmap-svg{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
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
      ['venue', 'text'], ['geometry', 'text'], ['bowl', 'text'], ['direction', 'text'], ['startAt', 'text'], ['ringSlots', 'num'], ['currency', 'text'], ['showTotals', 'jsonAny'],
      ['rings', 'rows', { max: SEATMAP_MAX_RINGS, cols: [{ k: 'id', req: true }, { k: 'label' }] }],
      ['sections', 'rows', { wide: true, max: SEATMAP_MAX_SECTIONS, cols: [{ k: 'id', req: true }, { k: 'label' }, { k: 'ring', req: true }, { k: 'slot', kind: 'num' }, { k: 'span', kind: 'num' }, { k: 'capacity', kind: 'num', req: true }, { k: 'zone' }, { k: 'tier' }, { k: 'path' }] }],
      ['tiers', 'rows', { max: SEATMAP_MAX_TIERS, cols: [{ k: 'id', req: true }, { k: 'label' }, { k: 'color' }] }],
      ['landmarks', 'rows', { max: SEATMAP_MAX_LANDMARKS, cols: [{ k: 'id', req: true }, { k: 'label' }, { k: 'x', kind: 'num' }, { k: 'y', kind: 'num' }] }],
      ['viewBox', 'json'], ['field', 'json'], ['initial', 'json'],
    ],
    patchFields: [
      ['sold', 'json', { nullable: true }], ['held', 'json', { nullable: true }], ['price', 'json', { nullable: true }], ['tierOf', 'json', { nullable: true }],
      ['mode', 'enum', SEATMAP_MODES], ['highlight', 'jsonAny', { nullable: true }], ['note', 'text'],
    ],
    fieldMeta: SEATMAP_FIELD_META,
    editor: seatmapEditor,
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
