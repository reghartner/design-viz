/* Pure page/section/tab commands. Preserve raw source block/list addresses
   and rendered section ordinals; common commands supply clone/rewrite. */

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

function planDeleteSection(text, raw, sectionIdx){
  var rec = specSectionPaths(raw)[sectionIdx];
  if (!rec) return {error: 'no such section'};
  if (!rec.section.length)
    return {error: 'this spec is one bare diagram — clear the editor instead of deleting'};
  var parentPath = rec.section.slice(0, -1);
  var key = rec.section[rec.section.length - 1];
  var r = jsonRemoveMember(text, parentPath, key);
  if (!r) return {error: 'could not edit the editor text'};
  return builderDocumentDetailResult(r,raw,builderSectionListMap(parentPath,key,-1));
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
  if(clone.id){
    var taken=Object.create(null);builderDetailRecords(raw).forEach(function(record){taken[record.reference]=true;record.aliases.forEach(function(alias){taken[alias]=true;});});
    clone.id=builderUniqueKey(taken,clone.id+'-copy');
  }
  var parentPath = rec.section.slice(0, -1);
  var idx = rec.section[rec.section.length - 1];
  var r = jsonInsertArrayItemAfter(text, parentPath, idx, JSON.stringify(clone, null, 2));
  if (!r) return {error: 'could not edit the editor text'};
  r.kind='section';r.index=sectionIdx+1;
  return builderDocumentDetailResult(r,raw,builderSectionListMap(parentPath,idx+1,1),
    [{from:rec.section,to:parentPath.concat([idx+1])}]);
}

/* ---------------- tab management ----------------
   Tabs are addressed by BLOCK index (the position in the page's
   blocks/sections list — the same index the engine bakes into each tab
   button's id "tab-<block>-<tab>") plus the tab index inside that
   block's tabs list. */

var BUILDER_TAB_TEMPLATE = [
  '{',
  '  "label": "New tab",',
  '  "sections": [' + BUILDER_SECTION_TEMPLATE.split('\n').join('\n  ') + ']',
  '}'
].join('\n');

/* a whole tabs container: two tabs, one starter section each — the
   "+ tab" button on a selected tab grows it from there */
var BUILDER_TABS_TEMPLATE = [
  '{',
  '  "tabs": [',
  '    ' + BUILDER_TAB_TEMPLATE.replace('"New tab"', '"Tab one"').split('\n').join('\n    ') + ',',
  '    ' + BUILDER_TAB_TEMPLATE.replace('"New tab"', '"Tab two"').split('\n').join('\n    '),
  '  ]',
  '}'
].join('\n');

function planAddTabs(text, raw){
  /* append a tabs container to the page's block list — same shape rules
     as planAddSection */
  var base, page;
  if (raw && raw.page){ page = raw.page; base = ['page']; }
  else if (raw && (raw.blocks || raw.sections)){ page = raw; base = []; }
  else if (raw && raw.nodes && raw.rows)
    return {error: 'this spec is a bare diagram — wrap it as {"page": {"blocks": [ {...} ]}} to hold tabs'};
  else return {error: 'no page to add tabs to'};
  var key = page.blocks ? 'blocks' : 'sections';
  if (!jsonLocate(text, base.concat([key])))
    return {error: 'could not find the ' + key + ' list in the editor text'};
  var r = jsonInsertMember(text, base.concat([key]), null, BUILDER_TABS_TEMPLATE);
  if (!r) return {error: 'could not edit the ' + key + ' list in the editor text'};
  return {text: r.text, start: r.start, end: r.end, kind: 'tabs',
          block: (page[key] || []).length,
          index: specSectionPaths(raw).length};
}

