/* Cell scene: a cell (or two) in context — outside, membrane, cytoplasm,
   nucleus and optional vesicles as nested compartments, with authored items
   that sit in a compartment, cross a membrane, bud, fuse, signal, and a cell
   that divides. A teaching cartoon: every position, count and event is
   authored in the spec, nothing is simulated, and the panel names no real
   organism. Shared palette, shapes, cluster and cell-outline helpers live in
   ../mech.js; the shared `.mech-*` CSS is owned by the strandscene panel. */
var CELLSCENE_MAX_COMPARTMENTS = 8, CELLSCENE_MAX_ITEMS = 8, CELLSCENE_MAX_EVENTS = 4, CELLSCENE_MAX_LABELS = 4, CELLSCENE_MAX_COUNT = 50;
var CELLSCENE_KINDS = ['outside', 'cell', 'nucleus', 'vesicle', 'organelle', 'region'];
var CELLSCENE_ITEM_STATES = ['free', 'bound', 'active', 'released', 'hidden'];
var CELLSCENE_EVENTS = ['enter', 'bud', 'fuse', 'divide', 'signal'];
var CELLSCENE_CELL = { x: 312, y: 160, rx: 150, ry: 102 };
var CELLSCENE_OUTSIDE = { x: 58, y: 108 };
var CELLSCENE_DRAW_RANK = { outside: 0, cell: 1, region: 2, nucleus: 3, organelle: 4, vesicle: 5 };
var CELLSCENE_ITEM_FIELDS = ['in', 'x', 'y', 'count', 'state', 'label', 'daughter'];

function cellsceneWarn(warnings, at, message) {
  if (warnings) warnings.push(at + ': ' + message);
}
function cellsceneUnit(value, max) {
  return mechNum(clamp(value, 0, max));
}
/* Cleans an authored compartment list. Unknown kinds, duplicate ids, a second
   cell or nucleus and a fifth vesicle/organelle are skipped; unknown parents
   and parent cycles render flat. Geometry defaults follow the cell. Pure. */
function cellsceneCompartments(raw, path, warnings) {
  var at0 = path + '.compartments', list = Array.isArray(raw) ? raw : [];
  if (!Array.isArray(raw) || !raw.length)
    cellsceneWarn(warnings, at0, 'declare 1–' + CELLSCENE_MAX_COMPARTMENTS + ' compartments [{id, kind, label?, parent?, x?, y?, rx?, ry?}]');
  else if (raw.length > CELLSCENE_MAX_COMPARTMENTS)
    cellsceneWarn(warnings, at0, 'only the first ' + CELLSCENE_MAX_COMPARTMENTS + ' compartments render');
  var seen = Object.create(null), out = [], cells = 0, nuclei = 0, small = 0;
  list.slice(0, CELLSCENE_MAX_COMPARTMENTS).forEach(function (c, i) {
    var at = at0 + '[' + i + ']';
    if (!panelObject(c) || !mechId(c.id)) { cellsceneWarn(warnings, at + '.id', 'needs a letter-led id of letters, digits, "-" or "_" — compartment skipped'); return; }
    if (seen[c.id]) { cellsceneWarn(warnings, at + '.id', 'duplicate id "' + c.id + '" — compartment skipped'); return; }
    if (CELLSCENE_KINDS.indexOf(c.kind) < 0) { cellsceneWarn(warnings, at + '.kind', 'expected ' + CELLSCENE_KINDS.join('|') + ' — compartment skipped'); return; }
    if (c.kind === 'cell' && cells++) { cellsceneWarn(warnings, at, 'only one cell compartment renders — skipped'); return; }
    if (c.kind === 'nucleus' && nuclei++) { cellsceneWarn(warnings, at, 'only one nucleus renders — skipped'); return; }
    if ((c.kind === 'vesicle' || c.kind === 'organelle') && small++ >= 4) { cellsceneWarn(warnings, at, 'at most 4 vesicles and organelles render — skipped'); return; }
    seen[c.id] = true;
    var comp = { id: c.id, kind: c.kind, label: c.id, parent: null, x: null, y: null, rx: null, ry: null, at: at };
    if (c.label !== undefined) {
      if (typeof c.label === 'string') comp.label = c.label.slice(0, 24) || c.id;
      else cellsceneWarn(warnings, at + '.label', 'expected text — using the id');
    }
    if (c.parent !== undefined && c.parent !== null) {
      if (typeof c.parent === 'string') comp.parent = c.parent;
      else cellsceneWarn(warnings, at + '.parent', 'expected a compartment id — rendered without nesting');
    }
    ['x', 'y', 'rx', 'ry'].forEach(function (key) {
      if (c[key] === undefined) return;
      var ok = isFiniteNum(c[key]) && (key === 'x' || key === 'y' || c[key] > 0);
      if (ok) comp[key] = key === 'x' ? cellsceneUnit(c[key], MECH_SCENE.w) : key === 'y' ? cellsceneUnit(c[key], MECH_SCENE.h) : mechNum(Math.min(c[key], 280));
      else cellsceneWarn(warnings, at + '.' + key, 'expected a finite ' + (key === 'x' || key === 'y' ? 'scene coordinate' : 'positive radius') + ' — using the default');
    });
    out.push(comp);
  });
  var byId = Object.create(null);
  out.forEach(function (comp) { byId[comp.id] = comp; });
  var cell = null, nucleus = null;
  out.forEach(function (comp) {
    if (comp.kind === 'cell') cell = comp;
    if (comp.kind === 'nucleus') nucleus = comp;
  });
  out.forEach(function (comp) {
    if (comp.parent !== null && (!byId[comp.parent] || comp.parent === comp.id)) {
      cellsceneWarn(warnings, comp.at + '.parent', 'unknown compartment "' + comp.parent + '" — rendered without nesting');
      comp.parent = null;
    }
  });
  out.forEach(function (comp) {
    var visited = Object.create(null), cur = comp;
    visited[comp.id] = true;
    while (cur.parent !== null) {
      cur = byId[cur.parent];
      if (visited[cur.id]) { cellsceneWarn(warnings, comp.at + '.parent', 'parent cycle — rendered without nesting'); comp.parent = null; break; }
      visited[cur.id] = true;
    }
  });
  /* The nucleus nests in the cell unless told otherwise. */
  if (nucleus && cell && nucleus.parent === null) nucleus.parent = cell.id;
  var base = cell ? {
    x: cell.x === null ? CELLSCENE_CELL.x : cell.x, y: cell.y === null ? CELLSCENE_CELL.y : cell.y,
    rx: cell.rx === null ? CELLSCENE_CELL.rx : cell.rx, ry: cell.ry === null ? CELLSCENE_CELL.ry : cell.ry,
  } : CELLSCENE_CELL;
  var smallIndex = 0;
  out.forEach(function (comp) {
    var depth = 0, cur = comp;
    while (cur.parent !== null) { cur = byId[cur.parent]; depth++; }
    comp.depth = depth;
    if (comp.kind === 'cell') { comp.x = base.x; comp.y = base.y; comp.rx = base.rx; comp.ry = base.ry; }
    else if (comp.kind === 'outside') { comp.x = comp.x === null ? CELLSCENE_OUTSIDE.x : comp.x; comp.y = comp.y === null ? CELLSCENE_OUTSIDE.y : comp.y; comp.rx = 0; comp.ry = 0; }
    else if (comp.kind === 'nucleus') {
      if (comp.x === null) comp.x = mechNum(base.x + 40);
      if (comp.y === null) comp.y = mechNum(base.y - 2);
      var r = comp.rx !== null ? comp.rx : comp.ry !== null ? comp.ry : Math.round(base.ry * 0.41);
      comp.rx = r; comp.ry = r;
    } else if (comp.kind === 'region') {
      if (comp.x === null) comp.x = mechNum(base.x - base.rx * 0.62);
      if (comp.y === null) comp.y = mechNum(base.y - base.ry * 0.1);
      if (comp.rx === null) comp.rx = 70;
      if (comp.ry === null) comp.ry = 40;
    } else {
      if (comp.x === null) comp.x = mechNum(base.x - base.rx * 0.45 + 36 * smallIndex);
      if (comp.y === null) comp.y = mechNum(base.y + base.ry * 0.52);
      smallIndex++;
      if (comp.kind === 'vesicle') { var vr = comp.rx !== null ? comp.rx : comp.ry !== null ? comp.ry : 18; comp.rx = vr; comp.ry = vr; }
      else { if (comp.rx === null) comp.rx = 26; if (comp.ry === null) comp.ry = 15; }
    }
    delete comp.at;
  });
  out.forEach(function (comp, i) { comp.index = i; });
  out.sort(function (a, b) {
    return a.depth - b.depth || CELLSCENE_DRAW_RANK[a.kind] - CELLSCENE_DRAW_RANK[b.kind] || a.index - b.index;
  });
  out.forEach(function (comp) { delete comp.index; });
  return out;
}
function cellsceneCount(value) {
  return Math.round(clamp(value, 0, CELLSCENE_MAX_COUNT));
}
/* Cleans an authored item list against a cleaned compartment list. Pure. */
function cellsceneItems(raw, compartments, path, warnings) {
  var at0 = path + '.items', list = Array.isArray(raw) ? raw : [], ids = compartments.map(function (c) { return c.id; });
  if (!Array.isArray(raw) || !raw.length)
    cellsceneWarn(warnings, at0, 'declare 1–' + CELLSCENE_MAX_ITEMS + ' items [{id, role, shape?, label?, size?, start:{in, x?, y?, count?, state?}}]');
  else if (raw.length > CELLSCENE_MAX_ITEMS)
    cellsceneWarn(warnings, at0, 'only the first ' + CELLSCENE_MAX_ITEMS + ' items render');
  var seen = Object.create(null), out = [];
  list.slice(0, CELLSCENE_MAX_ITEMS).forEach(function (item, i) {
    var at = at0 + '[' + i + ']';
    if (!panelObject(item) || !mechId(item.id)) { cellsceneWarn(warnings, at + '.id', 'needs a letter-led id of letters, digits, "-" or "_" — item skipped'); return; }
    if (seen[item.id]) { cellsceneWarn(warnings, at + '.id', 'duplicate id "' + item.id + '" — item skipped'); return; }
    seen[item.id] = true;
    var clean = { id: item.id, role: mechRole(item.role, 'particle'), shape: null, label: item.id, size: 'm', start: { in: ids[0] || null, x: null, y: null, count: 1, state: 'free' } };
    if (MECH_ROLE_NAMES.indexOf(item.role) < 0) cellsceneWarn(warnings, at + '.role', 'expected ' + MECH_ROLE_NAMES.join('|') + ' — using particle');
    if (item.shape !== undefined && MECH_SHAPE_NAMES.indexOf(item.shape) < 0) cellsceneWarn(warnings, at + '.shape', 'expected ' + MECH_SHAPE_NAMES.join('|') + ' — using the role shape');
    clean.shape = mechShape(item.shape, clean.role);
    if (item.label !== undefined) {
      if (typeof item.label === 'string') clean.label = item.label.slice(0, 16);
      else cellsceneWarn(warnings, at + '.label', 'expected text up to 16 characters — using the id');
    }
    if (item.size !== undefined && !Object.prototype.hasOwnProperty.call(MECH_SIZES, item.size)) cellsceneWarn(warnings, at + '.size', 'expected s|m|l — using m');
    clean.size = mechSize(item.size);
    var start = item.start;
    if (start !== undefined && !panelObject(start)) { cellsceneWarn(warnings, at + '.start', 'expected {in, x?, y?, count?, state?} — using the first compartment'); start = {}; }
    start = start || {};
    if (typeof start.in === 'string' && ids.indexOf(start.in) >= 0) clean.start.in = start.in;
    else cellsceneWarn(warnings, at + '.start.in', (start.in === undefined ? 'missing' : 'unknown') + ' compartment — using "' + (ids[0] || '') + '"');
    if (start.x !== undefined || start.y !== undefined) {
      if (isFiniteNum(start.x) && isFiniteNum(start.y)) { clean.start.x = cellsceneUnit(start.x, MECH_SCENE.w); clean.start.y = cellsceneUnit(start.y, MECH_SCENE.h); }
      else cellsceneWarn(warnings, at + '.start', 'x and y must both be finite scene units — using the compartment anchor');
    }
    if (start.count !== undefined) {
      if (isFiniteNum(start.count)) {
        clean.start.count = cellsceneCount(start.count);
        if (clean.start.count !== start.count) cellsceneWarn(warnings, at + '.start.count', 'expected a whole number 0–' + CELLSCENE_MAX_COUNT + ' — clamped to ' + clean.start.count);
      } else cellsceneWarn(warnings, at + '.start.count', 'expected a whole number 0–' + CELLSCENE_MAX_COUNT + ' — using 1');
    }
    if (start.state !== undefined) {
      if (CELLSCENE_ITEM_STATES.indexOf(start.state) >= 0) clean.start.state = start.state;
      else cellsceneWarn(warnings, at + '.start.state', 'expected ' + CELLSCENE_ITEM_STATES.join('|') + ' — using free');
    }
    out.push(clean);
  });
  return out;
}
/* The cleaned declaration, read from the `panel` argument on every call so a
   declaration the engine changes per step is honoured without caching. */
function cellsceneDecl(panel, path, warnings) {
  panel = panelObject(panel) ? panel : {};
  var compartments = cellsceneCompartments(panel.compartments, path || 'panel', warnings);
  var items = cellsceneItems(panel.items, compartments, path || 'panel', warnings);
  var legendMode = panel.legendMode === 'visible' ? 'visible' : 'all';
  if (panel.legendMode !== undefined && panel.legendMode !== 'all' && panel.legendMode !== 'visible')
    cellsceneWarn(warnings, (path || 'panel') + '.legendMode', 'expected all|visible — using all');
  var labelMode = panel.labelMode === 'readable' ? 'readable' : 'standard';
  if (panel.labelMode !== undefined && panel.labelMode !== 'standard' && panel.labelMode !== 'readable')
    cellsceneWarn(warnings, (path || 'panel') + '.labelMode', 'expected standard|readable — using standard');
  var byId = Object.create(null), itemById = Object.create(null);
  compartments.forEach(function (c) { byId[c.id] = c; });
  items.forEach(function (item) { itemById[item.id] = item; });
  return { compartments: compartments, items: items, legendMode: legendMode, labelMode: labelMode, label: mechText(panel.label, 40), byId: byId, itemById: itemById };
}

