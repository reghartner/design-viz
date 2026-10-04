/* Bounded deterministic layout search. Runs in a worker; this pure module is
   also exercised against the final viewer geometry in Node tests. */
var AUTO_ARRANGE_LIMITS={nodes:80,edges:160};
var AUTO_ARRANGE_COMPACT_LIMITS={nodes:24,edges:48};
var AUTO_ARRANGE_SMALL_LIMITS={nodes:12,edges:24};
var AUTO_ARRANGE_ALIGNMENT_LIMITS={checks:900,work:200000,passes:8};
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
    paths.push([autoArrangePathGeometry(samplePathD(edgePath(e,L))),autoArrangePathGeometry(samplePathD(edgePath(automatic.edges[i],L,adjust[i])))]);
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
  var best=null,bestSize=diagonal(positions),bestLength=Infinity;
  // One bounded tuck per seed: terminal sinks may share their parent's row or
  // column when that shrinks the card footprint. Native rerouting and scoring
  // still decide whether the placement is safe and has fewer crossings.
  (d.edges || []).forEach(function(e){
    if(degree[e.to]!==1)return;
    var parent=positions[e.from];
    [[150+AUTO_ARRANGE_CARD_GAP,0],[-150-AUTO_ARRANGE_CARD_GAP,0],[0,44+AUTO_ARRANGE_RANK_GAP],[0,-44-AUTO_ARRANGE_RANK_GAP]].forEach(function(offset){
      var point={x:parent.x+offset[0],y:parent.y+offset[1]};
      if(ids.some(function(id){
        if(id===e.to)return false;
        var p=positions[id],dx=Math.max(0,Math.abs(p.x-point.x)-150),dy=Math.max(0,Math.abs(p.y-point.y)-44);
        return Math.hypot(dx,dy)<AUTO_ARRANGE_CARD_GAP-.1;
      }))return;
      var placed=Object.assign(Object.create(null),positions);placed[e.to]=point;
      var size=diagonal(placed),length=Math.hypot(offset[0],offset[1]);
      if(size<bestSize-.1 || best && Math.abs(size-bestSize)<.1 && length<bestLength){best=placed;bestSize=size;bestLength=length;}
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
  var cells=Object.create(null),degree=Object.create(null);
  columns.forEach(function(g,col){g.forEach(function(p){cells[p.id]={col:col};});});
  rows.forEach(function(g,row){g.forEach(function(p){cells[p.id].row=row;});});
  ids.forEach(function(id){degree[id]={incoming:0,outgoing:0};});
  edges.forEach(function(e){degree[e.from].outgoing++;degree[e.to].incoming++;});
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
      var id=ids[i];if(!degree[id].incoming || !degree[id].outgoing)continue;
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
function autoArrangeFoldedPositions(d,result){
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
    if(outgoing[a].some(function(join){return outgoing[b].indexOf(join)>=0 && old[ids[join]].y>Math.max(old[ids[a]].y,old[ids[b]].y);}))siblings.push([a,b]);
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
      if(forward[i] && ys[b]<ys[a])value+=10000;
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
    // Direction and fork rows are structural requirements, not routing hints.
    if(links.some(function(e,i){return forward[i] && ys[best[e[1]]]<ys[best[e[0]]];}) || siblings.some(function(p){return ys[best[p[0]]]!==ys[best[p[1]]];}))continue;
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
function autoArrangeGridPositions(d,result){
  var ids=Object.keys(d.nodes),edges=d.edges || [],count=ids.length;
  // Spend this optional budget only on unresolved routing. Already natural,
  // crossing-free layouts keep their approved structure and exact positions.
  if(count<4 || count>AUTO_ARRANGE_GRID_LIMITS.nodes || edges.length>AUTO_ARRANGE_GRID_LIMITS.edges ||
    ids.some(function(id){return d.nodes[id].group;}) || edges.some(function(e){return e.from===e.to;}) ||
    !result.score.crossings && !result.edges.some(function(e){return hasCubicCurve(e);}))return [];
  var old=Object.create(null);result.positions.forEach(function(p){old[p.id]=p;});
  var links=edges.map(function(e){return [ids.indexOf(e.from),ids.indexOf(e.to)];});
  var forward=edges.map(function(e){return old[e.to].y>=old[e.from].y;}),peers=[];
  // Keep recognizable shared ranks when connected branches already share a
  // parent or join. Forward flow is a strong preference, feedback is exempt.
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
      var drop=cells[a].cy-cells[b].cy;if(forward[i] && drop>0)value+=40*drop;
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
function autoArrangeCandidates(d,viz,cola){
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
  if(chain){attempt('LR',chain);if(candidates.length)return autoArrangeNaturalRoutes(d,candidates[0]);}
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
  // Preserve the selected structural layout. Compact only a terminal sink,
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
      Math.hypot(grid.score.width,grid.score.height)<=Math.hypot(chosen.score.width,chosen.score.height))return grid;
  }
  return autoArrangeGlobalLattice(d,autoArrangeMotifCandidates(d,autoArrangeLargeAligned(d,chosen),viz),viz);
}