function planAddTab(text, raw, blockIdx, afterIdx){
  /* insert a renderable tab (one starter section) directly after the
     tab the operator is looking at */
  var path = builderTabPath(raw, blockIdx, afterIdx);
  if (!path) return {error: 'tab not found — reselect and try again'};
  var tabsPath = path.slice(0, -1);
  var r = jsonInsertArrayItemAfter(text, tabsPath, afterIdx, BUILDER_TAB_TEMPLATE);
  if (!r) return {error: 'could not edit the tabs list in the editor text'};
  return builderDocumentDetailResult({text:r.text,start:r.start,end:r.end,kind:'tab',
    block:blockIdx,index:afterIdx+1},raw,builderSectionListMap(tabsPath,afterIdx+1,1));
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
  return builderDocumentDetailResult(r,raw,builderSectionListMap(tabsPath,tabIdx,-1));
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
  return builderDocumentDetailResult(r,raw,builderSectionSwapMap(tabsPath,tabIdx,to));
}

/* move a section one slot within ITS OWN list (the top-level blocks list,
   or its tab's sections list). A neighbor blocks-list entry may be a tabs
   container — the move hops over it whole. Returns newPath (the section's
   list slot after the move); the caller recomputes the flat ordinal from
   it, because hopping a tabs container shifts ordinals by its section
   count. */
function planMoveSection(text, raw, sectionIdx, delta){
  var rec = specSectionPaths(raw)[sectionIdx];
  if (!rec) return {error: 'section not found — reselect and try again'};
  var spath = rec.section;
  if (!spath.length) return {error: 'a bare-diagram page has only one section'};
  var listPath = spath.slice(0, -1);
  var idx = spath[spath.length - 1];
  var list = specValueAt(raw, listPath);
  if (!Array.isArray(list)) return {error: 'section list not found in the editor text'};
  var to = idx + delta;
  if (to < 0) return {error: 'already first in its list'};
  if (to >= list.length) return {error: 'already last in its list'};
  var swap = jsonSwapListItems(text, listPath, idx, to);
  if (!swap) return {error: 'could not locate both sections in the editor text'};
  var span = delta < 0 ? swap.first : swap.second;
  return builderDocumentDetailResult({text:swap.text,start:span.start,end:span.end,
    kind:'section',newPath:listPath.concat([to])},raw,builderSectionSwapMap(listPath,idx,to));
}

/* Repoint local detail declarations after section identity/order changes.
   Only the affected detail values are rewritten; all other source bytes stay
   intact. Removed targets lose their detail action in this same transaction. */
