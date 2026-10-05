/* Pure authored placement, layout and named-view commands. Measured boxes
   are inputs; DOM measurements and pointer lifetimes belong to controllers. */

function planEdgeCurve(text,raw,sectionIdx,index,points,cubic){
  var got=builderDiagram(text,raw,sectionIdx);if(got.error)return got;
  if(!got.d.edges || !got.d.edges[index])return {error:'Connection not found.'};
  if(!(cubic && Array.isArray(points) && points.length?validCurveControls(points):validCurvePoints(points)))return {error:'Use up to 32 curve points with finite coordinates.'};
  return planSetFields(text,raw,got.path.concat(['edges',index]),[
    ['curvePoints',!cubic && points.length?JSON.stringify(points):null],
    ['curveControls',cubic && points.length?JSON.stringify(points):null],['bend',null]
  ]);
}

function planMoveRow(text, raw, sectionIdx, fromIdx, toIdx){
  /* lift one layout row out of diagram.rows and re-insert it at toIdx
     (index AFTER removal — the drop code converts gap positions) */
  var got = builderDiagram(text, raw, sectionIdx);
  if (got.error) return got;
  var rows = got.d.rows;
  if (!Array.isArray(rows) || !rows[fromIdx]) return {error: 'row not found'};
  if (toIdx < 0 || toIdx >= rows.length) return {error: 'no row slot there'};
  if (toIdx === fromIdx) return {error: 'already there'};
  var r = builderRewrite(text, raw, got.path.concat(['rows']), function(copy){
    var item = copy.splice(fromIdx, 1)[0];
    copy.splice(toIdx, 0, item);
  });
  if (r.error) return r;
  r.index = toIdx;
  return r;
}

function planMoveGroup(text, raw, sectionIdx, groupKey, drop){
  var got = builderDiagram(text, raw, sectionIdx);
  if (got.error) return got;
  var nodes = got.d.nodes || {}, members = Object.create(null);
  Object.keys(nodes).forEach(function(id){
    if (nodes[id] && nodes[id].group === groupKey) members[id] = true;
  });
  if (!Object.keys(members).length) return {error: 'group "' + groupKey + '" not found'};
  var rows = got.d.rows;
  if (!builderFlatRowIds(rows).some(function(id){ return members[id]; }))
    return {error: 'group "' + groupKey + '" has no nodes placed in rows'};
  return builderRewrite(text, raw, got.path.concat(['rows']), function(copy){
    return builderLiftAndInsert(copy, members, drop);
  });
}

function builderLiftAndInsert(copy, members, drop, opts){
  /* Shared pre-removal lift/insert rules for groups and individual nodes.
     Floating nodes supply a run; float membership can request only a lift. */
  opts = opts || {};
  var rows = copy, before = JSON.stringify(copy);
  var inRow = drop && Object.prototype.hasOwnProperty.call(drop, 'row');
  if (!opts.liftOnly && (!drop || (inRow ? (!Number.isInteger(drop.row) || !rows[drop.row] || !Number.isInteger(drop.slot)) :
      (!Number.isInteger(drop.gap) || drop.gap < 0 || drop.gap > rows.length))))
    return {error: 'no row slot there'};
  var run = (opts.run || []).slice(), kept = [], target = null, droppedAbove = 0, removedBeforeSlot = 0;
  copy.forEach(function(row, r){
    var remaining = [];
    row.forEach(function(slot, si){
      var consumed = false;
      if (!Array.isArray(slot)){
        if (members[slot]){ run.push(slot); consumed = true; }
        else remaining.push(slot);
      } else {
        var extracted = slot.filter(function(id){ return members[id]; });
        if (!extracted.length) remaining.push(slot);
        else if (extracted.length === slot.length){ run.push(opts.plainStacks && slot.length === 1 ? slot[0] : slot); consumed = true; }
        else {
          var leftover = slot.filter(function(id){ return !members[id]; });
          remaining.push(leftover.length === 1 ? leftover[0] : leftover);
          extracted.forEach(function(id){ run.push(id); });
        }
      }
      /* drop.slot is a PRE-removal index: slots fully lifted into the
         run before it no longer occupy a position (a partial stack
         still does — its leftover stays behind) */
      if (consumed && inRow && r === drop.row && si < drop.slot) removedBeforeSlot++;
    });
    if (remaining.length){
      kept.push(remaining);
      if (inRow && r === drop.row) target = remaining;
    } else if (!opts.liftOnly && !inRow && r < drop.gap) droppedAbove++;
  });
  if (opts.liftOnly){
    /* The caller checked that at least one placed id survives. */
    if (!kept.length){
      if(opts.allowEmpty)kept.push([]);
      else return {error: 'the last node in rows cannot float'};
    }
  } else if (inRow){
    /* Keep the pre-removal row's identity, convert the slot to the
       surviving row's indexing, then clamp. A wholly lifted target row
       is a no-op. */
    if (!target) return {error: 'already there'};
    var slotIdx = Math.max(0, Math.min(drop.slot - removedBeforeSlot, target.length));
    run.forEach(function(slot, i){ target.splice(slotIdx + i, 0, slot); });
  } else kept.splice(drop.gap - droppedAbove, 0, run);
  if (JSON.stringify(kept) === before) return {error: 'already there'};
  copy.splice(0, copy.length);
  kept.forEach(function(row){ copy.push(row); });
}

function builderRemoveFloat(d, id){
  if (!Array.isArray(d.floats)) return;
  d.floats = d.floats.filter(function(f){ return !(f && f.id === id); });
  if (!d.floats.length) delete d.floats;
}

function planMoveNode(text, raw, sectionIdx, id, drop){
  var got = builderDiagram(text, raw, sectionIdx);
  if (got.error) return got;
  if (!got.d.nodes || !Object.prototype.hasOwnProperty.call(got.d.nodes, id))
    return {error: 'node "' + id + '" not found'};
  var inRows = builderFlatRowIds(got.d.rows).indexOf(id) >= 0;
  var floating = (got.d.floats || []).some(function(f){ return f && f.id === id; });
  if (!inRows && !floating) return {error: 'node "' + id + '" has no layout slot (rows or floats) to move'};
  if (!Array.isArray(got.d.rows) || !got.d.rows.length) return {error: 'no rows layout in this section'};
  var copy = builderClone(got.d.rows), members = Object.create(null);
  members[id] = true;
  var out = builderLiftAndInsert(copy, members, drop, {plainStacks: true, run: inRows ? [] : [id]});
  if (out && out.error) return out;
  var pairs = [['rows', JSON.stringify(copy)]];
  if (floating){
    var d = {floats: builderClone(got.d.floats)};
    builderRemoveFloat(d, id);
    pairs.push(['floats', d.floats ? JSON.stringify(d.floats) : null]);
  }
  return planSetFields(text, raw, got.path, pairs);
}

