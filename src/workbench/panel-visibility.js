/* Every declared panel is available here, even without a content patch. */
function createPanelVisibilityControl(options){
  var doc=options.document,c=options.controls,wrap=doc.createElement('details');
  wrap.className='rawjson panel-visibility';wrap.open=true;
  var title=doc.createElement('summary');title.textContent='Panel visibility';wrap.appendChild(title);
  var note=doc.createElement('p');note.className='fnote';
  note.textContent='Show or Hide carries forward on this path. Inherit removes this step’s override. Hidden panels keep their space and state; attached step controls stay available. A view’s hidden elements stay hidden.';
  wrap.appendChild(note);
  var d=options.diagram,route=diagramPathList(d).find(function(p){return p.id===options.path;}) || diagramPathList(d)[0];
  var index=route.indices.indexOf(options.index),folded=foldPanelVisibility(diagramForPath(d,route.id));
  (d.panels || []).forEach(function(panel){
    var patch=options.step.panelVisibility,current=specObject(patch)?patch[panel.id]:undefined;
    var select=c.select(['inherit','show','hide'],current===true?'show':current===false?'hide':'inherit',function(value){
      return options.commit(panel.id,value==='inherit'?null:value==='show');
    });
    var inherited=panel.visible!==false;
    if(index>0)inherited=folded[panel.id][index-1];
    var labels={inherit:index<0?'Inherit previous visibility':'Inherit · '+(inherited?'shown':'hidden'),show:'Show',hide:'Hide'};
    Array.from(select.options).forEach(function(o){o.textContent=labels[o.value];});
    select.setAttribute('aria-label','Panel visibility · '+panel.id);
    wrap.appendChild(c.row(panel.title || panel.id,select));
  });
  return wrap;
}
