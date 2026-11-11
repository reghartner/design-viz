/* Reader Text window (#1322): a top-bar launcher beside Search that opens a
   read-only window with the page as text, built by core/text-view.js from the
   page the reader holds (imports already resolved). Nothing here edits the
   document. Tabs: Steps (textViewSteps), Elements (textViewElements), Flat lines
   (textViewFlat). The Queries switch reaches Steps only; Copy Markdown always
   copies full queries. The last tab and switches are remembered in memory for
   this page load only (no URL hash, no storage). */
var TEXT_VIEW_TABS=[{id:'steps',label:'Steps'},{id:'elements',label:'Elements'},{id:'flat',label:'Flat lines'}];
var textViewSession={tab:'steps',queries:'names',wrap:false};
var textViewSequence=0;

/* state: {tab, queries:'names'|'full', pathId}; copy: true for the copied text,
   which always carries full queries. */
function textViewReaderText(model,state,copy){
  var tab=state && state.tab;
  if(tab==='elements')return textViewElements(model);
  if(tab==='flat')return textViewFlat(model);
  return textViewSteps(model,{queries:copy || state.queries==='full'?'full':'names',pathId:state.pathId==null?null:state.pathId});
}
/* Every path id once, in document order, with the first label met. */
function textViewReaderPaths(model){
  var seen={},out=[];
  ((model && model.sections) || []).forEach(function(sec){(sec.diagrams || []).forEach(function(d){(d.paths || []).forEach(function(p){
    if(Object.prototype.hasOwnProperty.call(seen,p.id))return;seen[p.id]=true;out.push({id:p.id,label:p.label || p.id});
  });});});
  return out;
}
function textViewReaderPath(paths,readerPath,chosen){
  var has=function(id){return id!=null && paths.some(function(p){return p.id===id;});};
  return has(chosen)?chosen:has(readerPath)?readerPath:paths.length?paths[0].id:null;
}

