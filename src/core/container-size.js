/* Minimum viable container sizes for the two containers that analyze their own
   content: step controls (step text, path count, path length) and the diagram
   (placed node, group and routed edge bounds). Deterministic CSS-pixel
   estimates, not DOM measurements. Loaded last by the backend bundle; the
   composer (tools/arrange) and the authoring helper (tools/size-section-layout.cjs)
   both read these numbers, so they never disagree. Other panel types keep their
   estimates in tools/arrange/estimate.cjs. */

var CONTAINER_ROW_PX = 40, CONTAINER_GAP_PX = 8, CONTAINER_COLUMNS = 24;
/* Graph label text is 12px at 100% zoom; 10px is readable, 8px is the floor. */
var DIAGRAM_LABEL_PX = 12, DIAGRAM_READABLE_PX = 10, DIAGRAM_FLOOR_PX = 8;
/* Width-sized SVG chrome above the drawing (sizing row, zoom/Fit controls) and
   the board/tile inset; see tools/arrange/packing.cjs graphHeight. */
var DIAGRAM_CHROME_PX = 165;

function containerText(value){
  if(value==null)return '';
  if(typeof value==='string')return value;
  return typeof value==='object'?Object.keys(value).map(function(k){return containerText(value[k]);}).filter(Boolean).join(' '):String(value);
}
/* Wrapped line count with conservative proportional advances. */
function containerTextLines(value,width,font){
  font=font||14;
  var input=containerText(value);if(!input)return 0;
  var available=Math.max(font*3,width);
  function advance(c){return /[⺀-￿]/.test(c)?font:/[MW@#%]/.test(c)?font*.9:/[il.,' ]/.test(c)?font*.38:font*.62;}
  return input.split('\n').reduce(function(n,line){
    var used=0,count=1;
    line.split(/(\s+)/).forEach(function(word){
      var size=Array.from(word).reduce(function(s,c){return s+advance(c);},0);
      if(used&&used+size>available){count++;used=0;}
      count+=Math.max(0,Math.ceil(size/available)-1);
      used=size>available?size%available:used+size;
    });
    return n+count;
  },0);
}
/* Approximate inline-block/flex wrapping with conservative monospace advances.
   Long labels wrap within an item; short links/chips share the same row. */
function containerInlineRows(labels,width,font,lineHeight,paddingX,paddingY,gap){
  var used=0,row=0,total=0;
  labels.forEach(function(label){
    var length=Array.from(label).reduce(function(n,c){return n+(/[⺀-￿]/.test(c)?font:font*.65);},0),
      w=Math.min(width,length+paddingX),
      h=Math.max(1,containerTextLines(label,width-paddingX,font),Math.ceil(length/Math.max(1,width-paddingX)))*lineHeight+paddingY;
    if(used&&used+gap+w>width){total+=row+gap;used=0;row=0;}
    used+=(used?gap:0)+w;row=Math.max(row,h);
  });
  return total+row;
}
function containerRows(px,minimum){return Math.max(minimum,Math.ceil((px+CONTAINER_GAP_PX)/CONTAINER_ROW_PX));}
/* Grid geometry for a reader viewport: the section grid is at least 1000px and
   scales down uniformly below that (engine.js section layout observer). */
function containerGrid(viewportWidth){
  var host=(viewportWidth||1200)-80,gridWidth=Math.max(1000,host);
  return {gridWidth:gridWidth,scale:Math.min(1,host/1000),pitch:(gridWidth+CONTAINER_GAP_PX)/CONTAINER_COLUMNS};
}

/* Step controls: transport, path tracks and the tallest step caption. */
function stepControlsSize(d,width){
  var paths=diagramPathList(d),available=Math.max(1,width-30),delta=(d.steps||[]).some(function(s){return s.delta;}),chipPitch=delta?38:29;
  var tracks=0,captionWidth=available,overhead;
  if(paths.length>1){
    var graph=pathTimelineGraph(paths);
    if(graph.hasShared){
      var rows=pathTimelineRows(paths,graph);
      tracks=44+32*Math.max.apply(null,Array.from(rows.lanes.values()).concat(Array.from(rows.shared.values())));
    }else tracks=paths.reduce(function(n,p){return n+Math.max(32,containerTextLines(p.label,190,11)*16+12)+8;},0);
    // Transport, separate path track, gaps, frame and horizontal-scroll gutter.
    overhead=36+20+tracks+16+(delta?14:4)+30;
  }else{
    var chips=Math.max(1,paths[0]&&paths[0].indices.length||0)*chipPitch;
    var remaining=available-290-Math.min(chips,available)-20;
    if(remaining>=200){captionWidth=remaining;overhead=50;}
    else {tracks=Math.ceil(chips/available)*36;overhead=30+36+10+tracks+10;}
  }
  // Evidence links and runtime chips occupy independent wrapping rows beneath
  // the narrative. The native stepper forwards codeRefs, not node/API bindings;
  // URL payloads and code anchors are not visible caption text.
  var sharedNote=paths.length>1?'Shared step · also in '+paths.map(function(p){return p.label||p.id;}).join(', '):'';
  var samples=[];
  paths.forEach(function(p){
    diagramForPath(d,p.id).steps.forEach(function(step){
      var maxLines=Math.max(1,containerTextLines([step.text,step.lane,step.id,step.link?'source':'',sharedNote].filter(Boolean).join(' '),Math.max(1,captionWidth-40),14));
      var evidenceHeight=containerInlineRows(FlowCanon.links({codeRefs:step.codeRefs}).map(function(l){return l.label+' ↗';}),captionWidth,14,22,12,8,0);
      var runtime=containerInlineRows((step.conditions||[]).map(function(c){return '! '+c.label;}),captionWidth,12,18,20,12,7);
      samples.push({maxLines:maxLines,evidenceHeight:evidenceHeight,runtimeHeight:runtime?runtime+8:0,height:maxLines*22+evidenceHeight+(runtime?runtime+8:0)});
    });
  });
  function most(key,floor){return Math.max.apply(null,[floor].concat(samples.map(function(s){return s[key];})));}
  // The native mode strip is outside the termbar, inside the saved steps tile.
  var neededHeight=36+overhead+most('height',22);
  return {neededHeight:neededHeight,rows:containerRows(neededHeight,3),maxLines:most('maxLines',1),trackHeight:tracks,captionWidth:captionWidth,
    evidenceHeight:most('evidenceHeight',0),runtimeHeight:most('runtimeHeight',0),unsupported:available<200,
    pathCount:paths.length,maxPathSteps:Math.max.apply(null,[0].concat(paths.map(function(p){return p.indices.length;})))};
}

/* Narrowest step-controls width that shows the transport and every step chip
   (or the path timeline) on one track without horizontal scrolling. */
function stepControlsMinWidth(d){
  var paths=diagramPathList(d),delta=(d.steps||[]).some(function(s){return s.delta;}),
    longest=Math.max.apply(null,[1].concat(paths.map(function(p){return p.indices.length;}))),track;
  if(paths.length>1){
    var graph=pathTimelineGraph(paths);
    // A shared-step timeline has a fixed-width label column (230px default; only
    // named views override it) and 44px columns; the plain path matrix shrinks its
    // label column to 150px beside 35px chips.
    track=graph.hasShared?sectionPathLabelWidth(undefined)+Math.max(1,graph.columns)*44+28:150+longest*35;
  }else track=longest*(delta?38:29)+10;
  // Transport (previous, play, next, status) and the 200px caption floor; frame padding.
  return Math.max(260,track)+30;
}

/* Diagram bounds: placed nodes, group boxes and routed edges with a
   conservative envelope for edge labels and moving step markers. */
function diagramContentBounds(d){
  if(!Object.keys(d.nodes||{}).length)return {x:0,y:0,w:1,h:1};
  var clean=JSON.parse(JSON.stringify(d));delete clean.graphFrame;
  var geometry=layout(clean),exported=exportAnonymousLayout({page:{title:'Composition',sections:[{diagram:clean}]}}).diagrams[0],boxes=[];
  function add(x,y,w,h){boxes.push({x:x,y:y,w:w,h:h});}
  exported.nodes.forEach(function(n){add(n.x,n.y,n.width,n.height);});
  Object.keys(geometry.groups||{}).forEach(function(k){var b=geometry.groups[k];add(b.x,b.y,b.w,b.h);});
  exported.edges.forEach(function(edge,i){
    var n=(edge.path.match(/-?\d*\.?\d+(?:e[+-]?\d+)?/gi)||[]).map(Number),xs=n.filter(function(_,j){return j%2===0;}),ys=n.filter(function(_,j){return j%2===1;});
    if(!xs.length)return;
    var x=Math.min.apply(null,xs),y=Math.min.apply(null,ys),w=Math.max.apply(null,xs)-x,h=Math.max.apply(null,ys)-y;add(x,y,w,h);
    var e=d.edges[i],count=(d.steps||[]).filter(function(s){return (s.edges||[s.edge]).indexOf(e.from+'->'+e.to)>=0;}).length;
    var pad=Math.max(16,Math.min(180,count*12)),label=containerText(e.label).length*3.6;
    add(x+Math.min(0,e.labelDx||0)-label-pad,y+Math.min(0,e.labelDy||0)-30,w+Math.abs(e.labelDx||0)+2*(label+pad),h+Math.abs(e.labelDy||0)+60);
  });
  var x=Math.floor(Math.min.apply(null,boxes.map(function(b){return b.x;}))-30),y=Math.floor(Math.min.apply(null,boxes.map(function(b){return b.y;}))-30),
    w=Math.ceil(Math.max.apply(null,boxes.map(function(b){return b.x+b.w;}))+30)-x,h=Math.ceil(Math.max.apply(null,boxes.map(function(b){return b.y+b.h;}))+30)-y;
  if(![x,y,w,h].every(Number.isFinite)||Math.max(Math.abs(x),Math.abs(y),w,h)>100000)throw Error('Unsupported: graph geometry exceeds bounded frame');
  return {x:x,y:y,w:w,h:h};
}
/* The SVG scales to its tile width and never to its height, so height follows
   width; label size follows width over the drawing's own width. */
function diagramSize(d,width,scale,bounds){
  scale=scale==null?1:scale;bounds=bounds||diagramContentBounds(d);
  var drawing=width*bounds.h/Math.max(1,bounds.w),neededHeight=drawing+DIAGRAM_CHROME_PX;
  return {bounds:bounds,neededHeight:Math.ceil(neededHeight),rows:containerRows(neededHeight-CONTAINER_GAP_PX,4),
    labelPx:DIAGRAM_LABEL_PX*Math.max(0,(width-2)/Math.max(1,bounds.w))*scale,
    naturalWidth:Math.ceil(bounds.w/scale+64),
    readableWidth:Math.ceil(bounds.w*DIAGRAM_READABLE_PX/DIAGRAM_LABEL_PX/scale+64),
    minimumWidth:Math.ceil(bounds.w*DIAGRAM_FLOOR_PX/DIAGRAM_LABEL_PX/scale+64)};
}
var FlowContainerSize={grid:containerGrid,textLines:containerTextLines,text:containerText,inlineRows:containerInlineRows,
  stepControls:stepControlsSize,stepControlsMinWidth:stepControlsMinWidth,diagram:diagramSize,diagramBounds:diagramContentBounds,rows:containerRows,
  READABLE_PX:DIAGRAM_READABLE_PX,FLOOR_PX:DIAGRAM_FLOOR_PX};
