/* Shared compare engine (#847). DOM-free: compares two documents and returns
   one ordered change list for the agent-update preview and Git Compare.

   compareDocuments(before, after): each side is null (absent document) or
   {authored, resolved, ledger} — normalized authored page, the same page after
   topology resolution with that side's own provider context, and optional
   coverage-ledger text.

   Paths start at the normalized page root. Keys that are not plain
   identifiers use ["key"]. Differences seen only in resolved pages carry the
   `resolved:` prefix; ledger hunks use `ledger:<from>-<to>` (1-based lines).
   A field is reported at the highest key that differs; its path is null on
   the side where the field or its record is absent.

   Reader effects compare the folds (panel state, node tone, panel
   visibility) at steps paired by identity on each path, in source-step
   coordinates per side, with 'ambient' last when the ambient-rendered state
   differs. A panel-declaration change that leaves every fold unchanged cannot
   be proven to change what the reader sees (no renderer-dependency facet
   exists), so it is reported as effect:'declaration' with the visible-step
   scope instead of effects. */
var COMPARE_DIAGRAM_COLLECTIONS = ['nodes','edges','panels','steps','paths','layouts','topologyImports'];
var COMPARE_IDENT = /^[A-Za-z_$][\w$]*$/;
function compareKey(path, key){
  if (typeof key === 'number') return path + '[' + key + ']';
  var tail = COMPARE_IDENT.test(key) ? '.' + key : '[' + JSON.stringify(key) + ']';
  return path ? path + tail : (COMPARE_IDENT.test(key) ? key : tail);
}
function compareSignature(value){
  if (Array.isArray(value)) return '[' + value.map(compareSignature).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().filter(function(k){return value[k] !== undefined;}).map(function(k){
    return JSON.stringify(k) + ':' + compareSignature(value[k]);
  }).join(',') + '}';
  return JSON.stringify(value);
}
function compareSame(a, b){ return compareSignature(a) === compareSignature(b); }
function comparePlain(value){ return value && typeof value === 'object' && !Array.isArray(value); }
function compareWithout(value, keys){
  var out = {};
  if (!comparePlain(value)) return out;
  Object.keys(value).forEach(function(k){ if (keys.indexOf(k) < 0) out[k] = value[k]; });
  return out;
}
/* Field-level differences at leaf values (arrays and scalars are leaves). An
   object present on one side only contributes one field per leaf, with a
   null path and no value on the absent side. */
function compareFields(a, b, pa, pb, out){
  out = out || [];
  var keys = [];
  function has(o, k){ return comparePlain(o) && Object.prototype.hasOwnProperty.call(o, k) && o[k] !== undefined; }
  Object.keys(comparePlain(a) ? a : {}).forEach(function(k){ if (has(a, k)) keys.push(k); });
  Object.keys(comparePlain(b) ? b : {}).forEach(function(k){ if (has(b, k) && keys.indexOf(k) < 0) keys.push(k); });
  keys.forEach(function(k){
    var inA = has(a, k), inB = has(b, k);
    var ka = pa == null || !inA ? null : compareKey(pa, k), kb = pb == null || !inB ? null : compareKey(pb, k);
    var va = inA ? a[k] : undefined, vb = inB ? b[k] : undefined;
    if (inA && inB && compareSame(va, vb)) return;
    if ((comparePlain(va) || !inA) && (comparePlain(vb) || !inB) && (comparePlain(va) || comparePlain(vb))){
      compareFields(inA ? va : {}, inB ? vb : {}, inA ? ka : null, inB ? kb : null, out, ka, kb);
      return;
    }
    out.push({beforePath:ka, afterPath:kb, before:va, after:vb});
  });
  return out;
}
/* Pair two record lists: stable id, exact content, then natural keys in
   order; records without an id and without a natural key pair 1:1 when
   exactly one of each is left. Different explicit ids never pair. */
