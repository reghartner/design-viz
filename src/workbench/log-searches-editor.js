/* Desktop Workbench "Log searches" editor (#1233): Status board settings → Log searches edits
   tracking.telemetry.lookups. Each search is one fold (keyed by its id, so a label edit keeps it
   open); its order is the Trace view's box order. Edits go through o.commit(edit) →
   commands/telemetry.js telemetryEditLookups, one accepted edit per Undo step. Validator warnings
   sit next to the field they name; the rest are listed at the end. Uncommitted New log search text
   lives in o.drafts (inspector-owned, cleared when the selection changes). Nothing here runs a query. */
var LOG_SEARCH_WARNING_FIELD=/^tracking\.telemetry\.lookups\.([A-Za-z][A-Za-z0-9_-]*)\.(label|query|datasource|values|fields|requireTraceId)(?:\[\d+\])?(?:\.(traceId|spanId))?: /;
// Validator warnings for log searches → {byId: {id: {field: [text]}}, general: [text]}.
function logSearchWarnings(list,ids){
  var out={byId:Object.create(null),general:[]};
  (list || []).forEach(function(text){
    var m=LOG_SEARCH_WARNING_FIELD.exec(text),field=m && (m[2]==='fields'?m[3]:m[2]);
    if(!m || !field || ids.indexOf(m[1])<0){out.general.push(text);return;}
    // The validator says "— lookup ignored"; next to the field the editor says what that means for readers.
    var message=text.slice(text.indexOf(': ')+2).replace(/\s+— lookup ignored$/,'');message=message.charAt(0).toUpperCase()+message.slice(1)+'. The Trace view drops this search until it is fixed.';
    var at=out.byId[m[1]] || (out.byId[m[1]]=Object.create(null));(at[field] || (at[field]=[])).push(message);
  });
  return out;
}
/* o: {document, state: telemetryLookupState(raw) plus warnings, controls (metricsControlKit), listen,
   commit(edit), drafts (Map), idPrefix, later(fn): run fn after the inspector has placed this form} */
