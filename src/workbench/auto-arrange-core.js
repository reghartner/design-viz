/* Bounded deterministic layout search. Runs in a worker; this pure module is
   also exercised against the final viewer geometry in Node tests. */
var AUTO_ARRANGE_LIMITS={nodes:80,edges:160};
var AUTO_ARRANGE_COMPACT_LIMITS={nodes:24,edges:48};
var AUTO_ARRANGE_SMALL_LIMITS={nodes:12,edges:24};
var AUTO_ARRANGE_ALIGNMENT_LIMITS={checks:900,work:200000,passes:8};
var AUTO_ARRANGE_GEOMETRY_LIMITS={nodes:48,edges:80,blocks:24,proposals:4000,attempts:144,work:210000,passes:6,finishing:24,finishWork:36000,polishing:32,polishWork:50000};
var AUTO_ARRANGE_GLOBAL_LIMITS={nodes:48,edges:80,attempts:160,work:240000,seeds:2,passes:2,columnAttempts:80,columnWork:180000};
var AUTO_ARRANGE_MOTIF_LIMITS={attempts:240,work:600000,passes:5,span:6};
var AUTO_ARRANGE_LARGE_ALIGNMENT_LIMITS={checks:240,work:700000,passes:2};
var AUTO_ARRANGE_GRID_LIMITS={nodes:20,edges:32,runs:12,steps:20000,finalists:4};
var AUTO_ARRANGE_FOLD_LIMITS={nodes:20,edges:32,runs:12,steps:20000,finalists:4};
function autoArrangeSmall(d){return Object.keys(d.nodes || {}).length<=AUTO_ARRANGE_SMALL_LIMITS.nodes && (d.edges || []).length<=AUTO_ARRANGE_SMALL_LIMITS.edges;}
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
    Object.assign(e,result.edges[i]);delete e.fromPort;delete e.toPort;
    if(!hasCubicCurve(e)){delete e.labelDx;delete e.labelDy;}return e;
  });return copy;
}
function autoArrangeDot(d,direction,positions,aspect,nodeOrder){
  var ids=autoArrangeInput(d),groups=Object.assign(Object.create(null),d.groups || {});
  if(nodeOrder)ids=nodeOrder;
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
function autoArrangeRead(d,json,nodeOrder){
  var ids=nodeOrder || Object.keys(d.nodes),positions=[],edges=[],lookup=Object.create(null);
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
    var route={};
    // Keep native controls; shared geometry chooses automatic card attachments.
    route.curveControls=points.slice(1,-1).map(function(p,i){return edgeCurvePoint(original,L,p,(i+1)/(points.length-1));});
    if(!validCurveControls(route.curveControls))throw new Error('A connection exceeds the editable curve limit.');
    if(original.label && e.xlp){
      var label=e.xlp.split(',').map(Number),sample=samplePathD(edgePath(Object.assign({from:original.from,to:original.to},route),L));
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
function autoArrangePathGeometry(path){
  var left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
  path.forEach(function(p){left=Math.min(left,p.x);top=Math.min(top,p.y);right=Math.max(right,p.x);bottom=Math.max(bottom,p.y);});
  var segments=[];
  for(var i=1;i<path.length;i++){
    var a=path[i-1],b=path[i];
    segments.push({a:a,b:b,dx:b.x-a.x,dy:b.y-a.y,left:Math.min(a.x,b.x),right:Math.max(a.x,b.x),top:Math.min(a.y,b.y),bottom:Math.max(a.y,b.y)});
  }
  return {path:path,bounds:{x:left,y:top,w:right-left,h:bottom-top},segments:segments};
}
function autoArrangeIncident(e,f){return e.from===f.from || e.from===f.to || e.to===f.from || e.to===f.to;}
function autoArrangePathsCross(a,b){
  var ar=a.bounds,br=b.bounds;
  if(ar.x+ar.w<br.x || br.x+br.w<ar.x || ar.y+ar.h<br.y || br.y+br.h<ar.y)return false;
  // A sampled path participates in many pair checks. Reuse segment bounds
  // and deltas while preserving the same strict intersection predicate.
  for(var ai=0;ai<a.segments.length;ai++)for(var bi=0;bi<b.segments.length;bi++){
    var p=a.segments[ai],q=b.segments[bi];
    if(p.right<q.left || q.right<p.left || p.bottom<q.top || q.bottom<p.top)continue;
    var s=p.dx*(q.a.y-p.a.y)-p.dy*(q.a.x-p.a.x),t=p.dx*(q.b.y-p.a.y)-p.dy*(q.b.x-p.a.x);
    if(s*t>=-1e-8)continue;
    var u=q.dx*(p.a.y-q.a.y)-q.dy*(p.a.x-q.a.x),v=q.dx*(p.b.y-q.a.y)-q.dy*(p.b.x-q.a.x);
    if(u*v<-1e-8)return true;
  }
  return false;
}
function autoArrangeAdjust(d,L){return resolveEdgeAvoidance(d.edges,L,edgeAutoAdjust(d.edges,L));}
function autoArrangeScore(d,result){
  var arranged=autoArrangeDiagram(d,result),L=layout(arranged),ids=Object.keys(L.pos),overlaps=0,hits=0,crossings=0,incidentCrossings=0,length=0;
  function rect(p){return {x:p.cx-p.w/2,y:p.cy-p.h/2,w:p.w,h:p.h};}
  function overlap(a,b){return a.x<b.x+b.w-.1 && b.x<a.x+a.w-.1 && a.y<b.y+b.h-.1 && b.y<a.y+a.h-.1;}
  ids.forEach(function(id,i){ids.slice(i+1).forEach(function(other){if(overlap(rect(L.pos[id]),rect(L.pos[other])))overlaps++;});});
  var parents=sanitizedGroupParents(arranged.groups),groupIds=Object.keys(L.groups);
  function ancestor(a,b){while(b!=null){if(a===b)return true;b=parents[b];}return false;}
  groupIds.forEach(function(g,i){
    groupIds.slice(i+1).forEach(function(h){if(!ancestor(g,h) && !ancestor(h,g) && overlap(L.groups[g],L.groups[h]))overlaps++;});
    ids.forEach(function(id){if(!ancestor(g,arranged.nodes[id].group) && overlap(L.groups[g],rect(L.pos[id])))overlaps++;});
  });
  var adjust=autoArrangeAdjust(arranged,L),paths=arranged.edges.map(function(e,index){
    var path=samplePathD(edgePath(e,L,adjust[index]));
    hits+=countPathRectHits(path,ids.filter(function(id){return id!==e.from && id!==e.to;}).map(function(id){return rect(L.pos[id]);}));
    // Routing aesthetics do not change edge length: measure card centers.
    var from=L.pos[e.from],to=L.pos[e.to];length+=Math.hypot(to.cx-from.cx,to.cy-from.cy);
    return autoArrangePathGeometry(path);
  });
  paths.forEach(function(a,i){paths.slice(i+1).forEach(function(b,k){
    if(autoArrangePathsCross(a,b)){if(autoArrangeIncident(arranged.edges[i],arranged.edges[i+k+1]))incidentCrossings++;else crossings++;}
  });});
  var pathBounds=paths.map(function(p){return p.bounds;});
  // Score the occupied geometry, not the viewer's minimum-width canvas.
  var bounds=ids.map(function(id){return rect(L.pos[id]);}).concat(groupIds.map(function(g){return L.groups[g];}),pathBounds);
  var left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
  bounds.forEach(function(b){left=Math.min(left,b.x);top=Math.min(top,b.y);right=Math.max(right,b.x+b.w);bottom=Math.max(bottom,b.y+b.h);});
  var width=right-left,height=bottom-top,aspect=width/height;
  // Every shape from square to a landscape monitor is equally preferred.
  var shape=aspect<1?Math.log(1/aspect):aspect>16/9?Math.log(aspect/(16/9)):0;
  return {overlaps:overlaps,hits:hits,crossings:crossings,incidentCrossings:incidentCrossings,length:length,area:width*height,width:width,height:height,aspect:aspect,shape:shape};
}
function autoArrangeNaturalRoutes(d,result,preserveIncident){
  var arranged=autoArrangeDiagram(d,result),L=layout(arranged),ids=Object.keys(L.pos),count=arranged.edges.length;
  var automatic=autoArrangeDiagram(d,{positions:result.positions,edges:result.edges.map(function(){return {};})});
  var adjust=autoArrangeAdjust(automatic,L),paths=[],hits=[],cache=[],selected=result.edges.map(function(){return 0;});
  arranged.edges.forEach(function(e,i){
    // A previous pass may already have removed this edge's native controls.
    // Its baseline must include the same automatic avoidance the viewer uses;
    // otherwise mixed candidates compare crossings against an undrawn route.
    paths.push([autoArrangePathGeometry(samplePathD(edgePath(e,L,adjust[i]))),autoArrangePathGeometry(samplePathD(edgePath(automatic.edges[i],L,adjust[i])))]);
    hits.push(countPathRectHits(paths[i][1].path,ids.filter(function(id){return id!==e.from && id!==e.to;}).map(function(id){var p=L.pos[id];return {x:p.cx-p.w/2,y:p.cy-p.h/2,w:p.w,h:p.h};})));
  });
  // Placed floats have no shared endpoint spreading. Each automatic route and
  // its avoidance bow depend only on its own endpoints and the fixed cards.
  // Cache each native/automatic pair once, including mixed-route comparisons.
  function cross(i,vi,j,vj){
    if(i>j)return cross(j,vj,i,vi);
    if(!preserveIncident && autoArrangeIncident(arranged.edges[i],arranged.edges[j]))return 0;
    var key=(i*count+j)*4+vi*2+vj;
    if(cache[key]===undefined)cache[key]=autoArrangePathsCross(paths[i][vi],paths[j][vj])?1:0;
    return cache[key];
  }
  var nativeCrossings=0,automaticCrossings=0,nativeIncident=0,automaticIncident=0;
  for(var i=0;i<count;i++)for(var j=i+1;j<count;j++){
    if(preserveIncident && autoArrangeIncident(arranged.edges[i],arranged.edges[j])){nativeIncident+=cross(i,0,j,0);automaticIncident+=cross(i,1,j,1);}
    else {nativeCrossings+=cross(i,0,j,0);automaticCrossings+=cross(i,1,j,1);}
  }
  if(!hits.some(function(hit){return hit;}) && automaticCrossings<=nativeCrossings && automaticIncident<=nativeIncident)selected.fill(1);
  else {
    var crossings=nativeCrossings,incident=nativeIncident,changed=true;
    while(changed){
      changed=false;
      for(var i=0;i<count;i++){
        if(selected[i] || hits[i])continue;
        var delta=0,incidentDelta=0;
        for(var j=0;j<count;j++)if(j!==i){
          var change=cross(i,1,j,selected[j])-cross(i,0,j,selected[j]);
          if(preserveIncident && autoArrangeIncident(arranged.edges[i],arranged.edges[j]))incidentDelta+=change;else delta+=change;
        }
        if(crossings+delta<=nativeCrossings && incident+incidentDelta<=nativeIncident){selected[i]=1;crossings+=delta;incident+=incidentDelta;changed=true;}
      }
    }
  }
  result.edges=result.edges.map(function(e,i){return selected[i]?{}:e;});
  result.score=autoArrangeScore(d,result);return result;
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
  var small=autoArrangeSmall(d);
  var rowGap=rows>1?(small?150+AUTO_ARRANGE_CARD_GAP:Math.max(44+AUTO_ARRANGE_RANK_GAP,(width/1.5-44)/(rows-1))):0;
  // Longer paths also need horizontal room once minimum row clearance sets
  // their height. Expand column spacing instead of squeezing cards together.
  var columnGap=columns>1?(small?150+AUTO_ARRANGE_CARD_GAP:Math.max(150+AUTO_ARRANGE_CARD_GAP,((44+(rows-1)*rowGap)*1.5-150)/(columns-1))):0;
  var positions=Object.create(null);
  order.forEach(function(id,i){var row=Math.floor(i/columns),column=row%2?columns-1-i%columns:i%columns;
    positions[id]={x:column*columnGap,y:row*rowGap};
  });return positions;
}
function autoArrangeCompare(a,b,compact){
  var size=compact?Math.hypot(a.score.width,a.score.height)-Math.hypot(b.score.width,b.score.height):0;
  return a.score.crossings-b.score.crossings || a.score.shape-b.score.shape || size || a.score.length-b.score.length || a.score.area-b.score.area;
}
function autoArrangeLeafPositions(d,result){
  var ids=Object.keys(d.nodes),degree=Object.create(null),positions=Object.create(null);
  ids.forEach(function(id){degree[id]=0;});
  (d.edges || []).forEach(function(e){degree[e.from]++;degree[e.to]++;});
  result.positions.forEach(function(p){positions[p.id]={x:p.x,y:p.y};});
  function diagonal(placed){
    var xs=ids.map(function(id){return placed[id].x;}),ys=ids.map(function(id){return placed[id].y;});
    return Math.hypot(Math.max.apply(null,xs)-Math.min.apply(null,xs)+150,Math.max.apply(null,ys)-Math.min.apply(null,ys)+44);
  }
  var best=null,bestSize=diagonal(positions),bestLength=Infinity,bestDegree=Infinity;
  // One bounded tuck per seed: terminal leaves may share their neighbor's row or
  // column when that shrinks the card footprint. Native rerouting and scoring
  // still decide whether the placement is safe and has fewer crossings.
  ids.forEach(function(leaf){
    if(degree[leaf]!==1)return;
    var edge=d.edges.find(function(e){return e.from===leaf || e.to===leaf;}),neighbor=edge.from===leaf?edge.to:edge.from,parent=positions[neighbor];
    [[150+AUTO_ARRANGE_CARD_GAP,0],[-150-AUTO_ARRANGE_CARD_GAP,0],[0,44+AUTO_ARRANGE_RANK_GAP],[0,-44-AUTO_ARRANGE_RANK_GAP]].forEach(function(offset){
      var point={x:parent.x+offset[0],y:parent.y+offset[1]};
      if(ids.some(function(id){
        if(id===leaf)return false;
        var p=positions[id],dx=Math.max(0,Math.abs(p.x-point.x)-150),dy=Math.max(0,Math.abs(p.y-point.y)-44);
        return Math.hypot(dx,dy)<AUTO_ARRANGE_CARD_GAP-.1;
      }))return;
      var placed=Object.assign(Object.create(null),positions);placed[leaf]=point;
      var size=diagonal(placed),length=Math.hypot(offset[0],offset[1]);
      if(size<bestSize-.1 || best && Math.abs(size-bestSize)<.1 && (length<bestLength || length===bestLength && degree[neighbor]<bestDegree)){best=placed;bestSize=size;bestLength=length;bestDegree=degree[neighbor];}
    });
  });return best;
}
function autoArrangeAlignmentFits(score,original){
  var diagonal=Math.hypot(score.width,score.height),before=Math.hypot(original.width,original.height);
  return diagonal<=before*1.25 && (original.shape>0 || !score.shape || score.area<=original.area*.9 && diagonal<=before);
}
function autoArrangeAlignedPositions(d,result){
  var ids=Object.keys(d.nodes),edges=d.edges || [];
  if(ids.length>AUTO_ARRANGE_COMPACT_LIMITS.nodes || edges.length>AUTO_ARRANGE_COMPACT_LIMITS.edges || ids.some(function(id){return d.nodes[id].group;}))return null;
  function distinct(axis){return new Set(result.positions.map(function(p){return Math.round(p[axis]*10);})).size;}
  function repeated(axis){var counts=Object.create(null);result.positions.forEach(function(p){var key=Math.round(p[axis]*10);counts[key]=(counts[key] || 0)+1;});return Object.keys(counts).filter(function(k){return counts[k]>1;}).length;}
  var horizontal=repeated('x')>repeated('y');
  // Force layouts without recognizable ranks keep their existing silhouette.
  if(Math.max(repeated('x'),repeated('y'))<2)return null;
  function clusters(axis,size){
    var groups=[];
    result.positions.slice().sort(function(a,b){return a[axis]-b[axis];}).forEach(function(p){
      var last=groups[groups.length-1];if(!last || p[axis]-last[0][axis]>size)groups.push(last=[]);last.push(p);
    });return groups;
  }
  var columns=clusters('x',150),rows=clusters('y',44),centers=distinct('x')+distinct('y');
  // A common grid already exists when no nearby coordinates need merging.
  if(columns.length+rows.length===centers)return null;
  function spacing(groups,axis,minimum,round){
    var centers=groups.map(function(g){return g.reduce(function(sum,p){return sum+p[axis];},0)/g.length;}),gaps=centers.slice(1).map(function(c,i){return c-centers[i];}).sort(function(a,b){return a-b;});
    var middle=Math.floor(gaps.length/2),gap=gaps.length?(gaps.length%2?gaps[middle]:(gaps[middle-1]+gaps[middle])/2):minimum;
    return Math.max(minimum,round?Math.round(gap/12)*12:gap);
  }
  var dx=spacing(columns,'x',150+AUTO_ARRANGE_CARD_GAP,true),dy=spacing(rows,'y',44+AUTO_ARRANGE_CARD_GAP,false);
  var left=Math.min.apply(null,result.positions.map(function(p){return p.x;})),top=Math.min.apply(null,result.positions.map(function(p){return p.y;}));
  var cells=Object.create(null);
  columns.forEach(function(g,col){g.forEach(function(p){cells[p.id]={col:col};});});
  rows.forEach(function(g,row){g.forEach(function(p){cells[p.id].row=row;});});
  // Geometry work scales down with graph size. No extra search runs above the
  // existing small/medium candidate cutoff, preserving the large-graph budget.
  var budget=Math.min(AUTO_ARRANGE_ALIGNMENT_LIMITS.checks,Math.floor(AUTO_ARRANGE_ALIGNMENT_LIMITS.work/(ids.length*Math.max(1,edges.length)))),evaluations=0;
  var width=columns.length+(horizontal?0:1),height=rows.length+(horizontal?1:0);
  var cache=Object.create(null),automatic=edges.map(function(){return {};});
  function evaluate(placed){
    // Empty internal grid lines add no structure; close them before comparing.
    var cs=Array.from(new Set(ids.map(function(id){return placed[id].col;}))).sort(function(a,b){return a-b;}),rs=Array.from(new Set(ids.map(function(id){return placed[id].row;}))).sort(function(a,b){return a-b;});
    var packed=Object.create(null);ids.forEach(function(id){packed[id]={col:cs.indexOf(placed[id].col),row:rs.indexOf(placed[id].row)};});placed=packed;
    var key=ids.map(function(id){return placed[id].col+','+placed[id].row;}).join(';');if(cache[key])return cache[key];
    if(evaluations>=budget)return null;evaluations++;
    var candidate={positions:ids.map(function(id){return {id:id,x:left+placed[id].col*dx,y:top+placed[id].row*dy};}),edges:automatic};
    var score=autoArrangeScore(d,candidate),diagonal=0;
    edges.forEach(function(e){var a=placed[e.from],b=placed[e.to];if(a.col!==b.col && a.row!==b.row)diagonal++;});
    candidate.score=score;
    return cache[key]={cells:placed,result:candidate,rank:[score.overlaps,score.hits,score.crossings,score.length+diagonal*Math.max(dx,dy),Math.hypot(score.width,score.height)]};
  }
  function better(a,b){if(!a)return false;for(var i=0;i<a.rank.length;i++)if(a.rank[i]!==b.rank[i])return a.rank[i]<b.rank[i];return false;}
  var best=evaluate(cells);
  for(var pass=0;pass<AUTO_ARRANGE_ALIGNMENT_LIMITS.passes && evaluations<budget;pass++){
    var next=best;
    for(var i=0;i<ids.length && evaluations<budget;i++){
      var id=ids[i];
      for(var row=0;row<height && evaluations<budget;row++)for(var col=0;col<width && evaluations<budget;col++){
        if(ids.some(function(other){return best.cells[other].row===row && best.cells[other].col===col;}))continue;
        var placed=Object.assign(Object.create(null),best.cells);placed[id]={row:row,col:col};
        var candidate=evaluate(placed);if(better(candidate,next))next=candidate;
      }
    }
    if(next===best)break;best=next;
  }
  var aligned=best.result;
  var usedColumns=new Set(aligned.positions.map(function(p){return p.x;})),usedRows=new Set(aligned.positions.map(function(p){return p.y;}));
  if(usedColumns.size+usedRows.size>centers || !autoArrangeAlignmentFits(aligned.score,result.score))return null;
  return aligned;
}
// Larger ranked layouts need local cleanup, without the combinatorial cell
// search used for small graphs. Keep every accepted change safe in viewer geometry.
function autoArrangeLargeAligned(d,result){
  var ids=Object.keys(d.nodes),edges=d.edges || [];
  if(ids.length<=AUTO_ARRANGE_GRID_LIMITS.nodes || ids.some(function(id){return d.nodes[id].group;}))return result;
  var best=result,checks=0,budget=Math.min(AUTO_ARRANGE_LARGE_ALIGNMENT_LIMITS.checks,Math.floor(AUTO_ARRANGE_LARGE_ALIGNMENT_LIMITS.work/(ids.length*Math.max(1,edges.length))));
  var degree=Object.create(null);ids.forEach(function(id){degree[id]=0;});
  edges.forEach(function(e){degree[e.from]++;degree[e.to]++;});
  function accept(positions,moved,retain){
    if(checks++>=budget)return false;
    var before=Object.create(null),after=Object.create(null);
    best.positions.forEach(function(p){before[p.id]=p;});positions=positions.map(function(p){var q={id:p.id,x:p.x,y:p.y};after[p.id]=q;return q;});
    // Preserve straight branches as a unit when their common line moves.
    for(var i=0;i<edges.length;i++){
      var e=edges[i];if(degree[e.from]!==1 && degree[e.to]!==1)continue;
      var a=before[e.from],b=before[e.to],c=after[e.from],f=after[e.to];
      for(var k=0;k<2;k++){
        var axis=k?'y':'x';if(Math.abs(a[axis]-b[axis])>=.1)continue;
        if(Math.abs(c[axis]-f[axis])<.1)continue;
        if(Math.abs(c[axis]-a[axis])>.1 && Math.abs(f[axis]-b[axis])>.1)return false;
        if(Math.abs(c[axis]-a[axis])>.1){f[axis]=c[axis];moved.add(e.to);}else{c[axis]=f[axis];moved.add(e.from);}
      }
    }
    if(edges.some(function(e){
      if(degree[e.from]!==1 && degree[e.to]!==1)return false;
      var a=before[e.from],b=before[e.to],c=after[e.from],f=after[e.to];
      return (Math.abs(a.x-b.x)<.1 || Math.abs(a.y-b.y)<.1) && Math.abs(c.x-f.x)>.1 && Math.abs(c.y-f.y)>.1;
    }))return false;
    // Prefer natural routing at moved endpoints. The existing controls are
    // a fallback for rank moves only, and must pass the same geometry checks.
    var candidate={positions:positions,edges:best.edges.map(function(e,i){return moved.has(edges[i].from) || moved.has(edges[i].to)?{}:e;})};
    candidate.score=autoArrangeScore(d,candidate);
    function safe(a){var b=best.score;return !a.overlaps && !a.hits && a.crossings<=b.crossings && a.incidentCrossings<=b.incidentCrossings &&
      a.length<=Math.min(b.length*1.01,result.score.length*1.03) && Math.hypot(a.width,a.height)<=Math.hypot(b.width,b.height)+.1;}
    if(!safe(candidate.score) && retain && checks<budget){
      checks++;candidate.edges=best.edges;candidate.score=autoArrangeScore(d,candidate);
    }
    if(!safe(candidate.score))return false;
    best=candidate;return true;
  }
  // Collapse near coordinates into shared lines, then distribute those lines
  // evenly within their existing span. Preserve order and do not expand the
  // footprint merely to fit a grid. Each axis is independently optional.
  ['x','y'].forEach(function(axis){
    var minimum=axis==='x'?150+AUTO_ARRANGE_CARD_GAP:44+AUTO_ARRANGE_CARD_GAP;
    var tolerance=axis==='x'?150:44;
    var groups=[];
    best.positions.slice().sort(function(a,b){return a[axis]-b[axis];}).forEach(function(p){
      var last=groups[groups.length-1];if(!last || p[axis]-last[0][axis]>tolerance)groups.push(last=[]);last.push(p);
    });
    if(groups.length<2)return;
    var low=groups[0][0][axis],high=groups[groups.length-1].slice(-1)[0][axis],gap=Math.max(minimum,(high-low)/(groups.length-1));
    var targets=Object.create(null);groups.forEach(function(g,i){g.forEach(function(p){targets[p.id]=low+i*gap;});});
    var moved=new Set(),positions=best.positions.map(function(p){var q={id:p.id,x:p.x,y:p.y};q[axis]=targets[p.id];if(Math.abs(q[axis]-p[axis])>.1)moved.add(p.id);return q;});
    if(moved.size && accept(positions,moved,true))return;
    // A full grid may change route order. Snap one shared line at a time;
    // if the line cannot move safely, try its individual cards instead.
    groups.forEach(function(group){
      var line=new Set(group.map(function(p){return p.id;}));
      function snapped(selection){return best.positions.map(function(p){var q={id:p.id,x:p.x,y:p.y};if(selection.has(p.id))q[axis]=targets[p.id];return q;});}
      if(group.every(function(p){return Math.abs(p[axis]-targets[p.id])<.1;}))return;
      if(!accept(snapped(line),line,true) && group.length>1)group.forEach(function(p){var one=new Set([p.id]);accept(snapped(one),one,true);});
    });
  });
  // Both source and sink leaves can line up with their only neighbor. Try
  // projection first, followed by the nearest clear cardinal slots. Two
  // sweeps allow an earlier safe tuck to free a later branch's preferred slot.
  for(var pass=0;pass<AUTO_ARRANGE_LARGE_ALIGNMENT_LIMITS.passes && checks<budget;pass++){
    var changed=false;
    for(var i=0;i<ids.length && checks<budget;i++){
      var id=ids[i];if(degree[id]!==1)continue;
      var edge=edges.find(function(e){return e.from===id || e.to===id;}),other=edge.from===id?edge.to:edge.from;
      var p=best.positions.find(function(p){return p.id===id;}),parent=best.positions.find(function(p){return p.id===other;});
      if(Math.abs(p.x-parent.x)<.1 || Math.abs(p.y-parent.y)<.1)continue;
      var points=[{x:parent.x,y:p.y},{x:p.x,y:parent.y},
        {x:parent.x+150+AUTO_ARRANGE_CARD_GAP,y:parent.y},{x:parent.x-150-AUTO_ARRANGE_CARD_GAP,y:parent.y},
        {x:parent.x,y:parent.y+44+AUTO_ARRANGE_RANK_GAP},{x:parent.x,y:parent.y-44-AUTO_ARRANGE_RANK_GAP}];
      points.sort(function(a,b){return Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y);});
      var straightened=false;
      for(var j=0;j<points.length && checks<budget;j++){
        var point=points[j];
        if(best.positions.some(function(q){return q.id!==id && Math.hypot(Math.max(0,Math.abs(q.x-point.x)-150),Math.max(0,Math.abs(q.y-point.y)-44))<AUTO_ARRANGE_CARD_GAP-.1;}))continue;
        var positions=best.positions.map(function(q){return q.id===id?{id:id,x:point.x,y:point.y}:q;});
        if(accept(positions,new Set([id]))){changed=true;straightened=true;break;}
      }
      // A crowded leaf row may have no clear slot. Its neighbor can sometimes
      // meet that row/column safely with a shorter move instead.
      if(!straightened)for(var axis of ['x','y']){
        var point={x:parent.x,y:parent.y};point[axis]=p[axis];
        if(best.positions.some(function(q){return q.id!==other && Math.hypot(Math.max(0,Math.abs(q.x-point.x)-150),Math.max(0,Math.abs(q.y-point.y)-44))<AUTO_ARRANGE_CARD_GAP-.1;}))continue;
        var positions=best.positions.map(function(q){return q.id===other?{id:other,x:point.x,y:point.y}:q;});
        if(accept(positions,new Set([other]))){changed=true;break;}
      }
    }
    if(!changed)break;
  }
  return best;
}
// Structural scaffolds constrain shared ranks, not enclosing rectangles. The
// full layout can insert another motif into their gaps and expand those gaps.
function autoArrangeMotifScaffolds(d){
  var ids=Object.keys(d.nodes),incoming=ids.map(function(){return [];}),outgoing=ids.map(function(){return [];}),choices=[],seen=new Set();
  (d.edges || []).forEach(function(e){var a=ids.indexOf(e.from),b=ids.indexOf(e.to);if(a===b)return;if(outgoing[a].indexOf(b)<0){outgoing[a].push(b);incoming[b].push(a);}});
  function add(run){
    if(run.length<2)return;
    // Share the boundary node between windows so every corridor edge and fan
    // attachment participates even when the full motif exceeds the local span.
    var span=AUTO_ARRANGE_MOTIF_LIMITS.span;
    for(var start=0;start<run.length-1;start+=span-1){
      var window=run.slice(start,start+span),key=window.slice().sort(function(a,b){return a-b;}).join(',');
      if(!seen.has(key)){seen.add(key);choices.push(window);}
    }
  }
  // Maximal degree-two corridors include branches between a split and rejoin,
  // terminal chains, and return paths around a feedback loop. Their endpoints
  // can remain outside the local row when adjacent motifs need insertion space.
  ids.forEach(function(id,i){
    if(outgoing[i].length===1 && incoming[i].length===1)return;
    outgoing[i].forEach(function(next){
      var chain=[i],node=next;
      while(chain.indexOf(node)<0){chain.push(node);if(outgoing[node].length!==1 || incoming[node].length!==1)break;node=outgoing[node][0];}
      if(chain.length<3)return;
      [chain,chain.slice(1),chain.slice(0,-1),chain.slice(1,-1)].forEach(add);
    });
  });
  // Sibling input/output sets describe fans, split/rejoin branches and shared
  // sides of a dense mesh. Directly connected siblings keep their own corridor.
  outgoing.concat(incoming).forEach(function(peers){
    if(!peers.some(function(a){return outgoing[a].some(function(b){return peers.indexOf(b)>=0;});}))add(peers);
  });
  return choices;
}
function autoArrangeMotifCandidates(d,result,viz){
  var count=Object.keys(d.nodes).length,edges=d.edges || [];
  if(count<=AUTO_ARRANGE_GRID_LIMITS.nodes || Object.keys(d.nodes).some(function(id){return d.nodes[id].group;}))return result;
  var choices=autoArrangeMotifScaffolds(d),ranks=[],best=result,attempts=0;
  var budget=Math.min(AUTO_ARRANGE_MOTIF_LIMITS.attempts,Math.floor(AUTO_ARRANGE_MOTIF_LIMITS.work/(count*Math.max(1,edges.length)))),seen=new Set();
  function safe(score){return !score.overlaps && !score.hits && score.crossings<=result.score.crossings && score.incidentCrossings<=result.score.incidentCrossings &&
    Math.hypot(score.width,score.height)<=Math.hypot(result.score.width,result.score.height)*1.03 && score.length<=result.score.length*1.15;}
  function better(a,b){return a.crossings<b.crossings || a.crossings===b.crossings && (a.shape<b.shape-.001 || Math.abs(a.shape-b.shape)<.001 && Math.hypot(a.width,a.height)<Math.hypot(b.width,b.height)-.1);}
  for(var pass=0;pass<AUTO_ARRANGE_MOTIF_LIMITS.passes && attempts<budget;pass++){
    var next=null;
    for(var i=0;i<choices.length && attempts<budget;i++){
      var proposed=ranks.concat([choices[i]]),key=proposed.map(function(r){return r.slice().sort(function(a,b){return a-b;}).join(',');}).sort().join(';');
      if(seen.has(key))continue;seen.add(key);attempts++;
      var dot=autoArrangeDot(d,'TB');dot=dot.slice(0,-1)+proposed.map(function(r){return '{rank=same;'+r.map(function(n){return 'n'+n;}).join(';')+';}';}).join('')+'}';
      try{
        var candidate=autoArrangeRead(d,viz.renderJSON(dot,{engine:'dot'}));
        candidate=autoArrangeNaturalRoutes(d,candidate,true);
        if(safe(candidate.score) && candidate.score.incidentCrossings<=(next?next.result.score:best.score).incidentCrossings && better(candidate.score,next?next.result.score:best.score))next={result:candidate,ranks:proposed,index:i};
      }catch(ex){/* A motif constraint may have no usable full-graph routing. */}
    }
    if(!next)break;best=next.result;ranks=next.ranks;choices.splice(next.index,1);
  }
  // Remove surplus rank spacing only after composition. Scale actual cards'
  // centers and retained control offsets, check clearance and every final route,
  // and retain the uncompressed candidate whenever squeezing changes topology.
  var source=best;
  [1,.9,.8,.7,.6].forEach(function(sx){[1,.9,.8,.7,.6].forEach(function(sy){
    if(sx===1 && sy===1)return;
    var positions=source.positions.map(function(p){return {id:p.id,x:120+(p.x-120)*sx,y:100+(p.y-100)*sy};});
    if(positions.some(function(a,i){return positions.slice(i+1).some(function(b){return Math.hypot(Math.max(0,Math.abs(a.x-b.x)-150),Math.max(0,Math.abs(a.y-b.y)-44))<AUTO_ARRANGE_CARD_GAP-.1;});}))return;
    var candidate={positions:positions,edges:source.edges.map(function(e){
      if(!e.curveControls)return {};
      var copy=Object.assign({},e);copy.curveControls=e.curveControls.map(function(p){return {t:p.t,dx:p.dx*sx,dy:p.dy*sy};});
      if(copy.labelDx!=null)copy.labelDx*=sx;if(copy.labelDy!=null)copy.labelDy*=sy;return copy;
    })};
    candidate=autoArrangeNaturalRoutes(d,candidate,true);
    var a=candidate.score,b=best.score;
    if(!a.overlaps && !a.hits && a.crossings<=b.crossings && a.incidentCrossings<=b.incidentCrossings && a.length<=b.length &&
      a.shape<=source.score.shape+1e-9 && Math.hypot(a.width,a.height)*(1+a.shape*.12)<Math.hypot(b.width,b.height)*(1+b.shape*.12)-.1)best=candidate;
  });});
  return best;
}
// All nodes in an accepted candidate share one lattice after motif composition.
// Whole-layout proposals avoid the partial snaps that leave unrelated x axes.
function autoArrangeGlobalLattice(d,result,viz){
  var ids=Object.keys(d.nodes),count=ids.length,edges=d.edges || [];
  if(count<=AUTO_ARRANGE_GRID_LIMITS.nodes || count>AUTO_ARRANGE_GLOBAL_LIMITS.nodes || edges.length>AUTO_ARRANGE_GLOBAL_LIMITS.edges || ids.some(function(id){return d.nodes[id].group;}))return result;
  var budget=Math.min(AUTO_ARRANGE_GLOBAL_LIMITS.attempts,Math.floor(AUTO_ARRANGE_GLOBAL_LIMITS.work/(count*Math.max(1,edges.length)))),attempts=0,best=null,seeds=[];
  var minimumColumns=Math.max(4,Math.ceil(Math.sqrt(count))-1),baseRows=2*Math.ceil(Math.sqrt(count));
  function safe(score){return !score.overlaps && !score.hits && score.crossings<=result.score.crossings && score.incidentCrossings<=result.score.incidentCrossings &&
    score.shape<=result.score.shape+1e-9 && score.length<=result.score.length*1.05 && score.area<result.score.area*.98 &&
    Math.hypot(score.width,score.height)<=Math.hypot(result.score.width,result.score.height);}
  function better(a,b){return !b || a.score.area<b.score.area-.1 || Math.abs(a.score.area-b.score.area)<.1 && a.score.length<b.score.length;}
  function route(positions,natural){
    if(attempts>=budget)return null;attempts++;
    var candidate={positions:positions,edges:edges.map(function(){return {};})};
    if(natural){candidate.score=autoArrangeScore(d,candidate);if(safe(candidate.score))return candidate;}
    try{
      var placed=Object.create(null);positions.forEach(function(p){placed[p.id]=p;});
      candidate=autoArrangeRead(d,viz.renderJSON(autoArrangeDot(d,'TB',placed),{engine:'nop2'}));
      return autoArrangeNaturalRoutes(d,candidate,true);
    }catch(ex){return null;}
  }
  var left=Math.min.apply(null,result.positions.map(function(p){return p.x;})),right=Math.max.apply(null,result.positions.map(function(p){return p.x;}));
  var top=Math.min.apply(null,result.positions.map(function(p){return p.y;})),bottom=Math.max.apply(null,result.positions.map(function(p){return p.y;}));
  for(var columns=minimumColumns;columns<minimumColumns+5;columns++)for(var rows=baseRows-4;rows<=baseRows+2;rows+=2){
    var used=new Set(),cells=[],dx=Math.max(150+AUTO_ARRANGE_CARD_GAP,(44+(rows-1)*(44+AUTO_ARRANGE_RANK_GAP)-150)/(columns-1)),dy=44+AUTO_ARRANGE_RANK_GAP;
    result.positions.forEach(function(p){
      var col=Math.round((p.x-left)/(right-left || 1)*(columns-1)),row=Math.round((p.y-top)/(bottom-top || 1)*(rows-1));
      if(used.has(col+','+row)){
        var nearest=null;
        for(var x=0;x<columns;x++)for(var y=0;y<rows;y++)if(!used.has(x+','+y)){
          var distance=(x-col)*(x-col)+(y-row)*(y-row);
          if(!nearest || distance<nearest.distance)nearest={col:x,row:y,distance:distance};
        }
        if(!nearest)return;col=nearest.col;row=nearest.row;
      }
      used.add(col+','+row);cells.push({id:p.id,x:120+col*dx,y:100+row*dy});
    });
    if(cells.length!==count)continue;
    var candidate=route(cells,true);if(!candidate || candidate.score.overlaps || candidate.score.hits)continue;
    if(safe(candidate.score) && better(candidate,best))best=candidate;
    if(candidate.score.crossings<=result.score.crossings+2 && candidate.score.incidentCrossings<=result.score.incidentCrossings)seeds.push(candidate);
  }
  if(best)return best;
  // Rounding can invert a local crossing order. Repair only endpoints of the
  // offending routes, moving or swapping whole cards on the same global axes.
  // These temporary candidates are never published before all safety gates pass.
  seeds.sort(function(a,b){return a.score.crossings-b.score.crossings || a.score.area-b.score.area || a.score.length-b.score.length;});
  for(var seed=0;seed<Math.min(AUTO_ARRANGE_GLOBAL_LIMITS.seeds,seeds.length) && attempts<budget;seed++){
    var current=seeds[seed];
    for(var pass=0;pass<AUTO_ARRANGE_GLOBAL_LIMITS.passes && attempts<budget;pass++){
      var arranged=autoArrangeDiagram(d,current),L=layout(arranged),adjust=autoArrangeAdjust(arranged,L);
      var paths=arranged.edges.map(function(e,i){return autoArrangePathGeometry(samplePathD(edgePath(e,L,adjust[i])));}),offenders=new Set();
      paths.forEach(function(path,i){paths.slice(i+1).forEach(function(other,j){
        var k=i+j+1;if(!autoArrangeIncident(edges[i],edges[k]) && autoArrangePathsCross(path,other)){
          [edges[i].from,edges[i].to,edges[k].from,edges[k].to].forEach(function(id){offenders.add(id);});
        }
      });});
      var xs=Array.from(new Set(current.positions.map(function(p){return p.x;}))).sort(function(a,b){return a-b;}),ys=Array.from(new Set(current.positions.map(function(p){return p.y;}))).sort(function(a,b){return a-b;}),next=current;
      offenders.forEach(function(id){
        var p=current.positions.find(function(p){return p.id===id;}),col=xs.indexOf(p.x),row=ys.indexOf(p.y);
        for(var ox=-2;ox<=2 && attempts<budget;ox++)for(var oy=-2;oy<=2 && attempts<budget;oy++){
          if(!ox && !oy || xs[col+ox]===undefined || ys[row+oy]===undefined)continue;
          var point={x:xs[col+ox],y:ys[row+oy]},other=current.positions.find(function(q){return q.id!==id && Math.abs(q.x-point.x)<.1 && Math.abs(q.y-point.y)<.1;});
          var positions=current.positions.map(function(q){return q.id===id?{id:id,x:point.x,y:point.y}:other && q.id===other.id?{id:other.id,x:p.x,y:p.y}:q;});
          var candidate=route(positions,false);if(!candidate)continue;var a=candidate.score,b=next.score;
          if(!a.overlaps && !a.hits && a.incidentCrossings<=result.score.incidentCrossings && (a.crossings<b.crossings || a.crossings===b.crossings && a.length<b.length))next=candidate;
          if(safe(a) && better(candidate,best))best=candidate;
        }
      });
      if(best)return best;if(next===current)break;current=next;
    }
  }
  // Deep compositions can already have useful rows. Share only their columns
  // when a two-axis compaction cannot preserve routing. This reserve shares the
  // attempt counter; it cannot extend either search without a fixed upper bound.
  budget+=Math.min(AUTO_ARRANGE_GLOBAL_LIMITS.columnAttempts,Math.floor(AUTO_ARRANGE_GLOBAL_LIMITS.columnWork/(count*Math.max(1,edges.length))));
  var columnSeeds=[],pitch=150+AUTO_ARRANGE_CARD_GAP,oldColumns=new Set(result.positions.map(function(p){return p.x;})).size;
  function columnSafe(candidate){
    var a=candidate.score,b=result.score,columns=new Set(candidate.positions.map(function(p){return p.x;})).size;
    return !a.overlaps && !a.hits && a.crossings<=b.crossings && a.incidentCrossings<=b.incidentCrossings && a.shape<=b.shape+1e-9 &&
      a.length<=b.length*1.05 && a.area<=b.area*1.03 && Math.hypot(a.width,a.height)<=Math.hypot(b.width,b.height)*1.03 &&
      columns<=Math.ceil(Math.sqrt(count))*2 && columns<=oldColumns*.6;
  }
  function clearColumns(positions){return !positions.some(function(a,i){return positions.slice(i+1).some(function(b){
    return Math.hypot(Math.max(0,Math.abs(a.x-b.x)-150),Math.max(0,Math.abs(a.y-b.y)-44))<AUTO_ARRANGE_CARD_GAP-.1;
  });});}
  function columnRoute(positions,retained){
    if(attempts>=budget || !clearColumns(positions))return null;
    attempts++;
    // The original offsets are one route proposal, not an assumption that
    // splines deform safely. Re-score their actual automatic attachments.
    var candidate=autoArrangeNaturalRoutes(d,{positions:positions,edges:retained},true);
    if(columnSafe(candidate))return candidate;
    return route(positions,false);
  }
  for(var phase=0;phase<3 && attempts<budget;phase++){
    var shift=[-.3,0,.3][phase],positions=result.positions.map(function(p){return {id:p.id,x:left+Math.round((p.x-left)/pitch+shift)*pitch,y:p.y};});
    var candidate=columnRoute(positions,result.edges);if(!candidate)continue;
    if(columnSafe(candidate))return candidate;
    if(!candidate.score.hits && !candidate.score.overlaps && candidate.score.crossings<=result.score.crossings+1 && candidate.score.incidentCrossings<=result.score.incidentCrossings)columnSeeds.push(candidate);
  }
  columnSeeds.sort(function(a,b){return a.score.crossings-b.score.crossings || a.score.area-b.score.area;});
  if(columnSeeds.length){
    var current=columnSeeds[0],arranged=autoArrangeDiagram(d,current),L=layout(arranged),adjust=autoArrangeAdjust(arranged,L),offenders=new Set();
    var paths=arranged.edges.map(function(e,i){return autoArrangePathGeometry(samplePathD(edgePath(e,L,adjust[i])));});
    paths.forEach(function(path,i){paths.slice(i+1).forEach(function(other,j){var k=i+j+1;
      if(!autoArrangeIncident(edges[i],edges[k]) && autoArrangePathsCross(path,other))[edges[i].from,edges[i].to,edges[k].from,edges[k].to].forEach(function(id){offenders.add(id);});
    });});
    var offenderIds=Array.from(offenders);
    for(var i=0;i<offenderIds.length && attempts<budget;i++)for(var offset=-2;offset<=2 && attempts<budget;offset++){
      if(!offset)continue;
      var id=offenderIds[i],positions=current.positions.map(function(p){return {id:p.id,x:p.x+(p.id===id?offset*pitch:0),y:p.y};});
      var candidate=columnRoute(positions,current.edges);if(candidate && columnSafe(candidate))return candidate;
    }
  }
  return result;
}
// Terminal corridors can occupy any clear part of the shared lattice. Their
// arrow direction is irrelevant: evaluate upward, downward and sideways folds.
function autoArrangeTerminalFolds(d,result,viz){
  var ids=Object.keys(d.nodes),edges=d.edges || [],count=ids.length;
  if(count<=20 || count>48 || edges.length>80 || ids.some(function(id){return d.nodes[id].group;}))return result;
  var adjacent=Object.create(null);ids.forEach(function(id){adjacent[id]=[];});
  edges.forEach(function(e){if(e.from!==e.to){if(adjacent[e.from].indexOf(e.to)<0)adjacent[e.from].push(e.to);if(adjacent[e.to].indexOf(e.from)<0)adjacent[e.to].push(e.from);}});
  var chains=[];
  ids.forEach(function(id){
    if(adjacent[id].length!==1)return;
    var chain=[id],previous=id,current=adjacent[id][0];
    while(adjacent[current].length===2 && chain.indexOf(current)<0 && chain.length<6){
      chain.push(current);var next=adjacent[current].filter(function(id){return id!==previous;})[0];previous=current;current=next;
    }
    if(chain.length>=2 && adjacent[current].length>2)chains.push({anchor:current,ids:chain.reverse()});
  });
  var best=result,attempts=0,budget=Math.min(64,Math.floor(120000/(count*Math.max(1,edges.length))));
  function improve(a,b){return a.area<b.area*.99 && a.length<=result.score.length*1.03 || a.length<b.length*.97 && a.area<=b.area;}
  function safe(a){var b=best.score;return !a.overlaps && !a.hits && a.crossings<=b.crossings && a.incidentCrossings<=b.incidentCrossings && a.shape<=result.score.shape+1e-9 &&
    a.length<=result.score.length*1.03 && Math.hypot(a.width,a.height)<=Math.hypot(b.width,b.height) && improve(a,b);}
  for(var pass=0;pass<2 && attempts<budget;pass++){
    var source=best,points=Object.create(null);source.positions.forEach(function(p){points[p.id]=p;});
    var xs=Array.from(new Set(source.positions.map(function(p){return p.x;}))).sort(function(a,b){return a-b;}),ys=Array.from(new Set(source.positions.map(function(p){return p.y;}))).sort(function(a,b){return a-b;}),proposals=[],seen=new Set();
    var enumerated=0;
    chains.forEach(function(chain){
      if(chain.ids.length>4)return;
      var fixed=source.positions.filter(function(p){return chain.ids.indexOf(p.id)<0;}),free=new Set();
      for(var x=0;x<xs.length;x++)for(var y=0;y<ys.length;y++)if(!fixed.some(function(p){return p.x===xs[x] && p.y===ys[y];}))free.add(x+','+y);
      function add(cells){
        if(enumerated>=12000)return;
        if(cells.length<chain.ids.length){
          [[0,-1],[-1,0],[1,0],[0,1]].forEach(function(step){var last=cells[cells.length-1],cell=[last[0]+step[0],last[1]+step[1]];
            if(free.has(cell.join(',')) && !cells.some(function(p){return p[0]===cell[0] && p[1]===cell[1];}))add(cells.concat([cell]));});return;
        }
        enumerated++;
        var placed=Object.create(null);chain.ids.forEach(function(id,i){placed[id]={id:id,x:xs[cells[i][0]],y:ys[cells[i][1]]};});
        var positions=source.positions.map(function(p){return placed[p.id] || p;}),key=positions.map(function(p){return p.x+','+p.y;}).join(';');
        if(seen.has(key))return;seen.add(key);
        if(positions.some(function(a,i){return positions.slice(i+1).some(function(b){return Math.hypot(Math.max(0,Math.abs(a.x-b.x)-150),Math.max(0,Math.abs(a.y-b.y)-44))<AUTO_ARRANGE_CARD_GAP-.1;});}))return;
        var byId=Object.create(null);positions.forEach(function(p){byId[p.id]=p;});
        var length=edges.reduce(function(sum,e){return sum+Math.hypot(byId[e.from].x-byId[e.to].x,byId[e.from].y-byId[e.to].y);},0);
        var area=(Math.max.apply(null,positions.map(function(p){return p.x;}))-Math.min.apply(null,positions.map(function(p){return p.x;}))+150)*(Math.max.apply(null,positions.map(function(p){return p.y;}))-Math.min.apply(null,positions.map(function(p){return p.y;}))+44);
        if(length<=result.score.length*1.03 && area<source.score.area*.99)proposals.push({positions:positions,moved:new Set(chain.ids),length:length,area:area});
      }
      free.forEach(function(key){add([key.split(',').map(Number)]);});
    });
    proposals.sort(function(a,b){return a.area-b.area || a.length-b.length;});
    var passLimit=Math.min(budget,attempts+Math.ceil(budget/2));
    for(var i=0;i<proposals.length && attempts<passLimit;i++){
      var p=proposals[i];attempts++;
      var candidate={positions:p.positions,edges:source.edges.map(function(e,j){return p.moved.has(edges[j].from) || p.moved.has(edges[j].to)?{}:e;})};
      candidate=autoArrangeNaturalRoutes(d,candidate,true);
      if(!safe(candidate.score)){
        try{var placed=Object.create(null);p.positions.forEach(function(p){placed[p.id]=p;});candidate=autoArrangeNaturalRoutes(d,autoArrangeRead(d,viz.renderJSON(autoArrangeDot(d,'TB',placed),{engine:'nop2'})),true);}catch(ex){continue;}
      }
      if(safe(candidate.score))best=candidate;
    }
    if(best===source)break;
  }
  return best;
}
// Partition weakly attached connected blocks independently of titles or roles.
// Terminal paths stay separate so their dock can rotate when the core moves.
function autoArrangeConnectedMotifs(d){
  var ids=Object.keys(d.nodes),edges=d.edges || [],n=ids.length;
  var links=edges.map(function(e){return [ids.indexOf(e.from),ids.indexOf(e.to)];}),adj=ids.map(function(){return [];});
  links.forEach(function(e){if(e[0]!==e[1]){if(adj[e[0]].indexOf(e[1])<0)adj[e[0]].push(e[1]);if(adj[e[1]].indexOf(e[0])<0)adj[e[1]].push(e[0]);}});
  var chains=[];adj.forEach(function(neighbors,i){if(neighbors.length!==1)return;var path=[i],prev=i,cur=neighbors[0];while(adj[cur].length===2 && path.length<5 && path.indexOf(cur)<0){path.push(cur);var next=adj[cur].filter(function(j){return j!==prev;})[0];prev=cur;cur=next;}if(adj[cur].length>2 && path.length<=4)chains.push({anchor:cur,ids:path.reverse()});});
  var corridorNodes=new Set();chains.forEach(function(chain){if(chain.ids.length>=2)chain.ids.forEach(function(i){corridorNodes.add(i);});});
  var fanNodes=new Set();
  chains.forEach(function(chain){if(chain.ids.length<2 || !links.some(function(e){return e[0]===chain.ids[0] && e[1]===chain.anchor;}))return;
    chains.forEach(function(single){if(single.anchor===chain.anchor && single.ids.length===1 && links.some(function(e){return e[0]===single.ids[0] && e[1]===single.anchor;})){fanNodes.add(chain.anchor);chain.ids.concat(single.ids).forEach(function(i){fanNodes.add(i);});}});
  });
  var blocks=[],blockSeen=new Set();
  for(var a=0;a<links.length;a++)for(var b=a;b<links.length;b++){
    var visited=new Set();
    for(var start=0;start<n;start++){
      if(visited.has(start))continue;var todo=[start],part=[];visited.add(start);
      while(todo.length){var node=todo.pop();part.push(node);links.forEach(function(e,k){if(k===a || k===b)return;var next=e[0]===node?e[1]:e[1]===node?e[0]:-1;if(next>=0 && !visited.has(next)){visited.add(next);todo.push(next);}});}
      if(part.length<4 || part.length>n*.6)continue;part.sort(function(a,b){return a-b;});var key=part.join(',');if(!blockSeen.has(key)){blockSeen.add(key);blocks.push(part);}
    }
  }
  var blockCoreNodes=new Set(),blockHubNodes=new Set();blocks.forEach(function(block){var attached=chains.filter(function(chain){return chain.ids.length>=2 && block.indexOf(chain.anchor)>=0 && chain.ids.every(function(i){return block.indexOf(i)>=0;}) && links.some(function(e){return e[0]===chain.anchor && e[1]===chain.ids[0];});});if(attached.length)block.forEach(function(i){if(!corridorNodes.has(i))blockCoreNodes.add(i);if(adj[i].length>=4)blockHubNodes.add(i);});});
  return {links:links,adj:adj,chains:chains,blocks:blocks.slice(0,AUTO_ARRANGE_GEOMETRY_LIMITS.blocks),corridorNodes:corridorNodes,fanNodes:fanNodes,blockCoreNodes:blockCoreNodes,blockHubNodes:blockHubNodes};
}
// A narrow angle between two neighboring branches predicts a bundled fan.
// Use topology and center rays only; full viewer paths still decide safety.
// One card width converts angular crowding into a comparable distance cost.
function autoArrangeFanCrowding(points,adj){
  var penalty=0;
  adj.forEach(function(neighbors,i){if(neighbors.length<3)return;neighbors.forEach(function(j,k){neighbors.slice(k+1).forEach(function(l){
    var a=points[j],b=points[l],o=points[i],length=Math.hypot(a.x-o.x,a.y-o.y)*Math.hypot(b.x-o.x,b.y-o.y);
    if(!length)return;var cosine=((a.x-o.x)*(b.x-o.x)+(a.y-o.y)*(b.y-o.y))/length;
    penalty+=150*Math.max(0,Math.PI/6-Math.acos(Math.max(-1,Math.min(1,cosine))));
  });});});return penalty;
}
// A preferred card silhouette may lose one occupied lattice column. Its
// shortfall from square is bounded by that one column pitch, rather than an
// aspect threshold affected by incidental routing bows.
function autoArrangeCompactColumnTrade(candidate,source,routeLength,sourceRouteLength){
  function cards(positions){var xs=positions.map(function(p){return p.x;}),ys=positions.map(function(p){return p.y;});return {columns:new Set(xs.map(function(x){return Math.round(x*1000)/1000;})).size,width:Math.max.apply(null,xs)-Math.min.apply(null,xs)+150,height:Math.max.apply(null,ys)-Math.min.apply(null,ys)+44};}
  var a=candidate.score,b=source.score,p=cards(candidate.positions),q=cards(source.positions),pitch=150+AUTO_ARRANGE_CARD_GAP;
  return q.width>=q.height && q.width<=q.height*16/9 && p.columns===q.columns-1 &&
    p.width>=q.width-pitch-.1 && p.height<=q.height+.1 && p.width>=p.height-pitch-.1 && p.width<=p.height*16/9 &&
    a.width<=b.width+.1 && a.height<=b.height+.1 && a.area<=b.area*.85 && a.length<=b.length*.98 && routeLength<sourceRouteLength;
}
// Temporary motif compositions may need space before a later move shortens
// their routes. Final shared-lattice results favor the preferred aspect band;
// local polishing may trade it for a substantially smaller, shorter drawing.
function autoArrangeMotifGeometry(d,result,viz){
  var ids=Object.keys(d.nodes),edges=d.edges || [],n=ids.length;
  if(n<=AUTO_ARRANGE_GRID_LIMITS.nodes || n>AUTO_ARRANGE_GEOMETRY_LIMITS.nodes || edges.length>AUTO_ARRANGE_GEOMETRY_LIMITS.edges || ids.some(function(id){return d.nodes[id].group;}))return result;
  var motifs=autoArrangeConnectedMotifs(d),links=motifs.links,adj=motifs.adj,chains=motifs.chains,blocks=motifs.blocks;
  var corridorNodes=motifs.corridorNodes,fanNodes=motifs.fanNodes,blockCoreNodes=motifs.blockCoreNodes,blockHubNodes=motifs.blockHubNodes;
  var initial=result,current=result,best=result,checks=0,budget=Math.min(AUTO_ARRANGE_GEOMETRY_LIMITS.attempts,Math.floor(AUTO_ARRANGE_GEOMETRY_LIMITS.work*32/(n*n*Math.max(1,edges.length)))),dx=150+AUTO_ARRANGE_CARD_GAP,dy=44+AUTO_ARRANGE_RANK_GAP;
  var routeLengths=new Map();
  function recordRoutes(candidate){var arranged=autoArrangeDiagram(d,candidate),L=layout(arranged),adjust=autoArrangeAdjust(arranged,L),length=0;
    arranged.edges.forEach(function(e,i){var path=samplePathD(edgePath(e,L,adjust[i]));for(var j=1;j<path.length;j++)length+=Math.hypot(path[j].x-path[j-1].x,path[j].y-path[j-1].y);});routeLengths.set(candidate.score,length);return candidate;
  }
  function natural(candidate){return recordRoutes(autoArrangeNaturalRoutes(d,candidate,true));}
  recordRoutes(initial);
  function clear(p){return !p.some(function(a,i){return p.slice(i+1).some(function(b){return Math.hypot(Math.max(0,Math.abs(a.x-b.x)-150),Math.max(0,Math.abs(a.y-b.y)-44))<AUTO_ARRANGE_CARD_GAP-.1;});});}
  function quality(a,b){return a.crossings-b.crossings || a.incidentCrossings-b.incidentCrossings || (a.length+Math.hypot(a.width,a.height))-(b.length+Math.hypot(b.width,b.height));}
  function feasible(s){var b=initial.score;return !s.overlaps && !s.hits && s.crossings<=b.crossings && s.incidentCrossings<=b.incidentCrossings && s.shape<=Math.max(.4,b.shape)+1e-9 && s.area<=b.area*1.5 && s.length<=b.length*1.03;}
  function detours(positions){var p=ids.map(function(id){return positions.find(function(p){return p.id===id;});});return p.map(function(point,i){if(adj[i].length!==2 || corridorNodes.has(i))return 0;var a=p[adj[i][0]],b=p[adj[i][1]];return Math.hypot(Math.max(0,Math.min(a.x,b.x)-point.x,point.x-Math.max(a.x,b.x)),Math.max(0,Math.min(a.y,b.y)-point.y,point.y-Math.max(a.y,b.y)));});}
  var originalDetours=detours(initial.positions);
  function lattice(positions){var xs=Array.from(new Set(positions.map(function(p){return Math.round(p.x*1000)/1000;}))).sort(function(a,b){return a-b;});return detours(positions).every(function(v,i){return v<=originalDetours[i]+.1;}) && xs.length<=new Set(initial.positions.map(function(p){return p.x;})).size && xs.every(function(x,i){return !i || Math.abs(x-xs[i-1]-dx)<.01;});}
  function publish(s){var b=initial.score;return feasible(s) && s.shape<=b.shape+1e-9 && (s.area<=b.area*1.03 && s.length<b.length*.98 || (s.crossings<b.crossings || s.incidentCrossings<b.incidentCrossings) && s.length<=b.length*.95);}
  for(var pass=0;pass<AUTO_ARRANGE_GEOMETRY_LIMITS.passes && checks<budget;pass++){
    var points=ids.map(function(id){return current.positions.find(function(p){return p.id===id;});}),queues={fan:[],slot:[],block:[],pair:[]},seen=new Set(),proposed=0,oldColumns=new Set(points.map(function(p){return p.x;})).size;
    function propose(changes,type){
      if(proposed++>=AUTO_ARRANGE_GEOMETRY_LIMITS.proposals)return;
      var placed=points.map(function(p,i){return changes[i]?{id:p.id,x:changes[i].x,y:changes[i].y}:p;}),key=placed.map(function(p){return p.x+','+p.y;}).join(';');
      if(seen.has(key) || !clear(placed))return;seen.add(key);
      if(new Set(placed.map(function(p){return p.x;})).size>oldColumns)return;
      var length=links.reduce(function(sum,e){return sum+Math.hypot(placed[e[0]].x-placed[e[1]].x,placed[e[0]].y-placed[e[1]].y);},0);
      var w=Math.max.apply(null,placed.map(function(p){return p.x;}))-Math.min.apply(null,placed.map(function(p){return p.x;}))+150,h=Math.max.apply(null,placed.map(function(p){return p.y;}))-Math.min.apply(null,placed.map(function(p){return p.y;}))+44;
      if(length>initial.score.length*1.03 || w*h>initial.score.area*1.5 || w/h<.65 || w/h>1.8)return;
      var center=points.reduce(function(sum,p){return sum+p.x;},0)/n,balance=placed.reduce(function(sum,p){return sum+Math.abs(p.x-center);},0);
      queues[type].push({positions:placed,length:length,balance:balance,moved:new Set(Object.keys(changes).map(Number))});
    }
    // Short source corridors occupy one side of their shared input hub; a
    // separate terminal input uses a perpendicular side.
    chains.forEach(function(chain){if(chain.ids.length<2 || !links.some(function(e){return e[0]===chain.ids[0] && e[1]===chain.anchor;}))return;
      var outward=links.filter(function(e){return e[0]===chain.anchor;}).reduce(function(sum,e){return sum+points[e[1]].y-points[chain.anchor].y;},0);
      var singles=chains.filter(function(other){return other.anchor===chain.anchor && other.ids.length===1 && links.some(function(e){return e[0]===other.ids[0] && e[1]===other.anchor;});});
      singles.forEach(function(single){[[1,0],[-1,0]].forEach(function(dir){[-1,1].forEach(function(side){if(outward*dir[0]*side>0)return;var changes={},anchor=points[chain.anchor];chain.ids.forEach(function(id,i){changes[id]={x:anchor.x+dir[0]*dx*(i+1),y:anchor.y+dir[1]*dy*(i+1)};});changes[single.ids[0]]={x:anchor.x-dir[1]*side*dx,y:anchor.y+dir[0]*side*dy};propose(changes,'fan');});});});
    });
    ids.forEach(function(id,i){if(fanNodes.has(i) || corridorNodes.has(i) || blockHubNodes.has(i))return;adj[i].forEach(function(j){var p=points[i],q=points[j];[{x:q.x,y:p.y},{x:p.x,y:q.y}].forEach(function(point){var changes={};changes[i]=point;propose(changes,'slot');});});});
    ids.forEach(function(id,i){if(fanNodes.has(i) || corridorNodes.has(i) || blockHubNodes.has(i))return;[[1,0],[-1,0],[0,1],[0,-1]].forEach(function(step){var changes={};changes[i]={x:points[i].x+step[0]*dx,y:points[i].y+step[1]*dy};propose(changes,'slot');});});
    links.forEach(function(link){if(link.some(function(i){return fanNodes.has(i) || corridorNodes.has(i) || blockHubNodes.has(i);}))return;if(points[link[0]].x!==points[link[1]].x && points[link[0]].y!==points[link[1]].y)return;
      [[1,0],[-1,0],[0,1],[0,-1]].forEach(function(step){var changes={};link.forEach(function(i){changes[i]={x:points[i].x+step[0]*dx,y:points[i].y+step[1]*dy};});propose(changes,'pair');
        var collisions=points.map(function(p,i){return i;}).filter(function(i){return link.indexOf(i)<0 && link.some(function(j){return Math.hypot(Math.max(0,Math.abs(points[i].x-changes[j].x)-150),Math.max(0,Math.abs(points[i].y-changes[j].y)-44))<AUTO_ARRANGE_CARD_GAP-.1;});});
        if(collisions.length===1){var i=collisions[0];if(!fanNodes.has(i) && !corridorNodes.has(i) && !blockHubNodes.has(i))[[0,-1],[0,1],[-1,0],[1,0]].forEach(function(move){var placed=Object.assign({},changes);placed[i]={x:points[i].x+move[0]*dx,y:points[i].y+move[1]*dy};propose(placed,'pair');});}
});
    });
    blocks.forEach(function(block){var attached=chains.filter(function(chain){return chain.ids.length>=2 && block.indexOf(chain.anchor)>=0 && chain.ids.every(function(i){return block.indexOf(i)>=0;});});if(!attached.length)return;
      var tails=new Set();attached.forEach(function(chain){chain.ids.forEach(function(i){tails.add(i);});});var core=block.filter(function(i){return !tails.has(i);});if(core.length<4)return;
      for(var sx=-2;sx<=2;sx++)for(var sy=-1;sy<=1;sy++){
        if(!sx && !sy)continue;
        var changes={};core.forEach(function(i){changes[i]={x:points[i].x+sx*dx,y:points[i].y+sy*dy};});
        // A two-link connector can stay between its old outer neighbor and the
        // translated block. Try alignment with the translated inner endpoint.
        var connectors=[];core.forEach(function(i){adj[i].forEach(function(j){if(block.indexOf(j)<0 && adj[j].length===2 && connectors.indexOf(j)<0)connectors.push(j);});});
        connectors.forEach(function(j){var inner=adj[j].find(function(i){return core.indexOf(i)>=0;});changes[j]={x:changes[inner].x,y:points[j].y};});
        attached.forEach(function(chain){var anchor=changes[chain.anchor];[[0,1],[0,-1]].forEach(function(first){[[1,0],[-1,0]].forEach(function(rest){if(first[0]*rest[0]+first[1]*rest[1]!==0)return;var placed=Object.assign({},changes);chain.ids.forEach(function(id,i){placed[id]={x:anchor.x+first[0]*dx+rest[0]*dx*i,y:anchor.y+first[1]*dy+rest[1]*dy*i};});propose(placed,'block');});});});
      }
    });
    Object.keys(queues).forEach(function(type){queues[type].sort(function(a,b){return Math.abs(a.length-b.length)>.01?a.length-b.length:a.balance-b.balance;});});
    var proposals=[];for(var i=0;i<12;i++)['fan','slot','block','pair'].forEach(function(type){if(queues[type][i])proposals.push(queues[type][i]);});
    var next=current,limit=Math.min(budget,checks+Math.ceil(budget/AUTO_ARRANGE_GEOMETRY_LIMITS.passes));
    for(var i=0;i<proposals.length && checks<limit;i++){
      var p=proposals[i];checks++;var candidate={positions:p.positions,edges:current.edges.map(function(e,j){return p.moved.has(links[j][0]) || p.moved.has(links[j][1])?{}:e;})};candidate=natural(candidate);
      if(!feasible(candidate.score) || quality(candidate.score,next.score)>=0){try{var placed=Object.create(null);p.positions.forEach(function(p){placed[p.id]=p;});candidate=natural(autoArrangeRead(d,viz.renderJSON(autoArrangeDot(d,'TB',placed),{engine:'nop2'})));}catch(ex){continue;}}
      if(feasible(candidate.score) && quality(candidate.score,next.score)<0)next=candidate;
      if(publish(candidate.score) && lattice(candidate.positions) && candidate.score.crossings<=best.score.crossings && candidate.score.incidentCrossings<=best.score.incidentCrossings && quality(candidate.score,best.score)<0)best=candidate;
    }
    if(next===current)break;current=next;
  }
  // Reuse the normal clearance floor to compact composed rows. If a private
  // candidate is narrow, test a meaningful outer branch move before compaction.
  var finishing=[current],basePoints=current.positions,outer=[];
  basePoints.forEach(function(p,i){if(fanNodes.has(ids.indexOf(p.id)) || corridorNodes.has(ids.indexOf(p.id)) || blockCoreNodes.has(ids.indexOf(p.id)))return;[-1,1].forEach(function(sign){var positions=basePoints.map(function(q,j){return {id:q.id,x:q.x+(i===j?sign*dx:0),y:q.y};});if(clear(positions))outer.push({positions:positions,edges:current.edges});});});
  links.forEach(function(link){if(link.some(function(i){return fanNodes.has(i) || corridorNodes.has(i) || blockCoreNodes.has(i);}))return;[-1,1].forEach(function(sign){var positions=basePoints.map(function(p){return {id:p.id,x:p.x+(link.indexOf(ids.indexOf(p.id))>=0?sign*dx:0),y:p.y};});if(clear(positions))outer.push({positions:positions,edges:current.edges});});});
  finishing=finishing.concat(outer);
  var finishProposals=[];
  finishing.forEach(function(candidate){[1,(44+AUTO_ARRANGE_CARD_GAP+6)/dy,(44+AUTO_ARRANGE_CARD_GAP)/dy].forEach(function(scale){
    var top=Math.min.apply(null,candidate.positions.map(function(p){return p.y;})),positions=candidate.positions.map(function(p){return {id:p.id,x:p.x,y:top+(p.y-top)*scale};});if(!clear(positions))return;
    var w=Math.max.apply(null,positions.map(function(p){return p.x;}))-Math.min.apply(null,positions.map(function(p){return p.x;}))+150,h=Math.max.apply(null,positions.map(function(p){return p.y;}))-top+44;
    if(w/h<1 || w/h>16/9 || w*h>initial.score.area*1.5)return;
    var byId=Object.fromEntries(positions.map(function(p){return [p.id,p];})),length=edges.reduce(function(sum,e){return sum+Math.hypot(byId[e.from].x-byId[e.to].x,byId[e.from].y-byId[e.to].y);},0);
    if(length<=initial.score.length*.95)finishProposals.push({positions:positions,length:length});
  });});
  finishProposals.sort(function(a,b){return a.length-b.length;});
  for(var i=0;i<Math.min(AUTO_ARRANGE_GEOMETRY_LIMITS.finishing,Math.floor(AUTO_ARRANGE_GEOMETRY_LIMITS.finishWork*32/(n*n*Math.max(1,edges.length))),finishProposals.length);i++){
    try{var placed=Object.create(null);finishProposals[i].positions.forEach(function(p){placed[p.id]=p;});var candidate=natural(autoArrangeRead(d,viz.renderJSON(autoArrangeDot(d,'TB',placed),{engine:'nop2'})));if(publish(candidate.score) && lattice(candidate.positions) && candidate.score.crossings<=best.score.crossings && candidate.score.incidentCrossings<=best.score.incidentCrossings && quality(candidate.score,best.score)<0)best=candidate;}catch(ex){}
  }
  // Row compaction changes the route geometry. Revisit a bounded shortlist of
  // nearby free slots after it, keeping composed hubs and terminal paths intact.
  // Branch nodes may use diagonal slots. Center-ray crowding breaks close route
  // choices. With equal crossing counts, sampled length can grow at most 1%
  // per accepted move and never beyond the pre-polish drawing. Spare checks
  // may finish a later pass.
  var polishBudget=Math.min(AUTO_ARRANGE_GEOMETRY_LIMITS.polishing,Math.floor(AUTO_ARRANGE_GEOMETRY_LIMITS.polishWork*32/(n*n*Math.max(1,edges.length)))),polished=0,polishInitial=best;
  function crowding(positions){return autoArrangeFanCrowding(ids.map(function(id){return positions.find(function(p){return p.id===id;});}),adj);}
  for(var pass=0;pass<6 && polished<polishBudget;pass++){
    var source=best,xs=Array.from(new Set(source.positions.map(function(p){return p.x;}))).sort(function(a,b){return a-b;}),ys=Array.from(new Set(source.positions.map(function(p){return p.y;}))).sort(function(a,b){return a-b;}),choices=[],sourceCrowding=crowding(source.positions);
    source.positions.forEach(function(p,i){var index=ids.indexOf(p.id);if(fanNodes.has(index) || corridorNodes.has(index) || blockHubNodes.has(index))return;
      var x=xs.indexOf(p.x),y=ys.indexOf(p.y);[[x-1,y],[x+1,y],[x,y-1],[x,y+1]].concat(adj[index].length>=3?[[x-1,y-1],[x+1,y-1],[x-1,y+1],[x+1,y+1]]:[]).forEach(function(cell){if(xs[cell[0]]===undefined || ys[cell[1]]===undefined)return;
        var positions=source.positions.map(function(q,j){return i===j?{id:q.id,x:xs[cell[0]],y:ys[cell[1]]}:q;});if(!clear(positions))return;
        var byId=Object.fromEntries(positions.map(function(p){return [p.id,p];})),length=edges.reduce(function(sum,e){return sum+Math.hypot(byId[e.from].x-byId[e.to].x,byId[e.from].y-byId[e.to].y);},0);
        var fan=crowding(positions);if(length<=source.score.length*1.015 && length+fan<source.score.length+sourceCrowding-.1)choices.push({positions:positions,length:length,fan:fan});
      });
    });choices.sort(function(a,b){return a.length+a.fan-b.length-b.fan;});
    var limit=Math.min(polishBudget,polished+Math.ceil(polishBudget/4));
    for(var i=0;i<choices.length && polished<limit;i++){
      polished++;try{var placed=Object.create(null);choices[i].positions.forEach(function(p){placed[p.id]=p;});var candidate=natural(autoArrangeRead(d,viz.renderJSON(autoArrangeDot(d,'TB',placed),{engine:'nop2'}))),a=candidate.score,b=best.score;
      // Losing an occupied outer column may be preferable to keeping long
      // branch edges solely to fill a square footprint.
      var compact=autoArrangeCompactColumnTrade(candidate,polishInitial,routeLengths.get(a),routeLengths.get(polishInitial.score));
      if((publish(a) || compact && feasible(a)) && lattice(candidate.positions) && a.crossings<=b.crossings && a.incidentCrossings<=b.incidentCrossings && a.area<=b.area*1.01 && (a.crossings<b.crossings || a.incidentCrossings<b.incidentCrossings || routeLengths.get(a)<=routeLengths.get(polishInitial.score) && routeLengths.get(a)<=routeLengths.get(b)*1.01 && routeLengths.get(a)+crowding(candidate.positions)<routeLengths.get(b)+crowding(best.positions)-.1))best=candidate;}catch(ex){}
    }
    if(best===source)break;
  }
  return best;
}
function autoArrangeFoldedPositions(d,result,preserveSeedOrder){
  var ids=Object.keys(d.nodes),edges=d.edges || [],count=ids.length;
  // Folding is only useful for a deep ranked graph with a unary entrance.
  // Keep already compact, multi-source, grouped and large diagrams untouched.
  if(count>AUTO_ARRANGE_FOLD_LIMITS.nodes || edges.length>AUTO_ARRANGE_FOLD_LIMITS.edges || count<8 || ids.some(function(id){return d.nodes[id].group;}))return [];
  var incoming=ids.map(function(){return [];}),outgoing=ids.map(function(){return [];});
  var links=edges.map(function(e){var a=ids.indexOf(e.from),b=ids.indexOf(e.to);outgoing[a].push(b);incoming[b].push(a);return [a,b];});
  var sources=ids.map(function(id,i){return i;}).filter(function(i){return !incoming[i].length;});
  if(sources.length!==1)return [];
  var columns=Math.ceil(Math.sqrt(count)),rows=Math.ceil(count*1.5/columns),entrance=[],node=sources[0];
  while(outgoing[node].length===1 && entrance.indexOf(node)<0){
    entrance.push(node);var next=outgoing[node][0];if(incoming[next].length!==1)break;node=next;
  }
  var old=Object.create(null);result.positions.forEach(function(p){old[p.id]=p;});
  if(entrance.length<3 || entrance.length>columns || new Set(result.positions.map(function(p){return p.y;})).size<rows+2)return [];
  var forward=links.map(function(e){return old[ids[e[1]]].y>=old[ids[e[0]]].y;}),siblings=[];
  // Parallel two-hop branches retain a common processing row. Other branches
  // can turn sideways or share their parent's row to shorten the deep spine.
  outgoing.forEach(function(children){children.forEach(function(a,i){children.slice(i+1).forEach(function(b){
    if(outgoing[a].some(function(join){return outgoing[b].indexOf(join)>=0 && (preserveSeedOrder===false || old[ids[join]].y>Math.max(old[ids[a]].y,old[ids[b]].y));}))siblings.push([a,b]);
  });});});
  var dx=150+AUTO_ARRANGE_CARD_GAP,dy=Math.ceil((44+AUTO_ARRANGE_RANK_GAP)/12)*12,size=columns*rows,slots=size*size;
  // At the 20-node cap there are at most 30 cells: card occupancy fits a
  // 32-bit mask and the route-pair cache stays below one megabyte.
  var xs=[],ys=[],distance=new Float64Array(slots),hits=new Uint32Array(slots),crossings=new Uint8Array(slots*slots);
  for(var cell=0;cell<size;cell++){xs[cell]=(cell%columns)*dx;ys[cell]=Math.floor(cell/columns)*dy;}
  function side(a,b,c){return (xs[b]-xs[a])*(ys[c]-ys[a])-(ys[b]-ys[a])*(xs[c]-xs[a]);}
  for(var a=0;a<size;a++)for(var b=0;b<size;b++){
    var route=a*size+b;distance[route]=Math.hypot(xs[b]-xs[a],ys[b]-ys[a])+(xs[a]!==xs[b] && ys[a]!==ys[b]?150:0);
    for(var c=0;c<size;c++){
      if(c===a || c===b)continue;
      var enter=0,leave=1;
      [[xs[a],xs[b]-xs[a],xs[c]-75,xs[c]+75],[ys[a],ys[b]-ys[a],ys[c]-22,ys[c]+22]].forEach(function(axis){
        if(!axis[1]){if(axis[0]<=axis[2] || axis[0]>=axis[3])leave=-1;return;}
        var t=(axis[2]-axis[0])/axis[1],u=(axis[3]-axis[0])/axis[1];enter=Math.max(enter,Math.min(t,u));leave=Math.min(leave,Math.max(t,u));
      });
      if(enter<leave)hits[route]|=1<<c;
    }
    for(var c=0;c<size;c++)for(var e=0;e<size;e++){
      if(side(a,b,c)*side(a,b,e)<0 && side(c,e,a)*side(c,e,b)<0)crossings[route*slots+c*size+e]=1;
    }
  }
  var pairs=[];links.forEach(function(e,i){links.slice(i+1).forEach(function(f,j){if(e[0]!==f[0] && e[0]!==f[1] && e[1]!==f[0] && e[1]!==f[1])pairs.push([i,i+j+1]);});});
  function score(cells){
    var occupied=0,value=0,routes=[];cells.forEach(function(cell){occupied|=1<<cell;});
    links.forEach(function(e,i){
      var a=cells[e[0]],b=cells[e[1]],route=a*size+b;routes.push(route);value+=distance[route];
      if(preserveSeedOrder!==false && forward[i] && ys[b]<ys[a])value+=10000;
      var blocked=hits[route]&occupied;while(blocked){value+=1500;blocked&=blocked-1;}
    });
    pairs.forEach(function(p){value+=1500*crossings[routes[p[0]]*slots+routes[p[1]]];});
    siblings.forEach(function(p){value+=4*Math.abs(ys[cells[p[0]]]-ys[cells[p[1]]]);});
    return value;
  }
  var movable=ids.map(function(id,i){return i;}).filter(function(i){return entrance.indexOf(i)<0;}),state=1,finalists=[];
  function random(){state=(1664525*state+1013904223)>>>0;return state/4294967296;}
  // Fixed seeds and swaps can leave a local minimum; only a handful of finalists
  // pay for actual viewer geometry or native routing. Cell geometry is cached.
  for(var run=0;run<AUTO_ARRANGE_FOLD_LIMITS.runs;run++){
    var available=[];for(var cell=columns;cell<size;cell++)available.push(cell);
    for(var i=available.length-1;i>0;i--){var j=Math.floor(random()*(i+1)),swap=available[i];available[i]=available[j];available[j]=swap;}
    var cells=[];entrance.forEach(function(node,i){cells[node]=columns-entrance.length+i;});movable.forEach(function(node,i){cells[node]=available[i];});
    var value=score(cells),best=cells.slice(),bestValue=value;
    for(var step=0;step<AUTO_ARRANGE_FOLD_LIMITS.steps;step++){
      var index=movable[Math.floor(random()*movable.length)],cell=columns+Math.floor(random()*(size-columns)),other=cells.indexOf(cell),next=cells.slice();
      next[index]=cell;if(other>=0)next[other]=cells[index];var cost=score(next),temperature=1000*Math.pow(.001,step/AUTO_ARRANGE_FOLD_LIMITS.steps);
      if(cost<value || random()<Math.exp((value-cost)/temperature)){cells=next;value=cost;}
      if(cost<bestValue){best=next;bestValue=cost;}
    }
    // Retain the old ordered seed alongside the direction-free alternatives.
    if(preserveSeedOrder!==false && links.some(function(e,i){return forward[i] && ys[best[e[1]]]<ys[best[e[0]]];}))continue;
    if(siblings.some(function(p){return ys[best[p[0]]]!==ys[best[p[1]]];}))continue;
    var key=best.join(',');if(finalists.some(function(f){return f.key===key;}))continue;
    finalists.push({key:key,cost:bestValue,cells:best});
  }
  finalists.sort(function(a,b){
    if(a.cost!==b.cost)return a.cost-b.cost;
    for(var i=0;i<count;i++)if(a.cells[i]!==b.cells[i])return a.cells[i]-b.cells[i];return 0;
  });
  return finalists.slice(0,AUTO_ARRANGE_FOLD_LIMITS.finalists).map(function(finalist){
    var positions=Object.create(null),usedColumns=Array.from(new Set(finalist.cells.map(function(cell){return cell%columns;}))).sort(function(a,b){return a-b;}),usedRows=Array.from(new Set(finalist.cells.map(function(cell){return Math.floor(cell/columns);}))).sort(function(a,b){return a-b;});
    ids.forEach(function(id,i){var cell=finalist.cells[i];positions[id]={x:120+usedColumns.indexOf(cell%columns)*dx,y:100+usedRows.indexOf(Math.floor(cell/columns))*dy};});return positions;
  });
}
function autoArrangeGridPositions(d,result,preserveSeedOrder,options){
  var ids=Object.keys(d.nodes),edges=d.edges || [],count=ids.length;
  var cleanBlock=options && options.cleanBlock===true && count>=5 && count<=12;
  // Spend this optional budget only on unresolved routing. Already natural,
  // crossing-free layouts keep their approved structure and exact positions.
  // Only the separately bounded small-block caller opts into clean repacking.
  if(count<4 || count>AUTO_ARRANGE_GRID_LIMITS.nodes || edges.length>AUTO_ARRANGE_GRID_LIMITS.edges ||
    ids.some(function(id){return d.nodes[id].group;}) || edges.some(function(e){return e.from===e.to;}) ||
    !cleanBlock && !result.score.crossings && !result.edges.some(function(e){return hasCubicCurve(e);}))return [];
  var old=Object.create(null);result.positions.forEach(function(p){old[p.id]=p;});
  var links=edges.map(function(e){return [ids.indexOf(e.from),ids.indexOf(e.to)];});
  var forward=edges.map(function(e){return old[e.to].y>=old[e.from].y;}),peers=[];
  // Keep recognizable shared ranks when connected branches already share a
  // parent or join. Arrow direction does not constrain relative row order.
  for(var a=0;a<count;a++)for(var b=a+1;b<count;b++){
    if(old[ids[a]].y!==old[ids[b]].y)continue;
    if(links.some(function(e){return e[0]===a && links.some(function(f){return f[0]===b && f[1]===e[1];});}) ||
      links.some(function(e){return e[1]===a && links.some(function(f){return f[1]===b && f[0]===e[0];});}))peers.push([a,b]);
  }
  var columns=Math.ceil(Math.sqrt(count)),rows=Math.ceil(count*1.65/columns),size=columns*rows;
  var dx=150+AUTO_ARRANGE_CARD_GAP,dy=Math.ceil((44+AUTO_ARRANGE_RANK_GAP)/12)*12;
  var cells=[],paths=[],lookup=new Int32Array(size*size),distance=[],hitLow=[],hitHigh=[];
  for(var i=0;i<size;i++)cells.push({cx:(i%columns)*dx,cy:Math.floor(i/columns)*dy,w:150,h:44,free:true,float:true});
  // Unadjusted automatic curves depend only on the two occupied cells. Cache
  // their hits with the viewer's avoidance margin. Two masks cover <=35 cells.
  // A six-point crossing estimate keeps search cheap; finalists are checked
  // with the full viewer sampler, avoidance, overlaps and occupied bounds.
  for(var a=0;a<size;a++)for(var b=a+1;b<size;b++){
    var path=samplePathD(edgePath({from:'a',to:'b'},{pos:{a:cells[a],b:cells[b]}})),index=paths.length,low=0,high=0;
    lookup[a*size+b]=lookup[b*size+a]=index;
    var coarse=path.filter(function(p,i){return i%5===0 || i===path.length-1;}),segments=[];
    for(var j=1;j<coarse.length;j++){
      var p=coarse[j-1],q=coarse[j];segments.push({x:p.x,y:p.y,dx:q.x-p.x,dy:q.y-p.y,left:Math.min(p.x,q.x),right:Math.max(p.x,q.x),top:Math.min(p.y,q.y),bottom:Math.max(p.y,q.y)});
    }
    paths.push(segments);
    distance[index]=Math.hypot(cells[a].cx-cells[b].cx,cells[a].cy-cells[b].cy);
    for(var c=0;c<size;c++)if(c!==a && c!==b && countPathRectHits(path,[{x:cells[c].cx-75-AVOID_MARGIN,y:cells[c].cy-22-AVOID_MARGIN,w:150+2*AVOID_MARGIN,h:44+2*AVOID_MARGIN}])){
      if(c<32)low|=1<<c;else high|=1<<(c-32);
    }
    hitLow.push(low);hitHigh.push(high);
  }
  var cache=new Uint8Array(paths.length*paths.length),pairs=[];
  edges.forEach(function(e,i){edges.slice(i+1).forEach(function(f,j){pairs.push([i,i+j+1]);});});
  function cross(a,b){
    var key=a*paths.length+b;if(cache[key])return cache[key]-1;
    // Segment bounds and deltas are reused across every candidate. Avoid
    // repeating the full geometry sampler in this inner search loop.
    var first=paths[a],second=paths[b];
    for(var i=0;i<first.length;i++)for(var j=0;j<second.length;j++){
      var p=first[i],q=second[j];
      if(p.right<q.left || q.right<p.left || p.bottom<q.top || q.bottom<p.top)continue;
      var x=q.x-p.x,y=q.y-p.y,s=p.dx*y-p.dy*x,t=q.dx*y-q.dy*x;
      if(s*(s+p.dx*q.dy-p.dy*q.dx)<-1e-8 && t*(t+q.dy*p.dx-q.dx*p.dy)<-1e-8){cache[key]=2;return 1;}
    }
    cache[key]=1;return 0;
  }
  function score(placed){
    var low=0,high=0,value=0,routes=[];
    for(var i=0;i<count;i++){if(placed[i]<32)low|=1<<placed[i];else high|=1<<(placed[i]-32);}
    for(var i=0;i<links.length;i++){
      var e=links[i],a=placed[e[0]],b=placed[e[1]],route=lookup[a*size+b];routes.push(route);value+=distance[route];
      var drop=cells[a].cy-cells[b].cy;if(preserveSeedOrder!==false && forward[i] && drop>0)value+=40*drop;
      var blocked=hitLow[route]&low;while(blocked){value+=4000;blocked&=blocked-1;}
      blocked=hitHigh[route]&high;while(blocked){value+=4000;blocked&=blocked-1;}
    }
    for(var i=0;i<pairs.length;i++)value+=4000*cross(routes[pairs[i][0]],routes[pairs[i][1]]);
    for(var i=0;i<peers.length;i++)value+=4*Math.abs(cells[placed[peers[i][0]]].cy-cells[placed[peers[i][1]]].cy);
    return value;
  }
  var state=1,finalists=[];
  function random(){state=(1664525*state+1013904223)>>>0;return state/4294967296;}
  for(var run=0;run<AUTO_ARRANGE_GRID_LIMITS.runs;run++){
    var available=[];for(var i=0;i<size;i++)available.push(i);
    for(var i=size-1;i>0;i--){var j=Math.floor(random()*(i+1)),swap=available[i];available[i]=available[j];available[j]=swap;}
    var placed=available.slice(0,count),value=score(placed),best=placed.slice(),bestValue=value;
    for(var step=0;step<AUTO_ARRANGE_GRID_LIMITS.steps;step++){
      var index=Math.floor(random()*count),cell=Math.floor(random()*size),other=placed.indexOf(cell),next=placed.slice();
      next[index]=cell;if(other>=0)next[other]=placed[index];
      var cost=score(next),temperature=2500*Math.pow(.002,step/AUTO_ARRANGE_GRID_LIMITS.steps);
      if(cost<value || random()<Math.exp((value-cost)/temperature)){placed=next;value=cost;}
      if(cost<bestValue){best=next;bestValue=cost;}
    }
    var key=best.join(',');if(!finalists.some(function(f){return f.key===key;}))finalists.push({key:key,cost:bestValue,cells:best});
  }
  finalists.sort(function(a,b){return a.cost-b.cost;});
  return finalists.slice(0,AUTO_ARRANGE_GRID_LIMITS.finalists).map(function(finalist){
    var xs=finalist.cells.map(function(cell){return cells[cell].cx;}),ys=finalist.cells.map(function(cell){return cells[cell].cy;});
    var width=Math.max.apply(null,xs)-Math.min.apply(null,xs)+150,height=Math.max.apply(null,ys)-Math.min.apply(null,ys)+44,gap=dy;
    // A compact candidate may occupy fewer rows than the search grid. Restore
    // a readable aspect with regular spacing, then recheck actual curves.
    if(width/height>16/9 && height>44)gap=Math.ceil((width/1.5-44)/(height-44)*dy/12)*12;
    return {positions:ids.map(function(id,i){var p=cells[finalist.cells[i]];return {id:id,x:120+p.cx,y:100+p.cy/dy*gap};}),edges:edges.map(function(){return {};})};
  });
}
function autoArrangeExpandedPitch(positions,axis,extent,fallback,multiplier){
  var values=positions.map(function(p){return p[axis];}).sort(function(a,b){return a-b;}),lines=[];
  values.forEach(function(value){if(!lines.length || Math.abs(value-lines[lines.length-1])>.1)lines.push(value);});
  var intervals=lines.slice(1).map(function(value,i){return value-lines[i];}),wide=intervals.filter(function(gap){return gap>extent+.1;});
  var pitch=wide.length?Math.min.apply(null,wide):fallback;
  if(intervals.some(function(gap){var n=Math.round(gap/pitch);return n<1 || Math.abs(gap-n*pitch)>.1;}))pitch=fallback;
  // Large regular whitespace is aspect padding (or empty lattice slots), not
  // a card gap. Calibrate it from the canonical pitch so it is not magnified.
  if(pitch>extent+3*(fallback-extent)+.1)pitch=fallback;
  return {pitch:pitch,scale:(extent+multiplier*(pitch-extent))/pitch};
}
function autoArrangeExpandedPositions(result){
  var horizontal=autoArrangeExpandedPitch(result.positions,'x',150,204,2.5),vertical=autoArrangeExpandedPitch(result.positions,'y',44,98,1.5);
  var left=Math.min.apply(null,result.positions.map(function(p){return p.x;})),top=Math.min.apply(null,result.positions.map(function(p){return p.y;}));
  var positions=result.positions.map(function(p){return {id:p.id,x:left+(p.x-left)*horizontal.scale,y:top+(p.y-top)*vertical.scale};});
  return {positions:positions,horizontal:horizontal,vertical:vertical};
}
function autoArrangeExpandSpacing(d,result,viz){
  var expandedPositions=autoArrangeExpandedPositions(result),positions=expandedPositions.positions;
  var horizontal=expandedPositions.horizontal,vertical=expandedPositions.vertical;
  var edges=result.edges.map(function(e){
    if(!e.curveControls)return {};
    var copy=Object.assign({},e);copy.curveControls=e.curveControls.map(function(p){return {t:p.t,dx:p.dx*horizontal.scale,dy:p.dy*vertical.scale};});
    if(copy.labelDx!=null)copy.labelDx*=horizontal.scale;if(copy.labelDy!=null)copy.labelDy*=vertical.scale;return copy;
  });
  function safe(candidate){candidate.score=autoArrangeScore(d,candidate);var a=candidate.score,b=result.score;
    return !a.overlaps && !a.hits && a.crossings<=b.crossings && a.incidentCrossings<=b.incidentCrossings;
  }
  var expanded=autoArrangeNaturalRoutes(d,{positions:positions,edges:edges},true);
  if(safe(expanded))return expanded;
  try{
    var placed=Object.create(null);positions.forEach(function(p){placed[p.id]={x:p.x,y:p.y};});
    var routed=autoArrangeRead(d,viz.renderJSON(autoArrangeDot(d,'LR',placed),{engine:'nop2'}));
    routed.positions=positions;routed=autoArrangeNaturalRoutes(d,routed,true);if(safe(routed))return routed;
  }catch(ex){}
  throw new Error('Could not expand layout spacing with clear cards and connections. The diagram is unchanged.');
}
// Count visible cardinal adjacency, excluding a straight corridor occupied by
// another card even when automatic avoidance manages to bow around that card.
function autoArrangeVisibleLinks(d,positions){
  var points=Object.fromEntries(positions.map(function(p){return [p.id,p];})),clear=0,blocked=0;
  (d.edges || []).forEach(function(e){var a=points[e.from],b=points[e.to];if(!a || !b || a===b)return;
    var vertical=Math.abs(a.x-b.x)<.1,horizontal=Math.abs(a.y-b.y)<.1;if(!vertical && !horizontal)return;
    if(positions.some(function(p){return p.id!==a.id && p.id!==b.id && (vertical && Math.abs(p.x-a.x)<75 && (p.y-a.y)*(p.y-b.y)<0 || horizontal && Math.abs(p.y-a.y)<22 && (p.x-a.x)*(p.x-b.x)<0);}))blocked++;else clear++;
  });return {clear:clear,blocked:blocked};
}
// Preserve a recognizable balanced parallel-branch frame when local cleanup
// starts from one. Membership and orientation are independent of arrowheads.
function autoArrangeBranchFrames(d,positions){
  var topology=autoArrangeFlowTopology(d),groups=new Map(),frames=[];
  topology.ids.forEach(function(id){var neighbors=topology.adj[id];if(neighbors.length!==2)return;var key=JSON.stringify(neighbors.slice().sort());if(!groups.has(key))groups.set(key,{ends:neighbors.slice(),branches:[]});groups.get(key).branches.push(id);});
  groups.forEach(function(group){if(group.branches.length<3)return;['x','y'].forEach(function(axis){var frame={ends:group.ends,branches:group.branches,axis:axis};if(autoArrangeBranchesIntact(positions,[frame]))frames.push(frame);});});
  // Parallel two-card branches can have an extra link at either card.
  // Keep each existing peer row and matched columns together, even when the
  // other stage is staggered, rather than improving
  // one branch's cardinal link by pulling it out of the processing band.
  var bands=new Map();
  topology.ids.forEach(function(hub){topology.adj[hub].forEach(function(branch){if(topology.adj[branch].length>3)return;
    topology.adj[branch].forEach(function(store){if(store===hub || topology.adj[store].length<2 || topology.adj[store].length>3)return;
      topology.adj[store].forEach(function(join){if(join===branch || join===hub)return;var key=JSON.stringify([hub,join]);
        if(!bands.has(key))bands.set(key,[]);bands.get(key).push([branch,store]);
      });
    });
  });});
  bands.forEach(function(pairs){if(pairs.length<3)return;
    ['x','y'].forEach(function(axis){var byId=Object.fromEntries(positions.map(function(p){return [p.id,p];})),other=axis==='x'?'y':'x';
      // A side link can create an alternate topological path to the same join.
      // Match the visible columns/rows before deciding whether peers are unique.
      var matched=pairs.filter(function(pair){return Math.abs(byId[pair[0]][other]-byId[pair[1]][other])<.1;});
      if(matched.length<3 || new Set(matched.flat()).size!==matched.length*2)return;
      var rows=[matched.map(function(p){return p[0];}),matched.map(function(p){return p[1];})];
      var aligned=rows.map(function(row){return row.every(function(id){return Math.abs(byId[id][axis]-byId[row[0]][axis])<.1;});});
      var frame={bands:rows,aligned:aligned,axis:axis};if(aligned.some(Boolean) && autoArrangeBranchesIntact(positions,[frame]))frames.push(frame);
    });
  });return frames;
}
function autoArrangeBranchesIntact(positions,frames){
  var points=Object.fromEntries(positions.map(function(p){return [p.id,p];}));
  return frames.every(function(frame){var axis=frame.axis,other=axis==='x'?'y':'x';
    if(frame.bands)return frame.bands.every(function(band,i){return !frame.aligned[i] || band.every(function(id){return Math.abs(points[id][axis]-points[band[0]][axis])<.1;});}) && frame.bands[0].every(function(id,i){return Math.abs(points[id][other]-points[frame.bands[1][i]][other])<.1;});
    var row=points[frame.branches[0]][axis],a=points[frame.ends[0]],b=points[frame.ends[1]],values=frame.branches.map(function(id){return points[id][other];}),middle=(Math.min.apply(null,values)+Math.max.apply(null,values))/2;
    return frame.branches.every(function(id){return Math.abs(points[id][axis]-row)<.1;}) && (a[axis]-row)*(b[axis]-row)<0 && Math.abs(a[other]-middle)<.1 && Math.abs(b[other]-middle)<.1;
  });
}
var AUTO_ARRANGE_READABILITY_LIMITS={nodes:48,edges:80,passes:3,beam:8,slots:8,checks:72,routes:18};
// Consolidate a sparse row into nearby connected slots after spacing has
// expanded. Only row-removal proposals may trade aspect for a smaller drawing;
// every accepted route still respects both crossing budgets and wide clearance.
function autoArrangeReadability(d,result,viz){
  var ids=Object.keys(d.nodes),edges=d.edges || [],limits=AUTO_ARRANGE_READABILITY_LIMITS;
  if(ids.length<5 || ids.length>limits.nodes || edges.length>limits.edges || ids.some(function(id){return d.nodes[id].group;}))return result;
  var original=result,best=result,checks=0,routes=0,adj=Object.create(null);
  ids.forEach(function(id){adj[id]=[];});edges.forEach(function(e){if(e.from!==e.to){if(adj[e.from].indexOf(e.to)<0)adj[e.from].push(e.to);if(adj[e.to].indexOf(e.from)<0)adj[e.to].push(e.from);}});
  function gap(a,b){return Math.hypot(Math.max(0,Math.abs(a.x-b.x)-150),Math.max(0,Math.abs(a.y-b.y)-44));}
  var clearance=Infinity;result.positions.forEach(function(p,i){result.positions.slice(i+1).forEach(function(q){clearance=Math.min(clearance,gap(p,q));});});
  function clear(p,placed){return placed.every(function(q){return gap(p,q)>=clearance-.1;});}
  function routeLength(candidate){var out=autoArrangeDiagram(d,candidate),L=layout(out),adjust=autoArrangeAdjust(out,L),sum=0;out.edges.forEach(function(e,i){var p=samplePathD(edgePath(e,L,adjust[i]));for(var j=1;j<p.length;j++)sum+=Math.hypot(p[j].x-p[j-1].x,p[j].y-p[j-1].y);});return sum;}
  var originalRoutes=routeLength(result),originalLinks=autoArrangeVisibleLinks(d,result.positions),frames=autoArrangeBranchFrames(d,result.positions);
  function safe(candidate,source){var a=candidate.score,b=source.score,c=original.score;return !a.overlaps && !a.hits && a.crossings<=b.crossings && a.incidentCrossings<=b.incidentCrossings && a.width<=c.width*1.1+.1 && Math.hypot(a.width,a.height)<=Math.hypot(c.width,c.height)+.1 && a.height<b.height-.1 && a.area<=b.area*.97 && a.length<=c.length*1.035 && autoArrangeVisibleLinks(d,candidate.positions).clear>=originalLinks.clear && autoArrangeBranchesIntact(candidate.positions,frames) && routeLength(candidate)<=originalRoutes*1.05;}
  // Cheap center geometry only shortlists candidates. It is never a safety
  // score: final routes, including avoidance bows, decide whether to publish.
  function estimate(positions){var points=Object.fromEntries(positions.map(function(p){return [p.id,p];})),length=0,diagonal=0,crossings=0;
    edges.forEach(function(e){var a=points[e.from],b=points[e.to];if(!a || !b)return;length+=Math.hypot(a.x-b.x,a.y-b.y);if(Math.abs(a.x-b.x)>.1 && Math.abs(a.y-b.y)>.1)diagonal++;
    });
    function side(a,b,c){return (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);}
    edges.forEach(function(e,i){var a=points[e.from],b=points[e.to];if(!a || !b)return;edges.slice(i+1).forEach(function(f){if(autoArrangeIncident(e,f))return;var c=points[f.from],v=points[f.to];if(c && v && side(a,b,c)*side(a,b,v)<0 && side(c,v,a)*side(c,v,b)<0)crossings++;});});return length+diagonal*150+crossings*600;
  }
  for(var pass=0;pass<limits.passes && checks<limits.checks;pass++){
    var source=best,ys=Array.from(new Set(source.positions.map(function(p){return p.y;}))).sort(function(a,b){return a-b;});if(ys.length<3)break;
    var dy=ys[1]-ys[0];if(dy<44+clearance-.1 || ys.some(function(y,i){return i && Math.abs(y-ys[i-1]-dy)>.1;}))break;
    var left=Math.min.apply(null,source.positions.map(function(p){return p.x;})),right=Math.max.apply(null,source.positions.map(function(p){return p.x;}));
    var dx=150+Math.max(AUTO_ARRANGE_CARD_GAP*2.5,clearance),proposals=[];
    for(var row=0;row<ys.length && checks<limits.checks;row++){
      var y=ys[row],occupants=source.positions.filter(function(p){return p.y===y;});if(occupants.length>4)continue;
      var moved=new Set(occupants.map(function(p){return p.id;})),other=source.positions.filter(function(p){return !moved.has(p.id);}).map(function(p){return {id:p.id,x:p.x,y:p.y>y?p.y-dy:p.y};});
      occupants.sort(function(a,b){return adj[b.id].length-adj[a.id].length;});var beam=[{positions:other,cost:0}];
      for(var oi=0;oi<occupants.length && beam.length;oi++){
        var node=occupants[oi],next=[];
        beam.forEach(function(state){var neighbors=adj[node.id].map(function(id){return state.positions.find(function(p){return p.id===id;});}).filter(Boolean),spots=[];
          var xs=Array.from(new Set([node.x].concat(neighbors.flatMap(function(p){return [p.x,p.x-dx,p.x+dx];})))).filter(function(x){return x>=left-original.score.width*.05-.1 && x<=right+original.score.width*.05+.1;});
          var rows=Array.from(new Set(other.map(function(p){return p.y;}))).filter(function(v){return Math.abs(v-y)<=dy*3+.1;});
          rows.forEach(function(v){xs.forEach(function(x){var p={id:node.id,x:x,y:v};if(clear(p,state.positions)){var cost=neighbors.reduce(function(sum,q){return sum+Math.hypot(p.x-q.x,p.y-q.y)+(Math.abs(p.x-q.x)>.1 && Math.abs(p.y-q.y)>.1?150:0);},0);spots.push({point:p,cost:cost});}});});
          spots.sort(function(a,b){return a.cost-b.cost;});spots.slice(0,limits.slots).forEach(function(spot){var positions=state.positions.concat([spot.point]);next.push({positions:positions,cost:estimate(positions)});});
        });next.sort(function(a,b){return a.cost-b.cost;});beam=next.slice(0,limits.beam);
      }
      beam.forEach(function(state){proposals.push(state);});
    }
    proposals.sort(function(a,b){return a.cost-b.cost;});
    var limit=Math.min(limits.checks,checks+Math.ceil(limits.checks/limits.passes)),bestCost=Infinity,maxCost=estimate(source.positions)+dy;
    for(var i=0;i<proposals.length && checks<limit;i++){
      var positions=source.positions.map(function(p){return proposals[i].positions.find(function(q){return q.id===p.id;});});if(positions.some(function(p){return !p;}))continue;
      if(proposals[i].cost>maxCost)continue;
      var candidate={positions:positions,edges:edges.map(function(){return {};})};checks++;candidate.score=autoArrangeScore(d,candidate);
      if(!safe(candidate,source) && routes<limits.routes && candidate.score.crossings<=source.score.crossings+2){
        routes++;try{var placed=Object.fromEntries(positions.map(function(p){return [p.id,p];}));candidate=autoArrangeRead(d,viz.renderJSON(autoArrangeDot(d,'TB',placed),{engine:'nop2'}));candidate.positions=positions;candidate=autoArrangeNaturalRoutes(d,candidate,true);}catch(ex){continue;}
      }
      if(safe(candidate,source) && proposals[i].cost<bestCost){best=candidate;bestCost=proposals[i].cost;}
    }
    if(best===source)break;
  }
  return best;
}

var AUTO_ARRANGE_FLOW_LIMITS={nodes:48,edges:80,passes:5,checks:64,routes:12,proposals:288};
function autoArrangeFlowTopology(d){
  var ids=Object.keys(d.nodes),adj=Object.create(null),chains=[],fans=[];
  ids.forEach(function(id){adj[id]=[];});
  (d.edges || []).forEach(function(e){if(e.from===e.to)return;
    [[e.from,e.to],[e.to,e.from]].forEach(function(pair){if(adj[pair[0]].indexOf(pair[1])<0)adj[pair[0]].push(pair[1]);});
  });
  ids.forEach(function(id){if(adj[id].length!==1)return;var path=[id],previous=id,current=adj[id][0];
    while(adj[current].length===2 && path.length<5 && path.indexOf(current)<0){path.push(current);var next=adj[current].filter(function(other){return other!==previous;})[0];previous=current;current=next;}
    if(adj[current].length>2 && path.length>=2 && path.length<=4)chains.push({anchor:current,ids:path.reverse()});
  });
  ids.forEach(function(id){var leaves=adj[id].filter(function(other){return adj[other].length===1;});
    if(adj[id].length>=3 && leaves.length && leaves.length<=2)fans.push({anchor:id,ids:leaves});
  });
  return {ids:ids,adj:adj,chains:chains,fans:fans};
}
function autoArrangeFlowSchedule(queues,limit){
  var scheduled=[];
  // Each chain gets its next feasible candidate before any chain gets another.
  for(var round=0;scheduled.length<limit;round++){
    var added=false;
    for(var i=0;i<queues.length && scheduled.length<limit;i++)if(round<queues[i].length){scheduled.push(queues[i][round]);added=true;}
    if(!added)break;
  }
  return scheduled;
}
function autoArrangeFlowStructure(d,positions,topology){
  var points=Object.fromEntries(positions.map(function(p){return [p.id,p];})),blocked=0,turns=0,diagonal=0,fanRows=0,rows=new Map();
  (d.edges || []).forEach(function(e){var a=points[e.from],b=points[e.to];if(Math.abs(a.x-b.x)>.1 && Math.abs(a.y-b.y)>.1)diagonal++;positions.forEach(function(p){if(p.id===a.id || p.id===b.id)return;
    if(Math.abs(a.x-b.x)<.1 && Math.abs(p.x-a.x)<75 && (p.y-a.y)*(p.y-b.y)<0 || Math.abs(a.y-b.y)<.1 && Math.abs(p.y-a.y)<22 && (p.x-a.x)*(p.x-b.x)<0)blocked++;
  });});
  topology.ids.forEach(function(id){var neighbors=topology.adj[id].length===2?topology.adj[id]:topology.adj[id].filter(function(other){return topology.adj[other].length===1;});if(neighbors.length!==2)return;
    var a=points[neighbors[0]],b=points[id],c=points[neighbors[1]],length=Math.hypot(b.x-a.x,b.y-a.y)*Math.hypot(c.x-b.x,c.y-b.y);
    if(length)turns+=1-((b.x-a.x)*(c.x-b.x)+(b.y-a.y)*(c.y-b.y))/length;
  });
  topology.fans.forEach(function(fan){if(fan.ids.length===2)fanRows+=new Set([fan.anchor].concat(fan.ids).map(function(id){return Math.round(points[id].y*100)/100;})).size-1;});
  positions.forEach(function(p){var y=Math.round(p.y*100)/100;rows.set(y,(rows.get(y)||0)+1);});
  return {blocked:blocked,turns:turns,diagonal:diagonal,fanRows:fanRows,sparseRows:Array.from(rows.values()).filter(function(n){return n<3;}).length};
}
function autoArrangeFlowMetrics(d,result,topology){
  topology=topology || autoArrangeFlowTopology(d);
  var structure=autoArrangeFlowStructure(d,result.positions,topology),arranged=autoArrangeDiagram(d,result),L=layout(arranged),adjust=autoArrangeAdjust(arranged,L),routeLength=0,routeExcess=0;
  arranged.edges.forEach(function(e,i){var path=samplePathD(edgePath(e,L,adjust[i])),length=0;
    for(var j=1;j<path.length;j++)length+=Math.hypot(path[j].x-path[j-1].x,path[j].y-path[j-1].y);
    routeLength+=length;routeExcess+=Math.max(0,length-Math.hypot(path[path.length-1].x-path[0].x,path[path.length-1].y-path[0].y));
  });
  return Object.assign(structure,{routeLength:routeLength,routeExcess:routeExcess});
}
// Rotate a terminal chain together with its junction and, if necessary, one
// attached leaf. A linked column can then become clear without squeezing cards.
// This explicit structural trade may grow: aspect is not an acceptance gate.
function autoArrangeFlowClarity(d,result,viz){
  var ids=Object.keys(d.nodes),edges=d.edges || [],limits=AUTO_ARRANGE_FLOW_LIMITS;
  if(ids.length<5 || ids.length>limits.nodes || edges.length>limits.edges || ids.some(function(id){return d.nodes[id].group;}))return result;
  var topology=autoArrangeFlowTopology(d);if(!topology.chains.length && !topology.fans.length)return result;
  var seedPoints=Object.fromEntries(result.positions.map(function(p){return [p.id,p];}));
  function geometricOrder(a,b){return seedPoints[a].x-seedPoints[b].x || seedPoints[a].y-seedPoints[b].y;}
  // Clear cards have distinct centers. Geometry breaks equivalent-topology
  // ties without consulting identifiers, labels, or declaration order.
  topology.ids.sort(geometricOrder);
  topology.fans.forEach(function(fan){fan.ids.sort(geometricOrder);});
  topology.fans.sort(function(a,b){return geometricOrder(a.anchor,b.anchor);});
  topology.chains.sort(function(a,b){return geometricOrder(a.anchor,b.anchor) || geometricOrder(a.ids[0],b.ids[0]);});
  function gap(a,b){return Math.hypot(Math.max(0,Math.abs(a.x-b.x)-150),Math.max(0,Math.abs(a.y-b.y)-44));}
  var clearance=Infinity;result.positions.forEach(function(a,i){result.positions.slice(i+1).forEach(function(b){clearance=Math.min(clearance,gap(a,b));});});
  var dx=150+Math.max(AUTO_ARRANGE_CARD_GAP*2.5,clearance),dy=44+Math.max(AUTO_ARRANGE_CARD_GAP*1.5,clearance);
  var baseline=autoArrangeFlowMetrics(d,result,topology),frames=autoArrangeBranchFrames(d,result.positions),best=result,bestMetrics=baseline,checks=0,routes=0,chainStage=false;
  function quality(metrics,score){return metrics.blocked*dx+(metrics.turns+(chainStage?0:metrics.diagonal+metrics.fanRows*3))*dy+metrics.routeExcess+metrics.routeLength*.1+
    600*Math.max(0,score.area/result.score.area-1)+150*Math.max(0,metrics.sparseRows-baseline.sparseRows);}
  function safe(candidate,metrics){var a=candidate.score,b=best.score,c=result.score;
    return !a.overlaps && !a.hits && a.crossings<=b.crossings && a.incidentCrossings<=b.incidentCrossings && autoArrangeBranchesIntact(candidate.positions,frames) &&
      a.width<=c.width*1.3 && a.height<=c.height*1.3 && a.area<=c.area*1.35 && a.length<=c.length*1.3 && metrics.routeLength<=baseline.routeLength*1.25;
  }
  for(var pass=0;pass<limits.passes && checks<limits.checks;pass++){
    var source=best,points=Object.fromEntries(source.positions.map(function(p){return [p.id,p];})),queues=[],seen=new Set(),proposed=0;
    function propose(changes,queue){
      if(proposed++>=limits.proposals)return;
      var positions=source.positions.map(function(p){return changes[p.id]?{id:p.id,x:changes[p.id].x,y:changes[p.id].y}:p;}),key=positions.map(function(p){return p.x+','+p.y;}).join(';');
      if(seen.has(key))return;seen.add(key);
      if(positions.some(function(a,i){return positions.slice(i+1).some(function(b){return gap(a,b)<clearance-.1;});}))return;
      var xs=positions.map(function(p){return p.x;}),ys=positions.map(function(p){return p.y;}),width=Math.max.apply(null,xs)-Math.min.apply(null,xs)+150,height=Math.max.apply(null,ys)-Math.min.apply(null,ys)+44;
      if(width>result.score.width*1.3 || height>result.score.height*1.3 || width*height>result.score.area*1.35)return;
      queue.push({positions:positions,edges:source.edges.map(function(e,i){return changes[edges[i].from] || changes[edges[i].to]?{}:e;})});
    }
    chainStage=pass<2 && topology.chains.length>0;
    var chains=chainStage?topology.chains:[],fans=chainStage?[]:topology.fans;
    chains.forEach(function(chain){var queue=[];queues.push(queue);[[1,0],[-1,0],[0,1],[0,-1]].forEach(function(direction){[0,1,2].forEach(function(shift){
      var anchor=points[chain.anchor],changes=Object.create(null),sx=direction[0],sy=direction[1];
      changes[chain.anchor]={x:anchor.x-sx*dx*shift,y:anchor.y-sy*dy*shift};
      chain.ids.forEach(function(id,i){changes[id]={x:changes[chain.anchor].x+sx*dx*(i+1),y:changes[chain.anchor].y+sy*dy*(i+1)};});
      var occupied=source.positions.filter(function(p){return !changes[p.id] && Object.keys(changes).some(function(id){return gap(changes[id],p)<clearance-.1;});});
      // Only displace a leaf of the same junction; unrelated blockers are not
      // pushed recursively or assigned arbitrary empty slots.
      if(occupied.length===1 && topology.adj[occupied[0].id].length===1 && topology.adj[occupied[0].id][0]===chain.anchor)
        changes[occupied[0].id]={x:changes[chain.anchor].x-sx*dx,y:changes[chain.anchor].y-sy*dy};
      propose(changes,queue);
    });});});
    fans.forEach(function(fan){var queue=[];queues.push(queue);var anchor=points[fan.anchor];
      if(fan.ids.length===2){
        // Two leaf neighbors read as one straight three-card run, irrespective
        // of whether their arrowheads form a fork, join, or through connection.
        [[1,0],[-1,0],[0,1],[0,-1]].forEach(function(direction){var changes=Object.create(null);
          fan.ids.forEach(function(id,i){var sign=i?1:-1;changes[id]={x:anchor.x+sign*direction[0]*dx,y:anchor.y+sign*direction[1]*dy};});propose(changes,queue);
        });
      }else{
        // Tuck a junction and its leaf together beside another neighbor. All
        // external connections and unrelated blockers remain in the safety test.
        topology.adj[fan.anchor].filter(function(id){return id!==fan.ids[0];}).sort(geometricOrder).forEach(function(id){var neighbor=points[id];
          [{x:anchor.x,y:neighbor.y},{x:neighbor.x,y:anchor.y}].forEach(function(center){
            if(Math.abs(center.x-anchor.x)>dx+.1 || Math.abs(center.y-anchor.y)>dy+.1)return;
            [[0,1],[0,-1],[1,0],[-1,0]].forEach(function(direction){var changes=Object.create(null);changes[fan.anchor]=center;
              changes[fan.ids[0]]={x:center.x+direction[0]*dx,y:center.y+direction[1]*dy};propose(changes,queue);
            });
          });
        });
      }
      // Shortlist each neighborhood's closest cardinal placements first, so a
      // distant external neighbor cannot consume its entire routing allowance.
      queue.map(function(candidate){var structure=autoArrangeFlowStructure(d,candidate.positions,topology),placed=Object.fromEntries(candidate.positions.map(function(p){return [p.id,p];}));
        structure.routeLength=edges.reduce(function(sum,e){var a=placed[e.from],b=placed[e.to];return sum+Math.hypot(a.x-b.x,a.y-b.y);},0);structure.routeExcess=0;
        return {candidate:candidate,cost:quality(structure,source.score)};
      }).sort(function(a,b){return a.cost-b.cost;}).forEach(function(entry,i){queue[i]=entry.candidate;});
    });
    // Every eligible neighborhood gets one check before a no-improvement
    // round can stop the search. Reserve rounds only after that fair first lap.
    var share=chainStage?Math.ceil(limits.checks/4):Math.ceil((limits.checks-checks)/(limits.passes-pass));
    var allowance=Math.min(limits.checks-checks,Math.max(share,queues.filter(function(queue){return queue.length;}).length));
    var proposals=autoArrangeFlowSchedule(queues,allowance),next=best,nextMetrics=bestMetrics;
    for(var i=0;i<proposals.length && checks<limits.checks;i++){
      checks++;var structure=autoArrangeFlowStructure(d,proposals[i].positions,topology);
      // Routing cannot improve these structural measures. Reject doomed
      // proposals before sampling and intersecting the full viewer paths.
      if(structure.blocked>=bestMetrics.blocked && structure.turns>=bestMetrics.turns-.25 && (chainStage || structure.diagonal>=bestMetrics.diagonal && structure.fanRows>=bestMetrics.fanRows))continue;
      var candidate=autoArrangeNaturalRoutes(d,proposals[i],true),metrics=autoArrangeFlowMetrics(d,candidate,topology);
      if(!safe(candidate,metrics) && routes<limits.routes){
        routes++;try{var positions=candidate.positions,placed=Object.fromEntries(positions.map(function(p){return [p.id,p];}));
          candidate=autoArrangeRead(d,viz.renderJSON(autoArrangeDot(d,'TB',placed,null,topology.ids),{engine:'nop2'}),topology.ids);candidate.positions=positions;
          candidate=autoArrangeNaturalRoutes(d,candidate,true);metrics=autoArrangeFlowMetrics(d,candidate,topology);
        }catch(ex){continue;}
      }
      // A noticeable structural gain must pay for growth; tiny numerical route
      // differences cannot author a different composition. Straightening alone
      // must shorten full-graph routes, including the junction's other links.
      if(safe(candidate,metrics) && (metrics.blocked<bestMetrics.blocked || (metrics.turns<bestMetrics.turns-.25 || !chainStage && (metrics.diagonal<bestMetrics.diagonal || metrics.fanRows<bestMetrics.fanRows)) && metrics.routeLength<bestMetrics.routeLength) &&
        quality(metrics,candidate.score)<quality(nextMetrics,next.score)-75){next=candidate;nextMetrics=metrics;}
    }
    if(next===best && (!chainStage || !topology.fans.length))break;best=next;bestMetrics=nextMetrics;
  }
  return best;
}

// Repair the moved neighborhood while retaining the surrounding route choices.
// A whole-graph native replacement can introduce unrelated crossings even when
// its routes incident to the moved card are exactly the repairs we need.
function autoArrangeRerouteAffected(d,source,positions,moved,viz,order){
  var placed=Object.fromEntries(positions.map(function(p){return [p.id,p];}));
  var routed=autoArrangeRead(d,viz.renderJSON(autoArrangeDot(d,'TB',placed,null,order),{engine:'nop2'}),order);
  var edges=source.edges.map(function(edge,i){var e=d.edges[i];return moved.has(e.from) || moved.has(e.to)?routed.edges[i]:edge;});
  return autoArrangeNaturalRoutes(d,{positions:positions,edges:edges},true);
}
var AUTO_ARRANGE_NEIGHBOR_LIMITS={nodes:48,edges:80,passes:4,checks:36,routes:6,proposals:192};
// Separate late budget lets junction proposals explore the central graph without
// displacing the preceding connector and sibling-leaf refinements.
var AUTO_ARRANGE_JUNCTION_LIMITS={nodes:48,edges:80,passes:2,checks:16,routes:4,proposals:192};
var AUTO_ARRANGE_LEAF_LIMITS={nodes:48,edges:80,passes:4,checks:64,routes:4,proposals:192};
var AUTO_ARRANGE_LEAF_TIGHTEN_LIMITS={nodes:48,edges:80,passes:3,checks:24,routes:2,proposals:48};
function autoArrangeLeafTighten(d,result,viz){return autoArrangeNeighborhoodClarity(d,result,viz,'tighten');}
function autoArrangeLeafClarity(d,result,viz){return autoArrangeNeighborhoodClarity(d,result,viz,'leaves');}
function autoArrangeJunctionClarity(d,result,viz){return autoArrangeNeighborhoodClarity(d,result,viz,true);}
function autoArrangeNeighborhoodClarity(d,result,viz,junctions){
  var tighten=junctions==='tighten',leaves=tighten || junctions==='leaves';junctions=junctions===true;
  var ids=Object.keys(d.nodes),edges=d.edges || [],limits=tighten?AUTO_ARRANGE_LEAF_TIGHTEN_LIMITS:leaves?AUTO_ARRANGE_LEAF_LIMITS:junctions?AUTO_ARRANGE_JUNCTION_LIMITS:AUTO_ARRANGE_NEIGHBOR_LIMITS;
  if(ids.length<5 || ids.length>limits.nodes || edges.length>limits.edges || ids.some(function(id){return d.nodes[id].group;}))return result;
  var topology=autoArrangeFlowTopology(d),seed=Object.fromEntries(result.positions.map(function(p){return [p.id,p];})),tails=new Set();
  topology.chains.forEach(function(chain){chain.ids.forEach(function(id){tails.add(id);});});
  ids.sort(function(a,b){return seed[a].x-seed[b].x || seed[a].y-seed[b].y;});
  function gap(a,b){return Math.hypot(Math.max(0,Math.abs(a.x-b.x)-150),Math.max(0,Math.abs(a.y-b.y)-44));}
  var clearance=Infinity;result.positions.forEach(function(a,i){result.positions.slice(i+1).forEach(function(b){clearance=Math.min(clearance,gap(a,b));});});
  var dx=150+Math.max(AUTO_ARRANGE_CARD_GAP*2.5,clearance),dy=44+Math.max(AUTO_ARRANGE_CARD_GAP*1.5,clearance);
  var baseline=autoArrangeFlowMetrics(d,result,topology),best=result,metrics=baseline,checks=0,routes=0,tried=new Set();
  function quality(m,s){return m.blocked*dx+(m.turns+m.diagonal+m.fanRows*3)*dy+m.routeExcess+m.routeLength*.1+
    600*Math.max(0,s.area/result.score.area-1)+150*Math.max(0,m.sparseRows-baseline.sparseRows);}
  for(var pass=0;pass<limits.passes && checks<limits.checks;pass++){
    var source=best,sourceMetrics=metrics,points=Object.fromEntries(source.positions.map(function(p){return [p.id,p];})),frames=autoArrangeBranchFrames(d,source.positions),proposals=[],seen=new Set();
    function propose(id,point){
      if(proposals.length>=limits.proposals || Math.abs(point.x-points[id].x)<.1 && Math.abs(point.y-points[id].y)<.1)return;
      var key=id+':'+point.x+','+point.y;if(seen.has(key))return;seen.add(key);
      var occupant=junctions?source.positions.find(function(p){return p.id!==id && Math.abs(p.x-point.x)<.1 && Math.abs(p.y-point.y)<.1;}):null;
      var moved=new Set(occupant?[id,occupant.id]:[id]);
      var positions=source.positions.map(function(p){return p.id===id?{id:id,x:point.x,y:point.y}:occupant && p.id===occupant.id?{id:p.id,x:points[id].x,y:points[id].y}:p;});
      if(positions.some(function(p){return moved.has(p.id) && positions.some(function(q){return q.id!==p.id && gap(p,q)<clearance-.1;});}))return;
      if(!autoArrangeBranchesIntact(positions,frames))return;
      var structure=autoArrangeFlowStructure(d,positions,topology);if(structure.blocked>sourceMetrics.blocked)return;
      var placed=Object.fromEntries(positions.map(function(p){return [p.id,p];}));
      structure.routeLength=edges.reduce(function(sum,e){var a=placed[e.from],b=placed[e.to];return sum+Math.hypot(a.x-b.x,a.y-b.y);},0);structure.routeExcess=0;
      proposals.push({positions:positions,moved:moved,structure:structure,cost:quality(structure,source.score),key:key,id:id,minGain:tighten?Math.max(AUTO_ARRANGE_CARD_GAP,Math.hypot(points[id].x-points[topology.adj[id][0]].x,points[id].y-points[topology.adj[id][0]].y)*.2):0});
    }
    var hubs=ids.filter(function(id){return topology.adj[id].length>=3;}),slots=Math.min(8,Math.floor(limits.proposals/Math.max(1,hubs.length)));
    ids.forEach(function(id){var neighbors=topology.adj[id];
      if(leaves){
        if(neighbors.length!==1)return;
        var hub=points[neighbors[0]];
        if(tighten){
          // Preserve the existing axis and side. Shorten only a visibly remote
          // leaf, without turning it into another branch or squeezing gaps.
          var current=points[id],horizontal=Math.abs(current.y-hub.y)<.1,vertical=Math.abs(current.x-hub.x)<.1;
          if(!horizontal && !vertical)return;
          // Opposing equally spaced leaves or one-side-link peers form a
          // balanced intake. Moving
          // just one inward would destroy its symmetry without moving a hub.
          if(topology.adj[neighbors[0]].some(function(peer){var other=points[peer];return peer!==id && topology.adj[peer].length<=2 && Math.abs(current.x+other.x-2*hub.x)<.1 && Math.abs(current.y+other.y-2*hub.y)<.1;}))return;
          var distance=Math.hypot(current.x-hub.x,current.y-hub.y),pitch=horizontal?dx:dy;
          if(distance-pitch<Math.max(AUTO_ARRANGE_CARD_GAP,distance*.2))return;
          propose(id,{x:horizontal?hub.x+Math.sign(current.x-hub.x)*dx:hub.x,y:vertical?hub.y+Math.sign(current.y-hub.y)*dy:hub.y});
        }else [[dx,0],[-dx,0],[0,dy],[0,-dy]].forEach(function(offset){propose(id,{x:hub.x+offset[0],y:hub.y+offset[1]});});
      }else if(junctions){
        if(neighbors.length<3)return;
        var nearby=neighbors.slice().sort(function(a,b){return Math.hypot(points[a].x-points[id].x,points[a].y-points[id].y)-Math.hypot(points[b].x-points[id].x,points[b].y-points[id].y) || points[a].x-points[b].x || points[a].y-points[b].y;}).slice(0,4);
        function median(axis){var values=neighbors.map(function(other){return points[other][axis];}).sort(function(a,b){return a-b;});return (values[Math.floor((values.length-1)/2)]+values[Math.floor(values.length/2)])/2;}
        var xs=Array.from(new Set([points[id].x,median('x')].concat(nearby.map(function(other){return points[other].x;})))),ys=Array.from(new Set([points[id].y,median('y')].concat(nearby.map(function(other){return points[other].y;})))),targets=[];
        xs.forEach(function(x){ys.forEach(function(y){targets.push({x:x,y:y});});});
        nearby.forEach(function(other){var p=points[other];[[dx,0],[-dx,0],[0,dy],[0,-dy]].forEach(function(offset){targets.push({x:p.x+offset[0],y:p.y+offset[1]});});});
        function localLength(p){return neighbors.reduce(function(sum,other){return sum+Math.hypot(p.x-points[other].x,p.y-points[other].y);},0);}
        targets.sort(function(a,b){return localLength(a)-localLength(b) || a.x-b.x || a.y-b.y;});
        var start=proposals.length;
        for(var target=0;target<targets.length && proposals.length-start<slots;target++)propose(id,targets[target]);
      }else if(neighbors.length===2 && !tails.has(id)){
        var a=points[neighbors[0]],b=points[neighbors[1]];
        // Jump directly to a two-neighbor corner: its one-axis intermediate
        // can cross a card or increase crossings even when the corner is safe.
        propose(id,{x:a.x,y:b.y});propose(id,{x:b.x,y:a.y});
        if(Math.abs(a.y-b.y)<.1)[-1,1].forEach(function(sign){propose(id,{x:(a.x+b.x)/2,y:a.y+sign*dy});});
        if(Math.abs(a.x-b.x)<.1)[-1,1].forEach(function(sign){propose(id,{x:a.x+sign*dx,y:(a.y+b.y)/2});});
      }else if(neighbors.length===1){
        topology.adj[neighbors[0]].filter(function(peer){return peer!==id && topology.adj[peer].length===1;}).forEach(function(peer){var p=points[peer];
          [[dx,0],[-dx,0],[0,dy],[0,-dy]].forEach(function(offset){propose(id,{x:p.x+offset[0],y:p.y+offset[1]});});
        });
      }
    });
    proposals.sort(function(a,b){return a.cost-b.cost;});
    var leafQueues=[];
    if(leaves){
      // Every eligible leaf gets its best slot before another gets a second.
      // Retain attempted slots on no-op rounds so a bounded continuation does
      // not repeatedly spend its checks on the same rejected candidates.
      ids.forEach(function(id){var queue=proposals.filter(function(p){return p.id===id && !tried.has(p.key);});if(queue.length)leafQueues.push(queue);});
      leafQueues.sort(function(a,b){return a[0].cost-b[0].cost || points[a[0].id].x-points[b[0].id].x || points[a[0].id].y-points[b[0].id].y;});
      proposals=autoArrangeFlowSchedule(leafQueues,limits.proposals);
    }
    var next=best,nextMetrics=metrics,started=checks,limit=Math.min(limits.checks,checks+Math.max(Math.ceil(limits.checks/limits.passes),leafQueues.length));
    function safe(candidate,m){var a=candidate.score,b=source.score,c=result.score;
      return (!tighten || a.width<=b.width+.1 && a.height<=b.height+.1 && a.area<=b.area+.1 && m.turns<=sourceMetrics.turns+.001 && m.diagonal<=sourceMetrics.diagonal && m.fanRows<=sourceMetrics.fanRows && m.sparseRows<=sourceMetrics.sparseRows) &&
        !a.overlaps && !a.hits && a.crossings<=b.crossings && a.incidentCrossings<=b.incidentCrossings &&
        a.width<=c.width*1.1+.1 && a.height<=c.height*1.1+.1 && a.area<=c.area*1.05 && a.length<=c.length*1.035 &&
        m.routeLength<=baseline.routeLength*1.05 && m.blocked<=sourceMetrics.blocked && autoArrangeBranchesIntact(candidate.positions,frames);
    }
    for(var i=0;i<proposals.length && checks<limit;i++){
      var proposal=proposals[i],structure=proposal.structure;
      if(!tighten && structure.blocked>=sourceMetrics.blocked && structure.turns>=sourceMetrics.turns-.25 && structure.diagonal>=sourceMetrics.diagonal && structure.fanRows>=sourceMetrics.fanRows && (!junctions || structure.routeLength>=source.score.length*.97))continue;
      checks++;if(leaves)tried.add(proposal.key);var candidate=autoArrangeNaturalRoutes(d,{positions:proposal.positions,edges:source.edges.slice()},true),m=autoArrangeFlowMetrics(d,candidate,topology);
      if(!safe(candidate,m) && routes<limits.routes){
        routes++;try{candidate=autoArrangeRerouteAffected(d,source,proposal.positions,proposal.moved,viz,ids);m=autoArrangeFlowMetrics(d,candidate,topology);}catch(ex){continue;}
      }
      var improves=tighten?m.routeLength<=sourceMetrics.routeLength-proposal.minGain+.1 && m.routeLength<nextMetrics.routeLength-.1:(m.blocked<sourceMetrics.blocked || m.routeLength<sourceMetrics.routeLength) && quality(m,candidate.score)<quality(nextMetrics,next.score)-75;
      if(safe(candidate,m) && improves){next=candidate;nextMetrics=m;}
    }
    if(next===best){if(!leaves || checks===started)break;}else{best=next;metrics=nextMetrics;tried.clear();}
  }
  return best;
}


var AUTO_ARRANGE_BLOCK_LIMITS={nodes:48,edges:80,passes:2,checks:12,routes:4,proposals:192};
// Reuse the weak-cut partitioner with geometric traversal before its block cap.
// Older motif search retains its own ordering and policy.
function autoArrangePlacedBlocks(d,positions){
  var ordered=positions.slice().sort(function(a,b){return a.x-b.x || a.y-b.y;}),ids=ordered.map(function(p){return p.id;}),index=Object.fromEntries(ids.map(function(id,i){return [id,i];}));
  var edges=(d.edges || []).slice().sort(function(a,b){return Math.min(index[a.from],index[a.to])-Math.min(index[b.from],index[b.to]) || Math.max(index[a.from],index[a.to])-Math.max(index[b.from],index[b.to]);});
  var canonical={nodes:Object.fromEntries(ids.map(function(id,i){return ['placed_'+i,d.nodes[id]];})),edges:edges.map(function(e){return Object.assign({},e,{from:'placed_'+index[e.from],to:'placed_'+index[e.to]});})};
  return autoArrangeConnectedMotifs(canonical).blocks.map(function(block){return block.map(function(i){return ids[i];});});
}
function autoArrangeBlockClarity(d,result,viz){
  var ids=Object.keys(d.nodes),edges=d.edges || [],limits=AUTO_ARRANGE_BLOCK_LIMITS;
  if(ids.length<8 || ids.length>limits.nodes || edges.length>limits.edges || ids.some(function(id){return d.nodes[id].group;}))return result;
  var blocks=autoArrangePlacedBlocks(d,result.positions);if(!blocks.length)return result;
  var topology=autoArrangeFlowTopology(d),frames=autoArrangeBranchFrames(d,result.positions),baseline=autoArrangeFlowMetrics(d,result,topology),best=result,metrics=baseline,checks=0,routes=0;
  function gap(a,b){return Math.hypot(Math.max(0,Math.abs(a.x-b.x)-150),Math.max(0,Math.abs(a.y-b.y)-44));}
  var clearance=Infinity;result.positions.forEach(function(a,i){result.positions.slice(i+1).forEach(function(b){clearance=Math.min(clearance,gap(a,b));});});
  var dx=150+Math.max(AUTO_ARRANGE_CARD_GAP*2.5,clearance),dy=44+Math.max(AUTO_ARRANGE_CARD_GAP*1.5,clearance);
  var order=result.positions.slice().sort(function(a,b){return a.x-b.x || a.y-b.y;}).map(function(p){return p.id;});
  function rank(score,m){return m.routeLength/baseline.routeLength+Math.sqrt(score.area/result.score.area);}
  for(var pass=0;pass<limits.passes && checks<limits.checks;pass++){
    var source=best,sourceMetrics=metrics,points=Object.fromEntries(source.positions.map(function(p){return [p.id,p];})),proposals=[],seen=new Set(),slots=Math.floor(limits.proposals/blocks.length);
    blocks.forEach(function(block){
      var moved=new Set(block),boundary=edges.filter(function(e){return moved.has(e.from)!==moved.has(e.to);}),queue=[];
      if(!boundary.length || boundary.length>2)return;
      boundary.sort(function(a,b){var ai=moved.has(a.from)?a.from:a.to,bi=moved.has(b.from)?b.from:b.to;return points[ai].x-points[bi].x || points[ai].y-points[bi].y;});
      boundary.forEach(function(edge){var inner=points[moved.has(edge.from)?edge.from:edge.to],outer=points[moved.has(edge.from)?edge.to:edge.from];
        // Rotate in card-pitch coordinates so a vertical stack becomes a row
        // with a full card width, rather than rotating narrow physical gaps.
        [[1,0],[-1,0],[0,1],[0,-1]].forEach(function(dock){[0,1,2,3].forEach(function(turn){
          var positions=source.positions.map(function(p){if(!moved.has(p.id))return p;var x=(p.x-inner.x)/dx,y=(p.y-inner.y)/dy;
            var tx=turn===0?x:turn===1?-y:turn===2?-x:y,ty=turn===0?y:turn===1?x:turn===2?-y:-x;
            return {id:p.id,x:outer.x+dock[0]*dx+tx*dx,y:outer.y+dock[1]*dy+ty*dy};
          }),key=positions.map(function(p){return p.id+':'+p.x+','+p.y;}).join(';');
          if(seen.has(key))return;seen.add(key);
          if(positions.some(function(p,i){return positions.slice(i+1).some(function(q){return gap(p,q)<clearance-.1;});}) || !autoArrangeBranchesIntact(positions,frames))return;
          var placed=Object.fromEntries(positions.map(function(p){return [p.id,p];})),length=edges.reduce(function(sum,e){return sum+Math.hypot(placed[e.from].x-placed[e.to].x,placed[e.from].y-placed[e.to].y);},0);
          var xs=positions.map(function(p){return p.x;}),ys=positions.map(function(p){return p.y;}),width=Math.max.apply(null,xs)-Math.min.apply(null,xs)+150,height=Math.max.apply(null,ys)-Math.min.apply(null,ys)+44;
          if(width>result.score.width*1.25 || height>result.score.height*1.25 || width*height>result.score.area*1.05 || length>result.score.length*1.03 || Math.max(0,Math.log(height/width),Math.log(width/height/(16/9)))>result.score.shape+.1)return;
          if(width*height>=source.score.area*.95 && length>=source.score.length*.93)return;
          if(autoArrangeFlowStructure(d,positions,topology).blocked>sourceMetrics.blocked)return;
          queue.push({positions:positions,moved:moved,cost:length+Math.hypot(width,height)*2});
        });});
      });
      queue.sort(function(a,b){return a.cost-b.cost;});proposals.push.apply(proposals,queue.slice(0,slots));
    });
    proposals.sort(function(a,b){return a.cost-b.cost;});var next=best,nextMetrics=metrics,limit=Math.min(limits.checks,checks+Math.ceil(limits.checks/limits.passes));
    function safe(candidate,m){var a=candidate.score,b=source.score,c=result.score;return !a.overlaps && !a.hits && a.crossings<=b.crossings && a.incidentCrossings<=b.incidentCrossings &&
      a.shape<=c.shape+1e-9 && a.width<=c.width*1.25+.1 && a.height<=c.height*1.25+.1 && a.area<=c.area*1.05 && a.length<=c.length*1.03 && m.routeLength<=baseline.routeLength*1.02 && m.blocked<=sourceMetrics.blocked && autoArrangeBranchesIntact(candidate.positions,frames);}
    function improves(candidate,m){return (candidate.score.area<=source.score.area*.95 || m.routeLength<=sourceMetrics.routeLength*.93) && rank(candidate.score,m)<rank(next.score,nextMetrics)-.02;}
    for(var i=0;i<proposals.length && checks<limit;i++){
      var proposal=proposals[i];checks++;var candidate=autoArrangeNaturalRoutes(d,{positions:proposal.positions,edges:source.edges.slice()},true),m=autoArrangeFlowMetrics(d,candidate,topology);
      if((!safe(candidate,m) || !improves(candidate,m)) && routes<limits.routes){routes++;try{candidate=autoArrangeRerouteAffected(d,source,proposal.positions,proposal.moved,viz,order);m=autoArrangeFlowMetrics(d,candidate,topology);}catch(ex){continue;}}
      if(safe(candidate,m) && improves(candidate,m)){next=candidate;nextMetrics=m;}
    }
    if(next===best)break;best=next;metrics=nextMetrics;
  }
  return best;
}

var AUTO_ARRANGE_BLOCK_GRID_LIMITS={nodes:48,edges:80,blocks:2,blockNodes:12,checks:12,routes:4,proposals:128};
// Reshape only a short, elongated weak-cut block. The ordinary graph-wide grid
// entry still preserves clear natural layouts; this opt-in has separate caps.
function autoArrangeBlockGrid(d,result,viz){
  var ids=Object.keys(d.nodes),edges=d.edges || [],limits=AUTO_ARRANGE_BLOCK_GRID_LIMITS;
  if(ids.length<8 || ids.length>limits.nodes || edges.length>limits.edges || ids.some(function(id){return d.nodes[id].group;}))return result;
  var points=Object.fromEntries(result.positions.map(function(p){return [p.id,p];})),topology=autoArrangeFlowTopology(d),frames=autoArrangeBranchFrames(d,result.positions),baseline=autoArrangeFlowMetrics(d,result,topology);
  function gap(a,b){return Math.hypot(Math.max(0,Math.abs(a.x-b.x)-150),Math.max(0,Math.abs(a.y-b.y)-44));}
  var clearance=Infinity;result.positions.forEach(function(a,i){result.positions.slice(i+1).forEach(function(b){clearance=Math.min(clearance,gap(a,b));});});
  var dx=150+Math.max(AUTO_ARRANGE_CARD_GAP*2.5,clearance),dy=44+Math.max(AUTO_ARRANGE_CARD_GAP*1.5,clearance);
  function bounds(positions){var xs=positions.map(function(p){return p.x;}),ys=positions.map(function(p){return p.y;});return {width:Math.max.apply(null,xs)-Math.min.apply(null,xs)+150,height:Math.max.apply(null,ys)-Math.min.apply(null,ys)+44};}
  function geometric(a,b){return points[a].x-points[b].x || points[a].y-points[b].y;}
  var protectedNodes=new Set(frames.flatMap(function(frame){return frame.bands?frame.bands.flat():frame.branches.concat(frame.ends);}));
  var blocks=autoArrangePlacedBlocks(d,result.positions).filter(function(block){return !block.some(function(id){return protectedNodes.has(id);}) && block.length>=5 && block.length<=limits.blockNodes;}).map(function(block){
    var moved=new Set(block),boundary=edges.filter(function(e){return moved.has(e.from)!==moved.has(e.to);}),box=bounds(block.map(function(id){return points[id];})),cols=1+(box.width-150)/dx,rows=1+(box.height-44)/dy;
    return {ids:block.slice().sort(geometric),moved:moved,boundary:boundary,elongation:Math.max(cols/rows,rows/cols),box:box};
  }).filter(function(block){return block.boundary.length>0 && block.boundary.length<=2 && block.elongation>=1.6;});
  blocks.sort(function(a,b){return b.elongation-a.elongation || b.ids.length-a.ids.length || geometric(a.ids[0],b.ids[0]);});blocks=blocks.slice(0,limits.blocks);
  var queues=[],seen=new Set();
  blocks.forEach(function(block){
    var index=Object.fromEntries(block.ids.map(function(id,i){return [id,i];})),internal=edges.filter(function(e){return block.moved.has(e.from) && block.moved.has(e.to);});
    // Nonnumeric aliases and undirected, geometrically ordered proposal links
    // make the stochastic grid's deterministic seed independent of labels and
    // arrow direction. Actual routing below always uses the original diagram.
    var links=internal.map(function(e){return [Math.min(index[e.from],index[e.to]),Math.max(index[e.from],index[e.to])];}).sort(function(a,b){return a[0]-b[0] || a[1]-b[1];});
    var sub={nodes:Object.fromEntries(block.ids.map(function(id,i){return ['block_'+i,{}];})),edges:links.map(function(pair){return {from:'block_'+pair[0],to:'block_'+pair[1]};})};
    var seed={positions:block.ids.map(function(id,i){return {id:'block_'+i,x:points[id].x,y:points[id].y};}),edges:links.map(function(){return {};})};seed.score=autoArrangeScore(sub,seed);
    var finalists=autoArrangeGridPositions(sub,seed,false,{cleanBlock:true}),queue=[];
    block.boundary.sort(function(a,b){return geometric(block.moved.has(a.from)?a.from:a.to,block.moved.has(b.from)?b.from:b.to);});
    finalists.forEach(function(finalist){
      function pitch(axis){var values=Array.from(new Set(finalist.positions.map(function(p){return p[axis];}))).sort(function(a,b){return a-b;});return values.length>1?Math.min.apply(null,values.slice(1).map(function(v,i){return v-values[i];})):1;}
      var px=pitch('x'),py=pitch('y'),local=Object.fromEntries(finalist.positions.map(function(p,i){return [block.ids[i],{x:p.x/px,y:p.y/py}];}));
      block.boundary.forEach(function(edge){var inner=block.moved.has(edge.from)?edge.from:edge.to,outer=points[block.moved.has(edge.from)?edge.to:edge.from],anchor=local[inner];
        [[1,0],[-1,0],[0,1],[0,-1]].forEach(function(dock){[0,1,2,3].forEach(function(turn){
          var positions=result.positions.map(function(p){if(!block.moved.has(p.id))return p;var x=local[p.id].x-anchor.x,y=local[p.id].y-anchor.y;
            var tx=turn===0?x:turn===1?-y:turn===2?-x:y,ty=turn===0?y:turn===1?x:turn===2?-y:-x;
            return {id:p.id,x:outer.x+dock[0]*dx+tx*dx,y:outer.y+dock[1]*dy+ty*dy};
          }),key=positions.map(function(p){return p.x+','+p.y;}).join(';');
          if(seen.has(key))return;seen.add(key);
          if(positions.some(function(p,i){return positions.slice(i+1).some(function(q){return gap(p,q)<clearance-.1;});}) || !autoArrangeBranchesIntact(positions,frames))return;
          var placed=Object.fromEntries(positions.map(function(p){return [p.id,p];})),box=bounds(positions),inside=bounds(positions.filter(function(p){return block.moved.has(p.id);}));
          if(inside.width*inside.height>=block.box.width*block.box.height*.9)return;
          var length=edges.reduce(function(sum,e){return sum+Math.hypot(placed[e.from].x-placed[e.to].x,placed[e.from].y-placed[e.to].y);},0);
          if(box.width>result.score.width*1.25 || box.height>result.score.height*1.25 || box.width*box.height>result.score.area*1.05 || length>result.score.length*1.03 || autoArrangeFlowStructure(d,positions,topology).blocked>baseline.blocked)return;
          queue.push({positions:positions,moved:block.moved,cost:length+2*Math.hypot(box.width,box.height)});
        });});
      });
    });
    queue.sort(function(a,b){return a.cost-b.cost;});queues.push(queue.slice(0,Math.floor(limits.proposals/Math.max(1,blocks.length))));
  });
  var proposals=autoArrangeFlowSchedule(queues,limits.proposals),best=result,metrics=baseline,routes=0,order=ids.slice().sort(geometric);
  function rank(candidate,m){return m.routeLength/baseline.routeLength+Math.sqrt(candidate.score.area/result.score.area);}
  function safe(candidate,m){var a=candidate.score,b=result.score;return !a.overlaps && !a.hits && a.crossings<=b.crossings && a.incidentCrossings<=b.incidentCrossings && a.shape<=b.shape+1e-9 && a.width<=b.width*1.25+.1 && a.height<=b.height*1.25+.1 && a.area<=b.area*1.05 && a.length<=b.length*1.03 && m.routeLength<=baseline.routeLength*1.02 && m.blocked<=baseline.blocked && autoArrangeBranchesIntact(candidate.positions,frames);}
  function improves(candidate,m){return (candidate.score.area<=result.score.area*.95 || m.routeLength<=baseline.routeLength*.93) && rank(candidate,m)<rank(best,metrics)-.02;}
  for(var i=0;i<proposals.length && i<limits.checks;i++){
    var proposal=proposals[i],candidate=autoArrangeNaturalRoutes(d,{positions:proposal.positions,edges:result.edges.slice()},true),m=autoArrangeFlowMetrics(d,candidate,topology);
    if((!safe(candidate,m) || !improves(candidate,m)) && routes<limits.routes){routes++;try{candidate=autoArrangeRerouteAffected(d,result,proposal.positions,proposal.moved,viz,order);m=autoArrangeFlowMetrics(d,candidate,topology);}catch(ex){continue;}}
    if(safe(candidate,m) && improves(candidate,m)){best=candidate;metrics=m;}
  }
  return best;
}

// Native canvas bounds include the origin. Normalize only at publication so
// whole-block moves cannot leave the finished graph stranded far from it.
// Curve controls and label nudges are endpoint-relative and translate with cards.
function autoArrangeCubicBounds(values){
  // Solve derivative roots relative to the first point. Treat a nearly linear
  // derivative as linear, and avoid cancellation in the quadratic formula.
  var origin=values[0],v=values.map(function(x){return x-origin;}),a=3*v[1]-3*v[2]+v[3],b=2*(-2*v[1]+v[2]),c=v[1],roots=[],points=[v[0],v[3]];
  if(Math.abs(a)<=1e-12*Math.max(1,Math.abs(b),Math.abs(c))){if(b)roots.push(-c/b);}
  else {var discriminant=b*b-4*a*c;if(discriminant>=0){var q=-.5*(b+(b<0?-1:1)*Math.sqrt(discriminant));if(q)roots.push(q/a,c/q);else roots.push(-b/(2*a));}}
  roots.forEach(function(t){if(t>0 && t<1){var u=1-t;points.push(3*u*u*t*v[1]+3*u*t*t*v[2]+t*t*t*v[3]);}});
  return {min:origin+Math.min.apply(null,points),max:origin+Math.max.apply(null,points)};
}
function autoArrangeOccupiedBounds(d,result){
  var arranged=autoArrangeDiagram(d,result),L=layout(arranged),adjust=autoArrangeAdjust(arranged,L),left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
  function include(x,y,w,h){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x+w);bottom=Math.max(bottom,y+h);}
  Object.keys(L.pos).forEach(function(id){var p=L.pos[id];include(p.cx-p.w/2,p.cy-p.h/2,p.w,p.h);});
  Object.keys(L.groups).forEach(function(id){var p=L.groups[id];include(p.x,p.y,p.w,p.h);});
  arranged.edges.forEach(function(e,i){var segments=hasEdgeCurve(e)?edgeCurveSegments(e,L):[placedEdgePoints(e,L,adjust[i])];
    segments.forEach(function(points){var x=autoArrangeCubicBounds(points.map(function(p){return p.x;})),y=autoArrangeCubicBounds(points.map(function(p){return p.y;}));include(x.min,y.min,x.max-x.min,y.max-y.min);});
  });return {x:left,y:top,w:right-left,h:bottom-top};
}
function autoArrangePublish(d,result){
  var bounds=autoArrangeOccupiedBounds(d,result),dx=45-bounds.x,dy=78-bounds.y;
  if(Math.abs(dx)<1e-8 && Math.abs(dy)<1e-8)return result;
  var published={positions:result.positions.map(function(p){return {id:p.id,x:p.x+dx,y:p.y+dy};}),edges:result.edges};
  published.score=autoArrangeScore(d,published);return published;
}
function autoArrangeCandidates(d,viz,cola){return autoArrangePublish(d,autoArrangeCandidateSearch(d,viz,cola));}
function autoArrangeCandidateSearch(d,viz,cola){
  var ids=autoArrangeInput(d),candidates=[],small=autoArrangeSmall(d);
  function attempt(direction,positions,aspect){
    try{var result=autoArrangeRead(d,viz.renderJSON(autoArrangeDot(d,direction,positions,aspect),{engine:positions?'nop2':'dot'}));
      result.score=autoArrangeScore(d,result);if(!result.score.overlaps && !result.score.hits){candidates.push(result);return result;}
    }catch(ex){/* An alternative layout may still produce a usable route. */}
  }
  // A directed path has an unambiguous reading order. Preserve it in rows of
  // at most four, balancing row lengths and reversing alternate rows. Require
  // the normal safety checks before accepting the routed result.
  var chain=autoArrangeChainPositions(d);
  if(chain){attempt('LR',chain);if(candidates.length)return autoArrangeExpandSpacing(d,autoArrangeNaturalRoutes(d,candidates[0]),viz);}
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
  var chosen=candidates[0];
  // Preserve the selected structural layout. Compact only a terminal leaf,
  // rather than narrowing every branch to chase a smaller bounding box.
  if(small && !ids.some(function(id){return d.nodes[id].group;})){
    var positions=autoArrangeLeafPositions(d,chosen),refined=positions && attempt('LR',positions);
    if(refined && autoArrangeCompare(refined,chosen,true)<0)chosen=refined;
  }
  var aligned=autoArrangeAlignedPositions(d,chosen);
  if(aligned){
    if(!aligned.score.overlaps && !aligned.score.hits && aligned.score.crossings<=chosen.score.crossings)chosen=aligned;
    else {
      var placed=Object.create(null);aligned.positions.forEach(function(p){placed[p.id]={x:p.x,y:p.y};});
      var routed=attempt('LR',placed);
      if(routed && routed.score.crossings<=chosen.score.crossings && autoArrangeAlignmentFits(routed.score,chosen.score))chosen=routed;
    }
  }
  var folded=autoArrangeFoldedPositions(d,chosen);
  folded.forEach(function(positions){
    var result={positions:ids.map(function(id){return {id:id,x:positions[id].x,y:positions[id].y};}),edges:(d.edges || []).map(function(){return {};})};
    result.score=autoArrangeScore(d,result);
    if(result.score.overlaps || result.score.hits || result.score.crossings>chosen.score.crossings)result=attempt('LR',positions);
    if(result && result.score.crossings<=chosen.score.crossings && autoArrangeAlignmentFits(result.score,chosen.score) && Math.hypot(result.score.width,result.score.height)<=Math.hypot(chosen.score.width,chosen.score.height) && result.score.length<chosen.score.length)chosen=result;
  });
  chosen=autoArrangeNaturalRoutes(d,chosen);
  var grids=autoArrangeGridPositions(d,chosen);
  for(var i=0;i<grids.length;i++){
    var grid=grids[i];grid.score=autoArrangeScore(d,grid);
    // The search score is only a proposal. Require actual natural curves to
    // preserve safety, shape and footprint, and shorten center distances.
    if(!grid.score.overlaps && !grid.score.hits && grid.score.crossings<=chosen.score.crossings && grid.score.incidentCrossings<=chosen.score.incidentCrossings &&
      grid.score.shape<=chosen.score.shape && grid.score.length<chosen.score.length &&
      Math.hypot(grid.score.width,grid.score.height)<=Math.hypot(chosen.score.width,chosen.score.height))return autoArrangeLeafTighten(d,autoArrangeBlockGrid(d,autoArrangeLeafClarity(d,autoArrangeBlockClarity(d,autoArrangeJunctionClarity(d,autoArrangeNeighborhoodClarity(d,autoArrangeFlowClarity(d,autoArrangeReadability(d,autoArrangeExpandSpacing(d,grid,viz),viz),viz),viz),viz),viz),viz),viz),viz);
  }
  // Ordered layouts are reproducible seeds, not a constraint on accepted
  // geometry. Unresolved small layouts also try direction-free searches.
  if(ids.length<=AUTO_ARRANGE_GRID_LIMITS.nodes && (chosen.score.crossings || chosen.edges.some(function(e){return hasCubicCurve(e);}))) {
    var unrestricted=autoArrangeGridPositions(d,chosen,false);
    autoArrangeFoldedPositions(d,chosen,false).forEach(function(positions){
      unrestricted.push({positions:ids.map(function(id){return {id:id,x:positions[id].x,y:positions[id].y};}),edges:(d.edges || []).map(function(){return {};})});
    });
    unrestricted.forEach(function(candidate){
      candidate.score=autoArrangeScore(d,candidate);var a=candidate.score,b=chosen.score;
      if(!a.overlaps && !a.hits && a.crossings<=b.crossings && a.incidentCrossings<=b.incidentCrossings && a.shape<=b.shape && a.area<=b.area && a.length<b.length*.97)chosen=candidate;
    });
  }
  return autoArrangeLeafTighten(d,autoArrangeBlockGrid(d,autoArrangeLeafClarity(d,autoArrangeBlockClarity(d,autoArrangeJunctionClarity(d,autoArrangeNeighborhoodClarity(d,autoArrangeFlowClarity(d,autoArrangeReadability(d,autoArrangeExpandSpacing(d,autoArrangeMotifGeometry(d,autoArrangeTerminalFolds(d,autoArrangeGlobalLattice(d,autoArrangeMotifCandidates(d,autoArrangeLargeAligned(d,chosen),viz),viz),viz),viz),viz),viz),viz),viz),viz),viz),viz),viz),viz);
}
