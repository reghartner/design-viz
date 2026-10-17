/* Shared commit discipline, with caller-selected blur and unchanged-value policy. */
function wireBuilderCommit(input,commit,options){
  options=options || {};
  var last=input.value,listen=options.listen || function(target,type,fn){target.addEventListener(type,fn);};
  input._flowviewHasDraft=function(){return input.value!==last;};
  function fire(){
    if(input.value===last && !options.commitUnchanged)return;
    last=input.value;
    if(commit()===false)last=null;
  }
  listen(input,'change',fire);
  if(options.blur)listen(input,'blur',fire);
  listen(input,'keydown',function(ev){
    if(ev.key==='Enter' && input.tagName!=='TEXTAREA'){ev.preventDefault();fire();}
  });
}

/* Node style presets (#610). One authored token sets border, background and
   text together; the stylesheet owns the colors per skin. Labels are the
   preset names shown in the picker and the hidden select. */
var NODE_STYLE_LABELS={slate:'Slate',rose:'Rose',ember:'Ember',amber:'Amber',moss:'Moss',teal:'Teal',sky:'Sky',indigo:'Indigo',violet:'Violet',magenta:'Magenta',sand:'Sand',ink:'Ink'};
function nodeStyleLabel(token){return Object.prototype.hasOwnProperty.call(NODE_STYLE_LABELS,token)?NODE_STYLE_LABELS[token]:token;}

/* One visible picker button; the caller's hidden select retains value/commit
   wiring, like the icon picker. The dialog shows every preset as a rendered
   sample node under the page's own skin classes, so the preview is the
   stylesheet's truth rather than a copy of it. Each dialog owns its
   listeners, so a retired form cannot commit. */
