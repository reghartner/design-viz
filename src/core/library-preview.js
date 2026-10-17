/* Publication-only, DOM-free discovery summaries. Geometry comes from the same
   layout core as the reader, but edges are deliberately simplified. Never run
   a viewer or embed source markup in the index. */
function libraryPreview(raw){
  var page=normalize(JSON.parse(JSON.stringify(raw))),owners=tabViewOwners(page);
  // The opening tab is index 0. Keep authored View membership/order, including
  // prose before a diagram; never sample an inactive tab or a detail domain.
  var eligible=owners.filter(function(o){return o.tab==null || o.tab===0;});
  eligible.sort(function(a,b){return (a.records[0]?a.records[0].blockIndex:Infinity)-(b.records[0]?b.records[0].blockIndex:Infinity);});
  var candidates=[];
  eligible.forEach(function(owner){
    var view=tabViewDefault(owner,tabViewDefinitions(owner));
    if(view)view.members.forEach(function(member){candidates.push({member:member,view:view});});
  });
  var chosen=candidates.find(function(c){return c.member.record.section.diagram;});
  if(!chosen)return null;
  var section=chosen.member.record.section,d=section.diagram,items=sectionLayoutItems(d,'default',chosen.member.layout);
  var text=function(s,max){return typeof s==='string'?s.replace(/[\x00-\x1f\x7f]/g,' ').trim().slice(0,max):'';};
  var label=text(section.heading || chosen.view.name || page.title,80);
  var visible=function(key){return !items || !items.some(function(it){return sectionLayoutKey(it)===key && it.hidden;});};
  var definition=sectionLayoutDefinition(d,chosen.member.layout),filter=sectionViewFilter(d,definition && definition.paths,definition && definition.steps);
  var paths=diagramPathList(d),openingPath=paths.find(function(path){return !filter.paths || filter.paths.includes(path.id);}) || paths[0];
  var opening=diagramForPath(d,openingPath.id),firstStep=(opening.steps || []).findIndex(function(step){return !filter.steps || filter.steps.includes(step.id);});
  var visibility=foldPanelVisibility(opening);
  var panels=(d.panels || []).filter(function(p){return visible('panel:'+p.id) && (d.view!=='step' || !(d.steps || []).length || visibility[p.id][Math.max(0,firstStep)]!==false);});
  var focus=diagramFocusPanel(d),panelFirst=chosen.member.layout==='home' || (!items && focus && d.primaryPanel===focus.id);
  var ids=Object.keys(d.nodes || {});
  if(!visible('diagram') || panelFirst || !ids.length){
    if(!panels.length)return null;
    return {version:1,kind:'panels',label:label,total:panels.length,panels:panels.slice(0,3).map(function(p){return {title:text(p.title || p.id,80),type:text(p.type,40)};})};
  }
  // Prevent an unusually large authored graph from making thumbnail generation
  // expensive. Its card still has a useful honest fallback.
  if(ids.length>500 || (d.edges || []).length>1000)return null;
  var L=layout(d),placed=ids.filter(function(id){var p=L.pos[id];return p && [p.cx,p.cy,p.w,p.h].every(Number.isFinite) && p.w>0 && p.h>0;});
  placed.sort(function(a,b){return L.pos[a].cy-L.pos[b].cy || L.pos[a].cx-L.pos[b].cx || ids.indexOf(a)-ids.indexOf(b);});
  var selected=placed.slice(0,12);if(!selected.length)return null;
  var left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
  selected.forEach(function(id){var p=L.pos[id];left=Math.min(left,p.cx-p.w/2);top=Math.min(top,p.cy-p.h/2);right=Math.max(right,p.cx+p.w/2);bottom=Math.max(bottom,p.cy+p.h/2);});
  var scale=Math.min(600/(right-left),260/(bottom-top)),ox=(640-(right-left)*scale)/2,oy=(300-(bottom-top)*scale)/2;
  var round=function(n){return Math.round(n*100)/100;};
  var nodes=selected.map(function(id){
    var p=L.pos[id],w=Math.max(p.w*scale,selected.length<=4?120:0),h=Math.max(p.h*scale,selected.length<=4?56:0);
    // Small topologies have generous gaps in the reader. Keep their centers,
    // but give summary labels enough space to remain legible at card size.
    return {label:text(d.nodes[id].title || id,80),x:round(Math.max(8,Math.min(632-w,ox+(p.cx-left)*scale-w/2))),y:round(Math.max(8,Math.min(292-h,oy+(p.cy-top)*scale-h/2))),w:round(w),h:round(h)};
  });
  var edges=(d.edges || []).filter(function(e){return selected.includes(e.from) && selected.includes(e.to);}).slice(0,20).map(function(e){return {from:selected.indexOf(e.from),to:selected.indexOf(e.to)};});
  return {version:1,kind:'graph',label:label,total:ids.length,nodes:nodes,edges:edges};
}
