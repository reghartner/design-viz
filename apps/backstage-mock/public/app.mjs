const $=id=>document.getElementById(id);let selected,registry;
function el(tag,text,cls){const e=document.createElement(tag);if(text!=null)e.textContent=text;if(cls)e.className=cls;return e;}
function status(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error);}
async function api(path,data){const r=await fetch('/api/canon/'+path,data?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{});const result=await r.json();if(!r.ok)throw new Error(result.error);return result;}
function select(id){selected=id;const diagram=registry.diagrams.find(d=>d.id===id);$('title').textContent=diagram.title;$('viewer').src='/template/flowview.html?spec='+encodeURIComponent('/api/canon/specs/'+id)+'&v='+diagram.revision;$('edit').href='/workbench/flowspec.html?canon='+encodeURIComponent(id);}
async function refresh(){
  registry=await api('registry');$('diagrams').replaceChildren();
  for(const d of registry.diagrams){const b=el('button',d.title,'quiet');b.onclick=()=>select(d.id);$('diagrams').append(b);}
  if(!selected)select(registry.diagrams[0].id);
  $('reviews').replaceChildren();
  if(!registry.reviews.length)$('reviews').append(el('p','No reviews yet. Scan the fictional source history to find the recording timeout change.'));
  for(const review of [...registry.reviews].reverse()){
    const card=el('article',null,'review '+review.status);card.append(el('p',review.status.toUpperCase()+' · '+review.id,'eyebrow'),el('h3',review.type==='spec'?'Proposed diagram update':review.reference.path));
    if(review.type==='drift'){
      const impacts=el('ul');for(const i of review.impacts)impacts.append(el('li',i.diagramId+' · '+i.targetId+' — '+i.description));card.append(impacts);
      if(review.error)card.append(el('p',review.error));
      else{const diff=el('div',null,'diff');diff.append(el('pre','REVIEWED\n'+review.before.text),el('pre','CURRENT\n'+review.after.text));card.append(diff);}
    }else card.append(el('p','Diagram '+review.diagramId+' · review the proposed JSON before accepting.'),el('pre',JSON.stringify(review.proposedSpec,null,2)));
    if(review.decision)card.append(el('p',review.decision.reason));
    if(review.ticket){const a=el('a','Linked regression ticket');a.href=review.ticket;card.append(a);}
    if(['open','repair','regression'].includes(review.status)){
      const reason=el('input');reason.placeholder='Review reason (required)';reason.setAttribute('aria-label','Review reason '+review.id);card.append(reason);
      const actions=el('div',null,'actions');
      async function decide(disposition){try{await api('decisions',{id:review.id,disposition,reason:reason.value});status('Decision saved.');await refresh();select(selected);}catch(e){status(e.message,true);}}
      if(review.type==='spec'){const accept=el('button','Approve spec update');accept.onclick=()=>decide('update');actions.append(accept);}
      else{
        if(!review.error){const accept=el('button','No behavioral impact');accept.onclick=()=>decide('no-impact');actions.append(accept);}
        const issue=el('button','Record regression ticket','quiet');issue.onclick=()=>decide('regression');actions.append(issue);
        for(const id of new Set(review.impacts.map(i=>i.diagramId))){const edit=el('a','Update '+id+' spec','button');edit.href='/workbench/flowspec.html?canon='+encodeURIComponent(id)+'&review='+review.id;edit.target='_blank';edit.rel='noopener';actions.append(edit);}
      }
      card.append(actions);
    }
    $('reviews').append(card);
  }
}
$('scan').onclick=async()=>{const b=$('scan');b.disabled=true;try{const result=await api('scan',{});status(result.reviews.length+' changed reference group(s) found. Existing reviews are reused.');await refresh();}catch(e){status(e.message,true);}finally{b.disabled=false;}};
$('refresh').onclick=()=>refresh().catch(e=>status(e.message,true));
await refresh().catch(e=>status(e.message,true));
if(location.pathname!=='/'){
  const entity=$('entity');entity.hidden=false;
  if(location.pathname.startsWith('/issues/')){const review=registry.reviews.find(r=>r.id===location.pathname.split('/').pop());entity.append(el('h2','Simulated regression ticket'),el('p',review?.decision?.reason || 'No recorded regression.'));}
  else{const catalog=await api('catalog'),name=location.pathname.split('/').pop(),service=catalog.services.find(s=>s.entityRef.endsWith('/'+name));entity.append(el('h2',service?.title || 'Catalog entity'),el('pre',JSON.stringify(service || {},null,2)));}
}
