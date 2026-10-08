/* Read-only proposed state, separate from the editor's document and history. */
function workbenchAgentConflictFeedback(review){
  var prefix=review.artifacts && review.artifacts.metadata==='.'?'':'.flowview-agent/';
  return ['Your proposed Flowview update could not be committed. My current diagram has been preserved.',
    'Proposal: '+review.id, 'Starting revision: '+review.baseRevision, 'Current revision: '+review.revision,'',
    'Please resolve these conflicts or validation problems:',
    (review.conflicts || []).map(function(item){return '- '+item.path+': '+item.reason;}).join('\n'),'',
    'Reread '+prefix+'state.json and the accepted spec and ledger named in '+prefix+'project.json. Reconcile your intended changes with my latest edits, preserve unrelated work, reconcile the ledger with the complete story, validate it, and submit both artifacts in a new proposal with the revision you actually read. Do not just relabel the old proposal with a newer revision.'
  ].join('\n');
}

/* Compare normalized pages without decorating either source object. Stable
   authored IDs win; exact content then keeps un-IDed insertion/reordering from
   becoming a string of positional changes. Changes without a rendered target
   fall back to their containing section. */
function workbenchAgentReviewSignature(value){
  if(Array.isArray(value))return '['+value.map(workbenchAgentReviewSignature).join(',')+']';
  if(value && typeof value==='object')return '{'+Object.keys(value).sort().map(function(key){
    return JSON.stringify(key)+':'+workbenchAgentReviewSignature(value[key]);
  }).join(',')+'}';
  return JSON.stringify(value);
}
function workbenchAgentReviewSide(){return {document:null,sections:Object.create(null),counts:{added:0,removed:0,modified:0}};}
function workbenchAgentReviewDocument(side,status){
  if(side.document===status)return;if(side.document)side.counts[side.document]--;side.document=status;side.counts[status]++;
}
function workbenchAgentReviewSection(side,index){
  return side.sections[index] || (side.sections[index]={status:null,nodes:Object.create(null),edges:Object.create(null),panels:Object.create(null),steps:Object.create(null)});
}
function workbenchAgentReviewMark(side,index,kind,key,status){
  var section=workbenchAgentReviewSection(side,index),bucket=kind==='section'?section:section[kind];
  if(kind==='section'){
    if(section.status===status)return;
    if(section.status)side.counts[section.status]--;
    section.status=status;
  }else{
    if(bucket[key]===status)return;
    if(bucket[key])side.counts[bucket[key]]--;
    bucket[key]=status;
  }
  side.counts[status]++;
}
function workbenchAgentReviewUniqueMatch(current,proposed,currentUsed,proposedUsed,key,pairs,pairRepeated){
  var left=Object.create(null),right=Object.create(null);
  current.forEach(function(item,index){if(!currentUsed.has(index)){var value=key(item);if(value!=null)(left[value] || (left[value]=[])).push(index);}});
  proposed.forEach(function(item,index){if(!proposedUsed.has(index)){var value=key(item);if(value!=null)(right[value] || (right[value]=[])).push(index);}});
  Object.keys(left).forEach(function(value){
    if(!right[value] || !pairRepeated && (left[value].length!==1 || right[value].length!==1))return;
    for(var i=0;i<(pairRepeated?Math.min(left[value].length,right[value].length):1);i++){
      var a=left[value][i],b=right[value][i];currentUsed.add(a);proposedUsed.add(b);pairs.push([a,b]);
    }
  });
}
function workbenchAgentReviewArray(current,proposed,currentSide,proposedSide,currentSection,proposedSection,kind,naturalKey){
  current=Array.isArray(current)?current:[];proposed=Array.isArray(proposed)?proposed:[];
  var currentUsed=new Set(),proposedUsed=new Set(),pairs=[];
  workbenchAgentReviewUniqueMatch(current,proposed,currentUsed,proposedUsed,function(value){
    return value && (typeof value.id==='string' || typeof value.id==='number')?'id:'+String(value.id):null;
  },pairs);
  workbenchAgentReviewUniqueMatch(current,proposed,currentUsed,proposedUsed,function(value){return 'same:'+workbenchAgentReviewSignature(value);},pairs,true);
  if(naturalKey)workbenchAgentReviewUniqueMatch(current,proposed,currentUsed,proposedUsed,naturalKey,pairs);
  pairs.forEach(function(pair){
    if(workbenchAgentReviewSignature(current[pair[0]])!==workbenchAgentReviewSignature(proposed[pair[1]])){
      workbenchAgentReviewMark(currentSide,currentSection,kind,pair[0],'modified');
      workbenchAgentReviewMark(proposedSide,proposedSection,kind,pair[1],'modified');
    }
  });
  current.forEach(function(value,index){if(!currentUsed.has(index))workbenchAgentReviewMark(currentSide,currentSection,kind,index,'removed');});
  proposed.forEach(function(value,index){if(!proposedUsed.has(index))workbenchAgentReviewMark(proposedSide,proposedSection,kind,index,'added');});
}
function workbenchAgentReviewObject(current,proposed,currentSide,proposedSide,currentSection,proposedSection,kind){
  current=current && typeof current==='object' && !Array.isArray(current)?current:{};
  proposed=proposed && typeof proposed==='object' && !Array.isArray(proposed)?proposed:{};
  Object.keys(current).forEach(function(key){
    if(!Object.prototype.hasOwnProperty.call(proposed,key))workbenchAgentReviewMark(currentSide,currentSection,kind,key,'removed');
    else if(workbenchAgentReviewSignature(current[key])!==workbenchAgentReviewSignature(proposed[key])){
      workbenchAgentReviewMark(currentSide,currentSection,kind,key,'modified');
      workbenchAgentReviewMark(proposedSide,proposedSection,kind,key,'modified');
    }
  });
  Object.keys(proposed).forEach(function(key){
    if(!Object.prototype.hasOwnProperty.call(current,key))workbenchAgentReviewMark(proposedSide,proposedSection,kind,key,'added');
  });
}
function workbenchAgentReviewWithout(value,keys){
  if(!value || typeof value!=='object')return value;
  var result={};Object.keys(value).forEach(function(key){if(keys.indexOf(key)<0)result[key]=value[key];});return result;
}
function workbenchAgentReviewChanges(currentPage,proposedPage){
  var currentSide=workbenchAgentReviewSide(),proposedSide=workbenchAgentReviewSide();
  if(workbenchAgentReviewSignature(workbenchAgentReviewWithout(currentPage,['blocks','sections']))!==workbenchAgentReviewSignature(workbenchAgentReviewWithout(proposedPage,['blocks','sections']))){
    workbenchAgentReviewDocument(currentSide,'modified');workbenchAgentReviewDocument(proposedSide,'modified');
  }
  var current=sectionRecords(currentPage).map(function(record,index){var section=record.section || {};return {index:index,section:section,
    id:typeof section.id==='string' && section.id?section.id:null,context:JSON.stringify([record.tabLabel,section.heading || '']),
    diagram:section.diagram?workbenchAgentReviewSignature(section.diagram):null,signature:workbenchAgentReviewSignature(section)};});
  var proposed=sectionRecords(proposedPage).map(function(record,index){var section=record.section || {};return {index:index,section:section,
    id:typeof section.id==='string' && section.id?section.id:null,context:JSON.stringify([record.tabLabel,section.heading || '']),
    diagram:section.diagram?workbenchAgentReviewSignature(section.diagram):null,signature:workbenchAgentReviewSignature(section)};});
  var currentUsed=new Set(),proposedUsed=new Set(),pairs=[];
  workbenchAgentReviewUniqueMatch(current,proposed,currentUsed,proposedUsed,function(item){return item.id==null?null:'id:'+item.id;},pairs);
  workbenchAgentReviewUniqueMatch(current,proposed,currentUsed,proposedUsed,function(item){return 'same:'+item.signature;},pairs,true);
  workbenchAgentReviewUniqueMatch(current,proposed,currentUsed,proposedUsed,function(item){return 'context:'+item.context;},pairs);
  workbenchAgentReviewUniqueMatch(current,proposed,currentUsed,proposedUsed,function(item){return item.diagram==null?null:'diagram:'+item.diagram;},pairs);
  var left=current.map(function(unused,index){return index;}).filter(function(index){return !currentUsed.has(index);});
  var right=proposed.map(function(unused,index){return index;}).filter(function(index){return !proposedUsed.has(index);});
  if(left.length===1 && right.length===1){currentUsed.add(left[0]);proposedUsed.add(right[0]);pairs.push([left[0],right[0]]);}
  current.forEach(function(item,index){if(!currentUsed.has(index))workbenchAgentReviewMark(currentSide,index,'section',null,'removed');});
  proposed.forEach(function(item,index){if(!proposedUsed.has(index))workbenchAgentReviewMark(proposedSide,index,'section',null,'added');});
  pairs.forEach(function(pair){
    var a=current[pair[0]],b=proposed[pair[1]],aSection=a.section,bSection=b.section,aDiagram=aSection.diagram || {},bDiagram=bSection.diagram || {};
    if(workbenchAgentReviewSignature(workbenchAgentReviewWithout(aSection,['diagram']))!==workbenchAgentReviewSignature(workbenchAgentReviewWithout(bSection,['diagram'])) ||
       workbenchAgentReviewSignature(workbenchAgentReviewWithout(aSection.diagram,['nodes','edges','panels','steps']))!==workbenchAgentReviewSignature(workbenchAgentReviewWithout(bSection.diagram,['nodes','edges','panels','steps']))) {
      workbenchAgentReviewMark(currentSide,a.index,'section',null,'modified');workbenchAgentReviewMark(proposedSide,b.index,'section',null,'modified');
    }
    workbenchAgentReviewObject(aDiagram.nodes,bDiagram.nodes,currentSide,proposedSide,a.index,b.index,'nodes');
    workbenchAgentReviewArray(aDiagram.edges,bDiagram.edges,currentSide,proposedSide,a.index,b.index,'edges',function(edge){
      return edge && edge.from!=null && edge.to!=null?'ends:'+String(edge.from)+'>'+String(edge.to)+'|'+String(edge.fromPort || '')+'>'+String(edge.toPort || ''):null;
    });
    workbenchAgentReviewArray(aDiagram.panels,bDiagram.panels,currentSide,proposedSide,a.index,b.index,'panels');
    workbenchAgentReviewArray(aDiagram.steps,bDiagram.steps,currentSide,proposedSide,a.index,b.index,'steps');
  });
  return {current:currentSide,proposed:proposedSide};
}
function workbenchAgentReviewDecorate(root,side,enabled){
  root.removeAttribute('data-agent-change');
  Array.prototype.forEach.call(root.querySelectorAll('[data-agent-change]'),function(node){node.removeAttribute('data-agent-change');});
  root.toggleAttribute('data-agent-highlights',!!enabled);if(!enabled || !side)return;
  if(side.document)root.setAttribute('data-agent-change',side.document);
  function decorate(selector,attribute,bucket){
    Array.prototype.forEach.call(root.querySelectorAll(selector),function(node){
      var section=node.closest && node.closest('[data-dv-section]'),record=section && side.sections[Number(section.getAttribute('data-dv-section'))];
      var key=node.getAttribute(attribute),status=record && (bucket==='status'?record.status:record[bucket][key]);
      if(status)node.setAttribute('data-agent-change',status);
    });
  }
  decorate('[data-dv-section]','data-dv-section','status');decorate('[data-dv-node]','data-dv-node','nodes');
  decorate('[data-dv-edge]','data-dv-edge','edges');decorate('[data-dv-panel]','data-dv-panel','panels');
  decorate('[data-dv-step]','data-dv-step','steps');decorate('[data-step-source]','data-step-source','steps');
}
function initWorkbenchAgentReview(opts){
  var doc=opts.document,life=createWorkbenchLifetime(),banner=doc.getElementById('agent-update-banner'),dialog=doc.getElementById('agent-update-dialog');
  var state=null,shown=null,ctl=null,canvas=null,observer=null,changes=null,viewing='proposed',rendered=false,highlights=true,immersive=false;
  function el(id){return doc.getElementById('agent-update-'+id);}
  function retire(){if(observer)observer.disconnect();observer=null;if(canvas)canvas.destroy();canvas=null;if(ctl)ctl.destroy();ctl=null;el('view').replaceChildren();rendered=false;}
  function displayState(){
    dialog.classList.toggle('agent-update-immersive',immersive);el('immersive').setAttribute('aria-pressed',String(immersive));
    el('immersive').textContent=immersive?'Standard preview':'Full preview';
    el('highlights').setAttribute('aria-pressed',String(highlights));el('highlights').textContent='Highlights: '+(highlights?'On':'Off');
  }
  function changeStatus(){
    var side=changes && changes[viewing],counts=side && side.counts || {added:0,removed:0,modified:0};
    el('change-added').hidden=viewing==='current';el('change-removed').hidden=viewing==='proposed';
    el('change-added').textContent=counts.added+' added';el('change-removed').textContent=counts.removed+' removed';el('change-modified').textContent=counts.modified+' modified';
    el('change-status').setAttribute('aria-label',(highlights?'Highlights on: ':'Highlights off: ')+(viewing==='current'?counts.removed+' removed, ':counts.added+' added, ')+counts.modified+' modified');
  }
  function decorate(){changeStatus();workbenchAgentReviewDecorate(el('view'),changes && changes[viewing],highlights);}
  function close(){if(dialog.open)dialog.close();retire();shown=null;changes=null;immersive=false;highlights=true;displayState();}
  function draw(){
    retire();if(!shown)return;
    el('commit').disabled=true;
    el('current').setAttribute('aria-pressed',String(viewing==='current'));el('proposed').setAttribute('aria-pressed',String(viewing==='proposed'));
    var source=viewing==='current'?shown.current:shown.source;
    el('source').value=source || '';
    el('ledger').textContent=(viewing==='current'?shown.currentLedger:shown.ledger) || 'No coverage ledger yet.';
    el('ledger-summary').textContent='Coverage ledger · '+(viewing==='current'?'Current state':shown.ledger!==shown.currentLedger?'Changed in this update':'Unchanged');
    if(!source){el('view').textContent='Resolve the issues above with your agent to get a complete, valid preview.';return;}
    try{
      // Resolve a fresh render copy; source, change highlights and commit keep
      // the authored declarations. A prepared review may have additional pinned
      // providers that are not published into the session until Commit.
      var raw=JSON.parse(source),resolved=opts.resolve?(shown.topologyContext?opts.resolve(raw,shown.topologyContext):opts.resolve(raw)):raw;
      var page=normalize(resolved),findings=validate(page);if(findings.errors.length)throw Error(findings.errors.join('\n'));
      ctl=renderPage(el('view'),page,page.skin,null,{autoplay:false});
      canvas=initViewerExploreCanvas(ctl,el('view'),{container:el('scroll')});rendered=true;decorate();
      var Observer=doc.defaultView && doc.defaultView.MutationObserver;
      if(Observer){observer=new Observer(function(records){if(records.some(function(record){return record.type==='childList';}))decorate();});observer.observe(el('view'),{childList:true,subtree:true});}
      el('commit').disabled=!shown.review.ok || viewing!=='proposed';
    }catch(ex){el('view').textContent='Could not render this preview: '+ex.message;changeStatus();}
  }
  function refresh(){
    var next=opts.snapshot();if(!next){close();return;}
    var changed=shown && shown.review.version!==next.review.version;shown=next;
    el('summary').textContent=next.review.summary;
    el('note').textContent=!next.review.ok?'Your current story is unchanged. Share this feedback so your agent can revise the update.':
      (changed?'The diagram changed, so this preview has been refreshed. Review it again. ':next.review.merged?'Your changes and the agent’s separate changes are combined below. ':'')+'Commit updates the spec and ledger in your diagram folder as one undoable change. A Git commit is a separate step in your agent.';
    el('issues').hidden=!!next.review.ok;el('feedback').value=workbenchAgentConflictFeedback(next.review);
    changes=null;
    try{var current=normalize(JSON.parse(next.current)),proposed=normalize(JSON.parse(next.source));if(current && proposed)changes=workbenchAgentReviewChanges(current,proposed);}catch(ex){}
    draw();
  }
  function open(){if(!state)return;if(!dialog.open)dialog.showModal();el('ledger-panel').open=false;viewing='proposed';highlights=true;immersive=false;displayState();refresh();el('close').focus();}
  function update(review){
    state=review;banner.hidden=!review;
    if(review){
      el('banner-title').textContent=review.ok?'Agent updates are ready':'Agent update needs attention';
      el('banner-summary').textContent=review.ok?(review.merged?'Includes your latest edits. ':'')+review.summary:'Conflicts or validation problems need a revision from your agent.';
      el('open').textContent=review.ok?'Preview Agent Updates':'Review conflicts';
    }
    if(dialog.open && !review){close();return;}
    if(dialog.open && (!shown || shown.review.version!==review.version))refresh();
  }
  life.listen(el('open'),'click',open);life.listen(el('close'),'click',close);
  life.listen(dialog,'cancel',function(event){event.preventDefault();close();});life.listen(dialog,'close',retire);
  life.listen(el('current'),'click',function(){viewing='current';draw();});life.listen(el('proposed'),'click',function(){viewing='proposed';draw();});
  life.listen(el('highlights'),'click',function(){highlights=!highlights;displayState();decorate();});
  life.listen(el('immersive'),'click',function(){immersive=!immersive;displayState();});
  life.listen(el('commit'),'click',async function(){
    if(!shown || !rendered || !shown.review.ok || viewing!=='proposed')return;
    var version=shown.review.version;close();await opts.accept(version);
    if(state)open();
  });
  life.listen(el('discard'),'click',async function(){if(!shown)return;var version=shown.review.version;close();await opts.reject(null,version);});
  life.listen(el('copy-feedback'),'click',async function(){
    if(!shown)return;var version=shown.review.version,text=el('feedback').value;
    try{await navigator.clipboard.writeText(text);if(shown && shown.review.version===version){close();await opts.reject(text,version);}}
    catch(ex){el('feedback').focus();el('feedback').select();el('note').textContent='Press ⌘C / Ctrl+C to copy the feedback. Use Return for revision to release this proposal when you are ready.';}
  });
  life.listen(el('return'),'click',async function(){if(!shown)return;var version=shown.review.version,text=el('feedback').value;close();await opts.reject(text,version);});
  life.own(close);return {update:update,open:open,destroy:life.destroy};
}
