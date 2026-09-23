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
