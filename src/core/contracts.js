/* Contract block identities are shared by validation, rendering and authoring.
   Keep legacy contract first when both forms are present; never rewrite it just
   to append a new block. Raw indexes survive malformed skipped entries. */
function sectionContracts(section){
  var out=[];
  function add(value,path,key){
    if(!value || typeof value!=='object' || Array.isArray(value))return;
    out.push({value:value,path:path,key:key});
  }
  if(section){
    add(section.contract,['contract'],'legacy');
    (Array.isArray(section.contracts)?section.contracts:[]).forEach(function(value,index){
      add(value,['contracts',index],String(index));
    });
  }
  var ids=Object.create(null);
  out.forEach(function(rec){if(typeof rec.value.id==='string')ids[rec.value.id]=(ids[rec.value.id] || 0)+1;});
  out.forEach(function(rec){
    var id=rec.value.id;
    rec.reference=rec.key==='legacy'?'legacy':typeof id==='string' && /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(id) && id!=='legacy' && ids[id]===1?id:String(Number(rec.key)+1);
  });
  return out;
}
function contractColumnSpan(value){return [4,6,8,12].indexOf(value)>=0?value:12;}

/* Bind only to an unambiguous authored step and a declared active edge.
   Invalid/stale references fail closed; positions are never step identities. */
function contractWireProblem(diagram, wire){
  if(!wire || typeof wire!=='object' || Array.isArray(wire))return 'must be an object {step, edge, path?}';
  if(typeof wire.step!=='string' || !wire.step)return 'step must be a stable step ID';
  var steps=diagram && Array.isArray(diagram.steps)?diagram.steps:[];
  var matches=steps.filter(function(step){return step && step.id===wire.step;});
  if(matches.length!==1)return 'step must identify exactly one section diagram step';
  var edges=diagram && Array.isArray(diagram.edges)?diagram.edges:[];
  if(typeof wire.edge!=='string' || !edges.some(function(edge){return edge && edge.from+'->'+edge.to===wire.edge;}) || stepKeys(matches[0]).indexOf(wire.edge)<0)
    return 'edge must be a declared edge used by this step';
  if(wire.path!=null){
    var paths=diagram && Array.isArray(diagram.paths)?diagram.paths:[];
    var pathsFound=paths.filter(function(path){return path && path.id===wire.path;});
    if(typeof wire.path!=='string' || pathsFound.length!==1 || !Array.isArray(pathsFound[0].steps) || pathsFound[0].steps.indexOf(wire.step)<0)
      return 'path must identify a path containing this step';
  }
  return null;
}
function stepWireContracts(section, step, pathId){
  var out=[];
  sectionContracts(section).forEach(function(rec){
    var seen=Object.create(null);
    (Array.isArray(rec.value.wires)?rec.value.wires:[]).forEach(function(wire){
      if(contractWireProblem(section.diagram,wire) || wire.step!==step.id || wire.path!=null && wire.path!==pathId || stepDeliveredKeys(step).indexOf(wire.edge)<0 || seen[wire.edge])return;
      seen[wire.edge]=true;out.push({record:rec,edge:wire.edge});
    });
  });
  return out;
}
