/* The published library is data, served beside the static editor. */
function parseCanonLibrary(raw){
  if(!raw || raw.version!==1 || !Array.isArray(raw.diagrams))throw new Error('Expected a version 1 diagram library.');
  var ids=new Set();
  return raw.diagrams.map(function(entry){
    if(!entry || typeof entry.id!=='string' || !entry.id.trim() || entry.id.length>200 || ids.has(entry.id))throw new Error('Every library diagram needs a unique ID.');
    if(!entry.spec || entry.spec.page?.canon?.id!==entry.id)throw new Error('Library and spec IDs differ: '+entry.id);
    var errors=FlowCanon.validate(entry.spec).concat(validate(normalize(entry.spec)).errors);
    if(errors.length)throw new Error('Invalid diagram '+entry.id+': '+errors.join('; '));
    ids.add(entry.id);
    return {id:entry.id,title:typeof entry.title==='string' && entry.title.trim()?entry.title:entry.spec.page.title || entry.id,spec:entry.spec};
  });
}

function initWorkbenchLibrary(opts){
  var grid=document.getElementById('welcome-library-grid'),status=document.getElementById('welcome-library-status');
  var reader=document.getElementById('canon-reader'),error=document.getElementById('canon-reader-error');
  var edit=document.getElementById('canon-reader-edit'),title=document.getElementById('canon-reader-title');
  var retry=document.getElementById('welcome-library-retry'),readerRetry=document.getElementById('canon-reader-retry');
  var copy=document.getElementById('canon-reader-copy');
  var pending=null,entries=[],origin='',published=false,ctl=null,active=null,sequence=0,current=null;
  function stop(){
    sequence++;active=null;current=null;edit.disabled=true;copy.disabled=true;removeManualCopyField(copy);
    if(ctl)ctl.destroy();ctl=null;reader.replaceChildren();
  }
  function load(){
    if(pending)return pending;
    pending=(async function(){
      var raw=opts.builtin;published=false;
      origin='Fictional example · no company library configured';
      if(location.protocol!=='file:'){
        var response=await fetch('diagrams.json',{cache:'no-cache'});
        if(response.status!==404){
          if(!response.ok)throw new Error('Library unavailable ('+response.status+').');
          if(Number(response.headers.get('content-length'))>30*1024*1024)throw new Error('Library exceeds 30 MB.');
          var text=await response.text();
          if(new TextEncoder().encode(text).length>30*1024*1024)throw new Error('Library exceeds 30 MB.');
          raw=JSON.parse(text);origin='Published repository snapshot';published=true;
        }
      }else origin='Bundled fictional example · offline';
      entries=parseCanonLibrary(raw);return entries;
    })();
    return pending;
  }
  function cards(){
    grid.replaceChildren();
    entries.forEach(function(entry){
      var button=document.createElement(published?'a':'button');button.className='canon-library-card';
      if(published)button.href=canonDiagramURL(location.href,entry.id);else button.type='button';
      var badge=document.createElement('span');badge.className='canon-library-badge';badge.textContent=entry.spec.page.canon.kind==='canonical'?'CANONICAL · READ ONLY':'DESIGN · READ ONLY';
      var name=document.createElement('strong');name.textContent=entry.title;
      var detail=document.createElement('span');detail.textContent=starterCountLine(entry.spec);
      var owner=document.createElement('span');owner.className='canon-library-owner';owner.textContent=entry.spec.page.canon.owner || entry.id;
      var action=document.createElement('span');action.className='canon-library-action';action.textContent='View diagram →';
      button.append(badge,name,detail,owner,action);
      button.addEventListener('click',function(event){
        if(published && (event.button!==0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey))return;
        event.preventDefault();opts.open(entry.id,published);
      });grid.appendChild(button);
    });
  }
  async function show(screen,id){
    stop();active=screen;var token=sequence;
    status.textContent='Loading diagrams…';retry.hidden=true;readerRetry.hidden=true;
    document.getElementById('canon-reader-origin').textContent='';
    error.hidden=true;error.textContent='';title.textContent='Loading diagram…';
    try{
      await load();if(token!==sequence)return;
      if(screen==='library'){
        cards();status.textContent=origin+' · '+entries.length+' diagram'+(entries.length===1?'':'s')+(entries.length?'':'. Your repository snapshot is empty.');return;
      }
      if(opts.shareable() && !published)throw new Error('No published diagram library is available at this address. Publish the site’s diagrams.json and retry.');
      current=entries.find(function(entry){return entry.id===id;});
      if(!current)throw new Error('This diagram is no longer in the published library. Return to Canon diagrams to choose another.');
      title.textContent=current.title;
      document.getElementById('canon-reader-origin').textContent=origin+' · Reading does not change your draft.';
      var spec=JSON.parse(JSON.stringify(current.spec));
      ctl=renderPage(reader,normalize(spec),spec.page.skin,null,{autoplay:false});edit.disabled=false;copy.disabled=!published;
    }catch(ex){
      if(token!==sequence)return;
      current=null;edit.disabled=true;
      if(screen==='library'){grid.replaceChildren();status.textContent='Could not load canon diagrams. '+ex.message;retry.hidden=false;}
      else {title.textContent='Diagram unavailable';error.textContent=ex.message;error.hidden=false;readerRetry.hidden=false;}
    }
  }
  bindCopyControl(window,copy,function(){return canonDiagramURL(location.href,current.id);});
  function refresh(){pending=null;show(active,opts.selected());}
  retry.addEventListener('click',refresh);readerRetry.addEventListener('click',refresh);
  edit.addEventListener('click',function(){
    if(!current)return;
    try{opts.edit(JSON.parse(JSON.stringify(current.spec)));}
    catch(ex){error.textContent=ex.message;error.hidden=false;}
  });
  window.addEventListener('pagehide',function(){sequence++;if(ctl)ctl.destroy();ctl=null;});
  window.addEventListener('pageshow',function(event){if(event.persisted && active)show(active,opts.selected());});
  return {show:show,hide:stop};
}
