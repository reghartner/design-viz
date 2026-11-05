/* Telemetry runtime (#939): the host's telemetry provider, `ctl.telemetry`, and
   the state behind the Live status panel's Metrics button. Metrics is off by
   default and is never persisted. Canvas cues appear only while Metrics is on.

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
/* Each page's telemetry templates, parsed once per walk. */
function telemetryTemplates(){
  var pages=[],templates=[];
  return function(source){var i=pages.indexOf(source);if(i<0){pages.push(source);templates.push(trackingTelemetry(source).templates);i=pages.length-1;}return templates[i];};
}
/* The binding list handed to the provider. eachCarrier(fn) walks every carrier
   as fn(value, id, sourcePage); the Jira overlay's refs() shares that walk. */
function telemetryBindings(eachCarrier){
  var out=[],seen=Object.create(null),templatesOf=telemetryTemplates();
  eachCarrier(function(value,id,source){
    if(typeof id!=='string' || !id || seen[id])return;
    var binding=carrierTelemetry(value,templatesOf(source));if(!binding)return;
    seen[id]=true;
    out.push({id:id,kind:binding.kind,signals:binding.signals,proof:binding.proof,links:binding.links,card:binding.card});
  });
  return out;
}
/* The proof engine input (src/core/proof.js) for the page walk: every carrier,
   bound or not (text boxes are not carriers), with its tickets and parsed
   binding; a repeated id keeps its first bound occurrence, else its first. Steps
   are the authored step ids over their directly selected carriers.
   eachDiagram(fn) walks every diagram as fn(diagram, sourcePage). */
function telemetryProofInput(eachCarrier,eachDiagram,jiraMap,telemetryMap){
  var carriers=[],index=Object.create(null),templatesOf=telemetryTemplates(),steps=[],seen=Object.create(null);
  eachCarrier(function(value,id,source){
    if(typeof id!=='string' || !id || !telemetryObject(value) || isTextBoxNode(value))return;
    var binding=carrierTelemetry(value,templatesOf(source));
    var entry={id:id,tickets:trackingRefs(value).tickets,kind:binding?binding.kind:null,signals:binding?binding.signals:{},proof:binding?binding.proof:{}};
    if(!(id in index)){index[id]=carriers.length;carriers.push(entry);}
    else if(binding && !Object.keys(carriers[index[id]].signals).length)carriers[index[id]]=entry;
  });
  eachDiagram(function(diagram){(Array.isArray(diagram.steps)?diagram.steps:[]).forEach(function(step){
    if(!telemetryObject(step) || typeof step.id!=='string' || !step.id || seen[step.id])return;
    seen[step.id]=true;
    steps.push({id:step.id,carriers:liveStatusStepCarriers(diagram,step,true).map(function(carrier){return carrier.id;})});
  });});
  return {carriers:carriers,jiraMap:jiraMap || {},telemetryMap:telemetryMap || {},steps:steps};
}

/* Canvas cues (#939), shown only while Metrics is on. Classes and attributes
   live in the dv-metrics-* namespace beside the Jira dv-live-* paint and never
   replace it; nothing here writes text on the canvas.
     edge   bound: data-metrics-state (flowing, degraded, silent, unobserved),
            data-metrics-verdict and the dv-metrics-<state> class; degraded is
            amber. A bound call or service edge with traffic gets a packet
            stream: g.dv-metrics-stream[data-metrics-edge] holding 1 to 5 moving
            packets (one per order of magnitude of its primary rate) and as many
            static ones for reduced motion and print; red packets follow the
            error share. A silent Done edge (DONE · UNPROVEN) gets a dotted
            path.dv-metrics-ghost over a dimmed stroke (dv-metrics-ghosted).
     node   bound: the same attributes, and g.dv-metrics-node with a sparkline
            of its primary rate series along the card bottom and a proof seal
            at the bottom-right corner: check PROVEN, ! DEGRADED, slash
            DONE · UNPROVEN, wave LIVE EARLY.
   The primary rate is the signal a ratio limit names as its base, else the
   first with a `min` limit, else the first with a per-time unit; the error
   signal is the ratio limit's numerator. */
var TELEMETRY_RATE_UNIT=/\/\s*(s|sec|second|m|min|minute|h|hr|hour|d|day)s?$/i;
var TELEMETRY_STREAM_KINDS=['call','service'];
var TELEMETRY_CUE_CLASSES=['dv-metrics-bound','dv-metrics-flowing','dv-metrics-degraded','dv-metrics-silent','dv-metrics-unobserved','dv-metrics-ghosted'];
var TELEMETRY_SEALS={proven:'proven','done-degraded':'degraded','active-failing':'degraded','todo-failing':'degraded',degraded:'degraded',
  'done-unproven':'unproven','active-live-early':'live-early','todo-already-live':'live-early'};
