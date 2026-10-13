/* Local raster ingestion for ordinary diagram nodes. The transport owns only
   browser events and async lifecycle; planAddImageNode owns the project edit. */
function builderImageFileSupported(file){
  return !!file && ['image/png','image/jpeg','image/webp'].indexOf(String(file.type || '').toLowerCase())>=0;
}
function builderImageTransfer(transfer){
  if(!transfer)return null;
  var items=Array.from(transfer.items || []),files=Array.from(transfer.files || []),fileItems=items.filter(function(item){return item && item.kind==='file';});
  var mixedText=items.some(function(item){return item && item.kind==='string' && String(item.type || '').trim();}) ||
    Array.from(transfer.types || []).some(function(type){return type && type!=='Files' && /^text\/(?:plain|html)$|^text\/uri-list$/i.test(type);});
  /* Some clipboard implementations append an empty string item to a pure
     bitmap. It carries no readable representation and is safe to ignore. */
  if(mixedText || files.length>1 || fileItems.length>1 || files.length && fileItems.length && files.length!==fileItems.length)return null;
  var file=files[0] || fileItems.length && fileItems[0].getAsFile && fileItems[0].getAsFile();
  var type=file && file.type || fileItems[0] && fileItems[0].type;
  if((files.length || fileItems.length)!==1 || ['image/png','image/jpeg','image/webp'].indexOf(String(type || '').toLowerCase())<0)return null;
  return {file:file || null};
}
function builderImageDropPlacement(board,snapshot,section,clientX,clientY){
  var got=builderDiagram(snapshot.text,snapshot.raw,section),svg=board && board.querySelector && board.querySelector('.boardcanvas>svg');
  if(got.error || !svg || !svg.getScreenCTM || !svg.createSVGPoint)return null;
  var matrix=svg.getScreenCTM(),point=svg.createSVGPoint();if(!matrix)return null;
  try{point.x=clientX;point.y=clientY;point=point.matrixTransform(matrix.inverse());}catch(ex){return null;}
  if(!Number.isFinite(point.x) || !Number.isFinite(point.y))return null;
  var rows=Array.isArray(got.d.rows)&&got.d.rows.length?got.d.rows:[[]],placed=layout(Object.assign({},got.d,{rows:rows})).pos;
  var metrics=rows.map(function(row,index){
    var slots=row.map(function(slot){
      var boxes=(Array.isArray(slot)?slot:[slot]).map(function(id){return placed[id];}).filter(Boolean);
      if(!boxes.length)return null;
      return {x:boxes.reduce(function(sum,p){return sum+p.cx;},0)/boxes.length,
        y:boxes.reduce(function(sum,p){return sum+p.cy;},0)/boxes.length};
    });
    var visible=slots.filter(Boolean);
    return {index:index,slots:slots,y:visible.length?visible.reduce(function(sum,p){return sum+p.y;},0)/visible.length:null};
  });
  var usable=metrics.filter(function(row){return row.y!=null;});
  if(!usable.length){var empty=metrics.find(function(row){return rows[row.index].length===0;}) || metrics[0];return {row:empty.index,slot:0};}
  var nearest=usable[0];usable.slice(1).forEach(function(row){if(Math.abs(point.y-row.y)<Math.abs(point.y-nearest.y))nearest=row;});
  var centers=nearest.slots.map(function(slot,index){return slot && {index:index,x:slot.x};}).filter(Boolean),slot=0;
  while(slot<centers.length && point.x>(slot+1<centers.length?(centers[slot].x+centers[slot+1].x)/2:centers[slot].x))slot++;
  if(centers.length && point.x>centers[centers.length-1].x)slot=centers.length;
  return {row:nearest.index,slot:slot};
}

