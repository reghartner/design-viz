/* Static, offline help. Reading never touches editor state or navigation. */
function initWorkbenchHumanGuide(){
  var dialog=document.getElementById('human-guide'),opener;
  if(!dialog)return;
  function showChapter(id){
    var section=document.getElementById(id);
    if(!section || !dialog.contains(section))return;
    section.scrollIntoView({block:'start'});section.focus({preventScroll:true});
    dialog.querySelectorAll('.human-guide-nav a').forEach(function(link){
      if(link.getAttribute('href')==='#'+id)link.setAttribute('aria-current','location');
      else link.removeAttribute('aria-current');
    });
  }
  document.querySelectorAll('[data-open-human-guide]').forEach(function(button){
    button.addEventListener('click',function(){
      opener=button;dialog.showModal();
      var chapter=button.getAttribute('data-open-human-guide');
      if(chapter)showChapter(chapter);
    });
  });
  document.getElementById('human-guide-close').addEventListener('click',function(){dialog.close();});
  dialog.addEventListener('close',function(){if(opener && opener.isConnected)opener.focus({preventScroll:true});});
  /* Keep document-level editor shortcuts from handling guide keystrokes.
     Keep Tab within the guide without skipping its chapter disclosures. */
  dialog.addEventListener('keydown',function(event){
    event.stopPropagation();
    if(event.key!=='Tab')return;
    var controls=Array.from(dialog.querySelectorAll('button:not([disabled]), a[href], summary, [tabindex="0"]'))
      .filter(function(control){return control.tabIndex>=0 && control.getClientRects().length;});
    var first=controls[0],last=controls[controls.length-1],active=document.activeElement;
    if(event.shiftKey && active===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey && active===last){event.preventDefault();first.focus();}
  });
  dialog.querySelectorAll('.human-guide-nav a').forEach(function(link){
    link.addEventListener('click',function(event){
      event.preventDefault();
      showChapter(link.getAttribute('href').slice(1));
    });
  });
  window.addEventListener('popstate',function(){if(dialog.open)dialog.close();});
}
