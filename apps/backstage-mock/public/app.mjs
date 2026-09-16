const $=id=>document.getElementById(id);let selected,registry,referenceDraft=null,incident=null;
function el(tag,text,cls){const e=document.createElement(tag);if(text!=null)e.textContent=text;if(cls)e.className=cls;return e;}
function status(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error);}
async function api(path,data){const r=await fetch('/api/canon/'+path,data?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{});const result=await r.json();if(!r.ok)throw new Error(result.error);return result;}
function select(id){selected=id;const diagram=registry.diagrams.find(d=>d.id===id);$('title').textContent=diagram.title;$('viewer').src='/template/flowview.html?spec='+encodeURIComponent('/api/canon/specs/'+id)+'&v='+diagram.revision;$('edit').href='/workbench/flowspec.html?canon='+encodeURIComponent(id);$('trace-section').replaceChildren();for(const section of diagram.sections){const option=el('option',section.title);option.value=section.index;$('trace-section').append(option);} $('reference-state').textContent=diagram.sections[0]?.hasReference?'Approved reference attached':'Reference not yet approved';$('compare-trace').disabled=!diagram.sections[0]?.hasReference;$('reference-approval').hidden=true;referenceDraft=null;$('incident-actions').hidden=true;}
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
    }else {const details=el('details');details.append(el('summary','Inspect proposed spec JSON'),el('pre',JSON.stringify(review.proposedSpec,null,2)));card.append(el('p','Diagram '+review.diagramId+' · review the proposed JSON before accepting.'),details);}
    if(review.decision)card.append(el('p',review.decision.reason));
    if(review.ticket){const a=el('a','Linked regression ticket');a.href=review.ticket;card.append(a);}
    if(['open','repair','regression'].includes(review.status)){
      const reason=el('input');reason.placeholder='Review reason (required)';reason.setAttribute('aria-label','Review reason '+review.id);card.append(reason);
      const actions=el('div',null,'actions');
      async function decide(disposition){try{await api('decisions',{id:review.id,disposition,reason:reason.value});status('Decision saved.');await refresh();select(selected);}catch(e){status(e.message,true);}}
      if(review.type==='spec'){const edit=el('a','Edit proposed spec','button');edit.href='/workbench/flowspec.html?canon='+encodeURIComponent(review.diagramId)+'&review='+review.id;edit.target='_blank';edit.rel='noopener';const accept=el('button','Approve spec update');accept.onclick=()=>decide('update');actions.append(edit,accept);}
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

function resetTraceReview(){referenceDraft=null;$('reference-approval').hidden=true;}
function refreshTraceSection(){
  const d=registry.diagrams.find(d=>d.id===selected),section=d.sections.find(s=>s.index===Number($('trace-section').value));
  $('reference-state').textContent=section?.hasReference?'Approved reference attached':'Reference not yet approved';
  $('compare-trace').disabled=!section?.hasReference;resetTraceReview();
}
function traceInput(){return {id:selected,section:Number($('trace-section').value),trace:JSON.parse($('trace-json').value)};}
function showMapping(result){
  const box=$('trace-result');box.replaceChildren();
  if(result.reason)box.append(el('p',result.reason));
  if(Object.hasOwn(result,'firstDivergence'))box.append(el('h3',result.firstDivergence?'First difference: '+result.firstDivergence:'No difference detected in the mapped evidence'));
  const table=el('table'),head=el('tr'),body=el('tbody');for(const title of ['Authored step','Evidence','Span IDs','Duration'])head.append(el('th',title));table.append(head);
  for(const step of result.mapping.steps){const row=el('tr');for(const value of [step.stepId,step.conditions.length?step.conditions.map(c=>c.label).join('; '):step.status,step.spans.map(s=>s.id).join(', ') || '—',step.spans.map(s=>s.durationMs===null?'unknown':s.durationMs+' ms').join(', ') || '—'])row.append(el('td',value));body.append(row);}table.append(body);box.append(table);
  if(result.pathId)box.append(el('p','The shared prefix follows the authored baseline. Uninstrumented actions are not independently verified. After the fork, physical and customer outcomes need review.'));
  for(const warning of result.warnings || result.mapping.warnings || [])box.append(el('p',warning));
  if(result.mapping.unmatched.length){const details=el('details');details.append(el('summary','Unmatched spans ('+result.mapping.unmatched.length+')'),el('pre',JSON.stringify(result.mapping.unmatched,null,2)));box.append(details);}
}
async function traceAction(button,fn){button.disabled=true;try{await fn();}catch(e){status(e.message,true);}finally{button.disabled=false;}}
$('trace-section').onchange=refreshTraceSection;
$('trace-json').oninput=resetTraceReview;
$('load-trace').onclick=()=>traceAction($('load-trace'),async()=>{$('trace-json').value=JSON.stringify(await api('fixtures/'+$('trace-fixture').value),null,2);resetTraceReview();status('Fictional trace loaded. Preview its mapping or compare with the approved reference.');});
$('trace-file').onchange=async()=>{const file=$('trace-file').files[0];if(!file)return;if(file.size>2_000_000){status('Trace file exceeds 2 MB.',true);return;}$('trace-json').value=await file.text();resetTraceReview();$('trace-input').open=true;};
$('preview-reference').onclick=()=>traceAction($('preview-reference'),async()=>{
  const input=traceInput(),revision=registry.diagrams.find(d=>d.id===selected).revision,result=await api('reference-preview',input);showMapping(result);
  referenceDraft=result.eligible?{...input,baseRevision:revision}:null;$('reference-approval').hidden=!result.eligible;status(result.reason);
});
$('approve-reference').onclick=()=>traceAction($('approve-reference'),async()=>{
  if(!referenceDraft)throw new Error('Preview the reference mapping first.');
  await api('reference-approve',{...referenceDraft,reason:$('reference-reason').value});await refresh();select(selected);status('Reference mapping approved and saved with the canonical spec.');
});
$('compare-trace').onclick=()=>traceAction($('compare-trace'),async()=>{
  incident=await api('compare',{...traceInput(),label:'Incident trace'});showMapping(incident);resetTraceReview();
  $('viewer').src='/template/flowview.html?spec='+encodeURIComponent('/api/canon/incidents/'+incident.id+'/spec');
  $('download-incident').href='/api/canon/incidents/'+incident.id+'/spec';$('incident-actions').hidden=!incident.pathId;
  status(incident.pathId?'Incident alternate ready below. Select the orange path chip; the canonical flow is unchanged.':'No alternate needed: mapped evidence satisfies the approved flow. Inspect unmatched spans and timing coverage above.');
});
$('canonical').onclick=()=>{select(selected);$('incident-actions').hidden=true;status('Showing the canonical flow.');};
$('propose-incident').onclick=()=>traceAction($('propose-incident'),async()=>{
  if(!incident?.pathId)throw new Error('Compare an incident first.');
  const result=await api('proposals',{id:incident.diagramId,spec:incident.spec,baseRevision:incident.baseRevision});await refresh();status('Created spec review '+result.id+'. Review and approve it below to retain this alternate.');
});
select(selected);
