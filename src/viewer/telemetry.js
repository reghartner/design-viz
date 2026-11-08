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
                                            observedAt: <measurement as-of, or null>,
                                            retrievedAt: <client receipt time>,
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
function telemetryWindowMs(text){
  var duration=telemetryWindowDuration(text) || TELEMETRY_DEFAULT_WINDOW;
  return Number(duration.slice(0,-1))*{s:1000,m:60000,h:3600000,d:86400000,w:604800000}[duration.slice(-1)];
}
function telemetryTime(value){
  var ms=typeof value==='number'?value:typeof value==='string'?Date.parse(value):NaN;
  var date=new Date(ms);return isFinite(date.getTime())?date.toISOString():null;
}
function telemetryPoint(point){
  return Array.isArray(point) && point.length===2 && (telemetryNumber(point[0]) || typeof point[0]==='string' && isFinite(Date.parse(point[0]))) && telemetryNumber(point[1]);
}
/* An explicit measured total, never inferred from a rate, unit or series. The
   observation must cover the entire measured interval. Invalid metadata leaves
   a valid ordinary headline intact, but cannot authorize a since-Done total. */
function telemetrySignalTime(entry,carrierTime){
  return telemetryTime(entry && telemetryOwn(entry,'observedAt')?entry.observedAt:carrierTime);
}
function telemetryAggregate(entry,observedAt){
  var aggregate=entry && entry.aggregate,observed=telemetrySignalTime(entry,observedAt);
  if(!telemetryObject(aggregate) || aggregate.kind!=='total' || !telemetryNumber(entry.value) || entry.value<0 || entry.value>Number.MAX_SAFE_INTEGER || !observed)return null;
  var from=telemetryTime(aggregate.from),to=telemetryTime(aggregate.to);
  if(!from || !to || Date.parse(from)>=Date.parse(to) || Date.parse(to)>Date.parse(observed))return null;
  return {kind:'total',from:from,to:to};
}
/* Bounded log evidence, including native host samples. Invalid details cannot
   erase a valid scalar, nor masquerade as a successful empty result. */
function telemetryLogDetails(raw){
  function error(message){return {status:'error',error:String(message).replace(/\s+/g,' ').slice(0,500)};}
  if(!telemetryObject(raw))return error('Malformed log details');
  if(raw.status==='error')return error(telemetryText(raw.error)?raw.error:'Log details unavailable');
  var from=raw.range && telemetryTime(raw.range.from),to=raw.range && telemetryTime(raw.range.to);
  if(raw.status!=='complete' || !from || !to || Date.parse(from)>=Date.parse(to) || !Array.isArray(raw.rows) || !Number.isInteger(raw.limit) || raw.limit<1 || raw.limit>100 || !Number.isSafeInteger(raw.returnedRows) || raw.returnedRows<raw.rows.length || Math.min(raw.rows.length,raw.limit)!==Math.min(raw.returnedRows,raw.limit))return error('Malformed log details');
  var truncated=!!raw.textTruncated,rows=[];
  function text(value){if(value.length>500){truncated=true;return value.slice(0,499)+'…';}return value;}
  for(var i=0;i<Math.min(raw.rows.length,raw.limit);i++){
    var row=raw.rows[i];
    if(!telemetryObject(row) || !telemetryText(row.label) || !telemetryNumber(row.value) || row.value<0 || !Array.isArray(row.cells) || row.cells.length>4 || !row.cells.every(function(v){return typeof v==='string';}))return error('Log details row '+(i+1)+' needs a label, nonnegative count and text cells');
    rows.push({label:text(row.label),value:row.value,cells:row.cells.map(text)});
  }
  return {status:'complete',rows:rows,limit:raw.limit,returnedRows:raw.returnedRows,textTruncated:truncated,range:{from:from,to:to}};
}
/* One carrier's sample, kept to the provider result contract; null when unusable. */
function telemetrySample(raw){
  if(!telemetryObject(raw))return null;
  var out={signals:{},observedAt:telemetryTime(raw.observedAt),markers:[],links:{}};
  if(raw.window && telemetryTime(raw.window.from) && telemetryTime(raw.window.to) && Date.parse(raw.window.from)<Date.parse(raw.window.to))out.window={from:telemetryTime(raw.window.from),to:telemetryTime(raw.window.to)};
  if(telemetryObject(raw.signals))Object.keys(raw.signals).forEach(function(name){
    var value=raw.signals[name],entry={};
    if(!telemetryNamePattern.test(name) || !telemetryObject(value))return;
    if(telemetryNumber(value.value))entry.value=value.value;
    if(Array.isArray(value.series))entry.series=value.series.filter(telemetryPoint).map(function(point){return [point[0],point[1]];});
    if(telemetryText(value.unit))entry.unit=value.unit;
    if(telemetryNumber(value.intervalMs) && value.intervalMs>0)entry.intervalMs=value.intervalMs;
    if(value.links && telemetryQueryUrl(value.links.query))entry.links={query:telemetryQueryUrl(value.links.query)};
    if(value.window && telemetryTime(value.window.from) && telemetryTime(value.window.to) && Date.parse(value.window.from)<Date.parse(value.window.to))entry.window={from:telemetryTime(value.window.from),to:telemetryTime(value.window.to)};
    if(telemetryOwn(value,'observedAt'))entry.observedAt=telemetryTime(value.observedAt);
    if(telemetryOwn(value,'retrievedAt'))entry.retrievedAt=telemetryTime(value.retrievedAt);
    if(value.provenance==='formatted-text')entry.provenance='formatted-text';
    var aggregate=telemetryAggregate(value,out.observedAt);if(aggregate)entry.aggregate=aggregate;
    if(telemetryOwn(value,'breakdown'))entry.breakdown=telemetryLogDetails(value.breakdown);
    out.signals[name]=entry;
  });
  if(Array.isArray(raw.markers))raw.markers.forEach(function(marker){
    var at=telemetryObject(marker)?telemetryTime(marker.at):null,kept;
    if(!at)return;kept={at:at};
    ['kind','label'].forEach(function(field){if(telemetryText(marker[field]))kept[field]=marker[field];});
    out.markers.push(kept);
  });
  if(telemetryObject(raw.links))TELEMETRY_LINKS.forEach(function(key){var url=deltaLinkUrl(raw.links[key]);if(url)out.links[key]=url;});
  if(Array.isArray(raw.exemplars) && raw.exemplars.length<=1 && typeof telemetryTraceEnvelope==='function'){out.exemplars=[];raw.exemplars.forEach(function(v){try{out.exemplars.push(telemetryTraceEnvelope(v));}catch(e){}});}
  return out;
}
/* Each page's telemetry templates, parsed once per walk. */
function telemetryTemplates(){
  var pages=[],templates=[];
  return function(source){var i=pages.indexOf(source);if(i<0){pages.push(source);templates.push(trackingTelemetry(source).templates);i=pages.length-1;}return templates[i];};
}
/* The binding list handed to the provider. eachCarrier(fn) walks every carrier
   as fn(value, id, sourcePage); the Jira overlay's refs() shares that walk. */