function planPlaceFloat(text,raw,sectionIdx,id,x,y){
  var got=builderDiagram(text,raw,sectionIdx);if(got.error)return got;
  if(!got.d.nodes || !Object.prototype.hasOwnProperty.call(got.d.nodes,id))return {error:'node not found'};
  if(!floatCoordinate(x) || !floatCoordinate(y))return {error:'X and Y must be finite coordinates between -100000 and 100000.'};
  return builderRewrite(text,raw,got.path,function(d){
    if(builderFlatRowIds(d.rows).indexOf(id)>=0){
      var members=Object.create(null);members[id]=true;
      var out=builderLiftAndInsert(d.rows,members,null,{liftOnly:true,allowEmpty:true});if(out && out.error)return out;
    }
    if(!Array.isArray(d.floats))d.floats=[];
    var f=d.floats.find(function(item){return item && item.id===id;});
    if(!f){f={id:id,side:'below'};d.floats.push(f);}
    f.x=Math.round(x*10)/10;f.y=Math.round(y*10)/10;delete f.dx;delete f.dy;
  });
}

/* Only import placement belongs to the consumer; no derived nodes are written. */
function planPlaceTopologyImport(text,raw,sectionIdx,namespace,x,y){
  var got=builderDiagram(text,raw,sectionIdx);if(got.error)return got;
  if(!floatCoordinate(x) || !floatCoordinate(y))return {error:'Block position requires finite X/Y coordinates between -100000 and 100000.'};
  var imports=got.d.topologyImports;
  if(!Array.isArray(imports))return {error:'Authored topology import not found.'};
  var indexes=[];imports.forEach(function(imp,index){if(imp && imp.as===namespace)indexes.push(index);});
  if(indexes.length!==1)return {error:'Choose one uniquely named topology import.'};
  return planSetFields(text,raw,got.path.concat(['topologyImports',indexes[0]]),[
    ['position',JSON.stringify({x:Math.round(x*10)/10,y:Math.round(y*10)/10})]
  ]);
}

/* Selection order defines the alignment anchor. Automatic floats are resolved
   together before pinning, so moving one cannot move another's starting point. */
function builderSelectedFloats(text,raw,targets){
  if(!Array.isArray(targets) || targets.length<2)return {error:'Select at least two floating nodes.'};
  var section=targets[0].section;
  if(targets.some(function(t){return t.kind!=='node' || t.section!==section;}))
    return {error:'Choose floating nodes from a single section.'};
  var got=builderDiagram(text,raw,section);if(got.error)return got;
  var ids=targets.map(function(t){return t.id;});
  if(new Set(ids).size!==ids.length)return {error:'Select each node only once.'};
  if(ids.some(function(id){return !Object.prototype.hasOwnProperty.call(got.d.nodes || {},id) ||
      !(got.d.floats || []).some(function(f){return f && f.id===id;});}))
    return {error:'Use Free placement for every selected node before aligning or moving them together.'};
  got.ids=ids;return got;
}
function planTransformFloats(text,raw,targets,change){
  var got=builderSelectedFloats(text,raw,targets);if(got.error)return got;
  if(!change || ['horizontal','vertical','move'].indexOf(change.type)<0)return {error:'Choose horizontal or vertical alignment, or a move.'};
  if(change.type==='move' && (!Number.isFinite(change.dx) || !Number.isFinite(change.dy)))return {error:'Move distances must be finite.'};
  var positions=layout(got.d).pos,anchor=positions[got.ids[0]],updated=Object.create(null);
  for(var i=0;i<got.ids.length;i++){
    var id=got.ids[i],p=positions[id];
    if(!p || !anchor)return {error:'Render the selected nodes before arranging them.'};
    var x=change.type==='vertical'?anchor.cx:p.cx+(change.type==='move'?change.dx:0);
    var y=change.type==='horizontal'?anchor.cy:p.cy+(change.type==='move'?change.dy:0);
    if(!floatCoordinate(x) || !floatCoordinate(y))return {error:'X and Y must be finite coordinates between -100000 and 100000.'};
    updated[id]={x:Math.round(x*10)/10,y:Math.round(y*10)/10};
  }
  var floats=got.d.floats.map(function(f){
    if(!updated[f.id])return f;
    var next=Object.assign({},f,updated[f.id]);delete next.dx;delete next.dy;return next;
  });
  if(JSON.stringify(floats)===JSON.stringify(got.d.floats))return {error:'The selected nodes are already there.'};
  return planSetField(text,raw,got.path,'floats',JSON.stringify(floats));
}

function planSetNodeFloat(text, raw, sectionIdx, id, sideOrNull){
  var got = builderDiagram(text, raw, sectionIdx);
  if (got.error) return got;
  if (!got.d.nodes || !Object.prototype.hasOwnProperty.call(got.d.nodes, id))
    return {error: 'node "' + id + '" not found'};
  var side = sideOrNull == null || sideOrNull === '' ? null : sideOrNull;
  if(side==='free'){
    var p=layout(got.d).pos[id] || {cx:W/2,cy:70};
    return planPlaceFloat(text,raw,sectionIdx,id,p.cx,p.cy);
  }
  if (side !== null && side !== 'above' && side !== 'below') return {error: 'float side must be above or below'};
  var ids = builderFlatRowIds(got.d.rows), inRows = ids.indexOf(id) >= 0;
  var floating = (got.d.floats || []).some(function(f){ return f && f.id === id; });
  if (!side && !floating) return {error: inRows ? 'already placed in rows' : 'node "' + id + '" has no float placement'};
  if (side && inRows && !ids.some(function(other){ return other !== id; }))
    return {error: 'the last node in rows cannot float'};
  if (!Array.isArray(got.d.rows) || !got.d.rows.length) return {error: 'no rows layout in this section'};
  return builderRewrite(text, raw, got.path, function(d){
    if (!side){
      builderRemoveFloat(d, id);
      /* a node malformed into BOTH rows and floats just loses the float
         entry — appending would duplicate its rows placement */
      if (!inRows){if(!builderFlatRowIds(d.rows).length)d.rows=[[id]];else d.rows.push([id]);}
      return;
    }
    if (inRows){
      var members = Object.create(null);
      members[id] = true;
      var out = builderLiftAndInsert(d.rows, members, null, {liftOnly: true});
      if (out && out.error) return out;
    }
    if (floating){
      d.floats.forEach(function(f){ if (f && f.id === id){f.side = side;delete f.x;delete f.y;} });
    } else {
      if (!Array.isArray(d.floats)) d.floats = [];
      d.floats.push({id: id, side: side});
    }
  });
}

