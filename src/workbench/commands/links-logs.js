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
/* Which searches the Trace view drops, straight from the validator's text: a
   warning "tracking.telemetry.lookups.<id>[.path]: … — lookup ignored" drops
   <id> (prefix matching also covers ids that fail the id pattern). Returns
   {byId:{id:[reason]}, general:[warning]} with reasons in plain words. */
var LINKS_LOG_PREFIX='tracking.telemetry.lookups';
function linksLogSearchSubject(path,message){
  var m;
  if(!path)return /^lookup ids/.test(message)?'its id must start with a letter and use only letters, digits, - and _':'the search '+message;
  if(path==='.label')return 'the label '+message;
  if(path==='.query')return /^has suggested values but no \$value slot$/.test(message)?'the search has suggested values but its query has no $value':'the query '+message;
  if(path==='.values')return /^must be an array of 1–50/.test(message)?'suggested values must be a list of 1–50 values':'the suggested values '+message;
  if((m=/^\.values\[(\d+)\]$/.exec(path)))return 'suggested value '+(Number(m[1])+1)+' '+message;
  if(path==='.datasource')return /^must be a non-empty/.test(message)?'the Loki datasource UID must not be empty':'the Loki datasource UID '+message;
  if(path==='.fields')return 'the trace and span ID fields '+message;
  if(path==='.fields.traceId')return 'the trace ID field '+message;
  if(path==='.fields.spanId')return 'the span ID field '+message;
  if(message==='unknown field')return path.indexOf('.fields.')===0?path.slice(1)+' is not a trace or span ID field':path.slice(1)+' is not a log search field';
  return path.slice(1)+' '+message;
}
function linksLogSearchIgnored(warnings,ids){
  var out={byId:Object.create(null),general:[]},sorted=(ids || []).slice().sort(function(a,b){return b.length-a.length;});
  (warnings || []).forEach(function(text){
    var id=null;
    if(text.indexOf(LINKS_LOG_PREFIX+'.')===0){
      var rest=text.slice(LINKS_LOG_PREFIX.length+1);
      // An id that fails the id pattern only ever gets "<id>: lookup ids …"; a valid id gets ".field", "[i]" or ": …".
      id=sorted.find(function(k){return telemetryNamePattern.test(k)?rest.indexOf(k)===0 && /^[.:[]/.test(rest.charAt(k.length)):rest.indexOf(k+': lookup ids')===0;}) || null;
    }
    var ignored=/ — lookup ignored$/.test(text);
    if(!id || !ignored){out.general.push(text);return;}
    var after=text.slice(LINKS_LOG_PREFIX.length+1+id.length),colon=after.indexOf(': ');
    var path=colon>=0?after.slice(0,colon):'',message=(colon>=0?after.slice(colon+2):after).replace(/ — lookup ignored$/,'');
    (out.byId[id] || (out.byId[id]=[])).push(linksLogSearchSubject(path,message));
  });
  return out;
}
