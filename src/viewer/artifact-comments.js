/* claude.ai artifact comment anchoring. Tab panels and Views hide content
   with `hidden`, so the shell's own CSS-path anchoring cannot show or reach a
   comment on a non-active Tab/View. When the artifact declares the comments
   capability with customAnchors, the page reports pins only for rendered
   subjects, labels new comments with their Tab/View/section and switches Tab
   and View for the shell's "Go to". Each View's sections move into that
   View's own wrapper element, so a comment's saved path names its View and a
   section shared by two Views takes separate comments in each. A comment on the step caption is saved
   against the numbered step button of the step shown, so it pins on that
   button and "Go to" replays that step. Step controls keep working in comment
   mode. Without window.claude, a null namespace or a refused registration
   this module stays entirely inert. */
var ARTIFACT_COMMENT_PASS='.explore-navigation,[role="tab"],.schips,.step-transport,.mtoggle,.path-matrix,.path-timeline,.path-chip';
function artifactCommentClip(text,max){
  text=String(text || '').replace(/\s+/g,' ').trim();
  var bytes=0,out='',chars=Array.from(text),i,size;
  function width(ch){var c=ch.codePointAt(0);return c<0x80?1:c<0x800?2:c<0x10000?3:4;}
  for(i=0;i<chars.length;i++)bytes+=width(chars[i]);
  if(bytes<=max)return text;
  bytes=0;
  for(i=0;i<chars.length;i++){size=width(chars[i]);if(bytes+size>max-3)break;bytes+=size;out+=chars[i];}
  return out.replace(/\s+$/,'')+'…';
}
function wireArtifactComments(ctl,view,win){
  var claude=null;
  try{claude=win.claude;}catch(ex){claude=null;}
  if(!claude || typeof claude.use!=='function')return null;
  var doc=win.document,ctrl=null,on=false,threads=[],frame=0,last=null,ring=null,listening=false,mutations=null,bySection=null,down=null;
  function sectionOf(el){
    if(!bySection){bySection=new Map();ctl.sections.forEach(function(rec){bySection.set(rec.sectionEl,rec);});}
    for(var node=el;node;node=node.parentElement){var rec=bySection.get(node);if(rec)return rec;}
    return null;
  }
  function panelTab(panel){
    var id=panel.getAttribute('aria-labelledby');
    for(var b=0;b<ctl.tabBlocks.length;b++){var i=ctl.tabBlocks[b].buttons.findIndex(function(button){return button.id===id;});if(i>=0)return {block:ctl.tabBlocks[b],index:i};}
    return null;
  }
  function tabsOf(el){
    var out=[];for(var node=el;node;node=node.parentElement)if(node.getAttribute && node.getAttribute('role')==='tabpanel'){var tab=panelTab(node);if(tab)out.unshift(tab);}
    return out;
  }
  function resolve(anchor){
    if(typeof anchor!=='string' || !anchor)return null;
    try{return doc.querySelector(anchor);}catch(ex){return null;}
  }
  /* A comment made in a View that is not shown names that View's empty
     wrapper: the longest part of its path that still resolves finds it. */
  function nearest(anchor){
    if(typeof anchor!=='string')return null;
    var parts=anchor.split(' > ');
    for(var i=parts.length-1;i>0;i--){var node=resolve(parts.slice(0,i).join(' > '));if(node)return node;}
    return null;
  }
  function rendered(el){
    if(!el || !el.isConnected || el.closest('[hidden]') || !el.getClientRects().length)return false;
    return typeof el.checkVisibility!=='function' || el.checkVisibility({visibilityProperty:true});
  }
  /* Pins use the shell's own anchor point for the element, so a page-placed
     pin sits where a shell-placed one on the same element would. */
  function point(el){
    try{var at=ctrl.domAnchor(el)[1];if(at && isFinite(at.x) && isFinite(at.y))return {x:Math.round(at.x),y:Math.round(at.y)};}catch(ex){}
    var rect=el.getBoundingClientRect();
    return {x:Math.round(rect.left+rect.width/2+win.scrollX),y:Math.round(rect.top+rect.height/2+win.scrollY)};
  }
  function excerpt(el){
    var label=el.getAttribute && el.getAttribute('aria-label'),parts=[],size=0;
    var walker=doc.createTreeWalker(el,NodeFilter.SHOW_TEXT,{acceptNode:function(node){var p=node.parentElement;return p && p.closest('[hidden],[data-uncommentable],script,style')?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT;}});
    while(size<600 && walker.nextNode()){var text=walker.currentNode.nodeValue.replace(/\s+/g,' ').trim();if(text){parts.push(text);size+=text.length+1;}}
    return parts.join(' ').trim() || (label || '').trim();
  }
  function describe(el){
    var rec=sectionOf(el),parts=[];
    tabsOf(el).forEach(function(tab){if(tab.block.count>1)parts.push('Tab: '+tab.block.buttons[tab.index].textContent.trim());});
    var owner=rec && ctl.views && ctl.views.owner(rec),current=owner && owner.views.length>1 && ctl.views.current(rec);
    if(current && current.name)parts.push('View: '+current.name);
    var headingEl=rec && rec.sectionEl.querySelector('.sec-h'),heading=headingEl?headingEl.textContent.replace(/\s+/g,' ').trim():'';
    if(heading)parts.push(heading);
    var text=rec && el===rec.sectionEl?'':excerpt(el);
    if(text===heading)text='';
    return {label:artifactCommentClip(parts.concat(text?[artifactCommentClip(text,96)]:[]).join(' › '),128),
      detail:artifactCommentClip(parts.concat(text?['“'+text+'”']:[]).join(' › '),512)};
  }
  function report(force){
    if(!ctrl)return;
    var map={};
    threads.forEach(function(thread){var el=resolve(thread && thread.anchor);if(rendered(el))map[thread.id]=point(el);});
    var key=JSON.stringify(map);if(!force && key===last)return;
    last=key;ctrl.placed(map);
  }
  function safeReport(force){try{report(force);}catch(ex){}}
  function schedule(){
    if(!ctrl || frame || !threads.length)return;
    frame=win.requestAnimationFrame(function(){frame=0;safeReport(false);});
  }
  function observe(){
    var want=threads.length>0;if(want===!!mutations)return;
    if(want && typeof MutationObserver!=='undefined'){mutations=new MutationObserver(schedule);mutations.observe(view,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','class','style','open','aria-current']});}
    else if(!want && mutations){mutations.disconnect();mutations=null;}
  }
  function nestedScroll(ev){if(ev.target!==doc && ev.target!==doc.documentElement)schedule();}
  function listen(){
    if(listening)return;listening=true;
    ['diagram-tab-change','tab-view-change','diagram-view-change','navigation-mounted','detail-navigation','reader-zoom-change'].forEach(function(type){view.addEventListener(type,schedule);});
    win.addEventListener('resize',schedule);doc.addEventListener('scroll',nestedScroll,true);
    if(typeof ResizeObserver!=='undefined')new ResizeObserver(schedule).observe(view);
  }
  function target(ev){
    var t=ev.target;if(t && t.nodeType!==1)t=t.parentElement;
    if(!t || !t.closest || !view.contains(t) || t.closest(ARTIFACT_COMMENT_PASS))return null;
    return t.closest('[data-comment-target]') || t;
  }
  /* The step caption's comment belongs to the numbered button of the step it
     shows: that button's path survives caption text changes between steps. */
  function stepChip(el){
    var bar=el.classList && el.classList.contains('stepline') && el.closest('.termbar');
    return bar?bar.querySelector('.schip[aria-current="true"]'):null;
  }
  function hideRing(){if(ring)ring.hidden=true;}
  function leave(ev){if(!ev.relatedTarget)hideRing();}
  function hover(ev){
    if(!on)return;var el=target(ev);
    if(!el || el.closest('[data-uncommentable]')){hideRing();return;}
    if(!ring){ring=doc.createElement('div');ring.className='dv-comment-ring';ring.setAttribute('aria-hidden','true');ring.setAttribute('data-uncommentable','');doc.body.appendChild(ring);}
    var rect=el.getBoundingClientRect();
    ring.style.left=rect.left+'px';ring.style.top=rect.top+'px';ring.style.width=rect.width+'px';ring.style.height=rect.height+'px';ring.hidden=false;
  }
  /* A drag (an Explore pan, a text selection) still ends in a click; only a
     press that stayed put is a comment gesture. */
  function press(ev){down={x:ev.clientX,y:ev.clientY};}
  function click(ev){
    if(!on || !ctrl || ev.button)return;
    var el=target(ev);if(!el)return;
    ev.preventDefault();ev.stopPropagation();
    var moved=ev.detail && down && Math.abs(ev.clientX-down.x)+Math.abs(ev.clientY-down.y)>6;down=null;
    if(moved || el.closest('[data-uncommentable]'))return;
    try{
      var pointer=ev.detail?{clientX:ev.clientX,clientY:ev.clientY}:undefined,chip=stepChip(el),anchor,at;
      if(chip){anchor=ctrl.domAnchor(chip)[0];at=pointer?{x:pointer.clientX+win.scrollX,y:pointer.clientY+win.scrollY}:el;}
      else{var pair=ctrl.domAnchor(el,pointer);anchor=pair[0];at=pair[1];}
      var info=describe(el),opts={};
      if(info.label)opts.label=info.label;if(info.detail)opts.detail=info.detail;
      Promise.resolve(ctrl.compose(anchor,at,opts)).catch(function(){});
    }catch(ex){}
  }
  function mode(value){
    try{
      value=!!value;if(value===on)return;on=value;
      doc.documentElement.classList.toggle('dv-commenting',on);
      if(on){doc.addEventListener('pointerdown',press,true);doc.addEventListener('click',click,true);doc.addEventListener('pointerover',hover,true);doc.addEventListener('pointerout',leave,true);win.addEventListener('scroll',hideRing,true);return;}
      doc.removeEventListener('pointerdown',press,true);doc.removeEventListener('click',click,true);doc.removeEventListener('pointerover',hover,true);doc.removeEventListener('pointerout',leave,true);win.removeEventListener('scroll',hideRing,true);
      if(ring){ring.remove();ring=null;}
      threads=[];last=null;observe();
    }catch(ex){}
  }
  function setThreads(list){
    try{threads=Array.isArray(list)?list.slice(0,256):[];observe();}catch(ex){threads=[];}
    safeReport(true);
  }
  function show(el){
    if(!rendered(el))return;
    var reduced=typeof win.matchMedia==='function' && win.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({block:'center',inline:'nearest',behavior:reduced?'auto':'smooth'});
  }
  /* Tab select, View ensure and the stepper's own jump each write the address
     bar as reader navigation does. */
  function reveal(id){
    try{
      var thread=threads.find(function(t){return t && t.id===id;}),el=thread && resolve(thread.anchor);
      var at=thread && ctl.views && ctl.views.viewAt && ctl.views.viewAt(el || nearest(thread.anchor));
      if(!el && !at)return;
      tabsOf(el || at.owner.slots.get(at.definition.key)).forEach(function(tab){if(tab.block.active()!==tab.index)tab.block.select(tab.index,false);});
      if(at && !at.current){ctl.views.showView(at);el=resolve(thread.anchor);if(!el)return;}
      var rec=sectionOf(el);
      if(rec && ctl.views && !rec.detailOnly && !rendered(rec.sectionEl))ctl.views.ensure(rec,undefined,false);
      if(el.classList.contains('schip') && rec && rec.stepper && rec.stepper.jumpSource){
        var source=Number(el.getAttribute('data-step-source')),path=el.getAttribute('data-step-path');
        var bar=el.closest('.termbar');
        if(isFinite(source))rec.stepper.jumpSource(source,path || undefined);
        // Re-resolve: a path change repaints the step buttons.
        var line=bar && bar.isConnected?bar.querySelector('.stepline:not(.dv-caption-old)'):null;
        show(line && rendered(line)?bar:resolve(thread.anchor));
      }else{
        if(rec && rec.prose && rec.prose.collapsed && rec.prose.proseEl.contains(el) && setProseCollapsed(rec.prose,false,false,win) && ctl.onChange)ctl.onChange();
        show(el);
      }
      safeReport(false);schedule();
    }catch(ex){}
  }
  var pending;
  try{pending=claude.use('comments');}catch(ex){return null;}
  Promise.resolve(pending).then(function(comments){
    if(!comments || typeof comments.customAnchors!=='function')return;
    return comments.customAnchors({mode:mode,threads:setThreads,reveal:reveal,composing:function(){}}).then(function(controller){
      if(!controller)return;
      if(ctl.views && ctl.views.useSlots)ctl.views.useSlots();
      ctrl=controller;listen();safeReport(true);
    });
  }).catch(function(){ctrl=null;mode(false);});
  return {active:function(){return !!ctrl;}};
}
