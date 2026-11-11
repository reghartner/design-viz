/* #1344 / #1348: narrowing an inherited metric signal. A signal's `narrow` holds fragments in
   its provider's own language, keyed by source; Flowview only appends them to the query, never
   translates them. `needsNarrow` (field names, or true) says every board must narrow the signal.
   Anything that cannot be applied safely fails closed: the signal is not shown, with a reason.
   Pure and DOM-free; carrierTelemetry (core/tracking.js) applies it when the query is built.
   This slice applies Honeycomb filters and CloudWatch dimensions; text sources come next. */
var TELEMETRY_NARROW_LABELS={grafana:'Prometheus',loki:'LogQL',tempo:'Tempo',sql:'Grafana SQL',honeycomb:'Honeycomb',cloudwatch:'CloudWatch',cloudwatchLogs:'Logs Insights'};
var TELEMETRY_NARROW_STRUCTURED=['honeycomb','cloudwatch'];
var TELEMETRY_HONEYCOMB_OPS=['=','!=','>','>=','<','<=','starts-with','does-not-start-with','ends-with','does-not-end-with','contains','does-not-contain','exists','does-not-exist','in','not-in'];
function telemetryNarrowObject(v){return !!v && typeof v==='object' && !Array.isArray(v);}
// An authored narrow.<source> is one fragment or a list of them; a merged one is always a list.
function telemetryNarrowList(value){return value==null?[]:Array.isArray(value)?value:[value];}
function telemetryNarrowCanonical(v){
  if(Array.isArray(v))return '['+v.map(telemetryNarrowCanonical).join(',')+']';
  if(telemetryNarrowObject(v))return '{'+Object.keys(v).sort().map(function(k){return JSON.stringify(k)+':'+telemetryNarrowCanonical(v[k]);}).join(',')+'}';
  return JSON.stringify(v===undefined?null:v);
}
/* What is wrong with one fragment as written, in plain words ('' when it is fine). `at` is the
   fragment's path below narrow.<source>, for the problem's own path. */
function telemetryNarrowFragmentProblem(source,fragment){
  if(source==='honeycomb'){
    if(!telemetryNarrowObject(fragment))return {at:'',message:'a Honeycomb narrowing is {"filters": [ … ]}'};
    var extra=Object.keys(fragment).filter(function(k){return k!=='filters';});
    if(extra.length)return {at:'.'+extra[0],message:'a Honeycomb narrowing holds only filters, so '+extra[0]+' cannot be used'};
    if(!Array.isArray(fragment.filters) || !fragment.filters.length)return {at:'.filters',message:'list at least one Honeycomb filter'};
    for(var i=0;i<fragment.filters.length;i++){
      var f=fragment.filters[i],at='.filters['+i+']';
      if(!telemetryNarrowObject(f))return {at:at,message:'a Honeycomb filter is {"column", "op", "value"}'};
      var unknown=Object.keys(f).filter(function(k){return ['column','op','value'].indexOf(k)<0;});
      if(unknown.length)return {at:at+'.'+unknown[0],message:'a Honeycomb filter has only column, op and value'};
      if(typeof f.column!=='string' || !f.column.trim())return {at:at+'.column',message:'name the Honeycomb column to filter on'};
      if(TELEMETRY_HONEYCOMB_OPS.indexOf(f.op)<0)return {at:at+'.op',message:'use a Honeycomb filter operator such as "=" or "in"'};
      var bare=f.op==='exists' || f.op==='does-not-exist',list=f.op==='in' || f.op==='not-in';
      if(bare && Object.prototype.hasOwnProperty.call(f,'value'))return {at:at+'.value',message:f.op+' takes no value'};
      if(list && !(Array.isArray(f.value) && f.value.length && f.value.every(function(v){return ['string','number','boolean'].indexOf(typeof v)>=0;})))return {at:at+'.value',message:f.op+' takes a list of values'};
      if(!bare && !list && ['string','number','boolean'].indexOf(typeof f.value)<0)return {at:at+'.value',message:'give the filter a text, number or true/false value'};
    }
    return null;
  }
  if(source==='cloudwatch'){
    if(!telemetryNarrowObject(fragment))return {at:'',message:'a CloudWatch narrowing is {"dimensions": {"Name": "Value"}}'};
    var other=Object.keys(fragment).filter(function(k){return k!=='dimensions';});
    if(other.length)return {at:'.'+other[0],message:'a CloudWatch narrowing holds only dimensions, so '+other[0]+' cannot be used'};
    var d=fragment.dimensions;
    if(!telemetryNarrowObject(d) || !Object.keys(d).length)return {at:'.dimensions',message:'name at least one CloudWatch dimension'};
    var bad=Object.keys(d).filter(function(k){return !k.trim() || typeof d[k]!=='string' || !d[k].trim();});
    if(bad.length)return {at:'.dimensions.'+bad[0],message:'a CloudWatch dimension has a text name and a text value'};
    return null;
  }
  return null;
}
// The fields a fragment names, for needsNarrow: Honeycomb filter columns, CloudWatch dimension names.
function telemetryNarrowFields(source,fragments){
  var out=[];
  fragments.forEach(function(fragment){
    if(source==='honeycomb' && telemetryNarrowObject(fragment) && Array.isArray(fragment.filters))fragment.filters.forEach(function(f){if(telemetryNarrowObject(f) && typeof f.column==='string')out.push(f.column);});
    if(source==='cloudwatch' && telemetryNarrowObject(fragment) && telemetryNarrowObject(fragment.dimensions))out=out.concat(Object.keys(fragment.dimensions));
  });
  return out;
}
function telemetryNarrowJoin(items){return items.length>1?items.slice(0,-1).join(', ')+' and '+items[items.length-1]:items[0];}
/* A merged signal's narrow: inherited fragments first, then the patch's, each identical fragment
   once. A patch never removes one (null is ignored; the validator says so). */
