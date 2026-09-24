/* Pure authored placement, layout and named-view commands. Measured boxes
   are inputs; DOM measurements and pointer lifetimes belong to controllers. */

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
function planEnsureSectionView(text,raw,section,optimizeTarget){
  var got=builderDiagram(text,raw,section);if(got.error)return got;
  if(Array.isArray(got.d.layouts))return {error:'This diagram already has named views.'};
  return builderRewrite(text,raw,got.path,function(d){
    var source=sectionLayoutDefinition(d),name=source?source.name:(d.primaryPanel?'Home':'Data flow');
    d.layouts=[{id:'view-1',name:name,sectionLayout:builderClone(source?source.sectionLayout:{default:sectionLayoutOptimize(d,'default',null)})}];
    if(optimizeTarget)d.layouts[0].sectionLayout[optimizeTarget]=sectionLayoutOptimize(got.d,optimizeTarget,sectionLayoutItems(got.d,optimizeTarget));
    d.defaultLayout='view-1';delete d.sectionLayout;delete d.layoutName;
  });
}
function planSectionViewSteps(text,raw,section,layoutId,indices){
  var got=builderDiagram(text,raw,section);if(got.error)return got;
  var index=(got.d.layouts || []).findIndex(function(v){return v.id===layoutId;});
  if(index<0)return {error:'Select a named view before choosing its steps.'};
  if(indices!==null && (!Array.isArray(indices) || !indices.length || indices.some(function(i,n){return !Number.isInteger(i) || !got.d.steps[i] || indices.indexOf(i)!==n;})))return {error:'Choose at least one step for this view.'};
  if(indices && !diagramPathList(got.d).some(function(p){return p.indices.some(function(i){return indices.indexOf(i)>=0;});}))return {error:'Choose at least one step that belongs to a story path.'};
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
function planDuplicateSectionLayout(text,raw,section,layoutId){
  var got=builderDiagram(text,raw,section);if(got.error)return got;
  var warnings=[];sectionLayoutWarnings(got.d,'diagram',warnings);if(warnings.length)return {error:warnings.join('\n')};
  var d=builderClone(got.d), source=sectionLayoutDefinition(d,layoutId);
  if(!Array.isArray(d.layouts)){
    d.layouts=[{id:'layout-1',name:source?source.name:'Layout',sectionLayout:builderClone(source?source.sectionLayout:{default:sectionLayoutPreset(d,'default')})}];
    d.defaultLayout='layout-1';delete d.sectionLayout;delete d.layoutName;source=d.layouts[0];
  }
  if(!source)return {error:'Select a layout to duplicate.'};
  var n=1;while(d.layouts.some(function(v){return v.id==='layout-'+n;}))n++;
  var id='layout-'+n, name=source.name.slice(0,33)+' copy';
  var suffix=2;while(d.layouts.some(function(v){return v.name===name;}))name=source.name.slice(0,28)+' copy '+suffix++;
  var profiles=builderClone(source.sectionLayout);
  Object.keys(profiles).forEach(function(target){
    profiles[target]=sectionLayoutItems(Object.assign({},d,{layouts:undefined,defaultLayout:undefined,sectionLayout:profiles}),target);
  });
  var copy={id:id,name:name,sectionLayout:profiles};if(source.steps)copy.steps=builderClone(source.steps);
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
