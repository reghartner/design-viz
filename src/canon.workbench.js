/* Optional same-origin company repository adapter. Static/offline authoring
   remains available; catalog snapshots can also be pasted without a server. */
function initCanonWorkbench(opts){
  var context={catalog:null,revision:null}, host=document.querySelector('.workspace-tools');
  if(!host) return context;
  var details=document.createElement('details');details.className='canon-tools';
  var summary=document.createElement('summary');summary.textContent='Company repository';details.appendChild(summary);
  var status=document.createElement('p');status.setAttribute('role','status');status.textContent='Import a catalog snapshot to enable service and API dropdowns.';details.appendChild(status);
  var label=document.createElement('label');label.textContent='Catalog JSON';
  var input=document.createElement('textarea');input.rows=4;input.setAttribute('aria-label','Catalog JSON');label.appendChild(input);details.appendChild(label);
  function button(text,fn){var b=document.createElement('button');b.type='button';b.className='bbtn';b.textContent=text;b.addEventListener('click',fn);details.appendChild(b);return b;}
  button('Load catalog',function(){try{context.catalog=FlowCanon.catalog(JSON.parse(input.value));status.textContent=context.catalog.services.length+' services loaded. Select a node to bind it.';}catch(e){status.textContent=e.message;}});
  host.appendChild(details);
  var params=new URLSearchParams(location.search), id=params.get('canon');
  if(!id) return context;
  var review=params.get('review');
  var save=button('Propose spec update',async function(){
    save.disabled=true;
    try{
      var raw=JSON.parse(opts.src.value), errors=FlowCanon.validate(raw).concat(validate(normalize(raw)).errors);
      if(errors.length) throw new Error(errors.join('\n'));
      var response=await fetch('/api/canon/proposals',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:id,review:review,spec:raw,baseRevision:context.revision})});
      var result=await response.json();if(!response.ok)throw new Error(result.error);
      status.textContent='Review '+result.id+' saved. Open the company repository to review it.';
    }catch(e){status.textContent=e.message;}finally{save.disabled=false;}
  });save.disabled=true;
  fetch('/api/canon/context?id='+encodeURIComponent(id)+(review?'&review='+encodeURIComponent(review):''))
    .then(function(r){if(!r.ok)throw new Error('Company repository unavailable. Use the local portal or import a catalog snapshot.');return r.json();})
    .then(function(data){context.catalog=FlowCanon.catalog(data.catalog);context.revision=data.revision;input.value=JSON.stringify(data.catalog,null,2);opts.loadSpec(data.spec);status.textContent=(data.simulated?'SIMULATED · ':'')+context.catalog.services.length+' services · '+id+' · changes are submitted for review.';save.disabled=false;})
    .catch(function(e){status.textContent=e.message;details.open=true;});
  return context;
}
