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
  var choosingNode=false,snapshot=null,invalid=false,optionsKey='';
  NODE_PRESETS.forEach(function(item,index){
    var choice=doc.createElement('button');choice.type='button';choice.setAttribute('data-add-preset',String(index));
    var icon=doc.createElementNS('http://www.w3.org/2000/svg','svg'),use=doc.createElementNS('http://www.w3.org/2000/svg','use');
    icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');use.setAttribute('href','#i-'+item.icon);icon.appendChild(use);
    var label=doc.createElement('b');label.textContent=item.title;choice.append(icon,label);presets.appendChild(choice);presetButtons.push(choice);
    life.listen(choice,'click',function(){confirm(function(){opts.addNode(item);});});
  });
  function showError(message){error.textContent=message || '';error.hidden=!message;}
  function same(current){return snapshot && !current.error && current.text===snapshot.text && current.section===snapshot.section;}
  function paint(current){
    choices.concat(presetButtons).forEach(function(action){action.disabled=invalid || !!current.error || !current.diagram;});
    structure.forEach(function(action){action.disabled=invalid || !!current.error;});
    menu.hidden=choosingNode;footer.hidden=choosingNode;nodePage.hidden=!choosingNode;
    title.textContent=choosingNode ? 'Add a node' : 'Add to diagram';
    help.textContent=choosingNode ? 'Click a preset to add it, then customize the node in the inspector.' : 'Choose an item to get started.';
    showError(invalid ? 'The source or destination changed. Close this dialog and open it again before adding.' :
      current.error || (!current.diagram ? 'Choose a section with a diagram, or add a new section below.' : ''));
  }
  function refresh(){
    var current=opts.context(),entries=current.sections || [];
    var key=JSON.stringify(entries.map(function(entry){return [entry.section,entry.label];}));
    if(key!==optionsKey){
      optionsKey=key;target.replaceChildren();
      entries.forEach(function(entry){var option=doc.createElement('option');option.value=String(entry.section);option.textContent=entry.label;target.appendChild(option);});
    }
    target.value=String(current.section);target.disabled=!!current.error || !entries.length;
    button.disabled=!!current.locked;
    if(dialog.open){if(!same(current))invalid=true;paint(current);}
  }
  function close(focus){
    if(dialog.open)dialog.close();
    snapshot=null;invalid=false;button.setAttribute('aria-expanded','false');
    if(focus!==false && button.isConnected)button.focus({preventScroll:true});
  }
  function open(){
    var current=opts.context();
    if(current.locked)return;
    if(opts.pause)opts.pause();
    snapshot=current;invalid=false;choosingNode=false;
    doc.getElementById('diagram-add-destination').textContent=current.label || 'Page';
    dialog.querySelector('.diagram-add-structure').open=false;
    paint(current);dialog.showModal();button.setAttribute('aria-expanded','true');
    (choices[0].disabled ? doc.getElementById('diagram-add-close') : choices[0]).focus({preventScroll:true});
  }
  function confirm(run,pageStructure){
    if(!dialog.open)return false;
    var current=opts.context();
    if(invalid || !same(current) || (!pageStructure && !current.diagram)){invalid=invalid || !same(current);paint(current);return false;}
    close();run();return true;
  }
  function invalidate(){if(dialog.open){invalid=true;paint(opts.context());}}
  life.listen(button,'click',open);
  life.listen(target,'change',function(){
    var current=opts.context(),index=Number(target.value);
    if(!current.error && (current.sections || []).some(function(entry){return entry.section===index;}))opts.chooseSection(index);
    refresh();
  });
  life.listen(doc.getElementById('add-node'),'click',function(){
    if(!dialog.open)return;
    var current=opts.context();
    if(invalid || !same(current) || !current.diagram){invalid=invalid || !same(current);paint(current);return;}
    choosingNode=true;paint(current);presetButtons[0].focus({preventScroll:true});
  });
  life.listen(back,'click',function(){choosingNode=false;paint(opts.context());(choices[0].disabled ? doc.getElementById('diagram-add-close') : choices[0]).focus({preventScroll:true});});
  life.listen(doc.getElementById('diagram-add-close'),'click',function(){close();});
  life.listen(dialog,'cancel',function(event){event.preventDefault();close();});
  life.listen(dialog,'close',function(){if(!dialog.open){snapshot=null;button.setAttribute('aria-expanded','false');}});
  life.listen(dialog,'keydown',function(event){event.stopPropagation();if(event.key==='Escape'){event.preventDefault();close();}});
  life.listen(dialog,'click',function(event){event.stopPropagation();});
  life.listen(opts.src,'input',refresh);
  refresh();
  return {refresh:life.guard(refresh),invalidate:life.guard(invalidate),close:life.guard(close),confirm:life.guard(confirm),
    destroy:function(){if(!life.alive())return;life.destroy();close(false);presets.replaceChildren();target.replaceChildren();}};
}