function comparePairs(a, b, naturalKeys, leftover){
  a = Array.isArray(a) ? a : []; b = Array.isArray(b) ? b : [];
  var usedA = new Set(), usedB = new Set(), pairs = [];
  function idOf(v){ return v && (typeof v.id === 'string' && v.id || typeof v.id === 'number') ? 'id:' + String(v.id) : null; }
  function match(key, repeated){
    var left = Object.create(null), right = Object.create(null);
    a.forEach(function(v, i){ if (!usedA.has(i)){ var k = key(v); if (k != null) (left[k] || (left[k] = [])).push(i); } });
    b.forEach(function(v, i){ if (!usedB.has(i)){ var k = key(v); if (k != null) (right[k] || (right[k] = [])).push(i); } });
    Object.keys(left).forEach(function(k){
      if (!right[k]) return;
      if (!repeated && (left[k].length !== 1 || right[k].length !== 1)) return;
      for (var n = 0; n < Math.min(left[k].length, right[k].length); n++){
        usedA.add(left[k][n]); usedB.add(right[k][n]); pairs.push([left[k][n], right[k][n]]);
      }
    });
  }
  match(idOf);
  match(function(v){ return idOf(v) ? null : 'same:' + compareSignature(v); }, true);
  (naturalKeys || []).forEach(function(key){ match(function(v){ return idOf(v) ? null : key(v); }, !key.unique); });
  if (leftover){
    var la = a.map(function(v, i){ return i; }).filter(function(i){ return !usedA.has(i) && !idOf(a[i]); }),
        lb = b.map(function(v, i){ return i; }).filter(function(i){ return !usedB.has(i) && !idOf(b[i]); });
    if (la.length === 1 && lb.length === 1){ usedA.add(la[0]); usedB.add(lb[0]); pairs.push([la[0], lb[0]]); }
  }
  return {pairs:pairs, removed:a.map(function(v, i){ return i; }).filter(function(i){ return !usedA.has(i); }),
    added:b.map(function(v, i){ return i; }).filter(function(i){ return !usedB.has(i); })};
}
var COMPARE_EDGE_KEY = function(e){ return e && e.from != null && e.to != null ? 'ends:' + JSON.stringify([String(e.from), String(e.to), e.fromPort || '', e.toPort || '']) : null; };
var COMPARE_CAPTION_KEY = function(v){ return v && typeof v.text === 'string' ? 'text:' + v.text : null; };
COMPARE_CAPTION_KEY.unique = true;
var COMPARE_IMPORT_KEYS = [function(v){ return v && v.as != null ? 'as:' + v.as : null; },
  function(v){ return v ? 'src:' + compareSignature([v.spec, v.export]) : null; }];

/* ---------- reader effects ---------- */
function compareStepPatchKeys(step){
  var out = {state:[], tone:[], visibility:[], all:false};
  if (!step) return out;
  var patch = comparePlain(step.panels) ? step.panels : comparePlain(step.patch) ? step.patch : null;
  if (patch) out.state = Object.keys(patch);
  var tone = typeof stepTonePatch === 'function' ? stepTonePatch(step) : step.tone;
  if (comparePlain(tone)) out.tone = Object.keys(tone);
  if (comparePlain(step.panelVisibility)) out.visibility = Object.keys(step.panelVisibility);
  if (step.time !== undefined) out.all = true;
  return out;
}
function compareAmbientState(panel, states){
  var view = typeof PanelViews !== 'undefined' && PanelViews.get ? PanelViews.get(panel && panel.type) : null,
      options = view && view.options || {};
  return options.ambientInitial ? panel.initial : states[0];
}
function compareFoldsFor(d, pathId){
  var pd = diagramForPath(d, pathId), states = foldPanelStates(pd), tones = foldNodeTones(pd),
      visibility = foldPanelVisibility(pd), panels = {};
  (pd.panels || []).forEach(function(p){ if (p && p.id) panels[p.id] = p; });
  return {d:pd, indices:pd._sourceIndices || [], count:(pd.steps || []).length, panels:panels,
    state:function(id){ return states[id]; }, visibility:function(id){ return visibility[id]; },
    tone:function(id){ return tones.map(function(s){ return s[id]; }); }};
}
function comparePathIds(da, db){
  var a = diagramPathList(da).map(function(p){ return p.id; }), b = diagramPathList(db).map(function(p){ return p.id; });
  return a.filter(function(id){ return b.indexOf(id) >= 0; });
}
/* Differences per (path, category, target) between two resolved diagrams,
   with steps paired by the registry step pairing. */
