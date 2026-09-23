/* Contract-block authoring; raw addresses preserve page wrappers and tabs. */
function planAddContract(text,raw,section,copy){
  var rec=specSectionPaths(raw)[section],sec=rec && specValueAt(raw,rec.section);
  if(!rec || !rec.section.length || !sec)return {error:'Choose a page section for the contract block.'};
  if(sec.contracts!=null && !Array.isArray(sec.contracts))return {error:'Fix contracts to be an array before adding a block.'};
  var taken=Object.create(null);
  sectionContracts(sec).forEach(function(c){if(c.value.id)taken[c.value.id]=true;});
  var value=copy?builderClone(copy):{title:'New contract',span:12,fields:[{k:'event',v:'button_press',g:'What this field means.'}]};
  value.id=builderUniqueKey(taken,copy && copy.id?copy.id+'-copy':'contract');
  if(copy)value.title=(value.title || 'Contract')+' (copy)';
  var plan=Array.isArray(sec.contracts)?jsonInsertMember(text,rec.section.concat(['contracts']),null,JSON.stringify(value,null,2)):
    planSetField(text,raw,rec.section,'contracts',JSON.stringify([value],null,2));
  if(!plan || plan.error)return plan || {error:'Could not insert the contract block.'};
  plan.card=String((sec.contracts || []).length);plan.kind='contract';return plan;
}
function planMoveContract(text,raw,target,delta){
  var rec=specSectionPaths(raw)[target.section],sec=rec && specValueAt(raw,rec.section);
  if(!sec)return {error:'Contract section not found.'};
  var entries=sectionContracts(sec),key=target.card==null?'legacy':String(target.card);
  var index=entries.findIndex(function(c){return c.key===key;}),next=index+delta;
  if(index<0 || next<0 || next>=entries.length)return {error:'Contract is already at that end.'};
  if(sec.contract!=null && (!sec.contract || typeof sec.contract!=='object' || Array.isArray(sec.contract)) ||
      sec.contracts!=null && (!Array.isArray(sec.contracts) || sec.contracts.some(function(c){return !c || typeof c!=='object' || Array.isArray(c);})))
    return {error:'Fix malformed contract blocks before reordering.'};
  var blocks=entries.map(function(c){return builderClone(c.value);}),moved=blocks.splice(index,1)[0];blocks.splice(next,0,moved);
  var plan=planSetFields(text,raw,rec.section,[['contract',null],['contracts',JSON.stringify(blocks,null,2)]]);
  if(!plan.error)plan.card=String(next);return plan;
}
function planAddContractField(text,raw,target){
  var path=builderTargetPath(raw,Object.assign({},target,{kind:'contract'})),value=path && specValueAt(raw,path);
  if(!value)return {error:'Contract block not found.'};
  if(value.fields!=null && !Array.isArray(value.fields))return {error:'Fix fields to be an array before adding a field.'};
  var taken=Object.create(null);(value.fields || []).forEach(function(f){if(f && f.k)taken[f.k]=true;});
  var field={k:builderUniqueKey(taken,'field'),v:'',g:''};
  var plan=Array.isArray(value.fields)?jsonInsertMember(text,path.concat(['fields']),null,JSON.stringify(field,null,2)):
    planSetField(text,raw,path,'fields',JSON.stringify([field],null,2));
  if(!plan || plan.error)return plan || {error:'Could not add the field.'};
  plan.index=(value.fields || []).length;return plan;
}