function builderSectionListMap(listPath,index,delta){
  return function(path){
    var next=path.slice();
    if(JSON.stringify(path.slice(0,listPath.length))!==JSON.stringify(listPath))return next;
    var slot=path[listPath.length];
    if(delta<0 && slot===index)return null;
    if(slot>=index)next[listPath.length]=slot+delta;
    return next;
  };
}
function builderSectionSwapMap(listPath,a,b){
  return function(path){
    var next=path.slice();
    if(JSON.stringify(path.slice(0,listPath.length))===JSON.stringify(listPath)){
      if(next[listPath.length]===a)next[listPath.length]=b;
      else if(next[listPath.length]===b)next[listPath.length]=a;
    }
    return next;
  };
}
function builderDocumentDetailResult(plan,raw,mapPath,copies){
  if(plan.error)return plan;
  var records=builderDetailRecords(raw),nextRaw=JSON.parse(plan.text),nextRecords=builderDetailRecords(nextRaw),out=plan.text,error=null;
  mapPath=mapPath || function(path){return path;};
  function updateOwner(record,ownerPath){
    if(!ownerPath || error)return;
    var nextOwner=nextRecords.find(function(rec){return JSON.stringify(rec.path)===JSON.stringify(ownerPath);});
    if(!nextOwner)return;
    var d=specValueAt(raw,record.diagram);
    Object.keys(d && d.nodes || {}).forEach(function(id){
      var detail=d.nodes[id] && d.nodes[id].detail,index=builderDetailIndex(records,detail);
      if(index<0 || error)return;
      var targetPath=mapPath(records[index].path),target=targetPath && nextRecords.find(function(rec){return JSON.stringify(rec.path)===JSON.stringify(targetPath);});
      if(target && String(detail.section)===target.reference)return;
      var copy=target?builderClone(detail):null;
      if(copy)copy.section=target.reference;
      var changed=jsonSetField(out,nextOwner.diagram.concat(['nodes',id]),'detail',copy?JSON.stringify(copy,null,2):null);
      if(!changed){error={error:'could not update a detail reference'};return;}
      out=changed.text;
    });
  }
  records.forEach(function(record){updateOwner(record,mapPath(record.path));});
  (copies || []).forEach(function(copy){
    var original=records.find(function(record){return JSON.stringify(record.path)===JSON.stringify(copy.from);});
    if(original)updateOwner(original,copy.to);
  });
  if(error)return error;
  if(out===plan.text)return plan;
  plan.text=out;
  var landing=plan.newPath || (plan.kind==='section' && nextRecords[plan.index] && nextRecords[plan.index].path);
  if(plan.kind==='tab')landing=builderTabPath(nextRaw,plan.block,plan.index);
  var range=landing && jsonLocate(out,landing);
  if(range){plan.start=range.start;plan.end=range.end;}
  else {delete plan.start;delete plan.end;}
  return plan;
}
function planSetSectionIdentity(text,raw,sectionIdx,key,value){
  var rec=specSectionPaths(raw)[sectionIdx];
  if(!rec || !rec.section.length)return {error:'Select a section in a page first.'};
  if(key!=='id' && key!=='heading')return {error:'Unknown section identity field.'};
  if(key==='id' && value!=null){
    if(typeof value!=='string' || !/^[a-zA-Z][\w.-]*$/.test(value))return {error:'Section IDs start with a letter and use letters, digits, _, . or -.'};
    if(builderDetailRecords(raw).some(function(record,i){return i!==sectionIdx && (record.reference===value || record.aliases.indexOf(value)>=0);}))return {error:'That section ID is already in use.'};
  }
  var plan=builderDocumentDetailResult(planSetField(text,raw,rec.section,key,value==null?null:JSON.stringify(value)),raw);
  if(plan.error)return plan;
  var errors=[];validateDetails(normalize(JSON.parse(plan.text)),errors,[]);
  return errors.length?{error:errors.join('\n')}:plan;
}
function planSetNodeHandoff(text,raw,sectionIdx,nodeId,handoff){
  var path=builderTargetPath(raw,{kind:'node',section:sectionIdx,id:nodeId}),node=path && specValueAt(raw,path);
  if(!node)return {error:'node not found — reselect and try again'};
  if(handoff!=null){
    if(node.detail!=null)return {error:'Remove the existing domain detail before applying a diagram handoff.'};
    var errors=[];validateHandoff(handoff,node,'node '+nodeId+'.handoff',errors);
    if(errors.length)return {error:errors.join('\n')};
  }
  return planSetField(text,raw,path,'handoff',handoff==null?null:JSON.stringify(handoff,null,2));
}
function planCreateNodeDetail(text,raw,sectionIdx,nodeId){
  var got=builderDiagram(text,raw,sectionIdx);
  if(got.error)return got;
  var node=got.d.nodes && got.d.nodes[nodeId];
  if(!node)return {error:'Select a node first.'};
  if(node.detail)return {error:'Remove the existing detail before creating a new flow.'};
  if(node.handoff!=null)return {error:'Remove the existing diagram handoff before creating a detail flow.'};
  var page=raw && raw.page || raw,base=raw && raw.page?['page']:[];
  if(!page || (!page.blocks && !page.sections))return {error:'Wrap this bare diagram in a page with sections before creating a detail flow.'};
  var listPath=base.concat([page.blocks?'blocks':'sections']),taken=Object.create(null);
  builderDetailRecords(raw).forEach(function(record){taken[record.reference]=true;record.aliases.forEach(function(alias){taken[alias]=true;});});
  var stem=String(nodeId).replace(/[^a-zA-Z0-9_.-]/g,'-');
  if(!/^[a-zA-Z]/.test(stem))stem='node-'+stem;
  stem+='-detail';
  var id=taken[stem]?builderUniqueKey(taken,stem+'-'):stem;
  var section={id:id,heading:(node.title || nodeId)+' detail',detailOnly:true,accent:'cyan',diagram:{
    nodes:{start:{title:'Start',sub:'Describe the first internal responsibility',icon:'gear',tint:'cmd'}},
    rows:[['start']],edges:[],steps:[{id:'start',text:'Describe what happens inside '+(node.title || nodeId),nodes:['start']}]}};
  var added=jsonInsertMember(text,listPath,null,JSON.stringify(section,null,2));
  if(!added)return {error:'could not create the detail section'};
  var assigned=planSetNodeDetail(added.text,JSON.parse(added.text),sectionIdx,nodeId,{section:id,mode:'focus'});
  if(assigned.error)return assigned;
  var index=specSectionPaths(raw).length,newPath=specSectionPaths(JSON.parse(assigned.text))[index].section;
  var range=jsonLocate(assigned.text,newPath);
  return {text:assigned.text,start:range.start,end:range.end,kind:'section',index:index,sectionId:id};
}

