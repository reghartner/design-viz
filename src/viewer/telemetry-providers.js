/* One automatic controller for Grafana + Honeycomb. Adapters receive scoped
   controller facades, never ownership of another source's data or availability.
   The viewer still owns its single timer, history cache and Metrics switch. */
function telemetryProviderMerge(maps){
  var out=Object.create(null);maps.forEach(function(map){Object.keys(map || {}).forEach(function(id){var sample=map[id],target=out[id];
    if(!target)target=out[id]={signals:{},observedAt:null,markers:[],links:{}};
    Object.keys(sample.signals || {}).forEach(function(name){
      var entry=Object.assign({},sample.signals[name]);
      // Preserve explicit unknown as-of. Legacy adapter series acquire their
      // own endpoint before carrier summaries from other sources are combined.
      if(!telemetryOwn(entry,'observedAt')){
        var times=(entry.series || []).map(function(p){return Date.parse(telemetryTime(p[0]));}).filter(isFinite);
        // A total descriptor retains its source bounds even when invalid;
        // composition must not authorize it using another observation time.
        entry.observedAt=telemetryOwn(entry,'aggregate')?telemetryTime(sample.observedAt):times.length?telemetryTime(Math.max.apply(null,times)):telemetryTime(sample.observedAt);
      }
      target.signals[name]=entry;
    });
    if(sample.observedAt && (!target.observedAt || Date.parse(sample.observedAt)>Date.parse(target.observedAt)))target.observedAt=sample.observedAt;
    if(sample.exemplars)target.exemplars=sample.exemplars;
    target.markers=target.markers.concat(sample.markers || []);
    Object.keys(sample.links || {}).forEach(function(key){if(!target.links[key])target.links[key]=sample.links[key];});
  });});return out;
}
function createTelemetryProviders(page,win){
  try{if(!trackingTelemetry(page || {}).enabled || !win || !win.claude || typeof win.claude.use!=='function')return null;}catch(e){return null;}
  var current=page,ctl=null,parts=[],retired=false,generation=0,ensuring=false,off=null,bindingKey=null,accountListeners=[];
  var definitions=[{name:'Grafana',sources:['grafana','loki','sql','cloudwatch','cloudwatchLogs'],create:createTelemetryGrafana},{name:'Honeycomb',sources:['honeycomb'],create:createTelemetryHoneycomb},{name:'Traces',sources:[],create:createTelemetryTraces}];
  function scoped(bindings,part){if(part.definition.name==='Traces')return bindings.filter(function(b){return telemetryTraceJobs([b]).length;});return bindings.map(function(binding){var signals={};Object.keys(binding.signals || {}).forEach(function(name){if(part.definition.sources.indexOf(binding.signals[name].source)>=0 && !telemetryTraceIntent(binding.signals[name]))signals[name]=binding.signals[name];});return Object.assign({},binding,{signals:signals});}).filter(function(binding){return Object.keys(binding.signals).length;});}
  function bindingIdentity(bindings){return JSON.stringify(bindings.map(function(b){return [b,ctl && ctl.telemetry.bindingGeneration?ctl.telemetry.bindingGeneration(b.id):0];}));}
  function availability(){if(ctl){var errors=[];ctl.telemetry.bindings().forEach(function(b){Object.keys(b.signals).forEach(function(n){if(b.signals[n].error)errors.push(b.id+' '+n+': '+b.signals[n].error);});});ctl.telemetry.setAvailable(!retired && parts.some(function(p){return p.available;}),telemetryNotes(parts.map(function(p){return p.note;}).concat(errors)));}}
  function accountChanged(){if(retired)return;retired=true;generation++;accountListeners.slice().forEach(function(fn){try{fn();}catch(e){}});parts.forEach(function(p){p.map={};p.available=false;p.historyCache.clear();});if(ctl){ctl.telemetry.clear();ctl.telemetry.setAvailable(false);}parts.forEach(function(p){if(p.handle)p.handle.destroy();});}
  function ensure(){
    if(!ctl || retired || ensuring)return;ensuring=true;
    try{var bindings=ctl.telemetry.bindings();definitions.forEach(function(definition){
      if(parts.some(function(p){return p.definition===definition;}))return;
      var part={definition:definition,map:{},available:false,adapter:null,handle:null,historyCache:telemetryHistoryCache(),bindingKey:null};
      if(!scoped(bindings,part).length)return;part.bindingKey=bindingIdentity(scoped(bindings,part));
      part.adapter=definition.create(current,win,null,function(){return ctl && scoped(ctl.telemetry.bindings(),part).length;});
      if(!part.adapter)return;parts.push(part);
      var api=ctl.telemetry,facade={
        config:function(){return typeof api.config==='function'?api.config():telemetryEnvironmentConfig(current);},environment:function(){return typeof api.environment==='function'?api.environment():null;},bindings:function(){return scoped(api.bindings(),part);},enabled:function(){return api.enabled();},
        setEnabled:function(value){if(value && api.enabled() && api.retry)api.retry();},
        setAvailable:function(value,note){part.note=note || '';var was=part.available;part.available=!!value;if(!value){part.map={};part.historyCache.clear();if(part.definition.name==='Traces'){if(api.retractExemplars)api.retractExemplars();}else if(api.retractSources)api.retractSources(part.definition.sources);}availability();if(value && !was && api.enabled() && api.retry)api.retry();},
        clear:function(){part.map={};part.historyCache.clear();if(part.definition.name==='Traces'){if(api.retractExemplars)api.retractExemplars();}else if(api.retractSources)api.retractSources(part.definition.sources);},accountChanged:accountChanged,
        onChange:function(fn){return api.onChange(function(snapshot){fn(Object.assign({},snapshot,{available:part.available}));});}
      };
      part.handle=part.adapter.attach({telemetry:facade,liveStatus:ctl.liveStatus},current);
    });}finally{ensuring=false;}
  }
  async function run(bindings,signal,report,range){
    ensure();var epoch=generation,notes=[],progressNotes=Object.create(null),approval=false;
    if(retired || signal.aborted)throw new Error('Metrics session retired.');
    var answers=await Promise.all(parts.map(async function(part){
      if(range && part.definition.name==='Traces')return {};
      var bound=scoped(bindings,part).map(function(b){var signals={};Object.keys(b.signals).forEach(function(name){var s=b.signals[name];if(s.error)notes.push(b.id+' '+name+': '+s.error);else signals[name]=s;});return Object.assign({},b,{signals:signals});}).filter(function(b){return Object.keys(b.signals).length;});if(!bound.length){if(!range)part.map={};return {};}
      // A missing connector must not prevent its healthy peer from refreshing.
      if(!part.available){var gone=part.note || (part.definition.name!=='Traces'?part.definition.name+' unavailable.':telemetryTraceJobs(bound).some(function(job){return job.signal.source==='tempo';})?'Tempo trace search is not connected.':'');if(gone)notes.push(gone);return {};}
      var fn=range?part.adapter.options.history:part.adapter.options.provider;
      if(!fn){notes.push(part.definition.name+' historical metrics unsupported; samples are unobserved.');return {};}
      try{
        var note='',waiting={},partReport={note:function(text){note=text;if(!retired && epoch===generation && !signal.aborted){if(!range)part.resultNote=text;progressNotes[part.definition.name]=text;if(report && report.note)report.note(telemetryNotes(notes.concat(Object.keys(progressNotes).map(function(k){return progressNotes[k];}))));}},pending:function(id,name){if(range && !range.window || retired || epoch!==generation || signal.aborted)return;waiting[JSON.stringify([id,name])]=[id,name];if(report && report.pending)report.pending(id,name);},settled:function(id,name,sample){if(range && !range.window || retired || epoch!==generation || signal.aborted)return;delete waiting[JSON.stringify([id,name])];if(report && report.settled)report.settled(id,name,sample);}};
        var value;
        if(range && range.window)value=await fn(bound,range,signal,partReport);
        else if(range){
          var identity=JSON.stringify([telemetryProviderConfig(current,ctl),part.adapter.options.historyKey?part.adapter.options.historyKey():null]);
          var saved=await part.historyCache.loadBindings(identity,bound,range,signal,function(batch,dates){
            var message='';return Promise.resolve(fn(batch,dates,signal,{note:function(text){message=text;}})).then(function(map){return {map:map,note:message};});
          });value=saved.map;note=saved.note;
        }else value=await fn(bound,signal,partReport);
        if(retired || epoch!==generation || signal.aborted)return {};
        if(note)notes.push(note);if(!range){part.map=value;part.resultNote=note;}return value;
      }catch(e){
        if(retired || epoch!==generation || signal.aborted)return {};
        part.resultNote=e.message || part.definition.name+' unavailable.';notes.push(part.resultNote);if(e.state==='approval')approval=true;
        // Grafana's established transient-error cache is source-local. Honeycomb
        // cannot turn a failed exact-result download into an observed sample.
        if(part.definition.name==='Honeycomb' || part.definition.name==='Traces')part.map={};
        else Object.keys(part.map).forEach(function(id){var b=bound.find(function(b){return b.id===id;});Object.keys(part.map[id].signals || {}).forEach(function(name){var s=b && b.signals[name];if(!s || s.source==='cloudwatch' || s.source==='cloudwatchLogs' || s.source==='loki')delete part.map[id].signals[name];});if(!Object.keys(part.map[id].signals).length)delete part.map[id];});
        return range?{}:part.map;
      }finally{if((!range || range.window) && waiting)Object.keys(waiting).forEach(function(key){var pair=waiting[key];partReport.settled(pair[0],pair[1],null);});}
    }));
    if(retired || epoch!==generation || signal.aborted)throw new Error('Metrics session retired.');
    if(report && report.note)report.note(telemetryNotes(notes));
    var map=telemetryProviderMerge(answers);
    if(approval && !Object.keys(map).length){var error=new Error(telemetryNotes(notes));error.state='approval';throw error;}
    return map;
  }
  var options={directTrace:createTelemetryDirectMcp(win),historyMode:'window',managesPending:true,traceStatus:function(){var part=parts.find(function(p){return p.definition.name==='Traces';});return {available:!!(part && part.available),note:part && (part.resultNote || part.note) || ''};},environmentChanged:function(){generation++;bindingKey=bindingIdentity(ctl.telemetry.bindings());parts.forEach(function(p){p.bindingKey=bindingIdentity(scoped(ctl.telemetry.bindings(),p));p.map={};p.resultNote='';p.historyCache.clear();if(p.adapter.options.environmentChanged)p.adapter.options.environmentChanged();});},canChooseExemplar:function(id,token,traceId){var part=parts.find(function(p){return p.definition.name==='Traces';});return !!(!retired && part && part.available && part.adapter.options.canChooseExemplar(id,token,traceId));},chooseExemplar:function(id,token,traceId){var part=parts.find(function(p){return p.definition.name==='Traces';});if(retired || !part || !part.available)throw new Error('Trace selection unavailable.');return part.adapter.options.chooseExemplar(id,token,traceId);},
    // #1289: a reused answer's example traces, registered again under fresh tokens ({id: exemplar}).
    restoreExemplars:function(map){var part=parts.find(function(p){return p.definition.name==='Traces';});return !retired && part && part.available && part.adapter.options.restoreExemplars?part.adapter.options.restoreExemplars(map):{};},available:false,source:function(){return parts.filter(function(p){return p.available;}).map(function(p){return p.definition.name;}).join(' / ');},provider:function(b,s,r){return run(b,s,r);},history:function(b,r,s,n){return run(b,s,n,r);},historyKey:function(){return parts.map(function(p){return [p.definition.name,p.adapter.options.historyKey?p.adapter.options.historyKey():null];});}};
  // Direct detail requests share the connector account boundary even when
  // numeric Metrics is off or this board has no scoped query bindings.
  if(options.directTrace){
    options.directTrace.accountRetired=function(){return retired;};
    options.directTrace.accountChanged=accountChanged;
    options.directTrace.onAccountChanged=function(fn){accountListeners.push(fn);return function(){var i=accountListeners.indexOf(fn);if(i>=0)accountListeners.splice(i,1);};};
  }
  return {options:options,attach:function(next,nextPage){
    current=nextPage || current;ctl=next;generation++;parts=[];bindingKey=bindingIdentity(ctl.telemetry.bindings());ensure();availability();
    off=ctl.telemetry.onChange(function(snapshot){
      if(!snapshot.enabled)parts.forEach(function(p){p.map={};});
      var nextKey=bindingIdentity(ctl.telemetry.bindings());
      if(nextKey!==bindingKey && !ensuring && !retired){
        bindingKey=nextKey;generation++;
        parts=parts.filter(function(p){var scopedKey=bindingIdentity(scoped(ctl.telemetry.bindings(),p));if(p.bindingKey===scopedKey)return true;
          // Selected history owns binding invalidation. Retain connected numeric
          // adapters so adding a detail cannot retract completed peer windows.
          if(snapshot.historical && p.definition.name!=='Traces'){p.bindingKey=scopedKey;p.map={};p.historyCache.clear();if(p.adapter.options.environmentChanged)p.adapter.options.environmentChanged();return true;}
          if(p.handle)p.handle.destroy();return false;});ensure();
        if(snapshot.enabled && !snapshot.historical && ctl.telemetry.retry)ctl.telemetry.retry();
      }else ensure();
    });
    var mine=ctl,handle={destroy:function(){if(ctl!==mine)return;generation++;if(off)off();off=null;parts.forEach(function(p){if(p.handle)p.handle.destroy();});parts=[];ctl=null;}};
    if(ctl.liveStatus && ctl.liveStatus.onDestroy){var detach=ctl.liveStatus.onDestroy(handle.destroy),destroy=handle.destroy;handle.destroy=function(){detach();destroy();};}
    return handle;
  }};
}
