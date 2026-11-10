/* Runtime ticket evidence belongs to this page controller, never the spec.
   Navigation can replace SVGs and step controls independently; source indices
   and section identities keep the paint attached to the authored carriers. */
var LIVE_STATUS_STATES = ['todo','active','testing','done','blocked','missing'];
var LIVE_STATUS_APPEARANCES = LIVE_STATUS_STATES.concat(['unchanged']);
/* Proof presentation consumes one normalized controller snapshot. It neither
   resolves bindings nor judges evidence: proofVerdicts remains the only engine.
   No clock, page walk, queries, or mutations belong in this presentation seam. */
function liveStatusLogDetails(snapshot,window){
  var out=[];
  if(!snapshot.enabled || snapshot.historical)return out;
  (snapshot.carriers || []).forEach(function(binding){Object.keys(binding.signals || {}).forEach(function(name){
    var signal=binding.signals[name],config=signal.source==='cloudwatchLogs' && signal.query.breakdown;
    if(!config)return;
    var sample=snapshot.map[binding.id],entry=sample && sample.signals[name],details=signal.breakdownError?telemetryLogDetails({status:'error',error:signal.breakdownError}):entry && entry.breakdown;
    out.push({key:JSON.stringify([snapshot.environment,binding.id,name,signal]),id:binding.id,signal:name,title:binding.title || binding.id,
      config:config,scope:telemetrySignalScope(signal),total:telemetryCardValue(binding,sample,name,null,window),details:details || null});
  });});
  return out;
}
// A date as other panel dates read, in local time ("Nov 5, 7:00 AM"); the year only when it is not this year (#1153).
// seconds: also show seconds (log lines, #1252).
function liveStatusReadableTime(at,seconds){
  var d=new Date(at);if(!isFinite(d.getTime()))return String(at);
  var day=d.getFullYear()===new Date().getFullYear()?{month:'short',day:'numeric'}:{month:'short',day:'numeric',year:'numeric'};
  return d.toLocaleDateString([],day)+', '+d.toLocaleTimeString([],seconds?{hour:'numeric',minute:'2-digit',second:'2-digit'}:{hour:'numeric',minute:'2-digit'});
}
function liveStatusProofPresentation(snapshot,window,includeUnobserved){
  if(!snapshot)return null;
  // Map keys, links and markers are not measurements. Use only already-resolved
  // bound carriers/signals, including measured zero and finite series points.
  var observed=snapshot.carriers.some(function(binding){
    if(!snapshot.verdicts.carriers[binding.id].bound)return false;
    var sample=(snapshot.map || {})[binding.id];
    return telemetryMetricNames(binding).some(function(name){
      var entry=sample && sample.signals && sample.signals[name];
      return telemetryObject(entry) && (telemetryNumber(entry.value) || Array.isArray(entry.series) && entry.series.some(telemetryPoint));
    });
  });
  var pending=snapshot.pending || {},querying=snapshot.carriers.some(function(binding){return telemetryMetricNames(binding).some(function(name){return pending[binding.id] && pending[binding.id][name];});});
  if(!observed && !querying && !includeUnobserved)return null;
  var counts=Object.assign({},snapshot.verdicts.rollups),offset=0;
  // #1201: a carrier whose error signal is outside its limit counts as `error`, leaving whichever
  // bucket its verdict put it in (neutral included), so the bound total is unchanged.
  snapshot.carriers.forEach(function(binding){
    var result=snapshot.verdicts.carriers[binding.id];if(!result.bound || !telemetryErrorFailing(binding,result).length)return;
    var bucket=Object.keys(proofVerdicts.counts).filter(function(key){return proofVerdicts.counts[key].indexOf(result.verdict)>=0;})[0];
    if(bucket)counts[bucket]--;counts.error=(counts.error || 0)+1;
  });
  counts.neutral=counts.bound-counts.proven-counts.degraded-counts.unproven-counts.liveEarly-(counts.error || 0);
  var arcs=['proven','degraded','error','unproven','liveEarly'].filter(function(key){return key!=='error' || counts.error;}).map(function(key){
    var size=counts.bound?100*counts[key]/counts.bound:0,arc={key:key,count:counts[key],size:size,offset:offset};offset+=size;return arc;
  });
  var duration=/^(\d+)([smhdw])$/.exec(window),windowMs=duration?Number(duration[1])*({s:1000,m:60000,h:3600000,d:86400000,w:604800000})[duration[2]]:86400000;
  function number(value){return Number(value.toPrecision(4)).toLocaleString('en-US');}
  function predicate(binding,names,measured){
    var words=[];
    (names || telemetryMetricProofNames(binding)).forEach(function(name){
      var limit=binding.proof[name];if(proofVerdicts.isTraceSignal(binding.signals[name]))return;var unit=binding.signals[name] && binding.signals[name].unit || '';
      if(telemetryNumber(limit.min))words.push(name+' at least '+number(limit.min)+(unit?' '+unit:''));
      if(telemetryNumber(limit.max))words.push(limit.maxRatioOf?name+' no more than '+number(limit.max*100)+'% of '+limit.maxRatioOf:name+' at most '+number(limit.max)+(unit?' '+unit:''));
    });
    return words.length?words.join('; '):(measured?'Observed signals':'No observed signals')+'; no authored thresholds';
  }
  var rows=snapshot.carriers.filter(function(binding){return snapshot.verdicts.carriers[binding.id].bound;}).map(function(binding){
    var waiting=pending[binding.id] || {},loading=telemetryMetricNames(binding).some(function(name){return waiting[name];}),measured=telemetryMetricNames(binding).some(function(name){return telemetryReading(snapshot.map[binding.id],name).value!==null;});
    var result=snapshot.verdicts.carriers[binding.id],sample=snapshot.map[binding.id],primary=telemetryPrimary(binding,true),queue=binding.kind==='queue';
    function errorSignal(name){return telemetryErrorFailing(binding,result).indexOf(name)>=0;}
    // #1194: one plot per signal; the popup's main chart is the primary's, each metric tile has its own small one.
    function plot(name){
      var reading=name?telemetryReading(sample,name):{series:[]},times=reading.series.map(function(p){return Date.parse(telemetryTime(p[0]));}).filter(isFinite);
      // Each primary signal owns its measurement window. A carrier timestamp may
      // summarize a newer peer and must not clip this signal's older points.
      var entry=sample && sample.signals && sample.signals[name],explicit=entry && telemetryOwn(entry,'observedAt');
      var measuredAt=!entry?null:explicit?telemetryTime(entry.observedAt):telemetryTime(sample && sample.observedAt) || (times.length?telemetryTime(Math.max.apply(null,times)):null);
      var bounds=snapshot.historical?snapshot.window:entry && entry.window;
      var end=Date.parse(bounds?bounds.to:snapshot.historical?snapshot.at:measuredAt);
      var start=bounds?Date.parse(bounds.from):end-windowMs,span=end-start,interval=entry && entry.intervalMs;
      var points=reading.series.map(function(p){return {at:Date.parse(telemetryTime(p[0])),value:p[1]};}).filter(function(p){return isFinite(end) && p.at>=start-(interval || 0) && p.at<=end;}).sort(function(a,b){return a.at-b.at;});
      var low=points.length?Math.min.apply(null,points.map(function(p){return p.value;})):0,high=points.length?Math.max.apply(null,points.map(function(p){return p.value;})):0;
      var plotted=points.map(function(p){return {x:2+96*Math.max(0,p.at-start)/span,y:high===low?16:28-24*(p.value-low)/(high-low)};});
      // Sparse daily endpoints are dots, never a fictitious continuous sparkline.
      var continuous=points.length>=3 && points.every(function(p,i){return !i || p.at-points[i-1].at<=(interval?interval*1.1:span/4);});
      return {measuredAt:measuredAt,start:start,end:end,span:span,points:plotted,line:continuous?plotted.map(function(p){return p.x+','+p.y;}).join(' '):null};
    }
    var main=plot(primary),measuredAt=main.measuredAt,start=main.start,end=main.end,span=main.span;
    var markers=(sample && sample.markers || []).filter(function(m){return m.kind==='done' || m.kind==='deploy';}).map(function(m){return {at:Date.parse(m.at),label:m.label || m.kind,kind:m.kind};});
    if(result.since.doneAt)markers.push({at:Date.parse(result.since.doneAt),label:'Done',kind:'done'});
    markers=markers.filter(function(m,i,all){return isFinite(end) && m.at>=start && m.at<=end && !all.slice(0,i).some(function(other){return other.at===m.at && other.kind===m.kind;});});
    var url=null,authored=binding.links || {},provider=sample && sample.links || {};
    [authored.dashboard,authored.query,provider.dashboard,telemetryMetricUrl(binding,sample,primary),provider.query].some(function(value){url=deltaLinkUrl(value);return !!url;});
    var since=[];if(result.since.doneAt){since.push('Done '+liveStatusReadableTime(result.since.doneAt));if(result.since.firstTrafficAt)since.push('First observed traffic '+liveStatusReadableTime(result.since.firstTrafficAt));}
    if(!snapshot.historical && result.since.doneAt)telemetryMetricNames(binding).forEach(function(name){
      var entry=sample && sample.signals && sample.signals[name],aggregate=telemetryAggregate(entry,sample && sample.observedAt);
      if(!aggregate || aggregate.from!==result.since.doneAt)return;
      since.push(name+' total: '+String(entry.value)+(entry.unit?' '+entry.unit:'')+' through '+liveStatusReadableTime(aggregate.to));
    });
    var limited=telemetryMetricProofNames(binding).some(function(name){var limit=binding.proof[name];return !proofVerdicts.isTraceSignal(binding.signals[name]) && limit && (telemetryNumber(limit.min) || telemetryNumber(limit.max));});
    // No combined verdict while Jira is unknown does not erase measured evidence.
    var label=result.label;
    if(!label){
      label=result.telemetry==='silent'?'SILENT':result.telemetry==='degraded'?'DEGRADED':measured?(result.telemetry==='unobserved'?'OBSERVED · evidence incomplete':'OBSERVED'):'UNOBSERVED';
      if(result.jira==='unknown')label+=' · Jira status unavailable';
    }
    // #1201: an error signal outside its limit names the row ERROR, after the Jira state when there is one.
    if(telemetryErrorFailing(binding,result).length)label=label.indexOf(' · ')>0?label.split(' · ')[0]+' · ERROR':['done','active','testing','todo','blocked','missing'].indexOf(result.verdict)>=0?label+' · ERROR':'ERROR';
    return {id:binding.id,title:binding.title,kind:binding.kind,tickets:binding.tickets.slice(),jira:result.jira || 'No tickets',
      loading:loading,initialLoading:loading && !measured,telemetry:result.telemetry,verdict:result.verdict,error:telemetryErrorFailing(binding,result).length>0,label:loading && !measured?'Loading…':label,predicate:predicate(binding,null,measured)+(telemetryCountNote(binding)?' · '+telemetryCountNote(binding):'')+(telemetrySignalScope(binding.signals[primary])?' · '+telemetrySignalScope(binding.signals[primary]):''),failing:result.failing.slice(),
      primary:primary,kpis:telemetryMetricRows(binding,sample,waiting,window).map(function(kpi){var own=plot(kpi.name);return Object.assign(kpi,{chart:{points:own.points,line:own.line}});}),
      since:since.join(' · ') || 'unavailable',url:url,
      linkLabel:primary && binding.signals[primary].source==='grafana'?'Open in Grafana':primary && binding.signals[primary].source==='honeycomb'?'Open in Honeycomb':'Open telemetry',
      explanation:result.failing.length?'Outside proof threshold: '+result.failing.map(function(name){return (errorSignal(name)?'error signal '+name+' is outside its limit: ':name+' is ')+telemetryCardValue(binding,sample,name,null,window)+'; requires '+predicate(binding,[name]);}).join('. ')+(loading?'. Another query is loading.':''):loading?(measured?'Refreshing queried evidence.':'Waiting for queried evidence.'):
        result.telemetry==='silent'?'No traffic observed in this window.':result.telemetry==='unobserved'?'Evidence is missing or incomplete.':result.telemetry==='unmeasured'?'Traffic proof requires an observed signal with an authored minimum.':'Observed signals meet the authored proof thresholds.',
      // #1153: the Trace view's metrics popup states the metric evidence alone, with no Jira state or proof words.
      metrics:{label:loading && !measured?'Loading…':telemetryErrorFailing(binding,result).length?'ERROR':result.telemetry==='silent'?'SILENT':result.telemetry==='degraded'?'DEGRADED':measured?(result.telemetry==='unobserved'?'OBSERVED · evidence incomplete':'OBSERVED'):'UNOBSERVED',
        explanation:result.failing.length?'Outside limit: '+result.failing.map(function(name){return (errorSignal(name)?'error signal '+name+' is outside its limit: ':name+' is ')+telemetryCardValue(binding,sample,name,null,window)+'; limit '+predicate(binding,[name]);}).join('. ')+(loading?'. Another query is loading.':''):loading?(measured?'Refreshing queried evidence.':'Waiting for queried evidence.'):
          result.telemetry==='silent'?'No traffic observed in this window.':result.telemetry==='unobserved'?'Evidence is missing or incomplete.':
          // unmeasured: no observed signal has an authored minimum, so traffic is not judged.
          result.telemetry==='unmeasured'?(limited?'Observed signals are within their authored limits; no traffic minimum is authored.':'Observed signals; no authored limits.'):'Observed signals are within their authored limits.'},
      chart:{pending:!!waiting[primary],observedAt:measuredAt,points:main.points,line:main.line,
        markers:markers.map(function(m){return {x:2+96*(m.at-start)/span,label:m.label,kind:m.kind};})}};
  });
  var predicates=rows.map(function(row){return row.predicate;}).filter(function(value,i,all){return all.indexOf(value)===i;});
  return {counts:counts,arcs:arcs,rows:rows,window:window,historical:!!snapshot.historical,states:TELEMETRY_PROOF_BUCKET_STATES,
    sentence:counts.proven+' of '+counts.bound+' bound carriers proven · '+counts.unproven+' Done carriers unproven · '+(counts.error?counts.error+' error · ':'')+counts.unbound+' carriers unbound.',
    predicate:predicates.length===1?predicates[0]:'Proof thresholds are shown for each carrier below.'};
}
/* Runtime Activity consumes only accepted live observations. Reconciliation
   retires binding scopes; reading this log and rendering never emit events. */
function liveStatusTelemetryActivity(){
  var scopes=Object.create(null),events=[];
  function reconcile(carriers){
    var keys=Object.create(null);carriers.forEach(function(binding){if(Object.keys(binding.signals).length)keys[binding.id]=telemetryBindingKey(binding);});
    Object.keys(scopes).forEach(function(id){if(scopes[id].key!==keys[id])delete scopes[id];});
    events=events.filter(function(event){return event.binding===keys[event.carrier];});
  }
  function observe(snapshot){
    reconcile(snapshot.carriers);if(snapshot.historical)return;
    var presentation=liveStatusProofPresentation(snapshot,'24h');if(!presentation)return;
    snapshot.carriers.forEach(function(binding){
      var sample=snapshot.map[binding.id],result=snapshot.verdicts.carriers[binding.id],key=telemetryBindingKey(binding);
      if(!result.bound || !sample)return;
      var measured=telemetryMetricNames(binding).some(function(name){return telemetryReading(sample,name).value!==null;});if(!measured)return;
      var scope=scopes[binding.id] || (scopes[binding.id]={key:key,at:Object.create(null),values:Object.create(null),ratios:Object.create(null),first:Object.create(null),silent:Object.create(null),limits:Object.create(null)});
      function time(name){return telemetrySignalTime(sample.signals && sample.signals[name],sample.observedAt);}
      // Each signal owns its watermark. A newer source on this carrier cannot
      // date another signal's Activity or suppress that signal's next sample.
      function fresh(name){var at=time(name);return !at || scope.at[name]===undefined || Date.parse(at)>scope.at[name];}
      var row=presentation.rows.find(function(row){return row.id===binding.id;});
      function add(kind,text,time,signal){events.unshift({type:'telemetry',kind:kind,carrier:binding.id,binding:key,title:binding.title,text:text,at:time || null,signal:signal || null,url:row.url});}
      var done=result.since.doneAt,first=result.since.firstTrafficAt,primary=telemetryPrimary(binding),reading=telemetryReading(sample,primary),at=time(primary),stamp=at?Date.parse(at):null;
      if(done && !scope.first[done]){
        // The engine supplies actual series traffic; a positive headline is an
        // observation at observedAt, never a fabricated earlier first timestamp.
        var traffic=first || (fresh(primary) && reading.value>0 && stamp!==null && stamp>=Date.parse(done)?at:null);
        // Core first-traffic evidence spans all rate-like signals, not just the
        // chart primary. Keep its actual timestamp and carrier-wide bounds.
        var bound=first?telemetryTime(sample.observedAt):at,boundStamp=bound?Date.parse(bound):null;
        if(traffic && (boundStamp===null || Date.parse(traffic)<=boundStamp)){
          var owns=!first || reading.series.some(function(point){return point[1]>0 && telemetryTime(point[0])===first;});
          scope.first[done]=true;add('first-traffic','First observed traffic after Done',traffic,owns?primary:null);
        }
      }
      if(fresh(primary) && done && !scope.first[done] && result.telemetry==='silent' && stamp!==null && stamp>=Date.parse(done)){
        var hours=Math.floor((stamp-Date.parse(done))/3600000);
        if(scope.silent[done]===undefined || hours>scope.silent[done]){scope.silent[done]=hours;add('silent','Still silent '+hours+' h after Done',at,primary);}
      }
      telemetryMetricProofNames(binding).forEach(function(name){
        var limit=binding.proof[name],reading=telemetryReading(sample,name);
        var crossingAt=time(name);
        if(limit.maxRatioOf){
          // A ratio has two independently clocked inputs. Reuse unchanged
          // accepted measurements, but reject stale or conflicting replays.
          var inputs=[name,limit.maxRatioOf].map(function(dependency){
            return {name:dependency,value:telemetryReading(sample,dependency).value,at:time(dependency)};
          });
          if(inputs.some(function(input){
            var watermark=scope.at[input.name],stamp=input.at?Date.parse(input.at):null;
            return !binding.signals[input.name] || input.value===null || watermark!==undefined &&
              (stamp===null || stamp<watermark || stamp===watermark && input.value!==scope.values[input.name]);
          }))return;
          var prior=scope.ratios[name];
          var changed=inputs.filter(function(input,index){return !prior || input.value!==prior[index].value;});
          scope.ratios[name]=inputs;
          if(prior && !changed.length)return;
          // Only changed values contribute to this crossing; an unchanged
          // newer numerator or an unrelated peer cannot supply its date.
          crossingAt=changed.some(function(input){return !input.at;})?null:changed.map(function(input){return input.at;}).sort().pop();
        }else if(!fresh(name) || reading.value===null)return;
        var failed=result.failing.indexOf(name)>=0,previous=scope.limits[name];
        if(previous!==undefined && previous!==failed)add('threshold',name+' crossed '+(failed?'outside':'back within')+' its proof threshold',crossingAt,name);
        scope.limits[name]=failed;
      });
      telemetryMetricNames(binding).forEach(function(name){var at=time(name);if(at && fresh(name) && telemetryReading(sample,name).value!==null){scope.at[name]=Date.parse(at);scope.values[name]=telemetryReading(sample,name).value;}});
    });
    events=liveStatusActivity([],events);
  }
  function pin(binding,exemplar,at){
    var key=telemetryBindingKey(binding),identity=JSON.stringify([key,exemplar.provider,exemplar.traceId]);
    if(events.some(function(e){return e.carrier===binding.id && e.identity===identity;}))return false;
    var candidate=exemplar.candidates.find(function(c){return c.traceId===exemplar.traceId;});
    events.unshift({type:'telemetry',kind:'trace-pin',carrier:binding.id,binding:key,title:binding.title,identity:identity,
      traceId:exemplar.traceId,provider:exemplar.provider,at:at,traceAt:candidate && candidate.time || exemplar.spans.map(function(s){return s.time;}).sort(function(a,b){return Date.parse(a)-Date.parse(b);})[0] || null,
      text:'Pinned trace '+exemplar.traceId+' as evidence (this session)',url:telemetryTraceUrl(exemplar.url,exemplar.provider)});
    events=liveStatusActivity([],events);return true;
  }
  return {pin:pin,observe:observe,reconcile:reconcile,reconcileTraces:function(snapshot){if(!snapshot.historical)events=events.filter(function(e){return e.kind!=='trace-pin' || snapshot.map[e.carrier] && (snapshot.map[e.carrier].exemplars || []).length;});},retire:function(ids){ids.forEach(function(id){delete scopes[id];});events=events.filter(function(event){return ids.indexOf(event.carrier)<0;});},
    clear:function(){scopes=Object.create(null);events=[];},snapshot:function(){return JSON.parse(JSON.stringify(events));}};
}
function liveStatusActivity(jira,telemetry){
  return jira.concat(telemetry).map(function(item,index){return {item:item,index:index,at:Date.parse(item.at)};}).sort(function(a,b){
    return (isFinite(b.at)?b.at:-Infinity)-(isFinite(a.at)?a.at:-Infinity) || a.index-b.index;
  }).slice(0,20).map(function(entry){return entry.item;});
}
function liveStatusRollup(states){
  states=(states || []).filter(function(state){return LIVE_STATUS_STATES.indexOf(state)>=0;});
  if(!states.length)return null;
  for(var i=0;i<4;i++){var state=['blocked','missing','active','testing'][i];if(states.indexOf(state)>=0)return state;}
  if(states.every(function(state){return state==='done';}))return 'done';
  if(states.every(function(state){return state==='todo';}))return 'todo';
  return 'active';
}
function liveStatusTicketURL(tracking,key,entry,authoredURL){
  var site=deltaLinkUrl(tracking && tracking.jira && tracking.jira.site);
  var authored=trackingTicket(authoredURL);
  return site?site.replace(/\/$/,'')+'/browse/'+key:deltaLinkUrl(entry && entry.url) || (authored && authored.key===key?authored.url:null);
}
function liveStatusPageTicketURL(page,key){
  var url=null;
  sectionRecords(page).some(function(record){
    var d=record.section.diagram || {};
    return Object.keys(d.nodes || {}).map(function(id){return d.nodes[id];}).concat(d.edges || []).some(function(value){url=trackingTicketURL(value,key);return !!url;});
  });return url;
}
function liveStatusOwnerURL(tracking,entry){
  // Confluence people page of the Jira assignee (#764): page site plus a non-blank accountId, encoded as one path
  // segment. Atlassian ids keep their literal colon (712020:uuid) so the URL matches the one Atlassian itself emits.
  var site=deltaLinkUrl(tracking && tracking.jira && tracking.jira.site),id=entry && typeof entry.assigneeId==='string'?entry.assigneeId.trim():'';
  return site && id?site.replace(/\/$/,'')+'/wiki/people/'+encodeURIComponent(id).replace(/%3A/g,':'):null;
}
/* Pull request evidence travels with a ticket entry and never paints a carrier.
   Links are sanitized once here, so the panel and the popover render the same shape. */
var LIVE_STATUS_PR_STATES=['open','draft','merged','closed'],LIVE_STATUS_PR_CHECKS=['none','pending','passing','failing'],LIVE_STATUS_PR_REVIEWS=['none','approved','changes-requested','commented'];
function liveStatusPRLinks(list){
  var out=[],urls=[];
  (Array.isArray(list)?list:[]).forEach(function(pr){
    var url=pr && typeof pr==='object' && deltaLinkUrl(pr.url);
    if(!url || urls.indexOf(url)>=0)return;urls.push(url);
    var link={url:url,state:LIVE_STATUS_PR_STATES.indexOf(pr.state)>=0?pr.state:'open',checks:LIVE_STATUS_PR_CHECKS.indexOf(pr.checks)>=0?pr.checks:'none',
      review:LIVE_STATUS_PR_REVIEWS.indexOf(pr.review)>=0?pr.review:'none',source:pr.source==='github-search'?'github-search':'authored'};
    if(typeof pr.number==='number' && isFinite(pr.number) && pr.number>0)link.number=Math.floor(pr.number);
    ['title','repo','author','branch','mergedAt'].forEach(function(field){if(typeof pr[field]==='string' && pr[field])link[field]=pr[field];});
    out.push(link);
  });
  return out;
}
function liveStatusPRSummary(links){
  return {count:links.length,state:links.some(function(pr){return pr.state==='open' || pr.state==='draft';})?'open':links.every(function(pr){return pr.state==='merged';})?'merged':'declined'};
}
function liveStatusPRNumber(url){var match=/\/(?:pull|pulls|pull-requests|merge_requests|merge-requests)\/(\d+)/.exec(url);return match?match[1]:null;}
function liveStatusPRHost(url){try{return new URL(url).host.replace(/^www\./,'');}catch(ex){return '';}}
/* Tooltip and accessible name of one pull request icon: state, checks, review,
   author and repository. No relative times (Chuck, 2026-10-27). */
function liveStatusPRLabel(pr){
  var number=pr.number!=null?'#'+pr.number:liveStatusPRNumber(pr.url)?'#'+liveStatusPRNumber(pr.url):'';
  var checks={pending:'checks pending',passing:'checks passing',failing:'checks failing'}[pr.checks],review={approved:'approved','changes-requested':'changes requested',commented:'review comments'}[pr.review];
  var head=[number,pr.title].filter(Boolean).join(' '),facts=[pr.state,checks,review].filter(Boolean).join(' · '),who=[pr.author,pr.repo].filter(Boolean).join(' · ');
  return {label:['Pull request '+head,facts,who].filter(Boolean).join(' · '),title:[head,facts,who].filter(Boolean).join('\n')};
}
/* One icon for the Tickets table and the carrier popover. A plain authored URL
   keeps the monochrome icon; GitHub evidence colours it by state and adds a
   checks dot. The icon markup is written once and kept across repaints. */
