function reviewBadgeHTML(value,verdict){
  var key=verdict?value && value.verdict:reviewStatus(value);
  if(typeof key!=='string' || !Object.prototype.hasOwnProperty.call(verdict?STEP_VERDICTS:DESIGN_STATUS,key))return '';
  var label=verdict?STEP_VERDICTS[key]:DESIGN_STATUS[key].label;
  return label?'<span class="review-badge review-'+key+'">'+esc(verdict?label:DESIGN_STATUS[key].symbol+' '+label)+'</span>':'';
}
function reviewStepHTML(step){
  if(!step)return '<span class="review-no-step">No step — path ended</span>';
  return reviewBadgeHTML(step,true)+(typeof step.ref==='string'?'<span class="review-ref">'+esc(step.ref)+'</span>':'')+
    '<div class="review-caption">'+proseMarkup(step.text || step.title || '')+'</div>'+
    '<div class="review-targets">'+esc(stepKeys(step).concat(stepNodes(step)).join(' · '))+'</div>';
}
function renderPathReview(host,d,pathId,position){
  if(!host)return;
  var model=pathReviewComparison(d,pathId);host.hidden=!model;
  if(!model){host.replaceChildren();host._reviewMarkup=null;return;}
  var markup='<summary>Compare with '+esc(model.base.label)+'</summary><p class="review-alignment">Steps align by their full path position. Each path keeps its own state.</p>'+
    '<table><thead><tr><th scope="col">Step</th><th scope="col">'+esc(model.base.label)+'</th><th scope="col">'+esc(model.current.label)+'</th></tr></thead><tbody>'+
    model.rows.map(function(row){return '<tr><th scope="row">'+(row.position+1)+'</th><td>'+reviewStepHTML(row.base)+'</td><td>'+reviewStepHTML(row.current)+'</td></tr>';}).join('')+'</tbody></table>';
  /* Keep the disclosure's keyboard focus and scroll position during playback. */
  if(host._reviewMarkup!==markup){host.innerHTML=markup;host._reviewMarkup=markup;}
  host.querySelectorAll('tbody tr').forEach(function(row,i){
    row.classList.toggle('review-current',i===position);
    if(i===position)row.setAttribute('aria-current','step');else row.removeAttribute('aria-current');
  });
}
function reviewLegendHTML(d){
  var placed=new Set();
  (d.rows || []).forEach(function(row){(row || []).forEach(function(slot){(Array.isArray(slot)?slot:[slot]).forEach(function(id){placed.add(id);});});});
  (d.floats || []).forEach(function(f){if(f)placed.add(f.id);});
  function visible(id){return placed.has(id) && d.nodes[id] && d.nodes[id].hidden!==true;}
  var values=Object.keys(d.nodes || {}).filter(visible).map(function(id){return d.nodes[id];}).concat((d.edges || []).filter(function(e){return e.hidden!==true && visible(e.from) && visible(e.to);}));
  var statuses=Object.keys(DESIGN_STATUS).filter(function(key){return values.some(function(value){return reviewStatus(value)===key;});});
  return statuses.map(function(key){return '<span class="li">'+reviewBadgeHTML({status:key},false)+'</span>';}).join('')+
    (values.some(reviewBaseline)?'<span class="li review-baseline-key">Faded · baseline</span>':'');
}
function nodeReviewBadge(n,width){
  var status=reviewStatus(n);if(!status)return '';
  var meta=DESIGN_STATUS[status],label=meta.symbol+' '+meta.label,bw=80;
  return '<g class="node-review-badge review-'+status+'" transform="translate('+(width-bw)+' -10)" aria-label="'+meta.label+'"><rect width="'+bw+'" height="17" rx="5"/><text x="'+bw/2+'" y="12" text-anchor="middle">'+esc(label)+'</text></g>';
}
