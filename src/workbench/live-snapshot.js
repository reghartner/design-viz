/* #1265: an agent's snapshot of a board's real Jira status and metrics (tools/live-snapshot.js), read for the
   Workbench preview. The file is one day of the demo story format plus snapshotAt; the Workbench never
   calls Jira or a metrics provider. The snapshot is preview state only: never saved, exported or published. */
var WORKBENCH_LIVE_SNAPSHOT_KIND='flowview-live-snapshot';
function workbenchLiveSnapshotTime(at){
  var date=new Date(at);
  try{return date.toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});}catch(e){return date.toISOString();}
}
// {ok:true, at, label, map(keys), telemetry(), tickets, carriers} or {ok:false, error}.
function workbenchLiveSnapshot(text){
  // A malformed file is refused with a reason, never an exception the File panel cannot show.
  try{return workbenchLiveSnapshotRead(text);}catch(ex){return {ok:false,error:'The snapshot could not be read: '+String(ex && ex.message || ex)};}
}
function workbenchLiveSnapshotRead(text){
  var data;
  try{data=JSON.parse(text);}catch(e){return {ok:false,error:'The file is not JSON.'};}
  if(!data || typeof data!=='object' || data.kind!==WORKBENCH_LIVE_SNAPSHOT_KIND)return {ok:false,error:'The file is not a Flowview live snapshot (kind "'+WORKBENCH_LIVE_SNAPSHOT_KIND+'"). Ask your agent to run tools/live-snapshot.js.'};
  var day=Array.isArray(data.days) && data.days[0];
  if(!day || typeof day!=='object' || !day.issues || typeof day.issues!=='object')return {ok:false,error:'The snapshot has no day of ticket status.'};
  var at=typeof data.snapshotAt==='string' && isFinite(Date.parse(data.snapshotAt))?new Date(Date.parse(data.snapshotAt)).toISOString():null;
  if(!at)return {ok:false,error:'The snapshot has no snapshot time.'};
  var block=day.telemetry;
  if(block && typeof block==='object'){
    var start=Date.parse(block.start),step=Number(block.stepSeconds)*1000,longest=0;
    Object.keys(block.carriers || {}).forEach(function(id){var signals=block.carriers[id] || {};Object.keys(signals).forEach(function(name){var values=signals[name] && signals[name].values;if(Array.isArray(values))longest=Math.max(longest,values.length);});});
    var end=start+longest*step;
    if(!isFinite(start) || !(step>0) || !isFinite(step) || !(Math.abs(end)<=8.64e15))return {ok:false,error:'The snapshot\'s metrics have no usable time range.'};
  }
  var epics=data.epics && typeof data.epics==='object'?data.epics:{},telemetry=liveStatusDemoTelemetry(day);
  // Read every ticket once now, so a malformed one is refused here and not during a render.
  liveStatusDemoMap(day,[],epics);
  return {ok:true,at:at,label:'Snapshot from '+workbenchLiveSnapshotTime(at),board:typeof data.board==='string'?data.board:'',
    tickets:Object.keys(day.issues).length,carriers:Object.keys(telemetry).length,
    map:function(keys){return liveStatusDemoMap(day,keys,epics);},
    telemetry:function(){return liveStatusDemoTelemetry(day);}};
}
