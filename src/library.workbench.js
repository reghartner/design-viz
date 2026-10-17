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
/* Library cards and templates filter on their labels plus node (service)
   titles, lower-cased for case-insensitive substring matching. */
function diagramSearchText(values,spec){
  var names=[];
  if(spec)FlowCanon.sections(spec).forEach(function(section){
    Object.keys(section.diagram.nodes || {}).forEach(function(id){var node=section.diagram.nodes[id];if(node && typeof node.title==='string')names.push(node.title);});
  });
  return values.concat(names).filter(function(value){return typeof value==='string';}).join('\n').toLowerCase();
}
/* Description and tags are optional; indexes published before them, or with
   malformed values, still load as if the metadata were absent. */
function libraryDescription(value){return typeof value==='string'?value:'';}
function libraryTags(value){return Array.isArray(value)?value.filter(function(tag){return typeof tag==='string' && tag;}):[];}
/* Optional thumbnail metadata is untrusted. Accept only a small numeric/text
   vocabulary, copying it before rendering with createElementNS/textContent. */
function libraryPreviewData(value){
  if(!value || value.version!==1 || typeof value.label!=='string' || value.label.length>80 || !Number.isSafeInteger(value.total) || value.total<1)return null;
  var out={version:1,kind:value.kind,label:value.label,total:value.total};
  if(value.kind==='panels'){
    if(!Array.isArray(value.panels) || !value.panels.length || value.panels.length>3 || value.total<value.panels.length || value.panels.some(function(p){return !p || typeof p.title!=='string' || p.title.length>80 || typeof p.type!=='string' || p.type.length>40;}))return null;
    out.panels=value.panels.map(function(p){return {title:p.title,type:p.type};});return out;
  }
  if(value.kind!=='graph' || !Array.isArray(value.nodes) || !value.nodes.length || value.nodes.length>12 || value.total<value.nodes.length || !Array.isArray(value.edges) || value.edges.length>20)return null;
  if(value.nodes.some(function(n){return !n || typeof n.label!=='string' || n.label.length>80 || !['x','y','w','h'].every(function(k){return Number.isFinite(n[k]);}) || n.x<0 || n.y<0 || n.w<=0 || n.h<=0 || n.x+n.w>641 || n.y+n.h>301;}))return null;
  if(value.edges.some(function(e){return !e || ![e.from,e.to].every(function(i){return Number.isSafeInteger(i) && i>=0 && i<value.nodes.length;});}))return null;
  out.nodes=value.nodes.map(function(n){return {label:n.label,x:n.x,y:n.y,w:n.w,h:n.h};});out.edges=value.edges.map(function(e){return {from:e.from,to:e.to};});return out;
}
function libraryTeamName(raw){
  var match=/^([^:]+):([^/]+)\/(.+)$/.exec(raw || '');
  if(!match)return raw || 'Unassigned';
  var name=match[3].replace(/[-_]+/g,' ').replace(/\b\w/g,function(c){return c.toUpperCase();});
  return name+(match[2]!=='default'?' · '+match[2]:'')+(match[1]!=='group'?' ('+match[1]+')':'');
}
function libraryPreviewElement(preview){
  var box=document.createElement('span');box.className='canon-library-preview';
  if(!preview){box.classList.add('canon-library-preview-missing');var note=document.createElement('span');note.textContent='Preview unavailable';var hint=document.createElement('small');hint.textContent='Open to explore this diagram';box.append(note,hint);return box;}
  if(preview.kind==='panels'){
    box.classList.add('canon-library-preview-panels');
    var heading=document.createElement('small');heading.textContent='Panel story · '+preview.total+' panel'+(preview.total===1?'':'s');box.append(heading);
    preview.panels.forEach(function(panel){var line=document.createElement('span'),kind=document.createElement('small');line.textContent=panel.title;kind.textContent=panel.type;line.append(kind);box.append(line);});
  }else{
    function svgEl(tag,attrs){var node=document.createElementNS('http://www.w3.org/2000/svg',tag);Object.keys(attrs || {}).forEach(function(k){node.setAttribute(k,attrs[k]);});return node;}
    var svg=svgEl('svg',{viewBox:'0 0 640 300','aria-hidden':'true',focusable:'false'});
    preview.edges.forEach(function(edge){var a=preview.nodes[edge.from],b=preview.nodes[edge.to];svg.append(svgEl('line',{x1:a.x+a.w/2,y1:a.y+a.h/2,x2:b.x+b.w/2,y2:b.y+b.h/2}));});
    preview.nodes.forEach(function(node){var g=svgEl('g'),rect=svgEl('rect',{x:node.x,y:node.y,width:node.w,height:node.h,rx:Math.min(9,node.h/6)}),label=svgEl('text',{x:node.x+node.w/2,y:node.y+node.h/2,'text-anchor':'middle','dominant-baseline':'central','font-size':Math.min(22,node.h/2.5)});var limit=Math.max(4,Math.floor(node.w/Math.min(11,node.h/5))-2);label.textContent=node.label.length>limit?node.label.slice(0,limit-1)+'…':node.label;g.append(rect,label);svg.append(g);});box.append(svg);
  }
  var caption=document.createElement('span');caption.className='canon-library-preview-caption';caption.textContent=preview.kind==='graph'?(preview.total>preview.nodes.length?preview.nodes.length+' of '+preview.total+' nodes · ':'Topology · ')+preview.label:'Panel summary · '+preview.label;box.append(caption);return box;
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
      return {id:entry.id,title:typeof entry.title==='string' && entry.title.trim()?entry.title:spec.page.title || entry.id,description:libraryDescription(spec.page.description),tags:libraryTags(spec.page.tags),spec:spec,canon:spec.page.canon,source:entry.source,topologyContext:entry.topologyContext};
    }
    if(!entry.canon || entry.canon.id!==entry.id || FlowCanon.validate({page:{canon:entry.canon}}).length)throw new Error('Invalid diagram membership: '+entry.id);
    canonLibrarySpecURL(entry.specUrl,'https://library.invalid/workbench/diagrams.json');
    if(!entry.counts || ['nodes','steps','panels'].some(function(key){return !Number.isSafeInteger(entry.counts[key]) || entry.counts[key]<0;}))throw new Error('Invalid diagram counts: '+entry.id);
    if(raw.version===3 && !/^[a-f0-9]{64}$/.test(entry.revision || ''))throw new Error('Invalid source revision: '+entry.id);
    var services=Array.isArray(entry.services)?entry.services.filter(function(name){return typeof name==='string';}):[];
    var exports=Array.isArray(entry.exports)?entry.exports.filter(function(name){return typeof name==='string';}):undefined;
    return {id:entry.id,title:title,preview:libraryPreviewData(entry.preview),description:libraryDescription(entry.description),tags:libraryTags(entry.tags),canon:entry.canon,counts:entry.counts,services:services,exports:exports,specUrl:entry.specUrl,version:raw.version,revision:entry.revision};
  });
}

