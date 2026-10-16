/* Reader keyboard shortcuts. "?" opens this sheet on every reader surface
   (#562); the rows list only keys the reader handles: presenter and focused
   step keys (engine.js), tab-bar keys, and Esc for menus and popovers. */
var READER_SHORTCUT_GROUPS=[
  ['Anywhere',[['?','Open this shortcut sheet'],['Esc','Close this sheet, an open menu or a popover']]],
  ['Diagram focused, or in Present',[['← / →','Previous or next step'],['Space','Play or pause the steps']]],
  ['In Present',[['1–9','Switch to that tab'],['Esc','Exit Present']]],
  ['Tab bar focused',[['← / →','Previous or next tab'],['Home / End','First or last tab']]]
];
function readerShortcutTextTarget(target){
  return !!(target && target.closest && target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="combobox"]'));
}
function wireReaderShortcuts(ctl,view,win){
  var doc=win.document,opener=null,destroyed=false;
  function el(tag,cls,text){var node=doc.createElement(tag);if(cls)node.className=cls;if(text!=null)node.textContent=text;return node;}
  var dialog=el('dialog','reader-shortcuts');dialog.id='reader-shortcuts';dialog.setAttribute('aria-labelledby','reader-shortcuts-title');
  var header=el('header'),title=el('h2',null,'Keyboard shortcuts'),close=el('button','reader-shortcuts-close','Close');
  title.id='reader-shortcuts-title';close.type='button';header.append(title,close);dialog.appendChild(header);
  READER_SHORTCUT_GROUPS.forEach(function(group){
    var section=el('section'),list=el('dl');section.appendChild(el('h3',null,group[0]));
    group[1].forEach(function(row){
      var dt=el('dt');
      row[0].split(/( \/ |–)/).forEach(function(part,i){dt.appendChild(i%2?doc.createTextNode(part):el('kbd',null,part));});
      list.append(dt,el('dd',null,row[1]));
    });
    section.appendChild(list);dialog.appendChild(section);
  });
  doc.body.appendChild(dialog);
  var button=el('button','tbtn dv-shortcuts','?');button.type='button';
  button.setAttribute('aria-label','Keyboard shortcuts');button.title='Keyboard shortcuts (?)';
  button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-controls',dialog.id);button.setAttribute('aria-keyshortcuts','?');
  var pageActions=readerPageActions(view,ctl);pageActions.appendChild(button);
  function show(){
    if(destroyed || dialog.open || doc.querySelector('dialog[open]'))return false;
    opener=doc.activeElement;dialog.showModal();close.focus({preventScroll:true});return true;
  }
  function keydown(ev){
    if(ev.key!=='?' || ev.defaultPrevented || ev.isComposing || ev.altKey || ev.ctrlKey || ev.metaKey)return;
    if(!view.isConnected || !view.getClientRects().length || readerShortcutTextTarget(ev.target))return;
    var tour=doc.querySelector('.dv-tour');if(tour && !tour.hidden)return;
    if(show())ev.preventDefault();
  }
  function closed(){var target=opener;opener=null;if(target && target.isConnected && target.focus)target.focus({preventScroll:true});}
  button.addEventListener('click',show);
  close.addEventListener('click',function(){dialog.close();});
  /* Keys inside the sheet stay there: Esc closes it without leaving Present. */
  dialog.addEventListener('keydown',function(ev){ev.stopPropagation();});
  dialog.addEventListener('close',closed);
  doc.addEventListener('keydown',keydown);
  return {show:show,destroy:function(){
    if(destroyed)return;destroyed=true;opener=null;
    doc.removeEventListener('keydown',keydown);
    if(dialog.open)dialog.close();dialog.remove();button.remove();
    if(!pageActions.children.length){if(ctl.readerActionsSize)ctl.readerActionsSize.disconnect();pageActions.remove();}
  }};
}
