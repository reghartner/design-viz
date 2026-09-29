/* Shared collection controls. Panel modules own declarations and operation
   semantics; the inspector owns sparse assignments, history and form lifetime. */
function panelCollectionCopy(value){return Object.assign(Object.create(null),value || {});}
function panelKeyedStateChange(current,id,key,value){
  if(current!==undefined && !panelObject(current))return {error:'Repair this collection in Advanced JSON first.'};
  var next=panelCollectionCopy(current);
  if(key===null){if(value===undefined)delete next[id];else next[id]=value;}
  else{
    if(panelOwn(next,id) && !panelObject(next[id]))return {error:'Restore this item to its default before editing its fields.'};
    var item=panelCollectionCopy(next[id]);
    if(value===undefined)delete item[key];else item[key]=value;
    if(Object.keys(item).length)next[id]=item;else delete next[id];
  }
  return {value:next};
}

function createPanelKeyedStateComposer(context,options,entries){
  var current=options.value;
  if(current!==undefined && !panelObject(current))return null;
  var doc=context.document,controls=context.controls,wrap=doc.createElement('div');wrap.className='rowsedit';
  function change(id,key,value){
    var result=panelKeyedStateChange(current,id,key,value);
    if(result.error){context.error(result.error);return false;}
    return options.commit(result.value);
  }
  entries.forEach(function(entry){
    var value=panelOwn(current,entry.id)?current[entry.id]:undefined;
    var card=doc.createElement('div');card.className='panel-collection-item';
    var head=doc.createElement('div');head.className='panel-collection-heading';
    var title=doc.createElement('b');title.textContent=entry.label || entry.id;head.appendChild(title);
    var reset=controls.action('Use default',function(){return change(entry.id,null,undefined);});reset.setAttribute('aria-label',(entry.label || entry.id)+' use default');head.appendChild(reset);
    if(entry.scalar){var clear=controls.action('No data',function(){return change(entry.id,null,null);});clear.setAttribute('aria-label',(entry.label || entry.id)+' no data');head.appendChild(clear);}
    card.appendChild(head);
    if(entry.scalar && (value===undefined || value===null || typeof value==='number')){
      var number=controls.number(value,function(next){
        if(next!==null && next<0){context.error('Enter a non-negative value.');return false;}
        return change(entry.id,null,next===null?undefined:next);
      });number.setAttribute('aria-label',(entry.label || entry.id)+' value');
      card.appendChild(controls.row(entry.unit?'Value ('+entry.unit+')':'Value',number));
    }else if(entry.scalar || value!==undefined && !panelObject(value)){
      var warning=doc.createElement('p');warning.className='fnote';warning.textContent='This item has an unsupported value. Keep it in Advanced JSON or choose Use default.';card.appendChild(warning);
    }else entry.fields.forEach(function(field){
      var cur=panelOwn(value,field.key)?value[field.key]:undefined;
      var commit=function(next){return change(entry.id,field.key,next==null?undefined:next);};
      var input=field.options?controls.select(field.options,cur,commit,true):controls.text(cur,commit);
      if(field.options && input.options.length)input.options[0].textContent='Use default';
      input.setAttribute('aria-label',(entry.label || entry.id)+' '+field.label);
      card.appendChild(controls.row(field.label,input));
    });
    wrap.appendChild(card);
  });
  if(!entries.length){var empty=doc.createElement('p');empty.className='fnote';empty.textContent='Add declarations to this panel first.';wrap.appendChild(empty);}
  return wrap;
}

/* A table's UI rows are projections, never the stored row objects. Keep a
   private source index through reorder/rename so unknown fields and scalar
   types survive editing a different column. No projection keys are saved. */
