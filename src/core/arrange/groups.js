/* Recursively apply the same lattice search to native group containers.
   These are placement constraints, never changes to authored memberships. */
var FlowArrangeGroups=(function(){
'use strict';
function arrange(diagram,options){
  const nodes=diagram.nodes,parents=sanitizedGroupParents(diagram.groups),ids=Object.keys(nodes).sort();
  const children=new Map(),direct=new Map();
  function add(map,key,value){if(!map.has(key))map.set(key,[]);map.get(key).push(value);}
  const active=new Set();
  for(const id of ids){const group=nodes[id].group||null;add(direct,group,id);let g=group;while(g!=null&&!active.has(g)){active.add(g);g=parents[g]??null;}}
  for(const g of [...active].sort())add(children,parents[g]??null,g);
  function build(group){
    const units=(direct.get(group)||[]).map(id=>{const node=nodes[id],textBox=node.type==='text' && (Object.prototype.hasOwnProperty.call(node,'text') || Object.prototype.hasOwnProperty.call(node,'textStyle')),size=textBox?textBoxSize(node):{w:150,h:44};return {id:'node:'+id,width:size.w,height:size.h,members:[{id,x:0,y:0,width:size.w,height:size.h}]};});
    for(const child of children.get(group)||[]){const unit=build(child);units.push({...unit,id:'group:'+child});}
    units.sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
    const owner=new Map();units.forEach((unit,i)=>unit.members.forEach(p=>owner.set(p.id,i)));
    const edges=(diagram.edges||[]).filter(e=>owner.has(e.from)&&owner.has(e.to)&&owner.get(e.from)!==owner.get(e.to)).map(e=>[owner.get(e.from),owner.get(e.to)]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
    const placed=FlowArrangePlacement.place(units,edges,options).positions;
    const left=Math.min(...placed.map(p=>p.x-p.width/2)),top=Math.min(...placed.map(p=>p.y-p.height/2));
    const right=Math.max(...placed.map(p=>p.x+p.width/2)),bottom=Math.max(...placed.map(p=>p.y+p.height/2));
    // Match geometry.js: 14px padding and a 20px title strip at every level.
    const width=right-left+(group===null?0:28),height=bottom-top+(group===null?0:48);
    const cx=(left+right)/2,cy=(top+bottom)/2-(group===null?0:10);
    const members=units.flatMap((unit,i)=>unit.members.map(p=>({...p,x:p.x+placed[i].x-cx,y:p.y+placed[i].y-cy})));
    return {width,height,members};
  }
  const root=build(null),positions=root.members.map(p=>({...p,x:p.x+root.width/2+48,y:p.y+root.height/2+48})).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  const index=new Map(positions.map((p,i)=>[p.id,i])),edges=(diagram.edges||[]).map(e=>[index.get(e.from),index.get(e.to)]);
  const order=edges.map((_,i)=>i).sort((i,j)=>edges[i][0]-edges[j][0]||edges[i][1]-edges[j][1]||i-j);
  const probe={...diagram,rows:[[]],floats:positions.map(p=>({id:p.id,side:'below',x:p.x,y:p.y}))};
  const boxes=Object.values(layout(probe).groups);
  // Titles are painted in the top 20px of the actual native group bounds.
  // Append routing-only obstacles; edge indexes still refer to real cards.
  const headers=boxes.map(b=>({x:b.x+b.w/2,y:b.y+10,width:b.w,height:20}));
  const routed=FlowArrangeRouting.route(positions.concat(headers),order.map(i=>edges[i])),routes=Array(edges.length);order.forEach((old,i)=>routes[old]=routed.edges[i]);
  const left=Math.min(48,...boxes.map(b=>b.x),routed.bounds?.left??Infinity)-32,top=Math.min(48,...boxes.map(b=>b.y),routed.bounds?.top??Infinity)-32;
  const right=Math.max(root.width+48,...boxes.map(b=>b.x+b.w),routed.bounds?.right??-Infinity)+32,bottom=Math.max(root.height+48,...boxes.map(b=>b.y+b.h),routed.bounds?.bottom??-Infinity)+32;
  if([left,top,right,bottom].some(v=>!Number.isFinite(v)||Math.abs(v)>100000))throw new Error('Grouped geometry exceeds the native coordinate range. Split this diagram into smaller sections.');
  return {positions,edges:routes,frame:{x:Math.floor(left),y:Math.floor(top),w:Math.ceil(right)-Math.floor(left),h:Math.ceil(bottom)-Math.floor(top)},metrics:{nodes:ids.length,edges:edges.length,...routed.metrics}};
}
return {arrange};
})();