/* ---- state cleaning (shared by validation and the fold) ---- */
function cellsceneItemPatch(raw) {
  if (raw === null) return null;
  if (!panelObject(raw)) return undefined;
  var out = {}, any = false;
  if (mechId(raw.in)) { out.in = raw.in; any = true; }
  if (isFiniteNum(raw.x)) { out.x = cellsceneUnit(raw.x, MECH_SCENE.w); any = true; }
  if (isFiniteNum(raw.y)) { out.y = cellsceneUnit(raw.y, MECH_SCENE.h); any = true; }
  if (isFiniteNum(raw.count)) { out.count = cellsceneCount(raw.count); any = true; }
  if (CELLSCENE_ITEM_STATES.indexOf(raw.state) >= 0) { out.state = raw.state; any = true; }
  if (typeof raw.label === 'string') { out.label = raw.label.slice(0, 16); any = true; }
  if (raw.daughter === 1 || raw.daughter === 2 || raw.daughter === null) { out.daughter = raw.daughter; any = true; }
  /* An entirely invalid patch leaves the carried item intact; an explicit
     empty object is accepted as a no-op rather than a reset. */
  return any || !Object.keys(raw).length ? out : undefined;
}
/* Events are resolved against the declaration the fold is given, so an event
   that validation reports as skipped (unknown item, compartment or vesicle
   source) never changes carried state. Under per-step declaration overrides
   the engine folds once per effective declaration, so this stays correct. */
function cellsceneCleanEvent(raw, decl) {
  if (!panelObject(raw) || CELLSCENE_EVENTS.indexOf(raw.kind) < 0) return null;
  var id = function (value) { return mechId(value) ? value : null; };
  var comp = function (value) { return id(value) && (!decl || decl.byId[value]) ? value : null; };
  var item = function (value) { return id(value) && (!decl || decl.itemById[value]) ? value : null; };
  if (raw.kind === 'enter') {
    if (!item(raw.item) || !comp(raw.to)) return null;
    return { kind: 'enter', item: raw.item, to: raw.to, via: comp(raw.via) };
  }
  if (raw.kind === 'bud') {
    if (!id(raw.vesicle) || !comp(raw.from)) return null;
    return { kind: 'bud', vesicle: raw.vesicle, from: raw.from, items: (Array.isArray(raw.items) ? raw.items : []).filter(item) };
  }
  if (raw.kind === 'fuse') {
    if (!id(raw.vesicle) || !comp(raw.with)) return null;
    return { kind: 'fuse', vesicle: raw.vesicle, with: raw.with, to: comp(raw.to) || raw.with };
  }
  if (raw.kind === 'divide') {
    var daughters = {};
    if (Array.isArray(raw.daughters)) raw.daughters.slice(0, 2).forEach(function (d, i) {
      if (panelObject(d) && Array.isArray(d.items)) d.items.filter(item).forEach(function (iid) { daughters[iid] = i + 1; });
    });
    return { kind: 'divide', daughters: daughters };
  }
  if (!item(raw.at) && !comp(raw.at)) return null;
  return { kind: 'signal', at: raw.at, rings: isFiniteNum(raw.rings) ? Math.round(clamp(raw.rings, 1, 3)) : 1 };
}
function cellsceneCleanLabel(raw) {
  if (!panelObject(raw) || typeof raw.text !== 'string' || !raw.text.trim()) return null;
  var at = typeof raw.at === 'string' ? raw.at : mechXY(raw.at);
  return at ? { at: at, text: raw.text.slice(0, 40) } : null;
}
/* Scalar fields fold through the shared helper; items, vesicles, division
   and step-local events are carried below. */
function cellsceneCleanScalars(raw, once) {
  var out = {};
  if (!panelObject(raw)) return out;
  ['zoom', 'highlight', 'caption', 'note'].forEach(function (key) {
    if (panelOwn(raw, key) && (raw[key] === null || typeof raw[key] === 'string')) out[key] = raw[key];
  });
  if (panelOwn(raw, 'labels')) {
    if (raw.labels === null) out.labels = null;
    else if (Array.isArray(raw.labels)) out.labels = raw.labels.slice(0, CELLSCENE_MAX_LABELS).map(cellsceneCleanLabel).filter(Boolean);
  }
  if (once && panelObject(raw.enterOnce)) out.enterOnce = cellsceneCleanScalars(raw.enterOnce, false);
  return out;
}
/* Applies one patch's item patches and events to the carried record `c` and
   returns a new record; `events` are the cleaned step-local events. Pure. */
function cellsceneApply(c, patch, decl) {
  var next = {
    items: Object.assign({}, c.items), vesicles: Object.assign({}, c.vesicles), divided: c.divided, daughters: Object.assign({}, c.daughters), events: [],
  };
  if (!panelObject(patch)) return next;
  function leaveVesicle(id) {
    Object.keys(next.vesicles).forEach(function (v) {
      if (next.vesicles[v].items.indexOf(id) >= 0)
        next.vesicles[v] = Object.assign({}, next.vesicles[v], { items: next.vesicles[v].items.filter(function (x) { return x !== id; }) });
    });
  }
  function setItem(id, fields) {
    next.items[id] = Object.assign({}, next.items[id] || {}, fields);
  }
  if (panelObject(patch.items)) Object.keys(patch.items).forEach(function (id) {
    if (!mechId(id)) return;
    var fields = cellsceneItemPatch(patch.items[id]);
    if (fields === null) { delete next.items[id]; leaveVesicle(id); return; }
    if (!fields) return;
    if (panelOwn(fields, 'in')) leaveVesicle(id);
    setItem(id, fields);
  });
  (Array.isArray(patch.events) ? patch.events.slice(0, CELLSCENE_MAX_EVENTS) : []).forEach(function (raw) {
    var event = cellsceneCleanEvent(raw, decl);
    if (!event) return;
    if (event.kind === 'enter') { leaveVesicle(event.item); setItem(event.item, { in: event.to }); }
    else if (event.kind === 'bud') {
      event.items.forEach(leaveVesicle);
      next.vesicles[event.vesicle] = { from: event.from, items: event.items.slice() };
      event.items.forEach(function (id) { setItem(id, { in: 'vesicle:' + event.vesicle }); });
    } else if (event.kind === 'fuse') {
      if (!next.vesicles[event.vesicle]) return;
      event.items = next.vesicles[event.vesicle].items.slice();
      event.items.forEach(function (id) { setItem(id, { in: event.to }); });
      delete next.vesicles[event.vesicle];
    } else if (event.kind === 'divide') {
      if (next.divided) return;
      next.divided = true;
      next.daughters = Object.assign({}, event.daughters);
    }
    next.events.push(event);
  });
  return next;
}
function cellsceneSnapshot(scalars, c) {
  var snap = Object.assign({}, scalars);
  delete snap.enterOnce;
  snap.items = Object.assign({}, c.items);
  snap.vesicles = Object.assign({}, c.vesicles);
  snap.divided = c.divided;
  snap.daughters = Object.assign({}, c.daughters);
  snap.events = c.events.slice();
  return snap;
}
/* Walks the steps once, returning the folded snapshots and, for validation,
   the carried record in force before each step's patch. Pure. */
function cellsceneWalk(panel, steps) {
  var scalars = foldSanitizedPanelStates(panel, steps, cellsceneCleanScalars);
  var decl = cellsceneDecl(panel, null, null);
  var c = { items: {}, vesicles: {}, divided: false, daughters: {}, events: [] };
  c = cellsceneApply(c, panel.initial, decl);
  c.events = [];
  var before = [], states = [];
  steps.forEach(function (step, i) {
    var source = stepPanelPatch(step), patch = source && panelOwn(source, panel.id) ? source[panel.id] : null;
    before.push(c);
    var after = cellsceneApply(c, patch, decl);
    var once = panelObject(patch) && panelObject(patch.enterOnce) ? cellsceneApply(after, patch.enterOnce, decl) : null;
    if (once) once.events = after.events.concat(once.events);
    states.push(cellsceneSnapshot(scalars[i], once || after));
    after.events = [];
    c = after;
  });
  if (!steps.length) states.push(cellsceneSnapshot(scalars[0], c));
  return { states: states, before: before };
}
function cellsceneFold(panel, steps) {
  return cellsceneWalk(panel, steps).states;
}

/* ---- validation ---- */
function cellsceneStateWarnings(state, path, context, warnings) {
  var decl = context.decl, before = context.before;
  var comp = function (value) { return typeof value === 'string' && decl.byId[value]; };
  Object.keys(state).forEach(function (key) {
    var value = state[key], at = path + '.' + key;
    if (key === 'enterOnce') return;
    if (key === 'items') {
      if (!panelObject(value)) { cellsceneWarn(warnings, at, 'expected an object keyed by item id — ignored'); return; }
      Object.keys(value).forEach(function (id) {
        var raw = value[id], atId = at + '.' + id;
        if (!decl.itemById[id]) { cellsceneWarn(warnings, atId, 'unknown item id — ignored'); return; }
        if (raw === null) return;
        if (!panelObject(raw)) { cellsceneWarn(warnings, atId, 'expected an item patch object or null — ignored'); return; }
        Object.keys(raw).forEach(function (field) {
          var v = raw[field], atField = atId + '.' + field;
          if (CELLSCENE_ITEM_FIELDS.indexOf(field) < 0) cellsceneWarn(warnings, atField, 'unknown item property — ignored');
          else if (field === 'in' && !comp(v)) cellsceneWarn(warnings, atField, 'unknown compartment — the item falls back to its declared start');
          else if ((field === 'x' || field === 'y') && !isFiniteNum(v)) cellsceneWarn(warnings, atField, 'expected a finite scene coordinate — ignored');
          else if (field === 'count' && (!isFiniteNum(v) || cellsceneCount(v) !== v)) cellsceneWarn(warnings, atField, 'expected a whole number 0–' + CELLSCENE_MAX_COUNT + (isFiniteNum(v) ? ' — clamped to ' + cellsceneCount(v) : ' — ignored'));
          else if (field === 'state' && CELLSCENE_ITEM_STATES.indexOf(v) < 0) cellsceneWarn(warnings, atField, 'expected ' + CELLSCENE_ITEM_STATES.join('|') + ' — ignored');
          else if (field === 'label' && typeof v !== 'string') cellsceneWarn(warnings, atField, 'expected text — ignored');
          else if (field === 'daughter' && v !== 1 && v !== 2 && v !== null) cellsceneWarn(warnings, atField, 'expected 1, 2 or null — ignored');
        });
      });
    } else if (key === 'events') {
      if (!Array.isArray(value)) { cellsceneWarn(warnings, at, 'expected an array of up to ' + CELLSCENE_MAX_EVENTS + ' events — ignored'); return; }
      if (value.length > CELLSCENE_MAX_EVENTS) cellsceneWarn(warnings, at, 'only the first ' + CELLSCENE_MAX_EVENTS + ' events run');
      var vesicles = Object.keys(before.vesicles), divided = before.divided;
      value.slice(0, CELLSCENE_MAX_EVENTS).forEach(function (raw, i) {
        var atE = at + '[' + i + ']';
        if (!panelObject(raw) || CELLSCENE_EVENTS.indexOf(raw.kind) < 0) { cellsceneWarn(warnings, atE + '.kind', 'expected ' + CELLSCENE_EVENTS.join('|') + ' — event skipped'); return; }
        if (raw.kind === 'enter') {
          if (!decl.itemById[raw.item]) cellsceneWarn(warnings, atE + '.item', 'unknown item id — event skipped');
          if (!comp(raw.to)) cellsceneWarn(warnings, atE + '.to', 'unknown compartment — event skipped');
          if (raw.via !== undefined && !comp(raw.via)) cellsceneWarn(warnings, atE + '.via', 'unknown compartment — crossing drawn at the destination');
        } else if (raw.kind === 'bud') {
          if (!mechId(raw.vesicle)) cellsceneWarn(warnings, atE + '.vesicle', 'needs a letter-led vesicle id — event skipped');
          if (!comp(raw.from)) cellsceneWarn(warnings, atE + '.from', 'unknown compartment — event skipped');
          (Array.isArray(raw.items) ? raw.items : []).forEach(function (id, j) {
            if (!decl.itemById[id]) cellsceneWarn(warnings, atE + '.items[' + j + ']', 'unknown item id — ignored');
          });
          /* Only a bud the fold applies creates a vesicle a later fuse may use. */
          if (mechId(raw.vesicle) && comp(raw.from)) vesicles.push(raw.vesicle);
        } else if (raw.kind === 'fuse') {
          if (!mechId(raw.vesicle)) cellsceneWarn(warnings, atE + '.vesicle', 'needs a letter-led vesicle id — event skipped');
          else if (vesicles.indexOf(raw.vesicle) < 0) cellsceneWarn(warnings, atE + '.vesicle', 'no vesicle "' + raw.vesicle + '" has budded on this path — event skipped');
          if (!comp(raw.with)) cellsceneWarn(warnings, atE + '.with', 'unknown compartment — event skipped');
          if (raw.to !== undefined && !comp(raw.to)) cellsceneWarn(warnings, atE + '.to', 'unknown compartment — contents stay with the fused compartment');
          /* Mirror the fold: only a fuse it applies (known vesicle that has
             budded on this path, known compartment) removes the vesicle. */
          if (mechId(raw.vesicle) && vesicles.indexOf(raw.vesicle) >= 0 && comp(raw.with))
            vesicles = vesicles.filter(function (v) { return v !== raw.vesicle; });
        } else if (raw.kind === 'divide') {
          if (divided) cellsceneWarn(warnings, atE, 'the cell has already divided on this path — event skipped');
          if (raw.daughters !== undefined && (!Array.isArray(raw.daughters) || raw.daughters.length > 2))
            cellsceneWarn(warnings, atE + '.daughters', 'expected up to two {items:[ids]} entries — items follow the nearer daughter');
          else (Array.isArray(raw.daughters) ? raw.daughters : []).forEach(function (d, j) {
            (panelObject(d) && Array.isArray(d.items) ? d.items : []).forEach(function (id, k) {
              if (!decl.itemById[id]) cellsceneWarn(warnings, atE + '.daughters[' + j + '].items[' + k + ']', 'unknown item id — ignored');
            });
          });
          divided = true;
        } else {
          if (!decl.itemById[raw.at] && !comp(raw.at)) cellsceneWarn(warnings, atE + '.at', 'expected an item or compartment id — event skipped');
          if (raw.rings !== undefined && !(isFiniteNum(raw.rings) && raw.rings >= 1 && raw.rings <= 3)) cellsceneWarn(warnings, atE + '.rings', 'expected 1–3 — clamped');
        }
      });
    } else if (key === 'zoom' || key === 'highlight') {
      if (value !== null && !comp(value)) cellsceneWarn(warnings, at, 'expected a declared compartment id or null — ignored');
    } else if (key === 'labels') {
      if (value === null) return;
      if (!Array.isArray(value)) { cellsceneWarn(warnings, at, 'expected an array of up to ' + CELLSCENE_MAX_LABELS + ' {at, text} callouts or null — ignored'); return; }
      if (value.length > CELLSCENE_MAX_LABELS) cellsceneWarn(warnings, at, 'only the first ' + CELLSCENE_MAX_LABELS + ' callouts render');
      value.slice(0, CELLSCENE_MAX_LABELS).forEach(function (raw, i) {
        var atL = at + '[' + i + ']';
        if (!panelObject(raw) || typeof raw.text !== 'string' || !raw.text.trim()) { cellsceneWarn(warnings, atL + '.text', 'expected text — callout skipped'); return; }
        if (typeof raw.at === 'string') { if (!comp(raw.at) && !decl.itemById[raw.at]) cellsceneWarn(warnings, atL + '.at', 'unknown item or compartment id — callout skipped'); }
        else mechXY(raw.at, atL + '.at', warnings);
      });
    } else if (key === 'caption' || key === 'note') {
      if (value !== null && typeof value !== 'string') cellsceneWarn(warnings, at, 'expected text or null — ignored');
    } else cellsceneWarn(warnings, at, 'unknown field — ignored');
  });
}
/* The fold applies a step's own events first and its enterOnce events on top
   of the result, so enterOnce is validated against the state after the step's
   own events, under exactly the fold's rules (cellsceneApply). */
