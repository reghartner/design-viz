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
    FlowArrangeGraph.arrangeGraph({nodes:ids.map(function(id){var node=d.nodes[id],textBox=node.type==='text' && (Object.prototype.hasOwnProperty.call(node,'text') || Object.prototype.hasOwnProperty.call(node,'textStyle')),size=textBox?textBoxSize(node):{w:150,h:44};return {id:id,width:size.w,height:size.h};}),edges:d.edges || []},options);
  if(ids.some(function(id){return d.nodes[id].locked===true;}))result=autoArrangeAroundLocked(d,result);
  if(result.metrics.cardIntrusions)throw new Error('Some connections could not be routed clear of nodes. The source is unchanged.');
  if(!validGraphFrame(result.frame) || result.edges.some(function(e){return !validCurveControls(e.curveControls) || !validEdgePort(e.fromPort) || !validEdgePort(e.toPort);}))
    throw new Error('The layout exceeds the editable geometry limits. The source is unchanged.');
  return result;
}
function autoArrangeAroundLocked(d,result){
  var rendered=layout(d).pos,locked=Object.keys(d.nodes || {}).filter(function(id){return d.nodes[id].locked===true && rendered[id];});
  if(!locked.length)return result;
  var proposed=new Map(result.positions.map(function(p){return [p.id,Object.assign({},p)];}));
  var baseLocked=locked.map(function(id){return proposed.get(id);}).filter(Boolean),dx=0,dy=0;
  if(baseLocked.length){
    dx=locked.reduce(function(sum,id){return sum+rendered[id].cx;},0)/locked.length-baseLocked.reduce(function(sum,p){return sum+p.x;},0)/baseLocked.length;
    dy=locked.reduce(function(sum,id){return sum+rendered[id].cy;},0)/locked.length-baseLocked.reduce(function(sum,p){return sum+p.y;},0)/baseLocked.length;
  }
  var occupied=locked.map(function(id){var p=rendered[id];return {id:id,x:p.cx,y:p.cy,width:p.w,height:p.h,locked:true};});
  function overlaps(a,b){return Math.abs(a.x-b.x)<(a.width+b.width)/2+24 && Math.abs(a.y-b.y)<(a.height+b.height)/2+24;}
  function available(p){return !occupied.some(function(other){return overlaps(p,other);});}
  result.positions.slice().sort(function(a,b){return a.id<b.id?-1:a.id>b.id?1:0;}).forEach(function(source){
    if(locked.indexOf(source.id)>=0)return;
    var size=rendered[source.id] || source,p=Object.assign({},source,{x:source.x+dx,y:source.y+dy,width:size.w || source.width,height:size.h || source.height});
    if(!available(p)){
      var origin={x:p.x,y:p.y},found=false,step=40;
      for(var ring=1;ring<=80 && !found;ring++){
        for(var x=-ring;x<=ring && !found;x++)for(var y=-ring;y<=ring && !found;y++){
          if(Math.abs(x)!==ring && Math.abs(y)!==ring)continue;
          p.x=origin.x+x*step;p.y=origin.y+y*step;if(available(p))found=true;
        }
      }
      if(!found)throw new Error('Auto arrange could not place unlocked nodes around the locked positions. Unlock a node or move it, then try again.');
    }
    occupied.push(p);
  });
  var finalPositions=occupied.map(function(p){return {id:p.id,x:p.x,y:p.y,width:p.width,height:p.height};}).sort(function(a,b){return a.id<b.id?-1:a.id>b.id?1:0;}),index=new Map(finalPositions.map(function(p,i){return [p.id,i];}));
  var pairs=(d.edges || []).map(function(e){return [index.get(e.from),index.get(e.to)];}),order=pairs.map(function(_,i){return i;}).sort(function(a,b){return pairs[a][0]-pairs[b][0] || pairs[a][1]-pairs[b][1] || a-b;});
  var routed=FlowArrangeRouting.route(finalPositions,order.map(function(i){return pairs[i];})),routes=Array(pairs.length);order.forEach(function(old,i){routes[old]=routed.edges[i];});
  var probe=JSON.parse(JSON.stringify(d));probe.rows=[[]];probe.floats=finalPositions.map(function(p){return {id:p.id,side:'below',x:p.x,y:p.y,noSpread:true};});
  var boxes=Object.values(layout(probe).groups),left=Math.min.apply(null,finalPositions.map(function(p){return p.x-p.width/2;}).concat(boxes.map(function(b){return b.x;}),routed.bounds?[routed.bounds.left]:[]))-32;
  var top=Math.min.apply(null,finalPositions.map(function(p){return p.y-p.height/2;}).concat(boxes.map(function(b){return b.y;}),routed.bounds?[routed.bounds.top]:[]))-32;
  var right=Math.max.apply(null,finalPositions.map(function(p){return p.x+p.width/2;}).concat(boxes.map(function(b){return b.x+b.w;}),routed.bounds?[routed.bounds.right]:[]))+32;
  var bottom=Math.max.apply(null,finalPositions.map(function(p){return p.y+p.height/2;}).concat(boxes.map(function(b){return b.y+b.h;}),routed.bounds?[routed.bounds.bottom]:[]))+32;
  return {positions:finalPositions,edges:routes,frame:{x:Math.floor(left),y:Math.floor(top),w:Math.ceil(right)-Math.floor(left),h:Math.ceil(bottom)-Math.floor(top)},metrics:Object.assign({},result.metrics,routed.metrics)};
}
var AUTO_ARRANGE_EDGE_FIELDS=['bend','curvePoints','curveControls','fromPort','toPort','fromDx','fromDy','toDx','toDy','labelDx','labelDy'];
function autoArrangeDiagram(d,result){
  var copy=JSON.parse(JSON.stringify(d)),oldFloats=new Map((copy.floats || []).map(function(f){return [f.id,f];}));
  copy.rows=[[]];copy.floats=result.positions.map(function(p){
    var entry=Object.assign({},oldFloats.get(p.id),{id:p.id,side:'below',x:p.x,y:p.y});
    ['dx','dy','noSpread'].forEach(function(k){delete entry[k];});
    if(copy.nodes[p.id] && copy.nodes[p.id].locked===true)entry.noSpread=true;
    return entry;
  });
  copy.edges=(copy.edges || []).map(function(e,i){
    AUTO_ARRANGE_EDGE_FIELDS.forEach(function(k){delete e[k];});
    // Only geometry can replace authored edge data, even for direct API callers.
    ['fromPort','toPort','curveControls','labelDx','labelDy'].forEach(function(k){if(result.edges[i][k]!=null)e[k]=result.edges[i][k];});return e;
  });
  copy.graphFrame=result.frame;
  if(copy.routing==='lanes')delete copy.routing;
  return copy;
}

var autoArrangeGraph=FlowArrangeGraph.arrangeGraph;
