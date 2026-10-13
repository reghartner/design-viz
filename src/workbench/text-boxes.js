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
  function cancel(){
    if(active){var a=active;active=null;a.life.destroy();a.host.remove();a.c.el.classList.remove('dv-text-editing');}
    if(gesture){gesture.ghost.remove();gesture=null;}
  }
  function clear(){cancel();if(handle)handle.remove();handle=null;}
  function finish(save,focus){
    if(!active)return;var a=active,value=a.input.value,c=a.c,valid=fresh(c),plan;
    if(save && valid && value!==c.node.text){
      plan=planEditTextBox(c.snapshot.text,c.snapshot.raw,c.section,c.id,{text:value});
      if(plan.error){opts.commit(plan,c.snapshot,c.section,c.id);return false;}
    }
    cancel();if(plan)opts.commit(plan,c.snapshot,c.section,c.id);
    if(focus && valid){var section=view.querySelector('.doc-sec[data-dv-section="'+c.section+'"]'),node=section && Array.from(section.querySelectorAll('[data-dv-node]')).find(function(el){return el.getAttribute('data-dv-node')===c.id;});if(node)node.focus({preventScroll:true});}
  }
  function open(el){
    var c=context(el);if(!c || finish(true,false)===false)return;opts.pause();
    var s=textBoxStyle(c.node),host=svg('foreignObject',{x:0,y:0,width:c.p.w,height:c.p.h,'class':'dv-text-editor'});
    var input=document.createElementNS('http://www.w3.org/1999/xhtml','textarea');
    input.setAttribute('aria-label','Edit text box');input.maxLength=TEXT_BOX_LIMITS.characters;input.value=c.node.text;input.spellcheck=true;
    input.style.cssText='box-sizing:border-box;width:100%;height:100%;resize:none;margin:0;padding:8px;border:2px solid #2563eb;border-radius:2px;background:var(--dbg,#fff);color:'+(s.color || 'var(--dtext,#202938)')+';font-family:'+s.fontFamily+';font-size:'+s.fontSize+'px;font-weight:'+(s.bold?'700':'400')+';font-style:'+(s.italic?'italic':'normal')+';text-decoration:'+(s.underline?'underline':'none')+';text-align:'+s.align+';line-height:1.25;';
    host.appendChild(input);el.appendChild(host);el.classList.add('dv-text-editing');
    var editing=createWorkbenchLifetime();active={c:c,host:host,input:input,life:editing};
    ['mousedown','pointerdown','click','dblclick'].forEach(function(type){editing.listen(input,type,function(e){e.stopPropagation();});});
    editing.listen(input,'keydown',function(e){
      e.stopPropagation();if(e.isComposing)return;
      if(e.key==='Escape'){e.preventDefault();finish(false,true);}
      else if(e.key==='Enter' && (e.ctrlKey || e.metaKey)){e.preventDefault();finish(true,true);}
    });
    editing.listen(input,'blur',function(){finish(true,false);});input.focus();input.select();
  }
  function refresh(el){
    if(handle)handle.remove();handle=null;
    var c=context(el);if(!c)return;
    handle=svg('rect',{x:c.p.w-12,y:c.p.h-12,width:12,height:12,rx:2,'class':'dv-text-resize','aria-hidden':'true'});el.appendChild(handle);
  }
  function point(c,e){var m=c.svg.getScreenCTM();if(!m)return null;var p=c.svg.createSVGPoint();p.x=e.clientX;p.y=e.clientY;return p.matrixTransform(m.inverse());}
  life.listen(view,'dblclick',function(e){if(e.target.closest('.dv-text-editor'))return;var el=e.target.closest('[data-dv-text-box]');if(el){e.preventDefault();e.stopPropagation();open(el);}},true);
  life.listen(view,'keydown',function(e){
    if(e.target.matches('[data-dv-text-box]') && e.key==='Enter'){e.preventDefault();e.stopPropagation();open(e.target);}
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
