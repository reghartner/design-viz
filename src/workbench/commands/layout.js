/* Pure authored placement, layout and named-view commands. Measured boxes
   are inputs; DOM measurements and pointer lifetimes belong to controllers. */

function builderLockedNodeIds(d,ids){
  var nodes=d && d.nodes || {},wanted=ids && new Set(ids);
  return Object.keys(nodes).filter(function(id){return (!wanted || wanted.has(id)) && nodes[id] && nodes[id].locked===true;});
}
function builderNodePositionLocked(d,id){return !!(d && d.nodes && d.nodes[id] && d.nodes[id].locked===true);}
/* A lock keeps a row node in its slot, so locking moves no neighbour. A plan
   that would move a locked node lifts it here into an absolute noSpread float
   at its current position (placement plans directly, every other accepted plan
   through builderPinMovedLocks); old locks already are floats. */
function builderFreezeLockedPositions(d,positions,onlyIds){
  var locked=builderLockedNodeIds(d,onlyIds),wanted=new Set(locked);if(!locked.length)return false;
  var before=JSON.stringify([d.rows,d.floats]);
  d.rows=(Array.isArray(d.rows)?d.rows:[[]]).map(function(row){
    if(!Array.isArray(row))return row;
    var next=[];row.forEach(function(slot){
      if(Array.isArray(slot)){
        var kept=slot.filter(function(id){return !wanted.has(id);});
        if(kept.length===1)next.push(kept[0]);else if(kept.length>1)next.push(kept);
      }else if(!wanted.has(slot))next.push(slot);
    });return next;
  });
  var found=new Set(),floats=Array.isArray(d.floats)?d.floats:[];
  d.floats=floats.map(function(f){
    if(!f || !wanted.has(f.id))return f;
    var p=positions[f.id];if(!p)return f;
    var next=Object.assign({},f,{side:'below',x:p.cx,y:p.cy,noSpread:true});
    delete next.dx;delete next.dy;found.add(f.id);return next;
  });
  locked.forEach(function(id){var p=positions[id];if(p && !found.has(id))d.floats.push({id:id,side:'below',x:p.cx,y:p.cy,noSpread:true});});
  return JSON.stringify([d.rows,d.floats])!==before;
}
/* Session lock guard (#617). Any accepted plan may re-space a row, the group
   band, lane gaps or spread floats. Every node locked before AND after the plan
   whose center moved returns to its pre-plan center as a noSpread float; only
   those nodes' placement entries change. Sections pair by index and heading.
   Returns null when nothing moved; edits lists each rewrite's start and length
   change so callers can keep a plan's source range. */
function builderPinMovedLocks(beforeText,afterText){
  if(typeof beforeText!=='string' || typeof afterText!=='string' || beforeText.indexOf('"locked"')<0)return null;
  var beforeRaw,afterRaw;try{beforeRaw=JSON.parse(beforeText);afterRaw=JSON.parse(afterText);}catch(ex){return null;}
  function layoutable(d){return !!d && typeof d==='object' && d.nodes && typeof d.nodes==='object' && Array.isArray(d.rows) && d.rows.length>0 && d.rows.every(Array.isArray);}
  var afterRecs=specSectionPaths(afterRaw),text=afterText,edits=[];
  specSectionPaths(beforeRaw).forEach(function(rec,i){
    var next=afterRecs[i];if(!next)return;
    var bs=specValueAt(beforeRaw,rec.section),as=specValueAt(afterRaw,next.section);
    if((bs && bs.heading)!==(as && as.heading))return;
    var bd=specValueAt(beforeRaw,rec.diagram),ad=specValueAt(afterRaw,next.diagram);
    if(!layoutable(bd) || !layoutable(ad))return;
    var ids=builderLockedNodeIds(bd).filter(function(id){return builderNodePositionLocked(ad,id);});if(!ids.length)return;
    var copy=builderClone(ad),changed=false;
    try{
      var before=layout(bd).pos;
      /* Lifting one pin can shift another locked row node; each round pins at
         least one more, so this ends within ids.length rounds. */
      for(var round=0;round<ids.length;round++){
        var now=layout(copy).pos,moved=ids.filter(function(id){return before[id] && now[id] && (now[id].cx!==before[id].cx || now[id].cy!==before[id].cy);});
        if(!moved.length)break;
        builderFreezeLockedPositions(copy,before,moved);changed=true;
      }
    }catch(ex){return;}
    if(!changed)return;
    ['rows','floats'].forEach(function(key){
      if(JSON.stringify(copy[key])===JSON.stringify(ad[key]))return;
      var r=planSetFields(text,JSON.parse(text),next.diagram,[[key,JSON.stringify(copy[key])]]);if(r.error)return;
      var at=0;while(at<text.length && text.charCodeAt(at)===r.text.charCodeAt(at))at++;
      edits.push({at:at,delta:r.text.length-text.length});text=r.text;
    });
  });
  return text===afterText?null:{text:text,edits:edits};
}
/* File import re-pins locks only within the same document (#628): the same
   diagram ID (documentReference: page.canon.id, else page.documentLinks.id)
   or, when neither side has an ID, the same non-empty trimmed title. Node ids
   alone say nothing, since another document may reuse them. */
function builderSameDocument(beforeText,afterText){
  var a,b;try{a=JSON.parse(beforeText).page;b=JSON.parse(afterText).page;}catch(ex){return false;}
  if(!a || !b || typeof a!=='object' || typeof b!=='object')return false;
  var ida=documentReference(a).spec,idb=documentReference(b).spec;
  if(ida || idb)return ida===idb;
  var title=function(page){return typeof page.title==='string'?page.title.trim():'';};
  return !!title(a) && title(a)===title(b);
}
function builderPlacementPlan(text,raw,path,before,after){
  var pairs=[];
  if(JSON.stringify(after.rows)!==JSON.stringify(before.rows))pairs.push(['rows',after.rows==null?null:JSON.stringify(after.rows)]);
  if(JSON.stringify(after.floats)!==JSON.stringify(before.floats))pairs.push(['floats',after.floats==null?null:JSON.stringify(after.floats)]);
  return pairs.length?planSetFields(text,raw,path,pairs):{noop:true};
}

function planEdgeCurve(text,raw,sectionIdx,index,points,cubic,context,key){
  if(!(cubic && Array.isArray(points) && points.length?validCurveControls(points):validCurvePoints(points)))return {error:'Use up to 32 curve points with finite coordinates.'};
  return planEdgeLayout(text,raw,sectionIdx,index,key,{
    curvePoints:!cubic && points.length?points:null,
    curveControls:cubic && points.length?points:null,bend:null
  },context);
}

