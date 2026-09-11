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
     into the raw editor JSON, or null. */
  var rec = specSectionPaths(raw)[target.section];
  if (!rec) return null;
  if (target.kind === 'section') return rec.section;
  var d = rec.diagram;
  if (target.kind === 'node') return d.concat(['nodes', target.id]);
  if (target.kind === 'edge') return d.concat(['edges', target.index]);
  if (target.kind === 'step') return d.concat(['steps', target.index]);
  if (target.kind === 'panel') return d.concat(['panels', target.index]);
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

function planAddNode(text, raw, sectionIdx){
  var got = builderDiagram(text, raw, sectionIdx);
  if (got.error) return got;
  var d = got.d;
  if (!Array.isArray(d.rows) || !d.rows.length)
    return {error: 'this diagram has no rows — a node needs a row slot to render'};
  var id = builderUniqueKey(d.nodes || {}, 'node');
  var r1 = jsonInsertMember(text, got.path.concat(['rows', d.rows.length - 1]), null, JSON.stringify(id));
  if (!r1) return {error: 'could not edit rows in the editor text'};
  var r2 = jsonInsertMember(r1.text, got.path.concat(['nodes']), id,
    '{"title": "New node", "sub": "what it does", "icon": "gear", "tint": "cmd"}');
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
function planAddPanel(text, raw, sectionIdx){
  var got = builderDiagram(text, raw, sectionIdx);
  if (got.error) return got;
  var taken = Object.create(null);
  (got.d.panels || []).forEach(function(p){ if (p && p.id) taken[p.id] = true; });
  var id = builderUniqueKey(taken, 'panel');
  var item = '{"id": ' + JSON.stringify(id) +
             ', "type": "queue", "title": "New panel", "initial": {"state": "empty"}}';
  var r = jsonInsertListItemOrCreate(text, got.path, 'panels', item);
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
    var line = src.value.slice(0, start).split('\n').length - 1;
    var lh = parseFloat(getComputedStyle(src).lineHeight) || 18;
    src.scrollTop = Math.max(0, line * lh - src.clientHeight * 0.35);
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

  /* ---- undo: one snapshot of the editor text per builder action ---- */
  function pushUndo(){
    undoStack.push(src.value);
    if (undoStack.length > 30) undoStack.shift();
    if (undoBtn) undoBtn.disabled = false;
  }
  function doUndo(){
    if (!undoStack.length) return;
    src.value = undoStack.pop();
    if (undoBtn) undoBtn.disabled = !undoStack.length;
    render();
    setSelected(null); currentTarget = null;
    inspectorMessage('undid the last builder action — board re-rendered');
  }
  if (undoBtn) undoBtn.addEventListener('click', doUndo);

  /* ---- board highlight by stable identity, re-applied after renders ---- */
  function cssQuote(s){
    /* node ids come from the spec and may hold quotes/backslashes */
    if (window.CSS && CSS.escape) return CSS.escape(String(s));
    return String(s).replace(/[^A-Za-z0-9_-]/g, '\\$&');
  }
  function findTargetEl(t){
    if (!t) return null;
    var secEl = view.querySelector('.doc-sec[data-dv-section="' + t.section + '"]');
    if (!secEl) return null;
    if (t.kind === 'section') return secEl;
    var sel = t.kind === 'node' ? '[data-dv-node="' + cssQuote(t.id) + '"]' :
              t.kind === 'edge' ? 'path.edge[data-dv-edge="' + t.index + '"]' :
              t.kind === 'step' ? '[data-dv-step="' + t.index + '"]' :
                                  '[data-dv-panel="' + t.index + '"]';
    try { return secEl.querySelector(sel); } catch (ex){ return null; }
  }
  function rehighlight(){ setSelected(findTargetEl(currentTarget)); }

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
    src.value = plan.text;
    render();
    if (opt && opt.after) opt.after(plan);
    rehighlight();
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
  function stepForm(val, ctx){
    var rows = [
      frow('text', textControl(val.text, function(v){ return commitSimple('text', v == null ? null : JSON.stringify(v)); }, {textarea: true}))
    ];
    if (Array.isArray(val.edges)){
      var note = document.createElement('span');
      note.className = 'fctl fnote';
      note.textContent = 'multi-hop step (' + val.edges.join(', ') + ') — edit the edges list in the JSON';
      rows.push(frow('edges', note));
    } else {
      var keys = ((ctx.diagram && ctx.diagram.edges) || []).map(builderEdgeKey);
      rows.push(frow('edge', selectControl(keys, val.edge, function(v){
        return commitSimple('edge', v == null ? null : JSON.stringify(v));
      }, true)));
    }
    var laneNames = Object.keys((ctx.page && ctx.page.lanes) || {});
    rows.push(frow('lane', selectControl(laneNames, val.lane, function(v){
      return commitSimple('lane', v == null ? null : JSON.stringify(v));
    }, true)));
    rows.push(frow('link', textControl(val.link, function(v){ return commitSimple('link', v == null ? null : JSON.stringify(v)); }, {placeholder: 'permalink URL'})));
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

  function deletePlanFor(t, raw){
    if (t.kind === 'node') return planDeleteNode(src.value, raw, t.section, t.id);
    if (t.kind === 'edge') return planDeleteEdge(src.value, raw, t.section, t.index);
    if (t.kind === 'step') return planDeleteStep(src.value, raw, t.section, t.index);
    if (t.kind === 'panel') return planDeletePanel(src.value, raw, t.section, t.index);
    return planDeleteSection(src.value, raw, t.section);
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
      var val = specValueAt(parsed.raw, path) || {};
      var rec = specSectionPaths(parsed.raw)[t.section];
      var ctx = {
        page: normalize(parsed.raw) || {},
        diagram: rec ? specValueAt(parsed.raw, rec.diagram) : null
      };
      var form = document.createElement('div');
      form.className = 'iform';
      var rows =
        t.kind === 'node' ? nodeForm(val, ctx) :
        t.kind === 'edge' ? edgeForm(val, ctx) :
        t.kind === 'step' ? stepForm(val, ctx) :
        t.kind === 'panel' ? panelForm(val, ctx) : sectionForm(val, ctx);
      rows.forEach(function(r){ form.appendChild(r); });
      guide.appendChild(form);

      var acts = document.createElement('div');
      acts.className = 'iacts';
      if (t.kind === 'step'){
        acts.appendChild(actionButton('↑ earlier', function(){
          commitCascade(function(raw){ return planMoveStep(src.value, raw, t.section, t.index, -1); },
            {after: function(plan){ t.index = plan.index; renderInspector(); }});
        }));
        acts.appendChild(actionButton('↓ later', function(){
          commitCascade(function(raw){ return planMoveStep(src.value, raw, t.section, t.index, 1); },
            {after: function(plan){ t.index = plan.index; renderInspector(); }});
        }));
      }
      acts.appendChild(actionButton('delete ' + t.kind, function(){
        commitCascade(function(raw){ return deletePlanFor(t, raw); },
          {after: function(){
            currentTarget = null; setSelected(null);
            if (t.kind === 'section') insertSection = 0;
            inspectorMessage(t.kind + ' deleted — undo restores it');
          }});
      }, 'bdanger'));
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
    if (ev.target.closest('a, button, summary, [role="button"], input, select, textarea')) return null;
    var secEl = ev.target.closest('.doc-sec');
    if (!secEl || !secEl.hasAttribute('data-dv-section')) return null;
    var gi = parseInt(secEl.getAttribute('data-dv-section'), 10);
    if (isNaN(gi)) return null;
    var el = ev.target.closest('[data-dv-node], [data-dv-edge], [data-dv-step], [data-dv-panel]');
    if (el && secEl.contains(el)){
      if (el.hasAttribute('data-dv-node'))
        return {section: gi, kind: 'node', id: el.getAttribute('data-dv-node'), el: el};
      if (el.hasAttribute('data-dv-step'))
        return {section: gi, kind: 'step', index: parseInt(el.getAttribute('data-dv-step'), 10), el: el};
      if (el.hasAttribute('data-dv-panel'))
        return {section: gi, kind: 'panel', index: parseInt(el.getAttribute('data-dv-panel'), 10), el: el};
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
                     id: target.id, index: target.index};
    insertSection = target.section;
    var parsed = parseEditor();
    if (!parsed.error) updateTargetLabel(parsed.raw);
    renderInspector();
    if (focusEditor === false) return;
    var path = parsed.error ? null : builderTargetPath(parsed.raw, currentTarget);
    var loc = path ? jsonLocate(src.value, path) : null;
    if (loc) selectRange(loc);
  }

  view.addEventListener('click', function(ev){
    var target = targetFromEvent(ev);
    if (target) selectTarget(target);
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
    if (plan.kind === 'section') insertSection = plan.index;
    var identity = {section: plan.kind === 'section' ? plan.index : insertSection,
                    kind: plan.kind, id: plan.id, index: plan.index};
    var el = findTargetEl(identity);
    selectTarget({section: identity.section, kind: identity.kind, id: identity.id,
                  index: identity.index, el: el}, false);
    selectRange(plan);
  }
  var addButtons = {
    'add-node': ['node', planAddNode], 'add-edge': ['edge', planAddEdge],
    'add-step': ['step', planAddStep], 'add-panel': ['panel', planAddPanel],
    'add-section': ['section', planAddSection]
  };
  Object.keys(addButtons).forEach(function(id){
    var btn = document.getElementById(id);
    if (btn) btn.addEventListener('click', function(){
      runInsert(addButtons[id][0], addButtons[id][1]);
    });
  });

  var initial = parseEditor();
  updateTargetLabel(initial.error ? null : initial.raw);
}