function compareReaderDiffs(da, db, stepPairs){
  var out = [], toB = new Map();
  stepPairs.forEach(function(p){ toB.set(p[0], p[1]); });
  comparePathIds(da, db).forEach(function(pathId){
    var fa = compareFoldsFor(da, pathId), fb = compareFoldsFor(db, pathId);
    var posB = new Map();fb.indices.forEach(function(src, j){ posB.set(src, j); });
    var panelIds = [], nodeIds = [];
    Object.keys(fa.panels).concat(Object.keys(fb.panels)).forEach(function(id){ if (panelIds.indexOf(id) < 0) panelIds.push(id); });
    Object.keys(da.nodes || {}).concat(Object.keys(db.nodes || {})).forEach(function(id){ if (nodeIds.indexOf(id) < 0) nodeIds.push(id); });
    function diff(category, kind, id){
      var pairedB = new Set();
      var sa = fa[category](id) || [], sb = fb[category](id) || [], before = [], after = [], changes = [];
      if (fa.count || fb.count){
        fa.indices.forEach(function(src, k){
          var srcB = toB.has(src) ? toB.get(src) : null, j = srcB == null ? undefined : posB.get(srcB);
          if (j === undefined){ before.push(src); changes.push({beforeStep:src, afterStep:null, before:sa[k]}); return; }
          pairedB.add(srcB);
          if (!compareSame(sa[k], sb[j])){ before.push(src); after.push(srcB); changes.push({beforeStep:src, afterStep:srcB, before:sa[k], after:sb[j]}); }
        });
        fb.indices.forEach(function(src, j){
          if (!pairedB.has(src)){ after.push(src); changes.push({beforeStep:null, afterStep:src, after:sb[j]}); }
        });
      }
      if (category === 'state'){
        var pa = fa.panels[id], pb = fb.panels[id];
        var amA = pa ? compareAmbientState(pa, sa) : undefined, amB = pb ? compareAmbientState(pb, sb) : undefined;
        if (!compareSame(amA, amB)){ before.push('ambient'); after.push('ambient'); changes.push({beforeStep:'ambient', afterStep:'ambient', before:amA, after:amB}); }
      }
      if (!before.length && !after.length) return;
      var num = function(x, y){ return (x === 'ambient') - (y === 'ambient') || (x === 'ambient' ? 0 : x - y); };
      out.push({pathId:pathId, target:{kind:kind, id:id}, category:category,
        beforeSteps:before.filter(function(v, i, all){ return all.indexOf(v) === i; }).sort(num),
        afterSteps:after.filter(function(v, i, all){ return all.indexOf(v) === i; }).sort(num), changes:changes});
    }
    panelIds.forEach(function(id){ diff('state', 'panel', id); diff('visibility', 'panel', id); });
    nodeIds.forEach(function(id){ diff('tone', 'node', id); });
  });
  return out;
}
function compareVisibleScope(d, panelId){
  var out = [];
  diagramPathList(d).forEach(function(path){
    var f = compareFoldsFor(d, path.id), v = f.visibility(panelId) || [];
    f.indices.forEach(function(src, k){ if (v[k] !== false && out.indexOf(src) < 0) out.push(src); });
  });
  out.sort(function(x, y){ return x - y; });
  out.push('ambient');
  return out;
}

