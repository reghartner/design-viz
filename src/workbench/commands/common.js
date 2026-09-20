/* Shared pure command helpers and bulk dispatch. Load source edits, raw
   targets and the validator/panel core first; dispatch calls the graph,
   document and narrative command leaves at call time. No UI/session access. */

/* Registry-backed compatibility views. No editor caches a list of panel types. */
function panelAuthoring(type){
  var definition = PanelRegistry.get(type);
  return definition && definition.authoring || {};
}
function panelAuthoringMap(key){
  return new Proxy(Object.create(null), {
    get:function(_,type){return panelAuthoring(type)[key];},
    ownKeys:function(){return PanelRegistry.types().filter(function(type){return Object.prototype.hasOwnProperty.call(panelAuthoring(type),key);});},
    getOwnPropertyDescriptor:function(_,type){
      var value=panelAuthoring(type)[key];
      return value === undefined ? undefined : {configurable:true,enumerable:true,value:value};
    }
  });
}

function builderUniqueKey(taken, stem){
  var n = 1;
  while (taken[stem + n]) n++;
  return stem + n;
}
function builderFlatRowIds(rows){
  var ids = [];
  (rows || []).forEach(function(row){
    (Array.isArray(row) ? row : []).forEach(function(slot){
      if (typeof slot === 'string') ids.push(slot);
      else if (Array.isArray(slot)) slot.forEach(function(s){ if (typeof s === 'string') ids.push(s); });
    });
  });
  return ids;
}

/* ---------------- field edits, renames, deletes, reorders ----------------
   Two edit strategies. Single-field edits are SURGICAL: replace, insert, or
   remove one member's text and leave the rest of the document byte-for-byte
   untouched. Edits that must stay consistent across several diagram keys
   (renaming a node id, deleting a node, retargeting an edge) REWRITE one
   value — usually the section's diagram object — from a mutated copy,
   serialized with two-space indents and re-indented to the container
   depth. */

function builderClone(v){ return JSON.parse(JSON.stringify(v)); }
function builderRewrite(text, raw, path, mutate){
  /* Rewrite the value at path from a mutated deep copy. mutate(copy) edits
     in place and may return {error}. */
  var cur = specValueAt(raw, path);
  if (cur == null || typeof cur !== 'object')
    return {error: 'element not found in the editor text (click Render, then reselect)'};
  var copy = builderClone(cur);
  var out = mutate(copy);
  if (out && out.error) return out;
  var r = jsonReplaceValue(text, path, JSON.stringify(copy, null, 2));
  if (!r) return {error: 'could not rewrite the editor text'};
  return r;
}

function planSetField(text, raw, targetPath, key, valueTextOrNull){
  /* Surgical single-field edit on the object at targetPath. */
  if (!jsonLocate(text, targetPath))
    return {error: 'element not found in the editor text (click Render, then reselect)'};
  var r = jsonSetField(text, targetPath, key, valueTextOrNull);
  if (!r) return {error: 'could not edit the editor text'};
  return r;
}

function planReplaceValue(text, raw, path, valueText){
  /* Replace one whole value (a bullet string, a paragraph) in place. */
  if (!jsonLocate(text, path))
    return {error: 'element not found in the editor text (click Render, then reselect)'};
  var r = jsonReplaceValue(text, path, valueText);
  if (!r) return {error: 'could not edit the editor text'};
  return r;
}
function planSetFields(text, raw, targetPath, pairs){
  /* Several surgical field edits on one object under a single undo step
     (the label drag commits labelDx and labelDy together). */
  if (!jsonLocate(text, targetPath))
    return {error: 'element not found in the editor text (click Render, then reselect)'};
  var out = text;
  for (var i = 0; i < pairs.length; i++){
    var r = jsonSetField(out, targetPath, pairs[i][0], pairs[i][1]);
    if (!r) return {error: 'could not edit the editor text'};
    out = r.text;
  }
  return {text: out};
}
function planDeleteListItem(text, raw, containerPath, index){
  /* Remove one entry from a plain list (bullets, text paragraphs,
     contract fields). */
  if (!jsonLocate(text, containerPath))
    return {error: 'list not found in the editor text'};
  var r = jsonRemoveMember(text, containerPath, index);
  if (!r) return {error: 'no such entry'};
  return r;
}

/* ---------------- multi-select: bulk planners ----------------
   A multi-selection is HOMOGENEOUS (one kind) — mixed-kind bulk deletes
   interact with cascades (a node delete prunes edges/steps) in ways that
   silently invalidate sibling targets. Deletes apply highest-index-first
   per section so earlier deletions cannot shift later targets. */
var BUILDER_MULTI_KINDS = ['node', 'edge', 'step', 'panel', 'bullet', 'crow'];

function builderDeletePlan(text, raw, t){
  if (t.kind === 'tab') return planDeleteTab(text, raw, t.block, t.tab);
  if (t.kind === 'group') return planDeleteGroup(text, raw, t.section, t.id);
  if (t.kind === 'node') return planDeleteNode(text, raw, t.section, t.id);
  if (t.kind === 'edge') return planDeleteEdge(text, raw, t.section, t.index);
  if (t.kind === 'step') return planDeleteStep(text, raw, t.section, t.index);
  if (t.kind === 'panel') return planDeletePanel(text, raw, t.section, t.index);
  var rec = specSectionPaths(raw)[t.section];
  if (!rec) return {error: 'no such section'};
  if (t.kind === 'bullet') return planDeleteListItem(text, raw, rec.section.concat(['bullets']), t.index);
  if (t.kind === 'para'){
    var sec = specValueAt(raw, rec.section);
    if (sec && typeof sec.text === 'string') return planSetField(text, raw, rec.section, 'text', null);
    return planDeleteListItem(text, raw, rec.section.concat(['text']), t.index);
  }
  if (t.kind === 'crow') return planDeleteListItem(text, raw, rec.section.concat(['contract', 'fields']), t.index);
  return planDeleteSection(text, raw, t.section);
}

function planBulkSetField(text, targets, key, valueTextOrNull){
  var cur = text;
  for (var i = 0; i < targets.length; i++){
    var raw;
    try { raw = JSON.parse(cur); }
    catch (ex){ return {error: 'bulk stopped: the JSON no longer parses (' + ex.message + ')'}; }
    var path = builderTargetPath(raw, targets[i]);
    if (!path) return {error: 'selection ' + (i + 1) + ' no longer resolves — re-render and reselect'};
    var plan = planSetField(cur, raw, path, key, valueTextOrNull);
    if (plan.error) return {error: 'selection ' + (i + 1) + ': ' + plan.error};
    cur = plan.text;
  }
  return {text: cur, count: targets.length};
}

function planBulkDelete(text, targets){
  var list = targets.slice().sort(function(a, b){
    if ((a.section || 0) !== (b.section || 0)) return (b.section || 0) - (a.section || 0);
    return (typeof b.index === 'number' ? b.index : 0) - (typeof a.index === 'number' ? a.index : 0);
  });
  var cur = text;
  for (var i = 0; i < list.length; i++){
    var raw;
    try { raw = JSON.parse(cur); }
    catch (ex){ return {error: 'bulk stopped: the JSON no longer parses (' + ex.message + ')'}; }
    var plan = builderDeletePlan(cur, raw, list[i]);
    if (plan.error) return {error: 'selection ' + (i + 1) + ': ' + plan.error};
    cur = plan.text;
  }
  return {text: cur, count: list.length};
}
