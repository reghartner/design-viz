/* Pure reference insertion. Validate the complete candidate against an approved
   authored snapshot; placement edits stay in the consumer. */
function topologyNamespace(diagram,stem){
  stem=String(stem || 'child').replace(/[^a-zA-Z0-9_.-]/g,'-').replace(/^[^a-zA-Z0-9]+/,'') || 'child';
  function taken(name){return (diagram.topologyImports || []).some(function(imp){return imp.as===name;}) ||
    Object.keys(diagram.nodes || {}).concat(Object.keys(diagram.groups || {})).some(function(id){return id.startsWith(name+'::');});}
  var name=stem,n=2;while(taken(name))name=stem+'-'+n++;return name;
}
function planAddTopologyImport(text,raw,section,reference,context){
  var got=builderDiagram(text,raw,section);if(got.error)return got;
  if(!context)return {error:'Open a Canon v3 authored-source session before adding referenced topology.'};
  if(!reference || typeof reference!=='object' || Array.isArray(reference))return {error:'A topology reference must be an object.'};
  if(got.d.topologyImports!=null && !Array.isArray(got.d.topologyImports))return {error:'topologyImports must be an array.'};
  var parsed;try{parsed=JSON.parse(text);}catch(ex){return {error:'The source is not valid JSON.'};}
  if(JSON.stringify(parsed)!==JSON.stringify(raw))return {error:'The source changed. Reopen the picker.'};
  var imports=(got.d.topologyImports || []).concat([builderClone(reference)]);
  var plan=planSetField(text,raw,got.path,'topologyImports',JSON.stringify(imports,null,2));
  if(plan.error)return plan;
  try{
    plan.text=normalizeWorkbenchAgentPlacement(text,plan.text,context);
    var resolved=FlowTopology.resolveSource(JSON.parse(plan.text),context);
    var diagram=specValueAt(resolved,specSectionPaths(resolved)[section].diagram);
    var provenance=diagram.topologyProvenance.imports.find(function(imp){return imp.as===reference.as;});
    plan.kind='node';plan.id=provenance.nodes[0];plan.section=section;
  }catch(ex){return {error:ex.message};}
  return plan;
}

