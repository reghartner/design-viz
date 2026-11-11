/* Pure topology resolution. Callers supply one approved authored snapshot;
   build validation and runtime views derive values in memory, never source files. */
var FlowTopology = (function(){
  'use strict';
  var own=function(o,k){return Object.prototype.hasOwnProperty.call(o,k);};
  function object(v){return !!v && typeof v==='object' && !Array.isArray(v);}
  function clone(v){return JSON.parse(JSON.stringify(v));}
  function token(v){return typeof v==='string' && /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(v);}
  function exportNames(v){return Array.isArray(v)?v:[v];}
  function validExports(v){var names=exportNames(v);return names.length>0 && names.every(token) && new Set(names).size===names.length;}
  // Array imports intentionally include provider connections across the union.
  // Scalar imports retain their exact declared edge boundary.
  function mergeExports(provider,names){
    var selected=new Set(),edges=new Set();
    names.forEach(function(name){var exp=provider.topologyExports[name];exp.nodes.forEach(function(id){selected.add(id);});exp.edges.forEach(function(key){edges.add(key);});});
    (provider.edges || []).forEach(function(e){if(selected.has(e.from) && selected.has(e.to))edges.add(edgeKey(e));});
    return {nodes:Array.from(selected),edges:Array.from(edges)};
  }
  function namespacePath(v){return typeof v==='string' && v.split('::').every(token);}
  function fail(at,message){throw new Error('Topology '+at+': '+message);}
  function shape(value,keys,at){
    if(!object(value) || Object.keys(value).some(function(k){return keys.indexOf(k)<0;}))fail(at,'expected an object with fields '+keys.join(', '));
  }
  function list(value,at){
    if(!Array.isArray(value) || value.some(function(id){return typeof id!=='string' || !id;}) || new Set(value).size!==value.length)fail(at,'expected an array of unique identities');
    return value;
  }
  function sections(spec){
    if(spec && object(spec.nodes) && Array.isArray(spec.rows) && !spec.page && !spec.blocks && !spec.sections)return [{diagram:spec}];
    return FlowCanon.sections(spec);
  }
  function edgeKey(e){return e.from+'->'+e.to;}
  function declarations(spec){return sections(spec).some(function(s){return own(s.diagram,'topologyImports') || own(s.diagram,'topologyExports');});}
  function stable(value){
    if(Array.isArray(value))return '['+value.map(stable).join(',')+']';
    if(object(value))return '{'+Object.keys(value).sort().map(function(key){return JSON.stringify(key)+':'+stable(value[key]);}).join(',')+'}';
    return JSON.stringify(value);
  }
  function sameDefinition(a,b){return stable(a)===stable(b);}
  function importedProtocol(spec,provider,imp,kind,where){
    var supplied=(provider.page && provider.page.protocols) || {};
    if(!own(supplied,kind))return kind;
    var definition=supplied[kind],consumer=spec.page.protocols || {};
    var builtin=typeof BUILTIN_PROTOCOLS!=='undefined' && own(BUILTIN_PROTOCOLS,kind);
    var effective=own(consumer,kind)?consumer[kind]:(builtin?BUILTIN_PROTOCOLS[kind]:undefined);
    if(effective!==undefined && sameDefinition(effective,definition))return kind;
    if(effective===undefined && !builtin){
      if(spec.page.protocols==null)spec.page.protocols={};
      Object.defineProperty(spec.page.protocols,kind,{value:clone(definition),enumerable:true,writable:true,configurable:true});
      return kind;
    }
    // Derived snapshots preserve both meanings. The authored provider and
    // consumer keep their original IDs; only imported edges use this stable
    // import-scoped identity. Built-ins are never overwritten.
    var clean=String(kind).replace(/[^a-zA-Z0-9_.-]/g,'-').replace(/^[^a-zA-Z0-9]+/,'') || 'protocol';
    var base=imp.as+'-'+clean,id=base,n=2;
    if(spec.page.protocols==null)spec.page.protocols={};
    while(own(spec.page.protocols,id) && !sameDefinition(spec.page.protocols[id],definition))id=base+'-'+n++;
    if(!token(id))fail(where,'cannot derive a safe protocol identity for '+kind);
    if(!own(spec.page.protocols,id))Object.defineProperty(spec.page.protocols,id,{value:clone(definition),enumerable:true,writable:true,configurable:true});
    return id;
  }

  var edgeLayoutFields=['label','labelDx','labelDy','fromPort','toPort','curvePoints','curveControls','bend','fromDx','fromDy','toDx','toDy'];
  function validateEdgeOverride(value,at){
    shape(value,edgeLayoutFields,at);
    Object.keys(value).forEach(function(key){
      var v=value[key];if(v===null)return;
      if(key==='label'){if(typeof v!=='string')fail(at,'label must be a string or null');}
      else if(key==='fromPort' || key==='toPort'){
        shape(v,['side','offset'],at+' '+key);if(!validEdgePort(v))fail(at,'invalid '+key);
      }else if(key==='curvePoints' || key==='curveControls'){
        if(!(key==='curvePoints'?validCurvePoints(v):validCurveControls(v)))fail(at,'invalid '+key);
        v.forEach(function(p){shape(p,['t','dx','dy'],at+' '+key);});
      }else if(!Number.isFinite(v) || Math.abs(v)>100000)fail(at,'invalid '+key);
    });
    if(value.curvePoints!=null && value.curveControls!=null)fail(at,'use either curvePoints or curveControls');
  }

  function validateNodeOverride(value,at){
    shape(value,['title','sub','style','tint','hidden','presentation'],at);
    Object.keys(value).forEach(function(key){
      var v=value[key];if(v===null)return;
      if(key==='hidden'){if(typeof v!=='boolean')fail(at,'hidden must be a boolean or null');}
      else if(typeof v!=='string')fail(at,key+' must be a string or null');
      else if(key==='presentation' && v!=='baseline')fail(at,'presentation must be baseline or null');
      else if(key==='style' && NODE_STYLE_SET.indexOf(v)<0)fail(at,'unknown node style '+v);
      else if(key==='tint' && TINT_SET.indexOf(v)<0)fail(at,'unknown node tint '+v);
    });
  }

  function validateTracking(value,at){
    // telemetry content is warning-only (validator); the resolver only carries it.
    shape(value,['tickets','prs','existsWhen','missingWork','telemetry','trace'],at);
    if(own(value,'trace'))validateTraceOverlay(value.trace,at+' trace');
    if(Object.prototype.hasOwnProperty.call(value,'missingWork') && typeof value.missingWork!=='boolean')fail(at,'missingWork must be true or false');
    if(Object.prototype.hasOwnProperty.call(value,'existsWhen') && value.existsWhen!=='tickets-done')fail(at,'existsWhen must be tickets-done');
    trackingRefs(value,function(field,index){fail(at,'invalid '+field+(index===null?' array':' entry '+index));});
  }
  /* #1290: a consumer trace overlay patches the inherited trace.spans: an entry is a field
     patch (null deletes a field), a null entry or a name in `hide` hides that span. The shape
     is checked here; the merged declaration is validated on the resolved carrier. */
  var TRACE_SPAN_PATCH_FIELDS=['serviceName','operation','operationPrefix','namespace','attributes','role'];
  function validateTraceOverlay(value,at){
    shape(value,['spans','hide'],at);
    if(own(value,'hide') && (!Array.isArray(value.hide) || value.hide.some(function(key){return typeof key!=='string' || !key;})))fail(at,'hide must be an array of span names');
    if(!own(value,'spans'))return;
    if(!object(value.spans))fail(at,'spans must be an object keyed by span name');
    Object.keys(value.spans).forEach(function(key){
      var entry=value.spans[key],where=at+' span '+key;
      if(entry===null)return;
      if(!object(entry))fail(where,'must be a field patch object or null');
      shape(entry,TRACE_SPAN_PATCH_FIELDS,where);
      Object.keys(entry).forEach(function(field){
        var v=entry[field];if(v===null)return;
        if(field==='attributes'?!object(v):typeof v!=='string')fail(where,field+(field==='attributes'?' must be an object or null':' must be a string or null'));
      });
    });
  }
  /* #1266: a consumer overlay on an imported value: the import carries the provider's value,
     and an importer may add, change or hide parts of it. Reusable for other imported kinds:
     rules.fields maps each overlay field to 'replace' (the overlay value replaces), 'fields'
     (a field patch; null deletes a field) or 'entries' (keyed entries, each a field patch;
     a null entry is dropped through rules.drop, as is each name in the overlay's `hide`;
     rules.entry(field, current, patch) may adjust an inherited entry before its patch).
     Objects left empty are removed. */
  function patchFields(target,patch){
    Object.keys(patch).forEach(function(key){if(patch[key]===null)delete target[key];else target[key]=clone(patch[key]);});
    return target;
  }
  function mergeOverlay(base,overlay,rules){
    var out=object(base)?clone(base):{};
    function drop(field,key){if(rules.drop)rules.drop(out,field,key);else if(object(out[field]))delete out[field][key];}
    if(rules.hide && Array.isArray(overlay.hide))overlay.hide.forEach(function(key){if(typeof key==='string')drop(rules.hide,key);});
    Object.keys(rules.fields).forEach(function(field){
      if(!own(overlay,field))return;
      var rule=rules.fields[field],patch=overlay[field];
      if(rule==='replace'){out[field]=clone(patch);return;}
      if(!object(patch))return;
      var target=object(out[field])?out[field]:{};out[field]=target;
      if(rule==='fields')patchFields(target,patch);
      else Object.keys(patch).forEach(function(key){
        var entry=patch[key];
        if(entry===null){drop(field,key);return;}
        if(!object(entry))return;
        var current=object(target[key])?target[key]:{};
        if(rules.entry)rules.entry(field,current,entry);
        var merged=patchFields(current,entry);
        if(Object.keys(merged).length)target[key]=merged;else delete target[key];
      });
      if(object(out[field]) && !Object.keys(out[field]).length)delete out[field];
    });
    return out;
  }
  // Metrics on top of the generic merge: a hidden or removed signal takes its limit and any
  // ratio limit based on it (telemetryDropSignal); kind replaces; the rest patch per field.
  var TELEMETRY_OVERLAY_RULES={hide:'signals',fields:{kind:'replace',signals:'entries',proof:'entries',links:'fields',card:'fields'},
    drop:function(out,field,key){if(field==='signals')telemetryDropSignal(out,key);else if(object(out[field]))delete out[field][key];},
    // A signal has exactly one source: a patch that names a source replaces the inherited one,
    // so a later provider source switch, or a provider signal of the same name, cannot add a second.
    entry:function(field,current,patch){
      if(field!=='signals' || !TELEMETRY_SOURCES.some(function(source){return patch[source]!=null;}))return;
      TELEMETRY_SOURCES.forEach(function(source){if(!own(patch,source))delete current[source];});
    }};
  function mergeTelemetry(inherited,overlay){return mergeOverlay(inherited,overlay,TELEMETRY_OVERLAY_RULES);}
  // #1290: trace spans always merge. A span names spans one way, so a patch that sets
  // operation removes an inherited operationPrefix and the reverse.
  var TRACE_OVERLAY_RULES={hide:'spans',fields:{spans:'entries'},
    entry:function(field,current,patch){
      if(patch.operation!=null)delete current.operationPrefix;
      if(patch.operationPrefix!=null)delete current.operation;
    }};
  function mergeTrace(inherited,overlay){return mergeOverlay(inherited,overlay,TRACE_OVERLAY_RULES);}
  /* #1345: a consumer signal patch that names a source replaces the inherited source whole.
     Same source, an object query: anything of the provider's query the patch leaves out is a
     warning (keys, list items such as Honeycomb filters, CloudWatch dimensions); a patch that
     keeps all of it, a string query, or a source switch is a note, since later provider changes
     to that query no longer reach this board. note(type, at, message), at relative to the
     overlay's telemetry. */
  var TELEMETRY_SOURCE_NAMES={grafana:'Grafana',loki:'Loki',tempo:'Tempo',sql:'SQL',honeycomb:'Honeycomb',cloudwatch:'CloudWatch',cloudwatchLogs:'CloudWatch Logs'};
  function telemetryCanonical(v){
    if(Array.isArray(v))return '['+v.map(telemetryCanonical).join(',')+']';
    if(object(v))return '{'+Object.keys(v).sort().map(function(k){return JSON.stringify(k)+':'+telemetryCanonical(v[k]);}).join(',')+'}';
    return JSON.stringify(v===undefined?null:v);
  }
  // What the provider's query held that the patch does not: whole keys (absent), and list items or
  // dimensions the patch does not keep as they were (missing, or kept with another value).
  var TELEMETRY_ITEM_NAMES={filters:['filter','filters'],calculations:['calculation','calculations'],breakdowns:['breakdown','breakdowns'],logGroups:['log group','log groups'],orders:['order','orders'],havings:['having','havings']};
  function telemetryItem(key,x){
    if(typeof x==='string' || typeof x==='number')return String(x);
    if(!object(x))return telemetryCanonical(x);
    function shown(v){return Array.isArray(v)?'['+v.join(', ')+']':String(v);}
    function calc(op,column){return op+(typeof column==='string'?'('+column+')':'');}
    if(key==='filters' && typeof x.column==='string')return x.column+(x.op!=null?' '+x.op:'')+(x.value!==undefined?' '+shown(x.value):'');
    if(key==='havings' && typeof x.calculate_op==='string')return calc(x.calculate_op,x.column)+(x.op!=null?' '+x.op:'')+(x.value!==undefined?' '+shown(x.value):'');
    if(key==='orders' && (typeof x.op==='string' || typeof x.column==='string'))return (typeof x.op==='string'?calc(x.op,x.column):x.column)+(typeof x.order==='string'?' '+x.order:'');
    if(typeof x.op==='string')return calc(x.op,x.column);
    return telemetryCanonical(x);
  }
  // More than three names read "a, b, c and N more".
  function telemetryList(items){
    if(items.length>3)return items.slice(0,3).join(', ')+' and '+(items.length-3)+' more';
    return items.length>1?items.slice(0,-1).join(', ')+' and '+items[items.length-1]:items[0];
  }
  function telemetryLeftOut(inherited,patch){
    var out={absent:[],changed:[]};
    Object.keys(inherited).forEach(function(key){
      var was=inherited[key];
      if(was==null)return;
      if(!own(patch,key) || patch[key]==null){out.absent.push(key);return;}
      var is=patch[key];
      if(Array.isArray(was) && Array.isArray(is)){
        var missing=was.filter(function(x){return !is.some(function(y){return telemetryCanonical(y)===telemetryCanonical(x);});});
        if(missing.length){var names=TELEMETRY_ITEM_NAMES[key] || [key,key];out.changed.push('the inherited '+names[missing.length>1?1:0]+' '+telemetryList(missing.map(function(x){return telemetryItem(key,x);})));}
      }else if(key==='dimensions' && object(was) && object(is)){
        var gone=Object.keys(was).filter(function(k){return !own(is,k);});
        if(gone.length)out.absent.push((gone.length>1?'dimensions ':'dimension ')+telemetryList(gone));
      }
    });
    return out;
  }
  function telemetryPatchFindings(inherited,overlay,carrier,note){
    var have=object(inherited) && object(inherited.signals)?inherited.signals:{},patches=object(overlay) && object(overlay.signals)?overlay.signals:{};
    Object.keys(patches).forEach(function(name){
      var patch=patches[name],was=have[name];
      if(!object(patch) || !object(was))return;
      var to=TELEMETRY_SOURCES.filter(function(s){return patch[s]!=null;})[0],from=TELEMETRY_SOURCES.filter(function(s){return was[s]!=null;})[0];
      if(!to || !from)return;
      var at='.signals.'+name+'.'+to,who='signal '+name+' on '+carrier+': ',label=TELEMETRY_SOURCE_NAMES[to];
      if(to!==from){note('note',at,who+'this switches its source from '+TELEMETRY_SOURCE_NAMES[from]+' to '+label+'; later provider changes to its query no longer reach this board');return;}
      var left=object(was[from]) && object(patch[to])?telemetryLeftOut(was[from],patch[to]):{absent:[],changed:[]};
      var parts=(left.absent.length?['leaves out '+telemetryList(left.absent)]:[]).concat(left.changed.length?['leaves out or changes '+telemetryList(left.changed)]:[]);
      if(parts.length)note('warning',at,who+'this '+label+' patch replaces the provider\'s whole query and '+parts.join(', and ')+', so the signal no longer reads what the provider defined; '+(left.absent.length?'to replace the query, write all of it':'check that this is meant'));
      else note('note',at,who+'this '+label+' patch replaces the provider\'s whole query; later provider changes to it no longer reach this board');
    });
  }
  function applyTracking(value,addition,note,carrier){
    if(!addition)return;
    if(addition.missingWork===true)value.missingWork=true;
    if(addition.existsWhen==='tickets-done')value.existsWhen=addition.existsWhen;
    var inherited=trackingStoredRefs(value),local=trackingStoredRefs(addition);
    var merged=trackingStoredRefs({tickets:inherited.tickets.concat(local.tickets),prs:inherited.prs.concat(local.prs)});
    ['tickets','prs'].forEach(function(field){if(merged[field].length)value[field]=merged[field];});
    // #1266: an `extends` overlay merges with the inherited binding; any other consumer binding
    // replaces it (the original rule, so existing documents keep their meaning).
    if(own(addition,'telemetry')){
      if(!telemetryMergeOverlay(addition.telemetry))value.telemetry=clone(addition.telemetry);
      else{
        if(note)telemetryPatchFindings(value.telemetry,addition.telemetry,carrier,note);
        // Hiding every signal leaves no binding for this consumer: the carrier is quietly unbound.
        var merged=mergeTelemetry(value.telemetry,addition.telemetry);
        if(object(merged.signals) && Object.keys(merged.signals).length)value.telemetry=merged;else delete value.telemetry;
      }
    }
  }
  /* #1290: an imported carrier's trace spans are the provider's declarations plus the
     consumer overlay. A provider span this board's validation rejects, and the overlay does
     not fix, is not used here: `drop(key, message)` records it with its provider path (the
     provider's own build reports it). A span the overlay breaks or adds incomplete is left
     out too and recorded as the overlay's error; a hide or a null entry for a span the
     provider lacks, and a span both hidden and patched (the hide wins), are overlay
     warnings: `note(type, at, message)`, at relative to the overlay's trace. */
  var traceDrops=new WeakMap();
  function inheritTrace(value,overlay,kind,page,providerPage,drop,note,reference){
    var addition=object(overlay) && own(overlay,'trace')?clone(overlay.trace):null;
    if(!own(value,'trace') && !addition)return;
    var errors=own(value,'trace')?FlowCanon.traceDeclarationErrors(value.trace,kind,page):[];
    var malformed=errors.some(function(x){return x.key==null;});
    if(malformed){drop(null,errors[0].message);delete value.trace;errors=[];}
    var provided=object(value.trace)?clone(value.trace.spans):{};
    if(addition){
      var spans=object(addition.spans)?addition.spans:{},hidden=(Array.isArray(addition.hide)?addition.hide:[]).slice();
      Object.keys(spans).forEach(function(key){if(spans[key]===null && hidden.indexOf(key)<0)hidden.push(key);});
      hidden.forEach(function(key){
        // A malformed provider trace already warns; its span names are unknown, not missing.
        if(!own(provided,key) && !malformed)note('warning',own(spans,key) && spans[key]===null?'.spans.'+key:'.hide','the provider declares no span '+key+' on this carrier; the hide is kept in case it returns');
        if(object(spans[key])){note('warning','.spans.'+key,'span '+key+' is both hidden and patched; the hide wins');delete spans[key];}
      });
      var merged=mergeTrace(value.trace,addition);
      if(object(merged.spans))value.trace=merged;else delete value.trace;
    }
    if(!object(value.trace))return;
    var after=FlowCanon.traceDeclarationErrors(value.trace,kind,page);
    Object.keys(value.trace.spans).forEach(function(key){
      var still=after.filter(function(x){return x.key===key;}).map(function(x){return x.message;});
      if(!still.length)return;
      var entry=value.trace.spans[key];delete value.trace.spans[key];
      if(own(provided,key) && errors.some(function(x){return x.key===key;})){
        // Valid in the provider's own build: this board's attribute allowlist is the reason.
        var own_=FlowCanon.traceDeclarationErrors({spans:{x:provided[key]}},kind,providerPage),allowed=FlowCanon.traceAttributeNames(page);
        var missing=Object.keys(object(provided[key].attributes)?provided[key].attributes:{}).filter(function(k){return allowed.indexOf(k)<0;});
        drop(key,!own_.length && missing.length?'attribute '+missing.join(', ')+' is not allowed on this board; list it in this board\'s trace connection allowedAttributes':still.join('; '));
      }
      else{
        // Name the new-span rule only when that is what is missing.
        var incomplete=!object(entry) || typeof entry.serviceName!=='string' || !entry.serviceName.trim() || entry.role==null ||
          !own(entry,'operation') && !own(entry,'operationPrefix') && !(object(entry.attributes) && Object.keys(entry.attributes).length);
        note('error','.spans.'+key,(own(provided,key) || !incomplete?'':'the provider declares no span '+key+' on this carrier, so this entry is a new span and needs a full declaration: ')+still.join('; '));
      }
    });
    // #1290 (D19): the spans this board's overlay adds or overrides are its own declarations; on a
    // carrier its reference flow lights they are checked against its approved reference trace.
    // A patch that only narrows (namespace, attributes) or relabels an inherited span leaves the
    // provider's strings, which are the provider's to check.
    if(reference && addition && object(addition.spans))Object.keys(addition.spans).forEach(function(key){
      var patch=addition.spans[key],owns=object(patch) && (!own(provided,key) || ['serviceName','operation','operationPrefix'].some(function(f){return own(patch,f);}));
      var miss=owns && object(value.trace.spans[key])?FlowCanon.traceReferenceMiss(value.trace.spans[key],reference):null;
      if(miss)note('warning','.spans.'+key,miss);
    });
    if(!Object.keys(value.trace.spans).length)delete value.trace;
  }
  /* Validator text for one resolved diagram's span findings: dropped provider spans warn at
     the carrier; overlay findings are errors or warnings at the overlay. DP is the diagram path. */
  function traceFindings(d,DP){
    var out={errors:[],warnings:[]};
    (traceDrops.get(d) || []).forEach(function(f){
      if(f.type!=='drop'){out[f.type==='error'?'errors':'warnings'].push(DP+'.'+f.at+': '+f.message);return;}
      var at=DP+'.nodes.'+f.id;
      if(f.kind==='edges')(Array.isArray(d.edges)?d.edges:[]).some(function(e,i){if(e && edgeKey(e)===f.id){at=DP+'.edges['+i+']';return true;}return false;});
      out.warnings.push(at+'.trace'+(f.key==null?'':'.spans.'+f.key)+': provider "'+f.spec+'" '+f.path+': '+f.message+'; not used on this board');
    });
    return out;
  }
  // Provider `use` bindings name the provider page's templates and expand only
  // with them, while that page is known. A binding the provider cannot expand
  // (unknown template, missing parameter) is dropped, so a consumer template of
  // the same name can never reinterpret it; the carrier stays unbound. Why it
  // was dropped is kept per resolved diagram for the validator, never serialized.
  var telemetryDrops=new WeakMap();
  // #1345: a consumer signal patch's findings, per resolved diagram (warnings and notes at the overlay).
  var telemetryNotes=new WeakMap();
  function telemetryFindings(d,DP){
    var out={warnings:[],notes:[]};
    (telemetryNotes.get(d) || []).forEach(function(f){out[f.type==='warning'?'warnings':'notes'].push(DP+'.'+f.at+': '+f.message);});
    return out;
  }
  function inheritTelemetry(value,templates,overlay,record){
    if(!object(value) || !object(value.telemetry) || !own(value.telemetry,'use'))return;
    var problems=[],expanded=telemetryExpand(value.telemetry,templates,function(path,message){problems.push({path:path,message:message});});
    if(expanded){value.telemetry=expanded;return;}
    delete value.telemetry;
    // A replacing consumer binding makes this problem moot; a merge overlay still builds on it.
    if(!(object(overlay) && own(overlay,'telemetry') && !telemetryMergeOverlay(overlay.telemetry)))problems.forEach(record);
  }

  function validateOverlaySelection(imp,nodes,edges,where){
    var selectedNodes=nodes && new Set(nodes),selectedEdges=edges && new Set(edges);
    ['nodePositions','nodeOverrides','nodeCodeRefs','nodeDetails','edgeOverrides','nodeTracking','edgeTracking'].forEach(function(field){
      var selected=field.startsWith('node')?selectedNodes:selectedEdges;
      if(selected)Object.keys(imp[field] || {}).forEach(function(key){if(!selected.has(key))fail(where,field+' identity is not selected/exported: '+key);});
    });
  }

  function materialize(specs){return materializeSources(specs,false);}
  function materializeSources(specs,declarationsOnly){
    if(!Array.isArray(specs))fail('snapshot','expected an array of specs');
    var copies=specs.map(clone),byId=new Map(),states=new Map(),exportsById=new Map();
    copies.forEach(function(spec){
      var id=spec && spec.page && spec.page.canon && spec.page.canon.id;
      if(typeof id!=='string' || !id || byId.has(id))fail('snapshot','specs require unique page.canon.id identities: '+id);
      byId.set(id,spec);
      var exports=new Map();exportsById.set(id,exports);
      sections(spec).forEach(function(sec,si){
        var d=sec.diagram,at=id+' section '+(sec.id || si);
        if(own(d,'topologyImports') || own(d,'topologyExports') || d.topologyProvenance){
          ['nodes','groups'].forEach(function(key){if(d[key]!=null && !object(d[key]))fail(at,key+' must be an object');});
          ['rows','floats','edges','steps'].forEach(function(key){if(d[key]!=null && !Array.isArray(d[key]))fail(at,key+' must be an array');});
          (d.edges || []).forEach(function(e){if(!object(e) || typeof e.from!=='string' || typeof e.to!=='string')fail(at,'edges require from/to node identities');});
          (d.steps || []).forEach(function(s){if(!object(s))fail(at,'steps require objects');});
          if(d.topologyProvenance){
            if(!object(d.topologyProvenance) || d.topologyProvenance.version!==1 || !Array.isArray(d.topologyProvenance.imports))fail(at,'invalid generated topologyProvenance');
            d.topologyProvenance.imports.forEach(function(imp){
              shape(imp,['spec','export','as','nodes','edges','groups','position','destination'],at+' provenance');
              if(typeof imp.spec!=='string' || !validExports(imp.export) || !namespacePath(imp.as))fail(at,'invalid generated import provenance');
              ['nodes','edges','groups'].forEach(function(key){list(imp[key],at+' provenance '+key);});
            });
          }
        }
        if(d.topologyProvenance!=null && declarations(spec))fail(at,'materialized provenance cannot be mixed with source imports/exports');
        if(own(d,'topologyExports')){
          if(!object(d.topologyExports))fail(at,'topologyExports must be a named object');
          Object.keys(d.topologyExports).forEach(function(name){
            if(!token(name) || exports.has(name))fail(at,'invalid or duplicate export '+name);
            var exp=d.topologyExports[name],where=at+' export '+name;
            shape(exp,['nodes','edges'],where);list(exp.nodes,where+' nodes');list(exp.edges,where+' edges');
            if(!exp.nodes.length)fail(where,'export at least one node');
            exports.set(name,{d:d,exp:exp,at:where});
          });
        }
        if(own(d,'topologyImports') && !Array.isArray(d.topologyImports))fail(at,'topologyImports must be an array');
        var namespaces=new Set();
        (d.topologyImports || []).forEach(function(imp,i){
          var where=at+' import '+i;shape(imp,['spec','export','as','position','nodes','edges','nodePositions','nodeCodeRefs','nodeOverrides','nodeDetails','edgeOverrides','nodeTracking','edgeTracking','presentation'],where);
          if(!validExports(imp.export))fail(where,'export must be a name or a nonempty array of unique export names');
          if(typeof imp.spec!=='string' || !imp.spec || !token(imp.as))fail(where,'requires spec, export, and a namespace as (letters, digits, dot, dash, underscore)');
          var reference=at+' import '+imp.as+' ('+imp.spec+' export '+imp.export+')';
          if(namespaces.has(imp.as))fail(reference,'duplicate namespace '+imp.as);namespaces.add(imp.as);
          if(own(imp,'presentation') && imp.presentation!=='baseline')fail(where,'presentation must be baseline');
          ['nodes','edges'].forEach(function(key){if(own(imp,key))list(imp[key],where+' '+key);});
          if(own(imp,'nodes') && !imp.nodes.length)fail(reference,'select at least one exported node');
          ['nodeTracking','edgeTracking'].forEach(function(field){
            if(!own(imp,field))return;
            if(!object(imp[field]))fail(where,field+' must be an object keyed by exported identity');
            Object.keys(imp[field]).forEach(function(key){validateTracking(imp[field][key],where+' '+field+' '+key);});
          });
          if(own(imp,'nodeDetails')){
            if(!object(imp.nodeDetails))fail(where,'nodeDetails must be an object keyed by exported node identity');
            Object.keys(imp.nodeDetails).forEach(function(key){if(imp.nodeDetails[key]!==null && !object(imp.nodeDetails[key]))fail(where,'nodeDetails '+key+' must be a detail object or null');});
          }
          if(own(imp,'nodeOverrides')){
            if(!object(imp.nodeOverrides))fail(where,'nodeOverrides must be an object keyed by exported node identity');
            Object.keys(imp.nodeOverrides).forEach(function(key){validateNodeOverride(imp.nodeOverrides[key],where+' nodeOverrides '+key);});
          }
          if(own(imp,'nodePositions')){
            if(!object(imp.nodePositions))fail(where,'nodePositions must be an object keyed by exported node identity');
            Object.keys(imp.nodePositions).forEach(function(key){
              shape(imp.nodePositions[key],['x','y'],where+' nodePositions '+key);
              if(!positionedFloat(imp.nodePositions[key]))fail(where,'nodePositions '+key+' requires finite x/y coordinates between -100000 and 100000');
            });
          }
          if(own(imp,'nodeCodeRefs')){
            if(!object(imp.nodeCodeRefs))fail(where,'nodeCodeRefs must be an object keyed by exported node identity');
            Object.keys(imp.nodeCodeRefs).forEach(function(key){
              if(!Array.isArray(imp.nodeCodeRefs[key]))fail(where,'nodeCodeRefs '+key+' must be an array');
              imp.nodeCodeRefs[key].forEach(function(ref){var errors=FlowCanon.referenceErrors(ref);if(errors.length)fail(where,'nodeCodeRefs '+key+': '+errors.join('; '));});
            });
          }
          if(own(imp,'edgeOverrides')){
            if(!object(imp.edgeOverrides))fail(where,'edgeOverrides must be an object keyed by exported edge identity');
            Object.keys(imp.edgeOverrides).forEach(function(key){validateEdgeOverride(imp.edgeOverrides[key],where+' edgeOverrides '+key);});
          }
          validateOverlaySelection(imp,imp.nodes,imp.edges,reference);
          if(d.rows!=null && d.rows.some(function(row){return !Array.isArray(row) || row.some(function(slot){return typeof slot!=='string' && (!Array.isArray(slot) || slot.some(function(key){return typeof key!=='string';}));});}))fail(reference,'broken consumer row placement');
          if(Object.keys(d.nodes || {}).some(function(key){return key.startsWith(imp.as+'::');}))fail(reference,'namespace collision with existing node '+imp.as+'::');
          if(own(imp,'position')){
            shape(imp.position,['x','y'],where+' position');
            if(!positionedFloat(imp.position))fail(where,'position requires finite x/y coordinates between -100000 and 100000');
          }
        });
      });
    });
    if(declarationsOnly)return;
    function visit(id,chain){
      if(states.get(id)==='done')return;
      if(states.get(id)==='visiting')fail(chain.join(' → '),'import cycle reaches '+id);
      states.set(id,'visiting');
      var spec=byId.get(id);
      sections(spec).forEach(function(sec,si){
        var d=sec.diagram,at=id+' section '+(sec.id || si),imports=d.topologyImports || [],provenance=[],defaultPlacements=Object.create(null),drops=[],spanDrops=[],metricNotes=[];
        var referenceSpans=FlowCanon.referenceSpans(d),referenceLit=referenceSpans?FlowCanon.referenceLit(d):{nodes:[],edges:[]};
        imports.forEach(function(imp,importIndex){
          var where=at+' import '+imp.as+' ('+imp.spec+' export '+imp.export+')',prefix=imp.as+'::';
          if(!byId.has(imp.spec))fail(where,'missing spec '+imp.spec);
          visit(imp.spec,chain.concat(where));
          var names=exportNames(imp.export),sources=names.map(function(name){
            var source=exportsById.get(imp.spec).get(name);
            if(!source){
              var error=new Error('Topology '+where+': missing export '+name);
              error.topologyMissingExport={consumer:id,provider:imp.spec,name:name};throw error;
            }
            return source;
          });
          var source=sources[0],provider=source.d;
          if(sources.some(function(other){return other.d!==provider;}))fail(where,'cannot merge exports from different provider sections; use separate imports and namespaces');
          var exp=Array.isArray(imp.export)?mergeExports(provider,names):clone(source.exp),nodes=provider.nodes || {};
          var providerTemplates=trackingTelemetry(byId.get(imp.spec).page).templates;
          var providerRecord=typeof sectionRecords==='function'?sectionRecords(byId.get(imp.spec).page).find(function(record){return record.section.diagram===provider;}):null;
          var providerAt=(providerRecord?providerRecord.path:'section')+'.diagram';
          function dropped(kind,id,path){return function(problem){drops.push({kind:kind,id:id,spec:imp.spec,path:path+'.telemetry'+problem.path,message:problem.message});};}
          function traceDropped(kind,id,path){return function(key,message){spanDrops.push({type:'drop',kind:kind,id:id,key:key,spec:imp.spec,path:path+'.trace'+(key==null?'':'.spans.'+key),message:message});};}
          function telemetryNoted(field,key){return function(type,sub,message){metricNotes.push({type:type,at:'topologyImports['+importIndex+'].'+field+'.'+key+'.telemetry'+sub,message:message});};}
          function traceNoted(field,key){return function(type,sub,message){spanDrops.push({type:type,at:'topologyImports['+importIndex+'].'+field+'.'+key+'.trace'+sub,message:message});};}
          function importedEdge(key){var parts=key.split('->');return prefix+parts[0]+'->'+prefix+parts[1];}
          ['nodes','edges'].forEach(function(key){
            if(!own(imp,key))return;
            imp[key].forEach(function(identity){if(!exp[key].includes(identity))fail(where,'selected '+key+' identity is not exported: '+identity);});
            // Provider order, not checkbox order, defines deterministic geometry.
            exp[key]=exp[key].filter(function(identity){return imp[key].includes(identity);});
          });
          var selected=new Set(exp.nodes);
          validateOverlaySelection(imp,exp.nodes,exp.edges,where);
          if(d.nodes==null)d.nodes={};if(!object(d.nodes))fail(where,'consumer nodes must be an object');
          if(d.edges==null)d.edges=[];if(!Array.isArray(d.edges))fail(where,'consumer edges must be an array');
          if(d.rows==null || Array.isArray(d.rows) && !d.rows.length)d.rows=[[]];
          // Default each block below existing content. Explicit positions are
          // absolute origins, so provider size changes never reset a saved drag.
          // Custom centers must not push subsequent automatically placed imports.
          // Use provider-derived centers only to choose their default origins.
          var placementDiagram=Object.assign({},d,{floats:(d.floats || []).map(function(f){return defaultPlacements[f.id] || f;})});
          var parentLayout=layout(placementDiagram),bottom=0;
          Object.keys(parentLayout.pos).forEach(function(key){var p=parentLayout.pos[key];bottom=Math.max(bottom,p.cy+p.h/2);});
          var position=imp.position?clone(imp.position):{x:LEFT_X,y:bottom+80};
          var groups=Object.create(null),nodeIds=[],edgeIds=[];
          function group(key,seen){
            if(own(groups,key))return;
            if(seen.has(key) || !object((provider.groups || {})[key]))fail(where,'missing or cyclic group '+key);
            seen.add(key);var value=clone(provider.groups[key]);
            if(value.parent){group(value.parent,seen);value.parent=prefix+value.parent;}
            groups[key]=value;
          }
          exp.nodes.forEach(function(key){
            if(!own(nodes,key) || !object(nodes[key]))fail(where,'missing exported node '+key);
            var value=clone(nodes[key]);if(value.group){group(value.group,new Set());value.group=prefix+value.group;}
            if(own(imp.nodeDetails || {},key)){
              if(imp.nodeDetails[key]===null)delete value.detail;
              else {if(value.handoff!=null)fail(where,'nodeDetails '+key+' conflicts with its inherited handoff');value.detail=clone(imp.nodeDetails[key]);}
            }
            if(own(imp.nodeCodeRefs || {},key))value.codeRefs=(value.codeRefs || []).concat(clone(imp.nodeCodeRefs[key]));
            inheritTelemetry(value,providerTemplates,(imp.nodeTracking || {})[key],dropped('nodes',prefix+key,providerAt+'.nodes.'+key));applyTracking(value,(imp.nodeTracking || {})[key],telemetryNoted('nodeTracking',key),'node '+key);
            inheritTrace(value,(imp.nodeTracking || {})[key],'node',spec,byId.get(imp.spec),traceDropped('nodes',prefix+key,providerAt+'.nodes.'+key),traceNoted('nodeTracking',key),referenceLit.nodes.indexOf(prefix+key)>=0?referenceSpans:null);
            if(imp.presentation)value.presentation=imp.presentation;
            Object.keys((imp.nodeOverrides || {})[key] || {}).forEach(function(field){var override=imp.nodeOverrides[key][field];if(override===null)delete value[field];else value[field]=clone(override);});
            // Reveal indices belong to the provider's story, not the consumer.
            delete value.revealAt;delete value.hideAt;
            Object.defineProperty(d.nodes,prefix+key,{value:value,enumerable:true,writable:true,configurable:true});nodeIds.push(prefix+key);
          });
          var placements=new Map(exp.nodes.map(function(key){return [key,0];}));
          var rows=(provider.rows || []).map(function(row){
            if(!Array.isArray(row))fail(where,'broken provider row placement');
            return row.map(function(slot){
              var stack=Array.isArray(slot),ids=(stack?slot:[slot]).filter(function(key){return selected.has(key);});
              ids.forEach(function(key){placements.set(key,placements.get(key)+1);});
              return stack?ids.map(function(key){return prefix+key;}):(ids.length?prefix+ids[0]:null);
            }).filter(function(slot){return slot!==null && (!Array.isArray(slot) || slot.length);});
          }).filter(function(row){return row.length;});
          var floats=(provider.floats || []).filter(function(f){return f && selected.has(f.id);}).map(function(f){
            if((own(f,'x') || own(f,'y')) && !positionedFloat(f))fail(where,'broken float coordinates for '+f.id);
            placements.set(f.id,placements.get(f.id)+1);var copy=clone(f);copy.id=prefix+copy.id;return copy;
          });
          placements.forEach(function(count,key){if(count!==1)fail(where,'exported node '+key+' needs exactly one row/float placement (found '+count+')');});
          Object.keys(groups).forEach(function(key){
            if(d.groups==null)d.groups={};if(!object(d.groups) || own(d.groups,prefix+key))fail(where,'group namespace collision '+prefix+key);
            d.groups[prefix+key]=groups[key];
          });
          exp.edges.forEach(function(key){
            var matches=(provider.edges || []).filter(function(e){return e && edgeKey(e)===key;});
            if(matches.length!==1)fail(where,'missing or ambiguous exported edge '+key);
            var edge=clone(matches[0]);inheritTelemetry(edge,providerTemplates,(imp.edgeTracking || {})[key],dropped('edges',importedEdge(key),providerAt+'.edges['+provider.edges.indexOf(matches[0])+']'));applyTracking(edge,(imp.edgeTracking || {})[key],telemetryNoted('edgeTracking',key),'connection '+key);
            inheritTrace(edge,(imp.edgeTracking || {})[key],'edge',spec,byId.get(imp.spec),traceDropped('edges',importedEdge(key),providerAt+'.edges['+provider.edges.indexOf(matches[0])+']'),traceNoted('edgeTracking',key),referenceLit.edges.indexOf(importedEdge(key))>=0?referenceSpans:null);
            if(imp.presentation)edge.presentation=imp.presentation;
            if(!selected.has(edge.from) || !selected.has(edge.to))fail(where,'exported edge '+key+' must include both endpoints in exported nodes');
            Object.keys((imp.edgeOverrides || {})[key] || {}).forEach(function(field){var value=imp.edgeOverrides[key][field];if(value===null)delete edge[field];else edge[field]=clone(value);});
            edge.from=prefix+edge.from;edge.to=prefix+edge.to;delete edge.revealAt;delete edge.hideAt;
            if(d.edges.some(function(e){return e && edgeKey(e)===edgeKey(edge);}))fail(where,'edge collision '+edgeKey(edge));
            d.edges.push(edge);edgeIds.push(edgeKey(edge));
            if(edge.kind)edge.kind=importedProtocol(spec,byId.get(imp.spec),imp,edge.kind,where);
          });
          // Resolve row/stack and automatic-float geometry within this export,
          // then translate every center together into consumer-owned free space.
          var fragment={nodes:{},groups:{},rows:rows.length?rows:[[]],floats:floats,edges:d.edges.filter(function(e){return edgeIds.includes(edgeKey(e));})};
          nodeIds.forEach(function(key){fragment.nodes[key]=d.nodes[key];});
          Object.keys(groups).forEach(function(key){fragment.groups[prefix+key]=d.groups[prefix+key];});
          var fragmentLayout=layout(fragment),minX=Infinity,minY=Infinity;
          nodeIds.forEach(function(key){var p=fragmentLayout.pos[key];minX=Math.min(minX,p.cx);minY=Math.min(minY,p.cy);});
          if(d.floats==null)d.floats=[];
          if(!Array.isArray(d.floats))fail(where,'consumer floats must be an array');
          nodeIds.forEach(function(key){
            var p=fragmentLayout.pos[key],relative=key.slice(prefix.length);
            var custom=own(imp.nodePositions || {},relative)?imp.nodePositions[relative]:null;
            var f={id:key,side:'below',x:position.x+(custom?custom.x:p.cx-minX),y:position.y+(custom?custom.y:p.cy-minY)};
            if(!positionedFloat(f))fail(where,'block placement exceeds supported coordinate range for '+key);
            if(custom)defaultPlacements[key]={id:key,side:'below',x:position.x+p.cx-minX,y:position.y+p.cy-minY};
            d.floats.push(f);
          });
          var providerPage=byId.get(imp.spec).page,sourceSection=typeof sectionRecords==='function'?sectionRecords(providerPage).find(function(record){return record.section.diagram===provider;}):null;
          var destination=typeof documentReference==='function'?documentReference(providerPage):{spec:imp.spec};if(sourceSection)destination.section=sourceSection.reference;
          provenance.push({destination:destination,spec:imp.spec,export:imp.export,as:imp.as,position:position,nodes:nodeIds,edges:edgeIds,groups:Object.keys(groups).map(function(key){return prefix+key;})});
          // Retain nested provenance as derived editor metadata so the
          // Workbench can frame both the outer reference and its inner source
          // blocks. The direct import stays first and remains the authored
          // removal/placement owner for every member.
          // Drops recorded while the provider resolved its own imports follow the
          // carriers this import selects, unless a consumer binding replaces them.
          (telemetryDrops.get(provider) || []).forEach(function(drop){
            var id=drop.kind==='nodes'?prefix+drop.id:importedEdge(drop.id),overlay=((drop.kind==='nodes'?imp.nodeTracking:imp.edgeTracking) || {})[drop.id];
            if(!(drop.kind==='nodes'?nodeIds:edgeIds).includes(id) || object(overlay) && own(overlay,'telemetry') && !telemetryMergeOverlay(overlay.telemetry))return;
            drops.push({kind:drop.kind,id:id,spec:drop.spec,path:drop.path,message:drop.message});
          });
          // Spans dropped while the provider resolved its own imports follow the carriers this
          // import selects, unless the carrier here ends with a valid span of that name.
          (traceDrops.get(provider) || []).forEach(function(drop){
            if(drop.type!=='drop')return;
            var id=drop.kind==='nodes'?prefix+drop.id:importedEdge(drop.id);
            if(!(drop.kind==='nodes'?nodeIds:edgeIds).includes(id))return;
            var carrier=drop.kind==='nodes'?d.nodes[id]:d.edges.find(function(e){return e && edgeKey(e)===id;});
            if(drop.key!=null && carrier && object(carrier.trace) && object(carrier.trace.spans) && own(carrier.trace.spans,drop.key))return;
            spanDrops.push({type:'drop',kind:drop.kind,id:id,key:drop.key,spec:drop.spec,path:drop.path,message:drop.message});
          });
          ((provider.topologyProvenance || {}).imports || []).forEach(function(nested){
            var nestedNodes=(nested.nodes || []).map(function(key){return prefix+key;}).filter(function(key){return nodeIds.includes(key);});
            var nestedEdges=(nested.edges || []).map(function(key){var parts=key.split('->');return prefix+parts[0]+'->'+prefix+parts[1];}).filter(function(key){return edgeIds.includes(key);});
            var nestedGroups=(nested.groups || []).map(function(key){return prefix+key;}).filter(function(key){return own(d.groups || {},key);});
            if(nestedNodes.length)provenance.push({destination:clone(nested.destination || {spec:nested.spec}),spec:nested.spec,export:nested.export,as:imp.as+'::'+nested.as,position:position,nodes:nestedNodes,edges:nestedEdges,groups:nestedGroups});
          });
        });
        if(provenance.length)d.topologyProvenance={version:1,imports:provenance};
        if(drops.length)telemetryDrops.set(d,drops);
        if(spanDrops.length)traceDrops.set(d,spanDrops);
        if(metricNotes.length)telemetryNotes.set(d,metricNotes);
        if(provenance.length || d.topologyProvenance)checkReferences(d,at);
      });
      // Validate exports even when nobody imports them, so broken declarations
      // cannot silently become the next approved provider contract.
      exportsById.get(id).forEach(function(source){
        var d=source.d,exp=source.exp,placed=[];
        (d.rows || []).forEach(function(row){if(!Array.isArray(row))fail(source.at,'broken rows');row.forEach(function(slot){placed.push.apply(placed,Array.isArray(slot)?slot:[slot]);});});
        (d.floats || []).forEach(function(f){placed.push(f && f.id);});
        exp.nodes.forEach(function(key){if(!own(d.nodes || {},key) || placed.filter(function(x){return x===key;}).length!==1)fail(source.at,'missing exported node or broken placement '+key);});
        exp.edges.forEach(function(key){var matches=(d.edges || []).filter(function(e){return e && edgeKey(e)===key;});if(matches.length!==1)fail(source.at,'missing or ambiguous exported edge '+key);if(!exp.nodes.includes(matches[0].from) || !exp.nodes.includes(matches[0].to))fail(source.at,'exported edge '+key+' requires both endpoint nodes');});
      });
      states.set(id,'done');
    }
    copies.forEach(function(spec){visit(spec.page.canon.id,[]);});
    copies.forEach(function(spec){
      sections(spec).forEach(function(sec){delete sec.diagram.topologyImports;delete sec.diagram.topologyExports;});
      // #1290: span declarations do not block resolution: each document's own validation
      // reports its declarations and overlay findings, and invalid provider spans were
      // dropped above. Only those exact messages are set aside.
      var spanErrors=new Set(FlowCanon.traceCarrierErrors(spec));
      if(typeof sectionRecords==='function')sectionRecords(spec.page).forEach(function(record){traceFindings(record.section.diagram,record.path+'.diagram').errors.forEach(function(e){spanErrors.add(e);});});
      var errors=Array.from(new Set(FlowCanon.validate(spec).concat(validate(normalize(spec)).errors))).filter(function(e){return !spanErrors.has(e);});
      if(errors.length)fail(spec.page.canon.id,'invalid materialized spec: '+errors.join('; '));
    });
    return copies;
  }
  function checkReferences(d,at){
    var nodes=d.nodes || {},edges=new Set((d.edges || []).map(edgeKey));
    function context(key){
      return ((d.topologyProvenance || {}).imports || []).filter(function(imp){return key.indexOf(imp.as+'::')>=0;}).map(function(imp){return ' import '+imp.as+' ('+imp.spec+' export '+imp.export+')';}).join('');
    }
    function node(id,where){if(!own(nodes,id))fail(at+context(String(id)),where+' references missing node '+id);}
    function edge(id,where){if(!edges.has(id))fail(at+context(String(id)),where+' references missing edge '+id);}
    ((d.topologyProvenance || {}).imports || []).forEach(function(imp){imp.nodes.forEach(function(id){node(id,'import provenance');});imp.edges.forEach(function(id){edge(id,'import provenance');});});
    (d.edges || []).forEach(function(e){node(e.from,'edge '+edgeKey(e));node(e.to,'edge '+edgeKey(e));});
    (d.steps || []).forEach(function(s,i){
      var where='step '+(s.id || i);
      stepKeys(s).forEach(function(id){edge(id,where);});Object.keys(s.contracts || {}).forEach(function(id){edge(id,where+' contracts');});Object.keys(stepFailures(s)).forEach(function(id){edge(id,where+' failures');});
      stepNodes(s).concat(Object.keys(stepTonePatch(s) || {})).forEach(function(id){node(id,where);});
      Object.keys(stepPanelPatch(s) || {}).concat(Object.keys(s.panelVisibility || {})).forEach(function(id){
        if(!(d.panels || []).some(function(p){return p && p.id===id;}))fail(at,where+' references missing panel '+id);
      });
      [].concat(s.traceMatch || []).forEach(function(m){if(m && m.nodeId)node(m.nodeId,where+' traceMatch');});
      (s.conditions || []).forEach(function(c){if(c.nodeId)node(c.nodeId,where+' condition');});
    });
  }
  function origin(d,kind,id){
    return (((d || {}).topologyProvenance || {}).imports || []).find(function(imp){return (imp[kind] || []).includes(id);});
  }
  // A resolved snapshot owns its delivery annotations. Its imported graph and
  // provider metadata remain protected; no provider document is edited here.
  function snapshotTracking(value,node){
    var tracking={};if(!object(value))return tracking;
    var fields=['tickets','prs'];
    if(!node || !isTextBoxNode(value))fields.push('existsWhen','missingWork','telemetry','trace');
    fields.forEach(function(field){if(own(value,field))tracking[field]=value[field];});return tracking;
  }
  function protectedValue(value,node){
    if(!object(value))return value;
    var copy=clone(value);Object.keys(snapshotTracking(value,node)).forEach(function(field){delete copy[field];});return copy;
  }
  function snapshotTrackingError(before,after,page){
    var error=null;
    function check(previous,next,node,id){
      if(error || sameDefinition(snapshotTracking(previous,node),snapshotTracking(next,node)))return;
      var at='snapshot '+(node?'node ':'connection ')+id+' tracking';
      try{validateTracking(snapshotTracking(next,node),at);}catch(ex){error=ex.message;return;}
      // A resolved snapshot holds whole declarations, not patches: check them in full.
      if(object(next) && own(next,'trace')){
        var problems=FlowCanon.traceDeclarationErrors(next.trace,node?'node':'edge',page);
        if(problems.length)error='Topology '+at+': trace'+(problems[0].key==null?'':'.spans.'+problems[0].key)+': '+problems[0].message;
      }
    }
    ((before.topologyProvenance || {}).imports || []).forEach(function(imp){
      (imp.nodes || []).forEach(function(id){check((before.nodes || {})[id],(after.nodes || {})[id],true,id);});
      (imp.edges || []).forEach(function(id){
        var previous=(before.edges || []).filter(function(edge){return edgeKey(edge)===id;});
        (after.edges || []).filter(function(edge){return edgeKey(edge)===id;}).forEach(function(edge,index){check(previous[index],edge,false,id);});
      });
    });return error;
  }
  function protectedStructure(d){
    var imports=((d.topologyProvenance || {}).imports || []),nodes=[],edges=[],groups=[];
    imports.forEach(function(imp){nodes.push.apply(nodes,imp.nodes || []);edges.push.apply(edges,imp.edges || []);groups.push.apply(groups,imp.groups || []);});
    return {provenance:d.topologyProvenance,nodes:nodes.map(function(id){return [id,protectedValue((d.nodes || {})[id],true)];}),
      edges:edges.map(function(id){return [id,(d.edges || []).filter(function(e){return edgeKey(e)===id;}).map(function(edge){return protectedValue(edge,false);})];}),
      groups:groups.map(function(id){return [id,(d.groups || {})[id]];}),
      rows:(d.rows || []).flatMap(function(row,r){return row.flatMap(function(slot,c){return (Array.isArray(slot)?slot:[slot]).flatMap(function(id,i){return nodes.includes(id)?[[id,r,c,i,Array.isArray(slot)]]:[];});});}),
      floats:(d.floats || []).filter(function(f){return nodes.includes(f.id);})};
  }
  function editError(before,after){
    var next=sections(after),error=null;
    sections(before).forEach(function(sec,index){
      if(!sec.diagram.topologyProvenance || error)return;
      var target=sec.id?next.find(function(s){return s.id===sec.id;}):next[index];
      if(!target || JSON.stringify(protectedStructure(sec.diagram))!==JSON.stringify(protectedStructure(target.diagram)))
        error='Imported topology structure is read only in this snapshot. Tracking, consumer steps, paths, failures, and panels remain editable.';
      else error=snapshotTrackingError(sec.diagram,target.diagram,after);
    });
    return error;
  }
  function dependencies(spec){
    var ids=new Set();sections(spec).forEach(function(sec){
      var imports=sec.diagram.topologyImports;
      if(imports!=null && !Array.isArray(imports))fail('source','topologyImports must be an array');
      (imports || []).forEach(function(imp){if(!object(imp) || typeof imp.spec!=='string')fail('source','import requires a spec ID');ids.add(imp.spec);});
    });return Array.from(ids);
  }
  function resolveSource(raw,context){
    if(!context){
      if(raw && raw.nodes && raw.rows && !raw.page && !raw.blocks && !raw.sections){
        if(!own(raw,'topologyExports') && !own(raw,'topologyImports'))return raw;
        return resolveSource({page:{sections:[{diagram:raw}]}},null).page.sections[0].diagram;
      }
      if(!declarations(raw))return raw;
      if(sections(raw).some(function(sec){return (sec.diagram.topologyImports || []).length;}))
        fail('editor','open this authored spec from Canon to load its providers');
      // Local exports need no catalog. Validate through the same resolver, with
      // temporary identity metadata that is never published into authored JSON.
      var local=clone(raw),wrapped=!!local.page,page=wrapped?local.page:local;
      var canon=page.canon;
      if(!canon)page.canon={version:1,id:page.documentLinks && page.documentLinks.id || 'local-export',kind:'design',owner:'group:default/local'};
      var result=materialize([wrapped?local:{page:local}])[0];
      if(!canon)delete result.page.canon;
      return wrapped?result:result.page;
    }
    if(context.version!==1 || !Array.isArray(context.specs) || typeof context.id!=='string')fail('editor','invalid authored provider snapshot');
    var candidate=clone(raw),bareDiagram=candidate && (own(candidate,'nodes') || own(candidate,'rows') || own(candidate,'topologyImports') || own(candidate,'topologyExports'));
    var mode=object(candidate.page)?'wrapped':bareDiagram?'diagram':'page';
    var input=mode==='wrapped'?candidate:mode==='diagram'?{page:{sections:[{diagram:candidate}]}}:{page:candidate};
    var original=context.specs.find(function(spec){return spec.page && spec.page.canon && spec.page.canon.id===context.id;});
    if(!original)fail('editor','consumer is missing from the authored snapshot');
    var authoredCanon=input.page.canon,authoredIdentity=input.page.documentLinks && input.page.documentLinks.id;
    if(context.ephemeral && input.page.documentLinks)delete input.page.documentLinks.id;
    input.page.canon=clone(original.page.canon);
    var inputs=context.specs.map(function(spec){return spec.page.canon.id===context.id?input:spec;});
    var result=materialize(inputs).find(function(spec){return spec.page.canon.id===context.id;});
    if(context.ephemeral){if(authoredIdentity)result.page.documentLinks.id=authoredIdentity;if(authoredCanon)result.page.canon=authoredCanon;else delete result.page.canon;}
    return mode==='wrapped'?result:mode==='diagram'?result.page.sections[0].diagram:result.page;
  }
  return {validateDeclarations:function(specs){materializeSources(specs,true);},validateTracking:validateTracking,mergeOverlay:mergeOverlay,mergeTelemetry:mergeTelemetry,
    telemetryDrops:function(d){return (telemetryDrops.get(d) || []).map(function(drop){return clone(drop);});},mergeTrace:mergeTrace,
    traceFindings:traceFindings,telemetryFindings:telemetryFindings,mergeExports:mergeExports,validateNodeOverride:validateNodeOverride,validateEdgeOverride:validateEdgeOverride,materialize:materialize,hasDeclarations:declarations,origin:origin,editError:editError,dependencies:dependencies,resolveSource:resolveSource};
})();
FlowCanon.materializeTopology=FlowTopology.materialize;
FlowCanon.topologyDependencies=FlowTopology.dependencies;
