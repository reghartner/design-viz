/* Active-section graph-node layers. Placement order is authored rows (including
   stack order), then floats, then any unplaced definitions in source order. */
function builderLayerNodes(diagram,query){
  var d=diagram && typeof diagram==='object'?diagram:{},nodes=d.nodes && typeof d.nodes==='object' && !Array.isArray(d.nodes)?d.nodes:{};
  var ordered=[],seen=Object.create(null),placements=Object.create(null);
  function add(id,placement){
    if(typeof id!=='string' || seen[id] || !Object.prototype.hasOwnProperty.call(nodes,id))return;
    seen[id]=true;placements[id]=placement;ordered.push(id);
  }
  (Array.isArray(d.rows)?d.rows:[]).forEach(function(row,ri){
    if(!Array.isArray(row))return;
    row.forEach(function(slot,si){(Array.isArray(slot)?slot:[slot]).forEach(function(id,stack){add(id,{kind:'row',row:ri,slot:si,stack:stack});});});
  });
  (Array.isArray(d.floats)?d.floats:[]).forEach(function(f,index){if(f)add(f.id,{kind:'float',index:index,free:positionedFloat(f)});});
  Object.keys(nodes).forEach(function(id){add(id,{kind:'unplaced'});});
  var terms=String(query || '').toLowerCase().trim().split(/\s+/).filter(Boolean);
  return ordered.map(function(id){
    var node=nodes[id] && typeof nodes[id]==='object' && !Array.isArray(nodes[id])?nodes[id]:{};
    var title=typeof node.title==='string' && node.title.trim()?node.title:typeof node.text==='string' && node.text.trim()?node.text.split(/\n/)[0].slice(0,80):id;
    return {id:id,title:title,locked:node.locked===true,placement:placements[id]};
  }).filter(function(item){var hay=(item.title+' '+item.id).toLowerCase();return terms.every(function(term){return hay.indexOf(term)>=0;});});
}

function createBuilderLayers(opts){
  var doc=opts.document,mount=doc.getElementById('editor-layers'),search=doc.getElementById('layers-search'),list=doc.getElementById('layers-list'),status=doc.getElementById('layers-status');
  if(!mount || !search || !list || !status)return {sync:function(){},destroy:function(){}};
  var life=createWorkbenchLifetime(),renderLife=createWorkbenchLifetime();
  function reset(){renderLife.destroy();renderLife=createWorkbenchLifetime();list.replaceChildren();}
  function empty(text){reset();var p=doc.createElement('p');p.className='editor-empty layers-empty';p.textContent=text;list.appendChild(p);status.textContent=text;}
  function placementText(p){return p.kind==='row'?'Row '+(p.row+1)+(p.stack?' · stack '+(p.stack+1):''):p.kind==='float'?(p.free?'Free placed':'Auto float'):'Not placed';}
  function sync(){
    var snapshot=opts.session.snapshot(),section=opts.section(),record=!snapshot.error && specSectionPaths(snapshot.raw)[section],diagram=record && specValueAt(snapshot.raw,record.diagram);
    if(snapshot.error){empty('Fix the JSON to show layers.');return;}
    if(!record){empty('Choose a section to show its graph nodes.');return;}
    if(!diagram){empty('This section has no diagram. Add a diagram or choose another section.');return;}
    var items=builderLayerNodes(diagram,search.value),selected=opts.selection(),selectedItems=Array.isArray(selected)?selected:selected?[selected]:[];
    reset();
    if(!items.length){empty(Object.keys(diagram.nodes || {}).length?'No nodes match this filter.':'This diagram has no graph nodes yet.');return;}
    var rowHeaders=Object.create(null);
    items.forEach(function(item){
      if(item.placement.kind==='row' && !rowHeaders[item.placement.row]){
        rowHeaders[item.placement.row]=true;
        var ids=builderFlatRowIds([diagram.rows[item.placement.row]]).filter(function(id){return diagram.nodes && diagram.nodes[id];});
        var allLocked=ids.length && ids.every(function(id){return builderNodePositionLocked(diagram,id);});
        var header=doc.createElement('div');header.className='layer-row-header';
        var label=doc.createElement('strong');label.textContent='Row '+(item.placement.row+1);
        var rowLock=doc.createElement('button');rowLock.type='button';rowLock.className='layer-row-lock';rowLock.textContent=allLocked?'Unlock row':'Lock row';
        rowLock.setAttribute('aria-label',(allLocked?'Unlock all nodes in ':'Lock all nodes in ')+'row '+(item.placement.row+1));rowLock.title=allLocked?'Unlocking keeps the nodes in their pinned positions.':'Pins every node in this row as one undoable edit.';
        renderLife.listen(rowLock,'click',function(){opts.lockMany(section,ids,!allLocked);});header.append(label,rowLock);list.appendChild(header);
      }
      var selectedHere=selectedItems.some(function(target){return target && target.kind==='node' && target.section===section && target.id===item.id;});
      var row=doc.createElement('div');row.className='layer-row'+(selectedHere?' is-selected':'');
      var choose=doc.createElement('button');choose.type='button';choose.className='layer-select';choose.setAttribute('aria-current',row.className.indexOf('is-selected')>=0?'true':'false');
      var title=doc.createElement('span');title.className='layer-title';title.textContent=item.title;
      var meta=doc.createElement('span');meta.className='layer-meta';meta.textContent=item.id+' · '+placementText(item.placement);
      choose.append(title,meta);renderLife.listen(choose,'click',function(){opts.select({kind:'node',section:section,id:item.id});});
      var lock=doc.createElement('button');lock.type='button';lock.className='layer-lock';lock.textContent=item.locked?'Locked':'Unlocked';lock.setAttribute('aria-pressed',String(item.locked));
      lock.setAttribute('aria-label',(item.locked?'Unlock ':'Lock ')+item.title+' position');lock.title='Locks this graph node’s position only';
      renderLife.listen(lock,'click',function(){opts.lock(section,item.id,!item.locked);});
      row.append(choose,lock);list.appendChild(row);
    });
    status.textContent=items.length+' graph node'+(items.length===1?'':'s')+(search.value?' shown':'')+'. Position locks do not prevent editing or deletion.';
  }
  life.listen(search,'input',sync);
  life.listen(search,'keydown',function(ev){var first=list.querySelector('.layer-select');if((ev.key==='ArrowDown' || ev.key==='Enter') && first){ev.preventDefault();first.focus();}});
  life.listen(opts.source,'input',sync);
  life.listen(opts.view,'workbench-view-section',function(){sync();});
  sync();
  return {sync:sync,destroy:function(){renderLife.destroy();life.destroy();}};
}
