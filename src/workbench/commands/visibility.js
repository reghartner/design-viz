/* Reveal windows are positions in the full selected path, not registry IDs. */
function planFragmentVisibility(text,raw,target,key,value,expected){
  if(['edge','bullet','crow'].indexOf(target.kind)<0 || ['revealAt','hideAt'].indexOf(key)<0)
    return {error:'Select a connection, bullet, or contract row.'};
  if(value!==null && (!Number.isInteger(value) || value<0))return {error:'Use a whole path position of 1 or later.'};
  var path=builderTargetPath(raw,target),item=path && specValueAt(raw,path);
  if(item==null || (expected!==undefined && JSON.stringify(item)!==expected))
    return {error:'The selected item changed. Select it again before editing visibility.'};
  if(typeof item==='string' && target.kind==='bullet')item={text:item};
  if(!specObject(item))return {error:'Correct this item in JSON before editing its visibility.'};
  var next=Object.assign({},item);
  if(value===null)delete next[key];else next[key]=value;
  if(Number.isInteger(next.revealAt) && Number.isInteger(next.hideAt) && next.hideAt<=next.revealAt)
    return {error:'Hide must start after Show from. Clear the other bound to move the whole interval.'};
  return planReplaceValue(text,raw,path,JSON.stringify(next,null,2));
}
