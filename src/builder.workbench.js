/* builder.workbench.js — workbench builder: click a rendered element to jump
   to its definition in the spec editor (with per-element authoring guidance),
   and insert ready-made node/edge/step/panel/section snippets.

   The top half is pure text/JSON utilities (unit-tested in
   tests/builder.test.js); initWorkbenchBuilder at the bottom wires the DOM
   and is only called by boot.workbench.js. */

/* ---------------- JSON source locator ----------------
   A tolerant scanner over the RAW editor text: given a path (array of object
   keys / array indices), find the character range of the value so the
   textarea can select it. Whitespace-agnostic; strings with escapes are
   skipped correctly. On duplicate keys the FIRST occurrence wins (JSON.parse
   keeps the last — hand-authored specs do not duplicate keys, and a miss
   only mis-places the selection). */

function jsonSkipWS(text, i){
  while (i < text.length && ' \t\n\r'.indexOf(text[i]) >= 0) i++;
  return i;
}
function jsonSkipString(text, i){
  /* i at the opening quote; returns the index just past the closing quote */
  i++;
  while (i < text.length){
    if (text[i] === '\\') i += 2;
    else if (text[i] === '"') return i + 1;
    else i++;
  }
  return i;
}
function jsonSkipValue(text, i){
  /* i at the first char of a value; returns the index just past it */
  i = jsonSkipWS(text, i);
  var c = text[i];
  if (c === '"') return jsonSkipString(text, i);
  if (c === '{' || c === '['){
    var open = c, close = c === '{' ? '}' : ']', depth = 0;
    while (i < text.length){
      c = text[i];
      if (c === '"'){ i = jsonSkipString(text, i); continue; }
      if (c === open) depth++;
      else if (c === close){ depth--; if (!depth) return i + 1; }
      i++;
    }
    return i;
  }
  while (i < text.length && ',}] \t\n\r'.indexOf(text[i]) < 0) i++;
  return i;
}
function jsonContainer(text, i){
  /* Parse the container ({...} or [...]) starting at/after i. Returns
     {isObj, open, close, members:[{key, keyStart, valStart, valEnd}]} —
     key is the decoded object key or the array index — or null. */
  i = jsonSkipWS(text, i);
  var c = text[i];
  if (c !== '{' && c !== '[') return null;
  var isObj = c === '{';
  var members = [];
  var j = i + 1, idx = 0;
  while (j < text.length){
    j = jsonSkipWS(text, j);
    if (j >= text.length) break;
    var ch = text[j];
    if (ch === (isObj ? '}' : ']')) return {isObj: isObj, open: i, close: j, members: members};
    if (ch === ','){ j++; continue; }
    if (isObj){
      if (ch !== '"'){ j++; continue; }
      var keyStart = j, keyEnd = jsonSkipString(text, j);
      var key;
      try { key = JSON.parse(text.slice(keyStart, keyEnd)); } catch (ex){ key = null; }
      j = jsonSkipWS(text, keyEnd);
      if (text[j] === ':') j++;
      j = jsonSkipWS(text, j);
      var valStart = j, valEnd = jsonSkipValue(text, j);
      members.push({key: key, keyStart: keyStart, valStart: valStart, valEnd: valEnd});
      j = valEnd;
    } else {
      var vs = jsonSkipWS(text, j), ve = jsonSkipValue(text, vs);
      members.push({key: idx++, keyStart: vs, valStart: vs, valEnd: ve});
      j = ve;
    }
  }
  return null; /* unterminated container */
}
function jsonLocate(text, path){
  /* Character range {start, end, keyStart} of the value at path; [] means
     the whole document. null when any path segment is absent. */
  var start = jsonSkipWS(text, 0);
  if (start >= text.length) return null;
  var node = {keyStart: start, valStart: start, valEnd: jsonSkipValue(text, start)};
  for (var p = 0; p < path.length; p++){
    var cont = jsonContainer(text, node.valStart);
    if (!cont) return null;
    var found = null;
    for (var m = 0; m < cont.members.length; m++){
      if (cont.members[m].key === path[p]){ found = cont.members[m]; break; }
    }
    if (!found) return null;
    node = found;
  }
  return {start: node.valStart, end: node.valEnd, keyStart: node.keyStart};
}

/* ---------------- insertion ---------------- */

function jsonIndentFor(text, cont){
  /* Indent for a new member: copy the last member's line indent, else the
     opening bracket's line indent plus two spaces. */
  var anchor = cont.members.length ? cont.members[cont.members.length - 1].keyStart : -1;
  if (anchor < 0){
    var ls = text.lastIndexOf('\n', cont.open) + 1;
    return (text.slice(ls, cont.open).match(/^[ \t]*/) || [''])[0] + '  ';
  }
  var ls2 = text.lastIndexOf('\n', anchor) + 1;
  return (text.slice(ls2, anchor).match(/^[ \t]*/) || [''])[0];
}
function jsonInsertMember(text, path, keyOrNull, valueText){
  /* Append a member to the object (keyOrNull = key) or array (null) at
     path. valueText may be multi-line with two-space relative indents.
     Returns {text, start, end} — start/end select the inserted value. */
  var loc = path.length ? jsonLocate(text, path) : {start: jsonSkipWS(text, 0)};
  var cont = loc ? jsonContainer(text, loc.start) : null;
  if (!cont || cont.isObj !== (keyOrNull != null)) return null;
  var indent = jsonIndentFor(text, cont);
  var keyPart = keyOrNull != null ? JSON.stringify(keyOrNull) + ': ' : '';
  var adjVal = valueText.split('\n').join('\n' + indent);
  var insertAt, prefix;
  if (cont.members.length){
    insertAt = cont.members[cont.members.length - 1].valEnd;
    prefix = ',\n' + indent;
  } else {
    insertAt = cont.open + 1;
    prefix = '\n' + indent;
  }
  var start = insertAt + prefix.length + keyPart.length;
  return {text: text.slice(0, insertAt) + prefix + keyPart + adjVal + text.slice(insertAt),
          start: start, end: start + adjVal.length};
}
function jsonInsertListItemOrCreate(text, ownerPath, key, itemText){
  /* Append itemText to the array ownerPath.key, creating the array first
     when the key is absent. */
  var listPath = ownerPath.concat([key]);
  if (!jsonLocate(text, listPath)){
    var made = jsonInsertMember(text, ownerPath, key, '[]');
    if (!made) return null;
    text = made.text;
  }
  return jsonInsertMember(text, listPath, null, itemText);
}

/* ---------------- spec shape walking ----------------
   Mirrors normalize() + blocksOf(): the raw editor JSON may be
   {page:{blocks|sections}}, a bare {blocks|sections} page, or a bare
   diagram ({nodes, rows}). One entry per rendered section, in render
   order — the same order buildSection assigns gi. */

function specSectionPaths(raw){
  var base, page;
  if (raw && raw.page){ page = raw.page; base = ['page']; }
  else if (raw && (raw.blocks || raw.sections)){ page = raw; base = []; }
  else if (raw && raw.nodes && raw.rows) return [{section: [], diagram: []}];
  else return [];
  var key = page.blocks ? 'blocks' : 'sections';
  var out = [];
  (page[key] || []).forEach(function(b, i){
    if (b && Array.isArray(b.tabs)){
      b.tabs.forEach(function(t, j){
        ((t && Array.isArray(t.sections)) ? t.sections : []).forEach(function(sec, k){
          out.push({section: base.concat([key, i, 'tabs', j, 'sections', k])});
        });
      });
    } else out.push({section: base.concat([key, i])});
  });
  out.forEach(function(rec){ rec.diagram = rec.section.concat(['diagram']); });
  return out;
}
function specValueAt(raw, path){
  var v = raw;
  for (var i = 0; i < path.length && v != null; i++) v = v[path[i]];
  return v;
}
function builderTargetPath(raw, target){
  /* target: {section:<zero-based ordinal>, kind, id?, index?} → path array
     into the raw editor JSON, or null. Tabs address by block index
     instead of section ordinal. */
  if (target.kind === 'tab') return builderTabPath(raw, target.block, target.tab);
  var rec = specSectionPaths(raw)[target.section];
  if (!rec) return null;
  if (target.kind === 'section') return rec.section;
  var d = rec.diagram;
  if (target.kind === 'node') return d.concat(['nodes', target.id]);
  if (target.kind === 'edge') return d.concat(['edges', target.index]);
  if (target.kind === 'step') return d.concat(['steps', target.index]);
  if (target.kind === 'panel') return d.concat(['panels', target.index]);
  if (target.kind === 'bullet') return rec.section.concat(['bullets', target.index]);
  if (target.kind === 'para'){
    var sec = specValueAt(raw, rec.section);
    if (sec && typeof sec.text === 'string') return rec.section.concat(['text']);
    return rec.section.concat(['text', target.index]);
  }
  if (target.kind === 'crow') return rec.section.concat(['contract', 'fields', target.index]);
  return null;
}
function builderPathString(path){
  return path.length ? path.map(function(seg, i){
    if (typeof seg === 'number') return '[' + seg + ']';
    return (i ? '.' : '') + (/^[A-Za-z_][A-Za-z0-9_-]*$/.test(seg) ? seg : JSON.stringify(seg));
  }).join('') : '(whole document)';
}

/* ---------------- insert planners ----------------
   Each takes the CURRENT editor text plus its parsed form and returns
   {text, start, end, ...} on success or {error} with a plain sentence. */

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
function builderDiagram(text, raw, sectionIdx){
  var rec = specSectionPaths(raw)[sectionIdx];
  if (!rec) return {error: 'no section to insert into — click a section first'};
  if (!jsonLocate(text, rec.diagram))
    return {error: 'this section has no diagram yet — add "diagram": {"nodes": {...}, "rows": [[...]]} inside it first'};
  return {path: rec.diagram, d: specValueAt(raw, rec.diagram)};
}

function planAddNode(text, raw, sectionIdx, preset){
  /* preset (optional): {icon, tint, title} from NODE_PRESETS — the id stem
     follows the icon so the spec reads well (db1, antenna1, ...) */
  var got = builderDiagram(text, raw, sectionIdx);
  if (got.error) return got;
  var d = got.d;
  if (!Array.isArray(d.rows) || !d.rows.length)
    return {error: 'this diagram has no rows — a node needs a row slot to render'};
  var icon = preset && preset.icon ? preset.icon : 'gear';
  var tint = preset && preset.tint ? preset.tint : 'cmd';
  var title = preset && preset.title ? preset.title : 'New node';
  var id = builderUniqueKey(d.nodes || {}, preset && preset.icon ? preset.icon : 'node');
  var r1 = jsonInsertMember(text, got.path.concat(['rows', d.rows.length - 1]), null, JSON.stringify(id));
  if (!r1) return {error: 'could not edit rows in the editor text'};
  var r2 = jsonInsertMember(r1.text, got.path.concat(['nodes']), id,
    '{"title": ' + JSON.stringify(title) + ', "sub": "what it does", "icon": ' +
    JSON.stringify(icon) + ', "tint": ' + JSON.stringify(tint) + '}');
  if (!r2) return {error: 'could not edit nodes in the editor text'};
  return {text: r2.text, start: r2.start, end: r2.end, kind: 'node', id: id};
}
function planAddEdge(text, raw, sectionIdx){
  var got = builderDiagram(text, raw, sectionIdx);
  if (got.error) return got;
  var ids = builderFlatRowIds(got.d.rows);
  if (ids.length < 2) return {error: 'an edge needs two placed nodes — add nodes first'};
  /* the engine keys edges by "from->to", so a duplicate pair overrides the
     first edge's animation anchors — prefer a pair with no edge yet,
     nearest row neighbors first */
  var existing = {};
  (Array.isArray(got.d.edges) ? got.d.edges : []).forEach(function(e){
    if (e) existing[e.from + '->' + e.to] = true;
  });
  var from = ids[0], to = ids[1];
  outer:
  for (var gap = 1; gap < ids.length; gap++){
    for (var i = 0; i + gap < ids.length; i++){
      if (!existing[ids[i] + '->' + ids[i + gap]]){
        from = ids[i]; to = ids[i + gap];
        break outer;
      }
      if (!existing[ids[i + gap] + '->' + ids[i]]){
        from = ids[i + gap]; to = ids[i];
        break outer;
      }
    }
  }
  var item = '{"from": ' + JSON.stringify(from) + ', "to": ' + JSON.stringify(to) +
             ', "kind": "int", "label": "describe the hop"}';
  var r = jsonInsertListItemOrCreate(text, got.path, 'edges', item);
  if (!r) return {error: 'could not edit edges in the editor text'};
  return {text: r.text, start: r.start, end: r.end, kind: 'edge',
          index: Array.isArray(got.d.edges) ? got.d.edges.length : 0};
}
function planAddStep(text, raw, sectionIdx){
  var got = builderDiagram(text, raw, sectionIdx);
  if (got.error) return got;
  var edges = Array.isArray(got.d.edges) ? got.d.edges : [];
  if (!edges.length) return {error: 'a step names an edge — add an edge first'};
  /* prefer an edge no step uses as its FIRST hop, so the new numbered coin
     gets its own midpoint (two steps sharing a first hop stack coins) */
  var used = {};
  (got.d.steps || []).forEach(function(st){
    var k = st && (st.edge || (Array.isArray(st.edges) && st.edges[0]));
    if (typeof k === 'string') used[k] = true;
  });
  var pick = null;
  for (var i = 0; i < edges.length; i++){
    var e = edges[i] || {};
    var k = e.from + '->' + e.to;
    if (!used[k]){ pick = k; break; }
  }
  if (!pick) pick = (edges[0] || {}).from + '->' + (edges[0] || {}).to;
  var item = '{"edge": ' + JSON.stringify(pick) + ', "text": "Describe what happens in this step"}';
  var r = jsonInsertListItemOrCreate(text, got.path, 'steps', item);
  if (!r) return {error: 'could not edit steps in the editor text'};
  return {text: r.text, start: r.start, end: r.end, kind: 'step',
          index: (got.d.steps || []).length};
}
function planAddPanel(text, raw, sectionIdx, type){
  /* type (optional): a PANEL_TEMPLATES key; default queue */
  var got = builderDiagram(text, raw, sectionIdx);
  if (got.error) return got;
  var tplKey = type && PANEL_TEMPLATES[type] ? type : 'queue';
  var taken = Object.create(null);
  (got.d.panels || []).forEach(function(p){ if (p && p.id) taken[p.id] = true; });
  var id = builderUniqueKey(taken, tplKey);
  var tpl = builderClone(PANEL_TEMPLATES[tplKey]);
  var entry = {id: id, type: tplKey};
  Object.keys(tpl).forEach(function(k){ entry[k] = tpl[k]; });
  var r = jsonInsertListItemOrCreate(text, got.path, 'panels', JSON.stringify(entry, null, 2));
  if (!r) return {error: 'could not edit panels in the editor text'};
  return {text: r.text, start: r.start, end: r.end, kind: 'panel',
          index: (got.d.panels || []).length};
}
var BUILDER_SECTION_TEMPLATE = [
  '{',
  '  "heading": "New section",',
  '  "accent": "cyan",',
  '  "text": ["What this flow does, in one or two sentences."],',
  '  "diagram": {',
  '    "nodes": {',
  '      "svc1": {"title": "Service A", "sub": "does a thing", "icon": "gear", "tint": "cmd"},',
  '      "svc2": {"title": "Service B", "sub": "stores it", "icon": "db", "tint": "data"}',
  '    },',
  '    "rows": [["svc1", "svc2"]],',
  '    "edges": [{"from": "svc1", "to": "svc2", "kind": "int", "label": "call"}],',
  '    "steps": [{"edge": "svc1->svc2", "text": "Service A calls Service B"}]',
  '  }',
  '}'
].join('\n');
function planAddSection(text, raw){
  var base, page;
  if (raw && raw.page){ page = raw.page; base = ['page']; }
  else if (raw && (raw.blocks || raw.sections)){ page = raw; base = []; }
  else if (raw && raw.nodes && raw.rows)
    return {error: 'this spec is a bare diagram — wrap it as {"page": {"blocks": [ {...} ]}} to hold more than one section'};
  else return {error: 'no page to add a section to'};
  var key = page.blocks ? 'blocks' : 'sections';
  if (!jsonLocate(text, base.concat([key])))
    return {error: 'could not find the ' + key + ' list in the editor text'};
  var r = jsonInsertMember(text, base.concat([key]), null, BUILDER_SECTION_TEMPLATE);
  if (!r) return {error: 'could not edit the ' + key + ' list in the editor text'};
  return {text: r.text, start: r.start, end: r.end, kind: 'section',
          index: specSectionPaths(raw).length};
}