function createFlowNodeStylePicker(opts){
  var doc=opts.document,view=doc.defaultView,select=opts.select,SVG='http://www.w3.org/2000/svg';
  var tokens=Array.isArray(opts.tokens)?opts.tokens:(typeof NODE_STYLE_SET!=='undefined'?NODE_STYLE_SET:[]);
  var retired=false,opened=null,staticCleanups=[],observer=null;
  var wrap=doc.createElement('div');wrap.className='node-style-control';
  var browse=doc.createElement('button');browse.type='button';browse.className='node-style-browse';
  var preview=doc.createElement('span');preview.className='node-style-preview node-style-sample';preview.setAttribute('aria-hidden','true');
  var currentLabel=doc.createElement('span');currentLabel.className='node-style-value';
  var action=doc.createElement('span');action.className='node-style-action';action.textContent='Choose';
  browse.append(preview,currentLabel,action);browse.setAttribute('aria-haspopup','dialog');
  select.hidden=true;select.tabIndex=-1;select.setAttribute('aria-hidden','true');
  wrap.append(browse,select);

  function option(id){return Array.from(select.options).find(function(item){return item.value===id;});}
  function known(id){return tokens.indexOf(id)>=0;}
  function name(id){var item=option(id);return id?(known(id)?nodeStyleLabel(id):item?item.textContent:id):(item?item.textContent:'Default');}
  function disabled(){return !!select.disabled || !!(select.matches && select.matches(':disabled'));}
  function current(){return !retired && wrap.isConnected && select.isConnected && wrap.contains(select);}
  /* A sample is a real node group under the same classes the renderer emits,
     inside a wrapper that carries the page's skin classes, so the skin rules
     and the preset rules paint it exactly as the board would. Unavailable
     without SVG support (the unit harness), which only loses the preview. */
  function skinClasses(){
    var classes=typeof opts.skinClasses==='function'?opts.skinClasses():opts.skinClasses;
    return Array.isArray(classes)?classes.filter(function(name){return /^sk-[a-z-]+$/.test(name);}):[];
  }
  function dressSample(target){
    Array.from(target.classList).forEach(function(name){if(name.indexOf('sk-')===0)target.classList.remove(name);});
    skinClasses().forEach(function(name){target.classList.add(name);});
  }
  function sample(target,id,width,height,withText){
    target.replaceChildren();dressSample(target);
    if(!doc.createElementNS)return;
    var svg=doc.createElementNS(SVG,'svg');svg.setAttribute('viewBox','0 0 '+width+' '+height);svg.setAttribute('width',String(width));svg.setAttribute('height',String(height));svg.setAttribute('aria-hidden','true');
    var g=doc.createElementNS(SVG,'g');g.setAttribute('class','node tint-cmd'+(id && known(id)?' node-styled ns-'+id:''));
    var card=doc.createElementNS(SVG,'rect');card.setAttribute('class','card');card.setAttribute('x','1');card.setAttribute('y','1');card.setAttribute('width',String(width-2));card.setAttribute('height',String(height-2));card.setAttribute('rx',withText?'12':'7');
    g.appendChild(card);
    if(withText){
      var chip=doc.createElementNS(SVG,'rect');chip.setAttribute('class','icbg');chip.setAttribute('x','12');chip.setAttribute('y','14');chip.setAttribute('width','26');chip.setAttribute('height','26');chip.setAttribute('rx','8');
      var icon=doc.createElementNS(SVG,'use');icon.setAttribute('href','#i-gear');icon.setAttribute('x','17');icon.setAttribute('y','19');icon.setAttribute('width','16');icon.setAttribute('height','16');
      var t1=doc.createElementNS(SVG,'text');t1.setAttribute('class','t1');t1.setAttribute('x','46');t1.setAttribute('y','25');t1.textContent=id?name(id):'Default';
      var t2=doc.createElementNS(SVG,'text');t2.setAttribute('class','t2');t2.setAttribute('x','46');t2.setAttribute('y','41');t2.textContent=id?'border · fill · text':'skin card';
      g.append(chip,icon,t1,t2);
    }
    svg.appendChild(g);target.appendChild(svg);
  }
  function sync(){
    if(retired)return;
    sample(preview,select.value,28,28,false);
    currentLabel.textContent=select.getAttribute('data-style-current-label') || name(select.value);
    browse.setAttribute('aria-label',(select.getAttribute('aria-label') || 'Node style')+': '+currentLabel.textContent+'. Choose node style');
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
    if(!retired && state.dialog.open && state.dialog.close)state.dialog.close();
    state.dialog.remove();browse.setAttribute('aria-expanded','false');
    if(restore!==false)focusOwner(state.opener);
  }
  function open(){
    if(!current() || disabled() || opened)return;
    var dialog=doc.createElement('dialog');dialog.className='node-style-picker';dialog.setAttribute('aria-label','Choose a node style');
    var state={dialog:dialog,active:true,cleanups:[],opener:doc.activeElement};opened=state;
    function active(){return !retired && opened===state && state.active && current();}
    function own(target,type,callback){
      var guarded=function(event){if(active())callback(event);};
      target.addEventListener(type,guarded);state.cleanups.push(function(){target.removeEventListener(type,guarded);});
    }
    function element(tag,className,text){var node=doc.createElement(tag);node.className=className;if(text!=null)node.textContent=text;return node;}
    var header=element('header','node-style-header'),heading=element('div','node-style-heading');
    heading.append(element('span','node-style-kicker','Node style'),element('h2','node-style-title','Choose a node style'),
      element('p','node-style-intro','Each style sets the card’s border, background and text together, in every skin. The icon keeps its own color.'));
    var dismiss=element('button','node-style-close','×');dismiss.type='button';dismiss.setAttribute('aria-label','Close node style picker');
    header.append(heading,dismiss);
    var scroll=element('div','node-style-results'),grid=element('div','node-style-grid');
    grid.setAttribute('role','group');grid.setAttribute('aria-label','Node style choices');scroll.appendChild(grid);
    var footer=element('footer','node-style-footer');
    footer.append(element('span','node-style-current','Current: '+currentLabel.textContent),element('span','node-style-key-hint','Arrow keys to browse · Enter to apply · Esc to close'));
    dialog.append(header,scroll,footer);
    function tile(id){
      var button=element('button','node-style-tile');button.type='button';button.dataset.styleId=id;
      button.setAttribute('aria-pressed',String(id===select.value && !select.getAttribute('data-style-current-label')));button.tabIndex=-1;
      var art=element('span','node-style-tile-art node-style-sample');art.setAttribute('aria-hidden','true');sample(art,id,176,54,true);
      button.append(art,element('span','node-style-tile-label',id?name(id):(option('')?option('').textContent:'Default')));
      var check=element('span','node-style-tile-check','✓');check.setAttribute('aria-hidden','true');button.appendChild(check);
      return button;
    }
    grid.appendChild(tile(''));
    tokens.forEach(function(id){grid.appendChild(tile(id));});
    /* An unknown authored token stays choosable so the form never normalizes it on open. */
    Array.from(select.options).filter(function(item){return item.value && !known(item.value);}).forEach(function(item){grid.appendChild(tile(item.value));});
    var entry=Array.from(grid.children).find(function(button){return button.dataset.styleId===select.value;}) || grid.firstElementChild;
    if(entry)entry.tabIndex=0;
    function choose(id){
      if(!active() || disabled())return;
      var opener=state.opener;close(false);
      if(!option(id)){var extra=element('option','',name(id));extra.value=id;select.appendChild(extra);}
      select.value=id;select.dispatchEvent(new view.Event('change',{bubbles:true}));
      if(current()){sync();focusOwner(opener);}
    }
    own(dismiss,'click',function(){close();});
    own(dialog,'cancel',function(event){event.preventDefault();close();});
    own(dialog,'close',function(){close();});
    own(dialog,'click',function(event){
      event.stopPropagation();if(event.target!==dialog)return;
      var bounds=dialog.getBoundingClientRect();
      if(event.clientX<bounds.left || event.clientX>bounds.right || event.clientY<bounds.top || event.clientY>bounds.bottom)close();
    });
    own(dialog,'keydown',function(event){event.stopPropagation();if(event.key==='Escape'){event.preventDefault();close();}});
    own(grid,'click',function(event){var button=event.target.closest('.node-style-tile');if(button && grid.contains(button))choose(button.dataset.styleId);});
    own(grid,'focusin',function(event){
      var button=event.target.closest('.node-style-tile');
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
    doc.body.appendChild(dialog);browse.setAttribute('aria-expanded','true');
    dialog.showModal();if(entry)entry.focus({preventScroll:true});
  }
  listen(browse,'click',function(event){event.preventDefault();open();});
  listen(select,'change',sync);
  if(view && view.MutationObserver){
    observer=new view.MutationObserver(function(){if(!retired)sync();});
    observer.observe(select,{attributes:true,attributeFilter:['disabled','aria-label','data-style-current-label'],childList:true,subtree:true});
  }
  function retire(){
    if(retired)return;retired=true;close(false);
    if(observer)observer.disconnect();staticCleanups.forEach(function(remove){remove();});staticCleanups=[];
    browse.disabled=true;
  }
  if(opts.onRetire)opts.onRetire(retire);
  browse.setAttribute('aria-expanded','false');sync();return wrap;
}