function liveStatusPRDecorate(node,pr){
  var doc=node.ownerDocument || document,enriched=!!(pr && typeof pr==='object'),url=enriched?pr.url:pr;
  node.className='nbacklink dv-live-pr-link';node.setAttribute('href',url);node.setAttribute('target','_blank');node.setAttribute('rel','noopener noreferrer');
  if(!node._livePRIcon){node.innerHTML=FlowIcons.render('pull-request',{className:'dv-live-pr-icon',monochrome:true});node._livePRIcon=true;}
  var dot=node._livePRChecks;
  if(!enriched){
    var number=liveStatusPRNumber(url),host=liveStatusPRHost(url);
    node.removeAttribute('data-pr-state');node.setAttribute('aria-label','Pull request'+(number?' #'+number:'')+(host?' on '+host:''));node.setAttribute('title',url);
    if(dot){dot.remove();node._livePRChecks=null;}
    return node;
  }
  var text=liveStatusPRLabel(pr);node.setAttribute('data-pr-state',pr.state);node.setAttribute('aria-label',text.label);node.setAttribute('title',text.title);
  if(pr.checks && pr.checks!=='none'){
    if(!dot){dot=node._livePRChecks=doc.createElement('i');dot.className='dv-live-pr-checks';dot.setAttribute('aria-hidden','true');node.appendChild(dot);}
    dot.setAttribute('data-checks',pr.checks);
  }else if(dot){dot.remove();node._livePRChecks=null;}
  return node;
}
function liveStatusClass(el,state){
  LIVE_STATUS_APPEARANCES.forEach(function(value){
    var name='dv-live-'+value;
    if(value===state){if(!el.classList.contains(name))el.classList.add(name);}
    else if(el.classList.contains(name))el.classList.remove(name);
  });
  if(state){el.setAttribute('data-live-appearance',state);liveStatusInk(el,state);}
  else {el.removeAttribute('data-live-appearance');el.style.removeProperty('--dv-live-ink');el.style.removeProperty('--dv-live-print-ink');}
}
/* Choose ink against the actual host surface plus the configured status tint.
   Walk transparent ancestors; use the board ground for SVG carriers. */
function liveStatusInk(el,state){
  var doc=el.ownerDocument,win=doc && doc.defaultView;if(!win || !win.getComputedStyle)return;
  var computed=win.getComputedStyle(el),tint=state && rgba(computed.getPropertyValue('--dv-live-'+state)),strength=parseFloat(computed.getPropertyValue('--dv-live-fill')),amount=tint ? (Number.isFinite(strength)?strength/100:.15) : 0;tint=tint || [0,0,0];
  // Edge labels have no tinted backing; their ink must follow the ground alone.
  if(el.classList.contains('lbl'))amount=0;
  function rgba(raw){
    var match=/^#([0-9a-f]{6})$/i.exec(raw.trim());if(match)return [parseInt(match[1].slice(0,2),16),parseInt(match[1].slice(2,4),16),parseInt(match[1].slice(4,6),16),1];
    match=/rgba?\(([^)]+)\)/.exec(raw);if(match){var c=match[1].split(/[, /]+/).map(Number);return [c[0],c[1],c[2],c.length>3?c[3]:1];}
    match=/color\(srgb ([^)]+)\)/.exec(raw);if(match){var p=match[1].split(/[ /]+/).map(Number);return [p[0]*255,p[1]*255,p[2]*255,p.length>3?p[3]:1];}
    return null;
  }
  var board=el.closest('.board'),layers=[],ground=board && rgba(win.getComputedStyle(board).getPropertyValue('--dv-board-ground'));
  if(ground)layers.push(ground);
  else for(var host=el.parentElement;host;host=host.parentElement || (host.getRootNode && host.getRootNode().host)){
    var color=rgba(win.getComputedStyle(host).backgroundColor);if(!color)continue;
    if(color[3]>0)layers.push(color);if(color[3]===1)break;
  }
  var rgb=[255,255,255];layers.reverse().forEach(function(layer){rgb=rgb.map(function(v,i){return v*(1-layer[3])+layer[i]*layer[3];});});
  function ink(rgb){var lum=rgb.map(function(v,i){var n=(v*(1-amount)+tint[i]*amount)/255;return n<=.04045?n/12.92:Math.pow((n+.055)/1.055,2.4);});
  var light=lum[0]*.2126+lum[1]*.7152+lum[2]*.0722;return light>.179?'#000000':'#ffffff';}
  el.style.setProperty('--dv-live-ink',ink(rgb));
  // Print uses white board grounds; retain contrast even with a fully opaque tint.
  el.style.setProperty('--dv-live-print-ink',ink([255,255,255]));
  if(el.classList.contains('dv-metrics-card')){
    // Numeric health retains its hue, but must stay readable on user-selected
    // work fills, including fully opaque green, black and white.
    var surface=rgb.map(function(v,i){return v*(1-amount)+tint[i]*amount;});
    if(!state){var backing=rgba(computed.getPropertyValue('--explore-bg'));if(backing)surface=backing.slice(0,3);}
    function luminance(color){var c=color.map(function(v){var n=v/255;return n<=.04045?n/12.92:Math.pow((n+.055)/1.055,2.4);});return c[0]*.2126+c[1]*.7152+c[2]*.0722;}
    function healthInk(name,fallback,ground){
      var color=(rgba(computed.getPropertyValue(name)) || fallback).slice(0,3),light=luminance(ground || surface),end=light>.179?0:255;
      for(var step=0;step<=20;step++){
        var candidate=color.map(function(v){return Math.round(v+(end-v)*step/20);}),lum=luminance(candidate);
        if((Math.max(light,lum)+.05)/(Math.min(light,lum)+.05)>=4.5 || step===20)return 'rgb('+candidate.join(',')+')';
      }
    }
    el.style.setProperty('--dv-metrics-observed-ink',healthInk(state?'--dv-live-'+state:'--dtext',[138,147,163]));
    el.style.setProperty('--dv-metrics-failing-ink',healthInk('--dv-metrics-amber',[232,163,0]));
    var printSurface=[255,255,255].map(function(v,i){return v*(1-amount)+tint[i]*amount;});
    el.style.setProperty('--dv-metrics-observed-print-ink',healthInk(state?'--dv-live-'+state:'--dtext',[138,147,163],printSurface));
    el.style.setProperty('--dv-metrics-failing-print-ink',healthInk('--dv-metrics-amber',[232,163,0],printSurface));
  }
}
/* Preserve authored Node Styles while live classes supply shared appearance.
   Presets also support the unknown-evidence construction fallback. */
var LIVE_STATUS_PRESETS = {todo:'slate',active:'azure',testing:'violet',done:'moss',blocked:'rose',missing:'rose',unchanged:'moss'};
function liveStatusPreset(el,token){
  var saved=el._livePreset;
  if(!saved && !token)return;
  if(!saved){
    var authored=null;(el.getAttribute('class') || '').split(/\s+/).forEach(function(name){if(/^ns-/.test(name))authored=name.slice(3);});
    saved=el._livePreset={styled:el.classList.contains('node-styled'),token:authored,current:null};
  }
  if(saved.current)el.classList.remove('ns-'+saved.current);
  if(saved.token)el.classList.remove('ns-'+saved.token);
  if(token){el.classList.add('node-styled');el.classList.add('ns-'+token);saved.current=token;return;}
  if(!saved.styled)el.classList.remove('node-styled');
  if(saved.token)el.classList.add('ns-'+saved.token);
  delete el._livePreset;
}
function liveStatusCarrier(value,map){
  return liveStatusRollup(trackingRefs(value).tickets.map(function(key){return map[key] && map[key].state;}));
}
function liveStatusEvidence(value,map){
  return liveStatusPresentationRollup(trackingRefs(value).tickets.map(function(key){return map[key] && map[key].state || 'unknown';}));
}
/* Presentation is distinct from provider evidence: uncovered authored intent wins,
   and missing provider evidence never claims completion or no-change. */
function liveStatusPresentation(value,map){
  var keys=trackingRefs(value).tickets,states=keys.map(function(key){return map[key] && map[key].state || 'unknown';});
  if(value && value.missingWork===true)states.push('missing');
  if(value && value._detailUnavailable)states.push('unknown');
  return liveStatusPresentationRollup(states.length?states:['unchanged']);
}
/* A domain is a presentation summary, never a new evidence/availability carrier.
   Walk authored links only; external pages must already have been approved and
   loaded by the detail controller. Shared targets are counted once per summary. */
function liveStatusDomainSummary(page,node,loaded){
  if(!node || !node.detail || isTextBoxNode(node))return null;
  var tickets=new Set(),ticketSources=Object.create(null),missing=0,unavailable=[],seen=new Set(),active=new Set(),count=0;
  function add(source,value){
    trackingRefs(value).tickets.forEach(function(key){
      tickets.add(key);
      var owner={tracking:source.tracking,authoredURL:trackingTicketURL(value,key)},previous=ticketSources[key];
      if(!previous || !previous.authoredURL && !(previous.tracking && previous.tracking.jira && previous.tracking.jira.site))ticketSources[key]=owner;
    });
    if(value && value.missingWork===true)missing++;
  }
  function descend(source,value,depth){
    add(source,value);var detail=value && value.detail;if(!detail)return;
    var targetPage=detail.spec?(loaded || {})[JSON.stringify([detail.spec,detail.revision || ''])]:source;
    var target=targetPage && (detail.section?detailSection(targetPage,detail.section):detail.spec?sectionRecords(targetPage).find(function(r){return r.section.diagram;}):null);
    var child=target && target.section.diagram;
    if(!child){unavailable.push(detail.spec || detail.url || detail.section || 'Unknown detail');return;}
    if(active.has(child) || depth>=DETAIL_MAX_DEPTH){unavailable.push('Recursive detail '+target.reference);return;}
    if(seen.has(child))return;seen.add(child);active.add(child);
    Object.keys(child.nodes || {}).forEach(function(id){var next=child.nodes[id];if(!isTextBoxNode(next)){count++;descend(targetPage,next,depth+1);}});
    (child.edges || []).forEach(function(edge){count++;add(targetPage,edge);});active.delete(child);
  }
  descend(page,node,0);
  return {tickets:Array.from(tickets),ticketSources:ticketSources,prs:trackingRefs(node).prs,missingWork:missing>0,_detailUnavailable:unavailable.length>0,
    missing:missing,unavailable:Array.from(new Set(unavailable)),carriers:count};
}
// Unmarked edges retain evidence-only paint; a marker adds authored missing
// intent without turning an ordinary unticketed connection into a status carrier.
function liveStatusEdgePresentation(value,map,markerOn){
  return markerOn!==false && value && value.missingWork===true?liveStatusPresentation(value,map):liveStatusEvidence(value,map);
}
function liveStatusPresentationRollup(states){
  for(var i=0;i<4;i++){var state=['blocked','missing','active','testing'][i];if(states.indexOf(state)>=0)return state;}
  if(states.indexOf('unknown')>=0)return null;
  var work=states.filter(function(state){return state && state!=='unchanged';});
  return work.length?liveStatusRollup(work):states.indexOf('unchanged')>=0?'unchanged':null;
}
/* Availability is separate from Jira state: every attached ticket needs explicit
   Done evidence, including tickets omitted from a partial response. */
function liveStatusUnavailable(value,map){
  return !!trackingExistsWhen(value) && !trackingRefs(value).tickets.every(function(key){return map[key] && map[key].state==='done';});
}
function liveStatusAvailability(value,map,diagram){
  var causes=[];
  function add(carrier,id){
    if(!liveStatusUnavailable(carrier,map))return;
    var tickets=trackingRefs(carrier).tickets,awaiting=!tickets.some(function(key){var state=map[key] && map[key].state;return LIVE_STATUS_STATES.indexOf(state)>=0 && state!=='done';});
    causes.push({id:id,label:carrier.title || id,value:carrier,tickets:tickets,awaiting:awaiting});
  }
  if(value){
    add(value,value.from?value.from+' → '+value.to:'This node');
    if(diagram && value.from)[value.from,value.to].filter(function(id,index,list){return list.indexOf(id)===index;}).forEach(function(id){var node=(diagram.nodes || {})[id];if(node)add(node,id);});
  }
  return causes.length?causes:null;
}
function liveStatusAvailabilityLabel(causes){
  return causes?causes.map(function(cause){return cause.awaiting?'Awaiting Jira status · '+cause.label+' requires confirmed Done status for '+cause.tickets.join(', '):'Not built yet · '+cause.label+' requires '+cause.tickets.join(', ')+' to be Done';}).join('; '):'';
}
function liveStatusAvailabilityClass(el,causes){
  el.classList.toggle('dv-live-unavailable',!!causes);
}
/* Bounded node artwork, always inside the card's authored geometry. No IDs or
   pattern definitions: native siblings and rebuilt boards cannot collide. */
function liveStatusNodeConstruction(el,value,state,causes){
  el.querySelectorAll('.dv-live-construction').forEach(function(item){item.remove();});
  el.classList.remove('dv-live-reserved','dv-live-blueprint');
  if(!causes)return;
  var card=el.querySelector('.card');if(!card)return;
  var w=Number(card.getAttribute('width') || card.getAttribute('data-node-width')),
    h=Number(card.getAttribute('height') || card.getAttribute('data-node-height')),
    body=Number(el.getAttribute('data-dv-body-height')) || h-32,active=state==='active' || state==='testing';
  if(!isFinite(w) || !isFinite(h) || w<40 || h<40)return;
  el.classList.add(active?'dv-live-blueprint':'dv-live-reserved');
  var doc=el.ownerDocument || document;
  function svg(tag,attrs,parent){var item=doc.createElementNS(SVGNS,tag);Object.keys(attrs).forEach(function(key){item.setAttribute(key,attrs[key]);});parent.appendChild(item);return item;}
  var art=svg('g',{'class':'dv-live-construction','aria-hidden':'true','pointer-events':'none'},card.parentNode);
  if(active)card.parentNode.insertBefore(art,card.nextSibling);
  var right=w-(el.classList.contains('node-handoff')?28:10);
  if(active){
    var strokes=[],left=8,top=8,bottom=h-8,width=right-left,height=bottom-top;
    for(var x=-height;x<width;x+=10){
      var x1=Math.max(0,x),y1=Math.max(0,-x),x2=Math.min(width,x+height),y2=Math.min(height,width-x);
      strokes.push('M'+(left+x1)+' '+(top+y1)+'L'+(left+x2)+' '+(top+y2));
    }
    svg('path',{'class':'dv-live-hatching',d:strokes.join('')},art);
    svg('path',{'class':'dv-live-construction-frame',d:'M4 17V4H17M'+(right-11)+' 4H'+(right+2)+'V17M'+(right+2)+' '+(h-17)+'V'+(h-4)+'H'+(right-11)+'M17 '+(h-4)+'H4V'+(h-17)},art);
    return;
  }
  var icon=el.querySelector('use'),image=el.querySelector('.node-image');
  if(icon || image){
    var ix=icon?Number(icon.getAttribute('x')):18,iy=icon?Number(icon.getAttribute('y')):body/2-8;
    svg('path',{'class':'dv-live-placeholder-icon',transform:'translate('+ix+' '+iy+')',d:'M1 4L8 1L15 4V12L8 15L1 12ZM1 4L8 7L15 4M8 7V15'},art);
  }
  svg('path',{'class':'dv-live-reservation-divider',d:'M10 '+(body+1)+'H'+right},art);
  var caption=causes.every(function(cause){return cause.awaiting;})?'AWAITING JIRA STATUS':'NOT BUILT YET';
  var captionEl=svg('text',{'class':'dv-live-reservation-title',x:10,y:body+12},art);captionEl.textContent=caption;
  // Narrow handoff cards tighten letter spacing rather than reducing glyph size.
  if(caption.length*6>right-10){captionEl.setAttribute('textLength',right-10);captionEl.setAttribute('lengthAdjust','spacing');}
  var tickets=trackingRefs(value).tickets,budget=Math.max(4,Math.floor((right-10)/6)),summary=tickets.join(' + ');
  if(summary.length>budget){
    var suffix=tickets.length>1?' +'+(tickets.length-1):'',limit=Math.max(1,budget-suffix.length-1);
    summary=tickets[0].slice(0,limit)+(tickets[0].length>limit?'…':'')+suffix;
  }
  svg('text',{'class':'dv-live-reservation-tickets',x:10,y:body+25},art).textContent=summary;
}
/* Over time (#1012): a ticket with no status on a past day has the Missing paint, but it is a gap in the
   record, not a blocker. Only the day overlay sets noTicket; a ticket missing today still blocks. */
function liveStatusBlocks(entry){return !!entry && !entry.noTicket && ['blocked','missing'].indexOf(entry.state)>=0;}
function liveStatusWithoutGaps(map){var out=Object.create(null);Object.keys(map).forEach(function(key){if(!map[key].noTicket)out[key]=map[key];});return out;}
function liveStatusBlockingKeys(value,map){
  return trackingRefs(value).tickets.filter(function(key){return liveStatusBlocks(map[key]);});
}
/* Dependencies are ticket -> ticket (#765), never carrier -> carrier, and never
   inferred from edge direction: edges are data flow. Two sources merge by
   provenance: Jira issue links on the map entry (source "jira") and authored
   page.tracking.dependencies pairs (source "authored"). */
function liveStatusDependencies(pages,map){
  var out=Object.create(null);
  function add(ticket,key,source,linkType,reason){
    var list=out[ticket] || (out[ticket]=[]),item=null;
    list.some(function(entry){if(entry.key===key)item=entry;return !!item;});
    if(!item){item={key:key,sources:[]};list.push(item);}
    if(item.sources.indexOf(source)<0)item.sources.push(source);
    if(typeof linkType==='string' && linkType && !item.linkType)item.linkType=linkType;
    if(typeof reason==='string' && reason && !item.reason)item.reason=reason;
  }
  Object.keys(map || {}).forEach(function(ticket){
    var entry=map[ticket];if(!entry || !Array.isArray(entry.dependsOn))return;
    entry.dependsOn.forEach(function(dep){if(dep && typeof dep.key==='string' && dep.key!==ticket)add(ticket,dep.key,dep.source==='authored'?'authored':'jira',dep.linkType,dep.reason);});
  });
  (pages || []).forEach(function(page){trackingDependencies(page).forEach(function(pair){add(pair.ticket,pair.on,'authored',null,pair.reason);});});
  return out;
}
/* X waits on Y while Y is not done, unless X is already active, testing or done (then the
   link is listed but X is not waiting). A blocked or missing X still waits: the
   panel and popover record it, while the canvas keeps X's own stronger paint.
   Tone from the DIRECT upstream: unfinished grey; blocked or missing (including
   no entry) red. */
function liveStatusWaitingTone(state){return state==='blocked' || state==='missing'?'red':'grey';}
function liveStatusUpstreamTone(entry,state){return entry && entry.noTicket?'grey':liveStatusWaitingTone(state);}
function liveStatusTicketWaiting(dependencies,map){
  var out=Object.create(null);
  // An empty map is no evidence at all: nothing waits before the first answer or after clear().
  if(!map || !Object.keys(map).length)return out;
  Object.keys(dependencies || {}).forEach(function(ticket){
    var own=map[ticket] && map[ticket].state;
    if(own==='active' || own==='testing' || own==='done')return;
    var on=[];
    dependencies[ticket].forEach(function(dep){
      var state=map[dep.key] && LIVE_STATUS_STATES.indexOf(map[dep.key].state)>=0?map[dep.key].state:'missing';
      if(state==='done')return;
      on.push({key:dep.key,state:state,tone:liveStatusUpstreamTone(map[dep.key],state)});
    });
    if(!on.length)return;
    on.sort(function(a,b){return a.key<b.key?-1:a.key>b.key?1:0;});
    out[ticket]={tone:on.some(function(item){return item.tone==='red';})?'red':'grey',on:on};
  });
  return out;
}
/* A carrier waits when any of its tickets waits; red wins over grey. Keys are
   node IDs or from->to edge keys, the upstream keys sorted. */
function liveStatusCarrierWaiting(diagram,map,waiting){
  var out=Object.create(null),nodes=diagram.nodes || {};
  function visit(id,value){
    var tickets=trackingRefs(value).tickets,keys=[],red=false;
    tickets.forEach(function(ticket){var item=waiting && waiting[ticket];if(!item)return;if(item.tone==='red')red=true;item.on.forEach(function(up){if(keys.indexOf(up.key)<0)keys.push(up.key);});});
    if(keys.length){keys.sort();out[id]={tone:red?'red':'grey',keys:keys};}
  }
  Object.keys(nodes).forEach(function(id){if(!isTextBoxNode(nodes[id]))visit(id,nodes[id]);});
  (diagram.edges || []).forEach(function(edge){visit(edge.from+'->'+edge.to,edge);});
  return out;
}
/* One chain per path from a root upstream (one that waits on nothing itself)
   through each waiting hop; a cycle ends a chain at its first repeat. */
function liveStatusDependencyChains(waiting){
  var downstream=Object.create(null),roots=[],chains=[];
  Object.keys(waiting || {}).forEach(function(ticket){waiting[ticket].on.forEach(function(up){(downstream[up.key] || (downstream[up.key]=[])).push(ticket);if(!waiting[up.key] && roots.indexOf(up.key)<0)roots.push(up.key);});});
  if(!roots.length)Object.keys(downstream).sort().slice(0,1).forEach(function(key){roots.push(key);});
  function walk(path){
    var next=(downstream[path[path.length-1]] || []).filter(function(key){return path.indexOf(key)<0;}).sort();
    if(!next.length){chains.push(path);return;}
    next.forEach(function(key){if(chains.length<200)walk(path.concat([key]));});
  }
  roots.sort().forEach(function(root){walk([root]);});
  return chains;
}
/* Transitive downstream tickets of one key through waiting links. */
function liveStatusDownstreamTickets(key,waiting){
  var out=[],queue=[key],cursor=0;
  while(cursor<queue.length){var current=queue[cursor++];Object.keys(waiting || {}).forEach(function(ticket){
    if(out.indexOf(ticket)>=0 || ticket===key)return;
    if(waiting[ticket].on.some(function(up){return up.key===current;})){out.push(ticket);queue.push(ticket);}
  });}
  return out;
}
function liveStatusWaitingClass(el,waiting){
  if(waiting && waiting.keys && waiting.keys.length){el.classList.add('dv-live-waiting');el.setAttribute('data-dv-live-waiting-on',waiting.keys.join(','));el.setAttribute('data-dv-live-waiting-tone',waiting.tone);}
  else {el.classList.remove('dv-live-waiting');el.removeAttribute('data-dv-live-waiting-on');el.removeAttribute('data-dv-live-waiting-tone');}
}
/* Reconstruct the engine's small communication-break input from each visible
   SVG. Live effects own separate classes/elements so the stepper can clear or
   settle its authored failures without erasing persistent ticket evidence. */
function liveStatusEdgeBreaks(scope,diagram,map,on,availabilityOn){
  scope.querySelectorAll('.dv-live-comm-failure').forEach(function(el){el.remove();});
  scope.querySelectorAll('.dv-live-comm-hidden,.dv-live-packet-hidden,.dv-live-comm-suppressed').forEach(function(el){el.classList.remove('dv-live-comm-hidden','dv-live-packet-hidden','dv-live-comm-suppressed');});
  scope.querySelectorAll('svg').forEach(function(svg){
    var board={svg:svg,edgeIds:Object.create(null)},failures=Object.create(null),labels=Object.create(null);
    (diagram.edges || []).forEach(function(edge,index){
      var path=svg.querySelector('path.edge[data-dv-edge="'+index+'"]');if(!path)return;
      var state=on?liveStatusEdgePresentation(edge,map,availabilityOn):null,key=edge.from+'->'+edge.to,unavailable=on && availabilityOn!==false?liveStatusAvailability(edge,map,diagram):null,missing=on && availabilityOn!==false && edge.missingWork===true;
      if(state==='blocked' || missing || unavailable){
        board.edgeIds[key]={e:edge,idx:index,pathEl:path,haloEl:svg.querySelector('path.halo[data-dv-edge="'+index+'"]')};
        failures[key]='blocked';labels[key]=[edge.missingWork===true?'Missing work: additional work remains without a linked ticket':'',unavailable?liveStatusAvailabilityLabel(unavailable):liveStatusBlockingKeys(edge,map).join(', ')].filter(Boolean).join('; ');
        svg.querySelectorAll('g.comm-failure[data-dv-edge="'+index+'"]').forEach(function(el){el.classList.add('dv-live-comm-suppressed');});
      }
      if(state==='todo' || state==='blocked' || missing || unavailable)svg.querySelectorAll('circle.pkt').forEach(function(dot){
        var mpath=dot.querySelector('mpath');if(mpath && mpath.getAttribute('href')==='#'+path.getAttribute('id'))dot.classList.add('dv-live-packet-hidden');
      });
    });
    showCommunicationFailures(board,failures,false,{live:true,labels:labels});
    svg.querySelectorAll('g.dv-live-comm-failure').forEach(function(el){
      var edge=diagram.edges[Number(el.getAttribute('data-dv-edge'))],causes=on && availabilityOn!==false?liveStatusAvailability(edge,map,diagram):null;
      liveStatusAvailabilityClass(el,causes);liveStatusClass(el,on?liveStatusEdgePresentation(edge,map,availabilityOn):null);
    });
    // A live break is the glyph alone: the edge names its ends, and the badge,
    // popover and the group's title/aria-label carry the blocking keys. Canvas
    // text here would sit on the edge label, its coin or a node card.
    svg.querySelectorAll('g.dv-live-comm-failure .dv-live-break-label').forEach(function(el){el.remove();});
    if(svg._layoutStatusCoins)svg._layoutStatusCoins();
  });
}
/* #1103: the filter a step applies. A status diagram carries domain summaries,
   which include remote detail tickets once loaded, so it names its authored
   diagram and page (_liveSource) and the lit set stays the static one the
   validator and Workbench use. */
function liveStatusStepFilter(diagram,step){
  var source=diagram && diagram._liveSource;
  return source?trackingStepTicketFilter(source.diagram,step,source.page):trackingStepTicketFilter(diagram,step);
}
function liveStatusScope(diagram,page,shown){
  var out=Object.assign({},diagram,shown || {});Object.defineProperty(out,'_liveSource',{value:{diagram:diagram,page:page}});return out;
}
/* With a ticketFilter the step state is the rollup of the filtered tickets
   alone; carrier markers (missingWork, unavailable detail) stay on the
   carriers. Without one, each direct carrier contributes its presentation. */
function liveStatusStep(diagram,step,map){
  var filter=liveStatusStepFilter(diagram,step);
  if(filter)return liveStatusPresentationRollup(filter.map(function(key){return map[key] && map[key].state || 'unknown';}));
  return liveStatusPresentationRollup(liveStatusStepCarriers(diagram,step,true).map(function(carrier){
    return liveStatusPresentation(carrier.value,map) || 'unknown';
  }));
}
function liveStatusStepCarriers(diagram,step,directOnly){return trackingStepCarriers(diagram,step,directOnly);}
/* The filter narrows only the direct view (state, caption, ticket list). Broad
   aggregates (lanes and the Tickets table's lane stripes) keep every ticket. */
