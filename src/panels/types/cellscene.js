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
  var byId = Object.create(null), itemById = Object.create(null);
  compartments.forEach(function (c) { byId[c.id] = c; });
  items.forEach(function (item) { itemById[item.id] = item; });
  return { compartments: compartments, items: items, label: mechText(panel.label, 40), byId: byId, itemById: itemById };
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
/* Events are cleaned by shape only; ids are resolved against the declaration
   by the model, so the fold carries nothing derived from the declaration. */
function cellsceneCleanEvent(raw) {
  if (!panelObject(raw) || CELLSCENE_EVENTS.indexOf(raw.kind) < 0) return null;
  var id = function (value) { return mechId(value) ? value : null; };
  if (raw.kind === 'enter') {
    if (!id(raw.item) || !id(raw.to)) return null;
    return { kind: 'enter', item: raw.item, to: raw.to, via: id(raw.via) };
  }
  if (raw.kind === 'bud') {
    if (!id(raw.vesicle) || !id(raw.from)) return null;
    return { kind: 'bud', vesicle: raw.vesicle, from: raw.from, items: (Array.isArray(raw.items) ? raw.items : []).filter(mechId) };
  }
  if (raw.kind === 'fuse') {
    if (!id(raw.vesicle) || !id(raw.with)) return null;
    return { kind: 'fuse', vesicle: raw.vesicle, with: raw.with, to: id(raw.to) || raw.with };
  }
  if (raw.kind === 'divide') {
    var daughters = {};
    if (Array.isArray(raw.daughters)) raw.daughters.slice(0, 2).forEach(function (d, i) {
      if (panelObject(d) && Array.isArray(d.items)) d.items.filter(mechId).forEach(function (iid) { daughters[iid] = i + 1; });
    });
    return { kind: 'divide', daughters: daughters };
  }
  if (!id(raw.at)) return null;
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
function cellsceneApply(c, patch) {
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
    var event = cellsceneCleanEvent(raw);
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
  var c = { items: {}, vesicles: {}, divided: false, daughters: {}, events: [] };
  c = cellsceneApply(c, panel.initial);
  c.events = [];
  var before = [], states = [];
  steps.forEach(function (step, i) {
    var source = stepPanelPatch(step), patch = source && panelOwn(source, panel.id) ? source[panel.id] : null;
    before.push(c);
    var after = cellsceneApply(c, patch);
    var once = panelObject(patch) && panelObject(patch.enterOnce) ? cellsceneApply(after, patch.enterOnce) : null;
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
          if (mechId(raw.vesicle)) vesicles.push(raw.vesicle);
        } else if (raw.kind === 'fuse') {
          if (!mechId(raw.vesicle)) cellsceneWarn(warnings, atE + '.vesicle', 'needs a letter-led vesicle id — event skipped');
          else if (vesicles.indexOf(raw.vesicle) < 0) cellsceneWarn(warnings, atE + '.vesicle', 'no vesicle "' + raw.vesicle + '" has budded on this path — event skipped');
          if (!comp(raw.with)) cellsceneWarn(warnings, atE + '.with', 'unknown compartment — event skipped');
          if (raw.to !== undefined && !comp(raw.to)) cellsceneWarn(warnings, atE + '.to', 'unknown compartment — contents stay with the fused compartment');
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
function cellscenePatchWarnings(state, path, context, warnings) {
  softwarePanelPatchWarnings(state, path, context, warnings, cellsceneStateWarnings);
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
      transients.push({ kind: 'cross', x: f.x, y: f.y, delay: 250 });
    } else if (ev.kind === 'divide' && divided) { hasDivide = true; transients.push({ kind: 'divide', x: cell.x, y: cell.y }); }
  });
  var legend = items.map(function (it) {
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
    divided: divided, daughters: daughters, items: items, vesicles: vesicleList, zoom: zoom, highlight: highlight, labels: labels,
    transients: transients, legend: legend, aria: aria, hasDivide: hasDivide,
  };
}

/* ---- markup ---- */
/* Labels sit in a `.cellscene-fit` group that counter-scales under zoom, so
   text keeps its 10 px size while the scene is enlarged. */
function cellsceneFit(x, y, inner) {
  return '<g transform="translate(' + mechNum(x) + ' ' + mechNum(y) + ')"><g class="cellscene-fit">' + inner + '</g></g>';
}
function cellsceneLabelText(x, y, text, anchorMode) {
  if (!text) return '';
  return cellsceneFit(x, y, '<text class="mech-t-label" x="0" y="0" text-anchor="' + (anchorMode || 'middle') + '" aria-hidden="true">' + esc(text) + '</text>');
}
function cellsceneMoveGroup(cls, id, x, y, inner, style) {
  return '<g class="mech-move ' + cls + '" data-id="' + esc(id) + '"' + (style || '') + '><g transform="translate(' + mechNum(x) + ' ' + mechNum(y) + ')">' + inner + '</g></g>';
}
function cellsceneItemBody(it) {
  var role = MECH_ROLES[it.role], h = '<g class="cellscene-body" style="--mf:' + role.fill + ';--me:' + role.edge + '">';
  if (it.cluster) {
    it.cluster.forEach(function (o) {
      h += '<circle class="cellscene-dot" cx="' + o.dx + '" cy="' + o.dy + '" r="' + it.dotR + '" fill="' + role.fill + '" stroke="' + role.edge + '"/>';
    });
    if (it.count > 30) h += cellsceneFit(0, -it.reach - 12, mechTagMarkup(0, 0, '×' + it.count, 'cellscene-count'));
  } else h += mechActorMarkup({ role: it.role, shape: it.shape, size: it.size, label: '' });
  h += '</g>';
  if (it.label) h += cellsceneLabelText(0, it.reach + 13, it.label);
  return h;
}
/* Builds the scene once per render. `motion` adds glide styles, crossing
   keyframe variables and transients; the baseline omits them. */
function cellsceneParts(model, prev, motion) {
  var m = model, scene = '', byDaughter = m.daughters;
  m.compartments.forEach(function (c) {
    var g = m.geom[c.id];
    if (c.kind === 'outside') return;
    if (c.kind === 'cell') {
      if (m.divided) {
        byDaughter.forEach(function (d) {
          var from = motion && prev ? (prev.daughters && prev.daughters[d.index]) || prev.cell : null;
          scene += cellsceneMoveGroup('cellscene-daughter', 'daughter:' + d.index, d.x, d.y,
            '<ellipse class="cellscene-cell" rx="' + d.rx + '" ry="' + d.ry + '"/>' + cellsceneLabelText(0, d.ry + 16, 'daughter ' + d.index), mechGlideStyle(from, d));
        });
      } else scene += '<path class="cellscene-cell" d="' + mechCellOutline(c.x, c.y, c.rx, c.ry, 0) + '"/>' + cellsceneLabelText(c.x, c.y - c.ry + 18, c.label);
      return;
    }
    if (c.kind === 'nucleus') {
      if (m.divided) {
        byDaughter.forEach(function (d) {
          var n = d.nucleus, from = motion && prev ? (prev.nuclei && prev.nuclei[d.index]) || prev.nucleus : null;
          scene += cellsceneMoveGroup('cellscene-nucleus', 'nucleus:' + d.index, n.x, n.y,
            '<circle class="cellscene-nuc" r="' + n.r + '"/><circle class="cellscene-nuc-env" r="' + mechNum(n.r - 5) + '"/>', mechGlideStyle(from, n));
        });
      } else scene += cellsceneMoveGroup('cellscene-nucleus', 'nucleus', g.x, g.y,
        '<circle class="cellscene-nuc" r="' + g.rx + '"/><circle class="cellscene-nuc-env" r="' + mechNum(g.rx - 6) + '"/>' + cellsceneLabelText(0, g.rx + 16, c.label), '');
      return;
    }
    if (c.kind === 'region') { if (!m.divided) scene += cellsceneLabelText(g.x, g.y - 26, c.label); return; }
    var from = motion && prev && prev.comps ? prev.comps[c.id] : null;
    scene += cellsceneMoveGroup('cellscene-comp', c.id, g.x, g.y,
      '<ellipse class="' + (c.kind === 'vesicle' ? 'cellscene-ves' : 'cellscene-org') + '" rx="' + g.rx + '" ry="' + g.ry + '"/>' + cellsceneLabelText(0, g.ry + 14, c.label), mechGlideStyle(from, g));
  });
  m.vesicles.forEach(function (v) {
    var from = motion && prev && prev.vesicles ? prev.vesicles[v.id] : null, fresh = motion && (!prev || !prev.vesicles || !prev.vesicles[v.id]);
    scene += cellsceneMoveGroup('cellscene-vesicle' + (fresh ? ' cellscene-appear' : ''), 'vesicle:' + v.id, v.x, v.y,
      '<circle class="cellscene-ves" r="' + v.r + '"/>' + cellsceneLabelText(0, -v.r - 7, 'vesicle'), mechGlideStyle(from, v));
  });
  var crossing = Object.create(null);
  m.transients.forEach(function (t) { if (t.kind === 'cross' && t.item) crossing[t.item] = t; });
  m.items.forEach(function (it) {
    if (!it.visible) return;
    var from = motion && prev && prev.items ? prev.items[it.id] : null, cls = 'cellscene-item cellscene-role-' + it.role + ' cellscene-st-' + it.state, style = '';
    if (motion && crossing[it.id]) {
      var c = crossing[it.id], start = from || c;
      cls += ' cellscene-crossing';
      style = ' style="--cs-x0:' + mechNum(start.x - it.x) + 'px;--cs-y0:' + mechNum(start.y - it.y) + 'px;--cs-x1:' + mechNum(c.x - it.x) + 'px;--cs-y1:' + mechNum(c.y - it.y) + 'px"';
    } else style = mechGlideStyle(from, it);
    if (motion && !from && !crossing[it.id] && prev) cls += ' cellscene-appear';
    scene += cellsceneMoveGroup(cls, it.id, it.x, it.y, cellsceneItemBody(it), style);
  });
  if (motion) m.transients.forEach(function (t) {
    if (t.kind === 'divide') {
      var c = m.cell;
      scene += '<g class="mech-transient cellscene-parent" aria-hidden="true"><path class="cellscene-cell" d="' + mechCellOutline(c.x, c.y, c.rx, c.ry, 0) + '">' +
        '<animate attributeName="d" dur="1.1s" fill="freeze" calcMode="spline" keySplines="0.4 0 0.2 1" values="' + mechCellOutline(c.x, c.y, c.rx, c.ry, 0) + ';' + mechCellOutline(c.x, c.y, c.rx, c.ry, 1) + '"/></path></g>';
    } else scene += mechRipple(t.x, t.y, t.kind, t.delay);
  });
  var overlay = '';
  if (m.highlight) m.highlight.forEach(function (h) {
    overlay += '<ellipse class="cellscene-hl" cx="' + h.x + '" cy="' + h.y + '" rx="' + h.rx + '" ry="' + h.ry + '"/>';
  });
  m.labels.forEach(function (l) { overlay += cellsceneFit(l.x, l.y, mechTagMarkup(0, 0, l.text, 'cellscene-callout')); });
  var hud = cellsceneLabelText(14, 20, m.title + ' · zoom: ' + (m.zoom ? m.zoom.label : 'whole scene'), 'start');
  if (m.caption) hud += '<text class="cellscene-t-cap" x="14" y="37">' + esc(m.caption) + '</text>';
  var outside = m.compartments.filter(function (c) { return c.kind === 'outside'; })[0];
  if (outside) hud += cellsceneLabelText(546, 300, outside.label, 'end');
  var zs = m.zoom ? m.zoom.scale : 1;
  var viewStyle = 'transform:translate(' + (m.zoom ? m.zoom.tx : 0) + 'px,' + (m.zoom ? m.zoom.ty : 0) + 'px) scale(' + zs + ');--cs-zoom:' + zs;
  var legend = '<ul class="mech-legend" aria-label="Scene legend">' + m.legend.map(function (chip) {
    var role = MECH_ROLES[chip.role] || MECH_ROLES.protein;
    return '<li class="mech-chip" data-id="' + esc(chip.id) + '"><i class="mech-sw' + (chip.role === 'vesicle' ? ' mech-sw-dashed' : '') + '" style="--mf:' + role.fill + ';--me:' + role.edge + '" aria-hidden="true"></i>' +
      esc(chip.name) + (chip.state ? ' <small class="mech-st' + (chip.hot ? ' hot' : '') + '">' + esc(chip.state) + '</small>' : '') + '</li>';
  }).join('') + '</ul>';
  return { scene: scene, overlay: overlay, hud: hud, viewStyle: viewStyle, legend: legend };
}
function cellsceneAssemble(parts, model, state) {
  var grid = '';
  for (var gx = 20; gx < MECH_SCENE.w; gx += 40) grid += '<line class="cellscene-grid" x1="' + gx + '" y1="0" x2="' + gx + '" y2="' + MECH_SCENE.h + '"/>';
  var svg = '<svg class="mech-frame cellscene-frame" viewBox="0 0 ' + MECH_SCENE.w + ' ' + MECH_SCENE.h + '" role="img" aria-label="' + esc(model.aria) + '">' +
    grid + '<g class="cellscene-view" style="' + parts.viewStyle + '"><g class="cellscene-scene">' + parts.scene + '</g><g class="cellscene-overlay">' + parts.overlay + '</g></g>' +
    '<g class="cellscene-hud">' + parts.hud + '</g></svg>';
  var foot = parts.legend + (state.note ? '<div class="swnote">' + esc(String(state.note)) + '</div>' : '');
  return '<div class="swpanel cellscene">' + svg + '<div class="cellscene-foot">' + foot + '</div></div>';
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
  model.vesicles.forEach(function (v) { next.vesicles[v.id] = { x: v.x, y: v.y }; });
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
       note) swap the overlay, hud and foot and retarget the zoom transform,
       keeping the scene subtree so the zoom glides and nothing restarts. */
    patch: function () {
      var surgical = false;
      if (host._lastHTML != null && host._csScene === still.scene && !model.transients.length && typeof host.querySelector === 'function') {
        var frame = host.querySelector('.cellscene-frame'), view = host.querySelector('.cellscene-view'), overlay = host.querySelector('.cellscene-overlay'),
          hud = host.querySelector('.cellscene-hud'), foot = host.querySelector('.cellscene-foot');
        if (frame && view && overlay && hud && foot) {
          surgical = true;
          frame.setAttribute('aria-label', model.aria);
          if (view.getAttribute('style') !== still.viewStyle) {
            view.setAttribute('style', still.viewStyle);
            if (!animate && view.style) view.style.transition = 'none';
          }
          overlay.innerHTML = still.overlay;
          hud.innerHTML = still.hud;
          foot.innerHTML = still.legend + (state.note ? '<div class="swnote">' + esc(String(state.note)) + '</div>' : '');
        }
      }
      host._csScene = still.scene;
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
.cellscene-grid{stroke:color-mix(in srgb,var(--dtext) 8%,transparent);stroke-width:1}
.cellscene-view{transform-box:view-box;transform-origin:0 0;transition:transform .7s cubic-bezier(.4,0,.2,1)}
.cellscene-fit{transform:scale(calc(1 / var(--cs-zoom,1)))}
.cellscene-cell,.cellscene-nuc,.cellscene-nuc-env,.cellscene-ves,.cellscene-org,.cellscene-hl{vector-effect:non-scaling-stroke}
.cellscene-cell{fill:color-mix(in srgb,var(--dtext) 9%,transparent);stroke:color-mix(in srgb,var(--dtext) 55%,transparent);stroke-width:3}
.cellscene-nuc{fill:color-mix(in srgb,#7F9BD0 22%,transparent);stroke:#7F9BD0;stroke-width:2}
.cellscene-nuc-env{fill:none;stroke:#7F9BD0;stroke-width:1;stroke-dasharray:3 4;opacity:.6}
.cellscene-ves{fill:color-mix(in srgb,#8AA0C2 14%,transparent);stroke:#8AA0C2;stroke-width:1.5;stroke-dasharray:3 3}
.cellscene-org{fill:color-mix(in srgb,#6E8FC7 22%,transparent);stroke:#6E8FC7;stroke-width:1.5}
.cellscene-hl{fill:none;stroke:#FFB454;stroke-width:2;stroke-dasharray:6 4}
.cellscene-dot{stroke-width:1}
.cellscene-item{transform-box:fill-box;transform-origin:center}
.cellscene-body{filter:drop-shadow(0 0 5px color-mix(in srgb,var(--mf) 70%,transparent))}
.cellscene-st-bound .cellscene-body,.cellscene-st-active .cellscene-body{filter:drop-shadow(0 0 9px var(--mf))}
.cellscene-st-released .cellscene-body{opacity:.72}
.cellscene-t-cap{font:500 11.5px 'IBM Plex Sans',sans-serif;fill:var(--dtext)}
.cellscene-foot{min-width:0}
.cellscene-crossing{animation:cellsceneCross 1.25s cubic-bezier(.4,0,.2,1) both}
@keyframes cellsceneCross{0%{transform:translate(var(--cs-x0),var(--cs-y0)) scale(1)}40%{transform:translate(var(--cs-x1),var(--cs-y1)) scale(1)}50%,60%{transform:translate(var(--cs-x1),var(--cs-y1)) scale(.65)}100%{transform:translate(0,0) scale(1)}}
.cellscene-appear{animation:cellsceneAppear .5s ease-out both}
@keyframes cellsceneAppear{from{opacity:0}to{opacity:1}}
.cellscene-parent{animation:cellsceneParentFade 1.25s ease-in both;pointer-events:none}
@keyframes cellsceneParentFade{0%,55%{opacity:1}100%{opacity:0}}
@media (prefers-reduced-motion:reduce){.cellscene-view{transition:none}.cellscene-crossing,.cellscene-appear,.cellscene-parent{animation:none}}
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
    setupFields: [['label', 'text'], ['compartments', 'jsonArr'], ['items', 'jsonArr'], ['initial', 'json']],
    patchFields: [['items', 'json'], ['events', 'jsonArr'], ['zoom', 'text'], ['highlight', 'text'], ['labels', 'jsonArr'], ['caption', 'text'], ['note', 'text']],
    expandPatchFields: function (panel) {
      var ids = cellsceneCompartments(panel.compartments, 'panel').map(function (c) { return c.id; });
      return [['items', 'json'], ['events', 'jsonArr'], ['zoom', 'enum', ids], ['highlight', 'enum', ids], ['labels', 'jsonArr'], ['caption', 'text'], ['note', 'text']];
    },
    fieldMeta: {
      label: { label: 'Scene title', help: 'Short title inside the frame, e.g. "a plant cell".' },
      compartments: { label: 'Compartments', help: 'Up to 8 {id, kind, label?, parent?, x?, y?, rx?, ry?}; kinds outside, cell, nucleus, vesicle, organelle, region. One cell, one nucleus.' },
      items: { label: 'Items', help: 'Setup: 1–8 {id, role, shape?, label?, size?, start:{in, x?, y?, count?, state?}}. Step: an object keyed by item id that patches in, x, y, count (0–50), state (free|bound|active|released|hidden), label and daughter; an id set to null returns that item to its start.' },
      events: { label: 'Events this step', help: 'Up to 4: {kind:"enter", item, to, via?}, {kind:"bud", vesicle, from, items?}, {kind:"fuse", vesicle, with, to}, {kind:"divide", daughters?}, {kind:"signal", at, rings?}. Events run on this step only; their lasting effects carry.' },
      zoom: { label: 'Zoom to compartment', help: 'Frames one compartment with a 12% margin; clear for the whole scene.', nullLabel: 'Whole scene' },
      highlight: { label: 'Highlighted compartment', nullLabel: 'No highlight' },
      labels: { label: 'Callouts', help: 'Up to 4 {at: {x,y} | item or compartment id, text}. A full list each time; clear removes them.', nullLabel: 'No callouts' },
      caption: { label: 'Caption', help: 'One line under the title inside the scene.', nullLabel: 'No caption' },
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
