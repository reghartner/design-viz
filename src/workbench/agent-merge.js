/* Conservative JSON three-way merge. Unidentified ordered collections are atomic. */
function mergeWorkbenchAgentSource(baseSource,currentSource,agentSource){
  var conflicts=[],missing={},base,current,agent;
  function equal(a,b){
    if(a===b)return true;
    if(a===missing || b===missing || !a || !b || typeof a!=='object' || typeof b!=='object' || Array.isArray(a)!==Array.isArray(b))return false;
    var keys=Object.keys(a);return keys.length===Object.keys(b).length && keys.every(function(k){return Object.prototype.hasOwnProperty.call(b,k) && equal(a[k],b[k]);});
  }
  function conflict(path,reason){if(conflicts.length<100)conflicts.push({path:path || '/',reason:reason});return missing;}
  function child(path,key){return path+'/'+String(key).replace(/~/g,'~0').replace(/\//g,'~1');}
  function object(value){return value!==missing && value && typeof value==='object' && !Array.isArray(value);}
  function keyed(value,key){return Array.isArray(value) && value.every(function(item){return object(item) && typeof key(item)==='string' && key(item);}) && new Set(value.map(key)).size===value.length;}
  function merge(b,c,a,path){
    if(equal(c,a))return c;
    if(equal(b,c))return a;
    if(equal(b,a))return c;
    if(b===missing || c===missing || a===missing)return conflict(path,b===missing?'Both added different values.':'One side deleted an item the other edited.');
    if(object(b) && object(c) && object(a)){
      var result=Object.create(null),keys=new Set(Object.keys(b).concat(Object.keys(c),Object.keys(a)));
      keys.forEach(function(key){
        function get(value){return Object.prototype.hasOwnProperty.call(value,key)?value[key]:missing;}
        var value=merge(get(b),get(c),get(a),child(path,key));if(value!==missing)result[key]=value;
      });return result;
    }
    var fallback=/\/(blocks|sections)$/.test(path)?'heading':/\/tabs$/.test(path)?'label':null;
    var key=function(item){return item.id || fallback && item[fallback];};
    if(keyed(b,key) && keyed(c,key) && keyed(a,key)){
      var bm=new Map(b.map(function(v){return [key(v),v];})),cm=new Map(c.map(function(v){return [key(v),v];})),am=new Map(a.map(function(v){return [key(v),v];})),values=new Map();
      new Set(Array.from(bm.keys()).concat(Array.from(cm.keys()),Array.from(am.keys()))).forEach(function(id){
        var value=merge(bm.has(id)?bm.get(id):missing,cm.has(id)?cm.get(id):missing,am.has(id)?am.get(id):missing,child(path,'id='+id));if(value!==missing)values.set(id,value);
      });
      // Compare ordering only for surviving baseline items. A reorder on one
      // side can coexist with field edits on the other. Concurrent insertions
      // keep their anchors; incompatible ordering is a conflict, never guessed.
      var ids=function(list){return list.map(function(v){return key(v);}).filter(function(id){return values.has(id);});};
      var bi=ids(b),ci=ids(c),ai=ids(a),existing=function(list){return list.filter(function(id){return bm.has(id);});};
      var sharedNew=function(list){return list.filter(function(id){return !bm.has(id) && cm.has(id) && am.has(id);});};
      if(!equal(sharedNew(ci),sharedNew(ai))){conflict(path,'Both ordered newly added items differently.');return missing;}
      var co=existing(ci),ao=existing(ai),order;
      if(equal(co,ao))order=co.slice();else if(equal(co,bi))order=ao.slice();else if(equal(ao,bi))order=co.slice();else{conflict(path,'Both changed the order of this collection.');return missing;}
      var anchors=new Map();
      [ci,ai].forEach(function(list){
        list.forEach(function(id,index){
          if(bm.has(id))return;
          var before=list.slice(0,index).filter(function(v){return bm.has(v);}).pop() || null;
          var after=list.slice(index+1).find(function(v){return bm.has(v);}) || null;
          var anchor=JSON.stringify([before,after]);
          if(anchors.has(id) && anchors.get(id)!==anchor)conflict(child(path,'id='+id),'Both inserted this item at different positions.');
          anchors.set(id,anchor);
          if(order.includes(id))return;
          if(before && after && order.indexOf(before)>order.indexOf(after)){conflict(path,'A reorder conflicts with an insertion.');return;}
          var at=after?order.indexOf(after):order.length;order.splice(at,0,id);
        });
      });
      return order.map(function(id){return values.get(id);});
    }
    return conflict(path,Array.isArray(c)?'Both changed an ordered collection without stable item IDs.':'Both changed this value.');
  }
  try{base=JSON.parse(baseSource);current=JSON.parse(currentSource);agent=JSON.parse(agentSource);}
  catch(ex){return {ok:false,conflicts:[{path:'/',reason:'A document is not valid JSON: '+ex.message}]};}
  var result=merge(base,current,agent,'');
  return conflicts.length?{ok:false,conflicts:conflicts}:{ok:true,source:equal(result,current)?currentSource:equal(result,agent)?agentSource:JSON.stringify(result,null,2),merged:!equal(base,current),conflicts:[]};
}
