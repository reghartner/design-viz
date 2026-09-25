/* Edit one mapping without rebuilding the detail or its advanced targets. */
function planDetailMapping(text,raw,target,edit,expected){
  var path=builderTargetPath(raw,target),node=path && specValueAt(raw,path),detail=node && node.detail;
  if(target.kind!=='node' || !specObject(detail))return {error:'Apply a local detail target first.'};
  if(expected!==undefined && JSON.stringify(detail)!==expected)return {error:'The detail changed. Select the node again.'};
  var page=normalize(raw),child=detailTarget(page,detail);
  if(!child || !child.section.diagram)return {error:'Choose a local detail section first.'};
  var next=builderClone(detail);
  if(edit.action==='replace'){
    if(edit.value==null)delete next.stepMap;else if(specObject(edit.value))next.stepMap=edit.value;
    else return {error:'Mapping JSON must be an object of parent IDs to targets.'};
  }else{
    if(next.stepMap!=null && !specObject(next.stepMap))return {error:'Repair the mapping object in Advanced mapping JSON first.'};
    var map=Object.assign(Object.create(null),next.stepMap || {});
    if(edit.action==='remove')delete map[edit.key];
    else if(edit.action==='write'){
      var rec=specSectionPaths(raw)[target.section],d=specValueAt(raw,rec.diagram);
      if(typeof edit.parent!=='string' || !(d.steps || []).some(function(s){return s.id===edit.parent;}))return {error:'Choose an existing parent step ID.'};
      if(edit.parent!==edit.key && Object.prototype.hasOwnProperty.call(map,edit.parent))return {error:'This parent event already has a mapping.'};
      if(edit.key!=null && !Object.prototype.hasOwnProperty.call(map,edit.key))return {error:'This mapping no longer exists.'};
      var row=edit.key==null?{}:map[edit.key];
      if(!specObject(row))return {error:'Repair this target in Advanced mapping JSON or remove it.'};
      row=Object.assign({},row);
      Object.keys(edit.changes || {}).forEach(function(k){
        if(k!=='path' && k!=='step')return;
        if(edit.changes[k]===undefined)delete row[k];else row[k]=edit.changes[k];
      });
      if(edit.key!=null)delete map[edit.key];map[edit.parent]=row;
    }else return {error:'Unknown mapping action.'};
    if(Object.keys(map).length)next.stepMap=map;else delete next.stepMap;
  }
  return planSetNodeDetail(text,raw,target.section,target.id,next);
}
