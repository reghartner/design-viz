/* Bounded deterministic layout search. Runs in a worker; this pure module is
   also exercised against the final viewer geometry in Node tests. */
var AUTO_ARRANGE_LIMITS={nodes:80,edges:160};
var AUTO_ARRANGE_COMPACT_LIMITS={nodes:24,edges:48};
var AUTO_ARRANGE_CARD_GAP=54,AUTO_ARRANGE_RANK_GAP=72,AUTO_ARRANGE_LINK_DISTANCE=300;
function autoArrangeInput(d){
  var ids=Object.keys(d.nodes || {}),edges=d.edges || [];
  if(!ids.length)throw new Error('Add a node before arranging this diagram.');
  if(ids.length>AUTO_ARRANGE_LIMITS.nodes || edges.length>AUTO_ARRANGE_LIMITS.edges)
    throw new Error('Auto arrange supports up to 80 nodes and 160 connections per diagram.');
  if(edges.some(function(e){return !e || ids.indexOf(e.from)<0 || ids.indexOf(e.to)<0;}))
    throw new Error('Fix connections with missing nodes before arranging.');
  return ids;
}
function autoArrangeDiagram(d,result){
  var copy=JSON.parse(JSON.stringify(d));copy.rows=[[]];
  copy.floats=result.positions.map(function(p){return {id:p.id,side:'below',x:p.x,y:p.y};});
  delete copy.routing;
  copy.edges=(copy.edges || []).map(function(e,i){
    ['bend','curvePoints','curveControls','fromPort','toPort','fromDx','fromDy','toDx','toDy','labelDx','labelDy','labelAt'].forEach(function(k){delete e[k];});
    return Object.assign(e,result.edges[i]);
  });return copy;
}
function autoArrangePort(node,point){
  var choices=[['top',Math.abs(point.y-(node.cy-node.h/2))],['right',Math.abs(point.x-(node.cx+node.w/2))],
    ['bottom',Math.abs(point.y-(node.cy+node.h/2))],['left',Math.abs(point.x-(node.cx-node.w/2))]];
  choices.sort(function(a,b){return a[1]-b[1];});var side=choices[0][0],horizontal=side==='top' || side==='bottom';
  return {side:side,offset:Math.max(0,Math.min(1,horizontal?(point.x-node.cx+node.w/2)/node.w:(point.y-node.cy+node.h/2)/node.h))};
}
function autoArrangeDot(d,direction,positions,aspect){
  var ids=autoArrangeInput(d),groups=Object.assign(Object.create(null),d.groups || {});
  ids.forEach(function(id){var key=d.nodes[id].group;if(key && !groups[key])groups[key]={};});
  var gids=Object.keys(groups),parents=sanitizedGroupParents(groups);
  function quote(s){return JSON.stringify(String(s)).replace(/\\u202[89]/g,' ');}
  function node(id){var p=positions && positions[id];return 'n'+ids.indexOf(id)+' [label=""'+(p?',pos="'+p.x+','+(-p.y)+'!"':'')+'];';}
  function group(g){return 'subgraph cluster_'+gids.indexOf(g)+' {label='+quote(groups[g].title || g)+';margin=24;'+
    gids.filter(function(c){return parents[c]===g;}).map(group).join('')+
    ids.filter(function(id){return d.nodes[id].group===g;}).map(node).join('')+'}';}
  var source='digraph G {graph [rankdir='+direction+',compound=true,newrank=true,splines=true,overlap=true,notranslate=true,nodesep='+(AUTO_ARRANGE_CARD_GAP/72)+',ranksep='+(AUTO_ARRANGE_RANK_GAP/72)+'];'+
    (aspect?'graph [ratio='+1/aspect+'];':'')+
    'node [shape=box,fixedsize=true,width='+150/72+',height='+44/72+'];edge [dir=none,fontsize=11,fontname="Arial"];';
  if(positions)source+=ids.map(node).join('');
  else source+=gids.filter(function(g){return !parents[g];}).map(group).join('')+ids.filter(function(id){return !d.nodes[id].group;}).map(node).join('');
  source+=(d.edges || []).map(function(e,i){return 'n'+ids.indexOf(e.from)+' -> n'+ids.indexOf(e.to)+' [id="e'+i+'",xlabel='+quote(e.label || '')+'];';}).join('');
  return source+'}';
}
function autoArrangeRead(d,json){
  var ids=Object.keys(d.nodes),positions=[],edges=[],lookup=Object.create(null);
  (json.objects || []).forEach(function(n){
    if(!/^n\d+$/.test(n.name))return;var id=ids[Number(n.name.slice(1))];if(id==null)return;
    var xy=n.pos.split(',').map(Number);lookup[id]={cx:xy[0],cy:-xy[1],w:150,h:44};
    positions.push({id:id,x:xy[0],y:-xy[1]});
  });
  positions.sort(function(a,b){return ids.indexOf(a.id)-ids.indexOf(b.id);});
  var minX=Math.min.apply(null,positions.map(function(p){return p.x;}))-120;
  var minY=Math.min.apply(null,positions.map(function(p){return p.y;}))-100;
  positions.forEach(function(p){p.x-=minX;p.y-=minY;lookup[p.id].cx-=minX;lookup[p.id].cy-=minY;});
  var L={pos:lookup};
  (json.edges || []).forEach(function(e){
    var index=Number(e.id.slice(1)),original=d.edges[index],draw=(e._draw_ || []).filter(function(op){return op.op==='b' || op.op==='B';});
    if(draw.length!==1)throw new Error('A connection could not be routed.');
    var points=draw[0].points.map(function(p){return {x:p[0]-minX,y:-p[1]-minY};});
    var route={fromPort:autoArrangePort(lookup[original.from],points[0]),toPort:autoArrangePort(lookup[original.to],points[points.length-1])};
    // Keep all native controls. Port endpoints replace only the clipped ends.
    route.curveControls=points.slice(1,-1).map(function(p,i){return edgeCurvePoint(original,L,p,(i+1)/(points.length-1));});
    if(!validCurveControls(route.curveControls))throw new Error('A connection exceeds the editable curve limit.');
    if(original.label && e.xlp){
      var label=e.xlp.split(',').map(Number),sample=samplePathD(edgePath(Object.assign({},original,route),L));
      var lengths=[0];for(var k=1;k<sample.length;k++)lengths.push(lengths[k-1]+Math.hypot(sample[k].x-sample[k-1].x,sample[k].y-sample[k-1].y));
      var half=lengths[lengths.length-1]/2,j=1;while(j<lengths.length-1 && lengths[j]<half)j++;
      var t=(half-lengths[j-1])/(lengths[j]-lengths[j-1] || 1),mid={x:sample[j-1].x+(sample[j].x-sample[j-1].x)*t,y:sample[j-1].y+(sample[j].y-sample[j-1].y)*t};
      var stepped=(d.steps || []).some(function(s){return s.edge===original.from+'->'+original.to;});
      route.labelDx=label[0]-minX-mid.x;route.labelDy=-label[1]-minY+4-mid.y+(stepped?16:9);
    }
    edges[index]=route;
  });
  if(positions.length!==ids.length || edges.length!==(d.edges || []).length || edges.some(function(e){return !e;}))throw new Error('The layout did not return every node and connection.');
  return {positions:positions,edges:edges};
}
function autoArrangeScore(d,result){
  var arranged=autoArrangeDiagram(d,result),L=layout(arranged),ids=Object.keys(L.pos),overlaps=0,hits=0,crossings=0,length=0;
  function rect(p){return {x:p.cx-p.w/2,y:p.cy-p.h/2,w:p.w,h:p.h};}
  function overlap(a,b){return a.x<b.x+b.w-.1 && b.x<a.x+a.w-.1 && a.y<b.y+b.h-.1 && b.y<a.y+a.h-.1;}
  ids.forEach(function(id,i){ids.slice(i+1).forEach(function(other){if(overlap(rect(L.pos[id]),rect(L.pos[other])))overlaps++;});});
  var parents=sanitizedGroupParents(arranged.groups),groupIds=Object.keys(L.groups);
  function ancestor(a,b){while(b!=null){if(a===b)return true;b=parents[b];}return false;}
  groupIds.forEach(function(g,i){
    groupIds.slice(i+1).forEach(function(h){if(!ancestor(g,h) && !ancestor(h,g) && overlap(L.groups[g],L.groups[h]))overlaps++;});
    ids.forEach(function(id){if(!ancestor(g,arranged.nodes[id].group) && overlap(L.groups[g],rect(L.pos[id])))overlaps++;});
  });
  var pathBounds=[],paths=arranged.edges.map(function(e){
    var path=samplePathD(edgePath(e,L));
    hits+=countPathRectHits(path,ids.filter(function(id){return id!==e.from && id!==e.to;}).map(function(id){return rect(L.pos[id]);}));
    for(var i=1;i<path.length;i++)length+=Math.hypot(path[i].x-path[i-1].x,path[i].y-path[i-1].y);
    var left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
    path.forEach(function(p){left=Math.min(left,p.x);top=Math.min(top,p.y);right=Math.max(right,p.x);bottom=Math.max(bottom,p.y);});
    pathBounds.push({x:left,y:top,w:right-left,h:bottom-top});
    return path;
  });
  function intersects(a,b,c,d){
    if(Math.max(a.x,b.x)<Math.min(c.x,d.x) || Math.max(c.x,d.x)<Math.min(a.x,b.x) || Math.max(a.y,b.y)<Math.min(c.y,d.y) || Math.max(c.y,d.y)<Math.min(a.y,b.y))return false;
    function side(p,q,r){return (q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x);}
    return side(a,b,c)*side(a,b,d)<-1e-8 && side(c,d,a)*side(c,d,b)<-1e-8;
  }
  paths.forEach(function(a,i){paths.slice(i+1).forEach(function(b,k){
    var e=arranged.edges[i],f=arranged.edges[i+k+1];if(e.from===f.from || e.from===f.to || e.to===f.from || e.to===f.to)return;
    // Disconnected components and distant routes cannot cross. Avoid comparing
    // every pair of their sampled segments (quadratic in both path lengths).
    var ar=pathBounds[i],br=pathBounds[i+k+1];
    if(ar.x+ar.w<br.x || br.x+br.w<ar.x || ar.y+ar.h<br.y || br.y+br.h<ar.y)return;
    for(var ai=1;ai<a.length;ai++)for(var bi=1;bi<b.length;bi++)if(intersects(a[ai-1],a[ai],b[bi-1],b[bi])){crossings++;return;}
  });});
  // Score the occupied geometry, not the viewer's minimum-width canvas.
  var bounds=ids.map(function(id){return rect(L.pos[id]);}).concat(groupIds.map(function(g){return L.groups[g];}),pathBounds);
  var left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
  bounds.forEach(function(b){left=Math.min(left,b.x);top=Math.min(top,b.y);right=Math.max(right,b.x+b.w);bottom=Math.max(bottom,b.y+b.h);});
  var width=right-left,height=bottom-top,aspect=width/height;
  // Every shape from square to a landscape monitor is equally preferred.
  var shape=aspect<1?Math.log(1/aspect):aspect>16/9?Math.log(aspect/(16/9)):0;
  return {overlaps:overlaps,hits:hits,crossings:crossings,length:length,area:width*height,width:width,height:height,aspect:aspect,shape:shape};
}
function autoArrangeColaPositions(d,cola,seed){
  var ids=autoArrangeInput(d),state=seed;
  function random(){state=(1664525*state+1013904223)>>>0;return state/4294967296;}
  var nodes=ids.map(function(id){return {id:id,width:150+AUTO_ARRANGE_CARD_GAP,height:44+AUTO_ARRANGE_CARD_GAP,x:random()*900,y:random()*700};});
  var links=(d.edges || []).filter(function(e){return e.from!==e.to;}).map(function(e){return {source:ids.indexOf(e.from),target:ids.indexOf(e.to)};});
  new cola.Layout().nodes(nodes).links(links).size([1200,900]).linkDistance(AUTO_ARRANGE_LINK_DISTANCE).avoidOverlaps(true).start(60,100,250,0,false);
  var positions=Object.create(null);nodes.forEach(function(n){positions[n.id]={x:n.x,y:n.y};});return positions;
}
function autoArrangeChainPositions(d){
  var ids=autoArrangeInput(d),edges=d.edges || [],next=Object.create(null),incoming=Object.create(null);
  if(edges.length!==ids.length-1)return null;
  for(var i=0;i<edges.length;i++){
    var e=edges[i];if(e.from===e.to || next[e.from]!=null || incoming[e.to]!=null)return null;
    next[e.from]=e.to;incoming[e.to]=e.from;
  }
  var starts=ids.filter(function(id){return incoming[id]==null;});if(starts.length!==1)return null;
  var order=[],id=starts[0];while(id!=null && order.indexOf(id)<0){order.push(id);id=next[id];}
  if(order.length!==ids.length)return null;
  var rows=Math.ceil(ids.length/4),columns=Math.ceil(ids.length/rows);
  var width=150+(columns-1)*(150+AUTO_ARRANGE_CARD_GAP);
  var rowGap=rows>1?Math.max(44+AUTO_ARRANGE_RANK_GAP,(width/1.5-44)/(rows-1)):0;
  // Longer paths also need horizontal room once minimum row clearance sets
  // their height. Expand column spacing instead of squeezing cards together.
  var columnGap=columns>1?Math.max(150+AUTO_ARRANGE_CARD_GAP,((44+(rows-1)*rowGap)*1.5-150)/(columns-1)):0;
  var positions=Object.create(null);
  order.forEach(function(id,i){var row=Math.floor(i/columns),column=row%2?columns-1-i%columns:i%columns;
    positions[id]={x:column*columnGap,y:row*rowGap};
  });return positions;
}
function autoArrangeCompare(a,b){
  return a.score.crossings-b.score.crossings || a.score.shape-b.score.shape || a.score.length-b.score.length || a.score.area-b.score.area;
}
function autoArrangeCandidates(d,viz,cola){
  var ids=autoArrangeInput(d),candidates=[];
  function attempt(direction,positions,aspect){
    try{var result=autoArrangeRead(d,viz.renderJSON(autoArrangeDot(d,direction,positions,aspect),{engine:positions?'nop2':'dot'}));
      result.score=autoArrangeScore(d,result);if(!result.score.overlaps && !result.score.hits)candidates.push(result);
    }catch(ex){/* An alternative layout may still produce a usable route. */}
  }
  // A directed path has an unambiguous reading order. Preserve it in rows of
  // at most four, balancing row lengths and reversing alternate rows. Require
  // the normal safety checks before accepting the routed result.
  var chain=autoArrangeChainPositions(d);
  if(chain){attempt('LR',chain);if(candidates.length)return candidates[0];}
  attempt('TB');attempt('LR');
  // Graphviz expands rank spacing on the short axis and reroutes its splines.
  // Keep ordinary candidates as well: fewer crossings always outrank shape.
  // Additional spline routing/scoring is expensive on large, dense graphs.
  // Reserve the extra attempts for small diagrams within the worker budget.
  if(ids.length<=AUTO_ARRANGE_COMPACT_LIMITS.nodes && (d.edges || []).length<=AUTO_ARRANGE_COMPACT_LIMITS.edges){
    attempt('TB',null,1.5);attempt('LR',null,1.5);
  }
  if(!ids.some(function(id){return d.nodes[id].group;}) && ids.length>1 && cola){
    [1,91].forEach(function(seed){
      try{attempt('LR',autoArrangeColaPositions(d,cola,seed));
      }catch(ex){/* Layered alternatives remain available. */}
    });
  }
  candidates.sort(autoArrangeCompare);
  if(!candidates.length)throw new Error('Could not find a layout with clear cards and connections. The diagram is unchanged.');
  return candidates[0];
}
