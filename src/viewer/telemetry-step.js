/* Runtime step evidence. All identities are resolved within this source section
   and selected path; a duplicate step ID elsewhere is never consulted. */
function telemetryStepModel(diagram,index,pathId,page,snapshot,jiraMap,jiraOn){
  var step=(diagram.steps || [])[index];if(!step || !snapshot)return null;
  var direct=liveStatusStepCarriers(diagram,step,true),templates=telemetryTemplates()(page);
  var carriers=direct.map(function(c){var b=carrierTelemetry(c.value,templates);return {id:c.id,tickets:jiraOn?trackingRefs(c.value).tickets:[],kind:b && b.kind,signals:b?b.signals:{},proof:b?b.proof:{}};});
  var proof=proofVerdicts({carriers:carriers,jiraMap:jiraMap,telemetryMap:snapshot.map,steps:[{id:'current',carriers:carriers.map(function(c){return c.id;})}]});
  var measured=carriers.some(function(c){return telemetryMetricNames(c).some(function(n){return telemetryReading(snapshot.map[c.id],n).value!==null;});});
  // Primary is the first directly selected carrier in the existing carrier walk
  // (edges, then explicit nodes), not whichever happens to return a trace.
  var primary=direct[0],binding=primary && carrierTelemetry(primary.value,templates),sample=primary && snapshot.map[primary.id];
  var headline=binding?telemetryCardContent(primary.value,binding,sample,proof.carriers[primary.id],trackingTelemetry(page).window):null;
  var caption=measured?[proof.steps.current.label].concat(headline?[headline.headline].concat(headline.details.filter(function(v){return !/unobserved|not bound/.test(v);})):[]).filter(Boolean).join(' · '):'';
  return {caption:caption,verdict:proof.steps.current.verdict,primary:primary && primary.id};
}

function telemetryClearStep(scope){
  var state=scope._telemetryStep;if(!state)return;
  state.stepper.clearTraceTiming();state.card.remove();delete scope._telemetryStep;
}
function telemetryPaintStep(binding,snapshot,jiraMap,jiraOn){
  var scope=binding.el,stepper=binding.stepper,d=binding.section.diagram;
  scope.querySelectorAll('.dv-proof-caption').forEach(function(el){el.remove();});
  var model=stepper && stepper.mode()==='step' && trackingTelemetry(binding.page).enabled?telemetryStepModel(d,stepper.sourceIndex(),stepper.path(),binding.page,snapshot,jiraMap,jiraOn):null;
  var bar=scope.querySelector('.termbar'),host=bar && bar.querySelector('.step-text');
  if(model && model.caption && host){var caption=host.ownerDocument.createElement('span');caption.className='dv-proof-caption';caption.textContent=' · '+model.caption;caption.setAttribute('data-verdict',model.verdict || '');host.appendChild(caption);}
  // Trace evidence belongs to the Status panel, never to step navigation.
  telemetryClearStep(scope);
}

/* Read-only mapping for one selected trace and one exact source section/path.
   The controller owns selection and lifetime; this model never fetches. */