function cellscenePatchWarnings(state, path, context, warnings) {
  if (!panelObject(state) || !panelObject(state.enterOnce)) {
    softwarePanelPatchWarnings(state, path, context, warnings, cellsceneStateWarnings);
    return;
  }
  var main = Object.assign({}, state), once = Object.assign({}, state.enterOnce);
  delete main.enterOnce; delete once.enterOnce;
  cellsceneStateWarnings(main, path, context, warnings);
  var carried = Object.assign({ items: {}, vesicles: {}, divided: false, daughters: {}, events: [] }, context.before);
  var after = cellsceneApply(carried, main, context.decl);
  cellsceneStateWarnings(once, path + '.enterOnce', { decl: context.decl, before: after }, warnings);
}
function cellsceneDeclarationWarnings(panel, path, warnings, errors, diagram) {
  var decl = cellsceneDecl(panel, path, warnings);
  if (panel.label !== undefined && typeof panel.label !== 'string') cellsceneWarn(warnings, path + '.label', 'expected text — ignored');
  var start = { vesicles: {}, divided: false };
  cellscenePatchWarnings(panel.initial, path + '.initial', { decl: decl, before: start }, warnings);
  /* Each step is checked against the vesicles and division carried before it
     on every path that reaches it (the data-contract context pattern). */
  var contexts = new Map();
  if (diagram && Array.isArray(diagram.steps)) diagramPathList(diagram).forEach(function (route) {
    var steps = route.indices.map(function (index) { return diagram.steps[index]; });
    var walk = cellsceneWalk(panel, steps);
    steps.forEach(function (step, i) {
      var source = stepPanelPatch(step), patch = source && panelOwn(source, panel.id) ? source[panel.id] : null;
      if (!panelObject(patch)) return;
      if (!contexts.has(patch)) contexts.set(patch, []);
      contexts.get(patch).push({ decl: decl, before: walk.before[i] });
    });
  });
  return { decl: decl, start: start, contexts: contexts };
}

/* ---- geometry model ---- */
function cellsceneBoundaryPoint(comp, point, geom) {
  if (!comp) return point;
  var shape = geom && geom[comp.id] ? geom[comp.id] : comp;
  if (comp.kind === 'region' || comp.kind === 'outside' || !shape.rx || !shape.ry) return null;
  var angle = Math.atan2((point.y - shape.y) / shape.ry, (point.x - shape.x) / shape.rx);
  return { x: mechNum(shape.x + shape.rx * Math.cos(angle)), y: mechNum(shape.y + shape.ry * Math.sin(angle)) };
}
/* The settled geometry of a snapshot: compartments, daughters, items with
   absolute positions and clusters, vesicles, zoom, highlight, callouts,
   step-local transients, legend chips and the accessible description. */
