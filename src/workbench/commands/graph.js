/* Pure graph identity, reference cascades and insert templates. Uses common
   commands, raw targets, source edits and registry-owned panel rewrites. */

function planBindNodeService(text, raw, sectionIdx, nodeId, binding){
  var got = builderDiagram(text, raw, sectionIdx);
  if (got.error) return got;
  var node = got.d.nodes && got.d.nodes[nodeId];
  if (!node || typeof node !== 'object' || Array.isArray(node)) return {error: 'node not found'};
  var fields = [['binding', binding ? JSON.stringify(binding) : null]];
  /* Read the current raw title, not the inspector's earlier snapshot. Binding
     and its initial display name are one edit; API changes use field edits. */
  if (binding && (node.title == null || (typeof node.title === 'string' && !node.title.trim()))){
    var title = typeof binding.label === 'string' && binding.label.trim() ? binding.label : binding.entityRef;
    fields.push(['title', JSON.stringify(title)]);
  }
  return planSetFields(text, raw, got.path.concat(['nodes', nodeId]), fields);
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

function builderGroupsShapeError(d){
  /* the validator treats a non-object diagram.groups as "no declarations";
     every mutation planner refuses that shape outright — numeric own keys
     on strings and arrays would otherwise slip past hasOwnProperty checks
     and get object-coerced, corrupting the author's value */
  if (d.groups != null && (typeof d.groups !== 'object' || Array.isArray(d.groups)))
    return {error: 'diagram.groups is not an object — fix it in the JSON first'};
  return null;
}

function planSetNodeGroup(text, raw, sectionIdx, nodeId, keyOrNull){
  var got = builderDiagram(text, raw, sectionIdx);
  if (got.error) return got;
  var shape = builderGroupsShapeError(got.d);
  if (shape) return shape;
  if (!got.d.nodes || !Object.prototype.hasOwnProperty.call(got.d.nodes, nodeId))
    return {error: 'node "' + nodeId + '" not found'};
  if (keyOrNull != null && typeof keyOrNull !== 'string') return {error: 'group key must be text'};
  var key = keyOrNull == null ? null : keyOrNull.trim() || null;
  var plan = planSetField(text, raw, got.path.concat(['nodes', nodeId]), 'group',
                          key == null ? null : JSON.stringify(key));
  if (plan.error || key == null) return plan;
  var groups = got.d.groups;
  if (groups && Object.prototype.hasOwnProperty.call(groups, key)) return plan;
  var r = groups ? jsonSetField(plan.text, got.path.concat(['groups']), key, '{}')
                 : jsonSetField(plan.text, got.path, 'groups', '{' + JSON.stringify(key) + ': {}}');
  return r || {error: 'could not declare group'};
}

function planBulkSetGroup(text, raw, targets, keyOrNull){
  var cur = text;
  for (var i = 0; i < targets.length; i++){
    try { raw = JSON.parse(cur); }
    catch (ex){ return {error: 'bulk stopped: the JSON no longer parses (' + ex.message + ')'}; }
    var t = targets[i];
    if (t.kind !== 'node') return {error: 'groups can only contain nodes'};
    var plan = planSetNodeGroup(cur, raw, t.section, t.id, keyOrNull);
    if (plan.error) return {error: 'selection ' + (i + 1) + ': ' + plan.error};
    cur = plan.text;
  }
  return {text: cur, count: targets.length};
}

function planSetGroupTitle(text, raw, sectionIdx, key, titleOrNull){
  var got = builderDiagram(text, raw, sectionIdx);
  if (got.error) return got;
  if (typeof key !== 'string' || !key.trim()) return {error: 'a group needs a key'};
  var shape = builderGroupsShapeError(got.d);
  if (shape) return shape;
  return builderRewrite(text, raw, got.path, function(d){
    var groups = Object.assign(Object.create(null), d.groups || {});
    var meta = Object.assign(Object.create(null), groups[key] || {});
    if (titleOrNull == null || titleOrNull.trim() === '') delete meta.title;
    else meta.title = titleOrNull.trim();
    groups[key] = meta;
    d.groups = groups;
  });
}

function planSetGroupIcon(text, raw, sectionIdx, key, iconOrNull){
  var got = builderDiagram(text, raw, sectionIdx);
  if (got.error) return got;
  if (typeof key !== 'string' || !key.trim()) return {error: 'a group needs a key'};
  var shape = builderGroupsShapeError(got.d);
  if (shape) return shape;
  return builderRewrite(text, raw, got.path, function(d){
    var groups = Object.assign(Object.create(null), d.groups || {});
    var meta = Object.assign(Object.create(null), groups[key] || {});
    if (iconOrNull == null || iconOrNull.trim() === '') delete meta.icon;
    else meta.icon = iconOrNull.trim();
    groups[key] = meta;
    d.groups = groups;
  });
}

function planSetGroupParent(text, raw, sectionIdx, key, parentOrNull){
  var got = builderDiagram(text, raw, sectionIdx);
  if (got.error) return got;
  if (typeof key !== 'string' || !key.trim()) return {error: 'a group needs a key'};
  var shape = builderGroupsShapeError(got.d);
  if (shape) return shape;
  if (parentOrNull != null && typeof parentOrNull !== 'string') return {error: 'parent must be text'};
  return builderRewrite(text, raw, got.path, function(d){
    var groups = Object.assign(Object.create(null), d.groups || {});
    var meta = Object.assign(Object.create(null), groups[key] || {});
    if (parentOrNull == null || parentOrNull.trim() === '') delete meta.parent;
    else meta.parent = parentOrNull.trim();
    groups[key] = meta;
    d.groups = groups;
  });
}

function builderGroupParentOptions(groups, key){
  var parents = sanitizedGroupParents(groups);
  return Object.keys(groups || {}).filter(function(candidate){
    var cursor = candidate;
    while (cursor !== undefined){
      if (cursor === key) return false;
      cursor = parents[cursor];
    }
    return true;
  });
}

function planRenameGroup(text, raw, sectionIdx, oldKey, newKey){
  var got = builderDiagram(text, raw, sectionIdx);
  if (got.error) return got;
  var shape = builderGroupsShapeError(got.d);
  if (shape) return shape;
  if (typeof newKey !== 'string' || !newKey.trim()) return {error: 'a group needs a key'};
  newKey = newKey.trim();
  if (newKey === oldKey) return {error: 'same key'};
  var groups = got.d.groups || {}, nodes = got.d.nodes || {};
  var declared = Object.prototype.hasOwnProperty.call(groups, oldKey);
  var members = Object.keys(nodes).filter(function(id){ return nodes[id] && nodes[id].group === oldKey; });
  if (!declared && !members.length) return {error: 'group "' + oldKey + '" not found'};
  if (Object.prototype.hasOwnProperty.call(groups, newKey) || Object.keys(nodes).some(function(id){
    return nodes[id] && nodes[id].group === newKey;
  })) return {error: 'group "' + newKey + '" is already taken'};
  return builderRewrite(text, raw, got.path, function(d){
    members.forEach(function(id){ d.nodes[id].group = newKey; });
    if (declared){
      var renamed = Object.create(null);
      Object.keys(d.groups).forEach(function(k){ renamed[k === oldKey ? newKey : k] = d.groups[k]; });
      /* children nested under the old key must follow the rename, or their
         parent link dangles and the boxes silently flatten */
      Object.keys(renamed).forEach(function(k){
        if (renamed[k] && renamed[k].parent === oldKey) renamed[k].parent = newKey;
      });
      d.groups = renamed;
    }
  });
}

function planDeleteGroup(text, raw, sectionIdx, key){
  var got = builderDiagram(text, raw, sectionIdx);
  if (got.error) return got;
  var shape = builderGroupsShapeError(got.d);
  if (shape) return shape;
  return builderRewrite(text, raw, got.path, function(d){
    /* promote through the SANITIZED links: a dangling, self, or cyclic
       parent on the deleted group must not be handed down to children */
    var promoted = sanitizedGroupParents(d.groups)[key];
    if (d.groups) delete d.groups[key];
    /* children of the deleted group climb one level: they take its parent,
       or become top-level when it had none */
    Object.keys(d.groups || {}).forEach(function(k){
      if (!d.groups[k] || d.groups[k].parent !== key) return;
      if (typeof promoted === 'string') d.groups[k].parent = promoted;
      else delete d.groups[k].parent;
    });
    Object.keys(d.nodes || {}).forEach(function(id){
      if (d.nodes[id] && d.nodes[id].group === key) delete d.nodes[id].group;
    });
  });
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
    if (st.failures && typeof st.failures === 'object' && !Array.isArray(st.failures)){
      var failures = Object.create(null);
      Object.keys(st.failures).forEach(function(key){
        var next = key === oldKey ? newKey : key;
        if (next) failures[next] = st.failures[key];
      });
      if (Object.keys(failures).length) st.failures = failures; else delete st.failures;
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
  var plan=builderRewrite(text, raw, got.path, function(d){
    /* null-prototype map: a plain {} would route an id like "__proto__"
       through the prototype setter and silently drop the node */
    var nodes = Object.create(null);
    Object.keys(d.nodes).forEach(function(k){ nodes[k === oldId ? newId : k] = d.nodes[k]; });
    d.nodes = nodes;
    var panelNodes=Object.create(null);panelNodes[oldId]=newId;
    (d.panels || []).forEach(function(p){panelRemapReferences(p,'nodes',panelNodes);});
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
  return builderDetailCascade(plan,sectionIdx,function(detail,owner,target){
    if(target===sectionIdx && detail.ports)Object.keys(detail.ports).forEach(function(port){
      if(detail.ports[port]===oldId)detail.ports[port]=newId;
    });
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
    if (d.primaryPanel === oldId) d.primaryPanel = newId;
    [d].concat(Array.isArray(d.layouts)?d.layouts:[]).forEach(function(v){
      if(v && v.sectionLayout)Object.keys(v.sectionLayout).forEach(function(target){
        if(Array.isArray(v.sectionLayout[target]))v.sectionLayout[target].forEach(function(it){if(it && it.panel===oldId)it.panel=newId;if(it && it.attachTo==='panel:'+oldId)it.attachTo='panel:'+newId;});
      });
    });
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
  var plan=builderRewrite(text, raw, got.path, function(d){
    delete d.nodes[id];
    var panelNodes=Object.create(null);panelNodes[id]=null;
    (d.panels || []).forEach(function(p){panelRemapReferences(p,'nodes',panelNodes);});
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
  return builderDetailCascade(plan,sectionIdx,function(detail,owner,target){
    if(target!==sectionIdx || !detail.ports)return;
    Object.keys(detail.ports).forEach(function(port){
      if(detail.ports[port]===id){delete detail.ports[port];if(detail.mode==='expand')detail.mode='focus';}
    });
    if(!Object.keys(detail.ports).length)delete detail.ports;
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
    if (d.primaryPanel === id) delete d.primaryPanel;
    [d].concat(Array.isArray(d.layouts)?d.layouts:[]).forEach(function(v){
      if(v && v.sectionLayout)Object.keys(v.sectionLayout).forEach(function(target){
        if(Array.isArray(v.sectionLayout[target]))v.sectionLayout[target]=v.sectionLayout[target].filter(function(it){return !it || it.panel!==id;}).map(function(it){if(it && it.attachTo==='panel:'+id)delete it.attachTo;return it;});
      });
    });
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

var PANEL_TEMPLATES = panelAuthoringMap('template');

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
