/* Pack shared tracks into existing rows where unrelated routes leave room.
   Reserve whole track spans, not just circles, so a common track cannot appear
   to join an unrelated path passing through the same columns. */
function pathTimelineRows(paths,graph){
  var lanes=new Map(paths.map(function(path,index){return [path.id,index];}));
  var byId=new Map(graph.nodes.map(function(node){return [node.id,node];}));
  var occupied=[],shared=new Map();
  paths.forEach(function(path){
    var columns=graph.nodes.filter(function(node){return node.pathIds.indexOf(path.id)>=0;}).map(function(node){return node.column;});
    if(columns.length)occupied.push({pathId:path.id,row:lanes.get(path.id),first:Math.min.apply(null,columns),last:Math.max.apply(null,columns)});
  });
  graph.blocks.forEach(function(block){
    var members=block.nodeIds.map(function(id){return byId.get(id);});
    var columns=members.map(function(node){return node.column;});
    var participating=block.pathIds.filter(function(id){return members.every(function(node){return node.pathIds.indexOf(id)>=0;});});
    var first=Math.min.apply(null,columns),last=Math.max.apply(null,columns);
    var ideal=block.pathIds.reduce(function(sum,id){return sum+lanes.get(id);},0)/block.pathIds.length;
    function clear(row){return !occupied.some(function(track){
      if(track.pathId!==undefined && participating.indexOf(track.pathId)>=0)return false;
      return track.first<=last && first<=track.last && Math.abs(track.row-row)<1;
    });}
    var candidates=[ideal];
    for(var row=0;row<=paths.length+graph.blocks.length;row+=.5)candidates.push(row);
    candidates.sort(function(a,b){return Math.abs(a-ideal)-Math.abs(b-ideal) || a-b;});
    var chosen=candidates.find(clear);
    shared.set(block.id,chosen);occupied.push({row:chosen,first:first,last:last});
  });
  return {lanes:lanes,shared:shared};
}

/* Presentation of a pathTimelineGraph. Positions are derived from the graph,
   not the selected path; switching outcomes only changes paint and numbering.
   No runtime state is combined here and no document listeners are retained. */
function createPathTimeline(host, source, paths, shownPaths, graph, pick){
  var retired=false, pathById=new Map(paths.map(function(p){return [p.id,p];}));
  var rowGap=32, top=22, labelWidth=150, columnWidth=44;
  var rows=pathTimelineRows(paths,graph);
  var lanePositions=new Map(Array.from(rows.lanes,function(pair){return [pair[0],top+pair[1]*rowGap];}));
  var sharedPositions=new Map(Array.from(rows.shared,function(pair){return [pair[0],top+pair[1]*rowGap];}));
  var width=labelWidth+Math.max(1,graph.columns)*columnWidth+28;
  var height=Math.max.apply(null,Array.from(lanePositions.values()).concat(Array.from(sharedPositions.values())))+22;
  function element(tag,className,parent){var e=document.createElement(tag);e.className=className;if(parent)parent.appendChild(e);return e;}
  function position(e,x,y){e.style.left=x+'px';e.style.top=y+'px';}
  var root=element('div','path-timeline',host);
  root.setAttribute('role','group');root.setAttribute('aria-label','Paths with shared processing');
  root.style.width=width+'px';root.style.height=height+'px';
  var canvas=document.createElementNS(SVGNS,'svg');canvas.setAttribute('class','path-timeline-lines');
  canvas.setAttribute('width',width);canvas.setAttribute('height',height);canvas.setAttribute('viewBox','0 0 '+width+' '+height);
  canvas.setAttribute('aria-hidden','true');root.appendChild(canvas);
  var nodes=new Map(),buttons=[],choices=[],tracks=[];
  graph.nodes.forEach(function(node){
    nodes.set(node.id,{node:node,x:labelWidth+node.column*columnWidth+columnWidth/2,
      y:node.blockId?sharedPositions.get(node.blockId):lanePositions.get(node.pathIds[0])});
  });
  paths.forEach(function(path){
    var row=element('div','path-timeline-route',root);row.setAttribute('data-path-row',path.id);
    var choice=element('button','path-chip',row);choice.type='button';choice.title=path.label;
    element('span','path-timeline-label',choice).textContent=path.label;
    choice.setAttribute('data-dv-path',path.id);choice.style.setProperty('--path-color',path.color);
    position(choice,0,lanePositions.get(path.id)-14);
    choice.disabled=!shownPaths.find(function(p){return p.id===path.id;}).indices.length;
    if(choice.disabled)choice.title='No steps from this path are shown in this view.';
    choice.addEventListener('click',function(event){event.stopPropagation();if(!retired)pick(path.id,0,true);});
    choices.push({button:choice,row:row,path:path});
  });
  var sharing=pathStepSharing(paths);
  graph.nodes.forEach(function(node){
    var point=nodes.get(node.id),wrap=element('div','path-timeline-stop',root);
    position(wrap,point.x-14,point.y-14);
    var step=source.steps[node.sourceIndex],button=element('button','schip'+(step.delta===true?' dvd':'')+(node.shared?' shared-downstream-step':''),wrap);
    button.type='button';button.setAttribute('data-step-source',node.sourceIndex);button.setAttribute('data-timeline-node',node.id);
    applyStepCircleColor(button,step);
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
  }
  return {sync:sync,destroy:function(){retired=true;}};
}
