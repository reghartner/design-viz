/* Pure step/path projection. Uses shared isHex() and navigation stepIndexOf()
   at call time; indices always refer to the authored source step registry. */

/* A step's marker color is presentation-only and never carries to another beat.
   Opaque hex keeps CSS input bounded and lets us guarantee number contrast. */
function stepCircleColor(st){
  var value=st && st.color;
  if(typeof value!=='string' || !/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value))return null;
  return (value.length===4?'#'+value.slice(1).split('').map(function(c){return c+c;}).join(''):value).toLowerCase();
}
function stepCircleInk(color){
  var channels=[1,3,5].map(function(i){var c=parseInt(color.slice(i,i+2),16)/255;return c<=.04045?c/12.92:Math.pow((c+.055)/1.055,2.4);});
  var luminance=.2126*channels[0]+.7152*channels[1]+.0722*channels[2];
  return (luminance+.05)/.05>=1.05/(luminance+.05)?'#000000':'#ffffff';
}

function stepKeys(st){
  if (!st) return [];
  if (Array.isArray(st.edges)) return st.edges;
  if (st.edge) return [st.edge];
  return [];
}
var COMM_FAILURE_MODES = ['dropped','blocked'];
function stepFailures(st){
  var raw = st && st.failures, out = Object.create(null);
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) Object.keys(raw).forEach(function(key){
    if (COMM_FAILURE_MODES.indexOf(raw[key]) >= 0) out[key] = raw[key];
  });
  return out;
}
function stepDeliveredKeys(st){
  var failures = stepFailures(st);
  return stepKeys(st).filter(function(key){return !Object.prototype.hasOwnProperty.call(failures,key);});
}
function stepNodes(st){
  return (st && Array.isArray(st.nodes)) ? st.nodes : [];
}
function stepPanelPatch(st){
  if (!st) return null;
  if (st.panels && typeof st.panels === 'object' && !Array.isArray(st.panels)) return st.panels;
  if (st.patch && typeof st.patch === 'object' && !Array.isArray(st.patch)) return st.patch;
  return null;
}
function stepTonePatch(st){
  if (!st || !st.tone || typeof st.tone !== 'object' || Array.isArray(st.tone)) return null;
  return st.tone;
}

/* Paths reference a shared step registry. Folding always receives just the
   selected sequence, so another outcome cannot leak state into this one. */
function diagramPathList(d){
  var steps = Array.isArray(d.steps) ? d.steps : [], byId = new Map();
  steps.forEach(function(s,i){ if (s && typeof s.id === 'string') byId.set(s.id,i); });
  var colors = ['#38bdf8','#fb923c','#c084fc','#f472b6','#4ade80'];
  var paths = Array.isArray(d.paths) ? d.paths.filter(function(p){
    return p && typeof p.id === 'string' && p.id && Array.isArray(p.steps) && p.steps.length &&
      p.steps.every(function(id){ return byId.has(id); });
  }).map(function(p,i){
    return {id:p.id, label:p.label || (i ? p.id : 'Happy path'), color:isHex(p.color) ? p.color : colors[i % colors.length],
      indices:p.steps.map(function(id){ return byId.get(id); })};
  }) : [];
  return paths.length ? paths : [{id:'happy',label:'Happy path',color:colors[0],indices:steps.map(function(s,i){return i;})}];
}
function diagramForPath(d, id){
  var paths = diagramPathList(d), path = paths.find(function(p){ return p.id === id; }) || paths[0];
  return Object.assign({}, d, {steps:path.indices.map(function(i){ return d.steps[i]; }),
    _sourceIndices:path.indices, _pathId:path.id});
}
/* Exact host navigation uses the complete path, never a named view's visible
   stops. Missing paths return null; missing steps retain the path with -1
   indices so hosts can keep their existing distinct, recoverable errors. */
function resolveSourceStep(d, pathId, stepRef){
  var path = diagramPathList(d).find(function(p){return p.id === pathId;});
  if (!path) return null;
  var ids = path.indices.map(function(index){return d.steps[index].id;});
  var index = stepIndexOf(ids, stepRef);
  return {path:path, pathIndex:index, sourceIndex:index < 0 ? -1 : path.indices[index]};
}
/* Color a branch starting at its first differing step; every common-prefix
   beat stays shared. A wholly shared path has start > end. Compare earlier
   declarations so nested alternatives keep stable rows too. */