function cellsceneModel(panel, state) {
  panel = panelObject(panel) ? panel : {};
  state = panelObject(state) ? state : {};
  var decl = cellsceneDecl(panel);
  var comps = decl.compartments, byId = decl.byId, cell = null, nucleus = null;
  comps.forEach(function (c) { if (c.kind === 'cell') cell = c; if (c.kind === 'nucleus') nucleus = c; });
  var divided = state.divided === true && !!cell;
  var carried = panelObject(state.items) ? state.items : {}, vesicles = panelObject(state.vesicles) ? state.vesicles : {};
  var daughterOf = panelObject(state.daughters) ? state.daughters : {};
  var events = Array.isArray(state.events) ? state.events : [];
  function insideCell(id) {
    var cur = byId[id], hops = 0;
    while (cur && hops++ < CELLSCENE_MAX_COMPARTMENTS) { if (cur === cell) return true; cur = cur.parent ? byId[cur.parent] : null; }
    return false;
  }
  var daughters = null;
  if (divided) {
    var gap = cell.rx * 0.62 + 14;
    daughters = [1, 2].map(function (n) {
      var sign = n === 1 ? -1 : 1, d = { index: n, x: mechNum(cell.x + sign * gap), y: cell.y, rx: mechNum(cell.rx * 0.54), ry: mechNum(cell.ry * 0.8), nucleus: null };
      if (nucleus) d.nucleus = { x: mechNum(d.x + (nucleus.x - cell.x) * 0.54), y: mechNum(d.y + (nucleus.y - cell.y) * 0.8), r: mechNum(nucleus.rx * 0.76) };
      return d;
    });
  }
  function mapToDaughter(point, which) {
    var d = daughters[which - 1];
    return { x: mechNum(d.x + (point.x - cell.x) * 0.54), y: mechNum(d.y + (point.y - cell.y) * 0.8) };
  }
  function whichDaughter(point, preferred) {
    return preferred === 1 || preferred === 2 ? preferred : point.x <= cell.x ? 1 : 2;
  }
  /* Compartment geometry as drawn (children of a divided cell follow a daughter). */
  var geom = Object.create(null);
  comps.forEach(function (c) {
    var g = { x: c.x, y: c.y, rx: c.rx, ry: c.ry, daughter: null };
    if (divided && c !== cell && insideCell(c.id)) {
      g.daughter = whichDaughter(c);
      var p = mapToDaughter(c, g.daughter);
      g.x = p.x; g.y = p.y; g.rx = mechNum(c.rx * 0.7); g.ry = mechNum(c.ry * 0.76);
    }
    geom[c.id] = g;
  });
  function anchor(id) {
    if (typeof id === 'string' && id.indexOf('vesicle:') === 0) {
      var v = vesicles[id.slice(8)];
      return v && byId[v.from] ? anchor(v.from) : CELLSCENE_OUTSIDE;
    }
    var c = byId[id];
    if (!c) return CELLSCENE_OUTSIDE;
    if (c.kind === 'cell') return { x: mechNum(c.x - c.rx * 0.5), y: c.y };
    return { x: c.x, y: c.y };
  }
  function compLabel(id) {
    if (typeof id === 'string' && id.indexOf('vesicle:') === 0) return 'vesicle';
    return byId[id] ? byId[id].label : '';
  }
  var items = decl.items.map(function (item) {
    var st = Object.assign({}, item.start, carried[item.id] || {});
    var inId = st.in;
    if (!(typeof inId === 'string' && (byId[inId] || (inId.indexOf('vesicle:') === 0 && vesicles[inId.slice(8)])))) inId = item.start.in;
    if (!byId[inId] && !(inId && inId.indexOf('vesicle:') === 0)) inId = comps[0] ? comps[0].id : null;
    var count = cellsceneCount(isFiniteNum(st.count) ? st.count : 1);
    var pos = isFiniteNum(st.x) && isFiniteNum(st.y) ? { x: st.x, y: st.y } : anchor(inId);
    var homeId = inId && inId.indexOf('vesicle:') === 0 && vesicles[inId.slice(8)] ? vesicles[inId.slice(8)].from : inId;
    var which = null;
    if (divided && insideCell(homeId)) {
      which = whichDaughter(pos, st.daughter === 1 || st.daughter === 2 ? st.daughter : daughterOf[item.id]);
      pos = mapToDaughter(pos, which);
    }
    var shape = item.shape, box = mechShapeBox(shape, item.size), r = count > 12 ? 3.5 : 4.5;
    var cluster = count >= 2 ? mechCluster(count, r * mechSizeScale(item.size)) : null;
    var reach = box.w / 2;
    if (cluster) cluster.forEach(function (o) { reach = Math.max(reach, Math.sqrt(o.dx * o.dx + o.dy * o.dy) + r); });
    return {
      id: item.id, role: item.role, shape: shape, size: item.size, label: typeof st.label === 'string' ? st.label.slice(0, 16) : item.label,
      x: pos.x, y: pos.y, w: box.w, h: box.h, count: count, state: st.state, in: inId, inLabel: compLabel(inId),
      visible: st.state !== 'hidden' && count > 0, daughter: which, cluster: cluster, dotR: r, reach: mechNum(reach),
    };
  });
  var itemById = Object.create(null);
  items.forEach(function (item) { itemById[item.id] = item; });
  var vesicleList = Object.keys(vesicles).map(function (id) {
    var v = vesicles[id], contents = v.items.map(function (iid) { return itemById[iid]; }).filter(function (it) { return it && it.visible; });
    var x = 0, y = 0, r = 16;
    if (contents.length) {
      contents.forEach(function (it) { x += it.x; y += it.y; r = Math.max(r, it.reach + 10); });
      x /= contents.length; y /= contents.length;
    } else { var a = anchor(v.from); x = a.x; y = a.y; }
    return { id: id, from: v.from, x: mechNum(x), y: mechNum(y), r: mechNum(r), items: v.items.slice() };
  });
  /* ---- presentation geometry (pure decoration; it carries no meaning) ----
     Membrane distance: signed distance of a point from the whole cell's
     membrane (+ outside) and the outward normal there; null once divided. */
  var mem = cell && !divided ? function (x, y) {
    var ux = (x - cell.x) / cell.rx, uy = (y - cell.y) / cell.ry, rho = Math.sqrt(ux * ux + uy * uy);
    if (rho < 1e-6) return { dist: -Math.min(cell.rx, cell.ry), nx: 0, ny: -1 };
    var r = Math.sqrt((x - cell.x) * (x - cell.x) + (y - cell.y) * (y - cell.y));
    var gx = (x - cell.x) / (cell.rx * cell.rx), gy = (y - cell.y) / (cell.ry * cell.ry), gl = Math.sqrt(gx * gx + gy * gy) || 1;
    return { dist: r * (1 - 1 / rho), nx: gx / gl, ny: gy / gl };
  } : null;
  /* One accent owns "now": the pool and full glow go to the last-declared
     visible active item; other active and bound items keep an outline. */
  var lead = null;
  items.forEach(function (it) { it.lead = false; if (it.visible && it.state === 'active') lead = it; });
  if (lead) lead.lead = true;
  /* A membrane protein (a single, non-round protein-like item resting on
     or in the membrane) gets a transmembrane barrel through the bilayer and
     a small inner domain, so pumps and channels visibly span it. */
  items.forEach(function (it) {
    it.span = null;
    if (!mem || !it.visible || it.cluster || it.shape === 'dot' || it.shape === 'spiky' || it.shape === 'lobes' || ['protein', 'enzyme', 'cap', 'polymerase'].indexOf(it.role) < 0) return;
    var mi = mem(it.x, it.y);
    if (mi.dist < -4 || mi.dist - it.h / 2 > 8 || mi.dist > 40) return;
    var len = mechNum(Math.max(mi.dist + 12, it.h / 2 + 7)), bw = mechNum(Math.min(Math.max(it.w * 0.56, 7), 24));
    it.span = { len: len, w: bw, angle: mechNum((Math.atan2(-mi.ny, -mi.nx) * 180) / Math.PI - 90), nx: mechNum(-mi.nx * 1000) / 1000, ny: mechNum(-mi.ny * 1000) / 1000 };
  });
  var zoom = null, zc = typeof state.zoom === 'string' ? byId[state.zoom] : null;
  if (zc && zc.kind !== 'outside') {
    var bx, by, bw, bh;
    if (zc === cell && divided) { bx = daughters[0].x - daughters[0].rx; bw = daughters[1].x + daughters[1].rx - bx; by = cell.y - daughters[0].ry; bh = daughters[0].ry * 2; }
    else { var g = geom[zc.id]; bx = g.x - g.rx; by = g.y - g.ry; bw = g.rx * 2; bh = g.ry * 2; }
    var mw = Math.max(bw * 1.24, 40), mh = Math.max(bh * 1.24, 30), s = Math.round(Math.min(MECH_SCENE.w / mw, MECH_SCENE.h / mh, 6) * 100) / 100;
    zoom = { id: zc.id, label: zc.label, scale: s, tx: mechNum(MECH_SCENE.w / 2 - (bx + bw / 2) * s), ty: mechNum(MECH_SCENE.h / 2 - (by + bh / 2) * s) };
  }
  var hc = typeof state.highlight === 'string' ? byId[state.highlight] : null, highlight = null;
  if (hc && hc.kind !== 'outside') {
    var hg = geom[hc.id];
    highlight = hc === cell && divided ? daughters.map(function (d) { return { x: d.x, y: d.y, rx: d.rx + 6, ry: d.ry + 6 }; }) :
      [{ x: hg.x, y: hg.y, rx: (hc.kind === 'region' ? hg.rx : hg.rx + 6), ry: (hc.kind === 'region' ? hg.ry : hg.ry + 6) }];
  }
  var labels = (Array.isArray(state.labels) ? state.labels : []).slice(0, CELLSCENE_MAX_LABELS).map(function (l) {
    if (!panelObject(l) || typeof l.text !== 'string') return null;
    if (typeof l.at === 'string') {
      if (itemById[l.at]) return { x: itemById[l.at].x, y: mechNum(itemById[l.at].y - itemById[l.at].reach - 14), text: l.text };
      if (byId[l.at]) { var la = geom[l.at]; return { x: la.x, y: mechNum(la.y - la.ry - 14), text: l.text }; }
      return null;
    }
    var p = mechXY(l.at);
    return p ? { x: p.x, y: p.y, text: l.text } : null;
  }).filter(Boolean);
  /* Label placement (pure presentation): each label keeps its usual spot
     unless that spot overlaps a body, another label, a callout or the
     bilayer; then it tries the next candidate, else keeps the first. A
     label is anchored at a body edge (`ex`, `ey`, scene units) plus a gap
     (`gx`, `gy`) that counter-scales with the text, so labels hug their
     items when the camera zooms. Boxes are estimates: 10 px caps, about 7
     units a character, with a margin. */
  var taken = [{ x1: 0, y1: 0, x2: MECH_SCENE.w, y2: 41 }];
  labels.forEach(function (l) { var w = l.text.length * 6.4 + 14; taken.push({ x1: l.x - w / 2, y1: l.y - 10, x2: l.x + w / 2, y2: l.y + 9 }); });
  comps.forEach(function (c) {
    var g = geom[c.id];
    if ((c.kind === 'organelle' || c.kind === 'vesicle' || c.kind === 'nucleus') && !(divided && c.kind === 'nucleus'))
      taken.push({ x1: g.x - g.rx, y1: g.y - g.ry, x2: g.x + g.rx, y2: g.y + g.ry, comp: c.id });
  });
  items.forEach(function (it) {
    if (!it.visible) return;
    var hw = it.cluster ? it.reach : it.w / 2, hh = it.cluster ? it.reach * 0.82 : it.h / 2;
    taken.push({ x1: it.x - hw, y1: it.y - hh, x2: it.x + hw, y2: it.y + hh, item: it.id });
  });
  function textBox(x, y, text, anchorMode) {
    var w = String(text || '').length * 7 + 4, x1 = anchorMode === 'start' ? x - 2 : anchorMode === 'end' ? x - w + 2 : x - w / 2;
    return { x1: x1, y1: y - 11, x2: x1 + w, y2: y + 4 };
  }
  function hits(box, skip) {
    return taken.filter(function (t) { return (!skip || (t.item !== skip && t.comp !== skip)) && box.x1 < t.x2 && box.x2 > t.x1 && box.y1 < t.y2 && box.y2 > t.y1; }).length;
  }
  /* How badly a box sits on the bilayer: sample points inside its band,
     plus one when the box straddles it. */
  function onMembrane(box) {
    if (!mem) return 0;
    var pts = [[box.x1, box.y1], [box.x2, box.y1], [box.x1, box.y2], [box.x2, box.y2], [(box.x1 + box.x2) / 2, box.y1], [(box.x1 + box.x2) / 2, box.y2]];
    var inside = 0, near = 0;
    for (var i = 0; i < pts.length; i++) { var d = mem(pts[i][0], pts[i][1]).dist; if (Math.abs(d) < 6) near++; if (d < 0) inside++; }
    return near + (inside > 0 && inside < pts.length ? 1 : 0);
  }
  function cost(box, skip) { return hits(box, skip) * 3 + onMembrane(box) * 4; }
  /* The first candidate with the lowest cost (a free spot costs 0). */
  function best(cands, boxOf, skip) {
    var pick = cands[0], low = Infinity;
    cands.forEach(function (c) { var k = cost(boxOf(c), skip); if (k < low) { low = k; pick = c; } });
    return pick;
  }
  /* Steps a label point inward (toward the cell centre) until its box
     clears the bilayer; the original point when that never happens. */
  function inward(x, y, text) {
    if (!mem) return { x: x, y: y };
    for (var k = 0, px = x, py = y; k < 6; k++) {
      if (!onMembrane(textBox(px, py, text))) return { x: mechNum(px), y: mechNum(py) };
      var mi = mem(px, py); px -= mi.nx * 7; py -= mi.ny * 7;
    }
    return { x: x, y: y };
  }
  var compLabels = Object.create(null);
  function placeComp(c, cands) {
    var pick = best(cands, function (pt) { return textBox(pt.x, pt.y, c.label); }, c.id);
    compLabels[c.id] = { x: mechNum(pick.x), y: mechNum(pick.y) };
    taken.push(textBox(pick.x, pick.y, c.label));
  }
  comps.forEach(function (c) {
    var g = geom[c.id];
    if (c.kind === 'cell' && !divided) placeComp(c, [{ x: c.x, y: c.y - c.ry + 28 }, { x: c.x, y: c.y - c.ry + 21 }, { x: c.x, y: c.y + c.ry - 20 }]);
    else if (c.kind === 'region' && !divided) placeComp(c, [inward(g.x, g.y - 26, c.label)]);
    else if (c.kind === 'nucleus' && !divided) placeComp(c, [{ x: g.x, y: g.y + g.rx + 16 }, { x: g.x, y: g.y - g.rx - 8 }, { x: g.x, y: g.y + g.rx - 12 }]);
    else if (c.kind === 'organelle' || c.kind === 'vesicle') placeComp(c, [{ x: g.x, y: g.y + g.ry + 14 }, { x: g.x, y: g.y - g.ry - 8 }, inward(g.x, g.y + g.ry + 14, c.label)]);
  });
  items.forEach(function (it) {
    var hh = it.cluster ? it.reach * 0.82 : it.h / 2;
    it.lab = { ex: 0, ey: it.reach, gx: 0, gy: 13 };
    if (!it.visible || !it.label) return;
    var cands = [];
    if (it.span) cands.push({ ex: mechNum(it.span.nx * it.span.len), ey: mechNum(it.span.ny * it.span.len), gx: mechNum(it.span.nx * 14), gy: mechNum(it.span.ny * 14 + 3.5) });
    var hw = it.cluster ? it.reach : it.w / 2;
    cands.push({ ex: 0, ey: it.reach, gx: 0, gy: 13 }, { ex: 0, ey: mechNum(-hh), gx: 0, gy: -7 },
      { ex: mechNum(hw), ey: 0, gx: 6, gy: 3.5, a: 'start' }, { ex: mechNum(-hw), ey: 0, gx: -6, gy: 3.5, a: 'end' });
    it.lab = best(cands, function (c) { return textBox(it.x + c.ex + c.gx, it.y + c.ey + c.gy, it.label, c.a); }, it.id);
    taken.push(textBox(it.x + it.lab.ex + it.lab.gx, it.y + it.lab.ey + it.lab.gy, it.label, it.lab.a));
  });
  vesicleList.forEach(function (v) {
    var cands = [{ ex: 0, ey: -v.r, gx: 0, gy: -5, a: 'middle' }, { ex: -v.r, ey: 0, gx: -6, gy: 3.5, a: 'end' }, { ex: v.r, ey: 0, gx: 6, gy: 3.5, a: 'start' }, { ex: 0, ey: v.r, gx: 0, gy: 14, a: 'middle' }];
    v.lab = best(cands, function (c) { return textBox(v.x + c.ex + c.gx, v.y + c.ey + c.gy, 'vesicle', c.a); });
    taken.push(textBox(v.x + v.lab.ex + v.lab.gx, v.y + v.lab.ey + v.lab.gy, 'vesicle', v.lab.a));
  });
  function boundaryFor(id, point) {
    var c = byId[id], hops = 0;
    while (c && hops++ < CELLSCENE_MAX_COMPARTMENTS) {
      if (c === cell && divided) {
        var d = daughters[whichDaughter(point) - 1], dg = Object.create(null);
        dg[c.id] = { x: d.x, y: d.y, rx: d.rx, ry: d.ry };
        return cellsceneBoundaryPoint(c, point, dg) || point;
      }
      var b = cellsceneBoundaryPoint(c, point, geom);
      if (b) return b;
      c = c.parent ? byId[c.parent] : null;
    }
    return cell ? cellsceneBoundaryPoint(cell, point, geom) : point;
  }
  var transients = [], hasDivide = false;
  events.forEach(function (ev) {
    if (ev.kind === 'enter' && itemById[ev.item]) {
      var it = itemById[ev.item], m = boundaryFor(ev.via || ev.to, it);
      transients.push({ kind: 'cross', item: ev.item, x: m.x, y: m.y, delay: 500 });
    } else if (ev.kind === 'signal') {
      var t = itemById[ev.at] ? itemById[ev.at] : geom[ev.at];
      if (t) for (var i = 0; i < ev.rings; i++) transients.push({ kind: 'signal', x: t.x, y: t.y, delay: i * 250 });
    } else if (ev.kind === 'bud') {
      var v = vesicleList.filter(function (ves) { return ves.id === ev.vesicle; })[0];
      if (v) transients.push({ kind: 'bind', x: v.x, y: v.y, delay: 0, vesicle: v.id });
    } else if (ev.kind === 'fuse') {
      var fused = (Array.isArray(ev.items) ? ev.items : []).map(function (id) { return itemById[id]; }).filter(Boolean);
      var centre = fused.length ? fused[0] : anchor(ev.with), f = boundaryFor(ev.with, centre);
      transients.push({ kind: 'cross', x: f.x, y: f.y, delay: 250, vesicle: ev.vesicle });
    } else if (ev.kind === 'divide' && divided) { hasDivide = true; transients.push({ kind: 'divide', x: cell.x, y: cell.y }); }
  });
  var legend = items.filter(function (it) { return decl.legendMode !== 'visible' || it.visible; }).map(function (it) {
    var text = !it.visible ? (it.state === 'hidden' ? 'hidden' : 'none') :
      (it.count >= 2 ? '×' + it.count + ' · ' : '') + it.inLabel + (it.state !== 'free' ? ' · ' + it.state : '');
    return { id: it.id, role: it.role, name: it.label || it.id, state: text, hot: it.visible && (it.state === 'bound' || it.state === 'active') };
  });
  if (nucleus) legend.push({ id: 'nucleus', role: 'nucleus', name: nucleus.label, state: divided ? '×2' : '', hot: false });
  if (cell) legend.push({ id: 'cell', role: 'membrane', name: cell.label === 'membrane' ? 'cell' : cell.label, state: divided ? (hasDivide ? '1 → 2' : '2') : '1', hot: hasDivide });
  var aria = (cell ? 'Cell' + (nucleus ? ' with nucleus' : '') : 'Scene') + '; ' + items.filter(function (it) { return it.visible; }).map(function (it) {
    var where = it.in && it.in.indexOf('vesicle:') === 0 ? 'in a vesicle' : byId[it.in] && byId[it.in].kind === 'outside' ? it.inLabel : 'in the ' + it.inLabel;
    return (it.label || it.id) + (it.count >= 2 ? ', ' + it.count + ',' : '') + ' ' + where + (it.state !== 'free' ? ' (' + it.state + ')' : '');
  }).join('; ') + (cell ? '; ' + (divided ? 'two daughter cells' + (nucleus ? ', each with a nucleus' : '') : 'one cell') : '');
  return {
    scene: MECH_SCENE, title: decl.label || 'cell scene', caption: mechText(state.caption, 90), compartments: comps, geom: geom, cell: cell, nucleus: nucleus,
    divided: divided, daughters: daughters, items: items, vesicles: vesicleList, zoom: zoom, highlight: highlight, labels: labels, readableLabels: decl.labelMode === 'readable',
    transients: transients, legend: legend, aria: aria, hasDivide: hasDivide, uid: mechUid(panel), compLabels: compLabels,
  };
}

/* ---- markup ---- */
/* Labels sit in a `.cellscene-fit` group that counter-scales under zoom, so
   text keeps its authored size while the scene is enlarged. */
function cellsceneFit(x, y, inner) {
  return '<g transform="translate(' + mechNum(x) + ' ' + mechNum(y) + ')"><g class="cellscene-fit">' + inner + '</g></g>';
}
function cellsceneLabelText(x, y, text, anchorMode) {
  if (!text) return '';
  return cellsceneFit(x, y, '<text class="mech-t-label" x="0" y="0" text-anchor="' + (anchorMode || 'middle') + '" aria-hidden="true">' + esc(text) + '</text>');
}
/* A label anchored at a body edge (scene units) with a gap that scales
   with the text, so it hugs its body under zoom. */