/* ---------- documents ---------- */
function compareSectionRecords(page){ return page ? sectionRecords(page) : []; }
function compareSectionKey(rec){
  var id = rec && rec.section && rec.section.id, m = /\[(\d+)\]$/.exec(rec ? rec.path : '');
  return typeof id === 'string' && id ? id : m ? Number(m[1]) : null;
}
function compareDocuments(before, after){
  var entries = [];
  var A = before && before.authored, B = after && after.authored;
  if (!before || !after){
    var present = before || after, status = before ? 'removed' : 'added';
    entries.push({kind:'document', status:status, cause:'document', beforePath:before ? '' : null, afterPath:after ? '' : null, fields:[], effects:[]});
    compareSectionRecords(present.authored).forEach(function(rec, i){
      var id = compareSectionKey(rec);
      entries.push({kind:'section', status:status, cause:'document', beforePath:before ? rec.path : null, afterPath:after ? rec.path : null,
        section:{before:before ? i : null, after:after ? i : null}, key:{before:before ? id : null, after:after ? id : null}, fields:[], effects:[]});
    });
    compareLedger(before ? before.ledger : null, after ? after.ledger : null, entries);
    return entries;
  }
  var docFields = compareFields(compareWithout(A, ['blocks','sections']), compareWithout(B, ['blocks','sections']), '', '');
  if (docFields.length) entries.push({kind:'document', status:'modified', cause:'document', beforePath:'', afterPath:'', fields:docFields, effects:[]});
  var ra = compareSectionRecords(A), rb = compareSectionRecords(B);
  var resA = compareSectionRecords(before.resolved || A), resB = compareSectionRecords(after.resolved || B);
  var recA = ra.map(function(r, i){ var s = r.section || {}; return {i:i, id:typeof s.id === 'string' && s.id ? s.id : null, sig:compareSignature(s), ctx:JSON.stringify([r.tabLabel, s.heading || '']), dia:s.diagram ? compareSignature(s.diagram) : null}; });
  var recB = rb.map(function(r, i){ var s = r.section || {}; return {i:i, id:typeof s.id === 'string' && s.id ? s.id : null, sig:compareSignature(s), ctx:JSON.stringify([r.tabLabel, s.heading || '']), dia:s.diagram ? compareSignature(s.diagram) : null}; });
  var secPairs = comparePairs(recA, recB, [function(r){ return 'ctx:' + r.ctx; }, function(r){ return r.dia == null ? null : 'dia:' + r.dia; }], true);
  secPairs.pairs.sort(function(x, y){ return x[1] - y[1]; }).forEach(function(p){
    compareSection(ra[p[0]], rb[p[1]], resA[p[0]], resB[p[1]], entries, p[0], p[1]);
  });
  function secKey(rec){ return compareSectionKey(rec); }
  secPairs.removed.forEach(function(i){ entries.push({kind:'section', status:'removed', cause:'document', beforePath:ra[i].path, afterPath:null, section:{before:i, after:null}, key:{before:secKey(ra[i], i), after:null}, fields:[], effects:[]}); });
  secPairs.added.forEach(function(i){ entries.push({kind:'section', status:'added', cause:'document', beforePath:null, afterPath:rb[i].path, section:{before:null, after:i}, key:{before:null, after:secKey(rb[i], i)}, fields:[], effects:[]}); });
  compareTabViews(A, B, entries);
  compareLedger(before.ledger, after.ledger, entries);
  return entries;
}
function compareRecordKey(list, i){
  var v = list && list[i];
  return v && (typeof v.id === 'string' && v.id || typeof v.id === 'number') ? v.id : i;
}
function compareRecordEntries(kind, list, pa, pb, base, entries, options){
  options = options || {};
  var m = comparePairs(list.a, list.b, options.natural, options.leftover);
  function locus(e, ia, ib){
    e.key = {before:ia == null ? null : compareRecordKey(list.a, ia), after:ib == null ? null : compareRecordKey(list.b, ib)};
    if (kind === 'step') e.step = {before:ia == null ? null : ia, after:ib == null ? null : ib};
    return e;
  }
  m.pairs.forEach(function(p){
    var a = list.a[p[0]], b = list.b[p[1]];
    if (compareSame(a, b)) return;
    var e = Object.assign({kind:kind, status:'modified', cause:'document', beforePath:compareKey(pa, p[0]), afterPath:compareKey(pb, p[1]),
      fields:compareFields(a, b, compareKey(pa, p[0]), compareKey(pb, p[1])), effects:[], _a:a, _b:b, _ia:p[0], _ib:p[1]}, base);
    entries.push(locus(e, p[0], p[1]));
  });
  m.removed.forEach(function(i){ entries.push(locus(Object.assign({kind:kind, status:'removed', cause:'document', beforePath:compareKey(pa, i), afterPath:null, fields:[], effects:[], _a:list.a[i], _ia:i}, base), i, null)); });
  m.added.forEach(function(i){ entries.push(locus(Object.assign({kind:kind, status:'added', cause:'document', beforePath:null, afterPath:compareKey(pb, i), fields:[], effects:[], _b:list.b[i], _ib:i}, base), null, i)); });
  return m;
}
function compareSection(ra, rb, resA, resB, entries, ia, ib){
  var sa = ra.section || {}, sb = rb.section || {}, da = sa.diagram || {}, db = sb.diagram || {};
  var pa = ra.path, pb = rb.path, dpa = pa + '.diagram', dpb = pb + '.diagram';
  var local = [];
  var secFields = compareFields(compareWithout(sa, ['diagram','views']), compareWithout(sb, ['diagram','views']), pa, pb)
    .concat(compareFields(compareWithout(da, COMPARE_DIAGRAM_COLLECTIONS), compareWithout(db, COMPARE_DIAGRAM_COLLECTIONS), dpa, dpb));
  if ((sa.diagram ? 1 : 0) !== (sb.diagram ? 1 : 0) && !secFields.length) secFields.push({beforePath:sa.diagram ? dpa : null, afterPath:sb.diagram ? dpb : null, before:sa.diagram, after:sb.diagram});
  var sectionEntry = null;
  if (secFields.length){ sectionEntry = {kind:'section', status:'modified', cause:'document', beforePath:pa, afterPath:pb,
    key:{before:compareSectionKey(ra), after:compareSectionKey(rb)}, fields:secFields, effects:[], _all:true}; local.push(sectionEntry); }
  /* Nodes are keyed maps. */
  var na = da.nodes || {}, nb = db.nodes || {};
  Object.keys(na).forEach(function(k){
    if (!Object.prototype.hasOwnProperty.call(nb, k)) local.push({kind:'node', status:'removed', origin:'local', cause:'document', beforePath:compareKey(dpa + '.nodes', k), afterPath:null, key:{before:k, after:null}, fields:[], effects:[]});
    else if (!compareSame(na[k], nb[k])) local.push({kind:'node', status:'modified', origin:'local', cause:'document', beforePath:compareKey(dpa + '.nodes', k), afterPath:compareKey(dpb + '.nodes', k), key:{before:k, after:k}, fields:compareFields(na[k], nb[k], compareKey(dpa + '.nodes', k), compareKey(dpb + '.nodes', k)), effects:[]});
  });
  Object.keys(nb).forEach(function(k){ if (!Object.prototype.hasOwnProperty.call(na, k)) local.push({kind:'node', status:'added', origin:'local', cause:'document', beforePath:null, afterPath:compareKey(dpb + '.nodes', k), key:{before:null, after:k}, fields:[], effects:[]}); });
  compareRecordEntries('edge', {a:da.edges, b:db.edges}, dpa + '.edges', dpb + '.edges', {origin:'local'}, local, {natural:[COMPARE_EDGE_KEY]});
  compareRecordEntries('panel', {a:da.panels, b:db.panels}, dpa + '.panels', dpb + '.panels', {}, local);
  var stepMatch = compareRecordEntries('step', {a:da.steps, b:db.steps}, dpa + '.steps', dpb + '.steps', {}, local, {leftover:true,
    natural:[COMPARE_CAPTION_KEY]});
  compareRecordEntries('path', {a:da.paths, b:db.paths}, dpa + '.paths', dpb + '.paths', {}, local);
  compareRecordEntries('layout', {a:da.layouts, b:db.layouts}, dpa + '.layouts', dpb + '.layouts', {}, local);
  compareRecordEntries('view', {a:sa.views, b:sb.views}, pa + '.views', pb + '.views', {}, local);
  var imports = [];
  compareRecordEntries('import', {a:da.topologyImports, b:db.topologyImports}, dpa + '.topologyImports', dpb + '.topologyImports', {origin:'imported'}, imports, {natural:COMPARE_IMPORT_KEYS});
  /* Resolved topology: imported nodes and edges are those absent from the
     authored diagram. Differences attach to a changed import declaration that
     covers their prefix; otherwise the provider caused them. */
  var xa = (resA && resA.section && resA.section.diagram) || da, xb = (resB && resB.section && resB.section.diagram) || db;
  var resolvedDiffs = compareResolved(da, db, xa, xb, 'resolved:' + dpa, 'resolved:' + dpb);
  resolvedDiffs.forEach(function(r){
    var owner = imports.find(function(e){
      return [e._a, e._b].some(function(imp){ return imp && imp.as != null && r.key.indexOf(String(imp.as) + '::') === 0; });
    });
    if (owner){ (owner.resolved || (owner.resolved = [])).push.apply(owner.resolved, r.items); }
    else {
      var ownA = compareImportOwner(da.topologyImports, r.key), ownB = compareImportOwner(db.topologyImports, r.key);
      var hasA = r.status !== 'added', hasB = r.status !== 'removed';
      local.push({kind:r.kind, status:r.status, origin:'imported', cause:'provider',
        beforePath:!hasA ? null : ownA < 0 ? r.beforePath : compareKey(dpa + '.topologyImports', ownA),
        afterPath:!hasB ? null : ownB < 0 ? r.afterPath : compareKey(dpb + '.topologyImports', ownB),
        key:{before:hasA ? r.keyA : null, after:hasB ? r.keyB : null}, fields:r.fields, effects:[]});
    }
  });
  imports.forEach(function(e){ e.resolved = e.resolved || []; local.push(e); });
  /* Reader effects come from the resolved diagrams. */
  var diffs = compareReaderDiffs(xa, xb, stepMatch.pairs);
  /* Section effects: see compareSectionEffects (symmetric counterfactual). */
  var sectionDiffs = sectionEntry ? compareSectionEffects(xa, xb, diffs) : [];
  local.forEach(function(e){
    var touches = compareTouches(e, {da:xa, db:xb, dpa:dpa, dpb:dpb});
    e.section = {before:e.beforePath == null ? null : ia, after:e.afterPath == null ? null : ib};
    e.effects = e === sectionEntry ? sectionDiffs : diffs.filter(function(d){ return touches(d); });
    if (e.kind === 'path' && e.status !== 'modified'){
      var rec = e._a || e._b, dd = e._a ? da : db, ids = Array.isArray(rec.steps) ? rec.steps : [];
      var src = ids.map(function(id){ return (dd.steps || []).findIndex(function(st){ return st && st.id === id; }); }).filter(function(i){ return i >= 0; });
      e.effects = [{pathId:rec.id, target:{kind:'path', id:rec.id}, category:'membership', beforeSteps:e._a ? src : [], afterSteps:e._b ? src : [], changes:[]}];
    }
    if (e.effects.length) e.effect = 'state';
    else if (e.kind === 'panel' && e.status === 'modified' && e.fields.some(function(f){ return !/\.visible$/.test(f.afterPath || f.beforePath); })){
      e.effect = 'declaration';
      e.scopeBefore = compareVisibleScope(xa, e._a.id);
      e.scopeAfter = compareVisibleScope(xb, e._b.id);
    }
    delete e._a; delete e._b; delete e._ia; delete e._ib; delete e._all;
    entries.push(e);
  });
}
function compareImportOwner(imports, key){
  return (Array.isArray(imports) ? imports : []).findIndex(function(imp){ return imp && imp.as != null && String(key).indexOf(String(imp.as) + '::') === 0; });
}
/* Diagram-level settings read by the folds: story time and device defaults
   feed panel state (battery, clocks). None of them change node tones or
   panel visibility. */
