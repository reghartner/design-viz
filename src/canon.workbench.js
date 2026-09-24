/* The approved catalog ships beside the editor. The optional company backend
   supplies spec/review context; manual imports remain available offline. */
function initCanonWorkbench(opts){
  var context={catalog:null,revision:null}, catalogPriority=0, host=document.querySelector('.workspace-tools');
  if(!host) return context;
  var details=document.createElement('details');details.className='canon-tools';
  var summary=document.createElement('summary');summary.textContent='Company repository';details.appendChild(summary);
  var status=document.createElement('p');status.setAttribute('role','status');status.textContent='Service and API choices come from the catalog bundled with this editor.';details.appendChild(status);
  var label=document.createElement('label');label.textContent='Catalog JSON';
  var input=document.createElement('textarea'),inputDirty=false;input.rows=4;input.setAttribute('aria-label','Catalog JSON');label.appendChild(input);details.appendChild(label);
  input.addEventListener('input',function(){inputDirty=true;});
  function button(text,fn){var b=document.createElement('button');b.type='button';b.className='bbtn';b.textContent=text;b.addEventListener('click',fn);details.appendChild(b);return b;}
  var catalogStatus=document.createElement('p');catalogStatus.setAttribute('role','status');catalogStatus.className='canon-catalog-status';
  /* Manual choice wins over the bundled snapshot, which wins over a legacy
     live context. Late responses never replace a user's imported catalog. */
  function acceptCatalog(raw,priority,origin){
    if(priority<catalogPriority)return;
    var next=FlowCanon.catalog(raw);
    if(priority===2 && !next.source && !next.services.length){
      if(!catalogPriority)catalogStatus.textContent='No company catalog configured. You can import a catalog JSON snapshot below.';
      return;
    }
    context.catalog=next;catalogPriority=priority;
    if(priority===3 || !inputDirty){input.value=JSON.stringify(next,null,2);inputDirty=false;}
    catalogStatus.textContent=next.services.length+' services · '+origin+'. Select a node to bind it.';
    if(opts.catalogChanged)opts.catalogChanged();
  }
  context.importCatalog=function(raw){acceptCatalog(raw,3,'imported catalog');};
  button('Load catalog',function(){try{acceptCatalog(JSON.parse(input.value),3,'imported catalog');}catch(e){catalogStatus.textContent=e.message;}});
  details.appendChild(catalogStatus);
  host.appendChild(details);
  if(location.protocol!=='file:'){
    context.catalogReady=fetch('catalog.json',{cache:'no-cache'})
      .then(function(r){if(!r.ok)throw new Error('Bundled catalog unavailable ('+r.status+').');return r.json();})
      .then(function(raw){acceptCatalog(raw,2,'bundled catalog');})
      .catch(function(){if(!catalogPriority)catalogStatus.textContent='Bundled catalog unavailable. Existing bindings are preserved; you can import a catalog JSON snapshot.';});
  }else catalogStatus.textContent='Offline editor · import a catalog JSON snapshot to choose company services.';
  var params=new URLSearchParams(location.search), id=params.get('canon');
  if(!id) return context;
  var review=params.get('review'), attached=true;
  context.detach=function(){
    attached=false;context.revision=null;save.disabled=true;save.hidden=true;
    status.textContent='Local project · not attached to a repository review.';
    /* Reload must resume this local draft, not silently reopen the old design. */
    if(typeof history !== 'undefined' && history.replaceState){
      var localUrl=new URL(location.href);
      if(localUrl.searchParams.has('canon') || localUrl.searchParams.has('review')){
        localUrl.searchParams.delete('canon');localUrl.searchParams.delete('review');
        history.replaceState(history.state,'',localUrl.pathname+localUrl.search+localUrl.hash);
      }
    }
  };
  var save=button('Propose spec update',async function(){
    if(!attached)return;
    save.disabled=true;
    try{
      var raw=JSON.parse(opts.src.value), errors=FlowCanon.validate(raw).concat(validate(normalize(raw)).errors);
      if(errors.length) throw new Error(errors.join('\n'));
      if(typeof FlowviewCompatibility !== 'undefined')raw=FlowviewCompatibility.stamp(raw);
      var response=await fetch('/api/canon/proposals',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:id,review:review,spec:raw,baseRevision:context.revision})});
      var result=await response.json();if(!response.ok)throw new Error(result.error);
      if(!attached)return;
      status.textContent='Review '+result.id+' saved. Open the company repository to review it.';
    }catch(e){status.textContent=e.message;}finally{save.disabled=!attached;}
  });save.disabled=true;
  fetch('/api/canon/context?id='+encodeURIComponent(id)+(review?'&review='+encodeURIComponent(review):''))
    .then(function(r){if(!r.ok)throw new Error('Company repository unavailable. Use the local portal or import a catalog snapshot.');return r.json();})
    .then(function(data){if(!attached)return;acceptCatalog(data.catalog,1,'company context');context.revision=data.revision;opts.loadSpec(data.spec);status.textContent=(data.simulated?'SIMULATED · ':'')+id+' · changes are submitted for review.';save.disabled=false;})
    .catch(function(e){if(!attached)return;status.textContent=e.message;details.open=true;});
  return context;
}
