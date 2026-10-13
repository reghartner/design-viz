/* Workbench workflow shortcuts. Keep recognition and exclusion policy here so
   one lifetime owns every document listener and remounts cannot double-fire. */
function workbenchShortcutIntent(event){
  if(!event || event.defaultPrevented || event.isComposing)return null;
  var key=String(event.key || ''),lower=key.toLowerCase(),command=!!(event.metaKey || event.ctrlKey);
  if(key==='?' && !event.altKey && !command)return 'help';
  if(command && !event.altKey && !event.shiftKey && lower==='a')return 'select-all';
  if(!command && !event.altKey && key==='F2' && !event.shiftKey)return 'inspect';
  if(!command && !event.altKey && lower==='f')return event.shiftKey?'fit-selection':'fit-diagram';
  return null;
}
function workbenchShortcutTextSelected(win){
  try{var selection=win && win.getSelection && win.getSelection();return !!(selection && !selection.isCollapsed && String(selection).trim());}
  catch(_){return false;}
}
function workbenchShortcutTextTarget(target){
  return !!(target && target.closest && target.closest('input,textarea,select,option,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="combobox"],[role="listbox"],[role="slider"]'));
}
function workbenchShortcutPanelTarget(target){
  return !!(target && target.closest && target.closest('.pwidget,[data-dv-panel],.explore-window,.explore-player,.workspace-window'));
}
function workbenchShortcutNativeTarget(target){
  if(!target || !target.closest)return false;
  if(workbenchShortcutTextTarget(target) || workbenchShortcutPanelTarget(target))return true;
  /* Nodes are intentionally focusable workbench objects. Other controls and
     panel/player descendants keep their own letter and function keys. */
  if(target.closest('[data-dv-object-menu]'))return false;
  return !!target.closest('button,a,summary,[role="button"],[role="menuitem"],[role="tab"],.pwidget,[data-dv-panel],.explore-window,.explore-player,.workspace-window');
}
function createBuilderWorkflowShortcuts(opts){
  var life=createWorkbenchLifetime(),doc=opts.document,win=opts.window,view=opts.view;
  var dialog=doc.getElementById('keyboard-shortcuts'),openButton=doc.getElementById('workspace-shortcuts'),closeButton=doc.getElementById('keyboard-shortcuts-close');
  var opener=null,canvasArmed=false,canvas=doc.getElementById('workspace-canvas');
  function active(){return life.alive() && (!opts.isActive || opts.isActive()) && !doc.body.classList.contains('workbench-reader-preview-active');}
  function modalOpen(){return !!doc.querySelector('dialog[open]');}
  function canvasTarget(target){return !!(canvas && target && (canvas.contains(target) || view.contains(target)));}
  function excluded(target,intent){return workbenchShortcutTextTarget(target) || workbenchShortcutPanelTarget(target) || workbenchShortcutTextSelected(win) || (intent!=='help' && workbenchShortcutNativeTarget(target));}
  function show(){
    if(!active() || modalOpen() && !(dialog && dialog.open) || !dialog)return false;
    opener=doc.activeElement;dialog.showModal();
    if(closeButton)closeButton.focus({preventScroll:true});
    return true;
  }
  function close(){if(dialog && dialog.open)dialog.close();}
  if(openButton)life.listen(openButton,'click',show);
  if(closeButton)life.listen(closeButton,'click',close);
  if(dialog){
    life.listen(dialog,'keydown',function(event){event.stopPropagation();});
    life.listen(dialog,'close',function(){var target=opener;opener=null;if(target && target.isConnected)target.focus({preventScroll:true});});
  }
  life.listen(doc,'pointerdown',function(event){canvasArmed=canvasTarget(event.target) && !workbenchShortcutNativeTarget(event.target);},true);
  life.listen(doc,'focusin',function(event){if(event.target!==doc.body)canvasArmed=canvasTarget(event.target) && !workbenchShortcutNativeTarget(event.target);},true);
  life.listen(doc,'keydown',function(event){
    var intent=workbenchShortcutIntent(event);if(!intent || !active())return;
    var target=event.target || doc.activeElement;
    if(excluded(target,intent) || modalOpen())return;
    if(intent==='help'){
      if(show())event.preventDefault();
      return;
    }
    if(!(canvasTarget(target) || canvasArmed))return;
    var handled=false;
    if(intent==='select-all')handled=!!opts.selectAll();
    else if(intent==='fit-diagram')handled=!!opts.fitDiagram();
    else if(intent==='fit-selection')handled=!!opts.fitSelection();
    else if(intent==='inspect')handled=!!opts.inspect();
    if(handled)event.preventDefault();
  },true);
  return {show:show,destroy:function(){opener=null;close();life.destroy();canvasArmed=false;}};
}
