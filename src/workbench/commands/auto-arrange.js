/* One-shot editor layout. Dagre supplies positions only; persisted ordinary
   floats and the existing smooth edge renderer need no layout dependency. */
function planAutoArrangeNodes(text,raw,sectionIdx){
  var findings=validate(normalize(raw));
  if(findings.errors.length)return {error:'Fix the diagram validation errors before arranging nodes.'};
  var got=builderDiagram(text,raw,sectionIdx);if(got.error)return got;
  var d=got.d,ids=Object.keys(d.nodes || {}).sort(),edges=d.edges || [];
  if(!ids.length)return {error:'Add nodes before arranging this diagram.'};
  if(ids.length>150 || edges.length>500 || Object.keys(d.groups || {}).length>150)
    return {error:'Auto arrange supports up to 150 nodes, 150 groups and 500 connections per diagram.'};
  if(typeof dagre==='undefined')return {error:'The node layout engine is unavailable.'};
  var parents=sanitizedGroupParents(d.groups),groups=new Map(),root={children:[],members:[]};
  function group(key,depth){
    if(depth>20)throw new Error('Group nesting exceeds 20 levels.');
    if(groups.has(key))return groups.get(key);
    var unit={children:[],members:[]};groups.set(key,unit);
    var parent=parents[key]===undefined?root:group(parents[key],depth+1);
    parent.children.push(unit);return unit;
  }
  /* Use private generated graph IDs: authored node/group IDs need not be safe
     object property names, and group IDs may also be node IDs. */
  var serial=0;
  try{
    ids.forEach(function(id){
      var node={id:'u'+serial++,node:id,w:150,h:FLOAT_H,members:[id]};
      var owner=d.nodes[id].group?group(d.nodes[id].group,1):root;
      owner.children.push(node);
    });
    function arrange(unit,depth){
      if(unit.node!==undefined)return;
      if(depth>20)throw new Error('Group nesting exceeds 20 levels.');
      var graph=new dagre.graphlib.Graph({multigraph:true});
      graph.setGraph({rankdir:'TB',nodesep:54,ranksep:100,edgesep:24,marginx:0,marginy:0});
      graph.setDefaultEdgeLabel(function(){return {};});
      var owners=new Map();
      unit.children.forEach(function(child){
        arrange(child,depth+1);if(!child.id)child.id='u'+serial++;
        graph.setNode(child.id,{width:child.w,height:child.h});
        child.members.forEach(function(id){owners.set(id,child.id);unit.members.push(id);});
      });
      edges.forEach(function(edge,i){
        var from=owners.get(edge.from),to=owners.get(edge.to);
        if(from && to && from!==to)graph.setEdge(from,to,{},'e'+i);
      });
      dagre.layout(graph);
      unit.children.forEach(function(child){var p=graph.node(child.id);child.x=p.x;child.y=p.y;});
      // Matches core/geometry.js group boxes: 14px padding + 20px title.
      unit.w=graph.graph().width+28;unit.h=graph.graph().height+48;
    }
    arrange(root,0);
    var positions=new Map();
    function flatten(unit,x,y){
      unit.children.forEach(function(child){
        if(child.node!==undefined)positions.set(child.node,{id:child.node,side:'below',x:x+child.x,y:y+child.y});
        else flatten(child,x+child.x-child.w/2+14,y+child.y-child.h/2+34);
      });
    }
    flatten(root,38,58);
    var floats=ids.map(function(id){return positions.get(id);});
    if(floats.some(function(f){return !f || !floatCoordinate(f.x) || !floatCoordinate(f.y);}))
      return {error:'The resulting layout exceeds the supported canvas coordinates.'};
    return builderRewrite(text,raw,got.path,function(copy){
      copy.rows=[[]];copy.floats=floats;copy.routing='curves';
      (copy.edges || []).forEach(function(edge){
        ['curvePoints','bend','fromPort','toPort','fromDx','fromDy','toDx','toDy','labelDx','labelDy','labelAt'].forEach(function(key){delete edge[key];});
      });
    });
  }catch(error){return {error:'Could not arrange this diagram. '+error.message};}
}
