/* Dialog owns drafts only. Provider acquisition is explicit and revision locked;
   the shared headless planner and builder session own the one source commit. */
function initTopologyPicker(opts){
  var doc=opts.document,dialog=doc.getElementById('topology-picker');if(!dialog)return null;
  var life=createWorkbenchLifetime(),el=function(id){return doc.getElementById('topology-'+id);};
  var provider=el('provider'),section=el('section'),exportChoice=el('export'),namespace=el('namespace'),destination=el('destination');
  var snapshot=null,loader=null,loaderKey=null,catalogContext=null,loaded=null,records=[],nodes=new Set(),edges=new Set(),invalid=false,generation=0,plan=null;
  function message(value){el('status').textContent=value || '';}
  function same(){var now=opts.context();return snapshot && !now.error && snapshot.project===now.project && snapshot.text===now.text && snapshot.section===now.section && snapshot.chapter===now.chapter;}
  function selectedExport(){var record=records[Number(section.value)];return record && record.diagram.topologyExports[exportChoice.value];}
  function reference(){return {spec:provider.value,export:exportChoice.value,as:namespace.value.trim(),nodes:Array.from(nodes),edges:Array.from(edges)};}
  function refresh(){
    if(!dialog.open)return;
    if(!same())invalid=true;
    plan=null;el('add').disabled=true;
    if(invalid){message('The source or project changed, or its destination changed. Close and reopen the picker.');return;}
    if(!loaded || !selectedExport())return;
    var ref=reference(),exp=selectedExport();
    // Select-all uses the stable full-export shorthand, not an accidental pin.
    if(exp.nodes.length===nodes.size && exp.edges.length===edges.size){delete ref.nodes;delete ref.edges;}
    plan=planAddTopologyImport(snapshot.text,snapshot.raw,Number(destination.value),ref,loaded.context);
    message(plan.error || nodes.size+' nodes · '+edges.size+' connections. A floating child block will be added; provider internals stay read only.');
    el('add').disabled=!!plan.error;
  }
  function options(select,items){
    select.replaceChildren();items.forEach(function(item){var option=doc.createElement('option');option.value=item.value;option.textContent=item.label;select.appendChild(option);});
  }
  function contents(){
    var exp=selectedExport();el('nodes').replaceChildren();el('edges').replaceChildren();
    if(!exp){refresh();return;}
    var resolvedRecord=FlowCanon.sections(loaded.resolved)[records[Number(section.value)].resolvedIndex];
    var diagram=resolvedRecord.diagram;
    function checkbox(container,key,kind,label){
      var row=doc.createElement('label'),input=doc.createElement('input'),copy=doc.createElement('span');
      input.type='checkbox';input.value=key;input.dataset.kind=kind;input.checked=(kind==='nodes'?nodes:edges).has(key);
      copy.textContent=label;row.append(input,copy);container.appendChild(row);
    }
    exp.nodes.forEach(function(id){checkbox(el('nodes'),id,'nodes',(diagram.nodes[id].title || id)+' · '+id);});
    exp.edges.forEach(function(key){
      var edge=diagram.edges.find(function(e){return e.from+'->'+e.to===key;});
      checkbox(el('edges'),key,'edges',key+(edge.label?' · '+edge.label:''));
    });
    el('contents').hidden=false;refresh();
  }
  function chooseExport(){
    var exp=selectedExport();nodes=new Set(exp?exp.nodes:[]);edges=new Set(exp?exp.edges:[]);
    var rec=specSectionPaths(snapshot.raw)[Number(destination.value)],diagram=rec && specValueAt(snapshot.raw,rec.diagram);
    namespace.value=topologyNamespace(diagram || {},provider.value);contents();
  }
  function chooseSection(){
    var record=records[Number(section.value)];
    options(exportChoice,Object.keys(record?record.diagram.topologyExports:{}).map(function(name){return {value:name,label:name};}));chooseExport();
  }
  async function chooseProvider(){
    var token=++generation;loaded=null;plan=null;el('add').disabled=true;el('contents').hidden=true;el('owner').textContent='';
    options(section,[]);options(exportChoice,[]);
    if(!provider.value){message('No provider diagrams match.');return;}
    message('Loading approved provider and its dependencies…');
    try{
      var result=await loader.load(provider.value,catalogContext);
      if(!life.alive() || token!==generation || !dialog.open)return;
      if(!same()){invalid=true;refresh();return;}
      loaded=result;catalogContext=result.context;
      records=FlowCanon.sections(result.source).map(function(record,index){return Object.assign({},record,{resolvedIndex:index});}).filter(function(record){return Object.keys(record.diagram.topologyExports || {}).length;});
      options(section,records.map(function(record,index){return {value:String(index),label:record.heading || record.id || 'Section '+(record.resolvedIndex+1)};}));
      var entry=loader.entries.find(function(item){return item.id===provider.value;});
      el('owner').textContent=entry.id+' · '+(entry.canon.owner || 'Owner not supplied')+' · frozen revision '+entry.revision.slice(0,12);
      if(!records.length){message('This provider has no named topology exports. Its private structure cannot be imported.');return;}
      chooseSection();
    }catch(ex){if(life.alive() && token===generation && dialog.open)message(ex.message);}
  }
  function browse(){
    var query=el('search').value.trim().toLowerCase(),old=provider.value;
    options(provider,loader.entries.filter(function(entry){return entry.id!==(catalogContext && catalogContext.id) && [entry.title,entry.id,entry.canon.owner].join(' ').toLowerCase().includes(query);}).map(function(entry){return {value:entry.id,label:entry.title+' · '+entry.id};}));
    if(Array.from(provider.options).some(function(option){return option.value===old;}))provider.value=old;
    chooseProvider();
  }
  function close(focus){generation++;if(dialog.open)dialog.close();snapshot=null;loaded=null;plan=null;el('connect').disabled=false;if(focus!==false)doc.getElementById('diagram-add').focus({preventScroll:true});}
  function open(){
    close(false);snapshot=opts.context();invalid=false;el('contents').hidden=true;el('add').disabled=true;el('connect').disabled=false;el('owner').textContent='';
    options(destination,(snapshot.sections || []).filter(function(item){var rec=specSectionPaths(snapshot.raw)[item.section];return !!specValueAt(snapshot.raw,rec.diagram);}).map(function(item){return {value:String(item.section),label:item.label};}));
    destination.value=String(snapshot.section);el('search').value='';options(provider,[]);options(section,[]);options(exportChoice,[]);
    if(opts.pause)opts.pause();dialog.showModal();el('search').focus();
    try{
      if(snapshot.error)throw Error(snapshot.error);
      var key=snapshot.topologyContext?JSON.stringify([snapshot.project,snapshot.topologyContext.catalogURL,snapshot.topologyContext.catalog]):JSON.stringify([snapshot.project,'local-draft']);
      if(key!==loaderKey){loader=null;loaderKey=key;}
      catalogContext=snapshot.topologyContext || (loader?catalogContext:null);
      el('connect').hidden=!!catalogContext;
      el('search').disabled=!catalogContext;
      provider.disabled=!catalogContext;
      if(!catalogContext){
        message('Referenced topology is unavailable for this local draft until you connect the repository catalog. Connect explicitly to pin the current approved provider revision for this editing session.');
        // Disabling the initially focused search field moves focus outside the
        // modal in Chromium. Keep Escape owned by this dialog so closing the
        // picker cannot also clear the Workbench's current selection.
        el('connect').focus({preventScroll:true});return;
      }
      if(!loader)loader=createTopologyCatalogLoader(catalogContext);
      browse();
    }catch(ex){message(ex.message);}
  }
  life.listen(el('connect'),'click',async function(){
    if(!snapshot || invalid || !same() || typeof opts.connect!=='function')return;
    var token=++generation;el('connect').disabled=true;message('Connecting to the deployed repository catalog…');
    try{
      var nextContext=await opts.connect(snapshot.raw);
      if(!life.alive() || token!==generation || !dialog.open)return;
      if(!same()){invalid=true;refresh();return;}
      catalogContext=nextContext;
      loaderKey=JSON.stringify([snapshot.project,'local-draft']);
      loader=createTopologyCatalogLoader(catalogContext);el('connect').hidden=true;el('search').disabled=false;provider.disabled=false;el('search').focus();browse();
    }catch(ex){if(life.alive() && token===generation && dialog.open)message(ex.message);}
    finally{if(life.alive() && token===generation && dialog.open)el('connect').disabled=false;}
  });
  life.listen(el('search'),'input',function(){if(loader)browse();});
  life.listen(provider,'change',chooseProvider);life.listen(section,'change',chooseSection);life.listen(exportChoice,'change',chooseExport);
  life.listen(namespace,'input',refresh);life.listen(destination,'change',refresh);
  life.listen(el('all'),'click',function(){var exp=selectedExport();if(exp){nodes=new Set(exp.nodes);edges=new Set(exp.edges);contents();}});
  life.listen(el('contents'),'change',function(event){
    var input=event.target;if(input.type!=='checkbox')return;
    var selected=input.dataset.kind==='nodes'?nodes:edges;
    if(input.checked)selected.add(input.value);else selected.delete(input.value);
    // Do not silently change the user's other selections: the planner explains
    // an open endpoint and disables insertion until the subset is closed.
    refresh();
  });
  life.listen(el('add'),'click',function(){refresh();if(!plan || plan.error || el('add').disabled)return;
    if(opts.insert(plan,snapshot,loaded.context))close();else message(plan.error || 'The source or project changed. Close and reopen the picker.');
  });
  life.listen(el('close'),'click',function(){close();});life.listen(el('cancel'),'click',function(){close();});
  life.listen(dialog,'cancel',function(event){event.preventDefault();close();});
  life.listen(dialog,'keydown',function(event){event.stopPropagation();});life.listen(dialog,'click',function(event){event.stopPropagation();});
  life.listen(opts.src,'input',refresh);life.listen(window,'popstate',function(){close(false);});
  return {open:open,close:close,invalidate:function(){if(dialog.open){invalid=true;refresh();}},destroy:function(){life.destroy();close(false);loader=null;}};
}
