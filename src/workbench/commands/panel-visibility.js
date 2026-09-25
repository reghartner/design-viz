/* One step assignment, independent of widget contents and view membership. */
function planStepPanelVisibility(text,raw,target,pid,value,expected){
  var got=builderStepAt(raw,target.section,target.index);
  if(target.kind!=='step' || !got || !(got.d.panels || []).some(function(p){return p && p.id===pid;}))
    return {error:'Select the step again; this panel is no longer in the diagram.'};
  if(expected!==undefined && JSON.stringify(got.st)!==expected)
    return {error:'The step changed. Select it again before editing panel visibility.'};
  if(value!==null && typeof value!=='boolean')return {error:'Choose Show, Hide, or Inherit.'};
  if(got.st.panelVisibility!=null && !specObject(got.st.panelVisibility))
    return {error:'Repair panelVisibility in JSON before editing it.'};
  return builderRewrite(text,raw,got.path,function(step){
    var next=Object.assign(Object.create(null),step.panelVisibility || {});
    if(value===null)delete next[pid];else next[pid]=value;
    if(Object.keys(next).length)step.panelVisibility=next;else delete step.panelVisibility;
  });
}
