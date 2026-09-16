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
      if (s.diagram) out.push(s);
      (Array.isArray(s.tabs) ? s.tabs : []).forEach(function(t){ walk(t.sections || t.blocks); });
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
      (Array.isArray(d.steps) ? d.steps : []).forEach(function(st,i){add(st,'step',st.id || String(i));});
    });
    return out;
  }
  function validate(raw){
    var errors=[], p=pageOf(raw);
    if (!object(p)) return errors;
    if (p.canon!=null){
      var c=p.canon;
      if (!object(c) || c.version!==1 || !c.id || !['design','canonical'].includes(c.kind) || !entityRef(c.owner))
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
      if (item.kind==='step' && !sections(raw)[item.section].diagram.steps.some(function(s){return s.id===item.targetId;})) errors.push('codeRefs: referenced steps require stable IDs');
    });
    sections(raw).forEach(function(sec){
      Object.values(sec.diagram.nodes || {}).concat(sec.diagram.steps || []).forEach(function(v){if(v && v.codeRefs!=null && !Array.isArray(v.codeRefs)) errors.push('codeRefs: expected an array');});
      Object.keys(sec.diagram.nodes || {}).forEach(function(id){
        var node=sec.diagram.nodes[id], b=node && node.binding;
        if (b!=null && (!object(b) || !entityRef(b.entityRef))) errors.push('nodes.'+id+'.binding: expected a catalog entityRef');
        if (b && b.api && !entityRef(b.api.entityRef)) errors.push('nodes.'+id+'.binding.api: expected an API entityRef');
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
