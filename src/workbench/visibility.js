/* Shared reveal controls for connections, prose and contract fields. */
function createVisibilityControl(options){
  var doc=options.document,c=options.controls,d=options.diagram || {},paths=diagramPathList(d);
  var max=Math.max.apply(null,[0].concat(paths.map(function(p){return p.indices.length;})));
  var wrap=doc.createElement('details');wrap.className='rawjson visibility-control';
  var heading=doc.createElement('summary');heading.textContent='Visibility by path position';wrap.appendChild(heading);
  wrap.open=options.value.revealAt!=null || options.value.hideAt!=null;
  var note=doc.createElement('p');note.className='fnote';
  note.textContent='Applies to the same position in every path, including steps hidden in this view. Show is inclusive; Hide starts at that position. Ambient mode shows everything. Reordering steps keeps these positions.';wrap.appendChild(note);
  if(!max){note.textContent='Add story steps to this section to preview visibility timing. Ambient mode shows everything.';}
  var active=options.current(),route=paths.find(function(p){return active && p.id===active.path;}) || paths[0];
  var path=c.select(paths.map(function(p){return p.id;}),route.id,function(id){route=paths.find(function(p){return p.id===id;});draw();return true;});
  path.setAttribute('aria-label','Caption path');
  Array.from(path.options).forEach(function(o){o.textContent=paths.find(function(p){return p.id===o.value;}).label;});
  if(paths.length>1)wrap.appendChild(c.row('Caption path',path));
  var bounds=doc.createElement('div');wrap.appendChild(bounds);
  function draw(){
    bounds.innerHTML='';
    [['revealAt','Show from position','Beginning'],['hideAt','Hide starting at position','Never hide']].forEach(function(field){
      var key=field[0],value=options.value[key],limit=max+(key==='hideAt'?1:0),values=[];
      for(var n=0;n<limit;n++)values.push(String(n));
      if(value!=null && values.indexOf(String(value))<0)values.push(String(value));
      var select=c.select(values,value==null?'':String(value),function(v){return options.change(key,v==null || v===''?null:Number(v));},true);
      select.setAttribute('aria-label',field[1]);
      Array.from(select.options).forEach(function(o){
        if(o.value===''){o.textContent=field[2];return;}
        var index=Number(o.value),step=(d.steps || [])[route.indices[index]];
        o.textContent='Position '+(index+1)+' — '+(step?(step.text || step.id || 'Untitled step')+(step.id?' · '+step.id:''):'This path has ended');
      });bounds.appendChild(c.row(field[1],select));
    });
  }
  draw();
  [['revealAt','Show from current position'],['hideAt','Hide from current position']].forEach(function(field){
    var button=c.action(field[1],function(){
      var now=options.current();
      if(!now || now.mode!=='step'){options.error('Select a story step in the preview first.');return false;}
      return options.change(field[0],now.n);
    });button.disabled=!max;wrap.appendChild(button);
  });
  return wrap;
}