var COMPARE_FOLD_FIELDS = ['storyTime','deviceDefaults'];
function comparePathsContaining(d, src){
  var out = [];
  if (src == null) return out;
  diagramPathList(d).forEach(function(path){ if (path.indices.indexOf(src) >= 0) out.push(path.id); });
  return out;
}
/* Section settings read by the folds (storyTime, deviceDefaults). Which steps
   the section edit changes is decided counterfactually and symmetrically: a
   coordinate belongs to the section if applying only the section's settings
   to the before diagram changes it, or removing them from the after diagram
   changes it. The values reported are the real before/after folded values, as
   for every other effect, so compare(b, a) mirrors compare(a, b). */
function compareSectionEffects(xa, xb, actual){
  var changed = COMPARE_FOLD_FIELDS.filter(function(k){ return !compareSame(xa[k], xb[k]); });
  if (!changed.length) return [];
  function swap(d, from){
    var out = Object.assign({}, d);
    changed.forEach(function(k){ if (from[k] === undefined) delete out[k]; else out[k] = from[k]; });
    return out;
  }
  function ident(d){ return (d.steps || []).map(function(s, i){ return [i, i]; }); }
  function sets(diffs, side){
    var out = {};
    diffs.forEach(function(d){ if (d.category === 'state' && d.target.kind === 'panel') out[JSON.stringify([d.pathId, d.target.id])] = d[side]; });
    return out;
  }
  var fromBefore = sets(compareReaderDiffs(xa, swap(xa, xb), ident(xa)), 'beforeSteps');
  var fromAfter = sets(compareReaderDiffs(swap(xb, xa), xb, ident(xb)), 'afterSteps');
  var num = function(x, y){ return (x === 'ambient') - (y === 'ambient') || (x === 'ambient' ? 0 : x - y); };
  var out = [];
  actual.forEach(function(d){
    if (d.category !== 'state' || d.target.kind !== 'panel') return;
    var key = JSON.stringify([d.pathId, d.target.id]), a = fromBefore[key] || [], b = fromAfter[key] || [];
    var changes = d.changes.filter(function(c){
      return c.beforeStep != null && a.indexOf(c.beforeStep) >= 0 || c.afterStep != null && b.indexOf(c.afterStep) >= 0;
    });
    if (!changes.length) return;
    var bs = [], as = [];
    changes.forEach(function(c){ if (c.beforeStep != null && bs.indexOf(c.beforeStep) < 0) bs.push(c.beforeStep); if (c.afterStep != null && as.indexOf(c.afterStep) < 0) as.push(c.afterStep); });
    out.push({pathId:d.pathId, target:d.target, category:d.category, beforeSteps:bs.sort(num), afterSteps:as.sort(num), changes:changes});
  });
  return out;
}

