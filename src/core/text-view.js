/* Text view of a step diagram (#1322). Pure and DOM-free: it reads the page the
   reader renders (topology imports already resolved by FlowTopology), never edits
   it, and turns it into text for reading and for line diffs.

   Uses at call time: normalize, specObject, sectionRecords (core/document.js);
   diagramPathList, diagramForPath, stepFailures, stepPanelPatch (core/paths.js);
   trackingStepCarriers, trackingRefs, carrierTelemetry, trackingTelemetry
   (core/tracking.js); storyTimeSequence, storyTimeLabel (core/story-time.js);
   isTextBoxNode (core/text-box.js); deltaDetails (validator.js);
   FlowCanon.codeUrl (canon.js); FlowTopology.origin (canon-topology.js).

   textViewModel(page) -> {title, multi, telemetry, logSearches, sections}
     page: a normalized page or a {page} spec, already resolved.
     multi: true when the page has more than one diagram section; renderers
       then qualify every line and heading with the section reference.
     telemetry: {window, environment, grafana, honeycomb, environments:{id:{variables}}, templates:{name:{params}}}
     logSearches: [{id, label, query, datasource, values, fields}] (tracking.telemetry.lookups)
     sections: [{reference, number, heading, tab, diagrams:[{elements, paths}]}]
       elements: [{kind:'node'|'edge', id, title, sub, label, edgeKind, from, to,
                   origin:null|{spec, export, as}, tickets, prs, use, telemetryKind,
                   signals:[{name, source, query, unit, scope?, label?, role?, window?,
                             missingMeansZero?, showOnCard?, links?, pass:null|{min?, max?, maxRatioOf?}}],
                   telemetryLinks, binding, codeRefs, delta, steps:['<path>/<n>'],
                   edgesIn, edgesOut (nodes only), traceRules:[{step:'<path>/<n>', rule}]}]
         Nodes in authored key order (text boxes skipped), then edges in authored order.
         Queries are the expanded form (`use` templates applied); ${variables} stay as written.
       paths: [{id, label, basedOn, steps:[{n, id, text, time, at, touches:[{kind, id}],
                traceRules, codeRefs, panels:[{id, patch}], panelVisibility:[{id, value}],
                failures:[{edge, mode}], delta}]}]
         touches: the step's edges (step order, failed hops included) then its nodes,
         edge endpoints included. time is the authored step time; at is the story
         clock label when the diagram declares storyTime.
       codeRefs: [{id, label, repository, path, startLine, endLine, revision, purpose, url}]
       delta: null | {marked, text, links:[{label, url}]}

   textViewFlat(model) -> string. One fact per line, `<owner kind> <owner id> <key> <value>`
     (page lines have no owner id), single spaces, sorted by code unit, newline at end.
     Owner ids carry `<section>/` when model.multi; step owners are `<path>/<n>`.
     Newlines, tabs, carriage returns and backslashes inside values are escaped
     (\n \t \r \\), so one fact is always one line.
   textViewSteps(model, {queries:'names'|'full', pathId}) -> markdown (layout A).
     names (default) shows `name (source) unit u · pass ...`; full adds every query
     field. pathId picks that path in each diagram that has it, else its first path.
   textViewElements(model) -> markdown (layout B): an index table, then one sheet per
     element with every query written once. */