var TELEMETRY_SEAL_GLYPHS={proven:'M-3.2 .2L-1 2.4L3.4-2.2',degraded:'M0-3.6V.8M0 2.7V3',unproven:'M-3 3L3-3','live-early':'M-4 .5Q-2-2.5 0 .5T4 .5'};
function telemetryReading(sample,name){
  var signals=sample && telemetryObject(sample.signals)?sample.signals:null,entry=signals && telemetryOwn(signals,name)?signals[name]:null;
  if(!telemetryObject(entry))return {value:null,series:[]};
  var series=(Array.isArray(entry.series)?entry.series:[]).filter(function(point){return Array.isArray(point) && telemetryNumber(point[1]);});
  return {value:telemetryNumber(entry.value)?entry.value:series.length?series[series.length-1][1]:null,series:series};
}
function telemetryPrimary(binding){
  var names=Object.keys(binding.signals),proof=binding.proof || {};
  function numerator(name){return telemetryObject(proof[name]) && typeof proof[name].maxRatioOf==='string';}
  var candidates=names.filter(function(name){return !numerator(name);});
  return candidates.filter(function(name){return names.some(function(other){return numerator(other) && proof[other].maxRatioOf===name;});})[0] ||
    candidates.filter(function(name){return telemetryObject(proof[name]) && telemetryNumber(proof[name].min);})[0] ||
    candidates.filter(function(name){return TELEMETRY_RATE_UNIT.test(binding.signals[name].unit || '');})[0] || null;
}
function telemetryErrorSignal(binding,primary){
  var proof=binding.proof || {};
  return primary && Object.keys(binding.signals).filter(function(name){return telemetryObject(proof[name]) && proof[name].maxRatioOf===primary;})[0] || null;
}
/* 1 to 5 packets, one per order of magnitude: under 10 is 1, under 100 is 2, … */
function telemetryPackets(rate){return telemetryNumber(rate) && rate>0?Math.min(5,Math.max(1,Math.ceil(Math.log(rate+1)/Math.LN10))):0;}
function telemetrySvg(doc,tag,attrs,parent){
  var el=doc.createElementNS(SVGNS,tag);Object.keys(attrs).forEach(function(key){el.setAttribute(key,attrs[key]);});
  if(parent)parent.appendChild(el);return el;
}
function telemetryClearCues(scope){
  scope.querySelectorAll('.dv-metrics-stream,.dv-metrics-ghost,.dv-metrics-node').forEach(function(el){el.remove();});
  scope.querySelectorAll('[data-metrics-state]').forEach(function(el){
    TELEMETRY_CUE_CLASSES.forEach(function(name){el.classList.remove(name);});
    el.removeAttribute('data-metrics-state');el.removeAttribute('data-metrics-verdict');
  });
}
/* Repaints one rendered diagram. view is {map, verdicts} while Metrics is on,
   null to clear. templates are the diagram's page templates. */