var BUILDER_EDGE_ROUTING_FIELDS=['fromPort','toPort','curvePoints','curveControls','bend','fromDx','fromDy','toDx','toDy'];
function builderEdgeHasCustomRouting(edge){
  return !!edge && BUILDER_EDGE_ROUTING_FIELDS.some(function(key){return Object.prototype.hasOwnProperty.call(edge,key);});
}
function builderImportedEdgeKeys(diagram){
  var imported=new Set();
  ((((diagram || {}).topologyProvenance || {}).imports) || []).forEach(function(record){
    (record.edges || []).forEach(function(key){imported.add(key);});
  });
  return imported;
}
/* Clear only authored routing geometry. scope is either {all:true,section:n}
   or {targets:[edge/node targets]}; node targets contribute their incident
   authored edges. A multi-section selection is still one source transaction. */
function planClearCustomEdges(text,raw,scope){
  scope=scope || {};var targets=Array.isArray(scope.targets)?scope.targets:null,sections=Object.create(null);
  if(scope.all===true){
    if(!Number.isInteger(scope.section))return {error:'Choose one diagram section.'};
    sections[scope.section]={all:true,edges:[],nodes:new Set()};
  }else{
    if(!targets || !targets.length)return {noop:true,count:0};
    for(var i=0;i<targets.length;i++){
      var target=targets[i];
      if(!target || !Number.isInteger(target.section) || ['edge','node'].indexOf(target.kind)<0)continue;
      var selected=sections[target.section] || (sections[target.section]={all:false,edges:[],nodes:new Set()});
      if(target.kind==='node' && typeof target.id==='string')selected.nodes.add(target.id);
      else selected.edges.push(target);
    }
  }
  var chosen=[];
  Object.keys(sections).forEach(function(sectionKey){
    var section=Number(sectionKey),selection=sections[sectionKey],got=builderDiagram(text,raw,section);
    if(got.error){chosen.push({error:got.error});return;}
    var edges=Array.isArray(got.d.edges)?got.d.edges:[],imported=builderImportedEdgeKeys(got.d),wanted=new Set();
    function local(index){var edge=edges[index];return !!edge && !imported.has(builderEdgeKey(edge));}
    if(selection.all)edges.forEach(function(_,index){if(local(index))wanted.add(index);});
    selection.edges.forEach(function(target){
      if(target.imported===true)return;
      if(Number.isInteger(target.index) && local(target.index) &&
        (typeof target.key!=='string' || builderEdgeKey(edges[target.index])===target.key))wanted.add(target.index);
      else if(typeof target.key==='string'){
        var matches=[];edges.forEach(function(edge,index){if(local(index) && builderEdgeKey(edge)===target.key)matches.push(index);});
        if(matches.length===1)wanted.add(matches[0]);
      }
    });
    if(selection.nodes.size)edges.forEach(function(edge,index){
      if(local(index) && (selection.nodes.has(edge.from) || selection.nodes.has(edge.to)))wanted.add(index);
    });
    Array.from(wanted).sort(function(a,b){return a-b;}).forEach(function(index){
      if(builderEdgeHasCustomRouting(edges[index]))chosen.push({section:section,index:index,path:got.path.concat(['edges',index])});
    });
  });
  var failure=chosen.find(function(record){return record.error;});if(failure)return {error:failure.error};
  if(!chosen.length)return {noop:true,count:0};
  var out=text;
  for(var c=0;c<chosen.length;c++){
    for(var f=0;f<BUILDER_EDGE_ROUTING_FIELDS.length;f++){
      var changed=jsonSetField(out,chosen[c].path,BUILDER_EDGE_ROUTING_FIELDS[f],null);
      if(!changed)return {error:'Could not clear custom connection routing.'};
      out=changed.text;
    }
  }
  return {text:out,count:chosen.length};
}

function planMoveRow(text, raw, sectionIdx, fromIdx, toIdx){
  /* lift one layout row out of diagram.rows and re-insert it at toIdx
     (index AFTER removal — the drop code converts gap positions) */
  var got = builderDiagram(text, raw, sectionIdx);
  if (got.error) return got;
  var rows = got.d.rows;
  if (!Array.isArray(rows) || !rows[fromIdx]) return {error: 'row not found'};
  var movable=builderFlatRowIds([rows[fromIdx]]).filter(function(id){return !builderNodePositionLocked(got.d,id);});
  if(!movable.length)return {noop:true};
  if (toIdx < 0 || toIdx >= rows.length) return {error: 'no row slot there'};
  if (toIdx === fromIdx) return {error: 'already there'};
  var locked=builderLockedNodeIds(got.d);
  if(!locked.length){
    var r=builderRewrite(text,raw,got.path.concat(['rows']),function(copy){
      var item=copy.splice(fromIdx,1)[0];copy.splice(toIdx,0,item);
    });
  }else{
    var positions=layout(got.d).pos,copy=builderClone(got.d);
    builderFreezeLockedPositions(copy,positions);
    var item=copy.rows.splice(fromIdx,1)[0];copy.rows.splice(toIdx,0,item);
    var r=builderPlacementPlan(text,raw,got.path,got.d,copy);
  }
  if (r.error) return r;
  r.index = toIdx;
  return r;
}

function planMoveGroup(text, raw, sectionIdx, groupKey, drop){
  var got = builderDiagram(text, raw, sectionIdx);
  if (got.error) return got;
  var nodes = got.d.nodes || {}, members = Object.create(null);
  Object.keys(nodes).forEach(function(id){
    if (nodes[id] && nodes[id].group === groupKey && nodes[id].locked!==true) members[id] = true;
  });
  var groupExists=Object.keys(nodes).some(function(id){return nodes[id] && nodes[id].group===groupKey;});
  if (!groupExists) return {error: 'group "' + groupKey + '" not found'};
  if (!Object.keys(members).length)return {noop:true};
  var rows = got.d.rows;
  if (!builderFlatRowIds(rows).some(function(id){ return members[id]; }))
    return {error: 'group "' + groupKey + '" has no nodes placed in rows'};
  if(!builderLockedNodeIds(got.d).length)return builderRewrite(text,raw,got.path.concat(['rows']),function(copy){
    return builderLiftAndInsert(copy,members,drop);
  });
  var positions=layout(got.d).pos,copy=builderClone(got.d);
  builderFreezeLockedPositions(copy,positions);
  var out=builderLiftAndInsert(copy.rows,members,drop);if(out && out.error)return out;
  return builderPlacementPlan(text,raw,got.path,got.d,copy);
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
  if(builderNodePositionLocked(got.d,id))return {noop:true};
  var inRows = builderFlatRowIds(got.d.rows).indexOf(id) >= 0;
  var floating = (got.d.floats || []).some(function(f){ return f && f.id === id; });
  if (!inRows && !floating) return {error: 'node "' + id + '" has no layout slot (rows or floats) to move'};
  if (!Array.isArray(got.d.rows) || !got.d.rows.length) return {error: 'no rows layout in this section'};
  var members=Object.create(null);members[id]=true;
  if(!builderLockedNodeIds(got.d).length){
    var rows=builderClone(got.d.rows),out=builderLiftAndInsert(rows,members,drop,{plainStacks:true,run:inRows?[]:[id]});
    if(out && out.error)return out;
    var pairs=[['rows',JSON.stringify(rows)]];
    if(floating){var floats={floats:builderClone(got.d.floats)};builderRemoveFloat(floats,id);pairs.push(['floats',floats.floats?JSON.stringify(floats.floats):null]);}
    return planSetFields(text,raw,got.path,pairs);
  }
  var positions=layout(got.d).pos,copy=builderClone(got.d);
  builderFreezeLockedPositions(copy,positions);
  var out=builderLiftAndInsert(copy.rows,members,drop,{plainStacks:true,run:inRows?[]:[id]});
  if(out && out.error)return out;
  if(floating)builderRemoveFloat(copy,id);
  return builderPlacementPlan(text,raw,got.path,got.d,copy);
}