function builderSlotGapXs(boxes){
  /* Every row follows authored left-to-right slot order. Boxes already
     union all cards in a stack, so insertion gaps clear its full width. */
  if (!boxes.length) return [];
  var xs = [boxes[0].x1 - 8];
  for (var i = 1; i < boxes.length; i++)
    xs.push((boxes[i - 1].x2 + boxes[i].x1) / 2);
  xs.push(boxes[boxes.length - 1].x2 + 8);
  return xs;
}

/* ---------------- reordering ---------------- */

/* swap the LAYOUT positions of two nodes: every appearance in rows
   (slots and stacks) and floats trades ids. Node definitions, edges, and
   steps keep their ids — only placement moves. */
function planSwapNodes(text, raw, sectionIdx, idA, idB){
  if (idA === idB) return {error: 'drop on a DIFFERENT node to swap places'};
  var rec = specSectionPaths(raw)[sectionIdx];
  if (!rec) return {error: 'section not found — reselect and try again'};
  var d = specValueAt(raw, rec.diagram);
  if (!d) return {error: 'no diagram in this section'};
  var found = {a: false, b: false};
  function sw(id){
    if (id === idA){ found.a = true; return idB; }
    if (id === idB){ found.b = true; return idA; }
    return id;
  }
  var rows = Array.isArray(d.rows) ? d.rows.map(function(row){
    if (!Array.isArray(row)) return row;
    return row.map(function(slot){ return Array.isArray(slot) ? slot.map(sw) : sw(slot); });
  }) : null;
  var floats = Array.isArray(d.floats) ? d.floats.map(function(f){
    if (!f || typeof f !== 'object' || typeof f.id !== 'string') return f;
    var nid = sw(f.id);
    if (nid === f.id) return f;
    var copy = {};
    Object.keys(f).forEach(function(k){ copy[k] = f[k]; });
    copy.id = nid;
    return copy;
  }) : null;
  if (!found.a || !found.b)
    return {error: 'node "' + (found.a ? idB : idA) + '" has no layout slot (rows or floats) to swap'};
  var pairs = [];
  if (rows && JSON.stringify(rows) !== JSON.stringify(d.rows)) pairs.push(['rows', JSON.stringify(rows)]);
  if (floats && JSON.stringify(floats) !== JSON.stringify(d.floats)) pairs.push(['floats', JSON.stringify(floats)]);
  if (!pairs.length) return {error: 'nothing changed'};
  var plan = planSetFields(text, raw, rec.diagram, pairs);
  if (plan.error) return plan;
  plan.kind = 'node';
  return plan;
}

function planStackNodes(text, raw, sectionIdx, nodeIds){
  /* collect the given nodes into ONE vertical stack (a nested array) in
     diagram.rows. Every selected id is lifted from wherever it sits; the
     stack lands at the outer slot the first selected id (flat-row order)
     occupied. Non-selected nodes keep their positions; empty slots and
     rows are dropped. */
  var rec = specSectionPaths(raw)[sectionIdx];
  if (!rec) return {error: 'section not found — reselect and try again'};
  var d = specValueAt(raw, rec.diagram);
  if (!d || !Array.isArray(d.rows)) return {error: 'no rows layout in this section to stack into'};
  var want = {};
  (nodeIds || []).forEach(function(id){ if (typeof id === 'string') want[id] = true; });
  var wantList = Object.keys(want);
  if (wantList.length < 2) return {error: 'select at least two nodes to stack'};
  /* flat-row order of the selected ids, and which of them actually sit in rows */
  var ordered = [], seen = {};
  d.rows.forEach(function(row){
    if (!Array.isArray(row)) return;
    row.forEach(function(slot){
      (Array.isArray(slot) ? slot : [slot]).forEach(function(s){
        if (typeof s === 'string' && want[s] && !seen[s]){ seen[s] = true; ordered.push(s); }
      });
    });
  });
  var missing = wantList.filter(function(id){ return !seen[id]; });
  if (missing.length) return {error: 'node "' + missing[0] + '" has no row slot to stack (it may be a float)'};
  var anchor = ordered[0];
  var placed = false, newRows = [];
  d.rows.forEach(function(row){
    if (!Array.isArray(row)){ newRows.push(row); return; }
    var newRow = [];
    row.forEach(function(slot){
      if (Array.isArray(slot)){
        var remaining = slot.filter(function(s){ return !(typeof s === 'string' && want[s]); });
        if (slot.indexOf(anchor) >= 0 && !placed){ newRow.push(ordered.slice()); placed = true; }
        if (remaining.length > 1) newRow.push(remaining);
        else if (remaining.length === 1) newRow.push(remaining[0]);
      } else if (typeof slot === 'string' && want[slot]){
        if (slot === anchor && !placed){ newRow.push(ordered.slice()); placed = true; }
        /* other selected string slots are simply lifted out */
      } else {
        newRow.push(slot);
      }
    });
    if (newRow.length) newRows.push(newRow);
  });
  if (!placed) return {error: 'could not place the stack'};
  if (JSON.stringify(newRows) === JSON.stringify(d.rows))
    return {error: 'those nodes are already one stack'};
  var plan = planSetFields(text, raw, rec.diagram, [['rows', JSON.stringify(newRows)]]);
  if (plan.error) return plan;
  plan.kind = 'node';
  return plan;
}

