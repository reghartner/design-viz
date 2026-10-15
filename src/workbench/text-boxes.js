/* Native text editing and resize chrome, owned by the builder interactions. */
function createTextBoxEditor(opts){
  var life=createWorkbenchLifetime(),document=opts.document,view=opts.view,active=null,handle=null,gesture=null;
  function context(el){
    if(!el || !el.isConnected || !el.matches('[data-dv-text-box]') || el.closest('[data-dv-detail-preview]') || opts.disabled())return null;
    var snapshot=opts.session.snapshot(),sec=el.closest('.doc-sec');
    if(snapshot.error || !sec || snapshot.renderedText!=null && snapshot.renderedText!==snapshot.text)return null;
    var section=Number(sec.getAttribute('data-dv-section')),id=el.getAttribute('data-dv-node');
    var got=builderDiagram(snapshot.text,snapshot.raw,section);if(got.error)return null;
    var node=got.d.nodes[id];if(!isTextBoxNode(node))return null;
    return {snapshot:snapshot,section:section,id:id,node:node,p:layout(got.d).pos[id],el:el,svg:el.ownerSVGElement};
  }
  function fresh(c){var now=opts.session.snapshot();return c.el.isConnected && now.project===c.snapshot.project && now.text===c.snapshot.text;}
  function svg(tag,attrs){var el=document.createElementNS('http://www.w3.org/2000/svg',tag);Object.keys(attrs).forEach(function(k){el.setAttribute(k,attrs[k]);});return el;}
  var toolbar=null,toolbarLife=null,selected=null;
  var help='Whole text box formatting. Enter adds a line; Ctrl/Command+Enter saves text and formatting; Escape cancels; clicking outside saves.';
  function removeToolbar(){
    if(toolbarLife)toolbarLife.destroy();toolbarLife=null;
    if(toolbar)toolbar.remove();toolbar=null;selected=null;
  }
  function cancel(){
    if(active){var a=active;active=null;a.life.destroy();a.host.remove();a.c.el.classList.remove('dv-text-editing');syncToolbar();}
    if(gesture){gesture.ghost.remove();gesture=null;}
  }
  function clear(){cancel();removeToolbar();if(handle)handle.remove();handle=null;}
  function showError(message){var status=toolbar && toolbar.querySelector('[role="status"]');if(status){status.textContent=message || '';status.hidden=!message;}}
  function focusNode(c){
    var section=view.querySelector('.doc-sec[data-dv-section="'+c.section+'"]'),node=section && Array.from(section.querySelectorAll('[data-dv-node]')).find(function(el){return el.getAttribute('data-dv-node')===c.id;});
    if(node)node.focus({preventScroll:true});
  }
  function finish(save,focus,nextTarget){
    if(!active)return;var a=active,c=a.c,valid=fresh(c),changes={},plan;
    if(a.input.value!==c.node.text)changes.text=a.input.value;
    if(JSON.stringify(a.style)!==JSON.stringify(c.node.textStyle || {}))changes.textStyle=a.style;
    if(save && valid && Object.keys(changes).length){
      plan=planEditTextBox(c.snapshot.text,c.snapshot.raw,c.section,c.id,changes);
      if(plan.error){showError(plan.error);return false;}
    }
    cancel();if(plan)opts.commit(plan,c.snapshot,c.section,c.id,nextTarget);else if(valid)showToolbar(c);
    if(focus && valid)focusNode(c);
  }
  function inside(target){return !!(target && (active && active.host.contains(target) || toolbar && toolbar.contains(target)));}
  function paintInput(){
    if(!active)return;var s=textBoxStyle({textStyle:active.style}),input=active.input;
    input.style.fontFamily=s.fontFamily;input.style.fontSize=s.fontSize+'px';input.style.fontWeight=s.bold?'700':'400';input.style.fontStyle=s.italic?'italic':'normal';
  }
  function format(key,value){
    var c=active?active.c:selected;if(!c || !fresh(c) || opts.disabled()){clear();return;}
    var style=Object.assign({},active?active.style:c.node.textStyle,{[key]:value});
    var plan=planEditTextBox(c.snapshot.text,c.snapshot.raw,c.section,c.id,{text:active?active.input.value:c.node.text,textStyle:style});
    if(plan.error){showError(plan.error);return false;}
    showError('');
    if(active){active.style=style;paintInput();syncToolbar();}
    else opts.commit(plan,c.snapshot,c.section,c.id);
    return true;
  }
  function syncToolbar(){
    if(!toolbar || !selected)return;var s=textBoxStyle({textStyle:active?active.style:selected.node.textStyle});
    toolbar.querySelector('select').value=s.fontFamily;toolbar.querySelector('input').value=s.fontSize;
    toolbar.querySelector('.dv-text-toolbar-help').textContent=active?'Esc cancels · ⌘/Ctrl+Enter saves':'Double-click text to type';
    ['bold','italic'].forEach(function(key){toolbar.querySelector('[data-format="'+key+'"]').setAttribute('aria-pressed',String(s[key]));});
  }
  function showToolbar(c){
    removeToolbar();selected=c;toolbarLife=createWorkbenchLifetime();
    var bar=document.createElement('div');bar.className='dv-text-toolbar';bar.setAttribute('role','toolbar');bar.setAttribute('aria-label','Text formatting');bar.setAttribute('aria-description',help);toolbar=bar;
    var font=document.createElement('select');font.setAttribute('aria-label','Font');font.title='Font family';
    TEXT_BOX_FONTS.forEach(function(name){var option=document.createElement('option');option.value=name;option.textContent=name;font.appendChild(option);});
    var size=document.createElement('input');size.type='number';size.min=8;size.max=160;size.step='any';size.setAttribute('aria-label','Font size');size.title='Font size (8–160)';
    bar.append(font,size);
    function returnToText(){if(active)active.input.focus({preventScroll:true});}
    toolbarLife.listen(font,'change',function(){if(format('fontFamily',font.value))returnToText();});
    toolbarLife.listen(size,'change',function(){format('fontSize',Number(size.value));});
    ['bold','italic'].forEach(function(key){
      var button=document.createElement('button');button.type='button';button.dataset.format=key;button.textContent=key==='bold'?'B':'I';button.setAttribute('aria-label',key==='bold'?'Bold':'Italic');button.title=key==='bold'?'Bold':'Italic';bar.appendChild(button);
      toolbarLife.listen(button,'mousedown',function(e){if(active)e.preventDefault();});
      toolbarLife.listen(button,'click',function(){var s=textBoxStyle({textStyle:active?active.style:c.node.textStyle});format(key,!s[key]);returnToText();});
    });
    var hint=document.createElement('span');hint.className='dv-text-toolbar-help';hint.textContent='Esc cancels · ⌘/Ctrl+Enter saves';hint.title=help;bar.appendChild(hint);
    var error=document.createElement('span');error.className='dv-text-toolbar-error';error.setAttribute('role','status');error.hidden=true;bar.appendChild(error);
    ['pointerdown','mousedown','click','dblclick'].forEach(function(type){toolbarLife.listen(bar,type,function(e){e.stopPropagation();});});
    toolbarLife.listen(bar,'keydown',function(e){
      e.stopPropagation();if(!active && e.key==='Escape'){e.preventDefault();removeToolbar();focusNode(c);}
      else if(!active && e.key==='Enter' && e.target===size){e.preventDefault();if(format('fontSize',Number(size.value)))focusNode(c);}
    });
    document.body.appendChild(bar);syncToolbar();
    // Screen coordinates keep controls legible when the canvas is zoomed or panned.
    // The frame belongs to this toolbar, and is retired with its DOM/listeners.
    var frame=null;
    function position(){
      // Source/project retirement also clears this owner; avoid parsing JSON on each frame.
      if(!c.el.isConnected || opts.session.text()!==c.snapshot.text || opts.disabled()){clear();return;}
      var r=c.el.querySelector('.text-box-hit').getBoundingClientRect(),surface=c.el.closest('.section-viewport').getBoundingClientRect(),b=bar.getBoundingClientRect();
      var top=Math.max(8,surface.top),bottom=Math.min(opts.window.innerHeight-8,surface.bottom);
      bar.hidden=r.bottom<top || r.top>bottom || r.right<surface.left || r.left>surface.right;
      bar.style.left=Math.max(8,Math.min(r.left,opts.window.innerWidth-b.width-8))+'px';
      bar.style.top=(r.top-b.height-8>=top?r.top-b.height-8:Math.min(r.bottom+8,bottom-b.height))+'px';
      frame=opts.window.requestAnimationFrame(position);
    }
    toolbarLife.own(function(){if(frame!==null)opts.window.cancelAnimationFrame(frame);});position();
  }
  function open(el){
    if(active && active.c.el===el){active.input.focus();return;}
    if(finish(true,false)===false)return;var c=context(el);if(!c)return;opts.pause();
    var s=textBoxStyle(c.node),host=svg('foreignObject',{x:0,y:0,width:c.p.w,height:c.p.h,'class':'dv-text-editor'});
    var input=document.createElementNS('http://www.w3.org/1999/xhtml','textarea');
    input.setAttribute('aria-label','Edit text box');input.setAttribute('aria-description',help);input.maxLength=TEXT_BOX_LIMITS.characters;input.value=c.node.text;input.spellcheck=true;
    input.style.cssText='box-sizing:border-box;width:100%;height:100%;resize:none;margin:0;padding:8px;border:2px solid #2563eb;border-radius:2px;background:var(--dbg,#fff);color:'+(s.color || 'var(--dtext,#202938)')+';text-decoration:'+(s.underline?'underline':'none')+';text-align:'+s.align+';line-height:1.25;';
    host.appendChild(input);el.appendChild(host);el.classList.add('dv-text-editing');
    var editing=createWorkbenchLifetime();active={c:c,host:host,input:input,life:editing,style:Object.assign({},c.node.textStyle),composing:false};paintInput();showToolbar(c);
    ['mousedown','pointerdown','click','dblclick'].forEach(function(type){editing.listen(input,type,function(e){e.stopPropagation();});});
    editing.listen(input,'compositionstart',function(){if(active)active.composing=true;});
    editing.listen(input,'compositionend',function(){if(active)active.composing=false;});
    input.focus();input.select();
  }
  function refresh(el){
    if(handle)handle.remove();handle=null;
    if(active && active.c.el!==el)cancel();
    var c=context(el);if(!c){removeToolbar();return;}
    if(!active)showToolbar(c);
    handle=svg('rect',{x:c.p.w-12,y:c.p.h-12,width:12,height:12,rx:2,'class':'dv-text-resize','aria-hidden':'true'});el.appendChild(handle);
  }
  // Own native editing keys before canvas selection's document-capture handlers.
  // A target listener is too late: Escape there can already have cleared selection.
  life.listen(document,'keydown',function(e){
    if(!active || !inside(e.target))return;
    e.stopImmediatePropagation();if(e.isComposing || active.composing || e.keyCode===229)return;
    if(e.key==='Escape'){e.preventDefault();finish(false,true);}
    else if(e.key==='Enter' && (e.ctrlKey || e.metaKey)){e.preventDefault();finish(true,true);}
    else if(e.key==='Enter' && toolbar && toolbar.contains(e.target) && e.target.matches('input')){e.preventDefault();if(format('fontSize',Number(e.target.value)) && active)active.input.focus({preventScroll:true});}
    else if(e.key==='Tab' && e.target===active.input && !e.shiftKey){e.preventDefault();toolbar.querySelector('select').focus();}
  },true);
  life.listen(document,'pointerdown',function(e){
    if(active && !inside(e.target) && finish(true,false,opts.targetFromEvent(e))===false){e.preventDefault();e.stopImmediatePropagation();}
  },true);
  life.listen(document,'focusin',function(e){if(active && !inside(e.target))finish(true,false,opts.targetFromEvent(e));});
  function point(c,e){var m=c.svg.getScreenCTM();if(!m)return null;var p=c.svg.createSVGPoint();p.x=e.clientX;p.y=e.clientY;return p.matrixTransform(m.inverse());}
  life.listen(view,'dblclick',function(e){if(e.target.closest('.dv-text-editor'))return;var el=e.target.closest('[data-dv-text-box]');if(el){e.preventDefault();e.stopPropagation();open(el);}},true);
  life.listen(view,'keydown',function(e){
    if(e.target.matches('[data-dv-text-box]') && e.key==='Enter'){e.preventDefault();e.stopImmediatePropagation();open(e.target);}
  },true);
  life.listen(view,'mousedown',function(e){if(e.target.closest('.dv-text-resize')){e.preventDefault();e.stopPropagation();}},true);
  life.listen(view,'pointerdown',function(e){
    if(e.button!==0 || !e.target.closest('.dv-text-resize'))return;
    var c=context(e.target.closest('[data-dv-text-box]'));if(!c)return;
    e.preventDefault();e.stopPropagation();var start=point(c,e);if(!start)return;
    cancel();var ghost=svg('rect',{x:c.p.cx-c.p.w/2,y:c.p.cy-c.p.h/2,width:c.p.w,height:c.p.h,'class':'dv-text-resize-preview'});c.svg.appendChild(ghost);
    gesture={c:c,start:start,w:c.p.w,h:c.p.h,ghost:ghost};
  },true);
  life.listen(opts.window,'pointermove',function(e){if(!gesture)return;var g=gesture,p=point(g.c,e);if(!p)return;
    g.w=Math.round(clamp(g.c.p.w+p.x-g.start.x,48,2000));g.h=Math.round(clamp(g.c.p.h+p.y-g.start.y,32,2000));
    g.result=textBoxResize(g.c.node,g.c.p,g.w,g.h);
    g.ghost.setAttribute('width',g.result.w);g.ghost.setAttribute('height',g.result.h);
    g.ghost.setAttribute('x',g.result.cx-g.result.w/2);g.ghost.setAttribute('y',g.result.cy-g.result.h/2);
  });
  life.listen(opts.window,'pointerup',function(){
    if(!gesture)return;var g=gesture,c=g.c;cancel();if(!fresh(c) || g.w===c.p.w && g.h===c.p.h)return;
    var next=g.result || textBoxResize(c.node,c.p,g.w,g.h);
    var plan=planEditTextBox(c.snapshot.text,c.snapshot.raw,c.section,c.id,{textStyle:next.style});
    if(!plan.error && c.node.locked!==true)plan=planPlaceFloat(plan.text,JSON.parse(plan.text),c.section,c.id,next.cx,next.cy);
    opts.commit(plan,c.snapshot,c.section,c.id);
  });
  life.listen(opts.window,'pointercancel',function(){if(gesture){gesture.ghost.remove();gesture=null;}});life.listen(opts.window,'blur',cancel);
  life.listen(opts.src,'input',clear);life.listen(view,'dv:pathchange',clear);
  return {refresh:refresh,clear:clear,destroy:function(){clear();life.destroy();}};
}
