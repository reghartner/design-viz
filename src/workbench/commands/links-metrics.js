/* #1243 part 4: the Links window's Metrics tab. Rows are page templates, then
   carriers with raw signals, imported carriers whose metrics come from their
   provider (#1266 merge), and carriers without metrics. Every write goes
   through planCarrierTelemetry, the Inspect Metrics editor's planner, so each
   edit is one source change (one Undo step) and the same JSON. */

function linksMetricsTemplateRefusal(e){
  return 'Templates aren’t available on imported '+(e.kind==='edge'?'connections':'nodes')+' yet; add signals in Inspect.';
}
/* {templates:[{name,kind,params,signals}], groups:[{key,label,template,carriers,steps}], elements:[...]}.
   A carrier element: {kind,section,id|index,key,label,imported,group,template,binding,missingParams,signals,inheritedSignals,hidden,added,rawSignals}. */
function linksMetricsModel(text,raw,context){
  var resolved;try{resolved=linksResolve(raw,context);}catch(ex){return {error:ex.message};}
  // With no consumer overlays to strip, the resolved board is what the providers give.
  var stripped=linksInheritedSource(raw,context) || resolved,page=normalize(resolved),records=page?sectionRecords(page):[];
  var pageTemplates=telemetryPageTemplates(raw) || {},names=Object.keys(pageTemplates).sort();
  var templates=names.map(function(name){
    var t=telemetryObject(pageTemplates[name])?pageTemplates[name]:{};
    return {name:name,kind:typeof t.kind==='string'?t.kind:null,params:Array.isArray(t.params)?t.params.slice():[],signals:telemetryObject(t.signals)?Object.keys(t.signals):[]};
  });
  var model={sections:[],templates:templates,groups:[],elements:[]},buckets=Object.create(null);
  names.forEach(function(name){buckets['template:'+name]=[];});
  var paths=specSectionPaths(resolved),authoredPaths=specSectionPaths(raw);
  paths.forEach(function(rec,section){
    var d=specValueAt(resolved,rec.diagram),authored=authoredPaths[section] && specValueAt(raw,authoredPaths[section].diagram);
    if(!d || typeof d!=='object' || !d.nodes || typeof d.nodes!=='object')return;
    var sec=specValueAt(resolved,rec.section) || {};model.sections.push({section:section,label:sec.heading || 'Section '+(section+1)});
    var plain=stripped && specValueAt(stripped,rec.diagram),view=records[section] && records[section].section && records[section].section.diagram || d;
    var imports=authored && Array.isArray(authored.topologyImports)?authored.topologyImports:[];
    function title(id){var n=d.nodes[id];return n && (n.title || n.label) || id;}
    function carrier(kind,value,base,inheritedValue,owner,relative){
      var b=telemetryObject(value.telemetry)?value.telemetry:null,imported=!!owner;
      var e=Object.assign(base,{section:section,imported:imported,binding:b?telemetryClone(b):null});
      var inherited=imported && inheritedValue && telemetryObject(inheritedValue.telemetry)?inheritedValue.telemetry:null;
      if(imported && inherited){
        var at=imports.findIndex(function(imp){return imp && imp.as===owner.as;}),field=kind==='node'?'nodeTracking':'edgeTracking';
        var overlay=at>=0 && telemetryObject(imports[at][field]) && telemetryObject(imports[at][field][relative]) && telemetryObject(imports[at][field][relative].telemetry)?imports[at][field][relative].telemetry:null;
        var inheritedSignals=telemetryObject(inherited.signals)?Object.keys(inherited.signals):[];
        e.group='provider';e.template=null;e.inheritedSignals=inheritedSignals;
        e.hidden=overlay && Array.isArray(overlay.hide)?inheritedSignals.filter(function(n){return overlay.hide.indexOf(n)>=0;}):[];
        e.added=overlay && telemetryObject(overlay.signals)?Object.keys(overlay.signals).filter(function(n){return inheritedSignals.indexOf(n)<0;}):[];
        e.signals=telemetryObject(b && b.signals)?Object.keys(b.signals):[];e.missingParams=[];
      }else if(b && typeof b.use==='string'){
        var t=telemetryObject(pageTemplates[b.use])?pageTemplates[b.use]:null;
        e.group='template:'+b.use;e.template=b.use;
        e.missingParams=t && Array.isArray(t.params)?t.params.filter(function(p){return !telemetryText(b[p]);}):[];
        e.signals=t && telemetryObject(t.signals)?Object.keys(t.signals):[];
      }else if(b && telemetryObject(b.signals) && Object.keys(b.signals).length){
        e.group='raw';e.template=null;e.missingParams=[];e.signals=Object.keys(b.signals);e.rawSignals=true;
      }else{e.group='none';e.template=null;e.missingParams=[];e.signals=[];}
      if(!e.inheritedSignals){e.inheritedSignals=[];e.hidden=[];e.added=[];}
      // Static drop checks look templates up through the model.
      Object.defineProperty(e,'model',{value:model,enumerable:false});
      (buckets[e.group] || (buckets[e.group]=[])).push(e);model.elements.push(e);
      return e;
    }
    var origin=typeof FlowTopology!=='undefined'?FlowTopology.origin:function(){return null;};
    Object.keys(d.nodes).forEach(function(id){
      var node=d.nodes[id];if(!node || typeof node!=='object' || isTextBoxNode(node))return;
      var owner=authored && authored.nodes && Object.prototype.hasOwnProperty.call(authored.nodes,id)?null:origin(d,'nodes',id);
      carrier('node',node,{kind:'node',id:id,label:title(id)},plain && plain.nodes && plain.nodes[id],owner,owner?id.slice(owner.as.length+2):id);
    });
    (Array.isArray(d.edges)?d.edges:[]).forEach(function(edge,index){
      if(!edge || typeof edge!=='object')return;var key=builderEdgeKey(edge);
      var local=authored && Array.isArray(authored.edges) && authored.edges.some(function(x){return builderEdgeKey(x)===key;});
      var owner=local?null:origin(d,'edges',key),plainEdge=plain && Array.isArray(plain.edges)?plain.edges.find(function(x){return builderEdgeKey(x)===key;}):null;
      carrier('edge',edge,{kind:'edge',index:index,key:key,label:title(edge.from)+' → '+title(edge.to)+(typeof edge.label==='string' && edge.label?' · '+edge.label:'')},plainEdge,owner,
        owner?key.split('->').map(function(part){return part.slice(owner.as.length+2);}).join('->'):key);
    });
    (Array.isArray(d.steps)?d.steps:[]).forEach(function(st,index){
      if(!st || typeof st!=='object')return;
      var lit=trackingStepCarriers(view,st,true).map(function(c){return c.id;});
      var carriers=model.elements.filter(function(e){return e.section===section && e.kind!=='step' && lit.indexOf(e.kind==='node'?e.id:e.key)>=0;});
      model.elements.push({kind:'step',section:section,index:index,label:linksStepLabel(st,index),caption:typeof st.text==='string'?st.text:'',carriers:carriers});
    });
  });
  var steps=model.elements.filter(function(e){return e.kind==='step';});
  function group(key,label,template){
    var carriers=buckets[key] || [];
    return {key:key,label:label,template:template || null,carriers:carriers,
      steps:steps.filter(function(s){return s.carriers.some(function(c){return carriers.indexOf(c)>=0;});})};
  }
  names.forEach(function(name){model.groups.push(group('template:'+name,name,name));});
  [['raw','Raw signals'],['provider','Provider metrics'],['none','No metrics']].forEach(function(g){if((buckets[g[0]] || []).length)model.groups.push(group(g[0],g[1]));});
  return model;
}
/* Why template `name` cannot go onto element `to`, or null. Static: no plan runs.
   A carrier with raw signals is allowed: the drop asks Replace first. */