function planPlaceFloat(text,raw,sectionIdx,id,x,y){
  var got=builderDiagram(text,raw,sectionIdx);if(got.error)return got;
  if(!got.d.nodes || !Object.prototype.hasOwnProperty.call(got.d.nodes,id))return {error:'node not found'};
  if(builderNodePositionLocked(got.d,id))return {noop:true};
  if(!floatCoordinate(x) || !floatCoordinate(y))return {error:'X and Y must be finite coordinates between -100000 and 100000.'};
  var positions=layout(got.d).pos;
  return builderRewrite(text,raw,got.path,function(d){
    builderFreezeLockedPositions(d,positions);
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

/* A custom center is relative to the direct import origin, keyed by its
   provider-relative identity (which can itself include nested namespaces). */
function planPlaceTopologyNode(text,raw,sectionIdx,namespace,id,x,y,context){
  var got=builderDiagram(text,raw,sectionIdx);if(got.error)return got;
  if(!floatCoordinate(x) || !floatCoordinate(y))return {error:'Node position requires finite X/Y coordinates between -100000 and 100000.'};
  var resolved;
  try{resolved=FlowTopology.resolveSource(raw,context);}catch(ex){return {error:ex.message};}
  var record=specSectionPaths(resolved)[sectionIdx],diagram=record && specValueAt(resolved,record.diagram);
  var owner=FlowTopology.origin(diagram,'nodes',id);
  var imports=got.d.topologyImports || [],index=imports.findIndex(function(imp){return imp.as===namespace;});
  if(index<0 || !owner || owner.as!==namespace)return {error:'Choose a node in this authored topology import.'};
  var position=owner.position;if(!position)return {error:'Render the import before arranging its nodes.'};
  var relative={x:Math.round((x-position.x)*10)/10,y:Math.round((y-position.y)*10)/10};
  if(!floatCoordinate(relative.x) || !floatCoordinate(relative.y))return {error:'Relative node position exceeds the supported coordinate range.'};
  var positions=builderClone(imports[index].nodePositions || {});
  Object.defineProperty(positions,id.slice(namespace.length+2),{value:relative,enumerable:true,writable:true,configurable:true});
  return planSetFields(text,raw,got.path.concat(['topologyImports',index]),[
    ['position',JSON.stringify(position)],['nodePositions',JSON.stringify(positions)]
  ]);
}
function planResetTopologyArrangement(text,raw,sectionIdx,namespace){
  var got=builderDiagram(text,raw,sectionIdx);if(got.error)return got;
  var imports=got.d.topologyImports || [],indexes=[];
  imports.forEach(function(imp,index){if(imp.as===namespace)indexes.push(index);});
  if(indexes.length!==1)return {error:'Choose one authored topology import.'};
  if(!Object.keys(imports[indexes[0]].nodePositions || {}).length)return {error:'This reference already uses the provider arrangement.'};
  return planSetField(text,raw,got.path.concat(['topologyImports',indexes[0]]),'nodePositions',null);
}

/* Resolve node ownership without ever treating provider-derived nodes/floats as
   authored consumer structure. A direct import owns nested imported members too;
   their nodePositions key is the identity relative to that direct namespace. */
function builderNodeArrangementTargets(text,raw,targets,context){
  if(!Array.isArray(targets) || !targets.length)return {error:'Select nodes to arrange.'};
  var section=targets[0].section;
  if(targets.some(function(t){return t.kind!=='node' || t.section!==section;}))
    return {error:'Choose nodes from a single section.'};
  var got=builderDiagram(text,raw,section);if(got.error)return got;
  var ids=targets.map(function(t){return t.id;});
  if(new Set(ids).size!==ids.length)return {error:'Select each node only once.'};
  var hasImports=Array.isArray(got.d.topologyImports) && got.d.topologyImports.length;
  var needsProvider=ids.some(function(id){return !Object.prototype.hasOwnProperty.call(got.d.nodes || {},id);});
  if(needsProvider && !context)return {error:'Open this authored spec from Canon to load its frozen provider context.'};
  var effectiveRaw=raw;
  if(hasImports && context){
    if(typeof FlowTopology==='undefined')return {error:'Topology provider resolution is unavailable.'};
    try{effectiveRaw=FlowTopology.resolveSource(raw,context);}catch(ex){return {error:ex.message};}
  }
  var effectiveRecord=specSectionPaths(effectiveRaw)[section],effective=effectiveRecord && specValueAt(effectiveRaw,effectiveRecord.diagram);
  if(!effective)return {error:'An object changed. Render and select it again.'};
  var positions=layout(effective).pos,records=[];
  for(var i=0;i<ids.length;i++){
    var id=ids[i],materializedOwner=typeof FlowTopology!=='undefined' && FlowTopology.origin(got.d,'nodes',id);
    if(materializedOwner)return {error:'Open the authored consumer from Canon to arrange imported nodes.'};
    var local=Object.prototype.hasOwnProperty.call(got.d.nodes || {},id),owner=null,index=-1;
    if(!local){
      owner=typeof FlowTopology!=='undefined' && FlowTopology.origin(effective,'nodes',id);
      if(!owner)return {error:'An object changed. Render and select it again.'};
      var indexes=[];(got.d.topologyImports || []).forEach(function(imp,j){if(imp && imp.as===owner.as)indexes.push(j);});
      if(indexes.length!==1 || !owner.position)return {error:'Open the authored consumer from Canon to arrange this imported node.'};
      index=indexes[0];
    }
    var p=positions[id];if(!p && !local)return {error:'Render the selected nodes before arranging them.'};
    records.push({id:id,local:local,owner:owner,importIndex:index,position:p});
  }
  got.ids=ids;got.records=records;got.effective=effective;return got;
}
function builderSelectedFloats(text,raw,targets,context){
  if(!Array.isArray(targets) || targets.length<2)return {error:'Select at least two floating nodes.'};
  var got=builderNodeArrangementTargets(text,raw,targets,context);if(got.error)return got;
  if(got.records.some(function(record){return record.local && !builderNodePositionLocked(got.d,record.id) && !(got.d.floats || []).some(function(f){return f && f.id===record.id;});}))
    return {error:'Use Free placement for every selected local node before aligning or moving them together.'};
  if(got.records.some(function(record){return !record.position;}))return {error:'Render the selected nodes before arranging them.'};
  got.noop=got.records.every(function(record){return record.local && builderNodePositionLocked(got.d,record.id);});
  return got;
}
function planTransformFloats(text,raw,targets,change,context){
  var got=builderSelectedFloats(text,raw,targets,context);if(got.error)return got;
  if(!change || ['horizontal','vertical','move'].indexOf(change.type)<0)return {error:'Choose horizontal or vertical alignment, or a move.'};
  if(change.type==='move' && (!Number.isFinite(change.dx) || !Number.isFinite(change.dy)))return {error:'Move distances must be finite.'};
  var anchor=got.records[0].position,updated=Object.create(null),different=false,movable=got.records.filter(function(record){return !record.local || !builderNodePositionLocked(got.d,record.id);});
  if(!movable.length)return {noop:true};
  for(var i=0;i<movable.length;i++){
    var record=movable[i],id=record.id,p=record.position;
    var x=change.type==='vertical'?anchor.cx:p.cx+(change.type==='move'?change.dx:0);
    var y=change.type==='horizontal'?anchor.cy:p.cy+(change.type==='move'?change.dy:0);
    if(!floatCoordinate(x) || !floatCoordinate(y))return {error:'X and Y must be finite coordinates between -100000 and 100000.'};
    updated[id]={x:Math.round(x*10)/10,y:Math.round(y*10)/10};
    if(!record.local && (!floatCoordinate(updated[id].x-record.owner.position.x) || !floatCoordinate(updated[id].y-record.owner.position.y)))
      return {error:'Relative node position exceeds the supported coordinate range.'};
    if(Math.abs(updated[id].x-p.cx)>=.0001 || Math.abs(updated[id].y-p.cy)>=.0001)different=true;
  }
  if(!different)return {noop:true};
  if(!builderLockedNodeIds(got.d).length && movable.every(function(record){return record.local;})){
    var floats=got.d.floats.map(function(f){
      if(!updated[f.id])return f;
      var next=Object.assign({},f,updated[f.id]);delete next.dx;delete next.dy;return next;
    });
    return planSetField(text,raw,got.path,'floats',JSON.stringify(floats));
  }
  var lockedPositions=layout(got.d).pos;
  return builderRewrite(text,raw,got.path,function(d){
    var localChanged=false;builderFreezeLockedPositions(d,lockedPositions);
    movable.forEach(function(record){
      var next=updated[record.id];
      if(record.local){
        var f=(d.floats || []).find(function(item){return item && item.id===record.id;});
        if(Math.abs(record.position.cx-next.x)>=.0001 || Math.abs(record.position.cy-next.y)>=.0001)localChanged=true;
        f.x=next.x;f.y=next.y;delete f.dx;delete f.dy;return;
      }
      var imp=d.topologyImports[record.importIndex],origin=record.owner.position;
      imp.position=builderClone(origin);if(!imp.nodePositions)imp.nodePositions={};
      var relative={x:Math.round((next.x-origin.x)*10)/10,y:Math.round((next.y-origin.y)*10)/10};
      Object.defineProperty(imp.nodePositions,record.id.slice(record.owner.as.length+2),{value:relative,enumerable:true,writable:true,configurable:true});
    });
    // Moving a local float can change the automatic origin chosen for later
    // imports. Freeze those current origins so unrelated rendered placement is
    // stable across the same transaction.
    if(localChanged)((got.effective.topologyProvenance || {}).imports || []).forEach(function(owner){
      var index=(d.topologyImports || []).findIndex(function(imp){return imp && imp.as===owner.as;});
      if(index>=0 && !d.topologyImports[index].position)d.topologyImports[index].position=builderClone(owner.position);
    });
  });
}

function planSetNodeFloat(text, raw, sectionIdx, id, sideOrNull){
  var got = builderDiagram(text, raw, sectionIdx);
  if (got.error) return got;
  if (!got.d.nodes || !Object.prototype.hasOwnProperty.call(got.d.nodes, id))
    return {error: 'node "' + id + '" not found'};
  if(builderNodePositionLocked(got.d,id))return {noop:true};
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
  var positions=layout(got.d).pos;
  return builderRewrite(text, raw, got.path, function(d){
    builderFreezeLockedPositions(d,positions);
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
  if(builderNodePositionLocked(d,idA) || builderNodePositionLocked(d,idB))return {noop:true};
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
  var requested=Object.keys(want),wantList=requested.filter(function(id){return !builderNodePositionLocked(d,id);});
  if (requested.length < 2) return {error: 'select at least two nodes to stack'};
  if(wantList.length<2)return {noop:true};
  want=Object.create(null);wantList.forEach(function(id){want[id]=true;});
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
  if(!builderLockedNodeIds(d).length)var plan=planSetFields(text,raw,rec.diagram,[['rows',JSON.stringify(newRows)]]);
  else{
    var positions=layout(d).pos,copy=builderClone(d);copy.rows=builderClone(newRows);builderFreezeLockedPositions(copy,positions);
    var plan=builderPlacementPlan(text,raw,rec.diagram,d,copy);
  }
  if (plan.error) return plan;
  plan.kind = 'node';
  return plan;
}

/* Authored section layouts are spec data; host preview dimensions are workspace
   state. Pointer previews never write source until one successful release. */
/* Upgrade all sibling profiles together because columns belongs to the whole
   sectionLayout. Preserve dormant/hidden tiles and unknown authored fields. */
function builderSectionLayout24(value){
  var layouts=builderClone(value || {});
  if(layouts.columns!==undefined && layouts.columns!==12 && layouts.columns!==24)return layouts;
  if(sectionLayoutColumns(layouts)===12){
    ['default','backstage','confluence'].forEach(function(target){
      if(Array.isArray(layouts[target]))layouts[target].forEach(function(it){
        if(it && typeof it==='object' && !Array.isArray(it)){
          if(Number.isInteger(it.x))it.x*=2;
          if(Number.isInteger(it.w))it.w*=2;
        }
      });
    });
  }
  layouts.columns=SECTION_LAYOUT_COLUMNS;return layouts;
}
function builderSectionLayoutHasProfiles(layouts){
  return ['default','backstage','confluence'].some(function(target){return Object.prototype.hasOwnProperty.call(layouts,target);});
}
function planSectionLayout(text,raw,section,target,items,layoutId){
  var got=builderDiagram(text,raw,section);if(got.error)return got;
  if(['default','backstage','confluence'].indexOf(target)<0)return {error:'Unknown layout target.'};
  var index=Array.isArray(got.d.layouts)?got.d.layouts.findIndex(function(v){return v && v.id===layoutId;}):-1;
  if(Array.isArray(got.d.layouts) && index<0)return {error:'Reselect the layout before editing it.'};
  var definition=index>=0?got.d.layouts[index]:got.d, layouts=builderSectionLayout24(definition.sectionLayout);
  if(items===null)delete layouts[target];else layouts[target]=items;
  if(index>=0 && !builderSectionLayoutHasProfiles(layouts))layouts.default=sectionLayoutPreset(got.d,'default');
  var warnings=[];sectionLayoutProfileWarnings(got.d,layouts,'diagram',warnings);
  if(warnings.length)return {error:warnings.join('\n')};
  return planSetField(text,raw,index>=0?got.path.concat(['layouts',index]):got.path,'sectionLayout',builderSectionLayoutHasProfiles(layouts)?JSON.stringify(layouts):null);
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
/* A chapter-level visibility choice applies to every saved host profile.
   Keep tile geometry and profile-specific panel visibility intact. Legacy
   choices become named chapters through the same promotion as Viewing mode. */
function planSectionDiagramVisibility(text,raw,section,layoutId,visible){
  var got=builderDiagram(text,raw,section);if(got.error)return got;
  if(typeof visible!=='boolean')return {error:'Choose whether to show the diagram.'};
  var selected=layoutId,plan=builderRewrite(text,raw,got.path,function(d){
    if(!Array.isArray(d.layouts)){
      var promoted=builderPromoteSectionViews(d,layoutId);if(promoted.error)return promoted;
      selected=promoted.layoutId;
    }
    var view=d.layouts.find(function(v){return v.id===selected;});
    if(!view)return {error:'Reselect the section arrangement before changing diagram visibility.'};
    var profiles=builderSectionLayout24(view.sectionLayout);
    if(!Array.isArray(profiles.default))profiles.default=sectionLayoutItems(d,'default',selected) || sectionLayoutPreset(d,'default');
    view.sectionLayout=profiles;
    ['default','backstage','confluence'].forEach(function(target){
      if(!Array.isArray(profiles[target]))return;
      var tile=profiles[target].find(function(item){return sectionLayoutKey(item)==='diagram';});
      if(!tile){tile=sectionLayoutItems(d,target,selected).find(function(item){return sectionLayoutKey(item)==='diagram';});profiles[target].push(tile);}
      if(visible)delete tile.hidden;else tile.hidden=true;
    });
  });
  if(!plan.error)plan.layoutId=selected;return plan;
}
function planSectionPathLabelWidth(text,raw,section,layoutId,value){
  var got=builderDiagram(text,raw,section);if(got.error)return got;
  var warnings=[];if(value!==null)sectionPathLabelWidth(value,warnings);
  if(warnings.length)return {error:warnings.join('\n')};
  var selected=layoutId,plan=builderRewrite(text,raw,got.path,function(d){
    if(!Array.isArray(d.layouts)){
      var promoted=builderPromoteSectionViews(d,layoutId);if(promoted.error)return promoted;
      selected=promoted.layoutId;
    }
    var view=d.layouts.find(function(v){return v.id===selected;});
    if(!view)return {error:'Reselect the section arrangement before changing path label width.'};
    if(value===null)delete view.pathLabelWidth;else view.pathLabelWidth=value;
  });
  if(!plan.error)plan.layoutId=selected;return plan;
}
function planSectionExploreTextScale(text,raw,section,layoutId,surface,value,allowPresentationOverride){
  var got=builderDiagram(text,raw,section);if(got.error)return got;
  if(['prose','controls'].indexOf(surface)<0)return {error:'Choose Section notes or step controls.'};
  var view=Array.isArray(got.d.layouts)?got.d.layouts.find(function(v){return v && v.id===layoutId;}):allowPresentationOverride?{}:null;
  if(!view || view.presentation!=='explore' && !allowPresentationOverride)return {error:'Select an Explore view before changing text size.'};
  var warnings=[];if(value!==null)sectionExploreTextScale(value,warnings);
  if(warnings.length)return {error:warnings.join('\n')};
  var next=builderClone(view.exploreLayout || {}),scales=next.textScale && typeof next.textScale==='object' && !Array.isArray(next.textScale)?next.textScale:{};
  if(value===null || value===1)delete scales[surface];else scales[surface]=value;
  if(Object.keys(scales).length)next.textScale=scales;else delete next.textScale;
  return planSectionExploreLayout(text,raw,section,layoutId,Object.keys(next).length?next:null,allowPresentationOverride);
}
function planSectionExploreLayout(text,raw,section,layoutId,value,allowPresentationOverride){
  var got=builderDiagram(text,raw,section);if(got.error)return got;
  var warnings=[];
  if(value!==null)sectionExploreLayout(got.d,value,warnings,'exploreLayout');
  if(warnings.length)return {error:warnings.join('\n')};
  if(!Array.isArray(got.d.layouts)){
    if(!allowPresentationOverride)return {error:'Select an Explore view before arranging it.'};
    var d=builderClone(got.d),selected=builderPromoteSectionViews(d,layoutId);if(selected.error)return selected;
    var promoted=d.layouts.find(function(v){return v && v.id===selected.layoutId;});if(!promoted)return {error:'Reselect the Explore view before arranging it.'};
    if(value===null)delete promoted.exploreLayout;else promoted.exploreLayout=builderClone(value);
    var plan=planReplaceValue(text,raw,got.path,JSON.stringify(d));plan.layoutId=selected.layoutId;return plan;
  }
  var index=got.d.layouts.findIndex(function(v){return v && v.id===layoutId;});
  if(index<0 || got.d.layouts[index].presentation!=='explore' && !allowPresentationOverride)return {error:'Select an Explore view before arranging it.'};
  return planSetField(text,raw,got.path.concat(['layouts',index]),'exploreLayout',value===null?null:JSON.stringify(value));
}
/* Explicit authoring materializes only the selected ordinary arrangement. */
function builderPromoteSectionViews(d,layoutId){
  if(layoutId!=null && ['default','layout','flow'].indexOf(layoutId)<0)return {error:'Reselect the arrangement before editing it.'};
  var source=sectionLayoutDefinition(d);
  d.layouts=[{id:'flow',name:source?source.name:'Standard',sectionLayout:source?builderSectionLayout24(source.sectionLayout):{columns:24,default:sectionLayoutOptimize(d,'default',null)}}];
  d.defaultLayout='flow';delete d.sectionLayout;delete d.layoutName;
  return {layoutId:'flow'};
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
      d.layouts=[{id:'layout-1',name:source?source.name:'Layout',sectionLayout:builderSectionLayout24(source?source.sectionLayout:{columns:24,default:sectionLayoutPreset(d,'default')})}];
      d.defaultLayout='layout-1';delete d.sectionLayout;delete d.layoutName;source=d.layouts[0];
    }
  }
  if(!source)return {error:'Select a layout to duplicate.'};
  var n=1;while(d.layouts.some(function(v){return v.id==='layout-'+n;}))n++;
  var id='layout-'+n, name=source.name.slice(0,33)+' copy';
  var suffix=2;while(d.layouts.some(function(v){return v.name===name;}))name=source.name.slice(0,28)+' copy '+suffix++;
  var profiles=builderSectionLayout24(source.sectionLayout);
  Object.keys(profiles).forEach(function(target){
    if(!Array.isArray(profiles[target]))return;
    profiles[target]=sectionLayoutItems(Object.assign({},d,{layouts:undefined,defaultLayout:undefined,sectionLayout:profiles}),target);
  });
  var copy={id:id,name:name,sectionLayout:profiles};if(source.paths)copy.paths=builderClone(source.paths);if(source.steps)copy.steps=builderClone(source.steps);
  var original=d.layouts.find(function(v){return v.id===source.id;});
  if(original && original.presentation!==undefined)copy.presentation=original.presentation;
  if(original && original.pathLabelWidth!==undefined)copy.pathLabelWidth=original.pathLabelWidth;
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
  var attachment=previous?previous.attachTo:'diagram';
  var excluded=hidden.map(sectionLayoutKey),dock=attachment && excluded.indexOf(attachment)<0 && sectionLayoutTiles(d).some(function(t){return t.key==='steps';});
  if(dock)excluded.push('steps');
  var next=sectionLayoutPreset(d,target,excluded);
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
  if(resize){item.w=Math.max(1,Math.min(SECTION_LAYOUT_COLUMNS-item.x,item.w+Math.round(dx)));item.h=Math.max(3,Math.min(40,item.h+Math.round(dy)));}
  else{item.x=Math.max(0,Math.min(SECTION_LAYOUT_COLUMNS-item.w,item.x+Math.round(dx)));item.y=Math.max(0,Math.min(500,item.y+Math.round(dy)));}
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
  var locked=builderLockedNodeIds(got.d);if(locked.length===Object.keys(got.d.nodes || {}).length)return {noop:true};
  try{
    var ids=autoArrangeInput(got.d);
    if(!result || !Array.isArray(result.positions) || result.positions.length!==ids.length ||
      !Array.isArray(result.edges) || result.edges.length!==(got.d.edges || []).length || !validGraphFrame(result.frame) ||
      new Set(result.positions.map(function(p){return p.id;})).size!==ids.length ||
      result.positions.some(function(p){return ids.indexOf(p.id)<0 || !floatCoordinate(p.x) || !floatCoordinate(p.y);}) ||
      result.edges.some(function(e){return !e || typeof e!=='object' || Array.isArray(e) ||
        !validCurveControls(e.curveControls) || !validEdgePort(e.fromPort) || !validEdgePort(e.toPort) ||
        ['labelDx','labelDy'].some(function(k){return e[k]!=null && !floatCoordinate(e[k]);});}))
      return {error:'The layout returned invalid geometry. The source is unchanged.'};
    var before=layout(got.d).pos,byId=new Map(result.positions.map(function(p){return [p.id,p];}));
    if(locked.some(function(id){var a=before[id],b=byId.get(id);return !a || !b || Math.abs(a.cx-b.x)>.0001 || Math.abs(a.cy-b.y)>.0001;}))
      return {error:'Auto arrange did not preserve every locked node position. The source is unchanged.'};
    // Only a fixed geometry allowlist crosses the worker/transaction boundary.
    var clean={positions:result.positions,frame:{x:result.frame.x,y:result.frame.y,w:result.frame.w,h:result.frame.h},edges:result.edges.map(function(e){var out={};
      ['curveControls','fromPort','toPort','labelDx','labelDy'].forEach(function(k){if(e[k]!=null)out[k]=e[k];});return out;})};
    return planReplaceValue(text,raw,got.path,JSON.stringify(autoArrangeDiagram(got.d,clean),null,2));
  }catch(error){return {error:error.message};}
}

/* Spatial object actions operate on one authored diagram. Measurements are
   effective graph-space rectangles supplied by the interaction owner. */
function builderSpatialTargets(text,raw,targets,context){
  if(!targets || !targets.length)return {error:'Select nodes or canvas panels.'};
  var section=targets[0].section,got=builderDiagram(text,raw,section);if(got.error)return got;
  if(targets.some(function(t){return t.section!==section || ['node','panel'].indexOf(t.kind)<0;}))return {error:'Choose nodes and canvas panels from one section.'};
  var nodeTargets=targets.filter(function(t){return t.kind==='node';}),nodes=nodeTargets.length?builderNodeArrangementTargets(text,raw,nodeTargets,context):null;
  if(nodes && nodes.error)return nodes;
  var byId=Object.create(null);if(nodes)nodes.records.forEach(function(record){byId[record.id]=record;});
  for(var i=0;i<targets.length;i++){
    var t=targets[i],value=t.kind==='node'?byId[t.id]:(got.d.panels || []).find(function(p){return p.id===t.id;});
    if(!value)return {error:'An object changed. Render and select it again.'};
  }
  got.records=targets.map(function(t){return t.kind==='node'?byId[t.id]:{id:t.id,local:true,panel:true};});
  got.effective=nodes?nodes.effective:got.d;
  return got;
}
function planAlignSpatial(text,raw,targets,layoutId,direction,rects,anchorIndex,context){
  var got=builderSpatialTargets(text,raw,targets,context);if(got.error)return got;
  if(targets.length<2)return {error:'Select at least two objects to align.'};
  if(['horizontal','vertical'].indexOf(direction)<0)return {error:'Choose an alignment direction.'};
  if(got.records.some(function(record){return !record.panel && record.local && !builderNodePositionLocked(got.d,record.id) && !(got.d.floats || []).some(function(f){return f.id===record.id;});}))return {error:'Use Free placement for every selected local node before aligning.'};
  var view=(got.d.layouts || []).find(function(v){return v.id===layoutId;});
  if(targets.some(function(t){return t.kind==='panel';}) && (!view || view.presentation!=='explore'))return {error:'Select an Explore view before aligning panels.'};
  if(!rects || rects.length!==targets.length || rects.some(function(r){return !r || ![r.x,r.y,r.w,r.h].every(Number.isFinite) || r.w<=0 || r.h<=0;}))return {error:'Render all selected objects before aligning.'};
  if(anchorIndex==null)anchorIndex=0;
  if(!Number.isInteger(anchorIndex) || anchorIndex<0 || anchorIndex>=targets.length)return {error:'Choose a selected object as the alignment anchor.'};
  if(!targets.some(function(t){return t.kind!=='node' || !builderNodePositionLocked(got.d,t.id);}))return {noop:true};
  var axis=direction==='vertical'?'x':'y',size=direction==='vertical'?'w':'h',anchorCenter=rects[anchorIndex][axis]+rects[anchorIndex][size]/2;
  if(rects.every(function(r){return Math.abs(r[axis]+r[size]/2-anchorCenter)<.0001;}))return {noop:true};
  var effectiveBefore=layout(got.d).pos,selectedNodes=Object.create(null);targets.forEach(function(t){if(t.kind==='node' && Object.prototype.hasOwnProperty.call(got.d.nodes || {},t.id))selectedNodes[t.id]=true;});
  var changed=false,plan=builderRewrite(text,raw,got.path,function(d){
    builderFreezeLockedPositions(d,effectiveBefore);
    // Context-menu alignment can anchor a later selection member. Fixed
    // anchors retain their authored placement; automatic anchors are pinned
    // only when another object actually changes so the rerender cannot move
    // the visual target out from under the completed alignment.
    function coordinate(value){var tenth=Math.round(value*10)/10;return Math.abs(value-tenth)<.0001?tenth:value;}
    function assign(object,key,value){value=coordinate(value);if(!Number.isFinite(object[key]) || Math.abs(object[key]-value)>=.0001){object[key]=value;changed=true;}}
    function remove(object,key){if(Object.prototype.hasOwnProperty.call(object,key)){delete object[key];changed=true;}}
    var automaticChanged=false,localChanged=false,anchor=rects[anchorIndex],anchorTarget=targets[anchorIndex],anchorRecord=got.records[anchorIndex],anchorFloat=anchorTarget.kind==='node' && anchorRecord.local && d.floats.find(function(f){return f.id===anchorTarget.id;});
    var cx=positionedFloat(anchorFloat)?anchorFloat.x:coordinate(anchor.x+anchor.w/2),cy=positionedFloat(anchorFloat)?anchorFloat.y:coordinate(anchor.y+anchor.h/2);
    var definition=(d.layouts || []).find(function(v){return v.id===layoutId;});
    for(var i=0;i<targets.length;i++){
      if(i===anchorIndex)continue;
      var t=targets[i],r=rects[i],x=direction==='vertical'?cx:coordinate(r.x+r.w/2),y=direction==='horizontal'?cy:coordinate(r.y+r.h/2);
      if(t.kind==='node' && builderNodePositionLocked(got.d,t.id))continue;
      if(!floatCoordinate(x) || !floatCoordinate(y))return {error:'Alignment is outside the supported canvas coordinates.'};
      if(t.kind==='node'){
        var record=got.records[i];
        if(!record.local){
          var imp=d.topologyImports[record.importIndex],origin=record.owner.position;
          imp.position=builderClone(origin);if(!imp.nodePositions)imp.nodePositions={};
          var relative={x:coordinate(x-origin.x),y:coordinate(y-origin.y)};
          if(!floatCoordinate(relative.x) || !floatCoordinate(relative.y))return {error:'Relative node position exceeds the supported coordinate range.'};
          Object.defineProperty(imp.nodePositions,record.id.slice(record.owner.as.length+2),{value:relative,enumerable:true,writable:true,configurable:true});changed=true;
        }else{
        var f=d.floats.find(function(f){return f.id===t.id;});
        localChanged=true;
        if(!positionedFloat(f)){
          // Once one automatic axis is aligned, pin both rendered centers so
          // the layout continues to honor the edit and retains its other axis.
          automaticChanged=true;
          assign(f,'x',x);assign(f,'y',y);remove(f,'dx');remove(f,'dy');
        }else if(direction==='vertical'){assign(f,'x',x);remove(f,'dx');}
        else {assign(f,'y',y);remove(f,'dy');}
        }
      }else{
        var explore=definition.exploreLayout || (definition.exploreLayout={}),canvas=explore.canvas || (explore.canvas={}),panels=canvas.panels || (canvas.panels=[]);
        var p=panels.find(function(p){return p.panel===t.id;});if(!p){p={panel:t.id};panels.push(p);changed=true;}
        assign(p,'x',direction==='vertical'?x-r.w/2:r.x);assign(p,'y',direction==='horizontal'?y-r.h/2:r.y);assign(p,'w',r.w);assign(p,'h',r.h);
      }
    }
    if(changed && anchorFloat && !positionedFloat(anchorFloat)){
      if(!floatCoordinate(cx) || !floatCoordinate(cy))return {error:'Alignment is outside the supported canvas coordinates.'};
      automaticChanged=true;
      localChanged=true;
      assign(anchorFloat,'x',cx);assign(anchorFloat,'y',cy);remove(anchorFloat,'dx');remove(anchorFloat,'dy');
    }
    // Fix only automatic, unselected floats whose computed center would change
    // after the selected automatic floats become fixed. Their visible placement
    // is unrelated to this command and must survive the same rerender.
    if(automaticChanged){
      for(var pass=0;pass<(d.floats || []).length;pass++){
        var effectiveAfter=layout(d).pos,preserved=false;
        (d.floats || []).forEach(function(f){
          if(!f || selectedNodes[f.id] || positionedFloat(f))return;
          var before=effectiveBefore[f.id],after=effectiveAfter[f.id];
          if(!before || !after || Math.abs(before.cx-after.cx)<.0001 && Math.abs(before.cy-after.cy)<.0001)return;
          assign(f,'x',before.cx);assign(f,'y',before.cy);remove(f,'dx');remove(f,'dy');preserved=true;
        });
        if(!preserved)break;
      }
    }
    if(localChanged)((got.effective.topologyProvenance || {}).imports || []).forEach(function(owner){
      var index=(d.topologyImports || []).findIndex(function(imp){return imp && imp.as===owner.as;});
      if(index>=0 && !d.topologyImports[index].position){d.topologyImports[index].position=builderClone(owner.position);changed=true;}
    });
  });
  return (plan.error || changed)?plan:{noop:true};
}
/* Shared placement validation for measured selection actions. */
function builderMovableSpatial(text,raw,targets,layoutId,rects){
  var got=builderSpatialTargets(text,raw,targets);if(got.error)return got;
  if(targets.some(function(t){return t.kind==='node' && !builderNodePositionLocked(got.d,t.id) && !(got.d.floats || []).some(function(f){return f.id===t.id;});}))return {error:'Row nodes follow the row layout. Use Free placement for every selected unlocked node to move or distribute them.'};
  var definition=(got.d.layouts || []).find(function(v){return v.id===layoutId;});
  if(targets.some(function(t){return t.kind==='panel';}) && (!definition || definition.presentation!=='explore'))return {error:'Select an Explore view before moving panels.'};
  if(!rects || rects.length!==targets.length || rects.some(function(r){return !r || ![r.x,r.y,r.w,r.h].every(Number.isFinite) || r.w<=0 || r.h<=0;}))return {error:'Render all selected objects before moving them.'};
  got.noop=!targets.some(function(t){return t.kind!=='node' || !builderNodePositionLocked(got.d,t.id);});
  return got;
}
function builderSpatialDeltas(text,raw,targets,layoutId,rects,deltas){
  var got=builderMovableSpatial(text,raw,targets,layoutId,rects);if(got.error)return got;
  if(got.noop)return {noop:true};
  if(deltas.every(function(delta){return Math.abs(delta.x)<.00001 && Math.abs(delta.y)<.00001;}))return {error:'The selected objects are already in position.'};
  if(targets.every(function(t,i){return t.kind==='node' && builderNodePositionLocked(got.d,t.id) || Math.abs(deltas[i].x)<.00001 && Math.abs(deltas[i].y)<.00001;}))return {noop:true};
  var positions=layout(got.d).pos;
  return builderRewrite(text,raw,got.path,function(d){
    builderFreezeLockedPositions(d,positions);
    var definition=(d.layouts || []).find(function(v){return v.id===layoutId;});
    for(var i=0;i<targets.length;i++){
      var t=targets[i],r=rects[i],delta=deltas[i],x=r.x+delta.x,y=r.y+delta.y;
      if(t.kind==='node' && builderNodePositionLocked(got.d,t.id))continue;
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
  if(got.noop)return {noop:true};
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
        /* Offset past half a card's height so the original's centre stays clickable. */
        if(f){var copy=builderClone(f);copy.id=id;if(rects && rects[i]){copy.x=rects[i].x+rects[i].w/2+32;copy.y=rects[i].y+rects[i].h/2+32;delete copy.dx;delete copy.dy;}d.floats.push(copy);}
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

/* Tab View edits preserve the source outside the changed fields. Migration is
   explicit (the first View edit), and keeps legacy section arrangements intact. */
function builderTabViewOwner(raw,section){
  var rec=specSectionPaths(raw)[section];if(!rec)return null;
  var at=rec.section.lastIndexOf('tabs'),path=at>=0?rec.section.slice(0,at+2):raw.page?['page']:[];
  var page=normalize(raw),record=sectionRecords(page)[section],owner=tabViewOwners(page).find(function(o){return o.tabBlock===record.tabBlock && o.tab===record.tab;});
  return {path:path,owner:owner};
}
function planTabViewEdit(text,raw,section,id,action,value,validateSource){
  if(raw.nodes && raw.rows){text='{\n  "sections": [{"diagram": '+text+'}]\n}';raw=JSON.parse(text);}
  var got=builderTabViewOwner(raw,section);if(!got)return {error:'Select a section first.'};
  var owner=got.owner,views=tabViewDefinitions(owner),opening=tabViewDefault(owner,views),current=views.find(function(v){return v.id===id;}) || tabViewDefault(owner,views),next=text;
  function set(path,key,val){var result=jsonSetField(next,path,key,JSON.stringify(val));if(!result)throw new Error('Unable to locate the View source.');next=result.text;}
  if(!owner.source.views){
    var used=new Set(sectionRecords(normalize(raw)).map(function(rec){return rec.section.id;}).filter(Boolean));
    owner.records.forEach(function(rec){if(rec.section.id)return;var proposed='section-'+rec.number;while(used.has(proposed))proposed+='-copy';used.add(proposed);set(specSectionPaths(raw)[rec.number-1].section,'id',proposed);});
    raw=JSON.parse(next);got=builderTabViewOwner(raw,section);owner=got.owner;
    views=views.map(function(view){return {id:view.id,name:view.name.slice(0,80),presentation:view.presentation,sections:view.members.map(function(member){var ref={section:sectionRecords(normalize(raw))[member.record.number-1].section.id};if(member.layout)ref.layout=member.layout;return ref;})};});
    set(got.path,'views',views);set(got.path,'defaultView',opening && opening.id || views[0].id);
  }else views=JSON.parse(JSON.stringify(owner.source.views));
  var index=views.findIndex(function(v){return v.id===id;});if(index<0)index=views.findIndex(function(v){return current && v.id===current.id;});
  var selected=views[index];if(!selected)return {error:'The selected View no longer exists.'};
  var resultId=selected.id;
  if(action==='create' || action==='duplicate'){
    var stem=action==='create'?'view':selected.id.slice(0,54)+'-copy',serial=2,newId=stem;while(views.some(function(v){return v.id===newId;}))newId=stem+'-'+serial++;
    selected=JSON.parse(JSON.stringify(selected));selected.id=newId;selected.name=action==='create'?'New View':(selected.name.slice(0,73)+' copy');views.splice(index+1,0,selected);resultId=newId;
  }else if(action==='delete'){
    if(views.length===1)return {error:'Keep at least one View in this Tab.'};views.splice(index,1);resultId=views[Math.min(index,views.length-1)].id;
    var currentSource=specValueAt(JSON.parse(next),got.path);if(currentSource.defaultView===id)set(got.path,'defaultView',resultId);
  }else if(action==='arrangement'){
    var updatedRaw=JSON.parse(next),record=sectionRecords(normalize(updatedRaw))[section],member=selected.sections.find(function(member){return tabViewMemberReference(member)===record.section.id;});
    if(!member || !record.section.diagram)return {error:'Select a diagram section included in this View.'};
    var layoutId=typeof member==='object' && member.layout || (sectionLayoutDefinition(record.section.diagram) || {}).id || 'flow';
    var duplicated=planDuplicateSectionLayout(next,updatedRaw,section,layoutId);if(duplicated.error)return duplicated;next=duplicated.text;
    selected.sections=selected.sections.map(function(value){return tabViewMemberReference(value)===record.section.id?{section:record.section.id,layout:duplicated.layoutId}:value;});
  }else if(action==='name'){
    if(typeof value!=='string' || !value.trim() || value.trim().length>80)return {error:'Use a View name between 1 and 80 characters.'};selected.name=value.trim();
  }else if(action==='presentation')selected.presentation=value;
  else if(action==='sections')selected.sections=value;
  else if(action==='default')set(got.path,'defaultView',selected.id);
  else return {error:'Unknown View action.'};
  set(got.path,'views',views);
  var findings=builderValidateSource(JSON.parse(next),validateSource);if(findings.errors.length)return {error:findings.errors.join('\n')};
  return {text:next,viewId:resultId};
}
