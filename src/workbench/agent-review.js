/* Read-only proposed state, separate from the editor's document and history. */
function workbenchAgentConflictFeedback(review){
  var prefix=review.artifacts && review.artifacts.metadata==='.'?'':'.flowview-agent/';
  return ['Your proposed Flowview update could not be accepted. My current diagram has been preserved.',
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
function workbenchAgentReviewSide(){return {metadata:Object.create(null),counterparts:Object.create(null),document:null,sections:Object.create(null),counts:{added:0,removed:0,modified:0}};}
function workbenchAgentReviewDocument(side,status){
  if(side.document===status)return;if(side.document)side.counts[side.document]--;side.document=status;side.counts[status]++;
}
function workbenchAgentReviewSection(side,index){
  return side.sections[index] || (side.sections[index]={status:null,nodes:Object.create(null),edges:Object.create(null),panels:Object.create(null),steps:Object.create(null),paths:Object.create(null),layouts:Object.create(null),views:Object.create(null)});
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
function workbenchAgentReviewPair(a,b,ai,bi,kind,ak,bk){
  a.counterparts[JSON.stringify([ai,kind,String(ak)])]={section:bi,kind:kind,key:bk};
  b.counterparts[JSON.stringify([bi,kind,String(bk)])]={section:ai,kind:kind,key:ak};
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
    workbenchAgentReviewPair(currentSide,proposedSide,currentSection,proposedSection,kind,pair[0],pair[1]);
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
      workbenchAgentReviewPair(currentSide,proposedSide,currentSection,proposedSection,kind,key,key);
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
    workbenchAgentReviewPair(currentSide,proposedSide,a.index,b.index,'section',null,null);
    if(workbenchAgentReviewSignature(workbenchAgentReviewWithout(aSection,['diagram']))!==workbenchAgentReviewSignature(workbenchAgentReviewWithout(bSection,['diagram'])) ||
       workbenchAgentReviewSignature(workbenchAgentReviewWithout(aSection.diagram,['nodes','edges','panels','steps','paths','layouts']))!==workbenchAgentReviewSignature(workbenchAgentReviewWithout(bSection.diagram,['nodes','edges','panels','steps','paths','layouts']))) {
      workbenchAgentReviewMark(currentSide,a.index,'section',null,'modified');workbenchAgentReviewMark(proposedSide,b.index,'section',null,'modified');
    }
    workbenchAgentReviewObject(aDiagram.nodes,bDiagram.nodes,currentSide,proposedSide,a.index,b.index,'nodes');
    workbenchAgentReviewArray(aDiagram.edges,bDiagram.edges,currentSide,proposedSide,a.index,b.index,'edges',function(edge){
      return edge && edge.from!=null && edge.to!=null?'ends:'+String(edge.from)+'>'+String(edge.to)+'|'+String(edge.fromPort || '')+'>'+String(edge.toPort || ''):null;
    });
    workbenchAgentReviewArray(aDiagram.panels,bDiagram.panels,currentSide,proposedSide,a.index,b.index,'panels');
    workbenchAgentReviewArray(aDiagram.steps,bDiagram.steps,currentSide,proposedSide,a.index,b.index,'steps');
    ['paths','layouts'].forEach(function(kind){workbenchAgentReviewArray(aDiagram[kind],bDiagram[kind],currentSide,proposedSide,a.index,b.index,kind);});
  });
  var ownersA=tabViewOwners(currentPage),ownersB=tabViewOwners(proposedPage),usedOwners=new Set();
  ownersA.forEach(function(owner){
    var match=owner.records.map(function(record){return currentSide.counterparts[JSON.stringify([record.number-1,'section','null'])];}).find(Boolean);
    var other=match && ownersB.find(function(candidate){return candidate.records.some(function(record){return record.number===match.section+1;});});
    if(other && !usedOwners.has(other)){
      usedOwners.add(other);
      if(owner.tabBlock){
        var before=workbenchAgentReviewWithout(owner.source,['sections','views']),after=workbenchAgentReviewWithout(other.source,['sections','views']);
        var fields=Object.keys(Object.assign({},before,after)).filter(function(key){return workbenchAgentReviewSignature(before[key])!==workbenchAgentReviewSignature(after[key]);});
        if(fields.length){
          var ai=owner.records[0].number-1,matched=currentSide.counterparts[JSON.stringify([ai,'section','null'])],bi=matched?matched.section:other.records[0].number-1;
          workbenchAgentReviewMark(currentSide,ai,'section',null,'modified');workbenchAgentReviewMark(proposedSide,bi,'section',null,'modified');
          currentSide.metadata[ai]=proposedSide.metadata[bi]='Tab settings: '+fields.join(', ');
        }
      }
      workbenchAgentReviewArray(owner.source.views,other.source.views,currentSide,proposedSide,owner.records[0].number-1,other.records[0].number-1,'views');
    }
  });
  return {current:currentSide,proposed:proposedSide};
}
/* The list is a projection of the highlight comparison, not another diff.
   Counterparts retain the exact matched registry entries across reordering. */
function workbenchAgentReviewEntries(changes,pages,ledgerChanged){
  var entries=[],records={current:sectionRecords(pages.current),proposed:sectionRecords(pages.proposed)};
  function label(side,target){
    if(target.kind==='document'){var a=workbenchAgentReviewWithout(pages.current,['blocks','sections']),b=workbenchAgentReviewWithout(pages.proposed,['blocks','sections']);return 'Document metadata · '+Object.keys(Object.assign({},a,b)).filter(function(key){return workbenchAgentReviewSignature(a[key])!==workbenchAgentReviewSignature(b[key]);}).join(', ');}
    var record=records[side][target.section],sec=record.section,d=sec.diagram || {},kind=target.kind,value;
    var location=[record.tabLabel,sec.heading || sec.id || 'Section '+(target.section+1)].filter(Boolean).join(' / ');
    if(kind==='section'){
      var other=changes[side].counterparts[JSON.stringify([target.section,'section','null'])],peer=other && records[side==='current'?'proposed':'current'][other.section].section;
      if(!peer)return location+' · whole section';
      var fields=Object.keys(Object.assign({},sec,peer)).filter(function(key){return key!=='diagram' && workbenchAgentReviewSignature(sec[key])!==workbenchAgentReviewSignature(peer[key]);});
      var peerDiagram=peer.diagram || {};
      fields=fields.concat(Object.keys(Object.assign({},d,peerDiagram)).filter(function(key){return ['nodes','edges','panels','steps','paths','layouts'].indexOf(key)<0 && workbenchAgentReviewSignature(d[key])!==workbenchAgentReviewSignature(peerDiagram[key]);}));
      return location+' · '+([fields.length?'section settings: '+fields.join(', '):'',changes[side].metadata[target.section]].filter(Boolean).join(' · ') || 'diagram content');
    }
    if(kind==='views'){
      var owner=tabViewOwners(pages[side]).find(function(o){return o.records.some(function(r){return r.number===target.section+1;});});
      value=owner && (owner.source.views || [])[target.key];
    }else value=(d[kind] || {})[target.key];
    var name=value && (value.title || value.name || value.label || value.text || value.id);
    if(!name && kind==='edges' && value)name=value.from+' → '+value.to;
    var type={nodes:'Node',edges:'Connection',panels:'Panel',steps:'Step',paths:'Path',layouts:'Layout',views:'View'}[kind];
    return location+' · '+type+' '+String(name || target.key).slice(0,160);
  }
  ['current','proposed'].forEach(function(side){
    var data=changes[side];
    function add(target,status){
      var counterpart=target.kind==='document'?{kind:'document'}:data.counterparts[JSON.stringify([target.section,target.kind,String(target.key)])];
      if(side==='proposed' && status==='modified' && counterpart)return;
      var entry={status:status,label:label(side,target)};entry[side]=target;
      if(counterpart)entry[side==='current'?'proposed':'current']=counterpart;
      entries.push(entry);
    }
    if(data.document)add({kind:'document'},data.document);
    Object.keys(data.sections).forEach(function(index){
      var section=data.sections[index];if(section.status)add({section:Number(index),kind:'section',key:null},section.status);
      ['nodes','edges','panels','steps','paths','layouts','views'].forEach(function(kind){
        Object.keys(section[kind]).forEach(function(key){add({section:Number(index),kind:kind,key:key},section[kind][key]);});
      });
    });
  });
  if(ledgerChanged)entries.push({status:'modified',label:'Coverage ledger · evidence and decisions',current:{kind:'ledger'},proposed:{kind:'ledger'}});
  return entries;
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
  var state=null,shown=null,ctl=null,canvas=null,observer=null,changes=null,viewing='proposed',rendered=false,highlights=true,details=false,reviewedVersion=null,renderedPage=null,entries=[],selected=-1,listOpen=false;
  function el(id){return doc.getElementById('agent-update-'+id);}
  function retire(){if(observer)observer.disconnect();observer=null;if(canvas)canvas.destroy();canvas=null;if(ctl)ctl.destroy();ctl=null;el('view').replaceChildren();rendered=false;renderedPage=null;}
  function displayState(){
    el('changes-panel').hidden=!listOpen;el('changes').setAttribute('aria-expanded',String(listOpen));
    el('details-panel').hidden=!details;el('details').setAttribute('aria-expanded',String(details));
    el('highlights').setAttribute('aria-pressed',String(highlights));el('highlights').textContent='Highlights: '+(highlights?'On':'Off');
  }
  function showDetails(target){
    details=true;listOpen=false;displayState();
    var field=el(target),disclosure=field.closest && field.closest('details');if(disclosure)disclosure.open=true;
    field.focus();
  }
  function updateCommit(){el('commit').disabled=!shown || !rendered || !shown.review.ok || viewing!=='proposed' || reviewedVersion!==shown.review.version;}
  function changeStatus(){
    var side=changes && changes[viewing],counts=side && side.counts || {added:0,removed:0,modified:0};
    el('change-added').hidden=viewing==='current';el('change-removed').hidden=viewing==='proposed';
    el('change-added').textContent=counts.added+' added';el('change-removed').textContent=counts.removed+' removed';el('change-modified').textContent=counts.modified+' modified';
    el('change-status').setAttribute('aria-label',(highlights?'Highlights on: ':'Highlights off: ')+(viewing==='current'?counts.removed+' removed, ':counts.added+' added, ')+counts.modified+' modified');
  }
  function decorate(){changeStatus();workbenchAgentReviewDecorate(el('view'),changes && changes[viewing],highlights);}
  function close(){if(dialog.open)dialog.close();retire();shown=null;changes=null;details=false;highlights=true;reviewedVersion=null;entries=[];selected=-1;listOpen=false;displayState();}
  function draw(keepContext){
    var saved=keepContext && ctl && renderedPage?workbenchReaderPreviewSnapshot(renderedPage,ctl):null;
    var scroll=saved?{x:el('scroll').scrollLeft,y:el('scroll').scrollTop}:null;
    var anchor=saved && saved.target && (ctl.sections || []).find(function(rec){return rec.number===saved.target.section;});
    if(anchor && anchor.sectionEl && !(anchor.viewport && anchor.viewport.isExplore()))scroll.anchor=anchor.sectionEl.getBoundingClientRect().top-el('scroll').getBoundingClientRect().top;
    retire();if(!shown)return;
    el('commit').disabled=true;
    el('current').setAttribute('aria-pressed',String(viewing==='current'));el('proposed').setAttribute('aria-pressed',String(viewing==='proposed'));
    var source=viewing==='current'?shown.current:shown.source;
    el('source').value=source || '';
    el('ledger').textContent=(viewing==='current'?shown.currentLedger:shown.ledger) || 'No coverage ledger yet.';
    el('ledger-summary').textContent='Coverage ledger · '+(viewing==='current'?'Current state':shown.ledger!==shown.currentLedger?'Changed in this update':'Unchanged');
    if(!source){el('view').textContent='Resolve the issues above with your agent to get a complete, valid preview.';return;}
    try{
      // Resolve a fresh render copy; source, change highlights and acceptance keep
      // the authored declarations. A prepared review may have additional pinned
      // providers that are not published into the session until acceptance.
      var raw=JSON.parse(source),resolved=opts.resolve?(shown.topologyContext?opts.resolve(raw,shown.topologyContext):opts.resolve(raw)):raw;
      var page=normalize(resolved),findings=validate(page);if(findings.errors.length)throw Error(findings.errors.join('\n'));
      ctl=renderPage(el('view'),page,page.skin,null,{autoplay:false});renderedPage=page;
      var restored=saved?restoreWorkbenchReaderPreviewSnapshot(page,ctl,saved):null;
      // Review opens on the changed diagram rather than spending its limited
      // comparison space on the optional document outline.
      canvas=initViewerExploreCanvas(ctl,el('view'),{container:el('scroll'),initialContentsOpen:false,presentation:{panelsHiddenWhenGraphVisible:true,overlayScale:.5},forceFit:true,refitOnResize:!saved,preserveCamera:function(rec,definition){var prior=restored && restored.matches.get(rec.number-1);return !!(prior && prior.reader && prior.reader.memories && prior.reader.memories[definition.id]);},fitInsets:{left:24,right:24,top:20,bottom:24}});
      if(restored){restoreWorkbenchReaderCameras(ctl,restored);el('scroll').scrollLeft=scroll.x;el('scroll').scrollTop=scroll.y;
        if(scroll.anchor!=null && restored.target)el('scroll').scrollTop+=restored.target.sectionEl.getBoundingClientRect().top-el('scroll').getBoundingClientRect().top-scroll.anchor;
        if(restored.missing)el('position').textContent='This section is unavailable in '+viewing+'. Showing the document’s opening section.';
      }
      rendered=true;decorate();
      var Observer=doc.defaultView && doc.defaultView.MutationObserver;
      if(Observer){observer=new Observer(function(records){if(records.some(function(record){return record.type==='childList';}))decorate();});observer.observe(el('view'),{childList:true,subtree:true});}
      updateCommit();return restored;
    }catch(ex){el('view').textContent='Could not render this preview: '+ex.message;changeStatus();}
  }
  function navigationStatus(message){
    el('previous').disabled=!entries.length;el('next').disabled=!entries.length;
    el('changes').textContent='Changes ('+entries.length+')';
    el('position').textContent=message || (selected<0?'Choose a change to inspect.':(selected+1)+' of '+entries.length+' · '+(viewing==='current'?'Current':'Proposed')+' · '+entries[selected].status+' · '+entries[selected].label);
    el('position').title=el('position').textContent;
    Array.prototype.forEach.call(el('change-list').querySelectorAll('[data-change-index]'),function(button){button.setAttribute('aria-current',String(Number(button.getAttribute('data-change-index'))===selected));});
  }
  function populate(){
    el('change-list').replaceChildren();
    entries.forEach(function(entry,index){var item=doc.createElement('li'),button=doc.createElement('button');button.type='button';button.className='bbtn';button.setAttribute('data-change-index',String(index));button.textContent=entry.status+' · '+entry.label;item.appendChild(button);el('change-list').appendChild(item);});
    navigationStatus(entries.length?null:'No document or ledger changes.');
  }
  function go(index){
    if(!shown || !entries.length)return;
    selected=(index+entries.length)%entries.length;var entry=entries[selected];
    if(!entry[viewing]){viewing=entry.current?'current':'proposed';draw(true);}
    var target=entry[viewing];navigationStatus();
    if(!ctl || !target)return;
    if(target.kind==='ledger' || target.kind==='document'){
      showDetails(target.kind==='ledger'?'ledger':'source');
      navigationStatus((selected+1)+' of '+entries.length+' · '+entry.status+' · '+entry.label+' · Shown in Details; no rendered object.');return;
    }
    var rec=ctl.sections.find(function(r){return r.number===target.section+1;}),record=sectionRecords(renderedPage)[target.section];
    if(!rec || !record)return;
    var d=record.section.diagram || {},value=(d[target.kind] || {})[target.key],visible=true;
    if(rec.tabBlock)ctl.tabBlocks[rec.tabBlock-1].select(rec.tab,false);
    if(ctl.details)ctl.details.close(true);
    if(target.kind==='views' && ctl.views){
      var owner=ctl.views.owner(rec),definition=owner && owner.source.views[target.key];
      visible=!!(definition && ctl.views.select(rec,definition.id,undefined,true));
      if(visible)rec=owner.selected || rec;
    }else if(ctl.views)visible=ctl.views.ensure(rec,undefined,true);
    if(!visible){showDetails('source');navigationStatus('Section not included in a View · Inspect source in Details · '+viewing+' · '+entry.label);return;}
    if(target.kind==='layouts' && value && rec.presentation){
      if(ctl.views && !ctl.views.ensure(rec,value.id,true))rec.presentation.setView(value.id);
    }
    if(target.kind==='steps' && rec.stepper)visible=rec.stepper.jumpSource(Number(target.key)) && visible;
    if(target.kind==='paths' && rec.stepper && value){
      var route=diagramPathList(d).find(function(path){return path.id===value.id;});
      visible=!!(route && rec.stepper.jumpSource(route.indices[0],route.id)) && visible;
    }
    ctl.activeTarget={kind:'diagram',section:rec.number};if(ctl.onChange)ctl.onChange();
    var attrs={nodes:'data-dv-node',edges:'data-dv-edge',panels:'data-dv-panel',steps:'data-step-source'},attr=attrs[target.kind],object;
    if(attr)object=Array.prototype.find.call(rec.sectionEl.querySelectorAll('['+attr+']'),function(node){return node.getAttribute(attr)===String(target.key) && node.getClientRects().length;});
    if(object)object.scrollIntoView({block:'nearest',inline:'nearest'});
    else if(!rec.viewport || !rec.viewport.isExplore())rec.sectionEl.scrollIntoView({block:'start'});
    if(!visible || attr && !object || target.kind==='section')navigationStatus((selected+1)+' of '+entries.length+' · '+entry.status+' · '+entry.label+' · Showing the containing section; inspect Details for non-rendered content.');
    decorate();
  }
  function switchSide(side){
    if(viewing===side)return;viewing=side;var restored=draw(true);navigationStatus();
    if(restored && restored.fallback)navigationStatus(restored.fallback+' · '+side);
    if(selected>=0 && !entries[selected][side])navigationStatus('This '+entries[selected].status+' item has no counterpart in '+side+'. Use '+(side==='current'?'Proposed':'Current')+' to inspect it.');
  }
  function refresh(){
    var next=opts.snapshot();if(!next){close();return;}
    var first=!shown,changed=shown && shown.review.version!==next.review.version;shown=next;
    if(first)reviewedVersion=next.review.version;
    if(changed)reviewedVersion=null;
    el('summary').textContent=next.review.summary;
    el('note').hidden=!!next.review.ok && !changed && !next.review.merged;
    el('review-refresh').hidden=!changed;
    el('note-text').textContent=!next.review.ok?'Your current story is unchanged. Share this feedback so your agent can revise the update.':
      changed?'The proposal changed while this preview was open. Review the refreshed version before accepting it.':
      'Your changes and the agent’s separate changes are combined in this preview.';
    el('issues').hidden=!!next.review.ok;el('feedback').value=workbenchAgentConflictFeedback(next.review);
    changes=null;entries=[];selected=-1;
    try{var current=normalize(JSON.parse(next.current)),proposed=normalize(JSON.parse(next.source));if(current && proposed){changes=workbenchAgentReviewChanges(current,proposed);entries=workbenchAgentReviewEntries(changes,{current:current,proposed:proposed},next.ledger!==next.currentLedger);}}catch(ex){}
    populate();draw();
  }
  function open(){if(!state)return;if(!dialog.open)dialog.showModal();viewing='proposed';highlights=true;details=false;reviewedVersion=state.version;displayState();refresh();el('close').focus();}
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
  life.listen(dialog,'cancel',function(event){event.preventDefault();if(listOpen){listOpen=false;displayState();el('changes').focus();}else if(details){details=false;displayState();el('details').focus();}else close();});life.listen(dialog,'close',retire);
  life.listen(el('current'),'click',function(){switchSide('current');});life.listen(el('proposed'),'click',function(){switchSide('proposed');});
  life.listen(el('highlights'),'click',function(){highlights=!highlights;displayState();decorate();});
  life.listen(el('details'),'click',function(){details=!details;listOpen=false;displayState();if(details)el('details-close').focus();});
  life.listen(el('changes'),'click',function(){listOpen=!listOpen;details=false;displayState();navigationStatus();});
  life.listen(el('changes-close'),'click',function(){listOpen=false;displayState();el('changes').focus();});
  life.listen(el('previous'),'click',function(){go(selected<0?entries.length-1:selected-1);});
  life.listen(el('next'),'click',function(){go(selected+1);});
  life.listen(el('change-list'),'click',function(event){var button=event.target.closest('[data-change-index]');if(button && el('change-list').contains(button))go(Number(button.getAttribute('data-change-index')));});
  life.listen(el('details-close'),'click',function(){details=false;displayState();navigationStatus();el('details').focus();});
  life.listen(el('review-refresh'),'click',function(){if(!shown)return;reviewedVersion=shown.review.version;el('review-refresh').hidden=true;el('note-text').textContent='You are reviewing the refreshed proposal.';updateCommit();el('view').focus();});
  life.listen(el('commit'),'click',async function(){
    var latest=opts.snapshot();
    if(!shown || !latest || latest.review.version!==shown.review.version || reviewedVersion!==shown.review.version){refresh();return;}
    if(!rendered || !shown.review.ok || viewing!=='proposed')return;
    var version=shown.review.version;close();await opts.accept(version);
    if(state)open();
  });
  life.listen(el('discard'),'click',async function(){if(!shown)return;var version=shown.review.version;close();await opts.reject(null,version);});
  life.listen(el('copy-feedback'),'click',async function(){
    if(!shown)return;var version=shown.review.version,text=el('feedback').value;
    try{await navigator.clipboard.writeText(text);if(shown && shown.review.version===version){close();await opts.reject(text,version);}}
    catch(ex){el('feedback').focus();el('feedback').select();el('note').hidden=false;el('review-refresh').hidden=true;el('note-text').textContent='Press ⌘C / Ctrl+C to copy the feedback. Use Return for revision to release this proposal when you are ready.';}
  });
  life.listen(el('return'),'click',async function(){if(!shown)return;var version=shown.review.version,text=el('feedback').value;close();await opts.reject(text,version);});
  life.own(close);return {update:update,open:open,destroy:life.destroy};
}
