/* Edge cards share measured board controls, overlap tests and the coin packer.
   The renderer accepts a view of samples, so Workbench can reuse it with synthetic
   values without installing a provider or changing the authored binding. */
function telemetryClearCards(scope){
  scope.querySelectorAll('.dv-metrics-card,.dv-metrics-leader').forEach(function(el){el.remove();});
  scope.querySelectorAll('.dv-metrics-label-hidden').forEach(function(el){el.classList.remove('dv-metrics-label-hidden');el.removeAttribute('data-metrics-preview');});
}
/* Given the board window, a value whose signal covers another span ends in ' · last <span>'. */
function telemetryCardValue(binding,sample,name,pending,window){
  if(!name || !binding.signals[name] || proofVerdicts.isTraceSignal(binding.signals[name]))return 'not bound';
  var reading=telemetryReading(sample,name),unit=binding.signals[name].unit,span=window?telemetrySpanNote(binding.signals[name],window):'';
  return reading.value===null?(pending && pending[name]?'Loading…':'unobserved'):(Number.isSafeInteger(reading.value)?reading.value.toLocaleString('en-US'):Math.abs(reading.value)>=1e9 || reading.value!==0 && Math.abs(reading.value)<.0001?reading.value.toExponential(3):Number(reading.value.toPrecision(4)).toLocaleString('en-US'))+(unit?' '+unit:'')+(span?' · '+span:'')+(sample && sample.signals && sample.signals[name] && sample.signals[name].provenance==='formatted-text'?' (formatted text; may be rounded)':'')+(pending && pending[name]?' · Refreshing…':'');
}
/* Display metadata never changes the pure proof inputs. Carrier query links are
   a legacy fallback only for a single numeric signal; mixed rows own their URLs. */
function telemetryMetricUrl(binding,sample,name){
  var signal=binding.signals[name],entry=sample && sample.signals && sample.signals[name];
  return telemetryQueryUrl(signal && signal.links && signal.links.query) || telemetryQueryUrl(entry && entry.links && entry.links.query) ||
    (Object.keys(binding.signals).length===1?(telemetryQueryUrl(binding.links && binding.links.query) || telemetryQueryUrl(sample && sample.links && sample.links.query)):null);
}
function telemetryMetricRows(binding,sample,pending,window){
  return telemetryMetricNames(binding).map(function(name){var signal=binding.signals[name];return {name:name,label:signal.label || name,text:telemetryCardValue(binding,sample,name,pending,window),url:telemetryMetricUrl(binding,sample,name),scope:telemetryTileScope(signal)};});
}
/* #1194: the short scope on a metric tile: the authored scope as written ("" hides it), else the
   CloudWatch queue or rule name, or the account-wide wording, never the account id. */
function telemetryTileScope(signal){
  if(!signal)return '';
  if(typeof signal.scope==='string')return signal.scope;
  if(signal.source!=='cloudwatch')return '';
  var q=signal.query,d=q.dimensions || {};
  if(d.QueueName)return d.QueueName;
  if(q.namespace==='AWS/IoT' && d.RuleName)return d.RuleName;
  var full=telemetrySignalScope(signal);
  return full.indexOf('all topics')===0?'All topics · whole account':full.indexOf('all connections')===0?'All connections · whole account':'';
}
function telemetryCardBinding(binding){
  var signals={};telemetryMetricNames(binding).forEach(function(name){if(binding.signals[name].showOnCard!==false)signals[name]=binding.signals[name];});
  return Object.assign({},binding,{signals:signals});
}
function telemetryCardScope(signal){
  if(!signal)return '';
  if(typeof signal.scope==='string')return signal.scope;
  if(signal.source!=='cloudwatch')return '';
  var q=signal.query,d=q.dimensions || {};
  if(d.QueueName)return 'This queue';
  if(q.namespace==='AWS/IoT' && d.RuleName)return 'This rule';
  var full=telemetrySignalScope(signal);
  return full.indexOf('all topics')===0?'All topics · whole account':full.indexOf('all connections')===0?'All connections · whole account':full;
}
function telemetryCountNote(binding){return telemetryMetricNames(binding).some(function(name){var s=binding.signals[name];return s.source==='honeycomb' && Array.isArray(s.query.calculations) && s.query.calculations.some(function(c){return c && c.op==='COUNT';});})?'Honeycomb COUNT counts source rows/events, not automatically requests.':'';}
/* #1200: the card border shows the metric state only, never Jira work. The worst signal decides:
   waiting (a signal not arriving, or silent for the whole window) < failing (a limit not met)
   < flowing (values arriving, no limits authored) < held (every authored limit holds).
   Proof chips (#1199) wear the state of the verdict bucket they count. */
