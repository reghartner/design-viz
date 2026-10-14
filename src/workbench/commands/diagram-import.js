/* Graph-only import shares clipboard identity/protocol mapping. Publication is
   surgical: narrative, panels, view definitions and surrounding bytes survive. */
function builderDiagramImportRecognized(text){
  if(typeof text!=='string')return false;
  var value=text.trim();
  if(new TextEncoder().encode(value).byteLength>BUILDER_CLIPBOARD_LIMIT)return false;
  if(drawioImportRecognized(value))return true;
  if(/^(?:(?:%%[^\n]*\n)\s*)*(?:sequenceDiagram|flowchart|graph)(?:\s|$)/.test(value) || /^```mermaid\s*$/m.test(value))return true;
  if(value[0]!=='{' || new TextEncoder().encode(value).byteLength>BUILDER_CLIPBOARD_LIMIT)return false;
  try{var raw=JSON.parse(value);return specSectionPaths(raw).some(function(rec){var d=specValueAt(raw,rec.diagram);return d && builderClipboardObject(d.nodes) && Array.isArray(d.rows);});}catch(ex){return false;}
}
function prepareBuilderDiagramImport(text){
  try{
    if(typeof text!=='string' || new TextEncoder().encode(text).byteLength>BUILDER_CLIPBOARD_LIMIT)throw new Error('Diagram input exceeds 2 MiB.');
    var raw,todos=[];
    if(text.trim()[0]==='{')raw=JSON.parse(text);
    else {raw=mermaidToSpec(text,{strictIds:true});todos=raw.todos || [];if(todos.some(function(todo){return /block not converted/.test(todo);}))throw new Error('Mermaid conditional and loop blocks cannot be merged without losing connections. Expand the messages into a sequenceDiagram first.');}
    if(!normalize(raw))throw new Error('Choose a Flowview JSON diagram, Mermaid sequenceDiagram, or flowchart.');
    var sections=specSectionPaths(raw).map(function(rec,index){
      var d=specValueAt(raw,rec.diagram),s=specValueAt(raw,rec.section);
      return d && d.nodes ? {index:index,label:s && s.heading || 'Section '+(index+1)} : null;
    }).filter(Boolean);
    if(!sections.length)throw new Error('This source contains no diagrams.');
    return {raw:raw,sections:sections,todos:todos};
  }catch(ex){return {error:ex.message};}
}
async function prepareBuilderDiagramImportAsync(text,options){
  if(!drawioImportRecognized(text))return prepareBuilderDiagramImport(text);
  try{
    var raw=await drawioToSpec(text,Object.assign({},options,{maxBytes:BUILDER_CLIPBOARD_LIMIT}));
    return {raw:raw,sections:raw.page.sections.map(function(section,index){return {index:index,label:section.heading};}),todos:raw.todos};
  }catch(ex){return {error:ex.message};}
}
function planAddBuilderDiagram(text,raw,source,sourceSection,destination,point,validateSource){
  try{
    var rec=specSectionPaths(source)[sourceSection],d=rec && specValueAt(source,rec.diagram);
    var got=builderDiagram(text,raw,destination);if(got.error)return got;
    if(!d || !builderClipboardObject(d.nodes) || !Object.keys(d.nodes).length)throw new Error('Choose a source diagram containing nodes.');
    function own(obj,key){return Object.prototype.hasOwnProperty.call(obj || {},key);}
    if(!Array.isArray(d.rows) || !d.rows.length)throw new Error('Source rows must be a nonempty array.');
    ['floats','edges'].forEach(function(key){if(own(d,key) && !Array.isArray(d[key]))throw new Error('Source '+key+' must be an array.');});
    if(own(d,'groups') && !builderClipboardObject(d.groups))throw new Error('Source groups must be an object.');
    function dependencies(value){
      if(!value || typeof value!=='object')return;
      if(own(value,'$ref'))throw new Error('Resolve local $ref dependencies in the source before adding this diagram.');
      Object.keys(value).forEach(function(key){dependencies(value[key]);});
    }
    dependencies({nodes:d.nodes,groups:d.groups,rows:d.rows,floats:d.floats,edges:d.edges,protocols:normalize(source).protocols});
    if((d.topologyImports || []).length || d.topologyProvenance)throw new Error('This diagram depends on shared topology. Export a resolved standalone snapshot before adding it.');
    if((got.d.topologyImports || []).length)throw new Error('Adding a diagram to a shared-topology canvas requires a resolved standalone destination.');
    var groups=d.groups || {},ids=Object.keys(d.nodes);
    var placements=Object.create(null);
    function placement(id){if(typeof id!=='string' || !own(d.nodes,id))throw new Error('Source placement has an unknown node.');if(own(placements,id))throw new Error('Source node has more than one placement: '+id);placements[id]=true;}
    d.rows.forEach(function(row){if(!Array.isArray(row))throw new Error('Source rows must contain arrays of nodes.');row.forEach(function(slot){if(Array.isArray(slot))slot.forEach(placement);else placement(slot);});});
    (d.floats || []).forEach(function(f){if(!builderClipboardObject(f))throw new Error('Invalid source float.');placement(f.id);});
    ids.forEach(function(id){
      var node=d.nodes[id];if(!builderClipboardObject(node))throw new Error('Invalid source node '+id+'.');
      if(node.group && !own(groups,node.group))throw new Error('Source node has an unknown group: '+node.group);
      if(node.handoff && node.handoff.localSection || node.detail && (node.detail.section && !node.detail.spec || node.detail.stepMap) || typeof node.link==='string' && /^#/.test(node.link))
        throw new Error('Source node '+id+' depends on local sections or timeline references. Convert those to external links before merging only its graph.');
    });
    Object.keys(groups).forEach(function(id){var seen=Object.create(null),cursor=id;while(cursor){if(seen[cursor])throw new Error('Source groups contain a cycle.');seen[cursor]=true;if(!own(groups,cursor))throw new Error('Source group has an unknown parent: '+cursor);if(!builderClipboardObject(groups[cursor]))throw new Error('Invalid source group '+cursor+'.');cursor=groups[cursor].parent;}});
    (d.edges || []).forEach(function(e){if(!e || !own(d.nodes,e.from) || !own(d.nodes,e.to))throw new Error('Source connection has an unknown endpoint.');if(own(e,'revealAt') || own(e,'hideAt'))throw new Error('Source connections depend on timeline reveal/hide positions. Remove those dependencies before merging only the graph.');});
    var protocols=resolveProtocols(normalize(source));
    (d.edges || []).forEach(function(e){if(!own(protocols,e.kind || 'int'))throw new Error('Source connection uses an undefined protocol: '+e.kind);});
    // Build the complete graph envelope, retaining unused groups and every
    // placement rather than silently filtering broken references during Copy.
    var data={format:BUILDER_CLIPBOARD_FORMAT,version:1,kind:'nodes',value:{nodes:d.nodes,groups:groups,rows:d.rows || [],floats:d.floats || [],edges:d.edges || []},protocols:Object.create(null)};
    (d.edges || []).forEach(function(e){var key=e.kind || 'int';data.protocols[key]=protocols[key];});
    var mapped=planPasteBuilderClipboard(text,raw,data,{section:destination},validateSource);if(mapped.error)return mapped;
    var next=JSON.parse(mapped.text),nextRec=specSectionPaths(next)[destination],merged=specValueAt(next,nextRec.diagram);
    var added=Object.keys(merged.nodes).filter(function(id){return !own(got.d.nodes,id);});
    var addedSet=Object.create(null);added.forEach(function(id){addedSet[id]=true;});
    var graph={nodes:Object.create(null),groups:merged.groups || {},rows:merged.rows.slice((got.d.rows || []).length),floats:(merged.floats || []).filter(function(f){return own(addedSet,f.id);}),edges:merged.edges.slice((got.d.edges || []).length)};
    added.forEach(function(id){graph.nodes[id]=merged.nodes[id];});
    if(!graph.rows.length)graph.rows=[[]];
    var positions=layout(graph).pos,existing=layout(Object.assign({},got.d,{rows:got.d.rows.length?got.d.rows:[[]]})).pos;
    var boxes=added.map(function(id){return positions[id];});
    if(boxes.some(function(p){return !p;}))throw new Error('Some source nodes have no supported placement.');
    var left=Math.min.apply(null,boxes.map(function(p){return p.cx-p.w/2;})),top=Math.min.apply(null,boxes.map(function(p){return p.cy-p.h/2;}));
    var right=Math.max.apply(null,[0].concat(Object.keys(existing).map(function(id){return existing[id].cx+existing[id].w/2;})));
    var dx=(point?point.x:right+100)-left,dy=(point?point.y:42)-top;
    var floats=(got.d.floats || []).slice();
    added.forEach(function(id){var p=positions[id],original=graph.floats.find(function(f){return f.id===id;}) || {},f=Object.assign({},original,{id:id,side:'below',x:p.cx+dx,y:p.cy+dy,noSpread:true});delete f.dx;delete f.dy;if(!floatCoordinate(f.x)||!floatCoordinate(f.y))throw new Error('The imported graph would exceed the canvas coordinate limits.');floats.push(f);});
    var pairs=[['nodes',JSON.stringify(merged.nodes)],['groups',JSON.stringify(merged.groups || {})],['floats',JSON.stringify(floats)],['edges',JSON.stringify(merged.edges)]];
    if(!got.d.rows.length)pairs.push(['rows','[[]]']);
    var result=planSetFields(text,raw,got.path,pairs);if(result.error)return result;
    var nextPage=next.page || next,oldPage=raw.page || raw;
    if(JSON.stringify(nextPage.protocols)!==JSON.stringify(oldPage.protocols)){
      if(!got.path.length){
        // A bare diagram has no page-level protocol declaration slot.
        result={text:'{"page":{"title":"","sections":[{"diagram":'+result.text+'}],"protocols":'+JSON.stringify(nextPage.protocols)+'}}'};
      }else {var changed=jsonSetField(result.text,raw.page?['page']:[],'protocols',JSON.stringify(nextPage.protocols));if(!changed)throw new Error('Could not add protocol definitions.');result=changed;}
    }
    var errors=builderValidateSource(JSON.parse(result.text),validateSource).errors;if(errors.length)throw new Error(errors[0]);
    result.targets=added.map(function(id){return {kind:'node',section:destination,id:id};});result.target=result.targets[0];
    result.counts={nodes:added.length,groups:Object.keys(groups).length,edges:(d.edges || []).length};return result;
  }catch(ex){return {error:'Diagram was not added: '+ex.message};}
}
