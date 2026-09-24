/* Static, offline help. Reading never touches editor state or navigation. */
function initWorkbenchHumanGuide(){
  var dialog=document.getElementById('human-guide'),opener;
  if(!dialog)return;
  document.querySelectorAll('[data-open-human-guide]').forEach(function(button){
    button.addEventListener('click',function(){opener=button;dialog.showModal();});
  });
  document.getElementById('human-guide-close').addEventListener('click',function(){dialog.close();});
  dialog.addEventListener('close',function(){if(opener && opener.isConnected)opener.focus({preventScroll:true});});
  /* Keep document-level editor shortcuts from handling guide keystrokes.
     Default browser behaviors (find, copy, focus traversal, Escape) still work. */
  dialog.addEventListener('keydown',function(event){
    event.stopPropagation();
    if(event.key!=='Tab')return;
    var first=document.getElementById('human-guide-close'),last=dialog.querySelector('.human-guide-content'),active=document.activeElement;
    if(event.shiftKey && active===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey && (active===last || last.contains(active))){event.preventDefault();first.focus();}
  });
  dialog.querySelectorAll('.human-guide-nav a').forEach(function(link){
    link.addEventListener('click',function(event){
      event.preventDefault();
      var section=document.getElementById(link.getAttribute('href').slice(1));
      section.scrollIntoView({block:'start'});section.focus({preventScroll:true});
      dialog.querySelectorAll('.human-guide-nav a').forEach(function(other){other.removeAttribute('aria-current');});
      link.setAttribute('aria-current','location');
    });
  });
  window.addEventListener('popstate',function(){if(dialog.open)dialog.close();});
}
