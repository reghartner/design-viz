/* Message contracts share one card renderer in every host. */
function contractCardHTML(contract, sectionReference, record){
  if (!contract || typeof contract !== 'object' || Array.isArray(contract)) return '';
  var addressed = (typeof sectionReference === 'number' && sectionReference > 0) ||
                  (typeof sectionReference === 'string' && sectionReference.length > 0);
  var sectionAddress = addressed ? esc(String(sectionReference)) : '';
  if(record && record.key!=='legacy')sectionAddress+='-block-'+esc(record.reference);
  var key=record?record.key:'legacy';
  var h = '<div class="ctcard" data-dv-contract="'+esc(key)+'" data-contract-ref="'+esc(record?record.reference:'legacy')+'" style="--contract-span:'+contractColumnSpan(contract.span)+'"' + (addressed ? ' id="contract-' + sectionAddress + '"' : '') + '>';
  var src = (contract.source && typeof contract.source === 'string') ?
    ' <a class="srcchip" href="' + esc(contract.source) + '" target="_blank" rel="noopener">source &#8599;</a>' : '';
  if (contract.title || src || addressed){
    h += '<div class="cttitle"><span>' + esc(contract.title || 'On the wire') + src + '</span>';
    if (addressed) h += '<button type="button" class="copychip contractcopy" title="Copy link" aria-label="Copy link to this contract card">' + COPY_ICON + '</button>';
    h += '</div>';
  }
  var rows = Array.isArray(contract.fields) ? contract.fields : [];
  var body = '', renderedRow = 0;
  rows.forEach(function(f, fi){
    if (!f || typeof f !== 'object' || !f.k) return;
    renderedRow++;
    var link = (f.link && typeof f.link === 'string') ?
      ' <a class="ctlink" href="' + esc(f.link) + '" target="_blank" rel="noopener" aria-label="Source for ' +
      esc(f.k) + '">&#8599;</a>' : '';
    var delta = ['added','removed','changed'].indexOf(f.delta) >= 0 ? f.delta : null;
    var badge = delta ? ' <span class="ctdelta" aria-label="' + delta + ' field">' + delta + '</span>' : '';
    body += '<tr class="ctrow' + (f.hot === true ? ' hot' : '') +
            (delta ? ' delta-' + delta : '') + '"' +
            ' data-dv-crow="' + fi + '"' + /* spec index — malformed rows are skipped, so the rendered position can lag it */
            (addressed ? ' id="contract-' + sectionAddress + '-row-' + renderedRow +
             '" tabindex="-1" aria-label="Contract field ' + esc(f.k) + '"' : '') +
            fragmentAttrs(f) + '>' +
            '<td class="ctk"><span class="ctkey">' + esc(f.k) + link + '</span>' + badge + '</td>' +
            '<td class="ctv">' + (f.v != null ? esc(f.v) : '') + '</td>' +
            '<td class="ctg">' + (f.g != null ? proseMarkup(f.g) : '') + '</td></tr>';
  });
  if (body) h += '<table class="cttable">' + body + '</table>';
  if (contract.note) h += '<div class="ctnote">' + proseMarkup(contract.note) + '</div>';
  h += '</div>';
  return h;
}

function contractBlocksHTML(section,reference){
  var records=sectionContracts(section);
  if(!records.length)return '';
  return '<div class="contract-region"><div class="contract-grid">'+records.map(function(rec){
    return contractCardHTML(rec.value,reference,rec);
  }).join('')+'</div></div>';
}

/* One owner per active step. The manual popover escapes board clipping while
   retaining the host's skin/shadow tree. No document listeners survive close. */
