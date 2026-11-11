/* Contract block identities are shared by validation, rendering and authoring.
   Keep legacy contract first when both forms are present; never rewrite it just
   to append a new block. Raw indexes survive malformed skipped entries. */
function sectionContracts(section){
  var out=[];
  function add(value,path,key){
    if(!value || typeof value!=='object' || Array.isArray(value))return;
    out.push({value:value,path:path,key:key});
  }
  if(section){
    add(section.contract,['contract'],'legacy');
    (Array.isArray(section.contracts)?section.contracts:[]).forEach(function(value,index){
      add(value,['contracts',index],String(index));
    });
  }
  var ids=Object.create(null);
  out.forEach(function(rec){if(typeof rec.value.id==='string')ids[rec.value.id]=(ids[rec.value.id] || 0)+1;});
  out.forEach(function(rec){
    var id=rec.value.id;
    rec.reference=rec.key==='legacy'?'legacy':typeof id==='string' && /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(id) && id!=='legacy' && ids[id]===1?id:String(Number(rec.key)+1);
  });
  return out;
}
function contractColumnSpan(value){return [4,6,8,12].indexOf(value)>=0?value:12;}

/* Bind only to an unambiguous authored step and a declared active edge.
   Invalid/stale references fail closed; positions are never step identities. */
function contractWireProblem(diagram, wire){
  if(!wire || typeof wire!=='object' || Array.isArray(wire))return 'must be an object {step, edge, path?}';
  if(typeof wire.step!=='string' || !wire.step)return 'step must be a stable step ID';
  var steps=diagram && Array.isArray(diagram.steps)?diagram.steps:[];
  var matches=steps.filter(function(step){return step && step.id===wire.step;});
  if(matches.length!==1)return 'step must identify exactly one section diagram step';
  var edges=diagram && Array.isArray(diagram.edges)?diagram.edges:[];
  if(typeof wire.edge!=='string' || !edges.some(function(edge){return edge && edge.from+'->'+edge.to===wire.edge;}) || stepKeys(matches[0]).indexOf(wire.edge)<0)
    return 'edge must be a declared edge used by this step';
  if(wire.path!=null){
    var paths=diagram && Array.isArray(diagram.paths)?diagram.paths:[];
    var pathsFound=paths.filter(function(path){return path && path.id===wire.path;});
    if(typeof wire.path!=='string' || pathsFound.length!==1 || !Array.isArray(pathsFound[0].steps) || pathsFound[0].steps.indexOf(wire.step)<0)
      return 'path must identify a path containing this step';
  }
  return null;
}
function stepWireContracts(section, step, pathId){
  var out=[];
  sectionContracts(section).forEach(function(rec){
    var seen=Object.create(null);
    (Array.isArray(rec.value.wires)?rec.value.wires:[]).forEach(function(wire){
      if(contractWireProblem(section.diagram,wire) || wire.step!==step.id || wire.path!=null && wire.path!==pathId || stepDeliveredKeys(step).indexOf(wire.edge)<0 || seen[wire.edge])return;
      seen[wire.edge]=true;out.push({record:rec,edge:wire.edge});
    });
  });
  return out;
}

/* JSON wire contracts are independent of section cards. Null suppresses a
   contract; {json:null} is a real JSON payload. Invalid overrides fail closed. */
function validJsonContract(value){
  return !!value && typeof value==='object' && !Array.isArray(value) &&
    Object.prototype.hasOwnProperty.call(value,'json') && value.json!==undefined &&
    (value.title==null || typeof value.title==='string');
}
function edgeJsonContracts(diagram,step){
  var out=[],seen=Object.create(null),edges=diagram && Array.isArray(diagram.edges)?diagram.edges:[];
  var keys=step?stepDeliveredKeys(step):null;
  edges.forEach(function(edge){
    if(!edge)return;
    var key=edge.from+'->'+edge.to;
    // Duplicate edge declarations have ambiguous ownership: never show a payload.
    if(seen[key] || edges.filter(function(e){return e && e.from+'->'+e.to===key;}).length!==1)return;
    seen[key]=true;if(keys && keys.indexOf(key)<0)return;
    var overrides=step && step.contracts,value=edge.contract;
    if(overrides && typeof overrides==='object' && !Array.isArray(overrides) && Object.prototype.hasOwnProperty.call(overrides,key))value=overrides[key];
    if(validJsonContract(value))out.push({edge:key,jsonContract:value,overridden:!!(overrides && Object.prototype.hasOwnProperty.call(overrides,key)),record:{key:'edge-json',value:value}});
  });
  return out;
}

/* #1304: the column and cell shape shared by the data-contract panel and grid
   contract blocks (`columns` plus per-row `cells`). Each host supplies its own
   classes and row headers; the table structure, widths and cell text are here. */
