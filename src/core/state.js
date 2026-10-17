/* Pure path-local state folding. Uses stepTonePatch(), TONE_SET and the
   registered PanelRegistry/foldCommonPanelStates dispatch at call time. */

/* ---------------- node-tone folding ----------------
   Like panel patches, node tones are sparse authoring deltas folded into
   absolute per-step snapshots. Unknown ids/tokens are ignored here (the
   validator warns); `base` and null delete the carried tone. */
function foldNodeTones(d){
  d = d || {};
  var nodes = d.nodes || {};
  var steps = Array.isArray(d.steps) ? d.steps : [];
  var carried = {}, states = [];
  steps.forEach(function(st){
    var patch = stepTonePatch(st);
    if (patch) Object.keys(patch).forEach(function(id){
      if (!Object.prototype.hasOwnProperty.call(nodes, id)) return;
      var tone = patch[id];
      if (tone === null || tone === 'base'){
        delete carried[id];
      } else if (TONE_SET.indexOf(tone) >= 0 && tone !== 'base'){
        carried[id] = tone;
      }
    });
    var snap = {};
    Object.keys(carried).forEach(function(id){ snap[id] = carried[id]; });
    states.push(snap);
  });
  if (!steps.length) states.push({});
  return states;
}

/* ---------------- panel-state folding ----------------
   Authors emit sparse per-step patches; we fold them into COMPLETE state per
   step at load time, so any step jump renders from absolute state, never
   deltas. Rules:
   - state N = shallow merge of state N-1 and step N's patch for that panel;
   - a "log" patch key APPENDS (cumulative array of lines);
   - an "enterOnce" sub-object applies only at its own step (not carried). */

function foldPanelStates(d){
  var panels = d.panels || [];
  var steps = d.steps || [];
  var out = {};
  /* Story time is resolved once per selected path; panels that declare a
     storyTime facet derive time-dependent fields after their own fold. */
  var story = storyTimeSequence(d);
  panels.forEach(function(panel){
    if (!panel || !panel.id) return;
    var descriptor = PanelRegistry.get(panel.type);
    var fold = descriptor && descriptor.fold || foldCommonPanelStates;
    var states = foldDeclaredPanelStates(panel, steps, fold, descriptor, d);
    if (descriptor && descriptor.storyTime) states = descriptor.storyTime(panel, states, steps, story, d) || states;
    out[panel.id] = states;
  });
  return out;
}

/* ---------------- panel declaration overrides ----------------
   `declare` inside a step's panel patch overrides declaration fields of that
   panel (max, unit, title, columns, spans, ...) from that step on along the
   selected path. Rules:
   - the effective declaration = the authored panel shallow-merged with every
     accepted `declare` seen so far; later keys replace earlier ones;
   - a key set to null removes its override (back to the authored value);
   - `enterOnce.declare` applies to its own step only;
   - `id`, `type`, `initial` and `visible` are reserved and ignored;
   - an override whose effective declaration fails the panel's own
     validateDeclaration with errors is ignored at that step.
   The fold and the validator share this one helper so they always agree. The
   returned array holds the authored `panel` object itself (same identity)
   wherever no override applies, which lets callers detect "unchanged". */