function wireStepContracts(host, board, entries, prefix, stepIndex, onPin){
  if(!entries.length)return null;
  var pop=document.createElement('div');pop.className='nbackpop wire-contract-preview';pop.id=prefix+'-wire-contract';
  pop.setAttribute('popover','manual');pop.setAttribute('role','dialog');pop.hidden=true;host.appendChild(pop);
  var markers=[],active=null,pinned=false,closeTimer=null,retired=false,suppressFocus=false;
  function cancelClose(){if(closeTimer!=null)clearTimeout(closeTimer);closeTimer=null;}
  function close(focus){
    cancelClose();var previous=active;active=null;pinned=false;
    if(previous){previous.setAttribute('aria-expanded','false');previous.setAttribute('aria-pressed','false');}
    document.removeEventListener('keydown',escape,true);document.removeEventListener('pointerdown',outsideSection,true);document.removeEventListener('focusin',outsideSection,true);document.removeEventListener('scroll',position,true);window.removeEventListener('resize',position);
    if(pop.hidePopover && pop.matches(':popover-open'))pop.hidePopover();pop.hidden=true;
    if(focus && previous && previous.isConnected){suppressFocus=true;previous.focus({preventScroll:true});suppressFocus=false;}
  }
  function outsideSection(ev){if(active && !host.contains(ev.target))close(false);}
  function escape(ev){if(ev.key==='Escape'){ev.preventDefault();ev.stopPropagation();close(true);}}
  function position(){
    if(!active || retired)return;
    var rect=active.getBoundingClientRect(),vw=window.innerWidth,vh=window.innerHeight;
    var width=pop.offsetWidth,height=pop.offsetHeight,cx=rect.left+rect.width/2,cy=rect.top+rect.height/2;
    var controls=Array.prototype.map.call(host.querySelectorAll('.diagram-views,.explore-tools,.explore-player,.termbar'),function(el){return el.getBoundingClientRect();}).filter(function(r){return r.width && r.height;});
    var reader=host.closest('.docview'),navigation=reader && reader.querySelector(':scope>.explore-navigation');
    if(navigation){var navRect=navigation.getBoundingClientRect();if(navRect.width && navRect.height)controls.push(navRect);}
    var boardRect=board.svg.closest('.board').getBoundingClientRect(),candidates=[];
    function overlap(a,b){return Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));}
    function candidate(x,y){
      var left=Math.max(8,Math.min(vw-width-8,x)),top=Math.max(8,Math.min(vh-height-8,y));
      var box={left:left,top:top,right:left+width,bottom:top+height};
      candidates.push({box:box,cover:controls.reduce(function(sum,r){return sum+overlap(box,r);},0),marker:overlap(box,rect),distance:Math.pow(Math.max(0,left-rect.right,rect.left-box.right),2)+Math.pow(Math.max(0,top-rect.bottom,rect.top-box.bottom),2),centerDistance:Math.pow(left+width/2-cx,2)+Math.pow(top+height/2-cy,2)});
    }
    candidate(cx-width/2,rect.top-height-10);candidate(cx-width/2,rect.bottom+10);
    candidate(rect.right+10,cy-height/2);candidate(rect.left-width-10,cy-height/2);
    /* Native Canvas can begin near the viewport bottom, leaving the toolbar
       directly above the wire. Try beside the marker inside the measured board,
       then beyond each control boundary, instead of covering those controls. */
    var rows=[boardRect.top+4,boardRect.bottom-height-4];
    controls.forEach(function(r){rows.push(r.bottom+4,r.top-height-4);});
    rows.forEach(function(y){[cx-width/2,rect.right+10,rect.left-width-10].forEach(function(x){candidate(x,y);});});
    candidates.sort(function(a,b){return a.cover-b.cover || a.marker-b.marker || a.distance-b.distance || a.centerDistance-b.centerDistance;});
    pop.style.left=candidates[0].box.left+'px';pop.style.top=candidates[0].box.top+'px';
  }
  function scheduleClose(){
    cancelClose();if(pinned)return;
    closeTimer=setTimeout(function(){closeTimer=null;if(!pinned && !pop.matches(':hover') && !(active && active.matches(':hover')) && !pop.contains(document.activeElement) && document.activeElement!==active)close(false);},220);
  }
  function show(marker,entry,pin){
    if(retired || suppressFocus || pinned && active!==marker && !pin)return;
    cancelClose();
    if(active!==marker){
      close(false);active=marker;
      pop.innerHTML='<div class="wire-contract-heading"><span>On this wire</span><button type="button" aria-label="Close wire contract">×</button></div>'+contractCardHTML(entry.record.value,null,entry.record);
      pop.setAttribute('aria-label',entry.record.value.title || 'Wire contract');
      pop.querySelector('button').addEventListener('click',function(){close(true);});
      setFragmentStep(pop,stepIndex,true);
      pop.hidden=false;if(pop.showPopover)pop.showPopover();
      active.setAttribute('aria-expanded','true');
      document.addEventListener('keydown',escape,true);document.addEventListener('pointerdown',outsideSection,true);document.addEventListener('focusin',outsideSection,true);document.addEventListener('scroll',position,true);window.addEventListener('resize',position);
    }
    if(pin){pinned=true;active.setAttribute('aria-pressed','true');if(onPin)onPin();}
    pop.classList.toggle('is-pinned',pinned);position();
  }
  pop.addEventListener('pointerenter',cancelClose);pop.addEventListener('pointerleave',scheduleClose);
  pop.addEventListener('focusin',cancelClose);pop.addEventListener('focusout',scheduleClose);
  pop.addEventListener('click',function(ev){ev.stopPropagation();});
  pop.addEventListener('keydown',function(ev){ev.stopPropagation();});
  entries.forEach(function(entry,index){
    var info=board.edgeIds[entry.edge];if(!info || !info.pathEl || info.pathEl.classList.contains('dv-fragment-hidden'))return;
    var siblings=entries.filter(function(item){return item.edge===entry.edge;}),slot=siblings.indexOf(entry);
    var point=info.pathEl.getPointAtLength(info.pathEl.getTotalLength()*(.72+slot*.18/Math.max(1,siblings.length-1)));
    var marker=document.createElementNS(SVGNS,'g');marker.setAttribute('class','wire-contract-marker');
    marker.setAttribute('transform','translate('+point.x+' '+point.y+')');marker.setAttribute('role','button');marker.setAttribute('tabindex','0');
    marker.setAttribute('aria-label','Contract: '+(entry.record.value.title || 'On the wire')+' on '+entry.edge);
    marker.setAttribute('aria-haspopup','dialog');marker.setAttribute('aria-controls',pop.id);marker.setAttribute('aria-expanded','false');marker.setAttribute('aria-pressed','false');
    marker.setAttribute('data-wire-edge',entry.edge);marker.setAttribute('data-wire-contract',entry.record.key);
    marker.innerHTML='<circle class="wire-contract-pulse" r="16"/><rect x="-14" y="-14" width="28" height="28" rx="7"/><path d="M-6-7H6V8H-6Z M-3-10V-5 M3-10V-5 M-3-1H3 M-3 3H3"/>';
    marker.addEventListener('pointerenter',function(){show(marker,entry,false);});marker.addEventListener('pointerleave',scheduleClose);
    marker.addEventListener('focus',function(){show(marker,entry,false);});marker.addEventListener('blur',scheduleClose);
    marker.addEventListener('pointerdown',function(ev){ev.stopPropagation();});
    marker.addEventListener('click',function(ev){ev.preventDefault();ev.stopPropagation();show(marker,entry,true);});
    marker.addEventListener('keydown',function(ev){
      if(ev.key==='Enter' || ev.key===' '){ev.preventDefault();ev.stopPropagation();show(marker,entry,true);pop.querySelector('button').focus({preventScroll:true});}
      else if(ev.key==='Tab' && !ev.shiftKey && active===marker){ev.preventDefault();pop.querySelector('button').focus({preventScroll:true});}
    });
    board.svg.appendChild(marker);markers.push(marker);
  });
  return {destroy:function(){retired=true;close(false);markers.forEach(function(marker){marker.remove();});pop.remove();}};
}
