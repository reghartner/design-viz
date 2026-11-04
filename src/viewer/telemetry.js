/* Telemetry runtime (#939): the host's telemetry provider, `ctl.telemetry`, and
   the state behind the Live status panel's Metrics button. Metrics is off by
   default and is never persisted. Nothing here paints the canvas.

   Host option, beside `liveStatus`:
     renderPage(..., {telemetry: {provider: function(bindings, signal, report), refreshMs, source, demo}})

   bindings  Every bound carrier of the page, its imported topology and its
             loaded detail pages, once each, in page order (a repeated id keeps
             its first binding): [{id, kind, signals, proof, links, card}].
             id is a node id ('ingest'), an edge identity ('mcu->ingest') or a
             resolved imported identity ('shared::api->shared::store'); the
             other fields are carrierTelemetry(carrier, templates).
   signal    An AbortSignal, aborted when Metrics turns off or the page is
             destroyed. A late answer after that is dropped.
   report    {note(text)}: a note for this answer, such as a query that failed
             while the others answered. It rides that answer's status().note;
             an answer without one clears the note.
   provider  Resolves the telemetry map, the contract every adapter implements
             (Grafana #943, mock Grafana #944, Honeycomb #946) and the
             telemetryMap input of proofVerdicts (src/core/proof.js):
               {<carrier id>: {
                  signals: {<signal name>: {value: <number>,
                                            series: [[t, v], ...],
                                            unit: <string>}},
                  observedAt: <ISO time or epoch ms>,
                  markers: [{at: <ISO time or epoch ms>, kind: <string>, label: <string>}],
                  links: {query: <http(s) URL>, dashboard: <http(s) URL>}}}
             value is the headline number for the window; series points ascend
             in time, t in epoch ms or ISO text. Every field is optional.
             apply() keeps exactly this shape: malformed entries, points and
             links are dropped, times become ISO text, and each kept carrier
             always has signals, observedAt (or null), markers and links.
   refreshMs The refresh interval while Metrics is on. Without it the page's
             tracking.telemetry.refreshMs applies, else one minute. Never
             below 60000.
   source    Optional connector name for the panel's Metrics text
             ('Grafana' from the claude.ai adapter, viewer/telemetry-claude.js).
   demo      Optional {mount(api) → cleanup}: a demo source mounted when Metrics
             turns on and cleaned up when it turns off. It feeds api.apply().

   A rejection keeps the map and sets status 'error' with its message as the
   note; a rejection whose `state` is 'approval' sets status 'approval'.

   The first provider call runs when Metrics turns on; refresh pauses while
   the document is hidden and catches up once on return (liveStatusPoller). */
function telemetryTime(value){
  var ms=typeof value==='number'?value:typeof value==='string'?Date.parse(value):NaN;
  return isFinite(ms)?new Date(ms).toISOString():null;
}
function telemetryPoint(point){
  return Array.isArray(point) && point.length===2 && (telemetryNumber(point[0]) || typeof point[0]==='string' && isFinite(Date.parse(point[0]))) && telemetryNumber(point[1]);
}
/* One carrier's sample, kept to the provider result contract; null when unusable. */
function telemetrySample(raw){
  if(!telemetryObject(raw))return null;
  var out={signals:{},observedAt:telemetryTime(raw.observedAt),markers:[],links:{}};
  if(telemetryObject(raw.signals))Object.keys(raw.signals).forEach(function(name){
    var value=raw.signals[name],entry={};
    if(!telemetryNamePattern.test(name) || !telemetryObject(value))return;
    if(telemetryNumber(value.value))entry.value=value.value;
    if(Array.isArray(value.series))entry.series=value.series.filter(telemetryPoint).map(function(point){return [point[0],point[1]];});
    if(telemetryText(value.unit))entry.unit=value.unit;
    out.signals[name]=entry;
  });
  if(Array.isArray(raw.markers))raw.markers.forEach(function(marker){
    var at=telemetryObject(marker)?telemetryTime(marker.at):null,kept;
    if(!at)return;kept={at:at};
    ['kind','label'].forEach(function(field){if(telemetryText(marker[field]))kept[field]=marker[field];});
    out.markers.push(kept);
  });
  if(telemetryObject(raw.links))TELEMETRY_LINKS.forEach(function(key){var url=deltaLinkUrl(raw.links[key]);if(url)out.links[key]=url;});
  return out;
}
/* The binding list handed to the provider. eachCarrier(fn) walks every carrier
   as fn(value, id, sourcePage); the Jira overlay's refs() shares that walk. */