function telemetryNarrowMerge(inherited,patch){
  var out={},a=telemetryNarrowObject(inherited)?inherited:{},b=telemetryNarrowObject(patch)?patch:{};
  Object.keys(a).concat(Object.keys(b)).forEach(function(source){
    if(Object.prototype.hasOwnProperty.call(out,source))return;
    var list=[],seen=Object.create(null);
    telemetryNarrowList(a[source]).concat(telemetryNarrowList(b[source])).forEach(function(fragment){
      var key=telemetryNarrowCanonical(fragment);if(seen[key])return;seen[key]=true;list.push(fragment);
    });
    if(list.length)out[source]=list;
  });
  return Object.keys(out).length?out:null;
}
// needsNarrow only adds up: true stays true, field lists join.
function telemetryNeedsMerge(inherited,patch){
  if(inherited===true || patch===true)return true;
  var out=[];[inherited,patch].forEach(function(v){if(Array.isArray(v))v.forEach(function(f){if(typeof f==='string' && out.indexOf(f)<0)out.push(f);});});
  return out.length?out:null;
}
/* The query to send, or why the signal is not shown. kind says which rule failed: language,
   unsupported, shape, unmet, or, conflict; written is true when the fault is in a fragment as
   written (the validator reports those where they are written). fragments is the display list of
   what was applied. */
function telemetryNarrowQuery(source,query,narrow,needs){
  var label=TELEMETRY_NARROW_LABELS[source] || source;
  if(narrow!=null && !telemetryNarrowObject(narrow))return {kind:'shape',written:true,error:'This signal\'s narrowing is not keyed by its source, so it is not shown.'};
  var map=telemetryNarrowObject(narrow)?narrow:{};
  var foreign=Object.keys(map).filter(function(k){return k!==source && telemetryNarrowList(map[k]).length;});
  if(foreign.length)return {kind:'language',written:true,error:'This signal reads from '+label+', so a '+(TELEMETRY_NARROW_LABELS[foreign[0]] || foreign[0])+' narrowing cannot apply; it is not shown.'};
  var fragments=telemetryNarrowList(map[source]);
  var needed=needs===true || Array.isArray(needs) && needs.length;
  if(!fragments.length && !needed)return {query:query,fragments:[]};
  if(source==='sql' || source==='tempo')return {kind:'unsupported',written:fragments.length>0,error:label+' signals cannot be narrowed, so this one is not shown. Ask the provider to write a ${name} placeholder in its query, then set that variable.'};
  if(TELEMETRY_NARROW_STRUCTURED.indexOf(source)<0 && fragments.length)return {kind:'unsupported',written:true,error:'Flowview cannot narrow '+label+' signals yet, so this one is not shown.'};
  for(var i=0;i<fragments.length;i++){
    var problem=telemetryNarrowFragmentProblem(source,fragments[i]);
    if(problem)return {kind:'shape',written:true,error:'A '+label+' narrowing of this signal is not valid ('+problem.message+'), so it is not shown.'};
  }
  if(needed){
    var named=telemetryNarrowFields(source,fragments),missing=needs===true?(fragments.length?[]:['*']):needs.filter(function(f){return named.indexOf(f)<0;});
    if(missing.length)return {kind:'unmet',error:'The provider asks each board to narrow this signal'+(needs===true?'':' by '+telemetryNarrowJoin(missing))+', and nothing narrows it here, so it is not shown.'};
  }
  if(!fragments.length)return {query:query,fragments:[]};
  var out=JSON.parse(JSON.stringify(query)),shown=[];
  if(source==='honeycomb'){
    if(typeof out.filter_combination==='string' && out.filter_combination.toUpperCase()==='OR')return {kind:'or',error:'This Honeycomb query combines its filters with OR, so a filter cannot be added safely; it is not shown.'};
    out.filters=Array.isArray(out.filters)?out.filters:[];
    fragments.forEach(function(fragment){fragment.filters.forEach(function(f){
      out.filters.push(JSON.parse(JSON.stringify(f)));
      shown.push(f.column+' '+f.op+(Object.prototype.hasOwnProperty.call(f,'value')?' '+(Array.isArray(f.value)?'['+f.value.join(', ')+']':String(f.value)):''));
    });});
    return {query:out,fragments:shown};
  }
  // CloudWatch matches the whole dimension set: a dimension the query or another fragment sets to
  // a different value can never match.
  out.dimensions=telemetryNarrowObject(out.dimensions)?out.dimensions:{};
  var from=Object.create(null);Object.keys(out.dimensions).forEach(function(k){from[k]='query';});
  for(var j=0;j<fragments.length;j++){
    var dims=fragments[j].dimensions,keys=Object.keys(dims);
    for(var k=0;k<keys.length;k++){
      var name=keys[k],value=dims[name];
      if(Object.prototype.hasOwnProperty.call(out.dimensions,name) && out.dimensions[name]!==value)
        return {kind:'conflict',error:'Dimension '+name+' is '+out.dimensions[name]+(from[name]==='query'?' in the provider\'s query':' in one narrowing')+' and '+value+' in another narrowing, so nothing can match; it is not shown.'};
      if(!Object.prototype.hasOwnProperty.call(out.dimensions,name)){out.dimensions[name]=value;from[name]='narrow';shown.push(name+' = '+value);}
    }
  }
  return {query:out,fragments:shown};
}