/* Extract an ordinary linear flow without changing authored node identities.
   Cases needing per-edge boundary ports or independent panel/path ownership
   are refused before either source splice is published. */
function planExtractNodeDetail(text,raw,sectionIdx,ids,title){
  var got=builderDiagram(text,raw,sectionIdx);
  if(got.error)return got;
  var d=builderClone(got.d),selected=new Set(Array.isArray(ids)?ids:[]),page=raw && raw.page || raw,base=raw && raw.page?['page']:[];
  if(!Array.isArray(ids) || selected.size<2 || ids.some(function(id){return !Object.prototype.hasOwnProperty.call(d.nodes || {},id);}))
    return {error:'Choose at least two existing nodes in one section.'};
  ids=Array.from(selected);
  if(!page || (!page.blocks && !page.sections))return {error:'Wrap this bare diagram in a page with sections before extracting a domain.'};
  if(d.paths || d.layouts || d.sectionLayout || d.routing || d.centerpiece)
    return {error:'Domain extraction currently supports linear timelines with ordinary rows. Remove alternate paths, authored layouts, routing or centerpiece settings first.'};
  if((d.panels || []).length || (d.steps || []).some(function(step){return step.panels || step.patch || step.conditions;}))
    return {error:'Domain extraction cannot yet split panel patches or runtime conditions. Keep this flow together until those references can be assigned explicitly.'};
  if(ids.some(function(id){return d.nodes[id].detail;}))return {error:'Extract ordinary nodes first; nodes with existing details need explicit nested step mappings.'};
  var rowIds=builderFlatRowIds(d.rows);
  if(ids.some(function(id){return rowIds.indexOf(id)<0;}) || (d.floats || []).some(function(f){return selected.has(f.id);}))
    return {error:'Place every selected node in ordinary rows before extracting a domain; floated nodes are not supported yet.'};
  var records=builderDetailRecords(raw),incomingPort=false;
  records.forEach(function(record){
    var diagram=specValueAt(raw,record.diagram);
    Object.keys(diagram && diagram.nodes || {}).forEach(function(id){
      var detail=diagram.nodes[id].detail;
      if(builderDetailIndex(records,detail)===sectionIdx && detail.ports && Object.keys(detail.ports).some(function(k){return selected.has(detail.ports[k]);}))incomingPort=true;
    });
  });
  if(incomingPort)return {error:'Another detail uses a selected node as its boundary port. Reassign that port before extracting this domain.'};
  var ingress=new Set(),egress=new Set(),internal=new Set(),boundary=new Set(),touching=new Set(),edgeMap=Object.create(null);
  var taken=Object.create(null);Object.keys(d.nodes).forEach(function(id){taken[id]=true;});
  var domainId=builderUniqueKey(taken,'domain'),sectionId=domainId+'-detail',sectionTaken=Object.create(null);
  records.forEach(function(record){sectionTaken[record.reference]=true;record.aliases.forEach(function(alias){sectionTaken[alias]=true;});});
  if(sectionTaken[sectionId])sectionId=builderUniqueKey(sectionTaken,sectionId+'-');
  (d.edges || []).forEach(function(edge){
    var from=selected.has(edge.from),to=selected.has(edge.to),key=builderEdgeKey(edge);
    if(from && to)internal.add(key);
    else if(to){ingress.add(edge.to);boundary.add(key);}
    else if(from){egress.add(edge.from);boundary.add(key);}
    if(from || to)touching.add(key);
    edgeMap[key]=(from?domainId:edge.from)+'->'+(to?domainId:edge.to);
  });
  if(ingress.size>1 || egress.size>1)return {error:'These nodes have multiple different '+(ingress.size>1?'input':'output')+' boundary nodes. Extract a flow with one input and one output; per-edge boundary ports are not supported yet.'};
  if((d.edges || []).some(function(edge){return internal.has(builderEdgeKey(edge)) && (edge.revealAt!=null || edge.hideAt!=null);}))
    return {error:'Internal edges with revealAt/hideAt need timeline rebasing. Remove those edge windows before extracting this domain.'};
  if((d.steps || []).some(function(step){return Object.keys(step.failures || {}).some(function(key){return boundary.has(key);});}))
    return {error:'A step records a failure across this domain boundary. Keep the flow together until boundary failure mapping is supported.'};
  var child={nodes:Object.create(null),rows:[],edges:[],steps:[]},placed=false;
  ids.forEach(function(id){child.nodes[id]=d.nodes[id];delete d.nodes[id];});
  function rowsFor(rows,inside){
    return rows.map(function(row){return row.map(function(slot){
      var values=(Array.isArray(slot)?slot:[slot]).flatMap(function(id){
        if(inside)return selected.has(id)?[id]:[];
        if(!selected.has(id))return [id];
        if(placed)return [];placed=true;return [domainId];
      });
      return Array.isArray(slot)?(values.length===1?values[0]:values):(values[0] || null);
    }).filter(function(slot){return slot!=null && (!Array.isArray(slot) || slot.length);});}).filter(function(row){return row.length;});
  }
  child.rows=rowsFor(d.rows,true);d.rows=rowsFor(d.rows,false);
  child.edges=(d.edges || []).filter(function(edge){return internal.has(builderEdgeKey(edge));});
  d.edges=(d.edges || []).filter(function(edge){return !internal.has(builderEdgeKey(edge));}).map(function(edge){
    if(selected.has(edge.from))edge.from=domainId;if(selected.has(edge.to))edge.to=domainId;return edge;
  });
  var groups=Object.create(null);
  function copyGroup(id){if(!id || groups[id] || !d.groups || !Object.prototype.hasOwnProperty.call(d.groups,id))return;groups[id]=builderClone(d.groups[id]);copyGroup(groups[id].parent);}
  ids.forEach(function(id){copyGroup(child.nodes[id].group);});if(Object.keys(groups).length)child.groups=groups;
  var stepIds=Object.create(null),stepMap=Object.create(null);
  var invalidStepIds=(d.steps || []).some(function(step){
    if(step.id==null || step.id==='')return false;
    if(typeof step.id!=='string' || stepIds[step.id])return true;
    stepIds[step.id]=true;return false;
  });
  if(invalidStepIds)return {error:'Give each existing step a unique string ID before extracting a domain.'};
  function putHops(step,hops){delete step.edge;delete step.edges;if(hops.length===1)step.edge=hops[0];else if(hops.length)step.edges=hops;}
  function putMap(step,key,value){if(Object.keys(value).length)step[key]=value;else delete step[key];}
  (d.steps || []).forEach(function(step){
    var hops=stepKeys(step),failures=step.failures || {},tones=step.tone || {},packets=step.packets || [];
    var affected=hops.some(function(key){return touching.has(key);}) || Object.keys(failures).some(function(key){return touching.has(key);}) ||
      (step.nodes || []).some(function(id){return selected.has(id);}) || Object.keys(tones).some(function(id){return selected.has(id);}) || packets.some(function(packet){return touching.has(packet.edge);});
    if(!affected)return;
    if(!step.id){step.id=builderUniqueKey(stepIds,'step-');stepIds[step.id]=true;}
    var inner=builderClone(step);stepMap[step.id]={step:inner.id};
    putHops(inner,hops.filter(function(key){return internal.has(key);}));
    putHops(step,hops.filter(function(key){return !internal.has(key);}).map(function(key){return edgeMap[key] || key;}));
    var innerNodes=(inner.nodes || []).filter(function(id){return selected.has(id);});
    hops.filter(function(key){return boundary.has(key);}).forEach(function(key){key.split('->').forEach(function(id){if(selected.has(id) && innerNodes.indexOf(id)<0)innerNodes.push(id);});});
    if(innerNodes.length)inner.nodes=innerNodes;else delete inner.nodes;
    step.nodes=(step.nodes || []).filter(function(id){return !selected.has(id);});if(step.nodes.indexOf(domainId)<0)step.nodes.push(domainId);
    var insideFailure=Object.create(null),outsideFailure=Object.create(null),insideTone=Object.create(null),outsideTone=Object.create(null);
    Object.keys(failures).forEach(function(key){if(internal.has(key))insideFailure[key]=failures[key];else outsideFailure[edgeMap[key] || key]=failures[key];});
    Object.keys(tones).forEach(function(id){if(selected.has(id))insideTone[id]=tones[id];else outsideTone[id]=tones[id];});
    putMap(inner,'failures',insideFailure);putMap(step,'failures',outsideFailure);putMap(inner,'tone',insideTone);putMap(step,'tone',outsideTone);
    if(step.packets){
      inner.packets=packets.filter(function(packet){return internal.has(packet.edge);});
      step.packets=packets.filter(function(packet){return !internal.has(packet.edge);}).map(function(packet){return Object.assign({},packet,{edge:edgeMap[packet.edge] || packet.edge});});
      if(!inner.packets.length)delete inner.packets;if(!step.packets.length)delete step.packets;
    }
    child.steps.push(inner);
  });
  var detail={section:sectionId,mode:'focus'};
  if(Object.keys(stepMap).length)detail.stepMap=stepMap;
  d.nodes[domainId]={title:typeof title==='string' && title.trim() || 'New domain',icon:'package',tint:'cmd',detail:detail};
  var group=child.nodes[ids[0]].group;
  if(group && ids.every(function(id){return child.nodes[id].group===group;}))d.nodes[domainId].group=group;
  var section={id:sectionId,heading:d.nodes[domainId].title+' detail',detailOnly:true,accent:'cyan',diagram:child};
  var rewritten=jsonReplaceValue(text,got.path,JSON.stringify(d,null,2));
  if(!rewritten)return {error:'could not rewrite the parent flow'};
  var added=jsonInsertMember(rewritten.text,base.concat([page.blocks?'blocks':'sections']),null,JSON.stringify(section,null,2));
  if(!added)return {error:'could not add the extracted detail section'};
  var errors=[];validateDetails(normalize(JSON.parse(added.text)),errors,[]);if(errors.length)return {error:errors.join('\n')};
  var range=jsonLocate(added.text,got.path.concat(['nodes',domainId]));
  return {text:added.text,start:range.start,end:range.end,kind:'node',id:domainId,section:sectionIdx,detailSection:records.length,sectionId:sectionId};
}