var PANEL_DECLARE_RESERVED = (function(){
  var out = Object.create(null);
  out.id = ''; out.type = ''; out.initial = '';
  out.visible = 'use panelVisibility to show or hide a panel';
  ['__proto__', 'constructor', 'prototype'].forEach(function(key){ out[key] = ''; });
  return out;
})();
function panelPatchHasDeclare(patch){
  return specObject(patch) && (Object.prototype.hasOwnProperty.call(patch, 'declare') ||
    (specObject(patch.enterOnce) && Object.prototype.hasOwnProperty.call(patch.enterOnce, 'declare')));
}
function foldPanelDeclarations(panel, steps, options){
  options = options || {};
  steps = Array.isArray(steps) ? steps : [];
  var report = typeof options.report === 'function' ? options.report : null;
  var descriptor = options.descriptor !== undefined ? options.descriptor
    : (typeof PanelRegistry !== 'undefined' && panel ? PanelRegistry.get(panel.type) : null);
  var diagram = options.diagram || null;
  var overrides = Object.create(null), current = panel, out = [];
  function merged(keys){
    var names = Object.keys(keys);
    if (!names.length) return panel;
    var next = Object.assign({}, panel);
    names.forEach(function(key){ next[key] = keys[key]; });
    return next;
  }
  function same(a, b){
    if (a === b) return true;
    try { return JSON.stringify(a) === JSON.stringify(b); } catch (ex) { return false; }
  }
  function applyOps(base, ops, index, prefix){
    if (!specObject(ops)){
      if (report) report(index, prefix + ': expected an object of declaration fields — ignored');
      return null;
    }
    var next = Object.assign(Object.create(null), base);
    Object.keys(ops).forEach(function(key){
      if (Object.prototype.hasOwnProperty.call(PANEL_DECLARE_RESERVED, key)){
        if (report) report(index, prefix + '.' + key + ': reserved key — ignored' +
          (PANEL_DECLARE_RESERVED[key] ? ' (' + PANEL_DECLARE_RESERVED[key] + ')' : ''));
        return;
      }
      if (ops[key] === null) delete next[key];
      else next[key] = ops[key];
    });
    return next;
  }
  function accepted(candidate, index, prefix, ops){
    if (candidate === panel || !descriptor || typeof descriptor.validateDeclaration !== 'function') return true;
    var warnings = [], errors = [];
    try { descriptor.validateDeclaration(candidate, prefix, warnings, errors, diagram); }
    catch (ex) { errors.push(prefix + ': ' + (ex && ex.message ? ex.message : 'invalid declaration')); }
    if (report){
      /* The authored declaration was already checked at panels[i]; only
         repeat findings about keys this step overrides. */
      var keys = Object.keys(ops).filter(function(key){ return ops[key] !== null; });
      warnings.forEach(function(text){
        if (text.indexOf(prefix + ':') === 0 || keys.some(function(key){ return text.indexOf(prefix + '.' + key) === 0; }))
          report(index, text);
      });
      errors.forEach(function(text){ report(index, text + ' — declaration override at this step ignored'); });
    }
    return !errors.length;
  }
  steps.forEach(function(step, i){
    var patch = (stepPanelPatch(step) || {})[panel.id];
    patch = specObject(patch) ? patch : null;
    if (patch && Object.prototype.hasOwnProperty.call(patch, 'declare')){
      var next = applyOps(overrides, patch.declare, i, 'declare');
      if (next){
        var candidate = merged(next);
        if (same(candidate, current)) candidate = current;
        if (candidate === current || accepted(candidate, i, 'declare', patch.declare)){
          overrides = next;
          current = candidate;
        }
      }
    }
    var effective = current;
    var once = patch && specObject(patch.enterOnce) && Object.prototype.hasOwnProperty.call(patch.enterOnce, 'declare')
      ? patch.enterOnce.declare : undefined;
    if (once !== undefined){
      var onceKeys = applyOps(overrides, once, i, 'enterOnce.declare');
      if (onceKeys){
        var onceCandidate = merged(onceKeys);
        if (same(onceCandidate, current)) onceCandidate = current;
        if (onceCandidate === current || accepted(onceCandidate, i, 'enterOnce.declare', once)) effective = onceCandidate;
      }
    }
    out.push(effective);
  });
  if (!steps.length) out.push(panel);
  return out;
}
/* The runtime fold never sees `declare`: it is not state. Returns the same
   step object when there is nothing to remove. */
function stepWithoutPanelDeclare(step, id){
  var patches = stepPanelPatch(step), patch = patches && patches[id];
  if (!panelPatchHasDeclare(patch)) return step;
  var clean = Object.assign({}, patch);
  delete clean.declare;
  if (specObject(clean.enterOnce) && Object.prototype.hasOwnProperty.call(clean.enterOnce, 'declare')){
    var once = Object.assign({}, clean.enterOnce);
    delete once.declare;
    if (Object.keys(once).length) clean.enterOnce = once;
    else delete clean.enterOnce;
  }
  var cleanPatches = Object.assign({}, patches);
  cleanPatches[id] = clean;
  var next = Object.assign({}, step);
  next[step.panels === patches ? 'panels' : 'patch'] = cleanPatches;
  return next;
}
/* Without overrides this is exactly `fold(panel, steps)`. With overrides,
   each distinct effective declaration folds the whole (declare-free) path
   once and contributes the snapshots of the steps it governs, so appended
   histories (log, timeline events) and one-step `enterOnce` values keep
   their ordinary semantics across a declaration change for every fold
   family, including folds that do not start from `initial`. */
function foldDeclaredPanelStates(panel, steps, fold, descriptor, d){
  var decls = foldPanelDeclarations(panel, steps, {descriptor: descriptor, diagram: d});
  if (!decls.some(function(decl){ return decl !== panel; })) return fold(panel, steps);
  var clean = steps.map(function(step){ return stepWithoutPanelDeclare(step, panel.id); });
  var folds = new Map(), states = [];
  decls.forEach(function(decl, i){
    if (!folds.has(decl)) folds.set(decl, fold(decl, clean));
    states.push(folds.get(decl)[i]);
  });
  return states;
}
/* Effective declaration per panel per step for the player and inspectors. */
function foldDiagramPanelDeclarations(d){
  var out = Object.create(null), steps = d.steps || [];
  (d.panels || []).forEach(function(panel){
    if (!panel || !panel.id) return;
    out[panel.id] = foldPanelDeclarations(panel, steps, {descriptor: PanelRegistry.get(panel.type), diagram: d});
  });
  return out;
}

/* Visibility belongs to the panel frame, not a widget's state schema. Fold
   the selected path in full, including stops omitted by the current view. */
function foldPanelVisibility(d){
  var out = Object.create(null);
  (d.panels || []).forEach(function(panel){
    if (!panel || !panel.id) return;
    var visible = panel.visible !== false;
    out[panel.id] = (d.steps || []).map(function(step){
      var patch = step && step.panelVisibility;
      if (specObject(patch) && Object.prototype.hasOwnProperty.call(patch, panel.id) && typeof patch[panel.id] === 'boolean')
        visible = patch[panel.id];
      return visible;
    });
    if (!out[panel.id].length) out[panel.id].push(visible);
  });
  return out;
}
