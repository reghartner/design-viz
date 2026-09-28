/* Bounded authored edits. Plan the complete transaction before touching history.
   IDs refer to authored identities, never transient renderer indices. */
function workbenchAgentByteLength(value){return new TextEncoder().encode(value).length;}
function planWorkbenchAgentOperations(source,operations){
  function object(value){return value && typeof value==='object' && !Array.isArray(value);}
  function own(value,key){return value!=null && Object.prototype.hasOwnProperty.call(value,key);}
  function safe(value,depth){
    if(depth>40)throw Error('Operation nesting exceeds 40 levels.');
    if(value && typeof value==='object')Object.keys(value).forEach(function(key){
      if(['__proto__','prototype','constructor'].includes(key))throw Error('Unsafe operation key: '+key);
      safe(value[key],depth+1);
    });
  }
  function id(value,label){if(typeof value!=='string' || !value.trim() || value.length>180)throw Error('A stable '+label+' is required.');return value;}
  function unique(list,key,label){var hits=(list || []).filter(function(item){return item && item.id===key;});if(hits.length!==1)throw Error(label+' must identify exactly one existing item: '+key);return hits[0];}
  function patch(target,value){if(!object(value) || !object(target))throw Error('Patch and target must be objects.');Object.keys(value).forEach(function(key){if(key==='id')throw Error('Patches cannot change an identity.');target[key]=value[key];});}
  // Viewer validation intentionally tolerates some legacy mistakes. A semantic
  // transaction must not report success for references the viewer will skip, or
  // choose one of several authored identities. Section IDs remain unique across
  // the story; reference checks stay within touched sections, so unrelated
  // presentation warnings remain intact.
  function semanticTargets(raw,changed){
    var records=specSectionPaths(raw),sectionIds=new Set(),resolved=new Set();
    function reference(value,ids,label){
      if(typeof value!=='string' || !value.trim() || ids.get(value)!==1)throw Error(label+' must name one existing target: '+String(value));
    }
    function identities(list,label,optional){
      var ids=new Map();
      if(list!=null && !Array.isArray(list))throw Error(label+' declarations must be an array.');
      (list || []).forEach(function(item){
        if(!object(item))throw Error(label+' must be an object.');
        if(optional && item.id==null)return;
        if(typeof item.id!=='string' || !item.id.trim())throw Error('A stable '+label+' ID is required.');
        if(ids.has(item.id))throw Error('Ambiguous '+label+' ID: '+item.id);ids.set(item.id,1);
      });
      return ids;
    }
    records.forEach(function(record){
      var section=specValueAt(raw,record.section),sectionId=record.section.length?section && section.id:'$root';
      if(record.section.length && sectionId!=null){
        if(typeof sectionId!=='string' || !sectionId.trim() || sectionIds.has(sectionId))throw Error('Ambiguous or invalid section ID: '+String(sectionId));
        sectionIds.add(sectionId);
      }
      if(!changed.includes(sectionId))return;resolved.add(sectionId);
      var diagram=specValueAt(raw,record.diagram);if(!diagram)return;
      var nodes=new Map(),placed=new Map(),edges=new Map();
      Object.keys(diagram.nodes).forEach(function(key){nodes.set(key,1);});
      diagram.rows.forEach(function(row){row.forEach(function(slot){(Array.isArray(slot)?slot:[slot]).forEach(function(key){placed.set(key,1);});});});
      (diagram.floats || []).forEach(function(item){placed.set(item.id,1);});
      (diagram.edges || []).forEach(function(edge){var key=edge.from+'->'+edge.to;if(edges.has(key))throw Error('Ambiguous edge reference: '+key);edges.set(key,1);});
      var panels=identities(diagram.panels,'panel'),steps=identities(diagram.steps,'step',true),layouts=identities(diagram.layouts,'layout');
      function references(values,ids,label){if(!Array.isArray(values))throw Error(label+' must be an array of IDs.');values.forEach(function(value){reference(value,ids,label);});}
      function mapping(value,label,visit){if(!object(value))throw Error(label+' must be an object.');Object.keys(value).forEach(function(key){visit(key,value[key]);});}
      (diagram.steps || []).forEach(function(step){
        if(step.nodes!=null)references(step.nodes,placed,'Step node');
        if(step.edges!=null && !Array.isArray(step.edges))throw Error('Step edges must be an array of IDs.');
        if(!Array.isArray(step.edges) && step.edge!=null && typeof step.edge!=='string')throw Error('Step edge must be a string ID.');
        references(stepKeys(step),edges,'Step edge');
        if(step.tone!=null)mapping(step.tone,'Step tone',function(key,value){reference(key,nodes,'Tone node');if(value!==null && !TONE_SET.includes(value))throw Error('Unknown tone: '+String(value));});
        if(step.panels!=null && !object(step.panels))throw Error('Step panels must be an object.');
        if(!object(step.panels) && step.patch!=null && !object(step.patch))throw Error('Step patch must be an object.');
        var panelPatch=stepPanelPatch(step);
        if(panelPatch)mapping(panelPatch,'Step panels',function(key,value){reference(key,panels,'Step panel');if(!object(value))throw Error('Panel state must be an object: '+key);});
        if(step.panelVisibility!=null)mapping(step.panelVisibility,'Panel visibility',function(key,value){reference(key,panels,'Visible panel');if(typeof value!=='boolean')throw Error('Panel visibility must be true or false: '+key);});
        if(step.packets!=null){if(!Array.isArray(step.packets))throw Error('Step packets must be an array.');step.packets.forEach(function(packet){if(!object(packet))throw Error('Packet must be an object.');reference(packet.edge,edges,'Packet edge');});}
      });
      (diagram.layouts || []).forEach(function(layout){
        if(layout.steps==null)return;
        references(layout.steps,steps,'Layout step');
        if(!layout.steps.length || new Set(layout.steps).size!==layout.steps.length)throw Error('Layout steps must be a nonempty list of unique step IDs.');
        if(!sectionViewStepsReachable(diagram,layout.steps))throw Error('Layout steps must include a step reachable through a story path.');
      });
      if(diagram.defaultLayout!=null)reference(diagram.defaultLayout,layouts,'Default layout');
    });
    changed.forEach(function(sectionId){if(!resolved.has(sectionId))throw Error('The transaction removed or obscured the addressed section ID: '+sectionId);});
  }
  try{
    if(typeof source!=='string' || workbenchAgentByteLength(source)>4*1024*1024)throw Error('Invalid or oversized source.');
    if(!Array.isArray(operations) || !operations.length || operations.length>100)throw Error('Provide 1–100 operations.');
    if(workbenchAgentByteLength(JSON.stringify(operations))>1024*1024)throw Error('Operations exceed 1 MiB.');
    safe(operations,0);
    operations=JSON.parse(JSON.stringify(operations));
    var raw=JSON.parse(source),changed=[],names=[];
    operations.forEach(function(operation){
      if(!object(operation))throw Error('Each operation must be an object.');
      var fields={updateNode:['nodeId','patch'],insertStep:['step','afterStepId'],patchPanelState:['stepId','panelId','patch'],addPath:['path'],replaceSection:['section']};
      if(!own(fields,operation.op))throw Error('Unknown operation: '+operation.op);
      var allowed=['op','sectionId'].concat(fields[operation.op]);
      if(Object.keys(operation).some(function(key){return !allowed.includes(key);}))throw Error('Unknown field in '+operation.op+'.');
      var sectionId=id(operation.sectionId,'section ID'),records=specSectionPaths(raw),record;
      if(sectionId==='$root')record=records.length===1 && records[0].section.length===0?records[0]:null;
      else{
        var matches=records.filter(function(rec){var section=specValueAt(raw,rec.section);return section && section.id===sectionId;});
        if(matches.length===1)record=matches[0];
      }
      if(!record)throw Error('Section ID must identify one authored section: '+sectionId+'. Bare diagrams use $root.');
      var section=specValueAt(raw,record.section),diagram=specValueAt(raw,record.diagram);
      if(operation.op==='replaceSection'){
        if(!object(operation.section) || (record.section.length && operation.section.id!==sectionId))throw Error('Replacement must preserve the section ID.');
        if(record.section.length){var parent=specValueAt(raw,record.section.slice(0,-1));parent[record.section[record.section.length-1]]=operation.section;}
        else raw=operation.section;
      }else{
        if(!object(diagram))throw Error('The selected section has no diagram.');
        if(operation.op==='updateNode'){
          var nodeId=id(operation.nodeId,'node ID');if(!own(diagram.nodes,nodeId))throw Error('Node does not exist: '+nodeId);patch(diagram.nodes[nodeId],operation.patch);
        }else if(operation.op==='insertStep'){
          var step=operation.step;id(step && step.id,'step ID');if(!object(step))throw Error('Step must be an object.');
          var steps=diagram.steps || [];if(!Array.isArray(steps))throw Error('Steps must be an array.');
          if(steps.some(function(item){return item.id===step.id;}))throw Error('Step ID already exists: '+step.id);
          var index=steps.length;if(own(operation,'afterStepId'))index=steps.indexOf(unique(steps,id(operation.afterStepId,'preceding step ID'),'Step'))+1;
          steps.splice(index,0,step);diagram.steps=steps;
        }else if(operation.op==='patchPanelState'){
          var target=unique(diagram.steps,id(operation.stepId,'step ID'),'Step'),panelId=id(operation.panelId,'panel ID');
          unique(diagram.panels,panelId,'Panel');
          if(target.panels!=null && !object(target.panels))throw Error('Step panels must be an object.');
          if(target.panels==null && target.patch!=null && !object(target.patch))throw Error('Step patch must be an object.');
          var states=target.panels || target.patch;
          if(!states)states=target.panels={};
          if(!own(states,panelId))Object.defineProperty(states,panelId,{value:{},enumerable:true,writable:true,configurable:true});
          patch(states[panelId],operation.patch);
        }else if(operation.op==='addPath'){
          var path=operation.path;id(path && path.id,'path ID');if(!object(path))throw Error('Path must be an object.');
          var paths=diagram.paths || [];if(!Array.isArray(paths))throw Error('Paths must be an array.');
          if(paths.some(function(item){return item.id===path.id;}))throw Error('Path ID already exists: '+path.id);
          paths.push(path);diagram.paths=paths;
        }
      }
      if(!changed.includes(sectionId))changed.push(sectionId);names.push(operation.op);
    });
    var findings=validate(normalize(raw));if(findings.errors.length)throw Error(findings.errors.join('\n'));
    semanticTargets(raw,changed);
    var text=JSON.stringify(raw,null,2);if(workbenchAgentByteLength(text)>4*1024*1024)throw Error('Result exceeds 4 MiB.');
    return {text:JSON.stringify(JSON.parse(source))===JSON.stringify(raw)?source:text,description:{operations:names,changedSections:changed}};
  }catch(error){return {error:error.message};}
}