function liveStatusStepTickets(diagram,step,directOnly){
  var keys=[],filter=directOnly?liveStatusStepFilter(diagram,step):null;if(filter)return filter.slice();
  liveStatusStepCarriers(diagram,step,directOnly).forEach(function(carrier){
    trackingRefs(carrier.value).tickets.forEach(function(key){if(keys.indexOf(key)<0)keys.push(key);});
  });return keys;
}
function liveStatusLanes(page,map){
  var out=Object.create(null);Object.keys(page.lanes || {}).forEach(function(id){out[id]={total:0,done:0,state:null,keys:[]};});
  sectionRecords(page).forEach(function(record){var d=record.section.diagram || {};
    (d.steps || []).forEach(function(step){var lane=out[step.lane];if(!lane)return;
      liveStatusStepTickets(d,step).forEach(function(key){if(lane.keys.indexOf(key)<0)lane.keys.push(key);});
    });
  });
  Object.keys(out).forEach(function(id){var lane=out[id];lane.total=lane.keys.length;
    lane.done=lane.keys.filter(function(key){return map[key] && map[key].state==='done';}).length;
    lane.state=liveStatusRollup(lane.keys.map(function(key){return map[key] && map[key].state;}));
  });return out;
}
function liveStatusCaption(diagram,step,map,waiting){
  var keys=liveStatusStepTickets(diagram,step,true).filter(function(key){return map[key];}),state=liveStatusStep(diagram,step,map);
  if(!state)return !liveStatusStepFilter(diagram,step) && liveStatusStepCarriers(diagram,step,true).some(function(c){return c.value._detailUnavailable;})?'DETAIL EVIDENCE UNAVAILABLE':liveStatusStepTickets(diagram,step,true).length?'AWAITING TICKET STATUS':'';
  if(state==='done')return 'DONE';
  if(state==='unchanged')return 'NO CHANGE NEEDED';
  if(state==='missing' && !keys.some(function(key){return map[key].state==='missing';}))return 'MISSING WORK · unlinked work remains';
  if(state==='blocked' || state==='missing'){
    var blockers=keys.filter(function(key){return map[key].state===state;}),detail=state==='blocked' && map[blockers[0]].detail;
    return state.toUpperCase()+' · '+blockers.join(', ')+(detail?' · '+detail:'');
  }
  var text=(state==='active'?'IN PROGRESS':state==='testing'?'TESTING':'TODO')+' · '+keys.length+' tickets';
  if(state==='todo' && waiting){
    // Per shown ticket, so a filtered step waits only on what its tickets wait on.
    var upstream=[];
    liveStatusStepTickets(diagram,step,true).forEach(function(ticket){((waiting[ticket] || {}).on || []).forEach(function(up){if(upstream.indexOf(up.key)<0)upstream.push(up.key);});});
    if(upstream.length)text+=' · waiting on '+upstream.sort().join(', ');
  }
  return text;
}
/* #1138 (D2): Over time on a board with no Jira references: the last 7 local days ending at `now`, built
   with no calls. Days have the shape liveStatusHistoryDays writes: `key` is the local date, `at` the next
   local midnight, and the label carries the year when the list spans two years. There are no ticket states. */
function liveStatusLocalDays(now,locale){
  var today=new Date(now),year=today.getFullYear(),month=today.getMonth(),date=today.getDate(),days=[];
  var format=new Date(year,month,date-6).getFullYear()===year?{month:'short',day:'numeric'}:{month:'short',day:'numeric',year:'numeric'};
  for(var back=6;back>=0;back--){
    var text=new Date(year,month,date-back).toLocaleDateString(locale || [],format);
    days.push({key:new Date(Date.UTC(year,month,date-back)).toISOString().slice(0,10),at:new Date(year,month,date-back+1).toISOString(),label:text,short:text,states:{}});
  }
  return {days:days,index:days.length-1};
}
/* Over time (#929, #1012): one past day over today's map. Status comes from the day and everything
   else stays as of today, so a ticket keeps its row, title and place in the total. A ticket the day
   does not name is Missing, because an uncolored carrier would hide that it did not exist.
   updatedAt is dropped because it describes today, not that day. */
function liveStatusDayMap(today,states){
  var out=Object.create(null);
  Object.keys(today || {}).forEach(function(key){
    var entry=Object.assign({},today[key]),day=states && states[key];
    delete entry.state;delete entry.detail;delete entry.updatedAt;
    if(day && LIVE_STATUS_STATES.indexOf(day.state)>=0){entry.state=day.state;if(typeof day.detail==='string')entry.detail=day.detail;}
    else{entry.state='missing';entry.noTicket=true;entry.detail='No ticket on this day';}
    out[key]=entry;
  });
  return out;
}
function liveStatusStale(entry,now,staleDays){
  var days=typeof staleDays==='number' && isFinite(staleDays) && staleDays>0?staleDays:7;
  var at=entry && Date.parse(entry.updatedAt);
  return !!(entry && entry.state==='active' && isFinite(at) && now-at>days*86400000);
}
function liveStatusReadiness(page,map,waiting){
  var result={total:0,done:0,ready:true,blockers:0,waiting:0},primaryCount=0,blockers=[];
  sectionRecords(page).forEach(function(record){var d=record.section.diagram;if(!d)return;
    var carriers=Object.keys(d.nodes || {}).filter(function(id){return !isTextBoxNode(d.nodes[id]);}).map(function(id){return d.nodes[id];}).concat(d.edges || []);
    function complete(value){return value.missingWork!==true && trackingRefs(value).tickets.every(function(key){return map[key] && map[key].state==='done';});}
    carriers.forEach(function(value){var keys=trackingRefs(value).tickets;if(!keys.length && value.missingWork!==true)return;result.total++;if(complete(value))result.done++;
      liveStatusBlockingKeys(value,map).forEach(function(key){if(blockers.indexOf(key)<0)blockers.push(key);});
    });
    result.waiting+=Object.keys(liveStatusCarrierWaiting(d,map,waiting || {})).length;
    var primary=diagramPathList(d)[0];
    (primary?primary.indices:[]).forEach(function(index){liveStatusStepCarriers(d,d.steps[index]).forEach(function(carrier){
      if(!trackingRefs(carrier.value).tickets.length && carrier.value.missingWork!==true)return;primaryCount++;if(!complete(carrier.value))result.ready=false;
    });});
  });result.ready=result.ready && primaryCount>0;result.blockers=blockers.length;return result;
}
/* Coverage counts keys, independently of paint, readiness and lane rollups. */
function liveStatusContainer(key,entry,roots){
  return (roots || []).indexOf(key)>=0 || !!(entry && (entry.kind==='epic' || entry.kind==='initiative'));
}
function liveStatusCoverage(page,map,refs,pages){
  var roots=refs && refs.epics || trackingEpics(page),keys=(refs && refs.tickets || []).filter(function(key){return !liveStatusContainer(key,map[key],roots);});
  var epics=[],initiatives=[],members=[],included=[],excluded=[];
  // Resolve each source separately: one page's exclusions cannot erase another
  // approved detail page's intentional inherited membership.
  (pages || [page]).forEach(function(source){
    var sourceRoots=pages?trackingEpics(source):roots,omit=trackingExclusions(source);
    var sourceInitiatives=sourceRoots.filter(function(key){return map[key] && map[key].kind==='initiative';});
    var sourceEpics=sourceRoots.filter(function(key){return sourceInitiatives.indexOf(key)<0;});
    Object.keys(map || {}).forEach(function(key){
      var entry=map[key];if(!entry || !(entry.initiatives || []).some(function(root){return sourceInitiatives.indexOf(root)>=0;}))return;
      var epic=entry.kind==='epic'?key:entry.epic;if(epic && sourceEpics.indexOf(epic)<0)sourceEpics.push(epic);
    });
    sourceEpics.forEach(function(key){if(epics.indexOf(key)<0)epics.push(key);});
    sourceInitiatives.forEach(function(key){if(initiatives.indexOf(key)<0)initiatives.push(key);});
    omit.forEach(function(key){if(!liveStatusContainer(key,map[key],roots) && excluded.indexOf(key)<0)excluded.push(key);});
    Object.keys(map || {}).forEach(function(key){
      var entry=map[key];if(!entry || liveStatusContainer(key,entry,roots) || sourceEpics.indexOf(entry.epic)<0)return;
      if(members.indexOf(key)<0)members.push(key);
      if(omit.indexOf(key)<0 && included.indexOf(key)<0)included.push(key);
    });
  });
  var out={epics:epics,onDiagram:keys,notOnDiagram:included.filter(function(key){return keys.indexOf(key)<0;}),
    notInEpic:roots.length?keys.filter(function(key){return members.indexOf(key)<0;}):[],excluded:excluded};
  if(initiatives.length)out.initiatives=initiatives;
  return out;
}
/* Panels can mount before renderPage finishes constructing its controller. The
   pending bridge is released by the same panel cleanup as ordinary listeners. */
var liveStatusControllers = new WeakMap(), liveStatusPending = [];
function liveStatusControllerFor(element){
  for(var node=element;node;node=node.parentNode || node.host){
    var controller=liveStatusControllers.get(node);if(controller)return controller;
  }
  return null;
}
function liveStatusWhenReady(host,connect){
  var pending={host:host,connect:connect};liveStatusPending.push(pending);
  return function(){var i=liveStatusPending.indexOf(pending);if(i>=0)liveStatusPending.splice(i,1);};
}
/* One host provider loop, shared by the Jira map and the telemetry map (#939).
   start() calls at once (callers defer it past first paint), then every `delay`
   ms while the document is visible; a hidden document pauses the timer and
   becoming visible runs one catch-up call. A request while a call is in flight
   becomes one catch-up after it. stop() aborts the signal handed to `call`,
   retires the timer and the visibility listener, and drops any late answer;
   start() after stop() begins again with a fresh signal. hooks: busy() before
   each call, result(value) and error(error) after it. */
