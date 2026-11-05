/* Edge cards share measured board controls, overlap tests and the coin packer.
   The renderer accepts a view of samples, so Workbench can reuse it with synthetic
   values without installing a provider or changing the authored binding. */
function telemetryClearCards(scope){
  scope.querySelectorAll('.dv-metrics-card,.dv-metrics-leader').forEach(function(el){el.remove();});
  scope.querySelectorAll('.dv-metrics-label-hidden').forEach(function(el){el.classList.remove('dv-metrics-label-hidden');el.removeAttribute('data-metrics-preview');});
}
function telemetryCardValue(binding,sample,name){
  if(!name || !binding.signals[name])return 'not bound';
  var reading=telemetryReading(sample,name),unit=binding.signals[name].unit;
  return reading.value===null?'unobserved':Number(reading.value.toPrecision(4)).toLocaleString('en-US')+(unit?' '+unit:'');
}
function telemetryCardContent(edge,binding,sample,result,window){
  var primary=telemetryPrimary(binding),queue=binding.kind==='queue',raw=edge.telemetry || {};
  var title=edge.label || edge.from+' → '+edge.to;
  // A template parameter is explicit author input. Never extract a queue name
  // or a query from the title, id, or query text.
  if(queue && raw.use && telemetryText(raw.topic) && title.indexOf(raw.topic)<0)title+=' · '+raw.topic;
  var state=result && result.telemetry || 'unobserved';
  return {title:title,headline:(queue?'in: ':'')+telemetryCardValue(binding,sample,primary),
    details:queue?['lag: '+telemetryCardValue(binding,sample,'lag'),'age: '+telemetryCardValue(binding,sample,'age')]:
      ['errors: '+telemetryCardValue(binding,sample,telemetryErrorSignal(binding,primary) || 'errors'),'p95: '+telemetryCardValue(binding,sample,'p95')],
    note:state==='silent'?'no traffic · '+window+' window':state==='unobserved'?'unobserved · '+window+' window':window+' window',
    series:primary?telemetryReading(sample,primary).series:[],state:state};
}
/* Authoring placeholders never enter ctl.telemetry or the proof engine. Only
   explicit, valid edge bindings get samples; IDs and labels never infer queries. */
function telemetryCardPreview(diagram,templates){
  var map=Object.create(null);
  (diagram.edges || []).forEach(function(edge){
    var binding=carrierTelemetry(edge,templates);if(!binding)return;
    var signals=Object.create(null);
    Object.keys(binding.signals).forEach(function(name){signals[name]={value:12,series:[[0,12],[1,12]]};});
    map[edge.from+'->'+edge.to]={signals:signals};
  });
  return {preview:true,map:map,verdicts:{carriers:Object.create(null)}};
}
/* Keep the authored side, searching along it before moving farther out. A
   bounded local search falls back to clear space on that same side. */