function telemetryBindings(eachCarrier,environment,config){
  var out=[],seen=Object.create(null),templatesOf=telemetryTemplates();
  eachCarrier(function(value,id,source){
    if(typeof id!=='string' || !id || seen[id])return;
    var binding=carrierTelemetry(value,templatesOf(source),null,config || telemetryEnvironmentConfig(source,environment));if(!binding)return;
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
function telemetryProofInput(eachCarrier,eachDiagram,jiraMap,telemetryMap,environment,config){
  var carriers=[],index=Object.create(null),templatesOf=telemetryTemplates(),steps=[],seen=Object.create(null);
  eachCarrier(function(value,id,source){
    if(typeof id!=='string' || !id || !telemetryObject(value) || isTextBoxNode(value))return;
    var binding=carrierTelemetry(value,templatesOf(source),null,config || telemetryEnvironmentConfig(source,environment));
    var entry={id:id,title:value.title || value.label || id,tickets:trackingRefs(value).tickets,kind:binding?binding.kind:null,signals:binding?binding.signals:{},proof:binding?binding.proof:{},links:binding?binding.links:{}};
    if(!(id in index)){index[id]=carriers.length;carriers.push(entry);}
    else if(binding && !Object.keys(carriers[index[id]].signals).length)carriers[index[id]]=entry;
  });
  eachDiagram(function(diagram,page){(Array.isArray(diagram.steps)?diagram.steps:[]).forEach(function(step){
    if(!telemetryObject(step) || typeof step.id!=='string' || !step.id || seen[step.id])return;
    seen[step.id]=true;
    var narrowed=trackingStepProofTickets(diagram,step,page);
    steps.push(Object.assign({id:step.id,carriers:liveStatusStepCarriers(diagram,step,true).map(function(carrier){return carrier.id;})},narrowed?{tickets:narrowed}:{}));
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
var TELEMETRY_CUE_CLASSES=['dv-metrics-bound','dv-metrics-flowing','dv-metrics-degraded','dv-metrics-silent','dv-metrics-unobserved','dv-metrics-unmeasured','dv-metrics-ghosted'];
var TELEMETRY_SEALS={proven:'proven','done-degraded':'degraded','active-failing':'degraded','testing-failing':'degraded','todo-failing':'degraded',degraded:'degraded',
  'done-unproven':'unproven','active-live-early':'live-early','testing-live-early':'live-early','todo-already-live':'live-early'};
var TELEMETRY_SEAL_GLYPHS={proven:'M-3.2 .2L-1 2.4L3.4-2.2',degraded:'M0-3.6V.8M0 2.7V3',unproven:'M-3 3L3-3','live-early':'M-4 .5Q-2-2.5 0 .5T4 .5'};
/* Timestamp geometry shared by node and edge mini charts. Missing spans are
   gaps, not interpolated traffic. Even a sole observation remains visible. */
function telemetrySparkline(series,width,height,windowMs,range,intervalMs){
  var points=(series || []).filter(telemetryPoint).map(function(p){return [Date.parse(telemetryTime(p[0])),p[1]];}).filter(function(p){return isFinite(p[0]);}).sort(function(a,b){return a[0]-b[0];});
  if(!points.length)return {points:[],lines:[]};
  var end=range?Date.parse(range.to):points[points.length-1][0],start=range?Date.parse(range.from):end-windowMs;
  if(!(end>start)){start=points[0][0];end=Math.max(start+1,points[points.length-1][0]);}
  points=points.filter(function(p){return p[0]>=start-(intervalMs || 0) && p[0]<=end;});
  var low=Math.min.apply(null,points.map(function(p){return p[1];})),high=Math.max.apply(null,points.map(function(p){return p[1];}));
  var plotted=points.map(function(p){return {x:Math.max(0,width*(p[0]-start)/(end-start)),y:high===low?height/2:height-height*(p[1]-low)/(high-low),at:p[0]};}),lines=[];
  plotted.forEach(function(p,i){if(i && p.at-plotted[i-1].at<=(intervalMs?intervalMs*1.1:(end-start)/4))lines.push([plotted[i-1],p]);});
  return {points:plotted,lines:lines};
}
function telemetryPaintSparkline(doc,parent,series,x,y,width,height,windowMs,range,intervalMs){
  var chart=telemetrySparkline(series,width,height,windowMs,range,intervalMs);
  chart.lines.forEach(function(line){telemetrySvg(doc,'polyline',{'class':'dv-metrics-sparkline',points:line.map(function(p){return (x+p.x).toFixed(1)+','+(y+p.y).toFixed(1);}).join(' ')},parent);});
  chart.points.forEach(function(p){telemetrySvg(doc,'circle',{'class':'dv-metrics-sparkline',cx:x+p.x,cy:y+p.y,r:1.2},parent);});return chart.points.length;
}
function telemetryReading(sample,name){
  var signals=sample && telemetryObject(sample.signals)?sample.signals:null,entry=signals && telemetryOwn(signals,name)?signals[name]:null;
  if(!telemetryObject(entry))return {value:null,series:[]};
  var series=(Array.isArray(entry.series)?entry.series:[]).filter(function(point){return Array.isArray(point) && telemetryNumber(point[1]);});
  return {value:telemetryNumber(entry.value)?entry.value:series.length?series[series.length-1][1]:null,series:series};
}
function telemetryMetricNames(binding){return Object.keys(binding.signals || {}).filter(function(name){return !proofVerdicts.isTraceSignal(binding.signals[name]);});}
function telemetryMetricProofNames(binding){return Object.keys(binding.proof || {}).filter(function(name){var limit=binding.proof[name];return !proofVerdicts.isTraceSignal(binding.signals[name]) && !proofVerdicts.isTraceSignal(binding.signals[limit && limit.maxRatioOf]);});}
function telemetryPrimary(binding,display){
  var names=telemetryMetricNames(binding),proof={};telemetryMetricProofNames(binding).forEach(function(name){proof[name]=binding.proof[name];});
  function numerator(name){return telemetryObject(proof[name]) && typeof proof[name].maxRatioOf==='string';}
  var candidates=names.filter(function(name){return !numerator(name);});
  return candidates.filter(function(name){return names.some(function(other){return numerator(other) && proof[other].maxRatioOf===name;});})[0] ||
    candidates.filter(function(name){return telemetryObject(proof[name]) && telemetryNumber(proof[name].min);})[0] ||
    candidates.filter(function(name){return TELEMETRY_RATE_UNIT.test(binding.signals[name].unit || '');})[0] ||
    (display?candidates.find(function(name){return ['cloudwatch','cloudwatchLogs'].indexOf(binding.signals[name].source)>=0;}):null) || null;
}
function telemetryErrorSignal(binding,primary){
  var proof=binding.proof || {};
  return primary && telemetryMetricNames(binding).filter(function(name){return telemetryObject(proof[name]) && proof[name].maxRatioOf===primary;})[0] || null;
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
function telemetryPaintCues(scope,diagram,templates,view,window){
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
    var binding=telemetryObject(edge)?carrierTelemetry(edge,templates):null;if(!binding || !telemetryMetricNames(binding).length)return;
    var id=edge.from+'->'+edge.to,result=mark(path,id),svg=path.closest('svg');
    if(!result || !svg)return;
    if(result.verdict==='done-unproven'){
      path.classList.add('dv-metrics-ghosted');
      path.parentNode.insertBefore(telemetrySvg(doc,'path',{'class':'dv-metrics-ghost','data-metrics-edge':index,d:path.getAttribute('d') || '','aria-hidden':'true','pointer-events':'none'}),path.nextSibling || null);
    }
    if((result.telemetry!=='flowing' && result.telemetry!=='degraded' && result.telemetry!=='unmeasured') || TELEMETRY_STREAM_KINDS.indexOf(binding.kind)<0)return;
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
    var binding=telemetryObject(value) && !isTextBoxNode(value)?carrierTelemetry(value,templates):null;if(!binding || !telemetryMetricNames(binding).length)return;
    var result=mark(el,id),card=el.querySelector('.card');if(!card)return;
    var w=Number(card.getAttribute('width') || card.getAttribute('data-node-width')),h=Number(card.getAttribute('height') || card.getAttribute('data-node-height'));
    if(!isFinite(w) || !isFinite(h) || w<40 || h<30)return;
    var art=telemetrySvg(doc,'g',{'class':'dv-metrics-node','aria-hidden':'true','pointer-events':'none'},el);
    var shown=telemetryCardBinding(binding),primary=telemetryPrimary(shown,true) || telemetryMetricNames(shown)[0],series=primary?telemetryReading(view.map[id],primary).series:[];
    if(series.length)telemetryPaintSparkline(doc,art,series,10,h-11,w-32,7,telemetryWindowMs(window),view.map[id] && (view.map[id].signals[primary] && view.map[id].signals[primary].window || view.map[id].window),view.map[id] && view.map[id].signals[primary] && view.map[id].signals[primary].intervalMs);
    var seal=result && TELEMETRY_SEALS[result.verdict];
    if(seal){
      var badge=telemetrySvg(doc,'g',{'class':'dv-metrics-seal','data-seal':seal,transform:'translate('+(w-10)+' '+(h-10)+')'},art);
      telemetrySvg(doc,'circle',{r:7},badge);telemetrySvg(doc,'path',{d:TELEMETRY_SEAL_GLYPHS[seal]},badge);
    }
    if(!art.children.length)art.remove();
  });
}

/* History timestamps are evaluation endpoints, each for the previous 24h.
   A missing endpoint stays absent; never forward-fill a retention gap or take
   `value` (which is a live headline). Labels are presentation only. */
function telemetryHistoryTime(value,endpoints){
  // Calendar keys have meaning only through the explicit selected-day metadata.
  if(typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value)){
    var day=(endpoints || []).find(function(item){return item.key===value;});
    return day?telemetryTime(day.at):null;
  }
  return telemetryTime(value);
}
function telemetryHistoryEndpoints(range){
  var from=Date.parse(range.from),to=Date.parse(range.to),seen=Object.create(null),out=[];
  if(Array.isArray(range.endpoints))range.endpoints.forEach(function(day){
    var at=day && telemetryTime(day.at),time=Date.parse(at);
    if(!at || time<from || time>to || seen[at])return;seen[at]=true;
    var item={at:at};if(typeof day.key==='string')item.key=day.key;out.push(item);
  });
  // Backward-compatible callers without metadata explicitly request a daily grid.
  else if(isFinite(from) && isFinite(to))for(var t=from;t<=to;t+=86400000)out.push({at:new Date(t).toISOString()});
  return out.sort(function(a,b){return Date.parse(a.at)-Date.parse(b.at);});
}
function telemetryHistoryRange(endpoints,explicit){
  var range={from:endpoints[0].at,to:endpoints[endpoints.length-1].at};
  if(explicit)range.endpoints=endpoints;return range;
}
function telemetryHistoryDay(value,day){
  var out=Object.create(null),at=day && telemetryTime(day.at);
  if(!at || !telemetryObject(value))return out;
  Object.keys(value).forEach(function(id){
    var sample=telemetrySample(value[id]);if(!sample)return;
    var signals={};
    Object.keys(sample.signals).forEach(function(name){
      var entry=sample.signals[name],points=(entry.series || []).filter(function(point){return telemetryHistoryTime(point[0],[day])===at;});
      if(!points.length)return;
      var point=points[points.length-1];signals[name]={value:point[1],series:[[at,point[1]]]};
      if(entry.unit)signals[name].unit=entry.unit;
    });
    if(Object.keys(signals).length)out[id]={signals:signals,observedAt:at,links:sample.links,markers:[]};
  });
  return out;
}
/* Per-controller seven-day cache, with exact endpoint coverage per full binding.
   A DST tail starts at the next requested instant, never old.to + 24 hours.
   Batch bindings that need the same endpoints so ordinary loads still make one
   provider call. Partial-error and aborted batches never extend coverage. */
function telemetryHistoryCache(now){
  var entries=Object.create(null),clock=now || Date.now;
  function copy(value){return JSON.parse(JSON.stringify(value));}
  function endpointKey(day){return JSON.stringify([day.key || '',day.at]);}
  function prepare(key,range){
    var old=entries[key],endpoints=telemetryHistoryEndpoints(range);
    if(old && clock()-old.at>=LIVE_STATUS_HISTORY_CACHE_MS)old=null;
    return {key:key,old:old,range:range,missing:endpoints.filter(function(day){return !old || old.covered.indexOf(endpointKey(day))<0;})};
  }
  function finish(plan,answer,signal){
    if(signal.aborted)throw new Error('History cancelled');
    var old=plan.old,map=old?copy(old.map):Object.create(null),wanted=plan.missing.map(function(day){return day.at;});
    Object.keys(answer.map || {}).forEach(function(id){
      var sample=telemetrySample(answer.map[id]);if(!sample)return;
      var target=telemetryOwn(map,id)?map[id]:{signals:Object.create(null),markers:[],links:{}};
      Object.keys(sample.signals).forEach(function(name){
        var entry=sample.signals[name],previous=target.signals[name];
        var points=(entry.series || []).map(function(p){return [telemetryHistoryTime(p[0],plan.missing),p[1]];}).filter(function(p){return wanted.indexOf(p[0])>=0;});
        target.signals[name]={series:(previous && previous.series || []).concat(points)};
        if(entry.unit)target.signals[name].unit=entry.unit;
      });
      target.links=sample.links;map[id]=target;
    });
    if(!answer.note)entries[plan.key]={covered:(old?old.covered:[]).concat(plan.missing.map(endpointKey)),at:old?old.at:clock(),map:copy(map)};
    return {map:map,note:answer.note || ''};
  }
  return {clear:function(){entries=Object.create(null);},load:function(key,range,signal,fetch){
    var plan=prepare(key,range);
    if(!plan.missing.length)return Promise.resolve({map:plan.old?copy(plan.old.map):{},note:''});
    return Promise.resolve().then(function(){
      if(signal.aborted)throw new Error('History cancelled');
      return fetch(telemetryHistoryRange(plan.missing,Array.isArray(range.endpoints)));
    }).then(function(answer){return finish(plan,answer,signal);});
  },loadBindings:function(identity,bound,range,signal,fetch){
    var groups=Object.create(null),map=Object.create(null),notes=[];
    bound.forEach(function(binding){
      var plan=prepare(JSON.stringify([identity,binding]),range);
      if(!plan.missing.length){if(plan.old && plan.old.map[binding.id])map[binding.id]=copy(plan.old.map[binding.id]);return;}
      var key=JSON.stringify(plan.missing),group=groups[key] || (groups[key]={plans:[],bindings:[]});
      group.plans.push(plan);group.bindings.push(binding);
    });
    return Promise.all(Object.keys(groups).map(function(key){var group=groups[key];return Promise.resolve().then(function(){
      if(signal.aborted)throw new Error('History cancelled');
      return fetch(group.bindings,telemetryHistoryRange(group.plans[0].missing,true));
    }).then(function(answer){
      if(answer.note)notes.push(answer.note);
      group.plans.forEach(function(plan,i){var id=group.bindings[i].id,part={};if(answer.map && answer.map[id])part[id]=answer.map[id];
        var saved=finish(plan,{map:part,note:answer.note},signal);if(saved.map[id])map[id]=saved.map[id];
      });
    });})).then(function(){if(signal.aborted)throw new Error('History cancelled');return {map:map,note:notes.join('; ')};});
  }};
}

/* ctl.telemetry. hooks: {carriers: eachCarrier, diagrams: eachDiagram,
   jira: function() → the runtime Jira map, changed: function()}. changed lets
   the Live status panel and the canvas follow a telemetry change. In return
   createTelemetry sets hooks.view() ({map, verdicts} while Metrics is on, else
   null) for the canvas painter and hooks.jiraChanged(), which the Jira side
   calls so subscribers receive re-judged verdicts. */
function telemetryBindingKey(binding){
  function stable(value){if(!telemetryObject(value))return value;var out={};Object.keys(value).sort().forEach(function(key){out[key]=stable(value[key]);});return out;}
  return JSON.stringify(stable({kind:binding.kind,signals:binding.signals,proof:binding.proof}));
}
function createTelemetry(page,options,hooks){
  var environment=trackingTelemetry(page || {}).environment || null,environmentGeneration=0;
  var permitted=options!==false && trackingTelemetry(page || {}).enabled;
  options=options || {};hooks=hooks || {};
  var available=permitted && options.available!==false,availabilityNote='';
  var provider=typeof options.provider==='function'?options.provider:null;
  var history=typeof options.history==='function'?options.history:provider && typeof provider.history==='function'?provider.history:null;
  var windowHistory=options.historyMode==='window',windowCache=Object.create(null);
  var demo=options.demo && typeof options.demo.mount==='function'?options.demo:null;
  var configured=Number(options.refreshMs),authored=trackingTelemetry(page || {}).refreshMs;
  var delay=Math.max(TELEMETRY_MIN_REFRESH_MS,configured>0 && isFinite(configured)?configured:authored || TELEMETRY_MIN_REFRESH_MS);
  var map=Object.create(null),liveMap=map,past=null,historyRequests=[],historyGeneration=0,historyCache=telemetryHistoryCache(),liveStatus=null,enabled=false,retired=false,listeners=[],demoCleanup=null;
  available=available && !!(provider || demo);
  var status={state:available?'idle':'absent',busy:false,refreshedAt:null,note:''};
  // Host preload is allowed before the first Metrics decision, never after an explicit off.
  var pending=Object.create(null),pendingKeys=Object.create(null),requestGeneration=0;
  function clearPending(){requestGeneration++;pending=Object.create(null);pendingKeys=Object.create(null);}
  var preload=true,liveKeys=Object.create(null),bindingEpochs=Object.create(null),heldObservation=false;
  function copy(value){return JSON.parse(JSON.stringify(value));}
  function bindings(){return typeof hooks.carriers==='function'?telemetryBindings(hooks.carriers,environment,telemetryEnvironmentConfig(page,environment)):[];}
  function emit(){if(retired || !listeners.length)return;var value=api.snapshot();listeners.slice().forEach(function(fn){fn(value);});}
  function notify(){
    if(retired)return;emit();
    if(typeof hooks.changed==='function')hooks.changed();
  }
  function verdicts(){
    return proofVerdicts(telemetryProofInput(typeof hooks.carriers==='function'?hooks.carriers:function(){},typeof hooks.diagrams==='function'?hooks.diagrams:function(){},
      typeof hooks.jira==='function'?hooks.jira():{},map,environment,telemetryEnvironmentConfig(page,environment)));
  }
  hooks.view=function(){return enabled && !retired?{map:map,pending:past?(past.pending || {}):pending,verdicts:verdicts()}:null;};
  hooks.jiraChanged=emit;
  function setStatus(next){Object.keys(next).forEach(function(key){status[key]=next[key];});}
  function bindingKeys(){var keys=Object.create(null);bindings().forEach(function(binding){keys[binding.id]=JSON.stringify([telemetryBindingKey(binding),bindingEpochs[binding.id] || 0]);});return keys;}
  function resetObservations(){heldObservation=false;liveKeys=Object.create(null);if(typeof hooks.reset==='function')hooks.reset();}
  function observed(){if(typeof hooks.observed==='function')hooks.observed(api.snapshot());}
  function store(value,expected){
    var next=Object.create(null);
    var keys=bindingKeys();
    if(telemetryObject(value))Object.keys(value).forEach(function(id){var sample=telemetrySample(value[id]);if(id && sample && (!expected || expected[id]===keys[id]))next[id]=sample;});
    liveMap=next;if(!past)map=next;
    liveKeys=keys;if(!Object.keys(next).length)resetObservations();
    else if(past)heldObservation=true;else observed();
  }
  // Each call owns its transient progress; retired generations cannot repaint.
  var poller=provider?liveStatusPoller(function(signal){
    clearPending();var generation=requestGeneration,noted='',bound=bindings(),keys=bindingKeys();
    function current(id,name){var binding=bound.find(function(b){return b.id===id;});return !retired && enabled && available && !signal.aborted && generation===requestGeneration && keys[id]===bindingKeys()[id] && binding && binding.signals[name] && !proofVerdicts.isTraceSignal(binding.signals[name]);}
    var report={note:function(text){noted=typeof text==='string'?text:'';if(!retired && enabled && !signal.aborted && generation===requestGeneration){if(past)liveStatus=Object.assign({},liveStatus,{note:noted});else setStatus({note:noted});notify();}},
      pending:function(id,name){if(!current(id,name))return;if(!pending[id])pending[id]=Object.create(null);pendingKeys[id]=keys[id];pending[id][name]=true;notify();},
      settled:function(id,name,reading){
        if(!current(id,name) || !pending[id] || !pending[id][name])return;
        delete pending[id][name];if(!Object.keys(pending[id]).length)delete pending[id];
        var sample=liveMap[id] || {signals:{},markers:[],links:{},observedAt:null};
        var value=reading && telemetrySample({signals:{[name]:reading},observedAt:reading.observedAt});
        if(value && value.signals[name])sample.signals[name]=value.signals[name];else delete sample.signals[name];
        if(Object.keys(sample.signals).length || (sample.exemplars || []).length)liveMap[id]=sample;else delete liveMap[id];
        liveKeys[id]=keys[id];if(!past){map=liveMap;observed();}else heldObservation=true;notify();
      }};
    // Legacy native/custom providers own the bindings passed to this actual call.
    // Automatic adapters opt into precise reporting after capability/config checks.
    if(!options.managesPending)bound.forEach(function(b){telemetryMetricNames(b).forEach(function(name){if(!b.signals[name].error)report.pending(b.id,name);});});
    signal.addEventListener('abort',function(){if(generation===requestGeneration){clearPending();notify();}},{once:true});
    return Promise.resolve().then(function(){return provider(bound,signal,report,{environment:environment,config:api.config()});}).then(function(value){return {value:value,note:noted,keys:keys};});
  },delay,{
    busy:function(){if(past){liveStatus=Object.assign({},liveStatus,{busy:true});return;}setStatus({busy:true});notify();},
    result:function(answer){clearPending();store(answer.value,answer.keys);var next={state:'ok',busy:false,refreshedAt:new Date().toISOString(),note:answer.note};if(past)liveStatus=next;else setStatus(next);notify();},
    error:function(error){clearPending();var next={state:error && error.state==='approval'?'approval':'error',busy:false,note:error && typeof error.message==='string'?error.message:String(error)};if(past)liveStatus=next;else setStatus(next);notify();}
  }):null;
  function stopDemo(){var cleanup=demoCleanup;demoCleanup=null;if(typeof cleanup==='function'){try{cleanup();}catch(ex){}}}
  function cancelHistory(){if(past)past.pending={};historyGeneration++;historyRequests.forEach(function(request){request.abort.abort();});historyRequests=[];}
  function showHistory(){
    if(!past || !enabled)return;
    var day=past.days[past.index];
    map=windowHistory?past.map:telemetryHistoryDay(past.map,day);
    if(day && !environment && telemetryObject(day.telemetry)){
      map=Object.create(null);Object.keys(day.telemetry).forEach(function(id){
        var sample=telemetrySample(day.telemetry[id]);if(!sample)return;
        // Embedded days provide numeric history, not a validated historical trace contract.
        delete sample.exemplars;Object.keys(sample.signals).forEach(function(name){delete sample.signals[name].aggregate;});map[id]=sample;
      });
    }
  }
  function historyStatus(){
    var state=historyRequests.length?'loading':'ok',notes=[];
    Object.keys(past.outcomes).forEach(function(id){var outcome=past.outcomes[id];
      if(outcome.state==='approval' || outcome.state==='error' && state!=='approval')state=outcome.state;
      if(outcome.note && notes.indexOf(outcome.note)<0)notes.push(outcome.note);
    });
    setStatus({state:state,busy:!!historyRequests.length,note:notes.join('; ')});
  }
  /* Built-ins request one selected observation window. Legacy custom adapters
     retain their endpoint series, batching and slider-without-fetch contract. */
  function selectedHistoryWindow(day){
    if(!day || !telemetryTime(day.at))return null;
    var now=new Date(),end=Date.parse(day.at),key=typeof day.key==='string'?day.key:'';
    function localKey(date){return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');}
    var today=localKey(now);
    // Days end at next local midnight. An explicit key is authoritative;
    // legacy keyless callers infer the represented local date from at - 1ms.
    if(!/^\d{4}-\d{2}-\d{2}$/.test(key))key=localKey(new Date(end-1));
    if(key>today)return null;
    if(key===today && end>now.getTime())end=now.getTime();
    if(end>now.getTime())return null;
    return {from:new Date(end-telemetryWindowMs(api.config().window)).toISOString(),to:new Date(end).toISOString(),mutable:key===today};
  }
  function selectedHistoryChanged(force){
    if(!past || !enabled || !available || retired || !history || past.embedded)return;
    var day=past.days[past.index],window=selectedHistoryWindow(day);
    var bound=telemetryBindings(hooks.historyCarriers || hooks.carriers || function(){},environment,telemetryEnvironmentConfig(page,environment)).map(function(b){var signals={};telemetryMetricNames(b).forEach(function(n){signals[n]=b.signals[n];});return Object.assign({},b,{signals:signals});}).filter(function(b){return Object.keys(b.signals).length;});
    var sourceKey=JSON.stringify([environment,api.config(),typeof options.historyKey==='function'?options.historyKey():options.historyKey || '',day && day.key,day && day.at]),keys=Object.create(null);
    bound.forEach(function(binding){keys[binding.id]=JSON.stringify([sourceKey,binding,bindingEpochs[binding.id] || 0]);});
    var identity=JSON.stringify(keys)+'|'+sourceKey;
    if(!force && identity===past.selection)return;
    var prior=past.map,loaded=past.windowLoaded || {},sameWindow=past.windowIdentity===sourceKey;
    // Mounting a detail joins the existing anchored window, not a newer peer
    // clock. Completed unchanged bindings remain visible and are not refetched.
    if(sameWindow && past.window)window=Object.assign({},past.window,{mutable:window && window.mutable});
    cancelHistory();past.selection=identity;past.windowIdentity=sourceKey;past.map={};past.pending={};past.outcomes={};past.windowLoaded={};past.window=window?{from:window.from,to:window.to}:null;
    if(!window || !bound.length){showHistory();setStatus({state:'ok',busy:false,note:!window?'Future dates have no observed metrics.':''});notify();return;}
    var needed=bound.filter(function(binding){
      var id=binding.id,cached=windowCache[keys[id]];
      if(!force && sameWindow && loaded[id]===keys[id] && prior[id]){past.map[id]=prior[id];past.windowLoaded[id]=keys[id];return false;}
      if(!force && !window.mutable && cached && Date.now()-cached.at<LIVE_STATUS_HISTORY_CACHE_MS){if(cached.sample)past.map[id]=copy(cached.sample);past.windowLoaded[id]=keys[id];return false;}
      return true;
    });showHistory();
    if(!needed.length){setStatus({state:'ok',busy:false,note:''});notify();return;}
    var generation=historyGeneration,request={abort:new AbortController(),bound:needed,keys:keys},note='';historyRequests.push(request);
    var range={from:day.at,to:day.at,endpoints:[{at:day.at,key:day.key}],window:past.window};
    function current(){return !retired && enabled && available && past && generation===historyGeneration && !request.abort.signal.aborted;}
    function known(id,name){return current() && bound.some(function(b){return b.id===id && telemetryOwn(b.signals,name);});}
    var report={note:function(text){if(!current())return;note=typeof text==='string'?text:'';setStatus({note:note});notify();},
      pending:function(id,name){if(!known(id,name))return;if(!past.pending[id])past.pending[id]={};past.pending[id][name]=true;notify();},
      settled:function(id,name,reading){
        if(!known(id,name))return;
        if(past.pending[id]){delete past.pending[id][name];if(!Object.keys(past.pending[id]).length)delete past.pending[id];}
        var carrier=past.map[id] || {signals:{},links:{},markers:[],observedAt:null,window:past.window};
        var sample=reading && telemetrySample({signals:{[name]:reading}});
        if(sample && sample.signals[name])carrier.signals[name]=sample.signals[name];else delete carrier.signals[name];
        if(Object.keys(carrier.signals).length)past.map[id]=carrier;else delete past.map[id];showHistory();notify();
      }};
    if(!options.managesPending)needed.forEach(function(b){Object.keys(b.signals).forEach(function(n){if(!b.signals[n].error)report.pending(b.id,n);});});
    setStatus({state:'loading',busy:true,note:''});notify();
    Promise.resolve().then(function(){return history(needed,range,request.abort.signal,report,{environment:environment,config:api.config()});}).then(function(value){
      if(!current())return;
      // Merge settled progress with final metadata. A failing peer cannot erase
      // another source's completed signal; callbacks already clear owned errors.
      Object.keys(value || {}).forEach(function(id){var sample=telemetrySample(value[id]);if(!sample)return;sample.window=copy(past.window);var prior=past.map[id];if(prior)sample.signals=Object.assign({},prior.signals,sample.signals);past.map[id]=sample;});
      if(!note)needed.forEach(function(binding){var id=binding.id;past.windowLoaded[id]=keys[id];if(!window.mutable)windowCache[keys[id]]={at:Date.now(),sample:past.map[id]?copy(past.map[id]):null};});
      finish(null);
    },finish);
    function finish(error){if(!current())return;historyRequests=historyRequests.filter(function(r){return r!==request;});past.pending={};showHistory();setStatus({state:error?(error.state==='approval'?'approval':'error'):'ok',busy:false,note:error?error.message || 'Historical metrics did not answer':note});notify();}
  }
  function historyBindingsChanged(){
    if(windowHistory){selectedHistoryChanged(false);return;}
    if(!past || !enabled || !available || retired || !history || past.embedded)return;
    var bound=telemetryBindings(hooks.historyCarriers || hooks.carriers || function(){},environment,telemetryEnvironmentConfig(page,environment));
    var identity=JSON.stringify([environment,api.config(),typeof options.historyKey==='function'?options.historyKey():options.historyKey || '']);
    var keys=Object.create(null);bound.forEach(function(binding){keys[binding.id]=JSON.stringify([identity,binding]);});
    if(JSON.stringify(keys)===JSON.stringify(past.keys))return;
    Object.keys(past.keys).forEach(function(id){if(keys[id]!==past.keys[id]){delete past.map[id];delete past.loaded[id];delete past.outcomes[id];}});
    past.keys=keys;
    // A removed/rebound member invalidates its pending batch. Completed peers
    // stay in the per-binding cache; unrelated pending batches keep running.
    historyRequests=historyRequests.filter(function(request){
      if(request.bound.some(function(binding){return keys[binding.id]!==request.keys[binding.id];})){request.abort.abort();return false;}return true;
    });
    var needed=bound.filter(function(binding){return past.loaded[binding.id]!==keys[binding.id] && !historyRequests.some(function(request){return request.keys[binding.id]===keys[binding.id];});});
    showHistory();
    if(!needed.length){historyStatus();notify();return;}
    var dated=past.days.filter(function(day){return !!telemetryTime(day.at);}).map(function(day){var item={at:telemetryTime(day.at)};if(typeof day.key==='string')item.key=day.key;return item;}).sort(function(a,b){return Date.parse(a.at)-Date.parse(b.at);});
    if(!dated.length)return;
    var generation=historyGeneration,request={abort:new AbortController(),bound:needed,keys:keys};historyRequests.push(request);
    historyStatus();notify();
    historyCache.loadBindings(identity,needed,telemetryHistoryRange(dated,true),request.abort.signal,function(batch,part){
      var note='',report={note:function(text){note=typeof text==='string'?text:'';}};
      return Promise.resolve(history(batch,part,request.abort.signal,report,{environment:environment,config:api.config()})).then(function(value){return {map:value,note:note};});
    }).then(function(answer){finish(answer,null);},function(error){finish(null,error);});
    function finish(answer,error){
      if(retired || !enabled || !past || request.abort.signal.aborted || generation!==historyGeneration)return;
      historyRequests=historyRequests.filter(function(item){return item!==request;});
      needed.forEach(function(binding){var id=binding.id;if(past.keys[id]!==keys[id])return;
        past.loaded[id]=keys[id];if(answer && answer.map[id])past.map[id]=answer.map[id];
        past.outcomes[id]={state:error?(error.state==='approval'?'approval':'error'):'ok',note:error?error.message || 'Historical metrics did not answer':answer.note};
      });
      showHistory();historyStatus();notify();
    }
  }
  function loadHistory(force){
    cancelHistory();if(!past || !enabled || !available || retired)return;
    past.selection=null;past.windowIdentity=null;past.windowLoaded={};past.map={};past.keys=Object.create(null);past.loaded=Object.create(null);past.outcomes=Object.create(null);past.embedded=!environment && past.days.every(function(day){return telemetryObject(day.telemetry);});showHistory();
    if(past.embedded){setStatus({state:'ok',busy:false,note:''});notify();return;}
    if(!history || !past.days.some(function(day){return !!telemetryTime(day.at);})){setStatus({state:'ok',busy:false,note:'Historical metrics unavailable; missing samples are unobserved.'});notify();return;}
    setStatus({state:'ok',busy:false,note:''});if(windowHistory)selectedHistoryChanged(!!force);else historyBindingsChanged();
  }

  var api={
    environment:function(){return environment;},
    config:function(){return copy(telemetryEnvironmentConfig(page,environment));},
    setEnvironment:function(id){
      var profiles=trackingTelemetry(page).environments;
      if(retired || !permitted || !profiles || typeof id!=='string' || !telemetryOwn(profiles,id) || id===environment)return false;
      cancelHistory();if(poller)poller.stop();stopDemo();
      clearPending();environment=id;environmentGeneration++;preload=false;historyCache.clear();windowCache=Object.create(null);
      liveMap=map=Object.create(null);resetObservations();liveStatus=null;
      if(past){past.map={};past.keys={};past.loaded={};past.outcomes={};}
      if(typeof options.environmentChanged==='function')options.environmentChanged(id,api.config());
      setStatus({state:available?(enabled?'loading':'idle'):'absent',busy:false,refreshedAt:null,note:availabilityNote});
      notify();
      if(enabled && available){
        if(past)loadHistory();else if(poller)poller.start();
        if(demo){var epoch=environmentGeneration,facade=Object.assign({},api,{apply:function(value){if(epoch===environmentGeneration)api.apply(value);}});var cleanup=demo.mount(environment?facade:api);demoCleanup=typeof cleanup==='function'?cleanup:null;}
      }
      return true;
    },
    // Read-only capability: rendering must never discover tools or fetch details.
    canChooseExemplar:function(id,token,traceId){
      if(retired || !enabled || past || !available || typeof options.chooseExemplar!=='function' || typeof options.canChooseExemplar!=='function')return false;
      var sample=liveMap[id],e=sample && (sample.exemplars || []).find(function(e){return e.selectionToken===token;});
      if(!e || !e.candidates.some(function(c){return c.traceId===traceId && c.traceId!==e.traceId;}))return false;
      try{return options.canChooseExemplar(id,token,traceId)===true;}catch(ex){return false;}
    },
    // Explicit user action only. Never called by paint, history or captions.
    chooseExemplar:async function(id,token,traceId){
      if(retired || !enabled || past || !available || typeof options.chooseExemplar!=='function')throw new Error('Trace selection unavailable.');
      var before=JSON.stringify(bindings()),sample=liveMap[id];
      if(!sample || !sample.exemplars || !sample.exemplars.some(function(e){return e.selectionToken===token;}))throw new Error('Trace selection expired.');
      var result=await options.chooseExemplar(id,token,traceId);
      if(retired || !enabled || past || before!==JSON.stringify(bindings()) || liveMap[id]!==sample)throw new Error('Trace selection expired.');
      sample.exemplars=[telemetryTraceEnvelope(result)];notify();return copy(sample.exemplars[0]);
    },
    retractExemplars:function(){[liveMap,map].forEach(function(m){Object.keys(m).forEach(function(id){delete m[id].exemplars;if(!Object.keys(m[id].signals).length)delete m[id];});});notify();},
    openHistory:function(days,index){
      if(retired)return;cancelHistory();liveStatus=copy(status);past={days:days,index:index,map:{}};map=Object.create(null);
      if(poller)poller.pause();
      // Direct traces remain usable while Metrics is off. The history boundary
      // must still retire their UI even when no numeric history can be loaded.
      if(!enabled || !available)notify();else loadHistory();
    },
    historyDay:function(index){if(retired || !past)return;past.index=index;if(windowHistory)selectedHistoryChanged(false);else {showHistory();notify();}},
    closeHistory:function(){
      if(!past || retired)return;cancelHistory();past=null;map=enabled?liveMap:Object.create(null);
      if(enabled && heldObservation){heldObservation=false;observed();}
      if(enabled){if(liveStatus)setStatus(liveStatus);if(poller)poller.resume();}liveStatus=null;notify();
    },
    bindings:function(){return copy(bindings());},
    // Runtime detail identity: identical authored bindings can belong to a replacement load.
    bindingGeneration:function(id){return bindingEpochs[id] || 0;},
    bindingsChanged:function(retiredIds){
      retiredIds=Array.isArray(retiredIds)?retiredIds:[];
      if(retiredIds.length){
        retiredIds.forEach(function(id){delete pending[id];bindingEpochs[id]=(bindingEpochs[id] || 0)+1;});
        if(typeof hooks.retire==='function')hooks.retire(retiredIds);
        historyCache.clear();windowCache=Object.create(null);retiredIds.forEach(function(id){if(past && past.keys){delete past.keys[id];delete past.map[id];delete past.loaded[id];delete past.outcomes[id];}});
      }
      var keys=bindingKeys();Object.keys(liveMap).forEach(function(id){if(retiredIds.indexOf(id)>=0 || liveKeys[id]!==keys[id])delete liveMap[id];});
      Object.keys(pending).forEach(function(id){if(pendingKeys[id]!==keys[id])delete pending[id];});
      if(!past)map=liveMap;historyBindingsChanged();notify();
    },
    // Automatic-provider facade: revoke only the named sources immediately,
    // including cached history, without erasing a healthy peer on that carrier.
    retractSources:function(sources){
      if(retired)return;var owned=Object.create(null);bindings().forEach(function(b){owned[b.id]=Object.keys(b.signals).filter(function(n){return sources.indexOf(b.signals[n].source)>=0;});});
      sources.forEach(function(source){bindings().forEach(function(b){Object.keys(b.signals).forEach(function(name){if(b.signals[name].source===source && pending[b.id])delete pending[b.id][name];});});});
      Object.keys(pending).forEach(function(id){if(!Object.keys(pending[id]).length)delete pending[id];});
      function strip(target){Object.keys(target || {}).forEach(function(id){var sample=target[id],changed=false;(owned[id] || []).forEach(function(name){if(telemetryOwn(sample.signals,name)){delete sample.signals[name];changed=true;}});if(changed){sample.links={};sample.markers=[];sample.observedAt=null;}if(!Object.keys(sample.signals).length && !(sample.exemplars || []).length)delete target[id];});}
      strip(liveMap);strip(map);if(past)strip(past.map);historyCache.clear();windowCache=Object.create(null);notify();
    },
    // Explicit consent retry keeps healthy peer data while renewing the session.
    retry:function(){if(retired || !enabled || !available)return;if(past)loadHistory(true);else if(poller){poller.stop();poller.start();}},
    apply:function(value){
      if(retired || !enabled && !preload || !permitted || !available && (provider || demo || options.available===false))return;store(value);
      if(enabled && !past)setStatus({state:'ok',refreshedAt:new Date().toISOString(),note:''});
      notify();
    },
    clear:function(signal){if(retired)return;clearPending();if(!historyRequests.some(function(request){return request.abort.signal===signal;})){cancelHistory();setStatus({busy:false});}historyCache.clear();windowCache=Object.create(null);liveMap=map=Object.create(null);resetObservations();if(past)past.map={};notify();},
    snapshot:function(){
      var input=telemetryProofInput(hooks.carriers || function(){},hooks.diagrams || function(){},typeof hooks.jira==='function'?hooks.jira():{},map,environment,telemetryEnvironmentConfig(page,environment));
      return {environment:environment,environments:permitted?Object.keys(trackingTelemetry(page).environments || {}):[],available:available && !retired,enabled:enabled,map:copy(map),pending:enabled?copy(past?past.pending || {}:pending):{},status:copy(status),carriers:copy(input.carriers),
        historical:!!past,window:past && past.window?copy(past.window):null,at:past && past.days[past.index]?past.days[past.index].at:null,verdicts:copy(proofVerdicts(input))};
    },
    verdicts:function(){return copy(verdicts());},
    status:function(){return copy(status);},
    enabled:function(){return enabled;},
    setEnabled:function(value){
      value=!!value;
      if(retired || value && !available || value===enabled && (value || !preload))return;
      preload=false;enabled=value;if(!enabled)clearPending();
      if(enabled){
        setStatus({state:'loading',busy:false,refreshedAt:null,note:''});
        if(past)loadHistory();else if(poller)poller.start();
        if(demo){var epoch=environmentGeneration,facade=Object.assign({},api,{apply:function(value){if(epoch===environmentGeneration)api.apply(value);}});var cleanup=demo.mount(environment?facade:api);demoCleanup=typeof cleanup==='function'?cleanup:null;}
      }else{
        cancelHistory();if(poller)poller.stop();stopDemo();
        liveMap=map=Object.create(null);resetObservations();if(past)past.map={};setStatus({state:'idle',busy:false,refreshedAt:null,note:''});
      }
      notify();
    },
    setAvailable:function(value,note){
      if(retired)return;value=!!value && permitted && !!(provider || demo);if(note!==undefined)availabilityNote=permitted?String(note || ''):'';
      if(value===available){if(note!==undefined && status.note!==availabilityNote){setStatus({note:availabilityNote});notify();}return;}
      if(!value){api.setEnabled(false);historyCache.clear();windowCache=Object.create(null);liveMap=map=Object.create(null);resetObservations();}
      available=value;setStatus({state:value?'idle':'absent',busy:false,refreshedAt:null,note:availabilityNote});notify();
    },
    onChange:function(fn){if(typeof fn!=='function' || retired)return function(){};listeners.push(fn);return function(){var i=listeners.indexOf(fn);if(i>=0)listeners.splice(i,1);};},
    destroy:function(){if(retired)return;retired=true;clearPending();cancelHistory();historyCache.clear();windowCache=Object.create(null);past=null;enabled=false;liveMap=map=Object.create(null);resetObservations();setStatus({state:'absent',busy:false,refreshedAt:null,note:''});if(poller)poller.stop();stopDemo();listeners=[];if(typeof hooks.changed==='function')hooks.changed();}
  };
  return api;
}
