/* Pure reference insertion. Validate the complete candidate against an approved
   authored snapshot; only the consumer import array is edited. */
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
