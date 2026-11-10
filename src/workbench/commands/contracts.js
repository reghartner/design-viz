/* Contract-block authoring; raw addresses preserve page wrappers and tabs. */
/* options.grid (#1304): a new grid table (columns plus per-row cells) instead of a k/v/g block. */
function planAddContract(text,raw,section,copy,options){
  var rec=specSectionPaths(raw)[section],sec=rec && specValueAt(raw,rec.section);
  if(!rec || !rec.section.length || !sec)return {error:'Choose a page section for the contract block.'};
  if(sec.contracts!=null && !Array.isArray(sec.contracts))return {error:'Fix contracts to be an array before adding a block.'};
  var taken=Object.create(null);
  sectionContracts(sec).forEach(function(c){if(c.value.id)taken[c.value.id]=true;});
  var grid=!copy && options && options.grid;
  var value=copy?builderClone(copy):grid?{title:'New grid',span:12,fieldLabel:'Row',
    columns:[{id:'column-1',label:'Column 1'},{id:'column-2',label:'Column 2'}],fields:[{k:'Row 1',cells:{}}]}:
    {title:'New contract',span:12,fields:[{k:'event',v:'button_press',g:'What this field means.'}]};
  value.id=builderUniqueKey(taken,copy && copy.id?copy.id+'-copy':grid?'grid':'contract');
  if(copy)value.title=(value.title || 'Contract')+' (copy)';
  var plan=Array.isArray(sec.contracts)?jsonInsertMember(text,rec.section.concat(['contracts']),null,JSON.stringify(value,null,2)):
    planSetField(text,raw,rec.section,'contracts',JSON.stringify([value],null,2));
  if(!plan || plan.error)return plan || {error:'Could not insert the contract block.'};
  plan.card=String((sec.contracts || []).length);plan.kind='contract';return plan;
}
function planMoveContract(text,raw,target,delta){
  var rec=specSectionPaths(raw)[target.section],sec=rec && specValueAt(raw,rec.section);
  if(!sec)return {error:'Contract section not found.'};
  var entries=sectionContracts(sec),key=target.card==null?'legacy':String(target.card);
  var index=entries.findIndex(function(c){return c.key===key;}),next=index+delta;
  if(index<0 || next<0 || next>=entries.length)return {error:'Contract is already at that end.'};
  if(sec.contract!=null && (!sec.contract || typeof sec.contract!=='object' || Array.isArray(sec.contract)) ||
      sec.contracts!=null && (!Array.isArray(sec.contracts) || sec.contracts.some(function(c){return !c || typeof c!=='object' || Array.isArray(c);})))
    return {error:'Fix malformed contract blocks before reordering.'};
  var blocks=entries.map(function(c){return builderClone(c.value);}),moved=blocks.splice(index,1)[0];blocks.splice(next,0,moved);
  var plan=planSetFields(text,raw,rec.section,[['contract',null],['contracts',JSON.stringify(blocks,null,2)]]);
  if(!plan.error)plan.card=String(next);return plan;
}
function planAddContractField(text,raw,target){
  var path=builderTargetPath(raw,Object.assign({},target,{kind:'contract'})),value=path && specValueAt(raw,path);
  if(!value)return {error:'Contract block not found.'};
  if(value.fields!=null && !Array.isArray(value.fields))return {error:'Fix fields to be an array before adding a field.'};
  var taken=Object.create(null);(value.fields || []).forEach(function(f){if(f && f.k)taken[f.k]=true;});
  var field=Array.isArray(value.columns)?{k:builderUniqueKey(taken,'field'),cells:{}}:{k:builderUniqueKey(taken,'field'),v:'',g:''};
  var plan=Array.isArray(value.fields)?jsonInsertMember(text,path.concat(['fields']),null,JSON.stringify(field,null,2)):
    planSetField(text,raw,path,'fields',JSON.stringify([field],null,2));
  if(!plan || plan.error)return plan || {error:'Could not add the field.'};
  plan.index=(value.fields || []).length;return plan;
}
function planContractWire(text,raw,target,wire,removeIndex){
  var rec=specSectionPaths(raw)[target.section],sec=rec && specValueAt(raw,rec.section);
  var path=builderTargetPath(raw,Object.assign({},target,{kind:'contract'})),value=path && specValueAt(raw,path);
  if(!sec || !value)return {error:'Contract block not found.'};
  if(value.wires!=null && !Array.isArray(value.wires))return {error:'Fix wires to be an array before editing bindings.'};
  var wires=(value.wires || []).slice();
  if(removeIndex!=null){
    if(removeIndex<0 || removeIndex>=wires.length)return {error:'Wire binding not found.'};
    wires.splice(removeIndex,1);
  }else{
    var problem=contractWireProblem(sec.diagram,wire);if(problem)return {error:problem};
    if(wires.some(function(w){return w && w.step===wire.step && w.edge===wire.edge && w.path===wire.path;}))return {error:'This wire binding already exists.'};
    wires.push(wire);
  }
  return planSetField(text,raw,path,'wires',wires.length?JSON.stringify(wires,null,2):null);
}

