/* The field entry an element opens, with its authored target. A creation entry
   opens only from its Add command and needs no selector; every other entry opens
   only on an element matching its own selector, so entries of one target kind
   (a node's name and subtitle) stay distinct. The first entry whose target, from
   its own resolver or else targetOf(el), has the entry's kind wins. */
function inlineTextField(fields,el,creation,targetOf){
  var generic;
  for(var i=0;i<fields.length;i++){
    var f=fields[i];
    if(f.creation?!creation:f.selector && !el.matches(f.selector))continue;
    var target=f.target?f.target(el):generic===undefined?(generic=targetOf(el)):generic;
    if(target && target.kind===f.kind)return {entry:f,target:target};
  }
  return null;
}

/* Local native drafts: never replace the focused input (or publish source) while
   typing. Only its sibling preview renders Markdown. One commit owns one Undo. */
function createInlineTextEditor(opts){
  var life=createWorkbenchLifetime(),document=opts.document,view=opts.view,active=null;
  var help='Markdown previews live below. Enter adds a line and continues bullets. Ctrl/Command+Enter or click outside saves; Escape cancels.';
  /* Directly editable text, one entry per field. selector: the rendered text a
     double-click opens (creation entries open only from their Add command).
     kind: the authored target it must resolve to, through target(el) when given,
     else the Workbench target under the element. field: the key written on that
     target's source object (null: the value itself; bare: a plain string value is
     the text). markdown: multi-line Markdown draft with live preview in place of
     the text; otherwise one line in the SVG host from place(c), or an HTML
     overlay beside the text when html is true, classed
     hostClass. value: the empty-value rule of the matching Inspect control.
     'raw' saves the draft as typed; 'trimmed' trims it and removes the field when
     empty (Inspect text controls, inspector.js textControl). keyboard: Enter on
     the focused text also opens it. overlay: an imported (provider-owned) node
     saves field through planTopologyNodeOverride in this consumer's display
     override, as Inspect's Display controls do. menu: opens only from its object-menu
     command, never on double-click. read(snapshot,target): the entry's own
     {text, stored} source in place of field, or null when it cannot edit.
     A save is the entry's plan(c,value) (null: nothing to write), else
     planSetField (field) or planReplaceValue, through one opts.commit, unless
     the entry's source(snapshot,target) reads the text itself and returns its
     own save plan (and the
     topology context the draft depends on). mount: the element a single-line
     host joins (default: the edited element). */
  /* A connection label: double-click the label text, or Rename (opens through
     the creation route, from the label or from the arrow when it has none).
     Local connections write their label; imported ones write this consumer's
     Display label override. Both match their Inspect field. */
  var edgeLabel={kind:'edge',selector:'text.lbl[data-dv-edge]',field:'label',value:'trimmed',label:'Edit connection label',help:'Enter or click outside saves. Escape cancels.',
    source:edgeLabelSource,place:edgeLabelHost,mount:function(c){return c.el.ownerSVGElement;},hostClass:'dv-inline-edge-editor'};
  var fields=[
    {kind:'para',selector:'[data-dv-para]',field:null,markdown:true,value:'raw',keyboard:true,label:'Edit section text',help:help},
    {kind:'bullet',selector:'[data-dv-bullet-path]',field:'text',bare:true,markdown:true,value:'raw',keyboard:true,label:'Edit section text',help:help},
    {kind:'node',creation:true,field:'title',value:'raw',label:'New node title',help:'Enter or click outside saves. Escape cancels. Later changes use Inspect.',
      accept:function(value){return !isTextBoxNode(value);},place:nodeTitleHost,hostClass:'dv-inline-node-editor'},
    // One step text serves every path that uses the step.
    {kind:'step',selector:'.stepline .step-text',target:function(el){return opts.currentStep?opts.currentStep(el):null;},field:'text',markdown:true,value:'trimmed',label:'Edit step text',help:help},
    // A visible subtitle wins over the containing node's rename target.
    {kind:'node',selector:'[data-dv-node]:not([data-dv-text-box]) .t2:not(:empty)',field:'sub',value:'trimmed',overlay:true,label:'Node subtitle',help:'Enter or click outside saves. Escape cancels.',
      place:nodeSubtitleHost,mount:function(c){return c.el.parentNode;},hostClass:'dv-inline-subtitle-editor'},
    // Rename edits the display name only; the node ID stays in Inspect.
    {kind:'node',selector:'[data-dv-node]:not([data-dv-text-box])',field:'title',value:'trimmed',overlay:true,label:'Node name',help:'Enter or click outside saves. Escape cancels.',
      place:nodeTitleHost,hostClass:'dv-inline-node-editor'},
    {kind:'panel',selector:'.pwidget[data-dv-panel] > .ptitle,.explore-window[data-explore-panel] > .explore-window-header > .explore-window-grip',
      field:'title',value:'trimmed',html:true,label:'Panel title',help:'Enter or click outside saves. Escape cancels.',
      // Home map can decorate an untitled Standard bar with just a layout button.
      accept:function(value,el){return el.matches('.explore-window-grip') || !!value.title;}},
    {kind:'section',selector:'.sec-h',field:'heading',value:'trimmed',html:true,label:'Section heading',help:'Enter or click outside saves. Escape cancels.',
      plan:function(c,value){return planSetSectionIdentity(c.snapshot.text,c.snapshot.raw,c.target.section,'heading',value);}},
    {kind:'document',selector:'.doc-title,#workbench-editor-title',target:function(){return {kind:'document'};},field:'title',value:'trimmed',html:true,label:'Document title',help:'Enter or click outside saves. Escape cancels.',
      // The desktop app bar also shows an untitled fallback. Only authored text edits.
      accept:function(value){return !!value.title;},
      plan:function(c,value){return planDocumentSetting(c.snapshot.text,c.snapshot.raw,'title',value);}},
    {kind:'contract',selector:'.cttitle > span',field:'title',value:'trimmed',html:true,label:'Contract title',help:'Enter or click outside saves. Escape cancels.'},
    {kind:'crow',selector:'.ctkey',field:'k',value:'trimmed',html:true,label:'Contract field name',help:'Enter or click outside saves. Escape cancels.',
      plan:function(c,value){return value==null?{error:'a contract row needs k — the field name'}:planSetField(c.snapshot.text,c.snapshot.raw,c.path,'k',JSON.stringify(value));}},
    {kind:'crow',selector:'td.ctv',field:'v',value:'trimmed',html:true,htmlInside:true,label:'Contract value',help:'Enter or click outside saves. Escape cancels.'},
    {kind:'crow',selector:'td.ctg',field:'g',markdown:true,value:'trimmed',label:'Contract meaning',help:help},
    {kind:'contract',selector:'.ctnote',field:'note',markdown:true,value:'trimmed',label:'Contract note',help:help},
    {kind:'tab',selector:'.tabbtn',field:'label',value:'trimmed',html:true,label:'Tab label',help:'Enter or click outside saves. Escape cancels.',
      plan:function(c,value){return value==null?{error:'a tab needs a label'}:planSetField(c.snapshot.text,c.snapshot.raw,c.path,'label',JSON.stringify(value));}},
    edgeLabel,
    // Rename on a connection that has no label yet opens from its arrow.
    Object.assign({},edgeLabel,{selector:null,creation:true}),
    /* A local group's boundary title opens only from its object menu (menu: no
       double-click or Enter route). read gives the title, or the key when there
       is none; plan saves through planSetGroupTitle, which keeps the key and
       members. mount: the host is the last child of the group's parent, so it
       paints above the diagram, over the title. */
    {kind:'group',selector:'g.grp[data-dv-group]',menu:true,value:'trimmed',label:'Group title',help:'Enter or click outside saves. Escape cancels. The group key stays in Inspect.',
      read:groupTitle,plan:function(c,value){return value==null && c.stored==null?null:planSetGroupTitle(c.snapshot.text,c.snapshot.raw,c.target.section,c.target.id,value);},
      place:groupTitleHost,mount:function(c){return c.el.parentNode;},hostClass:'dv-inline-group-editor'}
  ];
  function selectorOf(test){return fields.filter(function(f){return f.selector && !f.creation && !f.menu && test(f);}).map(function(f){return f.selector;}).join(',');}
  var openSelector=selectorOf(function(){return true;}),keySelector=selectorOf(function(f){return f.keyboard;});
  function context(el,creation){
    if(!el || !el.isConnected || el.closest('[data-dv-detail-preview]') || opts.disabled())return null;
    var found=inlineTextField(fields,el,creation,function(el){return opts.targetFromEvent({target:el});});if(!found)return null;
    var f=found.entry,target=found.target;
    delete target.el;
    var snapshot=opts.session.snapshot();
    if(snapshot.error || snapshot.renderedText!=null && snapshot.renderedText!==snapshot.text)return null;
    if(f.source){var got=f.source(snapshot,target);return got && {el:el,entry:f,target:target,text:got.text || '',source:got,snapshot:snapshot};}
    if(f.read){var own=f.read(snapshot,target);return own && {el:el,entry:f,target:target,path:null,field:null,text:own.text,stored:own.stored,snapshot:snapshot};}
    var path=builderTargetPath(snapshot.raw,target),value=path && specValueAt(snapshot.raw,path),field=null,overlay=null;
    if(value==null && f.overlay){overlay=importedNode(snapshot,target);if(!overlay)return null;value=overlay.value;}
    if(f.field && specObject(value)){
      if(f.accept && !f.accept(value,el))return null;
      field=f.field;
    }else if(f.field && !f.bare || typeof value!=='string')return null;
    var text=field?value[field]:value;
    if(text!=null && typeof text!=='string')return null;
    return {el:el,entry:f,target:target,path:path,field:field,text:text || '',snapshot:snapshot,overlay:overlay};
  }
  /* A resolved node this consumer imports from an authored topology import:
     its provider value and the topology context its display override uses. */
  function importedNode(snapshot,target){
    var context=opts.session.topologyContext?opts.session.topologyContext():null,resolved;
    try{resolved=opts.session.resolve?opts.session.resolve(snapshot.raw):snapshot.raw;}catch(ex){return null;}
    var rec=specSectionPaths(resolved)[target.section],d=rec && specValueAt(resolved,rec.diagram),value=d && (d.nodes || {})[target.id];
    if(!specObject(value) || !FlowTopology.origin(d,'nodes',target.id))return null;
    if(planTopologyNodeOverride(snapshot.text,snapshot.raw,target.section,target.id,{},context).error)return null;
    return {value:value,diagram:d,context:context,key:JSON.stringify(context)};
  }
  function nodeTitleHost(c){
    var d=c.overlay && c.overlay.diagram;
    if(!d){var got=builderDiagram(c.snapshot.text,c.snapshot.raw,c.target.section);if(got.error)return null;d=got.d;}
    var p=layout(d).pos[c.target.id];if(!p)return null;
    var host=document.createElementNS('http://www.w3.org/2000/svg','foreignObject');
    host.setAttribute('x','4');host.setAttribute('y',String(Math.max(4,(p.h-36)/2)));host.setAttribute('width',String(Math.max(40,p.w-8)));host.setAttribute('height','36');
    return host;
  }
  function nodeSubtitleHost(c){
    var card=c.el.parentNode && c.el.parentNode.querySelector('.card');if(!card)return null;
    var b=c.el.getBBox(),width=Number(card.getAttribute('width')),height=28;
    var host=document.createElementNS('http://www.w3.org/2000/svg','foreignObject');
    host.setAttribute('x','4');host.setAttribute('y',String(b.y+b.height/2-height/2));
    host.setAttribute('width',String(Math.max(40,width-8)));host.setAttribute('height',String(height));
    return host;
  }
  function topologyKey(){return JSON.stringify(opts.session.topologyContext?opts.session.topologyContext():null);}
  function edgeLabelSource(s,target){
    var context=opts.session.topologyContext?opts.session.topologyContext():null,t=builderEdgeLayoutTarget(s.text,s.raw,target.section,target.index,null,context);
    if(t.error || t.edge.label!=null && typeof t.edge.label!=='string' || !t.owner && t.localIndex<0)return null;
    return {text:t.edge.label,edge:t.edge,contextKey:JSON.stringify(context),plan:function(value){
      return t.owner?planEdgeLayout(s.text,s.raw,target.section,target.index,t.key,{label:value},context):
        planSetField(s.text,s.raw,t.got.path.concat(['edges',t.localIndex]),'label',value==null?null:JSON.stringify(value));
    }};
  }
  /* Over the rendered label; without one, where the engine would draw it:
     above the arrow's midpoint, higher when a step circle sits there. */
  function edgeLabelHost(c){
    var svg=c.el.ownerSVGElement,index=c.target.index,label=svg && svg.querySelector('text.lbl[data-dv-edge="'+index+'"]'),path=svg && svg.querySelector('path.edge[data-dv-edge="'+index+'"]'),x,y,w=160;
    try{
      if(label){var b=label.getBBox();x=b.x+b.width/2;y=b.y+b.height/2;w=Math.max(w,b.width+40);}
      else if(path){
        var mid=path.getPointAtLength(path.getTotalLength()/2),edge=c.source.edge;
        x=mid.x+(edge.labelDx || 0);y=mid.y-(svg.querySelector('[data-dv-coin-edge="'+index+'"]')?16:9)+(edge.labelDy || 0)-4;
      }
    }catch(ex){return null;}
    if(!Number.isFinite(x) || !Number.isFinite(y))return null;
    var host=document.createElementNS('http://www.w3.org/2000/svg','foreignObject');
    host.setAttribute('x',String(x-w/2));host.setAttribute('y',String(y-15));host.setAttribute('width',String(w));host.setAttribute('height','30');
    return host;
  }
  /* A local group (declared, or holding an authored member) and its stored
     title. Imported groups exist only in the resolved diagram: provider-owned. */
  function groupTitle(s,t){
    var got=builderDiagram(s.text,s.raw,t.section);if(got.error)return null;
    var groups=got.d.groups,nodes=got.d.nodes || {},declared=specObject(groups) && Object.prototype.hasOwnProperty.call(groups,t.id),meta=declared?groups[t.id]:null;
    if(!declared && !Object.keys(nodes).some(function(id){return specObject(nodes[id]) && nodes[id].group===t.id;}))return null;
    if(declared && !specObject(meta) || meta && meta.title!=null && typeof meta.title!=='string')return null;
    var title=meta && meta.title!=null?meta.title:null;
    return {text:title==null?t.id:title,stored:title};
  }
  function groupTitleHost(c){
    var title=c.el.querySelector(':scope > text.grptitle'),box=c.el.querySelector(':scope > rect.grpbox');if(!title || !box || !c.el.parentNode)return null;
    var b=title.getBBox(),x=b.x-6,right=Number(box.getAttribute('x'))+Number(box.getAttribute('width'))-6;
    var host=document.createElementNS('http://www.w3.org/2000/svg','foreignObject');
    host.setAttribute('x',String(x));host.setAttribute('y',String(b.y+b.height/2-15));host.setAttribute('width',String(Math.max(160,right-x)));host.setAttribute('height','30');
    return host;
  }
  function fresh(c){
    var now=opts.session.snapshot();
    return c.el.isConnected && !opts.disabled() && now.project===c.snapshot.project && now.text===c.snapshot.text &&
      (!c.overlay || topologyKey()===c.overlay.key) && (!c.source || topologyKey()===c.source.contextKey);
  }
  function clear(){
    if(!active)return;var a=active;active=null;a.life.destroy();a.host.remove();
    if(a.original){while(a.original.firstChild)a.c.el.insertBefore(a.original.firstChild,a.original);a.original.remove();}
    a.c.el.classList.remove('dv-inline-editing');
    if(a.c.entry.html){
      a.c.htmlAnchor.classList.remove('dv-inline-html-editing');
      if(a.c.htmlText)a.c.htmlText.replaceWith(a.c.htmlText.firstChild);
      if(a.c.positionedMount)a.c.htmlMount.classList.remove('dv-inline-html-mount');
    }
  }
  function finish(save,focus,nextTarget){
    if(!active)return;var a=active,c=a.c,valid=fresh(c),plan;
    if(save && valid && a.input.value!==c.text){
      var value=c.entry.value==='trimmed'?a.input.value.trim() || null:a.input.value,json=value==null?null:JSON.stringify(value),patch={};
      if(c.overlay){patch[c.field]=value;plan=planTopologyNodeOverride(c.snapshot.text,c.snapshot.raw,c.target.section,c.target.id,patch,c.overlay.context);}
      else plan=c.source?c.source.plan(value):c.entry.plan?c.entry.plan(c,value):c.field?planSetField(c.snapshot.text,c.snapshot.raw,c.path,c.field,json):
        planReplaceValue(c.snapshot.text,c.snapshot.raw,c.path,json);
      if(plan && plan.error){a.error.textContent=plan.error;return false;}
    }
    clear();
    if(plan)opts.commit(plan,c.snapshot,c.target,nextTarget);
    if(focus && valid){var el=opts.findTargetEl(c.target);if(el)el.focus({preventScroll:true});}
  }
  function inside(el){return active && active.host.contains(el);}
  function paint(){
    if(!active || !active.preview)return;
    active.preview.innerHTML=proseMarkup(active.input.value);
    // Preview links remain selectable but cannot navigate during a draft.
    active.preview.querySelectorAll('a,pre').forEach(function(el){el.setAttribute('tabindex','-1');});
    var input=active.input,scroll=input.scrollTop;
    input.style.height='auto';input.style.height=Math.max(64,input.scrollHeight+4)+'px';input.scrollTop=scroll;
  }
  /* A sibling host keeps inputs outside interactive titles such as Explore's
     grip button. Leave the title in layout so opening a draft cannot move it. */
  function htmlLineHost(c){
    var el=c.el,parent=el.parentElement;if(!parent)return null;
    // Titles may have a trailing action such as Home map's Edit layout. Keep
    // that action mounted and visible, and cover only the authored text node.
    var text=Array.from(el.childNodes).find(function(node){return node.nodeType===3 && node.textContent.trim();});
    if(c.entry.htmlInside && !text){text=document.createTextNode('');el.prepend(text);}
    if(text && (c.entry.htmlInside || el.querySelector('a,button,input,select,textarea'))){
      var span=document.createElement('span');text.replaceWith(span);span.appendChild(text);c.htmlText=span;
    }
    var anchor=c.htmlAnchor=c.htmlText || el;
    parent=c.entry.htmlInside?el:parent;
    c.htmlMount=parent;c.positionedMount=getComputedStyle(parent).position==='static';
    if(c.positionedMount)parent.classList.add('dv-inline-html-mount');
    var host=document.createElement('div');
    host.style.left=anchor.offsetLeft+'px';host.style.top=anchor.offsetTop+'px';
    host.style.width=(c.entry.htmlInside?el.clientWidth:anchor.offsetWidth)+'px';host.style.height=Math.max(28,anchor.offsetHeight)+'px';
    host.style.font=getComputedStyle(el).font;
    return host;
  }
  function open(el,creation,selectAll){
    if(active && active.c.el===el){active.input.focus();return;}
    if(finish(true,false)===false)return;
    var c=context(el,creation);if(!c)return;opts.pause();
    var f=c.entry,single=!f.markdown,host,input,original=null;
    if(single){
      host=f.html?htmlLineHost(c):f.place(c);if(!host)return;
      input=document.createElementNS('http://www.w3.org/1999/xhtml','input');input.type='text';
    }else{
      host=document.createElement('div');input=document.createElement('textarea');input.rows=2;input.spellcheck=true;
      original=document.createElement('div');original.hidden=true;
      // Leave structured child bullets in place; only this point's own text is
      // replaced by the draft. Their metadata and source subtree never change.
      Array.from(el.childNodes).forEach(function(child){if(!(child.nodeType===1 && child.matches('ul.sec-bullets')))original.appendChild(child);});
      el.prepend(original);
    }
    host.setAttribute('class','dv-inline-editor'+(f.html?' dv-inline-html-editor':'')+(f.hostClass?' '+f.hostClass:''));
    input.className='dv-inline-input';input.value=c.text;
    input.setAttribute('aria-label',f.label);
    input.setAttribute('aria-description',f.help);
    host.appendChild(input);
    var preview=null;
    if(!single){
      var hint=document.createElement('div');hint.className='dv-inline-hint';hint.textContent='Markdown · Ctrl/⌘+Enter saves · Esc cancels';host.appendChild(hint);
      preview=document.createElement('div');preview.className='dv-inline-preview';preview.setAttribute('role','region');preview.setAttribute('aria-label','Live Markdown preview');host.appendChild(preview);
    }
    var error=document.createElement('span');error.setAttribute('role','status');host.appendChild(error);
    if(single)(f.html?c.htmlMount:f.mount?f.mount(c):el).appendChild(host);else el.insertBefore(host,original.nextSibling);
    el.classList.add('dv-inline-editing');
    if(f.html)c.htmlAnchor.classList.add('dv-inline-html-editing');
    var editing=createWorkbenchLifetime();active={c:c,input:input,host:host,original:original,preview:preview,error:error,life:editing,composing:false};
    ['pointerdown','mousedown','click','dblclick'].forEach(function(type){editing.listen(host,type,function(e){e.stopPropagation();if(e.target.closest('a')){e.preventDefault();if(type==='click' && active){active.input.focus();active.input.scrollIntoView({block:'nearest',inline:'nearest'});}}});});
    editing.listen(input,'input',paint);
    editing.listen(input,'compositionstart',function(){if(active)active.composing=true;});
    editing.listen(input,'compositionend',function(){if(active){active.composing=false;paint();}});
    paint();input.focus({preventScroll:true});if(single || selectAll)input.select();else input.setSelectionRange(input.value.length,input.value.length);
  }
  function decorate(){
    view.querySelectorAll(keySelector).forEach(function(el){
      if(el.closest('[data-dv-detail-preview]'))return;
      el.setAttribute('tabindex','0');el.setAttribute('aria-description','Double-click or press Enter to edit section text.');el.setAttribute('aria-keyshortcuts','Enter');
      el.title='Double-click or press Enter to edit text; single-click to inspect.';
    });
  }
  life.listen(document,'keydown',function(e){
    if(!inside(e.target))return;
    e.stopImmediatePropagation();if(e.isComposing || active.composing || e.keyCode===229)return;
    if(e.key==='Escape'){e.preventDefault();finish(false,true);}
    else if(e.key==='Enter' && (!active.c.entry.markdown || e.ctrlKey || e.metaKey)){e.preventDefault();finish(true,true);}
    else if(e.key==='Enter' && !e.shiftKey && !e.altKey){
      var input=active.input,edit=inlineProseEnter(input.value,input.selectionStart,input.selectionEnd);
      if(edit){e.preventDefault();input.setSelectionRange(edit.start,edit.end);document.execCommand('insertText',false,edit.text);
        // Chromium's empty insertion leaves the caret before a trailing newline.
        // Collapse to the actual replacement boundary once, never on input.
        input.setSelectionRange(edit.start+edit.text.length,edit.start+edit.text.length);}
    }
  },true);
  life.listen(document,'pointerdown',function(e){if(active && !inside(e.target) && finish(true,false,opts.targetFromEvent(e))===false){e.preventDefault();e.stopImmediatePropagation();}},true);
  life.listen(document,'focusin',function(e){if(active && !inside(e.target))finish(true,false,opts.targetFromEvent(e));});
  function doubleClick(e){
    if(e.target.closest('.dv-inline-editor,a,input,select,textarea,summary,[contenteditable],.nlink'))return;
    // Only the tab label and explicit panel title grip are editable buttons.
    var button=e.target.closest('button,[role="button"]');
    if(button && !button.matches('.tabbtn,.explore-window[data-explore-panel] > .explore-window-header > .explore-window-grip'))return;
    var el=e.target.closest(openSelector);if(el){e.preventDefault();e.stopPropagation();open(el);}
  }
  life.listen(view,'dblclick',doubleClick,true);
  // Current desktop chrome displays the document title outside the preview.
  // This one explicit surface shares the same active guard and editor lifetime.
  if(opts.documentTitle)life.listen(opts.documentTitle,'dblclick',doubleClick,true);
  life.listen(view,'keydown',function(e){if(e.target.matches(keySelector) && e.key==='Enter' && !e.isComposing){e.preventDefault();e.stopImmediatePropagation();open(e.target);}},true);
  life.listen(opts.src,'input',clear);life.listen(view,'dv:pathchange',clear);
  return {open:open,clear:clear,decorate:decorate,refresh:function(){if(active && !fresh(active.c))clear();decorate();},destroy:function(){clear();life.destroy();}};
}
