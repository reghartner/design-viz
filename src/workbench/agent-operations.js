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
          if(!target.panels)target.panels={};
          if(!own(target.panels,panelId))Object.defineProperty(target.panels,panelId,{value:{},enumerable:true,writable:true,configurable:true});
          patch(target.panels[panelId],operation.patch);
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
    var text=JSON.stringify(raw,null,2);if(workbenchAgentByteLength(text)>4*1024*1024)throw Error('Result exceeds 4 MiB.');
    return {text:JSON.stringify(JSON.parse(source))===JSON.stringify(raw)?source:text,description:{operations:names,changedSections:changed}};
  }catch(error){return {error:error.message};}
}
