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
    diagramLayoutViews, sectionLayoutItems, foldNodeTones, foldPanelStates, layout, lintPage,
    stepNodes, stepPanelPatch, stepTonePatch, storyTimeConfig, storyTimeSequence,
    storyTimeLabel, storyBatteryConstants, storyBatteryConstantSources};
}

/* Export only the rendered graph geometry. This is deliberately built from a
   fixed allowlist instead of copying and redacting the source document. */
var ANONYMOUS_LAYOUT_FORMAT='flowview-layout-v1';
function anonymousLayoutFailure(errors){
  if(errors.some(function(message){return /\.edges\[\d+\]\.(from|to):/.test(message);}))
    return 'Input has an edge whose endpoint is not a placed node.';
  if(errors.some(function(message){return /\.edges\[\d+\].*(curve|Port)/.test(message);}))
    return 'Input has malformed edge geometry.';
  if(errors.some(function(message){return /free placement requires/.test(message);}))
    return 'Input has malformed node coordinates.';
  return 'Input is not a valid FlowSpec.';
}
function anonymousLayoutSafeNodeId(id){
  return typeof id==='string' && id.length>0 && !Object.prototype.hasOwnProperty.call(Object.prototype,id);
}
function anonymousLayoutPath(path){
  var number='-?(?:\\d+\\.?\\d*|\\.\\d+)(?:e[+-]?\\d+)?';
  return new RegExp('^M '+number+' '+number+'(?: (?:L '+number+' '+number+'|C '+number+' '+number+' '+number+' '+number+' '+number+' '+number+'))*$','i').test(path);
}
function exportAnonymousLayout(raw){
  var verdict=validateSpec(raw);
  if(verdict.errors.length)throw new Error(anonymousLayoutFailure(verdict.errors));
  var page=normalize(raw);
  var diagrams=sectionRecords(page).map(function(record){return record.section && record.section.diagram;}).filter(Boolean);
  if(!diagrams.length)throw new Error('Input FlowSpec has no diagrams.');
  return {format:ANONYMOUS_LAYOUT_FORMAT,diagrams:diagrams.map(function(d,index){
    var nodeIds=Object.keys(d.nodes || {}),idMap=new Map();
    nodeIds.forEach(function(id,i){
      if(!anonymousLayoutSafeNodeId(id))throw new Error('Diagram '+(index+1)+' has an unsupported node identifier.');
      idMap.set(id,i+1);
    });
    function knownReference(id){return anonymousLayoutSafeNodeId(id) && idMap.has(id);}
    (d.rows || []).forEach(function(row){
      row.forEach(function(slot){
        (Array.isArray(slot)?slot:[slot]).forEach(function(id){
          if(!knownReference(id))throw new Error('Diagram '+(index+1)+' has a malformed node placement.');
        });
      });
    });
    (d.floats || []).forEach(function(item){
      if(!item || !knownReference(item.id))throw new Error('Diagram '+(index+1)+' has a malformed node placement.');
    });
    (d.edges || []).forEach(function(edge){
      if(!edge || !knownReference(edge.from) || !knownReference(edge.to))
        throw new Error('Diagram '+(index+1)+' has a malformed edge reference.');
    });
    var L,adjust;
    try{
      L=layout(d);
      adjust=L.routing==='lanes'?laneRoutes(d,L):edgeAutoAdjust(d.edges || [],L);
      if(L.routing!=='lanes')resolveEdgeAvoidance(d.edges || [],L,adjust);
      expandPlacedEdgeBounds(d.edges || [],L,adjust);
    }catch(ignored){throw new Error('Unable to compute diagram '+(index+1)+' geometry.');}
    var nodes=nodeIds.map(function(id){
      if(!Object.prototype.hasOwnProperty.call(L.pos,id))
        throw new Error('Diagram '+(index+1)+' contains an unplaced node.');
      var p=L.pos[id],values=[p.cx,p.cy,p.w,p.h];
      if(!values.every(Number.isFinite) || p.w<=0 || p.h<=0)
        throw new Error('Diagram '+(index+1)+' produced invalid node geometry.');
      return {id:idMap.get(id),x:p.cx-p.w/2,y:p.cy-p.h/2,width:p.w,height:p.h};
    });
    var edges=(d.edges || []).map(function(edge,i){
      var path;
      try{path=edgePath(edge,L,adjust[i]);}
      catch(ignored){throw new Error('Unable to compute diagram '+(index+1)+' geometry.');}
      if(typeof path!=='string' || !anonymousLayoutPath(path))
        throw new Error('Diagram '+(index+1)+' produced invalid edge geometry.');
      return {from:idMap.get(edge.from),to:idMap.get(edge.to),path:path};
    });
    return {nodes:nodes,edges:edges};
  })};
}