function cellsceneLabelAt(lab, text, anchorMode) {
  if (!text) return '';
  return cellsceneFit(lab.ex, lab.ey, '<text class="mech-t-label" x="' + mechNum(lab.gx) + '" y="' + mechNum(lab.gy) + '" text-anchor="' + (anchorMode || 'middle') + '" aria-hidden="true">' + esc(text) + '</text>');
}
function cellsceneMoveGroup(cls, id, x, y, inner, style) {
  return '<g class="mech-move ' + cls + '" data-id="' + esc(id) + '"' + (style || '') + '><g transform="translate(' + mechNum(x) + ' ' + mechNum(y) + ')">' + inner + '</g></g>';
}
function cellsceneItemBody(it, labelPosition) {
  var role = MECH_ROLES[it.role], h = '';
  /* The lead active item stands in a soft accent pool, so "now" reads even
     when the scene is small; no other item gets one. */
  if (it.lead)
    h += '<ellipse class="cellscene-pool cellscene-pool-active" rx="' + mechNum(it.reach + 6) + '" ry="' + mechNum((it.cluster ? it.reach * 0.82 : it.h / 2) + 6) + '" aria-hidden="true"/>';
  h += '<g class="cellscene-body" style="--mf:' + role.fill + ';--me:' + role.edge + '">';
  /* A membrane protein's transmembrane barrel and inner domain sit behind
     its body, pointing into the cell. */
  if (it.span) {
    /* a clamp's barrel starts at its open mouth, leaving the ring clear */
    var sp = it.span, r = mechNum(sp.w / 2), y0 = it.shape === 'clamp' ? mechNum(it.h / 2 - 6) : 0, d = 'M' + mechNum(-r) + ',' + y0 + 'V' + mechNum(sp.len - r) + 'A' + r + ',' + r + ' 0 0 0 ' + r + ',' + mechNum(sp.len - r) + 'V' + y0 + 'Z';
    h += '<g class="cellscene-span" transform="rotate(' + sp.angle + ')" aria-hidden="true"><path class="cellscene-barrel" d="' + d + '"/>' + cellsceneClay(d, true) + '</g>';
  }
  if (it.cluster) {
    it.cluster.forEach(function (o) {
      h += '<circle class="cellscene-dot" cx="' + o.dx + '" cy="' + o.dy + '" r="' + it.dotR + '" fill="' + role.fill + '" stroke="' + role.edge + '"/>' +
        '<circle class="cellscene-dot-hi" cx="' + o.dx + '" cy="' + o.dy + '" r="' + it.dotR + '"/>';
    });
    if (it.count > 30) h += cellsceneFit(0, -it.reach - 12, mechTagMarkup(0, 0, '×' + it.count, 'cellscene-count'));
  } else h += mechActorMarkup({ role: it.role, shape: it.shape, size: it.size, label: '' });
  h += '</g>';
  if (it.label) h += labelPosition
    ? cellsceneLabelText(labelPosition.x, labelPosition.y, it.label)
    : cellsceneLabelAt(it.lab || { ex: 0, ey: it.reach, gx: 0, gy: 13 }, it.label, it.lab && it.lab.a);
  return h;
}
/* Readable labels can be wider than the items they describe. Keep their
   authored item positions and nudge a label sideways when a small move gives
   adjacent names room. If it cannot, use the next text row. This is pure
   scene geometry so seek and motion render the same settled positions. */
function cellsceneItemLabelPositions(model) {
  var result = Object.create(null), boxes = [], font = (model.readableLabels ? 18 : 10) / (model.zoom ? model.zoom.scale : 1);
  model.items.filter(function (it) { return it.visible && it.label; }).forEach(function (it) {
    var width = it.label.length * font * 0.62, x = it.x;
    var y = it.y + (model.readableLabels ? Math.max(it.reach + 13, it.h / 2 + font + 4) : it.reach + 13);
    var left = x - width / 2, right = x + width / 2;
    if (model.readableLabels) {
      for (var tries = 0; tries < 4; tries++) {
        var collision = boxes.filter(function (box) {
          return left < box.right + 8 && right > box.left - 8 && Math.abs(y - box.y) < font + 4;
        });
        if (!collision.length) break;
        if (collision.length === 1) {
          var other = collision[0], direction = x >= (other.left + other.right) / 2 ? 1 : -1;
          var nudge = direction > 0 ? other.right + 8 - left : right - (other.left - 8);
          var nextLeft = left + direction * nudge, nextRight = right + direction * nudge;
          if (nudge > 0 && nudge <= font && nextLeft >= 8 && nextRight <= MECH_SCENE.w - 8 &&
            !boxes.some(function (box) { return nextLeft < box.right + 8 && nextRight > box.left - 8 && Math.abs(y - box.y) < font + 4; })) {
            x += direction * nudge; left = nextLeft; right = nextRight;
            break;
          }
        }
        y = Math.max.apply(null, collision.map(function (box) { return box.y + font + 10; }));
      }
    }
    result[it.id] = { x: mechNum(x - it.x), y: mechNum(y - it.y) };
    boxes.push({ left: left, right: right, y: y });
  });
  return result;
}
/* ---- illustration (pure decoration; it carries no meaning) ---- */
/* Nucleus: a double envelope broken by pores, a nucleolus and a few faint
   chromatin threads. `gap` is the envelope spacing; `busy` (authored items
   inside) leaves the interior to them and keeps only the pores. */
function cellsceneNucleusArt(r, gap, busy) {
  var f = mechNum, pores = '', chrom = '';
  for (var i = 0; i < 12; i++) {
    var a = (i * Math.PI) / 6 + 0.2, c = Math.cos(a), s = Math.sin(a);
    pores += 'M' + f((r - gap - 1) * c) + ',' + f((r - gap - 1) * s) + 'L' + f((r + 1) * c) + ',' + f((r + 1) * s);
  }
  [[-0.55, 0.3, 0.05, 0.62, 0.48, 0.28], [0.1, -0.58, 0.55, -0.12, 0.3, 0.42], [-0.62, -0.18, -0.2, 0.1, -0.38, 0.5]].forEach(function (q) {
    chrom += 'M' + f(q[0] * r) + ',' + f(q[1] * r) + ' Q' + f(q[2] * r) + ',' + f(q[3] * r) + ' ' + f(q[4] * r) + ',' + f(q[5] * r);
  });
  return '<circle class="cellscene-nuc" r="' + f(r) + '"/>' + cellsceneClay(cellsceneEllipseD(r, r)) + '<circle class="cellscene-nuc-env" r="' + f(r - gap) + '"/>' +
    (r > 14 ? (busy ? '' : '<path class="cellscene-chromatin" d="' + chrom + '" aria-hidden="true"/>') + '<path class="cellscene-pores" d="' + pores + '" aria-hidden="true"/>' +
      (busy ? '' : '<circle class="cellscene-nucleolus" cx="' + f(-r * 0.46) + '" cy="' + f(r * 0.4) + '" r="' + f(r * 0.17) + '"/>') : '');
}
/* An organelle drawn by what its label names (Golgi, rough/smooth ER,
   mitochondrion, chloroplast, glycogen); null keeps the plain ellipse. */
function cellsceneOrganelleArt(label, rx, ry) {
  var name = String(label || '').toLowerCase(), f = mechNum;
  if (rx < 12 || ry < 10) return null;
  function tube(d, cls) { return '<path class="cellscene-tube-edge ' + cls + '" d="' + d + '"/><path class="cellscene-tube ' + cls + '" d="' + d + '"/><path class="cellscene-tube-clay ' + cls + '" d="' + d + '"/>'; }
  if (/golgi/.test(name)) {
    var gd = '', ends = '', n = 4;
    for (var i = 0; i < n; i++) {
      var y = (-0.55 + (1.1 * i) / (n - 1)) * ry, hw = rx * (0.8 - 0.08 * Math.abs(i - 1.5)), c = ry * 0.26;
      gd += 'M' + f(-hw) + ',' + f(y + c * 0.55) + ' Q0,' + f(y - c) + ' ' + f(hw) + ',' + f(y + c * 0.55);
      if (i % 2 === 0) ends += '<circle class="cellscene-bleb" cx="' + f(hw + 4.5) + '" cy="' + f(y + c * 0.9) + '" r="2.4"/>';
      else ends += '<circle class="cellscene-bleb" cx="' + f(-hw - 4.5) + '" cy="' + f(y + c * 0.9) + '" r="2"/>';
    }
    return { kind: 'golgi', markup: tube(gd, 'cellscene-cis') + ends };
  }
  if (/\b(rough |smooth )?er\b|endoplasm|reticul/.test(name)) {
    /* One ribbon folded back and forth into three sheets; a rough ER is
       studded with ribosomes along both faces. */
    var vertical = ry >= rx, len = vertical ? ry : rx, wid = vertical ? rx : ry, sheets = 3, ed = '', dots = '', rough = !/smooth/.test(name);
    var span = 0.74 * len, steps = 14;
    function at(along, across) { return vertical ? f(across) + ',' + f(along) : f(along) + ',' + f(across); }
    for (var j = 0; j < sheets; j++) {
      var off = (-0.52 + (1.04 * j) / (sheets - 1)) * wid, amp = wid * 0.07, down = j % 2 === 0;
      for (var k = 0; k <= steps; k++) {
        var t = down ? k / steps : 1 - k / steps, along = -span + 2 * span * t, across = off + amp * Math.sin(t * Math.PI * 2.2 + j * 1.3);
        if (j === 0 && k === 0) ed += 'M' + at(along, across);
        else if (k === 0) {
          var prevOff = (-0.52 + (1.04 * (j - 1)) / (sheets - 1)) * wid, turn = (down ? -1 : 1) * (span + wid * 0.2);
          ed += ' C' + at(turn, prevOff) + ' ' + at(turn, off) + ' ' + at(along, across);
        } else ed += ' L' + at(along, across);
        if (rough && k % 2 === 1 && k < steps) { dots += 'M' + at(along, across - 4.6) + 'h0'; dots += 'M' + at(along, across + 4.6) + 'h0'; }
      }
    }
    return { kind: 'er', markup: tube(ed, 'cellscene-er') + (dots ? '<path class="cellscene-ribo-dots" d="' + dots + '"/>' : '') };
  }
  if (/mitochond/.test(name)) {
    var cd = '', folds = Math.max(3, Math.round(rx / 13));
    for (var m = 0; m < folds; m++) {
      var x = (-0.6 + (1.2 * m) / (folds - 1)) * rx, top = m % 2 === 0, edge = ry * 0.6 * Math.sqrt(Math.max(0, 1 - (x / (rx * 0.8)) * (x / (rx * 0.8))));
      cd += 'M' + f(x) + ',' + f(top ? -edge : edge) + 'L' + f(x) + ',' + f(top ? ry * 0.12 : -ry * 0.12);
    }
    return { kind: 'mito', markup: '<ellipse class="cellscene-org-inner" rx="' + f(rx * 0.8) + '" ry="' + f(ry * 0.66) + '"/>' + tube(cd, 'cellscene-cristae') };
  }
  if (/chloroplast/.test(name)) {
    /* Grana stand to either side of the centre, where items sit. */
    var spots = rx >= 50 ? [-0.62, -0.36, 0.36, 0.62] : [-0.5, 0.5], grana = '', lam = '', cw = f(Math.min(14, rx * 0.2));
    for (var q = 0; q < spots.length; q++) {
      var sx = spots[q] * rx, sy = (q % 2 ? 0.1 : -0.08) * ry;
      lam += (q ? 'L' : 'M') + f(sx) + ',' + f(sy);
      for (var z = 0; z < 4; z++) grana += '<rect class="cellscene-granum" x="' + f(sx - cw / 2) + '" y="' + f(sy - 8.5 + z * 4.3) + '" width="' + cw + '" height="3.4" rx="1.7"/>';
    }
    return { kind: 'chloro', markup: '<ellipse class="cellscene-org-inner" rx="' + f(rx * 0.84) + '" ry="' + f(ry * 0.7) + '"/><path class="cellscene-lamella" d="' + lam + '"/>' + grana };
  }
  if (/glycogen|granule/.test(name)) {
    var groups = rx > ry * 1.8 ? [-0.45, 0.45] : [0], gr = '', ringR = Math.min(rx, ry) * 0.5, dotR = f(Math.min(rx, ry) * 0.27);
    groups.forEach(function (gx) {
      for (var w = 0; w < 7; w++) {
        var a = (w * Math.PI) / 3, rr = w === 6 ? 0 : ringR;
        gr += '<circle class="cellscene-granule" cx="' + f(gx * rx + rr * Math.cos(a)) + '" cy="' + f(rr * Math.sin(a)) + '" r="' + dotR + '"/>';
      }
    });
    return { kind: 'glyco', markup: gr };
  }
  return null;
}
/* A membrane as a phospholipid bilayer around one outline `d` (the
   bilayer's mid-line): head beads on both faces, a core band and fine
   paired tails. Every stroke is zoom-compensated in CSS, so the bilayer
   keeps its drawn thickness when the camera zooms. */
function cellsceneBilayer(fillD, midD) {
  return '<path class="cellscene-cell" d="' + fillD + '"/><path class="cellscene-cell-rim" d="' + midD + '"/>' +
    '<path class="cellscene-cell-in" d="' + midD + '"/><path class="cellscene-cell-tails" d="' + midD + '" aria-hidden="true"/>';
}
/* The shared soft-clay overlay (round "ball" light unless `flat`), tagged
   so cellscene can tune its strength per part. */
