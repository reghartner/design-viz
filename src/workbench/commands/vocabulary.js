/* Document vocabulary and its first use are one authoring transaction. */
function planVocabulary(text,raw,target,kind,id,changes,create,expectedTarget){
  if(['protocols','lanes'].indexOf(kind)<0)return {error:'Unknown vocabulary.'};
  if(typeof id!=='string' || !/^[A-Za-z][A-Za-z0-9_-]*$/.test(id) || ['constructor','prototype'].indexOf(id)>=0)
    return {error:'Use a letter-led ID with letters, numbers, underscores or hyphens.'};
  if(!specObject(changes))return {error:'Provide a name or color.'};
  if(Object.prototype.hasOwnProperty.call(changes,'label') && (typeof changes.label!=='string' || !changes.label.trim()))
    return {error:'A display name is required.'};
  if(Object.prototype.hasOwnProperty.call(changes,'color') && !/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(changes.color))
    return {error:'Use a color such as #7C5CC4.'};
  if(create && expectedTarget!==undefined){
    var currentPath=target && builderTargetPath(raw,target);
    if(!currentPath || JSON.stringify(specValueAt(raw,currentPath))!==expectedTarget)
      return {error:'The selected item changed. Select it again before creating a definition.'};
  }
  var copy=builderClone(raw),page=normalize(copy);
  if(!page)return {error:'Open a diagram first.'};
  if(!copy.page && !copy.blocks && !copy.sections)copy={page:page};
  if(page[kind]!=null && !specObject(page[kind]))return {error:kind+' must be an object; correct its JSON first.'};
  var definitions=Object.assign(Object.create(null),page[kind] || {});
  var builtin=kind==='protocols' && Object.prototype.hasOwnProperty.call(BUILTIN_PROTOCOLS,id)?BUILTIN_PROTOCOLS[id]:null;
  var own=Object.prototype.hasOwnProperty.call(definitions,id);
  if(create && (own || builtin))return {error:'That ID already exists. Choose it from the list or use another ID.'};
  if(!create && !own && !builtin)return {error:'That definition no longer exists.'};
  if(own && !specObject(definitions[id]))return {error:'Correct this definition in JSON before editing it.'};
  var definition=Object.assign(Object.create(null),own?definitions[id]:builtin || {});
  Object.keys(changes).forEach(function(key){if(key==='label' || key==='color')definition[key]=changes[key];});
  definitions[id]=definition;page[kind]=definitions;
  if(create){
    var expected=kind==='protocols'?'edge':'step';
    if(!target || target.kind!==expected)return {error:'Select a '+expected+' first.'};
    var path=builderTargetPath(copy,target),item=path && specValueAt(copy,path);
    if(!specObject(item))return {error:'The selected '+expected+' no longer exists.'};
    item[kind==='protocols'?'kind':'lane']=id;
  }
  return jsonReplaceValue(text,[],JSON.stringify(copy,null,2)) || {error:'Could not update the document.'};
}
