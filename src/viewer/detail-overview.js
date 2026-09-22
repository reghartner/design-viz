/* A static context map, built from the same geometry as the main diagram.
   It owns no playback, requests, document IDs or editor selection targets. */
function buildDetailOverview(levels, onBack){
  var card=document.createElement('details');card.className='detail-overview';card.open=true;
  var summary=document.createElement('summary');summary.textContent='Overview';
  var depth=document.createElement('span');depth.className='detail-overview-depth';depth.textContent='Level '+levels.length;
  summary.appendChild(depth);card.appendChild(summary);
  var body=document.createElement('div');body.className='detail-overview-body';card.appendChild(body);
  var location=document.createElement('p');location.className='detail-overview-location';
  location.textContent='You are here · '+levels.map(function(level){return level.label;}).join(' › ');body.appendChild(location);
  var select;
  if(levels.length>1){
    var label=document.createElement('label');label.className='detail-overview-level';label.appendChild(document.createTextNode('Map of '));
    select=document.createElement('select');select.setAttribute('aria-label','Overview ancestor');
    levels.forEach(function(level,i){var option=document.createElement('option');option.value=String(i);option.textContent=level.title;select.appendChild(option);});
    label.appendChild(select);body.appendChild(label);select.addEventListener('change',draw);
  }
  var map=document.createElement('button');map.type='button';map.className='detail-overview-map';body.appendChild(map);
  var caption=document.createElement('p');caption.className='detail-overview-caption';body.appendChild(caption);
  var backButton=document.createElement('button');backButton.type='button';backButton.className='detail-overview-return';backButton.textContent='↖ Back to overview';body.appendChild(backButton);
  function selected(){return levels[select?Number(select.value):0];}
  function goBack(){onBack(selected().index);}
  map.addEventListener('click',goBack);backButton.addEventListener('click',goBack);
  function draw(){
    var level=selected(),d=level.diagram,L=layout(d),pos=L.pos,active=pos[level.node];
    map.replaceChildren();map.setAttribute('aria-label','Return to '+level.title+' — '+level.label+' highlighted');
    backButton.setAttribute('aria-label','Back to '+level.title);
    caption.textContent=level.title+' · '+level.label+' highlighted';
    function svgEl(tag,attrs,parent){var el=document.createElementNS(SVGNS,tag);Object.keys(attrs).forEach(function(k){el.setAttribute(k,attrs[k]);});parent.appendChild(el);return el;}
    var vb=L.vb,svg=svgEl('svg',{viewBox:[vb.x-16,vb.y-16,vb.w+32,vb.h+32].join(' '),'aria-hidden':'true',focusable:'false'},map);
    Object.keys(L.groups || {}).forEach(function(id){var g=L.groups[id];svgEl('rect',{x:g.x,y:g.y,width:g.w,height:g.h,rx:12,'class':'detail-map-group'},svg);});
    var edges=(d.edges || []).filter(function(e){return pos[e.from] && pos[e.to];}),adjust=edgeAutoAdjust(edges,L);
    edges.forEach(function(e,i){svgEl('path',{d:edgePath(e,L,adjust[i]),'class':'detail-map-edge'},svg);});
    if(active)svgEl('rect',{x:active.cx-active.w/2-14,y:active.cy-active.h/2-14,width:active.w+28,height:active.h+28,rx:18,'class':'detail-map-highlight'},svg);
    Object.keys(pos).forEach(function(id){
      var p=pos[id],node=d.nodes[id] || {},g=svgEl('g',{'class':'detail-map-node'+(id===level.node?' is-current':''),'data-detail-map-node':id},svg);
      svgEl('title',{},g).textContent=node.title || id;
      svgEl('rect',{x:p.cx-p.w/2,y:p.cy-p.h/2,width:p.w,height:p.h,rx:10},g);
      var title=String(node.title || id),label=title.length>15?title.slice(0,14)+'…':title;
      svgEl('text',{x:p.cx,y:p.cy,'dominant-baseline':'middle','text-anchor':'middle',textLength:Math.min(p.w-14,label.length*13),lengthAdjust:'spacingAndGlyphs'},g).textContent=label;
    });
  }
  draw();return card;
}
