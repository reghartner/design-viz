/* Presentation of a pathTimelineGraph. Positions are derived from the graph,
   not the selected path; switching outcomes only changes paint and numbering.
   No runtime state is combined here and no document listeners are retained. */
function createPathTimeline(host, source, paths, shownPaths, graph, pick, labelWidth){
  var retired=false, pathById=new Map(paths.map(function(p){return [p.id,p];}));
  var rowGap=32, top=22, columnWidth=44;
  labelWidth=sectionPathLabelWidth(labelWidth);
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
  var labels=element('div','path-timeline-labels',root);
  var canvas=document.createElementNS(SVGNS,'svg');canvas.setAttribute('class','path-timeline-lines');
  canvas.setAttribute('width',width);canvas.setAttribute('height',height);canvas.setAttribute('viewBox','0 0 '+width+' '+height);
  canvas.setAttribute('aria-hidden','true');root.appendChild(canvas);
  var nodes=new Map(),buttons=[],choices=[],tracks=[];
  graph.nodes.forEach(function(node){
    nodes.set(node.id,{node:node,x:labelWidth+node.column*columnWidth+columnWidth/2,
      y:node.blockId?sharedPositions.get(node.blockId):lanePositions.get(node.pathIds[0])});
  });
  paths.forEach(function(path){
    var row=element('div','path-timeline-route',labels);row.setAttribute('data-path-row',path.id);
    var choice=element('button','path-chip',row);choice.type='button';choice.title=path.label;
    element('span','path-timeline-label',choice).textContent=path.label;
    choice.setAttribute('data-dv-path',path.id);choice.style.setProperty('--path-color',path.color);
    position(choice,0,lanePositions.get(path.id)-14);
    choice.disabled=!shownPaths.find(function(p){return p.id===path.id;}).indices.length;
    if(choice.disabled)choice.title=path.label+' — No steps from this path are shown in this view.';
    choice.addEventListener('click',function(event){event.stopPropagation();if(!retired){host.scrollLeft=0;pick(path.id,0,true);}});
    choices.push({button:choice,row:row,path:path});
  });
  var sharing=pathStepSharing(paths);
  graph.nodes.forEach(function(node){
    var point=nodes.get(node.id),wrap=element('div','path-timeline-stop',root);
    position(wrap,point.x-14,point.y-14);
    var step=source.steps[node.sourceIndex],button=element('button','schip'+(step.delta===true?' dvd':'')+(node.shared?' shared-downstream-step':''),wrap);
    button.type='button';button.setAttribute('data-step-source',node.sourceIndex);button.setAttribute('data-timeline-node',node.id);
    applyStepCircleColor(button,step);
    var entry={button:button,wrap:wrap,node:node,occurrence:node.occurrences[0]};buttons.push(entry);
    button.addEventListener('click',function(){if(!retired)pick(entry.occurrence.pathId,entry.occurrence.index,false);});
  });
  function stroke(d,pathIds){
    var line=document.createElementNS(SVGNS,'path');line.setAttribute('d',d());line.setAttribute('fill','none');
    line.setAttribute('stroke-width','2');line.setAttribute('stroke-linecap','round');canvas.appendChild(line);
    tracks.push({element:line,pathIds:pathIds,geometry:d});
    return line;
  }
  // Each label enters its first visible stop, including a shared opening.
  // Fixed label widths keep these anchors stable even in initially hidden tabs.
  paths.forEach(function(path){
    var first=graph.nodes.find(function(node){return node.occurrences.some(function(o){return o.pathId===path.id && o.visibleIndex===0;});});
    if(!first)return;
    var point=nodes.get(first.id),x=labelWidth-10,middle=(x+point.x)/2;
    var line=stroke(function(){var y=lanePositions.get(path.id);return 'M '+x+' '+y+' C '+middle+' '+y+' '+middle+' '+point.y+' '+point.x+' '+point.y;},[path.id]);
    line.setAttribute('data-path-entry',path.id);
  });
  graph.edges.forEach(function(edge){
    var a=nodes.get(edge.from),b=nodes.get(edge.to),middle=(a.x+b.x)/2;
    stroke(function(){return 'M '+a.x+' '+a.y+' C '+middle+' '+a.y+' '+middle+' '+b.y+' '+b.x+' '+b.y;},edge.pathIds);
  });
  // A cap belongs to an authored ending, never to the last stop of a filtered view.
  graph.nodes.forEach(function(node){
    var ending=node.occurrences.filter(function(o){return o.index===pathById.get(o.pathId).indices.length-1;}).map(function(o){return o.pathId;});
    if(!ending.length)return;
    var point=nodes.get(node.id),capX=point.x+22;
    stroke(function(){return 'M '+point.x+' '+point.y+' H '+capX+' M '+capX+' '+(point.y-5)+' V '+(point.y+5);},ending);
  });
  /* Observe actual chip sizes: font loading, narrow containers, themes and
     chapter width changes can all change wrapping. Use unscaled layout sizes
     so Explore zoom does not distort the logical connector geometry. */
  function layout(){
    if(retired)return;
    var extras=choices.map(function(choice){return Math.max(0,(choice.button.offsetHeight || 28)-28);});
    function rowY(row){return top+row*rowGap+extras.reduce(function(sum,extra,i){return sum+extra*(row>i?1:row===i?.5:0);},0);}
    rows.lanes.forEach(function(row,id){lanePositions.set(id,rowY(row));});
    rows.shared.forEach(function(row,id){sharedPositions.set(id,rowY(row));});
    choices.forEach(function(choice){position(choice.button,0,lanePositions.get(choice.path.id)-(choice.button.offsetHeight || 28)/2);});
    nodes.forEach(function(point){var node=point.node;point.y=node.blockId?sharedPositions.get(node.blockId):lanePositions.get(node.pathIds[0]);});
    buttons.forEach(function(entry){var point=nodes.get(entry.node.id);position(entry.wrap,point.x-14,point.y-14);});
    height=Math.max.apply(null,Array.from(lanePositions.values()).concat(Array.from(sharedPositions.values())))+22+(extras[extras.length-1] || 0)/2;
    var changed=root.style.height!==height+'px';
    root.style.height=height+'px';canvas.setAttribute('height',height);canvas.setAttribute('viewBox','0 0 '+width+' '+height);
    tracks.forEach(function(track){track.element.setAttribute('d',track.geometry());});
    if(changed)root.dispatchEvent(new CustomEvent('dv:pathlayout',{bubbles:true}));
  }
  var observer=typeof ResizeObserver==='function'?new ResizeObserver(layout):null;
  if(observer)choices.forEach(function(choice){observer.observe(choice.button);});
  layout();
  function sync(selectedId,index){
    if(retired)return;
    var selected=pathById.get(selectedId);
    root.setAttribute('data-selected-path',selectedId);
    choices.forEach(function(choice){var active=choice.path.id===selectedId;choice.button.setAttribute('aria-pressed',String(active));choice.row.setAttribute('data-selected',String(active));});
    buttons.forEach(function(entry){
      var node=entry.node,occurrence=node.occurrences.find(function(o){return o.pathId===selectedId;}) || node.occurrences[0];
      entry.occurrence=occurrence;
      var path=pathById.get(occurrence.pathId),shared=sharing.get(node.sourceIndex),shadow=!node.shared && shared && shared.owner.id!==path.id;
      var current=occurrence.pathId===selectedId && occurrence.index===index;
      entry.button.textContent=String(occurrence.visibleIndex+1);
      entry.button.setAttribute('data-step-path',path.id);entry.button.setAttribute('aria-current',String(current));
      entry.button.setAttribute('data-path-active',String(node.pathIds.indexOf(selectedId)>=0));
      entry.button.style.setProperty('--path-color',shadow?shared.owner.color:path.color);
      entry.button.classList.toggle('shared-step-shadow',!!shadow);
      var peers=node.shared?node.occurrences.map(function(o){return pathById.get(o.pathId).label+' (step '+(o.visibleIndex+1)+')';}).join(', '):'';
      entry.button.setAttribute('aria-label','Go to step '+(occurrence.visibleIndex+1)+' on '+path.label+(peers?', shared by '+peers:''));
      entry.button.title=peers?'Shared step — '+peers:shadow?'Shared with '+shared.owner.label:String(source.steps[node.sourceIndex].text || '');
    });
    tracks.forEach(function(track){
      var active=track.pathIds.indexOf(selectedId)>=0,path=active?selected:pathById.get(track.pathIds[0]);
      track.element.setAttribute('stroke',path.color);track.element.setAttribute('opacity',active?'.85':'.45');
    });
  }
  return {sync:sync,destroy:function(){retired=true;if(observer)observer.disconnect();}};
}
