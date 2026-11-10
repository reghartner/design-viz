/* #1243 part 3: the Links window's Log searches tab. The board-wide searches
   (tracking.telemetry.lookups) in Trace view order. Field edits, Add and Remove
   go through planPageTelemetry as Status board settings → Log searches does;
   these planners add a move of any number of places and the Viewer value
   switch, each one source change (one Undo step). */

var LINKS_LOG_NOT_OBJECT='Log searches are not an object; repair tracking.telemetry.lookups in JSON first.';
/* {present, valid, rows:[{id,index,label,query,values,datasource,traceId,spanId,slot,kind}]};
   kind is 'list' (suggested values), 'typed' (the query has $value) or 'fixed'. */
function linksLogSearchModel(raw){
  var s=telemetryLookupState(raw);
  var rows=s.ids.map(function(id,index){
    var e=telemetryObject(s.lookups[id])?s.lookups[id]:{},query=typeof e.query==='string'?e.query:'',values=Array.isArray(e.values)?e.values.filter(function(v){return typeof v==='string';}):[];
    var fields=telemetryObject(e.fields)?e.fields:{},slot=telemetryLookupSlot(query);
    return {id:id,index:index,label:typeof e.label==='string' && e.label.trim()?e.label.trim():id,query:query,values:values,
      datasource:typeof e.datasource==='string'?e.datasource:'',traceId:typeof fields.traceId==='string'?fields.traceId:'',spanId:typeof fields.spanId==='string'?fields.spanId:'',
      slot:slot,kind:slot && values.length?'list':slot?'typed':'fixed'};
  });
  return {present:s.present,valid:s.valid,rows:rows,lookups:s.lookups};
}
function linksLogSearchKindRefusal(row,kind){
  if(!row)return 'Log search not found. Render and try again.';
  if(kind==='fixed' && row.slot)return 'Remove $value from the query first: a search with no value has nothing to fill.';
  if((kind==='typed' || kind==='list') && !row.slot)return 'Add $value to the query first: it is where the reader’s value goes.';
  return null;
}
/* Where a dragged search lands when dropped in `gap` (0 = before the first row,
   rows.length = after the last), and why not. Static: no plan runs. */
function linksLogSearchDropTarget(model,id,gap){
  var at=model.rows.findIndex(function(r){return r.id===id;});
  if(at<0)return {toIndex:-1,refusal:'Log search "'+id+'" not found. Render and try again.'};
  var to=gap>at?gap-1:gap;
  if(to<0 || to>=model.rows.length)return {toIndex:-1,refusal:'That place is out of range.'};
  return {toIndex:to,refusal:to===at?'The search is already here.':null};
}
/* Move one search to `toIndex`, any number of places, in one source change. */
function planLinksLogSearchMove(text,raw,id,toIndex){
  var s=telemetryLookupState(raw);
  if(!s.valid)return {error:LINKS_LOG_NOT_OBJECT};
  var at=s.ids.indexOf(id);if(at<0)return {error:'Log search "'+id+'" not found. Render and try again.'};
  if(typeof toIndex!=='number' || toIndex<0 || toIndex>=s.ids.length || Math.floor(toIndex)!==toIndex)return {error:'That place is out of range.'};
  if(toIndex===at)return {text:text};
  var out=text,current=raw,offset=toIndex>at?1:-1;
  for(var i=0;i<Math.abs(toIndex-at);i++){
    var plan=planPageTelemetry(out,current,{op:'moveLookup',name:id,offset:offset});
    if(plan.error)return plan;
    out=plan.text;current=JSON.parse(out);
  }
  return {text:out};
}
/* Viewer value: 'typed' clears the suggested values, 'fixed' needs a query with
   no $value (and clears values), 'list' writes nothing (values make it a list). */
function planLinksLogSearchKind(text,raw,id,kind){
  var s=telemetryLookupState(raw);
  if(!s.valid)return {error:LINKS_LOG_NOT_OBJECT};
  var row=linksLogSearchModel(raw).rows.find(function(r){return r.id===id;});
  if(!row)return {error:'Log search "'+id+'" not found. Render and try again.'};
  var why=linksLogSearchKindRefusal(row,kind);if(why)return {error:why};
  if(kind==='list' || !row.values.length && !(s.lookups[id] && s.lookups[id].values!=null))return {text:text};
  return planPageTelemetry(text,raw,{op:'lookup',name:id,field:'values',value:null});
}
