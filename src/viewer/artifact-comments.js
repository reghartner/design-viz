/* claude.ai artifact comment anchoring. Tab panels and Views hide content
   with `hidden`, so the shell's own CSS-path anchoring cannot show or reach a
   comment on a non-active Tab/View. When the artifact declares the comments
   capability with customAnchors, the page reports pins only for rendered
   subjects, labels new comments with their Tab/View/section and switches Tab
   and View for the shell's "Go to". Without window.claude, a null namespace or
   a refused registration this module stays entirely inert. */
var ARTIFACT_COMMENT_PASS='.explore-navigation,[role="tab"]';
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
  var doc=win.document,ctrl=null,on=false,threads=[],offsets=Object.create(null),frame=0,last=null,ring=null,listening=false,mutations=null,bySection=null,down=null;
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
  function rendered(el){
    if(!el || !el.isConnected || el.closest('[hidden]') || !el.getClientRects().length)return false;
    return typeof el.checkVisibility!=='function' || el.checkVisibility({visibilityProperty:true});
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
    threads.forEach(function(thread){
      var el=resolve(thread && thread.anchor);if(!rendered(el))return;
      var rect=el.getBoundingClientRect(),at=offsets[thread.anchor] || [.5,.5];
      map[thread.id]={x:Math.round(rect.left+rect.width*at[0]+win.scrollX),y:Math.round(rect.top+rect.height*at[1]+win.scrollY)};
    });
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
    if(want && typeof MutationObserver!=='undefined'){mutations=new MutationObserver(schedule);mutations.observe(view,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','class','style','open']});}
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
      var pointer=ev.detail?{clientX:ev.clientX,clientY:ev.clientY}:undefined,pair=ctrl.domAnchor(el,pointer);
      var rect=el.getBoundingClientRect();
      if(pointer && rect.width && rect.height)offsets[pair[0]]=[Math.max(0,Math.min(1,(ev.clientX-rect.left)/rect.width)),Math.max(0,Math.min(1,(ev.clientY-rect.top)/rect.height))];
      var info=describe(el),opts={};
      if(info.label)opts.label=info.label;if(info.detail)opts.detail=info.detail;
      Promise.resolve(ctrl.compose(pair[0],pair[1],opts)).catch(function(){});
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
  function reveal(id){
    try{
      var thread=threads.find(function(t){return t && t.id===id;}),el=thread && resolve(thread.anchor);
      if(!el)return;
      tabsOf(el).forEach(function(tab){if(tab.block.active()!==tab.index)tab.block.select(tab.index,false);});
      var rec=sectionOf(el);
      if(rec && ctl.views && !rec.detailOnly && !rendered(el))ctl.views.ensure(rec,undefined,false);
      if(rec && rec.prose && rec.prose.collapsed && rec.prose.proseEl.contains(el) && setProseCollapsed(rec.prose,false,false,win) && ctl.onChange)ctl.onChange();
      if(!rendered(el))return;
      var reduced=typeof win.matchMedia==='function' && win.matchMedia('(prefers-reduced-motion: reduce)').matches;
      el.scrollIntoView({block:'center',inline:'nearest',behavior:reduced?'auto':'smooth'});
      safeReport(false);schedule();
    }catch(ex){}
  }
  var pending;
  try{pending=claude.use('comments');}catch(ex){return null;}
  Promise.resolve(pending).then(function(comments){
    if(!comments || typeof comments.customAnchors!=='function')return;
    return comments.customAnchors({mode:mode,threads:setThreads,reveal:reveal,composing:function(){}}).then(function(controller){
      if(!controller)return;
      ctrl=controller;listen();safeReport(true);
    });
  }).catch(function(){ctrl=null;mode(false);});
  return {active:function(){return !!ctrl;}};
}
