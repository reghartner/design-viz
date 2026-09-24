/* Presentation of a pathTimelineGraph. Positions are derived from the graph,
   not the selected path; switching outcomes only changes paint and numbering.
   No runtime state is combined here and no document listeners are retained. */
function createPathTimeline(host, source, paths, shownPaths, graph, pick){
  var retired=false, pathById=new Map(paths.map(function(p){return [p.id,p];}));
  var order=new Map(paths.map(function(p,i){return [p.id,i];}));
  var rowGap=94, top=44, labelWidth=150, columnWidth=94;
  var memberships=new Map();
  graph.blocks.forEach(function(block){
    var key=JSON.stringify(block.pathIds);
    if(!memberships.has(key))memberships.set(key,{key:key,ids:block.pathIds,
      at:block.pathIds.reduce(function(n,id){return n+order.get(id);},0)/block.pathIds.length});
  });
  var lanePositions=new Map(paths.map(function(p,i){return [p.id,i*rowGap+top];}));
  var sharedPositions=new Map();
  if(paths.length<=2){memberships.forEach(function(group){sharedPositions.set(group.key,top+group.at*rowGap);});}
  else {
    // Dedicated bands keep subset joins away from non-participating routes.
    var bands=paths.map(function(p,i){return {path:p.id,at:i};});
    memberships.forEach(function(group){bands.push({group:group.key,at:group.at+.01});});
    bands.sort(function(a,b){return a.at-b.at;});
    bands.forEach(function(band,i){(band.path?lanePositions:sharedPositions).set(band.path || band.group,top+i*rowGap);});
  }
  var width=labelWidth+Math.max(1,graph.columns)*columnWidth+28;
  var height=Math.max.apply(null,Array.from(lanePositions.values()).concat(Array.from(sharedPositions.values())))+62;
  function element(tag,className,parent){var e=document.createElement(tag);e.className=className;if(parent)parent.appendChild(e);return e;}
  function position(e,x,y){e.style.left=x+'px';e.style.top=y+'px';}
  var root=element('div','path-timeline',host);
  root.setAttribute('role','group');root.setAttribute('aria-label','Paths with shared processing');
  root.style.width=width+'px';root.style.height=height+'px';
  var canvas=document.createElementNS(SVGNS,'svg');canvas.setAttribute('class','path-timeline-lines');
  canvas.setAttribute('width',width);canvas.setAttribute('height',height);canvas.setAttribute('viewBox','0 0 '+width+' '+height);
  canvas.setAttribute('aria-hidden','true');root.appendChild(canvas);
  var nodes=new Map(),buttons=[],choices=[],tracks=[],regions=[];
  graph.nodes.forEach(function(node){
    var block=graph.blocks.find(function(b){return b.id===node.blockId;});
    nodes.set(node.id,{node:node,x:labelWidth+node.column*columnWidth+columnWidth/2,
      y:block?sharedPositions.get(JSON.stringify(block.pathIds)):lanePositions.get(node.pathIds[0])});
  });
  graph.blocks.forEach(function(block){
    var members=block.nodeIds.map(function(id){return nodes.get(id);}).filter(Boolean);
    if(!members.length)return;
    var first=members[0],last=members[members.length-1],region=element('div','path-shared-block',root);
    region.setAttribute('data-shared-block',block.id);region.setAttribute('data-shared-ending',String(block.ending));
    position(region,first.x-44,first.y-36);region.style.width=(last.x-first.x+88)+'px';
    var heading=element('span','path-shared-heading',region);
    heading.textContent=block.ending?'Shared ending':members.length===1?'Shared step':'Shared steps';
    region.title=block.pathIds.map(function(id){return pathById.get(id).label;}).join(' · ');
    regions.push({element:region,pathIds:block.pathIds});
  });
  paths.forEach(function(path){
    var row=element('div','path-timeline-route',root);row.setAttribute('data-path-row',path.id);
    var choice=element('button','path-chip',row);choice.type='button';choice.textContent=path.label;
    choice.setAttribute('data-dv-path',path.id);choice.style.setProperty('--path-color',path.color);
    position(choice,0,lanePositions.get(path.id)-16);
    choice.disabled=!shownPaths.find(function(p){return p.id===path.id;}).indices.length;
    if(choice.disabled)choice.title='No steps from this path are shown in this view.';
    choice.addEventListener('click',function(event){event.stopPropagation();if(!retired)pick(path.id,0,true);});
    choices.push({button:choice,row:row,path:path});
  });
  var sharing=pathStepSharing(paths);
  graph.nodes.forEach(function(node){
    var point=nodes.get(node.id),wrap=element('div','path-timeline-stop',root);
    position(wrap,point.x-16,point.y-16);
    var step=source.steps[node.sourceIndex],button=element('button','schip'+(step.delta===true?' dvd':'')+(node.shared?' shared-downstream-step':''),wrap);
    button.type='button';button.setAttribute('data-step-source',node.sourceIndex);button.setAttribute('data-timeline-node',node.id);
    applyStepCircleColor(button,step);
    if(node.shared){
      var name=element('span','path-shared-caption',wrap),caption=String(step.text || step.id || '').replace(/\s+/g,' ').trim();
      name.textContent=caption.length>54?caption.slice(0,51)+'…':caption;name.title=caption;
    }
    var entry={button:button,node:node,occurrence:node.occurrences[0]};buttons.push(entry);
    button.addEventListener('click',function(){if(!retired)pick(entry.occurrence.pathId,entry.occurrence.index,false);});
  });
  function stroke(d,pathIds){
    var line=document.createElementNS(SVGNS,'path');line.setAttribute('d',d);line.setAttribute('fill','none');
    line.setAttribute('stroke-width','2');line.setAttribute('stroke-linecap','round');canvas.appendChild(line);
    tracks.push({element:line,pathIds:pathIds});
  }
  graph.edges.forEach(function(edge){
    var a=nodes.get(edge.from),b=nodes.get(edge.to),middle=(a.x+b.x)/2;
    stroke('M '+a.x+' '+a.y+' C '+middle+' '+a.y+' '+middle+' '+b.y+' '+b.x+' '+b.y,edge.pathIds);
  });
  // A cap belongs to an authored ending, never to the last stop of a filtered view.
  graph.nodes.forEach(function(node){
    var ending=node.occurrences.filter(function(o){return o.index===pathById.get(o.pathId).indices.length-1;}).map(function(o){return o.pathId;});
    if(!ending.length)return;
    var point=nodes.get(node.id),capX=point.x+22;
    stroke('M '+point.x+' '+point.y+' H '+capX+' M '+capX+' '+(point.y-5)+' V '+(point.y+5),ending);
  });
  var owner=element('div','path-timeline-owner',host);
  function sync(selectedId,index){
    if(retired)return;
    var selected=pathById.get(selectedId);owner.textContent='Following '+selected.label;
    owner.style.setProperty('--path-color',selected.color);
    choices.forEach(function(choice){var active=choice.path.id===selectedId;choice.button.setAttribute('aria-pressed',String(active));choice.row.setAttribute('data-selected',String(active));});
    buttons.forEach(function(entry){
      var node=entry.node,occurrence=node.occurrences.find(function(o){return o.pathId===selectedId;}) || node.occurrences[0];
      entry.occurrence=occurrence;
      var path=pathById.get(occurrence.pathId),shared=sharing.get(node.sourceIndex),shadow=!node.shared && shared && shared.owner.id!==path.id;
      var current=occurrence.pathId===selectedId && occurrence.index===index;
      entry.button.textContent=String(occurrence.visibleIndex+1);
      entry.button.setAttribute('data-step-path',path.id);entry.button.setAttribute('aria-current',String(current));
      entry.button.style.setProperty('--path-color',shadow?shared.owner.color:path.color);
      entry.button.classList.toggle('shared-step-shadow',!!shadow);
      var peers=node.shared?node.occurrences.map(function(o){return pathById.get(o.pathId).label+' (step '+(o.visibleIndex+1)+')';}).join(', '):'';
      entry.button.setAttribute('aria-label','Go to step '+(occurrence.visibleIndex+1)+' on '+path.label+(peers?', shared by '+peers:''));
      entry.button.title=peers?'Shared step — '+peers:shadow?'Shared with '+shared.owner.label:String(source.steps[node.sourceIndex].text || '');
    });
    tracks.forEach(function(track){
      var active=track.pathIds.indexOf(selectedId)>=0,path=active?selected:pathById.get(track.pathIds[0]);
      track.element.setAttribute('stroke',path.color);track.element.setAttribute('opacity',active?'.85':'.25');
    });
    regions.forEach(function(region){region.element.setAttribute('data-selected',String(region.pathIds.indexOf(selectedId)>=0));});
  }
  return {sync:sync,destroy:function(){retired=true;}};
}