/* A Canon edit starts from the reader's authored navigation identity, never
   from DOM positions. This is deliberately the same small vocabulary used by
   workspace handoffs and deep links, so paths with shared steps retain their
   source occurrence instead of collapsing to a visible-step ordinal. */
function canonReaderTarget(ctl){
  if(!ctl || !Array.isArray(ctl.sections))return null;
  var active=ctl.activeTarget || {},rec=null;
  if(active.kind==='diagram')rec=ctl.sections.find(function(item){return item.number===active.section;});
  if(!rec && active.kind==='tab')rec=ctl.sections.find(function(item){return item.stepper && item.tabBlock===active.tabBlock && item.tab===active.tab;});
  if(!rec)rec=ctl.sections.find(function(item){
    return item.stepper && (item.tabBlock==null || ctl.tabBlocks && ctl.tabBlocks[item.tabBlock-1] && ctl.tabBlocks[item.tabBlock-1].active()===item.tab);
  });
  if(!rec || rec.reference==null)return null;
  var target={d:String(rec.reference)},sp=rec.stepper;
  var ownerView=ctl.views && ctl.views.current(rec);
  if(ownerView && !ownerView.legacy)target.v=ownerView.id;
  else if(rec.presentation && rec.presentation.viewId)target.v=rec.presentation.viewId();
  if(sp){
    target.m=sp.mode();
    if(sp.paths && sp.paths().length>1)target.p=sp.path();
    if(target.m==='step')target.s=stepReference(sp.ids(),sp.current().n);
  }
  return target;
}
async function readCanonLibraryJSON(response,label){
  if(!response.ok)throw new Error(label+' unavailable ('+response.status+').');
  if(Number(response.headers.get('content-length'))>30*1024*1024)throw new Error(label+' exceeds 30 MB.');
  var text=await response.text();
  if(new TextEncoder().encode(text).length>30*1024*1024)throw new Error(label+' exceeds 30 MB.');
  return JSON.parse(text);
}