function cellsceneClay(d, flat) {
  return '<path class="mech-clay' + (flat ? '' : ' mech-ball') + ' cellscene-clay" d="' + d + '" aria-hidden="true"/>';
}
function cellsceneEllipseD(rx, ry) {
  var f = mechNum;
  return 'M' + f(-rx) + ',0A' + f(rx) + ',' + f(ry) + ' 0 1,0 ' + f(rx) + ',0A' + f(rx) + ',' + f(ry) + ' 0 1,0 ' + f(-rx) + ',0Z';
}
/* Builds the scene once per render. `motion` adds glide styles, crossing
   keyframe variables and transients; the baseline omits them. */
function cellsceneParts(model, prev, motion) {
  var m = model, scene = '', byDaughter = m.daughters;
  function nucleusBusy(daughter) {
    return !!m.nucleus && m.items.some(function (it) { return it.visible && it.in === m.nucleus.id && (daughter === null || it.daughter === daughter); });
  }
  m.compartments.forEach(function (c) {
    var g = m.geom[c.id];
    if (c.kind === 'outside') return;
    if (c.kind === 'cell') {
      if (m.divided) {
        byDaughter.forEach(function (d) {
          var from = motion && prev ? (prev.daughters && prev.daughters[d.index]) || prev.cell : null;
          scene += cellsceneMoveGroup('cellscene-daughter', 'daughter:' + d.index, d.x, d.y,
            cellsceneBilayer(cellsceneEllipseD(d.rx, d.ry), cellsceneEllipseD(Math.max(1, d.rx - 3), Math.max(1, d.ry - 3))) + cellsceneLabelText(0, d.ry + 16, 'daughter ' + d.index), mechGlideStyle(from, d));
        });
      } else scene += cellsceneBilayer(mechCellOutline(c.x, c.y, c.rx, c.ry, 0), mechCellOutline(c.x, c.y, Math.max(1, c.rx - 3), Math.max(1, c.ry - 3), 0)) +
        (function (ly) {
          /* anchored at the membrane's top or bottom so it stays put under zoom */
          var edge = ly < c.y ? c.y - c.ry : c.y + c.ry;
          return cellsceneLabelAt({ ex: c.x, ey: edge, gx: 0, gy: mechNum(ly - edge) }, c.label);
        })(m.compLabels[c.id] ? m.compLabels[c.id].y : c.y - c.ry + 28);
      return;
    }
    if (c.kind === 'nucleus') {
      if (m.divided) {
        byDaughter.forEach(function (d) {
          var n = d.nucleus, from = motion && prev ? (prev.nuclei && prev.nuclei[d.index]) || prev.nucleus : null;
          scene += cellsceneMoveGroup('cellscene-nucleus', 'nucleus:' + d.index, n.x, n.y,
            cellsceneNucleusArt(n.r, 5, nucleusBusy(d.index)), mechGlideStyle(from, n));
        });
      } else scene += cellsceneMoveGroup('cellscene-nucleus', 'nucleus', g.x, g.y,
        cellsceneNucleusArt(g.rx, 6, nucleusBusy(null)) + cellsceneLabelText(m.compLabels[c.id] ? mechNum(m.compLabels[c.id].x - g.x) : 0, m.compLabels[c.id] ? mechNum(m.compLabels[c.id].y - g.y) : g.rx + 16, c.label), '');
      return;
    }
    if (c.kind === 'region') { if (!m.divided) { var rl = m.compLabels[c.id] || { x: g.x, y: g.y - 26 }; scene += cellsceneLabelText(rl.x, rl.y, c.label); } return; }
    var from = motion && prev && prev.comps ? prev.comps[c.id] : null;
    var art = c.kind === 'organelle' ? cellsceneOrganelleArt(c.label, g.rx, g.ry) : null;
    scene += cellsceneMoveGroup('cellscene-comp' + (art ? ' cellscene-org-' + art.kind : ''), c.id, g.x, g.y,
      '<ellipse class="' + (c.kind === 'vesicle' ? 'cellscene-ves' : 'cellscene-org') + '" rx="' + g.rx + '" ry="' + g.ry + '"/>' +
      (c.kind === 'organelle' && (!art || art.kind === 'mito' || art.kind === 'chloro') ? cellsceneClay(cellsceneEllipseD(g.rx, g.ry)) : '') +
      (art ? art.markup : c.kind === 'organelle' && g.rx > 10 && g.ry > 10 ? '<ellipse class="cellscene-org-in" rx="' + mechNum(g.rx * 0.68) + '" ry="' + mechNum(g.ry * 0.62) + '"/>' : '') +
      cellsceneLabelText(m.compLabels[c.id] ? mechNum(m.compLabels[c.id].x - g.x) : 0, m.compLabels[c.id] ? mechNum(m.compLabels[c.id].y - g.y) : g.ry + 14, c.label), mechGlideStyle(from, g));
  });
  /* Highlight sits above compartment fills but below item shapes and names.
     Keep it separate from the scene identity so highlight-only steps patch. */
  var backdrop = scene, highlight = '';
  if (m.highlight) m.highlight.forEach(function (h) {
    highlight += '<ellipse class="cellscene-hl" cx="' + h.x + '" cy="' + h.y + '" rx="' + h.rx + '" ry="' + h.ry + '"/>';
  });
  scene = '';
  m.vesicles.forEach(function (v) {
    var from = motion && prev && prev.vesicles ? prev.vesicles[v.id] : null, fresh = motion && (!prev || !prev.vesicles || !prev.vesicles[v.id]);
    scene += cellsceneMoveGroup('cellscene-vesicle' + (fresh ? ' cellscene-appear' : ''), 'vesicle:' + v.id, v.x, v.y,
      '<circle class="cellscene-ves-ko" r="' + mechNum(v.r + 1.5) + '" aria-hidden="true"/><circle class="cellscene-ves" r="' + v.r + '"/>' + cellsceneClay(cellsceneEllipseD(v.r, v.r)) +
      cellsceneLabelAt(v.lab || { ex: 0, ey: -v.r, gx: 0, gy: -7 }, 'vesicle', v.lab ? v.lab.a : 'middle'), mechGlideStyle(from, v));
  });
  var crossing = Object.create(null);
  m.transients.forEach(function (t) { if (t.kind === 'cross' && t.item) crossing[t.item] = t; });
  var itemLabelPositions = m.readableLabels ? cellsceneItemLabelPositions(m) : null;
  m.items.forEach(function (it) {
    if (!it.visible) return;
    var from = motion && prev && prev.items ? prev.items[it.id] : null, cls = 'cellscene-item cellscene-role-' + it.role + ' cellscene-st-' + it.state + (it.lead ? ' cellscene-lead' : ''), style = '';
    if (motion && crossing[it.id]) {
      var c = crossing[it.id], start = from || c;
      cls += ' cellscene-crossing';
      style = ' style="--cs-x0:' + mechNum(start.x - it.x) + 'px;--cs-y0:' + mechNum(start.y - it.y) + 'px;--cs-x1:' + mechNum(c.x - it.x) + 'px;--cs-y1:' + mechNum(c.y - it.y) + 'px"';
    } else style = mechGlideStyle(from, it);
    if (motion && !from && !crossing[it.id] && prev) cls += ' cellscene-appear';
    scene += cellsceneMoveGroup(cls, it.id, it.x, it.y, cellsceneItemBody(it, itemLabelPositions && itemLabelPositions[it.id]), style);
  });
  if (motion) m.transients.forEach(function (t) {
    if (t.kind === 'divide') {
      var c = m.cell;
      var midFrom = mechCellOutline(c.x, c.y, Math.max(1, c.rx - 3), Math.max(1, c.ry - 3), 0), midTo = mechCellOutline(c.x, c.y, Math.max(1, c.rx - 3), Math.max(1, c.ry - 3), 1);
      var morph = function (cls, a, b) { return '<path class="' + cls + '" d="' + a + '"><animate attributeName="d" dur="1.1s" fill="freeze" calcMode="spline" keySplines="0.4 0 0.2 1" values="' + a + ';' + b + '"/></path>'; };
      scene += '<g class="mech-transient cellscene-parent" aria-hidden="true">' + morph('cellscene-cell', mechCellOutline(c.x, c.y, c.rx, c.ry, 0), mechCellOutline(c.x, c.y, c.rx, c.ry, 1)) +
        morph('cellscene-cell-rim', midFrom, midTo) + morph('cellscene-cell-in', midFrom, midTo) + '</g>';
    } else {
      /* a fusing vesicle glides onto the membrane and flattens into it */
      var was = t.vesicle && prev && prev.vesicles ? prev.vesicles[t.vesicle] : null;
      if (was && isFiniteNum(was.r)) scene += '<g class="mech-transient cellscene-fusing" style="--fx0:' + mechNum(was.x - t.x) + 'px;--fy0:' + mechNum(was.y - t.y) + 'px" aria-hidden="true">' +
        '<circle class="cellscene-ves" cx="' + mechNum(t.x) + '" cy="' + mechNum(t.y) + '" r="' + was.r + '"/></g>';
      scene += mechRipple(t.x, t.y, t.kind, t.delay);
    }
  });
  var overlay = '';
  m.labels.forEach(function (l) { overlay += cellsceneFit(l.x, l.y, mechTagMarkup(0, 0, l.text, 'cellscene-callout')); });
  var hud = cellsceneLabelText(14, 20, m.title + ' · zoom: ' + (m.zoom ? m.zoom.label : 'whole scene'), 'start');
  if (m.caption && !m.readableLabels) hud += '<text class="cellscene-t-cap" x="14" y="37">' + esc(m.caption) + '</text>';
  var outside = m.compartments.filter(function (c) { return c.kind === 'outside'; })[0];
  if (outside) hud += cellsceneLabelText(546, 300, outside.label, 'end');
  var zs = m.zoom ? m.zoom.scale : 1;
  var viewStyle = 'transform:translate(' + (m.zoom ? m.zoom.tx : 0) + 'px,' + (m.zoom ? m.zoom.ty : 0) + 'px) scale(' + zs + ');--cs-zoom:' + zs;
  var legend = '<ul class="mech-legend" aria-label="Scene legend">' + m.legend.map(function (chip) {
    var role = MECH_ROLES[chip.role] || MECH_ROLES.protein;
    return '<li class="mech-chip" data-id="' + esc(chip.id) + '"><i class="mech-sw' + (chip.role === 'vesicle' ? ' mech-sw-dashed' : '') + (chip.role === 'membrane' || chip.role === 'nucleus' ? ' cellscene-sw-' + chip.role : '') + '" style="--mf:' + role.fill + ';--me:' + role.edge + '" aria-hidden="true"></i>' +
      esc(chip.name) + (chip.state ? ' <small class="mech-st' + (chip.hot ? ' hot' : '') + '">' + esc(chip.state) + '</small>' : '') + '</li>';
  }).join('') + '</ul>';
  return { scene: backdrop + '<g class="cellscene-highlight">' + highlight + '</g>' + scene,
    sceneCore: backdrop + scene, highlight: highlight, overlay: overlay, hud: hud, viewStyle: viewStyle, legend: legend };
}
function cellsceneAssemble(parts, model, state) {
  var grid = '';
  for (var gx = 20; gx < MECH_SCENE.w; gx += 40) grid += '<line class="cellscene-grid" x1="' + gx + '" y1="0" x2="' + gx + '" y2="' + MECH_SCENE.h + '"/>';
  var svg = '<div class="cellscene-stage"><svg class="mech-frame cellscene-frame" viewBox="0 0 ' + MECH_SCENE.w + ' ' + MECH_SCENE.h + '" role="img" aria-label="' + esc(model.aria) + '" style="' + mechDefsStyle(model.uid) + '">' +
    mechDefsMarkup(model.uid) + grid + '<g class="cellscene-view" style="' + parts.viewStyle + '"><g class="cellscene-scene">' + parts.scene + '</g><g class="cellscene-overlay">' + parts.overlay + '</g></g>' +
    '<g class="cellscene-hud">' + parts.hud + '</g></svg></div>';
  return '<div class="swpanel cellscene' + (model.readableLabels ? ' cellscene-readable' : '') + '">' + svg + '<div class="cellscene-foot">' + cellsceneFoot(parts, model, state) + '</div></div>';
}
function cellsceneFoot(parts, model, state) {
  return (model.readableLabels && model.caption ? '<p class="cellscene-caption">' + esc(model.caption) + '</p>' : '') +
    parts.legend + (state.note ? '<div class="swnote">' + esc(String(state.note)) + '</div>' : '');
}
function cellsceneHTML(panel, state, model) {
  state = panelObject(state) ? state : {};
  model = model || cellsceneModel(panel, state);
  return cellsceneAssemble(cellsceneParts(model, null, false), model, state);
}
function cellsceneRender(host, panel, state, skin, states, stepIdx, animate) {
  state = panelObject(state) ? state : {};
  var model = cellsceneModel(panel, state), prev = host._mechPrev || null;
  var still = cellsceneParts(model, null, false), moving = animate ? cellsceneParts(model, prev, true) : still;
  var html = cellsceneAssemble(moving, model, state), baseline = animate ? cellsceneAssemble(still, model, state) : null;
  var hasMotion = baseline !== null && baseline !== html;
  var changed = null;
  model.legend.forEach(function (chip) {
    if (!changed && prev && prev.states && prev.states[chip.id] !== undefined && prev.states[chip.id] !== chip.state) changed = chip.id;
  });
  var next = { items: {}, vesicles: {}, comps: {}, states: {}, cell: model.cell ? { x: model.cell.x, y: model.cell.y } : null, nucleus: null, daughters: null, nuclei: null };
  model.items.forEach(function (it) { if (it.visible) next.items[it.id] = { x: it.x, y: it.y }; });
  model.vesicles.forEach(function (v) { next.vesicles[v.id] = { x: v.x, y: v.y, r: v.r }; });
  model.compartments.forEach(function (c) { if (c.kind !== 'cell' && c.kind !== 'outside') next.comps[c.id] = { x: model.geom[c.id].x, y: model.geom[c.id].y }; });
  if (model.nucleus && !model.divided) next.nucleus = { x: model.geom[model.nucleus.id].x, y: model.geom[model.nucleus.id].y };
  if (model.divided) {
    next.daughters = {}; next.nuclei = {};
    model.daughters.forEach(function (d) { next.daughters[d.index] = { x: d.x, y: d.y }; if (d.nucleus) next.nuclei[d.index] = { x: d.nucleus.x, y: d.nucleus.y }; });
  }
  model.legend.forEach(function (chip) { next.states[chip.id] = chip.state; });
  host._mechPrev = next;
  return {
    html: html,
    baseline: hasMotion ? baseline : null,
    glide: { selector: '.mech-move[style]', multiple: true },
    transient: '.mech-transient',
    pulse: { selector: '.mech-chip[data-id="' + changed + '"]', changed: !!changed },
    settle: function () {
      if (typeof host.querySelectorAll !== 'function') return;
      var live = host.querySelectorAll('.cellscene-crossing,.cellscene-appear');
      for (var i = 0; i < live.length; i++) { live[i].classList.remove('cellscene-crossing'); live[i].classList.remove('cellscene-appear'); }
    },
    /* Overlay-only changes (caption, zoom, highlight, callouts, legend text,
       note) swap the highlight, overlay, hud and foot and retarget the zoom
       transform, keeping item geometry so nothing restarts. */
    patch: function () {
      var surgical = false;
      if (host._lastHTML != null && host._csScene === still.sceneCore && !model.transients.length && typeof host.querySelector === 'function') {
        var frame = host.querySelector('.cellscene-frame'), view = host.querySelector('.cellscene-view'), highlight = host.querySelector('.cellscene-highlight'), overlay = host.querySelector('.cellscene-overlay'),
          hud = host.querySelector('.cellscene-hud'), foot = host.querySelector('.cellscene-foot');
        if (frame && view && highlight && overlay && hud && foot) {
          surgical = true;
          frame.setAttribute('aria-label', model.aria);
          if (view.getAttribute('style') !== still.viewStyle) {
            view.setAttribute('style', still.viewStyle);
            if (!animate && view.style) view.style.transition = 'none';
          }
          highlight.innerHTML = still.highlight;
          overlay.innerHTML = still.overlay;
          hud.innerHTML = still.hud;
          foot.innerHTML = cellsceneFoot(still, model, state);
        }
      }
      host._csScene = still.sceneCore;
      return surgical;
    },
  };
}

