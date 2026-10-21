/* Local native drafts: never replace the focused input (or publish source) while
   typing. Only its sibling preview renders Markdown. One commit owns one Undo. */
function createInlineTextEditor(opts){
  var life=createWorkbenchLifetime(),document=opts.document,view=opts.view,active=null;
  var proseSelector='[data-dv-para],[data-dv-bullet-path]';
  var help='Markdown previews live below. Enter adds a line and continues bullets. Ctrl/Command+Enter or click outside saves; Escape cancels.';
  function context(el,creation){
    if(!el || !el.isConnected || el.closest('[data-dv-detail-preview]') || opts.disabled())return null;
    var target=opts.targetFromEvent({target:el});
    if(!target || !(target.kind==='para' || target.kind==='bullet' || creation && target.kind==='node'))return null;
    delete target.el;
    var snapshot=opts.session.snapshot();
    if(snapshot.error || snapshot.renderedText!=null && snapshot.renderedText!==snapshot.text)return null;
    var path=builderTargetPath(snapshot.raw,target),value=path && specValueAt(snapshot.raw,path),field=null;
    if(target.kind==='node'){
      if(!specObject(value) || isTextBoxNode(value))return null;
      field='title';
    }else if(target.kind==='bullet' && specObject(value))field='text';
    else if(typeof value!=='string')return null;
    var text=field?value[field]:value;
    if(text!=null && typeof text!=='string')return null;
    return {el:el,target:target,path:path,field:field,text:text || '',snapshot:snapshot};
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
      plan=c.field?planSetField(c.snapshot.text,c.snapshot.raw,c.path,c.field,JSON.stringify(a.input.value)):
        planReplaceValue(c.snapshot.text,c.snapshot.raw,c.path,JSON.stringify(a.input.value));
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
    var node=c.target.kind==='node',host,input,original=null;
    if(node){
      var got=builderDiagram(c.snapshot.text,c.snapshot.raw,c.target.section),p=!got.error && layout(got.d).pos[c.target.id];if(!p)return;
      host=document.createElementNS('http://www.w3.org/2000/svg','foreignObject');
      host.setAttribute('x','4');host.setAttribute('y',String(Math.max(4,(p.h-36)/2)));host.setAttribute('width',String(Math.max(40,p.w-8)));host.setAttribute('height','36');
      input=document.createElementNS('http://www.w3.org/1999/xhtml','input');input.type='text';
    }else{
      host=document.createElement('div');input=document.createElement('textarea');input.rows=2;input.spellcheck=true;
      original=document.createElement('div');original.hidden=true;
      // Leave structured child bullets in place; only this point's own text is
      // replaced by the draft. Their metadata and source subtree never change.
      Array.from(el.childNodes).forEach(function(child){if(!(child.nodeType===1 && child.matches('ul.sec-bullets')))original.appendChild(child);});
      el.prepend(original);
    }
    host.setAttribute('class','dv-inline-editor'+(node?' dv-inline-node-editor':''));
    input.className='dv-inline-input';input.value=c.text;
    input.setAttribute('aria-label',node?'New node title':'Edit section text');
    input.setAttribute('aria-description',node?'Enter or click outside saves. Escape cancels. Later changes use Inspect.':help);
    host.appendChild(input);
    var preview=null;
    if(!node){
      var hint=document.createElement('div');hint.className='dv-inline-hint';hint.textContent='Markdown · Ctrl/⌘+Enter saves · Esc cancels';host.appendChild(hint);
      preview=document.createElement('div');preview.className='dv-inline-preview';preview.setAttribute('role','region');preview.setAttribute('aria-label','Live Markdown preview');host.appendChild(preview);
    }
    var error=document.createElement('span');error.setAttribute('role','status');host.appendChild(error);
    if(node)el.appendChild(host);else el.insertBefore(host,original.nextSibling);
    el.classList.add('dv-inline-editing');
    var editing=createWorkbenchLifetime();active={c:c,input:input,host:host,original:original,preview:preview,error:error,life:editing,composing:false};
    ['pointerdown','mousedown','click','dblclick'].forEach(function(type){editing.listen(host,type,function(e){e.stopPropagation();if(e.target.closest('a')){e.preventDefault();if(type==='click' && active){active.input.focus();active.input.scrollIntoView({block:'nearest',inline:'nearest'});}}});});
    editing.listen(input,'input',paint);
    editing.listen(input,'compositionstart',function(){if(active)active.composing=true;});
    editing.listen(input,'compositionend',function(){if(active){active.composing=false;paint();}});
    paint();input.focus({preventScroll:true});if(node || selectAll)input.select();else input.setSelectionRange(input.value.length,input.value.length);
  }
  function decorate(){
    view.querySelectorAll(proseSelector).forEach(function(el){
      if(el.closest('[data-dv-detail-preview]'))return;
      el.setAttribute('tabindex','0');el.setAttribute('aria-description','Double-click or press Enter to edit section text.');el.setAttribute('aria-keyshortcuts','Enter');
      el.title='Double-click or press Enter to edit text; single-click to inspect.';
    });
  }
  life.listen(document,'keydown',function(e){
    if(!inside(e.target))return;
    e.stopImmediatePropagation();if(e.isComposing || active.composing || e.keyCode===229)return;
    if(e.key==='Escape'){e.preventDefault();finish(false,true);}
    else if(e.key==='Enter' && (active.c.target.kind==='node' || e.ctrlKey || e.metaKey)){e.preventDefault();finish(true,true);}
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
    var el=e.target.closest(proseSelector);if(el){e.preventDefault();e.stopPropagation();open(el);}
  },true);
  life.listen(view,'keydown',function(e){if(e.target.matches(proseSelector) && e.key==='Enter' && !e.isComposing){e.preventDefault();e.stopImmediatePropagation();open(e.target);}},true);
  life.listen(opts.src,'input',clear);life.listen(view,'dv:pathchange',clear);
  return {open:open,clear:clear,decorate:decorate,refresh:function(){if(active && !fresh(active.c))clear();decorate();},destroy:function(){clear();life.destroy();}};
}