function linksMetricsDropRefusal(name,to){
  if(!to || (to.kind!=='node' && to.kind!=='edge'))return 'Drop on a node or connection: metrics are saved on nodes and connections.';
  var known=to.model && to.model.templates.some(function(t){return t.name===name;});
  if(to.model && !known)return 'Template "'+name+'" is not defined in Status board settings → Metrics.';
  if(to.imported)return linksMetricsTemplateRefusal(to);
  if(to.template===name)return to.label+' already uses '+name+'.';
  return null;
}
/* Use template `name` on one carrier. A carrier with raw signals needs
   confirm (they are replaced); imported carriers refuse templates for now. */
function planLinksMetricsUse(text,raw,target,name,confirm,context){
  var t=telemetryCarrierTarget(text,raw,target,context);if(t.error)return t;
  if(t.owner)return {error:linksMetricsTemplateRefusal(target)};
  var b=telemetryObject(t.binding)?t.binding:null;
  if(b && !telemetryOwn(b,'use') && telemetryObject(b.signals) && Object.keys(b.signals).length && !confirm){
    var label=target.kind==='node'?(t.resolved.title || t.id):t.id.replace('->',' → ');
    return {error:label+' has raw signals. Replace them with template '+name+'?',choose:true};
  }
  var plan=planCarrierTelemetry(text,raw,target,{op:'use',name:name},context);
  return plan.noop?{text:text}:plan;
}
function planLinksMetricsRemove(text,raw,target,context){
  var plan=planCarrierTelemetry(text,raw,target,{op:'remove'},context);
  return plan.noop?{text:text}:plan;
}
/* Hide (or show again) one signal an imported carrier inherits from its provider (#1266). */
function planLinksMetricsHide(text,raw,target,name,hide,context){
  var plan=planCarrierTelemetry(text,raw,target,{op:'hide',name:name,value:!!hide},context);
  return plan.noop?{text:text}:plan;
}