function telemetryPaintCues(scope,diagram,templates,view){
  telemetryClearCues(scope);
  if(!view || !diagram)return;
  var doc=scope.ownerDocument || document;
  function mark(el,id){
    var result=view.verdicts.carriers[id] || null,state=result && result.telemetry || 'unobserved';
    el.classList.add('dv-metrics-bound','dv-metrics-'+state);el.setAttribute('data-metrics-state',state);
    if(result && result.verdict)el.setAttribute('data-metrics-verdict',result.verdict);
    return result;
  }
  scope.querySelectorAll('path.edge[data-dv-edge]').forEach(function(path){
    var index=path.getAttribute('data-dv-edge'),edge=(diagram.edges || [])[Number(index)];
    var binding=telemetryObject(edge)?carrierTelemetry(edge,templates):null;if(!binding)return;
    var id=edge.from+'->'+edge.to,result=mark(path,id),svg=path.closest('svg');
    if(!result || !svg)return;
    if(result.verdict==='done-unproven'){
      path.classList.add('dv-metrics-ghosted');
      path.parentNode.insertBefore(telemetrySvg(doc,'path',{'class':'dv-metrics-ghost','data-metrics-edge':index,d:path.getAttribute('d') || '','aria-hidden':'true','pointer-events':'none'}),path.nextSibling || null);
    }
    if((result.telemetry!=='flowing' && result.telemetry!=='degraded') || TELEMETRY_STREAM_KINDS.indexOf(binding.kind)<0)return;
    var sample=view.map[id],primary=telemetryPrimary(binding),rate=primary?telemetryReading(sample,primary).value:null,count=telemetryPackets(rate);
    if(!count)return;
    var errorName=telemetryErrorSignal(binding,primary),errors=errorName?telemetryReading(sample,errorName).value:null;
    var red=Math.min(count,Math.round(count*(errors!==null?Math.min(1,Math.max(0,errors/rate)):0)));
    if(!red && errorName && result.failing.indexOf(errorName)>=0)red=1;
    var group=telemetrySvg(doc,'g',{'class':'dv-metrics-stream','data-metrics-edge':index,'aria-hidden':'true','pointer-events':'none'},svg);
    var length=typeof path.getTotalLength==='function'?path.getTotalLength():0,dur=Math.max(1.6,length/260),domId=path.getAttribute('id');
    for(var k=0;k<count;k++){
      var cls='dv-metrics-packet'+(k<red?' dv-metrics-packet-error':''),begin=(-(k*dur/count)).toFixed(2)+'s';
      var moving=telemetrySvg(doc,'circle',{'class':cls+' dv-metrics-moving',r:3.2},group);
      // The ordinary packet's motion (engine packetMotion) follows the edge by its id.
      moving.appendChild(domId?packetMotion(domId,dur,begin,false):telemetrySvg(doc,'animateMotion',{dur:dur.toFixed(2)+'s',begin:begin,repeatCount:'indefinite',path:path.getAttribute('d') || ''}));
      var at=length && typeof path.getPointAtLength==='function'?path.getPointAtLength(length*(k+.5)/count):{x:0,y:0};
      telemetrySvg(doc,'circle',{'class':cls+' dv-metrics-static',r:3.2,cx:at.x,cy:at.y},group);
    }
  });
  scope.querySelectorAll('g.node[data-dv-node]').forEach(function(el){
    if(el.classList.contains('node-text'))return;
    var id=el.getAttribute('data-dv-node'),value=(diagram.nodes || {})[id];
    var binding=telemetryObject(value) && !isTextBoxNode(value)?carrierTelemetry(value,templates):null;if(!binding)return;
    var result=mark(el,id),card=el.querySelector('.card');if(!card)return;
    var w=Number(card.getAttribute('width') || card.getAttribute('data-node-width')),h=Number(card.getAttribute('height') || card.getAttribute('data-node-height'));
    if(!isFinite(w) || !isFinite(h) || w<40 || h<30)return;
    var art=telemetrySvg(doc,'g',{'class':'dv-metrics-node','aria-hidden':'true','pointer-events':'none'},el);
    var primary=telemetryPrimary(binding),series=primary?telemetryReading(view.map[id],primary).series:[];
    if(series.length>=2){
      var values=series.map(function(point){return point[1];}),low=Math.min.apply(null,values),high=Math.max.apply(null,values);
      var left=10,right=w-22,top=h-11,bottom=h-4;
      telemetrySvg(doc,'polyline',{'class':'dv-metrics-sparkline',points:series.map(function(point,i){
        var x=left+(right-left)*i/(series.length-1),y=high===low?(top+bottom)/2:bottom-(bottom-top)*(point[1]-low)/(high-low);
        return x.toFixed(1)+','+y.toFixed(1);
      }).join(' ')},art);
    }
    var seal=result && TELEMETRY_SEALS[result.verdict];
    if(seal){
      var badge=telemetrySvg(doc,'g',{'class':'dv-metrics-seal','data-seal':seal,transform:'translate('+(w-10)+' '+(h-10)+')'},art);
      telemetrySvg(doc,'circle',{r:7},badge);telemetrySvg(doc,'path',{d:TELEMETRY_SEAL_GLYPHS[seal]},badge);
    }
    if(!art.children.length)art.remove();
  });
}

/* ctl.telemetry. hooks: {carriers: eachCarrier, diagrams: eachDiagram,
   jira: function() → the runtime Jira map, changed: function()}. changed lets
   the Live status panel and the canvas follow a telemetry change. In return
   createTelemetry sets hooks.view() ({map, verdicts} while Metrics is on, else
   null) for the canvas painter and hooks.jiraChanged(), which the Jira side
   calls so subscribers receive re-judged verdicts. */
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
  function emit(){if(retired || !listeners.length)return;var value=api.snapshot();listeners.slice().forEach(function(fn){fn(value);});}
  function notify(){
    if(retired)return;emit();
    if(typeof hooks.changed==='function')hooks.changed();
  }
  function verdicts(){
    return proofVerdicts(telemetryProofInput(typeof hooks.carriers==='function'?hooks.carriers:function(){},typeof hooks.diagrams==='function'?hooks.diagrams:function(){},
      typeof hooks.jira==='function'?hooks.jira():{},map));
  }
  hooks.view=function(){return enabled && !retired?{map:map,verdicts:verdicts()}:null;};
  hooks.jiraChanged=emit;
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
      if(enabled)setStatus({state:'ok',refreshedAt:new Date().toISOString(),note:''});
      notify();
    },
    clear:function(){if(retired)return;map=Object.create(null);notify();},
    snapshot:function(){return {available:!!(provider || demo),enabled:enabled,map:copy(map),status:copy(status),verdicts:copy(verdicts())};},
    verdicts:function(){return copy(verdicts());},
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