function planEdgeJsonContract(text,raw,target,key,value){
  var got=builderDiagram(text,raw,target.section);if(got.error)return got;
  if(value!==undefined && value!==null && !validJsonContract(value))return {error:'Use a JSON contract envelope with a json payload.'};
  var path=builderTargetPath(raw,target),owner=path && specValueAt(raw,path);
  if(!owner)return {error:'Contract owner not found. Reselect it.'};
  if(target.kind==='edge')return planSetField(text,raw,path,'contract',value===undefined?null:JSON.stringify(value,null,2));
  if(target.kind!=='step' || stepKeys(owner).indexOf(key)<0)return {error:'Choose an edge used by this step.'};
  if(owner.contracts!=null && (typeof owner.contracts!=='object' || Array.isArray(owner.contracts)))return {error:'Fix step contracts to be an object before editing.'};
  var map=Object.assign(Object.create(null),owner.contracts || {});
  if(value===undefined)delete map[key];else map[key]=value;
  return planSetField(text,raw,path,'contracts',Object.keys(map).length?JSON.stringify(map,null,2):null);
}

/* #1304 grid contract blocks. edit.op:
   convert   — a classic block becomes a grid: v → a Value column, g → a Notes column (only those in use);
   columns   — edit.columns is the new column list; cells of removed columns are dropped and plan.message says so;
   rows      — edit.rows is the new fields list (from the Rows editor);
   cell      — on a row target: edit.column gets edit.value (null removes the cell);
   fieldLabel — the first column's name. Each is one plan, so one Undo step. */
function planContractGrid(text,raw,target,edit){
  var blockPath=builderTargetPath(raw,{kind:'contract',section:target.section,card:target.card}),block=blockPath && specValueAt(raw,blockPath);
  if(!specObject(block))return {error:'Contract block not found. Select it again.'};
  var op=edit && edit.op,isGrid=Array.isArray(block.columns);
  if(op==='convert'){
    if(block.columns!=null)return {error:'This block already has columns.'};
    if(block.fields!=null && !Array.isArray(block.fields))return {error:'Fix fields to be an array before converting.'};
    var fields=Array.isArray(block.fields)?block.fields:[];
    function has(key){return fields.some(function(f){return specObject(f) && f[key]!=null;});}
    var columns=[];if(has('v') || !has('g'))columns.push({id:'value',label:'Value'});if(has('g'))columns.push({id:'notes',label:'Notes'});
    return builderRewrite(text,raw,blockPath,function(copy){
      copy.columns=columns;
      copy.fields=(copy.fields || []).map(function(f){
        if(!specObject(f))return f;
        var cells={};
        if(f.v!=null)cells.value=typeof f.v==='number'?f.v:contractGridCellText(f.v);
        if(f.g!=null)cells.notes=typeof f.g==='number'?f.g:contractGridCellText(f.g);
        delete f.v;delete f.g;if(Object.keys(cells).length)f.cells=cells;return f;
      });
    });
  }
  if(!isGrid)return {error:'This block has no columns. Use columns (grid) first.'};
  if(op==='fieldLabel')return planSetField(text,raw,blockPath,'fieldLabel',edit.value==null?null:JSON.stringify(edit.value));
  if(op==='rows'){
    if(!Array.isArray(edit.rows))return {error:'Rows must be a list.'};
    return planSetField(text,raw,blockPath,'fields',JSON.stringify(edit.rows,null,2));
  }
  if(op==='columns'){
    var next=edit.columns;
    if(!Array.isArray(next) || next.length>CONTRACT_GRID_MAX_COLUMNS)return {error:'A grid has up to '+CONTRACT_GRID_MAX_COLUMNS+' columns.'};
    var ids=next.map(function(col){return specObject(col)?col.id:null;});
    if(ids.some(function(id,i){return typeof id!=='string' || !id || ids.indexOf(id)!==i;}))return {error:'Column ids must be unique.'};
    var removed=block.columns.filter(function(col){return specObject(col) && typeof col.id==='string' && ids.indexOf(col.id)<0;}),dropped=0;
    var plan=builderRewrite(text,raw,blockPath,function(copy){
      copy.columns=next;
      (Array.isArray(copy.fields)?copy.fields:[]).forEach(function(f){
        if(!specObject(f) || !specObject(f.cells))return;
        removed.forEach(function(col){if(Object.prototype.hasOwnProperty.call(f.cells,col.id)){delete f.cells[col.id];dropped++;}});
      });
    });
    if(plan.error || !removed.length)return plan;
    var names=removed.map(function(col){return col.label || col.id;});
    plan.message='Removes the '+(names.length>1?names.slice(0,-1).join(', ')+' and '+names[names.length-1]+' columns':names[0]+' column')+
      (dropped?' and '+dropped+(dropped===1?' cell':' cells'):'')+'.';
    return plan;
  }
  if(op==='cell'){
    if(target.kind!=='crow')return {error:'Select a row to edit its cells.'};
    if(!block.columns.some(function(col){return specObject(col) && col.id===edit.column;}))return {error:'That column is not declared.'};
    var rowPath=blockPath.concat(['fields',target.index]),row=specValueAt(raw,rowPath);
    if(!specObject(row))return {error:'Contract row not found. Select it again.'};
    if(row.cells!=null && !specObject(row.cells))return {error:'Fix cells to be an object before editing them.'};
    var cells=Object.assign({},row.cells);
    if(edit.value==null)delete cells[edit.column];else cells[edit.column]=edit.value;
    return planSetField(text,raw,rowPath,'cells',Object.keys(cells).length?JSON.stringify(cells):null);
  }
  return {error:'Unknown grid edit.'};
}