/* ---------------- field edits, renames, deletes, reorders ----------------
   Two edit strategies. Single-field edits are SURGICAL: replace, insert, or
   remove one member's text and leave the rest of the document byte-for-byte
   untouched. Edits that must stay consistent across several diagram keys
   (renaming a node id, deleting a node, retargeting an edge) REWRITE one
   value — usually the section's diagram object — from a mutated copy,
   serialized with two-space indents and re-indented to the container
   depth. */

function jsonReplaceValue(text, path, valueText){
  /* Replace the value at path; multi-line valueText is re-indented to the
     member's line indent. Returns {text, start, end} or null. */
  var loc = jsonLocate(text, path);
  if (!loc) return null;
  var ls = text.lastIndexOf('\n', loc.keyStart) + 1;
  var indent = (text.slice(ls, loc.keyStart).match(/^[ \t]*/) || [''])[0];
  var adj = valueText.split('\n').join('\n' + indent);
  return {text: text.slice(0, loc.start) + adj + text.slice(loc.end),
          start: loc.start, end: loc.start + adj.length};
}
function jsonRemoveMember(text, containerPath, key){
  /* Remove one member (and the comma that binds it) from the object or
     array at containerPath. Returns {text} or null when absent. */
  var loc = containerPath.length ? jsonLocate(text, containerPath) : {start: jsonSkipWS(text, 0)};
  var cont = loc ? jsonContainer(text, loc.start) : null;
  if (!cont) return null;
  var idx = -1;
  for (var m = 0; m < cont.members.length; m++){
    if (cont.members[m].key === key){ idx = m; break; }
  }
  if (idx < 0) return null;
  var mem = cont.members[idx], from, to;
  if (cont.members.length === 1){ from = cont.open + 1; to = cont.close; }
  else if (idx === cont.members.length - 1){ from = cont.members[idx - 1].valEnd; to = mem.valEnd; }
  else { from = mem.keyStart; to = cont.members[idx + 1].keyStart; }
  return {text: text.slice(0, from) + text.slice(to)};
}
function jsonSetField(text, objPath, key, valueTextOrNull){
  /* Set (replace or insert) one field of the object at objPath; null value
     removes the field. Returns {text, start?, end?} or null. */
  var exists = jsonLocate(text, objPath.concat([key]));
  if (valueTextOrNull == null){
    if (!exists) return {text: text};
    return jsonRemoveMember(text, objPath, key);
  }
  if (exists) return jsonReplaceValue(text, objPath.concat([key]), valueTextOrNull);
  return jsonInsertMember(text, objPath, key, valueTextOrNull);
}

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

function builderEdgeKey(e){ return ((e && e.from) || '') + '->' + ((e && e.to) || ''); }
function builderRetargetStepKeys(steps, oldKey, newKey){
  /* Point every step reference at newKey; null newKey removes the
     reference (a step may legally end up edgeless). */
  (steps || []).forEach(function(st){
    if (!st) return;
    if (st.edge === oldKey){
      if (newKey) st.edge = newKey; else delete st.edge;
    }
    if (Array.isArray(st.edges)){
      st.edges = st.edges.map(function(k){ return k === oldKey ? newKey : k; })
                         .filter(function(k){ return typeof k === 'string'; });
      if (!st.edges.length) delete st.edges;
    }
  });
}

var BUILDER_ID_RE = /^[A-Za-z0-9_-]+$/;

function planSetEdgeEndpoint(text, raw, sectionIdx, edgeIdx, field, nodeId){
  /* Change an edge's from/to and retarget every step reference to the
     edge's old "from->to" key. */
  var got = builderDiagram(text, raw, sectionIdx);
  if (got.error) return got;
  var e = (got.d.edges || [])[edgeIdx];
  if (!e) return {error: 'edge not found — reselect and try again'};
  if (!got.d.nodes || !Object.prototype.hasOwnProperty.call(got.d.nodes, nodeId))
    return {error: 'unknown node id "' + nodeId + '"'};
  var oldKey = builderEdgeKey(e);
  return builderRewrite(text, raw, got.path, function(d){
    d.edges[edgeIdx][field] = nodeId;
    builderRetargetStepKeys(d.steps, oldKey, builderEdgeKey(d.edges[edgeIdx]));
  });
}

function planRenameNode(text, raw, sectionIdx, oldId, newId){
  /* Rename a node id everywhere it is referenced: the nodes map, rows and
     stacks, floats, edge endpoints, step node lists, and the step
     "from->to" keys of every edge whose endpoint changed. */
  var got = builderDiagram(text, raw, sectionIdx);
  if (got.error) return got;
  if (!BUILDER_ID_RE.test(newId || ''))
    return {error: 'node ids use letters, digits, _ and - only'};
  if (!got.d.nodes || !Object.prototype.hasOwnProperty.call(got.d.nodes, oldId))
    return {error: 'node "' + oldId + '" not found'};
  if (newId === oldId) return {error: 'same id'};
  if (Object.prototype.hasOwnProperty.call(got.d.nodes, newId))
    return {error: 'id "' + newId + '" is already taken'};
  return builderRewrite(text, raw, got.path, function(d){
    /* null-prototype map: a plain {} would route an id like "__proto__"
       through the prototype setter and silently drop the node */
    var nodes = Object.create(null);
    Object.keys(d.nodes).forEach(function(k){ nodes[k === oldId ? newId : k] = d.nodes[k]; });
    d.nodes = nodes;
    d.rows = (d.rows || []).map(function(row){
      return row.map(function(slot){
        if (Array.isArray(slot)) return slot.map(function(s){ return s === oldId ? newId : s; });
        return slot === oldId ? newId : slot;
      });
    });
    (Array.isArray(d.floats) ? d.floats : []).forEach(function(f){
      if (f && f.id === oldId) f.id = newId;
    });
    var renamedKeys = [];
    (d.edges || []).forEach(function(e){
      if (!e) return;
      var was = builderEdgeKey(e), hit = false;
      if (e.from === oldId){ e.from = newId; hit = true; }
      if (e.to === oldId){ e.to = newId; hit = true; }
      if (hit) renamedKeys.push([was, builderEdgeKey(e)]);
    });
    (d.steps || []).forEach(function(st){
      if (st && Array.isArray(st.nodes))
        st.nodes = st.nodes.map(function(n){ return n === oldId ? newId : n; });
    });
    renamedKeys.forEach(function(pair){ builderRetargetStepKeys(d.steps, pair[0], pair[1]); });
  });
}

function planRenamePanel(text, raw, sectionIdx, panelIdx, newId){
  /* Rename a panel id and move every step patch keyed by it. */
  var got = builderDiagram(text, raw, sectionIdx);
  if (got.error) return got;
  var p = (got.d.panels || [])[panelIdx];
  if (!p) return {error: 'panel not found — reselect and try again'};
  if (!BUILDER_ID_RE.test(newId || ''))
    return {error: 'panel ids use letters, digits, _ and - only'};
  var oldId = p.id;
  if (newId === oldId) return {error: 'same id'};
  if ((got.d.panels || []).some(function(q){ return q && q.id === newId; }))
    return {error: 'id "' + newId + '" is already taken'};
  return builderRewrite(text, raw, got.path, function(d){
    d.panels[panelIdx].id = newId;
    (d.steps || []).forEach(function(st){
      if (st && st.panels && Object.prototype.hasOwnProperty.call(st.panels, oldId)){
        var patches = Object.create(null); /* "__proto__" — see planRenameNode */
        Object.keys(st.panels).forEach(function(k){ patches[k === oldId ? newId : k] = st.panels[k]; });
        st.panels = patches;
      }
    });
  });
}

function planDeleteNode(text, raw, sectionIdx, id){
  /* Remove a node plus its row/float placement and every edge touching it;
     step references to the removed edges and the node are pruned (a step
     may legally stay as caption-only). */
  var got = builderDiagram(text, raw, sectionIdx);
  if (got.error) return got;
  if (!got.d.nodes || !Object.prototype.hasOwnProperty.call(got.d.nodes, id))
    return {error: 'node "' + id + '" not found'};
  return builderRewrite(text, raw, got.path, function(d){
    delete d.nodes[id];
    d.rows = (d.rows || []).map(function(row){
      return row.map(function(slot){
        return Array.isArray(slot) ? slot.filter(function(s){ return s !== id; }) : slot;
      }).filter(function(slot){
        return Array.isArray(slot) ? slot.length > 0 : slot !== id;
      });
    }).filter(function(row){ return row.length > 0; });
    if (Array.isArray(d.floats)){
      d.floats = d.floats.filter(function(f){ return !(f && f.id === id); });
      if (!d.floats.length) delete d.floats;
    }
    var removedKeys = [];
    if (Array.isArray(d.edges)){
      d.edges = d.edges.filter(function(e){
        var hit = e && (e.from === id || e.to === id);
        if (hit) removedKeys.push(builderEdgeKey(e));
        return !hit;
      });
    }
    var surviving = {};
    (d.edges || []).forEach(function(e){ if (e) surviving[builderEdgeKey(e)] = true; });
    removedKeys.forEach(function(k){
      if (!surviving[k]) builderRetargetStepKeys(d.steps, k, null);
    });
    (d.steps || []).forEach(function(st){
      if (st && Array.isArray(st.nodes)){
        st.nodes = st.nodes.filter(function(n){ return n !== id; });
        if (!st.nodes.length) delete st.nodes;
      }
    });
  });
}

function planDeleteEdge(text, raw, sectionIdx, edgeIdx){
  var got = builderDiagram(text, raw, sectionIdx);
  if (got.error) return got;
  var e = (got.d.edges || [])[edgeIdx];
  if (!e) return {error: 'edge not found — reselect and try again'};
  var key = builderEdgeKey(e);
  return builderRewrite(text, raw, got.path, function(d){
    d.edges.splice(edgeIdx, 1);
    var stillThere = d.edges.some(function(o){ return o && builderEdgeKey(o) === key; });
    if (!stillThere) builderRetargetStepKeys(d.steps, key, null);
  });
}

function planDeletePanel(text, raw, sectionIdx, panelIdx){
  var got = builderDiagram(text, raw, sectionIdx);
  if (got.error) return got;
  var p = (got.d.panels || [])[panelIdx];
  if (!p) return {error: 'panel not found — reselect and try again'};
  var id = p.id;
  return builderRewrite(text, raw, got.path, function(d){
    d.panels.splice(panelIdx, 1);
    if (!d.panels.length) delete d.panels;
    (d.steps || []).forEach(function(st){
      if (st && st.panels && Object.prototype.hasOwnProperty.call(st.panels, id)){
        delete st.panels[id];
        if (!Object.keys(st.panels).length) delete st.panels;
      }
    });
  });
}

