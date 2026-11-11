/* Document search indexes rendered, resolved content. It never writes authored
   source, and page identity includes the owner, View and section together. */
// Lowercasing can expand a code point (İ → i + combining dot). Keep a
// UTF-16 map so matching, snippets and DOM ranges address the original text.
// Fold both sigma forms together, independent of their position in a word.
function documentSearchFold(text){
  var folded='',starts=[],ends=[],offset=0;
  Array.from(text).forEach(function(character){var lower=character.toLowerCase().replace(/ς/g,'σ');for(var i=0;i<lower.length;i++){starts.push(offset);ends.push(offset+character.length);}folded+=lower;offset+=character.length;});
  return {text:folded,starts:starts,ends:ends};
}
function documentSearchSpans(text,query){
  var needle=documentSearchFold(String(query || '').trim()).text;if(!needle)return [];
  var folded=documentSearchFold(text),spans=[],at=0;
  while((at=folded.text.indexOf(needle,at))>=0){var start=folded.starts[at],end=folded.ends[at+needle.length-1],last=spans[spans.length-1];if(!last || last.start!==start || last.end!==end)spans.push({start:start,end:end});at+=needle.length;}
  return spans;
}
function documentSearchMatches(entries,query){
  return entries.filter(function(entry){return documentSearchSpans(entry.text,query).length>0;});
}
function documentSearchSnippet(text,query){
  var match=documentSearchSpans(text,query)[0] || {start:0,end:0},start=Math.max(0,match.start-55),end=Math.min(text.length,Math.max(match.end+80,start+140));
  // A snippet boundary must never bisect a supplementary Unicode character.
  if(start>0 && /[\uDC00-\uDFFF]/.test(text[start]))start--;
  if(end<text.length && /[\uDC00-\uDFFF]/.test(text[end]))end++;
  return (start?'…':'')+text.slice(start,end)+(end<text.length?'…':'');
}
function documentSearchIndex(pages,plain,visibleNodes){
  var entries=[];
  pages.forEach(function(page,pageIndex){
    var record=page.owner.records.find(function(record){return record.runtime===page.rec;}),section=record.section,diagram=section.diagram || {};
    var location='Page '+(pageIndex+1)+' · '+(page.owner.source.label || page.owner.source.title || 'Document')+' / '+page.definition.name+' / '+(section.heading || 'Section '+page.rec.number);
    function add(kind,text,extra){text=extra && extra.literal?(typeof text==='string'?text:''):plain(text);if(text.trim())entries.push(Object.assign({page:page,kind:kind,text:text,location:location},extra));}
    add('heading',section.heading,{literal:true});
    add('location',[page.owner.source.label,!page.definition.legacy && page.definition.name].filter(Boolean).join(' / '),{literal:true});
    page.rec.sectionEl.querySelectorAll('.sec-text,.sec-bullets > li').forEach(function(prose,i){add('prose',prose.textContent,{literal:true,proseIndex:i});});
    var eligible=visibleNodes?visibleNodes(page,record):null;
    Object.keys(diagram.nodes || {}).forEach(function(id){var node=diagram.nodes[id];if(node.hidden===true || eligible && !eligible.has(id))return;add('node',[node.title,node.sub,node.text,node.alt].filter(function(text){return typeof text==='string';}).join('\n'),{node:id,literal:true});});
    (diagram.steps || []).forEach(function(step,index){add('step',step.text,{sourceIndex:index});});
  });
  return entries;
}
var documentSearchSequence=0;
function createDocumentSearch(ctl,nav,top,actions,pages,choose,onQueryChange){
  var doc=ctl.view.ownerDocument,view=ctl.view,win=doc.defaultView,retired=false,frame=0,revealFrame=0,query='',hits=[],active=-1,mode='highlights',opened=false;
  var name='flowview-search-'+(++documentSearchSequence),registry=win.CSS && win.CSS.highlights,highlight=registry && win.Highlight?new win.Highlight():null;
  function el(tag,cls,text,parent){var node=doc.createElement(tag);node.className=cls;if(text)node.textContent=text;if(parent)parent.appendChild(node);return node;}
  function button(label,text,parent,fn){var node=el('button','reader-button',text,parent);node.type='button';node.setAttribute('aria-label',label);node.title=label;node.addEventListener('click',fn);return node;}
  var launch=el('span','document-search-launch');actions.prepend(launch);
  var toggle=button('Search document','',launch,function(){setOpen(!opened);});toggle.innerHTML='<svg aria-hidden="true" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg>';toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-keyshortcuts','Control+Shift+F Meta+Shift+F');toggle.title='Search document (Ctrl/Cmd+Shift+F)';
  var panel=el('section','document-search',null,nav);panel.hidden=true;panel.setAttribute('aria-label','Search document');
  var heading=el('div','document-search-heading',null,panel);el('strong','','Search document',heading);button('Close document search','×',heading,function(){setOpen(false);toggle.focus();});
  var field=el('div','document-search-field',null,panel),input=el('input','document-search-input',null,field);input.type='search';input.placeholder='Find words in this document';input.setAttribute('aria-label','Search document text');input.autocomplete='off';input.spellcheck=false;
  button('Clear document search','Clear',field,function(){input.value='';search();input.focus();});
  var controls=el('div','document-search-controls',null,panel),modes=el('div','document-search-modes',null,controls);modes.setAttribute('role','group');modes.setAttribute('aria-label','Search display');
  var highlightMode=button('Highlights','Highlights',modes,function(){setMode('highlights');}),resultMode=button('Results','Results',modes,function(){setMode('results');});
  var previous=button('Previous search result','↑',controls,function(){next(-1);}),following=button('Next search result','↓',controls,function(){next(1);});
  var status=el('p','document-search-status',null,panel);status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  var hint=el('p','document-search-hint','Matching pages, nodes and steps are outlined. Choose a page or step to explore. Enter goes to the next result; Shift+Enter goes back.',panel);
  var results=el('ol','document-search-results',null,panel);results.setAttribute('aria-label','Search results');
  var style=el('style','document-search-style',null,view);
  if(highlight){while(registry.has(name))name='flowview-search-'+(++documentSearchSequence);registry.set(name,highlight);style.textContent='::highlight('+name+'){background-color:color-mix(in srgb,var(--dtext) 25%,transparent);color:var(--dink);text-decoration:underline;}';}
  function plain(text){var scratch=doc.createElement('div');scratch.innerHTML=proseMarkup(typeof text==='string'?text:'');return scratch.textContent;}
  panel.id=name;toggle.setAttribute('aria-controls',name);
  function visibleNodes(page,record){
    var section=page.rec.sectionEl,member=page.definition.members.find(function(member){return member.record===record;}),grid=section.querySelector('.section-layout-grid'),target=grid?grid.getAttribute('data-layout-target'):'default';
    var items=sectionLayoutItems(record.section.diagram || {},target,member && member.layout),nodes=new Set();
    if(items && items.some(function(item){return sectionLayoutKey(item)==='diagram' && item.hidden;}))return nodes;
    // Use rendered nodes as well as resolved source: rows/layout may omit a node.
    section.querySelectorAll('.node[data-dv-node]:not([data-dv-hidden="true"])').forEach(function(node){nodes.add(node.getAttribute('data-dv-node'));});
    return nodes;
  }
  var pageList=pages(),index=documentSearchIndex(pageList,plain,visibleNodes);
  if(ctl.page.title && pageList.length)index.unshift({page:pageList[0],kind:'document',text:ctl.page.title,location:'Document title'});
  // Keep editable DOM intact: CSS Highlight ranges cross emphasis/link/code
  // boundaries without replacing text nodes or disturbing editor selection.
  function ranges(host){
    if(!highlight || !query || host.closest('[contenteditable]:not([contenteditable="false"])'))return;
    var walker=doc.createTreeWalker(host,win.NodeFilter.SHOW_TEXT),nodes=[],text='',node;
    while((node=walker.nextNode())){if(node.parentElement.closest('button,summary,[contenteditable]:not([contenteditable="false"]),.srcchip,title'))continue;nodes.push({node:node,start:text.length});text+=node.data;}
    documentSearchSpans(text,query).forEach(function(span){var at=span.start,end=span.end,first=nodes.find(function(n){return n.start+n.node.length>at;}),last=nodes.find(function(n){return n.start+n.node.length>=end;});if(first && last){var range=doc.createRange();range.setStart(first.node,at-first.start);range.setEnd(last.node,end-last.start);highlight.add(range);}});
  }
  function clearMarks(){view.querySelectorAll('.document-search-match').forEach(function(node){node.classList.remove('document-search-match');if(node.hasAttribute('data-search-matches')){node.removeAttribute('data-search-matches');if(node._documentSearchDescription===null)node.removeAttribute('aria-description');else node.setAttribute('aria-description',node._documentSearchDescription);delete node._documentSearchDescription;}});}
  function paint(){
    frame=0;if(retired)return;if(highlight)highlight.clear();
    clearMarks();
    if(!query)return;
    nav.querySelectorAll('[data-search-location]').forEach(function(node){var loc=node._documentSearchLocation,count=hits.filter(function(hit){return hit.page.owner===loc.owner && (!loc.rec || hit.page.rec===loc.rec) && (!loc.definition || hit.page.definition===loc.definition);}).length;if(count){node.classList.add('document-search-match');node.setAttribute('data-search-matches',String(count));node._documentSearchDescription=node.getAttribute('aria-description');node.setAttribute('aria-description',(node._documentSearchDescription?node._documentSearchDescription+' ':'')+count+' search results.');}});
    var seen=new Set();hits.forEach(function(hit){var rec=hit.page.rec,key=rec.number+':'+hit.kind+':'+(hit.node || hit.sourceIndex || '');if(seen.has(key))return;seen.add(key);
      if(hit.kind==='node')rec.sectionEl.querySelectorAll('[data-dv-node]').forEach(function(node){if(node.getAttribute('data-dv-node')===hit.node)node.classList.add('document-search-match');});
      if(hit.kind==='step')rec.sectionEl.querySelectorAll('[data-dv-step],[data-step-source]').forEach(function(node){if(Number(node.getAttribute('data-dv-step') ?? node.getAttribute('data-step-source'))===hit.sourceIndex)node.classList.add('document-search-match');});
    });
    view.querySelectorAll('.doc-title').forEach(ranges);
    ctl.sections.forEach(function(rec){rec.sectionEl.querySelectorAll('.sec-h,.sec-prose,.step-text,.node text').forEach(ranges);});
  }
  function schedule(){if(!retired && query && !frame)frame=requestAnimationFrame(paint);}
  function position(){if(!opened)return;var rect=nav.getBoundingClientRect();panel.style.top=rect.bottom+8+'px';panel.style.left=Math.max(rect.left+8,rect.right-400)+'px';panel.style.maxHeight=Math.max(160,win.innerHeight-rect.bottom-24)+'px';}
  function setMode(value){mode=value;highlightMode.setAttribute('aria-pressed',String(value==='highlights'));resultMode.setAttribute('aria-pressed',String(value==='results'));results.hidden=value!=='results';hint.hidden=value!=='highlights';position();}
  function setOpen(value){opened=value;panel.hidden=!value;toggle.setAttribute('aria-expanded',String(value));if(value){view.dispatchEvent(new CustomEvent('reader-window-open',{detail:{window:panel}}));position();input.focus();}else{input.value='';search();}}
  // One reader window at a time: another window opening (Text view) closes Search.
  function otherWindow(ev){if(opened && ev.detail && ev.detail.window!==panel)setOpen(false);}view.addEventListener('reader-window-open',otherWindow);
  function renderResults(){results.replaceChildren();hits.forEach(function(hit,i){var row=el('li','',null,results),link=button(hit.location+' · '+(hit.kind==='step'?'Step '+(hit.sourceIndex+1):hit.kind),null,row,function(){activate(i,true);});link.classList.add('document-search-result');el('span','document-search-location',hit.location,link);el('strong','document-search-kind',hit.kind==='step'?'Step '+(hit.sourceIndex+1):hit.kind==='node'?'Node':hit.kind==='heading' || hit.kind==='location'?'Page title':hit.kind==='document'?'Document title':'Page text',link);var snippet=el('span','document-search-snippet',null,link),text=documentSearchSnippet(hit.text,query),match=documentSearchSpans(text,query)[0];if(match){snippet.append(doc.createTextNode(text.slice(0,match.start)));el('mark','',text.slice(match.start,match.end),snippet);snippet.append(doc.createTextNode(text.slice(match.end)));}else snippet.textContent=text;});}
  function clearFocus(){view.querySelectorAll('[data-search-focus]').forEach(function(node){node.removeAttribute('tabindex');node.removeAttribute('data-search-focus');});}
  function search(){cancelAnimationFrame(revealFrame);revealFrame=0;clearFocus();query=input.value.trim();hits=documentSearchMatches(index,query);active=-1;status.textContent=query?(hits.length?hits.length+' '+(hits.length===1?'result':'results')+' on '+new Set(hits.map(function(hit){return hit.page;})).size+' '+(new Set(hits.map(function(hit){return hit.page;})).size===1?'page':'pages'):'No matches. Try a different phrase.'):'Search page text, nodes and steps.';previous.disabled=following.disabled=!hits.length;renderResults();if(onQueryChange)onQueryChange();paint();position();}
  function destination(hit){var section=hit.page.rec.sectionEl;if(hit.kind==='document')return view.querySelector('.doc-title');if(hit.kind==='prose')return section.querySelectorAll('.sec-text,.sec-bullets > li')[hit.proseIndex];if(hit.kind==='node')return Array.from(section.querySelectorAll('[data-dv-node]')).find(function(node){return node.getAttribute('data-dv-node')===hit.node;});return section.querySelector(hit.kind==='step'?'.step-text':hit.kind==='prose'?'.sec-prose':'.sec-h') || section;}
  function activate(i,focus){if(!hits.length || retired)return;active=(i+hits.length)%hits.length;var hit=hits[active],rec=hit.page.rec;choose(hit.page.owner,hit.page.definition,rec,true);if(hit.kind==='step' && rec.stepper)rec.stepper.jumpSource(hit.sourceIndex);if(hit.kind==='prose' && rec.prose)setProseCollapsed(rec.prose,false,false,win);schedule();cancelAnimationFrame(revealFrame);revealFrame=requestAnimationFrame(function(){revealFrame=0;if(retired)return;var node=destination(hit);if(node){node.scrollIntoView({block:'center',inline:'center',behavior:'instant'});if(focus){if(!node.hasAttribute('tabindex')){node.setAttribute('tabindex','-1');node.setAttribute('data-search-focus','');}node.focus({preventScroll:true});}}status.textContent='Result '+(active+1)+' of '+hits.length+' · '+hit.location;});}
  function next(delta){activate(active<0?(delta<0?hits.length-1:0):active+delta,false);}
  function keydown(ev){if(ev.defaultPrevented)return;if(ev.key==='Escape' && opened){ev.preventDefault();ev.stopPropagation();setOpen(false);toggle.focus();}else if(ev.target===input && ev.key==='Enter'){ev.preventDefault();ev.stopPropagation();next(ev.shiftKey?-1:1);}else if((ev.ctrlKey || ev.metaKey) && ev.shiftKey && ev.key.toLowerCase()==='f' && !ev.target.closest('input,textarea,[contenteditable]:not([contenteditable="false"])')){ev.preventDefault();ev.stopPropagation();setOpen(true);}}
  input.addEventListener('input',search);view.addEventListener('keydown',keydown,true);
  var events=['dv:stepchange','dv:pathrender','dv:pathchange','navigation-mounted','tab-view-change','diagram-view-change'];events.forEach(function(type){view.addEventListener(type,schedule);});
  var observer=new MutationObserver(function(changes){if(changes.some(function(change){var node=change.target.nodeType===3?change.target.parentElement:change.target;return node.closest && node.closest('.reader-rail-list,.reader-contents-tree,.reader-view-strip,.sec-prose,.sec-h,.step-text,.node,.doc-title');}))schedule();});observer.observe(view,{subtree:true,childList:true,characterData:true});
  window.addEventListener('resize',position);window.addEventListener('scroll',position,true);setMode(mode);search();
  return {hasQuery:function(){return !!query;},refresh:schedule,mark:function(node,owner,rec,definition){node._documentSearchLocation={owner:owner,rec:rec,definition:definition};node.setAttribute('data-search-location','');},destroy:function(){retired=true;observer.disconnect();cancelAnimationFrame(frame);cancelAnimationFrame(revealFrame);if(highlight)registry.delete(name);events.forEach(function(type){view.removeEventListener(type,schedule);});view.removeEventListener('keydown',keydown,true);view.removeEventListener('reader-window-open',otherWindow);window.removeEventListener('resize',position);window.removeEventListener('scroll',position,true);clearMarks();clearFocus();panel.remove();launch.remove();style.remove();}};
}