function pathStepRows(paths){
  return paths.map(function(path,i){
    var shared = 0;
    paths.slice(0,i).forEach(function(prior){
      var n = 0;
      while (n < path.indices.length && n < prior.indices.length && path.indices[n] === prior.indices[n]) n++;
      shared = Math.max(shared,n);
    });
    return {path:path, start:i ? shared : 0, end:path.indices.length - 1};
  });
}

/* Sharing is source identity, not a column match. Cache pairwise prefixes so
   recognizing a shared suffix never rebuilds or joins the paths' state. */
function pathStepSharing(paths){
  var byStep=new Map(),prefixes=new Map();
  function prefix(a,b){
    var peers=prefixes.get(a);if(!peers){peers=new Map();prefixes.set(a,peers);}
    if(!peers.has(b)){
      var n=0;while(n<a.indices.length && n<b.indices.length && a.indices[n]===b.indices[n])n++;
      peers.set(b,n);
    }
    return peers.get(b);
  }
  paths.forEach(function(path){
    path.indices.forEach(function(sourceIndex,position){
      var shared=byStep.get(sourceIndex);
      if(!shared){shared={sourceIndex:sourceIndex,owner:path,occurrences:[],downstream:false};byStep.set(sourceIndex,shared);}
      else if(position>=prefix(shared.owner,path))shared.downstream=true;
      shared.occurrences.push({path:path,position:position});
    });
  });
  return byStep;
}

/* Geometry only: state and playback still fold each authored path separately.
   Decide joins and block boundaries before filtering a named view. Prefix-only
   identities keep separate occurrences, just like the legacy timeline rows. */
