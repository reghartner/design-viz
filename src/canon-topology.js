/* Pure topology resolution. Callers supply one approved authored snapshot;
   build validation and runtime views derive values in memory, never source files. */
var FlowTopology = (function(){
  'use strict';
  var own=function(o,k){return Object.prototype.hasOwnProperty.call(o,k);};
  function object(v){return !!v && typeof v==='object' && !Array.isArray(v);}
  function clone(v){return JSON.parse(JSON.stringify(v));}
  function token(v){return typeof v==='string' && /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(v);}
  function namespacePath(v){return typeof v==='string' && v.split('::').every(token);}
  function fail(at,message){throw new Error('Topology '+at+': '+message);}
  function shape(value,keys,at){
    if(!object(value) || Object.keys(value).some(function(k){return keys.indexOf(k)<0;}))fail(at,'expected an object with fields '+keys.join(', '));
  }
  function list(value,at){
    if(!Array.isArray(value) || value.some(function(id){return typeof id!=='string' || !id;}) || new Set(value).size!==value.length)fail(at,'expected an array of unique identities');
    return value;
  }
  function sections(spec){return FlowCanon.sections(spec);}
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

  function materialize(specs){
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
              shape(imp,['spec','export','as','nodes','edges','groups','position'],at+' provenance');
              if(typeof imp.spec!=='string' || !token(imp.export) || !namespacePath(imp.as))fail(at,'invalid generated import provenance');
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
        (d.topologyImports || []).forEach(function(imp,i){
          var where=at+' import '+i;shape(imp,['spec','export','as','position','nodes','edges','nodePositions'],where);
          if(typeof imp.spec!=='string' || !imp.spec || !token(imp.export) || !token(imp.as))fail(where,'requires spec, export, and a namespace as (letters, digits, dot, dash, underscore)');
          ['nodes','edges'].forEach(function(key){if(own(imp,key))list(imp[key],where+' '+key);});
          if(own(imp,'nodePositions')){
            if(!object(imp.nodePositions))fail(where,'nodePositions must be an object keyed by exported node identity');
            Object.keys(imp.nodePositions).forEach(function(key){
              shape(imp.nodePositions[key],['x','y'],where+' nodePositions '+key);
              if(!positionedFloat(imp.nodePositions[key]))fail(where,'nodePositions '+key+' requires finite x/y coordinates between -100000 and 100000');
            });
          }
          if(own(imp,'position')){
            shape(imp.position,['x','y'],where+' position');
            if(!positionedFloat(imp.position))fail(where,'position requires finite x/y coordinates between -100000 and 100000');
          }
        });
      });
    });
    function visit(id,chain){
      if(states.get(id)==='done')return;
      if(states.get(id)==='visiting')fail(chain.join(' → '),'import cycle reaches '+id);
      states.set(id,'visiting');
      var spec=byId.get(id);
      sections(spec).forEach(function(sec,si){
        var d=sec.diagram,at=id+' section '+(sec.id || si),imports=d.topologyImports || [],provenance=[],defaultPlacements=Object.create(null);
        var namespaces=new Set();
        imports.forEach(function(imp){
          var where=at+' import '+imp.as+' ('+imp.spec+' export '+imp.export+')',prefix=imp.as+'::';
          if(namespaces.has(imp.as))fail(where,'duplicate namespace '+imp.as);namespaces.add(imp.as);
          if(!byId.has(imp.spec))fail(where,'missing spec '+imp.spec);
          visit(imp.spec,chain.concat(where));
          var source=exportsById.get(imp.spec).get(imp.export);
          if(!source)fail(where,'missing export '+imp.export);
          var provider=source.d,exp=clone(source.exp),nodes=provider.nodes || {};
          ['nodes','edges'].forEach(function(key){
            if(!own(imp,key))return;
            imp[key].forEach(function(identity){if(!exp[key].includes(identity))fail(where,'selected '+key+' identity is not exported: '+identity);});
            // Provider order, not checkbox order, defines deterministic geometry.
            exp[key]=exp[key].filter(function(identity){return imp[key].includes(identity);});
          });
          if(!exp.nodes.length)fail(where,'select at least one exported node');
          var selected=new Set(exp.nodes);
          Object.keys(imp.nodePositions || {}).forEach(function(key){
            if(!selected.has(key))fail(where,'nodePositions identity is not selected/exported: '+key);
          });
          if(d.nodes==null)d.nodes={};if(!object(d.nodes))fail(where,'consumer nodes must be an object');
          if(d.edges==null)d.edges=[];if(!Array.isArray(d.edges))fail(where,'consumer edges must be an array');
          if(d.rows==null || Array.isArray(d.rows) && !d.rows.length)d.rows=[[]];
          if(!Array.isArray(d.rows) || d.rows.some(function(row){return !Array.isArray(row) || row.some(function(slot){return typeof slot!=='string' && (!Array.isArray(slot) || slot.some(function(key){return typeof key!=='string';}));});}))fail(where,'broken consumer row placement');
          // Default each block below existing content. Explicit positions are
          // absolute origins, so provider size changes never reset a saved drag.
          // Custom centers must not push subsequent automatically placed imports.
          // Use provider-derived centers only to choose their default origins.
          var placementDiagram=Object.assign({},d,{floats:(d.floats || []).map(function(f){return defaultPlacements[f.id] || f;})});
          var parentLayout=layout(placementDiagram),bottom=0;
          Object.keys(parentLayout.pos).forEach(function(key){var p=parentLayout.pos[key];bottom=Math.max(bottom,p.cy+p.h/2);});
          var position=imp.position?clone(imp.position):{x:LEFT_X,y:bottom+80};
          if(Object.keys(d.nodes).some(function(key){return key.startsWith(prefix);}))fail(where,'namespace collision with existing node '+prefix);
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
            var edge=clone(matches[0]);
            if(!selected.has(edge.from) || !selected.has(edge.to))fail(where,'exported edge '+key+' must include both endpoints in exported nodes');
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
          provenance.push({spec:imp.spec,export:imp.export,as:imp.as,position:position,nodes:nodeIds,edges:edgeIds,groups:Object.keys(groups).map(function(key){return prefix+key;})});
          // Retain nested provenance as derived editor metadata so the
          // Workbench can frame both the outer reference and its inner source
          // blocks. The direct import stays first and remains the authored
          // removal/placement owner for every member.
          ((provider.topologyProvenance || {}).imports || []).forEach(function(nested){
            var nestedNodes=(nested.nodes || []).map(function(key){return prefix+key;}).filter(function(key){return nodeIds.includes(key);});
            var nestedEdges=(nested.edges || []).map(function(key){var parts=key.split('->');return prefix+parts[0]+'->'+prefix+parts[1];}).filter(function(key){return edgeIds.includes(key);});
            var nestedGroups=(nested.groups || []).map(function(key){return prefix+key;}).filter(function(key){return own(d.groups || {},key);});
            if(nestedNodes.length)provenance.push({spec:nested.spec,export:nested.export,as:imp.as+'::'+nested.as,position:position,nodes:nestedNodes,edges:nestedEdges,groups:nestedGroups});
          });
        });
        if(provenance.length)d.topologyProvenance={version:1,imports:provenance};
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
      var errors=FlowCanon.validate(spec).concat(validate(normalize(spec)).errors);
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
      stepKeys(s).forEach(function(id){edge(id,where);});Object.keys(stepFailures(s)).forEach(function(id){edge(id,where+' failures');});
      stepNodes(s).concat(Object.keys(stepTonePatch(s) || {})).forEach(function(id){node(id,where);});
      Object.keys(stepPanelPatch(s) || {}).concat(Object.keys(s.panelVisibility || {})).forEach(function(id){
        if(!(d.panels || []).some(function(p){return p && p.id===id;}))fail(at,where+' references missing panel '+id);
      });
      if(s.traceMatch && s.traceMatch.nodeId)node(s.traceMatch.nodeId,where+' traceMatch');
      (s.conditions || []).forEach(function(c){if(c.nodeId)node(c.nodeId,where+' condition');});
    });
  }
  function origin(d,kind,id){
    return (((d || {}).topologyProvenance || {}).imports || []).find(function(imp){return (imp[kind] || []).includes(id);});
  }
  function protectedStructure(d){
    var imports=((d.topologyProvenance || {}).imports || []),nodes=[],edges=[],groups=[];
    imports.forEach(function(imp){nodes.push.apply(nodes,imp.nodes || []);edges.push.apply(edges,imp.edges || []);groups.push.apply(groups,imp.groups || []);});
    return {provenance:d.topologyProvenance,nodes:nodes.map(function(id){return [id,(d.nodes || {})[id]];}),
      edges:edges.map(function(id){return [id,(d.edges || []).filter(function(e){return edgeKey(e)===id;})];}),
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
        error='Imported topology is read only in this snapshot. Edit its provider and rebuild canon; consumer steps, paths, failures, and panels remain editable.';
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
      if(!canon)page.canon={version:1,id:'local-export',kind:'design',owner:'group:default/local'};
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
    input.page.canon=clone(original.page.canon);
    var inputs=context.specs.map(function(spec){return spec.page.canon.id===context.id?input:spec;});
    var result=materialize(inputs).find(function(spec){return spec.page.canon.id===context.id;});
    return mode==='wrapped'?result:mode==='diagram'?result.page.sections[0].diagram:result.page;
  }
  return {materialize:materialize,hasDeclarations:declarations,origin:origin,editError:editError,dependencies:dependencies,resolveSource:resolveSource};
})();
FlowCanon.materializeTopology=FlowTopology.materialize;
FlowCanon.topologyDependencies=FlowTopology.dependencies;