function textViewOwn(o,k){return !!o && Object.prototype.hasOwnProperty.call(o,k);}
function textViewClone(v){return v==null?v:JSON.parse(JSON.stringify(v));}
function textViewStable(v){
  if(Array.isArray(v))return '['+v.map(textViewStable).join(',')+']';
  if(v && typeof v==='object')return '{'+Object.keys(v).sort().map(function(k){return JSON.stringify(k)+':'+textViewStable(v[k]);}).join(',')+'}';
  return JSON.stringify(v);
}
function textViewCodeRef(ref){
  if(!specObject(ref))return null;
  var url=typeof FlowCanon!=='undefined'?FlowCanon.codeUrl(ref):null,out={};
  ['id','label','repository','path','startLine','endLine','revision','purpose'].forEach(function(k){out[k]=textViewOwn(ref,k)?ref[k]:null;});
  out.url=url;return out;
}
function textViewCodeRefs(value){return (value && Array.isArray(value.codeRefs)?value.codeRefs:[]).map(textViewCodeRef).filter(Boolean);}
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
function textViewCarrier(d,kind,id,value,templates){
  var refs=trackingRefs(value),binding=carrierTelemetry(value,templates),raw=value && value.telemetry;
  var out={kind:kind,id:id,title:typeof value.title==='string'?value.title:null,sub:typeof value.sub==='string'?value.sub:null,
    label:typeof value.label==='string'?value.label:null,edgeKind:kind==='edge' && typeof value.kind==='string'?value.kind:null,
    from:kind==='edge'?value.from:null,to:kind==='edge'?value.to:null,origin:textViewOrigin(d,kind==='node'?'nodes':'edges',id),
    tickets:refs.tickets,prs:refs.prs,use:specObject(raw) && typeof raw.use==='string'?raw.use:null,
    telemetryKind:binding?binding.kind:null,signals:textViewSignals(binding),telemetryLinks:binding?textViewClone(binding.links):{},
    binding:kind==='node' && specObject(value.binding)?textViewClone(value.binding):null,codeRefs:textViewCodeRefs(value),
    delta:textViewDelta(value),steps:[],traceRules:[]};
  if(kind==='node'){
    out.edgesIn=[];out.edgesOut=[];
    (d.edges || []).forEach(function(e){if(!specObject(e))return;var key=e.from+'->'+e.to;if(e.to===id)out.edgesIn.push(key);if(e.from===id)out.edgesOut.push(key);});
  }
  return out;
}
function textViewStep(d,st,n,story,index){
  var keys=stepKeys(st).concat(Object.keys(stepFailures(st))),carriers=trackingStepCarriers(d,st,false);
  var edges=carriers.filter(function(c){return !(textViewOwn(d.nodes,c.id) && d.nodes[c.id]===c.value);});
  var nodes=carriers.filter(function(c){return edges.indexOf(c)<0;});
  edges.sort(function(a,b){return keys.indexOf(a.id)-keys.indexOf(b.id);});
  var patch=stepPanelPatch(st),failures=stepFailures(st),visibility=specObject(st.panelVisibility)?st.panelVisibility:{};
  var time=typeof st.time==='string'?st.time:null;
  return {n:n,id:typeof st.id==='string'?st.id:null,text:typeof st.text==='string'?st.text:'',time:time,
    at:time!=null && story && story.times[index]!=null?storyTimeLabel(story.times[index],story.config):null,
    touches:edges.map(function(c){return {kind:'edge',id:c.id};}).concat(nodes.map(function(c){return {kind:'node',id:c.id};})),
    traceRules:[].concat(st.traceMatch || []).filter(specObject).map(textViewClone),
    codeRefs:textViewCodeRefs(st),
    panels:Object.keys(patch || {}).map(function(id){return {id:id,patch:textViewClone(patch[id])};}),
    panelVisibility:Object.keys(visibility).map(function(id){return {id:id,value:textViewClone(visibility[id])};}),
    failures:Object.keys(failures).map(function(edge){return {edge:edge,mode:failures[edge]};}),
    delta:textViewDelta(st)};
}
function textViewDiagram(d,templates){
  var elements=[],byKey=Object.create(null);
  Object.keys(d.nodes || {}).forEach(function(id){
    var node=d.nodes[id];if(!specObject(node) || isTextBoxNode(node))return;
    elements.push(byKey['node '+id]=textViewCarrier(d,'node',id,node,templates));
  });
  (Array.isArray(d.edges)?d.edges:[]).forEach(function(edge){
    if(!specObject(edge))return;var id=edge.from+'->'+edge.to;if(byKey['edge '+id])return;
    elements.push(byKey['edge '+id]=textViewCarrier(d,'edge',id,edge,templates));
  });
  var paths=(Array.isArray(d.steps) && d.steps.length?diagramPathList(d):[]).map(function(p){
    var projected=diagramForPath(d,p.id),story=storyTimeSequence(projected);
    var steps=projected.steps.map(function(st,i){return textViewStep(d,specObject(st)?st:{},i+1,story,i);});
    steps.forEach(function(step){
      var ref=p.id+'/'+step.n;
      step.touches.forEach(function(t){var el=byKey[t.kind+' '+t.id];if(el && el.steps.indexOf(ref)<0)el.steps.push(ref);});
      step.traceRules.forEach(function(rule){var el=typeof rule.nodeId==='string'?byKey['node '+rule.nodeId]:null;if(el)el.traceRules.push({step:ref,rule:rule});});
    });
    return {id:p.id,label:p.label,basedOn:p.basedOn || null,steps:steps};
  });
  return {elements:elements,paths:paths};
}
function textViewModel(input){
  var page=normalize(input) || input,telemetry=trackingTelemetry(page),templates=telemetry.templates;
  var records=sectionRecords(page).filter(function(r){return specObject(r.section) && specObject(r.section.diagram);});
  var environments={};
  Object.keys(telemetry.environments || {}).forEach(function(id){environments[id]={variables:textViewClone(telemetry.environments[id].variables || {})};});
  var lookups=telemetry.lookups || {};
  return {
    title:page && typeof page.title==='string'?page.title:'',
    multi:records.length>1,
    telemetry:{window:telemetry.window,environment:telemetry.environment || null,grafana:textViewClone(telemetry.grafana),
      honeycomb:textViewClone(telemetry.honeycomb),environments:environments,
      templates:Object.keys(templates).reduce(function(out,name){out[name]={params:templates[name].params.slice()};return out;},{})},
    logSearches:Object.keys(lookups).sort().map(function(id){
      var l=lookups[id];return {id:id,label:l.label,query:l.query,datasource:l.datasource || null,values:(l.values || []).slice(),fields:textViewClone(l.fields)};
    }),
    sections:records.map(function(r){
      var s=r.section;
      return {reference:r.reference,number:r.number,heading:typeof s.heading==='string'?s.heading:typeof s.title==='string'?s.title:'',
        tab:r.tabLabel || null,diagrams:[textViewDiagram(s.diagram,templates)]};
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
function textViewLines(ref){return ref.startLine?ref.startLine+(ref.endLine?'-'+ref.endLine:''):null;}
function textViewOriginText(o){return o.spec+' '+[].concat(o.export).join(',')+' as '+o.as;}

/* ---- layout C: flat lines ---- */
function textViewEscape(v){
  return String(v).replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/\r/g,'\\r').replace(/\t/g,'\\t')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u2028\u2029]/g,function(c){return '\\u'+('000'+c.charCodeAt(0).toString(16)).slice(-4);});
}
function textViewToken(v){return textViewEscape(v).replace(/ /g,'\\u0020');}
function textViewFlat(model){
  var out=[];
  function add(kind,owner,key,value){
    var line=kind+(owner==null?'':' '+textViewToken(owner))+' '+textViewToken(key);
    if(value!=null && value!=='')line+=' '+textViewEscape(value);
    out.push(line);
  }
  function codeRefs(kind,owner,refs){
    refs.forEach(function(ref,i){
      var at='code.'+(ref.id || '#'+i)+'.';
      ['label','repository','path','revision','purpose','url'].forEach(function(k){if(ref[k]!=null)add(kind,owner,at+k,ref[k]);});
      if(textViewLines(ref))add(kind,owner,at+'lines',textViewLines(ref));
    });
  }
  function delta(kind,owner,d){
    if(!d)return;
    if(d.marked)add(kind,owner,'delta','true');
    if(d.text)add(kind,owner,'delta.text',d.text);
    d.links.forEach(function(l){add(kind,owner,'delta.link',l.url+' '+l.label);});
  }
  var t=model.telemetry;
  if(model.title)add('page',null,'title',model.title);
  add('page',null,'telemetry.window',t.window);
  if(t.environment)add('page',null,'telemetry.environment',t.environment);
  ['grafana','honeycomb'].forEach(function(group){Object.keys(t[group] || {}).forEach(function(k){add('page',null,'telemetry.'+group+'.'+k,t[group][k]);});});
  Object.keys(t.environments).forEach(function(id){
    var vars=t.environments[id].variables;add('page',null,'telemetry.environments.'+id,'defined');
    Object.keys(vars).forEach(function(k){add('page',null,'telemetry.environments.'+id+'.variables.'+k,vars[k]);});
  });
  Object.keys(t.templates).forEach(function(name){add('page',null,'telemetry.template.'+name+'.params',t.templates[name].params.join(','));});
  model.logSearches.forEach(function(l){
    var at='logsearch.'+l.id+'.';
    add('page',null,at+'label',l.label);
    add('page',null,at+'query',(l.datasource || 'loki')+' '+l.query);
    l.values.forEach(function(v){add('page',null,at+'value',v);});
    Object.keys(l.fields || {}).forEach(function(k){add('page',null,at+'fields.'+k,l.fields[k]);});
  });
  model.sections.forEach(function(sec){
    var prefix=model.multi?sec.reference+'/':'';
    if(sec.heading)add('section',sec.reference,'heading',sec.heading);
    if(sec.tab)add('section',sec.reference,'tab',sec.tab);
    sec.diagrams.forEach(function(d){
      d.elements.forEach(function(el){
        var owner=prefix+el.id,kind=el.kind;
        add(kind,owner,'origin',el.origin?'imported '+textViewOriginText(el.origin):'local');
        ['title','sub','label'].forEach(function(k){if(el[k])add(kind,owner,k,el[k]);});
        if(el.edgeKind)add(kind,owner,'kind',el.edgeKind);
        el.tickets.forEach(function(k){add(kind,owner,'ticket',k);});
        el.prs.forEach(function(u){add(kind,owner,'pr',u);});
        if(el.telemetryKind)add(kind,owner,'telemetry.kind',el.telemetryKind);
        if(el.use)add(kind,owner,'telemetry.use',el.use);
        Object.keys(el.telemetryLinks).forEach(function(k){add(kind,owner,'telemetry.link.'+k,el.telemetryLinks[k]);});
        el.signals.forEach(function(s){
          var at='metric.'+s.name+'.';
          if(typeof s.query==='string')add(kind,owner,at+'query',s.source+' '+s.query);
          else{
            add(kind,owner,at+'source',s.source);
            textViewLeaves(s.query,'').forEach(function(leaf){add(kind,owner,at+'query.'+leaf[0],leaf[1]);});
          }
          if(s.unit!=null)add(kind,owner,at+'unit',s.unit);
          ['scope','label','role','window','missingMeansZero','showOnCard'].forEach(function(k){if(textViewOwn(s,k))add(kind,owner,at+k,s[k]);});
          if(s.links)textViewLeaves(s.links,'').forEach(function(leaf){add(kind,owner,at+'links.'+leaf[0],leaf[1]);});
          if(s.pass)add(kind,owner,at+'pass',textViewPass(s.pass));
        });
        if(el.binding)textViewLeaves(el.binding,'').forEach(function(leaf){add(kind,owner,'binding.'+leaf[0],leaf[1]);});
        codeRefs(kind,owner,el.codeRefs);
        delta(kind,owner,el.delta);
      });
      d.paths.forEach(function(p){
        add('path',prefix+p.id,'label',p.label);
        if(p.basedOn)add('path',prefix+p.id,'basedOn',p.basedOn);
        p.steps.forEach(function(st){
          var owner=prefix+p.id+'/'+st.n;
          if(st.id)add('step',owner,'id',st.id);
          add('step',owner,'text',st.text);
          if(st.time)add('step',owner,'time',st.time);
          if(st.at)add('step',owner,'at',st.at);
          st.touches.forEach(function(x){add('step',owner,'touches',x.kind+' '+x.id);});
          st.traceRules.forEach(function(rule,i){textViewLeaves(rule,'').forEach(function(leaf){add('step',owner,'trace['+i+'].'+leaf[0],leaf[1]);});});
          codeRefs('step',owner,st.codeRefs);
          st.panels.forEach(function(x){add('step',owner,'panel.'+x.id,textViewStable(x.patch));});
          st.panelVisibility.forEach(function(x){add('step',owner,'panelVisibility.'+x.id,textViewStable(x.value));});
          st.failures.forEach(function(f){add('step',owner,'failure',f.edge+' '+f.mode);});
          delta('step',owner,st.delta);
        });
      });
    });
  });
  out.sort(function(a,b){return a<b?-1:a>b?1:0;});
  return out.filter(function(line,i){return !i || line!==out[i-1];}).join('\n')+'\n';
}

/* ---- markdown helpers ---- */
function textViewCode(v){
  var s=String(v).replace(/\r?\n/g,' '),runs=s.match(/`+/g) || [],n=1;
  runs.forEach(function(r){if(r.length>=n)n=r.length+1;});
  var fence=new Array(n+1).join('`'),pad=/^`|`$/.test(s) || n>1?' ':'';
  return fence+pad+s+pad+fence;
}
function textViewCell(v){return String(v==null?'':v).replace(/\|/g,'\\|').replace(/\r?\n/g,' ');}
function textViewSectionTitle(model,sec){
  var title=sec.heading || sec.reference;
  return title+(model.multi?' (section '+sec.reference+(sec.tab?', tab '+sec.tab:'')+')':'');
}
function textViewSignalName(s){
  return s.name+' ('+s.source+')'+(s.unit!=null?' unit '+s.unit:'')+(s.pass?' · pass '+textViewPass(s.pass):'');
}
function textViewQueryLines(s,indent){
  if(typeof s.query==='string')return [indent+'- query: '+textViewCode(s.query)];
  return textViewLeaves(s.query,'').map(function(leaf){return indent+'- '+leaf[0]+': '+textViewCode(leaf[1]);});
}
function textViewRuleText(rule){
  var head=[rule.serviceName,rule.operation].filter(Boolean).join(' '),rest=[];
  Object.keys(rule).sort().forEach(function(k){
    if(k==='serviceName' || k==='operation')return;
    rest.push(k+' '+(rule[k] && typeof rule[k]==='object'?textViewStable(rule[k]):rule[k]));
  });
  return head+(rest.length?' · '+rest.join(' · '):'');
}
function textViewRefText(ref){
  var where=(ref.path || '')+(textViewLines(ref)?':'+textViewLines(ref):'');
  return (ref.id || ref.label || 'code')+' '+where+(ref.revision?' @'+String(ref.revision).slice(0,12):'')+(ref.purpose?' — '+ref.purpose:'');
}
function textViewElementHead(el){
  var name=el.title || el.label;
  return el.kind+' `'+el.id+'`'+(name?' '+name:'')+(el.origin?' · imported ('+textViewOriginText(el.origin)+')':'');
}

/* ---- layout A: steps ---- */
function textViewSteps(model,options){
  options=options || {};
  var full=options.queries==='full',out=['# '+(model.title || 'Untitled')+' — steps',''];
  model.sections.forEach(function(sec){
    sec.diagrams.forEach(function(d){
      var byKey=Object.create(null);d.elements.forEach(function(el){byKey[el.kind+' '+el.id]=el;});
      out.push('## '+textViewSectionTitle(model,sec),'');
      if(!d.paths.length){out.push('_No steps._','');return;}
      var path=d.paths.filter(function(p){return p.id===options.pathId;})[0] || d.paths[0];
      out.push('Path: '+path.label+' (`'+path.id+'`)'+(d.paths.length>1?' · other paths: '+d.paths.filter(function(p){return p!==path;}).map(function(p){return p.label+' (`'+p.id+'`)';}).join(', '):''),'');
      path.steps.forEach(function(st){
        var when=st.time?' · '+st.time+(st.at?' ('+st.at+')':''):'';
        out.push('### '+st.n+'.'+(st.id?' `'+st.id+'`':'')+when+(st.delta && st.delta.marked?' · changed':''),'');
        if(st.text)out.push(st.text,'');
        st.touches.forEach(function(t){
          var el=byKey[t.kind+' '+t.id];if(!el)return;
          var bits=[textViewElementHead(el)];
          if(el.tickets.length)bits.push('tickets '+el.tickets.join(', '));
          if(el.delta && el.delta.marked)bits.push('changed');
          out.push('- '+bits.join(' · '));
          el.signals.forEach(function(s){
            out.push('  - metric '+textViewSignalName(s));
            if(full)out.push.apply(out,textViewQueryLines(s,'    '));
          });
          if(el.binding && el.binding.entityRef)out.push('  - binding '+el.binding.entityRef);
          el.codeRefs.forEach(function(ref){out.push('  - code '+textViewRefText(ref));});
          if(el.delta && el.delta.text)out.push('  - delta '+el.delta.text.replace(/\r?\n/g,' '));
        });
        st.traceRules.forEach(function(rule){out.push('- trace match: '+textViewRuleText(rule));});
        st.codeRefs.forEach(function(ref){out.push('- code '+textViewRefText(ref));});
        st.panels.forEach(function(x){out.push('- panel '+x.id+': '+textViewCode(textViewStable(x.patch)));});
        st.panelVisibility.forEach(function(x){out.push('- panel '+x.id+' visibility: '+textViewCode(textViewStable(x.value)));});
        st.failures.forEach(function(f){out.push('- failure `'+f.edge+'` '+f.mode);});
        if(st.delta && st.delta.text)out.push('- delta '+st.delta.text.replace(/\r?\n/g,' '));
        out.push('');
      });
    });
  });
  if(model.logSearches.length){
    out.push('## Log searches','');
    model.logSearches.forEach(function(l){
      out.push('- `'+l.id+'` '+l.label+' ('+(l.datasource || 'loki')+')'+(l.values.length?' · values '+l.values.join(', '):''));
      if(full)out.push('  - query: '+textViewCode(l.query));
    });
    out.push('');
  }
  return out.join('\n');
}

/* ---- layout B: elements ---- */
function textViewElements(model){
  var out=['# '+(model.title || 'Untitled')+' — elements',''];
  model.sections.forEach(function(sec){
    sec.diagrams.forEach(function(d){
      out.push('## '+textViewSectionTitle(model,sec),'');
      if(!d.elements.length){out.push('_No elements._','');return;}
      out.push('| Element | Kind | Metrics | Trace rules | Tickets | Code refs | Steps |','|---|---|---|---|---|---|---|');
      d.elements.forEach(function(el){
        out.push('| '+[el.id,el.kind+(el.origin?' · imported':''),el.signals.map(function(s){return s.name;}).join(', '),
          el.traceRules.length,el.tickets.join(', '),el.codeRefs.length,el.steps.join(', ')].map(textViewCell).join(' | ')+' |');
      });
      out.push('');
      d.elements.forEach(function(el){
        out.push('### '+textViewElementHead(el),'');
        if(el.sub)out.push('- Subtitle: '+el.sub);
        if(el.kind==='edge'){
          if(el.label && el.title)out.push('- Label: '+el.label);
          if(el.edgeKind)out.push('- Kind: '+el.edgeKind);
        }
        out.push('- Steps: '+(el.steps.length?el.steps.join(', '):'none'));
        if(el.tickets.length)out.push('- Tickets: '+el.tickets.join(', '));
        if(el.prs.length)out.push('- Pull requests: '+el.prs.join(', '));
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
            out.push('- `'+s.name+'`'+(s.scope?' · scope '+s.scope:'')+(s.label?' · label '+s.label:''));
            out.push.apply(out,textViewQueryLines(s,'  '));
          });
          Object.keys(el.telemetryLinks).forEach(function(k){out.push('- Telemetry link '+k+': '+el.telemetryLinks[k]);});
        }
        el.traceRules.forEach(function(x){out.push('- Trace rule (step '+x.step+'): '+textViewRuleText(x.rule));});
        el.codeRefs.forEach(function(ref){
          out.push('- Code '+(ref.id || ref.label || '')+': '+[ref.repository,ref.path,textViewLines(ref)?'lines '+textViewLines(ref):null,
            ref.revision?'revision '+ref.revision:null,ref.purpose].filter(Boolean).join(' · '));
        });
        if(el.delta){
          out.push('- Delta'+(el.delta.marked?' (marked)':'')+(el.delta.text?': '+el.delta.text.replace(/\r?\n/g,' '):''));
          el.delta.links.forEach(function(l){out.push('  - '+l.label+': '+l.url);});
        }
        out.push('');
      });
    });
  });
  return out.join('\n');
}
