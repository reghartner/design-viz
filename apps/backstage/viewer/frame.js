/* A data-only renderer. No standalone URL boot, credentials, storage or fetch.
   A transferred MessagePort binds navigation/resize to the owning plugin. */
(function(){
  'use strict';
  var controller = null, port = null, accepted = false, height = 0, pendingSize = false;
  var view = document.getElementById('docview'), error = document.getElementById('viewer-error');
  function send(value){ if (port) port.postMessage(value); }
  function size(){
    if (pendingSize) return;
    pendingSize = true;
    requestAnimationFrame(function(){
      pendingSize = false;
      var next = Math.ceil(Math.max(view.getBoundingClientRect().bottom,error.hidden ? 0 : error.getBoundingClientRect().bottom)) + 2;
      if (next !== height){ height = next; send({type:'size',height:height}); }
    });
  }
  function fail(message){
    if (controller) controller.destroy(); controller = null;
    view.replaceChildren(); error.hidden = false; error.textContent = message;
    send({type:'error',message:message}); size();
  }
  function navigate(target){
    if (!controller || !target) return;
    var section = controller.sections.find(function(s){return s.reference === target.section;});
    if (!section) throw new Error('This section is no longer in the published diagram. Refresh diagrams.');
    if (section.tabBlock != null) controller.tabBlocks[section.tabBlock-1].select(section.tab,false,false);
    var sp = section.stepper;
    if (sp && target.path){
      if (!sp.paths().some(function(p){return p.id === target.path;})) throw new Error('This path is no longer in the published diagram. Refresh diagrams.');
      sp.selectPath(target.path);
    }
    if (sp && target.step){
      sp.enterStep(false);
      var index = sp.stepIndexOf(target.step);
      if (index < 0) throw new Error('This step is no longer in the published diagram. Refresh diagrams.');
      sp.jump(index);
    }
    section.sectionEl.scrollIntoView({block:'start',behavior:'instant'}); size();
  }
  function paused(){if(controller)controller.steppers.forEach(function(s){s.stepper.pause();});}
  function protectLinks(){
    view.querySelectorAll('a[href]').forEach(function(a){
      var url = FlowCanon.http(a.getAttribute('href'));
      if (url){a.setAttribute('href',url);a.setAttribute('target','_blank');a.setAttribute('rel','noopener noreferrer');}
      else a.removeAttribute('href');
    });
  }
  /* Explicit evidence-link clicks can open a new tab. They never navigate the
     rendering frame or invoke a service operation in the background. */
  function linkClick(event){
    var a = event.target.closest && event.target.closest('a');
    if (!a || !view.contains(a)) return;
    if (!FlowCanon.http(a.getAttribute('href'))){event.preventDefault();return;}
    a.setAttribute('target','_blank'); a.setAttribute('rel','noopener noreferrer');
  }
  view.addEventListener('click',linkClick,true);
  view.addEventListener('auxclick',linkClick,true);
  window.addEventListener('message',function(event){
    if (accepted || event.source !== window.parent || !event.data || event.data.type !== 'flowview:init' || event.ports.length !== 1) return;
    accepted = true; port = event.ports[0];
    port.onmessage = function(e){
      if(e.data && e.data.type === 'pause') paused();
      if(e.data && e.data.type === 'navigate'){
        try{navigate(e.data.target);send({type:'navigated'});}catch(ex){send({type:'navigation-error',message:ex.message});}
      }
    };
    try{
      var page=normalize(event.data.spec), result=validate(page);
      if(result.errors.length) throw new Error(result.errors.join('\n'));
      var skin=SKIN_NAMES.indexOf(page.skin)>=0 ? page.skin : 'aurora';
      applySkinClasses(document.body,view,skin);
      controller=renderPage(view,page,skin,{}, {autoplay:false,layoutTarget:'backstage'});
      controller.onChange=function(){protectLinks();size();};
      protectLinks();
      if(event.data.target)navigate(event.data.target);
      send({type:'rendered',warnings:result.warnings}); size();
      if(document.fonts)document.fonts.ready.then(size);
    }catch(ex){fail('Flowview could not render this diagram. '+ex.message);}
  });
  new ResizeObserver(size).observe(view);
  document.addEventListener('visibilitychange',function(){if(document.hidden)paused();});
  window.addEventListener('pagehide',function(){if(controller)controller.destroy();if(port)port.close();});
})();