function telemetryBindings(eachCarrier){
  var out=[],seen=Object.create(null),pages=[],templates=[];
  function templatesOf(source){var i=pages.indexOf(source);if(i<0){pages.push(source);templates.push(trackingTelemetry(source).templates);i=pages.length-1;}return templates[i];}
  eachCarrier(function(value,id,source){
    if(typeof id!=='string' || !id || seen[id])return;
    var binding=carrierTelemetry(value,templatesOf(source));if(!binding)return;
    seen[id]=true;
    out.push({id:id,kind:binding.kind,signals:binding.signals,proof:binding.proof,links:binding.links,card:binding.card});
  });
  return out;
}
/* ctl.telemetry. hooks: {carriers: eachCarrier, changed: function()} — changed
   lets the Live status panel repaint its Metrics button and connector text. */
function createTelemetry(page,options,hooks){
  options=options || {};hooks=hooks || {};
  var provider=typeof options.provider==='function'?options.provider:null;
  var demo=options.demo && typeof options.demo.mount==='function'?options.demo:null;
  var configured=Number(options.refreshMs),authored=trackingTelemetry(page || {}).refreshMs;
  var delay=Math.max(TELEMETRY_MIN_REFRESH_MS,configured>0 && isFinite(configured)?configured:authored || TELEMETRY_MIN_REFRESH_MS);
  var map=Object.create(null),enabled=false,retired=false,listeners=[],demoCleanup=null;
  var status={state:provider || demo?'idle':'absent',busy:false,refreshedAt:null,note:''};
  function copy(value){return JSON.parse(JSON.stringify(value));}
  function bindings(){return typeof hooks.carriers==='function'?telemetryBindings(hooks.carriers):[];}
  function notify(){
    if(retired)return;var value=api.snapshot();
    listeners.slice().forEach(function(fn){fn(value);});
    if(typeof hooks.changed==='function')hooks.changed();
  }
  function setStatus(next){Object.keys(next).forEach(function(key){status[key]=next[key];});}
  function store(value){
    var next=Object.create(null);
    if(telemetryObject(value))Object.keys(value).forEach(function(id){var sample=telemetrySample(value[id]);if(id && sample)next[id]=sample;});
    map=next;
  }
  // Each call gets its own report; its note travels with that call's answer only.
  var poller=provider?liveStatusPoller(function(signal){
    var noted='',report={note:function(text){noted=typeof text==='string'?text:'';}};
    return Promise.resolve(provider(bindings(),signal,report)).then(function(value){return {value:value,note:noted};});
  },delay,{
    busy:function(){setStatus({busy:true});notify();},
    result:function(answer){store(answer.value);setStatus({state:'ok',busy:false,refreshedAt:new Date().toISOString(),note:answer.note});notify();},
    error:function(error){setStatus({state:error && error.state==='approval'?'approval':'error',busy:false,note:error && typeof error.message==='string'?error.message:String(error)});notify();}
  }):null;
  function stopDemo(){var cleanup=demoCleanup;demoCleanup=null;if(typeof cleanup==='function'){try{cleanup();}catch(ex){}}}
  var api={
    bindings:function(){return copy(bindings());},
    apply:function(value){
      if(retired)return;store(value);
      if(enabled && !provider)setStatus({state:'ok',refreshedAt:new Date().toISOString(),note:''});
      notify();
    },
    clear:function(){if(retired)return;map=Object.create(null);notify();},
    snapshot:function(){return {available:!!(provider || demo),enabled:enabled,map:copy(map),status:copy(status)};},
    status:function(){return copy(status);},
    enabled:function(){return enabled;},
    setEnabled:function(value){
      value=!!value;
      if(retired || !(provider || demo) || value===enabled)return;
      enabled=value;
      if(enabled){
        setStatus({state:'loading',busy:false,refreshedAt:null,note:''});
        if(poller)poller.start();
        if(demo){var cleanup=demo.mount(api);demoCleanup=typeof cleanup==='function'?cleanup:null;}
      }else{
        if(poller)poller.stop();stopDemo();
        map=Object.create(null);setStatus({state:'idle',busy:false,refreshedAt:null,note:''});
      }
      notify();
    },
    onChange:function(fn){if(typeof fn!=='function' || retired)return function(){};listeners.push(fn);return function(){var i=listeners.indexOf(fn);if(i>=0)listeners.splice(i,1);};},
    destroy:function(){if(retired)return;retired=true;enabled=false;if(poller)poller.stop();stopDemo();listeners=[];}
  };
  return api;
}