function planPrimaryPanel(text, raw, sectionIdx, panelId){
  var got = builderDiagram(text, raw, sectionIdx);
  if (got.error) return got;
  if (panelId != null && !(got.d.panels || []).some(function(p){ return p && p.id === panelId; }))
    return {error:'Choose an existing panel for the centerpiece.'};
  return builderRewrite(text, raw, got.path, function(d){
    if (panelId == null) delete d.primaryPanel; else d.primaryPanel = panelId;
  });
}

/* Authored section layouts are spec data; host preview dimensions are workspace
   state. Pointer previews never write source until one successful release. */
function planSectionLayout(text,raw,section,target,items,layoutId){
  var got=builderDiagram(text,raw,section);if(got.error)return got;
  if(['default','backstage','confluence'].indexOf(target)<0)return {error:'Unknown layout target.'};
  var index=Array.isArray(got.d.layouts)?got.d.layouts.findIndex(function(v){return v && v.id===layoutId;}):-1;
  if(Array.isArray(got.d.layouts) && index<0)return {error:'Reselect the layout before editing it.'};
  var definition=index>=0?got.d.layouts[index]:got.d, layouts=builderClone(definition.sectionLayout || {});
  if(items===null)delete layouts[target];else layouts[target]=items;
  if(index>=0 && !Object.keys(layouts).length)layouts.default=sectionLayoutPreset(got.d,'default');
  var warnings=[];sectionLayoutProfileWarnings(got.d,layouts,'diagram',warnings);
  if(warnings.length)return {error:warnings.join('\n')};
  return planSetField(text,raw,index>=0?got.path.concat(['layouts',index]):got.path,'sectionLayout',Object.keys(layouts).length?JSON.stringify(layouts):null);
}
function planSectionLayoutName(text,raw,section,name,layoutId){
  var got=builderDiagram(text,raw,section);if(got.error)return got;
  if(typeof name!=='string' || name.trim().length>40)return {error:'Use a layout name of up to 40 characters.'};
  if(Array.isArray(got.d.layouts)){
    var index=got.d.layouts.findIndex(function(v){return v && v.id===layoutId;});
    if(index<0 || !name.trim())return {error:'Select a layout and give it a nonempty name.'};
    return planSetField(text,raw,got.path.concat(['layouts',index]),'name',JSON.stringify(name.trim()));
  }
  return planSetField(text,raw,got.path,'layoutName',name.trim()?JSON.stringify(name.trim()):null);
}
function planSectionViewPresentation(text,raw,section,layoutId,value){
  var got=builderDiagram(text,raw,section);if(got.error)return got;
  if(value!=='standard' && value!=='explore')return {error:'Choose Standard or Explore for this view.'};
  if(!Array.isArray(got.d.layouts)){
    if(value==='standard')return {error:'This view already uses Standard presentation.'};
    var selected,plan=builderRewrite(text,raw,got.path,function(d){
      selected=builderPromoteSectionViews(d,layoutId);if(selected.error)return selected;
      d.layouts.find(function(v){return v.id===selected.layoutId;}).presentation=value;
    });
    if(!plan.error)plan.layoutId=selected.layoutId;return plan;
  }
  var index=Array.isArray(got.d.layouts)?got.d.layouts.findIndex(function(v){return v && v.id===layoutId;}):-1;
  if(index<0)return {error:'Select a named view before changing its presentation.'};
  var plan=planSetField(text,raw,got.path.concat(['layouts',index]),'presentation',JSON.stringify(value));
  if(!plan.error)plan.layoutId=layoutId;return plan;
}
function planSectionExploreLayout(text,raw,section,layoutId,value){
  var got=builderDiagram(text,raw,section);if(got.error)return got;
  var index=Array.isArray(got.d.layouts)?got.d.layouts.findIndex(function(v){return v && v.id===layoutId;}):-1;
  if(index<0 || got.d.layouts[index].presentation!=='explore')return {error:'Select an Explore view before arranging it.'};
  var warnings=[];
  if(value!==null)sectionExploreLayout(got.d,value,warnings,'exploreLayout');
  if(warnings.length)return {error:warnings.join('\n')};
  return planSetField(text,raw,got.path.concat(['layouts',index]),'exploreLayout',value===null?null:JSON.stringify(value));
}
function builderEnsureSectionView(d){
  var source=sectionLayoutDefinition(d),name=source?source.name:(d.primaryPanel?'Home':'Data flow');
  d.layouts=[{id:'view-1',name:name,sectionLayout:builderClone(source?source.sectionLayout:{default:sectionLayoutOptimize(d,'default',null)})}];
  d.defaultLayout='view-1';delete d.sectionLayout;delete d.layoutName;
}
/* Match the viewer's legacy Home/Layout and Data choices when a header action
   first authors them. Only geometry is new: the story and its default survive. */
