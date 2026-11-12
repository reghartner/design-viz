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
  /* Authored reader text only: keep search independent of geometry, IDs,
     bindings, evidence URLs and source JSON. Used by the publisher and v1
     embedded libraries. Add new reader text fields here as the schema grows. */
  function contentSearchText(raw){
    var texts=[],seen=new Set();
    function text(value){
      if(typeof value!=='string' || !value.trim() || seen.has(value))return;
      seen.add(value);texts.push(value);
    }
    function fields(value,keys){if(object(value))keys.forEach(function(key){text(value[key]);});}
    function list(value,visit){if(Array.isArray(value))value.forEach(visit);}
    function records(value,visit){if(object(value))Object.keys(value).sort().forEach(function(key){visit(value[key],key);});}
    function bullets(value){list(value,function(item){text(item);fields(item,['text']);if(object(item))bullets(item.sub);});}
    function contract(value){
      fields(value,['title','note','fieldLabel']);
      if(!object(value))return;
      // #1304 grid blocks: column labels and cell values are reader text too.
      list(value.columns,function(col){fields(col,['label']);});
      list(value.fields,function(field){
        fields(field,['k','v','g']);
        if(object(field))records(field.cells,function(cell){text(typeof cell==='number' && isFinite(cell)?String(cell):cell);});
      });
    }
    // Panel declarations and playback patches share these authored content
    // shapes. Traverse explicit collections, never arbitrary object properties.
    function panel(value,declaration){
      if(!object(value))return;
      declaration=object(declaration)?declaration:value;
      fields(value,['title','subtitle','name','label','text','caption','note','detail','message','body','alt','unit','fieldLabel','state','app','appName','service','date','clock','site','videoLabel','videoReason','zone','operator','incident','agency','callsign','location','dispatcher','eta','device','badgeText','value','reason','tradeoff','period','assumptions']);
      ['states','log','notify','notifications','columns','fields','rows','items','checks','stages','lanes','series','events','spans','rooms','devices','subjects','zones','screens','tiles','messages','segments','routes','replicas','signals','leds','sensors','responders','metrics','sources','start','layers'].forEach(function(key){
        list(value[key],function(item){text(item);panel(item);});
      });
      ['results','highlights','values'].forEach(function(key){records(value[key],panel);});
      records(value.cells,text);
      ['banner','alert','notify','notification','brand','cadence'].forEach(function(key){text(value[key]);panel(value[key]);});
      // Audio source is a displayed speaker label, unlike document/evidence URLs.
      fields(value.audio,['text','source','reason']);
      if(declaration.type==='queue')fields(value,['from','to']);
      var keyed={security:'sensors',dispatch:'responders',deviceapp:'fields',homemap:'devices'}[declaration.type];
      if(keyed)list(declaration[keyed],function(item){if(object(item) && typeof item.id==='string' && Object.hasOwn(value,item.id))panel(value[item.id]);});
      ['initial','enterOnce'].forEach(function(key){panel(value[key],declaration);});
    }
    function diagram(value){
      if(!object(value))return;
      fields(value,['title']);
      records(value.nodes,function(node){fields(node,['title','sub','text','alt']);});
      records(value.groups,function(group){fields(group,['title']);});
      list(value.edges,function(edge){fields(edge,['label']);});
      list(value.floats,function(item){fields(item,['title','text','label','sub']);});
      list(value.paths,function(item){fields(item,['label']);});
      list(value.layouts,function(item){fields(item,['name']);});
      list(value.panels,panel);
      list(value.steps,function(step){
        fields(step,['title','text','caption']);
        if(object(step))records(step.panels || step.patch,function(patch,id){
          var declaration=(Array.isArray(value.panels)?value.panels:[]).find(function(item){return object(item) && item.id===id;});
          panel(patch,declaration);
        });
      });
    }
    function blocks(value){list(value,function(block){
      if(!object(block))return;
      fields(block,['heading','text']);list(block.views,function(view){fields(view,['name']);});list(block.text,text);bullets(block.bullets);
      contract(block.contract);list(block.contracts,contract);diagram(block.diagram);
      list(block.tabs,function(tab){if(object(tab)){fields(tab,['label']);list(tab.views,function(view){fields(view,['name']);});blocks(tab.sections || tab.blocks);}});
    });}
    var page=pageOf(raw);
    if(object(page)){
      fields(page,['title','subtitle']);list(page.views,function(view){fields(view,['name']);});
      records(page.protocols,function(item){fields(item,['label']);});
      records(page.lanes,function(item){fields(item,['label','title']);});
      blocks(page.blocks || page.sections);
      if(!page.blocks && !page.sections)diagram(page);
    }
    return texts.join('\n');
  }
  /* One service per catalog identity. Count each incident edge once in each
     section, including self-loops and edges between two nodes of that service. */
  function serviceSummaries(raw){
    var found=new Map();
    sections(raw).forEach(function(section){
      var nodes=section.diagram.nodes || {},refs=new Map();
      Object.keys(nodes).sort().forEach(function(id){
        var node=nodes[id],binding=node && node.binding;
        if(!binding || !entityRef(binding.entityRef))return;
        var ref=binding.entityRef,label=[binding.label,node.title,ref].find(function(value){return typeof value==='string' && value.trim();}).trim();
        refs.set(id,ref);
        if(!found.has(ref))found.set(ref,{entityRef:ref,label:label,edgeCount:0});
      });
      (section.diagram.edges || []).forEach(function(edge){
        new Set([refs.get(edge.from),refs.get(edge.to)]).forEach(function(ref){if(ref)found.get(ref).edgeCount++;});
      });
    });
    return sortServiceSummaries(Array.from(found.values()));
  }
  function sortServiceSummaries(services){
    function compare(a,b){return a<b?-1:a>b?1:0;}
    return services.sort(function(a,b){return b.edgeCount-a.edgeCount || compare(a.label.toLowerCase(),b.label.toLowerCase()) || compare(a.entityRef,b.entityRef);});
  }
  function catalog(input){
    if (!input || input.version !== 1 || !Array.isArray(input.services)) throw new Error('Catalog: expected version 1 and services.');
    var seen=new Set();
    var services=input.services.map(function(s){
      if (!object(s) || !entityRef(s.entityRef) || seen.has(s.entityRef)) throw new Error('Catalog: missing or duplicate service entityRef.');
      seen.add(s.entityRef);
      ['dependsOn','consumesApis'].forEach(function(key){
        if(s[key]!=null && (!Array.isArray(s[key]) || s[key].some(function(ref){return !entityRef(ref);})))
          throw new Error('Catalog: '+key+' must be an array of fully qualified entity references.');
      });
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
  var traceAttributes=['service.namespace','service.version','deployment.environment.name','deployment.environment','http.response.status_code','http.status_code','db.system','db.system.name','messaging.queue.depth','queue.depth','messaging.message.age_ms','flow.backpressure','flow.delivery_failed','retry.attempt','flow.step.id'];
  /* Attribute name -> providers of the page's trace connections that list it in
     allowedAttributes. Read with telemetry paused too: enabled:false stops loading,
     not authoring. */
  function pageConnections(raw){
    var page=pageOf(raw);
    if(typeof FlowTraceConnections==='undefined' || !object(page))return {};
    var telemetry=page.tracking && page.tracking.telemetry;
    if(object(telemetry) && telemetry.enabled===false)page=Object.assign({},page,{tracking:Object.assign({},page.tracking,{telemetry:Object.assign({},telemetry,{enabled:true})})});
    return FlowTraceConnections.resolve(page,typeof TELEMETRY_COMPANY_TRACE_CONNECTIONS!=='undefined'?TELEMETRY_COMPANY_TRACE_CONNECTIONS:{});
  }
  function profileAttributes(raw){
    var out=Object.create(null),connections=pageConnections(raw);
    Object.keys(connections).forEach(function(id){(connections[id].allowedAttributes || []).forEach(function(k){(out[k]=out[k] || []).push(connections[id].provider);});});
    return out;
  }
  /* Honeycomb trace attributes are text: get_trace table cells, and the run_query
     raw rows a Honeycomb profile reads its allowedAttributes from (#1197). */
  /* #1414: a Honeycomb profile with allowedAttributes and no dataset reads them with an
     environment-wide run_query; the validator says so as a note. */
  function traceNotes(raw){
    var connections=pageConnections(raw),notes=[];
    Object.keys(connections).forEach(function(id){var c=connections[id];if(c.provider==='honeycomb' && (c.allowedAttributes || []).length && !c.dataset)notes.push('tracking.telemetry.traceConnections.'+id+': no `dataset`, so the allowedAttributes query (run_query) runs environment-wide across every dataset; add `dataset` to narrow it');});
    return notes;
  }
  function traceWarnings(raw){
    var listed=profileAttributes(raw),warnings=[],connections=pageConnections(raw);
    sections(raw).forEach(function(sec){(Array.isArray(sec.diagram.steps)?sec.diagram.steps:[]).forEach(function(st){
      // An array lists alternatives; report each under traceMatch[index].
      var many=Array.isArray(st && st.traceMatch);
      (many?st.traceMatch:[st && st.traceMatch]).forEach(function(m,index){
        if(!object(m) || !object(m.attributes))return;
        Object.keys(m.attributes).forEach(function(k){
          if(!Object.prototype.hasOwnProperty.call(listed,k) || listed[k].some(function(p){return p!=='honeycomb';}))return;
          var at='steps.'+(st.id || '?')+'.traceMatch'+(many?'['+index+']':'')+'.attributes.'+k+': ';
          if(typeof m.attributes[k]!=='string')warnings.push(at+'Honeycomb table cells are text; a '+typeof m.attributes[k]+' value never matches');
        });
      });
      // #1290: and for a step's traceScope.attributes.
      var scoped=st && object(st.traceScope) && object(st.traceScope.attributes)?st.traceScope.attributes:{};
      Object.keys(scoped).forEach(function(k){
        if(!Object.prototype.hasOwnProperty.call(listed,k) || listed[k].some(function(p){return p!=='honeycomb';}) || typeof scoped[k]==='string')return;
        warnings.push('steps.'+(st.id || '?')+'.traceScope.attributes.'+k+': Honeycomb table cells are text; a '+typeof scoped[k]+' value never matches');
      });
    });
    // #1290: the same rule for span declarations on nodes and edges.
    function declared(value,at){
      var spans=object(value) && object(value.trace) && object(value.trace.spans)?value.trace.spans:{};
      Object.keys(spans).forEach(function(key){
        var attrs=object(spans[key]) && object(spans[key].attributes)?spans[key].attributes:{};
        Object.keys(attrs).forEach(function(k){
          if(!Object.prototype.hasOwnProperty.call(listed,k) || listed[k].some(function(p){return p!=='honeycomb';}) || typeof attrs[k]==='string')return;
          warnings.push(at+'.trace.spans.'+key+'.attributes.'+k+': Honeycomb table cells are text; a '+typeof attrs[k]+' value never matches');
        });
      });
    }
    if(object(sec.diagram.nodes))Object.keys(sec.diagram.nodes).forEach(function(id){declared(sec.diagram.nodes[id],'nodes.'+id);});
    (Array.isArray(sec.diagram.edges)?sec.diagram.edges:[]).forEach(function(e){if(object(e))declared(e,'edges.'+e.from+'->'+e.to);});
    });
    return warnings;
  }
  /* #1290: trace span declarations on a node or edge: trace.spans, keyed by a short name.
     A declaration names spans by serviceName and either an exact operation, an
     operationPrefix, or (with neither) its attributes; role says what the span is.
     Returns [{key, message}]; key is null when the trace object itself is malformed. */
  var TRACE_SPAN_ROLES={node:['process','database','cache','call','work'],edge:['send','receive']};
  var TRACE_SPAN_FIELDS=['serviceName','operation','operationPrefix','namespace','attributes','role'];
  function traceSpanErrors(s,kind,listed){
    if(!object(s))return ['expected a span declaration object'];
    var e=[],has=function(k){return Object.prototype.hasOwnProperty.call(s,k);};
    Object.keys(s).forEach(function(k){if(TRACE_SPAN_FIELDS.indexOf(k)<0)e.push('unknown field '+k);});
    if(typeof s.serviceName!=='string' || !s.serviceName.trim())e.push('serviceName required');
    if(has('operation') && (typeof s.operation!=='string' || !s.operation.trim()))e.push('operation must be a nonempty string');
    if(has('operationPrefix') && (typeof s.operationPrefix!=='string' || s.operationPrefix.trim().length<2))e.push('operationPrefix must be at least two characters');
    if(has('operation') && has('operationPrefix'))e.push('operation and operationPrefix cannot be combined');
    if(!has('operation') && !has('operationPrefix') && !(object(s.attributes) && Object.keys(s.attributes).length))e.push('needs operation, operationPrefix or attributes');
    if(has('namespace') && (typeof s.namespace!=='string' || !s.namespace.trim()))e.push('namespace must be a nonempty string');
    if(has('attributes') && (!object(s.attributes) || Object.keys(s.attributes).some(function(k){return !traceAttributes.includes(k) && !Object.prototype.hasOwnProperty.call(listed,k) || !['string','number','boolean'].includes(typeof s.attributes[k]);})))e.push('attributes: use supported operational attributes only');
    if(TRACE_SPAN_ROLES[kind].indexOf(s.role)<0)e.push('role must be one of '+TRACE_SPAN_ROLES[kind].join(', '));
    return e;
  }
  /* #1290 (D19): the text for a declared exact operation or prefix that no span of its service in
     an approved reference trace matches, or null (also for attribute-only declarations). A span can
     be real and still absent from one run, so the text does not call the declaration wrong. */
  function traceReferenceMiss(m,spans){
    if(!object(m) || typeof m.serviceName!=='string' || !Array.isArray(spans))return null;
    var exact=typeof m.operation==='string',prefix=!exact && typeof m.operationPrefix==='string';if(!exact && !prefix)return null;
    if(spans.some(function(s){return object(s) && s.serviceName===m.serviceName && (exact?s.operation===m.operation:typeof s.operation==='string' && s.operation.indexOf(m.operationPrefix)===0);}))return null;
    return m.serviceName+' '+(exact?m.operation:'operations starting "'+m.operationPrefix+'"')+' was not seen in the approved reference trace. If it only appears in some runs, such as retries, nothing is wrong; otherwise check the declaration or approve a new reference';
  }
  // The approved reference trace spans of a diagram, or null.
  function referenceSpans(d){var r=object(d) && object(d.referenceTrace)?d.referenceTrace:null;return r && object(r.approval) && object(r.trace) && Array.isArray(r.trace.spans)?r.trace.spans:null;}
  // The node ids and delivered edge keys the steps of a diagram's reference flow (its first path, else every step) light.
  function referenceLit(d){
    var steps=Array.isArray(d.steps)?d.steps:[],path=Array.isArray(d.paths) && d.paths.length && object(d.paths[0]) && Array.isArray(d.paths[0].steps)?d.paths[0].steps:null;
    if(path)steps=path.map(function(id){return steps.find(function(s){return object(s) && s.id===id;});});
    var out={nodes:[],edges:[]};
    steps.forEach(function(st){
      if(!object(st))return;var failures=object(st.failures)?st.failures:{},keys=[];
      if(typeof st.edge==='string')keys.push(st.edge);(Array.isArray(st.edges)?st.edges:[]).forEach(function(k){if(typeof k==='string')keys.push(k);});
      keys.forEach(function(k){if(failures[k]!=='dropped' && failures[k]!=='blocked' && out.edges.indexOf(k)<0)out.edges.push(k);});
      (Array.isArray(st.nodes)?st.nodes:[]).forEach(function(n){if(typeof n==='string' && out.nodes.indexOf(n)<0)out.nodes.push(n);});
    });
    return out;
  }
  function traceDeclarationErrors(trace,kind,raw,listed){
    if(!listed)listed=profileAttributes(raw);
    if(!object(trace) || Object.keys(trace).some(function(k){return k!=='spans';}) || !object(trace.spans))return [{key:null,message:'expected {"spans": {<name>: <span declaration>}}'}];
    var out=[];
    Object.keys(trace.spans).forEach(function(key){
      if(!/^[A-Za-z][A-Za-z0-9_-]*$/.test(key))out.push({key:key,message:'span names start with a letter and use letters, digits, - and _'});
      traceSpanErrors(trace.spans[key],kind,listed).forEach(function(message){out.push({key:key,message:message});});
    });
    return out;
  }
  // The validate() messages for every carrier declaration of a page, e.g. 'nodes.worker.trace.spans.find: …'.
  function traceCarrierErrors(raw,listed){
    if(!listed)listed=profileAttributes(raw);
    var errors=[];
    sections(raw).forEach(function(sec){
      var d=sec.diagram;
      function spans(value,kind,at){
        if(!object(value) || !Object.prototype.hasOwnProperty.call(value,'trace'))return;
        traceDeclarationErrors(value.trace,kind,raw,listed).forEach(function(x){errors.push(at+'.trace'+(x.key==null?'':'.spans.'+x.key)+': '+x.message);});
      }
      if(object(d.nodes))Object.keys(d.nodes).forEach(function(id){spans(d.nodes[id],'node','nodes.'+id);});
      (Array.isArray(d.edges)?d.edges:[]).forEach(function(e){if(object(e))spans(e,'edge','edges.'+e.from+'->'+e.to);});
    });
    return errors;
  }
  /* #1290: a step's traceScope narrows the spans it inherits from the carriers it lights. */
  var TRACE_SCOPE_FIELDS=['root','parentStepId','attributes','skip','optional','maxDurationMs','maxQueueDepth'];
  function traceScopeErrors(st,ids,listed){
    if(!Object.prototype.hasOwnProperty.call(st,'traceScope'))return [];
    var sc=st.traceScope,e=[];
    if(!object(sc))return ['traceScope: expected an object'];
    if(st.traceMatch!=null)e.push('traceScope: use traceMatch or traceScope on a step, not both');
    if(!st.id)e.push('traceScope: stable step ID required');
    Object.keys(sc).forEach(function(k){if(TRACE_SCOPE_FIELDS.indexOf(k)<0)e.push('traceScope: unknown field '+k);});
    if(sc.root!=null && (!object(sc.root) || Object.keys(sc.root).some(function(k){return k!=='serviceName' && k!=='operation';}) || typeof sc.root.serviceName!=='string' || !sc.root.serviceName.trim() || typeof sc.root.operation!=='string' || !sc.root.operation.trim()))e.push('traceScope.root: expected {serviceName, operation}');
    if(sc.parentStepId!=null && (typeof sc.parentStepId!=='string' || !ids.has(sc.parentStepId) || sc.parentStepId===st.id))e.push('traceScope: unknown or self parentStepId');
    if(sc.attributes!=null && (!object(sc.attributes) || Object.keys(sc.attributes).some(function(k){return !traceAttributes.includes(k) && !Object.prototype.hasOwnProperty.call(listed,k) || !['string','number','boolean'].includes(typeof sc.attributes[k]);})))e.push('traceScope.attributes: use supported operational attributes only');
    if(sc.skip!=null && (!object(sc.skip) || Object.keys(sc.skip).some(function(k){return !Array.isArray(sc.skip[k]) || sc.skip[k].some(function(x){return typeof x!=='string' || !x.trim();});})))e.push('traceScope.skip: expected {<node or connection id>: [<span name or role:<role>>, …]}');
    if(sc.optional!==undefined && typeof sc.optional!=='boolean')e.push('traceScope.optional: expected true or false');
    ['maxDurationMs','maxQueueDepth'].forEach(function(k){if(sc[k]!=null && (typeof sc[k]!=='number' || !Number.isFinite(sc[k]) || sc[k]<0))e.push('traceScope.'+k+': nonnegative number required');});
    return e;
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
    var listed=profileAttributes(raw);
    traceCarrierErrors(raw,listed).forEach(function(e){errors.push(e);});
    sections(raw).forEach(function(sec){
      var d=sec.diagram, steps=Array.isArray(d.steps)?d.steps:[], ids=new Set(steps.map(function(s){return s && s.id;}));
      if(d.referenceTrace!=null){var r=d.referenceTrace;if(!object(r) || r.version!==1 || !object(r.trace) || !object(r.trace.context) || !Array.isArray(r.trace.spans) || typeof r.trace.traceId!=='string' || !object(r.approval) || typeof r.approval.reason!=='string' || typeof r.contract!=='string')errors.push('referenceTrace: expected an approved version-1 trace mapping');}
      if(d.incidents!=null && (!Array.isArray(d.incidents) || d.incidents.some(function(i){return !object(i) || typeof i.pathId!=='string' || typeof i.traceId!=='string' || typeof i.firstDivergence!=='string';})))errors.push('incidents: expected comparison provenance objects');
      // Every alternative's parentStepId is an edge; a cycle through any of them fails.
      // #1290: traceScope.parentStepId joins the same cycle check.
      // A cycle that needs a traceScope parent is reported under traceScope, where the step form shows it
      // (a step naming itself is already reported as a self parentStepId).
      var cycles=function(withScope){
        var parents=new Map(steps.filter(function(s){return s && (s.traceMatch || withScope && object(s.traceScope));}).map(function(s){return [s.id,[].concat(s.traceMatch || []).map(function(m){return m && m.parentStepId;}).concat(withScope && object(s.traceScope) && s.traceScope.parentStepId && s.traceScope.parentStepId!==s.id?[s.traceScope.parentStepId]:[]).filter(Boolean)];})),acyclic=new Set(),hits=[];
        var cyclic=function(id,path){if(acyclic.has(id))return false;if(path.has(id))return true;path.add(id);var hit=(parents.get(id) || []).some(function(p){return cyclic(p,path);});path.delete(id);if(!hit)acyclic.add(id);return hit;};
        parents.forEach(function(_,id){if(cyclic(id,new Set()))hits.push(id);});
        return hits;
      };
      var matchCycles=cycles(false);
      matchCycles.forEach(function(){errors.push('traceMatch: cyclic parentStepId');});
      cycles(true).filter(function(id){return matchCycles.indexOf(id)<0;}).forEach(function(){errors.push('traceScope: cyclic parentStepId');});
      steps.forEach(function(st){
        if(!st)return;
        // An array lists alternatives; each entry is validated as one selector and
        // its findings are reported under traceMatch[index].
        var many=Array.isArray(st.traceMatch),list=many?st.traceMatch:[st.traceMatch];
        if(many && !list.length)errors.push('traceMatch: expected at least one alternative');
        list.forEach(function(m,index){
        var first=errors.length;
        if(m!=null || many){
          if(!object(m) || typeof m.serviceName!=='string' || !m.serviceName.trim() || typeof m.operation!=='string' || !m.operation.trim() || !st.id)errors.push('traceMatch: stable step ID, serviceName and operation required');
          else {
            if(m.panelId && !(Array.isArray(d.panels)?d.panels:[]).some(function(p){return p && p.id===m.panelId && p.type==='queue';}))errors.push('traceMatch.panelId: expected a declared queue panel');
            if(m.nodeId && !Object.prototype.hasOwnProperty.call(d.nodes || {},m.nodeId))errors.push('traceMatch: unknown nodeId '+m.nodeId);
            if(m.parentStepId && (!ids.has(m.parentStepId) || m.parentStepId===st.id))errors.push('traceMatch: unknown or self parentStepId');
            ['maxDurationMs','maxQueueDepth'].forEach(function(k){if(m[k]!=null && (typeof m[k]!=='number' || !Number.isFinite(m[k]) || m[k]<0))errors.push('traceMatch.'+k+': nonnegative number required');});
            if(m.occurrence!=null && (!Number.isInteger(m.occurrence) || m.occurrence<1))errors.push('traceMatch.occurrence: positive integer required');
            if(m.repeat!=null && m.repeat!=='attempts')errors.push('traceMatch.repeat: expected attempts');
            if(m.repeat && m.occurrence)errors.push('traceMatch: occurrence and repeat cannot be combined');
            if(m.optional!==undefined && typeof m.optional!=='boolean')errors.push('traceMatch.optional: expected true or false');
            if(m.attributes!=null && (!object(m.attributes) || Object.keys(m.attributes).some(function(k){return !traceAttributes.includes(k) && !Object.prototype.hasOwnProperty.call(listed,k) || !['string','number','boolean'].includes(typeof m.attributes[k]);})))errors.push('traceMatch.attributes: use supported operational attributes only');
          }
        }
        if(many)for(var j=first;j<errors.length;j++)errors[j]=errors[j].replace(/^traceMatch/,'traceMatch['+index+']');
        });
        // #1175: a step with alternatives is optional only when every alternative says so.
        if(many && list.some(function(m){return object(m) && m.optional===true;}) && list.some(function(m){return !object(m) || m.optional!==true;}))errors.push('traceMatch: set optional on every alternative or on none');
        traceScopeErrors(st,ids,listed).forEach(function(e){errors.push(e);});
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
  /* #1238: the attribute names traceMatch.attributes accepts on this page, for the Workbench form. */
  function traceAttributeNames(raw){return traceAttributes.concat(Object.keys(profileAttributes(raw)).filter(function(k){return traceAttributes.indexOf(k)<0;}));}
  return {version:1,traceWarnings:traceWarnings,traceNotes:traceNotes,traceDeclarationErrors:traceDeclarationErrors,traceReferenceMiss:traceReferenceMiss,referenceSpans:referenceSpans,referenceLit:referenceLit,traceCarrierErrors:traceCarrierErrors,traceAttributeNames:traceAttributeNames,clone:clone,http:http,entityRef:entityRef,pageOf:pageOf,sections:sections,contentSearchText:contentSearchText,serviceSummaries:serviceSummaries,sortServiceSummaries:sortServiceSummaries,catalog:catalog,binding:binding,
    referenceErrors:referenceErrors,locate:locate,codeUrl:codeUrl,references:references,validate:validate,links:links};
})();
