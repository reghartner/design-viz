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
  var current=page,ctl=null,parts=[],retired=false,generation=0,ensuring=false,off=null,bindingKey=null;
  var definitions=[{name:'Grafana',sources:['grafana','loki','sql'],create:createTelemetryGrafana},{name:'Honeycomb',sources:['honeycomb'],create:createTelemetryHoneycomb},{name:'Traces',sources:[],create:createTelemetryTraces}];
  function scoped(bindings,part){if(part.definition.name==='Traces')return bindings.filter(function(b){return telemetryTraceJobs([b]).length;});return bindings.map(function(binding){var signals={};Object.keys(binding.signals || {}).forEach(function(name){if(part.definition.sources.indexOf(binding.signals[name].source)>=0 && !telemetryTraceIntent(binding.signals[name]))signals[name]=binding.signals[name];});return Object.assign({},binding,{signals:signals});}).filter(function(binding){return Object.keys(binding.signals).length;});}
  function bindingIdentity(bindings){return JSON.stringify(bindings.map(function(b){return [b,ctl && ctl.telemetry.bindingGeneration?ctl.telemetry.bindingGeneration(b.id):0];}));}
  function availability(){if(ctl)ctl.telemetry.setAvailable(!retired && parts.some(function(p){return p.available;}));}
  function accountChanged(){if(retired)return;retired=true;generation++;parts.forEach(function(p){p.map={};p.available=false;});if(ctl){ctl.telemetry.clear();ctl.telemetry.setAvailable(false);}parts.forEach(function(p){if(p.handle)p.handle.destroy();});}
  function ensure(){
    if(!ctl || retired || ensuring)return;ensuring=true;
    try{var bindings=ctl.telemetry.bindings();definitions.forEach(function(definition){
      if(parts.some(function(p){return p.definition===definition;}))return;
      var part={definition:definition,map:{},available:false,adapter:null,handle:null,historyCache:telemetryHistoryCache(),bindingKey:null};
      if(!scoped(bindings,part).length)return;part.bindingKey=bindingIdentity(scoped(bindings,part));
      part.adapter=definition.create(current,win,null,function(){return ctl && scoped(ctl.telemetry.bindings(),part).length;});
      if(!part.adapter)return;parts.push(part);
      var api=ctl.telemetry,facade={
        bindings:function(){return scoped(api.bindings(),part);},enabled:function(){return api.enabled();},
        setEnabled:function(value){if(value && api.enabled() && api.retry)api.retry();},
        setAvailable:function(value){var was=part.available;part.available=!!value;if(!value){part.map={};part.historyCache.clear();if(part.definition.name==='Traces'){if(api.retractExemplars)api.retractExemplars();}else if(api.retractSources)api.retractSources(part.definition.sources);}availability();if(value && !was && api.enabled() && api.retry)api.retry();},
        clear:function(){part.map={};part.historyCache.clear();if(part.definition.name==='Traces'){if(api.retractExemplars)api.retractExemplars();}else if(api.retractSources)api.retractSources(part.definition.sources);},accountChanged:accountChanged,
        onChange:function(fn){return api.onChange(function(snapshot){fn(Object.assign({},snapshot,{available:part.available}));});}
      };
      part.handle=part.adapter.attach({telemetry:facade,liveStatus:ctl.liveStatus},current);
    });}finally{ensuring=false;}
  }
  async function run(bindings,signal,report,range){
    ensure();var epoch=generation,notes=[],approval=false;
    if(retired || signal.aborted)throw new Error('Metrics session retired.');
    var answers=await Promise.all(parts.map(async function(part){
      var bound=scoped(bindings,part);if(!bound.length){if(!range)part.map={};return {};}
      // A missing connector must not prevent its healthy peer from refreshing.
      if(!part.available){notes.push(part.definition.name+' unavailable.');return {};}
      var fn=range?part.adapter.options.history:part.adapter.options.provider;
      if(!fn){notes.push(part.definition.name+' historical metrics unsupported; samples are unobserved.');return {};}
      try{
        var note='',partReport={note:function(text){note=text;}};
        var value;
        if(range){
          var identity=JSON.stringify([trackingTelemetry(current),part.adapter.options.historyKey?part.adapter.options.historyKey():null]);
          var saved=await part.historyCache.loadBindings(identity,bound,range,signal,function(batch,dates){
            var message='';return Promise.resolve(fn(batch,dates,signal,{note:function(text){message=text;}})).then(function(map){return {map:map,note:message};});
          });value=saved.map;note=saved.note;
        }else value=await fn(bound,signal,partReport);
        if(retired || epoch!==generation || signal.aborted)return {};
        if(note)notes.push(note);if(!range)part.map=value;return value;
      }catch(e){
        if(retired || epoch!==generation || signal.aborted)return {};
        notes.push(e.message || part.definition.name+' unavailable.');if(e.state==='approval')approval=true;
        // Grafana's established transient-error cache is source-local. Honeycomb
        // cannot turn a failed exact-result download into an observed sample.
        if(part.definition.name==='Honeycomb' || part.definition.name==='Traces')part.map={};
        return range?{}:part.map;
      }
    }));
    if(retired || epoch!==generation || signal.aborted)throw new Error('Metrics session retired.');
    if(report && report.note)report.note(notes.join('; '));
    var map=telemetryProviderMerge(answers);
    if(approval && !Object.keys(map).length){var error=new Error(notes.join('; '));error.state='approval';throw error;}
    return map;
  }
  var options={chooseExemplar:function(id,token,traceId){var part=parts.find(function(p){return p.definition.name==='Traces';});if(retired || !part || !part.available)throw new Error('Trace selection unavailable.');return part.adapter.options.chooseExemplar(id,token,traceId);},available:false,source:function(){return parts.filter(function(p){return p.available;}).map(function(p){return p.definition.name;}).join(' / ');},provider:function(b,s,r){return run(b,s,r);},history:function(b,r,s,n){return run(b,s,n,r);},historyKey:function(){return parts.map(function(p){return [p.definition.name,p.adapter.options.historyKey?p.adapter.options.historyKey():null];});}};
  return {options:options,attach:function(next,nextPage){
    current=nextPage || current;ctl=next;generation++;parts=[];bindingKey=bindingIdentity(ctl.telemetry.bindings());ensure();availability();
    off=ctl.telemetry.onChange(function(snapshot){
      if(!snapshot.enabled)parts.forEach(function(p){p.map={};});
      var nextKey=bindingIdentity(ctl.telemetry.bindings());
      if(nextKey!==bindingKey && !ensuring && !retired){
        bindingKey=nextKey;generation++;
        parts=parts.filter(function(p){if(p.bindingKey===bindingIdentity(scoped(ctl.telemetry.bindings(),p)))return true;if(p.handle)p.handle.destroy();return false;});ensure();
        if(snapshot.enabled && ctl.telemetry.retry)ctl.telemetry.retry();
      }else ensure();
    });
    var mine=ctl,handle={destroy:function(){if(ctl!==mine)return;generation++;if(off)off();off=null;parts.forEach(function(p){if(p.handle)p.handle.destroy();});parts=[];ctl=null;}};
    if(ctl.liveStatus && ctl.liveStatus.onDestroy){var detach=ctl.liveStatus.onDestroy(handle.destroy),destroy=handle.destroy;handle.destroy=function(){detach();destroy();};}
    return handle;
  }};
}