function builderPromoteSectionViews(d,layoutId){
  var source=sectionLayoutDefinition(d),panels=Array.isArray(d.panels)?d.panels:[];
  var focus=panels.find(function(p){return p && typeof p.id==='string' && p.id && p.id===d.primaryPanel;}) ||
    panels.find(function(p){return p && typeof p.id==='string' && p.id && panelCapability(p.type,'focusByDefault',false);});
  var first=source?'layout':focus?'home':null,defaultId=source?'layout':focus && d.primaryPanel===focus.id?'home':'flow';
  var selected=layoutId==null || layoutId==='default'?defaultId:source && layoutId==='home'?'layout':layoutId;
  if(selected!=='flow' && selected!==first)return {error:'Reselect the view before editing it.'};
  var views=[],targets=['default'];
  if(source){
    views.push({id:'layout',name:source.name,sectionLayout:builderClone(source.sectionLayout)});
    ['backstage','confluence'].forEach(function(target){if(Array.isArray(source.sectionLayout[target]))targets.push(target);});
  }else if(focus){
    var homeDiagram=Object.assign({},d,{primaryPanel:focus.id}),preset=sectionLayoutPreset(homeDiagram,'default');
    var hidden=Object.assign({},preset.find(function(it){return sectionLayoutKey(it)==='diagram';}),{hidden:true});
    var controls=preset.find(function(it){return it.controls==='steps';}),items;
    if(controls){
      if(panelCapability(focus.type,'attachControls',false))controls.attachTo='panel:'+focus.id;
      items=sectionLayoutOptimize(homeDiagram,'default',[hidden,controls]);
    }else items=sectionLayoutPreset(homeDiagram,'default',['diagram']).concat([hidden]);
    var label=panelCapability(focus.type,'focusLabel',focus.title || 'Home');
    views.push({id:'home',name:String(label).trim().slice(0,40) || 'Home',sectionLayout:{default:items}});
  }
  var flowDiagram=Object.assign({},d,{primaryPanel:undefined}),profiles={};
  targets.forEach(function(target){profiles[target]=sectionLayoutOptimize(flowDiagram,target,null);});
  views.push({id:'flow',name:'Data flow',sectionLayout:profiles});
  d.layouts=views;d.defaultLayout=defaultId;delete d.sectionLayout;delete d.layoutName;
  return {layoutId:selected};
}
function planEnsureSectionView(text,raw,section,optimizeTarget){
  var got=builderDiagram(text,raw,section);if(got.error)return got;
  if(Array.isArray(got.d.layouts))return {error:'This diagram already has Chapters.'};
  return builderRewrite(text,raw,got.path,function(d){
    builderEnsureSectionView(d);
    if(optimizeTarget)d.layouts[0].sectionLayout[optimizeTarget]=sectionLayoutOptimize(got.d,optimizeTarget,sectionLayoutItems(got.d,optimizeTarget));
  });
}
function planSectionViewSteps(text,raw,section,layoutId,indices){
  var got=builderDiagram(text,raw,section);if(got.error)return got;
  var index=(got.d.layouts || []).findIndex(function(v){return v.id===layoutId;});
  if(index<0)return {error:'Select a named view before choosing its steps.'};
  if(indices!==null && (!Array.isArray(indices) || !indices.length || indices.some(function(i,n){return !Number.isInteger(i) || !got.d.steps[i] || indices.indexOf(i)!==n;})))return {error:'Choose at least one step for this view.'};
  var view=got.d.layouts[index];
  if(indices && !diagramPathList(got.d).some(function(p){return (!Array.isArray(view.paths) || view.paths.indexOf(p.id)>=0) && p.indices.some(function(i){return indices.indexOf(i)>=0;});}))return {error:'Choose at least one step that belongs to a path shown in this view.'};
  return builderRewrite(text,raw,got.path,function(d){
    if(indices===null){delete d.layouts[index].steps;return;}
    var taken=new Set((d.steps || []).map(function(st){return st.id;}));
    (d.steps || []).forEach(function(st,i){
      if(st.id)return;var n=i+1,id='step-'+n;while(taken.has(id))id='step-'+(++n);
      st.id=id;taken.add(id);
    });
    d.layouts[index].steps=indices.map(function(i){return d.steps[i].id;});
    if(d.layouts[index].steps.some(function(id){return d.steps.filter(function(st){return st.id===id;}).length!==1;}))return {error:'Selected steps need unique IDs. Fix duplicate step IDs first.'};
  });
}
function planSectionViewPaths(text,raw,section,layoutId,pathIds){
  var got=builderDiagram(text,raw,section);if(got.error)return got;
  var index=(got.d.layouts || []).findIndex(function(v){return v.id===layoutId;});
  if(index<0)return {error:'Select a named view before choosing its paths.'};
  var available=Array.isArray(got.d.paths)?diagramPathList(got.d).map(function(p){return p.id;}):[];
  if(pathIds!==null && (!Array.isArray(pathIds) || !pathIds.length || pathIds.some(function(id,n){return typeof id!=='string' || available.indexOf(id)<0 || pathIds.indexOf(id)!==n;})))return {error:'Choose at least one existing path for this view.'};
  var view=got.d.layouts[index];
  if(pathIds && Array.isArray(view.steps) && !sectionViewStepsReachable(got.d,view.steps,pathIds))return {error:'Choose a path containing at least one step shown in this view.'};
  return builderRewrite(text,raw,got.path,function(d){
    if(pathIds===null)delete d.layouts[index].paths;else d.layouts[index].paths=pathIds.slice();
  });
}
function planDuplicateSectionLayout(text,raw,section,layoutId){
  var got=builderDiagram(text,raw,section);if(got.error)return got;
  var warnings=[];sectionLayoutWarnings(got.d,'diagram',warnings);if(warnings.length)return {error:warnings.join('\n')};
  var d=builderClone(got.d), source=sectionLayoutDefinition(d,layoutId);
  if(!Array.isArray(d.layouts)){
    if(layoutId!=null && layoutId!=='default'){
      var selected=builderPromoteSectionViews(d,layoutId);if(selected.error)return selected;
      source=sectionLayoutDefinition(d,selected.layoutId);
    }else{
      d.layouts=[{id:'layout-1',name:source?source.name:'Layout',sectionLayout:builderClone(source?source.sectionLayout:{default:sectionLayoutPreset(d,'default')})}];
      d.defaultLayout='layout-1';delete d.sectionLayout;delete d.layoutName;source=d.layouts[0];
    }
  }
  if(!source)return {error:'Select a layout to duplicate.'};
  var n=1;while(d.layouts.some(function(v){return v.id==='layout-'+n;}))n++;
  var id='layout-'+n, name=source.name.slice(0,33)+' copy';
  var suffix=2;while(d.layouts.some(function(v){return v.name===name;}))name=source.name.slice(0,28)+' copy '+suffix++;
  var profiles=builderClone(source.sectionLayout);
  Object.keys(profiles).forEach(function(target){
    profiles[target]=sectionLayoutItems(Object.assign({},d,{layouts:undefined,defaultLayout:undefined,sectionLayout:profiles}),target);
  });
  var copy={id:id,name:name,sectionLayout:profiles};if(source.paths)copy.paths=builderClone(source.paths);if(source.steps)copy.steps=builderClone(source.steps);
  var original=d.layouts.find(function(v){return v.id===source.id;});
  if(original && original.presentation!==undefined)copy.presentation=original.presentation;
  if(original && original.exploreLayout!==undefined)copy.exploreLayout=builderClone(original.exploreLayout);
  d.layouts.push(copy);
  var plan=planReplaceValue(text,raw,got.path,JSON.stringify(d));plan.layoutId=id;return plan;
}
function planDeleteSectionLayout(text,raw,section,layoutId){
  var got=builderDiagram(text,raw,section);if(got.error)return got;
  if(!Array.isArray(got.d.layouts) || !got.d.layouts.some(function(v){return v && v.id===layoutId;}))return {error:'Select a named layout to delete.'};
  return builderRewrite(text,raw,got.path,function(d){
    d.layouts=d.layouts.filter(function(v){return v.id!==layoutId;});
    if(!d.layouts.length){delete d.layouts;delete d.defaultLayout;}
    else if(d.defaultLayout===layoutId)d.defaultLayout=d.layouts[0].id;
  });
}
function planDefaultSectionLayout(text,raw,section,layoutId){
  var got=builderDiagram(text,raw,section);if(got.error)return got;
  if(!Array.isArray(got.d.layouts) && layoutId!=null && layoutId!=='default'){
    var selected,plan=builderRewrite(text,raw,got.path,function(d){
      selected=builderPromoteSectionViews(d,layoutId);if(selected.error)return selected;
      d.defaultLayout=selected.layoutId;
    });
    if(!plan.error)plan.layoutId=selected.layoutId;return plan;
  }
  if(!Array.isArray(got.d.layouts) || !got.d.layouts.some(function(v){return v && v.id===layoutId;}))return {error:'Select a named layout first.'};
  return planSetField(text,raw,got.path,'defaultLayout',JSON.stringify(layoutId));
}
function sectionLayoutSwap(items,from,to){
  var next=items.map(function(it){return Object.assign({},it);});
  var a=next.find(function(it){return sectionLayoutKey(it)===from;}),b=next.find(function(it){return sectionLayoutKey(it)===to;});
  if(!a || !b || a.controls || b.controls)return next;
  ['x','y','w','h','hidden'].forEach(function(k){var value=a[k];if(b[k]===undefined)delete a[k];else a[k]=b[k];if(value===undefined)delete b[k];else b[k]=value;});
  return sectionLayoutPack(next);
}
function sectionLayoutOptimize(d,target,items){
  var hidden=(items || []).filter(function(it){return it.hidden===true && it.controls==null;});
  var previous=(items || []).find(function(it){return it.controls==='steps';});
  var attachment=previous?previous.attachTo:items?'diagram':d.primaryPanel && (d.panels || []).some(function(p){return p.id===d.primaryPanel && panelCapability(p.type,'attachControls',false);})?'panel:'+d.primaryPanel:'diagram';
  var excluded=hidden.map(sectionLayoutKey),dock=attachment && excluded.indexOf(attachment)<0 && sectionLayoutTiles(d).some(function(t){return t.key==='steps';});
  if(dock)excluded.push('steps');
  var presetDiagram=attachment?Object.assign({},d,{primaryPanel:attachment==='diagram'?undefined:attachment.slice(6)}):d;
  var next=sectionLayoutPreset(presetDiagram,target,excluded);
  if(dock){
    var host=next.find(function(it){return sectionLayoutKey(it)===attachment;});
    if(host){
      var height=sectionLayoutControlsRows(d,items);
      next.push({controls:'steps',attachTo:attachment,x:host.x,y:host.y+host.h,w:host.w,h:height});
      host.h=Math.min(40,host.h+height);
    }
  }else{
    var stepTile=next.find(function(it){return it.controls==='steps';});
    if(stepTile){if(attachment)stepTile.attachTo=attachment;if(previous)stepTile.h=previous.h;}
  }
  return sectionLayoutPack(next.concat(hidden.map(function(it){return Object.assign({},it);})));
}
function sectionLayoutGesture(items,key,dx,dy,resize){
  var next=items.map(function(it){return Object.assign({},it);}),item=next.find(function(it){return sectionLayoutKey(it)===key;});
  if(!item)return next;
  if(resize){item.w=Math.max(1,Math.min(12-item.x,item.w+Math.round(dx)));item.h=Math.max(3,Math.min(40,item.h+Math.round(dy)));}
  else{item.x=Math.max(0,Math.min(12-item.w,item.x+Math.round(dx)));item.y=Math.max(0,Math.min(500,item.y+Math.round(dy)));}
  return sectionLayoutPack(next,key);
}
function sectionLayoutAttach(d,items,key){
  var next=sectionLayoutDetachSteps(d,items).map(function(it){return Object.assign({},it);});
  var step=next.find(function(it){return it.controls==='steps';});if(!step)return next;
  var prior=sectionLayoutDock(next);
  if(key){
    step.attachTo=key;
    var host=next.find(function(it){return sectionLayoutKey(it)===key;});
    if(host && key!==prior){host.h=Math.min(40,host.h+step.h);step.x=host.x;step.y=host.y+host.h;step.w=host.w;}
  }else delete step.attachTo;
  return sectionLayoutPack(next);
}
/* Grow the combined tile by the same amount, leaving the visualization's
   allotted height intact. Legacy combined tiles gain an explicit transport. */