function createReaderTextView(ctl,nav,actions,currentRecord){
  var doc=ctl.view.ownerDocument,view=ctl.view,win=doc.defaultView || window,retired=false,opened=false,chosenPath=null,model=null,copyGen=0;
  var id='flowview-text-view-'+(++textViewSequence);
  function el(tag,cls,text,parent){var node=doc.createElement(tag);if(cls)node.className=cls;if(text)node.textContent=text;if(parent)parent.appendChild(node);return node;}
  function button(label,text,parent,fn){var node=el('button','reader-button',text,parent);node.type='button';node.setAttribute('aria-label',label);node.title=label;node.addEventListener('click',fn);return node;}
  var launch=el('span','text-view-launch'),searchLaunch=actions.querySelector(':scope > .document-search-launch');
  if(searchLaunch)searchLaunch.after(launch);else actions.prepend(launch);
  var toggle=button('Text view','',launch,function(){setOpen(!opened);});
  toggle.innerHTML='<svg aria-hidden="true" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M5 6h14M5 10h14M5 14h9M5 18h11"/></svg>';
  toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-haspopup','dialog');toggle.title='Text view: read this document as text';

  var panel=el('section','text-view',null,nav);panel.id=id;panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','false');
  toggle.setAttribute('aria-controls',id);
  var heading=el('div','text-view-heading',null,panel),title=el('strong','','Text view',heading);title.id=id+'-title';panel.setAttribute('aria-labelledby',title.id);
  var close=button('Close text view','×',heading,function(){setOpen(false);toggle.focus();});
  var controls=el('div','text-view-controls',null,panel),tablist=el('div','text-view-tabs',null,controls);tablist.setAttribute('role','tablist');tablist.setAttribute('aria-label','Text layout');
  var panels={},tabs=TEXT_VIEW_TABS.map(function(def){
    var tab=el('button','reader-button text-view-tab',def.label,tablist);tab.type='button';tab.id=id+'-tab-'+def.id;tab.setAttribute('role','tab');tab.setAttribute('aria-controls',id+'-panel-'+def.id);
    tab.addEventListener('click',function(){select(def.id,false);});
    var body=el('div','text-view-panel',null,panel);body.id=id+'-panel-'+def.id;body.setAttribute('role','tabpanel');body.setAttribute('aria-labelledby',tab.id);
    var pre=el('pre','text-view-text',null,body);pre.tabIndex=0;panels[def.id]={tab:tab,body:body,pre:pre};
    return {id:def.id,tab:tab};
  });
  var pathField=el('label','text-view-path',null,controls);el('span','','Path',pathField);var pathSelect=el('select','',null,pathField);pathSelect.setAttribute('aria-label','Path');
  pathSelect.addEventListener('change',function(){chosenPath=pathSelect.value;render();});
  var queries=el('div','text-view-queries',null,controls);queries.setAttribute('role','group');queries.setAttribute('aria-label','Queries');el('span','text-view-group-label','Queries',queries);
  var names=button('Query names','names',queries,function(){textViewSession.queries='names';render();});
  var full=button('Full queries','full',queries,function(){textViewSession.queries='full';render();});
  var wrap=button('Wrap lines','Wrap lines',controls,function(){textViewSession.wrap=!textViewSession.wrap;render();});wrap.setAttribute('role','switch');wrap.classList.add('text-view-switch');
  var copy=button('Copy Markdown','Copy Markdown',controls,copyText);copy.classList.add('text-view-copy');
  var status=el('p','text-view-status',null,panel);status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  var manual=el('div','text-view-manual',null,panel);manual.hidden=true;
  // Panels follow the controls and status, so the text block takes the remaining height.
  TEXT_VIEW_TABS.forEach(function(def){panel.appendChild(panels[def.id].body);});

  function readerPath(){var rec=currentRecord && currentRecord(),stepper=rec && rec.stepper;try{return stepper && stepper.path?stepper.path():null;}catch(ex){return null;}}
  function build(){
    try{model=textViewModel(ctl.page);return null;}catch(ex){model=null;return 'The text view could not read this document: '+(ex && ex.message || ex);}
  }
  function state(){return {tab:textViewSession.tab,queries:textViewSession.queries,pathId:textViewReaderPath(textViewReaderPaths(model),readerPath(),chosenPath)};}
  function render(problem){
    if(retired)return;
    var tab=TEXT_VIEW_TABS.some(function(def){return def.id===textViewSession.tab;})?textViewSession.tab:'steps',steps=tab==='steps';textViewSession.tab=tab;
    tabs.forEach(function(item){var on=item.id===tab;item.tab.setAttribute('aria-selected',String(on));item.tab.tabIndex=on?0:-1;panels[item.id].body.hidden=!on;});
    var paths=model?textViewReaderPaths(model):[],current=state();
    pathSelect.replaceChildren();paths.forEach(function(p){var o=el('option','',p.label,pathSelect);o.value=p.id;o.selected=p.id===current.pathId;});
    pathField.hidden=paths.length<2;pathSelect.disabled=!steps;
    names.setAttribute('aria-pressed',String(textViewSession.queries!=='full'));full.setAttribute('aria-pressed',String(textViewSession.queries==='full'));
    names.disabled=full.disabled=!steps;queries.title=steps?'':'Elements and Flat lines always show full queries.';
    wrap.setAttribute('aria-checked',String(!!textViewSession.wrap));panel.classList.toggle('text-view-wrapped',!!textViewSession.wrap);
    var pre=panels[tab].pre;pre.textContent=problem || (model?textViewReaderText(model,current,false):'');
    TEXT_VIEW_TABS.forEach(function(def){if(def.id!==tab)panels[def.id].pre.textContent='';});
    copy.disabled=!model;position();
  }
  function select(tab,focus){textViewSession.tab=tab;render();if(focus)panels[tab].tab.focus();}
  // The visible box the reader sits in: the viewport cut by every scrolling or
  // clipping ancestor (compare panes, a bounded Backstage host, a ShadowRoot host).
  function box(){
    var b={left:0,top:0,right:win.innerWidth || doc.documentElement.clientWidth,bottom:win.innerHeight || doc.documentElement.clientHeight};
    for(var a=nav.parentElement || (nav.getRootNode() && nav.getRootNode().host);a;a=a.parentElement || (a.getRootNode() && a.getRootNode().host) || null){
      var s=win.getComputedStyle(a);if(!/hidden|clip|auto|scroll/.test(s.overflowX+' '+s.overflowY))continue;
      var r=a.getBoundingClientRect();b={left:Math.max(b.left,r.left),top:Math.max(b.top,r.top),right:Math.min(b.right,r.right),bottom:Math.min(b.bottom,r.bottom)};
    }
    return b;
  }
  function position(){
    if(!opened)return;var rect=nav.getBoundingClientRect(),b=box(),room=b.right-b.left-16;
    var width=Math.max(Math.min(240,room),Math.min(960,rect.width-16,room)),left=Math.max(b.left+8,Math.min(rect.left+(rect.width-width)/2,b.right-width-8));
    var top=Math.max(b.top+8,Math.min(rect.bottom+8,b.bottom-208));
    panel.style.width=width+'px';panel.style.left=left+'px';panel.style.top=top+'px';panel.style.height=Math.max(160,Math.min(760,b.bottom-top-8))+'px';
  }
  function setOpen(value){
    if(retired)return;opened=!!value;panel.hidden=!opened;toggle.setAttribute('aria-expanded',String(opened));clearManual();status.textContent='';
    if(opened){chosenPath=null;render(build());panels[textViewSession.tab].tab.focus();}
    else{model=null;TEXT_VIEW_TABS.forEach(function(def){panels[def.id].pre.textContent='';});}
  }
  function clearManual(){manual.replaceChildren();manual.hidden=true;}
  // fallbackCopy's manual field is a one-line input, which drops newlines. It is
  // placed after an anchor inside this window and then swapped for a read-only
  // textarea holding the whole text.
  function offerManual(text,anchor){
    var field=anchor._dvCopyField;if(field && field.parentNode)field.remove();anchor._dvCopyField=null;
    var area=el('textarea','copyfallback text-view-copyfallback',null,manual);area.readOnly=true;area.value=text;area.rows=6;
    area.setAttribute('aria-label','Copy this text manually');area.title='Automatic copying was denied; copy this selected text manually.';
    manual.hidden=false;area.focus();area.select();
  }
  function copyText(){
    if(!model)return;var text=textViewReaderText(model,state(),true),gen=++copyGen;clearManual();
    function done(){if(gen===copyGen && !retired)status.textContent='Markdown copied.';}
    function fallback(){
      if(gen!==copyGen || retired)return;
      var anchor=el('span','',null,manual);
      if(fallbackCopy(win,text,anchor)){clearManual();done();copy.focus();return;}
      offerManual(text,anchor);status.textContent='Copy failed. Select the text below and copy it.';
    }
    try{
      if(win.navigator && win.navigator.clipboard && win.navigator.clipboard.writeText)win.navigator.clipboard.writeText(text).then(done,fallback);
      else fallback();
    }catch(ex){fallback();}
  }
  function keydown(ev){
    if(!opened || ev.defaultPrevented)return;
    if(ev.key==='Escape'){ev.preventDefault();ev.stopPropagation();setOpen(false);toggle.focus();}
  }
  tablist.addEventListener('keydown',function(ev){
    var keys=['ArrowRight','ArrowLeft','Home','End'];if(keys.indexOf(ev.key)<0)return;ev.preventDefault();ev.stopPropagation();
    var index=TEXT_VIEW_TABS.findIndex(function(def){return def.id===textViewSession.tab;}),n=TEXT_VIEW_TABS.length;
    index=ev.key==='Home'?0:ev.key==='End'?n-1:(index+(ev.key==='ArrowRight'?1:-1)+n)%n;select(TEXT_VIEW_TABS[index].id,true);
  });
  // Keys typed in the window (scrolling the text block, choosing a tab) stay in the window.
  panel.addEventListener('keydown',function(ev){if(ev.key!=='Escape')ev.stopPropagation();});
  view.addEventListener('keydown',keydown,true);
  // A path picked in the reader moves the Steps tab with it until one is chosen here.
  function pathChanged(){if(opened && chosenPath==null)render();}
  view.addEventListener('dv:pathchange',pathChanged);
  win.addEventListener('resize',position);win.addEventListener('scroll',position,true);
  // A phone-width bar has no room for the launcher (Search hides there too); a
  // compare pane or a narrow desktop column keeps it.
  function cramped(){if(!retired)nav.classList.toggle('text-view-cramped',nav.getBoundingClientRect().width<480);}
  var sizes=typeof ResizeObserver==='function'?new ResizeObserver(cramped):null;if(sizes)sizes.observe(nav);cramped();
  render();
  return {
    isOpen:function(){return opened;},
    // The reader's document can change while the window is open: rebuild from ctl.page.
    refresh:function(){if(opened && !retired)render(build());},
    destroy:function(){retired=true;opened=false;if(sizes)sizes.disconnect();nav.classList.remove('text-view-cramped');view.removeEventListener('keydown',keydown,true);view.removeEventListener('dv:pathchange',pathChanged);win.removeEventListener('resize',position);win.removeEventListener('scroll',position,true);panel.remove();launch.remove();}
  };
}
