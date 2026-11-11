/* Text view of a step diagram (#1322). Pure and DOM-free: it reads the page the
   reader renders (topology imports already resolved by FlowTopology), never edits
   it, and turns it into text for reading and for line diffs.

   Uses at call time: normalize, specObject, sectionRecords (core/document.js);
   diagramPathList, diagramForPath, stepKeys, stepFailures, stepPanelPatch (core/paths.js);
   trackingStepCarriers, trackingRefs, trackingTicket, trackingExistsWhen,
   trackingStepFilter, trackingStepTicketFilter, trackingDependencies,
   carrierTelemetry, trackingTelemetry (core/tracking.js); storyTimeSequence,
   storyTimeLabel (core/story-time.js); isTextBoxNode (core/text-box.js);
   deltaDetails (validator.js); FlowCanon.codeUrl (canon.js); FlowTopology.origin
   (canon-topology.js).

   textViewModel(page) -> {title, multi, telemetry, settings, dependencies, logSearches, sections}
     page: a normalized page or a {page} spec, normally already resolved. An
       unresolved page (topologyImports without provenance) still renders: its
       imports are listed with their consumer overlays.
     multi: true when the page has more than one diagram section; renderers
       then qualify every line and heading with the section reference.
     telemetry: {window, environment, grafana, honeycomb, environments:{id:{variables}}, templates:{name:{params}}}
     settings: [[path, value]] every authored leaf of page.tracking except
       dependencies and telemetry.lookups (listed below), paths start `tracking.`.
     dependencies: [{ticket, on, reason?}] (trackingDependencies)
     logSearches: [{id, label, query, datasource, values, fields}] (tracking.telemetry.lookups)
     sections: [{reference, number, heading, tab, diagrams:[{imports, problems, elements, paths}]}]
       imports: [{as, spec, export, resolved, overlay:[[path, value]]}] (overlay only when unresolved)
       problems: ['edges[3]: …'] malformed entries, which are listed and otherwise skipped
       elements: [{kind:'node'|'edge', id, key, ordinal, title, sub, label, edgeKind, from, to,
                   origin:null|{spec, export, as}, tickets, ticketUrls:{key:url}, prs, use,
                   telemetryKind, signals:[{name, source, query, unit, scope?, label?, role?,
                   window?, missingMeansZero?, showOnCard?, links?, pass:null|{min?, max?, maxRatioOf?}}],
                   telemetryLinks, card, binding, codeRefs, delta, existsWhen:null|{value, active},
                   missingWork, link, fields:[[path, value]], steps:['<path>/<n>'],
                   edgesIn, edgesOut (nodes only), traceRules:[{step:'<path>/<n>', rule}]}]
         Nodes in authored key order, then edges in authored order. `key` is the
         flat owner id: edge ends escape `\`, `->` and `#`, and a repeated from->to
         edge gets `#<ordinal>`. `fields` holds every other authored field except
         the layout-only ones (TEXT_VIEW_LAYOUT). Queries are the expanded form
         (`use` templates applied); ${variables} stay as written.
       paths: [{id, label, basedOn, steps:[{n, id, text, time, at, link, touches:[{kind, id, ordinal?, missing?}],
                traceRules, conditions, ticketFilter:null|{keys, shown}, codeRefs,
                panels:[{id, patch}], panelVisibility:[{id, value}],
                failures:[{edge, mode}], delta, fields}]}]
         touches: the step's edges (step order, failed hops included) then its nodes,
         edge endpoints included. time is the authored step time; at is the story
         clock label when the diagram declares storyTime.
       codeRefs: [{id, label, repository, path, startLine, endLine, revision, anchor, purpose, url}]
       delta: null | {marked, text, links:[{label, url}]}

   textViewFlat(model) -> string. One fact per line, `<owner kind> <owner id> <key> <value>`
     (page lines have no owner id), single spaces, sorted by code unit, newline at end.
     Owner ids carry `<section>/` when model.multi; step owners are `<path>/<n>`;
     `\` and `/` inside section references and path ids are escaped.
     Newlines, tabs, carriage returns and backslashes inside values are escaped
     (\n \t \r \\), so one fact is always one line. Code references are keyed by
     id (else path:lines) and trace rules by their text, so inserting one does not
     renumber the others.
   textViewSteps(model, {queries:'names'|'full', pathId}) -> markdown (layout A).
     names (default) shows `name (source) unit u · pass ...`; full adds every query
     field. pathId picks that path in each diagram that has it, else its first path.
   textViewElements(model) -> markdown (layout B): an index table, then one sheet per
     element with every query written once.
   Markdown keeps multi-line queries exact in fenced blocks. */

/* Fields that only place or paint an element; every other authored field is shown. */
var TEXT_VIEW_LAYOUT=['fromPort','toPort','curveControls','curvePoints','coinOffsets','color','tint','icon','presentation',
  'textStyle','tone','x','y','w','h','width','height','position','labelOffset','labelPosition'];
var TEXT_VIEW_NODE_FIELDS=['title','sub','label','tickets','prs','telemetry','binding','codeRefs','delta','deltaText','deltaLinks','existsWhen','missingWork','link'];
var TEXT_VIEW_EDGE_FIELDS=['from','to','title','label','kind','tickets','prs','telemetry','codeRefs','delta','deltaText','deltaLinks','existsWhen','missingWork','link'];
var TEXT_VIEW_STEP_FIELDS=['id','text','time','edge','edges','nodes','failures','panels','patch','panelVisibility','traceMatch','conditions','codeRefs',
  'delta','deltaText','deltaLinks','link','ticketFilter'];