function sectionLayoutResizeControls(d,items,height){
  var next=items.map(function(it){return Object.assign({},it);});
  var step=next.find(function(it){return it.controls==='steps';});
  if(!step){
    var diagram=next.find(function(it){return sectionLayoutKey(it)==='diagram';});
    if(!diagram)return next;
    step={controls:'steps',attachTo:'diagram',x:diagram.x,y:diagram.y+diagram.h,w:diagram.w,h:sectionLayoutControlsRows(d,items)};next.push(step);
  }
  var dock=sectionLayoutDock(next),host=dock && next.find(function(it){return sectionLayoutKey(it)===dock;});
  var maximum=host?Math.min(40,step.h+40-host.h):40;
  var value=Math.max(3,Math.min(maximum,Math.round(height)));
  if(!Number.isFinite(value))return items;
  if(host)host.h=Math.max(3,host.h+value-step.h);
  step.h=value;
  return sectionLayoutPack(next,dock || 'steps');
}
/* Separating a legacy combined tile is an explicit, undoable authoring edit. */
function sectionLayoutDetachSteps(d,items){
  if(!sectionLayoutTiles(d).some(function(t){return t.key==='steps';}) || items.some(function(it){return sectionLayoutKey(it)==='steps';}))return items;
  var next=items.map(function(it){return Object.assign({},it);}),diagram=next.find(function(it){return sectionLayoutKey(it)==='diagram';});
  if(!diagram)return items;
  var height=Math.min((d.paths || []).length>1?6:4,Math.max(3,diagram.h-3));
  diagram.h=Math.max(3,diagram.h-height);
  next.push({controls:'steps',x:diagram.x,y:diagram.y+diagram.h,w:diagram.w,h:height});
  return sectionLayoutPack(next,'steps');
}

