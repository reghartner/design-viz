/* claude.ai artifact comment anchoring.
   Comment subjects (section heading, prose paragraphs and bullets, diagram
   nodes, panels, contract cards/rows) carry fixed ids derived from page data,
   so the shell's own-id anchors (`#<id>`) survive View reordering and
   republishes that keep the data. Tab panels and Views hide content with
   `hidden`, so when the artifact also declares comments with customAnchors the
   page places pins itself: only rendered subjects are placed, the step caption
   carries a per-step id, new comments are labelled Tab first and "Go to"
   switches Tab, View and step through the normal navigation. Without
   window.claude, a null namespace or a refused registration only the static
   ids remain; the step caption keeps no id. */
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
function artifactCommentPart(value,fallback){
  var text=String(value==null?'':value).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
  return text || fallback;
}
/* Comment id -> {section, tabBlock, tab, views, step?}. Ids are claimed in
   page-data order with a numeric suffix on collision, so equal data always
   yields equal ids. The `c-` prefix is not used by any other renderer id. */
function artifactCommentRegistry(ctl,page,doc){
  var used=Object.create(null),entries=Object.create(null),sections=Object.create(null);
  function claim(base){var id=base,n=2;while(used[id] || doc.getElementById(id))id=base+'-'+n++;used[id]=true;return id;}
  sectionRecords(page).forEach(function(record){
    var rec=ctl.sections.find(function(r){return r.number===record.number;});if(!rec)return;
    var sec=record.section || {},d=sec.diagram && typeof sec.diagram==='object'?sec.diagram:null,root='c-'+artifactCommentPart(rec.reference,'section-'+rec.number);
    var owner=ctl.views && ctl.views.owner(rec),views=owner?owner.views.filter(function(v){return v.members.some(function(m){return m.record.runtime===rec;});}).map(function(v){return v.id;}):[];
    var map={heading:null,paras:{},bullets:{},nodes:{},panels:{},steps:{}};
    function add(suffix,kind,extra){var id=claim(root+suffix);entries[id]=Object.assign({id:id,kind:kind,section:rec.number,tabBlock:rec.tabBlock,tab:rec.tab,views:views},extra || {});return id;}
    map.heading=add('-heading','heading');
    (typeof sec.text==='string'?[sec.text]:Array.isArray(sec.text)?sec.text:[]).forEach(function(t,i){map.paras[i]=add('-para-'+(i+1),'prose');});
    (Array.isArray(sec.bullets)?sec.bullets:[]).forEach(function(b,i){map.bullets[i]=add('-bullet-'+(i+1),'prose');});
    if(d){
      Object.keys(d.nodes || {}).forEach(function(key){map.nodes[key]=add('-node-'+artifactCommentPart(key,'node'),'node');});
      (Array.isArray(d.panels)?d.panels:[]).forEach(function(p,i){if(p && p.id)map.panels[i]=add('-panel-'+artifactCommentPart(p.id,'panel'),'panel');});
      (Array.isArray(d.steps)?d.steps:[]).forEach(function(st,i){map.steps[i]=add('-step-'+artifactCommentPart(st && typeof st.id==='string'?st.id:'',String(i+1)),'step',{step:i});});
    }
    sections[rec.number]=map;
  });
  return {entries:entries,sections:sections};
}
function wireArtifactComments(ctl,view,win,page){
  var doc=win.document,registry,bySection=null,claude=null;
  try{registry=artifactCommentRegistry(ctl,page,doc);}catch(ex){return null;}
  var ctrl=null,on=false,threads=[],offsets=Object.create(null),frame=0,last=null,ring=null,listening=false,mutations=null,down=null;
  function sectionOf(el){
    if(!bySection){bySection=new Map();ctl.sections.forEach(function(rec){bySection.set(rec.sectionEl,rec);});}
    for(var node=el;node;node=node.parentElement){var rec=bySection.get(node);if(rec)return rec;}
    return null;
  }
  function section(number){return ctl.sections.find(function(rec){return rec.number===number;});}
  function own(rec,selector){return Array.prototype.filter.call(rec.sectionEl.querySelectorAll(selector),function(el){return sectionOf(el)===rec;});}
  function assign(el,id){
    if(!el || !id)return;
    if(el.id!==id){var other=doc.getElementById(id);if(other && other!==el)return;el.id=id;}
    if(ctrl)el.setAttribute('data-comment-target','');
  }
  function stamp(rec){
    var map=registry.sections[rec.number];if(!map)return;
    own(rec,'.sec-heading-row').slice(0,1).forEach(function(el){assign(el,map.heading);});
    own(rec,'.sec-text[data-dv-para]').forEach(function(el){assign(el,map.paras[el.getAttribute('data-dv-para')]);});
    own(rec,'li[data-dv-bullet]').forEach(function(el){assign(el,map.bullets[el.getAttribute('data-dv-bullet')]);});
    own(rec,'.node[data-dv-node]').forEach(function(el){assign(el,map.nodes[el.getAttribute('data-dv-node')]);});
    own(rec,'.pwidget[data-dv-panel]').forEach(function(el){assign(el,map.panels[el.getAttribute('data-dv-panel')]);});
    /* Contract cards and rows already carry reference-derived ids. */
    own(rec,'.ctcard[id^="contract-"],.ctrow[id^="contract-"]').forEach(function(el){
      if(!registry.entries[el.id])registry.entries[el.id]={id:el.id,kind:'contract',section:rec.number,tabBlock:rec.tabBlock,tab:rec.tab};
      if(ctrl)el.setAttribute('data-comment-target','');
    });
    /* The shared caption names its step only while the page owns anchoring:
       the shell shows an anchor whose id is missing on every step. */
    if(ctrl && rec.stepper && rec.stepper.sourceIndex)own(rec,'.stepline:not(.dv-caption-old)').slice(0,1).forEach(function(el){assign(el,map.steps[rec.stepper.sourceIndex()]);});
  }
  function stampAll(){ctl.sections.forEach(function(rec){try{stamp(rec);}catch(ex){}});}
  stampAll();
  // A path change re-renders the board graph; its node ids return to render ids.
  view.addEventListener('dv:pathrender',function(ev){var rec=sectionOf(ev.target);if(rec)try{stamp(rec);}catch(ex){}});
  try{claude=win.claude;}catch(ex){claude=null;}
  if(!claude || typeof claude.use!=='function')return {registry:registry,active:function(){return false;}};
  function panelTab(panel){
    var id=panel.getAttribute('aria-labelledby');
    for(var b=0;b<ctl.tabBlocks.length;b++){var i=ctl.tabBlocks[b].buttons.findIndex(function(button){return button.id===id;});if(i>=0)return {block:ctl.tabBlocks[b],index:i};}
    return null;
  }
  function tabsOf(el){
    var out=[];for(var node=el;node;node=node.parentElement)if(node.getAttribute && node.getAttribute('role')==='tabpanel'){var tab=panelTab(node);if(tab)out.unshift(tab);}
    return out;
  }
  function ownId(anchor){var m=/^#([a-z0-9-]+)$/.exec(typeof anchor==='string'?anchor:'');return m && m[1];}
  function resolve(anchor){
    if(typeof anchor!=='string' || !anchor)return null;
    var id=ownId(anchor);if(id)return doc.getElementById(id);
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
    stampAll();
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
    if(want && typeof MutationObserver!=='undefined'){mutations=new MutationObserver(schedule);mutations.observe(view,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['hidden','class','style','open']});}
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
    return t;
  }
  /* The comment subject is the closest element carrying a registered id;
     elsewhere the shell's own rule (a marked target, else the element). */
  function subject(t){
    for(var node=t;node && node!==view;node=node.parentElement)if(node.id && registry.entries[node.id])return node;
    return t.closest('[data-comment-target]') || t;
  }
  function hideRing(){if(ring)ring.hidden=true;}
  function leave(ev){if(!ev.relatedTarget)hideRing();}
  function hover(ev){
    if(!on)return;var t=target(ev),el=t && subject(t);
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
    var t=target(ev);if(!t)return;
    ev.preventDefault();ev.stopPropagation();
    var moved=ev.detail && down && Math.abs(ev.clientX-down.x)+Math.abs(ev.clientY-down.y)>6;down=null;
    if(moved || t.closest('[data-uncommentable]'))return;
    try{
      var rec=sectionOf(t);if(rec)stamp(rec);
      var el=subject(t),pointer=ev.detail?{clientX:ev.clientX,clientY:ev.clientY}:undefined,pair=ctrl.domAnchor(el,pointer);
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
  function show(el){
    if(!rendered(el))return;
    var reduced=typeof win.matchMedia==='function' && win.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({block:'center',inline:'nearest',behavior:reduced?'auto':'smooth'});
    safeReport(false);schedule();
  }
  /* Registered ids navigate from data, so a step that is not shown (its id
     absent from the DOM) is still reachable. Tab select, View ensure and the
     stepper's own jump each write the address bar as reader navigation does. */
  function revealEntry(entry){
    var rec=section(entry.section);if(!rec)return;
    var block=rec.tabBlock!=null && ctl.tabBlocks[rec.tabBlock-1];
    if(block && block.active()!==rec.tab)block.select(rec.tab,false);
    if(ctl.views && !rec.detailOnly && !rendered(rec.sectionEl))ctl.views.ensure(rec,undefined,false);
    if(entry.step!=null && rec.stepper && rec.stepper.jumpSource && (rec.stepper.mode()!=='step' || rec.stepper.sourceIndex()!==entry.step))rec.stepper.jumpSource(entry.step);
    var el=doc.getElementById(entry.id);
    if(entry.kind==='prose' && rec.prose && rec.prose.collapsed && setProseCollapsed(rec.prose,false,false,win) && ctl.onChange)ctl.onChange();
    stamp(rec);el=doc.getElementById(entry.id);
    show(el);
  }
  function revealPath(el){
    tabsOf(el).forEach(function(tab){if(tab.block.active()!==tab.index)tab.block.select(tab.index,false);});
    var rec=sectionOf(el);
    if(rec && ctl.views && !rec.detailOnly && !rendered(el))ctl.views.ensure(rec,undefined,false);
    if(rec && rec.prose && rec.prose.collapsed && rec.prose.proseEl.contains(el) && setProseCollapsed(rec.prose,false,false,win) && ctl.onChange)ctl.onChange();
    show(el);
  }
  function reveal(id){
    try{
      var thread=threads.find(function(t){return t && t.id===id;});if(!thread)return;
      var own=ownId(thread.anchor),entry=own && registry.entries[own];
      if(entry){revealEntry(entry);return;}
      var el=resolve(thread.anchor);if(el)revealPath(el);
    }catch(ex){}
  }
  var pending;
  try{pending=claude.use('comments');}catch(ex){return {registry:registry,active:function(){return false;}};}
  Promise.resolve(pending).then(function(comments){
    if(!comments || typeof comments.customAnchors!=='function')return;
    return comments.customAnchors({mode:mode,threads:setThreads,reveal:reveal,composing:function(){}}).then(function(controller){
      if(!controller)return;
      ctrl=controller;stampAll();listen();safeReport(true);
    });
  }).catch(function(){ctrl=null;mode(false);});
  return {registry:registry,active:function(){return !!ctrl;}};
}
