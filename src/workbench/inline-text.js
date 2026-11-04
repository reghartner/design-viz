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
     the text; otherwise one line in the SVG host from place(c), classed
     hostClass. value: the empty-value rule of the matching Inspect control.
     'raw' saves the draft as typed; 'trimmed' trims it and removes the field when
     empty (Inspect text controls, inspector.js textControl). keyboard: Enter on
     the focused text also opens it. A save is planSetField (field) or
     planReplaceValue, through one opts.commit. */
  var fields=[
    {kind:'para',selector:'[data-dv-para]',field:null,markdown:true,value:'raw',keyboard:true,label:'Edit section text',help:help},
    {kind:'bullet',selector:'[data-dv-bullet-path]',field:'text',bare:true,markdown:true,value:'raw',keyboard:true,label:'Edit section text',help:help},
    {kind:'node',creation:true,field:'title',value:'raw',label:'New node title',help:'Enter or click outside saves. Escape cancels. Later changes use Inspect.',
      accept:function(value){return !isTextBoxNode(value);},place:nodeTitleHost,hostClass:'dv-inline-node-editor'},
    // One step text serves every path that uses the step.
    {kind:'step',selector:'.stepline .step-text',target:function(el){return opts.currentStep?opts.currentStep(el):null;},field:'text',markdown:true,value:'trimmed',label:'Edit step text',help:help}
  ];
  function selectorOf(test){return fields.filter(function(f){return f.selector && !f.creation && test(f);}).map(function(f){return f.selector;}).join(',');}
  var openSelector=selectorOf(function(){return true;}),keySelector=selectorOf(function(f){return f.keyboard;});
  function resolve(el,creation){
    var generic;
    for(var i=0;i<fields.length;i++){
      var f=fields[i];if(f.creation && !creation)continue;
      if(f.target && !el.matches(f.selector))continue;
      var target=f.target?f.target(el):generic===undefined?(generic=opts.targetFromEvent({target:el})):generic;
      if(target && target.kind===f.kind)return {entry:f,target:target};
    }
    return null;
  }
  function context(el,creation){
    if(!el || !el.isConnected || el.closest('[data-dv-detail-preview]') || opts.disabled())return null;
    var found=resolve(el,creation);if(!found)return null;
    var f=found.entry,target=found.target;
    delete target.el;
    var snapshot=opts.session.snapshot();
    if(snapshot.error || snapshot.renderedText!=null && snapshot.renderedText!==snapshot.text)return null;
    var path=builderTargetPath(snapshot.raw,target),value=path && specValueAt(snapshot.raw,path),field=null;
    if(f.field && specObject(value)){
      if(f.accept && !f.accept(value))return null;
      field=f.field;
    }else if(f.field && !f.bare || typeof value!=='string')return null;
    var text=field?value[field]:value;
    if(text!=null && typeof text!=='string')return null;
    return {el:el,entry:f,target:target,path:path,field:field,text:text || '',snapshot:snapshot};
  }
  function nodeTitleHost(c){
    var got=builderDiagram(c.snapshot.text,c.snapshot.raw,c.target.section),p=!got.error && layout(got.d).pos[c.target.id];if(!p)return null;
    var host=document.createElementNS('http://www.w3.org/2000/svg','foreignObject');
    host.setAttribute('x','4');host.setAttribute('y',String(Math.max(4,(p.h-36)/2)));host.setAttribute('width',String(Math.max(40,p.w-8)));host.setAttribute('height','36');
    return host;
  }
  function fresh(c){var now=opts.session.snapshot();return c.el.isConnected && !opts.disabled() && now.project===c.snapshot.project && now.text===c.snapshot.text;}
  function clear(){
    if(!active)return;var a=active;active=null;a.life.destroy();a.host.remove();
    if(a.original){while(a.original.firstChild)a.c.el.insertBefore(a.original.firstChild,a.original);a.original.remove();}
    a.c.el.classList.remove('dv-inline-editing');
  }
  function finish(save,focus,nextTarget){
    if(!active)return;var a=active,c=a.c,valid=fresh(c),plan;
    if(save && valid && a.input.value!==c.text){
      var value=c.entry.value==='trimmed'?a.input.value.trim() || null:a.input.value,json=value==null?null:JSON.stringify(value);
      plan=c.field?planSetField(c.snapshot.text,c.snapshot.raw,c.path,c.field,json):
        planReplaceValue(c.snapshot.text,c.snapshot.raw,c.path,json);
      if(plan.error){a.error.textContent=plan.error;return false;}
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
  function open(el,creation,selectAll){
    if(active && active.c.el===el){active.input.focus();return;}
    if(finish(true,false)===false)return;
    var c=context(el,creation);if(!c)return;opts.pause();
    var f=c.entry,single=!f.markdown,host,input,original=null;
    if(single){
      host=f.place(c);if(!host)return;
      input=document.createElementNS('http://www.w3.org/1999/xhtml','input');input.type='text';
    }else{
      host=document.createElement('div');input=document.createElement('textarea');input.rows=2;input.spellcheck=true;
      original=document.createElement('div');original.hidden=true;
      // Leave structured child bullets in place; only this point's own text is
      // replaced by the draft. Their metadata and source subtree never change.
      Array.from(el.childNodes).forEach(function(child){if(!(child.nodeType===1 && child.matches('ul.sec-bullets')))original.appendChild(child);});
      el.prepend(original);
    }
    host.setAttribute('class','dv-inline-editor'+(f.hostClass?' '+f.hostClass:''));
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
    if(single)el.appendChild(host);else el.insertBefore(host,original.nextSibling);
    el.classList.add('dv-inline-editing');
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
  life.listen(view,'dblclick',function(e){
    if(e.target.closest('.dv-inline-editor,a,button,input,textarea'))return;
    var el=e.target.closest(openSelector);if(el){e.preventDefault();e.stopPropagation();open(el);}
  },true);
  life.listen(view,'keydown',function(e){if(e.target.matches(keySelector) && e.key==='Enter' && !e.isComposing){e.preventDefault();e.stopImmediatePropagation();open(e.target);}},true);
  life.listen(opts.src,'input',clear);life.listen(view,'dv:pathchange',clear);
  return {open:open,clear:clear,decorate:decorate,refresh:function(){if(active && !fresh(active.c))clear();decorate();},destroy:function(){clear();life.destroy();}};
}