/* One read of this site's diagrams.json per page, shared by Browse, the
   reference picker, agent proposals and file opening, made on first need (a
   page that already browsed or read a diagram has it). Only a successful read
   is kept; a 404, a transport failure or a bad body is retried on demand, so
   nothing is ever cached as "unavailable". `fresh` re-reads for Browse, and
   only Browse may `follow` a redirect (as it always has); every other read
   aborts on redirect, so topology never requests another origin, and a
   redirected body Browse did read is refused for topology use. */
var siteRepositoryIndex=(function(){
  var cached=null,pending=null;
  return function(options){
    if(!/^https?:$/.test(new URL(location.href).protocol))return Promise.reject(new Error('Referenced topology needs a deployed Workbench. This offline editor has no published diagram library.'));
    if(pending)return pending;
    if(cached && !(options && options.fresh))return Promise.resolve(cached);
    var url=new URL('diagrams.json',location.href).href,redirect=options && options.follow?'follow':'error';
    pending=(async function(){
      var response=await fetch(url,{cache:'no-cache',redirect:redirect}),raw=null;
      if(response.status!==404){
        // Only a body shaped like a diagram library counts as a read; any
        // other JSON (for example a placeholder) is "no library" and is not kept.
        var body=await readCanonLibraryJSON(response,'Repository catalog');
        if(body && [1,2,3].includes(body.version) && Array.isArray(body.diagrams))raw=body;
      }
      return {status:response.status,redirected:!!response.redirected,raw:raw,url:url};
    })();
    pending.then(function(result){if(result.raw)cached=result;pending=null;},function(){pending=null;});
    return pending;
  };
})();

/* Acquisition pins this site's index automatically wherever providers are
   needed; frozen providers are never reloaded or replaced. Only an explicit
   refresh (below) may adopt a later index, and only when every frozen
   provider keeps its revision. */
