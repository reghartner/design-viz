/* Published indexes contain metadata and relative URLs; specs load on demand.
   Version 1 remains readable for existing deployments and the offline demo. */
function canonLibrarySpec(raw,entry){
  var spec=JSON.parse(JSON.stringify(raw));
  if(entry.canon){
    if(!spec || !spec.page || typeof spec.page!=='object' || Array.isArray(spec.page))throw new Error('Expected a page spec: '+entry.id);
    spec.page.canon=JSON.parse(JSON.stringify(entry.canon));
  }
  if(!spec || spec.page?.canon?.id!==entry.id)throw new Error('Library and spec IDs differ: '+entry.id);
  var errors=FlowCanon.validate(spec).concat(entry.version===3?[]:validate(normalize(spec)).errors);
  if(errors.length)throw new Error('Invalid diagram '+entry.id+': '+errors.join('; '));
  return spec;
}
function canonLibrarySpecURL(value,base){
  if(typeof value!=='string' || !value || /^[a-z][a-z0-9+.-]*:|^[\/]|[\\?#\x00-\x20]/i.test(value))throw new Error('Diagram spec URL must be a relative JSON file.');
  var url=new URL(value,base);
  if(url.origin!==new URL(base).origin || !/^https?:$/.test(url.protocol) || !/\.json$/i.test(url.pathname))throw new Error('Diagram spec URL must be a same-origin JSON file.');
  return url.href;
}
function parseCanonLibrary(raw){
  if(!raw || ![1,2,3].includes(raw.version) || !Array.isArray(raw.diagrams))throw new Error('Expected a version 1, 2 or 3 diagram library.');
  var ids=new Set();
  return raw.diagrams.map(function(entry){
    if(!entry || typeof entry.id!=='string' || !entry.id.trim() || entry.id.length>200 || ids.has(entry.id))throw new Error('Every library diagram needs a unique ID.');
    ids.add(entry.id);
    var title=typeof entry.title==='string' && entry.title.trim()?entry.title:entry.id;
    if(raw.version===1){
      var spec=canonLibrarySpec(entry.spec,{id:entry.id});
      return {id:entry.id,title:typeof entry.title==='string' && entry.title.trim()?entry.title:spec.page.title || entry.id,spec:spec,canon:spec.page.canon,source:entry.source,topologyContext:entry.topologyContext};
    }
    if(!entry.canon || entry.canon.id!==entry.id || FlowCanon.validate({page:{canon:entry.canon}}).length)throw new Error('Invalid diagram membership: '+entry.id);
    canonLibrarySpecURL(entry.specUrl,'https://library.invalid/workbench/diagrams.json');
    if(!entry.counts || ['nodes','steps','panels'].some(function(key){return !Number.isSafeInteger(entry.counts[key]) || entry.counts[key]<0;}))throw new Error('Invalid diagram counts: '+entry.id);
    if(raw.version===3 && !/^[a-f0-9]{64}$/.test(entry.revision || ''))throw new Error('Invalid source revision: '+entry.id);
    return {id:entry.id,title:title,canon:entry.canon,counts:entry.counts,specUrl:entry.specUrl,version:raw.version,revision:entry.revision};
  });
}
async function readCanonLibraryJSON(response,label){
  if(!response.ok)throw new Error(label+' unavailable ('+response.status+').');
  if(Number(response.headers.get('content-length'))>30*1024*1024)throw new Error(label+' exceeds 30 MB.');
  var text=await response.text();
  if(new TextEncoder().encode(text).length>30*1024*1024)throw new Error(label+' exceeds 30 MB.');
  return JSON.parse(text);
}

/* Explicit authoring acquisition only. The catalog is captured on Canon entry;
   never reload it or replace an already-frozen provider during this session. */
function createTopologyCatalogLoader(context){
  var catalog=context && context.catalog;
  if(!catalog || catalog.version!==3 || !context.catalogURL || !/^https?:$/.test(new URL(location.href).protocol))throw new Error('Referenced topology is unavailable. Open a diagram from a deployed Canon v3 library. Offline and legacy libraries do not provide an authored-source catalog.');
  var entries=parseCanonLibrary(catalog),base=new URL(context.catalogURL);
  if(base.origin!==new URL(location.href).origin || !/\.json$/.test(base.pathname) || base.search || base.hash)throw new Error('The frozen catalog address is unavailable at this origin. Reopen Canon here.');
  context=JSON.parse(JSON.stringify(context));
  var requests=new Map();
  (context.specs || []).forEach(function(source){requests.set(source.page.canon.id,Promise.resolve(source));});
  function source(entry){
    if(!requests.has(entry.id)){
      var request=(async function(){
        var response=await fetch(canonLibrarySpecURL(entry.specUrl,base),{cache:'no-cache',redirect:'error'});
        var raw=canonLibrarySpec(await readCanonLibraryJSON(response,'Provider '+entry.id),entry);
        try{await verifyWorkspaceHandoff(raw,{id:entry.id,revision:entry.revision},window.crypto);}
        catch(ex){throw new Error('Source revision mismatch for '+entry.id+'. Reopen Canon after deployment; your draft has not changed.');}
        return raw;
      })().catch(function(ex){
        // Share in-flight work, but cache only verified successful sources.
        // A retry still checks the original revision lock; it is not a refresh.
        if(requests.get(entry.id)===request)requests.delete(entry.id);
        throw ex;
      });
      requests.set(entry.id,request);
    }
    return requests.get(entry.id);
  }
  return {entries:entries,load:async function(id,currentContext){
    var frozen=currentContext || context;
    var specs=new Map(frozen.specs.map(function(spec){return [spec.page.canon.id,spec];})),visited=new Set();
    async function visit(key){
      if(visited.has(key))return;visited.add(key);
      var entry=entries.find(function(item){return item.id===key;});
      if(!entry)throw new Error('Missing authored provider '+key+' in the frozen catalog.');
      var raw=await source(entry);specs.set(key,raw);
      for(var dependency of FlowTopology.dependencies(raw))await visit(dependency);
    }
    await visit(id);
    var expanded=Object.assign({},frozen,{specs:Array.from(specs.values())});
    var resolved=FlowTopology.materialize(expanded.specs);
    return {context:JSON.parse(JSON.stringify(expanded)),source:JSON.parse(JSON.stringify(specs.get(id))),resolved:resolved.find(function(spec){return spec.page.canon.id===id;})};
  }};
}

function initWorkbenchLibrary(opts){
  var grid=document.getElementById('welcome-library-grid'),status=document.getElementById('welcome-library-status');
  var reader=document.getElementById('canon-reader'),error=document.getElementById('canon-reader-error');
  var edit=document.getElementById('canon-reader-edit'),title=document.getElementById('canon-reader-title');
  var retry=document.getElementById('welcome-library-retry'),readerRetry=document.getElementById('canon-reader-retry');
  var copy=document.getElementById('canon-reader-copy');
  var specRequests=new Map();
  var pending=null,entries=[],origin='',published=false,ctl=null,tour=null,exploreCanvas=null,deepLinks=null,active=null,sequence=0,current=null,openedBuild=false,backendContext=null;
  function retireViewer(){
    if(exploreCanvas)exploreCanvas.destroy();exploreCanvas=null;
    if(tour)tour.destroy();tour=null;
    if(deepLinks)deepLinks.destroy();deepLinks=null;
    if(ctl)ctl.destroy();ctl=null;
  }
  function stop(){
    sequence++;active=null;current=null;edit.disabled=true;copy.disabled=true;removeManualCopyField(copy);
    retireViewer();reader.replaceChildren();
  }
  function load(){
    if(pending)return pending;
    pending=(async function(){
      if(opts.handoff && opts.handoff.error)throw new Error(opts.handoff.error);
      var raw=opts.builtin;published=false;backendContext=null;
      origin='Fictional example · no company library configured';
      if(opts.legacyCanon){
        if(opts.legacyCanon!==opts.handoff.id)throw new Error('The diagram address and Backstage link do not match.');
        var contextResponse=await fetch('/api/canon/context?id='+encodeURIComponent(opts.legacyCanon),{cache:'no-cache'});
        if(!contextResponse.ok)throw new Error('Company story unavailable ('+contextResponse.status+').');
        var context=await contextResponse.json();
        if(context.source)backendContext=context;
        raw={version:1,diagrams:[{id:opts.legacyCanon,spec:context.spec}]};published=true;origin='Company repository snapshot';
      }else if(location.protocol!=='file:'){
        var response=await fetch('diagrams.json',{cache:'no-cache'});
        if(response.status!==404){
          raw=await readCanonLibraryJSON(response,'Library');origin='Published repository snapshot';published=true;
        }
      }else origin='Bundled fictional example · offline';
      entries=parseCanonLibrary(raw);return entries;
    })();
    return pending;
  }
  function loadSource(entry){
    if(entry.spec)return Promise.resolve(entry.spec);
    if(!specRequests.has(entry))specRequests.set(entry,(async function(){
      var url=canonLibrarySpecURL(entry.specUrl,new URL('diagrams.json',location.href).href);
      var response=await fetch(url,{cache:'no-cache',redirect:'error'});
      var source=canonLibrarySpec(await readCanonLibraryJSON(response,'Diagram'),entry);
      if(entry.version===3){
        try{await verifyWorkspaceHandoff(source,{id:entry.id,revision:entry.revision},window.crypto);}
        catch(ex){throw new Error('Source revision mismatch for '+entry.id+'. Reload after deployment. Your draft has not changed.');}
      }
      return source;
    })());
    return specRequests.get(entry);
  }
  async function loadSpec(entry){
    var snapshotEntries=entries.slice();
    var source=await loadSource(entry);
    if(entry.source)return {source:entry.source,spec:FlowTopology.resolveSource(entry.source,entry.topologyContext),topologyContext:entry.topologyContext};
    if(backendContext){
      source=backendContext.source;
      return {source:source,spec:FlowTopology.resolveSource(source,backendContext.topologyContext),topologyContext:backendContext.topologyContext};
    }
    if(entry.version!==3)return {source:source,spec:source,topologyContext:null};
    var sources=new Map();
    async function visit(selected){
      if(sources.has(selected.id))return;
      var raw=await loadSource(selected);sources.set(selected.id,raw);
      for(var id of FlowTopology.dependencies(raw)){
        var dependency=snapshotEntries.find(function(item){return item.id===id;});
        if(!dependency || dependency.version!==3)throw new Error('Missing authored provider '+id+' required by '+selected.id);
        await visit(dependency);
      }
    }
    await visit(entry);
    var context={version:1,id:entry.id,specs:Array.from(sources.values()),catalog:{version:3,diagrams:snapshotEntries},catalogURL:new URL('diagrams.json',location.href).href};
    return {source:source,spec:FlowTopology.resolveSource(source,context),topologyContext:context};
  }
  function cards(){
    grid.replaceChildren();
    entries.forEach(function(entry){
      var button=document.createElement(published?'a':'button');button.className='canon-library-card';
      if(published)button.href=canonDiagramURL(location.href,entry.id);else button.type='button';
      var badge=document.createElement('span');badge.className='canon-library-badge';badge.textContent=entry.canon.kind==='canonical'?'CANONICAL · READ ONLY':'DESIGN · READ ONLY';
      var name=document.createElement('strong');name.textContent=entry.title;
      var detail=document.createElement('span');detail.textContent=entry.spec?starterCountLine(entry.spec):['nodes','steps','panels'].map(function(key){return entry.counts[key]+' '+(entry.counts[key]===1?key.slice(0,-1):key);}).join(' · ');
      var owner=document.createElement('span');owner.className='canon-library-owner';owner.textContent=entry.canon.owner || entry.id;
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
    pending=null;specRequests.clear();
    status.textContent='Loading diagrams…';retry.hidden=true;readerRetry.hidden=true;
    document.getElementById('canon-reader-origin').textContent='';
    error.hidden=true;error.textContent='';title.textContent='Loading diagram…';
    try{
      await load();if(token!==sequence)return;
      if(screen==='library'){
        cards();status.textContent=origin+' · '+entries.length+' diagram'+(entries.length===1?'':'s')+(entries.length?'':'. Your repository snapshot is empty.');return;
      }
      if(opts.shareable() && !published)throw new Error('No published diagram library is available at this address. Publish the site’s diagrams.json and retry.');
      var selected=entries.find(function(entry){return entry.id===id;});
      if(!selected)throw new Error('This diagram is no longer in the published library. Return to Canon diagrams to choose another.');
      var loaded=await loadSpec(selected);if(token!==sequence)return;
      current=Object.assign({},selected,loaded);
      var handoff=opts.handoff && (opts.handoff.error || opts.handoff.id===id)?opts.handoff:null;
      await verifyWorkspaceHandoff(current.spec,handoff,window.crypto);if(token!==sequence)return;
      if(handoff && handoff.action==='build' && !openedBuild){
        // Validate the exact target against the actual renderer before saving
        // or switching projects. A bad fragment leaves the existing draft intact.
        var checked=normalize(JSON.parse(JSON.stringify(current.spec)));
        ctl=renderPage(reader,checked,current.spec.page.skin,null,{autoplay:false});
        applyWorkspaceTarget(ctl,checked,handoff.target);retireViewer();
        opts.edit(JSON.parse(JSON.stringify(current.source)),handoff,true,current.topologyContext);openedBuild=true;return;
      }
      title.textContent=current.title;
      document.getElementById('canon-reader-origin').textContent=origin+(handoff?' · Opened from '+(handoff.entity || 'Backstage'):'')+' · Reading does not change your draft.';
      var spec=JSON.parse(JSON.stringify(current.spec));
      var page=normalize(spec);
      ctl=renderPage(reader,page,spec.page.skin,null,{autoplay:false});edit.disabled=false;copy.disabled=!published;
      deepLinks=wireDeepLinks(ctl,window,null,{history:false});
      if(handoff)applyWorkspaceTarget(ctl,page,handoff.target);
      edit.textContent=handoff && handoff.action==='build'?'Build with Claude →':'Edit in Workbench →';
      exploreCanvas=initViewerExploreCanvas(ctl,reader,{action:edit});
      tour=wireTour(ctl,reader,window,tourUsableConfig(page.tour)?page.tour:TOUR_DEFAULT_CONFIG);
    }catch(ex){
      if(token!==sequence)return;
      current=null;edit.disabled=true;copy.disabled=true;retireViewer();reader.replaceChildren();
      if(screen==='library'){grid.replaceChildren();status.textContent='Could not load canon diagrams. '+ex.message;retry.hidden=false;}
      else {title.textContent='Diagram unavailable';error.textContent=ex.message;error.hidden=false;readerRetry.hidden=false;}
    }
  }
  bindCopyControl(window,copy,function(){return canonDiagramURL(location.href,current.id);});
  function refresh(){pending=null;specRequests.clear();show(active,opts.selected());}
  retry.addEventListener('click',refresh);readerRetry.addEventListener('click',refresh);
  edit.addEventListener('click',function(){
    if(!current)return;
    try{opts.edit(JSON.parse(JSON.stringify(current.source)),opts.handoff && opts.handoff.id===current.id?opts.handoff:null,false,current.topologyContext);}
    catch(ex){error.textContent=ex.message;error.hidden=false;}
  });
  window.addEventListener('pagehide',function(){sequence++;retireViewer();});
  window.addEventListener('pageshow',function(event){if(event.persisted && active)show(active,opts.selected());});
  return {show:show,hide:stop};
}