function liveStatusPoller(call,delay,hooks){
  var abort=null,timer=0,pending=false,catchUp=false,running=false,paused=false,generation=0;
  function visible(){return !document.hidden;}
  function stopTimer(){if(timer){clearTimeout(timer);timer=0;}}
  function arm(){stopTimer();if(running && !paused && visible())timer=setTimeout(function(){timer=0;run();},delay);}
  function run(){
    if(!running || paused || !visible())return;
    if(pending){catchUp=true;return;}
    pending=true;stopTimer();var current=generation,signal=abort.signal;hooks.busy();
    Promise.resolve().then(function(){if(current===generation)return call(signal);}).then(function(value){
      if(current===generation)hooks.result(value);
    },function(error){if(current===generation)hooks.error(error);}).then(function(){
      if(current!==generation)return;pending=false;
      if(catchUp && !paused && visible()){catchUp=false;run();}else arm();
    });
  }
  function visibility(){stopTimer();if(visible())run();}
  return {
    pause:function(){paused=true;stopTimer();},
    resume:function(){paused=false;if(running)run();else this.start();},
    start:function(){if(running)return;running=true;paused=false;abort=new AbortController();document.addEventListener('visibilitychange',visibility);run();},
    stop:function(){if(!running)return;running=false;generation++;pending=catchUp=false;stopTimer();document.removeEventListener('visibilitychange',visibility);abort.abort();}
  };
}
function createLiveStatus(ctl,page,options,renderOptions){
  options=options || {};page=page || {};
  var view=ctl.view,authoring=!!(renderOptions && renderOptions.authoring),records=sectionRecords(page),map=Object.create(null),on=true,retired=false,applied=false,availabilityOn=true;
  // #827: the validated edit history rides the snapshot so the edit-history panel can read it through this seam.
  var editHistory=typeof editHistoryEntries==='function'?editHistoryEntries(page):[];
  // #828: the shared-board editor outlives this controller (each edit re-renders the page); Workbench authoring never edits here.
  var editor=!authoring && renderOptions && renderOptions.boardEditor || null;
  function editing(){return !!(editor && editor.state().active);}
  var destroyListeners=[],listeners=[],bindings=[],observer=null,frame=0,firstPaint=0,painting=false;
  var provider=typeof options.provider==='function'?options.provider:null;
  var refresh=Number(options.refreshMs),delay=isFinite(refresh)?Math.max(30000,refresh):30000;
  var noteText='',noteKind='info',actionLabel='',actionFn=null,pop=null,active=null,asked=false,demoControls=null,demoDestroy=null,cacheUpdatedAt=null;
  var activity=[],telemetryActivity=liveStatusTelemetryActivity(),seenKeys=Object.create(null),changedKeys=[],stepHooks=[],coverageRequest=0;
  // Over time (#929): while `over` is set, `map` is the chosen day and `over.live` is the map to return to.
  var overSource=null,over=null,overLoading=false,overProgress='',overError='',overRequest=0;
  // Connector evidence for the panel header (#769): who supplies the map, whether a fetch is in flight, when it last answered.
  // 'snapshot' (#1265): the Workbench shows an agent's saved snapshot; it is neither live nor the demo.
  var LIVE_STATUS_CONNECTIONS=['none','disconnected','approval','connecting','connected','error','demo','snapshot'];
  var demoMode=!!(options.demo && typeof options.demo.mount==='function');
  var connection={state:provider?(demoMode?'demo':'connecting'):'none',busy:false,checkedAt:null,source:demoMode?'Demo':provider?'Host':'',github:{state:'none',busy:false}};
  // GitHub is a second, optional connector (#756): its state rides beside the Jira state and never replaces it.
  var LIVE_STATUS_GITHUB_CONNECTIONS=['none','disconnected','connecting','connected','error'];
  function setStatus(value){
    if(retired || !value || typeof value!=='object')return;
    if(typeof value.state==='string' && LIVE_STATUS_CONNECTIONS.indexOf(value.state)>=0)connection.state=value.state;
    if(typeof value.busy==='boolean')connection.busy=value.busy;
    if(typeof value.source==='string' && value.source)connection.source=value.source;
    if(value.checkedAt!=null){var at=typeof value.checkedAt==='number'?value.checkedAt:Date.parse(value.checkedAt);if(isFinite(at))connection.checkedAt=new Date(at).toISOString();}
    var github=value.github;
    if(github && typeof github==='object'){
      if(typeof github.state==='string' && LIVE_STATUS_GITHUB_CONNECTIONS.indexOf(github.state)>=0)connection.github.state=github.state;
      if(typeof github.busy==='boolean')connection.github.busy=github.busy;
    }
    notify();
  }
  function reducedMotion(){return typeof window!=='undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');}
  var motion=reducedMotion();
  function motionChanged(){if(motion.matches){view.querySelectorAll('.dv-live-changed').forEach(function(el){el.classList.remove('dv-live-changed');});bindings.forEach(function(b){if(b.stepper && b.stepper.clearTraceTiming)b.stepper.clearTraceTiming();});}}
  if(motion && motion.addEventListener)motion.addEventListener('change',motionChanged);
  var remotePages=Object.create(null),originalLoad=renderOptions && renderOptions.loadDetail,wrappedLoad=null;
  function copy(value){return JSON.parse(JSON.stringify(value));}
  function domainSummary(source,value){return liveStatusDomainSummary(source,value,remotePages);}
  function statusDiagram(binding){
    // Prose sections participate in viewer repainting without owning a diagram.
    var d=binding.section.diagram || {},nodes=Object.assign({},d.nodes);
    Object.keys(nodes).forEach(function(id){var summary=domainSummary(binding.page,nodes[id]);if(summary)nodes[id]=Object.assign({},nodes[id],summary);});
    return liveStatusScope(d,binding.page,{nodes:nodes});
  }
  function remoteKey(ref){return JSON.stringify([ref.spec,ref.revision || '']);}
  /* Loaded approved details join the same runtime map; they have their own
     page tracking site. The host still owns transport and cancellation. */
  if(typeof originalLoad==='function'){
    wrappedLoad=function(ref,signal){return Promise.resolve(originalLoad(ref,signal)).then(function(raw){
      if(!retired && !signal.aborted){
        var previous=JSON.stringify(refs()),old=remotePages[remoteKey(ref)],retiredIds=[];
        if(old)sectionRecords(old).forEach(function(record){var d=record.section.diagram;if(d){retiredIds=retiredIds.concat(Object.keys(d.nodes || {}),(d.edges || []).map(function(edge){return edge.from+'->'+edge.to;}));}});
        remotePages[remoteKey(ref)]=normalize(raw);telemetry.bindingsChanged(retiredIds);schedule();
        // #1136: a board that opened on Trace for want of references opens Jira once a loaded detail brings some, unless the reader
        // chose a view or worked on a trace (Load, a log-line Load, choosing a trace or focusing a span clear statusAuto).
        if(statusAuto && referencesAvailable()){statusAuto=false;clearTraceFocus();statusMode='jira';}
        // #1138: a local Over time ends when a loaded detail gives the board Jira references.
        if(over && over.source===localHistory && referencesAvailable())overClose();
        if(JSON.stringify(refs())!==previous)notify();
      }
      return raw;
    });};
    renderOptions.loadDetail=wrappedLoad;
  }
  function sources(){return [page].concat(Object.keys(remotePages).map(function(key){return remotePages[key];}));}
  // Dependency evidence is recomputed from the map and the authored pairs on every paint (#765).
  var dependencies=Object.create(null),ticketWaiting=Object.create(null),dependencyKeys=[];
  function refreshDependencies(){
    var all=liveStatusDependencies(sources(),map),coverage=liveStatusCoverage(page,map,refs(),sources()),queue=coverage.onDiagram.concat(coverage.notOnDiagram),seen=[];
    dependencies=Object.create(null);
    // Keep only upstream evidence reachable from an included story, including
    // transitive links. Every displayed upstream story joins the board totals.
    for(var i=0;i<queue.length;i++){
      var key=queue[i];if(seen.indexOf(key)>=0)continue;seen.push(key);
      if(all[key]){dependencies[key]=all[key];all[key].forEach(function(dep){queue.push(dep.key);});}
    }
    dependencyKeys=seen.filter(function(key){return coverage.onDiagram.indexOf(key)<0 && coverage.notOnDiagram.indexOf(key)<0 && !liveStatusContainer(key,map[key],refs().epics);});
    ticketWaiting=liveStatusTicketWaiting(dependencies,map);
  }
  /* One walk over every carrier of the root page (resolved imported topology
     included) and its loaded detail pages, in page order: fn(value, id, source).
     refs() and the telemetry bindings (#939) share it. */
  function eachDiagram(fn){sources().forEach(function(source){sectionRecords(source).forEach(function(record){if(record.section.diagram)fn(record.section.diagram,source);});});}
  function eachCarrier(fn){eachDiagram(function(d,source){
    Object.keys(d.nodes || {}).forEach(function(id){fn(d.nodes[id],id,source);});
    (Array.isArray(d.edges)?d.edges:[]).forEach(function(edge){fn(edge,edge && typeof edge==='object'?edge.from+'->'+edge.to:null,source);});
  });}
  // refs() collects the whole page; refs(key) narrows to the carriers that hold that ticket (their tickets are just the key).
  function refs(key){
    var byKey=typeof key==='string',out={tickets:[],prs:[],epics:[]};
    if(!byKey)sources().forEach(function(source){trackingEpics(source).forEach(function(epic){if(out.epics.indexOf(epic)<0)out.epics.push(epic);});});
    eachCarrier(function(value){
      var found=trackingRefs(value);if(byKey){if(found.tickets.indexOf(key)<0)return;found.tickets=[key];}
      ['tickets','prs'].forEach(function(field){found[field].forEach(function(ref){if(out[field].indexOf(ref)<0)out[field].push(ref);});});
    });
    return out;
  }
  /* ctl.telemetry (#939): the host telemetry provider behind the panel's Metrics
     button, over the same carrier walk. Its changes repaint the canvas cues and
     the panel header. Without a host telemetry option, a Live status demo source
     that carries `telemetry` (the #live=demo player, #944) supplies it as Demo. */
  var telemetryOptions=renderOptions && renderOptions.telemetry===false?false:renderOptions && renderOptions.telemetry || (demoMode && options.telemetry) || null;
  var telemetryDemo=!!(telemetryOptions && (demoMode && telemetryOptions===options.telemetry || telemetryOptions.demo && typeof telemetryOptions.demo.mount==='function'));
  function historyCarriers(fn){
    // Root diagrams plus the mounted drill-down stack. Cached but closed remote
    // pages still contribute Jira refs, but no longer own historical requests.
    var diagrams=[];sectionRecords(page).forEach(function(record){if(record.section.diagram)diagrams.push({diagram:record.section.diagram,page:page});});
    sourceBindings().forEach(function(binding){if(binding.page!==page && binding.section.diagram)diagrams.push({diagram:binding.section.diagram,page:binding.page});});
    diagrams.forEach(function(item){var d=item.diagram;Object.keys(d.nodes || {}).forEach(function(id){fn(d.nodes[id],id,item.page);});
      (d.edges || []).forEach(function(edge){fn(edge,edge.from+'->'+edge.to,item.page);});});
  }
  var telemetryHooks={carriers:eachCarrier,historyCarriers:historyCarriers,diagrams:eachDiagram,jira:function(){return map;},
    observed:telemetryActivity.observe,reset:function(){telemetryActivity.clear();carriedExample=null;},retire:telemetryActivity.retire,
    changed:function(){if(!retired){telemetryActivity.reconcile(telemetry.snapshot().carriers);telemetryActivity.reconcileTraces(telemetry.snapshot());paint();notify();}}};
  var telemetry=createTelemetry(page,telemetryOptions,telemetryHooks);
  ctl.telemetry=telemetry;
  // Metrics canvas cues on every bound section, beside the Jira paint (src/viewer/telemetry.js).
  var metricsPreview=authoring && !!(renderOptions && renderOptions.metricsPreview) && trackingTelemetry(page).enabled;
  /* #1294: the reader's Metrics style, Cards (default) or Outline, remembered per viewer and board. Authoring always draws cards. */
  var metricsStyleKey='dv_metrics_style:'+(page.canon && page.canon.id || page.title || '')+'|'+(typeof location!=='undefined'?location.pathname:'');
  var metricsStyle=(function(){try{return view.ownerDocument.defaultView.localStorage.getItem(metricsStyleKey)==='outline'?'outline':'cards';}catch(ex){return 'cards';}})();
  function metricsStyleShown(){return authoring || metricsPreview?'cards':metricsStyle;}
  var OUTLINE_WORDS={held:'healthy',flowing:'healthy',failing:'degraded',error:'breach',waiting:'no data'};
  function outlineLabel(outline,label){outline.setAttribute('aria-label','Metrics for '+label+' · '+(OUTLINE_WORDS[outline.getAttribute('data-metric-state')] || 'no data')+'. Focus shows the card; Enter opens the details.');}
  function paintMetrics(){
    // The Metrics overlay draws in every view (Chuck 2026-11-08, D13); the Trace view keeps Jira work colouring off its cards.
    var metricsView=telemetryHooks.view(),references=referencesAvailable(),workPaint=statusMode!=='trace';
    bindings.forEach(function(binding){
      var scope=binding.el,d=binding.section.diagram;if(!d)return;
      var templates=trackingTelemetry(binding.page).templates;
      telemetryPaintCues(scope,d,templates,metricsView,trackingTelemetry(page).window);
      var cardsView=metricsPreview && trackingTelemetry(binding.page).enabled?telemetryCardPreview(d,templates):metricsView;
      telemetryPaintCards(scope,d,templates,cardsView,trackingTelemetry(page).window,function(card,path,edge,index,bound,outline){
        // #1200: the card border shows the metric state only (data-metric-state), never Jira work paint.
        // The bound carrier's work state still names the card and fills its popover in the Jira view,
        // on a board with ticket references (#1137).
        var appearance=!cardsView.preview && workPaint && api.enabled() && availabilityOn && references?liveStatusPresentation(edge,map):null;
        liveStatusInk(card,null);
        if(authoring){
          if(binding.ordinal!=null){card.setAttribute('data-metrics-section',binding.ordinal);card.setAttribute('tabindex','0');card.setAttribute('role','button');card.setAttribute('aria-label',(bound.card && bound.card.title || edge.label || edge.from+' to '+edge.to)+'. Drag metrics card to move. Arrow keys move 10 units; Shift moves 50. Drag a corner handle, or press Alt+Left or Alt+Right, to change the width.');telemetryCardResizeHandles(card);}
          return;
        }
        if(outline && index==null){
          // #1294 Outline node: a node that is already a carrier button (its Jira card) keeps that one button; the
          // ring and the shown card open it. Otherwise the ring is the node's metrics button.
          var nodeId=outline.getAttribute('data-metrics-carrier'),own=path.querySelector('.card.dv-live-target');
          if(own){carrierPointer(outline,own);carrierPointer(card,own);return;}
          var nodeAppearance=!cardsView.preview && workPaint && api.enabled() && availabilityOn && references?liveStatusPresentation(edge,map):null;
          carrierTarget(outline,nodeId,edge,nodeAppearance,binding.page.tracking,edge.title || nodeId,null,null,binding.ordinal!=null?{section:binding.ordinal,kind:'node',id:nodeId}:null,null,!workPaint);
          carrierPointer(card,outline);outlineLabel(outline,edge.title || nodeId);
          return;
        }
        var previous=path._livePointerTarget || path,c=previous._liveCarrier,target=outline || card;
        // #1294 Outline: the halo replaces the edge's label or line as its one carrier button; they point to it.
        if(outline && previous!==outline && previous.classList.contains('dv-live-target')){clearTarget(previous);carrierPointer(previous,outline);}
        carrierTarget(target,edge.from+'->'+edge.to,edge,appearance,binding.page.tracking,edge.label || edge.from+' → '+edge.to,c && c.waiting,c && c.availability,binding.ordinal!=null?{section:binding.ordinal,kind:'edge',index:index}:null,null,!workPaint);
        carrierPointer(path,target);carrierPointer(path.closest('svg').querySelector('path.halo[data-dv-edge="'+index+'"]'),target);
        if(outline){carrierPointer(card,outline);outlineLabel(outline,edge.label || edge.from+' → '+edge.to);}
      },telemetry.config(),metricsStyleShown());
      scope.querySelectorAll('svg').forEach(function(svg){
        if(svg._layoutStatusCoins)svg._layoutStatusCoins();
        // #1255: the status frame refresh after this paint grows the viewBox for the cards; Workbench
        // Preview metrics layout also asks its board camera to grow its box so the cards are not clipped.
        svg._dvGrowFrame=!!(authoring && cardsView && cardsView.preview);
      });
    });
  }
  // A named connector (#943: 'Grafana') reads "<source> connected · <window> window · refreshed <time>".
  var telemetryWindow=trackingTelemetry(page).window;
  function telemetrySource(){
    var source=telemetryOptions && telemetryOptions.source;
    if(typeof source==='function'){try{source=source();}catch(e){source='';}}
    return typeof source==='string'?source.trim():'';
  }
  // Selection belongs to a section object and carrier token, never to a step.
  var statusMode='jira',traceSelection=null,traceInitial=true,traceRequest=0,traceNotice='',traceShow=true,tracePending=null,traceFocus=null,traceFocusEpoch=0;
  var traceSections=new WeakMap(),traceSectionSerial=0;
  function traceObjectId(object){if(!traceSections.has(object))traceSections.set(object,++traceSectionSerial);return traceSections.get(object);}
  function directTraceSections(){
    var mounted=sourceBindings(),out=[];
    sources().forEach(function(source){sectionRecords(source).forEach(function(record){var section=record.section,d=section.diagram;if(!d || !trackingTelemetry(source).enabled)return;
      var binding=mounted.find(function(b){return b.section===section && b.page===source;}),id=[traceObjectId(source),traceObjectId(section),traceObjectId(d),binding?traceObjectId(binding.el):0].join('/');
      out.push({id:id,label:(source.title || 'Board')+' · '+(section.heading || section.id || record.reference || 'Diagram'),binding:binding || {section:section,page:source,stepper:null,el:null}});
    });});return out;
  }
  var directTrace=createTelemetryDirect(page,telemetryOptions && telemetryOptions.directTrace,{
    sections:directTraceSections,
    // #1145 (D5): Live / Over time is not part of it; a loaded trace sets the day (traceFollow, traceViewChanged).
    identity:function(){return [telemetry.environment()];},
    environment:function(){return telemetry.environment();},
    // #1142: Over time searches the selected day. A day without a date has no window, so Load stays off there.
    day:function(){var state=over && overTimeState();return state && state.window?{key:over.days[over.index].key,today:state.today,label:state.label,window:state.window}:null;},
    disabled:function(){return retired || telemetryOptions===false || !trackingTelemetry(page).enabled || telemetry.snapshot().historical && !overTimeWindow();},
    accountChanged:function(){telemetry.clear();telemetry.setAvailable(false);},
    changed:function(){if(!retired){paint();notify();}}
  });
  // #1099: find a trace from a Loki log line; the chosen line loads through directTrace.
  var logLookup=createTelemetryLogLookup(page,telemetryOptions && telemetryOptions.directTrace,{
    // #1141: a day change clears results. Key on the day and the today flag, never the window (today's end moves).
    identity:function(){var day=logSearchDay();return [telemetry.environment(),day?[day.key,day.today]:telemetry.snapshot().historical];},
    disabled:function(){return retired?'closed':telemetryOptions===false?'host':!trackingTelemetry(page).enabled?'board':telemetry.snapshot().historical && !logSearchDay()?'history':'';},
    day:function(){return logSearchDay();},
    wanted:function(){return statusMode==='trace';},
    config:function(){return telemetry.config();},
    lookback:function(){var form=directTrace.snapshot().form,p=FlowTraceConnections.resolve(page,TELEMETRY_COMPANY_TRACE_CONNECTIONS)[form.connection];return {start:form.start,end:form.end,lookback:p?p.time.defaultLookback:''};},
    accountChanged:function(){telemetry.clear();telemetry.setAvailable(false);},
    changed:function(){if(!retired){paint();notify();}}
  });
  // The selected Over time day for the log search, or null in Live or on a day without a date.
  function logSearchDay(){var state=over && overTimeState(),day=over && over.days[over.index];return state && state.window?{key:day.key,today:!!state.today,from:state.window.from,to:state.window.to,label:state.window.label,short:day.short || day.label || day.key}:null;}
  /* #1145 (D5): a loaded trace sets the view's day. Its day is the local date of its first span. Loading
     moves the view there (Live for today); a view change to another day clears the trace with one note. */
  var traceDayNote='',overTarget=null,overParked=null,traceLoads=0;
  // #1177: a picked example trace carried across an Edit-mode re-render, and the step chooser a span drop opened.
  var carriedExample=null,traceChooser=null,traceReturnSpan=null;
  function localDayKey(ms){var d=new Date(ms);return new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())).toISOString().slice(0,10);}
  function traceDayOf(e){
    var at=Math.min.apply(null,(e && e.spans || []).map(function(s){return Date.parse(s.time);}).filter(function(t){return isFinite(t);}));if(!isFinite(at))return null;
    var d=new Date(at),pad=function(n){return String(n).padStart(2,'0');};
    return {at:d.toISOString(),key:localDayKey(at),label:d.toLocaleDateString([],{month:'short',day:'numeric'}),time:pad(d.getHours())+':'+pad(d.getMinutes())};
  }
  function viewDay(){var day=over && over.days[over.index];return day?{key:day.key,label:day.short || day.label || day.key}:{key:localDayKey(Date.now()),label:'Live'};}
  function outsideNote(d){return 'This trace is from '+d.label+', which Over time does not list.';}
  // A move the trace itself causes keeps the log results it may have come from (Q2).
  function traceMoved(fn){logLookup.hold(true);try{fn();}finally{logLookup.hold(false);}}
  function traceFollow(e){
    var d=traceDayOf(e);if(!d)return;
    // A history that arrived while this Load ran waits for it (overLoad); use it now.
    if(overParked && overParked.request===overRequest){var parked=overParked;overParked=null;overTarget={request:parked.request,reader:parked.reader};overLoad(parked.request,parked.result,parked.source);return;}
    // A history load still running moves the view for whichever trace is loaded when it arrives (overLoad).
    // An unmarked load is the reader's own Over time click; the mark keeps that, so it can still open.
    if(overLoading){var own=overTarget && overTarget.request===overRequest;overTarget={request:overRequest,reader:own?!!overTarget.reader:true};return;}
    // D5: Live when the trace is from today, also from Over time on today.
    if(d.key===localDayKey(Date.now())){if(over)traceMoved(overClose);return;}
    if(d.key===viewDay().key)return;
    if(over){var index=over.days.findIndex(function(day){return day.key===d.key;});if(index>=0)traceMoved(function(){api.overTimeDay(index);});else traceDayNote=outsideNote(d);return;}
    // Without an Over time that can open here there is no day list to move to; the card still shows the date.
    openOver(true);
  }
  // Every view change ends the last note; one that leaves the trace's day clears the trace and says so.
  // Never "Trace selection expired" for a day change (round 3): example traces are Live-only (D7), so
  // Over time retires one the reader chose with the plain note, and one shown automatically quietly.
  // A parked history whose Load failed or was cleared: the reader's own Over time click still opens on the
  // default day; a park a trace started ends, so no later Load reuses an old history.
  function settleParked(){
    var parked=overParked;overParked=null;if(!parked || parked.request!==overRequest || !parked.reader)return;
    overTarget={request:parked.request,reader:true};overLoad(parked.request,parked.result,parked.source);
  }
  function traceViewChanged(){
    traceDayNote='';traceNotice='';var view=viewDay();
    // An example-trace choice still loading belongs to Live; it must not settle as "expired" (cycle 2).
    if(over && tracePending){tracePending=null;traceRequest++;}
    if(over && traceSelection && traceSelection.key.indexOf('direct/')!==0){
      var shown=traceSources().entries.find(function(entry){return entry.key===traceSelection.key;}),day=shown && traceDayOf(shown.exemplar);
      if(traceSelection.chosen && day)traceNotice='Cleared trace '+traceSelection.traceId.slice(0,12)+' ('+day.label+'): the view moved to '+view.label+'.';
      clearTraceFocus();traceSelection=null;tracePending=null;traceInitial=true;
    }
    var e=directTrace.snapshot().exemplar,d=traceDayOf(e);if(!d || d.key===view.key)return;
    traceDayNote='Cleared trace '+e.traceId.slice(0,12)+' ('+d.label+'): the view moved to '+view.label+'.';
    clearTraceFocus();traceSelection=null;traceInitial=true;directTrace.clear();
  }
  function traceSources(){
    var evidence=telemetry.snapshot(),entries=[],owners=Object.create(null),mounted=sourceBindings(),ambiguous=new Set();
    eachDiagram(function(d,source){Object.keys(d.nodes || {}).concat((d.edges || []).map(function(e){return e.from+'->'+e.to;})).forEach(function(id){if(!owners[id])owners[id]=[];if(owners[id].indexOf(d)<0)owners[id].push(d);});});
    // #1142: example traces stay Live-only; a trace the reader loaded in Over time is still listed.
    if(!evidence.historical)mounted.forEach(function(binding){
      var d=binding.section.diagram;if(!d || !trackingTelemetry(binding.page).enabled)return;
      if(!traceSections.has(binding.section))traceSections.set(binding.section,++traceSectionSerial);
      if(!traceSections.has(d))traceSections.set(d,++traceSectionSerial);
      var sectionId=[traceObjectId(binding.page),traceObjectId(binding.section),traceObjectId(d),traceObjectId(binding.el),traceObjectId(binding.stepper || binding.el)].join('/'),seen=new Set();
      Object.keys(d.nodes || {}).concat((d.edges || []).map(function(e){return e.from+'->'+e.to;})).forEach(function(id){
        if(seen.has(id) || !owners[id])return;seen.add(id);if(owners[id].length!==1){if(evidence.map[id] && (evidence.map[id].exemplars || []).length)ambiguous.add(id);return;}
        var sample=evidence.map[id];(sample && sample.exemplars || []).forEach(function(exemplar){
          var key=JSON.stringify([sectionId,id,exemplar.selectionToken]);
          entries.push({key:key,carrier:id,binding:binding,exemplar:exemplar,label:(binding.section.heading || binding.section.id || 'Diagram')+' · '+id});
        });
      });
    });
    /* #1177: the example trace the reader had picked before an Edit-mode re-render. The next render has no
       Metrics data yet, so it stays listed and selected until live evidence for the same carrier and
       token arrives, or the reader selects something else. */
    var carried=carriedExample;
    // It ends as a live pick does: when the reader selects something else, the Metrics environment changes,
    // or the account changes (telemetry clear, the reset hook above) (#1180 c3).
    if(carried && (!traceSelection || traceSelection.key!==carried.key || carried.environment!==telemetry.environment())){carriedExample=carried=null;}
    if(carried && !evidence.historical){
      /* Live evidence for the same carrier that shows the same trace takes over the pick, its focus and an
         open chooser (tokens differ per session). Live evidence showing another trace (a re-attached
         adapter picks its default again) is listed beside the carried pick, which stays (#1180 c2). */
      var live=entries.find(function(e){return e.carrier===carried.carrier && e.binding.ordinal===carried.ordinal && e.exemplar.traceId===traceSelection.traceId;});
      var home=mounted.find(function(b){return b.ordinal===carried.ordinal;});
      if(live){
        carriedExample=null;var was=home && traceContext({key:carried.key,exemplar:carried.exemplar,binding:home});
        traceSelection={key:live.key,traceId:traceSelection.traceId,chosen:traceSelection.chosen};
        if(was && traceFocus && traceFocus.context===was)traceFocus.context=traceContext(live);
        if(was && traceChooser && traceChooser.context===was)traceChooser.context=traceContext(live);
      }
      else if(home)entries.push({key:carried.key,carrier:carried.carrier,binding:home,exemplar:carried.exemplar,carried:true,label:(home.section.heading || home.section.id || 'Diagram')+' · '+carried.carrier+' (your pick)'});
    }
    var manual=directTrace.snapshot();
    if(manual.exemplar){var context=directTraceSections().find(function(s){return s.id===manual.section;}),binding=context?context.binding:{section:{diagram:{steps:[]}},page:page,stepper:null,el:null};
      entries.unshift({key:'direct/'+manual.section+'/'+manual.exemplar.selectionToken,carrier:null,binding:binding,exemplar:manual.exemplar,manual:true,label:'Loaded trace'+(context?' · '+context.label:'')});
    }
    return {entries:entries,evidence:evidence,ambiguous:ambiguous.size};
  }
  function traceContext(entry){
    var b=entry.binding;
    return JSON.stringify([traceRequest,traceFocusEpoch,entry.key,entry.exemplar.traceId,entry.exemplar.selectionToken,telemetry.environment(),
      traceObjectId(b.page),traceObjectId(b.section),traceObjectId(b.section.diagram),b.el?traceObjectId(b.el):0,b.stepper?traceObjectId(b.stepper):0]);
  }
  function clearTraceFocus(){traceFocus=null;traceFocusEpoch++;traceChooser=null;}
  // #1252: the loaded trace's span focus, kept across a Load that does not replace it.
  // Only a focus on the loaded trace itself (its context), not on an example that shares a span id.
  function shownDirectFocus(){
    var e=traceFocus && directTrace.snapshot().exemplar,entry=e && traceSources().entries.find(function(x){return x.manual && x.exemplar.traceId===e.traceId;});
    return entry && traceFocus.context===traceContext(entry) && e.spans.some(function(s){return s.id===traceFocus.spanId;})?{traceId:e.traceId,spanId:traceFocus.spanId,choiceKey:traceFocus.choiceKey}:null;
  }
  // A focus the reader set meanwhile (e.g. after Cancel request, before B's late answer) wins.
  function restoreDirectFocus(saved){
    var e=saved && !traceFocus && directTrace.snapshot().exemplar;if(!e || e.traceId!==saved.traceId)return;
    var entry=traceSources().entries.find(function(x){return x.manual && x.exemplar.traceId===saved.traceId;});
    if(entry)traceFocus={context:traceContext(entry),spanId:saved.spanId,choiceKey:saved.choiceKey};
  }
  /* #1078: in board Edit mode, the steps of the trace's own diagram a span can be
     mapped to; null outside Edit mode. A step that has a traceMatch is marked
     `mapped` (#1177): the dropdown leaves it out, a drop or the chooser replaces it. */
  function traceMapSteps(binding){
    var state=editor && editor.state();if(!state || !state.active || state.saving || binding.ordinal==null)return null;
    // Numbered as the trace status line numbers a choice: position on the shown path, else on the first path holding the step.
    var d=binding.section.diagram,paths=diagramPathList(d),shown=binding.stepper && binding.stepper.path();
    return (d.steps || []).map(function(step,i){
      if(!step || typeof step.id!=='string')return null;
      var caption=String(step.text || step.id).replace(/\s+/g,' ').trim();if(caption.length>96)caption=caption.slice(0,95)+'…';
      var holds=function(p){return p.indices.indexOf(i)>=0;},path=paths.find(function(p){return p.id===shown && holds(p);}) || paths.find(holds);
      // An alternatives array (#1100) is edited in Inspect; a mapping never replaces it (#1180).
      var m=step.traceMatch && typeof step.traceMatch==='object'?step.traceMatch:null,alternatives=Array.isArray(m);
      return {id:step.id,index:i,caption:caption,label:path?'Step '+(path.indices.indexOf(i)+1)+': '+caption+' · '+path.label:caption,mapped:!!m,alternatives:alternatives,traceMatch:m && !alternatives?{serviceName:m.serviceName,operation:m.operation}:null};
    }).filter(Boolean);
  }
  /* An edit re-renders the page (#828): the next controller reopens this Trace view with the loaded trace
     or the picked example trace (#1177), and the focused span. */
  function traceCarry(){
    if(statusMode!=='trace')return null;
    var selected=traceSelection && traceSources().entries.find(function(e){return e.key===traceSelection.key;}),example=null;
    if(selected && !selected.manual && selected.binding.ordinal!=null)example={key:'carried/'+selected.binding.ordinal+'/'+selected.carrier+'/'+selected.exemplar.selectionToken,environment:telemetry.environment(),ordinal:selected.binding.ordinal,carrier:selected.carrier,exemplar:selected.exemplar,traceId:traceSelection.traceId,chosen:!!traceSelection.chosen};
    return {direct:directTrace.carry(),example:example,spanId:selected && traceFocus?traceFocus.spanId:null,show:traceShow,returnSpan:traceReturnSpan,autoFocused:traceAutoFocused};
  }
  function traceRestore(carried){
    statusMode='trace';statusAuto=false;traceShow=carried.show!==false;traceAutoFocused=carried.autoFocused || '';
    var direct=!!(carried.direct && directTrace.restore(carried.direct));
    // The reader's pick wins: a picked example stays selected beside a loaded trace (#1180).
    if(carried.example){carriedExample=carried.example;traceSelection={key:carried.example.key,traceId:carried.example.traceId,chosen:carried.example.chosen};traceInitial=false;}
    if(!(direct || carried.example) || !carried.spanId && !carried.returnSpan)return;
    // After the render settles its opening step, so the mapped step it jumps to stays shown.
    requestAnimationFrame(function(){
      if(retired || statusMode!=='trace')return;
      var selected=traceSnapshot().selected;
      if(carried.spanId && selected && selected.exemplar.spans.some(function(s){return s.id===carried.spanId;}))api.selectTraceSpan({context:selected.context,spanId:carried.spanId});
      // A drop or chooser pick re-rendered the board: focus goes back to the dragged span row (#1180).
      var row=carried.returnSpan && view.querySelector('.dv-trace-span[data-span-id="'+carried.returnSpan+'"]');if(row && row.focus)row.focus({preventScroll:true});
    });
  }
  /* #1177: drag a span onto a step (its chip or coin) or onto a node or edge. A carrier named by one step
     without a traceMatch maps it; otherwise the reader chooses among the carrier's steps. */
  var EDIT_SPAN_TYPE='application/x-flowview-span',titled=[];
  // The alternatives title is for the drag only; each button gets its own back after it (#1180 c3).
  function restoreTitles(){titled.splice(0).forEach(function(el){if(el._mapTitle==null)el.removeAttribute('title');else el.setAttribute('title',el._mapTitle);el._mapTitle=undefined;});}
  function stepDropRef(target){
    if(!editing() || !target || !target.closest)return null;
    var hit=target.closest('[data-step-source]') || target.closest('g.coin[data-dv-step]');if(!hit)return null;
    var inside=bindings.filter(function(binding){return binding.ordinal!=null && binding.el.contains(hit);});
    var binding=inside.filter(function(candidate){return !inside.some(function(other){return other!==candidate && candidate.el.contains(other.el);});})[0];
    var index=Number(hit.getAttribute('data-step-source')!=null?hit.getAttribute('data-step-source'):hit.getAttribute('data-dv-step')),step=binding && (binding.section.diagram.steps || [])[index];
    if(!step || typeof step.id!=='string')return null;
    // An alternatives traceMatch (#1100) is edited in Inspect: no highlight and no drop, and the button says why (#1180).
    if(Array.isArray(step.traceMatch)){if(titled.indexOf(hit)<0){titled.push(hit);hit._mapTitle=hit.getAttribute('title');}hit.setAttribute('title','Has alternatives; edit in Inspect');return {blocked:true};}
    return {el:hit,ordinal:binding.ordinal,step:step.id};
  }
  function carrierSteps(binding,ref,steps){
    var d=binding.section.diagram,edge=ref.kind==='edge' && (d.edges || [])[ref.index],key=edge && edge.from+'->'+edge.to;
    return steps.filter(function(step){var s=d.steps[step.index];if(!s)return false;
      if(ref.kind==='node')return Array.isArray(s.nodes) && s.nodes.indexOf(ref.id)>=0;
      return !!key && (s.edge===key || Array.isArray(s.edges) && s.edges.indexOf(key)>=0);});
  }
  function carrierLabel(binding,ref){var d=binding.section.diagram,title=function(id){var n=(d.nodes || {})[id];return n && n.title || id;};if(ref.kind==='node')return title(ref.id);var e=(d.edges || [])[ref.index];return e?title(e.from)+' → '+title(e.to):'this edge';}
  function spanDropped(payload,hit){
    var selected=traceSnapshot().selected;if(!payload || !selected || payload.context!==selected.context)return;
    var entry=traceSources().entries.find(function(e){return e.key===selected.key;}),steps=entry && traceMapSteps(entry.binding);if(!steps)return;
    if(hit.step){if(hit.ordinal!==entry.binding.ordinal)return;var target=steps.find(function(step){return step.id===hit.step;});if(target)api.mapTraceSpan({context:payload.context,spanId:payload.spanId,stepId:target.id,replace:target.mapped});return;}
    if(hit.ref.section!==entry.binding.ordinal)return;
    var named=carrierSteps(entry.binding,hit.ref,steps);
    // Chuck 2026-11-09: a drop on a node also writes its id as traceMatch.nodeId when the step names exactly
    // that node, so the node lights up at once (a node lights only through nodeId, #1078).
    var nodeId=hit.ref.kind==='node'?hit.ref.id:null;
    if(named.length===1 && !named[0].mapped){api.mapTraceSpan({context:payload.context,spanId:payload.spanId,stepId:named[0].id,nodeId:nodeId});return;}
    var dragged=entry.exemplar.spans.find(function(item){return item.id===payload.spanId;});
    traceChooser={context:payload.context,spanId:payload.spanId,nodeId:nodeId,span:dragged?dragged.service+' · '+dragged.name:'this span',label:carrierLabel(entry.binding,hit.ref),steps:named,drop:(traceChooser && traceChooser.drop || 0)+1};paint();notify();
  }
  function traceFocusSnapshot(entry,context){
    if(!traceFocus)return null;
    if(!entry || traceFocus.context!==context || !entry.exemplar.spans.some(function(s){return s.id===traceFocus.spanId;})){traceFocus=null;return null;}
    var choices=telemetryTraceChoices(entry.binding.section.diagram,entry.binding.stepper && entry.binding.stepper.path(),entry.exemplar,traceFocus.spanId);
    var choice=traceFocus.choiceKey && choices.find(function(c){return c.key===traceFocus.choiceKey;});
    return {spanId:traceFocus.spanId,choices:choices,choice:choice || null,navigable:!!entry.binding.stepper};
  }
  /* #1185: the trace's error span to focus or name. "mapped": the earliest error span whose step
     mapping is unique (focused when the trace is first shown, as if the reader clicked it);
     "pick": the earliest error span with several possible steps; "unmapped": no step maps any
     error span. Cached per trace, selection and path. The trace ID focused automatically is
     carried across an edit re-render, so a focus the reader cleared does not come back. */
  var traceAutoFocused='',traceErrorCache={key:null,value:null};
  function traceErrorTarget(entry){
    var d=entry.binding.section.diagram,path=entry.binding.stepper && entry.binding.stepper.path(),key=[entry.key,entry.exemplar.traceId,path].join('|');
    if(traceErrorCache.key===key && traceErrorCache.diagram===d)return traceErrorCache.value;
    var errors=entry.exemplar.spans.filter(function(s){return s.error;}).sort(function(a,b){return a.startMs-b.startMs;}),pick=null,value=null;
    for(var i=0;i<errors.length && !value;i++){
      var choices=telemetryTraceChoices(d,path,entry.exemplar,errors[i].id);
      if(choices.length===1 && choices[0].row.status==='matched')value={span:errors[i],kind:'mapped'};
      else if(choices.length && !pick)pick={span:errors[i],kind:'pick'};
    }
    value=value || pick || (errors.length?{span:errors[0],kind:'unmapped'}:null);
    traceErrorCache={key:key,diagram:d,value:value};return value;
  }
  function traceErrorNote(target){
    if(!target || target.kind==='mapped')return '';
    var name='error in '+target.span.service+' '+target.span.name;
    return target.kind==='pick'?name+': pick a step to focus it':name+' (not on this diagram)';
  }
  /* #1180: the latest pending mapping for its note. When the step keeps a parentStepId, attributes, namespace
     or occurrence that exclude the mapped span, the selected trace shows nothing for it; the note says so. */
  function mappedNote(selected,model){
    var m=editing() && editor.state().mapped;if(!m)return null;var out={step:m.step,label:m.label,traceMatch:m.traceMatch,unmatched:false};
    var row=selected && model && model.mapping && model.mapping.steps.find(function(r){return r.stepId===m.step;}),step=selected && (selected.binding.section.diagram.steps || []).find(function(x){return x.id===m.step;}),kept=step && step.traceMatch;
    // Only fields that filter spans can exclude one; nodeId only picks the node to annotate (#1180 c3).
    if(row && row.status==='missing' && kept && !Array.isArray(kept) && (kept.parentStepId || kept.attributes || kept.namespace || kept.occurrence!=null))out.unmatched=true;
    return out;
  }
  function traceSnapshot(){
    var source=traceSources(),entries=source.entries,evidence=source.evidence,hasMappings=false;
    eachDiagram(function(d){if((d.steps || []).some(function(step){return !!step.traceMatch;}))hasMappings=true;});
    var hasBindings=evidence.carriers.some(function(binding){return Object.keys(binding.signals).some(function(name){return proofVerdicts.isTraceSignal(binding.signals[name]);});});
    var traceStatus=telemetryOptions && typeof telemetryOptions.traceStatus==='function'?telemetryOptions.traceStatus():{available:evidence.available,note:''};
    var selected=traceSelection && entries.find(function(e){return e.key===traceSelection.key && e.exemplar.traceId===traceSelection.traceId;});
    if(!selected && traceSelection && tracePending && tracePending.request===traceRequest && tracePending.key===traceSelection.key){selected=entries.find(function(e){return e.key===tracePending.key && e.exemplar.traceId===tracePending.traceId;});if(selected)traceSelection.traceId=selected.exemplar.traceId;}
    if(traceSelection && !selected){traceSelection=null;tracePending=null;traceInitial=false;traceRequest++;traceNotice='Trace selection expired. Select current evidence.';}
    // #1164: only a trace the reader loaded selects itself; an example trace waits for the reader's pick.
    if(!selected && traceInitial && statusMode==='trace' && entries.length && entries[0].manual){selected=entries[0];traceSelection={key:selected.key,traceId:selected.exemplar.traceId};traceInitial=false;}
    var context=selected?traceContext(selected):null,focus=traceFocusSnapshot(selected,context);
    var errorTarget=selected?traceErrorTarget(selected):null,autoKey=selected?selected.exemplar.traceId:'';
    if(selected && statusMode==='trace' && traceShow && traceAutoFocused!==autoKey){
      traceAutoFocused=autoKey;
      if(!traceFocus && errorTarget && errorTarget.kind==='mapped'){var autoSpan=errorTarget.span.id;requestAnimationFrame(function(){if(!retired && !traceFocus)api.selectTraceSpan({context:context,spanId:autoSpan});});}
    }
    var model=selected?telemetryTraceModel(selected.binding.section.diagram,selected.binding.stepper && selected.binding.stepper.path(),selected.exemplar):null;
    if(selected)model.mapSteps=traceMapSteps(selected.binding);
    return {entries:entries.map(function(e){return {key:e.key,carrier:e.carrier,label:e.label,exemplar:e.exemplar,candidates:e.exemplar.candidates.map(function(c){return Object.assign({},c,{available:c.traceId===e.exemplar.traceId || telemetry.canChooseExemplar(e.carrier,e.exemplar.selectionToken,c.traceId)});})};}),selected:selected?{errorNote:traceErrorNote(errorTarget),key:selected.key,day:traceDayOf(selected.exemplar),context:context,focus:focus,carrier:selected.carrier,manual:!!selected.manual,hasMappings:(selected.binding.section.diagram.steps || []).some(function(step){return !!step.traceMatch;}),exemplar:selected.exemplar,model:model}:null,direct:Object.assign(directTrace.snapshot(),{logs:logLookup.snapshot(),dayNote:traceDayNote,movesDay:canOpenOver()}),
      hasMappings:hasMappings,hasBindings:hasBindings,historical:evidence.historical,
      // #1177: the step chooser of a span drop, and the latest pending mapping with its Undo.
      mapChooser:traceChooser && selected && traceChooser.context===context?{label:traceChooser.label,span:traceChooser.span,spanId:traceChooser.spanId,drop:traceChooser.drop,steps:traceChooser.steps.map(function(step){return {id:step.id,mapped:step.mapped,disabled:step.alternatives,label:step.caption+(step.alternatives?' · has alternatives; edit in Inspect':step.mapped?' · mapped, replaces':'')};})}:null,
      mapped:mappedNote(selected,model),enabled:evidence.enabled,available:traceStatus.available,status:{busy:hasBindings && evidence.status.busy,note:traceStatus.note},notice:[traceNotice,source.ambiguous?'Trace evidence with duplicate carrier IDs across source diagrams is excluded; use unique stable IDs.':''].filter(Boolean).join(' '),show:traceShow};
  }
  /* #1163: metric cards are placed against the trace labels' boxes at paint time. Text is laid
     out again at each board scale, so a label's box can change without a paint: the Auto view
     rescales the board after the cards grow its frame (in CI a label widened by about 3%).
     On a scale change, if a label's box changed and now meets a card or a drawn leader, paint
     again at once, in the same frame. A scale change during a paint is checked after it. */
  var traceRecheck=false;
  function traceLabelSize(text){var box=text.getBBox();return Math.round(box.width*10)+'x'+Math.round(box.height*10);}
  function recordTraceLabels(){view.querySelectorAll('.dv-trace-overlay text').forEach(function(text){text._dvTraceLabelSize=traceLabelSize(text);});}
  function traceLabelsResized(){
    // Cards (Metrics on) and connection labels (#1195, any time trace labels show) are rechecked.
    if(retired || !view.querySelector('.dv-trace-overlay'))return;
    if(painting){traceRecheck=true;return;}
    var changed=Array.prototype.filter.call(view.querySelectorAll('.dv-trace-overlay text'),function(text){var size=traceLabelSize(text),moved=text._dvTraceLabelSize!==size;text._dvTraceLabelSize=size;return moved;});
    if(changed.length && telemetryTraceLabelsBlocked(changed)){paint();notify();}
  }
  view.addEventListener('board-scale-change',traceLabelsResized,true);
  destroyListeners.push(function(){view.removeEventListener('board-scale-change',traceLabelsResized,true);});
  function paintTrace(){
    var trace=traceSnapshot(),selected=trace.selected,sources=traceSources().entries;
    bindings.forEach(function(binding){telemetryPaintTrace(binding,statusMode==='trace' && traceShow && selected && traceSelection && sources.some(function(e){return e.key===selected.key && e.binding.section===binding.section && e.binding.el===binding.el;})?selected.model:null,selected && selected.focus);});
  }
  function metricsSnapshot(){
    var evidence=telemetry.snapshot(),status=evidence.status;
    return {environment:evidence.environment,environments:evidence.environments,proof:liveStatusProofPresentation(evidence,telemetryWindow),logDetails:liveStatusLogDetails(evidence,telemetryWindow),available:status.state!=='absent',enabled:telemetry.enabled(),demo:telemetryDemo,state:status.state,busy:status.busy,
      refreshedAt:status.refreshedAt,note:status.note,checkedText:status.refreshedAt?'refreshed '+clockTime(status.refreshedAt):'',
      source:telemetrySource(),window:telemetryWindow,style:metricsStyleShown(),styleChoice:!authoring && !metricsPreview,snapshot:telemetryOptions && typeof telemetryOptions.snapshot==='string'?telemetryOptions.snapshot:''};
  }
  function snapshot(){
    refreshDependencies();
    var coverage=liveStatusCoverage(page,map,refs(),sources()),storyKeys=coverage.onDiagram.concat(coverage.notOnDiagram,dependencyKeys);
    coverage.dependencies=dependencyKeys.slice();
    var counts={todo:0,active:0,testing:0,done:0,blocked:0,missing:0},latest=null,stamp=-Infinity;
    storyKeys.forEach(function(key){var entry=map[key];if(!entry)return;counts[entry.state]++;
      var at=Date.parse(entry.updatedAt);if(isFinite(at) && at>stamp){stamp=at;latest=entry.updatedAt;}
    });
    var pages=laneRecords(),readiness=liveStatusReadiness(page,map,ticketWaiting);
    var initiatives=coverage.initiatives || [],scopeKeys=initiatives.concat(refs().epics.filter(function(key){return initiatives.indexOf(key)<0;}));
    var blocked=storyKeys.filter(function(key){return liveStatusBlocks(map[key]);}).length;
    // Board waiting describes visible story dependents. Keep direct upstream
    // container evidence, but never present a hidden container as a waiting row.
    var boardWaiting=Object.create(null);storyKeys.forEach(function(key){if(ticketWaiting[key])boardWaiting[key]=ticketWaiting[key];});
    var waiting=Object.keys(boardWaiting).length;
    var verdict=(readiness.ready?'Ready to demo · ':'')+blocked+' blockers · '+waiting+' waiting';
    if(storyKeys.length)verdict+=' · '+coverage.onDiagram.length+' of '+storyKeys.length+' stories on diagram';
    var tickets=ticketRows(pages,coverage),outside=coverage.notInEpic.length+dependencyKeys.filter(function(key){return refs().epics.length && coverage.epics.indexOf(map[key] && map[key].epic)<0;}).length;
    var excluded=coverage.excluded.map(function(key){
      var entry=map[key] || {},source=sources().filter(function(source){return trackingExclusions(source).indexOf(key)>=0;})[0] || page;
      return {key:key,url:liveStatusTicketURL(source.tracking,key,entry),title:entry.title || '—',state:entry.state || 'No status',
        included:storyKeys.indexOf(key)>=0,reason:coverage.onDiagram.indexOf(key)>=0?'Included by manual attachment':dependencyKeys.indexOf(key)>=0?'Included as dependency':storyKeys.indexOf(key)>=0?'Included by another source':'Excluded from story totals'};
    });
    // Authored pairs the Jira links do not know yet: a hint for the author, never a write.
    var suggestions=[];sources().forEach(function(source){trackingDependencies(source).forEach(function(pair){
      var linked=(dependencies[pair.ticket] || []).some(function(dep){return dep.key===pair.on && dep.sources.indexOf('jira')>=0;});
      if(storyKeys.indexOf(pair.ticket)>=0 && !linked && !suggestions.some(function(item){return item.ticket===pair.ticket && item.on===pair.on;}))suggestions.push({ticket:pair.ticket,on:pair.on});
    });});
    var epicState=null;if(scopeKeys.length){var entry=map[scopeKeys[0]];epicState=entry && LIVE_STATUS_STATES.indexOf(entry.state)>=0?entry.state:
      !storyKeys.length?null:storyKeys.some(function(key){return map[key] && map[key].state==='blocked';})?'blocked':storyKeys.every(function(key){return map[key] && map[key].state==='done';})?'done':storyKeys.some(function(key){return map[key] && map[key].state==='testing';})?liveStatusPresentationRollup(storyKeys.map(function(key){return map[key] && map[key].state || 'unknown';})):storyKeys.some(function(key){return !map[key] || map[key].state!=='todo';})?'active':'todo';}
    var epic={keys:scopeKeys,url:scopeKeys.length?liveStatusTicketURL(page.tracking,scopeKeys[0],map[scopeKeys[0]]):null,
      title:scopeKeys.length && map[scopeKeys[0]] && map[scopeKeys[0]].title || '',state:epicState,
      initiatives:initiatives.slice(),epics:coverage.epics.slice(),
      stories:storyKeys.length,done:storyKeys.filter(function(key){return map[key] && map[key].state==='done';}).length,onDiagram:storyKeys.filter(function(key){return coverage.onDiagram.indexOf(key)>=0;}).length,
      blocked:blocked,waiting:waiting,outside:outside,ready:readiness.ready};
    var missingWork=missingWorkCount();
    return {states:copy(map),counts:counts,missingWork:{count:missingWork,painted:on && availabilityOn},updatedAt:cacheUpdatedAt || latest,enabled:on,
      available:referencesAvailable(coverage),hasData:!!(provider || applied || missingWork),
      note:{text:noteText,kind:noteKind},actionLabel:actionFn?actionLabel:'',firstBlocker:!!firstBlocker(),
      lanes:panelLanes(pages),blockers:panelBlockers(pages),tickets:tickets,excluded:excluded,
      dependencies:copy(dependencies),waiting:copy(boardWaiting),chains:liveStatusDependencyChains(boardWaiting),suggestions:suggestions,epic:epic,
      coverage:coverage,readiness:readiness,activity:copy(liveStatusActivity(activity.filter(function(item){return storyKeys.indexOf(item.key)>=0;}),telemetryActivity.snapshot())).map(function(item){item.relative=telemetryTime(item.at)?relative(item.at):'time unavailable';return item;}),
      demo:demoControls?{ended:!!demoControls.ended,first:!demoControls.prev || !!demoControls.first}:null,verdict:verdict,
      overTime:overTimeState(),
      // #1253: no provider, no host-applied map and no connector adapter: the page cannot show live status here.
      noProvider:!provider && !applied && !demoMode && connection.state==='none' && (refs().tickets.length || refs().epics.length)?{prs:refs().prs.slice()}:null,
      editHistory:copy(editHistory),edit:editState(),
      updatedText:cacheUpdatedAt || latest?'updated '+relative(cacheUpdatedAt || latest):'',
      connection:{state:connection.state,busy:connection.busy,checkedAt:connection.checkedAt,source:connection.source,checkedText:connection.checkedAt?'refreshed '+clockTime(connection.checkedAt):'',github:{state:connection.github.state,busy:connection.github.busy}},
      metrics:metricsSnapshot(),mode:statusMode,trace:traceSnapshot()};
  }
  // #1253: Edit waits while history loads too, since the load would end on a past day.
  function editState(){var state=editor?editor.state():null;return state && (over || overLoading) && !state.blocked?Object.assign({},state,{blocked:over?'Editing is off while a past day is shown.':'Editing is off while history loads.'}):state;}
  // #1138 (D2, V2): a board with no ticket, epic, exclusion or missing-work reference after imports has no Jira
  // history, so when it has Metrics, Over time uses the local day list. The reader's click still opens it.
  var localHistory={load:function(){return liveStatusLocalDays(Date.now());}};
  function historySource(){return overSource || (!authoring && telemetry.status().state!=='absent' && !referencesAvailable()?localHistory:null);}
  function overTimeState(){
    var source=over?over.source:historySource();if(!source)return null;
    var base={active:!!over,loading:overLoading,progress:overProgress,error:overError,available:source===localHistory || !!(applied && Object.keys(map).length),disabled:editing()};
    base.window=overTimeWindow();
    if(!over)return base;
    var days=over.days;base.index=over.index;base.count=days.length;base.first=days[0].short;base.last=days[days.length-1].short;base.label=days[over.index].label;
    // #1082: a day is today only when its key is today's date in the viewer's time zone, whatever the source. An undated day never is.
    var now=new Date();base.today=days[over.index].key===new Date(Date.UTC(now.getFullYear(),now.getMonth(),now.getDate())).toISOString().slice(0,10);return base;
  }
  /* #1132: the selected day as a UTC search window for trace and log searches, or null in Live. It
     runs from the local midnight that opens `day.key` to the next one, so a DST day runs 23 h or 25 h,
     and today ends now. `day.at` is not read: a demo day's is a UTC midnight. Metrics plays no part.
     A day without a YYYY-MM-DD key has no window. On today `to` changes with every snapshot, so key a
     request on `day.key` and the today flag, never on the window. */
  function overTimeWindow(){
    var day=over && over.days[over.index],date=day && typeof day.key==='string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(day.key);
    if(!date)return null;
    var from=new Date(+date[1],date[2]-1,+date[3]).getTime(),midnight=new Date(+date[1],date[2]-1,+date[3]+1).getTime();
    var to=Math.min(midnight,Date.now());if(!(to>from))return null;
    var end=new Date(to),pad=function(n){return String(n).padStart(2,'0');};
    return {from:new Date(from).toISOString(),to:end.toISOString(),label:(day.label || day.key)+' 00:00–'+(to===midnight?'24:00':pad(end.getHours())+':'+pad(end.getMinutes()))+' local'};
  }
  // The reader's click (Over time, or a Load that moves the view to a trace's day) is the only thing that loads history.
  // Whether Over time can open now; the log list promises a move only then.
  // The local 7-day list (#1138) needs no ticket status; a Jira history source needs the applied map.
  function canOpenOver(){var source=historySource();return !retired && !!source && (source===localHistory || applied && Object.keys(map).length>0) && !editing();}
  function openOver(trace){
    if(retired || overLoading || over || !canOpenOver())return false;
    var source=historySource(),request=++overRequest;overLoading=true;overError='';overProgress='';overTarget=trace?{request:request}:null;overParked=null;notify();
    Promise.resolve().then(function(){return source.load(function(done,total){if(!retired && request===overRequest){overProgress=done+' of '+total;notify();}});}).then(function(result){overLoad(request,result,source);},function(){overLoad(request,null,source);});
    return true;
  }
  function overShow(){map=liveStatusDayMap(over.today,over.days[over.index].states);changedKeys=[];telemetry.historyDay(over.index);paint();notify();telemetryHooks.jiraChanged();}
  // Returning to Live restores the live map, then applies any evidence that arrived meanwhile as a normal refresh.
  function overClose(){
    var left=over;over=null;traceViewChanged();map=left.live;changedKeys=[];telemetry.closeHistory();
    if(left.source.close)left.source.close();
    if(left.held)api.apply(left.value);else{paint();notify();telemetryHooks.jiraChanged();}
  }
  /* Every provider map, and a history source's today map, passes this one check. */
  function cleanMap(value){
    var next=Object.create(null);
    Object.keys(value || {}).forEach(function(key){
        var entry=value[key];if(!trackingKeyPattern.test(key) || !entry || LIVE_STATUS_STATES.indexOf(entry.state)<0)return;
        var item={state:entry.state};if(['initiative','epic','story'].indexOf(entry.kind)>=0)item.kind=entry.kind;
        if(Array.isArray(entry.initiatives))item.initiatives=entry.initiatives.filter(function(key,index,all){return typeof key==='string' && trackingKeyPattern.test(key) && all.indexOf(key)===index;});
        ['title','assignee','assigneeId','detail','updatedAt','epic','parent','lane'].forEach(function(field){if(typeof entry[field]==='string')item[field]=entry[field];});
        var url=deltaLinkUrl(entry.url);if(url)item.url=url;
        var links=liveStatusPRLinks(entry.prs && entry.prs.links);
        if(Array.isArray(entry.dependsOn)){var deps=[];entry.dependsOn.forEach(function(dep){
          if(!dep || typeof dep!=='object' || typeof dep.key!=='string' || !trackingKeyPattern.test(dep.key) || ['jira','authored'].indexOf(dep.source)<0)return;
          var link={key:dep.key,source:dep.source};if(typeof dep.linkType==='string' && dep.linkType)link.linkType=dep.linkType;if(typeof dep.reason==='string' && dep.reason)link.reason=dep.reason;deps.push(link);
        });if(deps.length)item.dependsOn=deps;}
        if(entry.prs && typeof entry.prs.count==='number' && isFinite(entry.prs.count) && entry.prs.count>=0 && ['open','merged','declined'].indexOf(entry.prs.state)>=0)item.prs={count:entry.prs.count,state:entry.prs.state};
        else if(links.length)item.prs=liveStatusPRSummary(links);
        if(links.length)item.prs.links=links;
        next[key]=item;
    });
    return next;
  }
  function overLoad(request,result,source){
    if(retired || request!==overRequest)return;overLoading=false;
    var days=result && Array.isArray(result.days)?result.days:[];
    if(!days.length){overError='History could not load. Try Over time again.';notify();return;}
    var index=result.index;if(typeof index!=='number' || index<0 || index>=days.length)index=days.length-1;
    // #1145: a load a trace started or joined opens on the day of the trace loaded now. A replacement Load
    // still running gets the history when it ends (traceFollow). With no trace the view stays in Live,
    // unless the reader clicked Over time; a trace from today stays in Live; a day the list does not have
    // keeps the view with a note.
    var mark=overTarget && overTarget.request===request?overTarget:null,target=mark?traceDayOf(directTrace.snapshot().exemplar):null;overTarget=null;
    if(mark && !target && directTrace.snapshot().busy){overParked={request:request,result:result,source:source,reader:!!mark.reader};notify();return;}
    if(mark && (target?target.key===localDayKey(Date.now()):!mark.reader)){notify();return;}
    if(target){index=days.findIndex(function(day){return day.key===target.key;});if(index<0){traceDayNote=outsideNote(target);notify();return;}}
    // #1253: Edit mode can start without the Edit button (a conflict replay); a past day is never shown while editing.
    if(editing()){overError='Over time did not open because Edit mode is on. Finish editing, then try again.';notify();return;}
    var show=function(){over={live:map,today:result.today?cleanMap(result.today):map,days:days,index:index,held:false,value:null,source:source};on=true;availabilityOn=true;traceViewChanged();telemetry.openHistory(days,index);overShow();};
    if(target)traceMoved(show);else show();
  }
  // Authored carrier occurrences, independent of distinct Jira ticket totals.
  // The shared walk includes resolved imports, nested sections and loaded details.
  function missingWorkCount(){var count=0;eachDiagram(function(d){
    Object.values(d.nodes || {}).forEach(function(node){if(!isTextBoxNode(node) && node.missingWork===true)count++;});
    (d.edges || []).forEach(function(edge){if(edge.missingWork===true)count++;});
  });return count;}
  function presentationActive(){return missingWorkCount()>0 || applied && referencesAvailable();}
  // snapshot().available: ticket, epic or exclusion references, or a missing-work marker.
  function referencesAvailable(coverage){var found=refs();return !!(found.tickets.length || found.epics.length || (coverage || liveStatusCoverage(page,map,found,sources())).excluded.length || missingWorkCount());}
  function connectPanels(){liveStatusPending.slice().forEach(function(pending){if(liveStatusControllerFor(pending.host)===api)pending.connect(api);});}
  function notify(){connectPanels();var value=snapshot();listeners.slice().forEach(function(fn){fn(value);});}
  function element(tag,cls,text,parent){var el=document.createElement(tag);el.className=cls;if(text!=null)el.textContent=String(text);if(parent)parent.appendChild(el);return el;}
  function link(parent,label,url){var el=element(url?'a':'span','nbacklink',label,parent);if(url){el.setAttribute('href',url);el.setAttribute('target','_blank');el.setAttribute('rel','noopener noreferrer');}return el;}
  function close(focus){
    if(!active)return;
    // #855: closing the post-drop question (Keep, Escape, outside click) keeps the
    // marker; a repaint or a re-render only redraws it, so the question stays pending.
    if(asked && !painting && !retired && editor)editor.endQuestion();
    var trigger=active;active=null;asked=false;
    document.removeEventListener('click',outside,true);document.removeEventListener('keydown',escape,true);
    if(trigger)trigger.setAttribute('aria-expanded','false');
    if(pop){if(pop.hidePopover && pop.matches(':popover-open'))pop.hidePopover();pop.hidden=true;}
    if(focus && trigger && trigger.isConnected)trigger.focus();
  }
  function outside(ev){
    if(active && pop.querySelector('.dv-live-production') && view.contains(ev.target) && ev.target.closest('.dv-live-over-time-slider,.dv-live-step'))return;
    if(active && !active.contains(ev.target) && !pop.contains(ev.target) && carrierFrom(ev.target)!==active)close(true);
  }
  function escape(ev){if(ev.key==='Escape' && active){ev.preventDefault();ev.stopPropagation();close(true);}}
  function productionRow(trigger){
    if(authoring || !trigger || !trigger._liveCarrier)return null;
    var evidence=telemetry.snapshot();if(!liveStatusProofPresentation(evidence,telemetryWindow,telemetry.enabled()))return null;
    var id=trigger.getAttribute('data-live-carrier'),scope=bindings.find(function(binding){return binding.el.contains(trigger);});
    if(!scope)return null;
    // Resolve the activated carrier in its own loaded detail/template scope.
    // Display titles can repeat and are never telemetry lookup keys.
    var input=telemetryProofInput(function(fn){fn(trigger._liveCarrier.value,id,scope.page);},function(){},map,evidence.map,evidence.environment);
    evidence.carriers=evidence.carriers.filter(function(binding){return binding.id!==id;}).concat(input.carriers);
    evidence.verdicts=proofVerdicts({carriers:evidence.carriers,jiraMap:map,telemetryMap:evidence.map});
    var proof=liveStatusProofPresentation(evidence,telemetryWindow,telemetry.enabled());
    return proof && proof.rows.find(function(row){return row.id===id;}) || null;
  }
  function paintProduction(trigger){
    // #1153: the metrics popup shows metric evidence only: no proof label, Done marker or Since Done line. #1202: the Jira view's
    // popup reads the same; its Tickets section is where Jira state belongs.
    var row=productionRow(trigger),block=pop.querySelector('.dv-live-production');
    if(!row){if(block)block.remove();return false;}
    if(!block)block=element('section','dv-live-production',null,pop);
    block.setAttribute('data-loading',row.initialLoading?'true':'false');block.setAttribute('data-production-carrier',row.id);
    block.setAttribute('data-telemetry',row.telemetry || 'unobserved');
    function text(tag,cls,value){var node=block.querySelector('.'+cls);if(!node)node=element(tag,cls,null,block);if(node.textContent!==value)node.textContent=value;return node;}
    var environment=telemetry.environment();
    text('h3','dv-live-production-heading',(environment?environment.toUpperCase()+' ':'')+'Evidence');
    text('p','dv-live-production-verdict',row.metrics.label+' · '+row.metrics.explanation);
    text('p','dv-live-proof-predicate',row.predicate);
    var chart=block.querySelector('.dv-live-production-chart') || element('div','dv-live-production-chart',null,block);chart.replaceChildren();
    if(row.chart.points.length || row.chart.markers.length){
      var svg=telemetrySvg(document,'svg',{class:'dv-live-proof-sparkline',viewBox:'0 0 100 32',role:'img','aria-label':telemetryWindow+' window: '+row.chart.points.length+' observed points'},chart);
      if(row.chart.line)telemetrySvg(document,'polyline',{class:'dv-live-proof-series',points:row.chart.line},svg);
      row.chart.points.forEach(function(point){telemetrySvg(document,'circle',{class:'dv-live-proof-point',cx:point.x,cy:point.y,r:1.8},svg);});
      row.chart.markers.filter(function(marker){return marker.kind!=='done';}).forEach(function(marker){var tick=telemetrySvg(document,'line',{class:'dv-live-proof-marker',x1:marker.x,x2:marker.x,y1:2,y2:30,'data-kind':marker.kind},svg);telemetrySvg(document,'title',{},tick).textContent=marker.label;});
    }else element('span','',row.chart.pending?'Loading…':'No observed series in this window',chart);
    var kpis=block.querySelector('.dv-live-production-kpis') || element('div','dv-live-production-kpis',null,block);
    while(kpis.children.length>row.kpis.length)kpis.lastElementChild.remove();
    // #1194: one row per metric: bold label, its graph, one line "<scope>: <value>". The primary signal's row holds the
    // main chart (with its markers) instead of a second copy. A scope the previous tile already showed is not repeated.
    var previous=null,placed=false;
    row.kpis.forEach(function(kpi,i){
      var tile=kpis.children[i] || element('div','dv-live-production-kpi',null,kpis);tile.replaceChildren();
      element('strong','dv-live-metric-label',kpi.label,tile);
      if(kpi.url){var queryLink=link(tile,'',kpi.url);queryLink.className='dv-live-metric-link';queryLink.setAttribute('aria-label','Open '+kpi.label+' source query in a new tab');queryLink.innerHTML=FlowIcons.render('external-link',{className:'dv-live-pr-icon',monochrome:true});}
      if(kpi.name===row.primary){tile.appendChild(chart);placed=true;}
      else if(kpi.chart && kpi.chart.points.length){
        var spark=telemetrySvg(document,'svg',{class:'dv-live-metric-sparkline',viewBox:'0 0 100 32',role:'img','aria-label':kpi.label+': '+kpi.chart.points.length+' observed points'},tile);
        if(kpi.chart.line)telemetrySvg(document,'polyline',{class:'dv-live-metric-series',points:kpi.chart.line},spark);
        kpi.chart.points.forEach(function(point){telemetrySvg(document,'circle',{class:'dv-live-metric-point',cx:point.x,cy:point.y,r:1.8},spark);});
      }
      var scope=kpi.scope && kpi.scope!==previous?kpi.scope:'';previous=kpi.scope;
      element('small','dv-live-metric-line',(scope?scope+': ':'')+kpi.text,tile);
    });
    if(!placed && chart.parentNode!==block)block.insertBefore(chart,kpis);
    var anchor=block.querySelector('.dv-live-production-link');
    if(row.url){if(!anchor){anchor=link(block,'',row.url);anchor.classList.add('dv-live-production-link');anchor.innerHTML=FlowIcons.render('external-link',{className:'dv-live-pr-icon',monochrome:true});element('span','',null,anchor);}anchor.setAttribute('href',row.url);anchor.querySelector('span').textContent=row.linkLabel;}
    else if(anchor){var root=pop.getRootNode();if(root.activeElement===anchor)pop.querySelector('.node-link-close').focus({preventScroll:true});anchor.remove();}
    return true;
  }
  /* #1253: a repaint keeps an open popover. A Jira popover is rebuilt from its carrier's values now
     (states, waiting, stale and PR lines); a Metrics section keeps its element and updates in place. */
  function refreshPopover(){
    if(!active || !pop)return;
    if(active._liveCarrier && !active._liveCarrier.metricsOnly){rebuildPopover(active);active.setAttribute('aria-expanded','true');return;}
    var hadProduction=!!pop.querySelector('.dv-live-production');
    if(!paintProduction(active) && hadProduction){close(true);return;}
    active.setAttribute('aria-expanded','true');
  }
  function popoverControlKey(el){var row=el.closest('[data-live-ticket]');return [row?row.getAttribute('data-live-ticket'):'',el.tagName,el.className,el.getAttribute('href') || '',el.getAttribute('aria-label') || ''].join('|');}
  function popoverMarkup(nodes){return nodes.every(function(node){return typeof node.outerHTML==='string';})?nodes.map(function(node){return node.outerHTML;}).join(''):null;}
  // Unchanged content stays as it is (text selection, hover); focus inside goes back to the same control, else to Close.
  function rebuildPopover(trigger){
    var c=trigger._liveCarrier,root=pop.getRootNode?pop.getRootNode():document,focused=root && root.activeElement;
    // The Metrics section stays in place (never detached): a control focused inside it keeps its focus.
    var block=pop.querySelector('.dv-live-production'),inBlock=!!(block && focused && block.contains(focused)),key=focused && focused!==pop && !inBlock && pop.contains(focused)?popoverControlKey(focused):null;
    var question=asked && editing() && editor.question(),box=document.createElement('div'),filled=fillPopover(box,trigger,c.value,c.tracking,c.label,c.waiting,c.availability,c.ref,question || null),dismiss=filled.dismiss;asked=!!filled.asking;
    var fresh=Array.prototype.slice.call(box.children),old=Array.prototype.filter.call(pop.children,function(node){return node!==block;}),before=popoverMarkup(old);
    if(before==null || before!==popoverMarkup(fresh)){
      old.forEach(function(node){node.remove();});
      fresh.forEach(function(node){pop.insertBefore(node,block || null);});
      if(key){var again=Array.prototype.find.call(pop.querySelectorAll('a,button'),function(el){return !(block && block.contains(el)) && popoverControlKey(el)===key;}) || dismiss;again.focus({preventScroll:true});}
    }
    paintProduction(trigger);place(trigger);
  }
  function show(trigger,value,tracking,label,waiting,availability,ref,asking){
    if(retired)return;
    if(active===trigger){close(true);return;}close(false);
    if(!pop){pop=element('div','nbackpop dv-live-popover',null,view);pop.setAttribute('role','dialog');pop.setAttribute('popover','manual');pop.hidden=true;}
    pop.replaceChildren();
    var filled=fillPopover(pop,trigger,value,tracking,label,waiting,availability,ref,asking);
    paintProduction(trigger);
    reveal(trigger,filled.dismiss,!!filled.asking);
  }
  // The popover's content for a carrier, built into `box` (the popover, or a detached box for a refresh).
  function fillPopover(box,trigger,value,tracking,label,waiting,availability,ref,asking){
    var metricsOnly=!!(trigger._liveCarrier && trigger._liveCarrier.metricsOnly);
    pop.setAttribute('aria-label',metricsOnly?'Metrics for '+label:(trackingRefs(value).tickets.length?'Live tickets for ':'Work status for ')+label);
    element('strong','node-link-title',(metricsOnly?'Metrics · ':'Work status · ')+label,box);
    var dismiss=element('button','node-link-close','×',box);dismiss.type='button';dismiss.setAttribute('aria-label',metricsOnly?'Close metrics':'Close live tickets');dismiss.addEventListener('click',function(){close(true);});
    if(metricsOnly)return {dismiss:dismiss,asking:null};
    var summary=trigger._liveCarrier && trigger._liveCarrier.summary,found=trackingRefs(summary || value);
    if(summary)element('p','dv-live-domain-summary','Domain summary: this node and '+summary.carriers+' descendant nodes/connections · '+summary.tickets.length+' unique tickets.'+(summary.missing?' Missing work: '+summary.missing+' marked carriers.':'')+(summary.unavailable.length?' Detail evidence unavailable: '+summary.unavailable.join(', ')+'. Completion is unknown.':''),box);
    if(value && value.missingWork===true)element('p','dv-live-coverage-detail','Missing work: additional work remains without a linked ticket. Clear this Missing work marker when covered.',box);
    else if(!summary && !found.tickets.length && referencesAvailable())element('p','dv-live-coverage-detail','No change needed: no linked tickets or missing-work marker.',box);
    // #855 Edit mode: clear a marker set on this board; an inherited one names its source diagram.
    var marker=ref && editing() && value && value.missingWork===true?editor.missingWork(ref):null;
    if(asking && !(marker && marker.clearable)){editor.endQuestion();asking=null;}
    if(marker && !marker.clearable)element('p','dv-live-missing-source','Missing work comes from the source diagram "'+marker.source+'" and must be cleared there.',box);
    if(marker && marker.clearable){
      var choice=element('div','dv-live-clear',null,box);
      if(asking)element('p','dv-live-question','Does '+asking.ticket+' cover the missing work?',choice);
      var clear=element('button','reader-button dv-live-clear-missing','Clear Missing work',choice);clear.type='button';
      clear.addEventListener('click',function(ev){ev.preventDefault();ev.stopPropagation();editor.endQuestion();editFromPopover(ref,function(){return editor.clearMissingWork(ref);});});
      if(asking){
        var keep=element('button','reader-button dv-live-keep','Keep',choice);keep.type='button';
        keep.addEventListener('click',function(ev){ev.preventDefault();ev.stopPropagation();close(true);});
      }
    }
    if(availability){
      element('p','dv-live-availability-detail',liveStatusAvailabilityLabel(availability),box);
      availability.forEach(function(cause){cause.tickets.forEach(function(key){
        if(found.tickets.indexOf(key)<0)found.tickets.push(key);
      });});
    }
    if(waiting && waiting.keys && waiting.keys.length){
      // "Waiting on KEY · state" per direct upstream, then the chain(s) this carrier's tickets sit in.
      var shown=[];found.tickets.forEach(function(ticket){(ticketWaiting[ticket] ? ticketWaiting[ticket].on : []).forEach(function(up){
        if(shown.indexOf(up.key)>=0)return;shown.push(up.key);
        var row=element('div','dv-live-waiting-detail','Waiting on '+up.key+' · '+up.state,box);row.setAttribute('data-tone',up.tone);
      });});
      // Only chains in which one of this carrier's tickets is a waiting hop; a chain
      // this carrier merely holds up belongs to the downstream carrier's popover.
      liveStatusDependencyChains(ticketWaiting).forEach(function(chain){
        if(!chain.some(function(key,index){return index>0 && found.tickets.indexOf(key)>=0;}))return;
        element('div','dv-live-waiting-chain',chain.join(' holds '),box);
      });
    }
    // Edit mode: Remove only for tickets authored on this carrier, never for availability causes or provider-inherited ones.
    var removable=ref && editing()?editor.removable(ref):[];
    found.tickets.forEach(function(key){
      var entry=map[key],row=element('div','dv-live-ticket',null,box);row.setAttribute('data-live-ticket',key);
      if(removable.indexOf(key)>=0){
        var remove=element('button','reader-button dv-live-remove','Remove',row);remove.type='button';remove.setAttribute('aria-label','Remove '+key+' from '+label);
        remove.addEventListener('click',function(ev){ev.preventDefault();ev.stopPropagation();editFromPopover(ref,function(){return editor.remove(ref,key);});});
      }
      var ticketSource=summary && summary.ticketSources[key];
      // #1198: one line per ticket: the key, the title cut to one line (full title in its tooltip), PRs and staleness, then the
      // status chip at the right. A detail (a blocked reason) takes a second line. The owner is not shown.
      link(row,key,liveStatusTicketURL(ticketSource?ticketSource.tracking:tracking,key,entry,(ticketSource && ticketSource.authoredURL) || trackingTicketURL(value,key) || (availability || []).map(function(cause){return trackingTicketURL(cause.value,key);}).filter(Boolean)[0]));
      if(entry && entry.title)element('span','dv-live-ticket-title',entry.title,row).setAttribute('title',entry.title);
      // Staleness, the PR count and the PR links are never clipped; they wrap onto a second line when the row is full (#1213).
      if(entry && liveStatusStale(entry,Date.now(),tracking && tracking.staleDays))element('span','dv-live-stale-detail','no activity '+Math.floor((Date.now()-Date.parse(entry.updatedAt))/86400000)+' d',row);
      if(entry && entry.prs)element('span','dv-live-ticket-prs','PRs: '+entry.prs.count+' '+entry.prs.state,row);
      if(entry && entry.prs && entry.prs.links){var icons=element('span','dv-live-ticket-links',null,row);entry.prs.links.forEach(function(pr){liveStatusPRDecorate(element('a',null,null,icons),pr);});}
      var pill=element('span','dv-live-ticket-state dv-live-state-pill',entry?entry.state:'No status',row);liveStatusClass(pill,entry?entry.state:null);row.style.setProperty('--dv-live-chip-ch',String(pill.textContent.length));
      if(entry && entry.detail)element('span','dv-live-ticket-detail',entry.detail,row);
    });
    found.prs.forEach(function(url){link(box,url,url);});
    return {dismiss:dismiss,asking:asking && marker && marker.clearable?asking:null};
  }
  function place(trigger){
    var rect=trigger.getBoundingClientRect();
    pop.style.left=Math.max(8,Math.min(window.innerWidth-pop.offsetWidth-8,rect.left))+'px';
    pop.style.top=Math.max(8,Math.min(window.innerHeight-pop.offsetHeight-8,rect.bottom+6))+'px';
  }
  function reveal(trigger,dismiss,ask){
    active=trigger;asked=ask;trigger.setAttribute('aria-expanded','true');pop.hidden=false;if(pop.showPopover)pop.showPopover();
    place(trigger);
    dismiss.focus({preventScroll:true});document.addEventListener('click',outside,true);document.addEventListener('keydown',escape,true);
  }
  /* Cards and edge labels remain the single keyboard ticket triggers. Small
     Jira cues are pointer aliases, never an additional status badge or tab stop.
     Pointer aliases on the line, halo and live break share the label's button
     (the path or visible live break when unlabelled), so each edge has just
     one keyboard stop. In
     the reader the trigger is a named button reached by Tab; under authoring
     the Workbench owns carrier clicks, selection and focus, so the trigger
     stays inert and the Tickets table remains the route to the popover. */
  var CARRIER_ATTRS=['role','tabindex','aria-label','aria-haspopup','aria-expanded'];
  // metricsOnly (#1136 D13): a metric card in the Trace view opens only its metrics detail, never a Jira work status.
  function carrierTarget(el,id,value,state,tracking,label,waiting,availability,ref,summary,metricsOnly){
    if(!el._liveSaved){el._liveSaved={};CARRIER_ATTRS.forEach(function(name){el._liveSaved[name]=el.getAttribute(name);});}
    el.classList.add('dv-live-target');el.setAttribute('data-live-carrier',id);
    el._liveCarrier={value:value,state:state,tracking:tracking,label:label,waiting:waiting,availability:availability,ref:ref || null,summary:summary || null,metricsOnly:!!metricsOnly};
    if(authoring)return el;
    el.setAttribute('role','button');el.setAttribute('tabindex','0');el.setAttribute('aria-haspopup','dialog');el.setAttribute('aria-expanded','false');
    if(metricsOnly){el.setAttribute('aria-label','Metrics for '+label);return el;}
    el.setAttribute('aria-label',(trackingRefs(value).tickets.length?'Live tickets for ':'Work status for ')+label+(state?' · '+(state==='unchanged'?'No change needed':state==='missing' && value.missingWork===true?'Missing work':state):'')+(summary?' · Domain summary'+(summary.missing?' · Missing work':'')+(summary.unavailable.length?' · Detail evidence unavailable':''):'')+(availability?' · '+liveStatusAvailabilityLabel(availability):'')+(waiting && waiting.keys?' · waiting on '+waiting.keys.join(', '):''));
    return el;
  }
  function clearTarget(el){
    var saved=el._liveSaved || {};el.classList.remove('dv-live-target');el.removeAttribute('data-live-carrier');
    CARRIER_ATTRS.forEach(function(name){if(saved[name]==null)el.removeAttribute(name);else el.setAttribute(name,saved[name]);});
    el._liveSaved=null;el._liveCarrier=null;
  }
  function clearTargets(){
    view.querySelectorAll('.dv-live-pointer').forEach(function(el){el.classList.remove('dv-live-pointer');el._livePointerTarget=null;});
    view.querySelectorAll('.dv-live-target').forEach(clearTarget);
    view.querySelectorAll('.dv-jira-cue').forEach(function(el){el.remove();});
  }
  function carrierPointer(el,target){
    if(!el || !target || authoring)return;
    el.classList.add('dv-live-pointer');el._livePointerTarget=target;
  }
  // A node's own controls (links menu, detail, handoff, anchors) keep their clicks.
  var CARRIER_SKIP='a,button,input,select,textarea,summary,[role="button"]:not(.dv-live-target),.nlink,.nbackref,[data-dv-detail],[data-dv-handoff]';
  function carrierFrom(target){
    if(!target || !target.closest)return null;
    if(target.closest('a'))return null;
    var direct=target.closest('.dv-live-target');if(direct && view.contains(direct))return direct;
    var pointer=target.closest('.dv-live-pointer');
    if(pointer && view.contains(pointer) && view.contains(pointer._livePointerTarget))return pointer._livePointerTarget;
    var node=target.closest('g.node[data-dv-node]');if(!node || !view.contains(node) || target.closest(CARRIER_SKIP))return null;
    return node.querySelector('.card.dv-live-target') || node.querySelector('.dv-metrics-outline.dv-live-target');
  }
  function openCarrier(el,asking){var c=el._liveCarrier;show(el,c.value,c.tracking,c.label,c.waiting,c.availability,c.ref,asking);}
  function sameRef(r,q){return !!r && !!q && r.section===q.section && r.kind===q.kind && (r.kind==='node'?r.id===q.id:r.index===q.index);}
  function refTarget(ref){return Array.prototype.find.call(view.querySelectorAll('.dv-live-target'),function(el){return !el.classList.contains('dv-metrics-label-hidden') && sameRef(el._liveCarrier && el._liveCarrier.ref,ref);});}
  /* #1253: focus hand-offs kept by the editor, which outlives the re-render an edit causes. An edit control's
     hand-off is the panel's (takeFocus); a popover edit's goes to its carrier in the next render, else to the panel. */
  function editAction(list,run){
    if(!editor.rememberFocus){run();return;}
    var before=JSON.stringify(editor.state()),intent={panel:list};editor.rememberFocus(intent);run();
    if(JSON.stringify(editor.state())===before && editor.focusIntent()===intent)editor.rememberFocus(null);
  }
  function editFromPopover(ref,run){
    var trigger=active;close(false);
    var intent=editor.rememberFocus?{carrier:ref,panel:['save','done','edit']}:null;if(intent)editor.rememberFocus(intent);
    setTimeout(function(){
      if(run())return;
      // Nothing changed: focus goes back to the carrier the popover was opened from.
      if(intent && editor.focusIntent()===intent)editor.rememberFocus(null);
      if(!retired && trigger && trigger.isConnected)trigger.focus({preventScroll:true});
    },0);
  }
  function focusEditedCarrier(){
    var intent=editor && editor.focusIntent && editor.focusIntent();if(!intent || !intent.carrier)return;
    // A new render paints once before it applies the remembered live map; a carrier without tickets is a button only after that.
    if(!applied && editor.lastMap && editor.lastMap())return;
    var el=refTarget(intent.carrier),root=typeof view.getRootNode==='function'?view.getRootNode():view.ownerDocument,now=root && root.activeElement;
    // Only while focus is nowhere (the closed popover's control is gone): a reader who moved on keeps their place.
    if(now && now!==document.body && now.isConnected!==false && !(pop && pop.contains(now))){editor.rememberFocus(null);return;}
    editor.rememberFocus(!el && intent.panel?{panel:intent.panel}:null);
    if(el)el.focus({preventScroll:true});
  }
  /* #855: the drop re-renders the page, so the post-drop question is the editor's
     until answered; each paint reopens it on the carrier's popover. */
  function askPending(){
    var q=editing() && editor.question();if(!q || asked)return;
    var el=Array.prototype.find.call(view.querySelectorAll('.dv-live-target'),function(candidate){return sameRef(candidate._liveCarrier && candidate._liveCarrier.ref,q.ref);});
    if(!el)return;
    if(active)close(false);
    openCarrier(el,q);
  }
  /* #1294 Outline: hover or focus on a carrier shows its card beside it; a click, Enter or Space opens the
     detail. On touch the first tap shows the card and a second tap (or a tap on the card) opens the detail. */
  var peekTimer=0,lastPointer='mouse';
  function metricsOutlineOf(target){
    if(metricsStyleShown()!=='outline' || !target || !target.closest)return null;
    var o=target.closest('.dv-metrics-outline');if(o)return o;
    var card=target.closest('.dv-metrics-card[data-metrics-style="outline"]');if(card)return card._metricsOutline || null;
    var svg=target.closest('svg'),edge=target.closest('[data-dv-edge]'),node=target.closest('g.node[data-dv-node]');
    if(svg && edge)return svg.querySelector('.dv-metrics-outline[data-dv-edge="'+edge.getAttribute('data-dv-edge')+'"]');
    return node?node.querySelector('.dv-metrics-outline'):null;
  }
  function metricsPeek(outline){
    if(peekTimer){clearTimeout(peekTimer);peekTimer=0;}
    view.querySelectorAll('.dv-metrics-peek').forEach(function(el){if(!outline || (el!==outline._metricsCard && el!==outline._metricsLeader))el.classList.remove('dv-metrics-peek');});
    if(outline && outline._metricsCard){outline._metricsCard.classList.add('dv-metrics-peek');if(outline._metricsLeader)outline._metricsLeader.classList.add('dv-metrics-peek');}
  }
  function metricsUnpeek(){if(peekTimer)clearTimeout(peekTimer);peekTimer=setTimeout(function(){peekTimer=0;var now=view.getRootNode && view.getRootNode().activeElement;if(!retired)metricsPeek(metricsOutlineOf(now));},200);}
  function peekOver(ev){if(ev.pointerType==='touch')return;var o=metricsOutlineOf(ev.target);if(o)metricsPeek(o);}
  function peekOut(ev){if(ev.pointerType==='touch' || !metricsOutlineOf(ev.target))return;if(metricsOutlineOf(ev.relatedTarget)===metricsOutlineOf(ev.target))return;metricsUnpeek();}
  function peekDown(ev){lastPointer=ev.pointerType || 'mouse';if(lastPointer==='touch' && !metricsOutlineOf(ev.target) && !(pop && pop.contains(ev.target)))metricsPeek(null);}
  function peekFocus(ev){var o=metricsOutlineOf(ev.target);if(o)metricsPeek(o);}
  function outlineButton(o){return o.classList.contains('dv-live-target')?o:o._livePointerTarget || o;}
  // A shown card's query links follow its carrier button in Tab order, then Tab moves on past the card.
  function peekTab(ev){
    if(ev.key!=='Tab' || ev.altKey || ev.ctrlKey || ev.metaKey)return;
    var o=metricsOutlineOf(ev.target),card=o && o._metricsCard;if(!card || !card.classList.contains('dv-metrics-peek'))return;
    var links=Array.prototype.slice.call(card.querySelectorAll('a.dv-metrics-query-link')),i=links.indexOf(ev.target),owner=outlineButton(o);if(!links.length)return;
    if(i<0 && ev.target===owner && !ev.shiftKey){ev.preventDefault();links[0].focus();return;}
    if(i===0 && ev.shiftKey){ev.preventDefault();owner.focus();return;}
    if(i===links.length-1 && !ev.shiftKey){
      var stops=Array.prototype.filter.call(view.querySelectorAll('a[href],button,input,select,textarea,[tabindex]'),function(el){return el.tabIndex>=0 && !el.disabled && !el.closest('.dv-metrics-card[data-metrics-style="outline"]') && el.getClientRects().length;}),next=stops[stops.indexOf(owner)+1];
      if(next){ev.preventDefault();next.focus();}
    }
  }
  function peekBlur(ev){if(metricsOutlineOf(ev.target) && metricsOutlineOf(ev.relatedTarget)!==metricsOutlineOf(ev.target))metricsUnpeek();}
  view.addEventListener('pointerover',peekOver);view.addEventListener('pointerout',peekOut);view.addEventListener('pointerdown',peekDown,true);
  view.addEventListener('focusin',peekFocus);view.addEventListener('focusout',peekBlur);view.addEventListener('keydown',peekTab,true);
  destroyListeners.push(function(){if(peekTimer)clearTimeout(peekTimer);view.removeEventListener('pointerover',peekOver);view.removeEventListener('pointerout',peekOut);view.removeEventListener('pointerdown',peekDown,true);view.removeEventListener('focusin',peekFocus);view.removeEventListener('focusout',peekBlur);view.removeEventListener('keydown',peekTab,true);});
  function carrierClick(ev){
    if(authoring || retired || ev.defaultPrevented || ev.button>0)return;
    var tapped=lastPointer==='touch' && metricsOutlineOf(ev.target);
    if(tapped && tapped._metricsCard && !tapped._metricsCard.classList.contains('dv-metrics-peek') && !ev.target.closest('.dv-metrics-card')){ev.preventDefault();ev.stopPropagation();metricsPeek(tapped);return;}
    var el=carrierFrom(ev.target);if(!el || !el._liveCarrier)return;
    ev.preventDefault();ev.stopPropagation();openCarrier(el);
  }
  function carrierKey(ev){
    if(authoring || retired || ev.defaultPrevented || (ev.key!=='Enter' && ev.key!==' '))return;
    var el=ev.target;if(!el || !el.classList || !el.classList.contains('dv-live-target') || !el._liveCarrier)return;
    ev.preventDefault();ev.stopPropagation();openCarrier(el);
  }
  view.addEventListener('click',carrierClick);view.addEventListener('keydown',carrierKey);
  destroyListeners.push(function(){view.removeEventListener('click',carrierClick);view.removeEventListener('keydown',carrierKey);});
  /* #828 Edit mode drop targets: a Tickets row dragged onto a node card or an
     edge (line, halo, label, live break or its Jira cue) adds its key to that
     carrier of this page. Detail pages loaded from other specs are not editable. */
  var EDIT_TICKET_TYPE='application/x-flowview-ticket',dropOver=null;
  function dropRef(target){
    if(!editing() || !target || !target.closest)return null;
    var inside=bindings.filter(function(binding){return binding.ordinal!=null && binding.el.contains(target);});
    var binding=inside.filter(function(candidate){return !inside.some(function(other){return other!==candidate && candidate.el.contains(other.el);});})[0];
    if(!binding)return null;
    var node=target.closest('g.node[data-dv-node]');
    if(node && binding.el.contains(node))return node.classList.contains('node-text')?null:{el:node,ref:{section:binding.ordinal,kind:'node',id:node.getAttribute('data-dv-node')}};
    var edge=target.closest('[data-dv-edge]'),index=edge?Number(edge.getAttribute('data-dv-edge')):NaN;
    if(!edge || !binding.el.contains(edge) || !isFinite(index))return null;
    var svg=edge.closest('svg');
    return {el:svg && svg.querySelector('path.edge[data-dv-edge="'+index+'"]') || edge,ref:{section:binding.ordinal,kind:'edge',index:index}};
  }
  function setDropOver(el){if(dropOver===el)return;if(dropOver)dropOver.classList.remove('dv-edit-over');dropOver=el;if(el)el.classList.add('dv-edit-over');}
  function carriesTicket(ev){return !!(ev.dataTransfer && Array.prototype.indexOf.call(ev.dataTransfer.types || [],EDIT_TICKET_TYPE)>=0);}
  function carriesSpan(ev){return !!(ev.dataTransfer && Array.prototype.indexOf.call(ev.dataTransfer.types || [],EDIT_SPAN_TYPE)>=0) && statusMode==='trace';}
  // Only the trace's own section takes a span drop (#1180): its steps are the ones Map span writes.
  var ordinalCache=null;
  function traceOrdinal(){
    var key=traceSelection && traceSelection.key;if(!key)return null;if(ordinalCache && ordinalCache.key===key)return ordinalCache.ordinal;
    var selected=traceSources().entries.find(function(e){return e.key===key;});ordinalCache={key:key,ordinal:selected?selected.binding.ordinal:null};return ordinalCache.ordinal;
  }
  function spanHit(target){
    var step=stepDropRef(target);if(step && step.blocked)return null;
    var carrier=!step && dropRef(target),hit=step || carrier && {el:carrier.el,ref:carrier.ref};if(!hit)return null;
    var ordinal=traceOrdinal();return ordinal!=null && (step?step.ordinal:carrier.ref.section)===ordinal?hit:null;
  }
  function dragOver(ev){
    if(carriesSpan(ev)){var over=spanHit(ev.target);setDropOver(over && over.el);if(over){ev.preventDefault();ev.dataTransfer.dropEffect='copy';}return;}
    if(!carriesTicket(ev))return;
    var hit=dropRef(ev.target);setDropOver(hit && hit.el);if(!hit)return;
    ev.preventDefault();ev.dataTransfer.dropEffect='copy';
  }
  function dragLeave(ev){var hit=carriesSpan(ev)?spanHit(ev.relatedTarget):dropRef(ev.relatedTarget);if(!hit || hit.el!==dropOver)setDropOver(null);}
  function dragEnd(){restoreTitles();setDropOver(null);}
  function drop(ev){
    if(carriesSpan(ev)){
      var landed=spanHit(ev.target);setDropOver(null);restoreTitles();if(!landed)return;ev.preventDefault();
      var payload=null;try{payload=JSON.parse(ev.dataTransfer.getData(EDIT_SPAN_TYPE));}catch(ex){payload=null;}
      if(payload && typeof payload.context==='string' && typeof payload.spanId==='string')spanDropped(payload,landed);
      return;
    }
    if(!carriesTicket(ev))return;
    var hit=dropRef(ev.target);setDropOver(null);if(!hit)return;
    ev.preventDefault();
    var key=ev.dataTransfer.getData(EDIT_TICKET_TYPE);if(!trackingKeyPattern.test(key))return;
    // The editor re-renders the page; leave this event's dispatch first.
    setTimeout(function(){if(editor)editor.add(hit.ref,key);},0);
  }
  if(editor){
    view.addEventListener('dragover',dragOver);view.addEventListener('dragleave',dragLeave);view.addEventListener('drop',drop);view.addEventListener('dragend',dragEnd);
    var offEditor=editor.onChange(function(){if(!retired){paint();notify();}});
    destroyListeners.push(function(){offEditor();setDropOver(null);view.removeEventListener('dragover',dragOver);view.removeEventListener('dragleave',dragLeave);view.removeEventListener('drop',drop);view.removeEventListener('dragend',dragEnd);restoreTitles();});
  }
  function sourceBindings(){
    var found=[];
    ctl.sections.forEach(function(rec){var index=records.findIndex(function(r){return r.reference===rec.reference;});if(index>=0)found.push({el:rec.sectionEl,section:records[index].section,page:page,stepper:rec.stepper,ordinal:index});});
    var saved=ctl.details && ctl.details.snapshot(),activeSections=ctl.details && ctl.details.activeSections();
    if(saved && activeSections){
      var currentPage=page,record=detailSection(page,saved.section),section=record && record.section;
      saved.frames.forEach(function(savedFrame,index){
        var node=section && section.diagram && section.diagram.nodes[savedFrame.node],detail=node && node.detail;
        if(!detail){section=null;return;}
        if(detail.spec)currentPage=remotePages[remoteKey(detail)];
        var target=currentPage && (detail.section?detailSection(currentPage,detail.section):sectionRecords(currentPage).find(function(r){return r.section.diagram;}));
        section=target && target.section;
        var rec=activeSections[index+1],ordinal=currentPage===page?records.findIndex(function(r){return r.section===section;}):-1;
        if(section && rec)found.push({el:rec.sectionEl,section:section,page:currentPage,stepper:rec.stepper,ordinal:ordinal>=0?ordinal:null});
      });
    }
    return found;
  }
  function decorateCarrier(el,value,tracking){
    var keys=trackingRefs(value).tickets,media=reducedMotion(),paintOn=statusMode!=='trace' && on;
    el.classList.toggle('dv-live-stale',paintOn && keys.some(function(key){return liveStatusStale(map[key],Date.now(),tracking && tracking.staleDays);}));
    if(!paintOn || !keys.some(function(key){return map[key];}) || (media && media.matches)){el.classList.remove('dv-live-changed');return;}
    if(!el.classList.contains('node') && !el.classList.contains('edge'))return;
    if(!keys.some(function(key){return changedKeys.indexOf(key)>=0;}))return;
    el.classList.remove('dv-live-changed');
    // Restart only for new evidence; navigation and identical maps never pulse.
    if(el.getBoundingClientRect)el.getBoundingClientRect();
    el.classList.add('dv-live-changed');
    if(!el._livePulseEnd){el._livePulseEnd=function(ev){if(!ev.animationName || ev.animationName==='dvnodepulse'){el.classList.remove('dv-live-changed');}};el.addEventListener('animationend',el._livePulseEnd);}
  }
  function pinTrace(id,exemplar){
    var snapshot=telemetry.snapshot(),sample=snapshot.map[id],binding=snapshot.carriers.find(function(c){return c.id===id;});
    if(retired || snapshot.historical || !binding || !sample || !(sample.exemplars || []).some(function(e){return e.traceId===exemplar.traceId && e.selectionToken===exemplar.selectionToken;}))return false;
    var added=telemetryActivity.pin(binding,exemplar,new Date().toISOString());notify();return added;
  }
  function paintStory(binding){
    var stepper=binding.stepper,d=statusDiagram(binding),scope=binding.el;
    scope.querySelectorAll('.dv-live-caption').forEach(function(el){el.remove();});
    if(statusMode==='trace'){scope.querySelectorAll('.dv-live-step-tickets,.dv-proof-caption').forEach(function(el){el.remove();});telemetryClearStep(scope);return;}
    var step=on && stepper && stepper.mode()==='step' && (d.steps || [])[stepper.sourceIndex()];
    var host=step && scope.querySelector('.termbar .step-text'),keys=step?liveStatusStepTickets(d,step,true):[];
    var row=host && host.querySelector('.dv-live-step-tickets');
    scope.querySelectorAll('.dv-live-step-tickets').forEach(function(el){if(el!==row || !keys.length)el.remove();});
    if(!host){telemetryPaintStep(binding,telemetry.snapshot(),map,on);return;}
    if(keys.length){
      var tickets=keys.map(function(key){
        var owner=liveStatusStepCarriers(d,step,true).map(function(carrier){return carrier.value.ticketSources && carrier.value.ticketSources[key];}).filter(Boolean)[0];
        return {key:key,url:liveStatusTicketURL(owner?owner.tracking:binding.page.tracking,key,map[key],owner?owner.authoredURL:liveStatusPageTicketURL(binding.page,key))};
      });
      var signature=JSON.stringify(tickets);
      // Keep keyboard focus on an unchanged link when fresh status arrives.
      if(!row || row._liveStepTickets!==signature){
        if(row)row.remove();
        row=element('span','dv-live-step-tickets','',host);row.setAttribute('role','group');row.setAttribute('aria-label','Jira tickets for this step');
        tickets.forEach(function(ticket){var item=element('span','dv-live-step-ticket','',row);link(item,ticket.key,ticket.url);element('span','dv-live-state-pill dv-live-step-state','',item);});row._liveStepTickets=signature;
      }
      var labels={todo:'To do',active:'In progress',testing:'Testing',done:'Done',blocked:'Blocked',missing:'Missing'};
      tickets.forEach(function(ticket,index){
        var entry=map[ticket.key],item=row.children[index],state=entry && entry.state,pill=item.querySelector('.dv-live-step-state');
        var title=entry && entry.title && entry.title.trim(),titleEl=item.querySelector('.dv-live-step-title');
        if(title){
          if(!titleEl){titleEl=element('span','dv-live-step-title','',item);item.insertBefore(titleEl,pill);}
          titleEl.textContent=title;titleEl.setAttribute('title',title);
        }else if(titleEl)titleEl.remove();
        pill.textContent=labels[state] || 'No status';liveStatusClass(pill,state || null);
      });
    }
    var text=availabilityOn && presentationActive()?liveStatusCaption(d,step,map,ticketWaiting):'';
    if(text){var caption=element('span','dv-live-caption dv-live-state-pill',text,host);liveStatusClass(caption,liveStatusStep(d,step,map));if(!caption.getAttribute('data-live-appearance'))liveStatusInk(caption,null);}
    telemetryPaintStep(binding,telemetry.snapshot(),map,on);
  }
  function laneLabel(id,source){return ((source.lanes || {})[id] || {}).label || id;}
  function laneRecords(){
    return [page].concat(Object.keys(remotePages).map(function(key){return remotePages[key];})).map(function(source){
      return {page:source,lanes:liveStatusLanes(source,map)};
    });
  }
  function paintLanes(){
    var on=statusMode!=='trace' && api.enabled();
    // Status boards put each ticket's state beneath the prose. Ordinary
    // diagrams keep their authored team context, independently of Live.
    bindings.forEach(function(binding){var stepper=binding.stepper;if(!stepper)return;
      var d=binding.section.diagram,step=(d.steps || [])[stepper.sourceIndex()];
      var statusBoard=(d.panels || []).some(function(panel){return panel && panel.type==='live-status';});
      binding.el.querySelectorAll('.lanepill').forEach(function(el){
        if(step && step.lane)el.textContent=laneLabel(step.lane,binding.page);
        el.classList.toggle('dv-live-board-lane',statusBoard);
        liveStatusClass(el,null);el.removeAttribute('title');el.removeAttribute('tabindex');
      });
    });
  }
  function firstBlocker(){
    if(!on)return null;
    var evidence=liveStatusWithoutGaps(map),activeStepper=ctl.activeStepper && ctl.activeStepper(),candidates=bindings.filter(function(binding){return binding.stepper && (!activeStepper || binding.stepper===activeStepper);});
    for(var b=0;b<candidates.length;b++){
      var binding=candidates[b],stepper=binding.stepper,d=binding.section.diagram;
      var path=diagramPathList(d).find(function(path){return path.id===stepper.path();});
      var index=path && path.indices.find(function(index){return ['blocked','missing'].indexOf(liveStatusStep(statusDiagram(binding),d.steps[index],evidence))>=0;});
      if(index!=null)return {binding:binding,index:index};
    }return null;
  }
  function focusBlocker(binding,index){
    var d=statusDiagram(binding),carriers=liveStatusStepCarriers(d,d.steps[index],true),filter=liveStatusStepFilter(d,d.steps[index]);
    var carrier=carriers.find(function(carrier){return liveStatusBlockingKeys(carrier.value,map).some(function(key){return !filter || filter.indexOf(key)>=0;}) || !filter && carrier.value.missingWork===true;});if(!carrier)return;
    focusCarrier(binding,carrier.id);
  }
  function focusCarrier(binding,id){
    var target=Array.from(binding.el.querySelectorAll('.dv-live-target')).find(function(el){return el.getAttribute('data-live-carrier')===id;});
    if(target)target.focus({preventScroll:true});
  }
  function carrierBinding(carrier){
    var source=carrier.pageKey?remotePages[carrier.pageKey]:page;
    var record=source && detailSection(source,carrier.reference);
    return bindings.slice().reverse().find(function(binding){
      if(!record || binding.page!==source || binding.section!==record.section)return false;
      for(var el=binding.el;el && el!==view;el=el.parentElement)if(el.hidden)return false;
      return true;
    });
  }
  /* Follow only authored detail links into pages already approved and loaded.
     The existing detail controller owns restoration, cancellation and history. */
  function carrierRoute(carrier){
    var queue=[],seen=[];
    records.forEach(function(record){if(record.section.diagram && !record.section.detailOnly)queue.push({page:page,record:record,section:record.reference,frames:[]});});
    for(var cursor=0;cursor<queue.length;cursor++){
      var route=queue[cursor],section=route.record.section;
      if(route.page===carrier.page && section===carrier.section)return route;
      if(seen.indexOf(section)>=0 || route.frames.length>=DETAIL_MAX_DEPTH-1)continue;
      seen.push(section);
      Object.keys(section.diagram && section.diagram.nodes || {}).forEach(function(id){
        var detail=section.diagram.nodes[id].detail;if(!detail)return;
        var source=detail.spec?remotePages[remoteKey(detail)]:route.page;
        var target=source && (detail.section?detailSection(source,detail.section):sectionRecords(source).find(function(record){return record.section.diagram;}));
        if(!target || !target.section.diagram)return;
        queue.push({page:source,record:target,section:route.section,frames:route.frames.concat([{node:id,state:{mode:'ambient'}}])});
      });
    }return null;
  }
  function showCarrier(carrier){
    if(retired || !on)return;
    var request=++coverageRequest,binding=carrierBinding(carrier);
    if(binding){focusCarrier(binding,carrier.id);return;}
    var source=carrier.pageKey?remotePages[carrier.pageKey]:page,record=source && detailSection(source,carrier.reference);
    var route=record && carrierRoute({page:source,section:record.section});
    var root=route && ctl.sections.find(function(rec){return rec.reference===route.section;});
    if(!root || (route.frames.length && (!ctl.details || !ctl.details.restore)))return;
    var focused=view.ownerDocument && view.ownerDocument.activeElement;
    if(root.tabBlock && ctl.tabBlocks)ctl.tabBlocks[root.tabBlock-1].select(root.tab,false);
    if(ctl.views && !ctl.views.ensure(root))return;
    if(ctl.details)ctl.details.showSection(root.reference);
    var restored=ctl.details?ctl.details.restore({section:route.section,frames:route.frames}):null;
    Promise.resolve(restored).then(function(){
      if(retired || request!==coverageRequest)return;
      // A later keyboard/click choice supersedes this pending focus request.
      var current=view.ownerDocument && view.ownerDocument.activeElement;
      if(current && current!==focused && current!==view.ownerDocument.body && current.isConnected &&
        !(current.closest && current.closest('.detail-breadcrumb')))return;
      paint();var target=carrierBinding(carrier);if(!target)return;
      if(target.el.scrollIntoView)target.el.scrollIntoView({block:'nearest'});
      focusCarrier(target,carrier.id);
    },function(error){if(!retired && request===coverageRequest)api.note(error && error.message || 'Unable to open detail','error');});
  }
  function jumpFirstBlocker(){
    var first=firstBlocker();if(!first)return;
    first.binding.stepper.jumpSource(first.index,first.binding.stepper.path());paint();focusBlocker(first.binding,first.index);
  }
  function panelLanes(pages){
    var lanes=[];pages.forEach(function(record){Object.keys(record.lanes).forEach(function(id){
      var lane=record.lanes[id],enabled=on && applied && refs().tickets.length>0;
      lanes.push({id:id,label:laneLabel(id,record.page),done:lane.done,total:lane.total,state:enabled?lane.state:null,
        text:laneLabel(id,record.page)+(enabled?' · '+lane.done+'/'+lane.total+' done':''),
        title:enabled?lane.keys.map(function(key){return key+' · '+(map[key]?map[key].state:'No status');}).join('\n'):''});
    });});return lanes;
  }
  function panelBlockers(pages){
    var coverage=liveStatusCoverage(page,map,refs(),sources());
    return coverage.onDiagram.concat(coverage.notOnDiagram,dependencyKeys).filter(function(key){return liveStatusBlocks(map[key]);}).map(function(key){
      var entry=map[key],labels=[],carriers=0,steps=0;
      pages.forEach(function(record){Object.keys(record.lanes).forEach(function(id){
        var label=laneLabel(id,record.page);if(record.lanes[id].keys.indexOf(key)>=0 && labels.indexOf(label)<0)labels.push(label);
      });});
      // Downstream = carriers whose tickets wait, directly or through a chain, on this key.
      var downstreamTickets=liveStatusDownstreamTickets(key,ticketWaiting),partial=Object.create(null);downstreamTickets.forEach(function(ticket){partial[ticket]=ticketWaiting[ticket];});
      sectionRecords(page).forEach(function(record){var d=record.section.diagram;if(!d)return;var waiting=liveStatusCarrierWaiting(d,map,partial);
        carriers+=Object.keys(waiting).length;
        // A step with a ticketFilter counts only when one of its shown tickets waits.
        steps+=(d.steps || []).filter(function(step){var filter=trackingStepTicketFilter(d,step,page);return filter?filter.some(function(ticket){return partial[ticket];}):liveStatusStepCarriers(d,step).some(function(carrier){return waiting[carrier.id];});}).length;
      });
      return {key:key,url:liveStatusTicketURL(page.tracking,key,entry,liveStatusPageTicketURL(page,key)),state:entry.state,lanes:labels.join(', '),
        downstream:carriers+' downstream carriers · '+steps+' steps'};
    });
  }
  function ticketRows(pages,coverage){
    var carriers=Object.create(null),rank=['blocked','missing','active','testing','todo','done'];
    pages.forEach(function(record){sectionRecords(record.page).forEach(function(section){
      var d=section.section.diagram || {};
      var list=Object.keys(d.nodes || {}).filter(function(id){return !isTextBoxNode(d.nodes[id]);}).map(function(id){return {id:id,value:d.nodes[id],label:d.nodes[id].title || id};});
      (d.edges || []).forEach(function(edge){list.push({id:edge.from+'->'+edge.to,value:edge,label:edge.label || edge.from+' → '+edge.to});});
      list.forEach(function(carrier){carrier.page=record.page;carrier.section=section.section;carrier.reference=section.reference;
        carrier.pageKey=Object.keys(remotePages).find(function(key){return remotePages[key]===record.page;});
        trackingRefs(carrier.value).tickets.forEach(function(key){(carriers[key] || (carriers[key]=[])).push(carrier);});
      });
    });});
    // Use the same extra upstream stories as the summary counts.
    var linked=dependencyKeys;
    return coverage.onDiagram.concat(coverage.notOnDiagram,linked).filter(function(key,index,all){return all.indexOf(key)===index && !liveStatusContainer(key,map[key],refs().epics);}).sort(function(a,b){
      var diff=rank.indexOf(map[a]?map[a].state:'missing')-rank.indexOf(map[b]?map[b].state:'missing');return diff || (a<b?-1:a>b?1:0);
    }).map(function(key){
      var entry=map[key] || {},owners=carriers[key] || [],laneColor=null,urls=[];
      pages.some(function(record){return Object.keys(record.lanes).some(function(id){
        if(record.lanes[id].keys.indexOf(key)<0 && entry.lane!==id)return false;
        laneColor=(record.page.lanes[id] || {}).color;return !!laneColor;
      });});
      var source=owners.length?owners[0].page:pages.filter(function(record){return trackingEpics(record.page).some(function(root){return root===entry.epic || (entry.initiatives || []).indexOf(root)>=0;});}).map(function(record){return record.page;})[0] || page;
      owners.forEach(function(carrier){trackingRefs(carrier.value).prs.forEach(function(url){if(urls.indexOf(url)<0)urls.push(url);});});
      var dependsOn=(dependencies[key] || []).map(function(dep){
        var up=map[dep.key],state=up && LIVE_STATUS_STATES.indexOf(up.state)>=0?up.state:'missing';
        return {key:dep.key,state:state,tone:state==='done'?'done':liveStatusUpstreamTone(up,state),sources:dep.sources.slice(),linkType:dep.linkType || '',reason:dep.reason || '',url:liveStatusTicketURL(source.tracking,dep.key,up,liveStatusPageTicketURL(source,dep.key))};
      });
      return {key:key,url:liveStatusTicketURL(source.tracking,key,entry,liveStatusPageTicketURL(source,key)),title:entry.title || '—',state:entry.state || 'No status',
        owner:entry.assignee || 'Unassigned',ownerUrl:entry.assignee?liveStatusOwnerURL(source.tracking,entry):null,dependsOn:dependsOn,waiting:ticketWaiting[key]?ticketWaiting[key].tone:null,
        epicLabel:entry.epic && ((coverage.initiatives || []).length || coverage.epics.indexOf(entry.epic)<0)?'epic '+entry.epic:'',
        prs:entry.prs?copy(entry.prs):null,urls:urls,laneColor:laneColor,
        carriers:owners.map(function(carrier){var route=carrierRoute(carrier),mounted=carrierBinding(carrier);
          return {id:carrier.id,label:carrier.label,reference:carrier.reference,pageKey:carrier.pageKey || '',
            disabled:!on || (!mounted && (!route || (route.frames.length && (!ctl.details || !ctl.details.restore)))),
            title:!mounted?'Detail page: '+(carrier.section.heading || carrier.reference):''};
        }),tag:linked.indexOf(key)>=0?'DEPENDENCY ONLY':!owners.length?'NOT ON DIAGRAM':coverage.notInEpic.indexOf(key)>=0?(coverage.initiatives?'NOT IN PARENT INITIATIVE':'NOT IN PARENT EPIC'):''};
    });
  }
  /* Jira is a link affordance, independent of provider evidence and Live paint.
     Reserve the complete 22-unit pointer area. Candidates follow the measured
     route (including reversed/vertical curves), then search farther off it;
     nodes prefer an inside corner and fall back just outside a crowded corner. */
  function paintJiraCues(scope,d){
    scope.querySelectorAll('svg').forEach(function(svg){
      var obstacles=[];
      svg.querySelectorAll('.node .card,.node .icbg,.node use,.node image,.node text,.handoff-stripe,.nlink,.nbackref,.detail-trigger,.handoff-link,[data-dv-handoff],.dvdelta,.node-review-badge,.coin,.coin-base,.comm-break,text.lbl,.dv-metrics-card-box').forEach(function(el){
        var box=boardControlBox(el,svg);if(box)obstacles.push({el:el,box:box});
      });
      function free(point,ignore){
        return !obstacles.some(function(item){var b=item.box;return item.el!==ignore && boardBoxesOverlap({x:point.x-13,y:point.y-13,w:26,h:26},b);});
      }
      // If even the bounded local search is crowded, keep the link discoverable
      // in clear space beside the drawing; frame expansion includes that slot.
      function overflow(point){
        return {x:obstacles.reduce(function(right,item){return Math.max(right,item.box.x+item.box.w+14);},point.x),y:point.y};
      }
      function cue(parent,target,value,point,local){
        var tickets=trackingRefs(value).tickets;if(!tickets.length || !point)return;
        var marker=document.createElementNS(SVGNS,'g');marker.setAttribute('class','dv-jira-cue'+(tickets.length>1?' dv-jira-stack':''));
        marker.setAttribute('transform','translate('+(point.x-(local?local.x:0))+' '+(point.y-(local?local.y:0))+')');
        marker.setAttribute('aria-hidden','true');marker.setAttribute('data-jira-carrier',target.getAttribute('data-live-carrier') || value.from+'->'+value.to);
        if(parent===svg)marker.setAttribute('data-dv-edge',target.getAttribute('data-dv-edge'));
        function add(tag,attrs){var el=document.createElementNS(SVGNS,tag);Object.keys(attrs).forEach(function(key){el.setAttribute(key,attrs[key]);});marker.appendChild(el);return el;}
        add('rect',{'class':'dv-jira-hit',x:-11,y:-11,width:22,height:22,rx:5});
        if(tickets.length>1)add('use',{'class':'dv-jira-back',href:'#i-jira',x:-3,y:-9,width:12,height:12});
        add('use',{'class':'dv-jira-icon',href:'#i-jira',x:tickets.length>1?-8:-6,y:tickets.length>1?-4:-6,width:12,height:12});
        add('title',{}).textContent='Jira · '+tickets.join(', ');
        parent.appendChild(marker);
        // A handoff owns its whole card; keep its link and keyboard action intact.
        // Only these cards transfer the ticket button to the separate Jira cue.
        if(target.closest('.handoff-link')){
          var carrier=target._liveCarrier,id=target.getAttribute('data-live-carrier');clearTarget(target);
          if(carrier){marker.removeAttribute('aria-hidden');carrierTarget(marker,id,carrier.value,carrier.state,carrier.tracking,carrier.label,carrier.waiting,carrier.availability,carrier.ref);}
        }else carrierPointer(marker,target);
        obstacles.push({el:marker,box:{x:point.x-11,y:point.y-11,w:22,h:22}});
      }
      svg.querySelectorAll('g.node[data-dv-node]:not(.node-text)').forEach(function(node){
        var value=(d.nodes || {})[node.getAttribute('data-dv-node')],card=node.querySelector('.card'),box=boardControlBox(card,svg);
        if(!box || !trackingRefs(value).tickets.length)return;
        var point=null,candidates=[{x:box.x+box.w-13,y:box.y+13},{x:box.x+box.w-13,y:box.y+box.h-13},{x:box.x+13,y:box.y+13},{x:box.x+13,y:box.y+box.h-13}];
        for(var ring=1;ring<=32;ring++){
          var gap=13+ring*24;
          candidates.push({x:box.x+box.w+gap-24,y:box.y+13},{x:box.x+box.w-13,y:box.y-gap+24},{x:box.x+box.w-13,y:box.y+box.h+gap-24},{x:box.x-gap+24,y:box.y+13});
        }
        point=candidates.find(function(p){return free(p,card);}) || overflow(candidates[0]);
        cue(node,card,value,point,{x:box.x,y:box.y});
      });
      svg.querySelectorAll('path.edge[data-dv-edge]').forEach(function(path){
        var value=(d.edges || [])[Number(path.getAttribute('data-dv-edge'))];
        if(!trackingRefs(value).tickets.length || path.closest('.dv-fragment-hidden') || value.hidden===true)return;
        var length=path.getTotalLength(),point=null;
        for(var ring=0;ring<32 && !point;ring++){
          var offset=16+ring*24;
          [.5,.35,.65,.2,.8].some(function(fraction){
            var at=length*fraction,p=path.getPointAtLength(at),a=path.getPointAtLength(Math.max(0,at-2)),b=path.getPointAtLength(Math.min(length,at+2)),dx=b.x-a.x,dy=b.y-a.y,n=Math.hypot(dx,dy)||1;
            return [-1,1].some(function(side){var candidate={x:p.x-side*dy/n*offset,y:p.y+side*dx/n*offset};if(!free(candidate))return false;point=candidate;return true;});
          });
        }
        var markerTarget=path._livePointerTarget || path;
        cue(svg,markerTarget,value,point || overflow(path.getPointAtLength(length/2)));
      });
      if(svg._refreshStatusFrame)svg._refreshStatusFrame();
    });
  }
  function paintBinding(binding){
    var on=api.enabled();
    var scope=binding.el,d=binding.section.diagram;if(!d)return;
    var waiting=on?liveStatusCarrierWaiting(d,map,ticketWaiting):{},coverageActive=presentationActive();
    scope.querySelectorAll('g.node[data-dv-node]').forEach(function(el){
      var id=el.getAttribute('data-dv-node'),value=(d.nodes || {})[id],summary=on && availabilityOn && coverageActive?domainSummary(binding.page,value):null,statusValue=summary || value,state=on && availabilityOn && !el.classList.contains('node-text')?(coverageActive?liveStatusPresentation(statusValue,map):liveStatusCarrier(value,map)):null;
      // A blocked or missing carrier keeps its own paint (solid or dotted rose): the stronger state wins
      // over the dashed waiting stroke; the popover and panel still record what it waits on.
      var unavailable=on && availabilityOn?liveStatusAvailability(value,map):null;liveStatusAvailabilityClass(el,unavailable);
      var waits=waiting[id],painted=state==='blocked' || state==='missing'?null:waits;decorateCarrier(el,el.classList.contains('node-text')?null:value,binding.page.tracking);liveStatusClass(el,state);liveStatusWaitingClass(el,painted);
      // Waiting tone wears the upstream's preset: slate while unfinished, rose when blocked or missing.
      liveStatusPreset(el,unavailable?(state==='active'?'azure':state==='testing'?'violet':state==='blocked' || state==='missing'?'rose':'slate'):painted?(painted.tone==='red'?'rose':'slate'):state?LIVE_STATUS_PRESETS[state]:null);
      liveStatusNodeConstruction(el,value,state,unavailable);
      if(statusMode==='trace')return;
      if(!summary && !state && !waits && !unavailable && !trackingRefs(value).tickets.length)return;
      var card=el.querySelector('.card');if(!card)return;
      if(state || waits || unavailable){var halo=card.cloneNode(false);halo.setAttribute('class','dv-live-halo');halo.removeAttribute('id');halo.setAttribute('aria-hidden','true');el.insertBefore(halo,el.firstChild);}
      carrierTarget(card,id,value,state,binding.page.tracking,value.title || id,waits,unavailable,binding.ordinal!=null?{section:binding.ordinal,kind:'node',id:id}:null,summary);
    });
    scope.querySelectorAll('path.edge[data-dv-edge],path.halo[data-dv-edge],text.lbl[data-dv-edge]').forEach(function(el){
      var index=Number(el.getAttribute('data-dv-edge')),value=(d.edges || [])[index],state=on?liveStatusEdgePresentation(value,map,availabilityOn):null;
      var unavailable=on && availabilityOn?liveStatusAvailability(value,map,d):null;liveStatusAvailabilityClass(el,unavailable);
      var waits=value && waiting[value.from+'->'+value.to],painted=state==='blocked' || state==='missing'?null:waits;decorateCarrier(el,value,binding.page.tracking);liveStatusClass(el,state);liveStatusWaitingClass(el,painted);
      if(statusMode==='trace')return;
      if((!state && !waits && !unavailable && !trackingRefs(value).tickets.length) || !el.classList.contains('edge'))return;
      var svg=el.closest('svg'),label=svg.querySelector('text.lbl[data-dv-edge="'+index+'"]');
      var target=carrierTarget(label || el,value.from+'->'+value.to,value,state,binding.page.tracking,value.label || value.from+' → '+value.to,waits,unavailable,binding.ordinal!=null?{section:binding.ordinal,kind:'edge',index:index}:null);
      carrierPointer(el,target);carrierPointer(svg.querySelector('path.halo[data-dv-edge="'+index+'"]'),target);
    });
    liveStatusEdgeBreaks(scope,d,map,on,availabilityOn);
    scope.querySelectorAll('g.dv-live-comm-failure[data-dv-edge]').forEach(function(el){
      var svg=el.closest('svg'),path=svg && svg.querySelector('path.edge[data-dv-edge="'+el.getAttribute('data-dv-edge')+'"]');
      var target=path && path._livePointerTarget;if(!target)return;
      // A live break hides its original path. Without a label, move the single
      // keyboard button onto the visible replacement so Escape can focus it.
      if(target===path){
        var carrier=path._liveCarrier;
        target=carrierTarget(el,path.getAttribute('data-live-carrier'),carrier.value,carrier.state,carrier.tracking,carrier.label,carrier.waiting,carrier.availability,carrier.ref);
        clearTarget(path);carrierPointer(path,target);carrierPointer(svg.querySelector('path.halo[data-dv-edge="'+el.getAttribute('data-dv-edge')+'"]'),target);
      }
      carrierPointer(el,target);
    });
    scope.querySelectorAll('g.coin[data-dv-step],button.schip[data-step-source]').forEach(function(el){
      var index=Number(el.getAttribute(el.classList.contains('coin')?'data-dv-step':'data-step-source')),step=(d.steps || [])[index];
      liveStatusClass(el,on && availabilityOn && step && coverageActive?liveStatusStep(statusDiagram(binding),step,map):null);
    });
  }
  function releaseBindings(){
    bindings.forEach(function(binding){['dv:pathrender','dv:pathchange','dv:stepchange'].forEach(function(type){binding.el.removeEventListener(type,schedule);});});
    stepHooks.splice(0).forEach(function(off){off();});
  }
  function syncBindings(){
    releaseBindings();var previous=bindings;bindings=sourceBindings();
    previous.forEach(function(old){if(!bindings.some(function(b){return b.el===old.el && b.stepper===old.stepper;})){telemetryClearStep(old.el);telemetryClearTrace(old.el);}});
    bindings.forEach(function(binding){
      ['dv:pathrender','dv:pathchange','dv:stepchange'].forEach(function(type){binding.el.addEventListener(type,schedule);});
      if(binding.stepper && binding.stepper.onBeforeAdvance)stepHooks.push(binding.stepper.onBeforeAdvance(function(index){
        // #1253: as in firstBlocker, a ticket with no status on an Over time day (it did not exist yet) stops nothing.
        var d=binding.section.diagram,state=statusMode!=='trace' && on && liveStatusStep(statusDiagram(binding),d.steps[index],liveStatusWithoutGaps(map));
        if(state!=='blocked' && state!=='missing')return true;
        paint();focusBlocker(binding,index);return false;
      }));
    });
  }
  function observeBindings(){
    if(applied && typeof MutationObserver!=='undefined'){
      if(!observer)observer=new MutationObserver(schedule);
      bindings.forEach(function(binding){binding.el.querySelectorAll('.schips').forEach(function(el){observer.observe(el,{childList:true,subtree:true});});});
    }
  }
  function paint(){
    if(retired || painting)return;
    if(frame){cancelAnimationFrame(frame);frame=0;}
    painting=true;
    // Observer callbacks run after this stack. Disconnect before our writes,
    // rather than relying on a flag that would be reset before delivery.
    if(observer)observer.disconnect();
    try{
      var focusRoot=typeof view.getRootNode==='function'?view.getRootNode():view.ownerDocument;
      var focused=focusRoot && focusRoot.activeElement,focusCarrier=focused && focused.classList && focused.classList.contains('dv-live-target') && focused.getAttribute('data-live-carrier'),focusBinding=focusCarrier && bindings.find(function(binding){return binding.el.contains(focused);});
      // #1253: an open popover stays open through the repaint, the post-drop question too (rebuilt in place).
      var openId=active && active.getAttribute('data-live-carrier'),openBinding=active && bindings.find(function(binding){return binding.el.contains(active);}),openMetrics=!!(active && active._liveCarrier && active._liveCarrier.metricsOnly);
      syncBindings();clearTargets();refreshDependencies();
      if(applied || availabilityOn || refs().tickets.length){
        view.querySelectorAll('.dv-live-halo').forEach(function(el){el.remove();});
        bindings.forEach(paintBinding);
      }
      // Trace labels first: metric cards are then placed clear of them (#1163).
      // #1195: show the connection labels metric cards hid, so trace labels avoid them too; paintMetrics hides them again.
      bindings.forEach(function(binding){telemetryClearCards(binding.el);});
      bindings.forEach(paintStory);paintLanes();paintTrace();paintMetrics();recordTraceLabels();
      // Paint Jira cues once, after cards and coins reserve their final boxes.
      // Handoffs transfer their ticket target from the card to the cue; a second
      // cue paint would discard that target after its source has been cleared.
      bindings.forEach(function(binding){if(statusMode!=='trace' && binding.section.diagram)paintJiraCues(binding.el,binding.section.diagram);});
      // paintJiraCues ends by growing the board frame for the overlay; the Trace view has no Jira cues but draws metric cards (D13).
      if(statusMode==='trace')bindings.forEach(function(binding){binding.el.querySelectorAll('svg').forEach(function(svg){if(svg._refreshStatusFrame)svg._refreshStatusFrame();});});
      view.querySelectorAll('.dv-edit-target').forEach(function(el){el.classList.remove('dv-edit-target');});
      if(editing())bindings.forEach(function(binding){if(binding.ordinal!=null)binding.el.querySelectorAll('g.node[data-dv-node]:not(.node-text),path.edge[data-dv-edge]').forEach(function(el){el.classList.add('dv-edit-target');});});
      if(focusBinding){var replacement=Array.from(focusBinding.el.querySelectorAll('.dv-live-target')).find(function(el){return el.getAttribute('data-live-carrier')===focusCarrier && !el.classList.contains('dv-metrics-label-hidden');});if(replacement)replacement.focus({preventScroll:true});}
      if(active){
        var target=openBinding && openBinding.el.isConnected && Array.from(openBinding.el.querySelectorAll('.dv-live-target')).find(function(el){return el.getAttribute('data-live-carrier')===openId && !el.classList.contains('dv-metrics-label-hidden') && !!(el._liveCarrier && el._liveCarrier.metricsOnly)===openMetrics;});
        if(target){active=target;refreshPopover();}else close(false);
      }
      changedKeys=[];
    }finally{
      painting=false;if(!retired)observeBindings();
    }
    if(traceRecheck){traceRecheck=false;traceLabelsResized();}
    if(!retired && editor){focusEditedCarrier();askPending();}
  }
  function schedule(){if(retired || painting || frame)return;frame=requestAnimationFrame(function(){frame=0;paint();notify();});}
  /* Last-refresh stamp in the viewer's local clock (Chuck, 2026-11-02): a relative
     "just now" froze between repaints. The date is added only when it is not today. */
  function clockTime(at){var d=new Date(at);if(!isFinite(d.getTime()))return '';var time=d.toLocaleTimeString([],{hour:'numeric',minute:'2-digit',second:'2-digit'});
    return d.toDateString()===new Date().toDateString()?time:d.toLocaleDateString([],{month:'short',day:'numeric'})+' '+time;}
  function relative(at){var seconds=Math.max(0,Math.floor((Date.now()-Date.parse(at))/1000));return seconds<60?'just now':seconds<3600?Math.floor(seconds/60)+'m ago':seconds<86400?Math.floor(seconds/3600)+'h ago':Math.floor(seconds/86400)+'d ago';}
  var poller=provider?liveStatusPoller(function(signal){return provider(refs(),signal);},delay,{
    busy:function(){setStatus({busy:true});},
    result:function(value){api.apply(value);if(noteKind==='error')api.note('','info');setStatus({state:demoMode?'demo':'connected',busy:false,checkedAt:Date.now()});},
    error:function(error){api.note(error && error.message || String(error),'error');setStatus({state:'error',busy:false});}
  }):null;
  function historyDetailChanged(){if(!retired)telemetry.bindingsChanged();}
  view.addEventListener('detail-navigation',historyDetailChanged);
  destroyListeners.push(function(){view.removeEventListener('detail-navigation',historyDetailChanged);});
  var events=['reader-skin-change','diagram-tab-change','tab-view-change','diagram-view-change','navigation-mounted','detail-navigation'];
  var api={
    refs:refs,
    snapshot:snapshot,
    setStatusMode:function(mode){if(retired || ['jira','trace'].indexOf(mode)<0)return;if(mode!==statusMode)clearTraceFocus();statusMode=mode;statusAuto=false;close(false);paint();notify();},
    // #1252: typing in Trace ID, start or end keeps the shown trace and its span focus.
    setDirectTraceField:function(change){if(!retired && change){if(['input','start','end'].indexOf(change.field)<0){traceDayNote='';traceRequest++;clearTraceFocus();traceSelection=null;traceInitial=true;traceNotice='';}directTrace.set(change.field,change.value);}},
    // #1252: a Load that fails, is cancelled or is stopped by an edit brings the shown trace back with its span focus.
    loadDirectTrace:async function(verify,line){if(retired)return;statusAuto=false;var saved=shownDirectFocus();traceRequest++;clearTraceFocus();traceSelection=null;traceInitial=true;traceNotice='';traceDayNote='';var mine=++traceLoads,result=await directTrace.load(!!verify,line);if(result){traceSelection=null;traceInitial=true;if(!retired)traceFollow(result);}else if(!retired && mine===traceLoads){restoreDirectFocus(saved);settleParked();}paint();notify();return result;},
    clearDirectTrace:function(){if(retired)return;traceDayNote='';traceNotice='';clearTraceFocus();traceSelection=null;traceInitial=true;directTrace.clear();settleParked();},
    // #1233: change.lookup names the search box a value belongs to; findLogLines(lookup) runs that box.
    setLogLookupField:function(change){if(!retired && change)logLookup.set(change.field,change.value,change.lookup);},
    findLogLines:function(lookup){return retired?Promise.resolve(null):logLookup.find(lookup);},
    recheckLogConnector:function(){if(!retired)logLookup.recheck();},
    // Load the chosen line's trace exactly as a pasted ID, then focus the line's span.
    loadLogTrace:async function(index){
      if(retired)return null;var row=logLookup.row(index);if(!row || !row.traceId)return null;
      api.setDirectTraceField({field:'input',value:row.traceId});logLookup.chosen(index,'');
      // #1124: a not-found report knows the line's time and whether a next line exists.
      var result=await api.loadDirectTrace(false,{at:row.time,next:logLookup.next(index)>=0});if(retired || !result || !row.spanId)return result;
      var selected=traceSnapshot().selected;
      if(!(selected && selected.manual && selected.exemplar.selectionToken===result.selectionToken && api.selectTraceSpan({context:selected.context,spanId:row.spanId})))logLookup.chosen(index,'Span '+row.spanId+' from the log line is not in this trace.');
      return result;
    },
    loadNextLogTrace:function(){if(retired)return Promise.resolve(null);var next=logLookup.next();return next<0?Promise.resolve(null):api.loadLogTrace(next);},
    setTraceShow:function(value){if(retired)return;traceShow=!!value;paint();notify();},
    chooseTrace:async function(choice){
      if(retired || statusMode!=='trace')return;statusAuto=false;
      var entry=traceSources().entries.find(function(e){return e.key===choice.key;});if(!entry)return;
      var request=++traceRequest;clearTraceFocus();tracePending=null;traceInitial=false;traceNotice='';
      if(choice.traceId===entry.exemplar.traceId){traceSelection={key:entry.key,traceId:choice.traceId,chosen:true};paint();notify();return;}
      if(!telemetry.canChooseExemplar(entry.carrier,entry.exemplar.selectionToken,choice.traceId))return;
      tracePending={request:request,key:entry.key,traceId:choice.traceId};traceNotice='Loading selected trace…';notify();
      try{await telemetry.chooseExemplar(entry.carrier,entry.exemplar.selectionToken,choice.traceId);if(retired || request!==traceRequest)return;traceSelection={key:entry.key,traceId:choice.traceId,chosen:true};traceNotice='';}
      catch(ex){if(retired || request!==traceRequest)return;traceNotice=ex.message;}
      tracePending=null;paint();notify();
    },
    // #1078: write the focused span's exact service and operation as the chosen step's traceMatch.
    mapTraceSpan:function(action){
      if(retired || !editing() || statusMode!=='trace' || !action || typeof action.stepId!=='string')return false;
      var selected=traceSnapshot().selected;if(!selected || action.context!==selected.context)return false;
      var entry=traceSources().entries.find(function(e){return e.key===selected.key;}),span=entry && entry.exemplar.spans.find(function(s){return s.id===action.spanId;});
      var steps=entry && traceMapSteps(entry.binding),step=steps && steps.find(function(item){return item.id===action.stepId;});
      // #1177: a step that has a traceMatch is replaced only when the reader picked it as such (drop or chooser).
      if(!span || !span.service || !span.name || !step || step.alternatives || step.mapped && action.replace!==true)return false;
      var ref={section:entry.binding.ordinal,kind:'step',id:action.stepId},match={serviceName:span.service,operation:span.name},previous=step.mapped?step.traceMatch:null;
      var authored=(entry.binding.section.diagram.steps || [])[step.index];
      if(typeof action.nodeId==='string' && authored && !authored.edge && !authored.edges && Array.isArray(authored.nodes) && authored.nodes.length===1 && authored.nodes[0]===action.nodeId)match.nodeId=action.nodeId;
      // Focus goes back to the span row after the re-render this mapping causes, and only then (#1180 c3).
      if(!editor.mapSpan)return false;traceChooser=null;traceReturnSpan=action.spanId;setTimeout(function(){if(!retired && !editor.mapSpan(ref,match,previous))traceReturnSpan=null;},0);return true;
    },
    // #1177: the chooser a span drop opened on a carrier with several steps; Esc or Cancel closes it.
    chooseTraceMapStep:function(action){
      if(retired || !traceChooser || !action)return false;var c=traceChooser,step=c.steps.find(function(item){return item.id===action.stepId;});if(!step)return false;
      return api.mapTraceSpan({context:c.context,spanId:c.spanId,stepId:step.id,replace:step.mapped,nodeId:c.nodeId});
    },
    cancelTraceMapChooser:function(){if(retired || !traceChooser)return;traceChooser=null;traceReturnSpan=null;paint();notify();},
    // #1177: take back the latest pending span mapping (board-edit.js undoMap); it re-renders the board.
    undoTraceMap:function(){if(retired || !editor || !editor.undoMap)return false;setTimeout(function(){if(!retired)editor.undoMap();},0);return true;},
    selectTraceSpan:function(action){
      if(retired || statusMode!=='trace' || !action)return false;statusAuto=false;
      var selected=traceSnapshot().selected;
      if(!selected || action.context!==selected.context)return false;
      var entry=traceSources().entries.find(function(e){return e.key===selected.key;});
      if(!entry || traceContext(entry)!==action.context || !entry.exemplar.spans.some(function(s){return s.id===action.spanId;}))return false;
      var binding=entry.binding,choices=telemetryTraceChoices(binding.section.diagram,binding.stepper && binding.stepper.path(),entry.exemplar,action.spanId);
      var choice=action.choiceKey?choices.find(function(c){return c.key===action.choiceKey;}):choices.length===1 && choices[0].row.status==='matched'?choices[0]:null;
      if(action.choiceKey && (!traceFocus || traceFocus.spanId!==action.spanId || !choice))return false;
      traceFocus={context:action.context,spanId:action.spanId,choiceKey:choice && choice.key};
      if(binding.stepper){
        binding.stepper.pause();
        if(choice){
          var resolved=resolveSourceStep(binding.section.diagram,choice.pathId,choice.stepId);
          if(!resolved || resolved.sourceIndex!==choice.sourceIndex || !binding.stepper.jumpSource(resolved.sourceIndex,resolved.path.id))traceFocus.choiceKey=null;
        }
      }
      paint();notify();return true;
    },
    clearTraceFocus:function(action){if(retired || !action || action.context!==(traceSnapshot().selected || {}).context)return;clearTraceFocus();paint();notify();},
    pinSelectedTrace:function(){var selected=traceSnapshot().selected;if(selected){traceNotice=pinTrace(selected.carrier,selected.exemplar)?'Pinned in this session’s Activity.':'Already pinned in this session’s Activity.';notify();}},
    firstBlocker:jumpFirstBlocker,
    focusCarrier:showCarrier,
    runAction:function(){if(!retired && actionFn)actionFn();},
    prevDemo:function(){if(!retired && demoControls && demoControls.prev)demoControls.prev();},
    nextDemo:function(){if(!retired && demoControls)demoControls.next();},
    state:function(ref){return map[ref]?copy(map[ref]):null;},
    apply:function(value){
      if(retired)return;
      // A past day is on screen: this evidence waits for the return to Live.
      if(over){over.held=true;over.value=value;return;}
      if(editor)editor.rememberMap(value);
      var next=cleanMap(value);
      // Cache age describes the lookup, independently of issue modification
      // times. Preserve it before filtering the map down to ticket entries.
      var storedAt=value && value.storedAt;
      cacheUpdatedAt=typeof storedAt==='number' && isFinite(new Date(storedAt).getTime())?new Date(storedAt).toISOString():null;
      changedKeys=[];
      if(applied)refs().tickets.forEach(function(key){
        var oldState=map[key]?map[key].state:'No status',newState=next[key]?next[key].state:'No status';
        if(oldState===newState)return;
        changedKeys.push(key);
        var stamp=Date.parse(next[key] && next[key].updatedAt),at=isFinite(stamp)?new Date(stamp).toISOString():cacheUpdatedAt;
        activity.unshift({key:key,old:oldState,state:newState,at:at});
      });
      if(applied)liveStatusCoverage(page,next,refs(),sources()).notOnDiagram.forEach(function(key){
        if(seenKeys[key])return;
        var stamp=Date.parse(next[key].updatedAt),at=isFinite(stamp)?new Date(stamp).toISOString():cacheUpdatedAt;
        activity.unshift({key:key,added:true,at:at});
      });
      activity=activity.slice(0,20);Object.keys(next).forEach(function(key){seenKeys[key]=true;});
      map=next;applied=true;availabilityOn=true;paint();notify();telemetryHooks.jiraChanged();
    },
    setHistory:function(source){if(retired)return;if(over)overClose();overRequest++;overLoading=false;overError='';overSource=source && typeof source.load==='function'?source:null;notify();},
    // The reader's click is the only thing that loads history.
    overTime:function(){openOver(null);},
    overTimeClose:function(){if(!retired && over)overClose();},
    overTimeStep:function(delta){if(!retired && over)api.overTimeDay(over.index+delta);},
    overTimeDay:function(index){
      if(retired || !over || typeof index!=='number' || !isFinite(index) || Math.floor(index)!==index)return;
      index=Math.max(0,Math.min(over.days.length-1,index));if(index===over.index)return;
      over.index=index;traceViewChanged();if(over.source.day)over.source.day(index);overShow();
    },
    clear:function(){if(retired)return;overRequest++;overLoading=false;overError='';if(over){var left=over;over=null;traceViewChanged();telemetry.closeHistory();if(left.source.close)left.source.close();}availabilityOn=false;map=Object.create(null);cacheUpdatedAt=null;activity=[];seenKeys=Object.create(null);changedKeys=[];applied=true;paint();notify();telemetryHooks.jiraChanged();},
    enabled:function(){return on;},
    setEnabled:function(value){if(retired)return;on=!!value;if(on)availabilityOn=true;paint();notify();},
    // The panel's Metrics button (#939); Jira Live above is independent of it.
    setMetricsEnvironment:function(value){if(!retired)telemetry.setEnvironment(value);},
    setMetricsEnabled:function(value){if(!retired)telemetry.setEnabled(value);},
    // #1294: Cards or Outline, remembered per viewer and board; storage may be unavailable.
    setMetricsStyle:function(value){
      if(retired || authoring || ['cards','outline'].indexOf(value)<0 || value===metricsStyle)return;
      metricsStyle=value;try{view.ownerDocument.defaultView.localStorage.setItem(metricsStyleKey,value);}catch(ex){}
      metricsPeek(null);paint();notify();
    },
    // The same controller as ctl.telemetry, so a demo player mounted on this API can feed it.
    telemetry:telemetry,
    onDestroy:function(fn){if(typeof fn!=='function')return function(){};if(retired){fn();return function(){};}destroyListeners.push(fn);return function(){var i=destroyListeners.indexOf(fn);if(i>=0)destroyListeners.splice(i,1);};},
    onChange:function(fn){if(typeof fn!=='function' || retired)return function(){};listeners.push(fn);return function(){var i=listeners.indexOf(fn);if(i>=0)listeners.splice(i,1);};},
    note:function(text,kind){if(retired)return;noteText=typeof text==='string'?text:'';noteKind=['info','warn','error'].indexOf(kind)>=0?kind:'info';notify();},
    action:function(label,fn){if(retired)return;actionLabel=typeof label==='string'?label:'';actionFn=actionLabel && typeof fn==='function'?fn:null;notify();},
    setDemoControls:function(value){if(retired)return;demoControls=value;notify();},
    status:function(value){setStatus(value);},
    // #1253: each edit control names the controls that take keyboard focus after it (the first one shown).
    editStart:function(){if(!retired && editor && !over && !overLoading)editAction(['done','save'],function(){editor.start();});},
    editDone:function(){if(!retired && editor)editAction(['edit'],function(){editor.done();});},
    editSave:function(){if(!retired && editor)editAction(['edit','save','done'],function(){editor.save();});},
    editDiscard:function(){if(!retired && editor)editAction(['edit'],function(){editor.discard();});},
    // The panel's share of a focus hand-off: the control names to focus, once, and never while a save runs.
    takeFocus:function(){
      var intent=!retired && editor && editor.focusIntent && editor.focusIntent();
      if(!intent || intent.carrier || !intent.panel || editor.state().saving)return null;
      editor.rememberFocus(null);return intent.panel.slice();
    },
    destroy:function(){
      if(retired)return;if(editor && editor.rememberTrace)editor.rememberTrace(traceCarry());clearTraceFocus();on=false;paintLanes();retired=true;directTrace.destroy();logLookup.destroy();bindings.forEach(function(b){telemetryClearStep(b.el);telemetryClearTrace(b.el);b.el.querySelectorAll('.dv-proof-caption').forEach(function(el){el.remove();});});releaseColors();liveStatusControllers.delete(view);coverageRequest++;if(motion && motion.removeEventListener)motion.removeEventListener('change',motionChanged);releaseBindings();destroyListeners.splice(0).forEach(function(fn){try{fn();}catch(ex){}});close(false);if(poller)poller.stop();telemetry.destroy();telemetryClearCues(view);telemetryClearCards(view);if(demoDestroy)demoDestroy();
      if(frame)cancelAnimationFrame(frame);if(firstPaint)cancelAnimationFrame(firstPaint);frame=firstPaint=0;
      if(observer)observer.disconnect();
      bindings.forEach(function(binding){binding.el.removeEventListener('dv:pathrender',schedule);binding.el.removeEventListener('dv:pathchange',schedule);});bindings.forEach(function(binding){if(binding.section.diagram)liveStatusEdgeBreaks(binding.el,binding.section.diagram,{},false);});bindings=[];
      events.forEach(function(type){view.removeEventListener(type,schedule);});
      if(pop)pop.remove();listeners=[];
      view.querySelectorAll('.dv-live-board-lane').forEach(function(el){el.classList.remove('dv-live-board-lane');});
      view.querySelectorAll('.dv-live-step-tickets,.dv-live-caption').forEach(function(el){el.remove();});
      if(applied || availabilityOn || refs().tickets.length){
        clearTargets();view.querySelectorAll('.dv-live-halo,.dv-live-construction').forEach(function(el){el.remove();});
        view.querySelectorAll('[data-dv-node],[data-dv-edge]').forEach(function(el){if(el._livePulseEnd){el.removeEventListener('animationend',el._livePulseEnd);delete el._livePulseEnd;}});
        view.querySelectorAll('.dv-live-todo,.dv-live-active,.dv-live-testing,.dv-live-done,.dv-live-blocked,.dv-live-missing,.dv-live-unchanged,.dv-live-waiting,.dv-live-stale,.dv-live-changed,.dv-live-unavailable').forEach(function(el){liveStatusClass(el,null);liveStatusWaitingClass(el,null);liveStatusPreset(el,null);el.classList.remove('dv-live-stale','dv-live-changed','dv-live-unavailable','dv-live-reserved','dv-live-blueprint');});
      }
      if(renderOptions && renderOptions.loadDetail===wrappedLoad)renderOptions.loadDetail=originalLoad;
    }
  };
  var releaseColors=options.colorsPreview?function(){}:FlowStatusColors.connect(view,schedule);
  liveStatusControllers.set(view,api);
  // #1136: a board with no ticket or epic references after imports has no Jira view. It opens on Trace; the panel shows no switch.
  var statusAuto=!referencesAvailable();if(statusAuto)statusMode='trace';
  connectPanels();
  paint();events.forEach(function(type){view.addEventListener(type,schedule);});
  var metricFonts=view.ownerDocument && view.ownerDocument.fonts;
  function metricsFontsChanged(){if(!retired && (telemetry.enabled() || metricsPreview))schedule();}
  if(metricFonts && metricFonts.ready)metricFonts.ready.then(metricsFontsChanged);
  if(metricFonts && metricFonts.addEventListener){metricFonts.addEventListener('loadingdone',metricsFontsChanged);destroyListeners.push(function(){metricFonts.removeEventListener('loadingdone',metricsFontsChanged);});}
  // An edit re-renders the page: the new controller starts from the last live map so colors never reset.
  if(editor && editor.lastMap())api.apply(editor.lastMap());
  var carriedTrace=editor && editor.takeTrace && editor.takeTrace();if(carriedTrace){traceRestore(carriedTrace);paint();notify();}
  if(poller)firstPaint=requestAnimationFrame(function(){firstPaint=requestAnimationFrame(function(){firstPaint=0;poller.start();});});
  if(options.demo && typeof options.demo.mount==='function')demoDestroy=options.demo.mount(api);
  return api;
}