function topologyImportRemovalBlockers(diagram,provenance){
  var nodes=new Set(provenance.nodes || []),edges=new Set(provenance.edges || []),groups=[];
  function add(group,value){if(groups.indexOf(group)<0)groups.push(group);if(group.items.indexOf(value)<0)group.items.push(value);}
  function bucket(label){var found=groups.find(function(group){return group.label===label;});if(found)return found;found={label:label,items:[]};groups.push(found);return found;}
  (diagram.edges || []).forEach(function(edge,index){
    if(edge && (nodes.has(edge.from) || nodes.has(edge.to)))add(bucket('Consumer connections'),(edge.from || '?')+'->'+(edge.to || '?')+' (edge '+(index+1)+')');
  });
  Object.keys(diagram.nodes || {}).forEach(function(id){
    var node=diagram.nodes[id];if(node && (provenance.groups || []).includes(node.group))add(bucket('Group references'),id+' → '+node.group);
  });
  Object.keys(diagram.groups || {}).forEach(function(id){
    var group=diagram.groups[id];if(group && (provenance.groups || []).includes(group.parent))add(bucket('Group references'),id+' → '+group.parent);
  });
  (diagram.steps || []).forEach(function(step,index){
    if(!step || typeof step!=='object')return;
    var name=step.id || 'step '+(index+1);
    stepKeys(step).forEach(function(key){if(edges.has(key))add(bucket('Story connection references'),name+' → '+key);});
    Object.keys(stepFailures(step)).forEach(function(key){if(edges.has(key))add(bucket('Failure references'),name+' → '+key);});
    (step.packets || []).forEach(function(packet){if(packet && edges.has(packet.edge))add(bucket('Packet references'),name+' → '+packet.edge);});
    stepNodes(step).forEach(function(id){if(nodes.has(id))add(bucket('Step node references'),name+' → '+id);});
    Object.keys(stepTonePatch(step) || {}).forEach(function(id){if(nodes.has(id))add(bucket('Tone patches'),name+' → '+id);});
    (step.conditions || []).forEach(function(condition){if(condition && nodes.has(condition.nodeId))add(bucket('Conditions'),name+' → '+condition.nodeId);});
    if(step.traceMatch && nodes.has(step.traceMatch.nodeId))add(bucket('Trace matches'),name+' → '+step.traceMatch.nodeId);
  });
  Object.keys(diagram.topologyExports || {}).forEach(function(name){
    var exp=diagram.topologyExports[name] || {};
    (exp.nodes || []).forEach(function(id){if(nodes.has(id))add(bucket('Shared topology exports'),name+' → node '+id);});
    (exp.edges || []).forEach(function(key){if(edges.has(key))add(bucket('Shared topology exports'),name+' → connection '+key);});
  });
  (diagram.panels || []).forEach(function(panel,index){
    if(typeof panelRemapReferences!=='function')return;
    panelRemapReferences(builderClone(panel),'nodes',null,function(id){
      if(nodes.has(id))add(bucket('Panel references'),(panel.id || 'panel '+(index+1))+' → '+id);
      return true;
    });
  });
  return groups;
}
function planRemoveTopologyImport(text,raw,section,namespace,context){
  var got=builderDiagram(text,raw,section);if(got.error)return got;
  if(!context)return {error:'Reconnect this draft to its frozen repository catalog before removing referenced topology.'};
  if(!Array.isArray(got.d.topologyImports))return {error:'Authored topology import not found.'};
  var matches=[];got.d.topologyImports.forEach(function(imp,index){if(imp && imp.as===namespace)matches.push(index);});
  if(matches.length!==1)return {error:'Choose one uniquely named topology import.'};
  var resolved,record,provenance;
  try{
    resolved=FlowTopology.resolveSource(raw,context);record=specSectionPaths(resolved)[section];
    var diagram=record && specValueAt(resolved,record.diagram);
    provenance=diagram && diagram.topologyProvenance && diagram.topologyProvenance.imports.find(function(imp){return imp.as===namespace;});
    if(!provenance)return {error:'The referenced block is not present in the rendered repository snapshot. Render and reselect it.'};
  }catch(ex){return {error:ex.message};}
  var blockers=topologyImportRemovalBlockers(got.d,provenance);
  if(blockers.length)return {error:'Cannot remove referenced topology '+namespace+' while this diagram still uses it:\n'+blockers.map(function(group){return group.label+':\n  • '+group.items.join('\n  • ');}).join('\n'),blockers:blockers};
  var imports=got.d.topologyImports.filter(function(_,index){return index!==matches[0];});
  var plan=planSetField(text,raw,got.path,'topologyImports',imports.length?JSON.stringify(imports,null,2):null);
  if(plan.error)return plan;
  try{FlowTopology.resolveSource(JSON.parse(plan.text),context);}catch(ex){return {error:ex.message};}
  plan.kind='section';plan.section=section;plan.namespace=namespace;return plan;
}

/* Export authoring and the Inspector share this headless boundary. Edge keys
   are stable rendered identities; an optional index must still identify that
   same connection. The only persisted field is diagram.topologyExports. */
