/* Shared adapter for the worker, backend, authoring CLI and portable kit. */
var AUTO_ARRANGE_LIMITS={nodes:80,edges:160};
function autoArrangeInput(d){
  var ids=Object.keys(d.nodes || {}),edges=d.edges || [];
  if(!ids.length)throw new Error('Add a node before arranging this diagram.');
  if(ids.length>AUTO_ARRANGE_LIMITS.nodes || edges.length>AUTO_ARRANGE_LIMITS.edges)
    throw new Error('Auto arrange supports up to 80 nodes and 160 connections per diagram.');
  if(edges.some(function(e){return !e || ids.indexOf(e.from)<0 || ids.indexOf(e.to)<0;}))
    throw new Error('Fix connections with missing nodes before arranging.');
  return ids;
}
function autoArrangeCandidates(d,options){
  var ids=autoArrangeInput(d);options=FlowArrangeGraph.optionsChecked(options || {});
  var result=ids.some(function(id){return !!d.nodes[id].group;})?FlowArrangeGroups.arrange(d,options):
    FlowArrangeGraph.arrangeGraph({nodes:ids.map(function(id){return {id:id,width:150,height:44};}),edges:d.edges || []},options);
  if(result.metrics.cardIntrusions)throw new Error('Some connections could not be routed clear of nodes. The source is unchanged.');
  if(!validGraphFrame(result.frame) || result.edges.some(function(e){return !validCurveControls(e.curveControls) || !validEdgePort(e.fromPort) || !validEdgePort(e.toPort);}))
    throw new Error('The layout exceeds the editable geometry limits. The source is unchanged.');
  return result;
}
function autoArrangeDiagram(d,result){
  var copy=JSON.parse(JSON.stringify(d)),oldFloats=new Map((copy.floats || []).map(function(f){return [f.id,f];}));
  copy.rows=[[]];copy.floats=result.positions.map(function(p){
    var entry=Object.assign({},oldFloats.get(p.id),{id:p.id,side:'below',x:p.x,y:p.y});
    ['dx','dy','noSpread'].forEach(function(k){delete entry[k];});return entry;
  });
  copy.edges=(copy.edges || []).map(function(e,i){
    ['bend','curvePoints','curveControls','fromPort','toPort','fromDx','fromDy','toDx','toDy','labelDx','labelDy'].forEach(function(k){delete e[k];});
    // Only geometry can replace authored edge data, even for direct API callers.
    ['fromPort','toPort','curveControls','labelDx','labelDy'].forEach(function(k){if(result.edges[i][k]!=null)e[k]=result.edges[i][k];});return e;
  });
  copy.graphFrame=result.frame;
  if(copy.routing==='lanes')delete copy.routing;
  return copy;
}

var autoArrangeGraph=FlowArrangeGraph.arrangeGraph;