function initBuilderImageNodes(document,options){
  var life=createWorkbenchLifetime(),view=options.view,sequence=0,reader=null,probe=null,highlight=null;
  function editable(target){return target && target.closest && target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),dialog');}
  function clearHighlight(){if(highlight && highlight.classList)highlight.classList.remove('dv-image-drop-target');highlight=null;}
  function say(message){options.message(message);}
  function sectionOf(board){var sec=board && board.closest && board.closest('.doc-sec[data-dv-section]');return sec?Number(sec.getAttribute('data-dv-section')):NaN;}
  function surfaceFor(target){
    if(!life.alive() || options.isActive && !options.isActive() || !target || !target.closest)return null;
    var board=target.closest('.board'),section=sectionOf(board);
    if(!board || !Number.isInteger(section) || section!==options.currentSection() || options.surface(section)!==board)return null;
    if(!board.querySelector('.boardcanvas>svg'))return null;
    return {board:board,section:section};
  }
  function activeSurface(){var section=options.currentSection(),board=options.surface(section);return board?surfaceFor(board):null;}
  function cancelPending(){sequence++;if(reader && reader.readyState===1)try{reader.abort();}catch(ex){}reader=null;if(probe)probe.src='';probe=null;}
  function current(token,ref,snapshot){
    var now=options.snapshot();
    return life.alive() && token===sequence && (!options.isActive || options.isActive()) && ref.board.isConnected &&
      options.currentSection()===ref.section && options.surface(ref.section)===ref.board && !now.error &&
      now.text===snapshot.text && now.project===snapshot.project && (now.renderedText==null || now.renderedText===now.text);
  }
  function stale(){say('Image was not added because the project, section, or canvas changed. Drop or paste it again.');}
  function ingest(file,ref,placement){
    cancelPending();
    if(options.blocked()){say('Finish the current canvas action before adding an image.');return false;}
    if(!builderImageFileSupported(file)){say('Choose one PNG, JPEG or WebP image. SVG and GIF are not supported.');return false;}
    if(file.size>EMBEDDED_IMAGE_MAX_BYTES){say('Image is larger than 512 KiB. Use a smaller PNG, JPEG or WebP file.');return false;}
    var snapshot=options.snapshot();
    if(snapshot.error){say('Fix the JSON source before adding an image.');return false;}
    if(snapshot.renderedText!=null && snapshot.renderedText!==snapshot.text){say('Render the current source before adding an image.');return false;}
    var token=++sequence;reader=new FileReader();
    reader.onerror=function(){if(current(token,ref,snapshot))say('The image could not be read. The diagram is unchanged.');};
    reader.onload=function(){
      if(!current(token,ref,snapshot)){stale();return;}
      var data=embeddedImageKind(reader.result)?reader.result:null;
      if(!data){say('That file is not a real PNG, JPEG or WebP image. The diagram is unchanged.');return;}
      probe=new Image();
      probe.onerror=function(){if(current(token,ref,snapshot))say('That file cannot be decoded as an image. The diagram is unchanged.');};
      probe.onload=function(){
        if(!current(token,ref,snapshot)){stale();return;}
        if(!probe.naturalWidth || !probe.naturalHeight || probe.naturalWidth>4096 || probe.naturalHeight>4096){say('Use an image no larger than 4096 × 4096 pixels.');return;}
        var plan=planAddImageNode(snapshot.text,snapshot.raw,ref.section,{name:file.name,data:data},placement);
        if(plan.error){say(plan.error);return;}
        if(!options.apply(plan,snapshot,ref.section))stale();
        else say('Added '+builderImageTitle(file.name)+'. Undo removes the image node.');
      };
      probe.src=data;
    };
    try{reader.readAsDataURL(file);}catch(ex){reader=null;say('The image could not be read. The diagram is unchanged.');return false;}
    return true;
  }
  life.listen(view,'dragover',function(ev){
    var ref=surfaceFor(ev.target),payload=builderImageTransfer(ev.dataTransfer);if(!ref || !payload)return;
    ev.preventDefault();if(ev.dataTransfer)ev.dataTransfer.dropEffect='copy';
    if(highlight!==ref.board){clearHighlight();highlight=ref.board;highlight.classList.add('dv-image-drop-target');}
  });
  life.listen(view,'dragleave',function(ev){if(highlight && (!ev.relatedTarget || !highlight.contains(ev.relatedTarget)))clearHighlight();});
  life.listen(view,'drop',function(ev){
    var ref=surfaceFor(ev.target),payload=builderImageTransfer(ev.dataTransfer);if(!ref || !payload || !payload.file)return;
    ev.preventDefault();ev.stopPropagation();clearHighlight();
    var snapshot=options.snapshot(),placement=!snapshot.error?builderImageDropPlacement(ref.board,snapshot,ref.section,ev.clientX,ev.clientY):null;
    ingest(payload.file,ref,placement);
  });
  life.listen(document,'paste',function(ev){
    var payload=builderImageTransfer(ev.clipboardData);
    if(ev.defaultPrevented || editable(ev.target) || !payload || !payload.file)return;
    var ref=activeSurface();if(!ref)return;
    ev.preventDefault();
    ingest(payload.file,ref,null);
  });
  life.listen(document,'dragend',clearHighlight);
  life.own(function(){clearHighlight();cancelPending();});
  return {ingest:function(file){var ref=activeSurface();return !!ref && ingest(file,ref,null);},cancelPending:cancelPending,destroy:function(){life.destroy();}};
}