function topologyExportSelection(text,raw,targets,context){
  var parsed;try{parsed=JSON.parse(text);}catch(ex){return {error:'The source is not valid JSON.'};}
  if(JSON.stringify(parsed)!==JSON.stringify(raw))return {error:'The source changed. Reselect the topology.'};
  if(!Array.isArray(targets) || targets.length<2)return {error:'Select at least two nodes or connections to author an export.'};
  if(targets.some(function(t){return !t || typeof t!=='object';}))return {error:'Choose valid topology identities.'};
  var section=targets[0].section;
  if(targets.some(function(t){return t.section!==section || (t.kind!=='node' && t.kind!=='edge');}))
    return {error:'Choose nodes and connections from one diagram section.'};
  var got=builderDiagram(text,raw,section);if(got.error)return got;
  var resolved;
  try{resolved=FlowTopology.resolveSource(raw,context);}catch(ex){return {error:ex.message};}
  var d=specValueAt(resolved,got.path),nodes=[],edges=[],error;
  if(d.edges!=null && (!Array.isArray(d.edges) || d.edges.some(function(e){return !e || typeof e.from!=='string' || typeof e.to!=='string';})))
    return {error:'Connections must be an array of objects with from/to node identities.'};
  targets.forEach(function(t){
    if(t.kind==='node'){
      if(!Object.prototype.hasOwnProperty.call(d.nodes || {},t.id))error='Selected node no longer exists: '+t.id;
      if(nodes.indexOf(t.id)>=0)error='Select unique topology identities.';
      nodes.push(t.id);
    }else{
      var edge=Number.isInteger(t.index)?(d.edges || [])[t.index]:null;
      var key=t.key || (edge && builderEdgeKey(edge));
      var matches=(d.edges || []).filter(function(e){return builderEdgeKey(e)===key;});
      if(!key || matches.length!==1 || (t.index!=null && (!edge || builderEdgeKey(edge)!==key)))error='Selected connection no longer exists or is ambiguous: '+(key || t.index);
      if(edges.indexOf(key)>=0)error='Select unique topology identities.';
      edges.push(key);
    }
  });
  if(error)return {error:error};
  if(!nodes.length)return {error:'An export requires at least one selected node.'};
  return {section:section,path:got.path,diagram:got.d,resolved:d,nodes:nodes,edges:edges};
}
function planTopologyExport(text,raw,targets,options,context){
  options=options || {};
  var selected=topologyExportSelection(text,raw,targets,context);if(selected.error)return selected;
  var action=options.action || 'create',name=options.name,existing=options.existingName;
  if(['create','update','remove'].indexOf(action)<0)return {error:'Unknown export action.'};
  var exports=selected.diagram.topologyExports || {};
  if(action!=='create' && !Object.prototype.hasOwnProperty.call(exports,existing))return {error:'The chosen export no longer exists.'};
  if(action!=='remove'){
    var missing=selected.edges.find(function(key){var e=selected.resolved.edges.find(function(e){return builderEdgeKey(e)===key;});return selected.nodes.indexOf(e.from)<0 || selected.nodes.indexOf(e.to)<0;});
    if(missing)return {error:'Selected connection '+missing+' requires both endpoint nodes selected.'};
  }
  if(action!=='remove' && (typeof name!=='string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(name)))
    return {error:'Export names start with a letter or digit and use only letters, digits, dots, dashes, and underscores.'};
  if(action!=='remove'){
    var collision=specSectionPaths(raw).some(function(rec){
      var d=specValueAt(raw,rec.diagram);
      return d && Object.prototype.hasOwnProperty.call(d.topologyExports || {},name) && !(action==='update' && d===selected.diagram && existing===name);
    });
    if(collision)return {error:'Export name already exists in this provider: '+name};
  }
  var next=builderClone(exports);
  if(action!=='create')delete next[existing];
  if(action!=='remove')Object.defineProperty(next,name,{value:{nodes:selected.nodes,edges:selected.edges},enumerable:true,configurable:true,writable:true});
  var plan=planSetField(text,raw,selected.path,'topologyExports',Object.keys(next).length?JSON.stringify(next,null,2):null);
  if(plan.error)return plan;
  try{FlowTopology.resolveSource(JSON.parse(plan.text),context);}catch(ex){return {error:ex.message};}
  return plan;
}

/* Local overlays address resolved identities, never rendered array offsets in
   authored JSON. Validate both the existing frozen view and the full candidate. */
function topologyLocalTarget(text,raw,section,kind,id,context){
  var parsed;try{parsed=JSON.parse(text);}catch(ex){return {error:'The source is not valid JSON.'};}
  if(JSON.stringify(parsed)!==JSON.stringify(raw))return {error:'The source changed. Render and reselect.'};
  var got=builderDiagram(text,raw,section);if(got.error)return got;
  var resolved;try{resolved=FlowTopology.resolveSource(raw,context);}catch(ex){return {error:ex.message};}
  var rec=specSectionPaths(resolved)[section],d=rec && specValueAt(resolved,rec.diagram);
  if(!d)return {error:'Diagram not found.'};
  var owner=FlowTopology.origin(d,kind,id),imports=got.d.topologyImports || [];
  var index=owner?imports.findIndex(function(imp){return imp.as===owner.as;}):-1;
  if(owner && index<0)return {error:'Open the authored consumer with its providers to edit imported layout.'};
  return {got:got,diagram:d,owner:owner,index:index,relative:owner?id.split('->').map(function(part){return part.slice(owner.as.length+2);}).join('->'):id};
}
function topologyLocalPlan(text,raw,target,field,id,value,context){
  var imp=target.got.d.topologyImports[target.index],map=builderClone(imp[field] || {});
  if(value===null)delete map[id];else Object.defineProperty(map,id,{value:value,enumerable:true,writable:true,configurable:true});
  var plan=planSetField(text,raw,target.got.path.concat(['topologyImports',target.index]),field,Object.keys(map).length?JSON.stringify(map):null);
  if(plan.error)return plan;
  try{FlowTopology.resolveSource(JSON.parse(plan.text),context);}catch(ex){return {error:ex.message};}
  return plan;
}
function planTopologyNodeOverride(text,raw,section,id,patch,context){
  var t=topologyLocalTarget(text,raw,section,'nodes',id,context);if(t.error)return t;
  if(!t.owner)return {error:'Choose a node in an authored topology import.'};
  if(patch===null)return topologyLocalPlan(text,raw,t,'nodeOverrides',t.relative,null,context);
  try{FlowTopology.validateNodeOverride(patch,'node presentation');}catch(ex){return {error:ex.message};}
  var previous=(t.got.d.topologyImports[t.index].nodeOverrides || {})[t.relative] || {};
  return topologyLocalPlan(text,raw,t,'nodeOverrides',t.relative,Object.assign({},previous,patch),context);
}
function planTopologyNodeCodeRefs(text,raw,section,id,refs,context){
  var t=topologyLocalTarget(text,raw,section,'nodes',id,context);if(t.error)return t;
  if(!t.owner)return {error:'Choose a node in an authored topology import.'};
  if(!Array.isArray(refs))return {error:'Additional code references must be a JSON array.'};
  return topologyLocalPlan(text,raw,t,'nodeCodeRefs',t.relative,refs.length?refs:null,context);
}
/* Tickets and PRs belong to the consumer; provider tracking is always inherited.
   Keep this map separate from presentation/geometry so resets cannot erase work. */
function topologyTrackingTarget(text,raw,section,kind,id,context,index){
  if(kind!=='node' && kind!=='edge')return {error:'Choose an imported node or connection.'};
  var t=kind==='edge'?builderEdgeLayoutTarget(text,raw,section,index,id,context):topologyLocalTarget(text,raw,section,'nodes',id,context);
  if(t.error)return t;
  if(!t.owner)return {error:'Choose a node or connection in an authored topology import.'};
  t.field=kind==='node'?'nodeTracking':'edgeTracking';
  var local=(t.got.d.topologyImports[t.index][t.field] || {})[t.relative];
  t.local=trackingStoredRefs(local);if(local && local.missingWork===true)t.local.missingWork=true;if(local && local.existsWhen==='tickets-done')t.local.existsWhen=local.existsWhen;
  // Resolve without this consumer addition to distinguish inherited duplicates
  // even when a refreshed provider now carries a formerly local reference.
  var base=builderClone(raw),imp=specValueAt(base,t.got.path).topologyImports[t.index];
  if(imp[t.field])delete imp[t.field][t.relative];
  try{
    var resolved=FlowTopology.resolveSource(base,context),d=specValueAt(resolved,t.got.path);
    var inherited=kind==='node'?d.nodes[id]:d.edges.find(function(edge){return builderEdgeKey(edge)===id;});
    t.inherited=trackingRefs(inherited);if(inherited.missingWork===true)t.inherited.missingWork=true;if(inherited.existsWhen==='tickets-done')t.inherited.existsWhen=inherited.existsWhen;
  }catch(ex){return {error:ex.message};}
  return t;
}
function planTopologyTracking(text,raw,section,kind,id,field,ref,remove,context,index){
  if(field!=='tickets' && field!=='prs' && field!=='existsWhen' && field!=='missingWork')return {error:'Choose tickets, pull requests, availability or Missing work.'};
  if(field==='missingWork'){
    var marker=topologyTrackingTarget(text,raw,section,kind,id,context,index);if(marker.error)return marker;
    if(marker.inherited.missingWork)return {error:'Missing work is inherited from the provider.'};
    if(!remove && ref!==true)return {error:'missingWork must be true.'};
    if(remove)delete marker.local.missingWork;else marker.local.missingWork=true;
    return topologyTrackingPlan(text,raw,marker,context);
  }
  if(field==='existsWhen'){
    var target=topologyTrackingTarget(text,raw,section,kind,id,context,index);if(target.error)return target;
    if(target.inherited.existsWhen)return {error:'Availability is inherited from the provider.'};
    if(!remove && ref!=='tickets-done')return {error:'existsWhen must be tickets-done.'};
    if(remove)delete target.local.existsWhen;else target.local.existsWhen=ref;
    return topologyTrackingPlan(text,raw,target,context);
  }
  var annotation={};annotation[field]=[ref];
  try{FlowTopology.validateTracking(annotation,'tracking');}catch(ex){return {error:ex.message};}
  var identity=trackingRefs(annotation)[field][0];
  ref=trackingStoredRefs(annotation)[field][0];
  var t=topologyTrackingTarget(text,raw,section,kind,id,context,index);if(t.error)return t;
  var refs=t.local[field],at=trackingRefs(t.local)[field].indexOf(identity);
  if(remove){if(at<0)return {text:text};refs.splice(at,1);}
  else {if(at>=0 || t.inherited[field].indexOf(identity)>=0)return {text:text};refs.push(ref);}
  return topologyTrackingPlan(text,raw,t,context);
}
function topologyTrackingPlan(text,raw,t,context){
  var value={};['tickets','prs'].forEach(function(key){if(t.local[key].length)value[key]=t.local[key];});
  if(t.local.missingWork)value.missingWork=true;
  if(t.local.existsWhen)value.existsWhen=t.local.existsWhen;
  return topologyLocalPlan(text,raw,t,t.field,t.relative,Object.keys(value).length?value:null,context);
}
function builderEdgeLayoutTarget(text,raw,section,index,key,context){
  var got=builderDiagram(text,raw,section);if(got.error)return got;
  var resolved;try{resolved=FlowTopology.resolveSource(raw,context);}catch(ex){return {error:ex.message};}
  var rec=specSectionPaths(resolved)[section],d=rec && specValueAt(resolved,rec.diagram),edge=d && (d.edges || [])[index];
  if(!edge || key && builderEdgeKey(edge)!==key)return {error:'The connection changed. Render and select it again.'};
  key=builderEdgeKey(edge);
  if(FlowTopology.origin(d,'edges',key) && d.edges.filter(function(e){return builderEdgeKey(e)===key;}).length!==1)return {error:'Connection identity is ambiguous.'};
  var t=topologyLocalTarget(text,raw,section,'edges',key,context);if(t.error)return t;
  t.edge=edge;t.key=key;t.localIndex=(got.d.edges || [])[index] && builderEdgeKey(got.d.edges[index])===key?index:(got.d.edges || []).findIndex(function(e){return builderEdgeKey(e)===key;});return t;
}
function planEdgeLayout(text,raw,section,index,key,patch,context){
  var t=builderEdgeLayoutTarget(text,raw,section,index,key,context);if(t.error)return t;
  try{FlowTopology.validateEdgeOverride(patch,'edge layout');}catch(ex){return {error:ex.message};}
  if(t.owner){
    var previous=(t.got.d.topologyImports[t.index].edgeOverrides || {})[t.relative] || {};
    return topologyLocalPlan(text,raw,t,'edgeOverrides',t.relative,Object.assign({},previous,patch),context);
  }
  if(t.localIndex<0)return {error:'Authored connection not found.'};
  return planSetFields(text,raw,t.got.path.concat(['edges',t.localIndex]),Object.keys(patch).map(function(field){return [field,patch[field]===null?null:JSON.stringify(patch[field])];}));
}
function planResetTopologyEdgeLayout(text,raw,section,index,key,context){
  var t=builderEdgeLayoutTarget(text,raw,section,index,key,context);if(t.error)return t;
  if(!t.owner)return {error:'Choose an imported connection.'};
  var previous=(t.got.d.topologyImports[t.index].edgeOverrides || {})[t.relative] || {};
  var retained=Object.prototype.hasOwnProperty.call(previous,'label')?{label:previous.label}:null;
  return topologyLocalPlan(text,raw,t,'edgeOverrides',t.relative,retained,context);
}

function planResetTopologyEdgeLabel(text,raw,section,index,key,context){
  var t=builderEdgeLayoutTarget(text,raw,section,index,key,context);if(t.error)return t;
  if(!t.owner)return {error:'Choose an imported connection.'};
  var previous=builderClone((t.got.d.topologyImports[t.index].edgeOverrides || {})[t.relative] || {});
  delete previous.label;
  return topologyLocalPlan(text,raw,t,'edgeOverrides',t.relative,Object.keys(previous).length?previous:null,context);
}
