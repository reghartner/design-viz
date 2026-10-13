/* Board-specific additive transport. The outer File importer still owns
   document replacement; image and Flowview object clipboard owners run first. */
function initBuilderDiagramImport(document,options){
  var life=createWorkbenchLifetime(),win=document.defaultView,sequence=0,reader=null,pending=null,opener=null;
  function element(tag,text){var el=document.createElement(tag);if(text)el.textContent=text;return el;}
  var dialog=element('dialog');dialog.id='diagram-import';dialog.className='object-clipboard-dialog';
  var title=element('h2','Add diagram to this canvas'),destination=element('p'),scope=element('p','Adds nodes, groups, and internal connections with independent IDs and protocol meanings. Rows and floats become a positioned block. Panels, timelines, prose, and named views are not merged.'),input=element('textarea'),file=element('input'),label=element('label','Source diagram '),select=element('select'),status=element('p'),apply=element('button','Add diagram'),cancel=element('button','Cancel');
  title.id='diagram-import-title';dialog.setAttribute('aria-labelledby',title.id);input.id='diagram-import-text';input.setAttribute('aria-label','Diagram JSON or Mermaid');input.rows=9;input.style.width='100%';
  file.type='file';file.accept='.json,.mmd,.mermaid,.md,.txt';file.setAttribute('aria-label','Choose diagram file');select.id='diagram-import-section';select.className='fctl';label.appendChild(select);status.id='diagram-import-preview';status.setAttribute('role','status');apply.id='diagram-import-apply';cancel.id='diagram-import-cancel';apply.type=cancel.type='button';apply.className='rbtn';cancel.className='bbtn';
  var actions=element('div');actions.className='story-actions';actions.appendChild(cancel);actions.appendChild(apply);
  [title,destination,scope,file,input,label,status,actions].forEach(function(el){dialog.appendChild(el);});document.body.appendChild(dialog);
  function editable(target){return target && target.closest && target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),dialog');}
  function active(){return life.alive() && (!options.isActive || options.isActive());}
  function surface(target){
    if(!active() || !target || !target.closest)return null;
    var board=target.closest('.board'),section=options.currentSection();
    return board && options.surface(section)===board?{board:board,section:section}:null;
  }
  function current(){
    if(!pending || pending.invalidated || !active())return false;
    var now=options.snapshot(),before=pending.snapshot;
    return !now.error && now.text===before.text && now.project===before.project && now.topologyRevision===before.topologyRevision &&
      now.renderedText===before.renderedText && options.currentSection()===pending.ref.section && options.surface(pending.ref.section)===pending.ref.board && pending.ref.board.isConnected;
  }
  function retire(){sequence++;if(reader && reader.readyState===1)try{reader.abort();}catch(ex){}reader=null;}
  function close(focus){retire();pending=null;if(dialog.open)dialog.close();if(focus!==false && opener && opener.isConnected)opener.focus();opener=null;}
  function preview(reparse){
    apply.disabled=true;
    if(!current()){status.textContent='The destination changed. Close and reopen Add diagram.';return;}
    if(reparse){
      pending.prepared=prepareBuilderDiagramImport(input.value);select.replaceChildren();
      if(!pending.prepared.error)pending.prepared.sections.forEach(function(section){var opt=element('option','Section '+(section.index+1)+' · '+section.label);opt.value=section.index;select.appendChild(opt);});
    }
    var prepared=pending.prepared;
    if(!prepared || prepared.error){status.textContent=prepared && prepared.error || 'Paste Flowview JSON or a Mermaid sequenceDiagram, or choose a file.';return;}
    var plan=planAddBuilderDiagram(pending.snapshot.text,pending.snapshot.raw,prepared.raw,Number(select.value),pending.ref.section,pending.point,options.validateSource);
    pending.plan=plan;
    if(plan.error){status.textContent=plan.error;return;}
    function count(n,noun){return n+' '+noun+(n===1?'':'s');}
    status.textContent=count(plan.counts.nodes,'node')+', '+count(plan.counts.groups,'group')+', '+count(plan.counts.edges,'connection')+' → '+destination.textContent+'. '+prepared.todos.join(' ');
    apply.disabled=false;
  }
  function open(text,ref,point){
    retire();if(options.blocked()){options.message('Finish the current canvas action before adding a diagram.');return false;}
    ref=ref || surface(options.surface(options.currentSection()));if(!ref){options.message('Open a Diagram or Explore canvas first.');return false;}
    var snapshot=options.snapshot();if(snapshot.error || snapshot.renderedText!=null && snapshot.text!==snapshot.renderedText){options.message('Render valid JSON before adding a diagram.');return false;}
    opener=document.activeElement;pending={snapshot:snapshot,ref:ref,point:point};input.value=text || '';file.value='';
    var rec=specSectionPaths(snapshot.raw)[ref.section],sec=rec && specValueAt(snapshot.raw,rec.section);
    destination.textContent='Section '+(ref.section+1)+(sec && sec.heading?' · '+sec.heading:'');
    if(!dialog.open)dialog.showModal();preview(true);input.focus();return true;
  }
  function read(fileValue){
    retire();if(!pending)return;
    if(!fileValue || fileValue.size>BUILDER_CLIPBOARD_LIMIT){status.textContent='Choose one diagram file up to 2 MiB.';apply.disabled=true;return;}
    var token=sequence;apply.disabled=true;status.textContent='Reading diagram…';reader=new win.FileReader();
    reader.onload=function(){if(!life.alive() || token!==sequence)return;if(!current()){status.textContent='The destination changed. Close and reopen Add diagram.';return;}input.value=String(reader.result);preview(true);};
    reader.onerror=function(){if(life.alive() && token===sequence){apply.disabled=true;status.textContent='The file could not be read. The canvas is unchanged.';}};
    try{reader.readAsText(fileValue);}catch(ex){status.textContent='The file could not be read.';}
  }
  function transfer(data){
    if(!data)return null;
    var files=Array.from(data.files || []),items=Array.from(data.items || []).filter(function(item){return item.kind==='file';});
    if(files.length>1 || items.length>1)return null;
    var f=files[0] || items[0] && items[0].getAsFile && items[0].getAsFile();
    if(f)return /\.(?:json|mmd|mermaid|md|txt)$/i.test(f.name)?{file:f}:null;
    if(items.length===1 && /^(?:application\/json|text\/(?:plain|markdown))$/.test(items[0].type))return {file:null};
    if(items.length || files.length)return null;
    var text=data.getData && data.getData('text/plain');return builderDiagramImportRecognized(text)?{text:text}:null;
  }
  life.listen(document.getElementById('diagram-import-open'),'click',function(){open();});
  life.listen(document.getElementById('src'),'input',function(){if(pending){pending.invalidated=true;retire();apply.disabled=true;status.textContent='The destination changed. Close and reopen Add diagram.';}});
  life.listen(input,'input',function(){retire();preview(true);});life.listen(select,'change',function(){preview(false);});life.listen(file,'change',function(){read(file.files[0]);});
  life.listen(cancel,'click',function(){close();});life.listen(dialog,'cancel',function(ev){ev.preventDefault();close();});
  life.listen(dialog,'keydown',function(ev){if(ev.key==='Escape')ev.stopPropagation();});
  life.listen(apply,'click',function(){
    if(!current()){preview(false);return;}if(options.blocked()){status.textContent='Finish the current canvas action first.';return;}
    preview(false);if(apply.disabled)return;
    if(options.apply(pending.plan,pending.snapshot,pending.ref.section)){options.message('Diagram added. Undo restores the previous source.');close(false);}else status.textContent='The destination changed. Close and reopen Add diagram.';
  });
  ['dragenter','dragover'].forEach(function(type){life.listen(options.view,type,function(ev){if(ev.defaultPrevented || editable(ev.target) || !surface(ev.target) || !transfer(ev.dataTransfer))return;ev.preventDefault();ev.dataTransfer.dropEffect='copy';});});
  life.listen(options.view,'drop',function(ev){
    if(ev.defaultPrevented || editable(ev.target))return;var ref=surface(ev.target),payload=transfer(ev.dataTransfer);if(!ref || !payload)return;
    ev.preventDefault();ev.stopPropagation();var point=null,svg=ref.board.querySelector('.boardcanvas>svg');
    try{var p=svg.createSVGPoint();p.x=ev.clientX;p.y=ev.clientY;p=p.matrixTransform(svg.getScreenCTM().inverse());if(floatCoordinate(p.x)&&floatCoordinate(p.y))point={x:p.x,y:p.y};}catch(ex){}
    if(open(payload.text,ref,point) && payload.file)read(payload.file);
  });
  life.listen(document,'paste',function(ev){
    if(ev.defaultPrevented || editable(ev.target) || !ev.clipboardData || (win.getSelection && !win.getSelection().isCollapsed))return;
    if(Array.from(ev.clipboardData.files || []).length || Array.from(ev.clipboardData.items || []).some(function(item){return item.kind==='file';}))return;
    var text=ev.clipboardData.getData('text/plain');if(!builderDiagramImportRecognized(text))return;
    var ref=surface(options.surface(options.currentSection()));if(!ref)return;ev.preventDefault();open(text,ref,null);
  });
  life.own(function(){close(false);dialog.remove();});return {open:life.guard(open),refresh:life.guard(function(){if(pending && !current()){pending.invalidated=true;retire();preview(false);}}),destroy:function(){life.destroy();}};
}
