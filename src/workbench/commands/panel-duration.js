/* Duration moves one supported field; it never invents an inherited value. */
function planPanelFieldDuration(text,raw,target,pid,key,duration,expected){
  var got=builderStepAt(raw,target.section,target.index),rec=specSectionPaths(raw)[target.section];
  var d=rec && specValueAt(raw,rec.diagram),panel=d && (d.panels || []).find(function(p){return p.id===pid;});
  if(target.kind!=='step' || !panel || (panelAuthoring(panel.type).transientFields || []).indexOf(key)<0)
    return {error:'This panel field does not support temporary changes.'};
  if(['carry','once','inherit'].indexOf(duration)<0)return {error:'Choose a supported duration.'};
  var patch=got && got.st.panels && got.st.panels[pid];
  if(!specObject(patch))return {error:'Add this panel to the selected step first.'};
  if(expected!==undefined && JSON.stringify(patch)!==expected)return {error:'The panel patch changed. Select the step again.'};
  if(Object.prototype.hasOwnProperty.call(patch,'enterOnce') && !specObject(patch.enterOnce))return {error:'Repair enterOnce in raw JSON before changing duration.'};
  var next=builderClone(patch),once=Object.assign(Object.create(null),next.enterOnce || {});
  var hasOnce=Object.prototype.hasOwnProperty.call(once,key),hasCarry=Object.prototype.hasOwnProperty.call(next,key);
  if(duration!=='inherit' && !hasOnce && !hasCarry)return {error:'Enter a value first, then choose its duration.'};
  var value=hasOnce?once[key]:next[key];delete next[key];delete once[key];
  if(duration==='carry')next[key]=value;else if(duration==='once')once[key]=value;
  if(Object.keys(once).length)next.enterOnce=once;else delete next.enterOnce;
  return planStepSetPanelPatch(text,raw,target.section,target.index,pid,JSON.stringify(next));
}