function planDeleteStep(text, raw, sectionIdx, stepIdx){
  var got = builderDiagram(text, raw, sectionIdx);
  if (got.error) return got;
  if (!Array.isArray(got.d.steps) || !got.d.steps[stepIdx])
    return {error: 'step not found — reselect and try again'};
  return builderRewrite(text, raw, got.path.concat(['steps']), function(steps){
    steps.splice(stepIdx, 1);
  });
}

function planMoveStep(text, raw, sectionIdx, stepIdx, delta){
  var got = builderDiagram(text, raw, sectionIdx);
  if (got.error) return got;
  var steps = got.d.steps;
  var to = stepIdx + delta;
  if (!Array.isArray(steps) || !steps[stepIdx]) return {error: 'step not found'};
  if (to < 0 || to >= steps.length) return {error: 'already at that end'};
  var r = builderRewrite(text, raw, got.path.concat(['steps']), function(copy){
    var item = copy.splice(stepIdx, 1)[0];
    copy.splice(to, 0, item);
  });
  if (r.error) return r;
  r.index = to;
  return r;
}

function planDeleteSection(text, raw, sectionIdx){
  var rec = specSectionPaths(raw)[sectionIdx];
  if (!rec) return {error: 'no such section'};
  if (!rec.section.length)
    return {error: 'this spec is one bare diagram — clear the editor instead of deleting'};
  var parentPath = rec.section.slice(0, -1);
  var key = rec.section[rec.section.length - 1];
  var r = jsonRemoveMember(text, parentPath, key);
  if (!r) return {error: 'could not edit the editor text'};
  return r;
}

/* ---------------- pass 4: insert palettes ----------------
   One node preset per icon (with the tint that icon usually carries) and
   one working starter template per panel widget type. The templates must
   validate with zero errors AND zero warnings — tests/builder.test.js
   runs the real validator over every one. */

var NODE_PRESETS = [
  {icon: 'terminal', tint: 'cmd',  title: 'Console'},
  {icon: 'cloud',    tint: 'cmd',  title: 'API'},
  {icon: 'shield',   tint: 'auth', title: 'Auth'},
  {icon: 'gear',     tint: 'cmd',  title: 'Service'},
  {icon: 'db',       tint: 'data', title: 'Store'},
  {icon: 'antenna',  tint: 'mqtt', title: 'Broker'},
  {icon: 'thermo',   tint: 'dev',  title: 'Sensor'},
  {icon: 'pump',     tint: 'dev',  title: 'Actuator'},
  {icon: 'router',   tint: 'dev',  title: 'Gateway'},
  {icon: 'package',  tint: 'data', title: 'Artifact'},
  {icon: 'key',      tint: 'auth', title: 'Signer'},
  {icon: 'server',   tint: 'cmd',  title: 'Server'},
  {icon: 'chip',     tint: 'dev',  title: 'MCU'},
  {icon: 'phone',    tint: 'dev',  title: 'Phone'}
];

var PANEL_TEMPLATES = {
  state:     {title: 'Device state', states: ['OFF', 'BOOT', 'LIVE'], initial: {state: 'OFF'}},
  leds:      {title: 'Indicators', leds: [{id: 'power', label: 'PWR'}, {id: 'radio', label: 'RADIO'}],
              initial: {power: 'on'}},
  gauge:     {title: 'Draw', unit: 'mA', max: 400, initial: {value: 12}},
  log:       {title: 'Event log', tags: {NET: '#38E1FF'}, initial: {log: [{tag: 'NET', text: 'panel added'}]}},
  screen:    {title: 'Camera', scene: 'static-noise', initial: {mode: 'off'}},
  waterfall: {title: 'Latency budget', spans: [{id: 'net', label: 'network', ms: 40},
              {id: 'work', label: 'processing', ms: 120}]},
  orbit:     {title: 'Lifecycle', states: ['IDLE', 'ACTIVE', 'DONE'], initial: {state: 'IDLE'}},
  zoneframe: {title: 'Zones', zones: [{id: 'porch', points: [[20, 40], [150, 40], [150, 160], [20, 160]]}]},
  xray:      {title: 'Layers', layers: [{id: 'case', label: 'Case', holder: true},
              {id: 'board', label: 'Board'}]},
  queue:     {title: 'Queue', initial: {state: 'empty'}},
  pir:       {title: 'Motion cone'},
  thermo:    {title: 'Temperature', min: 0, max: 100, warn: 60, crit: 85, initial: {value: 21}},
  battery:   {title: 'Battery', low: 30, crit: 10, initial: {charge: 80}},
  buffer:    {title: 'Buffer', initial: {}},
  radar:     {title: 'Radar'},
  signal:    {title: 'Links', links: [{id: 'up', label: 'uplink', transport: 'wifi'}]},
  tiles:     {title: 'Fleet', tiles: [{id: 't1', label: 'UNIT 1'}, {id: 't2', label: 'UNIT 2'}]},
  inflight:  {title: 'In flight', lanes: [{id: 'op', label: 'operation'}]},
  phone:     {title: 'Phone', initial: {clock: '9:41'}}
};

/* ---------------- pass 3: direct-manipulation planners ---------------- */

