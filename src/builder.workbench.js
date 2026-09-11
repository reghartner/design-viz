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
  var taken = {};
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
  var specbox = document.querySelector('.specbox');
  var selectedEl = null;
  var insertSection = 0; /* zero-based ordinal of the section inserts target */

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
  function renderGuide(kind, pathStr, note){
    if (!guide) return;
    guide.hidden = false;
    guide.innerHTML = '';
    var g = BUILDER_GUIDES[kind];
    if (!g) return;
    var b = document.createElement('b');
    b.textContent = g.title;
    guide.appendChild(b);
    if (pathStr){
      var p = document.createElement('span');
      p.className = 'gpath'; p.textContent = pathStr;
      guide.appendChild(p);
    }
    if (note){
      var n = document.createElement('div');
      n.className = 'gerr'; n.textContent = note;
      guide.appendChild(n);
    }
    var how = document.createElement('div');
    how.textContent = g.how;
    guide.appendChild(how);
    var ul = document.createElement('ul');
    g.fields.forEach(function(f){
      var li = document.createElement('li');
      var c = document.createElement('code');
      c.textContent = f[0];
      li.appendChild(c);
      li.appendChild(document.createTextNode(' — ' + f[1]));
      ul.appendChild(li);
    });
    guide.appendChild(ul);
    if (g.tokens){
      var t = document.createElement('div');
      t.className = 'gtokens'; t.textContent = g.tokens;
      guide.appendChild(t);
    }
  }

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

  function selectTarget(target){
    setSelected(target.el);
    insertSection = target.section;
    var parsed = parseEditor();
    if (parsed.error){
      renderGuide(target.kind, null, parsed.error + ' — fix it to jump to the definition');
      updateTargetLabel(null);
      return;
    }
    updateTargetLabel(parsed.raw);
    var path = builderTargetPath(parsed.raw, target);
    var loc = path ? jsonLocate(src.value, path) : null;
    if (!loc){
      renderGuide(target.kind, path ? builderPathString(path) : null,
        'definition not found in the editor text — the render and the editor may be out of sync (click Render)');
      return;
    }
    renderGuide(target.kind, builderPathString(path), null);
    selectRange(loc);
  }

  view.addEventListener('click', function(ev){
    var target = targetFromEvent(ev);
    if (target) selectTarget(target);
  });

  /* insert buttons: splice a ready-made snippet into the editor text,
     re-render, then select the new element both on the board and in the
     editor */
  function reselectInserted(plan){
    var target = null;
    if (plan.kind === 'section'){
      var secEl = view.querySelector('.doc-sec[data-dv-section="' + plan.index + '"]');
      if (secEl) target = {section: plan.index, kind: 'section', el: secEl};
    } else {
      var secHost = view.querySelector('.doc-sec[data-dv-section="' + insertSection + '"]');
      if (secHost){
        var sel = plan.kind === 'node' ? '[data-dv-node="' + plan.id + '"]' :
                  plan.kind === 'edge' ? 'path.edge[data-dv-edge="' + plan.index + '"]' :
                  plan.kind === 'step' ? '[data-dv-step="' + plan.index + '"]' :
                  '[data-dv-panel="' + plan.index + '"]';
        var el = secHost.querySelector(sel);
        if (el) target = {section: insertSection, kind: plan.kind, id: plan.id,
                          index: plan.index, el: el};
      }
    }
    setSelected(target && target.el);
  }
  function runInsert(kind, planFn){
    var parsed = parseEditor();
    if (parsed.error){
      renderGuide(kind, null, parsed.error + ' — fix it before inserting');
      return;
    }
    if (kind !== 'section' && !specSectionPaths(parsed.raw).length){
      renderGuide(kind, null, 'no sections found in the editor text');
      return;
    }
    var plan = kind === 'section' ? planAddSection(src.value, parsed.raw)
                                  : planFn(src.value, parsed.raw, insertSection);
    if (plan.error){
      renderGuide(kind, null, plan.error);
      return;
    }
    src.value = plan.text;
    render();
    if (plan.kind === 'section') insertSection = plan.index;
    reselectInserted(plan);
    renderGuide(plan.kind, null, null);
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