function compareTouches(e, ctx){
  if (e.kind === 'path' && e.status === 'modified'){ var pid = (e._b || e._a).id; return function(d){ return d.pathId === pid; }; }
  if (e.kind === 'panel'){ var id = (e._a || e._b).id; return function(d){ return d.target.kind === 'panel' && d.target.id === id; }; }
  if (e.kind === 'node'){ var nk = e.key && (e.key.after != null ? e.key.after : e.key.before); return function(d){ return d.category === 'tone' && d.target.id === nk; }; }
  if (e.kind === 'step'){
    var ka = compareStepPatchKeys(e._a), kb = compareStepPatchKeys(e._b);
    var all = ka.all || kb.all || (e._a && e._b && !compareSame(e._a.time, e._b.time));
    var paths = comparePathsContaining(ctx.da, e._ia).concat(comparePathsContaining(ctx.db, e._ib));
    return function(d){
      if (paths.indexOf(d.pathId) < 0) return false;
      if (all && d.target.kind === 'panel' && d.category === 'state') return true;
      var keys = d.category === 'tone' ? ka.tone.concat(kb.tone) : d.category === 'visibility' ? ka.visibility.concat(kb.visibility) : ka.state.concat(kb.state);
      return keys.indexOf(d.target.id) >= 0;
    };
  }
  return function(){ return false; };
}
/* Imported nodes/edges in resolved diagrams. */
function compareResolved(da, db, xa, xb, pa, pb){
  var out = [], la = da.nodes || {}, lb = db.nodes || {}, ra = xa.nodes || {}, rb = xb.nodes || {};
  function imported(map, local){ return Object.keys(map).filter(function(k){ return !Object.prototype.hasOwnProperty.call(local, k); }); }
  var ia = imported(ra, la), ib = imported(rb, lb);
  ia.forEach(function(k){
    var pA = compareKey(pa + '.nodes', k), pB = compareKey(pb + '.nodes', k);
    if (ib.indexOf(k) < 0) out.push({kind:'node', key:k, keyA:k, keyB:null, status:'removed', beforePath:pA, afterPath:null, fields:[], items:[{kind:'node', status:'removed', origin:'imported', beforePath:pA, afterPath:null}]});
    else if (!compareSame(ra[k], rb[k])){
      var f = compareFields(ra[k], rb[k], pA, pB);
      out.push({kind:'node', key:k, keyA:k, keyB:k, status:'modified', beforePath:pA, afterPath:pB, fields:f, items:f.map(function(x){ return Object.assign({kind:'node', status:'modified', origin:'imported'}, x); })});
    }
  });
  ib.forEach(function(k){
    if (ia.indexOf(k) >= 0) return;
    var pB = compareKey(pb + '.nodes', k);
    out.push({kind:'node', key:k, keyA:null, keyB:k, status:'added', beforePath:null, afterPath:pB, fields:[], items:[{kind:'node', status:'added', origin:'imported', beforePath:null, afterPath:pB}]});
  });
  function importedEdges(edges, local){
    var localKeys = (local || []).map(COMPARE_EDGE_KEY);
    return (edges || []).map(function(e, i){ return {e:e, i:i}; }).filter(function(x){ return localKeys.indexOf(COMPARE_EDGE_KEY(x.e)) < 0; });
  }
  var ea = importedEdges(xa.edges, da.edges), eb = importedEdges(xb.edges, db.edges);
  var m = comparePairs(ea.map(function(x){ return x.e; }), eb.map(function(x){ return x.e; }), [COMPARE_EDGE_KEY]);
  function keyOf(e){ return String(e.from); }
  m.pairs.forEach(function(p){
    var a = ea[p[0]], b = eb[p[1]];
    if (compareSame(a.e, b.e)) return;
    var A = compareKey(pa + '.edges', a.i), B = compareKey(pb + '.edges', b.i), f = compareFields(a.e, b.e, A, B);
    out.push({kind:'edge', key:keyOf(b.e), keyA:a.i, keyB:b.i, status:'modified', beforePath:A, afterPath:B, fields:f, items:f.map(function(x){ return Object.assign({kind:'edge', status:'modified', origin:'imported'}, x); })});
  });
  m.removed.forEach(function(i){ var A = compareKey(pa + '.edges', ea[i].i); out.push({kind:'edge', key:keyOf(ea[i].e), keyA:ea[i].i, keyB:null, status:'removed', beforePath:A, afterPath:null, fields:[], items:[{kind:'edge', status:'removed', origin:'imported', beforePath:A, afterPath:null}]}); });
  m.added.forEach(function(i){ var B = compareKey(pb + '.edges', eb[i].i); out.push({kind:'edge', key:keyOf(eb[i].e), keyA:null, keyB:eb[i].i, status:'added', beforePath:null, afterPath:B, fields:[], items:[{kind:'edge', status:'added', origin:'imported', beforePath:null, afterPath:B}]}); });
  return out;
}
/* Views owned by a tab (blocks[i].tabs[j].views). Tabs pair by label, then position. */
function compareTabViews(A, B, entries){
  function owners(page){
    var out = [], raw = page && (page.blocks || page.sections) || [], pfx = page && page.blocks ? 'blocks' : 'sections';
    raw.forEach(function(b, i){ if (b && Array.isArray(b.tabs)) b.tabs.forEach(function(t, j){ out.push({tab:t, label:t && t.label, views:t && t.views, path:pfx + '[' + i + '].tabs[' + j + ']', i:i, j:j}); }); });
    return out;
  }
  var oa = owners(A), ob = owners(B), used = new Set();
  oa.forEach(function(a){
    var b = ob.find(function(x){ return !used.has(x) && x.label === a.label; }) || ob.find(function(x){ return !used.has(x) && x.i === a.i && x.j === a.j; });
    if (!b){ entries.push({kind:'tab', status:'removed', cause:'document', beforePath:a.path, afterPath:null, section:{before:null, after:null}, key:{before:a.j, after:null}, fields:[], effects:[]}); return; }
    used.add(b);
    var tabFields = compareFields(compareWithout(a.tab, ['sections','views']), compareWithout(b.tab, ['sections','views']), a.path, b.path);
    if (tabFields.length) entries.push({kind:'tab', status:'modified', cause:'document', beforePath:a.path, afterPath:b.path, section:{before:null, after:null}, key:{before:a.j, after:b.j}, fields:tabFields, effects:[]});
    var local = [];
    compareRecordEntries('view', {a:a.views, b:b.views}, a.path + '.views', b.path + '.views', {}, local);
    local.forEach(function(e){ e.section = {before:null, after:null}; delete e._a; delete e._b; delete e._ia; delete e._ib; entries.push(e); });
  });
  ob.forEach(function(b){ if (!used.has(b)) entries.push({kind:'tab', status:'added', cause:'document', beforePath:null, afterPath:b.path, section:{before:null, after:null}, key:{before:null, after:b.j}, fields:[], effects:[]}); });
}
/* Coverage ledger: line hunks from a longest-common-subsequence diff. */
function compareLedger(a, b, entries){
  a = typeof a === 'string' ? a : null; b = typeof b === 'string' ? b : null;
  if (a === b) return;
  if (a == null || b == null){
    var text = a == null ? b : a, n = text.split('\n').length;
    entries.push({kind:'ledger', status:a == null ? 'added' : 'removed', cause:'document', beforePath:a == null ? null : 'ledger', afterPath:b == null ? null : 'ledger', effects:[],
      fields:[{beforePath:a == null ? 'ledger:' : 'ledger:1-' + n, afterPath:b == null ? 'ledger:' : 'ledger:1-' + n, before:a, after:b}]});
    return;
  }
  var x = a.split('\n'), y = b.split('\n'), m = x.length, n2 = y.length, L = [];
  for (var i = 0; i <= m; i++){ L.push(new Array(n2 + 1).fill(0)); }
  for (i = m - 1; i >= 0; i--) for (var j = n2 - 1; j >= 0; j--) L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  var fields = [], ia = 0, ib = 0, hunk = null;
  function flush(){ if (!hunk) return;
    fields.push({beforePath:'ledger:' + (hunk.a0 + 1) + '-' + hunk.a1, afterPath:'ledger:' + (hunk.b0 + 1) + '-' + hunk.b1,
      before:x.slice(hunk.a0, hunk.a1).join('\n'), after:y.slice(hunk.b0, hunk.b1).join('\n')}); hunk = null; }
  while (ia < m || ib < n2){
    if (ia < m && ib < n2 && x[ia] === y[ib]){ flush(); ia++; ib++; continue; }
    if (!hunk) hunk = {a0:ia, a1:ia, b0:ib, b1:ib};
    if (ib < n2 && (ia >= m || L[ia][ib + 1] >= L[ia + 1][ib])){ ib++; hunk.b1 = ib; }
    else { ia++; hunk.a1 = ia; }
  }
  flush();
  entries.push({kind:'ledger', status:'modified', cause:'document', beforePath:'ledger', afterPath:'ledger', fields:fields, effects:[]});
}