var TELEMETRY_PROOF_BUCKET_STATES={proven:'held',liveEarly:'held',degraded:'failing',unproven:'waiting'};
function telemetryCardMetricState(binding,sample,result){
  var names=telemetryMetricNames(binding);
  if(!names.length)return null;
  if(result && result.telemetry==='silent' || names.some(function(name){return telemetryReading(sample,name).value===null;}))return 'waiting';
  if(result && (result.failing || []).length)return 'failing';
  return telemetryMetricProofNames(binding).length?'held':'flowing';
}
/* Hidden (showOnCard:false) signals count toward the card state, as they do in the verdict;
   name each one on the card when it has no value or fails, so the border has a visible cause.
   A hidden signal still loading with no value yet is left out; a refresh keeps its last line. */
function telemetryCardHiddenNote(binding,sample,result,pending){
  return telemetryMetricNames(binding).filter(function(name){return binding.signals[name].showOnCard===false && !(pending && pending[name] && telemetryReading(sample,name).value===null);}).map(function(name){
    var why=telemetryReading(sample,name).value===null?'no value':result && (result.failing || []).indexOf(name)>=0?'outside limit':'';
    return why?'Hidden '+(binding.signals[name].label || name)+': '+why:'';
  }).filter(Boolean).join(' · ');
}
function telemetryCardContent(edge,binding,sample,result,window,pending){
  // Visibility never changes source ownership or legacy-link ambiguity.
  var rows=telemetryMetricRows(binding,sample,pending,window).filter(function(row){return binding.signals[row.name].showOnCard!==false;});
  rows.forEach(function(row){
    var observed=telemetryReading(sample,row.name).value!==null;
    row.health=observed?(result && (result.failing || []).indexOf(row.name)>=0?'failing':'observed'):pending && pending[row.name]?'loading':'unobserved';
  });
  var hidden=telemetryCardHiddenNote(binding,sample,result,pending);binding=telemetryCardBinding(binding);
  var primary=telemetryPrimary(binding,true) || telemetryMetricNames(binding)[0] || null,queue=binding.kind==='queue',raw=edge.telemetry || {};
  var title=binding.card && binding.card.title || edge.label || edge.from+' → '+edge.to;
  // A template parameter is explicit author input. Never extract a queue name
  // or a query from the title, id, or query text. An authored card title is used as written.
  if(queue && raw.use && telemetryText(raw.topic) && !(binding.card && binding.card.title) && title.indexOf(raw.topic)<0)title+=' · '+raw.topic;
  var state=result && result.telemetry || 'unobserved',signal=primary && binding.signals[primary],scope=telemetryCardScope(signal),scalar=signal && (signal.source==='cloudwatch' || signal.source==='cloudwatchLogs');
  var loading=telemetryMetricNames(binding).some(function(name){return pending && pending[name];});
  var measured=telemetryMetricNames(binding).some(function(name){return telemetryReading(sample,name).value!==null;});
  if(loading && !measured)state='loading';
  return {rows:rows,hidden:hidden,countNote:telemetryCountNote(binding),title:title,headline:(queue?'in: ':'')+telemetryCardValue(binding,sample,primary,pending,window)+(scalar && !telemetrySpanNote(signal,window) && telemetryReading(sample,primary).value!==null?' in '+window:''),scope:[scope,telemetryCountNote(binding)?'COUNT: source rows/events':''].filter(Boolean).join(' · '),
    details:rows.filter(function(row){return row.name!==primary;}).map(function(row){return row.label+': '+row.text;}),
    note:loading?(measured?'Refreshing…':'Loading…'):state==='silent'?'no traffic · '+window+' window':state==='unobserved'?'unobserved · '+window+' window':window+' window',
    series:primary?telemetryReading(sample,primary).series:[],chartRange:sample && (sample.signals && sample.signals[primary] && sample.signals[primary].window || sample.window),intervalMs:sample && sample.signals && sample.signals[primary] && sample.signals[primary].intervalMs,state:state};
}
/* Authoring placeholders never enter ctl.telemetry or the proof engine. Only
   explicit, valid edge bindings get samples; IDs and labels never infer queries. */
