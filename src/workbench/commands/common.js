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

/* Detail declarations stay on ordinary nodes/sections. Walk raw paths for
   source edits and use the shared viewer records for reference identity. */
function builderDetailRecords(raw){
  var records=sectionRecords(normalize(raw)),paths=specSectionPaths(raw);
  return records.map(function(record,i){
    return {section:record.section,reference:record.reference,aliases:record.aliases || [],
      number:record.number,path:paths[i].section,diagram:paths[i].diagram};
  });
}
function builderDetailIndex(records,detail){
  if (!detail || detail.spec || detail.section==null) return -1;
  var key=String(detail.section),index=records.findIndex(function(record){return record.reference===key;});
  if(index<0)index=records.findIndex(function(record){return record.aliases.indexOf(key)>=0;});
  if(index<0 && /^\d+$/.test(key)) index=Number(key)-1;
  return index>=0 && index<records.length?index:-1;
}
function builderEditDetails(text,raw,edit){
  var out=text,records=builderDetailRecords(raw),error=null;
  records.forEach(function(record,owner){
    var diagram=specValueAt(raw,record.diagram);
    Object.keys(diagram && diagram.nodes || {}).forEach(function(id){
      if(error)return;
      var detail=diagram.nodes[id] && diagram.nodes[id].detail;
      if(!detail || typeof detail!=='object' || Array.isArray(detail))return;
      var next=builderClone(detail),target=builderDetailIndex(records,detail);
      var result=edit(next,owner,target,id);
      if(result && result.error){error=result;return;}
      if(result===null)next=null;
      if(JSON.stringify(next)===JSON.stringify(detail))return;
      var changed=jsonSetField(out,record.diagram.concat(['nodes',id]),'detail',next==null?null:JSON.stringify(next,null,2));
      if(!changed){error={error:'could not update a detail reference'};return;}
      out=changed.text;
    });
  });
  return error || {text:out};
}
function builderDetailCascade(plan,sectionIdx,edit){
  if(plan.error)return plan;
  var updated=builderEditDetails(plan.text,JSON.parse(plan.text),function(detail,owner,target,id){
    return edit(detail,owner,target,id);
  });
  if(updated.error)return updated;
  if(updated.text===plan.text)return plan;
  plan.text=updated.text;
  var record=specSectionPaths(JSON.parse(plan.text))[sectionIdx];
  var range=record && jsonLocate(plan.text,record.diagram);
  if(range){plan.start=range.start;plan.end=range.end;}
  return plan;
}
function planSetNodeDetail(text,raw,sectionIdx,nodeId,detail){
  var path=builderTargetPath(raw,{kind:'node',section:sectionIdx,id:nodeId});
  if(!path || !specValueAt(raw,path))return {error:'node not found — reselect and try again'};
  if(detail!=null){
    if(specValueAt(raw,path).handoff!=null)return {error:'Remove the existing diagram handoff before applying a domain detail.'};
    if(!detail || typeof detail!=='object' || Array.isArray(detail))return {error:'Detail must be a JSON object.'};
    if(['focus','link'].indexOf(detail.mode)<0)return {error:'Choose focus for a drilldown or link for an external destination. Inline expansion is no longer supported.'};
    if(!detail.section && !detail.spec && !detail.url)return {error:'Choose a local section or enter an external detail target.'};
    if(detail.spec || !detail.section){
      if(detail.mode!=='link')return {error:'External details use link mode.'};
      if(detail.spec && (typeof detail.spec!=='string' || !detail.spec.trim() || typeof detail.section!=='string' || !detail.section.trim()))
        return {error:'An approved spec detail needs a spec ID and section reference.'};
      if(!detail.spec && !detail.url)return {error:'Choose a local section or enter a URL.'};
    }else{
      var records=builderDetailRecords(raw),index=builderDetailIndex(records,detail);
      if(index<0)return {error:'That detail section does not exist.'};
      detail=builderClone(detail);detail.section=records[index].reference;detail.mode='focus';
    }
    if(detail.url!=null && !isValidLinkBase(detail.url))return {error:'Detail URL must be an absolute http or https URL.'};
  }
  var plan=planSetField(text,raw,path,'detail',detail==null?null:JSON.stringify(detail,null,2));
  if(plan.error)return plan;
  if(typeof validateDetails==='function'){
    var errors=[];validateDetails(normalize(JSON.parse(plan.text)),errors,[]);
    if(errors.length)return {error:errors.join('\n')};
  }
  return plan;
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
  if (t.kind === 'crow') return planDeleteListItem(text, raw, builderTargetPath(raw,t).slice(0,-1), t.index);
  if (t.kind === 'contract'){
    var cp=builderTargetPath(raw,t);
    return jsonRemoveMember(text,cp.slice(0,-1),cp[cp.length-1]) || {error:'contract block not found'};
  }
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
