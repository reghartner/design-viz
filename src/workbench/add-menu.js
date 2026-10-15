/* Editor-only insertion entry point. Commands, source transactions and the
   panel library keep their existing owners; this owns destination and modal UI. */
function initDiagramAddMenu(opts){
  var doc=opts.document,dialog=doc.getElementById('diagram-add-menu'),button=doc.getElementById('diagram-add');
  if(!dialog || !button)return null;
  var life=createWorkbenchLifetime(),target=doc.getElementById('diagram-add-target');
  var presets=doc.getElementById('diagram-add-presets'),nodePage=doc.getElementById('diagram-add-nodes');
  var menu=dialog.querySelector('[aria-label="What to add"]'),footer=dialog.querySelector('.diagram-add-footer');
  var title=doc.getElementById('diagram-add-title'),back=doc.getElementById('diagram-add-back');
  var error=doc.getElementById('diagram-add-error'),help=doc.getElementById('diagram-add-help');
  var choices=Array.from(dialog.querySelectorAll('[data-add-kind]')),presetButtons=[];
  var structure=[doc.getElementById('add-section'),doc.getElementById('add-tabs'),doc.getElementById('add-contract')];
  var choosingNode=false,snapshot=null,invalid=false,optionsKey='',destination=null,inline=null,inlineLife=null,inlineOpener=null;
  NODE_PRESETS.forEach(function(item,index){
    var choice=doc.createElement('button');choice.type='button';choice.setAttribute('data-add-preset',String(index));
    var icon=doc.createElementNS('http://www.w3.org/2000/svg','svg'),use=doc.createElementNS('http://www.w3.org/2000/svg','use');
    icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');use.setAttribute('href','#i-'+item.icon);icon.appendChild(use);
    var label=doc.createElement('b');label.textContent=item.title;choice.append(icon,label);presets.appendChild(choice);presetButtons.push(choice);
    life.listen(choice,'click',function(){confirm(function(at){opts.addNode(item,at);});});
  });
  function showError(message){error.textContent=message || '';error.hidden=!message;}
  function same(current){return snapshot && !current.error && current.project===snapshot.project && current.text===snapshot.text && current.section===snapshot.section && current.chapter===snapshot.chapter && current.view===snapshot.view;}
  function paint(current){
    choices.concat(presetButtons).forEach(function(action){
      var prose=action.hasAttribute('data-add-prose');
      action.disabled=invalid || !!current.error || !(prose?current.prose:current.diagram);
      if(prose)action.title=current.prose?'':'Prose belongs to a page section.';
    });
    structure.forEach(function(action){action.disabled=invalid || !!current.error;});
    menu.hidden=choosingNode;footer.hidden=choosingNode;nodePage.hidden=!choosingNode;
    title.textContent=choosingNode ? 'Add a node' : 'Add to section';
    help.textContent=choosingNode ? 'Click a preset to add it, then customize the node in the inspector.' : 'Choose an item to get started.';
    showError(invalid ? 'The source or destination changed. Close this dialog and open it again before adding.' :
      current.error || (!current.diagram ? current.prose ? 'This section supports prose. Choose a section with a diagram for nodes, connections, steps and panels.' : 'Choose a page section, or add a new section below.' : ''));
  }
  function refresh(){
    var current=opts.context(),entries=current.sections || [];
    var key=JSON.stringify(entries.map(function(entry){return [entry.section,entry.label];}));
    if(key!==optionsKey){
      optionsKey=key;target.replaceChildren();
      var groups=new Map();entries.forEach(function(entry){var label=entry.group || 'Document',host=groups.get(label);if(!host){host=doc.createElement('optgroup');host.label=label;groups.set(label,host);target.appendChild(host);}var option=doc.createElement('option');option.value=String(entry.section);option.textContent=entry.label;host.appendChild(option);});
    }
    target.value=String(current.section);target.disabled=!!current.error || !entries.length;
    button.disabled=!!current.locked;
    if(inline && !same(current))closeInline(false);
    if(dialog.open){if(!same(current))invalid=true;paint(current);}
  }
  function close(focus){
    closeInline(false);
    if(dialog.open)dialog.close();
    snapshot=null;destination=null;invalid=false;button.setAttribute('aria-expanded','false');
    if(focus!==false && button.isConnected)button.focus({preventScroll:true});
  }
  function open(at,node){
    closeInline(false);destination=at || null;
    var current=opts.context();
    if(current.locked)return;
    if(opts.pause)opts.pause();
    snapshot=current;invalid=false;choosingNode=!!node;
    doc.getElementById('diagram-add-destination').textContent=current.label || 'Page';
    dialog.querySelector('.diagram-add-structure').open=false;
    dialog.querySelector('.diagram-add-destination-picker').open=false;
    paint(current);dialog.showModal();button.setAttribute('aria-expanded','true');
    if(node)presetButtons[0].focus({preventScroll:true});else focusChoice();
  }
  function closeInline(focus){
    if(inlineLife)inlineLife.destroy();inlineLife=null;
    if(inline)inline.remove();inline=null;
    var opener=inlineOpener;inlineOpener=null;
    if(focus && opener && opener.isConnected)opener.focus({preventScroll:true});
  }
  function openInline(at){
    close(false);opts.chooseSection(at.section,true);
    var current=opts.context();if(current.error || !current.diagram || current.section!==at.section)return false;
    if(opts.pause)opts.pause();
    snapshot=current;destination=Object.assign({},at,{chapter:current.chapter,view:current.view,text:current.text,project:current.project});
    var captured=destination;
    inlineOpener=doc.activeElement;inlineLife=createWorkbenchLifetime();
    inline=doc.createElement('div');inline.className='dv-object-menu dv-add-menu';inline.setAttribute('role','menu');inline.setAttribute('aria-label','Add to diagram');inline.setAttribute('popover','manual');
    var heading=doc.createElement('strong');heading.textContent='Add';inline.appendChild(heading);
    function item(label,run){
      var choice=doc.createElement('button');choice.type='button';choice.setAttribute('role','menuitem');choice.textContent=label;choice.tabIndex=-1;inline.appendChild(choice);
      inlineLife.listen(choice,'click',function(event){
        event.stopPropagation();if(!same(opts.context())){close(false);return;}
        closeInline(false);snapshot=null;destination=null;run(captured);
      });
    }
    item('Text',opts.addText);item('Node…',function(at){open(at,true);});item('Panel…',opts.addPanel);
    item('Connection',opts.addEdge);item('Step',opts.addStep);
    at.shell.appendChild(inline);if(inline.showPopover)inline.showPopover();
    var r=inline.getBoundingClientRect(),win=doc.defaultView;
    inline.style.left=Math.max(8,Math.min(at.x,win.innerWidth-r.width-8))+'px';inline.style.top=Math.max(8,Math.min(at.y,win.innerHeight-r.height-8))+'px';
    var items=Array.from(inline.querySelectorAll('button'));items[0].tabIndex=0;items[0].focus({preventScroll:true});
    inlineLife.listen(inline,'keydown',function(e){
      e.stopPropagation();var index=items.indexOf(doc.activeElement),next=index;
      if(e.key==='Escape'){e.preventDefault();closeInline(true);return;}if(e.key==='Tab'){closeInline(false);return;}
      if(e.key==='ArrowDown')next=(index+1)%items.length;else if(e.key==='ArrowUp')next=(index+items.length-1)%items.length;else if(e.key==='Home')next=0;else if(e.key==='End')next=items.length-1;else return;
      e.preventDefault();items.forEach(function(choice,i){choice.tabIndex=i===next?0:-1;});items[next].focus({preventScroll:true});
    });
    inlineLife.listen(doc,'pointerdown',function(e){if(inline && !inline.contains(e.target))closeInline(false);},true);
    inlineLife.listen(doc,'focusin',function(e){if(inline && !inline.contains(e.target))closeInline(false);});
    inlineLife.listen(win,'resize',function(){closeInline(false);});
    inlineLife.listen(at.shell,'scroll',function(){closeInline(false);},true);
    return true;
  }
  function focusChoice(){(choices.find(function(choice){return !choice.disabled;}) || doc.getElementById('diagram-add-close')).focus({preventScroll:true});}
  function confirm(run,pageStructure){
    if(!dialog.open)return false;
    var current=opts.context();
    if(invalid || !same(current) || (pageStructure==='prose'?!current.prose:!pageStructure && !current.diagram)){invalid=invalid || !same(current);paint(current);return false;}
    var at=destination;close();run(at);return true;
  }
  function invalidate(){closeInline(false);if(dialog.open){invalid=true;paint(opts.context());}}
  life.listen(button,'click',function(){open();});
  var textButton=doc.getElementById('add-text-box');
  if(textButton)life.listen(textButton,'click',function(){confirm(function(at){opts.addText(at);});});
  life.listen(target,'change',function(){
    var current=opts.context(),index=Number(target.value);
    if(invalid || !same(current)){invalid=true;paint(current);return;}
    if(!current.error && (current.sections || []).some(function(entry){return entry.section===index;}))opts.chooseSection(index);
    snapshot=opts.context();destination=null;invalid=false;
    doc.getElementById('diagram-add-destination').textContent=snapshot.label || 'Page';
    refresh();
  });
  life.listen(doc.getElementById('add-node'),'click',function(){
    if(!dialog.open)return;
    var current=opts.context();
    if(invalid || !same(current) || !current.diagram){invalid=invalid || !same(current);paint(current);return;}
    choosingNode=true;paint(current);presetButtons[0].focus({preventScroll:true});
  });
  life.listen(back,'click',function(){choosingNode=false;paint(opts.context());focusChoice();});
  life.listen(doc.getElementById('diagram-add-close'),'click',function(){close();});
  life.listen(dialog,'cancel',function(event){event.preventDefault();close();});
  // A queued close event from the modal must not retire a newer inline menu.
  life.listen(dialog,'close',function(){if(!dialog.open && !inline){snapshot=null;button.setAttribute('aria-expanded','false');}});
  life.listen(dialog,'keydown',function(event){event.stopPropagation();if(event.key==='Escape'){event.preventDefault();close();}});
  life.listen(dialog,'click',function(event){event.stopPropagation();});
  life.listen(opts.src,'input',refresh);
  refresh();
  return {openInline:life.guard(openInline),refresh:life.guard(refresh),invalidate:life.guard(invalidate),close:life.guard(close),confirm:life.guard(confirm),
    destroy:function(){if(!life.alive())return;life.destroy();close(false);presets.replaceChildren();target.replaceChildren();}};
}