function planAutoArrange(text,raw,section,result){
  var got=builderDiagram(text,raw,section);if(got.error)return got;
  try{
    var ids=autoArrangeInput(got.d);
    if(!result || !Array.isArray(result.positions) || result.positions.length!==ids.length ||
      !Array.isArray(result.edges) || result.edges.length!==(got.d.edges || []).length ||
      new Set(result.positions.map(function(p){return p.id;})).size!==ids.length ||
      result.positions.some(function(p){return ids.indexOf(p.id)<0 || !floatCoordinate(p.x) || !floatCoordinate(p.y);}) ||
      result.edges.some(function(e){return !e || !validCurveControls(e.curveControls) || !validEdgePort(e.fromPort) || !validEdgePort(e.toPort) ||
        ['labelDx','labelDy'].some(function(k){return e[k]!=null && !floatCoordinate(e[k]);});}))
      return {error:'The layout returned invalid geometry. The source is unchanged.'};
    // Only a fixed geometry allowlist crosses the worker/transaction boundary.
    var clean={positions:result.positions,edges:result.edges.map(function(e){var out={};
      ['curveControls','fromPort','toPort','labelDx','labelDy'].forEach(function(k){if(e[k]!=null)out[k]=e[k];});return out;})};
    return planReplaceValue(text,raw,got.path,JSON.stringify(autoArrangeDiagram(got.d,clean),null,2));
  }catch(error){return {error:error.message};}
}

/* Spatial object actions operate on one authored diagram. Measurements are
   effective graph-space rectangles supplied by the interaction owner. */