function panelTableEditorRows(rows,columns){
  if(rows!==undefined && (!Array.isArray(rows) || rows.some(function(row){return !panelObject(row) || !panelObject(row.cells); })))return null;
  return (rows || []).map(function(row,index){
    var item={id:row.id,status:row.status,_sourceIndex:index};
    columns.forEach(function(col,i){
      var value=panelOwn(row.cells,col.id)?row.cells[col.id]:undefined;
      item['type'+i]=value===undefined?'unset':value===null?'null':['string','number','boolean'].indexOf(typeof value)>=0?typeof value:'advanced';
      item['value'+i]=value===undefined || value===null?'':typeof value==='object'?JSON.stringify(value):String(value);
    });return item;
  });
}
function panelTableEditorCollect(items,original,columns){
  var seen=Object.create(null),rows=[];
  for(var i=0;i<items.length;i++){
    var item=items[i];if(seen[item.id])return {error:'Each row needs a unique ID.'};seen[item.id]=true;
    var base=Array.isArray(original) && original[item._sourceIndex],row=panelCollectionCopy(base);
    row.id=item.id;if(item.status===undefined)delete row.status;else row.status=item.status;
    var cells=panelCollectionCopy(base && base.cells);
    for(var j=0;j<columns.length;j++){
      var id=columns[j].id,type=item['type'+j] || 'unset',raw=item['value'+j] || '';
      if(type==='unset'){delete cells[id];continue;}
      if(type==='null'){cells[id]=null;continue;}
      if(type==='advanced'){
        if(!base || !panelOwn(base.cells,id) || JSON.stringify(base.cells[id])!==raw)return {error:'Edit the advanced value for '+id+' in Advanced JSON.'};
        continue;
      }
      if(type==='number'){
        if(raw==='' || !isFinite(Number(raw)))return {error:id+' needs a finite number.'};cells[id]=Number(raw);
      }else if(type==='boolean'){
        if(raw!=='true' && raw!=='false')return {error:id+' must be true or false.'};cells[id]=raw==='true';
      }else if(type==='string'){
        // The shared row editor trims input. Keep existing surrounding spaces
        // when the user changed another control, including row order/status.
        cells[id]=base && typeof base.cells[id]==='string' && base.cells[id].trim()===raw?base.cells[id]:raw;
      }else return {error:'Choose a supported cell type.'};
    }
    row.cells=cells;rows.push(row);
  }
  return {value:rows};
}

function createPanelTableComposer(context,options){
  var columns=softwarePanelItems(options.panel),rows=panelTableEditorRows(options.value,columns);
  if(rows===null)return null;
  var cols=[{k:'id',label:'Row ID',req:true},{k:'status',label:'Change',kind:'enum',options:TABLE_STATUSES}];
  columns.forEach(function(col,i){
    cols.push({k:'type'+i,label:(col.label || col.id)+' type',kind:'enum',options:['unset','string','number','boolean','null','advanced']});
    cols.push({k:'value'+i,label:col.label || col.id});
  });
  return context.controls.rows('Rows',rows,{cols:cols,max:12,wide:true},{raw:false,commitValue:options.commit,
    collect:function(items){return panelTableEditorCollect(items,options.value,columns);}});
}

function panelLogEditorCollect(items,original){
  return {value:items.map(function(item){
    var base=Array.isArray(original)?original[item._sourceIndex]:undefined;
    if(typeof base==='string' && !item.tag && base.trim()===(item.text || ''))return base;
    var value=panelCollectionCopy(panelObject(base)?base:{});
    if(item.tag===undefined)delete value.tag;else value.tag=item.tag;
    value.text=panelObject(base) && base.text!=null && String(base.text).trim()===(item.text || '')?base.text:(item.text || '');return value;
  })};
}
function createPanelLogComposer(context,options){
  var current=options.value;
  if(current!==undefined && (!Array.isArray(current) || current.some(function(item){return typeof item!=='string' && !panelObject(item);})))return null;
  var rows=(current || []).map(function(item,index){return {tag:item && item.tag,text:typeof item==='string'?item:item.text,_sourceIndex:index};});
  var tags=Object.keys(options.panel.tags || {});
  return context.controls.rows('Events',rows,{cols:[{k:'tag',kind:'enum',options:tags},{k:'text',req:true}]},
    {raw:false,commitValue:options.commit,collect:function(items){return panelLogEditorCollect(items,current);}});
}