function telemetryCardPlace(path,w,h,placement,boxes){
  var length=path.getTotalLength(),mid=path.getPointAtLength(length/2),a=path.getPointAtLength(Math.max(0,length/2-2)),b=path.getPointAtLength(Math.min(length,length/2+2));
  var side=placement.side || (Math.abs(b.y-a.y)>Math.abs(b.x-a.x)?'right':'below'),vertical=side==='right' || side==='left',offset=placement.offset || 0;
  function candidate(gap,shift){return {x:vertical?(side==='right'?mid.x+gap:mid.x-gap-w):mid.x-w/2+offset+shift,y:vertical?mid.y-h/2+offset+shift:(side==='below'?mid.y+gap:mid.y-gap-h),w:w,h:h};}
  var box=null;
  for(var ring=0;ring<32 && !box;ring++){
    [0,24,-24,48,-48,96,-96].some(function(shift){var next=candidate(12+ring*24,shift);if(boxes.some(function(obstacle){return boardBoxesOverlap(next,obstacle,6);}))return false;box=next;return true;});
  }
  if(!box){
    var far=boxes.reduce(function(value,r){return Math.max(value,side==='right'?r.x+r.w-mid.x:side==='left'?mid.x-r.x:side==='below'?r.y+r.h-mid.y:mid.y-r.y);},12);
    box=candidate(far+12,0);
  }
  return {box:box,mid:mid,side:side};
}
function telemetryPaintCards(scope,diagram,templates,view,window,activate){
  telemetryClearCards(scope);
  if(!view || !diagram)return;
  scope.querySelectorAll('svg').forEach(function(svg){
    var boxes=[],doc=svg.ownerDocument;
    svg.querySelectorAll('.node .card,.node .icbg,.node use,.node image,.node text,.handoff-stripe,.nlink,.nbackref,.detail-trigger,.handoff-link,[data-dv-handoff],.dvdelta,.node-review-badge,.comm-break,text.lbl').forEach(function(el){if(el.closest('.coin'))return;var box=boardControlBox(el,svg);if(box)boxes.push(box);});
    svg.querySelectorAll('path.edge[data-dv-edge]').forEach(function(path){
      var index=Number(path.getAttribute('data-dv-edge')),edge=(diagram.edges || [])[index],binding=edge && carrierTelemetry(edge,templates);
      var liveBreak=svg.querySelector('.dv-live-comm-failure[data-dv-edge="'+index+'"]');
      if(!binding || edge.hidden===true || !boardControlBox(path,svg) && !boardControlBox(liveBreak,svg))return;
      var id=edge.from+'->'+edge.to,result=view.verdicts.carriers[id],content=telemetryCardContent(edge,binding,view.map[id],result,window);
      if(view.preview){content.note='Preview · synthetic';content.state='preview';}
      var card=telemetrySvg(doc,'g',{'class':'dv-metrics-card','data-dv-edge':index,'data-metrics-card':id,'data-state':content.state,'data-verdict':view.preview?'preview':result && result.verdict || 'unobserved'},svg);
      var rect=telemetrySvg(doc,'rect',{'class':'dv-metrics-card-box',rx:7,width:138,height:78},card);
      telemetrySvg(doc,'path',{'class':'dv-metrics-card-bar',d:'M3 7V71'},card);
      var texts=[];
      function text(value,y,cls){var el=telemetrySvg(doc,'text',{'class':cls,x:10,y:y},card);el.textContent=value;texts.push(el);return el;}
      text(content.title,15,'t1');text(content.headline,31,'t1');
      text(content.details[0],46,'t2');text(content.details[1],59,'t2');text(content.note,72,'t2 dv-metrics-card-note');
      // The synthetic annotation must not move the layout it is previewing.
      // Fit that label inside the measured card, including wider fallback fonts.
      var sizingTexts=view.preview?texts.slice(0,-1):texts;
      var w=Math.max(138,Math.ceil(Math.max.apply(null,sizingTexts.map(function(el){return el.getComputedTextLength();})))+20);
      // Leave dedicated space beside the headline for the rate series.
      w=Math.max(w,Math.ceil(texts[1].getComputedTextLength())+78);rect.setAttribute('width',w);
      // Chromium can reshape hinted SVG glyphs when a fitted board changes
      // scale. Keep each measured advance tied to the card geometry so a
      // later zoom cannot push a note outside its already-sized rectangle.
      texts.forEach(function(el){el.setAttribute('textLength',el.getComputedTextLength());el.setAttribute('lengthAdjust','spacingAndGlyphs');});
      if(view.preview && texts[4].getComputedTextLength()>w-20){texts[4].setAttribute('textLength',w-20);texts[4].setAttribute('lengthAdjust','spacingAndGlyphs');}
      if(content.series.length>=2){var values=content.series.map(function(p){return p[1];}),lo=Math.min.apply(null,values),hi=Math.max.apply(null,values);
        telemetrySvg(doc,'polyline',{'class':'dv-metrics-sparkline',points:values.map(function(v,i){return (w-58+48*i/(values.length-1))+','+(hi===lo?27:33-12*(v-lo)/(hi-lo));}).join(' ')},card);
      }
      var placed=telemetryCardPlace(path,w,78,binding.card || {},boxes),box=placed.box;
      card.setAttribute('transform','translate('+box.x+' '+box.y+')');card.setAttribute('data-side',placed.side);
      var end={x:Math.max(box.x,Math.min(box.x+box.w,placed.mid.x)),y:Math.max(box.y,Math.min(box.y+box.h,placed.mid.y))};
      var leader=telemetrySvg(doc,'path',{'class':'dv-metrics-leader',d:'M'+placed.mid.x+' '+placed.mid.y+'L'+end.x+' '+end.y,'pointer-events':'none','aria-hidden':'true'});
      if(view.preview)leader.setAttribute('data-metrics-preview','true');
      svg.insertBefore(leader,card);boxes.push(box);
      var label=svg.querySelector('text.lbl[data-dv-edge="'+index+'"]');if(label){label.classList.add('dv-metrics-label-hidden');if(view.preview)label.setAttribute('data-metrics-preview','true');}
      if(activate)activate(card,path,edge,index);
    });
  });
}