function pathTimelineGraph(paths,shownPaths){
  var joined=new Set(),pathById=new Map();
  paths.forEach(function(path){pathById.set(path.id,path);});
  pathStepSharing(paths).forEach(function(step){
    var members=new Set(step.occurrences.map(function(o){return o.path.id;}));
    if(step.downstream && members.size>1 && members.size===step.occurrences.length)joined.add(step.sourceIndex);
  });
  function authoredGraph(){
    var nodes=[],byId=new Map(),sequences=new Map(),next=new Map(),previous=new Map();
    paths.forEach(function(path){
      var sequence=path.indices.map(function(sourceIndex,index){
        var id=joined.has(sourceIndex)?'shared:'+sourceIndex:'path:'+JSON.stringify([path.id,index]);
        var node=byId.get(id);
        if(!node){
          node={id:id,sourceIndex:sourceIndex,occurrences:[],pathIds:[],shared:joined.has(sourceIndex),blockId:null};
          nodes.push(node);byId.set(id,node);next.set(id,new Set());previous.set(id,new Set());
        }
        node.occurrences.push({pathId:path.id,index:index});node.pathIds.push(path.id);
        return node;
      });
      sequences.set(path.id,sequence);
      sequence.forEach(function(node,index){
        if(index){var prior=sequence[index-1];next.get(prior.id).add(node.id);previous.get(node.id).add(prior.id);}
      });
    });
    return {nodes:nodes,byId:byId,sequences:sequences,next:next,previous:previous};
  }
  var full=authoredGraph();
  /* Contracting shared identities can create cycles (x,y versus y,x), even
     across three or more paths. Find cyclic components with iterative graph
     walks, then keep every identity in those components as separate instances.
     Joins outside a conflicting component, such as a later ending, survive. */
  var visited=new Set(),finished=[];
  full.nodes.forEach(function(node){
    if(visited.has(node.id))return;
    var stack=[{id:node.id,exit:false}];
    while(stack.length){
      var frame=stack.pop();
      if(frame.exit){finished.push(frame.id);continue;}
      if(visited.has(frame.id))continue;
      visited.add(frame.id);stack.push({id:frame.id,exit:true});
      full.next.get(frame.id).forEach(function(id){if(!visited.has(id))stack.push({id:id,exit:false});});
    }
  });
  var assigned=new Set(),unsafe=new Set();
  finished.reverse().forEach(function(id){
    if(assigned.has(id))return;
    var stack=[id],component=[];assigned.add(id);
    while(stack.length){
      var current=stack.pop();component.push(current);
      full.previous.get(current).forEach(function(prior){if(!assigned.has(prior)){assigned.add(prior);stack.push(prior);}});
    }
    if(component.length>1 || full.next.get(id).has(id))component.forEach(function(member){
      var node=full.byId.get(member);if(node.shared)unsafe.add(node.sourceIndex);
    });
  });
  if(unsafe.size){unsafe.forEach(function(sourceIndex){joined.delete(sourceIndex);});full=authoredGraph();}

  /* A block extends only over immediate authored successors with the same
     membership. Hidden forks or membership changes never fuse two blocks. */
  var blockNext=new Map(),blockPrevious=new Set(),fullBlocks=[];
  full.nodes.forEach(function(node){
    if(!node.shared)return;
    var first=node.occurrences[0],next=full.sequences.get(first.pathId)[first.index+1];
    if(next && next.shared && next.pathIds.length===node.pathIds.length &&
      next.pathIds.every(function(id,index){return id===node.pathIds[index];}) &&
      node.occurrences.every(function(o){return full.sequences.get(o.pathId)[o.index+1]===next;})){
      blockNext.set(node.id,next);blockPrevious.add(next.id);
    }
  });
  full.nodes.forEach(function(node){
    if(!node.shared || blockPrevious.has(node.id))return;
    var block={id:'block:'+node.id,nodeIds:[],pathIds:node.pathIds.slice()};
    while(node){node.blockId=block.id;block.nodeIds.push(node.id);node=blockNext.get(node.id);}
    fullBlocks.push(block);
  });

  var visible=new Map(),edgeMap=new Map(),edges=[];
  (shownPaths==null?paths:shownPaths).forEach(function(shown){
    var path=pathById.get(shown.id);if(!path)return;
    var cursor=0,prior=null;
    shown.indices.forEach(function(sourceIndex,visibleIndex){
      var index=path.indices.indexOf(sourceIndex,cursor);if(index<0)return;
      cursor=index+1;
      var authored=full.sequences.get(path.id)[index],node=visible.get(authored.id);
      if(!node){
        node={id:authored.id,sourceIndex:sourceIndex,occurrences:[],pathIds:[],column:0,shared:false,blockId:null};
        visible.set(node.id,node);
      }
      node.occurrences.push({pathId:path.id,index:index,visibleIndex:visibleIndex});node.pathIds.push(path.id);
      if(prior){
        var key=JSON.stringify([prior.id,node.id]),edge=edgeMap.get(key);
        if(!edge){edge={from:prior.id,to:node.id,pathIds:[]};edgeMap.set(key,edge);edges.push(edge);}
        edge.pathIds.push(path.id);
      }
      prior=node;
    });
  });
  var nodes=full.nodes.filter(function(node){return visible.has(node.id);}).map(function(authored){
    var node=visible.get(authored.id);node.shared=node.occurrences.length>1;
    if(node.shared)node.blockId=authored.blockId;
    return node;
  });
  var blocks=fullBlocks.map(function(block){
    var nodeIds=block.nodeIds.filter(function(id){return visible.has(id) && visible.get(id).shared;});
    if(!nodeIds.length)return null;
    var last=full.byId.get(nodeIds[nodeIds.length-1]);
    return {id:block.id,nodeIds:nodeIds,pathIds:block.pathIds.slice(),
      ending:last.occurrences.every(function(o){return o.index===pathById.get(o.pathId).indices.length-1;})};
  }).filter(function(block){return block!==null;});

  /* Longest-path ranks align incoming routes of different lengths. Filtering
     only shortcuts authored edges, so the projected graph remains acyclic. */
  var incoming=new Map(),outgoing=new Map(),queue=[],columns=0;
  nodes.forEach(function(node){incoming.set(node.id,0);outgoing.set(node.id,[]);});
  edges.forEach(function(edge){incoming.set(edge.to,incoming.get(edge.to)+1);outgoing.get(edge.from).push(edge.to);});
  nodes.forEach(function(node){if(!incoming.get(node.id))queue.push(node);});
  for(var head=0;head<queue.length;head++){
    var node=queue[head];columns=Math.max(columns,node.column+1);
    outgoing.get(node.id).forEach(function(id){
      var next=visible.get(id);next.column=Math.max(next.column,node.column+1);
      incoming.set(id,incoming.get(id)-1);if(!incoming.get(id))queue.push(next);
    });
  }
  return {nodes:nodes,edges:edges,blocks:blocks,hasShared:nodes.some(function(node){return node.shared;}),columns:columns};
}
