/* The authoring control keeps its caller's select and commit wiring. Each open
   dialog owns a separate listener ledger, so a retired form cannot commit. */
function createFlowIconPicker(opts){
  var doc=opts.document,view=doc.defaultView,select=opts.select;
  var icons=typeof FlowIcons!=='undefined'?FlowIcons:view && view.FlowIcons;
  var retired=false,opened=null,staticCleanups=[],observer=null;
  var wrap=doc.createElement('span');wrap.className='flow-icon-control';
  var preview=doc.createElement('span');preview.className='flow-icon-preview';preview.setAttribute('aria-hidden','true');
  var browse=doc.createElement('button');browse.type='button';browse.className='flow-icon-browse';
  browse.textContent='Browse icons';browse.setAttribute('aria-haspopup','dialog');
  wrap.append(preview,select,browse);

  function metadata(id){
    return icons && icons.registry && Object.prototype.hasOwnProperty.call(icons.registry,id)?icons.registry[id]:null;
  }
  /* The field owns empty-value semantics: inheritance and declared defaults
     can opt in with data-icon-default-label before creating the picker. */
  function emptyLabel(){return select.getAttribute('data-icon-default-label') || '';}
  function name(id){var meta=metadata(id);return id?(meta && meta.label || id):emptyLabel() || 'Default';}
  function disabled(){return !!select.disabled || !!(select.matches && select.matches(':disabled'));}
  function current(){return !retired && wrap.isConnected && select.isConnected && wrap.contains(select);}
  function visual(target,id){
    target.replaceChildren();
    target.classList.toggle('flow-icon-default',!id);
    target.classList.toggle('flow-icon-unknown',!!id && !metadata(id));
    if(metadata(id) && icons.render)target.innerHTML=icons.render(id,{className:'flow-icon-art',label:''});
    else if(id)target.textContent='?';
  }
  function sync(){
    if(retired)return;
    visual(preview,select.value);preview.title=name(select.value);
    browse.disabled=disabled();wrap.setAttribute('aria-disabled',String(browse.disabled));
    if(opened && disabled())close(false);
  }
  function listen(target,type,callback){
    var guarded=function(event){if(!retired)callback(event);};
    var remove=opts.listen?opts.listen(target,type,guarded):null;
    if(!opts.listen)target.addEventListener(type,guarded);
    staticCleanups.push(typeof remove==='function'?remove:function(){target.removeEventListener(type,guarded);});
  }
  function focusOwner(opener){
    if(current() && !disabled() && opener && opener.isConnected && wrap.contains(opener))opener.focus({preventScroll:true});
  }
  function close(restore){
    var state=opened;if(!state)return;opened=null;state.active=false;
    state.cleanups.forEach(function(remove){remove();});state.cleanups=[];
    /* Removing a retired modal also leaves the top layer without asking the
       browser to restore focus into a form that is being replaced. */
    if(!retired && state.dialog.open && state.dialog.close)state.dialog.close();
    state.dialog.remove();browse.setAttribute('aria-expanded','false');
    if(restore!==false)focusOwner(state.opener);
  }
  function open(){
    if(!current() || disabled() || opened || !icons)return;
    var dialog=doc.createElement('dialog');dialog.className='flow-icon-picker';
    dialog.setAttribute('aria-label','Choose an icon');
    var state={dialog:dialog,active:true,cleanups:[],opener:doc.activeElement};opened=state;
    function active(){return !retired && opened===state && state.active && current();}
    function own(target,type,callback){
      var guarded=function(event){if(active())callback(event);};
      target.addEventListener(type,guarded);
      state.cleanups.push(function(){target.removeEventListener(type,guarded);});
    }
    function element(tag,className,text){
      var node=doc.createElement(tag);node.className=className;if(text!=null)node.textContent=text;return node;
    }
    var header=element('header','flow-icon-header');
    var heading=element('div','flow-icon-heading');
    heading.append(element('span','flow-icon-kicker','Icon library'),element('h2','flow-icon-title','Choose an icon'),
      element('p','flow-icon-intro','Find a little character for your diagram.'));
    var dismiss=element('button','flow-icon-close','×');dismiss.type='button';dismiss.setAttribute('aria-label','Close icon picker');
    header.append(heading,dismiss);
    var filters=element('div','flow-icon-filters');
    var searchLabel=element('label','flow-icon-search-label');
    searchLabel.appendChild(element('span','flow-icon-field-label','Search icons'));
    var search=element('input','flow-icon-search');search.type='search';search.placeholder='Search icons…';search.autocomplete='off';
    searchLabel.appendChild(search);
    var categoryLabel=element('label','flow-icon-category-label');
    categoryLabel.appendChild(element('span','flow-icon-field-label','Category'));
    var category=element('select','flow-icon-category');
    var all=element('option','','All categories');all.value='';category.appendChild(all);
    var ids=Array.from(icons.ids || []).filter(function(id){return !!metadata(id);});
    var categories=Array.from(new Set(ids.map(function(id){return metadata(id).category || 'Other';})));
    categories.sort(function(a,b){return a.localeCompare(b);}).forEach(function(label){
      var option=element('option','',label);option.value=label;category.appendChild(option);
    });
    categoryLabel.appendChild(category);filters.append(searchLabel,categoryLabel);
    var resultBar=element('div','flow-icon-result-bar');
    var count=element('span','flow-icon-count');count.setAttribute('role','status');count.setAttribute('aria-live','polite');
    resultBar.append(count,element('span','flow-icon-apply-note','Choose a tile to apply'));
    var scroll=element('div','flow-icon-results');
    var grid=element('div','flow-icon-grid');grid.setAttribute('role','group');grid.setAttribute('aria-label','Icon choices');
    var empty=element('p','flow-icon-empty','No icons match. Try a different name or category.');
    scroll.append(grid,empty);
    var footer=element('footer','flow-icon-footer');
    var selected=element('span','flow-icon-current');
    var selectedArt=element('span','flow-icon-current-art');selectedArt.setAttribute('aria-hidden','true');visual(selectedArt,select.value);
    selected.append(selectedArt,element('span','','Current: '+name(select.value)));
    footer.append(selected,element('span','flow-icon-key-hint','Arrow keys to browse · Esc to close'));
    dialog.append(header,filters,resultBar,scroll,footer);

    function tile(id){
      var button=element('button','flow-icon-tile');button.type='button';button.dataset.iconId=id;
      button.setAttribute('aria-pressed',String(id===select.value));button.tabIndex=-1;
      var art=element('span','flow-icon-tile-art');art.setAttribute('aria-hidden','true');visual(art,id);
      var title=name(id),emptyDescription=emptyLabel() || 'Use field default';
      button.title=id?title+' · '+id:emptyLabel() || 'Use this field’s default icon';
      button.append(art,element('span','flow-icon-tile-label',title));
      if(!id && emptyDescription!==title)button.appendChild(element('span','flow-icon-tile-detail',emptyDescription));
      var check=element('span','flow-icon-tile-check','✓');check.setAttribute('aria-hidden','true');button.appendChild(check);
      return button;
    }
    function render(){
      var words=search.value.trim().toLowerCase().split(/\s+/).filter(Boolean),group=category.value;
      var matches=ids.filter(function(id){
        var meta=metadata(id),text=[meta.label,id,meta.category].join(' ').toLowerCase();
        return (!group || (meta.category || 'Other')===group) && words.every(function(word){return text.includes(word);});
      });
      grid.replaceChildren();
      /* Default remains available even while a search or category is active. */
      grid.appendChild(tile(''));matches.forEach(function(id){grid.appendChild(tile(id));});
      var entry=Array.from(grid.children).find(function(button){return button.dataset.iconId===select.value;}) || grid.firstElementChild;
      if(entry)entry.tabIndex=0;
      empty.hidden=matches.length>0;count.textContent=matches.length+' '+(matches.length===1?'icon':'icons')+(group?' in '+group:'');
      scroll.scrollTop=0;
    }
    function choose(id){
      if(!active() || disabled())return;
      var opener=state.opener;
      close(false);
      /* A select may predate the library, or omit its empty option. Add only
         the choice the author explicitly made; never normalize on opening. */
      if(!Array.from(select.options).some(function(option){return option.value===id;})){
        var option=element('option','',name(id));option.value=id;select.appendChild(option);
      }
      select.value=id;
      select.dispatchEvent(new view.Event('change',{bubbles:true}));
      if(current()){sync();focusOwner(opener);}
    }
    own(search,'input',render);own(category,'change',render);
    own(dismiss,'click',function(){close();});
    own(dialog,'cancel',function(event){event.preventDefault();close();});
    own(dialog,'close',function(){close();});
    own(dialog,'click',function(event){
      event.stopPropagation();
      if(event.target!==dialog)return;
      var bounds=dialog.getBoundingClientRect();
      if(event.clientX<bounds.left || event.clientX>bounds.right || event.clientY<bounds.top || event.clientY>bounds.bottom)close();
    });
    own(dialog,'keydown',function(event){
      event.stopPropagation();
      if(event.key==='Escape'){event.preventDefault();close();}
    });
    own(grid,'click',function(event){
      var button=event.target.closest('.flow-icon-tile');if(button && grid.contains(button))choose(button.dataset.iconId);
    });
    own(grid,'focusin',function(event){
      var button=event.target.closest('.flow-icon-tile');
      if(button)Array.from(grid.children).forEach(function(item){item.tabIndex=item===button?0:-1;});
    });
    own(grid,'keydown',function(event){
      var buttons=Array.from(grid.children),index=buttons.indexOf(event.target),next=index;
      if(index<0)return;
      var columns=view.getComputedStyle(grid).gridTemplateColumns.split(/\s+/).filter(Boolean).length || 1;
      if(event.key==='ArrowRight')next=index+1;
      else if(event.key==='ArrowLeft')next=index-1;
      else if(event.key==='ArrowDown')next=index+columns;
      else if(event.key==='ArrowUp')next=index-columns;
      else if(event.key==='Home')next=0;
      else if(event.key==='End')next=buttons.length-1;
      else return;
      event.preventDefault();buttons[Math.max(0,Math.min(buttons.length-1,next))].focus({preventScroll:true});
      var focused=doc.activeElement;if(focused && focused.scrollIntoView)focused.scrollIntoView({block:'nearest'});
    });
    doc.body.appendChild(dialog);render();browse.setAttribute('aria-expanded','true');
    dialog.showModal();search.focus({preventScroll:true});
  }

  listen(browse,'click',function(event){event.preventDefault();open();});
  listen(select,'change',sync);
  if(view && view.MutationObserver){
    observer=new view.MutationObserver(function(){if(!retired)sync();});
    observer.observe(select,{attributes:true,attributeFilter:['disabled','data-icon-default-label'],childList:true,subtree:true});
  }
  function retire(){
    if(retired)return;retired=true;close(false);
    if(observer)observer.disconnect();staticCleanups.forEach(function(remove){remove();});staticCleanups=[];
    browse.disabled=true;
  }
  if(opts.onRetire)opts.onRetire(retire);
  browse.setAttribute('aria-expanded','false');sync();return wrap;
}
