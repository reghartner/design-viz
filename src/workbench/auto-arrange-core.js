/* Bounded deterministic layout search. Runs in a worker; this pure module is
   also exercised against the final viewer geometry in Node tests. */
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
function autoArrangeDot(d,direction,positions){
  var ids=autoArrangeInput(d),groups=Object.assign(Object.create(null),d.groups || {});
  ids.forEach(function(id){var key=d.nodes[id].group;if(key && !groups[key])groups[key]={};});
  var gids=Object.keys(groups),parents=sanitizedGroupParents(groups);
  function quote(s){return JSON.stringify(String(s)).replace(/\\u202[89]/g,' ');}
  function node(id){var p=positions && positions[id];return 'n'+ids.indexOf(id)+' [label=""'+(p?',pos="'+p.x+','+(-p.y)+'!"':'')+'];';}
  function group(g){return 'subgraph cluster_'+gids.indexOf(g)+' {label='+quote(groups[g].title || g)+';margin=24;'+
    gids.filter(function(c){return parents[c]===g;}).map(group).join('')+
    ids.filter(function(id){return d.nodes[id].group===g;}).map(node).join('')+'}';}
  var source='digraph G {graph [rankdir='+direction+',compound=true,newrank=true,splines=true,overlap=true,notranslate=true,nodesep=.35,ranksep=.6];'+
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
  var paths=arranged.edges.map(function(e){
    var path=samplePathD(edgePath(e,L));
    hits+=countPathRectHits(path,ids.filter(function(id){return id!==e.from && id!==e.to;}).map(function(id){return rect(L.pos[id]);}));
    for(var i=1;i<path.length;i++)length+=Math.hypot(path[i].x-path[i-1].x,path[i].y-path[i-1].y);
    return path;
  });
  function intersects(a,b,c,d){
    if(Math.max(a.x,b.x)<Math.min(c.x,d.x) || Math.max(c.x,d.x)<Math.min(a.x,b.x) || Math.max(a.y,b.y)<Math.min(c.y,d.y) || Math.max(c.y,d.y)<Math.min(a.y,b.y))return false;
    function side(p,q,r){return (q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x);}
    return side(a,b,c)*side(a,b,d)<-1e-8 && side(c,d,a)*side(c,d,b)<-1e-8;
  }
  paths.forEach(function(a,i){paths.slice(i+1).forEach(function(b,k){
    var e=arranged.edges[i],f=arranged.edges[i+k+1];if(e.from===f.from || e.from===f.to || e.to===f.from || e.to===f.to)return;
    for(var ai=1;ai<a.length;ai++)for(var bi=1;bi<b.length;bi++)if(intersects(a[ai-1],a[ai],b[bi-1],b[bi])){crossings++;return;}
  });});
  return {overlaps:overlaps,hits:hits,crossings:crossings,length:length,area:L.vb.w*L.vb.h};
}
function autoArrangeCandidates(d,viz,cola){
  var ids=autoArrangeInput(d),candidates=[];
  function attempt(direction,positions){
    try{var result=autoArrangeRead(d,viz.renderJSON(autoArrangeDot(d,direction,positions),{engine:positions?'nop2':'dot'}));
      result.score=autoArrangeScore(d,result);if(!result.score.overlaps && !result.score.hits)candidates.push(result);
    }catch(ex){/* An alternative layout may still produce a usable route. */}
  }
  attempt('TB');attempt('LR');
  if(!ids.some(function(id){return d.nodes[id].group;}) && ids.length>1 && cola){
    [1,91].forEach(function(seed){
      try{var state=seed;function random(){state=(1664525*state+1013904223)>>>0;return state/4294967296;}
        var nodes=ids.map(function(id){return {id:id,width:174,height:68,x:random()*900,y:random()*700};});
        var links=(d.edges || []).filter(function(e){return e.from!==e.to;}).map(function(e){return {source:ids.indexOf(e.from),target:ids.indexOf(e.to)};});
        new cola.Layout().nodes(nodes).links(links).size([1200,900]).linkDistance(230).avoidOverlaps(true).start(60,100,250,0,false);
        var positions=Object.create(null);nodes.forEach(function(n){positions[n.id]={x:n.x,y:n.y};});attempt('LR',positions);
      }catch(ex){/* Layered alternatives remain available. */}
    });
  }
  candidates.sort(function(a,b){return a.score.crossings-b.score.crossings || a.score.length-b.score.length || a.score.area-b.score.area;});
  if(!candidates.length)throw new Error('Could not find a layout with clear cards and connections. The diagram is unchanged.');
  return candidates[0];
}
