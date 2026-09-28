/* Browser-local conversation recovery. Handles are remembered, never reopened
 * or permission-requested here. The UI owns that explicit user gesture. */
// A cache lookup hint only; session ownership and recovery use exact source checks.
function folderAgentSourceKey(source){
  var text=String(source || ''),a=2166136261,b=5381;
  for(var i=0;i<text.length;i++){a=Math.imul(a^text.charCodeAt(i),16777619);b=Math.imul(b,33)^text.charCodeAt(i);}
  return text.length+':'+(a>>>0).toString(16)+':'+(b>>>0).toString(16);
}
function folderAgentRecoveryRecord(value){
  if(!value || typeof value!=='object')return null;
  function short(v,n){return typeof v==='string'?v.slice(0,n):'';}
  var result={version:1,draft:short(value.draft,16000),level:['story','mixed','engineering'].includes(value.level)?value.level:'story',
    sourceKey:short(value.sourceKey,100),draftSourceKey:short(value.draftSourceKey || value.sourceKey,100),folderName:short(value.folderName,240),title:short(value.title,240),
    at:Number.isFinite(value.at)?value.at:0,sessionId:short(value.sessionId,120),transcript:[],changes:[]};
  var budget=180000;
  (Array.isArray(value.transcript)?value.transcript:[]).slice(-100).reverse().forEach(function(item){
    if(!item || !['user','assistant'].includes(item.role) || typeof item.text!=='string' || budget<=0)return;
    var text=item.text.slice(0,Math.min(32000,budget));budget-=text.length;
    var message={role:item.role,text:text,requestId:short(item.requestId,120)};
    if(item.context && typeof item.context==='object'){
      function items(values,keys){return (Array.isArray(values)?values:[]).slice(0,12).map(function(value){var clean={};if(!value || typeof value!=='object')return clean;
        keys.forEach(function(key){if(typeof value[key]==='string')clean[key]=short(value[key],180);else if(Number.isFinite(value[key]))clean[key]=value[key];});return clean;});}
      message.context={technicalLevel:short(item.context.technicalLevel,30),previewCurrent:item.context.previewCurrent!==false,
        selection:items(item.context.selection,['kind','id','label','section','sectionLabel','index']),views:items(item.context.views,['section','view','viewLabel','path','pathLabel','mode','sourceStep'])};
    }
    result.transcript.unshift(message);
  });
  (Array.isArray(value.changes)?value.changes:[]).slice(-100).forEach(function(item){
    if(!item || typeof item.id!=='string')return;
    var clean={};['id','requestId','status','summary','message','revision','baseRevision'].forEach(function(key){clean[key]=short(item[key],key==='message'||key==='summary'?2000:120);});
    clean.at=Number.isFinite(item.at)?item.at:0;result.changes.push(clean);
  });
  return result;
}
function createWorkbenchAgentRecovery(opts){
  opts=opts || {};var storage=opts.storage,indexed=opts.indexedDB,key='dv-folder-agent-recovery-v1',last=null;
  function read(){try{return folderAgentRecoveryRecord(JSON.parse(storage.getItem(key)));}catch(ex){return null;}}
  function save(value){var record=folderAgentRecoveryRecord(value);if(!record)return false;var serialized=JSON.stringify(record);
    if(last===serialized)return true;
    try{storage.setItem(key,serialized);last=serialized;return true;}catch(ex){return false;}}
  function handleStore(mode,value){
    return new Promise(function(resolve){
      if(!indexed){resolve(null);return;}
      var request;try{request=indexed.open('flowview-folder-recovery',1);}catch(ex){resolve(null);return;}
      request.onupgradeneeded=function(){if(!request.result.objectStoreNames.contains('handles'))request.result.createObjectStore('handles');};
      request.onerror=function(){resolve(null);};request.onblocked=function(){resolve(null);};
      request.onsuccess=function(){
        var db=request.result,transaction;
        try{
          transaction=db.transaction('handles',mode);var store=transaction.objectStore('handles');
          var operation=mode==='readonly'?store.get('last'):store.put(value,'last'),result=null;
          operation.onsuccess=function(){result=mode==='readonly'?operation.result:true;};
          transaction.oncomplete=function(){db.close();resolve(result || null);};
          transaction.onerror=transaction.onabort=function(){db.close();resolve(null);};
        }catch(ex){db.close();resolve(null);}
      };
    });
  }
  return {read:read,save:save,handle:function(){return handleStore('readonly');},
    remember:function(handle,sessionId){return handleStore('readwrite',{handle:handle,sessionId:String(sessionId || '')});}};
}