var CONTRACT_GRID_MAX_COLUMNS=12,CONTRACT_GRID_CELL_CHARS=120;
function contractGridWidth(value,fallback){return typeof value==='number' && isFinite(value) && value>=40?value:fallback;}
function contractGridColumns(value){return panelCollectionItems(value,'columns',CONTRACT_GRID_MAX_COLUMNS);}
function contractGridCellText(value){return value===undefined?'':value===null?'null':typeof value==='object'?JSON.stringify(value):String(value);}
function contractGridFieldLabel(value,fallback){return typeof value==='string' && value.trim()?value:fallback;}
function contractGridColumnWarnings(value,path,warnings){
  panelCollectionWarnings(value,path,warnings,'columns',CONTRACT_GRID_MAX_COLUMNS,function(col,at,warnings){
    if(col.width!=null && contractGridWidth(col.width,null)===null)warnings.push(at+'.width: use a width of at least 40 pixels — using 160');
  });
}
/* o: {tableClass, caption, captionClass, firstWidth, fieldLabel, columns, rows:[{attrs, head, cells}],
   rowHead?, colHeadAttrs?, cellAttrs?(column), missing, empty?}. Strings in head/attrs/missing/empty are HTML.
   rowHead opens each row header (default '<th scope="row">'). */
function contractGridTableHTML(o){
  var total=o.columns.reduce(function(sum,col){return sum+contractGridWidth(col.width,160);},o.firstWidth);
  var h='<table class="'+o.tableClass+'" style="width:'+total+'px"><caption class="'+o.captionClass+'">'+esc(o.caption)+
    '</caption><colgroup><col style="width:'+o.firstWidth+'px">';
  o.columns.forEach(function(col){h+='<col style="width:'+contractGridWidth(col.width,160)+'px">';});
  var colHead='<th scope="col"'+(o.colHeadAttrs || '')+'>';
  h+='</colgroup><thead><tr>'+colHead+esc(o.fieldLabel)+'</th>';
  o.columns.forEach(function(col){h+=colHead+esc(col.label || col.id)+'</th>';});
  h+='</tr></thead><tbody>';
  o.rows.forEach(function(row){
    var open=o.rowHead || '<th scope="row">',tag=open.slice(1,3);
    h+='<tr'+row.attrs+'>'+open+row.head+'</'+tag+'>';
    o.columns.forEach(function(col){
      h+='<td'+(o.cellAttrs?o.cellAttrs(col):'')+'>'+(panelOwn(row.cells,col.id)?esc(contractGridCellText(row.cells[col.id])):o.missing)+'</td>';
    });
    h+='</tr>';
  });
  if(!o.rows.length && o.empty)h+=o.empty;
  return h+'</tbody></table>';
}
/* Editor projection and collect for a Columns rows editor: renames keep ids, new columns get an id
   from their name, widths of at least 40 px. */
function contractGridMintId(used,label,fallback){
  var stem=String(label).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || fallback,id=stem,suffix=2;
  while(used[id])id=stem+'-'+suffix++;
  used[id]=true;return id;
}
function contractGridColumnRows(columns){
  return columns.map(function(item,index){return {_sourceIndex:index,label:item.label || item.id,width:item.width};});
}
function contractGridCollectColumns(original,items){
  var used=Object.create(null),error;
  original.forEach(function(item){used[item.id]=true;});
  var out=items.map(function(item){
    var base=original[item._sourceIndex],next=Object.assign(Object.create(null),base);
    if(!base)next.id=contractGridMintId(used,item.label,'column');
    if(!base || item.label!==(base.label || base.id))next.label=item.label;
    if(item.width!==undefined && contractGridWidth(item.width,null)===null)error='Column widths must be at least 40 pixels.';
    if(item.width===undefined)delete next.width;else next.width=item.width;
    return next;
  });
  return error?{error:error}:{value:out};
}
/* One row's cells from editor inputs cell0..cellN; an emptied input removes the cell. keepNumbers keeps
   a number when the cell was a number and the new text is numeric; otherwise cells are text. */
function contractGridCollectCells(baseCells,columns,item,keepNumbers){
  var cells=Object.assign(Object.create(null),baseCells);
  columns.forEach(function(col,i){
    var value=item['cell'+i] || '',had=panelOwn(baseCells,col.id),prior=had?contractGridCellText(baseCells[col.id]):'';
    if(value===prior.trim())return;
    if(value==='')delete cells[col.id];
    else cells[col.id]=keepNumbers && had && typeof baseCells[col.id]==='number' && value.trim()!=='' && isFinite(Number(value))?Number(value):value;
  });
  return cells;
}
/* Rows editor collect for a grid contract block: rows keep everything else they had (hot, link, delta,
   reveal); k and cells come from the editor. Numbers stay numbers only where the cell was a number. */
function contractGridRowItems(fields,columns){
  return fields.map(function(f,index){
    var row={_sourceIndex:index,k:f.k};
    columns.forEach(function(col,i){row['cell'+i]=panelOwn(f.cells,col.id)?contractGridCellText(f.cells[col.id]):'';});
    return row;
  });
}
function contractGridCollectRows(fields,columns,items){
  return {value:items.map(function(item){
    var base=fields[item._sourceIndex],next=base?JSON.parse(JSON.stringify(base)):{};
    next.k=item.k;
    var cells=contractGridCollectCells(base && base.cells,columns,item,true);
    if(Object.keys(cells).length)next.cells=Object.assign({},cells);else delete next.cells;
    return next;
  })};
}
