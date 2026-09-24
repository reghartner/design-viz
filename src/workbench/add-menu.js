/* Editor-only insertion entry point. Commands, source transactions and the
   panel library keep their existing owners; this owns destination and modal UI. */
function initDiagramAddMenu(opts){
  var doc=opts.document,dialog=doc.getElementById('diagram-add-menu'),button=doc.getElementById('diagram-add');
  if(!dialog || !button)return null;
  var life=createWorkbenchLifetime(),target=doc.getElementById('diagram-add-target');
  var preset=doc.getElementById('diagram-add-preset'),presetLabel=doc.getElementById('diagram-add-preset-label');
  var error=doc.getElementById('diagram-add-error'),help=doc.getElementById('diagram-add-help');
  var choices=Array.from(dialog.querySelectorAll('[data-add-kind]')),actions=Array.from(dialog.querySelectorAll('[data-add-action]'));
  var structure=[doc.getElementById('add-section'),doc.getElementById('add-tabs'),doc.getElementById('add-contract')];
  var kind='node',snapshot=null,invalid=false,optionsKey='';
  var copy={node:'Choose a preset, then edit the node in the inspector.',
    edge:'Choose a source node, then a target node in this section. Escape cancels.',
    step:'Append a step to the selected timeline in this section.',
    catalog:'Choose company services and optionally connect their declared dependencies.',
    panel:'Browse large previews, then explicitly add a panel from the library.'};
  NODE_PRESETS.forEach(function(item,index){var option=doc.createElement('option');option.value=String(index);option.textContent=item.title;preset.appendChild(option);});
  function showError(message){error.textContent=message || '';error.hidden=!message;}
  function same(current){return snapshot && !current.error && current.text===snapshot.text && current.section===snapshot.section;}
  function paint(current){
    choices.forEach(function(choice){choice.setAttribute('aria-pressed',String(choice.getAttribute('data-add-kind')===kind));});
    actions.forEach(function(action){action.hidden=action.getAttribute('data-add-action')!==kind;action.disabled=invalid || !!current.error || !current.diagram;});
    structure.forEach(function(action){action.disabled=invalid || !!current.error;});
    presetLabel.hidden=kind!=='node';help.textContent=copy[kind];
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
    snapshot=current;invalid=false;kind='node';preset.value='0';
    doc.getElementById('diagram-add-destination').textContent=current.label || 'Page';
    dialog.querySelector('.diagram-add-structure').open=false;
    paint(current);dialog.showModal();button.setAttribute('aria-expanded','true');
    choices[0].focus({preventScroll:true});
  }
  function confirm(run,pageStructure){
    if(!dialog.open)return false;
    var current=opts.context();
    if(invalid || !same(current) || (!pageStructure && !current.diagram)){invalid=!same(current);paint(current);return false;}
    close();run();return true;
  }
  function invalidate(){if(dialog.open){invalid=true;paint(opts.context());}}
  life.listen(button,'click',open);
  life.listen(target,'change',function(){
    var current=opts.context(),index=Number(target.value);
    if(!current.error && (current.sections || []).some(function(entry){return entry.section===index;}))opts.chooseSection(index);
    refresh();
  });
  choices.forEach(function(choice){life.listen(choice,'click',function(){kind=choice.getAttribute('data-add-kind');paint(opts.context());});});
  life.listen(doc.getElementById('diagram-add-close'),'click',function(){close();});
  life.listen(dialog,'cancel',function(event){event.preventDefault();close();});
  life.listen(dialog,'close',function(){if(!dialog.open){snapshot=null;button.setAttribute('aria-expanded','false');}});
  life.listen(dialog,'keydown',function(event){event.stopPropagation();if(event.key==='Escape'){event.preventDefault();close();}});
  life.listen(dialog,'click',function(event){event.stopPropagation();});
  life.listen(opts.src,'input',refresh);
  refresh();
  return {refresh:life.guard(refresh),invalidate:life.guard(invalidate),close:life.guard(close),confirm:life.guard(confirm),
    preset:function(){return NODE_PRESETS[Number(preset.value)] || NODE_PRESETS[0];},
    destroy:function(){if(!life.alive())return;life.destroy();close(false);preset.replaceChildren();target.replaceChildren();}};
}