var TEXT_VIEW_IMPORT_LAYOUT=['position','nodePositions'];

function textViewOwn(o,k){return !!o && Object.prototype.hasOwnProperty.call(o,k);}
function textViewClone(v){return v==null?v:JSON.parse(JSON.stringify(v));}
function textViewStable(v){
  if(Array.isArray(v))return '['+v.map(textViewStable).join(',')+']';
  if(v && typeof v==='object')return '{'+Object.keys(v).sort().map(function(k){return JSON.stringify(k)+':'+textViewStable(v[k]);}).join(',')+'}';
  return JSON.stringify(v);
}
/* Leaves of a structured value as [path, value]: keys sorted, arrays of scalars
   repeat their key, arrays of objects are indexed. */
function textViewLeaves(value,prefix,out){
  out=out || [];
  if(Array.isArray(value)){
    if(value.every(function(v){return v===null || typeof v!=='object';}))value.forEach(function(v){out.push([prefix,v]);});
    else value.forEach(function(v,i){textViewLeaves(v,prefix+'['+i+']',out);});
  }else if(value && typeof value==='object')Object.keys(value).sort().forEach(function(k){textViewLeaves(value[k],prefix?prefix+'.'+k:k,out);});
  else out.push([prefix,value]);
  return out;
}
function textViewOtherFields(value,handled){
  var out=[];
  Object.keys(value).sort().forEach(function(k){
    if(handled.indexOf(k)<0 && TEXT_VIEW_LAYOUT.indexOf(k)<0)textViewLeaves(value[k],k,out);
  });
  return out;
}
function textViewCodeRef(ref){
  var url=typeof FlowCanon!=='undefined'?FlowCanon.codeUrl(ref):null,out={};
  ['id','label','repository','path','startLine','endLine','revision','purpose'].forEach(function(k){out[k]=textViewOwn(ref,k)?ref[k]:null;});
  out.anchor=specObject(ref.anchor)?{start:ref.anchor.start==null?null:ref.anchor.start,end:ref.anchor.end==null?null:ref.anchor.end}:null;
  out.url=url;return out;
}
function textViewCodeRefs(value){return (value && Array.isArray(value.codeRefs)?value.codeRefs:[]).filter(specObject).map(textViewCodeRef);}
function textViewDelta(value){
  var details=deltaDetails(value),marked=!!value && value.delta===true;
  if(!marked && !details.text && !details.links.length)return null;
  return {marked:marked,text:details.text || null,links:details.links};
}
function textViewSignals(binding){
  if(!binding)return [];
  return Object.keys(binding.signals).map(function(name){
    var s=binding.signals[name],out={name:name,source:s.source,query:textViewClone(s.query),unit:s.unit};
    ['scope','label','role','window','missingMeansZero','showOnCard','links'].forEach(function(k){if(textViewOwn(s,k))out[k]=textViewClone(s[k]);});
    out.pass=textViewOwn(binding.proof,name)?textViewClone(binding.proof[name]):null;
    return out;
  });
}
function textViewOrigin(d,kind,id){
  var imp=typeof FlowTopology!=='undefined'?FlowTopology.origin(d,kind,id):null;
  return imp?{spec:imp.spec,export:imp.export,as:imp.as}:null;
}
function textViewEnd(id){return String(id).replace(/\\/g,'\\\\').replace(/->/g,'-\\>').replace(/#/g,'\\#');}
function textViewPart(id){return String(id).replace(/\\/g,'\\\\').replace(/\//g,'\\/');}
function textViewCarrier(d,kind,id,value,templates,ordinal){
  var refs=trackingRefs(value),binding=carrierTelemetry(value,templates),raw=value.telemetry,urls={};
  (Array.isArray(value.tickets)?value.tickets:[]).forEach(function(t){var ticket=trackingTicket(t);if(ticket && ticket.url && !urls[ticket.key])urls[ticket.key]=ticket.url;});
  var out={kind:kind,id:id,key:kind==='edge'?textViewEnd(value.from)+'->'+textViewEnd(value.to)+(ordinal>1?'#'+ordinal:''):String(id),ordinal:ordinal,
    title:typeof value.title==='string'?value.title:null,sub:typeof value.sub==='string'?value.sub:null,
    label:typeof value.label==='string'?value.label:null,edgeKind:kind==='edge' && typeof value.kind==='string'?value.kind:null,
    from:kind==='edge'?value.from:null,to:kind==='edge'?value.to:null,origin:textViewOrigin(d,kind==='node'?'nodes':'edges',id),
    tickets:refs.tickets,ticketUrls:urls,prs:refs.prs,use:specObject(raw) && typeof raw.use==='string'?raw.use:null,
    telemetryKind:binding?binding.kind:null,signals:textViewSignals(binding),telemetryLinks:binding?textViewClone(binding.links):{},
    card:binding && binding.card?textViewClone(binding.card):null,
    binding:kind==='node' && specObject(value.binding)?textViewClone(value.binding):null,codeRefs:textViewCodeRefs(value),
    delta:textViewDelta(value),
    existsWhen:typeof value.existsWhen==='string'?{value:value.existsWhen,active:trackingExistsWhen(value)===value.existsWhen}:null,
    missingWork:value.missingWork===true,link:typeof value.link==='string'?value.link:null,
    fields:textViewOtherFields(value,kind==='node'?TEXT_VIEW_NODE_FIELDS:TEXT_VIEW_EDGE_FIELDS),
    steps:[],traceRules:[]};
  if(kind==='node'){
    out.edgesIn=[];out.edgesOut=[];
    (d.edges || []).forEach(function(e){var key=e.from+'->'+e.to;if(e.to===id)out.edgesIn.push(key);if(e.from===id)out.edgesOut.push(key);});
  }
  return out;
}
function textViewStep(d,page,st,n,story,index,elementOf){
  var keys=stepKeys(st).concat(Object.keys(stepFailures(st))),carriers=trackingStepCarriers(d,st,false);
  var edges=carriers.filter(function(c){return !(textViewOwn(d.nodes,c.id) && d.nodes[c.id]===c.value);});
  var nodes=carriers.filter(function(c){return edges.indexOf(c)<0;});
  edges.sort(function(a,b){return keys.indexOf(a.id)-keys.indexOf(b.id);});
  var patch=stepPanelPatch(st),failures=stepFailures(st),visibility=specObject(st.panelVisibility)?st.panelVisibility:{};
  var time=typeof st.time==='string'?st.time:null,filter=trackingStepFilter(st);
  // Ids the step names that this diagram does not hold (an unresolved import, a typo).
  var missing=keys.filter(function(k,i){return keys.indexOf(k)===i && !edges.some(function(c){return c.id===k;});}).map(function(k){return {kind:'edge',id:k,missing:true};})
    .concat(stepNodes(st).filter(function(id,i){return stepNodes(st).indexOf(id)===i && !textViewOwn(d.nodes,id);}).map(function(id){return {kind:'node',id:id,missing:true};}));
  function touch(kind){return function(c){var el=elementOf(c.value),out={kind:kind,id:c.id};if(el && el.ordinal>1)out.ordinal=el.ordinal;return out;};}
  return {n:n,id:typeof st.id==='string'?st.id:null,text:typeof st.text==='string'?st.text:'',time:time,
    at:time!=null && story && story.times[index]!=null?storyTimeLabel(story.times[index],story.config):null,
    link:typeof st.link==='string'?st.link:null,
    touches:edges.map(touch('edge')).concat(missing.filter(function(t){return t.kind==='edge';}),nodes.map(touch('node')),missing.filter(function(t){return t.kind==='node';})),
    traceRules:[].concat(st.traceMatch || []).filter(specObject).map(textViewClone),
    conditions:(Array.isArray(st.conditions)?st.conditions:[]).filter(specObject).map(textViewClone),
    ticketFilter:filter?{keys:filter,shown:trackingStepTicketFilter(d,st,page) || []}:null,
    codeRefs:textViewCodeRefs(st),
    panels:Object.keys(patch || {}).map(function(id){return {id:id,patch:textViewClone(patch[id])};}),
    panelVisibility:Object.keys(visibility).map(function(id){return {id:id,value:textViewClone(visibility[id])};}),
    failures:Object.keys(failures).map(function(edge){return {edge:edge,mode:failures[edge]};}),
    delta:textViewDelta(st),fields:textViewOtherFields(st,TEXT_VIEW_STEP_FIELDS)};
}
function textViewTouched(elements,t){return elements.filter(function(e){return e.kind===t.kind && e.id===t.id && e.ordinal===(t.ordinal || 1);})[0] || null;}
function textViewImports(d){
  // A resolved diagram keeps its provenance (nested imports included); an unresolved
  // one only its authored topologyImports, listed with their consumer overlays.
  var provenance=((d.topologyProvenance || {}).imports || []).filter(specObject),out=provenance.map(function(imp){
    return {as:String(imp.as),spec:String(imp.spec),export:[].concat(imp.export).join(','),resolved:true,overlay:[]};
  });
  (Array.isArray(d.topologyImports)?d.topologyImports:[]).filter(specObject).forEach(function(imp){
    if(provenance.some(function(p){return p.as===imp.as;}))return;
    var overlay=[];
    Object.keys(imp).sort().forEach(function(k){
      if(['spec','export','as'].indexOf(k)<0 && TEXT_VIEW_IMPORT_LAYOUT.indexOf(k)<0)textViewLeaves(imp[k],k,overlay);
    });
    out.push({as:String(imp.as),spec:String(imp.spec),export:[].concat(imp.export).join(','),resolved:false,overlay:overlay});
  });
  return out;
}
function textViewDiagram(raw,page,templates){
  var problems=[],nodes={},edges=[],steps=[];
  Object.keys(specObject(raw.nodes)?raw.nodes:{}).forEach(function(id){
    if(specObject(raw.nodes[id]))Object.defineProperty(nodes,id,{value:raw.nodes[id],enumerable:true,writable:true,configurable:true});
    else problems.push('nodes.'+id+': expected an object '+textViewStable(raw.nodes[id]));
  });
  (Array.isArray(raw.edges)?raw.edges:[]).forEach(function(e,i){
    if(specObject(e) && typeof e.from==='string' && e.from && typeof e.to==='string' && e.to)edges.push(e);
    else problems.push('edges['+i+']: expected an object with from and to '+textViewStable(e===undefined?null:e));
  });
  (Array.isArray(raw.steps)?raw.steps:[]).forEach(function(st,i){
    if(specObject(st))steps.push(st);else problems.push('steps['+i+']: expected an object '+textViewStable(st===undefined?null:st));
  });
  var d=Object.assign({},raw,{nodes:nodes,edges:edges,steps:steps});
  if(Array.isArray(raw.paths))d.paths=raw.paths;
  var elements=[],values=[],byKey=Object.create(null),seen=Object.create(null);
  function elementOf(value){var i=values.indexOf(value);return i<0?null:elements[i];}
  Object.keys(nodes).forEach(function(id){
    var el=textViewCarrier(d,'node',id,nodes[id],templates,1);elements.push(el);values.push(nodes[id]);byKey['node '+id]=el;
  });
  edges.forEach(function(edge){
    var id=edge.from+'->'+edge.to;seen[id]=(seen[id] || 0)+1;
    var el=textViewCarrier(d,'edge',id,edge,templates,seen[id]);elements.push(el);values.push(edge);
  });
  var paths=(steps.length?diagramPathList(d):[]).map(function(p){
    var projected=diagramForPath(d,p.id),story=storyTimeSequence(projected);
    var list=projected.steps.map(function(st,i){return textViewStep(d,page,st,i+1,story,i,elementOf);});
    list.forEach(function(step){
      var ref=p.id+'/'+step.n;
      step.touches.forEach(function(t){
        var el=textViewTouched(elements,t);
        if(el && el.steps.indexOf(ref)<0)el.steps.push(ref);
      });
      step.traceRules.forEach(function(rule){var el=typeof rule.nodeId==='string'?byKey['node '+rule.nodeId]:null;if(el)el.traceRules.push({step:ref,rule:rule});});
    });
    return {id:p.id,label:p.label,basedOn:p.basedOn || null,steps:list};
  });
  return {imports:textViewImports(raw),problems:problems,elements:elements,paths:paths};
}
function textViewModel(input){
  var page=normalize(input) || input,telemetry=trackingTelemetry(page),templates=telemetry.templates;
  var records=sectionRecords(page).filter(function(r){return specObject(r.section) && specObject(r.section.diagram);});
  var environments={};
  Object.keys(telemetry.environments || {}).forEach(function(id){environments[id]={variables:textViewClone(telemetry.environments[id].variables || {})};});
  var lookups=telemetry.lookups || {},tracking=specObject(page.tracking)?textViewClone(page.tracking):{};
  delete tracking.dependencies;
  if(specObject(tracking.telemetry))delete tracking.telemetry.lookups;
  return {
    title:page && typeof page.title==='string'?page.title:'',
    multi:records.length>1,
    telemetry:{window:telemetry.window,environment:telemetry.environment || null,grafana:textViewClone(telemetry.grafana),
      honeycomb:textViewClone(telemetry.honeycomb),environments:environments,
      templates:Object.keys(templates).reduce(function(out,name){out[name]={params:templates[name].params.slice()};return out;},{})},
    settings:textViewLeaves(tracking,'tracking').filter(function(leaf){return leaf[0]!=='tracking';}),
    dependencies:trackingDependencies(page),
    logSearches:Object.keys(lookups).sort().map(function(id){
      var l=lookups[id];return {id:id,label:l.label,query:l.query,datasource:l.datasource || null,values:(l.values || []).slice(),fields:textViewClone(l.fields)};
    }),
    sections:records.map(function(r){
      var s=r.section;
      return {reference:r.reference,number:r.number,heading:typeof s.heading==='string'?s.heading:typeof s.title==='string'?s.title:'',
        tab:r.tabLabel || null,diagrams:[textViewDiagram(s.diagram,page,templates)]};
    })
  };
}

/* ---- shared text helpers ---- */
function textViewPass(rule){
  if(!rule)return '';
  var parts=[];
  if(textViewOwn(rule,'min'))parts.push('min '+rule.min);
  if(textViewOwn(rule,'max'))parts.push('max '+rule.max+(rule.maxRatioOf?' ratio of '+rule.maxRatioOf:''));
  return parts.join(', ');
}
function textViewLines(ref){return ref.startLine?ref.startLine+(ref.endLine?'-'+ref.endLine:''):null;}
function textViewOriginText(o){return o.spec+' '+[].concat(o.export).join(',')+' as '+o.as;}
function textViewRuleText(rule){
  var head=[rule.serviceName,rule.operation].filter(function(v){return v!=null && v!=='';}).join(' '),rest=[];
  Object.keys(rule).sort().forEach(function(k){
    if(k==='serviceName' || k==='operation')return;
    rest.push(k+' '+(rule[k] && typeof rule[k]==='object'?textViewStable(rule[k]):rule[k]));
  });
  return head+(rest.length?' · '+rest.join(' · '):'');
}
function textViewConditionText(c){
  var rest=Object.keys(c).sort().filter(function(k){return k!=='kind' && k!=='label';}).map(function(k){return k+' '+(c[k] && typeof c[k]==='object'?textViewStable(c[k]):c[k]);});
  return [c.kind,c.label].filter(function(v){return v!=null && v!=='';}).join(' ')+(rest.length?' · '+rest.join(' · '):'');
}
/* Identity of each code reference in its list: its id, else path:lines; a true
   duplicate takes #<n>. */
function textViewRefKeys(refs){
  var seen=Object.create(null);
  return refs.map(function(ref){
    var base=ref.id || ((ref.path || 'code')+(textViewLines(ref)?':'+textViewLines(ref):''));
    seen[base]=(seen[base] || 0)+1;return seen[base]>1?base+'#'+seen[base]:base;
  });
}

/* ---- layout C: flat lines ---- */
function textViewEscape(v){
  return String(v).replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/\r/g,'\\r').replace(/\t/g,'\\t')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u2028\u2029]/g,function(c){return '\\u'+('000'+c.charCodeAt(0).toString(16)).slice(-4);});
}
function textViewToken(v){return textViewEscape(v).replace(/ /g,'\\u0020');}
function textViewOwnerToken(v){return textViewEscape(v).replace(/\\\\/g,'\\').replace(/ /g,'\\u0020');}
function textViewFlat(model){
  var out=[];
  // Owner ids and touch targets arrive already escaped (textViewPart, textViewEnd);
  // only their line breaks and spaces are escaped here.
  function add(kind,owner,key,value,escaped){
    var line=kind+(owner==null?'':' '+textViewOwnerToken(owner))+' '+textViewToken(key);
    if(value!=null && value!=='')line+=' '+(escaped?textViewOwnerToken(value).replace(/\\u0020/g,' '):textViewEscape(value));
    out.push(line);
  }
  function leaves(kind,owner,prefix,list){list.forEach(function(leaf){add(kind,owner,prefix+leaf[0],leaf[1]);});}
  function codeRefs(kind,owner,refs){
    var keys=textViewRefKeys(refs);
    refs.forEach(function(ref,i){
      var at='code.'+keys[i]+'.';
      ['id','label','repository','path','revision','purpose','url'].forEach(function(k){if(ref[k]!=null)add(kind,owner,at+k,ref[k]);});
      if(textViewLines(ref))add(kind,owner,at+'lines',textViewLines(ref));
      if(ref.anchor){if(ref.anchor.start!=null)add(kind,owner,at+'anchor.start',ref.anchor.start);if(ref.anchor.end!=null)add(kind,owner,at+'anchor.end',ref.anchor.end);}
    });
  }
  function delta(kind,owner,d){
    if(!d)return;
    if(d.marked)add(kind,owner,'delta','true');
    if(d.text)add(kind,owner,'delta.text',d.text);
    d.links.forEach(function(l){add(kind,owner,'delta.link',l.url+' '+l.label);});
  }
  function counted(kind,owner,key,texts){
    var seen=Object.create(null);
    texts.forEach(function(text){seen[text]=(seen[text] || 0)+1;add(kind,owner,key,text+(seen[text]>1?' #'+seen[text]:''));});
  }
  if(model.title)add('page',null,'title',model.title);
  model.settings.forEach(function(leaf){add('page',null,leaf[0],leaf[1]);});
  model.dependencies.forEach(function(dep){add('page',null,'dependency',dep.ticket+' on '+dep.on+(dep.reason?' — '+dep.reason:''));});
  model.logSearches.forEach(function(l){
    var at='logsearch.'+l.id+'.';
    add('page',null,at+'label',l.label);
    add('page',null,at+'query',(l.datasource || 'loki')+' '+l.query);
    l.values.forEach(function(v){add('page',null,at+'value',v);});
    Object.keys(l.fields || {}).forEach(function(k){add('page',null,at+'fields.'+k,l.fields[k]);});
  });
  model.sections.forEach(function(sec){
    var prefix=model.multi?textViewPart(sec.reference)+'/':'',ref=textViewPart(sec.reference);
    if(sec.heading)add('section',ref,'heading',sec.heading);
    if(sec.tab)add('section',ref,'tab',sec.tab);
    sec.diagrams.forEach(function(d){
      d.imports.forEach(function(imp){
        add('section',ref,'import',imp.as+' '+imp.spec+' '+imp.export+(imp.resolved?'':' unresolved'));
        leaves('section',ref,'import.'+imp.as+'.',imp.overlay);
      });
      d.problems.forEach(function(p){add('section',ref,'problem',p);});
      d.elements.forEach(function(el){
        var owner=prefix+el.key,kind=el.kind;
        add(kind,owner,'origin',el.origin?'imported '+textViewOriginText(el.origin):'local');
        ['title','sub','label','link'].forEach(function(k){if(el[k])add(kind,owner,k,el[k]);});
        if(el.edgeKind)add(kind,owner,'kind',el.edgeKind);
        el.tickets.forEach(function(k){add(kind,owner,'ticket',k+(el.ticketUrls[k]?' '+el.ticketUrls[k]:''));});
        el.prs.forEach(function(u){add(kind,owner,'pr',u);});
        if(el.existsWhen)add(kind,owner,'existsWhen',el.existsWhen.value+(el.existsWhen.active?'':' (inactive: needs a valid ticket)'));
        if(el.missingWork)add(kind,owner,'missingWork','true');
        if(el.telemetryKind)add(kind,owner,'telemetry.kind',el.telemetryKind);
        if(el.use)add(kind,owner,'telemetry.use',el.use);
        Object.keys(el.telemetryLinks).forEach(function(k){add(kind,owner,'telemetry.link.'+k,el.telemetryLinks[k]);});
        if(el.card)leaves(kind,owner,'telemetry.card.',textViewLeaves(el.card,''));
        el.signals.forEach(function(s){
          var at='metric.'+s.name+'.';
          if(typeof s.query==='string')add(kind,owner,at+'query',s.source+' '+s.query);
          else{add(kind,owner,at+'source',s.source);leaves(kind,owner,at+'query.',textViewLeaves(s.query,''));}
          if(s.unit!=null)add(kind,owner,at+'unit',s.unit);
          ['scope','label','role','window','missingMeansZero','showOnCard'].forEach(function(k){if(textViewOwn(s,k))add(kind,owner,at+k,s[k]);});
          if(s.links)leaves(kind,owner,at+'links.',textViewLeaves(s.links,''));
          if(s.pass)add(kind,owner,at+'pass',textViewPass(s.pass));
        });
        if(el.binding)leaves(kind,owner,'binding.',textViewLeaves(el.binding,''));
        codeRefs(kind,owner,el.codeRefs);
        delta(kind,owner,el.delta);
        leaves(kind,owner,'',el.fields);
      });
      d.paths.forEach(function(p){
        var pathOwner=prefix+textViewPart(p.id);
        add('path',pathOwner,'label',p.label);
        if(p.basedOn)add('path',pathOwner,'basedOn',p.basedOn);
        p.steps.forEach(function(st){
          var owner=pathOwner+'/'+st.n;
          if(st.id)add('step',owner,'id',st.id);
          add('step',owner,'text',st.text);
          if(st.time)add('step',owner,'time',st.time);
          if(st.at)add('step',owner,'at',st.at);
          if(st.link)add('step',owner,'link',st.link);
          st.touches.forEach(function(x){var el=textViewTouched(d.elements,x);add('step',owner,'touches',x.kind+' '+(el?el.key:x.id)+(x.missing?' (not in this diagram)':''),true);});
          counted('step',owner,'trace',st.traceRules.map(textViewRuleText));
          counted('step',owner,'condition',st.conditions.map(textViewConditionText));
          if(st.ticketFilter){
            st.ticketFilter.keys.forEach(function(k){add('step',owner,'ticketFilter',k+(st.ticketFilter.shown.indexOf(k)<0?' (not lit, ignored)':''));});
          }
          codeRefs('step',owner,st.codeRefs);
          st.panels.forEach(function(x){add('step',owner,'panel.'+x.id,textViewStable(x.patch));});
          st.panelVisibility.forEach(function(x){add('step',owner,'panelVisibility.'+x.id,textViewStable(x.value));});
          st.failures.forEach(function(f){add('step',owner,'failure',f.edge+' '+f.mode);});
          delta('step',owner,st.delta);
          leaves('step',owner,'',st.fields);
        });
      });
    });
  });
  out.sort(function(a,b){return a<b?-1:a>b?1:0;});
  return out.filter(function(line,i){return !i || line!==out[i-1];}).join('\n')+(out.length?'\n':'');
}

/* ---- markdown helpers ---- */
function textViewFence(s,min){
  var n=min;(String(s).match(/`+/g) || []).forEach(function(r){if(r.length>=n)n=r.length+1;});
  return new Array(n+1).join('`');
}
function textViewCode(v){
  var s=String(v).replace(/\r?\n/g,' '),fence=textViewFence(s,1),pad=/^`|`$/.test(s) || fence.length>1?' ':'';
  return fence+pad+s+pad+fence;
}
/* One labelled value as a bullet; a multi-line value is kept exact in a fenced block. */
function textViewValue(indent,label,v){
  var s=String(v);
  if(!/\n/.test(s))return [indent+'- '+label+': '+textViewCode(s)];
  var fence=textViewFence(s,3);
  return [indent+'- '+label+':',indent+'  '+fence].concat(s.replace(/\r\n/g,'\n').split('\n').map(function(line){return indent+'  '+line;})).concat([indent+'  '+fence]);
}
function textViewCell(v){return String(v==null?'':v).replace(/\|/g,'\\|').replace(/\r?\n/g,' ');}
function textViewOneLine(v){return String(v).replace(/\r?\n/g,' ');}
function textViewSectionTitle(model,sec){
  var title=sec.heading || sec.reference;
  return title+(model.multi?' (section '+sec.reference+(sec.tab?', tab '+sec.tab:'')+')':'');
}
function textViewSignalName(s){
  return s.name+' ('+s.source+')'+(s.unit!=null?' unit '+s.unit:'')+(s.pass?' · pass '+textViewPass(s.pass):'');
}
function textViewSignalMeta(s){
  var bits=[];
  ['scope','label','role','window','missingMeansZero','showOnCard'].forEach(function(k){if(textViewOwn(s,k))bits.push(k+' '+s[k]);});
  if(s.links)textViewLeaves(s.links,'').forEach(function(leaf){bits.push('link '+leaf[0]+' '+leaf[1]);});
  return bits;
}
function textViewQueryLines(s,indent){
  if(typeof s.query==='string')return textViewValue(indent,'query',s.query);
  var out=[];textViewLeaves(s.query,'').forEach(function(leaf){out.push.apply(out,textViewValue(indent,leaf[0],leaf[1]));});return out;
}
function textViewRefText(ref){
  var where=(ref.path || '')+(textViewLines(ref)?':'+textViewLines(ref):'');
  return (ref.id || ref.label || 'code')+' '+where+(ref.revision?' @'+String(ref.revision).slice(0,12):'')+(ref.purpose?' — '+ref.purpose:'');
}
function textViewElementName(el){return el.id+(el.ordinal>1?' #'+el.ordinal:'');}
function textViewElementHead(el){
  var name=el.title || el.label;
  return el.kind+' `'+textViewElementName(el)+'`'+(name?' '+textViewOneLine(name):'')+(el.origin?' · imported ('+textViewOriginText(el.origin)+')':'');
}
function textViewImportText(imp){return '`'+imp.as+'` from '+imp.spec+' export '+imp.export+(imp.resolved?'':' (not resolved)');}
function textViewStatusBits(el){
  var bits=[];
  if(el.existsWhen)bits.push('exists when '+el.existsWhen.value+(el.existsWhen.active?'':' (inactive)'));
  if(el.missingWork)bits.push('missing work');
  return bits;
}
function textViewPageBlock(model,full){
  var out=[];
  if(model.settings.length || model.dependencies.length){
    out.push('## Page settings','');
    model.settings.forEach(function(leaf){out.push('- '+leaf[0]+': '+textViewCode(leaf[1]));});
    model.dependencies.forEach(function(dep){out.push('- dependency '+dep.ticket+' on '+dep.on+(dep.reason?' — '+dep.reason:''));});
    out.push('');
  }
  if(model.logSearches.length){
    out.push('## Log searches','');
    model.logSearches.forEach(function(l){
      out.push('- `'+l.id+'` '+l.label+' ('+(l.datasource || 'loki')+')'+(l.values.length?' · values '+l.values.join(', '):''));
      if(full){
        out.push.apply(out,textViewValue('  ','query',l.query));
        Object.keys(l.fields || {}).forEach(function(k){out.push('  - fields.'+k+': '+l.fields[k]);});
      }
    });
    out.push('');
  }
  return out;
}
function textViewDiagramHead(model,sec,d){
  var out=['## '+textViewSectionTitle(model,sec),''];
  if(d.imports.length)out.push('Imports: '+d.imports.map(textViewImportText).join('; '),'');
  d.problems.forEach(function(p){out.push('- problem: '+textViewOneLine(p));});
  if(d.problems.length)out.push('');
  return out;
}

/* ---- layout A: steps ---- */
function textViewSteps(model,options){
  options=options || {};
  var full=options.queries==='full',out=['# '+(model.title || 'Untitled')+' — steps',''];
  model.sections.forEach(function(sec){
    sec.diagrams.forEach(function(d){
      out.push.apply(out,textViewDiagramHead(model,sec,d));
      if(!d.paths.length){out.push('_No steps._','');return;}
      var path=d.paths.filter(function(p){return p.id===options.pathId;})[0] || d.paths[0];
      out.push('Path: '+path.label+' (`'+path.id+'`)'+(d.paths.length>1?' · other paths: '+d.paths.filter(function(p){return p!==path;}).map(function(p){return p.label+' (`'+p.id+'`)';}).join(', '):''),'');
      path.steps.forEach(function(st){
        var when=st.time?' · '+st.time+(st.at?' ('+st.at+')':''):'';
        out.push('### '+st.n+'.'+(st.id?' `'+st.id+'`':'')+when+(st.delta && st.delta.marked?' · changed':''),'');
        if(st.text)out.push(st.text,'');
        st.touches.forEach(function(t){
          var el=textViewTouched(d.elements,t);if(!el){out.push('- '+t.kind+' `'+t.id+'` (not in this diagram)');return;}
          var bits=[textViewElementHead(el)];
          if(el.tickets.length)bits.push('tickets '+el.tickets.join(', '));
          bits=bits.concat(textViewStatusBits(el));
          if(el.delta && el.delta.marked)bits.push('changed');
          out.push('- '+bits.join(' · '));
          el.signals.forEach(function(s){
            out.push('  - metric '+textViewSignalName(s)+(full?textViewSignalMeta(s).map(function(b){return ' · '+b;}).join(''):''));
            if(full)out.push.apply(out,textViewQueryLines(s,'    '));
          });
          if(el.binding && el.binding.entityRef)out.push('  - binding '+el.binding.entityRef);
          if(el.link)out.push('  - link '+el.link);
          el.codeRefs.forEach(function(ref){out.push('  - code '+textViewRefText(ref));});
          if(el.delta && el.delta.text)out.push('  - delta '+textViewOneLine(el.delta.text));
        });
        if(st.link)out.push('- link '+st.link);
        st.traceRules.forEach(function(rule){out.push('- trace match: '+textViewRuleText(rule));});
        st.conditions.forEach(function(c){out.push('- condition: '+textViewConditionText(c));});
        if(st.ticketFilter)out.push('- ticket filter: '+st.ticketFilter.keys.join(', ')+(st.ticketFilter.shown.length<st.ticketFilter.keys.length?' (shown: '+(st.ticketFilter.shown.join(', ') || 'all tickets')+')':''));
        st.codeRefs.forEach(function(ref){out.push('- code '+textViewRefText(ref));});
        st.panels.forEach(function(x){out.push('- panel '+x.id+': '+textViewCode(textViewStable(x.patch)));});
        st.panelVisibility.forEach(function(x){out.push('- panel '+x.id+' visibility: '+textViewCode(textViewStable(x.value)));});
        st.failures.forEach(function(f){out.push('- failure `'+f.edge+'` '+f.mode);});
        if(st.delta && st.delta.text)out.push('- delta '+textViewOneLine(st.delta.text));
        if(st.delta)st.delta.links.forEach(function(l){out.push('- delta link '+l.label+': '+l.url);});
        st.fields.forEach(function(leaf){out.push('- '+leaf[0]+': '+textViewCode(leaf[1]));});
        out.push('');
      });
    });
  });
  return out.concat(textViewPageBlock(model,full)).join('\n');
}

/* ---- layout B: elements ---- */
function textViewElements(model){
  var out=['# '+(model.title || 'Untitled')+' — elements',''];
  model.sections.forEach(function(sec){
    sec.diagrams.forEach(function(d){
      out.push.apply(out,textViewDiagramHead(model,sec,d));
      if(!d.elements.length){out.push('_No elements._','');return;}
      out.push('| Element | Kind | Metrics | Trace rules | Tickets | Code refs | Steps |','|---|---|---|---|---|---|---|');
      d.elements.forEach(function(el){
        out.push('| '+[textViewElementName(el),el.kind+(el.origin?' · imported':''),el.signals.map(function(s){return s.name;}).join(', '),
          el.traceRules.length,el.tickets.join(', '),el.codeRefs.length,el.steps.join(', ')].map(textViewCell).join(' | ')+' |');
      });
      out.push('');
      d.elements.forEach(function(el){
        out.push('### '+textViewElementHead(el),'');
        if(el.sub)out.push('- Subtitle: '+textViewOneLine(el.sub));
        if(el.kind==='edge'){
          if(el.label && el.title)out.push('- Label: '+textViewOneLine(el.label));
          if(el.edgeKind)out.push('- Kind: '+el.edgeKind);
        }
        out.push('- Steps: '+(el.steps.length?el.steps.join(', '):'none'));
        if(el.tickets.length)out.push('- Tickets: '+el.tickets.map(function(k){return k+(el.ticketUrls[k]?' ('+el.ticketUrls[k]+')':'');}).join(', '));
        if(el.prs.length)out.push('- Pull requests: '+el.prs.join(', '));
        if(el.existsWhen)out.push('- Exists when: '+el.existsWhen.value+(el.existsWhen.active?'':' (inactive: needs a valid ticket)'));
        if(el.missingWork)out.push('- Missing work: yes');
        if(el.link)out.push('- Link: '+el.link);
        if(el.binding)out.push('- Binding: '+textViewLeaves(el.binding,'').map(function(leaf){return leaf[0]+' '+leaf[1];}).join(' · '));
        if(el.kind==='node'){
          if(el.edgesOut.length)out.push('- Edges out: '+el.edgesOut.map(function(k){return '`'+k+'`';}).join(', '));
          if(el.edgesIn.length)out.push('- Edges in: '+el.edgesIn.map(function(k){return '`'+k+'`';}).join(', '));
        }
        if(el.signals.length){
          out.push('- Telemetry: '+el.telemetryKind+(el.use?' · template '+el.use:''),'');
          out.push('| Metric | Source | Unit | Pass rule |','|---|---|---|---|');
          el.signals.forEach(function(s){out.push('| '+[s.name,s.source,s.unit,textViewPass(s.pass)].map(textViewCell).join(' | ')+' |');});
          out.push('');
          el.signals.forEach(function(s){
            out.push('- `'+s.name+'`'+textViewSignalMeta(s).map(function(b){return ' · '+b;}).join(''));
            out.push.apply(out,textViewQueryLines(s,'  '));
          });
          Object.keys(el.telemetryLinks).forEach(function(k){out.push('- Telemetry link '+k+': '+el.telemetryLinks[k]);});
          if(el.card)out.push('- Card: '+textViewLeaves(el.card,'').map(function(leaf){return leaf[0]+' '+leaf[1];}).join(' · '));
        }
        el.traceRules.forEach(function(x){out.push('- Trace rule (step '+x.step+'): '+textViewRuleText(x.rule));});
        el.codeRefs.forEach(function(ref){
          out.push('- Code '+(ref.id || ref.label || '')+': '+[ref.repository,ref.path,textViewLines(ref)?'lines '+textViewLines(ref):null,
            ref.revision?'revision '+ref.revision:null,ref.anchor && ref.anchor.start!=null?'anchor '+ref.anchor.start+' … '+ref.anchor.end:null,ref.purpose].filter(Boolean).join(' · '));
        });
        if(el.delta){
          out.push('- Delta'+(el.delta.marked?' (marked)':'')+(el.delta.text?': '+textViewOneLine(el.delta.text):''));
          el.delta.links.forEach(function(l){out.push('  - '+l.label+': '+l.url);});
        }
        el.fields.forEach(function(leaf){out.push('- '+leaf[0]+': '+textViewCode(leaf[1]));});
        out.push('');
      });
    });
  });
  return out.concat(textViewPageBlock(model,true)).join('\n');
}