function telemetryCardPreview(diagram,templates){
  var map=Object.create(null);
  (diagram.edges || []).forEach(function(edge){
    var binding=carrierTelemetry(edge,templates);if(!binding || !telemetryMetricNames(binding).length)return;
    var signals=Object.create(null);
    telemetryMetricNames(binding).forEach(function(name){signals[name]={value:12,series:[[0,12],[1,12]]};});
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
  // Manual top-left is relative to the path midpoint, independent of card
  // text width, side preferences and automatic obstacle packing.
  if(placement.position)return {box:{x:mid.x+placement.position.x,y:mid.y+placement.position.y,w:w,h:h},mid:mid,side:side};
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
/* The leader from the edge midpoint to its card, with a gap wherever it would
   cross a trace label (#1163), so the line never strikes through the label. */
function telemetrySegmentInBox(a,b,r,pad){
  var dx=b.x-a.x,dy=b.y-a.y,lo=0,hi=1,p=[-dx,dx,-dy,dy],q=[a.x-r.x+pad,r.x+r.w+pad-a.x,a.y-r.y+pad,r.y+r.h+pad-a.y];
  for(var i=0;i<4;i++){if(!p[i]){if(q[i]<0)return null;continue;}var u=q[i]/p[i];if(p[i]<0)lo=Math.max(lo,u);else hi=Math.min(hi,u);}
  return lo<hi?[lo,hi]:null;
}
function telemetryCardLeader(a,b,labels){
  var dx=b.x-a.x,dy=b.y-a.y,gaps=[],d='',t=0;
  (labels || []).forEach(function(r){var gap=telemetrySegmentInBox(a,b,r,3);if(gap)gaps.push(gap);});
  function at(u){return (a.x+dx*u)+' '+(a.y+dy*u);}
  gaps.sort(function(g,h){return g[0]-h[0];}).forEach(function(g){if(g[0]>t)d+='M'+at(t)+'L'+at(g[0]);t=Math.max(t,g[1]);});
  return t<1?d+'M'+at(t)+'L'+at(1):d;
}
/* Leader to the nearest point of a card box; shared with the Workbench card drag preview. */
function telemetryCardLeaderTo(mid,box,labels){
  return telemetryCardLeader(mid,{x:Math.max(box.x,Math.min(box.x+box.w,mid.x)),y:Math.max(box.y,Math.min(box.y+box.h,mid.y))},labels);
}
/* Whether any of these trace labels now meets a metric card or a drawn card leader (#1163). */
function telemetryTraceLabelsBlocked(texts){
  return texts.some(function(text){
    var svg=text.closest('svg'),box=svg && boardControlBox(text,svg);if(!box)return false;
    return Array.from(svg.querySelectorAll('.dv-metrics-card-box')).some(function(el){var card=boardControlBox(el,svg);return !!card && boardBoxesOverlap(box,card,0);}) ||
      Array.from(svg.querySelectorAll('.dv-metrics-leader')).some(function(leader){
        var n=(leader.getAttribute('d') || '').match(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) || [];
        for(var i=0;i+3<n.length;i+=4)if(telemetrySegmentInBox({x:+n[i],y:+n[i+1]},{x:+n[i+2],y:+n[i+3]},box,0))return true;
        return false;
      });
  });
}
function telemetryTraceLabelBoxes(svg){
  return Array.from(svg.querySelectorAll('.dv-trace-overlay text')).map(function(el){return boardControlBox(el,svg);}).filter(Boolean);
}
function telemetryPaintCards(scope,diagram,templates,view,window,activate,config){
  telemetryClearCards(scope);
  if(!view || !diagram)return;
  scope.querySelectorAll('svg').forEach(function(svg){
    var boxes=[],labels=[],doc=svg.ownerDocument;
    svg.querySelectorAll('.node .card,.node .icbg,.node use,.node image,.node text,.handoff-stripe,.nlink,.nbackref,.detail-trigger,.handoff-link,[data-dv-handoff],.dvdelta,.node-review-badge,.comm-break,text.lbl,.dv-trace-overlay text').forEach(function(el){if(el.closest('.coin'))return;var box=boardControlBox(el,svg);if(box)boxes.push(box);if(box && el.closest('.dv-trace-overlay'))labels.push(box);});
    Array.from(svg.querySelectorAll('path.edge[data-dv-edge]')).sort(function(a,b){
      function manual(path){var edge=(diagram.edges || [])[Number(path.getAttribute('data-dv-edge'))],binding=edge && carrierTelemetry(edge,templates,null,config);return !!(binding && binding.card && binding.card.position);}
      return Number(manual(b))-Number(manual(a));
    }).forEach(function(path){
      var index=Number(path.getAttribute('data-dv-edge')),edge=(diagram.edges || [])[index],binding=edge && carrierTelemetry(edge,templates,null,config);
      var liveBreak=svg.querySelector('.dv-live-comm-failure[data-dv-edge="'+index+'"]');
      if(!binding || !telemetryMetricNames(telemetryCardBinding(binding)).length || edge.hidden===true || !boardControlBox(path,svg) && !boardControlBox(liveBreak,svg))return;
      var id=edge.from+'->'+edge.to,result=view.verdicts.carriers[id],content=telemetryCardContent(edge,binding,view.map[id],result,window,view.pending && view.pending[id]);
      if(view.preview){content.note='Preview · synthetic';content.state='preview';}
      var card=telemetrySvg(doc,'g',{'class':'dv-metrics-card','data-dv-edge':index,'data-metrics-card':id,'data-state':content.state,'data-verdict':view.preview?'preview':result && result.verdict || 'unobserved'},svg),metricState=view.preview?null:telemetryCardMetricState(binding,view.map[id],result);
      if(metricState)card.setAttribute('data-metric-state',metricState);
      // Authored card.width or 240, with measured wrapping, never stretched glyphs.
      // Height is the actual rendered content and participates in obstacle packing.
      var w=binding.card && binding.card.width || 240,y=15,rect=telemetrySvg(doc,'rect',{'class':'dv-metrics-card-box',rx:7,width:w},card);
      var bar=telemetrySvg(doc,'path',{'class':'dv-metrics-card-bar'},card);
      function wrapped(value,cls,width,maxLines,x){
        x=x==null?10:x;
        var el=telemetrySvg(doc,'text',{'class':cls,x:x,y:y},card),line='',lines=[];
        function fits(value){el.textContent=value;return el.getComputedTextLength()<=width;}
        String(value || '').split(/\s+/).filter(Boolean).forEach(function(word){
          var next=line?line+' '+word:word;if(fits(next)){line=next;return;}
          if(line){lines.push(line);line='';}
          // Only a single overlong token needs character fallback.
          Array.from(word).forEach(function(ch){if(line && !fits(line+ch)){lines.push(line);line=ch;}else line+=ch;});
        });if(line)lines.push(line);
        var omitted=maxLines && lines.length>maxLines;if(omitted)lines=lines.slice(0,maxLines);
        if(omitted){line=lines[lines.length-1];el.textContent=line+'…';while(line && el.getComputedTextLength()>width){line=line.slice(0,-1);el.textContent=line+'…';}lines[lines.length-1]=line+'…';}
        el.textContent='';lines.forEach(function(value,i){var span=telemetrySvg(doc,'tspan',{x:x,dy:i?14:0},el);span.textContent=value+(i<lines.length-1?' ':'');});
        y+=Math.max(1,lines.length)*14;return el;
      }
      wrapped(content.title,'t1 dv-metrics-card-title',w-20,2);y+=3;
      var scopes=content.rows.map(function(row){return telemetryCardScope(binding.signals[row.name]);});
      var sharedScope=scopes[0] && scopes.every(function(scope){return scope===scopes[0];})?scopes[0]:null;
      content.rows.forEach(function(row,index){
        var top=y,formatted=row.text.indexOf(' (formatted text; may be rounded)')>=0;
        var display=formatted?row.text.replace(' (formatted text; may be rounded)',''):row.text;
        var value=telemetrySvg(doc,'text',{'class':'t1 dv-metrics-card-value',x:10,y:top,'data-signal':row.name},card);value.textContent=display;
        var valueWidth=value.getComputedTextLength(),label;
        if(valueWidth<=w-108){
          // A small table: numbers align at the right, labels use the remainder (at least 56 units).
          value.setAttribute('x',w-32-valueWidth);
          label=wrapped(row.label,'t2 dv-metrics-card-label',w-52-valueWidth,2);
        }else{
          value.remove();label=wrapped(row.label,'t2 dv-metrics-card-label',w-42,2);
          value=wrapped(display,'t1 dv-metrics-card-value',w-42,3);value.setAttribute('data-signal',row.name);
        }
        label.setAttribute('data-signal',row.name);
        value.setAttribute('data-metric-health',view.preview?'preview':row.health);
        if(row.health==='failing' && !view.preview)wrapped('Outside limit','t2 dv-metrics-card-failure',w-42,1).setAttribute('data-signal',row.name);
        if(formatted)wrapped('formatted text; may be rounded','t2 dv-metrics-card-provenance',w-42,2);
        if(!sharedScope && scopes[index])wrapped(scopes[index],'t2 dv-metrics-card-scope',w-42,2);
        if(row.url){
          var link=telemetrySvg(doc,'a',{'class':'dv-metrics-query-link',href:row.url,target:'_blank',rel:'noopener noreferrer',tabindex:0,'aria-label':'Open '+row.label+' source query in a new tab','data-signal':row.name},card);
          telemetrySvg(doc,'rect',{x:w-28,y:top-11,width:22,height:16,fill:'transparent'},link);
          var icon=telemetrySvg(doc,'svg',{x:w-26,y:top-9,width:16,height:16,viewBox:'0 0 24 24','class':'fv-icon fv-icon--mono','aria-hidden':'true',focusable:'false'},link);icon.innerHTML=FlowIcons.glyph('external-link',{monochrome:true});
          ['pointerdown','click','keydown'].forEach(function(type){link.addEventListener(type,function(ev){ev.stopPropagation();});});
        }
        y+=2;
      });
      if(content.series.length){telemetryPaintSparkline(doc,card,content.series,10,y,Math.min(100,w-20),12,telemetryWindowMs(window),content.chartRange,content.intervalMs);y+=20;}
      if(sharedScope)wrapped(sharedScope,'t2 dv-metrics-card-scope',w-20,2);
      if(content.hidden && !view.preview)wrapped(content.hidden,'t2 dv-metrics-card-hidden',w-20,2);
      wrapped(content.note,'t2 dv-metrics-card-note',w-20,2);
      if(content.countNote)wrapped('COUNT: source rows/events','t2 dv-metrics-card-scope',w-20,2);
      var height=y+3;rect.setAttribute('height',height);bar.setAttribute('d','M3 7V'+(height-7));
      var placed=telemetryCardPlace(path,w,height,binding.card || {},boxes),box=placed.box;
      card.setAttribute('data-metrics-anchor-x',placed.mid.x);card.setAttribute('data-metrics-anchor-y',placed.mid.y);
      card.setAttribute('transform','translate('+box.x+' '+box.y+')');card.setAttribute('data-side',placed.side);
      var leader=telemetrySvg(doc,'path',{'class':'dv-metrics-leader','data-dv-edge':index,d:telemetryCardLeaderTo(placed.mid,box,labels),'pointer-events':'none','aria-hidden':'true'});
      if(view.preview)leader.setAttribute('data-metrics-preview','true');
      svg.insertBefore(leader,card);boxes.push(box);
      var label=svg.querySelector('text.lbl[data-dv-edge="'+index+'"]');if(label){label.classList.add('dv-metrics-label-hidden');if(view.preview)label.setAttribute('data-metrics-preview','true');}
      if(activate)activate(card,path,edge,index,binding);
    });
  });
}
