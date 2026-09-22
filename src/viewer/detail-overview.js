/* A static context map, built from the same geometry as the main diagram.
   It owns no playback, requests, document IDs or editor selection targets. */
function buildDetailOverview(levels, onBack){
  var card=document.createElement('details');card.className='detail-overview';card.open=true;
  var summary=document.createElement('summary');summary.textContent='Context map';
  var depth=document.createElement('span');depth.className='detail-overview-depth';depth.textContent='Level '+levels.length;
  summary.appendChild(depth);card.appendChild(summary);
  var body=document.createElement('div');body.className='detail-overview-body';card.appendChild(body);
  var select;
  if(levels.length>1){
    var label=document.createElement('label');label.className='detail-overview-level';label.textContent='Map of';
    var field=document.createElement('span');field.className='detail-overview-select';
    select=document.createElement('select');select.setAttribute('aria-label','Overview ancestor');
    levels.forEach(function(level,i){var option=document.createElement('option');option.value=String(i);option.textContent=i===0?'Overview':levels[i-1].label;option.title=level.title;select.appendChild(option);});
    field.appendChild(select);label.appendChild(field);body.appendChild(label);select.addEventListener('change',draw);
  }
  var map=document.createElement('button');map.type='button';map.className='detail-overview-map';body.appendChild(map);
  var location=document.createElement('p');location.className='detail-overview-location';
  var here=document.createElement('span');here.className='detail-overview-here';here.textContent='You are here';location.appendChild(here);
  var trail=document.createElement('span');trail.className='detail-overview-trail';
  levels.forEach(function(level,i){
    if(i)trail.append(' › ');
    var segment=document.createElement(i===levels.length-1?'strong':'span');segment.textContent=level.label;trail.appendChild(segment);
  });
  location.appendChild(trail);body.appendChild(location);
  var backButton=document.createElement('button');backButton.type='button';backButton.className='detail-overview-return';body.appendChild(backButton);
  function selected(){return levels[select?Number(select.value):0];}
  function goBack(){onBack(selected().index);}
  map.addEventListener('click',goBack);backButton.addEventListener('click',goBack);
  function draw(){
    var level=selected(),d=level.diagram,L=layout(d),pos=L.pos,active=pos[level.node];
    map.replaceChildren();map.setAttribute('aria-label','Return to '+level.title+' — '+level.label+' highlighted');
    map.title=level.title+' · '+level.label+' highlighted';
    backButton.textContent=level.index===0?'Back to overview':'Back to '+levels[level.index-1].label;
    backButton.setAttribute('aria-label','Back to '+level.title);
    if(select)select.title=level.title;
    function svgEl(tag,attrs,parent){var el=document.createElementNS(SVGNS,tag);Object.keys(attrs).forEach(function(k){el.setAttribute(k,attrs[k]);});parent.appendChild(el);return el;}
    // Labels sit beneath the miniature cards, at a readable scale independent
    // of the source card's typography. Leave room for them in the viewBox.
    var edges=(d.edges || []).filter(function(e){return pos[e.from] && pos[e.to];}),adjust=edgeAutoAdjust(edges,L);
    var paths=edges.map(function(e,i){return edgePath(e,L,adjust[i]);});
    var bounds={left:Infinity,top:Infinity,right:-Infinity,bottom:-Infinity};
    function include(x,y){bounds.left=Math.min(bounds.left,x);bounds.top=Math.min(bounds.top,y);bounds.right=Math.max(bounds.right,x);bounds.bottom=Math.max(bounds.bottom,y);}
    Object.keys(pos).forEach(function(id){var p=pos[id];include(p.cx-p.w/2,p.cy-p.h/2);include(p.cx+p.w/2,p.cy+p.h/2);});
    Object.keys(L.groups || {}).forEach(function(id){var g=L.groups[id];include(g.x,g.y);include(g.x+g.w,g.y+g.h);});
    paths.forEach(function(path){samplePathD(path).forEach(function(p){include(p.x,p.y);});});
    if(!Number.isFinite(bounds.left)){bounds={left:L.vb.x,top:L.vb.y,right:L.vb.x+L.vb.w,bottom:L.vb.y+L.vb.h};}
    var w=bounds.right-bounds.left,h=bounds.bottom-bounds.top;
    var unit=Math.max(w/270,h/82,1),fontSize=10*unit;
    var svg=svgEl('svg',{viewBox:[bounds.left-15*unit,bounds.top-12*unit,w+30*unit,h+42*unit].join(' '),'aria-hidden':'true',focusable:'false'},map);
    Object.keys(L.groups || {}).forEach(function(id){var g=L.groups[id];svgEl('rect',{x:g.x,y:g.y,width:g.w,height:g.h,rx:12,'class':'detail-map-group'},svg);});
    paths.forEach(function(path){svgEl('path',{d:path,'class':'detail-map-edge'},svg);});
    if(active)svgEl('rect',{x:active.cx-active.w/2-5*unit,y:active.cy-active.h/2-5*unit,width:active.w+10*unit,height:active.h+10*unit,rx:7*unit,'class':'detail-map-highlight'},svg);
    Object.keys(pos).forEach(function(id){
      var p=pos[id],node=d.nodes[id] || {},g=svgEl('g',{'class':'detail-map-node'+(id===level.node?' is-current':''),'data-detail-map-node':id},svg);
      svgEl('title',{},g).textContent=node.title || id;
      svgEl('rect',{x:p.cx-p.w/2,y:p.cy-p.h/2,width:p.w,height:p.h,rx:4*unit},g);
      svgEl('path',{d:'M '+(p.cx-p.w*.26)+' '+(p.cy-p.h*.14)+' h '+p.w*.52+' M '+(p.cx-p.w*.26)+' '+(p.cy+p.h*.16)+' h '+p.w*.32,'class':'detail-map-card-lines'},g);
      var gap=Object.keys(pos).reduce(function(width,other){var q=pos[other];return other!==id && Math.abs(q.cy-p.cy)<p.h+24*unit?Math.min(width,Math.abs(q.cx-p.cx)):width;},p.w+38*unit);
      var limit=Math.floor((gap-8*unit)/(fontSize*.54)),title=String(node.title || id),label=title.length>limit?title.slice(0,limit-1)+'…':title;
      // Dense maps keep the spatial marker and full location trail, without overlapping labels.
      if(limit>=4)svgEl('text',{x:p.cx,y:p.cy+p.h/2+18*unit,'text-anchor':'middle','font-size':fontSize},g).textContent=label;
      if(id===level.node)svgEl('circle',{cx:p.cx+p.w/2,cy:p.cy-p.h/2,r:3*unit,'class':'detail-map-pin'},g);
    });
  }
  draw();return card;
}