PanelRegistry.define('cellscene', {
  label: 'Cell scene', since: '0.2.0', order: 47,
  validateDeclaration: cellsceneDeclarationWarnings,
  validatePatch: function (patch, path, panel, warnings, context) {
    var candidates = context && context.contexts && context.contexts.get(patch), found = [];
    (candidates || [{ decl: context && context.decl ? context.decl : cellsceneDecl(panel), before: context && context.start ? context.start : { vesicles: {}, divided: false } }]).forEach(function (active) {
      cellscenePatchWarnings(patch, path, active, found);
    });
    Array.from(new Set(found)).forEach(function (warning) { warnings.push(warning); });
  },
  fold: cellsceneFold,
  render: cellsceneRender,
  layout: {
    canvasSizing: { mode: 'fixed-aspect', aspect: MECH_SCENE.w / MECH_SCENE.h, resizeAxis: 'width' },
    sectionSizing: { minWidth: 320, preferredWidth: 560, maxWidth: 900, aspectPolicy: 'fixed', bodyAspect: 16 / 9, grow: 1, contentSelector: '.mech-frame', ancillarySelector: '.mech-legend,.swnote' },
  },
  styles: String.raw`
.cellscene{min-width:0}
.cellscene-grid{display:none}
/* The stage wrapper is a size container (the svg is percentage-sized, so
   containment changes no layout): narrow panels counter-scale scene text
   so labels stay at 10 px or more when the viewBox shrinks. */
.cellscene-stage{container-type:inline-size}
@container (max-width:520px){.cellscene-frame{--cs-ts:1.1}}
@container (max-width:470px){.cellscene-frame{--cs-ts:1.2}}
@container (max-width:430px){.cellscene-frame{--cs-ts:1.31}}
@container (max-width:395px){.cellscene-frame{--cs-ts:1.42}}
@container (max-width:365px){.cellscene-frame{--cs-ts:1.54}}
@container (max-width:340px){.cellscene-frame{--cs-ts:1.66}}
.cellscene-view{transform-box:view-box;transform-origin:0 0;transition:transform .7s cubic-bezier(.2,.7,.2,1)}
.cellscene-fit{transform:scale(calc(var(--cs-ts,1) / var(--cs-zoom,1)))}
.cellscene-org-in,.cellscene-nuc,.cellscene-nuc-env,.cellscene-ves,.cellscene-ves-ko,.cellscene-org,.cellscene-hl,.cellscene-pool,.cellscene-chromatin,.cellscene-org-inner,.cellscene-lamella,.cellscene-granum,.cellscene-granule,.cellscene-bleb,.cellscene-barrel{vector-effect:non-scaling-stroke}
.cellscene-frame{--cs-cyto:rgba(92,184,255,.075);--cs-cyto-c:rgba(92,184,255,.03);--cs-cyto-m:rgba(92,184,255,.07);--cs-cyto-e:rgba(92,184,255,.16);--cs-mem:#7C93BC;--cs-mem-in:#6F86B0;--cs-tail:rgba(124,147,188,.2);--cs-mem-glow:drop-shadow(0 0 10px rgba(92,184,255,.16));--cs-nuc:rgba(127,155,208,.17);--cs-nuc-line:#8EA6DA;--cs-nucleolus:rgba(127,155,208,.42);--cs-chromatin:rgba(141,162,198,.3);--cs-org:rgba(110,143,199,.2);--cs-org-line:#7F9FD6;--cs-ves:rgba(138,160,194,.12);--cs-ves-line:#9AB0D2;--cs-hl:#38E1FF;--cs-pool:rgba(56,225,255,.09);--cs-pool-line:rgba(56,225,255,.42);--cs-s2:#3FD0C2;--cs-s3:#FFB454;--cs-s4:#FF7A9A;--cs-s5:#B79CFF;--cs-ribo:#7ED9A0;--cs-org-fill:22%;--cs-org-base:transparent;--cs-head:color-mix(in srgb,#FF7A9A 56%,#0E1A2E);--cs-core:color-mix(in srgb,#FF7A9A 10%,#0B1220);--cs-tailc:color-mix(in srgb,#FF7A9A 30%,#0B1220);--cs-ves-solid:#111C30}
@media screen{
body.sk-pastel .cellscene-frame,.sk-daylight .cellscene-frame,body.sk-editorial .cellscene-frame{--cs-cyto:#F7F9FE;--cs-cyto-c:#FFFFFF;--cs-cyto-m:#F5F8FC;--cs-cyto-e:#E4EBF7;--cs-head:color-mix(in srgb,#E9A07C 82%,#D3714A);--cs-core:#FBEDE5;--cs-tailc:#F4CDB8;--cs-ves-solid:color-mix(in srgb,#8C9BB5 9%,#fff);--cs-mem:#8C9DBC;--cs-mem-in:#93A4C2;--cs-tail:#E1E7F1;--cs-mem-glow:drop-shadow(0 2px 3px rgba(36,50,74,.10)) drop-shadow(0 10px 18px rgba(36,50,74,.07));--cs-nuc:#EEF1FB;--cs-nuc-line:#8E9FD6;--cs-nucleolus:#C9D0F1;--cs-chromatin:rgba(142,159,214,.45);--cs-org:#EAF0F9;--cs-org-line:#93A8CF;--cs-ves:rgba(82,99,185,.05);--cs-ves-line:#8C9BB5;--cs-hl:#5263B9;--cs-pool:rgba(82,99,185,.10);--cs-pool-line:rgba(82,99,185,.42);--cs-s2:#2FA39A;--cs-s3:#E09A3E;--cs-s4:#D9617E;--cs-s5:#8F6FE0;--cs-ribo:#4FB57A;--cs-org-fill:15%;--cs-org-base:#fff}
body.sk-pastel .cellscene-frame.cellscene-frame,.sk-daylight .cellscene-frame.cellscene-frame{--mk-halo:#F7F9FE}
body.sk-blueprint .cellscene-frame{--cs-cyto:rgba(127,227,255,.05);--cs-cyto-c:rgba(127,227,255,.02);--cs-cyto-m:rgba(127,227,255,.04);--cs-cyto-e:rgba(127,227,255,.09);--cs-mem:#7FE3FF;--cs-mem-in:#7FE3FF;--cs-tail:rgba(127,227,255,.14);--cs-mem-glow:none;--cs-nuc:rgba(127,227,255,.08);--cs-nuc-line:#7FE3FF;--cs-nucleolus:rgba(127,227,255,.22);--cs-chromatin:rgba(127,227,255,.3);--cs-org:rgba(127,227,255,.07);--cs-org-line:#7FE3FF;--cs-ves:transparent;--cs-ves-line:#94BCD5;--cs-hl:#FFD166;--cs-pool:transparent;--cs-pool-line:rgba(127,227,255,.75);--cs-s2:#7FE3FF;--cs-s3:#7FE3FF;--cs-s4:#7FE3FF;--cs-s5:#7FE3FF;--cs-ribo:#7FE3FF;--cs-org-fill:10%;--cs-org-base:transparent;--cs-head:#7FE3FF;--cs-core:#04234A;--cs-tailc:transparent;--cs-ves-solid:#04234A}
}
.cellscene-fit>text{stroke-width:2.5px}
.cellscene-gs-c{stop-color:var(--cs-cyto-c)}
.cellscene-gs-m{stop-color:var(--cs-cyto-m)}
.cellscene-gs-e{stop-color:var(--cs-cyto-e)}
/* The bilayer: head beads on both faces (a wide dashed stroke), a core
   band over its middle and paired fine tails; all zoom-compensated. */
.cellscene-cell{fill:var(--mk-cytofill,var(--cs-cyto));stroke:none;filter:var(--cs-mem-glow)}
.cellscene-cell-rim{fill:none;stroke:var(--cs-head);stroke-width:calc(10px / var(--cs-zoom,1));stroke-dasharray:calc(2.3px / var(--cs-zoom,1)) calc(1.3px / var(--cs-zoom,1));stroke-linejoin:round}
.cellscene-cell-in{fill:none;stroke:var(--cs-core);stroke-width:calc(5px / var(--cs-zoom,1));stroke-linejoin:round}
.cellscene-cell-tails{fill:none;stroke:var(--cs-tailc);stroke-width:calc(4.2px / var(--cs-zoom,1));stroke-dasharray:calc(.7px / var(--cs-zoom,1)) calc(1.1px / var(--cs-zoom,1))}
.cellscene-nucleus .cellscene-clay{opacity:.6}
.cellscene-comp .cellscene-clay{opacity:.85}
.cellscene-barrel{fill:color-mix(in srgb,var(--mf) 80%,var(--mk-halo));stroke:color-mix(in srgb,var(--me) 70%,var(--mf));stroke-width:1.1;stroke-linejoin:round}
.cellscene-span{filter:var(--mk-contact)}
.cellscene-org-in{fill:none;stroke:var(--cs-org-line);stroke-width:1;opacity:.45}
.cellscene-nuc{fill:var(--cs-nuc);stroke:var(--cs-nuc-line);stroke-width:1.75}
.cellscene-nuc-env{fill:none;stroke:var(--cs-nuc-line);stroke-width:1.25;opacity:.8}
.cellscene-pores{fill:none;stroke:var(--cs-nuc);stroke-width:2.6;stroke-linecap:round}
.cellscene-nucleolus{fill:var(--cs-nucleolus);stroke:color-mix(in srgb,var(--cs-nuc-line) 60%,transparent);stroke-width:1}
.cellscene-chromatin{fill:none;stroke:var(--cs-chromatin);stroke-width:1.2;stroke-linecap:round}
.cellscene-ves{fill:var(--cs-ves);stroke:var(--cs-ves-line);stroke-width:1.5;stroke-dasharray:3 3;stroke-linecap:round}
.cellscene-vesicle .cellscene-ves{fill:var(--cs-ves-solid)}
.cellscene-ves-ko{fill:none;stroke:var(--mk-halo);stroke-width:3.5}
.cellscene-org{fill:var(--cs-org);stroke:var(--cs-org-line);stroke-width:1.5}
.cellscene-comp{--oc:var(--cs-org-line)}
.cellscene-org-golgi{--oc:var(--cs-s3)}
.cellscene-org-er{--oc:var(--cs-s5)}
.cellscene-org-mito{--oc:var(--cs-s4)}
.cellscene-org-chloro{--oc:var(--cs-s2)}
.cellscene-org-glyco{--oc:var(--cs-s3)}
.cellscene-org-golgi>g>.cellscene-org,.cellscene-org-er>g>.cellscene-org,.cellscene-org-glyco>g>.cellscene-org{fill:color-mix(in srgb,var(--oc) 6%,transparent);stroke:color-mix(in srgb,var(--oc) 22%,transparent);stroke-width:1;stroke-dasharray:2 4;stroke-linecap:round}
.cellscene-org-mito>g>.cellscene-org,.cellscene-org-chloro>g>.cellscene-org{fill:color-mix(in srgb,var(--oc) var(--cs-org-fill),var(--cs-org-base));stroke:var(--oc);stroke-width:1.75;filter:var(--mk-contact)}
.cellscene-org-inner{fill:color-mix(in srgb,var(--oc) 7%,transparent);stroke:color-mix(in srgb,var(--oc) 60%,transparent);stroke-width:1}
.cellscene-tube-edge{fill:none;stroke:color-mix(in srgb,var(--oc) 82%,#24324A);stroke-linecap:round;stroke-linejoin:round}
.cellscene-tube{fill:none;stroke:color-mix(in srgb,var(--oc) 34%,var(--cs-org-base,#fff));stroke-linecap:round;stroke-linejoin:round}
.cellscene-tube-clay{fill:none;stroke:var(--mk-clay,none);stroke-linecap:round;stroke-linejoin:round;pointer-events:none}
.cellscene-tube-edge{filter:var(--mk-contact)}
.cellscene-cis.cellscene-tube-edge{stroke-width:6.4}.cellscene-cis:is(.cellscene-tube,.cellscene-tube-clay){stroke-width:3.8}
.cellscene-er.cellscene-tube-edge{stroke-width:5.6}.cellscene-er:is(.cellscene-tube,.cellscene-tube-clay){stroke-width:3.2}
.cellscene-cristae.cellscene-tube-edge{stroke-width:4.6}.cellscene-cristae:is(.cellscene-tube,.cellscene-tube-clay){stroke-width:2.2}
.cellscene-ribo-dots{fill:none;stroke:var(--cs-ribo);stroke-width:2.8;stroke-linecap:round}
.cellscene-bleb{fill:color-mix(in srgb,var(--oc) 26%,var(--cs-org-base,#fff));stroke:color-mix(in srgb,var(--oc) 82%,#24324A);stroke-width:1.1}
.cellscene-lamella{fill:none;stroke:color-mix(in srgb,var(--oc) 55%,transparent);stroke-width:1.2;stroke-linecap:round}
.cellscene-granum{fill:color-mix(in srgb,var(--oc) 58%,var(--cs-org-base,#fff));stroke:color-mix(in srgb,var(--oc) 85%,#24324A);stroke-width:.8}
.cellscene-granule{fill:color-mix(in srgb,var(--oc) 34%,var(--cs-org-base,#fff));stroke:color-mix(in srgb,var(--oc) 80%,#24324A);stroke-width:1}
.cellscene-hl{fill:none;stroke:var(--cs-hl);stroke-width:2;stroke-dasharray:6 4;stroke-linecap:round;filter:drop-shadow(0 0 5px color-mix(in srgb,var(--cs-hl) 45%,transparent))}
.cellscene-pool{fill:var(--cs-pool);stroke:var(--cs-pool-line);stroke-width:1;stroke-opacity:.6}
.cellscene-pool-active{stroke-opacity:1}
.cellscene-body>.mech-actor>path:first-child{vector-effect:non-scaling-stroke}
.cellscene-dot{vector-effect:non-scaling-stroke;stroke-width:1;fill:var(--mf);stroke:color-mix(in srgb,var(--me) 55%,var(--mf));filter:var(--mk-contact)}
.cellscene-dot-hi{fill:var(--mk-ball,none);pointer-events:none}
@media screen{
body.sk-aurora:not(.sk-pastel):not(.sk-blueprint) .cellscene-tube{stroke:color-mix(in srgb,var(--oc) 30%,#0B1220)}
body.sk-aurora:not(.sk-pastel):not(.sk-blueprint) .cellscene-tube-edge{stroke:var(--oc)}
body.sk-aurora:not(.sk-pastel):not(.sk-blueprint) .cellscene-bleb,body.sk-aurora:not(.sk-pastel):not(.sk-blueprint) .cellscene-granule{stroke:var(--oc)}
body.sk-aurora:not(.sk-pastel):not(.sk-blueprint) .cellscene-granum{stroke:var(--oc)}
body.sk-blueprint .cellscene-tube{stroke:#04234A}
body.sk-blueprint .cellscene-tube-edge,body.sk-blueprint .cellscene-bleb,body.sk-blueprint .cellscene-granule,body.sk-blueprint .cellscene-granum{stroke:#7FE3FF}
body.sk-blueprint .cellscene-bleb,body.sk-blueprint .cellscene-granule,body.sk-blueprint .cellscene-granum{fill:rgba(127,227,255,.14)}
body.sk-blueprint .cellscene-cell-rim{stroke-dasharray:none;stroke-width:calc(7px / var(--cs-zoom,1))}
body.sk-blueprint .cellscene-cell-in{stroke-width:calc(4.2px / var(--cs-zoom,1))}
body.sk-blueprint .cellscene-cell-tails,body.sk-blueprint .cellscene-tube-clay,body.sk-blueprint .cellscene-span .cellscene-clay{display:none}
body.sk-blueprint .cellscene-barrel{fill:color-mix(in srgb,var(--mf) 14%,#04234A);stroke:var(--mf);stroke-width:1.5}
body.sk-pastel .cellscene-barrel{fill:color-mix(in srgb,var(--mf) 80%,#fff);stroke:color-mix(in srgb,var(--mf) 62%,#24324A)}
body.sk-pastel .cellscene-dot{fill:color-mix(in srgb,var(--mf) 88%,#fff);stroke:color-mix(in srgb,var(--mf) 62%,#24324A)}
body.sk-blueprint .cellscene-dot{fill:color-mix(in srgb,var(--mf) 35%,transparent);stroke:var(--mf);filter:none}
body.sk-blueprint .cellscene-dot-hi{display:none}
body.sk-blueprint .cellscene-body>.mech-actor>path:first-child{fill:color-mix(in srgb,var(--mf) 35%,transparent)}
body.sk-pastel .cellscene-sw-membrane{background:#FBFCFF;box-shadow:inset 0 0 0 1.5px #9FB0CC}
body.sk-pastel .cellscene-sw-nucleus{background:#EEF1FB;box-shadow:inset 0 0 0 1.5px #8E9FD6}
body.sk-blueprint .cellscene-sw-membrane,body.sk-blueprint .cellscene-sw-nucleus{background:rgba(127,227,255,.1);box-shadow:inset 0 0 0 1.5px #7FE3FF}
body.sk-pastel .cellscene-hl{stroke-width:2.5;stroke-dasharray:8 5;fill:color-mix(in srgb,#5263B9 5%,transparent);filter:drop-shadow(0 0 8px rgba(82,99,185,.35))}
body.sk-pastel .cellscene-st-active .cellscene-body,body.sk-pastel .cellscene-st-bound .cellscene-body{filter:drop-shadow(0 0 .6px #5263B9) drop-shadow(0 0 .6px #5263B9)}
body.sk-pastel .cellscene-lead .cellscene-body{filter:drop-shadow(0 0 .8px #5263B9) drop-shadow(0 0 .8px #5263B9) drop-shadow(0 0 9px rgba(82,99,185,.5))}
body.sk-blueprint .cellscene-pool{stroke-dasharray:3 3}
}
.cellscene-sw-membrane{background:rgba(92,184,255,.12);box-shadow:inset 0 0 0 1.5px #7C93BC}
.cellscene-sw-nucleus{background:rgba(127,155,208,.22);box-shadow:inset 0 0 0 1.5px #8EA6DA}
.cellscene-item{transform-box:fill-box;transform-origin:center}
.cellscene-st-bound .cellscene-body,.cellscene-st-active .cellscene-body{filter:drop-shadow(0 0 1px color-mix(in srgb,var(--mk-acc) 85%,transparent))}
.cellscene-lead .cellscene-body{filter:var(--mk-glow-hot)}
.cellscene-st-released .cellscene-body{opacity:.8}
.cellscene-t-cap{transform-box:view-box;transform-origin:14px 37px;transform:translateY(calc((var(--cs-ts,1) - 1) * 13px)) scale(var(--cs-ts,1));font:600 12px 'IBM Plex Sans',sans-serif;fill:var(--mk-ink,var(--dtext));paint-order:stroke;stroke:var(--mk-halo,transparent);stroke-width:3.5px;stroke-linejoin:round}
.cellscene-readable .cellscene-fit > text{font-size:18px;letter-spacing:0}
.cellscene-caption{margin:8px 0 4px;font-size:13px;line-height:1.4;color:var(--dtext)}
.cellscene-foot{min-width:0}
.cellscene-crossing{animation:cellsceneCross 1.25s cubic-bezier(.2,.7,.2,1) both}
@keyframes cellsceneCross{0%{transform:translate(var(--cs-x0),var(--cs-y0)) scale(1)}40%{transform:translate(var(--cs-x1),var(--cs-y1)) scale(1)}50%,60%{transform:translate(var(--cs-x1),var(--cs-y1)) scale(.65)}100%{transform:translate(0,0) scale(1)}}
.cellscene-appear{animation:cellsceneAppear .56s cubic-bezier(.16,1,.3,1) both}
@keyframes cellsceneAppear{0%{opacity:0;transform:scale(.6)}55%{opacity:1;transform:scale(1.06)}100%{opacity:1;transform:scale(1)}}
.cellscene-vesicle{transform-box:fill-box;transform-origin:center}
.cellscene-fusing{transform-box:fill-box;transform-origin:center;pointer-events:none;animation:cellsceneFuse .9s cubic-bezier(.2,.7,.2,1) both}
.cellscene-fusing .cellscene-ves{fill:var(--cs-ves-solid)}
@keyframes cellsceneFuse{0%{transform:translate(var(--fx0),var(--fy0)) scale(1);opacity:1}55%{transform:translate(0,0) scale(1);opacity:1}100%{transform:translate(0,0) scale(1.5,.12);opacity:0}}
.cellscene-parent{animation:cellsceneParentFade 1.25s ease-in both;pointer-events:none}
@keyframes cellsceneParentFade{0%,55%{opacity:1}100%{opacity:0}}
@media (prefers-reduced-motion:reduce){.cellscene-view{transition:none}.cellscene-crossing,.cellscene-appear,.cellscene-parent,.cellscene-fusing{animation:none}}
@media print{.cellscene-parent{display:none}.cellscene-cell,.cellscene-nuc,.cellscene-ves,.cellscene-org{print-color-adjust:exact}}
`,
  authoring: {
    initialFields: true,
    transientFields: ['caption', 'highlight', 'zoom', 'labels', 'items'],
    template: {
      title: 'Cell scene', label: 'a generic cell',
      compartments: [
        { id: 'out', kind: 'outside', label: 'outside' }, { id: 'cell', kind: 'cell', label: 'membrane' },
        { id: 'cyt', kind: 'region', parent: 'cell', label: 'cytoplasm' }, { id: 'nuc', kind: 'nucleus', parent: 'cell', label: 'nucleus' },
      ],
      items: [
        { id: 'p', role: 'particle', label: 'particle', start: { in: 'out', x: 58, y: 108 } },
        { id: 'c', role: 'cargo', label: 'cargo', start: { in: 'nuc', count: 0, state: 'hidden' } },
      ],
      initial: { caption: 'A cell at rest.' },
    },
    setupFields: [['label', 'text'], ['legendMode', 'text'], ['labelMode', 'text'], ['compartments', 'jsonArr'], ['items', 'jsonArr'], ['initial', 'json']],
    patchFields: [['items', 'json'], ['events', 'jsonArr'], ['zoom', 'text'], ['highlight', 'text'], ['labels', 'jsonArr'], ['caption', 'text'], ['note', 'text']],
    expandPatchFields: function (panel) {
      var ids = cellsceneCompartments(panel.compartments, 'panel').map(function (c) { return c.id; });
      return [['items', 'json'], ['events', 'jsonArr'], ['zoom', 'enum', ids], ['highlight', 'enum', ids], ['labels', 'jsonArr'], ['caption', 'text'], ['note', 'text']];
    },
    fieldMeta: {
      label: { label: 'Scene title', help: 'Short title inside the frame, e.g. "a plant cell".' },
      legendMode: { label: 'Scene legend (all or visible)', help: 'all (default) lists every item. visible omits hidden items and items with count 0; cell and nucleus context stays in the legend.', unsetLabel: 'All items (default)' },
      labelMode: { label: 'Scene labels (standard or readable)', help: 'readable enlarges SVG labels and places the caption below the scene; standard preserves the compact layout.', unsetLabel: 'Standard (default)' },
      compartments: { label: 'Compartments', help: 'Up to 8 {id, kind, label?, parent?, x?, y?, rx?, ry?}; kinds outside, cell, nucleus, vesicle, organelle, region. One cell, one nucleus.' },
      items: { label: 'Items', help: 'Setup: 1–8 {id, role, shape?, label?, size?, start:{in, x?, y?, count?, state?}}. Step: an object keyed by item id that patches in, x, y, count (0–50), state (free|bound|active|released|hidden), label and daughter; an id set to null returns that item to its start.' },
      events: { label: 'Events this step', help: 'Up to 4: {kind:"enter", item, to, via?}, {kind:"bud", vesicle, from, items?}, {kind:"fuse", vesicle, with, to}, {kind:"divide", daughters?}, {kind:"signal", at, rings?}. Events run on this step only; their lasting effects carry.' },
      zoom: { label: 'Zoom to compartment', help: 'Frames one compartment with a 12% margin; clear for the whole scene.', nullLabel: 'Whole scene' },
      highlight: { label: 'Highlighted compartment', nullLabel: 'No highlight' },
      labels: { label: 'Callouts', help: 'Up to 4 {at: {x,y} | item or compartment id, text}. A full list each time; clear removes them.', nullLabel: 'No callouts' },
      caption: { label: 'Caption', help: 'One line under the title, or below the scene in readable label mode.', nullLabel: 'No caption' },
      note: { label: 'Explanation' },
    },
    picker: {
      order: 47, name: 'Cell scene', category: 'Science & sequencing', tagline: "Things move between a cell's compartments",
      description: 'A generic cell with nested compartments. Items enter, bud, fuse, signal and the cell divides as the story advances; every position and event is authored.',
    },
    example: function (sample) {
      var panel = sample.panel, state = sample.state;
      state.items = { p: { in: 'cyt', x: 215, y: 150 }, c: { in: 'cyt', x: 262, y: 214, count: 6, state: 'free' } };
      state.highlight = 'nuc';
      state.caption = 'Cargo is made and leaves the nucleus.';
      state.note = 'Illustrative: a particle has entered; six cargo molecules sit in the cytoplasm.';
      panel.initial = builderClone(state);
      return sample;
    },
  },
});
