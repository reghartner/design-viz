// GENERATED FILE — python3 tools/build.py; edit src/, not this file.
'use strict';
/* ---- src/compatibility.js ---- */
/* Release identity and compatibility are independent of the spec's revision.
   Fork maintainers bump version on releases and register each new capability
   with its first release. 0.1.0 is the compatibility-aware baseline, not a
   claim about which historical release introduced the existing features. */
var FlowviewCompatibility = (function(){
  'use strict';
  var version = '0.1.0', contract = '1', baseline = '0.1.0';
  var features = Object.create(null);
  var panelFeatures = {"panel.state":{"label":"State panel","since":"0.1.0"},"panel.leds":{"label":"LEDs panel","since":"0.1.0"},"panel.gauge":{"label":"Gauge panel","since":"0.1.0"},"panel.log":{"label":"Log panel","since":"0.1.0"},"panel.screen":{"label":"Camera screen panel","since":"0.1.0"},"panel.image":{"label":"Embedded image panel","since":"0.1.0"},"panel.waterfall":{"label":"Waterfall panel","since":"0.1.0"},"panel.orbit":{"label":"Orbit panel","since":"0.1.0"},"panel.zoneframe":{"label":"Zone frame panel","since":"0.1.0"},"panel.xray":{"label":"Device internals panel","since":"0.1.0"},"panel.queue":{"label":"Queue panel","since":"0.1.0"},"panel.thermo":{"label":"Temperature panel","since":"0.1.0"},"panel.battery":{"label":"Battery panel","since":"0.1.0"},"panel.buffer":{"label":"Buffer panel","since":"0.1.0"},"panel.radar":{"label":"Radar panel","since":"0.1.0"},"panel.homemap":{"label":"Home map panel","since":"0.1.0"},"panel.signal":{"label":"Signal panel","since":"0.1.0"},"panel.tiles":{"label":"Tiles panel","since":"0.1.0"},"panel.inflight":{"label":"In-flight activity panel","since":"0.1.0"},"panel.phone":{"label":"Phone panel","since":"0.1.0"},"panel.deviceapp":{"label":"Camera app panel","since":"0.1.0"},"panel.timeline":{"label":"Timeline panel","since":"0.1.0"},"panel.table":{"label":"Table panel","since":"0.1.0"},"panel.checks":{"label":"Checks panel","since":"0.1.0"},"panel.budget":{"label":"Budget panel","since":"0.1.0"},"panel.trace":{"label":"Trace panel","since":"0.1.0"},"panel.replicas":{"label":"Replicas panel","since":"0.1.0"}};

  Object.keys(panelFeatures).forEach(function(id){features[id]=panelFeatures[id];});
  var extraLabels={ 'flow.drilldown':'Domain drill-downs', 'flow.alternates':'Alternate paths', 'flow.failures':'Failed communications',
    'layout.arranged':'Custom panel layouts', 'layout.named':'Named views',
    'layout.step-subsets':'View-specific step stops' };
  Object.keys(extraLabels).forEach(function(id){features[id]={label:extraLabels[id],since:baseline};});
  // Panel capabilities come from their definitions at build time.
  // Non-panel capabilities and the release version remain owned here.
  function object(v){return !!v && typeof v==='object' && !Array.isArray(v);}
  function pageOf(raw){return object(raw) && object(raw.page) ? raw.page : raw;}
  function parseVersion(value){
    if(typeof value!=='string')return null;
    var m=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(value);
    if(!m)return null;
    var pre=m[4] ? m[4].split('.') : [];
    if(pre.some(function(v){return /^\d+$/.test(v) && v.length>1 && v[0]==='0';}))return null;
    return {core:m.slice(1,4),pre:pre};
  }
  function numeric(a,b){return a.length!==b.length ? (a.length>b.length?1:-1) : a===b?0:a>b?1:-1;}
  function compare(a,b){
    a=parseVersion(a);b=parseVersion(b);if(!a || !b)return null;
    for(var i=0;i<3;i++){var n=numeric(a.core[i],b.core[i]);if(n)return n;}
    if(!a.pre.length || !b.pre.length)return a.pre.length===b.pre.length?0:a.pre.length?-1:1;
    for(var j=0;j<Math.max(a.pre.length,b.pre.length);j++){
      var x=a.pre[j],y=b.pre[j];if(x===y)continue;if(x==null)return -1;if(y==null)return 1;
      var xn=/^\d+$/.test(x),yn=/^\d+$/.test(y);
      if(xn && yn)return numeric(x,y);if(xn!==yn)return xn?-1:1;return x>y?1:-1;
    }
    return 0;
  }
  function detect(raw){
    var page=pageOf(raw),used=Object.create(null);
    function diagram(d){
      if(!object(d))return;
      if(Object.values(d.nodes || {}).some(function(n){return n && n.detail;}))used['flow.drilldown']=true;
      (Array.isArray(d.panels)?d.panels:[]).forEach(function(p){if(p && typeof p.type==='string')used['panel.'+p.type]=true;});
      if(Array.isArray(d.paths) && d.paths.length)used['flow.alternates']=true;
      if((Array.isArray(d.steps)?d.steps:[]).some(function(s){return s && object(s.failures) && Object.keys(s.failures).length;}))used['flow.failures']=true;
      if(d.sectionLayout)used['layout.arranged']=true;
      if(Array.isArray(d.layouts) && d.layouts.length){
        used['layout.named']=true;
        if(d.layouts.some(function(v){return v && Array.isArray(v.steps);}))used['layout.step-subsets']=true;
      }
    }
    if(!object(page))return [];
    if(page.nodes && page.rows)diagram(page);
    var blocks=page.blocks || page.sections;
    (Array.isArray(blocks)?blocks:[]).forEach(function(b){
      if(!object(b))return;
      if(b.id!=null || b.detailOnly)used['flow.drilldown']=true;
      diagram(b.diagram);
      (Array.isArray(b.tabs)?b.tabs:[]).forEach(function(t){
        (t && Array.isArray(t.sections)?t.sections:[]).forEach(function(s){if(s && (s.id!=null || s.detailOnly))used['flow.drilldown']=true;diagram(s && s.diagram);});
      });
    });
    return Object.keys(used).sort();
  }
  function metadataWarnings(raw){
    var p=pageOf(raw),m=p && p.flowview,out=[];
    if(m==null)return out;
    if(!object(m))return ['page.flowview: expected {authoredWith?, minVersion?, features?}'];
    ['authoredWith','minVersion'].forEach(function(k){if(m[k]!=null && !parseVersion(m[k]))out.push('page.flowview.'+k+': expected a semantic version such as 1.2.3');});
    if(m.features!=null && (!Array.isArray(m.features) || m.features.some(function(id){return typeof id!=='string' || !/^[a-z][a-z0-9.-]*$/.test(id);})))
      out.push('page.flowview.features: expected feature IDs such as panel.homemap');
    return out;
  }
  function check(raw,runtime){
    runtime=runtime || {version:version,contract:contract,features:features};
    var p=pageOf(raw),m=p && object(p.flowview)?p.flowview:{},issues=metadataWarnings(raw);
    var required=detect(raw);
    (Array.isArray(m.features)?m.features:[]).forEach(function(id){if(typeof id==='string' && required.indexOf(id)<0)required.push(id);});
    var supported=runtime.features || {},missing=required.filter(function(id){return !Object.prototype.hasOwnProperty.call(supported,id);});
    var minimum=parseVersion(m.minVersion)?m.minVersion:null;
    required.forEach(function(id){var f=features[id];if(f && (!minimum || compare(f.since,minimum)>0))minimum=f.since;});
    var tooOld=minimum!=null && compare(runtime.version,minimum)<0;
    var schemaMismatch=p && p.contract!=null && String(p.contract).split('.')[0]!==runtime.contract;
    var labels=missing.map(function(id){return features[id]?features[id].label:id;});
    var messages=[];
    if(schemaMismatch)messages.push('This diagram uses spec contract '+String(p.contract)+'. This viewer supports contract '+runtime.contract+'. Upgrade Flowview before relying on this diagram.');
    if(tooOld)messages.push('This diagram requires Flowview '+minimum+' or newer. This viewer uses '+runtime.version+'. Some features may be unavailable or displayed incorrectly until Flowview is upgraded.');
    if(labels.length)messages.push('Unavailable features: '+labels.join(', ')+'. Upgrade the installed Flowview renderer for the complete diagram.');
    if(issues.length)messages.push('The diagram has invalid compatibility metadata; compatibility cannot be confirmed. '+issues.join(' '));
    return {runtimeVersion:runtime.version,minVersion:minimum,missingFeatures:missing,messages:messages,
      status:schemaMismatch?'unsupported':messages.length?'partial':p && p.flowview?'compatible':'unversioned'};
  }
  function stamp(raw){
    var copy=JSON.parse(JSON.stringify(raw)),p=pageOf(copy);
    if(!object(p) || metadataWarnings(copy).length)return copy;
    if(p.nodes && p.rows){copy={page:{sections:[{diagram:p}]}};p=copy.page;}
    var m=object(p.flowview)?p.flowview:{},required=detect(copy);
    (m.features || []).forEach(function(id){if(required.indexOf(id)<0)required.push(id);});
    var minimum=m.minVersion || baseline;
    required.forEach(function(id){var f=features[id];if(f && compare(f.since,minimum)>0)minimum=f.since;});
    p.flowview=Object.assign(Object.create(null),m,{authoredWith:version,minVersion:minimum,features:required.sort()});
    if(p.contract==null)p.contract=contract;
    return copy;
  }
  function stampText(text){
    try{
      var raw=JSON.parse(text,function(key,value){
        if(typeof value==='number' && !Number.isFinite(value))throw new Error('Preserve overflowing numeric input.');
        return value;
      });
      return JSON.stringify(stamp(raw),null,2).replace(/</g,'\\u003c');
    }
    catch(ex){return text;} // Saving unfinished JSON must remain possible.
  }
  return {version:version,contract:contract,features:features,compare:compare,detect:detect,
    metadataWarnings:metadataWarnings,check:check,stamp:stamp,stampText:stampText};
})();
/* ---- src/canon.js ---- */
/* Portable, data-only catalog/code evidence. No credentials or network access.
   Also loaded by the Node scanners and the simulated company portal. */
var FlowCanon = (function(){
  'use strict';
  function object(v){ return !!v && typeof v === 'object' && !Array.isArray(v); }
  function clone(v){ return JSON.parse(JSON.stringify(v)); }
  function http(v){
    if (typeof v !== 'string' || !/^https?:\/\//i.test(v)) return null;
    try { var u = new URL(v); return u.username || u.password ? null : u.href; } catch (_) { return null; }
  }
  function entityRef(v){ return typeof v === 'string' && /^[a-z][a-z0-9-]*:[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(v); }
  function pageOf(raw){ return raw && raw.page || raw; }
  function sections(raw){
    var p=pageOf(raw), out=[];
    if (!p) return out;
    function walk(items){ (Array.isArray(items) ? items : []).forEach(function(s){
      if (!object(s)) return;
      if (object(s.diagram)) out.push(s);
      (Array.isArray(s.tabs) ? s.tabs : []).forEach(function(t){ if (object(t)) walk(t.sections || t.blocks); });
    }); }
    walk(p.blocks || p.sections);
    return out;
  }
  function catalog(input){
    if (!input || input.version !== 1 || !Array.isArray(input.services)) throw new Error('Catalog: expected version 1 and services.');
    var seen=new Set();
    var services=input.services.map(function(s){
      if (!object(s) || !entityRef(s.entityRef) || seen.has(s.entityRef)) throw new Error('Catalog: missing or duplicate service entityRef.');
      seen.add(s.entityRef);
      var apiIds=new Set();
      (s.apis || []).forEach(function(a){
        if (!entityRef(a.entityRef) || apiIds.has(a.entityRef)) throw new Error('Catalog: missing or duplicate API entityRef.');
        apiIds.add(a.entityRef);
        var opIds=new Set();
        (a.operations || []).forEach(function(op){
          if (!op.operationId || opIds.has(op.operationId)) throw new Error('Catalog: missing or duplicate operationId.');
          opIds.add(op.operationId);
        });
      });
      return clone(s);
    });
    return {version:1,source:String(input.source || ''),services:services};
  }
  function binding(registry, ref, apiRef, operationId){
    var service=registry.services.find(function(s){return s.entityRef===ref;});
    if (!service) throw new Error('Service is no longer in the catalog: '+ref);
    var result={entityRef:ref,label:service.title || ref,owner:service.owner || '',catalogUrl:http(service.catalogUrl),
      telemetry:clone(service.telemetry || {})};
    if (apiRef){
      var api=(service.apis || []).find(function(a){return a.entityRef===apiRef;});
      if (!api) throw new Error('API does not belong to the selected service.');
      var op=(api.operations || []).find(function(o){return o.operationId===operationId;});
      if (operationId && !op) throw new Error('Operation does not belong to the selected API.');
      result.api={entityRef:api.entityRef,title:api.title || api.entityRef,definitionUrl:http(api.definitionUrl),endpoints:{}};
      Object.keys(api.endpoints || {}).forEach(function(env){
        var url=http(api.endpoints[env]); if (url) result.api.endpoints[env]=url;
      });
      if (op) Object.assign(result.api,{operationId:op.operationId,method:op.method,path:op.path});
    }
    return result;
  }
  function referenceErrors(ref){
    var errors=[];
    if (!object(ref)) return ['expected a code reference object'];
    if (typeof ref.id!=='string' || !/^[a-z0-9][a-z0-9_.-]*$/i.test(ref.id)) errors.push('id is required (letters, numbers, dots, dashes)');
    if (!http(ref.repository)) errors.push('repository must be an http(s) repository URL');
    if (typeof ref.path!=='string' || !ref.path || ref.path.startsWith('/') || ref.path.split(/[\\/]/).some(function(p){return p==='..' || p==='.';}) || /[\x00-\x1f\\]/.test(ref.path)) errors.push('path must be a repository-relative file path');
    if (typeof ref.revision!=='string' || !/^[a-f0-9]{40,64}$/i.test(ref.revision)) errors.push('revision must be an immutable full commit SHA');
    if (!object(ref.anchor) || typeof ref.anchor.start!=='string' || !ref.anchor.start.trim() || typeof ref.anchor.end!=='string' || !ref.anchor.end.trim()) errors.push('anchor.start and anchor.end must be nonempty literal lines');
    if (ref.startLine!=null && (!Number.isInteger(ref.startLine) || ref.startLine<1)) errors.push('startLine must be a positive integer');
    if (ref.endLine!=null && (!Number.isInteger(ref.endLine) || ref.endLine<(ref.startLine || 1))) errors.push('endLine must follow startLine');
    return errors;
  }
  function locate(text, anchor){
    if (typeof text!=='string' || !object(anchor)) return {error:'Source or anchor is unavailable.'};
    var lines=text.replace(/\r\n/g,'\n').split('\n'), starts=[], ends=[];
    lines.forEach(function(line,i){
      if (line.trim()===String(anchor.start).trim()) starts.push(i);
      if (line.trim()===String(anchor.end).trim()) ends.push(i);
    });
    if (starts.length!==1 || ends.length!==1 || ends[0]<starts[0]) return {error:'Anchor is missing, ambiguous, or reversed; repair the reference.'};
    return {startLine:starts[0]+1,endLine:ends[0]+1,text:lines.slice(starts[0],ends[0]+1).join('\n')};
  }
  function codeUrl(ref){
    if (referenceErrors(ref).length) return null;
    var base=http(ref.repository).replace(/\/$/,'').replace(/\.git$/,'');
    return base+'/blob/'+ref.revision+'/'+ref.path.split('/').map(encodeURIComponent).join('/')+
      (ref.startLine ? '#L'+ref.startLine+(ref.endLine ? '-L'+ref.endLine : '') : '');
  }
  function references(raw){
    var p=pageOf(raw), out=[];
    sections(raw).forEach(function(sec,si){
      var d=sec.diagram;
      function add(value,kind,id){ (value && Array.isArray(value.codeRefs) ? value.codeRefs : []).forEach(function(ref){
        out.push({diagramId:p.canon && p.canon.id || p.title || 'untitled',section:si,sectionId:sec.id || sec.heading || String(si),
          kind:kind,targetId:id,description:value && (value.text || value.title) || '',reference:ref});
      }); }
      Object.keys(d.nodes || {}).forEach(function(id){add(d.nodes[id],'node',id);});
      (Array.isArray(d.steps) ? d.steps : []).forEach(function(st,i){add(st,'step',st && st.id || String(i));});
    });
    return out;
  }
  function validate(raw){
    var errors=[], p=pageOf(raw);
    if (!object(p)) return errors;
    if (p.canon!=null){
      var c=p.canon;
      if (!object(c) || c.version!==1 || typeof c.id!=='string' || !/^[a-z0-9][a-z0-9_.-]*$/i.test(c.id) || !['design','canonical'].includes(c.kind) || !entityRef(c.owner))
        errors.push('page.canon: expected {version:1,id,kind:"design"|"canonical",owner:<entity reference>}');
    }
    var identities=new Map();
    references(raw).forEach(function(item){
      var ref=item.reference;
      referenceErrors(ref).forEach(function(e){errors.push('codeRefs '+item.targetId+': '+e);});
      if (!object(ref)) return;
      var identity=JSON.stringify([ref.repository,ref.path,ref.revision,ref.anchor]);
      if (identities.has(ref.id) && identities.get(ref.id)!==identity) errors.push('codeRefs: '+ref.id+' identifies conflicting locations or baselines');
      identities.set(ref.id,identity);
      if (item.kind==='step' && !sections(raw)[item.section].diagram.steps.some(function(s){return s && s.id===item.targetId;})) errors.push('codeRefs: referenced steps require stable IDs');
    });
    sections(raw).forEach(function(sec){
      Object.values(sec.diagram.nodes || {}).concat(sec.diagram.steps || []).forEach(function(v){if(v && v.codeRefs!=null && !Array.isArray(v.codeRefs)) errors.push('codeRefs: expected an array');});
      Object.keys(sec.diagram.nodes || {}).forEach(function(id){
        var node=sec.diagram.nodes[id], b=node && node.binding;
        if (b!=null && (!object(b) || !entityRef(b.entityRef))) errors.push('nodes.'+id+'.binding: expected a catalog entityRef');
        if (b && b.api && !entityRef(b.api.entityRef)) errors.push('nodes.'+id+'.binding.api: expected an API entityRef');
      });
    });
    sections(raw).forEach(function(sec){
      var d=sec.diagram, steps=Array.isArray(d.steps)?d.steps:[], ids=new Set(steps.map(function(s){return s && s.id;}));
      if(d.referenceTrace!=null){var r=d.referenceTrace;if(!object(r) || r.version!==1 || !object(r.trace) || !object(r.trace.context) || !Array.isArray(r.trace.spans) || typeof r.trace.traceId!=='string' || !object(r.approval) || typeof r.approval.reason!=='string' || typeof r.contract!=='string')errors.push('referenceTrace: expected an approved version-1 trace mapping');}
      if(d.incidents!=null && (!Array.isArray(d.incidents) || d.incidents.some(function(i){return !object(i) || typeof i.pathId!=='string' || typeof i.traceId!=='string' || typeof i.firstDivergence!=='string';})))errors.push('incidents: expected comparison provenance objects');
      var parents=new Map(steps.filter(function(s){return s && s.traceMatch;}).map(function(s){return [s.id,s.traceMatch.parentStepId];}));
      parents.forEach(function(parent,id){var seen=new Set([id]);while(parent){if(seen.has(parent)){errors.push('traceMatch: cyclic parentStepId');break;}seen.add(parent);parent=parents.get(parent);}});
      steps.forEach(function(st){
        if(!st)return;
        var m=st.traceMatch;
        if(m!=null){
          if(!object(m) || typeof m.serviceName!=='string' || !m.serviceName.trim() || typeof m.operation!=='string' || !m.operation.trim() || !st.id)errors.push('traceMatch: stable step ID, serviceName and operation required');
          else {
            if(m.panelId && !(Array.isArray(d.panels)?d.panels:[]).some(function(p){return p && p.id===m.panelId && p.type==='queue';}))errors.push('traceMatch.panelId: expected a declared queue panel');
            if(m.nodeId && !Object.prototype.hasOwnProperty.call(d.nodes || {},m.nodeId))errors.push('traceMatch: unknown nodeId '+m.nodeId);
            if(m.parentStepId && (!ids.has(m.parentStepId) || m.parentStepId===st.id))errors.push('traceMatch: unknown or self parentStepId');
            ['maxDurationMs','maxQueueDepth'].forEach(function(k){if(m[k]!=null && (typeof m[k]!=='number' || !Number.isFinite(m[k]) || m[k]<0))errors.push('traceMatch.'+k+': nonnegative number required');});
            if(m.occurrence!=null && (!Number.isInteger(m.occurrence) || m.occurrence<1))errors.push('traceMatch.occurrence: positive integer required');
            if(m.repeat!=null && m.repeat!=='attempts')errors.push('traceMatch.repeat: expected attempts');
            if(m.repeat && m.occurrence)errors.push('traceMatch: occurrence and repeat cannot be combined');
            var allowed=['service.namespace','service.version','deployment.environment.name','deployment.environment','http.response.status_code','http.status_code','db.system','db.system.name','messaging.queue.depth','queue.depth','messaging.message.age_ms','flow.backpressure','flow.delivery_failed','retry.attempt','flow.step.id'];
            if(m.attributes!=null && (!object(m.attributes) || Object.keys(m.attributes).some(function(k){return !allowed.includes(k) || !['string','number','boolean'].includes(typeof m.attributes[k]);})))errors.push('traceMatch.attributes: use supported operational attributes only');
          }
        }
        if(st.conditions!=null){
          if(!Array.isArray(st.conditions))errors.push('conditions: expected an array');
          else st.conditions.forEach(function(c){
            if(!object(c) || !['service-error','delivery-failed','slow','database-slow','queue-buildup','backpressure','retry','unknown','ambiguous'].includes(c.kind) || typeof c.label!=='string')errors.push('conditions: expected a supported kind and label');
            if(c && c.nodeId && !Object.prototype.hasOwnProperty.call(d.nodes || {},c.nodeId))errors.push('conditions: unknown nodeId');
          });
        }
      });
    });
    return errors;
  }
  function links(value){
    var out=[], b=value && value.binding;
    function add(label,url){url=http(url); if(url) out.push({label:label,url:url});}
    if (b){
      add('Backstage · '+(b.label || b.entityRef),b.catalogUrl);
      if(b.api){
        add('API · '+(b.api.operationId || b.api.title || b.api.entityRef),b.api.definitionUrl);
        Object.keys(b.api.endpoints || {}).forEach(function(env){add(env+' endpoint',b.api.endpoints[env]);});
      }
    }
    (value && Array.isArray(value.codeRefs) ? value.codeRefs : []).forEach(function(ref){add('Code · '+(ref.label || ref.id),codeUrl(ref));});
    return out;
  }
  return {version:1,clone:clone,http:http,entityRef:entityRef,pageOf:pageOf,sections:sections,catalog:catalog,binding:binding,
    referenceErrors:referenceErrors,locate:locate,codeUrl:codeUrl,references:references,validate:validate,links:links};
})();
/* ---- src/panels/registry.js ---- */
/* Trusted, build-discovered panel definitions. Registration is DOM-free so the
   same contracts can validate specs in a packaged backend. */
var PanelRegistry = (function () {
  var definitions = Object.create(null),
    typeIds = [];
  function extend(type, facets) {
    if (
      !/^[a-z][a-z0-9-]*$/.test(type) ||
      !facets ||
      typeof facets !== 'object' ||
      Array.isArray(facets)
    )
      throw new Error('Invalid panel definition: ' + type);
    var definition = definitions[type];
    if (!definition) {
      definition = definitions[type] = Object.create(null);
      typeIds.push(type);
    }
    Object.keys(facets).forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(definition, key))
        throw new Error('Duplicate panel definition: ' + type + '.' + key);
    });
    Object.keys(facets).forEach(function (key) {
      definition[key] = facets[key];
    });
    typeIds.sort(function (a, b) {
      var left = definitions[a].order,
        right = definitions[b].order;
      return (
        (left == null ? 10000 : left) - (right == null ? 10000 : right) ||
        (a < b ? -1 : a > b ? 1 : 0)
      );
    });
    return definition;
  }
  return {
    extend: extend,
    define: extend,
    get: function (type) {
      return definitions[type];
    },
    types: function () {
      return typeIds.slice();
    },
    typeIds: typeIds,
  };
})();
// Compatibility alias; populated by module discovery, never a handwritten list.
var PANEL_TYPES = PanelRegistry.typeIds;

function panelCapability(type, key, fallback) {
  var definition = PanelRegistry.get(type),
    layout = definition && definition.layout;
  return layout && Object.prototype.hasOwnProperty.call(layout, key) ? layout[key] : fallback;
}

/* Mutates the caller's clone, never the source spec. '*' visits array elements
   or own object values. A mapped null removes the reference; absent mappings
   preserve it. The same metadata serves rename, delete and cross-spec paste. */
function panelRemapReferences(panel, kind, mapping, exists) {
  var definition = panel && PanelRegistry.get(panel.type);
  var paths = (definition && definition.references && definition.references[kind]) || [];
  paths.forEach(function (path) {
    var parts = path.split('.');
    function visit(object, index) {
      if (!object || typeof object !== 'object') return;
      var part = parts[index];
      var keys = part === '*' ? Object.keys(object) : [part];
      keys.forEach(function (key) {
        if (!Object.prototype.hasOwnProperty.call(object, key)) return;
        if (index < parts.length - 1) {
          visit(object[key], index + 1);
          return;
        }
        var value = object[key];
        if (typeof value !== 'string') {
          if (exists) delete object[key];
          return;
        }
        if (mapping && Object.prototype.hasOwnProperty.call(mapping, value)) {
          if (mapping[value] == null) delete object[key];
          else object[key] = mapping[value];
        } else if (exists && !exists(value)) delete object[key];
      });
    }
    visit(panel, 0);
  });
  return panel;
}
/* ---- src/validator.js ---- */
/* validator.js — shared constants, validation rules and advisory lint.
   Browser-pure fragment: build.py wraps it (with engine.js + a boot file) in one
   IIFE. Contains no DOM access, so tests load it under Node via vm. */

var ICON_SET = ['terminal','cloud','shield','gear','db','antenna','thermo','pump','router','package','key','server','chip','phone','house','camera','doorbell','lock','bulb','car'];
var TINT_SET = ['cmd','auth','data','mqtt','dev'];
/* Per-step node state is semantic narrative state, never an authored color.
   `base` is the explicit clearing token; null clears too. */
var TONE_SET = ['alert','warn','ok','dim','base'];
var VIEW_SET = ['ambient','step','ambient-only'];

var SKIN_NAMES = ['aurora','daylight','editorial','terminal','pastel','blueprint'];
var DEFAULT_SKIN = 'pastel';
var SKINS = {
  aurora:   {bg:'#0B1220', grid:'#16233C', halos:true,  glow:true,  retNeutral:'#93A7C9'},
  daylight: {bg:'#FBFAF6', grid:'',        halos:false, glow:false, retNeutral:'#6B6F7A'},
  /* The four showcase skins are CSS overlays authored on the Aurora palette. */
  editorial:{bg:'#0B1220', grid:'#16233C', halos:true,  glow:true,  retNeutral:'#93A7C9'},
  terminal: {bg:'#0B1220', grid:'#16233C', halos:true,  glow:true,  retNeutral:'#93A7C9'},
  pastel:   {bg:'#0B1220', grid:'#16233C', halos:true,  glow:true,  retNeutral:'#93A7C9'},
  blueprint:{bg:'#0B1220', grid:'#16233C', halos:true,  glow:true,  retNeutral:'#93A7C9'}
};
/* ONE kind->style table: edges, packets, arrowheads, and the legend all read it. */
var BUILTIN_PROTOCOLS = {
  https:  {label:'HTTPS',        color:{aurora:'#38E1FF', daylight:'#4956C9'}},
  int:    {label:'service call', color:{aurora:'#A78BFA', daylight:'#7C5CC4'}},
  mqtt:   {label:'MQTT',         color:{aurora:'#F471B5', daylight:'#C2417E'}},
  sqs:    {label:'SQS',          color:{aurora:'#FFB454', daylight:'#B45309'}},
  rmq:    {label:'RabbitMQ',     color:{aurora:'#FF8A65', daylight:'#C0392B'}},
  pulsar: {label:'Pulsar',       color:{aurora:'#2DD4BF', daylight:'#0F766E'}},
  tls:    {label:'TLS',          color:{aurora:'#FACC15', daylight:'#A16207'}},
  ws:     {label:'WebSocket',    color:{aurora:'#60A5FA', daylight:'#2563EB'}}
};
var ACCENTS = {green:'#4ADE80', blue:'#38BDF8', violet:'#A78BFA', amber:'#FFB454',
               pink:'#F471B5', cyan:'#38E1FF', red:'#F87171', slate:'#94A3B8'};
var ACCENT_CYCLE = ['green','blue','violet','amber'];
var DASH_MAIN = '9 7', DASH_RET = '4 6';
var LANE_FALLBACK = '#94A3B8';
var CONTRACT_VERSION = '1';

function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }
/* finite-only numeric check: a JSON overflow literal (1e400) parses to
   Infinity, which is typeof 'number' but poisons percentage math into NaN */
function isFiniteNum(v){ return typeof v === 'number' && isFinite(v); }
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function isHex(s){ return typeof s === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(s); }
function resolveProtocols(page){
  var out = {};
  Object.keys(BUILTIN_PROTOCOLS).forEach(function(k){ out[k] = BUILTIN_PROTOCOLS[k]; });
  var extra = page.protocols || {};
  Object.keys(extra).forEach(function(k){
    var p = extra[k] || {};
    out[k] = {label: p.label || k, color: p.color || '#9AA4B2'};
  });
  return out;
}
function kindColor(protos, kind, skin){
  var p = protos[kind] || protos['int'];
  var c = p.color;
  if (typeof c === 'string') return c;
  return c[skin] || c.aurora || '#9AA4B2';
}
function resolveLanes(page){
  var out = {};
  var raw = page.lanes || {};
  Object.keys(raw).forEach(function(k){
    var l = raw[k] || {};
    out[k] = {label: l.label || k, color: isHex(l.color) ? l.color : LANE_FALLBACK};
  });
  return out;
}

/* Fragment-level reveal fields are shared by section bullet objects,
   contract-card rows, and diagram edges. Indices are zero-based. Invalid
   values are ignored by the renderer, but every bad authoring shape gets a
   precise warning here. */
function revealFieldWarnings(obj, path, stepCount, warnings){
  if (!obj || typeof obj !== 'object') return;
  var valid = {};
  ['revealAt', 'hideAt'].forEach(function(k){
    if (!Object.prototype.hasOwnProperty.call(obj, k)) return;
    if (!stepCount)
      warnings.push(path + '.' + k + ': reveal fields require diagram.steps in this section — ambient rendering stays visible');
    if (!(typeof obj[k] === 'number' && isFinite(obj[k]) &&
          Math.floor(obj[k]) === obj[k] && obj[k] >= 0)){
      warnings.push(path + '.' + k + ': must be a non-negative integer step index — ignored');
    } else {
      valid[k] = true;
    }
  });
  if (valid.revealAt && stepCount && obj.revealAt >= stepCount)
    warnings.push(path + '.revealAt: step index ' + obj.revealAt +
      ' is beyond the diagram step count (' + stepCount + ') — fragment never reveals');
  if (valid.revealAt && valid.hideAt && obj.hideAt <= obj.revealAt)
    warnings.push(path + '.hideAt: must be greater than revealAt (' + obj.revealAt + ') — fragment has no visible step');
}

function bulletRevealWarnings(items, path, stepCount, warnings){
  if (!Array.isArray(items)) return;
  items.forEach(function(item, i){
    if (!item || typeof item !== 'object' || Array.isArray(item)) return;
    revealFieldWarnings(item, path + '[' + i + ']', stepCount, warnings);
    bulletRevealWarnings(item.sub, path + '[' + i + '].sub', stepCount, warnings);
  });
}

function validatePaths(d, path, errors){
  if (d.paths == null) return;
  if (!Array.isArray(d.paths) || !d.paths.length){ errors.push(path + '.paths: expected a nonempty array of paths'); return; }
  var ids = new Map(), pathIds = new Set();
  (Array.isArray(d.steps) ? d.steps : []).forEach(function(s){
    if (s && typeof s.id === 'string' && s.id) ids.set(s.id,(ids.get(s.id) || 0) + 1);
  });
  d.paths.forEach(function(p,i){
    var at = path + '.paths[' + i + ']';
    if (!p || typeof p !== 'object' || Array.isArray(p)){ errors.push(at + ': expected a path object'); return; }
    if (typeof p.id !== 'string' || !p.id.trim() || pathIds.has(p.id)) errors.push(at + '.id: required unique nonempty string');
    pathIds.add(p.id);
    if (p.label != null && (typeof p.label !== 'string' || !p.label.trim())) errors.push(at + '.label: expected a nonempty string');
    if (p.color != null && !isHex(p.color)) errors.push(at + '.color: expected a hex color');
    if (!Array.isArray(p.steps) || !p.steps.length){ errors.push(at + '.steps: expected one or more step IDs'); return; }
    var seen = new Set();
    p.steps.forEach(function(id,j){
      if (typeof id !== 'string' || ids.get(id) !== 1) errors.push(at + '.steps[' + j + ']: must reference a unique existing step ID');
      if (seen.has(id)) errors.push(at + '.steps[' + j + ']: repeated step ID; create a distinct step for a repeated operation');
      seen.add(id);
    });
  });
}

function sectionLayoutProfileWarnings(d, v, path, warnings){
  if(v == null)return;
  if(typeof v!=='object'||Array.isArray(v)){warnings.push(path+'.sectionLayout: expected default/backstage/confluence grid layouts');return;}
  Object.keys(v).forEach(function(target){
    if(['default','backstage','confluence'].indexOf(target)<0){warnings.push(path+'.sectionLayout: unknown target '+target);return;}
    var list=v[target],used=Object.create(null),tiles=sectionLayoutTiles(d);
    if(!Array.isArray(list)){warnings.push(path+'.sectionLayout.'+target+': expected an array of tiles');return;}
    list.forEach(function(it,i){
      var p=path+'.sectionLayout.'+target+'['+i+']',key=sectionLayoutKey(it);
      if(!it||typeof it!=='object'||Array.isArray(it)||!['x','y','w','h'].every(function(k){return Number.isInteger(it[k]);})||it.x<0||it.y<0||it.w<1||it.h<3||it.x+it.w>12||it.y>500||it.h>40)
        warnings.push(p+': use integer x/y/w/h; 12 columns, y 0–500, h 3–40');
      if(it && it.hidden!=null && (typeof it.hidden!=='boolean' || it.controls!=null))warnings.push(p+': hidden must be a boolean on a diagram or panel tile; step controls stay available');
      if(it && it.controls!=null && (it.controls!=='steps'||it.panel!=null))warnings.push(p+': controls must be "steps", without a panel ID');
      if(it && it.attachTo!=null && (it.controls!=='steps' || !(it.attachTo==='diagram' || tiles.some(function(t){return t.key===it.attachTo && panelCapability(t.type,'attachControls',false);}))))warnings.push(p+'.attachTo: attach step controls to "diagram" or "panel:<homemap ID>"');
      if(used[key]||(key!=='steps'&&!tiles.some(function(t){return t.key===key;})))warnings.push(p+': duplicate or unknown diagram/panel tile');
      used[key]=true;
    });
  });
}
function sectionLayoutWarnings(d, path, warnings){
  sectionLayoutProfileWarnings(d,d.sectionLayout,path,warnings);
  if(d.layouts!=null){
    if(!Array.isArray(d.layouts)||!d.layouts.length)warnings.push(path+'.layouts: expected a nonempty array of named layouts');
    else{
      var used=Object.create(null);
      d.layouts.forEach(function(v,i){
        var p=path+'.layouts['+i+']';
        if(!v || typeof v!=='object' || Array.isArray(v)){warnings.push(p+': expected a named layout');return;}
        if(typeof v.id!=='string' || !/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(v.id) || used[v.id])warnings.push(p+'.id: use a unique ID starting with a letter, followed by letters, digits, _ or - (up to 64 characters)');
        if(typeof v.id==='string')used[v.id]=true;
        if(typeof v.name!=='string' || !v.name.trim() || v.name.trim().length>40)warnings.push(p+'.name: use a nonempty name of up to 40 characters');
        if(!v.sectionLayout || !['default','backstage','confluence'].some(function(k){return Array.isArray(v.sectionLayout[k]);}))warnings.push(p+'.sectionLayout: declare at least one host profile');
        sectionLayoutProfileWarnings(d,v.sectionLayout,p,warnings);
        if(v.steps!=null){
          var ids=(d.steps || []).map(function(st){return st && st.id;});
          if(!Array.isArray(v.steps) || !v.steps.length || v.steps.some(function(id,i){return typeof id!=='string' || ids.filter(function(s){return s===id;}).length!==1 || v.steps.indexOf(id)!==i;}))warnings.push(p+'.steps: use a nonempty list of unique existing step IDs; omit for all steps');
          else if(!sectionViewStepsReachable(d,v.steps))warnings.push(p+'.steps: select at least one step used by a story path');
        }
      });
    }
  }
  if(d.defaultLayout!=null && !(Array.isArray(d.layouts) && diagramLayoutViews(d).some(function(v){return !v.legacy && v.id===d.defaultLayout;})))
    warnings.push(path+'.defaultLayout: name an existing layout ID');
}
/* Establish only the containers used by dependent traversal. Never repair or
   replace authored values: the editor must retain the exact failing source.
   Optional null diagram fields still mean absent; panel-specific shapes and
   recoverable presentation fields keep their existing warning semantics. */
function specStructureErrors(page){
  var errors = [];
  function object(value, path){
    if (specObject(value)) return true;
    errors.push(path + ': must be an object');
    return false;
  }
  function list(value, path, visit){
    if (!Array.isArray(value)){ errors.push(path + ': must be an array'); return; }
    value.forEach(function(item, i){
      var at = path + '[' + i + ']';
      if (object(item, at) && visit) visit(item, at);
    });
  }
  function section(sec, path){
    if (sec.diagram == null) return;
    var d = sec.diagram, at = path + '.diagram';
    if (!object(d, at)) return;
    if (d.nodes != null && object(d.nodes, at + '.nodes'))
      Object.keys(d.nodes).forEach(function(id){ object(d.nodes[id], at + '.nodes.' + id); });
    ['edges', 'floats', 'panels', 'steps'].forEach(function(key){
      if (d[key] != null) list(d[key], at + '.' + key);
    });
  }
  ['blocks', 'sections'].forEach(function(key){
    if (!Object.prototype.hasOwnProperty.call(page, key)) return;
    list(page[key], 'page.' + key, function(block, path){
      // Finding paths within the page retain the existing editor convention.
      path = path.slice(5);
      if (Object.prototype.hasOwnProperty.call(block, 'tabs')){
        list(block.tabs, path + '.tabs', function(tab, at){
          if (Object.prototype.hasOwnProperty.call(tab, 'sections'))
            list(tab.sections, at + '.sections', section);
        });
      } else section(block, path);
    });
  });
  return errors;
}

function validateSection(sec, P, protos, lanes, errors, warnings){
  if (!sec || typeof sec !== 'object'){ errors.push(P + ': must be an object'); return; }
  var sectionStepCount = sec.diagram && Array.isArray(sec.diagram.steps) ? sec.diagram.steps.length : 0;
  bulletRevealWarnings(sec.bullets, P + '.bullets', sectionStepCount, warnings);
  if (sec.accent && !ACCENTS[sec.accent] && !isHex(sec.accent))
    warnings.push(P + '.accent: unknown accent "' + sec.accent + '" — using the default cycle (valid: ' + Object.keys(ACCENTS).join(' ') + ', or "#RRGGBB")');
  if (sec.source && typeof sec.source !== 'string')
    warnings.push(P + '.source: must be a URL string — source chip skipped');
  if (Object.prototype.hasOwnProperty.call(sec, 'collapsed') && typeof sec.collapsed !== 'boolean')
    warnings.push(P + '.collapsed: must be a boolean — using the expanded default');
  if (sec.contract != null){
    var CP = P + '.contract';
    if (typeof sec.contract !== 'object' || Array.isArray(sec.contract)){
      warnings.push(CP + ': must be an object {title?, source?, fields:[...], note?} — card skipped');
    } else {
      var ct = sec.contract;
      if (ct.source && typeof ct.source !== 'string')
        warnings.push(CP + '.source: must be a URL string — source chip skipped');
      if (!Array.isArray(ct.fields) || !ct.fields.length){
        warnings.push(CP + '.fields: required — array of {k, v?, g?, hot?, link?, delta?, revealAt?, hideAt?}; card renders without rows');
      } else ct.fields.forEach(function(f, fi){
        if (!f || typeof f !== 'object'){
          warnings.push(CP + '.fields[' + fi + ']: must be an object with a "k" — row skipped');
          return;
        }
        if (!f.k) warnings.push(CP + '.fields[' + fi + '].k: required — row skipped');
        if (f.link && typeof f.link !== 'string')
          warnings.push(CP + '.fields[' + fi + '].link: must be a URL string — link ignored');
        if (f.delta != null && ['added','removed','changed'].indexOf(f.delta) < 0)
          warnings.push(CP + '.fields[' + fi + '].delta: unknown token "' + f.delta +
            '" — badge omitted (valid: added removed changed)');
        revealFieldWarnings(f, CP + '.fields[' + fi + ']', sectionStepCount, warnings);
      });
    }
  }
  if (!sec.diagram && !sec.text && !sec.bullets && !sec.heading && !sec.contract)
    warnings.push(P + ': empty section — add heading, text, bullets, contract, or diagram');
  var d = sec.diagram;
  if (!d) return;
  var DP = P + '.diagram';
  validatePaths(d, DP, errors);
  sectionLayoutWarnings(d, DP, warnings);
  if(d.layoutName != null && (typeof d.layoutName!=='string' || !d.layoutName.trim() || d.layoutName.trim().length>40))
    warnings.push(DP+'.layoutName: use a nonempty layout name of up to 40 characters');
  if (d.primaryPanel != null && (typeof d.primaryPanel !== 'string' ||
      !(Array.isArray(d.panels) && d.panels.some(function(p){ return p && p.id === d.primaryPanel; }))))
    warnings.push(DP + '.primaryPanel: must name an existing panel — using the standard flow layout');
  if (d.view && VIEW_SET.indexOf(d.view) < 0)
    warnings.push(DP + '.view: unknown view "' + d.view + '" — using "ambient" (valid: ' + VIEW_SET.join(', ') + ')');
  if (Object.prototype.hasOwnProperty.call(d, 'autoplay') && typeof d.autoplay !== 'boolean')
    warnings.push(DP + '.autoplay: must be true or false — opening paused');
  if (!d.nodes || typeof d.nodes !== 'object'){ errors.push(DP + '.nodes: required — map of node id to {title, sub, icon, tint}'); return; }
  if (!Array.isArray(d.rows) || d.rows.length === 0){ errors.push(DP + '.rows: required — array of rows, each an array of node ids (nested array = stack)'); return; }
  if (d.routing != null && d.routing !== 'lanes' && d.routing !== 'curves')
    warnings.push(DP + '.routing: expected "lanes" or "curves" — using curves');
  if (d.routing === 'lanes'){
    if ((d.floats || []).length || d.rows.some(function(row){ return !Array.isArray(row) || !row.length || row.length>5 || row.some(Array.isArray); }) ||
        (d.edges || []).some(function(e){ return e.from === e.to; }))
      warnings.push(DP + '.routing: lanes requires 1–5 unstacked cards per row, no floats or self-loops — using curves');
    else if ((d.edges || []).some(function(e){ return e.bend; }))
      warnings.push(DP + '.routing: lanes computes its own routes; authored edge bends are ignored');
  }

  var placed = {};
  d.rows.forEach(function(slots, r){
    if (!Array.isArray(slots)){ errors.push(DP + '.rows[' + r + ']: must be an array of slots'); return; }
    slots.forEach(function(s){
      (Array.isArray(s) ? s : [s]).forEach(function(id){
        if (!d.nodes[id]) errors.push(DP + '.rows[' + r + ']: unknown node id "' + id + '" — define it in nodes or remove it');
        else placed[id] = true;
      });
    });
  });
  (d.floats || []).forEach(function(f, fi){
    if (!f || !d.nodes[f.id]) errors.push(DP + '.floats[' + fi + ']: unknown node id "' + (f && f.id) + '"');
    else placed[f.id] = true;
    if (f && f.side && f.side !== 'above' && f.side !== 'below')
      warnings.push(DP + '.floats[' + fi + '].side: unknown side "' + f.side + '" — using "above" (valid: above, below)');
  });
  var groups = (d.groups && typeof d.groups === 'object') ? d.groups : {};
  sanitizedGroupParents(groups, function(key, reason){
    warnings.push(DP + '.groups.' + key + '.parent: ' + reason);
  });
  Object.keys(groups).forEach(function(key){
    var meta = groups[key];
    if (!meta || !Object.prototype.hasOwnProperty.call(meta, 'icon')) return;
    if (typeof meta.icon !== 'string')
      warnings.push(DP + '.groups.' + key + '.icon: must be a string — icon ignored');
    else if (ICON_SET.indexOf(meta.icon) < 0)
      warnings.push(DP + '.groups.' + key + '.icon: unknown icon "' + meta.icon + '" — using "gear" (valid: ' + ICON_SET.join(' ') + ')');
  });
  Object.keys(d.nodes).forEach(function(id){
    if (!placed[id]) warnings.push(DP + '.nodes.' + id + ': defined but not placed in rows or floats — it will not be drawn');
    var n = d.nodes[id] || {};
    if (Object.prototype.hasOwnProperty.call(n, 'delta') && typeof n.delta !== 'boolean')
      warnings.push(DP + '.nodes.' + id + '.delta: must be true or false — ignored');
    if (n.icon && ICON_SET.indexOf(n.icon) < 0) warnings.push(DP + '.nodes.' + id + '.icon: unknown icon "' + n.icon + '" — using "gear" (valid: ' + ICON_SET.join(' ') + ')');
    if (n.tint && TINT_SET.indexOf(n.tint) < 0) warnings.push(DP + '.nodes.' + id + '.tint: unknown tint "' + n.tint + '" — using "cmd" (valid: ' + TINT_SET.join(' ') + ')');
    if (n.link && typeof n.link !== 'string') warnings.push(DP + '.nodes.' + id + '.link: must be a URL string — link ignored');
    if (n.group && !groups[n.group]) warnings.push(DP + '.nodes.' + id + '.group: group "' + n.group + '" not declared in diagram.groups — drawing an untitled boundary');
  });
  var edgeKeys = {};
  (d.edges || []).forEach(function(e, ei){
    var EP = DP + '.edges[' + ei + ']';
    if (e && Object.prototype.hasOwnProperty.call(e, 'delta') && typeof e.delta !== 'boolean')
      warnings.push(EP + '.delta: must be true or false — ignored');
    if (!e || !placed[e.from]) errors.push(EP + '.from: "' + (e && e.from) + '" is not a placed node');
    if (!e || !placed[e.to]) errors.push(EP + '.to: "' + (e && e.to) + '" is not a placed node');
    if (e && e.kind && !protos[e.kind]) warnings.push(EP + '.kind: unknown kind "' + e.kind + '" — using "int"; declare it in page.protocols to style it');
    revealFieldWarnings(e, EP, sectionStepCount, warnings);
    if (e){
      var ek = e.from + '->' + e.to;
      if (edgeKeys[ek])
        warnings.push(EP + ': duplicate edge "' + ek + '" — the engine keys edges by from->to, so the second declaration overrides the first\'s animation and coin anchors; merge them into one edge or make one a return (swap from/to with ret:true)');
      edgeKeys[ek] = true;
    }
  });
  var panelIds = {};
  var panelDeclById = {};
  var panelContexts = Object.create(null);
  (d.panels || []).forEach(function(p, pi){
    var PP = DP + '.panels[' + pi + ']';
    if (!p || typeof p !== 'object'){ errors.push(PP + ': must be an object {id, type, ...}'); return; }
    if (!p.id){ errors.push(PP + '.id: required'); return; }
    if (panelIds[p.id]) errors.push(PP + '.id: duplicate panel id "' + p.id + '"');
    panelIds[p.id] = true;
    panelDeclById[p.id] = p;
    var descriptor = PanelRegistry.get(p.type);
    if (!descriptor)
      warnings.push(PP + '.type: unknown panel type "' + p.type + '" — rendering a placeholder (valid: ' + PanelRegistry.types().join(' ') + ')');
    if (descriptor && descriptor.validateDeclaration)
      panelContexts[p.id] = descriptor.validateDeclaration(p, PP, warnings, errors, d);
  });
  var stepIds = {};
  (d.steps || []).forEach(function(st, ti){
    if (st && Object.prototype.hasOwnProperty.call(st, 'delta') && typeof st.delta !== 'boolean')
      warnings.push(DP + '.steps[' + ti + '].delta: must be true or false — ignored');
    var keys = stepKeys(st);
    var failures = stepFailures(st);
    if (st && st.failures != null){
      var FP = DP + '.steps[' + ti + '].failures';
      if (typeof st.failures !== 'object' || Array.isArray(st.failures)) errors.push(FP + ': expected an object mapping edge keys to dropped or blocked');
      else Object.keys(st.failures).forEach(function(key){
        if (!Object.prototype.hasOwnProperty.call(edgeKeys,key)) errors.push(FP + ': unknown edge \"' + key + '\" (format from->to)');
        if (COMM_FAILURE_MODES.indexOf(st.failures[key]) < 0) errors.push(FP + '.' + key + ': expected dropped or blocked');
      });
    }
    var nds = stepNodes(st);
    var patch = stepPanelPatch(st);
    var tonePatch = stepTonePatch(st);
    var hasToneField = !!(st && Object.prototype.hasOwnProperty.call(st, 'tone'));
    if (st && st.id != null){
      if (typeof st.id !== 'string')
        warnings.push(DP + '.steps[' + ti + '].id: must be a string — ignored');
      else if (stepIds[st.id])
        warnings.push(DP + '.steps[' + ti + '].id: duplicate step id "' + st.id + '" — deep links resolve to the first');
      else stepIds[st.id] = true;
    }
    if (!keys.length && !Object.keys(failures).length && !nds.length && !patch && !tonePatch)
      warnings.push(DP + '.steps[' + ti + ']: no edge/edges, nodes, or panels, or tone — give it something to show');
    keys.forEach(function(k){
      if (!edgeKeys[k]) warnings.push(DP + '.steps[' + ti + ']: "' + k + '" matches no edge (format "from->to") — skipped');
    });
    nds.forEach(function(id){
      if (!placed[id]) warnings.push(DP + '.steps[' + ti + '].nodes: "' + id + '" is not a placed node — skipped');
    });
    if (hasToneField && !tonePatch){
      warnings.push(DP + '.steps[' + ti + '].tone: must be an object mapping node ids to tone tokens — ignored (valid: ' +
        TONE_SET.join(' ') + '; null also clears)');
    } else if (tonePatch){
      Object.keys(tonePatch).forEach(function(id){
        var tone = tonePatch[id];
        if (!d.nodes[id]){
          warnings.push(DP + '.steps[' + ti + '].tone: unknown node id "' + id + '" — tone ignored');
        } else if (tone !== null && TONE_SET.indexOf(tone) < 0){
          warnings.push(DP + '.steps[' + ti + '].tone.' + id + ': unknown tone token "' +
            String(tone) + '" — ignored (valid: ' + TONE_SET.join(' ') + '; null also clears)');
        }
      });
    }
    if (patch) Object.keys(patch).forEach(function(pid){
      if (!panelIds[pid]){
        warnings.push(DP + '.steps[' + ti + '].panels: "' + pid + '" is not a declared panel id — patch ignored');
      } else if (patch[pid] == null || typeof patch[pid] !== 'object' || Array.isArray(patch[pid])){
        // a patch must be an object of widget fields — a bare array/scalar is
        // silently ignored by the engine (classic slip: log lines given as
        // panels.<id>: [...] instead of panels.<id>: {"log": [...]})
        warnings.push(DP + '.steps[' + ti + '].panels.' + pid + ': patch must be an object of widget fields — ' +
          (Array.isArray(patch[pid]) ? 'got an array (log lines go in {"log": [...]})' : 'got ' + typeof patch[pid]) +
          '; the engine ignores this patch');
      } else {
        var panel = panelDeclById[pid], descriptor = PanelRegistry.get(panel.type);
        if (descriptor && descriptor.validatePatch)
          descriptor.validatePatch(patch[pid], DP + '.steps[' + ti + '].panels.' + pid, panel, warnings, panelContexts[pid]);
      }
    });
    if (st && st.lane && !lanes[st.lane])
      warnings.push(DP + '.steps[' + ti + '].lane: lane "' + st.lane + '" not declared in page.lanes — neutral pill');
    if (st && st.link && typeof st.link !== 'string') warnings.push(DP + '.steps[' + ti + '].link: must be a URL string — link ignored');
    if (st && Array.isArray(st.packets)) st.packets.forEach(function(pk, ki){
      if (!pk || !edgeKeys[pk.edge]) warnings.push(DP + '.steps[' + ti + '].packets[' + ki + ']: "' + (pk && pk.edge) + '" matches no edge — skipped');
    });
  });
}

function validate(page){
  var errors = [], warnings = [];
  if (!specObject(page)){ errors.push('top level: expected {page:{blocks:[...]}} (or sections), or a bare diagram with nodes+rows'); return {errors:errors, warnings:warnings}; }
  errors = specStructureErrors(page);
  if (errors.length) return {errors:errors, warnings:warnings};
  if (typeof FlowviewCompatibility !== 'undefined') warnings = warnings.concat(FlowviewCompatibility.metadataWarnings(page));
  if (typeof FlowCanon !== 'undefined') errors = errors.concat(FlowCanon.validate(page));
  var blocks = blocksOf(page);
  if (!blocks.length){
    errors.push('page.blocks: required — provide at least one section or tabs block');
    return {errors:errors, warnings:warnings};
  }
  if (page.skin && SKIN_NAMES.indexOf(page.skin) < 0)
    warnings.push('page.skin: unknown skin "' + page.skin + '" — using "' + DEFAULT_SKIN + '" (valid: ' + SKIN_NAMES.join(', ') + ')');
  if (Object.prototype.hasOwnProperty.call(page, 'generatedFrom')){
    var gf = page.generatedFrom;
    if (!gf || typeof gf !== 'object' || Array.isArray(gf)){
      warnings.push('page.generatedFrom: must be an object {url, label?, version?, at?} — provenance line skipped');
    } else {
      ['url', 'label', 'version', 'at'].forEach(function(k){
        if (Object.prototype.hasOwnProperty.call(gf, k) && typeof gf[k] !== 'string')
          warnings.push('page.generatedFrom.' + k + ': must be a string — ' +
            (k === 'url' ? 'provenance line skipped' : 'value ignored'));
      });
      if (!Object.prototype.hasOwnProperty.call(gf, 'url')){
        warnings.push('page.generatedFrom.url: required — provenance line skipped');
      } else if (typeof gf.url === 'string' && !/^https?:\/\//i.test(gf.url)){
        warnings.push('page.generatedFrom.url: only http(s) URLs become links — label rendered as text');
      }
    }
  }
  if (page.contract != null){
    var major = String(page.contract).split('.')[0];
    if (major !== CONTRACT_VERSION)
      warnings.push('page.contract: spec declares contract "' + page.contract +
        '" — this engine implements contract ' + CONTRACT_VERSION +
        '; rendering proceeds but re-check the spec against the current authoring contract');
  }
  validateDetails(page, errors, warnings);
  var protos = resolveProtocols(page);
  var lanes = resolveLanes(page);
  blocks.forEach(function(b){
    if (b.type === 'section'){
      validateSection(b.sec, b.path, protos, lanes, errors, warnings);
    } else {
      if (!b.tabs.length) warnings.push(b.path + '.tabs: empty tabs block');
      b.tabs.forEach(function(t){
        if (!t.sections.length) warnings.push(t.path + '.sections: tab has no sections');
        t.sections.forEach(function(sec, k){
          validateSection(sec, t.path + '.sections[' + k + ']', protos, lanes, errors, warnings);
        });
      });
    }
  });
  return {errors:errors, warnings:warnings};
}

/* ---------------- lint (advisory warnings, never errors) ----------------
   Layout-aware heuristics for spec authors who cannot see the render — an
   authoring agent gets these from tools/validate.js before any browser is
   involved. Uses layout()/isWrap() from core/geometry.js (same logical bundle).
   Defensive: a diagram that fails basic validation is skipped, never thrown
   on. */
var LINT_CHAR_PX = 6.35;      /* mono label width estimate, px per char */
var LINT_CORRIDOR_MAX = 4;    /* cross-row edges per row gap before warning */

function lintDiagram(d, DP, usedKinds, warnings){
  if (!d || !d.nodes || typeof d.nodes !== 'object' ||
      !Array.isArray(d.rows) || !d.rows.length) return;
  (d.edges || []).forEach(function(e){
    if (e && e.kind) usedKinds[e.kind] = true;
  });
  var L;
  try { L = layout(d); } catch (ex){ return; }

  var corridor = {};
  (d.edges || []).forEach(function(e, ei){
    if (!e) return;
    var a = L.pos[e.from], b = L.pos[e.to];
    if (!a || !b) return;
    if (a.row >= 0 && b.row >= 0 && a.row !== b.row){
      var g = Math.min(a.row, b.row);
      corridor[g] = (corridor[g] || 0) + 1;
    }
    if (e.label){
      var chord = Math.sqrt(Math.pow(b.cx - a.cx, 2) + Math.pow(b.cy - a.cy, 2));
      var usable;
      if (isWrap(e, L)) usable = chord * 2.2;
      else if (a.row === b.row && a.row >= 0) usable = Math.max(30, chord - (a.w + b.w) / 2);
      else usable = chord * 1.25;
      var labelPx = String(e.label).length * LINT_CHAR_PX;
      if (labelPx > usable){
        var shown = String(e.label).length > 28 ? String(e.label).slice(0, 25) + '…' : String(e.label);
        warnings.push(DP + '.edges[' + ei + '].label: "' + shown + '" (~' + Math.round(labelPx) +
          'px) is longer than its edge can carry (~' + Math.round(usable) +
          'px) — shorten it, or the auto-layout will push it far off the line');
      }
    }
  });
  Object.keys(corridor).forEach(function(g){
    if (corridor[g] > LINT_CORRIDOR_MAX)
      warnings.push(DP + ': ' + corridor[g] + ' edges cross the corridor between rows ' +
        (Number(g) + 1) + ' and ' + (Number(g) + 2) +
        ' — expect crowding; consider fewer return edges or a second section');
  });

  var reportedPairs = new Set();
  diagramPathList(d).forEach(function(path){
    var firstEdgeAt = new Map();
    path.indices.forEach(function(ti){
      var k = stepDeliveredKeys(d.steps[ti])[0];
      if (!k) return;
      if (firstEdgeAt.has(k)){
        var earlier=firstEdgeAt.get(k), pair=earlier+':'+ti;
        if(!reportedPairs.has(pair))warnings.push(DP + '.steps[' + ti + ']: shares first edge "' + k + '" with steps[' +
          earlier + '] — both step coins land on the same midpoint; reorder the edges list of one step');
        reportedPairs.add(pair);
      }else firstEdgeAt.set(k,ti);
    });
  });
}

function lintPage(page){
  var warnings = [];
  if (!page) return warnings;
  var usedKinds = {};
  blocksOf(page).forEach(function(b){
    if (b.type === 'section'){
      if (b.sec && b.sec.diagram) lintDiagram(b.sec.diagram, b.path + '.diagram', usedKinds, warnings);
    } else {
      b.tabs.forEach(function(t){
        t.sections.forEach(function(sec, k){
          if (sec && sec.diagram) lintDiagram(sec.diagram, t.path + '.sections[' + k + '].diagram', usedKinds, warnings);
        });
      });
    }
  });
  Object.keys(page.protocols || {}).forEach(function(k){
    if (!usedKinds[k])
      warnings.push('page.protocols.' + k + ': declared but no edge uses kind "' + k + '" — remove it or use it');
  });
  return warnings;
}
/* ---- src/core/navigation.js ---- */
/* Pure document references and hash navigation. No viewer initialization;
   only link-base canonicalization needs the standard URL constructor. */

/* ---------------- deep-link hash (C2/E3, pure core) ---------------- */
function slugify(s){
  var out = String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return out || 'tab';
}
function sectionSlugify(s){
  var out = String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (!out) out = 'section';
  /* Purely numeric slugs would be indistinguishable from the accepted legacy
     rendered-section index, so keep the two namespaces disjoint. */
  if (/^\d+$/.test(out)) out = 'section-' + out;
  return out;
}
function sectionReferences(headings){
  var used = {};
  return (Array.isArray(headings) ? headings : []).map(function(heading, index){
    /* Heading-less sections retain their rendered index as the canonical
       fallback. Heading references are unique document-wide. */
    if (typeof heading !== 'string' || !heading.trim()){
      var positional = String(index + 1);
      used[positional] = true;
      return positional;
    }
    var base = sectionSlugify(heading), ref = base, suffix = 2;
    while (used[ref]) ref = base + '-' + suffix++;
    used[ref] = true;
    return ref;
  });
}
function parseHash(h){
  var kv = {};
  String(h || '').replace(/^#/, '').split('&').forEach(function(part){
    var i = part.indexOf('=');
    if (i > 0){
      try { kv[decodeURIComponent(part.slice(0, i))] = decodeURIComponent(part.slice(i + 1)); }
      catch (ex) { /* malformed escape: ignore that pair */ }
    }
  });
  var result = {b: kv.b != null ? kv.b : null,
          t: kv.t != null ? kv.t : null,
          d: kv.d != null ? kv.d : null,
          c: kv.c != null ? kv.c : null,
          r: kv.r != null ? kv.r : null,
          s: kv.s != null ? kv.s : null,
          x: kv.x != null ? kv.x : null,
          e: kv.e != null ? kv.e : null,
          m: (kv.m === 'step' || kv.m === 'ambient') ? kv.m : null};
  if (kv.p != null) result.p = kv.p;
  if (kv.q != null) result.q = kv.q;
  return result;
}
function encodeSectionRefList(value){
  return String(value == null ? '' : value).split(',').map(function(ref){
    return encodeURIComponent(ref);
  }).join(',');
}
function buildHash(st){
  var parts = [];
  if (st && st.b != null) parts.push('b=' + encodeURIComponent(st.b));
  if (st && st.t != null) parts.push('t=' + encodeURIComponent(st.t));
  if (st && st.d != null) parts.push('d=' + encodeURIComponent(st.d));
  if (st && st.m) parts.push('m=' + st.m);
  if (st && st.p != null) parts.push('p=' + encodeURIComponent(st.p));
  if (st && st.s != null) parts.push('s=' + encodeURIComponent(st.s));
  if (st && st.q != null) parts.push('q=' + encodeURIComponent(st.q));
  if (st && st.c != null) parts.push('c=' + encodeURIComponent(st.c));
  if (st && st.r != null) parts.push('r=' + encodeURIComponent(st.r));
  if (st && st.x != null) parts.push('x=' + encodeSectionRefList(st.x));
  if (st && st.e != null) parts.push('e=' + encodeSectionRefList(st.e));
  return parts.length ? '#' + parts.join('&') : '';
}
function canonicalLinkBase(base){
  if (typeof base !== 'string' || /[\s"]/.test(base)) return null;
  try {
    var parsed = new URL(base);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    var href = parsed.href;
    /* Keep the serialized value safe to embed in copied text even if URL
       parsing behavior changes or a non-special URL slips through later. */
    return /[\s"]/.test(href) ? null : href;
  } catch (ex) { return null; }
}
function isValidLinkBase(base){
  return canonicalLinkBase(base) !== null;
}
function composeLinkURL(base, hash){
  var params = String(hash || '').replace(/^#/, '');
  if (!params) return base;
  var tail = base.charAt(base.length - 1);
  return base + (tail === '&' || tail === '#' ? '' :
    (base.indexOf('#') >= 0 ? '&' : '#')) + params;
}
function oneBasedIndex(ref, count){
  if (ref == null || !/^\d+$/.test(String(ref))) return -1;
  var n = parseInt(String(ref), 10) - 1;
  return n >= 0 && n < count ? n : -1;
}
function tabIndexOf(ref, slugs, count){
  if (ref == null) return -1;
  var n = slugs.indexOf(String(ref));
  return n >= 0 ? n : oneBasedIndex(ref, count);
}
function tabReference(slugs, index){
  var slug = slugs[index];
  if (slug != null && slugs.indexOf(slug) === index) return slug;
  var ref = String(index + 1);
  while (slugs.indexOf(ref) >= 0) ref = '0' + ref;
  return ref;
}
function stepIndexOf(stepIds, ref){
  if (ref == null) return -1;
  var str = String(ref);
  for (var i = 0; i < stepIds.length; i++) if (stepIds[i] === str) return i;
  return oneBasedIndex(str, stepIds.length);
}
function stepReference(stepIds, index){
  var id = stepIds[index];
  if (typeof id === 'string' && id && stepIds.indexOf(id) === index &&
      stepIds.lastIndexOf(id) === index) return id;
  var ref = String(index + 1);
  while (stepIds.indexOf(ref) >= 0) ref = '0' + ref;
  return ref;
}

/* Resolve a parsed fragment against a DOM-free page manifest. Canonical links
   use the unique heading-derived section reference for d/c, falling back to a
   rendered section number only when the section has no heading. Numeric d/c
   references remain accepted as legacy rendered indices. Direct diagram and
   contract targets are resolved independently so their state can compose. */
function resolveHashTarget(st, manifest){
  st = st || {};
  manifest = manifest || {};
  var tabs = Array.isArray(manifest.tabBlocks) ? manifest.tabBlocks : [];
  var sections = Array.isArray(manifest.sections) ? manifest.sections : [];
  function sectionAt(ref){
    if (ref == null) return null;
    var key = String(ref), i;
    for (i = 0; i < sections.length; i++)
      if (sections[i].reference != null && String(sections[i].reference) === key)
        return sections[i];
    for(i=0;i<sections.length;i++)if(sections[i].aliases && sections[i].aliases.indexOf(key)>=0)return sections[i];
    var n = oneBasedIndex(key, sections.length);
    if (n < 0) return null;
    for (i = 0; i < sections.length; i++)
      if (sections[i].number === n + 1) return sections[i];
    return null;
  }
  function route(sec, out){
    if (sec && sec.tabBlock != null){
      out.tabBlock = sec.tabBlock;
      out.tab = sec.tab;
    }
    return out;
  }
  function diagram(sec, legacy){
    if (!sec || (!Array.isArray(sec.stepIds) && !sec.hasDiagram)) return {kind:'invalid'};
    var mode = (st.m === 'step' || st.s != null) ? 'step' :
               (st.m === 'ambient' ? 'ambient' : null);
    if(!Array.isArray(sec.stepIds))mode=null;
    var step = mode === 'step' ? (st.s != null ? stepIndexOf(sec.stepIds, st.s) : 0) : null;
    return route(sec, {kind:'diagram', section:sec.number, mode:mode,
                       step:step, legacy:!!legacy, tabBlock:null, tab:null});
  }

  var block = null, blockIndex = st.b != null ? oneBasedIndex(st.b, tabs.length) :
                   (tabs.length ? 0 : -1);
  if (blockIndex >= 0) block = tabs[blockIndex];
  var ti = block ? tabIndexOf(st.t, block.slugs || [], block.count || 0) : -1;
  if (st.t != null && (!block || ti < 0)) return {kind:'invalid'};

  var diagramTarget = null;
  if (st.d != null){
    diagramTarget = diagram(sectionAt(st.d), false);
    if (diagramTarget.kind === 'invalid') return diagramTarget;
  } else if (st.m === 'step' || st.m === 'ambient' || st.s != null){
    var legacySec = null;
    if (block){
      var activeTab = ti >= 0 ? ti : 0;
      for (var j = 0; j < sections.length; j++){
        if (sections[j].tabBlock === block.index && sections[j].tab === activeTab &&
            Array.isArray(sections[j].stepIds)){ legacySec = sections[j]; break; }
      }
    } else {
      for (var k = 0; k < sections.length; k++){
        if (Array.isArray(sections[k].stepIds)){ legacySec = sections[k]; break; }
      }
    }
    diagramTarget = diagram(legacySec, true);
    if (diagramTarget.kind === 'invalid') return diagramTarget;
  }

  var cardTarget = null;
  if (st.c != null){
    var cardSec = sectionAt(st.c);
    if (!cardSec || !cardSec.hasCard) return {kind:'invalid'};
    var row = st.r != null ? oneBasedIndex(st.r, cardSec.rowCount || 0) : null;
    if (row === -1) row = null; /* bad/out-of-range row ref degrades to the card */
    cardTarget = route(cardSec, {kind:row == null ? 'card' : 'row', section:cardSec.number,
                                 row:row, tabBlock:null, tab:null});
  }

  var tabTarget = block && ti >= 0 ? {kind:'tab', tabBlock:block.index, tab:ti} : null;
  /* The card/row is the most specific scroll and route target, followed by
     the diagram and then an explicitly addressed tab. The attached targets
     still all apply even though one supplies the top-level kind. */
  var primary = cardTarget || diagramTarget || tabTarget || {kind:'page'};
  var out = {};
  Object.keys(primary).forEach(function(key){ out[key] = primary[key]; });
  out.diagram = diagramTarget;
  out.card = cardTarget;
  out.explicitTab = tabTarget;
  return out;
}
/* ---- src/core/document.js ---- */
/* Pure normalization and document identities. Source paths are relative to
   the normalized page; canonical references come from core/navigation.js. */

function normalize(raw){
  if (!specObject(raw)) return null;
  if (Object.prototype.hasOwnProperty.call(raw, 'page')) return raw.page;
  if (Object.prototype.hasOwnProperty.call(raw, 'blocks') || Object.prototype.hasOwnProperty.call(raw, 'sections')) return raw;
  if (Object.prototype.hasOwnProperty.call(raw, 'nodes') && Object.prototype.hasOwnProperty.call(raw, 'rows')) return {title:'', sections:[{diagram: raw}]};
  return null;
}

function specObject(value){
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function blocksOf(page){
  if (!specObject(page)) return [];
  var raw = page.blocks || page.sections || [];
  var pfx = page.blocks ? 'blocks' : 'sections';
  var out = [];
  (Array.isArray(raw) ? raw : []).forEach(function(b, i){
    if (b && Array.isArray(b.tabs)){
      out.push({type:'tabs', path:pfx + '[' + i + ']', tabs:b.tabs.map(function(t, j){
        return {label:(t && t.label) || ('Tab ' + (j + 1)),
                highlight:(t && t.highlight != null) ? t.highlight : undefined,
                sections:(t && Array.isArray(t.sections)) ? t.sections : [],
                path:pfx + '[' + i + '].tabs[' + j + ']'};
      })});
    } else {
      out.push({type:'section', sec:b, path:pfx + '[' + i + ']'});
    }
  });
  return out;
}

/* Every section counts, including prose and inactive tabs. Keep raw source
   block indices separate from one-based rendered numbers and tab-block routes.
   Canon's diagram-only evidence indices and the editor's raw JSON paths are
   separate contracts; neither is replaced by this viewer traversal. */
function sectionRecords(page){
  var out = [], tabBlock = 0;
  blocksOf(page).forEach(function(block, blockIndex){
    function add(section, path, tab, tabLabel){
      out.push({section:section, path:path, blockIndex:blockIndex,
        number:out.length + 1, tabBlock:tab == null ? null : tabBlock,
        tab:tab, tabLabel:tabLabel});
    }
    if (block.type === 'section') add(block.sec, block.path, null, null);
    else {
      tabBlock++;
      block.tabs.forEach(function(tab, tabIndex){
        tab.sections.forEach(function(section, index){
          add(section, tab.path + '.sections[' + index + ']', tabIndex, tab.label);
        });
      });
    }
  });
  var references = sectionReferences(out.map(function(record){return record.section && record.section.heading;}));
  out.forEach(function(record, index){
    var id=record.section && record.section.id;
    record.reference=typeof id==='string' && id.trim() ? id : references[index];
    if(record.reference!==references[index])record.aliases=[references[index]];
  });
  return out;
}
/* ---- src/core/paths.js ---- */
/* Pure step/path projection. Uses shared isHex() and navigation stepIndexOf()
   at call time; indices always refer to the authored source step registry. */

function stepKeys(st){
  if (!st) return [];
  if (Array.isArray(st.edges)) return st.edges;
  if (st.edge) return [st.edge];
  return [];
}
var COMM_FAILURE_MODES = ['dropped','blocked'];
function stepFailures(st){
  var raw = st && st.failures, out = Object.create(null);
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) Object.keys(raw).forEach(function(key){
    if (COMM_FAILURE_MODES.indexOf(raw[key]) >= 0) out[key] = raw[key];
  });
  return out;
}
function stepDeliveredKeys(st){
  var failures = stepFailures(st);
  return stepKeys(st).filter(function(key){return !Object.prototype.hasOwnProperty.call(failures,key);});
}
function stepNodes(st){
  return (st && Array.isArray(st.nodes)) ? st.nodes : [];
}
function stepPanelPatch(st){
  if (!st) return null;
  if (st.panels && typeof st.panels === 'object' && !Array.isArray(st.panels)) return st.panels;
  if (st.patch && typeof st.patch === 'object' && !Array.isArray(st.patch)) return st.patch;
  return null;
}
function stepTonePatch(st){
  if (!st || !st.tone || typeof st.tone !== 'object' || Array.isArray(st.tone)) return null;
  return st.tone;
}

/* Paths reference a shared step registry. Folding always receives just the
   selected sequence, so another outcome cannot leak state into this one. */
function diagramPathList(d){
  var steps = Array.isArray(d.steps) ? d.steps : [], byId = new Map();
  steps.forEach(function(s,i){ if (s && typeof s.id === 'string') byId.set(s.id,i); });
  var colors = ['#38bdf8','#fb923c','#c084fc','#f472b6','#4ade80'];
  var paths = Array.isArray(d.paths) ? d.paths.filter(function(p){
    return p && typeof p.id === 'string' && p.id && Array.isArray(p.steps) && p.steps.length &&
      p.steps.every(function(id){ return byId.has(id); });
  }).map(function(p,i){
    return {id:p.id, label:p.label || (i ? p.id : 'Happy path'), color:isHex(p.color) ? p.color : colors[i % colors.length],
      indices:p.steps.map(function(id){ return byId.get(id); })};
  }) : [];
  return paths.length ? paths : [{id:'happy',label:'Happy path',color:colors[0],indices:steps.map(function(s,i){return i;})}];
}
function diagramForPath(d, id){
  var paths = diagramPathList(d), path = paths.find(function(p){ return p.id === id; }) || paths[0];
  return Object.assign({}, d, {steps:path.indices.map(function(i){ return d.steps[i]; }),
    _sourceIndices:path.indices, _pathId:path.id});
}
/* Exact host navigation uses the complete path, never a named view's visible
   stops. Missing paths return null; missing steps retain the path with -1
   indices so hosts can keep their existing distinct, recoverable errors. */
function resolveSourceStep(d, pathId, stepRef){
  var path = diagramPathList(d).find(function(p){return p.id === pathId;});
  if (!path) return null;
  var ids = path.indices.map(function(index){return d.steps[index].id;});
  var index = stepIndexOf(ids, stepRef);
  return {path:path, pathIndex:index, sourceIndex:index < 0 ? -1 : path.indices[index]};
}
/* Color a branch starting at its first differing step; every common-prefix
   beat stays shared. A wholly shared path has start > end. Compare earlier
   declarations so nested alternatives keep stable rows too. */
function pathStepRows(paths){
  return paths.map(function(path,i){
    var shared = 0;
    paths.slice(0,i).forEach(function(prior){
      var n = 0;
      while (n < path.indices.length && n < prior.indices.length && path.indices[n] === prior.indices[n]) n++;
      shared = Math.max(shared,n);
    });
    return {path:path, start:i ? shared : 0, end:path.indices.length - 1};
  });
}
/* ---- src/core/section-layout.js ---- */
/* Pure section/view layout. Uses diagramPathList() and panelCapability() at
   call time, after panel definitions have registered; no DOM measurements. */

/* Section composition uses a bounded twelve-column grid. Missing/new panels
   are appended; collisions push later tiles down instead of hiding content. */
function sectionLayoutKey(item){
  if(item && item.panel!=null)return typeof item.panel==='string'?'panel:'+item.panel:'invalid-panel';
  return item && item.controls!=null ? (item.controls==='steps'?'steps':'invalid-controls') : 'diagram';
}
function sectionLayoutTiles(d){
  var tiles=[{key:'diagram',title:'Data flow'}].concat((Array.isArray(d.panels) ? d.panels : []).filter(function(p){return p && typeof p.id === 'string';}).map(function(p){
    return {key:'panel:' + p.id,panel:p.id,type:p.type,title:p.title || p.id};
  }));
  if(Array.isArray(d.steps) && d.steps.length && d.view!=='ambient-only')tiles.push({key:'steps',controls:'steps',title:'Step controls'});
  return tiles;
}
function sectionLayoutPack(items, priority){
  var dock=sectionLayoutDock(items);
  var placed = [], order = items.map(function(it){return Object.assign({},it);});
  if (priority) order.sort(function(a,b){return (sectionLayoutKey(a) === priority ? -1 : 0) - (sectionLayoutKey(b) === priority ? -1 : 0);});
  order.forEach(function(it){
    function overlaps(p){return it.x < p.x+p.w && it.x+it.w > p.x && it.y < p.y+p.h && it.y+it.h > p.y;}
    var hits;
    while (!it.hidden && !(dock && it.controls==='steps') && (hits = placed.filter(function(p){return !p.hidden && !(dock && p.controls==='steps') && overlaps(p);})).length) it.y = Math.max.apply(null,hits.map(function(p){return p.y+p.h;}));
    placed.push(it);
  });
  return items.map(function(it){return placed.find(function(p){return sectionLayoutKey(p) === sectionLayoutKey(it);});});
}
/* A docked transport shares its host's geometry. Its saved standalone position
   is retained for detaching, or used as a fallback if that host is hidden. */
function sectionLayoutDock(items){
  var steps=items.find(function(it){return it.controls==='steps';});
  return steps && typeof steps.attachTo==='string' && items.some(function(it){return sectionLayoutKey(it)===steps.attachTo && !it.hidden && !it.controls;}) ? steps.attachTo : null;
}
function sectionLayoutControlsRows(d,items){
  var steps=(items || []).find(function(it){return it.controls==='steps';});
  return steps?steps.h:(d.paths || []).length>1?6:4;
}
function sectionLayoutPreset(d, target, excludedKeys){
  var excluded=Array.isArray(excludedKeys)?excludedKeys:[];
  var tiles=sectionLayoutTiles(d).filter(function(t){return excluded.indexOf(t.key)<0;}), narrow=target==='confluence', items=[];
  var main=d.primaryPanel && tiles.find(function(t){return t.panel===d.primaryPanel;});
  var ordered=main ? [main].concat(tiles.filter(function(t){return t!==main;})) : tiles;
  var controls=tiles.find(function(t){return t.key==='steps';});
  if(controls){ordered=ordered.filter(function(t){return t!==controls;});ordered.splice(1,0,controls);}
  var supporting=tiles.some(function(t){return t!==main && t.key!=='diagram' && t.key!=='steps' && panelCapability(t.type,'supporting',true);});
  ordered.forEach(function(t){
    var panelLarge=panelCapability(t.type,'large',false), large=t.key==='diagram'||t.key==='steps'||panelLarge||t===main;
    var w=large?(narrow||!supporting?12:8):(narrow?6:4);
    var h=t.key==='steps'?((d.paths || []).length>1?6:4):panelLarge?panelCapability(t.type,'height',12):large?12:panelCapability(t.type,'height',6);
    var xs=large?[0]:narrow?[0,6]:[8], candidates=xs.map(function(x){
      var it={x:x,y:0,w:w,h:h}, hits;
      while((hits=items.filter(function(p){return it.x<p.x+p.w&&it.x+it.w>p.x&&it.y<p.y+p.h&&it.y+it.h>p.y;})).length)
        it.y=Math.max.apply(null,hits.map(function(p){return p.y+p.h;}));
      return it;
    });
    candidates.sort(function(a,b){return a.y-b.y||a.x-b.x;});
    var item=candidates[0];if(t.panel!=null)item.panel=t.panel;if(t.controls)item.controls=t.controls;items.push(item);
  });
  return items;
}
function diagramLayoutViews(d){
  var used=Object.create(null), views=[];
  (Array.isArray(d.layouts)?d.layouts:[]).forEach(function(v){
    if(!v || typeof v.id!=='string' || !/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(v.id) || used[v.id] ||
      typeof v.name!=='string' || !v.name.trim() || v.name.trim().length>40 ||
      !v.sectionLayout || typeof v.sectionLayout!=='object' || Array.isArray(v.sectionLayout) ||
      !['default','backstage','confluence'].some(function(k){return Array.isArray(v.sectionLayout[k]);}))return;
    used[v.id]=true;views.push({id:v.id,name:v.name.trim(),sectionLayout:v.sectionLayout,steps:Array.isArray(v.steps)?v.steps:undefined});
  });
  if(views.length)return views;
  return d.sectionLayout && typeof d.sectionLayout==='object' && !Array.isArray(d.sectionLayout) ?
    [{id:'default',name:typeof d.layoutName==='string' && d.layoutName.trim()?d.layoutName.trim():'Layout',sectionLayout:d.sectionLayout,legacy:true}] : [];
}
function sectionLayoutDefinition(d, id){
  var views=diagramLayoutViews(d);
  return views.find(function(v){return v.id===id;}) || views.find(function(v){return v.id===d.defaultLayout;}) || views[0];
}
function sectionViewStepsReachable(d,ids){
  return diagramPathList(d).some(function(p){return p.indices.some(function(i){return ids.indexOf(d.steps[i].id)>=0;});});
}
function sectionLayoutItems(d, target, id){
  var definition=sectionLayoutDefinition(d,id), layouts = definition && definition.sectionLayout, tiles = sectionLayoutTiles(d), saved = layouts && (Array.isArray(layouts[target]) ? layouts[target] : layouts.default);
  if (!Array.isArray(saved)) return definition && !definition.legacy ? sectionLayoutPreset(d,target) : null;
  var items = [], used = Object.create(null);
  saved.forEach(function(it){
    if (!it || typeof it !== 'object') return;
    if(it.controls!=null && (it.controls!=='steps'||it.panel!=null))return;
    var key = sectionLayoutKey(it);
    if (used[key] || !tiles.some(function(t){return t.key === key;})) return;
    if (!['x','y','w','h'].every(function(k){return Number.isInteger(it[k]);}) || it.x<0 || it.y<0 || it.w<1 || it.h<3 || it.x+it.w>12 || it.y>500 || it.h>40) return;
    var copy = {x:it.x,y:it.y,w:it.w,h:it.h};
    if (it.panel != null) copy.panel=it.panel;
    if (it.controls==='steps'){
      copy.controls='steps';
      if(it.attachTo==='diagram' || tiles.some(function(t){return t.key===it.attachTo && panelCapability(t.type,'attachControls',false);}))copy.attachTo=it.attachTo;
    }
    if(it.hidden===true && it.controls==null)copy.hidden=true;
    used[key]=true;items.push(copy);
  });
  var y = items.reduce(function(n,it){return it.hidden?n:Math.max(n,it.y+it.h);},0);
  tiles.forEach(function(t){
    if (used[t.key] || t.key==='steps') return; /* Old layouts keep controls attached. */
    var item={x:0,y:y,w:12,h:t.key==='diagram'?12:panelCapability(t.type,'fallbackHeight',6)};
    if(t.panel != null)item.panel=t.panel;
    items.push(item);y+=item.h;
  });
  return sectionLayoutPack(items);
}
/* ---- src/core/state.js ---- */
/* Pure path-local state folding. Uses stepTonePatch(), TONE_SET and the
   registered PanelRegistry/foldCommonPanelStates dispatch at call time. */

/* ---------------- node-tone folding ----------------
   Like panel patches, node tones are sparse authoring deltas folded into
   absolute per-step snapshots. Unknown ids/tokens are ignored here (the
   validator warns); `base` and null delete the carried tone. */
function foldNodeTones(d){
  d = d || {};
  var nodes = d.nodes || {};
  var steps = Array.isArray(d.steps) ? d.steps : [];
  var carried = {}, states = [];
  steps.forEach(function(st){
    var patch = stepTonePatch(st);
    if (patch) Object.keys(patch).forEach(function(id){
      if (!Object.prototype.hasOwnProperty.call(nodes, id)) return;
      var tone = patch[id];
      if (tone === null || tone === 'base'){
        delete carried[id];
      } else if (TONE_SET.indexOf(tone) >= 0 && tone !== 'base'){
        carried[id] = tone;
      }
    });
    var snap = {};
    Object.keys(carried).forEach(function(id){ snap[id] = carried[id]; });
    states.push(snap);
  });
  if (!steps.length) states.push({});
  return states;
}

/* ---------------- panel-state folding ----------------
   Authors emit sparse per-step patches; we fold them into COMPLETE state per
   step at load time, so any step jump renders from absolute state, never
   deltas. Rules:
   - state N = shallow merge of state N-1 and step N's patch for that panel;
   - a "log" patch key APPENDS (cumulative array of lines);
   - an "enterOnce" sub-object applies only at its own step (not carried). */

function foldPanelStates(d){
  var panels = d.panels || [];
  var steps = d.steps || [];
  var out = {};
  panels.forEach(function(panel){
    if (!panel || !panel.id) return;
    var descriptor = PanelRegistry.get(panel.type);
    var fold = descriptor && descriptor.fold || foldCommonPanelStates;
    out[panel.id] = fold(panel, steps);
  });
  return out;
}
/* ---- src/core/geometry.js ---- */
/* Pure diagram layout, routing and collision geometry. The only shared
   call-time dependency is clamp() from validator.js; no DOM initialization.
   Loaded once by the logical validator bundle before panel definitions. */

var W = 1180, CARD_H = 54, FLOAT_H = 44, ROW_GAP = 140, STACK_GAP = 46;
var LEFT_X = 110, RIGHT_X = 885;

/* Shared, pure parent-link tolerance for layout, validation and the inspector.
   Inspect all chains before dropping cyclic links so declaration order cannot
   decide which cycle member becomes the outer box. Incoming links survive. */
function sanitizedGroupParents(groups, ignored){
  groups = groups && typeof groups === 'object' ? groups : {};
  var parents = Object.create(null), cyclic = [];
  Object.keys(groups).forEach(function(key){
    var meta = groups[key], reason;
    if (!meta || !Object.prototype.hasOwnProperty.call(meta, 'parent')) return;
    var parent = meta.parent;
    if (typeof parent !== 'string') reason = 'must be a string — parent ignored';
    else if (parent === key) reason = 'a group cannot contain itself — parent ignored';
    else if (!Object.prototype.hasOwnProperty.call(groups, parent))
      reason = 'unknown group "' + parent + '" — parent ignored';
    if (reason){ if (ignored) ignored(key, reason); }
    else parents[key] = parent;
  });
  Object.keys(parents).forEach(function(key){
    var seen = Object.create(null), cursor = key;
    while (cursor !== undefined && !seen[cursor]){
      seen[cursor] = true;
      cursor = parents[cursor];
    }
    if (cursor === key) cyclic.push(key);
  });
  cyclic.forEach(function(key){
    delete parents[key];
    if (ignored) ignored(key, 'parent chain loops — parent ignored');
  });
  return parents;
}

/* ---------------- layout + geometry (per diagram) ---------------- */
function layout(spec){
  if (spec._detailGeometry && spec._detailGeometry.owner === DETAIL_GEOMETRY_OWNER) return spec._detailGeometry.layout;
  var pos = {}, rowsMeta = [];
  var lanes = spec.routing === 'lanes' && laneRoutingSupported(spec);
  var laneCounts = {};
  if (lanes) laneEndpoints(spec).forEach(function(p){ laneCounts[p.gap] = (laneCounts[p.gap] || 0) + 1; });
  var floats = spec.floats || [];
  var hasAbove = floats.some(function(f){ return f && f.side !== 'below'; });
  var hasGroups = false;
  Object.keys(spec.nodes || {}).forEach(function(id){
    if (spec.nodes[id] && spec.nodes[id].group) hasGroups = true;
  });
  var parents = sanitizedGroupParents(spec.groups), levels = Object.create(null);
  function groupLevel(key){
    if (levels[key] !== undefined) return levels[key];
    var level = 0, cursor = key;
    while (parents[cursor] !== undefined){ level++; cursor = parents[cursor]; }
    levels[key] = level;
    return level;
  }
  var placed = Object.create(null), maxDepth = 1;
  spec.rows.forEach(function(row){
    row.forEach(function(slot){
      (Array.isArray(slot) ? slot : [slot]).forEach(function(id){ placed[id] = true; });
    });
  });
  floats.forEach(function(f){ if (f) placed[f.id] = true; });
  Object.keys(spec.nodes || {}).forEach(function(id){
    var g = spec.nodes[id] && spec.nodes[id].group;
    if (g && placed[id]) maxDepth = Math.max(maxDepth, groupLevel(g) + 1);
  });
  var top = hasAbove ? 125 : 42;
  if (lanes) top = Math.max(top, 40 + (laneCounts[-1] || 0) * 8);
  if (hasGroups) top += 26 + 34 * (maxDepth - 1); /* one title band per ancestor */

  spec.rows.forEach(function(slots, r){
    var maxStack = 1;
    slots.forEach(function(s){ if (Array.isArray(s)) maxStack = Math.max(maxStack, s.length); });
    var rowH = maxStack * CARD_H + (maxStack - 1) * STACK_GAP;
    var center = top + rowH / 2;
    var k = slots.length;
    var xs = [];
    for (var i = 0; i < k; i++){
      xs.push(k === 1 ? (LEFT_X + RIGHT_X) / 2 : LEFT_X + i * (RIGHT_X - LEFT_X) / (k - 1));
    }
    if (r % 2 === 1) xs.reverse(); /* serpentine */

    slots.forEach(function(s, i){
      if (Array.isArray(s)){
        var m = s.length;
        var totalH = m * CARD_H + (m - 1) * STACK_GAP;
        s.forEach(function(id, j){
          pos[id] = {cx: xs[i], cy: center - totalH/2 + CARD_H/2 + j*(CARD_H+STACK_GAP),
                     w:170, h:CARD_H, row:r, flow:i, stack:true};
        });
      } else {
        pos[s] = {cx: xs[i], cy: center, w:150, h:CARD_H, row:r, flow:i, stack:false};
      }
    });
    rowsMeta.push({top:top, center:center, height:rowH, slots:slots, k:k});
    top += rowH + (lanes ? Math.max(ROW_GAP, 40 + (laneCounts[r] || 0) * 8) : ROW_GAP);
  });

  /* floats: anchor each at the mean x of its connected nodes, then spread the
     floats sharing a side so they cannot overlap (B3) */
  var lastRow = rowsMeta[rowsMeta.length - 1];
  var belowY = lastRow.top + lastRow.height + 45 + FLOAT_H/2;
  ['above', 'below'].forEach(function(side){
    var group = floats.filter(function(f){ return f && (f.side === 'below' ? side === 'below' : side === 'above'); });
    if (!group.length) return;
    var xs = group.map(function(f){
      var touching = [];
      (spec.edges || []).forEach(function(e){
        if (e.from === f.id && pos[e.to]) touching.push(pos[e.to].cx);
        if (e.to === f.id && pos[e.from]) touching.push(pos[e.from].cx);
      });
      return touching.length ? touching.reduce(function(a,b){return a+b;},0)/touching.length : W/2;
    });
    xs = spreadPositions(xs, 150 + 24, 75 + 10, W - 75 - 10);
    var fy = side === 'above' ? rowsMeta[0].top - 45 - FLOAT_H/2 : belowY;
    group.forEach(function(f, i){
      /* optional manual nudge (like edge bend/labelDx): dy<0 raises a below
         float up into the inter-row gap; dx shifts it sideways */
      var cx = xs[i] + (typeof f.dx === 'number' ? f.dx : 0);
      var cy = fy + (typeof f.dy === 'number' ? f.dy : 0);
      pos[f.id] = {cx:cx, cy:cy, w:150, h:FLOAT_H, row:-1, flow:-1, stack:false, float:true};
    });
  });

  /* group bounding boxes over member node positions */
  var groupBoxes = Object.create(null);
  Object.keys(spec.nodes || {}).forEach(function(id){
    var g = spec.nodes[id] && spec.nodes[id].group;
    var p = pos[id];
    if (!g || !p) return;
    var b = groupBoxes[g] || (groupBoxes[g] = {x1:Infinity, y1:Infinity, x2:-Infinity, y2:-Infinity});
    b.x1 = Math.min(b.x1, p.cx - p.w/2);
    b.y1 = Math.min(b.y1, p.cy - p.h/2);
    b.x2 = Math.max(b.x2, p.cx + p.w/2);
    b.y2 = Math.max(b.y2, p.cy + p.h/2);
  });
  var GROUP_PAD = 14, GROUP_TITLE = 20;
  Object.keys(groupBoxes).forEach(function(g){
    var parent = parents[g];
    while (parent !== undefined){
      if (!groupBoxes[parent]) groupBoxes[parent] = {x1:Infinity, y1:Infinity, x2:-Infinity, y2:-Infinity};
      parent = parents[parent];
    }
  });
  Object.keys(groupBoxes).sort(function(a, b){ return groupLevel(b) - groupLevel(a); }).forEach(function(g){
    var b = groupBoxes[g];
    b.x = b.x1 - GROUP_PAD; b.y = b.y1 - GROUP_PAD - GROUP_TITLE;
    b.w = (b.x2 - b.x1) + 2*GROUP_PAD; b.h = (b.y2 - b.y1) + 2*GROUP_PAD + GROUP_TITLE;
    b.nestLevel = groupLevel(g);
    var parent = parents[g];
    if (parent !== undefined){
      var outer = groupBoxes[parent];
      outer.x1 = Math.min(outer.x1, b.x); outer.y1 = Math.min(outer.y1, b.y);
      outer.x2 = Math.max(outer.x2, b.x + b.w); outer.y2 = Math.max(outer.y2, b.y + b.h);
    }
  });

  var H = lastRow.top + lastRow.height + 40;
  if (lanes) H += (laneCounts[rowsMeta.length - 1] || 0) * 8;
  floats.forEach(function(f){
    if (f && f.side === 'below' && pos[f.id]) H = Math.max(H, pos[f.id].cy + FLOAT_H/2 + 24);
  });
  Object.keys(groupBoxes).forEach(function(g){
    var b = groupBoxes[g];
    H = Math.max(H, b.y + b.h + 24);
  });
  /* deep nesting pads horizontally past the fixed card columns (and above
     a float member's row) — widen the drawable area instead of clipping.
     Flat specs keep vb = {0, 0, W, H}, so their markup stays identical. */
  var vbX = 0, vbY = 0, vbR = W;
  Object.keys(groupBoxes).forEach(function(g){
    var b = groupBoxes[g];
    if (b.x - 2 < vbX) vbX = b.x - 2;
    if (b.y - 2 < vbY) vbY = b.y - 2;
    if (b.x + b.w + 2 > vbR) vbR = b.x + b.w + 2;
  });
  return {pos:pos, rows:rowsMeta, groups:groupBoxes, H: H,
          vb:{x:vbX, y:vbY, w:vbR - vbX, h:H - vbY},
          routing:lanes ? 'lanes' : undefined};
}

/* Reserved horizontal tracks plus obstacle-free vertical channels. Keep
   this opt-in: authored stacks, floats and self-loops retain classic curves. */
function laneRoutingSupported(d){
  return !(d.floats || []).length && d.rows.every(function(row){
    return row.length > 0 && row.length <= 5 && row.every(function(id){ return typeof id === 'string'; });
  }) && !(d.edges || []).some(function(e){ return e.from === e.to; });
}
function laneEndpoints(d){
  var rowOf = new Map(), endpoints = [];
  d.rows.forEach(function(row,r){ row.forEach(function(id){ rowOf.set(id,r); }); });
  (d.edges || []).forEach(function(e,i){
    var a = rowOf.get(e.from), b = rowOf.get(e.to);
    if (a == null || b == null) return;
    endpoints.push({edge:i, end:'from', id:e.from, other:e.to, side:b>a ? 1 : -1, gap:b>a ? a : a-1});
    endpoints.push({edge:i, end:'to', id:e.to, other:e.from, side:b<a ? 1 : -1, gap:b<a ? b : b-1});
  });
  return endpoints;
}
function laneSegments(points){
  var out = [];
  for (var i=1; i<points.length; i++) if (points[i].x !== points[i-1].x || points[i].y !== points[i-1].y)
    out.push({a:points[i-1], b:points[i]});
  return out;
}
function laneSegmentHits(s, p, margin){
  var x1=p.cx-p.w/2-margin, x2=p.cx+p.w/2+margin;
  var y1=p.cy-p.h/2-margin, y2=p.cy+p.h/2+margin;
  return s.a.x === s.b.x ? s.a.x>x1 && s.a.x<x2 && Math.max(s.a.y,s.b.y)>y1 && Math.min(s.a.y,s.b.y)<y2 :
    s.a.y>y1 && s.a.y<y2 && Math.max(s.a.x,s.b.x)>x1 && Math.min(s.a.x,s.b.x)<x2;
}
function laneConflict(a,b){
  var av=a.a.x===a.b.x, bv=b.a.x===b.b.x;
  if (av === bv){
    var axis=av?'y':'x', fixed=av?'x':'y';
    if (Math.abs(a.a[fixed]-b.a[fixed]) > 2) return 0;
    return Math.max(0, Math.min(Math.max(a.a[axis],a.b[axis]),Math.max(b.a[axis],b.b[axis])) -
      Math.max(Math.min(a.a[axis],a.b[axis]),Math.min(b.a[axis],b.b[axis]))) * 1000;
  }
  var v=av?a:b, h=av?b:a;
  return v.a.x>Math.min(h.a.x,h.b.x) && v.a.x<Math.max(h.a.x,h.b.x) &&
    h.a.y>Math.min(v.a.y,v.b.y) && h.a.y<Math.max(v.a.y,v.b.y) ? 250 : 0;
}
function laneRoutes(d,L){
  var endpoints=laneEndpoints(d), faces=new Map(), gaps=new Map(), ends=[];
  endpoints.forEach(function(p){
    var key=p.id+':'+p.side;
    if (!faces.has(key)) faces.set(key,[]); faces.get(key).push(p);
    if (!gaps.has(p.gap)) gaps.set(p.gap,[]); gaps.get(p.gap).push(p);
    (ends[p.edge] || (ends[p.edge]={}))[p.end]=p;
  });
  faces.forEach(function(items){
    items.sort(function(a,b){ return L.pos[a.other].cx-L.pos[b.other].cx || a.edge-b.edge; });
    items.forEach(function(p,i){
      var n=L.pos[p.id]; p.x=n.cx+(items.length===1 ? 0 : (i/(items.length-1)-.5)*(n.w-40));
      p.y=n.cy+p.side*n.h/2;
    });
  });
  gaps.forEach(function(items,gap){
    var lo=gap<0 ? 0 : L.rows[gap].top+L.rows[gap].height;
    var hi=gap+1>=L.rows.length ? L.H : L.rows[gap+1].top;
    items.sort(function(a,b){ return a.x-b.x || a.edge-b.edge || (a.end<b.end?-1:1); });
    items.forEach(function(p,i){ p.rail=lo+20+(i+.5)*(hi-lo-40)/items.length; });
  });
  var used=[], routes=[];
  (d.edges || []).forEach(function(e,i){
    if (!ends[i]){ routes.push({}); return; }
    var a=ends[i].from, b=ends[i].to, best=null, bestScore=Infinity;
    var xs=[a.x,b.x,(a.x+b.x)/2];
    for (var x=12; x<W-8; x+=8) xs.push(x);
    function consider(points){
      var segs=laneSegments(points), score=0;
      for (var si=0; si<segs.length; si++){
        var s=segs[si];
        // End stubs may touch their own card; every other segment must clear it.
        var blocked=Object.keys(L.pos).some(function(id){
          if ((si===0 && id===e.from) || (si===segs.length-1 && id===e.to)) return false;
          return laneSegmentHits(s,L.pos[id],3);
        });
        if (blocked) return;
        score+=Math.abs(s.a.x-s.b.x)+Math.abs(s.a.y-s.b.y)+15;
        for (var ui=0; ui<used.length; ui++) score+=laneConflict(s,used[ui]);
        if (score>=bestScore) return;
      }
      bestScore=score; best=points;
    }
    if (a.gap===b.gap) consider([{x:a.x,y:a.y},{x:a.x,y:a.rail},{x:b.x,y:a.rail},{x:b.x,y:b.y}]);
    xs.forEach(function(x){ consider([{x:a.x,y:a.y},{x:a.x,y:a.rail},{x:x,y:a.rail},
      {x:x,y:b.rail},{x:b.x,y:b.rail},{x:b.x,y:b.y}]); });
    // Outer channels are always clear for supported rows; never silently draw through a card.
    if (!best) throw new Error('No clear lane for '+e.from+' → '+e.to);
    used=used.concat(laneSegments(best));
    routes.push({path:best.map(function(p,j){ return (j?'L ':'M ')+p.x+' '+p.y; }).join(' '), points:best});
  });
  return routes;
}

/* spread 1-D center positions at least minGap apart inside [lo, hi]; keeps
   relative order, returns positions in the input's order (pure, B3) */
function spreadPositions(xs, minGap, lo, hi){
  var idx = xs.map(function(x, i){ return {x: x, i: i}; }).sort(function(a, b){ return a.x - b.x || a.i - b.i; });
  var placed = [];
  idx.forEach(function(o, j){
    var x = Math.max(o.x, lo);
    if (j > 0) x = Math.max(x, placed[j - 1] + minGap);
    placed.push(x);
  });
  if (placed.length && placed[placed.length - 1] > hi){
    placed[placed.length - 1] = hi;
    for (var j = placed.length - 2; j >= 0; j--){
      placed[j] = Math.min(placed[j], placed[j + 1] - minGap);
    }
    for (var j2 = 0; j2 < placed.length; j2++) placed[j2] = Math.max(placed[j2], lo);
  }
  var out = new Array(xs.length);
  idx.forEach(function(o, j){ out[o.i] = placed[j]; });
  return out;
}

/* ---------------- automatic edge de-crowding (B2, pure) ----------------
   Returns one {fromDx, fromDy, toDx, toDy, bend} per edge:
   - edges sharing a node side fan their attach points apart;
   - reverse pairs on one row bow apart with opposite bends;
   - same-row edges skipping over intermediate slots arc above the row.
   An author-set e.bend is respected (no auto bend for that edge). */
function edgeAutoAdjust(edges, L){
  var adj = edges.map(function(){ return {fromDx:0, fromDy:0, toDx:0, toDy:0, bend:0}; });
  var sides = {};
  function addSide(key, ei, order, axis, slot){
    (sides[key] = sides[key] || {list: [], axis: axis}).list.push({ei: ei, order: order, slot: slot});
  }
  edges.forEach(function(e, ei){
    var a = L.pos[e.from], b = L.pos[e.to];
    if (!a || !b || a.float || b.float) return;
    if (a.row === b.row && Math.abs(a.cx - b.cx) < 1) return;      /* vertical stack edge */
    if (isWrap(e, L)) return;
    if (a.row === b.row){
      var dir = b.cx > a.cx ? 1 : -1;
      addSide(e.from + (dir > 0 ? ':R' : ':L'), ei, b.cx, 'y', 'from');
      addSide(e.to + (dir > 0 ? ':L' : ':R'), ei, a.cx, 'y', 'to');
    } else {
      var up = b.cy < a.cy;
      addSide(e.from + (up ? ':T' : ':B'), ei, b.cx, 'x', 'from');
      addSide(e.to + (up ? ':B' : ':T'), ei, a.cx, 'x', 'to');
    }
  });
  Object.keys(sides).forEach(function(key){
    var s = sides[key];
    if (s.list.length < 2) return;
    s.list.sort(function(p, q){ return p.order - q.order || p.ei - q.ei; });
    var n = s.list.length;
    s.list.forEach(function(p, rank){
      var off = clamp((rank - (n - 1) / 2) * 14, -19, 19);
      if (s.axis === 'y') adj[p.ei][p.slot + 'Dy'] += off;
      else adj[p.ei][p.slot + 'Dx'] += off;
    });
  });
  /* reverse pairs + skip-over arcs (same row only) */
  var pairSeen = {};
  edges.forEach(function(e, ei){
    var a = L.pos[e.from], b = L.pos[e.to];
    if (!a || !b || a.float || b.float || a.row !== b.row) return;
    if (Math.abs(a.cx - b.cx) < 1) return;
    if (typeof e.bend === 'number' && e.bend) return;             /* author wins */
    var key = [e.from, e.to].sort().join('|');
    if (pairSeen[key] != null){
      adj[ei].bend = 16; adj[pairSeen[key]].bend = -16;           /* bow apart */
    } else {
      pairSeen[key] = ei;
    }
    var span = Math.abs(a.flow - b.flow);
    if (span > 1 && !adj[ei].bend) adj[ei].bend = -(26 + 8 * (span - 2)); /* arc over the row */
  });
  return adj;
}

function isWrap(e, L){
  if (L.routing === 'lanes') return false;
  var a = L.pos[e.from], b = L.pos[e.to];
  return a && b && !a.float && !b.float && b.row === a.row + 1 &&
         a.flow === L.rows[a.row].k - 1 && b.flow === 0;
}

/* Straight-drop preference: a cross-row edge (wrap included) whose endpoint
   x-centers align within STRAIGHT_TOL renders as a vertical drop; within
   NEAR_TOL it gets a minimal vertical-tangent S instead of the wide route. */
var STRAIGHT_TOL = 40, NEAR_TOL = 96;

function edgePath(e, L, adj){
  if (adj && adj.path) return adj.path;
  var a = L.pos[e.from], b = L.pos[e.to];
  adj = adj || {fromDx:0, fromDy:0, toDx:0, toDy:0, bend:0};
  var bend = (typeof e.bend === 'number' && e.bend) ? e.bend : (adj.bend || 0);
  var avX = adj.avoidMx || 0, avY = adj.avoidMy || 0;

  if (a.float || b.float){
    /* Attach on the edge each node faces vertically, so a float below its
       partner connects to the partner's BOTTOM (not looped around to the top),
       and a float above connects to the top. Works for either direction. */
    if (b.float){
      var bBelow = b.cy >= a.cy;
      var sx = a.cx + clamp((b.cx - a.cx) * 0.25, -45, 45), sy = a.cy + (bBelow ? a.h/2 : -a.h/2);
      /* Land on the center of the float's facing edge; floatSide (set by
         resolveEdgeAvoidance when no centered route clears the other cards)
         falls back to the near corner so the path can skirt the column. */
      var ex = adj.floatSide ? (b.cx > a.cx ? b.cx - b.w/2 : b.cx + b.w/2) : b.cx;
      var ey = b.cy + (bBelow ? -b.h/2 : b.h/2);
      /* centered landing keeps the final control at ex so the approach stays
         vertical even when an avoidance bow (avX) bends the mid-course */
      var c2x = adj.floatSide ? ex - (ex-sx)*0.3 + avX : ex;
      return 'M ' + sx + ' ' + sy + ' C ' + (sx + (ex-sx)*0.25 + avX) + ' ' + (sy + (ey-sy)*0.5) + ' ' +
             c2x + ' ' + (ey - (ey-sy)*0.35) + ' ' + ex + ' ' + ey;
    }
    var bAbove = b.cy < a.cy;
    var fx = a.cx + clamp((b.cx - a.cx) * 0.3, -50, 50), fy = a.cy + (bAbove ? -a.h/2 : a.h/2);
    var tx = b.cx - clamp((b.cx - a.cx) * 0.25, -45, 45), ty = b.cy + (bAbove ? b.h/2 : -b.h/2);
    return 'M ' + fx + ' ' + fy + ' C ' + (fx + (tx-fx)*0.3 + avX) + ' ' + (fy + (ty-fy)*0.5) + ' ' +
           (tx - (tx-fx)*0.25 + avX) + ' ' + (ty - (ty-fy)*0.35) + ' ' + tx + ' ' + ty;
  }

  /* vertical edge between members of the same stack (e.g. an on-device
     interrupt line between two chips sharing a column) */
  if (a.row === b.row && Math.abs(a.cx - b.cx) < 1 && a.cy !== b.cy){
    var down = b.cy > a.cy;
    var vx = a.cx + (bend || 0) + avX;
    var vsy = a.cy + (down ? a.h/2 : -a.h/2);
    var vty = b.cy + (down ? -b.h/2 : b.h/2);
    return 'M ' + vx + ' ' + vsy + ' L ' + vx + ' ' + vty;
  }

  /* straight-drop / minimal-S for x-aligned cross-row pairs — intercepts
     aligned wrap edges too, so a serpentine junction whose columns line up
     drops straight instead of looping around the margin */
  if (a.row !== b.row && Math.abs(a.cx - b.cx) <= NEAR_TOL){
    var upN = b.cy < a.cy;
    var syN = a.cy + (upN ? -a.h/2 : a.h/2);
    var tyN = b.cy + (upN ? b.h/2 : -b.h/2);
    var lx1 = a.cx + adj.fromDx, lx2 = b.cx + adj.toDx;
    if (avX){
      var dm = tyN - syN;
      return 'M ' + lx1 + ' ' + syN +
             ' C ' + (lx1 + avX) + ' ' + (syN + dm*0.4) + ' ' +
             (lx2 + avX) + ' ' + (tyN - dm*0.4) + ' ' + lx2 + ' ' + tyN;
    }
    if (Math.abs(a.cx - b.cx) <= STRAIGHT_TOL && Math.abs(lx1 - lx2) <= 6){
      return 'M ' + lx1 + ' ' + syN + ' L ' + lx2 + ' ' + tyN;
    }
    var dmn = tyN - syN;
    return 'M ' + lx1 + ' ' + syN +
           ' C ' + lx1 + ' ' + (syN + dmn*0.45) + ' ' +
           lx2 + ' ' + (tyN - dmn*0.45) + ' ' + lx2 + ' ' + tyN;
  }

  if (isWrap(e, L)){
    var side = a.row % 2 === 0 ? 1 : -1;
    var xO = (side > 0 ? W - 58 : 58) + avX;
    var s1x = a.cx + side * a.w/2, t1x = b.cx + side * b.w/2;
    var mid = (a.cy + b.cy) / 2;
    return 'M ' + s1x + ' ' + a.cy +
           ' C ' + (s1x + side*115) + ' ' + a.cy + ' ' + xO + ' ' + (a.cy + 55) + ' ' + xO + ' ' + mid +
           ' C ' + xO + ' ' + (b.cy - 55) + ' ' + (t1x + side*115) + ' ' + b.cy + ' ' + t1x + ' ' + b.cy;
  }

  if (a.row === b.row){
    var effBend = bend + avY;
    var dir = b.cx > a.cx ? 1 : -1;
    var sx2 = a.cx + dir * a.w/2, tx2 = b.cx - dir * b.w/2;
    var sy2 = a.cy + adj.fromDy, ty2 = b.cy + adj.toDy, ddx = tx2 - sx2, ddy = ty2 - sy2;
    if (Math.abs(ddy) < 4 && !effBend) return 'M ' + sx2 + ' ' + sy2 + ' L ' + tx2 + ' ' + ty2;
    if (effBend){ sy2 += effBend * 0.4; ty2 += effBend * 0.4; }
    return 'M ' + sx2 + ' ' + sy2 +
           ' C ' + (sx2 + ddx*0.3) + ' ' + (sy2 + ddy*0.08 + effBend) + ' ' +
           (sx2 + ddx*0.7) + ' ' + (ty2 - ddy*0.1 + effBend) + ' ' + tx2 + ' ' + ty2;
  }

  var up = b.cy < a.cy;
  var sy3 = a.cy + (up ? -a.h/2 : a.h/2);
  var ty3 = b.cy + (up ? b.h/2 : -b.h/2);
  var sx3 = a.cx + clamp((b.cx - a.cx) * 0.05, -30, 30) + adj.fromDx;
  var tx3 = b.cx + clamp((a.cx - b.cx) * 0.05, -30, 30) + adj.toDx;
  var dy = sy3 - ty3;
  return 'M ' + sx3 + ' ' + sy3 +
         ' C ' + (sx3 + avX) + ' ' + (sy3 - dy*0.5) + ' ' +
         (tx3 + (sx3-tx3)*0.3 + avX) + ' ' + (ty3 + dy*0.35) + ' ' + tx3 + ' ' + ty3;
}

/* ---------------- edge/node avoidance (pure core) ----------------
   Light, greedy, deterministic: sample every edge path against every
   foreign node card (inflated by a small margin); an intersecting edge
   tries a bounded candidate set of sideways detours (left/up first at
   each magnitude, magnitudes ascending, so the least deviation wins)
   and keeps the first clean candidate, else the best-scoring one. */
function samplePathD(d){
  var nums = d.match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/g).map(Number);
  var pts = [];
  function bz(p0, p1, p2, p3, t){
    var u = 1 - t;
    return {x: u*u*u*p0.x + 3*u*u*t*p1.x + 3*u*t*t*p2.x + t*t*t*p3.x,
            y: u*u*u*p0.y + 3*u*u*t*p1.y + 3*u*t*t*p2.y + t*t*t*p3.y};
  }
  var t;
  if (d.indexOf(' C ') < 0){
    for (var li=2; li<nums.length; li+=2) for (t = 0; t <= 1.0001; t += 0.04)
      pts.push({x: nums[li-2] + (nums[li] - nums[li-2]) * t, y: nums[li-1] + (nums[li+1] - nums[li-1]) * t});
    return pts;
  }
  var start = {x: nums[0], y: nums[1]};
  for (var i = 2; i + 5 < nums.length; i += 6){
    var seg = [start, {x: nums[i], y: nums[i+1]}, {x: nums[i+2], y: nums[i+3]}, {x: nums[i+4], y: nums[i+5]}];
    for (t = 0; t <= 1.0001; t += 0.04) pts.push(bz(seg[0], seg[1], seg[2], seg[3], t));
    start = seg[3];
  }
  return pts;
}
function countPathRectHits(pts, rects){
  var hits = 0;
  for (var ri = 0; ri < rects.length; ri++){
    var r = rects[ri];
    for (var pi = 0; pi < pts.length; pi++){
      var q = pts[pi];
      if (q.x > r.x && q.x < r.x + r.w && q.y > r.y && q.y < r.y + r.h){ hits++; break; }
    }
  }
  return hits;
}
var AVOID_MARGIN = 3;
var AVOID_MX = [-44, 44, -78, 78, -112, 112, -146, 146];
var AVOID_MY = [-30, 30, -54, 54, -78, 78];
function resolveEdgeAvoidance(edges, L, adj){
  edges.forEach(function(e, ei){
    var a = L.pos[e.from], b = L.pos[e.to];
    if (!a || !b) return;
    var rects = [];
    Object.keys(L.pos).forEach(function(id){
      if (id === e.from || id === e.to) return;
      var p = L.pos[id];
      rects.push({x: p.cx - p.w/2 - AVOID_MARGIN, y: p.cy - p.h/2 - AVOID_MARGIN,
                  w: p.w + 2*AVOID_MARGIN, h: p.h + 2*AVOID_MARGIN});
    });
    if (!rects.length) return;
    var base = countPathRectHits(samplePathD(edgePath(e, L, adj[ei])), rects);
    if (!base) return;
    var sameRow = !a.float && !b.float && a.row === b.row && Math.abs(a.cx - b.cx) >= 1;
    var cands = sameRow ? AVOID_MY : AVOID_MX;
    var key = sameRow ? 'avoidMy' : 'avoidMx';
    function sweep(){
      var bestVal = 0, best = base;
      for (var ci = 0; ci < cands.length; ci++){
        adj[ei][key] = cands[ci];
        var h = countPathRectHits(samplePathD(edgePath(e, L, adj[ei])), rects);
        if (h < best){ best = h; bestVal = cands[ci]; }
        if (h === 0) break;
      }
      adj[ei][key] = bestVal;
      return best;
    }
    var bestHits = sweep();
    /* center-landed float edge still blocked after every bow: retry the whole
       candidate ladder with the corner attach, which frees the column */
    if (bestHits > 0 && b.float){
      var centerVal = adj[ei][key];
      adj[ei][key] = 0;
      adj[ei].floatSide = true;
      base = countPathRectHits(samplePathD(edgePath(e, L, adj[ei])), rects);
      /* corner wins only when strictly fewer hits; ties keep the center */
      if (sweep() >= bestHits){ adj[ei].floatSide = false; adj[ei][key] = centerVal; }
    }
  });
  return adj;
}

/* ---------------- label collision resolution (B1, pure core) ----------------
   labels: [{x, y, w, h, fixed}] top-left rects (fixed = author-nudged, not moved);
   obstacles: [{x, y, w, h}]. Greedy: each label tries small vertical (then
   horizontal) offsets and takes the first collision-free candidate, else the
   least-overlapping one. Returns [{dx, dy}] in input order. */
function rectsOverlap(a, b){
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}
function overlapArea(a, b){
  var w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  var h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return (w > 0 && h > 0) ? w * h : 0;
}
function resolveLabelCollisions(labels, obstacles){
  var placed = [];
  var out = [];
  var CAND = [];
  [0, -9, 9, -18, 18, -27, 27, -40, 40, -54, 54].forEach(function(dy){
    [0, -14, 14, -28, 28].forEach(function(dx){ CAND.push({dx: dx, dy: dy}); });
  });
  labels.forEach(function(lb){
    if (lb.fixed){
      placed.push({x: lb.x, y: lb.y, w: lb.w, h: lb.h});
      out.push({dx: 0, dy: 0});
      return;
    }
    var best = CAND[0], bestScore = Infinity;
    for (var ci = 0; ci < CAND.length; ci++){
      var c = CAND[ci];
      var r = {x: lb.x + c.dx, y: lb.y + c.dy, w: lb.w, h: lb.h};
      var score = 0, oi;
      for (oi = 0; oi < obstacles.length; oi++) score += overlapArea(r, obstacles[oi]);
      for (oi = 0; oi < placed.length; oi++) score += overlapArea(r, placed[oi]);
      score += (Math.abs(c.dx) + Math.abs(c.dy)) * 0.01;  /* prefer small moves */
      if (score < bestScore){ bestScore = score; best = c; }
      if (bestScore < 0.02) break;                        /* first clean candidate wins */
    }
    placed.push({x: lb.x + best.dx, y: lb.y + best.dy, w: lb.w, h: lb.h});
    out.push({dx: best.dx, dy: best.dy});
  });
  return out;
}
/* ---- src/core/details.js ---- */
/* Detail definitions remain ordinary sections. These pure helpers are shared by
   authoring, portable validation and all viewers; resolving never performs I/O. */
var DETAIL_GEOMETRY_OWNER = {};
var DETAIL_MAX_DEPTH = 12;
function detailSection(page, reference){
  var records=sectionRecords(page);
  return records.find(function(r){return r.reference===reference;}) || records.find(function(r){return r.aliases && r.aliases.indexOf(reference)>=0;}) || records[oneBasedIndex(reference,records.length)] || null;
}
function detailTarget(page, detail){
  return specObject(detail) && !detail.spec && detail.section ? detailSection(page, detail.section) : null;
}
function detailURL(value){
  if (typeof value !== 'string') return null;
  try { var u = new URL(value); return /^https?:$/.test(u.protocol) && !u.username && !u.password ? u.href : null; }
  catch (_) { return null; }
}
function detailStepTarget(detail, stepper){
  var id = stepper && stepper.current().id;
  var mapped = id && detail.stepMap && Object.prototype.hasOwnProperty.call(detail.stepMap,id) ? detail.stepMap[id] : null;
  return Object.assign({}, {path:detail.path,step:detail.step}, specObject(mapped) ? mapped : {});
}
function validateDetails(page, errors, warnings){
  var records = sectionRecords(page), seen = Object.create(null);
  records.forEach(function(r){
    (r.aliases || []).forEach(function(alias){if(records.some(function(other){return other!==r && other.reference===alias;}))errors.push(r.path+'.id: section ID conflicts with a legacy heading reference '+alias);});
    var s=r.section, at=r.path;
    if(s.id != null && (typeof s.id !== 'string' || !/^[a-zA-Z][\w.-]*$/.test(s.id))) errors.push(at+'.id: use a stable identifier beginning with a letter');
    if(seen[r.reference]) errors.push(at+'.id: duplicate or ambiguous section reference '+r.reference);
    seen[r.reference]=true;
    if(s.detailOnly != null && typeof s.detailOnly !== 'boolean') errors.push(at+'.detailOnly: expected a boolean');
    Object.keys(s.diagram && s.diagram.nodes || {}).forEach(function(id){
      var detail=s.diagram.nodes[id].detail, where=at+'.diagram.nodes.'+id+'.detail';
      if(detail == null)return;
      if(!specObject(detail)){errors.push(where+': expected an object');return;}
      if(detail.mode != null && ['focus','expand','link'].indexOf(detail.mode)<0) errors.push(where+'.mode: expected focus, expand or link');
      ['section','spec','revision','path','step'].forEach(function(k){if(detail[k]!=null && (typeof detail[k]!=='string' || !detail[k].trim()))errors.push(where+'.'+k+': expected a nonempty string');});
      if(detail.url != null && !detailURL(detail.url))errors.push(where+'.url: expected an HTTP(S) URL without credentials');
      if(!detail.section && !detail.spec && !detail.url)errors.push(where+': choose a detail section, approved spec or URL');
      if((detail.spec || !detail.section) && detail.mode && detail.mode!=='link')errors.push(where+'.mode: external details use link');
      var target=detailTarget(page,detail), child=target && target.section.diagram;
      if(detail.section && !detail.spec && !child)errors.push(where+'.section: missing detail diagram '+detail.section);
      function checkTarget(t,label){
        if(!specObject(t)){errors.push(label+': expected {step, path?}');return;}
        if(child){
          var path=t.path || detail.path || diagramPathList(child)[0].id;
          var resolved=resolveSourceStep(child,path,t.step);
          if(!resolved || (t.step!=null && resolved.sourceIndex<0))errors.push(label+': unknown child step or path');
        }
      }
      if(child && (detail.path || detail.step))checkTarget(detail,where);
      if(detail.stepMap!=null){
        if(!specObject(detail.stepMap))errors.push(where+'.stepMap: expected a map of parent step IDs to child targets');
        else Object.keys(detail.stepMap).forEach(function(key){
          if(!(s.diagram.steps || []).some(function(st){return st.id===key;}))errors.push(where+'.stepMap.'+key+': unknown parent step ID');
          checkTarget(detail.stepMap[key],where+'.stepMap.'+key);
        });
      }
      if(detail.ports!=null){
        if(!specObject(detail.ports))errors.push(where+'.ports: expected {in, out}');
        else ['in','out'].forEach(function(k){
          var port=detail.ports[k];if(port==null)return;
          if(!child || !Object.prototype.hasOwnProperty.call(child.nodes || {},port))errors.push(where+'.ports.'+k+': unknown child node');
          else if(!(Array.isArray(child.rows)?child.rows:[]).some(function(row){return Array.isArray(row) && row.some(function(slot){return (Array.isArray(slot)?slot:[slot]).indexOf(port)>=0;});}) && !(Array.isArray(child.floats)?child.floats:[]).some(function(f){return f && f.id===port;}))
            errors.push(where+'.ports.'+k+': child node must be placed in rows or floats');
        });
      }
      if(detail.mode==='expand' && child){
        ['in','out'].forEach(function(k){
          if((s.diagram.edges || []).some(function(e){return e[k==='in'?'to':'from']===id;}) && !(detail.ports && detail.ports[k]))
            errors.push(where+'.ports.'+k+': required to reconnect domain edges when expanding');
        });
      }
    });
  });
}

/* Expanded topology is a disposable projection. Authored IDs and step registry
   never change. Child layouts keep their geometry inside wider compound slots. */
function expandDetailDiagram(page, source, expanded){
  if(!expanded || !expanded.length)return source;
  var d=Object.assign({},source), nodes=Object.assign(Object.create(null),source.nodes), groups=Object.assign(Object.create(null),source.groups || {});
  var domains=Object.create(null), internalEdges=[], pos=Object.create(null), groupBoxes=Object.create(null), rows=[], y=60, widest=1180;
  function unique(prefix, map){var key=prefix;while(Object.prototype.hasOwnProperty.call(map,key))key+='_';return key;}
  expanded.forEach(function(id){
    var n=source.nodes[id], detail=n && n.detail, target=detailTarget(page,detail);
    if(!target || !target.section.diagram)return;
    var child=target.section.diagram, ports=detail.ports || {};
    if((source.edges || []).some(function(e){return e.to===id && !ports.in || e.from===id && !ports.out;}))throw new Error('Define input and output boundary nodes before expanding '+(n.title || id)+'.');
    var keys=Object.create(null), group=unique('__detail_'+id,groups), childLayout=layout(child);
    if(['in','out'].some(function(k){return ports[k]!=null && !Object.prototype.hasOwnProperty.call(childLayout.pos,ports[k]);}))throw new Error('Input and output boundary nodes must be placed before expanding '+(n.title || id)+'.');
    Object.keys(child.nodes).forEach(function(k){keys[k]=unique('__detail_'+id+'_'+k,nodes);nodes[keys[k]]=Object.assign({},child.nodes[k],{group:group});});
    groups[group]={title:n.title || id,icon:n.icon || 'gear'};
    domains[id]={keys:keys,child:child,layout:childLayout,group:group,ports:ports};
    delete nodes[id];
    (child.edges || []).forEach(function(e){internalEdges.push(Object.assign({},e,{from:keys[e.from],to:keys[e.to]}));});
  });
  function endpoint(id,direction){return domains[id] ? domains[id].keys[domains[id].ports[direction]] : id;}
  function edgeKey(key){var pair=String(key).split('->');return pair.length===2?endpoint(pair[0],'out')+'->'+endpoint(pair[1],'in'):key;}
  function nodeKeys(id){return domains[id]?Object.values(domains[id].keys):[id];}
  function projectStep(step){
    var s=Object.assign({},step);
    if(s.edge)s.edge=edgeKey(s.edge);if(s.edges)s.edges=s.edges.map(edgeKey);
    if(s.nodes)s.nodes=s.nodes.flatMap(nodeKeys);
    if(s.tone){s.tone=Object.create(null);Object.keys(step.tone).forEach(function(k){nodeKeys(k).forEach(function(id){s.tone[id]=step.tone[k];});});}
    if(s.failures){s.failures=Object.create(null);Object.keys(step.failures).forEach(function(k){s.failures[edgeKey(k)]=step.failures[k];});}
    if(s.packets)s.packets=s.packets.map(function(p){return Object.assign({},p,{edge:edgeKey(p.edge)});});
    if(s.conditions)s.conditions=s.conditions.flatMap(function(c){return c.nodeId?nodeKeys(c.nodeId).map(function(id){return Object.assign({},c,{nodeId:id});}):[c];});
    return s;
  }
  var sourceRows=(source.rows || []).map(function(row){return row.map(function(slot){return Array.isArray(slot)?slot:[slot];});});
  (source.floats || []).forEach(function(f){if(f.side==='above')sourceRows.unshift([[f.id]]);else sourceRows.push([[f.id]]);});
  sourceRows.forEach(function(slots,ri){
    var measures=slots.map(function(ids){var h=0,w=190;ids.forEach(function(id){var item=domains[id];w=Math.max(w,item?item.layout.vb.w+48:190);h+=(item?item.layout.vb.h+56:70)+32;});return {w:w,h:h,ids:ids};});
    var width=measures.reduce(function(n,m){return n+m.w+90;},0)+40, height=Math.max.apply(null,measures.map(function(m){return m.h;}));
    widest=Math.max(widest,width);var x=40, rowIds=[];
    measures.forEach(function(m,fi){var localY=y+(height-m.h)/2;
      m.ids.forEach(function(id){var item=domains[id];
        if(item){var vb=item.layout.vb, dx=x+24-vb.x,dy=localY+38-vb.y;
          Object.keys(item.layout.pos).forEach(function(k){var p=item.layout.pos[k],key=item.keys[k];pos[key]=Object.assign({},p,{cx:p.cx+dx,cy:p.cy+dy,row:ri,flow:fi,stack:true});rowIds.push(key);});
          groupBoxes[item.group]={x:x,y:localY,w:m.w,h:vb.h+56,nestLevel:0};localY+=vb.h+88;
        }else if(nodes[id]){pos[id]={cx:x+m.w/2,cy:localY+35,w:170,h:CARD_H,row:ri,flow:fi,stack:false};rowIds.push(id);localY+=102;}
      });x+=m.w+90;
    });
    rows.push({top:y,center:y+height/2,height:height,slots:rowIds,k:rowIds.length});y+=height+120;
  });
  // Retain authored domain boundaries around their remaining visible members.
  Object.keys(source.groups || {}).forEach(function(g){var members=Object.keys(source.nodes).filter(function(k){return source.nodes[k].group===g;}).flatMap(nodeKeys).map(function(k){return pos[k];}).filter(Boolean);if(!members.length)return;
    var left=Math.min.apply(null,members.map(function(p){return p.cx-p.w/2;}))-20,top=Math.min.apply(null,members.map(function(p){return p.cy-p.h/2;}))-40;
    groupBoxes[g]={x:left,y:top,w:Math.max.apply(null,members.map(function(p){return p.cx+p.w/2;}))-left+20,h:Math.max.apply(null,members.map(function(p){return p.cy+p.h/2;}))-top+20,nestLevel:0};
  });
  d.nodes=nodes;d.groups=groups;d.rows=rows.map(function(r){return r.slots;});d.floats=[];delete d.routing;
  d.edges=(source.edges || []).map(function(e){return Object.assign({},e,{from:endpoint(e.from,'out'),to:endpoint(e.to,'in')});}).concat(internalEdges);
  d.steps=(source.steps || []).map(projectStep);
  d._detailGeometry={owner:DETAIL_GEOMETRY_OWNER,layout:{pos:pos,rows:rows,groups:groupBoxes,H:y,vb:{x:0,y:0,w:widest,h:y}}};
  return d;
}
/* ---- src/panels/shared.js ---- */
/* Pure panel utilities shared by declarations, folds and render models. */
function panelObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}
function panelOwn(obj, key) {
  return panelObject(obj) && Object.prototype.hasOwnProperty.call(obj, key);
}
var BUFFER_STATES = ['empty', 'buffered', 'protected', 'uploading', 'uploaded', 'dropped'];
function bufferSegCount(decl) {
  return decl && typeof decl.segments === 'number' && isFinite(decl.segments)
    ? Math.round(Math.max(2, Math.min(48, decl.segments)))
    : 12;
}
function bufferPaint(n, baseCells, marks) {
  var cells = [];
  for (var i = 0; i < n; i++) {
    var t = Array.isArray(baseCells) ? baseCells[i] : undefined;
    cells.push(BUFFER_STATES.indexOf(t) >= 0 ? t : 'empty');
  }
  (Array.isArray(marks) ? marks : []).forEach(function (op) {
    if (!Array.isArray(op) || op.length < 3) return;
    var a = op[0],
      b = op[1],
      tok = op[2];
    if (typeof a !== 'number' || !isFinite(a) || typeof b !== 'number' || !isFinite(b)) return;
    if (BUFFER_STATES.indexOf(tok) < 0) return;
    a = Math.max(0, Math.round(a));
    b = Math.min(n - 1, Math.round(b));
    for (var mi = a; mi <= b; mi++) cells[mi] = tok;
  });
  return cells;
}

/* Collection shape belongs to the descriptor; ID filtering is shared. */
function softwarePanelItems(p) {
  var descriptor = PanelRegistry.get(p.type);
  var collection = descriptor && descriptor.itemCollection;
  if (!collection) return [];
  return panelCollectionItems(p, collection.key, collection.max);
}
function panelCollectionItems(p, key, max) {
  var seen = Object.create(null);
  return (Array.isArray(p[key]) ? p[key] : []).slice(0, max).filter(function (item) {
    if (!panelObject(item) || typeof item.id !== 'string' || !item.id || seen[item.id])
      return false;
    seen[item.id] = true;
    return true;
  });
}
function panelCollectionWarnings(p, path, warnings, key, max, validateItem) {
  var seen = Object.create(null);
  if (!Array.isArray(p[key]) || !p[key].length)
    warnings.push(path + '.' + key + ': needs 1–' + max + ' entries with unique string ids');
  else {
    if (p[key].length > max)
      warnings.push(path + '.' + key + ': only the first ' + max + ' entries render');
    p[key].forEach(function (item, i) {
      var at = path + '.' + key + '[' + i + ']';
      if (!panelObject(item) || typeof item.id !== 'string' || !item.id) {
        warnings.push(at + '.id: needs a non-empty string — entry skipped');
        return;
      }
      if (seen[item.id])
        warnings.push(at + '.id: duplicate id "' + item.id + '" — later entry skipped');
      seen[item.id] = true;
      if (validateItem) validateItem(item, at, warnings);
    });
  }
}
/* Sparse snapshots carry shallow fields, append histories and isolate one-step
   overrides. Range paints retain the original generic compatibility behavior. */
function foldCommonPanelStates(panel, steps, options) {
  options = options || {};
  var carried = {},
    accumulated = {},
    states = [];
  Object.keys(panel.initial || {}).forEach(function (key) {
    carried[key] = panel.initial[key];
  });
  var logAcc = [];
  if (Array.isArray(carried.log)) {
    logAcc = carried.log.slice();
    delete carried.log;
  }
  (options.append || []).forEach(function (key) {
    accumulated[key] = Array.isArray(carried[key]) ? carried[key].slice() : [];
    delete carried[key];
  });
  function snapshot(once) {
    var snap = {};
    Object.keys(carried).forEach(function (key) {
      snap[key] = carried[key];
    });
    if (once)
      Object.keys(once).forEach(function (key) {
        snap[key] = once[key];
      });
    Object.keys(accumulated).forEach(function (key) {
      snap[key] = accumulated[key].slice();
    });
    snap.log = logAcc.slice();
    return snap;
  }
  steps.forEach(function (step) {
    var patch = (stepPanelPatch(step) || {})[panel.id] || {},
      once = null;
    /* Replacing cells resets earlier range paints; this patch's marks then
       apply on top of that replacement. */
    if (patch.cells !== undefined) carried.mark = [];
    Object.keys(patch).forEach(function (key) {
      if (key === 'enterOnce') {
        once = patch[key];
        return;
      }
      if (key === 'log') {
        logAcc = logAcc.concat(Array.isArray(patch.log) ? patch.log : [patch.log]);
        return;
      }
      if (Object.prototype.hasOwnProperty.call(accumulated, key)) {
        accumulated[key] = accumulated[key].concat(
          Array.isArray(patch[key]) ? patch[key] : [patch[key]]
        );
        return;
      }
      if (options.accept && Object.prototype.hasOwnProperty.call(options.accept, key)) {
        if (options.accept[key](patch[key])) carried[key] = patch[key];
        return;
      }
      if (key === 'mark') {
        var ops = Array.isArray(patch.mark) ? patch.mark : [];
        carried.mark = (Array.isArray(carried.mark) ? carried.mark : []).concat(ops);
        if (carried.mark.length > 64) {
          carried.cells = bufferPaint(bufferSegCount(panel), carried.cells, carried.mark);
          carried.mark = [];
        }
        return;
      }
      carried[key] = patch[key];
    });
    states.push(snapshot(once));
  });
  if (!steps.length) states.push(snapshot(null));
  return states;
}

/* Snapshot validation and enter-once traversal share one set of object rules. */
function softwarePanelPatchWarnings(state, path, panel, warnings, validateState) {
  if (state == null) return;
  if (!panelObject(state)) {
    warnings.push(path + ': expected a state object — ignored');
    return;
  }
  validateState(state, path, panel, warnings);
  if (panelObject(state.enterOnce)) {
    var once = Object.assign({}, state.enterOnce);
    delete once.enterOnce;
    softwarePanelPatchWarnings(once, path + '.enterOnce', panel, warnings, validateState);
  }
}
function panelKeyedStateWarnings(state, path, panel, warnings, key, validateValue) {
  if (state[key] == null) return;
  var ids = softwarePanelItems(panel).map(function (item) {
    return item.id;
  });
  if (!panelObject(state[key]))
    warnings.push(path + '.' + key + ': expected an object keyed by declared id');
  else
    Object.keys(state[key]).forEach(function (id) {
      var at = path + '.' + key + '.' + id,
        value = state[key][id];
      if (ids.indexOf(id) < 0) {
        warnings.push(at + ': unknown declared id — ignored');
        return;
      }
      validateValue(value, at, warnings);
    });
}

/* Shared panel presentation lifecycle. Panel modules describe their output and
   motion; none owns another panel's state, DOM or animation implementation. */
var PanelViews = {
  register: function (type, render, options) {
    if (typeof render !== 'function') throw new Error('Invalid panel renderer: ' + type);
    if (PanelRegistry.get(type) && PanelRegistry.get(type).render)
      throw new Error('Duplicate panel renderer: ' + type);
    render.options = options || {};
    PanelRegistry.extend(type, { render: render });
  },
  get: function (type) {
    var definition = PanelRegistry.get(type),
      render = definition && definition.render;
    if (render && !render.options) render.options = definition.presentation || {};
    return render;
  },
  types: function () {
    return PanelRegistry.types().filter(function (type) {
      return !!PanelViews.get(type);
    });
  },
};
var ZF_SEQ = 0; // Shared unique SVG IDs across every panel instance.
function panelDecimalPlaces(value) {
  var text = String(value),
    dot = text.indexOf('.');
  return dot < 0 ? 0 : Math.min(3, text.length - dot - 1);
}
function softwarePanelShell(content, state) {
  return (
    '<div class="swpanel">' +
    content +
    (state.note ? '<div class="swnote">' + esc(String(state.note)) + '</div>' : '') +
    '</div>'
  );
}
// Kept as a compatibility helper for callers of the software panel models.
function softwarePanelHTML(panel, state) {
  var render = PanelViews.get(panel.type);
  return render ? render({}, panel, state || {}).html : softwarePanelShell('', state || {});
}
function panelGlideElements(host, glide) {
  if (!glide) return [];
  if (glide.multiple)
    return typeof host.querySelectorAll === 'function' ? host.querySelectorAll(glide.selector) : [];
  var el = host.querySelector(glide.selector);
  return el ? [el] : [];
}
function cancelPanelMotion(host) {
  if (host._thTween && typeof cancelAnimationFrame === 'function')
    cancelAnimationFrame(host._thTween);
  host._thTween = null;
  if (host._pulseTimer) {
    clearTimeout(host._pulseTimer);
    host._pulseTimer = null;
  }
  host._ifEpoch = (host._ifEpoch || 0) + 1;
}
function settlePanelPresentation(host, result) {
  cancelPanelMotion(host);
  if (typeof host.querySelectorAll === 'function') {
    var emphasized = host.querySelectorAll('.dv-chip-pulse,.dv-bar-enter');
    for (var i = 0; i < emphasized.length; i++) {
      emphasized[i].classList.remove('dv-chip-pulse');
      emphasized[i].classList.remove('dv-bar-enter');
    }
    var fresh = host.querySelectorAll('.fresh');
    for (var f = 0; f < fresh.length; f++) fresh[f].classList.remove('fresh');
    if (result.transient) {
      var temporary = host.querySelectorAll(result.transient);
      for (var j = temporary.length - 1; j >= 0; j--)
        if (temporary[j].parentNode) temporary[j].parentNode.removeChild(temporary[j]);
    }
  }
  var level = result.level;
  if (level) {
    var fill = host.querySelector(level.fill),
      value = host.querySelector(level.readout);
    if (fill) {
      fill.style.transition = 'none';
      fill.style.width = level.pct.toFixed(1) + '%';
    }
    var settled = level.settled !== undefined ? level.settled : level.value;
    if (value && value.firstChild && settled != null) value.firstChild.nodeValue = String(settled);
  }
  var subjects = panelGlideElements(host, result.glide);
  for (var k = 0; k < subjects.length; k++) {
    subjects[k].style.transition = 'none';
    subjects[k].style.transform = 'translate(0,0)';
  }
  if (result.bars && typeof host.querySelectorAll === 'function') {
    var bars = host.querySelectorAll(result.bars.selector);
    result.bars.frames.forEach(function (frame, i) {
      if (!bars[i]) return;
      bars[i].style.transition = 'none';
      bars[i].style.width = frame.width.toFixed(3) + '%';
      bars[i].style.opacity = '1';
    });
  }
  if (result.settle) result.settle();
}
function tweenPanelLevel(host, level, animate) {
  var pctNow = level.pct,
    valNow = level.value,
    prev = host._thPrev;
  host._thPrev = { pct: pctNow, value: valNow };
  if (!animate || !prev || valNow == null) return;
  var fill = host.querySelector(level.fill);
  if (fill && typeof prev.pct === 'number' && Math.abs(prev.pct - pctNow) > 0.05) {
    var epoch = host._ifEpoch;
    fill.style.transition = 'none';
    fill.style.width = prev.pct.toFixed(1) + '%';
    void fill.getBoundingClientRect();
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        if (host._ifEpoch !== epoch) return;
        fill.style.transition = '';
        fill.style.width = pctNow.toFixed(1) + '%';
      });
    });
  }
  var value = host.querySelector(level.readout);
  if (value && typeof prev.value === 'number' && prev.value !== valNow && value.firstChild) {
    var mul = Math.pow(10, level.decimals),
      from = prev.value,
      t0 = Date.now(),
      node = value.firstChild;
    var tick = function () {
      var k = Math.min(1, (Date.now() - t0) / 500);
      k = 1 - (1 - k) * (1 - k);
      node.nodeValue = String(Math.round((from + (valNow - from) * k) * mul) / mul);
      if (k < 1) host._thTween = requestAnimationFrame(tick);
      else host._thTween = null;
    };
    host._thTween = requestAnimationFrame(tick);
  }
}
function tweenPanelBars(host, bars, animate) {
  if (
    !animate ||
    !bars.previous ||
    typeof host.querySelectorAll !== 'function' ||
    typeof requestAnimationFrame !== 'function'
  )
    return;
  var elements = host.querySelectorAll(bars.selector),
    tweens = [];
  bars.frames.forEach(function (frame, i) {
    var el = elements[i];
    if (!el) return;
    var width = bars.previous[frame.key],
      fresh = typeof width !== 'number';
    if (fresh) width = 0;
    if (!fresh && Math.abs(width - frame.width) < 0.001) return;
    el.style.transition = 'none';
    el.style.width = width.toFixed(3) + '%';
    if (fresh) el.style.opacity = '0';
    tweens.push({ el: el, width: frame.width, fresh: fresh });
  });
  if (!tweens.length) return;
  var epoch = host._ifEpoch;
  void tweens[0].el.getBoundingClientRect();
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      if (host._ifEpoch !== epoch) return;
      tweens.forEach(function (tween) {
        tween.el.style.transition = '';
        tween.el.style.width = tween.width.toFixed(3) + '%';
        if (tween.fresh) tween.el.style.opacity = '1';
      });
    });
  });
}
/* Input is an absolute folded snapshot. Previous DOM values are presentation
   history only; they never participate in state folding or alternate paths. */
function renderPanelBody(host, panel, state, skin, states, stepIdx, animatePresentation) {
  var render = PanelViews.get(panel.type),
    animate = animatePresentation !== false && !RM;
  var result = render
    ? render(host, panel, state || {}, skin, states, stepIdx, animate)
    : {
        html: '<div class="punknown">unknown panel type: ' + esc(String(panel.type)) + '</div>',
      };
  if (!animate) settlePanelPresentation(host, result);
  if (host._lastHTML === result.html) return;
  if (animate) cancelPanelMotion(host);
  var patched = result.patch && result.patch();
  host._lastHTML = result.baseline != null ? result.baseline : result.html;
  if (!patched) host.innerHTML = result.html;
  if (result.mounted) result.mounted();
  if (animate && result.glide) {
    var subjects = panelGlideElements(host, result.glide),
      glideEpoch = host._ifEpoch;
    if (subjects.length) {
      for (var i = 0; i < subjects.length; i++) void subjects[i].getBoundingClientRect();
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          if (host._ifEpoch !== glideEpoch) return;
          for (var j = 0; j < subjects.length; j++) subjects[j].style.transform = 'translate(0,0)';
        });
      });
    }
  }
  if (result.level) tweenPanelLevel(host, result.level, animate);
  if (animate && result.pulse && result.pulse.changed) {
    var pulse = host.querySelector(result.pulse.selector);
    if (pulse && pulse.classList) {
      pulse.classList.add('dv-chip-pulse');
      host._pulseTimer = setTimeout(function () {
        pulse.classList.remove('dv-chip-pulse');
        host._pulseTimer = null;
      }, 620);
    }
  }
  if (
    animate &&
    result.enterBars &&
    result.enterBars.entrants &&
    typeof host.querySelectorAll === 'function'
  ) {
    var rows = host.querySelectorAll(result.enterBars.rows);
    result.enterBars.entrants.forEach(function (enters, i) {
      if (!enters || !rows[i]) return;
      var bar = rows[i].querySelector(result.enterBars.bar);
      if (bar) bar.classList.add('dv-bar-enter');
    });
  }
  if (result.bars) tweenPanelBars(host, result.bars, animate);
}

/* log panels are the only widgets that GROW as steps append lines, so they
   always render at the BOTTOM of the panel column — nothing below them can
   be pushed around. Relative order within each group is preserved. */
function panelOrder(panels) {
  var fixed = [],
    growing = [];
  (panels || []).forEach(function (p) {
    var view = p && PanelViews.get(p.type);
    (view && view.options.growing ? growing : fixed).push(p);
  });
  return fixed.concat(growing);
}

function buildPanels(asideEl, d, skin, primaryHost, primaryId) {
  var folded = foldPanelStates(d);
  var traceNavigation = (d.steps || []).length && d.view !== 'ambient-only';
  var hosts = {};
  panelOrder(d.panels).forEach(function (p) {
    if (!p || !p.id) return;
    var card = document.createElement('div');
    card.className = 'pwidget pt-' + (PANEL_TYPES.indexOf(p.type) >= 0 ? p.type : 'unknown');
    /* spec index, not render order — log panels are reordered to the end */
    card.setAttribute('data-dv-panel', String((d.panels || []).indexOf(p)));
    if (p.title) {
      var t = document.createElement('div');
      t.className = 'ptitle';
      t.textContent = p.title;
      card.appendChild(t);
    }
    var body = document.createElement('div');
    body.className = 'pbody';
    card.appendChild(body);
    (primaryHost && p.id === (primaryId || d.primaryPanel) ? primaryHost : asideEl).appendChild(
      card
    );
    hosts[p.id] = { panel: p, body: body };
    /* Homemap ambient state precedes step zero; other widgets keep their
       established first-folded-step preview. */
    var view = PanelViews.get(p.type),
      options = view ? view.options : {};
    var home = options.ambientInitial;
    renderPanelBody(
      body,
      p,
      home ? p.initial : (folded[p.id] || [])[0],
      skin,
      options.historyRequiresSteps && !traceNavigation ? [] : folded[p.id] || [],
      home ? -1 : 0,
      false
    );
  });
  return {
    destroy: function () {
      Object.keys(hosts).forEach(function (id) {
        cancelPanelMotion(hosts[id].body);
      });
    },
    setDiagram: function (next) {
      folded = foldPanelStates(next);
      traceNavigation = (next.steps || []).length && next.view !== 'ambient-only';
    },
    setStep: function (i, animate, ambient) {
      Object.keys(hosts).forEach(function (pid) {
        var states = folded[pid] || [];
        var si = Math.min(i, states.length - 1);
        var panel = hosts[pid].panel;
        var view = PanelViews.get(panel.type),
          options = view ? view.options : {};
        var homeAmbient = ambient && options.ambientInitial;
        renderPanelBody(
          hosts[pid].body,
          panel,
          homeAmbient ? panel.initial : states[si],
          skin,
          options.historyRequiresSteps && !traceNavigation ? [] : states,
          homeAmbient ? -1 : si,
          animate
        );
      });
    },
  };
}
/* ---- src/panels/types/battery.js ---- */
/* battery validation and pure state helpers. */

PanelRegistry.extend('battery', {
  validateDeclaration: function (p, PP, warnings, errors, d) {
    ['low', 'crit'].forEach(function (bk) {
      if (p[bk] != null && !isFiniteNum(p[bk]))
        warnings.push(PP + '.' + bk + ': must be a finite number — ignored');
    });
    if (isFiniteNum(p.low) && isFiniteNum(p.crit) && p.crit > p.low)
      warnings.push(
        PP + ': crit exceeds low — thresholds swapped at render (battery zones are at-or-below)'
      );
    if (p.initial && p.initial.charge != null && !isFiniteNum(p.initial.charge))
      warnings.push(PP + '.initial.charge: must be a finite number — rendered as NO DATA');
  },
  validatePatch: function (patch, path, panel, warnings, context) {
    if (patch.charge != null && !isFiniteNum(patch.charge))
      warnings.push(path + '.charge: must be a finite number — rendered as NO DATA');
  },
});

/* battery panel: presentation model and renderer. Shared lifecycle lives in ../shared.js. */
var BATTERY_ZONE_LABELS = {
  ok: 'NOMINAL',
  low: 'LOW',
  crit: 'CRITICAL',
  na: 'NO DATA',
};
var BATTERY_SOURCES = ['solar', 'wired', 'poe', 'cells'];
var BATTERY_TRENDS = ['charging', 'draining', 'idle'];
function batteryModel(panel, state) {
  panel = panel || {};
  state = state || {};
  function fin(v) {
    return typeof v === 'number' && isFinite(v) ? v : null;
  }
  var low = fin(panel.low) != null ? clamp(panel.low, 0, 100) : null;
  var crit = fin(panel.crit) != null ? clamp(panel.crit, 0, 100) : null;
  if (low != null && crit != null && crit > low) {
    var sw = low;
    low = crit;
    crit = sw;
  }
  var charge = fin(state.charge) != null ? clamp(state.charge, 0, 100) : null;
  var zone = 'na';
  if (charge != null) {
    zone = 'ok';
    if (low != null && charge <= low) zone = 'low';
    if (crit != null && charge <= crit) zone = 'crit';
  }
  var trend = BATTERY_TRENDS.indexOf(state.trend) >= 0 ? state.trend : null;
  var source = BATTERY_SOURCES.indexOf(state.source) >= 0 ? state.source : null;
  return {
    charge: charge,
    low: low,
    crit: crit,
    zone: zone,
    trend: trend,
    source: source,
    cold: state.cold === true,
    note: state.note != null ? String(state.note) : '',
    label: state.label != null ? String(state.label) : BATTERY_ZONE_LABELS[zone],
  };
}

/* tiles widget: a device-fleet grid — one named tile per device/cohort with
   a state chip and an optional sub-line. Pure model (node-testable). Tiles
   and the state vocabulary (states + colors, like the state widget) are
   DECLARED once; each step patches per tile id (like leds/signal): a patch
   replaces that tile's whole `{state, sub}` status. A state not in the
   declared list renders the tile dimmed with '—' (validator warns). */

PanelViews.register('battery', function (host, panel, state, skin, states, stepIdx, animate) {
  var h = '';
  var bm = batteryModel(panel, state);
  var bidx = typeof stepIdx === 'number' ? stepIdx : 0;
  var bv = bm.charge != null ? String(Math.round(bm.charge)) : null;
  h +=
    '<div class="bthead"><div class="btval z-' +
    bm.zone +
    '">' +
    (bv != null ? esc(bv) : '&#8212;') +
    '<span class="btunit">%</span>' +
    (bm.trend === 'charging' ? '<span class="btbolt" aria-label="charging">&#9889;</span>' : '') +
    (bm.cold ? '<span class="btcold" aria-label="cold-limited">&#10052;</span>' : '') +
    '</div><span class="btzone z-' +
    bm.zone +
    '">' +
    esc(bm.label) +
    '</span></div>';
  /* battery glyph: shell + terminal nub + zone-colored fill; low/crit
       threshold ticks on the shell like thermo's bands */
  h += '<div class="btglyph"><div class="btshell">';
  if (bm.charge != null)
    h +=
      '<span class="btfill z-' + bm.zone + '" style="width:' + bm.charge.toFixed(1) + '%"></span>';
  if (bm.low != null)
    h += '<span class="bttick low" style="left:' + bm.low.toFixed(1) + '%"></span>';
  if (bm.crit != null)
    h += '<span class="bttick crit" style="left:' + bm.crit.toFixed(1) + '%"></span>';
  h += '</div><span class="btnub"></span></div>';
  /* context row: power source badge + trend word + forecast note; all
       containers always emitted so the panel height is constant */
  h +=
    '<div class="btctx"><span class="btsrc">' +
    (bm.source ? esc(bm.source.toUpperCase()) : '') +
    '</span>' +
    '<span class="bttrend">' +
    (bm.trend ? esc(bm.trend) : '') +
    '</span>' +
    '<span class="btnote">' +
    esc(bm.note) +
    '</span></div>';
  /* step-history sparkline, same reveal semantics as thermo: every step's
       folded charge plots faintly, bright up to the current step, gaps break
       the line */
  var bhist = Array.isArray(states)
    ? states.map(function (s) {
        return s && typeof s.charge === 'number' && isFinite(s.charge)
          ? clamp(s.charge, 0, 100)
          : null;
      })
    : [];
  if (bhist.length > 1) {
    var bX = function (i) {
      return 6 + (248 * i) / (bhist.length - 1);
    };
    var bY = function (vv) {
      return 54 - (vv / 100) * 46;
    };
    h += '<svg class="btspark" viewBox="0 0 260 62" role="img" aria-label="charge per step">';
    if (bm.low != null)
      h +=
        '<line class="btguide low" x1="6" x2="254" y1="' +
        bY(bm.low).toFixed(1) +
        '" y2="' +
        bY(bm.low).toFixed(1) +
        '"/>';
    if (bm.crit != null)
      h +=
        '<line class="btguide crit" x1="6" x2="254" y1="' +
        bY(bm.crit).toFixed(1) +
        '" y2="' +
        bY(bm.crit).toFixed(1) +
        '"/>';
    var bGhost = [],
      bLit = [],
      bg = null,
      bl = null;
    bhist.forEach(function (vv, i) {
      if (vv == null) {
        bg = null;
        bl = null;
        return;
      }
      var pt = bX(i).toFixed(1) + ',' + bY(vv).toFixed(1);
      if (!bg) {
        bg = [];
        bGhost.push(bg);
      }
      bg.push(pt);
      if (i <= bidx) {
        if (!bl) {
          bl = [];
          bLit.push(bl);
        }
        bl.push(pt);
      } else bl = null;
    });
    bGhost.forEach(function (seg) {
      if (seg.length > 1) h += '<polyline class="btline ghost" points="' + seg.join(' ') + '"/>';
    });
    bLit.forEach(function (seg) {
      if (seg.length > 1) h += '<polyline class="btline" points="' + seg.join(' ') + '"/>';
    });
    bhist.forEach(function (vv, i) {
      if (vv == null) return;
      var bz = batteryModel(panel, { charge: vv }).zone;
      var bCur = i === bidx;
      h +=
        '<circle class="btdot z-' +
        bz +
        (i <= bidx ? ' on' : '') +
        (bCur ? ' cur' : '') +
        '" cx="' +
        bX(i).toFixed(1) +
        '" cy="' +
        bY(vv).toFixed(1) +
        '" r="' +
        (bCur ? 4 : 2.4) +
        '"/>';
    });
    h += '</svg>';
  }
  return {
    html: h,
    level: {
      pct: bm.charge != null ? bm.charge : 0,
      value: bm.charge,
      settled: bv,
      fill: '.btfill',
      readout: '.btval',
      decimals: 0,
    },
  };
});

PanelRegistry.extend('battery', {
  order: 13,
  label: 'Battery',
  since: '0.1.0',
});

PanelRegistry.extend('battery', {
  styles: [
    {
      order: 758,
      css: String.raw`.bthead{display:flex; align-items:baseline; justify-content:space-between; gap:8px; margin-bottom:8px;}
.btval{font:700 20px 'IBM Plex Mono',monospace;}
.btunit{font-size:11px; font-weight:500; opacity:.6; margin-left:3px;}
.btbolt{font-size:13px; margin-left:5px;}
.btcold{font-size:12px; margin-left:4px; opacity:.85;}
.sk-aurora .btval{color:#EAF2FF;}
.sk-daylight .btval{color:#23272E;}
.sk-aurora .btval.z-low{color:#FFB454;}
.sk-daylight .btval.z-low{color:#B0771A;}
.sk-aurora .btval.z-crit{color:#FF6B5E;}
.sk-daylight .btval.z-crit{color:#B91C1C;}
.btval.z-na{opacity:.4;}
.btzone{font:700 9.5px 'IBM Plex Mono',monospace; letter-spacing:.08em; padding:3px 8px; border-radius:6px; border:1px solid transparent; white-space:nowrap;}
.sk-aurora .btzone.z-ok{color:#4ADE80; border-color:#1E4A33; background:#0C2418;}
.sk-daylight .btzone.z-ok{color:#0E7A3C; border-color:#BFE3CC; background:#EAF7EF;}
.sk-aurora .btzone.z-low{color:#FFB454; border-color:#5A431C; background:#2A2010;}
.sk-daylight .btzone.z-low{color:#B0771A; border-color:#EAD9B0; background:#FBF3E0;}
.sk-aurora .btzone.z-crit{color:#FF6B5E; border-color:#5F2320; background:#2C1210;}
.sk-daylight .btzone.z-crit{color:#B91C1C; border-color:#EFC4C0; background:#FBEBEA;}
.btzone.z-crit{animation:ledpulse .6s ease-in-out infinite alternate;}
.sk-aurora .btzone.z-na{color:#55627A; border-color:#1D2A40; background:#101A2C;}
.sk-daylight .btzone.z-na{color:#9A958A; border-color:#E0DCD1; background:#F4F2EC;}
.btglyph{display:flex; align-items:center; gap:2px;}
.btshell{position:relative; flex:1; height:14px; border-radius:4px; overflow:hidden; border:1.5px solid;}
.sk-aurora .btshell{background:#101A2C; border-color:#2B3B55;}
.sk-daylight .btshell{background:#F4F2EC; border-color:#C9C4B8;}
.btnub{width:4px; height:7px; border-radius:0 2px 2px 0;}
.sk-aurora .btnub{background:#2B3B55;}
.sk-daylight .btnub{background:#C9C4B8;}
.btfill{position:absolute; top:0; bottom:0; left:0; transition:width .6s cubic-bezier(.4,0,.2,1);}
.sk-aurora .btfill.z-ok{background:#4ADE80;}
.sk-daylight .btfill.z-ok{background:#0E9382;}
.btfill.z-low{background:#FFB454;}
.sk-daylight .btfill.z-low{background:#B0771A;}
.btfill.z-crit{background:#FF6B5E; box-shadow:0 0 8px rgba(255,107,94,.7);}
.sk-daylight .btfill.z-crit{background:#B91C1C; box-shadow:none;}
.bttick{position:absolute; top:0; bottom:0; width:2px;}
.bttick.low{background:#FFB454;}
.bttick.crit{background:#FF6B5E;}
.sk-daylight .bttick.low{background:#B0771A;}
.sk-daylight .bttick.crit{background:#B91C1C;}
.btctx{display:flex; align-items:baseline; gap:10px; margin-top:5px; height:15px; overflow:hidden;
  font:600 9.5px 'IBM Plex Mono',monospace; letter-spacing:.05em;}
.sk-aurora .btctx{color:#5E7396;}
.sk-daylight .btctx{color:#8A8474;}
.btsrc{min-width:44px;}
.sk-aurora .btsrc{color:#8AE8FF;}
.sk-daylight .btsrc{color:#4956C9;}
.btnote{margin-left:auto; white-space:nowrap; text-overflow:ellipsis; overflow:hidden;}
.btspark{display:block; width:100%; height:auto; margin-top:6px;}
.btguide{stroke-width:1; stroke-dasharray:3 4;}
.btguide.low{stroke:rgba(255,180,84,.45);}
.btguide.crit{stroke:rgba(255,107,94,.45);}
.sk-daylight .btguide.low{stroke:rgba(176,119,26,.45);}
.sk-daylight .btguide.crit{stroke:rgba(185,28,28,.45);}
.btline{fill:none; stroke-width:1.6; stroke-linejoin:round; stroke-linecap:round;}
.sk-aurora .btline{stroke:#38E1FF;}
.sk-daylight .btline{stroke:#4956C9;}
.btline.ghost{opacity:.18;}
.btdot{opacity:.25;}
.btdot.on{opacity:1;}
.sk-aurora .btdot.z-ok{fill:#4ADE80;}
.sk-daylight .btdot.z-ok{fill:#0E9382;}
.btdot.z-low{fill:#FFB454;}
.sk-daylight .btdot.z-low{fill:#B0771A;}
.btdot.z-crit{fill:#FF6B5E;}
.sk-daylight .btdot.z-crit{fill:#B91C1C;}
.sk-aurora .btdot.cur{filter:drop-shadow(0 0 4px rgba(56,225,255,.8));}
.btdot.cur.z-crit{filter:drop-shadow(0 0 5px rgba(255,107,94,.9)); animation:ledpulse .6s ease-in-out infinite alternate;}`,
    },
    {
      order: 1214,
      css: String.raw`@media (prefers-reduced-motion: reduce){
  .btfill{transition:none !important;}
}
@media (prefers-reduced-motion: reduce){
  .btzone.z-crit, .btdot.cur.z-crit{animation:none !important;}
}`,
    },
    {
      order: 1419,
      css: String.raw`body.sk-editorial .sk-aurora .btshell,
body.sk-editorial .sk-daylight .btshell{
  border-color:var(--ed-rule-strong);
  border-radius:2px;
  background:var(--ed-paper);
}
body.sk-editorial .sk-aurora .btnub,
body.sk-editorial .sk-daylight .btnub{background:var(--ed-rule-strong);}`,
    },
    {
      order: 1635,
      css: String.raw`@media screen {

  body.sk-terminal .btshell,
  body.sk-terminal .sk-aurora .btshell{
    height:14px;
    background:var(--tm-raised);
    border:1px solid var(--tm-line);
    border-radius:0;
  }
}
@media screen {
  body.sk-terminal .btnub,
  body.sk-terminal .sk-aurora .btnub{background:var(--tm-line); border-radius:0;}
}
@media screen {
  body.sk-terminal .btctx,
  body.sk-terminal .sk-aurora .btctx{color:var(--tm-muted); text-transform:uppercase;}
}
@media screen {
  body.sk-terminal .sk-aurora .btsrc{color:var(--tm-good);}
}`,
    },
    {
      order: 1855,
      css: String.raw`@media screen {
  body.sk-pastel .btshell,
  body.sk-pastel .sk-aurora .btshell,
  body.sk-pastel .sk-daylight .btshell { background:#EDF1F6; border-color:#CCD5E2; border-radius:6px; }
}
@media screen {
  body.sk-pastel .btnub,
  body.sk-pastel .sk-aurora .btnub,
  body.sk-pastel .sk-daylight .btnub { background:#B7C1CF; }
}
@media screen {
  body.sk-pastel .sk-aurora .btsrc,
  body.sk-pastel .sk-daylight .btsrc { color:#5263B9; }
}`,
    },
    {
      order: 2089,
      css: String.raw`@media screen {
  body.sk-blueprint .docview .btshell{height:12px;border-radius:0;background:#031F43;border-color:#4D94AE;}
}
@media screen {
  body.sk-blueprint .docview .btnub{border-radius:0;background:#4D94AE;}
}
@media screen {
  body.sk-blueprint .docview .btsrc{color:#A7EDFA;}
}`,
    },
  ],
});

/* battery authoring contract; merged into this panel definition by the bundle. */
PanelRegistry.extend('battery', {
  authoring: {
    template: { title: 'Battery', low: 30, crit: 10, initial: { charge: 80 } },
    setupFields: [
      ['low', 'num'],
      ['crit', 'num'],
      ['initial', 'json'],
    ],
    patchFields: [
      ['charge', 'num'],
      ['trend', 'enum', ['charging', 'draining', 'idle']],
      ['source', 'enum', ['solar', 'wired', 'poe', 'cells']],
      ['cold', 'bool'],
      ['note', 'text'],
      ['label', 'text'],
    ],
    picker: {
      order: 20,
      name: 'Battery',
      category: 'Devices & interfaces',
      tagline: 'Charge and power context',
      description:
        'Track charge level, charging source, thresholds, and a history of battery levels.',
    },
    example: function (sample, context) {
      var panel = sample.panel,
        state = sample.state,
        states = sample.states,
        step = sample.step;
      state = { charge: 76, source: 'solar', trend: 'charging' };
      states = [48, 47, 49, 56, 64, 72, 76].map(function (charge) {
        return { charge: charge };
      });
      step = 6;

      panel.initial = builderClone(state);

      return { panel: panel, state: state, states: states, step: step };
    },
  },
});
/* ---- src/panels/types/budget.js ---- */
/* Budget metrics share collection rules and own their numeric constraints. */
function budgetPatchWarnings(state, path, panel, warnings) {
  softwarePanelPatchWarnings(state, path, panel, warnings, function (state, path, panel, warnings) {
    panelKeyedStateWarnings(state, path, panel, warnings, 'values', function (value, at, warnings) {
      if (value !== null && (!isFiniteNum(value) || value < 0))
        warnings.push(at + ': expected a finite non-negative number or null — rendered as NO DATA');
    });
  });
}
PanelRegistry.extend('budget', {
  itemCollection: { key: 'metrics', max: 6 },
  validateDeclaration: function (panel, path, warnings) {
    panelCollectionWarnings(panel, path, warnings, 'metrics', 6, function (item, at, warnings) {
      if (!isFiniteNum(item.max) || item.max <= 0)
        warnings.push(at + '.max: needs a finite positive upper limit — rendered as NO LIMIT');
      if (item.warn != null && (!isFiniteNum(item.warn) || item.warn < 0 || item.warn > item.max))
        warnings.push(at + '.warn: expected a number from 0 to max — warning threshold ignored');
    });
    budgetPatchWarnings(panel.initial, path + '.initial', panel, warnings);
  },
  validatePatch: budgetPatchWarnings,
});

/* budget panel: presentation model and renderer. Shared lifecycle lives in ../shared.js. */
function budgetModel(panel, state) {
  state = state || {};
  return softwarePanelItems(panel).map(function (metric) {
    var raw = panelOwn(state.values, metric.id) ? state.values[metric.id] : null;
    var value = isFiniteNum(raw) && raw >= 0 ? raw : null;
    var max = isFiniteNum(metric.max) && metric.max > 0 ? metric.max : null;
    var warn =
      max !== null && isFiniteNum(metric.warn) && metric.warn >= 0 && metric.warn <= max
        ? metric.warn
        : null;
    var status =
      value === null
        ? 'unknown'
        : max === null
        ? 'unbounded'
        : value > max
        ? 'over'
        : value === max
        ? 'limit'
        : warn !== null && value >= warn
        ? 'warn'
        : 'ok';
    return {
      id: metric.id,
      label: metric.label || metric.id,
      unit: metric.unit || '',
      value: value,
      max: max,
      warn: warn,
      status: status,
      pct: value !== null && max !== null ? Math.min(value / max, 1) * 100 : 0,
      remaining: value !== null && max !== null ? max - value : null,
    };
  });
}

PanelViews.register('budget', function (host, panel, state, skin, states, stepIdx, animate) {
  var h = '';
  var metrics = budgetModel(panel, state);
  var labels = {
    unknown: 'NO DATA',
    unbounded: 'NO LIMIT',
    over: 'OVER LIMIT',
    limit: 'AT LIMIT',
    warn: 'NEAR LIMIT',
    ok: 'WITHIN LIMIT',
  };
  metrics.forEach(function (metric) {
    var tone =
      metric.status === 'over'
        ? 'fail'
        : ['warn', 'limit'].indexOf(metric.status) >= 0
        ? 'warn'
        : metric.status === 'ok'
        ? 'pass'
        : 'pending';
    h +=
      '<div class="swmetric"><div class="swcheckhead"><span>' +
      esc(metric.label) +
      '</span>' +
      '<span class="swbadge sw-' +
      tone +
      '">' +
      labels[metric.status] +
      '</span></div>' +
      '<div class="swmeasure"><strong>' +
      (metric.value === null ? '—' : esc(String(metric.value))) +
      '</strong>' +
      ' / ' +
      (metric.max === null ? '—' : esc(String(metric.max))) +
      ' ' +
      esc(metric.unit) +
      '</div>';
    if (metric.value !== null && metric.max !== null) {
      h +=
        '<div class="swtrack" role="img" aria-label="' +
        esc(
          metric.label +
            ': ' +
            metric.value +
            ' of ' +
            metric.max +
            ' ' +
            metric.unit +
            ', ' +
            labels[metric.status]
        ) +
        '">' +
        '<div class="swfill sw-' +
        tone +
        '" style="width:' +
        metric.pct.toFixed(2) +
        '%"></div>';
      if (metric.warn !== null)
        h +=
          '<span class="swthreshold" style="left:' +
          ((metric.warn / metric.max) * 100).toFixed(2) +
          '%" title="Warning at ' +
          esc(String(metric.warn)) +
          '"></span>';
      h +=
        '</div><div class="swdetail">' +
        esc(String(Number(Math.abs(metric.remaining).toPrecision(6)))) +
        ' ' +
        esc(metric.unit) +
        (metric.remaining < 0 ? ' over budget' : ' remaining') +
        '</div>';
    }
    h += '</div>';
  });
  if (!metrics.length) h += '<div class="swempty">No budgets declared</div>';
  h = softwarePanelShell(h, state);
  return { html: h };
});

PanelRegistry.extend('budget', {
  order: 25,
  label: 'Budget',
  since: '0.1.0',
});

PanelRegistry.extend('budget', {
  styles: [
    {
      order: 291,
      css: String.raw`.swmeasure{font:11px/1.6 'IBM Plex Mono',monospace; margin:4px 0 6px;}
.swmeasure strong{font-size:19px; color:var(--dink);}
.swtrack{height:7px; border-radius:4px; position:relative; background:color-mix(in srgb,var(--dtext) 12%,transparent);}
.swfill{height:100%; border-radius:4px; background:currentColor;}
.swthreshold{position:absolute; top:-3px; height:13px; border-left:1px dashed var(--dink);}`,
    },
  ],
});

/* budget authoring contract; merged into this panel definition by the bundle. */
PanelRegistry.extend('budget', {
  authoring: {
    template: {
      title: 'Resource budgets',
      metrics: [{ id: 'latency', label: 'Latency', unit: 'ms', max: 300, warn: 240 }],
      initial: {
        values: { latency: null },
        note: 'Example limit — replace with the design’s target.',
      },
    },
    setupFields: [
      [
        'metrics',
        'rows',
        {
          cols: [
            { k: 'id', req: true },
            { k: 'label' },
            { k: 'unit' },
            { k: 'max', kind: 'num', req: true },
            { k: 'warn', kind: 'num' },
          ],
          max: 6,
        },
      ],
      ['initial', 'json'],
    ],
    patchFields: [
      ['values', 'json'],
      ['note', 'text'],
    ],
    picker: {
      order: 2,
      name: 'Resource budget',
      category: 'Software & data',
      tagline: 'Targets and thresholds',
      description:
        'Compare latency, capacity, or cost against an explicit limit and warning threshold.',
    },
    example: function (sample, context) {
      var panel = sample.panel,
        state = sample.state,
        states = sample.states,
        step = sample.step;
      state.values = { latency: 186 };
      panel.initial = builderClone(state);

      return { panel: panel, state: state, states: states, step: step };
    },
  },
});
/* ---- src/panels/types/buffer.js ---- */
/* buffer validation and pure state helpers. */
function bufferCellWarnings(obj, path, decl, warnings) {
  if (!obj || typeof obj !== 'object') return;
  var n =
    decl &&
    typeof decl.segments === 'number' &&
    isFinite(decl.segments) &&
    decl.segments >= 2 &&
    decl.segments <= 48
      ? Math.round(decl.segments)
      : 12;
  if (obj.cells != null) {
    if (!Array.isArray(obj.cells)) {
      warnings.push(path + '.cells: must be an array of state tokens — ignored');
    } else
      obj.cells.forEach(function (c, ci) {
        if (BUFFER_STATES.indexOf(c) < 0)
          warnings.push(
            path +
              '.cells[' +
              ci +
              ']: unknown state "' +
              c +
              '" — rendered empty (valid: ' +
              BUFFER_STATES.join(' ') +
              ')'
          );
      });
  }
  if (
    obj.head != null &&
    !(typeof obj.head === 'number' && isFinite(obj.head) && obj.head >= 0 && obj.head < n)
  )
    warnings.push(path + '.head: expected an index 0–' + (n - 1) + ' — marker hidden');
  if (obj.mark != null) {
    if (!Array.isArray(obj.mark)) {
      warnings.push(path + '.mark: must be an array of [i0, i1, "state"] paints — ignored');
    } else
      obj.mark.forEach(function (op, oi) {
        var okShape =
          Array.isArray(op) &&
          op.length >= 3 &&
          typeof op[0] === 'number' &&
          isFinite(op[0]) &&
          typeof op[1] === 'number' &&
          isFinite(op[1]);
        if (!okShape)
          warnings.push(path + '.mark[' + oi + ']: expected [i0, i1, "state"] — paint skipped');
        else if (BUFFER_STATES.indexOf(op[2]) < 0)
          warnings.push(
            path +
              '.mark[' +
              oi +
              ']: unknown state "' +
              op[2] +
              '" — paint skipped (valid: ' +
              BUFFER_STATES.join(' ') +
              ')'
          );
      });
  }
}

/* signal per-link status checks shared by initial and step patches: each
   key is a link id whose value is {state, bars, note} */

PanelRegistry.extend('buffer', {
  validateDeclaration: function (p, PP, warnings, errors, d) {
    if (p.segments != null) {
      if (!isFiniteNum(p.segments))
        warnings.push(PP + '.segments: expected a number 2–48 — using 12');
      else if (p.segments < 2 || p.segments > 48)
        warnings.push(PP + '.segments: out of range — clamped to 2–48');
    }
    bufferCellWarnings(p.initial, PP + '.initial', p, warnings);
  },
  validatePatch: function (patch, path, panel, warnings, context) {
    bufferCellWarnings(patch, path, panel, warnings);
  },
});

/* buffer panel: presentation model and renderer. Shared lifecycle lives in ../shared.js. */
var BUFFER_CELL_STATES = ['empty', 'buffered', 'protected', 'uploading', 'uploaded', 'dropped'];
function bufferModel(panel, state) {
  panel = panel || {};
  state = state || {};
  var n =
    typeof panel.segments === 'number' && isFinite(panel.segments)
      ? Math.round(clamp(panel.segments, 2, 48))
      : 12;
  /* mark: cumulative inclusive range paints [[i0,i1,"state"],...] applied
     over the cells base in order (shared bufferPaint helper — the fold
     compactor uses the same function, so a compacted story renders
     identically to an uncompacted one). */
  var cells = bufferPaint(n, state.cells, state.mark);
  var head =
    typeof state.head === 'number' && isFinite(state.head) && state.head >= 0 && state.head < n
      ? Math.round(state.head)
      : null;
  var counts = {};
  cells.forEach(function (c) {
    counts[c] = (counts[c] || 0) + 1;
  });
  var parts = [];
  BUFFER_CELL_STATES.forEach(function (sname) {
    if (sname !== 'empty' && counts[sname]) parts.push(counts[sname] + ' ' + sname);
  });
  return {
    n: n,
    cells: cells,
    head: head,
    counts: counts,
    capacity: panel.capacity != null ? String(panel.capacity) : '',
    note: state.note != null ? String(state.note) : state.label != null ? String(state.label) : '',
    summary: parts.length ? parts.join(' · ') : 'empty',
  };
}

/* inflight widget: operations/messages as bars on one shared step axis.
   foldInflightStates (validator.js) supplies complete history snapshots;
   this pure model vets that snapshot for the HTML renderer. */
/* timeline: wall-clock axis over a declared span with periodic cadence
   beats and event dots; steps sweep a `now` cursor and append events.
   Pure model (node-testable, no DOM). */

PanelViews.register('buffer', function (host, panel, state, skin, states, stepIdx, animate) {
  var h = '';
  var bfm = bufferModel(panel, state);
  /* head row: one marker slot per cell so the ▼ sits over the write head */
  h += '<div class="bfhead">';
  for (var bh = 0; bh < bfm.n; bh++)
    h +=
      '<span class="bfmark' +
      (bfm.head === bh ? ' on' : '') +
      '">' +
      (bfm.head === bh ? '&#9660;' : '') +
      '</span>';
  h += '</div>';
  h += '<div class="bfrow">';
  bfm.cells.forEach(function (c) {
    h += '<span class="bfcell s-' + c + '"></span>';
  });
  h += '</div>';
  h +=
    '<div class="bffoot"><span class="bfsum">' +
    esc(bfm.summary) +
    '</span>' +
    (bfm.capacity ? '<span class="bfcap">' + esc(bfm.capacity) + '</span>' : '') +
    '</div>';
  /* note line always emitted (fixed height — never reflows the column) */
  h += '<div class="bfnote">' + esc(bfm.note) + '</div>';
  return { html: h };
});

PanelRegistry.extend('buffer', {
  order: 14,
  label: 'Buffer',
  since: '0.1.0',
});

PanelRegistry.extend('buffer', {
  styles: [
    {
      order: 959,
      css: String.raw`.bfhead{display:flex; gap:3px; height:11px;}
.bfmark{flex:1; text-align:center; font-size:8px; line-height:11px; visibility:hidden;}
.bfmark.on{visibility:visible; animation:bfhead 1.1s ease-in-out infinite alternate;}
.sk-aurora .bfmark.on{color:#8AE8FF;}
.sk-daylight .bfmark.on{color:#4956C9;}
@keyframes bfhead{to{transform:translateY(2px); opacity:.55;}}
.bfrow{display:flex; gap:3px;}
.bfcell{flex:1; height:16px; border-radius:3px; border:1px solid transparent;}
.sk-aurora .bfcell.s-empty{background:#101A2C; border-color:#1D2A40;}
.sk-daylight .bfcell.s-empty{background:#F4F2EC; border-color:#E0DCD1;}
.bfcell.s-buffered{background:#38E1FF;}
.sk-daylight .bfcell.s-buffered{background:#4956C9;}
.bfcell.s-protected{background:#FFB454;}
.sk-daylight .bfcell.s-protected{background:#B0771A;}
.bfcell.s-uploading{background:#A78BFA; animation:ledpulse .7s ease-in-out infinite alternate;}
.sk-daylight .bfcell.s-uploading{background:#7C5CC4;}
.bfcell.s-uploaded{background:#4ADE80; opacity:.55;}
.sk-daylight .bfcell.s-uploaded{background:#0E9382; opacity:.55;}
.bfcell.s-dropped{background:#FF6B5E; opacity:.7;}
.sk-daylight .bfcell.s-dropped{background:#B91C1C; opacity:.7;}
.bffoot{display:flex; justify-content:space-between; gap:8px; margin-top:5px;
  font:600 9.5px 'IBM Plex Mono',monospace; letter-spacing:.05em;}
.sk-aurora .bffoot{color:#5E7396;}
.sk-daylight .bffoot{color:#8A8474;}
.sk-aurora .bfcap{color:#8AE8FF;}
.sk-daylight .bfcap{color:#4956C9;}
.bfnote{height:15px; overflow:hidden; margin-top:2px; white-space:nowrap; text-overflow:ellipsis;
  font:500 10px 'IBM Plex Mono',monospace;}
.sk-aurora .bfnote{color:#93A7C9;}
.sk-daylight .bfnote{color:#6B6F7A;}`,
    },
    {
      order: 1216,
      css: String.raw`@media (prefers-reduced-motion: reduce){
  .bfmark.on, .bfcell.s-uploading{animation:none !important;}
}`,
    },
    {
      order: 1421,
      css: String.raw`body.sk-editorial .sk-aurora .bfmark.on,
body.sk-editorial .sk-daylight .bfmark.on{color:var(--ed-accent);}
body.sk-editorial .sk-aurora .bfcell.s-empty,
body.sk-editorial .sk-daylight .bfcell.s-empty{border-color:var(--ed-rule); background:var(--ed-paper);}
body.sk-editorial .sk-aurora .bfcell.s-buffered,
body.sk-editorial .sk-daylight .bfcell.s-buffered{background:var(--ed-accent);}
body.sk-editorial .bfcell{border-radius:1px;}`,
    },
    {
      order: 1639,
      css: String.raw`@media screen {

  body.sk-terminal .sk-aurora .bfmark.on{color:var(--tm-good);}
}
@media screen {
  body.sk-terminal .bfcell{border-radius:0; border:1px solid var(--tm-line);}
}
@media screen {
  body.sk-terminal .sk-aurora .bfcell.s-empty{background:var(--tm-raised); border-color:var(--tm-line);}
}
@media screen {
  body.sk-terminal .bfcell.s-buffered,
  body.sk-terminal .bfcell.s-uploading,
  body.sk-terminal .bfcell.s-uploaded{background:var(--tm-good);}
}
@media screen {
  body.sk-terminal .bfcell.s-protected,
  body.sk-terminal .bfcell.s-dropped{background:var(--tm-alert);}
}
@media screen {
  body.sk-terminal .bffoot,
  body.sk-terminal .bfnote,
  body.sk-terminal .sk-aurora .bffoot,
  body.sk-terminal .sk-aurora .bfnote{color:var(--tm-muted);}
}
@media screen {
  body.sk-terminal .sk-aurora .bfcap{color:var(--tm-good);}
}`,
    },
    {
      order: 1858,
      css: String.raw`@media screen {

  body.sk-pastel .bfrow { gap:4px; }
}
@media screen {
  body.sk-pastel .bfcell { height:17px; border-radius:5px; }
}
@media screen {
  body.sk-pastel .sk-aurora .bfcell.s-empty,
  body.sk-pastel .sk-daylight .bfcell.s-empty { background:#F0F3F7; border-color:#DEE5EE; }
}
@media screen {
  body.sk-pastel .bfcell.s-buffered,
  body.sk-pastel .sk-daylight .bfcell.s-buffered { background:#76A6D4; }
}
@media screen {
  body.sk-pastel .bfcell.s-protected,
  body.sk-pastel .sk-daylight .bfcell.s-protected { background:#D4A15B; }
}
@media screen {
  body.sk-pastel .bfcell.s-uploading,
  body.sk-pastel .sk-daylight .bfcell.s-uploading { background:#9183D4; }
}
@media screen {
  body.sk-pastel .bfcell.s-uploaded,
  body.sk-pastel .sk-daylight .bfcell.s-uploaded { background:#65B087; opacity:.68; }
}
@media screen {
  body.sk-pastel .bfcell.s-dropped,
  body.sk-pastel .sk-daylight .bfcell.s-dropped { background:#D56874; opacity:.78; }
}
@media screen {
  body.sk-pastel .sk-aurora .bfmark.on,
  body.sk-pastel .sk-daylight .bfmark.on,
  body.sk-pastel .sk-aurora .bfcap,
  body.sk-pastel .sk-daylight .bfcap { color:#5263B9; }
}
@media screen {
  body.sk-pastel .bffoot,
  body.sk-pastel .bfnote,
  body.sk-pastel .sk-aurora .bffoot,
  body.sk-pastel .sk-daylight .bffoot,
  body.sk-pastel .sk-aurora .bfnote,
  body.sk-pastel .sk-daylight .bfnote { color:#6C788C; }
}`,
    },
    {
      order: 2092,
      css: String.raw`@media screen {

  body.sk-blueprint .bfhead{height:9px;}
}
@media screen {
  body.sk-blueprint .bfrow{gap:2px;}
}
@media screen {
  body.sk-blueprint .bfcell{height:14px;border-radius:0;}
}
@media screen {
  body.sk-blueprint .docview .bfcell.s-empty{background:#032149;border-color:#2E6D8E;}
}
@media screen {
  body.sk-blueprint .bfcell.s-buffered{background:#58E7FF;}
}
@media screen {
  body.sk-blueprint .bfcell.s-protected{background:#FFD166;}
}
@media screen {
  body.sk-blueprint .bfcell.s-uploading{background:#C3A4FF;}
}
@media screen {
  body.sk-blueprint .bfcell.s-uploaded{background:#47F590;opacity:.65;}
}
@media screen {
  body.sk-blueprint .bfcell.s-dropped{background:#FF5C67;opacity:.85;}
}
@media screen {
  body.sk-blueprint .docview .bffoot,body.sk-blueprint .docview .bfnote{color:#A9CCDD;}
}
@media screen {
  body.sk-blueprint .docview .bfcap{color:#FFFFFF;}
}`,
    },
  ],
});

/* buffer authoring contract; merged into this panel definition by the bundle. */
PanelRegistry.extend('buffer', {
  authoring: {
    template: { title: 'Buffer', initial: {} },
    setupFields: [
      ['segments', 'num'],
      ['capacity', 'text'],
      ['initial', 'json'],
    ],
    patchFields: [
      ['cells', 'jsonArr'],
      ['mark', 'jsonArr'],
      ['head', 'num'],
      ['note', 'text'],
      ['label', 'text'],
    ],
    picker: {
      order: 13,
      name: 'Buffer',
      category: 'State & timing',
      tagline: 'A window of stored data',
      description:
        'Show occupied, written, or locked segments and the write head of a finite buffer.',
    },
    origin: function (p, key, snapshot, context) {
      var assignment = context.assignment,
        history = context.history,
        input = context.input,
        own = context.own;
      if (own(context.currentPatch && context.currentPatch.enterOnce, key))
        return assignment(key, null, true);
      if (key === 'mark' || key === 'cells')
        return history(['cells', 'mark'], true, 'Computed cells/mark history');
    },
    example: function (sample, context) {
      var panel = sample.panel,
        state = sample.state,
        states = sample.states,
        step = sample.step;
      state = {
        cells: [
          'buffered',
          'buffered',
          'buffered',
          'protected',
          'protected',
          'protected',
          'empty',
          'empty',
          'empty',
          'empty',
          'empty',
          'empty',
        ],
        head: 6,
        note: '6 of 12 segments in use',
      };
      panel.initial = builderClone(state);

      return { panel: panel, state: state, states: states, step: step };
    },
  },
});
/* ---- src/panels/types/checks.js ---- */
/* Check results are authored status snapshots. */
var CHECK_STATUSES = ['pending', 'pass', 'fail', 'warn', 'skip'];
function checksPatchWarnings(state, path, panel, warnings) {
  softwarePanelPatchWarnings(state, path, panel, warnings, function (state, path, panel, warnings) {
    panelKeyedStateWarnings(
      state,
      path,
      panel,
      warnings,
      'results',
      function (value, at, warnings) {
        if (
          !panelObject(value) ||
          (value.status != null && CHECK_STATUSES.indexOf(value.status) < 0)
        )
          warnings.push(
            at + ': expected {status: pending|pass|fail|warn|skip, detail?} — using pending'
          );
      }
    );
  });
}
PanelRegistry.extend('checks', {
  itemCollection: { key: 'checks', max: 12 },
  validateDeclaration: function (panel, path, warnings) {
    panelCollectionWarnings(panel, path, warnings, 'checks', 12);
    checksPatchWarnings(panel.initial, path + '.initial', panel, warnings);
  },
  validatePatch: checksPatchWarnings,
});

/* checks panel: presentation model and renderer. Shared lifecycle lives in ../shared.js. */
function checksModel(panel, state) {
  state = state || {};
  return softwarePanelItems(panel).map(function (check) {
    var result =
      panelOwn(state.results, check.id) && panelObject(state.results[check.id])
        ? state.results[check.id]
        : {};
    return {
      id: check.id,
      label: check.label || check.id,
      status: CHECK_STATUSES.indexOf(result.status) >= 0 ? result.status : 'pending',
      detail: result.detail == null ? '' : String(result.detail),
    };
  });
}

PanelViews.register('checks', function (host, panel, state, skin, states, stepIdx, animate) {
  var h = '';
  var checks = checksModel(panel, state),
    passed = checks.filter(function (c) {
      return c.status === 'pass';
    }).length;
  h +=
    '<div class="swsummary">' +
    passed +
    ' / ' +
    checks.length +
    ' passed <span>Authored outcomes</span></div><ul class="swchecks">';
  checks.forEach(function (check) {
    h +=
      '<li><div class="swcheckhead"><span>' +
      esc(check.label) +
      '</span>' +
      '<span class="swbadge sw-' +
      check.status +
      '">' +
      check.status +
      '</span></div>' +
      (check.detail ? '<div class="swdetail">' + esc(check.detail) + '</div>' : '') +
      '</li>';
  });
  h += '</ul>';
  if (!checks.length) h += '<div class="swempty">No checks declared</div>';
  h = softwarePanelShell(h, state);
  return { html: h };
});

PanelRegistry.extend('checks', {
  order: 24,
  label: 'Checks',
  since: '0.1.0',
});

PanelRegistry.extend('checks', {
  styles: [
    {
      order: 282,
      css: String.raw`.swsummary,.swcheckhead{display:flex; align-items:baseline; justify-content:space-between; gap:8px;}
.swsummary{color:var(--dink); font-weight:600; margin-bottom:8px;}
.swsummary span{font-size:10px; color:var(--dfaint); font-weight:400;}
.swchecks{list-style:none; margin:0; padding:0; max-height:300px; overflow:auto;}`,
    },
    {
      order: 288,
      css: String.raw`.swcheckhead>span:first-child{color:var(--dink); font-weight:600;}`,
    },
  ],
});

/* checks authoring contract; merged into this panel definition by the bundle. */
PanelRegistry.extend('checks', {
  authoring: {
    template: {
      title: 'Decision checks',
      checks: [
        { id: 'auth', label: 'Authorized' },
        { id: 'unique', label: 'Idempotency key is new' },
      ],
      initial: { results: { auth: { status: 'pending' }, unique: { status: 'pending' } } },
    },
    setupFields: [
      ['checks', 'rows', { cols: [{ k: 'id', req: true }, { k: 'label' }], max: 12 }],
      ['initial', 'json'],
    ],
    patchFields: [
      ['results', 'json'],
      ['note', 'text'],
    ],
    picker: {
      order: 1,
      name: 'Decision checks',
      category: 'Software & data',
      tagline: 'Make a decision visible',
      description:
        'Explain authorization, validation, or release gates with a result for each check.',
    },
    example: function (sample, context) {
      var panel = sample.panel,
        state = sample.state,
        states = sample.states,
        step = sample.step;
      state.results = { auth: { status: 'pass' }, unique: { status: 'pass' } };
      panel.initial = builderClone(state);

      return { panel: panel, state: state, states: states, step: step };
    },
  },
});
/* ---- src/panels/types/deviceapp.js ---- */
/* deviceapp validation and pure state helpers. */
/* Device app values are authored UI data, with explicit per-field provenance.
   A source node is a diagram reference, never an instruction to fetch an API. */
var DEVICEAPP_STATUSES = ['unknown', 'loading', 'ready', 'stale', 'error'];
function deviceAppItems(panel, key) {
  var seen = Object.create(null),
    reserved = ['clock', 'note', 'constructor', 'prototype'];
  return (Array.isArray(panel && panel[key]) ? panel[key] : [])
    .filter(function (item) {
      if (
        !panelObject(item) ||
        typeof item.id !== 'string' ||
        !/^[A-Za-z][A-Za-z0-9_-]*$/.test(item.id) ||
        seen[item.id] ||
        reserved.indexOf(item.id) >= 0
      )
        return false;
      seen[item.id] = true;
      return true;
    })
    .slice(0, key === 'sources' ? 6 : 12);
}
function deviceAppPatchWarnings(obj, path, panel, warnings) {
  if (obj == null) return;
  if (!panelObject(obj)) {
    warnings.push(path + ': expected an object — ignored');
    return;
  }
  var fields = deviceAppItems(panel, 'fields'),
    sources = deviceAppItems(panel, 'sources');
  Object.keys(obj).forEach(function (key) {
    if (key === 'clock' || key === 'note') {
      if (typeof obj[key] !== 'string')
        warnings.push(path + '.' + key + ': expected text — ignored');
      return;
    }
    var f = fields.find(function (field) {
        return field.id === key;
      }),
      v = obj[key],
      p = path + '.' + key;
    if (!f) {
      warnings.push(p + ': unknown deviceapp field — ignored');
      return;
    }
    if (v === null) return;
    if (!panelObject(v)) {
      warnings.push(p + ': expected {value, status?, source?, detail?} or null — ignored');
      return;
    }
    Object.keys(v).forEach(function (k) {
      if (['value', 'status', 'source', 'detail'].indexOf(k) < 0)
        warnings.push(p + '.' + k + ': unknown field property — ignored');
    });
    if (
      panelOwn(v, 'value') &&
      v.value !== null &&
      !(typeof v.value === 'string' || isFiniteNum(v.value) || typeof v.value === 'boolean')
    )
      warnings.push(p + '.value: expected text, finite number, boolean or null — ignored');
    if (
      f.kind === 'battery' &&
      v.value != null &&
      (!isFiniteNum(v.value) || v.value < 0 || v.value > 100)
    )
      warnings.push(p + '.value: battery expects 0–100 — invalid values display as unknown');
    if (panelOwn(v, 'status') && DEVICEAPP_STATUSES.indexOf(v.status) < 0)
      warnings.push(p + '.status: expected ' + DEVICEAPP_STATUSES.join(', ') + ' — ignored');
    if (
      panelOwn(v, 'source') &&
      v.source !== null &&
      !sources.some(function (s) {
        return s.id === v.source;
      })
    )
      warnings.push(p + '.source: unknown source ID — ignored');
    if (panelOwn(v, 'detail') && v.detail !== null && typeof v.detail !== 'string')
      warnings.push(p + '.detail: expected text or null — ignored');
  });
}
function deviceAppWarnings(panel, d, path, warnings) {
  ['device', 'subtitle'].forEach(function (k) {
    if (panel[k] != null && typeof panel[k] !== 'string')
      warnings.push(path + '.' + k + ': expected text — ignored');
  });
  ['sources', 'fields'].forEach(function (key) {
    var items = deviceAppItems(panel, key),
      raw = panel[key];
    if (!Array.isArray(raw) || !raw.length)
      warnings.push(
        path +
          '.' +
          key +
          ': declare ' +
          (key === 'sources' ? '1–6 data sources' : '1–12 phone fields')
      );
    else if (items.length !== raw.length)
      warnings.push(
        path +
          '.' +
          key +
          ': use unique letter-led IDs and at most ' +
          (key === 'sources' ? 6 : 12) +
          ' entries; clock/note/constructor/prototype are reserved — invalid entries ignored'
      );
    items.forEach(function (item, i) {
      var p = path + '.' + key + '[' + i + ']';
      ['label', 'detail', 'endpoint', 'unit'].forEach(function (k) {
        if (item[k] != null && typeof item[k] !== 'string')
          warnings.push(p + '.' + k + ': expected text — ignored');
      });
      if (key === 'sources') {
        if (
          item.color != null &&
          (typeof item.color !== 'string' || !/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(item.color))
        )
          warnings.push(p + '.color: use #RGB or #RRGGBB — using palette color');
        if (item.node != null && (typeof item.node !== 'string' || !panelOwn(d.nodes, item.node)))
          warnings.push(p + '.node: unknown diagram node — no node highlight');
      } else {
        if (item.kind != null && ['text', 'battery'].indexOf(item.kind) < 0)
          warnings.push(p + '.kind: expected text or battery — using text');
        if (item.icon != null && ICON_SET.indexOf(item.icon) < 0)
          warnings.push(p + '.icon: unknown icon — ignored');
        if (
          item.source != null &&
          !deviceAppItems(panel, 'sources').some(function (s) {
            return s.id === item.source;
          })
        )
          warnings.push(p + '.source: unknown source ID — shown as unmapped');
      }
    });
  });
  deviceAppPatchWarnings(panel.initial, path + '.initial', panel, warnings);
}
function foldDeviceAppStates(panel, steps) {
  var fields = deviceAppItems(panel, 'fields'),
    sources = deviceAppItems(panel, 'sources'),
    carried = Object.create(null),
    states = [];
  function apply(patch) {
    var updated = [];
    if (!panelObject(patch)) return updated;
    ['clock', 'note'].forEach(function (k) {
      if (typeof patch[k] === 'string') carried[k] = patch[k];
    });
    fields.forEach(function (f) {
      if (!panelOwn(patch, f.id)) return;
      var v = patch[f.id],
        next = Object.assign({}, carried[f.id] || {});
      if (v === null) next = { value: null, status: 'unknown', detail: '', source: null };
      else if (panelObject(v)) {
        if (
          panelOwn(v, 'value') &&
          (v.value === null ||
            typeof v.value === 'string' ||
            isFiniteNum(v.value) ||
            typeof v.value === 'boolean')
        )
          next.value = v.value;
        if (DEVICEAPP_STATUSES.indexOf(v.status) >= 0) next.status = v.status;
        if (
          panelOwn(v, 'source') &&
          (v.source === null ||
            sources.some(function (s) {
              return s.id === v.source;
            }))
        )
          next.source = v.source;
        if (v.detail === null || typeof v.detail === 'string') next.detail = v.detail || '';
      } else return;
      if (JSON.stringify(next) !== JSON.stringify(carried[f.id] || {})) updated.push(f.id);
      carried[f.id] = next;
    });
    return updated;
  }
  function snapshot(updated) {
    var out = Object.create(null);
    Object.keys(carried).forEach(function (k) {
      out[k] = panelObject(carried[k]) ? Object.assign({}, carried[k]) : carried[k];
    });
    out._updated = updated;
    return out;
  }
  apply(panel.initial);
  (steps || []).forEach(function (st) {
    states.push(snapshot(apply((stepPanelPatch(st) || {})[panel.id])));
  });
  if (!states.length) states.push(snapshot([]));
  return states;
}

PanelRegistry.extend('deviceapp', {
  validateDeclaration: function (p, PP, warnings, errors, d) {
    deviceAppWarnings(p, d, PP, warnings);
  },
  validatePatch: function (patch, path, panel, warnings, context) {
    deviceAppPatchWarnings(patch, path, panel, warnings);
  },
  fold: foldDeviceAppStates,
});

/* deviceapp panel: presentation model and renderer. Shared lifecycle lives in ../shared.js. */
function deviceAppModel(panel, state) {
  panel = panel || {};
  state = state || {};
  var str = function (v, fallback) {
    return typeof v === 'string' ? v : fallback || '';
  };
  var palette = ['#5865d8', '#168878', '#bd6716', '#a354b5', '#287fbe', '#b95164'];
  var sources = deviceAppItems(panel, 'sources').map(function (s, i) {
    return {
      id: s.id,
      label: str(s.label, s.id),
      letter: String.fromCharCode(65 + i),
      color:
        typeof s.color === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(s.color)
          ? s.color
          : palette[i],
      node: str(s.node),
      endpoint: str(s.endpoint),
      detail: str(s.detail),
    };
  });
  var fields = deviceAppItems(panel, 'fields').map(function (f) {
    var v = panelObject(state[f.id]) ? state[f.id] : {},
      battery = f.kind === 'battery';
    var source = sources.find(function (s) {
      return s.id === (v.source == null ? f.source : v.source);
    });
    var valid =
      v.value != null &&
      (typeof v.value === 'string' || isFiniteNum(v.value) || typeof v.value === 'boolean');
    if (battery) valid = isFiniteNum(v.value) && v.value >= 0 && v.value <= 100;
    return {
      id: f.id,
      label: str(f.label, f.id),
      source: source || null,
      battery: battery,
      icon: ICON_SET.indexOf(f.icon) >= 0 ? f.icon : null,
      value: valid ? String(v.value) + (battery ? '%' : str(f.unit)) : '—',
      pct: battery && valid ? v.value : 0,
      status: DEVICEAPP_STATUSES.indexOf(v.status) >= 0 ? v.status : 'unknown',
      detail: str(v.detail),
      updated: Array.isArray(state._updated) && state._updated.indexOf(f.id) >= 0,
    };
  });
  return {
    device: str(panel.device, 'Camera'),
    subtitle: str(panel.subtitle, 'Device health'),
    clock: str(state.clock, '9:41'),
    note: str(state.note),
    sources: sources,
    fields: fields,
  };
}
function deviceAppPanelHTML(panel, state, fresh) {
  var m = deviceAppModel(panel, state),
    labels = {
      unknown: 'No data',
      loading: 'Loading',
      ready: 'Current',
      stale: 'Cached',
      error: 'Unavailable',
    };
  function badge(s) {
    return '<span class="da-badge" aria-hidden="true">' + (s ? s.letter : '?') + '</span>';
  }
  function props(s) {
    return (
      ' data-da-source="' +
      esc(s ? s.id : '') +
      '" style="--da-color:' +
      (s ? s.color : '#78808d') +
      '"'
    );
  }
  var h =
    '<div class="deviceapp"><div class="da-phone"><div class="da-statusbar"><span>' +
    esc(m.clock) +
    '</span><span aria-hidden="true">▂▄▆ · ▰</span></div>' +
    '<div class="da-heading"><span class="da-eyebrow">CAMERA DETAILS</span><h3>' +
    esc(m.device) +
    '</h3><span>' +
    esc(m.subtitle) +
    '</span></div><div class="da-fields">';
  m.fields.forEach(function (f) {
    h +=
      '<button type="button" class="da-field da-' +
      f.status +
      (f.updated ? ' da-updated' : '') +
      (fresh && f.updated ? ' fresh' : '') +
      '" data-da-field="' +
      esc(f.id) +
      '"' +
      props(f.source) +
      ' aria-pressed="false" aria-label="' +
      esc(
        f.label +
          ': ' +
          f.value +
          '. ' +
          labels[f.status] +
          '. Source: ' +
          (f.source ? f.source.label : 'Unmapped')
      ) +
      '">' +
      '<span class="da-field-top"><span>' +
      esc(f.label) +
      '</span>' +
      badge(f.source) +
      '</span>' +
      '<span class="da-value">' +
      (f.icon
        ? '<svg class="da-icon" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-' +
          f.icon +
          '"/></svg>'
        : '') +
      esc(f.value) +
      '</span>' +
      (f.battery
        ? '<span class="da-meter" aria-hidden="true"><i style="width:' + f.pct + '%"></i></span>'
        : '') +
      '<span class="da-meta"><span class="da-state">' +
      labels[f.status] +
      '</span>' +
      (f.updated ? '<span class="da-update-label">Updated</span>' : '') +
      '</span>' +
      (f.detail ? '<span class="da-detail">' + esc(f.detail) + '</span>' : '') +
      '</button>';
  });
  h +=
    '</div><div class="da-home" aria-hidden="true"></div></div><div class="da-provenance"><div class="da-eyebrow">WHERE THE DATA COMES FROM</div>' +
    '<h3>One screen. Multiple sources.</h3><p class="da-help">Select a field or source to trace its data' +
    (m.sources.some(function (s) {
      return s.node;
    })
      ? ' and highlight its service in the diagram'
      : '') +
    '.</p><div class="da-sources">';
  m.sources.forEach(function (s) {
    var fields = m.fields.filter(function (f) {
      return f.source && f.source.id === s.id;
    });
    h +=
      '<button type="button" class="da-source"' +
      props(s) +
      ' aria-pressed="false"><span class="da-source-title">' +
      badge(s) +
      '<strong>' +
      esc(s.label) +
      '</strong></span>' +
      (s.endpoint ? '<code>' + esc(s.endpoint) + '</code>' : '') +
      (s.detail ? '<span class="da-detail">' + esc(s.detail) + '</span>' : '') +
      '<span class="da-source-fields">' +
      esc(
        fields.length
          ? fields
              .map(function (f) {
                return f.label + ' · ' + labels[f.status];
              })
              .join(' / ')
          : 'No fields in this step'
      ) +
      '</span></button>';
  });
  return (
    h + '</div>' + (m.note ? '<p class="da-note">' + esc(m.note) + '</p>' : '') + '</div></div>'
  );
}
function bindDeviceAppSources(host, panel, state) {
  if (typeof host.querySelectorAll !== 'function') return;
  if (host._daClear) host._daClear();
  var nodes = [],
    m = deviceAppModel(panel, state);
  var buttons = Array.from(host.querySelectorAll('[data-da-source]'));
  function clearNodes() {
    nodes.forEach(function (n) {
      if (n._daOwners) {
        n._daOwners.delete(host);
        if (!n._daOwners.size) n.classList.remove('da-node-focus');
      }
    });
    nodes = [];
  }
  host._daClear = clearNodes;
  function select(id) {
    clearNodes();
    host._daSource = id;
    buttons.forEach(function (b) {
      var on = !!id && b.getAttribute('data-da-source') === id;
      b.setAttribute('aria-pressed', String(on));
    });
    var source = m.sources.find(function (s) {
      return s.id === id;
    });
    var section = host.closest && host.closest('.doc-sec');
    if (section && source && source.node)
      Array.from(section.querySelectorAll('[data-dv-node]')).forEach(function (n) {
        if (n.getAttribute('data-dv-node') !== source.node) return;
        if (!n._daOwners) n._daOwners = new Set();
        n._daOwners.add(host);
        n.classList.add('da-node-focus');
        nodes.push(n);
      });
  }
  buttons.forEach(function (b) {
    b.addEventListener('click', function () {
      var id = b.getAttribute('data-da-source');
      select(host._daSource === id ? null : id);
    });
  });
  select(host._daSource);
}

/* queue widget: mailbox — a message enqueued, held, dequeued. Pure model +
   markup builder so node tests cover them without a DOM. Directional context:
   `from` shows during enqueue (arrival side), `to` during dequeue (departure
   side), `reason` while held (the waiting-on line). Carried like any patch
   field; only the state-relevant one renders. Non-strings are ignored (the
   validator warns). */

PanelViews.register('deviceapp', function (host, panel, state, skin, states, stepIdx, animate) {
  var h = '';
  var hBaseline = null;
  var daFresh =
    animate &&
    validRevealIndex(host._daStep) &&
    validRevealIndex(stepIdx) &&
    stepIdx === host._daStep + 1;
  host._daStep = validRevealIndex(stepIdx) ? stepIdx : null;
  h += deviceAppPanelHTML(panel, state, daFresh);
  hBaseline = daFresh ? deviceAppPanelHTML(panel, state, false) : null;
  return {
    html: h,
    baseline: hBaseline,
    mounted: function () {
      bindDeviceAppSources(host, panel, state);
    },
  };
});

PanelRegistry.extend('deviceapp', {
  order: 21,
  label: 'Camera app',
  since: '0.1.0',
  layout: {
    large: true,
    height: 23,
    supporting: false,
  },
});

PanelRegistry.extend('deviceapp', {
  styles: [
    { order: 375, css: String.raw`.pt-deviceapp{container-type:inline-size;}` },
    {
      order: 377,
      css: String.raw`.da-phone{position:relative;box-sizing:border-box;border:3px solid #9ba7bd;border-radius:34px;padding:14px 15px 30px;background:#f5f7fc;color:#24324b;box-shadow:0 14px 30px #23324b12;}
.da-phone::before{content:"";position:absolute;top:13px;left:43%;width:14%;height:5px;border-radius:5px;background:#8a96ac;}
.da-statusbar{display:flex;justify-content:space-between;font:600 10px 'IBM Plex Mono',monospace;padding:0 5px 18px;}
.da-heading{padding:5px 4px 16px;}
.da-eyebrow{font:600 10px/1.5 'IBM Plex Mono',monospace;letter-spacing:.12em;opacity:.7;}
.da-heading h3,.da-provenance h3{font:600 21px/1.2 'Sora',sans-serif;margin:7px 0 5px;letter-spacing:-.5px;}
.da-heading>span:last-child{font-size:12px;color:#65728a;}
.da-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;}`,
    },
    {
      order: 386,
      css: String.raw`.da-field{display:flex;flex-direction:column;gap:7px;border:1px solid #dfe4ef;border-top:3px solid var(--da-color);border-radius:12px;padding:10px;background:#fff;color:#24324b;transition:box-shadow .16s;}
.da-field:first-child{grid-column:1/-1;}
.da-field:last-child:nth-child(even){grid-column:1/-1;}
.da-field-top{display:flex;align-items:center;justify-content:space-between;gap:5px;font-size:11px;color:#59677f;}
.da-badge{display:inline-flex;flex:none;align-items:center;justify-content:center;width:20px;height:20px;border-radius:6px;border:1px solid var(--da-color);color:var(--da-color);font:700 11px 'IBM Plex Mono',monospace;}
.da-value{display:flex;align-items:center;gap:6px;font-size:16px;font-weight:600;line-height:1.2;}
.da-field:first-child .da-value{font-size:29px;}
.da-icon{width:19px;height:19px;flex:none;stroke:currentColor;fill:none;stroke-width:1.7;}
.da-meter{display:block;height:7px;border-radius:5px;background:#e7ecf4;overflow:hidden;}
.da-meter i{display:block;height:100%;background:var(--da-color);border-radius:5px;}
.da-meta{display:flex;flex-wrap:wrap;align-items:center;gap:6px;font-size:9px;}
.da-state{border-radius:4px;padding:2px 5px;background:#edf0f6;color:#53617a;}
.da-ready .da-state{background:#e0f3ec;color:#17694c;}
.da-stale .da-state{background:#fff0d6;color:#915209;}
.da-error .da-state{background:#fde4e7;color:#a62f46;}
.da-loading .da-state{background:#e4edff;color:#325dab;}
.da-update-label{color:#626f87;}
.da-detail{display:block;font-size:11px;line-height:1.4;opacity:.78;}
.da-updated{box-shadow:0 0 0 1px color-mix(in srgb,var(--da-color) 35%,transparent);}
.da-field[aria-pressed="true"],.da-source[aria-pressed="true"]{outline:2px solid var(--da-color);outline-offset:2px;}`,
    },
    {
      order: 407,
      css: String.raw`.da-field.fresh{animation:da-arrive .6s ease-out;}
@keyframes da-arrive{from{transform:translateY(4px);background:#e8f1ff;}to{transform:none;background:#fff;}}
.da-home{position:absolute;bottom:10px;left:37%;width:26%;height:4px;border-radius:4px;background:#8694ab;}
.da-provenance{align-self:center;min-width:0;}
.da-help{color:var(--dtext);font-size:12px;margin:10px 0 20px;}
.da-sources{display:grid;gap:12px;}
.da-source{display:block;width:100%;border:1px solid color-mix(in srgb,var(--dtext) 22%,transparent);border-left:4px solid var(--da-color);border-radius:12px;padding:13px 15px;color:var(--dink);background:color-mix(in srgb,var(--da-color) 4%,transparent);}
.da-source-title{display:flex;gap:9px;align-items:center;}
.da-source code{display:block;font:10px/1.5 'IBM Plex Mono',monospace;margin:8px 0;}
.da-source .da-detail{margin-top:6px;}
.da-source-fields{display:block;border-top:1px solid color-mix(in srgb,var(--dtext) 16%,transparent);margin-top:9px;padding-top:9px;font-size:11px;color:var(--dtext);}
.da-note{font-size:12px;border-left:3px solid var(--acc);padding:9px 13px;background:color-mix(in srgb,var(--acc) 6%,transparent);margin:18px 0 0;}
.node.da-node-focus .card{stroke:var(--acc)!important;stroke-width:4px!important;stroke-dasharray:5 3!important;}`,
    },
    {
      order: 421,
      css: String.raw`@container (max-width:560px){.da-phone{width:100%;max-width:330px;margin:auto;}}
@container (max-width:560px){.da-provenance h3{font-size:17px;}}
@media(prefers-reduced-motion:reduce){.da-field.fresh{animation:none;}}
@media(prefers-reduced-motion:reduce){.da-field{transition:none;}}
@media print{.da-field.fresh{animation:none;}}
@media print{.da-provenance{color:#222;--dink:#222;--dtext:#444;}}
@media print{.da-phone{box-shadow:none;}}`,
    },
    {
      order: 1257,
      css: String.raw`@media print{
  .panelcol .pwidget.pt-deviceapp{display:block !important;background:#fff;border-color:#bbb;}
}`,
    },
  ],
});

/* deviceapp authoring contract; merged into this panel definition by the bundle. */
PanelRegistry.extend('deviceapp', {
  references: { nodes: ['sources.*.node'] },
  authoring: {
    template: {
      title: 'Camera app · data sources',
      device: 'Front door camera',
      subtitle: 'Device health',
      sources: [
        { id: 'telemetry', label: 'Device telemetry', detail: 'Battery and charging reports' },
        { id: 'registry', label: 'Device registry', detail: 'Camera configuration' },
      ],
      fields: [
        { id: 'battery', label: 'Battery', kind: 'battery', source: 'telemetry' },
        { id: 'power', label: 'Charging source', source: 'telemetry' },
        { id: 'model', label: 'Camera model', icon: 'camera', source: 'registry' },
        { id: 'firmware', label: 'Firmware', icon: 'chip', source: 'registry' },
      ],
      initial: {
        battery: { value: 68, status: 'ready' },
        power: { value: 'Solar panel', status: 'ready' },
        model: { value: 'Doorbell camera', status: 'ready' },
        firmware: { value: 'v2.4.1', status: 'ready' },
        note: 'Illustrative values. Select a field to see its source.',
      },
    },
    setupFields: [
      ['device', 'text'],
      ['subtitle', 'text'],
      [
        'sources',
        'rows',
        {
          cols: [
            { k: 'id', req: true },
            { k: 'label' },
            { k: 'color' },
            { k: 'node' },
            { k: 'endpoint' },
            { k: 'detail' },
          ],
          max: 6,
        },
      ],
      [
        'fields',
        'rows',
        {
          cols: [
            { k: 'id', req: true },
            { k: 'label' },
            { k: 'kind', kind: 'enum', options: ['text', 'battery'] },
            { k: 'source' },
            { k: 'icon', kind: 'icon' },
            { k: 'unit' },
          ],
          max: 12,
        },
      ],
      ['initial', 'json'],
    ],
    patchFields: [
      ['clock', 'text'],
      ['note', 'text'],
    ],
    picker: {
      order: 25,
      name: 'Device app',
      category: 'Devices & interfaces',
      tagline: 'Values with their sources',
      description: 'Present device health fields and the backend source that supplied each value.',
    },
    expandPatchFields: function (decl) {
      var sourceIds = (Array.isArray(decl.sources) ? decl.sources : [])
        .filter(function (s) {
          return s && typeof s.id === 'string';
        })
        .map(function (s) {
          return s.id;
        });
      var appFields = (Array.isArray(decl.fields) ? decl.fields : [])
        .filter(function (f) {
          return f && typeof f.id === 'string';
        })
        .map(function (f) {
          return [
            f.id,
            'objf',
            [
              ['value', f.kind === 'battery' ? 'num' : 'text'],
              ['status', 'enum', ['unknown', 'loading', 'ready', 'stale', 'error']],
              ['source', 'enum', sourceIds],
              ['detail', 'text'],
            ],
          ];
        });
      return appFields.concat(PANEL_PATCH_FIELDS.deviceapp);
    },
    origin: function (p, key, snapshot, context) {
      var assignment = context.assignment,
        history = context.history,
        input = context.input,
        own = context.own;
      if (key === '_updated')
        return { kind: 'engine', label: 'Engine · fields changed at this step', inputs: [] };
      if (key === 'clock' || key === 'note')
        return assignment(
          key,
          function (v) {
            return typeof v === 'string';
          },
          false
        );
      return history([key], true, 'Field value and source history');
    },
  },
});
/* ---- src/panels/types/gauge.js ---- */
/* gauge panel: presentation model and renderer. Shared lifecycle lives in ../shared.js. */
PanelViews.register('gauge', function (host, panel, state, skin, states, stepIdx, animate) {
  var h = '';
  var v = typeof state.value === 'number' ? state.value : 0;
  var max = typeof panel.max === 'number' && panel.max > 0 ? panel.max : 100;
  var pct = clamp((v / max) * 100, 0, 100);
  h +=
    '<div class="gaugeval">' +
    esc(String(v)) +
    (panel.unit ? ' <span class="gaugeunit">' + esc(panel.unit) + '</span>' : '') +
    '</div>';
  h +=
    '<div class="gaugebar"><div class="gaugefill" style="width:' +
    pct.toFixed(1) +
    '%"></div></div>';
  return {
    html: h,
    level: {
      pct: pct,
      value: v,
      fill: '.gaugefill',
      readout: '.gaugeval',
      decimals: panelDecimalPlaces(v),
    },
  };
});

PanelRegistry.extend('gauge', {
  order: 2,
  label: 'Gauge',
  since: '0.1.0',
});

PanelRegistry.extend('gauge', {
  styles: [
    {
      order: 326,
      css: String.raw`.gaugeval{font:700 16px 'IBM Plex Mono',monospace; margin-bottom:6px;}
.sk-aurora .gaugeval{color:#EAF2FF;}
.sk-daylight .gaugeval{color:#23272E;}
.gaugeunit{font-size:11px; font-weight:500; opacity:.6;}
.gaugebar{height:8px; border-radius:4px; overflow:hidden;}
.sk-aurora .gaugebar{background:#101A2C;}
.sk-daylight .gaugebar{background:#F4F2EC;}
.gaugefill{height:100%; border-radius:4px; background:linear-gradient(90deg,#4ADE80,#FFB454,#F87171); transition:width .5s ease;}`,
    },
    {
      order: 1362,
      css: String.raw`body.sk-editorial .gaugefill{border-radius:1px; box-shadow:none;}`,
    },
    {
      order: 1578,
      css: String.raw`@media screen {
  body.sk-terminal .gaugefill{border-radius:0; background:linear-gradient(90deg,var(--tm-good) 0 72%,var(--tm-alert) 72% 100%);}
}`,
    },
    {
      order: 1785,
      css: String.raw`@media screen {
  body.sk-pastel .gaugebar { height:9px; border-radius:999px; }
}
@media screen {
  body.sk-pastel .gaugefill { border-radius:999px; background:linear-gradient(90deg,#6FBA91,#D4A55F,#D76F79); }
}`,
    },
    {
      order: 2021,
      css: String.raw`@media screen {

  body.sk-blueprint .gaugeval{font-size:17px;margin-bottom:4px;}
}`,
    },
    {
      order: 2023,
      css: String.raw`@media screen {
  body.sk-blueprint .gaugefill{
    border-radius:0;
    background:linear-gradient(90deg,#47F590 0 48%,#FFD166 72%,#FF5C67 100%);
  }
}`,
    },
  ],
});

/* gauge authoring contract; merged into this panel definition by the bundle. */
PanelRegistry.extend('gauge', {
  authoring: {
    template: { title: 'Draw', unit: 'mA', max: 400, initial: { value: 12 } },
    setupFields: [
      ['unit', 'text'],
      ['max', 'num'],
      ['initial', 'json'],
    ],
    patchFields: [['value', 'num']],
    picker: {
      order: 12,
      name: 'Value gauge',
      category: 'State & timing',
      tagline: 'One number and its range',
      description: 'Track a changing measurement against a maximum, with a clear numeric readout.',
    },
    example: function (sample, context) {
      var panel = sample.panel,
        state = sample.state,
        states = sample.states,
        step = sample.step;
      state.value = 248;
      panel.initial = builderClone(state);

      return { panel: panel, state: state, states: states, step: step };
    },
  },
});
/* ---- src/panels/types/homemap.js ---- */
/* homemap validation and pure state helpers. */
var HOMEMAP_STATES = {
  camera: ['scan', 'sleep', 'detect', 'rec', 'off'],
  entry: ['closed', 'open', 'alert'],
  sensor: ['ok', 'warn', 'alert', 'off'],
  hub: ['idle', 'rx', 'tx', 'alert'],
};
var HOMEMAP_THERMAL = ['normal', 'warm', 'hot', 'cold', 'freezing'];
function homemapDevicePatchValid(kind, value) {
  if (typeof value === 'string') return HOMEMAP_STATES[kind].indexOf(value) >= 0;
  return (
    panelObject(value) &&
    Object.keys(value).every(function (k) {
      return k === 'state'
        ? HOMEMAP_STATES[kind].indexOf(value[k]) >= 0
        : k === 'thermal' && HOMEMAP_THERMAL.indexOf(value[k]) >= 0;
    })
  );
}
function homemapDeviceValid(d) {
  return (
    d &&
    typeof d.id === 'string' &&
    d.id !== '' &&
    d.id !== 'signals' &&
    typeof d.kind === 'string' &&
    Object.prototype.hasOwnProperty.call(HOMEMAP_STATES, d.kind) &&
    isFiniteNum(d.x) &&
    isFiniteNum(d.y)
  );
}
function homemapSubjectPosition(v) {
  return v && typeof v === 'object' && !Array.isArray(v) && isFiniteNum(v.x) && isFiniteNum(v.y);
}
/* Shared declaration filtering keeps model, fold and warnings in agreement. */
function homemapSubjects(panel, path, warnings) {
  var devices = Object.create(null),
    seen = Object.create(null),
    subjects = [];
  function warn(message) {
    if (warnings) warnings.push(path + message);
  }
  (Array.isArray(panel.devices) ? panel.devices : []).forEach(function (d) {
    if (d && typeof d.id === 'string') devices[d.id] = true;
  });
  if (panel.subjects !== undefined && !Array.isArray(panel.subjects))
    warn('.subjects: expected an array — ignored');
  (Array.isArray(panel.subjects) ? panel.subjects : []).forEach(function (sub, i) {
    var sp = '.subjects[' + i + ']',
      valid = true;
    if (!sub || typeof sub.id !== 'string' || !sub.id) {
      warn(sp + '.id: needs a nonempty string — subject ignored');
      return;
    }
    if (seen[sub.id]) {
      warn(sp + '.id: duplicate subject id "' + sub.id + '" — duplicate ignored');
      valid = false;
    }
    seen[sub.id] = true;
    if (devices[sub.id]) {
      warn(sp + '.id: collides with a device id — subject ignored');
      valid = false;
    }
    if (sub.id === 'signals') {
      warn(sp + '.id: "signals" is reserved — subject ignored');
      valid = false;
    }
    ['x', 'y'].forEach(function (k) {
      if (!isFiniteNum(sub[k])) {
        warn(sp + '.' + k + ': must be finite — subject ignored');
        valid = false;
      }
    });
    if (sub.icon !== undefined && ICON_SET.indexOf(sub.icon) < 0)
      warn(sp + '.icon: unknown icon "' + sub.icon + '" — using "gear"');
    if (valid) subjects.push(sub);
  });
  return subjects;
}
function homemapPatchWarnings(obj, path, declaration, warnings) {
  var devices = declaration.devices,
    subjects = declaration.subjects;
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
  Object.keys(obj).forEach(function (k) {
    if (k === 'signals') {
      if (!Array.isArray(obj.signals)) {
        warnings.push(path + '.signals: expected an array of {from, to} — ignored');
        return;
      }
      obj.signals.forEach(function (sig, i) {
        if (
          !sig ||
          typeof sig !== 'object' ||
          Array.isArray(sig) ||
          typeof sig.from !== 'string' ||
          typeof sig.to !== 'string' ||
          !devices[sig.from] ||
          !devices[sig.to]
        )
          warnings.push(
            path +
              '.signals[' +
              i +
              ']: needs from/to referencing declared device ids — entry ignored'
          );
      });
    } else if (subjects[k]) {
      if (obj[k] !== null && !homemapSubjectPosition(obj[k]))
        warnings.push(
          path + '.' + k + ': expected an object with finite x/y or null — subject patch ignored'
        );
    } else if (!devices[k]) {
      warnings.push(path + '.' + k + ': undeclared device or subject id — patch ignored');
    } else {
      var vocab = HOMEMAP_STATES[devices[k].kind];
      if (panelObject(obj[k])) {
        Object.keys(obj[k]).forEach(function (field) {
          var allowed = field === 'state' ? vocab : field === 'thermal' ? HOMEMAP_THERMAL : null;
          if (!allowed || allowed.indexOf(obj[k][field]) < 0)
            warnings.push(
              path +
                '.' +
                k +
                '.' +
                field +
                ': invalid device attribute — ignored' +
                (allowed ? ' (valid: ' + allowed.join(' ') + ')' : ' (use state or thermal)')
            );
        });
      } else if (vocab.indexOf(obj[k]) < 0)
        warnings.push(
          path +
            '.' +
            k +
            ': unknown ' +
            devices[k].kind +
            ' state "' +
            obj[k] +
            '" — using "' +
            vocab[0] +
            '" (valid: ' +
            vocab.join(' ') +
            ')'
        );
    }
  });
}
function homemapRooms(panel, path, warnings) {
  var rooms = panel.rooms;
  if (rooms == null) return [];
  if (!Array.isArray(rooms)) {
    if (warnings)
      warnings.push(path + '.rooms: expected an array of {label, x, y, w, h} — ignored');
    return [];
  }
  return rooms.filter(function (r, i) {
    var valid =
      r &&
      ['x', 'y', 'w', 'h'].every(function (k) {
        return isFiniteNum(r[k]);
      }) &&
      r.x >= 0 &&
      r.y >= 0 &&
      r.w > 0 &&
      r.h > 0 &&
      r.x + r.w <= 320 &&
      r.y + r.h <= 180;
    if (!valid && warnings)
      warnings.push(
        path + '.rooms[' + i + ']: use a positive rectangle inside the 320×180 map — ignored'
      );
    if (valid && r.kind !== undefined && ['room', 'outdoor'].indexOf(r.kind) < 0 && warnings)
      warnings.push(path + '.rooms[' + i + '].kind: use room or outdoor — using room');
    return valid;
  });
}

function homemapDeclarationWarnings(panel, path, warnings) {
  homemapRooms(panel, path, warnings);
  ['x', 'y'].forEach(function (k) {
    if (panel.outline && panel.outline[k] !== undefined && !isFiniteNum(panel.outline[k]))
      warnings.push(path + '.outline.' + k + ': must be finite — centering this axis');
  });
  if (panel.showSubjectLabels !== undefined && typeof panel.showSubjectLabels !== 'boolean')
    warnings.push(path + '.showSubjectLabels: expected a boolean — subject labels stay hidden');
  var devices = Object.create(null),
    seen = Object.create(null);
  if (!(Array.isArray(panel.devices) && panel.devices.length))
    warnings.push(path + '.devices: homemap needs a devices array — rendering a placeholder');
  (Array.isArray(panel.devices) ? panel.devices : []).forEach(function (d, i) {
    var dp = path + '.devices[' + i + ']';
    if (!d || typeof d.id !== 'string' || !d.id) {
      warnings.push(dp + '.id: needs a nonempty string — device ignored');
      return;
    }
    if (d.id === 'signals') warnings.push(dp + '.id: "signals" is reserved — device ignored');
    if (seen[d.id])
      warnings.push(dp + '.id: duplicate device id "' + d.id + '" — duplicate ignored');
    var duplicate = !!seen[d.id];
    seen[d.id] = true;
    if (typeof d.kind !== 'string' || !Object.prototype.hasOwnProperty.call(HOMEMAP_STATES, d.kind))
      warnings.push(
        dp +
          '.kind: unknown kind "' +
          d.kind +
          '" — device ignored (valid: camera entry sensor hub)'
      );
    ['x', 'y'].forEach(function (k) {
      if (!isFiniteNum(d[k])) warnings.push(dp + '.' + k + ': must be finite — device ignored');
    });
    if (d.kind === 'camera')
      ['facing', 'spread', 'range'].forEach(function (k) {
        if (d[k] !== undefined && !isFiniteNum(d[k]))
          warnings.push(dp + '.' + k + ': must be finite — default used');
      });
    if (
      d.display !== undefined &&
      (['marker', 'door'].indexOf(d.display) < 0 || (d.display === 'door' && d.kind !== 'entry'))
    )
      warnings.push(dp + '.display: use marker, or door for an entry device — using marker');
    if (d.kind === 'entry' && d.display === 'door') {
      ['facing', 'doorWidth'].forEach(function (k) {
        if (d[k] !== undefined && !isFiniteNum(d[k]))
          warnings.push(dp + '.' + k + ': must be finite — default used');
      });
      if (
        d.doorSwing !== undefined &&
        (!isFiniteNum(d.doorSwing) || Math.abs(d.doorSwing) < 15 || Math.abs(d.doorSwing) > 135)
      )
        warnings.push(dp + '.doorSwing: use an angle from -135 to -15 or 15 to 135 — using 90');
    }
    if (d.kind === 'sensor' && d.icon !== undefined && ICON_SET.indexOf(d.icon) < 0)
      warnings.push(dp + '.icon: unknown icon "' + d.icon + '" — using "gear"');
    if (!duplicate && homemapDeviceValid(d)) devices[d.id] = d;
  });
  var subjects = Object.create(null);
  homemapSubjects(panel, path, warnings).forEach(function (sub) {
    subjects[sub.id] = sub;
  });
  var declaration = { devices: devices, subjects: subjects };
  homemapPatchWarnings(panel.initial, path + '.initial', declaration, warnings);
  return declaration;
}

/* radar per-step patch checks shared by initial and step patches */
/* Carry device states and subject positions; signals belong only to their authored step. */
function foldHomemapStates(panel, steps) {
  var carried = Object.create(null),
    states = [],
    subjects = Object.create(null),
    devices = Object.create(null);
  (Array.isArray(panel.devices) ? panel.devices : []).forEach(function (d) {
    if (homemapDeviceValid(d) && !devices[d.id]) devices[d.id] = d;
  });
  homemapSubjects(panel).forEach(function (sub) {
    subjects[sub.id] = sub;
  });
  function apply(patch) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return;
    Object.keys(patch).forEach(function (k) {
      if (k === 'signals') return;
      if (subjects[k] && patch[k] !== null && !homemapSubjectPosition(patch[k])) return;
      if (devices[k] && (panelObject(patch[k]) || panelObject(carried[k]))) {
        var before = panelObject(carried[k])
          ? carried[k]
          : typeof carried[k] === 'string'
          ? { state: carried[k] }
          : {};
        var update = panelObject(patch[k]) ? patch[k] : { state: patch[k] };
        var next = Object.assign({}, before);
        ['state', 'thermal'].forEach(function (field) {
          var allowed = field === 'state' ? HOMEMAP_STATES[devices[k].kind] : HOMEMAP_THERMAL;
          if (allowed.indexOf(update[field]) >= 0) next[field] = update[field];
        });
        /* Legacy scalar values still select the operating state; an invalid
           scalar gets the documented default in homemapModel. */
        if (!panelObject(patch[k])) next.state = patch[k];
        carried[k] = next;
      } else carried[k] = patch[k];
    });
  }
  function snapshot(signals) {
    var snap = Object.create(null);
    Object.keys(carried).forEach(function (k) {
      snap[k] = carried[k];
    });
    snap.signals = Array.isArray(signals) ? signals.slice() : [];
    return snap;
  }
  apply(panel.initial);
  steps.forEach(function (st) {
    var patch = (stepPanelPatch(st) || {})[panel.id];
    apply(patch);
    states.push(snapshot(patch && patch.signals));
  });
  if (!steps.length) states.push(snapshot(null));
  return states;
}

PanelRegistry.extend('homemap', {
  validateDeclaration: function (p, PP, warnings, errors, d) {
    return homemapDeclarationWarnings(p, PP, warnings);
  },
  validatePatch: function (patch, path, panel, warnings, context) {
    homemapPatchWarnings(patch, path, context, warnings);
  },
  fold: foldHomemapStates,
});

/* homemap panel: presentation model and renderer. Shared lifecycle lives in ../shared.js. */
var HOMEMAP_DISPLAY_HEIGHT = 216;
var HOMEMAP_Y_SCALE = HOMEMAP_DISPLAY_HEIGHT / 180;
function homemapPointFromDisplay(point) {
  return {
    x: Math.round(clamp(point.x, 0, 320)),
    y: Math.round(clamp(point.y / HOMEMAP_Y_SCALE, 0, 180)),
  };
}
function homemapModel(panel, state) {
  panel = panel || {};
  state = state || {};
  function fin(v) {
    return typeof v === 'number' && isFinite(v) ? v : null;
  }
  var box = panel.outline || {};
  var w = fin(box.w) != null ? clamp(box.w, 20, 320) : 300;
  var h = fin(box.h) != null ? clamp(box.h, 20, 180) : 160;
  var ox = fin(box.x) != null ? clamp(box.x, 0, 320 - w) : (320 - w) / 2;
  var oy = fin(box.y) != null ? clamp(box.y, 0, 180 - h) : (180 - h) / 2;
  var byId = Object.create(null),
    seen = Object.create(null),
    devices = [];
  (Array.isArray(panel.devices) ? panel.devices : []).forEach(function (d) {
    if (!d || typeof d.id !== 'string' || seen[d.id]) return;
    seen[d.id] = true;
    if (!homemapDeviceValid(d)) return;
    var vocab = HOMEMAP_STATES[d.kind];
    var x = clamp(d.x, 0, 320),
      y = clamp(d.y, 0, 180);
    var floorDoor = d.kind === 'entry' && d.display === 'door';
    var devicePatch = Object.prototype.hasOwnProperty.call(state, d.id) ? state[d.id] : undefined;
    var operating = panelObject(devicePatch) ? devicePatch.state : devicePatch;
    var facing =
      fin(d.facing) != null
        ? d.facing
        : floorDoor
        ? 0
        : (Math.atan2(90 - y, 160 - x) * 180) / Math.PI;
    var item = {
      id: d.id,
      kind: d.kind,
      label: String(d.label != null ? d.label : d.id),
      x: x,
      y: y,
      state: vocab.indexOf(operating) >= 0 ? operating : vocab[0],
      thermal:
        panelObject(devicePatch) && HOMEMAP_THERMAL.indexOf(devicePatch.thermal) >= 0
          ? devicePatch.thermal
          : 'normal',
      icon: ICON_SET.indexOf(d.icon) >= 0 ? d.icon : 'gear',
      facing: ((facing % 360) + 360) % 360,
      spread: fin(d.spread) != null ? clamp(d.spread, 10, 180) : 80,
      range: fin(d.range) != null ? clamp(d.range, 20, 160) : 70,
    };
    if (floorDoor) {
      item.display = 'door';
      item.doorWidth = fin(d.doorWidth) != null ? clamp(d.doorWidth, 8, 48) : 24;
      item.doorSwing =
        fin(d.doorSwing) != null && Math.abs(d.doorSwing) >= 15 && Math.abs(d.doorSwing) <= 135
          ? d.doorSwing
          : 90;
    }
    byId[d.id] = item;
    devices.push(item);
  });
  var subjects = homemapSubjects(panel).map(function (sub) {
    var value = Object.prototype.hasOwnProperty.call(state, sub.id) ? state[sub.id] : undefined;
    var position = homemapSubjectPosition(value) ? value : sub;
    return {
      id: sub.id,
      label: String(sub.label != null ? sub.label : sub.id),
      icon: sub.icon === undefined ? null : ICON_SET.indexOf(sub.icon) >= 0 ? sub.icon : 'gear',
      x: clamp(position.x, 0, 320),
      y: clamp(position.y, 0, 180),
      hidden: value === null,
    };
  });
  var signals = [];
  (Array.isArray(state.signals) ? state.signals : []).forEach(function (sig) {
    if (!sig || Array.isArray(sig) || typeof sig.from !== 'string' || typeof sig.to !== 'string')
      return;
    var from = byId[sig.from],
      to = byId[sig.to];
    if (from && to)
      signals.push({
        from: sig.from,
        to: sig.to,
        fromXY: { x: from.x, y: from.y },
        toXY: { x: to.x, y: to.y },
      });
  });
  return {
    outline: { x: ox, y: oy, w: w, h: h },
    devices: devices,
    subjects: subjects,
    signals: signals,
  };
}

/* Room lighting is a view of the authored scene, not a simulated sensor or
   containment rule. The highest visible device state wins, then occupancy. */
function homemapRoomModel(panel, model) {
  return homemapRooms(panel).map(function (room) {
    function inside(item) {
      var house = model.outline;
      if (
        room.kind === 'outdoor' &&
        item.x > house.x &&
        item.x < house.x + house.w &&
        item.y > house.y &&
        item.y < house.y + house.h
      )
        return false;
      return (
        item.x >= room.x &&
        item.y >= room.y &&
        (item.x < room.x + room.w || (item.x === 320 && room.x + room.w === 320)) &&
        (item.y < room.y + room.h || (item.y === 180 && room.y + room.h === 180))
      );
    }
    var devices = model.devices.filter(inside);
    var occupied = model.subjects.some(function (s) {
      return !s.hidden && inside(s);
    });
    var tone = devices.some(function (d) {
      return d.state === 'alert' || d.state === 'detect';
    })
      ? 'alert'
      : devices.some(function (d) {
          return d.state === 'warn';
        })
      ? 'warn'
      : occupied
      ? 'occupied'
      : 'quiet';
    return { room: room, tone: tone };
  });
}

function homemapThermalHTML(d, scaleY, clearing) {
  var thermal = clearing || d.thermal;
  if (!thermal || thermal === 'normal') return '';
  var cold = thermal === 'cold' || thermal === 'freezing';
  var s =
    '<g class="hmthermal thermal-' +
    thermal +
    (clearing ? ' thermal-clearing' : '') +
    '" data-home-thermal="' +
    esc(d.id) +
    '" data-thermal="' +
    esc(d.thermal) +
    '" transform="translate(' +
    d.x +
    ' ' +
    d.y * scaleY +
    ')">' +
    '<title>' +
    esc(d.label + ': ' + (clearing ? 'temperature returning to normal' : thermal)) +
    '</title>' +
    '<circle class="thermal-halo" r="20"/><circle class="thermal-rim" r="12"/>';
  if (cold) {
    for (var i = 0; i < 6; i++)
      s +=
        '<path class="thermal-frost" transform="rotate(' +
        i * 60 +
        ')" d="M0 -11 V-19 M-3 -16 L0 -13 L3 -16"/>';
    s +=
      '<g class="thermal-badge" transform="translate(17 -17)"><circle r="7"/><path d="M0 -4 V4 M-3.5 -2 L3.5 2 M-3.5 2 L3.5 -2"/></g>';
  } else {
    [-8, 0, 8].forEach(function (x, i) {
      s +=
        '<path class="thermal-wave" style="animation-delay:-' +
        i * 0.65 +
        's" d="M' +
        x +
        ' -13 C' +
        (x - 5) +
        ' -18 ' +
        (x + 5) +
        ' -21 ' +
        x +
        ' -27"/>';
    });
    s +=
      '<g class="thermal-badge" transform="translate(17 -17)"><circle r="7"/><use href="#i-thermo" x="-5" y="-5" width="10" height="10"/></g>';
  }
  return s + '</g>';
}
function homemapDoorHTML(d, transition, outline, clearing) {
  var w = d.doorWidth,
    angle = (d.doorSwing * Math.PI) / 180;
  var endX = (w * Math.cos(angle)).toFixed(3),
    endY = (w * Math.sin(angle)).toFixed(3);
  var body =
    '<g class="hmdev hm-entry hm-' +
    esc(d.state) +
    ' hm-floor-door" data-device="' +
    esc(d.id) +
    '">' +
    '<title>' +
    esc(d.label) +
    ': ' +
    esc(d.state) +
    '</title>' +
    homemapThermalHTML(d, HOMEMAP_Y_SCALE, clearing) +
    '<g transform="translate(' +
    d.x +
    ' ' +
    d.y * HOMEMAP_Y_SCALE +
    ') scale(1 ' +
    HOMEMAP_Y_SCALE +
    ') rotate(' +
    d.facing +
    ')">' +
    '<path class="hm-door-threshold" d="M-1 0 H' +
    (w + 1) +
    '"/>' +
    '<path class="hm-door-hit" d="M0 0 H' +
    w +
    ' M' +
    w +
    ' 0 A' +
    w +
    ' ' +
    w +
    ' 0 0 ' +
    (d.doorSwing > 0 ? 1 : 0) +
    ' ' +
    endX +
    ' ' +
    endY +
    '"/>' +
    '<path class="hm-door-arc" d="M' +
    w +
    ' 0 A' +
    w +
    ' ' +
    w +
    ' 0 0 ' +
    (d.doorSwing > 0 ? 1 : 0) +
    ' ' +
    endX +
    ' ' +
    endY +
    '"/>' +
    '<g class="hm-floor-leaf' +
    (transition ? ' hm-floor-' + transition : '') +
    '" style="--hm-door-angle:' +
    d.doorSwing +
    'deg">' +
    '<path d="M0 0 H' +
    w +
    '"/><circle class="hm-door-handle" cx="' +
    (w - 4) +
    '" cy="-2" r="1"/></g>' +
    '<path class="hm-door-jamb" d="M0 -3 V3 M' +
    w +
    ' -3 V3"/><circle class="hm-door-hinge" r="1.8"/></g>';
  var labelX = d.x,
    labelY = d.y > 139 ? d.y * HOMEMAP_Y_SCALE - 14 : d.y * HOMEMAP_Y_SCALE + 16;
  var direction = (d.facing * Math.PI) / 180;
  if (outline && Math.abs(Math.cos(direction)) > 0.7) {
    labelX += (w * Math.cos(direction)) / 2;
    labelY =
      (d.y + (w * Math.sin(direction)) / 2) * HOMEMAP_Y_SCALE +
      (d.y < outline.y + outline.h / 2 ? -14 : 14);
  }
  return (
    body +
    '<text class="hmlbl" x="' +
    clamp(labelX, 28, 292) +
    '" y="' +
    clamp(labelY, 10, HOMEMAP_DISPLAY_HEIGHT - 5) +
    '" text-anchor="middle">' +
    esc(d.label) +
    '</text></g>'
  );
}

PanelViews.register(
  'homemap',
  function (host, panel, state, skin, states, stepIdx, animate) {
    var h = '';
    var hBaseline = null;
    var hm = homemapModel(panel, state);
    var hmThermalPrev = host._hmThermal || Object.create(null),
      hmThermalNow = Object.create(null),
      hmClearing = Object.create(null);
    var hmPrev = host._hmStates || Object.create(null),
      hmNow = Object.create(null);
    var hmFresh = Object.create(null),
      hmHasFresh = false,
      hmDoors = Object.create(null);
    hm.devices.forEach(function (d) {
      hmThermalNow[d.id] = d.thermal;
      if (
        animate &&
        d.thermal === 'normal' &&
        hmThermalPrev[d.id] &&
        hmThermalPrev[d.id] !== 'normal'
      ) {
        hmClearing[d.id] = hmThermalPrev[d.id];
        hmHasFresh = true;
      }
      hmNow[d.id] = d.state;
      if (
        animate &&
        d.kind === 'entry' &&
        hmPrev[d.id] !== undefined &&
        (d.state === 'open') !== (hmPrev[d.id] === 'open')
      ) {
        hmDoors[d.id] = d.state === 'open' ? 'opening' : 'closing';
        hmHasFresh = true;
      }
      if (
        animate &&
        hmPrev[d.id] !== undefined &&
        hmPrev[d.id] !== d.state &&
        ((d.kind === 'camera' && d.state === 'detect') ||
          (d.kind === 'entry' && d.state === 'alert') ||
          (d.kind === 'hub' && d.state === 'rx') ||
          (d.kind === 'sensor' && ['warn', 'alert'].indexOf(d.state) >= 0))
      ) {
        hmFresh[d.id] = true;
        hmHasFresh = true;
      }
    });
    host._hmStates = hmNow;
    host._hmThermal = hmThermalNow;
    var hmSubjPrev = host._hmSubjPrev || Object.create(null),
      hmSubjNow = Object.create(null);
    var hmMoved = Object.create(null),
      hmHasMoved = false;
    hm.subjects.forEach(function (sub) {
      if (sub.hidden) return;
      var prev = hmSubjPrev[sub.id];
      hmSubjNow[sub.id] = { x: sub.x, y: sub.y };
      if (animate && prev && (prev.x !== sub.x || prev.y !== sub.y)) {
        hmMoved[sub.id] = true;
        hmHasMoved = true;
      }
    });
    /* Hidden/removed subjects lose their previous position before reappearing. */
    host._hmSubjPrev = hmSubjNow;
    var hmSignals = animate && typeof stepIdx === 'number' && stepIdx >= 0 ? hm.signals : [];
    var buildHomemap = function (transient) {
      var o = hm.outline;
      var sy = HOMEMAP_Y_SCALE;
      var s =
        '<svg class="hmframe" viewBox="0 0 320 ' +
        HOMEMAP_DISPLAY_HEIGHT +
        '" role="img" aria-label="' +
        esc(panel.title || 'Home device map') +
        '">';
      var spaces = homemapRoomModel(panel, hm);
      function drawSpace(space) {
        var room = space.room,
          outdoor = room.kind === 'outdoor';
        s +=
          '<g class="hmspace hm-room-' +
          space.tone +
          (outdoor ? ' hm-outdoor' : '') +
          '" data-home-room="' +
          panel.rooms.indexOf(room) +
          '">';
        s +=
          '<rect class="hmroom" x="' +
          room.x +
          '" y="' +
          room.y * sy +
          '" width="' +
          room.w +
          '" height="' +
          room.h * sy +
          '" rx="2"/>';
        if (!outdoor)
          s +=
            '<path class="hmroomwall" d="M' +
            (room.x + 2) +
            ' ' +
            ((room.y + room.h) * sy - 2) +
            ' V' +
            (room.y * sy + 2) +
            ' H' +
            (room.x + room.w - 2) +
            '"/>';
        s +=
          '<text class="hmroomlabel" x="' +
          (room.x + 6) +
          '" y="' +
          (room.y * sy + 10) +
          '">' +
          esc(room.label || '') +
          '</text></g>';
      }
      spaces
        .filter(function (space) {
          return space.room.kind === 'outdoor';
        })
        .forEach(drawSpace);
      s +=
        '<rect class="hmfoundation" x="' +
        o.x +
        '" y="' +
        (o.y * sy + 2) +
        '" width="' +
        o.w +
        '" height="' +
        o.h * sy +
        '" rx="9"/>';
      s +=
        '<rect class="hmoutline" x="' +
        o.x +
        '" y="' +
        o.y * sy +
        '" width="' +
        o.w +
        '" height="' +
        o.h * sy +
        '" rx="9"/>';
      spaces
        .filter(function (space) {
          return space.room.kind !== 'outdoor';
        })
        .forEach(drawSpace);
      if (transient && hmHasMoved)
        hm.subjects.forEach(function (sub) {
          if (!hmMoved[sub.id]) return;
          var prev = hmSubjPrev[sub.id];
          s +=
            '<path class="hmtrail" d="M' +
            prev.x +
            ' ' +
            prev.y * sy +
            ' L' +
            sub.x +
            ' ' +
            sub.y * sy +
            '"/>';
        });
      /* Direction remains readable while paused and under reduced motion.
         Animated step paints add traveling packets over the route. */
      if (typeof stepIdx === 'number' && stepIdx >= 0)
        hm.signals.forEach(function (sig) {
          var fromY = sig.fromXY.y * sy,
            toY = sig.toXY.y * sy;
          var dx = sig.toXY.x - sig.fromXY.x,
            dy = toY - fromY;
          var length = Math.sqrt(dx * dx + dy * dy);
          if (length < 24) return;
          var ux = dx / length,
            uy = dy / length;
          var x = sig.toXY.x - ux * 13,
            y = toY - uy * 13;
          s +=
            '<g class="hmlink"><title>' +
            esc(sig.from + ' → ' + sig.to) +
            '</title>' +
            '<path class="hmlinkglow" d="M' +
            (sig.fromXY.x + ux * 12) +
            ' ' +
            (fromY + uy * 12) +
            ' L' +
            x +
            ' ' +
            y +
            '"/>' +
            '<path class="hmlinkroute" d="M' +
            (sig.fromXY.x + ux * 12) +
            ' ' +
            (fromY + uy * 12) +
            ' L' +
            x +
            ' ' +
            y +
            '"/>' +
            '<path class="hmlinktip" d="M' +
            (x - ux * 5 - uy * 3) +
            ' ' +
            (y - uy * 5 + ux * 3) +
            ' L' +
            x +
            ' ' +
            y +
            ' L' +
            (x - ux * 5 + uy * 3) +
            ' ' +
            (y - uy * 5 - ux * 3) +
            '"/></g>';
        });
      /* Wedges below all markers, so one camera cannot obscure another. */
      hm.devices.forEach(function (d) {
        if (d.kind !== 'camera' || ['scan', 'detect', 'rec'].indexOf(d.state) < 0) return;
        var a1 = ((d.facing - d.spread / 2) * Math.PI) / 180;
        var a2 = ((d.facing + d.spread / 2) * Math.PI) / 180;
        var mid = (d.facing * Math.PI) / 180;
        s += '<g class="hmdev hm-camera hm-' + esc(d.state) + '" transform="scale(1 ' + sy + ')">';
        s +=
          '<path class="hmwedge" d="M' +
          d.x +
          ' ' +
          d.y +
          ' L' +
          (d.x + d.range * Math.cos(a1)).toFixed(1) +
          ' ' +
          (d.y + d.range * Math.sin(a1)).toFixed(1) +
          ' A' +
          d.range +
          ' ' +
          d.range +
          ' 0 0 1 ' +
          (d.x + d.range * Math.cos(a2)).toFixed(1) +
          ' ' +
          (d.y + d.range * Math.sin(a2)).toFixed(1) +
          ' Z"/>';
        if (!RM)
          s +=
            '<g class="hmsweep" style="transform-origin:' +
            d.x +
            'px ' +
            d.y +
            'px;--sw:' +
            (d.spread / 2 - 2) +
            'deg"><line x1="' +
            d.x +
            '" y1="' +
            d.y +
            '" x2="' +
            (d.x + (d.range - 3) * Math.cos(mid)).toFixed(1) +
            '" y2="' +
            (d.y + (d.range - 3) * Math.sin(mid)).toFixed(1) +
            '"/></g>';
        s += '</g>';
      });
      hm.devices.forEach(function (d) {
        if (d.display === 'door') {
          s += homemapDoorHTML(
            d,
            transient ? hmDoors[d.id] : null,
            hm.outline,
            transient ? hmClearing[d.id] : null
          );
          return;
        }
        s +=
          '<g class="hmdev hm-' +
          esc(d.kind) +
          ' hm-' +
          esc(d.state) +
          '" data-device="' +
          esc(d.id) +
          '" transform="translate(0 ' +
          (d.y * (sy - 1)).toFixed(3) +
          ')">' +
          '<title>' +
          esc(d.label) +
          ': ' +
          esc(d.state) +
          (d.thermal !== 'normal' ? ' · ' + d.thermal : '') +
          '</title>';
        s += homemapThermalHTML(d, 1, transient ? hmClearing[d.id] : null);
        s += '<circle class="hmdevice-aura" cx="' + d.x + '" cy="' + d.y + '" r="13"/>';
        if (transient && hmFresh[d.id])
          s +=
            '<circle class="' +
            (d.kind === 'hub' ? 'hmglow' : 'hmripple') +
            '" cx="' +
            d.x +
            '" cy="' +
            d.y +
            '" r="6"/>';
        s += '<circle class="hmmarker" cx="' + d.x + '" cy="' + d.y + '" r="8.5"/>';
        if (d.kind === 'hub')
          s += '<circle class="hmhubring" cx="' + d.x + '" cy="' + d.y + '" r="10"/>';
        /* tx: steady looping broadcast waves — part of the baseline, so an
           unchanged step repaint leaves the animation running */
        if (d.kind === 'hub' && d.state === 'tx')
          s +=
            '<circle class="hmtxring" cx="' +
            d.x +
            '" cy="' +
            d.y +
            '" r="8"/>' +
            '<circle class="hmtxring hmtxring2" cx="' +
            d.x +
            '" cy="' +
            d.y +
            '" r="8"/>';
        /* rec: the classic blinking recording light beside the camera dot —
           steady markup, so the blink survives unchanged step repaints */
        if (d.kind === 'camera' && d.state === 'rec')
          s += '<circle class="hmrecdot" cx="' + (d.x + 7) + '" cy="' + (d.y - 7) + '" r="2.5"/>';
        if (d.kind === 'entry') {
          s += '<path class="hmentry" d="M' + (d.x - 3.5) + ' ' + (d.y + 5) + ' v-10 h7 v10"/>';
          s +=
            '<path class="hmdoorleaf' +
            (transient && hmDoors[d.id] ? ' hmdoor-' + hmDoors[d.id] : '') +
            '" style="transform-origin:' +
            (d.x - 3.5) +
            'px ' +
            (d.y + 5) +
            'px" d="M' +
            (d.x - 3.5) +
            ' ' +
            (d.y + 5) +
            ' h7"/>';
        } else {
          var deviceIcon = d.kind === 'camera' ? 'camera' : d.kind === 'hub' ? 'router' : d.icon;
          s +=
            '<use class="hmicon hmdeviceglyph" href="#i-' +
            esc(deviceIcon) +
            '" x="' +
            (d.x - 6) +
            '" y="' +
            (d.y - 6) +
            '" width="12" height="12"/>';
        }
        var labelY = d.y > 139 ? d.y - 25 : d.y + 20;
        var labelX = clamp(d.x, 28, 292);
        s +=
          '<text class="hmlbl" x="' +
          labelX +
          '" y="' +
          labelY +
          '" text-anchor="middle">' +
          esc(d.label) +
          '</text></g>';
      });
      hm.subjects.forEach(function (sub) {
        if (sub.hidden) return;
        var prev = hmSubjPrev[sub.id];
        s +=
          '<g transform="translate(0 ' +
          (sub.y * (sy - 1)).toFixed(3) +
          ')"><g class="hmsubject" data-subject="' +
          esc(sub.id) +
          '"' +
          (transient && hmMoved[sub.id]
            ? ' style="transform:translate(' +
              (prev.x - sub.x) +
              'px,' +
              (prev.y - sub.y) * sy +
              'px)"'
            : '') +
          '><title>' +
          esc(sub.label) +
          '</title>';
        s +=
          '<ellipse class="hmactor-shadow" cx="' +
          sub.x +
          '" cy="' +
          (sub.y + 9) +
          '" rx="7" ry="2.2"/>';
        s += '<circle class="hmsubjectdot" cx="' + sub.x + '" cy="' + sub.y + '" r="7"/>';
        if (sub.icon)
          s +=
            '<use class="hmactor-icon" href="#i-' +
            esc(sub.icon) +
            '" x="' +
            (sub.x - 5) +
            '" y="' +
            (sub.y - 5) +
            '" width="10" height="10"/>';
        else
          s +=
            '<circle class="hmactor-icon" cx="' +
            sub.x +
            '" cy="' +
            (sub.y - 2.2) +
            '" r="1.8"/>' +
            '<path class="hmactor-icon" d="M' +
            (sub.x - 3.4) +
            ' ' +
            (sub.y + 4) +
            ' v-1 a3.4 3.4 0 0 1 6.8 0 v1 Z"/>';
        if (panel.showSubjectLabels === true)
          s +=
            '<text class="hmlbl hmactor-label" x="' +
            clamp(sub.x, 24, 296) +
            '" y="' +
            (sub.y > 146 ? sub.y - 12 : sub.y + 19) +
            '" text-anchor="middle">' +
            esc(sub.label) +
            '</text>';
        s += '</g></g>';
      });
      if (!hm.devices.length)
        s +=
          '<text class="hmlbl" x="160" y="' +
          (HOMEMAP_DISPLAY_HEIGHT / 2 + 4) +
          '" text-anchor="middle">No devices configured</text>';
      if (transient)
        hmSignals.forEach(function (sig, i) {
          s +=
            '<circle class="hmsig" r="3" style="--hx1:' +
            sig.fromXY.x +
            'px;--hy1:' +
            sig.fromXY.y * sy +
            'px;--hx2:' +
            sig.toXY.x +
            'px;--hy2:' +
            sig.toXY.y * sy +
            'px;animation-delay:' +
            i * 0.25 +
            's"/>';
        });
      return s + '</svg>';
    };
    h += buildHomemap(true);
    hBaseline = hmHasFresh || hmHasMoved || hmSignals.length ? buildHomemap(false) : null;
    return {
      html: h,
      baseline: hBaseline,
      transient: '.hmripple,.hmglow,.hmsig,.hmtrail',
      glide: { selector: '.hmsubject[style]', multiple: true },
      settle: function () {
        if (typeof host.querySelectorAll !== 'function') return;
        var leaves = host.querySelectorAll('.hmdoor-opening,.hmdoor-closing');
        for (var i = 0; i < leaves.length; i++) {
          leaves[i].classList.remove('hmdoor-opening');
          leaves[i].classList.remove('hmdoor-closing');
        }
      },
    };
  },
  { ambientInitial: true }
);

PanelRegistry.extend('homemap', {
  order: 16,
  label: 'Home map',
  since: '0.1.0',
  layout: {
    focusByDefault: true,
    fallbackHeight: 12,
    focusLabel: 'Home',
    attachControls: true,
    large: true,
    supporting: false,
  },
});

PanelRegistry.extend('homemap', {
  styles: [
    {
      order: 63,
      css: String.raw`.docview .section-layout-tile>.pt-homemap{display:flex;flex-direction:column;}
.section-layout-tile>.pt-homemap>.ptitle{flex:none;}
.section-layout-tile>.pt-homemap>.pbody{flex:1;min-height:0;}`,
    },
    { order: 73, css: String.raw`.section-layout-tile .hmframe{height:100%;max-height:100%;}` },
    {
      order: 76,
      css: String.raw`@container diagram-section (max-width:640px){
  .section-layout-tile:has(>.pt-homemap){height:auto;}
}
@container diagram-section (max-width:640px){
  .section-layout-tile .hmframe{height:auto;}
}`,
    },
    {
      order: 854,
      css: String.raw`.hmframe{display:block; width:100%; height:auto; border-radius:8px; overflow:hidden;
  --hm-bg:#0A0F14; --hm-line:#3B4A63; --hm-neutral:#94A3B8; --hm-accent:#38E1FF;
  --hm-ok:#43D98B; --hm-warn:#FFB454; --hm-alert:#FF6B5E; --hm-label:#93A7C9;
  background:var(--hm-bg);}
.sk-daylight .hmframe{--hm-bg:#F4F2EC; --hm-line:#C9CDE9; --hm-neutral:#6B6F7A;
  --hm-accent:#4956C9; --hm-ok:#278A52; --hm-warn:#B7791F; --hm-alert:#C93D35; --hm-label:#4F5964;}
body.sk-editorial .hmframe{--hm-bg:var(--ed-sheet); --hm-line:var(--ed-rule-strong); --hm-neutral:var(--ed-muted);
  --hm-accent:var(--ed-accent); --hm-ok:var(--ed-good); --hm-warn:var(--ed-warn); --hm-alert:var(--ed-bad); --hm-label:var(--ed-text);}
body.sk-terminal .hmframe{--hm-bg:var(--tm-ground); --hm-line:var(--tm-line); --hm-neutral:var(--tm-muted);
  --hm-accent:var(--tm-good); --hm-ok:var(--tm-good); --hm-warn:#FFD166; --hm-alert:var(--tm-alert); --hm-label:var(--tm-text);}
body.sk-pastel .hmframe{--hm-bg:#F5F7FB; --hm-line:#9BA6B5; --hm-neutral:#7D899C;
  --hm-accent:#6E7DD2; --hm-ok:#347A55; --hm-warn:#946B20; --hm-alert:#B54646; --hm-label:#526077;}
body.sk-blueprint .hmframe{--hm-bg:#031B3A; --hm-line:#94BCD5; --hm-neutral:#94BCD5;
  --hm-accent:#58E7FF; --hm-ok:#7BF5B4; --hm-warn:#FFD58A; --hm-alert:#FFB4B4; --hm-label:#D5E9F7;}
.hmframe{--hm-surface:color-mix(in srgb,var(--hm-bg) 94%,white);
  background:radial-gradient(ellipse at 30% 10%,color-mix(in srgb,var(--hm-accent) 8%,transparent),transparent 65%),var(--hm-bg);}
body.sk-pastel .hmframe,.sk-daylight .hmframe{--hm-surface:#FFFFFF;}
.hmfoundation{fill:var(--hm-line);opacity:.16;}
.hmoutline{fill:var(--hm-surface);stroke:color-mix(in srgb,var(--hm-line) 55%,var(--hm-surface));stroke-width:1.3;}
.hmdevice-aura{fill:currentColor;opacity:.08;transform-box:fill-box;transform-origin:center;}
.hm-scan .hmdevice-aura,.hm-rx .hmdevice-aura{animation:hmbreathe 3.5s ease-in-out infinite;}
.hm-detect .hmdevice-aura,.hm-alert .hmdevice-aura,.hm-warn .hmdevice-aura{animation:hmbreathe 2.2s ease-in-out infinite;}
@keyframes hmbreathe{0%,100%{opacity:.07;transform:scale(.92);}50%{opacity:.2;transform:scale(1.2);}}
.hmdev{color:var(--hm-neutral);}
.hmdev.hm-ok{color:var(--hm-ok);}
.hmdev.hm-scan,.hmdev.hm-open,.hmdev.hm-rx,.hmdev.hm-tx,.hmdev.hm-rec{color:var(--hm-accent);}
.hmdev.hm-warn{color:var(--hm-warn);}
.hmdev.hm-detect,.hmdev.hm-alert{color:var(--hm-alert);}
.hmdev.hm-sleep .hmmarker{opacity:.45;}
.hmdev.hm-off .hmmarker,.hmdev.hm-off .hmicon{opacity:.2;}
.hmmarker{fill:var(--hm-surface);stroke:currentColor;stroke-width:1.2;filter:drop-shadow(0 1px 1px color-mix(in srgb,var(--hm-line) 25%,transparent));}
.hm-off .hmdevice-aura,.hm-sleep .hmdevice-aura{display:none;}
.hm-sleep .hmdeviceglyph{opacity:.45;}
.hmsubject{color:var(--hm-accent); transition:transform .7s cubic-bezier(.4,0,.2,1);}
.hmsubjectdot{fill:currentColor;stroke:var(--hm-surface);stroke-width:1.2;}
.hmactor-icon{fill:var(--hm-surface);color:var(--hm-surface);stroke:none;pointer-events:none;}
.hmactor-shadow{fill:var(--hm-label);opacity:.12;}
.hmtrail{fill:none;stroke:var(--hm-accent);stroke-width:1.4;stroke-dasharray:2 3;stroke-linecap:round;pointer-events:none;animation:hmtrailfade 1.2s ease-out both;}
@keyframes hmtrailfade{0%,20%{opacity:.6;}100%{opacity:0;}}
.hmhubring,.hmentry{fill:none; stroke:currentColor; stroke-width:1.1;}`,
    },
    {
      order: 886,
      css: String.raw`.hmtxring{fill:none; stroke:currentColor; stroke-width:1.4; animation:hmtxwave 1.4s ease-out infinite;}
.hmtxring.hmtxring2{animation-delay:.7s;}
@keyframes hmtxwave{from{r:8; opacity:.9;} to{r:24; opacity:0;}}`,
    },
    {
      order: 890,
      css: String.raw`.hmrecdot{fill:var(--hm-alert); animation:hmrecblink 1.1s steps(1) infinite;}
@keyframes hmrecblink{0%{opacity:1;} 55%{opacity:.15;} 100%{opacity:1;}}
.hmentry{stroke-linejoin:round;}
.hmdoorleaf{fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;transform-box:view-box;}
.hm-open .hmdoorleaf{transform:rotate(-65deg);}
.hmdoor-opening{animation:hmdooropen .6s cubic-bezier(.2,.7,.2,1) both;}
.hmdoor-closing{animation:hmdoorclose .6s cubic-bezier(.2,.7,.2,1) both;}
@keyframes hmdooropen{from{transform:rotate(0);}to{transform:rotate(-65deg);}}
@keyframes hmdoorclose{from{transform:rotate(-65deg);}to{transform:rotate(0);}}
.hmicon{fill:none; stroke:currentColor; stroke-width:1.5;}
.hmlbl{font:600 6.8px 'IBM Plex Sans',system-ui,sans-serif;fill:var(--hm-label);
  paint-order:stroke;stroke:var(--hm-surface);stroke-width:2;stroke-linejoin:round;}
.hmwedge{fill:currentColor;fill-opacity:.1;stroke:currentColor;stroke-opacity:.22;stroke-width:.7;}
.hmsweep{transform-box:view-box; animation:sensorSweep 3.2s ease-in-out infinite alternate;}
.hmsweep line{stroke:currentColor; stroke-width:1.2; opacity:.55; stroke-linecap:round;}
.hmripple,.hmglow{fill:none; stroke:currentColor; stroke-width:2; animation:sensorRipple 1s ease-out both;}
.hmglow{stroke-width:5;}
.hmsig{fill:var(--hm-surface);stroke:var(--hm-accent);stroke-width:1.2;filter:drop-shadow(0 0 2px var(--hm-accent)); visibility:hidden; transform-box:view-box;
  animation:hmsignal 1.6s linear infinite;}`,
    },
    {
      order: 908,
      css: String.raw`@keyframes hmsignal{
  0%{visibility:visible; opacity:1; transform:translate(var(--hx1),var(--hy1));}
  44%{visibility:visible; opacity:1;}
  45%{visibility:hidden; opacity:0; transform:translate(var(--hx2),var(--hy2));}
  100%{visibility:hidden; opacity:0; transform:translate(var(--hx2),var(--hy2));}
}`,
    },
    {
      order: 1218,
      css: String.raw`@media (prefers-reduced-motion: reduce){
  .hmsweep,.hmripple,.hmglow,.hmsig,.hmtxring{animation:none !important; display:none !important;}
}
@media (prefers-reduced-motion: reduce){
  .hmrecdot{animation:none !important;}
}`,
    },
    {
      order: 2338,
      css: String.raw`@media screen{
  .panel-first>.primary-panel:has(>.pt-homemap){width:100%;max-width:var(--home-max-width);justify-self:center;}
}
@media screen{
  body .docview .boardgrid.panel-first:has(>.primary-panel>.pt-homemap)>.panelcol:not([hidden]){
    display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));align-items:start;margin-top:0;
  }
}
@media screen and (min-width:981px){
  @container diagram-section (min-width:1001px){
    body .docview .boardgrid.haspanels.panel-first:has(>.primary-panel>.pt-homemap):has(>.panelcol:not([hidden])){
      grid-template-columns:minmax(0,var(--home-max-width)) minmax(280px,1fr);
    }
  }
}`,
    },
    {
      order: 2344,
      css: String.raw`.primary-panel .hmframe{max-height:var(--home-max-height,70vh);}`,
    },
    {
      order: 2351,
      css: String.raw`.hmspace{--hm-room-color:var(--hm-line);}
.hm-room-occupied{--hm-room-color:var(--hm-accent);}
.hm-room-alert{--hm-room-color:var(--hm-alert);}
.hm-room-warn{--hm-room-color:var(--hm-warn);}
.hmroom{fill:color-mix(in srgb,var(--hm-room-color) 7%,var(--hm-surface));stroke:color-mix(in srgb,var(--hm-line) 45%,var(--hm-surface));stroke-width:.9;}
.hmroomwall{fill:none;stroke:var(--hm-surface);stroke-width:1.2;opacity:.7;}
.hmroomlabel{font:600 5.4px 'IBM Plex Sans',system-ui,sans-serif;letter-spacing:.45px;fill:var(--hm-label);opacity:.85;}
.hm-room-occupied .hmroom,.hm-room-alert .hmroom,.hm-room-warn .hmroom{fill:color-mix(in srgb,var(--hm-room-color) 13%,var(--hm-surface));}
.hm-outdoor .hmroom{fill:color-mix(in srgb,var(--hm-ok) 12%,var(--hm-bg));stroke:color-mix(in srgb,var(--hm-ok) 35%,var(--hm-bg));stroke-dasharray:3 2;}
.hm-outdoor.hm-room-occupied .hmroom,.hm-outdoor.hm-room-alert .hmroom,.hm-outdoor.hm-room-warn .hmroom{fill:color-mix(in srgb,var(--hm-room-color) 17%,color-mix(in srgb,var(--hm-ok) 10%,var(--hm-bg)));}
.hm-outdoor .hmroomlabel{fill:var(--hm-ok);font-weight:700;letter-spacing:.7px;}
.hm-door-threshold{fill:none;stroke:var(--hm-surface);stroke-width:7;}
.hm-door-hit{fill:none;stroke:transparent;stroke-width:12;pointer-events:stroke;}
.hm-door-arc{fill:none;stroke:currentColor;stroke-width:.7;stroke-dasharray:2 2;opacity:.5;pointer-events:none;}
.hm-door-jamb{fill:none;stroke:var(--hm-line);stroke-width:2.4;}
.hm-door-hinge,.hm-door-handle{fill:currentColor;}
.hm-floor-leaf{transform-box:view-box;transform-origin:0 0;}
.hm-floor-leaf>path{fill:none;stroke:currentColor;stroke-width:2.6;stroke-linecap:round;}
.hm-open .hm-floor-leaf{transform:rotate(var(--hm-door-angle));}
.hm-floor-opening{animation:hmflooropen .65s cubic-bezier(.2,.7,.2,1) both;}
.hm-floor-closing{animation:hmfloorclose .65s cubic-bezier(.2,.7,.2,1) both;}
@keyframes hmflooropen{from{transform:rotate(0);}to{transform:rotate(var(--hm-door-angle));}}
@keyframes hmfloorclose{from{transform:rotate(var(--hm-door-angle));}to{transform:rotate(0);}}
.hmlink{fill:none;stroke:var(--hm-accent);stroke-width:1;stroke-dasharray:3 3;opacity:.7;}
.hmlinktip{stroke-dasharray:none;stroke-linecap:round;stroke-linejoin:round;}
.hmlinkglow{stroke-width:4;stroke-dasharray:none;opacity:.13;}
.hmlinkroute{animation:hmrouteflow 1.8s linear infinite;}
@keyframes hmrouteflow{to{stroke-dashoffset:-18;}}
@media(prefers-reduced-motion:reduce){
  .hmframe *{animation:none !important;transition:none !important;}
}
@media(prefers-reduced-motion:reduce){
  .hmtrail{display:none;}
}
@media print{
  .hmframe *{animation:none !important;transition:none !important;filter:none !important;}
}
@media print{
  .hmsubject{transform:none !important;}
}
@media print{
  .hmtrail,.hmsig{display:none !important;}
}`,
    },
    {
      order: 2388,
      css: String.raw`@media print{
  .primary-panel .hmframe{max-height:none;}
}`,
    },
    {
      order: 2414,
      css: String.raw`.hmframe{--hm-cold:#6BCFFF;--hm-freezing:#81AEFF;}
.sk-daylight .hmframe,body.sk-pastel .hmframe,body.sk-editorial .hmframe{--hm-cold:#1579A4;--hm-freezing:#385DB5;}
.hmthermal{pointer-events:none;color:var(--hm-warn);}`,
    },
    {
      order: 2457,
      css: String.raw`@media print{
  .hmthermal,.hmthermal *{animation:none !important;}
}`,
    },
  ],
});

PanelRegistry.extend('homemap', {
  editorStyles: [
    {
      order: 476,
      css: String.raw`.home-elements,.home-element{min-width:0;border:1px solid var(--line);border-radius:7px;}
.home-elements>summary,.home-element>summary{cursor:pointer;padding:9px 10px;font:600 12px/1.5 'IBM Plex Sans',sans-serif;overflow-wrap:anywhere;}
.home-elements>summary:focus-visible,.home-element>summary:focus-visible{outline:2px solid var(--accent);outline-offset:-2px;}
.home-elements>.rowsedit{padding:0 8px 8px;gap:6px;}
.home-element>.rowcard{border:0;padding:6px 10px 10px;}
.home-element-kind{font-weight:400;color:var(--sub);margin-left:8px;font-size:11px;}
.home-icon-cell{grid-column:1 / -1;gap:5px;}
.home-icon-choice{display:flex;align-items:center;gap:8px;min-width:0;}
.home-icon-choice[hidden]{display:none;}
.home-icon-preview{flex:none;width:32px;height:32px;color:var(--ink);}
.home-icon-preview svg{width:100%;height:100%;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round;}
.rowline.rowcard .home-icon-choice .fctl{flex:1;min-width:0;width:0;}
.home-icon-note{font:12px/1.5 'IBM Plex Sans',sans-serif;color:var(--sub);}`,
    },
    {
      order: 571,
      css: String.raw`.docview .home-layout-title{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;}
.docview .home-layout-button{font:600 11px 'IBM Plex Sans',sans-serif;text-transform:none;letter-spacing:normal;min-height:30px;margin-left:auto;}`,
    },
    { order: 576, css: String.raw`@media print{.home-layout-button{display:none !important;}}` },
    {
      order: 622,
      css: String.raw`.home-edit{min-width:0;margin:12px 0;padding:10px;border:1px solid var(--line);border-radius:9px;container-type:inline-size;}
.home-edit legend{font-size:12px;font-weight:700;color:var(--ink);}
.home-edit .frow{margin:7px 0;}
.home-note{font-size:11px;line-height:1.5;color:var(--sub);margin:7px 0;}
.home-edit-map{border-radius:8px;overflow:hidden;margin-bottom:10px;max-width:600px;}
.home-edit-fields{min-width:0;}
@container (min-width:700px){
  .home-edit-body{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(300px,1fr);gap:16px;align-items:start;}
}
@container (min-width:700px){
  .home-edit-map{position:sticky;top:0;margin-bottom:0;}
}
.home-edit-map:focus-visible{outline:2px solid var(--accent);outline-offset:2px;}
.home-edit-map [data-device],.home-edit-map [data-subject],.home-edit-map [data-home-room]{cursor:grab;touch-action:none;}
.home-edit-map .hmroom{pointer-events:stroke;}
.home-edit-map.moving,.home-edit-map.moving *{cursor:grabbing;}
.home-edit-map.placing,.home-edit-map.placing *{cursor:crosshair;touch-action:none;}
.home-edit-map .hmframe *{animation:none !important;}
.home-layout-map .hmoutline{cursor:grab;pointer-events:stroke;touch-action:none;}
.home-layout-map .home-resize-handle{fill:var(--hm-surface);stroke:var(--hm-accent);stroke-width:1;cursor:nwse-resize;touch-action:none;}
.home-outline-grip{fill:var(--hm-surface);stroke:var(--hm-accent);stroke-width:.7;cursor:grab;touch-action:none;}
.home-outline-grip-label{font:600 4.5px system-ui,sans-serif;fill:var(--hm-accent);pointer-events:none;}
.home-start-hidden{opacity:.4;}
.home-xy{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
.home-xy .frow{display:flex;align-items:center;gap:8px;}
.home-xy .fctl{min-width:0;width:100%;}
.home-subject{padding:8px 0;border-top:1px solid var(--line);}
.home-subject .bbtn[aria-pressed="true"]{border-color:var(--accent);color:var(--accent);}
.home-signal{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:12px;margin:6px 0;}`,
    },
  ],
});

/* homemap authoring contract; merged into this panel definition by the bundle. */
/* Layout selection must remain available even when a diagram has a stepper. */
function builderHomemapClickTarget(element, getStepper, currentTarget) {
  var card = element.closest && element.closest('.pt-homemap[data-dv-panel]');
  var section = card && card.closest('.doc-sec[data-dv-section]');
  if (!section) return null;
  var explicitLayout = element.closest('[data-home-layout]');
  if (
    !explicitLayout &&
    element.closest('a, button, summary, [role="button"], input, select, textarea')
  )
    return null;
  var ordinal = Number(section.getAttribute('data-dv-section')),
    index = Number(card.getAttribute('data-dv-panel'));
  if (!Number.isInteger(ordinal) || !Number.isInteger(index)) return null;
  var player = getStepper(ordinal);
  var editingLayout =
    currentTarget &&
    currentTarget.kind === 'panel' &&
    currentTarget.section === ordinal &&
    currentTarget.index === index;
  var marker = element.closest('[data-device], [data-subject], [data-home-room]');
  if (!explicitLayout && !editingLayout && marker && player && player.mode() === 'step')
    return { section: ordinal, kind: 'step', index: player.sourceIndex() };
  return { section: ordinal, kind: 'panel', index: index, el: card };
}

/* Read both snapshots through the engine, following the selected branch.
   Removing one authored key restores its inherited value, never a copied
   snapshot that would freeze unrelated devices or people. */
function builderHomemapStep(d, stepIndex, panelId, pathId) {
  var panel = (d.panels || []).find(function (p) {
    return p && p.id === panelId && p.type === 'homemap';
  });
  var route =
    diagramPathList(d).find(function (p) {
      return p.id === pathId && p.indices.indexOf(stepIndex) >= 0;
    }) ||
    diagramPathList(d).find(function (p) {
      return p.indices.indexOf(stepIndex) >= 0;
    });
  if (!panel || !route) return { error: 'Select a homemap and a step in this path.' };
  var localIndex = route.indices.indexOf(stepIndex),
    active = diagramForPath(d, route.id);
  var states = foldHomemapStates(panel, active.steps),
    state = states[localIndex];
  var initial = Object.assign(Object.create(null), panel.initial || {}, { signals: [] });
  var patch = (stepPanelPatch(d.steps[stepIndex]) || {})[panelId] || {};
  return {
    panel: panel,
    patch: patch,
    state: state,
    position: localIndex,
    model: homemapModel(panel, state),
    before: homemapModel(panel, localIndex ? states[localIndex - 1] : initial),
  };
}

/* Shared geometry edits never write step patches or move room occupants. */
function planHomemapLayoutPosition(text, raw, sectionIdx, panelId, kind, key, point) {
  var got = builderDiagram(text, raw, sectionIdx);
  if (got.error) return got;
  var panels = got.d.panels || [],
    pi = panels.findIndex(function (p) {
      return p && p.id === panelId && p.type === 'homemap';
    });
  if (pi < 0) return { error: 'Homemap not found — reselect and try again.' };
  var panel = panels[pi],
    index = -1,
    item,
    list;
  var panelPath = got.path.concat(['panels', pi]);
  if (kind === 'outline') {
    if (!homemapSubjectPosition(point)) return { error: 'Choose a finite house position.' };
    item = Object.assign({}, panel.outline, homemapModel(panel).outline, point);
    if (
      !homemapSubjectPosition(item) ||
      !isFiniteNum(item.w) ||
      !isFiniteNum(item.h) ||
      item.w < 20 ||
      item.h < 20 ||
      item.x < 0 ||
      item.y < 0 ||
      item.x + item.w > 320 ||
      item.y + item.h > 180
    )
      return { error: 'Keep the house inside the frame, at least 20×20.' };
    return planSetField(text, raw, panelPath, 'outline', JSON.stringify(item));
  }
  if (kind === 'device') {
    list = 'devices';
    if (
      homemapModel(panel).devices.some(function (d) {
        return d.id === key;
      })
    )
      index = panel.devices.findIndex(function (d) {
        return d && d.id === key;
      });
  } else if (kind === 'room') {
    list = 'rooms';
    if (
      Number.isInteger(key) &&
      Array.isArray(panel.rooms) &&
      homemapRooms(panel).indexOf(panel.rooms[key]) >= 0
    )
      index = key;
  } else if (kind === 'subject') {
    list = 'subjects';
    if (
      homemapSubjects(panel).some(function (s) {
        return s.id === key;
      })
    )
      index = panel.subjects.findIndex(function (s) {
        return s && s.id === key;
      });
  }
  if (index < 0) return { error: 'Choose an existing device, room, or subject.' };
  item = panel[list][index];
  var resize = kind === 'room' && point && (point.w !== undefined || point.h !== undefined);
  var w = resize ? point.w : item.w,
    h = resize ? point.h : item.h;
  if (resize && (!isFiniteNum(w) || !isFiniteNum(h) || w <= 0 || h <= 0))
    return { error: 'Rooms need a positive width and height.' };
  var maxX = 320 - (kind === 'room' ? w : 0),
    maxY = 180 - (kind === 'room' ? h : 0);
  if (
    !homemapSubjectPosition(point) ||
    point.x < 0 ||
    point.y < 0 ||
    point.x > maxX ||
    point.y > maxY
  )
    return { error: 'Keep the whole item inside the 320×180 map.' };
  var fields = [
    ['x', JSON.stringify(point.x)],
    ['y', JSON.stringify(point.y)],
  ];
  if (resize) fields.push(['w', JSON.stringify(w)], ['h', JSON.stringify(h)]);
  var plan = planSetFields(text, raw, panelPath.concat([list, index]), fields);
  if (
    !plan.error &&
    kind === 'subject' &&
    panel.initial &&
    homemapSubjectPosition(panel.initial[key])
  )
    return planSetFields(
      plan.text,
      JSON.parse(plan.text),
      panelPath.concat(['initial', key]),
      fields
    );
  return plan;
}

function builderHomemapLayoutDrag(item, start, at, resize, minimum) {
  var dx = at.x - start.x,
    dy = at.y - start.y;
  if (resize)
    return {
      x: item.x,
      y: item.y,
      w: clamp(Math.round(item.w + dx), minimum || 1, 320 - item.x),
      h: clamp(Math.round(item.h + dy), minimum || 1, 180 - item.y),
    };
  return {
    x: clamp(Math.round(item.x + dx), 0, 320 - (item.w || 0)),
    y: clamp(Math.round(item.y + dy), 0, 180 - (item.h || 0)),
  };
}

function builderHomemapLayoutScene(panel) {
  var state = Object.assign(Object.create(null), panel.initial || {}),
    hidden = [];
  var model = homemapModel(panel, state);
  model.subjects.forEach(function (s) {
    if (s.hidden) hidden.push(s.id);
    state[s.id] = { x: s.x, y: s.y }; /* hidden subjects still have draggable starting positions */
  });
  return { state: state, model: homemapModel(panel, state), hidden: hidden };
}

/* Change one device attribute without capturing the inherited other attribute. */
function planHomemapDeviceAttribute(
  text,
  raw,
  sectionIdx,
  stepIdx,
  panelId,
  key,
  attribute,
  value
) {
  if (['state', 'thermal'].indexOf(attribute) < 0) return { error: 'Unknown device attribute.' };
  var got =
    stepIdx === null
      ? builderDiagram(text, raw, sectionIdx)
      : builderStepAt(raw, sectionIdx, stepIdx);
  if (!got || got.error) return got || { error: 'Step not found.' };
  var pi = (got.d.panels || []).findIndex(function (p) {
    return p && p.type === 'homemap' && p.id === panelId;
  });
  if (pi < 0) return { error: 'Homemap not found.' };
  var panel = got.d.panels[pi],
    device = (panel.devices || []).find(function (d) {
      return homemapDeviceValid(d) && d.id === key;
    });
  if (!device) return { error: 'Device not found.' };
  var allowed = attribute === 'state' ? HOMEMAP_STATES[device.kind] : HOMEMAP_THERMAL;
  if (value !== undefined && allowed.indexOf(value) < 0)
    return { error: 'Choose a valid ' + attribute + '.' };
  var patch = stepIdx === null ? panel.initial : (stepPanelPatch(got.st) || {})[panelId];
  var current = patch && patch[key];
  var next = panelObject(current)
    ? Object.assign({}, current)
    : typeof current === 'string'
    ? { state: current }
    : {};
  if (value === undefined) delete next[attribute];
  else next[attribute] = value;
  var result = Object.keys(next).length ? next : undefined;
  if (stepIdx !== null)
    return planStepHomemapField(text, raw, sectionIdx, stepIdx, panelId, key, result);
  return builderRewrite(text, raw, got.path.concat(['panels', pi]), function (p) {
    var initial = Object.assign(Object.create(null), p.initial || {});
    if (result === undefined) delete initial[key];
    else initial[key] = result;
    if (Object.keys(initial).length) p.initial = initial;
    else delete p.initial;
  });
}
function planStepHomemapField(text, raw, sectionIdx, stepIdx, panelId, key, value) {
  var got = builderStepAt(raw, sectionIdx, stepIdx);
  if (!got) return { error: 'Step not found — reselect and try again.' };
  var p = (got.d.panels || []).find(function (p) {
    return p && p.id === panelId && p.type === 'homemap';
  });
  if (!p) return { error: 'Homemap not found — reselect and try again.' };
  var model = homemapModel(p),
    device = model.devices.find(function (d) {
      return d.id === key;
    });
  var subject = model.subjects.find(function (s) {
    return s.id === key;
  });
  if (!device && !subject && key !== 'signals') return { error: 'Unknown homemap field.' };
  if (value !== undefined) {
    if (device && !homemapDevicePatchValid(device.kind, value))
      return { error: 'Choose a valid device state or thermal condition.' };
    if (
      subject &&
      value !== null &&
      (!homemapSubjectPosition(value) ||
        value.x < 0 ||
        value.x > 320 ||
        value.y < 0 ||
        value.y > 180)
    )
      return { error: 'Use a position within the map: x 0–320, y 0–180.' };
    if (
      key === 'signals' &&
      (!Array.isArray(value) ||
        value.some(function (s) {
          return (
            !s ||
            !model.devices.some(function (d) {
              return d.id === s.from;
            }) ||
            !model.devices.some(function (d) {
              return d.id === s.to;
            })
          );
        }))
    )
      return { error: 'Each signal needs two existing devices.' };
  }
  return builderRewrite(text, raw, got.path, function (st) {
    var containerKey =
      st.panels && typeof st.panels === 'object' && !Array.isArray(st.panels)
        ? 'panels'
        : st.patch && typeof st.patch === 'object' && !Array.isArray(st.patch)
        ? 'patch'
        : 'panels';
    var panels = Object.assign(Object.create(null), st[containerKey] || {});
    var patch = Object.assign(Object.create(null), panels[panelId] || {});
    if (value === undefined) delete patch[key];
    else patch[key] = value;
    if (Object.keys(patch).length) panels[panelId] = patch;
    else delete panels[panelId];
    if (Object.keys(panels).length) st[containerKey] = panels;
    else delete st[containerKey];
  });
}

PanelRegistry.extend('homemap', {
  authoring: {
    template: {
      title: 'Home',
      outline: { w: 300, h: 164 },
      devices: [
        {
          id: 'cam1',
          kind: 'camera',
          label: 'Porch cam',
          x: 46,
          y: 40,
          facing: 35,
          spread: 80,
          range: 70,
        },
        {
          id: 'cam2',
          kind: 'camera',
          label: 'Yard cam',
          x: 274,
          y: 40,
          facing: 145,
          spread: 80,
          range: 70,
        },
        { id: 'door', kind: 'entry', label: 'Front door', x: 160, y: 158 },
        { id: 'attic', kind: 'sensor', label: 'Attic temp', icon: 'thermo', x: 46, y: 132 },
        { id: 'hub', kind: 'hub', label: 'Hub', x: 160, y: 92 },
      ],
      subjects: [{ id: 'walker', label: 'Visitor', x: 20, y: 150 }],
      initial: { cam1: 'scan', cam2: 'sleep', door: 'closed', attic: 'ok', hub: 'idle' },
    },
    setupFields: [
      [
        'outline',
        'objf',
        {
          cols: [
            { k: 'w', kind: 'num', label: 'Width' },
            { k: 'h', kind: 'num', label: 'Height' },
            { k: 'x', kind: 'num', label: 'Left (auto)' },
            { k: 'y', kind: 'num', label: 'Top (auto)' },
          ],
          hint: 'Floor plan: width 20–320, height 20–180. Blank left/top centers the house. Rooms and devices keep their coordinates. Press Enter or leave a field to save.',
        },
      ],
      [
        'rooms',
        'rows',
        {
          cols: [
            { k: 'label' },
            { k: 'kind', kind: 'enum', options: ['room', 'outdoor'] },
            { k: 'x', kind: 'num', req: true },
            { k: 'y', kind: 'num', req: true },
            { k: 'w', kind: 'num', req: true },
            { k: 'h', kind: 'num', req: true },
          ],
        },
      ],
      [
        'devices',
        'rows',
        {
          cols: [
            { k: 'id', req: true },
            { k: 'kind', kind: 'enum', options: ['camera', 'entry', 'sensor', 'hub'] },
            { k: 'display', kind: 'enum', options: ['marker', 'door'] },
            { k: 'label' },
            { k: 'x', kind: 'num', req: true },
            { k: 'y', kind: 'num', req: true },
            { k: 'facing', kind: 'num' },
            { k: 'spread', kind: 'num' },
            { k: 'range', kind: 'num' },
            { k: 'icon', kind: 'icon' },
            { k: 'doorWidth', kind: 'num' },
            { k: 'doorSwing', kind: 'num' },
          ],
          max: 12,
        },
      ],
      [
        'subjects',
        'rows',
        {
          cols: [
            { k: 'id', req: true },
            { k: 'label' },
            { k: 'x', kind: 'num', req: true },
            { k: 'y', kind: 'num', req: true },
            { k: 'icon', kind: 'icon' },
          ],
          max: 6,
        },
      ],
      ['initial', 'json'],
    ],
    patchFields: [['signals', 'jsonArr']],
    picker: {
      order: 14,
      name: 'Home map',
      category: 'Places & sensing',
      tagline: 'Put the story in a place',
      description:
        'Arrange rooms, devices, doors, and people on a shared map, then change their states step by step.',
    },
    expandPatchFields: function (decl) {
      var vocab = {
        camera: ['sleep', 'scan', 'detect', 'rec', 'off'],
        entry: ['closed', 'open', 'alert'],
        sensor: ['ok', 'warn', 'alert', 'off'],
        hub: ['idle', 'rx', 'tx', 'alert'],
      };
      var seen = Object.create(null);
      var fields = (Array.isArray(decl.devices) ? decl.devices : [])
        .filter(function (d) {
          if (!d || typeof d.id !== 'string' || !d.id || seen[d.id]) return false;
          seen[d.id] = true;
          return (
            d.id !== 'signals' &&
            typeof d.kind === 'string' &&
            Object.prototype.hasOwnProperty.call(vocab, d.kind) &&
            typeof d.x === 'number' &&
            isFinite(d.x) &&
            typeof d.y === 'number' &&
            isFinite(d.y)
          );
        })
        .map(function (d) {
          return [d.id, 'jsonAny'];
        });
      (Array.isArray(decl.subjects) ? decl.subjects : []).forEach(function (sub) {
        if (!sub || typeof sub.id !== 'string' || !sub.id || seen[sub.id]) return;
        seen[sub.id] = true;
        if (
          sub.id === 'signals' ||
          typeof sub.x !== 'number' ||
          !isFinite(sub.x) ||
          typeof sub.y !== 'number' ||
          !isFinite(sub.y)
        )
          return;
        fields.push([sub.id, 'json', { nullable: true }]);
      });
      return fields.concat([['signals', 'jsonArr']]);
    },
    origin: function (p, key, snapshot, context) {
      var assignment = context.assignment,
        history = context.history,
        input = context.input,
        own = context.own;
      if (key === 'signals') {
        var signalPatch = context.currentPatch;
        return own(signalPatch, key)
          ? {
              kind: 'transient',
              label: 'This step only',
              inputs: [input(context.stepIndex, key, false)],
            }
          : { kind: 'engine', label: 'No signals at this step', inputs: [] };
      }
      var subject = homemapSubjects(p).some(function (s) {
        return s.id === key;
      });
      if (!subject && panelObject(snapshot[key]))
        return history([key], true, 'Device state + thermal history');
      return assignment(
        key,
        subject
          ? function (v) {
              return v === null || homemapSubjectPosition(v);
            }
          : null,
        false
      );
    },
    editor: function (context) {
      var homeElementFolds = Object.create(null);
      function listen(target,type,fn,options){
        if(context.listen)return context.listen(target,type,fn,options);
        target.addEventListener(type,fn,options);
      }
      function homemapLayoutControl(panel, target) {
        var box = document.createElement('fieldset');
        box.className = 'home-edit';
        var legend = document.createElement('legend');
        legend.textContent = 'Shared layout · drag to arrange';
        box.appendChild(legend);
        var hint = document.createElement('p');
        hint.className = 'home-note';
        hint.textContent =
          'Drag rooms, devices, doors, or people. Drag the House grip to move the outline; drag square corners to resize it or a room. Faded people start hidden. Changes apply across all paths; step overrides stay intact. Escape cancels.';
        box.appendChild(hint);
        var copyTools = document.createElement('div');
        copyTools.className = 'story-actions';
        var picked = null,
          pickLabel = document.createElement('span');
        pickLabel.className = 'home-note';
        pickLabel.textContent = 'Select an element to copy or duplicate.';
        copyTools.appendChild(pickLabel);
        var copyItem = context.controls.action('Copy element', function () {
          if (picked && context.clipboard()) context.clipboard().copy([picked]);
        });
        var duplicateItem = context.controls.action('Duplicate element', function () {
          if (picked && context.clipboard()) context.clipboard().duplicate([picked]);
        });
        copyItem.disabled = duplicateItem.disabled = true;
        copyTools.appendChild(copyItem);
        copyTools.appendChild(duplicateItem);
        box.appendChild(copyTools);
        var map = document.createElement('div');
        map.className = 'home-edit-map home-layout-map sk-daylight';
        map.tabIndex = 0;
        map.setAttribute('aria-label', 'Shared home layout placement map');
        box.appendChild(map);
        var scene = builderHomemapLayoutScene(panel),
          indexedText = context.source(),
          moving = null;
        function mark(svg, kind, key, x, y, resize) {
          var rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          rect.setAttribute('class', resize ? 'home-resize-handle' : 'home-outline-grip');
          rect.setAttribute('x', x - (resize ? 3 : 12));
          rect.setAttribute('y', y * HOMEMAP_Y_SCALE - (resize ? 3 : 5));
          rect.setAttribute('width', resize ? 6 : 24);
          rect.setAttribute('height', resize ? 6 : 10);
          rect.setAttribute('rx', '1');
          rect.setAttribute(kind === 'outline' ? 'data-home-outline' : 'data-home-room', key);
          if (resize) rect.setAttribute('data-home-resize', '');
          var title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
          title.textContent =
            (resize ? 'Resize ' : 'Move ') +
            (kind === 'outline' ? 'house outline' : panel.rooms[key].label || 'room');
          rect.appendChild(title);
          svg.appendChild(rect);
          if (!resize) {
            var label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            label.setAttribute('class', 'home-outline-grip-label');
            label.setAttribute('x', x);
            label.setAttribute('y', y * HOMEMAP_Y_SCALE + 1.7);
            label.setAttribute('text-anchor', 'middle');
            label.textContent = '↔ House';
            svg.appendChild(label);
          }
        }
        function paint(move) {
          var preview = panel,
            state = scene.state;
          if (move) {
            preview = Object.assign({}, panel);
            if (move.kind === 'outline')
              preview.outline = Object.assign({}, scene.model.outline, move.point);
            else {
              var list =
                move.kind === 'device' ? 'devices' : move.kind === 'room' ? 'rooms' : 'subjects';
              preview[list] = panel[list].map(function (item, i) {
                return i === move.index ? Object.assign({}, item, move.point) : item;
              });
              if (move.kind === 'subject') {
                state = Object.assign(Object.create(null), state);
                state[move.key] = move.point;
              }
            }
          }
          /* Decorations are editor-only and change as the outline/rooms move. */
          map._lastHTML = null;
          renderPanelBody(map, preview, state, 'daylight', [], -1, false);
          var svg = map.querySelector('svg.hmframe');
          if (!svg) return;
          var outline = homemapModel(preview).outline;
          svg.querySelector('.hmoutline').setAttribute('data-home-outline', '');
          homemapRooms(preview).forEach(function (r) {
            mark(svg, 'room', preview.rooms.indexOf(r), r.x + r.w, r.y + r.h, true);
          });
          mark(svg, 'outline', '', outline.x + outline.w, outline.y + outline.h, true);
          mark(svg, 'outline', '', outline.x + outline.w / 2, Math.max(5, outline.y - 5), false);
          Array.prototype.forEach.call(svg.querySelectorAll('[data-subject]'), function (el) {
            if (scene.hidden.indexOf(el.getAttribute('data-subject')) >= 0)
              el.classList.add('home-start-hidden');
          });
        }
        function eventPoint(ev) {
          var svg = map.querySelector('svg'),
            matrix = svg && svg.getScreenCTM();
          if (!matrix) return null;
          var point = svg.createSVGPoint();
          point.x = ev.clientX;
          point.y = ev.clientY;
          return homemapPointFromDisplay(point.matrixTransform(matrix.inverse()));
        }
        function cancel() {
          if (!moving) return;
          var id = moving.pointer;
          moving = null;
          map.classList.remove('moving');
          paint(null);
          if (map.hasPointerCapture(id)) map.releasePointerCapture(id);
        }
        if(context.onFormRetire)context.onFormRetire(function(){cancel();cancelPanelMotion(map);});
        listen(map,'pointerdown', function (ev) {
          if (ev.button !== 0) return;
          var el = ev.target.closest(
            '[data-device],[data-subject],[data-home-room],[data-home-outline]'
          );
          if (!el) return;
          var kind, key, item, index;
          if (el.hasAttribute('data-home-outline')) {
            kind = 'outline';
            key = '';
            item = scene.model.outline;
          } else if (el.hasAttribute('data-home-room')) {
            kind = 'room';
            key = index = Number(el.getAttribute('data-home-room'));
            item = panel.rooms[index];
          } else {
            kind = el.hasAttribute('data-device') ? 'device' : 'subject';
            key = el.getAttribute('data-' + kind);
            var list = kind === 'device' ? 'devices' : 'subjects';
            item = scene.model[list].find(function (d) {
              return d.id === key;
            });
            index = panel[list].findIndex(function (d) {
              return d && d.id === key;
            });
          }
          var start = eventPoint(ev);
          if (!item || !start) return;
          if (kind !== 'outline') {
            picked = {
              kind: 'home',
              section: target.section,
              index: target.index,
              field: kind === 'device' ? 'devices' : kind === 'room' ? 'rooms' : 'subjects',
              item: index,
            };
            context.selectClipboard(picked);
            pickLabel.textContent = item.label || item.id || 'Room';
            copyItem.disabled = duplicateItem.disabled = false;
          } else {
            picked = null;
            if(context.clearClipboard)context.clearClipboard();
            copyItem.disabled = duplicateItem.disabled = true;
            pickLabel.textContent = 'House outline';
          }
          ev.preventDefault();
          map.focus({ preventScroll: true });
          map.setPointerCapture(ev.pointerId);
          moving = {
            kind: kind,
            key: key,
            item: item,
            index: index,
            start: start,
            pointer: ev.pointerId,
            resize: el.hasAttribute('data-home-resize'),
            changed: false,
          };
          map.classList.add('moving');
        });
        listen(map,'pointermove', function (ev) {
          if (!moving || ev.pointerId !== moving.pointer) return;
          var at = eventPoint(ev);
          if (!at) return;
          moving.point = builderHomemapLayoutDrag(
            moving.item,
            moving.start,
            at,
            moving.resize,
            moving.kind === 'outline' ? 20 : 1
          );
          moving.changed = Object.keys(moving.point).some(function (k) {
            return moving.point[k] !== moving.item[k];
          });
          paint(moving);
        });
        listen(map,'pointerup', function (ev) {
          if (!moving || ev.pointerId !== moving.pointer) return;
          var done = moving;
          cancel();
          if (!done.changed) return;
          if (context.source() !== indexedText) {
            context.error('The source changed. Reselect this home before moving its layout.');
            return;
          }
          if (context.editingBlocked()) {
            context.error('Finish ADD TO STEP before editing the layout.');
            return;
          }
          context.transact(
            function (raw) {
              return planHomemapLayoutPosition(
                context.source(),
                raw,
                target.section,
                panel.id,
                done.kind,
                done.key,
                done.point
              );
            },
            {
              after: function () {
                context.inspect();
              },
            }
          );
        });
        listen(map,'pointercancel', cancel);
        listen(map,'lostpointercapture', cancel);
        listen(map,'keydown', function (ev) {
          if (ev.key === 'Escape' && moving) {
            ev.preventDefault();
            ev.stopPropagation();
            cancel();
          }
        });
        paint(null);
        return box;
      }
      function homemapStepControl(diagram, panel, target) {
        var box = document.createElement('fieldset');
        box.className = 'home-edit';
        var title = document.createElement('legend');
        title.textContent = (panel.title || panel.id) + ' · at this step';
        box.appendChild(title);
        box.appendChild(
          context.controls.action('Edit shared home layout', function () {
            context.select(
              { section: target.section, kind: 'panel', index: diagram.panels.indexOf(panel) },
              false
            );
            context.rehighlight();
          })
        );
        var sp = context.stepper(target.section);
        var snapshot = builderHomemapStep(
          diagram,
          target.index,
          panel.id,
          target.pathId || (sp && sp.path())
        );
        if (snapshot.error) {
          box.textContent = snapshot.error;
          return box;
        }
        var indexedText = context.source(),
          own = function (k) {
            return Object.prototype.hasOwnProperty.call(snapshot.patch, k);
          };
        function commit(key, value, layoutKind, attribute) {
          if (context.source() !== indexedText) {
            context.error('The source changed. Reselect this step before editing its map.');
            return false;
          }
          if (context.editingBlocked()) {
            context.error('Finish ADD TO STEP before editing the map.');
            return false;
          }
          return context.transact(
            function (raw) {
              if (layoutKind)
                return planHomemapLayoutPosition(
                  context.source(),
                  raw,
                  target.section,
                  panel.id,
                  layoutKind,
                  key,
                  value
                );
              if (attribute)
                return planHomemapDeviceAttribute(
                  context.source(),
                  raw,
                  target.section,
                  target.index,
                  panel.id,
                  key,
                  attribute,
                  value
                );
              return planStepHomemapField(
                context.source(),
                raw,
                target.section,
                target.index,
                panel.id,
                key,
                value
              );
            },
            {
              after: function () {
                context.inspect();
              },
            }
          );
        }
        function note(text, parent) {
          var el = document.createElement('p');
          el.className = 'home-note';
          el.textContent = text;
          (parent || box).appendChild(el);
          return el;
        }
        function button(label, action) {
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'bbtn';
          b.textContent = label;
          listen(b,'click', action);
          return b;
        }
        function choice(pairs, value, label, action) {
          var select = document.createElement('select');
          select.className = 'fctl';
          select.setAttribute('aria-label', label);
          pairs.forEach(function (pair) {
            var o = document.createElement('option');
            o.value = pair[0];
            o.textContent = pair[1];
            select.appendChild(o);
          });
          select.value = value;
          listen(select,'change', function () {
            action(select.value);
          });
          return select;
        }
        note(
          'Operating state and temperature condition carry independently. Inherit removes only that attribute at this step. Subject positions carry; signals last for this step only.'
        );
        var body = document.createElement('div');
        body.className = 'home-edit-body';
        box.appendChild(body);
        var map = document.createElement('div');
        map.className = 'home-edit-map sk-daylight';
        map.tabIndex = 0;
        map.setAttribute('aria-label', 'Home step placement map');
        body.appendChild(map);
        renderPanelBody(map, panel, snapshot.state, 'daylight', [], snapshot.position, false);
        var fields = document.createElement('div');
        fields.className = 'home-edit-fields';
        body.appendChild(fields);
        var deviceControls = Object.create(null),
          subjectControls = Object.create(null);
        snapshot.model.devices.forEach(function (d, i) {
          var before = snapshot.before.devices[i];
          var pairs = [['', 'Inherit · ' + before.state]].concat(
            HOMEMAP_STATES[d.kind].map(function (v) {
              return [v, v];
            })
          );
          var ownPatch = snapshot.patch[d.id];
          var hasState =
            own(d.id) &&
            (!panelObject(ownPatch) || Object.prototype.hasOwnProperty.call(ownPatch, 'state'));
          var ctl = choice(pairs, hasState ? d.state : '', d.label + ' state', function (v) {
            commit(d.id, v === '' ? undefined : v, null, 'state');
          });
          deviceControls[d.id] = ctl;
          fields.appendChild(context.controls.row(d.label, ctl));
          var thermalPairs = [['', 'Inherit · ' + before.thermal]].concat(
            HOMEMAP_THERMAL.map(function (v) {
              return [v, v];
            })
          );
          fields.appendChild(
            context.controls.row(
              'Temperature',
              choice(
                thermalPairs,
                panelObject(ownPatch) && Object.prototype.hasOwnProperty.call(ownPatch, 'thermal')
                  ? d.thermal
                  : '',
                d.label + ' temperature',
                function (v) {
                  commit(d.id, v === '' ? undefined : v, null, 'thermal');
                }
              )
            )
          );
        });
        var armedSubject = null;
        var placementHint =
          'Drag devices or room borders/labels to change the layout for all steps. Rooms move independently of their contents. Click a device to edit its state.';
        var placementNote = note(placementHint, fields);
        snapshot.model.subjects.forEach(function (sub, i) {
          var group = document.createElement('div');
          group.className = 'home-subject';
          fields.appendChild(group);
          var before = snapshot.before.subjects[i];
          var visibility = choice(
            [
              ['inherit', 'Inherit · ' + (before.hidden ? 'hidden' : before.x + ', ' + before.y)],
              ['show', 'Show at this position'],
              ['hide', 'Hidden'],
            ],
            own(sub.id) ? (sub.hidden ? 'hide' : 'show') : 'inherit',
            sub.label + ' visibility',
            function (v) {
              commit(
                sub.id,
                v === 'inherit' ? undefined : v === 'hide' ? null : { x: sub.x, y: sub.y }
              );
            }
          );
          group.appendChild(context.controls.row(sub.label, visibility));
          var xy = document.createElement('div');
          xy.className = 'home-xy';
          group.appendChild(xy);
          ['x', 'y'].forEach(function (k) {
            var input = context.controls.number(sub[k], function (v) {
              if (v == null) {
                context.error('Enter a coordinate, or choose Inherit.');
                return false;
              }
              var pos = { x: sub.x, y: sub.y };
              pos[k] = v;
              return commit(sub.id, pos);
            });
            input.setAttribute('aria-label', sub.label + ' ' + k);
            xy.appendChild(context.controls.row(k, input));
          });
          var place = button('Place ' + sub.label, function () {
            armedSubject = armedSubject === sub.id ? null : sub.id;
            Object.keys(subjectControls).forEach(function (id) {
              subjectControls[id].setAttribute(
                'aria-pressed',
                id === armedSubject ? 'true' : 'false'
              );
            });
            map.classList.toggle('placing', armedSubject !== null);
            placementNote.textContent =
              armedSubject === null
                ? 'Placement cancelled.'
                : 'Tap the map to place ' + sub.label + '. Escape cancels.';
          });
          place.setAttribute('aria-pressed', 'false');
          subjectControls[sub.id] = place;
          group.appendChild(place);
        });
        if (snapshot.model.subjects.length)
          placementNote.textContent =
            'Drag a person, or choose Place and tap this map, to move them at this step. ' +
            placementHint;
        function eventPoint(ev) {
          var svg = map.querySelector('svg'),
            matrix = svg && svg.getScreenCTM();
          if (!matrix) return null;
          var p = svg.createSVGPoint();
          p.x = ev.clientX;
          p.y = ev.clientY;
          p = p.matrixTransform(matrix.inverse());
          return homemapPointFromDisplay(p);
        }
        var moving = null,
          swallowClick = false;
        function previewMove(move) {
          var previewPanel = panel,
            state = snapshot.state;
          if (move && move.kind === 'subject') {
            state = Object.assign(Object.create(null), state);
            state[move.key] = move.point;
          } else if (move) {
            previewPanel = Object.assign({}, panel);
            var list = move.kind === 'device' ? 'devices' : 'rooms';
            previewPanel[list] = panel[list].map(function (item, i) {
              return i === move.index ? Object.assign({}, item, move.point) : item;
            });
          }
          renderPanelBody(map, previewPanel, state, 'daylight', [], snapshot.position, false);
        }
        function cancelMove() {
          if (!moving) return;
          var pointer = moving.pointer;
          moving = null;
          map.classList.remove('moving');
          previewMove(null);
          if (map.hasPointerCapture(pointer)) map.releasePointerCapture(pointer);
        }
        if(context.onFormRetire)context.onFormRetire(function(){cancelMove();armedSubject=null;map.classList.remove('placing');cancelPanelMotion(map);});
        listen(map,'pointerdown', function (ev) {
          if (ev.button !== 0 || armedSubject !== null) return;
          var el = ev.target.closest('[data-subject], [data-device], [data-home-room]');
          if (!el) return;
          var kind, key, item, index;
          if (el.hasAttribute('data-subject')) {
            kind = 'subject';
            key = el.getAttribute('data-subject');
            item = snapshot.model.subjects.find(function (s) {
              return s.id === key;
            });
          } else if (el.hasAttribute('data-device')) {
            kind = 'device';
            key = el.getAttribute('data-device');
            item = snapshot.model.devices.find(function (d) {
              return d.id === key;
            });
            index = panel.devices.findIndex(function (d) {
              return d && d.id === key;
            });
          } else {
            kind = 'room';
            key = index = Number(el.getAttribute('data-home-room'));
            item = panel.rooms[index];
          }
          var at = eventPoint(ev);
          if (!item || !at) return;
          ev.preventDefault();
          map.focus({ preventScroll: true });
          map.setPointerCapture(ev.pointerId);
          moving = {
            kind: kind,
            key: key,
            index: index,
            item: item,
            start: at,
            point: { x: item.x, y: item.y },
            pointer: ev.pointerId,
            changed: false,
          };
          map.classList.add('moving');
        });
        listen(map,'pointermove', function (ev) {
          if (!moving || ev.pointerId !== moving.pointer) return;
          var at = eventPoint(ev);
          if (!at) return;
          var maxX = 320 - (moving.kind === 'room' ? moving.item.w : 0),
            maxY = 180 - (moving.kind === 'room' ? moving.item.h : 0);
          moving.point = {
            x: Math.max(0, Math.min(maxX, Math.round(moving.item.x + at.x - moving.start.x))),
            y: Math.max(0, Math.min(maxY, Math.round(moving.item.y + at.y - moving.start.y))),
          };
          moving.changed = moving.point.x !== moving.item.x || moving.point.y !== moving.item.y;
          previewMove(moving);
        });
        listen(map,'pointerup', function (ev) {
          if (!moving || ev.pointerId !== moving.pointer) return;
          var done = moving;
          cancelMove();
          if (done.changed) {
            swallowClick = true;
            commit(done.key, done.point, done.kind === 'subject' ? null : done.kind);
          }
        });
        listen(map,'pointercancel', cancelMove);
        listen(map,'lostpointercapture', cancelMove);
        listen(box,'keydown', function (ev) {
          if (ev.key !== 'Escape') return;
          if (moving || armedSubject !== null) {
            ev.preventDefault();
            ev.stopPropagation();
            cancelMove();
            armedSubject = null;
            map.classList.remove('placing');
            Object.keys(subjectControls).forEach(function (id) {
              subjectControls[id].setAttribute('aria-pressed', 'false');
            });
            placementNote.textContent = 'Placement cancelled.';
          }
        });
        listen(map,'click', function (ev) {
          if (swallowClick) {
            swallowClick = false;
            return;
          }
          if (armedSubject !== null) {
            var at = eventPoint(ev);
            if (at) commit(armedSubject, at);
            return;
          }
          var device = ev.target.closest('[data-device]'),
            subject = ev.target.closest('[data-subject]');
          if (device && deviceControls[device.getAttribute('data-device')])
            deviceControls[device.getAttribute('data-device')].focus();
          else if (subject && subjectControls[subject.getAttribute('data-subject')])
            subjectControls[subject.getAttribute('data-subject')].click();
        });
        note('Signals · this step only', fields);
        snapshot.model.signals.forEach(function (sig, i) {
          var row = document.createElement('div');
          row.className = 'home-signal';
          var label = document.createElement('span');
          label.textContent =
            snapshot.model.devices.find(function (d) {
              return d.id === sig.from;
            }).label +
            ' → ' +
            snapshot.model.devices.find(function (d) {
              return d.id === sig.to;
            }).label;
          row.appendChild(label);
          row.appendChild(
            button('Remove', function () {
              var signals = snapshot.model.signals
                .filter(function (_, n) {
                  return n !== i;
                })
                .map(function (s) {
                  return { from: s.from, to: s.to };
                });
              commit('signals', signals.length ? signals : undefined);
            })
          );
          fields.appendChild(row);
        });
        if (snapshot.model.devices.length > 1) {
          var endpoints = snapshot.model.devices.map(function (d) {
            return [d.id, d.label];
          });
          var from = choice(endpoints, endpoints[0][0], 'Signal from', function () {});
          var to = choice(endpoints, endpoints[1][0], 'Signal to', function () {});
          fields.appendChild(context.controls.row('Signal from', from));
          fields.appendChild(context.controls.row('Signal to', to));
          fields.appendChild(
            button('Add signal', function () {
              if (from.value === to.value) {
                context.error('Choose two different devices for a signal.');
                return;
              }
              var signals = snapshot.model.signals.map(function (s) {
                return { from: s.from, to: s.to };
              });
              if (
                !signals.some(function (s) {
                  return s.from === from.value && s.to === to.value;
                })
              )
                signals.push({ from: from.value, to: to.value });
              commit('signals', signals);
            })
          );
        }
        return box;
      }

      function homemapElementsControl(key, cur, shape) {
        var identity = JSON.stringify([context.target().section, context.target().index, key]);
        var state =
          homeElementFolds[identity] || (homeElementFolds[identity] = { open: false, items: [] });
        var group = document.createElement('details');
        group.className = 'home-elements';
        group.open = state.open;
        var summary = document.createElement('summary');
        summary.textContent =
          key[0].toUpperCase() + key.slice(1) + ' (' + (Array.isArray(cur) ? cur.length : 0) + ')';
        group.appendChild(summary);
        group.appendChild(context.controls.rows(key, cur, shape, homeRowOptions(key, state)));
        listen(group,'toggle', function () {
          if (group.isConnected) state.open = group.open;
        });
        return group;
      }

      function homeRowOptions(key, folds) {
        return {
          committed: function (refs) {
            folds.items = refs.map(function (ref) {
              return ref.fold.open;
            });
          },
          cell: function (info) {
            var col = info.column,
              input = info.input,
              cell = info.cell,
              ref = info.ref,
              base = info.base;
            if (col.kind !== 'icon') return false;

            cell.classList.add('home-icon-cell');
            var choice = document.createElement('span');
            choice.className = 'home-icon-choice';
            var preview = document.createElement('span');
            preview.className = 'home-icon-preview';
            preview.setAttribute('aria-hidden', 'true');
            var note = document.createElement('span');
            note.className = 'home-icon-note';
            input.setAttribute(
              'aria-label',
              ((base && (base.label || base.id)) || key.slice(0, -1)) + ' icon'
            );
            input.options[0].textContent =
              key === 'subjects' ? 'Default (person)' : 'Default (gear)';
            choice.appendChild(preview);
            choice.appendChild(input);
            cell.appendChild(choice);
            cell.appendChild(note);
            ref.syncIcon = function () {
              var subject = key === 'subjects',
                deviceKind = ref.inputs.kind && ref.inputs.kind.value;
              var editable = subject || deviceKind === 'sensor';
              input.disabled = !editable;
              choice.hidden = !editable;
              note.textContent = editable
                ? subject
                  ? 'Moving actor: person by default; choose an icon for a car or another subject.'
                  : 'Sensor also serves as a generic device marker. Choose cloud for a cloud service.'
                : (deviceKind === 'camera'
                    ? 'Cameras use a fixed camera icon.'
                    : deviceKind === 'hub'
                    ? 'Hubs use a fixed router icon.'
                    : deviceKind === 'entry'
                    ? 'Entry devices use the entry marker or door drawing.'
                    : 'Choose a device kind first.') + ' For a custom icon, choose kind sensor.';
              var icon = ICON_SET.indexOf(input.value) >= 0 ? input.value : 'gear';
              preview.innerHTML =
                subject && input.value === ''
                  ? '<svg viewBox="0 0 24 24"><circle cx="12" cy="7" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/></svg>'
                  : '<svg viewBox="0 0 24 24"><use href="#i-' + icon + '"/></svg>';
            };
            listen(input,'change', ref.syncIcon);

            return true;
          },
          actions: function (info) {
            var line = info.line,
              acts = info.actions,
              base = info.base,
              ref = info.ref;
            if (ref.syncIcon) {
              ref.syncIcon();
              if (ref.inputs.kind) listen(ref.inputs.kind,'change', ref.syncIcon);
            }
            if (base && context.clipboard()) {
              var homeTarget = {
                kind: 'home',
                section: context.target().section,
                index: context.target().index,
                field: key,
                item: info.index,
              };
              function rowClipboard(action) {
                var parsed = context.parse(),
                  path = parsed.error
                    ? null
                    : builderTargetPath(parsed.raw, {
                        kind: 'panel',
                        section: homeTarget.section,
                        index: homeTarget.index,
                      });
                var live = path && specValueAt(parsed.raw, path.concat([key, homeTarget.item]));
                if (JSON.stringify(live) !== JSON.stringify(base)) {
                  context.error('The element changed. Reselect it before copying.');
                  return;
                }
                context.selectClipboard(homeTarget);
                context.clipboard()[action]([homeTarget]);
              }
              acts.appendChild(
                info.button('Copy', 'Copy this Home element', function () {
                  rowClipboard('copy');
                })
              );
              acts.appendChild(
                info.button('Duplicate', 'Duplicate this Home element', function () {
                  rowClipboard('duplicate');
                })
              );
              listen(line,'focusin', function () {
                context.selectClipboard(homeTarget);
              });

              ref.clipboardTarget = homeTarget;
            }
          },
          wrapRow: function (info) {
            var line = info.line,
              ref = info.ref,
              base = info.base,
              index = info.index;
            var fold = document.createElement('details');
            fold.className = 'home-element';
            fold.open = !base || folds.items[index] === true;
            ref.fold = fold;
            var summary = document.createElement('summary');
            var name = document.createElement('span');
            name.className = 'home-element-name';
            var singular = key.slice(0, -1);
            name.textContent = base
              ? base.label ||
                base.id ||
                singular[0].toUpperCase() + singular.slice(1) + ' ' + (index + 1)
              : 'New ' + singular;
            var kind = document.createElement('span');
            kind.className = 'home-element-kind';
            kind.textContent =
              ' · ' +
              (base
                ? key === 'rooms'
                  ? base.kind || 'room'
                  : key === 'devices'
                  ? base.display === 'door'
                    ? 'door'
                    : base.kind || 'device'
                  : 'subject'
                : 'unsaved');
            summary.appendChild(name);
            summary.appendChild(kind);
            fold.appendChild(summary);
            fold.appendChild(line);
            if (ref.clipboardTarget)
              listen(summary,'click', function () {
                context.selectClipboard(ref.clipboardTarget);
              });
            listen(fold,'toggle', function () {
              if (fold.isConnected) folds.items[info.refs.indexOf(ref)] = fold.open;
            });
            return fold;
          },
        };
      }

      return {
        busy: function (view, guide) {
          return !!(
            view.querySelector('.home-edit-map.moving') ||
            (guide && guide.querySelector('.home-edit-map.moving'))
          );
        },
        stepControl: homemapStepControl,
        setupField: function (field, panel) {
          if (field[1] === 'rows')
            return homemapElementsControl(field[0], panel[field[0]], field[2] || { cols: [] });
        },
        setupRows: function (val, diagram, t, rows) {
          var layoutNote = document.createElement('p');
          layoutNote.className = 'home-note';
          layoutNote.textContent =
            'Shared home layout · all steps and paths. Set outline w/h for the floor plan size; edit rooms, devices, and starting subject positions below. Coordinates use a 320 × 180 frame.';
          rows.unshift(layoutNote);
          rows.push(
            context.controls.row(
              'Show subject labels',
              context.controls.select(
                ['Hidden (default)', 'Shown'],
                val.showSubjectLabels === true ? 'Shown' : 'Hidden (default)',
                function (v) {
                  return context.commit('showSubjectLabels', v === 'Shown' ? 'true' : null);
                }
              )
            )
          );
          var editStep = document.createElement('button');
          editStep.type = 'button';
          editStep.className = 'bbtn';
          editStep.textContent = 'Edit home at current step';
          var sp = context.stepper(t.section);
          editStep.disabled = !sp;
          listen(editStep,'click', function () {
            var current = context.stepper(t.section);
            if (!current) return;
            context.select(
              { section: t.section, kind: 'step', index: current.sourceIndex() },
              false
            );
          });
          rows.push(editStep);
          rows.push(homemapLayoutControl(val, t));
          var conditions = document.createElement('details');
          conditions.className = 'rawjson';
          var conditionsTitle = document.createElement('summary');
          conditionsTitle.textContent = 'Starting device conditions';
          conditions.appendChild(conditionsTitle);
          homemapModel(val, val.initial).devices.forEach(function (device) {
            ['state', 'thermal'].forEach(function (attribute) {
              var options = attribute === 'state' ? HOMEMAP_STATES[device.kind] : HOMEMAP_THERMAL;
              var input = context.controls.select(options, device[attribute], function (v) {
                return context.transact(
                  function (raw) {
                    return planHomemapDeviceAttribute(
                      context.source(),
                      raw,
                      t.section,
                      null,
                      val.id,
                      device.id,
                      attribute,
                      v
                    );
                  },
                  {
                    after: function () {
                      context.inspect();
                    },
                  }
                );
              });
              input.setAttribute('aria-label', device.label + ' initial ' + attribute);
              conditions.appendChild(
                context.controls.row(
                  device.label + ' · ' + (attribute === 'thermal' ? 'temperature' : 'state'),
                  input
                )
              );
            });
          });
          rows.push(conditions);
        },
        clickTarget: function (element) {
          var homeTarget = builderHomemapClickTarget(element, context.stepper, context.target());
          if (homeTarget) {
            if (homeTarget.kind === 'panel') {
              var marker = element.closest('[data-device],[data-subject],[data-home-room]');
              if (marker)
                homeTarget.homeElement = marker.hasAttribute('data-device')
                  ? { field: 'devices', id: marker.getAttribute('data-device') }
                  : marker.hasAttribute('data-subject')
                  ? { field: 'subjects', id: marker.getAttribute('data-subject') }
                  : { field: 'rooms', item: Number(marker.getAttribute('data-home-room')) };
            }
            return homeTarget;
          }
          return null;
        },
        selected: function (target, raw) {
          if (!target.homeElement) return;
          var parsed = { raw: raw };
          var panelPath = builderTargetPath(parsed.raw, context.target()),
            home = panelPath && specValueAt(parsed.raw, panelPath),
            pick = target.homeElement;
          var item =
            pick.field === 'rooms'
              ? pick.item
              : home &&
                (home[pick.field] || []).findIndex(function (x) {
                  return x.id === pick.id;
                });
          if (home && item >= 0)
            context.selectClipboard({
              kind: 'home',
              section: target.section,
              index: target.index,
              field: pick.field,
              item: item,
            });
        },
        revealElement: function (t) {
          var identity = JSON.stringify([t.section, t.index, t.field]);
          var folds =
            homeElementFolds[identity] || (homeElementFolds[identity] = { open: true, items: [] });
          folds.open = true;
          folds.items[t.item] = true;
        },
        decoratePreview: function (card) {
          if (card.querySelector('[data-home-layout]')) return;
          var button = document.createElement('button');
          button.type = 'button';
          button.className = 'bbtn home-layout-button';
          button.textContent = 'Edit layout';
          button.setAttribute('data-home-layout', '');
          button.setAttribute('aria-label', 'Edit home layout');
          button.title = 'Edit shared size, rooms, devices, and starting positions';
          var title = card.querySelector('.ptitle');
          if (!title) {
            title = document.createElement('div');
            title.className = 'ptitle';
            card.insertBefore(title, card.firstChild);
          }
          title.classList.add('home-layout-title');
          title.appendChild(button);
        },
      };
    },
  },
});
/* ---- src/panels/types/image.js ---- */
/* image validation and pure state helpers. */
var EMBEDDED_IMAGE_MAX_BYTES = 512 * 1024;
/* Raster data only: images travel with the spec and never fetch remote assets. */
function embeddedImageSource(value) {
  if (typeof value !== 'string' || value.length > Math.ceil(EMBEDDED_IMAGE_MAX_BYTES / 3) * 4 + 32)
    return null;
  var match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[2].length % 4 !== 0) return null;
  var bytes =
    (match[2].length * 3) / 4 - (match[2].endsWith('==') ? 2 : match[2].endsWith('=') ? 1 : 0);
  return bytes <= EMBEDDED_IMAGE_MAX_BYTES ? value : null;
}

PanelRegistry.extend('image', {
  validateDeclaration: function (p, PP, warnings, errors, d) {
    if (p.src != null && p.src !== '' && !embeddedImageSource(p.src))
      errors.push(
        PP +
          '.src: use an embedded PNG, JPEG or WebP data URL up to 512 KiB; remote URLs and SVG are not supported'
      );
    if (p.src && (typeof p.alt !== 'string' || !p.alt.trim()))
      warnings.push(PP + '.alt: describe the image for readers who cannot see it');
    ['alt', 'caption'].forEach(function (key) {
      if (p[key] != null && typeof p[key] !== 'string')
        warnings.push(PP + '.' + key + ': expected text');
    });
    if (p.link != null && (typeof FlowCanon === 'undefined' || !FlowCanon.http(p.link)))
      warnings.push(PP + '.link: expected an HTTP(S) URL without credentials');
  },
});

/* image panel: presentation model and renderer. Shared lifecycle lives in ../shared.js. */
PanelViews.register('image', function (host, panel, state, skin, states, stepIdx, animate) {
  var h = '';
  var imageSrc = embeddedImageSource(panel.src);
  h = '<figure class="pimage">';
  if (imageSrc)
    h += '<img src="' + esc(imageSrc) + '" alt="' + esc(panel.alt || '') + '" decoding="async">';
  else h += '<div class="pimage-empty">Add an embedded PNG, JPEG or WebP image</div>';
  if (panel.caption) h += '<figcaption>' + esc(panel.caption) + '</figcaption>';
  var imageLink = typeof FlowCanon !== 'undefined' && FlowCanon.http(panel.link);
  if (imageLink)
    h +=
      '<a class="pimage-link" href="' +
      esc(imageLink) +
      '" target="_blank" rel="noopener noreferrer">Open reference ↗</a>';
  h += '</figure>';
  return { html: h };
});

PanelRegistry.extend('image', {
  order: 5,
  label: 'Embedded image',
  since: '0.1.0',
});

PanelRegistry.extend('image', {
  styles: [
    {
      order: 2466,
      css: String.raw`.docview .section-layout-tile>.pt-image{display:flex;flex-direction:column;}
.section-layout-tile>.pt-image>.ptitle{flex:none;}
.section-layout-tile>.pt-image>.pbody{display:flex;flex:1;min-height:0;}`,
    },
    {
      order: 2471,
      css: String.raw`@media print{
  .panelcol .pwidget.pt-image{display:block !important;break-inside:avoid;}
}`,
    },
  ],
});

/* image authoring contract; merged into this panel definition by the bundle. */
PanelRegistry.extend('image', {
  authoring: {
    template: { title: 'Reference image', alt: 'Embedded reference image' },
    setupFields: [
      ['src', 'image'],
      ['alt', 'text'],
      ['caption', 'text'],
      ['link', 'text'],
    ],
    patchFields: [],
    picker: {
      order: 27,
      name: 'Reference image',
      category: 'Reference',
      tagline: 'Bring your own visual',
      description:
        'Embed a screenshot, photo, or sketch beside the flow, with optional caption and source link.',
    },
    example: function (sample, context) {
      var panel = sample.panel,
        state = sample.state,
        states = sample.states,
        step = sample.step;
      panel.initial = builderClone(state);
      if (context.referenceImage) {
        panel.src = context.referenceImage;
        panel.caption = 'Your screenshot, photo, or sketch';
      }

      return { panel: panel, state: state, states: states, step: step };
    },
    editor: function (context) {
      return {
        setupField: function (field, panel) {
          if (field[1] !== 'image') return;
          var key = field[0],
            cur = panel[key];
          var wrap = document.createElement('div'),
            input = document.createElement('input'),
            note = document.createElement('p'),
            uploadVersion = 0;
          input.type = 'file';
          input.accept = 'image/png,image/jpeg,image/webp';
          input.setAttribute('aria-label', 'Embedded image file');
          note.className = 'fnote';
          note.textContent =
            'PNG, JPEG or WebP, up to 512 KiB. Stored inside the spec; no external image request.';
          input.addEventListener('change', function () {
            var epoch = ++uploadVersion,
              file = input.files && input.files[0];
            if (!file) return;
            if (file.size > EMBEDDED_IMAGE_MAX_BYTES) {
              context.error('Image is larger than 512 KiB. Use a smaller capture.');
              input.value = '';
              return;
            }
            if (['image/png', 'image/jpeg', 'image/webp'].indexOf(file.type) < 0) {
              context.error('Choose a PNG, JPEG or WebP image.');
              input.value = '';
              return;
            }
            var original = context.source(),
              selection = JSON.stringify(context.target()),
              reader = new FileReader();
            function current() {
              return (
                epoch === uploadVersion &&
                wrap.isConnected &&
                context.source() === original &&
                JSON.stringify(context.target()) === selection
              );
            }
            reader.onerror = function () {
              if (current())
                context.error('Could not read the image. Existing content is unchanged.');
            };
            reader.onload = function () {
              if (!current()) return;
              var data = embeddedImageSource(reader.result);
              if (!data) {
                context.error('Invalid embedded image. Existing content is unchanged.');
                return;
              }
              var probe = new Image();
              probe.onload = function () {
                if (!current()) return;
                if (
                  !probe.naturalWidth ||
                  !probe.naturalHeight ||
                  probe.naturalWidth > 4096 ||
                  probe.naturalHeight > 4096
                ) {
                  context.error('Use an image no larger than 4096 × 4096 pixels.');
                  return;
                }
                if (context.commit(key, JSON.stringify(data))) context.refresh();
              };
              probe.onerror = function () {
                if (current())
                  context.error('The file is not a readable image. Existing content is unchanged.');
              };
              probe.src = data;
            };
            reader.readAsDataURL(file);
          });
          wrap.appendChild(input);
          wrap.appendChild(note);
          if (cur) {
            var remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'bbtn';
            remove.textContent = 'Remove image';
            remove.addEventListener('click', function () {
              if (context.commit(key, null)) context.refresh();
            });
            wrap.appendChild(remove);
          }
          return context.controls.block('Image file', wrap);
        },
      };
    },
  },
});
/* ---- src/panels/types/inflight.js ---- */
/* inflight validation and pure state helpers. */
var INFLIGHT_STATES = ['ok', 'retry', 'failed'];
/* Validate + simulate one inflight patch in the same deterministic order as
   the fold: start, then end, then mark. `open` is lane-id -> true and is
   intentionally carried across steps so impossible histories warn where
   they occur. */
function inflightPatchWarnings(patch, path, info, warnings) {
  var lanes = info.lanes,
    open = info.open;
  function known(lane, p) {
    if (typeof lane !== 'string' || !lanes[lane]) {
      warnings.push(p + ': unknown inflight lane id "' + lane + '" — operation ignored');
      return false;
    }
    return true;
  }
  if (patch.start != null && !Array.isArray(patch.start)) {
    warnings.push(path + '.start: must be an array of {lane, label?} — ignored');
  } else
    (patch.start || []).forEach(function (op, i) {
      var p = path + '.start[' + i + ']';
      if (!op || typeof op !== 'object' || Array.isArray(op)) {
        warnings.push(p + ': expected {lane, label?} — start ignored');
        return;
      }
      if (!known(op.lane, p + '.lane')) return;
      if (open[op.lane])
        warnings.push(
          p + ': lane "' + op.lane + '" is already open — current bar closes and restarts here'
        );
      open[op.lane] = true;
    });
  if (patch.end != null && !Array.isArray(patch.end)) {
    warnings.push(path + '.end: must be an array of lane ids — ignored');
  } else
    (patch.end || []).forEach(function (lane, i) {
      var p = path + '.end[' + i + ']';
      if (!known(lane, p)) return;
      if (!open[lane]) warnings.push(p + ': lane "' + lane + '" has no open bar — end ignored');
      else delete open[lane];
    });
  if (patch.mark != null && !Array.isArray(patch.mark)) {
    warnings.push(path + '.mark: must be an array of {lane, state} — ignored');
  } else
    (patch.mark || []).forEach(function (op, i) {
      var p = path + '.mark[' + i + ']';
      if (!op || typeof op !== 'object' || Array.isArray(op)) {
        warnings.push(p + ': expected {lane, state} — mark ignored');
        return;
      }
      known(op.lane, p + '.lane');
      if (op.state != null && INFLIGHT_STATES.indexOf(op.state) < 0)
        warnings.push(
          p +
            '.state: unknown inflight state "' +
            op.state +
            '" — using "ok" (valid: ' +
            INFLIGHT_STATES.join(' ') +
            ')'
        );
    });
}

/* ---------------- normalize + validate ---------------- */
function foldInflightStates(panel, steps) {
  panel = panel || {};
  steps = Array.isArray(steps) ? steps : [];
  var lanes = {};
  (Array.isArray(panel.lanes) ? panel.lanes : []).slice(0, 8).forEach(function (l) {
    if (l && l.id && !lanes[l.id]) lanes[l.id] = true;
  });
  var bars = [],
    open = {},
    states = [];
  function cloneBars() {
    return bars.map(function (b) {
      return { lane: b.lane, label: b.label, start: b.start, end: b.end, state: b.state };
    });
  }
  steps.forEach(function (st, stepIdx) {
    var all = stepPanelPatch(st) || {};
    var patch = all[panel.id];
    patch = patch && typeof patch === 'object' && !Array.isArray(patch) ? patch : {};
    (Array.isArray(patch.start) ? patch.start : []).forEach(function (op) {
      if (!op || typeof op !== 'object' || !lanes[op.lane]) return;
      if (open[op.lane] != null) bars[open[op.lane]].end = stepIdx;
      var bar = {
        lane: op.lane,
        label: op.label != null ? String(op.label) : '',
        start: stepIdx,
        end: null,
        state: 'ok',
      };
      bars.push(bar);
      open[op.lane] = bars.length - 1;
    });
    (Array.isArray(patch.end) ? patch.end : []).forEach(function (lane) {
      if (!lanes[lane] || open[lane] == null) return;
      bars[open[lane]].end = stepIdx;
      delete open[lane];
    });
    (Array.isArray(patch.mark) ? patch.mark : []).forEach(function (op) {
      if (!op || typeof op !== 'object' || !lanes[op.lane] || open[op.lane] == null) return;
      bars[open[op.lane]].state = INFLIGHT_STATES.indexOf(op.state) >= 0 ? op.state : 'ok';
    });
    states.push({ bars: cloneBars(), currentStep: stepIdx, stepCount: steps.length });
  });
  if (!steps.length) states.push({ bars: [], currentStep: 0, stepCount: 0 });
  return states;
}

PanelRegistry.extend('inflight', {
  validateDeclaration: function (p, PP, warnings, errors, d) {
    var laneMap = {};
    var context = { decl: p, lanes: laneMap, open: {} };
    if (!(Array.isArray(p.lanes) && p.lanes.length)) {
      warnings.push(PP + '.lanes: inflight needs 1–8 lanes [{id, label}] — panel renders empty');
    } else {
      if (p.lanes.length > 8)
        warnings.push(PP + '.lanes: more than 8 lanes — extra lanes are not rendered');
      p.lanes.slice(0, 8).forEach(function (l, li) {
        var LP = PP + '.lanes[' + li + ']';
        if (!l || typeof l !== 'object' || Array.isArray(l) || !l.id) {
          warnings.push(LP + ': needs {id, label?} — lane skipped');
        } else if (laneMap[l.id]) {
          warnings.push(LP + '.id: duplicate inflight lane id "' + l.id + '" — later lane skipped');
        } else {
          laneMap[l.id] = true;
        }
      });
    }
    return context;
  },
  validatePatch: function (patch, path, panel, warnings, context) {
    inflightPatchWarnings(patch, path, context, warnings);
  },
  fold: foldInflightStates,
});

/* inflight panel: presentation model and renderer. Shared lifecycle lives in ../shared.js. */
function inflightModel(panel, state, stepCount, currentStep) {
  panel = panel || {};
  state = state || {};
  var seen = {};
  var lanes = (Array.isArray(panel.lanes) ? panel.lanes : [])
    .slice(0, 8)
    .map(function (l) {
      if (!l || !l.id || seen[l.id]) return null;
      seen[l.id] = true;
      return {
        id: String(l.id),
        label: l.label != null ? String(l.label) : String(l.id),
        bars: [],
      };
    })
    .filter(Boolean);
  var byId = {};
  lanes.forEach(function (l) {
    byId[l.id] = l;
  });
  var n =
    typeof stepCount === 'number' && isFinite(stepCount)
      ? Math.max(0, Math.round(stepCount))
      : typeof state.stepCount === 'number'
      ? Math.max(0, Math.round(state.stepCount))
      : 0;
  var cur =
    typeof currentStep === 'number' && isFinite(currentStep)
      ? Math.round(currentStep)
      : typeof state.currentStep === 'number'
      ? Math.round(state.currentStep)
      : 0;
  if (n) cur = clamp(cur, 0, n - 1);
  else cur = 0;
  (Array.isArray(state.bars) ? state.bars : []).forEach(function (b) {
    if (!b || !byId[b.lane] || !validRevealIndex(b.start)) return;
    var end = validRevealIndex(b.end) ? b.end : null;
    var st = INFLIGHT_STATES.indexOf(b.state) >= 0 ? b.state : 'ok';
    byId[b.lane].bars.push({
      lane: b.lane,
      label: b.label != null ? String(b.label) : '',
      start: b.start,
      end: end,
      state: st,
      open: end == null,
    });
  });
  return { lanes: lanes, stepCount: n, currentStep: cur };
}

function inflightPanelHTML(panel, state, stepCount, currentStep) {
  var m = inflightModel(panel, state, stepCount, currentStep);
  if (!m.lanes.length) return '<div class="ifempty">no lanes</div>';
  var n = Math.max(1, m.stepCount);
  var h =
    '<div class="ifbox"><div class="ifaxis"><span class="ifaxislabel">step</span><span class="ifticks">';
  for (var i = 0; i < m.stepCount; i++) {
    h +=
      '<span class="iftick' +
      (i === m.currentStep ? ' cur' : '') +
      '" style="left:' +
      (((i + 0.5) / n) * 100).toFixed(3) +
      '%">' +
      i +
      '</span>';
  }
  h += '</span></div>';
  m.lanes.forEach(function (lane) {
    h +=
      '<div class="ifrow"><span class="iflabel" title="' +
      esc(lane.label) +
      '">' +
      esc(lane.label) +
      '</span><span class="iftrack">';
    if (m.stepCount)
      h +=
        '<i class="ifnow" style="left:' +
        ((m.currentStep / n) * 100).toFixed(3) +
        '%;width:' +
        (100 / n).toFixed(3) +
        '%"></i>';
    for (var gi = 1; gi < n; gi++)
      h += '<i class="ifgrid" style="left:' + ((gi / n) * 100).toFixed(3) + '%"></i>';
    lane.bars.forEach(function (bar) {
      var last = bar.open ? m.currentStep : bar.end;
      last = Math.max(bar.start, Math.min(n - 1, last));
      var left = (bar.start / n) * 100;
      var width = ((last - bar.start + 1) / n) * 100;
      h +=
        '<b class="ifbar s-' +
        bar.state +
        (bar.open ? ' open' : '') +
        '" style="left:' +
        left.toFixed(3) +
        '%;width:' +
        width.toFixed(3) +
        '%" title="' +
        esc(bar.label || lane.label) +
        ' · steps ' +
        bar.start +
        (bar.open ? '+' : '–' + bar.end) +
        '">' +
        esc(bar.label) +
        '</b>';
    });
    h += '</span></div>';
  });
  return h + '</div>';
}

/* Stable presentation keys and target widths for inflight bars. These frames
   are never folded back into state; they only let a rebuilt bar begin at its
   previous painted width during an adjacent transition. */
function inflightBarFrames(model) {
  var frames = [],
    seen = {},
    n = Math.max(1, model.stepCount);
  model.lanes.forEach(function (lane) {
    lane.bars.forEach(function (bar) {
      var base = lane.id + '\n' + bar.start + '\n' + bar.label;
      var ordinal = seen[base] || 0;
      seen[base] = ordinal + 1;
      var last = bar.open ? model.currentStep : bar.end;
      last = Math.max(bar.start, Math.min(n - 1, last));
      frames.push({
        key: base + '\n' + ordinal,
        width: ((last - bar.start + 1) / n) * 100,
      });
    });
  });
  return frames;
}

/* phone widget: a generic handset lock screen backed by the absolute unread
   stack produced by foldPhoneStates. The model keeps the full count for the
   computed badge while exposing only the three cards that can fit. */

PanelViews.register('inflight', function (host, panel, state, skin, states, stepIdx, animate) {
  var h = '';
  var inflightFramesNow, inflightFramesPrev;
  var ifmNow = inflightModel(
    panel,
    state,
    Array.isArray(states) ? states.length : state.stepCount,
    stepIdx
  );
  inflightFramesNow = inflightBarFrames(ifmNow);
  inflightFramesPrev = host._ifFrames || null;
  host._ifFrames = {};
  inflightFramesNow.forEach(function (frame) {
    host._ifFrames[frame.key] = frame.width;
  });
  h += inflightPanelHTML(
    panel,
    state,
    Array.isArray(states) ? states.length : state.stepCount,
    stepIdx
  );
  return {
    html: h,
    bars: {
      selector: '.ifbar',
      frames: inflightFramesNow,
      previous: inflightFramesPrev,
    },
  };
});

PanelRegistry.extend('inflight', {
  order: 19,
  label: 'In-flight activity',
  since: '0.1.0',
});

PanelRegistry.extend('inflight', {
  styles: [
    {
      order: 345,
      css: String.raw`.ifbox{font:500 9.5px 'IBM Plex Mono',monospace;}
.ifaxis,.ifrow{display:grid;grid-template-columns:72px minmax(0,1fr);gap:7px;align-items:center;}
.ifaxis{margin-bottom:3px;}
.ifaxislabel{text-transform:uppercase;letter-spacing:.08em;font-size:8.5px;opacity:.65;}
.ifticks{height:17px;position:relative;display:block;}
.iftick{position:absolute;top:0;transform:translateX(-50%);width:16px;height:16px;line-height:16px;
  text-align:center;border-radius:5px;opacity:.6;}
.iftick.cur{opacity:1;font-weight:700;}
.ifrow{min-height:25px;}
.iflabel{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.iftrack{position:relative;display:block;height:20px;border-radius:6px;overflow:hidden;}
.ifgrid,.ifnow{position:absolute;top:0;bottom:0;display:block;pointer-events:none;}`,
    },
    {
      order: 357,
      css: String.raw`.ifnow{z-index:0;}
.ifbar{position:absolute;z-index:1;top:3px;height:14px;line-height:14px;box-sizing:border-box;
  min-width:5px;padding:0 4px;border-radius:5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  font-size:8px;font-weight:700;color:#08120C;
  transition:width .55s cubic-bezier(.4,0,.2,1), opacity .3s ease;}
.ifbar.s-ok{background:#4ADE80;}
.ifbar.s-retry{background:#FFB454;color:#2C1800;}
.ifbar.s-failed{background:#F87171;color:#2C0808;}
.ifbar.open{border-right:3px dotted rgba(0,0,0,.55);border-top-right-radius:1px;border-bottom-right-radius:1px;}
.ifempty{font:500 10.5px 'IBM Plex Mono',monospace;opacity:.65;}
.sk-aurora .ifaxis,.sk-aurora .iflabel{color:#93A7C9;}
.sk-aurora .iftick.cur{background:#0C2230;color:#8AE8FF;}
.sk-aurora .iftrack{background:#101A2C;border:1px solid #1D2A40;}`,
    },
    {
      order: 368,
      css: String.raw`.sk-aurora .ifnow{background:rgba(56,225,255,.08);}
.sk-daylight .ifaxis,.sk-daylight .iflabel{color:#6B6F7A;}
.sk-daylight .iftick.cur{background:#EEF0FB;color:#4956C9;}
.sk-daylight .iftrack{background:#F4F2EC;border:1px solid #E0DCD1;}`,
    },
    { order: 373, css: String.raw`.sk-daylight .ifnow{background:rgba(73,86,201,.08);}` },
  ],
});

/* inflight authoring contract; merged into this panel definition by the bundle. */
PanelRegistry.extend('inflight', {
  authoring: {
    template: { title: 'In flight', lanes: [{ id: 'op', label: 'operation' }] },
    setupFields: [
      ['lanes', 'rows', { cols: [{ k: 'id', req: true }, { k: 'label' }] }],
      ['initial', 'json'],
    ],
    patchFields: [
      ['start', 'jsonArr'],
      ['end', 'jsonArr'],
      ['mark', 'jsonArr'],
    ],
    picker: {
      order: 6,
      name: 'In-flight work',
      category: 'Software & data',
      tagline: 'Concurrent operations',
      description:
        'Put overlapping operations on the same step axis so concurrency is easy to follow.',
    },
    origin: function (p, key, snapshot, context) {
      var assignment = context.assignment,
        history = context.history,
        input = context.input,
        own = context.own;
      if (key === 'bars')
        return history(['start', 'end', 'mark'], false, 'Computed start/end/mark history');
      return {
        kind: 'engine',
        label: key === 'currentStep' ? 'Engine · current step' : 'Engine · total steps',
        inputs: [],
      };
    },
    example: function (sample, context) {
      var panel = sample.panel,
        state = sample.state,
        states = sample.states,
        step = sample.step;
      panel.lanes = [
        { id: 'request', label: 'Request' },
        { id: 'query', label: 'Database' },
        { id: 'event', label: 'Event' },
      ];
      state = {
        bars: [
          { lane: 'request', start: 0, end: 5, label: 'handle request' },
          { lane: 'query', start: 1, end: 3, label: 'query' },
          { lane: 'event', start: 3, label: 'publish' },
        ],
      };
      states = [{}, {}, {}, {}, {}, {}];
      step = 5;

      panel.initial = builderClone(state);

      return { panel: panel, state: state, states: states, step: step };
    },
  },
});
/* ---- src/panels/types/leds.js ---- */
/* leds panel: presentation model and renderer. Shared lifecycle lives in ../shared.js. */
PanelViews.register('leds', function (host, panel, state, skin, states, stepIdx, animate) {
  var h = '';
  h += '<div class="ledrow">';
  (panel.leds || []).forEach(function (l) {
    var mode = String(state[l.id] || 'off');
    if (['on', 'off', 'tx', 'rx'].indexOf(mode) < 0) mode = 'off';
    h +=
      '<span class="led"><span class="leddot ' +
      mode +
      '"></span>' +
      esc(l.label || l.id) +
      '</span>';
  });
  h += '</div>';
  return { html: h };
});

PanelRegistry.extend('leds', {
  order: 1,
  label: 'LEDs',
  since: '0.1.0',
});

PanelRegistry.extend('leds', {
  styles: [
    {
      order: 316,
      css: String.raw`.ledrow{display:flex; flex-wrap:wrap; gap:12px;}
.led{display:flex; align-items:center; gap:6px; font:600 10.5px 'IBM Plex Mono',monospace;}
.sk-aurora .led{color:#93A7C9;}
.sk-daylight .led{color:#6B6F7A;}
.leddot{width:9px; height:9px; border-radius:50%; display:inline-block;}
.leddot.off{background:#333D49;}
.leddot.on{background:#4ADE80; box-shadow:0 0 5px rgba(74,222,128,.8);}
.leddot.tx{background:#38E1FF; box-shadow:0 0 5px rgba(56,225,255,.8); animation:ledpulse .5s ease-in-out infinite alternate;}
.leddot.rx{background:#F471B5; box-shadow:0 0 5px rgba(244,113,181,.8); animation:ledpulse .5s ease-in-out infinite alternate;}`,
    },
    {
      order: 1359,
      css: String.raw`body.sk-editorial .leddot.on,
body.sk-editorial .leddot.tx,
body.sk-editorial .leddot.rx{box-shadow:none;}
body.sk-editorial .leddot.off{background:#AAA79F;}`,
    },
    {
      order: 1431,
      css: String.raw`body.sk-editorial .leddot.tx{background:var(--ed-accent);}
body.sk-editorial .leddot.rx{background:#8A4566;}`,
    },
    {
      order: 1571,
      css: String.raw`@media screen {
  body.sk-terminal .ledrow{gap:11px;}
}
@media screen {
  body.sk-terminal .led,
  body.sk-terminal .sk-aurora .led{color:var(--tm-text); font-size:9px; letter-spacing:.08em; text-transform:uppercase;}
}
@media screen {
  body.sk-terminal .leddot{width:8px; height:8px; border-radius:0; border:1px solid var(--tm-line);}
}
@media screen {
  body.sk-terminal .leddot.off{background:var(--tm-line-dim);}
}
@media screen {
  body.sk-terminal .leddot.on,
  body.sk-terminal .leddot.tx{background:var(--tm-good); border-color:var(--tm-good);}
}
@media screen {
  body.sk-terminal .leddot.rx{background:var(--tm-alert); border-color:var(--tm-alert);}
}`,
    },
    {
      order: 1778,
      css: String.raw`@media screen {
  body.sk-pastel .led,
  body.sk-pastel .sk-aurora .led,
  body.sk-pastel .sk-daylight .led {
    color:#647188;
    font-family:'Source Sans 3',sans-serif;
    font-size:11px;
    font-weight:700;
  }
}
@media screen {
  body.sk-pastel .leddot { width:10px; height:10px; border:2px solid #FFFFFF; box-shadow:0 0 0 1px #D8E0EB; }
}
@media screen {
  body.sk-pastel .leddot.off { background:#C6CEDA; }
}
@media screen {
  body.sk-pastel .leddot.on { background:#59AA7C; box-shadow:0 0 0 1px #8FC9A8, 0 0 7px rgba(65,145,99,.34); }
}
@media screen {
  body.sk-pastel .leddot.tx { background:#6BA7CE; box-shadow:0 0 0 1px #A8CADE, 0 0 7px rgba(78,143,183,.34); }
}
@media screen {
  body.sk-pastel .leddot.rx { background:#C477A4; box-shadow:0 0 0 1px #DAB0C9, 0 0 7px rgba(170,79,132,.30); }
}`,
    },
    {
      order: 2014,
      css: String.raw`@media screen {

  body.sk-blueprint .ledrow{gap:10px;}
}
@media screen {
  body.sk-blueprint .docview .led{color:#D0E6F2;font-family:'Barlow Condensed','Arial Narrow',sans-serif;font-size:11px;letter-spacing:.06em;}
}
@media screen {
  body.sk-blueprint .leddot{width:8px;height:8px;}
}
@media screen {
  body.sk-blueprint .leddot.off{background:#47779B;box-shadow:inset 0 0 0 1px #80A9C1;}
}
@media screen {
  body.sk-blueprint .leddot.on{background:#47F590;box-shadow:0 0 6px rgba(71,245,144,.82);}
}
@media screen {
  body.sk-blueprint .leddot.tx{background:#58E7FF;box-shadow:0 0 6px rgba(88,231,255,.85);}
}
@media screen {
  body.sk-blueprint .leddot.rx{background:#FF82C4;box-shadow:0 0 6px rgba(255,130,196,.85);}
}`,
    },
  ],
});

/* leds authoring contract; merged into this panel definition by the bundle. */
PanelRegistry.extend('leds', {
  authoring: {
    template: {
      title: 'Indicators',
      leds: [
        { id: 'power', label: 'PWR' },
        { id: 'radio', label: 'RADIO' },
      ],
      initial: { power: 'on' },
    },
    setupFields: [
      ['leds', 'rows', { cols: [{ k: 'id', req: true }, { k: 'label' }] }],
      ['initial', 'json'],
    ],
    patchFields: [],
    picker: {
      order: 21,
      name: 'Status lights',
      category: 'Devices & interfaces',
      tagline: 'Small signals, clear meaning',
      description: 'Show power, radio, and activity indicators changing with a device’s state.',
    },
    expandPatchFields: function (decl) {
      return (Array.isArray(decl.leds) ? decl.leds : [])
        .filter(function (item) {
          return item && typeof item.id === 'string' && item.id !== '';
        })
        .map(function (item) {
          return [item.id, 'enum', ['on', 'off', 'tx', 'rx']];
        });
    },
    example: function (sample, context) {
      var panel = sample.panel,
        state = sample.state,
        states = sample.states,
        step = sample.step;
      state = { power: 'on', radio: 'tx' };
      panel.initial = builderClone(state);

      return { panel: panel, state: state, states: states, step: step };
    },
  },
});
/* ---- src/panels/types/log.js ---- */
/* log panel: presentation model and renderer. Shared lifecycle lives in ../shared.js. */
PanelViews.register(
  'log',
  function (host, panel, state, skin, states, stepIdx, animate) {
    var h = '';
    var tags = panel.tags || {};
    h += '<div class="plog">';
    (state.log || []).forEach(function (line) {
      var tag = line && line.tag ? String(line.tag) : '';
      var col2 = isHex(tags[tag]) ? tags[tag] : null;
      h +=
        '<div class="plogline">' +
        (tag
          ? '<span class="plogtag"' +
            (col2 ? ' style="color:' + col2 + '"' : '') +
            '>' +
            esc(tag) +
            '</span>'
          : '') +
        '<span>' +
        esc(line && line.text != null ? line.text : String(line)) +
        '</span></div>';
    });
    h += '</div>';
    return {
      html: h,
      mounted: function () {
        var log = host.querySelector('.plog');
        if (log && typeof log.scrollHeight === 'number') log.scrollTop = log.scrollHeight;
      },
    };
  },
  { growing: true }
);

PanelRegistry.extend('log', {
  order: 3,
  label: 'Log',
  since: '0.1.0',
});

PanelRegistry.extend('log', {
  styles: [
    {
      order: 338,
      css: String.raw`.plog{font:500 10.5px/1.7 'IBM Plex Mono',monospace; height:170px; overflow-y:auto;}
.sk-aurora .plog{color:#93A7C9;}
.sk-daylight .plog{color:#6B6F7A;}
.plogline{display:flex; gap:7px;}
.plogtag{font-weight:700; min-width:32px;}`,
    },
    {
      order: 1363,
      css: String.raw`body.sk-editorial .plog{
  padding:8px 0 0;
  border-top:1px solid var(--ed-rule);
  scrollbar-color:var(--ed-rule-strong) transparent;
}`,
    },
    {
      order: 1579,
      css: String.raw`@media screen {
  body.sk-terminal .plog,
  body.sk-terminal .sk-aurora .plog{color:var(--tm-text); font-size:10px; line-height:1.8;}
}
@media screen {
  body.sk-terminal .plogline{border-bottom:1px solid var(--tm-line-dim);}
}`,
    },
    {
      order: 1787,
      css: String.raw`@media screen {
  body.sk-pastel .plog,
  body.sk-pastel .sk-aurora .plog,
  body.sk-pastel .sk-daylight .plog {
    box-sizing:border-box;
    color:#5E6D82;
    background:#F6F8FC;
    border:1px solid #E3E9F1;
    border-radius:11px;
    padding:8px 10px;
    scrollbar-color:#C8D1DF transparent;
  }
}
@media screen {
  body.sk-pastel .plogline + .plogline { border-top:1px solid rgba(219,226,237,.62); }
}`,
    },
    {
      order: 2024,
      css: String.raw`@media screen {

  body.sk-blueprint .docview .plog{
    height:148px;
    padding:5px 7px;
    border:1px solid #347F9E;
    color:#C5E1EE;
    background:#031E40;
    font-size:10px;
    line-height:1.5;
  }
}
@media screen {
  body.sk-blueprint .plogline{gap:6px;}
}
@media screen {
  body.sk-blueprint .plogtag{min-width:29px;}
}`,
    },
  ],
});

/* log authoring contract; merged into this panel definition by the bundle. */
PanelRegistry.extend('log', {
  authoring: {
    template: {
      title: 'Event log',
      tags: { NET: '#38E1FF' },
      initial: { log: [{ tag: 'NET', text: 'panel added' }] },
    },
    setupFields: [
      ['tags', 'map'],
      ['initial', 'json'],
    ],
    patchFields: [['log', 'jsonArr']],
    picker: {
      order: 7,
      name: 'Event log',
      category: 'Software & data',
      tagline: 'The running record',
      description: 'Build a readable, tagged event history alongside the steps of your story.',
    },
    origin: function (p, key, snapshot, context) {
      var assignment = context.assignment,
        history = context.history,
        input = context.input,
        own = context.own;
      if (key === 'log') return history(['log'], true, 'Accumulated log history');
    },
    example: function (sample, context) {
      var panel = sample.panel,
        state = sample.state,
        states = sample.states,
        step = sample.step;
      state.log = [
        { tag: 'NET', text: 'Connected to gateway' },
        { tag: 'NET', text: 'Event received · 200 OK' },
        { tag: 'NET', text: 'Acknowledgement sent' },
      ];
      panel.initial = builderClone(state);

      return { panel: panel, state: state, states: states, step: step };
    },
  },
});
/* ---- src/panels/types/orbit.js ---- */
/* orbit validation and pure state helpers. */

PanelRegistry.extend('orbit', {
  validateDeclaration: function (p, PP, warnings, errors, d) {
    if (!(Array.isArray(p.states) && p.states.length))
      warnings.push(PP + '.states: orbit needs states:[...] — panel renders empty');
  },
});

/* orbit panel: presentation model and renderer. Shared lifecycle lives in ../shared.js. */
function orbitPositions(n, cx, cy, r) {
  var out = [];
  for (var i = 0; i < n; i++) {
    var a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    out.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return out;
}

/* zones/layers patches replace the whole array (fold is a shallow merge);
   the model joins the declared geometry with the latest state array. */

PanelViews.register('orbit', function (host, panel, state, skin, states, stepIdx, animate) {
  var h = '';
  var pulseSelector, pulseChanged;
  var ostates = Array.isArray(panel.states) ? panel.states : [];
  var ocur = state.state != null ? String(state.state) : null;
  pulseSelector = '.odot.cur';
  pulseChanged = Object.prototype.hasOwnProperty.call(host, '_orbitCur') && host._orbitCur !== ocur;
  host._orbitCur = ocur;
  var ocolors = panel.colors || {};
  var opos = orbitPositions(ostates.length, 110, 78, 54);
  h +=
    '<svg class="orbit" viewBox="0 0 220 156" role="img" aria-label="' +
    esc(panel.title || 'state machine') +
    '">';
  h += '<circle class="oring" cx="110" cy="78" r="54"/>';
  ostates.forEach(function (sname, i) {
    var p = opos[i];
    var isCur = String(sname) === ocur;
    var col = isHex(ocolors[sname]) ? ocolors[sname] : null;
    var anchor = p.x < 100 ? 'end' : p.x > 120 ? 'start' : 'middle';
    var lx = p.x + (anchor === 'end' ? -11 : anchor === 'start' ? 11 : 0);
    var ly = anchor === 'middle' ? (p.y < 78 ? p.y - 10 : p.y + 16) : p.y + 3.5;
    h +=
      '<circle class="odot' +
      (isCur ? ' cur' : '') +
      '" cx="' +
      p.x.toFixed(1) +
      '" cy="' +
      p.y.toFixed(1) +
      '" r="' +
      (isCur ? 7 : 4.5) +
      '"' +
      (isCur && col ? ' style="fill:' + col + '"' : '') +
      '/>';
    h +=
      '<text class="olbl' +
      (isCur ? ' cur' : '') +
      '" x="' +
      lx.toFixed(1) +
      '" y="' +
      ly.toFixed(1) +
      '" text-anchor="' +
      anchor +
      '">' +
      esc(String(sname)) +
      '</text>';
  });
  h +=
    '<text class="ocur" x="110" y="75" text-anchor="middle"' +
    (ocur && isHex(ocolors[ocur]) ? ' style="fill:' + ocolors[ocur] + '"' : '') +
    '>' +
    esc(ocur || '—') +
    '</text>';
  if (state.via)
    h +=
      '<text class="ovia" x="110" y="91" text-anchor="middle">via ' +
      esc(String(state.via)) +
      '</text>';
  h += '</svg>';
  return {
    html: h,
    pulse: { selector: pulseSelector, changed: pulseChanged },
  };
});

PanelRegistry.extend('orbit', {
  order: 7,
  label: 'Orbit',
  since: '0.1.0',
});

PanelRegistry.extend('orbit', {
  styles: [
    {
      order: 335,
      css: String.raw`.odot.dv-chip-pulse{transform-box:fill-box; transform-origin:center; animation:dvchippulse .58s ease-out;}`,
    },
    {
      order: 610,
      css: String.raw`.orbit{display:block; width:100%; max-width:280px; margin:0 auto; height:auto;}
.oring{fill:none; stroke-dasharray:3 5; stroke-width:1.4;}
.sk-aurora .oring{stroke:#25364F;}
.sk-daylight .oring{stroke:#D8D3C6;}
.odot{transition:r .25s ease;}
.sk-aurora .odot{fill:#333D49;}
.sk-daylight .odot{fill:#C9C4B8;}
.odot.cur{animation:opulse 1.6s ease-in-out infinite alternate;}
.sk-aurora .odot.cur{fill:#38E1FF; filter:drop-shadow(0 0 6px rgba(56,225,255,.7));}
.sk-daylight .odot.cur{fill:#4956C9; filter:none;}
@keyframes opulse{to{opacity:.55;}}
.olbl{font:600 9px 'IBM Plex Mono',monospace;}
.sk-aurora .olbl{fill:#55627A;}
.sk-aurora .olbl.cur{fill:#B9E2F2;}
.sk-daylight .olbl{fill:#9A958A;}
.sk-daylight .olbl.cur{fill:#23272E;}
.ocur{font:700 13px 'IBM Plex Mono',monospace;}
.sk-aurora .ocur{fill:#EAF2FF;}
.sk-daylight .ocur{fill:#23272E;}
.ovia{font:500 8.5px 'IBM Plex Mono',monospace;}
.sk-aurora .ovia{fill:#5E7396;}
.sk-daylight .ovia{fill:#8A8474;}`,
    },
    {
      order: 1203,
      css: String.raw`@media (prefers-reduced-motion: reduce){
  .odot.cur{animation:none !important;}
}`,
    },
    {
      order: 1368,
      css: String.raw`body.sk-editorial .sk-aurora .oring,
body.sk-editorial .sk-daylight .oring{stroke:#C5BBAA;}
body.sk-editorial .sk-aurora .odot,
body.sk-editorial .sk-daylight .odot{fill:#B4AC9F;}
body.sk-editorial .sk-aurora .odot.cur,
body.sk-editorial .sk-daylight .odot.cur{fill:var(--ed-accent); filter:none;}
body.sk-editorial .sk-aurora .olbl,
body.sk-editorial .sk-daylight .olbl{fill:var(--ed-muted);}
body.sk-editorial .sk-aurora .olbl.cur,
body.sk-editorial .sk-daylight .olbl.cur{fill:var(--ed-ink);}`,
    },
    {
      order: 1592,
      css: String.raw`@media screen {

  body.sk-terminal .sk-aurora .oring{stroke:var(--tm-line);}
}
@media screen {
  body.sk-terminal .sk-aurora .odot{fill:var(--tm-line);}
}
@media screen {
  body.sk-terminal .sk-aurora .odot.cur{fill:var(--tm-good);}
}
@media screen {
  body.sk-terminal .sk-aurora .olbl{fill:var(--tm-muted);}
}
@media screen {
  body.sk-terminal .sk-aurora .olbl.cur,
  body.sk-terminal .sk-aurora .ocur{fill:var(--tm-ink);}
}
@media screen {
  body.sk-terminal .sk-aurora .ovia{fill:var(--tm-muted);}
}`,
    },
    {
      order: 1802,
      css: String.raw`@media screen {

  body.sk-pastel .oring,
  body.sk-pastel .sk-aurora .oring,
  body.sk-pastel .sk-daylight .oring { stroke:#D6DEEA; stroke-dasharray:2 5; }
}
@media screen {
  body.sk-pastel .sk-aurora .odot,
  body.sk-pastel .sk-daylight .odot { fill:#CBD3DE; }
}
@media screen {
  body.sk-pastel .sk-aurora .odot.cur,
  body.sk-pastel .sk-daylight .odot.cur { fill:#7584D4; filter:drop-shadow(0 0 4px rgba(82,99,185,.28)); }
}
@media screen {
  body.sk-pastel .sk-aurora .olbl,
  body.sk-pastel .sk-daylight .olbl { fill:#7B879A; }
}
@media screen {
  body.sk-pastel .sk-aurora .olbl.cur,
  body.sk-pastel .sk-daylight .olbl.cur,
  body.sk-pastel .sk-aurora .ocur,
  body.sk-pastel .sk-daylight .ocur { fill:#2D3B54; }
}
@media screen {
  body.sk-pastel .sk-aurora .ovia,
  body.sk-pastel .sk-daylight .ovia { fill:#8590A2; }
}`,
    },
    {
      order: 2040,
      css: String.raw`@media screen {

  body.sk-blueprint .docview .oring{stroke:#69BBD1;stroke-width:1.2;stroke-dasharray:2 4;}
}
@media screen {
  body.sk-blueprint .docview .odot{fill:#4E7998;}
}
@media screen {
  body.sk-blueprint .docview .odot.cur{fill:#58E7FF;}
}
@media screen {
  body.sk-blueprint .docview .olbl{fill:#9FC9DD;font-family:'Barlow Condensed','Arial Narrow',sans-serif;font-size:10px;letter-spacing:.025em;}
}
@media screen {
  body.sk-blueprint .docview .olbl.cur,body.sk-blueprint .docview .ocur{fill:#FFFFFF;}
}
@media screen {
  body.sk-blueprint .docview .ocur{font-family:'Barlow Condensed','Arial Narrow',sans-serif;font-size:14px;}
}
@media screen {
  body.sk-blueprint .docview .ovia{fill:#91BCD2;}
}`,
    },
  ],
});

/* orbit authoring contract; merged into this panel definition by the bundle. */
PanelRegistry.extend('orbit', {
  authoring: {
    template: {
      title: 'Lifecycle',
      states: ['IDLE', 'ACTIVE', 'DONE'],
      initial: { state: 'IDLE' },
    },
    setupFields: [
      ['states', 'csv'],
      ['colors', 'map'],
      ['initial', 'json'],
    ],
    patchFields: [
      ['state', 'text'],
      ['via', 'text'],
    ],
    picker: {
      order: 9,
      name: 'Lifecycle orbit',
      category: 'State & timing',
      tagline: 'A cycle of states',
      description:
        'Place lifecycle states around a ring and emphasize the active state and transition.',
    },
    expandPatchFields: function (decl) {
      var states = Array.isArray(decl.states) ? decl.states.map(String) : [];
      var stateField = states.length ? ['state', 'enum', states] : ['state', 'text'];
      return [stateField, ['via', 'text']];
    },
    example: function (sample, context) {
      var panel = sample.panel,
        state = sample.state,
        states = sample.states,
        step = sample.step;
      state = { state: 'ACTIVE', via: 'request received' };
      panel.initial = builderClone(state);

      return { panel: panel, state: state, states: states, step: step };
    },
  },
});
/* ---- src/panels/types/phone.js ---- */
/* phone validation and pure state helpers. */
function phoneBrandIsPlainObject(obj) {
  if (!obj || Object.prototype.toString.call(obj) !== '[object Object]') return false;
  var proto = Object.getPrototypeOf(obj);
  return (
    proto === null ||
    (Object.prototype.hasOwnProperty.call(proto, 'constructor') &&
      typeof proto.constructor === 'function' &&
      Function.prototype.toString.call(proto.constructor) ===
        Function.prototype.toString.call(Object))
  );
}

function phoneBrandWarnings(panel, path, warnings) {
  if (!Object.prototype.hasOwnProperty.call(panel, 'brand')) return;
  var brand = panel.brand;
  path += '.brand';
  if (!phoneBrandIsPlainObject(brand)) {
    warnings.push(path + ': must be a plain object — ignored');
    return;
  }
  ['accent', 'bg', 'fg'].forEach(function (k) {
    if (
      Object.prototype.hasOwnProperty.call(brand, k) &&
      (typeof brand[k] !== 'string' ||
        (brand[k].length !== 4 && brand[k].length !== 7) ||
        !/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(brand[k]))
    )
      warnings.push(path + '.' + k + ': must be #RGB or #RRGGBB hex — ignored');
  });
  if (
    Object.prototype.hasOwnProperty.call(brand, 'logo') &&
    (typeof brand.logo !== 'string' || brand.logo.length < 1 || brand.logo.length > 4)
  )
    warnings.push(path + '.logo: must be a string of 1-4 characters — ignored');
  if (Object.prototype.hasOwnProperty.call(brand, 'app') && typeof brand.app !== 'string')
    warnings.push(path + '.app: must be a string — ignored');
}

/* Phone patches are operations, validated for both initial and steps. */
function phonePatchWarnings(obj, path, warnings) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
  Object.keys(obj).forEach(function (k) {
    if (['clock', 'notify', 'clear'].indexOf(k) < 0)
      warnings.push(path + '.' + k + ': not a phone field — ignored (valid: clock, notify, clear)');
  });
  if (Object.prototype.hasOwnProperty.call(obj, 'clock') && typeof obj.clock !== 'string')
    warnings.push(path + '.clock: must be a string — ignored');
  if (Object.prototype.hasOwnProperty.call(obj, 'clear') && obj.clear !== true)
    warnings.push(path + '.clear: must be true — ignored');
  if (!Object.prototype.hasOwnProperty.call(obj, 'notify')) return;
  var entries = Array.isArray(obj.notify) ? obj.notify : [obj.notify];
  entries.forEach(function (n, i) {
    var np = path + '.notify' + (Array.isArray(obj.notify) ? '[' + i + ']' : '');
    if (!n || typeof n !== 'object' || Array.isArray(n)) {
      warnings.push(np + ': expected {app, title?, text?} — notification ignored');
      return;
    }
    if (typeof n.app !== 'string' || !n.app)
      warnings.push(np + '.app: required non-empty string — notification ignored');
    ['title', 'text'].forEach(function (k) {
      if (Object.prototype.hasOwnProperty.call(n, k) && typeof n[k] !== 'string')
        warnings.push(np + '.' + k + ': must be a string — ignored');
    });
    Object.keys(n).forEach(function (k) {
      if (['app', 'title', 'text'].indexOf(k) < 0)
        warnings.push(
          np + '.' + k + ': not a notification field — ignored (valid: app, title, text)'
        );
    });
  });
}
/* Fold phone operations into absolute snapshots. The complete unread stack
   is retained newest-step-first; a single step's array keeps authored order.
   `_phoneAdded` is presentation metadata for the one-shot newest-card cue and
   is recomputed per target step, never carried. */
function foldPhoneStates(panel, steps) {
  panel = panel || {};
  steps = Array.isArray(steps) ? steps : [];
  var clock = '',
    notifications = [],
    states = [];
  function validNotification(n) {
    return n && typeof n === 'object' && !Array.isArray(n) && typeof n.app === 'string' && !!n.app;
  }
  function cleanNotification(n) {
    return {
      app: n.app,
      title: typeof n.title === 'string' ? n.title : '',
      text: typeof n.text === 'string' ? n.text : '',
    };
  }
  function apply(patch) {
    patch = patch && typeof patch === 'object' && !Array.isArray(patch) ? patch : {};
    if (typeof patch.clock === 'string') clock = patch.clock;
    if (patch.clear === true) notifications = [];
    if (!Object.prototype.hasOwnProperty.call(patch, 'notify')) return 0;
    var raw = Array.isArray(patch.notify) ? patch.notify : [patch.notify];
    var pushed = raw.filter(validNotification).map(cleanNotification);
    if (pushed.length) notifications = pushed.concat(notifications);
    return pushed.length;
  }
  apply(panel.initial);
  steps.forEach(function (st) {
    var all = stepPanelPatch(st) || {};
    var added = apply(all[panel.id]);
    states.push({
      clock: clock,
      notifications: notifications.map(cleanNotification),
      _phoneAdded: added,
    });
  });
  if (!steps.length)
    states.push({
      clock: clock,
      notifications: notifications.map(cleanNotification),
      _phoneAdded: 0,
    });
  return states;
}

PanelRegistry.extend('phone', {
  validateDeclaration: function (p, PP, warnings, errors, d) {
    phoneBrandWarnings(p, PP, warnings);
    phonePatchWarnings(p.initial, PP + '.initial', warnings);
  },
  validatePatch: function (patch, path, panel, warnings, context) {
    phonePatchWarnings(patch, path, warnings);
  },
  fold: foldPhoneStates,
});

/* phone panel: presentation model and renderer. Shared lifecycle lives in ../shared.js. */
function phoneBrand(panel) {
  var brand = panel && panel.brand;
  if (!phoneBrandIsPlainObject(brand)) return null;
  var out = {};
  if (typeof brand.app === 'string') out.app = brand.app;
  if (typeof brand.logo === 'string' && brand.logo.length >= 1 && brand.logo.length <= 4)
    out.logo = brand.logo;
  /* These values enter an inline style: accept only literal hex colors. */
  ['accent', 'bg', 'fg'].forEach(function (k) {
    if (
      typeof brand[k] === 'string' &&
      (brand[k].length === 4 || brand[k].length === 7) &&
      /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(brand[k])
    )
      out[k] = brand[k];
  });
  return Object.keys(out).length ? out : null;
}

function phoneModel(panelOrState, stepsOrState, currentStep) {
  var state;
  /* Public fold form: phoneModel(panel, diagramSteps, targetIndex). This is
     useful to callers/tests that need the complete target state without
     first reaching through foldPanelStates. Omit targetIndex for the end. */
  if (Array.isArray(stepsOrState)) {
    var folded = foldPhoneStates(panelOrState || {}, stepsOrState);
    var target =
      typeof currentStep === 'number' && isFinite(currentStep)
        ? Math.round(currentStep)
        : folded.length - 1;
    state = folded[clamp(target, 0, folded.length - 1)] || {};
  } else if (stepsOrState && typeof stepsOrState === 'object' && !Array.isArray(stepsOrState)) {
    /* Conventional widget-model form: phoneModel(panel, absoluteState). */
    state = stepsOrState;
  } else {
    /* Compact renderer form: phoneModel(absoluteState). */
    state = panelOrState || {};
  }
  var notifications = (Array.isArray(state.notifications) ? state.notifications : [])
    .map(function (n) {
      if (!n || typeof n !== 'object' || Array.isArray(n) || typeof n.app !== 'string' || !n.app)
        return null;
      return {
        app: n.app,
        title: typeof n.title === 'string' ? n.title : '',
        text: typeof n.text === 'string' ? n.text : '',
      };
    })
    .filter(Boolean);
  return {
    clock: typeof state.clock === 'string' ? state.clock : '',
    notifications: notifications,
    cards: notifications.slice(0, 3),
    count: notifications.length,
    badge: notifications.length,
    overflow: Math.max(0, notifications.length - 3),
    added: typeof state._phoneAdded === 'number' ? Math.max(0, Math.round(state._phoneAdded)) : 0,
  };
}

function phonePanelHTML(panel, state, fresh) {
  panel = panel || {};
  var m = phoneModel(panel, state);
  var brand = phoneBrand(panel);
  var styles = [];
  if (brand) {
    if (brand.accent) styles.push('--phacc:' + brand.accent);
    if (brand.bg) styles.push('--phbg:' + brand.bg);
    if (brand.fg) styles.push('--phfg:' + brand.fg);
  }
  var label = m.count
    ? 'Phone with ' + m.count + ' unread notification' + (m.count === 1 ? '' : 's')
    : 'Phone with no notifications';
  if (brand && brand.app) label = brand.app + ' phone' + label.slice(5);
  var h =
    '<div class="phoneframe"' +
    (styles.length ? ' style="' + styles.join(';') + '"' : '') +
    ' role="img" aria-label="' +
    esc(label) +
    '">' +
    '<span class="phonespeaker" aria-hidden="true"></span>' +
    '<div class="phonestatus"><span class="phoneclock">' +
    esc(m.clock) +
    '</span>' +
    '<span class="phoneglyphs" aria-hidden="true"><span class="phonesignal"><i></i><i></i><i></i></span>' +
    '<span class="phonebattery"><i></i></span></span></div>';
  if (brand && (brand.app || brand.logo))
    h +=
      '<div class="phonebrand">' +
      (brand.logo
        ? '<span class="phonelogo" aria-hidden="true">' + esc(brand.logo) + '</span>'
        : '') +
      (brand.app ? '<span class="phonebrandname">' + esc(brand.app) + '</span>' : '') +
      '</div>';
  if (m.count) h += '<span class="phonebadge" aria-hidden="true">' + m.badge + '</span>';
  h += '<div class="phonecards">';
  if (!m.cards.length) {
    h += '<div class="phoneempty">no notifications</div>';
  } else {
    m.cards.forEach(function (card, i) {
      h +=
        '<div class="phonecard' +
        (fresh && i === 0 ? ' fresh' : '') +
        '">' +
        '<div class="phoneapp" title="' +
        esc(card.app) +
        '">' +
        esc(card.app) +
        '</div>' +
        (card.title
          ? '<div class="phonetitle" title="' + esc(card.title) + '">' + esc(card.title) + '</div>'
          : '') +
        (card.text
          ? '<div class="phonetext" title="' + esc(card.text) + '">' + esc(card.text) + '</div>'
          : '') +
        '</div>';
    });
  }
  h += '</div>';
  if (m.overflow) h += '<div class="phoneoverflow">+' + m.overflow + ' more</div>';
  return h + '<span class="phonehome" aria-hidden="true"></span></div>';
}

/* Camera-details UI with field-level provenance. Everything is authored data;
   even endpoint labels are inert text. Source selection is local viewer state. */

PanelViews.register('phone', function (host, panel, state, skin, states, stepIdx, animate) {
  var h = '';
  var hBaseline = null;
  var phm = phoneModel(state);
  /* Like Radar, entry is derived from the transition we actually
       painted, never from the target snapshot's `_phoneAdded` marker. That
       marker is also present when navigating backward onto its source step.
       Requiring an adjacent forward step and a strictly deeper stack keeps
       backward navigation, jumps/deep links, and settled export renders free
       of one-shot markup. */
  var phonePrevStack = Array.isArray(host._phoneStack) ? host._phoneStack : null;
  var phoneDeeper =
    phonePrevStack !== null &&
    phm.notifications.length > phonePrevStack.length &&
    phonePrevStack.every(function (previousCard, previousIndex) {
      var nextCard =
        phm.notifications[phm.notifications.length - phonePrevStack.length + previousIndex];
      return (
        nextCard &&
        nextCard.app === previousCard.app &&
        nextCard.title === previousCard.title &&
        nextCard.text === previousCard.text
      );
    });
  var phoneFresh =
    animate &&
    validRevealIndex(host._phoneStep) &&
    validRevealIndex(stepIdx) &&
    stepIdx === host._phoneStep + 1 &&
    phoneDeeper;
  host._phoneStep = validRevealIndex(stepIdx) ? stepIdx : null;
  host._phoneStack = phm.notifications.map(function (card) {
    return { app: card.app, title: card.title, text: card.text };
  });
  h += phonePanelHTML(panel, state, phoneFresh);
  hBaseline = phoneFresh ? phonePanelHTML(panel, state, false) : null;
  return { html: h, baseline: hBaseline };
});

PanelRegistry.extend('phone', {
  order: 20,
  label: 'Phone',
  since: '0.1.0',
  layout: {
    height: 10,
  },
});

PanelRegistry.extend('phone', {
  styles: [
    {
      order: 429,
      css: String.raw`.phoneframe{position:relative;box-sizing:border-box;width:178px;min-height:252px;margin:0 auto;padding:30px 11px 19px;
  overflow:hidden;border:2px solid;border-radius:25px;font:500 9px/1.25 'IBM Plex Mono',monospace;}
.phonespeaker{position:absolute;top:9px;left:50%;width:36px;height:4px;transform:translateX(-50%);border-radius:999px;}
.phonestatus{position:absolute;top:16px;left:13px;right:13px;display:flex;align-items:center;justify-content:space-between;
  height:11px;font-size:8px;font-weight:700;}
.phonebrand{display:flex;align-items:center;gap:5px;min-width:0;padding:3px 18px 0 0;}
.phonelogo{flex:0 0 18px;height:18px;border-radius:4px;text-align:center;font-size:6px;font-weight:800;line-height:18px;
  color:#FFFFFF;background:var(--phacc, #4956C9);}
.phonebrandname{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;font-weight:700;
  color:var(--phfg, inherit);}
.phoneclock{max-width:88px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.phoneglyphs{display:flex;align-items:flex-end;gap:5px;}
.phonesignal{display:flex;align-items:flex-end;gap:1px;height:8px;}
.phonesignal i{display:block;width:2px;border-radius:1px;}
.phonesignal i:nth-child(1){height:3px;}
.phonesignal i:nth-child(2){height:5px;}
.phonesignal i:nth-child(3){height:8px;}
.phonebattery{position:relative;display:block;box-sizing:border-box;width:14px;height:7px;border:1px solid;border-radius:2px;}
.phonebattery::after{content:"";position:absolute;right:-3px;top:2px;width:2px;height:3px;border-radius:0 1px 1px 0;background:currentColor;}
.phonebattery i{display:block;width:8px;height:3px;margin:1px;border-radius:1px;background:currentColor;}
.phonebadge{position:absolute;z-index:2;top:35px;right:8px;min-width:17px;height:17px;padding:0 4px;box-sizing:border-box;
  border-radius:999px;text-align:center;font-size:8px;font-weight:800;line-height:17px;}
.phonecards{display:flex;flex-direction:column;gap:6px;min-height:181px;padding-top:8px;}
.phonecard{box-sizing:border-box;max-height:58px;padding:6px 8px;overflow:hidden;border:1px solid;border-radius:10px;}
.phonecard.fresh{animation:phonecardin .48s cubic-bezier(.2,.8,.2,1) both;}
@keyframes phonecardin{from{opacity:0;transform:translateY(-10px) scale(.96);}to{opacity:1;transform:none;}}
.phoneapp,.phonetitle{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.phoneapp{font-size:7.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;}
.phonetitle{margin-top:2px;font-size:9px;font-weight:800;}
.phonetext{display:-webkit-box;margin-top:2px;overflow:hidden;-webkit-box-orient:vertical;-webkit-line-clamp:2;font:500 8px/1.25 'IBM Plex Sans',sans-serif;}
.phoneoverflow{text-align:center;font-size:8px;font-weight:700;letter-spacing:.04em;}
.phoneempty{margin:auto;text-align:center;font-size:8px;letter-spacing:.05em;text-transform:uppercase;opacity:.58;}
.phonehome{position:absolute;bottom:8px;left:50%;width:42px;height:3px;transform:translateX(-50%);border-radius:999px;}
.sk-aurora .phoneframe{color:var(--phfg, #D9E4F2);background:var(--phbg, #09111E);border-color:#718099;box-shadow:inset 0 0 0 2px #16233A;}
.sk-aurora .phonespeaker,.sk-aurora .phonehome{background:#718099;}
.sk-aurora .phonesignal i{background:#C7D3E3;}
.sk-aurora .phonebattery{color:#C7D3E3;border-color:#C7D3E3;}
.sk-aurora .phonecard{color:#DCE7F5;background:rgba(43,58,79,.92);border-color:#3A4B64;box-shadow:0 4px 12px rgba(0,0,0,.2);}
.sk-aurora .phonecard.fresh{border-color:var(--phacc, #3A4B64);}
.sk-aurora .phoneapp,.sk-aurora .phoneoverflow{color:var(--phacc, #8AE8FF);}
.sk-aurora .phonetext{color:#B7C4D5;}
.sk-aurora .phonebadge{color:#07121D;background:var(--phacc, #8AE8FF);}
.sk-aurora .phonelogo{color:#07121D;background:var(--phacc, #8AE8FF);}
.sk-daylight .phoneframe{color:var(--phfg, #282B33);background:var(--phbg, #F2F0EA);border-color:#777B84;box-shadow:inset 0 0 0 2px #FFFFFF;}
.sk-daylight .phonespeaker,.sk-daylight .phonehome{background:#777B84;}
.sk-daylight .phonesignal i{background:#4E535D;}
.sk-daylight .phonebattery{color:#4E535D;border-color:#4E535D;}
.sk-daylight .phonecard{color:#272A32;background:rgba(255,255,255,.94);border-color:#D6D2C8;box-shadow:0 4px 12px rgba(45,42,35,.1);}
.sk-daylight .phonecard.fresh{border-color:var(--phacc, #D6D2C8);}
.sk-daylight .phoneapp,.sk-daylight .phoneoverflow{color:var(--phacc, #4956C9);}
.sk-daylight .phonetext{color:#5F626B;}
.sk-daylight .phonebadge{color:#FFFFFF;background:var(--phacc, #4956C9);}
.sk-daylight .phonelogo{color:#FFFFFF;background:var(--phacc, #4956C9);}`,
    },
    {
      order: 1207,
      css: String.raw`@media (prefers-reduced-motion: reduce){
  .phonecard.fresh{animation:none !important;}
}`,
    },
    {
      order: 1265,
      css: String.raw`@media print{
  .phoneframe{color:#222222 !important;background:#FFFFFF !important;border-color:#555555 !important;
    box-shadow:inset 0 0 0 2px #EEEEEE !important;break-inside:avoid;}
}
@media print{
  .phonespeaker,.phonehome,.phonesignal i{background:#555555 !important;}
}
@media print{
  .phonebattery{color:#555555 !important;border-color:#555555 !important;}
}
@media print{
  .phonecard{color:#222222 !important;background:#F4F4F4 !important;border-color:#BBBBBB !important;box-shadow:none !important;}
}
@media print{
  .phoneapp,.phoneoverflow,.phonetext{color:#555555 !important;}
}
@media print{
  .phonebadge{color:#FFFFFF !important;background:#333333 !important;}
}
@media print{
  .phonecard.fresh{animation:none !important;}
}`,
    },
    {
      order: 1457,
      css: String.raw`body.sk-editorial .sk-aurora .phoneframe,
body.sk-editorial .sk-daylight .phoneframe{
  color:var(--phfg, var(--ed-ink));background:var(--phbg, var(--ed-paper));border-color:var(--ed-ink);
  border-radius:18px;box-shadow:inset 0 0 0 2px #FFFDF8;
}
body.sk-editorial .sk-aurora .phonespeaker,
body.sk-editorial .sk-daylight .phonespeaker,
body.sk-editorial .sk-aurora .phonehome,
body.sk-editorial .sk-daylight .phonehome,
body.sk-editorial .sk-aurora .phonesignal i,
body.sk-editorial .sk-daylight .phonesignal i{background:var(--ed-muted);}
body.sk-editorial .sk-aurora .phonebattery,
body.sk-editorial .sk-daylight .phonebattery{color:var(--ed-muted);border-color:var(--ed-muted);}
body.sk-editorial .sk-aurora .phonecard,
body.sk-editorial .sk-daylight .phonecard{
  color:var(--ed-ink);background:#FFFDF8;border-color:var(--ed-rule);border-radius:2px;box-shadow:none;
}
body.sk-editorial .sk-aurora .phonecard.fresh,
body.sk-editorial .sk-daylight .phonecard.fresh{border-color:var(--phacc, var(--ed-rule));}
body.sk-editorial .sk-aurora .phoneapp,
body.sk-editorial .sk-daylight .phoneapp,
body.sk-editorial .sk-aurora .phoneoverflow,
body.sk-editorial .sk-daylight .phoneoverflow{color:var(--phacc, var(--ed-accent));}
body.sk-editorial .sk-aurora .phonetext,
body.sk-editorial .sk-daylight .phonetext{color:var(--ed-muted);}
body.sk-editorial .sk-aurora .phonebadge,
body.sk-editorial .sk-daylight .phonebadge{color:#FFFDF8;background:var(--phacc, var(--ed-accent-deep));}
body.sk-editorial .sk-aurora .phonelogo,
body.sk-editorial .sk-daylight .phonelogo{color:#FFFDF8;background:var(--phacc, var(--ed-accent-deep));}`,
    },
    {
      order: 1663,
      css: String.raw`@media screen {

  body.sk-terminal .sk-aurora .phoneframe,
  body.sk-terminal .sk-daylight .phoneframe{
    color:var(--phfg, var(--tm-ink));background:var(--phbg, var(--tm-ground));border-color:var(--tm-line);
    border-radius:0;box-shadow:inset 0 0 0 1px var(--tm-line-dim) !important;
  }
}
@media screen {
  body.sk-terminal .sk-aurora .phonespeaker,
  body.sk-terminal .sk-daylight .phonespeaker,
  body.sk-terminal .sk-aurora .phonehome,
  body.sk-terminal .sk-daylight .phonehome,
  body.sk-terminal .sk-aurora .phonesignal i,
  body.sk-terminal .sk-daylight .phonesignal i{background:var(--tm-good);}
}
@media screen {
  body.sk-terminal .sk-aurora .phonebattery,
  body.sk-terminal .sk-daylight .phonebattery{color:var(--tm-good);border-color:var(--tm-good);}
}
@media screen {
  body.sk-terminal .sk-aurora .phonecard,
  body.sk-terminal .sk-daylight .phonecard{
    color:var(--tm-ink);background:var(--tm-raised);border-color:var(--tm-line);border-radius:0;box-shadow:none;
  }
}
@media screen {
  body.sk-terminal .sk-aurora .phonecard.fresh,
  body.sk-terminal .sk-daylight .phonecard.fresh{border-color:var(--phacc, var(--tm-line));}
}
@media screen {
  body.sk-terminal .sk-aurora .phoneapp,
  body.sk-terminal .sk-daylight .phoneapp,
  body.sk-terminal .sk-aurora .phoneoverflow,
  body.sk-terminal .sk-daylight .phoneoverflow{color:var(--phacc, var(--tm-good));}
}
@media screen {
  body.sk-terminal .sk-aurora .phonetext,
  body.sk-terminal .sk-daylight .phonetext{color:var(--tm-muted);}
}
@media screen {
  body.sk-terminal .sk-aurora .phonebadge,
  body.sk-terminal .sk-daylight .phonebadge{color:var(--tm-ground);background:var(--phacc, var(--tm-alert));border-radius:0;}
}
@media screen {
  body.sk-terminal .sk-aurora .phonelogo,
  body.sk-terminal .sk-daylight .phonelogo{color:var(--tm-ground);background:var(--phacc, var(--tm-alert));}
}`,
    },
    {
      order: 1886,
      css: String.raw`@media screen {

  body.sk-pastel .sk-aurora .phoneframe,
  body.sk-pastel .sk-daylight .phoneframe{
    color:var(--phfg, #2D3B54);background:var(--phbg, #F3F5FB);border-color:#9AA6DE;
    border-radius:27px;box-shadow:inset 0 0 0 2px #FFFFFF,0 7px 18px rgba(82,99,185,.1);
  }
}
@media screen {
  body.sk-pastel .sk-aurora .phonespeaker,
  body.sk-pastel .sk-daylight .phonespeaker,
  body.sk-pastel .sk-aurora .phonehome,
  body.sk-pastel .sk-daylight .phonehome,
  body.sk-pastel .sk-aurora .phonesignal i,
  body.sk-pastel .sk-daylight .phonesignal i{background:#758095;}
}
@media screen {
  body.sk-pastel .sk-aurora .phonebattery,
  body.sk-pastel .sk-daylight .phonebattery{color:#758095;border-color:#758095;}
}
@media screen {
  body.sk-pastel .sk-aurora .phonecard,
  body.sk-pastel .sk-daylight .phonecard{
    color:#2D3B54;background:#FFFFFF;border-color:#E0E6EF;border-radius:12px;box-shadow:0 3px 9px rgba(82,99,185,.09);
  }
}
@media screen {
  body.sk-pastel .sk-aurora .phonecard.fresh,
  body.sk-pastel .sk-daylight .phonecard.fresh{border-color:var(--phacc, #E0E6EF);}
}
@media screen {
  body.sk-pastel .sk-aurora .phoneapp,
  body.sk-pastel .sk-daylight .phoneapp,
  body.sk-pastel .sk-aurora .phoneoverflow,
  body.sk-pastel .sk-daylight .phoneoverflow{color:var(--phacc, #5263B9);}
}
@media screen {
  body.sk-pastel .sk-aurora .phonetext,
  body.sk-pastel .sk-daylight .phonetext{color:#6C788C;}
}
@media screen {
  body.sk-pastel .sk-aurora .phonebadge,
  body.sk-pastel .sk-daylight .phonebadge{color:#FFFFFF;background:var(--phacc, #D36370);}
}
@media screen {
  body.sk-pastel .sk-aurora .phonelogo,
  body.sk-pastel .sk-daylight .phonelogo{color:#FFFFFF;background:var(--phacc, #D36370);}
}`,
    },
    {
      order: 2126,
      css: String.raw`@media screen {

  body.sk-blueprint .sk-aurora .phoneframe,
  body.sk-blueprint .sk-daylight .phoneframe{
    color:var(--phfg, #FFFFFF);background:var(--phbg, #031E40);border-color:#63C7DF;border-radius:0;
    box-shadow:inset 0 0 0 2px #052956;
  }
}
@media screen {
  body.sk-blueprint .sk-aurora .phonespeaker,
  body.sk-blueprint .sk-daylight .phonespeaker,
  body.sk-blueprint .sk-aurora .phonehome,
  body.sk-blueprint .sk-daylight .phonehome,
  body.sk-blueprint .sk-aurora .phonesignal i,
  body.sk-blueprint .sk-daylight .phonesignal i{background:#58E7FF;}
}
@media screen {
  body.sk-blueprint .sk-aurora .phonebattery,
  body.sk-blueprint .sk-daylight .phonebattery{color:#58E7FF;border-color:#58E7FF;}
}
@media screen {
  body.sk-blueprint .sk-aurora .phonecard,
  body.sk-blueprint .sk-daylight .phonecard{
    color:#FFFFFF;background:#052956;border-color:#347B9A;border-radius:0;box-shadow:none;
  }
}
@media screen {
  body.sk-blueprint .sk-aurora .phonecard.fresh,
  body.sk-blueprint .sk-daylight .phonecard.fresh{border-color:var(--phacc, #347B9A);}
}
@media screen {
  body.sk-blueprint .sk-aurora .phoneapp,
  body.sk-blueprint .sk-daylight .phoneapp,
  body.sk-blueprint .sk-aurora .phoneoverflow,
  body.sk-blueprint .sk-daylight .phoneoverflow{color:var(--phacc, #58E7FF);}
}
@media screen {
  body.sk-blueprint .sk-aurora .phonetext,
  body.sk-blueprint .sk-daylight .phonetext{color:#A9CCDD;}
}
@media screen {
  body.sk-blueprint .sk-aurora .phonebadge,
  body.sk-blueprint .sk-daylight .phonebadge{color:#052956;background:var(--phacc, #FFD166);border-radius:0;}
}
@media screen {
  body.sk-blueprint .sk-aurora .phonelogo,
  body.sk-blueprint .sk-daylight .phonelogo{color:#052956;background:var(--phacc, #FFD166);}
}`,
    },
  ],
});

/* phone authoring contract; merged into this panel definition by the bundle. */
PanelRegistry.extend('phone', {
  authoring: {
    template: { title: 'Phone', initial: { clock: '9:41' } },
    setupFields: [
      [
        'brand',
        'objf',
        { cols: [{ k: 'app' }, { k: 'logo' }, { k: 'accent' }, { k: 'bg' }, { k: 'fg' }] },
      ],
      ['initial', 'json'],
    ],
    patchFields: [
      ['clock', 'text'],
      ['notify', 'jsonAny'],
      ['clear', 'bool', { trueOnly: true }],
    ],
    picker: {
      order: 24,
      name: 'Phone notifications',
      category: 'Devices & interfaces',
      tagline: 'The user-facing moment',
      description: 'Show notifications stacking on a phone as events reach the user.',
    },
    origin: function (p, key, snapshot, context) {
      var assignment = context.assignment,
        history = context.history,
        input = context.input,
        own = context.own;
      if (key === 'notifications')
        return history(['notify', 'clear'], true, 'Computed notification history');
      if (key === 'clock')
        return assignment(
          key,
          function (v) {
            return typeof v === 'string';
          },
          false
        );
      return { kind: 'engine', label: 'Engine · presentation metadata', inputs: [] };
    },
    example: function (sample, context) {
      var panel = sample.panel,
        state = sample.state,
        states = sample.states,
        step = sample.step;
      state = {
        clock: '9:41',
        notifications: [
          { app: 'Home', title: 'Someone is at the door', text: 'Front door · Just now' },
        ],
      };
      panel.initial = builderClone(state);

      panel.initial.notify = panel.initial.notifications;
      delete panel.initial.notifications;
      state = foldPhoneStates(panel, [])[0];

      return { panel: panel, state: state, states: states, step: step };
    },
  },
});
/* ---- src/panels/types/queue.js ---- */
/* queue validation and pure state helpers. */
var QUEUE_STATES = ['empty', 'enqueue', 'held', 'dequeue'];
var QUEUE_CTX_FIELDS = ['from', 'to', 'reason'];
function queueContextWarnings(obj, path, warnings) {
  if (!obj || typeof obj !== 'object') return;
  QUEUE_CTX_FIELDS.forEach(function (f) {
    if (obj[f] != null && typeof obj[f] !== 'string')
      warnings.push(path + '.' + f + ': must be a string — ignored');
  });
}

/* Shared with the phone renderer; also accepts plain objects from another realm. */

PanelRegistry.extend('queue', {
  validateDeclaration: function (p, PP, warnings, errors, d) {
    if (p.initial && p.initial.state != null && QUEUE_STATES.indexOf(String(p.initial.state)) < 0)
      warnings.push(
        PP +
          '.initial.state: unknown queue state "' +
          p.initial.state +
          '" — using "empty" (valid: ' +
          QUEUE_STATES.join(' ') +
          ')'
      );
    queueContextWarnings(p.initial, PP + '.initial', warnings);
  },
  validatePatch: function (patch, path, panel, warnings, context) {
    if (patch.state != null && QUEUE_STATES.indexOf(String(patch.state)) < 0)
      warnings.push(
        path +
          '.state: unknown queue state "' +
          patch.state +
          '" — using "empty" (valid: ' +
          QUEUE_STATES.join(' ') +
          ')'
      );
    queueContextWarnings(patch, path, warnings);
  },
});

/* queue panel: presentation model and renderer. Shared lifecycle lives in ../shared.js. */
function queueModel(state) {
  state = state || {};
  var s = QUEUE_STATES.indexOf(String(state.state)) >= 0 ? String(state.state) : 'empty';
  function str(v) {
    return typeof v === 'string' ? v : '';
  }
  return {
    state: s,
    label: state.label != null ? String(state.label) : '',
    from: str(state.from),
    to: str(state.to),
    reason: str(state.reason),
  };
}

function queuePanelHTML(panel, state) {
  var qm = queueModel(state);
  var h = '<div class="qbox s-' + qm.state + '">';
  h += '<div class="qtrack">';
  h += '<span class="qarr qarr-in" aria-hidden="true">&#8594;</span>';
  h += '<div class="qslot">';
  if (qm.state === 'empty') h += '<span class="qempty">empty</span>';
  else h += '<span class="qmsg">' + esc(qm.label || 'message') + '</span>';
  h += '</div>';
  h += '<span class="qarr qarr-out" aria-hidden="true">&#8594;</span>';
  h += '</div>';
  /* directional context row: arrival label on the in-side during enqueue,
     departure label on the out-side during dequeue. Both spans are ALWAYS
     emitted (populated only in the relevant state) so the row reserves a
     fixed height and the panel never changes size between steps — otherwise
     the panel column and the step bar below it reflow. Static text, so it is
     reduced-motion safe. */
  var ctxIn = qm.state === 'enqueue' ? esc(qm.from) : '';
  var ctxOut = qm.state === 'dequeue' ? esc(qm.to) : '';
  h +=
    '<div class="qctx"><span class="qside qside-in">' +
    ctxIn +
    '</span>' +
    '<span class="qside qside-out">' +
    ctxOut +
    '</span></div>';
  h += '<div class="qstatecap">' + qm.state + '</div>';
  /* waiting-on line, shown while held; container always emitted (empty
     otherwise) and clamped to a fixed height so its length cannot reflow. */
  var reason = qm.state === 'held' ? esc(qm.reason) : '';
  h += '<div class="qreason">' + reason + '</div>';
  h += '</div>';
  return h;
}

/* inline markup: a small, safe subset for prose. The whole string is ESCAPED
   FIRST, then a fixed set of substitutions is applied, so labels/URLs are
   always HTML-safe and only http/https links are ever emitted (never
   javascript:/data:). Supported:
     [label](https://url)  ->  underlined anchor
     **bold**              ->  <strong>
     *italic*              ->  <em>   (single star; snake_case is untouched
                                       because italics use * not _)
     `code`                ->  <code>
   Plain prose with none of these is simply escaped, so this is a drop-in
   replacement for esc() in prose contexts. */

PanelViews.register('queue', function (host, panel, state, skin, states, stepIdx, animate) {
  var h = '';
  h += queuePanelHTML(panel, state);
  return { html: h };
});

PanelRegistry.extend('queue', {
  order: 10,
  label: 'Queue',
  since: '0.1.0',
});

PanelRegistry.extend('queue', {
  styles: [
    {
      order: 1019,
      css: String.raw`.qtrack{display:flex; align-items:center; gap:8px;}
.qslot{flex:1; min-height:34px; border:1.5px dashed; border-radius:8px; display:flex;
  align-items:center; justify-content:center; padding:4px 8px; overflow:hidden;}
.sk-aurora .qslot{border-color:#3B4A63;}
.sk-daylight .qslot{border-color:#C9C4B8;}
.s-held .qslot{border-style:solid;}
.sk-aurora .s-held .qslot{border-color:#38E1FF;}
.sk-daylight .s-held .qslot{border-color:#4956C9;}
.qempty{font:500 10px 'IBM Plex Mono',monospace; letter-spacing:.1em; text-transform:uppercase; opacity:.45;}
.sk-aurora .qempty{color:#93A7C9;}
.sk-daylight .qempty{color:#6B6F7A;}
.qmsg{font:600 10.5px 'IBM Plex Mono',monospace; padding:4px 10px; border-radius:6px;
  border:1px solid; white-space:nowrap;}
.sk-aurora .qmsg{background:#0C2230; color:#8AE8FF; border-color:#38E1FF;}
.sk-daylight .qmsg{background:#EEF0FB; color:#4956C9; border-color:#4956C9;}
.s-enqueue .qmsg{animation:qenq .6s ease-out both;}
@keyframes qenq{from{transform:translateX(-70px); opacity:0;}}
.s-held .qmsg{animation:qheld 1.6s ease-in-out infinite alternate;}
@keyframes qheld{to{opacity:.55;}}
.s-dequeue .qmsg{animation:qdeq .7s ease-in both;}
@keyframes qdeq{to{transform:translateX(70px); opacity:0;}}
.qarr{font:700 12px 'IBM Plex Mono',monospace; opacity:.25;}
.sk-aurora .qarr{color:#5E7396;}
.sk-daylight .qarr{color:#9A958A;}
.s-enqueue .qarr-in{opacity:1;}
.sk-aurora .s-enqueue .qarr-in{color:#4ADE80;}
.sk-daylight .s-enqueue .qarr-in{color:#0E9382;}
.s-dequeue .qarr-out{opacity:1;}
.sk-aurora .s-dequeue .qarr-out{color:#FFB454;}
.sk-daylight .s-dequeue .qarr-out{color:#B45309;}
.qstatecap{font:600 9px 'IBM Plex Mono',monospace; letter-spacing:.14em; text-transform:uppercase;
  margin-top:6px; opacity:.6;}
.sk-aurora .qstatecap{color:#93A7C9;}
.sk-daylight .qstatecap{color:#6B6F7A;}`,
    },
    {
      order: 1052,
      css: String.raw`.qctx{display:flex; margin-top:5px; height:14px; overflow:hidden;}
.qside{font:600 9.5px 'IBM Plex Mono',monospace; line-height:14px; min-width:0;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;}
.qside-in{margin-right:auto;}
.qside-out{margin-left:auto;}
.sk-aurora .qside-in{color:#4ADE80;}
.sk-daylight .qside-in{color:#0E9382;}
.sk-aurora .qside-out{color:#FFB454;}
.sk-daylight .qside-out{color:#B45309;}`,
    },
    {
      order: 1061,
      css: String.raw`.qreason{font:500 10px 'IBM Plex Mono',monospace; margin-top:4px;
  height:28px; line-height:14px; overflow:hidden;
  display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;}
.sk-aurora .qreason{color:#5E7396;}
.sk-daylight .qreason{color:#8A8474;}`,
    },
    {
      order: 1208,
      css: String.raw`@media (prefers-reduced-motion: reduce){
  .qmsg{animation:none !important;}
}`,
    },
    {
      order: 1259,
      css: String.raw`@media print{
  .pt-queue .ptitle{color:#555555;}
}
@media print{
  .qmsg{animation:none !important; background:#FFFFFF; color:#111111; border-color:#555555;}
}
@media print{
  .qslot{border-color:#999999;}
}
@media print{
  .qempty, .qstatecap{color:#555555; opacity:.8;}
}
@media print{
  .qreason, .qside{color:#555555;}
}
@media print{
  .qarr{color:#777777;}
}`,
    },
    {
      order: 1451,
      css: String.raw`body.sk-editorial .sk-aurora .qslot,
body.sk-editorial .sk-daylight .qslot{border-color:var(--ed-rule-strong); border-radius:2px;}
body.sk-editorial .sk-aurora .s-held .qslot,
body.sk-editorial .sk-daylight .s-held .qslot{border-color:var(--ed-accent);}
body.sk-editorial .sk-aurora .qmsg,
body.sk-editorial .sk-daylight .qmsg{
  border-color:var(--ed-accent);
  border-radius:2px;
  color:var(--ed-accent-deep);
  background:var(--ed-accent-soft);
}
body.sk-editorial .sk-aurora .qarr,
body.sk-editorial .sk-daylight .qarr{color:var(--ed-muted);}
body.sk-editorial .sk-aurora .qside-in,
body.sk-editorial .sk-daylight .qside-in{color:var(--ed-good);}
body.sk-editorial .sk-aurora .qside-out,
body.sk-editorial .sk-daylight .qside-out{color:var(--ed-warn);}`,
    },
    {
      order: 1499,
      css: String.raw`@media print{
  body.sk-editorial .panelcol .pwidget.pt-queue{background:#FFFFFF; border-color:#B8B8B8;}
}`,
    },
    {
      order: 1657,
      css: String.raw`@media screen {

  body.sk-terminal .qslot{
    min-height:34px;
    background:var(--tm-raised);
    border:1px dashed var(--tm-line);
    border-radius:0;
  }
}
@media screen {
  body.sk-terminal .sk-aurora .s-held .qslot{border-color:var(--tm-good);}
}
@media screen {
  body.sk-terminal .qmsg,
  body.sk-terminal .sk-aurora .qmsg{color:var(--tm-good); background:#0B1912; border:1px solid var(--tm-good); border-radius:0;}
}
@media screen {
  body.sk-terminal .qempty,
  body.sk-terminal .qstatecap,
  body.sk-terminal .qreason,
  body.sk-terminal .qarr,
  body.sk-terminal .sk-aurora .qempty,
  body.sk-terminal .sk-aurora .qstatecap,
  body.sk-terminal .sk-aurora .qreason,
  body.sk-terminal .sk-aurora .qarr{color:var(--tm-muted);}
}
@media screen {
  body.sk-terminal .sk-aurora .qside-in,
  body.sk-terminal .sk-aurora .s-enqueue .qarr-in{color:var(--tm-good);}
}
@media screen {
  body.sk-terminal .sk-aurora .qside-out,
  body.sk-terminal .sk-aurora .s-dequeue .qarr-out{color:var(--tm-alert);}
}`,
    },
    {
      order: 1879,
      css: String.raw`@media screen {

  body.sk-pastel .qslot { border-color:#CAD4E1; border-radius:11px; background:#F8FAFC; }
}
@media screen {
  body.sk-pastel .sk-aurora .qslot,
  body.sk-pastel .sk-daylight .qslot { border-color:#CAD4E1; }
}
@media screen {
  body.sk-pastel .sk-aurora .s-held .qslot,
  body.sk-pastel .sk-daylight .s-held .qslot { border-color:#9BA7DE; }
}
@media screen {
  body.sk-pastel .qmsg,
  body.sk-pastel .sk-aurora .qmsg,
  body.sk-pastel .sk-daylight .qmsg {
    color:#5263B9;
    background:#EEF0FF;
    border-color:#AEB7E6;
    border-radius:999px;
    box-shadow:0 2px 7px rgba(82,99,185,.10);
  }
}
@media screen {
  body.sk-pastel .qempty,
  body.sk-pastel .qstatecap,
  body.sk-pastel .qreason,
  body.sk-pastel .qarr,
  body.sk-pastel .sk-aurora .qempty,
  body.sk-pastel .sk-daylight .qempty,
  body.sk-pastel .sk-aurora .qstatecap,
  body.sk-pastel .sk-daylight .qstatecap,
  body.sk-pastel .sk-aurora .qreason,
  body.sk-pastel .sk-daylight .qreason,
  body.sk-pastel .sk-aurora .qarr,
  body.sk-pastel .sk-daylight .qarr { color:#738095; }
}
@media screen {
  body.sk-pastel .sk-aurora .qside-in,
  body.sk-pastel .sk-daylight .qside-in { color:#287A55; }
}
@media screen {
  body.sk-pastel .sk-aurora .qside-out,
  body.sk-pastel .sk-daylight .qside-out { color:#A56B20; }
}`,
    },
    {
      order: 2117,
      css: String.raw`@media screen {

  body.sk-blueprint .qtrack{gap:6px;}
}
@media screen {
  body.sk-blueprint .docview .qslot{min-height:30px;padding:3px 6px;border-radius:0;border-color:#69A8C0;}
}
@media screen {
  body.sk-blueprint .docview .s-held .qslot{border-color:#58E7FF;}
}
@media screen {
  body.sk-blueprint .qmsg{padding:3px 8px;border-radius:0;}
}
@media screen {
  body.sk-blueprint .docview .qmsg{color:#FFFFFF;background:#0A447E;border-color:#8EEAFF;}
}
@media screen {
  body.sk-blueprint .docview .qempty,body.sk-blueprint .docview .qstatecap{color:#AECFDF;}
}
@media screen {
  body.sk-blueprint .docview .qreason{color:#9EC2D4;}
}
@media screen {
  body.sk-blueprint .docview .qside-in{color:#47F590;}
}
@media screen {
  body.sk-blueprint .docview .qside-out{color:#FFD166;}
}`,
    },
  ],
});

/* queue authoring contract; merged into this panel definition by the bundle. */
PanelRegistry.extend('queue', {
  authoring: {
    template: { title: 'Queue', initial: { state: 'empty' } },
    setupFields: [['initial', 'json']],
    patchFields: [
      ['state', 'enum', ['empty', 'enqueue', 'held', 'dequeue']],
      ['label', 'text'],
      ['from', 'text'],
      ['to', 'text'],
      ['reason', 'text'],
    ],
    picker: {
      order: 5,
      name: 'Message queue',
      category: 'Software & data',
      tagline: 'A message on its journey',
      description:
        'Show a message arriving, waiting, or leaving, including what it is waiting for.',
    },
    example: function (sample, context) {
      var panel = sample.panel,
        state = sample.state,
        states = sample.states,
        step = sample.step;
      state = { state: 'held', label: 'order.created', reason: 'worker ready' };
      panel.initial = builderClone(state);

      return { panel: panel, state: state, states: states, step: step };
    },
  },
});
/* ---- src/panels/types/radar.js ---- */
/* radar validation and pure state helpers. */
function radarPatchWarnings(obj, path, warnings) {
  if (!obj || typeof obj !== 'object') return;
  if (obj.subject != null) {
    var cart = isFiniteNum(obj.subject.x) && isFiniteNum(obj.subject.y);
    var polar = isFiniteNum(obj.subject.r) && isFiniteNum(obj.subject.deg);
    if (!cart && !polar)
      warnings.push(
        path +
          '.subject: expected {x, y} (frame px) or {r, deg} (declared units) — subject not drawn'
      );
  }
  if (obj.threshold != null && !(isFiniteNum(obj.threshold) && obj.threshold > 0))
    warnings.push(path + '.threshold: must be a positive finite distance — re-tune ignored');
  if (obj.alert != null && typeof obj.alert !== 'boolean')
    warnings.push(path + '.alert: must be true or false — only true activates the alert');
}

PanelRegistry.extend('radar', {
  validateDeclaration: function (p, PP, warnings, errors, d) {
    radarPatchWarnings(p.initial, PP + '.initial', warnings);
    if (p.sensor && !(isFiniteNum(p.sensor.x) && isFiniteNum(p.sensor.y)))
      warnings.push(
        PP + '.sensor: expected {x, y} in the 320×180 frame — using default (bottom-mid)'
      );
    if (p.spread != null && !(isFiniteNum(p.spread) && p.spread >= 10 && p.spread <= 360))
      warnings.push(PP + '.spread: expected degrees in [10,360] — clamped');
    if (p.range != null && !(isFiniteNum(p.range) && p.range > 0))
      warnings.push(PP + '.range: must be a positive reach in the 320×180 frame — using default');
    if (p.threshold != null && !(isFiniteNum(p.threshold) && p.threshold > 0))
      warnings.push(PP + '.threshold: must be a positive distance — no alert arc drawn');
    if (p.rings != null) {
      if (Array.isArray(p.rings)) {
        if (
          !p.rings.some(function (v) {
            return isFiniteNum(v) && v > 0;
          })
        )
          warnings.push(PP + '.rings: array has no positive finite distances — using 3 rings');
      } else if (!isFiniteNum(p.rings)) {
        warnings.push(PP + '.rings: expected a count 1–6 or an array of distances — using 3');
      } else if (p.rings < 1 || p.rings > 6) {
        warnings.push(PP + '.rings: count out of range — clamped to 1–6');
      }
    }
    if (p.scale != null && !(p.scale && isFiniteNum(p.scale.pxPerUnit) && p.scale.pxPerUnit > 0))
      warnings.push(
        PP +
          '.scale: expected {pxPerUnit: <positive number>, unit: "<name>"} — scaling disabled; polar r values render as raw pixels'
      );
    if (p.zones != null) {
      if (!Array.isArray(p.zones))
        warnings.push(PP + '.zones: must be an array of {id, label, points} — ignored');
      else
        p.zones.forEach(function (z, zi) {
          var poly = z && Array.isArray(z.points) && z.points.length >= 3;
          var sector =
            z &&
            Array.isArray(z.r) &&
            z.r.length === 2 &&
            Array.isArray(z.deg) &&
            z.deg.length === 2;
          if (!z || !z.id || (!poly && !sector)) {
            warnings.push(
              PP +
                '.zones[' +
                zi +
                ']: needs {id, points:[[x,y]…] with 3+ points} or {id, r:[r0,r1], deg:[d0,d1]} — zone skipped'
            );
          } else if (sector && !poly) {
            var secOk =
              isFiniteNum(z.r[0]) &&
              isFiniteNum(z.r[1]) &&
              z.r[0] >= 0 &&
              z.r[1] > z.r[0] &&
              isFiniteNum(z.deg[0]) &&
              isFiniteNum(z.deg[1]);
            if (!secOk)
              warnings.push(
                PP +
                  '.zones[' +
                  zi +
                  ']: sector needs finite 0 <= r0 < r1 and finite degrees — zone skipped'
              );
            else if (z.deg[0] === z.deg[1])
              warnings.push(
                PP +
                  '.zones[' +
                  zi +
                  ']: sector with equal start and end degrees is degenerate — zone skipped (a full circle is deg:[0,360])'
              );
          }
        });
    }
  },
  validatePatch: function (patch, path, panel, warnings, context) {
    radarPatchWarnings(patch, path, warnings);
  },
});

/* radar panel: presentation model and renderer. Shared lifecycle lives in ../shared.js. */
function radarModel(panel, state) {
  panel = panel || {};
  state = state || {};
  function fin(v) {
    return typeof v === 'number' && isFinite(v) ? v : null;
  }
  var sensor =
    panel.sensor && fin(panel.sensor.x) != null && fin(panel.sensor.y) != null
      ? { x: panel.sensor.x, y: panel.sensor.y }
      : { x: 160, y: 168 };
  var facing = fin(panel.facing) != null ? panel.facing : 270;
  var spread = fin(panel.spread) != null ? clamp(panel.spread, 10, 360) : 120;
  /* POLAR AUTHORING LAYER: with `scale: {pxPerUnit, unit}` declared, authors
     write real units everywhere — `range`, `threshold`, and a `rings` ARRAY
     are unit distances; a zone may be an annular sector {r:[r0,r1],
     deg:[d0,d1]}; a subject may be {r, deg} (degrees in the same clockwise-
     from-+x convention). Everything converts to frame pixels HERE; the rest
     of the model and the renderer stay Cartesian. Without `scale`, all
     numbers are frame pixels and subjects/zones are Cartesian, as before. */
  var ppu =
    panel.scale && fin(panel.scale.pxPerUnit) != null && panel.scale.pxPerUnit > 0
      ? panel.scale.pxPerUnit
      : null;
  var toPx = function (v) {
    return ppu != null ? v * ppu : v;
  };
  var fromPolar = function (r, deg) {
    var a = (deg * Math.PI) / 180;
    return {
      x: sensor.x + toPx(r) * Math.cos(a),
      y: sensor.y + toPx(r) * Math.sin(a),
    };
  };
  var range = fin(panel.range) != null && panel.range > 0 ? toPx(panel.range) : 150;
  var ringRadii = null,
    rings = 3;
  if (Array.isArray(panel.rings)) {
    ringRadii = panel.rings
      .map(fin)
      .filter(function (v) {
        return v != null && v > 0;
      })
      .map(toPx)
      .filter(function (v) {
        return v <= range + 0.5;
      })
      .map(function (v) {
        return Math.round(v * 10) / 10;
      });
    rings = ringRadii.length || 3;
    if (!ringRadii.length) ringRadii = null;
  } else if (fin(panel.rings) != null) {
    rings = Math.round(clamp(panel.rings, 1, 6));
  }
  var threshold =
    fin(panel.threshold) != null && panel.threshold > 0
      ? Math.min(toPx(panel.threshold), range)
      : null;
  /* a step may re-tune the alert line: state.threshold (same units as the
     declaration) overrides it for that step onward via normal folding */
  if (fin(state.threshold) != null && state.threshold > 0)
    threshold = Math.min(toPx(state.threshold), range);
  var zones = (Array.isArray(panel.zones) ? panel.zones : [])
    .map(function (z) {
      z = z || {};
      var pts = Array.isArray(z.points) ? z.points : [];
      /* annular sector → sampled polygon (inner arc out, outer arc back) */
      if (
        !pts.length &&
        Array.isArray(z.r) &&
        z.r.length === 2 &&
        Array.isArray(z.deg) &&
        z.deg.length === 2 &&
        fin(z.r[0]) != null &&
        fin(z.r[1]) != null &&
        z.r[0] >= 0 &&
        z.r[1] > z.r[0] &&
        fin(z.deg[0]) != null &&
        fin(z.deg[1]) != null
      ) {
        /* wrapped sectors take the natural short way round ([350,10] spans 20°,
         not 340°); sampling adapts to the span (≈15° chords) so wide sectors
         keep the arc tight enough for correct point-in-polygon occupancy */
        /* span is the clockwise travel from d0 to d1, normalized into (0,360]:
         [350,10] → 20°, and a full-turn writing ([0,360], [360,0], [10,-350])
         → 360°. Only literally equal endpoints are degenerate (skipped; the
         validator warns). */
        var d0 = z.deg[0],
          d1 = z.deg[1];
        var span = (((d1 - d0) % 360) + 360) % 360;
        if (span === 0) {
          if (d0 === d1) return { id: z.id, label: z.label || z.id || '', points: [] };
          span = 360;
        }
        var N = Math.max(6, Math.ceil(span / 15));
        pts = [];
        for (var zi = 0; zi <= N; zi++) {
          var p1 = fromPolar(z.r[0], d0 + (span * zi) / N);
          pts.push([p1.x, p1.y]);
        }
        for (var zj = N; zj >= 0; zj--) {
          var p2 = fromPolar(z.r[1], d0 + (span * zj) / N);
          pts.push([p2.x, p2.y]);
        }
        pts = pts.map(function (p) {
          return [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10];
        });
      }
      /* numeric-only points: author data goes straight into SVG attributes, so
       anything non-finite is dropped here (attribute injection impossible) */
      pts = pts
        .filter(function (p) {
          return Array.isArray(p) && fin(p[0]) != null && fin(p[1]) != null;
        })
        .map(function (p) {
          return [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10];
        });
      return { id: z.id, label: z.label || z.id || '', points: pts };
    })
    .filter(function (z) {
      return z.id && z.points.length >= 3;
    });
  var subj = null;
  if (state.subject && fin(state.subject.x) != null && fin(state.subject.y) != null)
    subj = { x: state.subject.x, y: state.subject.y };
  else if (state.subject && fin(state.subject.r) != null && fin(state.subject.deg) != null) {
    var sp = fromPolar(state.subject.r, state.subject.deg);
    subj = { x: Math.round(sp.x * 10) / 10, y: Math.round(sp.y * 10) / 10 };
  }
  /* Alerts are authored state, independent of proximity and occupied zones.
     Sparse step folding carries the last explicit alert until it is cleared. */
  var dist = null,
    alert = state.alert === true,
    occupied = [];
  if (subj) {
    var dx = subj.x - sensor.x,
      dy = subj.y - sensor.y;
    dist = Math.sqrt(dx * dx + dy * dy);
    zones.forEach(function (z) {
      if (pointInPoly(subj.x, subj.y, z.points)) occupied.push(z.id);
    });
  }
  return {
    sensor: sensor,
    facing: facing,
    spread: spread,
    range: range,
    rings: rings,
    ringRadii: ringRadii,
    threshold: threshold,
    zones: zones,
    subject: subj,
    dist: dist,
    alert: alert,
    occupied: occupied,
    banner: state.banner != null ? String(state.banner) : '',
    status: state.status != null ? String(state.status) : null,
  };
}

PanelViews.register('radar', function (host, panel, state, skin, states, stepIdx, animate) {
  var h = '';
  var hBaseline = null;
  var rm2 = radarModel(panel, state);
  var ridx = typeof stepIdx === 'number' ? stepIdx : 0;
  /* one-shot ripple + glide fire on the clear→alert transition / a move,
       with a steady baseline stored so the following unchanged step skips
       so unchanged steps preserve ambient animation */
  var rdFresh = animate && rm2.alert && host._rdAlert === false;
  var rdPrev = host._rdPrev || null;
  var rdMoved =
    animate && rdPrev && rm2.subject && (rdPrev.x !== rm2.subject.x || rdPrev.y !== rm2.subject.y);
  host._rdAlert = rm2.alert;
  host._rdPrev = rm2.subject ? { x: rm2.subject.x, y: rm2.subject.y } : null;
  var rdA1 = ((rm2.facing - rm2.spread / 2) * Math.PI) / 180;
  var rdA2 = ((rm2.facing + rm2.spread / 2) * Math.PI) / 180;
  var rdFull = rm2.spread >= 359.9;
  var rdArc = function (r) {
    if (rdFull) return null;
    var x1 = rm2.sensor.x + r * Math.cos(rdA1),
      y1 = rm2.sensor.y + r * Math.sin(rdA1);
    var x2 = rm2.sensor.x + r * Math.cos(rdA2),
      y2 = rm2.sensor.y + r * Math.sin(rdA2);
    return (
      'M' +
      x1.toFixed(1) +
      ' ' +
      y1.toFixed(1) +
      ' A' +
      r.toFixed(1) +
      ' ' +
      r.toFixed(1) +
      ' 0 ' +
      (rdA2 - rdA1 > Math.PI ? 1 : 0) +
      ' 1 ' +
      x2.toFixed(1) +
      ' ' +
      y2.toFixed(1)
    );
  };
  /* track: the subject positions of every folded step up to the current
       one — engine-derived, so any step jump redraws it consistently */
  var rdTrack = [];
  if (Array.isArray(states)) {
    for (var rti = 0; rti <= Math.min(ridx, states.length - 1); rti++) {
      /* run each folded step through the model so POLAR subjects convert
           exactly like the live one; dedupe parked positions so unchanged
           steps keep identical markup (rebuild skip) */
      var rsub = radarModel(panel, states[rti]).subject;
      var last = rdTrack.length ? rdTrack[rdTrack.length - 1] : undefined;
      if (rsub) {
        if (!(last && last[0] === rsub.x && last[1] === rsub.y)) rdTrack.push([rsub.x, rsub.y]);
      } else if (last !== null && rdTrack.length) {
        rdTrack.push(null);
      }
    }
  }
  var buildRadar = function (transient) {
    var s =
      '<div class="rdbox"><svg class="rdframe" viewBox="0 0 320 180" role="img" aria-label="' +
      esc(panel.title || 'radar range view') +
      '">';
    s += '<rect width="320" height="180" class="rdbg"/>';
    rm2.zones.forEach(function (z) {
      var zpts = z.points
        .map(function (p) {
          return p[0] + ',' + p[1];
        })
        .join(' ');
      var occ = rm2.occupied.indexOf(z.id) >= 0;
      s += '<polygon class="rdzone' + (occ ? ' occ' : '') + '" points="' + zpts + '"/>';
      s +=
        '<text class="rdzlbl' +
        (occ ? ' occ' : '') +
        '" x="' +
        (z.points[0][0] + 5) +
        '" y="' +
        (z.points[0][1] + 13) +
        '">' +
        esc(z.label) +
        '</text>';
    });
    var radii = rm2.ringRadii;
    for (var ri = 1; ri <= rm2.rings; ri++) {
      var rr = radii ? radii[ri - 1] : (rm2.range * ri) / rm2.rings;
      if (rdFull)
        s +=
          '<circle class="rdring" cx="' +
          rm2.sensor.x +
          '" cy="' +
          rm2.sensor.y +
          '" r="' +
          rr.toFixed(1) +
          '"/>';
      else s += '<path class="rdring" d="' + rdArc(rr) + '"/>';
    }
    if (!rdFull) {
      [rdA1, rdA2].forEach(function (a) {
        s +=
          '<line class="rdedge" x1="' +
          rm2.sensor.x +
          '" y1="' +
          rm2.sensor.y +
          '" x2="' +
          (rm2.sensor.x + rm2.range * Math.cos(a)).toFixed(1) +
          '" y2="' +
          (rm2.sensor.y + rm2.range * Math.sin(a)).toFixed(1) +
          '"/>';
      });
    }
    if (rm2.threshold != null) {
      if (rdFull)
        s +=
          '<circle class="rdthresh" cx="' +
          rm2.sensor.x +
          '" cy="' +
          rm2.sensor.y +
          '" r="' +
          rm2.threshold.toFixed(1) +
          '"/>';
      else s += '<path class="rdthresh" d="' + rdArc(rm2.threshold) + '"/>';
    }
    if (!RM) {
      var rmid = (rm2.facing * Math.PI) / 180;
      s +=
        '<g class="rdsweep" style="transform-origin:' +
        rm2.sensor.x +
        'px ' +
        rm2.sensor.y +
        'px;--sw:' +
        Math.max(0, Math.min(rm2.spread, 358) / 2 - 2).toFixed(1) +
        'deg">' +
        '<line x1="' +
        rm2.sensor.x +
        '" y1="' +
        rm2.sensor.y +
        '" x2="' +
        (rm2.sensor.x + (rm2.range - 3) * Math.cos(rmid)).toFixed(1) +
        '" y2="' +
        (rm2.sensor.y + (rm2.range - 3) * Math.sin(rmid)).toFixed(1) +
        '"/></g>';
    }
    s += '<circle class="rdsensor" cx="' + rm2.sensor.x + '" cy="' + rm2.sensor.y + '" r="5"/>';
    /* track dots + connecting segments (broken at steps with no subject) */
    var seg = [];
    var flushSeg = function () {
      if (seg.length > 1) s += '<polyline class="rdtrack" points="' + seg.join(' ') + '"/>';
      seg = [];
    };
    rdTrack.forEach(function (p) {
      if (!p) {
        flushSeg();
        return;
      }
      seg.push(p[0] + ',' + p[1]);
      s += '<circle class="rdtrackdot" cx="' + p[0] + '" cy="' + p[1] + '" r="2"/>';
    });
    flushSeg();
    if (rm2.subject) {
      s +=
        '<circle class="rdsubject ' +
        (rm2.alert ? 'alert' : 'clear') +
        '" cx="' +
        rm2.subject.x +
        '" cy="' +
        rm2.subject.y +
        '" r="6"' +
        (transient && rdMoved
          ? ' style="transform:translate(' +
            (rdPrev.x - rm2.subject.x) +
            'px,' +
            (rdPrev.y - rm2.subject.y) +
            'px)"'
          : '') +
        '/>';
      if (transient && !RM && rdFresh)
        s +=
          '<circle class="rdripple" cx="' + rm2.subject.x + '" cy="' + rm2.subject.y + '" r="6"/>';
    }
    var rstat =
      rm2.status != null ? rm2.status : rm2.alert ? 'RANGE ALERT' : rm2.subject ? 'CLEAR' : '';
    if (rstat) {
      s +=
        '<rect class="rdstatusbg ' +
        (rm2.alert ? 'alert' : 'clear') +
        (transient && rdFresh ? ' fresh' : '') +
        '" x="0" y="0" width="132" height="20"/>' +
        '<text class="rdstatustext" x="8" y="14">' +
        esc(rstat) +
        '</text>';
    }
    if (rm2.banner) {
      s +=
        '<rect class="rdbannerbg" x="0" y="150" width="320" height="30"/>' +
        '<text class="rdbannertext" x="160" y="169" text-anchor="middle">' +
        esc(rm2.banner) +
        '</text>';
    }
    return s + '</svg></div>';
  };
  h += buildRadar(true);
  hBaseline = rdFresh || rdMoved ? buildRadar(false) : null;
  return {
    html: h,
    baseline: hBaseline,
    transient: '.rdripple',
    glide: { selector: '.rdsubject', multiple: false },
  };
});

PanelRegistry.extend('radar', {
  order: 15,
  label: 'Radar',
  since: '0.1.0',
});

PanelRegistry.extend('radar', {
  styles: [
    {
      order: 827,
      css: String.raw`.rdbox{border-radius:8px; overflow:hidden;}
.rdframe{display:block; width:100%; height:auto;}
.rdbg{fill:#0A0F14;}
.rdring{fill:none; stroke:#22314A; stroke-width:1.2;}
.rdedge{stroke:#22314A; stroke-width:1.2;}
.rdthresh{fill:none; stroke:#FFB454; stroke-width:1.5; stroke-dasharray:5 4;}
.rdzone{fill:rgba(94,115,150,.08); stroke:#3B4A63; stroke-width:1.2; stroke-dasharray:4 4;}
.rdzone.occ{fill:rgba(56,225,255,.14); stroke:#38E1FF; stroke-dasharray:none;}
.rdzlbl{font:600 9px 'IBM Plex Mono',monospace; fill:#55627A;}
.rdzlbl.occ{fill:#8AE8FF;}
.rdsweep line{stroke:#38E1FF; stroke-width:1.2; opacity:.28; stroke-linecap:round;}
.rdsweep{transform-box:view-box; animation:sensorSweep 3.2s ease-in-out infinite alternate;}
.rdsensor{fill:#38E1FF; filter:drop-shadow(0 0 4px rgba(56,225,255,.85));}
.rdtrack{fill:none; stroke:#5E7396; stroke-width:1.2; stroke-dasharray:2 4;}
.rdtrackdot{fill:#5E7396;}
.rdsubject{stroke:#0A0F14; stroke-width:1.5; transition:transform .7s cubic-bezier(.4,0,.2,1);}
.rdsubject.clear{fill:#94A3B8;}
.rdsubject.alert{fill:#FFB454; filter:drop-shadow(0 0 5px rgba(255,180,84,.9));}
.rdripple{fill:none; stroke:#FFB454; stroke-width:2; animation:sensorRipple 1s ease-out both;}
.rdstatusbg{opacity:.92;}
.rdstatusbg.clear{fill:#334155;}
.rdstatusbg.alert{fill:#B45309;}
.rdstatusbg.alert.fresh{animation:ledpulse .3s ease-in-out 4 alternate;}
.rdstatustext{font:700 10px 'IBM Plex Mono',monospace; fill:#F8FAFC; letter-spacing:.05em;}
.rdbannerbg{fill:#0F172A; opacity:.9;}
.rdbannertext{font:700 10px 'IBM Plex Mono',monospace; fill:#F8FAFC; letter-spacing:.04em;}`,
    },
    {
      order: 1217,
      css: String.raw`@media (prefers-reduced-motion: reduce){
  .rdsweep, .rdripple, .rdstatusbg{animation:none !important;}
}`,
    },
    {
      order: 1401,
      css: String.raw`body.sk-editorial .rdring,
body.sk-editorial .rdedge{stroke:#C3B9A9;}
body.sk-editorial .rdthresh{stroke:var(--ed-warn);}
body.sk-editorial .rdzone{fill:rgba(93,103,99,.05); stroke:#8B8F88;}
body.sk-editorial .rdzone.occ{fill:rgba(14,91,86,.12); stroke:var(--ed-accent);}
body.sk-editorial .rdzlbl{fill:#696E69;}
body.sk-editorial .rdzlbl.occ{fill:var(--ed-accent-deep);}
body.sk-editorial .rdtrack{stroke:#6F7975;}
body.sk-editorial .rdtrackdot{fill:#6F7975;}
body.sk-editorial .rdsubject{stroke:#EFE8DC;}`,
    },
    {
      order: 1672,
      css: String.raw`@media screen {

  body.sk-terminal .rdring,
  body.sk-terminal .rdedge{stroke:var(--tm-line);}
}
@media screen {
  body.sk-terminal .rdthresh{stroke:var(--tm-alert);}
}
@media screen {
  body.sk-terminal .rdzone{fill:rgba(116,135,126,.05); stroke:var(--tm-line);}
}
@media screen {
  body.sk-terminal .rdzone.occ{fill:rgba(94,235,154,.09); stroke:var(--tm-good);}
}
@media screen {
  body.sk-terminal .rdzlbl{fill:var(--tm-muted);}
}
@media screen {
  body.sk-terminal .rdzlbl.occ{fill:var(--tm-good);}
}
@media screen {
  body.sk-terminal .rdtrackdot{fill:var(--tm-muted);}
}`,
    },
    {
      order: 1830,
      css: String.raw`@media screen {
  body.sk-pastel .rdring,
  body.sk-pastel .rdedge { stroke:#344A67; }
}
@media screen {
  body.sk-pastel .rdthresh { stroke:#F0BE78; }
}
@media screen {
  body.sk-pastel .rdzone { fill:rgba(137,159,187,.08); stroke:#627793; }
}
@media screen {
  body.sk-pastel .rdzone.occ { fill:rgba(130,203,224,.15); stroke:#82CBE0; }
}
@media screen {
  body.sk-pastel .rdzlbl { fill:#7F94AD; }
}
@media screen {
  body.sk-pastel .rdzlbl.occ { fill:#B8E5F1; }
}
@media screen {
  body.sk-pastel .rdtrack { stroke:#7F94AD; }
}
@media screen {
  body.sk-pastel .rdtrackdot { fill:#7F94AD; }
}`,
    },
    {
      order: 2066,
      css: String.raw`@media screen {
  body.sk-blueprint .rdring,body.sk-blueprint .rdedge{stroke:#346F91;}
}
@media screen {
  body.sk-blueprint .rdzone{fill:rgba(105,187,209,.07);stroke:#5D9DB8;}
}
@media screen {
  body.sk-blueprint .rdzone.occ{fill:rgba(88,231,255,.14);stroke:#58E7FF;}
}
@media screen {
  body.sk-blueprint .rdzlbl{fill:#86B3CA;}
}
@media screen {
  body.sk-blueprint .rdzlbl.occ{fill:#D8FAFF;}
}
@media screen {
  body.sk-blueprint .docview .rdtrack{fill:none;stroke:#91BDD1;}
}
@media screen {
  body.sk-blueprint .docview .rdtrackdot{fill:#91BDD1;}
}`,
    },
  ],
});

/* radar authoring contract; merged into this panel definition by the bundle. */
PanelRegistry.extend('radar', {
  authoring: {
    template: { title: 'Radar' },
    setupFields: [
      ['sensor', 'json'],
      ['facing', 'num'],
      ['spread', 'num'],
      ['range', 'num'],
      ['threshold', 'num'],
      ['rings', 'jsonAny'],
      ['scale', 'json'],
      ['zones', 'jsonArr'],
      ['initial', 'json'],
    ],
    patchFields: [
      ['subject', 'json'],
      ['threshold', 'num'],
      ['alert', 'bool'],
      ['status', 'text'],
      ['banner', 'text'],
    ],
    picker: {
      order: 18,
      name: 'Range radar',
      category: 'Places & sensing',
      tagline: 'Distance makes the difference',
      description: 'Show measured range, occupied zones, and a reference threshold. Turn alerts on or off explicitly in each step.',
    },
    example: function (sample, context) {
      var panel = sample.panel,
        state = sample.state,
        states = sample.states,
        step = sample.step;
      state = { subject: { x: 195, y: 90 }, alert: true };
      panel.initial = builderClone(state);

      return { panel: panel, state: state, states: states, step: step };
    },
  },
});
/* ---- src/panels/types/replicas.js ---- */
/* replicas validation and pure state helpers. */
var REPLICA_STATUSES = ['online', 'offline', 'unknown'];
function replicaPosition(v) {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null;
}
function replicaSeries(v) {
  return typeof v === 'string' && v.trim() ? v : null;
}
function replicaCursor(v) {
  return panelObject(v) && replicaSeries(v.series) !== null && replicaPosition(v.position) !== null
    ? { series: v.series, position: v.position }
    : null;
}
function replicaPanelItems(p) {
  var seen = Object.create(null);
  return (Array.isArray(p.replicas) ? p.replicas : []).slice(0, 8).filter(function (r) {
    if (!panelObject(r) || typeof r.id !== 'string' || !r.id.trim() || seen[r.id]) return false;
    seen[r.id] = true;
    return true;
  });
}
function replicaPatchWarnings(state, path, p, warnings) {
  if (state == null) return;
  if (!panelObject(state)) {
    warnings.push(path + ': expected a state object');
    return;
  }
  function cursor(v, at) {
    if (v == null) return;
    if (!panelObject(v)) {
      warnings.push(at + ': expected an object or null — position unknown');
      return;
    }
    if (v.position != null && replicaPosition(v.position) === null)
      warnings.push(
        at + '.position: expected a non-negative safe integer or null — position unknown'
      );
    if (v.series != null && replicaSeries(v.series) === null)
      warnings.push(
        at + '.series: expected a non-empty sequence identity or null — comparison unavailable'
      );
  }
  cursor(state.reference, path + '.reference');
  if (state.replicas != null) {
    if (!panelObject(state.replicas))
      warnings.push(path + '.replicas: expected a snapshot keyed by replica id');
    else {
      var ids = replicaPanelItems(p).map(function (r) {
        return r.id;
      });
      Object.keys(state.replicas).forEach(function (id) {
        var at = path + '.replicas.' + id,
          r = state.replicas[id];
        if (ids.indexOf(id) < 0) {
          warnings.push(at + ': unknown replica — ignored');
          return;
        }
        cursor(r, at);
        if (!panelObject(r)) return;
        if (r.status != null && REPLICA_STATUSES.indexOf(r.status) < 0)
          warnings.push(at + '.status: expected online|offline|unknown — using unknown');
        if (r.lagMs != null && (!isFiniteNum(r.lagMs) || r.lagMs < 0))
          warnings.push(
            at + '.lagMs: expected finite non-negative milliseconds or null — reported lag unknown'
          );
        ['role', 'observedAt'].forEach(function (k) {
          if (r[k] != null && typeof r[k] !== 'string')
            warnings.push(at + '.' + k + ': expected a string or null — ignored');
        });
      });
    }
  }
  if (state.note != null && typeof state.note !== 'string')
    warnings.push(path + '.note: expected a string or null — ignored');
  if (state.enterOnce != null) {
    if (!panelObject(state.enterOnce)) warnings.push(path + '.enterOnce: expected an object');
    else {
      var once = Object.assign({}, state.enterOnce);
      delete once.enterOnce;
      replicaPatchWarnings(once, path + '.enterOnce', p, warnings);
    }
  }
}
function replicaPanelWarnings(p, path, warnings) {
  if (!Array.isArray(p.replicas) || !p.replicas.length)
    warnings.push(path + '.replicas: declare 1–8 replicas with unique string ids');
  else {
    if (p.replicas.length > 8) warnings.push(path + '.replicas: only the first 8 entries render');
    var seen = Object.create(null);
    p.replicas.forEach(function (r, i) {
      var at = path + '.replicas[' + i + ']';
      if (!panelObject(r) || typeof r.id !== 'string' || !r.id.trim()) {
        warnings.push(at + '.id: expected a non-empty string — skipped');
        return;
      }
      if (seen[r.id]) warnings.push(at + '.id: duplicate replica id — later entry skipped');
      seen[r.id] = true;
      if (r.label != null && typeof r.label !== 'string')
        warnings.push(at + '.label: expected a string — using id');
    });
  }
  if (p.unit != null && (typeof p.unit !== 'string' || !p.unit.trim()))
    warnings.push(path + '.unit: expected a non-empty string — using positions');
  replicaPatchWarnings(p.initial, path + '.initial', p, warnings);
}

PanelRegistry.extend('replicas', {
  validateDeclaration: function (p, PP, warnings, errors, d) {
    replicaPanelWarnings(p, PP, warnings);
  },
  validatePatch: function (patch, path, panel, warnings, context) {
    replicaPatchWarnings(patch, path, panel, warnings);
  },
});

/* replicas panel: presentation model and renderer. Shared lifecycle lives in ../shared.js. */
function replicaModel(panel, state) {
  state = panelObject(state) ? state : {};
  var ref = replicaCursor(state.reference),
    unit = replicaSeries(panel.unit) || 'positions';
  var rows = replicaPanelItems(panel).map(function (r) {
    var s =
      panelOwn(state.replicas, r.id) && panelObject(state.replicas[r.id])
        ? state.replicas[r.id]
        : {};
    var cur = replicaCursor(s),
      delta = ref && cur && ref.series === cur.series ? cur.position - ref.position : null;
    return {
      id: r.id,
      label: typeof r.label === 'string' ? r.label : r.id,
      position: replicaPosition(s.position),
      series: replicaSeries(s.series),
      role: typeof s.role === 'string' ? s.role : '',
      observedAt: typeof s.observedAt === 'string' ? s.observedAt : '',
      status: REPLICA_STATUSES.indexOf(s.status) >= 0 ? s.status : 'unknown',
      lagMs: isFiniteNum(s.lagMs) && s.lagMs >= 0 ? s.lagMs : null,
      delta: delta,
      comparison:
        delta !== null
          ? delta === 0
            ? 'equal'
            : delta < 0
            ? 'behind'
            : 'ahead'
          : !cur
          ? 'unknown'
          : !ref
          ? 'no-reference'
          : 'different-series',
    };
  });
  var comparable = rows.filter(function (r) {
    return r.delta !== null;
  });
  var positions = comparable.map(function (r) {
    return r.position;
  });
  if (ref) positions.push(ref.position);
  var min = positions.length ? Math.min.apply(null, positions) : null;
  var max = positions.length ? Math.max.apply(null, positions) : null;
  function pct(value) {
    return min === max ? 50 : ((value - min) / (max - min)) * 100;
  }
  rows.forEach(function (r) {
    r.pct = r.delta !== null ? pct(r.position) : null;
  });
  return {
    reference: ref,
    rows: rows,
    comparable: comparable.length,
    min: min,
    max: max,
    referencePct: ref ? pct(ref.position) : null,
    unit: unit,
    note: typeof state.note === 'string' ? state.note : '',
  };
}
function replicaPanelHTML(panel, state) {
  var m = replicaModel(panel, state),
    ref = m.reference;
  var h =
    '<div class="replicas-view"><div class="rep-reference"><b>' +
    (ref ? 'Reference ' + esc(String(ref.position)) + ' ' + esc(m.unit) : 'Reference unavailable') +
    '</b>' +
    (ref
      ? '<div>Sequence: ' + esc(ref.series) + '</div>'
      : '<div>A position and sequence identity are required.</div>') +
    '</div>';
  if (ref)
    h +=
      '<div class="rep-scale">Position window: ' +
      esc(String(m.min)) +
      ' – ' +
      esc(String(m.max)) +
      ' ' +
      esc(m.unit) +
      ' · dashed marker = reference</div>';
  h += '<div class="rep-list" tabindex="0" role="region" aria-label="Replica observations">';
  m.rows.forEach(function (r) {
    var comparison =
      r.comparison === 'equal'
        ? 'At reference'
        : r.delta !== null
        ? Math.abs(r.delta) + ' ' + m.unit + ' ' + r.comparison
        : r.comparison === 'different-series'
        ? 'Different sequence · not compared'
        : r.comparison === 'no-reference'
        ? 'No reference · not compared'
        : 'Position or sequence unknown';
    h +=
      '<div class="rep-row"><div class="rep-head"><b>' +
      esc(r.label) +
      '</b><span class="rep-status">' +
      esc(r.status) +
      '</span></div>' +
      (r.role ? '<div class="rep-role">' + esc(r.role) + '</div>' : '') +
      '<div class="rep-value">Position ' +
      (r.position === null ? 'unknown' : esc(String(r.position))) +
      '</div>' +
      '<div class="rep-series">Sequence: ' +
      (r.series === null ? 'unknown' : esc(r.series)) +
      '</div>' +
      '<div class="rep-track" aria-hidden="true">' +
      (ref ? '<i class="rep-reference-mark" style="left:' + m.referencePct + '%"></i>' : '') +
      (r.pct !== null ? '<i class="rep-position-mark" style="left:' + r.pct + '%"></i>' : '') +
      '</div>' +
      '<div class="rep-comparison">' +
      esc(comparison) +
      '</div><div class="rep-lag">Reported lag: ' +
      (r.lagMs === null ? 'unknown' : esc(String(r.lagMs)) + ' ms') +
      '</div><div class="rep-observed">Observed: ' +
      (r.observedAt ? esc(r.observedAt) : 'time unknown') +
      '</div></div>';
  });
  if (!m.rows.length) h += '<div class="swempty">No replicas declared</div>';
  h +=
    '</div><p class="rep-note">' +
    m.comparable +
    ' / ' +
    m.rows.length +
    ' positions comparable. Position equality does not prove availability, commit, or read safety. Lag is supplied separately; it is not a catch-up estimate.</p>';
  if (m.note) h += '<p class="rep-note">' + esc(m.note) + '</p>';
  return h + '</div>';
}

PanelViews.register('replicas', function (host, panel, state, skin, states, stepIdx, animate) {
  var h = '';
  h = replicaPanelHTML(panel, state);
  return { html: h };
});

PanelRegistry.extend('replicas', {
  order: 27,
  label: 'Replicas',
  since: '0.1.0',
});

PanelRegistry.extend('replicas', {
  styles: [
    {
      order: 239,
      css: String.raw`.replicas-view{color:var(--dtext);font:11px/1.5 'IBM Plex Mono',monospace;overflow-wrap:anywhere;}
.rep-reference{padding:8px;border:1px solid currentColor;border-radius:6px;margin-bottom:8px;}
.rep-reference b,.rep-head b{color:var(--dink);}
.rep-scale,.rep-note,.rep-observed,.rep-series{font-size:10px;color:var(--dfaint);}
.rep-list{max-height:480px;overflow:auto;}
.rep-list:focus-visible{outline:2px solid var(--dink);outline-offset:-2px;}
.rep-row{padding:10px 2px;border-bottom:1px solid color-mix(in srgb,var(--dtext) 22%,transparent);}
.rep-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px;}
.rep-status{font-size:9px;text-transform:uppercase;border:1px solid currentColor;border-radius:4px;padding:1px 4px;}
.rep-role{font-size:10px;}
.rep-value{margin-top:5px;font-weight:600;}
.rep-track{position:relative;height:18px;margin:4px 6px;background:linear-gradient(transparent 8px,currentColor 8px,currentColor 9px,transparent 9px);}
.rep-reference-mark{position:absolute;top:0;height:18px;border-left:2px dashed currentColor;opacity:.55;}
.rep-position-mark{position:absolute;top:4px;width:9px;height:9px;border-radius:50%;background:var(--dink);transform:translateX(-50%);}
.rep-comparison{font-weight:600;}
.rep-note{margin:9px 0 0;}
@media print{
  .panelcol .pwidget.pt-replicas{display:block !important;break-inside:avoid;}
}
@media print{
  .panelcol:has(.pt-replicas){display:flex !important;}
}
@media print{
  .rep-list{max-height:none;overflow:visible;}
}
@media print{
  .replicas-view{color:#222;--dink:#111;--dfaint:#555;}
}`,
    },
  ],
});

/* replicas authoring contract; merged into this panel definition by the bundle. */
PanelRegistry.extend('replicas', {
  authoring: {
    template: {
      title: 'Replica positions',
      unit: 'records',
      replicas: [
        { id: 'primary', label: 'Primary' },
        { id: 'follower', label: 'Follower' },
      ],
      initial: {
        reference: { series: 'example/log-a', position: 104 },
        replicas: {
          primary: {
            series: 'example/log-a',
            position: 104,
            role: 'primary',
            status: 'online',
            lagMs: 0,
            observedAt: 'example t=0',
          },
          follower: {
            series: 'example/log-a',
            position: 101,
            role: 'follower',
            status: 'online',
            lagMs: null,
            observedAt: 'example t=0',
          },
        },
        note: 'Fictional positions. Replace with evidence; report lag independently.',
      },
    },
    setupFields: [
      ['unit', 'text'],
      ['replicas', 'rows', { cols: [{ k: 'id', req: true }, { k: 'label' }], max: 8 }],
      ['initial', 'json'],
    ],
    patchFields: [
      ['reference', 'json'],
      ['replicas', 'json'],
      ['note', 'text'],
    ],
    picker: {
      order: 4,
      name: 'Replica positions',
      category: 'Software & data',
      tagline: 'Who has caught up?',
      description:
        'Compare primary and follower positions, roles, and independently reported replication lag.',
    },
  },
});
/* ---- src/panels/types/screen.js ---- */
/* screen validation and pure state helpers. */
var SCENE_NAMES = [
  'person-at-door-night',
  'person-through-door',
  'doorbell-run-away',
  'doorbell-runners',
  'package-drop',
  'kitchen-fire',
  'static-noise',
];
var SCREEN_MODES = ['off', 'boot', 'active', 'live', 'rec', 'save', 'unavailable'];
function screenPatchWarnings(state, path, warnings) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return;
  if (state.mode != null && SCREEN_MODES.indexOf(state.mode) < 0)
    warnings.push(path + '.mode: unknown camera mode — using off');
  if (state.reason != null && typeof state.reason !== 'string')
    warnings.push(path + '.reason: expected text or null — using the default explanation');
  if (
    Object.prototype.hasOwnProperty.call(state, 'scenePlayback') &&
    ['waiting', 'playing'].indexOf(state.scenePlayback) < 0
  )
    warnings.push(path + '.scenePlayback: expected waiting|playing — using playing');
  if (state.enterOnce && typeof state.enterOnce === 'object' && !Array.isArray(state.enterOnce)) {
    var once = Object.assign({}, state.enterOnce);
    delete once.enterOnce;
    screenPatchWarnings(once, path + '.enterOnce', warnings);
  }
}

PanelRegistry.extend('screen', {
  validateDeclaration: function (p, PP, warnings, errors, d) {
    if (p.scene && SCENE_NAMES.indexOf(p.scene) < 0)
      warnings.push(
        PP +
          '.scene: unknown scene "' +
          p.scene +
          '" — using "static-noise" (valid: ' +
          SCENE_NAMES.join(' ') +
          ')'
      );
    screenPatchWarnings(p.initial, PP + '.initial', warnings);
  },
  validatePatch: function (patch, path, panel, warnings, context) {
    screenPatchWarnings(patch, path, warnings);
  },
});

/* screen panel: presentation model and renderer. Shared lifecycle lives in ../shared.js. */
/* ---------------- stock scenes for the screen widget ---------------- */
function porchSceneBackdrop(night) {
  /* Shared fixed artwork, with actual surface colors under day/night light.
     Keep the legacy doorway and floor anchors for the existing clip tracks. */
  return (
    '<rect width="320" height="180" fill="' +
    (night ? '#192D56' : '#93D4EF') +
    '"/>' +
    (night
      ? '<circle cx="275" cy="18" r="9" fill="#FFE4AD"/><g fill="#BED8FF"><circle cx="38" cy="12" r="1"/><circle cx="230" cy="9" r="1"/><circle cx="303" cy="32" r="1"/></g>'
      : '') +
    '<path d="M0 29H320V150H0Z" fill="' +
    (night ? '#344D72' : '#EFCBB1') +
    '"/>' +
    '<path d="M0 30H320M0 51H320M0 73H320M0 95H320M0 117H320M0 139H320" stroke="' +
    (night ? '#476389' : '#C5A28E') +
    '" opacity=".5"/>' +
    '<rect y="150" width="320" height="30" fill="' +
    (night ? '#59657B' : '#BA9673') +
    '"/>' +
    '<path d="M0 164H320M53 150L38 180M273 150L289 180" stroke="' +
    (night ? '#7D8593' : '#E6CBA3') +
    '" opacity=".6"/>' +
    '<rect x="25" y="52" width="64" height="53" rx="2" fill="' +
    (night ? '#E9AB60' : '#6BB9DA') +
    '" stroke="#E9D8BC" stroke-width="3"/>' +
    '<path d="M57 52V105M25 78H89" stroke="#F2E5CF" stroke-width="3"/>' +
    '<path d="M31 58H49L31 72ZM63 84H81L63 99Z" fill="#FFF1CC" opacity=".28"/>' +
    '<rect x="114" y="25" width="92" height="129" rx="3" fill="#EAD7B9"/>' +
    '<rect x="118" y="29" width="84" height="121" rx="2" fill="' +
    (night ? '#277E87' : '#278F92') +
    '"/>' +
    '<path d="M127 39H193V83H127ZM127 104H193V140H127Z" fill="' +
    (night ? '#36959C' : '#40ACAA') +
    '" stroke="#72C6BA"/>' +
    '<circle cx="188" cy="94" r="3" fill="#FFD07B"/>' +
    '<path d="M121 157H201L208 170H114Z" fill="#65544B"/>' +
    (night
      ? '<path d="M224 61L192 150H260Z" fill="#FFD384" opacity=".12"/><ellipse cx="225" cy="152" rx="42" ry="6" fill="#FFCC80" opacity=".13"/>'
      : '') +
    '<rect x="219" y="44" width="11" height="22" rx="4" fill="#293B4C"/><rect x="221" y="48" width="7" height="13" rx="2" fill="#FFE2A3"/>' +
    '<path d="M284 137H303L299 153H288Z" fill="#CB7754"/>' +
    '<path d="M293 139V109M293 127Q274 126 280 112Q292 115 293 127M293 119Q310 119 308 104Q295 104 293 119" fill="' +
    (night ? '#498668' : '#58A762') +
    '" stroke="#8BC987" stroke-width="2"/>'
  );
}
function doorbellRunScene(pair) {
  /* Fixed artwork shared by the two stock clips. Local coordinates put each
     runner's feet at the origin, so distance scales the whole stride/shadow.
     No SVG IDs: multiple doorbells can play independently on the same page. */
  function runner(second) {
    return (
      '<g class="doorbell-runner' +
      (second ? ' doorbell-runner-second' : '') +
      '">' +
      '<ellipse cx="0" cy="1" rx="13" ry="3" fill="#152B30" opacity=".28"/>' +
      '<g class="doorbell-bounce" stroke-linecap="round" stroke-linejoin="round">' +
      '<g fill="none" stroke="#243D50" stroke-width="6">' +
      '<path class="doorbell-leg doorbell-leg-back" d="M-4-27L-10-14L-5-2"/>' +
      '<path class="doorbell-leg" d="M4-27L11-16L7-3"/>' +
      '</g><g fill="none" stroke="var(--runner-sleeve)" stroke-width="6">' +
      '<path class="doorbell-arm doorbell-arm-back" d="M-8-46L-16-34L-20-42"/>' +
      '<path class="doorbell-arm" d="M8-46L17-35L21-42"/>' +
      '</g><path d="M-8-49Q0-53 8-49L10-28Q0-24-10-28Z" fill="var(--runner-shirt)"/>' +
      '<path d="M-6-49Q0-38 6-49" fill="var(--runner-sleeve)"/>' +
      '<path d="M0-40V-30" stroke="var(--runner-sleeve)" stroke-width="1.2" opacity=".55"/>' +
      '<path d="M-7-29Q0-26 7-29" fill="none" stroke="var(--runner-sleeve)" stroke-width="2"/>' +
      '<path d="M0-54V-51" stroke="#C49070" stroke-width="6"/>' +
      '<circle cx="0" cy="-61" r="8" fill="#D7A27E"/>' +
      '<path d="M-8-60Q-10-72 0-72Q10-71 8-60L5-55H-5Z" fill="#293237"/>' +
      '</g></g>'
    );
  }
  return (
    '<svg viewBox="0 0 320 180" class="scene scene-doorbell" aria-hidden="true">' +
    '<rect width="320" height="180" fill="#87D0ED"/>' +
    '<path d="M24 54Q72 49 112 55T226 53T306 51V85H24Z" fill="#4C936A"/>' +
    '<path d="M43 61L84 35L127 60Z" fill="#345D88"/>' +
    '<path d="M51 60H118V84H51Z" fill="#F0CDA3"/>' +
    '<path d="M62 66H76V77H62ZM91 65H106V78H91Z" fill="#63ACD3"/>' +
    '<path d="M68 66V77M98 65V78" stroke="#DDE0CF" stroke-width="1.4"/>' +
    '<path d="M206 63L244 38L281 63Z" fill="#5068A1"/>' +
    '<path d="M213 62H274V84H213Z" fill="#F0BFAA"/>' +
    '<path d="M225 68H239V79H225ZM249 68H263V79H249Z" fill="#508DBC"/>' +
    '<path d="M31 82Q160 76 290 82V98Q160 92 31 98Z" fill="#516570"/>' +
    '<path d="M40 87Q160 81 280 87" fill="none" stroke="#D2CCAD" stroke-width="1" stroke-dasharray="16 18" opacity=".65"/>' +
    '<path d="M22 99Q160 91 300 99L315 149H5Z" fill="#79AE68"/>' +
    '<path d="M23 97Q160 89 297 97L299 103Q160 94 21 103Z" fill="#D5C7AE"/>' +
    '<path d="M156 99H184L219 148H106Z" fill="#E6D3AD"/>' +
    '<path d="M145 114H195M128 134H210" fill="none" stroke="#C0AD88" stroke-width="1"/>' +
    '<path d="M0 148Q160 136 320 148V180H0Z" fill="#C39E7A"/>' +
    '<path d="M0 158Q160 146 320 158M64 145L41 180M248 145L273 180" fill="none" stroke="#F0D7B0" stroke-width="1.5" opacity=".65"/>' +
    '<path d="M101 171Q158 167 215 171L222 180H94Z" fill="#615E50"/>' +
    '<path d="M42 134L38 93M43 112L54 101" fill="none" stroke="#8C7755" stroke-width="4"/>' +
    '<g fill="#408A5A"><ellipse cx="36" cy="88" rx="20" ry="16"/><ellipse cx="52" cy="98" rx="17" ry="13"/>' +
    '<ellipse cx="279" cy="117" rx="25" ry="14"/><ellipse cx="290" cy="104" rx="20" ry="16"/></g>' +
    runner(false) +
    (pair ? runner(true) : '') +
    /* Door-frame edges and bowed porch roof suggest the wide doorbell lens. */
    '<path d="M0 0H320V13Q160-2 0 13Z" fill="#273D44"/>' +
    '<path d="M0 0H15Q24 89 14 180H0ZM320 0H305Q297 90 308 180H320Z" fill="#426F79"/>' +
    '<path d="M9 18Q17 90 9 166M312 19Q306 90 314 166" fill="none" stroke="#91B7AD" stroke-width="2" opacity=".55"/>' +
    '<path d="M0 0H45Q3 15 0 49ZM320 0H275Q317 15 320 49ZM0 180V139Q6 171 41 180ZM320 180V139Q314 171 279 180Z" fill="#11272F" opacity=".25"/>' +
    '<text x="293" y="171" text-anchor="end" fill="#F4EEDC" opacity=".85" font-family="monospace" font-size="5" letter-spacing="1">FRONT DOOR · DEMO</text>' +
    '</svg>'
  );
}
var SCENE_LABELS = {
  'person-at-door-night': 'Visitor at night',
  'person-through-door': 'Person walking through a door',
  'doorbell-run-away': 'Doorbell: person running away',
  'doorbell-runners': 'Doorbell: two people running away',
  'package-drop': 'Package delivery',
  'kitchen-fire': 'Kitchen fire',
  'static-noise': 'Static noise',
};
var SCENES = {
  'doorbell-run-away': doorbellRunScene(false),
  'doorbell-runners': doorbellRunScene(true),
  'person-at-door-night':
    '<svg viewBox="0 0 320 180" class="scene" aria-hidden="true">' +
    porchSceneBackdrop(true) +
    '<g class="walker"><ellipse cy="152" rx="15" ry="3" fill="#1A2945" opacity=".3"/>' +
    '<path d="M-4 126L-6 147M4 126L6 147" stroke="#385A88" stroke-width="6" stroke-linecap="round"/>' +
    '<path d="M-8 148H-3M3 148H9" stroke="#1C304D" stroke-width="4" stroke-linecap="round"/>' +
    '<path d="M-8 102L-12 122M8 102L12 119" stroke="#DC9250" stroke-width="6" stroke-linecap="round"/>' +
    '<rect x="-9" y="96" width="18" height="34" rx="6" fill="#F2B65E"/>' +
    '<path d="M0 100V125M-6 115H-2M2 115H6" stroke="#CD824B" stroke-width="1.5"/>' +
    '<path d="M0 93V97" stroke="#C78966" stroke-width="6"/>' +
    '<circle cy="86" r="9" fill="#E9B38A"/><path d="M-9 85Q-9 74 1 76Q10 75 9 85L4 81L-9 83Z" fill="#3D3243"/>' +
    '</g></svg>',
  'package-drop':
    /* courier + package positions are the ANIMATION END STATES' anchors: the
       courier group is parked off-canvas by default CSS (reduced motion shows
       only the delivered package), the package is visible by default and the
       running animation hides it until the drop beat */
    '<svg viewBox="0 0 320 180" class="scene" aria-hidden="true">' +
    porchSceneBackdrop(false) +
    '<g class="courier"><ellipse cy="152" rx="15" ry="3" fill="#5E493E" opacity=".2"/>' +
    '<path d="M-4 126L-6 147M4 126L6 147" stroke="#263C64" stroke-width="6" stroke-linecap="round"/>' +
    '<path d="M-8 148H-3M3 148H9" stroke="#182B49" stroke-width="4" stroke-linecap="round"/>' +
    '<rect x="-9" y="94" width="18" height="34" rx="6" fill="#4C92E0"/>' +
    '<path d="M-6 102H6M-7 120H7" stroke="#ABD8EF" stroke-width="2"/>' +
    '<path d="M-8 100L-11 122M8 101L14 114" stroke="#3273BB" stroke-width="6" stroke-linecap="round"/>' +
    '<path d="M0 91V96" stroke="#AA6B48" stroke-width="6"/>' +
    '<circle cy="84" r="9" fill="#CE9367"/><path d="M-9 82Q-9 73 0 74Q10 74 9 82H14V85H-9Z" fill="#2858A0"/>' +
    '<g class="carried"><rect x="9" y="104" width="20" height="15" rx="2" fill="#DEA05E" stroke="#AF713F" stroke-width="1.5"/>' +
    '<path d="M19 105V118" stroke="#F8D39B" stroke-width="3"/></g></g>' +
    '<g class="pkg"><ellipse cx="239" cy="153" rx="27" ry="4" fill="#715443" opacity=".25"/>' +
    '<rect x="216" y="118" width="46" height="34" rx="3" fill="#DEA05E" stroke="#AF713F" stroke-width="2"/>' +
    '<path d="M239 119V151" stroke="#F8D39B" stroke-width="6"/><path d="M217 127H261" stroke="#BB7D43"/>' +
    '<rect x="244" y="134" width="12" height="9" rx="1" fill="#FFF0D3"/><path d="M247 137H253M247 140H251" stroke="#967654"/>' +
    '</g></svg>',
  'person-through-door':
    /* A single six-second entry: approach, door opens, cross the threshold,
       door closes. No IDs or external assets, so many cameras can coexist.
       CSS defaults hold a readable mid-entry pose for reduced motion. */
    '<svg viewBox="0 0 320 180" class="scene scene-entry" aria-hidden="true">' +
    '<rect width="320" height="180" fill="#E7BEA6"/>' +
    '<path d="M0 150H320V180H0Z" fill="#BE9A77"/>' +
    '<path d="M0 160H320M0 177H320M64 150L40 180M140 150L132 180M230 150L242 180" stroke="#E4CFAB" stroke-opacity=".35"/>' +
    '<rect x="28" y="40" width="74" height="66" rx="3" fill="#77BBDD" stroke="#F4DDC0" stroke-width="3"/>' +
    '<path d="M65 40V106M28 73H102" stroke="#EEDBC0" stroke-width="3"/>' +
    '<path d="M34 47H58L34 69ZM72 80H95L72 100Z" fill="#E0F9FF" opacity=".14"/>' +
    '<rect x="168" y="22" width="88" height="132" rx="3" fill="#F3DDC0"/>' +
    '<rect x="174" y="28" width="76" height="124" fill="#D8B47F"/>' +
    '<path d="M174 28H250V48H200V152H174Z" fill="#AD8259"/>' +
    '<path d="M200 48H250V152H200Z" fill="#F3D5A4"/>' +
    '<path d="M210 56H238V107H210Z" fill="#BC9669"/><path d="M213 59H235V104H213Z" fill="#6F9DAD"/>' +
    '<path class="entry-light" d="M174 152H250L282 180H139Z" fill="#FFDB9E" opacity=".22"/>' +
    '<rect x="270" y="58" width="9" height="23" rx="4" fill="#F3E8D5"/>' +
    '<circle cx="274.5" cy="65" r="2" fill="#31A99F"/>' +
    '<ellipse cx="294" cy="152" rx="16" ry="4" fill="#10282E"/>' +
    '<path d="M286 137H303L300 153H289Z" fill="#D57D54"/>' +
    '<path d="M294 140V111M294 126Q275 127 282 114Q294 113 294 126M294 119Q306 120 310 105Q296 103 294 119" fill="#4C9B60" stroke="#77C87A" stroke-width="2"/>' +
    '<g class="entry-person"><ellipse cx="0" cy="155" rx="16" ry="4" fill="#0A1D24" opacity=".3"/>' +
    '<g class="entry-stride" fill="none" stroke-linecap="round">' +
    '<path class="entry-leg entry-leg-back" d="M2 127L-4 141L-7 153" stroke="#182E40" stroke-width="7"/>' +
    '<path class="entry-arm entry-arm-back" d="M0 106L-10 117L-13 128" stroke="#496ABA" stroke-width="6"/>' +
    '<path class="entry-leg" d="M0 126L7 140L9 153" stroke="#294D5E" stroke-width="7"/>' +
    '<path d="M0 105L0 126" stroke="#7894DF" stroke-width="17"/>' +
    '<path class="entry-arm" d="M2 106L12 116L14 126" stroke="#91ADF2" stroke-width="6"/>' +
    '<path d="M1 95V100" stroke="#D9A17E" stroke-width="6"/>' +
    '<circle cx="1" cy="87" r="9" fill="#E4B38B"/>' +
    '<path d="M-7 86Q-9 76 2 76Q12 77 10 86L6 83L-7 84Z" fill="#24313D"/>' +
    '</g></g>' +
    '<g class="entry-door"><rect x="174" y="28" width="76" height="124" fill="#208F94" stroke="#1C657B" stroke-width="2"/>' +
    '<rect x="183" y="39" width="58" height="47" rx="2" fill="#3CAFAD" stroke="#81D4BF"/>' +
    '<rect x="183" y="108" width="58" height="34" rx="2" fill="#21818B" stroke="#58B8B1"/>' +
    '<path d="M231 99H240" stroke="#F4D795" stroke-width="3" stroke-linecap="round"/></g>' +
    '<path d="M172 28V153H251" fill="none" stroke="#F5E6CA" stroke-width="3"/>' +
    '<rect x="197" y="158" width="52" height="10" rx="3" fill="#10282E" opacity=".65"/>' +
    '</svg>',
  'kitchen-fire':
    '<svg viewBox="0 0 320 180" class="scene scene-fire" aria-hidden="true">' +
    '<rect width="320" height="180" fill="#F0D1B2"/>' +
    '<path d="M0 143H320V180H0Z" fill="#C79A78"/>' +
    '<path d="M0 162H320M57 143L42 180M139 143L133 180M235 143L247 180" stroke="#E8C5A0" stroke-opacity=".35"/>' +
    '<rect x="23" y="33" width="84" height="62" rx="2" fill="#6FBCDF" stroke="#FFF0D4" stroke-width="3"/>' +
    '<path d="M65 33V95M23 63H107" stroke="#F7E8CD" stroke-width="3"/>' +
    '<path d="M30 41H57L30 58ZM72 70H99L72 88Z" fill="#E4F9FF" opacity=".15"/>' +
    '<rect x="16" y="110" width="292" height="40" rx="2" fill="#287A91"/>' +
    '<path d="M24 116H87V144H24ZM96 116H163V144H96ZM172 117H197V144H172Z" fill="#429BB0" stroke="#78C7CE"/>' +
    '<path d="M74 122H79M150 122H155M185 122H190" stroke="#E6C27A" stroke-width="2" stroke-linecap="round"/>' +
    '<rect x="203" y="111" width="72" height="39" fill="#263C49"/>' +
    '<rect x="213" y="122" width="52" height="22" rx="2" fill="#102633" stroke="#66808D"/>' +
    '<path d="M217 127H260" stroke="#92A3A9" stroke-width="2"/>' +
    '<circle cx="221" cy="116" r="2" fill="#C0C7BE"/><circle cx="237" cy="116" r="2" fill="#C0C7BE"/><circle cx="253" cy="116" r="2" fill="#C0C7BE"/>' +
    '<rect x="12" y="104" width="300" height="8" rx="2" fill="#EEE4D0"/>' +
    '<path d="M116 104V91Q116 84 123 84Q130 84 130 91" fill="none" stroke="#B9C9C6" stroke-width="3"/>' +
    '<ellipse cx="144" cy="106" rx="24" ry="2" fill="#3A5661"/>' +
    '<g class="fire-glow"><ellipse cx="234" cy="99" rx="78" ry="74" fill="#F98036" opacity=".12"/>' +
    '<ellipse cx="234" cy="105" rx="46" ry="52" fill="#FFB45C" opacity=".13"/>' +
    '<ellipse cx="234" cy="159" rx="60" ry="11" fill="#FFAC55" opacity=".18"/></g>' +
    '<g fill="#746779"><g class="fire-smoke"><circle cx="237" cy="64" r="14" opacity=".23"/><circle cx="224" cy="55" r="18" opacity=".19"/></g>' +
    '<g class="fire-smoke fire-smoke-late"><circle cx="241" cy="65" r="18" opacity=".2"/><circle cx="224" cy="55" r="15" opacity=".16"/></g></g>' +
    '<ellipse cx="235" cy="105" rx="32" ry="3" fill="#182A34"/>' +
    '<path d="M214 96H258L253 108H220Z" fill="#253D4A" stroke="#819096" stroke-width="1.5"/>' +
    '<path d="M256 97H270" stroke="#667B84" stroke-width="3" stroke-linecap="round"/>' +
    '<path class="fire-flame fire-outer" d="M216 100C202 87 217 72 215 59C225 64 226 74 228 77C231 61 243 53 239 35C260 54 247 64 252 75C259 72 259 66 259 62C273 82 266 98 254 103Z" fill="#EE6938"/>' +
    '<path class="fire-flame fire-middle" d="M221 101C212 90 226 82 224 70C232 75 232 82 234 84C243 75 244 62 243 56C257 72 246 79 251 89C258 85 257 80 257 78C264 92 254 103 245 105Z" fill="#FFB74F"/>' +
    '<path class="fire-flame fire-core" d="M230 103C224 98 231 90 233 84C240 89 235 94 241 96C247 91 246 87 247 85C255 97 247 106 239 107Z" fill="#FFE6A0"/>' +
    '<g fill="#FFD180"><circle class="fire-ember" cx="229" cy="66" r="1.5"/>' +
    '<circle class="fire-ember fire-ember-late" cx="252" cy="72" r="1.2"/></g>' +
    '<ellipse cx="157" cy="21" rx="13" ry="5" fill="#FFF3DB"/>' +
    '<path d="M150 21H159" stroke="#627F8F" stroke-width="1.5"/>' +
    '<circle class="fire-alarm" cx="164" cy="21" r="1.8" fill="#FF8658"/>' +
    '</svg>',
  'static-noise':
    '<svg viewBox="0 0 320 180" class="scene" aria-hidden="true">' +
    '<rect width="320" height="180" fill="#182C49"/>' +
    '<g opacity=".7"><path d="M0 0H46V118H0Z" fill="#DAE4E9"/><path d="M46 0H92V118H46Z" fill="#E2BF58"/>' +
    '<path d="M92 0H138V118H92Z" fill="#51BCCB"/><path d="M138 0H184V118H138Z" fill="#66BC83"/>' +
    '<path d="M184 0H230V118H184Z" fill="#B474C9"/><path d="M230 0H276V118H230Z" fill="#D6737E"/>' +
    '<path d="M276 0H320V118H276Z" fill="#538ECE"/></g>' +
    '<path d="M0 124H80V144H0Z" fill="#27507D"/><path d="M80 124H160V144H80Z" fill="#BDD5DE"/>' +
    '<path d="M160 124H240V144H160Z" fill="#725687"/><path d="M240 124H320V144H240Z" fill="#2D3E60"/>' +
    '<g class="flick" opacity=".32"><path d="M0 12H320V16H0ZM0 90H320V92H0Z" fill="#DCF0FA"/>' +
    '<path d="M0 52H320V56H0ZM0 132H320V135H0Z" fill="#142640"/>' +
    '<path d="M0 160H109V162H0Z" fill="#5DBECC"/><path d="M176 160H320V162H176Z" fill="#CD78B4"/></g></svg>',
};

PanelViews.register('screen', function (host, panel, state, skin, states, stepIdx, animate) {
  var h = '';
  var mode = String(state.mode || 'off');
  if (SCREEN_MODES.indexOf(mode) < 0) mode = 'off';
  var sceneName = SCENE_NAMES.indexOf(panel.scene) >= 0 ? panel.scene : 'static-noise';
  var scrClass =
    'screenbox m-' +
    mode +
    (state.scenePlayback === 'waiting' && ['active', 'live', 'rec', 'save'].indexOf(mode) >= 0
      ? ' scene-waiting'
      : '');
  /* overlays are built separately from the scene so a mode change between
       two scene-showing modes can swap ONLY the overlays (surgical path
       below) and keep the scene subtree's animation state (the walker) */
  var scrOvl = '';
  if (mode === 'active') scrOvl += '<span class="ovl activechip">ACTIVE</span>';
  if (mode === 'live') scrOvl += '<span class="ovl livechip">LIVE</span>';
  if (mode === 'rec') scrOvl += '<span class="ovl recchip"><span class="recdot"></span>REC</span>';
  if (mode === 'save')
    scrOvl += '<span class="ovl banner">' + esc(state.banner || 'SAVING CLIP') + '</span>';
  if (mode === 'off') scrOvl += '<span class="ovl offlabel">STANDBY</span>';
  if (mode === 'unavailable')
    scrOvl +=
      '<div class="ovl screen-unavailable" role="status">' +
      '<svg viewBox="0 0 40 32" aria-hidden="true"><rect x="6" y="9" width="24" height="17" rx="4"/><path d="M12 9 L15 5 H23 L26 9 M3 3 L36 30"/><circle cx="18" cy="17" r="5"/></svg>' +
      '<strong>Camera unavailable</strong><span>' +
      esc(
        typeof state.reason === 'string' && state.reason.trim()
          ? state.reason
          : 'Video is temporarily unavailable.'
      ) +
      '</span></div>';
  h += '<div class="' + scrClass + '">';
  if (mode === 'boot') h += SCENES['static-noise'];
  else if (mode === 'active' || mode === 'live' || mode === 'rec' || mode === 'save')
    h += SCENES[sceneName];
  h += scrOvl + '</div>';
  return {
    html: h,
    patch: function () {
      /* screen surgical path: consecutive modes that both show the SAME scene
     (active / live / rec / save) swap only the mode class and the overlay chips,
     keeping the scene subtree — the walker's animation state survives.
     Any other transition (off/boot involved, or a first render) rebuilds. */
      var surgical = false;
      var SCENE_SHOWING = { active: true, live: true, rec: true, save: true };
      if (
        host._lastHTML != null &&
        sceneName === host._scrScene &&
        SCENE_SHOWING[mode] &&
        SCENE_SHOWING[host._scrMode]
      ) {
        var scrBox = host.querySelector('.screenbox');
        if (scrBox) {
          surgical = true;
          scrBox.className = scrClass;
          if (scrOvl !== host._scrOverlay) {
            var oldOvls = scrBox.querySelectorAll('.ovl');
            for (var ov = oldOvls.length - 1; ov >= 0; ov--)
              oldOvls[ov].parentNode.removeChild(oldOvls[ov]);
            if (scrOvl) scrBox.insertAdjacentHTML('beforeend', scrOvl);
          }
        }
      }
      host._scrMode = mode;
      host._scrScene = sceneName;
      host._scrOverlay = scrOvl;
      return surgical;
    },
  };
});

PanelRegistry.extend('screen', {
  order: 4,
  label: 'Camera screen',
  since: '0.1.0',
  layout: {
    height: 8,
  },
});

PanelRegistry.extend('screen', {
  styles: [
    {
      order: 478,
      css: String.raw`.screenbox{position:relative; border-radius:8px; overflow:hidden; aspect-ratio:16/9; background:#05080B;}
.screenbox .scene{display:block; width:100%; height:100%;}
.screenbox.m-active .walker, .screenbox.m-live .walker, .screenbox.m-rec .walker, .screenbox.m-save .walker{animation:walkin 3.2s ease-out forwards;}
@keyframes walkin{from{transform:translateX(40px);} to{transform:translateX(160px);}}
.screenbox .walker{transform:translateX(160px);}`,
    },
    {
      order: 484,
      css: String.raw`.screenbox .courier{transform:translateX(-40px);}
.screenbox.m-active .courier, .screenbox.m-live .courier, .screenbox.m-rec .courier, .screenbox.m-save .courier{animation:courierrun 5s ease-in-out forwards;}
@keyframes courierrun{0%{transform:translateX(-30px);} 42%{transform:translateX(238px);} 58%{transform:translateX(238px);} 100%{transform:translateX(-40px);}}
.screenbox.m-active .courier .carried, .screenbox.m-live .courier .carried, .screenbox.m-rec .courier .carried, .screenbox.m-save .courier .carried{animation:carrydrop 5s step-end forwards;}
@keyframes carrydrop{0%{opacity:1;} 50%{opacity:0;} 100%{opacity:0;}}
.screenbox.m-active .pkg, .screenbox.m-live .pkg, .screenbox.m-rec .pkg, .screenbox.m-save .pkg{animation:pkgdrop 5s ease-out forwards;}
@keyframes pkgdrop{0%,49%{opacity:0; transform:translateY(-6px);} 56%{opacity:1; transform:translateY(0);} 100%{opacity:1;}}`,
    },
    {
      order: 492,
      css: String.raw`.screenbox .entry-person{transform-origin:0 155px;transform:translate(215px,-8px) scale(.83);}
.screenbox .entry-door{transform-origin:174px 28px;transform:skewY(-12deg) scaleX(.24);}
.screenbox .entry-leg{transform-origin:0 127px;}
.screenbox .entry-arm{transform-origin:0 106px;}
.screenbox:is(.m-active,.m-live,.m-rec,.m-save) .entry-person{animation:entrycross 6.8s linear forwards;}
.screenbox:is(.m-active,.m-live,.m-rec,.m-save) .entry-door{animation:entryopen 6.8s ease-in-out forwards;}
.screenbox:is(.m-active,.m-live,.m-rec,.m-save) .entry-light{animation:entrylight 6.8s ease-in-out forwards;}
.screenbox:is(.m-active,.m-live,.m-rec,.m-save) .entry-leg,
.screenbox:is(.m-active,.m-live,.m-rec,.m-save) .entry-arm{animation:entrystride .68s ease-in-out 8 alternate;}
.screenbox:is(.m-active,.m-live,.m-rec,.m-save) .entry-leg-back,
.screenbox:is(.m-active,.m-live,.m-rec,.m-save) .entry-arm:not(.entry-arm-back){animation-direction:alternate-reverse;}
@keyframes entrycross{
  0%{transform:translate(22px,0) scale(1);opacity:1;}
  38%{transform:translate(185px,0) scale(1);opacity:1;}
  50%{transform:translate(208px,-2px) scale(.95);opacity:1;}
  69%{transform:translate(226px,-10px) scale(.76);opacity:1;}
  79%,100%{transform:translate(232px,-15px) scale(.65);opacity:0;}
}
@keyframes entryopen{
  0%,22%,100%{transform:skewY(0) scaleX(1);}
  40%,80%{transform:skewY(-12deg) scaleX(.24);}
}
@keyframes entrylight{0%,22%,100%{opacity:0;}40%,80%{opacity:.22;}}
@keyframes entrystride{from{transform:rotate(-17deg);}to{transform:rotate(17deg);}}`,
    },
    {
      order: 506,
      css: String.raw`.screenbox .doorbell-runner{--runner-shirt:#F2A14F;--runner-sleeve:#CE753B;--runner-delay:0s;transform-origin:0 0;transform:translate(143px,125px) scale(.78);}
.screenbox .doorbell-runner-second{--runner-shirt:#58B8DB;--runner-sleeve:#367FB5;--runner-delay:.42s;transform:translate(186px,135px) scale(.88);}
.screenbox .doorbell-leg{transform-origin:0 -27px;transform:rotate(-12deg) scaleY(.65);}
.screenbox .doorbell-leg-back{transform:rotate(12deg);}
.screenbox .doorbell-arm{transform-origin:8px -46px;transform:rotate(-18deg);}
.screenbox .doorbell-arm-back{transform-origin:-8px -46px;transform:rotate(18deg);}
.screenbox:is(.m-active,.m-live,.m-rec,.m-save) .doorbell-runner{animation:doorbellaway 7.2s linear var(--runner-delay) both;}
.screenbox:is(.m-active,.m-live,.m-rec,.m-save) .doorbell-runner-second{animation-name:doorbellawaysecond;}
.screenbox:is(.m-active,.m-live,.m-rec,.m-save) .doorbell-bounce{animation:doorbellbounce .32s ease-in-out var(--runner-delay) 23;}
.screenbox:is(.m-active,.m-live,.m-rec,.m-save) .doorbell-leg{animation:doorbellstride .16s ease-in-out var(--runner-delay) 46 alternate;}
.screenbox:is(.m-active,.m-live,.m-rec,.m-save) .doorbell-arm{animation:doorbellarms .16s ease-in-out var(--runner-delay) 46 alternate;}
.screenbox:is(.m-active,.m-live,.m-rec,.m-save) .doorbell-leg-back,
.screenbox:is(.m-active,.m-live,.m-rec,.m-save) .doorbell-arm:not(.doorbell-arm-back){animation-direction:alternate-reverse;}
@keyframes doorbellaway{
  0%{transform:translate(105px,180px) scale(1.35);}
  16%{transform:translate(130px,146px) scale(.98);}
  37%{transform:translate(154px,119px) scale(.66);}
  60%{transform:translate(170px,103px) scale(.42);}
  72%{transform:translate(180px,99px) scale(.33);}
  82%{transform:translate(220px,97px) scale(.3);}
  100%{transform:translate(339px,96px) scale(.27);}
}
@keyframes doorbellawaysecond{
  0%{transform:translate(213px,178px) scale(1.25);}
  16%{transform:translate(191px,149px) scale(1);}
  37%{transform:translate(177px,122px) scale(.68);}
  60%{transform:translate(168px,104px) scale(.43);}
  72%{transform:translate(156px,99px) scale(.33);}
  82%{transform:translate(109px,97px) scale(.3);}
  100%{transform:translate(-19px,96px) scale(.27);}
}
@keyframes doorbellbounce{0%,100%{transform:translateY(0);}50%{transform:translateY(-3px);}}
@keyframes doorbellstride{from{transform:rotate(-14deg) scaleY(.48);}to{transform:rotate(14deg) scaleY(1);}}
@keyframes doorbellarms{from{transform:rotate(-26deg);}to{transform:rotate(24deg);}}`,
    },
    {
      order: 524,
      css: String.raw`.screenbox .fire-flame{transform-origin:239px 105px;}
.screenbox .fire-glow{filter:blur(10px);}
.screenbox .fire-smoke{transform-origin:233px 72px;filter:blur(3px);}
.screenbox:is(.m-active,.m-live,.m-rec,.m-save) .fire-flame{animation:firebreathe 1.1s ease-in-out infinite alternate;}
.screenbox:is(.m-active,.m-live,.m-rec,.m-save) .fire-middle{animation-duration:.83s;animation-delay:-.4s;}
.screenbox:is(.m-active,.m-live,.m-rec,.m-save) .fire-core{animation-duration:.67s;animation-delay:-.2s;}
.screenbox:is(.m-active,.m-live,.m-rec,.m-save) .fire-glow{animation:fireglow 2.2s ease-in-out infinite alternate;}
.screenbox:is(.m-active,.m-live,.m-rec,.m-save) .fire-smoke{animation:firerise 3.8s ease-out infinite;}
.screenbox:is(.m-active,.m-live,.m-rec,.m-save) .fire-smoke-late{animation-delay:-1.9s;}
.screenbox:is(.m-active,.m-live,.m-rec,.m-save) .fire-ember{animation:fireember 2.6s ease-out infinite;}
.screenbox:is(.m-active,.m-live,.m-rec,.m-save) .fire-ember-late{animation-delay:-1.3s;}
.screenbox:is(.m-active,.m-live,.m-rec,.m-save) .fire-alarm{animation:fireglow 1.5s ease-in-out infinite alternate;}
@keyframes firebreathe{from{transform:scale(.96,.87) skewX(-3deg);}to{transform:scale(1.04,1.05) skewX(3deg);}}
@keyframes fireglow{from{opacity:.55;}to{opacity:1;}}
@keyframes firerise{0%{transform:translate(0,0) scale(.7);opacity:0;}20%{opacity:.9;}100%{transform:translate(-28px,-57px) scale(1.9);opacity:0;}}
@keyframes fireember{0%{transform:translate(0,0);opacity:0;}15%{opacity:.8;}100%{transform:translate(-12px,-45px);opacity:0;}}`,
    },
    {
      order: 541,
      css: String.raw`.screenbox.scene-waiting .scene *{animation:none !important;}
.screenbox.scene-waiting :is(.walker,.courier,.pkg,.entry-person,.doorbell-runner,.fire-flame,.fire-glow,.fire-smoke,.fire-ember,.fire-alarm){visibility:hidden;}
.screenbox.scene-waiting .entry-door{transform:none;}
.screenbox.scene-waiting .entry-light{opacity:0;}
@media(prefers-reduced-motion:reduce){
  .screenbox :is(.scene-entry,.scene-doorbell,.scene-fire) *{animation:none !important;}
}
@media print{
  .screenbox :is(.scene-entry,.scene-doorbell,.scene-fire) *{animation:none !important;}
}
@media print{
  .screenbox{print-color-adjust:exact;}
}
.screenbox.m-boot .flick{animation:flicker .18s steps(2) infinite;}
@keyframes flicker{50%{opacity:.3; transform:translateY(3px);}}
.ovl{position:absolute; font:700 10.5px 'IBM Plex Mono',monospace; letter-spacing:.08em;}
.offlabel{inset:0; display:flex; align-items:center; justify-content:center; color:#2E3A46;}
.activechip{top:8px;left:8px;color:#FFF;text-shadow:0 1px 3px #000,0 0 2px #000;}
.livechip{top:8px; left:8px; color:#0B1220; background:#4ADE80; padding:2px 7px; border-radius:4px;}
.recchip{top:8px; left:8px; color:#FFB0A6; background:rgba(8,20,35,.8); padding:3px 6px; border-radius:5px; display:flex; align-items:center; gap:5px;}
.recdot{width:8px; height:8px; border-radius:50%; background:#FF3B30; animation:recblink 1s steps(1) infinite;}
@keyframes recblink{50%{opacity:.15;}}
.banner{left:0; right:0; bottom:0; text-align:center; padding:5px 0; color:#0B1220; background:#FFB454;}`,
    },
    {
      order: 1201,
      css: String.raw`@media (prefers-reduced-motion: reduce){
  .screenbox .courier, .screenbox .courier .carried, .screenbox .pkg{animation:none !important;}
}
@media (prefers-reduced-motion: reduce){
  .screenbox .walker{transform:translateX(160px);}
}`,
    },
    {
      order: 1582,
      css: String.raw`@media screen {
  body.sk-terminal .livechip{color:var(--tm-ground); background:var(--tm-good); border-radius:0;}
}
@media screen {
  body.sk-terminal .recchip{color:var(--tm-alert);}
}
@media screen {
  body.sk-terminal .recdot{background-color:var(--tm-alert);}
}
@media screen {
  body.sk-terminal .banner{color:var(--tm-ground); background:var(--tm-alert);}
}`,
    },
    {
      order: 1790,
      css: String.raw`@media screen {
  body.sk-pastel .screenbox { background:#142033; }
}
@media screen {
  body.sk-pastel .livechip { color:#1E4935; background:#8AD1AA; border-radius:999px; padding:3px 8px; }
}
@media screen {
  body.sk-pastel .recchip { color:#F29AA3; }
}
@media screen {
  body.sk-pastel .recdot { background:#E66C77; }
}
@media screen {
  body.sk-pastel .banner { color:#604716; background:#F2CE8F; }
}`,
    },
    {
      order: 2028,
      css: String.raw`@media screen {
  body.sk-blueprint .offlabel{color:#7DA9C1;}
}
@media screen {
  body.sk-blueprint .livechip{color:#04264F;background:#47F590;border-radius:0;}
}
@media screen {
  body.sk-blueprint .banner{color:#052956;background:#FFD166;}
}`,
    },
    {
      order: 2450,
      css: String.raw`.screenbox.m-unavailable{background:radial-gradient(ellipse at 50% 10%,#263C52,#101A28 85%);}
.screen-unavailable{inset:0;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:7px;padding:16px;box-sizing:border-box;overflow:auto;text-align:center;color:#E6EDF6;}
.screen-unavailable svg{flex:none;width:40px;height:32px;fill:none;stroke:#A8C3E2;stroke-width:2;stroke-linecap:round;}
.screen-unavailable strong{font:600 14px 'IBM Plex Sans',system-ui,sans-serif;}
.screen-unavailable span{font:400 12px/1.4 'IBM Plex Sans',system-ui,sans-serif;overflow-wrap:anywhere;max-width:36em;}`,
    },
    {
      order: 2459,
      css: String.raw`@media print{
  .screenbox.m-unavailable{print-color-adjust:exact;}
}`,
    },
  ],
});

PanelRegistry.extend('screen', {
  editorStyles: [
    {
      order: 503,
      css: String.raw`.screen-scene-control{flex:1;min-width:0;display:grid;gap:8px;}
.screen-scene-control>.fctl{width:100%;min-width:0;}
.screen-scene-preview{min-width:0;}
.screen-scene-footer{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-top:6px;}
.screen-scene-footer .bbtn{min-height:32px;}`,
    },
  ],
});

/* screen authoring contract; merged into this panel definition by the bundle. */
var SCENE_TOKENS = [
  'person-at-door-night',
  'person-through-door',
  'doorbell-run-away',
  'doorbell-runners',
  'package-drop',
  'kitchen-fire',
  'static-noise',
];

/* A local preview never patches camera mode or advances the story. Replay
   replaces only this SVG, so it cannot reset the diagram's animation. */
function screenScenePreview(initialScene) {
  var wrap = document.createElement('div');
  wrap.className = 'screen-scene-preview';
  var box = document.createElement('div');
  box.className = 'screenbox m-live';
  box.setAttribute('role', 'img');
  wrap.appendChild(box);
  var foot = document.createElement('div');
  foot.className = 'screen-scene-footer';
  var note = document.createElement('span');
  note.className = 'fnote';
  note.textContent = 'Simulated clip preview';
  var replay = document.createElement('button');
  replay.type = 'button';
  replay.className = 'bbtn';
  replay.textContent = 'Replay clip';
  foot.appendChild(note);
  foot.appendChild(replay);
  wrap.appendChild(foot);
  var selected;
  function setScene(scene) {
    selected = SCENE_TOKENS.indexOf(scene) >= 0 ? scene : 'static-noise';
    box.innerHTML = SCENES[selected];
    box.setAttribute('aria-label', SCENE_LABELS[selected] + ' — simulated clip preview');
  }
  replay.addEventListener('click', function () {
    setScene(selected);
  });
  setScene(initialScene);
  return { element: wrap, setScene: setScene };
}

PanelRegistry.extend('screen', {
  authoring: {
    template: { title: 'Camera', scene: 'static-noise', initial: { mode: 'off' } },
    setupFields: [
      ['scene', 'scene'],
      ['initial', 'json'],
    ],
    patchFields: [
      ['mode', 'enum', SCREEN_MODES],
      ['scenePlayback', 'enum', ['waiting', 'playing']],
      ['banner', 'text'],
      ['reason', 'text'],
    ],
    picker: {
      order: 15,
      name: 'Camera view',
      category: 'Places & sensing',
      tagline: 'What the camera sees',
      description:
        'Show a camera scene moving through live view, recording, saving, and other modes.',
    },
    example: function (sample, context) {
      var panel = sample.panel,
        state = sample.state,
        states = sample.states,
        step = sample.step;
      panel.scene = 'person-through-door';
      state = { mode: 'live' };
      panel.initial = builderClone(state);

      return { panel: panel, state: state, states: states, step: step };
    },
    editor: function (context) {
      return {
        setupField: function (field, panel) {
          if (field[1] !== 'scene') return;
          var key = field[0],
            cur = panel[key];
          var scenes = document.createElement('div');
          scenes.className = 'screen-scene-control';
          var preview = screenScenePreview(cur);
          var picker = context.controls.select(
            SCENE_TOKENS,
            cur,
            function (v) {
              var ok = context.commit(key, v == null ? null : JSON.stringify(v));
              if (ok) preview.setScene(v);
              return ok;
            },
            true
          );
          picker.setAttribute('aria-label', 'Screen scene');
          scenes.appendChild(picker);
          scenes.appendChild(preview.element);
          return context.controls.block(key, scenes);
        },
        patchField: function (f, input) {
          if (f[0] !== 'scenePlayback') return;
          input.setAttribute('aria-label', 'Scene event');
          Array.prototype.forEach.call(input.options, function (option) {
            if (option.value === 'waiting') option.textContent = 'Before event';
            else if (option.value === 'playing') option.textContent = 'Play event';
            else if (option.value === '') option.textContent = 'Inherit';
          });
        },
        patchIntro: function (body) {
          var sceneNote = document.createElement('p');
          sceneNote.className = 'home-note';
          sceneNote.textContent =
            'Active means on without livestreaming or recording. Unavailable hides the scene and shows the reason (for example, protective shutdown). Mode, reason and scene event carry independently; the reason is visible only in Unavailable mode.';
          body.appendChild(sceneNote);
        },
        patchLabel: function (key) {
          return key === 'scenePlayback' ? 'Scene event' : key;
        },
      };
    },
  },
});
/* ---- src/panels/types/signal.js ---- */
/* signal validation and pure state helpers. */
var SIGNAL_STATES_V = ['ok', 'weak', 'retrying', 'lost', 'jammed'];
var SIGNAL_TRANSPORTS_V = [
  'wifi',
  'subghz',
  'thread',
  'zigbee',
  'zwave',
  'cellular',
  'poe',
  'ethernet',
  'ble',
];
function signalLinkWarnings(obj, path, warnings) {
  if (!obj || typeof obj !== 'object') return;
  Object.keys(obj).forEach(function (k) {
    var v = obj[k];
    if (!v || typeof v !== 'object') return;
    if (v.state != null && SIGNAL_STATES_V.indexOf(v.state) < 0)
      warnings.push(
        path +
          '.' +
          k +
          '.state: unknown link state "' +
          v.state +
          '" — using "ok" (valid: ' +
          SIGNAL_STATES_V.join(' ') +
          ')'
      );
    if (
      v.bars != null &&
      !(typeof v.bars === 'number' && isFinite(v.bars) && v.bars >= 0 && v.bars <= 4)
    )
      warnings.push(path + '.' + k + '.bars: expected 0–4 — bars hidden');
    Object.keys(v).forEach(function (f) {
      if (['state', 'bars', 'note'].indexOf(f) < 0)
        warnings.push(
          path +
            '.' +
            k +
            '.' +
            f +
            ': not a signal field — ignored (valid: state, bars, note; put dBm figures in note)'
        );
    });
  });
}

/* tiles per-tile status checks shared by initial and step patches: each key
   is a tile id whose value is {state, sub}; a state outside the declared
   vocabulary renders the tile dimmed */

PanelRegistry.extend('signal', {
  validateDeclaration: function (p, PP, warnings, errors, d) {
    if (!(Array.isArray(p.links) && p.links.length))
      warnings.push(
        PP + '.links: signal needs links:[{id, label, transport}] — panel renders empty'
      );
    else {
      if (p.links.length > 6)
        warnings.push(PP + '.links: more than 6 links — extra links are not rendered');
      p.links.forEach(function (l, li) {
        if (!l || !l.id) warnings.push(PP + '.links[' + li + ']: needs an id — link skipped');
        else if (l.transport != null && SIGNAL_TRANSPORTS_V.indexOf(l.transport) < 0)
          warnings.push(
            PP +
              '.links[' +
              li +
              '].transport: unknown transport "' +
              l.transport +
              '" — tag hidden (valid: ' +
              SIGNAL_TRANSPORTS_V.join(' ') +
              ')'
          );
      });
    }
    signalLinkWarnings(p.initial, PP + '.initial', warnings);
  },
  validatePatch: function (patch, path, panel, warnings, context) {
    signalLinkWarnings(patch, path, warnings);
  },
});

/* signal panel: presentation model and renderer. Shared lifecycle lives in ../shared.js. */
var SIGNAL_STATES = ['ok', 'weak', 'retrying', 'lost', 'jammed'];
var SIGNAL_TRANSPORTS = [
  'wifi',
  'subghz',
  'thread',
  'zigbee',
  'zwave',
  'cellular',
  'poe',
  'ethernet',
  'ble',
];
function signalModel(panel, state) {
  panel = panel || {};
  state = state || {};
  function fin(v) {
    return typeof v === 'number' && isFinite(v) ? v : null;
  }
  return (Array.isArray(panel.links) ? panel.links : [])
    .slice(0, 6)
    .map(function (l) {
      l = l || {};
      var st = l.id && state[l.id] && typeof state[l.id] === 'object' ? state[l.id] : {};
      var s = SIGNAL_STATES.indexOf(st.state) >= 0 ? st.state : 'ok';
      var bars = fin(st.bars) != null ? Math.round(clamp(st.bars, 0, 4)) : null;
      return {
        id: l.id,
        label: l.label || l.id || '',
        transport: SIGNAL_TRANSPORTS.indexOf(l.transport) >= 0 ? l.transport : null,
        state: s,
        bars: bars,
        note: st.note != null ? String(st.note) : '',
      };
    })
    .filter(function (l) {
      return l.id;
    });
}

PanelViews.register('signal', function (host, panel, state, skin, states, stepIdx, animate) {
  var h = '';
  var sgm = signalModel(panel, state);
  h += '<div class="sgrows">';
  sgm.forEach(function (l) {
    h += '<div class="sgrow s-' + l.state + '">';
    h += '<span class="sgtag">' + (l.transport ? esc(l.transport.toUpperCase()) : '') + '</span>';
    h += '<span class="sglabel">' + esc(l.label) + '</span>';
    h += '<span class="sgbars">';
    for (var sb = 1; sb <= 4; sb++)
      h +=
        '<span class="sgbar b' + sb + (l.bars != null && sb <= l.bars ? ' on' : '') + '"></span>';
    h += '</span>';
    h += '<span class="sgstate">' + l.state.toUpperCase() + '</span>';
    h += '<span class="sgnote">' + esc(l.note) + '</span>';
    h += '</div>';
  });
  h += '</div>';
  return { html: h };
});

PanelRegistry.extend('signal', {
  order: 17,
  label: 'Signal',
  since: '0.1.0',
});

PanelRegistry.extend('signal', {
  styles: [
    {
      order: 925,
      css: String.raw`.sgrows{display:flex; flex-direction:column; gap:7px;}
.sgrow{display:flex; align-items:center; gap:8px; font:600 10px 'IBM Plex Mono',monospace;}
.sgtag{min-width:52px; letter-spacing:.06em;}
.sk-aurora .sgtag{color:#5E7396;}
.sk-daylight .sgtag{color:#8A8474;}
.sglabel{min-width:70px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}
.sk-aurora .sglabel{color:#93A7C9;}
.sk-daylight .sglabel{color:#6B6F7A;}
.sgbars{display:flex; align-items:flex-end; gap:2px; height:12px;}
.sgbar{width:4px; border-radius:1px;}
.sgbar.b1{height:4px;}
.sgbar.b2{height:7px;}
.sgbar.b3{height:10px;}
.sgbar.b4{height:12px;}
.sk-aurora .sgbar{background:#22314A;}
.sk-daylight .sgbar{background:#E0DCD1;}
.sgrow.s-ok .sgbar.on{background:#4ADE80;}
.sgrow.s-weak .sgbar.on{background:#FFB454;}
.sgrow.s-retrying .sgbar.on{background:#A78BFA; animation:ledpulse .6s ease-in-out infinite alternate;}
.sgrow.s-lost .sgbar.on, .sgrow.s-jammed .sgbar.on{background:#FF6B5E;}
.sgstate{min-width:64px; letter-spacing:.07em; font-weight:700;}
.sgrow.s-ok .sgstate{color:#4ADE80;}
.sgrow.s-weak .sgstate{color:#FFB454;}
.sgrow.s-retrying .sgstate{color:#A78BFA;}
.sgrow.s-lost .sgstate{color:#FF6B5E;}
.sgrow.s-jammed .sgstate{color:#FF6B5E; animation:ledpulse .35s ease-in-out infinite alternate;}
.sk-daylight .sgrow.s-ok .sgstate{color:#0E7A3C;}
.sk-daylight .sgrow.s-weak .sgstate{color:#B0771A;}
.sk-daylight .sgrow.s-retrying .sgstate{color:#7C5CC4;}
.sk-daylight .sgrow.s-lost .sgstate, .sk-daylight .sgrow.s-jammed .sgstate{color:#B91C1C;}
.sgnote{margin-left:auto; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:45%;}
.sk-aurora .sgnote{color:#5E7396;}
.sk-daylight .sgnote{color:#8A8474;}`,
    },
    {
      order: 1221,
      css: String.raw`@media (prefers-reduced-motion: reduce){
  .sgrow.s-retrying .sgbar.on, .sgrow.s-jammed .sgstate{animation:none !important;}
}`,
    },
    {
      order: 1429,
      css: String.raw`body.sk-editorial .sk-aurora .sgbar,
body.sk-editorial .sk-daylight .sgbar{background:#D7CEC0;}`,
    },
    {
      order: 1433,
      css: String.raw`body.sk-editorial .sgrow.s-weak .sgbar.on{background:var(--ed-warn);}
body.sk-editorial .sgrow.s-retrying .sgbar.on{background:#76558B;}
body.sk-editorial .sgrow.s-lost .sgbar.on,
body.sk-editorial .sgrow.s-jammed .sgbar.on{background:var(--ed-bad);}
body.sk-editorial .sk-aurora .sgrow.s-ok .sgstate,
body.sk-editorial .sk-daylight .sgrow.s-ok .sgstate{color:var(--ed-good);}
body.sk-editorial .sk-aurora .sgrow.s-weak .sgstate,
body.sk-editorial .sk-daylight .sgrow.s-weak .sgstate{color:var(--ed-warn);}
body.sk-editorial .sk-aurora .sgrow.s-retrying .sgstate,
body.sk-editorial .sk-daylight .sgrow.s-retrying .sgstate{color:#76558B;}
body.sk-editorial .sk-aurora .sgrow.s-lost .sgstate,
body.sk-editorial .sk-aurora .sgrow.s-jammed .sgstate,
body.sk-editorial .sk-daylight .sgrow.s-lost .sgstate,
body.sk-editorial .sk-daylight .sgrow.s-jammed .sgstate{color:var(--ed-bad);}`,
    },
    {
      order: 1491,
      css: String.raw`@media (max-width:600px){
  body.sk-editorial .sgrow{gap:5px;}
}
@media (max-width:600px){
  body.sk-editorial .sgtag{min-width:45px;}
}
@media (max-width:600px){
  body.sk-editorial .sglabel{min-width:58px;}
}`,
    },
    {
      order: 1684,
      css: String.raw`@media screen {

  body.sk-terminal .sgrows{gap:0;}
}
@media screen {
  body.sk-terminal .sgrow{padding:6px 0; border-bottom:1px solid var(--tm-line-dim);}
}
@media screen {
  body.sk-terminal .sgtag,
  body.sk-terminal .sglabel,
  body.sk-terminal .sgnote,
  body.sk-terminal .sk-aurora .sgtag,
  body.sk-terminal .sk-aurora .sglabel,
  body.sk-terminal .sk-aurora .sgnote{color:var(--tm-muted);}
}
@media screen {
  body.sk-terminal .sgbar{border-radius:0; background:var(--tm-line) !important;}
}
@media screen {
  body.sk-terminal .sgrow.s-ok .sgbar.on{background:var(--tm-good) !important;}
}
@media screen {
  body.sk-terminal .sgrow.s-weak .sgbar.on,
  body.sk-terminal .sgrow.s-retrying .sgbar.on,
  body.sk-terminal .sgrow.s-lost .sgbar.on,
  body.sk-terminal .sgrow.s-jammed .sgbar.on{background:var(--tm-alert) !important;}
}
@media screen {
  body.sk-terminal .sgrow.s-ok .sgstate{color:var(--tm-good);}
}
@media screen {
  body.sk-terminal .sgrow.s-weak .sgstate,
  body.sk-terminal .sgrow.s-retrying .sgstate,
  body.sk-terminal .sgrow.s-lost .sgstate,
  body.sk-terminal .sgrow.s-jammed .sgstate{color:var(--tm-alert);}
}`,
    },
    {
      order: 1899,
      css: String.raw`@media screen {

  body.sk-pastel .sgrow { gap:9px; }
}
@media screen {
  body.sk-pastel .sgtag,
  body.sk-pastel .sglabel,
  body.sk-pastel .sgnote,
  body.sk-pastel .sk-aurora .sgtag,
  body.sk-pastel .sk-daylight .sgtag,
  body.sk-pastel .sk-aurora .sglabel,
  body.sk-pastel .sk-daylight .sglabel,
  body.sk-pastel .sk-aurora .sgnote,
  body.sk-pastel .sk-daylight .sgnote { color:#667389; }
}
@media screen {
  body.sk-pastel .sgbar { width:5px; border-radius:999px; }
}
@media screen {
  body.sk-pastel .sk-aurora .sgbar,
  body.sk-pastel .sk-daylight .sgbar { background:#D9E0E9; }
}
@media screen {
  body.sk-pastel .sgrow.s-ok .sgbar.on { background:#5EAF83; }
}
@media screen {
  body.sk-pastel .sgrow.s-weak .sgbar.on { background:#D19A4D; }
}
@media screen {
  body.sk-pastel .sgrow.s-retrying .sgbar.on { background:#8A7AD3; }
}
@media screen {
  body.sk-pastel .sgrow.s-lost .sgbar.on,
  body.sk-pastel .sgrow.s-jammed .sgbar.on { background:#D36370; }
}
@media screen {
  body.sk-pastel .sgrow.s-ok .sgstate,
  body.sk-pastel .sk-daylight .sgrow.s-ok .sgstate { color:#287A55; }
}
@media screen {
  body.sk-pastel .sgrow.s-weak .sgstate,
  body.sk-pastel .sk-daylight .sgrow.s-weak .sgstate { color:#9A641E; }
}
@media screen {
  body.sk-pastel .sgrow.s-retrying .sgstate,
  body.sk-pastel .sk-daylight .sgrow.s-retrying .sgstate { color:#6759B3; }
}
@media screen {
  body.sk-pastel .sgrow.s-lost .sgstate,
  body.sk-pastel .sgrow.s-jammed .sgstate,
  body.sk-pastel .sk-daylight .sgrow.s-lost .sgstate,
  body.sk-pastel .sk-daylight .sgrow.s-jammed .sgstate { color:#AE4654; }
}`,
    },
    {
      order: 2141,
      css: String.raw`@media screen {

  body.sk-blueprint .sgrows{gap:5px;}
}
@media screen {
  body.sk-blueprint .sgrow{gap:6px;font-size:9.5px;}
}
@media screen {
  body.sk-blueprint .docview .sgtag{color:#9BC2D5;}
}
@media screen {
  body.sk-blueprint .docview .sglabel{color:#D1E6F0;}
}
@media screen {
  body.sk-blueprint .docview .sgbar{background:#255D7D;}
}
@media screen {
  body.sk-blueprint .sgrow.s-ok .sgbar.on{background:#47F590;}
}
@media screen {
  body.sk-blueprint .sgrow.s-weak .sgbar.on{background:#FFD166;}
}
@media screen {
  body.sk-blueprint .sgrow.s-retrying .sgbar.on{background:#C3A4FF;}
}
@media screen {
  body.sk-blueprint .sgrow.s-lost .sgbar.on,body.sk-blueprint .sgrow.s-jammed .sgbar.on{background:#FF5C67;}
}
@media screen {
  body.sk-blueprint .sgrow.s-ok .sgstate{color:#47F590;}
}
@media screen {
  body.sk-blueprint .sgrow.s-weak .sgstate{color:#FFD166;}
}
@media screen {
  body.sk-blueprint .sgrow.s-retrying .sgstate{color:#C3A4FF;}
}
@media screen {
  body.sk-blueprint .sgrow.s-lost .sgstate,body.sk-blueprint .sgrow.s-jammed .sgstate{color:#FF7881;}
}
@media screen {
  body.sk-blueprint .docview .sgnote{color:#99BED1;}
}`,
    },
  ],
});

/* signal authoring contract; merged into this panel definition by the bundle. */
PanelRegistry.extend('signal', {
  authoring: {
    template: { title: 'Links', links: [{ id: 'up', label: 'uplink', transport: 'wifi' }] },
    setupFields: [
      [
        'links',
        'rows',
        {
          cols: [
            { k: 'id', req: true },
            { k: 'label' },
            {
              k: 'transport',
              kind: 'enum',
              options: [
                'wifi',
                'subghz',
                'thread',
                'zigbee',
                'zwave',
                'cellular',
                'poe',
                'ethernet',
                'ble',
              ],
            },
          ],
          max: 6,
        },
      ],
      ['initial', 'json'],
    ],
    patchFields: [],
    picker: {
      order: 22,
      name: 'Connection strength',
      category: 'Devices & interfaces',
      tagline: 'The health of a link',
      description:
        'Compare transport, connection status, signal strength, and notes for device links.',
    },
    expandPatchFields: function (decl) {
      return (Array.isArray(decl.links) ? decl.links : [])
        .filter(function (item) {
          return item && typeof item.id === 'string' && item.id !== '';
        })
        .map(function (item) {
          return [
            item.id,
            'objf',
            [
              ['state', 'enum', ['ok', 'weak', 'retrying', 'lost', 'jammed']],
              ['bars', 'num', { min: 0, max: 4 }],
              ['note', 'text'],
            ],
          ];
        });
    },
    example: function (sample, context) {
      var panel = sample.panel,
        state = sample.state,
        states = sample.states,
        step = sample.step;
      state = { up: { state: 'ok', bars: 3, note: 'Connected' } };
      panel.initial = builderClone(state);

      return { panel: panel, state: state, states: states, step: step };
    },
  },
});
/* ---- src/panels/types/state.js ---- */
/* state panel: presentation model and renderer. Shared lifecycle lives in ../shared.js. */
PanelViews.register('state', function (host, panel, state, skin, states, stepIdx, animate) {
  var h = '';
  var pulseSelector, pulseChanged;
  var cur = state.state != null ? String(state.state) : '—';
  pulseSelector = '.pchip.cur';
  pulseChanged = Object.prototype.hasOwnProperty.call(host, '_stateCur') && host._stateCur !== cur;
  host._stateCur = cur;
  var colors = panel.colors || {};
  var col = isHex(colors[cur]) ? colors[cur] : null;
  h +=
    '<div class="preadout"' + (col ? ' style="color:' + col + '"' : '') + '>' + esc(cur) + '</div>';
  h += '<div class="prail">';
  (panel.states || []).forEach(function (st) {
    h += '<span class="pchip' + (st === cur ? ' cur' : '') + '">' + esc(st) + '</span>';
  });
  h += '</div>';
  return {
    html: h,
    pulse: { selector: pulseSelector, changed: pulseChanged },
  };
});

PanelRegistry.extend('state', {
  order: 0,
  label: 'State',
  since: '0.1.0',
});

PanelRegistry.extend('state', {
  styles: [
    {
      order: 307,
      css: String.raw`.preadout{font:700 20px 'IBM Plex Mono',monospace; margin-bottom:8px;}
.sk-aurora .preadout{color:#EAF2FF;}
.sk-daylight .preadout{color:#23272E;}
.prail{display:flex; flex-wrap:wrap; gap:4px;}
.pchip{font:600 9.5px 'IBM Plex Mono',monospace; padding:3px 7px; border-radius:6px; border:1px solid transparent;}
.sk-aurora .pchip{background:#101A2C; color:#55627A; border-color:#1D2A40;}
.sk-aurora .pchip.cur{color:#8AE8FF; border-color:#38E1FF; background:#0C2230;}
.sk-daylight .pchip{background:#F4F2EC; color:#9A958A; border-color:#E0DCD1;}
.sk-daylight .pchip.cur{color:#4956C9; border-color:#4956C9; background:#EEF0FB;}`,
    },
    { order: 334, css: String.raw`.pchip.dv-chip-pulse{animation:dvchippulse .58s ease-out;}` },
    {
      order: 1357,
      css: String.raw`body.sk-editorial .sk-aurora .pchip,
body.sk-editorial .sk-daylight .pchip{
  border-color:var(--ed-rule);
  border-radius:2px;
  color:var(--ed-muted);
  background:var(--ed-paper);
}
body.sk-editorial .sk-aurora .pchip.cur,
body.sk-editorial .sk-daylight .pchip.cur{
  border-color:var(--ed-accent);
  color:var(--ed-accent-deep);
  background:var(--ed-accent-soft);
}`,
    },
    {
      order: 1568,
      css: String.raw`@media screen {

  body.sk-terminal .prail{gap:0;}
}
@media screen {
  body.sk-terminal .pchip,
  body.sk-terminal .sk-aurora .pchip{
    margin:-1px 0 0 -1px;
    padding:3px 6px;
    color:var(--tm-muted);
    background:var(--tm-raised);
    border:1px solid var(--tm-line-dim);
    border-radius:0;
    font-size:9px;
    letter-spacing:.07em;
    text-transform:uppercase;
  }
}
@media screen {
  body.sk-terminal .sk-aurora .pchip.cur{color:var(--tm-good); background:#0B1912; border-color:var(--tm-good);}
}`,
    },
    {
      order: 1774,
      css: String.raw`@media screen {
  body.sk-pastel .preadout[style] { filter:saturate(.68) brightness(.82); }
}
@media screen {
  body.sk-pastel .prail { gap:5px; }
}
@media screen {
  body.sk-pastel .pchip,
  body.sk-pastel .sk-aurora .pchip,
  body.sk-pastel .sk-daylight .pchip {
    color:#7A869A;
    background:#F3F6FA;
    border-color:#E2E8F1;
    border-radius:999px;
    padding:4px 8px;
  }
}
@media screen {
  body.sk-pastel .sk-aurora .pchip.cur,
  body.sk-pastel .sk-daylight .pchip.cur {
    color:#5263B9;
    background:#EEF0FF;
    border-color:#C9D0F1;
    box-shadow:0 2px 7px rgba(82,99,185,.10);
  }
}`,
    },
    {
      order: 2010,
      css: String.raw`@media screen {
  body.sk-blueprint .preadout{font-size:20px;line-height:1;margin-bottom:6px;}
}
@media screen {
  body.sk-blueprint .prail{gap:3px;}
}
@media screen {
  body.sk-blueprint .docview .pchip{
    padding:2px 6px;
    border-radius:0;
    color:#84AEC5;
    background:#04234A;
    border-color:#2F7395;
  }
}
@media screen {
  body.sk-blueprint .docview .pchip.cur{color:#FFFFFF;border-color:#8EEAFF;background:#0A447E;}
}`,
    },
  ],
});

/* state authoring contract; merged into this panel definition by the bundle. */
PanelRegistry.extend('state', {
  authoring: {
    template: { title: 'Device state', states: ['OFF', 'BOOT', 'LIVE'], initial: { state: 'OFF' } },
    setupFields: [
      ['states', 'csv'],
      ['colors', 'map'],
      ['initial', 'json'],
    ],
    patchFields: [['state', 'text']],
    picker: {
      order: 8,
      name: 'State machine',
      category: 'State & timing',
      tagline: 'The current state, clearly',
      description: 'Highlight the current state in a compact rail of possible states.',
    },
    expandPatchFields: function (decl) {
      var states = Array.isArray(decl.states) ? decl.states.map(String) : [];
      var stateField = states.length ? ['state', 'enum', states] : ['state', 'text'];
      return [stateField];
    },
    example: function (sample, context) {
      var panel = sample.panel,
        state = sample.state,
        states = sample.states,
        step = sample.step;
      state.state = 'LIVE';
      panel.initial = builderClone(state);

      return { panel: panel, state: state, states: states, step: step };
    },
  },
});
/* ---- src/panels/types/table.js ---- */
/* Table snapshots are authored rows, never executable queries. */
var TABLE_STATUSES = ['neutral', 'added', 'changed', 'removed'];
function tablePatchWarnings(state, path, panel, warnings) {
  softwarePanelPatchWarnings(state, path, panel, warnings, function (state, path, p, warnings) {
    var ids = softwarePanelItems(p).map(function (item) {
      return item.id;
    });
    if (state.rows != null) {
      if (!Array.isArray(state.rows))
        warnings.push(path + '.rows: expected an array — rendered empty');
      else {
        if (state.rows.length > 12) warnings.push(path + '.rows: only the first 12 rows render');
        var seen = Object.create(null);
        state.rows.forEach(function (row, i) {
          var at = path + '.rows[' + i + ']';
          if (!panelObject(row) || typeof row.id !== 'string' || !row.id) {
            warnings.push(at + '.id: needs a non-empty string — row skipped');
            return;
          }
          if (seen[row.id]) warnings.push(at + '.id: duplicate row id — later row skipped');
          seen[row.id] = true;
          if (!panelObject(row.cells))
            warnings.push(at + '.cells: expected an object keyed by column id');
          else
            Object.keys(row.cells).forEach(function (id) {
              if (ids.indexOf(id) < 0)
                warnings.push(at + '.cells.' + id + ': unknown column — ignored');
              else if (row.cells[id] != null && typeof row.cells[id] === 'object')
                warnings.push(
                  at +
                    '.cells.' +
                    id +
                    ': use a string, number, boolean, or null — object rendered as JSON'
                );
            });
          if (row.status != null && TABLE_STATUSES.indexOf(row.status) < 0)
            warnings.push(
              at + '.status: expected ' + TABLE_STATUSES.join('|') + ' — using neutral'
            );
        });
      }
    }
  });
}
PanelRegistry.extend('table', {
  itemCollection: { key: 'columns', max: 4 },
  validateDeclaration: function (panel, path, warnings) {
    panelCollectionWarnings(panel, path, warnings, 'columns', 4);
    tablePatchWarnings(panel.initial, path + '.initial', panel, warnings);
  },
  validatePatch: tablePatchWarnings,
});

/* table panel: presentation model and renderer. Shared lifecycle lives in ../shared.js. */
function tableModel(panel, state) {
  state = state || {};
  var columns = softwarePanelItems(panel),
    seen = Object.create(null);
  var rows = (Array.isArray(state.rows) ? state.rows : [])
    .slice(0, 12)
    .filter(function (row) {
      if (!panelObject(row) || typeof row.id !== 'string' || !row.id || seen[row.id]) return false;
      seen[row.id] = true;
      return true;
    })
    .map(function (row) {
      return {
        id: row.id,
        status: TABLE_STATUSES.indexOf(row.status) >= 0 ? row.status : 'neutral',
        cells: columns.map(function (col) {
          if (!panelOwn(row.cells, col.id)) return '—';
          var v = row.cells[col.id];
          if (v === null) return 'null';
          return typeof v === 'object' ? JSON.stringify(v) : String(v);
        }),
      };
    });
  return { columns: columns, rows: rows };
}

PanelViews.register('table', function (host, panel, state, skin, states, stepIdx, animate) {
  var h = '';
  var table = tableModel(panel, state);
  h +=
    '<div class="swtablewrap" tabindex="0" role="region" aria-label="' +
    esc(panel.title || 'Data state') +
    '">' +
    '<table class="swtable"><caption class="swcaption">' +
    esc(panel.title || 'Data state') +
    '</caption><thead><tr>';
  table.columns.forEach(function (col) {
    h += '<th scope="col">' + esc(col.label || col.id) + '</th>';
  });
  h += '<th scope="col">Change</th></tr></thead><tbody>';
  table.rows.forEach(function (row) {
    h += '<tr class="swrow-' + row.status + '">';
    row.cells.forEach(function (cell) {
      h += '<td>' + esc(cell) + '</td>';
    });
    h +=
      '<td><span class="swbadge sw-' +
      row.status +
      '">' +
      (row.status === 'neutral' ? '—' : row.status) +
      '</span></td></tr>';
  });
  if (!table.rows.length)
    h +=
      '<tr><td colspan="' +
      (table.columns.length + 1) +
      '" class="swempty">No rows at this step</td></tr>';
  h += '</tbody></table></div>';
  h = softwarePanelShell(h, state);
  return { html: h };
});

PanelRegistry.extend('table', {
  order: 23,
  label: 'Table',
  since: '0.1.0',
});

PanelRegistry.extend('table', {
  styles: [
    {
      order: 263,
      css: String.raw`.swtablewrap{overflow:auto; max-height:300px; border:1px solid color-mix(in srgb,var(--dtext) 20%,transparent); border-radius:6px;}
.swtablewrap:focus-visible{outline:2px solid var(--dink); outline-offset:2px;}
.swtable{width:100%; border-collapse:collapse; font:11px/1.5 'IBM Plex Mono',monospace; text-align:left;}
.swtable th,.swtable td{padding:7px 8px; border-bottom:1px solid color-mix(in srgb,var(--dtext) 14%,transparent); vertical-align:top;}
.swtable th{font-size:10px; color:var(--dink);}
.swtable td{min-width:45px; max-width:180px;}
.swtable tr:last-child td{border-bottom:0;}
.swcaption{position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset(50%);}
.swrow-added{background:color-mix(in srgb,var(--dtext) 5%,transparent);}
.swrow-changed{background:color-mix(in srgb,var(--dtext) 9%,transparent);}
.swrow-removed td:not(:last-child){text-decoration:line-through; opacity:.7;}`,
    },
  ],
});

/* table authoring contract; merged into this panel definition by the bundle. */
PanelRegistry.extend('table', {
  authoring: {
    template: {
      title: 'Data state',
      columns: [
        { id: 'key', label: 'Key' },
        { id: 'value', label: 'Value' },
      ],
      initial: {
        rows: [{ id: 'item', cells: { key: 'order.status', value: 'pending' }, status: 'added' }],
      },
    },
    setupFields: [
      ['columns', 'rows', { cols: [{ k: 'id', req: true }, { k: 'label' }], max: 4 }],
      ['initial', 'json'],
    ],
    patchFields: [
      ['rows', 'jsonArr'],
      ['note', 'text'],
    ],
    picker: {
      order: 0,
      name: 'Data table',
      category: 'Software & data',
      tagline: 'Records at a glance',
      description:
        'Show rows, changed values, and record status as a request moves through your system.',
    },
    example: function (sample, context) {
      var panel = sample.panel,
        state = sample.state,
        states = sample.states,
        step = sample.step;
      state.rows = [
        { id: 'order', cells: { key: 'order.status', value: 'confirmed' }, status: 'changed' },
        { id: 'payment', cells: { key: 'payment.id', value: 'pay_2048' }, status: 'added' },
        { id: 'stock', cells: { key: 'inventory', value: 'reserved' } },
      ];
      panel.initial = builderClone(state);

      return { panel: panel, state: state, states: states, step: step };
    },
  },
});
/* ---- src/panels/types/thermo.js ---- */
/* thermo validation and pure state helpers. */
/* Shared threshold normalization: old hot-only specs keep their exact behavior. */
function thermoLimits(panel) {
  var min = isFiniteNum(panel.min) ? panel.min : 0;
  var max = isFiniteNum(panel.max) && panel.max > min ? panel.max : min + 100;
  function bound(v) {
    return isFiniteNum(v) ? Math.min(max, Math.max(min, v)) : null;
  }
  var warn = bound(panel.warn),
    crit = bound(panel.crit);
  var lowWarn = bound(panel.lowWarn),
    lowCrit = bound(panel.lowCrit),
    swap;
  if (warn !== null && crit !== null && warn > crit) {
    swap = warn;
    warn = crit;
    crit = swap;
  }
  if (lowWarn !== null && lowCrit !== null && lowCrit > lowWarn) {
    swap = lowWarn;
    lowWarn = lowCrit;
    lowCrit = swap;
  }
  var coldEnd = lowWarn !== null ? lowWarn : lowCrit,
    hotStart = warn !== null ? warn : crit;
  var overlap = coldEnd !== null && hotStart !== null && coldEnd >= hotStart;
  if (overlap) lowWarn = lowCrit = null;
  return {
    min: min,
    max: max,
    warn: warn,
    crit: crit,
    lowWarn: lowWarn,
    lowCrit: lowCrit,
    overlap: overlap,
  };
}

PanelRegistry.extend('thermo', {
  validateDeclaration: function (p, PP, warnings, errors, d) {
    ['min', 'max', 'warn', 'crit', 'lowWarn', 'lowCrit'].forEach(function (tk) {
      if (p[tk] != null && !isFiniteNum(p[tk]))
        warnings.push(PP + '.' + tk + ': must be a finite number — ignored');
    });
    var tmin = isFiniteNum(p.min) ? p.min : 0;
    if (isFiniteNum(p.max) && p.max <= tmin)
      warnings.push(PP + '.max: must exceed min — using min+100');
    if (isFiniteNum(p.warn) && isFiniteNum(p.crit) && p.warn > p.crit)
      warnings.push(PP + ': warn exceeds crit — thresholds swapped at render');
    if (isFiniteNum(p.lowWarn) && isFiniteNum(p.lowCrit) && p.lowCrit > p.lowWarn)
      warnings.push(PP + ': lowCrit exceeds lowWarn — cold thresholds swapped at render');
    if (thermoLimits(p).overlap)
      warnings.push(
        PP + ': cold and hot ranges overlap — cold thresholds ignored; leave a safe interval'
      );
    if (p.initial && p.initial.value != null && !isFiniteNum(p.initial.value))
      warnings.push(PP + '.initial.value: must be a finite number — rendered as NO DATA');
  },
  validatePatch: function (patch, path, panel, warnings, context) {
    if (patch.value != null && !isFiniteNum(patch.value))
      warnings.push(path + '.value: must be a finite number — rendered as NO DATA');
  },
});

/* thermo panel: presentation model and renderer. Shared lifecycle lives in ../shared.js. */
var THERMO_ZONE_LABELS = {
  ok: 'NOMINAL',
  warn: 'WARNING',
  crit: 'CRITICAL',
  'cold-warn': 'COLD WARNING',
  'cold-crit': 'TOO COLD',
  na: 'NO DATA',
};
function thermoModel(panel, state) {
  panel = panel || {};
  state = state || {};
  /* finite-only: JSON overflow literals (1e400) parse to Infinity, which is
     typeof 'number' but would poison every percentage into NaN and emit
     invalid SVG/CSS attribute values — treat non-finite as absent */
  function fin(v) {
    return typeof v === 'number' && isFinite(v) ? v : null;
  }
  var limits = thermoLimits(panel),
    min = limits.min,
    max = limits.max;
  var warn = limits.warn,
    crit = limits.crit,
    lowWarn = limits.lowWarn,
    lowCrit = limits.lowCrit;
  var value = fin(state.value);
  var zone = 'na';
  if (value != null) {
    zone = 'ok';
    if (lowWarn != null && value <= lowWarn) zone = 'cold-warn';
    if (lowCrit != null && value <= lowCrit) zone = 'cold-crit';
    if (warn != null && value >= warn) zone = 'warn';
    if (crit != null && value >= crit) zone = 'crit';
  }
  function pct(v) {
    return clamp(((v - min) / (max - min)) * 100, 0, 100);
  }
  return {
    value: value,
    min: min,
    max: max,
    warn: warn,
    crit: crit,
    lowWarn: lowWarn,
    lowCrit: lowCrit,
    zone: zone,
    unit: panel.unit != null ? String(panel.unit) : '°C',
    pct: value != null ? pct(value) : 0,
    warnPct: warn != null ? pct(warn) : null,
    critPct: crit != null ? pct(crit) : null,
    lowWarnPct: lowWarn != null ? pct(lowWarn) : null,
    lowCritPct: lowCrit != null ? pct(lowCrit) : null,
    label: state.label != null ? String(state.label) : THERMO_ZONE_LABELS[zone],
  };
}

/* battery widget: charge level where LOW is bad — the inverse of thermo's
   zones. Pure model (node-testable). The engine COMPUTES the zone (ok / low /
   crit, both thresholds inclusive at-or-below) from the charge and the
   declared thresholds; `state.label` overrides only the zone-chip caption.
   Non-finite numbers (JSON 1e400 → Infinity) are treated as absent. Charge
   is a percentage, clamped to 0–100. Reversed thresholds (crit > low) are
   swapped (the validator warns). */

PanelViews.register('thermo', function (host, panel, state, skin, states, stepIdx, animate) {
  var h = '';
  var tm = thermoModel(panel, state);
  var idx = typeof stepIdx === 'number' ? stepIdx : 0;
  var tv = tm.value != null ? String(Math.round(tm.value * 10) / 10) : null;
  h +=
    '<div class="thhead"><div class="thval z-' +
    tm.zone +
    '">' +
    (tv != null ? esc(tv) : '&#8212;') +
    '<span class="thunit">' +
    esc(tm.unit) +
    '</span></div>' +
    '<span class="thzone z-' +
    tm.zone +
    '">' +
    esc(tm.label) +
    '</span></div>';
  /* threshold track: shaded warn/crit bands under the value fill, threshold
       ticks over it, numeric scale beneath */
  h += '<div class="thbar">';
  if (tm.lowWarnPct != null || tm.lowCritPct != null) {
    var safeStart = tm.lowWarnPct != null ? tm.lowWarnPct : tm.lowCritPct;
    var safeEnd = tm.warnPct != null ? tm.warnPct : tm.critPct != null ? tm.critPct : 100;
    h +=
      '<span class="thband safe" style="left:' +
      safeStart.toFixed(1) +
      '%;width:' +
      (safeEnd - safeStart).toFixed(1) +
      '%"></span>';
  }
  if (tm.lowWarnPct != null)
    h +=
      '<span class="thband cold-warn" style="left:' +
      (tm.lowCritPct || 0).toFixed(1) +
      '%;width:' +
      (tm.lowWarnPct - (tm.lowCritPct || 0)).toFixed(1) +
      '%"></span>';
  if (tm.lowCritPct != null)
    h +=
      '<span class="thband cold-crit" style="left:0;width:' +
      tm.lowCritPct.toFixed(1) +
      '%"></span>';
  if (tm.warnPct != null)
    h +=
      '<span class="thband warn" style="left:' +
      tm.warnPct.toFixed(1) +
      '%;width:' +
      ((tm.critPct != null ? tm.critPct : 100) - tm.warnPct).toFixed(1) +
      '%"></span>';
  if (tm.critPct != null)
    h +=
      '<span class="thband crit" style="left:' +
      tm.critPct.toFixed(1) +
      '%;width:' +
      (100 - tm.critPct).toFixed(1) +
      '%"></span>';
  if (tm.value != null)
    h += '<span class="thfill z-' + tm.zone + '" style="width:' + tm.pct.toFixed(1) + '%"></span>';
  if (tm.warnPct != null)
    h += '<span class="thtick warn" style="left:' + tm.warnPct.toFixed(1) + '%"></span>';
  if (tm.critPct != null)
    h += '<span class="thtick crit" style="left:' + tm.critPct.toFixed(1) + '%"></span>';
  ['lowWarn', 'lowCrit'].forEach(function (key) {
    if (tm[key] != null)
      h +=
        '<span class="thtick ' +
        (key === 'lowWarn' ? 'cold-warn' : 'cold-crit') +
        '" style="left:' +
        tm[key + 'Pct'].toFixed(1) +
        '%" title="' +
        (key === 'lowWarn' ? 'Cold warning' : 'Cold critical') +
        ': ' +
        esc(String(tm[key]) + tm.unit) +
        '"></span>';
  });
  h += '</div>';
  h += '<div class="thscale"><span class="lo">' + esc(String(tm.min)) + '</span>';
  if (tm.warn != null)
    h +=
      '<span class="warn" style="left:' +
      tm.warnPct.toFixed(1) +
      '%">' +
      esc(String(tm.warn)) +
      '</span>';
  if (tm.crit != null)
    h +=
      '<span class="crit" style="left:' +
      tm.critPct.toFixed(1) +
      '%">' +
      esc(String(tm.crit)) +
      '</span>';
  ['lowWarn', 'lowCrit'].forEach(function (key) {
    if (tm[key] != null)
      h +=
        '<span class="' +
        (key === 'lowWarn' ? 'cold-warn' : 'cold-crit') +
        '" style="left:' +
        tm[key + 'Pct'].toFixed(1) +
        '%">' +
        esc(String(tm[key])) +
        '</span>';
  });
  h += '<span class="hi">' + esc(String(tm.max)) + '</span></div>';
  if (tm.lowWarn != null || tm.lowCrit != null)
    h +=
      '<div class="thrange-key"><span>Cold limits</span><span>Safe interval</span><span>' +
      (tm.warn != null || tm.crit != null ? 'Hot limits' : '') +
      '</span></div>';
  /* step-history sparkline: every step's value plots as a faint frame (dots
       + ghost line) so the axis is stable; the bright line and dots reveal
       only up to the current step, so stepping tells the thermal story and a
       jump to any step re-renders consistently */
  /* same finite-only rule as thermoModel: an Infinity value renders as
       NO DATA in the readout, so it must not plot as a history point either */
  var hist = Array.isArray(states)
    ? states.map(function (s) {
        return s && typeof s.value === 'number' && isFinite(s.value) ? s.value : null;
      })
    : [];
  if (hist.length > 1) {
    var sX = function (i) {
      return 6 + (248 * i) / (hist.length - 1);
    };
    var sY = function (vv) {
      return 54 - clamp((vv - tm.min) / (tm.max - tm.min), 0, 1) * 46;
    };
    h += '<svg class="thspark" viewBox="0 0 260 62" role="img" aria-label="temperature per step">';
    ['lowWarn', 'lowCrit'].forEach(function (key) {
      if (tm[key] != null)
        h +=
          '<line class="thguide ' +
          (key === 'lowWarn' ? 'cold-warn' : 'cold-crit') +
          '" x1="6" x2="254" y1="' +
          sY(tm[key]).toFixed(1) +
          '" y2="' +
          sY(tm[key]).toFixed(1) +
          '"/>';
    });
    if (tm.warn != null)
      h +=
        '<line class="thguide warn" x1="6" x2="254" y1="' +
        sY(tm.warn).toFixed(1) +
        '" y2="' +
        sY(tm.warn).toFixed(1) +
        '"/>';
    if (tm.crit != null)
      h +=
        '<line class="thguide crit" x1="6" x2="254" y1="' +
        sY(tm.crit).toFixed(1) +
        '" y2="' +
        sY(tm.crit).toFixed(1) +
        '"/>';
    /* a null slot (step with no finite value) BREAKS the line: segments are
         emitted per run of consecutive finite values, so the line never
         bridges a no-data step */
    var ghostSegs = [],
      litSegs = [],
      gSeg = null,
      lSeg = null;
    hist.forEach(function (vv, i) {
      if (vv == null) {
        gSeg = null;
        lSeg = null;
        return;
      }
      var pt = sX(i).toFixed(1) + ',' + sY(vv).toFixed(1);
      if (!gSeg) {
        gSeg = [];
        ghostSegs.push(gSeg);
      }
      gSeg.push(pt);
      if (i <= idx) {
        if (!lSeg) {
          lSeg = [];
          litSegs.push(lSeg);
        }
        lSeg.push(pt);
      } else lSeg = null;
    });
    ghostSegs.forEach(function (seg) {
      if (seg.length > 1) h += '<polyline class="thline ghost" points="' + seg.join(' ') + '"/>';
    });
    litSegs.forEach(function (seg) {
      if (seg.length > 1) h += '<polyline class="thline" points="' + seg.join(' ') + '"/>';
    });
    hist.forEach(function (vv, i) {
      if (vv == null) return;
      var zc = thermoModel(panel, { value: vv }).zone;
      var isCur = i === idx;
      h +=
        '<circle class="thdot z-' +
        zc +
        (i <= idx ? ' on' : '') +
        (isCur ? ' cur' : '') +
        '" cx="' +
        sX(i).toFixed(1) +
        '" cy="' +
        sY(vv).toFixed(1) +
        '" r="' +
        (isCur ? 4 : 2.4) +
        '"/>';
    });
    h += '</svg>';
  }
  return {
    html: h,
    level: {
      pct: tm.pct,
      value: tm.value,
      settled: tv,
      fill: '.thfill',
      readout: '.thval',
      decimals: 1,
    },
  };
});

PanelRegistry.extend('thermo', {
  order: 12,
  label: 'Temperature',
  since: '0.1.0',
});

PanelRegistry.extend('thermo', {
  styles: [
    {
      order: 686,
      css: String.raw`.thhead{display:flex; flex-wrap:wrap; align-items:baseline; justify-content:space-between; gap:8px; margin-bottom:8px;}
.thval{font:700 20px 'IBM Plex Mono',monospace;}
.thunit{font-size:11px; font-weight:500; opacity:.6; margin-left:3px;}
.sk-aurora .thval{color:#EAF2FF;}
.sk-daylight .thval{color:#23272E;}
.sk-aurora .thval.z-warn{color:#FFB454;}
.sk-daylight .thval.z-warn{color:#B0771A;}
.sk-aurora .thval.z-crit{color:#FF6B5E;}
.sk-daylight .thval.z-crit{color:#B91C1C;}
.thval.z-na{opacity:.4;}
.thzone{font:700 9.5px 'IBM Plex Mono',monospace; letter-spacing:.08em; padding:3px 8px; border-radius:6px; border:1px solid transparent; white-space:nowrap;}
.sk-aurora .thzone.z-ok{color:#4ADE80; border-color:#1E4A33; background:#0C2418;}
.sk-daylight .thzone.z-ok{color:#0E7A3C; border-color:#BFE3CC; background:#EAF7EF;}
.sk-aurora .thzone.z-warn{color:#FFB454; border-color:#5A431C; background:#2A2010;}
.sk-daylight .thzone.z-warn{color:#B0771A; border-color:#EAD9B0; background:#FBF3E0;}
.sk-aurora .thzone.z-crit{color:#FF6B5E; border-color:#5F2320; background:#2C1210;}
.sk-daylight .thzone.z-crit{color:#B91C1C; border-color:#EFC4C0; background:#FBEBEA;}
.thzone.z-crit{animation:ledpulse .6s ease-in-out infinite alternate;}
.sk-aurora .thzone.z-na{color:#55627A; border-color:#1D2A40; background:#101A2C;}
.sk-daylight .thzone.z-na{color:#9A958A; border-color:#E0DCD1; background:#F4F2EC;}
.thbar{position:relative; height:10px; border-radius:5px; overflow:hidden;}
.sk-aurora .thbar{background:#101A2C;}
.sk-daylight .thbar{background:#F4F2EC;}
.thband{position:absolute; top:0; bottom:0;}
.thband.warn{background:rgba(255,180,84,.14);}
.thband.crit{background:rgba(255,107,94,.18);}
.sk-daylight .thband.warn{background:rgba(176,119,26,.12);}
.sk-daylight .thband.crit{background:rgba(185,28,28,.12);}
.thfill{position:absolute; top:0; bottom:0; left:0; border-radius:5px; transition:width .6s cubic-bezier(.4,0,.2,1);}
.sk-aurora .thfill.z-ok{background:#4ADE80;}
.sk-daylight .thfill.z-ok{background:#0E9382;}
.thfill.z-warn{background:#FFB454;}
.sk-daylight .thfill.z-warn{background:#B0771A;}
.thfill.z-crit{background:#FF6B5E; box-shadow:0 0 8px rgba(255,107,94,.7);}
.sk-daylight .thfill.z-crit{background:#B91C1C; box-shadow:none;}
.thtick{position:absolute; top:0; bottom:0; width:2px;}
.thtick.warn{background:#FFB454;}
.thtick.crit{background:#FF6B5E;}
.sk-daylight .thtick.warn{background:#B0771A;}
.sk-daylight .thtick.crit{background:#B91C1C;}
.thscale{position:relative; height:13px; margin-top:3px; font:600 8.5px 'IBM Plex Mono',monospace;}
.thscale span{position:absolute; top:1px;}
.thscale .lo{left:0;}
.thscale .hi{right:0;}
.thscale .warn, .thscale .crit{transform:translateX(-50%);}
.sk-aurora .thscale{color:#55627A;}
.sk-daylight .thscale{color:#9A958A;}
.sk-aurora .thscale .warn{color:#FFB454;}
.sk-aurora .thscale .crit{color:#FF6B5E;}
.sk-daylight .thscale .warn{color:#B0771A;}
.sk-daylight .thscale .crit{color:#B91C1C;}
.thspark{display:block; width:100%; height:auto; margin-top:6px;}
.thguide{stroke-width:1; stroke-dasharray:3 4;}
.thguide.warn{stroke:rgba(255,180,84,.45);}
.thguide.crit{stroke:rgba(255,107,94,.45);}
.sk-daylight .thguide.warn{stroke:rgba(176,119,26,.45);}
.sk-daylight .thguide.crit{stroke:rgba(185,28,28,.45);}
.thline{fill:none; stroke-width:1.6; stroke-linejoin:round; stroke-linecap:round;}
.sk-aurora .thline{stroke:#38E1FF;}
.sk-daylight .thline{stroke:#4956C9;}
.thline.ghost{opacity:.18;}
.thdot{opacity:.25;}
.thdot.on{opacity:1;}
.sk-aurora .thdot.z-ok{fill:#4ADE80;}
.sk-daylight .thdot.z-ok{fill:#0E9382;}
.thdot.z-warn{fill:#FFB454;}
.sk-daylight .thdot.z-warn{fill:#B0771A;}
.thdot.z-crit{fill:#FF6B5E;}
.sk-daylight .thdot.z-crit{fill:#B91C1C;}
.sk-aurora .thdot.cur{filter:drop-shadow(0 0 4px rgba(56,225,255,.8));}
.thdot.cur.z-crit{filter:drop-shadow(0 0 5px rgba(255,107,94,.9)); animation:ledpulse .6s ease-in-out infinite alternate;}`,
    },
    {
      order: 1212,
      css: String.raw`@media (prefers-reduced-motion: reduce){
  .thfill{transition:none !important;}
}
@media (prefers-reduced-motion: reduce){
  .thzone.z-crit, .thdot.cur.z-crit{animation:none !important;}
}`,
    },
    {
      order: 1624,
      css: String.raw`@media screen {
  body.sk-terminal .thband.warn,
  body.sk-terminal .thband.crit{background:rgba(255,107,94,.10);}
}`,
    },
    {
      order: 1628,
      css: String.raw`@media screen {
  body.sk-terminal .sk-aurora .thscale{color:var(--tm-muted);}
}
@media screen {
  body.sk-terminal .sk-aurora .thscale .warn,
  body.sk-terminal .sk-aurora .thscale .crit{color:var(--tm-alert);}
}`,
    },
    {
      order: 1845,
      css: String.raw`@media screen {
  body.sk-pastel .thband.warn { background:rgba(209,154,77,.15); }
}
@media screen {
  body.sk-pastel .thband.crit { background:rgba(211,99,112,.15); }
}`,
    },
    {
      order: 2082,
      css: String.raw`@media screen {
  body.sk-blueprint .thbar{height:8px;}
}
@media screen {
  body.sk-blueprint .thfill{border-radius:0;}
}`,
    },
    {
      order: 2420,
      css: String.raw`.thermal-halo{fill:currentColor;opacity:.13;transform-box:fill-box;transform-origin:center;animation:thermalbreathe 3s ease-in-out infinite;}
.thermal-hot .thermal-halo,.thermal-freezing .thermal-halo{opacity:.23;animation-duration:1.8s;}
.thermal-rim{fill:none;stroke:currentColor;stroke-width:1.2;opacity:.65;}
.thermal-wave{fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;animation:thermalrise 2.4s ease-in-out infinite;}
.thermal-frost{fill:none;stroke:currentColor;stroke-width:1.3;stroke-linecap:round;}
.thermal-freezing .thermal-frost{stroke-width:1.8;}
.thermal-badge circle{fill:var(--hm-surface);stroke:currentColor;stroke-width:1;}
.thermal-badge path,.thermal-badge use{fill:none;stroke:currentColor;stroke-width:1.4;stroke-linecap:round;}
.thermal-clearing{animation:thermalclear 1.2s ease-out forwards;}`,
    },
    {
      order: 2435,
      css: String.raw`body .docview .thval.z-cold-warn,body .docview .thscale .cold-warn{color:var(--th-cold) !important;}
body .docview .thval.z-cold-crit,body .docview .thscale .cold-crit{color:var(--th-freezing) !important;}
body .docview .thzone.z-cold-warn{color:var(--th-cold);border-color:var(--th-cold);background:color-mix(in srgb,var(--th-cold) 12%,transparent);}
body .docview .thzone.z-cold-crit{color:var(--th-freezing);border-color:var(--th-freezing);background:color-mix(in srgb,var(--th-freezing) 12%,transparent);}
.thfill.z-cold-warn,.thtick.cold-warn{background:#39B7DD;}
.thfill.z-cold-crit,.thtick.cold-crit{background:#668AF0;}
.thband.cold-warn{background:rgba(57,183,221,.22);}
.thband.cold-crit{background:rgba(102,138,240,.3);}
.thband.safe{background:rgba(65,174,111,.12);}
.thscale .cold-warn,.thscale .cold-crit{transform:translateX(-50%);}
.thguide.cold-warn{stroke:#39B7DD;opacity:.55;}
.thguide.cold-crit{stroke:#668AF0;opacity:.55;}
.thdot.z-cold-warn{fill:#39B7DD;}
.thdot.z-cold-crit{fill:#668AF0;}
.thrange-key{display:flex;justify-content:space-between;gap:8px;font:500 9px 'IBM Plex Mono',monospace;opacity:.8;margin-top:5px;}`,
    },
    {
      order: 2456,
      css: String.raw`@media(prefers-reduced-motion:reduce){
  .thermal-clearing{display:none;}
}`,
    },
    {
      order: 2458,
      css: String.raw`@media print{
  .thermal-clearing{display:none;}
}`,
    },
  ],
});

/* thermo authoring contract; merged into this panel definition by the bundle. */
PanelRegistry.extend('thermo', {
  authoring: {
    template: {
      title: 'Temperature',
      min: 0,
      max: 100,
      warn: 60,
      crit: 85,
      initial: { value: 21 },
    },
    setupFields: [
      ['unit', 'text'],
      ['min', 'num'],
      ['max', 'num'],
      ['warn', 'num'],
      ['crit', 'num'],
      ['lowWarn', 'num'],
      ['lowCrit', 'num'],
      ['initial', 'json'],
    ],
    patchFields: [
      ['value', 'num'],
      ['label', 'text'],
    ],
    picker: {
      order: 19,
      name: 'Temperature',
      category: 'Devices & interfaces',
      tagline: 'Temperature over time',
      description: 'Display temperature, warning bands, and its history across the story’s steps.',
    },
    example: function (sample, context) {
      var panel = sample.panel,
        state = sample.state,
        states = sample.states,
        step = sample.step;
      state.value = 42;
      states = [21, 24, 26, 25, 31, 38, 42].map(function (value) {
        return { value: value };
      });
      step = 6;

      panel.initial = builderClone(state);

      return { panel: panel, state: state, states: states, step: step };
    },
  },
});
/* ---- src/panels/types/tiles.js ---- */
/* tiles validation and pure state helpers. */
function tileStateWarnings(obj, path, decl, warnings) {
  if (!obj || typeof obj !== 'object') return;
  var vocab = decl && Array.isArray(decl.states) ? decl.states.map(String) : [];
  if (!vocab.length) return;
  Object.keys(obj).forEach(function (k) {
    var v = obj[k];
    if (v && typeof v === 'object' && v.state != null && vocab.indexOf(String(v.state)) < 0)
      warnings.push(
        path +
          '.' +
          k +
          '.state: "' +
          v.state +
          '" is not in the declared states — tile renders dimmed (valid: ' +
          vocab.join(' ') +
          ')'
      );
  });
}

/* Homemap vocabularies are shared by validation and the pure engine model.
   First token is the fallback. Only signals is reserved: this panel has its
   own fold so log/mark/enterOnce remain ordinary device ids. */

PanelRegistry.extend('tiles', {
  validateDeclaration: function (p, PP, warnings, errors, d) {
    if (!(Array.isArray(p.tiles) && p.tiles.length))
      warnings.push(PP + '.tiles: tiles needs tiles:[{id, label}] — panel renders empty');
    else {
      if (p.tiles.length > 12)
        warnings.push(PP + '.tiles: more than 12 tiles — extra tiles are not rendered');
      p.tiles.forEach(function (t, tj) {
        if (!t || !t.id) warnings.push(PP + '.tiles[' + tj + ']: needs an id — tile skipped');
      });
    }
    tileStateWarnings(p.initial, PP + '.initial', p, warnings);
  },
  validatePatch: function (patch, path, panel, warnings, context) {
    tileStateWarnings(patch, path, panel, warnings);
  },
});

/* tiles panel: presentation model and renderer. Shared lifecycle lives in ../shared.js. */
function tilesModel(panel, state) {
  panel = panel || {};
  state = state || {};
  var vocab = Array.isArray(panel.states) ? panel.states.map(String) : [];
  var colors = panel.colors || {};
  return (Array.isArray(panel.tiles) ? panel.tiles : [])
    .slice(0, 12)
    .map(function (t) {
      t = t || {};
      var st = t.id && state[t.id] && typeof state[t.id] === 'object' ? state[t.id] : {};
      var sname = st.state != null ? String(st.state) : null;
      var known = sname != null && (vocab.length === 0 || vocab.indexOf(sname) >= 0);
      return {
        id: t.id,
        label: t.label || t.id || '',
        state: known ? sname : null,
        color: known && isHex(colors[sname]) ? colors[sname] : null,
        sub: st.sub != null ? String(st.sub) : '',
      };
    })
    .filter(function (t) {
      return t.id;
    });
}

/* signal widget: link health for 1–6 named radio/wired links. Pure model
   (node-testable). Links are DECLARED once (id, label, transport tag); each
   step patches per link id, like the leds widget: a patch value replaces that
   link's whole status object `{state, bars, note}`. Unknown state tokens fall
   back to 'ok' (validator warns); bars 0–4 or null (chip-only). */

PanelViews.register('tiles', function (host, panel, state, skin, states, stepIdx, animate) {
  var h = '';
  var tlm = tilesModel(panel, state);
  h += '<div class="tlgrid">';
  tlm.forEach(function (t) {
    h += '<div class="tltile' + (t.state == null ? ' dim' : '') + '">';
    h += '<span class="tllabel">' + esc(t.label) + '</span>';
    h +=
      '<span class="tlstate"' +
      (t.color ? ' style="color:' + t.color + ';border-color:' + t.color + '"' : '') +
      '>' +
      (t.state != null ? esc(t.state) : '&#8212;') +
      '</span>';
    h += '<span class="tlsub">' + esc(t.sub) + '</span>';
    h += '</div>';
  });
  h += '</div>';
  return { html: h };
});

PanelRegistry.extend('tiles', {
  order: 18,
  label: 'Tiles',
  since: '0.1.0',
});

PanelRegistry.extend('tiles', {
  styles: [
    {
      order: 910,
      css: String.raw`.tlgrid{display:grid; grid-template-columns:repeat(auto-fill, minmax(88px, 1fr)); gap:7px;}
.tltile{display:flex; flex-direction:column; gap:3px; padding:7px 8px; border-radius:8px;}
.sk-aurora .tltile{background:#101A2C; border:1px solid #1D2A40;}
.sk-daylight .tltile{background:#F4F2EC; border:1px solid #E0DCD1;}
.tltile.dim{opacity:.55;}
.tllabel{font:600 9.5px 'IBM Plex Mono',monospace; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}
.sk-aurora .tllabel{color:#93A7C9;}
.sk-daylight .tllabel{color:#6B6F7A;}
.tlstate{font:700 9.5px 'IBM Plex Mono',monospace; letter-spacing:.06em; align-self:flex-start;
  padding:1px 6px; border-radius:5px; border:1px solid;}
.sk-aurora .tlstate{color:#55627A; border-color:#1D2A40;}
.sk-daylight .tlstate{color:#9A958A; border-color:#E0DCD1;}
.tlsub{font:500 9px 'IBM Plex Mono',monospace; height:12px; overflow:hidden; white-space:nowrap; text-overflow:ellipsis;}
.sk-aurora .tlsub{color:#5E7396;}
.sk-daylight .tlsub{color:#8A8474;}`,
    },
    {
      order: 1425,
      css: String.raw`body.sk-editorial .sk-aurora .tltile,
body.sk-editorial .sk-daylight .tltile{
  border-color:var(--ed-rule);
  border-radius:2px;
  background:var(--ed-paper);
}
body.sk-editorial .sk-aurora .tllabel,
body.sk-editorial .sk-daylight .tllabel{color:#515A57;}
body.sk-editorial .sk-aurora .tlstate,
body.sk-editorial .sk-daylight .tlstate{color:var(--ed-muted); border-color:var(--ed-rule-strong); border-radius:2px;}
body.sk-editorial .sk-aurora .tlsub,
body.sk-editorial .sk-daylight .tlsub{color:var(--ed-muted);}`,
    },
    {
      order: 1679,
      css: String.raw`@media screen {

  body.sk-terminal .tlgrid{gap:5px;}
}
@media screen {
  body.sk-terminal .tltile,
  body.sk-terminal .sk-aurora .tltile{padding:7px; background:var(--tm-raised); border:1px solid var(--tm-line); border-radius:0;}
}
@media screen {
  body.sk-terminal .tllabel,
  body.sk-terminal .sk-aurora .tllabel{color:var(--tm-text); text-transform:uppercase; letter-spacing:.05em;}
}
@media screen {
  body.sk-terminal .tlstate{
    color:var(--tm-good) !important;
    background:#0B1912;
    border:1px solid var(--tm-good) !important;
    border-radius:0;
    text-transform:uppercase;
  }
}
@media screen {
  body.sk-terminal .tlsub,
  body.sk-terminal .sk-aurora .tlsub{color:var(--tm-muted);}
}`,
    },
    {
      order: 1895,
      css: String.raw`@media screen {

  body.sk-pastel .tltile,
  body.sk-pastel .sk-aurora .tltile,
  body.sk-pastel .sk-daylight .tltile {
    background:#F7F9FC;
    border:1px solid #E0E6EF;
    border-radius:11px;
    padding:8px 9px;
  }
}
@media screen {
  body.sk-pastel .tllabel,
  body.sk-pastel .tlsub,
  body.sk-pastel .sk-aurora .tllabel,
  body.sk-pastel .sk-daylight .tllabel,
  body.sk-pastel .sk-aurora .tlsub,
  body.sk-pastel .sk-daylight .tlsub { color:#647188; }
}
@media screen {
  body.sk-pastel .tlstate,
  body.sk-pastel .sk-aurora .tlstate,
  body.sk-pastel .sk-daylight .tlstate { color:#738095; border-color:#D4DCE7; border-radius:999px; }
}
@media screen {
  body.sk-pastel .tlstate[style] { filter:saturate(.72) brightness(.84); }
}`,
    },
    {
      order: 2135,
      css: String.raw`@media screen {

  body.sk-blueprint .tlgrid{grid-template-columns:repeat(auto-fill,minmax(82px,1fr));gap:5px;}
}
@media screen {
  body.sk-blueprint .tltile{gap:2px;padding:5px 6px;border-radius:0;}
}
@media screen {
  body.sk-blueprint .docview .tltile{background:#04244B;border-color:#347B9A;}
}
@media screen {
  body.sk-blueprint .docview .tllabel{color:#D1E7F1;font-family:'Barlow Condensed','Arial Narrow',sans-serif;font-size:10px;letter-spacing:.04em;}
}
@media screen {
  body.sk-blueprint .tlstate{padding:1px 5px;border-radius:0;font-family:'Barlow Condensed','Arial Narrow',sans-serif;}
}
@media screen {
  body.sk-blueprint .docview .tlsub{color:#91B9CE;}
}`,
    },
  ],
});

/* tiles authoring contract; merged into this panel definition by the bundle. */
PanelRegistry.extend('tiles', {
  authoring: {
    template: {
      title: 'Fleet',
      tiles: [
        { id: 't1', label: 'UNIT 1' },
        { id: 't2', label: 'UNIT 2' },
      ],
    },
    setupFields: [
      ['tiles', 'rows', { cols: [{ k: 'id', req: true }, { k: 'label' }], max: 12 }],
      ['states', 'csv'],
      ['colors', 'map'],
      ['initial', 'json'],
    ],
    patchFields: [],
    picker: {
      order: 23,
      name: 'Device fleet',
      category: 'Devices & interfaces',
      tagline: 'Many devices, one view',
      description: 'Compare named devices in a compact grid, each with its own status and detail.',
    },
    expandPatchFields: function (decl) {
      var states = Array.isArray(decl.states) ? decl.states.map(String) : [];
      var stateField = states.length ? ['state', 'enum', states] : ['state', 'text'];
      return (Array.isArray(decl.tiles) ? decl.tiles : [])
        .filter(function (item) {
          return item && typeof item.id === 'string' && item.id !== '';
        })
        .map(function (item) {
          return [item.id, 'objf', [stateField, ['sub', 'text']]];
        });
    },
    example: function (sample, context) {
      var panel = sample.panel,
        state = sample.state,
        states = sample.states,
        step = sample.step;
      state = { t1: { state: 'ONLINE', sub: 'Gateway' }, t2: { state: 'READY', sub: 'Camera' } };
      panel.initial = builderClone(state);

      return { panel: panel, state: state, states: states, step: step };
    },
  },
});
/* ---- src/panels/types/timeline.js ---- */
/* timeline validation and pure state helpers. */
/* wall-clock durations for the timeline widget: "2h", "90m", "1h30m",
   "45s", "1h 30m", or a bare number (minutes) -> seconds; null on junk.
   Shared by the validator, the fold, and the engine model. */
function parseClock(text) {
  /* every return is finite or null — absurd magnitudes (enough digits
     to overflow a double) must never reach the render loops */
  function fin(v) {
    return isFinite(v) ? v : null;
  }
  if (typeof text === 'number' && isFinite(text) && text >= 0) return fin(text * 60);
  if (typeof text !== 'string') return null;
  var s = text.trim().toLowerCase();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return fin(parseFloat(s) * 60);
  var m,
    total = 0,
    any = false;
  var re = /(\d+(?:\.\d+)?)\s*(d|h|m|s)/g;
  while ((m = re.exec(s))) {
    any = true;
    total +=
      parseFloat(m[1]) * (m[2] === 'd' ? 86400 : m[2] === 'h' ? 3600 : m[2] === 'm' ? 60 : 1);
  }
  if (!any) return null;
  if (s.replace(/(\d+(?:\.\d+)?)\s*(d|h|m|s)/g, '').replace(/\s/g, '') !== '') return null;
  return fin(total);
}
/* the widget is a 320-unit-wide strip; a week is the largest span it can
   present legibly. Longer declared spans clamp here (validator warns). */
var TIMELINE_MAX_SPAN = 7 * 86400;
function formatClock(seconds) {
  /* 5400 -> "1h30m", 3600 -> "1h", 90 -> "1m30s", 45 -> "45s",
     90000 -> "1d1h", 604800 -> "7d", 0 -> "0". Two largest units. */
  var d = Math.floor(seconds / 86400);
  var rem = seconds - d * 86400;
  var h = Math.floor(rem / 3600);
  rem -= h * 3600;
  var mn = Math.floor(rem / 60);
  var sc = Math.round(rem - mn * 60);
  if (sc === 60) {
    sc = 0;
    mn += 1;
  } /* 59.6s must not read "60s" */
  if (mn === 60) {
    mn = 0;
    h += 1;
  }
  if (h === 24) {
    h = 0;
    d += 1;
  }
  var out = '';
  if (d) out += d + 'd';
  if (h) out += h + 'h';
  if (mn && !d) out += mn + 'm';
  if (sc && !h && !d) out += sc + 's';
  return out || '0';
}
var TIMELINE_EVENT_KINDS = ['ok', 'alert', 'info'];
/* beat dots stop being drawable well before this; beyond it the renderer
   omits the dots and says so in the meta line, and the validator warns */
var TIMELINE_MAX_BEATS = 120;
function timelineEventWarnings(list, path, warnings) {
  (Array.isArray(list) ? list : []).forEach(function (e, i) {
    var EP = path + '[' + i + ']';
    if (!e || typeof e !== 'object') {
      warnings.push(EP + ': needs {at, label?, kind?} — skipped');
      return;
    }
    if (parseClock(e.at) == null)
      warnings.push(
        EP + '.at: unreadable time "' + e.at + '" (use "1d" / "1h30m" / "45m" / "90s") — skipped'
      );
    if (e.kind != null && TIMELINE_EVENT_KINDS.indexOf(e.kind) < 0)
      warnings.push(
        EP +
          '.kind: unknown kind "' +
          e.kind +
          '" — using "info" (valid: ' +
          TIMELINE_EVENT_KINDS.join(' ') +
          ')'
      );
  });
}
function timelineLaneIds(decl) {
  /* mirrors the model's acceptance rules exactly — a lane the renderer
     skips (missing id, duplicate, unreadable interval, over the 4-lane
     cap) is NOT a known target, so misses/events naming it warn */
  var ids = [];
  var seen = {};
  (decl && Array.isArray(decl.lanes) ? decl.lanes : []).forEach(function (l) {
    if (ids.length >= 4) return;
    if (!l || typeof l !== 'object' || l.id == null) return;
    var id = String(l.id);
    if (seen[id]) return;
    var every = parseClock(l.every);
    if (every == null || every <= 0) return;
    seen[id] = true;
    ids.push(id);
  });
  return ids;
}
function timelineEventLaneWarnings(list, path, laneIds, warnings) {
  (Array.isArray(list) ? list : []).forEach(function (e, i) {
    if (e && e.lane != null && laneIds.indexOf(String(e.lane)) < 0)
      warnings.push(
        path + '[' + i + '].lane: unknown lane "' + e.lane + '" — drawn on the axis row'
      );
  });
}
function timelinePatchWarnings(obj, path, decl, warnings) {
  if (!obj || typeof obj !== 'object') return;
  var laneIds = timelineLaneIds(decl);
  if (obj.now != null && parseClock(obj.now) == null)
    warnings.push(
      path +
        '.now: unreadable time "' +
        obj.now +
        '" (use "1d" / "1h30m" / "45m" / "90s") — cursor unchanged'
    );
  if (obj.events != null && !Array.isArray(obj.events))
    warnings.push(path + '.events: expected an array of {at, label?, kind?} — ignored');
  else {
    timelineEventWarnings(obj.events, path + '.events', warnings);
    timelineEventLaneWarnings(obj.events, path + '.events', laneIds, warnings);
  }
  if (obj.miss != null) {
    if (!Array.isArray(obj.miss))
      warnings.push(path + '.miss: expected an array of {lane, at} — ignored');
    else
      obj.miss.forEach(function (m, i) {
        var MP = path + '.miss[' + i + ']';
        if (!m || typeof m !== 'object') {
          warnings.push(MP + ': needs {lane, at} — skipped');
          return;
        }
        if (m.lane == null || laneIds.indexOf(String(m.lane)) < 0)
          warnings.push(
            MP +
              '.lane: unknown lane "' +
              m.lane +
              '" — skipped' +
              (laneIds.length ? '' : ' (this timeline has no usable lanes)')
          );
        if (parseClock(m.at) == null)
          warnings.push(MP + '.at: unreadable time "' + m.at + '" — skipped');
      });
  }
}

PanelRegistry.extend('timeline', {
  validateDeclaration: function (p, PP, warnings, errors, d) {
    if (p.span == null) warnings.push(PP + '.span: timeline needs a span ("6h", "90m") — using 1h');
    else if (parseClock(p.span) == null || parseClock(p.span) <= 0)
      warnings.push(PP + '.span: unreadable span "' + p.span + '" (use "6h" / "90m") — using 1h');
    else if (parseClock(p.span) > TIMELINE_MAX_SPAN)
      warnings.push(PP + '.span: longer than the drawable maximum (7d) — clamped to 7d');
    if (p.cadence != null) {
      if (
        typeof p.cadence !== 'object' ||
        parseClock(p.cadence.every) == null ||
        parseClock(p.cadence.every) <= 0
      )
        warnings.push(
          PP +
            '.cadence: expected {every:"30m", label?} with a readable interval — no periodic beats drawn'
        );
      else {
        /* density is judged on the span the model actually DRAWS —
           the clamped one — or a legally long span would warn about
           beats the render happily shows */
        var tlSpanS = parseClock(p.span);
        if (tlSpanS != null) tlSpanS = Math.min(tlSpanS, TIMELINE_MAX_SPAN);
        if (
          tlSpanS != null &&
          tlSpanS > 0 &&
          Math.floor((tlSpanS + 1e-6) / parseClock(p.cadence.every)) > TIMELINE_MAX_BEATS
        )
          warnings.push(
            PP +
              '.cadence: ' +
              Math.floor((tlSpanS + 1e-6) / parseClock(p.cadence.every)) +
              ' beats over this span cannot be drawn individually (max ' +
              TIMELINE_MAX_BEATS +
              ') — the axis renders without beat dots and the meta line reports the count'
          );
      }
    }
    if (p.lanes != null) {
      if (!Array.isArray(p.lanes) || !p.lanes.length)
        warnings.push(
          PP + '.lanes: expected a non-empty array of {id, label?, every} — lanes ignored'
        );
      else {
        if (p.cadence != null)
          warnings.push(
            PP + '.cadence: ignored when lanes are declared — each lane carries its own every'
          );
        if (p.lanes.length > 4)
          warnings.push(PP + '.lanes: more than 4 lanes — extra lanes are not rendered');
        var laneSeen = {};
        p.lanes.forEach(function (l, li) {
          var LP = PP + '.lanes[' + li + ']';
          if (!l || typeof l !== 'object' || l.id == null) {
            warnings.push(LP + ': needs {id, label?, every} — lane skipped');
            return;
          }
          if (laneSeen[String(l.id)])
            warnings.push(LP + '.id: duplicate lane id "' + l.id + '" — later lane skipped');
          laneSeen[String(l.id)] = true;
          if (parseClock(l.every) == null || parseClock(l.every) <= 0)
            warnings.push(
              LP +
                '.every: unreadable interval "' +
                l.every +
                '" (use "30s" / "5m" / "2h") — lane skipped'
            );
        });
      }
    }
    timelineEventWarnings(p.events, PP + '.events', warnings);
    timelineEventLaneWarnings(p.events, PP + '.events', timelineLaneIds(p), warnings);
    timelinePatchWarnings(p.initial, PP + '.initial', p, warnings);
  },
  validatePatch: function (patch, path, panel, warnings, context) {
    timelinePatchWarnings(patch, path, panel, warnings);
  },
  fold: function (panel, steps) {
    return foldCommonPanelStates(panel, steps, {
      append: ['events', 'miss'],
      accept: {
        now: function (value) {
          return parseClock(value) != null;
        },
      },
    });
  },
});

/* timeline panel: presentation model and renderer. Shared lifecycle lives in ../shared.js. */
function timelineLabelRows(events) {
  /* deterministic label collision layout: labels go on row 0, overflow
     to row 1, and drop to hover-title-only (labelRow null) when both
     rows are occupied at that x. Widths are estimated from the 8.5px
     mono glyphs; x positions mirror the renderer's clamp. */
  var charW = 5.1;
  var ends = [-Infinity, -Infinity];
  events.forEach(function (e) {
    if (!e.label) {
      e.labelRow = null;
      return;
    }
    /* the estimate and the drawing must agree: long labels TRUNCATE to
       what the estimate measures (the hover title keeps the full text) */
    e.labelText = e.label.length > 22 ? e.label.slice(0, 21) + '\u2026' : e.label;
    var x = Math.min(Math.max(6 + (e.pct / 100) * 308, 16), 304);
    var half = (e.labelText.length * charW) / 2;
    var xs = x - half,
      xe = x + half;
    if (xs >= ends[0] + 4) {
      e.labelRow = 0;
      ends[0] = xe;
    } else if (xs >= ends[1] + 4) {
      e.labelRow = 1;
      ends[1] = xe;
    } else e.labelRow = null;
  });
  return events;
}
/* cadence lanes: several periodic processes on ONE wall-clock axis,
   each lane rendered in a density REGIME chosen by its beat count over
   the span — individual dots, a true-spacing tick comb, a solid band,
   or an empty row with a "next in …" promise. The regime is the
   orders-of-magnitude contrast. Pure model. */
var TL_DOT_MAX = 32; /* beats drawable as individual dots on the track */
var TL_COMB_MAX = 120; /* beats drawable as a legible tick comb */
function timelineLanesModel(panel, state) {
  panel = panel || {};
  state = state || {};
  var span = parseClock(panel.span);
  if (span == null || span <= 0) span = 3600;
  if (span > TIMELINE_MAX_SPAN) span = TIMELINE_MAX_SPAN;
  var units = [60, 300, 600, 900, 1800, 3600, 7200, 10800, 21600, 43200, 86400];
  var unit = units[units.length - 1];
  for (var i = 0; i < units.length; i++) {
    if (span / units[i] <= 8) {
      unit = units[i];
      break;
    }
  }
  var ticks = [];
  for (var ts = 0; ts <= span + 1e-6 && ticks.length <= 12; ts += unit)
    ticks.push({ s: ts, pct: (ts / span) * 100, label: formatClock(ts) });
  var nowS = parseClock(state.now);
  var now = null;
  if (nowS != null) {
    var nc = Math.min(Math.max(nowS, 0), span);
    now = { s: nc, pct: (nc / span) * 100, label: formatClock(nc) };
  }
  function normList(list) {
    var out = [];
    (Array.isArray(list) ? list : []).forEach(function (e) {
      if (!e) return;
      var at = parseClock(e.at);
      if (at == null) return;
      var s = Math.min(Math.max(at, 0), span);
      out.push({
        s: s,
        pct: (s / span) * 100,
        lane: e.lane != null ? String(e.lane) : null,
        label: e.label != null ? String(e.label) : '',
        kind: ['ok', 'alert', 'info'].indexOf(e.kind) >= 0 ? e.kind : 'info',
      });
    });
    return out;
  }
  var allEvents = normList(panel.events).concat(normList(state.events));
  var misses = normList(state.miss);
  var seen = Object.create(null);
  var lanes = [];
  (Array.isArray(panel.lanes) ? panel.lanes : []).forEach(function (l) {
    if (lanes.length >= 4) return;
    if (!l || typeof l !== 'object' || l.id == null) return;
    var id = String(l.id);
    if (seen[id]) return;
    var every = parseClock(l.every);
    if (every == null || every <= 0) return;
    seen[id] = true;
    var count = Math.floor((span + 1e-6) / every);
    var regime =
      count < 1 ? 'sparse' : count <= TL_DOT_MAX ? 'dots' : count <= TL_COMB_MAX ? 'comb' : 'band';
    var beats = [];
    if (regime === 'dots') {
      for (var b = every; b <= span + 1e-6; b += every)
        beats.push({
          s: b,
          pct: (b / span) * 100,
          past: !!(now && b <= now.s + 1e-6),
        });
    }
    var badge;
    if (regime === 'sparse') {
      if (now) {
        var nextAt = (Math.floor((now.s + 1e-6) / every) + 1) * every;
        badge = 'next in ' + formatClock(nextAt - now.s) + ' \u25b8';
      } else badge = 'every ' + formatClock(every);
    } else badge = count + '\u00d7';
    lanes.push({
      id: id,
      label: l.label != null ? String(l.label) : id,
      every: every,
      everyLabel: formatClock(every),
      regime: regime,
      count: count,
      beats: beats,
      spacingPct: (every / span) * 100,
      badge: badge,
      misses: misses.filter(function (m) {
        return m.lane === id;
      }),
      events: allEvents.filter(function (e) {
        return e.lane === id;
      }),
    });
  });
  return {
    span: span,
    spanLabel: formatClock(span),
    ticks: ticks,
    now: now,
    lanes: lanes,
    axisEvents: allEvents.filter(function (e) {
      return e.lane == null || !seen[e.lane];
    }),
  };
}

function timelineModel(panel, state) {
  panel = panel || {};
  state = state || {};
  var span = parseClock(panel.span);
  if (span == null || span <= 0) span = 3600;
  if (span > TIMELINE_MAX_SPAN) span = TIMELINE_MAX_SPAN; /* validator warns */
  /* tick unit: coarsest table entry giving at most 8 intervals; the top
     entry (1d) covers the clamped 7d maximum within the bound */
  var units = [60, 300, 600, 900, 1800, 3600, 7200, 10800, 21600, 43200, 86400];
  var unit = units[units.length - 1];
  for (var i = 0; i < units.length; i++) {
    if (span / units[i] <= 8) {
      unit = units[i];
      break;
    }
  }
  var ticks = [];
  for (var ts = 0; ts <= span + 1e-6 && ticks.length <= 12; ts += unit)
    ticks.push({ s: ts, pct: (ts / span) * 100, label: formatClock(ts) });
  var every = panel.cadence ? parseClock(panel.cadence.every) : null;
  var beats = [],
    beatsOmitted = 0;
  if (every != null && every > 0) {
    var beatCount = Math.floor((span + 1e-6) / every);
    if (beatCount > TIMELINE_MAX_BEATS) {
      /* sub-pixel soup — draw none, report the count instead of
         silently truncating the cadence */
      beatsOmitted = beatCount;
    } else {
      for (var b = every; b <= span + 1e-6; b += every) beats.push({ s: b, pct: (b / span) * 100 });
    }
  }
  function norm(list) {
    var out = [];
    (Array.isArray(list) ? list : []).forEach(function (e) {
      if (!e) return;
      var at = parseClock(e.at);
      if (at == null) return;
      var s = Math.min(Math.max(at, 0), span);
      out.push({
        s: s,
        pct: (s / span) * 100,
        label: e.label != null ? String(e.label) : '',
        kind: ['ok', 'alert', 'info'].indexOf(e.kind) >= 0 ? e.kind : 'info',
      });
    });
    return out;
  }
  var events = norm(panel.events).concat(norm(state.events));
  events.sort(function (a, b) {
    return a.s - b.s;
  });
  timelineLabelRows(events);
  var nowS = parseClock(state.now);
  var now = null;
  if (nowS != null) {
    var c = Math.min(Math.max(nowS, 0), span);
    now = { s: c, pct: (c / span) * 100, label: formatClock(c) };
  }
  /* detail window: the cadence interval containing `now`, magnified so
     events BETWEEN two long-running beats spread out legibly. Derived —
     no spec field. Absent without a cadence or a cursor. */
  var detail = null;
  if (every != null && every > 0 && now) {
    var k = Math.floor((now.s + 1e-6) / every);
    var dStart = k * every;
    if (dStart >= span) dStart = Math.max(span - every, 0);
    var dEnd = Math.min(dStart + every, span);
    if (dEnd > dStart) {
      var dLen = dEnd - dStart;
      var dEvents = [];
      events.forEach(function (e) {
        if (e.s >= dStart - 1e-6 && e.s <= dEnd + 1e-6)
          dEvents.push({
            s: e.s,
            pct: ((e.s - dStart) / dLen) * 100,
            label: e.label,
            kind: e.kind,
          });
      });
      timelineLabelRows(dEvents);
      var dUnits = [1, 5, 10, 30, 60, 300, 600, 900, 1800, 3600, 7200, 10800, 21600, 43200];
      var dUnit = dUnits[dUnits.length - 1];
      for (var di = 0; di < dUnits.length; di++) {
        if (dLen / dUnits[di] <= 6) {
          dUnit = dUnits[di];
          break;
        }
      }
      var dTicks = [];
      for (
        var dts = Math.ceil((dStart + 1e-6) / dUnit) * dUnit;
        dts < dEnd - 1e-6 && dTicks.length <= 8;
        dts += dUnit
      )
        dTicks.push({ s: dts, pct: ((dts - dStart) / dLen) * 100 });
      detail = {
        start: dStart,
        end: dEnd,
        startLabel: formatClock(dStart),
        endLabel: formatClock(dEnd),
        startPct: (dStart / span) * 100,
        endPct: (dEnd / span) * 100,
        ticks: dTicks,
        events: dEvents,
        nowPct: Math.min(Math.max(((now.s - dStart) / dLen) * 100, 0), 100),
        startPast: now.s >= dStart - 1e-6,
        endPast: now.s >= dEnd - 1e-6,
      };
    }
  }
  return {
    span: span,
    spanLabel: formatClock(span),
    unit: unit,
    ticks: ticks,
    beats: beats,
    beatsOmitted: beatsOmitted,
    every: every,
    events: events,
    now: now,
    detail: detail,
    cadenceLabel: panel.cadence && panel.cadence.label != null ? String(panel.cadence.label) : '',
  };
}

PanelViews.register('timeline', function (host, panel, state, skin, states, stepIdx, animate) {
  var h = '';
  if (Array.isArray(panel.lanes) && panel.lanes.length) {
    var lnm = timelineLanesModel(panel, state);
    var LX0 = 70,
      LX1 = 252,
      LW = LX1 - LX0; /* track range; labels left, badges right */
    function lx(pct) {
      return (LX0 + (pct / 100) * LW).toFixed(1);
    }
    var rowsTop = 22,
      rowH = 18;
    var rowsBottom = rowsTop + lnm.lanes.length * rowH;
    var tlH = rowsBottom + 14;
    h += '<svg class="tlsvg" viewBox="0 0 320 ' + tlH + '" role="img" aria-label="cadence lanes">';
    /* shared axis strip on top */
    h += '<line class="tlaxis" x1="' + LX0 + '" y1="12" x2="' + LX1 + '" y2="12"/>';
    lnm.ticks.forEach(function (tk) {
      h +=
        '<line class="tltickline" x1="' + lx(tk.pct) + '" y1="8" x2="' + lx(tk.pct) + '" y2="16"/>';
    });
    lnm.axisEvents.forEach(function (ev) {
      h +=
        '<circle class="tlev tl-' +
        ev.kind +
        '" cx="' +
        lx(ev.pct) +
        '" cy="12" r="2.6"><title>' +
        esc(formatClock(ev.s) + (ev.label ? ' — ' + ev.label : '')) +
        '</title></circle>';
    });
    /* lane rows */
    lnm.lanes.forEach(function (ln, li) {
      var cy = rowsTop + li * rowH + 9;
      var labText = ln.label.length > 13 ? ln.label.slice(0, 12) + '\u2026' : ln.label;
      h +=
        '<text class="tllane" x="2" y="' +
        (cy + 3) +
        '">' +
        esc(labText) +
        '<title>' +
        esc(ln.label + ' — every ' + ln.everyLabel) +
        '</title></text>';
      h +=
        '<line class="tlrowline" x1="' +
        LX0 +
        '" y1="' +
        cy +
        '" x2="' +
        LX1 +
        '" y2="' +
        cy +
        '"/>';
      var splitX = lnm.now ? parseFloat(lx(lnm.now.pct)) : LX0;
      if (ln.regime === 'dots') {
        ln.beats.forEach(function (bt) {
          h +=
            '<circle class="tlbeat' +
            (bt.past ? ' past' : '') +
            '" cx="' +
            lx(bt.pct) +
            '" cy="' +
            cy +
            '" r="2.6"/>';
        });
      } else if (ln.regime === 'comb') {
        var spacing = (ln.spacingPct / 100) * LW;
        var pid = 'tlp' + ++ZF_SEQ;
        h +=
          '<defs><pattern id="' +
          pid +
          '" x="' +
          LX0 +
          '" width="' +
          spacing.toFixed(3) +
          '" height="' +
          rowH +
          '" patternUnits="userSpaceOnUse">' +
          '<line class="tlcombline" x1="' +
          spacing.toFixed(3) +
          '" y1="3" x2="' +
          spacing.toFixed(3) +
          '" y2="15"/></pattern></defs>';
        if (splitX > LX0)
          h +=
            '<rect class="tlpast" x="' +
            LX0 +
            '" y="' +
            (cy - 9) +
            '" width="' +
            (splitX - LX0).toFixed(1) +
            '" height="' +
            rowH +
            '" fill="url(#' +
            pid +
            ')"/>';
        if (splitX < LX1)
          h +=
            '<rect class="tlfuture" x="' +
            splitX.toFixed(1) +
            '" y="' +
            (cy - 9) +
            '" width="' +
            (LX1 - splitX).toFixed(1) +
            '" height="' +
            rowH +
            '" fill="url(#' +
            pid +
            ')"/>';
      } else if (ln.regime === 'band') {
        if (splitX > LX0)
          h +=
            '<rect class="tlbandfill tlpast" x="' +
            LX0 +
            '" y="' +
            (cy - 4) +
            '" width="' +
            (splitX - LX0).toFixed(1) +
            '" height="8" rx="2"/>';
        if (splitX < LX1)
          h +=
            '<rect class="tlbandfill tlfuture" x="' +
            splitX.toFixed(1) +
            '" y="' +
            (cy - 4) +
            '" width="' +
            (LX1 - splitX).toFixed(1) +
            '" height="8" rx="2"/>';
      }
      /* sparse: the badge carries the promise; nothing on the track */
      ln.misses.forEach(function (m) {
        if (ln.regime === 'dots') {
          h +=
            '<circle class="tlmissring" cx="' +
            lx(m.pct) +
            '" cy="' +
            cy +
            '" r="4"><title>' +
            esc('missed — expected ' + formatClock(m.s)) +
            '</title></circle>';
        } else {
          h +=
            '<line class="tlmiss" x1="' +
            lx(m.pct) +
            '" y1="' +
            (cy - 8) +
            '" x2="' +
            lx(m.pct) +
            '" y2="' +
            (cy + 8) +
            '"><title>' +
            esc('missed — expected ' + formatClock(m.s)) +
            '</title></line>';
        }
      });
      ln.events.forEach(function (ev) {
        h +=
          '<circle class="tlev tl-' +
          ev.kind +
          '" cx="' +
          lx(ev.pct) +
          '" cy="' +
          cy +
          '" r="3"><title>' +
          esc(formatClock(ev.s) + (ev.label ? ' — ' + ev.label : '')) +
          '</title></circle>';
      });
      h +=
        '<text class="tlbadge" x="318" y="' +
        (cy + 3) +
        '" text-anchor="end">' +
        esc(ln.badge) +
        '</text>';
    });
    /* the now cursor runs through the axis and every row */
    if (lnm.now) {
      var lnx = lx(lnm.now.pct);
      h +=
        '<line class="tlnow" x1="' +
        lnx +
        '" y1="6" x2="' +
        lnx +
        '" y2="' +
        rowsBottom +
        '"/>' +
        '<circle class="tlnowhead" cx="' +
        lnx +
        '" cy="6" r="3"/>';
    }
    /* tick labels under the rows */
    lnm.ticks.forEach(function (tk) {
      h +=
        '<text class="tltick" x="' +
        lx(tk.pct) +
        '" y="' +
        (rowsBottom + 10) +
        '" text-anchor="middle">' +
        esc(tk.label) +
        '</text>';
    });
    h += '</svg>';
    var lmeta = [];
    if (lnm.now) lmeta.push('now ' + lnm.now.label);
    lmeta.push('span ' + lnm.spanLabel);
    h += '<div class="tlmeta">' + esc(lmeta.join(' \u00b7 ')) + '</div>';
  } else {
    var tlm = timelineModel(panel, state);
    function tlx(pct) {
      return (6 + (pct / 100) * 308).toFixed(1);
    }
    if (tlm.detail) {
      /* overview strip on top, the CURRENT cadence interval magnified
         below — events between two long-running beats spread out there */
      var dm = tlm.detail;
      h += '<svg class="tlsvg" viewBox="0 0 320 100" role="img" aria-label="timeline">';
      /* overview strip */
      if (tlm.now)
        h +=
          '<rect class="tlelapsed" x="6" y="9" width="' +
          ((tlm.now.pct / 100) * 308).toFixed(1) +
          '" height="6" rx="2"/>';
      h +=
        '<rect class="tlband" x="' +
        tlx(dm.startPct) +
        '" y="3" width="' +
        (((dm.endPct - dm.startPct) / 100) * 308).toFixed(1) +
        '" height="18"/>';
      h += '<line class="tlaxis" x1="6" y1="12" x2="314" y2="12"/>';
      tlm.ticks.forEach(function (tk) {
        h +=
          '<line class="tltickline" x1="' +
          tlx(tk.pct) +
          '" y1="9" x2="' +
          tlx(tk.pct) +
          '" y2="15"/>';
      });
      tlm.beats.forEach(function (bt) {
        var past = tlm.now && bt.s <= tlm.now.s + 1e-6;
        h +=
          '<circle class="tlbeat' +
          (past ? ' past' : '') +
          '" cx="' +
          tlx(bt.pct) +
          '" cy="12" r="2.2"/>';
      });
      tlm.events.forEach(function (ev) {
        h += '<circle class="tlev tl-' + ev.kind + '" cx="' + tlx(ev.pct) + '" cy="12" r="1.7"/>';
      });
      if (tlm.now) {
        var onx = tlx(tlm.now.pct);
        h += '<line class="tlnow" x1="' + onx + '" y1="4" x2="' + onx + '" y2="20"/>';
      }
      /* zoom connectors from the band to the detail axis */
      h +=
        '<line class="tlzoom" x1="' +
        tlx(dm.startPct) +
        '" y1="21" x2="6" y2="46"/>' +
        '<line class="tlzoom" x1="' +
        tlx(dm.endPct) +
        '" y1="21" x2="314" y2="46"/>';
      /* detail: one interval, beat to beat */
      h += '<line class="tlaxis" x1="6" y1="68" x2="314" y2="68"/>';
      dm.ticks.forEach(function (tk) {
        h +=
          '<line class="tltickline" x1="' +
          tlx(tk.pct) +
          '" y1="64" x2="' +
          tlx(tk.pct) +
          '" y2="72"/>';
      });
      h +=
        '<circle class="tlbeat' +
        (dm.startPast ? ' past' : '') +
        '" cx="6" cy="68" r="4.2"/>' +
        '<circle class="tlbeat' +
        (dm.endPast ? ' past' : '') +
        '" cx="314" cy="68" r="4.2"/>' +
        '<text class="tltick" x="6" y="84" text-anchor="start">' +
        esc(dm.startLabel) +
        '</text>' +
        '<text class="tltick" x="314" y="84" text-anchor="end">' +
        esc(dm.endLabel) +
        '</text>';
      dm.events.forEach(function (ev) {
        var x = tlx(ev.pct);
        h +=
          '<circle class="tlev tl-' +
          ev.kind +
          '" cx="' +
          x +
          '" cy="54" r="4"><title>' +
          esc(formatClock(ev.s) + (ev.label ? ' — ' + ev.label : '')) +
          '</title></circle>';
        if (ev.label && ev.labelRow != null)
          h +=
            '<text class="tlevlab" x="' +
            Math.min(Math.max(parseFloat(x), 16), 304) +
            '" y="' +
            (ev.labelRow === 0 ? 43 : 32) +
            '" text-anchor="middle">' +
            esc(ev.labelText || ev.label) +
            '</text>';
      });
      var dnx = tlx(dm.nowPct);
      h +=
        '<line class="tlnow" x1="' +
        dnx +
        '" y1="47" x2="' +
        dnx +
        '" y2="74"/>' +
        '<circle class="tlnowhead" cx="' +
        dnx +
        '" cy="47" r="3"/>';
      h += '</svg>';
    } else {
      h += '<svg class="tlsvg" viewBox="0 0 320 64" role="img" aria-label="timeline">';
      if (tlm.now)
        h +=
          '<rect class="tlelapsed" x="6" y="36" width="' +
          ((tlm.now.pct / 100) * 308).toFixed(1) +
          '" height="8" rx="2"/>';
      h += '<line class="tlaxis" x1="6" y1="40" x2="314" y2="40"/>';
      tlm.ticks.forEach(function (tk) {
        var x = tlx(tk.pct);
        h +=
          '<line class="tltickline" x1="' +
          x +
          '" y1="36" x2="' +
          x +
          '" y2="44"/>' +
          '<text class="tltick" x="' +
          x +
          '" y="56" text-anchor="middle">' +
          esc(tk.label) +
          '</text>';
      });
      tlm.beats.forEach(function (bt) {
        var past = tlm.now && bt.s <= tlm.now.s + 1e-6;
        h +=
          '<circle class="tlbeat' +
          (past ? ' past' : '') +
          '" cx="' +
          tlx(bt.pct) +
          '" cy="40" r="2.6"/>';
      });
      tlm.events.forEach(function (ev) {
        var x = tlx(ev.pct);
        h +=
          '<circle class="tlev tl-' +
          ev.kind +
          '" cx="' +
          x +
          '" cy="26" r="4"><title>' +
          esc(formatClock(ev.s) + (ev.label ? ' — ' + ev.label : '')) +
          '</title></circle>';
        if (ev.label && ev.labelRow != null)
          h +=
            '<text class="tlevlab" x="' +
            Math.min(Math.max(parseFloat(x), 16), 304) +
            '" y="' +
            (ev.labelRow === 0 ? 15 : 6) +
            '" text-anchor="middle">' +
            esc(ev.labelText || ev.label) +
            '</text>';
      });
      if (tlm.now) {
        var nx = tlx(tlm.now.pct);
        h +=
          '<line class="tlnow" x1="' +
          nx +
          '" y1="18" x2="' +
          nx +
          '" y2="46"/>' +
          '<circle class="tlnowhead" cx="' +
          nx +
          '" cy="18" r="3"/>';
      }
      h += '</svg>';
    }
    var tlmeta = [];
    if (tlm.every != null && tlm.every > 0) {
      var cad = (tlm.cadenceLabel || 'beat') + ' every ' + formatClock(tlm.every);
      if (tlm.beatsOmitted) cad += ' (' + tlm.beatsOmitted + ' beats — too dense to draw)';
      tlmeta.push(cad);
    }
    if (tlm.detail) tlmeta.push('window ' + tlm.detail.startLabel + '\u2013' + tlm.detail.endLabel);
    if (tlm.now) tlmeta.push('now ' + tlm.now.label);
    tlmeta.push('span ' + tlm.spanLabel);
    h += '<div class="tlmeta">' + esc(tlmeta.join(' · ')) + '</div>';
  }
  return { html: h };
});

PanelRegistry.extend('timeline', {
  order: 22,
  label: 'Timeline',
  since: '0.1.0',
});

PanelRegistry.extend('timeline', {
  styles: [
    {
      order: 561,
      css: String.raw`.tlsvg{width:100%; display:block;}
.tlaxis{stroke:var(--dfaint); stroke-width:1.6; opacity:.6;}
.tltickline{stroke:var(--dfaint); stroke-width:1; opacity:.45;}
.tltick{font:8.5px 'IBM Plex Mono',monospace; fill:var(--dfaint);}
.tlbeat{fill:none; stroke:var(--dfaint); stroke-width:1.4;}
.tlbeat.past{fill:var(--dtext); stroke:var(--dtext);}
.tlelapsed{fill:var(--dfaint); opacity:.16;}
.tlev.tl-ok{fill:#34D399;}
.tlev.tl-alert{fill:#F87171;}
.tlev.tl-info{fill:var(--dtext);}
.tlevlab{font:8.5px 'IBM Plex Mono',monospace; fill:var(--dtext);}
.tlnow{stroke:var(--dink); stroke-width:1.6;}
.tlnowhead{fill:var(--dink);}
.tlband{fill:var(--dtext); opacity:.09;}`,
    },
    {
      order: 576,
      css: String.raw`.tllane{font:8.5px 'IBM Plex Mono',monospace; fill:var(--dtext);}
.tlbadge{font:8.5px 'IBM Plex Mono',monospace; fill:var(--dfaint);}
.tlrowline{stroke:var(--dfaint); stroke-width:.7; opacity:.3;}
.tlcombline{stroke:var(--dtext); stroke-width:1;}
rect.tlpast{opacity:.6;}
rect.tlfuture{opacity:.18;}
.tlbandfill{fill:var(--dtext);}
.tlmiss{stroke:#F87171; stroke-width:2;}
.tlmissring{fill:none; stroke:#F87171; stroke-width:1.6;}
.tlzoom{stroke:var(--dfaint); stroke-width:1; stroke-dasharray:2 3; opacity:.55;}
.tlmeta{margin-top:4px; font:500 10px 'IBM Plex Mono',monospace; color:var(--dfaint);}`,
    },
  ],
});

/* timeline authoring contract; merged into this panel definition by the bundle. */
PanelRegistry.extend('timeline', {
  authoring: {
    template: {
      title: 'Heartbeat',
      span: '6h',
      cadence: { every: '30m', label: 'heartbeat' },
      initial: { now: '0m' },
    },
    setupFields: [
      ['span', 'clock'],
      ['cadence', 'objf', { cols: [{ k: 'every', kind: 'clock', req: true }, { k: 'label' }] }],
      [
        'lanes',
        'rows',
        {
          cols: [{ k: 'id', req: true }, { k: 'label' }, { k: 'every', kind: 'clock', req: true }],
          max: 4,
        },
      ],
      [
        'events',
        'rows',
        {
          cols: [
            { k: 'at', kind: 'clock', req: true },
            { k: 'label' },
            { k: 'kind', kind: 'enum', options: ['ok', 'alert', 'info'] },
            { k: 'lane' },
          ],
        },
      ],
      ['initial', 'json'],
    ],
    patchFields: [
      ['now', 'clock'],
      ['events', 'jsonArr'],
      ['miss', 'jsonArr'],
    ],
    picker: {
      order: 11,
      name: 'Heartbeat timeline',
      category: 'State & timing',
      tagline: 'Events in wall-clock time',
      description:
        'Show periodic beats, event markers, and elapsed time across a declared time span.',
    },
    origin: function (p, key, snapshot, context) {
      var assignment = context.assignment,
        history = context.history,
        input = context.input,
        own = context.own;
      if (key === 'events' || key === 'miss')
        return history([key], true, 'Accumulated ' + key + ' history');
      if (key === 'now')
        return assignment(
          key,
          function (v) {
            return parseClock(v) != null;
          },
          true,
          true
        );
    },
    example: function (sample, context) {
      var panel = sample.panel,
        state = sample.state,
        states = sample.states,
        step = sample.step;
      state = {
        now: '2h',
        events: [
          { at: '45m', label: 'wake', kind: 'info' },
          { at: '1h40m', label: 'report', kind: 'info' },
        ],
      };
      panel.initial = builderClone(state);

      return { panel: panel, state: state, states: states, step: step };
    },
  },
});
/* ---- src/panels/types/trace.js ---- */
/* trace validation and pure state helpers. */
/* Never calculate an apparently precise trace breakdown from malformed or
   cyclic data. Partial, structurally sound traces remain inspectable. */
function tracePanelData(p) {
  var spans = Array.isArray(p.spans) ? p.spans : [],
    errors = [],
    notices = [],
    byId = new Map();
  if (!spans.length || spans.length > 200)
    return { spans: [], errors: ['spans: expected 1–200 spans; timing unavailable'], notices: [] };
  spans.forEach(function (s, i) {
    var at = 'spans[' + i + ']';
    if (!s || typeof s !== 'object') {
      errors.push(at + ': expected a span object');
      return;
    }
    ['id', 'service', 'name'].forEach(function (k) {
      if (typeof s[k] !== 'string' || !s[k].trim())
        errors.push(at + '.' + k + ': expected a non-empty string');
    });
    if (byId.has(s.id)) errors.push(at + '.id: duplicate span id');
    byId.set(s.id, s);
    if (s.parentId != null && typeof s.parentId !== 'string')
      errors.push(at + '.parentId: expected a string or null');
    if (!isFiniteNum(s.ms) || s.ms < 0)
      errors.push(at + '.ms: expected a finite non-negative duration');
    if (!isFiniteNum(s.startMs) || s.startMs < 0 || !isFiniteNum(s.startMs + s.ms))
      errors.push(at + '.startMs: expected a finite non-negative offset and end');
  });
  if (errors.length) return { spans: [], errors: errors, notices: [] };
  var missing = 0,
    skew = 0;
  spans.forEach(function (s) {
    var seen = new Set([s.id]),
      parent = s.parentId;
    while (parent && byId.has(parent)) {
      if (seen.has(parent)) {
        errors.push('spans: parent cycle at ' + s.id);
        break;
      }
      seen.add(parent);
      parent = byId.get(parent).parentId;
    }
    var p = byId.get(s.parentId);
    if (s.parentId && !p) missing++;
    if (p && (s.startMs < p.startMs || s.startMs + s.ms > p.startMs + p.ms + 0.001)) skew++;
  });
  if (missing) notices.push(missing + ' span(s) have missing parents; coverage is partial.');
  if (skew)
    notices.push(
      skew +
        ' child span(s) extend beyond their parent; coverage clips these intervals, while timing rows retain the original offsets.'
    );
  return { spans: errors.length ? [] : spans.slice(), errors: errors, notices: notices };
}
function tracePanelPatchWarnings(state, path, p, warnings) {
  if (state == null) return;
  if (!panelObject(state)) {
    warnings.push(path + ': expected a state object');
    return;
  }
  if (
    state.selected != null &&
    !(
      Array.isArray(p.spans) &&
      p.spans.some(function (s) {
        return s && s.id === state.selected;
      })
    )
  )
    warnings.push(path + '.selected: no matching span; timing unavailable');
  if (state.enterOnce != null) {
    if (!panelObject(state.enterOnce)) warnings.push(path + '.enterOnce: expected an object');
    else {
      var once = Object.assign({}, state.enterOnce);
      delete once.enterOnce;
      tracePanelPatchWarnings(once, path + '.enterOnce', p, warnings);
    }
  }
}

PanelRegistry.extend('trace', {
  validateDeclaration: function (p, PP, warnings, errors, d) {
    var traceData = tracePanelData(p);
    traceData.errors.concat(traceData.notices).forEach(function (message) {
      warnings.push(PP + '.' + message);
    });
    tracePanelPatchWarnings(p.initial, PP + '.initial', p, warnings);
  },
  validatePatch: function (patch, path, panel, warnings, context) {
    tracePanelPatchWarnings(patch, path, panel, warnings);
  },
});

/* trace panel: presentation model and renderer. Shared lifecycle lives in ../shared.js. */
function traceIntervalUnion(intervals) {
  var sorted = intervals
      .filter(function (v) {
        return v[1] > v[0];
      })
      .map(function (v) {
        return v.slice();
      })
      .sort(function (a, b) {
        return a[0] - b[0] || a[1] - b[1];
      }),
    out = [];
  sorted.forEach(function (v) {
    var last = out[out.length - 1];
    if (last && v[0] <= last[1]) last[1] = Math.max(last[1], v[1]);
    else out.push(v);
  });
  return out;
}
function traceTimingModel(panel, state) {
  var data = tracePanelData(panel);
  if (data.errors.length) return { errors: data.errors, notices: data.notices };
  var spans = data.spans.sort(function (a, b) {
    return a.startMs - b.startMs || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });
  var byId = new Map(),
    children = new Map();
  spans.forEach(function (s) {
    byId.set(s.id, s);
  });
  spans.forEach(function (s) {
    if (!children.has(s.parentId)) children.set(s.parentId, []);
    children.get(s.parentId).push(s);
  });
  var selected = state && state.selected != null ? byId.get(state.selected) : spans[0];
  if (!selected) return { errors: ['Selected span is unavailable.'], notices: data.notices };
  function duration(intervals) {
    return intervals.reduce(function (sum, v) {
      return sum + (v[1] - v[0]);
    }, 0);
  }
  function stats(s) {
    var childSpans = children.get(s.id) || [];
    var covered = traceIntervalUnion(
      childSpans.map(function (c) {
        return [Math.max(s.startMs, c.startMs), Math.min(s.startMs + s.ms, c.startMs + c.ms)];
      })
    );
    var childMs = Math.min(s.ms, duration(covered));
    return {
      span: s,
      covered: covered,
      childMs: childMs,
      uncoveredMs: Math.max(0, s.ms - childMs),
      children: childSpans,
    };
  }
  var serviceSpans = spans.filter(function (s) {
    return s.service === selected.service;
  });
  var serviceIntervals = traceIntervalUnion(
    serviceSpans.map(function (s) {
      return [s.startMs, s.startMs + s.ms];
    })
  );
  var serviceStart = Math.min.apply(
    null,
    serviceSpans.map(function (s) {
      return s.startMs;
    })
  );
  var serviceEnd = Math.max.apply(
    null,
    serviceSpans.map(function (s) {
      return s.startMs + s.ms;
    })
  );
  var rows = [];
  function visit(s, depth) {
    if (s.service === selected.service) {
      var row = stats(s);
      row.depth = depth;
      rows.push(row);
    }
    (children.get(s.id) || []).forEach(function (c) {
      visit(c, depth + 1);
    });
  }
  spans
    .filter(function (s) {
      return !s.parentId || !byId.has(s.parentId);
    })
    .forEach(function (s) {
      visit(s, 0);
    });
  return {
    errors: [],
    notices: data.notices,
    selected: stats(selected),
    rows: rows,
    service: selected.service,
    serviceStart: serviceStart,
    serviceEnd: serviceEnd,
    serviceCoverageMs: duration(serviceIntervals),
  };
}
function tracePanelHTML(panel, state, states) {
  var m = traceTimingModel(panel, state);
  function ms(n) {
    return String(Math.round(n * 1000) / 1000) + ' ms';
  }
  if (m.errors.length)
    return (
      '<div class="tr-time"><b>Timing unavailable</b><p>' + esc(m.errors.join(' · ')) + '</p></div>'
    );
  var s = m.selected,
    duration = s.span.ms,
    h = '<div class="tr-time">';
  var serviceSteps = new Map(),
    spanServices = new Map();
  panel.spans.forEach(function (span) {
    spanServices.set(span.id, span.service);
  });
  (states || []).forEach(function (st, i) {
    var service = st && spanServices.get(st.selected);
    if (service && !serviceSteps.has(service)) serviceSteps.set(service, i);
  });
  if (serviceSteps.size > 1) {
    h +=
      '<label class="tr-picker">Inspect service<select data-dv-trace-service aria-label="Inspect service">';
    serviceSteps.forEach(function (i, service) {
      h +=
        '<option value="' +
        i +
        '"' +
        (service === m.service ? ' selected' : '') +
        '>' +
        esc(service) +
        '</option>';
    });
    h += '</select></label>';
  }
  h +=
    '<div class="tr-service">' +
    esc(m.service) +
    '</div><p class="tr-coverage">Service span coverage (union): <b>' +
    ms(m.serviceCoverageMs) +
    '</b> · ' +
    m.rows.length +
    ' observed span(s)</p>';
  h +=
    '<div class="tr-selected"><b>' +
    esc(s.span.name) +
    '</b><code>' +
    esc(s.span.id) +
    '</code><small>Parent: ' +
    esc(s.span.parentId || 'none') +
    '</small></div>';
  h +=
    '<dl class="tr-metrics"><div><dt>Inclusive</dt><dd>' +
    ms(duration) +
    '</dd></div><div><dt>Child-covered</dt><dd>' +
    ms(s.childMs) +
    '</dd></div><div><dt>Uncovered</dt><dd>' +
    ms(s.uncoveredMs) +
    '</dd></div></dl>';
  h +=
    '<div class="tr-interval' +
    (duration === 0 ? ' tr-zero' : '') +
    '" role="img" aria-label="' +
    esc(
      'Selected span: ' +
        ms(duration) +
        ' inclusive, ' +
        ms(s.childMs) +
        ' child-covered, ' +
        ms(s.uncoveredMs) +
        ' uncovered'
    ) +
    '">';
  s.covered.forEach(function (v) {
    h +=
      '<span class="tr-covered" style="left:' +
      (((v[0] - s.span.startMs) / duration) * 100).toFixed(4) +
      '%;width:' +
      (((v[1] - v[0]) / duration) * 100).toFixed(4) +
      '%"></span>';
  });
  h +=
    '</div><p class="tr-key">' +
    (duration === 0
      ? 'Zero-duration span; no wall-time interval.'
      : '<span>Blue: child-covered</span> · <span>Hatched: uncovered</span>') +
    '</p>';
  h +=
    '<p class="tr-explain">Direct-child intervals count once where they overlap and are clipped to this span. Uncovered wall time can include local work, waiting, and missing instrumentation; it is not CPU time.</p>';
  m.notices.forEach(function (n) {
    h += '<p class="tr-notice">' + esc(n) + '</p>';
  });
  h +=
    '<div class="tr-ophead">Service operations · inclusive / uncovered</div><div class="tr-operations">';
  m.rows.forEach(function (r) {
    var step = (states || []).findIndex(function (st) {
      return st && st.selected === r.span.id;
    });
    var extent = m.serviceEnd - m.serviceStart,
      selected = r.span.id === s.span.id;
    var description =
      r.span.name +
      ' · ' +
      r.span.id +
      ' · parent ' +
      (r.span.parentId || 'none') +
      ' · +' +
      ms(r.span.startMs) +
      ' · ' +
      ms(r.span.ms) +
      ' inclusive / ' +
      ms(r.uncoveredMs) +
      ' uncovered' +
      (r.span.error === true ? ' · recorded error' : '');
    h +=
      '<' +
      (step >= 0 ? 'button type="button" data-dv-trace-step="' + step + '"' : 'div') +
      ' class="tr-op' +
      (selected ? ' tr-current' : '') +
      '" title="' +
      esc(description) +
      '"' +
      (step >= 0 ? ' aria-label="Inspect ' + esc(description) + '"' : '') +
      '>';
    h +=
      '<span class="tr-opname">' +
      (r.depth ? '↳ ' : '') +
      esc(r.span.name) +
      (r.span.error === true ? ' · ERROR' : '') +
      '</span><span class="tr-opvalues">' +
      ms(r.span.ms) +
      ' / ' +
      ms(r.uncoveredMs) +
      '</span>';
    h +=
      '<span class="tr-optrack"><span style="left:' +
      (extent ? ((r.span.startMs - m.serviceStart) / extent) * 100 : 0).toFixed(4) +
      '%;width:' +
      (extent ? (r.span.ms / extent) * 100 : 0).toFixed(4) +
      '%"></span></span>';
    h += '</' + (step >= 0 ? 'button' : 'div') + '>';
  });
  h +=
    '</div><p class="tr-explain">Rows share the service’s +' +
    ms(m.serviceStart) +
    ' to +' +
    ms(m.serviceEnd) +
    ' scale. Nested spans overlap; row durations must not be added. The parent ID remains in each row’s tooltip.</p>';
  if (s.children.length) {
    h +=
      '<details class="tr-children"><summary>' +
      s.children.length +
      ' direct child span(s)</summary><ul>';
    s.children.forEach(function (c) {
      h +=
        '<li>' +
        esc(c.service + ' · ' + c.name) +
        ' · ' +
        ms(c.ms) +
        (c.service === m.service ? ' · same service' : ' · other service') +
        '</li>';
    });
    h += '</ul></details>';
  }
  return h + '</div>';
}

PanelViews.register(
  'trace',
  function (host, panel, state, skin, states, stepIdx, animate) {
    var h = '';
    h = tracePanelHTML(panel, state, states);
    return { html: h };
  },
  { historyRequiresSteps: true }
);

PanelRegistry.extend('trace', {
  order: 26,
  label: 'Trace',
  since: '0.1.0',
});

PanelRegistry.extend('trace', {
  styles: [
    {
      order: 2241,
      css: String.raw`.tr-time{color:var(--dtext);font:12px/1.5 'IBM Plex Sans',sans-serif;overflow-wrap:anywhere;}
.tr-service{font-weight:700;font-size:15px;}
.tr-picker{display:grid;gap:4px;margin-bottom:10px;font-weight:600;}
.tr-picker select{width:100%;min-width:0;padding:6px;border:1px solid currentColor;border-radius:5px;background:transparent;color:inherit;font:inherit;}
.tr-picker option{color:#182334;background:#F8FAFC;}
.tr-coverage,.tr-explain,.tr-key{font-size:11px;line-height:1.45;margin:7px 0;}
.tr-selected{display:grid;gap:3px;padding:8px 0;border-top:1px solid color-mix(in srgb,currentColor 25%,transparent);}
.tr-selected code{font-size:10px;}
.tr-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin:5px 0 9px;}
.tr-metrics dt{font-size:10px;}
.tr-metrics dd{margin:0;font-weight:700;font-size:14px;}
.tr-interval{height:20px;position:relative;border:1px solid currentColor;border-radius:4px;overflow:hidden;
  background:repeating-linear-gradient(135deg,transparent 0 4px,color-mix(in srgb,currentColor 30%,transparent) 4px 6px);}
.tr-covered{position:absolute;top:0;bottom:0;background:#287DC1;}
.tr-zero{background:none;}
.tr-notice{border-left:3px solid currentColor;padding-left:6px;font-size:11px;}
.tr-ophead{margin-top:12px;font-weight:600;font-size:11px;}
.tr-operations{max-height:300px;overflow:auto;}
.tr-op{display:grid;width:100%;grid-template-columns:minmax(0,1fr);gap:2px;text-align:left;padding:7px;margin:4px 0;
  color:inherit;background:transparent;border:1px solid color-mix(in srgb,currentColor 25%,transparent);border-radius:5px;font:inherit;}
button.tr-op{cursor:pointer;}
.tr-current{border:2px solid currentColor;padding:6px;}
.tr-opname{font-weight:600;}
.tr-opvalues{font:10px 'IBM Plex Mono',monospace;}
.tr-optrack{height:7px;position:relative;background:color-mix(in srgb,currentColor 12%,transparent);}
.tr-optrack>span{position:absolute;top:0;bottom:0;background:currentColor;}
.tr-op:focus-visible,.tr-picker select:focus-visible{outline:2px solid currentColor;outline-offset:2px;}
.tr-children{font-size:11px;margin-top:8px;}
.tr-children summary{cursor:pointer;font-weight:600;}
.tr-children ul{padding-left:18px;}
@media print{.tr-operations{max-height:none;overflow:visible;}}
@media print{.tr-picker{display:none;}}
@media print{.tr-covered{background:#AAA;print-color-adjust:exact;}}`,
    },
  ],
});

/* trace authoring contract; merged into this panel definition by the bundle. */
PanelRegistry.extend('trace', {
  authoring: {
    template: {
      title: 'Inside the service',
      spans: [
        { id: 'request', service: 'api', name: 'handle request', startMs: 0, ms: 100 },
        {
          id: 'parse',
          parentId: 'request',
          service: 'api',
          name: 'parse input',
          startMs: 5,
          ms: 20,
        },
        {
          id: 'query',
          parentId: 'request',
          service: 'database',
          name: 'query',
          startMs: 30,
          ms: 50,
        },
      ],
      initial: { selected: 'request' },
    },
    setupFields: [
      ['spans', 'json'],
      ['initial', 'json'],
    ],
    patchFields: [['selected', 'text']],
    picker: {
      order: 3,
      name: 'Service trace',
      category: 'Software & data',
      tagline: 'Inside a request',
      description: 'Break a request into nested spans to show where services spend their time.',
    },
  },
});
/* ---- src/panels/types/waterfall.js ---- */
/* waterfall validation and pure state helpers. */

PanelRegistry.extend('waterfall', {
  validateDeclaration: function (p, PP, warnings, errors, d) {
    if (!(Array.isArray(p.spans) && p.spans.length))
      warnings.push(PP + '.spans: waterfall needs spans:[{id, label, ms}] — panel renders empty');
    if (Array.isArray(p.spans))
      p.spans.forEach(function (span, si) {
        if (!span || !isFiniteNum(span.ms) || span.ms < 0)
          warnings.push(PP + '.spans[' + si + '].ms: expected a finite non-negative duration');
        if (span && span.startMs != null && (!isFiniteNum(span.startMs) || span.startMs < 0))
          warnings.push(
            PP +
              '.spans[' +
              si +
              '].startMs: expected a finite non-negative offset — using the previous span end'
          );
      });
  },
});

/* waterfall panel: presentation model and renderer. Shared lifecycle lives in ../shared.js. */
function waterfallModel(spans, state) {
  spans = Array.isArray(spans) ? spans : [];
  state = state || {};
  var total = 0,
    cursor = 0;
  var timed = spans.some(function (s) {
    return s && isFiniteNum(s.startMs) && s.startMs >= 0;
  });
  var measured = spans.map(function (s) {
    var ms = s && isFiniteNum(s.ms) && s.ms > 0 ? s.ms : 0;
    var start = s && isFiniteNum(s.startMs) && s.startMs >= 0 ? s.startMs : cursor;
    cursor = start + ms;
    total = Math.max(total, cursor);
    return { ms: ms, start: start };
  });
  var reveal =
    typeof state.reveal === 'number' ? clamp(state.reveal, 0, spans.length) : spans.length;
  var shown = 0,
    rows = [];
  spans.forEach(function (s, i) {
    var ms = measured[i].ms,
      off = measured[i].start;
    var revealed = i < reveal;
    if (revealed) shown = Math.max(shown, off + ms);
    rows.push({
      id: s && s.id,
      label: (s && (s.label || s.id)) || '',
      ms: ms,
      startMs: off,
      error: !!(s && s.error === true),
      offsetPct: total ? (off / total) * 100 : 0,
      widthPct: total ? (ms / total) * 100 : 0,
      revealed: revealed,
      highlight: !!(s && state.highlight === s.id),
    });
  });
  return {
    rows: rows,
    totalMs: total,
    shownMs: shown,
    timed: timed,
    totalLabel: state.total != null ? String(state.total) : shown + ' ms',
  };
}

PanelViews.register('waterfall', function (host, panel, state, skin, states, stepIdx, animate) {
  var h = '';
  var waterfallEntrants;
  var wm = waterfallModel(panel.spans, state);
  var wfPrev = host._wfRevealed || null;
  var wfNow = wm.rows.map(function (r) {
    return r.revealed;
  });
  waterfallEntrants = wfPrev
    ? wfNow.map(function (on, i) {
        return on && !wfPrev[i];
      })
    : null;
  host._wfRevealed = wfNow;
  h += '<div class="wfall' + (wm.timed ? ' wf-timed' : '') + '">';
  wm.rows.forEach(function (r) {
    h +=
      '<div class="wfrow' +
      (r.revealed ? ' on' : '') +
      (r.highlight ? ' hl' : '') +
      (r.error ? ' wf-error' : '') +
      '" title="' +
      esc(
        r.label +
          ' · start +' +
          r.startMs +
          ' ms · duration ' +
          r.ms +
          ' ms' +
          (r.error ? ' · recorded error' : '')
      ) +
      '">' +
      '<span class="wflabel">' +
      esc(r.label) +
      '</span>' +
      '<span class="wftrack"><span class="wfbar" style="margin-left:' +
      r.offsetPct.toFixed(2) +
      '%;width:' +
      Math.max(r.widthPct, wm.timed ? 0 : 1.2).toFixed(2) +
      '%"></span></span>' +
      '<span class="wfms">' +
      (r.revealed ? (r.error ? '! ' : '') + esc(String(r.ms)) + ' ms' : '&#8212;') +
      '</span></div>';
  });
  h +=
    '<div class="wftotal">' +
    (wm.timed ? 'elapsed extent ' : 'total ') +
    '<b>' +
    esc(wm.totalLabel) +
    '</b></div></div>';
  return {
    html: h,
    enterBars: { rows: '.wfrow', bar: '.wfbar', entrants: waterfallEntrants },
  };
});

PanelRegistry.extend('waterfall', {
  order: 6,
  label: 'Waterfall',
  since: '0.1.0',
});

PanelRegistry.extend('waterfall', {
  styles: [
    {
      order: 259,
      css: String.raw`.wf-timed{max-height:350px; overflow:auto;}
.wf-timed .wflabel{overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}
.wfrow.wf-error .wfbar{background:#DD5A65;}
.wfrow.wf-error .wfms{font-weight:700; text-decoration:underline dotted;}`,
    },
    { order: 559, css: String.raw`.wfall{display:flex; flex-direction:column; gap:5px;}` },
    {
      order: 587,
      css: String.raw`.wfrow{display:flex; align-items:center; gap:8px; opacity:.3; transition:opacity .3s ease;}
.wfrow.on{opacity:1;}
.wflabel{font:500 10.5px 'IBM Plex Mono',monospace; width:128px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}
.sk-aurora .wflabel{color:#93A7C9;}
.sk-daylight .wflabel{color:#6B6F7A;}
.wftrack{flex:1; height:10px; border-radius:5px; display:block; overflow:hidden;}
.sk-aurora .wftrack{background:#101A2C;}
.sk-daylight .wftrack{background:#F4F2EC;}
.wfbar{display:block; height:100%; border-radius:5px; background:#38E1FF;}
.wfbar.dv-bar-enter{transform-origin:left center; animation:dvbarenter .5s cubic-bezier(.4,0,.2,1);}`,
    },
    {
      order: 598,
      css: String.raw`.sk-daylight .wfbar{background:#4956C9;}
.wfrow.hl .wfbar{background:#FFB454; box-shadow:0 0 8px rgba(255,180,84,.7);}
.sk-daylight .wfrow.hl .wfbar{background:#B45309; box-shadow:none;}
.wfms{font:600 10px 'IBM Plex Mono',monospace; width:52px; text-align:right;}
.sk-aurora .wfms{color:#93A7C9;}
.sk-daylight .wfms{color:#6B6F7A;}
.wftotal{font:500 10.5px 'IBM Plex Mono',monospace; margin-top:4px; text-align:right;}
.sk-aurora .wftotal{color:#5E7396;}
.sk-aurora .wftotal b{color:#8AE8FF;}
.sk-daylight .wftotal{color:#8A8474;}
.sk-daylight .wftotal b{color:#4956C9;}`,
    },
    {
      order: 1364,
      css: String.raw`body.sk-editorial .sk-aurora .wfbar,
body.sk-editorial .sk-daylight .wfbar{border-radius:1px; background:var(--ed-accent);}
body.sk-editorial .sk-aurora .wfrow.hl .wfbar,
body.sk-editorial .sk-daylight .wfrow.hl .wfbar{background:var(--ed-warn); box-shadow:none;}`,
    },
    {
      order: 1586,
      css: String.raw`@media screen {

  body.sk-terminal .wfrow{gap:7px;}
}
@media screen {
  body.sk-terminal .wflabel,
  body.sk-terminal .wfms,
  body.sk-terminal .wftotal,
  body.sk-terminal .sk-aurora .wflabel,
  body.sk-terminal .sk-aurora .wfms,
  body.sk-terminal .sk-aurora .wftotal{color:var(--tm-muted); font-size:9px;}
}
@media screen {
  body.sk-terminal .wflabel{letter-spacing:.04em; text-transform:uppercase;}
}
@media screen {
  body.sk-terminal .wfbar{background:var(--tm-good); border-radius:0;}
}
@media screen {
  body.sk-terminal .wfrow.hl .wfbar{background:var(--tm-alert);}
}
@media screen {
  body.sk-terminal .sk-aurora .wftotal b{color:var(--tm-good);}
}`,
    },
    {
      order: 1795,
      css: String.raw`@media screen {

  body.sk-pastel .wfall { gap:7px; }
}
@media screen {
  body.sk-pastel .wfrow { gap:9px; }
}
@media screen {
  body.sk-pastel .wflabel,
  body.sk-pastel .wfms,
  body.sk-pastel .wftotal,
  body.sk-pastel .sk-aurora .wflabel,
  body.sk-pastel .sk-daylight .wflabel,
  body.sk-pastel .sk-aurora .wfms,
  body.sk-pastel .sk-daylight .wfms,
  body.sk-pastel .sk-aurora .wftotal,
  body.sk-pastel .sk-daylight .wftotal { color:#657287; }
}
@media screen {
  body.sk-pastel .wftrack { height:9px; border-radius:999px; }
}
@media screen {
  body.sk-pastel .wfbar,
  body.sk-pastel .sk-daylight .wfbar { background:#7584D4; border-radius:999px; }
}
@media screen {
  body.sk-pastel .wfrow.hl .wfbar,
  body.sk-pastel .sk-daylight .wfrow.hl .wfbar { background:#D19A4D; box-shadow:0 0 0 3px rgba(209,154,77,.12); }
}
@media screen {
  body.sk-pastel .sk-aurora .wftotal b,
  body.sk-pastel .sk-daylight .wftotal b { color:#5263B9; }
}`,
    },
    {
      order: 1941,
      css: String.raw`@media screen {
  @media (max-width:640px) {
    body.sk-pastel .wflabel { width:96px; }
  }
}`,
    },
    {
      order: 2031,
      css: String.raw`@media screen {

  body.sk-blueprint .wfall{gap:4px;}
}
@media screen {
  body.sk-blueprint .wfrow{gap:6px;}
}
@media screen {
  body.sk-blueprint .docview .wflabel,body.sk-blueprint .docview .wfms{color:#CBE3EF;}
}
@media screen {
  body.sk-blueprint .wflabel{width:116px;font-size:10px;}
}
@media screen {
  body.sk-blueprint .docview .wftrack{height:8px;border:1px solid #2F7898;border-radius:0;background:#031F43;}
}
@media screen {
  body.sk-blueprint .wfbar{border-radius:0;background:#58E7FF;}
}
@media screen {
  body.sk-blueprint .wfrow.hl .wfbar{background:#FFD166;box-shadow:0 0 6px rgba(255,209,102,.65);}
}
@media screen {
  body.sk-blueprint .docview .wftotal{color:#95BED4;}
}
@media screen {
  body.sk-blueprint .docview .wftotal b{color:#FFFFFF;}
}`,
    },
  ],
});

/* waterfall authoring contract; merged into this panel definition by the bundle. */
PanelRegistry.extend('waterfall', {
  authoring: {
    template: {
      title: 'Latency budget',
      spans: [
        { id: 'net', label: 'network', ms: 40 },
        { id: 'work', label: 'processing', ms: 120 },
      ],
    },
    setupFields: [
      [
        'spans',
        'rows',
        {
          cols: [
            { k: 'id', req: true },
            { k: 'label' },
            { k: 'ms', kind: 'num', req: true },
            { k: 'startMs', kind: 'num' },
          ],
        },
      ],
      ['initial', 'json'],
    ],
    patchFields: [
      ['reveal', 'num'],
      ['highlight', 'text'],
      ['total', 'text'],
    ],
    picker: {
      order: 10,
      name: 'Latency waterfall',
      category: 'State & timing',
      tagline: 'See where time goes',
      description: 'Compare operation durations or timed spans to explain the cost of a request.',
    },
    example: function (sample, context) {
      var panel = sample.panel,
        state = sample.state,
        states = sample.states,
        step = sample.step;
      panel.spans = [
        { id: 'net', label: 'network', ms: 40 },
        { id: 'auth', label: 'authorize', ms: 25 },
        { id: 'work', label: 'processing', ms: 120 },
      ];
      panel.initial = builderClone(state);

      return { panel: panel, state: state, states: states, step: step };
    },
  },
});
/* ---- src/panels/types/xray.js ---- */
/* xray validation and pure state helpers. */

PanelRegistry.extend('xray', {
  validateDeclaration: function (p, PP, warnings, errors, d) {
    if (!(Array.isArray(p.layers) && p.layers.length))
      warnings.push(
        PP +
          '.layers: xray needs layers:[{id, label, holder}], outermost first — panel renders empty'
      );
  },
});

/* xray panel: presentation model and renderer. Shared lifecycle lives in ../shared.js. */
function xrayModel(declared, stateLayers) {
  var st = {};
  (Array.isArray(stateLayers) ? stateLayers : []).forEach(function (l) {
    if (l && l.id) st[l.id] = l.open === true;
  });
  return (Array.isArray(declared) ? declared : []).map(function (l) {
    l = l || {};
    return {
      id: l.id,
      label: l.label || l.id || '',
      holder: l.holder || '',
      open: st[l.id] === true,
    };
  });
}

PanelViews.register('xray', function (host, panel, state, skin, states, stepIdx, animate) {
  var h = '';
  var xm = xrayModel(panel.layers, state.layers);
  var xopen = '',
    xclose = '';
  xm.forEach(function (l) {
    xopen +=
      '<div class="xlayer ' +
      (l.open ? 'open' : 'sealed') +
      '">' +
      '<div class="xhead"><span class="xstate">' +
      (l.open ? 'OPEN' : 'SEALED') +
      '</span>' +
      '<span class="xname">' +
      esc(l.label) +
      '</span>' +
      (l.holder ? '<span class="xholder">key: ' + esc(l.holder) + '</span>' : '') +
      '</div>';
    xclose = '</div>' + xclose;
  });
  h += '<div class="xray">' + xopen + '<div class="xcore">payload</div>' + xclose + '</div>';
  if (state.hop != null) {
    var readable =
      xm.length > 0 &&
      xm.every(function (l) {
        return l.open;
      });
    h +=
      '<div class="xfoot' +
      (readable ? ' yes' : ' no') +
      '">at <b>' +
      esc(String(state.hop)) +
      '</b> — payload ' +
      (readable ? 'READABLE here' : 'NOT readable here') +
      '</div>';
  }
  return { html: h };
});

PanelRegistry.extend('xray', {
  order: 9,
  label: 'Device internals',
  since: '0.1.0',
});

PanelRegistry.extend('xray', {
  styles: [
    {
      order: 989,
      css: String.raw`.xlayer{border-radius:9px; padding:7px 9px 9px;}
.xlayer + .xcore, .xlayer .xlayer, .xlayer .xcore{margin-top:6px;}
.xlayer.sealed{border:1.5px solid;}
.xlayer.open{border:1.5px dashed;}
.sk-aurora .xlayer.sealed{border-color:#3B4A63; background:rgba(16,26,44,.55);}
.sk-aurora .xlayer.open{border-color:#38E1FF; background:rgba(12,34,48,.5);}
.sk-daylight .xlayer.sealed{border-color:#C9C4B8; background:#F8F6F0;}
.sk-daylight .xlayer.open{border-color:#4956C9; background:#EEF0FB;}`,
    },
    {
      order: 999,
      css: String.raw`.sk-aurora .xlayer.sealed .xstate{background:#101A2C; color:#55627A;}
.sk-aurora .xlayer.open .xstate{background:#0C2230; color:#8AE8FF;}
.sk-daylight .xlayer.sealed .xstate{background:#EFEDE6; color:#9A958A;}
.sk-daylight .xlayer.open .xstate{background:#E2E6FA; color:#4956C9;}`,
    },
    {
      order: 1005,
      css: String.raw`.xholder{font-size:9.5px; margin-left:auto;}
.sk-aurora .xholder{color:#5E7396;}
.sk-daylight .xholder{color:#8A8474;}`,
    },
    {
      order: 1011,
      css: String.raw`.xfoot{font:600 10.5px 'IBM Plex Mono',monospace; margin-top:8px;}
.sk-aurora .xfoot.yes{color:#4ADE80;}
.sk-aurora .xfoot.no{color:#F87171;}
.sk-daylight .xfoot.yes{color:#0E9382;}
.sk-daylight .xfoot.no{color:#B91C1C;}
.sk-aurora .xfoot b{color:#EAF2FF;}
.sk-daylight .xfoot b{color:#23272E;}`,
    },
    {
      order: 1440,
      css: String.raw`body.sk-editorial .sk-aurora .xlayer.sealed,
body.sk-editorial .sk-daylight .xlayer.sealed{border-color:var(--ed-rule-strong); background:var(--ed-paper);}
body.sk-editorial .sk-aurora .xlayer.open,
body.sk-editorial .sk-daylight .xlayer.open{border-color:var(--ed-accent); background:var(--ed-accent-soft);}
body.sk-editorial .xlayer{border-radius:2px;}
body.sk-editorial .sk-aurora .xlayer.sealed .xstate,
body.sk-editorial .sk-daylight .xlayer.sealed .xstate{color:var(--ed-muted); background:#E5DED2;}
body.sk-editorial .sk-aurora .xlayer.open .xstate,
body.sk-editorial .sk-daylight .xlayer.open .xstate{color:var(--ed-accent-deep); background:#CFE1DC;}`,
    },
    {
      order: 1446,
      css: String.raw`body.sk-editorial .sk-aurora .xname,
body.sk-editorial .sk-daylight .xname,
body.sk-editorial .sk-aurora .xfoot b,
body.sk-editorial .sk-daylight .xfoot b{color:var(--ed-ink);}
body.sk-editorial .sk-aurora .xholder,
body.sk-editorial .sk-daylight .xholder{color:var(--ed-muted);}`,
    },
    {
      order: 1449,
      css: String.raw`body.sk-editorial .sk-aurora .xfoot.yes,
body.sk-editorial .sk-daylight .xfoot.yes{color:var(--ed-good);}
body.sk-editorial .sk-aurora .xfoot.no,
body.sk-editorial .sk-daylight .xfoot.no{color:var(--ed-bad);}`,
    },
    {
      order: 1646,
      css: String.raw`@media screen {

  body.sk-terminal .xlayer,
  body.sk-terminal .xcore{border-radius:0;}
}
@media screen {
  body.sk-terminal .sk-aurora .xlayer.sealed{color:var(--tm-text); background:var(--tm-raised); border:1px solid var(--tm-line);}
}
@media screen {
  body.sk-terminal .sk-aurora .xlayer.open{color:var(--tm-text); background:#07100C; border:1px dashed var(--tm-good);}
}`,
    },
    {
      order: 1650,
      css: String.raw`@media screen {
  body.sk-terminal .sk-aurora .xlayer.sealed .xstate{color:var(--tm-muted); background:var(--tm-line-dim);}
}
@media screen {
  body.sk-terminal .sk-aurora .xlayer.open .xstate{color:var(--tm-good); background:#0B1912;}
}`,
    },
    {
      order: 1653,
      css: String.raw`@media screen {
  body.sk-terminal .sk-aurora .xholder{color:var(--tm-muted);}
}`,
    },
    {
      order: 1655,
      css: String.raw`@media screen {
  body.sk-terminal .sk-aurora .xfoot.yes{color:var(--tm-good);}
}
@media screen {
  body.sk-terminal .sk-aurora .xfoot.no{color:var(--tm-alert);}
}`,
    },
    {
      order: 1868,
      css: String.raw`@media screen {

  body.sk-pastel .xlayer { border-radius:12px; }
}
@media screen {
  body.sk-pastel .sk-aurora .xlayer.sealed,
  body.sk-pastel .sk-daylight .xlayer.sealed { border-color:#D4DDE8; background:#F7F9FC; }
}
@media screen {
  body.sk-pastel .sk-aurora .xlayer.open,
  body.sk-pastel .sk-daylight .xlayer.open { border-color:#9AA6DE; background:#F0F2FF; }
}`,
    },
    {
      order: 1872,
      css: String.raw`@media screen {
  body.sk-pastel .sk-aurora .xlayer.sealed .xstate,
  body.sk-pastel .sk-daylight .xlayer.sealed .xstate { color:#748095; background:#E9EDF3; }
}
@media screen {
  body.sk-pastel .sk-aurora .xlayer.open .xstate,
  body.sk-pastel .sk-daylight .xlayer.open .xstate { color:#5263B9; background:#E2E6FB; }
}
@media screen {
  body.sk-pastel .sk-aurora .xname,
  body.sk-pastel .sk-daylight .xname,
  body.sk-pastel .sk-aurora .xfoot b,
  body.sk-pastel .sk-daylight .xfoot b { color:#2D3B54; }
}
@media screen {
  body.sk-pastel .sk-aurora .xholder,
  body.sk-pastel .sk-daylight .xholder { color:#7B8799; }
}`,
    },
    {
      order: 1877,
      css: String.raw`@media screen {
  body.sk-pastel .sk-aurora .xfoot.yes,
  body.sk-pastel .sk-daylight .xfoot.yes { color:#287A55; }
}
@media screen {
  body.sk-pastel .sk-aurora .xfoot.no,
  body.sk-pastel .sk-daylight .xfoot.no { color:#B44755; }
}`,
    },
    {
      order: 2103,
      css: String.raw`@media screen {

  body.sk-blueprint .xlayer{padding:5px 7px 7px;border-radius:0;}
}
@media screen {
  body.sk-blueprint .xlayer + .xcore,body.sk-blueprint .xlayer .xlayer,body.sk-blueprint .xlayer .xcore{margin-top:4px;}
}
@media screen {
  body.sk-blueprint .docview .xlayer.sealed{border-color:#6EA9C1;background:#04244B;}
}
@media screen {
  body.sk-blueprint .docview .xlayer.open{border-color:#58E7FF;background:#06386B;}
}`,
    },
    {
      order: 2108,
      css: String.raw`@media screen {
  body.sk-blueprint .docview .xlayer.sealed .xstate{background:#052956;color:#A4C4D4;}
}
@media screen {
  body.sk-blueprint .docview .xlayer.open .xstate{background:#0B4A7E;color:#D9FAFF;}
}`,
    },
    {
      order: 2111,
      css: String.raw`@media screen {
  body.sk-blueprint .docview .xholder{color:#A0C4D6;}
}`,
    },
    {
      order: 2114,
      css: String.raw`@media screen {
  body.sk-blueprint .docview .xfoot.yes{color:#47F590;}
}
@media screen {
  body.sk-blueprint .docview .xfoot.no{color:#FF7881;}
}
@media screen {
  body.sk-blueprint .docview .xfoot b{color:#FFFFFF;}
}`,
    },
  ],
});

/* xray authoring contract; merged into this panel definition by the bundle. */
PanelRegistry.extend('xray', {
  authoring: {
    template: {
      title: 'Layers',
      layers: [
        { id: 'case', label: 'Case', holder: true },
        { id: 'board', label: 'Board' },
      ],
    },
    setupFields: [
      ['layers', 'rows', { cols: [{ k: 'id', req: true }, { k: 'label' }, { k: 'holder' }] }],
      ['initial', 'json'],
    ],
    patchFields: [
      ['layers', 'jsonArr'],
      ['hop', 'text'],
    ],
    picker: {
      order: 26,
      name: 'Layer X-ray',
      category: 'Devices & interfaces',
      tagline: 'Look through the layers',
      description:
        'Explain nested layers, who holds each key, and where a payload becomes readable.',
    },
    example: function (sample, context) {
      var panel = sample.panel,
        state = sample.state,
        states = sample.states,
        step = sample.step;
      panel.layers[0].holder = 'Gateway';
      state = {
        layers: [
          { id: 'case', open: true },
          { id: 'board', open: false },
        ],
        hop: 'gateway',
      };
      panel.initial = builderClone(state);

      return { panel: panel, state: state, states: states, step: step };
    },
  },
});
/* ---- src/panels/types/zoneframe.js ---- */
/* zoneframe validation and pure state helpers. */

PanelRegistry.extend('zoneframe', {
  validateDeclaration: function (p, PP, warnings, errors, d) {
    if (!(Array.isArray(p.zones) && p.zones.length))
      warnings.push(PP + '.zones: zoneframe needs zones:[{id, points}] — panel renders empty');
    else
      p.zones.forEach(function (z, zi) {
        if (!z || !z.id || !Array.isArray(z.points) || z.points.length < 3)
          warnings.push(
            PP +
              '.zones[' +
              zi +
              ']: needs {id, points:[[x,y]…]} with 3+ points in the 320×180 frame'
          );
      });
  },
});

/* zoneframe panel: presentation model and renderer. Shared lifecycle lives in ../shared.js. */
function zoneModel(declared, stateZones) {
  var ZKINDS = ['armed', 'ignored', 'masked'];
  var st = {};
  (Array.isArray(stateZones) ? stateZones : []).forEach(function (z) {
    if (z && z.id) st[z.id] = z.state;
  });
  return (Array.isArray(declared) ? declared : []).map(function (z) {
    z = z || {};
    var s = st[z.id] != null ? st[z.id] : z.state || 'armed';
    if (ZKINDS.indexOf(s) < 0) s = 'armed';
    var zpts = (Array.isArray(z.points) ? z.points : []).filter(function (p) {
      return (
        Array.isArray(p) &&
        typeof p[0] === 'number' &&
        isFinite(p[0]) &&
        typeof p[1] === 'number' &&
        isFinite(p[1])
      );
    });
    return { id: z.id, label: z.label || z.id || '', state: s, points: zpts };
  });
}

PanelViews.register('zoneframe', function (host, panel, state, skin, states, stepIdx, animate) {
  var h = '';
  var zm = zoneModel(panel.zones, state.zones);
  /* pattern id is per-HOST, not per-render: a fresh id every render would
       make otherwise-identical markup unequal and defeat the unchanged-skip */
  var hid = host._zfId || (host._zfId = 'zfh' + ++ZF_SEQ);
  h +=
    '<div class="zfbox"><svg class="zframe" viewBox="0 0 320 180" role="img" aria-label="' +
    esc(panel.title || 'camera zones') +
    '">';
  h +=
    '<defs><pattern id="' +
    hid +
    '" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
    '<line x1="0" y1="0" x2="0" y2="8" stroke="#94A3B8" stroke-width="2" opacity=".5"/></pattern></defs>';
  h +=
    '<rect width="320" height="180" fill="#0A0F14"/><rect y="150" width="320" height="30" fill="#131A21"/>';
  h +=
    '<rect x="118" y="28" width="84" height="124" rx="3" fill="#10161D" stroke="#26313C" stroke-width="2"/>';
  zm.forEach(function (z) {
    var pts = z.points
      .map(function (p) {
        return p[0] + ',' + p[1];
      })
      .join(' ');
    h +=
      '<polygon class="zone ' +
      z.state +
      '" points="' +
      pts +
      '"' +
      (z.state === 'masked' ? ' fill="url(#' + hid + ')"' : '') +
      '/>';
    if (z.points.length)
      h +=
        '<text class="zlbl" x="' +
        (z.points[0][0] + 5) +
        '" y="' +
        (z.points[0][1] + 13) +
        '">' +
        esc(z.label) +
        '</text>';
  });
  if (state.subject && typeof state.subject.x === 'number' && typeof state.subject.y === 'number')
    h +=
      '<circle class="zsubject" cx="' + state.subject.x + '" cy="' + state.subject.y + '" r="6"/>';
  var ZVERDICTS = {
    alert: 'ALERT SENT',
    suppress: 'IGNORED — OUTSIDE ARMED ZONES',
    'never-captured': 'MASKED — PIXELS NEVER CAPTURED',
  };
  if (ZVERDICTS[state.verdict]) {
    h +=
      '<rect class="zverbg ' +
      state.verdict +
      '" x="0" y="0" width="320" height="22"/>' +
      '<text class="zvertext" x="8" y="15">' +
      ZVERDICTS[state.verdict] +
      '</text>';
  }
  h += '</svg></div>';
  return { html: h };
});

PanelRegistry.extend('zoneframe', {
  order: 8,
  label: 'Zone frame',
  since: '0.1.0',
});

PanelRegistry.extend('zoneframe', {
  styles: [
    {
      order: 633,
      css: String.raw`.zfbox{border-radius:8px; overflow:hidden;}
.zframe{display:block; width:100%; height:auto;}
.zone{stroke-width:2;}
.zone.armed{stroke:#4ADE80; fill:rgba(74,222,128,.10);}
.zone.ignored{stroke:#94A3B8; stroke-dasharray:5 5; fill:none; opacity:.7;}
.zone.masked{stroke:#64748B;}
.zlbl{font:600 9px 'IBM Plex Mono',monospace; fill:#7E93B8;}
.zsubject{fill:#FFB454; filter:drop-shadow(0 0 5px rgba(255,180,84,.85));}
.zverbg{opacity:.92;}
.zverbg.alert{fill:#B91C1C;}
.zverbg.suppress{fill:#334155;}
.zverbg.never-captured{fill:#0F172A; stroke:#64748B; stroke-width:1;}
.zvertext{font:700 10px 'IBM Plex Mono',monospace; fill:#F8FAFC; letter-spacing:.06em;}`,
    },
    {
      order: 1374,
      css: String.raw`body.sk-editorial .zframe > rect:nth-of-type(1){fill:#F0E9DD;}
body.sk-editorial .zframe > rect:nth-of-type(2){fill:#E4DACB;}
body.sk-editorial .zframe > rect:nth-of-type(3){fill:#F8F3EA; stroke:#BBAF9E;}
body.sk-editorial .zone.armed{stroke:var(--ed-good); fill:rgba(36,115,78,.11);}
body.sk-editorial .zone.ignored{stroke:#777D78;}
body.sk-editorial .zone.masked{stroke:#696E69;}
body.sk-editorial .zlbl{fill:#414A47;}
body.sk-editorial .zsubject{fill:var(--ed-warn); filter:none;}
body.sk-editorial .zverbg.suppress{fill:#56635F;}
body.sk-editorial .zverbg.never-captured{fill:var(--ed-ink); stroke:#6E7773;}`,
    },
    {
      order: 1598,
      css: String.raw`@media screen {

  body.sk-terminal .zone.armed{stroke:var(--tm-good); fill:rgba(94,235,154,.09);}
}
@media screen {
  body.sk-terminal .zone.ignored,
  body.sk-terminal .zone.masked{stroke:var(--tm-muted);}
}
@media screen {
  body.sk-terminal .zlbl{fill:var(--tm-muted);}
}
@media screen {
  body.sk-terminal .zsubject{fill:var(--tm-alert);}
}
@media screen {
  body.sk-terminal .zverbg.alert{fill:var(--tm-alert);}
}
@media screen {
  body.sk-terminal .zverbg.suppress{fill:var(--tm-line);}
}
@media screen {
  body.sk-terminal .zverbg.never-captured{fill:var(--tm-ground); stroke:var(--tm-muted);}
}
@media screen {
  body.sk-terminal .zvertext{fill:var(--tm-ink);}
}`,
    },
    {
      order: 1808,
      css: String.raw`@media screen {

  body.sk-pastel .zone.armed { stroke:#71BE91; fill:rgba(113,190,145,.14); }
}
@media screen {
  body.sk-pastel .zone.ignored { stroke:#A8B5C7; }
}
@media screen {
  body.sk-pastel .zone.masked { stroke:#8595AA; }
}
@media screen {
  body.sk-pastel .zlbl { fill:#A6B6CA; }
}
@media screen {
  body.sk-pastel .zsubject { fill:#F0BE78; filter:drop-shadow(0 0 4px rgba(240,190,120,.55)); }
}
@media screen {
  body.sk-pastel .zverbg.alert { fill:#C85462; }
}
@media screen {
  body.sk-pastel .zverbg.suppress { fill:#53667E; }
}
@media screen {
  body.sk-pastel .zverbg.never-captured { fill:#1C2A3E; stroke:#71839A; }
}`,
    },
    {
      order: 2047,
      css: String.raw`@media screen {

  body.sk-blueprint .zone.armed{stroke:#47F590;fill:rgba(71,245,144,.12);}
}
@media screen {
  body.sk-blueprint .zone.ignored{stroke:#A6C5D7;}
}
@media screen {
  body.sk-blueprint .zone.masked{stroke:#7898AE;}
}`,
    },
    {
      order: 2051,
      css: String.raw`@media screen {
  body.sk-blueprint .zlbl{fill:#C1DFEC;}
}`,
    },
    {
      order: 2053,
      css: String.raw`@media screen {
  body.sk-blueprint .zverbg.alert{fill:#C52D3A;}
}`,
    },
    {
      order: 2055,
      css: String.raw`@media screen {
  body.sk-blueprint .zverbg.never-captured{fill:#052956;stroke:#86BDD2;}
}`,
    },
  ],
});

/* zoneframe authoring contract; merged into this panel definition by the bundle. */
PanelRegistry.extend('zoneframe', {
  authoring: {
    template: {
      title: 'Zones',
      zones: [
        {
          id: 'porch',
          points: [
            [20, 40],
            [150, 40],
            [150, 160],
            [20, 160],
          ],
        },
      ],
    },
    setupFields: [
      ['zones', 'jsonArr'],
      ['initial', 'json'],
    ],
    patchFields: [
      ['zones', 'jsonArr'],
      ['subject', 'json'],
      ['verdict', 'enum', ['alert', 'suppress', 'never-captured']],
    ],
    picker: {
      order: 16,
      name: 'Detection zones',
      category: 'Places & sensing',
      tagline: 'Where an event counts',
      description: 'Explain armed, ignored, or masked regions inside a camera frame.',
    },
    example: function (sample, context) {
      var panel = sample.panel,
        state = sample.state,
        states = sample.states,
        step = sample.step;
      state = { zones: { porch: 'armed' }, subject: { x: 86, y: 110 }, verdict: 'alert' };
      panel.initial = builderClone(state);

      return { panel: panel, state: state, states: states, step: step };
    },
  },
});
/* ---- src/core/backend.js ---- */
/* Static backend facade. This shares the outer pure core and never initializes
   the DOM renderer; consumers do not need source files at runtime. */
function validateSpec(raw){return validate(normalize(raw));}
var viewerRoutingCache;
function viewerRouting(){
  if(!viewerRoutingCache)viewerRoutingCache=createViewerRouting();
  return viewerRoutingCache;
}
function createViewerRouting(){
  return {normalize, blocksOf, sectionRecords, sectionReferences, parseHash, buildHash,
    diagramPathList, diagramForPath, resolveSourceStep, stepKeys, stepFailures, stepReference,
    diagramLayoutViews, sectionLayoutItems, foldNodeTones, foldPanelStates, layout, lintPage};
}
module.exports = Object.assign(FlowCanon,{"compatibility":FlowviewCompatibility,"validateSpec":validateSpec,"viewerRouting":viewerRouting});
