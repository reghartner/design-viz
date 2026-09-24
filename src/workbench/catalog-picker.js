/* One chooser for project creation and section insertion. The builder owns the
   commit; this dialog owns selection, preview and cancellation only. */
function initCatalogGraphPicker(opts){
  var doc=opts.document,dialog=doc.getElementById('catalog-picker');if(!dialog)return null;
  var life=createWorkbenchLifetime(),el=function(id){return doc.getElementById('catalog-'+id);};
  var search=el('search'),list=el('services'),connect=el('edges'),submit=el('add');
  var registry=null,selected=new Set(),snapshot=null,mode=null,opener=null,onCreated=null,invalid=false;
  function message(text){el('error').textContent=text || '';el('error').hidden=!text;}
  function services(){return registry ? registry.services : [];}
  function filtered(){
    var query=search.value.trim().toLowerCase();
    return services().filter(function(s){return [s.title,s.entityRef,s.owner].join(' ').toLowerCase().includes(query);});
  }
  function same(){
    var current=opts.context();
    return snapshot && current.text===snapshot.text && (mode==='new' || (!current.error && current.section===snapshot.section));
  }
  function paintSummary(){
    if(!dialog.open)return;
    if(!same())invalid=true;
    var seed,error='';
    if(invalid)error='The source or destination changed. Close and reopen the catalog picker.';
    else if(selected.size){
      try{seed=catalogGraphSeed(registry,Array.from(selected),connect.checked,mode==='new'?null:snapshot.diagram);}
      catch(ex){error=ex.message;}
    }
    el('count').textContent=selected.size+' selected · '+filtered().length+' of '+services().length+' services shown';
    el('preview').textContent=seed ? seed.created+' new nodes · '+seed.reused+' already on the diagram · '+seed.edges+' new connections' : 'Choose the services that belong in this diagram.';
    if(seed && !seed.created && !seed.edges && !seed.placed)error='Those services and connections are already in this diagram.';
    if(seed && connect.checked && !seed.edges && !error)el('preview').textContent+=' · No new relationships between these services.';
    submit.disabled=!!error || !seed;
    message(error);
  }
  function render(){
    list.replaceChildren();
    filtered().forEach(function(service){
      var label=doc.createElement('label');label.className='catalog-service';
      var checkbox=doc.createElement('input');checkbox.type='checkbox';checkbox.value=service.entityRef;checkbox.checked=selected.has(service.entityRef);
      var copy=doc.createElement('span'),title=doc.createElement('strong'),ref=doc.createElement('small'),owner=doc.createElement('small');
      title.textContent=service.title || service.entityRef;ref.textContent=service.entityRef;owner.textContent=service.owner || 'Owner not supplied';
      copy.append(title,ref,owner);label.append(checkbox,copy);list.appendChild(label);
    });
    el('empty').hidden=!!list.children.length;
    el('empty').textContent=services().length ? 'No services match your search.' : 'No services loaded. This workbench reads catalog.json beside the editor. You can also paste a catalog snapshot below.';
    el('source').textContent=registry ? registry.source || 'Imported catalog snapshot' : 'Waiting for a bundled or imported catalog';
    el('select-visible').disabled=!list.children.length;
    paintSummary();
  }
  function close(focus){
    if(dialog.open)dialog.close();snapshot=null;mode=null;onCreated=null;selected.clear();
    if(focus!==false && opener && opener.isConnected)opener.focus({preventScroll:true});
  }
  function refresh(){
    if(!dialog.open)return;
    var current=opts.catalog && opts.catalog();
    if(current!==registry){registry=current;selected.clear();render();}
    else paintSummary();
  }
  function open(options){
    close(false);mode=options && options.newProject?'new':'add';onCreated=options && options.onCreated;
    snapshot=opts.context();invalid=false;
    if(mode==='add' && (snapshot.error || !snapshot.diagram)){opts.error(snapshot.error || 'Choose a diagram first.');mode=null;return;}
    opener=doc.activeElement;if(opts.pause)opts.pause();
    registry=opts.catalog && opts.catalog();search.value='';connect.checked=true;el('json').value='';
    el('import-error').textContent='';el('import').open=false;
    el('title-row').hidden=mode!=='new';el('project-title').value='Service landscape';
    el('destination').textContent=mode==='new'?'Create a project from your company’s services.':'Add to '+snapshot.label;
    submit.textContent=mode==='new'?'Create diagram':'Add selected services';
    dialog.showModal();render();search.focus({preventScroll:true});
  }
  life.listen(search,'input',render);
  life.listen(list,'change',function(ev){
    if(ev.target.type!=='checkbox')return;
    if(ev.target.checked)selected.add(ev.target.value);else selected.delete(ev.target.value);
    paintSummary();
  });
  life.listen(connect,'change',paintSummary);
  life.listen(el('select-visible'),'click',function(){filtered().forEach(function(s){selected.add(s.entityRef);});render();});
  life.listen(el('clear'),'click',function(){selected.clear();render();});
  life.listen(el('close'),'click',function(){close();});
  life.listen(dialog,'cancel',function(ev){ev.preventDefault();close();});
  life.listen(dialog,'keydown',function(ev){ev.stopPropagation();});
  life.listen(dialog,'click',function(ev){ev.stopPropagation();});
  life.listen(opts.src,'input',refresh);
  life.listen(window,'popstate',function(){close(false);});
  life.listen(el('load'),'click',function(){
    try{
      var raw=FlowCanon.catalog(JSON.parse(el('json').value));
      if(!opts.importCatalog)throw new Error('Catalog import is unavailable.');
      opts.importCatalog(raw);refresh();el('import-error').textContent='';el('import').open=false;
    }catch(ex){el('import-error').textContent=ex.message;}
  });
  life.listen(submit,'click',function(){
    paintSummary();if(submit.disabled)return;
    var savedMode=mode,callback=onCreated,refs=Array.from(selected),addEdges=connect.checked;
    try{
      if(savedMode==='new'){
        var raw=welcomeBlankSpec(el('project-title').value.trim() || 'Service landscape');
        raw.page.blocks[0].heading='Services';raw.page.blocks[0].diagram=catalogGraphSeed(registry,refs,addEdges).diagram;
        if(raw.page.blocks[0].diagram.edges.length)raw.page.protocols={catalog:catalogGraphProtocol()};
        if(!opts.create(raw))throw new Error('Could not open the project.');
      }else if(!opts.insert(registry,refs,addEdges))throw new Error('Could not add services. Close the picker and check the diagram.');
      close(savedMode!=='new');if(savedMode==='new' && callback)callback();
    }catch(ex){message(ex.message);}
  });
  return {open:open,close:close,refresh:refresh,invalidate:function(){if(dialog.open){invalid=true;paintSummary();}},
    destroy:function(){life.destroy();close(false);list.replaceChildren();}};
}