function jsonInsertArrayItemAfter(text, arrPath, afterIdx, itemText){
  /* Insert itemText into the array at arrPath directly AFTER member
     afterIdx (jsonInsertMember only appends at the end). */
  var loc = arrPath.length ? jsonLocate(text, arrPath) : {start: jsonSkipWS(text, 0)};
  var cont = loc ? jsonContainer(text, loc.start) : null;
  if (!cont || cont.isObj) return null;
  var anchor = cont.members[afterIdx];
  if (!anchor) return null;
  var ls = text.lastIndexOf('\n', anchor.keyStart) + 1;
  var indent = (text.slice(ls, anchor.keyStart).match(/^[ \t]*/) || [''])[0];
  var adjVal = itemText.split('\n').join('\n' + indent);
  var prefix = ',\n' + indent;
  var insertAt = anchor.valEnd;
  var start = insertAt + prefix.length;
  return {text: text.slice(0, insertAt) + prefix + adjVal + text.slice(insertAt),
          start: start, end: start + adjVal.length};
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

function planAddEdgeBetween(text, raw, sectionIdx, fromId, toId){
  /* Connect mode: the operator clicked the exact source and target. */
  var got = builderDiagram(text, raw, sectionIdx);
  if (got.error) return got;
  var nodes = got.d.nodes || {};
  if (!Object.prototype.hasOwnProperty.call(nodes, fromId))
    return {error: 'unknown node id "' + fromId + '"'};
  if (!Object.prototype.hasOwnProperty.call(nodes, toId))
    return {error: 'unknown node id "' + toId + '"'};
  if (fromId === toId) return {error: 'source and target are the same node'};
  var key = fromId + '->' + toId;
  if ((got.d.edges || []).some(function(e){ return e && builderEdgeKey(e) === key; }))
    return {error: 'edge "' + key + '" already exists \u2014 click it to edit'};
  var item = '{"from": ' + JSON.stringify(fromId) + ', "to": ' + JSON.stringify(toId) +
             ', "kind": "int", "label": "describe the hop"}';
  var r = jsonInsertListItemOrCreate(text, got.path, 'edges', item);
  if (!r) return {error: 'could not edit edges in the editor text'};
  return {text: r.text, start: r.start, end: r.end, kind: 'edge',
          index: Array.isArray(got.d.edges) ? got.d.edges.length : 0};
}

function planDuplicateNode(text, raw, sectionIdx, id){
  /* Copy a node definition under a fresh id and place the copy right
     beside the original (same row slot, same stack, or floats list). */
  var got = builderDiagram(text, raw, sectionIdx);
  if (got.error) return got;
  var d = got.d;
  if (!d.nodes || !Object.prototype.hasOwnProperty.call(d.nodes, id))
    return {error: 'node "' + id + '" not found'};
  var newId = builderUniqueKey(d.nodes, id);
  var placed = null;
  (d.rows || []).forEach(function(row, r){
    if (placed) return;
    row.forEach(function(slot, s){
      if (placed) return;
      if (slot === id) placed = {path: got.path.concat(['rows', r]), after: s};
      else if (Array.isArray(slot)){
        var k = slot.indexOf(id);
        if (k >= 0) placed = {path: got.path.concat(['rows', r, s]), after: k};
      }
    });
  });
  var out;
  if (placed){
    out = jsonInsertArrayItemAfter(text, placed.path, placed.after, JSON.stringify(newId));
    if (!out) return {error: 'could not edit rows in the editor text'};
  } else {
    var floats = d.floats || [];
    var fi = -1;
    floats.forEach(function(f, i){ if (fi < 0 && f && f.id === id) fi = i; });
    if (fi < 0) return {error: 'node "' + id + '" has no row or float placement to copy'};
    /* clone the WHOLE float entry (side plus any nudge fields), fresh id,
       placed directly after the original like the row cases */
    var entry = builderClone(floats[fi]);
    entry.id = newId;
    out = jsonInsertArrayItemAfter(text, got.path.concat(['floats']), fi, JSON.stringify(entry));
    if (!out) return {error: 'could not edit floats in the editor text'};
  }
  var def = jsonInsertMember(out.text, got.path.concat(['nodes']), newId,
    JSON.stringify(builderClone(d.nodes[id])));
  if (!def) return {error: 'could not edit nodes in the editor text'};
  return {text: def.text, start: def.start, end: def.end, kind: 'node', id: newId};
}

function planDuplicateSection(text, raw, sectionIdx){
  /* Deep-copy a section directly after the original; the copy renders as
     the next section ordinal (render order is depth-first list order). */
  var rec = specSectionPaths(raw)[sectionIdx];
  if (!rec) return {error: 'no such section'};
  if (!rec.section.length)
    return {error: 'this spec is one bare diagram \u2014 wrap it as {"page": {"blocks": [ ... ]}} first'};
  var clone = builderClone(specValueAt(raw, rec.section));
  if (clone && typeof clone.heading === 'string') clone.heading += ' (copy)';
  var parentPath = rec.section.slice(0, -1);
  var idx = rec.section[rec.section.length - 1];
  var r = jsonInsertArrayItemAfter(text, parentPath, idx, JSON.stringify(clone, null, 2));
  if (!r) return {error: 'could not edit the editor text'};
  return {text: r.text, start: r.start, end: r.end, kind: 'section', index: sectionIdx + 1};
}

/* ---------------- durability: filenames ---------------- */

function specFileName(raw){
  /* download name for the save button: page-title slug + .spec.json */
  var page = raw && raw.page ? raw.page : raw;
  var title = page && typeof page.title === 'string' ? page.title : '';
  var slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return (slug || 'flowspec') + '.spec.json';
}

/* ---------------- clickable validation findings ----------------
   Validator and lint messages open with a field path relative to the
   normalized PAGE object ("blocks[0].tabs[1].sections[0].diagram.
   edges[3].kind: ..."). These helpers turn that prefix back into a
   character range of the RAW editor text so a click on the message
   selects the offending JSON — falling back to the nearest existing
   parent when the exact leaf is not in the text. */

function parseValidationPath(message){
  /* leading "ERROR " / "warn " labels are tolerated; returns the path
     segment array or null when the message carries no field path */
  var m = /^(?:ERROR\s+|warn\s+)?([A-Za-z_][A-Za-z0-9_$-]*(?:\[\d+\]|\.[A-Za-z0-9_$-]+)*)\s*:/.exec(message || '');
  if (!m) return null;
  var out = [];
  var re = /([A-Za-z0-9_$-]+)|\[(\d+)\]/g, seg;
  while ((seg = re.exec(m[1]))){
    if (seg[1] != null) out.push(seg[1]);
    else out.push(parseInt(seg[2], 10));
  }
  return out.length ? out : null;
}
function findingLocation(text, raw, message){
  /* character range for a validation message. The validator addresses
     the normalized PAGE object; a leading "page" token names that same
     object. Remaining tokens are resolved GREEDILY against the parsed
     raw JSON — at each object level the longest dot-join of remaining
     string tokens that names a real member wins, so author ids that
     contain dots still resolve. Unresolvable tails retreat to the
     nearest existing parent (exact: false). */
  var tokens = parseValidationPath(message);
  if (!tokens) return null;
  if (tokens[0] === 'page') tokens = tokens.slice(1);
  var base, node;
  if (raw && raw.page){ base = ['page']; node = raw.page; }
  else if (raw && (raw.blocks || raw.sections)){ base = []; node = raw; }
  else if (raw && raw.nodes && raw.rows){
    /* normalize() wrapped the bare diagram as sections[0].diagram */
    if (tokens.length >= 2 && tokens[0] === 'sections' && tokens[1] === 0){
      tokens = tokens.slice(2);
      if (tokens[0] === 'diagram') tokens = tokens.slice(1);
    } else if (tokens.length){
      return null; /* the message names page furniture a bare diagram lacks */
    }
    base = []; node = raw;
  } else return null;
  var path = base.slice();
  var i = 0;
  while (i < tokens.length && node != null && typeof node === 'object'){
    if (Array.isArray(node)){
      if (typeof tokens[i] !== 'number') break;
      path.push(tokens[i]);
      node = node[tokens[i]];
      i++;
    } else {
      var key = null, j;
      for (j = tokens.length; j > i; j--){
        var joined = tokens.slice(i, j).map(String).join('.');
        if (Object.prototype.hasOwnProperty.call(node, joined)){ key = joined; break; }
      }
      if (key == null) break;
      path.push(key);
      node = node[key];
      i = j;
    }
  }
  var exact = i === tokens.length;
  var loc = jsonLocate(text, path);
  while (!loc && path.length){ path.pop(); loc = jsonLocate(text, path); exact = false; }
  if (!loc) loc = jsonLocate(text, []);
  if (!loc) return null;
  return {start: loc.start, end: loc.end, exact: exact};
}

/* ---------------- tab management ----------------
   Tabs are addressed by BLOCK index (the position in the page's
   blocks/sections list — the same index the engine bakes into each tab
   button's id "tab-<block>-<tab>") plus the tab index inside that
   block's tabs list. */

function builderTabPath(raw, blockIdx, tabIdx){
  var base, page;
  if (raw && raw.page){ page = raw.page; base = ['page']; }
  else if (raw && (raw.blocks || raw.sections)){ page = raw; base = []; }
  else return null;
  var key = page.blocks ? 'blocks' : 'sections';
  var block = (page[key] || [])[blockIdx];
  if (!block || !Array.isArray(block.tabs) || !block.tabs[tabIdx]) return null;
  return base.concat([key, blockIdx, 'tabs', tabIdx]);
}

var BUILDER_TAB_TEMPLATE = [
  '{',
  '  "label": "New tab",',
  '  "sections": [' + BUILDER_SECTION_TEMPLATE.split('\n').join('\n  ') + ']',
  '}'
].join('\n');

function planAddTab(text, raw, blockIdx, afterIdx){
  /* insert a renderable tab (one starter section) directly after the
     tab the operator is looking at */
  var path = builderTabPath(raw, blockIdx, afterIdx);
  if (!path) return {error: 'tab not found — reselect and try again'};
  var tabsPath = path.slice(0, -1);
  var r = jsonInsertArrayItemAfter(text, tabsPath, afterIdx, BUILDER_TAB_TEMPLATE);
  if (!r) return {error: 'could not edit the tabs list in the editor text'};
  return {text: r.text, start: r.start, end: r.end, kind: 'tab',
          block: blockIdx, index: afterIdx + 1};
}

function planDeleteTab(text, raw, blockIdx, tabIdx){
  var path = builderTabPath(raw, blockIdx, tabIdx);
  if (!path) return {error: 'tab not found — reselect and try again'};
  var tabsPath = path.slice(0, -1);
  var tabs = specValueAt(raw, tabsPath);
  if (Array.isArray(tabs) && tabs.length === 1)
    return {error: 'this is the block\u2019s last tab — delete its sections instead, or remove the whole tabs block in the JSON'};
  var r = jsonRemoveMember(text, tabsPath, tabIdx);
  if (!r) return {error: 'could not edit the tabs list in the editor text'};
  return r;
}

function planMoveTab(text, raw, blockIdx, tabIdx, delta){
  var path = builderTabPath(raw, blockIdx, tabIdx);
  if (!path) return {error: 'tab not found — reselect and try again'};
  var tabsPath = path.slice(0, -1);
  var tabs = specValueAt(raw, tabsPath);
  var to = tabIdx + delta;
  if (to < 0 || to >= tabs.length) return {error: 'already at that end'};
  var r = builderRewrite(text, raw, tabsPath, function(copy){
    var item = copy.splice(tabIdx, 1)[0];
    copy.splice(to, 0, item);
  });
  if (r.error) return r;
  r.kind = 'tab'; r.block = blockIdx; r.index = to;
  return r;
}

/* ---------------- step contract editing ----------------
   A step's membership: hops (edge / edges), lit nodes (nodes), and
   panel patches (panels). Toggles normalize the hop shape: zero hops
   removes the key (edgeless steps are legal), one hop stores
   edge: "a->b", two or more store edges: [...]. */

function builderStepHops(st){
  /* tolerate the malformed both-keys shape: merge edge and edges so a
     later toggle's rebuild cannot silently drop listed hops */
  if (!st) return [];
  var out = [];
  if (typeof st.edge === 'string') out.push(st.edge);
  if (Array.isArray(st.edges)) st.edges.forEach(function(k){
    if (typeof k === 'string' && out.indexOf(k) < 0) out.push(k);
  });
  return out;
}

function builderStepAt(raw, sectionIdx, stepIdx){
  var rec = specSectionPaths(raw)[sectionIdx];
  if (!rec) return null;
  var d = specValueAt(raw, rec.diagram);
  if (!d || !Array.isArray(d.steps) || !d.steps[stepIdx]) return null;
  return {rec: rec, d: d, st: d.steps[stepIdx],
          path: rec.diagram.concat(['steps', stepIdx])};
}

function planStepToggleHop(text, raw, sectionIdx, stepIdx, key){
  var got = builderStepAt(raw, sectionIdx, stepIdx);
  if (!got) return {error: 'step not found — reselect and try again'};
  var hops = builderStepHops(got.st);
  var has = hops.indexOf(key) >= 0;
  if (!has){
    var known = (got.d.edges || []).some(function(e){ return e && builderEdgeKey(e) === key; });
    if (!known) return {error: 'no edge "' + key + '" in this diagram'};
  }
  var next = has ? hops.filter(function(k){ return k !== key; }) : hops.concat([key]);
  var r = builderRewrite(text, raw, got.path, function(st){
    delete st.edge; delete st.edges;
    if (next.length === 1) st.edge = next[0];
    else if (next.length > 1) st.edges = next;
  });
  if (r.error) return r;
  r.added = !has;
  return r;
}

function planStepToggleNode(text, raw, sectionIdx, stepIdx, nodeId){
  var got = builderStepAt(raw, sectionIdx, stepIdx);
  if (!got) return {error: 'step not found — reselect and try again'};
  var list = Array.isArray(got.st.nodes) ? got.st.nodes : [];
  var has = list.indexOf(nodeId) >= 0;
  if (!has && !(got.d.nodes && Object.prototype.hasOwnProperty.call(got.d.nodes, nodeId)))
    return {error: 'no node "' + nodeId + '" in this diagram'};
  var r = builderRewrite(text, raw, got.path, function(st){
    var next = (Array.isArray(st.nodes) ? st.nodes : []).filter(function(n){ return n !== nodeId; });
    if (!has) next.push(nodeId);
    if (next.length) st.nodes = next; else delete st.nodes;
  });
  if (r.error) return r;
  r.added = !has;
  return r;
}

function planStepTogglePanel(text, raw, sectionIdx, stepIdx, panelId){
  var got = builderStepAt(raw, sectionIdx, stepIdx);
  if (!got) return {error: 'step not found — reselect and try again'};
  var has = !!(got.st.panels && Object.prototype.hasOwnProperty.call(got.st.panels, panelId));
  if (!has && !(got.d.panels || []).some(function(p){ return p && p.id === panelId; }))
    return {error: 'no panel "' + panelId + '" in this diagram'};
  var r = builderRewrite(text, raw, got.path, function(st){
    if (has){
      delete st.panels[panelId];
      if (!Object.keys(st.panels).length) delete st.panels;
    } else {
      if (!st.panels) st.panels = {};
      st.panels[panelId] = {};
    }
  });
  if (r.error) return r;
  r.added = !has;
  return r;
}

function planStepSetPanelPatch(text, raw, sectionIdx, stepIdx, panelId, patchText){
  /* replace one panel patch with operator-supplied JSON (an object) */
  var got = builderStepAt(raw, sectionIdx, stepIdx);
  if (!got) return {error: 'step not found — reselect and try again'};
  var patch;
  try { patch = JSON.parse(patchText); }
  catch (ex){ return {error: 'the patch is not valid JSON (' + ex.message + ')'}; }
  if (!patch || typeof patch !== 'object' || Array.isArray(patch))
    return {error: 'a panel patch is a JSON object'};
  if (!(got.st.panels && Object.prototype.hasOwnProperty.call(got.st.panels, panelId)))
    return {error: 'panel "' + panelId + '" is not in this step'};
  return builderRewrite(text, raw, got.path.concat(['panels', panelId]), function(copy, _unused){
    /* builderRewrite mutates a copy in place; replace all fields */
    Object.keys(copy).forEach(function(k){ delete copy[k]; });
    Object.keys(patch).forEach(function(k){ copy[k] = patch[k]; });
  });
}

/* ---------------- per-element authoring guidance ---------------- */

var BUILDER_GUIDES = {
  node: {
    title: 'Node — one service card',
    how: 'Edit the selected JSON, then click Render. A node renders only if its id appears in rows (or floats).',
    fields: [
      ['title', 'name on the card'],
      ['sub', 'one-line detail under the name'],
      ['icon', 'icon on the chip (see tokens below; default gear)'],
      ['tint', 'chip color (default cmd)'],
      ['group', 'containment-boundary id — members get a dashed box'],
      ['link', 'permalink URL — clickable ↗ on the card corner']
    ],
    tokens: 'icons: terminal cloud shield gear db antenna thermo pump router package key server chip phone · tints: cmd auth data mqtt dev'
  },
  edge: {
    title: 'Edge — one hop between nodes',
    how: 'Edit the selected JSON, then click Render. from/to are node ids; the arrow, packets, and legend all follow kind.',
    fields: [
      ['from, to', 'node ids the hop connects'],
      ['kind', 'protocol: https | int | mqtt, or a key declared in page.protocols'],
      ['ret', 'true = response/ack, drawn as a fine dash'],
      ['label', 'short verb or topic on the arrow (POST /x, PUBLISH a/b/c)'],
      ['bend, labelDx, labelDy', 'manual geometry nudges for crowded corridors'],
      ['revealAt, hideAt', 'zero-based step indexes — draw the edge only inside that interval']
    ]
  },
  step: {
    title: 'Step — one numbered narrative beat',
    how: 'Edit the selected JSON, then click Render. The same steps array drives the ambient packet schedule, the numbered coins, and the click-through.',
    fields: [
      ['edge', '"from->to" — the hop this step fires (or edges: [..] for hops that fire together)'],
      ['text', 'caption shown in the step bar'],
      ['lane', 'lane pill on the caption line — declare colors in page.lanes'],
      ['nodes', 'node ids to light directly (allows an edgeless step)'],
      ['panels', 'sparse widget patches: {"<panel id>": {..only what changed..}}'],
      ['link', 'permalink URL — source ↗ on the caption line']
    ]
  },
  panel: {
    title: 'Panel — one synchronized inspector widget',
    how: 'Edit the selected JSON, then click Render. Steps patch the panel by id; patches are sparse and folded, so jumping to any step is consistent.',
    fields: [
      ['id', 'the handle steps patch: "panels": {"<id>": {...}}'],
      ['type', 'widget kind: state leds gauge log screen queue inflight phone … (full list in the authoring contract)'],
      ['title', 'card title above the widget'],
      ['initial', 'widget state before step 1']
    ]
  },
  bullet: {
    title: 'Bullet — one list point',
    how: 'Edit the text and Render. A bullet is a plain string, or an object when it needs nesting or step reveals.',
    fields: [
      ['text', 'the point itself (object form)'],
      ['sub', 'nested child bullets (object form)'],
      ['revealAt, hideAt', 'zero-based step indexes binding the bullet to the diagram click-through']
    ]
  },
  para: {
    title: 'Paragraph — section prose',
    how: 'Edit the text and Render. section.text is one string or a list of paragraph strings.',
    fields: [
      ['text', 'plain prose; `code` spans render in monospace']
    ]
  },
  crow: {
    title: 'Contract field — one "on the wire" row',
    how: 'Edit the row and Render. Rows without a k key are skipped by the renderer.',
    fields: [
      ['k', 'field name (required)'],
      ['v', 'sample value'],
      ['g', 'gloss — what the field means'],
      ['hot', 'true highlights the row'],
      ['delta', 'added | removed | changed badge'],
      ['link', 'permalink URL — arrow beside the name'],
      ['revealAt, hideAt', 'zero-based step indexes binding the row to the diagram click-through']
    ]
  },
  tab: {
    title: 'Tab — one labeled group of sections',
    how: 'Clicking a tab shows it AND selects it here. Edit the label and Render; + tab adds a sibling after this one; the arrows reorder; delete removes the tab and every section inside it.',
    fields: [
      ['label', 'the tab button text — tab identity for deep links and re-renders'],
      ['highlight', 'true, an accent token, or "#RRGGBB" — emphasizes the tab button'],
      ['sections', 'the sections this tab shows']
    ]
  },
  section: {
    title: 'Section — one accent-colored box',
    how: 'Edit the selected JSON, then click Render. Everything inside is optional; a section is prose, an optional contract card, and an optional diagram.',
    fields: [
      ['heading', 'section heading'],
      ['accent', 'green blue violet amber pink cyan red slate, or "#RRGGBB"'],
      ['source', 'permalink URL — "source ↗" chip beside the heading'],
      ['text', 'paragraph or list of paragraphs above the diagram'],
      ['bullets', 'bullet list; entries may reveal/hide per step'],
      ['contract', '"on the wire" message-contract card'],
      ['diagram', 'the board: nodes, rows, edges, panels, steps']
    ]
  }
};

/* assigned by initWorkbenchBuilder; boot's message list calls it when a
   finding is clicked (boot renders messages before the builder starts,
   so the indirection is checked at click time) */
var BUILDER_JUMP_TO_FINDING = null;

/* ---------------- DOM wiring (workbench only) ---------------- */

function initWorkbenchBuilder(opts){
  var view = opts.view, src = opts.src, render = opts.render;
  var guide = document.getElementById('guide');
  var targetLabel = document.getElementById('btarget');
  var undoBtn = document.getElementById('undo-builder');
  var specbox = document.querySelector('.specbox');
  var selectedEl = null;
  var currentTarget = null; /* {section, kind, id?, index?} — survives re-renders */
  var insertSection = 0;    /* zero-based ordinal of the section inserts target */
  var undoStack = [];

  function parseEditor(){
    try { return {raw: JSON.parse(src.value)}; }
    catch (ex){ return {error: 'the JSON in the editor does not parse (' + ex.message + ')'}; }
  }
  function setSelected(el){
    if (selectedEl) selectedEl.classList.remove('dv-sel');
    selectedEl = el || null;
    if (selectedEl) selectedEl.classList.add('dv-sel');
  }
  function scrollTextareaTo(start){
    /* newline counting under-measures because long JSON lines soft-wrap
       in the textarea; mirror the text up to the selection in an
       offscreen block with the textarea's metrics and measure real
       pixels */
    var cs = getComputedStyle(src);
    var mirror = document.createElement('div');
    mirror.style.position = 'absolute';
    mirror.style.visibility = 'hidden';
    mirror.style.left = '-9999px';
    mirror.style.whiteSpace = 'pre-wrap';
    mirror.style.overflowWrap = 'break-word';
    mirror.style.boxSizing = 'border-box';
    mirror.style.width = src.clientWidth + 'px'; /* content+padding, no scrollbar */
    mirror.style.font = cs.font;
    mirror.style.letterSpacing = cs.letterSpacing;
    mirror.style.tabSize = cs.tabSize;
    mirror.style.padding = cs.padding;
    mirror.style.border = '0';
    /* a marker span's offsetTop is the selection line's TOP edge in the
       textarea's scroll space (offsetHeight would add the marker line's
       own height and the bottom padding) */
    mirror.appendChild(document.createTextNode(src.value.slice(0, start)));
    var marker = document.createElement('span');
    marker.textContent = '​';
    mirror.appendChild(marker);
    document.body.appendChild(mirror);
    var y = marker.offsetTop;
    mirror.remove();
    src.scrollTop = Math.max(0, y - src.clientHeight * 0.35);
  }
  function selectRange(loc){
    if (specbox && !specbox.open) specbox.open = true;
    try { src.focus({preventScroll: true}); } catch (ex){ src.focus(); }
    src.setSelectionRange(loc.start, loc.end);
    scrollTextareaTo(loc.start);
  }
  function updateTargetLabel(raw){
    if (!targetLabel) return;
    var rec = specSectionPaths(raw || {})[insertSection];
    var sec = rec ? specValueAt(raw, rec.section) : null;
    var name = sec && sec.heading ? ' · ' + sec.heading : '';
    targetLabel.textContent = 'into section ' + (insertSection + 1) + name +
      ' — click a section to retarget';
  }

  /* ---- undo/redo: one snapshot of the editor text per builder action.
     Hand edits in the textarea are not snapshotted, but undo pushes the
     CURRENT text onto the redo stack first, so nothing is discarded. ---- */
  var redoBtn = document.getElementById('redo-builder');
  var redoStack = [];
  function updateHistoryButtons(){
    if (undoBtn) undoBtn.disabled = !undoStack.length;
    if (redoBtn) redoBtn.disabled = !redoStack.length;
  }
  function pushUndo(){
    undoStack.push(src.value);
    if (undoStack.length > 30) undoStack.shift();
    redoStack.length = 0; /* a new action invalidates the redo line */
    updateHistoryButtons();
  }
  function historyStep(fromStack, toStack, message){
    if (!fromStack.length) return;
    toStack.push(src.value);
    src.value = fromStack.pop();
    updateHistoryButtons();
    render();
    setSelected(null); currentTarget = null;
    clearStepMarkers();
    inspectorMessage(message);
    autosaveDraft();
  }
  function doUndo(){ historyStep(undoStack, redoStack, 'undid the last builder action — board re-rendered'); }
  function doRedo(){ historyStep(redoStack, undoStack, 'redid the builder action — board re-rendered'); }
  if (undoBtn) undoBtn.addEventListener('click', doUndo);
  if (redoBtn) redoBtn.addEventListener('click', doRedo);

  /* ---- draft autosave + recovery offer ---- */
  var DRAFT_KEY = 'dv-workbench-draft';
  function autosaveDraft(){
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({text: src.value, at: Date.now()})); }
    catch (ex){ /* storage unavailable: the feature degrades to nothing */ }
  }
  function readDraft(){
    try {
      var d = JSON.parse(localStorage.getItem(DRAFT_KEY));
      return d && typeof d.text === 'string' ? d : null;
    } catch (ex){ return null; }
  }
  function clearDraft(){
    try { localStorage.removeItem(DRAFT_KEY); } catch (ex){}
  }
  var draftTimer = null;
  src.addEventListener('input', function(){
    if (draftTimer) clearTimeout(draftTimer);
    draftTimer = setTimeout(autosaveDraft, 800);
  });
  (function offerDraft(){
    var bar = document.getElementById('draftbar');
    var draft = readDraft(); /* captured once — later autosaves cannot swap it */
    if (!bar || !draft || draft.text === src.value) return;
    bar.innerHTML = '';
    var label = document.createElement('span');
    label.textContent = 'unsaved draft from ' + new Date(draft.at || 0).toLocaleString() + ' —';
    var restore = document.createElement('button');
    restore.type = 'button'; restore.className = 'bbtn'; restore.textContent = 'restore';
    restore.addEventListener('click', function(){
      pushUndo(); /* restoring is one undoable action */
      src.value = draft.text;
      render();
      bar.hidden = true;
      autosaveDraft();
    });
    var discard = document.createElement('button');
    discard.type = 'button'; discard.className = 'bbtn'; discard.textContent = 'discard';
    discard.addEventListener('click', function(){
      clearDraft();
      bar.hidden = true;
    });
    bar.appendChild(label); bar.appendChild(restore); bar.appendChild(discard);
    bar.hidden = false;
  })();

  /* ---- open a .spec.json / save the editor to disk ---- */
  var fileInput = document.getElementById('file-input');
  var openBtn = document.getElementById('file-open');
  var saveBtn = document.getElementById('file-save');
  if (openBtn && fileInput){
    openBtn.addEventListener('click', function(){ fileInput.click(); });
    fileInput.addEventListener('change', function(){
      var f = fileInput.files && fileInput.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function(){
        pushUndo(); /* opening replaces the editor — undoable */
        src.value = String(reader.result);
        render(); /* parse/validation errors surface in the message list */
        setSelected(null); currentTarget = null;
        if (guide) guide.hidden = true;
        autosaveDraft();
      };
      reader.onerror = function(){
        inspectorMessage('could not read "' + f.name + '" — the editor is unchanged');
      };
      reader.readAsText(f);
      fileInput.value = ''; /* allow re-opening the same file */
    });
  }
  if (saveBtn){
    saveBtn.addEventListener('click', function(){
      /* saves the editor text as-is — un-renderable work is still work */
      var parsed = parseEditor();
      var name = specFileName(parsed.error ? null : parsed.raw);
      var blob = new Blob([src.value], {type: 'application/json'});
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
    });
  }

  /* ---- board highlight by stable identity, re-applied after renders ---- */
  function cssQuote(s){
    /* node ids come from the spec and may hold quotes/backslashes */
    if (window.CSS && CSS.escape) return CSS.escape(String(s));
    return String(s).replace(/[^A-Za-z0-9_-]/g, '\\$&');
  }
  function findTargetEl(t){
    if (!t) return null;
    if (t.kind === 'tab') return document.getElementById('tab-' + t.block + '-' + t.tab);
    var secEl = view.querySelector('.doc-sec[data-dv-section="' + t.section + '"]');
    if (!secEl) return null;
    if (t.kind === 'section') return secEl;
    if (t.kind === 'step'){
      /* prefer the numbered coin; steps sharing a first hop (or
         edgeless steps) have no coin — fall back to their chip */
      var coin = secEl.querySelector('[data-dv-step="' + t.index + '"]');
      if (coin) return coin;
      var chipsBox = secEl.querySelector('.schips');
      return (chipsBox && chipsBox.children[t.index]) || null;
    }
    var sel = t.kind === 'node' ? '[data-dv-node="' + cssQuote(t.id) + '"]' :
              t.kind === 'edge' ? 'path.edge[data-dv-edge="' + t.index + '"]' :
              t.kind === 'step' ? '[data-dv-step="' + t.index + '"]' :
              t.kind === 'bullet' ? '[data-dv-bullet="' + t.index + '"]' :
              t.kind === 'para' ? '[data-dv-para="' + t.index + '"]' :
              t.kind === 'crow' ? '[data-dv-crow="' + t.index + '"]' :
                                  '[data-dv-panel="' + t.index + '"]';
    try { return secEl.querySelector(sel); } catch (ex){ return null; }
  }
  function rehighlight(){ setSelected(findTargetEl(currentTarget)); }

  /* ---- board markers for the selected step's members ---- */
  function clearStepMarkers(){
    Array.prototype.forEach.call(view.querySelectorAll('.dv-instep'), function(el){
      el.classList.remove('dv-instep');
    });
  }
  function stepperFor(sectionOrdinal){
    var ctl = opts.ctl ? opts.ctl() : null;
    if (!ctl || !ctl.sections) return null;
    var rec = null;
    ctl.sections.forEach(function(s){ if (!rec && s.number === sectionOrdinal + 1) rec = s; });
    return rec ? rec.stepper : null;
  }
  function syncBoardToSelectedStep(){
    /* selecting a step means SEEING that step: put the board in step
       view at that index — and keep it there across the builder's own
       re-renders, which otherwise reopen the diagram's default
       (usually ambient) view */
    var t = currentTarget;
    if (!t || t.kind !== 'step') return;
    var stepper = stepperFor(t.section);
    if (!stepper) return;
    if (stepper.mode() !== 'step') stepper.enterStep(false);
    if (stepper.current().n !== t.index) stepper.jump(t.index);
  }
  function applyStepMarkers(){
    clearStepMarkers();
    var t = currentTarget;
    if (!t || t.kind !== 'step') return;
    var parsed = parseEditor();
    if (parsed.error) return;
    var got = builderStepAt(parsed.raw, t.section, t.index);
    var secEl = view.querySelector('.doc-sec[data-dv-section="' + t.section + '"]');
    if (!got || !secEl) return;
    var keyToIdx = Object.create(null);
    (got.d.edges || []).forEach(function(e, i){
      var k = builderEdgeKey(e);
      if (!(k in keyToIdx)) keyToIdx[k] = i;
    });
    builderStepHops(got.st).forEach(function(k){
      if (!(k in keyToIdx)) return;
      /* mark the edge AND its halo twin — the halo carries the glow in
         every skin (terminal strips CSS filters, so a filter-based glow
         cannot be the marker) */
      var el = secEl.querySelector('path.edge[data-dv-edge="' + keyToIdx[k] + '"]');
      if (el) el.classList.add('dv-instep');
      var halo = secEl.querySelector('path.halo[data-dv-edge="' + keyToIdx[k] + '"]');
      if (halo) halo.classList.add('dv-instep');
    });
    (Array.isArray(got.st.nodes) ? got.st.nodes : []).forEach(function(id){
      var el = secEl.querySelector('[data-dv-node="' + cssQuote(id) + '"]');
      if (el) el.classList.add('dv-instep');
    });
    Object.keys(got.st.panels || {}).forEach(function(pid){
      var idx = -1;
      (got.d.panels || []).forEach(function(pn, i){ if (idx < 0 && pn && pn.id === pid) idx = i; });
      if (idx < 0) return;
      var el = secEl.querySelector('[data-dv-panel="' + idx + '"]');
      if (el) el.classList.add('dv-instep');
    });
  }

  /* ================= inspector: forms that write the JSON ================= */

  function inspectorMessage(text){
    if (!guide) return;
    guide.hidden = false;
    guide.innerHTML = '';
    var n = document.createElement('div');
    n.className = 'gerr'; n.textContent = text;
    guide.appendChild(n);
  }
  function formError(text){
    var slot = guide && guide.querySelector('.ierr');
    if (!slot){ inspectorMessage(text); return; }
    slot.textContent = text || '';
    slot.hidden = !text;
  }

  /* apply a plan produced by a pure planner; keeps form focus (no textarea
     focus steal), re-renders, re-applies the board highlight */
  function applyPlan(plan, opt){
    if (!plan || plan.error){ formError(plan ? plan.error : 'edit failed'); return false; }
    formError('');
    pushUndo();
    if (addToStep) addModeSurvive = true; /* builder-internal render — keep the mode */
    src.value = plan.text;
    render();
    autosaveDraft();
    if (opt && opt.after) opt.after(plan);
    rehighlight();
    syncBoardToSelectedStep();
    applyStepMarkers();
    var parsed = parseEditor();
    if (!parsed.error) updateTargetLabel(parsed.raw);
    if (plan.start != null) scrollTextareaTo(plan.start);
    return true;
  }
  function commitSimple(key, valueTextOrNull){
    var parsed = parseEditor();
    if (parsed.error){ formError(parsed.error); return false; }
    var path = builderTargetPath(parsed.raw, currentTarget);
    if (!path){ formError('element not found — click Render, then reselect'); return false; }
    return applyPlan(planSetField(src.value, parsed.raw, path, key, valueTextOrNull));
  }
  function commitCascade(planFor, opt){
    var parsed = parseEditor();
    if (parsed.error){ formError(parsed.error); return false; }
    return applyPlan(planFor(parsed.raw), opt);
  }
  function commitValue(valueText){
    /* replace the selected element's WHOLE value (bullet string, paragraph) */
    var parsed = parseEditor();
    if (parsed.error){ formError(parsed.error); return false; }
    var path = builderTargetPath(parsed.raw, currentTarget);
    if (!path){ formError('element not found — click Render, then reselect'); return false; }
    return applyPlan(planReplaceValue(src.value, parsed.raw, path, valueText));
  }

  /* ---- form controls ---- */
  function frow(labelText, control){
    var row = document.createElement('label');
    row.className = 'frow';
    var lab = document.createElement('span');
    lab.className = 'flab'; lab.textContent = labelText;
    row.appendChild(lab); row.appendChild(control);
    return row;
  }
  function commitOnChange(input, getCommitValue, commit){
    /* a commit returning false (validation or plan error) resets the
       remembered value so re-entering ANY value — the original included —
       fires again instead of being swallowed as "unchanged" */
    var last = input.value;
    var fire = function(){
      if (input.value === last) return;
      last = input.value;
      var ok = commit(getCommitValue ? getCommitValue(input.value) : input.value);
      if (ok === false) last = null;
    };
    input.addEventListener('change', fire);
    input.addEventListener('keydown', function(ev){
      if (ev.key === 'Enter' && input.tagName !== 'TEXTAREA'){ ev.preventDefault(); fire(); }
    });
  }
  function textControl(value, commit, opts){
    var input = document.createElement(opts && opts.textarea ? 'textarea' : 'input');
    if (!opts || !opts.textarea) input.type = 'text';
    input.className = 'fctl';
    if (opts && opts.placeholder) input.placeholder = opts.placeholder;
    if (opts && opts.list) input.setAttribute('list', opts.list);
    input.value = value == null ? '' : String(value);
    /* empty commits as removal unless the field is required */
    commitOnChange(input, null, function(v){
      var trimmed = v.trim();
      if (!trimmed && opts && opts.required){ formError(opts.required); return false; }
      return commit(trimmed === '' ? null : trimmed);
    });
    return input;
  }
  function numberControl(value, commit){
    var input = document.createElement('input');
    input.type = 'text'; input.className = 'fctl fnum';
    input.value = value == null ? '' : String(value);
    commitOnChange(input, null, function(v){
      var trimmed = v.trim();
      if (trimmed === '') return commit(null);
      var num = Number(trimmed);
      if (!isFinite(num)){ formError('"' + trimmed + '" is not a number'); return false; }
      return commit(num);
    });
    return input;
  }
  function selectControl(options, current, commit, allowEmpty){
    var sel = document.createElement('select');
    sel.className = 'fctl';
    if (allowEmpty){
      var none = document.createElement('option');
      none.value = ''; none.textContent = '(none)';
      sel.appendChild(none);
    }
    var seen = false;
    options.forEach(function(o){
      var op = document.createElement('option');
      op.value = o; op.textContent = o;
      if (o === current) seen = true;
      sel.appendChild(op);
    });
    if (current != null && current !== '' && !seen){
      var extra = document.createElement('option');
      extra.value = current; extra.textContent = current + ' (unknown)';
      sel.appendChild(extra);
    }
    sel.value = current == null ? '' : String(current);
    commitOnChange(sel, null, function(v){ return commit(v === '' ? null : v); });
    return sel;
  }
  function checkboxControl(checked, commit){
    var wrap = document.createElement('span');
    wrap.className = 'fctl fchk';
    var input = document.createElement('input');
    input.type = 'checkbox'; input.checked = !!checked;
    input.addEventListener('change', function(){
      if (commit(input.checked) === false) input.checked = !input.checked;
    });
    wrap.appendChild(input);
    return wrap;
  }
  function actionButton(label, onClick, cls){
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'bbtn ' + (cls || '');
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }
  function ensureAccentDatalist(){
    if (document.getElementById('accent-tokens')) return;
    var dl = document.createElement('datalist');
    dl.id = 'accent-tokens';
    Object.keys(ACCENTS).forEach(function(name){
      var op = document.createElement('option');
      op.value = name; dl.appendChild(op);
    });
    document.body.appendChild(dl);
  }

  function protocolKinds(page){
    var kinds = ['https', 'int', 'mqtt'];
    Object.keys((page && page.protocols) || {}).forEach(function(k){
      if (kinds.indexOf(k) < 0) kinds.push(k);
    });
    return kinds;
  }

  /* ---- per-kind form builders; each returns an array of DOM rows ---- */
  function nodeForm(val, ctx){
    var t = currentTarget;
    return [
      frow('id', textControl(t.id, function(v){
        if (v == null){ formError('a node needs an id'); return false; }
        if (v === t.id){ formError(''); return true; }
        return commitCascade(function(raw){ return planRenameNode(src.value, raw, t.section, t.id, v); },
          {after: function(){ t.id = v; renderInspector(); }});
      }, {required: 'a node needs an id'})),
      frow('title', textControl(val.title, function(v){ return commitSimple('title', v == null ? null : JSON.stringify(v)); })),
      frow('sub', textControl(val.sub, function(v){ return commitSimple('sub', v == null ? null : JSON.stringify(v)); })),
      frow('icon', selectControl(ICON_SET, val.icon || 'gear', function(v){ return commitSimple('icon', JSON.stringify(v || 'gear')); })),
      frow('tint', selectControl(TINT_SET, val.tint || 'cmd', function(v){ return commitSimple('tint', JSON.stringify(v || 'cmd')); })),
      frow('link', textControl(val.link, function(v){ return commitSimple('link', v == null ? null : JSON.stringify(v)); }, {placeholder: 'permalink URL'}))
    ];
  }
  function edgeForm(val, ctx){
    var t = currentTarget;
    var ids = Object.keys((ctx.diagram && ctx.diagram.nodes) || {});
    function endpoint(field){
      return selectControl(ids, val[field], function(v){
        if (v == null) return true; /* endpoint kept — nothing to commit */
        return commitCascade(function(raw){
          return planSetEdgeEndpoint(src.value, raw, t.section, t.index, field, v);
        });
      });
    }
    return [
      frow('from', endpoint('from')),
      frow('to', endpoint('to')),
      frow('kind', selectControl(protocolKinds(ctx.page), val.kind || 'int', function(v){ return commitSimple('kind', JSON.stringify(v || 'int')); })),
      frow('ret (response)', checkboxControl(val.ret, function(on){ return commitSimple('ret', on ? 'true' : null); })),
      frow('label', textControl(val.label, function(v){ return commitSimple('label', v == null ? null : JSON.stringify(v)); })),
      frow('bend', numberControl(val.bend, function(v){ return commitSimple('bend', v == null ? null : String(v)); })),
      frow('labelDx', numberControl(val.labelDx, function(v){ return commitSimple('labelDx', v == null ? null : String(v)); })),
      frow('labelDy', numberControl(val.labelDy, function(v){ return commitSimple('labelDy', v == null ? null : String(v)); }))
    ];
  }
  function chipRow(labelText, items, emptyText, onRemove, onBody){
    var box = document.createElement('span');
    box.className = 'fctl mchips';
    if (!items.length){
      var none = document.createElement('span');
      none.className = 'fnote';
      none.textContent = emptyText;
      box.appendChild(none);
    }
    items.forEach(function(it){
      var chip = document.createElement('span');
      chip.className = 'mchip' + (it.open ? ' open' : '');
      var lab = document.createElement('button');
      lab.type = 'button'; lab.className = 'mlab';
      lab.textContent = it.label;
      if (onBody) lab.addEventListener('click', function(){ onBody(it.key); });
      else lab.tabIndex = -1;
      var x = document.createElement('button');
      x.type = 'button'; x.className = 'mx';
      x.textContent = '\u00d7'; x.title = 'remove from this step';
      x.setAttribute('aria-label', 'remove ' + it.label + ' from this step');
      x.addEventListener('click', function(){ onRemove(it.key); });
      chip.appendChild(lab); chip.appendChild(x);
      box.appendChild(chip);
    });
    return frow(labelText, box);
  }
  function stepForm(val, ctx){
    var t = currentTarget;
    function toggled(planFn){
      return function(key){
        commitCascade(function(raw){ return planFn(src.value, raw, t.section, t.index, key); },
          {after: function(){ renderInspector(); }});
      };
    }
    var rows = [
      frow('text', textControl(val.text, function(v){ return commitSimple('text', v == null ? null : JSON.stringify(v)); }, {textarea: true}))
    ];
    var laneNames = Object.keys((ctx.page && ctx.page.lanes) || {});
    rows.push(frow('lane', selectControl(laneNames, val.lane, function(v){
      return commitSimple('lane', v == null ? null : JSON.stringify(v));
    }, true)));
    rows.push(frow('link', textControl(val.link, function(v){ return commitSimple('link', v == null ? null : JSON.stringify(v)); }, {placeholder: 'permalink URL'})));

    /* ---- the step's contract: hops, lit nodes, panel patches ---- */
    rows.push(chipRow('hops',
      builderStepHops(val).map(function(k){ return {key: k, label: k}; }),
      'none — edgeless step', toggled(planStepToggleHop)));
    rows.push(chipRow('nodes',
      (Array.isArray(val.nodes) ? val.nodes : []).map(function(n){ return {key: n, label: n}; }),
      'none', toggled(planStepToggleNode)));
    var pids = Object.keys(val.panels || {});
    rows.push(chipRow('panels',
      pids.map(function(pid){ return {key: pid, label: pid}; }),
      'none', toggled(planStepTogglePanel)));
    /* every patch gets its own editor, open by default */
    pids.forEach(function(pid){
      rows.push(frow('patch ' + pid, textControl(JSON.stringify(val.panels[pid]), function(v){
        if (v == null){ formError('a patch is a JSON object — remove the panel chip instead'); return false; }
        return commitCascade(function(raw){
          return planStepSetPanelPatch(src.value, raw, t.section, t.index, pid, v);
        }, {after: function(){ renderInspector(); }});
      }, {textarea: true})));
    });
    return rows;
  }
  function panelForm(val, ctx){
    var t = currentTarget;
    return [
      frow('id', textControl(val.id, function(v){
        if (v == null){ formError('a panel needs an id'); return false; }
        if (v === val.id){ formError(''); return true; }
        return commitCascade(function(raw){ return planRenamePanel(src.value, raw, t.section, t.index, v); },
          {after: function(){ renderInspector(); }});
      }, {required: 'a panel needs an id'})),
      frow('type', selectControl(PANEL_TYPES, val.type, function(v){ return commitSimple('type', v == null ? null : JSON.stringify(v)); })),
      frow('title', textControl(val.title, function(v){ return commitSimple('title', v == null ? null : JSON.stringify(v)); }))
    ];
  }
  function sectionForm(val, ctx){
    ensureAccentDatalist();
    return [
      frow('heading', textControl(val.heading, function(v){ return commitSimple('heading', v == null ? null : JSON.stringify(v)); })),
      frow('accent', textControl(val.accent, function(v){ return commitSimple('accent', v == null ? null : JSON.stringify(v)); },
        {list: 'accent-tokens', placeholder: 'token or #hex'})),
      frow('source', textControl(val.source, function(v){ return commitSimple('source', v == null ? null : JSON.stringify(v)); }, {placeholder: 'permalink URL'}))
    ];
  }

  function bulletForm(val, ctx){
    var isObj = val != null && typeof val === 'object';
    var rows = [
      frow('text', textControl(isObj ? val.text : val, function(v){
        var s = JSON.stringify(v == null ? '' : v);
        return isObj ? commitSimple('text', s) : commitValue(s);
      }, {textarea: true}))
    ];
    if (isObj && Array.isArray(val.sub) && val.sub.length){
      var note = document.createElement('span');
      note.className = 'fctl fnote';
      note.textContent = val.sub.length + ' nested sub-bullet' + (val.sub.length > 1 ? 's' : '') + ' — edit them in the JSON';
      rows.push(frow('sub', note));
    }
    return rows;
  }
  function paraForm(val, ctx){
    return [
      frow('text', textControl(val, function(v){
        return commitValue(JSON.stringify(v == null ? '' : v));
      }, {textarea: true}))
    ];
  }
  function crowForm(val, ctx){
    return [
      frow('k', textControl(val.k, function(v){
        if (v == null){ formError('a contract row needs k — the field name'); return false; }
        return commitSimple('k', JSON.stringify(v));
      }, {required: 'a contract row needs k — the field name'})),
      frow('v', textControl(val.v, function(v){ return commitSimple('v', v == null ? null : JSON.stringify(v)); })),
      frow('g', textControl(val.g, function(v){ return commitSimple('g', v == null ? null : JSON.stringify(v)); })),
      frow('hot', checkboxControl(val.hot, function(on){ return commitSimple('hot', on ? 'true' : null); })),
      frow('delta', selectControl(['added', 'removed', 'changed'], val.delta, function(v){
        return commitSimple('delta', v == null ? null : JSON.stringify(v));
      }, true)),
      frow('link', textControl(val.link, function(v){ return commitSimple('link', v == null ? null : JSON.stringify(v)); }, {placeholder: 'permalink URL'}))
    ];
  }

  function tabForm(val, ctx){
    var t = currentTarget;
    return [
      frow('label', textControl(val.label, function(v){
        if (v == null){ formError('a tab needs a label'); return false; }
        /* capture BEFORE the commit whether this tab is the shown one —
           only then may the rename re-activate it (the engine restores
           the active tab by LABEL slug, so renaming the shown tab makes
           the re-render fall back to the first tab; a tab that was not
           shown must stay not shown) */
        var before = findTargetEl(t);
        var wasActive = !!(before && before.getAttribute('aria-selected') === 'true');
        var ok = commitSimple('label', JSON.stringify(v));
        if (ok && wasActive){
          var btn = findTargetEl(t);
          if (btn && btn.getAttribute('aria-selected') !== 'true') btn.click();
        }
        return ok;
      }, {required: 'a tab needs a label'})),
      frow('highlight', textControl(val.highlight === true ? 'true' : val.highlight, function(v){
        if (v == null) return commitSimple('highlight', null);
        return commitSimple('highlight', v === 'true' ? 'true' : JSON.stringify(v));
      }, {list: 'accent-tokens', placeholder: 'true, token, or #hex'}))
    ];
  }

  function deletePlanFor(t, raw){
    if (t.kind === 'tab') return planDeleteTab(src.value, raw, t.block, t.tab);
    if (t.kind === 'node') return planDeleteNode(src.value, raw, t.section, t.id);
    if (t.kind === 'edge') return planDeleteEdge(src.value, raw, t.section, t.index);
    if (t.kind === 'step') return planDeleteStep(src.value, raw, t.section, t.index);
    if (t.kind === 'panel') return planDeletePanel(src.value, raw, t.section, t.index);
    var rec = specSectionPaths(raw)[t.section];
    if (!rec) return {error: 'no such section'};
    if (t.kind === 'bullet') return planDeleteListItem(src.value, raw, rec.section.concat(['bullets']), t.index);
    if (t.kind === 'para'){
      var sec = specValueAt(raw, rec.section);
      if (sec && typeof sec.text === 'string') return planSetField(src.value, raw, rec.section, 'text', null);
      return planDeleteListItem(src.value, raw, rec.section.concat(['text']), t.index);
    }
    if (t.kind === 'crow') return planDeleteListItem(src.value, raw, rec.section.concat(['contract', 'fields']), t.index);
    return planDeleteSection(src.value, raw, t.section);
  }

  function deleteCurrent(){
    var t = currentTarget;
    if (!t) return;
    commitCascade(function(raw){ return deletePlanFor(t, raw); },
      {after: function(){
        currentTarget = null; setSelected(null);
        if (t.kind === 'section') insertSection = 0;
        inspectorMessage(t.kind + ' deleted — undo restores it');
      }});
  }

  function renderInspector(){
    if (!guide || !currentTarget) return;
    var t = currentTarget;
    guide.hidden = false;
    guide.innerHTML = '';
    var g = BUILDER_GUIDES[t.kind] || {title: t.kind, how: '', fields: []};

    var head = document.createElement('b');
    head.textContent = g.title;
    guide.appendChild(head);

    var parsed = parseEditor();
    var path = parsed.error ? null : builderTargetPath(parsed.raw, t);
    var loc = path ? jsonLocate(src.value, path) : null;

    var p = document.createElement('span');
    p.className = 'gpath';
    p.textContent = path ? builderPathString(path) : '';
    guide.appendChild(p);

    var err = document.createElement('div');
    err.className = 'gerr ierr'; err.hidden = true;
    guide.appendChild(err);

    if (parsed.error){
      formError(parsed.error + ' — fix it to edit this element');
    } else if (!loc){
      formError('definition not found in the editor text — the render and the editor may be out of sync (click Render)');
    } else if (t.kind === 'section' && path.length === 0){
      formError('bare diagram — wrap it as {"page": {"blocks": [ ... ]}} to edit heading and accent');
    } else {
      var val = specValueAt(parsed.raw, path);
      if (val == null) val = {};
      var rec = specSectionPaths(parsed.raw)[t.section];
      var ctx = {
        page: normalize(parsed.raw) || {},
        diagram: rec ? specValueAt(parsed.raw, rec.diagram) : null
      };
      var form = document.createElement('div');
      form.className = 'iform';
      if (t.kind === 'tab') ensureAccentDatalist();
      var rows =
        t.kind === 'node' ? nodeForm(val, ctx) :
        t.kind === 'edge' ? edgeForm(val, ctx) :
        t.kind === 'step' ? stepForm(val, ctx) :
        t.kind === 'panel' ? panelForm(val, ctx) :
        t.kind === 'bullet' ? bulletForm(val, ctx) :
        t.kind === 'para' ? paraForm(val, ctx) :
        t.kind === 'crow' ? crowForm(val, ctx) :
        t.kind === 'tab' ? tabForm(val, ctx) : sectionForm(val, ctx);
      rows.forEach(function(r){ form.appendChild(r); });
      guide.appendChild(form);

      var acts = document.createElement('div');
      acts.className = 'iacts';
      if (t.kind === 'node'){
        acts.appendChild(actionButton('duplicate', function(){
          commitCascade(function(raw){ return planDuplicateNode(src.value, raw, t.section, t.id); },
            {after: function(plan){
              currentTarget = {section: t.section, kind: 'node', id: plan.id};
              renderInspector();
            }});
        }));
      }
      if (t.kind === 'section'){
        acts.appendChild(actionButton('duplicate', function(){
          commitCascade(function(raw){ return planDuplicateSection(src.value, raw, t.section); },
            {after: function(plan){
              currentTarget = {section: plan.index, kind: 'section'};
              insertSection = plan.index;
              renderInspector();
            }});
        }));
      }
      if (t.kind === 'tab'){
        acts.appendChild(actionButton('+ tab', function(){
          commitCascade(function(raw){ return planAddTab(src.value, raw, t.block, t.tab); },
            {after: function(plan){
              currentTarget = {kind: 'tab', block: plan.block, tab: plan.index};
              renderInspector();
            }});
        }));
        acts.appendChild(actionButton('← earlier', function(){
          commitCascade(function(raw){ return planMoveTab(src.value, raw, t.block, t.tab, -1); },
            {after: function(plan){ t.tab = plan.index; renderInspector(); }});
        }));
        acts.appendChild(actionButton('→ later', function(){
          commitCascade(function(raw){ return planMoveTab(src.value, raw, t.block, t.tab, 1); },
            {after: function(plan){ t.tab = plan.index; renderInspector(); }});
        }));
      }
      var armedHere = !!(addToStep && t.kind === 'step' &&
                         addToStep.section === t.section && addToStep.step === t.index);
      if (t.kind === 'step'){
        acts.appendChild(actionButton(armedHere ? 'DONE adding (Esc)' : 'ADD TO STEP', function(){
          if (addToStep){ cancelAddToStep(null); return; }
          if (connect) cancelConnect(null);
          addToStep = {section: t.section, step: t.index};
          addToStepStatus();
          renderInspector();
        }));
      }
      if (t.kind === 'step' && !armedHere){
        acts.appendChild(actionButton('↑ earlier', function(){
          commitCascade(function(raw){ return planMoveStep(src.value, raw, t.section, t.index, -1); },
            {after: function(plan){ t.index = plan.index; renderInspector(); }});
        }));
        acts.appendChild(actionButton('↓ later', function(){
          commitCascade(function(raw){ return planMoveStep(src.value, raw, t.section, t.index, 1); },
            {after: function(plan){ t.index = plan.index; renderInspector(); }});
        }));
      }
      if (!armedHere)
        acts.appendChild(actionButton('delete ' + t.kind, deleteCurrent, 'bdanger'));
      guide.appendChild(acts);
    }

    /* the pass-1 field guidance, tucked under a details fold */
    var help = document.createElement('details');
    help.className = 'ihelp';
    var sum = document.createElement('summary');
    sum.textContent = 'field help';
    help.appendChild(sum);
    var how = document.createElement('div');
    how.textContent = g.how;
    help.appendChild(how);
    var ul = document.createElement('ul');
    g.fields.forEach(function(f){
      var li = document.createElement('li');
      var c = document.createElement('code');
      c.textContent = f[0];
      li.appendChild(c);
      li.appendChild(document.createTextNode(' — ' + f[1]));
      ul.appendChild(li);
    });
    help.appendChild(ul);
    if (g.tokens){
      var tok = document.createElement('div');
      tok.className = 'gtokens'; tok.textContent = g.tokens;
      help.appendChild(tok);
    }
    guide.appendChild(help);
  }

  /* ================= selection ================= */

  function targetFromEvent(ev){
    /* tab buttons both switch the panel (engine) and select the tab
       here; the copy chip beside a tab is NOT a .tabbtn and still falls
       through to the interactive skip below */
    var tabBtn = ev.target.closest && ev.target.closest('.tabbtn');
    if (tabBtn){
      var m = /^tab-(\d+)-(\d+)$/.exec(tabBtn.id || '');
      if (m) return {kind: 'tab', block: parseInt(m[1], 10), tab: parseInt(m[2], 10), el: tabBtn};
      return null;
    }
    /* step chips in the click-through bar both jump playback (engine)
       and select the step here; the chip's position IS the step index */
    var chip = ev.target.closest && ev.target.closest('.schip');
    if (chip){
      var chipSec = chip.closest('.doc-sec');
      if (!chipSec || !chipSec.hasAttribute('data-dv-section')) return null;
      var chipIdx = Array.prototype.indexOf.call(chip.parentNode.children, chip);
      if (chipIdx < 0) return null;
      return {section: parseInt(chipSec.getAttribute('data-dv-section'), 10),
              kind: 'step', index: chipIdx, el: chip};
    }
    if (ev.target.closest('a, button, summary, [role="button"], input, select, textarea')) return null;
    /* the caption line selects the CURRENT step (links and the copy
       chip inside it were already skipped above) */
    var line = ev.target.closest && ev.target.closest('.stepline');
    if (line){
      var lineSec = line.closest('.doc-sec');
      var chipsBox = lineSec && lineSec.querySelector('.schips');
      if (!lineSec || !chipsBox || !lineSec.hasAttribute('data-dv-section')) return null;
      var cur = -1;
      Array.prototype.forEach.call(chipsBox.children, function(c, i){
        if (cur < 0 && c.getAttribute('aria-current') === 'true') cur = i;
      });
      if (cur < 0) return null;
      return {section: parseInt(lineSec.getAttribute('data-dv-section'), 10),
              kind: 'step', index: cur, el: chipsBox.children[cur]};
    }
    var secEl = ev.target.closest('.doc-sec');
    if (!secEl || !secEl.hasAttribute('data-dv-section')) return null;
    var gi = parseInt(secEl.getAttribute('data-dv-section'), 10);
    if (isNaN(gi)) return null;
    var el = ev.target.closest('[data-dv-node], [data-dv-edge], [data-dv-step], [data-dv-panel], [data-dv-bullet], [data-dv-para], [data-dv-crow]');
    if (el && secEl.contains(el)){
      if (el.hasAttribute('data-dv-node'))
        return {section: gi, kind: 'node', id: el.getAttribute('data-dv-node'), el: el};
      if (el.hasAttribute('data-dv-step'))
        return {section: gi, kind: 'step', index: parseInt(el.getAttribute('data-dv-step'), 10), el: el};
      if (el.hasAttribute('data-dv-panel'))
        return {section: gi, kind: 'panel', index: parseInt(el.getAttribute('data-dv-panel'), 10), el: el};
      if (el.hasAttribute('data-dv-bullet'))
        return {section: gi, kind: 'bullet', index: parseInt(el.getAttribute('data-dv-bullet'), 10), el: el};
      if (el.hasAttribute('data-dv-para'))
        return {section: gi, kind: 'para', index: parseInt(el.getAttribute('data-dv-para'), 10), el: el};
      if (el.hasAttribute('data-dv-crow'))
        return {section: gi, kind: 'crow', index: parseInt(el.getAttribute('data-dv-crow'), 10), el: el};
      /* halo and label clicks resolve to the same edge — highlight the
         visible edge path (the halo has no selected style of its own) */
      var edgeIdx = parseInt(el.getAttribute('data-dv-edge'), 10);
      var edgeEl = secEl.querySelector('path.edge[data-dv-edge="' + edgeIdx + '"]') || el;
      return {section: gi, kind: 'edge', index: edgeIdx, el: edgeEl};
    }
    return {section: gi, kind: 'section', el: secEl};
  }

  function selectTarget(target, focusEditor){
    setSelected(target.el);
    currentTarget = {section: target.section, kind: target.kind,
                     id: target.id, index: target.index,
                     block: target.block, tab: target.tab};
    if (target.kind !== 'tab') insertSection = target.section;
    var parsed = parseEditor();
    if (!parsed.error) updateTargetLabel(parsed.raw);
    renderInspector();
    syncBoardToSelectedStep();
    applyStepMarkers();
    if (focusEditor === false) return;
    var path = parsed.error ? null : builderTargetPath(parsed.raw, currentTarget);
    var loc = path ? jsonLocate(src.value, path) : null;
    if (loc) selectRange(loc);
  }

  /* ---- ADD TO STEP mode: board clicks toggle step membership ---- */
  var addToStep = null; /* {section, step} while active */
  var addModeSurvive = false; /* set around this mode's own re-renders */
  function addToStepStatus(){
    if (targetLabel && addToStep)
      targetLabel.textContent = 'add to step ' + (addToStep.step + 1) +
        ': click edges, nodes, panels to toggle — Esc or DONE ends';
  }
  var ADD_MODE_BLOCKED = '.mbtn, .tbtn, .schip, .tabbtn, .skbtn, #go, ' +
    '#undo-builder, #redo-builder, #file-open, #file-save, #draftbar .bbtn, ' +
    '#add-node, #add-edge, #add-step, #add-panel, #add-section, #palette .pbtn';
  function addModeBlocker(ev){
    /* while ADD TO STEP is armed, controls that would change the shown
       step, re-render from outside the mode, or leave the page state
       behind the mode's back are paused — capture phase, so the
       engine's own listeners never fire */
    if (!addToStep) return;
    var el = ev.target.closest && ev.target.closest(ADD_MODE_BLOCKED);
    if (!el) return;
    ev.stopPropagation();
    ev.preventDefault();
    formError('finish ADD TO STEP first (DONE or Esc) — this control is paused while the mode is armed');
    addToStepStatus();
  }
  document.addEventListener('click', addModeBlocker, true);
  document.addEventListener('keydown', function(ev){
    /* the tab bar switches tabs on Arrow/Home/End — pause that too
       while the mode is armed (capture phase beats the engine's
       tab-bar listener) */
    if (!addToStep) return;
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].indexOf(ev.key) < 0) return;
    if (!(ev.target.closest && ev.target.closest('.tabbtn'))) return;
    ev.stopPropagation();
    ev.preventDefault();
    formError('finish ADD TO STEP first (DONE or Esc) — tab switching is paused while the mode is armed');
    addToStepStatus();
  }, true);
  function cancelAddToStep(message){
    if (!addToStep) return;
    addToStep = null;
    var parsed = parseEditor();
    updateTargetLabel(parsed.error ? null : parsed.raw);
    if (message) inspectorMessage(message);
    else renderInspector(); /* refresh the button label */
  }
  function handleAddToStepClick(target){
    /* hints go through the inline error slot so the step form stays on
       screen — inspectorMessage would replace the whole panel */
    if (!target || ['edge', 'node', 'panel'].indexOf(target.kind) < 0){
      formError('add to step: click an edge, node, or panel (Esc or DONE ends)');
      addToStepStatus();
      return;
    }
    if (target.section !== addToStep.section){
      formError('that element is in a different section — still adding to step ' + (addToStep.step + 1));
      addToStepStatus();
      return;
    }
    var parsed = parseEditor();
    if (parsed.error){ cancelAddToStep(parsed.error); return; }
    var mode = addToStep;
    var plan = null;
    if (target.kind === 'node'){
      plan = planStepToggleNode(src.value, parsed.raw, mode.section, mode.step, target.id);
    } else if (target.kind === 'edge'){
      var rec = specSectionPaths(parsed.raw)[mode.section];
      var edges = rec ? (specValueAt(parsed.raw, rec.diagram) || {}).edges : null;
      var e = Array.isArray(edges) ? edges[target.index] : null;
      if (!e){ formError('edge not found — the render and the editor may be out of sync'); return; }
      plan = planStepToggleHop(src.value, parsed.raw, mode.section, mode.step, builderEdgeKey(e));
    } else {
      var rec2 = specSectionPaths(parsed.raw)[mode.section];
      var panels = rec2 ? (specValueAt(parsed.raw, rec2.diagram) || {}).panels : null;
      var pn = Array.isArray(panels) ? panels[target.index] : null;
      if (!pn || !pn.id){ formError('panel not found — the render and the editor may be out of sync'); return; }
      plan = planStepTogglePanel(src.value, parsed.raw, mode.section, mode.step, pn.id);
    }
    var ok = applyPlan(plan, {after: function(){ renderInspector(); }});
    if (!ok) return;
    addToStepStatus(); /* applyPlan resets the target label */
  }

  /* ---- connect mode: draw an edge by clicking its two nodes ---- */
  var connect = null; /* null | {stage:1} | {stage:2, section, fromId} */
  function connectStatus(text){
    if (targetLabel) targetLabel.textContent = text;
  }
  function cancelConnect(message){
    connect = null;
    var parsed = parseEditor();
    updateTargetLabel(parsed.error ? null : parsed.raw);
    if (message) inspectorMessage(message);
  }
  function startConnect(){
    if (addToStep) cancelAddToStep(null);
    if (connect){ cancelConnect('connect cancelled'); return; }
    var parsed = parseEditor();
    if (parsed.error){ inspectorMessage(parsed.error + ' — fix it before inserting'); return; }
    if (!specSectionPaths(parsed.raw).length){ inspectorMessage('no sections found in the editor text'); return; }
    connect = {stage: 1};
    connectStatus('connect: click the SOURCE node (Esc cancels)');
  }
  function handleConnectClick(target){
    if (!target || target.kind !== 'node'){
      cancelConnect('connect cancelled — that was not a node');
      return;
    }
    if (connect.stage === 1){
      connect = {stage: 2, section: target.section, fromId: target.id};
      setSelected(target.el);
      connectStatus('connect: ' + target.id + ' → click the TARGET node');
      return;
    }
    if (target.section !== connect.section){
      cancelConnect('connect cancelled — the two nodes are in different sections');
      return;
    }
    var fromId = connect.fromId;
    insertSection = target.section;
    var parsed = parseEditor();
    if (parsed.error){ cancelConnect(parsed.error); return; }
    var plan = planAddEdgeBetween(src.value, parsed.raw, target.section, fromId, target.id);
    if (plan.error){ cancelConnect(plan.error); return; }
    pushUndo();
    src.value = plan.text;
    render();
    autosaveDraft();
    cancelConnect(null);
    var el = findTargetEl({section: target.section, kind: 'edge', index: plan.index});
    selectTarget({section: target.section, kind: 'edge', index: plan.index, el: el}, false);
    selectRange(plan);
  }

  /* ---- drag an edge label to set its labelDx/labelDy nudges ---- */
  var drag = null, suppressClick = false;
  function svgPointAt(svg, inv, clientX, clientY){
    var pt = svg.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    return pt.matrixTransform(inv);
  }
  view.addEventListener('mousedown', function(ev){
    if (ev.button !== 0 || connect) return;
    if (!ev.target.closest) return;
    var lbl = ev.target.closest('text.lbl[data-dv-edge]');
    if (!lbl) return;
    var svg = lbl.ownerSVGElement;
    if (!svg || !svg.getScreenCTM) return;
    var ctm = svg.getScreenCTM();
    if (!ctm) return;
    var inv, start;
    try {
      inv = ctm.inverse();
      start = svgPointAt(svg, inv, ev.clientX, ev.clientY);
    } catch (ex){ return; } /* non-invertible CTM: no drag, plain click still works */
    if (!isFinite(start.x) || !isFinite(start.y)) return;
    drag = {lbl: lbl, svg: svg, inv: inv, x0: start.x, y0: start.y, dx: 0, dy: 0, moved: false};
    ev.preventDefault(); /* no text selection while dragging */
  });
  window.addEventListener('mousemove', function(ev){
    if (!drag) return;
    var pt = svgPointAt(drag.svg, drag.inv, ev.clientX, ev.clientY);
    drag.dx = pt.x - drag.x0;
    drag.dy = pt.y - drag.y0;
    if (drag.dx * drag.dx + drag.dy * drag.dy > 9) drag.moved = true; /* > 3 viewBox units, straight-line */
    if (drag.moved) drag.lbl.setAttribute('transform', 'translate(' + drag.dx + ' ' + drag.dy + ')');
  });
  window.addEventListener('mouseup', function(){
    if (!drag) return;
    var d = drag;
    drag = null;
    if (!d.moved){ d.lbl.removeAttribute('transform'); return; }
    suppressClick = true; /* the click after a real drag is not a selection */
    /* that click fires (if at all) before timeouts run — self-clear so a
       drag released off-target cannot swallow the NEXT genuine click */
    setTimeout(function(){ suppressClick = false; }, 0);
    d.lbl.removeAttribute('transform');
    var secEl = d.lbl.closest('.doc-sec');
    var gi = secEl ? parseInt(secEl.getAttribute('data-dv-section'), 10) : NaN;
    var idx = parseInt(d.lbl.getAttribute('data-dv-edge'), 10);
    if (isNaN(gi) || isNaN(idx)) return;
    var parsed = parseEditor();
    if (parsed.error){ inspectorMessage(parsed.error); return; }
    var target = {section: gi, kind: 'edge', index: idx};
    var path = builderTargetPath(parsed.raw, target);
    var e = path ? specValueAt(parsed.raw, path) : null;
    if (!e){ inspectorMessage('edge not found in the editor text — the render and the editor may be out of sync'); return; }
    var newDx = Math.round((typeof e.labelDx === 'number' ? e.labelDx : 0) + d.dx);
    var newDy = Math.round((typeof e.labelDy === 'number' ? e.labelDy : 0) + d.dy);
    if (!isFinite(newDx) || !isFinite(newDy)) return; /* never write NaN into the spec */
    var plan = planSetFields(src.value, parsed.raw, path, [
      ['labelDx', newDx === 0 ? null : String(newDx)],
      ['labelDy', newDy === 0 ? null : String(newDy)]
    ]);
    if (plan.error){ inspectorMessage(plan.error); return; }
    pushUndo();
    src.value = plan.text;
    render();
    autosaveDraft();
    currentTarget = target;
    insertSection = gi;
    rehighlight();
    renderInspector();
  });

  view.addEventListener('click', function(ev){
    if (suppressClick){ suppressClick = false; return; }
    var target = targetFromEvent(ev);
    if (addToStep){
      handleAddToStepClick(target);
      return;
    }
    if (connect){
      handleConnectClick(target);
      return;
    }
    if (target) selectTarget(target);
  });

  /* a re-render outside the connect flow (Render button, skin switch)
     rebuilds the DOM and can renumber sections — a stale armed connect
     must not wire an edge from the old render. Builder-driven renders
     clear the state synchronously before this observer runs, so only
     stale arming is cancelled. */
  new MutationObserver(function(){
    if (connect) cancelConnect('connect cancelled — the page re-rendered');
    if (addToStep && !addModeSurvive)
      cancelAddToStep('add-to-step ended — the page re-rendered');
    addModeSurvive = false;
    setTimeout(function(){
      syncBoardToSelectedStep(); /* a selected step keeps its step view */
      applyStepMarkers();        /* markers live in the rebuilt DOM */
    }, 0);
  }).observe(view, {childList: true});

  /* ---- keyboard: Esc clears/cancels, Delete removes the selection ---- */
  document.addEventListener('keydown', function(ev){
    if (ev.key === 'Escape'){
      if (palette && !palette.hidden){ closePalette(); return; }
      if (addToStep){ cancelAddToStep('add-to-step ended'); return; }
      if (connect){ cancelConnect('connect cancelled'); return; }
      if (currentTarget){
        currentTarget = null;
        setSelected(null);
        if (guide) guide.hidden = true;
      }
      return;
    }
    if (ev.key === 'Delete' || ev.key === 'Backspace'){
      var ae = document.activeElement;
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT' ||
                 ae.tagName === 'BUTTON' || ae.isContentEditable)) return;
      if (!currentTarget) return;
      ev.preventDefault();
      if (addToStep){
        formError('finish ADD TO STEP first (DONE or Esc) — delete is paused while the mode is armed');
        return;
      }
      deleteCurrent();
    }
  });

  /* ================= insert buttons ================= */

  function runInsert(kind, planFn){
    var parsed = parseEditor();
    if (parsed.error){ inspectorMessage(parsed.error + ' — fix it before inserting'); return; }
    if (kind !== 'section' && !specSectionPaths(parsed.raw).length){
      inspectorMessage('no sections found in the editor text'); return;
    }
    var plan = kind === 'section' ? planAddSection(src.value, parsed.raw)
                                  : planFn(src.value, parsed.raw, insertSection);
    if (plan.error){ inspectorMessage(plan.error); return; }
    pushUndo();
    src.value = plan.text;
    render();
    autosaveDraft();
    if (plan.kind === 'section') insertSection = plan.index;
    var identity = {section: plan.kind === 'section' ? plan.index : insertSection,
                    kind: plan.kind, id: plan.id, index: plan.index};
    var el = findTargetEl(identity);
    selectTarget({section: identity.section, kind: identity.kind, id: identity.id,
                  index: identity.index, el: el}, false);
    selectRange(plan);
  }
  var addButtons = {
    'add-step': ['step', planAddStep],
    'add-section': ['section', planAddSection]
  };
  Object.keys(addButtons).forEach(function(id){
    var btn = document.getElementById(id);
    if (btn) btn.addEventListener('click', function(){
      runInsert(addButtons[id][0], addButtons[id][1]);
    });
  });
  /* + edge draws by clicking source then target (Esc cancels) */
  var edgeBtn = document.getElementById('add-edge');
  if (edgeBtn) edgeBtn.addEventListener('click', startConnect);

  /* ---- insert palettes: + node picks a preset, + panel picks a type ---- */
  var palette = document.getElementById('palette');
  function closePalette(){
    if (palette && !palette.hidden){ palette.hidden = true; palette.innerHTML = ''; }
  }
  function paletteButton(iconToken, labelText, run){
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'pbtn';
    if (iconToken){
      /* iconToken comes from our own preset table, never from the spec */
      var ns = 'http://www.w3.org/2000/svg';
      var svg = document.createElementNS(ns, 'svg');
      svg.setAttribute('viewBox', '0 0 16 16');
      svg.setAttribute('aria-hidden', 'true');
      var use = document.createElementNS(ns, 'use');
      use.setAttribute('href', '#i-' + iconToken);
      svg.appendChild(use);
      b.appendChild(svg);
    }
    b.appendChild(document.createTextNode(labelText));
    b.addEventListener('click', function(){ closePalette(); run(); });
    return b;
  }
  function openPalette(kind){
    if (!palette) return;
    if (!palette.hidden && palette.getAttribute('data-kind') === kind){ closePalette(); return; }
    palette.setAttribute('data-kind', kind);
    palette.innerHTML = '';
    if (kind === 'node'){
      NODE_PRESETS.forEach(function(pr){
        palette.appendChild(paletteButton(pr.icon, pr.title, function(){
          runInsert('node', function(text, raw, si){ return planAddNode(text, raw, si, pr); });
        }));
      });
    } else {
      Object.keys(PANEL_TEMPLATES).forEach(function(type){
        palette.appendChild(paletteButton(null, type, function(){
          runInsert('panel', function(text, raw, si){ return planAddPanel(text, raw, si, type); });
        }));
      });
    }
    palette.hidden = false;
  }
  var nodeBtn = document.getElementById('add-node');
  if (nodeBtn) nodeBtn.addEventListener('click', function(){ openPalette('node'); });
  var panelBtn = document.getElementById('add-panel');
  if (panelBtn) panelBtn.addEventListener('click', function(){ openPalette('panel'); });
  document.addEventListener('click', function(ev){
    if (palette && !palette.hidden &&
        !(ev.target.closest && ev.target.closest('#palette, #add-node, #add-panel'))) closePalette();
  });

  BUILDER_JUMP_TO_FINDING = function(message){
    var parsed = parseEditor();
    if (parsed.error) return;
    var loc = findingLocation(src.value, parsed.raw, message);
    if (!loc) return;
    selectRange(loc);
    if (!loc.exact) inspectorMessage('the exact field is not in the editor text — selected its nearest parent');
  };

  var initial = parseEditor();
  updateTargetLabel(initial.error ? null : initial.raw);
}
