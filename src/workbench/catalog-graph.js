/* Catalog graph planning is data-only. Identity comes from the approved snapshot;
   catalog dependencies describe structure, never an observed execution sequence. */
function catalogGraphProtocol(){return {label:'Catalog relationship',color:{aurora:'#94A3B8',daylight:'#64748B'}};}

function catalogGraphSeed(catalog, refs, connect, diagram, edgeKind){
  var registry=FlowCanon.catalog(catalog), byRef=new Map(), selected=new Set();
  registry.services.forEach(function(service){
    var key=service.entityRef.toLowerCase();
    if(byRef.has(key))throw new Error('Catalog contains duplicate service identities: '+key);
    byRef.set(key,service);
  });
  refs.forEach(function(ref){
    var key=ref.toLowerCase();
    if(!byRef.has(key))throw new Error('A selected service is no longer in the catalog. Reopen the picker.');
    selected.add(key);
  });
  if(!selected.size)throw new Error('Select at least one service.');
  var services=registry.services.filter(function(s){return selected.has(s.entityRef.toLowerCase());});
  var next=builderClone(diagram || {nodes:{},rows:[],edges:[],steps:[]});
  next.nodes=next.nodes || {};next.rows=next.rows || [];next.edges=next.edges || [];
  var ids=new Map(), placed=new Set(builderFlatRowIds(next.rows));
  (next.floats || []).forEach(function(f){placed.add(f.id);});
  Object.keys(next.nodes).forEach(function(id){
    var binding=next.nodes[id].binding;
    if(binding && typeof binding.entityRef==='string' && !ids.has(binding.entityRef.toLowerCase()))ids.set(binding.entityRef.toLowerCase(),id);
  });
  var created=0,reused=0,newIds=[];
  services.forEach(function(service){
    var key=service.entityRef.toLowerCase(),id=ids.get(key);
    if(id)reused++;
    else{
      var stem=service.entityRef.split('/').pop().replace(/[^a-z0-9_-]/gi,'-') || 'service';
      id=builderUniqueKey(next.nodes,stem+'-');
      next.nodes[id]={title:service.title || service.entityRef,icon:'server',tint:'cmd',binding:FlowCanon.binding(registry,service.entityRef)};
      ids.set(key,id);created++;
    }
    if(!placed.has(id)){newIds.push(id);placed.add(id);}
  });
  var pairs=new Set(next.edges.map(function(e){return e.from+'->'+e.to;})),addedEdges=[];
  function edge(from,to,label){
    var a=ids.get(from),b=ids.get(to),key=a+'->'+b;
    if(from===to || !selected.has(to) || pairs.has(key))return;
    pairs.add(key);var item={from:a,to:b,kind:edgeKind || 'catalog',label:label};next.edges.push(item);addedEdges.push(item);
  }
  if(connect){
    var providers=new Map();
    services.forEach(function(s){(s.apis || []).forEach(function(api){
      var ref=api.entityRef.toLowerCase();if(!providers.has(ref))providers.set(ref,[]);
      providers.get(ref).push({service:s.entityRef.toLowerCase(),title:api.title || api.entityRef});
    });});
    services.forEach(function(s){
      var from=s.entityRef.toLowerCase();
      (s.dependsOn || []).forEach(function(to){edge(from,to.toLowerCase(),'depends on');});
      (s.consumesApis || []).forEach(function(api){
        (providers.get(api.toLowerCase()) || []).forEach(function(provider){edge(from,provider.service,'uses '+provider.title);});
      });
    });
  }
  /* Stable dependency order, four cards per row, left to right. Cycles retain
     every selected node and connection; breaking an ordering tie drops no data. */
  var remaining=new Set(newIds),incoming=new Map(newIds.map(function(id){return [id,new Set()];}));
  next.edges.forEach(function(e){if(remaining.has(e.from) && remaining.has(e.to))incoming.get(e.to).add(e.from);});
  var ordered=[];
  while(remaining.size){
    var candidates=Array.from(remaining).filter(function(id){return !Array.from(incoming.get(id)).some(function(from){return remaining.has(from);});});
    var id=candidates[0] || remaining.values().next().value;ordered.push(id);remaining.delete(id);
  }
  if(ordered.length){
    if(next.rows.length===1 && next.rows[0].length===0)next.rows=[];
    for(var i=0;i<ordered.length;i+=4)next.rows.push(ordered.slice(i,i+4));
  }
  if(!diagram)next.routing='lanes';
  return {diagram:next,created:created,reused:reused,edges:addedEdges.length,placed:newIds.length};
}

function planCatalogGraph(text,raw,section,catalog,refs,connect){
  var got=builderDiagram(text,raw,section);if(got.error)return got;
  try{
    var page=raw.page || raw,protocols=builderClone(page.protocols || {}),definition=catalogGraphProtocol();
    var kind=Object.keys(protocols).find(function(key){return JSON.stringify(protocols[key])===JSON.stringify(definition);}) || 'catalog';
    if(protocols[kind] && JSON.stringify(protocols[kind])!==JSON.stringify(definition))kind=builderUniqueKey(protocols,'catalog-');
    var seed=catalogGraphSeed(catalog,refs,connect,got.d,kind);
    if(!seed.created && !seed.edges && !seed.placed)return {error:'Those services and connections are already in this diagram.'};
    if(!got.path.length && seed.edges){
      protocols[kind]=definition;
      return Object.assign(jsonReplaceValue(text,[],JSON.stringify({protocols:protocols,sections:[{diagram:seed.diagram}]},null,2)),{kind:'section',index:0});
    }
    var plan=jsonReplaceValue(text,got.path,JSON.stringify(seed.diagram,null,2));
    if(!plan)return {error:'Could not update the selected diagram.'};
    if(seed.edges && !protocols[kind]){
      protocols[kind]=definition;
      plan=jsonSetField(plan.text,raw.page?['page']:[],'protocols',JSON.stringify(protocols,null,2));
      if(!plan)return {error:'Could not add the catalog relationship legend.'};
    }
    return Object.assign(plan,{kind:'section',index:section});
  }catch(ex){return {error:ex.message};}
}