function createTopologyCatalogLoader(context){
  var catalog=context && context.catalog;
  if(!catalog || catalog.version!==3 || !context.catalogURL || !/^https?:$/.test(new URL(location.href).protocol))throw new Error('Referenced topology is unavailable. Loading missing providers requires a deployed version 3 authored-source repository catalog. Offline and legacy libraries do not provide one.');
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
        catch(ex){var mismatch=new Error('Source revision mismatch for '+entry.id+': it was republished after this session pinned the library. Use the latest published library, or reopen the diagram; your draft has not changed.');mismatch.revisionMismatch=true;throw mismatch;}
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

function authoredTopologyDependencies(raw){
  var source=raw && !raw.page && (raw.nodes || raw.rows || raw.topologyImports || raw.topologyExports)?{page:{sections:[{diagram:raw}]}}:raw;
  return FlowTopology.dependencies(source);
}

/* Prepare a private review context from the browser's approved catalog only.
   Proposal JSON supplies provider IDs, never catalog addresses or snapshots.
   A draft without a context pins this site's index here, so an agent never
   receives an instruction that only a human at the UI could follow. */
async function prepareTopologyProposal(raw,context){
  var dependencies=authoredTopologyDependencies(raw);
  if(!dependencies.length)return context;
  if(!context)context=await connectTopologyRepository({page:{sections:[{diagram:{nodes:{},rows:[[]]}}]}});
  var missing=dependencies.filter(function(id){return !context.specs.some(function(spec){return spec.page.canon.id===id;});});
  if(!missing.length)return context;
  var loader=createTopologyCatalogLoader(context),prepared=context;
  for(var id of missing)prepared=(await loader.load(id,prepared)).context;
  return prepared;
}

/* Opening a diagram file/folder authorizes acquisition from this site's
   repository. Reuse approved frozen providers, never file-supplied context.
   A different consumer gets private membership instead of borrowing Canon's ID. */
async function prepareAuthoredTopology(raw,context){
  var page=raw && (raw.page || raw),dependencies=authoredTopologyDependencies(raw);
  var sameConsumer=context && (context.ephemeral===true || page && page.canon && page.canon.id===context.id);
  if(!dependencies.length)return sameConsumer?context:null;
  var scaffold={page:{sections:[{diagram:{nodes:{},rows:[[]]}}]}};
  if(!context)context=await connectTopologyRepository(scaffold);
  else if((!context.catalog || context.catalog.version!==3) && dependencies.some(function(id){return !context.specs.some(function(spec){return spec.page.canon.id===id;});})){
    // A backend snapshot may be complete without a catalog. Only a missing
    // provider needs this site's index; all prior provider bytes stay frozen.
    var repository=await connectTopologyRepository(scaffold);
    context=Object.assign({},context,{catalog:repository.catalog,catalogURL:repository.catalogURL});
  }
  if(!sameConsumer && !context.ephemeral){
    context=JSON.parse(JSON.stringify(context));
    var ids=new Set(context.specs.map(function(spec){return spec.page.canon.id;}));
    ((context.catalog || {}).diagrams || []).forEach(function(entry){ids.add(entry.id);});
    var id='workbench-draft',suffix=2;while(ids.has(id))id='workbench-draft-'+suffix++;
    context.id=id;context.ephemeral=true;
    context.specs.push({page:{canon:{version:1,id:id,kind:'design',owner:'group:default/workbench-draft'},sections:[{diagram:{nodes:{},rows:[[]]}}]}});
  }
  // The auxiliary consumer is already resolvable while each missing dependency
  // loads; the complete authored folder source is validated only after closure.
  return prepareTopologyProposal(raw,context);
}

/* A local draft pins this site's authored-source catalog automatically.
   Its synthetic consumer membership exists only in this auxiliary context;
   saved JSON remains an ordinary local document with topologyImports. */
async function connectTopologyRepository(raw){
  var index=await siteRepositoryIndex();
  if(index.redirected)throw new Error('This Workbench redirects its diagram library elsewhere, so referenced topology is unavailable here.');
  if(!index.raw)throw new Error('This Workbench has no published diagram library, so referenced topology is unavailable here. Local exports still work.');
  var catalog=index.raw,catalogURL=new URL(index.url);
  if(!catalog || catalog.version!==3)throw new Error('Referenced topology is unavailable here: this Workbench publishes a version '+(catalog && catalog.version)+' diagram library, and a version 3 authored-source repository catalog is required.');
  var entries=parseCanonLibrary(catalog),ids=new Set(entries.map(function(entry){return entry.id;})),id='workbench-draft',suffix=2;
  while(ids.has(id))id='workbench-draft-'+suffix++;
  var value=JSON.parse(JSON.stringify(raw)),spec;
  if(value && value.page && typeof value.page==='object' && !Array.isArray(value.page))spec=value;
  else if(value && (value.nodes || value.rows || Object.prototype.hasOwnProperty.call(value,'topologyImports') || Object.prototype.hasOwnProperty.call(value,'topologyExports')))spec={page:{sections:[{diagram:value}]}};
  else spec={page:value};
  if(!spec.page || typeof spec.page!=='object' || Array.isArray(spec.page))throw new Error('Open a valid diagram before connecting the repository catalog.');
  spec.page.canon={version:1,id:id,kind:'design',owner:'group:default/workbench-draft'};
  return {version:1,id:id,ephemeral:true,specs:[spec],catalog:JSON.parse(JSON.stringify(catalog)),catalogURL:catalogURL.href};
}

/* Adopt a later deployment of the index without touching frozen providers:
   every provider already frozen in the session must keep its published
   revision, otherwise the draft has to be reopened. */
function frozenRevisionsUnchanged(context,catalog){
  var before=new Map(((context.catalog || {}).diagrams || []).map(function(entry){return [entry.id,entry.revision];}));
  var after=new Map(((catalog || {}).diagrams || []).map(function(entry){return [entry.id,entry.revision];}));
  return (context.specs || []).every(function(spec){
    var id=spec.page.canon.id;return !before.has(id) || after.get(id)===before.get(id);
  });
}
async function refreshTopologyRepository(context){
  if(!context || !context.catalog || context.catalog.version!==3 || !context.catalogURL)throw new Error('Referenced topology is unavailable. There is no pinned repository catalog to refresh.');
  var index=await siteRepositoryIndex({fresh:true});
  if(index.redirected || !index.raw || index.raw.version!==3)throw new Error('This Workbench no longer publishes a version 3 diagram library.');
  if(index.url!==context.catalogURL)throw new Error('The pinned catalog address differs from this site. Reopen the diagram here.');
  parseCanonLibrary(index.raw);
  if(!frozenRevisionsUnchanged(context,index.raw))throw new Error('A provider frozen in this session was republished. Reopen the diagram to use the latest deployment; your draft has not changed.');
  // Frozen specs are shared by reference, never copied or replaced; only the catalog changes.
  return Object.assign({},context,{catalog:JSON.parse(JSON.stringify(index.raw))});
}

function initWorkbenchLibrary(opts){
  var grid=document.getElementById('welcome-library-grid'),status=document.getElementById('welcome-library-status');
  var reader=document.getElementById('canon-reader'),error=document.getElementById('canon-reader-error');
  var edit=document.getElementById('canon-reader-edit'),title=document.getElementById('canon-reader-title');
  var intro=document.getElementById('canon-reader-intro'),toolbar=intro.querySelector('.canon-reader-toolbar'),headerTitle=document.getElementById('workbench-reader-title');
  var retry=document.getElementById('welcome-library-retry'),readerRetry=document.getElementById('canon-reader-retry');
  var copy=document.getElementById('canon-reader-copy');
  var search=document.getElementById('welcome-library-search'),empty=document.getElementById('welcome-library-empty');
  var specRequests=new Map(),headerObserver=null;
  var pending=null,entries=[],origin='',published=false,ctl=null,tour=null,shortcuts=null,exploreCanvas=null,deepLinks=null,positionChange=null,active=null,sequence=0,current=null,openedBuild=false,backendContext=null;
  function retireHeader(){
    if(title.parentElement!==intro){intro.prepend(toolbar);toolbar.after(title);}
    headerTitle.hidden=true;title.removeAttribute('title');
  }
  function showHeader(){
    title.title=title.textContent;headerTitle.append(title,toolbar);headerTitle.hidden=false;
  }
  function retireViewer(){
    if(headerObserver)headerObserver.disconnect();headerObserver=null;document.body.classList.remove('canon-reader-active');retireHeader();reader.style.removeProperty('--flowview-navigation-top');reader.style.removeProperty('--flowview-navigation-bottom');
    if(positionChange && ctl && ctl.onChange===positionChange.wrapped)ctl.onChange=positionChange.prior;
    positionChange=null;
    if(exploreCanvas)exploreCanvas.destroy();exploreCanvas=null;
    if(shortcuts)shortcuts.destroy();shortcuts=null;
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
        raw={version:1,diagrams:[{id:opts.legacyCanon,spec:context.spec}]};published=true;origin=/*@company:name*/'Company repository snapshot';
      }else if(location.protocol!=='file:'){
        // Browse re-reads the index; the editor shares whatever it read last.
        var index=await siteRepositoryIndex({fresh:true,follow:true});
        if(index.status!==404){
          raw=index.raw;origin='Published repository snapshot';published=true;
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
  function readerOptions(){
    var frozen=entries.slice(),site=new URL(location.href);site.search='';site.hash='';
    return {autoplay:false,handoffHost:'site',siteBaseUrl:site.href,resolveDiagramLink:function(reference){
      var entry=frozen.find(function(item){return item.id===reference.spec;});
      if(!entry || reference.revision && reference.revision!==entry.revision)return null;
      return documentSiteURL(site.href,reference);
    },loadDetail:async function(reference,signal){
      var entry=frozen.find(function(item){return item.id===reference.spec;});
      if(!entry)throw new Error('The detail diagram is not in this published library.');
      if(reference.revision && reference.revision!==entry.revision)throw new Error('The detail revision is no longer in this published library. Reload after deployment.');
      if(signal.aborted)throw new Error('Detail request cancelled.');
      var loaded=await loadSpec(entry);if(signal.aborted)throw new Error('Detail request cancelled.');return loaded.spec;
    }};
  }
  var facets={team:document.getElementById('welcome-library-team'),service:document.getElementById('welcome-library-service'),topic:document.getElementById('welcome-library-topic')};
  var count=document.getElementById('welcome-library-count'),activeFilters=document.getElementById('welcome-library-active'),filterChips=document.getElementById('welcome-library-filter-chips');
  var recentSection=document.getElementById('welcome-library-recent'),recentItems=document.getElementById('welcome-library-recent-items');
  var recentKey='flowview-library-recent-v1:'+new URL('diagrams.json',location.href).href,recent=[],recentLoaded=false;
  function saveRecent(){try{if(recent.length)localStorage.setItem(recentKey,JSON.stringify(recent));else localStorage.removeItem(recentKey);}catch(ignored){}}
  function readRecent(){
    if(!recentLoaded){recentLoaded=true;try{var stored=JSON.parse(localStorage.getItem(recentKey) || '[]');recent=Array.isArray(stored)?stored.filter(function(id){return typeof id==='string';}):[];}catch(ignored){recent=[];}}
    recent=Array.from(new Set(recent)).filter(function(id){return entries.some(function(entry){return entry.id===id;});}).slice(0,6);saveRecent();
  }
  function remember(entry){if(!published || opts.legacyCanon)return;readRecent();recent=[entry.id].concat(recent.filter(function(id){return id!==entry.id;})).slice(0,6);saveRecent();}
  function link(entry,className){
    var el=document.createElement(published?'a':'button');el.className=className;
    if(published)el.href=canonDiagramURL(location.href,entry.id);else el.type='button';
    el.setAttribute('aria-label',entry.title);
    el.addEventListener('click',function(event){
      if(published && (event.button!==0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey))return;
      event.preventDefault();opts.open(entry.id,published);
    });return el;
  }
  function services(entry){
    if(entry.services)return entry.services;
    var names=[];if(entry.spec)FlowCanon.sections(entry.spec).forEach(function(section){Object.values(section.diagram.nodes || {}).forEach(function(node){if(typeof node.title==='string')names.push(node.title);});});return names;
  }
  function matches(entry){
    return (!search.value.trim() || entry.searchText.includes(search.value.trim().toLowerCase())) &&
      (!facets.team.value || entry.canon.owner===facets.team.value) &&
      (!facets.service.value || entry.serviceNames.includes(facets.service.value)) &&
      (!facets.topic.value || (entry.tags || []).includes(facets.topic.value));
  }
  function cards(){
    grid.replaceChildren();
    entries.forEach(function(entry){
      entry.serviceNames=services(entry);entry.searchText=diagramSearchText([entry.title,entry.id,entry.canon.owner,libraryTeamName(entry.canon.owner),entry.description].concat(entry.tags || [],entry.serviceNames));
      var card=document.createElement('article');card.className='canon-library-card';card.dataset.id=entry.id;
      var open=link(entry,'canon-library-open'),preview=libraryPreviewElement(entry.preview);preview.setAttribute('aria-hidden','true');
      var name=document.createElement('strong');name.textContent=entry.title;open.append(preview,name);
      if(entry.description){var description=document.createElement('span');description.className='canon-library-description';description.textContent=entry.description;open.append(description);}
      var metadata=document.createElement('div');metadata.className='canon-library-metadata';
      var owner=document.createElement('span');owner.className='canon-library-owner';owner.textContent=libraryTeamName(entry.canon.owner);owner.title=entry.canon.owner || entry.id;
      var detail=document.createElement('span');detail.className='canon-library-counts';detail.textContent=entry.spec?starterCountLine(entry.spec):['nodes','steps','panels'].map(function(key){return entry.counts[key]+' '+(entry.counts[key]===1?key.slice(0,-1):key);}).join(' · ');
      var tags=document.createElement('div');tags.className='canon-library-tags';
      (entry.tags || []).forEach(function(tag){var chip=document.createElement('button');chip.type='button';chip.className='canon-library-tag';chip.textContent=tag;chip.setAttribute('aria-label','Filter by topic: '+tag);chip.setAttribute('aria-pressed',String(facets.topic.value===tag));chip.addEventListener('click',function(){facets.topic.value=facets.topic.value===tag?'':tag;filterCards();});tags.append(chip);});
      metadata.append(owner,tags,detail);card.append(open,metadata);grid.append(card);
    });
    Object.keys(facets).forEach(function(key){
      var select=facets[key],current=select.value,values=Array.from(new Set(entries.flatMap(function(entry){return key==='team'?[entry.canon.owner]:key==='service'?entry.serviceNames:entry.tags || [];}))).filter(Boolean);
      values.sort(function(a,b){return a.toLowerCase()<b.toLowerCase()?-1:a.toLowerCase()>b.toLowerCase()?1:0;});
      select.replaceChildren();var all=document.createElement('option');all.value='';all.textContent='All '+({team:'teams',service:'services',topic:'topics'}[key]);select.append(all);
      values.forEach(function(value){var option=document.createElement('option');option.value=value;option.textContent=key==='team'?libraryTeamName(value):value;if(key==='team' && values.some(function(other){return other!==value && libraryTeamName(other)===option.textContent;}))option.textContent+=' ('+value+')';option.title=value;select.append(option);});
      select.value=values.includes(current)?current:'';
    });
    if(published)readRecent();filterCards();
  }
  function renderRecent(){
    recentItems.replaceChildren();
    var shown=published?recent.map(function(id){return entries.find(function(entry){return entry.id===id;});}).filter(function(entry){return entry && matches(entry);}):[];
    recentSection.hidden=!shown.length;
    shown.forEach(function(entry){var item=link(entry,'canon-recent-link');var title=document.createElement('span');title.textContent=entry.title;var team=document.createElement('small');team.textContent=libraryTeamName(entry.canon.owner);item.append(title,team);recentItems.append(item);});
  }
  function filterCards(){
    var query=search.value.trim(),shown=0;
    Array.from(grid.children).forEach(function(card,i){card.hidden=!matches(entries[i]);if(!card.hidden)shown++;});
    count.textContent=shown+' of '+entries.length+' diagrams';
    empty.hidden=!entries.length || shown>0;
    empty.textContent=empty.hidden?'':'No diagrams match'+(query?' “'+query+'”':' these filters')+'. Try another keyword or clear your filters.';
    filterChips.replaceChildren();
    var filters=[{label:'Search',value:query,clear:function(){search.value='';}}];
    Object.keys(facets).forEach(function(key){filters.push({label:key[0].toUpperCase()+key.slice(1),value:key==='team' && facets[key].value?libraryTeamName(facets[key].value):facets[key].value,clear:function(){facets[key].value='';}});});
    filters.filter(function(filter){return filter.value;}).forEach(function(filter){var chip=document.createElement('button');chip.type='button';chip.textContent=filter.label+': '+filter.value+' ×';chip.setAttribute('aria-label','Remove '+filter.label.toLowerCase()+' filter: '+filter.value);chip.addEventListener('click',function(){filter.clear();filterCards();search.focus();});filterChips.append(chip);});
    activeFilters.hidden=!filterChips.children.length;
    grid.querySelectorAll('.canon-library-tag').forEach(function(chip){chip.setAttribute('aria-pressed',String(chip.textContent===facets.topic.value));});
    renderRecent();
  }
  search.addEventListener('input',filterCards);Object.values(facets).forEach(function(select){select.addEventListener('change',filterCards);});
  document.getElementById('welcome-library-clear').addEventListener('click',function(){search.value='';Object.values(facets).forEach(function(select){select.value='';});filterCards();search.focus();});
  document.getElementById('welcome-library-clear-recent').addEventListener('click',function(){recent=[];saveRecent();renderRecent();search.focus();});
  ['grid','list'].forEach(function(mode){document.getElementById('welcome-library-'+mode+'-view').addEventListener('click',function(){grid.classList.toggle('canon-library-list',mode==='list');['grid','list'].forEach(function(name){document.getElementById('welcome-library-'+name+'-view').setAttribute('aria-pressed',String(name===mode));});});});
  async function show(screen,id){
    stop();active=screen;var token=sequence;
    pending=null;specRequests.clear();
    status.textContent='Loading diagrams…';retry.hidden=true;empty.hidden=true;readerRetry.hidden=true;
    document.getElementById('canon-reader-origin').textContent='';
    error.hidden=true;error.textContent='';title.textContent='Loading diagram…';
    try{
      await load();if(token!==sequence)return;
      if(screen==='library'){
        cards();status.textContent=origin+' · '+entries.length+' diagram'+(entries.length===1?'':'s')+(entries.length?'':'. Your repository snapshot is empty.');return;
      }
      if(opts.shareable() && !published)throw new Error('No published diagram library is available at this address. Publish the site’s diagrams.json and retry.');
      var selected=entries.find(function(entry){return entry.id===id;});
      // A direct link to anything that is not a published ID returns to
      // Welcome, naming the value; nothing is fetched or opened for it.
      if(!selected && !opts.handoff && opts.unknown){stop();opts.unknown(typeof id==='string'?id:'');return;}
      if(!selected)throw new Error('This diagram is no longer in the published library. Return to Browse diagrams to choose another.');
      var loaded=await loadSpec(selected);if(token!==sequence)return;
      current=Object.assign({},selected,loaded);
      var handoff=opts.handoff && (opts.handoff.error || opts.handoff.id===id)?opts.handoff:null;
      await verifyWorkspaceHandoff(handoff && handoff.sourceRevision?current.source:current.spec,handoff,window.crypto);if(token!==sequence)return;
      if(handoff && handoff.action==='build' && !openedBuild){
        // Validate the exact target against the actual renderer before saving
        // or switching projects. A bad fragment leaves the existing draft intact.
        var checked=normalize(JSON.parse(JSON.stringify(current.spec)));
        ctl=renderPage(reader,checked,current.spec.page.skin,null,readerOptions());
        applyWorkspaceTarget(ctl,checked,handoff.target);retireViewer();
        opts.edit(JSON.parse(JSON.stringify(current.source)),handoff,true,current.topologyContext);openedBuild=true;return;
      }
      title.textContent=current.title;
      document.getElementById('canon-reader-origin').textContent=origin+(handoff?' · Opened from '+(handoff.entity || 'Backstage'):'')+' · Reading does not change your draft.';
      var spec=JSON.parse(JSON.stringify(current.spec));
      var page=normalize(spec);
      ctl=renderPage(reader,page,spec.page.skin,null,readerOptions());
      var remembered=opts.position && opts.position();
      if(remembered){
        try{applyWorkspaceTarget(ctl,page,remembered);}
        catch(ex){
          // The published story may have changed while this history entry was
          // away. Rebuild once so a partially applied stale view/path cannot
          // replace the authored opening state.
          ctl.destroy();reader.replaceChildren();ctl=renderPage(reader,page,spec.page.skin,null,readerOptions());
          if(opts.savePosition)opts.savePosition(null);
        }
      }
      edit.disabled=false;copy.disabled=!published;
      deepLinks=wireDeepLinks(ctl,window,null,{history:false,linkBase:canonDiagramURL(location.href,current.id)});
      if(handoff)applyWorkspaceTarget(ctl,page,handoff.target);
      edit.textContent=handoff && handoff.action==='build'?'Build with Claude →':'Edit in Workbench →';
      document.body.classList.add('canon-reader-active');
      showHeader();
      var header=document.querySelector('.workbench-header');
      function headerSize(){var height=header?Math.ceil(header.getBoundingClientRect().height):0;reader.style.setProperty('--flowview-navigation-top',height+'px');var nav=reader.querySelector('.explore-navigation');if(nav)reader.style.setProperty('--flowview-navigation-bottom',Math.ceil(height+nav.getBoundingClientRect().height+8)+'px');}
      headerSize();if(header){headerObserver=new ResizeObserver(headerSize);headerObserver.observe(header);}
      exploreCanvas=initViewerExploreCanvas(ctl,reader,{action:[edit,copy],singleShareAction:true});
      tour=wireTour(ctl,reader,window,tourUsableConfig(page.tour)?page.tour:TOUR_DEFAULT_CONFIG);
      shortcuts=wireReaderShortcuts(ctl,reader,window);
      if(opts.savePosition){
        var priorChange=ctl.onChange,wrapped=function(){
          if(priorChange)priorChange.apply(ctl,arguments);
          if(!ctl.suppressFragmentWrites)opts.savePosition(canonReaderTarget(ctl));
        };
        positionChange={prior:priorChange,wrapped:wrapped};ctl.onChange=wrapped;
      }
      remember(current);
    }catch(ex){
      if(token!==sequence)return;
      current=null;edit.disabled=true;copy.disabled=true;retireViewer();reader.replaceChildren();
      if(screen==='library'){grid.replaceChildren();recentSection.hidden=true;count.textContent='';status.textContent='Could not load published diagrams. '+ex.message;retry.hidden=false;}
      else {title.textContent='Diagram unavailable';error.textContent=ex.message;error.hidden=false;readerRetry.hidden=false;}
    }
  }
  bindCopyControl(window,copy,function(){return deepLinks?deepLinks.currentURL():canonDiagramURL(location.href,current.id);});
  function refresh(){pending=null;specRequests.clear();show(active,opts.selected());}
  retry.addEventListener('click',refresh);readerRetry.addEventListener('click',refresh);
  edit.addEventListener('click',function(){
    if(!current)return;
    try{
      var target=canonReaderTarget(ctl);
      if(opts.savePosition)opts.savePosition(target);
      opts.edit(JSON.parse(JSON.stringify(current.source)),opts.handoff && opts.handoff.id===current.id?opts.handoff:null,false,current.topologyContext,target);
    }
    catch(ex){error.textContent=ex.message;error.hidden=false;}
  });
  window.addEventListener('pagehide',function(){sequence++;retireViewer();});
  window.addEventListener('pageshow',function(event){if(event.persisted && active)show(active,opts.selected());});
  return {show:show,hide:stop};
}