function telemetryTraceModel(diagram,pathId,exemplar){
  var mapping=null,warning='';
  try{
    if(!exemplar.spans.length)throw new Error('Trace timeline unavailable.');
    var normalized={spans:exemplar.spans.map(function(s){return {id:s.id,parentId:s.parentId,serviceName:s.service,operation:s.name,startMs:s.startMs,durationMs:s.ms,error:s.error,statusCode:s.attributes['http.response.status_code'] || s.attributes['http.status_code'],attributes:s.attributes,links:s.links.filter(function(l){return l.traceId===exemplar.traceId;}).map(function(l){return l.spanId;})};}),warnings:exemplar.warnings};
    mapping=FlowTraceMatch.mapTrace(diagram,normalized,diagram.paths && diagram.paths.length?pathId:undefined);
  }catch(ex){warning=ex.message;}
  var nodes=Object.create(null),edges=Object.create(null),rows=[];
  if(mapping)mapping.steps.forEach(function(match){
    var step=(diagram.steps || []).find(function(s){return s.id===match.stepId;}),selector=step.traceMatch || {},keys=stepDeliveredKeys(step);
    var exact=(diagram.edges || []).filter(function(e){return keys.indexOf(e.from+'->'+e.to)>=0 && (!match.nodeId || e.to===match.nodeId);});
    var duration=match.status==='matched'?Math.max.apply(null,match.spans.map(function(s){return s.durationMs;})):null;
    var kinds=match.conditions.map(function(c){return c.kind;}),tone=match.status!=='matched'?'unknown':kinds.some(function(k){return k==='service-error' || k==='delivery-failed';})?'error':kinds.some(function(k){return ['slow','database-slow','queue-buildup','backpressure'].indexOf(k)>=0;})?'warning':'observed';
    var label=match.status==='matched'?duration+' ms':match.status==='missing'?'Not observed':match.status==='ambiguous'?'Ambiguous':'Unmapped';
    var row={id:match.stepId,nodeId:match.nodeId,status:match.status,tone:tone,duration:duration,budget:selector.maxDurationMs,label:label,operation:selector.operation || step.text || step.id,detail:match.detail,conditions:match.conditions,spanIds:match.spans.map(function(s){return s.id;})};rows.push(row);
    // Only explicit stable node IDs and a uniquely delivered edge may annotate
    // the canvas. A service name or display title is never a join key.
    if(match.nodeId && diagram.nodes[match.nodeId]){if(!nodes[match.nodeId])nodes[match.nodeId]=[];nodes[match.nodeId].push(row);}
    if(match.status==='matched' && exact.length===1){var key=exact[0].from+'->'+exact[0].to;if(!edges[key])edges[key]=[];edges[key].push(row);}
  });
  // Multiple authored steps claiming one edge cannot supply one exact duration.
  Object.keys(edges).forEach(function(key){if(edges[key].length!==1)delete edges[key];});
  return {mapping:mapping,warning:warning,rows:rows,nodes:nodes,edges:edges};
}
function telemetryClearTrace(scope){
  scope.querySelectorAll('.dv-trace-overlay').forEach(function(el){el.remove();});
  scope.querySelectorAll('[data-trace-tone]').forEach(function(el){el.removeAttribute('data-trace-tone');el.removeAttribute('data-trace-status');});
}
function telemetryPaintTrace(binding,model){
  var scope=binding.el,d=binding.section.diagram;telemetryClearTrace(scope);if(!model)return;
  function mark(target,rows,x,y){
    var ranks={unknown:0,observed:1,warning:2,error:3},tone=rows.reduce(function(a,r){return ranks[r.tone]>ranks[a]?r.tone:a;},'unknown');
    target.setAttribute('data-trace-tone',tone);target.setAttribute('data-trace-status',rows.map(function(r){return r.status;}).join(' '));
    var doc=target.ownerDocument,g=doc.createElementNS('http://www.w3.org/2000/svg','g');g.setAttribute('class','dv-trace-overlay');g.setAttribute('data-tone',tone);g.setAttribute('pointer-events','none');
    var text=doc.createElementNS('http://www.w3.org/2000/svg','text');text.setAttribute('x',x);text.setAttribute('y',y);text.setAttribute('text-anchor','middle');var unknown=rows.filter(function(r){return r.status!=='matched';}).length;var label=rows.length===1?rows[0].label:rows.length+' operations'+(unknown?' · '+unknown+' unknown':' · max '+Math.max.apply(null,rows.map(function(r){return r.duration || 0;}))+' ms');text.textContent=label+(tone==='error'?' · error':tone==='warning'?' · warning':'');g.appendChild(text);
    var title=doc.createElementNS('http://www.w3.org/2000/svg','title');title.textContent=rows.map(function(r){return r.operation+': '+r.label+(r.budget!=null?' / '+r.budget+' ms budget':'')+' '+r.conditions.map(function(c){return c.label;}).join('; ');}).join(' · ');g.appendChild(title);
    var parent=target.matches('g.node')?target:target.closest('svg');parent.appendChild(g);
  }
  scope.querySelectorAll('g.node[data-dv-node]:not(.node-text)').forEach(function(node){var rows=model.nodes[node.getAttribute('data-dv-node')],card=node.querySelector('.card');if(!rows || !card)return;var box=card.getBBox();mark(node,rows,box.x+box.width/2,box.y+box.height-6);});
  scope.querySelectorAll('g.node.node-text[data-dv-node]').forEach(function(node){var rows=model.nodes[node.getAttribute('data-dv-node')];if(rows)node.setAttribute('data-trace-tone','observed');});
  scope.querySelectorAll('path.edge[data-dv-edge]').forEach(function(path){var edge=d.edges[Number(path.getAttribute('data-dv-edge'))],rows=edge && model.edges[edge.from+'->'+edge.to];if(!rows)return;var point=path.getPointAtLength(path.getTotalLength()/2);mark(path,rows,point.x,point.y-9);});
}
