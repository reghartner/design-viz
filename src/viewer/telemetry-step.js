/* Runtime step evidence. All identities are resolved within this source section
   and selected path; a duplicate step ID elsewhere is never consulted. */
function telemetryStepModel(diagram,index,pathId,page,snapshot,jiraMap,jiraOn){
  var step=(diagram.steps || [])[index];if(!step || !snapshot)return null;
  var direct=liveStatusStepCarriers(diagram,step,true),templates=telemetryTemplates()(page);
  var carriers=direct.map(function(c){var b=carrierTelemetry(c.value,templates);return {id:c.id,tickets:jiraOn?trackingRefs(c.value).tickets:[],kind:b && b.kind,signals:b?b.signals:{},proof:b?b.proof:{}};});
  var proof=proofVerdicts({carriers:carriers,jiraMap:jiraMap,telemetryMap:snapshot.map,steps:[{id:'current',carriers:carriers.map(function(c){return c.id;})}]});
  var measured=carriers.some(function(c){return Object.keys(c.signals).some(function(n){return telemetryReading(snapshot.map[c.id],n).value!==null;});});
  // Primary is the first directly selected carrier in the existing carrier walk
  // (edges, then explicit nodes), not whichever happens to return a trace.
  var primary=direct[0],binding=primary && carrierTelemetry(primary.value,templates),sample=primary && snapshot.map[primary.id];
  var headline=binding?telemetryCardContent(primary.value,binding,sample,proof.carriers[primary.id],trackingTelemetry(page).window):null;
  var caption=measured?[proof.steps.current.label].concat(headline?[headline.headline].concat(headline.details.filter(function(v){return !/unobserved|not bound/.test(v);})):[]).filter(Boolean).join(' · '):'';
  var exemplar=!snapshot.historical && sample && sample.exemplars && sample.exemplars[0],trace=null;
  if(exemplar){
    try{exemplar=telemetryTraceEnvelope(exemplar);}catch(ex){exemplar=null;}
    if(exemplar){
      var candidate=exemplar.candidates.find(function(c){return c.traceId===exemplar.traceId;}),times=exemplar.spans.map(function(s){return s.time;}).filter(Boolean).sort(function(a,b){return Date.parse(a)-Date.parse(b);});
      var panel={type:'trace',spans:exemplar.spans},data=tracePanelData(panel),mapping=null,warning='';
      try{
        if(data.errors.length)throw new Error('trace timeline unavailable');
        var normalized={spans:exemplar.spans.map(function(s){return {id:s.id,parentId:s.parentId,serviceName:s.service,operation:s.name,startMs:s.startMs,durationMs:s.ms,error:s.error,statusCode:s.attributes['http.response.status_code'] || s.attributes['http.status_code'],attributes:s.attributes,links:s.links.filter(function(l){return l.traceId===exemplar.traceId;}).map(function(l){return l.spanId;})};}),warnings:exemplar.warnings};
        var path=diagram.paths && diagram.paths.length?pathId:undefined;
        mapping=FlowTraceMatch.mapTrace(diagram,normalized,path);
      }catch(ex){warning='Exact mapping unavailable: '+ex.message;}
      var match=mapping && mapping.steps.find(function(s){return s.stepId===step.id;}),keys=stepDeliveredKeys(step),edges=(diagram.edges || []).filter(function(e){return keys.indexOf(e.from+'->'+e.to)>=0;});
      // A node selector can identify one receiving hop. Without it, only a
      // single delivered edge is unambiguous. No service/display-name joins.
      if(step.traceMatch && step.traceMatch.nodeId)edges=edges.filter(function(e){return e.to===step.traceMatch.nodeId;});
      var packets=!data.errors.length && match && match.status==='matched' && edges.length===1?match.spans.map(function(s){return {edge:edges[0].from+'->'+edges[0].to,startMs:s.startMs,ms:s.durationMs};}):[];
      trace={exemplar:exemplar,panel:panel,at:candidate && candidate.time || times[0] || null,mapping:mapping,warning:warning,packets:packets,
        never:mapping?mapping.steps.filter(function(s){return s.status==='missing' && !s.detail;}):[],primary:primary.id};
    }
  }
  return {caption:caption,verdict:proof.steps.current.verdict,primary:primary && primary.id,trace:trace};
}
function telemetryClearStep(scope){
  var state=scope._telemetryStep;if(!state)return;
  state.stepper.clearTraceTiming();state.card.remove();if(state.rail)state.rail.remove();delete scope._telemetryStep;
}
function telemetryPaintStep(binding,snapshot,jiraMap,jiraOn,api,pin){
  var scope=binding.el,stepper=binding.stepper,d=binding.section.diagram;
  scope.querySelectorAll('.dv-proof-caption').forEach(function(el){el.remove();});
  var model=stepper && stepper.mode()==='step' && trackingTelemetry(binding.page).enabled?telemetryStepModel(d,stepper.sourceIndex(),stepper.path(),binding.page,snapshot,jiraMap,jiraOn):null;
  var bar=scope.querySelector('.termbar'),host=bar && bar.querySelector('.step-text');
  if(model && model.caption && host){var caption=host.ownerDocument.createElement('span');caption.className='dv-proof-caption';caption.textContent=' · '+model.caption;caption.setAttribute('data-verdict',model.verdict || '');host.appendChild(caption);}
  var trace=model && model.trace;if(!trace || !bar){telemetryClearStep(scope);return;}
  var e=trace.exemplar,passing=e.candidates.find(function(c){return c.status==='passing' && c.traceId!==e.traceId && api.canChooseExemplar(trace.primary,e.selectionToken,c.traceId);});
  var key=JSON.stringify([stepper.sourceIndex(),stepper.path(),trace,!!passing]),old=scope._telemetryStep;
  // Section composition can hide/remount the panel without changing the trace.
  var slot=Array.from(scope.querySelectorAll('.dv-live-trace-slot')).find(function(node){return node.closest('.doc-sec')===bar.closest('.doc-sec') && node.getClientRects().length;});
  if(old && old.key===key && old.card.isConnected && (slot?old.card.parentNode===slot:old.rail))return;
  telemetryClearStep(scope);
  var doc=bar.ownerDocument,card=doc.createElement('details');card.className='dv-trace-evidence';card.setAttribute('aria-label','Trace evidence');card.setAttribute('data-trace-id',e.traceId);
  // Use this section's active Live status rail, never a nested detail's panel.
  var rail=null;if(!slot){rail=doc.createElement('aside');rail.className='panelcol dv-trace-rail';rail.setAttribute('aria-label','Trace evidence panel rail');scope.appendChild(rail);slot=rail;}
  slot.appendChild(card);
  scope._telemetryStep={key:key,card:card,stepper:stepper,rail:rail};
  var body;
  function el(tag,cls,text,parent){var node=doc.createElement(tag);node.className=cls || '';if(text)node.textContent=text;(parent || body || card).appendChild(node);return node;}
  el('summary','','Trace evidence',card);body=el('div','dv-trace-evidence-body',null,card);el('code','dv-trace-identity',e.traceId);
  var age=trace.at?Math.max(0,Math.floor((Date.now()-Date.parse(trace.at))/60000)):null;
  el('p','dv-trace-age',trace.at?'Observed '+trace.at+' · '+age+' min ago':'Trace age unavailable');
  el('p','dv-trace-selection',e.selectionReason+' · '+e.range.from+' – '+e.range.to);
  el('p','dv-trace-completeness','Completeness: '+e.completeness+'. '+(e.completeness==='complete'?'Reported complete by provider.':'Partial or unknown evidence cannot establish completeness.'));
  e.warnings.concat(trace.warning?[trace.warning]:[]).forEach(function(w){el('p','tr-notice',w);});
  var actions=el('div','dv-trace-actions'),notice=el('p','dv-trace-action-note');notice.setAttribute('role','status');
  function button(label,fn){var b=el('button','',label,actions);b.type='button';b.addEventListener('click',fn);return b;}
  var url=telemetryTraceUrl(e.url,e.provider);if(url){var link=el('a','','Open trace in '+(e.provider==='tempo'?'Grafana':'Honeycomb'),actions);link.href=url;link.target='_blank';link.rel='noopener noreferrer';}
  if(trace.packets.length)button('Play this trace',function(){var played=stepper.playTraceTiming(trace.packets);notice.textContent=played?'Temporary trace timing · navigation restores authored playback.':'Reduced motion: trace timing is shown without packet motion.';});
  else el('p','dv-trace-timing-unavailable','Precise packet timing unavailable: the current step needs uniquely matched, timed edges.');
  if(passing){var choose=button('Pick passing trace',async function(){choose.disabled=true;try{await api.chooseExemplar(trace.primary,e.selectionToken,passing.traceId);}catch(ex){if(card.isConnected){notice.textContent=ex.message;choose.disabled=false;}}});}
  button('Pin as evidence',function(){notice.textContent=pin(trace.primary,e)?'Pinned in this session’s Activity.':'Already pinned in this session’s Activity.';});
  var services=[];e.spans.forEach(function(s){if(services.indexOf(s.service)<0)services.push(s.service);});
  if(!services.length && e.warnings.indexOf('Trace timeline unavailable.')<0)el('p','tr-notice','Trace timeline unavailable.');
  services.forEach(function(service){var selected=e.spans.find(function(s){return s.service===service;}),body=el('div','dv-trace-timeline');body.innerHTML=tracePanelHTML(trace.panel,{selected:selected.id},[]);});
  trace.never.forEach(function(m){var row=el('div','dv-trace-never');row.setAttribute('data-step-id',m.stepId);el('b','','never · '+m.stepId,row);el('p','','absence here is one observed request, not proof that this never runs',row);});
  if(trace.mapping)trace.mapping.steps.filter(function(m){return m.status==='ambiguous' || m.status==='unmapped' || m.detail;}).forEach(function(m){el('p','tr-notice',m.stepId+': '+(m.detail || m.status)+' · precise timing unavailable.');});
}
