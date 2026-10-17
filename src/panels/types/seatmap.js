/* Venue map: a bowl (or imported chart) of seating sections coloured by
   sell-through, holds, price, tier or revenue, step by step. Every number is
   authored in the spec; nothing is forecast and no ticketing system is read.
   Shared formatting and bowl geometry live in ../sports.js. */
var SEATMAP_MODES = ['sold', 'held', 'price', 'tier', 'revenue'];
var SEATMAP_MIN_SECTIONS = 4, SEATMAP_MAX_SECTIONS = 160, SEATMAP_MAX_RINGS = 4;
var SEATMAP_MAX_TIERS = 8, SEATMAP_MAX_LANDMARKS = 8, SEATMAP_MAX_HIGHLIGHT = 8;
var SEATMAP_ZONE_CHARS = 24, SEATMAP_LABEL_CHARS = 40;
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
   paths geometry) a strict path. Omitted slots continue after the previous
   section of the same ring so authors may list sections in ring order. */
function seatmapSections(panel) {
  var rings = seatmapRings(panel), tiers = seatmapTiers(panel), geometry = seatmapGeometry(panel), slots = seatmapRingSlots(panel);
  var cursor = {}, out = [];
  panelCollectionItems(panel, 'sections', SEATMAP_MAX_SECTIONS).forEach(function (s) {
    if (!spmSafeId(s.id) || !seatmapCount(s.capacity) || s.capacity < 1) return;
    var ringIndex = -1;
    rings.forEach(function (ring, i) { if (ring.id === s.ring) ringIndex = i; });
    if (ringIndex < 0) return;
    if (geometry === 'paths' && !seatmapPathOk(s.path)) return;
    var span = isFiniteNum(s.span) && s.span > 0 && s.span <= slots ? s.span : 1;
    var slot = isFiniteNum(s.slot) && s.slot >= 0 && s.slot < slots ? s.slot : (cursor[s.ring] || 0);
    if (slot + span > slots) span = Math.max(0.25, slots - slot);
    cursor[s.ring] = slot + span;
    out.push({
      id: s.id, label: seatmapText(s.label, SEATMAP_LABEL_CHARS) && s.label.trim() ? s.label : s.id,
      ring: ringIndex, ringId: s.ring, slot: slot, span: span, capacity: s.capacity,
      path: geometry === 'paths' ? s.path : null,
      zone: seatmapText(s.zone, SEATMAP_ZONE_CHARS) && s.zone.trim() ? s.zone.trim() : '',
      tier: tiers.some(function (tier) { return tier.id === s.tier; }) ? s.tier : null,
    });
  });
  return out;
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
    warnings.push(path + '.bowl: expected ' + SPM_BOWLS.join('|') + ' — using oval');
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
        warnings.push(at + '.slot: expected a number from 0 to below ringSlots (' + slots + ') — placed after the previous section of its ring');
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
   map; a key set to null forgets that section; invalid entries are skipped.
   Never mutates its inputs. */
function seatmapMergeMap(base, patch, capacities, ok) {
  var out = {};
  if (patch === null) return out;
  Object.keys(panelObject(base) ? base : {}).forEach(function (id) { out[id] = base[id]; });
  if (!panelObject(patch)) return out;
  Object.keys(patch).forEach(function (id) {
    if (!(id in capacities)) return;
    var value = patch[id];
    if (value === null) delete out[id];
    else if (ok(value, capacities[id])) out[id] = value;
  });
  return out;
}
function seatmapMapRules(panel) {
  var tiers = seatmapTiers(panel);
  return {
    sold: function (v, cap) { return seatmapCount(v) && v <= cap; },
    held: seatmapHeldOk,
    price: function (v) { return isFiniteNum(v) && v >= 0; },
    tierOf: function (v) { return tiers.some(function (tier) { return tier.id === v; }); },
  };
}
function seatmapCleanState(raw, capacities, allowOnce) {
  var out = {};
  if (!panelObject(raw)) return out;
  if (panelOwn(raw, 'mode') && (raw.mode === null || SEATMAP_MODES.indexOf(raw.mode) >= 0)) out.mode = raw.mode;
  if (panelOwn(raw, 'highlight') && seatmapHighlightOk(raw.highlight, capacities))
    out.highlight = Array.isArray(raw.highlight) ? raw.highlight.slice() : raw.highlight;
  if (panelOwn(raw, 'note') && (raw.note === null || typeof raw.note === 'string')) out.note = raw.note;
  if (allowOnce && panelObject(raw.enterOnce)) out.enterOnce = seatmapCleanState(raw.enterOnce, capacities, false);
  return out;
}
function seatmapFold(panel, steps) {
  var capacities = seatmapCapacities(panel), rules = seatmapMapRules(panel), keys = Object.keys(rules);
  var states = foldSanitizedPanelStates(panel, steps, function (raw, once) { return seatmapCleanState(raw, capacities, once); });
  var carried = {}, initial = panelObject(panel.initial) ? panel.initial : {};
  keys.forEach(function (key) { carried[key] = seatmapMergeMap({}, panelOwn(initial, key) ? initial[key] : undefined, capacities, rules[key]); });
  function apply(base, patch) {
    var next = {};
    keys.forEach(function (key) {
      next[key] = panelObject(patch) && panelOwn(patch, key) ? seatmapMergeMap(base[key], patch[key], capacities, rules[key]) : base[key];
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
function seatmapLabelFont(label, geom) {
  var font = Math.min(22, geom.arc * 0.34, geom.depth * 0.45);
  var width = Math.max(1, label.length) * 0.62;
  font = Math.min(font, (geom.arc * 0.96) / width);
  return font >= 9 ? Math.round(font * 2) / 2 : 0;
}
/* Per-section fill intensity for the mode, totals, legend entries and the
   highlight set. Prices and revenue are "where price known": a section without
   a price contributes nothing and is listed as unpriced. */
function seatmapModel(panel, state) {
  state = panelObject(state) ? state : {};
  var geometry = seatmapGeometry(panel), rings = seatmapRings(panel), tiers = seatmapTiers(panel), decl = seatmapSections(panel);
  var bowl = geometry === 'bowl' ? spmBowl(SPM_BOWLS.indexOf(panel.bowl) >= 0 ? panel.bowl : 'oval', rings, seatmapRingSlots(panel)) : null;
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
    var soldN = seatmapCount(sold[s.id]) && sold[s.id] <= s.capacity ? sold[s.id] : 0;
    var hold = seatmapHeldOk(held[s.id], s.capacity) ? {
      count: held[s.id].count, label: typeof held[s.id].label === 'string' ? held[s.id].label : '', until: typeof held[s.id].until === 'string' ? held[s.id].until : '',
    } : null;
    var p = isFiniteNum(price[s.id]) && price[s.id] >= 0 ? price[s.id] : null;
    var tierId = typeof tierOf[s.id] === 'string' && tiers.some(function (t) { return t.id === tierOf[s.id]; }) ? tierOf[s.id] : s.tier;
    var tier = tierId ? tiers.filter(function (t) { return t.id === tierId; })[0] : null;
    var revenue = p === null ? null : soldN * p;
    if (p !== null) maxPrice = Math.max(maxPrice, p);
    if (revenue !== null) maxRevenue = Math.max(maxRevenue, revenue);
    if (s.zone) { if (!panelOwn(zones, s.zone)) { zones[s.zone] = 0; zoneOrder.push(s.zone); } zones[s.zone]++; }
    var geom = bowl ? bowl.wedge(s.ring, s.slot, s.span) : seatmapPathGeometry(s.path);
    return {
      id: s.id, label: s.label, ring: s.ring, ringId: s.ringId, ringLabel: rings[s.ring].label, zone: s.zone, capacity: s.capacity,
      sold: soldN, held: hold, price: p, revenue: revenue, tier: tier, tierId: tierId,
      pct: spmPercent(soldN, s.capacity), highlighted: highlight.indexOf(s.id) >= 0,
      d: geom.d, x: geom.x, y: geom.y, font: seatmapLabelFont(s.label, geom), intensity: 0, known: true,
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
  });
  var totals = { sold: 0, capacity: 0, held: 0, revenue: 0, priced: 0, pricedSold: 0 };
  var ringTotals = rings.map(function (ring) { return { id: ring.id, label: ring.label, sold: 0, capacity: 0, held: 0, sections: 0 }; });
  sections.forEach(function (s) {
    totals.sold += s.sold; totals.capacity += s.capacity;
    if (s.held) totals.held += s.held.count;
    if (s.price !== null) { totals.revenue += s.revenue; totals.priced++; totals.pricedSold += s.sold; }
    var ring = ringTotals[s.ring];
    ring.sold += s.sold; ring.capacity += s.capacity; ring.sections++;
    if (s.held) ring.held += s.held.count;
  });
  totals.pct = spmPercent(totals.sold, totals.capacity);
  totals.revenueKnown = totals.priced > 0;
  totals.allPriced = totals.priced === sections.length && sections.length > 0;
  ringTotals.forEach(function (ring) { ring.pct = spmPercent(ring.sold, ring.capacity); });
  var tierCounts = tiers.map(function (tier, i) {
    return { id: tier.id, label: tier.label, color: tier.color || seatmapTierPalette(i), sections: sections.filter(function (s) { return s.tierId === tier.id; }).length };
  });
  var prices = sections.filter(function (s) { return s.price !== null; }).map(function (s) { return s.price; });
  return {
    geometry: geometry, bowl: bowl ? bowl.bowl : null, view: view, field: bowl ? bowl.field : null, mode: mode, currency: currency,
    sections: sections, rings: ringTotals, tiers: tierCounts, zones: zoneOrder.map(function (z) { return { zone: z, sections: zones[z] }; }),
    landmarks: seatmapLandmarks(panel), highlight: highlight, totals: totals, showTotals: panel.showTotals !== false,
    priceRange: prices.length ? { min: Math.min.apply(null, prices), max: Math.max.apply(null, prices) } : null,
    complete: sections.length >= SEATMAP_MIN_SECTIONS, hasHolds: totals.held > 0,
    geometryKey: geometry + ':' + view.width + 'x' + view.height + ':' + sections.map(function (s) { return s.id; }).join(','),
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
  var dark = s.intensity >= 0.55 || (model.mode === 'tier' && s.known);
  var fill = s.color ? s.color : 'var(--dink)';
  var opacity = s.known ? 0.1 + 0.9 * s.intensity : 0.04;
  var cls = 'seatmap-sec' + (s.highlighted ? ' seatmap-hi' : '') + (s.known ? '' : ' seatmap-unknown') + (s.held ? ' seatmap-held' : '');
  var h = '<g class="' + cls + '" data-sec="' + esc(s.id) + '">' +
    '<path class="seatmap-fill" d="' + s.d + '" fill="' + fill + '" fill-opacity="' + opacity.toFixed(3) + '"><title>' + esc(seatmapSectionTitle(s, model)) + '</title></path>';
  if (s.held) h += '<path class="seatmap-hold" d="' + s.d + '" fill="url(#' + hid + ')"/>';
  if (s.font) h += '<text class="seatmap-lbl' + (dark ? ' seatmap-lbl-dark' : '') + '" x="' + s.x + '" y="' + s.y + '" font-size="' + s.font + '" dy="0.35em">' + esc(s.label) + '</text>';
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
  h += '<g class="seatmap-sections">';
  model.sections.forEach(function (s) { h += seatmapSectionMarkup(s, model, hid); });
  h += '</g><g class="seatmap-outlines">';
  model.sections.forEach(function (s) { if (s.highlighted) h += '<path class="seatmap-outline" d="' + s.d + '"/>'; });
  h += '</g><g class="seatmap-landmarks">';
  model.landmarks.forEach(function (mark) {
    h += '<text class="seatmap-landmark" x="' + mark.x + '" y="' + mark.y + '" dy="0.35em">' + esc(mark.label) + '</text>';
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
  zones.forEach(function (zone, i) { out.push({ id: '10' + (i + 1), ring: 'lower', slot: i, capacity: 420, zone: zone }); });
  zones.forEach(function (zone, i) { out.push({ id: '20' + (i + 1), ring: 'upper', slot: i, capacity: 640, zone: zone }); });
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
.seatmap{font-size:11px;color:var(--dtext);min-width:0}
.seatmap-totals{display:flex;flex-wrap:wrap;gap:6px 16px;margin:0 0 8px}
.seatmap-stat b{display:block;font:700 15px/1.2 'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;color:var(--dink)}
.seatmap-stat span{font:500 9px 'IBM Plex Mono',monospace;letter-spacing:.06em;text-transform:uppercase;color:var(--dfaint)}
.seatmap-stat-warn b{color:#D7A34F}
.seatmap-svg{display:block;width:100%;height:auto}
.seatmap-field{fill:color-mix(in srgb,var(--dtext) 7%,transparent);stroke:color-mix(in srgb,var(--dtext) 22%,transparent);stroke-width:1.5}
.seatmap-fill{stroke:color-mix(in srgb,var(--dtext) 30%,transparent);stroke-width:1.5;transition:fill-opacity .3s ease,fill .3s ease}
.seatmap-unknown .seatmap-fill{stroke-dasharray:6 5}
.seatmap-hold{pointer-events:none;opacity:.9}
.seatmap-hatch-bg{fill:#D7A34F;fill-opacity:.18}.seatmap-hatch-bar{fill:#D7A34F;fill-opacity:.85}
.seatmap-lbl{font-family:'IBM Plex Mono',monospace;font-weight:600;text-anchor:middle;fill:var(--dink);pointer-events:none;transition:fill .3s ease}
.seatmap-lbl-dark{fill:#0B1220}.sk-daylight .seatmap-lbl-dark{fill:#FFFFFF}
.seatmap-mode-tier .seatmap-lbl-dark{fill:#0B1220}
.seatmap-hi .seatmap-fill{stroke:var(--dink);stroke-width:3}
.seatmap-outline{fill:none;stroke:var(--dink);stroke-width:4;stroke-linejoin:round;pointer-events:none}
.seatmap-pulse .seatmap-outline{animation:seatmap-pulse .6s ease-out}
@keyframes seatmap-pulse{0%{stroke-width:4;opacity:1}40%{stroke-width:14;opacity:.55}100%{stroke-width:4;opacity:1}}
.seatmap-landmark{font:600 15px 'IBM Plex Sans',sans-serif;fill:var(--dfaint);text-anchor:middle;letter-spacing:.06em;text-transform:uppercase;pointer-events:none}
.seatmap-empty{font:500 24px 'IBM Plex Sans',sans-serif;fill:var(--dfaint);text-anchor:middle}
.seatmap-legend,.seatmap-rings{display:flex;flex-wrap:wrap;gap:4px 12px;margin-top:6px;font:500 10px 'IBM Plex Mono',monospace;color:var(--dfaint)}
.seatmap-legend b,.seatmap-rings b{color:var(--dtext);font-weight:600}
.seatmap-legend small,.seatmap-rings small{font-size:9px;opacity:.8}
.seatmap-sw{display:inline-block;width:10px;height:10px;border-radius:2px;vertical-align:-1px;margin-right:4px;background:var(--dink)}
.seatmap-sw-low{background:color-mix(in srgb,var(--dink) 14%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--dtext) 30%,transparent)}
.seatmap-sw-high{background:var(--dink)}
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
      title: 'Venue map', bowl: 'oval', ringSlots: 8, currency: 'USD',
      rings: [{ id: 'lower', label: 'Lower bowl' }, { id: 'upper', label: 'Upper bowl' }],
      sections: seatmapTemplateSections(),
      initial: { sold: { 101: 380, 102: 300, 103: 410, 104: 405, 105: 290, 106: 240, 107: 400, 108: 395, 201: 320, 202: 180, 203: 420, 204: 390, 205: 150, 206: 120, 207: 260, 208: 200 } },
    },
    setupFields: [
      ['geometry', 'text'], ['bowl', 'text'], ['ringSlots', 'num'], ['currency', 'text'], ['showTotals', 'jsonAny'],
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
      geometry: { label: 'Geometry', help: 'bowl draws generic rings from bowl, rings and ringSlots. paths uses each section’s own SVG path (imported with tools/seatmap-import.mjs).' },
      bowl: { label: 'Bowl shape', help: 'oval (default), horseshoe (open on the right), rectangle or pitch. Generic shapes only; no real venue is drawn.' },
      ringSlots: { label: 'Slots per ring', help: '8–32 equal arc-length slots around every ring; default 16. Sections may span several slots or a fraction of one.' },
      currency: { label: 'Currency', help: 'Three-letter ISO code used for prices and revenue; default USD. No conversion.' },
      showTotals: { label: 'Show totals strip', help: 'Sold / capacity, sell-through, held seats and revenue where price is known. Default on.' },
      rings: { label: 'Rings', help: '1–4 rings from the inside out, e.g. 100 level, 200 level, 300 level. Ring ids group sections in the legend.' },
      sections: { label: 'Sections', help: '4–160 sections. ring is a ring id; slot (0 to below ringSlots) and span (slots covered, default 1) place a bowl wedge; path is the SVG path for paths geometry; capacity is seats; zone is free text such as sideline, corner, end or club; tier is a tier id.' },
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
      panel.bowl = 'oval';
      panel.ringSlots = 12;
      panel.rings = [{ id: 'lower', label: 'Lower' }, { id: 'club', label: 'Club' }, { id: 'upper', label: 'Upper' }];
      panel.tiers = [{ id: 'p1', label: 'Premium', color: '#D7A34F' }, { id: 'p2', label: 'Plus', color: '#7D9BC6' }, { id: 'p3', label: 'Value', color: '#55A896' }];
      panel.sections = [];
      var zones = ['end', 'corner', 'sideline', 'sideline', 'corner', 'end', 'end', 'corner', 'sideline', 'sideline', 'corner', 'end'];
      var sold = {}, price = {};
      [['lower', 'L', 480, 'p1', 0.8], ['club', 'C', 320, 'p2', 0.6], ['upper', 'U', 720, 'p3', 0.35]].forEach(function (ring) {
        zones.forEach(function (zone, i) {
          var id = ring[1] + (101 + i);
          panel.sections.push({ id: id, ring: ring[0], slot: i, capacity: ring[2], zone: zone, tier: ring[3] });
          sold[id] = Math.round(ring[2] * Math.min(1, ring[4] + ((i * 7) % 5) * 0.045));
          price[id] = ring[3] === 'p1' ? 145 : ring[3] === 'p2' ? 98 : 42;
        });
      });
      panel.landmarks = [{ id: 'bench', label: 'home bench', x: 500, y: 290 }];
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