function createFlowLogSearches(o){
  var d=flowMetricsDom(o),c=o.controls,s=o.state,commit=o.commit,drafts=o.drafts || new Map(),serial=0,prefix=o.idPrefix || 'dv-log-search';
  var box=d.el('div','log-searches'),ids=s.ids,lookups=s.lookups,placed=logSearchWarnings(s.warnings,ids);
  // Where focus goes once the form is rebuilt after an Add, Move or Remove (one use; drafts is cleared with the selection).
  var intent=drafts.get('focus');drafts.delete('focus');
  function focusAfter(next){drafts.set('focus',next);}
  d.note(box,'Readers find a trace from a log line in the Trace view: each log search is its own box with its own Find, in this order. Write $value in the query where the reader\'s value goes; suggested values make it a pick list. Readers also need a trace connection and a Grafana connector with query_loki_logs; the Loki datasource UID comes from Metrics unless a search sets its own.');
  if(!s.valid){d.note(box,'Log searches are not an object; repair tracking.telemetry.lookups in JSON first.');d.warnings(box,placed.general,'Log searches warnings');return box;}
  var offer=c.checkbox(s.present,function(value){return commit({op:'lookupsEnabled',value:value});}),offerInput=offer.querySelector('input');
  d.row(box,'Offer log searches in the Trace view',offer);offerInput.setAttribute('aria-label','Offer log searches in the Trace view');
  if(ids.length){
    offerInput.disabled=true;offerInput.title='Remove the log searches first; then this turns the Trace view\'s log search off.';
    var why=d.note(box,'Remove the searches below to turn this off.','log-search-offer-note');why.id=prefix+'-offer-note';offerInput.setAttribute('aria-describedby',why.id);
  }else offerInput.title=s.present?'On: the Trace view offers a typed LogQL query box. Off: no log search.':'Turn on to offer a typed LogQL query box in the Trace view; add searches below.';
  function warn(parent,control,texts){
    if(!texts || !texts.length)return;
    var p=d.el('p','fnote log-search-warning',texts.join(' '));p.id=prefix+'-warning-'+(serial++);p.setAttribute('role','note');parent.appendChild(p);
    control.setAttribute('aria-invalid','true');control.setAttribute('aria-describedby',p.id);
  }
  var folds=[];
  ids.forEach(function(id,index){
    var entry=telemetryObject(lookups[id])?lookups[id]:{},w=placed.byId[id] || {},fields=telemetryObject(entry.fields)?entry.fields:{};
    var fold=d.fold(box,'log-search','Log search '+id+(telemetryText(entry.label)?' · '+entry.label.trim():''));fold.setAttribute('data-log-search',id);folds.push(fold);
    var slot=telemetryLookupSlot(entry.query),values=Array.isArray(entry.values)?entry.values:[];
    var repeated=values.filter(function(v,i){return values.indexOf(v)<i;}).filter(function(v,i,all){return all.indexOf(v)===i;});
    if(repeated.length)(w.values=(w.values || []).slice()).push('Suggested '+(repeated.length===1?'value '+JSON.stringify(repeated[0])+' is':'values '+repeated.map(function(v){return JSON.stringify(v);}).join(', ')+' are')+' listed more than once.');
    if(Object.keys(w).length || intent && intent.id===id){fold.open=true;fold.setAttribute('data-inspector-open','');}
    d.note(fold,slot && values.length?'Pick list: readers type a value or pick one of '+values.length+' suggested '+(values.length===1?'value':'values')+'.':
      slot?'Typed search: readers type the value that fills $value.':'Fixed search: the query has no $value, so readers only press Find.','log-search-kind');
    function edit(field,value){return commit({op:'lookup',name:id,field:field,value:value});}
    function field(label,control,key){d.row(fold,id+' '+label,control);warn(fold,control,w[key]);return control;}
    field('label',c.text(entry.label,function(v){return edit('label',v);},{required:'A log search needs a label; use Remove log search to delete it.',placeholder:'Shown on the search box, e.g. Order ID'}),'label');
    field('query',c.text(entry.query,function(v){return edit('query',v);},{textarea:true,required:'A log search needs a LogQL query; use Remove log search to delete it.',placeholder:'{env="$env"} |= "order placed" | order_id="$value"'}),'query');
    field('suggested values',c.text(values.join('\n'),function(v){
      var list=v==null?[]:v.split('\n').map(function(line){return line.trim();}).filter(Boolean);
      return edit('values',list.length?list:null);
    },{textarea:true,placeholder:'One value per line (optional); makes a pick list'}),'values');
    field('Loki datasource UID',c.text(entry.datasource,function(v){return edit('datasource',v);},{placeholder:'From Metrics → Grafana Loki UID'}),'datasource');
    field('trace ID field',c.text(fields.traceId,function(v){return edit('traceId',v);},{placeholder:'trace_id'}),'traceId');
    field('span ID field',c.text(fields.spanId,function(v){return edit('spanId',v);},{placeholder:'span_id'}),'spanId');
    // #1415: requireTraceId; checked (the default, #1158) writes no key.
    var traceLabel=id+' Only lines with a trace ID starts checked',traced=c.checkbox(entry.requireTraceId!==false,function(v){return edit('requireTraceId',v);}),tracedInput=traced.querySelector('input');
    d.row(fold,traceLabel,traced);tracedInput.setAttribute('aria-label',traceLabel);
    tracedInput.title='On (default): this search starts with "Only lines with a trace ID" checked in the Trace view. Off: it starts unchecked and lists every matching line (requireTraceId: false). Readers can still change it.';
    warn(fold,tracedInput,w.requireTraceId);
    var actions=d.el('div','log-search-actions');fold.appendChild(actions);
    function move(offset){var ok=commit({op:'moveLookup',name:id,offset:offset});if(ok)focusAfter({id:id,move:offset});return ok;}
    var up=c.action('Move log search '+id+' up',function(){return move(-1);}),down=c.action('Move log search '+id+' down',function(){return move(1);});
    up.disabled=index===0;down.disabled=index===ids.length-1;
    up.title=up.disabled?'Already the first search in the Trace view':'Show this search one box earlier in the Trace view';
    down.title=down.disabled?'Already the last search in the Trace view':'Show this search one box later in the Trace view';
    up.setAttribute('data-log-search-move','-1');down.setAttribute('data-log-search-move','1');
    actions.appendChild(up);actions.appendChild(down);
    actions.appendChild(c.action('Remove log search '+id,function(){var ok=commit({op:'removeLookup',name:id});if(ok)focusAfter({removed:index});return ok;},'bdanger'));
  });
  var add=d.fold(box,'log-search-add','New log search');
  function drafted(input,key){
    var k='new:'+key;if(drafts.has(k))input.value=drafts.get(k);
    function keep(){if(input.value)drafts.set(k,input.value);else drafts.delete(k);}
    o.listen(input,'input',keep);o.listen(input,'change',keep);
    // The form refresh waits while a focused field holds a draft; a submitted draft is cleared from the map and the box.
    input._flowviewHasDraft=function(){return drafts.has(k);};
    return input;
  }
  var label=drafted(d.draft(add,'New log search label','text',null,''),'label'),query=drafted(d.draft(add,'New log search query','textarea',null,''),'query'),idInput=drafted(d.draft(add,'New log search id','text',null,''),'id');
  label.placeholder='Order ID';query.placeholder='{env="$env"} |= "order placed" | order_id="$value"';idInput.placeholder='Optional; made from the label';
  var preview=d.note(add,'','log-search-id-preview');preview.id=prefix+'-id-preview';idInput.setAttribute('aria-describedby',preview.id);
  function nextId(){return idInput.value.trim() || telemetryLookupId(label.value,lookups);}
  // Read on demand through the id field's description, so it is not announced on every keystroke.
  function showId(){
    var typed=idInput.value.trim(),bad=typed && !telemetryNamePattern.test(typed)?'"'+typed+'" cannot be an id: start with a letter and use letters, digits, - and _.':
      typed && telemetryOwn(lookups,typed)?'Log search "'+typed+'" already exists; choose another id.':'';
    preview.textContent=bad || (label.value.trim() || typed?'Will be saved as tracking.telemetry.lookups.'+nextId()+(typed?'':' (from the label)')+'.':'The id is made from the label unless you type one.');
    preview.classList.toggle('log-search-warning',!!bad);if(bad)idInput.setAttribute('aria-invalid','true');else idInput.removeAttribute('aria-invalid');
  }
  [label,idInput].forEach(function(input){o.listen(input,'input',showId);});showId();
  if(!ids.length || ['label','query','id'].some(function(k){return drafts.has('new:'+k);}) || intent && intent.add){add.open=true;add.setAttribute('data-inspector-open','');}
  function submit(){
    var name=nextId(),ok=commit({op:'addLookup',name:name,label:label.value.trim(),query:query.value});
    if(ok){['label','query','id'].forEach(function(k){drafts.delete('new:'+k);});label.value='';query.value='';idInput.value='';focusAfter({id:name,field:'label'});}
    return ok;
  }
  [label,idInput].forEach(function(input){o.listen(input,'keydown',function(ev){if(ev.key==='Enter' && !ev.isComposing){ev.preventDefault();submit();}});});
  add.appendChild(c.action('Add log search',submit));
  d.note(add,'Add log search saves the label and query as one Undo step and opens the new search; then set suggested values, a datasource or field names there. Enter in the label or id adds it.');
  d.warnings(box,placed.general,'Log searches warnings');
  // Focus after a rebuild: the new search's label; the Move button still usable after a Move; the next search (or New log search) after a Remove.
  if(intent && o.later)o.later(function(){
    var target=null;
    if(intent.field){var f=folds.find(function(x){return x.getAttribute('data-log-search')===intent.id;});target=f && f.querySelector('input,textarea');}
    else if(intent.move){
      var g=folds.find(function(x){return x.getAttribute('data-log-search')===intent.id;}),same=g && g.querySelector('[data-log-search-move="'+intent.move+'"]'),other=g && g.querySelector('[data-log-search-move="'+(-intent.move)+'"]');
      target=same && !same.disabled?same:other && !other.disabled?other:g && g.querySelector('summary');
    }else if(intent.removed!=null)target=(folds[intent.removed] || add).querySelector('summary');
    if(target && target.isConnected!==false && target.focus)target.focus();
  });
  return box;
}
