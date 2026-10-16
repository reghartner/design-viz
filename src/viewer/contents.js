/* Shared document shell over the Tab View controller. Original utility DOM
   stays owned by createExploreNavigation; this controller owns only its tree,
   reader zoom and temporary presentation state, never authored source. */
function createReaderContents(ctl,nav,actions,options){
  var doc=ctl.view.ownerDocument,view=ctl.view,retired=false,current=null,viewportRecord=null,owner=null,members=[],narrow=false,opened=typeof options.initialOpen==='boolean'?options.initialOpen:null,pinnedTop=null,scrollHeld=false,holdFrame=0;
  var expandedTabs=new Set(),collapsedViews=new Set(),standardZoom=new Map(),moved=[];
  function element(tag,cls,text,parent){var el=doc.createElement(tag);el.className=cls;if(text)el.textContent=text;if(parent)parent.appendChild(el);return el;}
  function button(label,text,parent,fn){var el=element('button','reader-button',text,parent);el.type='button';el.setAttribute('aria-label',label);el.title=label;
    var paths={'☰':'M4 6h16M4 12h16M4 18h16','‹':'m14 6-6 6 6 6','›':'m9 6 6 6-6 6','«':'M9 4H4v16h16V4h-5M14 8l-4 4 4 4','⋯':'M5 12h.01M12 12h.01M19 12h.01'};
    if(paths[text])el.innerHTML='<svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="'+paths[text]+'"/></svg>';
    el.addEventListener('click',fn);return el;}
  nav.classList.add('reader-navigation');view.classList.add('has-reader-contents');
  var top=element('div','reader-top',null,nav),toggle=button('Open Contents','☰',top,function(){setOpen(!opened,true,true);});
  var breadcrumb=element('div','reader-breadcrumb',null,top),tabLabel=element('span','reader-tab-label',null,breadcrumb);
  var viewStrip=element('div','reader-view-strip',null,top);viewStrip.setAttribute('role','tablist');viewStrip.setAttribute('aria-label','Views in selected Tab');top.appendChild(actions);
  var utilities=element('details','reader-utilities',null,actions),utilitySummary=element('summary','reader-button','⋯',utilities);utilitySummary.setAttribute('aria-label','More actions');
  var utilityBody=element('div','reader-utility-options',null,utilities);
  var toolbar=element('div','reader-toolbar',null,nav),zoomGroup=element('div','reader-zoom-controls',null,toolbar);
  var zoomScope=options.zoomLabels?element('span','reader-zoom-scope','Canvas zoom',zoomGroup):null;
  var minus=button('Zoom out','−',zoomGroup,function(){zoomBy(.8);});
  var zoomMenu=element('details','reader-zoom-menu',null,zoomGroup),zoomSummary=element('summary','reader-button','100%',zoomMenu);zoomSummary.setAttribute('aria-label','Zoom');
  var zoomOptions=element('div','reader-zoom-options',null,zoomMenu);
  [50,75,100,125,150,200].forEach(function(percent){button('Zoom '+percent+'%',percent+'%',zoomOptions,function(){setZoom(percent/100);zoomMenu.open=false;zoomSummary.focus();});});
  var plus=button('Zoom in','+',zoomGroup,function(){zoomBy(1.25);});
  var pager=element('div','reader-page-index',null,toolbar);pager.setAttribute('role','group');pager.setAttribute('aria-label','Pages in selected View');
  var previous=button('Previous Page','‹',pager,function(){pageBy(-1);}),pageLabel=element('span','reader-page-label',null,pager),next=button('Next Page','›',pager,function(){pageBy(1);});pageLabel.setAttribute('aria-live','polite');
  var fit=button('Fit','Fit',toolbar,function(){var handled=options.fit && options.fit(current,viewportRecord,owner)!==false;if(!handled && viewportRecord && viewportRecord.viewport && viewportRecord.viewport.isExplore())viewportRecord.viewport.fitCanvas();else if(!handled)setZoom(1);updateZoom();});
  var scrim=button('Close Contents','',nav,function(){setOpen(false,true,true);});scrim.classList.add('reader-scrim');scrim.tabIndex=-1;
  var sidebar=element('aside','reader-contents',null,nav);sidebar.setAttribute('aria-label','Contents');
  var heading=element('div','reader-contents-heading',null,sidebar);element('strong','','Contents',heading);button('Close Contents','«',heading,function(){setOpen(false,true,true);});
  var tree=element('div','reader-contents-tree',null,sidebar);
  var destinations=element('div','reader-document-links',null,sidebar);
  (ctl.documentDestinations || []).forEach(function(item){
    var row=element('div','reader-document-link',null,destinations),link=element('a','reader-button',item.label,row);link.href=item.url;link.target='_blank';link.rel='noopener noreferrer';
    var copy=button('Copy '+(item.kind==='claude'?'Claude link':'internal site link'),'Copy',row,function(){});bindCopyControl(window,copy,function(){return item.url;});
  });
  destinations.hidden=!destinations.children.length;
  var footer=element('div','reader-theme-footer',null,sidebar);element('span','reader-theme-label','Theme',footer);
  var themeMenu=element('details','reader-theme-menu',null,footer),themeSummary=element('summary','reader-button',null,themeMenu);themeSummary.setAttribute('aria-label','Choose theme');
  var themeOptions=element('div','reader-theme-options',null,themeMenu);themeOptions.setAttribute('role','menu');themeOptions.setAttribute('aria-label','Themes');
  SELECTABLE_SKINS.forEach(function(skin){var choice=button(skinLabel(skin),skinLabel(skin),themeOptions,function(){if(typeof window.dvSetSkin==='function')window.dvSetSkin(skin);applySkinClasses(document.body,view,skin);themeMenu.open=false;themeSummary.focus();});choice.setAttribute('role','menuitemradio');choice.setAttribute('data-reader-skin',skin);});
  function updateTheme(ev){
    var skin=ev && ev.detail && ev.detail.skin || SKIN_NAMES.slice().reverse().find(function(name){return view.classList.contains('sk-'+name);}) || DEFAULT_SKIN;
    themeSummary.textContent=skinLabel(skin)+'　⌃';themeSummary.setAttribute('data-current-skin',skin);
    themeOptions.querySelectorAll('[data-reader-skin]').forEach(function(choice){choice.setAttribute('aria-checked',String(choice.getAttribute('data-reader-skin')===skin));});
  }
  function focusable(){return Array.from(sidebar.querySelectorAll('button,summary,a[href],input')).filter(function(el){return el.getClientRects().length && !el.disabled;});}
  function setOpen(value,focus,remember){
    opened=value;sidebar.hidden=!value;scrim.hidden=!value || !narrow;view.classList.toggle('reader-contents-open',value);toggle.setAttribute('aria-expanded',String(value));toggle.setAttribute('aria-label',value?'Close Contents':'Open Contents');toggle.title=value?'Close Contents':'Open Contents';
    if(remember && options.onOpenChange)options.onOpenChange(value);
    if(!value)themeMenu.open=false;geometry();
    if(focus)(value?tree.querySelector('[aria-current="page"]') || focusable()[0]:toggle).focus({preventScroll:true});
  }
  function geometry(){
    if(retired || !nav.isConnected)return;
    var rect=nav.getBoundingClientRect(),root=view.getRootNode(),host=root.host && root.host.getBoundingClientRect(),bottom=host?Math.min(window.innerHeight,host.bottom):window.innerHeight;
    // Hidden layouts and browser full-page capture can report a 0–1px viewport.
    // Preserve the last real layout until usable bounds return.
    if(rect.width<=1)return;
    nav.classList.toggle('reader-wrapped',rect.width<=900);
    var nextNarrow=rect.width<=670;if(nextNarrow!==narrow){narrow=nextNarrow;nav.classList.toggle('reader-narrow',narrow);
      // A desktop push sidebar must not become an unsolicited modal overlay.
      if(narrow && opened){var focused=root.activeElement || doc.activeElement;setOpen(false,sidebar.contains(focused),false);}
    }
    if(opened===null){opened=!narrow;sidebar.hidden=!opened;toggle.setAttribute('aria-expanded',String(opened));toggle.setAttribute('aria-label',opened?'Close Contents':'Open Contents');toggle.title=opened?'Close Contents':'Open Contents';view.classList.toggle('reader-contents-open',opened);if(options.onOpenChange)options.onOpenChange(opened);}
    var containerRect=options.container && (options.container!==document.body || host) && options.container.getBoundingClientRect();if(containerRect)bottom=Math.min(bottom,containerRect.bottom);
    var width=Math.max(0,Math.min(284,rect.width-42));
    sidebar.style.left=rect.left+'px';sidebar.style.top=rect.bottom+'px';sidebar.style.width=width+'px';sidebar.style.height=Math.max(0,bottom-rect.bottom)+'px';
    scrim.style.left=rect.left+'px';scrim.style.top=rect.bottom+'px';scrim.style.width=rect.width+'px';scrim.style.height=Math.max(0,bottom-rect.bottom)+'px';scrim.hidden=!opened || !narrow;
    view.style.setProperty('--reader-left',rect.left+'px');view.style.setProperty('--reader-width',rect.width+'px');
    var inset=opened && !narrow?width+'px':'0px';view.style.setProperty('--reader-inset',inset);if(options.insetTarget)options.insetTarget.style.setProperty('--reader-host-inset',inset);
    themeOptions.style.maxHeight=Math.max(70,bottom-rect.bottom-110)+'px';
  }
  function title(rec){var record=rec && rec.viewOwner && rec.viewOwner.records.find(function(r){return r.runtime===rec;});return record && record.section.heading || rec && rec.sectionEl.querySelector('.sec-h')?.textContent || 'Section';}
  function ownerLabel(item){return item.source.label || item.source.title || 'Document';}
  function embedded(){return ctl.sections.find(function(section){return section.sectionEl.classList.contains('dv-embed-target');});}
  function choose(item,definition,rec,fromTop){
    rec=embedded() || rec;
    if(item.tabBlock)ctl.tabBlocks[item.tabBlock-1].select(item.tab,false);
    expandedTabs.add(item.path);
    ctl.views.select(item.records[0].runtime,definition.id,rec);
    var target=rec || item.selected;if(target && options.selectSection){options.selectSection(target);pinnedTop=target.sectionEl.getBoundingClientRect().top;}
    if(narrow)setOpen(false,!fromTop);
  }
  function drawViews(){
    var root=view.getRootNode(),focused=root.activeElement || doc.activeElement;
    var focusKey=viewStrip.contains(focused) && focused.getAttribute('data-reader-key'),embed=embedded();
    viewStrip.replaceChildren();
    if(owner)owner.views.filter(function(definition){return !embed || definition.members.some(function(member){return member.record.runtime===embed;});}).forEach(function(definition){
      var item=owner,key=item.path+':'+definition.id;
      var choice=button(definition.name,definition.name,viewStrip,function(){
        choose(item,definition,null,true);
        // Selection can synchronously rebuild both navigation surfaces. Restore
        // the activated control, including focus inside a native ShadowRoot.
        var replacement=Array.from(viewStrip.children).find(function(el){return el.getAttribute('data-reader-key')===key;});
        if(replacement)replacement.focus({preventScroll:true});
      });
      choice.classList.add('reader-top-view');choice.setAttribute('role','tab');choice.setAttribute('data-tab-view',definition.id);choice.setAttribute('data-reader-key',key);choice.setAttribute('aria-selected',String(item.current===definition));choice.tabIndex=item.current===definition?0:-1;
    });
    if(focusKey){var target=Array.from(viewStrip.children).find(function(el){return el.getAttribute('data-reader-key')===focusKey;});if(target){Array.from(viewStrip.children).forEach(function(choice){choice.tabIndex=choice===target?0:-1;});target.focus({preventScroll:true});}}
  }
  function drawTree(){
    var focused=doc.activeElement,root=view.getRootNode();if(root.activeElement)focused=root.activeElement;
    var focusKey=tree.contains(focused) && focused.getAttribute('data-reader-key'),scroll=tree.scrollTop;
    tree.replaceChildren();
    (ctl.views?ctl.views.owners:[]).forEach(function(item){
      var embed=embedded();if(!item.views.length || embed && ctl.views.owner(embed)!==item)return;
      var tab=element('div','reader-contents-tab',null,tree),tabButton=button(ownerLabel(item),ownerLabel(item),tab,function(){if(expandedTabs.has(item.path))expandedTabs.delete(item.path);else expandedTabs.add(item.path);drawTree();});
      tabButton.classList.add('reader-tree-tab');tabButton.setAttribute('aria-expanded',String(expandedTabs.has(item.path)));tabButton.setAttribute('data-reader-key','tab:'+item.path);
      if(!expandedTabs.has(item.path))return;
      var views=element('div','reader-tree-views',null,tab);
      item.views.filter(function(definition){return !embed || definition.members.some(function(member){return member.record.runtime===embed;});}).forEach(function(definition){
        var key=item.path+':'+definition.id,selected=item===owner && item.current===definition,explore=definition.presentation==='explore';
        var row=element('div','reader-tree-view-row',null,views),choice=button(definition.name,definition.name,row,function(){choose(item,definition);});choice.classList.add('reader-tree-view');choice.setAttribute('data-tab-view',definition.id);choice.setAttribute('data-owner-selected',String(item.current===definition));choice.setAttribute('data-reader-key',key);choice.setAttribute('aria-current',selected?'page':'false');choice.setAttribute('aria-pressed',String(selected));if(explore){choice.setAttribute('data-explore-view','true');choice.setAttribute('aria-description','Explore: pan and zoom the graph.');}
        var expanded=!collapsedViews.has(key),disclosure=button((expanded?'Collapse ':'Expand ')+definition.name,expanded?'⌄':'›',row,function(){if(collapsedViews.has(key))collapsedViews.delete(key);else collapsedViews.add(key);drawTree();});disclosure.classList.add('reader-view-disclosure');disclosure.setAttribute('aria-expanded',String(expanded));disclosure.setAttribute('data-reader-key',key+':disclosure');
        if(expanded){
          var sections=element('ol','reader-tree-sections',null,views);sections.setAttribute('data-reader-view',definition.id);
          definition.members.filter(function(member){return !embed || member.record.runtime===embed;}).forEach(function(member,index){var rec=member.record.runtime,li=element('li','',null,sections),choice=button(title(rec),title(rec),li,function(){choose(item,definition,rec);});choice.classList.add('reader-tree-section');choice.setAttribute('data-reader-section',rec.reference);choice.setAttribute('data-reader-key',key+':'+rec.number);choice.setAttribute('aria-current',selected && current===rec?'page':'false');choice.setAttribute('data-page-number',String(index+1));});
        }
      });
    });
    tree.scrollTop=scroll;
    if(focusKey){var target=Array.from(tree.querySelectorAll('[data-reader-key]')).find(function(el){return el.getAttribute('data-reader-key')===focusKey;});if(target)target.focus({preventScroll:true});}
  }
  function pageBy(delta){var target=members[members.indexOf(current)+delta];if(target && options.selectSection){options.selectSection(target);pinnedTop=target.sectionEl.getBoundingClientRect().top;}}
  function zoom(){return viewportRecord && viewportRecord.viewport && viewportRecord.viewport.isExplore()?viewportRecord.viewport.canvasZoom():standardZoom.get(owner && owner.current) || 1;}
  function setZoom(value){if(!current)return;if(viewportRecord && viewportRecord.viewport && viewportRecord.viewport.isExplore())viewportRecord.viewport.canvasZoom(value);else{value=Math.max(.5,Math.min(2,value));standardZoom.set(owner && owner.current,value);members.forEach(function(rec){rec.sectionEl.style.zoom=value;});}updateZoom();}
  function zoomBy(factor){setZoom(zoom()*factor);}
  function updateZoom(){var value=zoom();zoomSummary.textContent=(Number.isFinite(value)?Math.round(value*100):100)+'% ⌄';minus.disabled=plus.disabled=fit.disabled=!current;
    if(zoomScope){var vp=viewportRecord && viewportRecord.viewport,scope=vp && vp.isExplore() && vp.panelPlacement()!=='canvas'?'Diagram':'Canvas';zoomScope.textContent=scope+' zoom';zoomSummary.setAttribute('aria-label',scope+' zoom');minus.setAttribute('aria-label',scope+' zoom out');plus.setAttribute('aria-label',scope+' zoom in');fit.textContent='Fit '+scope.toLowerCase();fit.setAttribute('aria-label',fit.textContent);}
  }
  function release(){moved.slice().reverse().forEach(function(entry){if(nav.contains(entry.node) && entry.anchor.parentNode)entry.anchor.before(entry.node);entry.anchor.remove();});moved=[];}
  function refresh(rec,actual){
    if(retired)return;
    current=rec;viewportRecord=actual || rec;owner=ctl.views && ctl.views.owner(rec);members=ctl.views?ctl.views.members(rec):[];if(embedded())members=members.filter(function(member){return member===embedded();});
    ctl.sections.forEach(function(section){section.sectionEl.style.removeProperty('zoom');});
    if(owner && owner.current.presentation==='standard' && !(options.isCanvas && options.isCanvas()))members.forEach(function(section){section.sectionEl.style.zoom=standardZoom.get(owner.current) || 1;});
    nav.setAttribute('data-reader-multiple-views',String(!!(owner && owner.views.length>1)));
    tabLabel.textContent=owner?ownerLabel(owner):'Document';tabLabel.title=tabLabel.textContent;
    if(owner)expandedTabs.add(owner.path);
    var index=members.indexOf(current);pageLabel.textContent='Page '+(index+1 || 1)+' of '+(members.length || 1);previous.disabled=index<=0;next.disabled=index<0 || index>=members.length-1;
    // Shared utility controls remain live. Ordinary readers surface the hidden
    // Tab bar's real copy control; a host-owned share action consolidates it.
    release();
    if(!options.singleShareAction && !options.skipTabShare && owner && owner.tabBlock){var block=ctl.tabBlocks[owner.tabBlock-1],copy=block.copyButtons[owner.tab];if(copy){var anchor=doc.createComment('reader tab copy');copy.before(anchor);actions.prepend(copy);moved.push({node:copy,anchor:anchor});}}
    Array.from(actions.children).filter(function(node){return node!==utilities && !node.classList.contains('viewport-actions');}).forEach(function(node){var anchor=doc.createComment('reader utility');node.before(anchor);utilityBody.appendChild(node);moved.push({node:node,anchor:anchor});});
    var expand=actions.querySelector('.viewport-expand');if(expand){var anchor=doc.createComment('reader expand');expand.before(anchor);utilityBody.appendChild(expand);moved.push({node:expand,anchor:anchor});}
    utilities.hidden=!utilityBody.children.length;
    var sizing=viewportRecord && viewportRecord.sectionEl && viewportRecord.viewport && viewportRecord.viewport.isExplore() && viewportRecord.sectionEl.querySelector('.board-size');if(sizing){var anchor=doc.createComment('reader diagram sizing');sizing.before(anchor);zoomOptions.prepend(sizing);moved.push({node:sizing,anchor:anchor});}
    scrollHeld=true;cancelAnimationFrame(holdFrame);holdFrame=requestAnimationFrame(function(){scrollHeld=false;pinnedTop=current && current.sectionEl.getBoundingClientRect().top;});
    drawViews();drawTree();updateZoom();updateTheme();geometry();
  }
  function keydown(ev){
    if(viewStrip.contains(ev.target) && (ev.key==='Enter' || ev.key===' '))ev.stopPropagation();
    if(viewStrip.contains(ev.target) && ['ArrowRight','ArrowLeft','Home','End'].indexOf(ev.key)>=0){
      ev.preventDefault();ev.stopPropagation();var choices=Array.from(viewStrip.children),index=choices.indexOf(ev.target);
      index=ev.key==='Home'?0:ev.key==='End'?choices.length-1:(index+(ev.key==='ArrowRight'?1:-1)+choices.length)%choices.length;
      choices.forEach(function(choice,i){choice.tabIndex=i===index?0:-1;});choices[index].focus({preventScroll:true});
    }

    if(ev.key==='Escape'){
      if(themeMenu.open){ev.preventDefault();ev.stopPropagation();themeMenu.open=false;themeSummary.focus();}
      else if(zoomMenu.open){ev.preventDefault();ev.stopPropagation();zoomMenu.open=false;zoomSummary.focus();}
      else if(opened && (narrow || !(view.getRootNode().host || view).closest('dialog[open]')) && !view.querySelector('.viewport-expanded') && !ev.target.closest('details[open]')){ev.preventDefault();ev.stopPropagation();setOpen(false,true);}
    }
    if(ev.key==='Tab' && opened && narrow){var nodes=focusable(),first=nodes[0],last=nodes[nodes.length-1];if(ev.shiftKey && (ev.target===first || !sidebar.contains(ev.target))){ev.preventDefault();last.focus();}else if(!ev.shiftKey && (ev.target===last || !sidebar.contains(ev.target))){ev.preventDefault();first.focus();}}
    if(themeMenu.open && ['ArrowDown','ArrowUp','Home','End'].indexOf(ev.key)>=0 && themeMenu.contains(ev.target)){ev.preventDefault();var nodes=Array.from(themeOptions.querySelectorAll('button')),index=nodes.indexOf(ev.target);index=ev.key==='Home'?0:ev.key==='End'?nodes.length-1:(index+(ev.key==='ArrowDown'?1:-1)+nodes.length)%nodes.length;nodes[index].focus();}
  }
  if(opened!==null)setOpen(opened,false,false);
  var initialFrame=requestAnimationFrame(function(){if(retired)return;expandedTabs.clear();if(owner)expandedTabs.add(owner.path);drawTree();});
  nav.addEventListener('keydown',keydown,true);view.addEventListener('reader-skin-change',updateTheme);view.addEventListener('viewer-presentation-changing',release);view.addEventListener('reader-zoom-change',updateZoom);window.addEventListener('resize',geometry);window.addEventListener('scroll',geometry,true);
  function snapshot(){return {opened:opened,expanded:Array.from(expandedTabs),collapsed:Array.from(collapsedViews),zoom:(ctl.views?ctl.views.owners:[]).flatMap(function(item){return item.views.map(function(definition){return {owner:item.path,id:definition.id,value:standardZoom.get(definition) || 1};});})};}
  function restore(saved){if(!saved)return;cancelAnimationFrame(initialFrame);expandedTabs=new Set(saved.expanded || []);collapsedViews=new Set(saved.collapsed || []);(saved.zoom || []).forEach(function(entry){var item=ctl.views && ctl.views.owners.find(function(item){return item.path===entry.owner;}),definition=item && item.views.find(function(definition){return definition.id===entry.id;});if(definition)standardZoom.set(definition,entry.value);});setOpen(saved.opened===true,false,false);refresh(current,viewportRecord);}
  return {snapshot:snapshot,restore:restore,setOpen:function(value){setOpen(value,false,false);},refresh:refresh,geometry:geometry,release:release,retainScroll:function(){if(scrollHeld)return true;if(pinnedTop===null || !current)return false;if(Math.abs(current.sectionEl.getBoundingClientRect().top-pinnedTop)<1)return true;pinnedTop=null;return false;},destroy:function(){retired=true;cancelAnimationFrame(initialFrame);cancelAnimationFrame(holdFrame);release();view.removeEventListener('reader-skin-change',updateTheme);view.removeEventListener('viewer-presentation-changing',release);view.removeEventListener('reader-zoom-change',updateZoom);nav.removeEventListener('keydown',keydown,true);window.removeEventListener('resize',geometry);window.removeEventListener('scroll',geometry,true);view.classList.remove('has-reader-contents','reader-contents-open');view.style.removeProperty('--reader-inset');view.style.removeProperty('--reader-left');view.style.removeProperty('--reader-width');if(options.insetTarget)options.insetTarget.style.removeProperty('--reader-host-inset');ctl.sections.forEach(function(rec){rec.sectionEl.style.removeProperty('zoom');});}};
}