function builderSpatialTargets(text,raw,targets){
  if(!targets || !targets.length)return {error:'Select nodes or canvas panels.'};
  var section=targets[0].section,got=builderDiagram(text,raw,section);if(got.error)return got;
  if(targets.some(function(t){return t.section!==section || ['node','panel'].indexOf(t.kind)<0;}))return {error:'Choose nodes and canvas panels from one section.'};
  for(var i=0;i<targets.length;i++){
    var t=targets[i],value=t.kind==='node'?(got.d.nodes || {})[t.id]:(got.d.panels || []).find(function(p){return p.id===t.id;});
    if(!value)return {error:'An object changed. Render and select it again.'};
  }
  return got;
}
function planAlignSpatial(text,raw,targets,layoutId,direction,rects){
  var got=builderSpatialTargets(text,raw,targets);if(got.error)return got;
  if(targets.length<2)return {error:'Select at least two objects to align.'};
  if(['horizontal','vertical'].indexOf(direction)<0)return {error:'Choose an alignment direction.'};
  if(targets.some(function(t){return t.kind==='node' && !(got.d.floats || []).some(function(f){return f.id===t.id;});}))return {error:'Use Free placement for every selected node before aligning.'};
  var view=(got.d.layouts || []).find(function(v){return v.id===layoutId;});
  if(targets.some(function(t){return t.kind==='panel';}) && (!view || view.presentation!=='explore'))return {error:'Select an Explore view before aligning panels.'};
  if(!rects || rects.length!==targets.length || rects.some(function(r){return !r || ![r.x,r.y,r.w,r.h].every(Number.isFinite) || r.w<=0 || r.h<=0;}))return {error:'Render all selected objects before aligning.'};
  return builderRewrite(text,raw,got.path,function(d){
    var anchor=rects[0],cx=anchor.x+anchor.w/2,cy=anchor.y+anchor.h/2;
    var definition=(d.layouts || []).find(function(v){return v.id===layoutId;});
    for(var i=0;i<targets.length;i++){
      var t=targets[i],r=rects[i],x=direction==='vertical'?cx:r.x+r.w/2,y=direction==='horizontal'?cy:r.y+r.h/2;
      if(!floatCoordinate(x) || !floatCoordinate(y))return {error:'Alignment is outside the supported canvas coordinates.'};
      if(t.kind==='node'){
        var f=d.floats.find(function(f){return f.id===t.id;});f.x=x;f.y=y;delete f.dx;delete f.dy;
      }else{
        var explore=definition.exploreLayout || (definition.exploreLayout={}),canvas=explore.canvas || (explore.canvas={}),panels=canvas.panels || (canvas.panels=[]);
        var p=panels.find(function(p){return p.panel===t.id;});if(!p){p={panel:t.id};panels.push(p);}
        Object.assign(p,{x:x-r.w/2,y:y-r.h/2,w:r.w,h:r.h});
      }
    }
  });
}
/* Shared placement validation for measured selection actions. */
function builderMovableSpatial(text,raw,targets,layoutId,rects){
  var got=builderSpatialTargets(text,raw,targets);if(got.error)return got;
  if(targets.some(function(t){return t.kind==='node' && !(got.d.floats || []).some(function(f){return f.id===t.id;});}))return {error:'Row nodes follow the row layout. Use Free placement for every selected node to move or distribute them.'};
  var definition=(got.d.layouts || []).find(function(v){return v.id===layoutId;});
  if(targets.some(function(t){return t.kind==='panel';}) && (!definition || definition.presentation!=='explore'))return {error:'Select an Explore view before moving panels.'};
  if(!rects || rects.length!==targets.length || rects.some(function(r){return !r || ![r.x,r.y,r.w,r.h].every(Number.isFinite) || r.w<=0 || r.h<=0;}))return {error:'Render all selected objects before moving them.'};
  return got;
}
function builderSpatialDeltas(text,raw,targets,layoutId,rects,deltas){
  var got=builderMovableSpatial(text,raw,targets,layoutId,rects);if(got.error)return got;
  if(deltas.every(function(delta){return Math.abs(delta.x)<.00001 && Math.abs(delta.y)<.00001;}))return {error:'The selected objects are already in position.'};
  return builderRewrite(text,raw,got.path,function(d){
    var definition=(d.layouts || []).find(function(v){return v.id===layoutId;});
    for(var i=0;i<targets.length;i++){
      var t=targets[i],r=rects[i],delta=deltas[i],x=r.x+delta.x,y=r.y+delta.y;
      if(!floatCoordinate(x) || !floatCoordinate(y) || !floatCoordinate(x+r.w/2) || !floatCoordinate(y+r.h/2))return {error:'Movement is outside the supported canvas coordinates.'};
      if(Math.abs(delta.x)<.00001 && Math.abs(delta.y)<.00001)continue;
      if(t.kind==='node'){
        var f=d.floats.find(function(f){return f.id===t.id;});
        if(delta.x){f.x=x+r.w/2;delete f.dx;}
        if(delta.y){f.y=y+r.h/2;delete f.dy;}
      }else{
        var explore=definition.exploreLayout || (definition.exploreLayout={}),canvas=explore.canvas || (explore.canvas={}),panels=canvas.panels || (canvas.panels=[]);
        var p=panels.find(function(p){return p.panel===t.id;});if(!p){p=Object.assign({panel:t.id},r);panels.push(p);}
        if(delta.x)p.x=x;if(delta.y)p.y=y;
      }
    }
  });
}
function planNudgeSpatial(text,raw,targets,layoutId,rects,dx,dy){
  if(!Number.isFinite(dx) || !Number.isFinite(dy))return {error:'Choose a finite movement.'};
  return builderSpatialDeltas(text,raw,targets,layoutId,rects,targets.map(function(){return {x:dx,y:dy};}));
}
function planDistributeSpatial(text,raw,targets,layoutId,direction,rects){
  var got=builderMovableSpatial(text,raw,targets,layoutId,rects);if(got.error)return got;
  if(targets.length<3)return {error:'Select at least three objects to distribute.'};
  if(['horizontal','vertical'].indexOf(direction)<0)return {error:'Choose a distribution direction.'};
  var axis=direction==='horizontal'?'x':'y',size=direction==='horizontal'?'w':'h';
  var order=rects.map(function(r,i){return {r:r,i:i};}).sort(function(a,b){return a.r[axis]-b.r[axis] || a.i-b.i;});
  var first=order[0].r,last=order[order.length-1].r,end=Math.max.apply(null,rects.map(function(r){return r[axis]+r[size];}));
  var gap=(end-first[axis]-rects.reduce(function(sum,r){return sum+r[size];},0))/(targets.length-1);
  if(gap<=.00001 || Math.abs(last[axis]+last[size]-end)>.00001)return {error:'The selected bounds overlap or have insufficient room for positive gaps.'};
  var cursor=first[axis],deltas=targets.map(function(){return {x:0,y:0};});
  order.forEach(function(item,index){if(index>0 && index<order.length-1)deltas[item.i][axis]=cursor-item.r[axis];cursor+=item.r[size]+gap;});
  return builderSpatialDeltas(text,raw,targets,layoutId,rects,deltas);
}
function planDuplicateSpatial(text,raw,targets,layoutId,rects){
  var got=builderSpatialTargets(text,raw,targets);if(got.error)return got;
  return builderRewrite(text,raw,got.path,function(d){
    var nodeMap=Object.create(null),panelMap=Object.create(null),used=Object.assign(Object.create(null),d.nodes),usedPanels=Object.create(null);
    (d.panels || []).forEach(function(p){usedPanels[p.id]=true;});
    targets.forEach(function(t,i){
      if(t.kind==='node'){
        var id=builderUniqueKey(used,t.id);used[id]=true;nodeMap[t.id]=id;d.nodes[id]=builderClone(d.nodes[t.id]);
        var f=(d.floats || []).find(function(f){return f.id===t.id;});
        if(f){var copy=builderClone(f);copy.id=id;if(rects && rects[i]){copy.x=rects[i].x+rects[i].w/2+24;copy.y=rects[i].y+rects[i].h/2+24;delete copy.dx;delete copy.dy;}d.floats.push(copy);}
        else (d.rows || []).forEach(function(row){for(var j=0;j<row.length;j++){if(row[j]===t.id){row.splice(j+1,0,id);j++;}else if(Array.isArray(row[j])){var k=row[j].indexOf(t.id);if(k>=0)row[j].splice(k+1,0,id);}}});
      }else{
        var original=d.panels.find(function(p){return p.id===t.id;}),copy=builderClone(original),id=builderUniqueKey(usedPanels,t.id);usedPanels[id]=true;panelMap[t.id]=id;copy.id=id;d.panels.push(copy);
      }
    });
    (d.edges || []).slice().forEach(function(e){if(nodeMap[e.from] && nodeMap[e.to]){var copy=builderClone(e);copy.from=nodeMap[e.from];copy.to=nodeMap[e.to];d.edges.push(copy);}});
    Object.keys(panelMap).forEach(function(id){var p=d.panels.find(function(p){return p.id===panelMap[id];});panelRemapReferences(p,'nodes',nodeMap);});
    [d].concat(d.layouts || []).forEach(function(v){
      var layouts=v.sectionLayout;if(layouts)Object.keys(layouts).forEach(function(key){if(!Array.isArray(layouts[key]))return;layouts[key].slice().forEach(function(tile){if(panelMap[tile.panel]){var c=builderClone(tile);c.panel=panelMap[tile.panel];layouts[key].push(c);}});});
      var explore=v.exploreLayout;if(explore){[explore,explore.canvas].forEach(function(place){if(place && place.panels)place.panels.slice().forEach(function(p){if(panelMap[p.panel]){var c=builderClone(p);c.panel=panelMap[p.panel];if(place===explore.canvas){c.x+=24;c.y+=24;}place.panels.push(c);}});});
        if(explore.panelPlacements)explore.panelPlacements.slice().forEach(function(p){if(panelMap[p.panel])explore.panelPlacements.push(Object.assign({},p,{panel:panelMap[p.panel]}));});
      }
    });
    var active=(d.layouts || []).find(function(v){return v.id===layoutId;});
    if(active)targets.forEach(function(t,i){if(t.kind!=='panel' || !rects || !rects[i])return;var ex=active.exploreLayout || (active.exploreLayout={}),canvas=ex.canvas || (ex.canvas={}),panels=canvas.panels || (canvas.panels=[]),id=panelMap[t.id],p=panels.find(function(p){return p.panel===id;});if(!p){p={panel:id};panels.push(p);}Object.assign(p,rects[i],{x:rects[i].x+24,y:rects[i].y+24});var placements=ex.panelPlacements || (ex.panelPlacements=[]);var placement=placements.find(function(p){return p.panel===id;});if(!placement){placement={panel:id};placements.push(placement);}placement.placement='canvas';});
  });
}
